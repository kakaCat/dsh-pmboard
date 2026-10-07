/**
 * TaskTree 用例（REQ-260927144541-0481 FR-3 / design I-3）——父子结构**只读**视图。
 *
 * 为什么需要：需求级 reqboard_status 只给计数（看不到链上是谁），单卡级 reqboard_task_status
 * 又要求先知道卡 id——"链上有哪几张卡、各自到哪一步"此前只能靠人脑拼。本用例把台账里
 * parentId + dependsOn 已经表达的结构，投影成一次调用可读的树。
 *
 * 纪律（design/data-model §约束）：
 *  - **只读**：不 mutate，不改任何台账字段；
 *  - **绑定**：只读本窗口绑定需求下的任务，跨窗口一律显式拒绝（不返回空当成功）；
 *  - **顺序**：subtasks 按 dependsOn 链序；成环/悬空时回退稳定插入序（不抛）。
 *
 * @module dsh-pmboard/application/use-cases/TaskTree
 */
import type { UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import type { CardFootprint } from '../../domain/task/Footprint.js'
import type { TaskRecord } from '../../shared/protocol.js'
import { normalizeText, taskRoleIn } from '../../shared/protocol.js'
import { countDoneTasks } from '../../domain/status/Predicates.js'
import { fmt } from '../../domain/text/fmt.js'
import { requirementStoreOf, taskStoreOf } from './queue-access.js'
// t7（FR-8）：余量的**读取口、唯一算法与固定标注**都在输入包模块（两处展示共用一份口径），
// 这里只做「树顶层字段」的形状投影——本文件不重写一遍 try/catch，也不重写一遍减法。
import { CAPACITY_REFERENCE_NOTE, remainingTokensOf, safeContextPressure } from '../internal/node-input-package.js'
// REQ-261003191948-e94a：任务**读取**入口必须与写入入口走同一个工作区根收敛点。
// 此前本用例直连 deps.session.windowKey(exec)，绕过了 agentIdFromExec 里的根校正——
// 插件重载后 process.cwd() 不再是会话工作区，本入口便按错误的根读队列，
// 盘上明明有 queue.json 却报「任务不存在」（2026-10-03 实测）。
import { agentIdFromExec } from '../internal/support.js'

/** 树节点投影（design/data-model §新增视图模型）。 */
export interface TaskTreeNodeView {
  id: string
  title: string
  status: string
  role: 'parent' | 'subtask' | 'legacy'
  stageKind?: string
  dependsOn: string[]
  attempt?: number
  lastRunOk?: boolean
  reportSummary?: string
  cardDoc: string
  /** t7（FR-8）：卡片体量声明；**未声明 = 缺键**（不硬造、不冒充 0）。 */
  footprint?: CardFootprint
  /**
   * t7（FR-8）：声明状态——**恒在场**的派生字段（`footprint` 有没有）。
   * 存在的理由：只给 `footprint?` 时，"未声明"与"字段名写错/被白名单丢了"在返回体上同形；
   * 一个恒在场的 `undeclared` 让两者可区分（FR-9 的「未声明 ≠ 0」在展示层的落点）。
   */
  footprintState: 'declared' | 'undeclared'
}

export interface TaskTreeView {
  parent: TaskTreeNodeView
  subtasks: TaskTreeNodeView[]
  note: string
}

/**
 * 树摘要（REQ-261007100513-6749 FR-4 / design/data-model §逐项结果与树摘要类型）。
 *
 * 与 `TaskTreeResult.parents` **同形同源**（同一个 `TaskTreeView` 节点投影、同一条链序与同一句
 * note 文案）——写路径（`reqboard_task_move` 的批量回执）与读路径（`reqboard_task_tree`）共用
 * 这一份实现，避免"两套渲染口径必然分叉"（本仓已栽过多次）。
 */
export interface TaskTreeSummary {
  parents: TaskTreeView[]
}

/** 无子卡时的固定文案（design/data-model §I-3；测试与文档同源）。 */
const NOTE_NOT_EXPANDED = '该父卡尚未开工展开子卡链'

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

/**
 * 顶层余量参考视图（t7 / FR-8）；**不可得 → undefined**（调用方据此让键整体缺席，不发 null）。
 * `note` 恒在场：数值与「参考值，非门禁判据」必须在同一条展示内。
 */
export interface TreeContextPressureView {
  source: 'projection' | 'unavailable'
  contextWindow?: number
  projectedTokens?: number
  /** 余量 = contextWindow − projectedTokens；两者任一缺席 → 本字段缺席（不猜 0） */
  remainingTokens?: number
  note: string
}

export interface TaskTreeResult {
  success: boolean
  requirement_id: string
  parents: TaskTreeView[]
  /**
   * 当轮上下文余量参考（FR-8）：只读展示，**不可得 = 缺键**（不猜 0、不报错）。
   * 放在**顶层**而不是每卡：余量是「窗口/当轮」的量，不是卡的属性（design/interfaces.md §偏差）。
   */
  contextPressure?: TreeContextPressureView
  error?: string
}

/** 汇报摘要上限（字符）：tree 是"一眼看清"，不搬运全文（decision D-2 选 A）。 */
const REPORT_SUMMARY_MAX = 120

/** 单节点投影（只读字段；缺省字段不硬造）。 */
function nodeOf(task: TaskRecord, tasks: readonly TaskRecord[]): TaskTreeNodeView {
  const node: TaskTreeNodeView = {
    id: task.id,
    title: task.title,
    status: task.status,
    role: taskRoleIn(tasks, task),
    dependsOn: [...task.dependsOn],
    cardDoc: typeof task.cardDoc === 'string' && task.cardDoc.length > 0
      ? task.cardDoc
      : 'docs/requirements/' + task.requirementId + '/tasks/' + task.id + '.md',
    // 派生字段：**声明状态恒在场**（未声明也要说"未声明"，不能靠字段缺席表达）
    footprintState: task.footprint === undefined ? 'undeclared' : 'declared',
  }
  if (task.stageKind !== undefined) node.stageKind = task.stageKind
  if (task.attempt !== undefined) node.attempt = task.attempt
  if (task.lastRun !== undefined) node.lastRunOk = task.lastRun.ok
  // t7（FR-8）：显式白名单赋值——未声明 = **键不存在**（`footprint: undefined` 会被 JSON 化丢掉，
  // 也会让 `hasOwnProperty` 断言失真；本仓 legacy-refs 的兼容用例正是这样钉的）。
  if (task.footprint !== undefined) node.footprint = task.footprint
  if (task.lastReport !== undefined) {
    // 台账的 TaskReportSummary 只有 {at, reportIndex, filesChanged, completed}——**没有** summary
    // 文本字段，而本需求不新增台账字段（design/data-model §1）。摘要因此由既有事实派生，不另造字段。
    const head = task.lastReport.completed.length > 0 ? task.lastReport.completed.join('；') : '无完成项'
    node.reportSummary = clip(fmt('第 {n} 次汇报：{head}', { n: task.lastReport.reportIndex, head }), REPORT_SUMMARY_MAX)
  }
  return node
}

/**
 * 子卡链序：反复取"链内前置已就位"的卡。成环或悬空依赖时把剩余卡按插入序补回（**不抛**）——
 * 视图工具宁可少一点顺序保证，也不能因为脏数据让整个查询失败。
 */
function chainOrder(subs: readonly TaskRecord[]): TaskRecord[] {
  const ids = new Set(subs.map((s) => s.id))
  const remaining = [...subs]
  const ordered: TaskRecord[] = []
  const placed = new Set<string>()
  while (remaining.length > 0) {
    const idx = remaining.findIndex((s) => s.dependsOn.every((d) => !ids.has(d) || placed.has(d)))
    if (idx < 0) {
      ordered.push(...remaining)
      break
    }
    const next = remaining.splice(idx, 1)[0]
    if (next === undefined) break
    ordered.push(next)
    placed.add(next.id)
  }
  return ordered
}

function fail(code: string, requirementId: string, detail: string): TaskTreeResult {
  return { success: false, requirement_id: requirementId, parents: [], error: fmt('{code}：{detail}', { code, detail }) }
}

/**
 * 单根投影（父卡 + 链序子卡 + 一句 note）——**树视图的唯一实现**。
 *
 * REQ-261007100513-6749 t4：抽成可复用 helper，让**读路径**（`reqboard_task_tree`）与
 * **写路径**（`reqboard_task_move` 批量回执的 tree 摘要）共用同一份节点投影与 note 文案；
 * 两边各写一遍的话，"已完成 N 张"这类文案与链序很容易只在一边被改（本仓的老病）。
 *
 * 注意：这里先建变量再 `return`——本文件是 TaskTreeTool 的**响应源**，静态扫描把每个裸
 * `return {…}` 的顶层键当成工具响应键（`parent`/`subtasks`/`note` 会当场变红）；
 * 与 `contextPressureView` 同一个理由，不是绕门禁。
 */
function treeViewOf(parent: TaskRecord, inReq: readonly TaskRecord[]): TaskTreeView {
  const subs = chainOrder(inReq.filter((t) => t.parentId === parent.id))
  const done = countDoneTasks(subs)
  const note = subs.length === 0
    ? NOTE_NOT_EXPANDED
    : fmt('子卡链 {n} 张，已完成 {done} 张', { n: subs.length, done })
  const view: TaskTreeView = { parent: nodeOf(parent, inReq), subtasks: subs.map((s) => nodeOf(s, inReq)), note }
  return view
}

/**
 * 树摘要（一层）：给定任务快照与根集合（受影响父卡），投影成 `{parents:[…]}`。
 *
 * 只取一层、逐字复用 `TaskTreeNodeView`（design/data-model §树摘要的硬要求）。
 * 根不在快照里 → **跳过**（不硬造一个空壳节点）；根去重且保序（树的展示顺序要稳定）。
 */
export function treeSummaryOf(tasks: readonly TaskRecord[], rootIds: readonly string[]): TaskTreeSummary {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const roots: TaskRecord[] = []
  for (const id of rootIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const hit = byId.get(id)
    if (hit !== undefined) roots.push(hit)
  }
  const parents = roots.map((root) => treeViewOf(root, tasks))
  const summary: TaskTreeSummary = { parents }
  return summary
}

/** 有限数才算读数（NaN / Infinity 视为缺席——与适配器同一口径，不猜 0）。 */
function finiteOf(raw: number | undefined): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/**
 * t7（FR-8）：把当轮余量参考投影成顶层字段。**不可得 → undefined（键整体缺席）**：
 * 读取按 `safeContextPressure` 的口径（无端口 / 无方法 / 抛错都算不可得），
 * 快照 `source='unavailable'` 同样不算数——不猜 0、不发 null、更不报错。
 */
function contextPressureView(deps: UseCaseDeps, windowKey: string): TreeContextPressureView | undefined {
  const snap = safeContextPressure(deps.session, windowKey)
  if (snap === undefined || snap.source !== 'projection') return undefined
  const contextWindow = finiteOf(snap.contextWindow)
  const projectedTokens = finiteOf(snap.projectedTokens)
  // 三个读数一个都没有 → "投影可得"名不副实，按不可得处理（不返回一个只有 note 的空壳）
  if (contextWindow === undefined && projectedTokens === undefined) return undefined
  const remainingTokens = remainingTokensOf(snap)
  const view: TreeContextPressureView = {
    source: 'projection',
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(projectedTokens === undefined ? {} : { projectedTokens }),
    ...(remainingTokens === undefined ? {} : { remainingTokens }),
    note: CAPACITY_REFERENCE_NOTE,
  }
  // 为什么先建变量再 `return view`（而不是 `return {…}`）：本文件是 TaskTreeTool 的**响应源**，
  // `tests/output-contract.test.ts` 的静态扫描把这里每个 `return {` 字面量的顶层键当作工具响应键
  // ——`source`/`note` 是嵌套在 `contextPressure` 里的，写成字面量会被误判成"响应顶层键缺声明"。
  // 这不是绕门禁：真正的响应顶层键由下面那个 `return {…}` 继续守着（`contextPressure` 已被声明）。
  return view
}

/** 执行 reqboard_task_tree：只读、经端口、按窗口绑定（跨窗口不返回空当成功）。 */
export async function executeTaskTree(
  deps: UseCaseDeps,
  args: unknown,
  exec: unknown,
): Promise<TaskTreeResult> {
  const windowKey = agentIdFromExec(deps, exec)
  const a = (args ?? {}) as Record<string, unknown>
  // t8/B11：绑定读走新端口（只读摘要）
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)

  // 1. 目标需求：显式 requirement_id 优先（须绑定校验）；否则取本窗口绑定需求。
  let requirementId = normalizeText(a.requirement_id, 'requirement_id', 64)
  if (requirementId.length === 0) {
    const first = firstWritableBound(bound, windowKey)
    if (first === undefined) {
      return fail('REQBOARD_NO_BOUND_REQ', '', '本窗口未绑定需求，请传 requirement_id')
    }
    requirementId = first.id
  } else if (!bound.some((r) => r.id === requirementId)) {
    return fail('REQBOARD_NOT_BOUND_TO_WINDOW', requirementId, fmt('需求 {id} 不属于本窗口绑定的需求', { id: requirementId }))
  }

  const store = taskStoreOf(deps)
  const inReq = await store.listByRequirement(requirementId)
  const byId = new Map(inReq.map((t) => [t.id, t]))

  // 2. 根集合：显式 parent_id → 该卡；否则该需求下全部顶层卡（parentId 缺省）。
  const parentId = normalizeText(a.parent_id, 'parent_id', 64)
  let roots: TaskRecord[]
  if (parentId.length > 0) {
    const task = byId.get(parentId)
    if (task === undefined) {
      const anywhere = await store.get(parentId)
      if (anywhere === undefined) return fail('REQBOARD_TASK_NOT_FOUND', requirementId, fmt('任务不存在：{id}', { id: parentId }))
      return fail('REQBOARD_NOT_BOUND_TO_WINDOW', requirementId,
        fmt('任务 {id} 属于需求 {req}，不属于本窗口绑定的需求', { id: parentId, req: anywhere.requirementId }))
    }
    roots = [task]
  } else {
    roots = inReq.filter((t) => t.parentId === undefined)
  }

  // 3. 逐根投影（父卡 + 链序子卡）——节点与 note 的唯一实现见 treeViewOf（写路径共用同一份）。
  const parents: TaskTreeView[] = roots.map((parent) => treeViewOf(parent, inReq))

  // t7（FR-8）：顶层余量参考（只读；不可得 = 键缺席）。
  const contextPressure = contextPressureView(deps, windowKey)

  return {
    success: true,
    requirement_id: requirementId,
    parents,
    ...(contextPressure === undefined ? {} : { contextPressure }),
  }
}
