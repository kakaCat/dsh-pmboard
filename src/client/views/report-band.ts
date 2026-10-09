/**
 * 需求详情页「状态带」（REQ-261004222448-292a · FR-3 / FR-4 / FR-5 / FR-12）——纯函数返回 HTML 字符串。
 *
 * 三格常驻（首屏一屏内读完）：做到哪了 / 缺口清单 / 结果与成效。
 * REQ-261006130057-7a43 FR-2 起三格**不再等大平权**：栅格 1fr : 1.5fr : 0.9fr，
 * 缺口格是视觉焦点（红浅底 + 左红条 + 计数徽标 = `waitingHuman`），
 * 结果格在 `outcome === undefined`（未到验收段）时折叠为一行灰字 + 「展开说明」。
 * 为什么独立成段：台账每变一次它就要重算一次，而它跟"当前 Tab 面板"是两件事——
 * 分段之后换面板不必碰它，它变了也不必碰面板（滚动/展开态由此天然保住）。
 *
 * 三条"不画空表格"的纪律（FR-4 / FR-5 / FR-12）：
 *  - **无缺口就写"无缺口"**，不给一张空表；
 *  - **未到验收段就给解释性空态**（说明何时会出现），不留白、不编结论；
 *  - **读不到的字段少说一句**，绝不用 `0` 冒充"未知 / 未采集"。
 *
 * @module dsh-pmboard/client/views/report-band
 */
import { esc } from '../html.js'
import { mdPlain } from '../render/md-inline.js'
import type { ReportGap, ReportResponse } from '../../shared/protocol.js'
import { isCanceled } from '../../domain/status/Predicates.js'
import { STATUS_LABELS, fmtDur, isTerminal, short } from '../render/dom-utils.js'
import { degradeText, type ReportHeadPlaceholder } from './report-head.js'
import { GAP_DOT_SVG } from '../icons.js'

/**
 * 缺口严重度 → 标记（FR-8 #2：状态不靠颜色单一表达）。
 *
 * 两件事各占一半，**都不靠颜色**：
 *  - {@link GAP_DOT_SVG}（`client/icons.ts`）= 不依赖系统字型的**内联 SVG 圆**，
 *    颜色由所在行的 `color`（按 severity 取语义色）通过 `currentColor` 承载；
 *  - {@link GAP_MARK} = **真实文本节点** `!!` / `!` / `·`，灰度打印或色盲下也能分档。
 *
 * 为什么把 emoji 圆点（`🔴`/`🟡`/`⚪`）换成 SVG：emoji 的字形与明度由**系统字型**决定
 * （正是 FR-1 要除掉的不可控资产），既不受颜色令牌控制，也无法机械断言。
 * 为什么文本标记不是 CSS `::before`：伪元素内容读屏不保证读到（FR-8 #5 的硬约束）——
 * 必须落成真内容，`aria-hidden` 只给 SVG（它旁边就有可读的文本标记与正文）。
 */
const GAP_MARK: Record<ReportGap['severity'], string> = { red: '!!', yellow: '!', gray: '·' }
const GAP_RANK: Record<ReportGap['severity'], number> = { red: 0, yellow: 1, gray: 2 }

/** 首屏只列最严重的 5 条（FR-4：前 3~5 条）；其余**如实说还有几条**，不假装列全了。 */
export const GAP_HEAD_LIMIT = 5

/** 一格（标题 + 正文）。 */
function cell(title: string, body: string, attrs = ''): string {
  return '<div class="dsh-pm-stat"' + attrs + '><div class="dsh-pm-stat-label">' + esc(title) + '</div>'
    + '<div class="dsh-pm-report-band-body">' + body + '</div></div>'
}

/** 一格（标题是**已拼好的 HTML**——计数徽标等内联节点用；纯文本标题请走 {@link cell}）。 */
function cellHtml(titleHtml: string, body: string, attrs = ''): string {
  return '<div class="dsh-pm-stat"' + attrs + '><div class="dsh-pm-stat-label">' + titleHtml + '</div>'
    + '<div class="dsh-pm-report-band-body">' + body + '</div></div>'
}

/** 数字兜底：服务端字段异常时按 0 走计数（只影响展示），不让页面崩。 */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** 第一格：做到哪了（阶段 + 停留 + 距上次更新 + 任务/子卡链计数）。 */
export function buildProgressCell(report: ReportResponse): string {
  const p = report.progress
  const t = p?.tasks
  const lines: string[] = []
  lines.push('<b>' + esc(STATUS_LABELS[report.head.status] ?? report.head.status) + '</b>（'
    + esc(report.head.status) + '）')
  if (typeof p?.stageStayedMs === 'number') lines.push('停留 ' + esc(fmtDur(p.stageStayedMs)))
  if (typeof p?.sinceUpdateMs === 'number') lines.push('距上次更新 ' + esc(fmtDur(p.sinceUpdateMs)))
  if (t !== undefined) {
    lines.push('任务 <b>' + num(t.done) + '/' + num(t.total) + '</b>'
      + '（在跑 ' + num(t.running) + ' · 待办 ' + num(t.todo) + '）')
    lines.push('子卡链 ' + num(t.subChainDone) + '/' + num(t.subChainTotal) + ' 段完成')
  }
  return cell('做到哪了', lines.join('<br>'), ' data-band-cell="progress"')
}

/* ────────────────────────────────────────────────────────────── 一行短标 + 出处 */

/** 一行短标的字数上限（超出省略号收尾；全文一律进 `title`——截断必须给出路）。 */
export const SHORT_MAX = 44

/** 状态词前缀（`未裁决：…` / `不通过：…`）的最大字数：超过它就不是"状态词 + 正文"，而是正文自己带冒号。 */
const STATUS_HEAD_MAX = 8

function clampText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…'
}

/**
 * 把一条台账原文压成**一行**（`项名 · 状态`），全文由调用方放进 `title`。
 *
 * 为什么要压（2026-10-05 人类验收：状态带三格把"验收标准原文 + 意见"整段塞进小格，
 * 再靠省略号截断 → 半句 + `…`，读不了）：常驻状态带是**一眼看结论**的地方，
 * 逐项原文的落点在『文档』Tab 的验收单（那里逐项铺开、一个字不省）。
 *
 * 口径（同一套规则用于缺口条与遗留条——"同类信息同一套截断口径"，不许一处两行一处一行）：
 *  ① `未裁决：/ 不通过：` 这种**短前缀**（≤8 字）是状态词，抽出来放到末尾（`项名 · 状态`）；
 *  ② 项名优先取 `【…】` 里的名字（台账里"标准原文"常被方括号括起），否则取第一个分句
 *     （到 `：；，。` 为止），再截到 `SHORT_MAX` 字。
 */
export function oneLineLabel(text: string, max = SHORT_MAX): string {
  const s = (typeof text === 'string' ? text : String(text ?? '')).trim()
  if (s.length === 0) return ''
  let status = ''
  let body = s
  const colon = s.search(/[：:]/)
  if (colon > 0 && colon <= STATUS_HEAD_MAX) {
    status = s.slice(0, colon).trim()
    body = s.slice(colon + 1).trim()
  }
  if (body.length === 0) return status
  const bracket = /^【([^】]{1,60})】/.exec(body)
  let name = bracket !== null ? bracket[1] : body
  if (bracket === null) {
    const cut = body.search(/[：:；;，,。]/)
    if (cut > 0) name = body.slice(0, cut)
  }
  name = clampText(name.trim(), max)
  return status.length === 0 ? name : name + ' · ' + status
}

/** 转义 RegExp 元字符（ref id 来自台账，可能带 `.` / `(` 之类）。 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 缺口条的短标：有 `ref` 时**把条款号从正文里剥掉**（它由旁边的 ref 芯片显示），
 * 免得同一行出现两遍「FR-2」（线上真数据是「条款 FR-2 没人接：…」）。
 */
function gapShort(gap: ReportGap): string {
  const label = oneLineLabel(gap.what)
  const id = gap.ref?.id ?? ''
  if (id.length === 0) return label
  return label
    .replace(new RegExp('^条款\\s*' + escapeRe(id) + '\\s*[：:，,]?\\s*'), '')
    .replace(new RegExp('^' + escapeRe(id) + '\\s*[：:，,]?\\s*'), '')
    .trim()
}

/**
 * 第二格：缺口清单（无缺口 → 一行"无缺口"，不画空表格）。
 *
 * 每条**只给「severity 点 + 条款号 + 一句话」**：`why`（为什么算缺口）与 `what` 全文进 `title`，
 * 逐项原文的落点是条款所在的文档 / 门禁（见 `ref`）。理由见本文件末「状态带口径」注。
 */
export function buildGapsCell(report: ReportResponse): string {
  const gaps = (report.gaps ?? []).slice()
  if (gaps.length === 0) {
    return cell('缺口', '<div class="dsh-pm-band-ok" data-gaps="none">✅ 无缺口：要件齐 · 门禁全过 · 无挂起确认 · 无未接收条款</div>',
      ' data-band-cell="gaps"')
  }
  // 排序放在前端做一层**展示序**兜底：服务端应已按严重度排好，但顺序错了会直接把
  // 🔴 挤到 5 条之外（人看不到最该看的），这是展示契约，不能靠上游自觉。
  const sorted = gaps.slice().sort((a, b) => (GAP_RANK[a.severity] ?? 9) - (GAP_RANK[b.severity] ?? 9))
  const head = sorted.slice(0, GAP_HEAD_LIMIT)
  const rows = head.map((g) => {
    const ref = g.ref === undefined ? ''
      : '<span class="dsh-pm-gap-ref" data-ref-kind="' + esc(g.ref.kind) + '" data-ref-id="' + esc(g.ref.id)
        + '">' + esc(g.ref.id) + '</span>'
    // 全文（what + why + ref）进 title：一行短标是**入口**，不是结论的全部
    const full = g.what + (g.why.length === 0 ? '' : '｜为什么：' + g.why)
      + (g.ref === undefined ? '' : '｜出处：' + g.ref.kind + ' ' + g.ref.id)
    const short = gapShort(g)
    return '<div class="dsh-pm-gap-line" data-severity="' + esc(g.severity) + '"'
      + ' title="' + esc(full) + '">'
      /* 严重度的两条非颜色通道（FR-8 #2）：SVG 圆（装饰性，颜色跟随本行 color）+
         **真实文本**标记 `!!`/`!`/`·`（读屏读得到；不是 `::before`）。 */
      + '<span class="dsh-pm-gap-what"><span class="dsh-pm-gap-sev" aria-hidden="true">'
      + (GAP_DOT_SVG[g.severity] ?? GAP_DOT_SVG.gray) + '</span>'
      + '<span class="dsh-pm-gap-mark" data-gap-mark="' + esc(g.severity) + '">'
      + esc(GAP_MARK[g.severity] ?? '·') + '</span> '
      + esc(short.length === 0 ? g.what : short) + '</span>' + ref + '</div>'
  }).join('')
  const more = sorted.length > GAP_HEAD_LIMIT
    ? '<div class="dsh-pm-gap-more">还有 ' + String(sorted.length - GAP_HEAD_LIMIT)
      + ' 条未列（首屏只列最严重的 ' + String(GAP_HEAD_LIMIT) + ' 条）</div>'
    : ''
  /* FR-2（REQ-261006130057-7a43 t5）：缺口格 = 状态带的**视觉焦点**——
     红浅底 + 左 3px 红条（样式在 styles/report.ts 的 FR-2 块，`data-gap-focus` 挂钩）+
     标题里的**红色计数徽标**。徽标值 = `waitingHuman`（「几件事等人」，与头部一句话结论
     verdictLine 同口径，**不是** gaps 总条数——总条数由旁边的「共 N 条」真文本交代）；
     数字本身是真文本节点，不靠颜色单一表达（FR-8）。
     `id="dsh-pm-gap-focus"`（t4 补，纯增量一个属性）：头部闸门提示条锚链「查看缺口 ↓」
     的 hash 落点——缺口格存在 ⟺ gaps 非空 ⟺ waitingHuman > 0，提示条在时落点恒在。 */
  const waiting = num(report.waitingHuman)
  const badge = '<span class="dsh-pm-gap-count-badge" data-gap-count-badge="' + String(waiting)
    + '">' + String(waiting) + '</span>'
  const label = esc('缺口（该有而没有）') + ' ' + badge + ' ' + esc('共 ' + String(sorted.length) + ' 条')
  return cellHtml(label, rows + more, ' data-band-cell="gaps" data-gap-focus="1" id="dsh-pm-gap-focus"')
}

/**
 * 验收结论 → 一句人话（FR-5：通过 / 返工 / 待裁决，三态各有说辞，不留白）。
 *
 * 为什么键是 `ReportResponse['outcome']` 那三个值：结论只认**人的裁决**（服务端从
 * `verification.decision` 折算），页面不猜、也不从逐项计数倒推。
 */
const OUTCOME_VERDICT: Record<'pass' | 'rework' | 'pending', string> = {
  pass: '✅ 验收通过',
  rework: '🔁 退回返工（不通过项待重做后重判）',
  pending: '⏳ 验收进行中（人尚未裁决）',
}

/**
 * 遗留条目展示上限（字符）。截断是为了保住"常驻头部一屏读完"（FR-3），
 * **不是藏内容**：每条超长都在这里显式标 `…`，并指向『文档』Tab 的验收单原文。
 */
const LEFTOVER_MAX = 140

/**
 * 遗留条目**渲染条数**上限（上线冒烟实测补）。为什么必须有：这一格是常驻头部的第三格，
 * 实测真数据下 20 条遗留共 3,121 字 → 该格高 **1501px**，把六个 Tab 顶到 1899px 之外
 * （视口 713）——「首屏答出是什么/到哪了/卡在哪/缺什么」当场失效，而这一格自己的文案
 * 还写着「首屏摘要不含逐项」，属于自相矛盾。
 *
 * 取舍：**先列前 N 条 + 明写「其余 M 条见验收单」**——省略要可见、要可数（不是静默截断）。
 * 完整逐项在『文档』Tab 的验收单里逐行铺开，一个都没丢。
 */
const LEFTOVER_SHOWN_MAX = 3

/**
 * 遗留问题与后续（FR-5）。
 *
 * 三种收尾各有说辞（禁留白、禁空表格）：
 *  - 有条目 → 先列前 N 条（`data-leftover`）+ 「其余 M 条」指针，末尾指回验收单原文；
 *  - 条目为空且**有通过项** → 「无遗留问题」（逐项全通过是真的，不是"没数据"）；
 *  - 条目为空且**一项都没通过** → 说明验收单是空的（`passed===0` 且无遗留 = 没有可裁决的逐项），
 *    绝不写"全部通过"。后者与"没有验收单"（走另一个分支）是两句话。
 */
function leftoversHtml(o: NonNullable<ReportResponse['outcome']>): string {
  const rows = (o.leftovers ?? [])
    .map(l => (typeof l === 'string' ? l.trim() : ''))
    .filter(l => l.length > 0)
  if (rows.length > 0) {
    const shown = rows.slice(0, LEFTOVER_SHOWN_MAX)
    const rest = rows.length - shown.length
    // 刻意**不给标题加含 `data-leftover` 子串的属性**：`countOf(html,'data-leftover')` 必须精确
    // 等于**渲染出来的行数**（多一个同前缀属性就会多算一条）。故总数用 `data-more-leftovers`
    // 与标题文案承载（`data-more-leftovers` 里不含 `data-leftover` 这个子串）。
    return '<span class="dsh-pm-outcome-leftover-title">遗留问题与后续（'
      + String(rows.length) + ' 项'
      + (rest > 0 ? '，先列前 ' + String(shown.length) + ' 项' : '') + '）</span>'
      // 每条**只给一行**（`项名 · 状态`）：标准原文与意见进 title，逐项正文在『文档』Tab 的验收单
      + shown.map(l => '<div class="dsh-pm-outcome-leftover" data-leftover="1"'
        + ' title="' + esc(mdPlain(short(l, LEFTOVER_MAX))) + '">'
        + esc(oneLineLabel(l)) + '</div>').join('')
      + (rest > 0
        ? '<span class="dsh-pm-band-mut" data-more-leftovers="' + String(rest) + '">其余 '
          + String(rest) + ' 项见『文档』Tab 的验收单（逐项铺开，未省略）</span>'
        : '<span class="dsh-pm-band-mut">逐项原文与证据见『文档』Tab 的验收单</span>')
  }
  const none = num(o.passed) > 0
    ? '无遗留问题：验收单逐项全部通过'
    : '验收单为空（0 项）：没有可裁决的逐项，逐项结果见『文档』Tab'
  // 同样避开 `data-leftover` 前缀（见上）：空态用一个独立属性，`data-leftover` 只在真有遗留时出现
  return '<span class="dsh-pm-band-mut" data-no-leftover="1">' + esc(none) + '</span>'
}

/**
 * 第三格：结果与成效（FR-5 + REQ-261006130057-7a43 FR-2）。
 *
 * 两态：
 *  - **有 `outcome`**（台账里有验收单）→ 结论 + 逐项计数 + 遗留问题与后续（完整铺开）；
 *  - **没有 `outcome`**（未到验收段 / 在途）→ **折叠为一行灰字 + 「展开说明」**（FR-2：
 *    在途态长期为空，不再与缺口格等大平权）。展开用原生 `<details>`（不靠 JS），
 *    说明正文进折叠体；折叠/展开两态的切换文案都是真文本节点（FR-8，CSS 按 [open] 换显）。
 *
 * 禁 0 冒充（FR-12）：`通过 0 项` 只在验收单**确实一项都没过**时出现（那是事实）；
 * "还没有验收单"走的是另一句话（"尚未到验收段 / 结论见文档 Tab"），两者绝不混。
 */
export function buildOutcomeCell(report: ReportResponse): string {
  const status = report.head.status
  const o = report.outcome
  // 取消态：没有验收结论可给（保持既有说辞）；其余状态只要有验收单就用逐项数据说话
  if (status !== 'canceled' && o !== undefined) {
    const passed = num(o.passed)
    const failed = num(o.failed)
    const pending = num(o.pendingItems)
    const counts = '<span class="dsh-pm-outcome-counts">逐项：'
      + '<span data-outcome-passed="' + String(passed) + '">通过 ' + String(passed) + ' 项</span>'
      + ' · <span data-outcome-failed="' + String(failed) + '">不通过 ' + String(failed) + ' 项</span>'
      + ' · <span data-outcome-pending="' + String(pending) + '">待定 ' + String(pending) + ' 项</span>'
      + '</span>'
    const verdict = '<span class="dsh-pm-outcome-verdict" data-outcome="' + esc(o.verdict) + '">'
      + esc(OUTCOME_VERDICT[o.verdict] ?? o.verdict) + '</span>'
    return cell('结果与成效', verdict + '<br>' + counts + '<br>' + leftoversHtml(o), ' data-band-cell="outcome"')
  }
  if (isCanceled(report.head)) {
    return cell('结果与成效', '<span class="dsh-pm-band-mut">已取消：无验收结论</span>', ' data-band-cell="outcome"')
  }
  // outcome === undefined：折叠占位（一行灰字 + 展开说明）。一行 = 结论位；折叠体 = 解释。
  const line = isTerminal(status)
    ? '<span class="dsh-pm-band-ok">✅ 已归档</span><span class="dsh-pm-band-mut">：结论见『文档』Tab，暂无首屏摘要</span>'
    : status === 'accepting'
      ? '<span class="dsh-pm-band-mut">⏳ 验收中：人尚未裁决，暂无结论</span>'
      : '<span class="dsh-pm-band-mut">尚未到验收段（当前 ' + esc(STATUS_LABELS[status] ?? status)
        + ' ' + num(report.progress?.tasks?.done) + '/' + num(report.progress?.tasks?.total)
        + '）：暂无结论</span>'
  const note = isTerminal(status)
    ? '验收结论与逐项结果见『文档』Tab 的验收单与门禁留痕（首屏摘要不含逐项）。'
    : status === 'accepting'
      ? '通过 / 退回后在此给出结论与遗留问题；逐项结果见『文档』Tab 的验收单。'
      : '到验收段后此处给出结论、逐项结果与遗留问题；在途态长期为空，故默认折叠为一行，不再与缺口格等大平权。'
  const body = '<details class="dsh-pm-outcome-fold" data-outcome-fold="1">'
    + '<summary class="dsh-pm-outcome-fold-line">' + line
    + ' <span class="dsh-pm-outcome-toggle"><span class="dsh-pm-outcome-toggle-open">展开说明</span>'
    + '<span class="dsh-pm-outcome-toggle-close">收起说明</span></span></summary>'
    + '<div class="dsh-pm-outcome-fold-body dsh-pm-band-mut">' + esc(note) + '</div></details>'
  return cell('结果与成效', body, ' data-band-cell="outcome"')
}

/** 状态带（三格）。 */
export function buildReportBand(report: ReportResponse): string {
  return '<div class="dsh-pm-stats" data-report-band="1">'
    + buildProgressCell(report)
    + buildGapsCell(report)
    + buildOutcomeCell(report)
    + '</div>'
}

/** 状态带占位（报告摘要还没到 / 读不到）：三格各自留位，避免数据到达时页面跳动。 */
export function buildReportBandPlaceholder(p: ReportHeadPlaceholder): string {
  const text = p.phase === 'loading' ? '加载中…'
    : p.phase === 'degraded' ? degradeText(p.degrade)
      : p.phase === 'error' ? '报告摘要加载失败：' + p.message
        : '报告摘要端点未接线'
  const one = '<span class="dsh-pm-empty">' + esc(text) + '</span>'
  return '<div class="dsh-pm-stats" data-report-band="placeholder" data-band-state="' + p.phase + '">'
    + cell('做到哪了', one, ' data-band-cell="progress"')
    + cell('缺口', one, ' data-band-cell="gaps"')
    + cell('结果与成效', one, ' data-band-cell="outcome"')
    + '</div>'
}
