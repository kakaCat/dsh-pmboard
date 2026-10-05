/**
 * 「对话」Tab 面板（REQ-261004222448-292a · FR-6 / t-2be0cd）——**一条流**渲染（纯函数）。
 *
 * 读者口径：这是**会议记录**，像微信那样**一条连续时间线**（不按窗口分组、不折叠成块）。
 * 因此这里只做三件事：把服务端给的条目按时间排成一条流、把三类消息渲染成三种样子、
 * 给出「加载更早 / 页内检索 / 回复」三个入口。
 *
 * 三条不变量（改代码时必须保住）：
 *  ① **不在前端拼工具内容**：过滤在服务端做（`tool/call`、`tool/result`、`reasoning`、
 *     `run_code` 与过程叙述不进响应）。本模块**只读 `kind/at/text/windowKey/evt/inferred`**，
 *     其余字段一律不看——看了就会把服务端刚滤掉的东西又拼回页面，两处过滤必然漂移。
 *     这条是 FR-6 的机械判据（产物里不得出现工具调用/推理字样），tests/dialogue-panel.test.ts 有反例断言。
 *  ② **系统消息与人类消息同一容器、同一时间序**：机器事件（阶段推进 / 计划退回 / 交接 /
 *     中断 / 裁决）居中灰底小字混排，**不**另起一块、**不**置顶置底。
 *  ③ **不做内层滚动**：列表长了靠页面滚动（内层滚动条会藏住内容，也会让"有多少"变成不可数）。
 *     本模块产物里不出现任何 `overflow: auto|scroll`。
 *
 * 关于 `inferred === true`（回填标）：这类系统消息是事后由 `createdAt` + 评论**反推**出来的
 * 既有事件，不是当时实时发生的。不标会被读成"刚刚推进了阶段"——那是错误结论，所以必须显眼标。
 *
 * @module dsh-pmboard/client/views/panels/dialogue
 */
import { esc } from '../../html.js'
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
 * 时间升序（**同一容器**里的唯一顺序）。`Array#sort` 稳定 → 同一时刻的多条消息保持服务端给的相对次序，
 * 不因为排序把「谁先说的」抖乱。
 */
export function orderDialogue(items: readonly DialogueMessage[]): DialogueMessage[] {
  return [...items].sort((a, b) => a.at - b.at)
}

/* ────────────────────────────────────────────────────────────── 检索（纯前端） */

/** 页内关键词检索只作用于**已加载**的条目（更早的还没取，搜不到就去点「加载更早」）。 */
export function filterDialogueItems(
  items: readonly DialogueMessage[],
  query: string,
): DialogueMessage[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return [...items]
  return items.filter(it => it.text.toLowerCase().includes(q))
}

/**
 * 命中高亮（**先转义再包 `<mark>`**：转义在前，插入的标记只可能是我们自己写的）。
 * 用 `indexOf` 逐段切而不是正则：关键词是人手输的，正则元字符（`.`、`(`、`*`）不该被当成语法。
 */
export function highlightDialogueText(text: string, query: string): string {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return esc(text)
  const hay = text.toLowerCase()
  let out = ''
  let i = 0
  for (;;) {
    const hit = hay.indexOf(needle, i)
    if (hit < 0) { out += esc(text.slice(i)); return out }
    out += esc(text.slice(i, hit))
      + '<mark class="dsh-pm-dialogue-hit" data-dialogue-hit="1">'
      + esc(text.slice(hit, hit + needle.length)) + '</mark>'
    i = hit + needle.length
  }
}

/* ────────────────────────────────────────────────────────────── 单条渲染 */

/** 时间戳不可得时照实说，不让 `NaN-NaN` 冒充时间。 */
function timeLabel(at: number): string {
  return Number.isFinite(at) ? fmtTime(at) : '时间不可得'
}

/** 消息元信息（actor + 窗口码可读标注 + 时间）——每条都要能回答"谁、哪个窗口、什么时候"。 */
function metaHtml(item: DialogueMessage): string {
  const time = '<time class="dsh-pm-msg-time">' + esc(timeLabel(item.at)) + '</time>'
  if (item.kind === 'system') return '<span class="dsh-pm-msg-meta">' + time + '</span>'
  const actor = '<span class="dsh-pm-msg-actor" data-actor="' + item.kind + '">'
    + (item.kind === 'human' ? '人' : 'agent') + '</span>'
  // 窗口码给人看（w-xxxxxxxx）；完整会话 id 留在 title 里，需要精确引用时可用
  const win = item.windowKey === undefined ? ''
    : '<span class="dsh-pm-msg-window" title="' + esc(item.windowKey) + '">窗口 '
      + esc(windowCodeFromSessionId(item.windowKey)) + '</span>'
  return '<span class="dsh-pm-msg-meta">' + [actor, win, time].filter(p => p.length > 0).join(' · ') + '</span>'
}

/**
 * 一条消息。`data-msg-text-raw` 存**原文**（转义后入属性），供检索在 DOM 上就地重绘高亮——
 * 这样搜索不需要重新取数、也不需要把整份载荷留在内存里。
 *
 * 人 / agent = 气泡（`dsh-pm-msg--human` / `--agent`，两种视觉）；
 * 系统 = 居中灰底小字，**且不含任何回复控件**（FR-6：系统消息不可回复——回复入口只有底部那一个）。
 */
function itemHtml(item: DialogueMessage, query: string): string {
  const attrs = ' data-msg="' + item.kind + '" data-at="' + esc(String(item.at)) + '"'
    + ' data-msg-text-raw="' + esc(item.text) + '"'
  const body = highlightDialogueText(item.text, query)
  if (item.kind === 'system') {
    const evt = item.evt === undefined ? '' : ' data-evt="' + esc(item.evt) + '"'
    const inferred = item.inferred === true
      ? '<span class="dsh-pm-msg-inferred" data-inferred="1"'
        + ' title="由台账时间与评论反推的既有事件：不是当时实时发生的">回填</span>'
      : ''
    return '<div class="dsh-pm-msg dsh-pm-msg--system"' + evt + attrs + '>'
      + '<span class="dsh-pm-msg-system-text" data-msg-text="1">' + body + '</span>'
      + inferred + metaHtml(item) + '</div>'
  }
  const windowAttr = item.windowKey === undefined ? '' : ' data-window="' + esc(item.windowKey) + '"'
  return '<div class="dsh-pm-msg dsh-pm-msg--' + item.kind + '" data-actor="' + item.kind + '"'
    + windowAttr + attrs + '>'
    + '<div class="dsh-pm-msg-head">' + metaHtml(item) + '</div>'
    + '<div class="dsh-pm-msg-text" data-msg-text="1">' + body + '</div>'
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 整面板渲染 */

/** 检索栏（输入框 + **说清检索范围**的说明 + 命中计数）。 */
function searchBarHtml(loadedCount: number, total: number | undefined, hits: number): string {
  const rest = total === undefined ? undefined : total - loadedCount
  const scope = '只过滤已加载的 ' + String(loadedCount) + ' 条'
    + (rest !== undefined && rest > 0
      ? '；服务端还有 ' + String(rest) + ' 条更早的未加载（先点「加载更早」，再搜）'
      : '')
  return '<div class="dsh-pm-dialogue-search">'
    + '<input type="text" class="dsh-pm-input" data-dialogue-search="1"'
    + ' placeholder="在已加载的对话里搜关键词…" aria-label="在已加载的对话里搜关键词" />'
    + '<span class="dsh-pm-dialogue-hits" data-dialogue-hits="1">命中 ' + String(hits)
    + ' / 已加载 ' + String(loadedCount) + '</span>'
    + '<span class="dsh-pm-dialogue-scope" data-dialogue-search-scope="loaded">' + esc(scope) + '</span>'
    + '</div>'
}

/**
 * 分页条。游标优先用服务端给的 `page.before`；服务端省略时退到**已加载最旧一条的 `at`**
 * （`before` 的语义就是时间游标，这不是猜数字，是从已加载窗口推出来的同一个游标）；
 * 两者都没有 = 游标不可得 → 按钮禁用并写明原因（**不留假出口**）。
 *
 * `hasMore === false` 时按钮仍渲染但禁用 + 写明「已到最早一条」：按钮的**有无**不该随数据变化
 * （CSS/断言都按选择器找它），可点性才是状态。
 */
function moreBarHtml(loaded: LoadedDialogue, oldestAt: number | undefined): string {
  const cursor = loaded.before ?? oldestAt
  const usable = loaded.hasMore && cursor !== undefined
  const why = !loaded.pageKnown
    ? '分页信息不可得（服务端未给 page）：不知道还有没有更早的'
    : loaded.hasMore
      ? (cursor === undefined ? '服务端说有更早的，但没给游标（page.before）：加载更早不可用' : '还有更早的消息未加载')
      : '已到最早一条'
  return '<div class="dsh-pm-dialogue-more">'
    + '<button type="button" class="dsh-pm-btn" data-action="dialogue-load-earlier" data-load-earlier="1"'
    // 游标只在**可点**时才写进 DOM：禁用按钮上留一个 data-before 会变成接线方的脚枪
    // （照着 dataset.before 取数，却没人注意按钮是禁用的）
    + (usable && cursor !== undefined ? ' data-before="' + esc(String(cursor)) + '"' : '')
    + (usable ? '' : ' disabled')
    + ' title="' + esc(why) + '">加载更早</button>'
    + '<span class="dsh-pm-dialogue-more-note">' + esc(why) + '</span>'
    + '</div>'
}

/** 底部回复框：**沿用**既有评论提交链路（`data-role="comment-input"` + `add-comment`），不新造通道。 */
function replyFormHtml(requirementId: string): string {
  return '<div class="dsh-pm-comment-form dsh-pm-dialogue-reply" data-actor="human">'
    + '<input type="text" class="dsh-pm-input" data-role="comment-input"'
    + ' placeholder="回复（以「人」身份记录，走既有评论通道）…" />'
    + '<button type="button" class="dsh-pm-btn" data-action="add-comment" data-target="req" data-id="'
    + esc(requirementId) + '">发送</button></div>'
}

/**
 * 面板正文（纯函数）。`query` 缺省 = 不过滤（渲染路径上不搜）；
 * 检索生效时的重绘由 `applyDialogueSearch` 在 DOM 上就地完成（不重新取数）。
 */
export function renderDialogue(data: unknown, ctx: ReportTabCtx, query = ''): string {
  const loaded = readDialogue(data)
  if (loaded === undefined) {
    // **不回显载荷原文**：把不可信载荷原样贴进页面，等于把服务端的过滤白做一遍
    return '<div class="dsh-pm-empty" data-panel="dialogue" data-dialogue-shape="unknown">'
      + '对话载荷不是对话形状（缺 items 数组）：不猜、也不回显原文，请重试或查服务端日志</div>'
  }
  const items = orderDialogue(loaded.items)
  const shown = query.trim().length === 0 ? items : filterDialogueItems(items, query)
  const list = items.length === 0
    ? '<div class="dsh-pm-empty" data-dialogue-empty="1">这条需求还没有对话记录：'
      + '人会以「人」气泡、实施窗口以 agent 气泡出现；阶段推进 / 计划退回 / 交接 / 中断 / 裁决等机器事件'
      + '以居中的系统消息混排在这一条流里（本面板只显示人机文本，工具调用与推理过程不在此列）</div>'
    : shown.map(it => itemHtml(it, query)).join('')
  const droppedNote = loaded.dropped === 0 ? ''
    : '<div class="dsh-pm-dialogue-note" data-dialogue-dropped="' + esc(String(loaded.dropped)) + '">有 '
      + esc(String(loaded.dropped)) + ' 条非对话内容已被忽略（面板只渲染人与 agent 的文本消息）</div>'
  const total = loaded.total ?? items.length
  return '<div class="dsh-pm-dialogue" data-panel="dialogue"'
    + ' data-dialogue-total="' + esc(String(total)) + '" data-dialogue-loaded="' + esc(String(items.length)) + '">'
    + searchBarHtml(items.length, loaded.total, shown.length)
    + droppedNote
    // 人机文本与系统消息**同一个容器**：FR-6 的机械判据（不分组、不另起块）
    + '<div class="dsh-pm-dialogue-list" data-dialogue-list="1">' + list + '</div>'
    + moreBarHtml(loaded, items.length === 0 ? undefined : items[0].at)
    + replyFormHtml(ctx.requirementId)
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 检索接线（DOM 层） */

/**
 * 把「页内检索」落到 DOM 上（由 board-mount 在 `data-dialogue-search` 的 input 事件里调用）。
 *
 * 为什么是就地过滤而不是重新渲染整个面板：面板 HTML 由壳的缓存数据渲染，输入的检索词没有
 * 回传通道（改壳的契约超出本卡范围）；就地过滤也不需要把载荷留在内存里——
 * 原文就在 `data-msg-text-raw` 上。**只过滤已加载的部分**，这一点由检索栏的说明文案讲明白。
 *
 * 返回值 = 命中数（调用方可用于埋点/断言）；根节点没有查询能力时静默返回 0（宿主桩不炸）。
 */
export function applyDialogueSearch(root: HTMLElement, query: string): number {
  if (typeof root.querySelectorAll !== 'function') return 0
  const q = query.trim().toLowerCase()
  const nodes = root.querySelectorAll<HTMLElement>('[data-msg]')
  let hits = 0
  nodes.forEach((el) => {
    const raw = el.getAttribute('data-msg-text-raw') ?? ''
    const hit = q.length === 0 || raw.toLowerCase().includes(q)
    if (hit) hits += 1
    // hidden 之外再留一个属性：样式里若有 display 规则会盖掉 [hidden]，data-msg-hit 是第二道判据
    el.hidden = !hit
    el.setAttribute('data-msg-hit', hit ? '1' : '0')
    const textEl = el.querySelector<HTMLElement>('[data-msg-text]')
    if (textEl !== null) textEl.innerHTML = highlightDialogueText(raw, q)
  })
  const counter = typeof root.querySelector === 'function'
    ? root.querySelector<HTMLElement>('[data-dialogue-hits]')
    : null
  if (counter !== null) {
    counter.textContent = '命中 ' + String(hits) + ' / 已加载 ' + String(nodes.length)
  }
  return hits
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
