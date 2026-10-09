/**
 * 项目看板 client 数据层 —— /dashboard/api/reqboard 的类型化 fetch 封装 + SSE 订阅。
 * 模式参照 dsh-taskboard client/api.ts（超时保护 + unwrap + EventSource 重连）。
 *
 * @module dsh-pmboard/client/api
 */
import type { BoardPendingConfirm, BoardState, RequirementRecord } from './types.ts'
import type {
  DagResponse,
  DialogueResponse,
  DocsResponse,
  PanelResult,
  PromptsResponse,
  ReportResponse,
  RequirementMarksView,
  RequirementTokenView,
  StageDetail,
  StageOverview,
  TokenAvailability,
  TokenOptimization,
  TrunkResponse,
  VerifyPanelResponse,
} from '../shared/protocol.ts'
// REQ-261004222448-292a：Tab 键的**唯一定义**在壳模块（report-tabs.ts），这里只 import type
// （类型引用编译期擦除，运行时不产生 client 内部环）。
import type { ReportTabKey } from './views/report-tabs.js'
import type { InjectionInfoResponse } from './injection-info.ts'
import type { IsolationLogEntry } from './node-panel-process.ts'

const BASE = '/dashboard/api/reqboard'
const TIMEOUT_MS = 8000

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /**
     * 服务端给的修复命令（REQ-261003191948-e94a FR-4）。
     * 服务端没给 → undefined；调用方据此决定要不要渲染「在终端执行」块。
     */
    readonly hint?: string,
    /**
     * HTTP 状态码（REQ-261004195831-0f52 FR-2）。
     *
     * 为什么必须带出来：`code` 是**可选**的（interfaces.md 的 404 契约里 code 可缺），
     * 只认 `code` 时「需求不存在」会退化成普通失败 → 界面给「重试」这条走不通的路。
     * 有状态码就能按 `404` 判「未找到」，不再靠解析 `message` 文案（那太脆）。
     */
    readonly status?: number,
  ) { super(message) }
}

/**
 * 非 2xx 时**把服务端说的话原样带上来**（REQ-261003191948-e94a FR-4）。
 *
 * 修复前这里只有一行 `throw new ApiError('HTTP ' + res.status)`——响应体被直接丢弃。
 * 后果：2026-10-03 事故里服务端明明回了「台账未迁移 + 迁移命令」，
 * 看板页面却只能显示「加载失败：Error: HTTP 404」，用户完全无从下手。
 *
 * 不编原因：服务端没给 `error` 时仍然退回状态码，绝不替它猜一个理由。
 */
async function errorOf(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => undefined)) as
    | { error?: unknown; code?: unknown; hint?: unknown }
    | undefined
  const message = typeof body?.error === 'string' && body.error.length > 0
    ? body.error
    : 'HTTP ' + res.status
  return new ApiError(
    message,
    typeof body?.code === 'string' ? body.code : undefined,
    typeof body?.hint === 'string' && body.hint.length > 0 ? body.hint : undefined,
    res.status,
  )
}

async function unwrap<T>(p: Promise<Response>): Promise<T> {
  const res = await p
  if (!res.ok) throw await errorOf(res)
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string; code?: string }
  if (json.success !== true) throw new ApiError(json.error ?? 'API 返回失败', json.code)
  return json.data as T
}

const get = <T>(path: string): Promise<T> =>
  unwrap<T>(fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS) }))

// ── 知识层（REQ-261001110934-3766 t6）：与 Agent 工具同源（同一用例、同一预算口径） ──
export interface KnowledgeHit {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly oneLiner: string
  readonly pointer: string
  readonly updatedAt: string
  readonly body?: string
}
export interface KnowledgePageLine {
  readonly path: string
  readonly lines: number
}
export interface KnowledgeResponse {
  readonly items: readonly KnowledgeHit[]
  readonly total: number
  readonly truncated: boolean
  readonly budgetChars: number
  readonly hint?: string
  readonly pages?: readonly KnowledgePageLine[]
}

/** 读知识层（只读）：`list=true` = 列索引全部；`budgetChars` 不足时后端只回指针。 */
export function fetchKnowledge(input: { list?: boolean; kind?: string; query?: string; id?: string; limit?: number; budgetChars?: number }): Promise<KnowledgeResponse> {
  const q = new URLSearchParams()
  if (input.list === true) q.set('list', '1')
  if (input.kind !== undefined) q.set('kind', input.kind)
  if (input.query !== undefined) q.set('query', input.query)
  if (input.id !== undefined) q.set('id', input.id)
  if (input.limit !== undefined) q.set('limit', String(input.limit))
  if (input.budgetChars !== undefined) q.set('budget_chars', String(input.budgetChars))
  return get<KnowledgeResponse>(BASE + '/kb?' + q.toString())
}

/** PATCH 辅助（与 `post` 同款：同一份信封解析与超时保护，不另造一套）。 */
const patch = <T>(path: string, body: unknown): Promise<T> =>
  unwrap<T>(fetch(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }))

const post = <T>(path: string, body: unknown): Promise<T> =>
  unwrap<T>(fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }))

// -- 运行设置（REQ-261004103330-005f t11）------------------------------------
/**
 * 五个设置类请求（`interfaces.md` 已定名）。
 *
 * 为什么集中在 `api.ts` 而不是 settings 模块内各自 fetch：全仓只有**一套**信封解析与
 * `ApiError`（含服务端原话与可复制命令），新开一处必然漂移出第二套错误语义。
 */
export function fetchRunSettings(): Promise<import('./settings/types.ts').RunSettingsView> {
  return get(BASE + '/settings')
}

export function patchRunSettings(
  body: { stageMaxRounds?: Record<string, number>; storage?: { sqlitePath?: string } },
): Promise<{ stageMaxRounds?: Record<string, unknown>; restartRequired?: boolean }> {
  return patch(BASE + '/settings', body)
}

/** 取确认票据（FR-11：这只是"问"，人作答落章后才可能被消费）。 */
export function requestStorageAction(
  action: 'switch-to-sqlite' | 'switch-to-json' | 'migrate',
): Promise<import('./settings/types.ts').StorageActionTicket> {
  return post(BASE + '/settings/storage/request', { action })
}

/** 带票据切后端（缺票/过期/已消费 → 403 `confirmation_required`）。 */
/**
 * 用**系统默认程序**打开配置文件（宿主侧执行；`path` 必须与宿主白名单里那两份之一**完全相等**）。
 *
 * 为什么不用右侧栏：那条通道只吃**工作区内**的文档，而配置在 `~/.dsh/` 下（2026-10-04 实测打不开）。
 */
export function openConfigFile(path: string): Promise<{ readonly ok: boolean; readonly reason?: string }> {
  return post(BASE + '/settings/open-file', { path })
}

export function switchStorageBackend(
  input: { backend: 'json' | 'sqlite'; ticket: string; reason?: string },
): Promise<import('./settings/types.ts').StorageSwitchResult> {
  return post(BASE + '/settings/storage/switch', input)
}

/** 发起迁移（宿主开 Agent 窗口并投递任务；返回窗口键）。 */
export function startLedgerMigration(
  ticket: string,
): Promise<import('./settings/types.ts').MigrationStartResult> {
  return post(BASE + '/settings/storage/migrate', { ticket })
}

/** 读系统记录（损坏时服务端给 200 + invalid 标记，不 500——t2 口径）。 */
export function fetchSystemRecord(
  limit?: number,
): Promise<import('./settings/types.ts').SystemRecordView | import('./settings/types.ts').SystemRecordInvalidView> {
  const q = limit === undefined ? '' : '?limit=' + String(limit)
  return get(BASE + '/settings/system' + q)
}

/**
 * 弹**宿主操作系统**的选择窗口取一个文件路径（REQ-261004103330-005f）。
 *
 * 为什么不是浏览器自己开：网页拿不到真实绝对路径（安全边界），真正的选择发生在 Node 侧。
 * 三态：`{ok:true,path}` 选中 / `{ok:false,cancelled:true}` **人取消（不是错误）** /
 * 501 `path_picker_unavailable` 这台机器弹不出窗口（调用方给"可手动输入路径"的人话）。
 */
export function pickStoragePath(): Promise<{ ok: boolean; path?: string; cancelled?: boolean }> {
  return post(BASE + '/settings/storage/pick-path', {})
}

// -- 查询 -----------------------------------------------------------------

/**
 * 看板首屏状态。
 *
 * REQ-261003215944-9e04 FR-11：带上**当前会话 id**——服务端据此把读根解析成该会话的工作区，
 * 否则（不带）服务端只知道插件宿主的工作目录，除需求目录外的文档一律被判不存在。
 *
 * REQ-261007223647-da5d t10（FR-5）：`pending_confirms` **宽松解析**——旧服务端没有这个键
 * （新前端 + 旧服务端不白屏），缺键/非数组一律按 `[]`（= 没有票等在门口）；有票则逐条
 * 只保留形状正确的（服务端是唯一生产者，但坏数据不该让整块看板崩）。
 */
export const fetchState = async (sessionId?: string): Promise<BoardState> => {
  const state = await get<BoardState>(BASE + '/' + (sessionId !== undefined && sessionId.length > 0
    ? '?session=' + encodeURIComponent(sessionId)
    : ''))
  return { ...state, pending_confirms: parsePendingConfirms(state.pending_confirms) }
}

/** pending_confirms 的宽松解析（导出供用例直测；口径单点，t10）。 */
export function parsePendingConfirms(raw: unknown): BoardPendingConfirm[] {
  if (!Array.isArray(raw)) return []
  const out: BoardPendingConfirm[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    if (typeof t.ticket !== 'string' || t.ticket.length === 0) continue
    if (typeof t.requirement_id !== 'string' || t.requirement_id.length === 0) continue
    if (t.target !== 'artifact' && t.target !== 'plan') continue
    if (typeof t.created_at !== 'number') continue
    out.push(item as BoardPendingConfirm)
  }
  return out
}

/**
 * 重投挂起确认（REQ-261007223647-da5d t4 的服务端端点 · FR-1）。
 *
 * **如实语义**：这只是"问一句这张票还在不在等"——`still-open` = 票还有效（并给出两条真能走的路）；
 * `gone` = 已失效；`unavailable` = 读口未装配。绝不伪造成"已重新弹框"。
 */
export function repostConfirm(input: { id: string; ticket: string }): Promise<{ action: string; ticket?: string; hint?: string }> {
  return post(BASE + '/confirm/repost', input)
}

/**
 * 详情按需（B12 阶段⑥-① / REQ-261002161439-277d t-05a56b）。
 *
 * 首屏只拿摘要（计数），全文（comments/artifacts/verification/plan/archive）由本函数在**进入详情时**取，
 * 未命中服务端回 404 `REQBOARD_NOT_FOUND`（客户端据此显示「未找到」而不是空面板）。
 */
export const fetchRequirement = (id: string): Promise<{ revision: number; requirement: RequirementRecord }> =>
  get<{ revision: number; requirement: RequirementRecord }>(BASE + '/requirements/' + encodeURIComponent(id))

/**
 * 自动链控制面（REQ-4842fe FR-12 / t-3be71b）：人从看板暂停/继续。
 * 继续 = 服务端置 autoRun=true **并立即触发一次推进事件**（推进器未装配时服务端如实说明）。
 */
export const setAutoRun = (id: string, on: boolean, reason?: string): Promise<BoardState['requirements'][number]> =>
  post(BASE + '/req/autorun', { id, on, ...(reason !== undefined ? { reason } : {}) })

/**
 * 注入留痕只读回查（REQ-422af1 t11）：看板「本次注入了什么」的数据源。
 * windowKey 缺省（人工建卡无来源窗口）→ 不带 window 参数，由服务端返回全量最近 k 条。
 */
export function fetchInjectionInfo(windowKey: string | undefined, k = 20): Promise<InjectionInfoResponse> {
  const qs = new URLSearchParams({ k: String(k) })
  if (windowKey !== undefined && windowKey.length > 0) qs.set('window', windowKey)
  return get<InjectionInfoResponse>(BASE + '/injection-log?' + qs.toString())
}

/** 隔离留痕只读回查（REQ-260923134706-e72f t2/t6）：会话流程面板「执行流程→上下文管理」数据源。 */
export interface IsolationLogResponse {
  entries: IsolationLogEntry[]
  total: number
  available: boolean
  window: string | null
}

/** 窗口隔离留痕（node-isolation-log）：端口缺省/文件损坏 → available=false（空态不红）。 */
export function fetchIsolationLog(windowKey: string | undefined, k = 20): Promise<IsolationLogResponse> {
  const qs = new URLSearchParams({ k: String(k) })
  if (windowKey !== undefined && windowKey.length > 0) qs.set('window', windowKey)
  return get<IsolationLogResponse>(BASE + '/isolation-log?' + qs.toString())
}

// -- 需求操作 -------------------------------------------------------------

export function createReq(input: { title: string; description?: string }): Promise<unknown> {
  return post(BASE + '/req/create', input)
}

export function moveReq(input: { id: string; to: string; actor?: string; reason?: string }): Promise<unknown> {
  return post(BASE + '/req/move', input)
}

export function updateReq(input: { id: string; title?: string; description?: string; blocked?: boolean; blockedReason?: string; paused?: boolean }): Promise<unknown> {
  return post(BASE + '/req/update', input)
}

// -- 拆分计划（plan mode，仅人可裁决）--------------------------------------

export function approvePlan(input: { id: string }): Promise<unknown> {
  return post(BASE + '/req/plan/approve', input)
}

export function rejectPlan(input: { id: string; reason: string }): Promise<unknown> {
  return post(BASE + '/req/plan/reject', input)
}

// -- 误物化清场（仅人；REQ-261005122915-9f90 t6 / FR-5）--------------------

/** 清场回执（与服务端 `RollbackCleanupResult` 同形，逐字对齐）。 */
export interface RollbackCleanupResult {
  id: string
  rollbackSeq: number
  /** 本次真正取消的卡数（幂等重放时为 0）。 */
  canceled: number
  /** 父子关系还原条数。 */
  restoredLinks: number
  /** 匹配方式：`lastMaterialized`（精确）或 `reworkOf+title-prefix`（旧数据兜底）。 */
  matchedBy: string
  /** 被跳过的卡与原因（done 卡等；**不许静默跳过**，看板逐条展示）。 */
  skipped: { taskId: string; reason: string }[]
  /** 匹配方式的人话说明。 */
  note: string
}

/**
 * 误物化重做卡批量清场（REQ-261005122915-9f90 t6 / FR-5）。
 *
 * **仅人**：服务端刻意**不注册任何 agent 工具**——能力只开在看板 HTTP 通道
 * （身份在服务端无法辨别，故「仅人」落地为「agent 面无此工具」，见 REQ-261004121649-bfa7 设计）。
 * 边界 = 该次回退物化的卡清单（台账 `rollback.lastMaterialized`）；旧数据无该字段时走兜底匹配，
 * 回执里的 `matchedBy` 会如实声明用的是哪条。
 */
export function rollbackCleanup(input: { id: string; rollbackSeq: number; reason?: string }): Promise<RollbackCleanupResult> {
  return post<RollbackCleanupResult>(BASE + '/req/rollback-cleanup', input)
}

// -- 验收 / 归档（仅人可裁决）----------------------------------------------

/**
 * 验收通过（人工门）。
 * REQ-a8d582 FR-4：有不合格项或尚无验收材料时，后端要求带 `confirm_override`（覆盖说明）；
 * 全过且材料齐全时**不要**传——那不是覆盖，传了会在台账留多余痕迹。
 */
export function verifyPass(input: { id: string; confirm_override?: string }): Promise<unknown> {
  return post(BASE + '/req/verify/pass', input)
}

export function verifyRework(input: { id: string; note: string }): Promise<unknown> {
  return post(BASE + '/req/verify/rework', input)
}

/**
 * 验收单逐项裁决（REQ-2e9473 t14/W6）：逐项 passed/failed + 意见。
 *
 * `changeReason`（REQ-261006201920-2adc FR-3 / D-3）：人**覆盖** agent 实测原文时的变更理由，
 * 缺失会被服务端拒绝（`result_change_reason_required`）。这里必须显式声明——不声明时
 * 传变量能绕过 TS 的多余属性检查、字段没有契约，将来谁把它"顺手删掉"也不会有人发现。
 */
export function submitVerdicts(input: {
  id: string
  version: number
  verdicts: { itemId: string; status: 'passed' | 'failed'; opinion?: string; changeReason?: string }[]
}): Promise<unknown> {
  return post(BASE + '/req/verdicts', input)
}

// REQ-261002105242-a3fb FR-4：客户端归档请求封装已删除——归档由验收通过自动完成（REQ-9f4a44），
// 服务端对应端点（POST /req/archive）早已移除；留着这层封装只会支撑出一个"点了必失败"的按钮。

// -- 节点详情（REQ-31e11f：会话框进度条/看板同源的消费端）-------------------

export function fetchStageDetail(reqId: string, stage: string): Promise<StageDetail> {
  return get<StageDetail>(BASE + '/requirements/' + encodeURIComponent(reqId) + '/stage/' + encodeURIComponent(stage))
}

/** 全流程一览（REQ-31e11f 重设计）：一次取全部节点详情，监控时间线一次渲染。 */
export function fetchStageOverview(reqId: string): Promise<StageOverview> {
  return get<StageOverview>(BASE + '/requirements/' + encodeURIComponent(reqId) + '/stages')
}

/**
 * 单需求 token 去向（REQ-a33899 t6）：详情页「🪙 Token」tab 的数据源。
 * REQ-261004222448-292a 起服务端在**同一响应**里并进扩展段（按阶段口径 + 优化点）——
 * 完整载荷见 {@link TokenPanelPayload}。
 */
export function fetchRequirementToken(reqId: string): Promise<RequirementTokenView> {
  return get<RequirementTokenView>(BASE + '/requirements/' + encodeURIComponent(reqId) + '/token')
}

/* ──────────────────────────────────────────────────────────────────────────
 * 需求详情页「工作汇报」各 Tab 的取数（REQ-261004222448-292a t-ab048e；
 * 「验收」端点由 REQ-261006130057-7a43 FR-8 并入）
 *
 * 只读请求全走既有 `unwrap` 信封（非 2xx 时把服务端原话带上来，见 errorOf）。
 * **降级不抛错**：端口未装配 / 台账读不到时服务端回 `{available:false, reason, note}`
 * （FR-12），页面按 reason 给不同文案——抛错会把"读不到"与"不存在"混成同一句"加载失败"，
 * 那正是本需求要消灭的不诚实。
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 面板端点的名字 = **Tab 键**（`ReportTabKey` 由注册表推导，见 IF-4）。
 *
 * 首屏摘要端点 `report` 是唯一例外：它不对应任何 Tab（head/band/actions 那一段）。
 * 这就是「同源推导」——端点名不再手写第二份清单，加一个 Tab 时取数端点自动跟上；
 * **只收敛类型，不改形状**（URL / 参数 / 响应形状一字不动，FR-6）。
 */
type PanelEndpoint = ReportTabKey

/**
 * 面板端点的 URL（各 Tab 一个形状，避免多处各拼一遍路径）。
 *
 * `sessionId` **必须带上**：服务端据它把「文档根」解析成该会话的工作区根
 * （宿主进程 cwd 是插件宿主目录，不带会话时登记文档会被判成 file-missing——
 * 上线冒烟实测踩过：317 份文档全被判缺失，页面在撒谎）。既有文档类端点同一口径。
 */
function panelUrl(
  id: string,
  endpoint: 'report' | PanelEndpoint,
  sessionId?: string,
): string {
  const base = BASE + '/requirements/' + encodeURIComponent(id) + '/' + endpoint
  return sessionId !== undefined && sessionId.length > 0
    ? base + '?session=' + encodeURIComponent(sessionId)
    : base
}

/** 把分页参数接在当前 URL 之后（已有 `?` 就用 `&`；没参数原样返回）。 */
function appendPageQuery(url: string, params?: { before?: number; limit?: number }): string {
  if (params === undefined) return url
  const q = new URLSearchParams()
  if (params.before !== undefined) q.set('before', String(params.before))
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  const s = q.toString()
  return s.length === 0 ? url : url + (url.includes('?') ? '&' : '?') + s
}

/**
 * 首屏唯一摘要请求：结论头 + 操作条 + 状态带（FR-3 / FR-4 / FR-5）。
 * 进详情页时发（不切 Tab）；响应**不含正文**（正文一律点开才取）。
 */
export const fetchReport = (id: string, sessionId?: string): Promise<PanelResult<ReportResponse>> =>
  get<PanelResult<ReportResponse>>(panelUrl(id, 'report', sessionId))

/** 汇报七条（FR-1 / FR-2 / FR-14 / FR-15）：切到「汇报」Tab 才请求（默认 Tab，紧随首屏）。 */
export const fetchReportTrunk = (id: string, sessionId?: string): Promise<PanelResult<TrunkResponse>> =>
  get<PanelResult<TrunkResponse>>(panelUrl(id, 'trunk', sessionId))

/** 确定文档 + 核验 + 门禁裁决留痕（FR-7）。清单**全部铺开**，前端不截断不折叠（FR-11 #7）。 */
export const fetchReportDocs = (id: string, sessionId?: string): Promise<PanelResult<DocsResponse>> =>
  get<PanelResult<DocsResponse>>(panelUrl(id, 'docs', sessionId))

/** 工作步骤 DAG + 每步执行结果（FR-8）：节点详情默认不在首屏请求里。 */
export const fetchReportDag = (id: string, sessionId?: string): Promise<PanelResult<DagResponse>> =>
  get<PanelResult<DagResponse>>(panelUrl(id, 'dag', sessionId))

/**
 * 对话一条流（FR-6）：默认最近 20 条，`before` 取更早。
 * 过滤在**服务端**做（工具调用 / 推理 / 过程叙述不进响应）——前端拿不到就不会渲染错。
 */
export const fetchReportDialogue = (
  id: string,
  params?: { before?: number; limit?: number },
  sessionId?: string,
): Promise<PanelResult<DialogueResponse>> =>
  get<PanelResult<DialogueResponse>>(appendPageQuery(panelUrl(id, 'dialogue', sessionId), params))

/** agent 怎么跑的（FR-9）：提示词组段与被裁 + 注入来源与后果 + 上下文。正文点开才取。 */
export const fetchReportPrompts = (id: string, sessionId?: string): Promise<PanelResult<PromptsResponse>> =>
  get<PanelResult<PromptsResponse>>(panelUrl(id, 'prompts', sessionId))

/**
 * 验收面板（REQ-261006130057-7a43 · FR-8）：验收单 + RTM 验收追踪 + 覆盖链 + 材料 + 待裁决计数。
 * 切到「验收」Tab 才请求（壳的懒加载纪律）；响应 shape = `VerifyPanelResponse`（全字段可选，
 * 缺省即「无该来源」——前端**不补默认值**，补了就是拿「未知」冒充「没有」）。
 *
 * **旧服务端 = 降级，不是失败**：服务端还没有这条端点时 `get` 抛 404——按降级信封返回
 * （`port-unavailable` + 固定去向文案），页面走 degraded 态而不是"加载失败 + 重试"：
 * 端点不存在这件事重试一百次也不会好，给重试就是给假象。其余错误（500 / 超时）照样抛，
 * 那是"接线了但这次没成"，壳的失败态与重试出口照旧。
 */
export async function fetchReportVerify(id: string, sessionId?: string): Promise<PanelResult<VerifyPanelResponse>> {
  try {
    return await get<PanelResult<VerifyPanelResponse>>(panelUrl(id, 'verify', sessionId))
  } catch (err) {
    const status = (err as { status?: unknown } | undefined)?.status
    if (typeof status === 'number' && status === 404) {
      return {
        available: false,
        reason: 'port-unavailable',
        note: '服务端版本过旧，验收单暂在『文档』Tab 核验节查看',
      }
    }
    throw err
  }
}

/**
 * Token 端点的完整载荷（FR-10）：既有字段（totals/byStage/degraded…）**一个不改**，
 * 扩展段（availability / optimizations / missingStages）由服务端并进同一响应。
 *
 * 为什么把扩展字段声明为必需：三态（full/partial/none）是页面"能不能显示数字"的唯一判据，
 * 缺了它前端只能猜——猜就是编。服务端在扩展查询未装配时也会显式回 `availability:'none'`。
 */
export interface TokenPanelPayload {
  requirementId: string
  totals: RequirementTokenView['totals']
  byStage: RequirementTokenView['byStage']
  degraded: boolean
  costEstimateCny?: number
  systemPrompt?: RequirementTokenView['systemPrompt']
  injections?: RequirementTokenView['injections']
  availability: TokenAvailability
  optimizations: TokenOptimization[]
  missingStages?: string[]
  boundsAreLowerBound?: boolean
  /** 扩展段未装配时服务端给的人话（页面照实显示，不自己编） */
  unavailableNote?: string
  /**
   * 降级信封的判别位：**缺省即真**（token 的"不可得"写在 `availability` 三态里，不走信封）。
   * 声明在这里有两个作用：① 形状上它就是 `PanelResult`（`fetchReportPanel` 无需任何强制转换）；
   * ② 万一服务端真回了 `available:false`，`isDegrade` 会照样按降级处理——不假装收到了数据。
   */
  available?: true
}

/**
 * 取 Token 面板载荷（与既有 `/token` 端点**同一响应**，故复用既有取数函数）。
 *
 * 这里只做**声明收窄**：运行时字段由服务端并进来，缺字段时**不补默认值**——
 * 补一个 `availability:'full'` 就是拿"未知"冒充"齐全"（FR-12 的反例）。
 */
export async function fetchReportToken(id: string): Promise<TokenPanelPayload> {
  const base = await fetchRequirementToken(id)
  return base as TokenPanelPayload
}

/**
 * 各 Tab 取数的**总入口**（Tab 键 → 端点）。
 *
 * 为什么集中一个分发函数：面板卡（t9~t14）应当只写 `render` 就能接上取数。
 * 让各张卡各拼一遍 URL 的话，拼错的路径会以"这个 Tab 一直没有数据"的形式**静默**存在
 * （不报错、也没有哪条用例测得到）。
 */
export function fetchReportPanel(
  id: string,
  key: ReportTabKey,
  params?: { before?: number; limit?: number },
  sessionId?: string,
): Promise<PanelResult<unknown>> {
  switch (key) {
    case 'trunk': return fetchReportTrunk(id, sessionId)
    case 'docs': return fetchReportDocs(id, sessionId)
    case 'dag': return fetchReportDag(id, sessionId)
    case 'dialogue': return fetchReportDialogue(id, params, sessionId)
    case 'verify': return fetchReportVerify(id, sessionId)
    case 'prompts': return fetchReportPrompts(id, sessionId)
    case 'token':
      // token 的"不可得"写在载荷里的 availability 三态（不走 Degrade 信封）——形状上同样满足
      // PanelResult<unknown>（`available` 缺省即真），这里不补也不改任何字段。
      return fetchReportToken(id)
  }
}

/**
 * 需求侧逐条接收状态（REQ-d3e61a T-5）：详情页「🏷 条款接收状态」块的数据源。
 * 判据（条款 + 任务↔条款绑定）都在文档里，client 拿不到，故由服务端装配。
 */
export function fetchRequirementMarks(reqId: string): Promise<RequirementMarksView> {
  return get<RequirementMarksView>(BASE + '/requirements/' + encodeURIComponent(reqId) + '/marks')
}

/** 读取产物/文档全文（工作区相对路径），供节点详情超链接点击展开。 */
export async function fetchReqFile(path: string): Promise<string> {
  const res = await fetch(BASE + '/file?path=' + encodeURIComponent(path), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  // 同 unwrap 口径（FR-4）：非 2xx 也要把服务端的原因带上来，不能只报状态码
  if (!res.ok) throw await errorOf(res)
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { content?: string }; error?: string }
  if (json.success !== true) throw new ApiError(json.error ?? '读取文档失败')
  return json.data?.content ?? ''
}

/**
 * 文档可打开性批量解析（REQ-b63a7d t4）——「文档记录」区不再逐条打 /file 预检。
 * 旧实现每条路径一发 GET：不在 docs/ 内就被白名单判 403，控制台持续刷红（实测 142 条）。
 * 本端点由 host 单点判定（归一层 + fs），恒 200，且把不可打开的原因一并带回。
 */
export interface DocPathVerdictView {
  /** 原始路径（与请求一一对应，前端据此定位元素） */
  path: string
  normalized: string
  form: 'workspace' | 'outside' | 'pseudo'
  exists: boolean
  openable: boolean
  reason?: string
}

/**
 * 批量预检文档可打开性。
 *
 * FR-11：判定必须与"打开"同一个根——故这里也带会话 id（服务端按同一处 resolveDocRoot 判定），
 * 杜绝"预检说能开、点开却打不开"。
 */
export function resolveReqDocs(paths: string[], sessionId?: string): Promise<{ results: DocPathVerdictView[] }> {
  return post<{ results: DocPathVerdictView[] }>(BASE + '/docs/resolve', {
    paths,
    ...(sessionId !== undefined && sessionId.length > 0 ? { sessionId } : {}),
  })
}

/** 产物人工确认（五道人工确认门）：人在看板一键确认某 kind 的产物。 */
export function confirmArtifact(input: { id: string; kind: string }): Promise<unknown> {
  return post(BASE + '/req/artifact/confirm', input)
}

// -- 任务操作 -------------------------------------------------------------

export function createTask(input: Record<string, unknown>): Promise<unknown> {
  return post(BASE + '/task/create', input)
}

export function moveTask(input: { id: string; to: string; actor?: string; reason?: string; sessionId?: string }): Promise<unknown> {
  return post(BASE + '/task/move', input)
}

export function updateTask(input: Record<string, unknown>): Promise<unknown> {
  return post(BASE + '/task/update', input)
}

// -- 评论 -----------------------------------------------------------------

export function addComment(input: { target: 'req' | 'task'; id: string; body: string; actor?: string }): Promise<unknown> {
  return post(BASE + '/comment', input)
}

// -- SSE ------------------------------------------------------------------

/**
 * 订阅台账变更（revision + kind）。SSE 断开由调用方决定重连策略；
 * 返回退订函数。EventSource 自带重连，这里只包一层生命周期管理。
 *
 * REQ-261001124111-5d36 t3：新增可选的 `onBuild`——消费**命名帧** `event: build`
 * （宿主在连接建立后补发，携带插件构建戳与面板刷新策略）。
 * 为什么必须单独注册：SSE 规范规定命名事件**不触发 onmessage**，用 `es.onmessage`
 * 永远收不到它（仓库里已有同类事故注释：只看 onmessage 会让推送静默失灵）。
 */
export function subscribeEvents(
  onChange: (revision: number, kind: string) => void,
  onBuild?: (payload: unknown) => void,
): () => void {
  const es = new EventSource(BASE + '/events')
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data as string) as { revision: number; kind: string }
      onChange(data.revision, data.kind)
    } catch { /* 忽略坏帧 */ }
  }
  if (onBuild !== undefined) {
    es.addEventListener('build', (ev) => {
      try {
        onBuild(JSON.parse((ev as MessageEvent).data as string))
      } catch { /* 忽略坏帧：缺这一帧最多是"没提示"，不能影响面板本身 */ }
    })
  }
  return () => es.close()
}