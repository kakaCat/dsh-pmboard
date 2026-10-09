/**
 * 限时等待通道（REQ-261007223647-da5d t3 · FR-1 / 设计 IF-3）单测。
 *
 * 断言三件事：
 *  ① 等待必须死在工具预算之前（effectiveAskTimeout 的边界）；
 *  ② 超时 = pending（**不是错误、不记未作答**）；窗口内作答原样返回；
 *  ③ 闸门登记只认真作答——pending 不登记（否则压缩/注入链会被超时提前触发）。
 */
import { describe, it, expect } from 'vitest'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { GateAwareQuestions } from '../src/adapters/GateAwareQuestions.js'
import { askWithBudget, effectiveAskTimeout, assertAskTimeout } from '../src/application/internal/ask-timed.js'
import type { AskAnswer, AskQuestion, AskTimedResult, UserQuestionPort } from '../src/application/ports.js'
import type { GatePostChainPort } from '../src/application/ports.js'
import type { ConfirmContext } from '../src/domain/gate/GateSpec.js'
import { LIMITS } from '../src/domain/limits.js'

const Q: AskQuestion[] = [{ id: 'name', question: '需求名称' }]
const ANS: AskAnswer[] = [{ id: 'name', selected: ['候选'] }]

/** 只有 ask、没有 askTimed 的宿主（最保守的宿主任一版本）。 */
function legacySvc(behavior: 'answer' | 'hang') {
  return {
    ask: async () => {
      if (behavior === 'hang') return await new Promise<never>(() => {}) // 永不作答
      return { answers: ANS }
    },
  }
}

/** 带宿主 askTimed 的服务：按 kind 返回 pending 或答案，并记录它**是否**被调用。 */
function timedSvc(kind: 'answered' | 'pending') {
  const seen: { timeoutMs?: unknown; calls: number } = { calls: 0 }
  return {
    seen,
    ask: async () => ({ answers: ANS }),
    askTimed: async (_req: unknown, _callId?: unknown, timeoutMs?: unknown) => {
      seen.calls += 1
      seen.timeoutMs = timeoutMs
      return kind === 'answered' ? { answers: ANS } : { kind: 'pending' }
    },
  }
}

describe('t3 · 限时等待口径', () => {
  it('effectiveAskTimeout：min(desired, budget − 安全边)，且永不为 0', () => {
    expect(effectiveAskTimeout({ desiredMs: 3_600_000, budgetMs: 30_000 })).toBe(30_000 - LIMITS.askSafetyMarginMs)
    expect(effectiveAskTimeout({ desiredMs: 5_000, budgetMs: 30_000 })).toBe(5_000)
    // 预算比安全边还小（配置错）→ 立刻返回 pending，不越预算
    expect(effectiveAskTimeout({ desiredMs: 5_000, budgetMs: 1_000 })).toBe(1)
  })

  it('assertAskTimeout：非正整数 / 超平台计时器 → REQBOARD_INVALID_INPUT', () => {
    for (const bad of [0, -1, 1.5, 2_147_483_648]) {
      expect(() => assertAskTimeout(bad)).toThrowError(/REQBOARD_INVALID_INPUT/)
    }
    expect(() => assertAskTimeout(1)).not.toThrow()
  })
})

describe('t3 · 适配器 askTimed（契约：一律本地竞速，不透传宿主 askTimed）', () => {
  /**
   * 【契约变更 · REQ-261008103718-f1ea，2026-10-08 事故】
   * 旧契约是"宿主有 askTimed 就透传"。但宿主签名的第二参是 **callId**，适配器固定传
   * `undefined`，而该值会进入 remote 请求体 ⇒ 宿主 `isRemoteJsonValue` 判非法 ⇒ 抛
   * `api gateway: Remote event request is not lossless JSON data` ⇒ **整条弹框请求被拒收**
   * （现象：available() 为真、服务在场，却"什么都没发生"）。
   * 官方 `tool-ask-user` 走的是 `ask()`（已知可用），故适配器对齐它、不再透传。
   * 因此下面两条用例从"验透传"改为"验**不透传**"——断言宿主 askTimed 一次都没被调用。
   */
  it('宿主有 askTimed 也不透传：走 ask() 拿答案，宿主 askTimed 零调用', async () => {
    const svc = timedSvc('answered')
    const port = new UserQuestionsAdapter(() => svc)
    const out = await port.askTimed(Q, { timeoutMs: 12_345 })
    expect(out).toEqual({ kind: 'answered', answers: ANS })
    expect(svc.seen.calls).toBe(0)
  })

  it('宿主 askTimed 会返回 pending 也不影响：等待由本地计时器裁决', async () => {
    const svc = timedSvc('pending')
    const port = new UserQuestionsAdapter(() => ({ ...svc, ask: async () => await new Promise<never>(() => {}) }))
    expect(await port.askTimed(Q, { timeoutMs: 20 })).toEqual({ kind: 'pending' })
    expect(svc.seen.calls).toBe(0)
  })

  it('宿主只有 ask：本地竞速——窗口内作答 → answered', async () => {
    const port = new UserQuestionsAdapter(() => legacySvc('answer'))
    expect(await port.askTimed(Q, { timeoutMs: 1_000 })).toEqual({ kind: 'answered', answers: ANS })
  })

  it('宿主只有 ask 且人没答：到期 → pending（不是错误，也不取消底层等待）', async () => {
    const port = new UserQuestionsAdapter(() => legacySvc('hang'))
    expect(await port.askTimed(Q, { timeoutMs: 20 })).toEqual({ kind: 'pending' })
  })

  it('通道不可用：与 ask 同口径抛 REQBOARD_NO_UI（不静默 pending）', async () => {
    const port = new UserQuestionsAdapter(() => undefined)
    await expect(port.askTimed(Q, { timeoutMs: 100 })).rejects.toMatchObject({ code: 'REQBOARD_NO_UI' })
  })
})

describe('t3 · askWithBudget 与闸门登记', () => {
  it('askWithBudget：竞速里 ask 抛错 → rejected（**绝不能并进 pending**，否则"用户取消"被记成"超时"）', async () => {
    const port: UserQuestionPort = {
      available: () => true,
      ask: async () => { throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' }) },
    }
    const out = await askWithBudget(port, Q, {}, { desiredMs: 5_000, budgetMs: 30_000 })
    expect(out.kind).toBe('rejected')
    expect((out as { error?: { code?: string } }).error?.code).toBe('ASK_ABORTED')
  })

  it('askWithBudget：没有 askTimed 的端口走竞速，超时 → pending', async () => {
    const port: UserQuestionPort = {
      available: () => true,
      ask: async () => await new Promise<never>(() => {}),
    }
    const out = await askWithBudget(port, Q, {}, { desiredMs: 60_000, budgetMs: 1_000 })
    expect(out).toEqual({ kind: 'pending' })
  })

  it('闸门登记：真作答才入队；pending 不入队', async () => {
    const enqueued: ConfirmContext[] = []
    const chain: GatePostChainPort = { enqueue: (ctx: ConfirmContext) => { enqueued.push(ctx) } } as never
    const inner: UserQuestionPort = {
      available: () => true,
      ask: async () => ANS,
      askTimed: async (): Promise<AskTimedResult> => ({ kind: 'pending' }),
    }
    const gated = new GateAwareQuestions(inner, chain, { now: () => 1 })
    const pendingOut = await gated.askTimed(Q, { agent: { id: 'w1' }, gate: 'G0', timeoutMs: 100 })
    expect(pendingOut).toEqual({ kind: 'pending' })
    expect(enqueued).toHaveLength(0)

    const answeredInner: UserQuestionPort = {
      available: () => true,
      ask: async () => ANS,
      askTimed: async (): Promise<AskTimedResult> => ({ kind: 'answered', answers: ANS }),
    }
    const gated2 = new GateAwareQuestions(answeredInner, chain, { now: () => 2 })
    const answeredOut = await gated2.askTimed(Q, { agent: { id: 'w1' }, gate: 'G0', timeoutMs: 100 })
    expect(answeredOut.kind).toBe('answered')
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]!.windowKey).toBe('w1')
  })
})
