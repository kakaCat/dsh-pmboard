/**
 * rollup 写时快照（REQ-260927121324-abde t4 / FR-6）——两例对偶。
 *
 *  ① **有会话**：任务驱动的派生推进（implementing → accepting）结算离开节点，
 *     差值进 byStage + 新状态事件带写时快照；
 *  ② **启动对账无会话**：applyPickupReconcile（插件启动补齐）没有会话上下文，
 *     即便会话投影可得也**不写快照、不结算**——不伪造。
 */
import { describe, it, expect } from 'vitest'
import { applyPickupReconcile, applyTaskRollupVia } from '../src/application/internal/rollup.js'
import { snapshotProviderFor } from '../src/application/internal/token-usage.js'
import { makeHarness, req, task } from './application/harness.js'
import type { TokenBuckets, TokenSnapshot } from '../src/shared/protocol.js'

const W = 'session-w-001'
const B = (n: number): TokenBuckets => ({ uncachedInputTokens: n, outputTokens: n * 2, cacheReadTokens: n * 10, cacheWriteTokens: 0 })
const snap = (n: number, sessionId: string = W): TokenSnapshot => ({ sessionId, at: 1000 + n, totals: B(n), source: 'projection' })

describe('REQ-260927121324-abde t4 · rollup 的写时快照', () => {
  it('有会话：派生推进结算离开节点进 byStage，新事件带快照', async () => {
    const h = makeHarness({
      requirements: [req({
        status: 'implementing',
        statusHistory: [{ status: 'implementing', at: 1, by: { kind: 'agent', sessionId: W }, tokenSnapshot: snap(2) }],
      })],
      tasks: [task({ status: 'done' })],
    })
    h.session.tokenSnapshot = snap(5)

    // 新签名 `applyTaskRollup(ledger, tasks, ctx, onlyReqId?)`：任务取自 harness 的**真实**
    // QueueTaskStore（`await h.tasksOf(reqId)`），不是 `[]`/`undefined`。
    // B12 阶段⑤：改走新端口的 `applyTaskRollupVia`（定点读 → 纯计划 → 单次 mutate）
    const advanced = await applyTaskRollupVia(h.store, await h.tasksOf('REQ-000001'), {
      now: 10,
      commentId: () => 'c-1',
      snapshot: snapshotProviderFor(h.deps, W),
    }, 'REQ-000001')

    expect(advanced).toBeDefined()
    const r = (await h.store.get('REQ-000001'))!
    expect(r.status).toBe('accepting')
    expect(r.tokenUsage!.byStage.implementing).toEqual(B(3))
    expect(r.tokenUsage!.totals).toEqual(B(3))
    const last = r.statusHistory![r.statusHistory!.length - 1]!
    expect(last.status).toBe('accepting')
    expect(last.tokenSnapshot!.source).toBe('projection')
    expect(last.tokenSnapshot!.totals).toEqual(B(5))
  })

  it('启动对账无会话：不写快照、不结算（不伪造）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'draft' })] })
    // 会话投影其实可得——但启动对账没有会话上下文，就不传 provider、绝不猜测
    h.session.tokenSnapshot = snap(9)

    // B12 阶段⑤：启动对账走新端口的 `sweep`；`applyPickupReconcile` 仍吃册形视图，
    // 故在**调用点**用 drafts 现搭一个（与 src/index.ts 的启动对账同款改法）。
    let advanced: unknown[] = []
    await h.store.sweep('pickup-reconcile', (drafts) => {
      const view = { revision: 0, requirements: drafts, triages: [] } as never
      advanced = applyPickupReconcile(view as never, { now: 10, commentId: () => 'c-2' })
      return advanced.map((x) => (x as { id: string }).id)
    })

    expect(advanced).toHaveLength(1)
    const r = (await h.store.get('REQ-000001'))!
    expect(r.status).toBe('brainstorming')
    expect(r.tokenUsage).toBeUndefined()
    const last = r.statusHistory![r.statusHistory!.length - 1]!
    expect(last.tokenSnapshot).toBeUndefined()
  })
})
