/**
 * goal 驱动的服务壳（继任 `ReqboardDiveManager` 的驱动半）。
 *
 * 【为什么另起一个服务】切换期要能回退：两个驱动不能同时挂在同一个 idle 拍上
 * （双驱动 = 双倍投递 + 互相打架），故由组合根按开关二选一。本类只做 cordis 包装——
 * 生命周期逻辑全在 `goal-round-lifecycle.ts`（可脱离 cordis 单测）。
 *
 * @module dsh-pmboard/adapters/goal-round-manager
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { createGoalRoundLifecycle, type GoalRoundLifecycle, type GoalRoundLifecycleDeps } from './goal-round-lifecycle.js'

export default class GoalRoundManager extends Service {
  static inject = ['agents', 'reqboard']

  private readonly lifecycle: GoalRoundLifecycle

  constructor(ctx: Context, deps: Omit<GoalRoundLifecycleDeps, 'logger'>) {
    super(ctx, 'goal-round-manager')
    const logger = ctx.logger('goal-round-manager')
    this.lifecycle = createGoalRoundLifecycle(ctx as never, {
      ...deps,
      logger: { info: (m) => logger.info(m), debug: (m) => logger.debug(m), warn: (m, e) => logger.warn(m, e) },
    })
    logger.info('GoalRound 服务已装配：root 2 路（requirement-moved / agent-created）+ per-agent 5 路（注册在 agent.ctx）')
  }

  /** 与旧管理器同形的方法面（组合根按开关二选一时无需改调用点）。 */
  roundDriver(): { onRequirementMoved: (id: string) => void } { return this.lifecycle.roundDriver() }

  attachSessionDriver(handler: (session: unknown, event: unknown) => void): (() => void) | undefined {
    const ctx = this.ctx as unknown as {
      on?: (event: string, listener: (session: unknown, event: unknown) => void) => (() => void) | void
    }
    return ctx.on?.('session/event', handler) ?? undefined
  }

  attachAgentStatus(handler: (agent: unknown, status: unknown) => void): (() => void) | undefined {
    this.lifecycle.setStatusHandler(handler)
    return () => { this.lifecycle.setStatusHandler(() => { /* 注销：置空处理器 */ }) }
  }

  subscriptionState(): { boundAgents: string[]; failures: string[] } { return this.lifecycle.subscriptionState() }
  startHeartbeat(intervalMs?: number): void { this.lifecycle.startHeartbeat(intervalMs) }
  async wakeTick(): Promise<unknown> { return this.lifecycle.wakeTick() }
  async teardown(): Promise<void> { await this.lifecycle.teardown() }
}
