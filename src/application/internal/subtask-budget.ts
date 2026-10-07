/**
 * 子卡**请求预算**：纯判定 + 两处落地写路径（REQ-261007100513-6749 t5 ← FR-6 / 设计 I-4，用户裁定 D-3）。
 *
 * **纯判定**（无 I/O、可单测、可复现）：
 *   · `openBudgetWindow` —— 开窗：`limit` 在**开窗时定格**（事后改台账/改 `budgetRequests`
 *     不影响已开窗口，避免「同一窗口前后两次判定不同」的漂移，先例见 `claimedAt` 基准的坑）；
 *   · `chargeRequest` —— 记一次请求：**先计数再判**（请求已经发生了，计数是事实），
 *     到顶 = `used >= limit`（第 limit 次请求后即到顶 ⇒ 先停后报，第 limit+1 次「不成立」）；
 *   · `releaseBudget` —— 幂等放行：`windowIndex += 1`、`used` 归零、`limit = add`。
 *
 * **落地写路径**（经端口/用例 deps；都永不抛、失败只告警 + 留痕 + 不阻断开工）：
 *   · `openSubtaskBudgetWindow` —— 开窗落盘（`ExecuteTask.executeSubtask` 显式接线）；
 *   · `releaseSubtaskBudget` —— owner 放行（`reqboard_task_move({budget:{release:true}})` 的实现）。
 * 为什么这两处放在本模块：它们只是"把上面的判定写进运行态"的**唯一出口**（窗口的 `limit` 定格、
 * 放行的幂等比较与写入必须同源），散到工具层会让同一口径出现第二份实现。
 *
 * 类型落点纪律（t1 复核对齐，2026-10-07）：`SubtaskBudgetState` **唯一**声明在
 * `src/shared/protocol.ts`；本模块**只 import**，`SubtaskBudgetWindow` 由索引访问派生
 * （`State['tasks'][string]`）⇒ 全仓不存在第二份同形声明（本仓已多次因口径分叉返工）。
 *
 * 幂等放行的实现口径（见 `releaseBudget` / `releaseSubtaskBudget` 注释）：本仓运行态文件**不给**
 * 运行态加隐藏字段（`SubtaskBudgetState` 的字段表由契约测试逐字钉住），故原子性由调用方给出的
 * `expectedWindowIndex`（**CAS**）落在外层：不等于当前窗口号即**拒**（并回报当前窗口号），
 * 一致才换窗；不给该值时退化为「当前窗口尚未到顶 ⇒ 无可放行」的幂等口径。
 *
 * 计数与停手位的落点（t5 返工 P1/P2）：**按子会话**（`internal/subtask-runtime.ts`），
 * 本模块只管**按卡**的运行态文件与放行写路径——两者不混（多卡并行时按卡的键根本不存在）。
 *
 * @module dsh-pmboard/application/internal/subtask-budget
 */

import { LIMITS } from '../../domain/limits.js'
import { fmt } from '../../domain/text/fmt.js'
import type { SubtaskBudgetState, TaskRecord } from '../../shared/protocol.js'
import type { UseCaseDeps } from '../ports.js'
import { taskStoreOf } from '../use-cases/queue-access.js'
import { canWrite, openRequirementsForVia, seatOf } from './window.js'
import { requestDriveQuietly } from './awaiting-confirm.js'
import { appendTaskComment, BUDGET_MARKS, errText, SYSTEM_ACTOR } from './task-comment.js'

/** 单卡窗口态（**派生自协议类型**，不另立声明）。 */
export type SubtaskBudgetWindow = SubtaskBudgetState['tasks'][string]

/**
 * 运行态文件的**相对落点**（`<dshHome>/state/subtask-budget.json`）——单一落点，
 * 与 `capture-rejections.ts` 的 `CAPTURE_REJECTION_REL` 同款（组合根只 import，不手抄路径）。
 */
export const SUBTASK_BUDGET_REL = 'state/subtask-budget.json'

/** 空运行态（文件缺失/损坏时的重建基线 = 「从本窗口 0 起算」）。 */
export function emptyBudgetState(): SubtaskBudgetState {
  return { v: 1, tasks: {} }
}

export function budgetWindowOf(state: SubtaskBudgetState | undefined, taskId: string): SubtaskBudgetWindow | undefined {
  return state?.tasks[taskId]
}

/** 覆盖式写回单卡窗口（返回新对象，不改入参）。 */
export function withBudgetWindow(state: SubtaskBudgetState, taskId: string, window: SubtaskBudgetWindow): SubtaskBudgetState {
  return { v: 1, tasks: { ...state.tasks, [taskId]: window } }
}

/** 正整数判定（`budgetRequests` 的读侧口径：非正整数按缺省处理 + 留诊断，**不阻断开工**）。 */
export function positiveIntOf(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined
}

/** 本卡生效上限（卡上覆盖 → 缺省常量）。非法覆盖值返回 `note`（调用方据此留诊断）。 */
export function resolveBudgetLimit(task: Pick<TaskRecord, 'budgetRequests'>): { limit: number; note?: string } {
  const overridden = positiveIntOf(task.budgetRequests)
  if (overridden !== undefined) return { limit: overridden }
  if (task.budgetRequests === undefined) return { limit: LIMITS.subtaskRequestBudget }
  const note = fmt('budgetRequests={raw} 不是正整数 → 按缺省 {d} 起算（不阻断开工；单一落点=domain/limits.ts）', {
    raw: JSON.stringify(task.budgetRequests), d: LIMITS.subtaskRequestBudget,
  })
  return { limit: LIMITS.subtaskRequestBudget, note }
}

/** 以**已知上限**开窗（窗口 0）。上限的解析（卡上覆盖 / 缺省 / 非法值诊断）见 `resolveBudgetLimit`。 */
export function openWindowWithLimit(limit: number, now: number): SubtaskBudgetWindow {
  return { windowIndex: 0, used: 0, limit, windowStartAt: now }
}

/** 开窗（**窗口 0**）：`limit` 定格在这一次调用上。 */
export function openBudgetWindow(
  task: Pick<TaskRecord, 'id' | 'budgetRequests'>,
  now: number,
): { window: SubtaskBudgetWindow; note?: string } {
  const { limit, note } = resolveBudgetLimit(task)
  const window = openWindowWithLimit(limit, now)
  return { window, ...(note === undefined ? {} : { note }) }
}

export interface ChargeResult {
  window: SubtaskBudgetWindow
  /** 本次之后**是否到顶**（到顶 = 先停后报的触发条件；第 limit 次即为真）。 */
  exceeded: boolean
  /** 本次请求是否**落在额度内**（`limit=3` 时第 4 次为 false ⇒「不成立」）。 */
  accepted: boolean
  /** 超出的次数（未超 = 0）。 */
  overBy: number
}

/** 记一次请求：**先计数再判**（请求真的发生了，计数是事实；到顶后仍继续也照样累加）。 */
export function chargeRequest(w: SubtaskBudgetWindow): ChargeResult {
  const used = w.used + 1
  return {
    window: { ...w, used },
    exceeded: used >= w.limit,
    accepted: used <= w.limit,
    overBy: Math.max(0, used - w.limit),
  }
}

export interface ReleaseInput {
  /** 放行后的新窗口上限（正整数；缺省由调用方用 `resolveBudgetLimit` 补）。 */
  add: number
  now: number
  /**
   * 调用方**看到的**窗口号（CAS 的纯判定面）。
   * 给了 ⇒ 比较并写入：与当前窗口号不等 = 这一窗已经放过（或被换掉）⇒ **不生效**（不叠加窗口）。
   * 不给 ⇒ 按「当前窗口是否已到顶」判：未到顶（`used < limit`）= 无可放行 ⇒ 幂等命中。
   *
   * ⚠️ 生产入口（`releaseSubtaskBudget`）在调用本函数**之前**就按同一个值做了 CAS **拒绝**
   * （不匹配 → `REQBOARD_CONFLICT` + 当前窗口号）；这里保留该分支是为了让纯判定的三种输入
   * 都有可解释的结果（同一份口径不出现第二种语义）。
   */
  expectedWindowIndex?: number
}

export interface ReleaseResult {
  window: SubtaskBudgetWindow
  /** true = 本次调用**确实**放行了一个新窗口；false = 幂等命中（不叠加窗口）。 */
  released: boolean
  reason?: string
}

/**
 * 幂等放行（纯判定）。**两个分支都必须能解释为什么"这次不生效"**——静默返回 `released:false`
 * 而无 `reason` 会让"放行没生效"变成不可排查的事件（本仓「失败要响亮」）。
 */
export function releaseBudget(w: SubtaskBudgetWindow, input: ReleaseInput): ReleaseResult {
  if (input.expectedWindowIndex !== undefined && input.expectedWindowIndex !== w.windowIndex) {
    return {
      window: w,
      released: false,
      reason: fmt('窗口 #{asked} 的放行已经生效过（当前已是 #{cur}）→ 幂等命中，不叠加窗口', {
        asked: String(input.expectedWindowIndex), cur: String(w.windowIndex),
      }),
    }
  }
  if (input.expectedWindowIndex === undefined && w.used < w.limit) {
    return {
      window: w,
      released: false,
      reason: fmt('本窗口尚未到顶（{used}/{limit}）→ 无可放行（幂等命中）', {
        used: String(w.used), limit: String(w.limit),
      }),
    }
  }
  return {
    window: { windowIndex: w.windowIndex + 1, used: 0, limit: input.add, windowStartAt: input.now },
    released: true,
  }
}

/** 到顶汇报落章（同一窗口只报一次 ⇒ 幂等）。 */
export function markBudgetReported(state: SubtaskBudgetState, taskId: string, at: number): SubtaskBudgetState {
  const w = state.tasks[taskId]
  if (w === undefined || w.reportedAt !== undefined) return state
  return withBudgetWindow(state, taskId, { ...w, reportedAt: at })
}

/** 本次计数的裁决三态（`unknown` = 计数不可得：**显式未知**，绝不当作"已用 0 次所以放行"）。 */
export type BudgetDecision = 'ok' | 'exceeded' | 'unknown'

// ---------------------------------------------------------------------------
// 落地写路径（经端口 / 用例 deps；都永不抛、失败只告警 + 留痕 + 不阻断开工）
// ---------------------------------------------------------------------------

/**
 * 显式开窗（`ExecuteTask.executeSubtask` 的接线；与计数订阅器的**惰性开窗**共用同一套纯判定）。
 *
 * 幂等：窗口已存在则原样返回（`limit` 在开窗时定格，事后改台账不影响已开窗口）。
 * **永不抛**：失败 → 告警 + 卡评论留痕 + 不阻断开工（计数丢失不等于卡不能干）。
 */
export async function openSubtaskBudgetWindow(
  deps: UseCaseDeps,
  input: { task: Pick<TaskRecord, 'id' | 'budgetRequests' | 'requirementId'>; at?: number },
): Promise<{ opened: boolean; window?: SubtaskBudgetWindow; note?: string }> {
  const port = deps.subtaskBudget
  if (port === undefined) return { opened: false, note: 'deps.subtaskBudget 未装配（预算链整体零行为）' }
  const at = input.at ?? deps.clock.now()
  try {
    const state = await port.read()
    const existing = budgetWindowOf(state, input.task.id)
    if (existing !== undefined) return { opened: false, window: existing }
    const opened = openBudgetWindow(input.task, at)
    await port.write(withBudgetWindow(state ?? emptyBudgetState(), input.task.id, opened.window))
    return { opened: true, window: opened.window, ...(opened.note === undefined ? {} : { note: opened.note }) }
  } catch (err) {
    const why = errText(err)
    try { deps.alert?.alert({ requirementId: input.task.requirementId, title: '子卡预算开窗失败', content: why }) } catch { /* 不阻断 */ }
    try {
      await appendTaskComment(
        deps, input.task.id,
        fmt('{mark}（已告警，**不阻断开工**）：{e}', { mark: BUDGET_MARKS.openFailed, e: why }),
        SYSTEM_ACTOR, at,
      )
    } catch { /* 留痕失败不阻断 */ }
    return { opened: false, note: why }
  }
}

/** 放行回执（成功/失败都是**正常回执**，不抛——工具层据此组 `{success, budget|error, code}`）。 */
export type ReleaseSubtaskBudgetReceipt =
  | { ok: true; task_id: string; windowIndex: number; limit: number; released: boolean; note?: string }
  | { ok: false; code: string; error: string; windowIndex?: number; limit?: number }

export interface ReleaseSubtaskBudgetInput {
  taskId: string
  windowKey: string
  reason: string
  /** 追加额度（正整数；缺省 = 卡上 `budgetRequests ?? LIMITS.subtaskRequestBudget`）。 */
  add?: number
  /**
   * 调用方**看到的**窗口号（CAS）：一致才换窗；不一致 → **拒绝**并在文案与回执里给出当前窗口号
   * （不做读改写竞态下的猜测）。不给 = 退化为「当前窗口尚未到顶 ⇒ 无可放行」的幂等口径。
   */
  expectedWindowIndex?: number
  at?: number
}

/**
 * 放行（`reqboard_task_move({budget:{release:true}})` 的实现）。
 *
 * 准入复用 `task_move` 的既有判据（绑定 + 席位 + 存在性，**一条不改**）；owner 专属动作复用
 * `canWrite(seat,'confirm-gate')`（既有 ownerOnly 枚举，**不新增 SeatAction**、不改判据）。
 * 放行**只写卡评论 + 运行态窗口**：`status` / `version` 一律不动。
 *
 * 三条并发/续跑口径（t5 返工 P2）：
 *  · **CAS**：`expectedWindowIndex` 与当前窗口号不等 ⇒ 拒（`REQBOARD_CONFLICT`，回报当前窗口号）；
 *  · **清独立停手位**：清的是 `SubtaskRuntimePort` 里按卡登记的预算停手位（**不是**人工门 in-flight
 *    的需求级停手位——那会把同需求所有可开工卡一起停发）；
 *  · **连带会话窗口一起换窗**：`applyRelease` 把该卡名下所有会话窗口切到新窗口，否则被叫停的
 *    子会话会在下一个请求上立刻再次到顶（放行等于没放）。
 */
export async function releaseSubtaskBudget(
  deps: UseCaseDeps,
  input: ReleaseSubtaskBudgetInput,
): Promise<ReleaseSubtaskBudgetReceipt> {
  const port = deps.subtaskBudget
  if (port === undefined) {
    // **不新造码**（design/interfaces.md §异常情况「不新造码」）：端口未装配 = 组合根缺端口，
    // 与 `queue-access` 的 `taskStoreOf` / `requirementStoreOf` 同一语义、同一码（本仓口径单点）。
    return { ok: false, code: 'REQBOARD_STORE_INCONSISTENT', error: '子卡预算端口未装配（deps.subtaskBudget 缺失）：无法放行' }
  }
  const reason = input.reason.trim()
  if (reason.length === 0) {
    return { ok: false, code: 'REQBOARD_INVALID_INPUT', error: '放行必须带 reason（进卡评论留痕；没有理由的放行不可审计）' }
  }
  const task = await taskStoreOf(deps).get(input.taskId)
  if (task === undefined) {
    return { ok: false, code: 'REQBOARD_TASK_NOT_FOUND', error: fmt('任务 {id} 不存在', { id: input.taskId }) }
  }
  const bound = await openRequirementsForVia(deps.store, input.windowKey)
  const target = bound.find((r) => r.id === task.requirementId)
  if (target === undefined) {
    return { ok: false, code: 'REQBOARD_NOT_BOUND_TO_WINDOW', error: fmt('任务 {id} 不属于本窗口绑定的需求（放行只归 owner）', { id: input.taskId }) }
  }
  const seat = canWrite(seatOf(target, input.windowKey), 'confirm-gate')
  if (!seat.ok) {
    return { ok: false, code: seat.code, error: fmt('本窗口在该需求上的席位不允许放行子卡预算（{code}）', { code: seat.code }) }
  }
  const at = input.at ?? deps.clock.now()
  const add = input.add ?? resolveBudgetLimit(task).limit
  try {
    const state = await port.read()
    const window = budgetWindowOf(state, task.id) ?? openBudgetWindow(task, at).window
    // ── CAS：窗口号不一致即拒（不猜、不改） ───────────────────────────────────────
    if (input.expectedWindowIndex !== undefined && input.expectedWindowIndex !== window.windowIndex) {
      return {
        ok: false, code: 'REQBOARD_CONFLICT', windowIndex: window.windowIndex, limit: window.limit,
        error: fmt('放行未执行：expectedWindowIndex={asked} 与当前窗口号 #{cur} 不一致'
          + '（另一处放行已经生效，或窗口已被换掉）→ **拒绝**，请按当前窗口号 #{cur} 重试；'
          + '本条不做任何写入，也不改停手位。', {
          asked: String(input.expectedWindowIndex), cur: String(window.windowIndex),
        }),
      }
    }
    const res = releaseBudget(window, {
      add, now: at,
      ...(input.expectedWindowIndex === undefined ? {} : { expectedWindowIndex: input.expectedWindowIndex }),
    })
    if (res.released) await port.write(withBudgetWindow(state ?? emptyBudgetState(), task.id, res.window))
    await appendTaskComment(deps, task.id, res.released
      ? fmt('{mark}：窗口 #{from} → #{to}（新额度 {limit}；理由：{reason}）。'
        + '只写卡评论与运行态窗口，**不改任务状态机**（status/version 不动）；'
        + '同时清预算停手位、按卡换窗（会话窗口一起切到新窗口）。', {
        mark: BUDGET_MARKS.released, from: String(window.windowIndex), to: String(res.window.windowIndex),
        limit: String(res.window.limit), reason,
      })
      : fmt('{mark}：{why}。窗口仍是 #{w}（额度 {limit}，已用 {used}）——重复放行**不叠加窗口**。', {
        mark: BUDGET_MARKS.notReleased, why: res.reason ?? '无可放行', w: String(window.windowIndex),
        limit: String(window.limit), used: String(window.used),
      }), SYSTEM_ACTOR, at)
    if (!res.released) {
      return {
        ok: true, task_id: task.id, windowIndex: res.window.windowIndex, limit: res.window.limit,
        released: false, ...(res.reason === undefined ? {} : { note: res.reason }),
      }
    }
    // ── 清**独立**停手位 + 按卡换窗 + 请求一次驱动（续跑） ─────────────────────────
    const runtime = deps.subtaskRuntime
    const rewindowed = runtime?.applyRelease(task.id, res.window) ?? 0
    const clearedHalts = runtime?.clearHaltsForTask(task.id, at) ?? 0
    const driven = requestDriveQuietly(deps, task.requirementId)
    const worth = clearedHalts > 0 || rewindowed > 0 || !driven
    return {
      ok: true, task_id: task.id, windowIndex: res.window.windowIndex, limit: res.window.limit, released: true,
      ...(worth
        ? { note: fmt('已清停手位 {halts} 条、{n} 个会话窗口换窗、驱动请求 {drive}', {
            halts: String(clearedHalts), n: String(rewindowed), drive: driven ? '已发出' : '未发出（notifyDrivable 未装配）',
          }) }
        : {}),
    }
  } catch (err) {
    return { ok: false, code: 'REQBOARD_STORE_INCONSISTENT', error: fmt('放行失败（运行态/台账写入异常）：{e}', { e: errText(err) }) }
  }
}

/**
 * 停手位 ref（**单一构造点**：登记与清除必须算出同一个值才配得上）。
 * 形状 `budget-<作用域标识>-w<windowIndex>`——`windowIndex` 是**到顶那一窗**的号；
 * 作用域标识 = 卡 id（已归属）或会话 id（未归属，见 `sessionScopeKey`）。
 */
export function budgetAwaitingRef(scopeId: string, windowIndex: number): string {
  return fmt('budget-{id}-w{n}', { id: scopeId, n: String(windowIndex) })
}

/** `reqboard_task_move` 的 `budget` 子对象解析结果。 */
export type SubtaskBudgetArg =
  | { kind: 'none' }
  | { kind: 'release'; add?: number; expectedWindowIndex?: number }
  | { kind: 'error'; receipt: Record<string, unknown> }

/**
 * 解析 `budget` 子对象（值域见 design/interfaces.md §参数说明）。
 *
 * `release` 必须为 true（给了 `budget` 却不为 true 时**拒绝**而不是"当没看见"——收下却不管 = 假接口）；
 * `add` 必须是正整数（`<= 0` / 小数 → `REQBOARD_INVALID_INPUT`）；`task_id` 缺失同样拒绝（不知放行哪张卡）；
 * `expectedWindowIndex` 必须是**非负整数**（P2② 的 CAS 值；给了畸形值必须响亮拒绝，不能当没给）。
 *
 * 为什么放在本模块而不是工具壳：它判的是**预算的值域**（与 `resolveBudgetLimit` / `releaseBudget` 同源），
 * 且工具壳里的"响应型 `return {...}`"会被 `tests/output-contract.test.ts` 的静态扫描当作工具回执
 * （解析结果是内部形状，不是回执）——同源判定与响应字面量分居两处，两边都干净。
 */
export function readSubtaskBudgetArg(raw: unknown, taskId: string): SubtaskBudgetArg {
  if (raw === undefined) return { kind: 'none' }
  const bad = (error: string): SubtaskBudgetArg => ({
    kind: 'error',
    receipt: {
      success: false, task_id: taskId,
      error: 'reqboard_task_move 未执行：' + error,
      code: 'REQBOARD_INVALID_INPUT',
    },
  })
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return bad('budget 必须是对象（{release:true, add?, expectedWindowIndex?}）')
  }
  const b = raw as Record<string, unknown>
  if (b['release'] !== true) return bad('budget.release 必须为 true（只放行不推状态时也如此；不静默忽略该参数）')
  if (taskId.length === 0) return bad('budget 放行必须给 task_id')
  const add = b['add']
  if (add !== undefined && (typeof add !== 'number' || !Number.isInteger(add) || add <= 0)) {
    return bad('budget.add 必须是正整数（缺省 = 卡上 budgetRequests ?? 60）')
  }
  const expected = b['expectedWindowIndex']
  if (expected !== undefined && (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0)) {
    return bad('budget.expectedWindowIndex 必须是非负整数（= 你看到的窗口号；做 CAS，不匹配即拒）')
  }
  return {
    kind: 'release',
    ...(add === undefined ? {} : { add: add as number }),
    ...(expected === undefined ? {} : { expectedWindowIndex: expected as number }),
  }
}
