/**
 * 事件入口：把零件接成**一台驱动**（对齐宿主「一个状态机 + 两路订阅」的形态）。
 *
 * 两路订阅（与旧驱动同形，订阅生命周期由调用方持有）：
 *   · **idle 路**（`agent/status === idle`）→ `onIdle` 一拍：判据 → 决策 → 动作
 *   · **事件路**（inbox / session 事件）→ 认领、准入、回合收尾
 *
 * 每个 agent 一份内存态：`HoldState`（停手）+ `DeliveryState`（投递）+ 调度标志。
 * **不落盘**（落盘就退化成第二个台账，重新依赖 I/O —— 旧驱动的事故教训）。
 *
 * @module dsh-pmboard/goal-round/driver
 */
import { actOnDecision, type ActPorts } from './act.js'
import {
  admit, claim, deliverRound, discard, release,
  type DeliveryPorts, type DeliveryState,
} from './admission.js'
import { decideGoalRound } from './decide.js'
import {
  clearFailure, inBackoff, latchBlocks, noteFailure, setLatch,
  type HoldState, type LatchFacts,
} from './hold.js'
import { isDiveRoundSource } from 'pm-core/protocol-domain.js'
import { sameQueued } from 'pm-core/application/dive-core/round-state.js'
import { renderRoundPrompt } from './prompt.js'
import type { RoundPromptInput } from './prompt.js'
import type { GateFacts, GoalFacts, RoundDecision, RoundRequirementFacts } from './types.js'

/** 一次驱动拍要读的全部事实（一处分发，避免驱动到处伸手）。 */
export interface AgentFacts {
  readonly requirement?: RoundRequirementFacts
  readonly goal?: GoalFacts
  /** 闭锁解锁判据要读的台账事实。 */
  readonly latch: LatchFacts
  /** 外部闸（上游闩 / 人工门 / 弹框在途 / 预算）。 */
  readonly gates?: GateFacts
  /** 渲染提示词要用的阶段文案（statement / 判据 / 进度）。 */
  readonly stage?: Pick<RoundPromptInput, 'stageStatement' | 'doneCriteria' | 'stageProgress'>
  /** 台账当前 `dive.roundsInStage`（回合号权威计数）。 */
  readonly roundsInStage: number
  /** 需求 revision（CAS 令牌：投递预留记它，需求被别处改过即失效）。 */
  readonly revision: number
  /** 当前流程状态键（只作提示词展示用）。 */
  readonly status?: string
}

/** 前/后置栅栏的事实校验（重判据：fiber 是否 active、agent 是否存活、台账是否可驱动）。 */
export interface PreStepValidationInput {
  readonly agentId: string
  readonly content: unknown
  readonly source: {
    /** 消息源类型（宿主 `dive` 回合消息带它；缺了会被判成"不是本回合的消息"）。 */
    readonly kind?: string
    readonly requirementId: string
    readonly revision: number
    readonly round: number
  }
  /** 当前预留的快照（只读；校验方不得改）。 */
  readonly reservation: { readonly round: number; readonly revision: number; readonly phase: string }
}

export interface GoalRoundPorts {
  /**
   * 拍前取事实。`undefined` = 该 agent 无绑定需求（不是我这个窗口的活）。
   *
   * 允许 async：阶段目标的**陈述与判据**在台账整条记录里（`peekFacts` 的窄投影只带计数），
   * 同步缝里给不出——与 `humanGate` 的既有异步形态一致。
   */
  factsOf(agentId: string): AgentFacts | undefined | Promise<AgentFacts | undefined>
  /** 起轮投递的 I/O（见 admission）。 */
  delivery: DeliveryPorts
  /** 建 L2 目标。 */
  createTaskGoal(requirementId: string, taskId: string, objective: string): Promise<boolean> | boolean
  /** 触发"本阶段算完成吗"弹框。 */
  askStageDone(requirementId: string): Promise<void> | void
  /** 有界留痕（诊断面）。 */
  trace(reason: string, requirementId?: string): void
  /**
   * 前/后置栅栏的**事实校验**（缺省 = 只做本驱动可自证的结构校验）。
   *
   * 为什么做成端口：`roundReservationValid` 要读 fiber 状态、agent 存活、台账可驱动——
   * 这些事实**只有组合根有**（本包零宿主依赖）。缺省实现守住"预留/内容/回合号"三条，
   * 注入实现在此之上加"环境/台账"两条。
   */
  validateReservation?(input: PreStepValidationInput): { readonly valid: boolean; readonly reason?: string }
  now(): number
  logger: { info(m: string): void; debug(m: string): void; warn(m: string, err?: unknown): void }
}

/** `pre-step` 的裁决（与旧驱动同形）。 */
export type PreStepDecision =
  | { readonly kind: 'reject' }
  | { readonly kind: 'enter'; readonly messages: unknown[]; readonly startsRequestSeries?: true }

interface AgentState {
  hold: HoldState
  delivery: DeliveryState
  /** 合并触发：本拍被请求过（requirement-moved / requestDrive）。 */
  requested: boolean
  run?: Promise<void>
}

export interface GoalRoundDriver {
  onIdle(agentId: string): Promise<void>
  /** inbox 插入/认领：认领本回合的预留（逐字比对）。 */
  onInbox(agentId: string, message: unknown): void
  onInboxDiscarded(agentId: string): void
  /** 回合结束：准入计数 + 终态收尾。 */
  onTurnEnd(agentId: string, outcome: { readonly completed: boolean }): Promise<void>
  /**
   * agent 级错误（没有 turn/end 形态可用的那些）：按**瞬时**故障记账，同因达阈值才熔断。
   * 已被 turn/end 分类过（闭锁已置）→ **不覆盖更具体的原因**（实测时序：turn/end 先到、
   * agent-error 后到，覆盖会把"额度用尽"洗成泛化的 agent-error）。
   */
  onAgentError(agentId: string): void
  /** agent 处置：清该 agent 的内存态（订阅注销由订阅持有者负责）。 */
  onAgentDisposed(agentId: string): void
  /**
   * 进 step 前的**栅栏**：伪造/失效/重复的回合消息就地拒收，不留到运行期。
   * @returns reject = 不进本回合；enter = 放行（并标记 startsRequestSeries）
   */
  onPreStep(
    agentId: string, messages: unknown[], signal: { readonly aborted: boolean },
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision>
  /** 合并触发入口（requirement-moved / 看板唤醒）。 */
  requestDrive(agentId: string): Promise<void>
  teardown(): void
  whenQuiet(): Promise<void>
}

export function createGoalRoundDriver(ports: GoalRoundPorts): GoalRoundDriver {
  const states = new Map<string, AgentState>()
  const writes = new Set<Promise<unknown>>()
  let stopped = false

  const track = <T>(p: Promise<T>): Promise<T> => {
    writes.add(p as Promise<unknown>)
    const done = (): void => { writes.delete(p as Promise<unknown>) }
    p.then(done, done)
    return p
  }

  function stateFor(agentId: string): AgentState {
    const existing = states.get(agentId)
    if (existing !== undefined) return existing
    const s: AgentState = {
      hold: {}, delivery: { competingQueued: false, needsCheckpoint: false, stopping: false },
      requested: false,
    }
    states.set(agentId, s)
    return s
  }

  async function tick(agentId: string): Promise<void> {
    const state = stateFor(agentId)
    if (stopped || state.delivery.stopping) return
    const facts = await ports.factsOf(agentId)
    if (facts === undefined) return

    // 闭锁/退避在**闸之前**算好（它们不依赖任何 I/O，是"当拍可信"的那一层）。
    const latch = latchBlocks(state.hold, facts.latch)
    if (latch.released) ports.logger.info('goal-round: 内存闭锁解除（台账已显式复位为 healthy）')
    const gates: GateFacts = {
      ...facts.gates,
      ...(latch.blocked ? { latchOpen: true } : {}),
      ...(inBackoff(state.hold, ports.now()) ? { backoffUntil: state.hold.failure!.nextAt } : {}),
    }

    const input = {
      now: ports.now(),
      ...(facts.requirement === undefined ? {} : { requirement: facts.requirement }),
      gates,
      ...(facts.goal === undefined ? {} : { goal: facts.goal }),
    }
    const decision = decideGoalRound(input)

    const act: ActPorts = {
      drive: (requirementId) => driveRound(agentId, state, facts, requirementId),
      createTaskGoal: ports.createTaskGoal,
      askStageDone: ports.askStageDone,
      trace: ports.trace,
    }
    try {
      await actOnDecision(act, input, decision)
    } catch (err) {
      ports.logger.warn('goal-round: 动作失败 → 置闭锁（不冒泡）', err)
      setLatch(state.hold, 'driver-failed', String((err as Error)?.message ?? err), ports.now(), (s) => s.slice(0, 200))
      ports.trace('driver-failed', facts.requirement?.id)
    }

    // 阶段请人判 / 收口：不投回合，只留痕（弹框由 askStageDone 触发）。
    if (decision.kind === 'ask-stage-done' || decision.kind === 'ask-close') {
      ports.logger.info('goal-round: 阶段判据已满足 → 请人裁决（不起轮）')
    }
  }

  /** drive 分支的实做：渲染提示词 → 投递（预留→投递→准入）。 */
  async function driveRound(
    agentId: string, state: AgentState, facts: AgentFacts, requirementId: string,
  ): Promise<void> {
    // 提示词是**本包的纯函数**（不借端口）：同输入必同输出，内容不变量据此逐字比对。
    const text = renderRoundPrompt({
      requirementId,
      round: facts.roundsInStage + 1,
      status: facts.status ?? '',
      ...(facts.stage ?? {}),
      ...(facts.goal?.phase === undefined ? {} : { goalPhase: facts.goal.phase }),
      ...(facts.goal?.nextTaskId === undefined ? {} : { nextTaskId: facts.goal.nextTaskId }),
    })
    const outcome = await deliverRound(ports.delivery, state.delivery, {
      windowKey: agentId,
      requirementId,
      revision: facts.revision,
      roundsInStage: facts.roundsInStage,
      text,
    })
    if (outcome.kind === 'delivered') {
      ports.logger.debug('goal-round: 起轮（需求=' + requirementId + '，第 ' + outcome.reservation.round + ' 回合）')
      return
    }
    ports.logger.warn('goal-round: 投递未成功（' + outcome.kind + '）→ 置闭锁')
    setLatch(state.hold, outcome.kind, outcome.kind === 'deliver-failed' ? (outcome.reason ?? '') : '', ports.now(), (s) => s.slice(0, 200))
    ports.trace('deliver-failed:' + outcome.kind, requirementId)
  }

  return {
    async onIdle(agentId) {
      const state = stateFor(agentId)
      state.requested = false
      await tick(agentId)
    },

    onInbox(agentId, message) {
      const state = stateFor(agentId)
      const claimed = claim(state.delivery, message)
      // 非本回合的入队输入 → 让位（下一拍再投）。
      if (!claimed) state.delivery.competingQueued = true
    },

    onInboxDiscarded(agentId) {
      discard(stateFor(agentId).delivery)
    },

    async onTurnEnd(agentId, outcome) {
      const state = stateFor(agentId)
      if (outcome.completed) {
        clearFailure(state.hold)
        admit(state.delivery, ports.delivery)
      } else {
        const r = noteFailure(state.hold, 'turn-failed', ports.now())
        if (r.tripped) {
          setLatch(state.hold, 'turn-failed', '连续同因失败达阈值', ports.now(), (s) => s.slice(0, 200))
          ports.trace('breaker-tripped', undefined)
        }
      }
    },

    /**
     * 栅栏（对齐旧驱动 `onPreStep`）：**前校验 → 交下游 → 后校验**，任何一关不过即拒收，
     * 并把该预留**作废**（stale）——作废的预留永不计数。
     */
    async onPreStep(agentId, messages, signal, next) {
      const state = stateFor(agentId)
      const submitted = messages.find((m) => isDiveRoundSource((m as { source?: unknown } | undefined)?.source))
      if (submitted === undefined) return next()
      const content = (submitted as { content?: unknown }).content
      const source = (submitted as { source: { requirementId: string; revision: number; round: number } }).source
      const facts = await ports.factsOf(agentId)

      const validate = (): { valid: boolean; reason?: string } => {
        const a = state.delivery.attempt
        if (a === undefined) return { valid: false, reason: 'no-reservation' }
        if (a.phase !== 'claimed') return { valid: false, reason: 'not-claimed:' + a.phase }
        if (a.cancelled || a.stale) return { valid: false, reason: 'voided' }
        if (!sameQueued(content, source, a)) return { valid: false, reason: 'content-or-source-mismatch' }
        if (facts !== undefined && source.round !== facts.roundsInStage + 1) {
          return { valid: false, reason: 'round-not-next' }
        }
        return ports.validateReservation?.({
          agentId, content, source,
          reservation: { round: a.round, revision: a.revision, phase: a.phase },
        }) ?? { valid: true }
      }

      const voidReservation = (): void => {
        const a = state.delivery.attempt
        if (a !== undefined && a.round === source.round) a.stale = true
        state.delivery.attempt = undefined
      }

      const first = validate()
      if (!first.valid) {
        ports.logger.warn('goal-round: pre-step 拒收（' + (first.reason ?? 'invalid') + '）')
        voidReservation()
        ports.trace('pre-step-rejected:' + (first.reason ?? 'invalid'), facts?.requirement?.id)
        return { kind: 'reject' }
      }

      let decision: PreStepDecision
      try {
        decision = await next()
      } catch (err) {
        if (signal.aborted) throw err
        // 下游抛错：预留交回，让下一拍重投（不把一次异常变成永停）。
        state.delivery.attempt = undefined
        throw err
      }
      if (signal.aborted) return decision
      if (decision.kind === 'reject') {
        ports.logger.warn('goal-round: pre-step 被下游拒绝（prompt-rejected）→ 作废预留')
        voidReservation()
        ports.trace('prompt-rejected', facts?.requirement?.id)
        return decision
      }
      const second = validate()
      if (!second.valid) {
        ports.logger.warn('goal-round: pre-step 后校验失败（' + (second.reason ?? 'invalid') + '）')
        voidReservation()
        ports.trace('pre-step-rejected-post:' + (second.reason ?? 'invalid'), facts?.requirement?.id)
        return { kind: 'reject' }
      }
      return { ...decision, startsRequestSeries: true }
    },

    onAgentError(agentId) {
      const state = stateFor(agentId)
      // 已被 turn/end 分类过（闭锁已置）→ 不覆盖更具体的原因。
      if (state.hold.latch !== undefined) return
      const r = noteFailure(state.hold, 'agent-error', ports.now())
      if (!r.tripped) {
        ports.logger.warn('goal-round: agent 级错误（第 ' + r.failure.count + ' 次）→ 退避后重试')
        return
      }
      setLatch(state.hold, 'agent-error-loop', '连续 ' + r.failure.count + ' 次 agent 级错误', ports.now(), (x) => x.slice(0, 200))
      ports.trace('breaker-tripped:agent-error-loop', undefined)
      ports.logger.warn('goal-round: 连续 ' + r.failure.count + ' 次 agent 级错误 → 熔断停手')
    },

    onAgentDisposed(agentId) {
      states.delete(agentId)
    },

    async requestDrive(agentId) {
      const state = stateFor(agentId)
      if (stopped || state.delivery.stopping) return
      state.requested = true
      if (state.run !== undefined) return
      const run = (async () => {
        if (state.requested) await tick(agentId)
      })()
      state.run = run
      track(run)
      run.then(() => { state.run = undefined }, () => { state.run = undefined })
      await run
    },

    teardown() {
      stopped = true
      for (const s of states.values()) {
        s.delivery.stopping = true
        release(s.delivery)
      }
      states.clear()
    },

    async whenQuiet() {
      while (writes.size > 0) await Promise.allSettled([...writes])
    },
  }
}

export type { RoundDecision }
