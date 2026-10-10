/**
 * 看板 pending 票组件（REQ-261007223647-da5d t8/t9 · serves: FR-5 / 设计 frontend.md 组件树）。
 *
 * 治什么（2026-10-07 现场）：确认票超时/中断后仍然挂着，人却不知道——票只活在会话里，
 * 人不开会话就永远发现不了，下游也就一直卡着。
 *
 * 组件树（本文件 = 叶子的唯一实现处）：
 *   PendingConfirmBand（容器，无票零渲染）
 *   └─ PendingTicketRow（一票一行）
 *      ├─ 标题（target/kind + 需求 id）
 *      ├─ 倒计时（本地递减，不轮询；到零切「已超时」态但仍可答）
 *      ├─ 「去作答」（跳既有确认区）
 *      └─ 「重投」（调 t4 的 repost 端点——**如实查询**，不假装重弹）
 *
 * 纯字符串渲染（无 DOM 依赖）：本仓没有 jsdom，渲染断言一律落在 HTML 文本上。
 *
 * @module dsh-pmboard/client/views/pending-confirm
 */
import type { BoardPendingConfirm } from '../types.ts'

/** 票 TTL 兜底值（旧服务端不给 expires_at 时用；与 domain/limits.pendingConfirmTtlMs 同值）。 */
const PENDING_TTL_FALLBACK_MS = 30 * 60_000

/** 剩余毫秒：优先服务端给的到期时刻（绝对时刻，重算即准）→ 服务端剩余读数 → created_at + TTL 兜底。 */
export function remainingMsOf(t: BoardPendingConfirm, now: number): number {
  if (typeof t.expires_at === 'number') return Math.max(0, t.expires_at - now)
  if (typeof t.remaining_ms === 'number') return Math.max(0, t.remaining_ms)
  const base = typeof t.interrupted_at === 'number' ? t.interrupted_at : t.created_at
  return Math.max(0, base + PENDING_TTL_FALLBACK_MS - now)
}

/**
 * 倒计时文案（形状对齐原型 `#FR-5`）：`剩余 26:41`（mm:ss）；到零 = `已超时`
 * （票仍可答——超时不等于作废，行内另行明说）。
 *
 * 为什么用 mm:ss 而不是「剩 27 分钟」：原型给的是逐秒读数，人在门快到期时需要的是"还有几十秒"
 * 而不是一个会被四舍五入到同一分钟的粗读数。
 */
export function countdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return '已超时'
  const total = Math.max(0, Math.floor(remainingMs / 1_000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return '剩余 ' + mm + ':' + ss
}

/** kind 的中文名（人看的不是机器词）。 */
const KIND_ZH: Readonly<Record<string, string>> = {
  requirement: '需求文档',
  design: '设计文档',
  plan: '拆分计划',
  decomposition: '拆分计划',
  prototype: '原型',
  verification: '验收材料',
  archive: '归档材料',
}

/** 一行票的标题：等的是哪一道门 + 需求 id（形状对齐原型 `#FR-5`：「验收确认 · REQ-…」）。 */
export function pendingTicketTitle(t: BoardPendingConfirm): string {
  const what = t.target === 'plan'
    ? '拆分计划待批准'
    : (t.kind === undefined ? '确认待作答' : (KIND_ZH[t.kind] ?? t.kind) + '待确认')
  return what + ' · ' + t.requirement_id
}

/** HTML 属性转义（本模块不拖渲染层，最小实现）。 */
function esc(s: string): string {
  return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;')
}

/**
 * 一行 pending 票（PendingTicketRow 叶子；含四个内部叶子：标题 / 倒计时 / 去作答 / 重投）。
 *
 * 形状与文案对齐权威原型 `prototypes/detail.html#FR-5`：
 * 🔔 前缀 · 「<门名> · <REQ-id>」· 「剩余 mm:ss」（到零「已超时」+ 「票仍有效，可一键重投」）·
 * 「去作答」/「重投弹框」两个按钮。
 *
 * 数据属性是**渲染断言的落点**（`data-ticket` / `data-remaining-ms` / `data-timed-out`），
 * 也是本地倒计时刷新时的定位依据。
 */
export function renderPendingTicketRow(t: BoardPendingConfirm, now: number): string {
  const remaining = remainingMsOf(t, now)
  const timedOut = remaining <= 0
  return '<div class="dsh-pm-pending-row" data-ticket="' + esc(t.ticket) + '"'
    + ' data-requirement-id="' + esc(t.requirement_id) + '"'
    + ' data-target="' + esc(t.target) + '"'
    + (t.kind === undefined ? '' : ' data-kind="' + esc(t.kind) + '"')
    + (timedOut ? ' data-timed-out="yes"' : '') + '>'
    + '<span class="dsh-pm-pending-bell" aria-hidden="true">🔔</span>'
    + '<span class="dsh-pm-pending-title">' + esc(pendingTicketTitle(t)) + '</span>'
    + (timedOut
      // 原型原话：「已超时 —— 票仍有效，可一键重投」；超时不等于作废，这句必须让人看见
      ? '<span class="dsh-pm-pending-note">票仍有效，可一键重投</span>'
      : '')
    + '<span class="dsh-pm-pending-countdown" data-remaining-ms="' + String(remaining) + '">'
    + esc(countdownLabel(remaining)) + '</span>'
    + '<button type="button" class="dsh-pm-btn sm primary" data-action="pending-answer"'
    + ' data-id="' + esc(t.requirement_id) + '" data-ticket="' + esc(t.ticket) + '"'
    + ' title="到这条需求的确认区作答（看板作答与弹框作答同一道门）">去作答</button>'
    + '<button type="button" class="dsh-pm-btn sm" data-action="pending-repost"'
    + ' data-id="' + esc(t.requirement_id) + '" data-ticket="' + esc(t.ticket) + '"'
    + ' title="查这张票还在不在等（票还有效时会给出两条真能走的路）">重投弹框</button>'
    + '</div>'
}

/**
 * 首屏横带（PendingConfirmBand 容器）。
 *
 * 三条口径（设计 frontend.md §空态与降级）：
 *  ① **无票 → 零渲染**（不占首屏；不是"渲染一个空盒子"）；
 *  ② 取数失败 → 一行红字「pending 票读取失败」+ 原因（不静默，FR-12 口径）；
 *  ③ 有票 → 容器 + 逐行铺开（`data-pending-count` 供断言与对账）。
 */
export function renderPendingConfirmBand(
  tickets: readonly BoardPendingConfirm[] | undefined,
  opts: { now: number; error?: string },
): string {
  if (opts.error !== undefined && opts.error.length > 0) {
    return '<div class="dsh-pm-pending-band" data-pending-error="yes">'
      + '<span class="dsh-pm-pending-error">⚠ pending 票读取失败：' + esc(opts.error) + '</span></div>'
  }
  const list = tickets ?? []
  if (list.length === 0) return ''
  const rows = list.map(t => renderPendingTicketRow(t, opts.now)).join('')
  return '<div class="dsh-pm-pending-band" data-pending-count="' + String(list.length) + '">'
    + '<div class="dsh-pm-pending-band-head">⏳ 有 ' + String(list.length)
    + ' 道确认门在等你作答（未作答前下游产物会被拦住）</div>'
    + rows
    + '</div>'
}

/**
 * 本地倒计时刷新（**不轮询**）：把每行的剩余时间减 `elapsedMs`，到零切「已超时」态。
 *
 * 为什么不用重新请求：票的失效时刻是服务端给的绝对时刻，本地每秒递减与再取一次等价，
 * 但不会为了一个倒计时把看板变成轮询器；票的增减仍由既有 SSE / 20s 轮询驱动重绘。
 *
 * 返回被改动的行数（0 = 没有票，调用方可据此停表）。
 */
export function tickPendingCountdowns(root: ParentNode, elapsedMs: number): number {
  const nodes = root.querySelectorAll<HTMLElement>('.dsh-pm-pending-countdown')
  let n = 0
  nodes.forEach((node) => {
    const prev = Number(node.dataset.remainingMs ?? '0')
    const next = Math.max(0, (Number.isFinite(prev) ? prev : 0) - elapsedMs)
    node.dataset.remainingMs = String(next)
    node.textContent = countdownLabel(next)
    const row = node.closest<HTMLElement>('.dsh-pm-pending-row')
    if (row !== null) {
      if (next <= 0) row.setAttribute('data-timed-out', 'yes')
      else row.removeAttribute('data-timed-out')
    }
    n += 1
  })
  return n
}
