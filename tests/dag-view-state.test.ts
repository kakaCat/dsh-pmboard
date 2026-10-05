/**
 * DAG 视图状态记忆表单测（REQ-261001210304-0dfb · A1-1 / A1-2 / A1-3 / A5）。
 *
 * 钉住的性质（缺一条缺陷就会回来）：
 *   ① 合并写：只覆盖显式传入的字段（页签点击不能把方向冲掉）；
 *   ② 读返回**拷贝**：调用方改返回值不得改动表内值；
 *   ③ 滚动值收敛：非有限数 / 负数一律记 0；
 *   ④ 容量 16 FIFO：读取命中会刷新插入序，被淘汰的只能是"最久没被读写的那条"；
 *   ⑤ 键含需求 id：A 需求的选择**不得**串到 B 需求（FR-4 的 A5 判据）；
 *   ⑥ **重建不归零**（A1-2/A1-3）：同一画布二次挂载时按记忆回填方向/开关/钉住，
 *      工具条 is-on 与真实状态对齐、滚动位置还原——这正是"每 5 秒刷新即回初始态"的回归锚点。
 *
 * serves: FR-1, FR-2, FR-4, FR-5
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readDagViewState,
  writeDagViewState,
  clearDagViewState,
  clearDagViewStateByPrefix,
  dagViewStateSize,
  _resetDagViewState,
  MAX_ENTRIES,
} from '../src/client/dag/view-state.js'
import { mountDagCanvas, PANEL_DAG_CANVAS_ID, type DagTaskLike } from '../src/client/views/dag-view.js'

const KEY_A = 'np-dag-canvas::REQ-A'
const KEY_B = 'np-dag-canvas::REQ-B'

beforeEach(() => { _resetDagViewState() })

describe('A1-1 记忆表语义', () => {
  it('合并写：只覆盖显式传入的字段（页签写不能冲掉方向/开关）', () => {
    writeDagViewState(KEY_A, { dir: 'horizontal', crit: true, focus: true, pinned: 't-b' })
    writeDagViewState(KEY_A, { tab: 'list' })
    expect(readDagViewState(KEY_A)).toEqual({ dir: 'horizontal', crit: true, focus: true, pinned: 't-b', tab: 'list' })
  })

  it('读返回拷贝：改返回值不影响表内值', () => {
    writeDagViewState(KEY_A, { dir: 'horizontal' })
    const got = readDagViewState(KEY_A)!
    got.dir = 'vertical'
    got.scrollTop = 999
    expect(readDagViewState(KEY_A)).toEqual({ dir: 'horizontal' })
  })

  it('未写过的键 → undefined（= 初始态，不是空快照）', () => {
    expect(readDagViewState('nobody::REQ-X')).toBeUndefined()
  })

  it('pinned: null 是合法值（显式无钉住），照写', () => {
    writeDagViewState(KEY_A, { pinned: 't-b' })
    writeDagViewState(KEY_A, { pinned: null })
    expect(readDagViewState(KEY_A)!.pinned).toBeNull()
  })

  it('滚动值收敛：非有限数 / 负数一律记 0；undefined 不更新', () => {
    writeDagViewState(KEY_A, { scrollTop: 120, scrollLeft: 8 })
    writeDagViewState(KEY_A, { scrollTop: Number.NaN, scrollLeft: -30 })
    expect(readDagViewState(KEY_A)).toEqual({ scrollTop: 0, scrollLeft: 0 })

    writeDagViewState(KEY_A, { dir: 'horizontal' })
    expect(readDagViewState(KEY_A)!.scrollTop).toBe(0) // undefined 不参与更新，旧值保留
  })

  it('容量 16 FIFO：超出的最旧一条被淘汰；读取命中会刷新插入序', () => {
    for (let i = 0; i < MAX_ENTRIES; i++) writeDagViewState('k' + i, { dir: 'horizontal' })
    expect(dagViewStateSize()).toBe(MAX_ENTRIES)

    readDagViewState('k0')            // 命中 → k0 成为"最新"
    writeDagViewState('k-new', { dir: 'vertical' })
    expect(dagViewStateSize()).toBe(MAX_ENTRIES)
    expect(readDagViewState('k0')).toBeDefined()   // 刚读过 → 未被淘汰
    expect(readDagViewState('k1')).toBeUndefined() // 最旧 → 被淘汰
  })

  it('clear：删一条；clearByPrefix：按画布前缀清', () => {
    writeDagViewState(KEY_A, { dir: 'horizontal' })
    writeDagViewState(KEY_B, { dir: 'horizontal' })
    writeDagViewState('dag-canvas::REQ-A', { dir: 'horizontal' })

    clearDagViewState(KEY_A)
    expect(readDagViewState(KEY_A)).toBeUndefined()
    expect(readDagViewState(KEY_B)).toBeDefined()

    clearDagViewStateByPrefix('np-dag-canvas::')
    expect(readDagViewState(KEY_B)).toBeUndefined()
    expect(readDagViewState('dag-canvas::REQ-A')).toBeDefined() // 另一块画布不受影响
  })
})

describe('A5 键隔离：切换需求不串档', () => {
  it('A 需求写横向 + 只看主线 → 读 B 需求为 undefined（= 初始态）', () => {
    writeDagViewState(KEY_A, { dir: 'horizontal', focus: true })
    expect(readDagViewState(KEY_B)).toBeUndefined()
  })

  it('同一画布不同需求各自独立（互不覆盖）', () => {
    writeDagViewState(KEY_A, { dir: 'horizontal', focus: true })
    writeDagViewState(KEY_B, { dir: 'vertical', crit: true })
    expect(readDagViewState(KEY_A)).toEqual({ dir: 'horizontal', focus: true })
    expect(readDagViewState(KEY_B)).toEqual({ dir: 'vertical', crit: true })
  })
})

// ---------------------------------------------------------------------------
// A1-2 / A1-3：挂载接缝按记忆回填（Node 环境用极简 DOM 桩，与 tests/dag-view.test.ts 同款）
// ---------------------------------------------------------------------------

const TASKS: DagTaskLike[] = [
  { id: 't-a', title: '卡 A', status: 'done', phase: 'implement', side: 'backend', dependsOn: [] },
  { id: 't-b', title: '卡 B', status: 'in_progress', phase: 'implement', side: 'backend', dependsOn: ['t-a'] },
]

interface BtnStub { dataset: Record<string, string>; on: Set<string> }
interface MountDom {
  buttons: BtnStub[]
  wrap: { scrollTop: number; scrollLeft: number; clientWidth: number }
  panel: Record<string, unknown>
  /** 某按钮当前是否带 is-on（读工具条与真实状态是否对齐）。 */
  isOn: (attr: 'dagDir' | 'dagToggle', value: string) => boolean
}

/** 极简全局 document + 画布桩：挂载路径够用，并让 querySelector/querySelectorAll 返回真按钮。 */
function withMountDom(fn: (dom: MountDom) => void, canvasId: string = PANEL_DAG_CANVAS_ID): void {
  const g = globalThis as unknown as { document?: unknown }
  const prev = g.document
  const buttons: BtnStub[] = [
    { dataset: { dagDir: 'vertical' }, on: new Set(['is-on']) }, // 模板缺省态：纵向 is-on
    { dataset: { dagDir: 'horizontal' }, on: new Set() },
    { dataset: { dagToggle: 'crit' }, on: new Set() },
    { dataset: { dagToggle: 'focus' }, on: new Set() },
  ]
  const asEl = (b: BtnStub): Record<string, unknown> => ({
    dataset: b.dataset,
    classList: { toggle: (cls: string, force?: boolean) => { if (force === true) b.on.add(cls); else if (force === false) b.on.delete(cls) } },
  })
  const wrap = { scrollTop: 0, scrollLeft: 0, clientWidth: 690 }
  const panel: Record<string, unknown> = {
    addEventListener: () => { /* 不入断言 */ },
    removeEventListener: () => { /* 不入断言 */ },
    contains: () => true,
    querySelector: (sel: string) => (sel === '[data-dag-wrap]' ? wrap : null),
    querySelectorAll: (sel: string) => {
      if (sel === '[data-dag-dir]') return buttons.filter(b => b.dataset.dagDir !== undefined).map(asEl)
      if (sel === '[data-dag-toggle]') return buttons.filter(b => b.dataset.dagToggle !== undefined).map(asEl)
      return []
    },
  }
  const canvas: Record<string, unknown> = {
    width: 0, height: 0, style: {},
    parentElement: { clientWidth: 690, appendChild: () => {} },
    getContext: () => null, // 绘制不参与断言：ctx 为空时 paint 仍会走完布局/尺寸分支
    closest: () => panel,
    addEventListener: () => { /* 不入断言 */ },
    removeEventListener: () => { /* 不入断言 */ },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }
  g.document = {
    getElementById: (id: string) => (id === canvasId ? canvas : null),
    createElement: () => ({ dataset: {}, appendChild: () => {}, click: () => {}, remove: () => {} }),
  }
  try {
    fn({
      buttons, wrap, panel,
      isOn: (attr, value) => {
        const b = buttons.find(x => x.dataset[attr] === value)
        return b !== undefined && b.on.has('is-on')
      },
    })
  } finally {
    if (prev === undefined) delete g.document
    else g.document = prev
  }
}

describe('A1-2/A1-3 二次挂载按记忆回填（重构前必红：回 vertical/false/false/null）', () => {
  it('A1-2：一轮刷新后方向/开关/钉住保持，滚动位置还原', () => {
    withMountDom((dom) => {
      const key = PANEL_DAG_CANVAS_ID + '::REQ-X'
      const v1 = mountDagCanvas(TASKS, undefined, PANEL_DAG_CANVAS_ID, { stateKey: key })
      expect(v1).toBeDefined()
      v1!.patch({ dir: 'horizontal', crit: true, focus: true, pinned: 't-b' })
      dom.wrap.scrollTop = 180
      dom.wrap.scrollLeft = 12

      // 「下一次轮询」做的事：同一 canvas 再挂一次（dispose 先写回，然后按记忆起画）
      const v2 = mountDagCanvas(TASKS, undefined, PANEL_DAG_CANVAS_ID, { stateKey: key })
      expect(v2!.state()).toEqual({ dir: 'horizontal', crit: true, focus: true, pinned: 't-b' })
      expect(dom.wrap.scrollTop).toBe(180)
      expect(dom.wrap.scrollLeft).toBe(12)
    })
  })

  it('A1-3：工具条 is-on 与真实状态对齐（不再恒显示「纵向」）', () => {
    withMountDom((dom) => {
      const key = PANEL_DAG_CANVAS_ID + '::REQ-Y'
      const v1 = mountDagCanvas(TASKS, undefined, PANEL_DAG_CANVAS_ID, { stateKey: key })
      v1!.patch({ dir: 'horizontal', crit: true, focus: false, pinned: null })
      mountDagCanvas(TASKS, undefined, PANEL_DAG_CANVAS_ID, { stateKey: key })

      expect(dom.isOn('dagDir', 'horizontal')).toBe(true)
      expect(dom.isOn('dagDir', 'vertical')).toBe(false)
      expect(dom.isOn('dagToggle', 'crit')).toBe(true)
      expect(dom.isOn('dagToggle', 'focus')).toBe(false)
    })
  })

  it('不传 opts：起画仍是缺省态，且不写记忆表（兼容承诺）', () => {
    // 独立 canvasId：本用例只关心"不传 opts 不写表"，用别的画布避免被前序用例留下的 disposer 干扰
    withMountDom((dom) => {
      const v = mountDagCanvas(TASKS, undefined, 'compat-canvas')
      expect(v!.state()).toEqual({ dir: 'vertical', crit: false, focus: false, pinned: null })
      expect(dom.isOn('dagDir', 'vertical')).toBe(true)   // 工具条仍是模板缺省态
      expect(dagViewStateSize()).toBe(0)                  // 未启用记忆 → 一个键都不写
    }, 'compat-canvas')
  })
})
