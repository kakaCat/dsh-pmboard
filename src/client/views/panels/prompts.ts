/**
 * 「提示词」Tab 面板（REQ-261004222448-292a · FR-9 / t-702b00）——回答三句话：
 *   A **它被告知了什么**：本次固定系统提示词逐段列名 + 字符 + 正文（被裁片段也给正文，
 *     用来回答「它为什么不知道某个术语」）；装配服务不可得时说「装配服务不可得」，**不是「零段」**。
 *   B **这些话有没有真的进会话**：注入留痕的来源（闸门 / 节点 / 轮次 / 系统提示词装配 / 未知）
 *     与**后果**（已投递进会话 / 只留痕未投递 / 投递不可知——`delivered:null` **绝不默认成投递成功**）、
 *     命中片段、字符数、被裁片段、正文（`text` 超限时标「已截断」）。
 *   C **它在什么上下文里说的**：压缩次数、策略、节点隔离留痕（替换 / 跳过 / 拒绝）、输入包大小；
 *     采集口未装配 → 「未采集」，**不显示 0**。
 *   另加 **规定 vs 实际对照**：把「本次装配的段清单」与「实际注入留痕的片段」并排，让人自己看出差在哪。
 *
 * 数据全部来自 `GET /requirements/:id/prompts`（三段合一）；本面板**不取数、不写、不碰 DOM**，
 * 载荷是 `unknown`，逐字段判型——服务端换了形状也不会把页面渲染成「零」。
 *
 * 纪律：
 *   · 正文一律**整段铺开**：产物里不写 `overflow: auto|scroll`（限高滚动条会把"到底说了什么"藏起来，
 *     FR-11 #7）；长了由外层 `<details>` 收起，用页面滚动读。
 *   · 缺失语义三分：未采集 / 不可得 / 确实没有——各有各的说辞，禁 0 冒充、禁留白。
 *
 * 为什么「规定 vs 实际」在这里只做**清单对照**、不做 ✅/⬜ 判定：那套判定（`renderProcessFold` +
 * `evaluateActions`）要的是**节点详情**（`StageDetail`：artifacts / timeline / tasks），
 * 而 `/prompts` 响应里没有这些字段。拿空 StageDetail 去喂它，会把每条动作算成「⬜ 未见记录」——
 * 那不是"照实说"，那是用缺数据伪造否定结论。判定归节点详情（DAG Tab），本 Tab 只并排清单。
 *
 * @module dsh-pmboard/client/views/panels/prompts
 */
import { esc } from '../../html.js'
import { mdInline } from '../../render/md-inline.js'
import { fmtTime } from '../../render/dom-utils.js'
import { displayDocPath } from '../../open-doc.js'
import { resolveFragmentRef } from '../../node-panel-process.js'
import type { ReportTabDef } from '../report-tabs.js'

/* ──────────────────────────────────────────────────────── 宽形状（载荷是 unknown） */

interface SectionView { id: string; kind: 'file' | 'shell' | 'unknown'; chars?: number; text?: string }
interface TrimmedView { id: string; chars: number; text?: string }
interface InjectionView {
  at?: number
  windowKey?: string
  origin: 'gate-h3' | 'dive-node' | 'dive-round' | 'system-prompt' | 'unknown'
  /** 三值：true=真投递 / false=只留痕 / unknown=旧条目不可知 */
  delivered: 'true' | 'false' | 'unknown'
  routeKey?: string
  fragmentIds: string[]
  charCount?: number
  trimmed: string[]
  text?: string
  truncated: boolean
}
interface IsolationView { at?: number; stage: string; status: string; packageChars?: number; reason: string }
interface ContextView {
  provided: boolean
  available: boolean
  medianUsagePct?: number
  compressions?: number
  policy: string[]
  isolations: IsolationView[]
}
interface PromptsView {
  systemProvided: boolean
  systemAvailable: boolean
  routeKey?: string
  hitLevel?: string
  perTurnChars?: number
  perTurnEstTokens?: number
  sections: SectionView[]
  trimmed: TrimmedView[]
  injectionsProvided: boolean
  injections: InjectionView[]
  context: ContextView
}

/* ──────────────────────────────────────────────────────── 小工具 */

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function readNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function readStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function readStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 正文块的统一外壳：**没有 max-height、没有 overflow**——整段铺开（FR-11 #7）。
 *  外观按原型 `pre.prompt-text` 的口径内联（12px 内边距 / 11.5px 等宽 / 1.6 行距 / 极浅底 + 细边 + 6px 圆角）：
 *  这里内联而不只靠分片，是因为**同一份正文块**在非报告页（节点面板）也会出现；
 *  底色与边框一律走变量，暗色主题下不会闪成白底。 */
const PRE_STYLE = 'white-space:pre-wrap;word-break:break-word;margin:0;padding:12px;'
  + 'border:1px solid var(--pm-line-soft, rgba(128,128,128,.11));border-radius:6px;'
  + 'background:var(--pm-bg-softer, rgba(128,128,128,.028));color:inherit;'
  + 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.6'

function preBlock(text: string, attrs = ''): string {
  return '<pre class="dsh-pm-prompt-pre"' + attrs + ' style="' + PRE_STYLE + '">' + esc(text) + '</pre>'
}

/**
 * 片段文件的工作区相对路径。
 *
 * 前缀与 `node-panel-process.ts` 的 `fragmentDocPath` **同一条规则**（那个函数没导出，故此处复刻；
 * 两处若哪天漂移，「点开源文件」会 404 —— 收口办法是把它从 node-panel-process 导出后共用）。
 */
function fragmentDocPath(id: string): string {
  return 'packages/web/dsh-pmboard/src/domain/prompt/fragments/' + id + '.md'
}

/** 来源词（`unknown` = 旧条目缺字段，页面必须说「来源未知」而不是猜一个来源）。 */
const ORIGIN_LABEL: Record<string, string> = {
  'gate-h3': '闸门 H3',
  'dive-node': 'Dive 节点结算',
  'dive-round': 'Dive 轮次投递',
  'system-prompt': '系统提示词装配',
  'unknown': '来源未知',
}

function readOrigin(v: unknown): InjectionView['origin'] {
  const s = readStr(v)
  return s === 'gate-h3' || s === 'dive-node' || s === 'dive-round' || s === 'system-prompt' ? s : 'unknown'
}

/**
 * 后果三态。`null` / 缺字段 / 不是布尔 → `unknown`：
 * 「没说投了」与「投了」是两件事，把它们合并就是 FR-9 判定里那条反例。
 */
function readDelivered(v: unknown): InjectionView['delivered'] {
  if (v === true) return 'true'
  if (v === false) return 'false'
  return 'unknown'
}

/** 后果文案（`unknown` 里刻意不出现「已投递」三字：页面不得把不可知读成投递成功）。 */
function deliveredLabel(d: InjectionView['delivered']): string {
  if (d === 'true') return '已投递进会话'
  if (d === 'false') return '只留痕，未投递'
  return '投递不可知（旧条目缺该字段，不当作投递成功）'
}

/** 隔离留痕状态词（替换 / 跳过 / 拒绝 / 回退）；未知状态原样显示，不编。 */
const ISO_LABEL: Record<string, string> = {
  replaced: '替换', skipped: '跳过', rejected: '拒绝', fallback: '回退',
}

/* ──────────────────────────────────────────────────────── 归一化 */

function readSections(raw: unknown): SectionView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const o = asRecord(item)
    const id = readStr(o?.id)
    if (id === undefined || id.length === 0) return []
    const kindRaw = readStr(o?.kind)
    const kind: SectionView['kind'] = kindRaw === 'file' || kindRaw === 'shell' ? kindRaw : 'unknown'
    const text = readStr(o?.text)
    const chars = readNum(o?.chars) ?? (text === undefined ? undefined : text.length)
    return [{ id, kind, ...(chars === undefined ? {} : { chars }), ...(text === undefined ? {} : { text }) }]
  })
}

function readTrimmed(raw: unknown): TrimmedView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    // 历史形状：`trimmed: string[]`（只有 id）——认得出就认，认不出不编。
    if (typeof item === 'string') return item.length === 0 ? [] : [{ id: item, chars: 0 }]
    const o = asRecord(item)
    const id = readStr(o?.id) ?? readStr(o?.name)
    if (id === undefined || id.length === 0) return []
    const text = readStr(o?.text)
    const chars = readNum(o?.chars) ?? (text === undefined ? 0 : text.length)
    return [{ id, chars, ...(text === undefined ? {} : { text }) }]
  })
}

function readInjections(raw: unknown): InjectionView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const o = asRecord(item)
    if (o === undefined) return []
    const text = readStr(o.text)
    return [{
      ...(readNum(o.at) === undefined ? {} : { at: readNum(o.at) }),
      ...(readStr(o.windowKey) === undefined ? {} : { windowKey: readStr(o.windowKey) }),
      origin: readOrigin(o.origin),
      delivered: readDelivered(o.delivered),
      ...(readStr(o.routeKey) === undefined ? {} : { routeKey: readStr(o.routeKey) }),
      fragmentIds: readStrings(o.fragmentIds),
      ...(readNum(o.charCount) === undefined ? {} : { charCount: readNum(o.charCount) }),
      trimmed: readStrings(o.trimmed),
      ...(text === undefined ? {} : { text }),
      truncated: o.truncated === true,
    }]
  })
}

function readIsolations(raw: unknown): IsolationView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const o = asRecord(item)
    if (o === undefined) return []
    return [{
      ...(readNum(o.at) === undefined ? {} : { at: readNum(o.at) }),
      stage: readStr(o.stage) ?? '',
      status: readStr(o.status) ?? '',
      ...(readNum(o.packageChars) === undefined ? {} : { packageChars: readNum(o.packageChars) }),
      reason: readStr(o.reason) ?? '',
    }]
  })
}

/**
 * 载荷 → 视图。三个段**一个都不认得**（如需求页壳的桩载荷）→ `undefined`，
 * 由调用方渲染「形状不识别」，而不是把空数组说成「零条留痕」。
 */
function toView(data: unknown): PromptsView | undefined {
  const o = asRecord(data)
  if (o === undefined) return undefined
  const sys = asRecord(o.system)
  const injRaw = o.injections
  const injProvided = Array.isArray(injRaw)
  const ctx = asRecord(o.context)
  if (sys === undefined && !injProvided && ctx === undefined) return undefined

  const sections = readSections(sys?.sections)
  const trimmed = readTrimmed(sys?.trimmed)
  const isolations = readIsolations(ctx?.isolations)
  return {
    systemProvided: sys !== undefined,
    // `unavailable === true` 或**连 system 段都没有**都算不可得：两种都拿不到段清单，页面说辞相同。
    systemAvailable: sys !== undefined && sys.unavailable !== true,
    ...(readStr(sys?.routeKey) === undefined ? {} : { routeKey: readStr(sys?.routeKey) }),
    ...(readStr(sys?.hitLevel) === undefined ? {} : { hitLevel: readStr(sys?.hitLevel) }),
    ...(readNum(sys?.perTurnChars) === undefined ? {} : { perTurnChars: readNum(sys?.perTurnChars) }),
    ...(readNum(sys?.perTurnEstTokens) === undefined ? {} : { perTurnEstTokens: readNum(sys?.perTurnEstTokens) }),
    sections,
    trimmed,
    injectionsProvided: injProvided,
    injections: readInjections(injRaw),
    context: {
      provided: ctx !== undefined,
      available: ctx !== undefined && ctx.available === true,
      ...(readNum(ctx?.medianUsagePct) === undefined ? {} : { medianUsagePct: readNum(ctx?.medianUsagePct) }),
      ...(readNum(ctx?.compressions) === undefined ? {} : { compressions: readNum(ctx?.compressions) }),
      policy: readStrings(ctx?.policy),
      isolations,
    },
  }
}

/* ──────────────────────────────────────────────────────── A · 固定系统提示词 */

function renderSection(section: SectionView): string {
  const meta = [
    section.kind === 'file' ? '有独立源文件' : (section.kind === 'shell' ? '路由壳（多片合成）' : '来源形状未标'),
    section.chars === undefined ? '字符数未给' : section.chars + ' 字符',
  ].join(' · ')
  const body = section.text !== undefined && section.text.length > 0
    ? preBlock(section.text)
    : '<div class="dsh-pm-note" data-prompt-empty-body="1">该段未提供正文（响应里没有 text——不编）。</div>'
  return '<details class="dsh-pm-prompt" data-prompt-section="' + esc(section.id) + '" open>'
    + '<summary><span class="dsh-pm-prompt-name">' + esc(section.id) + '</span>'
    + '<span class="dsh-pm-prompt-meta">' + esc(meta) + '</span></summary>' + body + '</details>'
}

function renderTrimmed(item: TrimmedView): string {
  const body = item.text !== undefined && item.text.length > 0
    ? preBlock(item.text)
    : '<div class="dsh-pm-note" data-prompt-empty-body="1">该被裁片段未提供正文（响应里没有 text——不编）。</div>'
  return '<details class="dsh-pm-prompt" data-prompt-trimmed="' + esc(item.id) + '" open>'
    + '<summary><span class="dsh-pm-prompt-name">被裁：' + esc(item.id) + '</span>'
    + '<span class="dsh-pm-prompt-meta">超预算，未进本次装配 · ' + esc(String(item.chars)) + ' 字符</span></summary>'
    + body + '</details>'
}

function renderSystemSection(view: PromptsView): string {
  const head = '<h4 class="dsh-pm-pp-h">🧱 A · 固定系统提示词'
    + '<span class="dsh-pm-pp-h-note">回答「它到底被告知了什么」</span></h4>'
  if (!view.systemAvailable) {
    return '<section class="dsh-pm-pp-sec">' + head
      + '<div class="dsh-pm-empty" data-system-unavailable="1">装配服务不可得：本次没有取到系统提示词'
      + '（不是「零段」——读不到与确实没有是两件事）。</div></section>'
  }
  const chars = view.perTurnChars ?? view.sections.reduce((n, s) => n + (s.chars ?? 0), 0)
  const metaBits = [
    '本次装配 ' + String(view.sections.length) + ' 段',
    '被裁 ' + String(view.trimmed.length) + ' 段',
    '合计 ' + String(chars) + ' 字符',
  ]
  if (view.perTurnEstTokens !== undefined) metaBits.push('≈ ' + String(view.perTurnEstTokens) + ' tokens（估算）')
  if (view.routeKey !== undefined) metaBits.push('routeKey ' + view.routeKey)
  if (view.hitLevel !== undefined) metaBits.push('命中层级 ' + view.hitLevel)
  const sections = view.sections.map(renderSection).join('')
  const trimmed = view.trimmed.map(renderTrimmed).join('')
  const mergedText = [
    ...view.sections.filter(s => (s.text ?? '').length > 0).map(s => '── ' + s.id + ' ──\n' + (s.text ?? '')),
    ...view.trimmed.filter(t => (t.text ?? '').length > 0).map(t => '── ' + t.id + '（被裁，不在本次装配里）──\n' + (t.text ?? '')),
  ].join('\n\n')
  const merged = mergedText.length > 0
    ? '<details class="dsh-pm-prompt" data-prompt-merged="1" open>'
      + '<summary><span class="dsh-pm-prompt-name">本次完整系统提示词（' + String(view.sections.length) + ' 段合并）</span>'
      + '<span class="dsh-pm-prompt-meta">' + esc(String(chars)) + ' 字符 · 整段铺开</span></summary>'
      + preBlock(mergedText)
      + '<div class="dsh-pm-note">「── 段名 ──」的分隔行是<b>本页加的</b>，不在提示词正文里；'
      + '被裁片段单独标出（它们<b>没有</b>进本次装配）。</div></details>'
    : ''
  return '<section class="dsh-pm-pp-sec">' + head
    + '<div class="dsh-pm-note">' + esc(metaBits.join(' · ')) + '（字符数与 token 数是读时装配/估算，不是留痕）</div>'
    + sections + trimmed + merged + '</section>'
}

/* ──────────────────────────────────────────────────────── 规定 vs 实际（清单对照） */

/**
 * 片段胶囊：有独立文件的给「点开源文件」，路由壳给文字（无独立文件可开）。
 *
 * 可点开的路径**只**产出 `data-open-doc`（**故意不带** `data-action`）：这条链由壳的
 * `ReportTabsController.attach`（`[data-open-doc]` → `ctx.openDoc(path)`）接，且**只能有一处接**
 * ——再带一个 `data-action="open-doc"` 会让 board-mount 也接一条，点一下开两次。
 */
function fragmentChip(id: string): string {
  if (id.length === 0) return ''
  const ref = resolveFragmentRef(id)
  if (ref.kind === 'shell') {
    return '<span class="dsh-pm-np-shell" data-fragment="' + esc(id) + '" title="路由壳：按难度/类型拼装的合成片段，无独立文件">'
      + esc(id) + '（路由壳）</span>'
  }
  const path = fragmentDocPath(id)
  return '<button type="button" class="dsh-pm-np-doc" data-fragment="' + esc(id) + '"'
    + ' data-open-doc="' + esc(path) + '" title="' + esc(displayDocPath(path)) + '">' + esc(id) + '</button>'
}

function renderSpecVsActual(view: PromptsView): string {
  const prescribed = view.sections.map(s => s.id)
  const specList = prescribed.map(id => '<li data-spec-section="' + esc(id) + '"><code>' + esc(id) + '</code></li>').join('')
    + view.trimmed.map(t => '<li data-spec-trimmed="' + esc(t.id) + '" class="dsh-pm-sv-trimmed">被裁：<code>'
      + esc(t.id) + '</code>（' + esc(String(t.chars)) + ' 字符，未进装配）</li>').join('')
  const specCol = '<div class="dsh-pm-sv-col" data-sv="spec">'
    + '<div class="dsh-pm-sv-h">规定：本次装配的段清单</div>'
    + (specList.length > 0 ? '<ul class="dsh-pm-sv-list">' + specList + '</ul>'
      : '<div class="dsh-pm-empty">没有段清单可比（本响应没有 system.sections）</div>')
    + '</div>'

  const latest = view.injections.slice().sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]
  let actualCol: string
  if (latest === undefined) {
    actualCol = '<div class="dsh-pm-sv-col" data-sv="actual"><div class="dsh-pm-sv-h">实际：注入留痕（最近一条）</div>'
      + '<div class="dsh-pm-empty" data-sv-diff="1">没有注入留痕可比（未采集 / 端口未装配）——'
      + '因此无法说明「规定的」有没有真的进会话。</div></div>'
  } else {
    const metaBits = [
      latest.routeKey === undefined ? 'routeKey 未给' : 'routeKey ' + latest.routeKey,
      '来源 ' + (ORIGIN_LABEL[latest.origin] ?? latest.origin),
      '后果 ' + deliveredLabel(latest.delivered),
      latest.charCount === undefined ? '字符数未给' : latest.charCount + ' 字符',
    ]
    const onlySpec = prescribed.filter(id => !latest.fragmentIds.includes(id))
    const onlyActual = latest.fragmentIds.filter(id => !prescribed.includes(id))
    const both = prescribed.filter(id => latest.fragmentIds.includes(id))
    const diffs = '<div class="dsh-pm-sv-diff" data-sv-diff="1">'
      + '<div>两边都有：' + (both.length === 0 ? '—' : esc(both.join('、'))) + '</div>'
      + '<div>规定有 · 留痕未见：' + (onlySpec.length === 0 ? '—' : esc(onlySpec.join('、'))) + '</div>'
      + '<div>留痕有 · 规定清单未见：' + (onlyActual.length === 0 ? '—' : esc(onlyActual.join('、'))) + '</div>'
      + '<div class="dsh-pm-note">差集按 <b>id 字面</b> 比对：装配段名与片段 id 的命名口径可能不同，'
      + '所以「留痕未见」不等于「规定没落地」——落地与否看后果（B 段）。</div></div>'
    actualCol = '<div class="dsh-pm-sv-col" data-sv="actual"><div class="dsh-pm-sv-h">实际：注入留痕（最近一条）</div>'
      + '<div class="dsh-pm-note">' + esc(metaBits.join(' · ')) + '</div>'
      + '<div class="dsh-pm-sv-frags">' + (latest.fragmentIds.length === 0 ? '命中片段未给' : latest.fragmentIds.map(fragmentChip).join(' · ')) + '</div>'
      + (latest.trimmed.length > 0 ? '<div class="dsh-pm-note">被裁片段：' + esc(latest.trimmed.join('、')) + '</div>' : '')
      + diffs + '</div>'
  }
  return '<section class="dsh-pm-pp-sec"><h4 class="dsh-pm-pp-h">🔍 规定 vs 实际'
    + '<span class="dsh-pm-pp-h-note">清单并排；不替读者下「落地/没落地」的结论</span></h4>'
    + '<div class="dsh-pm-specvs" data-prompt-spec-vs="1">' + specCol + actualCol + '</div></section>'
}

/* ──────────────────────────────────────────────────────── B · 注入留痕 */

function renderInjection(rec: InjectionView): string {
  const metaBits = [
    rec.at === undefined ? '时间未给' : fmtTime(rec.at),
    '来源：' + (ORIGIN_LABEL[rec.origin] ?? rec.origin),
    rec.windowKey === undefined ? '窗口未给' : '窗口：' + rec.windowKey,
  ]
  const verdict = deliveredLabel(rec.delivered)
  const body = rec.text !== undefined && rec.text.length > 0
    ? '<details class="dsh-pm-inj-body"><summary>正文（点开看这次到底说了什么）</summary>'
      + preBlock(rec.text, rec.truncated ? ' data-truncated="1"' : '')
      + (rec.truncated ? '<div class="dsh-pm-note" data-inj-truncated-note="1">已截断：留痕正文超上限，这里显示的是前一段（不是完整正文）。</div>' : '')
      + '</details>'
    : '<div class="dsh-pm-note" data-inj-no-text="1">本次留痕未带正文（采集缺口）——不编。</div>'
  // 类名沿用 node-panel-process 那一套（`dsh-pm-np-inj-*`）：同一块信息在两个入口长一样，
  // 也直接吃到既有样式（`styles/node-panel.ts`），不必再造一套 CSS。
  return '<div class="dsh-pm-inj dsh-pm-np-inj-entry" data-injection="1" data-origin="' + esc(rec.origin)
    + '" data-delivered="' + esc(rec.delivered) + '">'
    + '<div class="dsh-pm-inj-meta dsh-pm-np-inj-meta">' + esc(metaBits.join(' · ')) + '</div>'
    + '<div class="dsh-pm-inj-verdict" data-inj-verdict="1">后果：' + esc(verdict) + '</div>'
    + '<div class="dsh-pm-inj-line">命中片段：</div>'
    + '<div class="dsh-pm-np-inj-frags">'
    + (rec.fragmentIds.length === 0 ? '未给' : rec.fragmentIds.map(fragmentChip).join(' · ')) + '</div>'
    + '<div class="dsh-pm-inj-line">字符数：' + (rec.charCount === undefined ? '未给' : esc(String(rec.charCount))) + '</div>'
    + '<div class="dsh-pm-inj-line">被裁片段：' + (rec.trimmed.length === 0 ? '—' : esc(rec.trimmed.join('、'))) + '</div>'
    + body + '</div>'
}

function renderInjectionSection(view: PromptsView): string {
  const head = '<h4 class="dsh-pm-pp-h">💉 B · 注入留痕'
    + '<span class="dsh-pm-pp-h-note">来源 + 后果：留了痕不等于进了会话</span></h4>'
  if (!view.injectionsProvided) {
    return '<section class="dsh-pm-pp-sec">' + head
      + '<div class="dsh-pm-empty" data-injections-unavailable="1">本次响应没有注入留痕段（服务端未给）——'
      + '不写成「零条」，读不到与确实没有是两件事。</div></section>'
  }
  if (view.injections.length === 0) {
    // 空数组 ≠ 读不到：读失败由服务端回 Degrade 信封（壳会渲染降级条），能走到这里说明**真的查过了**。
    // 但"查过且为空"仍有两种成因（确实没注入过 / 留痕未装配、需求早于该功能），本条数据分不出来
    // ——所以不写成「零次注入」这种像统计的写法（FR-12：未采集与确实没有要分开说）。
    return '<section class="dsh-pm-pp-sec">' + head
      + '<div class="dsh-pm-empty" data-injections-empty="1">本需求窗口没有注入留痕记录'
      + '（留痕文件里没有匹配本需求窗口的条目）。这可能是「确实没注入过」，'
      + '也可能是「留痕未装配 / 需求早于该功能」——本条数据分不出来，故不写成「零次注入」。</div></section>'
  }
  const rows = view.injections.slice().sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).map(renderInjection).join('')
  return '<section class="dsh-pm-pp-sec">' + head + rows + '</section>'
}

/* ──────────────────────────────────────────────────────── C · 上下文 */

function renderContextSection(view: PromptsView): string {
  const head = '<h4 class="dsh-pm-pp-h">🗜️ C · 上下文'
    + '<span class="dsh-pm-pp-h-note">压缩 / 策略 / 节点隔离留痕</span></h4>'
  if (!view.context.available) {
    const why = view.context.provided ? '上下文隔离留痕端口未装配' : '响应里没有 context 段'
    return '<section class="dsh-pm-pp-sec">' + head
      + '<div class="dsh-pm-empty" data-context-unavailable="1">未采集：' + esc(why)
      + '（不是「压缩零次」——采集不到与确实没有是两件事）。</div></section>'
  }
  const counts = new Map<string, number>()
  for (const iso of view.context.isolations) counts.set(iso.status, (counts.get(iso.status) ?? 0) + 1)
  const countText = counts.size === 0
    ? '—'
    : [...counts.entries()].map(([s, n]) => (ISO_LABEL[s] ?? s) + ' ' + String(n)).join(' / ')
  const bits: string[] = []
  if (view.context.medianUsagePct !== undefined) bits.push('上文中位 ' + String(view.context.medianUsagePct) + '%')
  if (view.context.compressions !== undefined) bits.push('压缩 ' + String(view.context.compressions) + ' 次')
  bits.push('节点隔离 ' + String(view.context.isolations.length) + ' 次（' + countText + '）')
  if (view.context.policy.length > 0) bits.push('策略：' + view.context.policy.join('、'))
  const rows = view.context.isolations.length === 0
    ? '<div class="dsh-pm-empty">尚无隔离留痕（该窗口没发生过节点隔离）</div>'
    // 类名沿用 node-panel-process 的 `dsh-pm-np-iso*`（既有样式直接可用，含 replaced/rejected 的状态色）
    : view.context.isolations.map(iso => '<div class="dsh-pm-iso dsh-pm-np-iso" data-isolation="1" data-status="' + esc(iso.status) + '">'
      + '<span class="dsh-pm-iso-status dsh-pm-np-iso-status">' + esc(ISO_LABEL[iso.status] ?? iso.status) + '</span>'
      + '<span class="dsh-pm-iso-meta dsh-pm-np-iso-meta">' + esc(iso.stage) + (iso.at === undefined ? '' : ' · ' + fmtTime(iso.at))
      + (iso.packageChars === undefined ? '' : ' · 输入包 ' + String(iso.packageChars) + ' 字符') + '</span>'
      + '<div class="dsh-pm-iso-reason dsh-pm-np-iso-reason">' + mdInline(iso.reason) + '</div></div>').join('')
  return '<section class="dsh-pm-pp-sec">' + head
    + '<div class="dsh-pm-note" data-context-available="1">' + esc(bits.join(' · ')) + '</div>'
    + rows + '</section>'
}

/* ──────────────────────────────────────────────────────── 入口 */

/** 面板正文（形状已归一化）。 */
function renderBody(view: PromptsView): string {
  return renderSystemSection(view) + renderSpecVsActual(view)
    + renderInjectionSection(view) + renderContextSection(view)
}

/**
 * 面板入口：载荷 `unknown`，先过形状守卫。
 *
 * 三段一个都不认得（如需求页壳的桩载荷）时**不假装「零条留痕」**：给一句人话，
 * 并带上 `data-panel-placeholder`（与需求页壳的桩契约同名同义：这块还没有真内容）。
 */
export function renderPromptsPanel(data: unknown): string {
  const view = toView(data)
  if (view === undefined) {
    return '<div class="dsh-pm-prompts" data-panel="prompts" data-panel-placeholder="prompts">'
      + '<div class="dsh-pm-empty">提示词载荷形状不识别（system / injections / context 三段都没有）——'
      + '不把空数组说成「零条留痕」。</div></div>'
  }
  return '<div class="dsh-pm-prompts" data-panel="prompts" style="display:flex;flex-direction:column;gap:12px">'
    + renderBody(view) + '</div>'
}

export const promptsPanel: ReportTabDef = {
  key: 'prompts',
  label: '提示词',
  // 同上：计数只认首屏快照里的服务端值；留空就不显示角标（提示词段数需要额外读留痕，首屏不为此加读）
  badge: (report) => report?.tabCounts?.prompts,
  render: (data) => renderPromptsPanel(data),
}
