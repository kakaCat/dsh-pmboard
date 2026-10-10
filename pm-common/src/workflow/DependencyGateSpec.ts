/**
 * DAG 依赖门禁（REQ-260929210741-30ae FR-4）：认领（todo→in_progress）前检查 dependsOn。
 *
 * 自动链早有 depsDone 检查，**手动路径此前没有**（测评发现的流程断点）——本模块把这层
 * 判定抽成纯函数单点：自引用 / 悬空引用 / 环 / 未完成依赖，四类拒绝各有可操作的修复指引。
 *
 * 纯函数、零 I/O；"要不要拦"（逃生舱、状态前置）留给调用方（MoveTask）。
 *
 * @module dsh-pmboard/domain/workflow/DependencyGateSpec
 */

/** 依赖判定所需的任务投影（最小结构，不绑协议类型，避免 domain→shared 反向依赖）。 */
export interface DependencyTaskLike {
  id: string
  title: string
  status: string
  dependsOn?: readonly string[]
}

/** 未完成依赖（拒绝时点名，供人直接看）。 */
export interface DependencyGateUnfinished {
  id: string
  status: string
  title: string
}

/** 依赖门禁拒绝（reason 已含修复指引，可直接作为 reject 的 message）。 */
export interface DependencyGateRejection {
  code: 'REQBOARD_DEPENDENCY_GATE'
  reason: string
  unfinished: DependencyGateUnfinished[]
  cycles: string[]
  dangling: string[]
}

/** 从 dependsOn 收集环（只报告包含 task.id 的环——别的环不影响本任务认领）。 */
function findCycle(task: DependencyTaskLike, byId: ReadonlyMap<string, DependencyTaskLike>): string[] | undefined {
  const visited = new Set<string>()
  const stack: string[] = []
  const dfs = (id: string): boolean => {
    if (id === task.id && stack.length > 0) return true
    if (visited.has(id)) return false
    visited.add(id)
    stack.push(id)
    const t = byId.get(id)
    if (t !== undefined) {
      for (const d of t.dependsOn ?? []) if (dfs(d)) return true
    }
    stack.pop()
    return false
  }
  for (const dep of task.dependsOn ?? []) if (dfs(dep)) return [...stack, task.id]
  return undefined
}

/**
 * 认领门禁判定（纯函数，零 I/O）。
 *
 * @param task 要认领的任务
 * @param tasks 同需求全部任务（依赖解析的查找表）
 * @returns undefined = 可认领；DependencyGateRejection = 拒绝（消息已含修复指引）
 */
export function checkClaimDependencies(
  task: DependencyTaskLike,
  tasks: readonly DependencyTaskLike[],
): DependencyGateRejection | undefined {
  const deps = task.dependsOn ?? []
  if (deps.length === 0) return undefined
  const byId = new Map(tasks.map(t => [t.id, t]))

  if (deps.includes(task.id)) {
    return {
      code: 'REQBOARD_DEPENDENCY_GATE',
      reason: `任务 ${task.id} 的 dependsOn 包含自己（自引用环）——DAG 数据异常，请先修依赖再认领`,
      unfinished: [], cycles: [task.id], dangling: [],
    }
  }
  const dangling = deps.filter(d => !byId.has(d))
  if (dangling.length > 0) {
    return {
      code: 'REQBOARD_DEPENDENCY_GATE',
      reason: `任务 ${task.id} 的 dependsOn 引用了不存在的任务：${dangling.join('、')}——数据异常，请先修依赖再认领`,
      unfinished: [], cycles: [], dangling,
    }
  }
  const cycle = findCycle(task, byId)
  if (cycle !== undefined) {
    return {
      code: 'REQBOARD_DEPENDENCY_GATE',
      reason: `任务 ${task.id} 的依赖链存在环：${cycle.join(' → ')}——DAG 数据异常，请先修依赖再认领`,
      unfinished: [], cycles: cycle, dangling: [],
    }
  }
  const unfinished: DependencyGateUnfinished[] = deps
    .map(d => byId.get(d))
    .filter((t): t is DependencyTaskLike => t !== undefined && t.status !== 'done')
    .map(t => ({ id: t.id, status: t.status, title: t.title }))
  if (unfinished.length > 0) {
    const list = unfinished.map(u => `${u.id}（${u.status}）${u.title}`).join('；')
    return {
      code: 'REQBOARD_DEPENDENCY_GATE',
      reason: `reqboard_task_move 未执行：任务 ${task.id} 的上层依赖未完成——${list}。先完成上层任务再认领（REQBOARD_DEPENDENCY_GATE）`,
      unfinished, cycles: [], dangling: [],
    }
  }
  return undefined
}
