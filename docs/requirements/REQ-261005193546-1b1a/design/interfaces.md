---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 接口设计（REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡）

> 契约源：`requirement.md`（FR-1~FR-6 / D-1~D-8）+ `prototypes/dag-canceled-hidden.html`（权威原型的观测量定义）。
> 父窗口裁定（本份据其收紧范围、扩大接线，逐条落在下文）：① 「依赖图已过滤」不成立，DAG 面板与 `/state` 一并接线；② 层号写读同源、按活卡算；③ 依赖判定三处（+校验一处）收敛；④ 不全仓替换，其余 54 处登记为基线；⑤ RTM 两个公开入口都收敛；⑥ 文档面板界面不列。
> 边界：本份定**接口形态、判据与落点**；字段级模型（类型/必填/默认/迁移）见 `data-model.md`。**本需求不新增任何错误码**（§7）。
> 行号口径：下文行号 = 设计时 `grep -n` 实测值，**仅用于定位**；执行者按符号名接线（重构后行号会漂）。

## 1. 契约总览与落点表 <!-- serves: FR-1, FR-4 -->

| # | 接口 | 形态 | 落点 | 服务条款 |
|---|---|---|---|---|
| 1 | 活卡判据单点 `isLiveTask` / `liveTasksOf` / `liveCountOf` | domain 纯函数（泛型） | `src/domain/status/Predicates.ts` | FR-4 |
| 2 | 依赖判定单点 `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` | domain 纯函数 | `src/domain/status/Predicates.ts`（口径源：`queue-access.readyTasksOf:59` 今天的行为） | FR-1（D-8） |
| 3 | 分层输入 `layerInputOf` | domain 纯函数 | `src/domain/status/Predicates.ts` + `src/domain/queue/normalizeQueueFile.ts`（写路径） | FR-1（D-8） |
| 4 | 视图投影接线（DAG 层级 / DAG 面板 / `/state`） | 调用点接线（无新签名） | `QueryStageDetail.ts`、`QueryDag.ts`、`routes/stages.ts:handleState`、`QueryDocs.ts`、`QueryReport.ts`、`QueryState.ts` | FR-1、FR-2、FR-5 |
| 5 | RTM 喂入入口收敛 | 既有签名不变、入口口径收紧 | `src/application/internal/rtm-yaml.ts`（`syncRTMYaml` / `syncRTMYamlWithSnapshot`） | FR-2 |
| 6 | 取消留痕写侧 `markCanceled` | application 写 helper | `src/application/internal/task-transition.ts`（4 个取消入口共用） | FR-3 |
| 7 | 错误语义 | **无新增**（显式声明） | — | FR-6 |
| 8 | 反面断言：字面量基线 + 「新增即红」 | 测试断言（无生产签名） | 新建断言 + 基线清单（§8） | FR-4 |

## 2. 活卡判据单点（FR-4） <!-- serves: FR-4 -->

**落点**：`src/domain/status/Predicates.ts` —— 与既有 `isCanceled`(:75) / `isUnfinishedTask`(:113) / `countDoneTasks` 同址。**不新建模块**：该文件已经是「按意图命名的状态判定」的唯一事实源（文件头写明 INV-2：适配层只调用判定函数，不得写比较式）。

```ts
// src/domain/status/Predicates.ts（既有内部形状，domain 不许 import shared）
type HasStatus = { status: string }

/** ① 单卡判据（唯一）：不是已取消。纯函数——无 IO、无时钟、无随机、不改入参。 */
export function isLiveTask(task: HasStatus): boolean
// 语义：等价于 !isCanceled(task)；实现必须复用 isCanceled，禁止再写一遍 status !== 'canceled' 字面量比较。

/** ② 集合判据（唯一）：活卡集合。返回**新数组**；顺序 = 输入顺序；深拷贝不必要（元素按引用返回即可）。 */
export function liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[]

/** ③ 计数 / 分母 helper（与②同源）：活卡数。 */
export function liveCountOf(tasks: readonly HasStatus[]): number
```

| 项 | 规定 |
|---|---|
| 分母口径 | **分母 = 活卡数**（`liveCountOf`）。不是「完成的活卡数」、不是「父卡数」、不是「层数」 |
| 不变量（可断言） | 对任意输入：`liveCountOf(t) === liveTasksOf(t).length`；`liveTasksOf(t)` 的每个元素 `isLiveTask` 为真；`liveTasksOf` 不修改入参 |
| 为什么不新造计量粒度 | requirement「不做」第 5 条与 D-6：一卡一行的地方**仍一卡一行**，只做「剔除已取消」这一件事。新造「有效卡/父卡/层」等粒度会让本次改动从「收口径」变成「换计量」，下游所有读数含义随之改变 |
| 泛型目的 | domain 不许 import `shared/protocol.ts`（`tests/layer-boundary.test.ts` 机械检查）⇒ 泛型让调用点拿回 `TaskRecord[]`，不必 `as` 断言（`liveTasksOf(tasks): TaskRecord[]`） |
| 入参宽容 | 只吃 `{ status }`：`TaskRecord` / `QueueTask` / 客户端最小形状（`subtask-view.ts` 的 `{status:string}`）都能直接传 |
| 禁止 | 任何消费点再写 `status !== 'canceled'`；存量点按 §8 基线冻结、**不得新增** |
| 不做 | 不物理删除（D-1）；不提供「显示已取消」开关（D-3）；界面不给任何计数交代（D-7） |

**命名定稿（唯一一套，全仓对齐；其他文档的变体名一律改到这一套）**：

| 族 | 名字 | 定义处 | 本份章节 |
|---|---|---|---|
| 活卡 | `isLiveTask` / `liveTasksOf` / `liveCountOf` | §2 | 本节 |
| 依赖侧四个 | `isDependencySatisfied` / `splitDependencyEdges` / `liveReadyTasks` / `liveLayers` | §3.2 | §3.2 |
| 依赖侧配套（上面两个单卡/输入的细化） | `isReadyTask`（`liveReadyTasks` 的单卡判据）/ `layerInputOf`（`liveLayers` 的分层输入） | §3.2 / §3.3 | §3.2、§3.3 |

> 已知变体名（**必须改**）：`liveCounts` → `liveCountOf`；`liveTasks` → `liveTasksOf`；`liveReady` → `liveReadyTasks`。模块落点固定 `src/domain/status/Predicates.ts`（**不新建模块**，如 `domain/task/TaskLiveness.ts` 这类落点作废）。

## 3. 依赖判定单点：三处 ready + 层号（FR-1 / D-8） <!-- serves: FR-1 -->

### 3.1 改前缺陷（三处口径漂移 ⇒ 活卡被取消卡永久卡死） <!-- serves: FR-1, FR-4 -->

| # | 位置 | 改前判据 | 后果 |
|---|---|---|---|
| 1 | `src/domain/queue/topology.ts:129` `computeReady` | `deps.every(dep => byId.get(dep)?.status === 'done')`；悬空 = 未满足 | 活卡的依赖指向已取消卡 ⇒ 该卡**永不 ready**（被取消的卡永远不会 done）⇒ 自动链停在这一步，需人工解结 |
| 2 | `src/shared/protocol.ts:1817` `readyTasks` | 同上（只认 `done`） | `/state` 下发 `ready` 缺这张活卡（`routes/stages.ts:99`）⇒ 看板「可并行/可开工」提示与真实可开工集不一致 |
| 3 | `src/application/use-cases/queue-access.ts:59` `readyTasksOf` | `undefined \| done \| canceled` = 满足 ✅ | **已经是 D-8 口径**，但只有执行路径用它 ⇒ 与 1、2 漂移 |
| 4 | `src/domain/queue/validateQueue.ts:245`（V-5 假就绪） | `byId.get(dep)?.status !== 'done'` | 未改则**硬阻断**：写路径按新口径算出 `ready`、V-5 按旧口径判「假就绪」⇒ `QUEUE_VALIDATION_FAILED` 拒绝自己刚算出的队列 |
| 5 | 同上但方向相反：**读侧**（`QueueRepository.load:183` 也跑同一套 V-5） | 磁盘 `ready[]` 是**旧口径**写的快照 | 活卡 `todo` 且依赖已取消卡时，新口径下它应 ready 而磁盘 `ready[]` 没有它 ⇒ V-5「漏就绪」⇒ `load` 判不可用 ⇒ **整份队列按空处理（界面空白）**。处置见 §3.3「读侧重算」 |

### 3.2 接口 <!-- serves: FR-1, FR-4 -->

```ts
// 落点：src/domain/status/Predicates.ts（最内层，四处都能复用；domain 不许 import application）

/** 依赖是否已满足：done 或 canceled（视为已了结），或该依赖 id 不在给定集合里（缺席）。 */
export function isDependencySatisfied(dep: HasStatus | undefined): boolean
// = dep === undefined || dep.status === 'done' || dep.status === 'canceled'
// 口径来源：逐字等于 queue-access.readyTasksOf:65 今天的判定（父窗口裁定：以它为语义单点，
// 把口径**上移**到 domain——因为 domain 的 computeReady 不许 import application，
// 只能由 application 反向复用它。readyTasksOf 自身改为调用本函数，行为逐字不变）。

export type DependencyBucket = 'satisfied' | 'pending' | 'dangling'

/** 依赖边三分类：「待分层集合」与「已满足边集合」在此定死。 */
export interface DependencyEdgeSplit {
  /** 已满足边（指向 done / canceled 卡）：不构成约束 */
  satisfied: string[]
  /** 待分层边（指向未完成的活卡）：**唯一**参与分层与阻塞 ready 的桶 */
  pending: string[]
  /** 缺席边（id 不在给定集合）：不参与分层（沿用 computeLayers「忽略悬空」），ready 侧按已满足放行 */
  dangling: string[]
}

/** 把一条卡的 dependsOn 分桶。纯函数；不改入参；顺序 = dependsOn 原顺序。 */
export function splitDependencyEdges(
  task: HasStatus & { dependsOn?: readonly string[] },
  byId: ReadonlyMap<string, HasStatus>,
): DependencyEdgeSplit

/** 就绪判据单点：自身 todo 且全部依赖 satisfies。 */
export function isReadyTask(
  task: HasStatus & { dependsOn?: readonly string[] },
  byId: ReadonlyMap<string, HasStatus>,
): boolean
// = task.status === 'todo' && (task.dependsOn ?? []).every(d => isDependencySatisfied(byId.get(d)))

/** 就绪集合单点（依赖侧四个之一）：全量任务 → ready id（顺序 = 输入顺序）。 */
export function liveReadyTasks<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): string[]
// = tasks.filter(x => isReadyTask(x, byIdOf(liveTasksOf(tasks)))).map(x => x.id)
// 语义要点：byId 索引建在**活卡集合**上（指向取消卡的依赖因此表现为「缺席」= 已满足）；
// 与 queue-access.readyTasksOf / computeReady / shared readyTasks 同一判据（§3.3 表）。

/** 分层对象单点（依赖侧四个之一）：全量任务 → 活卡 id → 层号。 */
export function liveLayers<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): ReadonlyMap<string, number>
// = computeLayers(layerInputOf(tasks)) 的 (id → layer) 索引；**只含活卡**（取消卡不进 map）
// 不变量：对任意活卡 x，liveLayers(T).get(x.id) === 「把指向取消卡的边删掉后重算」的层号（A2）
```

**返回语义（定死）**：约束只有 `pending` 一个桶。`satisfied` 与 `dangling` **都不构成约束**；分列只为可诊断（`dangling` 是 V-3 该报的脏引用，不是静默吞掉的东西）。

**⚠️ 语义边界（如实声明）**：把「缺席 = 已满足」写进判据，意味着**脏引用（`dependsOn` 写了不存在的 id）从「保守不放行」变为「放行」**。这是让「取消卡不再阻塞」成立的最小充分口径（上游只喂活卡集合时，指向取消卡的边必然表现为缺席），代价是脏引用不再阻塞执行。**兜底**：脏引用由 `validateQueue.ts` 的 V-3 检出（`dependsOn 引用了不存在的任务`）。该放宽已在父窗口裁定内，但**执行者不得扩大**（不得顺手把「自身状态非 todo 也放行」之类写进去）。

### 3.3 层号：写读同源、按活卡算 <!-- serves: FR-1, FR-2 -->

```ts
/** 分层输入：活卡集合，且每条活卡的 dependsOn 只保留指向活卡的边（指向取消卡的边按已满足剔除）。 */
export function layerInputOf<T extends HasStatus & { dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): T[]
```

语义：`computeLayers(layerInputOf(tasks))` ≡ 「把指向取消卡的边删掉后重算」（FR-1 判据 A2 的口径）。
为什么显式剔除而不是只靠「喂活卡集合」：`computeLayers` 对悬空依赖本就「忽略」（`topology.ts` 头注），喂活卡集合已等价；**显式剔除把口径写进契约**，不依赖 `computeLayers` 将来的悬空策略（那份策略本届就在改，见 §3.1 #1）。

| 位置 | 改后 |
|---|---|
| `src/domain/queue/normalizeQueueFile.ts`（写路径，经 `computeLayers`） | 分层输入 = `layerInputOf(file.tasks)`；`layers[]` 只含活卡；**取消卡的 `layer` 冻结**（保留取消时刻的值，不再重算） |
| `src/domain/queue/topology.ts` `computeReady` | 改用 `isReadyTask`（缺省口径 = 取消视为了结、缺席放行） |
| `src/shared/protocol.ts:1817` `readyTasks` | 删除手写 `every(...)`，改调 `isReadyTask`（shared 已 import domain，合法） |
| `src/application/use-cases/queue-access.ts:59` `readyTasksOf` | 行为逐字不变，改为调用 `isReadyTask`（语义单点） |
| `src/domain/queue/validateQueue.ts:245` V-5 | **必须同改**为 `!isDependencySatisfied(byId.get(dep))`（否则 §3.1 #4 的硬阻断） |
| `src/application/query/QueryDag.ts:203` `layerIndexOf` | 不改（读队列落盘 `layer`）——写路径已按活卡算 ⇒ 写读同源；但**喂入的任务列表必须只含活卡**（§4 落点 2）；若落盘值陈旧，按下面的「读侧重算」处置 |
| 客户端 `src/client/views/dag-view.ts:100` `layerOf` / `src/client/dag/dag-layout.ts:62` | 不改：客户端按折叠后的 deps 现算层号，而 `collapseToCardLevel`（`client/dag/progress-bar.ts:220`）**丢弃悬空边** ⇒ 上游喂活卡集合即等价于删边 |

**读侧重算：陈旧 `ready[]` / `layer` 一律内存重算、不写盘（父窗口裁定③）**

| 面 | 规定 |
|---|---|
| `QueueRepository.load:157`（读） | 读完 + `JSON.parse` 后，按**当前判据**重算派生字段（`ready` 用 `liveReadyTasks`、活卡 `layer`/`layers` 用 `liveLayers`/`layerInputOf`），**重算结果只用于本次返回对象与校验输入**：`validateQueueFile` 拿重算后的视图判 V-1~V-6；**磁盘一字不动、无写回**（FR-6：读取前后逐字节一致） |
| 为什么必须这样 | 否则 §3.1 #5：磁盘 `ready[]` 是旧口径快照，活卡（`todo` 且依赖已取消卡）在新口径下应 ready 而旧快照没有它 ⇒ V-5「漏就绪」⇒ `load` 把**整份队列**判为不可用 ⇒ 界面空白。这属于「读侧兼容」而不是「放宽校验」 |
| `QueueRepository.save:196`（写） | **仍强校验、fail-closed**：写盘前按同一口径重算（由 `normalizeQueueFile` 承担），`validateQueueFile` 不过 ⇒ 抛 `QUEUE_VALIDATION_FAILED`、一个字节都不落盘（既有行为逐字不变） |
| 与零写回的边界 | `load` 里不得因为「重算结果与磁盘不同」而回写；也不得新增「读时修复」路径（那是迁移，本需求明令不做） |
| 本工作区实测 | `docs/requirements/*/queue.json` 共 **62 份**：活卡依赖已取消卡的边 **0 条**、新口径 ready 与磁盘 `ready[]` 的差集 **0 条** ⇒ **当前 0 例触发**；该重算是**预防性**的（形状可构造，见 §3.1 #5） |

**V-4 是否会因「取消卡 layer 冻结」报错？**（`validateQueue.ts:195-235`）

- 结论：**不会**。分析：活卡层号 ≤ 全量口径下的层号（删节点不会抬高任何层）；取消卡的冻结层号 = 全量口径下算出、且严格大于其每个前置的层号 ⇒ 冻结层号仍严格大于任何活卡前置的**新**层号 ⇒ 「层号未随依赖递增」不触发；`layer=0 的任务不得有依赖` 对取消卡同样安全（其依赖在取消时必在图中 ⇒ 当时层号 ≥ 1）。
- 唯一理论例外：取消卡的前置后来被**物理删除**（本仓无删除路径）⇒ 由 V-3 报脏引用。若实测出现 V-4 反例，处置 = 取消卡不参与 V-4 的层级递增判据（**待人拍板**，§10）。

## 4. 视图投影契约（FR-1 / FR-5） <!-- serves: FR-1, FR-5 -->

### 4.1 接线落点（逐处） <!-- serves: FR-1, FR-2, FR-5 -->

| # | 投影 | 现落点（实测行号） | 改法 |
|---|---|---|---|
| 1 | **「DAG 层级」（阶段详情）任务集合** | `QueryStageDetail.ts`：`DecomposeStageAssembler.buildBody` 的 `view.tasks.filter(t => t.requirementId === req.id)`（**:196**，**之后、`toStageTaskRef` 之前**：**:204** `withCardDoc(toStageTaskRef(t), …)`）与 `ImplementStageAssembler.buildBody` 同形处（**:219** 取数 → **:221** `toStageTaskExecution`） | 在这两处加 `.filter(isLiveTask)`（或 `liveTasksOf(view.tasks).filter(t => t.requirementId === req.id)`）。**推荐收敛到基类** `StageDetailAssembler.assemble()`（一处覆盖 8 个 body、未来新增 body 天然继承）→ 待人拍板（§10）。注意：HTTP 路由 `routes/stages.ts:380` 直调 `assembleStageDetail`，走的是**同一批 body** ⇒ 两处即已覆盖两条入口 |
| 2 | **DAG 面板图节点**（`GET /requirements/:id/dag`） | `QueryDag.ts:211-235` `queryDag`：`buildDagNodes(tasks, layerIndexOf(queue))`、`buildDagSteps(tasks)`、`buildCriticalPath(tasks)`。**现状：`tasks` = `queue.tasks` 全量（含取消卡）**；只有 `buildCriticalPath`(:138) 内部过滤 | `const live = liveTasksOf(tasks)`；三处改喂 `live`（`buildCriticalPath` 内部的手写 `alive` 收编为复用） |
| 3 | **看板 / 甘特 / DAG 画布 / 卡面计数的共同数据源** | `routes/stages.ts:66-101` `handleState`：`tasks: tasks.map(...)`（**现状：`taskStore.listAll()` 全量**，:87）与 `ready: Object.fromEntries(… readyTasks(tasks, r.id) …)`（:99） | `const live = liveTasksOf(await taskStore.listAll())`；`tasks: live.map(…)`；`ready` 由 `isReadyTask` 派生。**在 API 边界收敛一处**（父窗口裁定）——客户端不再各写过滤 |
| 4 | 实施门判据 | `QueryDocs.ts:597`（已过滤） | 收编为 `liveTasksOf`（行为不变） |
| 5 | 进度 / 完成度分母 | `QueryReport.ts:402`（已过滤）；`domain/workflow/RollupSpec.ts:65` `activeTasksOf`（已过滤，domain→domain 合法） | 收编为 `liveTasksOf`（行为不变） |
| 6 | 状态投影 | `QueryState.ts:108`、`:136`（已过滤） | 收编为 `liveTasksOf` |
| 7 | 客户端本地活卡 helper | `client/render/subtask-view.ts:98` `const live = <T extends {status:string}>(list) => list.filter(…)` | 改调 `liveTasksOf`（client 已在 `views/board.ts:13` import 同一文件，路径合法且不越层） |
| 8 | 文档面板 | `QueryDocs.ts` 的 `documents`（来自 `req.artifacts` 的 `task_detail` 产物） | 按 A3 口径：**界面不列**已取消卡的 `task_detail` 行；`documents` 与 `discovered` 两侧**同时排除**；磁盘 `tasks/<id>.md` 保留（**审计靠磁盘与台账，不靠文档面板**）。不变量见 `data-model.md` §5 |

### 4.2 投影禁止项（四项读数一律 0 条取消卡） <!-- serves: FR-1, FR-2, FR-5 -->

| 读数 | 事实源 | 改后 |
|---|---|---|
| 视图行数（DAG 层级卡片数） | 落点 1 | `= liveCountOf` |
| 详情页计数（总任务 / 已完成 / 开发中 / 待开始） | 落点 1（客户端 `views/stage-detail.ts:117-120` 直接数投影数组） | 同上 |
| 进度 / 完成度分母 | 落点 5 | `= liveCountOf` |
| 甘特条数 / DAG 画布节点数 | 落点 3（客户端 `buildGantt` / `buildDagData`） | 同上 |
| 追溯行数 | RTM YAML（§5；`stage-overview/assembler.ts:100 assembleTraceability`） | 同上（触发点刷新后，边界见 §5） |

**硬规则**：投影里不得出现取消卡，**也不得出现任何解释性计数**（「另有 N 张已取消」这类行）——D-7 明令。归档材料里的 `canceled_count` 属审计路径，不进界面（FR-5）。

## 5. 覆盖度与追溯喂入契约：RTM 入口收敛（FR-2） <!-- serves: FR-2 -->

**签名：既有签名不变**（不新增参数、不改返回），只收紧入口口径。

```ts
export async function syncRTMYaml(
  deps: UseCaseDeps, tasks: readonly TaskRecord[], reqId: string,
  trigger: RTMTrigger, payload?: RtmYamlPayload,
): Promise<RTMTriggerResult | undefined>

export function syncRTMYamlWithSnapshot(
  workspaceRoot: string, snapshot: RTMLedgerSnapshot, tasks: readonly TaskRecord[],
  reqId: string, trigger: RTMTrigger, payload?: RtmYamlPayload,
): RTMTriggerResult | undefined
```

**规定（两个入口同款）**：

```ts
// 函数顶部第一行：收敛为活卡；其后函数体内**只允许使用 live**，不得再引用入参 tasks。
const live = liveTasksOf(tasks)
```

| 项 | 规定 |
|---|---|
| 幂等 | `liveTasksOf(live).length === live.length`；重复收敛无副作用（纯函数） |
| 异常语义 | `liveTasksOf` 不抛（纯函数）⇒ 不改变既有「取根/取快照都在 try 内」「失败绝不打断主流程」的边界 |
| 覆盖 | `syncRTMYaml` **18** 个调用点 + `syncRTMYamlWithSnapshot` **3** 个直接调用点（`http/routers/requirements.ts:404`、`:464`、`http/routers/tasks.ts:174`）——后者**绕过**前者，故两个入口都要收敛 |

**为什么不改调用点**：

| 理由 | 事实 |
|---|---|
| 调用点会漂移 | 21 个调用点改 21 次 = 21 次漏改机会；本仓已有多次「门禁失效而假绿」的先例（`tests/layer-boundary.test.ts` 文件头自陈） |
| 唯一漏斗 | 两个入口之下只有一个 `ledgerReaderOf(snapshot, tasks)`（`rtm-yaml.ts:82`，任务出口 `tasksOf` 在 :114）⇒ 生成器看到的第一手数据即活卡 |
| 门禁与产物同源 | `coverageGateOf`（:140）读的就是本函数返回的 `result.coverage` ⇒ 入口收敛后**写盘 YAML** 与**门禁读数**不可能两套口径（这正是 80.3% 的病根消解处） |
| 只剔除、不新造 | requirement「不做」第 5 条：不改计量粒度 |

**对既有触发点语义的影响**：

| 触发点 | 影响 |
|---|---|
| `create` / `bind` / `submit:requirement` / `submit:prototype` | 无覆盖度产出；仅任务相关节少取消卡 |
| `confirm:plan` / `task:status` / `task:report` / `submit:design` / `confirm:artifact` | `decomposing.outputs.tasks`、`task_coverage[]`、`traceability.*`、`coverage.implementation` 全部只含活卡 |
| `submit:verification` | `accepting.coverage.testing`（门禁读它：`SubmitVerification.ts:209`）的 `total_tasks` = 活卡数 ⇒ 覆盖度 80.3% → 100%（A5） |
| 覆盖度缺项 / 活卡 0 张 | `coverageGateOf` 的 `total <= 0 → undefined`（不拦截）**逐字不变**。推论：任务全被取消的需求不再被覆盖度门拦——与「该完成的卡 = 0 ⇒ 无项可判」一致（**待人确认**，§10） |
| 触发失败 | 仍是 warning、不阻断主流程（RTM 是增强层，逐字不变） |

**⚠️ 追溯读数的边界（如实声明，会影响 A1/A3 的读法）**：界面追溯行数来自**磁盘上的 RTM YAML**（`assembleTraceability` 读 `rtm-*.yml`），不是实时重算。若某存量需求此后**永不触发**任何 RTM 触发点，其 YAML 保持原样（仍含取消卡行），则该需求界面上的追溯行数仍含取消卡。本需求不主动重扫存量（FR-6 不追溯）⇒ 「追溯行数 0 条取消卡」只在**该需求被触发过一次之后**成立。**待人拍板**（§10）。

## 6. 取消动作写侧契约（FR-3） <!-- serves: FR-3 -->

取消是**人工门动作**（`domain/task/TaskStatus.ts:154-168` `HUMAN_ONLY_TASK_TRANSITIONS`：`*>canceled` 与 `canceled>todo` 仅人；agent/system 一律 `human_gate` 拒绝）。**本需求不改这条属性**（requirement「不做」第 4 条）。

### 6.1 入口点（实测 4 条，全部必须调用同一个 helper） <!-- serves: FR-3 -->

| # | 入口 | 现落点 | 现有可用入参 |
|---|---|---|---|
| 1 | 人工门单卡取消（`reqboard_task_move` 的 `*>canceled`） | `application/internal/task-transition.ts:31` `transitionTask`（`to === 'canceled'`） | `opts.at` / `opts.actor` / `opts.reason?` |
| 2 | 需求级回退（旧卡一律取消，标本里的 26 张来自此路径） | `application/internal/rollback-tasks.ts:59-72` `planRollbackTasks`（`copy.status = 'canceled'`，:63） | `now` / `actor` / `reason` |
| 3 | 误物化清场 | `application/internal/rollback-cleanup.ts:124` `planRollbackCleanup` | `now` / `actor` / `reason` |
| 4 | 占位重做卡清场 | `application/internal/stale-rework.ts:66` `cancelStaleReworkCards` | `input.nowTs` / `input.actor` / `input.reason` |

### 6.2 接口 <!-- serves: FR-3 -->

```ts
// 落点：src/application/internal/task-transition.ts（与 transitionTask 同址：写侧唯一收敛点）
export interface CancelTrailOpts {
  /** 取消时刻（epoch ms；与同一次写用的时钟值**同一个**） */
  at: number
  /** 操作者（人工门保证 kind === 'human'） */
  by: ActorRef
  /** 取消原因（自由文本；trim 后非空才写 cancelReason 键） */
  reason?: string
}

/** 取消留痕的唯一写入口：**就地**写三字段，不返回新对象、不做 IO。 */
export function markCanceled(task: TaskRecord, opts: CancelTrailOpts): void
```

**写什么（逐字定死）**：

```ts
task.canceledAt = opts.at
task.canceledBy = { kind: 'human', ...(opts.by.sessionId !== undefined ? { sessionId: opts.by.sessionId } : {}) }
if (opts.reason !== undefined && opts.reason.trim().length > 0) task.cancelReason = opts.reason.trim()
```

| 规则 | 规定 |
|---|---|
| **语义：最近一次取消（覆盖式）** | 再次取消**覆盖**三字段（不追加、不保留上一次）；历史每次取消在 `statusHistory`（每次转移一条）与 `revisions`（append-only）里 ⇒ **首次取消不可追**（`data-model.md` §1.1 / INV-D2）。复活（`canceled → todo`）**不清空**三字段 |
| 写入时机 | 与 `status` 变更**同一次赋值、同一次写盘事务**：入口 1 在 `transitionTask` 里 `task.status = 'canceled'` 那一步调用 `markCanceled(task, opts)`（同函数、同一内存对象）；入口 2/3/4 在 `structuredClone` 出来的 `copy` 上、**与 `copy.status = 'canceled'` 相邻**调用，之后由既有 `mutateQueue` 一次性写盘 |
| 原子性 | 禁止异步补写、禁止事后回填（FR-6 零迁移）。半写态（有 `status` 无留痕）不允许：三字段与 `status` 同批落盘 |
| 非 human 操作者 | `markCanceled` **不写 `canceledBy`**（不写假值），并 `console.warn` 留痕；理由是 `canceledBy.kind` 的类型就是 `'human'`（是否放宽为 `ActorKind` 待人拍板，§10） |
| 复活（`canceled → todo`，仅人） | **不清空**三字段 —— 已定稿（覆盖式语义的自然推论，见 `data-model.md` INV-D2）：复活后仍能答「这张卡最近一次是谁为什么取消的」 |
| 幂等 | 对同一 `task` 重复调用 = 覆盖同一批值（不追加、不产生数组） |

## 7. 错误语义（FR-6） <!-- serves: FR-6 -->

**本需求不新增任何错误码。** 逐条声明以免执行者自创：

| 面 | 规定 |
|---|---|
| 传输码 `REQBOARD_*` | 不新增（`REQBOARD_ERROR_CODES` / 工具错误码表不动） |
| domain 错误码 | 不新增（`src/domain/errors.ts` 不动） |
| 门禁码 | `GateFailure` 联合不新增成员；既有码触发条件不改 |
| 新校验规则 | `validateQueue.ts` 不新增 V-x；**只改 V-5 已有规则的判定实现**（§3.3），其 `rule` 标识仍是 `'V-5'`（`tests/queue-types.test.ts` 的 T5 断言「规则恰为 V-1~V-6」因此不受影响） |

| 情形 | 语义（不是错误） |
|---|---|
| 旧分片缺三字段 | 读取为 `undefined` = **未采集**；不补齐、不改写、无迁移脚本（实证：`REQ-261005105032-3b02/queue.json` 的 26 张取消卡今天就没有任何 `cancel*` 键） |
| 旧 RTM YAML 缺节 | 沿用既有宽容度（缺 `task_coverage` / `prototypes` / `decisions` = 未采集），不报错 |
| 活卡 0 张 | 视图空态；覆盖度门 `total<=0 → 不拦截` |
| 依赖指向取消卡 | 按已满足处理（§3），不报错 |
| 审计路径读到取消卡 | 正常：台账 / 磁盘 `tasks/<id>.md` / 归档材料仍含取消卡 |

## 8. 反面断言：字面量基线与「新增即红」（FR-4） <!-- serves: FR-4 -->

**实测基线**（命令：`grep -rn "status !== 'canceled'\|status === 'canceled'" src/ --include=*.ts | wc -l`）：

- **54 处 / 34 文件**（设计时点）。这不是「两份手写 filter」，故按父窗口裁定④**收口范围**：

| 类别 | 规定 |
|---|---|
| §4 的 8 个消费点 + §3 的 4 个依赖判定点 | **必须**改用 `liveTasksOf` / `isLiveTask` / `isDependencySatisfied` / `isReadyTask`；改完这些点**不得**再命中字面量 |
| 其余命中 | **登记为基线，不动**（含写侧候选筛选如 `rollback-tasks.ts:59`、以及全部**需求级** `req.status` 比较——那不是任务活卡判据，不得顺手替换） |
| 新增即红 | 断言：现命中集合（`文件` + 去空白后的**行原文**）⊆ 基线；任何新增命中即红 |

**⚠️ 执行者必读（实测）**：`tests/layer-boundary.test.ts` **在本仓当前状态下已是红的**（3 条失败：`application/` 越界 import 15 处、`domain/` 非确定性来源 2 处、`tools/|http/` 状态字面量 4 文件）。因此**不得**把本断言挂进那条测试（它先红，会掩盖本次回归）——应新建**独立**断言（自带基线清单），并在断言消息里给出命令与基线文件路径。

基线（34 文件 / 54 处，逐文件计数；执行者按 `文件 + snippet` 冻结成清单）：

| 文件 | 处数 | 文件 | 处数 |
|---|---|---|---|
| `src/domain/status/Predicates.ts` | 4 | `src/application/query/QueryState.ts` | 2 |
| `src/application/use-cases/SubmitVerification.ts` | 4 | `src/application/query/QueryReport.ts` | 2 |
| `src/application/internal/advance-select.ts` | 4 | `src/application/internal/sheet-tasks.ts` | 2 |
| `src/client/views/board.ts` | 3 | `src/application/internal/rollback-tasks.ts` | 2 |
| `src/application/use-cases/AdvanceChain.ts` | 3 | 其余 21 个文件（各 1 处） | 21 |
| `src/domain/task/ReworkPlaceholder.ts` | 2 | | |
| `src/client/views/report-band.ts` | 2 | | |
| `src/application/use-cases/Decompose.ts` | 2 | | |

> 注：`src/domain/status/Predicates.ts` 的 4 处是**判据本体**（`isCanceled` / `isActiveRequirement` / `isOpenRequirement` / `isUnfinishedTask`）——它们是允许写比较式的地方（domain 是判定规则的唯一实现处），基线与断言都必须豁免「定义处」。

## 9. 关键决策与取舍 <!-- serves: FR-2, FR-4 -->

| # | 决策 | 取舍 |
|---|---|---|
| 1 | 判据落在 `domain/status/Predicates.ts`（泛型），**不新建模块** | 与既有判定函数同址，天然被 INV-2 的层门禁保护；代价是该文件多出五 + 四个导出（§2 命名定稿表） |
| 2 | 依赖判定口径**上移到 domain**，`readyTasksOf` 反向复用 | 父窗口裁定「以 `readyTasksOf` 为语义单点」；技术上必须上移，因为 `computeReady`（domain）不许 import application——行为逐字不变，只是把单点的**位置**放到最内层 |
| 3 | 视图过滤落在**取数/投影边界**，不在客户端各写 | 客户端有 4 处独立消费面（甘特 / DAG 画布 / 卡面 / 阶段详情），各写一份就是本需求要修的病；`handleState` 是它们共同的数据源 |
| 4 | RTM 收敛在两**公开入口**而非 `ledgerReaderOf` 内部 | 入口是契约边界、可断言；藏在实现层里，下一个直连生成器的路径又会漏。代价是两行调用（幂等） |
| 5 | 明示「缺席 = 已满足」 | 换来「取消卡不再阻塞」；代价是脏引用不再阻塞，靠 V-3 兜底（§3.2） |
| 6 | 取消卡 `layer` 冻结而非删除 | 避免在队列文件里制造「没有层的卡」（会让 V-4/V-3 语义更绕），且 V-4 仍成立（§3.3 分析） |
| 7 | 陈旧派生字段（`ready[]` / `layer`）在**读侧内存重算**、`save` 仍强校验 | 读侧兼容（否则旧快照撞 V-5「漏就绪」会让整份队列被判不可用）；写侧 fail-closed 保证不再产生新的一致性谎言（§3.3） |

## 10. 待人拍板项 <!-- serves: FR-3, FR-4 -->

| # | 待定 | 我的建议 |
|---|---|---|
| 1 | 阶段详情过滤落点：逐 body 加（父窗口原话的落点）vs 基类 `assemble()` 一次收敛 | 建议**基类**：一处覆盖 8 个 body，未来新增 body 天然继承 |
| 2 | `canceledBy.kind` 是否放宽为 `ActorKind`（human/agent/system） | 建议**保持 `'human'`**（需求「不做」第 4 条：取消仍为人工门；放宽会让「agent 也能取消」在类型上变得合法） |
| 3 | ~~复活是否清空三字段~~ | **已定稿**：三字段 = 最近一次取消（覆盖式）⇒ 复活**不清空**（§6.2 / `data-model.md` INV-D2） |
| 4 | 活卡 0 张（任务全取消）时覆盖度门不再拦截 | 建议**接受**（与「total=0 ⇒ 无项可判」既有边界语义一致）；若不能接受，需另立判据（会新增语义，超出本需求） |
| 5 | 存量需求永不触发 RTM ⇒ 界面追溯行数仍含取消卡 | 建议**接受 + 如实声明**（FR-6 不追溯优先）；若要一次性对齐，需另立一次性重扫（超范围） |
| 6 | V-4 对取消卡的层级递增判据是否豁免 | 建议**不豁免**（分析上仍成立，§3.3）；仅在实测出现反例时才豁免 |
| 7 | `cancelReason` 长度上限与 trim 口径 | 建议：**trim 后非空才写**；长度建议 ≤ 500 字符（软约束，见 `data-model.md` §6） |
| 8 | 字面量基线的载体（测试内联清单 vs 独立 JSON 清单文件） | 建议**独立清单文件**（可核、可 diff；行号漂移时按 `文件 + 行原文` 匹配） |
