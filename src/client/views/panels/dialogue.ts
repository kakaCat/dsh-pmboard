/**
 * 「对话」Tab 面板（REQ-261004222448-292a · FR-6 / t-2be0cd；REQ-261006130057-7a43 · FR-6 / t7）——
 * **聊天 App 形态**渲染（纯函数），蓝本 = 原型 `detail.html` v1.5 的 `#FR-6`（D-5 气泡 / D-6 只读 / D-7 吸顶分页条）。
 *
 * 读者口径：这是**历史聊天记录（只读）**，像微信那样一条连续时间线（不按窗口分组、不折叠成块）：
 *  · 「人」靠右蓝实心气泡（白字）+ 右侧圆形头像「人」；
 *  · 窗口 / agent 靠左浅紫气泡 + 左头像（有窗口码 = 窗口「w」，名字签写全「窗口 w-xxxxxxxx」；
 *    无窗口码 = 任务 agent「a」，名字签「agent」——载荷里没有任务 id，**不编一个冒充**）；
 *  · 系统事件居中灰丸不占气泡，`inferred === true` 带 `data-inferred="1"` 琥珀「回填」标；
 *  · 时间戳 10.5px 等宽放名字签行；长日志气泡默认折叠一行 + 「长日志已收纳」琥珀标 + 「展开」就地放开
 *    （`<details>/<summary>` 原生折叠，与状态带「展开说明」同一种机制，不需要新接线）；
 *  · 分页条是 `.chat-scroll`（460px 固定高内滚动容器，`data-chat-scroll="1"`）**内部第一个子元素**，
 *    `position: sticky; top: 0`（`data-chat-pager="1"`）——`.chat-scroll` 是「无内层滚动」铁律的
 *    唯一豁免（design/architecture §边界裁决 3）；分页 = 向上加载更早；
 *  · 底部没有回复框、没有检索框（D-6）：原位一行居中灰字只读说明。
 *
 * 三条不变量（改代码时必须保住）：
 *  ① **不在前端拼工具内容**：过滤在服务端做（`tool/call`、`tool/result`、`reasoning`、
 *     `run_code` 与过程叙述不进响应）。本模块**只读 `kind/at/text/windowKey/evt/inferred`**，
 *     其余字段一律不看——看了就会把服务端刚滤掉的东西又拼回页面，两处过滤必然漂移。
 *     这条是 FR-6 的机械判据（产物里不得出现工具调用/推理字样），tests/dialogue-panel.test.ts 有反例断言。
 *  ② **系统消息与人类消息同一容器、同一时间序**：机器事件（阶段推进 / 计划退回 / 交接 /
 *     中断 / 裁决）居中灰丸混排，**不**另起一块、**不**置顶置底。
 *  ③ **除 `.chat-scroll` 外不做内层滚动**：产物里不出现其它任何 `overflow: auto|scroll`。
 *
 * 关于 `inferred === true`（回填标）：这类系统消息是事后由 `createdAt` + 评论**反推**出来的
 * 既有事件，不是当时实时发生的。不标会被读成"刚刚推进了阶段"——那是错误结论，所以必须显眼标。
 *
 * @module dsh-pmboard/client/views/panels/dialogue
 */
import { esc } from '../../html.js'
import { mdInlineEscaped } from '../../render/md-inline.js'
import { fmtTime, windowCodeFromSessionId } from '../../render/dom-utils.ts'
import type { DialogueSystemEvt } from '../../../shared/protocol.js'
import type { ReportTabCtx, ReportTabDef } from '../report-tabs.js'

/* ────────────────────────────────────────────────────────────── 载荷形状 */

/**
 * 归一化后的消息（**渲染只认这三种**）。
 *
 * 为什么自己定一个类型而不是直接用 `DialogueItem`：`DialogueItem` 的 system 变体要求 `evt` 必填，
 * 而旧服务端/中间层可能漏字段。漏了 evt 就丢掉整条系统消息 = 把真实发生过的机器事件藏起来，
 * 所以这里把 `evt` 放宽成可选（缺了就不渲染 `data-evt`，**不编一个枚举值冒充**）。
 * 该类型是 `DialogueItem` 的超集，调用方喂协议类型同样成立。
 */
export type DialogueMessage =
  | { kind: 'human' | 'agent'; at: number; text: string; windowKey?: string }
  | { kind: 'system'; at: number; text: string; evt?: DialogueSystemEvt; inferred?: boolean }

/** 归一化结果（分页字段与服务端原话分开：判"还有没有更早"必须靠服务端，不靠前端推算）。 */
export interface LoadedDialogue {
  items: DialogueMessage[]
  /** 被丢弃的条目数（kind 不是 human/agent/system，或 at/text 不成形）——服务端漏过滤时如实计数 */
  dropped: number
  /** 服务端是否给了 `page`（缺了 = 分页不可判，不许猜成"没有更早"） */
  pageKnown: boolean
  hasMore: boolean
  before?: number
  total?: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const finiteNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const SYSTEM_EVTS: readonly DialogueSystemEvt[] = [
  'stage-advance', 'plan-rejected', 'handoff', 'interrupt', 'confirm-pending', 'verify',
]

const isSystemEvt = (v: unknown): v is DialogueSystemEvt =>
  typeof v === 'string' && (SYSTEM_EVTS as readonly string[]).includes(v)

/**
 * 把不可信载荷读成「一条流」。
 *
 * 返回 `undefined` = **载荷不是对话形状**（而不是"对话是空的"）——两种"没有"必须分开报，
 * 否则端点未接线时页面会显示"还没有对话"，把故障读成事实。
 */
export function readDialogue(data: unknown): LoadedDialogue | undefined {
  if (!isRecord(data) || !Array.isArray(data.items)) return undefined
  const items: DialogueMessage[] = []
  let dropped = 0
  for (const raw of data.items) {
    if (!isRecord(raw)) { dropped += 1; continue }
    const kind = raw.kind
    const at = finiteNumber(raw.at)
    const text = typeof raw.text === 'string' ? raw.text : undefined
    if (at === undefined || text === undefined) { dropped += 1; continue }
    if (kind === 'system') {
      const evt = isSystemEvt(raw.evt) ? raw.evt : undefined
      items.push({
        kind: 'system', at, text,
        ...(evt === undefined ? {} : { evt }),
        ...(raw.inferred === true ? { inferred: true } : {}),
      })
      continue
    }
    if (kind === 'human' || kind === 'agent') {
      const windowKey = typeof raw.windowKey === 'string' && raw.windowKey.length > 0 ? raw.windowKey : undefined
      items.push({ kind, at, text, ...(windowKey === undefined ? {} : { windowKey }) })
      continue
    }
    // kind 不是三类对话消息 = 工具/推理类载荷漏过了服务端过滤：丢掉且**不回显其内容**
    dropped += 1
  }
  const page = isRecord(data.page) ? data.page : undefined
  const before = page === undefined ? undefined : finiteNumber(page.before)
  const total = page === undefined ? undefined : finiteNumber(page.total)
  return {
    items,
    dropped,
    pageKnown: page !== undefined,
    hasMore: page?.hasMore === true,
    ...(before === undefined ? {} : { before }),
    ...(total === undefined ? {} : { total }),
  }
}

/**
 * 时间升序（**同一容器**里的唯一顺序；D-5：旧在上新在下）。`Array#sort` 稳定 →
 * 同一时刻的多条消息保持服务端给的相对次序，不因为排序把「谁先说的」抖乱。
 */
export function orderDialogue(items: readonly DialogueMessage[]): DialogueMessage[] {
  return [...items].sort((a, b) => a.at - b.at)
}

/* ────────────────────────────────────────────────────────────── 单条渲染 */

/** 每页条数（页码口径的分母）：与服务端 `QueryDialogue` 的 DEFAULT_LIMIT 同值。 */
export const DIALOGUE_PAGE_SIZE = 40

/**
 * 长日志判据（与 FR-3「最近评论」同一口径）：>120 字符或含换行 → 默认折叠一行 +
 * 「长日志已收纳」琥珀标 + 「展开」就地放开。
 */
export const isLongDialogueText = (text: string): boolean => text.length > 120 || text.includes('\n')

/** 时间戳不可得时照实说，不让 `NaN-NaN` 冒充时间。 */
function timeLabel(at: number): string {
  return Number.isFinite(at) ? fmtTime(at) : '时间不可得'
}

/** 时间戳（10.5px 等宽，放名字签行）。 */
function timeHtml(item: DialogueMessage): string {
  return '<time class="dsh-pm-msg-time">' + esc(timeLabel(item.at)) + '</time>'
}

/** 名字签 / 头像文案（每条都要能回答"谁、哪个窗口"）。 */
function whoOf(item: DialogueMessage): { name: string; avatar: string; title: string } {
  if (item.kind === 'human') return { name: '人', avatar: '人', title: '人' }
  if (item.kind === 'agent' && item.windowKey !== undefined) {
    // 窗口码给人看（w-xxxxxxxx）；完整会话 id 留在 title 里，需要精确引用时可用
    const code = windowCodeFromSessionId(item.windowKey)
    return { name: '窗口 ' + code, avatar: 'w', title: '窗口 agent（' + item.windowKey + '）' }
  }
  // 载荷里没有任务 id（DialogueItem 只带 windowKey）：名字签只写「agent」，不编一个 t-xxxxxx 冒充
  return { name: 'agent', avatar: 'a', title: '任务 agent' }
}

/**
 * 气泡正文。`long === true` 时用 `<details>/<summary>` 原生折叠：合上 = 一行截断 + 琥珀标 + 「展开」，
 * 展开 = 完整气泡就地放开（与状态带「展开说明」同机制，样式在 styles/report.ts 的 FR-6 标记块里）。
 */
function bubbleHtml(kind: 'human' | 'agent', body: string, long: boolean): string {
  const cls = 'dsh-pm-bubble dsh-pm-bubble--' + kind
  if (!long) return '<div class="' + cls + '">' + body + '</div>'
  const flag = '<span class="dsh-pm-b-flag" data-long-flag="1">长日志已收纳</span>'
  return '<details class="dsh-pm-long" data-msg-long="1">'
    + '<summary class="dsh-pm-long-head">'
    + '<span class="' + cls + ' dsh-pm-bubble--long">' + flag + body + '</span>'
    + '<span class="dsh-pm-long-toggle">'
    + '<span class="dsh-pm-long-open">展开</span><span class="dsh-pm-long-close">收起</span>'
    + '</span></summary>'
    + '<div class="' + cls + '">' + flag + body + '</div>'
    + '</details>'
}

/**
 * 一条消息。
 *
 * 人 = 靠右蓝实心气泡 + 右侧圆形头像「人」（meta 行右对齐：时间在前、名字签在后）；
 * agent = 靠左浅紫气泡 + 左头像（窗口「w」/ 任务 agent「a」，meta 行：名字签在前、时间在后）；
 * 系统 = 居中灰丸，**不占气泡**（`inferred` 带 `data-inferred="1"` 琥珀「回填」标）。
 */
function itemHtml(item: DialogueMessage): string {
  const attrs = ' data-msg="' + item.kind + '" data-at="' + esc(String(item.at)) + '"'
  // 正文是**文档原文**（`**加粗**`、`` `innerHTML` `` 一样会出现）：先转义，再走与页面其它处同一份 md 内联渲染
  const body = mdInlineEscaped(esc(item.text))
  if (item.kind === 'system') {
    const evt = item.evt === undefined ? '' : ' data-evt="' + esc(item.evt) + '"'
    const inferred = item.inferred === true
      ? '<span class="dsh-pm-msg-inferred" data-inferred="1"'
        + ' title="由台账时间与评论反推的既有事件：不是当时实时发生的">回填</span>'
      : ''
    return '<div class="dsh-pm-msg dsh-pm-msg--system"' + evt + attrs + '>'
      + '<span class="dsh-pm-msg-system-pill">'
      + '<span class="dsh-pm-msg-system-text">' + body + '</span>'
      + inferred + timeHtml(item) + '</span></div>'
  }
  const who = whoOf(item)
  const right = item.kind === 'human'
  const avatar = '<span class="dsh-pm-avatar dsh-pm-avatar--' + item.kind + '"'
    + ' title="' + esc(who.title) + '">' + esc(who.avatar) + '</span>'
  const name = '<b class="dsh-pm-who">' + esc(who.name) + '</b>'
  // 原型口径：右侧（人）meta 行 = 时间 · 名字签；左侧（窗口/agent）= 名字签 · 时间
  const meta = '<div class="dsh-pm-cmsg-meta">'
    + (right ? timeHtml(item) + name : name + timeHtml(item)) + '</div>'
  const col = '<div class="dsh-pm-cmsg-col">' + meta + bubbleHtml(item.kind, body, isLongDialogueText(item.text)) + '</div>'
  const windowAttr = item.windowKey === undefined ? '' : ' data-window="' + esc(item.windowKey) + '"'
  return '<div class="dsh-pm-msg dsh-pm-msg--' + item.kind + ' dsh-pm-cmsg dsh-pm-cmsg--'
    + (right ? 'right' : 'left') + '" data-actor="' + item.kind + '"' + windowAttr + attrs + '>'
    + (right ? col + avatar : avatar + col) + '</div>'
}

/* ────────────────────────────────────────────────────────────── 分页条（吸顶） */

/**
 * 当前页码 N（页 = 已加载批次，40 条/页；M = ceil(total/40)）。
 * 「向上加载更早」= 已加载窗口向**更早**生长：N = M − ceil(未加载条数/40)，夹在 [1, M]。
 */
function currentPageNo(loadedCount: number, total: number): number {
  const m = Math.max(1, Math.ceil(total / DIALOGUE_PAGE_SIZE))
  const earlier = Math.max(0, total - loadedCount)
  const n = m - Math.ceil(earlier / DIALOGUE_PAGE_SIZE)
  return Math.min(Math.max(n, 1), m)
}

/**
 * 吸顶分页条（D-7）：`.chat-scroll` 内部**第一个子元素**，`position: sticky; top: 0`。
 * 浅蓝底工具条：实心小按钮「↑ 加载更早消息」+ 加粗「第 N/M 页」+ 次级灰「已加载 x/y 条」。
 *
 * 游标优先用服务端给的 `page.before`；服务端省略时退到**已加载最旧一条的 `at`**
 * （`before` 的语义就是时间游标，这不是猜数字，是从已加载窗口推出来的同一个游标）；
 * 两者都没有 = 游标不可得 → 按钮禁用并写明原因（**不留假出口**）。
 *
 * `pageKnown === false` 时分页条整体降级为不可用态 + 说明（**不猜**「没有更早」）；
 * `hasMore === false` 时按钮仍渲染但禁用 + 写明「已到最早一条」：按钮的**有无**不该随数据变化
 * （CSS/断言都按选择器找它），可点性才是状态。
 */
function chatPagerHtml(loaded: LoadedDialogue, loadedCount: number, oldestAt: number | undefined): string {
  const cursor = loaded.before ?? oldestAt
  const usable = loaded.hasMore && cursor !== undefined
  const why = !loaded.pageKnown
    ? '分页信息不可得（服务端未给 page）：不知道还有没有更早的'
    : loaded.hasMore
      ? (cursor === undefined ? '服务端说有更早的，但没给游标（page.before）：加载更早不可用' : '还有更早的消息未加载')
      : '已到最早一条'
  // primary：本面板唯一主动作；且 ⑲ 段 :is(.dsh-pm-btn…) 的 surface 复位在源序上压过
  // chat-earlier 的蓝底规则——不带 primary 会白底白字（联调实测截图抓出）。
  const btn = '<button type="button" class="dsh-pm-btn primary dsh-pm-chat-earlier"'
    + ' data-action="dialogue-load-earlier" data-load-earlier="1"'
    // 游标只在**可点**时才写进 DOM：禁用按钮上留一个 data-before 会变成接线方的脚枪
    // （照着 dataset.before 取数，却没人注意按钮是禁用的）
    + (usable && cursor !== undefined ? ' data-before="' + esc(String(cursor)) + '"' : '')
    + (usable ? '' : ' disabled')
    + ' title="' + esc(why) + '">↑ 加载更早消息</button>'
  const pageNo = loaded.pageKnown && loaded.total !== undefined
    ? '<b class="dsh-pm-chat-page">第 ' + String(currentPageNo(loadedCount, loaded.total)) + '/'
      + String(Math.max(1, Math.ceil(loaded.total / DIALOGUE_PAGE_SIZE))) + ' 页</b>'
    : ''
  const loadedInfo = '<span class="dsh-pm-chat-loaded">已加载 ' + String(loadedCount)
    + (loaded.pageKnown && loaded.total !== undefined ? '/' + String(loaded.total) : '') + ' 条</span>'
  return '<div class="dsh-pm-chat-pager" data-chat-pager="1"'
    + (loaded.pageKnown ? '' : ' data-pager-state="degraded"') + '>'
    + btn + '<span class="dsh-pm-chat-pg">' + pageNo + loadedInfo + '</span>'
    + '<span class="dsh-pm-chat-note">' + esc(why) + '</span></div>'
}

/** 只读说明行（D-6）：底部没有回复框/检索框，原位一行居中灰字。 */
function readonlyNoteHtml(total: number, loadedCount: number): string {
  return '<div class="dsh-pm-dialogue-ro" data-dialogue-readonly="1">'
    + '历史聊天记录 · 只读 —— 会话消息按 createdAt 正序回填，共 ' + String(total)
    + ' 条，本页 ' + String(loadedCount) + ' 条</div>'
}

/* ────────────────────────────────────────────────────────────── 整面板渲染 */

/**
 * 面板正文（纯函数）。结构（对照原型 `#FR-6`）：
 * `.dsh-pm-dialogue` → [丢弃计数行] + `.dsh-pm-chat-scroll`（吸顶分页条 + 消息列表）+ 只读说明行。
 * `_ctx` 保留在签名里（`ReportTabDef.render` 的契约），只读面板没有要用它的地方。
 */
export function renderDialogue(data: unknown, _ctx: ReportTabCtx): string {
  const loaded = readDialogue(data)
  if (loaded === undefined) {
    // **不回显载荷原文**：把不可信载荷原样贴进页面，等于把服务端的过滤白做一遍
    return '<div class="dsh-pm-empty" data-panel="dialogue" data-dialogue-shape="unknown">'
      + '对话载荷不是对话形状（缺 items 数组）：不猜、也不回显原文，请重试或查服务端日志</div>'
  }
  const items = orderDialogue(loaded.items)
  const list = items.length === 0
    ? '<div class="dsh-pm-empty" data-dialogue-empty="1">这条需求还没有对话记录：'
      + '人会以「人」气泡、实施窗口以 agent 气泡出现；阶段推进 / 计划退回 / 交接 / 中断 / 裁决等机器事件'
      + '以居中的系统消息混排在这一条流里（本面板只显示人机文本，工具调用与推理过程不在此列）</div>'
    : items.map(it => itemHtml(it)).join('')
  const droppedNote = loaded.dropped === 0 ? ''
    : '<div class="dsh-pm-dialogue-note" data-dialogue-dropped="' + esc(String(loaded.dropped)) + '">有 '
      + esc(String(loaded.dropped)) + ' 条非对话内容已被忽略（面板只渲染人与 agent 的文本消息）</div>'
  const total = loaded.total ?? items.length
  return '<div class="dsh-pm-dialogue" data-panel="dialogue"'
    + ' data-dialogue-total="' + esc(String(total)) + '" data-dialogue-loaded="' + esc(String(items.length)) + '">'
    + droppedNote
    // `.chat-scroll`：「无内层滚动」铁律的唯一豁免（460px 固定高内滚动）；分页条是其第一个子元素
    + '<div class="dsh-pm-chat-scroll" data-chat-scroll="1">'
    + chatPagerHtml(loaded, items.length, items.length === 0 ? undefined : items[0].at)
    // 人机文本与系统消息**同一个容器**：FR-6 的机械判据（不分组、不另起块）
    + '<div class="dsh-pm-dialogue-list" data-dialogue-list="1">' + list + '</div>'
    + '</div>'
    + readonlyNoteHtml(total, items.length)
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 注册 */

export const dialoguePanel: ReportTabDef = {
  key: 'dialogue',
  label: '对话',
  // 角标数字只能来自首屏 report 快照里的**服务端计数**（T-8）。
  // 对话条数要读会话事件——首屏是唯一请求，不为了一个角标加读，故服务端留空
  // （取不到 → undefined = 不渲染角标，绝不用前端遍历推算的数字冒充）。
  badge: (report) => report?.tabCounts?.dialogue,
  render: (data, ctx) => renderDialogue(data, ctx),
}
