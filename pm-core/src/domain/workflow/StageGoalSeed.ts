/**
 * 阶段目标的**立项种子**（转发 goal 插件自有的阶段定义）。
 *
 * 【单一来源】键集 / 顺序 / 内容模板都在 `pm-goal/src/stages.ts` —— goal 插件自己的领域，
 * 本包只做**立项时调用**（创建需求那次 mutate 里写 `goals: seedStageGoals()`）。
 * 这里不再抄一份 TEMPLATES：两份就会漂移，而漂移的后果是"seed 出来的键不在阶段机里"。
 *
 * 【为什么需要】驱动判"本阶段还有没有活"读的就是这张表（`readyToClose` 要求表非空），
 * 不 seed = 立项后第一拍必然停手（四个 doc 阶段连"这一拍做什么"都没有来源）。
 *
 * 依赖方向：pm-core(L1) → pm-goal(L1)，白名单允许（core 引用它，反向禁止）。
 *
 * @module dsh-pmboard/domain/workflow/stage-goal-seed
 */
import type { StageGoal } from 'pm-goal'
import { seedGoalStages } from 'pm-goal'

/**
 * 立项种子：七段达成位（全 pending），顺序 = goal 插件的阶段序列（创建 → 归档）。
 * 缺模板由 `seedGoalStages` 当场抛——不静默丢一段。
 */
export function seedStageGoals(): StageGoal[] {
  return seedGoalStages()
}
