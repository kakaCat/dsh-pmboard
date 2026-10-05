/**
 * 泳道滚动位置记忆单测（REQ-261004184822-9881 · TC-1 / TC-2 / TC-3 / TC-4）
 *
 * serves: FR-1, FR-2
 *
 * 环境：vitest 默认 node（本包不含 jsdom）——用最小 DOM 桩（duck-typed querySelector / 可写
 * scrollLeft）覆盖真实读点，不引入新依赖（与 tests/board-attach.test.ts 同款桩法）。
 * TC-5（attachBoard 接线）与 TC-6（列高样式静态断言）都在本文件末尾。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  captureBoardScroll,
  restoreBoardScroll,
  readBoardScroll,
  _resetBoardScroll,
  MAX_LANES,
} from '../src/client/board-scroll.ts'
import { readDagViewState, writeDagViewState, _resetDagViewState } from '../src/client/dag/view-state.ts'
import { attachBoard } from '../src/client/board-mount.ts'

/** 列内卡片区桩：只有一个可读写的 scrollTop。 */
interface FakeCards { scrollTop: number }

/** 一列桩：认 data-lane 属性与列内卡片区选择器。 */
function fakeLane(key: string, cards: FakeCards): unknown {
  return {
    getAttribute: (name: string): string | null => (name === 'data-lane' ? key : null),
    querySelector: (sel: string): unknown => (sel === '.dsh-pm-lane-cards' ? cards : null),
  }
}

/** 泳道容器桩：scrollLeft 可读写；给 clamp 即模拟"新布局可滚动范围变小"。 */
function fakeLanes(scrollLeft: number, clamp?: number): Record<string, unknown> {
  let v = scrollLeft
  const node: Record<string, unknown> = {}
  Object.defineProperty(node, 'scrollLeft', {
    get: () => v,
    set: (next: number) => { v = clamp !== undefined && next > clamp ? clamp : next },
  })
  node.querySelector = (): unknown => null
  return node
}

/** 容器桩：只认 board-scroll 真正用到的两个查询。 */
function fakeRoot(lanesNode: unknown, laneEls: readonly unknown[]): ParentNode {
  return {
    querySelector: (sel: string): unknown => (sel === '.dsh-pm-lanes' ? lanesNode : null),
    querySelectorAll: (sel: string): unknown[] =>
      (sel === '.dsh-pm-lane[data-lane]' ? [...laneEls] : []),
  } as unknown as ParentNode
}

/** 「没有泳道」的容器桩（列表视图 / 需求详情 / 空态 / 出错页）。 */
const NO_LANES_ROOT = {
  querySelector: (): unknown => null,
  querySelectorAll: (): unknown[] => [],
} as unknown as ParentNode

beforeEach(() => {
  _resetBoardScroll()
  _resetDagViewState()
})

describe('TC-1 横向位置往返', () => {
  it('capture 后用 restore 把横滚位置原样写回', () => {
    const lanes = fakeLanes(260)
    const root = fakeRoot(lanes, [])
    captureBoardScroll(root)

    lanes.scrollLeft = 0 // 模拟重绘：新 DOM 从最左开始
    restoreBoardScroll(root)

    expect(lanes.scrollLeft).toBe(260)
    expect(readBoardScroll()?.scrollLeft).toBe(260)
  })

  it('新布局可滚动范围变小时收敛到新上限，不报错也不回到 0', () => {
    captureBoardScroll(fakeRoot(fakeLanes(900), []))
    const narrow = fakeLanes(0, 500) // 数据变化后最多只能滚 500
    restoreBoardScroll(fakeRoot(narrow, []))
    expect(narrow.scrollLeft).toBe(500)
  })

  it('非法值（NaN）按 0 处理', () => {
    const lanes = fakeLanes(Number.NaN)
    captureBoardScroll(fakeRoot(lanes, []))
    expect(readBoardScroll()?.scrollLeft).toBe(0)
  })
})

describe('TC-2 列内纵向位置按 data-lane 隔离', () => {
  it('A 列的 180 不会串到 B 列，B 列保持 0', () => {
    const a = { scrollTop: 180 }
    const b = { scrollTop: 0 }
    const root = fakeRoot(fakeLanes(0), [fakeLane('implementing', a), fakeLane('design', b)])
    captureBoardScroll(root)

    a.scrollTop = 0 // 重绘：两列都从顶部开始
    b.scrollTop = 0
    restoreBoardScroll(root)

    expect(a.scrollTop).toBe(180)
    expect(b.scrollTop).toBe(0)
    expect(readBoardScroll()?.lanes).toEqual({ implementing: 180, design: 0 })
  })

  it('列键有上限（不会随浏览时长无界增长）', () => {
    const lanes = Array.from({ length: MAX_LANES + 4 }, (_, i) => fakeLane('lane-' + i, { scrollTop: i + 1 }))
    captureBoardScroll(fakeRoot(fakeLanes(0), lanes))
    expect(Object.keys(readBoardScroll()?.lanes ?? {}).length).toBe(MAX_LANES)
  })
})

describe('TC-3 无泳道容器时不覆盖记忆', () => {
  it('列表视图 / 详情页的重绘不会把已记住的位置冲成 0', () => {
    const lanes = fakeLanes(260)
    captureBoardScroll(fakeRoot(lanes, []))
    expect(readBoardScroll()?.scrollLeft).toBe(260)

    captureBoardScroll(NO_LANES_ROOT) // 列表视图 / 需求详情：无泳道容器
    expect(readBoardScroll()?.scrollLeft).toBe(260) // 没被写零

    const back = fakeLanes(0)
    restoreBoardScroll(fakeRoot(back, []))
    expect(back.scrollLeft).toBe(260)
  })

  it('没有记忆 / 没有容器时 restore 都不抛错、无副作用', () => {
    _resetBoardScroll()
    expect(() => restoreBoardScroll(NO_LANES_ROOT)).not.toThrow()
    expect(() => restoreBoardScroll(undefined)).not.toThrow()
    expect(() => captureBoardScroll(undefined)).not.toThrow()
    expect(readBoardScroll()).toBeUndefined()
  })
})

describe('TC-4 与 DAG 记忆隔离 + 不落盘', () => {
  it('两套记忆互不影响', () => {
    captureBoardScroll(fakeRoot(fakeLanes(260), []))
    expect(readDagViewState('dag-canvas::REQ-1')).toBeUndefined()

    writeDagViewState('dag-canvas::REQ-1', { dir: 'horizontal', scrollLeft: 42 })
    expect(readBoardScroll()?.scrollLeft).toBe(260) // 泳道记忆未被 DAG 写覆盖
    expect(readDagViewState('dag-canvas::REQ-1')?.scrollLeft).toBe(42)
  })

  it('源码里不出现浏览器存储（位置只在内存）', () => {
    const src = readFileSync(new URL('../src/client/board-scroll.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})

/* ------------------------------------------------------------------ TC-5 接线 */

/** 空看板状态（泳道列照常渲染，只是每列都写「暂无需求」）。 */
const EMPTY_STATE = { revision: 1, requirements: [], tasks: [], ready: {} }

/** fetch 桩：恒返回空看板状态。 */
function okResponse(): Promise<Response> {
  return Promise.resolve(new Response(
    JSON.stringify({ success: true, data: EMPTY_STATE }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
}

/** EventSource 桩（只看能否被创建与关闭）。 */
class FakeEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null
  constructor(readonly url: string) { /* 记录 URL 即可 */ }
  close(): void { /* 无需断言 */ }
}

/** 冲刷微任务：让 fetchAll 的 promise 链跑到 render 完成。 */
async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/**
 * 看板容器桩：**innerHTML 赋值会按真实 DOM 的行为重建泳道**——
 * 有 `.dsh-pm-lanes` 的新 HTML 就给出一个 scrollLeft 归零的新容器，列表视图则给 null。
 * 没有这一条，测出来的「位置保持」就只是桩没动过，等于没测。
 */
function scrollContainer(): {
  container: HTMLElement
  fire: (action: string, view?: string) => void
  lanesNow: () => Record<string, unknown> | null
} {
  const handlers: Record<string, (ev: unknown) => void> = {}
  let lanes: Record<string, unknown> | null = null
  let html = ''
  const container: Record<string, unknown> = {}
  Object.defineProperty(container, 'innerHTML', {
    get: () => html,
    set: (next: string) => {
      html = next
      lanes = next.includes('dsh-pm-lanes') ? fakeLanes(0) : null
    },
  })
  container.addEventListener = (type: string, fn: (ev: unknown) => void): void => { handlers[type] = fn }
  container.removeEventListener = (): void => { /* 无需断言 */ }
  container.querySelector = (sel: string): unknown => (sel === '.dsh-pm-lanes' ? lanes : null)
  container.querySelectorAll = (sel: string): unknown[] => (sel === '.dsh-pm-lane[data-lane]' ? [] : [])
  return {
    container: container as unknown as HTMLElement,
    fire: (action, view) => {
      const el = { dataset: { action, ...(view !== undefined ? { view } : {}) } }
      handlers['click']?.({ target: { closest: (sel: string) => (sel === '[data-action]' ? el : null) } })
    },
    lanesNow: () => lanes,
  }
}

describe('TC-5 重绘接线（attachBoard → fetchAll → render）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => okResponse()))
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('首拉渲染后记住的位置，在轮询重绘后仍被回填（FR-1）', async () => {
    const { container, lanesNow } = scrollContainer()
    const dispose = attachBoard(container)
    await flushMicrotasks()
    expect(lanesNow()).not.toBeNull() // 首拉已渲染出泳道

    lanesNow()!.scrollLeft = 260 // 用户横滚到 implementing 列
    await vi.advanceTimersByTimeAsync(20_000) // 一次轮询 → 重绘
    await flushMicrotasks()

    expect(lanesNow()).not.toBeNull()
    expect(lanesNow()!.scrollLeft).toBe(260) // 没有被弹回最左
    dispose()
  })

  it('切到列表再切回泳道，位置仍在（FR-3）', async () => {
    const { container, fire, lanesNow } = scrollContainer()
    const dispose = attachBoard(container)
    await flushMicrotasks()
    lanesNow()!.scrollLeft = 260

    fire('switch-view', 'list') // 列表视图：DOM 里没有泳道容器
    await flushMicrotasks()
    expect(lanesNow()).toBeNull()
    expect(readBoardScroll()?.scrollLeft).toBe(260) // 记忆没被列表视图冲成 0

    fire('switch-view', 'lanes')
    await flushMicrotasks()
    expect(lanesNow()!.scrollLeft).toBe(260)
    dispose()
  })
})

/* ------------------------------------------------------------------ TC-6 列高铺满 */

/** 取某条规则的 CSS 源码块（样式的单一来源在 base.ts，防它被悄悄改回魔术值）。 */
function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf('\n' + selector + ' {')
  expect(start, '规则块 ' + selector + ' 不在样式表里').toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('TC-6 列高不再依赖视口魔术值（FR-4）', () => {
  const css = readFileSync(new URL('../src/client/styles/base.ts', import.meta.url), 'utf8')

  it('泳道行拉伸到列（align-items: stretch，且可收缩）', () => {
    const block = ruleBlock(css, '.dsh-pm-lanes')
    expect(block).toContain('align-items: stretch')
    expect(block).not.toContain('align-items: flex-start')
    expect(block).toContain('min-height: 0')
  })

  it('列不再写死 max-height: calc(100vh - 200px)，改为可收缩', () => {
    const block = ruleBlock(css, '.dsh-pm-lane')
    expect(block).not.toContain('max-height: calc(100vh')
    expect(block).toContain('min-height: 0')
  })

  it('列内卡片区仍能自己滚（列头固定、列内滚动能力没丢）', () => {
    const block = ruleBlock(css, '.dsh-pm-lane-cards')
    expect(block).toContain('overflow-y: auto')
    expect(block).toContain('min-height: 0')
  })

  it('整个样式表里不再有 100vh 减常数的泳道列高（注释里的历史写法不算）', () => {
    const rulesOnly = css.replace(/\/\*[\s\S]*?\*\//g, '') // 注释不是规则
    expect(rulesOnly).not.toContain('max-height: calc(100vh')
  })
})
