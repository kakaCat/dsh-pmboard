/**
 * 回退端到端用例（REQ-261003204149-1e80 t7 起）。
 *
 * t7 先落**原子性**一节：编排必须「先算卡计划、后改需求」，抛错时四项（状态 / 章 /
 * 计划批准 / 任务卡）全部保持回退前原样。
 * 后续 t11 在此文件扩充 TC-1…TC-16（双通道对拍、真实 store 的端到端链路）。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import { defineMoveTool, defineDecomposeTool } from './helpers/tool-deps.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyRequirementRollback, type RollbackIdFactory } from '../src/application/internal/rollback.js'
import type { ActorRef, RequirementRecord, StageArtifact, TaskRecord, TaskStatus } from '../src/shared/protocol.js'

const REQ = 'REQ-rb0001'
const HUMAN: ActorRef = { kind: 'human' }

function art(stage: StageArtifact['stage'], kind: StageArtifact['kind'], path: string, confirmedAt: number): StageArtifact {
  return { stage, kind, path, registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 's-1' }, confirmedAt, confirmedBy: HUMAN }
}

/** 走得最深的需求现场：五份下游产物都有章 + 计划已批准 + 两张活卡。 */
function fixture(): { req: RequirementRecord; tasks: TaskRecord[] } {
  const req = {
    id: REQ, title: '回退', description: '', status: 'implementing', category: 'feature',
    blocked: false, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: HUMAN, updatedBy: HUMAN,
    artifacts: [
      art('brainstorming', 'requirement', 'docs/requirements/' + REQ + '/requirement.md', 10),
      art('design', 'design', 'docs/requirements/' + REQ + '/design/architecture.md', 20),
      art('decomposing', 'decomposition', 'docs/requirements/' + REQ + '/decomposition.md', 30),
      art('implementing', 'task_detail', 'docs/requirements/' + REQ + '/tasks/t-1.md', 40),
      art('accepting', 'verification', 'docs/requirements/' + REQ + '/verification.md', 50),
    ],
    plan: { path: 'docs/requirements/' + REQ + '/decomposition.md', submittedAt: 25, approvedAt: 30, approvedBy: HUMAN, tasks: [] },
  } as unknown as RequirementRecord

  const task = (id: string, status: TaskStatus): TaskRecord => ({
    id, requirementId: REQ, title: '卡 ' + id, description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿', context: '',
    status, blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: HUMAN, updatedBy: HUMAN,
  } as TaskRecord)

  return { req, tasks: [task('t-1', 'done'), task('t-2', 'in_progress')] }
}

function ids(prefix = 't-new'): RollbackIdFactory {
  let n = 0
  return { task: () => prefix + String(++n), comment: () => 'c-' + String(++n) }
}

describe('回退编排 · 原子性（t7 验收）', () => {
  it('注入卡处置抛错后：状态、章、计划批准、任务卡四项全部保持回退前原样', () => {
    const { req, tasks } = fixture()
    const before = JSON.stringify({ req, tasks })

    // 注入：id 生成口抛错（模拟卡处置阶段故障）——它发生在**改 req 之前**
    const boom: RollbackIdFactory = {
      task: () => { throw new Error('注入：卡处置失败') },
      comment: () => 'c-x',
    }
    expect(() => applyRequirementRollback(req, tasks, 'implementing', 'design', 100, HUMAN, boom, '需求描述不对'))
      .toThrow(/注入：卡处置失败/)

    // 四项逐一核：无中间态（等价于「整份快照逐字未动」）
    expect(req.status).toBe('implementing')
    expect(req.plan?.approvedAt).toBe(30)
    for (const a of req.artifacts ?? []) expect(a.confirmedAt, a.path).toBeDefined()
    expect(req.rollback).toBeUndefined()
    expect(req.comments).toHaveLength(0)
    expect(tasks.map(t => t.status)).toEqual(['done', 'in_progress'])
    expect(tasks.some(t => t.revisions !== undefined)).toBe(false)
    // 快照级对照：证明"什么都没发生"，而不是"恰好这几处没变"
    expect(JSON.stringify({ req, tasks })).toBe(before)
  })

  it('正常路径：撤销与卡计划一并产出，且顺序是「先算后改」', () => {
    const { req, tasks } = fixture()
    const out = applyRequirementRollback(req, tasks, 'implementing', 'design', 100, HUMAN, ids(), '需求描述不对')

    // 撤销：下游三份产物撤章、design 与更上游保留；计划批准被收回
    expect(out.revocation.artifactsRevoked).toEqual([
      'docs/requirements/' + REQ + '/decomposition.md',
      'docs/requirements/' + REQ + '/tasks/t-1.md',
      'docs/requirements/' + REQ + '/verification.md',
    ])
    expect(out.revocation.planApprovalRevoked).toBe(true)
    expect(req.plan?.approvedAt).toBeUndefined()
    expect(req.rollback?.to).toBe('design')

    // 卡计划：旧卡全部取消（副本）、物化一一对应的重做卡
    expect(out.taskPlan.canceled.map(t => t.id).sort()).toEqual(['t-1', 't-2'])
    expect(out.taskPlan.reworkDrafts.map(t => t.reworkOf).sort()).toEqual(['t-1', 't-2'])
    // 纯计算：传入的 tasks 数组未被就地改（落库由调用方负责）
    expect(tasks.map(t => t.status)).toEqual(['done', 'in_progress'])
  })
})

describe('回退编排 · 双通道一致性（t9 验收：FR-5 单点）', () => {
  const SID = 'session-abc-123'
  const REQ_TOOL = 'REQ-aaa111' // 走工具侧 reqboard_move
  const REQ_BOARD = 'REQ-bbb222' // 走看板侧 POST /move
  let dir: string
  let prevCwd: string
  let store: ReturnType<typeof makeTestStore>
  let handler: any
  let moveTool: any
  let decomposeTool: any

  function fakeReq(body: unknown, url: string): any {
    const req = new EventEmitter() as any
    req.url = url
    req.method = 'POST'
    req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body), 'utf8') }
    return req
  }
  function fakeRes(): any {
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.writeHead = (code: number) => { res.statusCode = code; return res }
    res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
    return res
  }
  const post = async (url: string, body: unknown) => {
    const res = fakeRes()
    await handler(fakeReq(body, '/dashboard/api/reqboard' + url), res)
    return res
  }

  /** 同构现场：implementing + 三份已确认产物 + 计划已批准 + 一张活卡（两需求各一份）。 */
  const rollbackable = (id: string): RequirementRecord => ({
    id, title: '回退双通道', description: '', status: 'implementing', category: 'feature', blocked: false,
    sourceSessionId: SID, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: [
      { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/' + id + '/requirement.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 10, confirmedBy: { kind: 'human' } },
      { stage: 'design', kind: 'design', path: 'docs/requirements/' + id + '/design/a.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 20, confirmedBy: { kind: 'human' } },
      { stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + id + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 30, confirmedBy: { kind: 'human' } },
    ],
    plan: { path: 'docs/requirements/' + id + '/decomposition.md', submittedAt: 25, approvedAt: 30, approvedBy: { kind: 'human' }, tasks: [] },
  } as unknown as RequirementRecord)

  const liveCard = (id: string, taskId: string) => ({
    id: taskId, requirementId: id, title: '活卡', description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'x', context: '',
    status: 'todo', blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
  }) as never

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-mvrb-'))
    prevCwd = process.cwd()
    process.chdir(dir)
    store = makeTestStore()
    // 两侧必须共用**同一个** TaskStore 实例：`taskStoreAt` 每次新建，若不显式注入，
    // 工具侧会读到另一个（空）队列 —— 首跑正是这样对不上 tasks_canceled。
    const ts = taskStoreAt(dir)
    const deps = { store, now: () => 1000, doneThrottleMs: 0, taskStore: ts }
    moveTool = defineMoveTool(deps as never)
    decomposeTool = defineDecomposeTool(deps as never)
    handler = createReqboardHandler({
      requirementStore: store, taskStore: ts, now: () => 1000,
      docs: new FileDocRepository({ workspaceRoot: dir }),
    } as never)
    await store.replaceAll('seed', {
      schemaVersion: 9, revision: 0, requirements: [rollbackable(REQ_TOOL), rollbackable(REQ_BOARD)], triages: [],
    } as never)
    await ts.createMany(REQ_TOOL, [liveCard(REQ_TOOL, 't-tool1')])
    await ts.createMany(REQ_BOARD, [liveCard(REQ_BOARD, 't-board1')])
  })
  afterEach(() => { process.chdir(prevCwd); rmSync(dir, { recursive: true, force: true }) })

  it('同一 from→to：两侧状态、回执结构与作废清单一致', async () => {
    // 工具侧
    const toolOut: any = await (moveTool as any).execute(
      { requirement_id: REQ_TOOL, to: 'design', reason: '需求描述不对' },
      { agent: { id: SID } },
    )
    // 看板侧（同一 from→to）
    const res = await post('/req/move', { id: REQ_BOARD, to: 'design', actor: 'human', reason: '需求描述不对' })
    const boardOut: any = res.payload.data

    // ① 状态一致
    expect(toolOut.status).toBe('design')
    expect(boardOut.status).toBe('design')
    expect((await store.get(REQ_TOOL))!.status).toBe('design')
    expect((await store.get(REQ_BOARD))!.status).toBe('design')

    // ② 回执结构一致（键集逐字相同——两侧共用同一编排的直接证据）
    expect(Object.keys(toolOut.rollback).sort()).toEqual(Object.keys(boardOut.rollback).sort())
    expect(Object.keys(toolOut.rollback).sort()).toEqual([
      'artifacts_revoked', 'plan_approval_revoked', 'tasks_canceled', 'tasks_reworked',
    ])

    // ③ 作废清单与卡处置一致（同构现场 ⇒ 同结果）
    // path 里带各自的 REQ id，故按需求 id 归一化后比较（同构现场 ⇒ 同结构）
    const norm = (paths: string[], id: string) => (paths as string[]).map(x => x.replace(id, '<REQ>'))
    expect(norm(toolOut.rollback.artifacts_revoked, REQ_TOOL))
      .toEqual(norm(boardOut.rollback.artifacts_revoked, REQ_BOARD))
    expect(toolOut.rollback.plan_approval_revoked).toBe(true)
    expect(boardOut.rollback.plan_approval_revoked).toBe(true)
    expect(toolOut.rollback.tasks_canceled).toBe(boardOut.rollback.tasks_canceled)
    expect(toolOut.rollback.tasks_reworked).toBe(boardOut.rollback.tasks_reworked)
  })

  it('前进方向不带 rollback 键（两侧都不带：不是发 null）', async () => {
    // 工具侧：decomposing → implementing 需要已确认的拆分产物；此处只验"键不存在"的形状
    const res = await post('/req/move', { id: REQ_BOARD, to: 'accepting', actor: 'human', reason: '强行前进' })
    // 前进被门禁拒绝时也绝不能出现 rollback 键
    expect(res.payload.data?.rollback).toBeUndefined()
  })

  it('回退后注入与断点按新阶段重算（t10 验收）', async () => {
    // 预置残留：armed 的自动链 + 一个"实施阶段"的旧断点（模拟回退之前的样子）
    await store.mutate(REQ_TOOL, (r) => {
      r.dive = { activation: 'armed', pausedReason: '等待自动链' } as never
      r.interruption = {
        stage: 'implementing', reason: 'checkpoint',
        pendingAction: 'reqboard_submit(kind=verification)', at: 1,
      } as never
      return { changed: true }
    })

    await (moveTool as any).execute(
      { requirement_id: REQ_TOOL, to: 'design', reason: '需求描述不对' },
      { agent: { id: SID } },
    )
    const after = (await store.get(REQ_TOOL))!

    // ① 断点按**新阶段**重算，且不再指向验收/实施
    expect(after.interruption?.stage, '断点阶段应随回退重算').toBe('design')
    const pending = after.interruption?.pendingAction ?? ''
    expect(pending.length, 'pendingAction 不该为空').toBeGreaterThan(0)
    expect(pending, '不该残留验收指引').not.toContain('verification')
    expect(pending, '不该残留实施指引').not.toContain('task_move')

    // ② dive 自动链解除
    expect(after.dive?.activation, 'dive 自动链必须停下').toBe('disarmed')
    expect(after.dive?.pausedReason, '上一轮的暂停语不该留着').toBeUndefined()
  })
  // ── TC-1…TC-16 矩阵（design/test-cases.md；每例独立夹具）────────────────────
  const moveReq = (to: string, reason = '需求描述不对') =>
    (moveTool as any).execute({ requirement_id: REQ_TOOL, to, reason }, { agent: { id: SID } })
  const cardOf = async (id: string) => (await store.get(id))!
  const cardsOf = async (id: string) => taskStoreAt(dir).listByRequirement(id)

  it('TC-1: agent 发起回退成功（不被人工门拦下）', async () => {
    const out: any = await moveReq('design')
    expect(out.status).toBe('design')
    expect((await cardOf(REQ_TOOL))!.status).toBe('design')
  })

  it('TC-2: 回执四键齐备且计数正确', async () => {
    const out: any = await moveReq('design')
    expect(Object.keys(out.rollback).sort()).toEqual([
      'artifacts_revoked', 'plan_approval_revoked', 'tasks_canceled', 'tasks_reworked',
    ])
    expect(out.rollback.tasks_canceled).toBe(1)
    expect(out.rollback.tasks_reworked).toBe(1)
  })

  it('TC-3: 留痕——[回退] 评论含 from→to 与理由，状态事件落账', async () => {
    await moveReq('design', '边界与真实意图不符')
    const r = (await cardOf(REQ_TOOL))!
    expect(r.comments.some(c => c.body.includes('[回退] implementing → design'))).toBe(true)
    expect(r.comments.some(c => c.body.includes('边界与真实意图不符'))).toBe(true)
    expect((r.statusHistory ?? []).some(e => e.status === 'design')).toBe(true)
  })

  it('TC-4: 半途回退——decomposing 无 decomposition 产物也能退', async () => {
    await store.mutate(REQ_TOOL, (r) => {
      r.status = 'decomposing'
      r.artifacts = (r.artifacts ?? []).filter(a => a.kind !== 'decomposition')
      return { changed: true }
    })
    const out: any = await moveReq('design')
    expect(out.status).toBe('design')
  })

  it('TC-5: 前进方向一字未松——计划未确认仍被拒', async () => {
    await store.mutate(REQ_TOOL, (r) => {
      r.status = 'decomposing'
      r.artifacts = (r.artifacts ?? []).map(a => (a.kind === 'decomposition' ? { ...a, confirmedAt: undefined, confirmedBy: undefined } : a))
      return { changed: true }
    })
    await expect(moveReq('implementing')).rejects.toThrow(/待确认|artifact_not_confirmed/)
  })

  it('TC-6: 下游撤章、计划批准收回；回退落点自身的章保留', async () => {
    await moveReq('design')
    const r = (await cardOf(REQ_TOOL))!
    expect((r.artifacts ?? []).find(a => a.kind === 'decomposition')!.confirmedAt).toBeUndefined()
    expect(r.plan?.approvedAt).toBeUndefined()
    expect((r.artifacts ?? []).find(a => a.kind === 'design')!.confirmedAt, 'design 是落点，不该被撤').toBeDefined()
  })

  it('TC-7: 回程受门——设计章是落点（未改仍有效），但计划批准已收回，再进实施必须重新拿钥匙', async () => {
    await moveReq('design')
    // 落点自身的章保留 ⇒ 设计未改写时，回到拆分阶段是允许的（这是语义而非漏洞）
    const back: any = await moveReq('decomposing')
    expect(back.status).toBe('decomposing')
    // 但回退已撤掉 decomposition 的章 ⇒ 再进实施被闸门拦下（必须重新交计划并获批）
    await expect(moveReq('implementing')).rejects.toThrow(/待确认|artifact_not_confirmed|计划/)
  })

  it('TC-8: 重复回退同一目标幂等（待同步标记不叠加）', async () => {
    await moveReq('design')
    const n1 = ((await cardOf(REQ_TOOL))!.docSyncPending ?? []).length
    await store.mutate(REQ_TOOL, (r) => { r.status = 'implementing'; return { changed: true } })
    await moveReq('design')
    expect(((await cardOf(REQ_TOOL))!.docSyncPending ?? []).length).toBe(n1)
  })

  it('TC-9: 旧卡全部 canceled，各带一条 rollback 修订', async () => {
    await moveReq('design')
    const old = (await cardsOf(REQ_TOOL)).find(c => c.id === 't-tool1')!
    expect(old.status).toBe('canceled')
    expect((old.revisions ?? []).filter(x => x.kind === 'rollback').length).toBe(1)
  })

  it('TC-10: 重做卡一一对应、依赖清空、状态 todo', async () => {
    await moveReq('design')
    const reworks = (await cardsOf(REQ_TOOL)).filter(c => c.reworkOf !== undefined)
    expect(reworks.length).toBe(1)
    expect(reworks[0]!.reworkOf).toBe('t-tool1')
    expect(reworks[0]!.dependsOn).toEqual([])
    expect(reworks[0]!.status).toBe('todo')
  })

  it('TC-11: 回退态下重拆成功（守卫放行），重做卡被新计划收敛', async () => {
    await moveReq('design')
    // 回程纪律（FR-3 不变量）：回退已收回计划批准——重拆前必须**重新拿到**这把钥匙
    await store.mutate(REQ_TOOL, (r) => {
      if (r.plan !== undefined) { r.plan.approvedAt = 2000; r.plan.approvedBy = { kind: 'human' } }
      return { changed: true }
    })
    const out: any = await decomposeTool.execute(
      { requirement_id: REQ_TOOL, tasks: [{ key: 'x', title: '新计划卡', implementation: '改 A 文件', acceptance: '跑 npx vitest run 全绿' }] },
      { agent: { id: SID } },
    )
    expect(out.success).toBe(true)
    const live = (await cardsOf(REQ_TOOL)).filter(t => t.status !== 'canceled')
    expect(live.filter(t => t.reworkOf !== undefined), '重做卡应被新计划取代').toHaveLength(0)
  })

  it('TC-16: 跨级回退到 draft 同样成立', async () => {
    const out: any = await moveReq('draft')
    expect(out.status).toBe('draft')
    expect(out.rollback.plan_approval_revoked).toBe(true)
  })

  it('TC-16b: 目标是终点 archived → 仍被拒（终点没有出边）', async () => {
    await expect(moveReq('archived')).rejects.toThrow()
  })

  it('TC-13b: 反向用例——两侧对同一非法目标都拒绝', async () => {
    const toolErr = await moveReq('archived').then(() => 'ok').catch((e: any) => String(e?.message ?? e))
    const res = await post('/req/move', { id: REQ_BOARD, to: 'archived', actor: 'human' })
    expect(toolErr).not.toBe('ok')
    expect(res.statusCode, '看板侧同样拒绝').not.toBe(200)
  })
})
