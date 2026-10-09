/**
 * 限时等待（REQ-261007223647-da5d t3 · FR-1 / 设计 IF-3）——弹框「投递与等待解耦」的地基。
 *
 * 为什么需要它（2026-10-07 现场）：
 *  - `reqboard_submit(kind=verification)` 工具 30s 超时（`LIMITS.timeoutWriteMs`）时，
 *    自动触发的确认票 pc-a3d0aa 随调用一起丢了，下游被挂死约 30 分钟；
 *  - 立项弹框点「✖️ 不需要立项」也一样：调用被中断，答复与留痕一起消失，下次还会被弹。
 *
 * 口径（三条）：
 *  ① **等待必须死在工具预算之前**：`effective = min(desired, budget − safety)`；等不到就返回
 *     `pending`，票留在台账/注册表里由看板或重投接管——**不 throw、不记「用户未作答」**；
 *  ② **宿主优先**：装了 `UserQuestionPort.askTimed`（透传宿主 `askTimed`）就用它；没装则本地
 *     竞速 `ask()`——无论哪条路，返回形状一致，调用方不需要知道差别；
 *  ③ **零副作用**：本模块不写台账、不记留痕、不推进阶段——它只负责「等到什么时候」。
 *
 * @module dsh-pmboard/application/internal/ask-timed
 */
import type { AskAnswer, AskQuestion, AskTimedResult, UserQuestionPort } from '../ports.js'
import type { GateId } from '../../domain/gate/GateSpec.js'
import { LIMITS } from '../../domain/limits.js'
import { fmt } from '../../domain/text/fmt.js'

/** 等待参数（desiredMs = 想要的宽限；budgetMs = 所属工具的预算）。 */
export interface AskBudget {
  desiredMs: number
  budgetMs: number
}

/**
 * 计算本次等待的真实时长：`min(desired, budget − safety)`，且至少 1ms。
 * 预算比安全边还小时（配置错）取 1ms——宁可立刻返回 pending，也不让等待越过工具预算。
 */
export function effectiveAskTimeout(budget: AskBudget): number {
  const capped = Math.floor(budget.budgetMs - LIMITS.askSafetyMarginMs)
  const chosen = Math.min(Math.floor(budget.desiredMs), capped)
  return chosen >= 1 ? chosen : 1
}

/** 越界校验（宿主 `askTimed` 的 BAD_TIMEOUT 同域：正整数且不超平台计时器）。 */
export function assertAskTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw Object.assign(
      new Error(fmt('弹框等待时长非法（{t}）：必须是正整数毫秒且不超 2147483647（REQBOARD_INVALID_INPUT）', { t: String(timeoutMs) })),
      { code: 'REQBOARD_INVALID_INPUT' },
    )
  }
}

/** 本地竞速：`ask()` 与计时器谁先到；超时返回 pending，**底层 ask 不取消**（卡片仍可答）。 */
export async function racePortAsk(
  port: UserQuestionPort,
  questions: readonly AskQuestion[],
  opts: { agent?: unknown; signal?: unknown; gate?: GateId },
  timeoutMs: number,
): Promise<AskTimedResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const pending = new Promise<AskTimedResult>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'pending' }), timeoutMs)
  })
  try {
    const answered = port.ask(questions, opts).then(
      (answers): AskTimedResult => ({ kind: 'answered', answers }),
      (error): AskTimedResult => ({ kind: 'rejected', error }),
    )
    return await Promise.race([answered, pending])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * 限时等待弹框作答：宿主 `askTimed` 优先，否则本地竞速兜底（适配器自己也走同一条兜底，
 * 见 `adapters/UserQuestionsAdapter` 的 askTimed——口径只有这一处）。
 * 返回 `pending` 时**不代表失败**——调用方应回执 pending+ticket 并保留票（FR-1/FR-5）。
 */
export async function askWithBudget(
  port: UserQuestionPort,
  questions: readonly AskQuestion[],
  opts: { agent?: unknown; signal?: unknown; gate?: GateId },
  budget: AskBudget,
): Promise<AskTimedResult> {
  const timeoutMs = effectiveAskTimeout(budget)
  assertAskTimeout(timeoutMs)
  if (typeof port.askTimed === 'function') {
    return port.askTimed(questions, { ...opts, timeoutMs })
  }
  return racePortAsk(port, questions, opts, timeoutMs)
}

/** 便捷：只要答案（未作答 → undefined），给「等不到就按未作答回执」的既有调用方用。 */
export function answersOf(result: AskTimedResult): readonly AskAnswer[] | undefined {
  return result.kind === 'answered' ? result.answers : undefined
}
