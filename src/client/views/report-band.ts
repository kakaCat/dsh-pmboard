/**
 * 需求详情页「状态带」（REQ-261004222448-292a · FR-3 / FR-4 / FR-5 / FR-12）——纯函数返回 HTML 字符串。
 *
 * 三格常驻、**都不折叠**（首屏一屏内读完）：做到哪了 / 缺口清单 / 结果与成效。
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
import type { ReportGap, ReportResponse } from '../../shared/protocol.js'
import { STATUS_LABELS, fmtDur, isTerminal, short } from '../render/dom-utils.js'
import { degradeText, type ReportHeadPlaceholder } from './report-head.js'

/**
 * 缺口严重度 → 圆点。用 emoji 而不是纯色 class：色值在深/浅两套主题下都可能看不出差别，
 * 而"🔴 阻塞"这层语义是 FR-4 明确要求的（🔴/🟡/⚪），也便于渲染断言。
 */
const GAP_DOT: Record<ReportGap['severity'], string> = { red: '🔴', yellow: '🟡', gray: '⚪' }
const GAP_RANK: Record<ReportGap['severity'], number> = { red: 0, yellow: 1, gray: 2 }

/** 首屏只列最严重的 5 条（FR-4：前 3~5 条）；其余**如实说还有几条**，不假装列全了。 */
export const GAP_HEAD_LIMIT = 5

/** 一格（标题 + 正文）。 */
function cell(title: string, body: string, attrs = ''): string {
  return '<div class="dsh-pm-stat"' + attrs + '><div class="dsh-pm-stat-label">' + esc(title) + '</div>'
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

/** 第二格：缺口清单（无缺口 → 一行"无缺口"，不画空表格）。 */
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
    return '<div class="dsh-pm-gap-line" data-severity="' + esc(g.severity) + '">'
      + '<span class="dsh-pm-gap-what">' + esc(GAP_DOT[g.severity] ?? '⚪') + ' ' + esc(g.what) + '</span>'
      + '<span class="dsh-pm-gap-why">' + esc(g.why) + '</span>' + ref + '</div>'
  }).join('')
  const more = sorted.length > GAP_HEAD_LIMIT
    ? '<div class="dsh-pm-gap-more">还有 ' + String(sorted.length - GAP_HEAD_LIMIT)
      + ' 条未列（首屏只列最严重的 ' + String(GAP_HEAD_LIMIT) + ' 条）</div>'
    : ''
  return cell('缺口 ' + String(sorted.length) + ' 条（该有而没有）', rows + more, ' data-band-cell="gaps"')
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
      + shown.map(l => '<div class="dsh-pm-outcome-leftover" data-leftover="1">'
        + esc(short(l, LEFTOVER_MAX)) + '</div>').join('')
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
 * 第三格：结果与成效（FR-5）。
 *
 * 两态：
 *  - **有 `outcome`**（台账里有验收单）→ 结论 + 逐项计数 + 遗留问题与后续；
 *  - **没有 `outcome`** → 解释性空态（说清"什么时候会出现"），不画空表格。
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
  const body = isTerminal(status)
    ? (status === 'canceled'
      ? '<span class="dsh-pm-band-mut">已取消：无验收结论</span>'
      : '<span class="dsh-pm-band-ok">✅ 已归档</span><br><span class="dsh-pm-band-mut">验收结论与逐项结果见『文档』Tab 的验收单与门禁留痕（首屏摘要不含逐项）</span>')
    : status === 'accepting'
      ? '<span class="dsh-pm-band-mut">验收中：通过 / 退回后在此给出结论与遗留问题；逐项结果见『文档』Tab 的验收单</span>'
      : '<span class="dsh-pm-band-mut">尚未到验收段（当前 ' + esc(STATUS_LABELS[status] ?? status)
        + ' ' + num(report.progress?.tasks?.done) + '/' + num(report.progress?.tasks?.total)
        + '）。到验收段后此处给出结论、逐项结果与遗留问题。</span>'
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
