/**
 * 事件接线（**订阅持有**）：一个状态机 + **两路订阅**（对齐宿主 goal-round-driver 的形态，
 * 并按本仓既有纪律按**作用域**分组）。
 *
 * ── 为什么要按作用域拆（本仓踩过的静默故障）───────────────────────────────
 * cordis 派发按**发射方的作用域载体**过滤监听器；而 agent 主题事件（`agent/status`、
 * `agent/inbox/*`…）都在 **agent 自己的作用域**里派发——把它们挂在**插件 ctx** 上会被过滤掉，
 * **一条都收不到，且失败是静默的**（表现为"人工门确认后不自动续跑"）。
 * 正确做法（宿主插件开发规范）：在 `agent/created` 里拿到 agent，再把 per-agent 行为注册到 `agent.ctx`。
 *
 * 因此本模块分两组：
 *   · root 组（插件 ctx）：`reqboard/requirement-moved`（自发事件）+ `agent/created`（拿句柄的入口）
 *   · per-agent 组（agent.ctx）：`agent/status` / `agent/inbox/{inserted,claimed,discarded}`
 *     / `session/event`，随 agent 处置或插件卸载注销
 *
 * @module dsh-pmboard/goal-round/subscriptions
 */
import type { GoalRoundDriver } from './driver.js'

export interface EventBusLike {
  on?: (event: string, listener: (...args: unknown[]) => unknown) => (() => void) | void
}
export interface WireLogger {
  debug(message: string): void
  warn(message: string, err?: unknown): void
}

/** root 组：挂在插件 ctx 上的两路。 */
export const GOAL_ROOT_EVENTS: readonly string[] = ['reqboard/requirement-moved', 'agent/created']

/** per-agent 组：必须注册到 `agent.ctx`，否则被作用域过滤器丢弃。 */
export const GOAL_AGENT_EVENTS: readonly string[] = [
  'agent/status',
  'agent/inbox/inserted',
  'agent/inbox/claimed',
  'agent/inbox/discarded',
  'session/event',
]

/** 全集快照（测试与注册日志用）。 */
export const GOAL_ROUND_EVENTS: readonly string[] = [...GOAL_ROOT_EVENTS, ...GOAL_AGENT_EVENTS]

function agentOf(payload: unknown): unknown { return (payload as { agent?: unknown } | undefined)?.agent }
function messageOf(payload: unknown): unknown { return (payload as { message?: unknown } | undefined)?.message }
function sessionOf(payload: unknown): unknown { return (payload as { session?: unknown } | undefined)?.session }

/** agent 的稳定键（本驱动按 agentId 建内存态）。 */
function agentKeyOf(agent: unknown): string | undefined {
  const a = agent as { id?: unknown; session?: { id?: unknown } } | undefined
  if (typeof a?.id === 'string' && a.id.length > 0) return a.id
  const sid = a?.session?.id
  return typeof sid === 'string' && sid.length > 0 ? sid : undefined
}

/** 订阅一个事件；失败按「响亮」留痕（不静默降级）。返回是否成立。 */
function sub(
  bus: EventBusLike, event: string, listener: (...args: unknown[]) => unknown,
  logger: WireLogger, offs: Array<() => void>, scope: string,
): boolean {
  let off: (() => void) | void
  try {
    off = bus.on?.(event, listener)
  } catch (err) {
    logger.warn(scope + ' 订阅 ' + event + ' 抛错——该路径静默停摆', err)
    return false
  }
  if (typeof off === 'function') {
    offs.push(off)
    logger.debug(scope + ' 订阅 ' + event + ' ok')
    return true
  }
  logger.warn(scope + ' 订阅 ' + event + ' 未成立（宿主未提供 ctx.on / 未返回解绑函数）——该路径静默停摆')
  return false
}

const offAll = (offs: readonly (() => void)[]): void => {
  for (const off of offs) {
    try { off() } catch { /* 解绑失败不抛 */ }
  }
}

/**
 * root 组接线：`requirement-moved` → 请求驱动；`agent/created` → 交给调用方注册 per-agent 组。
 * @returns 合并解绑函数（插件卸载时调用）
 */
export interface RootHandlers {
  /**
   * 需求移动信号。**"需求 → 绑定窗口"的解析属组合根**（本包不认识台账/窗口表），
   * 故以回调注入，而不是让驱动自己去查。
   */
  onRequirementMoved?: (requirementId: string) => void
  /** `agent/created` 命中 → 调用方据此注册 per-agent 组。 */
  onAgentCreated?: (agent: unknown) => void
}

export function wireGoalRootSubscriptions(
  bus: EventBusLike, _driver: GoalRoundDriver, logger: WireLogger,
  handlers: RootHandlers = {},
): () => void {
  const offs: Array<() => void> = []
  sub(bus, 'reqboard/requirement-moved', (payload) => {
    const id = String((payload as { requirementId?: unknown } | undefined)?.requirementId ?? '')
    if (id.length === 0) return
    // 需求移动 → 交回调（组合根解析绑定窗口后再调 driver.requestDrive(窗口)）。
    handlers.onRequirementMoved?.(id)
  }, logger, offs, 'goal-round[root]')
  sub(bus, 'agent/created', (payload) => { handlers.onAgentCreated?.(agentOf(payload)) }, logger, offs, 'goal-round[root]')
  return () => offAll(offs)
}

export interface AgentEventHandlers {
  /** `agent/status` 由调用方消费（本驱动只在 idle 拍动）。 */
  onStatus?: (agent: unknown, status: unknown) => void
  onDisposed?: (agent: unknown) => void
  /** `session/event`（回合结束在其中）。 */
  onSessionEvent?: (session: unknown, event: unknown) => void
}

/**
 * per-agent 组接线：把四类 agent 事件 + session/event 注册到 **agent.ctx**（不是插件 ctx）。
 * @returns 合并解绑函数（由调用方在 `agent/disposed` 与插件卸载时各调一次，幂等）
 */
export function wireGoalAgentSubscriptions(
  agentCtx: EventBusLike, agent: unknown, driver: GoalRoundDriver,
  handlers: AgentEventHandlers, logger: WireLogger,
): () => void {
  const offs: Array<() => void> = []
  const key = (payload: unknown): string | undefined => agentKeyOf(agentOf(payload) ?? agent)

  sub(agentCtx, 'agent/status', (payload) => {
    const p = (payload ?? {}) as { agent?: unknown; status?: unknown }
    handlers.onStatus?.(p.agent ?? agent, p.status)
  }, logger, offs, 'goal-round[agent]')

  sub(agentCtx, 'agent/inbox/inserted', (payload) => {
    const id = key(payload)
    if (id !== undefined) driver.onInbox(id, messageOf(payload))
  }, logger, offs, 'goal-round[agent]')

  sub(agentCtx, 'agent/inbox/claimed', (payload) => {
    const id = key(payload)
    if (id !== undefined) driver.onInbox(id, messageOf(payload))
  }, logger, offs, 'goal-round[agent]')

  sub(agentCtx, 'agent/inbox/discarded', (payload) => {
    const id = key(payload)
    if (id !== undefined) driver.onInboxDiscarded(id)
  }, logger, offs, 'goal-round[agent]')

  sub(agentCtx, 'session/event', (payload) => {
    handlers.onSessionEvent?.(sessionOf(payload) ?? payload, (payload as { event?: unknown } | undefined)?.event)
  }, logger, offs, 'goal-round[agent]')

  return () => offAll(offs)
}
