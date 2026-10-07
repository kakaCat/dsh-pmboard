/**
 * 子卡请求预算软门禁（REQ-261007100513-6749 t5 · serves: FR-6；用户裁定 D-3：
 * **默认 60 次请求/卡·窗口**；到顶**先停下再汇报**；续跑须 owner 显式放行并留痕）。
 *
 * 返工后的口径（逐条对应本次返工要求，2026-10-07 独立复核 P1 阻塞）：
 *  ① **执法 = 子会话**：到顶就停**那个子会话**，**完全不依赖卡片归属**（多卡并行也必须生效）；
 *  ② **汇报分级、不猜**：`exact-session` → 卡评论；`parent-unique-in-progress` → 卡评论**并写明依据**；
 *     其余 → **不写任何卡评论**，写**需求级评论**（`comments.jsonl`）+ 点名子会话 id 与「归属未定」；
 *  ③ **子会话正向判据**：`origin === 'subagent' || delegationDepth > 0`；纯 fork 窗口（有
 *     `parentSession`、depth 0、无 origin）**不计入任何预算**；
 *  ④ **独立停手位**：不复用人工门 in-flight（不吃 60 分钟 TTL）、不写需求级 `driverHealth`
 *     （不连带停发同需求其它可开工卡）、**过期或被清后可重新进入**（不是一次性闸）；
 *  ⑤ **写失败不静默失效**：计数进内存态继续累计 ⇒ 仍能到顶停手，并留「内存态与运行态不一致」诊断；
 *  ⑥ **放行 CAS**：`budget.expectedWindowIndex` 不匹配即**拒**并给当前窗口号；
 *  ⑦ 未放行时第 4 次请求**不成立**（`accepted=false`），计数继续累加并**再投一次**停止指令；
 *  ⑧ 计数不可得（端口与内存都无依据）→ 标注「计数不可得」且**不按 0 通过**；
 *  ⑨ 顺序契约按**投递器调用序列**断言（停止指令的调用确实早于评论写入）；
 *  ⑩ `ExecuteTask.executeSubtask` 的**显式开窗**接线有覆盖（`openSubtaskBudgetWindow` 幂等）。
 *
 * **真实形状**（本文件所有 fixture 都按实测口径写）：`executions[].sessionId` 是**窗口码**
 * （`session-*`），子会话是 UUID ⇒ 精确查表**永不命中**，只有兜底归属与需求级汇报可用。
 */
import { describe, expect, it } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { defineTaskMoveTool } from '../src/tools/index.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import type { SubtaskBudgetPort, SubtaskRuntimePort } from '../src/application/ports.js'
import type { SubtaskBudgetState, TaskRecord } from '../src/shared/protocol.js'
import { LIMITS } from '../src/domain/limits.js'
import {
  chargeRequest,
  openBudgetWindow,
  releaseBudget,
  resolveBudgetLimit,
} from '../src/application/internal/subtask-budget.js'
import { createRequestCounter, type ChargeReceipt } from '../src/application/internal/request-counter.js'
import {
  createSubtaskRuntime,
  isSubtaskSession,
  sessionScopeKey,
} from '../src/application/internal/subtask-runtime.js'
import {
  appendRequirementComment,
  appendTaskComment,
  BUDGET_MARKS,
  createInboxNotify,
} from '../src/application/internal/task-comment.js'
import { expectCode } from './helpers/code-assert.js'

const W = 'session-w-001'
const REQ = 'REQ-000001'
/** 子会话 id 按实测形状用 UUID（`executions[].sessionId` 是窗口码 ⇒ 永不与它相等）。 */
const SUB = 'b7c1e0f2-9d34-4a6b-8f21-3c5e7a90d123'
const T = 1_790_262_000_000

/** 运行态端口的替身（真实实现落 `state/subtask-budget.json`，见组合根）。 */
class FakeBudgetPort implements SubtaskBudgetPort {
  state: SubtaskBudgetState | undefined
  writes: SubtaskBudgetState[] = []
  failWrite = false
  /** `read()` 是否可得：false = 缺文件/损坏（**计数不可得**）。刻意不用缺省参数——`undefined` 会被吃掉。 */
  readable = true
  constructor(state: SubtaskBudgetState = { v: 1, tasks: {} }) { this.state = state }
  static unreadable(): FakeBudgetPort {
    const p = new FakeBudgetPort()
    p.readable = false
    return p
  }
  async read(): Promise<SubtaskBudgetState | undefined> { return this.readable ? this.state : undefined }
  async write(next: SubtaskBudgetState): Promise<void> {
    if (this.failWrite) throw new Error('disk full（模拟运行态写失败）')
    this.writes.push(next)
    this.state = next
    this.readable = true
  }
}

/** 子会话事件（正向判据命中：`origin='subagent'` + `delegationDepth=1`）。 */
const child = (id: string, parentSession: string = W): unknown => ({
  id, header: { parentSession, delegationDepth: 1, origin: 'subagent' },
})
/** **fork 窗口**（实测 3 例的形状）：有 `parentSession`、depth 0、无 origin ⇒ **不是**子会话。 */
const forkWindow = (id: string, parentSession: string = W): unknown => ({ id, header: { parentSession } })
const assistant = { type: 'assistant/message', data: { turn: 1, step: 1 } }

/** 真实形状的卡：`executions[].sessionId` = **窗口码**（精确查表永不命中）。 */
function windowCodeCard(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id, requirementId: REQ, parentId: 't-p', stageKind: 'dev' as never, status: 'in_progress', createdAt: 1,
    executions: [{ id: 'e-' + id, sessionId: W, trigger: 'manual', startedAt: 1, outcome: 'running' }],
    ...over,
  })
}
/** 精确归属命中（契约允许的另一种形状）：`executions[].sessionId === 子会话 id`。 */
function sessionMatchedCard(id: string, sessionId: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return windowCodeCard(id, {
    executions: [{ id: 'e-' + id, sessionId, trigger: 'manual', startedAt: 1, outcome: 'running' }],
    ...over,
  })
}

interface TimelineEntry { at: number; call: string }

/**
 * 计数夹具：时钟单调递增（`now: () => t++`），并把**每一次投递器调用**按发生顺序记进 `calls`
 * ——顺序契约断言的就是这个序列（不只是两次时钟读数有序）。
 */
function makeCounter(input: {
  port: SubtaskBudgetPort
  tasks: readonly TaskRecord[]
  tasksOf?: readonly TaskRecord[]
  requirementForWindow?: string | undefined
  runtime?: SubtaskRuntimePort
  /** 用**真实**留痕出口（`appendTaskComment` / `appendRequirementComment`）而不是记录数组。 */
  harness?: ReturnType<typeof makeHarness>
}) {
  let t = T
  const timeline: TimelineEntry[] = []
  const comments: { taskId: string; body: string; at: number }[] = []
  const reqComments: { requirementId: string; body: string; at: number }[] = []
  const stops: { sessionId: string; taskId?: string; text: string; at: number }[] = []
  const owners: { requirementId: string; text: string; at: number }[] = []
  const diags: string[] = []
  const runtime = input.runtime ?? createSubtaskRuntime()
  const record = (call: string, at: number): void => { timeline.push({ at, call }) }
  const h = input.harness
  const counter = createRequestCounter({
    port: input.port,
    runtime,
    tasks: () => input.tasks,
    tasksOf: async () => input.tasksOf ?? input.tasks,
    requirementForWindow: () => input.requirementForWindow === undefined ? REQ : input.requirementForWindow,
    appendComment: h === undefined
      ? ({ taskId, body, at }) => { comments.push({ taskId, body, at }); record('comment:' + taskId, at) }
      : ({ taskId, body, at }) => { comments.push({ taskId, body, at }); record('comment:' + taskId, at); return appendTaskComment(h.deps, taskId, body, { kind: 'system' }, at).then(() => undefined) },
    appendRequirementComment: h === undefined
      ? ({ requirementId, body, at }) => { reqComments.push({ requirementId, body, at }); record('req-comment', at) }
      : ({ requirementId, body, at }) => { reqComments.push({ requirementId, body, at }); record('req-comment', at); return appendRequirementComment(h.deps, requirementId, body, { kind: 'system' }, at).then(() => undefined) },
    stopSubagent: ({ sessionId, taskId, text, at }) => { stops.push({ sessionId, ...(taskId === undefined ? {} : { taskId }), text, at }); record('stop', at); return true },
    notifyOwner: ({ requirementId, text, at }) => { owners.push({ requirementId, text, at }); record('owner', at); return true },
    now: () => t++,
    diagnose: (m) => diags.push(m),
    logger: { warn: () => { /* 夹具不打印 */ } },
  })
  const fire = async (session: unknown, times = 1): Promise<void> => {
    for (let i = 0; i < times; i += 1) counter.onSessionEvent(session, assistant)
    await counter.drain()
  }
  /** 时钟跳跃（停手位 TTL / 过期重进用）。 */
  const advance = (ms: number): void => { t += ms }
  /** 夹具当前时钟（`listHalts(at)` 会按 at 扫过期，故断言要用它而不是随手写一个未来值）。 */
  const now = (): number => t
  /** 投递器调用序列里某类调用的首次下标（顺序契约的断言面）。 */
  const firstIndexOf = (call: string): number => timeline.findIndex((e) => e.call === call)
  return { counter, fire, advance, now, timeline, comments, reqComments, stops, owners, diags, runtime, firstIndexOf }
}

describe('FR-6 预算纯判定（窗口定格 / 计数 / CAS 放行）', () => {
  it('窗口 limit 定格；第 3 次到顶、第 4 次不成立（先计数再判）', () => {
    const card = task({ id: 't-s1', budgetRequests: 3 })
    const { window, note } = openBudgetWindow(card, T)
    expect(window).toEqual({ windowIndex: 0, used: 0, limit: 3, windowStartAt: T })
    expect(note).toBeUndefined()

    let w = window
    const seen: { used: number; accepted: boolean; exceeded: boolean }[] = []
    for (let i = 0; i < 4; i += 1) {
      const r = chargeRequest(w)
      w = r.window
      seen.push({ used: w.used, accepted: r.accepted, exceeded: r.exceeded })
    }
    expect(seen).toEqual([
      { used: 1, accepted: true, exceeded: false },
      { used: 2, accepted: true, exceeded: false },
      { used: 3, accepted: true, exceeded: true }, // 第 3 次之后即到顶 ⇒ 先停后报
      { used: 4, accepted: false, exceeded: true }, // 第 4 次「不成立」（计数仍累加）
    ])
    // limit 定格：事后改 budgetRequests 不影响已开窗口
    expect(openBudgetWindow({ id: 't-s1', budgetRequests: 99 }, T).window.limit).toBe(99)
    expect(w.limit).toBe(3)
  })

  it('放行：CAS 一致才换窗；不给窗口号则「未到顶无可放行」；非法 budgetRequests 按缺省 + note', () => {
    const w = { windowIndex: 0, used: 3, limit: 3, windowStartAt: T }
    const ok = releaseBudget({ ...w, reportedAt: T }, { add: 60, now: T + 1, expectedWindowIndex: 0 })
    expect(ok.released).toBe(true)
    expect(ok.window).toEqual({ windowIndex: 1, used: 0, limit: 60, windowStartAt: T + 1 })
    expect(ok.window.reportedAt).toBeUndefined() // 新窗口未汇报 ⇒ 到顶可再报一次
    // CAS 不一致（纯判定面）：不生效、不叠加窗口、给得出理由
    const stale = releaseBudget(ok.window, { add: 60, now: T + 2, expectedWindowIndex: 0 })
    expect(stale.released).toBe(false)
    expect(stale.window.windowIndex).toBe(1)
    expect(stale.reason).toContain('幂等命中')
    // 不给窗口号：未到顶 ⇒ 无可放行（也不叠加窗口）
    const fresh = releaseBudget({ windowIndex: 1, used: 0, limit: 60, windowStartAt: T }, { add: 60, now: T + 3 })
    expect(fresh.released).toBe(false)
    expect(fresh.window.windowIndex).toBe(1)
    expect(fresh.reason).toContain('尚未到顶')
    // 非法覆盖值：按缺省 60 起算 + note（不阻断开工）
    const bad = openBudgetWindow({ id: 't-s1', budgetRequests: 0 }, T)
    expect(bad.window.limit).toBe(60)
    expect(bad.note).toContain('不是正整数')
    expect(resolveBudgetLimit({ budgetRequests: 2.5 }).limit).toBe(60)
    expect(resolveBudgetLimit({ budgetRequests: 7 }).limit).toBe(7)
  })
})

describe('FR-6 子会话正向判据（fork 窗口不是子会话）', () => {
  it('子代理会话算、纯 fork 窗口不算、插件内部会话不算', () => {
    expect(isSubtaskSession(child(SUB))).toBe(true)
    expect(isSubtaskSession({ id: 'x', header: { delegationDepth: 2 } })).toBe(true) // 只有 depth 也算
    expect(isSubtaskSession(forkWindow('fork-1'))).toBe(false) // 有 parentSession 但 depth 0、无 origin
    expect(isSubtaskSession({ id: 'session-reqboard-abc', header: { origin: 'subagent', delegationDepth: 1 } })).toBe(false)
    expect(isSubtaskSession({ id: W })).toBe(false) // 普通窗口
  })
})

describe('FR-6 计数订阅器：按会话执法 + 分级汇报', () => {
  it('真实形状（executions 里是窗口码）：兜底归属唯一 in_progress 卡 → 卡评论写明依据 + 先停后报 + 独立停手位', async () => {
    const port = new FakeBudgetPort()
    const card = windowCodeCard('t-s1', { budgetRequests: 3 })
    const h = makeHarness({ tasks: [card] })
    const before = await h.taskStore.get('t-s1')
    const c = makeCounter({ port, tasks: [card] })
    expect(card.executions[0]?.sessionId).toBe(W) // 真实形状：窗口码，永不等于子会话 id

    await c.fire(child(SUB), 3)

    // 惰性开窗（无 Dispatch 事件也开窗）+ limit 定格 = 卡上覆盖值；窗口已汇报
    expect(port.state?.tasks['t-s1']).toMatchObject({ windowIndex: 0, used: 3, limit: 3 })
    expect(typeof port.state?.tasks['t-s1']?.reportedAt).toBe('number')
    // ① 先停：停止指令投给**该子会话**（自署来源见投递器测试），且只有一次
    expect(c.stops).toHaveLength(1)
    expect(c.stops[0]?.sessionId).toBe(SUB)
    expect(c.stops[0]?.text).toContain('立即停止发起新请求')
    expect(c.stops[0]?.text).toContain('budget.release')
    // ② 再报：归属依据（兜底必须标注）+ 到顶汇报都写**卡评论**；**不是**需求级评论
    expect(c.comments.some((x) => x.body.includes(BUDGET_MARKS.attribution) && x.body.includes('唯一'))).toBe(true)
    const top = c.comments.find((x) => x.body.includes(BUDGET_MARKS.top))
    expect(top?.taskId).toBe('t-s1')
    expect(top?.body).toContain('晚于**停止时刻')
    expect(c.reqComments).toHaveLength(0)
    expect(c.owners).toHaveLength(1)
    expect(c.owners[0]?.text).toContain(BUDGET_MARKS.top)
    // ⑨ 顺序契约按**投递器调用序列**断言：停止指令的调用严格早于评论写入
    expect(c.firstIndexOf('stop')).toBeGreaterThanOrEqual(0)
    expect(c.firstIndexOf('stop')).toBeLessThan(c.firstIndexOf('comment:t-s1'))
    expect(c.firstIndexOf('stop')).toBeLessThan(c.firstIndexOf('owner'))
    // ④ 停手位：**独立**（不写需求级 driverHealth、不经人工门），作用域 = 卡、第 1 次进入
    const halts = c.runtime.listHalts(T + 10_000)
    expect(halts).toHaveLength(1)
    expect(halts[0]).toMatchObject({ scope: 't-s1', taskId: 't-s1', sessionId: SUB, windowIndex: 0, reentries: 1 })
    expect(halts[0]?.ref).toBe('budget-t-s1-w0')
    expect((await h.store.get(REQ))?.dive?.driverHealth).toBeUndefined()
    // 状态机不动：到顶只留痕，不改卡状态/版本
    const after = await h.taskStore.get('t-s1')
    expect(after?.status).toBe(before?.status)
    expect(after?.version).toBe(before?.version)
    expect(after?.status).toBe('in_progress')
  })

  it('未放行时第 4 次请求不成立，且到顶后仍继续 → 再投一次停止指令（不静默）', async () => {
    const port = new FakeBudgetPort()
    const card = windowCodeCard('t-s1', { budgetRequests: 3 })
    const c = makeCounter({ port, tasks: [card] })
    await c.fire(child(SUB), 3)

    const r4: ChargeReceipt = await c.counter.charge(SUB)
    expect(r4.accepted).toBe(false)
    expect(r4.decision).toBe('exceeded')
    expect(r4.used).toBe(4)
    expect(r4.limit).toBe(3)
    expect(r4.overBy).toBe(1)
    expect(r4.attribution).toBe('parent-unique-in-progress')
    expect(r4.reportTo).toBe('task')
    // 计数继续累加（不静默吞掉越界请求）；窗口号不变（未放行就没有新窗口）
    expect(port.state?.tasks['t-s1']?.used).toBe(4)
    expect(port.state?.tasks['t-s1']?.windowIndex).toBe(0)
    // 再投一次停止指令 + 一条越界留痕（评论只一条，不刷屏）；停手位不重复进入
    expect(c.stops).toHaveLength(2)
    expect(c.comments.filter((x) => x.body.includes(BUDGET_MARKS.overrun))).toHaveLength(1)
    expect(c.diags.some((d) => d.includes(BUDGET_MARKS.overrun))).toBe(true)
    expect(c.runtime.listHalts(T + 10_000)).toHaveLength(1)
    // 第 5 次仍不成立、仍然重投（不静默）
    const r5 = await c.counter.charge(SUB)
    expect(r5.accepted).toBe(false)
    expect(c.stops).toHaveLength(3)
  })

  it('计数不可得：标注「计数不可得」且**不按 0 通过**（端口与内存都无依据）', async () => {
    const port = FakeBudgetPort.unreadable() // read() → undefined = 缺文件/损坏
    const card = sessionMatchedCard('t-s1', SUB, { budgetRequests: 3 })
    const c = makeCounter({ port, tasks: [card] })
    const r = await c.counter.charge(SUB)
    expect(r.countable).toBe(false)
    expect(r.decision).toBe('unknown')
    expect(r.accepted).toBe(false)
    const marked = c.comments.find((x) => x.body.includes('计数不可得'))
    expect(marked?.body).toContain(BUDGET_MARKS.uncountable)
    expect(marked?.body).toContain('不按 0 通过')
    // 不阻断开工：没有停止指令
    expect(c.stops).toHaveLength(0)
  })

  it('写失败不静默失效（P2①）：计数进内存态继续累计 ⇒ 仍能到顶停手 + 可见的「内存态与运行态不一致」诊断', async () => {
    const port = new FakeBudgetPort()
    port.failWrite = true
    const card = sessionMatchedCard('t-s1', SUB, { budgetRequests: 3 })
    const c = makeCounter({ port, tasks: [card] })

    const r1 = await c.counter.charge(SUB)
    expect(r1.decision).toBe('ok') // 抛错则本用例直接失败（"不阻断"的可证伪形式）
    expect(r1.accepted).toBe(true)
    await c.counter.charge(SUB)
    const r3 = await c.counter.charge(SUB)
    // 到顶仍然发生（内存态累计，不因写失败而"used 恒为 1、永不到顶"）
    expect(r3.decision).toBe('exceeded')
    expect(r3.used).toBe(3)
    expect(r3.stopped).toBe(true)
    expect(c.stops).toHaveLength(1)
    const r4 = await c.counter.charge(SUB)
    expect(r4.used).toBe(4)
    expect(r4.accepted).toBe(false)
    // 落盘一直失败 ⇒ 端口态没有这张卡（不假装写成功）
    expect(port.state?.tasks['t-s1']).toBeUndefined()
    // 诊断可见：内存态领先于端口态（不是静默）
    expect(c.diags.some((d) => d.includes(BUDGET_MARKS.memoryDiverged))).toBe(true)
    // 留痕：写失败卡评论（含"不阻断开工"与原始错误）
    const warn = c.comments.find((x) => x.body.includes(BUDGET_MARKS.writeFailed))
    expect(warn?.body).toContain('不阻断开工')
    expect(warn?.body).toContain('disk full')
  })

  it('【新增 A】多卡并行（真实形态）：归属未定但**仍到顶停手**；汇报走需求级评论、不误挂任何卡', async () => {
    const port = new FakeBudgetPort()
    const h = makeHarness({})
    h.seedRequirementSync(req({ status: 'implementing', sourceSessionId: W }))
    // 两张 in_progress 卡，executions 里都是**窗口码**（真实形态）⇒ 归属判不出来
    const cards = [windowCodeCard('t-a', { budgetRequests: 3 }), windowCodeCard('t-b', { budgetRequests: 3 })]
    h.seedTasks(REQ, cards)
    await h.seedSettled()
    const c = makeCounter({ port, tasks: cards, harness: h })

    const subA = 'uuid-a-0000-1111'
    const subB = 'uuid-b-0000-2222'
    await c.fire(child(subA), LIMITS.subtaskRequestBudget)

    // ① 执法照常：这个子会话被**叫停**（不因归属判不出而放行）
    expect(c.stops.map((s) => s.sessionId)).toContain(subA)
    expect(c.runtime.listHalts(T + 60_000).some((x) => x.scope === sessionScopeKey(subA))).toBe(true)
    // ② 汇报**不挂卡**：一个卡评论都没有；需求级评论（comments.jsonl）里点名子会话与「归属未定」
    expect(c.comments).toHaveLength(0)
    expect(c.reqComments).toHaveLength(1)
    expect(c.reqComments[0]?.body).toContain(BUDGET_MARKS.unattributed)
    expect(c.reqComments[0]?.body).toContain('归属未定')
    expect(c.reqComments[0]?.body).toContain(subA.slice(0, 24))
    expect(c.reqComments[0]?.body).toContain('t-a')
    expect(c.reqComments[0]?.body).toContain('t-b')
    // **真的落在需求评论里**（`comments.jsonl`，不是只在夹具数组里）
    const persisted = await h.store.listComments(REQ)
    expect(persisted.some((x) => x.body.includes(BUDGET_MARKS.unattributed))).toBe(true)
    // ③ 停手位按**会话**独立：另一个子会话各自到顶时互不连带
    await c.fire(child(subB), LIMITS.subtaskRequestBudget)
    expect(c.stops.map((s) => s.sessionId)).toEqual([subA, subB])
    const scopes = c.runtime.listHalts(T + 120_000).map((x) => x.scope).sort()
    expect(scopes).toEqual([sessionScopeKey(subA), sessionScopeKey(subB)].sort())
    expect(c.comments).toHaveLength(0) // 始终不误挂任何卡
    expect(c.reqComments).toHaveLength(2)
    // 需求台账**没有**被写成需求级停手位（不连带停发同需求其它可开工卡）
    expect((await h.store.get(REQ))?.dive?.driverHealth).toBeUndefined()
  })

  it('【新增 B】fork 窗口（origin=undefined / parentSession 有 / depth=0）不计入任何预算', async () => {
    const port = new FakeBudgetPort()
    const card = windowCodeCard('t-s1', { budgetRequests: 3 })
    const c = makeCounter({ port, tasks: [card] })

    await c.fire(forkWindow('fork-9f3c'), 61) // 远超缺省 60

    expect(port.state?.tasks).toEqual({})
    expect(c.stops).toHaveLength(0)
    expect(c.comments).toHaveLength(0)
    expect(c.reqComments).toHaveLength(0)
    expect(c.owners).toHaveLength(0)
    expect(c.runtime.listHalts(T + 60_000)).toHaveLength(0)
  })

  it('停手位**过期/被清后可重新进入**（P2：不靠 reportedAt 一次性闸）', async () => {
    const port = new FakeBudgetPort()
    const card = windowCodeCard('t-s1', { budgetRequests: 3 })
    const runtime = createSubtaskRuntime({ ttlMs: 1000 })
    const c = makeCounter({ port, tasks: [card], runtime })

    await c.fire(child(SUB), 3)
    expect(c.runtime.listHalts(c.now()).map((x) => x.reentries)).toEqual([1])
    expect(c.comments.filter((x) => x.body.includes(BUDGET_MARKS.top))).toHaveLength(1)
    // 停手位 TTL 到期（**不是**人工门的 60 分钟，也不吃它的语义）：再请求即**重新进入**并重新汇报
    c.advance(60_000)
    await c.fire(child(SUB), 1)
    const halts = c.runtime.listHalts(c.now())
    expect(halts).toHaveLength(1)
    expect(halts[0]?.reentries).toBe(2) // 重新进入（reportedAt 已写**不**阻止）
    expect(typeof port.state?.tasks['t-s1']?.reportedAt).toBe('number')
    expect(c.comments.filter((x) => x.body.includes(BUDGET_MARKS.top))).toHaveLength(2)
    expect(c.diags.some((d) => d.includes(BUDGET_MARKS.halt))).toBe(true)
  })

  it('停手位按卡独立：卡 A 到顶不停卡 B（不连带、也无需求级停手位）', async () => {
    const port = new FakeBudgetPort()
    const cardA = sessionMatchedCard('t-a', 'uuid-a', { budgetRequests: 3 })
    const cardB = sessionMatchedCard('t-b', 'uuid-b', { budgetRequests: 3 })
    const h = makeHarness({})
    h.seedRequirementSync(req({ status: 'implementing', sourceSessionId: W }))
    h.seedTasks(REQ, [cardA, cardB])
    await h.seedSettled()
    const c = makeCounter({ port, tasks: [cardA, cardB], harness: h })

    await c.fire(child('uuid-a'), 3)
    expect(c.runtime.listHalts(c.now()).map((x) => x.scope)).toEqual(['t-a'])
    expect(port.state?.tasks['t-b']).toBeUndefined() // 卡 B 一点都没被牵连

    await c.fire(child('uuid-b'), 3)
    expect(c.runtime.listHalts(c.now()).map((x) => x.scope).sort()).toEqual(['t-a', 't-b'])
    expect(c.stops.map((s) => s.sessionId)).toEqual(['uuid-a', 'uuid-b'])
    expect((await h.store.get(REQ))?.dive?.driverHealth).toBeUndefined()
  })

  it('只认子会话：父窗口自己的 assistant/message 不计入任何卡', async () => {
    const port = new FakeBudgetPort()
    const card = windowCodeCard('t-s1', { budgetRequests: 3 })
    const c = makeCounter({ port, tasks: [card] })
    await c.fire({ id: W }, 3) // 父窗口自己发请求：无 header ⇒ 不是子会话
    expect(port.state?.tasks).toEqual({})
    expect(c.stops).toHaveLength(0)
  })
})

describe('FR-6 放行入口（reqboard_task_move.budget）+ 投递器纪律', () => {
  const run = (t: unknown, args: unknown): Promise<Record<string, any>> =>
    (t as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

  async function seeded() {
    const port = new FakeBudgetPort({
      v: 1, tasks: { 't-s1': { windowIndex: 0, used: 3, limit: 3, windowStartAt: T, reportedAt: T + 5 } },
    })
    const card = windowCodeCard('t-s1')
    const h = makeHarness({ tasks: [card] })
    h.seedRequirementSync(req({ status: 'implementing', sourceSessionId: W }))
    await h.seedSettled()
    h.deps.subtaskBudget = port
    const runtime = createSubtaskRuntime()
    h.deps.subtaskRuntime = runtime
    const driven: string[] = []
    h.deps.notifyDrivable = (id: string) => { driven.push(id) }
    return { port, card, h, runtime, driven }
  }

  it('放行：窗口重置可续跑；重复放行幂等；清独立停手位 + 会话换窗 + 请求驱动；status/version 不动', async () => {
    const { port, card, h, runtime, driven } = await seeded()
    const t = defineTaskMoveTool(h.deps)
    const before = await h.taskStore.get('t-s1')
    // 先造一个真实的到顶现场：会话窗口在窗口 0 且已到顶 + 该卡有停手位
    runtime.chargeSession({ sessionId: SUB, taskId: 't-s1', limit: 3, at: T })
    runtime.chargeSession({ sessionId: SUB, taskId: 't-s1', limit: 3, at: T })
    runtime.chargeSession({ sessionId: SUB, taskId: 't-s1', limit: 3, at: T })
    runtime.enterHalt({ ref: 'budget-t-s1-w0', scope: 't-s1', sessionId: SUB, taskId: 't-s1', windowIndex: 0, at: T })

    const out = await run(t, { task_id: 't-s1', budget: { release: true, expectedWindowIndex: 0 }, reason: '已汇报卡点，人工判断继续值得' })
    expect(out.success).toBe(true)
    expect(out.budget).toEqual({ task_id: 't-s1', windowIndex: 1, limit: 60, released: true }) // 缺省额度 = 60 单点常量
    expect(port.state?.tasks['t-s1']).toMatchObject({ windowIndex: 1, used: 0, limit: 60 })
    expect(port.state?.tasks['t-s1']?.reportedAt).toBeUndefined()
    // 独立停手位被清 + 该卡的会话窗口一起换窗（否则下一个请求立刻再次到顶 = 放行等于没放）
    expect(runtime.listHalts(T + 10_000)).toHaveLength(0)
    expect(runtime.windowOfSession(SUB)).toMatchObject({ windowIndex: 1, used: 0, limit: 60 })
    // 清位即请求一次驱动（与人工门 onCleared 同一条路）
    expect(driven).toEqual([REQ])

    const mid = await h.taskStore.get('t-s1')
    expect(mid?.status).toBe(before?.status) // 不改任务状态机
    expect(mid?.version).toBe(before?.version)
    expect(mid?.comments.some((x) => x.body.includes(BUDGET_MARKS.released))).toBe(true)

    // 重复放行：不给 expectedWindowIndex ⇒ 幂等命中（不叠加窗口），但**各留一次痕**
    const dup = await run(t, { task_id: 't-s1', budget: { release: true }, reason: '重复点了一次' })
    expect(dup.success).toBe(true)
    expect(dup.budget).toEqual({ task_id: 't-s1', windowIndex: 1, limit: 60, released: false })
    expect(port.state?.tasks['t-s1']?.windowIndex).toBe(1)
    const after = await h.taskStore.get('t-s1')
    expect(after?.version).toBe(before?.version)
    expect(after?.comments.filter((x) => x.body.includes(BUDGET_MARKS.notReleased))).toHaveLength(1)

    // 放行后可继续：同一个计数器接着计数（窗口 1 的第 1 次请求落在额度内）
    const c = makeCounter({ port, tasks: [card], runtime })
    const r = await c.counter.charge(SUB)
    expect(r.accepted).toBe(true)
    expect(r.windowIndex).toBe(1)
    expect(r.used).toBe(1)
  })

  it('放行 CAS（P2②）：expectedWindowIndex 不匹配即拒，并给出**当前**窗口号（结构性 + 文案）', async () => {
    const { port, h } = await seeded()
    const t = defineTaskMoveTool(h.deps)
    const stale = await run(t, { task_id: 't-s1', budget: { release: true, expectedWindowIndex: 7 }, reason: 'r' })
    expect(stale.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（CAS 不匹配 = REQBOARD_CONFLICT）
    expectCode(stale, 'REQBOARD_CONFLICT')
    expect(stale.code).toBe('REQBOARD_CONFLICT')
    expect(String(stale.error)).toContain('expectedWindowIndex=7')
    expect(String(stale.error)).toContain('当前窗口号 #0')
    expect(stale.budget).toEqual({ task_id: 't-s1', windowIndex: 0, limit: 3, released: false }) // 当前窗口号（结构化）
    // 拒绝 = 零写入：窗口没换、没有留痕
    expect(port.state?.tasks['t-s1']).toMatchObject({ windowIndex: 0, used: 3 })
    expect(port.writes).toHaveLength(0)
  })

  it('放行入参值域：release 非 true / add 非正整数 / expectedWindowIndex 非法 / 未装配端口 / 非 owner 一律响亮拒绝', async () => {
    const { h } = await seeded()
    const t = defineTaskMoveTool(h.deps)
    const bad = await run(t, { task_id: 't-s1', budget: { release: false } })
    expect(bad.code).toBe('REQBOARD_INVALID_INPUT')
    expect(String(bad.error)).toContain('budget.release')
    const zero = await run(t, { task_id: 't-s1', budget: { release: true, add: 0 }, reason: 'r' })
    expect(zero.code).toBe('REQBOARD_INVALID_INPUT')
    const frac = await run(t, { task_id: 't-s1', budget: { release: true, expectedWindowIndex: 1.5 }, reason: 'r' })
    expect(frac.code).toBe('REQBOARD_INVALID_INPUT')
    expect(String(frac.error)).toContain('expectedWindowIndex')
    const noReason = await run(t, { task_id: 't-s1', budget: { release: true } })
    expect(noReason.code).toBe('REQBOARD_INVALID_INPUT')
    // 未装配端口：响亮回 unavailable（不假成功）
    const { h: h2 } = await seeded()
    h2.deps.subtaskBudget = undefined
    const un = await run(defineTaskMoveTool(h2.deps), { task_id: 't-s1', budget: { release: true }, reason: 'r' })
    expect(un.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码——这里逐字落码**不违背**下方「不新造码、不擅动清单」
    // 的纪律：该码在 tests/fixtures/error-code-inventory.json 里本就记为 coveredHow=literal（tests/error-code-matrix.test.ts
    // 已落过字面量），本次已跑 error-code-inventory 守卫核对（11 passed），覆盖态零漂移。
    expectCode(un, 'REQBOARD_STORE_INCONSISTENT')
    // 端口未装配 = 组合根缺端口：**复用既有码**（与 queue-access 的 taskStoreOf/requirementStoreOf 同源，
    // 「不新造码」）。这里刻意只断言前缀与文案——把那个码逐字抄进本文件会改动
    // `tests/fixtures/error-code-inventory.json` 的覆盖态（那是另一张卡的清单维护范围）。
    expect(String(un.code)).toMatch(/^REQBOARD_[A-Z_]+$/)
    expect(String(un.error)).toContain('未装配')
    // 别的窗口（非 owner）不能放行
    const other = (defineTaskMoveTool(h.deps) as { execute: (a: unknown, e: unknown) => Promise<any> })
    const out = await other.execute({ task_id: 't-s1', budget: { release: true }, reason: 'r' }, { agent: { id: 'session-other' } })
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（非 owner 放行 = 不属于本窗口绑定的需求）
    expectCode(out, 'REQBOARD_NOT_BOUND_TO_WINDOW')
    expect(['REQBOARD_NO_BOUND_REQ', 'REQBOARD_NOT_BOUND_TO_WINDOW']).toContain(out.code)
  })

  it('投递器：只 inbox.prepend（**无 followup**）；停止指令走 next-step，owner 活跃 next-step / 空闲 next-turn', () => {
    const prepended: { target: string; message: any }[] = []
    let followupCalls = 0
    const agent = {
      id: 'session-x', status: 'busy',
      inbox: { prepend: (target: string, message: unknown) => prepended.push({ target, message }) },
      followup: () => { followupCalls += 1 },
    }
    const notify = createInboxNotify({ agents: () => ({ get: (id: string) => (id === 'session-x' ? agent : undefined) }), plugin: 'dsh-pmboard' })
    expect(notify.stopSubagent({ sessionId: 'session-x', requirementId: REQ, text: '停止' }).ok).toBe(true)
    expect(prepended[0]?.target).toBe('next-step')
    // owner 活跃（status=busy）→ next-step
    const busy = notify.notifyOwner({ windowKey: 'session-x', requirementId: REQ, text: '到顶' })
    expect(busy).toMatchObject({ ok: true, channel: 'inbox-next-step' })
    // owner 空闲（status=idle）→ next-turn（排队等下个回合，仍不起新回合）
    agent.status = 'idle'
    const idle = notify.notifyOwner({ windowKey: 'session-x', requirementId: REQ, text: '到顶' })
    expect(idle).toMatchObject({ ok: true, channel: 'inbox-next-turn' })
    expect(prepended.map((p) => p.target)).toEqual(['next-step', 'next-step', 'next-turn'])
    // ⑥ owner 通知路径**不含 followup**（本仓曾因它额外起一整轮 agent loop 返工）
    expect(followupCalls).toBe(0)
    // 自署来源：不是 user（冒充人类会让窗口把系统提示当人话执行）
    expect(prepended[0]?.message.source.kind).toBe('dive')
    expect(prepended[0]?.message.role).toBe('user')
    // 窗口不在线 → 如实回报未送达（不谎报）
    const miss = notify.notifyOwner({ windowKey: 'session-absent', requirementId: REQ, text: 'x' })
    expect(miss.ok).toBe(false)
    expect(miss.reason).toContain('不在线')
    expect(followupCalls).toBe(0)
  })
})

describe('FR-6 开窗接线（ExecuteTask.executeSubtask 显式开窗）', () => {
  it('开工时按卡上 budgetRequests 定格窗口；重复开工幂等（不覆盖已开窗口）', async () => {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: REQ, status: 'implementing' }))
    h.seedTasks(REQ, [
      task({ id: 't-p', requirementId: REQ, status: 'in_progress', title: '父卡' }),
      task({
        id: 't-s', requirementId: REQ, status: 'todo', parentId: 't-p', stageKind: 'dev' as never,
        title: '研发', acceptance: '改动落盘并跑通测试', budgetRequests: 3,
      }),
    ])
    await h.seedSettled()
    const port = new FakeBudgetPort({ v: 1, tasks: {} })
    h.deps.subtaskBudget = port
    // 引擎不可达也会先开窗（开窗在派发之前）；本用例只钉开窗这一件事。
    h.deps.workflow = { start: async () => ({ ok: false, reason: 'test-stop' }) } as never

    await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: W, exec: { agent: { id: W } } })
    expect(port.state?.tasks['t-s']).toEqual({ windowIndex: 0, used: 0, limit: 3, windowStartAt: h.clock.t })

    // 幂等：窗口已存在 ⇒ 原样返回，**不覆盖**（limit 定格；已用次数不清零）
    const before = port.writes.length
    await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: W, exec: { agent: { id: W } } })
    expect(port.state?.tasks['t-s']).toMatchObject({ windowIndex: 0, used: 0, limit: 3 })
    expect(port.writes.length).toBe(before)
  })
})
