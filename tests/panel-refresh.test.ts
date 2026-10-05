/**
 * panel-refresh.ts 单测（REQ-261001124111-5d36 t1 · 覆盖设计 TC-A…TC-H）。
 *
 * 为什么用**手工假时钟**而不是 vi.useFakeTimers：本模块的计时器与时钟都是注入进来的
 * （设计刻意如此），注入式假时钟能逐毫秒精确断言"第几次请求在第几毫秒发生"，
 * 也让"停表后在飞响应不得回写"这类时序性质可证伪。
 *
 * serves: FR-1, FR-2, FR-3
 */
import { describe, it, expect } from 'vitest'
import {
  createPanelRefresh,
  DEFAULT_REFRESH_MS,
  DEFAULT_STALE_AFTER_MS,
  MAX_ERROR_CHARS,
  type PanelFreshness,
  type PanelRefreshOptions,
} from '../src/client/panel-refresh.js'
import type { StageOverview } from '../src/shared/protocol.js'

/** 测试用最小 overview（本模块只把它原样转发，不读字段）。 */
function overview(tag: string): StageOverview {
  return { requirementId: 'REQ-test', category: 'feature', currentStage: 'decomposing', stages: [], tag } as unknown as StageOverview
}

function tagOf(o: StageOverview): string {
  return (o as unknown as { tag: string }).tag
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** 手工时钟 + 周期计时器：advance() 按到期顺序触发回调（回调里新排的计时器也在同一次 advance 内生效）。 */
class Clock {
  private t: number
  private readonly timers = new Map<number, { fn: () => void; every: number; next: number }>()
  private seq = 1

  constructor(start = 1_000_000) { this.t = start }

  now = (): number => this.t

  setTimer = (fn: () => void, ms: number): unknown => {
    const id = this.seq
    this.seq += 1
    this.timers.set(id, { fn, every: ms, next: this.t + ms })
    return id
  }

  clearTimer = (handle: unknown): void => { this.timers.delete(handle as number) }

  timerCount(): number { return this.timers.size }

  advance(ms: number): void {
    const target = this.t + ms
    for (;;) {
      let dueId: number | undefined
      let dueNext = Number.POSITIVE_INFINITY
      for (const [id, timer] of this.timers) {
        if (timer.next <= target && timer.next < dueNext) { dueNext = timer.next; dueId = id }
      }
      if (dueId === undefined) break
      const timer = this.timers.get(dueId)!
      this.t = timer.next
      timer.next += timer.every
      timer.fn()
    }
    this.t = target
  }
}

/** 让挂起的 promise 链（then/catch/finally 共 3 跳）跑完。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

function harness(over: Partial<PanelRefreshOptions> = {}) {
  const clock = new Clock()
  const data: StageOverview[] = []
  const changes: PanelFreshness[] = []
  const queue: Array<Deferred<StageOverview>> = []
  const panel = createPanelRefresh({
    fetchOverview: () => { const d = deferred<StageOverview>(); queue.push(d); return d.promise },
    onData: (ov) => { data.push(ov) },
    onChange: (f) => { changes.push(f) },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...over,
  })
  return { clock, panel, data, changes, queue }
}

describe('panel-refresh · 调度语义', () => {
  it('TC-A start() 立即拉一次，随后按周期（默认 5000ms）拉', async () => {
    const h = harness()
    expect(h.panel.freshness().intervalMs).toBe(DEFAULT_REFRESH_MS)
    h.panel.start()
    expect(h.queue.length).toBe(1) // 立即，不等 5 秒

    h.queue[0]!.resolve(overview('a1'))
    await flush()
    expect(h.data.map(tagOf)).toEqual(['a1'])
    expect(h.panel.freshness().fetchedAt).toBe(h.clock.now())

    h.clock.advance(4999)
    expect(h.queue.length).toBe(1) // 未到周期不拉
    h.clock.advance(1)
    expect(h.queue.length).toBe(2)
    h.queue[1]!.resolve(overview('a2'))
    await flush()

    h.clock.advance(5000)
    expect(h.queue.length).toBe(3)
    h.queue[2]!.resolve(overview('a3'))
    await flush()
    expect(h.data.map(tagOf)).toEqual(['a1', 'a2', 'a3'])
  })

  it('TC-A′ start() 幂等：重复调用不产生第二个立即请求，也不叠加计时器', async () => {
    const h = harness()
    h.panel.start()
    h.panel.start()
    expect(h.queue.length).toBe(1)
    expect(h.clock.timerCount()).toBe(1)
    h.queue[0]!.resolve(overview('a1'))
    await flush()
  })

  it('TC-B intervalMs=0（回退开关）只拉一次，之后不再自行发起', async () => {
    const h = harness({ intervalMs: 0 })
    h.panel.start()
    expect(h.queue.length).toBe(1)
    h.queue[0]!.resolve(overview('b1'))
    await flush()
    h.clock.advance(60000)
    expect(h.queue.length).toBe(1)
    expect(h.clock.timerCount()).toBe(0)
  })

  it('TC-C 在飞去重：已有请求在飞时 refresh() 不发新请求（也不排队）', async () => {
    const h = harness()
    h.panel.start()
    const second = h.panel.refresh('event')
    const third = h.panel.refresh('switch')
    expect(h.queue.length).toBe(1)

    h.queue[0]!.resolve(overview('c1'))
    await second
    await third
    await flush()
    expect(h.queue.length).toBe(1)
    expect(h.data.map(tagOf)).toEqual(['c1'])
    expect(h.panel.freshness().inFlight).toBe(false)
  })

  it('TC-D 失败：不回调 onData、failureCount++、lastError 截断，且下一周期仍重试（不退避）', async () => {
    const h = harness()
    h.panel.start()
    h.queue[0]!.reject(new Error('x'.repeat(500)))
    await flush()

    const f = h.panel.freshness()
    expect(h.data.length).toBe(0) // 旧数据不得冒充新数据
    expect(f.failureCount).toBe(1)
    expect(f.lastError).toHaveLength(MAX_ERROR_CHARS)
    expect(f.fetchedAt).toBeUndefined()

    h.clock.advance(5000)
    expect(h.queue.length).toBe(2) // 仍按原周期重试
    h.queue[1]!.reject(new Error('still down'))
    await flush()
    expect(h.panel.freshness().failureCount).toBe(2)
  })

  it('TC-E 成功后清错：failureCount 归零、lastError 清空、fetchedAt 前进', async () => {
    const h = harness()
    h.panel.start()
    h.queue[0]!.reject(new Error('boom'))
    await flush()
    expect(h.panel.freshness().lastError).toBe('boom')

    h.clock.advance(5000)
    h.clock.advance(7000) // 让 now 明显前进，便于断言 fetchedAt
    h.queue[1]!.resolve(overview('e1'))
    await flush()

    const f = h.panel.freshness()
    expect(f.failureCount).toBe(0)
    expect(f.lastError).toBeUndefined()
    expect(f.fetchedAt).toBe(h.clock.now())
    expect(h.data.map(tagOf)).toEqual(['e1'])
  })

  it('TC-F 陈旧跃迁：now 前进超过 staleAfterMs 后 stale=true 且 onChange 被通知', async () => {
    const h = harness({ intervalMs: 0 })
    h.panel.start()
    h.queue[0]!.resolve(overview('f1'))
    await flush()
    expect(h.panel.freshness().staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(h.panel.freshness().stale).toBe(false)

    const before = h.changes.length
    h.clock.advance(DEFAULT_STALE_AFTER_MS + 1000)
    const pending = h.panel.refresh('event') // 进入点即判断（即使在飞被去重也要广播）
    expect(h.panel.freshness().stale).toBe(true)
    expect(h.changes.length).toBeGreaterThan(before)
    expect(h.changes[h.changes.length - 1]!.stale).toBe(true)

    h.queue[1]!.resolve(overview('f2'))
    await pending
    await flush()
    expect(h.panel.freshness().stale).toBe(false)
  })

  it('TC-G stop() 作废在飞响应：resolve 后不再 onData/onChange，也不再自行发起', async () => {
    const h = harness()
    h.panel.start()
    const changesBefore = h.changes.length
    h.panel.stop()

    h.queue[0]!.resolve(overview('g1'))
    await flush()
    expect(h.data.length).toBe(0)
    expect(h.changes.length).toBe(changesBefore)
    expect(h.panel.freshness().fetchedAt).toBeUndefined()

    h.clock.advance(30000)
    expect(h.queue.length).toBe(1) // 停表后不再发起
  })

  it('TC-G′ stop() 后可以重新 start()：新请求正常写入（代际不粘连）', async () => {
    const h = harness()
    h.panel.start()
    h.panel.stop()
    h.panel.start()
    expect(h.queue.length).toBe(2)
    h.queue[1]!.resolve(overview('g2'))
    await flush()
    expect(h.data.map(tagOf)).toEqual(['g2'])
  })

  it('TC-H 无成功数据即陈旧：未开始 / 在飞 / 失败三种情形都不得声称"最新"', async () => {
    const h = harness()
    expect(h.panel.freshness().stale).toBe(true) // 未开始
    h.panel.start()
    expect(h.panel.freshness().stale).toBe(true) // 在飞但从未成功
    h.queue[0]!.reject(new Error('down'))
    await flush()
    expect(h.panel.freshness().stale).toBe(true) // 失败后仍无可用数据
  })

  it('TC-H′ subscribe 与 onChange 同时收到跃迁，退订后不再收到', async () => {
    const h = harness()
    const seen: PanelFreshness[] = []
    const off = h.panel.subscribe((f) => { seen.push(f) })
    h.panel.start()
    h.queue[0]!.resolve(overview('h1'))
    await flush()
    expect(seen.length).toBeGreaterThan(0)
    expect(h.changes.length).toBeGreaterThan(0)

    off()
    const seenBefore = seen.length
    h.clock.advance(5000)
    h.queue[1]!.resolve(overview('h2'))
    await flush()
    expect(seen.length).toBe(seenBefore)
    expect(h.changes.length).toBeGreaterThan(0) // onChange 不受退订影响
  })
})
