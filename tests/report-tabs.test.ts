// serves: FR-4, FR-8
/**
 * 「验收」Tab 壳注册 + Tab 栏/进度带收敛（REQ-261006130057-7a43 · 壳卡 t2）。
 *
 * 与 `tests/report-shell.test.ts`（壳的既有六条验收）分工：那边钉壳的通用机制，
 * 这边钉**本卡新增的那一枚 Tab 与 FR-4 样式收敛**——判据全部落在产物字符串与
 * 注入桩的请求计数上：
 *   ① 七枚 Tab、次序 dialogue < verify < token（原型 proto-geometry verifyTabIndex1Based=5）；
 *   ② verify 图标走 `TAB_ICON_SVG` 内联 SVG（盾形对勾），emoji ✅ 只进 data-proto-icon-before；
 *   ③ 未激活面板不在 DOM；激活 verify 时加载占位为「验收加载中…」；
 *   ④ 取数接线：切到才取、缓存键 `reqId::verify::revision`、三态；端点 404 → degraded
 *     「服务端版本过旧，验收单暂在『文档』Tab 核验节查看」（不是失败态、不给重试假象）；
 *   ⑤ 角标 = 服务端待裁决计数 `tabCounts.verify`（'0' 不渲染，缺省不渲染）；
 *   ⑥ FR-4 样式块在 REPORT_CSS 就位（带标记块注释、13px 图标令牌、mono 10.5px 徽章、
 *     2px 指示条、10.5px 进度带标签、900 窄档横滚不换行）。
 *
 * 环境：vitest node（本包**不含 jsdom**）——字符串断言 + 注入桩 + 最小 fetch 桩。
 *
 * @module dsh-pmboard/tests/report-tabs
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Degrade, ReportResponse } from '../src/shared/protocol.ts'
import {
  REPORT_TABS, REPORT_TAB_KEYS, buildReportShell, buildTabBar, createReportShell,
} from '../src/client/views/report-tabs.ts'
import { TAB_ICON_SVG } from '../src/client/icons.ts'
import { verifyPanel, VERIFY_OLD_SERVER_TEXT } from '../src/client/views/panels/verify.ts'
import { fetchReportPanel, fetchReportVerify } from '../src/client/api.ts'
import { REPORT_CSS } from '../src/client/styles/report.ts'

const REQ_ID = 'REQ-261006130057-7a43'
const T0 = 1_700_000_000_000

/** 最小在途标本（实施中；字段与 report-shell.test.ts 的标本同口径，只填本文件读到的）。 */
function makeReport(): ReportResponse {
  return {
    head: {
      id: REQ_ID,
      title: '详情页 FR-4/FR-8 壳卡',
      category: 'feature',
      promptDifficulty: 'standard',
      status: 'implementing',
      blocked: false,
      createdAt: T0 - 86_400_000,
      updatedAt: T0,
      seats: [{ windowKey: 'session-owner-1', role: 'owner', joinedAt: T0 - 86_400_000 }],
      sessionJump: [{ windowKey: 'session-owner-1', archived: false }],
    },
    progress: {
      stageEnteredAt: T0 - 28 * 60_000,
      stageStayedMs: 28 * 60_000,
      sinceUpdateMs: 2 * 60_000,
      tasks: { total: 11, done: 4, running: 1, todo: 6, subChainDone: 5, subChainTotal: 8 },
    },
    verdictLine: '实施段在跑',
    waitingHuman: 0,
    gaps: [],
    actions: [],
  }
}

const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

async function tick(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/* --------------------------------------------------------------- ① 注册与次序 */

describe('验收 Tab 注册（FR-8）', () => {
  it('七枚 Tab，verify 恰好一枚，且次序 dialogue < verify < token', () => {
    expect(REPORT_TAB_KEYS).toEqual(['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'])
    expect(REPORT_TABS.filter(d => d.key === 'verify')).toHaveLength(1)
    const html = buildTabBar(makeReport(), 'trunk')
    expect(countOf(html, '<button')).toBe(7)
    expect(html.indexOf('data-tab="dialogue"')).toBeLessThan(html.indexOf('data-tab="verify"'))
    expect(html.indexOf('data-tab="verify"')).toBeLessThan(html.indexOf('data-tab="token"'))
    // 与注册项同一位次的图标锚也在第 5 枚（1-based）
    const iconSpans = [...html.matchAll(/<span class="dsh-pm-tab-icon" data-proto-icon-before="([^"]*)"/g)]
    expect(iconSpans).toHaveLength(7)
    expect(iconSpans[4]![1]).toBe('✅')
  })

  it('verify 图标 = icons.ts 的内联 SVG（盾形对勾），emoji 不作为可见文本渲染', () => {
    const html = buildTabBar(makeReport(), 'verify')
    expect(html).toContain('data-proto-icon-before="✅">' + TAB_ICON_SVG.verify + '</span>验收')
    // 盾形 + 对勾两笔，且遵守全族常量（16 网格 / 线宽 1.5 / 装饰性）
    expect(TAB_ICON_SVG.verify).toContain('aria-hidden="true"')
    expect(countOf(TAB_ICON_SVG.verify, '<path')).toBe(2)
    // 可见文本位没有 emoji（✅ 只活在属性值里）
    expect(html.replace(/data-proto-icon-before="[^"]*"/g, '')).not.toContain('✅')
  })

  it('未激活的 verify 面板不在 DOM；激活 verify 时其它面板不在 DOM', () => {
    const trunkHtml = buildReportShell(makeReport(), 'trunk')
    expect(trunkHtml).not.toContain('data-tab-host="verify"')
    expect(trunkHtml).not.toContain('data-panel="verify"')
    // 先落变量再传（与 report-shell 的 panelStub 同款）：绕开对象字面量的额外属性检查
    const payload: { available: true; pendingCount: number } = { available: true, pendingCount: 2 }
    const verifyHtml = buildReportShell(makeReport(), 'verify', { data: payload })
    expect(countOf(verifyHtml, 'data-tab-host="verify"')).toBe(1)
    for (const key of ['trunk', 'docs', 'dag', 'dialogue', 'token', 'prompts'] as const) {
      expect(verifyHtml, key).not.toContain('data-tab-host="' + key + '"')
      expect(verifyHtml, key).not.toContain('data-panel="' + key + '"')
    }
  })
})

/* --------------------------------------------------------------- ③ 占位与面板桩 */

describe('验收面板占位（面板实体归 t3）', () => {
  it('未取数时渲染「验收加载中…」（壳的通用 loading 占位）', () => {
    const html = buildReportShell(makeReport(), 'verify')
    expect(html).toContain('验收加载中…')
  })

  it('占位 render 自报家门：data-panel + data-panel-placeholder 都是自己的 key', () => {
    const html = verifyPanel.render({}, {
      requirementId: 'REQ-x', load: () => Promise.reject(new Error('不取数')), openDoc: () => {},
    })
    expect(html).toContain('data-panel="verify"')
    expect(html).toContain('data-panel-placeholder="verify"')
    expect(html.length).toBeGreaterThan(0)
  })
})

/* --------------------------------------------------------------- ⑤ 角标 */

describe('验收角标 = 服务端待裁决计数（禁 0 冒充）', () => {
  it('badge 只读 tabCounts.verify：有值渲染、缺省不渲染、0 不渲染', () => {
    expect(verifyPanel.badge({ tabCounts: { verify: '2' } } as ReportResponse)).toBe('2')
    expect(verifyPanel.badge({ tabCounts: {} } as ReportResponse)).toBeUndefined()
    expect(verifyPanel.badge(undefined)).toBeUndefined()
    const withCount = buildTabBar({ ...makeReport(), tabCounts: { verify: '2' } }, 'trunk')
    expect(withCount).toContain('data-badge="verify">2<')
    // 复核 P1-1：待裁决徽标 = 红色呼救信号（警示类 + 契约锚 data-badge-verify），不是通用灰徽章
    expect(withCount).toContain('dsh-pm-badge-alert')
    expect(withCount).toContain('data-badge-verify="1"')
    const withZero = buildTabBar({ ...makeReport(), tabCounts: { verify: '0' } }, 'trunk')
    expect(withZero).not.toContain('data-badge="verify"')
    expect(withZero).not.toContain('dsh-pm-badge-alert')
    expect(buildTabBar(makeReport(), 'trunk')).not.toContain('data-badge="verify"')
  })
})

/* --------------------------------------------------------------- ④ 取数接线 */

describe('验收取数接线（切到才取 · 缓存键 reqId::verify::revision · 三态）', () => {
  it('切到才取；同 revision 切回命中缓存；revision 变更才重取', async () => {
    const calls: string[] = []
    const shell = createReportShell({
      requirementId: 'REQ-261006130057-7a43',
      loadReport: () => { calls.push('report'); return Promise.resolve(makeReport()) },
      load: (key) => { calls.push(key); return Promise.resolve({ available: true, pendingCount: 2 } as never) },
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    expect(calls).toEqual(['report', 'trunk']) // 首屏不取 verify
    expect(shell.loadCount('verify')).toBe(0)
    shell.select('verify')
    await tick()
    expect(shell.loadCount('verify')).toBe(1)
    shell.select('trunk')
    shell.select('verify') // 同 revision 切回：缓存键 REQ-…::verify::1 命中，不重取
    await tick()
    expect(shell.loadCount('verify')).toBe(1)
    shell.setRevision(2) // 缓存键第三段变了 → 当前 Tab（verify）重取
    await tick()
    expect(shell.loadCount('verify')).toBe(2)
    shell.detach()
  })

  it('三态：loading 占位 → ready 占位（不空白、不拿 0 冒充）', async () => {
    const shell = createReportShell({
      requirementId: 'REQ-261006130057-7a43',
      loadReport: () => Promise.resolve(makeReport()),
      load: (key) => Promise.resolve({ available: true, marker: key } as never),
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    shell.select('verify')
    expect(shell.html()).toContain('验收加载中…') // 在途 = loading 占位
    await tick()
    const html = shell.html()
    expect(html).toContain('data-panel-placeholder="verify"') // ready = 占位（t3 换实体）
    expect(html).not.toContain('验收加载中…')
    shell.detach()
  })
})

describe('端点 404 / 未装配 → degraded（FR-8：不是失败态）', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  /** 最小 fetch 桩：只实现 unwrap/errorOf 真正读的三个成员。 */
  const stubFetch = (res: { ok: boolean; status?: number; body: unknown }): void => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body,
    })))
  }

  it('fetchReportVerify 命中 /requirements/:id/verify；404 → 降级信封（固定去向文案）', async () => {
    stubFetch({ ok: false, status: 404, body: { error: 'Cannot GET' } })
    const res = await fetchReportVerify('REQ-261006130057-7a43', 'session-x')
    expect(res).toEqual({
      available: false,
      reason: 'port-unavailable',
      note: VERIFY_OLD_SERVER_TEXT,
    })
    // URL 形状：端点名 verify + 会话参数带上（文档根解析依赖它）
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])
    expect(url).toContain('/requirements/REQ-261006130057-7a43/verify')
    expect(url).toContain('session=session-x')
  })

  it('200 正常载荷原样透传（不补默认值）；500 等其它错误照样抛（那是"接线了但没成"）', async () => {
    stubFetch({ ok: true, body: { success: true, data: { pendingCount: 2 } } })
    const ok = await fetchReportVerify('REQ-261006130057-7a43')
    expect(ok).toEqual({ pendingCount: 2 })
    stubFetch({ ok: false, status: 500, body: { error: 'boom' } })
    await expect(fetchReportVerify('REQ-261006130057-7a43')).rejects.toThrow('boom')
  })

  it('fetchReportPanel 总入口：verify 键路由到 verify 端点', async () => {
    stubFetch({ ok: true, body: { success: true, data: { pendingCount: 0 } } })
    await fetchReportPanel('REQ-261006130057-7a43', 'verify')
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])
    expect(url.endsWith('/verify')).toBe(true)
  })

  it('面板 degraded 文案：port-unavailable → 固定去向句；其余原因走通用文案（不吞 note）', () => {
    const old: Degrade = { available: false, reason: 'port-unavailable', note: '端点没有' }
    expect(verifyPanel.degraded?.(old)).toBe(VERIFY_OLD_SERVER_TEXT)
    const ledger: Degrade = { available: false, reason: 'ledger-unreadable', note: '台账分片读不到' }
    expect(verifyPanel.degraded?.(ledger)).toBe('不可用（台账读不到）：台账分片读不到')
    // 壳里渲染出来的就是这句（带降级锚，不是 error 态、没有重试按钮）
    const html = buildReportShell(makeReport(), 'verify', {
      data: { available: false, reason: 'port-unavailable', note: 'x' },
    })
    expect(html).toContain('data-panel-degraded="port-unavailable"')
    expect(html).toContain(VERIFY_OLD_SERVER_TEXT)
    expect(html).not.toContain('report-panel-retry')
  })
})

/* --------------------------------------------------------------- ⑥ FR-4 样式块 */

describe('FR-4 样式收敛（report.ts 带标记块）', () => {
  it('带标记块注释就位，且收敛项逐条在场（令牌引用，不写裸色值/裸毫秒）', () => {
    expect(REPORT_CSS).toContain('/* ── FR-4 进度带与 Tab 栏（REQ-261006130057-7a43 t2）── */')
    const at = REPORT_CSS.indexOf('── FR-4 进度带与 Tab 栏')
    // 切片截到下一个带标记块为止（复核 P1-2）：slice 到 EOF 会把后续 FR 块（t4/t8）的
    // 令牌定义 hex 扫进「不写裸色值」判据——令牌定义处携带色值合法（t5 --pm-danger-tint 先例）。
    // FR-4 自身是「单行标记 + ═ 装饰框」双段注释：先跳过自己的框尾（`══ */`），
    // 再认下一个块首（`/* ──` 或 `/* ═` 两种写法）。
    const ownBoxEnd = REPORT_CSS.indexOf('═══ */', at)
    const from = ownBoxEnd > at ? ownBoxEnd : at + 10
    const nextInline = REPORT_CSS.indexOf('/* ──', from)
    const nextBox = REPORT_CSS.indexOf('/* ═', from)
    const next = Math.min(
      nextInline > from ? nextInline : Number.POSITIVE_INFINITY,
      nextBox > from ? nextBox : Number.POSITIVE_INFINITY,
    )
    const block = REPORT_CSS.slice(at, Number.isFinite(next) ? next : undefined)
    // Tab 栏：padding 6×8 / 图标 13px / 徽章 mono 10.5px / 激活态浅蓝底+主色文字+2px 指示条
    expect(block).toContain('--pm-tab-pad-y: 6px')
    expect(block).toContain('--pm-tab-pad-x: 8px')
    expect(block).toContain('--pm-tab-icon-fr4: 13px')
    expect(block).toContain('--pm-tab-badge-fs: 10.5px')
    expect(block).toContain('--pm-tab-indicator: 2px')
    expect(block).toContain('font-family: var(--pm-mono)')
    expect(block).toContain('background: var(--pm-tab-active-bg)')
    expect(block).toContain('color: var(--pm-accent)')
    expect(block).toContain('border-bottom-color: var(--pm-accent)')
    // 进度带：10.5px 单行标签（4px 色条在 ④ 段已是）
    expect(block).toContain('--pm-prog-label-fs: 10.5px')
    // 900 窄档：Tab 栏横滚不换行
    expect(block).toContain('flex-wrap: nowrap')
    // 本块不写裸色值（浅蓝底由 color-mix 从 --pm-accent 推导）与裸毫秒
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/\d+(?:\.\d+)?ms\b/)
  })

  it('进度带三态文本标记契约不动（buildProgressDots 的 ✓ / ▸ / 无标记）', () => {
    // 本卡只收敛样式，不改 stage-detail.ts 的渲染——三态标记由真实文本节点承载
    const html = buildReportShell(makeReport(), 'trunk')
    expect(html).toContain('data-dot-mark="completed">✓ ')
    expect(html).toContain('data-dot-mark="current">▸ ')
    expect(html).toContain('data-dot-mark="todo">')
  })
})
