// serves: FR-3
/**
 * 取消留痕写侧（REQ-261005193546-1b1a t3 / FR-3）。
 *
 * 契约（design/data-model.md §1/§7 + backend.md §取消留痕写侧）：
 *  - 三字段 `canceledAt` / `canceledBy` / `cancelReason` 是**加性可选**、语义 = **最近一次取消（覆盖式）**；
 *  - 唯一写入口 `markCanceled`；四个取消写入点共用（`transitionTask` + 三个批量直写点）；
 *  - 四条形态：人工取消三键齐（无会话**不写** `sessionId` 键）/ **非人工不写 `canceledBy`**（不许 `kind:'agent'`）/
 *    `reason` 纯空白**不写** `cancelReason` / 复活（`canceled → todo`）**不清空**；
 *  - 与 `statusHistory` 那条 `→canceled` 事件**同源同刻**（同一个 `at`、同一条 `reason`）；
 *  - 批量路径**整批**有值（同批同一 `at`），且端到端**真的落进队列**（不是只在 plan 副本上）。
 *
 * ⚠️ 夹具一律走 tests/application/harness（内存队列仓储，JSON 往返 + 真实校验），
 * 不写真实工作区。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { markCanceled, type ActorRef, type RequirementRecord, type TaskRecord } from '../src/shared/protocol.js'
import { transitionTask } from '../src/application/internal/task-transition.js'
import { planRollbackTasks, type TaskIdFactory } from '../src/application/internal/rollback-tasks.js'
import { planRollbackCleanup } from '../src/application/internal/rollback-cleanup.js'
import { cancelStaleReworkCards, STALE_REWORK_REASON } from '../src/application/internal/stale-rework.js'
import { executeMoveRequirement } from '../src/application/use-cases/MoveRequirement.js'
import { executeRollbackCleanup } from '../src/application/use-cases/RollbackCleanup.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { makeHarness, makeTestStore, req, task } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'

const REQ_ID = 'REQ-000001'
const W = 'session-w-001'
const HUMAN: ActorRef = { kind: 'human' }
const HUMAN_WIN: ActorRef = { kind: 'human', sessionId: W }
const AGENT: ActorRef = { kind: 'agent', sessionId: W }
const T0 = 1_759_700_000_000

/** 抑制并记录 `markCanceled` 在非人工路径上的 console.warn（断言"确实告警了"）。 */
function silenceWarn() {
  const spy = vi.spyOn(console, 'warn')
  spy.mockImplementation((): void => undefined)
  return spy
}
afterEach(() => {
  vi.restoreAllMocks()
})

/** 确定 id 生成器（不用随机数，断言才能一一对应）。 */
function ids(prefix = 't-new'): TaskIdFactory {
  let n = 0
  return { task: () => prefix + String(++n) }
}

const reqOf = (id: string): RequirementRecord => ({ id } as RequirementRecord)

// ---------------------------------------------------------------------------
// ① markCanceled：写侧四条形态
// ---------------------------------------------------------------------------

describe('markCanceled · 写侧四条形态（FR-3）', () => {
  it('人工取消（带会话）：三键齐，值与入参逐字一致', () => {
    const t = task()
    markCanceled(t, { at: T0, by: HUMAN_WIN, reason: '被新计划取代' })
    expect(t.canceledAt).toBe(T0)
    expect(t.canceledBy).toEqual({ kind: 'human', sessionId: W })
    expect(t.cancelReason).toBe('被新计划取代')
    // 不写 null（`null` 与「未采集」是两态）
    expect(JSON.stringify(t)).not.toContain('"canceledAt":null')
  })

  it('人工取消（无会话）：`sessionId` 键**不存在**（不写空串）', () => {
    const t = task()
    markCanceled(t, { at: 7, by: HUMAN })
    expect(t.canceledBy).toEqual({ kind: 'human' })
    expect('sessionId' in (t.canceledBy as object), '无会话时不得写 sessionId 键').toBe(false)
  })

  it('非人工路径（agent / system）：**整字段不写** canceledBy，且 console.warn 留痕', () => {
    const warn = silenceWarn()
    for (const by of [AGENT, { kind: 'system' } as ActorRef]) {
      const t = task()
      markCanceled(t, { at: 11, by, reason: '批量取消' })
      expect(t.canceledAt, by.kind).toBe(11)
      expect('canceledBy' in t, by.kind + '：非人不得写 canceledBy').toBe(false)
      // 不许出现替身值（"agent 取消"在类型上就不合法）
      expect(JSON.stringify(t)).not.toContain('"canceledBy"')
    }
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('reason 纯空白（或未传）：不写 cancelReason（不写空串）', () => {
    const blank = task()
    markCanceled(blank, { at: 1, by: HUMAN, reason: '   ' })
    expect('cancelReason' in blank).toBe(false)

    const absent = task()
    markCanceled(absent, { at: 1, by: HUMAN })
    expect('cancelReason' in absent).toBe(false)
    expect(JSON.stringify(absent)).not.toContain('"cancelReason"')
  })

  it('超长原文逐字写入、不被截断（无硬上限）', () => {
    const long = 'x'.repeat(3000) + '【末尾标记】'
    const t = task()
    markCanceled(t, { at: 1, by: HUMAN, reason: long })
    expect(t.cancelReason).toBe(long)
    expect(t.cancelReason!.length).toBe(long.length)
  })

  it('就地写：不返回新对象、不追加数组、不碰 status/version（无 IO）', () => {
    const t = task()
    const before = { status: t.status, version: t.version, updatedAt: t.updatedAt }
    const plain = structuredClone(t)
    const returned = markCanceled(plain, { at: 3, by: HUMAN_WIN, reason: 'r' })
    expect(returned, 'markCanceled 返回 void（就地写）').toBeUndefined()
    expect({ status: t.status, version: t.version, updatedAt: t.updatedAt }).toEqual(before)
    expect(plain.canceledAt).toBe(3)
    expect(Array.isArray(plain.cancelReason)).toBe(false)
  })

  it('覆盖式（幂等）：重复调用覆盖同一批值，第二次为新值', () => {
    const t = task()
    markCanceled(t, { at: 100, by: HUMAN, reason: '第一次' })
    markCanceled(t, { at: 200, by: { kind: 'human', sessionId: 'session-b' }, reason: '第二次' })
    expect(t.canceledAt).toBe(200)
    expect(t.canceledBy).toEqual({ kind: 'human', sessionId: 'session-b' })
    expect(t.cancelReason).toBe('第二次')
  })
})

// ---------------------------------------------------------------------------
// ② transitionTask：与 statusHistory 同源同刻 + 复活不清空
// ---------------------------------------------------------------------------

describe('transitionTask · 取消留痕与 statusHistory 同源同刻（FR-3）', () => {
  it('人工取消：canceledAt === 那条 →canceled 事件的 at，cancelReason === 事件 reason', () => {
    const t = task()
    transitionTask(t, 'canceled', { at: T0, actor: HUMAN, reason: '被新计划取代' })
    const ev = t.statusHistory!.at(-1)!
    expect(ev.status).toBe('canceled')
    expect(t.canceledAt).toBe(ev.at)
    expect(t.canceledBy).toEqual({ kind: 'human' })
    expect(t.cancelReason).toBe(ev.reason)
  })

  it('人工取消（带会话）：canceledBy 与事件 by 同源', () => {
    const t = task()
    transitionTask(t, 'canceled', { at: 42, actor: HUMAN_WIN })
    expect(t.statusHistory!.at(-1)!.by).toEqual(HUMAN_WIN)
    expect(t.canceledBy).toEqual({ kind: 'human', sessionId: W })
  })

  it('agent 取消：human_gate 抛错且**三字段全缺**（零副作用，含留痕）', () => {
    const t = task()
    const snap = structuredClone(t)
    expect(() => transitionTask(t, 'canceled', { at: 9, actor: AGENT, reason: '越权' })).toThrow()
    expect(t).toEqual(snap)
    expect('canceledAt' in t).toBe(false)
    expect('canceledBy' in t).toBe(false)
    expect('cancelReason' in t).toBe(false)
  })

  it('逃生舱（迁移/回填）走 system 进 canceled：不写 canceledBy（真非人工路径）', () => {
    const warn = silenceWarn()
    const t = task()
    transitionTask(t, 'canceled', { at: 5, actor: { kind: 'system' }, allowIllegalTransition: true })
    expect(t.canceledAt).toBe(5)
    expect('canceledBy' in t).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('复活（canceled → todo）**不清空**三字段；再取消则覆盖为最新一次', () => {
    const t = task()
    transitionTask(t, 'canceled', { at: 100, actor: HUMAN, reason: '第一次取消' })
    transitionTask(t, 'todo', { at: 200, actor: HUMAN, reason: '复活' })
    expect(t.status).toBe('todo')
    expect(t.canceledAt, '复活不清空（INV-D2）').toBe(100)
    expect(t.canceledBy).toEqual({ kind: 'human' })
    expect(t.cancelReason).toBe('第一次取消')

    transitionTask(t, 'canceled', { at: 300, actor: { kind: 'human', sessionId: 'session-b' }, reason: '第二次取消' })
    expect(t.canceledAt, '三字段 = 最近一次取消（覆盖式）').toBe(300)
    expect(t.canceledBy).toEqual({ kind: 'human', sessionId: 'session-b' })
    expect(t.cancelReason).toBe('第二次取消')
    // 首次取消不可追（字段是查询面）：历史只在 statusHistory 里
    expect(t.statusHistory!.filter(e => e.status === 'canceled').map(e => e.at)).toEqual([100, 300])
  })
})

// ---------------------------------------------------------------------------
// ③ 三个批量直写点：整批同源有值
// ---------------------------------------------------------------------------

/** 回退夹具：1 张顶层父卡 + 1 张子卡 + 1 张占位重做卡。 */
function rollbackFixture(): TaskRecord[] {
  return [
    task({ id: 't-top', requirementId: REQ_ID, title: '顶层卡', status: 'done' }),
    task({ id: 't-sub', requirementId: REQ_ID, title: '子卡', parentId: 't-top', stageKind: 'dev', status: 'in_progress' }),
    task({ id: 't-ph', requirementId: REQ_ID, title: '[重做] 顶层卡', status: 'todo', reworkOf: 't-old' }),
  ]
}

describe('批量取消 · plan 层整批有值（FR-3）', () => {
  it('planRollbackTasks（人工触发）：整批同一 at/reason/by，且与 rollback 修订同源', () => {
    const plan = planRollbackTasks(reqOf(REQ_ID), rollbackFixture(), 'design', 500, HUMAN_WIN, ids(), '需求级回退：边界不符')
    expect(plan.canceled.map(c => c.id).sort()).toEqual(['t-ph', 't-top'])
    for (const c of plan.canceled) {
      expect(c.canceledAt, c.id).toBe(500)
      expect(c.canceledBy, c.id).toEqual({ kind: 'human', sessionId: W })
      expect(c.cancelReason, c.id).toBe('需求级回退：边界不符')
      const rev = c.revisions!.at(-1)!
      expect(rev.kind).toBe('rollback')
      expect(c.canceledAt, c.id + '：与修订同源同刻').toBe(rev.at)
      expect(c.cancelReason, c.id + '：与修订同一条理由').toBe(rev.reason)
    }
    // 整批同一时钟值（同批同值）
    expect(new Set(plan.canceled.map(c => c.canceledAt)).size).toBe(1)
    // 子卡走「原地复位」分支 ⇒ **不写**三字段（复位 ≠ 取消）
    expect(plan.resetTasks.map(r => r.id)).toEqual(['t-sub'])
    for (const r of plan.resetTasks) {
      expect('canceledAt' in r, r.id).toBe(false)
      expect('canceledBy' in r, r.id).toBe(false)
      expect('cancelReason' in r, r.id).toBe(false)
    }
  })

  it('planRollbackTasks（agent 触发回退）：有 canceledAt/reason，但**无** canceledBy', () => {
    const warn = silenceWarn()
    const plan = planRollbackTasks(reqOf(REQ_ID), rollbackFixture(), 'design', 700, AGENT, ids(), '回退重拆')
    expect(plan.canceled.length).toBe(2)
    for (const c of plan.canceled) {
      expect(c.canceledAt).toBe(700)
      expect(c.cancelReason).toBe('回退重拆')
      expect('canceledBy' in c).toBe(false)
    }
    expect(warn).toHaveBeenCalled()
  })

  it('planRollbackCleanup：整批有值，且与那条 rollback 修订同一条理由', () => {
    const tasks = [
      task({ id: 't-p1', requirementId: REQ_ID, title: '[重做] a', status: 'todo', reworkOf: 't-old1' }),
      task({ id: 't-p2', requirementId: REQ_ID, title: '[重做] b', status: 'todo', reworkOf: 't-old2' }),
      task({ id: 't-p3', requirementId: REQ_ID, title: '[重做] done 的', status: 'done', reworkOf: 't-old3' }),
    ]
    const plan = planRollbackCleanup(reqOf(REQ_ID), tasks, 2, 900, HUMAN, ['t-p1', 't-p2', 't-p3'], '范围选错')
    expect(plan.matchedBy).toBe('lastMaterialized')
    expect(plan.canceled.map(c => c.id).sort()).toEqual(['t-p1', 't-p2'])
    for (const c of plan.canceled) {
      expect(c.canceledAt).toBe(900)
      expect(c.canceledBy).toEqual({ kind: 'human' })
      expect(c.cancelReason).toBe(c.revisions!.at(-1)!.reason)
      expect(c.cancelReason).toContain('误物化清场（第 2 次回退：范围选错）')
    }
    // done 卡被跳过 ⇒ 不在 canceled 里（也就不会带上留痕）
    expect(plan.skipped.some(s => s.taskId === 't-p3')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ④ 端到端：三字段真的落进队列（不是只在 plan 副本上）
// ---------------------------------------------------------------------------

describe('批量取消 · 端到端落盘（FR-3，防「plan 写了、白名单丢了」）', () => {
  it('占位卡清理（cancelStaleReworkCards）：落盘的卡有 canceledAt/cancelReason，agent 触发无 canceledBy', async () => {
    const warn = silenceWarn()
    const h = makeHarness()
    h.seedRequirementSync(req({ id: REQ_ID, status: 'decomposing', sourceSessionId: W }))
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      task({ id: 't-p1', requirementId: REQ_ID, title: '[重做] a', status: 'todo', reworkOf: 't-old1' }),
      task({ id: 't-real', requirementId: REQ_ID, title: '真卡', status: 'todo' }),
    ])

    const out = await cancelStaleReworkCards({ deps: h.deps, requirementId: REQ_ID, nowTs: 5000, actor: AGENT })
    expect(out.canceled).toBe(1)

    const landed = new Map((await h.tasksOf(REQ_ID)).map(t => [t.id, t]))
    const p1 = landed.get('t-p1')!
    expect(p1.status).toBe('canceled')
    expect(p1.canceledAt).toBe(5000)
    expect(p1.cancelReason).toBe(STALE_REWORK_REASON)
    expect('canceledBy' in p1, 'agent 触发 ⇒ 不写 canceledBy').toBe(false)
    expect(warn, '非人工路径必须 console.warn 留痕').toHaveBeenCalled()
    // 真卡一字未动
    expect('canceledAt' in landed.get('t-real')!).toBe(false)
  })

  it('需求级回退（executeMoveRequirement 真实用例）：每张被取消的卡在落盘队列里都有留痕', async () => {
    const warn = silenceWarn()
    const h = makeHarness()
    h.seedRequirementSync(req({ id: REQ_ID, status: 'implementing', sourceSessionId: W }))
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      task({ id: 't-top', requirementId: REQ_ID, title: '顶层卡', status: 'done' }),
      task({ id: 't-sub', requirementId: REQ_ID, title: '子卡', parentId: 't-top', stageKind: 'dev', status: 'in_progress', statusHistory: [] }),
      task({ id: 't-ph', requirementId: REQ_ID, title: '[重做] 顶层卡', status: 'todo', reworkOf: 't-old' }),
    ])

    await executeMoveRequirement(
      h.deps,
      { requirement_id: REQ_ID, to: 'design', reason: '需求边界与真实意图不符' },
      { agent: { id: W } },
    )

    const landed = await h.tasksOf(REQ_ID)
    const canceled = landed.filter(t => t.status === 'canceled')
    expect(canceled.map(t => t.id).sort(), '顶层父卡 + 占位重做卡都被取消').toEqual(['t-ph', 't-top'])
    for (const c of canceled) {
      expect(typeof c.canceledAt, c.id + '：canceledAt 必须是有限数字').toBe('number')
      expect(Number.isFinite(c.canceledAt!), c.id).toBe(true)
      expect(c.cancelReason, c.id + '：cancelReason 必须有值').toBe('需求边界与真实意图不符')
      // 工具侧回退由 agent 触发（回退方向不入人工门）⇒ 按规则不写 canceledBy
      expect('canceledBy' in c, c.id).toBe(false)
      // 与状态/修订同批：修订是同批写的那条
      expect(c.revisions!.at(-1)!.kind).toBe('rollback')
      expect(c.canceledAt, c.id + '：与修订同源同刻').toBe(c.revisions!.at(-1)!.at)
      // REQ-261008011118-defe BUG-3（DD-3）：状态事件与 version 也必须落进队列——
      // 此前白名单只搬「status/revisions/updatedAt + 取消三字段」，plan 里的 statusHistory 被丢，
      // 于是取消卡在状态时间线上像"从没被取消过"（同一类事故：plan 写了、落盘丢了）。
      expect(c.statusHistory?.at(-1)?.status, c.id + '：取消卡必须有 canceled 状态事件').toBe('canceled')
      expect(c.version, c.id + '：状态迁移必须 bump version（种子 1 → 2）').toBe(2)
    }
    // 子卡原地复位：**不带**留痕（复位 ≠ 取消，且不得清空既有留痕），但事件与 version 要齐
    const sub = landed.find(t => t.id === 't-sub')!
    expect(sub.status).toBe('todo')
    expect('canceledAt' in sub, '复位卡不得有取消留痕').toBe(false)
    expect(sub.statusHistory?.at(-1)?.status, '复位子卡必须留下原地复位事件').toBe('todo')
    expect(sub.version, '复位也是状态迁移 ⇒ version +1').toBe(2)
    expect(warn, '非人工路径必须 console.warn 留痕').toHaveBeenCalled()
  })

  it('复位不清空既有留痕：先取消→复活（带留痕）→回退复位，留痕仍在（INV-D2）', async () => {
    silenceWarn()
    const h = makeHarness()
    h.seedRequirementSync(req({ id: REQ_ID, status: 'implementing', sourceSessionId: W }))
    await h.seedSettled()
    const revived = task({
      id: 't-sub', requirementId: REQ_ID, title: '子卡', parentId: 't-top', stageKind: 'dev', status: 'todo',
      canceledAt: 111, canceledBy: { kind: 'human' }, cancelReason: '曾经取消过（复活后保留）',
    })
    await h.setTasks(REQ_ID, [
      task({ id: 't-top', requirementId: REQ_ID, title: '顶层卡', status: 'done' }),
      revived,
    ])

    await executeMoveRequirement(
      h.deps,
      { requirement_id: REQ_ID, to: 'design', reason: '回退' },
      { agent: { id: W } },
    )

    const sub = (await h.tasksOf(REQ_ID)).find(t => t.id === 't-sub')!
    expect(sub.status).toBe('todo')
    expect(sub.canceledAt, '复位不得把已有留痕抹成 undefined').toBe(111)
    expect(sub.canceledBy).toEqual({ kind: 'human' })
    expect(sub.cancelReason).toBe('曾经取消过（复活后保留）')
  })

  it('误物化清场（executeRollbackCleanup）：清掉的那批卡在队列里有留痕（人工动作 ⇒ 带 canceledBy）', async () => {
    const REQ_CLEAN = 'REQ-bfa7'
    let queue: TaskRecord[] = [
      task({ id: 't-p1', requirementId: REQ_CLEAN, title: '[重做] a', status: 'todo', reworkOf: 't-old1' }),
      task({ id: 't-p2', requirementId: REQ_CLEAN, title: '[重做] b', status: 'todo', reworkOf: 't-old2' }),
    ]
    const requirement = {
      id: REQ_CLEAN,
      // 清场会往 comments 写留痕（缺了会在运行期炸，tsc 不报）
      comments: [] as unknown[],
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'human' }, seq: 3, lastMaterialized: ['t-p1', 't-p2'] },
    } as unknown as RequirementRecord
    const deps = {
      requirementStore: {
        get: async () => requirement,
        mutate: async (_id: string, fn: (d: RequirementRecord) => unknown) => { fn(requirement); return {} },
      },
      taskStore: {
        listByRequirement: async () => queue,
        mutate: async (_id: string, fn: (t: TaskRecord[]) => TaskRecord[] | undefined) => {
          const out = fn(queue)
          if (out !== undefined) queue = out
          return queue
        },
      },
      now: () => 900,
      newCommentId: () => 'c-1',
    } as never

    const out = await executeRollbackCleanup(deps, { id: REQ_CLEAN, rollbackSeq: 3, reason: '范围选错' })
    expect(out.canceled).toBe(2)
    for (const c of queue) {
      expect(c.status, c.id).toBe('canceled')
      expect(c.canceledAt, c.id).toBe(900)
      expect(c.canceledBy, c.id + '：清场是看板人工动作').toEqual({ kind: 'human' })
      expect(c.cancelReason, c.id).toContain('误物化清场（第 3 次回退：范围选错）')
      expect(c.cancelReason, c.id + '：与修订同一条理由').toBe(c.revisions!.at(-1)!.reason)
    }
  })

  it('看板侧回退（POST /req/move，actor=human）：落盘留痕带 canceledBy{kind:human,sessionId}（§7.2 形态）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmboard-cancel-trail-'))
    const prevCwd = process.cwd()
    try {
      process.chdir(dir)
      const REQ_BOARD = 'REQ-bbb222'
      const SID = 'session-abc-123'
      const store = makeTestStore()
      const ts = taskStoreAt(dir)
      const live = task({ id: 't-board1', requirementId: REQ_BOARD, title: '活卡', status: 'todo' })
      await store.replaceAll('seed', {
        schemaVersion: 9, revision: 0, triages: [],
        requirements: [{
          id: REQ_BOARD, title: '看板回退', description: '', status: 'implementing', category: 'feature',
          blocked: false, sourceSessionId: SID, comments: [], version: 1, createdAt: 1, updatedAt: 1,
          createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
          // 回退要过的产物闸门：三份已确认产物 + 计划已批准
          artifacts: [
            { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/' + REQ_BOARD + '/requirement.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 10, confirmedBy: { kind: 'human' } },
            { stage: 'design', kind: 'design', path: 'docs/requirements/' + REQ_BOARD + '/design/a.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 20, confirmedBy: { kind: 'human' } },
            { stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + REQ_BOARD + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'human' }, confirmedAt: 30, confirmedBy: { kind: 'human' } },
          ],
          plan: { path: 'docs/requirements/' + REQ_BOARD + '/decomposition.md', submittedAt: 25, approvedAt: 30, approvedBy: { kind: 'human' }, tasks: [] },
        }],
      } as never)
      await ts.createMany(REQ_BOARD, [live])

      const handler = createReqboardHandler({
        requirementStore: store, taskStore: ts, now: () => 1000,
        docs: new FileDocRepository({ workspaceRoot: dir }),
      } as never)
      // 与 tests/move-rollback.test.ts 同款的假 req/res（该文件的既有写法，这里照抄以免两处漂移）
      const reqIn: any = new EventEmitter()
      reqIn.url = '/dashboard/api/reqboard/req/move'
      reqIn.method = 'POST'
      reqIn[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ id: REQ_BOARD, to: 'design', actor: 'human', sessionId: SID, reason: '需求描述不对' }), 'utf8')
      }
      const res: any = new EventEmitter()
      res.statusCode = 0
      res.writeHead = (code: number) => { res.statusCode = code; return res }
      res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
      await (handler as (a: unknown, b: unknown) => Promise<void>)(reqIn, res)
      expect(res.statusCode, JSON.stringify(res.payload)).toBe(200)

      const landed = await ts.listByRequirement(REQ_BOARD)
      const canceled = landed.filter(t => t.status === 'canceled')
      expect(canceled.map(t => t.id)).toEqual(['t-board1'])
      const c = canceled[0]!
      expect(c.canceledAt, '与写入时钟同值').toBe(1000)
      expect(c.canceledBy, '看板人工动作 ⇒ 记人 + 会话').toEqual({ kind: 'human', sessionId: SID })
      expect(c.cancelReason).toBe('需求描述不对')
      expect(c.canceledAt, '与修订同源同刻').toBe(c.revisions!.at(-1)!.at)
    } finally {
      process.chdir(prevCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
