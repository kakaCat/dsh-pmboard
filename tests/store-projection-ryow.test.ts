// serves: FR-4, FR-11
/**
 * 窄投影「读己所写」回归（REQ-261004065652-5c1c · t2 / TC-1、TC-2）。
 *
 * ## 这份测试为什么必须用**分片实现**
 *
 * 事故根因是 `ShardedRequirementStore.factsCache` **只在建索引/create 时填一次**，写路径只刷索引
 * ⇒ dive 驱动在 idle 同步缝里读 `peekFacts()` 时，读到的 `dive` 是**建索引那一刻**的旧值。
 * 2026-10-03 实测：18:03:52 台账已写 `driverHealth=paused`，此后 4.5 小时的回合消息带
 * `revision=70`（实时索引）却恒为 `round=1`（陈旧 `roundsInStage`）——同一次投影里版本新、dive 旧。
 *
 * ⚠️ 用内存替身（`makeHarness` 的 `makeTestStore`）**测不出这个缺陷**：它的 `peekFacts()` 是
 * 活投影（每次现读记录）。测试替身与生产实现不同形，正是这个 bug 长期没被发现的原因——
 * 所以本文件刻意只用**生产实现**（分片 store + 假 fs）。
 *
 * ## 反向演练（验收要求）
 *
 * 把 `ShardedRequirementStore` 构造参数里 `notify` 回调的那一行
 * `if (facts !== undefined && this.factsCache !== undefined) this.factsCache.set(id, facts)`
 * 注释掉 → **本文件必红**，且红在"读己所写"这两条上（其余用例不受影响）。
 */
import { describe, it, expect } from 'vitest'
import { FakeShardFs, seedShard } from './reqboard/fake-shard-fs.js'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { isDrivableRequirement } from '../src/application/dive/round-state.js'
import { checkChainBudget } from '../src/application/internal/chain-budget.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const ROOT = '/data/reqboard'

function req(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id, title: `需求 ${id}`, description: '描述', status: 'implementing', blocked: false,
    comments: [], version: 1, createdAt: 100, updatedAt: 100,
    createdBy: { kind: 'agent' }, updatedBy: { kind: 'agent' },
    ...over,
  }
}

/** 生产实现 + 假 fs：建索引后返回（生产里由看板首次 listSummaries 触发建索引）。 */
async function shardedStore(seed: readonly RequirementRecord[]): Promise<ShardedRequirementStore> {
  const fs = new FakeShardFs()
  const repo = new RequirementShardRepository({ fs, now: () => 1_000, onWarn: () => { /* 本文件不关心告警 */ } })
  for (const record of seed) await seedShard(repo, ROOT, { record })
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 1 })
  const store = new ShardedRequirementStore({ root: ROOT, repository: repo, now: () => 1_000, onWarn: () => { /* 同上 */ } })
  await store.listSummaries() // 建索引 → factsCache 填初值
  return store
}

const REQ = 'REQ-261004065652-5c1c'

describe('TC-1 · 写进去的 dive 状态，同拍就应读得到', () => {
  it('写 driverHealth=paused → peekFacts() 同拍读到 paused（事故形态的直接回归）', async () => {
    const store = await shardedStore([req(REQ, {
      dive: { activation: 'armed', phase: 'active', roundsInStage: 0 },
    })])

    // 前置：建索引时是"可驱动"的
    expect(isDrivableRequirement(store.peekFacts().find((f) => f.id === REQ))).toBe(true)

    // 驱动侧写暂停（这正是 round-driver.disarm 干的事）
    await store.mutate(REQ, (r) => {
      r.dive = {
        ...(r.dive ?? { activation: 'armed', phase: 'active', roundsInStage: 0 }),
        driverHealth: { state: 'paused', reason: 'agent-error', since: 1_000, attempts: 1 },
      }
      return { changed: true }
    })

    // **不 await 任何读**：同步投影必须已经反映这次写入
    const facts = store.peekFacts().find((f) => f.id === REQ)
    expect(facts?.dive?.driverHealth?.state, '读己所写：写路径必须同拍刷新窄投影').toBe('paused')
    expect(isDrivableRequirement(facts), '驱动必须立刻看到自己的暂停').toBe(false)
  })

  it('投影里的 version 与实时索引一致（修前：version 新、dive 旧）', async () => {
    const store = await shardedStore([req(REQ, { dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } })])
    await store.mutate(REQ, (r) => {
      r.dive = { ...(r.dive ?? { activation: 'armed', phase: 'active', roundsInStage: 0 }), pausedReason: 'aborted:user' }
      return { changed: true }
    })
    const facts = store.peekFacts().find((f) => f.id === REQ)
    const summary = await store.getSummary(REQ)
    expect(facts?.version).toBe(summary?.version)
    expect(facts?.dive?.pausedReason).toBe('aborted:user')
  })

  it('advance.pausedReason 同样读己所写（起轮判据的另一半）', async () => {
    const store = await shardedStore([req(REQ, { dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } })])
    await store.mutate(REQ, (r) => {
      r.advance = { ...(r.advance ?? { history: [] }), pausedReason: 'fail' } as never
      return { changed: true }
    })
    expect(store.peekFacts().find((f) => f.id === REQ)?.advance?.pausedReason).toBe('fail')
  })
})

describe('TC-2 · 准入计数经投影可见（回合上限因此才生效）', () => {
  it('写 roundsInStage=1 → 同拍读到 1（round 因此为 2，不再恒 1）', async () => {
    const store = await shardedStore([req(REQ, { dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } })])
    await store.mutate(REQ, (r) => {
      r.dive = { ...(r.dive ?? { activation: 'armed', phase: 'active', roundsInStage: 0 }), roundsInStage: 1 }
      return { changed: true }
    })
    const rounds = store.peekFacts().find((f) => f.id === REQ)?.dive?.roundsInStage ?? 0
    expect(rounds).toBe(1)
    expect(rounds + 1, '下一回合号 = roundsInStage + 1（修前恒 1 ⇒ 上限永不生效）').toBe(2)
  })
})

describe('FR-11 · tokenUsage 经同一条投影管道供数', () => {
  it('写 tokenUsage → 同拍 peekFacts 读到三标量，预算闸据此判定', async () => {
    const store = await shardedStore([req(REQ, { dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } })])
    await store.mutate(REQ, (r) => {
      r.tokenUsage = {
        byStage: {}, updatedAt: 1_000,
        totals: { uncachedInputTokens: 10, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 0 },
      }
      return { changed: true }
    })
    const facts = store.peekFacts().find((f) => f.id === REQ)
    expect(facts?.tokenUsage).toEqual({ uncachedInputTokens: 10, outputTokens: 20, cacheReadTokens: 900 })

    const verdict = checkChainBudget({
      facts: store.peekFacts(), candidateId: 'REQ-other',
      limits: { maxInFlightChains: 10, maxCacheReadTokens: 500 },
    })
    expect(verdict.reason).toBe('token-budget')
    expect(verdict.detail).toEqual({ name: 'maxCacheReadTokens', current: 900, limit: 500 })
  })
})

describe('默认拒绝方向 · 投影不伪造事实', () => {
  it('没有 dive 的需求 → 投影里没有 dive → 不可驱动（不补 healthy）', async () => {
    const store = await shardedStore([req('REQ-0000aa')])
    const facts = store.peekFacts().find((f) => f.id === 'REQ-0000aa')
    expect(facts?.dive).toBeUndefined()
    expect(isDrivableRequirement(facts)).toBe(false)
  })

  it('未跑过的需求 → 投影里没有 tokenUsage（缺失 ≠ 0 桶）', async () => {
    const store = await shardedStore([req('REQ-0000bb')])
    expect(store.peekFacts().find((f) => f.id === 'REQ-0000bb')?.tokenUsage).toBeUndefined()
  })

  it('索引之外的 id 不会凭空出现在投影里', async () => {
    const store = await shardedStore([req(REQ)])
    expect(store.peekFacts().some((f) => f.id === 'REQ-does-not-exist')).toBe(false)
  })
})
