/**
 * 闸门感知弹框装饰器（REQ-e3b6a0 t7 / FR-1 · FR-10）——**能力的唯一织入点**。
 *
 * 它包在 `UserQuestionPort` 外面，只做三件事：
 *  ① 委托真实 UI（**协议与行为零变化**：questions/answers 原样进出）；
 *  ② 若调用方声明了 `opts.gate` 且确有作答 → 向链**登记**一次闸门作答（Phase A）；
 *  ③ 原样返回答案。
 *
 * 为什么用装饰器而不是在用例里写链调用：新增一个弹框入口（或将来别的东西要「确认后自动推进」）
 * **零额外代码**即获得压缩/注入/唤醒/留痕；用例层只需说「这次弹框属于哪道门」。
 *
 * 登记的是**临时**上下文：`verdict` 留空，由 Phase B 的 H1 以台账实时状态刷新——
 * 因为「作答」与「推进落库」之间隔着用例后续的落章与迁移，装饰器此刻无权断言结果。
 *
 * @module dsh-pmboard/adapters/GateAwareQuestions
 */
import type { AskAnswer, AskQuestion, AskTimedResult, GatePostChainPort, UserQuestionPort } from '../application/ports.js'
import { racePortAsk } from '../application/internal/ask-timed.js'
import type { ConfirmContext, GateId } from '../domain/gate/GateSpec.js'
import { GATE_CATALOG } from '../domain/gate/GateCatalog.js'

export interface GateAwareQuestionsOptions {
  /** 时间源（默认 Date.now；测试注入固定值以保证幂等键可复现）。 */
  now?: () => number
}

/** 从 exec.agent 取窗口键（agent.id）。 */
function windowKeyOf(agent: unknown): string | undefined {
  if (typeof agent !== 'object' || agent === null) return undefined
  const id = (agent as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

export class GateAwareQuestions implements UserQuestionPort {
  private readonly inner: UserQuestionPort
  private readonly chain: GatePostChainPort
  private readonly now: () => number

  constructor(inner: UserQuestionPort, chain: GatePostChainPort, options: GateAwareQuestionsOptions = {}) {
    this.inner = inner
    this.chain = chain
    this.now = options.now ?? ((): number => Date.now())
  }

  available(): boolean {
    const result = this.inner.available()
    console.log('[reqboard DEBUG] GateAwareQuestions.available():', result)
    return result
  }

  async ask(
    questions: readonly AskQuestion[],
    opts: { agent?: unknown; signal?: unknown; gate?: GateId },
  ): Promise<readonly AskAnswer[]> {
    console.log('[reqboard DEBUG] GateAwareQuestions.ask() 被调用:', {
      questionsCount: questions.length,
      hasGate: opts.gate !== undefined,
      gate: opts.gate,
      questionsPreview: questions.map(q => ({ id: q.id, header: q.header, optionsCount: q.options?.length }))
    })
    const answers = await this.inner.ask(questions, opts)
    console.log('[reqboard DEBUG] GateAwareQuestions.ask() 收到答案:', {
      answersCount: answers.length,
      answersPreview: answers.map(a => ({ id: a.id, hasCustom: !!a.custom, selectedCount: a.selected?.length ?? 0 }))
    })
    this.enqueueGateIfAny(opts, answers)
    return answers
  }

  /**
   * 限时等待（REQ-261007223647-da5d t3）：委托 + **只在真拿到作答时**登记闸门。
   * 为什么 pending 不登记：链登记的含义是「人已作答」——超时只是"还没答"，把它当作答
   * 会把压缩/注入/唤醒链提前触发（第一段弹框不带 gate 的同款理由，BUG-2 教训）。
   */
  async askTimed(
    questions: readonly AskQuestion[],
    opts: { agent?: unknown; signal?: unknown; gate?: GateId; timeoutMs: number },
  ): Promise<AskTimedResult> {
    const result = typeof this.inner.askTimed === 'function'
      ? await this.inner.askTimed(questions, opts)
      : await racePortAsk(this.inner, questions, opts, opts.timeoutMs)
    if (result.kind === 'answered') this.enqueueGateIfAny(opts, result.answers)
    return result
  }

  /** 有 gate 声明且确拿到作答 → 登记一次闸门作答（临时上下文，verdict 留空给 H1 刷新）。 */
  private enqueueGateIfAny(
    opts: { agent?: unknown; gate?: GateId },
    answers: readonly AskAnswer[],
  ): void {
    if (opts.gate === undefined || answers.length === 0) return
    const windowKey = windowKeyOf(opts.agent)
    const gate = GATE_CATALOG.find(g => g.id === opts.gate)
    if (windowKey === undefined || gate === undefined) return

    const ctx: ConfirmContext = {
      windowKey,
      gate: gate.id,
      ...(gate.from === undefined ? {} : { from: gate.from }),
      to: gate.to,
      answers: [...answers],
      decidedAt: this.now(),
    }
    this.chain.enqueue(ctx)
  }
}
