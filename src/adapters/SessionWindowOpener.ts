/**
 * 会话开窗适配器（REQ-261003215944-9e04 FR-1 / t4）——`WindowOpenerPort` 的**唯一 I/O 实现**。
 *
 * 为什么在 adapters：application 层禁 import `@deepseek-ai/*`（层边界门禁），
 * 而开窗要调 DSH 宿主服务 `ctx.sessionController`（`fork` / `create`，见
 * `packages/api/session-controller/src/commands.ts:221-304`、`:266-303`）。
 *
 * **服务按调用时解析**（惰性注入的回调可能还没送达）——照 `WorkflowEngineRunner` 的既有口径：
 * 装配期拿不到 ≠ 永远拿不到，故每次调用现取；服务缺失时返回 `opener_unavailable`，
 * 由用例层翻成 `REQBOARD_OPEN_WINDOW_UNAVAILABLE`，**绝不伪造窗口码**。
 *
 * 诚实降级：本适配器只造会话，**造不出并列的 GUI 窗口**（DSH 无 per-session URL、
 * 无 Host→Client 导航推送）。所以它返回的只是「窗口码」；打开由人在侧栏完成。
 *
 * 落点（REQ-261004150249-731e FR-1）：`create(opts?)` 按 `opts` 组装请求（`workspaceId` 优先，
 * 与 `cwd` 互斥）；`resolveSourceProject` 从 workspace 注册表解析源会话所属项目。
 *
 * 继承三件（REQ-261005151245-54ae FR-1/FR-2/FR-4）：`readProfile` 一次 `projections` 读全
 * 标题 / Agent 预设 / 模型读数（**读不到就抛**，不静默）；`rename` 写标题；`selectModel` 写模型。
 * 模式（Agent 预设）不在这里单独写——`create` 路径随请求体 `agentPreset` 带入、`fork` 路径由宿主继承。
 *
 * @module dsh-pmboard/adapters/SessionWindowOpener
 */
import type {
  OpenWindowOutcome,
  WindowCreateOptions,
  WindowModelSelection,
  WindowOpenerPort,
  WindowSourceProfile,
} from '../application/ports.js'
import { projectIdOfWindow } from '../application/internal/project-identity.js'
import { windowProfileFromProjectionValues } from '../application/internal/window-inherit.js'
import { fmt } from '../domain/text/fmt.js'
import { toProjectEntries } from './workspaceRegistryRows.js'

/** 只取我们真正要用的能力（结构类型：DSH 服务对象的其余成员与本题无关）。 */
interface SessionControllerLike {
  fork?: (request: { sessionId: string; atSeq?: number }) => Promise<{ sessionId?: unknown }>
  create?: (request?: { cwd?: string; workspaceId?: string; agentPreset?: string }) => Promise<{ sessionId?: unknown }>
  /** 冷读任一会话的投影值（REQ-261005151245-54ae FR-2）；会话不存在时宿主返回 `null`。 */
  projections?: (request: { sessionId: string }) => Promise<{ values?: unknown } | null>
  /** 写定会话标题（FR-1）。 */
  rename?: (request: { sessionId: string; title: string }) => Promise<unknown>
  /** 写定会话模型选择（FR-4）；`reasoningEffort` 缺省即不带该键。 */
  selectModel?: (request: {
    sessionId: string
    provider: string
    model: string
    reasoningEffort?: string
  }) => Promise<unknown>
}

/** workspace 注册表的最小投影（只取「谁在哪个项目里」这一项能力）。 */
interface WorkspaceRegistryLike {
  list?: () => unknown
}

/**
 * 组装宿主建会话请求（REQ-261004150249-731e FR-1）：**只取其一**——
 * DSH 的 `workspaceId` 与 `cwd` 互斥，同时给会被网关判 `gateway/bad-request`。
 *
 * `workspaceId` **优先**：DSH 会按 `workspace.path` 建会话并 `attachSession`，新会话直接归入
 * 该项目分组；只给 `cwd` 时新会话不进任何 workspace，会掉进侧栏「未分组」。
 *
 * 两个都没有 → 保持既有请求体 `{}`（宿主 `defaultCwd`）——**旧调用方的请求逐字节不变**；
 * 「不许悄悄落到宿主目录」这条纪律由用例层守（解析不出就响亮失败，不调本方法）。
 *
 * REQ-261005151245-54ae FR-3：`agentPreset`（模式）与上面两个落点字段**正交**——它不参与
 * 「二者互斥」判定，只在非空时并入同一个请求体。
 */
function createRequestOf(opts?: WindowCreateOptions): { cwd?: string; workspaceId?: string; agentPreset?: string } {
  // REQ-261005151245-54ae FR-3：Agent 预设（模式）与落点**正交**——互斥判定仍只发生在
  // workspaceId 与 cwd 之间；预设只在非空时进请求体（不填 undefined 占位）。
  const preset = typeof opts?.agentPreset === 'string' && opts.agentPreset.trim().length > 0
    ? opts.agentPreset.trim()
    : undefined
  const withPreset = (base: { cwd?: string; workspaceId?: string }): { cwd?: string; workspaceId?: string; agentPreset?: string } =>
    preset === undefined ? base : { ...base, agentPreset: preset }
  const workspaceId = opts?.workspaceId
  if (typeof workspaceId === 'string' && workspaceId.length > 0) return withPreset({ workspaceId })
  const cwd = opts?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) return withPreset({ cwd })
  return withPreset({})
}

/** 原始错误的可读化（跨包时 instanceof 不可靠，故读 code / message 两个字段）。 */
function reasonOf(error: unknown): { code: string; text: string } {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code
    const message = (error as { message?: unknown }).message
    return {
      code: typeof code === 'string' ? code : '',
      text: typeof message === 'string' && message.length > 0 ? message : String(error),
    }
  }
  return { code: '', text: String(error) }
}

export class SessionWindowOpener implements WindowOpenerPort {
  constructor(
    private readonly resolveService: () => unknown,
    /**
     * workspace 注册表的惰性解析器（可选）——与 `resolveService` 同款口径：
     * 装配期拿不到 ≠ 永远拿不到，故每次调用现取；未注入 → `resolveSourceProject` 返回 undefined。
     */
    private readonly resolveWorkspaceRegistry?: () => unknown,
  ) {}

  /** 取服务对象（取不到返回 undefined，不抛——装配期缺失是合法状态）。 */
  private service(): SessionControllerLike | undefined {
    let raw: unknown
    try {
      raw = this.resolveService()
    } catch {
      return undefined
    }
    if (raw === null || typeof raw !== 'object') return undefined
    return raw as SessionControllerLike
  }

  available(): boolean {
    const svc = this.service()
    return svc !== undefined && typeof svc.fork === 'function'
  }

  async fork(sourceSessionId: string, atSeq?: number): Promise<OpenWindowOutcome> {
    const svc = this.service()
    if (svc === undefined || typeof svc.fork !== 'function') {
      return { ok: false, code: 'opener_unavailable', reason: 'sessionController.fork 不可用（服务未装配或本宿主无此能力）' }
    }
    try {
      const res = await svc.fork({ sessionId: sourceSessionId, ...(atSeq !== undefined ? { atSeq } : {}) })
      return this.outcomeOf(res?.sessionId, sourceSessionId)
    } catch (error: unknown) {
      const { code, text } = reasonOf(error)
      // 无已完成回合是**可预期**的拒绝（不是故障）：调用方可改用 mode=create，故单列一码。
      if (code === 'session/fork-unavailable' || /no completed turn/i.test(text)) {
        return { ok: false, code: 'unavailable_no_completed_turn', reason: text }
      }
      return { ok: false, code: 'open_failed', reason: text }
    }
  }

  async create(opts?: WindowCreateOptions): Promise<OpenWindowOutcome> {
    const svc = this.service()
    if (svc === undefined || typeof svc.create !== 'function') {
      return { ok: false, code: 'opener_unavailable', reason: 'sessionController.create 不可用（服务未装配或本宿主无此能力）' }
    }
    try {
      const res = await svc.create(createRequestOf(opts))
      return this.outcomeOf(res?.sessionId, undefined)
    } catch (error: unknown) {
      return { ok: false, code: 'open_failed', reason: reasonOf(error).text }
    }
  }

  /**
   * 冷读任一会话画像（REQ-261005151245-54ae FR-2）——一次 `projections` 读全三样，不 resume 源会话。
   *
   * **读不到就抛错**（服务未装配 / 宿主抛错 / 会话不存在）：把「读不到」压成 `undefined`
   * 会让上层只能替宿主断言"源窗口没有这项"——那是编造。三项都缺读数但读成功 → 返回空对象。
   */
  async readProfile(sessionId: string): Promise<WindowSourceProfile> {
    const svc = this.service()
    if (svc === undefined || typeof svc.projections !== 'function') {
      throw new Error('sessionController.projections 不可用（服务未装配或本宿主无此能力）')
    }
    const res = await svc.projections({ sessionId })
    if (res === null || typeof res !== 'object') {
      throw new Error(fmt('会话 {id} 的投影不可读（宿主未返回读数：会话不存在或投影未装配）', { id: sessionId }))
    }
    return windowProfileFromProjectionValues(res.values)
  }

  /** 写定会话标题（FR-1）；宿主错误原样抛，由用例层翻成 `failed` + 原因。 */
  async rename(sessionId: string, title: string): Promise<void> {
    const svc = this.service()
    if (svc === undefined || typeof svc.rename !== 'function') {
      throw new Error('sessionController.rename 不可用（服务未装配或本宿主无此能力）')
    }
    await svc.rename({ sessionId, title })
  }

  /** 写定会话模型选择（FR-4）；`reasoningEffort` 缺省时**不带该键**（不填 undefined 占位）。 */
  async selectModel(sessionId: string, selection: WindowModelSelection): Promise<void> {
    const svc = this.service()
    if (svc === undefined || typeof svc.selectModel !== 'function') {
      throw new Error('sessionController.selectModel 不可用（服务未装配或本宿主无此能力）')
    }
    await svc.selectModel({
      sessionId,
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
    })
  }

  /**
   * 源会话的项目落点（REQ-261004150249-731e FR-1）——**只做 workspace 这一级**：
   * `workspaceRegistry.list()` 里 `sessionIds` 含该会话的那个 workspace → `{ workspaceId }`。
   * cwd 兜底由用例层给（那里才拿得到 `exec.agent.session.header.cwd`）。
   *
   * REQ-261005141830-7a3b t1：行扫描与 `sessionIds → id` 的解析**抽到共用实现**
   * （`workspaceRegistryRows.toProjectEntries` + `project-identity.projectIdOfWindow`），
   * 与项目身份端口 `WorkspaceRegistryProjectPort` 同源——两处各写一遍必然漂移。
   * 行为逐字不变（未注入 / 非对象 / `list` 非函数 / 抛错 / 未命中 → `undefined`，不编假 id）。
   */
  resolveSourceProject(sourceSessionId: string): WindowCreateOptions | undefined {
    const registry = this.registry()
    if (registry === undefined || typeof registry.list !== 'function') return undefined
    let rows: unknown
    try {
      rows = registry.list()
    } catch {
      return undefined
    }
    if (!Array.isArray(rows)) return undefined
    const projectId = projectIdOfWindow(toProjectEntries(rows), sourceSessionId)
    return projectId === undefined ? undefined : { workspaceId: projectId }
  }

  /** 取 workspace 注册表（取不到返回 undefined，不抛——装配期缺失是合法状态）。 */
  private registry(): WorkspaceRegistryLike | undefined {
    let raw: unknown
    try {
      raw = this.resolveWorkspaceRegistry?.()
    } catch {
      return undefined
    }
    if (raw === null || typeof raw !== 'object') return undefined
    return raw as WorkspaceRegistryLike
  }

  /**
   * 结果归一：**子会话 id 必须是非空字符串且不等于源**——
   * 否则"开窗成功"是假的（下游会拿源窗口码去投递，等于自我循环）。
   */
  private outcomeOf(rawId: unknown, sourceSessionId: string | undefined): OpenWindowOutcome {
    if (typeof rawId !== 'string' || rawId.length === 0) {
      return { ok: false, code: 'open_failed', reason: '宿主未返回会话 id（开窗结果不可信）' }
    }
    if (sourceSessionId !== undefined && rawId === sourceSessionId) {
      return { ok: false, code: 'open_failed', reason: `宿主返回的会话 id 与源相同（${rawId}），不是新窗口` }
    }
    return {
      ok: true,
      windowKey: rawId,
      ...(sourceSessionId !== undefined ? { parentSessionId: sourceSessionId } : {}),
    }
  }
}
