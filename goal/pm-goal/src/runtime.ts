/**
 * 运行时构造器与协议常量（对齐宿主 `@deepseek-ai/dsh-goal/src/runtime.ts`：
 * 宿主在这里放 `GOAL_CHANGE_VERSION` / `GoalId()` 品牌化 / `GoalError`）。
 *
 * @module dsh-pmboard/goal/runtime
 */
import type { TaskGoalId as TaskGoalIdType } from './types.js'

/** 变更载荷版本（对齐宿主 GOAL_CHANGE_VERSION；写入与解码两侧同源）。 */
export const GOAL_CHANGE_VERSION = 1

/** goal 身份构造（唯一入口：别处手拼 `'goal:' + taskId` 会漂移）。 */
export function TaskGoalId(taskId: string): TaskGoalIdType {
  return 'goal:' + taskId
}

/** goal 域的稳定错误码（机器可路由；对齐宿主 GoalErrorCode 的形态）。 */
export type GoalErrorCode =
  | 'GOAL_NO_GOAL'
  | 'GOAL_TERMINAL'
  | 'GOAL_REASON_REQUIRED'
  | 'GOAL_IDENTITY_CONFLICT'
  | 'GOAL_NOT_FOUND'
  | 'GOAL_NO_PERMISSION'
  /** CAS 失败：调用方拿着旧 revision 在改（对齐宿主 `goalRef` 的乐观锁拒绝）。 */
  | 'GOAL_CONFLICT'
  /** 自报 blocked 的回合数不够（对齐宿主 `blockedAfterConsecutiveRounds`）。 */
  | 'GOAL_BLOCK_THRESHOLD'

/** goal 域边界错误（对齐宿主 GoalError：message 人话 + code 机器可路由）。 */
export class GoalError extends Error {
  readonly code: GoalErrorCode
  constructor(message: string, code: GoalErrorCode) {
    super(message)
    this.name = 'GoalError'
    this.code = code
  }
}
