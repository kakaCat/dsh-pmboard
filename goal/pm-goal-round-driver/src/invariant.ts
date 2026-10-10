/**
 * 决策层的**不变量**（"驱动规则实现坏了"的判据；业务拒绝不算）。
 *
 *   INV-D1 只有 goal=active 才能 `drive`（第五道闸不得被绕过）；
 *   INV-D2 阶段已全达成时**不得**再建 goal（否则会出现"完成之后还在跑"）；
 *   INV-D3 任何 `hold` / `wait-human` 必须带 reason（响亮，不静默）；
 *   INV-D4 `create-goal` 必须带 taskId（不建无主 goal）。
 *
 * @module dsh-pmboard/goal-round/invariant
 */
import type { DecideInput, RoundDecision } from './types.js'

export interface DecisionViolation {
  readonly inv: 'INV-D1' | 'INV-D2' | 'INV-D3' | 'INV-D4'
  readonly message: string
}

/** 校验一次决策是否守住四条不变量（纯函数）。 */
export function checkDecisionInvariants(input: DecideInput, decision: RoundDecision): readonly DecisionViolation[] {
  const out: DecisionViolation[] = []
  const phase = input.goal?.phase

  if (decision.kind === 'drive' && phase !== 'active') {
    out.push({ inv: 'INV-D1', message: '非 active 相位却起轮：' + String(phase) })
  }
  if (decision.kind === 'create-goal' && input.goal?.stageReadyToClose === true) {
    out.push({ inv: 'INV-D2', message: '阶段已全达成却仍在建 goal（完成之后还在跑）' })
  }
  if ((decision.kind === 'hold' || decision.kind === 'wait-human') && decision.reason.trim() === '') {
    out.push({ inv: 'INV-D3', message: '停手却没有原因（静默停摆）' })
  }
  if (decision.kind === 'create-goal' && decision.taskId.trim() === '') {
    out.push({ inv: 'INV-D4', message: '建 goal 却没有 taskId' })
  }
  return out
}
