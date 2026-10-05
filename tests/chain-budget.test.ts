// serves: FR-11
/**
 * 起链预算闸单测（REQ-261004065652-5c1c · t1 / TC-12 前置）。
 *
 * 判据：WIP 与 token 两条阈值各拦一次；候选自己若已在跑**不计入**上限（续跑 ≠ 新链）；
 * 不杀在跑链（本模块只回答"能不能起新的"）。
 */
import { describe, it, expect } from 'vitest'
import {
  checkChainBudget, inFlightChainCount, cacheReadTotal, isInFlightChain,
  DEFAULT_CHAIN_BUDGET_LIMITS, type ChainBudgetLimits,
} from '../src/application/internal/chain-budget.js'
import type { RequirementFacts } from '../src/domain/requirement/RequirementSummary.js'
import { harness } from './support/dive-loop-harness.js'

const LIMITS: ChainBudgetLimits = { maxInFlightChains: 3, maxCacheReadTokens: 1_000 }

function facts(over: Partial<RequirementFacts> = {}): RequirementFacts {
  return {
    id: 'REQ-a', title: 'a', description: '', status: 'implementing', updatedAt: 1, version: 1,
    artifacts: [],
    ...over,
  }
}

const armed = (id: string, over: Partial<RequirementFacts> = {}): RequirementFacts =>
  facts({ id, autoRun: true, dive: { activation: 'armed', phase: 'active', roundsInStage: 0 }, ...over })

describe('isInFlightChain · 判据与起轮口径同源', () => {
  it('armed + autoRun + implementing → 在跑', () => {
    expect(isInFlightChain(armed('REQ-a'))).toBe(true)
  })

  it('缺任一条件 → 不在跑（disarmed / autoRun 非 true / 非 implementing）', () => {
    expect(isInFlightChain(armed('REQ-a', { dive: { activation: 'disarmed', phase: 'active', roundsInStage: 0 } }))).toBe(false)
    expect(isInFlightChain(armed('REQ-a', { autoRun: false }))).toBe(false)
    expect(isInFlightChain(armed('REQ-a', { status: 'accepting' }))).toBe(false)
  })
})

describe('checkChainBudget · WIP 上限', () => {
  it('恰好到上限 → 拒绝，并给出阈值名与当前值（人要看得见挡在哪）', () => {
    const list = [armed('REQ-1'), armed('REQ-2'), armed('REQ-3'), facts({ id: 'REQ-new' })]
    const v = checkChainBudget({ facts: list, candidateId: 'REQ-new', limits: LIMITS })
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('wip-limit')
    expect(v.detail).toEqual({ name: 'maxInFlightChains', current: 3, limit: 3 })
  })

  it('候选自己若已在跑 → 不计入（续跑不是新链）', () => {
    const list = [armed('REQ-1'), armed('REQ-2'), armed('REQ-3')]
    const v = checkChainBudget({ facts: list, candidateId: 'REQ-3', limits: LIMITS })
    expect(v.allowed).toBe(true)
  })

  it('未到上限 → 放行', () => {
    const list = [armed('REQ-1'), facts({ id: 'REQ-new' })]
    expect(checkChainBudget({ facts: list, candidateId: 'REQ-new', limits: LIMITS }).allowed).toBe(true)
  })
})

describe('checkChainBudget · token 预算（粗闸）', () => {
  it('累计超限 → token-budget，detail 带当前值与上限', () => {
    const list = [
      facts({ id: 'REQ-1', tokenUsage: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 800 } }),
      facts({ id: 'REQ-2', tokenUsage: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 400 } }),
      facts({ id: 'REQ-new' }),
    ]
    const v = checkChainBudget({ facts: list, candidateId: 'REQ-new', limits: LIMITS })
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('token-budget')
    expect(v.detail).toEqual({ name: 'maxCacheReadTokens', current: 1_200, limit: 1_000 })
  })

  it('缺 tokenUsage 的需求按 0 计（"从未跑过"不伪造消耗）', () => {
    expect(cacheReadTotal([facts({ id: 'REQ-1' }), facts({ id: 'REQ-2' })])).toBe(0)
  })

  it('WIP 先于 token（两个都超时报更结构性的那条）', () => {
    const big = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 9_999 }
    const list = [
      armed('REQ-1', { tokenUsage: big }), armed('REQ-2', { tokenUsage: big }), armed('REQ-3', { tokenUsage: big }),
      facts({ id: 'REQ-new' }),
    ]
    expect(checkChainBudget({ facts: list, candidateId: 'REQ-new', limits: LIMITS }).reason).toBe('wip-limit')
  })
})

describe('缺省限额与计数口径', () => {
  it('缺省 3 条链 / 5 亿 cacheRead（保守侧，见模块头注）', () => {
    expect(DEFAULT_CHAIN_BUDGET_LIMITS).toEqual({ maxInFlightChains: 3, maxCacheReadTokens: 500_000_000 })
  })

  it('inFlightChainCount 不含候选', () => {
    expect(inFlightChainCount([armed('REQ-1'), armed('REQ-2')], 'REQ-1')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// FR-11 接线：起轮前真的会问这道闸（REQ-261004065652-5c1c t7）
// ---------------------------------------------------------------------------

describe('FR-11 · 起轮前预算闸（驱动接线）', () => {
  it('预算拒绝 → 零投递，且理由含阈值名与当前值（人要看得见挡在哪）', async () => {
    const h = harness({
      chainBudget: () => ({ allowed: false, reason: 'wip-limit', detail: { name: 'maxInFlightChains', current: 3, limit: 3 } }),
    })
    for (let i = 0; i < 10; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered, '超限时一个回合都不该起').toHaveLength(0)
    expect(h.infos.join(' ')).toContain('预算闸拒绝')
    expect(h.infos.join(' ')).toContain('maxInFlightChains 3/3')
    expect(h.diveOf('REQ-a')?.driverHealth, '预算拒绝不是故障：不写健康位').toBeUndefined()
  })

  it('预算放行 → 正常起轮（闸不该拦住该跑的链）', async () => {
    const h = harness({ chainBudget: () => ({ allowed: true }) })
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
  })

  it('判据抛错 → fail-open（本拍放行）且响亮留痕，不把自动化整体停摆', async () => {
    const h = harness({ chainBudget: () => { throw new Error('预算判据炸了') } })
    await h.idle('agent-1')
    expect(h.delivered, '判据的 bug 不该变成"整个自动化停摆"').toHaveLength(1)
    expect(h.warns.join(' ')).toContain('预算判据抛错')
  })

  it('用真判据接线：3 条在跑 → 第 4 条被拒；名额释放后放行', async () => {
    const running = [armed('REQ-000011'), armed('REQ-000012'), armed('REQ-000013')]
    const candidate = facts({ id: 'REQ-000014' })
    const h = harness({
      chainBudget: (id) => checkChainBudget({
        facts: [...running, candidate],
        candidateId: id,
        limits: DEFAULT_CHAIN_BUDGET_LIMITS,
      }),
    })
    await h.idle('agent-1')
    expect(h.delivered, '第 4 条链该被 WIP 上限挡住').toHaveLength(0)

    running.pop() // 一条链跑完 → 名额释放
    await h.idle('agent-1')
    expect(h.delivered, '名额释放后应能起轮').toHaveLength(1)
  })

  it('缺省不装配（undefined）→ 行为与改动前逐字一致', async () => {
    const h = harness()
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
  })
})
