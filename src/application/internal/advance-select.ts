/**
 * 推进事件的**纯选择器**（REQ-4842fe t7 / FR-11）：给定台账快照，决定"下一步该做什么"。
 *
 * 为什么单独成文件且纯函数：事件选择是自动链的心脏，"状态即事实"的幂等性全靠它——
 * 重复触发不会重复干活，因为选择依据全部来自台账客观状态。抽出后可用冻结入参单测，
 * 不必搭真 I/O（沿用 domain/workflow/RollupSpec 的同款纪律）。
 *
 * @module dsh-pmboard/application/internal/advance-select
 */
import type { AdvanceEvent, TaskRecord } from '../../shared/protocol.js'
import { identifyOrphans } from './orphan-collector.js'
import { isInProgressTask } from '../../domain/status/Predicates.js'

export interface AdvanceView {
  readonly tasks: readonly TaskRecord[]
}

export interface AdvanceSelection {
  event: AdvanceEvent
  parentId?: string
  subtaskId?: string
}

/** 顶层卡（父卡/普通卡；不含子卡），排除已取消。 */
export function topLevelTasks(view: AdvanceView, requirementId: string): TaskRecord[] {
  return view.tasks.filter((t) => t.requirementId === requirementId && t.parentId === undefined && t.status !== 'canceled')
}

/** 同需求全部非取消子卡。 */
export function openSubtasks(view: AdvanceView, requirementId: string): TaskRecord[] {
  return view.tasks.filter((t) => t.requirementId === requirementId && t.parentId !== undefined && t.status !== 'canceled')
}

/**
 * 当前正在跑的子卡 id（REQ-260927144541-0481 FR-1）——工具壳不得写状态字面量（layer-boundary 门禁），
 * "哪些子卡在跑"是选择器语义，与其它选择判定同处归口。
 */
export function runningSubtaskIds(view: AdvanceView, requirementId: string): string[] {
  return openSubtasks(view, requirementId).filter((t) => isInProgressTask(t)).map((t) => t.id)
}

function depsDone(view: AdvanceView, task: TaskRecord): boolean {
  const doneIds = new Set(view.tasks.filter((t) => t.status === 'done').map((t) => t.id))
  return task.dependsOn.every((d) => doneIds.has(d))
}

/** 父卡名下子卡。 */
export function subtasksOf(view: AdvanceView, parentId: string): TaskRecord[] {
  return view.tasks.filter((t) => t.parentId === parentId)
}

/**
 * 选择下一个推进事件（优先级：收尾 → 跑子卡 → 开父卡 → rollup）。
 * 返回 undefined = 当前没有可推进的状态（可能已终态，也可能死锁；由调用方区分）。
 *
 * @deprecated 用 selectAdvanceBatch 替代（REQ-260929195829-6e02 t2：支持并行调度）
 */
export function selectAdvanceEvent(view: AdvanceView, requirementId: string, maxParallelParents: number): AdvanceSelection | undefined {
  const batch = selectAdvanceBatch(view, requirementId, maxParallelParents)
  return batch.length > 0 ? batch[0] : undefined
}

/**
 * 批量选择推进事件（REQ-260929195829-6e02 t2）：返回所有可并行执行的 ready 任务。
 *
 * 与 selectAdvanceEvent 的区别：
 * - selectAdvanceEvent 只返回第一个事件（串行）
 * - selectAdvanceBatch 返回所有同层 ready 事件（并行），受 maxParallelParents 限制
 *
 * 并行策略：
 * - 不同父卡的子卡天然并行（无依赖关系）
 * - 同一父卡的子卡按链序串行（dev → integrate → review → test）
 * - 父卡之间按 DAG 依赖并行（deps done 的父卡可同时开工）
 */
export function selectAdvanceBatch(view: AdvanceView, requirementId: string, maxParallelParents: number): AdvanceSelection[] {
  const parents = topLevelTasks(view, requirementId)
  const batch: AdvanceSelection[] = []

  // 1) 收尾：所有 in_progress 父卡中子卡全 done 的
  for (const parent of parents) {
    if (parent.status !== 'in_progress') continue
    const subs = subtasksOf(view, parent.id)
    if (subs.length > 0 && subs.every((s) => s.status === 'done' || s.status === 'canceled')) {
      batch.push({ event: 'FINALIZE_PARENT', parentId: parent.id })
    }
  }
  if (batch.length > 0) return batch

  // 2) 跑子卡：每个 in_progress 父卡的第一个 ready 子卡（不同父卡并行）
  // REQ-260929195829-6e02 t2：受 maxParallelParents 限制，最多返回 maxParallelParents 个子卡
  for (const parent of parents) {
    if (batch.length >= maxParallelParents) break
    if (parent.status !== 'in_progress') continue
    const ready = subtasksOf(view, parent.id).find((s) => s.status === 'todo' && depsDone(view, s))
    if (ready !== undefined) {
      batch.push({ event: 'RUN_SUBTASK', parentId: parent.id, subtaskId: ready.id })
    }
  }
  if (batch.length > 0) return batch

  // 2.5) 孤儿回收：in_progress 但无活跃执行的子卡
  for (const parent of parents) {
    if (parent.status !== 'in_progress') continue
    const subs = subtasksOf(view, parent.id)
    const orphanResult = identifyOrphans(subs, new Set<string>())
    if (orphanResult.orphanIds.length > 0) {
      const orphan = subs.find((s) => orphanResult.orphanIds.includes(s.id))
      if (orphan !== undefined) {
        batch.push({ event: 'RUN_SUBTASK', parentId: parent.id, subtaskId: orphan.id })
      }
    }
  }
  if (batch.length > 0) return batch

  // 3) 开父卡：ready 且并发未超限
  const active = parents.filter((p) => p.status === 'in_progress').length
  const slots = maxParallelParents - active
  if (slots > 0) {
    const readyParents = parents.filter((p) => p.status === 'todo' && depsDone(view, p))
    for (const parent of readyParents.slice(0, slots)) {
      batch.push({ event: 'OPEN_PARENT', parentId: parent.id })
    }
  }
  if (batch.length > 0) return batch

  // 4) rollup：全部父卡收口
  const outstanding = parents.some((p) => p.status !== 'done')
  if (!outstanding && openSubtasks(view, requirementId).some((s) => s.status !== 'done')) {
    return [] // 有子卡没收口（数据异常）→ 交给停滞判定
  }
  if (!outstanding) return [{ event: 'ROLLUP' }]
  return []
}

/** 是否仍有"开放工作"（未 done 且未取消的卡）——用于区分"已终态"与"死锁停滞"。 */
export function hasOpenWork(view: AdvanceView, requirementId: string): boolean {
  return view.tasks.some((t) => t.requirementId === requirementId && t.status !== 'done' && t.status !== 'canceled')
}
