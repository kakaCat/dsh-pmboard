/**
 * goal 流的**不变量**（对齐宿主 `@deepseek-ai/dsh-goal/src/invariant.ts`：
 * 宿主用独立折叠校验耐久事件流；本包把同一条纪律做成可单测的纯检查）。
 *
 * 【检查什么】折叠结果必须满足的不变量——违反即"规则实现坏了"，不是业务拒绝：
 *   INV-1 complete 是终态：`prev.phase==='complete'` 时任何事件都不得改动；
 *   INV-2 revision 单调：有效变更恰好 +1，无效变更**零变化**（幂等）；
 *   INV-3 blocked 必带非空原因；
 *   INV-4 身份稳定：`id` / `taskId` / `objective` 在非 create 事件中不得被改写。
 *
 * @module dsh-pmboard/goal/invariant
 */
import type { GoalFoldResult } from './fold.js'
import type { TaskGoal } from './types.js'

/** 一条不变量违反（人话；供测试与诊断面）。 */
export interface GoalInvariantViolation {
  readonly inv: 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4'
  readonly message: string
}

/**
 * 校验一次折叠是否守住不变量。
 * @param prev 折叠前的快照（可能 undefined）
 * @param res 折叠结果
 */
export function checkGoalInvariants(
  prev: TaskGoal | undefined,
  res: GoalFoldResult,
): readonly GoalInvariantViolation[] {
  const out: GoalInvariantViolation[] = []
  const next = res.next
  if (!res.changed) {
    // 无效变更必须**零变化**（同引用或同值；不得顺手 bump revision）。
    if (next !== prev && JSON.stringify(next) !== JSON.stringify(prev)) {
      out.push({ inv: 'INV-2', message: '无效变更却改动了快照（幂等被破坏）' })
    }
    return out
  }
  if (prev !== undefined && prev.phase === 'complete') {
    out.push({ inv: 'INV-1', message: 'complete 后仍发生变更（终态不可逆）' })
  }
  if (next === undefined) {
    out.push({ inv: 'INV-2', message: 'changed:true 却没有快照' })
    return out
  }
  if (prev !== undefined && next.revision !== prev.revision + 1) {
    out.push({ inv: 'INV-2', message: 'revision 未恰好 +1（' + prev.revision + ' → ' + next.revision + '）' })
  }
  // 结构化原因（对齐宿主 GoalBlockReason）：code 与 message 都必须非空。
  if (next.phase === 'blocked'
    && (next.blockedReason === undefined
      || next.blockedReason.code.trim() === '' || next.blockedReason.message.trim() === '')) {
    out.push({ inv: 'INV-3', message: 'blocked 缺结构化原因（code + message）' })
  }
  if (prev !== undefined
    && (next.id !== prev.id || next.taskId !== prev.taskId || next.objective !== prev.objective)) {
    out.push({ inv: 'INV-4', message: '身份字段被改写（id/taskId/objective 应稳定）' })
  }
  return out
}
