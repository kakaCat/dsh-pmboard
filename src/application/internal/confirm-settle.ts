/**
 * 确认裁决应用（REQ-260924213231-b1c4 T-6 · serves: FR-3）——「落章 + 推进」的**唯一实现**。
 *
 * 为什么要抽出来：同一条「肯定作答 → 落章 → 推进（含批准拆分计划的门合并自动拆分）」
 * 既要在**宽限内同步**走，也要在**超宽限的后台续跑**里走；两份实现必然漂移。故
 * AskConfirm（宽限赛跑）与 ConfirmReceipt（后台落章）都调本模块，返回语义与改造前
 * 逐字一致（note / gate_failure / advanced / from / to）。
 *
 * @module dsh-pmboard/application/internal/confirm-settle
 */
import type { UseCaseDeps } from '../ports.js'
import { canReqTransition, type RequirementStatus, type RequirementRecord, type StageArtifact, type PlanRecord, type TokenSnapshot } from '../../shared/protocol.js'
import { fmt } from '../../domain/text/fmt.js'
import { liveRealCards } from '../../domain/task/ReworkPlaceholder.js'
import { advanceTargetFor, gateForTransition, ARTIFACT_CONFIRM_GATES } from '../../domain/gate/GateCatalog.js'
// 流水线主序（回退/撤销与本次的「迁移是否已发生」共用同一份序，不另写数组）
import { pipelineIndexOf } from '../../domain/requirement/RollbackSpec.js'
import { checkDesignCompletenessGate, checkDesignDecompositionGate, contentGatesForMove } from './content-gate-wiring.js'
import { landApprovedPlan } from './approved-plan-landing.js'
import { artifactsToConfirm, type GateFailure } from './artifact-gates.js'
import { captureSnapshot, transitionRequirement } from './token-usage.js'
// import { executeDecompose } from '../use-cases/Decompose.js' // 已改用 deps.jobs.start（REQ-260925212722-96e7 t-003dc5）
import { stampCheckpoint } from './interruption.js'
import { applyRequirementWorkspaceRoot, reject } from './support.js'

/** 通用确认推进的留痕原因（确认回执据此从 statusHistory 还原 from → to，单点定义）。 */
export const CONFIRM_ADVANCE_REASON = '确认弹框后自动推进（reqboard_ask_confirm）'
/** 批准拆分计划的门合并推进原因（同上，单点定义）。 */
export const PLAN_MERGE_ADVANCE_REASON = '批准拆分计划后自动进入实施（拆分确认门已并入批准门）'

/** 一次已作答的确认请求（同步与后台共用同一入参形状）。 */
import { syncRTMYaml } from './rtm-yaml.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from '../use-cases/queue-access.js'
import { advanceRequirement } from '../use-cases/AdvanceChain.js'
// FR-10 起：确认推进后的 dive 复位（唯一写入口）；t1 起改由**统一收尾**调用（本文件不再直调）
import { finishConfirmAdvance } from './confirm-advance-finish.js'
import { dispatchNoteOf } from './auto-advance-note.js'
// REQ-261002141430-a5ef FR-3：三条确认通道的唯一收敛点上解除等待（人已作答）
import { exitAwaitingConfirm } from './awaiting-confirm.js'

export interface ConfirmDecision {
  requirementId: string
  windowKey: string
  target: 'artifact' | 'plan'
  kind: string
  /** 弹框题干原文（留痕/证据用） */
  question: string
  /** 用户选中的选项 label（肯定项 = optionLabels[0]） */
  picked: string
  nowTs: number
  /** 是否允许自动推进（同 ask_confirm 的 advance 参数） */
  advance: boolean
  /**
   * 本次确认对应的**在途弹框 ref**（REQ-261006170150-52cc FR-1）。
   *
   * · 会话弹框 = 挂起票 `pc-xxxxxx`；Dive 门框 = `dlg-gate-<req>-<ts>`；
   * · 给了 ⇒ **在落章/推进之前**带它 `await` 清位（`notify:false`，见 `applyConfirmDecision` 开头）；
   * · 缺省 ⇒ 沿用旧行为（不带 ref 的 fire-and-forget 清位）——那条路本就没有"本次这票"可带。
   */
  dialogRef?: string
}

/** 裁决应用结果（AskConfirm 与后台落章都据此组装返回体/回执）。 */
export interface ConfirmDecisionOutcome {
  from: string
  to: string
  advanced: boolean
  gateFailure?: GateFailure
  /** '已落章（via=session）' + 推进/缺口/自动开跑说明（逐字沿用改造前拼接） */
  note: string
  /**
   * 本次作答**未生效**（REQ-261006164732-6503 t6 · serves: FR-5）：门已被取代 / 需求已推进。
   * 调用方据此把回执组装成 `confirmed:false`（不能笼统当"已确认"）——`confirmed` 字段不在本类型里，
   * 由 `settleAnswers` 组装，故这里用一个显式通道而不是让调用方猜 note。
   */
  stale?: { reason: string }
}

/**
 * 「这次确认有没有东西可落章」两句错误文案的**单点**（REQ-261005200052-ce40 FR-5）：
 * 前移校验（`AskConfirm` 在登记挂起票**之前**）与落章校验（本文件 `applyConfirmDecision`）共用同一份
 * 措辞——两处各写一份，迟早一处改了另一处没改（本仓踩过的形态）。
 */
export function missingArtifactMessage(reqId: string, kind: string): string {
  return '需求 ' + reqId + ' 没有 kind=' + kind + ' 的产物（请先提交该阶段产物）'
}

/** 同上，target=plan 的那一句。 */
export function missingPlanMessage(reqId: string): string {
  return '需求 ' + reqId + ' 还没有拆分计划'
}

/** 非肯定作答的留痕（同步路径与后台续跑共用；原 AskConfirm 内联块逐字搬入）。 */
export async function recordDeclinedConfirmation(
  deps: UseCaseDeps,
  input: { requirementId: string; windowKey: string; question: string; picked: string; userFeedback: string; nowTs: number },
): Promise<void> {
  const feedbackNote = input.userFeedback.length > 0 ? fmt('。用户意见：{fb}', { fb: input.userFeedback }) : ''
  await mutateIfPresent(requirementStoreOf(deps), input.requirementId, (req) => {
    req.comments.push({
      id: deps.ids.comment(),
      body: '[确认弹框] 用户未确认（选择：' + (input.picked || '（未选）') + '）——节点未推进。问题：' + input.question + feedbackNote,
      createdAt: input.nowTs,
      createdBy: { kind: 'human', sessionId: input.windowKey },
    })
    req.updatedAt = input.nowTs
    // FR-6 写入器 A（T-9）：未确认也是一次交棒——断点写 checkpoint，pendingAction 重算为
    // 「再发一次 ask_confirm」（状态未变），随后被 turn/end 的异常原因覆盖。
    stampCheckpoint(req, input.nowTs, 'reqboard_ask_confirm')
    return { changed: true }
  })
}

/**
 * 落章前的两个前提（REQ-261006164732-6503 t6 · serves: FR-4、FR-5 · 设计 A-4 / I-6）。
 *
 * **实现说明（t13 起）**：拦人只用 `beforeGateTransition`（= `gateStaleReason` 为空）；
 * `gateOpen`（还没落过章）由**写入点的首写纪律**兜底（`stampArtifactOnce` / `stampPlanOnce`），
 * 因为「章已落、迁移未发生」是刻意保留的补推进路径，按它拦会把那条修复回退掉。
 * 本类型保留为**契约形状**（设计 I-6 的对外说法），实现里不再构造对象。
 */
export interface SettlePrecondition {
  /** 这道门对应的交接**还没落过章**（首写之前）——已落章 ⇒ 本次作答不改状态。 */
  gateOpen: boolean
  /**
   * 这道门**要守的那次迁移还没发生过**——已经发生过 ⇒ 本次作答是迟到作答，不改状态。
   *
   * 为什么不用"需求必须正停在该门的**来源阶段**"（设计 A-4 的原话）：那条更窄的判据会误杀
   * 受用例保护的既有路径——在设计阶段批准计划（`ask-confirm.test.ts` 的 target=plan 用例）
   * 是合法历史行为，而它的来源阶段（decomposing）确实还没到。判"这次迁移是否已发生"既拦住真正的
   * 迟到作答（需求已推进到 `to` 之后），又不动那条路径。**实测依据：全量基线差集点名了那条用例。**
   */
  beforeGateTransition: boolean
}

/**
 * 某类产物确认门**要守的那次迁移**（`from → to`）：由产物确认门表反查（`from>to` → kind），
 * 不另写一份映射（本仓最忌"两处口径各写一遍"，新增/改名一处就漂）。不是门的 kind → undefined。
 */
export function gateTransitionOf(kind: string): { from: RequirementStatus; to: RequirementStatus } | undefined {
  for (const [transition, k] of Object.entries(ARTIFACT_CONFIRM_GATES)) {
    if (k !== kind) continue
    const [from, to] = transition.split('>')
    return { from: from as RequirementStatus, to: to as RequirementStatus }
  }
  return undefined
}

/**
 * 落章前提的**单一判定**：这次作答该不该被当回事（REQ-261006164732-6503 t13 · serves: FR-4、FR-5）。
 *
 * 返回 `undefined` = 可以落章；返回字符串 = **迟到作答**（调用方据此只留痕、不改台账）。
 *
 * 为什么必须共用本函数：独立复核（reviews/independent-review.md 阻断-2）实测出"某条路径漏门 = 后门"——
 * 会话弹框路径有守卫，而**文字证据路径**（ConfirmArtifact）与**看板路径**（http/routers/requirements）
 * 落章时没有任何前提检查，凭 `confirmedEvidence` 就能把已落章的台账覆写。
 * 三条作答通道共用同一份判据，才不会再漏。
 */
export function gateStaleReason(
  req: Pick<RequirementRecord, 'status' | 'artifacts' | 'plan'>,
  target: 'artifact' | 'plan',
  kind: string,
): string | undefined {
  const gate = gateTransitionOf(target === 'plan' ? 'decomposition' : kind)
  if (gate === undefined) return undefined          // 不是门（如 prototype）⇒ 不判
  const idx = pipelineIndexOf(req.status)
  if (idx < 0) return undefined                     // 终态（done/canceled）不在主序内，交由其它门判
  return idx >= pipelineIndexOf(gate.to)
    ? fmt('需求已推进到 {s}：该门守的迁移已经发生过', { s: req.status })
    : undefined
}

/** 落章戳（产物与计划共用形状；`via` 只有 board / session 两个合法值）。 */
export interface StampOnce {
  by: { kind: 'human'; sessionId?: string }
  via: 'board' | 'session'
  evidence?: string
}

/**
 * **首写即事实**（产物侧）：已盖过章的产物一律不覆写，返回 false 表示本次没写。
 *
 * 独立复核逐处扫过 `confirmedAt =` 的全部写点：会话弹框路径有守卫，而**门合并块 / 文字证据路径 /
 * 看板路径**都没有——本函数就是那三处共用的那一个守卫（一处漏写 = 审计链被改写）。
 */
export function stampArtifactOnce(art: StageArtifact, at: number, s: StampOnce): boolean {
  if (art.confirmedAt !== undefined) return false
  art.confirmedAt = at
  art.confirmedBy = s.by
  art.confirmedVia = s.via
  if (s.evidence !== undefined) art.confirmedEvidence = s.evidence
  return true
}

/** **首写即事实**（计划侧）：已批准的计划一律不覆写，返回 false 表示本次没写。 */
export function stampPlanOnce(plan: PlanRecord, at: number, s: StampOnce): boolean {
  if (plan.approvedAt !== undefined) return false
  plan.approvedAt = at
  plan.approvedBy = s.by
  plan.approvedVia = s.via
  if (s.evidence !== undefined) plan.approvedEvidence = s.evidence
  return true
}

/**
 * 迟到作答留痕（REQ-261006164732-6503 t6/t7 · serves: FR-5）：**只写评论，不碰台账时间戳**。
 *
 * 为什么单列一个函数而不是复用 recordDeclinedConfirmation：后者语义是"人明确否掉了"
 * （所以它写 checkpoint），而本函数语义是"这次作答**不算数**"（门已被取代或需求已推进）——
 * 两者的留痕去向相同、含义相反，混用会让断点被一次无效作答带跑。
 */
export async function recordStaleAnswer(
  deps: UseCaseDeps,
  input: { requirementId: string; windowKey: string; question: string; reason: string; nowTs: number },
): Promise<void> {
  await mutateIfPresent(requirementStoreOf(deps), input.requirementId, (req) => {
    req.comments.push({
      id: deps.ids.comment(),
      body: '[确认弹框] 迟到作答未生效（' + input.reason + '）：本次作答不改变状态。问题：' + input.question,
      createdAt: input.nowTs,
      createdBy: { kind: 'human', sessionId: input.windowKey },
    })
    req.updatedAt = input.nowTs
    return { changed: true }
  })
}

/** 通道来源标签（只进留痕，不改行为；t1 起四通道共用同一实现时用它区分"谁确认的"）。 */
export type ConfirmedAdvanceSource = 'prompt' | 'gate-prompt' | 'evidence' | 'board'

/** 默认留痕正文（弹框路径逐字沿用；其余通道用 `commentBody` 覆盖，避免改既有文案）。 */
export const DEFAULT_ADVANCE_COMMENT = '确认弹框肯定答复（reqboard_ask_confirm 原子推进）'

/** `applyConfirmedAdvance` 入参（新增键全部可选 ⇒ 不传 = 改造前行为）。 */
export interface ConfirmedAdvanceInput {
  requirementId: string
  windowKey: string
  /** 调用方读到的当前状态（乐观并发护栏的期望值） */
  from: RequirementStatus
  to: RequirementStatus
  nowTs: number
  /** 留痕原因（**状态迁移记录**用）；缺省 = 既有 {@link CONFIRM_ADVANCE_REASON} */
  reason?: string
  /** 台账评论正文（`[自动推进] from → to：<这里>`）；缺省 = 既有默认句 */
  commentBody?: string
  /** 通道来源标签（可选）：写进评论尾部，便于事后判断"谁确认的" */
  sourceLabel?: ConfirmedAdvanceSource
  /** 缺省 true = 推进成功后做统一收尾（清停手位 + 复位健康）；false 只推进 */
  clearStopPosition?: boolean
  /**
   * 写时进度快照（可选）。缺省 = 自行经 `captureSnapshot(deps, windowKey)` 取会话快照
   * （工具侧三条通道的既有行为）；**看板侧**没有会话探针，由调用方从
   * `ctx.deps.tokenSnapshot` 取好传进来 —— 两种来源写进台账的是同一个 `snap` 键。
   */
  snap?: TokenSnapshot
}

/** 推进 + 收尾的结果（`finish` 未推进时整体省略——无损 JSON 纪律，不发 null）。 */
export interface ConfirmedAdvanceResult {
  advanced: boolean
  advanceNote: string
  finish?: {
    stopPositionCleared: boolean
    clearedNow: boolean
    healthReset: boolean
    stageChanged: boolean
  }
}

/**
 * 确认后的**唯一**状态迁移实现（REQ-261006094052-1da2 t1 · serves: FR-1、FR-2、FR-4）。
 *
 * 为什么要抽出来（缺陷现场）：`AskConfirm` 的「已确认」早退分支此前**只跑闸门、从不推进**——
 * 闸门通过也 `return advanced:false`，于是「产物已落章 + 后续补齐产物」之后，agent 没有任何
 * 可执行出口（`reqboard_move` 被人门拒），只能请人去面板点「→ 设计」。推进的唯一实现只长在
 * `applyConfirmDecision` 里，两条路径必然漂移；本函数就是那份实现，两条路径共用。
 *
 * **REQ-261007135258-331a t1（本次扩面）**：推进成功后调**统一收尾**
 * （{@link finishConfirmAdvance}：清停手位 + 复位运行时健康）。此前这段只长在 `applyConfirmDecision`
 * 里，文字证据与看板两条通道各自没有 —— 漏接不会被任何门禁发现（实测 2.5 小时静默停摆）。
 *
 * 调用纪律：**调用方必须先过闸门**（门不过不得调本函数——那正是 FR-2 的「状态不变」）。
 * 本函数只做迁移，异常吞进 `advanceNote` **不抛**（与改造前 :253-255 逐字一致：失败要留下可见的一句话）。
 */
export async function applyConfirmedAdvance(
  deps: UseCaseDeps,
  input: ConfirmedAdvanceInput,
): Promise<ConfirmedAdvanceResult> {
  if (!canReqTransition(input.from, input.to)) {
    return {
      advanced: false,
      advanceNote: '；当前状态 ' + input.from + ' 无可自动推进的下一阶段（验收/归档走验收单流程）',
    }
  }
  const reason = input.reason ?? CONFIRM_ADVANCE_REASON
  const commentBody = input.commentBody ?? DEFAULT_ADVANCE_COMMENT
  try {
    await mutateIfPresent(requirementStoreOf(deps), input.requirementId, (req) => {
      if (req.status !== input.from) return undefined
      // REQ-b545fe t3：使用唯一迁移助手
      transitionRequirement(req, input.to as never, {
        at: input.nowTs,
        actor: { kind: 'human', ...(input.windowKey.length > 0 ? { sessionId: input.windowKey } : {}) },
        reason,
        snap: input.snap ?? captureSnapshot(deps, input.windowKey),
      })
      req.comments.push({
        id: deps.ids.comment(),
        body: '[自动推进] ' + input.from + ' → ' + input.to + '：' + commentBody
          + (input.sourceLabel === undefined ? '' : '（来源=' + input.sourceLabel + '）'),
        createdAt: input.nowTs,
        createdBy: { kind: 'human', sessionId: input.windowKey },
      })
      stampCheckpoint(req, input.nowTs, 'reqboard_ask_confirm')
      return { changed: true }
    })
  } catch (err) {
    return { advanced: false, advanceNote: '；推进失败：' + ((err as Error).message ?? String(err)) }
  }
  // ── 收尾（REQ-261007135258-331a t1）：清停手位 + 复位运行时健康 ──────────────────
  // 为什么在这里而不是各通道：通道各调 = 又一处"漏接不会被发现"；放单点内由一处保证。
  // 为什么失败不回滚推进：推进是事实，收尾是补偿动作（收尾内部各自 try/catch、永不抛）。
  if (input.clearStopPosition === false) return { advanced: true, advanceNote: '' }
  const finish = await finishConfirmAdvance(deps, {
    requirementId: input.requirementId,
    windowKey: input.windowKey,
    from: input.from,
    to: input.to,
    nowTs: input.nowTs,
  })
  return { advanced: true, advanceNote: '', finish }
}

/**
 * 应用一次肯定作答 —— **对外唯一入口**（REQ-261006170150-52cc FR-1/FR-2）。
 *
 * ## 为什么是「包装 + 内体」而不是在原函数里加 `try/finally`
 *
 * 语义要求（design/architecture.md §时序、test-cases TC-4）：**本次 settle 结束时，若状态没有真的推进
 * （`advanced !== true`），补一次驱动请求**；推进成功则不补（`requirement-moved` 已经驱动过，
 * 再补会起第二轮 —— INV-4「同一次确认最多一次驱动请求」）。
 *
 * 等价性（逐条核对过，不是"差不多"）：
 *   · **正常返回且 advanced=true** → 不补（事件驱动）；
 *   · **正常返回且 advanced=false** → 补恰一次；
 *   · **抛错** → 内体的逃逸抛错**只可能发生在 `advanced` 置位之前**（`advanced` 声明于落章/推进段，
 *     其后的抛错都被内层 try/catch 收编成 note），故此时 `advanced` 必为 false ⇒ catch 里补发
 *     与 `finally { if (!advanced) … }` **同结果**，且不会重复补。
 *
 * 为什么不用 `try/finally` 直接包内体：那需要把内体**整体缩进**——本文件正被
 * `REQ-261006164732-6503` 的窗口并发编辑，缩进级改动是冲突面最大的一种；包装法把 diff 限制在
 * 函数签名附近，语义经上面三条逐条对齐（见 notes/implementing-notes.md §6 的偏离登记）。
 */
export async function applyConfirmDecision(
  deps: UseCaseDeps,
  exec: unknown,
  d: ConfirmDecision,
): Promise<ConfirmDecisionOutcome> {
  try {
    const outcome = await settleConfirmDecisionBody(deps, exec, d)
    if (outcome.advanced !== true) deps.notifyDrivable?.(d.requirementId)
    return outcome
  } catch (err) {
    // 补发的第二条出口：拒绝（内容门 / 缺产物 / 落章失败）同样要让链路能重新被叫起来，
    // 否则「推进没发生」这个最需要续跑的情形反而没人叫（本次事故的同族形态）。
    deps.notifyDrivable?.(d.requirementId)
    throw err
  }
}

/**
 * 应用一次**肯定**作答的内体：落章（artifact 成组 / plan 批准）→ 可选推进 → 拆分计划门合并开跑。
 * 任一步被闸门拒绝即抛（调用方按同步/后台两种语境处置）。行为与改造前 askConfirm 内联块逐字一致。
 *
 * 不直接对外导出：补发驱动的口径统一在 `applyConfirmDecision` 包装里（单点，避免两处各记一次）。
 */
async function settleConfirmDecisionBody(
  deps: UseCaseDeps,
  exec: unknown,
  d: ConfirmDecision,
): Promise<ConfirmDecisionOutcome> {
  const targetKind = d.target
  const kindRaw = d.kind
  const nowTs = d.nowTs
  const before = await requirementStoreOf(deps).get(d.requirementId)
  if (before === undefined) {
    reject('reqboard_ask_confirm 未执行：需求 ' + d.requirementId + ' 不在台账中', 'REQBOARD_STORE_INCONSISTENT')
  }

  // ── REQ-261002141430-a5ef FR-3：**人已作答**（走到这里就说明裁决到了）→ 先解除等待 ──
  // 为什么放在本函数开头：这里是弹框 / 看板 / 文字证据三条确认通道的**唯一收敛点**，
  // 一处覆盖三条路；放在开头是因为"等待已经结束"与后续落章/推进是否成功无关——
  // 推进失败也不该把 agent 冻在"等人"上。
  //
  // REQ-261006170150-52cc FR-1（本次事故的修复）：带**本次这票的 ref** 且 **await 完成**清位。
  //   修前这里是 `void exitAwaitingConfirm(无 ref)`——**不 await ⇒ 内存登记还在 ⇒ 台账也清不掉**，
  //   于是紧接着的推进所触发的 `requirement-moved` 到达驱动时，停手位还在，那一拍被自己挡下并丢弃
  //   （症状：状态前进了、agent 不动，只能靠人敲「继续」）。
  //   为什么 `notify:false`：推进那次写会驱动一次（走 requirement-moved）；若在此刻就请求驱动，
  //   会投出**旧阶段**的回合文、并在推进后因 revision 变化被 pre-step 拒绝——白投一条再丢弃。
  //   补发逻辑见本文件末尾的 `applyConfirmDecision` 包装（`advanced !== true` 才补一次）。
  // 没给 ref ⇒ 保留旧行为（不带 ref 的 fire-and-forget），逐字不变。
  const awaitingDeps = {
    // B12 阶段②c：写入走新端口（未装配则 requirementStoreOf 响亮抛错）
    store: requirementStoreOf(deps),
    ...(deps.dialogs === undefined ? {} : { dialogs: deps.dialogs }),
    now: () => deps.clock.now(),
    ...(deps.alert === undefined ? {} : { alert: deps.alert }),
  }
  if (d.dialogRef !== undefined) {
    await exitAwaitingConfirm(awaitingDeps, {
      requirementId: d.requirementId,
      ref: d.dialogRef,
      reason: 'board',
      notify: false,
    })
  } else {
    void exitAwaitingConfirm(awaitingDeps, { requirementId: d.requirementId, reason: 'board' })
  }

  // ── REQ-2d1c74 FR-3：确认 kind=design 落章前扫描拆分内容（三通道之一：会话弹框）──
  // 用户已作答，但检出拆分内容即拒——不落章、不推进（扫描只读，无副作用）
  if (targetKind === 'artifact' && kindRaw === 'design') {
    // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根。
    // 不校正时 list(design/) 在错误根下返回空数组 → 本门**静默放行**（漏放本应拦下的拆分内容）。
    applyRequirementWorkspaceRoot(deps, before)
    const scan = await checkDesignDecompositionGate(deps.docs, before)
    if (scan !== undefined) reject(fmt('reqboard_ask_confirm 未执行：{msg}', { msg: scan.message }), scan.code)
  }

  // ── REQ-261006164732-6503 t6（serves: FR-4、FR-5）：落章**前提**——两条都不满足即中性化 ──────────
  // 现场：被取代的门（或需求已被别的路径推走）其迟到作答仍走完整落章路径，把 `approvedAt` 与
  // 审批证据原文覆写（拆分门事故 16:42:13.402 那一笔）。这里先问两句再动手：
  //   ① 这道门对应的交接**还没落过章**吗（首写之前）——已落章 ⇒ 本次作答不改状态；
  //   ② 需求还停在**该门的来源阶段**吗——已被推进 ⇒ 同上。
  // 两条都不满足时只留痕（recordStaleAnswer），不落章、不推进、不抛。
  //
  // 为什么用"台账已落章"当 gateOpen 的可观测形式（设计 I-6 写的是"该 ref 的运行记录 outcome 未写"）：
  // 三条作答通道（会话弹框 / 看板 / 文字证据）里只有第一条有 ref，看板与文字证据根本没有票
  // ——按 ref 判会把那两条正常通道判成"门不 open"。台账口径对三条通道同一效果，且与"首写即事实"同源。
  // 「这道门守的那次迁移是否已经发生过」——判据与三条作答通道**共用** `gateStaleReason`
  // （独立复核实测：文字证据与看板两条路径原本没有任何前提检查，是同一个洞）
  const staleReason = gateStaleReason(before, targetKind, kindRaw)
  // ── 判定：**只按「这次迁移是否已发生」拦人** ──────────────────────────────────────
  // 为什么不用 `gateOpen` 拦（本轮由全量基线差集纠正）：`gateOpen === false` 有两种截然不同的情形——
  //   ① 章已落、迁移也已完成 ⇒ 真·迟到作答（该拦）；
  //   ② 章已落、但**迁移还没发生** ⇒ 这是本仓刻意保留的「补推进」路径（REQ-261006094052-1da2：
  //      已落章未推进时 agent 无路可走，故允许再发一次确认把阶段推上去）——拦了它 = 把那条修复回退掉。
  //      Dive 的「门已满足未推进 → 弹推进确认」（tests/dive-gate-prompt TC-15）与
  //      tests/ask-confirm.test.ts 的 target=plan 用例都在守这条路径。
  // 情形 ② 下台账不会被改写：**所有**落章点共用 `stampArtifactOnce` / `stampPlanOnce`（首写即事实），
  // 推进侧还有乐观并发护栏（status 必须等于 from）。—— t13 由独立复核补上后两处漏网写点。
  if (staleReason !== undefined) {
    const why = staleReason
    await recordStaleAnswer(deps, {
      requirementId: d.requirementId,
      windowKey: d.windowKey,
      question: d.question,
      reason: why,
      nowTs,
    })
    return {
      from: before.status,
      to: before.status,
      advanced: false,
      note: fmt('该确认已被取代（{why}）：本次作答不改变状态，仅留痕。', { why }),
      stale: { reason: why },
    }
  }

  // ── 肯定项：落章（与 reqboard_confirm_artifact 同语义）────────────────
  const evidence = '用户在 reqboard_ask_confirm 弹框（问题："' + d.question + '"）中选择"' + d.picked + '"'
  await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
    if (targetKind === 'artifact') {
      // REQ-2d1c74 FR-2：kind=design 成组落章（全部 design 产物一次确认）
      const arts = artifactsToConfirm(req, kindRaw as never)
      if (arts.length === 0) {
        throw Object.assign(
          new Error(missingArtifactMessage(req.id, kindRaw)),
          { code: 'REQBOARD_MISSING_ARTIFACT' },
        )
      }
      for (const art of arts) {
        // 首写即事实（t6/t13）：已有确认章一律不覆写——时间戳与证据原文是审计链，后到路径改不得
        stampArtifactOnce(art, nowTs, {
          by: { kind: 'human', sessionId: d.windowKey },
          via: 'session',
          evidence,
        })
      }
    } else {
      if (req.plan === undefined) {
        throw Object.assign(new Error(missingPlanMessage(req.id)), { code: 'REQBOARD_MISSING_PLAN' })
      }
      // 首写即事实（t6/t13）：已批准的计划不因后到作答而改写批准时间与证据原文
      stampPlanOnce(req.plan, nowTs, {
        by: { kind: 'human', sessionId: d.windowKey },
        via: 'session',
        evidence,
      })
      delete req.plan.rejectedAt
      delete req.plan.rejectedReason
    }
    req.comments.push({
      id: deps.ids.comment(),
      body: '[确认弹框] 用户确认（' + (targetKind === 'artifact' ? 'kind=' + kindRaw : '批准计划') + '）：' + evidence,
      createdAt: nowTs,
      createdBy: { kind: 'human', sessionId: d.windowKey },
    })
    req.updatedAt = nowTs
    req.updatedBy = { kind: 'human', sessionId: d.windowKey }
    // FR-6 写入器 A（T-9）：落章即写 checkpoint（下一步由状态+产物态重算；后续推进覆盖之）。
    stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')
    return { changed: true }
  }).catch((err: unknown) => {
    reject('reqboard_ask_confirm 落章失败：' + ((err as Error).message ?? String(err)), (err as { code?: string }).code ?? 'REQBOARD_STORE_INCONSISTENT')
  })

  // ── 推进（可选，限白名单转移）───────────────────────────────────────
  // RTM 触发点 3/5：确认落章后同步 RTM（ask_confirm 弹框与看板确认都走这里）
  // D4：syncRTMYaml 第 2 参 tasks（RTM 的任务视图随 v9 改读队列）。
  await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(d.requirementId), d.requirementId, targetKind === 'artifact' ? 'confirm:artifact' : 'confirm:plan')

  const from = (await requirementStoreOf(deps).getSummary(d.requirementId))?.status ?? before.status
  const to = advanceTargetFor(from)
  let advanced = false
  let advanceNote = ''
  // 2026-09-21：批准拆分计划（target=plan 且已在拆分阶段）不走通用推进——
  // 须先拆分落库再进实施（顺序在下方「门合并」块里保证）
  const planInDecomposing = targetKind === 'plan' && from === 'decomposing'
  // REQ-2d1c74 FR-2：G2 弹框确认后的自动推进先过文档集完整性闸门（四路径之一）。
  // 落章保留（确认动作有效），推进可拦——缺口经返回体 gate_failure 如实告知。
  //
  // ── REQ-261005105032-3b02 §10 #46：同步门之后先跑**唯一 async 内容门** ────────────────
  // 为什么补在本块（而不是只补 AskConfirm.ts 里那个"已确认未推进"的早退分支）：
  // 本块才是「弹框肯定答复 → 自动推进」的**唯一实现**（AskConfirm 宽限内同步走它、
  // ConfirmReceipt 后台续跑也走它）。只补早退分支的话，**首次确认**（最常见的那次：
  // agent 交完需求文档 → 人点肯定 → 自动进设计）会绕开原型门与裁定门——那正是
  // REQ-292a「某条路径漏门 = 后门」的形态，本需求存在的理由就是堵它。
  // 调用顺序照 interfaces.md：① 同步门（走到这里已过）→ ② contentGatesForMove → ③ 既有 G2。
  let contentGateFailure: GateFailure | undefined
  if (d.advance && to !== undefined && !planInDecomposing) {
    const fresh = await requirementStoreOf(deps).get(d.requirementId)
    if (fresh !== undefined) {
      // 读盘前按需求工作区校正根（REQ-260930193929-897b FR-1 同款纪律）
      applyRequirementWorkspaceRoot(deps, fresh)
      contentGateFailure = await contentGatesForMove(
        deps.docs, fresh, from as RequirementStatus, to as RequirementStatus,
        { ...(deps.session !== undefined ? { sessionProbe: deps.session } : {}) },
      )
    }
  }
  let designGateFailure: GateFailure | undefined
  if (contentGateFailure === undefined && d.advance && to !== undefined && !planInDecomposing && gateForTransition(from, to)?.id === 'G2') {
    const fresh = await requirementStoreOf(deps).get(d.requirementId)
    if (fresh !== undefined) {
      // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根
      // （本行即事故中真正被误拦的那一步：报「requirement.md 不存在」而文件在盘上）。
      applyRequirementWorkspaceRoot(deps, fresh)
      designGateFailure = await checkDesignCompletenessGate(deps.docs, fresh)
    }
  }
  if (contentGateFailure !== undefined) {
    advanceNote = fmt('；{from} → {to} 未推进：{msg}', { from, to: to ?? '', msg: contentGateFailure.message })
  } else if (designGateFailure !== undefined) {
    advanceNote = '；design → decomposing 未推进：' + designGateFailure.message
  } else if (d.advance && to !== undefined && !planInDecomposing) {
    // REQ-261006094052-1da2 t1：迁移收敛进单点 `applyConfirmedAdvance`（已确认重发的早退分支复用同一份）。
    // 行为与改造前逐字一致：`canReqTransition` 不过 ⇒ 同一句兜底文案；迁移抛错 ⇒ 同一句「推进失败」。
    const advancedBy = await applyConfirmedAdvance(deps, {
      requirementId: d.requirementId,
      windowKey: d.windowKey,
      from: from as RequirementStatus,
      to: to as RequirementStatus,
      nowTs,
    })
    advanced = advancedBy.advanced
    advanceNote = advancedBy.advanceNote
  } else if (d.advance) {
    advanceNote = '；当前状态 ' + from + ' 无可自动推进的下一阶段（验收/归档走验收单流程）'
  }

  // ── FR-10（REQ-261003215944-9e04）：确认推进之后，让自动链真的能接着跑 ─────────
  // 现场观感是「人工门确认后不自动续跑」——因为确认路径原先完全不碰 dive：
  //   · 跨阶段：阶段推进已把回合计数归零（transitionRequirement 里的 advance-stage），
  //     但**运行时暂停位（driverHealth=paused）没人复位** → 链仍停着；
  //   · 同阶段：什么都没发生 → 达上限停下后，人确认了也照样不动。
  // t1（REQ-261007135258-331a）起改走**统一收尾**（同一实现，四条通道共用）：
  //   · 已推进 ⇒ `applyConfirmedAdvance` 内部已收尾过（含清停手位），本处**不重复**；
  //   · 未推进（门拦下 / 无可推进目标）⇒ 由本处补一次收尾，`stageChanged:false`
  //     —— 域规则只复位健康位、不归零 roundsInStage（FR-10 的既有语义逐字保留）。
  if (!advanced) {
    await finishConfirmAdvance(deps, {
      requirementId: d.requirementId,
      windowKey: d.windowKey,
      from: from as RequirementStatus,
      to: (to ?? from) as RequirementStatus,
      nowTs,
      stageChanged: false,
    })
  }

  // ── REQ-4842fe t10：批准拆分计划 = 落章 + 拆分落库 + 开跑（门合并，FR-16）────
  // 2026-09-21 用户裁定（w-2105d331 代录）：拆分计划挪到**拆分阶段**提交与批准——
  // 本块在 from=decomposing 时生效：先落章 decomposition 产物（拆分计划本体）→
  // 自动落库任务卡 → 自动进实施 + autoRun=true → 触发首个推进事件，中途不再打断。
  // （legacy：design 阶段批准的旧计划走通用推进到 decomposing，之后在拆分阶段手动
  //   reqboard_decompose + 确认 decomposition 产物，退化为门合并前的两步流程。）
  let autoNote = ''
  if (targetKind === 'plan' && from === 'decomposing') {
    // ── 门合并第一步：decomposition 产物落章（拆分清单不再单独弹「确认」）───────────
    // REQ-261006164732-6503 t13（serves: FR-4）：**独立复核的阻断-1 就在这一块**——
    // 它是"章已落、迁移还没发生"（补推进）情形下唯一没守卫的写点：迟到作答会在这里把
    // decomposition 产物的 confirmedAt / 证据原文覆写（事故形态从 plan 挪到了这个产物）。
    // 现在与其余落章点共用 `stampArtifactOnce`，且**只在真的盖上时才写「门合并」评论**。
    await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
      const art = (req.artifacts ?? []).find(x => x.kind === 'decomposition')
      const stampedNow = art === undefined
        ? false
        : stampArtifactOnce(art, nowTs, {
          by: { kind: 'human', sessionId: d.windowKey },
          via: 'session',
          evidence,
        })
      if (stampedNow) {
        req.comments.push({
          id: deps.ids.comment(),
          body: fmt('[门合并] 批准拆分计划：decomposition 产物自动落章（不再单独弹「确认拆分清单」）', {}),
          createdAt: nowTs,
          createdBy: { kind: 'human', sessionId: d.windowKey },
        })
      }
      req.updatedAt = nowTs
      return { changed: true }
    })

    // ── 门合并第二步：**同步落库任务卡**（REQ-260927100007-b8ba FR-1）────────────
    // 旧实现把落库委托给 Dive 续跑（createdCount=0），而实际需求 dive=null、全仓无人 armed →
    // 委托从未被触发：台账 0 任务、看板拆分节点 DAG 空白、实施覆盖度为 0，且零告警静默数日
    // （这正是用户实测报的「拆分确认没有 DAG 层级展示」）。
    // 现改为：批准的同一次调用内先落库、落库成功才推进；任一步失败 → 不推进 + 响亮留痕。
    try {
      const tools = (exec as { tools?: { todo_write?: (a: unknown) => Promise<unknown> } } | undefined)?.tools
      // 落库编排的唯一实现（REQ-261002164800-d8f2 t3 / FR-1）：取数单点 + FR 覆盖硬门 + 幂等都在里面。
      // 本块此前把这三件事各写一遍（并在卡级缺引用时抛错拒绝**整批**），是本需求要收敛的重复实现。
      const landed = await landApprovedPlan(deps, {
        requirementId: d.requirementId,
        windowKey: d.windowKey,
        nowTs,
        source: 'confirm',
        ...(tools === undefined ? {} : { tools }),
      })
      // 幂等（死锁修复配套）：G3 重弹框确认时任务卡通常已落库——不得重复拆分，
      // 直接抛给下方 catch 的"已落库 → 仍推进"路径进入实施（不产生幽灵卡）。
      if (landed.alreadyLanded > 0) {
        throw Object.assign(
          // REQ-261005122915-9f90 t4 / FR-1：文案如实——这里数的是**真卡**（占位重做卡不计）。
          new Error(fmt('该需求已落库 {n} 张任务卡，跳过重复拆分（幂等）', { n: landed.alreadyLanded })),
          { code: 'REQBOARD_ALREADY_DECOMPOSED' },
        )
      }
      const createdCount = landed.createdCount
      // 落库成功的同一调用内推进到实施（原子：要么真的落库并推进，要么响亮地失败）
      await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
        if (req.status !== 'decomposing') return undefined
        transitionRequirement(req, 'implementing', {
          at: nowTs,
          actor: { kind: 'human', sessionId: d.windowKey },
          reason: PLAN_MERGE_ADVANCE_REASON,
          snap: captureSnapshot(deps, d.windowKey),
        })
        req.autoRun = true
        req.comments.push({
          id: deps.ids.comment(),
          body: fmt('[自动开跑] 批准拆分计划 → 自动拆分 {n} 张卡并落库 → 自动进入实施（autoRun=true）', { n: createdCount }),
          createdAt: nowTs,
          createdBy: { kind: 'human', sessionId: d.windowKey },
        })
        stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')
        return { changed: true }
      })
      advanced = true
      autoNote = fmt('；已同步落库 {n} 张任务卡并推进到 implementing', { n: createdCount })
      // FR-6：卡级无落点不拦，但必须在**两处**可见——回执里（调用方当场看到）与需求评论（看板上看得见）。
      // 只写回执等于把"这批卡的引用是空的"藏进一次性返回体里，事后没人查得到。
      if (landed.warning !== undefined) {
        autoNote += '；' + landed.warning
        await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (r) => {
          r.comments.push({
            id: deps.ids.comment(),
            body: landed.warning as string,
            createdAt: nowTs,
            createdBy: { kind: 'system' },
          })
          r.updatedAt = nowTs
          return { changed: true }
        })
      }
      
      // 🆕 立即触发任务执行（不等 Dive 续跑）
      try {
        autoNote += dispatchNoteOf(await advanceRequirement(deps, d.requirementId, exec))
      } catch (err) {
        // 触发失败不阻断推进，只留痕
        autoNote += fmt('；触发任务执行失败（可手动 reqboard_task_run）：{msg}', { msg: String((err as Error).message ?? err) })
      }
    } catch (err) {
      const errMsg = String((err as Error).message ?? err)
      // REQ-261005122915-9f90 t4 / FR-3：落库生效的**证据换成真卡数**。
      // 此前用「未取消任务数」——回退物化出来的占位重做卡会让它恒 >0，于是「一张新卡都没落」
      // 也被当成「落库已生效」照样推进（REQ-261005105032-3b02 实测）。
      const realTaskCount = liveRealCards(await taskStoreOf(deps).listByRequirement(d.requirementId)).length
      if (realTaskCount > 0) {
        // 落库已生效（后续文档/RTM 步骤失败）——仍推进，避免「卡已落、状态卡在拆分」的半迁移态
        try {
          await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
            if (req.status !== 'decomposing') return undefined
            transitionRequirement(req, 'implementing', {
              at: nowTs,
              actor: { kind: 'human', sessionId: d.windowKey },
              reason: PLAN_MERGE_ADVANCE_REASON,
              snap: captureSnapshot(deps, d.windowKey),
            })
            req.autoRun = true
            req.comments.push({
              id: deps.ids.comment(),
              body: fmt('[自动开跑] 批准拆分计划 → 已落库 {n} 张卡（收尾步骤报错：{msg}）→ 自动进入实施', { n: realTaskCount, msg: errMsg }),
              createdAt: nowTs,
              createdBy: { kind: 'human', sessionId: d.windowKey },
            })
            return { changed: true }
          })
          advanced = true
          autoNote = fmt('；已落库 {n} 张任务卡并推进到 implementing（收尾步骤报错：{msg}）', { n: realTaskCount, msg: errMsg })
          
          // 🆕 立即触发任务执行（不等 Dive 续跑）
          try {
            autoNote += dispatchNoteOf(await advanceRequirement(deps, d.requirementId, exec))
          } catch (err) {
            autoNote += fmt('；触发任务执行失败（可手动 reqboard_task_run）：{msg}', { msg: String((err as Error).message ?? err) })
          }
        } catch (err2) {
          autoNote = fmt('；落库收尾与推进均失败：{msg}', { msg: String((err2 as Error).message ?? err2) })
        }
      } else {
        autoNote = fmt('；自动拆分/开跑失败（计划已批准，可手动调 reqboard_decompose 重试）：{msg}', {
          msg: errMsg,
        })
        // FR-2：失败响亮化——系统评论（含恢复指引）+ advance.pausedReason + 高优告警；**不推进**
        await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
          req.comments.push({
            id: deps.ids.comment(),
            body: fmt(
              '[自动开跑失败] {reason}。\n\n恢复路径（两条都可执行）：① 按上面的原因修好计划文档的「覆盖对照表」（或把确实不做的条款在需求文档里标「本轮不做」）后，手动调 reqboard_decompose(requirement_id="{reqId}") 重试；② 在看板点「拆分」按钮重试。\n若只是个别卡缺条款引用（卡已落库），用 reqboard_task_amend(op=refs) 补写即可。',
              { reason: errMsg, reqId: d.requirementId },
            ),
            createdAt: nowTs,
            createdBy: { kind: 'system' },
          })
          if (req.advance === undefined) req.advance = {}
          req.advance.pausedReason = 'auto_decompose_failed: ' + errMsg
          req.updatedAt = nowTs
          return { changed: true }
        })
        deps.alert?.alert({
          requirementId: d.requirementId,
          title: '自动开跑失败',
          content: fmt('需求 {id} 批准计划后自动拆分/开跑失败：{msg}', { id: d.requirementId, msg: errMsg }),
        })
      }
    }
  }

  return {
    from,
    to: (advanced ? to : from) as string,
    advanced,
    // 两道门短路：内容门先报（它才是"先该补的东西"），没拦才轮到既有 G2。
    ...((contentGateFailure ?? designGateFailure) !== undefined
      ? { gateFailure: (contentGateFailure ?? designGateFailure) as GateFailure }
      : {}),
    note: '已落章（via=session）'
      + (advanced ? '，已推进：' + from + ' → ' + to : '')
      + advanceNote
      + autoNote,
  }
}
