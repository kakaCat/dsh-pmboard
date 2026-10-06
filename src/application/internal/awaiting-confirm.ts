/**
 * 在途弹框 → 停手位（REQ-261002141430-a5ef · serves: FR-1 / FR-2 / FR-3 / FR-4）。
 *
 * 要解决的问题：弹框在途时，写工具被 `REQBOARD_CONFIRM_PENDING` 拦住了，但**自动链不知道有人在等**——
 * agent 继续跑、Dive 继续投回合，下一次写被打回，空转烧回合直到撞上阶段回合上限。
 *
 * 两半分工（为什么必须拆开，见 design/architecture.md）：
 *   · **同步**：`deps.dialogs.enter/exit` 管拦截——Dive 的人工门框与起轮在同一 idle 拍相邻，
 *     只有同步登记才拦得住同拍那一轮；
 *   · **异步**：台账写 `dive.driverHealth={state:'paused',reason:'awaiting-confirm:<ref>'}` 管**可观测**
 *     与重启后的对账（`isDrivableRequirement` 据此停投回合）。
 *
 * 三条纪律：
 *   ① **不改人的意图**：`dive.activation` / `req.autoRun` 在任何分支都不写（沿用 REQ-261001213924-1441 FR-5）；
 *   ② **永不抛**：调用点在弹框投递与事件回调路径上；台账写失败 → 告警 + 日志，**拦截仍然生效**（拦截优先）；
 *   ③ **幂等**：重复 enter/exit 零动作。
 *
 * @module dsh-pmboard/application/internal/awaiting-confirm
 */
import { mutateIfPresent } from '../use-cases/queue-access.js'
import type { DialogInFlightPort, RequirementStore } from '../ports.js'
import type { RequirementRecord } from '../../shared/protocol.js'

/**
 * 停手原因前缀（**单点定义**）：判定、清理、心跳对账三处共用，别处只能 import 本常量。
 * 形态 `awaiting-confirm:<ref>`——`<ref>` 是这次等待的引用（挂起路径 = ticket）。
 */
export const AWAITING_CONFIRM_PREFIX = 'awaiting-confirm:'

/** 本次等待的出口（进恢复留痕，便于事后判断是谁把它叫醒的）。 */
export type AwaitingExitReason = 'answered' | 'board' | 'canceled' | 'expired' | 'degraded'

export interface AwaitingConfirmDeps {
  /** B12 阶段②c：进入/退出等待位的**写**走新端口（与 repo 并存，删桥时 repo 消失）。 */
  store: RequirementStore
  /** 在途登记表（缺省 = 未装配 → 本模块整体零行为，行为与改动前逐字一致）。 */
  dialogs?: DialogInFlightPort
  now: () => number
  /** 台账写失败时的响亮通道（缺省 = 只留日志）。 */
  alert?: { alert(input: { requirementId: string; title: string; content: string }): void }
  /**
   * 停手位**真的被清**（`awaiting-confirm:*` → healthy）之后回调一次（REQ-261006170150-52cc FR-2）。
   *
   * 为什么要有它：清位是"等待结束"的唯一事实，但历史上它只写台账、不通知任何人——
   * 于是"停手位刚刚被清"这件事无法转成一次驱动请求，链路只能等下一个外部触发（本次事故的成因之一）。
   *
   * 纪律：**永不抛**——实现抛错只 `logger.warn`，清位结果不回滚（与 enter/exit 既有纪律同源）。
   * 缺省 undefined = 零行为（与改造前逐字一致）。
   */
  onCleared?: (requirementId: string) => void
  logger?: { warn(message: string, err?: unknown): void }
}

/** 该需求是否处于「等弹框」停手态（台账侧谓词，心跳对账用）。 */
export function isAwaitingConfirmStop(req: RequirementRecord | undefined): boolean {
  const health = req?.dive?.driverHealth
  if (health?.state !== 'paused') return false
  return awaitingRefOf(req) !== undefined
}

/** 从台账停手位里取回 ref（不认识该形态 → undefined）。 */
export function awaitingRefOf(req: RequirementRecord | undefined): string | undefined {
  const reason = req?.dive?.driverHealth?.reason
  if (reason === undefined || !reason.startsWith(AWAITING_CONFIRM_PREFIX)) return undefined
  const ref = reason.slice(AWAITING_CONFIRM_PREFIX.length).trim()
  return ref.length > 0 ? ref : undefined
}

/** 停手判据（**同步**、纯内存读）——自动链唯一可用的「有人在等吗」。 */
export function dialogInFlightFor(
  source: { dialogs?: DialogInFlightPort },
  requirementId: string,
): boolean {
  const dialogs = source.dialogs
  if (dialogs === undefined) return false
  try {
    return dialogs.inFlightFor(requirementId) === true
  } catch {
    // 判据抛错不得把自动链带崩：按"无在途"放行（宁可多跑一轮，也不要静默停摆）
    return false
  }
}

/** 台账写失败的统一处置：告警 + 日志（永不抛）。 */
function reportWriteFailure(deps: AwaitingConfirmDeps, requirementId: string, what: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err)
  try {
    deps.alert?.alert({
      requirementId,
      title: '弹框停手位写入失败',
      content: '停手位' + what + '写台账失败（拦截仍生效，重启后由心跳对账恢复）：' + detail,
    })
  } catch { /* 告警通道失败不阻断 */ }
  try { deps.logger?.warn('awaiting-confirm: 停手位' + what + '写失败（需求=' + requirementId + '）', err) } catch { /* 日志失败不阻断 */ }
}

/**
 * 登记一次在途弹框：**先同步登记**（拦截），再异步写停手位（可观测）。
 *
 * @returns 台账写完成（或失败见告警）后 resolve —— **永不 reject**；调用方可不 await。
 */
export async function enterAwaitingConfirm(
  deps: AwaitingConfirmDeps,
  input: { requirementId: string; windowKey: string; ref: string; kind: 'confirm' | 'gate'; suspend?: boolean; question?: string },
): Promise<void> {
  const dialogs = deps.dialogs
  if (dialogs === undefined) return
  try {
    dialogs.enter({
      ref: input.ref,
      windowKey: input.windowKey,
      requirementId: input.requirementId,
      kind: input.kind,
      suspend: input.suspend === true,
    })
  } catch (err) {
    deps.logger?.warn('awaiting-confirm: 在途登记失败（拦截可能失效）', err)
    return
  }
  const reason = AWAITING_CONFIRM_PREFIX + input.ref
  try {
    await mutateIfPresent(deps.store, input.requirementId, (r) => {
      if (r.dive === undefined) return undefined
      const now = deps.now()
      // 幂等：已在这个 ref 的停手态上 → 不重复写（不刷 comment、不动 version）
      if (r.dive.driverHealth?.state === 'paused' && r.dive.driverHealth.reason === reason) return undefined
      const hadOther = r.dive.driverHealth?.state === 'paused' && r.dive.driverHealth.reason?.startsWith(AWAITING_CONFIRM_PREFIX) === true
      r.dive.driverHealth = {
        state: 'paused',
        reason,
        since: now,
        attempts: r.dive.driverHealth?.attempts ?? 0,
      }
      r.dive.lastActiveAt = now
      if (!hadOther) {
        r.comments.push({
          id: 'c-awaiting-enter-' + input.requirementId + '-' + now,
          body: '[Dive 停手] 人工门禁弹框在途（ref=' + input.ref + '，来源=' + input.kind + '）→ 自动链停手等人：'
            + '不再投递新回合、不再派发任务卡。人的意图未变（activation/autoRun 未改）；'
            + '作答 / 看板确认 / 取消 / 过期后自动恢复。',
          createdAt: now,
          createdBy: { kind: 'system' },
        })
      }
      r.updatedAt = now
      return { changed: true }
    })
  } catch (err) {
    // 台账写失败不改拦截（在途登记已生效），只响亮报告
    reportWriteFailure(deps, input.requirementId, '（进入等待）', err)
  }
}

/**
 * 解除等待：**先同步**（放开拦截），再异步清停手位（留痕写明出口）。
 *
 * 幂等：重复调用 / 未知 ref 零动作。ref 缺省 = 清该需求**任意** `awaiting-confirm:*` 停手位
 * （心跳对账与重启恢复用这条形态）。
 */
/** 解除等待的入参（`notify` 见下；其余与改造前逐字一致）。 */
export interface ExitAwaitingInput {
  requirementId: string
  /** 本次这票的 ref；缺省 = 清该需求**任意** `awaiting-confirm:*` 停手位（心跳对账与重启恢复用这条形态） */
  ref?: string
  reason: AwaitingExitReason
  /**
   * 清位成功后是否回调 `onCleared`，**缺省 true**。
   *
   * 只有**确认收敛点**显式传 false：它要求清位先于落章/推进（FR-1），
   * 而"清位即请求驱动"若发生在推进之前，会投出**旧阶段**的回合文并在推进后被 pre-step 拒绝；
   * 故它把请求推迟到本次 settle 末尾自己补发（见 design/architecture.md §时序）。
   */
  notify?: boolean
}

/** 解除等待的回执（新增返回形状；既有调用方可继续忽略返回值）。 */
export interface ExitAwaitingResult {
  /** 台账停手位**本次真的**从 `awaiting-confirm:*` 清成了 healthy */
  cleared: boolean
  /** 是否真的回调了 `onCleared`（`cleared ∧ notify !== false ∧ 端口在场`） */
  notified: boolean
}

export async function exitAwaitingConfirm(
  deps: AwaitingConfirmDeps,
  input: ExitAwaitingInput,
): Promise<ExitAwaitingResult> {
  const dialogs = deps.dialogs
  const ref = input.ref
  try {
    if (dialogs !== undefined && ref !== undefined) dialogs.exit(ref)
  } catch (err) {
    deps.logger?.warn('awaiting-confirm: 在途解除失败', err)
  }
  let cleared = false
  try {
    const res = await mutateIfPresent(deps.store, input.requirementId, (r) => {
      if (r.dive === undefined) return undefined
      const current = r.dive.driverHealth?.reason
      if (r.dive.driverHealth?.state !== 'paused') return undefined
      if (current?.startsWith(AWAITING_CONFIRM_PREFIX) !== true) return undefined
      // 同一需求可能有多条在途（罕见）：只有当停手位属于本次 ref，或已无任何在途时，才清
      const mine = ref !== undefined && current === AWAITING_CONFIRM_PREFIX + ref
      const stillWaiting = dialogs !== undefined && (() => { try { return dialogs.inFlightFor(input.requirementId) } catch { return false } })()
      if (!mine && stillWaiting) return undefined
      const now = deps.now()
      r.dive.driverHealth = { state: 'healthy', since: now, attempts: 0 }
      r.dive.lastActiveAt = now
      r.comments.push({
        id: 'c-awaiting-exit-' + input.requirementId + '-' + now,
        body: '[Dive 恢复] 等待结束（出口=' + input.reason + '，原 ref='
          + (current.slice(AWAITING_CONFIRM_PREFIX.length) || '(未知)') + '）→ 自动链恢复续跑。',
        createdAt: now,
        createdBy: { kind: 'system' },
      })
      r.updatedAt = now
      return { changed: true }
    })
    cleared = res?.changed === true
  } catch (err) {
    reportWriteFailure(deps, input.requirementId, '（解除等待）', err)
  }
  // ── 清位即驱动（REQ-261006170150-52cc FR-2）──────────────────────────────────
  // 只有**真的把停手位清成 healthy**这一件事才回调一次：台账本就不是等弹框态（cleared=false）
  // 或调用方显式 notify:false ⇒ 零回调（不制造第二个触发源）。
  const notified = cleared && input.notify !== false && deps.onCleared !== undefined
  if (notified) {
    try {
      deps.onCleared!(input.requirementId)
    } catch (err) {
      // 永不抛：回调失败不回滚清位（清位是事实，通知失败只是"没接上"）
      deps.logger?.warn('awaiting-confirm: onCleared 回调失败（清位已生效，不回滚）', err)
    }
  }
  return { cleared, notified }
}
