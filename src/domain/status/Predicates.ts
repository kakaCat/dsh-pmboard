/**
 * 状态判定（REQ-47939a t7 / INV-2）——**按意图命名**的判定函数，适配层只调用它们。
 *
 * 为什么不是"通用比较器 + 调用处传状态字面量"（首版就是这么写的，2026-09-17 改掉）：
 * 那只把**比较运算符**搬进了 domain，规则（"哪个状态算验收态"）仍写在适配层 —— 而 INV-2
 * 要的是规则单点。实测：首版在 src/http/routers/ 留下 25 处 `statusIs(x, 'accepting')` 这类写法；
 * 当时层边界门禁只查 `===` 不查 `!==`，于是**假绿**。门禁补齐后全部暴露，本模块据此改成命名判定，
 * 把"那个状态到底算不算 X"这句话只写在**这一处**。
 *
 * 约束：domain 不得 import shared/protocol（层门禁），故此处只收结构化最小投影（`{ status }`），
 * 不引用台账 Record 类型。
 *
 * @module dsh-pmboard/domain/status/Predicates
 */

import { computeLayers } from '../queue/topology.js'

type HasStatus = { status: string }

// ── 需求（RequirementStatus）───────────────────────────────────────────────

/** 是否处于验收态（人工审核中）。 */
export function isAccepting(req: HasStatus): boolean {
  return req.status === 'accepting'
}

/** 是否处于实施态。 */
export function isImplementing(req: HasStatus): boolean {
  return req.status === 'implementing'
}

/** 是否处于可提交/裁决验收的阶段（实施态或验收态）——verify 与 verdicts 的前置。 */
export function isVerifiableStage(req: HasStatus): boolean {
  return req.status === 'implementing' || req.status === 'accepting'
}

/** 是否已归档。 */
export function isArchived(req: HasStatus): boolean {
  return req.status === 'archived'
}

/**
 * 收尾闭环判定所需的最小投影（domain 不 import 台账类型，层门禁要求）。
 *
 * 两个"材料已交"的信号都认：`archive` 记录（submitArchive 写入的材料本体）与
 * `artifacts` 里的 `kind==='archive'` 产物（产物簿登记）。二者任一在场即算闭环——
 * 只认产物簿会在"材料已写但产物未登记"时误报，只认记录则与 projectRequirement 口径不一致。
 */
type ClosingShape = {
  status: string
  artifacts?: readonly { kind?: string }[]
  archive?: unknown
}

/** 收尾缺口的取值（REQ-261001154450-b918 FR-6）。 */
export type ClosingGap = 'archive_missing'

/**
 * 收尾闭环缺口（FR-6）：已归档但**没有归档材料产物** → 'archive_missing'；否则 undefined。
 *
 * 为什么由 domain 推导而不是落盘一个冗余字段：闭环与否完全由 (status, artifacts) 决定，
 * 多存一份就多一处会与真相漂移的地方。
 */
export function closingGapOf(req: ClosingShape): ClosingGap | undefined {
  if (req.status !== 'archived') return undefined
  const hasArchiveRecord = req.archive !== undefined && req.archive !== null
  const hasArchiveArtifact = (req.artifacts ?? []).some(a => a.kind === 'archive')
  return hasArchiveRecord || hasArchiveArtifact ? undefined : 'archive_missing'
}

/** 是否已闭环（归档 + 归档材料齐）。 */
export function isClosed(req: ClosingShape): boolean {
  return isArchived(req) && closingGapOf(req) === undefined
}

/** 是否已取消。 */
export function isCanceled(req: HasStatus): boolean {
  return req.status === 'canceled'
}

// ── 任务活卡判据与依赖判定（REQ-261005193546-1b1a FR-1 / FR-4；D-8 口径单点）──────────
//
// 为什么这九个函数落在这里、而不是新建 `domain/task/TaskLiveness.ts`（该变体落点已作废）：
// 本文件已经是「按意图命名的状态判定」的唯一事实源（文件头 INV-2），而活卡判据就是既有
// `isCanceled` 的**取反复用**——另起一个模块只会给下游留出「两条 import 路径、两套口径」的
// 空间，而本需求要修的正是口径漂移（依赖判定四处各写一份、层号两处各算一次）。
// 本块紧邻 `isCanceled` 追加：① 就是它。
//
// 签名唯一一套以 design/interfaces.md §3.2 为准（`liveReadyTasks` 返回 `string[]`、
// `layerInputOf` 返回 `T[]`）；architecture.md 里的变体名与变体签名作废。
//
// 全部为纯函数：无 IO、无时钟、无随机、**不改入参**（返回的数组/对象要么是新的，要么按引用
// 复用输入元素——输入对象与输入数组本身一律不写）。

/**
 * ① 单卡判据（唯一）：不是已取消。
 *
 * 全仓的「活卡」判断只允许走这里；消费点再写 `status !== 'canceled'` 就是本需求要冻掉的
 * 漂移源（存量点按设计 §8 基线冻结、不得新增）。实现**复用** `isCanceled`，不重写比较式。
 */
export function isLiveTask<T extends HasStatus>(task: T): boolean {
  return !isCanceled(task)
}

/**
 * ② 集合判据（唯一）：活卡集合。返回**新数组**；顺序 = 输入顺序；元素按引用返回（不做深拷贝
 * ——判据不改元素，深拷贝只会把「同一次读里的同一个对象」变成两份）。
 */
export function liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[] {
  return tasks.filter((task) => isLiveTask(task))
}

/**
 * ③ 计数 / 分母 helper（与②同源）：活卡数 = 看板投影与完成度的**分母**。
 *
 * 存在意义：堵住「过滤用一套、分母另抄一套」——分母错一位，完成度就永久说谎，而且因为
 * 过滤与计数各自「看起来对」，review 与测试都不报。
 */
export function liveCountOf(tasks: readonly HasStatus[]): number {
  return liveTasksOf(tasks).length
}

/**
 * ④ 依赖是否已满足：`done` 或 `canceled`（视为已了结），或该依赖 id **不在给定集合里**（缺席）。
 *
 * 口径来源：逐字等于 `application/use-cases/queue-access.ts` 的 `readyTasksOf` 今天的判定，
 * 只是把单点**上移**到 domain（domain 的 `computeReady` 不许 import application，只能由
 * application 反向复用本函数）。
 *
 * ⚠️ 语义边界（设计 §3.2 如实声明）：把「缺席 = 已满足」写进判据，等于**脏引用从「保守不放行」
 * 变为「放行」**。这是让「取消卡不再阻塞活卡」成立的最小充分口径（上游只喂活卡集合时，指向
 * 取消卡的边必然表现为缺席）；脏引用的兜底是 `validateQueue.ts` 的 V-3，不是静默吞掉。
 * 执行者不得据此扩大（例如「自身状态非 todo 也放行」）。
 */
export function isDependencySatisfied(dep: HasStatus | undefined): boolean {
  return dep === undefined || dep.status === 'done' || isCanceled(dep)
}

/** 依赖边的三个桶（唯一约束桶 = `pending`，见 `DependencyEdgeSplit`）。 */
export type DependencyBucket = 'satisfied' | 'pending' | 'dangling'

/**
 * 依赖边三分类：「待分层集合」与「已满足边集合」在此定死。
 *
 * 返回语义（定死）：约束**只有 `pending` 一个桶**。`satisfied` 与 `dangling` 都不构成约束；
 * 分列只为可诊断（`dangling` 是 V-3 该报的脏引用，不是可以静默算进 satisfied 的东西）。
 */
export interface DependencyEdgeSplit {
  /** 已满足边（指向 done / canceled 卡）：不构成约束 */
  satisfied: string[]
  /** 待分层边（指向未完成的活卡）：**唯一**参与分层与阻塞 ready 的桶 */
  pending: string[]
  /** 缺席边（id 不在给定集合）：不参与分层（沿用 computeLayers「忽略悬空」），ready 侧按已满足放行 */
  dangling: string[]
}

/**
 * ⑤ 把一条卡的 `dependsOn` 分桶。纯函数；**不改入参**；顺序 = `dependsOn` 原顺序
 * （重复项不去重：`dependsOn` 原样有什么就分什么，去重是校验 V-2/V-3 的活）。
 */
export function splitDependencyEdges<T extends HasStatus & { dependsOn?: readonly string[] }>(
  task: T,
  byId: ReadonlyMap<string, HasStatus>,
): DependencyEdgeSplit {
  const satisfied: string[] = []
  const pending: string[] = []
  const dangling: string[] = []
  for (const dep of task.dependsOn ?? []) {
    if (!byId.has(dep)) {
      // 缺席：id 不在给定集合里（含「指向已取消卡，而集合只喂活卡」这一形态）
      dangling.push(dep)
      continue
    }
    // 在场但未了结（todo / in_progress / integrating / testing / in_review）= 唯一约束桶
    if (isDependencySatisfied(byId.get(dep))) satisfied.push(dep)
    else pending.push(dep)
  }
  return { satisfied, pending, dangling }
}

/**
 * ⑥ 就绪判据单点：自身 `todo` 且**约束桶（pending）为空**。
 *
 * 等价于设计 §3.2 的 `task.status === 'todo' && (task.dependsOn ?? []).every(d => isDependencySatisfied(...))`
 * ——写成「pending 桶为空」是为了让「唯一约束桶 = pending」这条契约**结构性成立**，而不是
 * 靠两处逻辑碰巧一致（用例里对两种写法做了等值断言）。
 */
export function isReadyTask<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  task: T,
  byId: ReadonlyMap<string, HasStatus>,
): boolean {
  if (task.status !== 'todo') return false
  return splitDependencyEdges(task, byId).pending.length === 0
}

/**
 * ⑦ 分层输入：活卡集合，且每条活卡的 `dependsOn` 只保留**指向活卡**的边（指向取消卡的边按
 * 已满足剔除）。
 *
 * 语义：`computeLayers(layerInputOf(tasks))` ≡「把指向取消卡的边删掉后重算」。
 * 为什么显式剔除、而不是只靠「喂活卡集合」：`computeLayers` 对悬空依赖本就「忽略」，喂活卡
 * 集合已等价；**显式剔除把口径写进契约**，不依赖 `computeLayers` 将来的悬空策略（那份策略
 * 本届就在改）。未发生删边的卡按引用返回；发生删边的卡返回浅拷贝——输入对象一律不动。
 *
 * ⚠️ 泛型约束**必须含 `id: string`**（t1 复核裁定）：剔边靠「活卡 id 集合」判定，签名若不约束
 * `id`，调用点可以喂进没有 id 的入参，编译期不报、运行期该卡的 `id` 读出 `undefined` ⇒ `liveIds`
 * 缺项 ⇒ 它的**所有前置边都被当悬空剔掉**，静默降级成「无活卡前置」（层号与就绪判定同时失真）。
 * `id` 不是可选宽容项，它是本函数的**输入前提**，故写进约束由编译器守。
 */
export function layerInputOf<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): T[] {
  const live = liveTasksOf(tasks)
  const liveIds = new Set<string>()
  for (const task of live) liveIds.add(task.id)
  return live.map((task) => {
    const deps = task.dependsOn
    if (deps === undefined) return task
    const kept = deps.filter((dep) => liveIds.has(dep))
    return kept.length === deps.length ? task : { ...task, dependsOn: kept }
  })
}

/** `computeLayers` 的入参类型（只用于桥接：本文件不 import 台账 Record 类型，层门禁要求）。 */
type LayerComputeInput = Parameters<typeof computeLayers>[0]

/**
 * ⑧ 分层对象单点：全量任务 → 活卡 id → 层号（**只含活卡**，取消卡不进 map）。
 *
 * 实现 = `computeLayers(layerInputOf(tasks))` 的 (id → layer) 索引 ⇒ 与写路径
 * （`normalizeQueueFile` → `computeLayers`）**同一套分层算法**，不另写一份 Kahn。
 *
 * 类型桥接说明：`computeLayers` 实际只读 `id` 与 `dependsOn`（见 `topology.ts` 的 Kahn 实现），
 * 入参形状远宽于本函数的结构化最小投影（`QueueTask extends TaskRecord` 有 20+ 必填字段），
 * 故这里做一次显式断言把类型安全丢掉；对外签名仍是 §3.2 的形状，且不断言任何字段的取值。
 * 有环时与 `computeLayers` 同款抛 `CIRCULAR_DEPENDENCY`：删点/删边不可能**制造**环，所以
 * 「活卡子图有环」只能来自原图本来就有环——宁可让调用方看见，也不静默返回一份无层号的图。
 */
export function liveLayers<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): ReadonlyMap<string, number> {
  const layers = computeLayers(layerInputOf(tasks) as unknown as LayerComputeInput)
  const out = new Map<string, number>()
  for (const group of layers) {
    for (const id of group.tasks) out.set(id, group.layer)
  }
  return out
}

/**
 * ⑨ 就绪集合单点：全量任务 → ready id（顺序 = 输入顺序）。
 *
 * 关键语义：`byId` 索引建在**活卡集合**上 ⇒ 指向取消卡的依赖表现为「缺席」= 已满足。
 * 与 `queue-access.readyTasksOf` / `computeReady` / `shared readyTasks` 同一判据（设计 §3.3 表）。
 * 结果里不会有取消卡：`isReadyTask` 要求自身 `todo`，而 `todo` 必是活卡。
 */
export function liveReadyTasks<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): string[] {
  const byId = new Map<string, HasStatus>(
    liveTasksOf(tasks).map((task): [string, HasStatus] => [task.id, task]),
  )
  return tasks.filter((task) => isReadyTask(task, byId)).map((task) => task.id)
}

/** 是否未归档（含进行中与已取消——"这条需求还在册否"的宽松判定）。 */
export function isNotArchived(req: HasStatus): boolean {
  return req.status !== 'archived'
}

/** 是否为看板"活跃需求"（未归档且未取消）。 */
export function isActiveRequirement(req: HasStatus): boolean {
  return req.status !== 'archived' && req.status !== 'canceled'
}

/**
 * 是否处于**进行中**（未进入终态 done/archived/canceled）。
 * 窗口绑定判定与"会话框流程节点"选目标需求共用此判据——此前 `OPEN_STATUSES` 在
 * application/internal/window.ts 私下定义、路由层却引用了一个**不存在的名字**，
 * 结果 /session/:id/progress 运行时 ReferenceError（HTTP 500 → 流程节点不显示）。
 * 现单点于此。
 */
export function isOpenRequirement(req: HasStatus): boolean {
  return req.status !== 'done' && req.status !== 'archived' && req.status !== 'canceled'
}

/** 是否处于立项态。 */
export function isDraft(req: HasStatus): boolean {
  return req.status === 'draft'
}

// ── 任务（TaskStatus）──────────────────────────────────────────────────────

/** 是否处于开工态（已开始一次执行段）。 */
export function isInProgressTask(task: HasStatus): boolean {
  return task.status === 'in_progress'
}

/** 是否为**处理中**任务（既非 todo，也非 done/canceled）。 */
export function isUnfinishedTask(task: HasStatus): boolean {
  return task.status !== 'todo' && task.status !== 'done' && task.status !== 'canceled'
}

/** 目标状态是否为"开工"（开始一次执行段）。 */
export function startsExecutionSegment(to: string): boolean {
  return to === 'in_progress'
}

/** 目标状态是否会结束一次执行段（todo/done/canceled 都不代表"正在执行"）。 */
export function endsExecutionSegment(to: string): boolean {
  return to === 'todo' || to === 'done' || to === 'canceled'
}

/** 目标状态是否为"回退或取消"（执行段结算为 cancelled）。 */
export function isRollbackOrCancel(to: string): boolean {
  return to === 'canceled' || to === 'todo'
}

// ── 验收单项（VerificationItem.status）────────────────────────────────────

/** 单项是否通过。 */
export function isPassedItem(i: HasStatus): boolean {
  return i.status === 'passed'
}

/** 单项/状态字面量是否未通过。 */
export function isFailedItem(i: HasStatus | string): boolean {
  return (typeof i === 'string' ? i : i.status) === 'failed'
}

/** 单项是否待裁决。 */
export function isPendingItem(i: HasStatus): boolean {
  return i.status === 'pending'
}

/**
 * 单项是否"通过了但没留下实际结果"（REQ-261001154450-b918 FR-1）。
 *
 * 为什么要有第三态：弹框在本机是「选项 **或** 自定义输入」二选一，选"通过"时拿不到文本。
 * 旧实现写一句占位文案仍记 passed——台账上分不清"复核过"与"没复核"。
 * unverified = 人点过通过、但证据留白：**不计入通过**，需求不得据此归档。
 */
export function isUnverifiedItem(i: HasStatus): boolean {
  return i.status === 'unverified'
}

/** 单项是否不可验收（无法按要求验，须带原因）。REQ-308b9a FR-9。 */
export function isNotVerifiableItem(i: HasStatus): boolean {
  return i.status === 'not_verifiable'
}

/** 是否为可裁决的单项状态（passed / failed / not_verifiable；pending 不是裁决结果）。 */
export function isDecidableItemStatus(status: string): boolean {
  return status === 'passed' || status === 'failed' || status === 'not_verifiable'
}

/** 待裁决项计数。 */
export function countPendingItems(items: readonly HasStatus[]): number {
  return items.filter(i => i.status === 'pending').length
}

/** 已通过项计数。 */
export function countPassedItems(items: readonly HasStatus[]): number {
  return items.filter(i => i.status === 'passed').length
}

/** 未通过项计数。 */
export function countFailedItems(items: readonly HasStatus[]): number {
  return items.filter(i => i.status === 'failed').length
}

/** 不可验收项计数。 */
export function countNotVerifiableItems(items: readonly HasStatus[]): number {
  return items.filter(i => i.status === 'not_verifiable').length
}

/** 是否全部项都已通过（"验收全过"这条规则的唯一实现）。 */
export function isEveryItemPassed(items: readonly HasStatus[]): boolean {
  return items.every(i => i.status === 'passed')
}

/**
 * 是否全部项已裁决（无 pending、**且无 unverified**）——REQ-308b9a FR-9 的放行判据。
 *
 * REQ-261006092213-4f5b FR-6 / D-5：`unverified`（人点了通过却没有结果）**不算已裁决**——
 * 它与 domain 的 `sheetGateStatus` / `isFullyDecided` 必须同口径，否则"全未复核"会被报成
 * "已全部裁决"，调用方据此放行未复核单（同一份验收单两个相反结论）。
 */
export function isFullyDecidedItems(items: readonly HasStatus[]): boolean {
  return items.every(i => i.status !== 'pending' && i.status !== 'unverified')
}

// ── 任务计数（看板投影用；"done 才算完成"这条规则留在 domain）──────────────

/** 已完成任务计数。 */
export function countDoneTasks(tasks: readonly HasStatus[]): number {
  return tasks.filter(t => t.status === 'done').length
}

/** 处理中（未完成）任务计数。 */
export function countUnfinishedTasks(tasks: readonly HasStatus[]): number {
  return tasks.filter(isUnfinishedTask).length
}

// ── 产物（登记阶段）───────────────────────────────────────────────────────

/** 产物是否登记在验收阶段。 */
export function isAcceptingStage(stage: string): boolean {
  return stage === 'accepting'
}
