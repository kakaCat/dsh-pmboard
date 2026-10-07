/**
 * 子卡**请求计数**与到顶处置（REQ-261007100513-6749 t5 ← FR-6 / 设计 S-3，用户裁定 D-3：
 * 默认 60 次请求/会话/窗口；到顶**先停下再汇报**；续跑须 owner 显式放行并留痕）。
 *
 * ── 两条链，各管一件事（t5 返工 P1：本次返工的核心）─────────────────────────────
 * · **执法链（到顶停手）= 以子会话为单位，完全不依赖卡片归属**：认出「这是一个子会话」就按会话
 *   计数（`subtask-runtime`；子会话只活在进程生命周期里，故计数只存内存），到顶就
 *   ①投停止指令 → ②汇报 → ③登记**独立**停手位，多卡并行形态下**照样**生效。
 *   旧实现把执法挂在「按卡归属」上，而实测 `executions[].sessionId` 100% 是窗口码
 *   （子会话是 UUID）⇒ 精确查表永不命中 ⇒ 多卡并行时零计数、零效力。
 * · **汇报链 = 归属只决定写到哪**，证据分级、**绝不猜**：
 *   `exact-session`（`executions[].sessionId === 子会话 id`）→ 卡评论（快路径）；
 *   `parent-unique-in-progress`（父窗口在该需求下**恰好一张** `in_progress` 卡）→ 卡评论
 *   **并写明归属依据**；其余 → **不写任何卡评论**，改写**需求级评论**
 *   （`appendRequirementComment` → `comments.jsonl`）并点名子会话 id 与「归属未定」。
 *
 * ── 子会话判据：正向（见 `subtask-runtime.isSubtaskSession`）────────────────────
 * 不再反向用 `isIgnoredSession`——它把「带 `parentSession`」也算作子会话，实测有 3 例
 * **fork 窗口**（`origin=undefined` / `parentSession` 有 / `delegationDepth=0`）会被误计入预算；
 * 正向判据 = `origin === 'subagent' || delegationDepth > 0`（并排除 `session-reqboard-*`）。
 *
 * ── 计数不静默失效（P2①）──────────────────────────────────────────────────────
 * 计数以**内存态**为权威（`chargeSession`），运行态文件只是**按卡**镜像：写失败 ⇒ 内存继续累计
 * （不再有"读回旧值 ⇒ used 恒为 1 ⇒ 永不到顶"），并把「端口态落后于内存态」写成**可见诊断 + 留痕**。
 *
 * ── 到顶处置 ─────────────────────────────────────────────────────────────────
 * 「先停 → 再报 → 等放行」的实现落在 `subtask-report`（本模块只做计数与装配）；测试断言的是
 * **投递器调用序列**（停止指令的调用确实早于评论写入），而不只是两次时钟读数有序。
 *
 * ⚠️ **前提如实写明**：这是**软门禁**——不 kill 子代理、也不拦它的工具调用（插件没有那个缝）。
 * 「停止」是一条投给子代理的指令，靠子代理配合。到顶后若仍继续发请求，计数**继续累加**并
 * **再投一次**停止指令（逐次诊断；卡/需求评论各一条，不刷屏），**绝不静默**。
 *
 * ── 纪律 ────────────────────────────────────────────────────────────────────
 * · **永不抛**：计数发生在 `session/event` 回调里，抛错会污染事件派发；一切失败收口为回执 + 告警 + 留痕。
 * · **不长期持有 Session 实例**（P3③）：只记 `parentSession` 字符串（事件对象含全量日志，长期持有会涨内存）。
 *
 * @module dsh-pmboard/application/internal/request-counter
 */

import { fmt } from '../../domain/text/fmt.js'
import { LIMITS } from '../../domain/limits.js'
import type { SubtaskBudgetPort, SubtaskRuntimePort } from '../ports.js'
import type { TaskRecord } from '../../shared/protocol.js'
import { isInProgressTask } from '../../domain/status/Predicates.js'
import { BUDGET_MARKS, errText } from './task-comment.js'
import {
  budgetWindowOf,
  emptyBudgetState,
  markBudgetReported,
  resolveBudgetLimit,
  withBudgetWindow,
  type BudgetDecision,
  type SubtaskBudgetWindow,
} from './subtask-budget.js'
import { createSubtaskRuntime, isSubtaskSession, parentSessionOf, sessionScopeKey } from './subtask-runtime.js'
import {
  reportExceeded,
  type AttributionBasis,
  type BudgetAttribution,
} from './subtask-report.js'

export type { AttributionBasis } from './subtask-report.js'

/** 汇报去向：卡评论 / 需求级评论 / 都不行（只留诊断）。 */
export type ReportTarget = 'task' | 'requirement' | 'none'

/** 计数回执（诊断面；`accepted` = 本次请求是否落在额度内）。 */
export interface ChargeReceipt {
  sessionId: string
  /** true = 本次请求落在额度内（到顶后 / 未知 / 未装配一律 false）。 */
  accepted: boolean
  decision: BudgetDecision | 'disabled' | 'error'
  attribution: AttributionBasis | 'unattributed'
  reportTo: ReportTarget
  /** 计数/停手位的作用域键（已归属 = 卡 id；未归属 = `sess:<会话 id>`）。 */
  scope: string
  taskId?: string
  requirementId?: string
  windowIndex?: number
  used?: number
  limit?: number
  overBy?: number
  countable?: boolean
  /** 本次是否向子会话投了停止指令 / 是否（重新）进入停手位 / 第几次进入（≥1）。 */
  stopped?: boolean
  halted?: boolean
  haltReentries?: number
  reason?: string
}

export interface RequestCounter {
  /** `session/event` 订阅体（同步返回；内部串行 + 永不抛）。 */
  onSessionEvent(session: unknown, event: unknown): void
  /**
   * 记一次请求（等价于收到该会话的一条 `assistant/message`）。
   * 生产入口只有 `onSessionEvent`（子会话判据在那里）；本方法供测试与诊断直接驱动**某个会话**。
   */
  charge(sessionId: string, at?: number): Promise<ChargeReceipt>
  /** 等内部串行链排空（测试/收尾用；**不改变**任何判定）。 */
  drain(): Promise<void>
  /** 该卡的窗口态（诊断/测试；读**运行态文件**的按卡镜像）。 */
  windowOf(taskId: string): Promise<SubtaskBudgetWindow | undefined>
  /** 未归属留痕（诊断面：哪些子会话归不到卡上、为什么）——**不表示未计数**。 */
  unattributed(): readonly string[]
  dispose(): void
}

export interface RequestCounterDeps {
  /** 运行态端口（**按卡**镜像）；缺省 = 未装配 → 整个计数器零行为（与改造前逐字一致）。 */
  port?: SubtaskBudgetPort
  /**
   * 运行时状态（按会话计数 + 独立停手位）。缺省 = 计数器自持一份进程内实例
   * （执法照样生效，只是放行清不到它——故组合根必须注入与放行路径**同一个**实例）。
   */
  runtime?: SubtaskRuntimePort
  /** 同步任务快照（`exact-session` 归属查表用）：`undefined` = 快照未就绪 → 落未归属，**仍执法**。 */
  tasks: () => readonly TaskRecord[] | undefined
  /** 按需求取任务（兜底归属 + 需求级汇报里的在制卡清单）。 */
  tasksOf: (requirementId: string) => Promise<readonly TaskRecord[]>
  /** 父窗口 → 绑定需求 id（兜底归属用；未绑定 → undefined）。 */
  requirementForWindow: (windowKey: string) => string | undefined
  /** 卡评论（= `appendTaskComment`；注入便于单测）。 */
  appendComment: (input: { taskId: string; body: string; at: number }) => Promise<void> | void
  /** **需求级**评论（= `appendRequirementComment`，落 `comments.jsonl`；归属未定时唯一的汇报去向）。 */
  appendRequirementComment: (input: { requirementId: string; body: string; at: number }) => Promise<void> | void
  /** ① 先停：向**子会话**投停止指令（返回是否送达）。 */
  stopSubagent: (input: {
    sessionId: string; taskId?: string; requirementId?: string; text: string; at: number
  }) => boolean
  /** ② 再报：通知 owner（活跃 `next-step` / 空闲 `next-turn`；返回是否送达）。 */
  notifyOwner: (input: { requirementId: string; text: string; at: number }) => boolean
  now: () => number
  diagnose?: (message: string) => void
  logger?: { warn(message: string, err?: unknown): void }
}

type Attribution = BudgetAttribution

export function createRequestCounter(deps: RequestCounterDeps): RequestCounter {
  const runtime = deps.runtime ?? createSubtaskRuntime()
  let chain: Promise<unknown> = Promise.resolve()
  let disposed = false
  const noted = new Set<string>()
  const unattributed = new Map<string, string>()
  /** 只记 `parentSession` **字符串**（P3③：不长期持有整个 Session 实例）。 */
  const parents = new Map<string, string>()

  const diag = (m: string): void => { try { deps.diagnose?.(m) } catch { /* 诊断不影响计数 */ } }
  const warn = (m: string, e?: unknown): void => { try { deps.logger?.warn?.(m, e) } catch { /* 日志不影响计数 */ } }
  /** 同一件事（作用域×窗口×类别）只留一次痕：每次评论 = 一次台账写盘，不能"每请求一条"。 */
  const once = (key: string): boolean => {
    if (noted.has(key)) return false
    noted.add(key)
    return true
  }
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.then(() => undefined, () => undefined)
    return run
  }
  /** 卡评论（失败只告警：留痕失败**不**阻断裁决）。 */
  async function comment(taskId: string, body: string, at: number): Promise<void> {
    try { await deps.appendComment({ taskId, body, at }) } catch (err) {
      warn(fmt('子卡预算：卡评论写入失败（task={id}）', { id: taskId }), err)
    }
  }
  /** 需求级评论（归属未定时的汇报去向；同样只告警）。 */
  async function reqComment(requirementId: string, body: string, at: number): Promise<void> {
    try { await deps.appendRequirementComment({ requirementId, body, at }) } catch (err) {
      warn(fmt('子卡预算：需求级评论写入失败（requirement={id}）', { id: requirementId }), err)
    }
  }
  /**
   * 归属：精确查表 → 兜底（父窗口下**恰好一张** in_progress 卡）→ 未归属（**仍执法**，只换汇报去向）。
   * 三条都**不猜**：多张 in_progress 一律落未归属并把在制卡清单交给需求级汇报（人来核）。
   */
  async function resolveAttribution(sessionId: string): Promise<Attribution> {
    const snap = deps.tasks()
    const exact = snap?.find((t) => (t.executions ?? []).some((e) => e.sessionId === sessionId))
    if (exact !== undefined) return { kind: 'task', task: exact, basis: 'exact-session' }
    const snapNote = snap === undefined ? '任务快照未就绪' : undefined
    const parent = parents.get(sessionId)
    if (parent === undefined) {
      return {
        kind: 'none', candidates: [],
        reason: (snapNote === undefined ? '' : snapNote + '；') + '子会话没有 parentSession（定位不到父窗口）',
      }
    }
    const reqId = deps.requirementForWindow(parent)
    if (reqId === undefined) {
      return { kind: 'none', candidates: [], reason: fmt('父窗口 {w} 未绑定任何需求', { w: parent.slice(0, 16) }) }
    }
    const reqs = await deps.tasksOf(reqId)
    const live = reqs.filter((t) => isInProgressTask(t))
    const ids = live.map((t) => t.id)
    if (live.length === 1) return { kind: 'task', task: live[0]!, basis: 'parent-unique-in-progress' }
    if (live.length === 0) {
      return { kind: 'none', requirementId: reqId, candidates: [], reason: fmt('需求 {r} 下没有 in_progress 的卡', { r: reqId }) }
    }
    return {
      kind: 'none', requirementId: reqId, candidates: ids,
      reason: fmt('需求 {r} 下有 {n} 张 in_progress 卡（{ids}）——不猜测归属', { r: reqId, n: String(live.length), ids: ids.join('、') }),
    }
  }
  /**
   * 到顶处置：**先停 → 再报 → 等放行**（实现见 `subtask-report.reportExceeded`；顺序即契约）。
   * 这里只做装配：把五个出口与「同一件事只留一次痕」的闸交给处置链。
   */
  async function handleExceeded(input: {
    sessionId: string
    attribution: Attribution
    task?: TaskRecord
    requirementId?: string
    scope: string
    window: SubtaskBudgetWindow
    firstReport: boolean
    overBy: number
  }): Promise<{ stopped: boolean; halted: boolean; haltReentries?: number }> {
    return reportExceeded(
      {
        stopSubagent: deps.stopSubagent,
        notifyOwner: deps.notifyOwner,
        appendComment: deps.appendComment,
        appendRequirementComment: deps.appendRequirementComment,
        now: deps.now,
        ...(deps.diagnose === undefined ? {} : { diagnose: deps.diagnose }),
        ...(deps.logger === undefined ? {} : { logger: deps.logger }),
        once,
      },
      runtime,
      {
        sessionId: input.sessionId,
        attribution: input.attribution as BudgetAttribution,
        scope: input.scope, window: input.window,
        firstReport: input.firstReport, overBy: input.overBy,
        ...(input.task === undefined ? {} : { task: input.task }),
        ...(input.requirementId === undefined ? {} : { requirementId: input.requirementId }),
      },
    )
  }
  async function charge(sessionId: string, at?: number): Promise<ChargeReceipt> {
    const port = deps.port
    /** 零行为回执（端口未装配 / 计数器已停用：都是**一条不判**，绝不假装 ok）。 */
    const off = (reason: string): ChargeReceipt => ({
      sessionId, accepted: false, decision: 'disabled', attribution: 'unattributed',
      reportTo: 'none', scope: sessionScopeKey(sessionId), reason,
    })
    if (port === undefined) return off('deps.subtaskBudget 未装配')
    if (disposed) return off('计数器已停用')
    return serial(async (): Promise<ChargeReceipt> => {
      try {
        const when = at ?? deps.now()
        const attribution = await resolveAttribution(sessionId)
        // 已归属的卡（本次归属优先；其次该会话首次钉住的卡——归属只影响汇报与按卡镜像）
        const pinnedId = runtime.taskOfSession(sessionId)
        const boundTask = attribution.kind === 'task' ? attribution.task
          : pinnedId === undefined ? undefined : deps.tasks()?.find((t) => t.id === pinnedId)
        const requirementId = attribution.kind === 'task' ? attribution.task.requirementId
          : attribution.kind === 'none' && attribution.requirementId !== undefined
            ? attribution.requirementId : boundTask?.requirementId
        const read = await port.read().catch((err: unknown) => {
          warn('子卡预算：运行态读取抛错（按「计数不可得」处理）', err)
          return undefined
        })
        const inherited = boundTask === undefined ? undefined : budgetWindowOf(read, boundTask.id)
        const memoryBefore = runtime.windowOfSession(sessionId)
        const resolvedLimit: { limit: number; note?: string } =
          boundTask === undefined ? { limit: LIMITS.subtaskRequestBudget } : resolveBudgetLimit(boundTask)
        // t7/R4（FR-6 读侧口径，design/data-model.md §运行态文件 1）：非法覆盖值（≤0 / 非整数）
        // ⇒ 按缺省起算，并**留一条可见诊断**（走既有 diag 通道；不新造码、不阻断开工）。
        // 此前这里只取 `.limit` 而丢了 `.note` ⇒ 非法值与「没写这个字段」在生产里无法区分。
        if (resolvedLimit.note !== undefined) diag(resolvedLimit.note)
        const limit = resolvedLimit.limit
        const charged = runtime.chargeSession({
          sessionId, at: when, limit,
          ...(attribution.kind === 'task' ? { taskId: attribution.task.id } : {}),
          ...(inherited === undefined ? {} : { inherit: inherited }),
        })
        const window = charged.window
        const scope = boundTask?.id ?? sessionScopeKey(sessionId)
        // 「计数不可得」= 端口与内存**都没有**可用依据（本会话第一次计数且文件缺失/损坏）。
        // 有内存态时按内存继续累计（写失败不静默失效）；无依据时**不按 0 通过**（decision=unknown）。
        const countable = read !== undefined || !charged.created
        const exceeded = countable && charged.exceeded
        const halt = runtime.activeHalt(scope, when)
        const sameWindowHalt = halt !== undefined && halt.windowIndex === window.windowIndex
        const firstReport = exceeded && !sameWindowHalt
        const reportTo: ReportTarget = boundTask !== undefined ? 'task'
          : requirementId === undefined ? 'none' : 'requirement'
        const base: Omit<ChargeReceipt, 'decision' | 'accepted'> = {
          sessionId, attribution: attribution.kind === 'task' ? attribution.basis : 'unattributed',
          reportTo, scope,
          ...(boundTask === undefined ? {} : { taskId: boundTask.id }),
          ...(requirementId === undefined ? {} : { requirementId }),
          countable, windowIndex: window.windowIndex, used: window.used, limit: window.limit,
          overBy: charged.overBy,
        }
        if (attribution.kind === 'none' && !unattributed.has(sessionId)) {
          unattributed.set(sessionId, attribution.reason)
          if (once('unattr|' + sessionId)) {
            diag(fmt('{mark}：子会话 {s} 未归属（{why}）→ 归属只决定**汇报去向**：改走需求级评论，'
              + '执法（按会话计数 + 到顶停手）照常。', {
              mark: BUDGET_MARKS.unattributed, s: sessionId.slice(0, 24), why: attribution.reason,
            }))
          }
        }
        // 内存态领先于运行态（写失败 / 端口不可读）⇒ **可见诊断**，计数**不静默失效**。
        // 判据只在「本该有按卡镜像」时成立（boundTask 在场）：运行态没有这张卡 = 写一直没成功；
        // 有但 used/windowIndex 落后 = 写失败期间的进度只在内存里。
        const lag = memoryBefore === undefined || boundTask === undefined ? undefined
          : inherited === undefined
            ? (memoryBefore.used > 0 || memoryBefore.windowIndex > 0 ? 'absent' as const : undefined)
            : (inherited.used < memoryBefore.used || inherited.windowIndex < memoryBefore.windowIndex ? 'behind' as const : undefined)
        if (lag !== undefined && once('diverge|' + scope + '|' + window.windowIndex)) {
          const m = fmt('内存态 used={u}/#{w}', { u: String(memoryBefore!.used), w: String(memoryBefore!.windowIndex) })
          const p = inherited === undefined ? '运行态里**没有**这张卡（写一直没成功）'
            : fmt('运行态 used={u}/#{w}', { u: String(inherited.used), w: String(inherited.windowIndex) })
          diag(fmt('{mark}：{id} {p} vs {m}——写失败期间的计数保留在内存态继续累计，未静默失效', {
            mark: BUDGET_MARKS.memoryDiverged, id: boundTask!.id, p, m,
          }))
        }
        // 按卡镜像（已归属才写：未归属的会话计数只存内存——按卡的键在那种形态下不存在）
        if (boundTask !== undefined) {
          const merged = withBudgetWindow(read ?? emptyBudgetState(), boundTask.id, window)
          const next = firstReport ? markBudgetReported(merged, boundTask.id, when) : merged
          try {
            await port.write(next)
          } catch (err) {
            // **告警 + 留痕 + 不阻断开工**（计数不丢：内存态继续累计）
            warn('子卡预算：运行态写入失败（告警 + 留痕，不阻断开工；计数转内存态继续累计）', err)
            if (once('writefail|' + boundTask.id + '|' + String(window.windowIndex))) {
              await comment(boundTask.id, fmt('{mark}（已告警，**不阻断开工**）：{e}。本次计数未落盘，'
                + '但**内存态继续累计**（不静默失效）；下一次读到落后于内存态的端口态会留「内存态与运行态不一致」诊断。', {
                mark: BUDGET_MARKS.writeFailed, e: errText(err),
              }), deps.now())
            }
          }
        }
        if (!countable) {
          if (once('uncount|' + scope + '|' + String(window.windowIndex))) {
            const body = fmt('{mark}：运行态文件缺失或损坏，且本会话此前没有内存计数 → 按**未知**处理，'
              + '**不按 0 通过**（不阻断开工）。', { mark: BUDGET_MARKS.uncountable })
            if (boundTask !== undefined) await comment(boundTask.id, body, deps.now())
            else if (requirementId !== undefined) await reqComment(requirementId, body, deps.now())
          }
          return { ...base, decision: 'unknown', accepted: false, reason: '计数不可得（端口与内存均无依据）' }
        }
        if (!exceeded) return { ...base, decision: 'ok', accepted: charged.accepted }
        const res = await handleExceeded({
          sessionId, attribution, scope, window, firstReport, overBy: charged.overBy,
          ...(boundTask === undefined ? {} : { task: boundTask }),
          ...(requirementId === undefined ? {} : { requirementId }),
        })
        return {
          ...base, decision: 'exceeded', accepted: charged.accepted,
          stopped: res.stopped, halted: res.halted, ...(res.haltReentries === undefined ? {} : { haltReentries: res.haltReentries }),
        }
      } catch (err) {
        warn('子卡预算：计数流程抛错（已兜住，不影响会话事件派发）', err)
        return {
          sessionId, accepted: false, decision: 'error', attribution: 'unattributed',
          reportTo: 'none', scope: sessionScopeKey(sessionId), reason: errText(err),
        }
      }
    })
  }

  return {
    onSessionEvent(session, event) {
      const sid = (session as { id?: unknown } | undefined)?.id
      if (typeof sid !== 'string' || sid.length === 0) return
      if (disposed || deps.port === undefined) return
      // 正向判据（**先于**事件类型判定）：fork 窗口（有 parentSession / depth 0 / 无 origin）不算子会话。
      if (!isSubtaskSession(session, sid)) return
      const parent = parentSessionOf(session)
      if (parent !== undefined) parents.set(sid, parent)
      if ((event as { type?: unknown } | undefined)?.type !== 'assistant/message') return // 一条 = 一次 LLM 请求
      void charge(sid).catch((err: unknown) => warn('子卡预算：计数抛错（已兜住）', err))
    },

    charge,

    async drain() { await chain.then(() => undefined, () => undefined) },

    async windowOf(taskId) {
      if (deps.port === undefined) return undefined
      try {
        return budgetWindowOf(await deps.port.read(), taskId)
      } catch (err) {
        warn('子卡预算：窗口读取失败', err)
        return undefined
      }
    },

    unattributed() { return [...unattributed.entries()].map(([s, why]) => s + '：' + why) },

    dispose() {
      disposed = true
      noted.clear()
      unattributed.clear()
      parents.clear()
    },
  }
}
