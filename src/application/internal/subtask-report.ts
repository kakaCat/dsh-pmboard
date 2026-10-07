/**
 * 到顶**处置链**：先停 → 再报 → 等放行（REQ-261007100513-6749 t5 ← FR-6 / 用户裁定 D-3）。
 *
 * 为什么单独成模块（而不是留在计数订阅器里）：这是**汇报链**，与「按会话计数」是两件事——
 * 返工口径要求「执法单位 = 子会话，归属只决定**汇报写到哪里**」，两条链各占一个模块最不容易再次耦合。
 * 另外 `request-counter.ts` 有 400 行硬上限（`tests/size-budget.test.ts`），拆开也让两边的注释都放得下。
 *
 * 顺序就是契约：**① 先投停止指令 → ② 再写汇报 → ③ 登记停手位**。测试断言的是**投递器调用序列**
 * （`stopSubagent` 的调用确实早于评论写入），不只是两次时钟读数有序。
 *
 * 汇报去向（P1②，**绝不猜**）：
 *  · 已归属（`exact-session` / `parent-unique-in-progress`）→ **卡评论**；兜底归属必须**写明依据**；
 *  · 未归属 → **需求级评论**（`comments.jsonl`），点名子会话 id 与「归属未定」+ 在制卡清单，
 *    **一个卡评论都不写**（挂错卡 = 停错卡 + 伪造归属）。
 *
 * 停手位（P2）：登记在 `SubtaskRuntimePort` 上，按**卡或会话**独立存在——**不**复用人工门
 * in-flight、**不**写 `dive.driverHealth`（那会把同需求所有可开工卡一起停发）。
 *
 * 本模块**永不抛**：一切失败收口为 warn + 诊断，绝不污染 `session/event` 派发。
 *
 * @module dsh-pmboard/application/internal/subtask-report
 */
import { fmt } from '../../domain/text/fmt.js'
import type { SubtaskRuntimePort } from '../ports.js'
import type { TaskRecord } from '../../shared/protocol.js'
import {
  BUDGET_MARKS,
  stopInstructionText,
  topReportText,
  unattributedTopReportText,
} from './task-comment.js'
import { budgetAwaitingRef, type SubtaskBudgetWindow } from './subtask-budget.js'

/** 归属依据（**只决定汇报去向**，不参与到顶判定）。 */
export type AttributionBasis = 'exact-session' | 'parent-unique-in-progress'

/** 归属结果（计数与执法**不看**它；只有本模块的汇报看）。 */
export type BudgetAttribution =
  | { kind: 'task'; task: TaskRecord; basis: AttributionBasis }
  | { kind: 'none'; requirementId?: string; reason: string; candidates: readonly string[] }

/** 处置链要用的四个出口（都由计数订阅器注入，永不抛是调用方的责任）。 */
export interface StopReportDeps {
  /** ① 向**子会话**投停止指令（返回是否送达）。 */
  stopSubagent(input: {
    sessionId: string; taskId?: string; requirementId?: string; text: string; at: number
  }): boolean
  /** ② 通知 owner（活跃 `next-step` / 空闲 `next-turn`；返回是否送达）。 */
  notifyOwner(input: { requirementId: string; text: string; at: number }): boolean
  /** 卡评论（已归属时的汇报去向）。 */
  appendComment(input: { taskId: string; body: string; at: number }): Promise<void> | void
  /** 需求级评论（归属未定时的汇报去向；落 `comments.jsonl`）。 */
  appendRequirementComment(input: { requirementId: string; body: string; at: number }): Promise<void> | void
  now(): number
  diagnose?(message: string): void
  logger?: { warn(message: string, err?: unknown): void }
  /** 「同一件事只留一次痕」闸（作用域×窗口×类别）——由调用方持有，跨次调用共享。 */
  once(key: string): boolean
}

export interface ExceededReportInput {
  sessionId: string
  attribution: BudgetAttribution
  /** 已归属的卡（undefined = 归属未定）。 */
  task?: TaskRecord
  requirementId?: string
  /** 停手位作用域键（卡 id / `sess:<会话 id>`）。 */
  scope: string
  window: SubtaskBudgetWindow
  /** true = 本窗口**首次**到顶（停手位不存在）：要写汇报 + 登记停手位；false = 仍在停手位上，只重投停止指令。 */
  firstReport: boolean
  overBy: number
}

export interface ExceededReportResult {
  stopped: boolean
  halted: boolean
  haltReentries?: number
}

/** 到顶处置（顺序即契约：先停 → 再报 → 等放行）。 */
export async function reportExceeded(
  deps: StopReportDeps,
  runtime: SubtaskRuntimePort,
  input: ExceededReportInput,
): Promise<ExceededReportResult> {
  const { sessionId, task, scope, window, firstReport } = input
  const warn = (m: string, e?: unknown): void => { try { deps.logger?.warn?.(m, e) } catch { /* 日志不影响处置 */ } }
  const diag = (m: string): void => { try { deps.diagnose?.(m) } catch { /* 诊断不影响处置 */ } }
  const comment = async (taskId: string, body: string, at: number): Promise<void> => {
    try { await deps.appendComment({ taskId, body, at }) } catch (err) { warn('子卡预算：卡评论写入失败', err) }
  }
  const reqComment = async (requirementId: string, body: string, at: number): Promise<void> => {
    try { await deps.appendRequirementComment({ requirementId, body, at }) } catch (err) {
      warn('子卡预算：需求级评论写入失败', err)
    }
  }
  /** 汇报写哪里（已归属 → 卡评论；否则 → 需求级评论；都没有 → 只留诊断）。 */
  const write = async (body: string, at: number): Promise<void> => {
    if (task !== undefined) await comment(task.id, body, at)
    else if (input.requirementId !== undefined) await reqComment(input.requirementId, body, at)
    else diag(fmt('{mark}：{body}', { mark: BUDGET_MARKS.unattributed, body }))
  }

  // ① 先停（本函数里**最早**的一次投递器调用）
  const stopAt = deps.now()
  let stopped = false
  try {
    stopped = deps.stopSubagent({
      sessionId, at: stopAt,
      ...(task === undefined ? {} : { taskId: task.id }),
      ...(input.requirementId === undefined ? {} : { requirementId: input.requirementId }),
      text: stopInstructionText({
        sessionId, windowIndex: window.windowIndex, limit: window.limit,
        ...(task === undefined ? {} : { taskId: task.id }),
      }),
    }) === true
  } catch (err) {
    warn('子卡预算：停止指令投递抛错（已兜住）', err)
  }

  // 仍在同一停手位上（到顶后**继续**发请求）：诊断逐次留痕，评论只一次（不刷屏），**不静默**
  if (!firstReport) {
    diag(fmt('{mark}：{s} 第 {w} 窗已用 {used}/{limit}（超 {over} 次），已**再次**投递停止指令', {
      mark: BUDGET_MARKS.overrun, s: sessionId.slice(0, 24), w: String(window.windowIndex),
      used: String(window.used), limit: String(window.limit), over: String(input.overBy),
    }))
    if (deps.once('overrun|' + scope + '|' + window.windowIndex)) {
      await write(fmt('{mark}：子会话 {s} 第 {w} 窗已用 {used}/{limit}（超 {over} 次）——已**再次**投递停止指令（不静默）。'
        + '后续每次越界请求都继续计数并重投停止指令（评论不重复刷屏，诊断逐次留痕）。', {
        mark: BUDGET_MARKS.overrun, s: sessionId.slice(0, 24), w: String(window.windowIndex),
        used: String(window.used), limit: String(window.limit), over: String(input.overBy),
      }), deps.now())
    }
    return { stopped, halted: false }
  }

  // ② 再报（**晚于**停止调用）
  const reportAt = deps.now()
  const common = {
    sessionId, windowIndex: window.windowIndex, limit: window.limit, used: window.used,
    stopAt, reportAt, stopDelivered: stopped,
  }
  if (task !== undefined) {
    if (input.attribution.kind === 'task' && input.attribution.basis === 'parent-unique-in-progress') {
      await comment(task.id, fmt('{mark}：子会话 {s} 在 executions[].sessionId 里查不到 → 按父窗口在该需求下'
        + '**唯一**的 in_progress 卡 {id} 归属（兜底口径，已标注；若归属有误请人工核对）。', {
        mark: BUDGET_MARKS.attribution, s: sessionId.slice(0, 24), id: task.id,
      }), reportAt)
    }
    await comment(task.id, topReportText({
      ...common,
      ...(input.attribution.kind === 'task' ? { basis: input.attribution.basis } : {}),
    }), reportAt)
  } else if (input.requirementId !== undefined) {
    await reqComment(input.requirementId, unattributedTopReportText({
      ...common,
      reason: input.attribution.kind === 'none' ? input.attribution.reason : '归属未知',
      candidates: input.attribution.kind === 'none' ? input.attribution.candidates : [],
    }), reportAt)
  }
  if (!stopped && deps.once('stopfail|' + scope + '|' + window.windowIndex)) {
    await write(fmt('{mark}：子会话 {sid} 不在线或无 inbox → 停止指令**没送到**。'
      + '软门禁只能靠汇报与放行约束，请人工确认该子代理是否还在跑。', {
      mark: BUDGET_MARKS.stopUndelivered, sid: sessionId.slice(0, 24),
    }), deps.now())
  }
  if (input.requirementId !== undefined) {
    try {
      deps.notifyOwner({
        requirementId: input.requirementId, at: deps.now(),
        text: fmt('{mark}：{what}第 {w} 窗用满 {limit} 次请求，已叫停并等放行。'
          + '放行：reqboard_task_move 的 budget.release（task_id 填{tail}，reason 必填，'
          + '可带 expectedWindowIndex 做 CAS）；不打算继续就把它退回 todo / 取消。', {
          mark: BUDGET_MARKS.top,
          what: task === undefined
            ? fmt('子会话 {s}（**归属未定**，见需求级评论）', { s: sessionId.slice(0, 24) })
            : fmt('{id}（{title}）', { id: task.id, title: task.title }),
          w: String(window.windowIndex), limit: String(window.limit),
          tail: task === undefined ? '经需求级评论核对出的那张卡' : fmt('本卡 {id}', { id: task.id }),
        }),
      })
    } catch (err) {
      warn('子卡预算：owner 通知抛错（评论已落，不回滚）', err)
    }
  }

  // ③ 等放行：登记**独立**停手位（按卡或按会话；不复用人工门 in-flight ⇒ 不连带停发同需求其它卡）
  const scopeId = task === undefined ? sessionId : task.id
  const halt = runtime.enterHalt({
    ref: budgetAwaitingRef(scopeId, window.windowIndex), scope, sessionId, windowIndex: window.windowIndex,
    at: reportAt,
    ...(task === undefined ? {} : { taskId: task.id }),
    ...(input.requirementId === undefined ? {} : { requirementId: input.requirementId }),
  })
  if (halt.entered) {
    diag(fmt('{mark}：{ref} 已登记（第 {n} 次进入；失效或被清后可**重新进入**，不是一次性闸）', {
      mark: BUDGET_MARKS.halt, ref: halt.halt.ref, n: String(halt.halt.reentries),
    }))
  }
  return { stopped, halted: halt.entered, haltReentries: halt.halt.reentries }
}
