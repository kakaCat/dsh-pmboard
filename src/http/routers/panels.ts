/**
 * 详情页六条只读端点的路由（REQ-261004222448-292a t-497311 · FR-11 / FR-12）。
 *
 * 为什么单独一个 router 而不是塞进 stages.ts：stages 已经有 470+ 行（本仓单文件 400 行尺寸门禁），
 * 而这六条是**同一种东西**（同一个 `PanelQueryDeps`、同一套分页与降级纪律）——放一起才能
 * 「一处校验、一处降级」，不会出现六条各写一遍 `limit` 校验然后漂移。
 *
 * 三条纪律（照 design/interfaces.md）：
 *  ① **只读**：六条全是 GET，不认识任何写方法；
 *  ② **先校验再触盘**：`:id` 形状不合法 → 400，且在**碰任何端口之前**返回
 *     （路径遍历样本 `../../etc/passwd` 不许走到 `queue.json` 的路径拼接那一步）；
 *  ③ **降级不冒充**：查询未装配 → `available:false, reason:'port-unavailable'`（200），
 *     不是 500、更不是「0 条」。
 *
 * @module dsh-pmboard/http/routers/panels
 */
import type { ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { resolveDocRoot, type RouterCtx } from './shared.js'
import { FileDocRepository } from '../../adapters/FileDocRepository.js'
import { JsonQueueRepository } from '../../repositories/QueueRepository.js'
import { QueueTaskStore } from '../../repositories/QueueTaskStore.js'
import type { PanelQueries, PanelQueryDeps } from '../../application/query/contracts.js'
import { isRequirementId } from '../../domain/requirement/ReqboardPaths.js'
import {
  isDegrade,
  type Degrade,
  type PanelResult,
  type RequirementRecord,
  type RequirementTokenStageRow,
  type RequirementTokenView,
  type TokenPanelExtension,
  type TokenStageRow,
} from '../../shared/protocol.js'

/** 分页上限：与 design/interfaces.md 的校验表一致（超上限 → 400，不静默截断）。 */
export const PANEL_LIMIT_MAX = 50

/**
 * 需求 id 形状（**用仓内唯一判据**，不另写正则）。
 *
 * 为什么不能自己写死一条正则：`ReqboardPaths` 的 `isRequirementId` 同时接受
 * `REQ-<12位时间戳>-<4hex>` 与存量的 `REQ-<6hex>` 两种形状，且它本身就是**路径穿越防线**
 * （`queue.json` 的路径由 id 拼出）。另写一条更严的正则 = 让存量短 id 需求在六个面板端点上
 * 一律 400（实测发现的缝），而更松的写法就是把穿越面重新打开。校验归它，路由只是调用方。
 */

/** 六条端点的键（与 PanelQueries 对齐；`token` 是扩展段，挂在既有端点后面）。 */
export type PanelEndpoint = 'report' | 'trunk' | 'docs' | 'dag' | 'dialogue' | 'prompts' | 'token' | 'verify'

/** 一条降级信封（六条共用；`reason` 的四种含义见 protocol.ts 的 DegradeReason）。 */
export function degradeOf(reason: Degrade['reason'], note: string): Degrade {
  return { available: false, reason, note }
}

export interface PanelsRouterDeps {
  /**
   * 六个查询（可注入 = 路由用例不必拖上真实的台账/会话/文档端口）。
   * 未装配的查询**不是错误**：该端点照常 200 + `port-unavailable`（FR-12 的「不可用（端口未装配）」）。
   */
  queries?: Partial<PanelQueries>
  /**
   * 查询依赖（store / tasks / injections / sessions / docs / isolations / systemPrompt）。
   * 由组合根传入；缺 `sessions` 时 dialogue 端点降级为 port-unavailable。
   */
  panelDeps?: Partial<PanelQueryDeps>
}

/** 从 RouterCtx 里摊平出六查询需要的依赖（缺谁谁降级——**不猜、不假装配**）。 */
export function panelDepsFrom(ctx: RouterCtx, over: Partial<PanelQueryDeps> = {}): Partial<PanelQueryDeps> {
  return {
    store: ctx.requirementStore,
    tasks: ctx.taskStore,
    now: ctx.now,
    ...(ctx.deps.injectionLog !== undefined ? { injections: ctx.deps.injectionLog } : {}),
    ...(ctx.deps.isolationLog !== undefined ? { isolations: ctx.deps.isolationLog } : {}),
    ...(ctx.deps.systemPrompt !== undefined ? { systemPrompt: ctx.deps.systemPrompt } : {}),
    ...(ctx.deps.docs !== undefined ? { docs: ctx.deps.docs } : {}),
    ...(ctx.deps.sessionProbe !== undefined ? { sessions: ctx.deps.sessionProbe } : {}),
    ...(ctx.deps.pendingConfirms !== undefined ? { pendingConfirms: ctx.deps.pendingConfirms } : {}),
    ...over,
  }
}

/** Token 响应（扩展段并入后）：基础段逐字保留，`byStage` 每行**就地加列**。 */
export type TokenResponseWithPanel = Omit<RequirementTokenView, 'byStage'> &
  Omit<TokenPanelExtension, 'byStage'> & {
    byStage: (RequirementTokenStageRow & TokenStageRow)[]
  }

/**
 * 把扩展段并进基础视图（**纯函数**，路由与用例共用一处口径）。
 *
 * 为什么按阶段就地加列而不换表：`byStage` 的老列（快照桶 / 执行下钻）仍有人在读——
 * 换掉它等于把「老读法」判死刑；而页面要的 `perCallTokens`/`cacheHitPct` 只是**同一行的新列**。
 * 加列是向后兼容的，换表不是。
 */
export function mergeTokenExtension(
  base: RequirementTokenView,
  ext: TokenPanelExtension,
): TokenResponseWithPanel {
  const byKey = new Map(ext.byStage.map((r) => [r.stage, r]))
  const byStage = base.byStage.map((row) => {
    const add = byKey.get(row.stage)
    // 没有扩展行的阶段原样保留：**不凭空造 0 行**（「不可得」与「确实是 0」是两件事）
    return (add === undefined ? row : { ...row, ...add }) as RequirementTokenStageRow & TokenStageRow
  })
  return {
    ...base,
    byStage,
    optimizations: ext.optimizations,
    availability: ext.availability,
    ...(ext.missingStages !== undefined ? { missingStages: ext.missingStages } : {}),
    ...(ext.boundsAreLowerBound !== undefined ? { boundsAreLowerBound: ext.boundsAreLowerBound } : {}),
  }
}

export function createPanelsRouter(ctx: RouterCtx, deps: PanelsRouterDeps) {
  const panelDeps: Partial<PanelQueryDeps> = { ...panelDepsFrom(ctx), ...deps.panelDeps }

  /**
   * 按**会话**解析文档根后再装配依赖（上线冒烟实测补的修复）。
   *
   * 事故出处：宿主进程的 `process.cwd()` 是插件宿主目录（实测 `~/.dsh/profiles/<profile>`），
   * 不是用户工作区。六条端点若直接用组合根那份 cwd 文档仓储，`/docs` 会把**全部**登记文档
   * 判成 `file-missing`、`/trunk` 会把七条主干全判成「文档未提供该节」——页面在撒谎。
   * 既有路由（`/stage/:stage`、marks）早就是这么解的：`resolveDocRoot(deps, sessionId)` →
   * 按会话拿工作区根，再据此建一份文档仓储。这里与它们**同一口径**（`?session=` 由前端带上）。
   * 解析不到会话根时回落 `legacy-cwd`——与既有行为一致，且响应里的 `file-missing` 才是真的。
   */
  function depsForSession(sessionId: string | undefined): Partial<PanelQueryDeps> {
    if (ctx.deps.sessionWorkspace === undefined) return panelDeps
    const root = resolveDocRoot(ctx.deps, sessionId).root
    // 任务根同一道理：`queue.json` 也在工作区里。组合根那份 TaskStore 吃 `process.cwd()`，
    // 在本部署形态下读不到任何队列（既有 `/stage/:stage` 端点同样返回 0 张卡）。
    // 这里**只读**地用会话根建一份队列读端——不碰写路径，任务的落库仍归组合根那一份。
    const tasks = new QueueTaskStore({
      repo: new JsonQueueRepository({ workspaceRoot: root }),
      now: ctx.now,
      onWarn: () => {},
    })

    /**
     * 候选读根（REQ-261005143615-5ab1 FR-1/FR-2）：**需求自己声明的工作区 → 阅读会话工作区 →
     * 组合根 cwd**，去空去重，并**只留真实存在的根**。
     *
     * 三条为什么：
     *  - 需求声明根排第一：它是「这条需求的东西在哪」的唯一权威声明，会话根只说明「谁在看」；
     *  - 只留存在的根：「根不在」（换机器 / 仓被移动）与「文件不在」是两件事——前者由查询层
     *    记成 `unknown`，不许谎报缺失；
     *  - 探测（`existsSync`）留在这里：application 层禁止 `import node:`（layer-boundary）。
     */
    const docRootsOf = (req: RequirementRecord): string[] => {
      const out: string[] = []
      for (const candidate of [req.workspaceRoot, root, ctx.deps.cwd]) {
        if (typeof candidate !== 'string' || candidate.length === 0 || out.includes(candidate)) continue
        try {
          if (existsSync(candidate)) out.push(candidate)
        } catch { /* 探测失败 = 这个根不可用（不猜、不编路径） */ }
      }
      return out
    }

    /** 按根建文档读端口（构造适配器的事留在本层，application 只调用）。 */
    const docsAt = (r: string): FileDocRepository => new FileDocRepository({ workspaceRoot: r })

    return {
      ...panelDeps,
      docs: new FileDocRepository({ workspaceRoot: root }),
      tasks,
      docRootsOf,
      docsAt,
      // verify 端点读 RTM 用的工作区根（REQ-261006130057-7a43）：与会话解析根同源——
      // 组合根 cwd 是插件宿主目录（见上方事故注释），RTM 在**用户工作区**里。
      workspaceRoot: root,
    }
  }

  /** `:id` 形状校验（返回 undefined = 400 已写）。 */
  function idOf(res: ServerResponse, raw: string): string | undefined {
    const id = decodeURIComponent(raw)
    if (!isRequirementId(id)) {
      ctx.json(res, 400, { success: false, error: `需求 id 形状非法：${raw}`, code: 'invalid_input' })
      return undefined
    }
    return id
  }

  /** `limit` 校验：非正整数或超上限 → 400（返回 undefined = 已写响应）。 */
  function limitOf(res: ServerResponse, url: URL): number | undefined | null {
    const raw = url.searchParams.get('limit')
    if (raw === null) return undefined
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0 || n > PANEL_LIMIT_MAX) {
      ctx.json(res, 400, { success: false, error: `limit 必须是 1..${PANEL_LIMIT_MAX} 的整数，收到 ${raw}`, code: 'invalid_input' })
      return null
    }
    return n
  }

  /** `before` 游标：正整数（不合法 → 400）。 */
  function beforeOf(res: ServerResponse, url: URL): number | undefined | null {
    const raw = url.searchParams.get('before')
    if (raw === null) return undefined
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) {
      ctx.json(res, 400, { success: false, error: `before 必须是正整数，收到 ${raw}`, code: 'invalid_input' })
      return null
    }
    return n
  }

  /**
   * 统一的取数与回包。**顺序不可换**：先形状/分页校验 → 再判查询是否装配 → 最后才触盘。
   */
  async function run(
    res: ServerResponse,
    endpoint: PanelEndpoint,
    rawId: string,
    url: URL,
  ): Promise<void> {
    const id = idOf(res, rawId)
    if (id === undefined) return
    const limit = limitOf(res, url)
    if (limit === null) return
    const before = beforeOf(res, url)
    if (before === null) return

    const query = deps.queries?.[endpoint] as
      | ((d: PanelQueryDeps, i: { requirementId: string; before?: number; limit?: number }) => Promise<PanelResult<unknown>>)
      | undefined
    if (query === undefined) {
      return ctx.ok(res, degradeOf('port-unavailable', `${endpoint} 查询未装配`))
    }
    // 依赖缺失同样按「未装配」处理：宁可说不可用，也不拿半份依赖去读盘
    if (panelDeps.store === undefined || panelDeps.tasks === undefined || panelDeps.injections === undefined) {
      return ctx.ok(res, degradeOf('port-unavailable', `${endpoint} 查询的只读端口未装配完整`))
    }
    if ((endpoint === 'dialogue') && panelDeps.sessions === undefined) {
      return ctx.ok(res, degradeOf('port-unavailable', '会话探针未装配（对话流读不到）'))
    }
    const input: { requirementId: string; before?: number; limit?: number } = { requirementId: id }
    if (before !== undefined) input.before = before
    if (limit !== undefined) input.limit = limit
    // 文档类查询用**按会话解析**的文档仓储（见 depsForSession 的事故注释）
    const out = await query(depsForSession(url.searchParams.get('session') ?? undefined) as PanelQueryDeps, input)
    return ctx.ok(res, out)
  }

  return {
    handleReport: (res: ServerResponse, id: string, url: URL) => run(res, 'report', id, url),
    handleTrunk: (res: ServerResponse, id: string, url: URL) => run(res, 'trunk', id, url),
    handleDocs: (res: ServerResponse, id: string, url: URL) => run(res, 'docs', id, url),
    handleDag: (res: ServerResponse, id: string, url: URL) => run(res, 'dag', id, url),
    handleDialogue: (res: ServerResponse, id: string, url: URL) => run(res, 'dialogue', id, url),
    handlePrompts: (res: ServerResponse, id: string, url: URL) => run(res, 'prompts', id, url),
    handleVerify: (res: ServerResponse, id: string, url: URL) => run(res, 'verify', id, url),
    handlePanels,
    handleTokenExtension,
    idOf,
  }

  /**
   * 单条 GET 分发：`/requirements/:id/report|trunk|docs|dag|dialogue|prompts`，
   * 并接受设计文档承诺的两段写法 `/requirements/:id/report/trunk`（同一处理器）。
   * 返回 true = 已处理（调用方不必再往下试）。
   */
  async function handlePanels(res: ServerResponse, sub: string, url: URL): Promise<boolean> {
    const m = /^requirements\/([^/]+)\/(report\/trunk|report|trunk|docs|dag|dialogue|prompts|verify)$/.exec(sub)
    if (m === null) return false
    const rawId = m[1] ?? ''
    // `report/trunk` 归一到 `trunk`：**同一个处理器、同一份校验与降级**，
    // 别名只改路径不改语义（两条路径的响应逐字段相同，有用例钉住）。
    const endpoint = (m[2] === 'report/trunk' ? 'trunk' : m[2]) as PanelEndpoint
    if (endpoint === 'report' || endpoint === 'trunk') {
      if (endpoint === 'report') await run(res, 'report', rawId, url)
      else await run(res, 'trunk', rawId, url)
      return true
    }
    await run(res, endpoint, rawId, url)
    return true
  }

  /**
   * Token 端点的**扩展段**（FR-10）：读现有装配，再把扩展列并进去。
   *
   * 为什么在**同一响应**里合并而不是另起端点：页面只有一张「按阶段」表；
   * 两个端点会让「占比合计 == 总计」这条断言无处落脚（两处各算各的）。
   */
  async function handleTokenExtension(
    res: ServerResponse,
    id: string,
    base: RequirementTokenView,
  ): Promise<void> {
    const query = deps.queries?.token
    if (query === undefined) {
      // 未装配 = 扩展段不可用；**基础段照常回**（其余字段与语义不变），页面据此显示「无 token 快照」
      return ctx.ok(res, {
        ...base,
        optimizations: [],
        availability: 'none' as const,
        unavailableNote: 'token 扩展查询未装配',
      })
    }
    const out = await query(depsForSession(undefined) as PanelQueryDeps, { requirementId: id })
    if (isDegrade(out)) {
      return ctx.ok(res, { ...base, optimizations: [], availability: out.reason === 'no-snapshot' ? 'none' : 'partial' })
    }
    return ctx.ok(res, mergeTokenExtension(base, out as TokenPanelExtension))
  }
}
