/**
 * 「汇报」Tab 面板（REQ-261004222448-292a · FR-1 / FR-2 / FR-14 / FR-15）——纯函数返回 HTML 字符串。
 *
 * 这是**默认选中**的那个 Tab：打开详情页第一眼看到的内容。三条纪律写在最前面，改代码时别丢：
 *  ① **不编**（FR-1 / FR-12 / FR-14）：服务端把 `missing` 置位就渲染「文档未提供该节」，
 *     不留白、不拿需求描述或形容词补位。摘要行一律是文档原文的字串（抽取在服务端做，前端只排版）。
 *  ② **反应付**（FR-15 的核心）：亮点分两堆渲染——带证据指针的照常展示；`evidence` 为空数组的
 *     **单独成组**并打 `data-evid="no"`，写明「未提供证据（不计入亮点）」。关键是**两堆不共容器、
 *     不共样式**：混在一个容器里，读者就分不出哪条能核验，"反应付"就退化成一句口号
 *     （这是本卡唯一被机械断言的反例）。
 *  ③ **铺开不滚动**（FR-11 #7）：产物里不出现任何 `overflow`，长内容一律展开；内层滚动条会把
 *     "有多少"变成不可数，而本设计的目标正是"数量必须可数"。
 *
 * 为什么要一层"防御性读取"：`render(data: unknown, ctx)` 的入参形状由服务端/中间层决定，
 * 渲染路径上对 `undefined` 取字段会整块白屏（本仓在 `renderComments` 上踩过）。
 * 这里只做**形状归一**（缺数组 → 空数组、缺字段 → 不渲染那一块），不做任何内容编造。
 *
 * 点击去哪：本模块**只产出** `data-open-doc="<path>"` 入口，不自己 `fetch`、也不在这里挂监听——
 * 点开正文统一走壳注入的 `ctx.openDoc(path)`（open-doc → 官方右侧栏），挂载点在 board-mount 的
 * 事件委托里。渲染因此是**无副作用**的纯函数（测试可以直接断言字符串）。
 *
 * @module dsh-pmboard/client/views/panels/trunk
 */
import { esc } from '../../html.js'
import type { ReportTabCtx, ReportTabDef } from '../report-tabs.js'
import type { TrunkKey, TrunkSource } from '../../../shared/protocol.js'
import { fmtTime } from '../../render/dom-utils.js'

/* ────────────────────────────────────────────────────────────── 七条的固定顺序与标题 */

/**
 * 七条的**固定顺序**（与 FR-1/2/14/15 的叙述顺序一致：为何做 → …… → 亮点与差异）。
 *
 * 为什么写死顺序而不照服务端数组顺序渲染：顺序本身就是"读一份汇报"的叙事，
 * 服务端换序不该让页面顺序跳变。服务端多出来的未知 key **照实追加在后面**（不丢内容）。
 */
const TRUNK_ORDER: readonly TrunkKey[] = ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight']

const TRUNK_META: Record<TrunkKey, { label: string; sub: string }> = {
  why: { label: '为何做', sub: '由来与触发场景' },
  problem: { label: '解决什么', sub: '问题定义 · 影响面 · 收益预期' },
  approach: { label: '实现思路', sub: '方案主线 + 关键模块划分' },
  scope: { label: '范围边界', sub: '明确不做什么（防"以为没做"）' },
  decision: { label: '关键决策与取舍', sub: '否掉了什么、为什么' },
  tech: { label: '技术方案', sub: '技术栈 / 模块划分 / 设计模式 / 关键实现手法' },
  highlight: { label: '亮点与差异', sub: '每条差异必须带证据指针' },
}

/* ────────────────────────────────────────────────────────────── 来源标 */

/**
 * 来源 → 人话标签（接口里 `source[]` 是枚举，页面上必须是中文）。
 * 两个维度合成一行标：**这条内容从哪来**（文档 / 台账 / 本节新增）与**它怎么产生**
 * （自动汇总 / 人工留痕）——读者据此自己判断"哪条是照搬、哪条是新造"。
 */
const SOURCE_LABELS: Record<TrunkSource, string> = {
  doc: '文档',
  ledger: '台账',
  auto: '自动汇总',
  human: '人工留痕',
  'new-section': '本节新增',
}

const SOURCE_TITLES: Record<TrunkSource, string> = {
  doc: '抽自现有文档的原文',
  ledger: '台账 / 拆分计划里的事实',
  auto: '服务端自动算出的事实（可计算，永远为真）',
  human: '人的操作留下的痕迹（人工门往返 / 退回理由 / 评论）',
  'new-section': '靠本需求新增的文档节才有（FR-13）',
}

/** 枚举查表（不信任服务端枚举值：脏值照实当标签，不静默丢掉整条标）。 */
function sourceLabelOf(s: string): string {
  return Object.prototype.hasOwnProperty.call(SOURCE_LABELS, s) ? SOURCE_LABELS[s as TrunkSource] : s
}

function sourceTitleOf(s: string): string {
  return Object.prototype.hasOwnProperty.call(SOURCE_TITLES, s) ? SOURCE_TITLES[s as TrunkSource] : '服务端给的来源值：' + s
}

function sourceTags(sources: readonly string[]): string {
  // 协议要求"每一项都必须带 source"；缺了照实标「来源未知」，而不是安静地不标（不标会被读成"无需来源"）。
  if (sources.length === 0) {
    return '<span class="dsh-pm-trunk-src" data-source="unknown" title="服务端未给来源标记（接口要求每条都带 source）">来源未知</span>'
  }
  return sources.map(s => '<span class="dsh-pm-trunk-src" data-source="' + esc(s) + '"'
    + ' title="' + esc(sourceTitleOf(s)) + '">' + esc(sourceLabelOf(s)) + '</span>').join('')
}

/* ────────────────────────────────────────────────────────────── 防御性读取（形状归一） */

/**
 * 归一后的视图模型。为什么不直接用 `TrunkItem`：入参是 `unknown`，
 * 缺 `openRefs` / `facts` 这类字段时直接 `for...of` 会抛；先归一到"数组永远存在"的形状，
 * 渲染逻辑里就没有一处需要再判 `undefined`。
 */
interface TrunkRef { label: string; path?: string; doc?: string }
interface TrunkFactView { label: string; value: string; evidence: string[] }
interface TrunkHighlightView { diff: string; why: string; evidence: string[] }

interface TrunkItemView {
  key: string
  source: string[]
  summary: string[]
  missing: boolean
  openRefs: TrunkRef[]
  facts: TrunkFactView[]
  highlights: TrunkHighlightView[]
  achievement: string[]
}

interface TrunkView { items: TrunkItemView[]; docLastUpdated?: number }

function strOf(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function strArrayOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

function objOf(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
}

function readRefs(v: unknown): TrunkRef[] {
  if (!Array.isArray(v)) return []
  const out: TrunkRef[] = []
  for (const raw of v) {
    const o = objOf(raw)
    if (o === undefined) continue
    const label = strOf(o.label)
    if (label.length === 0) continue
    const path = strOf(o.path)
    const doc = strOf(o.doc)
    out.push({ label, ...(path.length > 0 ? { path } : {}), ...(doc.length > 0 ? { doc } : {}) })
  }
  return out
}

function readFacts(v: unknown): TrunkFactView[] {
  if (!Array.isArray(v)) return []
  const out: TrunkFactView[] = []
  for (const raw of v) {
    const o = objOf(raw)
    if (o === undefined) continue
    const label = strOf(o.label)
    const value = strOf(o.value)
    if (label.length === 0 && value.length === 0) continue
    out.push({ label, value, evidence: strArrayOf(o.evidence) })
  }
  return out
}

function readHighlights(v: unknown): TrunkHighlightView[] {
  if (!Array.isArray(v)) return []
  const out: TrunkHighlightView[] = []
  for (const raw of v) {
    const o = objOf(raw)
    if (o === undefined) continue
    const diff = strOf(o.diff)
    const why = strOf(o.why)
    const evidence = strArrayOf(o.evidence)
    if (diff.length === 0 && why.length === 0 && evidence.length === 0) continue
    out.push({ diff, why, evidence })
  }
  return out
}

function readItem(raw: unknown): TrunkItemView | undefined {
  const o = objOf(raw)
  if (o === undefined) return undefined
  const key = strOf(o.key)
  if (key.length === 0) return undefined
  return {
    key,
    source: strArrayOf(o.source),
    summary: strArrayOf(o.summary),
    // 只认协议里那一个值：别的值不当"缺节"，也不假装有内容（下面按 summary 是否为空照实兜底）。
    missing: o.missing === 'doc-section-missing',
    openRefs: readRefs(o.openRefs),
    facts: readFacts(o.facts),
    highlights: readHighlights(o.highlights),
    achievement: strArrayOf(o.achievement),
  }
}

/**
 * 读 `TrunkResponse`：形状不认得就返回 `undefined`（调用方渲染"未就绪"空态）。
 * 为什么不用 `isReportResponse` 那种严格守卫：这里只需保证**渲染不抛**，
 * 逐条归一后哪怕只有一条能读也照实渲染那一条（丢掉能读的内容才是更坏的错）。
 */
function readTrunk(data: unknown): TrunkView | undefined {
  const o = objOf(data)
  if (o === undefined || !Array.isArray(o.items)) return undefined
  const items: TrunkItemView[] = []
  for (const raw of o.items) {
    const item = readItem(raw)
    if (item !== undefined) items.push(item)
  }
  // 文档最后更新时间：接口文档写在 `sources.docLastUpdated`，protocol.ts 写在顶层——两处都认。
  const sources = objOf(o.sources)
  const stamp = typeof o.docLastUpdated === 'number' ? o.docLastUpdated
    : (sources !== undefined && typeof sources.docLastUpdated === 'number' ? sources.docLastUpdated : undefined)
  return { items, ...(stamp === undefined ? {} : { docLastUpdated: stamp }) }
}

/** 固定顺序在前、服务端多出来的未知 key 照实追加在后（不丢内容、不静默）。 */
function orderedItems(items: readonly TrunkItemView[]): TrunkItemView[] {
  const byKey = new Map<string, TrunkItemView>()
  for (const it of items) if (!byKey.has(it.key)) byKey.set(it.key, it)
  const head: TrunkItemView[] = []
  for (const key of TRUNK_ORDER) {
    const it = byKey.get(key)
    if (it !== undefined) {
      head.push(it)
      byKey.delete(key)
    }
  }
  return [...head, ...byKey.values()]
}

/* ────────────────────────────────────────────────────────────── 片段渲染 */

/** 证据指针（**不可点**的文本 chip）。 */
function evidenceChips(paths: readonly string[]): string {
  return paths.map(p => '<span class="dsh-pm-evidence" data-evidence="' + esc(p) + '"'
    + ' title="证据指针（可核验处）：' + esc(p) + '">' + esc(p) + '</span>').join('')
}

/**
 * 「点开原文」入口。
 *
 * 只给**有 `path` 的**入口发 `data-open-doc`（点击由 board-mount 委托 → `ctx.openDoc(path)`）；
 * 像「改动文件清单（执行记录）」「人工门往返留痕（台账评论）」这类没有原文文件的入口，
 * 渲染成**不可点**的说明块——画成按钮却点了没反应，比不可点更坏。
 */
function openRefNodes(refs: readonly TrunkRef[]): string {
  if (refs.length === 0) return ''
  const nodes = refs.map(r => {
    const raw = strOf(r.doc)
    const docHint = raw.length > 0 ? '（文档里的标题：' + raw + '）' : ''
    if (r.path !== undefined && r.path.length > 0) {
      return '<button type="button" class="dsh-pm-trunk-open" data-open-doc="' + esc(r.path) + '"'
        + ' title="' + esc('点开原文：' + r.path + docHint) + '">' + esc(r.label) + '</button>'
    }
    return '<span class="dsh-pm-trunk-open is-nopath"'
      + ' title="该入口指向留痕 / 台账，没有可打开的原文文件">' + esc(r.label) + '</span>'
  }).join('')
  return '<div class="dsh-pm-trunk-openrefs" data-open-refs="1">' + nodes + '</div>'
}

/** 摘要行：**每行一个节点**（FR-1 的"2~4 行"要数得出来，也便于逐行断言）。 */
function summaryLines(lines: readonly string[]): string {
  return lines.map(line => '<p class="dsh-pm-trunk-line" data-summary-line="1">' + esc(line) + '</p>').join('')
}

/** a 类：自动事实（可计算、永远为真）。没有就不出这一组，**不写 0**（未采集 ≠ 零）。 */
function factsGroup(facts: readonly TrunkFactView[]): string {
  const head = '<div class="dsh-pm-trunk-hl-h">自动事实（可计算，永远为真）</div>'
  if (facts.length === 0) {
    return '<div class="dsh-pm-trunk-hl-group" data-hl-group="facts">' + head
      + '<div class="dsh-pm-trunk-mut" data-fact-none="1">尚无自动事实：还没有执行记录（未采集，不冒充零）</div></div>'
  }
  const rows = facts.map(f => '<div class="dsh-pm-fact" data-fact="1">'
    + '<span class="dsh-pm-fact-label">' + esc(f.label) + '</span>'
    + '<b class="dsh-pm-fact-value">' + esc(f.value) + '</b>'
    + (f.evidence.length > 0
      ? '<span class="dsh-pm-fact-evid"><span class="dsh-pm-trunk-mut">证据：</span>' + evidenceChips(f.evidence) + '</span>'
      : '<span class="dsh-pm-trunk-mut" title="这条自动事实没有给证据指针">无证据指针</span>')
    + '</div>').join('')
  return '<div class="dsh-pm-trunk-hl-group" data-hl-group="facts">' + head + rows + '</div>'
}

/** b 类：**带证据**的人写差异——正常展示（差异点 + 为什么 + 证据指针，三件齐全）。 */
function writtenGroup(highlights: readonly TrunkHighlightView[]): string {
  const head = '<div class="dsh-pm-trunk-hl-h">需要判断的差异（人写，每条必须带证据指针）</div>'
  if (highlights.length === 0) {
    return '<div class="dsh-pm-trunk-hl-group" data-hl-group="written">' + head
      + '<div class="dsh-pm-trunk-mut" data-hl-none="1">未见带证据的人写差异（文档该节未写，不是零条）</div></div>'
  }
  const cards = highlights.map(h => '<div class="dsh-pm-hl" data-hl="with-evidence">'
    + '<div class="dsh-pm-hl-diff">差异：' + esc(h.diff.length > 0 ? h.diff : '（未写差异点）') + '</div>'
    + '<div class="dsh-pm-hl-why">为什么：' + esc(h.why.length > 0 ? h.why : '（未写为什么）') + '</div>'
    + '<div class="dsh-pm-hl-evid"><span class="dsh-pm-trunk-mut">证据：</span>' + evidenceChips(h.evidence) + '</div>'
    + '</div>').join('')
  return '<div class="dsh-pm-trunk-hl-group" data-hl-group="written">' + head
    + '<div class="dsh-pm-hl-list" data-hl-list="with-evidence">' + cards + '</div></div>'
}

/**
 * b 类反例：**`evidence` 为空数组**的条目——反应付机制要挡的就是它。
 *
 * 三条硬约束（别改）：① 打 `data-evid="no"`；② 文案含「未提供证据（不计入亮点）」；
 * ③ **不共容器、不共样式**——它进的是 `data-hl-group="no-evidence"`（带证据的那堆在
 * `data-hl-group="written"`），也不带正常亮点的 class。混一处，机械反例断言就会失效，
 * 而失效的方式正是"看起来像条正经亮点"。
 */
function noEvidenceGroup(highlights: readonly TrunkHighlightView[]): string {
  if (highlights.length === 0) return ''
  const cards = highlights.map(h => '<div class="dsh-pm-hl-missing" data-evid="no" data-hl="no-evidence">'
    + '<div class="dsh-pm-hl-diff">差异：' + esc(h.diff.length > 0 ? h.diff : '（未写差异点）') + '</div>'
    + (h.why.length > 0 ? '<div class="dsh-pm-hl-why">为什么：' + esc(h.why) + '</div>' : '')
    + '<div class="dsh-pm-hl-evid">'
    + '<span class="dsh-pm-evidence-missing">未提供证据（不计入亮点）</span>'
    + '<span class="dsh-pm-trunk-mut">补指针的方式：指向改动文件 / 测试用例 / 评审记录或台账留痕</span>'
    + '</div></div>').join('')
  return '<div class="dsh-pm-trunk-hl-group dsh-pm-trunk-hl-unpay" data-hl-group="no-evidence" data-hl-list="no-evidence">'
    + '<div class="dsh-pm-trunk-hl-h">以下条目不进入亮点（反应付机制：指不出证据）</div>'
    + cards + '</div>'
}

/** 成果清单：逐条列出，**条数与服务端数组一致**（不截断、不合并、不折叠）。 */
function achievementGroup(files: readonly string[]): string {
  const head = '<div class="dsh-pm-trunk-hl-h">成果清单（自动汇总：本次实际改动的文件）</div>'
  if (files.length === 0) {
    return '<div class="dsh-pm-trunk-hl-group" data-hl-group="achievement">' + head
      + '<div class="dsh-pm-trunk-mut" data-achievement-none="1">无改动记录（未采集，不冒充零）</div></div>'
  }
  const rows = files.map(f => '<li class="dsh-pm-trunk-ach" data-achievement="1">'
    + '<span class="dsh-pm-trunk-ach-path">' + esc(f) + '</span></li>').join('')
  return '<div class="dsh-pm-trunk-hl-group" data-hl-group="achievement">' + head
    + '<ul class="dsh-pm-trunk-ach-list" data-achievement-list="1">' + rows + '</ul></div>'
}

/** 亮点条的三块附加内容（仅 key=highlight 有；其余条目不渲染这些组）。 */
function highlightExtras(item: TrunkItemView): string {
  const withEvid = item.highlights.filter(h => h.evidence.length > 0)
  const noEvid = item.highlights.filter(h => h.evidence.length === 0)
  return factsGroup(item.facts) + writtenGroup(withEvid) + noEvidenceGroup(noEvid) + achievementGroup(item.achievement)
}

/* ────────────────────────────────────────────────────────────── 一条 */

function itemHtml(item: TrunkItemView): string {
  const known = (TRUNK_ORDER as readonly string[]).includes(item.key)
  const meta = known
    ? TRUNK_META[item.key as TrunkKey]
    : { label: '未登记的主干条：' + item.key, sub: '服务端给了七条之外的 key——照实渲染，不丢内容' }

  const scopeHint = item.key === 'scope'
    // 「范围边界」要一眼看出是"明确不做什么"（FR-1）：这一行是页面的承诺，不是文档里的话。
    ? '<div class="dsh-pm-trunk-scope-hint" data-scope-not="1">明确不做什么：以下为文档「边界」节原文</div>'
    : ''

  const head = '<div class="dsh-pm-trunk-head">'
    + '<h3 class="dsh-pm-trunk-title">' + esc(meta.label) + '</h3>'
    + (meta.sub.length > 0 ? '<span class="dsh-pm-trunk-sub">' + esc(meta.sub) + '</span>' : '')
    + sourceTags(item.source)
    + '</div>'

  const lines = summaryLines(item.summary)
  // 缺节：照实说「文档未提供该节」（FR-1/FR-14/FR-12），**不留白、不编**。
  const missing = item.missing
    ? '<div class="dsh-pm-trunk-missing" data-missing="doc-section-missing">文档未提供该节（不编、不留白）</div>'
    : ''
  // 既没摘要也没标缺节：这是服务端自相矛盾的形状，照实说"没内容"，而不是渲染成空白。
  const blank = !item.missing && item.summary.length === 0
    ? '<div class="dsh-pm-trunk-missing" data-summary-none="1">本节无内容（服务端未给出摘要）</div>'
    : ''

  const extras = item.key === 'highlight' ? highlightExtras(item) : ''
  const body = '<div class="dsh-pm-trunk-body">' + scopeHint + lines + missing + blank + extras
    + openRefNodes(item.openRefs) + '</div>'

  return '<section class="dsh-pm-trunk-item" data-trunk-item="' + esc(item.key) + '">' + head + body + '</section>'
}

/* ────────────────────────────────────────────────────────────── 整块 */

/** 汇报面板主体（导出给测试与将来可能的复用：纯函数、无副作用）。 */
export function renderTrunkPanel(data: unknown): string {
  const view = readTrunk(data)
  const root = (inner: string): string => '<div class="dsh-pm-trunk" data-panel="trunk" data-trunk-root="1">' + inner + '</div>'

  if (view === undefined) {
    return root('<div class="dsh-pm-empty" data-trunk-shape="bad">'
      + '汇报数据未就绪（载荷不是主干形状）：不编内容，请重试</div>')
  }
  if (view.items.length === 0) {
    return root('<div class="dsh-pm-empty" data-trunk-empty="1">服务端未返回任何主干条目（不编内容）</div>')
  }

  // 「文档最后更新于…」：让人知道读到的是哪一版（FR-1 的"点开回原文"要以版本为前提）。取不到就不说。
  const stamp = view.docLastUpdated === undefined
    ? ''
    : '<div class="dsh-pm-trunk-docmeta" data-doc-updated="1">文档最后更新于 '
      + esc(fmtTime(view.docLastUpdated)) + '</div>'

  return root(stamp + orderedItems(view.items).map(itemHtml).join(''))
}

/**
 * 汇报 Tab 的注册项。**导出名 / key / label 是壳体契约的一部分，不得改**——
 * 改了 `report-tabs.ts` 的 import 会静默失配（tsdown 不做类型检查，名字错也照样出包）。
 */
export const trunkPanel: ReportTabDef = {
  key: 'trunk',
  label: '汇报',
  // 角标数字必须来自首屏 report 快照（不前端遍历）。ReportResponse 目前**没有**按 Tab 的计数
  // → 返回 undefined = 不显示角标，绝不用前端推算的数字冒充服务端计数（T-8）。
  badge: () => undefined,
  // `_ctx` 不参与渲染：点击入口只产出 `data-open-doc`，由 board-mount 委托到 `ctx.openDoc(path)`；
  // 渲染保持无副作用，测试才能只对字符串断言。
  render: (data: unknown, _ctx: ReportTabCtx): string => renderTrunkPanel(data),
}
