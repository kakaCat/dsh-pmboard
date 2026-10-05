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
import { STATUS_LABELS, fmtDur, isTerminal } from '../render/dom-utils.js'
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
 * 第三格：结果与成效（FR-5）。
 *
 * 未到验收段 → 解释性空态（说清"什么时候会出现"），不画空表格。
 * 已到验收段/终态 → 首屏摘要里**没有**逐项验收结论（`ReportResponse` 无该字段，见交付答复的契约缺口），
 * 所以这里只给"结论在哪看"的指针——**不编结论**。
 */
export function buildOutcomeCell(report: ReportResponse): string {
  const status = report.head.status
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
