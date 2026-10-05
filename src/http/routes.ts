/**
 * Reqboard 路由薄层（REQ-47939a t7）：/dashboard/api/reqboard 前缀分发。
 * 信封：200 {success:true,data} / 4xx|500 {success:false,error,code?}。
 * SSE：GET /events 推送台账变更（revision + kind）。
 *
 * 本文件 = 组合根（构造 RouterCtx → 实例化 6 个资源路由 → 分发）+ **错误 → HTTP 状态码的
 * 唯一映射点**（fail）。资源处理器在 http/routers/*.ts，只做协议转换。
 *
 * 闸门在此强制执行：move 的 actor 经 protocol/domain 断言，人工闸门拒绝 agent/system。
 *
 * @module dsh-pmboard/http/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TaskStore } from '../application/ports.js'
import { newCommentId, newRequirementId, newTaskId } from '../shared/protocol.js'

/**
 * 路由层需要的台账能力（**t8 切换点**）：沿用桥导出的 `LegacyLedgerSurface`
 * （旧端口 + `getRequirement` / `subscribe` 这两个端口外方法）。
 * 收敛到**同一处定义**，避免 routes 与 routers 各写一份结构类型而漂移。
 */
import type { InjectionLogReadPort } from '../application/internal/injection-log.js'
import type { IsolationLogReadPort } from '../application/internal/isolation-trace.js'
import type { RouterCtx } from './routers/shared.js'
import { createRequirementsRouter } from './routers/requirements.js'
import { createTasksRouter } from './routers/tasks.js'
import { createStagesRouter } from './routers/stages.js'
import { createVerdictsRouter } from './routers/verdicts.js'
import { createArtifactsRouter } from './routers/artifacts.js'
import { createInjectionRouter } from './routers/injection.js'
import { createIsolationRouter } from './routers/isolation.js'
import { createKnowledgeRouter } from './routers/knowledge.js'
import { createSettingsRouter } from './routers/settings.js'
import { createPanelsRouter } from './routers/panels.js'

export interface ReqboardRouteDeps {
  /**
   * 新需求存储端口（B12 阶段④-2）——**必填**：路由侧新代码一律走它。
   *
   * 为什么不从 `applicationDeps.store` 可选透传：可选会把"装配漏了"从编译期挪到运行期
   * （本项目的老教训），故此处编译期必填——组合根（src/index.ts）已持有分片 store，直接传即可。
   */
  requirementStore: import('../application/ports.js').RequirementStore
  /**
   * 任务存储（队列）端口（REQ-260927202051-f6df I-1）——**必填**。
   *
   * 与 `LedgerView` 刻意不留 `tasks` 字段同一道理：可选字段 + 运行期兜底会把"装配漏了"
   * 从编译期挪到运行期（还得恰好走到那个分支才发现）。schema v9 后任务不在台账，
   * 缺它则看板任务页/甘特全空 —— 故这里用编译期必填，漏装配直接编译不过。
   */
  taskStore: TaskStore
  now: () => number
  /** 注入留痕**只读**端口（REQ-422af1 t11）：看板「本次注入了什么」的数据源；缺省则接口返回空清单。 */
  injectionLog?: InjectionLogReadPort
  /** 节点隔离留痕只读端口（REQ-260923134706-e72f t2）：看板「执行流程→上下文管理」数据源；缺省则接口返回空清单。 */
  isolationLog?: IsolationLogReadPort
  /** 系统提示词装配服务提供者（REQ-a33899 t5）：读时折算固定系统提示词成本；缺省 → unavailable。 */
  systemPrompt?: () => unknown
  /** Token 快照提供者（REQ-b545fe t6）：HTTP 任务操作（body.sessionId）可结算快照；缺省 → 无快照。 */
  tokenSnapshot?: (windowKey: string) => import('../shared/protocol.js').TokenSnapshot | undefined
  /** 可注入 id 生成器（测试用） */
  ids?: {
    requirement?: () => string
    task?: () => string
    comment?: () => string
  }
  /** 工作区根（REQ-2e9473 t11 产物自动发现扫描 docs/requirements/ 用；缺省 process.cwd()）。 */
  cwd?: string
  /**
   * 会话工作区解析器（REQ-261003215944-9e04 FR-11）：会话 id → 该会话的 header.cwd。
   * 缺省 → 读根回落 legacy cwd，响应里如实标注 docsRootSource。
   */
  sessionWorkspace?: (sessionId: string | undefined) => string | undefined
  /**
   * 知识层自举通知口（REQ-261004174324-4195 t4）：读根按会话解析成功时通知一次（即发即忘）。
   * 缺省 → 不自举（老行为）。
   */
  knowledgeBootstrap?: { ensure(root?: string): void }
  /** 文档仓储（REQ-308b9a AC-7.7：看板裁决后回填 verification.md）。 */
  docs?: import('../application/ports.js').DocRepository
  /** 闸门后置链（REQ-e3b6a0 t9 / FR-9）：看板一键确认后触发 Phase B。缺省 → 只落章。 */
  gateChain?: import('../application/gate/GatePostChain.js').GateChainPort
  /** 在线 agent 查询（取会话句柄供 H2 用）；缺省 → 视为窗口不在线。 */
  agents?: () => { get?: (id: string) => unknown } | undefined
  /**
   * 推进器（REQ-4842fe FR-12 / t-3be71b）：看板控制面「继续」= 置 autoRun=true **并触发一次推进事件**。
   * 缺省 → 只置开关并在响应里如实说明（不伪造"已续跑"）。
   */
  advance?: (requirementId: string) => Promise<{ steps: number; stopped: string }>
  /** 应用层用例依赖（2026-09-26）：看板「拆分」入口直接调用 executeDecompose。 */
  applicationDeps?: import('../application/ports.js').UseCaseDeps
  /**
   * 需求面板刷新策略（REQ-261001124111-5d36 t4）：随 SSE 的 `build` 帧下发（缺省 → 帧里不带）。
   */
  panelPolicy?: { refreshMs: number; staleAfterMs: number }
  /**
   * 运行设置 / 系统记录 / 宿主级动作票据（REQ-261004103330-005f t8 消费、t5 装配期注入）。
   *
   * 三个都**可选**只为不打断既有大量测试的构造点；但设置路由对缺失是**响亮 500**
   * （组合根 bug，绝不伪造空设置、也绝不伪造"已确认"），语义见 `routers/settings.ts` 头注。
   */
  settings?: import('../application/ports.js').SettingsStore
  systemRecord?: import('../application/ports.js').SystemRecordStore
  storageActions?: import('./routers/shared.js').StorageActionPort
  /** 文件路径选择端口（「选择…」）：缺省 = 该部署弹不出系统选择窗口。 */
  pickStoragePath?: import('../application/ports.js').StoragePathPickerPort
  /** 插件版本信息（FR-15）：组合根从 `package.json` 读；缺省 → 响应如实写 `unknown`。 */
  pluginInfo?: { name: string; version: string }
  /** `dshHome` 绝对路径：派生设置/记录文件路径（GET 的 paths、错误消息里的可复制路径）。 */
  dshHome?: string
  /**
   * 会话探针（REQ-261004222448-292a t-497311）：`prompts` / `dialogue` 两个端点要读会话事件。
   * 缺省 → dialogue 端点 `port-unavailable`（**不返回空数组冒充「没有对话」**）。
   */
  sessionProbe?: import('../application/ports.js').SessionProbe
  /**
   * 详情页六查询（REQ-261004222448-292a t-497311）。
   *
   * 为什么从组合根注入而不是让路由直接 import 实现：`Partial` 让「某条查询还没落地」成为
   * **可表达的降级**（`port-unavailable`），而不是编译不过或运行期 500；路由用例也因此
   * 只注入桩、不必拖上真实台账/会话/文档端口。
   */
  panelQueries?: Partial<import('../application/query/contracts.js').PanelQueries>
  /**
   * 挂起确认只读口（REQ-261004222448-292a t-497311）：报告首屏的「几件事等人」读它。
   * 缺省 → 该条缺口显示「挂起确认状态不可知」（不写 0 条冒充「没有人在等」）。
   */
  pendingConfirms?: import('../application/query/contracts.js').PendingConfirmReadPort
}

// REQ-261003191948-e94a t2：信封与错误映射的**唯一实现**搬到 ./envelope.js——
// 让"未就绪 handler"（src/http/not-ready.ts）与正常路由共用同一份响应形状，不各写一套。
import { fail, json, ok } from './envelope.js'

/** 入参/流程不满足 → 400（消息即指引）。 */
function badInput(message: string): never {
  throw Object.assign(new Error(message), { code: 'invalid_input' })
}

function notFound(what: string): never {
  throw Object.assign(new Error(`${what}不存在`), { code: 'not_found' })
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not object')
    return parsed as Record<string, unknown>
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { code: 'invalid_input' })
  }
}

export function createReqboardHandler(deps: ReqboardRouteDeps) {
  const { now } = deps
  // 必填（编译期保证，见 ReqboardRouteDeps.taskStore 注释）：schema v9 后任务不再存台账。
  const taskStore = deps.taskStore
  const ids = {
    requirement: deps.ids?.requirement ?? (() => newRequirementId()),
    task: deps.ids?.task ?? (() => newTaskId()),
    comment: deps.ids?.comment ?? (() => newCommentId()),
  }

  /**
   * 生成不与现有记录冲突的 id。
   * 需求 id 查台账；**任务 id 查队列**（REQ-260927202051-f6df：task 已不在台账 tasks 里）。
   */
  async function mintId(kind: 'requirement' | 'task'): Promise<string> {
    if (kind === 'requirement') {
      // B12 阶段④-2-③：id 去重改走新端口。按设计纪律（interfaces.md 调用纪律 1）
      // **按 id 用 getSummary**，不要 listSummaries 之后从中找一条（那是把整册读法换个名字）。
      for (let i = 0; i < 20; i++) {
        const id = ids.requirement()
        if ((await deps.requirementStore.getSummary(id)) === undefined) return id
      }
      throw new Error('id 生成冲突过多')
    }
    for (let i = 0; i < 20; i++) {
      const id = ids.task()
      if ((await taskStore.get(id)) === undefined) return id
    }
    throw new Error('id 生成冲突过多')
  }

  const ctx: RouterCtx = {
    taskStore,
    requirementStore: deps.requirementStore,
    now,
    deps: {
      ...(deps.cwd !== undefined ? { cwd: deps.cwd } : {}),
      ...(deps.injectionLog !== undefined ? { injectionLog: deps.injectionLog } : {}),
      ...(deps.isolationLog !== undefined ? { isolationLog: deps.isolationLog } : {}),
      ...(deps.systemPrompt !== undefined ? { systemPrompt: deps.systemPrompt } : {}),
      ...(deps.tokenSnapshot !== undefined ? { tokenSnapshot: deps.tokenSnapshot } : {}),
      ...(deps.docs !== undefined ? { docs: deps.docs } : {}),
      ...(deps.gateChain !== undefined ? { gateChain: deps.gateChain } : {}),
      ...(deps.agents !== undefined ? { agents: deps.agents } : {}),
      // REQ-261003215944-9e04 FR-11：会话工作区解析器**必须显式转发**——本映射是白名单，
      // 漏一行就等于"组合根传了、路由收不到"。测试里"需求目录外的文档仍判不存在"那条就是它的照妖镜。
      ...(deps.sessionWorkspace !== undefined ? { sessionWorkspace: deps.sessionWorkspace } : {}),
      // REQ-261004222448-292a t-497311：对话流要读会话事件（白名单照旧：漏一行 = 组合根传了、路由收不到）
      ...(deps.sessionProbe !== undefined ? { sessionProbe: deps.sessionProbe } : {}),
      // REQ-261004222448-292a t-497311：「几件事等人」读挂起确认（白名单照旧）
      ...(deps.pendingConfirms !== undefined ? { pendingConfirms: deps.pendingConfirms } : {}),
      ...(deps.advance !== undefined ? { advance: deps.advance } : {}),
      ...(deps.applicationDeps !== undefined ? { applicationDeps: deps.applicationDeps } : {}),
      // REQ-261001124111-5d36 t4：面板刷新策略进 SSE 的 build 帧（缺省 → 不下发，客户端用缺省值）
      ...(deps.panelPolicy !== undefined ? { panelPolicy: deps.panelPolicy } : {}),
      // REQ-261004103330-005f t8：设置类路由的五个依赖（本映射是白名单，漏一行 = "组合根传了、路由收不到"）
      ...(deps.settings !== undefined ? { settings: deps.settings } : {}),
      ...(deps.systemRecord !== undefined ? { systemRecord: deps.systemRecord } : {}),
      ...(deps.storageActions !== undefined ? { storageActions: deps.storageActions } : {}),
      // REQ-261004103330-005f：「选择…」的文件路径选择端口（白名单照旧：漏一行 = 组合根传了、路由收不到）
      ...(deps.pickStoragePath !== undefined ? { pickStoragePath: deps.pickStoragePath } : {}),
      ...(deps.pluginInfo !== undefined ? { pluginInfo: deps.pluginInfo } : {}),
      ...(deps.dshHome !== undefined ? { dshHome: deps.dshHome } : {}),
    },
    ids,
    mintId,
    json,
    ok,
    fail,
    badInput,
    notFound,
    readBody,
  }
  const requirements = createRequirementsRouter(ctx)
  const tasks = createTasksRouter(ctx)
  const stages = createStagesRouter(ctx)
  const verdicts = createVerdictsRouter(ctx)
  const artifacts = createArtifactsRouter(ctx)
  const injection = createInjectionRouter(ctx)
  const knowledge = createKnowledgeRouter(ctx)
  const isolation = createIsolationRouter(ctx)
  const settings = createSettingsRouter(ctx)
  // 详情页六条只读端点（REQ-261004222448-292a t-497311）。构造顺序有讲究：panels 需要 ctx，
  // 而 token 端点的扩展段由 stages 在**请求时**回调——故此处把钩子写回 ctx.deps（stages 在
  // 每次请求读它，构造期赋值即生效），避免让 stages 反向依赖 panels 模块。
  const panels = createPanelsRouter(ctx, { queries: deps.panelQueries })
  ctx.deps.panelTokenExtension = panels.handleTokenExtension

  // -- 分发 ----------------------------------------------------------------

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const sub = url.pathname.replace(/^\/dashboard\/api\/reqboard\/?/, '')
      const method = req.method ?? 'GET'

      if (method === 'GET' && (sub === '' || sub === 'state')) return await stages.handleState(res, url)
      if (method === 'GET' && sub === 'events') return stages.handleEvents(req, res)
      if (method === 'GET' && sub === 'health') return ok(res, { status: 'ok' })
      // 注入留痕只读回查（REQ-422af1 t11）：看板「本次注入了什么」的唯一数据源
      if (method === 'GET' && sub === 'injection-log') return await injection.handleInjectionLog(res, url)
      // 节点隔离留痕只读回查（REQ-260923134706-e72f t2）：看板「执行流程→上下文管理」的唯一数据源
      if (method === 'GET' && sub === 'isolation-log') return await isolation.handleIsolationLog(res, url)
      if (method === 'GET' && sub === 'kb') return await knowledge.handleKb(res, url)
      if (method === 'GET' && sub === 'file') {
        const p = url.searchParams.get('path') ?? ''
        return await artifacts.handleFileRead(res, p, url.searchParams.get('session') ?? undefined)
      }
      if (method === 'GET' && sub === 'requirements/summary') return await stages.handleRequirementsSummary(res)
      // 详情页六条只读端点（REQ-261004222448-292a t-497311）：形状/分页校验与降级在 panels 里一处实现。
      // 必须排在「详情按需」的 `/^requirements\/[^/]+$/` 之前判定——那条约不上带额外段的路径，
      // 但顺序写清楚可以防将来有人把详情匹配放宽成前缀匹配。
      if (method === 'GET' && /^requirements\/[^/]+\/(report|trunk|docs|dag|dialogue|prompts)$/.test(sub)) {
        await panels.handlePanels(res, sub, url)
        return
      }
      // B12 阶段⑥-①：详情按需（放在 summary/token/marks/stages 之后，避免抢它们的匹配）
      if (method === 'GET' && /^requirements\/[^/]+$/.test(sub)) {
        return await stages.handleRequirementDetail(res, decodeURIComponent(sub.slice('requirements/'.length)))
      }
      if (method === 'POST' && sub === 'artifacts/scan') return await stages.handleArtifactScan(res)
      if (method === 'GET' && /^requirements\/[^/]+\/token$/.test(sub)) {
        const id = decodeURIComponent(sub.split('/')[1] ?? '')
        if (id.length === 0) {
          return json(res, 400, { success: false, error: '缺少 id 参数', code: 'invalid_input' })
        }
        return await stages.handleRequirementToken(res, id)
      }
      // REQ-d3e61a T-5：需求侧接收标记（看板详情页「未被接收（红）」的数据源）
      if (method === 'GET' && /^requirements\/[^/]+\/marks$/.test(sub)) {
        const id = decodeURIComponent(sub.split('/')[1] ?? '')
        if (id.length === 0) {
          return json(res, 400, { success: false, error: '缺少 id 参数', code: 'invalid_input' })
        }
        return await stages.handleRequirementMarks(res, id, url.searchParams.get('session') ?? undefined)
      }
      if (method === 'GET' && /^requirements\/[^/]+\/stages$/.test(sub)) {
        const id = decodeURIComponent(sub.split('/')[1] ?? '')
        if (id.length === 0) {
          return json(res, 400, { success: false, error: '缺少 id 参数', code: 'invalid_input' })
        }
        return await stages.handleStageOverview(res, id, url.searchParams.get('session') ?? undefined)
      }
      if (method === 'GET' && /^requirements\/[^/]+\/stage\/[^/]+$/.test(sub)) {
        const parts = sub.split('/')
        const id = decodeURIComponent(parts[1] ?? '')
        const stage = decodeURIComponent(parts[3] ?? '')
        if (id.length === 0 || stage.length === 0) {
          return json(res, 400, { success: false, error: '缺少 id 或 stage 参数', code: 'invalid_input' })
        }
        return await stages.handleStageDetail(res, id, stage, url.searchParams.get('session') ?? undefined)
      }
      if (method === 'GET' && sub.startsWith('session/') && sub.endsWith('/progress')) {
        const sid = decodeURIComponent(sub.slice('session/'.length, sub.length - '/progress'.length))
        if (sid.length === 0) return json(res, 400, { success: false, error: '缺少 sessionId', code: 'invalid_input' })
        return await stages.handleSessionProgress(res, sid)
      }

      if (method === 'POST' && sub === 'req/create') return await requirements.handleReqCreate(req, res)
      if (method === 'POST' && sub === 'req/move') return await requirements.handleReqMove(req, res)
      if (method === 'POST' && sub === 'req/update') return await requirements.handleReqUpdate(req, res)
      if (method === 'POST' && sub === 'req/verify/pass') return await verdicts.handleVerifyDecision(req, res, true)
      if (method === 'POST' && sub === 'req/verify/rework') return await verdicts.handleVerifyDecision(req, res, false)
      // 验收单逐项裁决（REQ-2e9473 t14/W6）
      if (method === 'POST' && sub === 'req/verdicts') return await verdicts.handleVerdicts(req, res)
      // （REQ-9f4a44）req/archive 已移除：归档自动化，无需人工触发
      if (method === 'POST' && sub === 'req/plan/approve') return await requirements.handlePlanDecision(req, res, true)
      if (method === 'POST' && sub === 'req/plan/reject') return await requirements.handlePlanDecision(req, res, false)
      // 自动链控制面（REQ-4842fe t-3be71b）：暂停/继续；继续即触发一次推进事件
      if (method === 'POST' && sub === 'req/autorun') return await requirements.handleAutoRun(req, res)
      // 看板「拆分」入口（2026-09-26 恢复）：批准计划后落库任务卡（自动拆分路径未装配时的恢复口）
      if (method === 'POST' && sub === 'req/decompose') return await requirements.handleReqDecompose(req, res)
      // REQ-261004183621-de3f FR-4：看板「补录归档清单」（只追加 + 留痕）
      if (method === 'POST' && sub === 'req/archive-amend') return await requirements.handleArchiveAmend(req, res)
      // 看板「改绑到本窗口」入口（REQ-261003222428-3556 FR-6 / N-2，仅人发起，留痕经 applyRebind）
      if (method === 'POST' && sub === 'req/rebind') return await requirements.handleReqRebind(req, res)
      // REQ-261004121649-bfa7 t3/t6 · FR-4：误物化批量清场（仅人——刻意不注册 agent 工具，与 rebind 同款）
      if (method === 'POST' && sub === 'req/rollback-cleanup') return await requirements.handleRollbackCleanup(req, res)
      if (method === 'POST' && sub === 'req/artifact/confirm') return await requirements.handleArtifactConfirm(req, res)
      if (method === 'POST' && sub === 'task/create') return await tasks.handleTaskCreate(req, res)
      if (method === 'POST' && sub === 'task/move') return await tasks.handleTaskMove(req, res)
      if (method === 'POST' && sub === 'task/update') return await tasks.handleTaskUpdate(req, res)
      if (method === 'POST' && sub === 'comment') return await requirements.handleComment(req, res)
      // 文档可打开性批量解析（REQ-b63a7d t4）：前端一次请求替代逐条预检
      if (method === 'POST' && sub === 'docs/resolve') return await artifacts.handleDocsResolve(req, res)

      // 运行设置（REQ-261004103330-005f FR-3/FR-4/FR-6/FR-11/FR-14）
      // `settings` 与 `settings/system` 都是精确匹配（===），顺序无歧义
      if (method === 'GET' && sub === 'settings') return await settings.handleGetSettings(res)
      if (method === 'PATCH' && sub === 'settings') return await settings.handlePatchSettings(req, res)
      if (method === 'GET' && sub === 'settings/system') return await settings.handleGetSystemRecord(res, url)
      if (method === 'POST' && sub === 'settings/storage/request') return await settings.handleStorageRequest(req, res)
      if (method === 'POST' && sub === 'settings/storage/switch') return await settings.handleStorageSwitch(req, res)
      if (method === 'POST' && sub === 'settings/storage/migrate') return await settings.handleStorageMigrate(req, res)
      if (method === 'POST' && sub === 'settings/storage/pick-path') return await settings.handleStoragePickPath(res)
      if (method === 'POST' && sub === 'settings/open-file') return await settings.handleOpenConfigFile(req, res)

      json(res, 404, { success: false, error: `未知路由：${method} ${url.pathname}`, code: 'not_found' })
    } catch (err) {
      fail(res, err)
    }
  }
}
