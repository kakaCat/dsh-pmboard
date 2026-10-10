/**
 * goal 驱动拍的**决策树**（纯函数；对齐 sequenceDiagram「驱动拍内部」那张图）。
 *
 * 判定顺序（**顺序即纪律**，逐条都有事故来历）：
 *   ① 立项绑定？          未绑定 → hold（不是我这个窗口的需求）
 *   ② 可驱动？（人的意图 + 运行时健康 + advance 未告警）
 *   ③ 内存闭锁（当拍可信，先于一切台账判据）
 *   ④ 退避期内？
 *   ⑤ 进程级上游闸？
 *   ⑥ 人工门 / 弹框在途 → wait-human（等人不是故障：不写健康位、不改人的意图）
 *   ⑦ 起链预算闸
 *   ⑧ goal 相位：
 *        · undefined 且 stage 未达成 → 有 ready 卡 ⇒ create-goal；无 ready 卡 ⇒ hold
 *        · undefined 且 stage 已达成 → ask-stage-done
 *        · active → drive
 *        · paused/blocked → wait-human
 *        · complete → 与 undefined 同路（回判 stage：建下个 goal 或请人判）
 *
 * @module dsh-pmboard/goal-round/decide
 */
import type { DecideInput, RoundDecision } from './types.js'

const hold = (reason: string, requirementId?: string): RoundDecision =>
  requirementId === undefined ? { kind: 'hold', reason } : { kind: 'hold', reason, requirementId }

/** 闸阶段：返回"停手结论"或 undefined（= 放行到目标判定）。 */
function gateStop(input: DecideInput): RoundDecision | undefined {
  const req = input.requirement
  if (req === undefined) return hold('no-requirement')
  const g = input.gates
  if (!req.drivable) return hold('not-drivable', req.id)
  if (req.advancePausedReason !== undefined) return hold('advance-paused:' + req.advancePausedReason, req.id)
  if (g?.latchOpen === true) return hold('latch', req.id)
  if (g?.backoffUntil !== undefined && input.now < g.backoffUntil) return hold('backoff', req.id)
  if (g?.providerLatchOpen === true) return hold('provider-latch', req.id)
  if (g?.humanGateOpen === true) {
    return { kind: 'wait-human', requirementId: req.id, reason: g.humanGateReason ?? 'human-gate' }
  }
  if (g?.dialogInFlight === true) return { kind: 'wait-human', requirementId: req.id, reason: 'dialog-in-flight' }
  if (g?.chainBudgetAllowed === false) {
    return hold('chain-budget:' + (g.chainBudgetReason ?? 'unknown'), req.id)
  }
  return undefined
}

/** 目标阶段：按 goal 相位 + stage 达成分支。 */
function goalBranch(input: DecideInput): RoundDecision {
  const req = input.requirement!
  const goal = input.goal
  const phase = goal?.phase

  if (phase === 'active') return { kind: 'drive', requirementId: req.id }
  if (phase === 'paused' || phase === 'blocked') {
    return { kind: 'wait-human', requirementId: req.id, reason: 'goal-' + phase }
  }

  // phase === undefined | 'complete'：这件事做完了或还没有 goal → 由 stage 判下一步。
  if (goal?.stageReadyToClose === true) return { kind: 'ask-stage-done', requirementId: req.id }
  if (goal?.hasReadyTask !== true || goal.nextTaskId === undefined) {
    return hold('no-ready-task', req.id)
  }
  return {
    kind: 'create-goal',
    requirementId: req.id,
    taskId: goal.nextTaskId,
    // objective 缺省取卡片 acceptance（D-1：判据复用，不另编验收标准）；没有就留空串，
    // 由调用方（工具/建 goal 入口）决定是拒绝还是要求人补——决策层不编造目标。
    objective: goal.nextTaskAcceptance ?? '',
  }
}

/**
 * 一次驱动拍的唯一入口（纯函数：同输入必同输出，零 I/O）。
 *
 * `requirement.sourceSessionId` 与 `goal.windowKey` 的归属比对放在这里（① 立项绑定）：
 * 两侧都缺身份时**放行**（老装配口径），只有明确不等才拦。
 */
export function decideGoalRound(input: DecideInput): RoundDecision {
  const req = input.requirement
  if (req === undefined) return hold('no-requirement')
  if (input.goal?.windowKey !== undefined && req.sourceSessionId !== undefined
    && input.goal.windowKey !== req.sourceSessionId) {
    return hold('not-owner-window', req.id)
  }
  const stopped = gateStop(input)
  if (stopped !== undefined) return stopped
  return goalBranch(input)
}
