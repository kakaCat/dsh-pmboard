/**
 * 面板补丁（hydrate）单测（REQ-261001210304-0dfb · A3-1 / A3-2 / A3-3）。
 *
 * 钉住的性质：易变值**不在注入字符串里**，而是渲染后由补丁填进稳定钩子元素——
 *   ① 新鲜度：文本「数据时间 HH:MM:SS」/ `data-fetched-at` / `is-stale` 与阈值判据同口径；
 *   ② 相对时间：`data-dsh-pm-rel="<ts>"` 在固定 now 下产出「刚刚 / N 分钟前 / 日期」；
 *   ③ 页签：`hydrateNodePanel({ tab })` 让 is-active 与 pane 的 hidden 与记忆一致；
 *   ④ 幂等且**不换元素**（不插删 DOM）——这正是"刷新不再重建整段面板"的前提。
 *
 * serves: FR-2, FR-3, FR-5
 */
import { describe, it, expect } from 'vitest'
import { hydrateNodePanel } from '../src/client/panel-hydrate.js'
import { hydrateFreshness, clockText } from '../src/client/panel-freshness.js'
import { hydrateRelTimes, relSlot } from '../src/client/node-panel.js'

const T0 = 1693000000000

/** 极简元素桩：只实现补丁函数用到的那几个成员（textContent / classList.toggle / setAttribute / hidden）。 */
class FakeEl {
  attrs = new Map<string, string>()
  classes = new Set<string>()
  textContent = ''
  hidden = false
  constructor(public name: string, attrs: Record<string, string> = {}, classes: string[] = []) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v)
    for (const c of classes) this.classes.add(c)
  }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v) }
  getAttribute(k: string): string | null { return this.attrs.has(k) ? this.attrs.get(k)! : null }
  get classList(): { toggle: (c: string, force?: boolean) => void } {
    return {
      toggle: (c: string, force?: boolean): void => {
        const on = force === undefined ? !this.classes.has(c) : force
        if (on) this.classes.add(c)
        else this.classes.delete(c)
      },
    }
  }
}

/** 把一批元素当根节点用：按补丁函数真正使用的选择器做匹配。 */
function root(elements: FakeEl[]): ParentNode {
  const match = (el: FakeEl, sel: string): boolean => {
    if (sel === '[data-dsh-pm-fresh-slot]') return el.attrs.has('data-dsh-pm-fresh-slot')
    if (sel === '[data-dsh-pm-rel]') return el.attrs.has('data-dsh-pm-rel')
    if (sel === '.dsh-pm-np-tab[data-view]') return el.classes.has('dsh-pm-np-tab') && el.attrs.has('data-view')
    if (sel === '.dsh-pm-np-pane[data-pane]') return el.classes.has('dsh-pm-np-pane') && el.attrs.has('data-pane')
    return false
  }
  return {
    querySelector: (sel: string) => elements.find(el => match(el, sel)) ?? null,
    querySelectorAll: (sel: string) => elements.filter(el => match(el, sel)),
  } as unknown as ParentNode
}

describe('A3-1 新鲜度补丁：值进钩子元素，且不换元素', () => {
  it('新鲜数据：文本 / data-fetched-at / data-stale / title 全部就位，不带 is-stale', () => {
    const slot = new FakeEl('slot', { 'data-dsh-pm-fresh-slot': '' })
    const r = root([slot])
    hydrateFreshness(r, { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 1000 })

    expect(slot.textContent).toBe('数据时间 ' + clockText(T0))
    expect(slot.getAttribute('data-fetched-at')).toBe(String(T0))
    expect(slot.getAttribute('data-stale')).toBe('0')
    expect(slot.getAttribute('data-refresh-ms')).toBe('5000')
    expect(slot.getAttribute('title')).toBe('面板每 5 秒自动刷新')
    expect(slot.classes.has('is-stale')).toBe(false)
  })

  it('超过阈值 → is-stale + data-stale=1（与调度器同口径）', () => {
    const slot = new FakeEl('slot', { 'data-dsh-pm-fresh-slot': '' })
    hydrateFreshness(root([slot]), { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 31000 })
    expect(slot.classes.has('is-stale')).toBe(true)
    expect(slot.getAttribute('data-stale')).toBe('1')
  })

  it('从未成功过 → 「数据时间 —」且算陈旧', () => {
    const slot = new FakeEl('slot', { 'data-dsh-pm-fresh-slot': '' })
    hydrateFreshness(root([slot]), { intervalMs: 5000, staleAfterMs: 30000, now: T0 })
    expect(slot.textContent).toBe('数据时间 —')
    expect(slot.getAttribute('data-fetched-at')).toBe('')
    expect(slot.classes.has('is-stale')).toBe(true)
  })

  it('幂等且不换元素：连续补两次，元素身份与值都不变', () => {
    const slot = new FakeEl('slot', { 'data-dsh-pm-fresh-slot': '' })
    const r = root([slot])
    const before = slot
    hydrateFreshness(r, { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 1000 })
    hydrateFreshness(r, { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 1000 })
    expect(slot).toBe(before)
    expect(root([slot]).querySelectorAll('[data-dsh-pm-fresh-slot]').length).toBe(1)
    expect(slot.textContent).toBe('数据时间 ' + clockText(T0))
  })

  it('找不到钩子 → 静默返回（阶段没有这块是正常情况）', () => {
    expect(() => hydrateFreshness(root([]), { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000 })).not.toThrow()
  })
})

describe('A3-2 相对时间补丁：固定 now 下的三种人话', () => {
  it('刚刚 / 5 分钟前 / 日期', () => {
    const el = (at: number): FakeEl => new FakeEl('rel', { 'data-dsh-pm-rel': String(at) })
    const nowEl = el(T0 - 1000)
    const minEl = el(T0 - 5 * 60000)
    const dayEl = el(T0 - 3 * 86400000)
    hydrateRelTimes(root([nowEl, minEl, dayEl]), T0)

    expect(nowEl.textContent).toBe('刚刚')
    expect(minEl.textContent).toBe('5 分钟前')
    const d = new Date(T0 - 3 * 86400000)
    const pad = (n: number): string => String(n).padStart(2, '0')
    expect(dayEl.textContent).toBe(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()))
  })

  it('relSlot 只放稳定时间戳（人话留给补丁）', () => {
    expect(relSlot(T0)).toBe('<span data-dsh-pm-rel="' + T0 + '"></span>')
  })

  it('非法属性值不抛、不写文本', () => {
    const bad = new FakeEl('rel', { 'data-dsh-pm-rel': 'abc' })
    expect(() => hydrateRelTimes(root([bad]), T0)).not.toThrow()
    expect(bad.textContent).toBe('')
  })
})

describe('A3-3 页签补丁：刷新后仍停在记忆里的那一页', () => {
  it('tab=list → 泳道页签 is-active、泳道 pane 无 hidden、DAG pane 有 hidden', () => {
    const tabFlow = new FakeEl('tab', { 'data-view': 'flow' }, ['dsh-pm-np-tab', 'is-active'])
    const tabList = new FakeEl('tab', { 'data-view': 'list' }, ['dsh-pm-np-tab'])
    const paneFlow = new FakeEl('pane', { 'data-pane': 'flow' }, ['dsh-pm-np-pane'])
    const paneList = new FakeEl('pane', { 'data-pane': 'list' }, ['dsh-pm-np-pane'])
    paneList.hidden = true // 注入模板的缺省态

    hydrateNodePanel(root([tabFlow, tabList, paneFlow, paneList]), { tab: 'list' })

    expect(tabList.classes.has('is-active')).toBe(true)
    expect(tabFlow.classes.has('is-active')).toBe(false)
    expect(paneList.hidden).toBe(false)
    expect(paneFlow.hidden).toBe(true)
  })

  it('不传 tab → 页签保持模板缺省（不擅自动 DOM）', () => {
    const tabFlow = new FakeEl('tab', { 'data-view': 'flow' }, ['dsh-pm-np-tab', 'is-active'])
    const tabList = new FakeEl('tab', { 'data-view': 'list' }, ['dsh-pm-np-tab'])
    hydrateNodePanel(root([tabFlow, tabList]), { freshness: { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000 } })
    expect(tabFlow.classes.has('is-active')).toBe(true)
    expect(tabList.classes.has('is-active')).toBe(false)
  })
})
