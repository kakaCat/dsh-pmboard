/**
 * **端口适配器**：把组合根手上的既有件（台账 / 任务队列 / 投递器 / 闸 / 弹框）装成
 * `pm-goal-round-driver` 的 `GoalRoundPorts`（新驱动的五处适配都在这里，驱动本身零宿主依赖）。
 *
 * 一句话分工：**驱动只认端口，谁有事实谁提供**——
 *   · 台账窄投影 → 归属/可驱动/闭锁判据/回合计数/阶段进度
 *   · 台账整条记录 → 阶段目标的**陈述与判据**（窄投影只带计数）
 *   · 任务队列 → ready 卡与它的 `acceptance`（"下一件事"的目标来源，D-1 判据复用）
 *   · pm-goal → 建/查任务目标；stage-prompt → 请人裁决；既有投递器 → 预留→投递→准入
 *
 * @module dsh-pmboard/adapters/goal-round-ports
 */
import {
  isDrivableRequirement,
  roundLimitFor,
  type RoundAttempt,
} from 'pm-core/application/dive-core/round-state.js'
import { isDiveRoundSource } from 'pm-core/protocol-domain.js'
import { roundReservationValid } from 'pm-core/application/dive-core/round-state.js'
import type { RequirementFacts } from 'pm-core/domain/requirement/RequirementSummary.js'
import type { RequirementRecord } from 'pm-core/protocol-domain.js'
import { goalPhaseOf, readyToCloseOf, goalsProgressOf, createTaskGoal } from 'pm-goal'
import type { GoalPhase, StageGoal } from 'pm-goal'
import type {
  AgentFacts, GoalRoundPorts, PreStepValidationInput,
} from 'pm-goal-round-driver/driver.js'

/** 适配器依赖（组合根手上现成的东西，逐条对应）。 */
export interface GoalRoundAdapterDeps {
  /** 同步窄投影（归属/可驱动/闭锁判据/回合计数）。 */
  peekFacts(): readonly RequirementFacts[]
  /** 台账整条读（阶段目标的陈述与判据）。 */
  getRequirement(id: string): Promise<RequirementRecord | undefined>
  /** 任务队列（ready 卡 + acceptance）。 */
  tasksOf(requirementId: string): Promise<readonly { id: string; status: string; acceptance?: string }[]>
  /** 既有投递器（与旧驱动同一份）。 */
  delivery: GoalRoundPorts['delivery']
  /** 耐久检查点（台账写队列排空）。 */
  checkpoint(): Promise<void>
  /** 准入计数落库（`>=` 守卫在实现侧）。 */
  persistAdmission(requirementId: string, round: number): void
  /** 建 L2 任务目标（pm-goal）。 */
  createTaskGoal(requirementId: string, taskId: string, objective: string): Promise<boolean> | boolean
  /** 阶段裁决弹框（stage-prompt.proposeStageDone）。 */
  askStageDone(requirementId: string): Promise<void> | void
  /** 有界留痕（诊断面）。 */
  trace(reason: string, requirementId?: string): void
  /** 外部闸（缺省 = 该闸未启用）。 */
  providerLatchOpen?: () => boolean
  humanGate?: (requirementId: string) => { open: boolean; reason?: string } | Promise<{ open: boolean; reason?: string }>
  dialogInFlight?: (requirementId: string) => boolean
  chainBudget?: (requirementId: string) => { allowed: boolean; reason?: string }
  /** 栅栏的环境判据（fiber / agent 存活）。 */
  fiberActive(): boolean
  agentLive(windowKey: string): boolean
  now(): number
  logger: { info(m: string): void; debug(m: string): void; warn(m: string, err?: unknown): void }
}

/** 阶段序列里"当前阶段"之后的下一段（收口判据与进度展示用；不在序列中则 undefined）。 */
function currentStageGoals(record: RequirementRecord | undefined): readonly StageGoal[] {
  return record?.goals ?? []
}

/** 有开着的卡就取第一张（队列顺序 = 执行顺序；`running` 优先）。 */
function pickNextTask(
  tasks: readonly { id: string; status: string; acceptance?: string }[],
): { id: string; acceptance?: string } | undefined {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'canceled')
  return open.find((t) => t.status === 'running') ?? open[0]
}

/** 组装新驱动的端口。 */
export function buildGoalRoundPorts(deps: GoalRoundAdapterDeps): GoalRoundPorts {
  return {
    async factsOf(windowKey) {
      const req = deps.peekFacts().find((r) => r.sourceSessionId === windowKey)
      if (req === undefined) return undefined
      const record = await deps.getRequirement(req.id)
      const tasks = await deps.tasksOf(req.id)
      const next = pickNextTask(tasks)

      // 阶段目标（L1）：陈述/判据来自整条记录；进度用有界计数。
      const stageGoals = currentStageGoals(record)
      const currentStage = String(req.status ?? '')
      const current = stageGoals.find((g) => g.stage === currentStage)
      const progress = goalsProgressOf(stageGoals)
      const stageReady = await readyToCloseOf({ store: depsStoreOf(deps) }, req.id)

      const phase: GoalPhase | undefined = await goalPhaseOf({ taskStore: depsTaskStoreOf(tasks) }, req.id)

      // 闸：人工门与预算判据是异步/现算的，**先算齐再建事实**（事实是只读契约，不能后补键）。
      let humanGateOpen = false
      let humanGateReason: string | undefined
      try {
        const gate = await deps.humanGate?.(req.id)
        if (gate?.open === true) { humanGateOpen = true; humanGateReason = gate.reason }
      } catch (err) {
        deps.logger.warn('goal-round-adapter: 人工门判据抛错（本拍按门关处理）', err)
      }
      let budgetBlocked = false
      let budgetReason: string | undefined
      try {
        const budget = deps.chainBudget?.(req.id)
        if (budget !== undefined && !budget.allowed) { budgetBlocked = true; budgetReason = budget.reason }
      } catch (err) {
        deps.logger.warn('goal-round-adapter: 预算判据抛错（本拍按放行处理）', err)
      }
      const gates = {
        ...(deps.providerLatchOpen?.() === true ? { providerLatchOpen: true } : {}),
        ...(deps.dialogInFlight?.(req.id) === true ? { dialogInFlight: true } : {}),
        ...(humanGateOpen ? { humanGateOpen: true } : {}),
        ...(humanGateReason === undefined ? {} : { humanGateReason }),
        ...(budgetBlocked ? { chainBudgetAllowed: false } : {}),
        ...(budgetReason === undefined ? {} : { chainBudgetReason: budgetReason }),
      }

      const facts: AgentFacts = {
        requirement: {
          id: req.id,
          ...(req.sourceSessionId === undefined ? {} : { sourceSessionId: req.sourceSessionId }),
          drivable: isDrivableRequirement(req as never),
          ...(req.advance?.pausedReason === undefined ? {} : { advancePausedReason: req.advance.pausedReason }),
        },
        latch: {
          requirementPresent: true,
          ...(req.dive?.activation === undefined ? {} : { activation: req.dive.activation }),
          ...(req.dive?.driverHealth?.state === undefined ? {} : { driverHealthState: req.dive.driverHealth.state }),
        },
        roundsInStage: req.dive?.roundsInStage ?? 0,
        revision: req.version,
        status: currentStage,
        ...(current === undefined && progress === undefined
          ? {}
          : {
              stage: {
                ...(current === undefined ? {} : { stageStatement: current.statement, doneCriteria: current.doneCriteria }),
                ...(progress === undefined ? {} : { stageProgress: progress }),
              },
            }),
        goal: {
          windowKey,
          ...(phase === undefined ? {} : { phase }),
          stageReadyToClose: stageReady,
          hasReadyTask: next !== undefined,
          ...(next === undefined ? {} : { nextTaskId: next.id }),
          ...(next?.acceptance === undefined ? {} : { nextTaskAcceptance: next.acceptance }),
        },
        gates,
      }
      return facts
    },

    delivery: deps.delivery,
    createTaskGoal: (requirementId, taskId, objective) => deps.createTaskGoal(requirementId, taskId, objective),
    askStageDone: (requirementId) => deps.askStageDone(requirementId),
    trace: (reason, requirementId) => deps.trace(reason, requirementId),

    /**
     * 栅栏的环境判据：本包补 fiber / agent 存活两条（预留/内容/回合号三条由驱动自证）。
     * 与旧驱动 `roundReservationValid` 同口径——不是新发明。
     */
    validateReservation(input: PreStepValidationInput) {
      const req = deps.peekFacts().find((r) => r.id === input.source.requirementId)
      const attempt = {
        requirementId: input.source.requirementId,
        revision: input.reservation.revision,
        round: input.reservation.round,
        messageId: '',
        content: input.content,
        phase: input.reservation.phase as RoundAttempt['phase'],
        cancelled: false,
        stale: false,
      } satisfies RoundAttempt
      const ok = roundReservationValid({
        state: { attempt, agent: undefined, competingQueued: false, needsCheckpoint: false, requested: false, stopping: false } as never,
        content: input.content,
        source: input.source as never,
        req: req as never,
        fiberActive: deps.fiberActive(),
        agentLive: deps.agentLive(input.agentId),
      })
      return ok ? { valid: true } : { valid: false, reason: 'env-or-ledger-fence' }
    },

    now: deps.now,
    logger: deps.logger,
  }
}

/** 只读 store 端口（`readyToCloseOf` 只需 `get`）。 */
function depsStoreOf(deps: GoalRoundAdapterDeps) {
  return { get: (id: string) => deps.getRequirement(id) } as never
}

/** 只读任务端口（`goalPhaseOf` 只需 `listByRequirement`）。 */
function depsTaskStoreOf(tasks: readonly { id: string; status: string; acceptance?: string }[]) {
  return {
    // 投影要**带 goal**：goalPhaseOf 读的就是它（漏掉它会永远判"没有 goal"）。
    listByRequirement: async (_id: string) =>
      tasks.map((t) => ({ id: t.id, status: t.status, goal: (t as { goal?: unknown }).goal })),
  } as never
}

export { isDiveRoundSource, roundLimitFor, createTaskGoal }
