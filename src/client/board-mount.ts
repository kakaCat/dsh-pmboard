/**
 * 项目看板 board-mount —— 视图状态机（board / req-detail / task-detail）、
 * fetch/render、事件委派、SSE 订阅与会话跳转。
 *
 * 唯一挂载路径：`attachBoard(container)`（REQ-260928185112-e20d FR-2，宿主模式）——把事件委派、
 * fetch、SSE 订阅与轮询/可见性整体挂到宿主给的容器上，返回清理函数；宿主卸载即释放。
 * 旧命令式路径（mountBoard + 独立壳模块的容器注入/互斥激活/外部点击关闭）已于 REQ-47939a
 * 「拆除旧机制」卡整段删除。
 *
 * @module dsh-pmboard/client/board-mount
 */
import type { BoardState, RequirementRecord } from './types.ts'
import {
  buildBoard, buildEmpty, buildError, buildReqDetail, buildTaskDetail, buildTasksPage,
  defaultListDirFor, LIST_PAGE_SIZE_DEFAULT, LIST_PAGE_SIZES,
  type BoardViewKind, type ListSortDir, type ListSortKey, type ListViewOpts,
} from './view.ts'
import * as api from './api.ts'
// REQ-261003191948-e94a FR-4：失败呈现要区分「服务端说了什么」（ApiError.message/hint）
// 与「本地异常」（String(err)）——前者带可复制的修复命令。
import { ApiError } from './api.ts'
import { openDocInSidebar, resolveCurrentSessionId, setDocWorkspaceContext } from './open-doc.ts'
// REQ-261004103330-005f t11：设置弹窗（单例；挂 body、自建委派；跳会话与打开文档由本模块注入）
import { configureBoardSettings, disposeBoardSettings, openBoardSettings } from './settings/singleton.ts'
import { archivedSessionIds, handleSessionJump, jumpToSession, windowServiceAccess, type SessionJumpResult } from './session-jump.ts'
// REQ-261004210128-283d FR-5/FR-8：运行态订阅与重绘门控（读数与映射的唯一实现在 session-running）
import { NO_RUNNING, relevantSessionIds, runningAmong, runningSessionIds, sameRunningSet, subscribeSessionRunning } from './session-running.ts'
import { fmt } from '../domain/text/fmt.js'
// REQ-260928222643-4d34 FR-2：一次性定位交接——挂载时消费节点面板登记的 REQ id
import * as boardFocus from './board-focus.ts'
import { renderStageNode } from './stage-panel.ts'
import { hasInjectionWindow, renderInjectionInfo } from './injection-info.ts'
import { renderTokenPlaceholder, renderTokenTab } from './token-info.ts'
import { renderMarksBlock, renderMarksPlaceholder } from './marks-info.ts'
// REQ-261004184822-9881 FR-1/FR-3：重绘前后记住并回填泳道滚动位置（位置不得因刷新归零）
import { captureBoardScroll, restoreBoardScroll } from './board-scroll.ts'
// REQ-261004195831-0f52 FR-1/FR-2/FR-3：详情正文按需取全文（/state 只发摘要），
// 取数中/未找到/失败三种非成功态各有明确占位——此前详情页直接拿摘要当全文渲染，点开即崩。
import { createReqDetailStore } from './req-detail-store.ts'
import { buildDetailError, buildDetailLoading, buildDetailMissing } from './views/detail-states.ts'
// REQ-261004222448-292a t-ab048e：详情页新壳（常驻头部 + 六个同级 Tab + 懒加载 + 分段局部更新）。
// 旧详情页（buildReqDetail）**不删**：报告端点未接线（旧服务端 404 / 形状不符）时按原样回落，
// 这样"新前端 + 旧服务端"不会白屏，也不会把既有能力（评论、验收单、追溯…）直接砍掉。
import {
  createReportShell, isReportTabKey,
  type ReportShellController, type ReportShellSegments,
} from './views/report-tabs.js'
// DAG 画布是**命令式**挂载（面板只出承载容器）：画布 id 由面板导出，别在本模块另拼一个
// （旧详情页用的是 'dag-canvas'，两套互不抢元素）。
import { DAG_PANEL_CANVAS_ID } from './views/panels/dag.js'
import { updateTraceabilityView } from './traceability-handler.js'
import { tryMountDagCanvas } from './dag-mount.js'
import type { StageOverview, StageKey } from '../shared/protocol.ts'

const POLL_MS = 20000

/** 「验收通过」确认文案与覆盖说明（REQ-a8d582 FR-1/FR-4）。 */
export interface VerifyConfirmCopy {
  /** 弹给人看的确认文案（含"不通过 / 未裁决"计数）。 */
  message: string
  /**
   * 需要显式覆盖时才给（有不合格项或尚无验收材料）。
   * 全过且材料齐全时为 undefined —— 那种通过**不是覆盖**，不该在台账留覆盖痕迹。
   */
  overrideDetail?: string
}

/**
 * 装配「验收通过」的确认文案与覆盖说明（REQ-a8d582 FR-1/FR-4）。
 *
 * 为什么区分两种通过：覆盖是一种**例外**，只有"人已知有不合格项 / 尚无验收材料还坚持通过"
 * 才成立；全过且材料齐全时的通过不该带覆盖记录（否则台账里全是噪声，复盘时读不出例外）。
 * 覆盖说明由计数与不合格项摘要自动装配——不让人手填：那是"是/否"确认框，不是写作文。
 */
export function verifyConfirmCopy(req: RequirementRecord | undefined): VerifyConfirmCopy {
  const v = req?.verification
  if (v === undefined) {
    return {
      message: '该需求尚无验收材料（本次通过没有验收证据）。\n确认后按「覆盖通过」直接归档，是否继续？',
      overrideDetail: '看板覆盖通过：尚无验收材料（无验收证据）',
    }
  }
  const items = v.sheet?.items ?? []
  const passed = items.filter(i => i.status === 'passed').length
  const failedItems = items.filter(i => i.status === 'failed')
  const pending = items.filter(i => i.status === 'pending').length
  const version = v.sheet?.version ?? 0
  if (failedItems.length === 0 && pending === 0) {
    return { message: '验收单 v' + version + '：' + passed + ' 项全部通过。\n验收通过即归档，是否继续？' }
  }
  const samples = failedItems.slice(0, 3).map(i => '✗ ' + i.criterion.slice(0, 60))
  return {
    message: '验收单 v' + version + '：通过 ' + passed + ' / 不通过 ' + failedItems.length + ' / 未裁决 ' + pending + '。\n'
      + (samples.length > 0 ? samples.join('\n') + '\n' : '')
      + '确认后按「覆盖通过」归档（会留下覆盖记录），是否继续？',
    overrideDetail: '看板覆盖通过：验收单 v' + version + '，不通过 ' + failedItems.length + ' 项 / 未裁决 ' + pending + ' 项',
  }
}

/** 看板视图偏好的持久键（前端本地，不入台账）。 */
const VIEW_PREF_KEY = 'dsh-pmboard:view'

/** 读取视图偏好：非法/不可用一律回落泳道。 */
function readViewPref(): BoardViewKind {
  try {
    const raw = sessionStorage.getItem(VIEW_PREF_KEY)
    return raw === 'list' ? 'list' : 'lanes'
  } catch { return 'lanes' }
}

/** 写入视图偏好（隐私模式等场景静默失败）。 */
function writeViewPref(view: BoardViewKind): void {
  try { sessionStorage.setItem(VIEW_PREF_KEY, view) } catch { /* 忽略 */ }
}

/** 列表视图偏好（排序键/方向/每页条数）的持久键。 */
const LIST_PREF_KEY = 'dsh-pmboard:list'

interface ListPref { sortKey: ListSortKey; sortDir: ListSortDir; pageSize: number }

const LIST_SORT_KEYS: readonly ListSortKey[] = ['stage', 'progress', 'updated', 'created', 'title']

/** 读取列表偏好：任何非法值一律回落默认（阶段升序 / 每页 10）。 */
function readListPref(): ListPref {
  const fallback: ListPref = { sortKey: 'stage', sortDir: 'asc', pageSize: LIST_PAGE_SIZE_DEFAULT }
  try {
    const raw = sessionStorage.getItem(LIST_PREF_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as Partial<ListPref>
    const sortKey = typeof parsed.sortKey === 'string' && (LIST_SORT_KEYS as readonly string[]).includes(parsed.sortKey)
      ? parsed.sortKey as ListSortKey
      : fallback.sortKey
    const sortDir: ListSortDir = parsed.sortDir === 'asc' || parsed.sortDir === 'desc'
      ? parsed.sortDir
      : defaultListDirFor(sortKey)
    const pageSize = typeof parsed.pageSize === 'number' && LIST_PAGE_SIZES.includes(parsed.pageSize)
      ? parsed.pageSize
      : LIST_PAGE_SIZE_DEFAULT
    return { sortKey, sortDir, pageSize }
  } catch { return fallback }
}

type ViewMode =
  | { kind: 'board' }
  | { kind: 'req'; reqId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'tasks' }

/**
 * 会话跳转结果的**明确反馈**（REQ-31e11f #5：不允许点了没反应）。
 * 'opened' 不打扰（已经跳过去了）；其余结果必须能说清“为什么没跳”。
 * REQ-261002153446-c600：'restore-failed'（取消归档动作失败）也是「没跳」的一种，
 * 文案要给出一条真的能走的路（去会话列表手动恢复）。
 * 导出以便单测覆盖（纯函数，无 DOM 依赖）。
 */
export function jumpResultMessage(result: SessionJumpResult, sid: string): string {
  const short = sid.length > 18 ? sid.slice(0, 18) + '…' : sid
  switch (result) {
    case 'archived':
      // 已归档 + 客户端不支持取消归档（旧版本）：说清是能力问题，不是「这功能不存在」
      return '该会话已归档（' + short + '），且当前客户端不支持取消归档，无法跳转'
    case 'restore-failed':
      // 恢复动作本身失败：不跳、也不假装跳了
      return '取消归档失败（' + short + '）：会话未恢复，未跳转（可到会话列表手动恢复后重试）'
    case 'missing':
      return '该会话不在当前会话列表（' + short + '）：可能已删除或不在当前工作区'
    case 'unavailable':
      return '会话导航服务暂不可用（uiWorkspace 未注入），请刷新页面后重试'
    case 'opened':
      return ''
    default:
      return '会话跳转结果未知：' + String(result)
  }
}

/** 宿主挂载参数（attachBoard / createBoardAttachment）。 */
export interface AttachBoardOptions {
  /**
   * 由看板自行驱动轮询（宿主模式，默认 true）。
   * false = 轮询交给外部驱动，本函数只绑事件、SSE 与可见性（供旧式外部轮询者使用）。
   */
  poll?: boolean
  /** 轮询间隔（毫秒），默认 POLL_MS（20s）。 */
  pollMs?: number
  /**
   * 面板是否可见；返回 false 时**跳过本轮刷新**（不阻断挂载、SSE 与事件委派）。
   * 宿主用 usePanelInfo().activePanelId === PANEL_ID 作防御性门闩；缺省恒可见。
   */
  isActive?: () => boolean
}

/** 附着体句柄：宿主可用 refresh 主动刷新；dispose 释放监听/订阅/定时器（幂等）。 */
export interface BoardAttachment {
  refresh(): void
  dispose(): void
}

/** 宿主「恒在看」兜底（未提供可见性门闩时）。 */
const ALWAYS_ACTIVE = (): boolean => true

/* ---------------------------------------------------------------- 详情页草稿 */

/**
 * 详情页里「用户自己弄出来的状态」——重绘必须原样还回去（REQ-261004195831-0f52 FR-3）。
 *
 * 为什么需要它：详情每收到一次 SSE / 轮询就重建 DOM，而「停在哪个 Tab」与
 * 「评论框里打了一半的字」只活在 DOM 上——重建即归零（与泳道滚动位置同一类缺陷，
 * 复用同一套「重绘前取值 / 重绘后回填」做法，见 board-scroll.ts）。
 *
 * REQ-261004222448-292a 起详情页**不止一个**评论框（常驻头部一个 + 对话 Tab 一个），
 * 故草稿从"一句话"变成"按表单分槽的若干句"：槽位键见 {@link draftKeyOf}。
 */
export interface DetailDraft {
  reqId: string
  /** 当前激活的 Tab 名（data-tab）；空串 = 无 */
  tab: string
  /** 头部那个评论框的值（= `comments['head']`；保留这个字段名，避免动到既有读者） */
  comment: string
  /** 各评论表单的草稿：键 = 槽位键（`data-draft-key` / 所在面板 / 出现次序） */
  comments: Record<string, string>
}

/**
 * 草稿的**跨重绘记忆**（模块级，键 `reqId::槽位`）。
 *
 * 为什么不能只靠 DetailDraft（那是一次重绘前/后的快照）：切 Tab 会把面板段整段换掉——
 * 对话 Tab 的回复框连节点都没了，快照里没它，文字就丢了；切回来时框是新建的，也没人把字写回去。
 * 记忆放在模块级后，切走再切回仍能取回（同 board-scroll 的"模块级记忆"思路，且换需求不串）。
 */
const commentDrafts = new Map<string, string>()

/**
 * 一个评论表单的草稿槽位键。
 *
 * 优先级：显式 `data-draft-key` → 它所在的面板（`[data-panel="<tab>"]`，壳自己的标记，
 * **不是**某个面板的内部知识）→ 头部（`[data-report-head]`）→ 出现次序兜底。
 * 用"所在面板"而不是"出现次序"：切走再切回时表单位置会变（面板段被换掉），
 * 按次序记会把对话的草稿记到文档面板的槽里（互相踩），按面板记则天然分开。
 */
export function draftKeyOf(form: Element, index: number): string {
  const explicit = (form as HTMLElement).dataset?.draftKey
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  const closest = (form as { closest?: (sel: string) => Element | null }).closest
  if (typeof closest === 'function') {
    const panel = closest.call(form, '[data-panel]')?.getAttribute('data-panel')
    if (typeof panel === 'string' && panel.length > 0) return 'panel:' + panel
    if (closest.call(form, '[data-report-head]') !== null) return 'head'
  }
  return 'draft-' + String(index)
}

/** 详情容器里的全部评论表单（顺序 = DOM 顺序，仅作兜底槽位键用）。 */
function commentForms(detail: HTMLElement): HTMLElement[] {
  if (typeof detail.querySelectorAll !== 'function') return []
  return Array.from(detail.querySelectorAll<HTMLElement>('.dsh-pm-comment-form'))
}

/** 切换详情页的 Tab（点击与回填**共用**同一处实现，避免两套切法各说各话）。 */
export function setDetailTab(detail: HTMLElement, tabName: string): void {
  detail.querySelectorAll<HTMLElement>('.dsh-pm-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName)
  })
  detail.querySelectorAll<HTMLElement>('.dsh-pm-tab-content').forEach(c => {
    c.classList.toggle('active', c.dataset.tabContent === tabName)
  })
}

/**
 * 取「被点的那个发送按钮**所在表单**」里的评论输入框。
 *
 * 为什么不能按"页面里第一个 `[data-role=comment-input]`"取：详情页现在同时有两个以上评论框
 * （常驻头部 + 对话 Tab），按第一个取会让面板里的「发送」读到头部那个（多为空）
 * → 点了没反应、也不报错（静默失败）。这是对话面板卡实测到的真缺陷。
 * 作用域取不到才回落整页（旧壳只有一个评论框，行为与改造前一致）。
 */
export function commentInputOf(button: Element, root: HTMLElement | undefined): HTMLInputElement | undefined {
  const closest = (button as { closest?: (sel: string) => Element | null }).closest
  const form = typeof closest === 'function' ? closest.call(button, '.dsh-pm-comment-form') : null
  const scoped = form === null
    ? null
    : (form as Element).querySelector<HTMLInputElement>('[data-role="comment-input"]')
  if (scoped !== null && scoped !== undefined) return scoped
  if (root === undefined || typeof root.querySelector !== 'function') return undefined
  return root.querySelector<HTMLInputElement>('[data-role="comment-input"]') ?? undefined
}

/** 重绘前取值：只认当前详情容器（看板/任务页没有详情容器 → undefined，静默跳过）。 */
export function captureDetailDraft(el: HTMLElement): DetailDraft | undefined {
  // 容器可能只有 innerHTML（宿主桩 / 极简容器）：没有查询能力就静默跳过，
  // 绝不因为「取一次草稿」这件小事把整次渲染带崩（同 board-scroll 的既有纪律）。
  if (typeof el.querySelector !== 'function') return undefined
  const detail = el.querySelector<HTMLElement>('.dsh-pm-detail[data-detail-req]')
  if (detail === null) return undefined
  const reqId = detail.dataset.detailReq ?? ''
  const active = detail.querySelector<HTMLElement>('.dsh-pm-tab.active')
  const comments: Record<string, string> = {}
  commentForms(detail).forEach((form, i) => {
    const key = draftKeyOf(form, i)
    const input = typeof form.querySelector === 'function'
      ? form.querySelector<HTMLInputElement>('[data-role="comment-input"]')
      : null
    const value = input?.value ?? ''
    comments[key] = value
    // 顺手写进模块级记忆：**只记此刻真实存在的表单**（缺席的表单不许被写成空串，
    // 否则"切走再切回"会把用户没动过的那个框的草稿抹掉）
    if (reqId.length > 0) commentDrafts.set(reqId + '::' + key, value)
  })
  return { reqId, tab: active?.dataset.tab ?? '', comment: comments['head'] ?? '', comments }
}

/**
 * 重绘后回填。**只回填同一条需求**：A 需求的草稿不得贴到 B 需求（换需求时草稿是新的空白），
 * 找不到容器/元素即静默跳过（与 restoreBoardScroll 同纪律，绝不创建节点）。
 */
export function restoreDetailDraft(el: HTMLElement, draft: DetailDraft | undefined): void {
  if (draft === undefined || draft.reqId.length === 0) return
  if (typeof el.querySelector !== 'function') return
  const detail = el.querySelector<HTMLElement>('.dsh-pm-detail[data-detail-req="' + draft.reqId + '"]')
  if (detail === null || detail.dataset.detailReq !== draft.reqId) return
  if (draft.tab.length > 0 && detail.querySelector('.dsh-pm-tab[data-tab="' + draft.tab + '"]') !== null) {
    setDetailTab(detail, draft.tab)
  }
  commentForms(detail).forEach((form, i) => {
    const key = draftKeyOf(form, i)
    // 本次快照优先；快照里没有这个槽位（表单是刚出现的，例如切回对话 Tab）→ 取模块级记忆
    const value = draft.comments[key] ?? commentDrafts.get(draft.reqId + '::' + key)
    if (value === undefined || value.length === 0) return
    const input = typeof form.querySelector === 'function'
      ? form.querySelector<HTMLInputElement>('[data-role="comment-input"]')
      : null
    if (input !== null) input.value = value
  })
}

/**
 * 分段局部更新（REQ-261004222448-292a · FR-11）：只换**内容变了**的那一段，不整段 `innerHTML` 重绘。
 *
 * 为什么这是"滚动位置 / 展开态 / 阅读位置不变"的实现方式：整页重绘会把没变的部分也换成新节点，
 * 于是滚动与 `<details>` 展开态一起归零（本仓在泳道滚动上已踩过同一类缺陷，见 board-scroll.ts）。
 * 分段之后，没变的段连 DOM 都不碰，状态自然留着。
 *
 * 草稿（评论框里打了一半的字）在头部段里——**换头就会丢**，故替换前 capture、替换后 restore。
 * 回填刻意**不恢复 Tab 名**：当前 Tab 由壳控制器权威决定，DOM 上的 `.active` 只是它的投影；
 * 把旧 Tab 回填回去会和刚渲染出来的 Tab 栏打架（页面显示 A 面板、标签高亮 B）。
 *
 * 段内比较用 `innerHTML` 字符串：真实 DOM 会把它再序列化一遍（属性引号、自闭合标签），
 * 所以"看起来一样却不相等"时只是多换一次——**不是**正确性问题（每次都 restore 草稿）。
 * 容器没有查询能力（宿主桩/极简容器）时静默跳过，绝不因此把整次渲染带崩。
 */
export function applyReportSegments(container: HTMLElement, segs: ReportShellSegments): void {
  if (typeof container.querySelector !== 'function') return
  const draft = captureDetailDraft(container)
  let replaced = 0
  for (const name of ['head', 'band', 'tabs', 'panel'] as const) {
    const seg = container.querySelector<HTMLElement>('[data-report-seg="' + name + '"]')
    if (seg === null) continue
    const next = segs[name]
    if (seg.innerHTML === next) continue
    seg.innerHTML = next
    replaced += 1
  }
  if (replaced > 0 && draft !== undefined) restoreDetailDraft(container, { ...draft, tab: '' })
}

/**
 * 面板内交互的**意图映射**（纯函数，便于在无 jsdom 的环境下断言）。
 *
 * 为什么要有这一层：六个面板只会返回**字符串**，点击得由事件委派落地——
 * 直接写成一堆 `if (el.closest(...))` 的话，"哪个属性对应哪个动作"这件事就没法测，
 * 而它恰恰是最容易写错、写错了又静默（点了没反应）的地方。
 *
 * 注意这里**不含** `data-open-doc`（点开正文）：那条链由壳自己接（`ReportTabsController.attach`
 * → `ctx.openDoc`），只能有一处接——两边都接会点一下开两次（见 report-tabs.ts 的 attach 注释）。
 */
export type PanelIntent = { kind: 'load-earlier'; cursor?: number }

export function panelIntentOf(target: Element): PanelIntent | undefined {
  if (target === null || typeof (target as { closest?: unknown }).closest !== 'function') return undefined
  // 「加载更早」：按 `data-load-earlier` **通用**匹配（不是对话专用——注入留痕等长列表同样要分页）。
  // 游标优先取 DOM 上的 data-before（面板从服务端 page.before 渲染来的）；
  // 缺了就不猜——由壳回落到当前载荷的 page.before，取不到只留一行说明。
  const earlierEl = target.closest<HTMLElement>('[data-load-earlier]')
  if (earlierEl !== null) {
    const raw = earlierEl.dataset.before
    const cursor = raw === undefined ? Number.NaN : Number(raw)
    return Number.isFinite(cursor) ? { kind: 'load-earlier', cursor } : { kind: 'load-earlier' }
  }
  return undefined
}

/**
 * 把命令式看板挂到宿主给的容器上 —— 集中承担容器上的 click/change 事件委派、
 * fetchAll、startEvents 订阅、轮询与 visibilitychange）整体下沉到这里；返回句柄由宿主决定
 * 何时 refresh / dispose。
 *
 * 为什么不重写：看板是命令式 DOM 视图，React 宿主（page/host.ts）只提供容器与生命周期。
 */
export function createBoardAttachment(container: HTMLElement, options: AttachBoardOptions = {}): BoardAttachment {
  const { poll = true, pollMs = POLL_MS, isActive = ALWAYS_ACTIVE } = options
  let state: BoardState | undefined
  // REQ-260928222643-4d34 FR-2：挂载时消费一次「请定位到该需求」的一次性意图（取走即清）。
  // 看板 mode 是挂载闭包内局部变量，故只能在挂载时读；无意图 → 默认看板视图。
  const focusReqId = boardFocus.takeBoardFocus()
  let mode: ViewMode = focusReqId !== undefined
    ? { kind: 'req', reqId: focusReqId }
    : { kind: 'board' }
  // 看板视图种类（泳道 / 列表）——纯前端偏好，不入台账；切换即重绘
  let boardView: BoardViewKind = readViewPref()
  // 列表视图的排序 / 分页状态（同样纯前端；page 不持久，回来不落在空页）
  const listPref = readListPref()
  let listSortKey: ListSortKey = listPref.sortKey
  let listSortDir: ListSortDir = listPref.sortDir
  let listPageSize: number = listPref.pageSize
  let listPage = 1
  // 需求详情里当前选中的阶段节点（分段控件选中态；跨 SSE 重绘保留）
  let activeStage: string | undefined
  // 容器由宿主提供——挂载即绑定，dispose 即解绑
  let viewEl: HTMLElement | undefined = container
  let unsubEvents: (() => void) | undefined
  let pollTimer: number | undefined
  let disposed = false
  /**
   * 运行态订阅的退订句柄 + 上一次渲染用过的在跑集合（REQ-261004210128-283d FR-5/FR-8）。
   *
   * 为什么必须留存「上一次的集合」：`ctx.sessions.list` 这个 store 在**任意**会话的任何变化时都会通知
   * （官方整表重投影）——不看门控就重绘，别的窗口每动一下都会把看板整块 `innerHTML` 刷一遍。
   */
  let unsubRunning: (() => void) | undefined
  let lastRunning: ReadonlySet<string> = NO_RUNNING

  const listOpts = (): ListViewOpts => ({
    sortKey: listSortKey, sortDir: listSortDir, page: listPage, pageSize: listPageSize,
  })

  /** 已归档会话 id 集合（渲染时实时读取 → 归档/取消归档后下次重绘即生效）。 */
  const archivedSids = (): ReadonlySet<string> => archivedSessionIds()

  /**
   * 本次渲染关心的「在跑集合」：只保留当前页需求绑定的窗口（席位 ∪ 来源窗口）。
   * 渲染时实时读（与 `archivedSids()` 同款）——不留缓存副本，避免第二份真相。
   */
  const runningNow = (): ReadonlySet<string> =>
    runningAmong(relevantSessionIds((state?.requirements ?? []) as never), runningSessionIds())

  /**
   * 相关运行态是否变化（重绘门控）：无关会话的抖动在这里被挡掉。
   * state 尚未到达时，只比较「空集 vs 空集」——取数完成后的首次 render 自会收敛。
   */
  const runningChanged = (): boolean => {
    const next = runningNow()
    if (sameRunningSet(next, lastRunning)) return false
    lastRunning = next
    return true
  }

  const writeListPref = (): void => {
    try {
      sessionStorage.setItem(LIST_PREF_KEY, JSON.stringify({
        sortKey: listSortKey, sortDir: listSortDir, pageSize: listPageSize,
      }))
    } catch { /* 忽略 */ }
  }

  /**
   * 阶段导航（分段控件）选中态：data-active="true" 切到当前 stage，清掉同组其它按钮。
   * 没有它，分段控件看不出「现在在看哪个节点」（A 的样式已就绪，缺的是这里的状态切换）。
   */
  const setStageNavActive = (stage: string | undefined): void => {
    if (viewEl === undefined) return
    viewEl.querySelectorAll<HTMLElement>('[data-action="load-stage"]').forEach(btn => {
      if (stage !== undefined && btn.dataset.stage === stage) btn.setAttribute('data-active', 'true')
      else btn.removeAttribute('data-active')
    })
  }

  // ---- 渲染 ------------------------------------------------------------

  /**
   * 详情全文取数（REQ-261004195831-0f52 FR-1/FR-3）。
   *
   * `onChange` 走 `scheduleRender` 而不是直接 `render()`：`ensure` 在"登记 loading"这一拍
   * **同步**回调，直接重绘会在同一次 render 里再进一次 render（递归一圈、白挂一次 DAG）；
   * 微任务里合并成一次重绘，既去重也避免同步重入。
   */
  let renderScheduled = false
  const scheduleRender = (): void => {
    if (renderScheduled || disposed) return
    renderScheduled = true
    void Promise.resolve().then(() => {
      renderScheduled = false
      if (!disposed) render()
    })
  }

  const reqDetail = createReqDetailStore({
    fetchRequirement: (id: string) => api.fetchRequirement(id),
    onChange: () => { if (mode.kind === 'req') scheduleRender() },
  })

  /**
   * 最近一次成功渲染的详情全文（按需求 id）。**只为「重新取数途中不闪白」**：
   * 台账 revision 一变就会重取，若这期间退回 loading 占位，每有一条 SSE 详情页就闪一下
   * （requirement.md 非功能需求明确要求「无白屏、无闪烁」）。取数失败/未找到仍如实落对应占位，
   * 绝不拿旧数据假装新数据。
   */
  const lastRenderedDetail = new Map<string, RequirementRecord>()

  /**
   * 详情页新壳控制器（REQ-261004222448-292a）：**一条需求一个**，换需求即作废旧的
   * （在途的面板响应不得写回新需求的面板——与 req-detail-store 的世代纪律同款）。
   * `onChange` 走 `scheduleRender`（不是在取数回调里直接 render）：登记 loading 那一拍是**同步**回调，
   * 直接重绘会在同一次 render 里再进一次 render。
   */
  let reportShell: ReportShellController | undefined
  let reportShellFor: string | undefined
  /** 壳的交互委派（`data-open-doc` → `ctx.openDoc`）卸载函数；换壳/卸载时必须释放 */
  let unsubShellDom: (() => void) | undefined
  /** 已挂过 DAG 画布的宿主（幂等守卫：同节点同 stateKey 不重复挂；节点被换掉即重挂） */
  let mountedReportDag: { host: Element; stateKey: string } | undefined
  const shellForReq = (reqId: string): ReportShellController => {
    if (reportShell !== undefined && reportShellFor === reqId) return reportShell
    reportShell?.detach()
    unsubShellDom?.()
    unsubShellDom = undefined
    mountedReportDag = undefined
    reportShellFor = reqId
    reportShell = createReportShell({
      requirementId: reqId,
      loadReport: () => api.fetchReport(reqId),
      load: (key, params) => api.fetchReportPanel(reqId, key, params),
      // 点开正文复用既有链路（open-doc → 官方右侧栏），不新造通道
      openDoc: (path) => { openDocInSidebar(window.__dshPmCtx, path, resolveCurrentSessionId()) },
      revision: state?.revision ?? 0,
      onChange: () => { if (mode.kind === 'req') scheduleRender() },
    })
    // 委派挂在**容器**上（面板段每次都被整段替换，挂面板上等于每次都要重挂）
    if (viewEl !== undefined) unsubShellDom = reportShell.attach(viewEl)
    return reportShell
  }

  /**
   * 切到 DAG Tab 且面板段进 DOM 后，挂一次画布（命令式挂载，面板只出承载容器）。
   *
   * 三条纪律：
   *  - **任务来自看板 state 的 `TaskRecord[]`**（`state.tasks` 按需求过滤），不是 `DagResponse.tasks`：
   *    画布要 `phase/side` 做角色配色，而 `DagGraphNode` 没有这两列——拿它去喂会配色/角色全丢，
   *    用假值补上就是编数据；
   *  - **stateKey 从宿主上读**（`data-dag-state-key`，面板已按 `<canvasId>::<reqId>` 算好）：
   *    自己拼一遍，哪天拼法变了就与面板的视图状态记忆静默失配；
   *  - **幂等**：同一宿主 + 同一 stateKey 只挂一次；宿主节点被分段替换换掉后是**新对象**，照挂
   *    （`mountDagCanvas` 自身也幂等——先释放同名旧实例）。
   *
   * 旧详情页那条 `'dag-canvas'` 挂载**不动**（两条路径各用各的 id，不抢元素）。
   */
  const mountReportDagIfActive = (ctl: ReportShellController, reqId: string): void => {
    if (viewEl === undefined || ctl.active() !== 'dag') { mountedReportDag = undefined; return }
    if (typeof viewEl.querySelector !== 'function') return
    const host = viewEl.querySelector<HTMLElement>('[data-dag-canvas]')
    if (host === null) { mountedReportDag = undefined; return }
    const stateKey = host.dataset.dagStateKey ?? ''
    if (mountedReportDag !== undefined && mountedReportDag.host === host && mountedReportDag.stateKey === stateKey) return
    mountedReportDag = { host, stateKey }
    const reqTasks = state?.tasks.filter(t => t.requirementId === reqId) ?? []
    tryMountDagCanvas(reqTasks, state?.ready?.[reqId], DAG_PANEL_CANVAS_ID, stateKey.length > 0 ? { stateKey } : {})
  }

  /**
   * 这一次渲染该走新壳还是旧详情页？**只有"端点未接线"才回落旧页**：
   *  - `unsupported`：200 但载荷不是报告摘要形状（中间层/桩）；
   *  - `notFound`：`/report` 404 —— 旧服务端没有这条路由（需求真不存在时旧页也会 404，
   *    由旧页渲染「未找到」，不会假装成功）。
   * 其余（loading / ready / degraded / 其它失败）都留在新壳：那是"接线了但暂时读不到"，
   * 页面该给的是诚实的三态说辞，而不是悄悄换一份实现。
   */
  const shellUnwired = (ctl: ReportShellController): boolean => {
    const h = ctl.head()
    return h.phase === 'unsupported' || (h.phase === 'error' && h.notFound === true)
  }

  const render = (): void => {
    if (viewEl === undefined) return
    if (state === undefined) { viewEl.innerHTML = buildEmpty(); return }
    // REQ-261004184822-9881 FR-1：下面的 innerHTML 赋值会销毁 `.dsh-pm-lanes`（横向滚动容器）
    // 与各列的 `.dsh-pm-lane-cards`（列内纵向容器）——位置只活在 DOM 上，故赋值前读出来、赋值后写回去。
    // 非泳道视图（列表 / 详情 / 任务总览）两边都静默跳过，且 capture 不覆盖已有记忆（FR-2）。
    captureBoardScroll(viewEl)
    // mode 在闭包内可被事件回调改写，直接 switch 无法做判别收窄；取 const 快照后再收窄（类型层修复，无行为变化）
    const cur = mode
    switch (cur.kind) {
      case 'board': {
        // REQ-261004210128-283d FR-3/FR-4：渲染时实时读运行态，并把本次用的集合记为门控基准
        const running = runningNow()
        lastRunning = running
        viewEl.innerHTML = buildBoard(state, Date.now(), boardView, listOpts(), archivedSids(), running)
        break
      }
      case 'req': {
        // ── REQ-261004222448-292a：先试新壳（常驻头部 + 六个同级 Tab + 懒加载 + 分段更新）──
        // 首屏只有 2 个请求（report + 默认 Tab trunk），且都不含正文；未点过的 Tab 一个请求都不发。
        const shot = shellForReq(cur.reqId)
        shot.setRevision(state.revision) // 台账变了 → 只重取「头部 + 当前 Tab」
        shot.ensure()                    // 幂等：首次取 report；失败不自动重试
        if (!shellUnwired(shot)) {
          // 分段的单位：头部段 / 状态带段 / Tab 栏段 / 当前面板段。首帧没有壳 → 整段渲染；
          // 之后一律分段替换（没变的段连 DOM 都不碰 → 滚动/展开/草稿由此保住）。
          const canQuery = typeof viewEl.querySelector === 'function'
          if (!canQuery || viewEl.querySelector('[data-report-seg="head"]') === null) {
            viewEl.innerHTML = shot.html()
          } else {
            applyReportSegments(viewEl, shot.segments())
          }
          // DAG 面板的画布是命令式挂载：DOM 已在屏之后补挂一次（幂等）
          mountReportDagIfActive(shot, cur.reqId)
          break
        }
        // ── 报告端点未接线：按**改造前**的方式回落旧详情页（新前端 + 旧服务端不白屏）──
        // REQ-261004195831-0f52 FR-1/FR-2/FR-3：**摘要只喂骨架，正文来自按需取全文**。
        // 改前这里直接 `state.requirements.find()` 交给 buildReqDetail —— `/state` 只发摘要后
        // 那句就是线上崩溃点（`renderComments(req.comments)` 对 undefined 取 .length）。
        const summary = state.requirements.find(r => r.id === cur.reqId)
        const entry = reqDetail.get(cur.reqId)
        // 每次重绘都无脑调：store 自己负责在途去重与按版本失效（版本没变就是纯读）
        reqDetail.ensure(cur.reqId, summary?.version, state.revision)
        // 与泳道滚动同款：innerHTML 赋值前把「用户自己弄出来的状态」取出来
        const draft = captureDetailDraft(viewEl)
        if (entry?.status === 'missing') {
          // 未找到（404）：说清是哪条需求没了 + 给返回按钮；**不**静默弹回看板（改前的行为）。
          // 优先级排在「上一次渲染过的全文」之前：需求被删后不能继续拿旧数据装作还在。
          viewEl.innerHTML = buildDetailMissing(cur.reqId, entry.message)
        } else if (entry?.status === 'error') {
          // 失败：原因 + 可复制命令 + 重试入口，同样留在详情态（同样不得被旧数据挡住）
          viewEl.innerHTML = buildDetailError(cur.reqId, entry.message, entry.hint)
        } else if (entry?.status === 'ready' || lastRenderedDetail.has(cur.reqId)) {
          // ready = 有全文；loading + 上一次渲染过的全文 = **重新取数途中**：
          // 先拿旧的顶着一帧（否则每来一条 SSE 详情页就闪一下 loading），新数据到了再换。
          const ready = entry?.status === 'ready' ? entry.record : lastRenderedDetail.get(cur.reqId)
          if (ready === undefined) {
            viewEl.innerHTML = buildDetailLoading(cur.reqId)
          } else {
            // DAG 画布与绿点共用同一份事实源：需求任务 + 队列 ready[]（缺 ready 时画布标「推导」）
            const reqTasks = state.tasks.filter(t => t.requirementId === ready.id)
            const reqReady = state.ready?.[ready.id]
            lastRenderedDetail.set(cur.reqId, ready)
            viewEl.innerHTML = buildReqDetail(ready, state.tasks, Date.now(), archivedSids())
            setStageNavActive(activeStage)
            void verifyDocExistence()
            // REQ-6f39b5：节点导航已删除，概览 Tab「当前阶段详情」进入即自动加载当前阶段
            void loadStageDetail(ready.id, ready.status)
            // REQ-422af1 t11：「本次注入了什么」只读块（按来源窗口回查留痕）
            void loadInjectionInfo(ready.sourceSessionId)
            // REQ-a33899 t6：Token tab 内容（打开详情即预取，切到该 tab 直接可见）
            void loadTokenTab(ready.id)
            // REQ-d3e61a T-5：条款接收状态（打开详情即取，红名单第一时间可见）
            void loadMarksBlock(ready.id)
            // 挂载 DAG Canvas（REQ-260928001915-f978）：真依赖边 + 悬停/钉住 + 关键路径/只看主线
            // REQ-261001210304-0dfb FR-4：需求视图状态记忆键含需求 id，
            // 否则同一块 #dag-canvas 承载不同需求时会把上一个需求的方向/开关带过来。
            tryMountDagCanvas(reqTasks, reqReady, 'dag-canvas', { stateKey: 'dag-canvas::' + ready.id })
          }
        } else {
          viewEl.innerHTML = buildDetailLoading(cur.reqId)
        }
        restoreDetailDraft(viewEl, draft)
        break
      }
      case 'task': {
        const task = state.tasks.find(t => t.id === cur.taskId)
        const req = task ? state.requirements.find(r => r.id === task.requirementId) : undefined
        if (task) {
          viewEl.innerHTML = buildTaskDetail(task, req, Date.now(), state.tasks, archivedSids())
        } else {
          // 回落看板时同样带上运行态（否则「任务详情 → 看板」这条路径会丢掉指示）
          const running = runningNow()
          lastRunning = running
          viewEl.innerHTML = buildBoard(state, Date.now(), boardView, listOpts(), archivedSids(), running)
          mode = { kind: 'board' }
        }
        break
      }
      case 'tasks':
        viewEl.innerHTML = buildTasksPage(state)
        break
    }
    // 新 DOM 已在屏：把位置写回去（找不到泳道容器 / 该列就跳过，绝不创建节点）
    restoreBoardScroll(viewEl)
  }

  // ---- 数据 ------------------------------------------------------------

  const fetchAll = async (): Promise<void> => {
    try {
      // FR-11：带上当前会话 id，服务端才能把读根解析成**本会话的工作区**（而不是插件宿主目录）
      const s = await api.fetchState(resolveCurrentSessionId())
      state = s
      // FR-4：缓存服务端工作区根——open-doc 打开与显示文档统一走绝对路径（与查看会话工作区解耦）；
      // 同时缓存需求级 workspaceRoot 表（FR-6：产物相对需求工作区落盘，读路径必须同根，
      // 否则需求写在他仓（如 dsh-notice-webhook）时按会话根拼出的路径必 404）。
      const reqRoots: Record<string, string> = {}
      for (const r of s.requirements) {
        if (typeof r.workspaceRoot === 'string' && r.workspaceRoot.length > 0) reqRoots[r.id] = r.workspaceRoot
      }
      setDocWorkspaceContext(s.workspaceRoot, s.homeDir, reqRoots, s.sessionWorkspaceRoot)

      // 🔧 修复：刷新时重置 activeStage 为需求当前状态
      // 如果当前在需求详情页，将 activeStage 重置为该需求的当前状态
      // 这样刷新后 tab 会自动回到"当前阶段"，不会因为 SSE 刷新破坏用户选择的 tab 位置
      // 取快照后再收窄：mode 是可被事件回调改写的闭包变量，回调里直接读 mode.reqId 不受收窄约束
      const cur = mode
      if (cur.kind === 'req') {
        const req = s.requirements.find(r => r.id === cur.reqId)
        if (req) {
          activeStage = req.status
        }
      }
      render()
    } catch (err) {
      // REQ-261003191948-e94a FR-4：把服务端给的原因与**可复制命令**一起呈现。
      // 此前只传 String(err)（=「Error: HTTP 404」），服务端说的话全丢了。
      if (viewEl !== undefined) {
        viewEl.innerHTML = buildError(
          err instanceof ApiError ? err.message : String(err),
          err instanceof ApiError ? err.hint : undefined,
        )
      }
    }
  }

  // SSE：台账变更即刷新（revision 单调即接受）
  const startEvents = (): void => {
    unsubEvents?.()
    unsubEvents = api.subscribeEvents(() => { void fetchAll() })
  }

  // ---- 事件委派 --------------------------------------------------------

  const onClick = (ev: MouseEvent): void => {
    const target = ev.target as Element
    console.log('[pmboard] onClick', { target, tagName: target.tagName, className: target.className })
    // REQ-261004222448-292a：详情页新壳的面板内分页（「加载更早」）先试——它没有 data-action，
    // 走 `panelIntentOf` 的纯映射（可单测），落点是壳的分页合并（累积与合并都由壳负责）。
    // 注意：`data-open-doc`（点开正文）**不在这里**——那条链由壳自己接（只能有一处接）。
    const intent = panelIntentOf(target)
    if (intent !== undefined) {
      const reqId = target.closest<HTMLElement>('.dsh-pm-detail')?.dataset.detailReq
        ?? (mode.kind === 'req' ? mode.reqId : undefined)
      if (reqId === undefined || reqId.length === 0) return
      shellForReq(reqId).loadEarlier(intent.cursor)
      render()
      return
    }
    // 分页控件由 render/pagination 渲染（data-pmpage，无 data-action）
    const pageEl = target.closest<HTMLElement>('[data-pmpage]')
    if (pageEl !== null && state !== undefined) {
      const p = Number(pageEl.dataset.pmpage)
      if (Number.isFinite(p) && p >= 1) { listPage = p; render() }
      return
    }
    const el = target.closest<HTMLElement>('[data-action]')
    console.log('[pmboard] found data-action element:', { el, action: el?.dataset.action, state: !!state })
    if (el === null || state === undefined) return
    const action = el.dataset.action ?? ''
    console.log('[pmboard] handling action:', action)

    switch (action) {
      case 'settings-open':
        // 弹窗挂 document.body（R1：容器会被 innerHTML 重绘抹掉），故它自建委派（R2）；
        // 跳会话与打开文档经下方 deps 注入，不反向 import 本模块（避免成环）。
        openBoardSettings('limits')
        return
      case 'refresh':
        void fetchAll()
        return
      case 'retry-detail': {
        // REQ-261004195831-0f52 FR-2：详情取数失败/未找到后的重试入口。
        // 只重取这条需求（不是整块看板）：store 会清旧结果并立刻登记 loading。
        const reqId = el.dataset.id
        if (reqId === undefined || reqId.length === 0) return
        reqDetail.retry(reqId)
        render()
        return
      }
      // REQ-261004222448-292a：新壳的两个显式重试出口（失败态不自动重试，重试是人的动作）
      case 'report-panel-retry': {
        const reqId = mode.kind === 'req' ? mode.reqId : undefined
        if (reqId === undefined) return
        shellForReq(reqId).retry()
        render()
        return
      }
      case 'report-head-retry': {
        const reqId = mode.kind === 'req' ? mode.reqId : undefined
        if (reqId === undefined) return
        shellForReq(reqId).retryHead()
        render()
        return
      }
      case 'switch-view': {
        const next = el.dataset.view
        if (next === 'lanes' || next === 'list') {
          boardView = next
          writeViewPref(next)
          mode = { kind: 'board' }
          render()
        }
        return
      }
      case 'list-sort': {
        // 同键再点 = 切换升降序；换键 = 用该键的默认方向；排序变化回到第 1 页
        const key = el.dataset.key as ListSortKey | undefined
        if (key === undefined || !(LIST_SORT_KEYS.includes(key))) return
        if (key === listSortKey) {
          listSortDir = listSortDir === 'asc' ? 'desc' : 'asc'
        } else {
          listSortKey = key
          listSortDir = defaultListDirFor(key)
        }
        listPage = 1
        writeListPref()
        render()
        return
      }
      case 'open-doc': {
        // REQ-ff20ca t6：看板文档点击同样走官方右侧栏（弹窗已整套删除，无降级）
        const path = el.dataset.path
        if (path) openDocInSidebar(window.__dshPmCtx, path, resolveCurrentSessionId())
        return
      }
      // REQ-6f39b5 t-006：Tab 切换
      case 'switch-tab': {
        const tab = target.closest<HTMLElement>('.dsh-pm-tab')
        if (!tab) return
        const tabName = tab.dataset.tab
        if (!tabName) return
        
        // 切换 Tab active 状态
        const tabsContainer = tab.closest<HTMLElement>('.dsh-pm-detail')
        if (!tabsContainer) return
        // REQ-261004222448-292a：新壳走控制器——**切到才取数**；同 revision 内切回命中缓存。
        // 面板的"卸载上一个 / 挂载这一个"由分段替换完成（DOM 里任何时刻只有一个面板）。
        // 这里**不**调 setDetailTab：active 类由控制器重绘的 Tab 栏给出（单一事实源），
        // 在 DOM 上再改一遍只会短暂地与面板内容不一致。
        if (tabsContainer.dataset.reportShell === '1') {
          const shellReqId = tabsContainer.dataset.detailReq
          if (shellReqId !== undefined && shellReqId.length > 0 && isReportTabKey(tabName)) {
            shellForReq(shellReqId).select(tabName)
          }
          return
        }
        // 旧壳（回落路径）：语义与改造前**逐字不变**
        // 与「重绘后回填」共用同一处切换实现（setDetailTab），避免两套切法各说各话
        setDetailTab(tabsContainer, tabName)
        // REQ-a33899 t6：Token tab 首次切到时确保已取数（打开详情时通常已预取）
        if (tabName === 'token') {
          const reqId = (tabsContainer as HTMLElement).dataset.detailReq
          if (reqId !== undefined && reqId.length > 0) void loadTokenTab(reqId)
        }
        // REQ-260926140539-457b FR-6：Traceability tab 首次切到时加载追溯数据
        // 修复：原实现引用 currentReqDetail（全仓无此变量）→ 客户端 ReferenceError，
        // 且 tsdown 不做类型检查，该缺陷已被打进产物。改用真实存在的来源：
        // reqId 取自详情容器的 data-detail-req，节点优先 activeStage、回落到需求主状态。
        if (tabName === 'traceability') {
          const reqId = (tabsContainer as HTMLElement).dataset.detailReq
          const stage = activeStage
            ?? (reqId !== undefined ? state?.requirements.find(r => r.id === reqId)?.status : undefined)
          if (reqId !== undefined && reqId.length > 0 && stage !== undefined && stage.length > 0) {
            void loadTraceabilityBlock(reqId, stage)
          }
        }
        return
      }
      // REQ-a33899 t6：Token 表点节点行 → 展开/收起该阶段任务明细
      case 'toggle-token-node': {
        const row = el.closest<HTMLElement>('.dsh-pm-tok-node')
        const stage = row?.dataset.stage
        if (row === null || stage === undefined) return
        const table = row.closest('table')
        table?.querySelectorAll<HTMLElement>('.dsh-pm-tok-sub').forEach((sub) => {
          if (sub.dataset.parentStage !== stage) return
          sub.style.display = sub.style.display === 'none' ? '' : 'none'
        })
        return
      }
      case 'load-stage': {
        const reqId = el.dataset.req
        const stage = el.dataset.stage
        if (reqId && stage) {
          activeStage = stage
          setStageNavActive(stage)
          void loadStageDetail(reqId, stage)
        }
        return
      }
      case 'auto-run-pause':
      case 'auto-run-resume':
      case 'auto-run-stop': {
        // 自动链控制面（REQ-4842fe t-3be71b）：暂停 / 继续 / 终止。
        // 继续 = 置 autoRun=true 并由服务端**立即触发一次推进事件**（推进器未装配时服务端如实说明）。
        const reqId = el.dataset.id ?? (mode.kind === 'req' ? mode.reqId : undefined)
        if (!reqId) return
        const act = el.dataset.action
        if (act === 'auto-run-stop' && !window.confirm('终止 = 暂停自动链；在跑/待跑的卡需人工取消（取消是人工闸门）。确定？')) return
        const on = act === 'auto-run-resume'
        const verb = act === 'auto-run-pause' ? '暂停' : on ? '继续' : '终止'
        void api.setAutoRun(reqId, on, fmt('看板控制面：{verb}', { verb }))
          .then(() => fetchAll())
          .catch(e => window.alert(String(e)))
        return
      }
      case 'toggle-subtasks':
        // 子卡区用原生 <details> 自己开合；这里只吃掉这次点击，避免冒泡到卡片的 open-task
        return
      case 'confirm-artifact': {
        const reqId = el.dataset.id
        const kind = el.dataset.kind
        if (reqId && kind) {
          void api.confirmArtifact({ id: reqId, kind })
            .then(() => fetchAll())
            .catch(e => window.alert(String(e)))
        }
        return
      }
      case 'submit-verdicts': {
        // 验收单逐项裁决（REQ-2e9473 t14）：从 DOM 收集每项 通过/不通过 + 意见
        const reqId = el.dataset.req
        const version = Number(el.dataset.version)
        const sheetEl = el.closest<HTMLElement>('.dsh-pm-vsheet')
        if (!reqId || !Number.isFinite(version) || sheetEl === null) return
        const verdicts: { itemId: string; status: 'passed' | 'failed'; opinion?: string }[] = []
        // REQ-260930183951-eb6c：前端与域门对齐——**通过也必须填实际结果**（2d65 FR-1）。
        // 此前 placeholder 写「不通过时填意见」、留空就不发送，于是「勾通过 + 留空」必然被服务端
        // 400（用户只看到一个原始错误）。这里先在本层拦下，点名缺哪几项、并要求填什么。
        const missingOpinion: string[] = []
        sheetEl.querySelectorAll<HTMLElement>('.dsh-pm-vitem').forEach((itemEl) => {
          const itemId = itemEl.dataset.itemId
          if (itemId === undefined) return
          const checked = itemEl.querySelector<HTMLInputElement>('input[type="radio"]:checked')
          if (checked === null) return
          const opinionEl = itemEl.querySelector<HTMLInputElement>('.dsh-pm-vitem-opinion')
          const opinion = opinionEl?.value.trim() ?? ''
          if (opinion.length === 0) missingOpinion.push(itemId)
          verdicts.push({
            itemId,
            status: checked.value === 'passed' ? 'passed' : 'failed',
            ...(opinion.length > 0 ? { opinion } : {}),
          })
        })
        if (verdicts.length === 0) { window.alert('请先逐项选择 通过/不通过'); return }
        if (missingOpinion.length > 0) {
          window.alert('以下验收项还缺「实际结果 / 意见」：' + missingOpinion.join('、') +
            '\n通过项请填实际结果（例：npx vitest run tests/x.test.ts → 4 passed）；不通过项请填意见。两者都必填。')
          return
        }
        void api.submitVerdicts({ id: reqId, version, verdicts })
          .then(() => fetchAll())
          .catch(e => window.alert(String(e)))
        return
      }
      case 'new-req': {
        const title = window.prompt('需求标题')
        if (title && title.trim()) {
          void api.createReq({ title: title.trim() }).then(() => fetchAll()).catch(e => window.alert(String(e)))
        }
        return
      }
      case 'open-req':
        if (el.dataset.req) { activeStage = undefined; mode = { kind: 'req', reqId: el.dataset.req }; render() }
        return
      case 'open-task': {
        const taskId = el.dataset.task
        if (!taskId) return
        // 切换到任务详情页
        mode = { kind: 'task', taskId }
        render()
        // 同时跳转到该任务所属需求的会话窗口（延迟执行，等待服务就绪）
        const task = state.tasks.find(t => t.id === taskId)
        if (task) {
          const req = state.requirements.find(r => r.id === task.requirementId)
          if (req?.sourceSessionId) {
            // 延迟 100ms，确保会话服务已初始化
            setTimeout(() => {
              void jumpToSession(windowServiceAccess(), req.sourceSessionId!)
                .then(result => {
                  const msg = jumpResultMessage(result, req.sourceSessionId!)
                  if (msg !== '') console.log('[pmboard] 会话跳转:', msg)
                })
                .catch(e => console.error('[pmboard] 会话跳转失败:', e))
            }, 100)
          }
        }
        return
      }
      case 'open-tasks':
        activeStage = undefined
        mode = { kind: 'tasks' }
        render()
        return
      case 'new-task': {
        // 人工建卡（agent 走 reqboard_decompose 批量拆分）；建完留在详情页由 fetchAll 重绘
        const reqId = el.dataset.id
        if (!reqId) return
        const title = window.prompt('任务标题')
        if (title && title.trim()) {
          void api
            .createTask({ requirementId: reqId, title: title.trim(), phase: 'implement', side: 'fullstack' })
            .then(() => fetchAll())
            .catch(e => window.alert(String(e)))
        }
        return
      }
      case 'back':
        activeStage = undefined
        mode = { kind: 'board' }; render()
        return
      case 'back-req':
        activeStage = undefined
        mode = { kind: 'req', reqId: el.dataset.req ?? '' }; render()
        return
      case 'move-req': {
        // 卡面按钮自带 data-id（泳道图直接操作）；详情页闸门按钮退回用当前详情需求
        const reqId = el.dataset.id ?? (mode.kind === 'req' ? mode.reqId : undefined)
        const to = el.dataset.to
        if (reqId && to) {
          void api
            .moveReq({ id: reqId, to, actor: 'human', reason: el.dataset.id ? '看板泳道卡面操作' : '需求详情页操作' })
            .then(() => fetchAll())
            .catch(e => window.alert(String(e)))
        }
        return
      }
      case 'add-comment': {
        // REQ-261004222448-292a：**按被点按钮所在的表单**取值——详情页现在有两个以上评论框
        // （常驻头部 + 对话 Tab），按"第一个"取会让面板里的「发送」读头部那个（多为空）→ 静默不提交。
        const input = commentInputOf(el, viewEl)
        const body = input?.value.trim()
        if (body && el.dataset.target && el.dataset.id) {
          void api.addComment({ target: el.dataset.target as 'req' | 'task', id: el.dataset.id, body, actor: 'human' })
            .then(() => { if (input !== undefined) input.value = ''; return fetchAll() })
            .catch(e => window.alert(String(e)))
        }
        return
      }
      case 'jump-session': {
        console.log('[pmboard] jump-session action triggered', { el, dataset: el.dataset })
        const sid = el.dataset.sid
        console.log('[pmboard] jump-session: sid =', sid)
        void handleSessionJump(sid)
        return
      }
      case 'verify-pass': {
        const reqId = el.dataset.id
        if (!reqId) return
        // REQ-a8d582 FR-1：先把「不通过 / 未裁决」摆到人眼前再问是否仍要通过。
        // 取消 → 直接 return：一个请求都不发（验收标准 2 的"零副作用"就落在这里）。
        // REQ-261004195831-0f52：确认文案要读**验收材料本体**（摘要里没有该字段）——
        // 优先用详情取数条目里的全文；只有条目未就绪时才退回摘要（此时文案口径与旧版一致，
        // 并顺手触发一次取数，让下一次点击拿得到真材料）。
        const full = reqDetail.get(reqId)
        if (full === undefined) reqDetail.ensure(reqId)
        const target = full?.status === 'ready'
          ? full.record
          : state?.requirements.find(r => r.id === reqId)
        const copy = verifyConfirmCopy(target)
        if (!window.confirm(copy.message)) return
        void api
          .verifyPass({
            id: reqId,
            ...(copy.overrideDetail !== undefined ? { confirm_override: copy.overrideDetail } : {}),
          })
          .then(() => fetchAll())
          .catch(e => window.alert(String(e)))
        return
      }
      case 'verify-rework': {
        const reqId = el.dataset.id
        if (!reqId) return
        const note = window.prompt('退回返工的意见（窗口会按它整改）')
        if (note === null) return
        void api
          .verifyRework({ id: reqId, note: note.trim() || '（未填意见）' })
          .then(() => fetchAll())
          .catch(e => window.alert(String(e)))
        return
      }
      // REQ-261002105242-a3fb FR-4：归档动作的事件分支已删除——它的端点（POST /req/archive）
      // 由 REQ-9f4a44 移除，按钮本身也不再渲染（renderActionBar 对终态早退）。留着分支只会
      // 变成一条永远进不来、进来了也必然 404 的死路。
      case 'plan-approve': {
        const reqId = el.dataset.id
        if (reqId) {
          void api
            .approvePlan({ id: reqId })
            .then(() => fetchAll())
            .catch(e => window.alert(String(e)))
        }
        return
      }
      case 'plan-reject': {
        const reqId = el.dataset.id
        if (!reqId) return
        const reason = window.prompt('退回理由（窗口会按它重写拆分计划）')
        if (reason === null) return
        void api
          .rejectPlan({ id: reqId, reason: reason.trim() || '（未填理由）' })
          .then(() => fetchAll())
          .catch(e => window.alert(String(e)))
        return
      }
    }
  }

  /** 每页条数下拉（<select> 走 change，不走 click）。 */
  const onChange = (ev: Event): void => {
    const target = ev.target as Element | null
    if (target === null || typeof target.closest !== 'function') return

    // 列表每页条数选择器
    const listSizeEl = target.closest<HTMLSelectElement>('[data-action="list-size"]')
    if (listSizeEl !== null) {
      const size = Number(listSizeEl.value)
      if (!LIST_PAGE_SIZES.includes(size)) return
      listPageSize = size
      listPage = 1
      writeListPref()
      render()
      return
    }
  }

  // （REQ-ff20ca t6）旧文档弹窗已整套删除；文档打开统一走 openDocInSidebar（官方右侧栏）。

  /**
   * 校验文档可打开性（REQ-b63a7d t4）：逐条 /file 预检 → **一次批量解析**。
   *
   * 为什么必须换：旧实现每个文档发一条 GET，路径只要不在 docs/ 内就被白名单判 403，
   * 控制台持续刷红（实测 142 条：源码类产物、仓库根相对、跨仓、伪路径全中）。批量端点
   * 由 host 单点判定（归一层 + fs）且恒 200 → 不再产生任何失败请求；判定原因直接展示，
   * 跨仓/伪路径不再被含糊地叫「文件不存在」。
   */
  const verifyDocExistence = async (): Promise<void> => {
    if (viewEl === undefined) return
    const items = Array.from(viewEl.querySelectorAll<HTMLElement>('[data-doc-path]'))
    if (items.length === 0) return
    const paths = Array.from(new Set(items.map(li => li.dataset.docPath ?? '').filter(p => p.length > 0)))
    if (paths.length === 0) return
    let verdicts: api.DocPathVerdictView[]
    try {
      verdicts = (await api.resolveReqDocs(paths, resolveCurrentSessionId())).results ?? []
    } catch {
      // 通道不可用 → 不做任何标记（宁可保持可点击，也不误标「缺失」；R-013 诚实降级）
      return
    }
    const byPath = new Map(verdicts.map(v => [v.path, v]))
    for (const li of items) {
      const path = li.dataset.docPath ?? ''
      const v = byPath.get(path)
      if (v === undefined || v.openable) continue
      li.classList.add('is-missing')
      li.setAttribute('title', v.reason ?? '文件不可打开')
      // 判为不可打开后移除预检锚点：DOM 上不再残留 data-doc-path
      li.removeAttribute('data-doc-path')
      const btn = li.querySelector<HTMLElement>('[data-action="open-doc"]')
      if (btn) {
        btn.removeAttribute('data-action')
        btn.classList.add('dsh-pm-doc-missing')
      }
    }
  }

  /** 加载单节点工作记录并渲染（REQ-31e11f v4：点哪个节点只看哪个）。 */
  const loadStageDetail = async (reqId: string, stage: string): Promise<void> => {
    const container = document.getElementById('dsh-pm-stage-detail-container')
    if (container === null) return
    container.innerHTML = '<div class="dsh-pm-empty">详情加载中…</div>'
    try {
      const res = await fetch('/dashboard/api/reqboard/requirements/' + encodeURIComponent(reqId) + '/stages', {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        container.innerHTML = '<div class="dsh-pm-empty">详情暂不可用（HTTP ' + res.status + '）</div>'
        return
      }
      const json = await res.json() as { success?: boolean; data?: StageOverview }
      if (json.success === true && json.data !== undefined) {
        container.innerHTML = renderStageNode(json.data, stage as StageKey)
      } else {
        container.innerHTML = '<div class="dsh-pm-empty">详情暂不可用</div>'
      }
    } catch (e) {
      container.innerHTML = '<div class="dsh-pm-empty">详情加载失败：' + String(e) + '</div>'
    }
  }

  /**
   * 加载「本次注入」只读信息块（REQ-422af1 t11）。
   * 留痕不可用（端口未装配 / 接口失败）时不报错、不留白：渲染明确的空态「尚无记录」。
   */
  const loadInjectionInfo = async (sourceSessionId: string | undefined): Promise<void> => {
    const container = document.getElementById('dsh-pm-injection-info-container')
    if (container === null) return
    // 无来源窗口（人工建卡）→ 没有"本次注入"可言：保持空态，不拿全量留痕冒充本需求的注入。
    if (!hasInjectionWindow(sourceSessionId)) {
      container.innerHTML = renderInjectionInfo([])
      return
    }
    try {
      const info = await api.fetchInjectionInfo(sourceSessionId)
      container.innerHTML = renderInjectionInfo(info.available ? info.entries : [])
    } catch {
      container.innerHTML = renderInjectionInfo([])
    }
  }

  /**
   * 加载「🪙 Token」tab 内容（REQ-a33899 t6）：按当前需求 id 取 /requirements/:id/token。
   * 幂等（同一需求只取一次）；失败渲染明确空态，不报错不留白。
   */
  let tokenLoadedFor: string | undefined
  const loadTokenTab = async (reqId: string): Promise<void> => {
    const container = document.getElementById('dsh-pm-token-container')
    if (container === null) return
    if (tokenLoadedFor === reqId) return
    try {
      container.innerHTML = renderTokenTab(await api.fetchRequirementToken(reqId))
      tokenLoadedFor = reqId
    } catch {
      container.innerHTML = renderTokenPlaceholder('Token 数据暂不可用（接口失败或需求不存在）')
    }
  }

  /**
   * 加载「🏷 条款接收状态」（REQ-d3e61a T-5）：按当前需求 id 取 /requirements/:id/marks。
   * 不做"按 id 记住已加载"的缓存——详情页每次渲染都会重建容器，那种缓存会让同一需求
   * 重开时永远停在"加载中…"；这里只挡同一需求的并发重复请求。
   */
  let marksInFlight: string | undefined
  const loadMarksBlock = async (reqId: string): Promise<void> => {
    const container = document.getElementById('dsh-pm-marks-container')
    if (container === null) return
    if (marksInFlight === reqId) return
    marksInFlight = reqId
    try {
      container.innerHTML = renderMarksBlock(await api.fetchRequirementMarks(reqId))
    } catch {
      container.innerHTML = renderMarksPlaceholder('接收状态暂不可用（接口失败或需求不存在）')
    } finally {
      marksInFlight = undefined
    }
  }

  /**
   * 加载「🔗 追溯关系」（REQ-260926140539-457b FR-6）：从 stageDetail.body 提取追溯数据，
   * 渲染到 #dsh-pm-traceability-container，并初始化双向绑定交互。
   */
  let traceabilityLoadedFor: string | undefined
  const loadTraceabilityBlock = async (reqId: string, stage: string): Promise<void> => {
    const container = document.getElementById('dsh-pm-traceability-container')
    if (container === null) return
    const cacheKey = `${reqId}:${stage}`
    if (traceabilityLoadedFor === cacheKey) return
    
    try {
      // 重新获取 stage detail 数据（包含追溯信息）
      const res = await fetch(`/dashboard/api/reqboard/requirements/${encodeURIComponent(reqId)}/stage/${encodeURIComponent(stage)}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        container.innerHTML = '<div class="dsh-pm-traceability-empty"><div class="dsh-pm-empty-text">追溯数据加载失败（HTTP ' + res.status + '）</div></div>'
        return
      }
      const stageDetail = await res.json()
      
      // 使用 updateTraceabilityView 渲染追溯数据
      const detailContainer = document.querySelector('.dsh-pm-req-detail')
      if (detailContainer && stageDetail) {
        updateTraceabilityView(stageDetail, detailContainer as HTMLElement)
        traceabilityLoadedFor = cacheKey
      }
    } catch (err) {
      console.warn('[pmboard] 追溯数据加载失败:', err)
      container.innerHTML = '<div class="dsh-pm-traceability-empty"><div class="dsh-pm-empty-text">追溯数据加载失败</div></div>'
    }
  }

  // ---- 挂载：事件委派 + SSE + 轮询/可见性 ------------------------------

  // 容器上的 click/change 事件委派（渲染出的卡片按钮全走这里）
  container.addEventListener('click', onClick)
  container.addEventListener('change', onChange)
  // REQ-261004111917-f473 FR-2：看板**已在屏**时的定位通道。
  // 只在挂载时取一次 `takeBoardFocus()` 覆盖不到这种情形（面板不重挂 → 意图只能滞留到下次进看板），
  // 故挂载期间订阅定位通知；handler 与既有 open-req 分支同款：清阶段选中态 + 切详情 + 重绘。
  const unsubFocus = boardFocus.subscribeBoardFocus((reqId) => {
    // 返回 false = 本实例**没消费**（已卸载或不在屏）→ 交回持有器：
    // 否则「隐藏实例把意图吃掉、随即被卸载」会让用户再也看不到这次定位（复核 R2）
    if (disposed || !isActive()) return false
    activeStage = undefined
    mode = { kind: 'req', reqId }
    render()
    return true
  })
  // 挂载即拉一次；SSE 订阅随 disposer 释放
  void fetchAll()
  startEvents()
  /**
   * 运行态订阅（REQ-261004210128-283d FR-5）：会话 store 一通知就比一次「相关运行集合」，
   * 变了才重绘——无关会话的抖动在这里被挡掉，看板不会被别的窗口刷屏式重绘。
   */
  unsubRunning = subscribeSessionRunning(() => {
    if (disposed || !runningChanged()) return
    scheduleRender()
  })

  const stopPolling = (): void => {
    if (pollTimer !== undefined) { window.clearInterval(pollTimer); pollTimer = undefined }
  }
  const startPolling = (): void => {
    stopPolling()
    // isActive 是每次 tick 才求值：宿主的面板可见性变化不需要重挂容器
    pollTimer = window.setInterval(() => { if (!disposed && isActive()) void fetchAll() }, pollMs)
  }
  const onVisibility = (): void => {
    if (document.hidden) stopPolling()
    else startPolling()
  }
  if (poll) {
    document.addEventListener('visibilitychange', onVisibility)
    startPolling()
  }

  return {
    refresh: () => { void fetchAll() },
    dispose: () => {
      if (disposed) return
      disposed = true
      // 先退订定位通道（复核 R7d：容器桩若在 removeEventListener 上抛错，不该连累退订）
      unsubFocus()
      container.removeEventListener('click', onClick)
      container.removeEventListener('change', onChange)
      unsubEvents?.()
      unsubEvents = undefined
      // REQ-261004210128-283d FR-8：运行态订阅一并释放（disposed 已置真 → 迟到的通知也不会重绘）
      unsubRunning?.()
      unsubRunning = undefined
      stopPolling()
      if (poll) document.removeEventListener('visibilitychange', onVisibility)
      // REQ-261004195831-0f52：卸载即作废在途取数（迟到响应不得写回已释放的视图）
      reqDetail.reset()
      lastRenderedDetail.clear()
      // REQ-261004222448-292a：新壳同样作废在途面板/头部响应（卸载后迟到者一律丢弃），
      // 并释放壳自己的点击委派（`data-open-doc`）与 DAG 画布记忆
      reportShell?.detach()
      unsubShellDom?.()
      unsubShellDom = undefined
      mountedReportDag = undefined
      reportShell = undefined
      reportShellFor = undefined
      viewEl = undefined
    },
  }
}

/**
 * 宿主入口（REQ-260928185112-e20d FR-2）：attachBoard(container) → 清理函数。
 * 薄转发：让「挂载即在看」的 React 宿主不必知道内部句柄形状。
 */
export function attachBoard(container: HTMLElement, options: AttachBoardOptions = {}): () => void {
  // 设置弹窗挂在 body 上（R1），容器卸载时一并释放，避免残留浮层
  configureBoardSettings({
    jumpToWindow: (windowKey) => { void jumpToSession(windowServiceAccess(), windowKey) },
    openDoc: (path) => openDocInSidebar(window.__dshPmCtx, path, resolveCurrentSessionId()),
    settingsButton: () => container.querySelector<HTMLElement>('[data-action="settings-open"]') ?? undefined,
  })
  const attachment = createBoardAttachment(container, options)
  return () => {
    attachment.dispose()
    disposeBoardSettings()
  }
}
