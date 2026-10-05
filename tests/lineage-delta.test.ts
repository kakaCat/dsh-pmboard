/**
 * 跨会话血缘与快照差值单测（REQ-261004154937-2ca3 · 设计 test-cases.md TC-1 / TC-2）。
 *
 * 为什么这层单独测：这套规则就是「口径」本身——谁算后代、差值怎么算——它必须能脱离 DSH 服务、
 * 脱离磁盘被逐条钉住。适配器（t2）只负责喂数据，规则错在这里就该红。
 */
import { describe, expect, it } from 'vitest'
import {
  addBuckets,
  emptyBuckets,
  type TokenBuckets,
  type TokenSnapshot,
  type TokenSnapshotMember,
} from '../src/shared/protocol.js'
import {
  deltaSnapshots,
  descendantsOf,
  sumMembers,
  type LineageHeader,
} from '../src/domain/token/lineage.js'

/** 造桶：四桶和 = 13n（便于手算断言）。 */
const B = (n: number): TokenBuckets => ({
  uncachedInputTokens: n,
  outputTokens: n * 2,
  cacheReadTokens: n * 10,
  cacheWriteTokens: 0,
})
const total = (b: TokenBuckets): number =>
  b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens

/** 造成员。 */
const M = (sessionId: string, depth: number, n: number, seq?: number): TokenSnapshotMember => ({
  sessionId,
  depth,
  ...(seq === undefined ? {} : { seq }),
  totals: B(n),
})

/** 造快照（默认 scope 已聚合）。 */
function S(members: TokenSnapshotMember[], opts: { seq?: number; scope?: 'self' | 'self+descendants' } = {}): TokenSnapshot {
  return {
    sessionId: 'root',
    ...(opts.seq === undefined ? {} : { seq: opts.seq }),
    at: 1,
    totals: sumMembers(members),
    source: 'projection',
    scope: opts.scope ?? 'self+descendants',
    members,
  }
}

describe('TC-1 聚合与恒等式（FR-1）', () => {
  it('TC-1a 主 + 2 子 → totals == 主 + 子1 + 子2，且 totals === Σ members', () => {
    const members = [M('root', 0, 1, 10), M('child-a', 1, 2, 3), M('child-b', 1, 4, 5)]
    const snap = S(members)
    const expect3 = addBuckets(addBuckets(B(1), B(2)), B(4))
    expect(snap.totals).toEqual(expect3)
    expect(snap.totals).toEqual(sumMembers(members))
    expect(total(snap.totals)).toBe(total(expect3))
  })

  it('TC-1b 主 + 0 子 → 与自身路径逐字相同（无子代理窗口零变化）', () => {
    const self = [M('root', 0, 7, 11)]
    const snap = S(self)
    expect(snap.totals).toEqual(B(7))
    // 与「只算自身」的旧行为对照：同一条自身成员，两种口径的数字必须一致
    const legacyTotals = B(7)
    expect(snap.totals).toEqual(legacyTotals)
  })

  it('TC-1c 三层血缘：子与孙都在，depth 为 0 / 1 / 2', () => {
    const headers: LineageHeader[] = [
      { id: 'root' },
      { id: 'child', parentSession: 'root', origin: 'subagent', delegationDepth: 1 },
      { id: 'grand', parentSession: 'child', origin: 'subagent', delegationDepth: 2 },
    ]
    const kids = descendantsOf(headers, 'root')
    expect(kids.map(k => [k.sessionId, k.depth])).toEqual([['child', 1], ['grand', 2]])
    const snap = S([M('root', 0, 1, 1), M('child', 1, 2, 2), M('grand', 2, 3, 3)])
    expect(total(snap.totals)).toBe(13 * 6)
  })

  it('TC-1d fork 窗口（有 parentSession 但 depth 0、非 subagent）不算后代', () => {
    const headers: LineageHeader[] = [
      { id: 'parent-of-fork' },
      // 真实形状：从某窗口 fork 出来的分支窗口，isSeeded 且 delegationDepth 0
      { id: 'forked', parentSession: 'parent-of-fork', delegationDepth: 0 },
      // 它自己再派子代理 → 那个子代理属于 forked，不属于我们的 root
      { id: 'under-fork', parentSession: 'forked', origin: 'subagent', delegationDepth: 1 },
    ]
    expect(descendantsOf(headers, 'parent-of-fork')).toEqual([])
  })

  it('TC-1e 父 header 缺失时断链（不猜血缘）', () => {
    const headers: LineageHeader[] = [{ id: 'root' }, { id: 'orphan', parentSession: 'gone', origin: 'subagent', delegationDepth: 1 }]
    expect(descendantsOf(headers, 'root')).toEqual([])
  })
})

describe('TC-2 差值归属规则（FR-2）', () => {
  it('TC-2a 同名成员相减（常规增量）', () => {
    const start = S([M('root', 0, 1, 1), M('child', 1, 2, 2)])
    const end = S([M('root', 0, 5, 9), M('child', 1, 4, 8)])
    const r = deltaSnapshots(start, end)
    // (5-1) + (4-2) = 6
    expect(total(r.delta)).toBe(13 * 6)
    expect(r.degraded).toBe(false)
  })

  it('TC-2b 新成员全额计入（它诞生于两次快照之间）', () => {
    const start = S([M('root', 0, 1, 1)])
    const end = S([M('root', 0, 2, 5), M('newcomer', 1, 9, 3)])
    const r = deltaSnapshots(start, end)
    // (2-1) + 9（新成员全额） = 10
    expect(total(r.delta)).toBe(13 * 10)
  })

  it('TC-2c 消失成员记 0，不把总数拉低', () => {
    const start = S([M('root', 0, 1, 1), M('gone', 1, 50, 2)])
    const end = S([M('root', 0, 3, 7)])
    const r = deltaSnapshots(start, end)
    // 只算 root 的 (3-1) = 2；gone 的历史值 50 **不得**被减掉
    expect(total(r.delta)).toBe(13 * 2)
    expect(r.degraded).toBe(false)
  })

  it('TC-2d 水位（seq）缺失 → 该成员不参与且标降级', () => {
    const start = S([M('root', 0, 1, 1), M('child', 1, 2)])
    const end = S([M('root', 0, 3, 4), M('child', 1, 5)])
    const r = deltaSnapshots(start, end)
    expect(total(r.delta)).toBe(13 * 2) // 只算 root
    expect(r.degraded).toBe(true)
    expect(r.degradedReason).toBe('member-unavailable')
  })

  it('TC-2e 旧快照（缺 members）→ 退化为总数相减 + legacy-snapshot，不抛错', () => {
    const legacyStart: TokenSnapshot = { at: 1, totals: B(3), source: 'projection' }
    const legacyEnd: TokenSnapshot = { at: 2, totals: B(7), source: 'projection' }
    const r = deltaSnapshots(legacyStart, legacyEnd)
    expect(total(r.delta)).toBe(13 * 4)
    expect(r.degraded).toBe(true)
    expect(r.degradedReason).toBe('legacy-snapshot')
  })

  it('TC-2f 任一侧 unavailable → 空桶（缺失不猜）', () => {
    const ok = S([M('root', 0, 5, 1)])
    const missing: TokenSnapshot = { at: 2, totals: emptyBuckets(), source: 'unavailable' }
    expect(deltaSnapshots(missing, ok).delta).toEqual(emptyBuckets())
    expect(deltaSnapshots(ok, missing).delta).toEqual(emptyBuckets())
    expect(deltaSnapshots(missing, ok).degradedReason).toBe('snapshot-unavailable')
  })

  it('TC-2g 成员顺序不影响结果（按 sessionId 索引，不按下标）', () => {
    const startA = S([M('root', 0, 1, 1), M('child', 1, 2, 2)])
    const endA = S([M('root', 0, 3, 5), M('child', 1, 6, 9)])
    const startB = S([M('child', 1, 2, 2), M('root', 0, 1, 1)])
    const endB = S([M('child', 1, 6, 9), M('root', 0, 3, 5)])
    expect(deltaSnapshots(startA, endA).delta).toEqual(deltaSnapshots(startB, endB).delta)
  })
})

describe('TC-2h 脏成员防御（读侧不校验，故这里必须扛住）', () => {
  it('成员缺四桶 / 负数 / 非数 → 退化为总数相减并标 legacy，不抛错', () => {
    const dirtyStart: TokenSnapshot = {
      at: 1, totals: B(3), source: 'projection', scope: 'self+descendants',
      members: [{ sessionId: 'root', depth: 0, totals: { uncachedInputTokens: 1 } } as never],
    }
    const dirtyEnd: TokenSnapshot = {
      at: 2, totals: B(7), source: 'projection', scope: 'self+descendants',
      members: [{ sessionId: 'root', depth: 0, totals: { uncachedInputTokens: -1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } as never],
    }
    const r = deltaSnapshots(dirtyStart, dirtyEnd)
    expect(total(r.delta)).toBe(13 * 4)
    expect(r.degradedReason).toBe('legacy-snapshot')
  })
})
