/**
 * 会话探测适配器的血缘聚合单测（REQ-261004154937-2ca3 · 设计 test-cases.md TC-3）。
 *
 * 为什么用假服务而不是真磁盘：这里要验的是**接线与降级语义**（谁算后代、取不到怎么办），
 * 真磁盘只会把「取不到」变成偶发红。DSH 两个服务的形状按 adapter 里的鸭子接口最小化注入。
 */
import { describe, expect, it } from 'vitest'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import type { TokenBuckets } from '../src/shared/protocol.js'

const B = (n: number): TokenBuckets => ({
  uncachedInputTokens: n, outputTokens: n * 2, cacheReadTokens: n * 10, cacheWriteTokens: 0,
})
const sum = (b: TokenBuckets): number => b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens

/** 本窗口会话（live 投影用）。 */
const SELF_SESSION = { id: 'session-root', snapshotEvents: () => [0, 1, 2] }

/** 三条 header：主 / 子（depth 1）/ 孙（depth 2）。 */
const HEADERS = [
  { id: 'session-root' },
  { id: 'session-child', parentSession: 'session-root', origin: 'subagent' as const, delegationDepth: 1 },
  { id: 'session-grand', parentSession: 'session-child', origin: 'subagent' as const, delegationDepth: 2 },
  // fork 出来的分支窗口：有 parentSession 但 depth 0、非 subagent → 不算后代
  { id: 'session-fork', parentSession: 'session-root', delegationDepth: 0 },
]

function makeAdapter(opts: {
  persistence?: unknown
  cache?: unknown
  selfBuckets?: TokenBuckets
}): SessionProbeAdapter {
  const self = opts.selfBuckets ?? B(1)
  return new SessionProbeAdapter({
    agents: () => ({ get: (id: string) => (id === 'w' ? { session: SELF_SESSION } : undefined) }),
    sessionProjections: () => ({ stateOf: () => self }),
    ...(opts.persistence === undefined ? {} : { sessionPersistence: () => opts.persistence }),
    ...(opts.cache === undefined ? {} : { sessionProjectionCache: () => opts.cache }),
    now: () => 1000,
  })
}

/** 假持久化：list 返回三条 header；open/read 返回空事件（冷读路径用）。 */
function fakePersistence(headers: readonly unknown[] = HEADERS): unknown {
  return {
    list: async () => headers.map(header => ({ header })),
    open: async () => ({ inheritedEventCount: 0, read: async () => ({ events: [] }), close: async () => {} }),
  }
}

/** 假投影缓存：按会话 id 给用量，未列出的 id 一律未命中（undefined）。 */
function fakeCache(values: Record<string, { n: number; seq?: number }>): unknown {
  return {
    cachedSnapshot: (meta: unknown) => {
      const id = (meta as { id?: string } | undefined)?.id ?? ''
      const v = values[id]
      if (v === undefined) return undefined
      return { asOfSeq: v.seq ?? 5, values: { tokenUsage: B(v.n) } }
    },
    coldSnapshot: () => undefined,
  }
}

describe('REQ-261004154937-2ca3 · 血缘枚举与聚合（FR-1 / FR-3）', () => {
  it('闭包含全部后代且 depth 正确；fork 窗口不算', async () => {
    const a = makeAdapter({ persistence: fakePersistence(), cache: fakeCache({}) })
    const entries = await a.descendantSessions('w')
    expect(entries?.map(e => [e.sessionId, e.depth])).toEqual([['session-child', 1], ['session-grand', 2]])
  })

  it('聚合：自身 + 后代可用量之和，且 totals === Σmembers', async () => {
    const a = makeAdapter({
      persistence: fakePersistence(),
      cache: fakeCache({ 'session-child': { n: 2, seq: 3 }, 'session-grand': { n: 4, seq: 7 } }),
      selfBuckets: B(1),
    })
    await a.descendantSessions('w') // 预热集合（异步）→ 之后读数是同步的
    const snap = a.tokenTotals('w')
    expect(snap.scope).toBe('self+descendants')
    expect(sum(snap.totals!)).toBe(sum(B(1)) + sum(B(2)) + sum(B(4)))
    const memberSum = (snap.members ?? []).reduce((acc, m) => acc + sum(m.totals), 0)
    expect(sum(snap.totals!)).toBe(memberSum)
    expect(snap.members?.map(m => m.depth).sort()).toEqual([0, 1, 2])
    expect(snap.degradedMembers).toBeUndefined()
  })

  it('某后代取不到用量 → 进 degradedMembers、不进 totals（缺失 ≠ 0）', async () => {
    const a = makeAdapter({
      persistence: fakePersistence(),
      // 孙会话没有缓存行 → 未命中
      cache: fakeCache({ 'session-child': { n: 2, seq: 3 } }),
      selfBuckets: B(1),
    })
    await a.descendantSessions('w')
    const snap = a.tokenTotals('w')
    expect(sum(snap.totals!)).toBe(sum(B(1)) + sum(B(2))) // 不把孙当 0，也不拉高
    expect(snap.degradedMembers).toEqual(['session-grand'])
    expect(snap.degradedReason).toBe('member-unavailable')
  })

  it('冷读预算超限 → degradedReason=cold-read-budget', async () => {
    const many = [
      { id: 'session-root' },
      ...Array.from({ length: 3 }, (_, i) => ({ id: 'c' + i, parentSession: 'session-root', origin: 'subagent' as const, delegationDepth: 1 })),
    ]
    const a = new SessionProbeAdapter({
      agents: () => ({ get: () => ({ session: SELF_SESSION }) }),
      sessionProjections: () => ({ stateOf: () => B(1) }),
      sessionPersistence: () => fakePersistence(many),
      sessionProjectionCache: () => fakeCache({}), // 全部未命中
      maxColdReads: 1,
      now: () => 1000,
    })
    await a.descendantSessions('w')
    const snap = a.tokenTotals('w')
    expect(snap.degradedReason).toBe('cold-read-budget')
    expect(snap.degradedMembers?.length).toBe(3)
    expect(sum(snap.totals!)).toBe(sum(B(1))) // 只有自身
  })

  it('两个服务都缺失 → scope=self + descendants-unavailable，数字与自身路径逐字相同', async () => {
    const bare = makeAdapter({ selfBuckets: B(3) })
    const snap = bare.tokenTotals('w')
    expect(snap.scope).toBe('self')
    expect(snap.degradedReason).toBe('descendants-unavailable')
    expect(snap.totals).toEqual(B(3))
    expect(snap.members).toBeUndefined()
    // 血缘查询也如实返回 undefined（不假装聚合过）
    expect(await bare.descendantSessions('w')).toBeUndefined()
  })

  it('本窗口会话投影不可得 → 既有 unavailable 语义不变（不因聚合而变）', () => {
    const a = new SessionProbeAdapter({
      agents: () => ({ get: () => undefined }),
      sessionProjections: () => ({ stateOf: () => B(1) }),
      sessionPersistence: () => fakePersistence(),
      sessionProjectionCache: () => fakeCache({}),
      now: () => 1000,
    })
    const snap = a.tokenTotals('w')
    expect(snap.source).toBe('unavailable')
    expect(snap.scope).toBeUndefined()
  })

  it('未预热时（集合还没刷出来）→ 如实标 self，不臆造后代', () => {
    const a = makeAdapter({ persistence: fakePersistence(), cache: fakeCache({ 'session-child': { n: 9 } }), selfBuckets: B(1) })
    const snap = a.tokenTotals('w') // 首次调用：触发异步刷新，但本轮同步只能读到空集合
    expect(snap.scope).toBe('self+descendants')
    expect(sum(snap.totals!)).toBe(sum(B(1)))
    expect(snap.members).toHaveLength(1)
  })
})
