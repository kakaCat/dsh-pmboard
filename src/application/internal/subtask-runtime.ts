/**
 * 子卡预算的**运行时状态**：正向子会话判据 + 按会话计数 + 独立停手位
 * （REQ-261007100513-6749 t5 返工 · P1/P2）。
 *
 * ## 为什么把「执法单位」与「汇报去向」拆开
 *
 * 旧实现把两者绑在一张卡上：先按 `executions[].sessionId === 子会话 id` 精确查表归属，
 * 查不到再用「父窗口下唯一一张 in_progress 卡」兜底，都查不到就**不计数**。
 * 实测（全仓 2202 条 `executions[].sessionId`）**100% 是 `session-*` 窗口码**，
 * 而子会话是 UUID（实测 253/365）⇒ 精确查表**永不命中**；只剩兜底，多卡并行（真实形态）
 * 一律落「未归属」⇒ **零计数、零效力**。所以本模块把执法**前移到一个不依赖归属的量**上：
 * **子会话**。只要认出「这是一个子会话」，到顶就停它——归属只决定汇报写到卡评论还是需求级评论。
 *
 * ## 正向子会话判据（**不再反向用 `isIgnoredSession`**）
 *
 * `isIgnoredSession` 把「带 `parentSession`」也算作子会话，而实测有 3 例 **fork 窗口**
 * （`origin=undefined` / `parentSession` 有 / `delegationDepth=0`）会被它误判 ⇒ fork 窗口的
 * 请求被计入预算。正向判据与 `domain/token/lineage.ts` 的 `isSubagent` **同口径**：
 * `header.origin === 'subagent' || delegationDepth > 0`（或，因为格式演进中两者未必同时在场），
 * 纯 fork 窗口（有 `parentSession` 但 depth 0、无 origin）**不算**；插件内部会话
 * （`session-reqboard-*`）显式排除。
 *
 * ## 计数为什么不落盘
 *
 * 子会话只活在**进程生命周期**里（重启后子会话已不存在）⇒ 跨重启的会话计数没有意义。
 * 落盘的仍是 `state/subtask-budget.json` 的**按卡**窗口（放行与审计所需的结论），
 * 由计数订阅器在归属可得时镜像写回。本模块零 IO，可脱离磁盘与时钟被单测逐条钉住。
 *
 * @module dsh-pmboard/application/internal/subtask-runtime
 */
import { LIMITS } from '../../domain/limits.js'
import type { SubtaskHaltRecord, SubtaskRuntimePort } from '../ports.js'
import { chargeRequest, openWindowWithLimit, type SubtaskBudgetWindow } from './subtask-budget.js'

/** 会话对象里本模块要读的最小形状（DSH `SessionHeader` 的子集；`meta` 是旧形态兜底）。 */
interface SessionLike {
  id?: unknown
  header?: { origin?: unknown; delegationDepth?: unknown; parentSession?: unknown }
  meta?: { origin?: unknown; delegationDepth?: unknown; parentSession?: unknown }
}

function headerOf(session: unknown): SessionLike['header'] {
  const s = session as SessionLike | undefined
  const h = s?.header ?? s?.meta
  return typeof h === 'object' && h !== null ? h : undefined
}

/**
 * **正向**子会话判据（见模块头）。`sessionId` 可不传（缺省读 `session.id`）。
 *
 * 三条依次判：插件内部会话排除 → `origin === 'subagent'` → `delegationDepth > 0`。
 * 无 header（普通窗口 / 事件形状异常）→ **不算**（宁可漏计也不误计：误计会把窗口自己的
 * 请求算进预算，直接停错人）。
 */
export function isSubtaskSession(session: unknown, sessionId?: string): boolean {
  const id = sessionId ?? (session as SessionLike | undefined)?.id
  if (typeof id === 'string' && id.startsWith('session-reqboard-')) return false
  const h = headerOf(session)
  if (h === undefined) return false
  if (h.origin === 'subagent') return true
  return typeof h.delegationDepth === 'number' && h.delegationDepth > 0
}

/** 子会话的父窗口码（归属兜底与诊断用；取不到 → undefined）。 */
export function parentSessionOf(session: unknown): string | undefined {
  const parent = headerOf(session)?.parentSession
  return typeof parent === 'string' && parent.length > 0 ? parent : undefined
}

/** 未归属会话的**作用域键**（与卡 id 不同空间：卡 id 形如 `t-xxxxxx`，本键带 `sess:` 前缀）。 */
export function sessionScopeKey(sessionId: string): string {
  return 'sess:' + sessionId
}

interface SessionEntry {
  taskId?: string
  window: SubtaskBudgetWindow
  lastAt: number
}

export interface SubtaskRuntimeOptions {
  /** 停手位有效期（毫秒）；缺省 = `LIMITS.budgetHaltTtlMs`。 */
  ttlMs?: number
  /** 进程内会话窗口条数上限；缺省 = `LIMITS.subtaskSessionWindowMax`。 */
  maxSessions?: number
}

/**
 * 内存实现（唯一实现，见 `SubtaskRuntimePort` 的契约）。三张表：
 * `sessions`（会话窗口 + 钉住的归属）、`halts`（**有效**停手位）、`entries`（每个作用域进入过几次）。
 *
 * 停手位的「过期/被清后可重新进入」由 `entries` 计数 + `halts` 的存在性共同表达：
 * 记录不在（过期被摘 / 被放行清掉）⇒ 下一次到顶**重新进入**并把 `reentries` +1——
 * 它是可重入状态，**不是** `reportedAt` 那种写完就再不复位的闸。
 */
export function createSubtaskRuntime(opts: SubtaskRuntimeOptions = {}): SubtaskRuntimePort {
  const ttlMs = opts.ttlMs ?? LIMITS.budgetHaltTtlMs
  const maxSessions = opts.maxSessions ?? LIMITS.subtaskSessionWindowMax
  const sessions = new Map<string, SessionEntry>()
  const halts = new Map<string, SubtaskHaltRecord>()
  const entries = new Map<string, number>()

  /** 过期即摘（惰性：读写停手位前都扫一遍，与人工门 in-flight 同款惰性过期口径）。 */
  const sweep = (at: number): void => {
    for (const [scope, halt] of halts) if (halt.expiresAt <= at) halts.delete(scope)
  }
  /** 会话表有界：超上限按 `lastAt` 淘汰最旧一条（只可能淘汰不再发请求的旧会话）。 */
  const evict = (): void => {
    while (sessions.size > maxSessions) {
      let oldest: string | undefined
      let oldestAt = Number.POSITIVE_INFINITY
      for (const [id, e] of sessions) if (e.lastAt < oldestAt) { oldestAt = e.lastAt; oldest = id }
      if (oldest === undefined) return
      sessions.delete(oldest)
    }
  }

  return {
    windowOfSession(sessionId) { return sessions.get(sessionId)?.window },
    taskOfSession(sessionId) { return sessions.get(sessionId)?.taskId },

    chargeSession(input) {
      const existing = sessions.get(input.sessionId)
      const base = existing?.window ?? input.inherit ?? openWindowWithLimit(input.limit, input.at)
      const charged = chargeRequest(base)
      const taskId = existing?.taskId ?? input.taskId
      sessions.set(input.sessionId, {
        ...(taskId === undefined ? {} : { taskId }),
        window: charged.window,
        lastAt: input.at,
      })
      evict()
      return {
        window: charged.window,
        exceeded: charged.exceeded,
        accepted: charged.accepted,
        overBy: charged.overBy,
        created: existing === undefined,
      }
    },

    applyRelease(taskId, next) {
      let affected = 0
      for (const [sessionId, entry] of sessions) {
        if (entry.taskId !== taskId) continue
        sessions.set(sessionId, { ...entry, window: next })
        affected += 1
      }
      return affected
    },

    enterHalt(input) {
      sweep(input.at)
      const existing = halts.get(input.scope)
      // 同一窗重复到顶 ⇒ 幂等命中（不重复汇报、不刷屏）；换窗/过期/被清 ⇒ 重新进入。
      if (existing !== undefined && existing.windowIndex === input.windowIndex) {
        return { entered: false, halt: existing }
      }
      const reentries = (entries.get(input.scope) ?? 0) + 1
      entries.set(input.scope, reentries)
      const halt: SubtaskHaltRecord = {
        ref: input.ref, scope: input.scope, sessionId: input.sessionId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.requirementId === undefined ? {} : { requirementId: input.requirementId }),
        windowIndex: input.windowIndex, since: input.at, expiresAt: input.at + ttlMs, reentries,
      }
      halts.set(input.scope, halt)
      return { entered: true, halt }
    },

    activeHalt(scope, at) { sweep(at); return halts.get(scope) },

    clearHaltsForTask(taskId, at) {
      sweep(at)
      let cleared = 0
      for (const [scope, halt] of halts) {
        if (halt.taskId !== taskId) continue
        halts.delete(scope)
        cleared += 1
      }
      return cleared
    },

    listHalts(at) { sweep(at); return [...halts.values()] },
  }
}
