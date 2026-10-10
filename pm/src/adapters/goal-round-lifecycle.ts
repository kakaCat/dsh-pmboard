/**
 * goal 驱动的**生命周期**（订阅持有 / 心跳对账 / 阶段裁决 / teardown）——可脱离 cordis 单测。
 *
 * 【为什么与 Service 类分开】宿主 `Service` 基类要有真 cordis Context 才能实例化，逻辑塞在类里
 * 就没法单测；本文件是纯装配，`GoalRoundManager` 只做薄包装。
 *
 * 【与旧管理器同形的方法面】`roundDriver` / `teardown` / `subscriptionState` / `wakeTick`——
 * 组合根按开关二选一时不必改调用点。
 *
 * 【两条硬纪律（迁自旧管理器）】
 *   ① per-agent 订阅必须挂 **agent.ctx**（挂插件 ctx 会被作用域过滤器静默丢弃）；
 *   ② 拿不到可订阅的 ctx 要**响亮失败**（warn + 诊断日志 + 台账 comment 三者齐备）。
 *
 * @module dsh-pmboard/adapters/goal-round-lifecycle
 */
import { mutateIfPresent } from 'pm-core/application/use-cases/queue-access.js'
import { isOpenRequirement } from 'pm-core/domain/status/Predicates.js'
import { turnEndOutcome } from 'pm-core/application/internal/interruption.js'
import { captureDiag } from 'pm-core/application/internal/diag-log.js'
import type { RequirementFacts } from 'pm-core/domain/requirement/RequirementSummary.js'
import type { RequirementStore } from 'pm-core/application/ports.js'
import { createGoalRoundDriver } from 'pm-goal-round-driver/driver.js'
import type { GoalRoundDriver, GoalRoundPorts } from 'pm-goal-round-driver/driver.js'
import { wireGoalAgentSubscriptions, wireGoalRootSubscriptions } from 'pm-goal-round-driver/subscriptions.js'
import type { WireLogger } from 'pm-goal-round-driver/subscriptions.js'
import { createGoalHeartbeat } from 'pm-goal-round-driver/heartbeat.js'
import { proposeStageDone } from 'pm-goal-round-driver/stage-prompt.js'
import type { StagePromptFacts, StagePromptHistoryMap } from 'pm-goal-round-driver/stage-prompt.js'
import { wakeAcceptance } from 'pm-round-driver/wake-liveness.js'

/** 一 agent 一窗口键（与订阅层同口径：会话 id 即窗口键）。 */
function windowKeyOf(agent: unknown): string {
  const a = agent as { id?: unknown; session?: { id?: unknown } } | undefined
  return String(a?.session?.id ?? a?.id ?? 'unknown')
}

export interface GoalRoundLifecycleDeps {
  /** 驱动端口（由 `buildGoalRoundPorts` 适配；本层不碰台账读写的领域逻辑）。 */
  readonly ports: GoalRoundPorts
  /** 台账窄投影（归属解析 / 诊断 comment）。 */
  readonly peekFacts: () => readonly RequirementFacts[]
  /** 台账写（诊断 comment / lastWakeAt / 停手位）。 */
  readonly store: RequirementStore
  /** 受理校验用（死窗口叫不动）。 */
  readonly agents: { get(id: string): unknown | undefined }
  /** 阶段裁决弹框投递（缺省 = 只登记在途，不投框——如实降级，不假装弹过）。 */
  readonly ask?: (requirementId: string, question: string) => Promise<boolean>
  /** 登记"有人在等"（同步拦同拍起轮）。 */
  readonly enterAwaiting?: (requirementId: string) => void
  /** 弹框到顶留痕。 */
  readonly recordExhausted?: (requirementId: string) => void
  readonly now: () => number
  readonly providerLatchOpen?: () => boolean
  /** 心跳新鲜窗（毫秒；缺省 10 分钟）。 */
  readonly heartbeatFreshMs?: number
  readonly logger: WireLogger & { info(m: string): void }
}

export interface GoalRoundLifecycle {
  /** 与旧管理器同形：组合根/会话驱动取驱动句柄。 */
  roundDriver(): { onRequirementMoved: (id: string) => void }
  bindAgent(agent: unknown): void
  setStatusHandler(handler: (agent: unknown, status: unknown) => void): void
  subscriptionState(): { boundAgents: string[]; failures: string[] }
  startHeartbeat(intervalMs?: number): void
  wakeTick(): Promise<unknown>
  teardown(): Promise<void>
}

/** 组装生命周期（订阅 + 心跳 + 阶段裁决）。 */
export function createGoalRoundLifecycle(
  bus: { on?: (event: string, listener: (...args: unknown[]) => unknown) => (() => void) | void },
  deps: GoalRoundLifecycleDeps,
): GoalRoundLifecycle {
  const logger = deps.logger
  const agentOffs = new Map<string, () => void>()
  const boundAgents = new Set<string>()
  const failures: string[] = []
  const stageHistories: StagePromptHistoryMap = new Map()
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let statusHandler: ((agent: unknown, status: unknown) => void) | undefined
  let torn = false

  const driver: GoalRoundDriver = createGoalRoundDriver({
    ...deps.ports,
    // 阶段裁决（FR-8）：驱动只在"判据满足"时调一次；条件/在途/冷却/上限都在 stage-prompt 里判。
    askStageDone: (requirementId) => proposeStage(requirementId),
  })

  const heartbeat = createGoalHeartbeat({
    facts: () => deps.peekFacts().map((r) => ({
      id: r.id,
      armed: r.dive?.activation === 'armed',
      runtimePaused: r.dive?.driverHealth?.state === 'paused',
      ...(r.advance?.pausedReason === undefined ? {} : { advancePausedReason: r.advance.pausedReason }),
      ...(r.dive?.lastWakeAt === undefined ? {} : { lastWakeAt: r.dive.lastWakeAt }),
      ...(r.dive?.lastActiveAt === undefined ? {} : { lastActiveAt: r.dive.lastActiveAt }),
      // "有活"的判据：该需求还开着（终态需求不值得叫醒）。
      hasWork: isOpenRequirement(r as never),
    })),
    wake: async (id) => {
      const verdict = await wakeAcceptance({ store: deps.store, agents: deps.agents as never }, id)
      if (!verdict.accepted) {
        logger.warn('goal-round-wake [N-1] ' + (verdict.reason ?? '不受理'))
        return false
      }
      requestDriveFor(id)
      return true
    },
    markWoken: (id, at) => { void mutateIfPresent(deps.store, id, (r) => {
      if (r.dive === undefined) return undefined
      r.dive.lastWakeAt = at
      r.updatedAt = at
      return { changed: true }
    }).catch((err) => logger.warn('goal-round: 刷 lastWakeAt 失败（不冒泡）', err)) },
    markWakeFailed: (id, reason, at) => { void mutateIfPresent(deps.store, id, (r) => {
      if (r.dive === undefined || r.dive.driverHealth?.state === 'paused') return undefined
      // 只写健康位，**不改人的意图**（沿用既有纪律）。
      r.dive.driverHealth = { state: 'paused', reason }
      r.comments.push({
        id: 'c-goal-round-wake-' + at,
        body: '[goal-round] 连续叫不醒（' + reason + '）→ 写停手位；人恢复后自动续跑',
        createdAt: at, createdBy: { kind: 'system' },
      })
      r.updatedAt = at
      return { changed: true }
    }).catch((err) => logger.warn('goal-round: 写停手位失败（不冒泡）', err)) },
    trace: (reason, id) => captureDiag('[GOAL-ROUND] ' + reason + (id === undefined ? '' : ' req=' + id)),
    now: deps.now,
    ...(deps.providerLatchOpen === undefined ? {} : { latchOpen: deps.providerLatchOpen }),
    logger,
  }, { freshMs: deps.heartbeatFreshMs ?? 10 * 60 * 1000 })

  /** 需求 → 绑定窗口（台账 sourceSessionId）→ 请求驱动。 */
  function requestDriveFor(requirementId: string): void {
    const req = deps.peekFacts().find((r) => r.id === requirementId)
    const window = req?.sourceSessionId
    if (window === undefined) return
    void driver.requestDrive(window)
  }

  /** 阶段裁决：事实在本层算（阶段键 + 判据指纹），边界与重弹在 stage-prompt。 */
  async function proposeStage(requirementId: string): Promise<void> {
    const req = deps.peekFacts().find((r) => r.id === requirementId)
    if (req === undefined) return
    const facts: StagePromptFacts = {
      requirementId,
      stage: String(req.status ?? ''),
      stageReadyToClose: true,
      fingerprint: String(req.version) + ':' + String(req.goals?.done ?? 0) + '/' + String(req.goals?.total ?? 0),
    }
    await proposeStageDone({
      ask: async (_f, question) => (deps.ask === undefined ? false : deps.ask(requirementId, question)),
      enterAwaiting: (id) => deps.enterAwaiting?.(id),
      recordExhausted: (f) => deps.recordExhausted?.(f.requirementId),
      trace: (reason, id) => captureDiag('[GOAL-ROUND] ' + reason + (id === undefined ? '' : ' req=' + id)),
      now: deps.now,
      logger,
    }, stageHistories, facts)
  }

  function bindAgent(agent: unknown): void {
    if (agent === undefined || agent === null) return
    const id = windowKeyOf(agent)
    const agentCtx = (agent as { ctx?: { on?: unknown } }).ctx
    if (typeof agentCtx?.on !== 'function') {
      const reason = 'agent/created 提供的 agent 没有可订阅的 ctx——per-agent 订阅未成立，'
        + 'agent/status 收不到 ⇒ 驱动永不被唤醒（表现为人工门确认后不自动续跑）'
      failures.push(reason + ' [agent=' + id + ']')
      captureDiag('[WAKE-FAIL] ' + reason + ' agent=' + id)
      logger.warn(reason + '（agent=' + id + '）')
      commentOnWindow(id, '[goal-round-diag] ' + reason + '（agent=' + id + '）')
      return
    }
    const off = wireGoalAgentSubscriptions(agentCtx as never, agent, driver, {
      onStatus: (a, s) => {
        // [WAKE-RX]：收到的证明——把"事件没到"与"到了但驱动侧断"分开。
        captureDiag('[WAKE-RX] agent/status=' + String(s) + ' agent=' + windowKeyOf(a))
        statusHandler?.(a, s)
        if (s === 'idle') void driver.onIdle(windowKeyOf(a))
      },
      onDisposed: (a) => unbindAgent(a),
      onSessionEvent: (_session, event) => onSessionEvent(id, event),
    }, logger)
    agentOffs.set(id, off)
    boundAgents.add(id)
    captureDiag('[WAKE-OK] per-agent 订阅已注册到 agent.ctx agent=' + id)
  }

  /** 回合结束 → 准入 + 失败记账（收尾指令由**工具面**注入，见 tool-pm-goal/wrapup）。 */
  function onSessionEvent(windowKey: string, event: unknown): void {
    const e = event as { type?: string; data?: unknown } | undefined
    if (e?.type !== 'turn/end') return
    const outcome = turnEndOutcome(e.data)
    // 形态不认识（undefined）→ 按"未完成"记账（保守侧：宁可记一次失败，不谎报成功）。
    void driver.onTurnEnd(windowKey, { completed: outcome !== undefined && outcome.abnormal === false })
  }

  function unbindAgent(agent: unknown): void {
    const id = windowKeyOf(agent)
    const off = agentOffs.get(id)
    if (off === undefined) return
    agentOffs.delete(id)
    boundAgents.delete(id)
    driver.onAgentDisposed(id)
    try { off() } catch { /* 解绑失败不抛 */ }
  }

  function commentOnWindow(agentId: string, body: string): void {
    try {
      const req = deps.peekFacts().find((r) => r.sourceSessionId === agentId && isOpenRequirement(r as never))
      if (req === undefined) return
      void mutateIfPresent(deps.store, req.id, (r) => {
        r.comments.push({
          id: 'c-goal-round-diag-' + deps.now(), body,
          createdAt: deps.now(), createdBy: { kind: 'system' },
        })
        r.updatedAt = deps.now()
        return { changed: true }
      }).catch(() => { /* 诊断写入失败不影响主流程 */ })
    } catch { /* 诊断失败静默 */ }
  }

  function startHeartbeat(intervalMs = 60_000): void {
    if (heartbeatTimer !== undefined) return
    heartbeatTimer = setInterval(() => {
      void Promise.resolve(heartbeat.tick()).catch((err: unknown) => {
        logger.warn('goal-round: 心跳对账失败（不冒泡）', err)
      })
    }, intervalMs)
    const t = heartbeatTimer as unknown as { unref?: () => void }
    t.unref?.()
  }

  async function wakeTick(): Promise<unknown> { return heartbeat.tick() }

  async function teardown(): Promise<void> {
    // 幂等：重复 teardown 不得重复解绑（插件卸载与测试收尾都会各调一次）。
    if (torn) return
    torn = true
    if (heartbeatTimer !== undefined) { clearInterval(heartbeatTimer); heartbeatTimer = undefined }
    try { unsubscribeRoot() } catch { /* 解绑失败不抛 */ }
    for (const id of [...agentOffs.keys()]) {
      const off = agentOffs.get(id)
      agentOffs.delete(id)
      if (off !== undefined) { try { off() } catch { /* 解绑失败不抛 */ } }
    }
    boundAgents.clear()
    driver.teardown()
  }

  const unsubscribeRoot = wireGoalRootSubscriptions(bus as never, driver, logger, {
    onRequirementMoved: (id) => requestDriveFor(id),
    onAgentCreated: (agent) => bindAgent(agent),
  })
  startHeartbeat()

  return {
    roundDriver: () => ({ onRequirementMoved: (id) => requestDriveFor(id) }),
    bindAgent,
    setStatusHandler: (h) => { statusHandler = h },
    subscriptionState: () => ({ boundAgents: [...boundAgents], failures: [...failures] }),
    startHeartbeat,
    wakeTick,
    teardown,
  }
}
