/**
 * 起链预算闸（REQ-261004065652-5c1c FR-11 · t1）。
 *
 * ## 病：没有"同时跑几条"和"今天烧了多少"的概念
 *
 * 2026-10-03 实测：多窗口共享一份 provider 额度、各跑各的自动链，单需求 implementing 阶段
 * 就烧掉 **14.07 亿 cacheRead**（REQ-261001145152-3982），全仓累计 ≈43 亿
 * （requirement.md §调研证据 E-6）。没有任何一层回答"现在还能不能再起一条"。
 *
 * ## 形态：粗闸，不是账本
 *
 *   ① **WIP 上限**：数 `armed ∧ autoRun ∧ implementing` 的链数（候选自己若已在跑，不计入——
 *      那是对既有链的续跑，不是"新链"）；
 *   ② **token 预算**：各需求 `tokenUsage.totals.cacheReadTokens` 之和；
 *   ③ 只回答"要不要起**新**链"——**不杀**已在跑的链（停一条在跑的链是人的决定，不是闸的决定）。
 *
 * **诚实边界**：台账没有 provider 字段，所以这是"按需求级累计"的粗闸，不是 provider 级配额核算；
 * 真正的配额分账留待需要时另立需求。
 *
 * 纯函数、零 I/O。
 *
 * @module dsh-pmboard/application/internal/chain-budget
 */
import type { RequirementFacts } from '../../domain/requirement/RequirementSummary.js'

export interface ChainBudgetLimits {
  /** 同时在跑的自动链上限。 */
  maxInFlightChains: number
  /** 全部需求 cacheRead 累计上限（粗闸；缺省 5×10^8）。 */
  maxCacheReadTokens: number
}

/** 缺省限额：3 条链 / 5 亿 cacheRead（依据 E-2 的"两窗口就把额度打爆"取保守侧）。 */
export const DEFAULT_CHAIN_BUDGET_LIMITS: ChainBudgetLimits = {
  maxInFlightChains: 3,
  maxCacheReadTokens: 500_000_000,
}

export type ChainBudgetReason = 'wip-limit' | 'token-budget'

export interface ChainBudgetVerdict {
  allowed: boolean
  reason?: ChainBudgetReason
  detail?: { name: string; current: number; limit: number }
}

/** 该需求是否"正在跑一条自动链"（判据与 round-driver 的起轮口径同源）。 */
export function isInFlightChain(facts: RequirementFacts): boolean {
  return facts.dive?.activation === 'armed' && facts.autoRun === true && facts.status === 'implementing'
}

/** 在跑链数（`excludeId` = 候选自己：续跑不计入上限）。 */
export function inFlightChainCount(facts: readonly RequirementFacts[], excludeId?: string): number {
  return facts.filter((f) => f.id !== excludeId && isInFlightChain(f)).length
}

/** 全部需求的 cacheRead 累计（缺 `tokenUsage` 的需求按 0 计——"从未跑过"不伪造消耗）。 */
export function cacheReadTotal(facts: readonly RequirementFacts[], excludeId?: string): number {
  let total = 0
  for (const f of facts) {
    if (f.id === excludeId) continue
    total += f.tokenUsage?.cacheReadTokens ?? 0
  }
  return total
}

/**
 * 起新链前的判定。WIP 先于 token（确定性顺序：同一时刻两个阈值都超时，报更"结构性"的那条）。
 */
export function checkChainBudget(input: {
  facts: readonly RequirementFacts[]
  candidateId: string
  limits: ChainBudgetLimits
}): ChainBudgetVerdict {
  const { facts, candidateId, limits } = input

  const chains = inFlightChainCount(facts, candidateId)
  if (chains >= limits.maxInFlightChains) {
    return {
      allowed: false,
      reason: 'wip-limit',
      detail: { name: 'maxInFlightChains', current: chains, limit: limits.maxInFlightChains },
    }
  }

  const tokens = cacheReadTotal(facts, candidateId)
  if (tokens >= limits.maxCacheReadTokens) {
    return {
      allowed: false,
      reason: 'token-budget',
      detail: { name: 'maxCacheReadTokens', current: tokens, limit: limits.maxCacheReadTokens },
    }
  }

  return { allowed: true }
}
