/**
 * HTTP 路由共享上下文与信封（REQ-47939a t7）——错误 → HTTP 状态码映射的**唯一一处**。
 *
 * 为什么抽出来：此前每个路由处理器各自 badInput/notFound，状态码语义分散；
 * 现在 fail() 是唯一映射点，routers/* 只调用它。
 *
 * @module dsh-pmboard/http/routers/shared
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { InjectionLogReadPort } from '../../application/internal/injection-log.js'
import type { IsolationLogReadPort } from '../../application/internal/isolation-trace.js'
import type { DocRepository, TaskStore } from '../../application/ports.js'

/**
 * 宿主级存储动作（与 `adapters/PendingConfirmRegistry` 的 `StorageAction` **同值**）。
 *
 * 为什么在这里再写一遍而不是 import 适配器的类型：t7 的约束（见 `notes/t7-upstream-notes.md`）
 * 明确"共享契约里没有 storage 票据类型"，且 http 层不该依赖适配器内部形状。
 * 这里是**结构约束**：真实实现（`PendingConfirmRegistry`）在组合根按结构满足它；
 * 若哪天形状漂移，装配处会编译不过——比"运行时才发现票据字段没了"早一步。
 */
export type StorageActionKind = 'switch-to-sqlite' | 'switch-to-json' | 'migrate'

/** 作答通道（三通道都算"人已作答"，但只有 board-confirm 是看板按钮）。 */
export type StorageActionChannel = 'board-confirm' | 'dialog-answer' | 'text-evidence'

/** 票据视图（路由只需要这几个字段）。 */
export interface StorageActionTicketView {
  ticket: string
  action: StorageActionKind
  requirementId: string
  createdAt: number
}

/** `consume` 的结构化结果（成功给落章信息；失败给原因，**不抛异常**）。 */
export type StorageActionConsumeResult =
  | {
    ok: true
    ticket: string
    action: StorageActionKind
    requirementId: string
    /**
     * 落章信息里的答案。**源头已保证 `ok:true` ⇒ `confirmed === true`**：
     * 否定作答在 `PendingConfirmRegistry.consume` 就返回 `denied`，不会再给出 `ok`。
     * 保留本字段供留痕与第二道校验（路由另有 `confirmed !== true → 403` 一层，防将来有人改坏源头语义）。
     */
    confirmed: boolean
    advanced: boolean
    by: { kind: 'human'; channel: StorageActionChannel; sessionId?: string; pluginVersion?: string; at: number }
  }
  | { ok: false; ticket: string; reason: 'unknown' | 'unsettled' | 'denied' | 'expired' | 'consumed' }

/** 落章入参：作答通道的标识（channel 白名单 + 窗口 + 版本，供审计）。 */
export interface StorageActionStampView {
  channel: StorageActionChannel
  sessionId?: string
  pluginVersion?: string
}

/** 宿主级动作确认票据端口（FR-11）：发起 → 作答通道落章 → 一次性消费。 */
export interface StorageActionPort {
  registerStorageAction(input: { windowKey: string; requirementId?: string; action?: StorageActionKind }): StorageActionTicketView
  /**
   * 作答通道落章（**只有作答通道能产生它**）：人点确认/取消、弹框作答、文字证据命中真实用户消息。
   * 落章与"人同意"是两件事：否定作答也会落章，故消费方必须自己判 `confirmed`（见 settings.ts 头注②）。
   */
  settleStorageAction(
    ticket: string,
    outcome: { confirmed: boolean; advanced: boolean; userChoice?: string; userFeedback?: string },
    stamp: StorageActionStampView,
  ): unknown
  consume(ticket: string): StorageActionConsumeResult
  getStorageAction(ticket: string): (StorageActionTicketView & { consumedAt?: number }) | undefined
}

export interface RouterCtx {
  /**
   * 任务存储（队列）端口（REQ-260927202051-f6df I-1）——路由读任务的**唯一**入口。
   *
   * **必填**（不是可选）：路由层没有"队列不可用"的降级语义——任务数据就是看板全部内容，
   * 缺装配 = 组合根 bug，必须响亮失败（在 createReqboardHandler 内显式断言，不静默返回半成品）。
   */
  taskStore: TaskStore
  /** 新需求端口（B12 阶段④-2：**必填**，路由侧新代码一律走它）。 */
  requirementStore: import('../../application/ports.js').RequirementStore
  now: () => number
  /**
   * 路由可选依赖：cwd=产物扫描根；injectionLog=注入留痕**只读**端口（看板信息块用）；
   * systemPrompt=系统提示词装配服务（REQ-a33899 t5，读时折算固定提示词成本；缺省 → unavailable）；
   * tokenSnapshot=Token快照提供者（REQ-b545fe t6，HTTP任务操作可结算快照）。
   */
  deps: {
    cwd?: string
    injectionLog?: InjectionLogReadPort
    /** 节点隔离留痕只读端口（REQ-260923134706-e72f t2：看板「执行流程→上下文管理」数据源；缺省 → available=false）。 */
    isolationLog?: IsolationLogReadPort
    systemPrompt?: () => unknown
    tokenSnapshot?: (windowKey: string) => import('../../shared/protocol.js').TokenSnapshot | undefined
    /** 文档仓储（REQ-308b9a AC-7.7：看板裁决后回填 verification.md；缺省 → 跳过）。 */
    docs?: DocRepository
    /**
     * 闸门后置链（REQ-e3b6a0 t9 / FR-9）：看板一键确认后触发 Phase B（推进 + 压缩 + 注入 + 唤醒）。
     * 缺省 → 只落章（行为与改造前完全一致）。
     */
    gateChain?: import('../../application/gate/GatePostChain.js').GateChainPort
    /** 在线 agent 查询（取会话句柄供 H2 用）；缺省 → 视为窗口不在线。 */
    agents?: () => { get?: (id: string) => unknown } | undefined
    /**
     * 会话工作区解析器（REQ-261003215944-9e04 FR-11）：会话 id → 该会话的工作区根（header.cwd）。
     *
     * 为什么需要它：本服务跑在**插件宿主**的工作目录（实测 `~/.dsh/profiles/<profile>`），
     * 而文档躺在**会话工作区**里。此前读根取 `process.cwd()`，于是除 `docs/requirements/<REQ>/`
     * 之外的工作区文档一律被判「不存在」（README.md、docs/knowledge/* 全中），
     * 前端拼出的绝对路径也跟着错，右侧栏预览只能报"文件不存在"。
     *
     * 缺省 → 无法按会话解析（只回落 legacy cwd）；响应里的 `docsRootSource` 会如实说明用了哪个根。
     */
    sessionWorkspace?: (sessionId: string | undefined) => string | undefined
    /**
     * 会话 → **项目身份 + 根**（REQ-261005141830-7a3b t5 · FR-6）：同一次查项目表拿到两值。
     *
     * 为什么要在 `sessionWorkspace` 之外再加一条：`sessionWorkspace` 只回答「这个窗口的 cwd 在哪」，
     * 答不出「这条需求属于哪个项目」——多项目并行时，看板列表只能靠路径逐条比，跨项目会误判。
     * 命中（会话在某个 workspace 的 `sessionIds` 里）→ 返回 `{ projectId, root }`
     * （`root` = 项目条目上的 `path`，即工作区根）；未命中 → `undefined`，路由回落 `sessionWorkspace` /
     * legacy cwd，并在响应里如实标注（`docsRootSource` / `projectSource`）。
     *
     * 保留 `sessionWorkspace` 为兼容字段：未装配本项的装配（老装配 / 老前端）行为逐字不变。
     */
    sessionProject?: (sessionId: string | undefined) => { projectId?: string; root?: string } | undefined
    /**
     * 知识层自举通知口（REQ-261004174324-4195 t4）：`resolveDocRoot` 命中会话根时通知一次。
     * 缺省 → 不自举（老行为；手动 `pnpm kb:build` 仍可用）。
     */
    knowledgeBootstrap?: { ensure(root?: string, projectId?: string): void }
    /**
     * 推进器（REQ-4842fe FR-12 / t-3be71b）：看板控制面「继续」= 置 autoRun=true **并触发一次推进事件**。
     * 缺省 → 只置开关并如实说明（不伪造"已续跑"）。
     */
    advance?: (requirementId: string) => Promise<{ steps: number; stopped: string }>
    /**
     * 应用层用例依赖（2026-09-26）：看板「拆分」入口需要直接调用 executeDecompose
     * （自动拆分路径缺 JobsPort，工具面又未暴露 reqboard_decompose）。缺省 → 该入口显式失败。
     */
    applicationDeps?: import('../../application/ports.js').UseCaseDeps
    /**
     * 需求面板刷新策略（REQ-261001124111-5d36 t4）：随 SSE 的 `build` 帧下发给浏览器。
     * 缺省 → 帧里不带 `panel`，客户端回落 `DEFAULT_PANEL_POLICY`（5000/30000）。
     */
    panelPolicy?: { refreshMs: number; staleAfterMs: number }
    /**
     * 运行设置端口（REQ-261004103330-005f FR-1/FR-3/FR-4）。
     * **缺省 = 未装配**：设置路由会**响亮 500** 并点明"组合根 bug + 怎么修"，
     * 绝不伪造一份空设置（可选字段 + 运行期兜底会把装配漏掉从编译期挪到运行期——本仓老教训）。
     */
    settings?: import('../../application/ports.js').SettingsStore
    /** 系统记录端口（FR-14）。缺省语义同上（响亮，不伪造）。 */
    systemRecord?: import('../../application/ports.js').SystemRecordStore
    /**
     * 文件路径选择端口（REQ-261004103330-005f）：「选择…」由宿主弹原生窗口取绝对路径。
     * 缺省 = 宿主没接 → 501 `path_picker_unavailable`，界面提示手输，**不假装选了路径**。
     */
    pickStoragePath?: import('../../application/ports.js').StoragePathPickerPort
    /** 宿主级动作确认票据（FR-11）。缺省 → 无法发起确认，因而**也不能切后端**（绝不伪造"已确认"）。 */
    storageActions?: StorageActionPort
    /** 插件版本信息（FR-15）：`name`/`version` 由组合根从 `package.json` 读；构建指纹另取 `getBuildStamp()`。 */
    pluginInfo?: { name: string; version: string }
    /** `dshHome` 绝对路径：设置/记录文件路径与「打开配置文件」的可复制路径由它派生（单一来源）。 */
    dshHome?: string
    /**
     * 会话探针（REQ-261004222448-292a t-497311）：对话流要读某窗口的会话事件。
     *
     * 为什么必须显式转发：本映射是**白名单**（漏一行 = 组合根传了、路由收不到）。
     * 缺省 → dialogue 端点降级为 `port-unavailable`（**不返回空数组冒充「没有对话」**）。
     */
    sessionProbe?: import('../../application/ports.js').SessionProbe
    /**
     * 挂起确认只读口（REQ-261004222448-292a t-497311）：报告的「几件事等人」与缺口第四类要读它。
     * 缺省 → 缺口里出现一条「挂起确认状态不可知」（**不写 0 条**冒充「没有人在等」）。
     */
    pendingConfirms?: import('../../application/query/contracts.js').PendingConfirmReadPort
    /**
     * Token 端点的**扩展段**（REQ-261004222448-292a t-497311 FR-10）。
     *
     * 为什么用「回填钩子」而不是另起一条路由：`/requirements/:id/token` 的账本读、任务读、
     * 注入留痕汇总都在 stages.ts 里（一处装配、一处口径）；扩展段只多「每次调用均 / 缓存命中 /
     * 优化点 / 可得性三态」，再读一遍账本等于给"两处口径漂移"开门。故由 stages 拿到 base 视图后
     * 回调本钩子，由它把扩展列并进同一响应。
     *
     * 缺省 → 不挂扩展段（老响应逐字不变；页面显示「无 token 快照」，**不补 0**）。
     */
    panelTokenExtension?: (
      res: import('node:http').ServerResponse,
      id: string,
      base: import('../../shared/protocol.js').RequirementTokenView,
    ) => Promise<void>
  }
  ids: { requirement: () => string; task: () => string; comment: () => string }
  mintId: (kind: 'requirement' | 'task') => Promise<string>
  json: (res: ServerResponse, status: number, body: unknown) => void
  ok: (res: ServerResponse, data: unknown) => void
  fail: (res: ServerResponse, err: unknown) => void
  badInput: (message: string) => never
  notFound: (what: string) => never
  readBody: (req: IncomingMessage) => Promise<Record<string, unknown>>
}

/** 读根来源（进响应体，便于诊断"这次用的是哪个根"）。 */
export type DocRootSource = 'session' | 'legacy-cwd'

/** 本次判据来源（REQ-261005141830-7a3b t5 · FR-9）：`project-id` = 项目身份给出；其余 = 路径兜底。 */
export type ProjectSource = 'project-id' | 'path-fallback'

export interface DocRoot {
  /** 实际使用的根（绝对路径）。 */
  root: string
  /** 会话工作区（解析不到则缺省）——客户端据此把无需求段的相对路径也绝对化。 */
  sessionRoot?: string
  /** 本次用的是哪个根。 */
  source: DocRootSource
  /**
   * 本次请求解析出的**项目身份**（REQ-261005141830-7a3b t5 · FR-6）：命中项目表才有。
   * 看板列表据此按项目过滤；缺省 = 未归属 → 不筛（老行为，全量）。
   */
  projectId?: string
  /**
   * 上面那个 `projectId` / `root` 的**判据来源**（FR-9）：`project-id` = 由项目表一次查表拿到；
   * `path-fallback` = 回落会话 cwd / legacy cwd（如实标注，不冒充项目身份）。
   */
  projectSource: ProjectSource
}

/**
 * 统一的**读根解析**（REQ-261003215944-9e04 FR-11）——预检与打开、看板与右侧栏共用这一处。
 *
 * 顺序（REQ-261005141830-7a3b t5 起优先用项目身份）：
 *   ① 请求里带了会话 id 且**项目表能一次给出「项目身份 + 根」** → 用它（`projectSource='project-id'`）；
 *   ② 否则回落会话工作区（`sessionWorkspace`，`projectSource='path-fallback'`，仍带上已解析到的身份）；
 *   ③ 都没有 → 回落 legacy cwd（插件宿主工作目录），并在 `source` 里如实标注。
 *
 * 刻意**不**在解析不到时编一个绝对路径：编出来的路径必然不存在，
 * 那等于让"文件不存在"变成我们自己制造的假象（诚实降级，R-013）。
 */
export function resolveDocRoot(deps: RouterCtx['deps'], sessionId: string | undefined): DocRoot {
  const trimmed = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (trimmed.length > 0) {
    // ① 项目身份优先：一次查表同时拿到 id 与根（根挂在项目上，见 design/interfaces.md）。
    const project = deps.sessionProject?.(trimmed)
    const projectId = typeof project?.projectId === 'string' && project.projectId.length > 0
      ? project.projectId
      : undefined
    const projectRoot = typeof project?.root === 'string' && project.root.length > 0 ? project.root : undefined
    if (projectRoot !== undefined) {
      // REQ-261004174324-4195 t4：根定了就通知一次自举（即发即忘，不阻塞本次请求）。
      // REQ-261005141830-7a3b t5：带上项目身份 → 同项目多窗口只自举一次。
      deps.knowledgeBootstrap?.ensure(projectRoot, projectId)
      return {
        root: projectRoot,
        sessionRoot: projectRoot,
        source: 'session',
        ...(projectId !== undefined ? { projectId } : {}),
        projectSource: 'project-id',
      }
    }
    // ② 项目表未命中 / 装配缺项 → 回落会话工作区（老行为），身份拿不到就不筛。
    const sessionRoot = deps.sessionWorkspace?.(trimmed)
    if (typeof sessionRoot === 'string' && sessionRoot.length > 0) {
      deps.knowledgeBootstrap?.ensure(sessionRoot, projectId)
      return {
        root: sessionRoot,
        sessionRoot,
        source: 'session',
        ...(projectId !== undefined ? { projectId } : {}),
        projectSource: 'path-fallback',
      }
    }
  }
  return { root: deps.cwd ?? process.cwd(), source: 'legacy-cwd', projectSource: 'path-fallback' }
}
