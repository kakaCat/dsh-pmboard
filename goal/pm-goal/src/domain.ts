/**
 * goal 域的**事件与变更词汇**（对齐宿主 `@deepseek-ai/dsh-goal/src/domain.ts`：
 * 宿主把"操作动词 + 耐久变更载荷"放这里，把纯类型留在 types.ts）。
 *
 * 与 types.ts 的分工：本文件只放"发生了什么"的词汇（动词、变更载荷），不放状态形状。
 * 纯类型留在 types.ts 的好处同宿主：客户端聚合只投影 types，不被事件词汇牵连。
 *
 * @module dsh-pmboard/goal/domain
 */
import type { GoalBlockReason, GoalPhase, TaskGoal } from './types.js'

/** goal 的**状态变更动词**（与宿主 `GoalOperation` 逐个对齐：create/edit/pause/resume/block/complete/clear）。 */
export type GoalOperation = 'create' | 'edit' | 'pause' | 'resume' | 'block' | 'complete' | 'clear'

/** 状态机事件（对齐宿主 `GoalEvent` 的调用形态：带载荷的动词）。 */
export type GoalEvent =
  /** 建卡开工：goal 不存在 → active；同值重建幂等。 */
  | { kind: 'create'; goal: Omit<TaskGoal, 'phase' | 'revision'> }
  /** 人/系统暂停（中断恢复、人工干预）：active → paused。 */
  | { kind: 'pause'; reason?: GoalBlockReason }
  /** 改目标（对齐宿主 `edit`）：换陈述、或换回合上限；**至少要给一项**。 */
  | { kind: 'edit'; objective?: string; maxGoalRounds?: number }
  /** 继续：paused / blocked → active。 */
  | { kind: 'resume' }
  /** 阻塞（等上游/等人裁）：**必须给原因**。 */
  | { kind: 'block'; reason: GoalBlockReason }
  /** 达成：active / paused / blocked → complete（终态，不可逆——重开 = 新建 goal）。 */
  | { kind: 'complete' }

/**
 * clear 的**墓碑**（对齐宿主 `GoalClearChangeMeta`）：清掉当前目标，但**留下身份**。
 *
 * 为什么留身份：`seenGoalIds` 据此拒绝"同一张卡把同一个 goal id 重新建一遍"——
 * 否则重建会伪装成"从未有过目标"，把"做了一半就被清掉"这段历史抹掉。
 */
export interface GoalClear {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  /** 被清掉的 goal 身份（墓碑保留它）。 */
  readonly cleared: GoalRefRef
  readonly clearedAt: number
}

/** 墓碑里记的身份（只留 id + revision；快照已清）。 */
export interface GoalRefRef {
  readonly id: string
  readonly revision: number
}

/** 投给模型看的 goal 消息源（对齐宿主 `GoalMessageSource`；pm 版带 taskId）。 */
export interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: string
  readonly taskId: string
  readonly revision: number
  /** 正整数的已准入回合号。 */
  readonly round: number
}

/** 一次有效变更的载荷（对齐宿主 GoalSnapshotChangeMeta：全量快照 + 动词）。 */
export interface GoalChange {
  readonly kind: 'goal/change'
  readonly version: 1
  /** 快照类动词（对齐宿主 `Exclude<GoalOperation,'clear'>`：clear 走墓碑类型）。 */
  readonly operation: Exclude<GoalOperation, 'clear'>
  /** 变更后的全量快照（`changed:false` 时不产出）。 */
  readonly goal: TaskGoal
}

/** 变更写入的归属（进留痕；人机可辨）。 */
export interface GoalChangeActor {
  readonly kind: 'human' | 'agent' | 'system'
  readonly sessionId?: string
}

/** 事件在当前相位下不成立时的原因（进日志/诊断，不进台账）。 */
export interface GoalRejection {
  readonly changed: false
  readonly reason: string
}

/** 相位判据输入的最小形状（供 fold/predicates 复用）。 */
export interface GoalPhaseView {
  readonly phase: GoalPhase
}
