/**
 * 工具登记面（tool-pm-goal）——**唯一手写清单**。
 *
 * 【两层各三工具】（用户裁定 2026-10-10：goal 分两层，工具面必须两层都有；
 * "创建"指**任务目标的创建**，不是需求/repoard 级的立项）：
 *   L2 任务目标（挂任务卡）：get / create / update
 *   L1 阶段目标（挂需求）：  get / create / done（落章 = 真人专属，D-4）
 *
 * 与 `tool-pm/src/registry.ts` 同款纪律：注册名与工厂名的期望值都从本表派生，
 * 漏登记当场被门禁点名。加工具 = 本表补一条 + `src/index.ts` 的 `GOAL_TOOL_FACTORIES` 补一项。
 *
 * @module dsh-pmboard/tools-goal/registry
 */

export interface GoalToolRegistryEntry {
  /** 工厂键（`GOAL_TOOL_FACTORIES` 的键）。 */
  key: string
  /** 工厂名（门禁在 `src/index.ts` 里逐字扫它）。 */
  factory: string
  /** 宿主注册的工具名。 */
  toolName: string
  /** 属于哪一层（自述用；门禁据此核对两层都有）。 */
  layer: 'L2-task' | 'L1-stage'
  description: string
}

/** 6 条 = 两层 × 三工具（L2 任务目标 / L1 阶段目标）。 */
export const GOAL_TOOL_REGISTRY: readonly GoalToolRegistryEntry[] = [
  {
    key: 'TaskGoalGet',
    factory: 'defineTaskGoalGetTool',
    toolName: 'reqboard_task_goal_get',
    layer: 'L2-task',
    description: '读任务卡目标（相位/陈述/阻塞原因）',
  },
  {
    key: 'TaskGoalCreate',
    factory: 'defineTaskGoalCreateTool',
    toolName: 'reqboard_task_goal_create',
    layer: 'L2-task',
    description: '开工建任务目标（objective 缺省取卡片 acceptance）',
  },
  {
    key: 'TaskGoalUpdate',
    factory: 'defineTaskGoalUpdateTool',
    toolName: 'reqboard_task_goal_update',
    layer: 'L2-task',
    description: '相位迁移：pause / resume（真人专属）/ block / complete',
  },
  {
    key: 'StageGoalGet',
    factory: 'defineStageGoalGetTool',
    toolName: 'reqboard_stage_goal_get',
    layer: 'L1-stage',
    description: '读阶段目标表（按创建→归档顺序）与"是否具备收口条件"',
  },
  {
    key: 'StageGoalCreate',
    factory: 'defineStageGoalCreateTool',
    toolName: 'reqboard_stage_goal_create',
    layer: 'L1-stage',
    description: '登记/替换阶段目标表（从创建 draft 起、到 archived 止；全达成 ⇒ 可收口）',
  },
  {
    key: 'StageGoalDone',
    factory: 'defineStageGoalDoneTool',
    toolName: 'reqboard_stage_goal_done',
    layer: 'L1-stage',
    description: '阶段达成位落章（**真人专属**，D-4）',
  },
]
