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
import type { RouterCtx } from './shared.js'
import type { PanelQueries, PanelQueryDeps } from '../../application/query/contracts.js'
import {
  isDegrade,
  type Degrade,
  type PanelResult,
  type RequirementTokenStageRow,
  type RequirementTokenView,
  type TokenPanelExtension,
  type TokenStageRow,
} from '../../shared/protocol.js'

/** 分页上限：与 design/interfaces.md 的校验表一致（超上限 → 400，不静默截断）。 */
export const PANEL_LIMIT_MAX = 50

/**
 * 需求 id 形状（`REQ-<数字>-<hex>`，本仓现行格式）。
 * 为什么要形状校验而不只是 `decodeURIComponent`：`queue.json` 的路径由 id 拼出，
 * 任何带 `/` 或 `..` 的 id 都是一个路径穿越面。**先判形状，再谈存不存在。**
 */
const REQ_ID_RE = /^REQ-\d{6,}-[0-9a-z]{4,}$/i

/** 六条端点的键（与 PanelQueries 对齐；`token` 是扩展段，挂在既有端点后面）。 */
export type PanelEndpoint = 'report' | 'trunk' | 'docs' | 'dag' | 'dialogue' | 'prompts' | 'token'

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

  /** `:id` 形状校验（返回 undefined = 400 已写）。 */
  function idOf(res: ServerResponse, raw: string): string | undefined {
    const id = decodeURIComponent(raw)
    if (!REQ_ID_RE.test(id)) {
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
    const out = await query(panelDeps as PanelQueryDeps, input)
    return ctx.ok(res, out)
  }

  return {
    handleReport: (res: ServerResponse, id: string, url: URL) => run(res, 'report', id, url),
    handleTrunk: (res: ServerResponse, id: string, url: URL) => run(res, 'trunk', id, url),
    handleDocs: (res: ServerResponse, id: string, url: URL) => run(res, 'docs', id, url),
    handleDag: (res: ServerResponse, id: string, url: URL) => run(res, 'dag', id, url),
    handleDialogue: (res: ServerResponse, id: string, url: URL) => run(res, 'dialogue', id, url),
    handlePrompts: (res: ServerResponse, id: string, url: URL) => run(res, 'prompts', id, url),
    handlePanels,
    handleTokenExtension,
    idOf,
  }

  /**
   * 单条 GET 分发：`/requirements/:id/report|trunk|docs|dag|dialogue|prompts`。
   * 返回 true = 已处理（调用方不必再往下试）。
   */
  async function handlePanels(res: ServerResponse, sub: string, url: URL): Promise<boolean> {
    const m = /^requirements\/([^/]+)\/(report|trunk|docs|dag|dialogue|prompts)$/.exec(sub)
    if (m === null) return false
    const rawId = m[1] ?? ''
    const endpoint = m[2] as PanelEndpoint
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
    const out = await query(panelDeps as PanelQueryDeps, { requirementId: id })
    if (isDegrade(out)) {
      return ctx.ok(res, { ...base, optimizations: [], availability: out.reason === 'no-snapshot' ? 'none' : 'partial' })
    }
    return ctx.ok(res, mergeTokenExtension(base, out as TokenPanelExtension))
  }
}
