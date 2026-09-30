/**
 * 后台自动唤醒确认弹框（REQ-260929210741-30ae FR-1 / t4）。
 *
 * 提交产物后**非阻塞**触发确认弹框：用户在旁 → 2 秒宽限内直接作答（与原阻塞语义一致）；
 * 不在旁 → 迅速挂起 ticket，submit 立即返回，不拖住 agent 的回合。
 *
 * 为什么单独成模块：弹框的落章/推进实现只有一个（`use-cases/AskConfirm` → `internal/confirm-settle`），
 * 本文件只负责"后台 fire-and-forget 地调它"这一件事，避免各提交点各写一份赛跑逻辑。
 *
 * @module dsh-pmboard/application/internal/auto-confirm
 */
import type { UseCaseDeps } from '../ports.js'
import { askConfirm } from '../use-cases/AskConfirm.js'
import { fmt } from '../../domain/text/fmt.js'

/** 赛跑宽限：2 秒——用户在旁会立刻看到弹框；不在旁迅速挂起 ticket 不拖 submit 返回。 */
const AUTO_CONFIRM_GRACE_MS = 2000

/** 自动唤醒入参（target/kind 与 reqboard_ask_confirm 同义）。 */
export interface AutoConfirmInput {
  requirementId: string
  target: string
  kind: string
  question: string
}

export interface AutoConfirmResult {
  triggered: boolean
  /** 仅 triggered=false 时给出（通道探测失败）。 */
  reason?: string
}

/**
 * 后台触发确认弹框（fire-and-forget）。
 *
 * @returns 立即返回 {triggered:true}——实际落章/推进由 askConfirm 内部赛跑或挂起路径完成；
 *          通道探测失败时返回 {triggered:false, reason}。
 */
export function triggerAutoConfirm(deps: UseCaseDeps, input: AutoConfirmInput, exec: unknown): AutoConfirmResult {
  if (!deps.questions.available()) {
    return {
      triggered: false,
      reason: '弹框通道不可用（userQuestions 服务缺失）——请手动调 reqboard_ask_confirm',
    }
  }
  void (async () => {
    try {
      await askConfirm(deps, {
        requirement_id: input.requirementId,
        target: input.target,
        kind: input.kind,
        question: input.question,
        inline_grace_ms: AUTO_CONFIRM_GRACE_MS,
      }, exec)
    } catch (err) {
      // 失败要响亮：不静默吞掉，走失败告警端口留痕（告警本身失败也不影响主流程）。
      try {
        deps.alert?.alert({
          requirementId: input.requirementId,
          title: 'auto-confirm 触发失败',
          content: fmt('可手动 reqboard_ask_confirm：{msg}', { msg: String((err as Error).message ?? err) }),
        })
      } catch { /* 告警通道失败：不阻断 */ }
    }
  })()
  return { triggered: true }
}
