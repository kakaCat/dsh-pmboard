/**
 * Dive 的**事件接线**（REQ-260926215013-1568 T-5 · serves: FR-1/2/5/6/9/11）；
 * REQ-261001213924-1441 FR-3 起按**作用域**拆成两组：

 * ── 为什么必须拆 ─────────────────────────────────────────────────────────────────
 * cordis 派发按**发射方的作用域载体**过滤监听器（cordis/lib/index.js:263：
 * `hook.global || !filter || filter(thisArg, hook.ctx)`），而 dsh-scope 的过滤器只放行
 * **未打标签的 ctx** 或**处于发射方作用域链上的 ctx**（packages/core/scope/src/index.ts:170-181）。
 * agent 主题事件（agent/status、pre-step、inbox/*、error、disposed）都在 **agent 自己的作用域**里派发
 * （agent-loop/src/agent.ts:129,150），因此把它们挂在**插件 ctx** 上会被过滤掉——一条都收不到，
 * 且失败是静默的（表现为「人工门确认后不自动续跑」）。
 *
 * 宿主的插件开发规范写明正确做法（cordis-plugin-development/references/practices.md:19）：
 * **在 `agent/created` 里拿到 agent，再把 per-agent 行为注册到 `agent.ctx`**。本模块照此拆分：
 *   · root 组：reqboard/requirement-moved（自发事件，无作用域载体）+ agent/created（拿句柄的入口）；
 *   · per-agent 组：其余六类，注册到 agent.ctx，随 agent 处置或插件卸载注销。
 *
 * @module dsh-pmboard/application/dive/round-subscriptions
 */
import type { DiveRoundDriver } from './round-driver.js'

export interface EventBusLike {
  on?: (event: string, listener: (...args: unknown[]) => unknown) => (() => void) | void
}
export interface WireLogger {
  debug(message: string): void
  warn(message: string, err?: unknown): void
}

/** root 组：挂在插件 ctx 上的两路（自发事件 + per-agent 入口）。 */
export const DIVE_ROOT_EVENTS: readonly string[] = ['reqboard/requirement-moved', 'agent/created']

/** per-agent 组：必须注册到 `agent.ctx`，否则被作用域过滤器丢弃。 */
export const DIVE_AGENT_EVENTS: readonly string[] = [
  'agent/status',
  'agent/pre-step',
  'agent/inbox/inserted',
  'agent/inbox/claimed',
  'agent/inbox/discarded',
  'agent/error',
  'agent/disposed',
]

/** 旧名（既有调用方/测试用）：root 组 + per-agent 组的旧全集快照。 */
export const DIVE_ROUND_EVENTS: readonly string[] = [...DIVE_ROOT_EVENTS, ...DIVE_AGENT_EVENTS]

function agentOf(payload: unknown): unknown {
  return (payload as { agent?: unknown } | undefined)?.agent
}
function messageOf(payload: unknown): unknown {
  return (payload as { message?: unknown } | undefined)?.message
}

/** 订阅一个事件；失败按「响亮」留痕（不静默降级）。返回是否成立。 */
function sub(
  bus: EventBusLike,
  event: string,
  listener: (...args: unknown[]) => unknown,
  logger: WireLogger,
  offs: Array<() => void>,
  scope: string,
): boolean {
  let off: (() => void) | void
  try {
    off = bus.on?.(event, listener)
  } catch (err) {
    logger.warn(scope + ' 订阅 ' + event + ' 抛错——该路径静默停摆', err);
    return false
  }
  if (typeof off === 'function') {
    offs.push(off)
    logger.debug(scope + ' 订阅 ' + event + ' ok');
    return true
  }
  logger.warn(scope + ' 订阅 ' + event + ' 未成立（宿主未提供 ctx.on / 未返回解绑函数）——该路径静默停摆');
  return false
}

/**
 * root 组接线：**只**订阅 `reqboard/requirement-moved` 与 `agent/created`。
 * `agent/created` 命中时把 agent 交给 `onAgentCreated`（组合根/管理器据此注册 per-agent 组）。
 */
export function wireDiveRoundSubscriptions(
  bus: EventBusLike,
  driver: DiveRoundDriver,
  logger: WireLogger,
  onAgentCreated?: (agent: unknown) => void,
): () => void {
  const offs: Array<() => void> = []
  sub(bus, 'reqboard/requirement-moved', (payload) => {
    driver.onRequirementMoved(String((payload as { requirementId?: unknown } | undefined)?.requirementId ?? ''))
  }, logger, offs, 'dive-manager[root]')
  sub(bus, 'agent/created', (payload) => { onAgentCreated?.(agentOf(payload)) }, logger, offs, 'dive-manager[root]')
  return () => {
    for (const off of offs) {
      try { off() } catch { /* 解绑失败不抛 */ }
    }
  }
}

/** per-agent 组处理端口（status 由会话驱动器消费，disposed 由管理器注销用）。 */
export interface AgentEventHandlers {
  onStatus?: (agent: unknown, status: unknown) => void
  onDisposed?: (agent: unknown) => void
}

/**
 * per-agent 组接线：把六类 agent 事件注册到 **agent.ctx**（不是插件 ctx）。
 * 返回合并解绑函数——由调用方在 agent/disposed 与插件卸载时各调一次（幂等）。
 */
export function wireAgentSubscriptions(
  agentCtx: EventBusLike,
  agent: unknown,
  driver: DiveRoundDriver,
  handlers: AgentEventHandlers,
  logger: WireLogger,
): () => void {
  const offs: Array<() => void> = []
  sub(agentCtx, 'agent/status', (payload) => {
    const p2 = (payload ?? {}) as { agent?: unknown; status?: unknown }
    handlers.onStatus?.(p2.agent ?? agent, p2.status)
  }, logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/pre-step', (payload, next) => {
    const p2 = (payload ?? {}) as { agent?: unknown; messages?: unknown[]; signal?: unknown }
    return driver.onPreStep(p2.agent ?? agent, p2.messages ?? [], p2.signal as never, next as never)
  }, logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/inbox/inserted', (payload) => driver.onInboxInserted(agentOf(payload) ?? agent, messageOf(payload)), logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/inbox/claimed', (payload) => driver.onInboxClaimed(agentOf(payload) ?? agent, messageOf(payload)), logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/inbox/discarded', (payload) => driver.onInboxDiscarded(agentOf(payload) ?? agent, messageOf(payload)), logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/error', (payload) => driver.onAgentError(agentOf(payload) ?? agent), logger, offs, 'dive-manager[agent]')
  sub(agentCtx, 'agent/disposed', (payload) => {
    const a = agentOf(payload) ?? agent
    driver.onAgentDisposed(a)
    handlers.onDisposed?.(a)
  }, logger, offs, 'dive-manager[agent]')
  return () => {
    for (const off of offs) {
      try { off() } catch { /* 解绑失败不抛 */ }
    }
  }
}
