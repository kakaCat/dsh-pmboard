/**
 * Dive 模式阶段配置（REQ-260925212722-96e7；REQ-261004103330-005f t6 起**语义降级**）
 *
 * 定义每个需求阶段的自动化行为：是否需要人工确认、是否自动执行。
 *
 * ⚠️ `maxRounds` 的语义变了（2026-10-04，REQ-261004103330-005f FR-2）：它**不再是权威上限**，
 * 而是**默认值表**——人可在看板「运行设置」里按阶段覆盖，来源顺序为
 * 设置文件 > 插件配置 > 环境变量 > 本表。权威读取口是 `round-state.ts` 的 `roundLimitFor()`
 * （同步读内存快照；未安装快照时才回落本表）。
 *
 * **默认值下限（2026-10-04 人裁定）**：每个节点的内置默认**不得低于 5**——`maxRounds: 1` 曾经让
 * 「立项 / 已完成 / 已归档 / 已取消」这四个不自动跑的阶段在表里显得像"上限只有 1"，容易被读成
 * "这个阶段只能跑一轮"。抬到 5 只改**表里的默认值**，不改变行为：这四个阶段 `autoExecute: false`，
 * 本来就不会自动续跑。
 *
 * 为什么默认值仍留在这里而不搬进设置模块：默认值是**代码里的值**，与"人改过的值"必须分开存，
 * 否则日后调整默认值时，用户拿到的是被抄进设置文件的旧默认值（默认值冻结）。
 *
 * @module dsh-pmboard/application/dive/stage-configs
 */

import type { RequirementStatus } from '../../shared/protocol.js'

/** 阶段配置接口 */
export interface StageConfig {
  /** 是否需要人工确认才能推进到下一阶段 */
  requiresConfirmation: boolean
  
  /** 是否自动执行任务（implementing 阶段适用） */
  autoExecute: boolean
  
  /** 每阶段最大回合数限制（防止无限循环） */
  maxRounds: number
  
  /** 阶段描述 */
  description: string
}

/** 所有阶段的配置映射 */
export const STAGE_CONFIGS: Readonly<Record<RequirementStatus, StageConfig>> = {
  // 立项阶段：草稿状态，无 Dive 行为
  draft: {
    requiresConfirmation: false,
    autoExecute: false,
    maxRounds: 5, // 下限 5（人裁定）：不自动跑，但默认值不再低到像"只能跑一轮"
    description: '立项草稿，无自动化行为'
  },
  
  // 需求分析阶段：头脑风暴，需要人工确认需求文档
  // autoExecute: true —— Dive 自动驱动调研与文档写作（人工确认仍在闸门）
  brainstorming: {
    requiresConfirmation: true,
    autoExecute: true,
    maxRounds: 500,
    description: '需求分析阶段，需人工确认需求文档（Dive 自动驱动调研与写作）'
  },
  
  // 设计阶段：编写设计文档，需要人工确认设计
  // autoExecute: true —— Dive 自动驱动设计文档写作（人工确认仍在闸门）
  design: {
    requiresConfirmation: true,
    autoExecute: true,
    maxRounds: 200,
    description: '设计阶段，需人工确认设计文档（Dive 自动驱动写作）'
  },
  
  // 拆分阶段：编写拆分计划，需要人工批准计划
  // autoExecute: true —— Dive 自动驱动拆分计划写作（人工批准仍在闸门）
  decomposing: {
    requiresConfirmation: true,
    autoExecute: true,
    maxRounds: 100,
    description: '拆分阶段，需人工批准拆分计划（Dive 自动驱动写作）'
  },
  
  // 实施阶段：全自动执行任务，无需人工确认（Dive 模式核心）
  implementing: {
    requiresConfirmation: false,
    autoExecute: true,
    maxRounds: 1000, // 任务数量可能较多
    description: '实施阶段，全自动执行任务（Dive 模式）'
  },
  
  // 验收阶段：需要人工验收
  accepting: {
    requiresConfirmation: true,
    autoExecute: true,
    maxRounds: 50,
    description: '验收阶段，需人工验收'
  },
  
  // 已完成：无后续行为
  done: {
    requiresConfirmation: false,
    autoExecute: false,
    maxRounds: 5, // 下限 5（人裁定）
    description: '已完成，无后续行为'
  },
  
  // 已归档：无后续行为
  archived: {
    requiresConfirmation: false,
    autoExecute: false,
    maxRounds: 5, // 下限 5（人裁定）
    description: '已归档，无后续行为'
  },
  
  // 已取消：无后续行为
  canceled: {
    requiresConfirmation: false,
    autoExecute: false,
    maxRounds: 5, // 下限 5（人裁定）
    description: '已取消，无后续行为'
  }
}

/**
 * 获取指定阶段的配置
 */
export function getStageConfig(stage: RequirementStatus): StageConfig {
  return STAGE_CONFIGS[stage]
}

/**
 * 检查阶段是否需要人工确认
 */
export function requiresConfirmation(stage: RequirementStatus): boolean {
  return STAGE_CONFIGS[stage].requiresConfirmation
}

/**
 * 检查阶段是否自动执行
 */
export function isAutoExecute(stage: RequirementStatus): boolean {
  return STAGE_CONFIGS[stage].autoExecute
}

/**
 * 获取阶段的**默认**最大回合数。
 *
 * ⚠️ 这是默认值，不是生效值（REQ-261004103330-005f FR-2）：生效值请用 `roundLimitFor()`
 * （它先看已安装的设置快照）。本函数留给"恢复默认""展示默认值"这类场景。
 */
export function getMaxRounds(stage: RequirementStatus): number {
  return STAGE_CONFIGS[stage].maxRounds
}
