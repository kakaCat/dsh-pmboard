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
import { openTasksOf } from 'pm-core/domain/status/Predicates.js'
import type { RequirementRecord } from 'pm-core/protocol-domain.js'
import { goalPhaseOf, readyToCloseOf, goalsProgressOf, createGoal } from 'pm-goal'
import { STAGE_ARTIFACT_REQUIREMENTS } from 'pm-core/domain/artifact/ArtifactSpec.js'
import { PIPELINE_ORDER } from 'pm-core/domain/requirement/RollbackSpec.js'
import { HUMAN_ONLY_REQ_TRANSITIONS } from 'pm-core/domain/requirement/RequirementStatus.js'
import { STAGE_CHAIN } from 'pm-core/domain/prompt/chain.js'
import type { GoalBlockReason, GoalPhase, StageGoal } from 'pm-goal'
import type {
  AgentFacts, GoalRoundPorts, PreStepValidationInput,
} from 'pm-goal-round-driver/driver.js'

/** 适配器依赖（组合根手上现成的东西，逐条对应）。 */
export interface GoalRoundAdapterDeps {
  /** 同步窄投影（归属/可驱动/闭锁判据/回合计数）。 */
  peekFacts(): readonly RequirementFacts[]
  /** 台账整条读（阶段目标的陈述与判据）。 */
  getRequirement(id: string): Promise<RequirementRecord | undefined>
  /** 任务队列（ready 卡 + acceptance；goal 已不挂卡，读需求整条记录）。 */
  tasksOf(requirementId: string): Promise<readonly { id: string; status: string; acceptance?: string }[]>
  /** 既有投递器（与旧驱动同一份）。 */
  delivery: GoalRoundPorts['delivery']
  /** 耐久检查点（台账写队列排空）。 */
  checkpoint(): Promise<void>
  /** 准入计数落库（`>=` 守卫在实现侧）。 */
  persistAdmission(requirementId: string, round: number): void
  /** 建当前 goal（pm-goal；挂需求，一条需求一个）。 */
  createGoal(requirementId: string, objective: string): Promise<boolean> | boolean
  /** goal 落盘 block（pm-goal 的 `blockGoal`；故障语义的耐久半边）。 */
  blockGoal(requirementId: string, reason: GoalBlockReason): Promise<boolean> | boolean
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
  const open = openTasksOf(tasks)
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

      // 阶段目标：陈述/判据来自整条记录；进度用有界计数。
      const stageGoals = currentStageGoals(record)
      const currentStage = String(req.status ?? '')
      const current = stageGoals.find((g) => g.stage === currentStage)
      const progress = goalsProgressOf(stageGoals)
      const stageReady = await readyToCloseOf({ store: depsStoreOf(deps) }, req.id)

      // 2026-10-11（用户裁定）：阶段推进由**驱动**做，不写死在迁移/归档路径里 ——
      // 故这里把"阶段成没成"的**客观证据**与"能推到哪、是不是门"算成事实，交驱动决策。
      const requiredKinds = STAGE_ARTIFACT_REQUIREMENTS[currentStage as keyof typeof STAGE_ARTIFACT_REQUIREMENTS] ?? []
      const artifactKinds = new Set((record?.artifacts ?? []).map((a) => String((a as { kind?: unknown }).kind)))
      const stageEvidenceReady = requiredKinds.length > 0 && requiredKinds.every((k) => artifactKinds.has(k))
      const stageIdx = (PIPELINE_ORDER as readonly string[]).indexOf(currentStage)
      const nextStage = stageIdx >= 0 && stageIdx < PIPELINE_ORDER.length - 1 ? PIPELINE_ORDER[stageIdx + 1] : undefined
      const stageAdvance = nextStage === undefined
        ? undefined
        : { to: nextStage, humanGate: HUMAN_ONLY_REQ_TRANSITIONS.has(currentStage + '>' + nextStage) }

      const phase: GoalPhase | undefined = await goalPhaseOf({ store: depsStoreOf(deps) }, req.id)

      // 当前 goal 的身份/修订/上限（round-limit 闸与授权三元组的事实源）。
      // 上限缺省回落阶段上限（`roundLimitFor`）——goal 没显式设 cap 时，阶段上限就是它的 cap。
      const currentGoal = record?.goal
      const effectiveCap = currentGoal === undefined ? undefined : (currentGoal.maxGoalRounds ?? roundLimitFor(currentStage))

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
                // 本阶段开工序言（core 的阶段链事实）→ 驱动把它注入回合提示词
                ...(STAGE_CHAIN[currentStage as keyof typeof STAGE_CHAIN]?.entry === undefined
                  ? {}
                  : { stageEntry: STAGE_CHAIN[currentStage as keyof typeof STAGE_CHAIN]!.entry }),
                // 阶段推进**指令**的三条事实（推进本身由 agent 调 reqboard_move 或人经弹框完成，
                // 驱动只讲清楚"证据齐不齐 / 下一阶段是谁 / 是不是门"）：
                stageEvidenceReady,
                ...(stageAdvance === undefined
                  ? {}
                  : { stageNext: stageAdvance.to, stageNextIsHumanGate: stageAdvance.humanGate }),
              },
            }),
        goal: {
          windowKey,
          ...(phase === undefined ? {} : { phase }),
          ...(currentGoal === undefined ? {} : { goalId: currentGoal.id, goalRevision: currentGoal.revision, objective: currentGoal.objective }),
          ...(effectiveCap === undefined ? {} : { maxGoalRounds: effectiveCap }),
          stageReadyToClose: stageReady,
          // 本拍还有没有下一件事（ready 卡）：只决定"继续还是停手 / 这一拍做什么"，不是 goal 身份。
          // 卡的 acceptance **不进事实**（D-1：卡不做 objective）——objective 的唯一来源是下面的 stagePending。
          ...(next === undefined ? {} : { nextTaskId: next.id }),
          // 阶段目标：建 goal 的**目标来源**（表缺失 / 已落章都不给）。
          ...(current === undefined || current.state === 'done'
            ? {}
            : { stagePending: { stage: current.stage, statement: current.statement, doneCriteria: current.doneCriteria } }),
        },
        gates,
      }
      return facts
    },

    delivery: deps.delivery,
    createGoal: (requirementId, objective) => deps.createGoal(requirementId, objective),
    /**
     * goal 落盘 block（故障语义的耐久半边）：没有当前 goal → false（幂等：没东西可 block，不等于失败）。
     */
    async blockGoal(requirementId, reason) {
      const record = await deps.getRequirement(requirementId)
      if (record?.goal === undefined) return false
      return deps.blockGoal(requirementId, reason)
    },
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

/** 只读 store 端口（`readyToCloseOf` / `goalPhaseOf` 只需 `get`）。 */
function depsStoreOf(deps: GoalRoundAdapterDeps) {
  return { get: (id: string) => deps.getRequirement(id) } as never
}

export { isDiveRoundSource, roundLimitFor, createGoal }
