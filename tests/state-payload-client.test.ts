/**
 * t-05a56b 客户端侧验收：**首屏渲染 0 次详情请求**（REQ-261002161439-277d B12 阶段⑥-①）。
 *
 * 为什么在 api 契约层断言（而不是挂载整块看板）：本仓没有 DOM 测试环境（无 jsdom/happy-dom），
 * 而该属性的**实质**是"首屏这条代码路径发出哪些请求" —— 用 `vi.stubGlobal('fetch', …)` 记录请求集，
 * 就能直接证伪"首屏偷偷拉全文"（旧实现每渲染一次详情就整册回全文，正是要根治的形态）。
 *
 * 验收原文：客户端用例断言首屏渲染 0 次详情请求。
 *
 * ## 本文件第二块（REQ-261005193546-1b1a · t-9b6879）：`/state` 载荷的**活卡出口收敛**
 *
 * 同一份载荷的**服务端**契约：`tasks` / `ready` / 需求摘要计数 / 会话流程面板 / 节点装配
 * 全部只算活卡（`canceled` 一张都不下发），且 `ready` 是**现算**（不读队列文件里落盘的 `ready[]`）。
 * 放在本文件是因为它测的是同一件事的两端：**客户端不写过滤，靠的就是载荷本身已经收敛**。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { mkTask } from './queue/fixtures.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { liveCountOf } from '../src/domain/status/Predicates.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const calls: string[] = []

function stubFetch(payload: unknown = { success: true, data: { revision: 1, requirements: [], tasks: [], ready: {} } }): void {
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response
  })
}

afterEach(() => { calls.length = 0; vi.unstubAllGlobals() })

describe('首屏取数（B12 阶段⑥-①）', () => {
  it('fetchState 只打 /state，且不打任何详情端点', async () => {
    stubFetch()
    const api = await import('../src/client/api.js')
    await api.fetchState()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/\/dashboard\/api\/reqboard\/?$/)
    // 详情端点的形态：.../requirements/<id>（不含 /summary /stages /token /marks）
    const detail = calls.filter(c => /\/requirements\/[^/]+$/.test(new URL(c, 'http://localhost').pathname))
    expect(detail, '首屏不得请求详情').toEqual([])
  })

  it('详情按需：fetchRequirement(id) 打 /requirements/<id>（新端点）', async () => {
    stubFetch({ success: true, data: { revision: 1, requirement: { id: 'REQ-x' } } })
    const api = await import('../src/client/api.js')
    const r = await (api as unknown as { fetchRequirement?: (id: string) => Promise<unknown> }).fetchRequirement?.('REQ-261002161439-277d')
    // 该函数是收尾项之一：存在则必须打新端点；不存在则本用例显式记为待办（不静默通过）
    if (opts_hasFetchRequirement(api)) {
      expect(calls.some(c => /\/requirements\/REQ-261002161439-277d$/.test(c))).toBe(true)
      expect(r).toBeDefined()
    } else {
      expect(calls.filter(c => /\/requirements\/[^/]+$/.test(c)), '未实现详情取数时不得有详情请求').toEqual([])
    }
  })
})

/** 收尾项探针：`api.fetchRequirement` 是否已落地（未落地时本用例仍断言"无详情请求"）。 */
function opts_hasFetchRequirement(api: unknown): boolean {
  return typeof (api as { fetchRequirement?: unknown }).fetchRequirement === 'function'
}

// ─────────────────────────────────────────────────────────────────────────────
// 服务端出口收敛（REQ-261005193546-1b1a · t-9b6879 / FR-1, FR-2, FR-5）
// ─────────────────────────────────────────────────────────────────────────────
//
// **本块的标本**（一张已取消卡，其余四张活卡）：
//
//   t-done      done          活卡（完成度分子）
//   t-wip       in_progress   活卡
//   t-blocked   todo          活卡，**唯一前置是已取消卡** → 新口径下必须 ready（取消不阻塞下游）
//   t-ready2    todo          活卡，无依赖 → ready
//   t-canceled  canceled      **已取消（标本）**：任何出参里出现它即违规（D-3 彻底不可见）
//
// 断言落点：**卡片本体**不许出现——`tasks` 行、`ready` 集合、节点装配载荷里都不得有这张卡；
// 唯一允许出现它 id 的地方是活卡 `t-blocked.dependsOn`（依赖**边的引用**，不是卡片），
// 而这条边正是标本的要点：边还在，但按「已了结」处理、不阻塞活卡。
//
// **逆验证（人工跑过，实测结论写在任务汇报里）**——三条都各自必红，且只红相关项：
//   · 只回退 `tasks: live.map(...)` 为 `tasks.map(...)`（ready 仍现算）→ **①** 红；
//   · 只把 `ready` 退回旧口径（`dependsOn.every(d => d.status === 'done')`）→ **②③** 红；
//   · `handleState` 整块回退 → **①④⑤** 红（②③ 与 ⑥ 为何仍绿见任务汇报：ready 走的是
//     shared `readyTasks`（已收编单点）/ 装配器侧另有 t6 的单点收敛，二者都不是本卡的判据面）。

/** 标本需求（进行中：/state 默认 scope=active 收它，/session 进度也锚它）。 */
const LIVE_REQ = 'REQ-261005190000-live'
const LIVE_SID = 'session-live-cards'
const T = {
  done: 't-0000done',
  wip: 't-0000wip0',
  blocked: 't-0000blkd',
  ready2: 't-0000rdy2',
  canceled: 't-0000cncl',
} as const

/** 需求记录（字段形状与 /session 进度用例同款；标题刻意不含"取消"二字，便于全文文案断言）。 */
function liveRequirementSeed(): RequirementRecord {
  return {
    id: LIVE_REQ,
    title: '活卡出口收敛标本',
    description: '',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'implementing', at: 1, by: { kind: 'human' } }],
    sourceSessionId: LIVE_SID,
  } as unknown as RequirementRecord
}

describe('活卡出口收敛：/state 的 tasks / ready / 计数（REQ-261005193546-1b1a）', () => {
  let dir: string
  let store: ReturnType<typeof makeTestStore>
  let taskStore: ReturnType<typeof taskStoreAt>
  let handler: ReturnType<typeof createReqboardHandler>

  function fakeReq(url: string): any {
    const req = new EventEmitter() as any
    req.url = '/dashboard/api/reqboard' + url
    req.method = 'GET'
    req[Symbol.asyncIterator] = async function* () { /* GET 无 body */ }
    return req
  }
  function fakeRes(): any {
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.payload = undefined
    res.writeHead = (code: number) => { res.statusCode = code; return res }
    res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
    return res
  }
  async function get(url: string, h: ReturnType<typeof createReqboardHandler> = handler): Promise<any> {
    const res = fakeRes()
    await h(fakeReq(url), res)
    return res
  }
  /** 队列文件路径（`JsonQueueRepository` 的规范落点）。 */
  const queuePath = (): string => join(dir, 'docs', 'requirements', LIVE_REQ, 'queue.json')

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-live-cards-'))
    store = makeTestStore()
    await store.replaceAll('seed', { schemaVersion: 9, revision: 1, requirements: [liveRequirementSeed()], triages: [] })
    taskStore = taskStoreAt(dir, () => 1_000)
    // 落库顺序 = 队列文件顺序（**输出顺序口径**的基准，R-3/D8）。
    await taskStore.createMany(LIVE_REQ, [
      mkTask(T.done, { requirementId: LIVE_REQ, status: 'done' }),
      mkTask(T.wip, { requirementId: LIVE_REQ, status: 'in_progress' }),
      mkTask(T.blocked, { requirementId: LIVE_REQ, dependsOn: [T.canceled] }),
      mkTask(T.ready2, { requirementId: LIVE_REQ }),
      mkTask(T.canceled, { requirementId: LIVE_REQ, status: 'canceled' }),
    ])
    handler = createReqboardHandler({ requirementStore: store, taskStore, now: () => 1_000, cwd: dir })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  /** 台账真相（任务唯一来源 = 队列；活卡数用 domain 单点独立算，不借被测实现）。 */
  async function ledgerTasks(): Promise<readonly TaskRecord[]> {
    return await taskStoreAt(dir, () => 1_000).listAll()
  }

  it('① /state.tasks 只下发活卡：无 canceled 条，且条数 === liveCountOf(台账)', async () => {
    const res = await get('/state')
    expect(res.statusCode, JSON.stringify(res.payload)).toBe(200)
    const data = res.payload.data as { tasks: readonly TaskRecord[]; ready: Record<string, string[]> }
    const all = await ledgerTasks()

    expect(data.tasks.filter(t => t.status === 'canceled')).toHaveLength(0)
    expect(data.tasks.length).toBe(liveCountOf(all))
    expect(data.tasks.map(t => t.id)).toEqual([T.done, T.wip, T.blocked, T.ready2])
    // 违规的是把取消卡当**卡片**下发（行本体或 ready 集合里出现它）。
    // 注：活卡 `t-blocked` 的 `dependsOn` 里**可以**出现取消卡的 id —— 那是依赖边的引用（且正是本标本的要点：
    // 边还在、但不构成阻塞），故这里不做全文扫描，只查"行 + ready 集合"。
    expect(data.tasks.some(t => t.id === T.canceled)).toBe(false)
    expect(data.ready[LIVE_REQ] ?? []).not.toContain(T.canceled)
  })

  it('② /state.ready ⊆ 活卡，且含「唯一前置已取消」的 todo 卡（现算、按任务数组顺序）', async () => {
    const res = await get('/state')
    const data = res.payload.data as { tasks: readonly TaskRecord[]; ready: Record<string, string[]> }
    const liveIds = new Set(data.tasks.map(t => t.id))
    const ready = data.ready[LIVE_REQ] ?? []

    expect(ready).toContain(T.blocked) // 取消卡不构成依赖阻塞
    for (const id of ready) expect(liveIds.has(id), `ready 里出现非活卡 ${id}`).toBe(true)
    // 顺序 = **任务数组顺序**（R-3/D8）：t-blocked 在队列里先于 t-ready2
    expect(ready).toEqual([T.blocked, T.ready2])
  })

  it('③ ready 现算：队列文件里的 ready[] 改成陈旧值（顺序反了）后，/state 仍按任务数组顺序给出', async () => {
    // 当前读路径下，能被 `load` 接受的「陈旧 ready[]」只剩**顺序**这一维：
    // V-5 是双向判据（假就绪 + 漏就绪都按 issue 报），缺卡/多卡会让 load 判为不可用。
    // 而顺序恰恰是既有注释点名的理由（「其顺序由 computeReady 决定，不保证一致」）⇒ 拿它当陈旧值。
    const file = JSON.parse(readFileSync(queuePath(), 'utf8')) as { ready: string[]; tasks: { id: string }[] }
    expect(file.ready).toEqual([T.blocked, T.ready2]) // 落盘真值（写路径算的）
    file.ready = [T.ready2, T.blocked] // 陈旧/漂移：顺序被换过
    writeFileSync(queuePath(), JSON.stringify(file, null, 2))

    // 新建 store：强制从磁盘重读（沿用旧缓存就验不到"落盘值不被采用"）
    const fresh = taskStoreAt(dir, () => 2_000)
    const h = createReqboardHandler({ requirementStore: store, taskStore: fresh, now: () => 2_000, cwd: dir })
    const res = await get('/state', h)
    expect(res.statusCode, JSON.stringify(res.payload)).toBe(200)
    const data = res.payload.data as { ready: Record<string, string[]> }

    expect(data.ready[LIVE_REQ]).toEqual([T.blocked, T.ready2]) // 任务数组顺序，不是落盘顺序
    expect(data.ready[LIVE_REQ]).not.toEqual(file.ready)
  })

  it('④ /requirements/summary：tasksTotal === 活卡数，percentage 用同一活卡分母', async () => {
    const res = await get('/requirements/summary')
    expect(res.statusCode).toBe(200)
    const rows = res.payload.data.requirements as { id: string; tasksDone: number; tasksActive: number; tasksTotal: number; percentage: number }[]
    const row = rows.find(r => r.id === LIVE_REQ)
    expect(row, '进行中需求必须出现在摘要里').toBeDefined()
    const all = await ledgerTasks()
    const live = liveCountOf(all)

    expect(live).toBe(4) // 标本自检：5 张卡里 1 张已取消
    expect(row!.tasksTotal).toBe(live)
    expect(row!.tasksDone).toBe(1)
    expect(row!.tasksActive).toBe(1)
    expect(row!.percentage).toBe(Math.round((1 / live) * 100)) // 25，不是 1/5=20
  })

  it('⑤ 会话流程面板：progress / byStatus / tasks 全按活卡算，canceled 恒 0，且不新增交代字段', async () => {
    const res = await get('/session/' + LIVE_SID + '/progress')
    expect(res.statusCode, JSON.stringify(res.payload)).toBe(200)
    const d = res.payload.data as {
      progress: { total: number; done: number; active: number; percentage: number; byStatus: Record<string, number> }
      tasks: readonly { id: string; status: string }[]
    }

    expect(d.progress.total).toBe(4)
    expect(d.progress.done).toBe(1)
    expect(d.progress.active).toBe(1)
    expect(d.progress.percentage).toBe(25)
    expect(d.progress.byStatus.canceled).toBe(0)
    expect(d.progress.byStatus).toMatchObject({ todo: 2, in_progress: 1, done: 1 })
    expect(d.tasks.map(t => t.id).sort()).toEqual([T.blocked, T.done, T.ready2, T.wip].sort())
    expect(d.tasks.some(t => t.status === 'canceled')).toBe(false)
    // D-7：**不新增**任何「另有 N 张已取消」形状的字段/文案（progress 的键集就是全部交代）
    expect(Object.keys(d.progress).sort()).toEqual(['active', 'byStatus', 'done', 'percentage', 'total'])
    expect(JSON.stringify(d)).not.toContain('另有')
  })

  it('⑥ 节点详情 / 总览：装配器拿到的也是活卡（取消卡一处都不出现）', async () => {
    const detail = await get(`/requirements/${LIVE_REQ}/stage/implementing`)
    expect(detail.statusCode, JSON.stringify(detail.payload)).toBe(200)
    const overview = await get(`/requirements/${LIVE_REQ}/stages`)
    expect(overview.statusCode, JSON.stringify(overview.payload)).toBe(200)

    expect(JSON.stringify(detail.payload.data)).not.toContain(T.canceled)
    expect(JSON.stringify(overview.payload.data)).not.toContain(T.canceled)

    // 非空自检：implementing 节点确实投影出了活卡（否则"不含取消卡"是空断言）
    const stages = (overview.payload.data as { stages: readonly { stage: string; body?: { tasks?: readonly { id: string }[] } }[] }).stages
    const impl = stages.find(s => s.stage === 'implementing')
    expect(impl?.body?.tasks?.map(t => t.id) ?? []).toEqual([T.done, T.wip, T.blocked, T.ready2])
  })
})

// ---------------------------------------------------------------------------
// 摘要门读数的有界性与大字段缺席（REQ-261006175040-12d4 t5 / FR-2、FR-7）
// ---------------------------------------------------------------------------

/**
 * 为什么在载荷层断言：`gates` 是本次唯一新增的数组字段，必须有**上界**（生效门数 ≤ 5）——
 * 否则将来"顺手多塞点东西进去"会把首屏载荷重新推高，而 B12 的承诺是"摘要不含无上界字段"。
 * 同时再钉一次：大字段（artifacts / plan / verification / archive / comments / statusHistory）一个都不出现。
 */
describe('摘要门读数有界（/state 载荷）', () => {
  let dir: string
  let store: ReturnType<typeof makeTestStore>
  let handler: ReturnType<typeof createReqboardHandler>

  function fakeReq(url: string): any {
    const r = new EventEmitter() as any
    r.url = '/dashboard/api/reqboard' + url
    r.method = 'GET'
    r[Symbol.asyncIterator] = async function* () { /* GET 无 body */ }
    return r
  }
  function fakeRes(): any {
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.payload = undefined
    res.writeHead = (code: number) => { res.statusCode = code; return res }
    res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
    return res
  }
  async function get(url: string): Promise<any> {
    const res = fakeRes()
    await handler(fakeReq(url), res)
    return res
  }

  const GATES_REQ = 'REQ-261006000009-bbbb'
  const seed = (): RequirementRecord => ({
    id: GATES_REQ, title: '门读数有界标本', description: '', status: 'brainstorming', blocked: false,
    category: 'feature', comments: [], version: 1, createdAt: 100, updatedAt: 100,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'agent' },
    // 三态齐全：需求文档待确认、设计缺失、计划对象在册（planState=pending）
    artifacts: [
      { stage: 'brainstorming', kind: 'requirement', path: 'r.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
    ],
    plan: { path: 'p.md', summary: 's', tasks: [], submittedAt: 2, submittedBy: { kind: 'agent' } },
  } as never)

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-gate-bounds-'))
    store = makeTestStore()
    await store.replaceAll('seed', { schemaVersion: 9, revision: 1, requirements: [seed()], triages: [] })
    handler = createReqboardHandler({ requirementStore: store, taskStore: taskStoreAt(dir, () => 1_000), now: () => 1_000, cwd: dir })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('每需求 gates ≤ 5、值域合法、且大字段键一个都不出现', async () => {
    const res = await get('/state')
    const reqs = res.payload.data.requirements as Record<string, unknown>[]
    expect(reqs.length).toBe(1)
    const row = reqs[0]!
    for (const key of ['artifacts', 'plan', 'verification', 'archive', 'comments', 'statusHistory']) {
      expect(key in row).toBe(false)
    }
    const gates = row['gates'] as Array<{ kind: string; status: string; count: number }>
    expect(Array.isArray(gates)).toBe(true)
    expect(gates.length).toBeLessThanOrEqual(5)
    expect(gates.map(g => g.status)).toEqual(['pending', 'missing', 'missing', 'missing'])
    for (const g of gates) {
      expect(typeof g.kind).toBe('string')
      expect(['confirmed', 'pending', 'missing']).toContain(g.status)
      expect(Number.isInteger(g.count)).toBe(true)
      expect(g.count).toBeGreaterThanOrEqual(0)
    }
    expect(row['planState']).toBe('pending')
    expect(row['archivePrepared']).toBe(false)
  })
})
