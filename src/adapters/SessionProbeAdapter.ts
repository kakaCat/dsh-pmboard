/**
 * 会话探测适配器（REQ-47939a t5 / ports.ts SessionProbe）——窗口身份 / 调用方权限 /
 * 工具痕迹 / 近期用户消息的唯一 I/O 入口。
 *
 * 从 host/capture-hook.ts 搬入会话痕迹的**纯缓冲逻辑**（tool/call 痕迹、近期用户消息
 * 缓冲及其判定），从 host/agent-tools.ts 搬入调用方认证（live driver / direct human）
 * 的判定文本——两处曾是"会话 I/O"与"工具壳认证"的耦合点，适配层是它们的正确归属。
 * host/capture-hook.ts 继续再导出这些符号，既有 import 路径（含 capture-hook.test）不变。
 *
 * 端口方法 requireLiveDriver / requireDirectHuman 保留搬迁前的错误码与消息（REQBOARD_*），
 * 以便 t8 切换调用方时行为逐字不变（端口文档里的 caller_not_live 是目标语义，映射在 t8）。
 *
 * @module dsh-pmboard/adapters/SessionProbeAdapter
 */
import type { SessionProbe } from '../application/ports.js'
import {
  emptyBuckets,
  type TokenBuckets,
  type TokenSnapshot,
  type TokenSnapshotMember,
  type SessionLineageEntry,
  type ContextPressureSnapshot,
} from '../shared/protocol.js'
import { descendantsOf, sumMembers, type LineageHeader } from '../domain/token/lineage.js'

/**
 * DSH 两个服务的**最小形状**（鸭子探测，不 import DSH 类型以免与版本耦合）：
 *  · persistence：只用到 `list()`（枚举 header，零日志读）与 `open()/read()`（冷读兜底）；
 *  · projectionCache：`cachedSnapshot(header, keys)` **同步**返回 `{asOfSeq, values}`，
 *    以及 `coldSnapshot(header, inheritedEventCount, events)`（冷读后写回缓存）。
 */
interface PersistenceLike {
  list?: () => Promise<readonly unknown[]>
  open?: (id: string, access: 'read' | 'write') => Promise<unknown>
}
interface ProjectionCacheLike {
  cachedSnapshot?: (meta: unknown, keys?: readonly string[]) => { asOfSeq?: number; values?: Record<string, unknown> } | undefined
  coldSnapshot?: (meta: unknown, inheritedEventCount: number, events: readonly unknown[]) => unknown
}

// ---------------------------------------------------------------------------
// 纯缓冲逻辑（工具痕迹 / 近期用户消息）已迁至 application/internal/session-buffers.ts（2026-09-26）：
// Dive 会话驱动器在 application 层，不能被它反向 import 到 adapters；本文件继续再导出，
// 既有 import 路径（含 capture-hook.test 等）逐字不变。
import {
  TOOL_TRACE_CAP,
  recordToolTrace,
  toolActivitySince,
  RECENT_USER_MSG_CAP,
  CONFIRM_EVIDENCE_WINDOW_MS,
  recordRecentUserMsg,
  evidenceMatchesRecentUserMsg,
  type ToolTraceEntry,
  type RecentUserMsg,
} from '../application/internal/session-buffers.js'
export {
  TOOL_TRACE_CAP,
  recordToolTrace,
  toolActivitySince,
  RECENT_USER_MSG_CAP,
  CONFIRM_EVIDENCE_WINDOW_MS,
  recordRecentUserMsg,
  evidenceMatchesRecentUserMsg,
}
export type { ToolTraceEntry, RecentUserMsg }

// ---------------------------------------------------------------------------
// SessionProbe 适配器（端口实现）
// ---------------------------------------------------------------------------

/** 结构化认证失败：message 自带（CODE）文本；code 属性仅测试/直接执行消费。 */
function rejectSession(message: string, code: string): never {
  throw Object.assign(new Error(`${message}（${code}）`), { code })
}

export interface SessionProbeAdapterOptions {
  /** 工具痕迹表（done 凭证门）。 */
  toolTrace?: Map<string, ToolTraceEntry[]>
  /** 最近用户消息缓冲（文字确认核验）。 */
  recentUserMsgs?: Map<string, RecentUserMsg[]>
  /** 当前 agents 服务（unavailable → undefined）；live-driver 校验用。 */
  agents?: () => unknown
  /** 当前 sessionProjections 服务（unavailable → undefined）；direct-human 校验用。 */
  sessionProjections?: () => unknown
  /**
   * 会话持久化服务（REQ-261004154937-2ca3）：只用它的 `list()` 枚举血缘 header。
   * 不可得 → 退回只算自身并标 `descendants-unavailable`（**不假装聚合过**）。
   */
  sessionPersistence?: () => unknown
  /**
   * 投影缓存服务（REQ-261004154937-2ca3）：`cachedSnapshot(header, ['tokenUsage'])` **同步**读单会话用量
   * （缓存命中零日志读）。不可得 → 同上退回自身。
   */
  sessionProjectionCache?: () => unknown
  /** 血缘成员上限（默认 64）：异常数据不该把内存撑爆。 */
  maxLineageMembers?: number
  /** 单次刷新的冷读预算（默认 8 个）：超出的成员本轮只标 degraded，不拖慢主流程。 */
  maxColdReads?: number
  /** 时间源（matchesRecentUserMessage 的时间窗起点）；默认 Date.now。 */
  now?: () => number
}

export class SessionProbeAdapter implements SessionProbe {
  private readonly opts: SessionProbeAdapterOptions
  /**
   * 血缘成员缓存（REQ-261004154937-2ca3）：枚举是异步的、快照链是同步的，故**集合异步刷新、
   * 用量同步读**——这里存的是"上一次刷新已知的后代集合"（含 header，供 `cachedSnapshot` 使用）。
   */
  private readonly lineageCache = new Map<string, { at: number; entries: Array<{ id: string; depth: number; header: unknown }> }>()
  /** 同一窗口的刷新去重（避免并发刷新打爆 list()）。 */
  private readonly lineageInFlight = new Set<string>()
  /** 已尝试过冷读的会话（每个只试一次，失败就继续记 degraded，不做菊花链重试）。 */
  private readonly coldTried = new Set<string>()

  constructor(options: SessionProbeAdapterOptions = {}) {
    this.opts = options
  }

  /** 工具痕迹表（供 hook 写入 / 凭证门读取）。 */
  toolTrace(): Map<string, ToolTraceEntry[]> | undefined {
    return this.opts.toolTrace
  }

  /** 窗口码：执行器 agent 的 id（缺失/非字符串 → 抛 REQBOARD_AGENT_REQUIRED）。 */
  windowKey(exec: unknown): string {
    const raw = ((exec as { agent?: { id?: unknown } } | undefined)?.agent)?.id
    if (typeof raw !== 'string' || raw.length === 0) {
      rejectSession('reqboard 工具需要由执行窗口的 agent 调用（缺 exec.agent）', 'REQBOARD_AGENT_REQUIRED')
    }
    return raw
  }

  /**
   * 尽力而为的 live-driver 认证（从 agent-tools 搬入）：agents 服务可得时要求调用者就是
   * 注册表中正在运行且当前发起回合的同一 agent；服务不可得（测试/降级环境）只做 identity。
   */
  requireLiveDriver(exec: unknown): void {
    const svc = this.opts.agents?.()
    if (svc === undefined) return
    const agents = svc as { get?: (id: string) => unknown; currentInitiator?: () => unknown }
    if (typeof agents.get !== 'function' || typeof agents.currentInitiator !== 'function') return
    const agent = (exec as { agent?: unknown } | undefined)?.agent
    if (agent === undefined) {
      rejectSession('reqboard 工具需要由执行窗口的 agent 调用（缺 exec.agent）', 'REQBOARD_AGENT_REQUIRED')
    }
    const id = (agent as { id: string }).id
    const live =
      agents.get(id) === agent &&
      (agent as { status?: string }).status === 'running' &&
      agents.currentInitiator() === agent
    if (!live) {
      rejectSession('reqboard_create 需要确切的在线调用 agent 且在其 live driver 回合内', 'REQBOARD_DRIVER_REQUIRED')
    }
  }

  /**
   * 直接人工回合认证（从 agent-tools 搬入）：agents + sessionProjections 服务都可得时，
   * 要求本 agent 是 root 且当前 open turn 含 source.kind==='user' 的用户消息；任一服务
   * 不可得 → 降级放行（无法证伪即放行）。
   */
  requireDirectHuman(exec: unknown): void {
    const svc = this.opts.agents?.()
    const projSvc = this.opts.sessionProjections?.()
    if (svc === undefined || projSvc === undefined) return
    const agents = svc as { roots?: () => unknown[] }
    const projections = projSvc as {
      stateOf?: (session: unknown, kind: string) => { openTurnStartSeq: number | null } | undefined
    }
    if (typeof agents.roots !== 'function' || typeof projections.stateOf !== 'function') return
    const agent = (exec as { agent?: unknown } | undefined)?.agent
    if (agent === undefined) {
      rejectSession('reqboard 工具需要由执行窗口的 agent 调用（缺 exec.agent）', 'REQBOARD_AGENT_REQUIRED')
    }
    if (!agents.roots().includes(agent)) {
      rejectSession('reqboard_create 需要顶层 agent 窗口的直接人工回合', 'REQBOARD_DIRECT_HUMAN_REQUIRED')
    }
    const session = (agent as { session?: unknown }).session
    const boundary = projections.stateOf(session, 'turnBoundary')
    if (boundary === undefined || boundary.openTurnStartSeq === null) {
      rejectSession('reqboard_create 需要 open 的模型回合（turnBoundary 不可得）', 'REQBOARD_DRIVER_REQUIRED')
    }
    const events = (agent as { session?: { snapshotEvents?: () => unknown[] } }).session?.snapshotEvents?.() ?? []
    for (let seq = boundary.openTurnStartSeq + 1; seq < events.length; seq += 1) {
      const event = events[seq] as { type?: string; data?: { source?: { kind?: string } } } | undefined
      if (event !== undefined && event.type === 'user/message' && event.data?.source?.kind === 'user') return
    }
    rejectSession('reqboard_create 需要本次直接人工回合的用户消息（自主回合禁止立项）', 'REQBOARD_DIRECT_HUMAN_REQUIRED')
  }

  /**
   * 执行会话的累计 token 快照（REQ-a33899 t2）。读 sessionProjections 的 tokenUsage 投影；
   * 任一环节不可得（服务未装配 / 窗口无会话 / 投影未产出）→ source='unavailable' 空桶，**不抛错**。
   */
  tokenTotals(windowKey: string): TokenSnapshot {
    const self = this.selfTotals(windowKey)
    if (self.source === 'unavailable') return self

    // 血缘服务不可得 → 退回只算自身，**如实标降级**（不假装聚合过）
    if (this.lineageServices() === undefined) {
      return { ...self, scope: 'self', degradedReason: 'descendants-unavailable' }
    }
    // 集合异步刷新（fire-and-forget）：枚举是异步的，而快照链是同步的——
    // 故这里只用**上一次刷新的成员集合**，本轮同步逐个读用量（cachedSnapshot 是同步的）。
    if (!this.lineageCache.has(windowKey)) void this.refreshDescendants(windowKey)
    const { members: kids, degraded, overBudget } = this.readDescendantMembers(windowKey)

    const selfMember: TokenSnapshotMember = {
      sessionId: self.sessionId ?? windowKey,
      depth: 0,
      ...(self.seq !== undefined ? { seq: self.seq } : {}),
      totals: self.totals,
    }
    const members: TokenSnapshotMember[] = [selfMember, ...kids]
    return {
      ...self,
      scope: 'self+descendants',
      totals: sumMembers(members),
      members,
      ...(degraded.length > 0
        ? { degradedMembers: degraded, degradedReason: overBudget ? 'cold-read-budget' : 'member-unavailable' }
        : {}),
    }
  }

  /**
   * 本窗口会话自身的投影读数（改造前的原逻辑，逐字保留）——聚合链的第一段。
   * 任一环节不可得 → `source='unavailable'` 空桶，**不抛错**。
   */
  private selfTotals(windowKey: string): TokenSnapshot {
    const now = this.opts.now?.() ?? Date.now()
    const unavailable = (): TokenSnapshot => ({ at: now, totals: emptyBuckets(), source: 'unavailable' })
    const agents = this.opts.agents?.() as { get?: (id: string) => unknown } | undefined
    const projections = this.opts.sessionProjections?.() as
      { stateOf?: (session: unknown, kind: string) => unknown } | undefined
    if (typeof agents?.get !== 'function' || typeof projections?.stateOf !== 'function') return unavailable()
    let session: unknown
    try {
      session = (agents.get(windowKey) as { session?: unknown } | undefined)?.session
    } catch {
      return unavailable()
    }
    if (session === undefined || session === null) return unavailable()
    let state: unknown
    try {
      state = projections.stateOf(session, 'tokenUsage')
    } catch {
      return unavailable()
    }
    const totals = readTokenTotals(state)
    if (totals === undefined) return unavailable()
    const sessionId = readSessionId(session)
    const seq = readSessionSeq(session)
    return {
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(seq !== undefined ? { seq } : {}),
      at: now,
      totals,
      source: 'projection',
    }
  }

  /** 血缘两个服务（鸭子探测；任一不可用即视为不可得）。 */
  private lineageServices(): { persistence: PersistenceLike; cache: ProjectionCacheLike } | undefined {
    const persistence = this.opts.sessionPersistence?.() as PersistenceLike | undefined
    const cache = this.opts.sessionProjectionCache?.() as ProjectionCacheLike | undefined
    if (typeof persistence?.list !== 'function' || typeof cache?.cachedSnapshot !== 'function') return undefined
    return { persistence, cache }
  }

  /**
   * 该窗口会话的后代子代理会话（端口方法，**异步且不抛错**）：枚举走 `sessionPersistence.list()`，
   * 闭包规则在 `descendantsOf`（fork 窗口不算后代）。服务不可得 → `undefined`。
   */
  async descendantSessions(windowKey: string): Promise<readonly SessionLineageEntry[] | undefined> {
    const svc = this.lineageServices()
    if (svc === undefined) return undefined
    const selfId = this.selfSessionId(windowKey)
    if (selfId === undefined) return undefined
    const headers = await this.listHeaders(svc)
    if (headers === undefined) return undefined
    // 顺手把集合写进缓存：本方法既是「查血缘」的公开口，也是`tokenTotals`（同步）的**预热口**
    this.cacheLineage(windowKey, selfId, headers)
    return descendantsOf(headers, selfId).map(d => ({
      sessionId: d.sessionId,
      depth: d.depth,
      parentSessionId: headers.find(h => h.id === d.sessionId)?.parentSession ?? selfId,
    }))
  }

  /** 把血缘闭包写进成员缓存（纯计算，无 IO）。 */
  private cacheLineage(windowKey: string, selfId: string, headers: readonly LineageHeader[]): void {
    const limit = this.opts.maxLineageMembers ?? 64
    const byId = new Map(headers.map(h => [h.id, h] as const))
    const entries = descendantsOf(headers, selfId)
      .slice(0, limit)
      .map(d => ({ id: d.sessionId, depth: d.depth, header: byId.get(d.sessionId) as unknown }))
      .filter(e => e.header !== undefined)
    this.lineageCache.set(windowKey, { at: this.opts.now?.() ?? Date.now(), entries })
  }

  /** 刷新血缘成员缓存（异步；失败静默——读数侧照旧标自身/降级）。 */
  private async refreshDescendants(windowKey: string): Promise<void> {
    if (this.lineageInFlight.has(windowKey)) return
    this.lineageInFlight.add(windowKey)
    try {
      const svc = this.lineageServices()
      if (svc === undefined) return
      const selfId = this.selfSessionId(windowKey)
      if (selfId === undefined) return
      const headers = await this.listHeaders(svc)
      if (headers === undefined) return
      this.cacheLineage(windowKey, selfId, headers)
    } catch {
      /* 血缘刷新失败：保留上一次已知集合；读侧照旧标降级 */
    } finally {
      this.lineageInFlight.delete(windowKey)
    }
  }

  /** 列出全部会话 header（`sessionPersistence.list()`；不可得 → undefined）。 */
  private async listHeaders(svc: { persistence: PersistenceLike }): Promise<LineageHeader[] | undefined> {
    try {
      const snapshots = await svc.persistence.list!()
      if (!Array.isArray(snapshots)) return undefined
      const out: LineageHeader[] = []
      for (const s of snapshots) {
        const header = (s as { header?: unknown }).header
        const id = (header as { id?: unknown } | undefined)?.id
        if (typeof id !== 'string' || id.length === 0) continue
        const h = header as { parentSession?: unknown; origin?: unknown; delegationDepth?: unknown }
        out.push({
          id,
          ...(typeof h.parentSession === 'string' ? { parentSession: h.parentSession } : {}),
          ...(h.origin === 'subagent' ? { origin: 'subagent' as const } : {}),
          ...(typeof h.delegationDepth === 'number' ? { delegationDepth: h.delegationDepth } : {}),
        })
      }
      return out
    } catch {
      return undefined
    }
  }

  /** 本窗口会话 id（agents.get(windowKey).session.id）。 */
  private selfSessionId(windowKey: string): string | undefined {
    try {
      const agents = this.opts.agents?.() as { get?: (id: string) => unknown } | undefined
      if (typeof agents?.get !== 'function') return undefined
      return readSessionId((agents.get(windowKey) as { session?: unknown } | undefined)?.session)
    } catch {
      return undefined
    }
  }

  /**
   * 同步读已知后代的用量（缓存命中零日志读）。未命中 → 记 degraded，并按预算**异步预热**（冷读后
   * 写回投影缓存，下一轮即可命中）；超出预算的成员本轮只标 `cold-read-budget`。
   */
  private readDescendantMembers(
    windowKey: string,
  ): { members: TokenSnapshotMember[]; degraded: string[]; overBudget: boolean } {
    const cached = this.lineageCache.get(windowKey)
    const svc = this.lineageServices()
    if (cached === undefined || svc === undefined) return { members: [], degraded: [], overBudget: false }
    const budget = this.opts.maxColdReads ?? 8
    const members: TokenSnapshotMember[] = []
    const degraded: string[] = []
    let cold = 0
    let overBudget = false
    for (const entry of cached.entries) {
      const snap = svc.cache.cachedSnapshot!(entry.header, ['tokenUsage'])
      const totals = readTokenTotals(snap?.values?.tokenUsage)
      if (totals === undefined) {
        degraded.push(entry.id)
        if (cold < budget) { cold += 1; void this.warmCold(svc, entry.header, entry.id) } else { overBudget = true }
        continue
      }
      const seq = typeof snap?.asOfSeq === 'number' ? snap.asOfSeq : undefined
      members.push({ sessionId: entry.id, depth: entry.depth, ...(seq === undefined ? {} : { seq }), totals })
    }
    return { members, degraded, overBudget }
  }

  /**
   * 冷读预热（异步、尽力而为、每个会话只试一次）：读该会话日志 → 交给投影缓存 `coldSnapshot`
   * （它会写回缓存行）→ 下一轮同步读即可命中。失败即放弃，该成员继续记 degraded（不补 0）。
   */
  private async warmCold(svc: { persistence: PersistenceLike; cache: ProjectionCacheLike }, header: unknown, id: string): Promise<void> {
    if (this.coldTried.has(id)) return
    this.coldTried.add(id)
    const open = svc.persistence.open
    if (typeof open !== 'function' || typeof svc.cache.coldSnapshot !== 'function') return
    try {
      const handle = (await open(id, 'read')) as {
        read?: () => Promise<{ events?: readonly unknown[] }>
        inheritedEventCount?: number
        close?: () => Promise<void>
        [Symbol.asyncDispose]?: () => Promise<void>
      }
      try {
        const res = await handle.read?.()
        svc.cache.coldSnapshot(header, handle.inheritedEventCount ?? 0, res?.events ?? [])
      } finally {
        if (typeof handle.close === 'function') await handle.close()
        else if (typeof handle[Symbol.asyncDispose] === 'function') await handle[Symbol.asyncDispose]!()
      }
    } catch {
      /* 冷读失败：缓存保持未命中，该成员继续标 degraded */
    }
  }

  /**
   * 活窗口的会话事件快照（REQ-261004222448-292a t-497311 · FR-6）。
   *
   * **读不到给 `undefined`，不给 `[]`**：`[]` 的语义是「读到了、就是空的」——
   * 两态混同会让「对话 Tab」把「读不到会话」渲染成「没有对话」，那正是本需求要修的诚实性缺陷。
   */
  snapshotEvents(windowKey: string): readonly unknown[] | undefined {
    const agents = this.opts.agents?.() as { get?: (id: string) => unknown } | undefined
    if (typeof agents?.get !== 'function') return undefined
    let session: unknown
    try {
      session = (agents.get(windowKey) as { session?: unknown } | undefined)?.session
    } catch {
      return undefined
    }
    const fn = (session as { snapshotEvents?: () => unknown } | undefined)?.snapshotEvents
    if (typeof fn !== 'function') return undefined
    try {
      const events = fn.call(session)
      return Array.isArray(events) ? events : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 冷会话的事件读法（FR-6 的第二条腿）：`sessionPersistence.open(id,'read')` → `read().events`。
   * 收尾一律 close / asyncDispose（照 `warmCold` 的配方，句柄不关会漏会话资源）；
   * 任何一步不可得/抛错 → `undefined`（**不抛错、不阻断**，与 tokenTotals 同款降级纪律）。
   */
  async readEvents(windowKey: string): Promise<readonly unknown[] | undefined> {
    const persistence = this.opts.sessionPersistence?.() as PersistenceLike | undefined
    const open = persistence?.open
    if (typeof open !== 'function') return undefined
    try {
      const handle = (await open(windowKey, 'read')) as {
        read?: () => Promise<{ events?: readonly unknown[] }>
        close?: () => Promise<void>
        [Symbol.asyncDispose]?: () => Promise<void>
      }
      try {
        const res = await handle.read?.()
        return Array.isArray(res?.events) ? res!.events : undefined
      } finally {
        if (typeof handle.close === 'function') await handle.close()
        else if (typeof handle[Symbol.asyncDispose] === 'function') await handle[Symbol.asyncDispose]!()
      }
    } catch {
      return undefined
    }
  }

  /**
   * 当轮上下文压力**参考**（REQ-261002175818-80a8 t4 / FR-8）——只读展示，**非门禁判据**。
   *
   * 为什么照抄 tokenTotals 的三级降级：这是同一个投影服务、同一种"取不到就是取不到"的处境，
   * 两条读数口径必须逐字一致，否则调用方要学两套缺失语义。token-meter 自述 contextPressure
   * 的字段刻意非原子（last-wins）且 "not a gating input"——所以缺席的字段**绝不补 0**：
   * 补 0 会让上游把"不可得"读成"余量充裕"。
   */
  contextPressure(windowKey: string): ContextPressureSnapshot {
    const now = this.opts.now?.() ?? Date.now()
    const unavailable = (): ContextPressureSnapshot => ({ at: now, source: 'unavailable' })
    const agents = this.opts.agents?.() as { get?: (id: string) => unknown } | undefined
    const projections = this.opts.sessionProjections?.() as
      { stateOf?: (session: unknown, kind: string) => unknown } | undefined
    if (typeof agents?.get !== 'function' || typeof projections?.stateOf !== 'function') return unavailable()
    let session: unknown
    try {
      session = (agents.get(windowKey) as { session?: unknown } | undefined)?.session
    } catch {
      return unavailable()
    }
    if (session === undefined || session === null) return unavailable()
    let state: unknown
    try {
      state = projections.stateOf(session, 'contextPressure')
    } catch {
      return unavailable()
    }
    const read = readContextPressure(state)
    if (read === undefined) return unavailable()
    return { at: now, ...read, source: 'projection' }
  }

  /** 某窗口"自 since 以来最后一次真实工具动作"的 workLike 计数；无痕迹表 → 0。 */
  toolActivitySince(windowKey: string, since: number): number {
    if (this.opts.toolTrace === undefined) return 0
    return toolActivitySince(this.opts.toolTrace, windowKey, since).workLike
  }

  /**
   * evidence 原文是否命中该窗口近期（withinMs 内）的真实用户消息。
   * 缓冲未注入 → undefined（核验通道不可用，调用方放行并标注"核验未启用"）；
   * 否则返回 {ok, reason}（REQ-47939a t6：保留搬迁前的失败原因文案）。
   */
  matchesRecentUserMessage(
    windowKey: string,
    evidence: string,
    withinMs: number,
  ): { ok: boolean; matchedText?: string; reason?: string } | undefined {
    void withinMs
    if (this.opts.recentUserMsgs === undefined) return undefined
    const now = this.opts.now?.() ?? Date.now()
    return evidenceMatchesRecentUserMsg(this.opts.recentUserMsgs, windowKey, evidence, now)
  }
}

// ---------------------------------------------------------------------------
// tokenUsage 投影解析（REQ-a33899 t2）——兼容两种状态形状：{totals:{...}} 包裹 或 直接四桶
// ---------------------------------------------------------------------------

function readBucketNumber(raw: unknown, key: string): number | undefined {
  const v = (typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined)
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** 从投影状态读四桶；缺任一桶/形状不符 → undefined（视为不可得，不猜 0）。 */
export function readTokenTotals(state: unknown): TokenBuckets | undefined {
  if (typeof state !== 'object' || state === null) return undefined
  const wrapped = (state as { totals?: unknown }).totals
  const src = (typeof wrapped === 'object' && wrapped !== null) ? wrapped : state
  const a = readBucketNumber(src, 'uncachedInputTokens')
  const o = readBucketNumber(src, 'outputTokens')
  const r = readBucketNumber(src, 'cacheReadTokens')
  const w = readBucketNumber(src, 'cacheWriteTokens')
  if (a === undefined || o === undefined || r === undefined || w === undefined) return undefined
  return { uncachedInputTokens: a, outputTokens: o, cacheReadTokens: r, cacheWriteTokens: w }
}

/**
 * 从 contextPressure 投影状态读三个参考量（REQ-261002175818-80a8 t4）。
 *
 * 口径（照 readTokenTotals 的"缺字段 → 视为不可得"）：每个字段独立判定，
 * **缺席就让它缺席**——只有整个状态形状不符（非对象 / 三字段一个都读不出数）才整体返回 undefined，
 * 由调用方落到 `source='unavailable'`。为什么不用 0 补齐：这读数会被展示给人看，
 * 补 0 与"真的 0"在展示层无法区分（R-013）。
 */
export function readContextPressure(state: unknown): {
  contextWindow?: number
  pressureTokens?: number
  projectedTokens?: number
} | undefined {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return undefined
  const src = state as Record<string, unknown>
  const contextWindow = readBucketNumber(src, 'contextWindow')
  const pressureTokens = readBucketNumber(src, 'pressureTokens')
  const projectedTokens = readBucketNumber(src, 'projectedTokens')
  if (contextWindow === undefined && pressureTokens === undefined && projectedTokens === undefined) return undefined
  return {
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(pressureTokens !== undefined ? { pressureTokens } : {}),
    ...(projectedTokens !== undefined ? { projectedTokens } : {}),
  }
}

/** 会话 id（缺省 → undefined）。 */
function readSessionId(session: unknown): string | undefined {
  const id = (session as { id?: unknown } | undefined)?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/** 会话日志序号（snapshotEvents 末条下标；不可得 → undefined）。 */
function readSessionSeq(session: unknown): number | undefined {
  const events = (session as { snapshotEvents?: () => unknown } | undefined)?.snapshotEvents
  if (typeof events !== 'function') return undefined
  try {
    const list = events.call(session) as unknown
    return Array.isArray(list) && list.length > 0 ? list.length - 1 : undefined
  } catch {
    return undefined
  }
}

