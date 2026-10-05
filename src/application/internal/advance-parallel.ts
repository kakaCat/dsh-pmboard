/**
 * 批内并行分组（REQ-261003222428-3556 FR-2）——写集冲突检测自 batch-scheduler 移植。
 *
 * 为什么是新模块而不是直接复用 batch-scheduler：老调度器服务的是死代码
 * （BackgroundRunner/StartSubtaskChain 无调用者），且按「全部 ready 任务」分批；
 * 现役 AdvanceChain 每轮批次已由 selectAdvanceBatch 选好，这里只回答一个问题——
 * **同一批 RUN_SUBTASK 事件里，哪些可以同时跑**。
 *
 * 保守纪律（宁可慢、不可错）：卡未声明写集（filesPlanned 与 scope.files 均空）
 * → 视为与一切冲突，独占一组串行。存量卡写集全空 ⇒ 默认行为 ≡ 旧串行（行为不变式 2）。
 *
 * @module dsh-pmboard/application/internal/advance-parallel
 */
import type { TaskRecord } from '../../shared/protocol.js'
import { detectConflict, type WriteSet } from '../../domain/write-set.js'
import type { AdvanceSelection } from './advance-select.js'

/**
 * 卡的有效写集：`scope.files ∪ filesPlanned`（后者仅客户端投影类型上有，防御性读取）。
 * 空 = 未声明 → 返回 undefined（调用方按「与一切冲突」处理）。
 */
export function effectiveWriteSet(task: TaskRecord | undefined): WriteSet | undefined {
  if (task === undefined) return undefined
  const scoped = Array.isArray(task.scope?.files) ? task.scope.files : []
  const plannedRaw = (task as { filesPlanned?: unknown }).filesPlanned
  const planned = Array.isArray(plannedRaw) ? plannedRaw.filter((x): x is string => typeof x === 'string') : []
  const merged = [...new Set([...scoped, ...planned].map((p) => p.trim()).filter((p) => p.length > 0))]
  return merged.length > 0 ? merged : undefined
}

/**
 * 把 RUN_SUBTASK 事件按写集分组：**组间串行、组内并行**。
 *
 * 写集取值：子卡自己的有效写集优先，**未声明回落父卡**（设计口径「按父卡写集分组」——
 * 懒展开时子卡继承父卡 scope，但存量/直建的子卡可能没带，回落到父卡才是冲突关系的真实主体）；
 * 父卡也未声明 → undefined（与一切冲突，独占串行组）。
 *
 * 贪心法（与 batch-scheduler 同源）：按序取事件，放入首个「与组内全体成员均不冲突」的组，
 * 放不进就开新组。未声明写集（undefined）的成员与一切冲突——
 * 它自己独占一组，且任何组只要含未声明成员就不再接纳新成员。
 *
 * @param events 同批 RUN_SUBTASK 事件（每个至多涉及一张子卡）
 * @param tasks  当前队列任务视图（写集的数据来源）
 * @returns 分组结果（保持输入顺序的稳定分组；空输入 → 空数组）
 */
export function groupSubtaskEvents(
  events: readonly AdvanceSelection[],
  tasks: readonly TaskRecord[],
): AdvanceSelection[][] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const wsOf = (sel: AdvanceSelection): WriteSet | undefined => {
    const sub = sel.subtaskId === undefined ? undefined : byId.get(sel.subtaskId)
    const own = effectiveWriteSet(sub)
    if (own !== undefined) return own
    const parent = sub?.parentId === undefined ? undefined : byId.get(sub.parentId)
    return effectiveWriteSet(parent)
  }
  interface Group {
    sels: AdvanceSelection[]
    /** 组内合并写集；任一成员未声明 → undefined（该组对外表现为「与一切冲突」） */
    ws: WriteSet | undefined
  }
  const groups: Group[] = []
  for (const sel of events) {
    const ws = wsOf(sel)
    let placed = false
    if (ws !== undefined) {
      for (const g of groups) {
        // 组内有未声明成员 → 永不接纳（保守）
        if (g.ws === undefined) continue
        if (!detectConflict(ws, g.ws)) {
          g.sels.push(sel)
          g.ws = [...new Set([...g.ws, ...ws])]
          placed = true
          break
        }
      }
    }
    if (!placed) {
      groups.push({ sels: [sel], ws: ws === undefined ? undefined : [...ws] })
    }
  }
  return groups.map((g) => g.sels)
}
