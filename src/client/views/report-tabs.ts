/**
 * 需求详情页「Tab 容器 + 懒加载 + 分段」壳（REQ-261004222448-292a · FR-11 / FR-12）——纯函数 + 两个控制器。
 *
 * 这个模块是详情页重构的**地基**：后面六张 Tab 卡（t9~t14）各自只实现自己那一个
 * `panels/*.ts` 里的 `render`，靠的就是这里定死的注册契约与缓存/取数纪律。
 *
 * 四条不变量（改代码时必须保住）：
 *  ① **切到才请求**：未点过的 Tab 请求数恒为 0；首屏只发 `report` + 默认 Tab（trunk）共 2 个请求，
 *     且都不含正文（正文一律点开才取）。
 *  ② **同一时刻只渲染一个面板**：不搞"渲染全部再 CSS 隐藏"——那正是本需求要修的老病
 *     （内容一页全铺 → 慢且读不完）。
 *  ③ **同一 revision 内切回不重复请求**：内存缓存键 `reqId::tab::revision`（与设计文档同键）。
 *  ④ **一律铺开、不做内层滚动**：本模块产出的任何字符串里都不出现 `overflow: auto|scroll`——
 *     内层滚动条会藏住内容，也会让"有多少"变成不可数。
 *
 * 为什么缓存与在途要归控制器（而不是让六个面板各取各的）：请求计数、去重与失效判定只能有
 * 一处实现；分散到六个面板就是六份"各自为政的缓存 + 各自为政的失效时刻"（本仓在
 * `req-detail-store` 上已经踩过：混源失效判据 → 自持重取风暴）。
 *
 * @module dsh-pmboard/client/views/report-tabs
 */
import { esc } from '../html.js'
import type { Degrade, PanelResult, ReportHead, ReportResponse } from '../../shared/protocol.js'
import { isDegrade } from '../../shared/protocol.js'
import { buildReportHead, buildReportHeadPlaceholder, degradeText, type ReportHeadPlaceholder } from './report-head.js'
import { buildReportBand, buildReportBandPlaceholder } from './report-band.js'
// 面板的就地交互实现（页内检索）由对话面板导出；这里只做事件委派（面板模块只 import type 本模块，
// 故不构成运行时环）
import { applyDialogueSearch } from './panels/dialogue.js'
import { trunkPanel } from './panels/trunk.js'
import { docsPanel } from './panels/docs.js'
import { dagPanel } from './panels/dag.js'
import { dialoguePanel } from './panels/dialogue.js'
import { tokenPanel } from './panels/token.js'
import { promptsPanel } from './panels/prompts.js'

/* ────────────────────────────────────────────────────────────── 注册契约 */

/** 六个同级 Tab 的键。顺序即 `REPORT_TABS` 的顺序（trunk 默认选中）。 */
export type ReportTabKey = 'trunk' | 'docs' | 'dag' | 'dialogue' | 'token' | 'prompts'

/**
 * 分页/游标参数（FR-11 #6：dialogue / injections 默认 20，可取更早）。
 *
 * 为什么在契约的 `load(key)` 上加一个**可选**第二参：只给 key 时面板取不到"更早"，
 * 只能自己去 `fetch` —— 那就绕开了本模块的缓存与请求计数纪律。加可选参是**超集**：
 * t9~t14 里照原样写 `load('dialogue')` 完全成立。
 */
export interface ReportPanelParams { before?: number; limit?: number }

/** 面板上下文（面板卡只能用这三样：取数、开正文、需求 id）。 */
export interface ReportTabCtx {
  requirementId: string
  /** 该 Tab 的取数（由 api.ts 提供，测试可注入桩） */
  load: (key: ReportTabKey, params?: ReportPanelParams) => Promise<PanelResult<unknown>>
  /** 点开正文（复用现有 open-doc / `/file` 链路；**不要新造通道**） */
  openDoc: (path: string) => void
}

/** 一个 Tab 的注册项。t9~t14 **只改 render 实现**，导出名与类型不得变。 */
export interface ReportTabDef {
  key: ReportTabKey
  label: string
  /**
   * 角标关键数字（从首屏 report 快照算；返回 undefined = 不显示角标）。
   * 纪律（test-cases T-8）：数字只能来自**服务端计数**，不许前端遍历推算。
   * 当前 `ReportResponse` 没有按 Tab 的计数 → 六个桩都返回 undefined（见交付答复的契约缺口）；
   * 机制与渲染位已就绪：服务端补上计数后只改各自的 badge，不动本模块。
   */
  badge: (report: ReportResponse | undefined) => string | undefined
  /** 渲染**本面板**（纯字符串；只渲染自己，不碰其它 Tab） */
  render: (data: unknown, ctx: ReportTabCtx) => string
  /** 该 Tab 的降级文案（FR-12 三态之一）；缺省走 `degradeText` 的通用四句 */
  degraded?: (d: Degrade) => string
}

/**
 * 图标属于**壳**不属于面板：面板卡只该关心内容，改 render 时不该被迫记得带图标
 * （漏带就少一个图标，而且没人测得到）。
 */
const TAB_ICONS: Record<ReportTabKey, string> = {
  trunk: '📋', docs: '📄', dag: '🕸', dialogue: '💬', token: '🪙', prompts: '🧱',
}

/** 六个同级 Tab 的注册表（顺序：trunk 默认选中 → docs → dag → dialogue → token → prompts）。 */
export const REPORT_TABS: ReportTabDef[] = [
  trunkPanel, docsPanel, dagPanel, dialoguePanel, tokenPanel, promptsPanel,
]

/** 取注册项；未知键回落到第一个（不抛：渲染路径上的异常会整块白屏）。 */
function defOf(key: ReportTabKey): ReportTabDef {
  return REPORT_TABS.find(d => d.key === key) ?? REPORT_TABS[0]
}

/** 全部合法 Tab 键（顺序同注册表）。 */
export const REPORT_TAB_KEYS: readonly ReportTabKey[] = REPORT_TABS.map(d => d.key)

/**
 * 运行时守卫：DOM 上的 `data-tab` 是不可信输入（旧 DOM / 手改属性都会给怪值）。
 * 缺了它，`select('token' as ReportTabKey)` 这种脏值会顺着 `defOf` 的回落**静默**变成 trunk——
 * 点「Token」却看到「汇报」，而且没人发现。
 */
export function isReportTabKey(v: unknown): v is ReportTabKey {
  return typeof v === 'string' && (REPORT_TAB_KEYS as readonly string[]).includes(v)
}

/* ────────────────────────────────────────────────────────────── 形状守卫 */

/**
 * 「这是本报的数据吗」的**派发守卫**（不是严格校验器）。
 *
 * 为什么必须有它：旧服务端没有 `/report` 端点时 `fetch` 会拿到 404（→ 兜底旧详情页），
 * 但若某个中间层/桩把 200 + 无关载荷返回上来，`buildReportHead` 就会对 `undefined` 取字段，
 * 整页崩成"加载失败"。有守卫则那种形状**如实判为"端点未接线"**，由 board-mount 回落旧页。
 */
export function isReportResponse(v: unknown): v is ReportResponse {
  if (v === null || typeof v !== 'object') return false
  const r = v as Partial<ReportResponse>
  const h = r.head as Partial<ReportHead> | undefined
  return h !== null && typeof h === 'object' && typeof h.id === 'string' && typeof h.status === 'string'
    && typeof h.title === 'string'
    && r.progress !== null && typeof r.progress === 'object'
    && Array.isArray(r.gaps) && Array.isArray(r.actions)
    && typeof r.verdictLine === 'string'
}

/* ────────────────────────────────────────────────────────────── 纯渲染 */

/** Tab 栏（角标只在 badge 有值时才渲染——没有数字就不占位，更不显示 "0"）。 */
export function buildTabBar(report: ReportResponse | undefined, active: ReportTabKey): string {
  const tabs = REPORT_TABS.map((def) => {
    const badge = def.badge(report)
    return '<button type="button" class="dsh-pm-tab' + (def.key === active ? ' active' : '') + '"'
      + ' data-action="switch-tab" data-tab="' + def.key + '">'
      + '<span class="dsh-pm-tab-icon">' + TAB_ICONS[def.key] + '</span>' + esc(def.label)
      + (badge === undefined ? '' : '<span class="dsh-pm-fold-count" data-badge="' + def.key + '">' + esc(badge) + '</span>')
      + '</button>'
  }).join('')
  return '<div class="dsh-pm-tabs" data-report-tabs="1">' + tabs + '</div>'
}

/** 面板条目四态（判别联合：状态与数据同生共死，不会出现"有 error 又有 data"）。 */
type PanelEntry =
  | { phase: 'loading' }
  /** `notice` = "有内容，但刚才那件事没成"（如加载更早失败）：**不拿掉已读内容**，只在上面加一行 */
  | { phase: 'ready'; data: unknown; notice?: string }
  | { phase: 'degraded'; degrade: Degrade }
  | { phase: 'error'; message: string }

/**
 * 面板正文（四态各有字符串，**绝不空白**）：
 * 加载中 / 降级（按 reason 说人话）/ 失败（给"重试"这条真的能走的路）/ 就绪（面板自己渲染）。
 */
function panelBody(def: ReportTabDef, entry: PanelEntry | undefined, ctx: ReportTabCtx): string {
  if (entry === undefined || entry.phase === 'loading') {
    return '<div class="dsh-pm-empty">' + esc(def.label) + '加载中…</div>'
  }
  if (entry.phase === 'degraded') {
    return '<div class="dsh-pm-empty" data-panel-degraded="' + esc(entry.degrade.reason) + '">'
      + esc(def.degraded?.(entry.degrade) ?? degradeText(entry.degrade)) + '</div>'
  }
  if (entry.phase === 'error') {
    return '<div class="dsh-pm-empty" data-panel-error="1">' + esc(entry.message)
      + '<button type="button" class="dsh-pm-btn" data-action="report-panel-retry">重试</button></div>'
  }
  const notice = entry.notice === undefined ? ''
    : '<div class="dsh-pm-empty" data-panel-notice="1">' + esc(entry.notice) + '</div>'
  return notice + def.render(entry.data, ctx)
}

/**
 * 面板段包装（**只含当前这一个面板**；未激活的面板根本不在产物里）。
 *
 * 属性名是 `data-tab-host` 而**不是** `data-panel`：六个面板卡都按约定在自己的根容器上输出
 * `data-panel="<key>"`（直接调 `panel.render()` 的断言需要它），包装器再输出一遍就会让
 * "当前有几个面板"这类计数断言（`match(/data-panel=/g).length`）数出两倍。
 * 判据不变：产物里**不出现**未激活 key 的 `data-panel=`。
 */
function panelWrapper(key: ReportTabKey, body: string): string {
  return '<div class="dsh-pm-tab-panel" data-tab-host="' + key + '" data-tab-content="' + key + '">' + body + '</div>'
}

/** 纯渲染时的空上下文：取数一律拒绝（取数归控制器，渲染不该有副作用）。 */
const NO_LOAD = (): Promise<PanelResult<unknown>> =>
  Promise.reject(new Error('report-shell：纯渲染路径未注入取数（取数由 createReportTabs/createReportShell 负责）'))

/** 壳的四段（分段局部更新的**单位**：头部段 / 状态带段 / Tab 栏段 / 当前面板段）。 */
export interface ReportShellSegments { head: string; band: string; tabs: string; panel: string }

/** 壳体（空段不渲染容器——档二没有 Tab 栏与面板）。 */
function wrapShell(reqId: string, revision: number, segs: ReportShellSegments, extraAttrs = ''): string {
  const seg = (name: string, html: string): string =>
    html.length === 0 ? '' : '<div data-report-seg="' + name + '">' + html + '</div>'
  return '<div class="dsh-pm-detail" data-detail-req="' + esc(reqId) + '" data-report-shell="1"'
    + ' data-report-revision="' + String(revision) + '"' + extraAttrs + '>'
    + seg('head', segs.head) + seg('band', segs.band) + seg('tabs', segs.tabs) + seg('panel', segs.panel)
    + '</div>'
}

export interface ReportShellRenderOpts {
  /** 当前 Tab 的载荷（缺省 = 加载中占位） */
  data?: PanelResult<unknown>
  /** 面板上下文（缺省 = 不取数的空上下文） */
  ctx?: ReportTabCtx
  /** 台账 revision（写进 `data-report-revision`，便于断言与审计） */
  revision?: number
}

/**
 * 详情页整壳：**常驻头部 + 状态带 + Tab 栏 + 只含当前面板**。
 * 未激活的 Tab **不在产物里**（`querySelector('[data-panel="token"]')` 在未激活时为 null）。
 */
export function buildReportShell(
  report: ReportResponse,
  active: ReportTabKey,
  opts: ReportShellRenderOpts = {},
): string {
  const def = defOf(active)
  const ctx = opts.ctx ?? {
    requirementId: report.head.id, load: NO_LOAD, openDoc: () => { /* 纯渲染不开正文 */ },
  }
  const entry: PanelEntry | undefined = opts.data === undefined
    ? undefined
    : (isDegrade(opts.data) ? { phase: 'degraded', degrade: opts.data } : { phase: 'ready', data: opts.data })
  return wrapShell(report.head.id, opts.revision ?? 0, {
    head: buildReportHead(report),
    band: buildReportBand(report),
    tabs: buildTabBar(report, active),
    panel: panelWrapper(active, panelBody(def, entry, ctx)),
  })
}

/**
 * 档二（会话内面板）：只吃 `report`（head/progress/gaps/actions），**不含 Tab 栏与任何面板**。
 *
 * 为什么这样分档：档二的禁止项（文档表 / 成本 / 提示词正文 / DAG 明细）靠**结构性不可能**保证——
 * 那四块属于 Tab 面板，而档二根本不渲染面板。用"渲染全部再藏起来"实现档二，等于把禁止项
 * 放进了 DOM（`querySelector` 一查就有），那是自欺。
 * 档二同样不渲染评论框：会话里已有输入框，再放一个会让人分不清"评论"与"发消息"。
 */
export function buildReportCompact(report: ReportResponse): string {
  return wrapShell(report.head.id, 0, {
    head: buildReportHead(report, Date.now(), { compact: true }),
    band: buildReportBand(report),
    tabs: '',
    panel: '',
  }, ' data-report-compact="1"')
}

/* ────────────────────────────────────────────────────────────── 取数小工具 */

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message.length > 0 ? err.message : err.name
  const text = String(err)
  return text.length > 0 ? text : '取数失败'
}

/** 错误里的 HTTP 状态码（鸭子类型：ApiError 与测试桩都给 status，不依赖 instanceof）。 */
function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | undefined)?.status
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined
}

/** 载荷里的分页游标（`page.before`）；不成形就不给（**不猜**）。 */
function pageBeforeOf(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const page = (data as { page?: unknown }).page
  if (page === null || typeof page !== 'object') return undefined
  const before = (page as { before?: unknown }).before
  return typeof before === 'number' && Number.isFinite(before) ? before : undefined
}

/**
 * 「加载更早」的合并口径：两页都带 `items` 数组 → 更早的一页**前插**（保持同一条时间线），
 * 并按 `(at, kind, text)` **去重**（分页边界重叠是常态：同一条消息出现在两页里，
 * 不去重就会在时间线上出现两次，读者会以为"这件事发生了两次"）。
 *
 * 去重只对**形状可判**的条目生效（没有 `text` 的条目判不出，宁可照实留两条，也不丢内容）。
 * 形状不合（没有 items 数组）→ 替换当前页（壳不认得的形状不做臆测，由面板自己按单页渲染）。
 */
function mergeEarlier(prev: unknown, next: unknown): { data: unknown; merged: boolean } {
  const prevItems = itemsOf(prev)
  const nextItems = itemsOf(next)
  if (prevItems === undefined || nextItems === undefined) return { data: next, merged: false }
  if (next === null || typeof next !== 'object') return { data: next, merged: false }
  const seen = new Set<string>()
  const items: unknown[] = []
  for (const item of [...nextItems, ...prevItems]) {
    const key = itemIdentityOf(item)
    if (key !== undefined) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    items.push(item)
  }
  return { data: { ...(next as Record<string, unknown>), items }, merged: true }
}

/** 条目身份键 `(at, kind, text)`；不成形（缺 text）→ undefined = 不参与去重。 */
function itemIdentityOf(item: unknown): string | undefined {
  if (item === null || typeof item !== 'object') return undefined
  const it = item as { at?: unknown; kind?: unknown; text?: unknown }
  if (typeof it.text !== 'string') return undefined
  return String(it.at) + '|' + String(it.kind) + '|' + it.text
}

function itemsOf(v: unknown): unknown[] | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const items = (v as { items?: unknown }).items
  return Array.isArray(items) ? items : undefined
}

/* ────────────────────────────────────────────────────────────── Tab 控制器 */

export interface ReportTabsOpts {
  requirementId: string
  load: (key: ReportTabKey, params?: ReportPanelParams) => Promise<PanelResult<unknown>>
  openDoc: (path: string) => void
  /** 初始激活的 Tab（缺省 trunk = 默认页） */
  active?: ReportTabKey
  /** 初始台账版本（缺省 0；缓存键的第三段） */
  revision?: number
  /** 条目变化通知（登记 loading / 结算各一拍）——视图据此重绘**当前面板段** */
  onChange?: () => void
}

/** Tab 级控制器（切 Tab / 失效重取 / 卸载上一个面板）。 */
export interface ReportTabsController {
  active(): ReportTabKey
  /** 切 Tab：没取过 → 立即请求；同 revision 内取过 → 命中缓存（不发请求） */
  select(key: ReportTabKey): void
  /** 确保某 Tab 的载荷可用（幂等；失败/降级不自动重试——重试是人的显式动作） */
  ensure(key: ReportTabKey): void
  /** 当前面板 HTML（loading / 降级 / 失败 / 就绪各有字符串） */
  panelHtml(): string
  /**
   * 台账 revision 变更：**只失效并重取当前 Tab**（头部归壳负责），其它 Tab 不主动请求。
   * 首次调用（还没取过任何 Tab）只登记版本号、不请求——首屏那 2 个请求由壳按纪律发出。
   */
  invalidate(revision: number): void
  /** 显式重试当前 Tab（失败后的唯一出口；幂等） */
  retry(): void
  /**
   * 「加载更早」一页（FR-11 #6：对话 / 注入留痕分页）。
   *
   * 为什么这个动作归壳而不是归面板：面板只会**返回字符串**，没有地方存"已经加载到哪了"；
   * 分页必须有一处持有累积载荷，否则点一次就把当前页换成更早那一页（读者刚看的内容被顶掉）。
   * 合并口径（写死，供断言）：两页都是对象且带 `items` 数组时，新（更早）页在前 + 旧页在后
   * （服务端按时间升序返回，前插即保持同一条时间线）；否则用新页替换，并在面板上留一行说明。
   * 游标缺省取当前载荷的 `page.before`（服务端给的游标；取不到就**不猜**，只留一行不可用说明）。
   */
  loadEarlier(cursor?: number): void
  /** 卸载上一个面板：作废在途响应，迟到的响应不得写回 */
  detach(): void
  /**
   * 把壳的**交互委派**挂到根节点上（返回卸载函数）。
   *
   * 为什么这条链只能由壳接、且只接一处：面板只产出 `data-open-doc`（**故意不带** `data-action`），
   * 而"点开正文"就是 `ReportTabCtx.openDoc` 的职责。board-mount 若也接一条，点一下会开两次
   * （或开错通道）——只能有一处接。
   * 为什么挂在**容器**而不是面板节点上：面板段每次台账变更都会被整段替换，挂在面板上等于
   * 每次都要重挂（漏挂一次就是"点了没反应"）。
   * 无 DOM 能力（宿主桩 / 测试桩）时返回空卸载函数，静默跳过。
   */
  attach(root: HTMLElement): () => void
  /** 该 Tab 的**取数次数**（测试与诊断用；生产不读） */
  loadCount(key: ReportTabKey): number
}

/** 取 `data-open-doc` 的值（属性优先于 dataset：宿主桩可能只实现 getAttribute）。 */
function openDocPathOf(el: HTMLElement): string {
  const fromDataset = el.dataset === undefined ? undefined : el.dataset.openDoc
  if (typeof fromDataset === 'string' && fromDataset.length > 0) return fromDataset
  if (typeof el.getAttribute !== 'function') return ''
  return el.getAttribute('data-open-doc') ?? ''
}

/**
 * 取 `data-confirm` 的值（缺失/空 = 这次点击不需要确认）。
 *
 * 用途：**危险动作**（取消这类，见 `report-head.ts#buildReportActionBar` 的 data-confirm）。
 * 它们的既有通道 `move-req` 自己**没有确认框**（`board-mount` 的该分支直接发请求），
 * 而"危险动作必须进确认框"是设计原则（Pajamas · Destructive actions）。
 * 壳的点击委派比 `board-mount` 挂在容器上的委派**更靠内**（按钮 → viewEl → container），
 * 所以在这里拦是最短的一跳：拒绝就 `stopPropagation`，请求根本不会发出去。
 */
function confirmTextOf(el: HTMLElement): string {
  const fromDataset = el.dataset === undefined ? undefined : el.dataset.confirm
  if (typeof fromDataset === 'string' && fromDataset.length > 0) return fromDataset
  if (typeof el.getAttribute !== 'function') return ''
  return el.getAttribute('data-confirm') ?? ''
}

/**
 * 面板内的**就地**交互（当前只有对话 Tab 的页内检索）：只过滤**已加载**的消息，不重新取数
 * （"更早的还没加载"由「加载更早」管，检索栏自己会写明范围）。
 *
 * 为什么由壳接而不是 board-mount：与 `data-open-doc` 同一条理由——面板只返回字符串，
 * DOM 事件总得有人接；接在壳里，面板与事件落的距离最短，board-mount 只管渲染与生命周期。
 * 为什么不是 `ReportTabDef.onInput` 钩子：今天只有一处，提前抽接口反而更难读；
 * 后面面板卡落地后若出现第二个同类需求，再抽成 `def.onInput?.(panel, ev)`。
 */
function handlePanelInput(root: HTMLElement, ev: Event): boolean {
  const target = ev.target as Element | null
  if (target === null || typeof target.closest !== 'function') return false
  const box = target.closest<HTMLInputElement>('[data-dialogue-search]')
  if (box === null) return false
  // 作用域 = 该输入框所在的面板（`data-panel` 由面板根提供）；找不到才用壳根
  const panel = box.closest<HTMLElement>('[data-panel]') ?? root
  applyDialogueSearch(panel, box.value)
  return true
}

/**
 * 危险动作的确认（返回 true = 这次点击**已被拦下**）。
 *
 * 三个"别做"：
 *  · **不拦没有 `data-confirm` 的点击**——普通动作的确认归各自通道（`verify-pass` 有自己的
 *    读材料的确认框，`verify-rework` 有自己的 prompt），壳再弹一次就是两次确认；
 *  · **宿主没有 `confirm` 能力时放行**（不静默吞掉点击：点了没反应比没有确认更坏）；
 *  · **不 preventDefault 之外的副作用**：确认通过就原样冒泡，通道照旧收到这次点击。
 */
function handleDangerConfirm(ev: Event): boolean {
  const target = ev.target as Element | null
  if (target === null || typeof target.closest !== 'function') return false
  const el = target.closest<HTMLElement>('[data-confirm]')
  if (el === null) return false
  const text = confirmTextOf(el)
  if (text.length === 0) return false
  const win = typeof window === 'undefined' ? undefined : window
  if (win === undefined || typeof win.confirm !== 'function') return false
  if (win.confirm(text)) return false
  // 拒绝：拦在壳这一层，`board-mount` 的容器委派（更外层）收不到这次点击
  ev.preventDefault()
  ev.stopPropagation()
  return true
}

export function createReportTabs(opts: ReportTabsOpts): ReportTabsController {
  const ctx: ReportTabCtx = { requirementId: opts.requirementId, load: opts.load, openDoc: opts.openDoc }
  let revision = opts.revision ?? 0
  let activeKey: ReportTabKey = opts.active ?? 'trunk'
  let detached = false
  /** 条目表：键 = `reqId::tab::revision`（缓存判据即键本身，不必另存版本） */
  const entries = new Map<string, PanelEntry>()
  /** 在途世代：值 = 发请求时的世代号；结算时对不上即作废（失效/卸载后的迟到响应） */
  const inflight = new Map<string, number>()
  /** 每个 Tab 的取数次数（只增） */
  const counts = new Map<ReportTabKey, number>()
  let gen = 0

  const keyOf = (key: ReportTabKey): string => opts.requirementId + '::' + key + '::' + String(revision)

  const notify = (): void => {
    try { opts.onChange?.() } catch { /* 视图回调抛错不影响取数（同 req-detail-store 纪律） */ }
  }

  const ensure = (key: ReportTabKey): void => {
    if (detached) return
    const cacheKey = keyOf(key)
    if (entries.has(cacheKey) || inflight.has(cacheKey)) return
    const myGen = ++gen
    entries.set(cacheKey, { phase: 'loading' })
    inflight.set(cacheKey, myGen)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    notify() // 先登记在途再通知：通知会同步回到视图，视图可能重入 select/ensure
    void Promise.resolve()
      // 微任务包一层：注入的取数函数**同步抛**也走失败分支（不得穿透渲染路径）
      .then(() => opts.load(key))
      .then(
        (res) => {
          if (inflight.get(cacheKey) !== myGen) return
          inflight.delete(cacheKey)
          entries.set(cacheKey, isDegrade(res) ? { phase: 'degraded', degrade: res } : { phase: 'ready', data: res })
          notify()
        },
        (err: unknown) => {
          if (inflight.get(cacheKey) !== myGen) return
          inflight.delete(cacheKey)
          entries.set(cacheKey, { phase: 'error', message: errorMessageOf(err) })
          notify()
        },
      )
  }

  /** 回收非当前版本的条目（键含 revision，跨版本条目永不可读——不回收就是随 SSE 无界增长）。 */
  const prune = (): void => {
    const suffix = '::' + String(revision)
    for (const k of [...entries.keys()]) if (!k.endsWith(suffix)) entries.delete(k)
    for (const k of [...inflight.keys()]) if (!k.endsWith(suffix)) inflight.delete(k)
  }

  return {
    active: () => activeKey,
    select(key) {
      if (detached) return
      activeKey = key
      ensure(key)
      notify() // 即便命中缓存也要重绘：Tab 栏的 active 与面板段都得换
    },
    ensure,
    panelHtml() {
      return panelBody(defOf(activeKey), entries.get(keyOf(activeKey)), ctx)
    },
    invalidate(next) {
      if (next === revision) return
      const activeCacheKey = keyOf(activeKey)
      const had = entries.has(activeCacheKey) || inflight.has(activeCacheKey)
      revision = next
      prune()
      // 只重取当前 Tab：其它 Tab 一律不主动请求（它们下次被选中时自然按新版本取）
      if (had) ensure(activeKey)
      notify()
    },
    retry() {
      if (detached) return
      const cacheKey = keyOf(activeKey)
      inflight.delete(cacheKey)
      entries.delete(cacheKey)
      ensure(activeKey)
    },
    loadEarlier(cursor) {
      if (detached) return
      const cacheKey = keyOf(activeKey)
      const prev = entries.get(cacheKey)
      if (prev === undefined || prev.phase !== 'ready') return // 还没有可"更早"的载荷：不猜、不空转
      const before = cursor ?? pageBeforeOf(prev.data)
      if (before === undefined) {
        // 服务端没给游标 → 如实说明不可用；**不**拿"最早一条的时间"之类自己推的数去试
        entries.set(cacheKey, { ...prev, notice: '加载更早不可用：服务端未给游标（page.before）' })
        notify()
        return
      }
      const myGen = ++gen
      inflight.set(cacheKey, myGen)
      counts.set(activeKey, (counts.get(activeKey) ?? 0) + 1)
      // 加载期间**保留当前载荷**（不闪空）：只是多了一次在途请求
      notify()
      void Promise.resolve()
        .then(() => opts.load(activeKey, { before }))
        .then(
          (res) => {
            if (inflight.get(cacheKey) !== myGen) return
            inflight.delete(cacheKey)
            if (isDegrade(res)) {
              entries.set(cacheKey, { ...prev, notice: '加载更早失败：' + degradeText(res) })
            } else {
              const merged = mergeEarlier(prev.data, res)
              entries.set(cacheKey, merged.merged
                ? { phase: 'ready', data: merged.data }
                : { phase: 'ready', data: merged.data, notice: '加载更早：这一页没有 items 数组，按"替换当前页"处理' })
            }
            notify()
          },
          (err: unknown) => {
            if (inflight.get(cacheKey) !== myGen) return
            inflight.delete(cacheKey)
            // 失败不清空已读内容：在面板上方留一行原因（清空会让读者丢掉刚读到的内容）
            entries.set(cacheKey, { ...prev, notice: '加载更早失败：' + errorMessageOf(err) + '（可再点一次）' })
            notify()
          },
        )
    },
    detach() {
      detached = true
      entries.clear()
      inflight.clear() // 清空即作废：迟到响应对不上世代号，一律丢弃
    },
    attach(root) {
      if (typeof root.addEventListener !== 'function') return () => { /* 无 DOM 能力：静默 */ }
      const onClick = (ev: Event): void => {
        // 危险动作的确认先跑：拒绝就拦下（更外层的容器委派收不到这次点击）
        if (handleDangerConfirm(ev)) return
        const target = ev.target as Element | null
        if (target === null || typeof target.closest !== 'function') return
        const openEl = target.closest<HTMLElement>('[data-open-doc]')
        if (openEl === null) return
        const path = openDocPathOf(openEl)
        if (path.length === 0) return
        ctx.openDoc(path)
      }
      const onInput = (ev: Event): void => { handlePanelInput(root, ev) }
      root.addEventListener('click', onClick)
      root.addEventListener('input', onInput)
      return () => {
        root.removeEventListener('click', onClick)
        root.removeEventListener('input', onInput)
      }
    },
    loadCount: (key) => counts.get(key) ?? 0,
  }
}

/* ────────────────────────────────────────────────────────────── 壳控制器 */

export type ReportHeadPhase = 'idle' | 'loading' | 'ready' | 'degraded' | 'error' | 'unsupported'

/** 头部状态（board-mount 据此判「走新壳」还是「回落旧详情页」）。 */
export interface ReportHeadState {
  phase: ReportHeadPhase
  result?: PanelResult<ReportResponse>
  message?: string
  /** 404：端点不存在（旧服务端）或需求不存在——两种都交给旧详情页兜底（它知道怎么报"未找到"） */
  notFound?: boolean
}

export interface ReportShellOpts {
  requirementId: string
  /** 首屏唯一摘要请求（report 端点） */
  loadReport: () => Promise<PanelResult<ReportResponse>>
  load: ReportTabsOpts['load']
  openDoc: (path: string) => void
  active?: ReportTabKey
  revision?: number
  onChange?: () => void
}

export interface ReportShellController {
  head(): ReportHeadState
  active(): ReportTabKey
  /** 台账 revision 变更：只失效「头部 + 当前 Tab」 */
  setRevision(revision: number): void
  /** 幂等：首屏取 report；头部一类可用就紧随取默认 Tab（共 2 个请求） */
  ensure(): void
  select(key: ReportTabKey): void
  /** 重试当前 Tab */
  retry(): void
  /** 「加载更早」一页（FR-11 #6）——累积与合并由壳负责，见 {@link ReportTabsController.loadEarlier} */
  loadEarlier(cursor?: number): void
  /** 重试头部（失败态的唯一出口） */
  retryHead(): void
  /** 交互委派（`data-open-doc` → `ctx.openDoc`）；见 {@link ReportTabsController.attach} */
  attach(root: HTMLElement): () => void
  /** 四段 HTML（交给 board-mount 做分段替换） */
  segments(): ReportShellSegments
  /** 整壳 HTML（首次挂载用；之后一律分段替换） */
  html(): string
  loadCount(key: ReportTabKey): number
  headLoadCount(): number
  detach(): void
}

export function createReportShell(opts: ReportShellOpts): ReportShellController {
  let head: ReportHeadState = { phase: 'idle' }
  let report: ReportResponse | undefined
  let revision = opts.revision ?? 0
  let headGen = 0
  let headLoads = 0
  let detached = false

  const notify = (): void => {
    try { opts.onChange?.() } catch { /* 同上：视图回调抛错不影响取数 */ }
  }

  /** 头部可用（含降级：降级也要让各面板自己说自己的降级，不假装配件全坏）。 */
  const usable = (): boolean => head.phase === 'ready' || head.phase === 'degraded'

  const tabs = createReportTabs({
    requirementId: opts.requirementId,
    load: opts.load,
    openDoc: opts.openDoc,
    ...(opts.active === undefined ? {} : { active: opts.active }),
    ...(opts.revision === undefined ? {} : { revision: opts.revision }),
    onChange: () => notify(),
  })

  const loadHead = (): void => {
    if (detached) return
    head = { phase: 'loading' }
    headLoads += 1
    const myGen = ++headGen
    notify()
    void Promise.resolve()
      .then(() => opts.loadReport())
      .then(
        (res) => {
          if (detached || headGen !== myGen) return
          if (isDegrade(res)) {
            head = { phase: 'degraded', result: res }
          } else if (isReportResponse(res)) {
            report = res
            head = { phase: 'ready', result: res }
          } else {
            // 形状不是本报的形状 = 端点未接线（旧服务端/中间层）：如实标出，由 board-mount 回落旧页
            head = { phase: 'unsupported', message: 'report 端点返回的载荷不是报告摘要形状' }
          }
          notify()
          // 默认 Tab 紧随首屏（第 2 个请求）——只在头部可用时才发；旧服务端零额外请求
          if (usable()) tabs.ensure(tabs.active())
        },
        (err: unknown) => {
          if (detached || headGen !== myGen) return
          head = {
            phase: 'error',
            message: errorMessageOf(err),
            ...(statusOf(err) === 404 ? { notFound: true } : {}),
          }
          notify()
        },
      )
  }

  const placeholder = (): ReportHeadPlaceholder => {
    if (head.phase === 'degraded' && head.result !== undefined && isDegrade(head.result)) {
      return { phase: 'degraded', degrade: head.result }
    }
    if (head.phase === 'error') {
      return {
        phase: 'error', message: head.message ?? '未知原因',
        ...(head.notFound === true ? { notFound: true } : {}),
      }
    }
    if (head.phase === 'unsupported') return { phase: 'unsupported' }
    return { phase: 'loading' }
  }

  const segments = (): ReportShellSegments => {
    const p = placeholder()
    return {
      head: report === undefined ? buildReportHeadPlaceholder(p) : buildReportHead(report),
      band: report === undefined ? buildReportBandPlaceholder(p) : buildReportBand(report),
      tabs: buildTabBar(report, tabs.active()),
      panel: panelWrapper(tabs.active(), tabs.panelHtml()),
    }
  }

  return {
    head: () => head,
    active: () => tabs.active(),
    setRevision(next) {
      if (next === revision) return
      revision = next
      headGen += 1 // 作废在途的头部响应
      // 端点未接线是**稳定判定**：不再每来一次 SSE 就打一次必然 404 的请求
      const unsupported = head.phase === 'unsupported'
      head = unsupported ? head : { phase: 'idle' }
      tabs.invalidate(next) // 只重取当前 Tab（没取过就只登记版本）
      if (!unsupported) loadHead() // 头部常驻，一定要重取
    },
    ensure() {
      if (detached) return
      if (head.phase === 'unsupported') return // 端点未接线：连默认 Tab 都不请求（旧服务端零额外请求）
      if (head.phase === 'error') return // 失败不自动重试（刷新一次打一次，没人受得了）
      if (usable()) { tabs.ensure(tabs.active()); return }
      if (head.phase === 'idle') loadHead()
      // 'loading'：在途，什么都不做
    },
    select(key) {
      tabs.select(key)
    },
    retry() {
      tabs.retry()
    },
    loadEarlier(cursor) {
      tabs.loadEarlier(cursor)
    },
    retryHead() {
      if (detached || usable()) return
      loadHead()
    },
    attach: (root) => tabs.attach(root),
    segments,
    html() {
      return wrapShell(opts.requirementId, revision, segments())
    },
    loadCount: (key) => tabs.loadCount(key),
    headLoadCount: () => headLoads,
    detach() {
      detached = true
      headGen += 1
      tabs.detach()
    },
  }
}
