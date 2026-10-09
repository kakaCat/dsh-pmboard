/**
 * DAG Tab 的服务端聚合（REQ-261004222448-292a t-43fcf4 / serves: FR-8）——S-10。
 *
 * 三块一次给全（前端**不遍历**、不再自己算）：
 *   · `tasks` —— 图数据（`dag-view` 现有入参形状的字段子集 + `layer` + `chainMissing`）；
 *   · `steps` —— 每步执行结果（照抄 `TaskRecord.executions` + 卡级 `lastReport`）；
 *   · `criticalPath` —— 关键路径（最长路径）。
 *
 * 为什么 `layer` 必须从 `readQueue` 取：`TaskStore` 的三个读口**出口即剥离 `layer`**
 * （`ports.ts` 的端口承诺），只有 `readQueue` 给 DAG 派生视图；从 `listByRequirement` 拿不到层，
 * 前端就只能自己重算拓扑（本需求明令"聚合全在服务端"）。
 *
 * @module dsh-pmboard/application/query/QueryDag
 */
import { fmt } from '../../domain/text/fmt.js'
import { liveLayers, liveTasksOf, splitDependencyEdges } from '../../domain/status/Predicates.js'
import {
  type DagGraphNode,
  type DagResponse,
  type DagStep,
  type Degrade,
  type PanelResult,
  type RequirementRecord,
  type TaskRecord,
} from '../../shared/protocol.js'
import type { QueueFile } from '../../domain/queue/QueueTypes.js'
import type { PanelQueryDeps, PanelQueryInput } from './contracts.js'

/** 需求不存在 → 抛 `code='not_found'`（路由层转 404）。 */
function notFound(id: string): Error {
  return Object.assign(new Error(fmt('需求不存在：{id}', { id })), { code: 'not_found' })
}

/** 读不到 → 降级信封（不用 0 / 空数组冒充「没有」）。 */
function unreadable(err: unknown): Degrade {
  return {
    available: false,
    reason: 'ledger-unreadable',
    note: fmt('读不到台账/队列：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
  }
}

// ---------------------------------------------------------------------------
// 图数据
// ---------------------------------------------------------------------------

/**
 * 「期望有链、链却没生成」——**与客户端 `[链未生成]` 判定同源**。
 *
 * 判据（2026-10-06 收紧，缺口 4 之二）**按状态分两半，刻意不对称**：
 *  · `kids.length > 0` → false（链在）；
 *  · **显式 solo**（`stages: []`）→ false（`lazy-expand` 里只有它表示"本卡不要子卡"，永不打标）；
 *  · `in_progress` → **true**：未声明 `stages` 也算"期望有链"——默认链由 `resolveSubtaskStages`
 *    按卡 phase / side 推出（`lazy-expand.ts:46-54`），所以"没写 stages"绝不等于"不要链"。
 *    这一半与旧行为**逐字一致**（旧版：`in_progress && !(stages 是显式空数组)`），不许放松：
 *    它覆盖的正是最常见的形态（多数卡不会显式写 stages），放松 = 漏报默认链没生成。
 *  · `done` → **仅当显式声明非空 `stages`** 才 true：计划里白纸黑字写了 dev/review 却 0 子卡
 *    （`autoRun=false` 时手动开工从不展开、`expandSubtasks` 幂等且只一次机会，卡走完流程也无人发现）。
 *    不声明 `stages` 的存量 done 卡**不打标**——它们没有"声明过要链"的证据，大面积打标只会变噪声。
 *  · 其它状态（todo / canceled…）→ false：todo 还没到懒展开，没链是正常态。
 *
 * 为什么在这里重写一遍而不是 import：判定本来在 `client/dag/progress-bar.ts`，
 * 而 application 层**禁止** import client（`tests/layer-boundary.test.ts` 机械检查）。
 * 逐字保留同一条判据（与 progress-bar.ts 的 `chainMissing` **逐字同源**）；两处若漂移，
 * 症状是"看板标了链未生成、详情页没标"，故注释里点明来源，改一处必须改两处。
 */
function chainMissingOf(task: TaskRecord, kids: readonly TaskRecord[]): boolean {
  if (kids.length > 0) return false
  const stages = task.stages
  if (Array.isArray(stages) && stages.length === 0) return false // 显式 solo
  if (task.status === 'in_progress') return true // 未声明也算期望有链（与旧行为逐字一致）
  if (task.status === 'done') return Array.isArray(stages) && stages.length > 0
  return false
}

/** 图数据：任务 + 父子/阶段/依赖/领取人/层级 + 缺链标记。 */
export function buildDagNodes(
  tasks: readonly TaskRecord[],
  layerOf?: ReadonlyMap<string, number>,
): DagGraphNode[] {
  // 出参剪边（REQ-261005193546-1b1a · design §依赖边语义 ⑤）：节点数组只写**在场节点**的边
  // （`satisfied ∪ pending`）。指向已取消卡的边若照原样下发，画布侧的"未知 id 当 0 层"会把它
  // 算成幽灵前置——与 `layerOf`（= `liveLayers`）同一份 `byId` 口径，两层读数不会再分叉。
  const liveById = new Map<string, TaskRecord>(tasks.map((t): [string, TaskRecord] => [t.id, t]))
  return tasks.map(t => {
    const kids = tasks.filter(x => x.parentId === t.id)
    const layer = layerOf?.get(t.id)
    const split = splitDependencyEdges(t, liveById)
    return {
      id: t.id,
      title: t.title,
      ...(t.parentId !== undefined ? { parentId: t.parentId } : {}),
      ...(t.stageKind !== undefined ? { stageKind: t.stageKind } : {}),
      status: t.status,
      dependsOn: [...split.satisfied, ...split.pending],
      ...(t.claimedBy !== undefined ? { claimedBy: t.claimedBy } : {}),
      ...(layer !== undefined ? { layer } : {}),
      ...(chainMissingOf(t, kids) ? { chainMissing: true } : {}),
      // REQ-261007100513-6749 t1 / FR-6：预算覆盖值透传（可选；缺省 = 键缺席，读端按默认预算起算）。
      ...(t.budgetRequests !== undefined ? { budgetRequests: t.budgetRequests } : {}),
    }
  })
}

// ---------------------------------------------------------------------------
// 每步执行结果
// ---------------------------------------------------------------------------

/**
 * 每步执行结果：**照抄** `ExecutionRecord` + 卡级 `lastReport` 四要素，不做加工。
 *
 * 两处如实的取舍（都写在这里，免得读代码的人以为是 bug）：
 *   · `stage`：子卡取 `stageKind`（dev/integrate/…），否则取 `phase`（doc/implement/…）——
 *     执行记录自身没有"阶段"字段，取最能定位"这一步在链上哪一段"的那个；
 *   · `report`：台账的 `lastReport` 是**卡级**的（`TaskReportSummary` 没有 summary/nextStep，
 *     也不区分是哪一次执行），故**按步照抄同一份**：`summary` 由 `completed` 派生
 *     （与 `旧的单卡查询工具` / `TaskTree` 同源），`nextStep` 恒缺省——台账没存，就不编。
 */
export function buildDagSteps(tasks: readonly TaskRecord[]): DagStep[] {
  const out: DagStep[] = []
  for (const t of tasks) {
    const report = t.lastReport === undefined
      ? undefined
      : {
          summary: t.lastReport.completed.length > 0 ? t.lastReport.completed.join('；') : '无完成项',
          completed: [...t.lastReport.completed],
          filesChanged: [...t.lastReport.filesChanged],
        }
    for (const e of t.executions) {
      out.push({
        taskId: t.id,
        stage: t.stageKind ?? t.phase,
        ...(e.sessionId !== undefined ? { sessionId: e.sessionId } : {}),
        trigger: e.trigger,
        startedAt: e.startedAt,
        ...(e.endedAt !== undefined ? { endedAt: e.endedAt } : {}),
        outcome: e.outcome,
        ...(e.error !== undefined ? { error: e.error } : {}),
        evidence: [...(e.evidence ?? [])],
        attempt: t.attempt ?? 0,
        ...(report !== undefined ? { report } : {}),
        ...(e.outputCount !== undefined ? { outputCount: e.outputCount } : {}),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 关键路径
// ---------------------------------------------------------------------------

/**
 * 关键路径 = DAG 最长路径（Kahn 拓扑 + DP，与 `client/dag/critical-path.ts` 同一算法）。
 *
 * 与客户端的**唯一差别**：返回 `string[]`（起点→终点，按路径顺序）而不是 `Set`——
 * 契约字段是 `criticalPath?: string[]`，且顺序对"这条链下一张是谁"有意义。
 * 空图或有环 → `undefined`（不抛错；有环时最长路径无定义，由页面另行提示）。
 */
export function buildCriticalPath(tasks: readonly TaskRecord[]): string[] | undefined {
  // 收编（REQ-261005193546-1b1a FR-4 · INV-4）：此处原是手写的取消比较式（`status` 与取消字面量）——
  // 判据一律走单点；下方 `preds` 的 `byId.has(d)` 剪边语义逐字保留（design §依赖边语义 ⑤）。
  const alive = liveTasksOf(tasks)
  if (alive.length === 0) return undefined
  const byId = new Map(alive.map(t => [t.id, t]))
  const preds = new Map<string, string[]>()
  for (const t of alive) {
    preds.set(t.id, t.dependsOn.filter(d => byId.has(d) && d !== t.id))
  }
  // 后继表（一次建好：Kahn 剥皮靠它递减入度，不必每轮重扫全部任务）
  const succs = new Map<string, string[]>(alive.map(t => [t.id, []]))
  for (const t of alive) {
    for (const p of preds.get(t.id)!) succs.get(p)!.push(t.id)
  }
  const indeg = new Map<string, number>()
  for (const t of alive) indeg.set(t.id, preds.get(t.id)!.length)
  const queue = alive.filter(t => indeg.get(t.id) === 0).map(t => t.id)
  const order: string[] = []
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head]!
    order.push(id)
    for (const next of succs.get(id)!) {
      const left = indeg.get(next)! - 1
      indeg.set(next, left)
      if (left === 0) queue.push(next)
    }
  }
  // 有环：剩下的节点排不进拓扑序 → 最长路径无定义（如实返回 undefined）
  if (order.length !== alive.length) return undefined

  const dist = new Map<string, number>()
  const prev = new Map<string, string | undefined>()
  for (const id of order) {
    let best = 1
    let from: string | undefined
    for (const p of preds.get(id)!) {
      const cand = (dist.get(p) ?? 0) + 1
      if (cand > best) {
        best = cand
        from = p
      }
    }
    dist.set(id, best)
    prev.set(id, from)
  }
  let end: string | undefined
  let bestLen = 0
  for (const id of order) {
    const d = dist.get(id)!
    if (d > bestLen) {
      bestLen = d
      end = id
    }
  }
  const path: string[] = []
  let cur = end
  while (cur !== undefined) {
    path.unshift(cur)
    cur = prev.get(cur)
  }
  return path.length > 0 ? path : undefined
}

// ---------------------------------------------------------------------------
// 端点入口
// ---------------------------------------------------------------------------

/** `GET /requirements/:id/dag`：图数据 + 每步执行结果 + 关键路径。 */
export async function queryDag(
  deps: PanelQueryDeps,
  input: PanelQueryInput,
): Promise<PanelResult<DagResponse>> {
  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }
  if (req === undefined) throw notFound(input.requirementId)

  let tasks: readonly TaskRecord[]
  let queue: QueueFile | undefined
  try {
    // 先读队列全量（含 layer）；无队列文件（＝没有任务）再退回端口列表读（同样是空数组）
    queue = await deps.tasks.readQueue(input.requirementId)
    tasks = queue !== undefined ? queue.tasks : await deps.tasks.listByRequirement(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }

  // 活卡收敛（REQ-261005193546-1b1a FR-1/FR-4 · INV-1）：三块投影**同源喂同一份活卡集合**
  // （`tasks` / `steps` / `criticalPath` 各自过滤的写法会让三处读数分叉）。
  const live = liveTasksOf(tasks)
  const response: DagResponse = {
    // 层号**现算**（INV-5 ③）：`liveLayers(live)` = `computeLayers(layerInputOf(live))`，
    // 与「删掉指向取消卡的边后重算」等价。队列落盘的 `layer` 是按**全量节点**算的历史派生值
    // （本需求守零写回：不重写存量队列文件），故**不再转发**它——转发会让掉层重新出现在这层。
    tasks: buildDagNodes(live, liveLayers(live)),
    steps: buildDagSteps(live),
  }
  const criticalPath = buildCriticalPath(live)
  return criticalPath !== undefined ? { ...response, criticalPath } : response
}
