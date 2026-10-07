// serves: FR-4, FR-5
/**
 * 面板契约用例（REQ-261007133149-0716 t5 · IF-1/IF-2/IF-3/IF-4）。
 *
 * 类型钉不住、或类型红了也没人看得见的那几条，落在这里：
 *   ① **键唯一**：七个 Tab 各一份；
 *   ② **顺序即展示顺序**：注册表顺序 = Tab 栏渲染顺序 = 原型 #FR-4 的次序；
 *   ③ **七个面板都实现全接口**：key / label / badge / render（degraded 可选）；
 *   ④ **未知键不静默回落**：`isReportTabKey` 拦住脏值（缺了它，脏键会顺着回落**静默**变成 trunk）；
 *   ⑤ **端点名与 Tab 键同源**：切到某个 Tab 取的就是 `/…/<key>`（Tab 键 = 端点名，单点推导）。
 *
 * 本文件同时是 design/test-cases.md 里 **R-3 / R-4 / R-5** 三条反向验证的落点：
 *   · R-3（漏实现一个成员必须编译失败）用 `@ts-expect-error` 钉住——契约一旦松掉，这行会
 *     变成「多余的 expect-error」，`pnpm typecheck` 立刻红；
 *   · R-4（注册表里重复一个键）/ R-5（交换两项顺序）用**体检函数 + 篡改样本**自检：
 *     真注册表必须 0 问题，篡改样本必须被点出来（门禁不许是恒绿的装饰品）。
 *
 * @module dsh-pmboard/tests/report-contract
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  REPORT_TABS, REPORT_TAB_KEYS, buildTabBar, isReportTabKey,
  type Panel, type PanelShape,
} from '../src/client/views/report-tabs.ts'
import { fetchReportPanel } from '../src/client/api.ts'

/** 展示顺序的**期望值**（权威原型 `REQ-261006130057-7a43/prototypes/detail.html` v1.5 的 #FR-4）。 */
const EXPECTED_ORDER = ['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'] as const

const REQ_ID = 'REQ-261007133149-0716'

/** 契约体检 · 键唯一（R-4 的判据本体）。 */
function keyProblems(tabs: readonly { key: string }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tabs) {
    if (seen.has(t.key)) out.push(`键重复：${t.key}`)
    seen.add(t.key)
  }
  return out
}

/** 契约体检 · 顺序（R-5 的判据本体）。 */
function orderProblems(keys: readonly string[], expected: readonly string[]): string[] {
  const same = keys.length === expected.length && keys.every((k, i) => k === expected[i])
  return same ? [] : [`顺序漂移：实测 [${keys.join(',')}] ≠ 期望 [${expected.join(',')}]`]
}

/** 契约体检 · 成员齐不齐（运行时那一半；编译期那一半见 R-3）。 */
function memberProblems(tabs: readonly Partial<Record<'key' | 'label' | 'badge' | 'render', unknown>>[]): string[] {
  const out: string[] = []
  for (const t of tabs) {
    const who = typeof t.key === 'string' && t.key.length > 0 ? t.key : '(缺 key)'
    if (who === '(缺 key)') out.push('缺 key')
    if (typeof t.label !== 'string' || t.label.length === 0) out.push(`${who} 缺 label`)
    if (typeof t.badge !== 'function') out.push(`${who} 缺 badge`)
    if (typeof t.render !== 'function') out.push(`${who} 缺 render`)
  }
  return out
}

describe('面板契约（IF-1 / IF-2 / IF-3）', () => {
  it('键唯一：七个 Tab 各一份（R-4 判据）', () => {
    expect(keyProblems(REPORT_TABS)).toEqual([])
    expect(REPORT_TAB_KEYS.length).toBe(7)
    expect(new Set(REPORT_TAB_KEYS).size).toBe(7)
  })

  it('顺序即展示顺序：与原型 #FR-4 同序（R-5 判据）', () => {
    expect(orderProblems(REPORT_TAB_KEYS, EXPECTED_ORDER)).toEqual([])
    // 渲染顺序 = 注册表顺序（不是「另有一份渲染次序」）
    const html = buildTabBar(undefined, 'trunk')
    const rendered = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1])
    expect(rendered).toEqual([...EXPECTED_ORDER])
  })

  it('七个面板都实现全接口（key / label / badge / render）', () => {
    expect(memberProblems(REPORT_TABS)).toEqual([])
    for (const def of REPORT_TABS as readonly Panel[]) {
      expect(typeof def.key).toBe('string')
      expect(def.label.length).toBeGreaterThan(0)
      expect(typeof def.badge).toBe('function')
      expect(typeof def.render).toBe('function')
    }
  })

  it('未知键不静默回落：守卫拦住脏值（含大小写与空串）', () => {
    for (const k of REPORT_TAB_KEYS) expect(isReportTabKey(k)).toBe(true)
    for (const bad of ['nope', '', 'Trunk', 'verif', 'trunk ', 0, null, undefined, {}, []]) {
      expect(isReportTabKey(bad)).toBe(false)
    }
  })
})

describe('契约体检自身要有反向验证（R-3 / R-4 / R-5 不许是恒绿装饰）', () => {
  it('R-4：注册表里重复一个键 → 体检必须点出来', () => {
    const mutated = [...(REPORT_TABS as readonly Panel[]), REPORT_TABS[0]!]
    expect(keyProblems(mutated)).toContain('键重复：trunk')
  })

  it('R-5：交换两项顺序 → 体检必须点出来', () => {
    const swapped = [...EXPECTED_ORDER]
    ;[swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!]
    const problems = orderProblems(swapped, EXPECTED_ORDER)
    expect(problems.length).toBe(1)
    expect(problems[0]).toContain('顺序漂移')
    expect(problems[0]).toContain('docs')
  })

  it('R-3：漏实现一个契约成员必须**编译**失败（这行是判据本体）', () => {
    // 故意漏 `badge`：下面这行必须报错。契约一松，@ts-expect-error 变成「多余的 expect-error」→
    // `pnpm typecheck` 红 —— 这就是 R-3 的自动化自检（不需要临时改文件再跑一遍）。
    // @ts-expect-error R-3：漏 badge 的注册项不满足面板契约
    const missingBadge: PanelShape = { key: 'trunk', label: '缺 badge', render: () => '' }
    expect(missingBadge.label).toBe('缺 badge')
  })
})

describe('端点名与 Tab 键同源（IF-4）', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('切到某个 Tab 取的就是 /…/<key>：端点名不再有第二份手写清单', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      calls.push(String(input))
      // 宿主信封：`{ success: true, data }`（api 的 unwrap 认这个形状）
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: { revision: 1 } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
    }))
    for (const key of REPORT_TAB_KEYS) await fetchReportPanel(REQ_ID, key)
    expect(calls.length).toBe(REPORT_TAB_KEYS.length)
    for (const [i, key] of REPORT_TAB_KEYS.entries()) {
      expect(calls[i]!.endsWith('/' + key)).toBe(true)
    }
  })
})
