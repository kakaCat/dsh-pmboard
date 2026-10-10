/**
 * 回退方向判定（REQ-261003204149-1e80 FR-1）——「哪些转移算回退」的唯一实现处。
 *
 * 为什么单独立文件：`REQ_TRANSITIONS` 需要"任意更早节点皆为合法回退边"这条规则，
 * 而 `artifacts` 撤销（FR-3）也需要"目标之后还有哪些阶段"这同一个序。
 * 若把序与判定分散在状态机、闸门、撤销三处，必然各自漂移——故收敛于此。
 *
 * 本文件是纯数据 + 纯函数：不 import node:/外层，不碰时间与随机数
 * （domain 层硬约束，由 tests/layer-boundary.test.ts 机械检查）。
 *
 * 与 `RequirementStatus` 的依赖方向：这里只 `import type`（编译期擦除），
 * 运行时由 `RequirementStatus` → 本文件单向引用，不构成值环。
 */

import type { RequirementStatus } from './RequirementStatus.js'

/**
 * 流水线主序（= 七个主节点，不含 legacy `done` 与 `canceled`）。
 * 回退 = 目标在该序中**早于**当前阶段；撤销范围 = 目标之后的所有阶段。
 */
export const PIPELINE_ORDER = [
  'draft',
  'brainstorming',
  'design',
  'decomposing',
  'implementing',
  'accepting',
  'archived',
] as const

export type PipelineStage = (typeof PIPELINE_ORDER)[number]

/** 阶段在流水线中的下标；不在序中（done / canceled）→ -1。 */
export function pipelineIndexOf(status: RequirementStatus): number {
  return (PIPELINE_ORDER as readonly string[]).indexOf(status)
}

/**
 * 该转移是否为**回退**（目标早于当前阶段，且是一次**合法**的回退边）。
 *
 * 判据 = `to ∈ rollbackTargetsOf(from)`，与状态机表**同源**——两处不可能漂移。
 *
 * 为什么不写成"index(to) < index(from)"：那样会把终点也算进来（`archived → design`
 * 会判 true），而归档是终点、**不可回退**（需求边界三条之一：`archived`/`done` 保持无出边）。
 * 用成员判定后，终点天然返回 false，且 `done`/`canceled` 不在序中同样为 false。
 */
export function isRollback(from: RequirementStatus, to: RequirementStatus): boolean {
  return rollbackTargetsOf(from).includes(to)
}

/**
 * 目标阶段**之后**的所有阶段（不含目标自身）——撤销语义的作用域：
 * 落在这些阶段的产物，确认章随回退作废（FR-3）。
 */
export function stagesAfter(to: RequirementStatus): readonly PipelineStage[] {
  const i = pipelineIndexOf(to)
  if (i < 0) return []
  return PIPELINE_ORDER.slice(i + 1)
}

/**
 * 某阶段的**合法回退目标**（序中早于它的全部阶段）。
 *
 * 两条排除：
 *  - `archived` 是终点（不回退，也不被回退进入）——`i >= len-1` → 空；
 *  - `draft` 之前无节点、`done`/`canceled` 不在序中 → 空。
 */
export function rollbackTargetsOf(status: RequirementStatus): readonly RequirementStatus[] {
  const i = pipelineIndexOf(status)
  if (i <= 0 || i >= PIPELINE_ORDER.length - 1) return []
  return PIPELINE_ORDER.slice(0, i)
}
