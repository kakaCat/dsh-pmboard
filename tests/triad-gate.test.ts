/**
 * 三要素门禁接线单测（REQ-640a55 t-fb5e66 / FR-1）
 *
 * 两侧都锁，缺一不可：
 *   - 拦得住：卡缺节或节为空 → 拆分出口与单卡结单都被拒（code=task_card_incomplete，消息含卡 id 与节名）；
 *   - 不误伤：三节齐备放行；卡文件不存在 / to 不是被守的目标态 / 任务不属本窗口绑定 一律不判。
 *
 * 为什么要在工具层再测一遍：接线函数本身单测通过，不代表门真的挂上了——调用点漏挂或挂错时刻，
 * 单测照样全绿（本仓"实现了但零调用方"的教训）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { defineMoveTool, defineTaskMoveTool, defineTaskReportTool, seedQueueTasks, taskStoreOf, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { recordToolTrace, type ToolTraceEntry } from '../src/adapters/SessionProbeAdapter.js'
// 「放行」类断言改走**看板人路径**（design/fix-design.md BUG-2）：decomposing → implementing
// 自 2026-09-14 起是人工闸门，而 MoveRequirement 的 actor 硬编码 'agent' ⇒ 工具路径结构上不可达。
// 形状照抄 tests/artifact-gates.test.ts:417 的同款写法（同一 HTTP 入口，不另造一条路）。
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { createReqboardHandler } from '../src/http/routes.js'
import {
  taskCardTriadGaps,
  taskCardTriadFailure,
  requirementTaskCardTriadFailure,
} from '../src/application/internal/content-gate-triad.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const W = 'session-triad-0001'
const REQ = 'REQ-triad1'
const TASK = 't-aaa111'
const CARD_REL = 'docs/requirements/' + REQ + '/tasks/' + TASK + '.md'

/** 旧写法：只有 目标/范围，没有业务三要素——正是本门禁要拦下的形态。 */
const BAD_CARD = '# t-aaa111 甲\n\n## 目标\n\n把甲做完\n\n## 范围\n\n- 阶段：implement\n'
/** 新契约：三节齐备且正文非空。 */
const GOOD_CARD = '# t-aaa111 甲\n\n## 在做什么\n把甲做完\n\n## 解决什么问题\n现在甲还没做\n\n## 得到什么结果\nnpx vitest run 全绿\n'

const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
}) as any

/** 看板 HTTP 请求替身（与 tests/artifact-gates.test.ts 的 fakeReq 同款形状：同一入口、同一信封）。 */
function fakeReq(body: unknown, url: string): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}
function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

describe('接线函数：判定与取数在 application 层（纯读，无副作用）', () => {
  it('缺三要素节 → 报出卡 id 与三个缺字段', async () => {
    const gaps = await taskCardTriadGaps(fakeDocs({ [CARD_REL]: BAD_CARD }), { requirementId: REQ, taskIds: [TASK] })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].taskId).toBe(TASK)
    expect(gaps[0].missing).toEqual(['缺字段：在做什么', '缺字段：解决什么问题', '缺字段：得到什么结果'])
  })

  it('卡文件不存在 → 不判（那是"卡还没落盘"，别的门禁管落盘）', async () => {
    expect(await taskCardTriadGaps(fakeDocs({}), { requirementId: REQ, taskIds: [TASK] })).toEqual([])
  })

  it('三节齐备 → 无缺口', async () => {
    expect(await taskCardTriadGaps(fakeDocs({ [CARD_REL]: GOOD_CARD }), { requirementId: REQ, taskIds: [TASK] })).toEqual([])
  })

  it('需求级：to 不是 implementing → 不判', async () => {
    const m = await requirementTaskCardTriadFailure(fakeDocs({ [CARD_REL]: BAD_CARD }), {
      requirementId: REQ, to: 'accepting', tasks: [{ id: TASK, requirementId: REQ }],
    })
    expect(m).toBeUndefined()
  })

  it('需求级：命中 → 文案含卡 id 与节名', async () => {
    const m = await requirementTaskCardTriadFailure(fakeDocs({ [CARD_REL]: BAD_CARD }), {
      requirementId: REQ, to: 'implementing', tasks: [{ id: TASK, requirementId: REQ }],
    })
    expect(m).toContain(TASK)
    expect(m).toContain('在做什么')
  })

  it('单卡：to 不是 done → 不判', async () => {
    const m = await taskCardTriadFailure(fakeDocs({ [CARD_REL]: BAD_CARD }), {
      taskId: TASK, to: 'testing', tasks: [{ id: TASK, requirementId: REQ }], boundRequirementIds: [REQ],
    })
    expect(m).toBeUndefined()
  })

  it('单卡：任务不属本窗口绑定集合 → 不判', async () => {
    const m = await taskCardTriadFailure(fakeDocs({ [CARD_REL]: BAD_CARD }), {
      taskId: TASK, to: 'done', tasks: [{ id: TASK, requirementId: REQ }], boundRequirementIds: [],
    })
    expect(m).toBeUndefined()
  })

  it('单卡：任务不在台账 → 不判', async () => {
    const m = await taskCardTriadFailure(fakeDocs({ [CARD_REL]: BAD_CARD }), {
      taskId: 't-zzz999', to: 'done', tasks: [{ id: TASK, requirementId: REQ }], boundRequirementIds: [REQ],
    })
    expect(m).toBeUndefined()
  })
})

describe('端到端：门真的挂上了（reqboard_move / reqboard_task_move）', () => {
  let dir: string
  let prevCwd: string
  let store: ReturnType<typeof makeTestStore>
  let trace: Map<string, ToolTraceEntry[]>
  let move: { execute: (a: unknown, e: unknown) => Promise<any> }
  let taskMove: { execute: (a: unknown, e: unknown) => Promise<any> }
  let report: { execute: (a: unknown, e: unknown) => Promise<any> }
  /** 看板 HTTP 入口：「放行」类断言走它（人工闸门只认人，工具路径结构上不可达）。 */
  let board: ReturnType<typeof createReqboardHandler>
  /** 提到 describe 作用域：`seedTask` 播种队列任务需要同一个 `deps`（`taskStoreOf` 按对象身份记忆化）。 */
  let deps: ReqboardToolDeps

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-triad-'))
    prevCwd = process.cwd()
    process.chdir(dir)
    store = makeTestStore()
    trace = new Map()
    deps = { store, now: () => Date.now(), toolTrace: trace, doneThrottleMs: 0 }
    move = defineMoveTool(deps) as never
    taskMove = defineTaskMoveTool(deps) as never
    report = defineTaskReportTool(deps) as never
    // 任务队列用 taskStoreOf(deps) 的**同一实例**（记忆化）：否则看板读 A、用例播种到 B，会出假红。
    board = createReqboardHandler({
      requirementStore: store, taskStore: taskStoreOf(deps), now: () => Date.now(),
      docs: new FileDocRepository({ workspaceRoot: dir }),
    })
  })
  afterEach(() => {
    process.chdir(prevCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  /** 看板人路径的一次 POST（路径前缀与 tests/artifact-gates.test.ts 一致）。 */
  async function post(url: string, body: unknown) {
    const res = fakeRes()
    await board(fakeReq(body, '/dashboard/api/reqboard' + url), res)
    return res
  }

  const exec = { agent: { id: W } }
  const writeCard = (body: string) => {
    mkdirSync(join(dir, 'docs/requirements', REQ, 'tasks'), { recursive: true })
    writeFileSync(join(dir, CARD_REL), body)
  }

  async function seedDecomposing(): Promise<void> {
    const r = {
      id: REQ, title: '三要素门禁', description: '', status: 'decomposing', blocked: false, category: 'feature',
      sourceSessionId: W,
      artifacts: [{
        stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + REQ + '/decomposition.md',
        confirmedAt: 5, confirmedBy: { kind: 'human' },
      }],
      comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      statusHistory: [{ status: 'decomposing', at: 1, by: { kind: 'human' } }],
    } as unknown as RequirementRecord
    await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  }

  // 卡停在 in_review：结单门禁的合法前驱（in_progress 不能直接转 done——状态机如此）。
  // 拦得住那一侧不受影响：三要素门禁在工具壳里、早于状态机转移判定。
  async function seedTask(status = 'in_review'): Promise<void> {
    const t = {
      id: TASK, requirementId: REQ, title: '把甲做完', description: '', phase: 'implement', side: 'backend',
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿',
      context: '甲还没做', status, blocked: false, executions: [], comments: [],
      version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    } as unknown as TaskRecord
    // 任务落**队列**（REQ-260927202051-f6df：v9 台账已无 tasks 通道，`ledger.tasks.push` 已非法）
    await seedQueueTasks(deps, REQ, [t])
  }

  it('拆分出口：卡缺三要素 → 拒绝 task_card_incomplete，且消息含卡 id 与节名', async () => {
    await seedDecomposing(); await seedTask(); writeCard(BAD_CARD)
    await expect(move.execute({ to: 'implementing' }, exec)).rejects.toThrow(/task_card_incomplete/)
    await expect(move.execute({ to: 'implementing' }, exec)).rejects.toThrow(new RegExp(TASK))
  })

  it('拆分出口：三节齐备 → 放行', async () => {
    await seedDecomposing(); await seedTask(); writeCard(GOOD_CARD)
    // 放行权在人手里（decomposing → implementing 是人工门）：走看板人路径，actor=human。
    const res = await post('/req/move', { id: REQ, to: 'implementing', actor: 'human' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.status).toBe('implementing')
  })

  it('拆分出口：卡文件不存在 → 不判（放行）', async () => {
    await seedDecomposing(); await seedTask()
    const res = await post('/req/move', { id: REQ, to: 'implementing', actor: 'human' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.status).toBe('implementing')
  })

  it('单卡结单：卡缺三要素 → 拒绝 task_card_incomplete', async () => {
    await seedDecomposing(); await seedTask(); writeCard(BAD_CARD)
    recordToolTrace(trace, W, 'edit', Date.now())
    await report.execute({ task_id: TASK, summary: '做完了', completed: ['改动已落地'] }, exec)
    await expect(taskMove.execute({ task_id: TASK, to: 'done' }, exec)).rejects.toThrow(/task_card_incomplete/)
  })

  it('单卡结单：三节齐备 → 放行', async () => {
    await seedDecomposing(); await seedTask(); writeCard(GOOD_CARD)
    recordToolTrace(trace, W, 'edit', Date.now())
    await report.execute({ task_id: TASK, summary: '做完了', completed: ['改动已落地'] }, exec)
    const out = await taskMove.execute({ task_id: TASK, to: 'done' }, exec)
    expect((out as { to?: string }).to).toBe('done')
  })
})
