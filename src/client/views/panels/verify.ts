/**
 * 「验收」Tab 面板（REQ-261006130057-7a43 · FR-8 / t3：面板实体填实）。
 *
 * 蓝本 = 原型 `docs/requirements/REQ-261006130057-7a43/prototypes/detail.html` v1.5 `#tab-verify`
 * （D-8：主视图是 **RTM 验收追踪列表**，逐项实际结果降级为行详情）。数据契约 =
 * `VerifyPanelResponse`（`shared/protocol.ts`，六段全可选）：
 * sheet / history / tracking（AcceptanceTracking）/ coverage / materials / pendingCount。
 *
 * 六条纪律（改代码时必须保住）：
 *  ① **脏载荷不炸**：`readVerify` 只做形状归一（全字段可选、逐元素对象守卫），
 *     不对 `undefined` 取字段——渲染路径上一处 TypeError 就是整块白屏（本仓踩过）。
 *  ② **两源对齐单点**：tracking 按 `fr_id` 归组，sheet 逐项按 `rtmTraceIdOf(source)`
 *     （domain 既有函数）归进同一组——不发明第二套对齐键。
 *  ③ **RTM 是增强层**（FR-9）：无 tracking / coverage 时**降级逐项平铺**（覆盖链列整体不渲染），
 *     绝不允许因 RTM 缺失让面板报错或画一列全 ✗ 的假覆盖。
 *  ④ **裁决复用既有 action**：待裁决项的「通过/不通过」= board-mount 已接的
 *     `data-action="submit-verdicts"` 收集链（`.dsh-pm-vsheet > .dsh-pm-vitem` 单选 + 意见输入，
 *     与 stage-panel 验收单逐项同款），**不给假按钮**；版本号缺失时不渲染控件、如实说明。
 *  ⑤ **not_verifiable 算已裁决**：待裁决计数只含 pending + unverified（与 domain
 *     `isFullyDecided` 同口径）；「待裁决 N 项」直接铺服务端 `pendingCount`，前端不另数一遍。
 *  ⑥ **空态不画空表格**：无 sheet / items 为空各一句解释（`data-verify-empty="1"`，
 *     沿用 docs 核验节删除前的两分支文案口径），两态产物里都没有 `<table>`。
 *
 * 根容器自带 `data-panel="verify"`（六面板共同约定：壳只写 `data-tab-host`，面板自足可断言）。
 *
 * @module dsh-pmboard/client/views/panels/verify
 */
import { esc } from '../../html.js'
import { mdInline } from '../../render/md-inline.js'
import type { ReportTabCtx, ReportTabDef } from '../report-tabs.js'
import type {
  ActorRef,
  VerificationItem,
  VerifyPanelResponse,
} from '../../../shared/protocol.js'
import type { AcceptanceTracking } from '../../../../vendor/reqboard/src/types/rtm.js'
// 对齐键单点（纪律②）：sheet 项 source → RTM fr_id 的判定只在 domain 一份。
import { rtmTraceIdOf } from '../../../domain/workflow/AcceptanceSheetSpec.js'
import { degradeText } from '../report-head.js'
import { fmtTime, windowCodeFromSessionId } from '../../render/dom-utils.js'

/** 端点 404 / 未装配时的固定文案（FR-8；与 `api.fetchReportVerify` 的降级 note 同一句）。 */
export const VERIFY_OLD_SERVER_TEXT = '服务端版本过旧，验收单暂在『文档』Tab 核验节查看'

/* ────────────────────────────────────────────────────────────── ① readVerify：归一化 */

/** 归一化后的视图（全可选；`history` 归一为数组便于渲染侧不判空）。 */
export interface VerifyView {
  sheet?: {
    version?: number
    reworkOnly: boolean
    generatedAt?: number
    items: VerificationItem[]
  }
  history: { version?: number; reworkOnly: boolean; generatedAt?: number; items: VerificationItem[] }[]
  tracking?: AcceptanceTracking[]
  coverage?: Record<string, { design: boolean; tasks: boolean; tests: boolean }>
  materials?: { summary?: string; evidence: string[] }
  pendingCount?: number
}

/** 脏读小工具：只取字符串 / 有限数 / 对象，其余按缺省（不抛、不放大脏数据）。 */
const str = (v: unknown): string => typeof v === 'string' ? v : ''
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined

function itemsOf(raw: unknown): VerificationItem[] {
  if (!Array.isArray(raw)) return []
  const out: VerificationItem[] = []
  for (const it of raw) if (obj(it) !== undefined) out.push(it as VerificationItem)
  return out
}

function sheetOf(raw: unknown): VerifyView['sheet'] {
  const s = obj(raw)
  if (s === undefined) return undefined
  return {
    ...(num(s.version) !== undefined ? { version: num(s.version) } : {}),
    reworkOnly: s.reworkOnly === true,
    ...(num(s.generatedAt) !== undefined ? { generatedAt: num(s.generatedAt) } : {}),
    items: itemsOf(s.items),
  }
}

function trackingOf(raw: unknown): AcceptanceTracking[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter((r): r is AcceptanceTracking => obj(r) !== undefined)
  return rows.length > 0 ? rows : undefined
}

function coverageOf(raw: unknown): VerifyView['coverage'] {
  const c = obj(raw)
  if (c === undefined) return undefined
  const out: NonNullable<VerifyView['coverage']> = {}
  for (const [fr, v] of Object.entries(c)) {
    const t = obj(v)
    if (t === undefined) continue
    out[fr] = { design: t.design === true, tasks: t.tasks === true, tests: t.tests === true }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function materialsOf(raw: unknown): VerifyView['materials'] {
  const m = obj(raw)
  if (m === undefined) return undefined
  const summary = str(m.summary).trim()
  return {
    ...(summary.length > 0 ? { summary } : {}),
    evidence: Array.isArray(m.evidence) ? m.evidence.filter((e): e is string => typeof e === 'string') : [],
  }
}

/**
 * `VerifyPanelResponse` 归一化（纪律①）：六段全可选、逐段守卫，脏载荷返回能渲染的视图，
 * 绝不抛——「没有这段数据」与「这段数据形状坏了」都落成各自的缺省分支。
 */
export function readVerify(data: unknown): VerifyView {
  const v = obj(data) as Partial<VerifyPanelResponse> | undefined
  if (v === undefined) return { history: [] }
  const history = Array.isArray(v.history)
    ? v.history.map(sheetOf).filter((s): s is NonNullable<VerifyView['sheet']> => s !== undefined)
    : []
  const pendingCount = num(v.pendingCount)
  return {
    ...(sheetOf(v.sheet) !== undefined ? { sheet: sheetOf(v.sheet) } : {}),
    history,
    ...(trackingOf(v.tracking) !== undefined ? { tracking: trackingOf(v.tracking) } : {}),
    ...(coverageOf(v.coverage) !== undefined ? { coverage: coverageOf(v.coverage) } : {}),
    ...(materialsOf(v.materials) !== undefined ? { materials: materialsOf(v.materials) } : {}),
    ...(pendingCount !== undefined ? { pendingCount } : {}),
  }
}

/* ────────────────────────────────────────────────────────────── ② 分组与行状态 */

/** 一个 FR 行：tracking 条目 + 对齐进来的 sheet 逐项（两源同组，纪律②）。 */
interface FrGroup {
  fr: string
  items: VerificationItem[]
  track: AcceptanceTracking[]
}

/** sheet 项 → 对齐键（`rtmTraceIdOf` 单点；脏 source 落 'UNKNOWN'，不炸、不静默丢项）。 */
function traceOf(item: VerificationItem): string {
  const src = item.source
  if (src !== null && typeof src === 'object') {
    const t = rtmTraceIdOf(src)
    if (typeof t === 'string' && t.length > 0) return t
  }
  return 'UNKNOWN'
}

/**
 * 归组：tracking 在册的 fr_id 先行（顺序 = tracking 首次出现序），sheet 逐项按对齐键进组；
 * 无 tracking 时降级为「按 sheet 逐项的 traceId 能归几行归几行」（纪律③）。
 */
function groupsOf(view: VerifyView): FrGroup[] {
  const groups = new Map<string, FrGroup>()
  const ensure = (fr: string): FrGroup => {
    let g = groups.get(fr)
    if (g === undefined) { g = { fr, items: [], track: [] }; groups.set(fr, g) }
    return g
  }
  for (const t of view.tracking ?? []) ensure(str(t.fr_id) || 'UNKNOWN').track.push(t)
  for (const it of view.sheet?.items ?? []) ensure(traceOf(it)).items.push(it)
  return [...groups.values()]
}

/** 行状态五值（chip 四态 + 全不可验收）：failed > pending > unverified > not_verifiable > pass。 */
type RowStatus = 'pass' | 'fail' | 'pending' | 'unverified' | 'nv'

function rowStatus(g: FrGroup): RowStatus {
  const statuses = g.items.length > 0
    ? g.items.map(i => str(i.status))
    : g.track.map(t => str(t.status))
  if (statuses.includes('failed')) return 'fail'
  if (statuses.includes('pending')) return 'pending'
  if (statuses.includes('unverified')) return 'unverified'
  if (statuses.length > 0 && statuses.every(s => s === 'not_verifiable')) return 'nv'
  return 'pass'
}

/** 行状态 chip 文案（✓/✗ 与裁决符号都是**真实文本字符**，不靠 CSS 伪元素冒充）。 */
const ROW_STATUS_TEXT: Readonly<Record<RowStatus, string>> = {
  pass: '✅ 通过',
  fail: '✖ 不通过',
  pending: '⏳ 待裁决',
  unverified: '未复核',
  nv: '不可验收',
}

/** 逐项裁决状态 chip（行展开里用；与行状态同口径，未裁决两态分开写清）。 */
const ITEM_STATUS_TEXT: Readonly<Record<string, string>> = {
  passed: '✅ 通过',
  failed: '✖ 不通过',
  pending: '⏳ 待裁决',
  unverified: '未复核',
  not_verifiable: '不可验收',
}

/* ────────────────────────────────────────────────────────────── 小工具 */

/** 裁决人 → 「谁判的」（含窗口码；缺省各有说辞，不留白）。 */
function byText(by: ActorRef | undefined): string {
  if (by === undefined || by === null) return '未记录裁决人'
  const kind = by.kind === 'human' ? '人（human）'
    : by.kind === 'agent' ? 'agent'
      : by.kind === 'system' ? '系统（system）' : ('未知操作者（' + String(by.kind) + '）')
  const sid = by.sessionId
  return sid === undefined || sid.length === 0 ? kind : kind + ' · ' + windowCodeFromSessionId(sid)
}

/** 时间格：缺了要有说辞，不渲染 "NaN-NaN"。 */
function timeText(raw: unknown): string {
  const t = num(raw)
  return t === undefined ? '未记录时间' : fmtTime(t)
}

/** 怎么验文本（`howToVerify` 缺省回落 criterion——与 accept-sheet-rtm-integration 同口径）。 */
function verifyTextOf(item: VerificationItem): string {
  return str(item.howToVerify).trim() || str(item.criterion)
}

/** 来源标（行展开逐项用）：可读文本 + 原始枚举（`data-verify-source`，审计与断言都认得出）。 */
function sourceTagOf(item: VerificationItem): { kind: string; label: string } {
  const s = item.source
  const kind = s !== null && typeof s === 'object' && typeof (s as { kind?: unknown }).kind === 'string'
    ? (s as { kind: string }).kind
    : 'unknown'
  switch (s?.kind) {
    case 'task': return { kind, label: 'task ' + s.taskId }
    case 'requirement': return { kind, label: 'requirement' }
    case 'prototype-compare': return { kind, label: 'prototype-compare' }
    case 'decision-compare': return { kind, label: 'decision-compare' }
    default: return { kind, label: '未知来源（' + kind + '）' }
  }
}

/** 覆盖链 chip：覆盖=绿底「设计 ✓」、缺=灰底描边「测试 ✗」（✓/✗ 真实文本）。 */
function covChip(key: 'design' | 'tasks' | 'tests', label: string, ok: boolean): string {
  return '<span class="dsh-pm-cov" data-cov="' + key + '" data-cov-ok="' + (ok ? 'yes' : 'no') + '">'
    + esc(label + (ok ? ' ✓' : ' ✗')) + '</span>'
}

/* ────────────────────────────────────────────────────────────── ③ 待裁决控件（复用既有 action） */

/**
 * 待裁决项的「通过/不通过」控件（纪律④）：与 stage-panel 验收单逐项**同一条**收集链——
 * board-mount `case 'submit-verdicts'` 从 `.dsh-pm-vsheet` 里逐 `.dsh-pm-vitem[data-item-id]`
 * 读「选中的单选 + `.dsh-pm-vitem-opinion` 的值」。预填规则也同口径：
 * needsHuman 项**不预填**（判定依据在人眼里）；其余有 `result` 的项预填**原文**
 * （value 与台账逐字节相同，改动即记人工填写）。
 */
function verdictControls(item: VerificationItem): string {
  const id = str(item.id)
  const needsHuman = item.needsHuman === true
  const result = str(item.result)
  const opinionInput = needsHuman
    ? '<input type="text" class="dsh-pm-vitem-opinion" placeholder="未自动验证：请写你看到的界面事实（通过必填）">'
    : (result.trim().length > 0
      ? '<input type="text" class="dsh-pm-vitem-opinion is-prefilled" value="' + esc(result) + '"'
        + ' placeholder="已预填 agent 实测结果；改动即记为人工填写">'
      : '<input type="text" class="dsh-pm-vitem-opinion" placeholder="通过可留空（无实测结果则记未复核） / 不通过填意见（必填）">')
  return '<div class="dsh-pm-vitem dsh-pm-rtm-vitem" data-item-id="' + esc(id) + '"'
    + (needsHuman ? ' data-needs-human="1"' : '') + '>'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(id) + '</code>'
    + '<label class="dsh-pm-verdict-btn"><input type="radio" name="verdict-' + esc(id) + '" value="passed"> 通过</label>'
    + '<label class="dsh-pm-verdict-btn"><input type="radio" name="verdict-' + esc(id) + '" value="failed"> 不通过</label>'
    + opinionInput
    + '</div>'
}

/** 已裁决项的一行留痕：时间 + 人 + 意见（缺哪个说哪个，不留白）。 */
function judgeLine(item: VerificationItem): string {
  const opinion = str(item.opinion).trim()
  return '<div class="dsh-pm-rtm-judge">'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(str(item.id)) + '</code> '
    + esc(timeText(item.decidedAt)) + ' · ' + esc(byText(item.decidedBy))
    + (opinion.length > 0 ? ' · 意见：' + mdInline(opinion) : ' · <span class="dsh-pm-hint">无意见（裁决时未写）</span>')
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ④ 行展开（原生 details） */

/** 行展开里的一条验收项：标准 / 实际结果 / 需人工（含原因）/ 证据 / 意见，逐项铺开。 */
function detailItem(item: VerificationItem): string {
  const status = str(item.status)
  const src = sourceTagOf(item)
  const needsHuman = item.needsHuman === true
  const reason = str(item.humanReason).trim()
  const result = str(item.result).trim()
  const resultSrc = item.resultSource === 'agent' ? 'agent 实测'
    : item.resultSource === 'human' ? '人工填写' : '未标注来源'
  const evidence = Array.isArray(item.evidence) ? item.evidence.filter(e => typeof e === 'string') : []
  const opinion = str(item.opinion).trim()
  return '<div class="dsh-pm-rtm-item" data-item-id="' + esc(str(item.id)) + '"'
    + ' data-verify-source="' + esc(src.kind) + '"'
    + (needsHuman ? ' data-needs-human="1"' : '') + '>'
    + '<div class="dsh-pm-rtm-item-head">'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(str(item.id)) + '</code> '
    + '<span class="dsh-pm-src-tag" data-source-kind="' + esc(src.kind) + '">' + esc(src.label) + '</span> '
    + '<span class="dsh-pm-verdict" data-v="' + esc(status) + '">'
    + esc(ITEM_STATUS_TEXT[status] ?? ('未知裁决：' + status)) + '</span>'
    + (needsHuman ? ' <span class="dsh-pm-nh-flag">无法自验·需人工</span>' : '')
    + '</div>'
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">标准：</span>' + mdInline(str(item.criterion)) + '</div>'
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">实际结果（' + esc(resultSrc) + '）：</span>'
    + (result.length > 0 ? mdInline(result) : '<span class="dsh-pm-hint">尚无实测结果</span>') + '</div>'
    + (needsHuman
      ? '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">需人工：</span>'
        + (reason.length > 0 ? mdInline(reason) : '<span class="dsh-pm-hint">未写原因</span>') + '</div>'
      : '')
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">证据：</span>'
    + (evidence.length > 0
      ? '<ul class="dsh-pm-evidence">' + evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      : '<span class="dsh-pm-hint">未提供证据</span>') + '</div>'
    + (opinion.length > 0
      ? '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">意见：</span>' + mdInline(opinion) + '</div>'
      : '')
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ⑤ RTM 主表 */

/**
 * RTM 验收追踪列表（`data-rtm-table="1"`）：每 FR 一行 `tr[data-fr]` + 一行原生 details 展开
 * （`data-fr-detail`）。覆盖链列**仅当 coverage 有数据时整列渲染**（纪律③：无 RTM 不画假覆盖）。
 */
export function renderRtmTable(view: VerifyView, reqId: string): string {
  const sheet = view.sheet
  if (sheet === undefined || sheet.items.length === 0) return ''
  const groups = groupsOf(view)
  const withCoverage = view.coverage !== undefined
  const cols = withCoverage ? 5 : 4
  const colgroupNote = withCoverage ? '' : ' data-rtm-fallback="1"'

  const rows = groups.map((g) => {
    const st = rowStatus(g)
    const needsHuman = g.items.some(i => i.needsHuman === true)
    const nvCount = g.items.filter(i => str(i.status) === 'not_verifiable').length
    // 怎么验：一组多项时逐项拼接（一行截断 + title 全文，截断交给 CSS，文本不丢字）
    const verifyTexts = g.items.length > 0
      ? g.items.map(verifyTextOf).filter(t => t.trim().length > 0)
      : g.track.map(t => str(t.verification)).filter(t => t.trim().length > 0)
    const verifyFull = verifyTexts.join('；')
    const pendingItems = g.items.filter(i => str(i.status) === 'pending' || str(i.status) === 'unverified')
    const decidedItems = g.items.filter(i => str(i.status) !== 'pending' && str(i.status) !== 'unverified')

    const covCell = !withCoverage ? ''
      : '<td class="dsh-pm-rtm-cov">'
        + (view.coverage?.[g.fr] !== undefined
          ? covChip('design', '设计', view.coverage[g.fr]!.design)
            + covChip('tasks', '任务', view.coverage[g.fr]!.tasks)
            + covChip('tests', '测试', view.coverage[g.fr]!.tests)
          : '<span class="dsh-pm-hint">无该 FR 的追溯记录</span>')
        + '</td>'
    const verdictCell = '<td class="dsh-pm-rtm-verdict-cell">'
      + '<span class="dsh-pm-verdict" data-v="' + st + '">' + esc(ROW_STATUS_TEXT[st]) + '</span>'
      + (needsHuman ? ' <span class="dsh-pm-nh-flag">无法自验·需人工</span>' : '')
      + (st === 'pass' && nvCount > 0
        ? ' <span class="dsh-pm-hint">含 ' + String(nvCount) + ' 项不可验收</span>'
        : '')
      + '</td>'
    const judgeCell = '<td class="dsh-pm-rtm-judge-cell">'
      + decidedItems.map(judgeLine).join('')
      + pendingItems.map(verdictControls).join('')
      + (decidedItems.length === 0 && pendingItems.length === 0
        ? '<span class="dsh-pm-hint">该 FR 在验收单里没有逐项（仅 RTM 追踪记录）</span>'
        : '')
      + '</td>'

    const mainRow = '<tr data-fr="' + esc(g.fr) + '" data-fr-status="' + st + '">'
      + '<td class="dsh-pm-rtm-fr"><span class="dsh-pm-rtm-fr-id">' + esc(g.fr) + '</span>'
      + ' <span class="dsh-pm-hint">' + String(g.items.length > 0 ? g.items.length : g.track.length) + ' 项</span></td>'
      + covCell
      + '<td class="dsh-pm-rtm-ver"'
      + (verifyFull.length > 0 ? ' title="' + esc(verifyFull) + '"' : '') + '>'
      + (verifyFull.length > 0 ? mdInline(verifyFull) : '<span class="dsh-pm-hint">未写验收方法</span>')
      + '</td>'
      + verdictCell
      + judgeCell
      + '</tr>'
    // 行展开：原生 details（默认收起），逐项的实际结果 / 需人工+原因 / 证据全在里面
    const detailRow = '<tr class="dsh-pm-rtm-detail-row"><td colspan="' + String(cols) + '">'
      + '<details class="dsh-pm-rtm-detail" data-fr-detail="' + esc(g.fr) + '">'
      + '<summary>逐项明细（' + String(g.items.length > 0 ? g.items.length : g.track.length) + ' 项）：'
      + '实际结果 / 需人工 / 证据</summary>'
      + (g.items.length > 0
        ? g.items.map(detailItem).join('')
        : '<div class="dsh-pm-hint">该 FR 只有 RTM 追踪记录，验收单里没有逐项可铺。</div>')
      + '</details></td></tr>'
    return mainRow + detailRow
  }).join('')

  // 汇总行：a/b 通过 · c 待裁决 · d 不通过（待裁决 = 含 pending/unverified 的行，纪律⑤）
  const failed = groups.filter(g => rowStatus(g) === 'fail').length
  const pendingRows = groups.filter(g => rowStatus(g) === 'pending' || rowStatus(g) === 'unverified').length
  const passed = groups.length - failed - pendingRows
  const version = sheet.version
  const versionChip = '<span class="dsh-pm-chip"'
    + (version !== undefined ? ' data-sheet-version="' + String(version) + '"' : '') + '>'
    + esc('验收单 ' + (version !== undefined ? 'v' + String(version) : '版本未记录')
      + (sheet.reworkOnly ? ' · 返工续验只含未过项' : ''))
    + '</span>'
  const pendingChip = view.pendingCount !== undefined
    ? '<span class="dsh-pm-chip" data-pending-count="' + String(view.pendingCount) + '">'
      + '待裁决 ' + String(view.pendingCount) + ' 项</span>'
    : ''
  const fallbackNote = view.tracking === undefined
    ? '<span class="dsh-pm-hint">RTM 追踪缺失：覆盖链不显示（增强层降级，逐项裁决不受影响）</span>'
    : (withCoverage ? '' : '<span class="dsh-pm-hint">覆盖链数据缺失：该列不显示（增强层降级）</span>')
  const anyPending = sheet.items.some(i => str(i.status) === 'pending' || str(i.status) === 'unverified')
  const submitBar = anyPending
    ? (version !== undefined
      ? '<div class="dsh-pm-rtm-submit">'
        + '<button type="button" class="dsh-pm-btn sm primary" data-action="submit-verdicts"'
        + ' data-req="' + esc(reqId) + '" data-version="' + String(version) + '">提交裁决</button>'
        + '<span class="dsh-pm-hint">逐项选「通过 / 不通过」后提交：不通过须写意见；「无法自验·需人工」项通过须写你看到的实测。</span>'
        + '</div>'
      : '<div class="dsh-pm-rtm-submit"><span class="dsh-pm-hint">验收单版本号缺失（台账脏数据）：'
        + '逐项裁决暂不可用，请走会话内 reqboard_accept_sheet 裁决。</span></div>')
    : ''

  const head = '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">RTM 验收追踪 · 每 FR 一行</span>'
    + '<span class="dsh-pm-hint">生成于 ' + esc(timeText(sheet.generatedAt))
    + ' · 覆盖链 = 设计→任务→测试（RTM 增强层）</span></div>'
  const progress = '<div class="dsh-pm-rtm-progress" data-rtm-progress="1">'
    + '<span>FR 验收进度 <b>' + String(passed) + '/' + String(groups.length) + '</b> 通过'
    + ' · <b>' + String(pendingRows) + '</b> 待裁决'
    + ' · <b>' + String(failed) + '</b> 不通过</span>'
    + versionChip + pendingChip + fallbackNote
    + '</div>'
  const table = '<table class="dsh-pm-docs-table dsh-pm-rtm-table" data-rtm-table="1"'
    + ' data-rtm-cols="' + String(cols) + '"' + colgroupNote + '>'
    + '<thead><tr><th>FR</th>'
    + (withCoverage ? '<th>覆盖链（设计→任务→测试）</th>' : '')
    + '<th>怎么验</th><th>验收状态</th><th>裁决 · 意见</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
  // .dsh-pm-vsheet 是既有 submit-verdicts 收集链的作用域（纪律④）：整表一份，提交按钮收全部行
  return '<div class="dsh-pm-block" data-verify-section="rtm">'
    + '<div class="dsh-pm-vsheet" data-req="' + esc(reqId) + '"'
    + (version !== undefined ? ' data-version="' + String(version) + '"' : '') + '>'
    + head + progress + table + submitBar
    + '</div></div>'
}

/* ────────────────────────────────────────────────────────────── ⑥ 材料 / 历史 / 空态 */

/** 验收材料：交付结论 + 证据清单（来自 `materials`；没有就如实说，不编）。 */
function materialsSection(view: VerifyView): string {
  const m = view.materials
  if (m === undefined) {
    return '<div class="dsh-pm-block" data-verify-materials="1">'
      + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">验收材料</span>'
      + '<span class="dsh-pm-hint">服务端未给材料摘要（materials 缺省）</span></div></div>'
  }
  return '<div class="dsh-pm-block" data-verify-materials="1">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">验收材料</span>'
    + '<span class="dsh-pm-hint">交付结论 + 证据清单</span></div>'
    + (m.summary !== undefined
      ? '<p class="dsh-pm-ver-sum"><b>交付结论：</b>' + mdInline(m.summary) + '</p>'
      : '<p class="dsh-pm-ver-sum"><span class="dsh-pm-hint">未写交付结论（提交材料里没有 summary）</span></p>')
    + (m.evidence.length > 0
      ? '<ul class="dsh-pm-ev-list" data-verify-evidence="1">'
        + m.evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      : '<div class="dsh-pm-hint">未附证据清单（evidence 为空）</div>')
    + '</div>'
}

/** 一行历史版本：版本 + 主导状态 chip + 生成时间 + 逐项计数（不编「已退回」——payload 没有审核结论字段）。 */
function historyRow(s: VerifyView['history'][number]): string {
  const items = s.items
  const passed = items.filter(i => str(i.status) === 'passed').length
  const failed = items.filter(i => str(i.status) === 'failed').length
  const pending = items.filter(i => str(i.status) === 'pending' || str(i.status) === 'unverified').length
  const nv = items.filter(i => str(i.status) === 'not_verifiable').length
  const dominant: RowStatus = failed > 0 ? 'fail' : pending > 0 ? 'pending' : items.length > 0 ? 'pass' : 'nv'
  const counts: string[] = []
  if (passed > 0) counts.push(String(passed) + ' 通过')
  if (failed > 0) counts.push(String(failed) + ' 不通过')
  if (pending > 0) counts.push(String(pending) + ' 待裁决')
  if (nv > 0) counts.push(String(nv) + ' 不可验收')
  return '<div class="dsh-pm-hist-row"'
    + (s.version !== undefined ? ' data-history-version="' + String(s.version) + '"' : '') + '>'
    + '<span class="dsh-pm-h-ver">' + esc(s.version !== undefined ? 'v' + String(s.version) : 'v?') + '</span>'
    + (items.length > 0
      ? '<span class="dsh-pm-verdict" data-v="' + dominant + '">' + esc(ROW_STATUS_TEXT[dominant]) + '</span>'
      : '<span class="dsh-pm-hint">无逐项</span>')
    + '<span class="dsh-pm-h-note">' + esc(timeText(s.generatedAt))
    + (counts.length > 0 ? ' · ' + esc(counts.join(' · ')) : '')
    + (s.reworkOnly ? ' · 返工续验只含未过项' : '')
    + '</span></div>'
}

/** 历史版本节：验收单每次提交一个版本，驳回留痕不丢；没有历史就如实一句。 */
function historySection(view: VerifyView): string {
  return '<div class="dsh-pm-block" data-verify-history="1">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">历史版本</span>'
    + '<span class="dsh-pm-hint">验收单每次提交一个版本，旧版逐项留痕</span></div>'
    + (view.history.length > 0
      ? view.history.map(historyRow).join('')
      : '<div class="dsh-pm-hint">无历史版本（验收单只有当前一版，或还没提交过）</div>')
    + '</div>'
}

/** 空态两分支（纪律⑥）：沿用 docs 核验节删除前的文案口径，不画空表格。 */
function emptySection(view: VerifyView): string {
  if (view.sheet === undefined) {
    return '<div class="dsh-pm-empty dsh-pm-verify-empty" data-verify-empty="1">'
      + '<div class="dsh-pm-ve-row"><b>没交</b><span>尚未提交验收材料——这不是缺失，是流程还没走到。</span></div>'
      + '<div class="dsh-pm-ve-row"><b>找谁交</b><span>由窗口 agent 用 '
      + '<code>reqboard_submit(kind=verification)</code> 提交：做了什么 + 怎么验的 + 看到什么结果。</span></div>'
      + '<div class="dsh-pm-ve-row"><b>交了会看到什么</b><span>这里按 FR 铺开 RTM 验收追踪列表'
      + '（每 FR 一行：覆盖链 / 怎么验 / 验收状态 / 裁决意见，行展开看逐项实际结果），'
      + '并给材料摘要、证据清单与历史版本。</span></div>'
      + '</div>'
  }
  return '<div class="dsh-pm-empty" data-verify-empty="1">'
    + '验收材料已提交，但验收单里没有逐项记录（没有逐项）'
    + '——这里不画空表格：没有逐项就没有可裁决的东西。</div>'
}

/* ────────────────────────────────────────────────────────────── 入口 */

/** 验收面板正文（纯字符串、零副作用：取数归壳，点击归 board-mount 既有委派）。 */
function renderVerify(data: unknown, ctx: ReportTabCtx): string {
  const view = readVerify(data)
  const empty = view.sheet === undefined || view.sheet.items.length === 0
  return '<section class="dsh-pm-verify" data-panel="verify">'
    + (empty ? emptySection(view) : renderRtmTable(view, ctx.requirementId))
    // 空态两分支都不许出现 <table>（纪律⑥）：材料 / 历史一律列表与行，不用表格
    + (view.sheet === undefined && view.materials === undefined ? '' : materialsSection(view))
    + historySection(view)
    + '</section>'
}

export const verifyPanel: ReportTabDef = {
  key: 'verify',
  label: '验收',
  // 角标 = 待裁决项数（pending + unverified），服务端数好（`tabCounts.verify`，
  // 与 `VerifyPanelResponse.pendingCount` / `outcome.pendingItems` 同口径单点）；
  // 无验收单 = 字段缺省 → 不渲染角标（禁 '0' 冒充「还没验收」）。
  badge: (report) => report?.tabCounts?.verify,
  render: (data, ctx) => renderVerify(data, ctx),
  // 旧服务端（没有 /verify 端点）不是"加载失败"：给去向，不给重试假象；
  // 其余降级原因走通用四句（不吞 note）。
  degraded: (d) => d.reason === 'port-unavailable' ? VERIFY_OLD_SERVER_TEXT : degradeText(d),
}
