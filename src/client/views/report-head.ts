/**
 * 需求详情页「常驻头部」（REQ-261004222448-292a · FR-3 / FR-12）——纯函数返回 HTML 字符串。
 *
 * 为什么单独一个模块：头部是详情页**唯一常驻不折叠**的一块（身份 + 阶段条 + 一句话结论 +
 * 操作条 + 窗口跳转）。它必须能在任意一次台账变更后**只换自己**（分段局部更新），所以它得是
 * 一个独立的字符串段，而不是混在整页模板里——混在一起就只能整页 `innerHTML` 重绘，
 * 滚动位置 / 展开态 / 评论草稿全丢（那正是本需求要修的旧病）。
 *
 * 三条纪律：
 *  - **操作条是现有能力，不得回退**：按 `actions[]` 逐条渲染，每条带**后果说明**，
 *    `humanOnly` 显式标「需人操作」（不是隐藏——藏起来人会以为"这功能没有"）；
 *    动作按钮接的是**既有事件通道**（`move-req` / `plan-approve` / `plan-reject` /
 *    `verify-pass` / `verify-rework`），不新造一套写路径。
 *  - **终态一律只读**：archived / canceled / done 只留 `← 看板`（连评论框、窗口跳转都不渲染）——
 *    不多一条"点了必被拒"的假出口。
 *  - **不编**：缺字段就少说一句，绝不用 `0` 冒充"未知 / 未采集"（FR-12）。
 *
 * @module dsh-pmboard/client/views/report-head
 */
import { esc } from '../html.js'
import type { ActorRef, Degrade, PromptDifficulty, ReportAction, ReportHead, ReportResponse } from '../../shared/protocol.js'
import { ALL_PROMPT_DIFFICULTIES, PROMPT_DIFFICULTY_DESCRIPTIONS } from '../../shared/protocol.js'
import {
  CATEGORY_LABELS, STATUS_LABELS, commentActorLabel, fmtDur, fmtTime, isTerminal, windowCodeFromSessionId,
} from '../render/dom-utils.js'
import { buildProgressDots } from './stage-detail.js'

/**
 * 降级文案的**单一事实源**（FR-12）：四种 `reason` 各自一句人话，禁 0、禁留白。
 *
 * 为什么放在头部模块而不是 `report-tabs.ts`：头部占位与六个面板都要用它；放 report-tabs
 * 会让 `report-head` 反向 import `report-tabs`（而成环）。
 */
export function degradeText(d: Degrade): string {
  const say = d.reason === 'port-unavailable' ? '不可用（端口未装配）'
    : d.reason === 'file-missing' ? '文件缺失'
      : d.reason === 'ledger-unreadable' ? '不可用（台账读不到）'
        : '无 token 快照'
  const note = typeof d.note === 'string' ? d.note.trim() : ''
  return note.length === 0 ? say : say + '：' + note
}

/**
 * 头部占位（报告摘要还没到 / 读不到 / 端点未接线）。
 *
 * 为什么要有显式占位而不是"整块不渲染"：常驻头部是页面的骨架。少一块的话，
 * 数据到达时页面会整体跳动；而"加载中"与"读不到"是两件事，各有说辞（FR-12）。
 */
export type ReportHeadPlaceholder =
  | { phase: 'loading' }
  | { phase: 'degraded'; degrade: Degrade }
  | { phase: 'error'; message: string; notFound?: boolean }
  | { phase: 'unsupported' }

/** 头部占位渲染：只有非 404 的失败才给「重试」（404 是"这条路不存在"，重试没意义）。 */
export function buildReportHeadPlaceholder(p: ReportHeadPlaceholder): string {
  const text = p.phase === 'loading' ? '常驻头部加载中…'
    : p.phase === 'degraded' ? degradeText(p.degrade)
      : p.phase === 'error' ? '报告摘要加载失败：' + p.message
        : '报告摘要端点未接线（沿用现有详情页）'
  const retry = p.phase === 'error' && p.notFound !== true
    ? '<button type="button" class="dsh-pm-btn" data-action="report-head-retry">重试</button>'
    : ''
  // 行盒（`dsh-pm-rh-bar`）与真实头部同一套结构：占位也该长成"结论头的操作条"，
  // 否则数据到达时整块跳动（样式见 styles/report.ts 的「① 壳体与常驻头部」）。
  return '<div class="dsh-pm-detail-head dsh-pm-rh" data-report-head="placeholder" data-head-state="' + p.phase + '">'
    + '<div class="dsh-pm-rh-bar" data-report-actionbar="1">'
    + '<button type="button" class="dsh-pm-btn" data-action="back" title="返回看板">← 看板</button>'
    + '<span class="dsh-pm-empty">' + esc(text) + '</span>'
    + retry
    + '</div>'
    + '</div>'
}

/**
 * 动作按钮 → **既有**事件通道（`data-action` 值）。
 *
 * 为什么复用而不是新造 `data-action="report-action"`：写路径（推进/批准/验收/取消）在
 * board-mount 里已有完整分支（含确认框、覆盖说明、失败提示）。新造一条只会得到一份
 * 没有确认保护、也不会留痕的旁路——那是能力回退，不是重构。
 *
 * `cancel` 映射到 `move-req` + `to=canceled`：与既有 `renderActionBar` 的「立项取消」同款。
 */
const ACTION_CHANNEL: Record<ReportAction['key'], string> = {
  move: 'move-req',
  cancel: 'move-req',
  'plan-approve': 'plan-approve',
  'plan-reject': 'plan-reject',
  'verify-pass': 'verify-pass',
  'verify-rework': 'verify-rework',
}

/** 难度标签：认得的级别取「标准」这种短名；**认不得的照实显示**（不回落成"标准"假装认得）。 */
function difficultyLabel(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  const known = (ALL_PROMPT_DIFFICULTIES as readonly string[]).includes(raw)
  if (!known) return raw
  return PROMPT_DIFFICULTY_DESCRIPTIONS[raw as PromptDifficulty].split(' - ')[0]
}

/** 窗口角色标注（FR-3：跳转按钮带角色）。席位表里查不到 → 如实写"角色未知"，不猜 owner。 */
const ROLE_LABEL: Record<'owner' | 'worker' | 'observer', string> = {
  owner: '主人',
  worker: '协作',
  observer: '旁观',
}

/**
 * 窗口跳转按钮（**现有能力，不得回退**）。
 *
 * 每个席位窗口一个按钮：`data-action="jump-session"` + `data-sid`（既有通道），
 * 另加 `data-jump-session="<windowKey>"` 标记与 `data-role` 标注，便于断言与审计。
 * **已归档会话仍是可点按钮**（先恢复再打开）——渲染成灰死按钮就是回退：
 * 用户点了没反应且不知道为什么（REQ-261002153446-c600 已修的缺陷）。
 */
export function buildWindowJumps(report: ReportResponse): string {
  const jumps = report.head.sessionJump ?? []
  if (jumps.length === 0) return ''
  const seats = report.head.seats ?? []
  const buttons = jumps.map((j) => {
    const seat = seats.find(s => s.windowKey === j.windowKey)
    const role = seat?.role
    const roleText = role === undefined ? '角色未知' : ROLE_LABEL[role] + '(' + role + ')'
    const title = j.archived
      ? '该会话已归档：点击取消归档并打开'
      : '跳转到该窗口'
    return '<button type="button" class="dsh-pm-window' + (j.archived ? ' is-archived' : '') + '"'
      + ' data-action="jump-session" data-sid="' + esc(j.windowKey) + '"'
      + ' data-jump-session="' + esc(j.windowKey) + '"'
      + ' data-role="' + esc(role ?? 'unknown') + '"'
      + ' data-archived="' + (j.archived ? 'true' : 'false') + '"'
      + ' title="' + esc(title) + '">'
      + '窗口 ' + esc(windowCodeFromSessionId(j.windowKey)) + ' · ' + esc(roleText)
      + (j.archived ? ' · 已归档' : '')
      + '</button>'
  }).join('')
  return '<div class="dsh-pm-report-windows" data-report-windows="1">'
    + '<span class="dsh-pm-action-bar-label">窗口</span>' + buttons + '</div>'
}

/**
 * 操作条（FR-3）：本阶段**合法**动作 + 每条后果说明 + humanOnly 标注。
 *
 * 终态显式早退（返回空串，不留空壳容器）——与既有 `renderActionBar` 同一口径：
 * 改成"渲染空 div"会让页面看起来像"按钮没加载出来"。
 */
export function buildReportActionBar(report: ReportResponse): string {
  if (isTerminal(report.head.status)) return ''
  const actions = report.actions ?? []
  if (actions.length === 0) return ''
  const buttons = actions.map((a) => {
    const channel = ACTION_CHANNEL[a.key]
    const to = a.key === 'cancel' ? 'canceled' : a.to
    return '<div class="dsh-pm-report-action" data-action-key="' + esc(a.key) + '">'
      + '<button type="button" class="dsh-pm-btn" data-action="' + channel + '"'
      + ' data-id="' + esc(report.head.id) + '"'
      + (to === undefined ? '' : ' data-to="' + esc(to) + '"')
      + ' title="' + esc(a.consequence) + '">' + esc(a.label) + '</button>'
      + (a.humanOnly ? '<span class="dsh-pm-human-only" title="agent 调用会被代码级拒绝">需人操作</span>' : '')
      + '<span class="dsh-pm-action-consequence">后果：' + esc(a.consequence) + '</span>'
      + '</div>'
  }).join('')
  return '<div class="dsh-pm-report-actions" data-report-actions="1">'
    + '<span class="dsh-pm-action-bar-label">本阶段操作</span>' + buttons + '</div>'
}

/**
 * ActorRef → 展示口径（人 / 窗口 w-xxxx / 系统）。
 *
 * 为什么绕一层 `commentActorLabel`：那是仓内**唯一**一处 actor 展示口径（旧详情页的评论列表
 * 也走它）。本卡不许改 `render/dom-utils.ts`，所以按它的入参形状喂一条最小记录来复用同一份实现——
 * 自己再抄一份三分支判断，就会得到两套"人 / 窗口 / 系统"的写法（一处改、一处忘，永远是这种漂移）。
 */
function actorOf(by: ActorRef): { actor: 'human' | 'agent' | 'system'; text: string } {
  return commentActorLabel({ id: '', body: '', createdAt: 0, createdBy: by })
}

/**
 * 首屏评论列表：**最多渲染最近几条**（与服务端 `REPORT_COMMENT_HEAD_LIMIT` 同口径的渲染侧兜底）。
 *
 * 为什么渲染侧也要限一次：服务端的条数上限只对"新服务端 + 本次请求"生效；壳还会拿到
 * 缓存快照 / 旧服务端 / 手工喂进来的载荷。渲染层是"页面到底有多长"的最后一关，
 * 这一关不设，Tab 栏被顶出首屏的缺陷就会从另一条路回来。
 * （客户端不能 import application 层——`tests/layer-boundary.test.ts`——故此处独立一份常量，
 * 值必须与 `QueryReport.REPORT_COMMENT_HEAD_LIMIT` 一致，改一处必须改另一处。）
 */
export const COMMENT_RENDER_LIMIT = 3
/** 单条正文的渲染上限（字）。超出截断 + 省略号，全文进 `title`（不新造展开交互）。 */
export const COMMENT_BODY_MAX = 200
/** 超长正文的判定阈值（字）：超过它就不是"人写的一句话"，而是机器转储（见 COMMENT_LONG_HEAD_MAX）。 */
export const COMMENT_LONG_THRESHOLD = 1000
/** 超长正文只渲染**首行前多少字**（再配「共 N 字」）。 */
export const COMMENT_LONG_HEAD_MAX = 120

/**
 * 一条评论的正文渲染计划（纯函数，便于单测直接钉住三档口径）。
 *
 * 三档（为什么这么分，而不是"统一截 200 字"）：
 *  - **≤ 200 字**：原样（人写的评论通常就这么长）；
 *  - **200 ~ 1000 字**：截 200 字 + `…`，全文进 `title`（读者悬停仍读得到全文）；
 *  - **> 1000 字**：这类是「产物自动发现」之类的**机器转储**（线上实测一条 11,157 字，
 *    10 条合计 13,317 字把 Tab 栏顶到 top=1118、首屏看不到六个 Tab）。它不该把页面顶爆，
 *    也不该假装自己是一句话——只给首行前 120 字 + 「共 N 字」，并打 `data-comment-long="1"`
 *    让页面/断言都能一眼认出"这是被收纳起来的转储"。
 */
export function commentRenderPlan(body: string): { text: string; full: string; long: boolean } {
  const full = typeof body === 'string' ? body : String(body ?? '')
  if (full.length > COMMENT_LONG_THRESHOLD) {
    const firstLine = full.split(/\r?\n/, 1)[0] ?? ''
    const head = firstLine.slice(0, COMMENT_LONG_HEAD_MAX)
    const cut = firstLine.length > COMMENT_LONG_HEAD_MAX
    return {
      text: head + (cut ? '…' : '') + '（首行前 ' + String(COMMENT_LONG_HEAD_MAX) + ' 字 · 共 ' + String(full.length) + ' 字）',
      full,
      long: true,
    }
  }
  if (full.length > COMMENT_BODY_MAX) {
    return { text: full.slice(0, COMMENT_BODY_MAX) + '…', full, long: false }
  }
  return { text: full, full, long: false }
}

/**
 * 台账评论列表（**补能力回退**：旧详情页能看到评论，新页只有输入框 = 用户看不到评论了）。
 *
 * 四条纪律：
 *  - `comments === undefined`（服务端没下发）→ **整块不渲染**：不用"暂无评论"冒充"读不到"（FR-12）；
 *  - `comments === []`（服务端明确说"确实没有评论"）→ 给一句解释性空态，不是留白；
 *  - **不做内层滚动**（FR-11 #7）：列表长了靠页面滚，不进 `overflow` 容器，
 *    也不做"限高 + 滚动"（那会让"有多少条"变成不可数）。所以"不顶爆首屏"靠的是**少渲染几条 +
 *    截断正文 + 压紧行距**，不是砍内容；
 *  - **限条数必须同时报总数**（`head.commentsTotal`）：只渲染 3 条却不说话，等于把
 *    "还有 7 条"藏起来——那不是内容控制，是丢信息。
 */
export function buildCommentList(comments: ReportHead['comments'], total?: number): string {
  if (comments === undefined) return ''
  if (comments.length === 0) {
    return '<div class="dsh-pm-comments" data-comment-list="empty">'
      + '<div class="dsh-pm-empty">暂无评论：这条需求还没有人 / agent 留过言</div></div>'
  }
  // 只渲染最近 N 条（新的在后 → 取尾部）；被省略的条数必须写出来
  const shown = comments.length > COMMENT_RENDER_LIMIT ? comments.slice(-COMMENT_RENDER_LIMIT) : comments
  const totalCount = typeof total === 'number' && Number.isFinite(total) && total >= comments.length
    ? total
    : comments.length
  const omitted = Math.max(0, totalCount - shown.length)
  const rows = shown.map((c) => {
    const who = actorOf(c.by)
    const plan = commentRenderPlan(c.body)
    return '<div class="dsh-pm-comment" data-comment-row="1" data-actor="' + who.actor + '"'
      + (plan.long ? ' data-comment-long="1"' : '') + '>'
      + '<span class="dsh-pm-comment-meta"><span class="dsh-pm-comment-who" data-actor="' + who.actor + '">'
      + esc(who.text) + '</span> · ' + esc(fmtTime(c.at))
      + (plan.long ? ' · <span class="dsh-pm-comment-long-flag">系统长日志（已收纳）</span>' : '')
      + '</span>'
      + '<div class="dsh-pm-comment-body" title="' + esc(plan.full) + '">' + esc(plan.text) + '</div></div>'
  }).join('')
  const label = '最近评论 ' + String(shown.length) + ' 条（新的在下）'
    + (omitted > 0 ? ' · 共 ' + String(totalCount) + ' 条，更早的 ' + String(omitted) + ' 条见台账' : '')
  return '<div class="dsh-pm-comments" data-comment-list="1" data-comment-shown="' + String(shown.length) + '"'
    + ' data-comment-total="' + String(totalCount) + '">'
    + '<span class="dsh-pm-action-bar-label">' + esc(label) + '</span>'
    + rows + '</div>'
}

/** 头部渲染选项。 */
export interface ReportHeadOpts {
  /**
   * 档二（会话内面板）用：不渲染评论框与创建时间。
   * 为什么：会话里已有输入框，再放一个会让人分不清"评论"与"发消息"。
   */
  compact?: boolean
}

/**
 * 常驻头部（结论头 + 操作条 + 一句话结论）。
 *
 * `now` 只作缺省兜底（服务端已给 stageStayedMs / sinceUpdateMs 时优先用它——
 * 服务端算过的数与页面时钟无关，测试里也就不用假时钟）。
 */
export function buildReportHead(report: ReportResponse, now: number = Date.now(), opts: ReportHeadOpts = {}): string {
  const h = report.head
  const p = report.progress
  const terminal = isTerminal(h.status)

  /* ① 身份行（原型 head-top 的那一行）：id · 状态芯片 · 分类 · 难度 · 停留/更新时刻。
     为什么单起一个行盒：旧底座把这些当**并列的 flex 子项**，各自换行后"谁/什么状态/什么时候"
     散成三四行；收进一个行盒，它们才回到同一行（换行只发生在行盒之间）。 */
  const top: string[] = []
  top.push('<span class="dsh-pm-card-id">' + esc(h.id) + '</span>')
  top.push('<span class="dsh-pm-status" data-status="' + esc(h.status) + '">' + esc(STATUS_LABELS[h.status] ?? h.status) + '</span>')
  if (h.blocked) {
    const why = typeof h.blockedReason === 'string' && h.blockedReason.length > 0 ? h.blockedReason : ''
    top.push('<span class="dsh-pm-flag blocked"' + (why.length > 0 ? ' title="' + esc(why) + '"' : '') + '>阻塞</span>')
    if (why.length > 0) top.push('<span class="dsh-pm-report-meta" data-blocked-reason="1">' + esc(why) + '</span>')
  }
  top.push('<span class="dsh-pm-report-meta" data-category="' + esc(h.category) + '">分类 '
    + esc(CATEGORY_LABELS[h.category] ?? h.category) + '</span>')
  const diff = difficultyLabel(h.promptDifficulty)
  if (diff !== undefined) {
    top.push('<span class="dsh-pm-report-meta" data-difficulty="' + esc(h.promptDifficulty ?? '') + '">难度 '
      + esc(diff) + '</span>')
  }
  // 停留时长 / 距上次更新：服务端给了就用服务端的，没给才用本地时钟推——**都不给就不说这一句**
  const stayed = typeof p.stageStayedMs === 'number'
    ? p.stageStayedMs
    : (typeof p.stageEnteredAt === 'number' ? Math.max(0, now - p.stageEnteredAt) : undefined)
  const since = typeof p.sinceUpdateMs === 'number'
    ? p.sinceUpdateMs
    : (typeof h.updatedAt === 'number' ? Math.max(0, now - h.updatedAt) : undefined)
  const timing = (stayed === undefined ? '' : '停留 ' + fmtDur(stayed))
    + (stayed !== undefined && since !== undefined ? ' · ' : '')
    + (since === undefined ? '' : '距上次更新 ' + fmtDur(since))
  if (timing.length > 0) top.push('<span class="dsh-pm-detail-updated">' + esc(timing) + '</span>')

  /* ② 标题（21px 一行独占；原型的 h1.title 就是整页视觉的重心） */
  const title = '<h1 class="dsh-pm-detail-title">' + esc(h.title) + '</h1>'

  /* ③ 次级行（原型标题下面那一行）：创建时刻 + 窗口跳转。
     终态与档二各自真实：终态不渲染窗口跳转（不留假出口），档二不渲染创建时刻（会话里已有）。 */
  const created = terminal || opts.compact === true
    ? ''
    : '<span class="dsh-pm-report-meta" data-created-at="' + String(h.createdAt) + '">创建于 '
      + esc(fmtTime(h.createdAt)) + '</span>'
  const windows = terminal ? '' : buildWindowJumps(report)
  const sub = created + windows

  const parts: string[] = []
  parts.push('<div class="dsh-pm-rh-top" data-head-row="top">' + top.join('') + '</div>')
  parts.push(title)
  if (sub.length > 0) parts.push('<div class="dsh-pm-rh-sub" data-head-row="sub">' + sub + '</div>')
  // 一句话结论（在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手）
  parts.push('<div class="dsh-pm-report-verdict" data-report-verdict="1"'
    + ' data-waiting-human="' + String(typeof report.waitingHuman === 'number' ? report.waitingHuman : 0) + '">'
    + '💡 ' + esc(report.verdictLine ?? '') + '</div>')
  const next = typeof report.nextStepForAgent === 'string' ? report.nextStepForAgent.trim() : ''
  if (next.length > 0) {
    parts.push('<div class="dsh-pm-report-next" data-next-step="1">🤖 实施窗口下一步：' + esc(next) + '</div>')
  }
  // 8 态阶段条复用既有实现（同一份阶段表/同一个外观），不另画一套
  parts.push(buildProgressDots(h.status))

  /* ④ 操作条（原型 .actions 那个浅底横条）：`← 看板` + 本阶段合法动作。
     为什么把返回键收进这条：原型里它就是操作条的第一个按钮；散在头部顶行会多出一行。 */
  const back = '<button type="button" class="dsh-pm-btn" data-action="back" title="返回看板">← 看板</button>'
  if (terminal) {
    // 终态只读：只留 ← 看板（不渲染操作条 / 窗口跳转 / 评论框——不留任何假出口）。
    // 评论**列表**仍渲染：它是台账已记下的事实（审计要看"谁批的、说了什么"），只读不等于看不见。
    parts.push('<div class="dsh-pm-rh-bar" data-report-actionbar="1">' + back
      + '<div class="dsh-pm-gate" data-readonly="1">终态只读：'
      + (h.status === 'canceled' ? '已取消' : '已归档') + '，无可执行动作</div></div>')
    parts.push(buildCommentList(h.comments, h.commentsTotal))
  } else {
    parts.push('<div class="dsh-pm-rh-bar" data-report-actionbar="1">' + back + buildReportActionBar(report) + '</div>')
    // 评论列表在评论框**附近**（列表在上、输入框在下，与时间线"新的在下"同向）。
    // 档二（compact）不渲染输入框，但列表照渲染：评论是内容，不是"写入口"。
    parts.push(buildCommentList(h.comments, h.commentsTotal))
    // 评论框：既有能力的**唯一落点**（写入通道与旧页同一条）。
    // 草稿的保住靠 board-mount 的分段替换 + capture/restore（见 board-mount §applyReportSegments）。
    if (opts.compact !== true) {
      // `data-draft-key`：本页**不止一个**评论框（对话 Tab 也有一个），草稿要按表单分开存，
      // 否则两个框共用一个槽位、打字互踩（board-mount 的 capture/restore 按这个属性分槽）。
      parts.push('<div class="dsh-pm-comment-form" data-actor="human" data-draft-key="head">'
        + '<input type="text" class="dsh-pm-input" data-role="comment-input" placeholder="写评论（以「人」身份记录）…" />'
        + '<button type="button" class="dsh-pm-btn" data-action="add-comment" data-target="req" data-id="'
        + esc(h.id) + '">发送</button></div>')
    }
  }

  return '<div class="dsh-pm-detail-head dsh-pm-rh" data-report-head="1" data-head-state="'
    + (terminal ? 'terminal' : 'inflight') + '">' + parts.join('') + '</div>'
}
