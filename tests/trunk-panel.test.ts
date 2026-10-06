/**
 * 「汇报」Tab 面板渲染断言 —— REQ-261004222448-292a t-9eb784。
 * serves: FR-1（主干四条 + 缺节纪律）、FR-2（决策与取舍）、FR-11 #7（无内层滚动）、
 *         FR-14（技术方案）、FR-15（亮点反应付 + 成果清单）。
 *
 * 本包**没有 jsdom**：面板是纯函数返回 HTML 字符串，所以这里的断言全部是**字符串级**的。
 * 需要判"某节点在不在某个容器里"时用下面的 `sliceEl()`（按标签深度切出元素片段）——
 * 这正是"无证据亮点不得混进正常亮点容器"这条反例的判法：
 * 如果只断言 `data-evid="no"` 存在，把无证据条目塞进正常容器也能过，反例就白写了。
 *
 * 卡上验收（t-9eb784）：缺节渲染含「文档未提供该节」；无证据亮点命中 `data-evid="no"`
 * 且不出现在正常亮点容器里；来源标（现有 / 节新增 / 自动 / 人写）逐条可见；成果清单条数与
 * 服务端一致；产物无 `overflow: auto|scroll`。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import type { TrunkHighlight, TrunkItem, TrunkKey, TrunkResponse, TrunkSource } from '../src/shared/protocol.js'
import { renderTrunkPanel, trunkPanel } from '../src/client/views/panels/trunk.js'

/* ────────────────────────────────────────────────────────────── 夹具与小工具 */

function item(key: TrunkKey, over: Partial<TrunkItem> = {}): TrunkItem {
  return { key, source: ['doc'], summary: [], openRefs: [], ...over }
}

function resp(items: TrunkItem[], docLastUpdated?: number): TrunkResponse {
  return { items, ...(docLastUpdated === undefined ? {} : { docLastUpdated }) }
}

function hl(diff: string, why: string, evidence: string[]): TrunkHighlight {
  return { diff, why, evidence }
}

/** 出现次数（比正则省心，也不会被 `*` 的通配伤到）。 */
function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1
}

/**
 * 取「含 marker 的那个 tag 元素」的完整片段（含自身）。
 * 用途：判"某节点在不在这个容器里"——字符串断言里唯一可靠的判法。
 */
function sliceEl(html: string, marker: string, tag: 'div' | 'section' | 'ul'): string {
  const at = html.indexOf(marker)
  if (at < 0) throw new Error('找不到标记：' + marker)
  const open = html.lastIndexOf('<' + tag, at)
  if (open < 0) throw new Error('找不到元素起点：' + marker)
  const openRe = new RegExp('<' + tag + '\\b', 'g')
  const closeRe = new RegExp('</' + tag + '>', 'g')
  let depth = 0
  let i = open
  while (i < html.length) {
    openRe.lastIndex = i
    closeRe.lastIndex = i
    const o = openRe.exec(html)
    const c = closeRe.exec(html)
    if (c === null) break
    if (o !== null && o.index < c.index) { depth += 1; i = o.index + tag.length + 1; continue }
    depth -= 1
    i = c.index + tag.length + 3
    if (depth === 0) return html.slice(open, i)
  }
  throw new Error('元素未闭合：' + marker)
}

/** 面板上下文桩：渲染**不该**碰取数，也不该自己开文档（点击由 board-mount 委托）。 */
function makeCtx(): ReportTabCtx {
  return {
    requirementId: 'REQ-trunk01',
    load: () => Promise.reject(new Error('渲染不该取数')),
    openDoc: vi.fn(),
  }
}

/** 正常标本：七条齐全，亮点含 a 类事实 + b 类带证据 + b 类无证据 + 成果清单。 */
const FULL_ITEMS: TrunkItem[] = [
  item('why', {
    source: ['doc', 'human'],
    summary: ['验收单只能整体通过 / 整体退回，单项有问题就得整轮重来。'],
    openRefs: [{ label: '原文 · requirement.md § 产品定义', path: 'docs/requirements/REQ-trunk01/requirement.md', doc: '产品定义' }],
  }),
  item('problem', {
    summary: ['单项不通过时，意见与责任卡跟不走，验收信息散在评论里。', '影响面：所有走验收段的需求。'],
  }),
  item('approach', {
    source: ['doc', 'ledger'],
    summary: ['主线：驳回 → 建卡 → 回流，三段直线。'],
    openRefs: [{ label: '拆分计划 · plan.md', path: 'docs/requirements/REQ-trunk01/plan.md' }],
  }),
  item('scope', {
    summary: ['不做多级审批；不做跨需求返工合并。'],
  }),
  item('decision', {
    source: ['doc', 'ledger', 'human', 'new-section'],
    summary: ['返工卡挂到原任务下：追溯清晰，代价是 DAG 变深。'],
    openRefs: [{ label: '人工门往返留痕（台账评论）' }],
  }),
  item('tech', {
    source: ['doc', 'new-section'],
    summary: ['技术栈：TypeScript + 手写 HTML 字符串模板（无框架）。', '设计模式：未使用（不硬凑）。'],
  }),
  item('highlight', {
    source: ['doc', 'auto'],
    summary: ['差异：按写死节名抽取，不做模型判断。'],
    openRefs: [
      { label: '原文 · architecture.md § 技术方案与亮点', path: 'docs/requirements/REQ-trunk01/design/architecture.md', doc: '技术方案与亮点' },
      { label: '改动文件清单（执行记录）' },
    ],
    facts: [
      { label: '改动规模', value: '14 个文件（去重）', evidence: ['src/client/views/trunk.ts', 'tests/trunk.test.ts'] },
      { label: '新增测试文件', value: '2 个' },
    ],
    highlights: [
      hl('意见与责任卡随卡携带，不写进评论', '否则返工后原意见丢失', ['tests/acceptance/rework.test.ts']),
      hl('交互体验更顺手', '', []),
    ],
    achievement: [
      'src/client/views/trunk.ts',
      'src/client/views/report-tabs.ts',
      'tests/trunk-panel.test.ts',
    ],
  }),
]

const FULL_HTML = renderTrunkPanel(resp(FULL_ITEMS, 1760000000000))

/* ────────────────────────────────────────────────────────────── 注册契约 */

describe('注册契约（导出名 / key / label 不得变）', () => {
  it('key=trunk、label=汇报、badge 不显示（不前端推算数字）', () => {
    expect(trunkPanel.key).toBe('trunk')
    expect(trunkPanel.label).toBe('汇报')
    expect(trunkPanel.badge(undefined)).toBeUndefined()
  })

  it('render 是纯渲染：不调 ctx.load、不自己开文档（点击由 board-mount 委托到 ctx.openDoc）', () => {
    const ctx = makeCtx()
    const html = trunkPanel.render(resp(FULL_ITEMS), ctx)
    expect(html).toContain('data-panel="trunk"')
    expect(ctx.openDoc).not.toHaveBeenCalled()
  })

  it('根容器带 data-panel="trunk"（t15/t16 的查询根）', () => {
    expect(FULL_HTML).toContain('data-panel="trunk"')
  })
})

/* ────────────────────────────────────────────────────────────── 七条顺序与摘要行 */

describe('七条的固定顺序与摘要行', () => {
  it('按 why → problem → approach → scope → decision → tech → highlight 渲染，每条一个 data-trunk-item', () => {
    const keys: TrunkKey[] = ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight']
    const positions = keys.map(k => FULL_HTML.indexOf('data-trunk-item="' + k + '"'))
    expect(positions.every(p => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const k of keys) expect(countOf(FULL_HTML, 'data-trunk-item="' + k + '"')).toBe(1)
  })

  it('摘要**每行一个节点**：行数 == 服务端给的 summary 条数', () => {
    const problem = sliceEl(FULL_HTML, 'data-trunk-item="problem"', 'section')
    expect(countOf(problem, 'data-summary-line')).toBe(2)
    const why = sliceEl(FULL_HTML, 'data-trunk-item="why"', 'section')
    expect(countOf(why, 'data-summary-line')).toBe(1)
    expect(why).toContain('验收单只能整体通过')
  })

  it('服务端多出来的未知 key 照实追加在后面（不丢内容）', () => {
    const html = renderTrunkPanel(resp([item('why', { summary: ['一句话'] }), item('retro' as TrunkKey, { summary: ['七条之外的一条'] })]))
    expect(html).toContain('data-trunk-item="retro"')
    expect(html).toContain('七条之外的一条')
    expect(html.indexOf('data-trunk-item="why"')).toBeLessThan(html.indexOf('data-trunk-item="retro"'))
  })
})

/* ────────────────────────────────────────────────────────────── 缺节三态文案 */

describe('缺节三态（FR-1 / FR-12 / FR-14：不留白、不编）', () => {
  const missing = renderTrunkPanel(resp([
    item('why', {
      missing: 'doc-section-missing',
      summary: [],
      openRefs: [{ label: '需求文档缺「产品定义」节', path: 'docs/requirements/REQ-trunk01/requirement.md' }],
    }),
    item('tech', { missing: 'doc-section-missing', summary: [] }),
  ]))

  it('缺节 → data-missing="doc-section-missing" 且文案含「文档未提供该节」', () => {
    expect(countOf(missing, 'data-missing="doc-section-missing"')).toBe(2)
    expect(missing).toContain('文档未提供该节')
    const why = sliceEl(missing, 'data-trunk-item="why"', 'section')
    expect(why).toContain('data-missing="doc-section-missing"')
    expect(why).toContain('文档未提供该节')
    // 缺节不能靠"编"来填：该条里不得出现任何摘要行
    expect(why).not.toContain('data-summary-line')
    // 但入口仍要在：人得能顺着它去补写那一节
    expect(why).toContain('data-open-doc="docs/requirements/REQ-trunk01/requirement.md"')
  })

  it('有内容态：正常摘要 + **没有** data-missing（缺节不误标）', () => {
    const ok = renderTrunkPanel(resp([item('tech', { summary: ['技术栈：TypeScript'] })]))
    expect(ok).toContain('data-summary-line')
    expect(ok).not.toContain('data-missing')
    expect(ok).not.toContain('文档未提供该节')
  })

  it('矛盾态（没摘要也没标缺节）→ 照实说「本节无内容」，不是空白也不是编', () => {
    const blank = renderTrunkPanel(resp([item('approach', { summary: [] })]))
    expect(blank).toContain('data-summary-none="1"')
    expect(blank).toContain('本节无内容')
    expect(blank).not.toContain('data-missing')
  })

  it('整块形状不认得 / 空数组 → 诚实空态，不抛、不留白', () => {
    for (const bad of [undefined, null, {}, { items: 'x' }, { available: false, reason: 'file-missing', note: 'x' }]) {
      const html = renderTrunkPanel(bad)
      expect(html).toContain('data-panel="trunk"')
      expect(html).toContain('data-trunk-shape="bad"')
    }
    const none = renderTrunkPanel(resp([]))
    expect(none).toContain('data-trunk-empty="1"')
    expect(none).toContain('服务端未返回任何主干条目')
  })
})

/* ────────────────────────────────────────────────────────────── 来源标 */

describe('来源标（哪条照搬、哪条新造：逐条可见）', () => {
  const all: TrunkSource[] = ['doc', 'ledger', 'auto', 'human', 'new-section']
  const html = renderTrunkPanel(resp([item('decision', { source: all, summary: ['一句'] })]))

  it('五种来源各有一个 data-source 标', () => {
    for (const s of all) expect(html).toContain('data-source="' + s + '"')
    expect(countOf(html, 'data-source=')).toBe(5)
  })

  it('标上是人话：文档 / 台账 / 自动汇总 / 人工留痕 / 本节新增', () => {
    for (const label of ['文档', '台账', '自动汇总', '人工留痕', '本节新增']) {
      expect(sliceEl(html, 'data-trunk-item="decision"', 'section')).toContain('>' + label + '<')
    }
  })

  it('source 缺失 → 标「来源未知」而不是安静不标（协议要求每条都带 source）', () => {
    const none = renderTrunkPanel(resp([item('why', { source: [], summary: ['一句'] })]))
    expect(none).toContain('data-source="unknown"')
    expect(none).toContain('来源未知')
  })

  it('同一容器里多个来源渲染多个标（不合并成一个）', () => {
    const two = renderTrunkPanel(resp([item('tech', { source: ['doc', 'new-section'], summary: ['一句'] })]))
    const tech = sliceEl(two, 'data-trunk-item="tech"', 'section')
    expect(countOf(tech, 'data-source=')).toBe(2)
  })
})

/* ────────────────────────────────────────────────────────────── 亮点反应付（FR-15 核心） */

describe('亮点反应付（无证据条目不得混进正常亮点）', () => {
  const highlight = sliceEl(FULL_HTML, 'data-trunk-item="highlight"', 'section')

  it('a 类自动事实正常渲染，带 evidence 的给指针', () => {
    expect(highlight).toContain('data-hl-group="facts"')
    expect(highlight).toContain('data-fact="1"')
    expect(highlight).toContain('改动规模')
    expect(highlight).toContain('14 个文件（去重）')
    expect(highlight).toContain('data-evidence="src/client/views/trunk.ts"')
    // 没有 evidence 的事实如实标「无证据指针」，不假装有
    expect(highlight).toContain('无证据指针')
  })

  it('b 类带证据的条目三件齐全（差异点 + 为什么 + 证据指针）', () => {
    const ok = sliceEl(FULL_HTML, 'data-hl-list="with-evidence"', 'div')
    expect(ok).toContain('差异：意见与责任卡随卡携带，不写进评论')
    expect(ok).toContain('为什么：否则返工后原意见丢失')
    expect(ok).toContain('data-evidence="tests/acceptance/rework.test.ts"')
    expect(ok).not.toContain('data-evid="no"')
  })

  it('**反例**：evidence 为空数组 → 打 data-evid="no" + 文案「未提供证据（不计入亮点）」', () => {
    const no = sliceEl(FULL_HTML, 'data-hl-list="no-evidence"', 'div')
    expect(no).toContain('data-evid="no"')
    expect(no).toContain('未提供证据')
    expect(no).toContain('不计入亮点')
    expect(no).toContain('差异：交互体验更顺手')
  })

  it('**反例**：无证据条目不在正常亮点容器里，也不带正常亮点的 class', () => {
    // 容器级：带证据的那堆 / 人写那组，都不含无证据条目
    expect(sliceEl(FULL_HTML, 'data-hl-list="with-evidence"', 'div')).not.toContain('data-evid="no"')
    expect(sliceEl(FULL_HTML, 'data-hl-group="written"', 'div')).not.toContain('data-evid="no"')
    // 节点级：无证据条目的开标签不是正常亮点的样式/容器属性
    const tag = /<div [^>]*data-evid="no"[^>]*>/.exec(FULL_HTML)?.[0] ?? ''
    expect(tag).toContain('class="dsh-pm-hl-missing"')
    expect(tag).not.toContain('class="dsh-pm-hl"')
    expect(tag).toContain('data-hl="no-evidence"')
    // 且它确实在自己的容器里（不是"哪都没有"）
    expect(FULL_HTML).toContain('data-hl-group="no-evidence"')
  })

  it('人写条目全部无证据时：正常亮点组给"未见带证据的人写差异"，无证据条目单独成组', () => {
    const html = renderTrunkPanel(resp([
      item('highlight', { summary: ['一句'], highlights: [hl('自夸式差异', '说了但指不出', [])] }),
    ]))
    expect(html).toContain('data-hl-none="1"')
    expect(html).toContain('未提供证据（不计入亮点）')
    expect(sliceEl(html, 'data-hl-group="written"', 'div')).not.toContain('data-evid="no"')
    expect(sliceEl(html, 'data-hl-group="no-evidence"', 'div')).toContain('data-evid="no"')
  })

  it('缺证据与"文档缺该节"是两回事：人写条目全是空证据时，该条**不**标缺节', () => {
    const html = renderTrunkPanel(resp([
      item('highlight', { summary: ['一句'], highlights: [hl('差异', '', [])] }),
    ]))
    expect(html).not.toContain('data-missing')
    expect(html).toContain('data-evid="no"')
  })
})

/* ────────────────────────────────────────────────────────────── 成果清单 */

describe('成果清单（条数与服务端一致）', () => {
  const files = FULL_ITEMS[6].achievement ?? []

  it('逐条列出：data-achievement 节点数 == 服务端数组长度，路径逐条可见', () => {
    const highlight = sliceEl(FULL_HTML, 'data-trunk-item="highlight"', 'section')
    expect(files.length).toBe(3)
    expect(countOf(highlight, 'data-achievement="1"')).toBe(files.length)
    for (const f of files) expect(highlight).toContain(f)
  })

  it('不截断：给 12 条就给 12 条节点', () => {
    const many = Array.from({ length: 12 }, (_, i) => 'src/mod' + String(i + 1) + '.ts')
    const html = renderTrunkPanel(resp([item('highlight', { summary: ['一句'], achievement: many })]))
    expect(countOf(html, 'data-achievement="1"')).toBe(12)
  })

  it('无改动记录 → 说「未采集」，**不写 0 条**（FR-12 禁 0 表示未知）', () => {
    const html = renderTrunkPanel(resp([item('highlight', { summary: ['一句'] })]))
    expect(html).toContain('data-achievement-none="1"')
    expect(html).toContain('未采集')
    expect(html).not.toMatch(/0\s*(条|个|项|处|份)/)
    expect(html).toContain('data-fact-none="1"')
    expect(html).toContain('尚无自动事实')
  })
})

/* ────────────────────────────────────────────────────────────── 范围边界 / 点开原文 / 形态 */

describe('范围边界要一眼看出「明确不做什么」（FR-1）', () => {
  it('scope 条带 data-scope-not 与「明确不做什么」字样', () => {
    const scope = sliceEl(FULL_HTML, 'data-trunk-item="scope"', 'section')
    expect(scope).toContain('data-scope-not="1"')
    expect(scope).toContain('明确不做什么')
    expect(scope).toContain('不做多级审批')
  })
})

describe('点开原文（复用 open-doc 链路，不自己 fetch）', () => {
  it('openRefs 每项：有 path → data-open-doc="path"；label 用服务端给的可读标题', () => {
    expect(FULL_HTML).toContain('data-open-doc="docs/requirements/REQ-trunk01/requirement.md"')
    expect(FULL_HTML).toContain('原文 · requirement.md § 产品定义')
    expect(FULL_HTML).toContain('data-open-doc="docs/requirements/REQ-trunk01/design/architecture.md"')
  })

  it('没有 path 的入口（指向台账/留痕）渲染成不可点说明，**不**发 data-open-doc', () => {
    const html = renderTrunkPanel(resp([
      item('decision', { summary: ['一句'], openRefs: [{ label: '人工门往返留痕（台账评论）' }] }),
    ]))
    expect(html).toContain('人工门往返留痕（台账评论）')
    expect(html).not.toContain('data-open-doc')
    expect(html).toContain('is-nopath')
  })

  it('data-open-doc 只来自 openRefs：事实/亮点的证据指针不冒充"点开原文"', () => {
    const highlight = sliceEl(FULL_HTML, 'data-trunk-item="highlight"', 'section')
    // 亮点条两个 openRefs 里只有一个带 path → 恰好 1 个 data-open-doc（证据指针不算）
    expect(countOf(highlight, 'data-open-doc=')).toBe(1)
    expect(highlight).toContain('data-evidence="tests/acceptance/rework.test.ts"')
  })
})

describe('形态纪律（FR-11 #7：一律铺开，不做内层滚动）', () => {
  it('产物里不出现 overflow: auto|scroll', () => {
    expect(FULL_HTML).not.toMatch(/overflow\s*:\s*(auto|scroll)/)
    const empty = renderTrunkPanel(resp([item('highlight')]))
    expect(empty).not.toMatch(/overflow\s*:\s*(auto|scroll)/)
  })

  it('不内联 max-height（限高滚动条的另一半）', () => {
    expect(FULL_HTML).not.toMatch(/max-height\s*:/)
  })

  it('不带行内 style（样式归样式卡，面板只出结构与 data-*）', () => {
    expect(FULL_HTML).not.toContain('style="')
  })
})

/* ────────────────────────────────────────────────────────────── T-15 汇报网格（FR-5 · REQ-261006130057-7a43 t6） */

/**
 * T-15（REQ-261006130057-7a43 · FR-5 · t6）：汇报面板模块排版密度——
 * 模块头一行化（标题左 + 副题 + 右端「来源标 + 点开看原文 →」）、短模块 2×2 网格、
 * 长模块（亮点与成效）通栏、空节「文档未提供该节（不编、不留白）」文案保留。
 * 视觉基准 = 原型 v1.5 `#FR-5`（.trunk-grid / .t-mod.wide / .t-head）。
 */
describe('T-15 · 汇报网格与模块头一行化（FR-5 · REQ-261006130057-7a43 t6）', () => {
  /** 切模块头（头内只有行内节点，第一个 </div> 即头尾）。 */
  const headOf = (html: string, key: string): string => {
    const block = sliceEl(html, 'data-trunk-item="' + key + '"', 'section')
    const at = block.indexOf('<div class="dsh-pm-trunk-head">')
    expect(at, key + ' 缺模块头').toBeGreaterThan(-1)
    return block.slice(at, block.indexOf('</div>', at))
  }

  it('七条进 2×2 网格容器；长模块（亮点与成效）通栏且恰好一条通栏', () => {
    expect(countOf(FULL_HTML, 'data-trunk-grid="1"')).toBe(1)
    // 通栏 = 只有 highlight 一条（原型 .t-mod.wide）
    expect(countOf(FULL_HTML, 'data-trunk-wide="1"')).toBe(1)
    expect(countOf(FULL_HTML, 'dsh-pm-trunk-item--wide')).toBe(1)
    const wideAt = FULL_HTML.indexOf('dsh-pm-trunk-item--wide')
    const highlightAt = FULL_HTML.indexOf('data-trunk-item="highlight"')
    // 通栏标与 highlight 在同一 section 标签上（class 在 data-trunk-item 之前）
    expect(wideAt).toBeGreaterThan(-1)
    expect(wideAt).toBeLessThan(highlightAt)
    expect(highlightAt - wideAt).toBeLessThan(120)
    // 网格不改动七条的 DOM 叙事序（排布是 CSS 的事）
    const keys: TrunkKey[] = ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight']
    const positions = keys.map(k => FULL_HTML.indexOf('data-trunk-item="' + k + '"'))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('模块头一行化：标题左 + 副题 + 右端「来源标 + 点开看原文 →」同在头行', () => {
    const head = headOf(FULL_HTML, 'why')
    expect(head).toContain('<h3 class="dsh-pm-trunk-title">为何做</h3>')
    expect(head).toContain('由来与触发场景') // 副题
    expect(head).toContain('dsh-pm-trunk-head-right') // 右端组
    expect(head).toContain('data-source="doc"') // 来源标
    // 「点开看原文 →」从头行里就能点（不再独占正文末一行）
    expect(head).toContain('点开看原文 →')
    expect(head).toContain('data-open-doc="docs/requirements/REQ-trunk01/requirement.md"')
    // 出处短标（来源：requirement.md § 产品定义）随迁，一个字不丢
    expect(head).toContain('来源：')
    expect(head).toContain('产品定义')
  })

  it('无 path 的入口随头行渲染成不可点说明（不画按钮、不发 data-open-doc）', () => {
    const head = headOf(FULL_HTML, 'decision')
    expect(head).toContain('人工门往返留痕（台账评论）')
    expect(head).toContain('is-nopath')
  })

  it('空节文案保留：「文档未提供该节（不编、不留白）」，且补写入口仍在（随迁头行）', () => {
    const missing = renderTrunkPanel(resp([
      item('tech', { missing: 'doc-section-missing', summary: [] }),
    ]))
    const block = sliceEl(missing, 'data-trunk-item="tech"', 'section')
    expect(block).toContain('data-missing="doc-section-missing"')
    expect(block).toContain('文档未提供该节（不编、不留白）')
    // 缺节标本（带 openRefs 的那条）：入口仍指出去哪补写
    const missingWhy = renderTrunkPanel(resp([
      item('why', {
        missing: 'doc-section-missing',
        summary: [],
        openRefs: [{ label: '需求文档缺「产品定义」节', path: 'docs/requirements/REQ-trunk01/requirement.md' }],
      }),
    ]))
    expect(headOf(missingWhy, 'why')).toContain('data-open-doc="docs/requirements/REQ-trunk01/requirement.md"')
  })
})

/* ────────────────────────────────────────────────────────────── 文档版本 */

describe('文档最后更新时间（让人知道读到的是哪一版）', () => {
  it('服务端给了就标出来；没给就不说（不编时间）', () => {
    expect(FULL_HTML).toContain('data-doc-updated="1"')
    expect(FULL_HTML).toContain('文档最后更新于')
    const noStamp = renderTrunkPanel(resp([item('why', { summary: ['一句'] })]))
    expect(noStamp).not.toContain('data-doc-updated')
    expect(noStamp).not.toContain('文档最后更新于')
  })
})
