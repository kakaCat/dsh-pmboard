/**
 * pm-goal-round-driver —— **以 goal 为基础**的回合驱动（替代 `pm-round-driver` 的驱动核心）。
 *
 * 分层：`types`（契约）→ `decide`（纯决策树）→ `invariant`（不变量）→ `prompt`（投递提示词）。
 * 本包零宿主依赖：闸判据、目标事实、投递都由端口/参数注入。
 *
 * 迁移说明（如实声明）：停手纪律（闭锁/退避/上游闸）与投递纪律（预留→投递→准入）从
 * `pm-round-driver` 迁入；`pm-round-driver` 在新包验收通过前**标记退役、暂不删除**。
 *
 * @module dsh-pmboard/goal-round
 */
export type {
  DecideInput, GateFacts, GoalFacts, RoundDecision, RoundRequirementFacts,
} from './types.js'
export { decideGoalRound } from './decide.js'
export {
  latchBlocks, setLatch, markLatchWritable, inBackoff, noteFailure, clearFailure,
  type HoldState, type LatchFacts, type LatchVerdict,
} from './hold.js'
export { actOnDecision, type ActPorts, type ActResult } from './act.js'
export {
  reserve, claim, discard, markStale, admit, release, deliverRound,
  type DeliveryPorts, type DeliveryState, type DeliverInput, type DeliverOutcome,
  type Reservation,
} from './admission.js'
export { checkDecisionInvariants, type DecisionViolation } from './invariant.js'
export { renderRoundPrompt, type RoundPromptInput } from './prompt.js'
export {
  wireGoalRootSubscriptions, wireGoalAgentSubscriptions, GOAL_ROOT_EVENTS, GOAL_AGENT_EVENTS, GOAL_ROUND_EVENTS,
  type EventBusLike, type WireLogger, type RootHandlers, type AgentEventHandlers,
} from './subscriptions.js'
export {
  planStagePrompt, proposeStageDone, stageDoneQuestion,
  STAGE_PROMPT_COOLDOWN_MS, STAGE_PROMPT_MAX_POPS,
  type StagePromptFacts, type StagePromptHistory, type StagePromptHistoryMap,
  type StagePromptPlan, type StagePromptPorts, type StagePromptResult,
} from './stage-prompt.js'
export {
  planWake, createGoalHeartbeat,
  type HeartbeatFacts, type HeartbeatPorts, type HeartbeatOptions, type HeartbeatTick, type WakePlan,
} from './heartbeat.js'
export {
  createGoalRoundDriver,
  type GoalRoundDriver, type GoalRoundPorts, type AgentFacts,
  type PreStepDecision, type PreStepValidationInput,
} from './driver.js'
