/**
 * 确认推进的**统一收尾**（REQ-261007135258-331a t1 · serves: FR-3）。
 *
 * ## 为什么必须是一处
 *
 * 2026-10-07 实测（REQ-261007101318-c392）：人点确认 → 章落了、状态没动（内容门拦），
 * 而那次弹框的**停手位没人清**（台账有 `c-awaiting-enter-*`、无 `c-awaiting-exit-*`）→
 * `isDrivableRequirement()` 恒 false → 该需求 2.5 小时零唤醒。
 * 根因不是"少写一行"，而是**收尾这件事散在四条通道里**：弹框与 Dive 门框各做一半，
 * 文字证据与看板两条完全不碰。收敛到本模块后，通道只能调它，漏接 = 用例立刻抓到。
 *
 * ## 三条纪律
 *
 *   ① **顺序固定**：先 `exitAwaitingConfirm`（同步解除"弹框在途"守卫 + 清台账停手位），
 *      再 `applyDiveTransition`——`confirm-advance` 被"弹框在途"守卫拦住会**零写入**
 *      （`DIALOG_GUARDED`），顺序反了则健康位永远复位不了；
 *   ② **永不抛**：调用点在确认收敛点与 HTTP 请求路径上，抛错会炸宿主；两件事各自 try/catch，
 *      失败经 `alert` 响亮报告（本仓既有"失败要响亮"口径），**绝不回滚已完成的推进**；
 *   ③ **读数如实**：`stopPositionCleared` 是**后置条件**（收尾结束时该需求不处于
 *      `awaiting-confirm:*`），`clearedNow` 才是"这次动作真的清了"——弹框路径在 settle
 *      开头已带 ref 清过位，只报"这次有没有清"会把它误报成 false。
 *
 * 边界（刻意不做）：**不清**非 `awaiting-confirm:*` 前缀的停手位（`exitAwaitingConfirm`
 * 自带前缀校验）；健康位由 `confirm-advance` 事件按域规则复位（含 `wake-undeliverable`）——
 * 那是"人确认了这道门 ⇒ 运行时暂停位应当复位"的既有语义，本模块不另立第二套规则。
 *
 * @module dsh-pmboard/application/internal/confirm-advance-finish
 */
import type { UseCaseDeps } from '../ports.js'
import type { RequirementStatus } from '../../shared/protocol.js'
import { awaitingRefOf, exitAwaitingConfirm } from './awaiting-confirm.js'
import { applyDiveTransition } from '../dive/applyDiveTransition.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'

/** 收尾入参（四条通道共用同一形状）。 */
export interface FinishConfirmAdvanceInput {
  requirementId: string
  windowKey: string
  /** 推进前所处的阶段（进 `confirm-advance` 事件的 status 位）。 */
  from: RequirementStatus
  to: RequirementStatus
  nowTs: number
  /** 本次这票的弹框 ref；缺省 = 清该需求任意 `awaiting-confirm:*` 残影（心跳对账用这条形态）。 */
  dialogRef?: string
  /**
   * 本次收尾对应的迁移是否跨阶段（缺省 true）。
   *
   * 为什么需要它：`applyConfirmedAdvance` 只在**真的推进**后调本函数（true）；
   * 而 `applyConfirmDecision` 的"肯定作答但未推进"分支也要复位运行时暂停位
   * （FR-10 既有语义：同阶段达上限停下后，人确认了就该接着跑）——那时传 false，
   * 域规则只复位健康位、**不**归零 `roundsInStage`。
   */
  stageChanged?: boolean
}

/** 收尾结果（全部是**后置读数**，调用方直接进回执，不做二次推断）。 */
export interface FinishConfirmAdvanceResult {
  /** 收尾结束时该需求**不处于** `awaiting-confirm:*`。 */
  stopPositionCleared: boolean
  /** 本次动作**真的**把停手位从 `awaiting-confirm:*` 清成了 healthy。 */
  clearedNow: boolean
  /** 收尾后 `driverHealth.state !== 'paused'`（含"本来就是 healthy"）。 */
  healthReset: boolean
  /** 本次收尾对应的迁移是否跨阶段（与调用方的 `advanced` 同源）。 */
  stageChanged: boolean
}

/** 失败告警（缺省端口时静默——与既有用例口径一致：告警是可选能力，不是成功率判据）。 */
function reportFailure(deps: UseCaseDeps, requirementId: string, what: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err)
  try {
    deps.alert?.alert({
      requirementId,
      title: '确认收尾失败',
      content: what + ' 失败（推进结果不回滚）：' + detail,
    })
  } catch { /* 告警通道失败不阻断 */ }
}

/**
 * 确认推进后的统一收尾：**清停手位 + 复位运行时健康**。永不抛。
 *
 * @returns 后置读数（见 {@link FinishConfirmAdvanceResult}）；任何一步失败都只降级读数，不影响推进事实。
 */
export async function finishConfirmAdvance(
  deps: UseCaseDeps,
  input: FinishConfirmAdvanceInput,
): Promise<FinishConfirmAdvanceResult> {
  const store = requirementStoreOf(deps)
  const now = (): number => deps.clock.now()

  // ── ① 清停手位（先解除"弹框在途"守卫，② 才写得进去）────────────────────────
  let clearedNow = false
  try {
    const res = await exitAwaitingConfirm(
      {
        store,
        ...(deps.dialogs === undefined ? {} : { dialogs: deps.dialogs }),
        now,
        ...(deps.alert === undefined ? {} : { alert: deps.alert }),
        // 清位即驱动（既有 FR-2 语义）：清成功时请求一次驱动；与推进触发的
        // `requirement-moved` 驱动在同一拍被 `requestDrive` 合并（不会起两轮）。
        ...(deps.notifyDrivable === undefined ? {} : { onCleared: deps.notifyDrivable }),
      },
      {
        requirementId: input.requirementId,
        ...(input.dialogRef === undefined ? {} : { ref: input.dialogRef }),
        reason: 'answered',
      },
    )
    clearedNow = res.cleared
  } catch (err) {
    // exitAwaitingConfirm 自身永不抛；这里只兜底不可预期形态（写盘实现异常等）。
    reportFailure(deps, input.requirementId, '清停手位', err)
  }

  // ── ② 复位运行时健康 / 跨阶段归零（绝不改 activation）────────────────────────
  try {
    await applyDiveTransition(
      {
        store,
        now,
        // 守卫：同需求还有别的在途框时不写（`DIALOG_GUARDED`）——那是"人还在等"的正常形态。
        ...(deps.dialogs === undefined
          ? {}
          : { dialogInFlight: (id: string) => deps.dialogs!.inFlightFor(id) }),
      },
      input.requirementId,
      'confirm-advance',
      { kind: 'human', sessionId: input.windowKey },
      { stageChanged: input.stageChanged ?? true, status: input.from },
    )
  } catch (err) {
    reportFailure(deps, input.requirementId, '复位运行时健康', err)
  }

  // ── ③ 后置读（如实，不推断）──────────────────────────────────────────────────
  let stopPositionCleared = true
  let healthReset = true
  try {
    const fresh = await store.get(input.requirementId)
    if (fresh !== undefined) {
      stopPositionCleared = awaitingRefOf(fresh) === undefined
      healthReset = fresh.dive?.driverHealth?.state !== 'paused'
    }
  } catch (err) {
    // 读失败不伪装成功：两个读数按"未确认"取值，并由调用方在回执里如实呈现。
    reportFailure(deps, input.requirementId, '收尾后置读', err)
    stopPositionCleared = false
    healthReset = false
  }

  return { stopPositionCleared, clearedNow, healthReset, stageChanged: input.stageChanged ?? true }
}
