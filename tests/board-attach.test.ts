/**
 * attachBoard 生命周期单测（REQ-260928185112-e20d FR-2 / 任务卡 t-48d9a4）。
 *
 * 覆盖：attachBoard(container) 返回 disposer；dispose 后定时器计数归零（clearInterval 已清）、
 * 容器上的 click/change 监听已移除、SSE 订阅已关闭；isActive()=false 时轮询跳过刷新；
 * poll:false（旧 board-shell 路径）不自建定时器。
 *
 * 环境：vitest 默认 node（本包不含 jsdom）——只注入本用例需要的最小 document/window/EventSource
 * 桩，不做真实 DOM 断言；渲染结果（innerHTML）不是本用例的观测对象。
 *
 * serves: FR-2（REQ-260928222643-4d34：看板挂载时消费一次性定位意图，TC-7/TC-8）；
 *         FR-5, FR-8（REQ-261004210128-283d：运行态订阅、重绘门控与 dispose 退订，TC-12～TC-14）。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { attachBoard } from '../src/client/board-mount.ts'
import { requestBoardFocus, clearBoardFocus, peekBoardFocus } from '../src/client/board-focus.ts'

const origFetch = globalThis.fetch

/** 最小容器：只记录监听器增删，不参与渲染。 */
function fakeContainer(): { el: HTMLElement; added: string[]; removed: string[] } {
  const added: string[] = []
  const removed: string[] = []
  const el = {
    innerHTML: '',
    addEventListener: (t: string) => { added.push(t) },
    removeEventListener: (t: string) => { removed.push(t) },
  } as unknown as HTMLElement
  return { el, added, removed }
}

/** 空的看板状态（render 会走 buildBoard 的零需求分支）。 */
const EMPTY_STATE = { revision: 1, requirements: [], tasks: [], ready: {} }

function okResponse(): Promise<Response> {
  return Promise.resolve(new Response(
    JSON.stringify({ success: true, data: EMPTY_STATE }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
}

/** 记录 close 调用的 EventSource 桩（SSE 订阅的释放证据）。 */
const sseClosed: string[] = []
class FakeEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null
  constructor(readonly url: string) { /* 记录 URL 即可 */ }
  close(): void { sseClosed.push(this.url) }
}

beforeEach(() => {
  vi.useFakeTimers()
  sseClosed.length = 0
  vi.stubGlobal('fetch', vi.fn(() => okResponse()))
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (origFetch) globalThis.fetch = origFetch
})

describe('attachBoard（宿主挂载：挂上即收集，dispose 即释放）', () => {
  it('返回 disposer；dispose 后定时器归零、容器监听移除、SSE 关闭', () => {
    const { el, added, removed } = fakeContainer()
    const dispose = attachBoard(el)

    expect(typeof dispose).toBe('function')
    expect(added).toEqual(['click', 'change'])
    expect(vi.getTimerCount()).toBe(1) // 轮询 interval

    dispose()

    expect(removed).toEqual(['click', 'change'])
    expect(vi.getTimerCount()).toBe(0) // clearInterval 已生效
    expect(sseClosed).toEqual(['/dashboard/api/reqboard/events'])
  })

  it('dispose 幂等：重复调用不重复清理、不抛', () => {
    const { el, removed } = fakeContainer()
    const dispose = attachBoard(el)

    dispose()
    dispose()

    expect(removed).toEqual(['click', 'change'])
    expect(sseClosed).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isActive()=false → 到点跳过刷新；恢复可见 → 到点刷新', async () => {
    const fetchMock = vi.fn(() => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    let visible = false
    const { el } = fakeContainer()
    const dispose = attachBoard(el, { isActive: () => visible })

    // 挂载即拉一次（与面板可见性无关）
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 3 个 tick 全被门闩跳过

    visible = true
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)

    dispose()
  })

  it('poll:false → 不自建定时器（轮询交回 board-shell）', () => {
    const { el, added } = fakeContainer()
    const dispose = attachBoard(el, { poll: false })

    expect(added).toEqual(['click', 'change']) // 事件委派与 SSE 照常
    expect(vi.getTimerCount()).toBe(0)

    dispose()
  })
})

// REQ-260928222643-4d34 · serves: FR-2
describe('board-mount 消费一次性定位意图（REQ-260928222643-4d34 FR-2）', () => {
  /** 具备渲染所需最小 DOM 面的容器：innerHTML + 查询方法（node 环境无真实 DOM）。 */
  function richContainer(): HTMLElement {
    return {
      innerHTML: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    } as unknown as HTMLElement
  }

  const REQ_A = {
    id: 'REQ-a', title: '需求甲', description: 'd', category: 'feature', status: 'implementing',
    blocked: false, comments: [], version: 1, createdAt: 1000, updatedAt: 2000,
    sourceSessionId: 'session-x', createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [],
  }

  function stateWith(reqs: unknown[]): Response {
    return new Response(
      JSON.stringify({ success: true, data: { revision: 1, requirements: reqs, tasks: [], ready: {} } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  beforeEach(() => {
    vi.useRealTimers() // 覆盖外层 fake timers，配合 vi.waitFor 等待异步渲染
    clearBoardFocus()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })
  })

  it('TC-7 命中台账 → 挂载进入该需求详情；意图取走即清', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(stateWith([REQ_A]))))
    requestBoardFocus('REQ-a')
    const el = richContainer()
    const dispose = attachBoard(el, { poll: false })
    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-req="REQ-a"') })
    expect(peekBoardFocus()).toBeUndefined() // 消费即清
    dispose()
  })

  it('TC-8 陈旧 id → 不静默回看板，落「未找到」占位；再次挂载仍默认（非粘滞）', async () => {
    // REQ-261004195831-0f52 FR-2 契约变更：详情取不到时**不再**静默 `mode = board`
    // （旧行为让人以为「点了没反应/点错了」）。现在照样进详情，由 404 落「未找到」占位。
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      // 情求的这条需求在台账里不存在 → 详情端点 404 REQBOARD_NOT_FOUND
      if (/\/requirements\/[^/?]+$/.test(url)) {
        return Promise.resolve(new Response(
          JSON.stringify({ success: false, code: 'REQBOARD_NOT_FOUND', error: '未找到需求 REQ-gone' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ))
      }
      return Promise.resolve(stateWith([]))
    }))
    requestBoardFocus('REQ-gone')
    const el = richContainer()
    const dispose = attachBoard(el, { poll: false })
    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-state="missing"') })
    expect(el.innerHTML).toContain('data-detail-req="REQ-gone"')  // 仍在详情态
    expect(el.innerHTML).not.toContain('dsh-pm-lanes')            // 没有落回看板泳道
    expect(peekBoardFocus()).toBeUndefined()
    dispose()

    // 再次挂载（模拟再次进入看板）→ 意图已清，仍为默认视图（非粘滞）
    const el2 = richContainer()
    const dispose2 = attachBoard(el2, { poll: false })
    await vi.waitFor(() => { expect(el2.innerHTML.length).toBeGreaterThan(0) })
    expect(el2.innerHTML).not.toContain('data-detail-req')
    dispose2()
  })
})

// REQ-261004111917-f473 FR-2 · serves: FR-2（订阅通道：看板已在屏时也能被定位）
describe('board-mount 订阅定位通道（REQ-261004111917-f473 FR-2）', () => {
  /** 具备渲染所需最小 DOM 面的容器（与上文同款；node 环境无真实 DOM）。 */
  function richContainer(): HTMLElement {
    return {
      innerHTML: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    } as unknown as HTMLElement
  }

  const REQ_A = {
    id: 'REQ-a', title: '需求甲', description: 'd', category: 'feature', status: 'implementing',
    blocked: false, comments: [], version: 1, createdAt: 1000, updatedAt: 2000,
    sourceSessionId: 'session-x', createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [],
  }

  function stateWith(reqs: unknown[]): Response {
    return new Response(
      JSON.stringify({ success: true, data: { revision: 1, requirements: reqs, tasks: [], ready: {} } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  beforeEach(() => {
    vi.useRealTimers()
    clearBoardFocus()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })
  })

  it('TC-8b 已挂载（非重新挂载）时登记定位 → 当场切到该需求详情，且不留 pending', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(stateWith([REQ_A]))))
    const el = richContainer()
    const dispose = attachBoard(el, { poll: false })
    // 先等首屏渲染完成（此时是看板默认视图，不是详情）
    await vi.waitFor(() => { expect(el.innerHTML.length).toBeGreaterThan(0) })

    // 关键：挂载**之后**才登记定位——这正是旧一次性持有器覆盖不到的路径
    requestBoardFocus('REQ-a')
    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-req="REQ-a"') })
    expect(peekBoardFocus()).toBeUndefined() // 走订阅通道，不留 pending（防双跳）
    dispose()
  })

  it('TC-9b dispose 退订：之后登记回到一次性语义（意图留给下次挂载）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(stateWith([REQ_A]))))
    const el = richContainer()
    const dispose = attachBoard(el, { poll: false })
    await vi.waitFor(() => { expect(el.innerHTML.length).toBeGreaterThan(0) })
    dispose()

    requestBoardFocus('REQ-a')
    expect(peekBoardFocus()).toBe('REQ-a') // 订阅者已退订 → 不再被同步消费
    clearBoardFocus()
  })
})

// REQ-261004111917-f473 FR-2 · 复核 R2：不可见的看板实例不得「吃掉」定位意图
describe('board-mount 订阅通道的可见性门闩（复核 R2）', () => {
  function richContainer(): HTMLElement {
    return {
      innerHTML: '', addEventListener: () => {}, removeEventListener: () => {},
      querySelectorAll: () => [], querySelector: () => null,
    } as unknown as HTMLElement
  }
  const REQ_A = {
    id: 'REQ-a', title: '需求甲', description: 'd', category: 'feature', status: 'implementing',
    blocked: false, comments: [], version: 1, createdAt: 1000, updatedAt: 2000,
    sourceSessionId: 'session-x', createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  }

  beforeEach(() => {
    vi.useRealTimers()
    clearBoardFocus()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false, addEventListener: () => {}, removeEventListener: () => {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })
  })

  it('TC-8c isActive()=false（已挂载但不在屏）→ 不消费、不切详情，意图回落待下次挂载', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ success: true, data: { revision: 1, requirements: [REQ_A], tasks: [], ready: {} } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))))
    const el = richContainer()
    const dispose = attachBoard(el, { poll: false, isActive: () => false })
    await vi.waitFor(() => { expect(el.innerHTML.length).toBeGreaterThan(0) })

    requestBoardFocus('REQ-a')
    // 不切详情：隐藏实例不抢这次定位
    expect(el.innerHTML).not.toContain('data-detail-req')
    // 意图没被吃掉：留给下次挂载消费
    expect(peekBoardFocus()).toBe('REQ-a')
    dispose()
    clearBoardFocus()
  })
})

// REQ-261004210128-283d · serves: FR-5, FR-8
describe('运行态订阅与重绘门控（REQ-261004210128-283d FR-5/FR-8）', () => {
  /** 一个绑定在 s-a 上的需求：门控的「相关会话」就是它。 */
  const REQ_STATE = {
    revision: 1,
    requirements: [{
      id: 'REQ-000001', title: '需求', description: '', status: 'implementing',
      blocked: false, commentCount: 0, artifactCount: 0, version: 1,
      createdAt: 1, updatedAt: 1, sourceSessionId: 's-a',
    }],
    tasks: [], ready: {},
  }

  /** 计数容器：每次 innerHTML 赋值即 +1（重绘次数的唯一观测点）。 */
  function countingContainer(): { el: HTMLElement; renders: () => number } {
    let renders = 0
    let html = ''
    const el = {
      get innerHTML(): string { return html },
      set innerHTML(v: string) { html = v; renders += 1 },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    }
    return { el: el as unknown as HTMLElement, renders: () => renders }
  }

  /**
   * 假会话服务（挂在 window.__dshPmSessions，即 session-jump 的既有投影读法）。
   * 退订后旧监听器仍被本用例留了一份引用 —— TC-14 就是要证明「迟到的通知也不重绘」。
   */
  function installSessions(initial: Record<string, unknown>): {
    byId: { value: Record<string, unknown> }
    fire: () => void
    captured: Array<() => void>
  } {
    const byId = { value: initial }
    const listeners: Array<() => void> = []
    ;(globalThis as unknown as { __dshPmSessions: unknown }).__dshPmSessions = {
      list: {
        getSnapshot: () => ({ byId: byId.value }),
        subscribe: (fn: () => void): (() => void) => {
          listeners.push(fn)
          return () => {
            const i = listeners.indexOf(fn)
            if (i >= 0) listeners.splice(i, 1)
          }
        },
      },
    }
    return { byId, fire: () => { for (const fn of [...listeners]) fn() }, captured: listeners }
  }

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ success: true, data: REQ_STATE }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))))
  })

  afterEach(() => {
    delete (globalThis as unknown as { __dshPmSessions?: unknown }).__dshPmSessions
  })

  it('TC-12 无关会话的运行态抖动：不触发看板重绘', async () => {
    const sessions = installSessions({ 's-other': { running: false } })
    const { el, renders } = countingContainer()
    const dispose = attachBoard(el, { poll: false })
    await flush()
    const before = renders()
    expect(before).toBeGreaterThan(0) // 首屏确实渲染过

    sessions.byId.value = { 's-other': { running: true } }
    sessions.fire()
    await flush()

    expect(renders()).toBe(before) // 门控生效：别的窗口在跑，与本页需求无关
    dispose()
  })

  it('TC-13 相关会话开始跑：重绘一次，且渲染出运行中指示', async () => {
    const sessions = installSessions({ 's-a': { running: false } })
    const { el, renders } = countingContainer()
    const dispose = attachBoard(el, { poll: false })
    await flush()
    const before = renders()

    sessions.byId.value = { 's-a': { running: true } }
    sessions.fire()
    await flush()

    expect(renders()).toBe(before + 1)
    expect(el.innerHTML).toContain('data-running="true"')
    dispose()
  })

  it('TC-13b 相关会话跑完：指示消失（同样只重绘一次）', async () => {
    const sessions = installSessions({ 's-a': { running: true } })
    const { el, renders } = countingContainer()
    const dispose = attachBoard(el, { poll: false })
    await flush()
    expect(el.innerHTML).toContain('data-running="true"')
    const before = renders()

    sessions.byId.value = { 's-a': { running: false } }
    sessions.fire()
    await flush()

    expect(renders()).toBe(before + 1)
    expect(el.innerHTML).not.toContain('data-running')
    dispose()
  })

  it('TC-14 dispose 之后：退订生效，迟到的通知也不再重绘', async () => {
    const sessions = installSessions({ 's-a': { running: false } })
    const { el, renders } = countingContainer()
    const dispose = attachBoard(el, { poll: false })
    await flush()
    const late = [...sessions.captured] // 退订前的监听器引用（模拟迟到通知）
    const before = renders()

    dispose()
    sessions.byId.value = { 's-a': { running: true } }
    for (const fn of late) fn() // 直接调用旧回调 = 退订后才到达的通知
    sessions.fire()
    await flush()

    expect(renders()).toBe(before)
  })
})
