---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 前端设计（REQ-261005193546-1b1a）看板不再展示已取消卡：视图与统计都不再算上退出赛道的卡片 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 条件必交：requirement.md front-matter `sides` 含 `frontend`，故交本份。
> 本需求前端侧的动作只有一句话：**让已取消卡从投影里消失**，且消失得**干净**（不给开关、不给计数交代）。
> 本包是命令式字符串渲染（无组件框架），故下文用「渲染块」表达组件结构。
> **关键口径（以代码现实为准）**：看板卡计数 / 甘特摘要 / DAG 画布三者的共同数据源是 **`GET /state`**
> （`src/http/routers/stages.ts` 的 `handleState`），因此前端侧的正解是
> **在 API 边界收敛一处过滤，客户端不做各自的过滤**；DAG 面板另有 `QueryDag` 一条路径，单独收敛。
> 前端**不做**判定逻辑本身：判据收敛在 `domain` 的单点纯函数里（FR-4 / D-6），前端只负责
> 「不再自己算第二份」+「不再把取消态画出来」（FR-1 / FR-5 / D-3 / D-7）。

## 原型页面 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**唯一权威原型**：`prototypes/dag-canceled-hidden.html`（`prototypes/INDEX.md` 里唯一一条 `authoritative`，
服务条款 FR-1 · FR-2 · FR-3 · FR-4 · FR-5 · FR-6）。本节出现的原型路径**等于**那条权威路径。

该原型的形态是**同一需求、同一份台账的「改前 / 改后」两态并排**：
面板 A `#mock-after` = 改后（权威口径，132 张卡里 26 张已取消 → 只画 106 张）；
面板 B `#mock-before` = 改前（对照口径，把 26 张取消卡一并算进来 → 132 张）。
两态**只差「活卡过滤」这一处出口**——这正是 FR-4 要固化的性质。

| 页面/组件（编号） | 原型锚点（`P-x/C-x ↔ #FR-N`） | 关联 D-x | 该处结构与交互（一句话） |
|---|---|---|---|
| P-1 | P-1 ↔ prototypes/dag-canceled-hidden.html#FR-1 | D-2、D-3、D-8 | 看板「📊 DAG 层级」（阶段详情）：按依赖深度分层铺开该做的卡，取消卡 **0 行**；活卡依赖已取消卡时按「边已满足」分层，不掉层、不成孤岛 |
| C-1 | C-1 ↔ prototypes/dag-canceled-hidden.html#FR-2 | D-4、D-7 | 看板卡进度 / 完成度读数：分子分母同取活卡；界面**不给**取消计数（连「另有 N 张」都不给） |
| C-2 | C-2 ↔ prototypes/dag-canceled-hidden.html#FR-2 | D-4 | 甘特摘要条带：一卡一条 bar，只画该做的卡 |
| C-3 | C-3 ↔ prototypes/dag-canceled-hidden.html#FR-2 | D-4 | 追溯 / RTM 行：活卡一行；取消卡不出现 |
| C-4 | C-4 ↔ prototypes/dag-canceled-hidden.html#FR-3 | D-1、D-5 | 台账视图（界面**之外**）：`canceledAt` / `canceledBy` / `cancelReason` 三列 × 26 行，带 `data-present-in-view="no"`，**不在看板渲染** |
| C-5 | C-5 ↔ prototypes/dag-canceled-hidden.html#FR-4 | D-6 | 活卡判据单点（无界面）：一个导出纯函数 + 一个同源计数 helper，全部消费点复用 |
| C-6 | C-6 ↔ prototypes/dag-canceled-hidden.html#FR-6 | D-5 | 旧数据兼容读：缺三字段不报错、留痕列渲染为空字符串（不是 `undefined`）、不补写 |

**原型里的观测量与期望值**（判据只认这些结构量与几何量，不认「看起来对」）：

| 观测量 | 期望值 | 两态里的落点 | 本需求真实值从哪来 |
|---|---|---|---|
| `canceledRowsShown` | 0 | `#mock-after` 内 `[data-status="canceled"]`（chip / bar / trace 三处皆无） | 任一展示面的 `[data-status="canceled"]` 计数 |
| `liveCardCount` | 106 | `#mock-after .chip` 总数（132 − 26） | 活卡判据单点的计数 helper |
| `dagRowsShown` | 106 | `#mock-after` 的 DAG 层级 chip 总数 | `data-dag-task-count` / `.dsh-pm-sn-dag-task` 行数 |
| `ganttBarsShown` | 106 | `#mock-after .strip .bar` 条数 | `.dsh-pm-gantt-bar` 条数 |
| `traceRowsShown` | 106 | `#mock-after .trace` 条数 | `.dsh-pm-trace-node[data-type="task"]` 条数 |
| `progressRatio` | 0.94 | 面板 A「进度 94%」（100 完成 / 106 该完成） | 看板卡读数 `doneCount / totalCount` |
| `legacyDagRowsShown` | 132 | `#mock-before .chip` 总数（改前对照） | 改前口径（不过滤）的同一读数 |
| `legacyProgressRatio` | 0.76 | 面板 B「进度 76%」（100 / 132，改前对照） | 改前口径的同一读数 |

> **这些是示意标本**：106 / 26 / 94% 是「132 张卡、26 张已取消」这一条标本上的数，
> **真实数字随需求而定**（另一条需求可能是 37 张里取消 4 张）。判据的可失败之处**不在数值本身**，
> 而在三条恒等式：① 取消卡条数 = 0；② 四个读数额额相等；③ 改前/改后两态之差 == 台账里的取消卡数。
> 原型自身另有两个观测量（`coverageRatio` 0.94、`canceledLedgerRows` 26），分别对应验收前置的
> 同一分母口径与「台账不消失」那一半（FR-2 / FR-5）。

**原型锚点不计入 serves**（走独立 `protoRefs` 通道）：上表第三列写的是 `#FR-N` 区块定位符，
它是「这段界面画在哪」，不是「这里覆盖了 FR-N」；把锚点写进 serves 会被 `stripPrototypeAnchors` 抹掉，
且覆盖度不上升（贴锚点刷覆盖 = 假引用）。

## 目录与包结构 <!-- serves: FR-1, FR-2, FR-4 -->

改动落在四处：**判据单点（domain）+ API 边界（http 的 `/state`）+ 面板投影（application/query）+ 渲染呈现（client/views）**。
**不新增页面、不新增路由、不新增依赖。**

| 路径（完整相对路径） | 内容（文件 + 一句话职责） | 新增/改动 | 落此处的理由 |
|---|---|---|---|
| `src/domain/status/Predicates.ts` | 「活卡」与「依赖是否已满足」两组判定的**唯一**定义（**既有模块，在 `isCanceled` 旁追加，不新建文件**）：`isLiveTask` / `liveTasksOf<T>` / `liveCountOf` / `liveLayers` / `liveReadyTasks`；依赖侧 `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` / `layerInputOf` | 改动（追加） | **不为此新建模块**：该文件本就是「按意图命名的状态谓词」唯一落点（`isCanceled` 已在此），`isLiveTask` 天然属于它。**只有 domain 能被四层同时 import**：`shared` 可 import `domain`（`src/shared/protocol.ts` 已这么干），`application` / `client` 也都可以；反过来 `domain` **禁** import `shared`，故入参必须是结构化的 `{ status: string }`（模块头已有的 `HasStatus`）而非 `TaskRecord` |
| `src/shared/protocol.ts` | `readyTasks()` 改走 `isReadyTask` / `liveReadyTasks`：把「前置已取消」视为**已满足** | 改动 | `handleState` 的 `ready` 字段就取它（`stages.ts` 注释点名「仍用 `readyTasks`」）；不修则活卡被取消的前置**永久卡死** |
| `src/domain/queue/topology.ts` | `computeReady()` 改走 `isReadyTask`：`canceled` 前置与悬空前置一律按已满足 | 改动 | 队列派生字段 `ready` 的**唯一实现**（文件头自称「写路径不得另写一份」）；与上一行是同一处语义的两个入口，必须同改 |
| `src/application/use-cases/queue-access.ts` | `readyTasksOf()` 已是正确判据（`d.status === 'canceled'` 放行）；改为复用 `isReadyTask`，语义不变 | 改动（收编） | 全仓三处 ready 判定里**唯一正确的那一处**；它是参照基线，改它只为消除第二份手写 |
| `src/http/routers/stages.ts` | `handleState` 在组装响应**之前**用 `liveTasksOf` 过滤 `tasks`，`ready` 走修好的判定 | 改动 | **前端侧最关键的一处**：看板卡计数、甘特摘要、DAG 画布、任务总览页共用这一份载荷，在此收敛一处即全部同数 |
| `src/application/query/QueryStageDetail.ts` | 过滤**在基类 `StageDetailAssembler.assemble()` 一次收敛**（不逐 body 各写一遍）；`dependsOn` 投影前经 `splitDependencyEdges` 剔掉指向已取消卡的边 | 改动 | 看板「DAG 层级」（阶段详情）的取数在此（用户看到 26 张卡的地方）；**八节点共用基类**，逐 body 改必然漏一处 |
| `src/application/query/QueryDag.ts` | `buildDagNodes` 补上 `liveTasksOf` 过滤（**当前漏过滤**）；`buildCriticalPath` 的手写 filter 收编；层号改由 `liveLayers` 产出 | 改动 | DAG Tab 的服务端聚合点；它把**全量任务**喂 `buildDagNodes` 并入节点列表与层号 |
| `src/application/query/QueryDocs.ts` | 文档面板不列已取消卡的任务卡文档；不变量按活卡口径重述（分母 `liveCountOf`） | 改动 | 「界面不出现」在文档面板的落点（A3）；恒等式必须同步重述，否则数字对不上 |
| `src/application/query/QueryReport.ts` | `progressOf` 的手写 filter 收编为 `liveTasksOf`（进度读数的分子分母） | 改动 | 详情页状态带读数的取数处 |
| `src/application/query/QueryState.ts` | 两处手写 filter 收编为 `liveTasksOf` | 改动 | 「收编现有手写 filter」清单项 |
| `src/client/render/subtask-view.ts` | 本地 `live` 辅助函数收编为 `liveTasksOf` | 改动 | 客户端也有一份手写过滤——不收编就是新的一处口径 |
| `src/client/views/board.ts` | `toCard`（`:26-34`）的 `doneCount` / `totalCount` 改走 `liveTasksOf` / `liveCountOf` | 改动 | **`totalCount` 是独立漏点**：它当场取 `tasks.length`，不能假设"上游 `/state` 好了这里就自动好"（同一函数还可能吃到别处传入的任务数组） |
| `src/client/views/timeline.ts` | `buildGantt` / `renderTaskTable` **不改算法** | 不改 | 任务总览页按「一卡一条 / 一行一卡」画；过滤不在渲染层重复做（`/state` 边界已收敛） |
| `src/client/views/stage-panel.ts` | `topoLevels`（`:347`）**必须在内部剪边**：改走 `layerInputOf` / `splitDependencyEdges`，指向已取消卡（或不在集合内）的边一律**丢弃**而不是当 `lv = 0` 计入 | 改动 | **真正的分层在客户端当场算**（不是读服务端 `layer`）；现实现对未知 id 返回 0 会造出**幽灵前置**，让活卡凭空多一层 ⇒ D-8 的剪边必须落进它内部 |
| `src/client/views/panels/dag.ts` | 图数据摘要照旧渲染（`layerDepths` 已按 `present` 剔边，与剪边口径天然一致） | 不改 | 状态分布是活卡集合的投影结果 |

```
src/
├── domain/
│   ├── status/Predicates.ts             （改：在 isCanceled 旁追加活卡 / 依赖判定两组函数，**不新建模块**）
│   └── queue/topology.ts                （改：computeReady 改走 isReadyTask）
├── shared/
│   └── protocol.ts                      （改：readyTasks 改走 isReadyTask / liveReadyTasks）
├── application/
│   ├── use-cases/queue-access.ts        （改：readyTasksOf 收编为 isReadyTask）
│   └── query/
│       ├── QueryStageDetail.ts          （改：基类 assemble() 一次收敛过滤 + 剔悬空边）
│       ├── QueryDag.ts                  （改：buildDagNodes 补过滤 + 收编 + liveLayers 出层号）
│       ├── QueryDocs.ts                 （改：不列取消卡的任务卡文档 + 不变量重述）
│       ├── QueryReport.ts               （改：收编手写 filter）
│       └── QueryState.ts                （改：收编两处手写 filter）
├── http/routers/stages.ts               （改：handleState 边界单点过滤 tasks 与 ready）
└── client/
    ├── render/subtask-view.ts           （改：收编本地 live 辅助）
    ├── views/board.ts                   （改：toCard 的 totalCount 独立漏点，改走 liveCountOf）
    ├── views/stage-panel.ts             （改：topoLevels 内部剪边，改走 layerInputOf）
    └── views/{timeline,panels/dag}.ts   （不改：吃已过滤的载荷）
```

**判据单点的形状**（追加进既有 `Predicates.ts`；导出纯函数；无 IO、无 `Date.now()`、无副作用，故四层都能直接 import）：

```ts
// src/domain/status/Predicates.ts（既有文件，紧邻 isCanceled 追加）
// ── 活卡（视图展示集合 / 统计分母 / 依赖判定对象，三合一）──
export function isLiveTask(task: HasStatus): boolean {
  return task.status !== 'canceled'
}
export function liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[] {
  return tasks.filter(isLiveTask)
}
/** 分母 = 活卡数；所有「张数 / 分母」都从这里取，禁止消费点各写 .length。 */
export function liveCountOf(tasks: readonly HasStatus[]): number {
  return liveTasksOf(tasks).length
}

// ── 依赖：已取消卡的前置 = 已满足（D-8）；悬空一律单独成桶 ──
export function isDependencySatisfied(dep: HasStatus | undefined): boolean
/** 桶 satisfied / pending / dangling：悬空**不**隐含 satisfied（校验要能报 V-3），
 *  但**分层与开工**一律只认 satisfied——两者的差别正是本需求最容易漏的地方。 */
export function splitDependencyEdges<T extends HasStatus>(task: T, byId: ReadonlyMap<string, T>): {
  satisfied: string[]; pending: string[]; dangling: string[]
}
export function isReadyTask<T extends HasStatus>(task: T, byId: ReadonlyMap<string, T>): boolean

// ── 分层：只吃「已满足」边 ⇒ 等价于「指向已取消卡的边删掉后重算」──
export function layerInputOf<T extends HasStatus>(tasks: readonly T[]): ReadonlyMap<string, string[]>
export function liveLayers<T extends HasStatus>(tasks: readonly T[]): ReadonlyMap<string, number>
export function liveReadyTasks<T extends HasStatus>(tasks: readonly T[], byId: ReadonlyMap<string, T>): T[]
```

> **与原型的一处如实偏差**：原型第 4 区块给的是 `isLiveTask(t: TaskRecord)`。落点改为结构化入参
> `HasStatus`（即 `{ status: string }`，`Predicates.ts` 模块头既有），原因是 `domain` 不能 import `shared`（拿不到 `TaskRecord` 类型）。
> **行为逐字一致**（只看 `status`），且泛型入参顺带覆盖 `QueueTask` / `DagGraphNode` / `StageTaskRef`。
> 命名按裁定统一：`is` 前缀 + `of` 后缀（便于 grep 与断言）——**全仓不得再出现 `liveTasks` / `liveCount` 这类简写**。

## 组件结构 <!-- serves: FR-1, FR-2 -->

本包无组件框架：树的每个节点是一个**渲染块纯函数**（入参 `unknown`，出参 HTML 字符串）。

```
P-1 看板（GET /state 一份载荷喂全部展示面）
├── C-1 需求卡进度读数（展示 完成 / 该完成 与百分比；不给取消计数）
│   └── ← 数据：BoardState.tasks（API 边界已过滤）→ toCard 的 doneCount / totalCount
├── C-2 甘特摘要（一卡一条 bar 的摘要条带，只画该做的卡）
│   └── ← 数据：BoardState.tasks（同一份）
├── C-3 DAG 画布（卡片层图；绿点 = 可开工）
│   └── ← 数据：BoardState.tasks + BoardState.ready（同一份载荷，ready 走修好的判定）
└── C-4 任务总览页（需求分组 → 里程碑条 + 甘特图 + 任务表；`buildTasksPage` 一次渲染出 C-2）
    └── ← 数据：BoardState.tasks（同一份）

P-2 需求详情 / 节点面板（不经 /state 的两条面板路径）
├── C-5 DAG 层级块（按依赖深度分层铺开活卡；**分层在客户端 `stage-panel.topoLevels` 当场算**，内部剪边）
│   └── ← 数据：QueryStageDetail.body.tasks（基类 assemble() 已过滤 + 已剔悬空边）
├── C-6 DAG Tab 图与摘要（层级 / 卡片数 / 依赖边 / 并行度 / 状态分布）
│   └── ← 数据：QueryDag（已过滤；层号由 liveLayers 产出）
└── C-7 追溯 / RTM 行（活卡一行；取消卡 0 行——**限新触发过 RTM 的需求**，见「已知边界」）
    └── ← 数据：assembleTraceability 读 rtm-*.yml（喂入时已按活卡生成）

C-8 台账 / 归档视图（界面之外：三列留痕 × N 行，带 data-present-in-view="no"）
└── ← 数据：台账原始记录（不过滤，审计路径必须还能读到取消卡）
```

数据流：`台账（唯一事实源）` → `活卡 / 依赖判定单点（domain/status/Predicates.ts）` →
`API 边界（/state）与面板投影（QueryStageDetail / QueryDag / QueryDocs / RTM）` →
`渲染块纯字符串（分层在 stage-panel.topoLevels 内部剪边）` → 壳委派。
**取消卡在第一个箭头处就分流去了 C-8**，不进任何看板渲染块。

## 页面与组件（编号表） <!-- serves: FR-1, FR-2, FR-3, FR-5 -->

| 编号 | 类型 | 名称 | 职责（动宾结构，含响应操作） | 数据来源（接口/状态/Props） | 新增/改动 | serves |
|---|---|---|---|---|---|---|
| P-1 | 页面 | 看板 | 展示需求卡、进度、甘特摘要、DAG 画布与任务总览页，点击进入详情 | `GET /state`（`BoardState`） | 改动 | FR-1、FR-2 |
| C-1 | 渲染块 | 需求卡进度读数 | 展示「已完成 / 该完成」与百分比，**不给**任何取消计数交代 | `BoardState.tasks` → `toCard.doneCount / totalCount` | 改动 | FR-2、FR-5 |
| C-2 | 渲染块 | 甘特摘要 | 逐卡画一条摘要 bar，展示起止与状态 | `BoardState.tasks` → `buildGantt` | 改动 | FR-2 |
| C-3 | 渲染块 | DAG 画布 | 画卡片层依赖图，绿点标可开工 | `BoardState.tasks` + `BoardState.ready` | 改动 | FR-1、FR-2 |
| C-4 | 渲染块 | 任务总览页 | 按需求分组铺开里程碑条 + 甘特图 + 任务表（`buildTasksPage`，内含 C-2） | `BoardState.tasks` → `renderTaskTable` / `renderMilestoneStrip` | 改动 | FR-2 |
| P-2 | 页面 | 需求详情 / 节点面板 | 展示该需求当前节点的详情、DAG 层级与追溯行，点击任务卡打开卡文档 | `StageDetail`（`QueryStageDetail`）/ `DagResponse`（`QueryDag`）/ `TraceabilityBundle` | 改动 | FR-1、FR-2 |
| C-5 | 渲染块 | DAG 层级块 | 按依赖深度分层铺开活卡，逐层给「第 N 层 · M 个可并行」（分层在 `topoLevels` 内部剪边后算） | `StageDetail.body.tasks`（`QueryStageDetail` 基类 `assemble()` 已过滤） | 改动 | FR-1、FR-2 |
| C-6 | 渲染块 | DAG Tab 图与摘要 | 画依赖图并给层级 / 卡片数 / 依赖边 / 并行度 / 状态分布 | `DagResponse`（`QueryDag`） | 改动 | FR-1、FR-2 |
| C-7 | 渲染块 | 追溯 / RTM 行 | 逐行铺开 FR→设计→任务→测试链上的活卡 | `TraceabilityBundle`（`assembleTraceability`） | 改动 | FR-2 |
| C-8 | 渲染块 | 台账 / 归档视图 | 展示取消卡的留痕三列与卡文档路径（审计用，**不在看板渲染**） | 台账原始记录 + 归档材料 | 改动 | FR-3、FR-5 |
| C-9 | 委派 | 打开卡文档 | 点任务卡 → 既有 `openDoc` 委派到右侧栏 | 既有 `data-action` 委派 | 复用不改 | FR-5 |

**归属判据 = 活卡判据单点**（FR-4 / D-6）：`C-1`~`C-7` **都不许**自己写 `status !== 'canceled'`，
一律经 `domain/status/Predicates.ts`（其中 C-1~C-4 更是连过滤动作都没有——它们吃的是 API 边界已过滤的载荷；
C-5 的剪边也走同一模块的 `splitDependencyEdges` / `layerInputOf`，不是第三份口径）。
`C-8` 是唯一**故意不过滤**的渲染块——它是审计面（FR-5 / D-1），取消卡在此必须还在，
且它的存在**不构成**对 C-1~C-7 的例外。

## 状态管理 <!-- serves: FR-1, FR-5 -->

- **无新增全局状态**：活卡与否是台账记录上的既成事实（`status`），客户端不缓存「哪些卡被取消了」，
  也不派生第二份名单——派生即第二份真相。
- **API 边界是唯一过滤点之一**：`BoardState.tasks` 从拿到手就是活卡集合，所有渲染块共享同一份，
  不存在"这个视图记得过滤、那个忘了"的可能（这正是本需求要消灭的病）。
- **无新增开关状态**：按 D-3 **不引入**「显示已取消」这类本地开关（没有 `showCanceled`、
  没有 `includeCanceled` 查询参数、没有接口开关字段）。没有开关，就没有"某条路径忘了传开关"这类分叉。
- **「可开工」也是状态的一部分**：`BoardState.ready[reqId]` 由 `handleState` 产出，客户端直接消费绿点；
  客户端**不自己推导**可开工（自推 = 第四处 ready 判定）。判定修在服务端的两个入口（见下节）。
- **既有共享边界不变**：`C-8`（台账视图）读的是原始台账，与 C-1~C-7 的取数入口本来就是两条路，
  本需求**不合并**它们（合并会把审计面一起过滤掉，正好违背 FR-5 的后半句）。

## 路由与导航 <!-- serves: FR-3, FR-5 -->

- **无新增路由**、无路由参数改动：所有呈现面复用既有面板端点与既有 Tab / 抽屉切换。
- **无新增弹窗**：台账视图（C-8）与 DAG 层级（C-5）都就地铺开，不折叠、不弹层。
- **无刷新语义变化**：取消一张卡后回到看板，读数按新台账重算即可，不引入新的事件订阅或轮询。
- **边界**：取消动作本身是**人工门**（agent 无权取消），前端不新增取消按钮、不改既有取消入口的权限语义。

## 样式与主题 <!-- serves: FR-1, FR-5 -->

- **不新增全局 CSS 变量、不新增样式文件**：本需求不改变任何视觉语言，只改变「哪些行存在」。
- 既有取消态样式规则（如 `.dsh-pm-dag-node[data-status="canceled"]`、`.dsh-pm-trace-node[data-status="canceled"]`
  一类的弱化 / 删除线）**保留不动**：它们服务的是 C-8 台账 / 审计面与存量历史视图；
  看板投影不再产生这些行之后，这些规则在看板上自然命中 0 次——**删规则不是本需求的动作**（D-1 不动物证）。
- **不靠颜色单独表达状态**：状态一律「文字 + 形状/属性」双通道（沿用既有 `TASK_STATUS_LABELS` 中文名 +
  `data-status` 属性），色弱用户不靠色相也能读；本需求不因此新增任何图例（图例新增本身就是在暗示"有取消档"）。
- **响应式**：不新增断点；行数减少只会让既有 `flex-wrap` 更宽松，不改变断点行为。
- **「可开工」绿点**：绿点是既有视觉语言，本需求不改它的样式，只改它背后的判定（取消卡的前置视为已满足）；
  若某活卡因修好判定而从"灰"变"绿"，属**行为修复**，不是新的视觉设计。

## 依赖与第三方库 <!-- serves: FR-4 -->

**无新增依赖**（含 devDependency）：

| 候选 | 否掉的理由 |
|---|---|
| 状态机 / 过滤工具库 | 判据是三行纯函数（`status !== 'canceled'`）；引库只为三行代码，且会把单一事实源搬到第三方语义里 |
| 前端组件框架 | 本包是命令式字符串渲染；引入框架等于重写面板（越界，且与「最小改动」冲突） |
| 快照 / 视觉回归库 | 本需求判据是**结构量与几何量**（行数、条数、比率），不是像素差；像素级对照属边界外 |

## 四个取数边界的改动口径 <!-- serves: FR-1, FR-2 -->

看板上的数字来自**四条互不相同的取数路径**，每条各有自己的收敛点；判据是同一个模块（`Predicates.ts`）。

### ① API 边界（`GET /state`）：看板卡计数 / 甘特 / DAG 画布 / 任务总览页 <!-- serves: FR-1, FR-2 -->

`src/http/routers/stages.ts` 的 `handleState` 是这几处**唯一**的共同数据源：

| 现状 | 改后 |
|---|---|
| `tasks: tasks.map(t => ({ ...t }))`——`taskStore.listAll()` **全量**下发（含取消卡） | `tasks: liveTasksOf(await taskStore.listAll()).map(t => ({ ...t }))`——活卡集合下发 |
| `ready: readyTasks(tasks, r.id)`——只认 `done` 的手写判定（**真缺陷**） | `ready` 改走 `isReadyTask` / `liveReadyTasks`（取消卡的前置按已满足） |

**但边界收敛不等于下游自动安全**——`toCard`（`src/client/views/board.ts:26-34`）是**独立漏点**：

| 处 | 现状 | 改后 |
|---|---|---|
| `toCard` 的 `totalCount: tasks.length` / `doneCount` | 当场对传入的任务数组取长度 ⇒ 只要该函数拿到的是**未过滤数组**（另一条调用路径 / 别处传入），读数立刻退回 132 | 改走 `liveTasksOf` / `liveCountOf`——**不假设"上游 `/state` 好了这里就自动好"** |

其余下游（`buildGantt` / `renderTaskTable` / `renderMilestoneStrip`、`tryMountDagCanvas`）
吃的是同一份已过滤载荷，**不再各自加过滤**。

### ② 面板投影（`QueryStageDetail` / `QueryDag`）：DAG 层级与 DAG Tab <!-- serves: FR-1, FR-2 -->

这两个处不经 `/state`，各自收敛：

| 处 | 现状 | 改后 |
|---|---|---|
| `QueryStageDetail`（阶段详情 / 「📊 DAG 层级」） | `view.tasks.filter(t => t.requirementId === req.id)`——**完全没过滤**（用户看到 26 张卡的地方），且**八节点各在自己的 body 里取任务** | 过滤**在基类 `StageDetailAssembler.assemble()` 一次收敛**（不逐 body 各写一遍——逐 body 必漏一处）；`dependsOn` 投影前经 `splitDependencyEdges` 剔掉指向已取消卡的边 |
| `QueryDag`（DAG Tab） | `buildDagNodes(全量 tasks, layerIndexOf(queue))`——**漏过滤**；`buildCriticalPath` 单独手写过滤 | `buildDagNodes` / `buildDagSteps` / `buildCriticalPath` 同源改走 `isLiveTask`；层号改由 `liveLayers` 产出 |
| 层号 `layer` | 落盘队列字段（`readQueue` 给）的计算把取消卡算作前置 ⇒ **活卡层号被抬高** | **层的计算也按活卡**：写路径（`QueueTaskStore` 重算派生视图）与读路径同源，等价于「指向取消卡的边删掉后重算」 |
| `stage-panel.topoLevels`（`:347`，**真正的分层在客户端当场算**） | 对**不在集合里的前置**返回 `lv = 0` 并照样计入 `1 + max(...)` ⇒ **造出幽灵前置**，活卡凭空多一层 | 内部改走 `layerInputOf` / `splitDependencyEdges`：指向已取消卡（或不在集合内）的边**直接丢弃**，不参与 `max` |

**过滤后层号怎么算**：在**活卡集合上重算**依赖深度：`layer(t) = 1 + max(layer(前置))`，
无前置 = 第 0 层（D-8：取消卡不构成阻塞）。服务端 `liveLayers` 与客户端 `topoLevels` **同一口径**。

| 项 | 口径 |
|---|---|
| 过滤什么 | 状态为 `canceled` 的任务卡**整个节点**不进投影（不是标灰、不是折叠、不是折叠成一行） |
| 为什么必须**同处剔边** | 活卡的 `dependsOn` 里若仍留着已取消卡的 id，客户端 `topoLevels` 会把「不在集合里的前置」按 `lv = 0` **照样计入** `1 + max(...)` ⇒ 该活卡落到第 2 层（凭空多一层），与「删边重算」不一致 ⇒ 违反 D-8 / 验收 A2。**只删节点、不删边**是本需求最容易踩空的一条；剪边必须**落进 `topoLevels` 内部**（那里才是真正算层的地方），只在服务端投影剔边不足以兜住 |
| 悬空为什么单独成桶 | `splitDependencyEdges` 把 `dangling` 与 `satisfied` 分开：校验（V-3）仍要能报悬空，但**分层与开工只认 satisfied**。把悬空默默算进 satisfied 会让队列校验失去证据 |
| 层号压实 | 取消卡原占的层整层空掉时，该层**不再出现**（层号按活卡压实、保持连续），不留空层、不显示「第 N 层 · 0 张」 |
| 不成孤岛 | 活卡不因"它的前置被取消"而从图里消失：它照常出现在第 0 层（或按其余前置所在层 +1） |
| 计数影响 | `data-dag-task-count` / `data-dag-layer-count` / `data-dag-layers` / `data-dag-edge-count` / `data-dag-parallelism` **全部按活卡算**；`data-dag-edge-count` 只数两端都在活卡集合里的边（与既有口径一致） |
| 状态分布影响 | `data-dag-statuses` 里**不再出现 `canceled` 这一档**——出现即等于给了一个取消计数（D-7） |

### ③ 「可开工」判定（三处，只有一处是对的） <!-- serves: FR-1, FR-5 -->

这是本需求的**真缺陷**：全仓有三处「哪些卡能开工」的判定，只有一处把取消卡的前置视为已满足。

| 位置 | 现状 | 不修的后果 | 改后 |
|---|---|---|---|
| `src/application/use-cases/queue-access.ts` `readyTasksOf` | ✅ **正确**（`d.status === 'done' \|\| d.status === 'canceled'`，悬空前置也放行） | — | 参照基线；改为复用 `isReadyTask`，**语义不变** |
| `src/shared/protocol.ts` `readyTasks`（`GET /state` 的 `ready` 来源） | ❌ 只认 `doneIds` ⇒ 活卡依赖已取消卡时**永不 ready** | 界面读数是 106，可开工绿点却是 0——用户看到"106 张卡一张都开不了"，比现状更糟 | 改走 `isReadyTask` / `liveReadyTasks`：取消卡的前置视为已满足 |
| `src/domain/queue/topology.ts` `computeReady`（队列派生字段 `ready` 的唯一实现） | ❌ 只认 `done`；悬空依赖按**未满足** | 落盘 `ready` 字段与界面绿点两套口径；队列调度同样被卡死 | 改走 `isReadyTask`：`canceled` 前置按已满足；悬空归 `dangling` 桶（**不**默默算 satisfied） |

**前端侧的写法**：`BoardState.ready` 是「可开工」的**唯一**前端来源（绿点、`readyIds`），
客户端不自己推导、不因为"依赖里有取消卡"而把卡画成阻塞。判据修好后，被取消前置挡住的活卡**真的能开工**——
这条必须有用例（`test-cases.md` 的 TC-2 只证明"不掉层"，**不足以**证明"能开工"，故单列 TC-3）。

### ④ 文档面板口径（A3）：界面不列取消卡的任务卡文档 <!-- serves: FR-1, FR-5 -->

| 项 | 口径 |
|---|---|
| 界面 | **不列**已取消卡的任务卡文档——既不进 `documents`，也**不补偿性**塞进 `discovered`（塞进去等于换个地方列） |
| 卡-产物关联键 | 路径以 `/tasks/<task_id>.md` 结尾（与 `QueryStageDetail.withCardDoc` 同源）；`<task_id>` 属于已取消卡即剔除 |
| 不变量（重述） | `documents` 台账来源行数 + Σ `discovered[].count` == **活卡口径的台账产物数** = `artifacts.length − 已取消卡名下产物条数`（需求级产物、设计文档、计划等非卡产物照常计入） |
| 审计去哪看 | 磁盘与台账：`req.artifacts` 原始记录仍在、`docs/requirements/<REQ>/tasks/<task_id>.md` 仍在；归档材料可引用计数 |
| 为什么重述而不变量 | 原恒等式是「按全量产物对账」；界面既然按 A3 不列取消卡产物，恒等式就必须同步换成活卡分母——否则要么数字对不上，要么有人为了对账把取消卡产物又列回界面 |

## 四个展示面的一致性 <!-- serves: FR-2 -->

**判据一句话**：同一份台账，四个展示面必须得**同一个数**（D-4 一个口径）：

```
dagRowsShown == ganttBarsShown == traceRowsShown == boardTotalCount == liveCardCount
```

| 展示面 | 渲染点（文件） | 取数入口 | 改后口径来源 | 可断言锚点 |
|---|---|---|---|---|
| ① DAG 层级行数 | `src/client/views/stage-panel.ts`、`src/client/views/panels/dag.ts`、`src/client/node-panel.ts` | `QueryStageDetail.body.tasks` / `DagResponse.tasks` | 单点判据（基类 `assemble()` + `liveLayers`）+ `topoLevels` 内部剪边 | `data-dag-task-count`；`.dsh-pm-sn-dag-task` 条数 |
| ② 看板进度 / 完成度 | `src/client/views/board.ts`（`toCard`）→ 需求卡与归档条 | `GET /state` 的 `tasks` + `toCard` 自身兜底 | API 边界单点 **+ `toCard` 的 `liveCountOf`**（独立漏点，两道都在） | `toCard.doneCount / totalCount` |
| ③ 甘特摘要 | `src/client/views/timeline.ts`（`buildGantt`） | `GET /state` 的 `tasks` | 同一次请求、同一份载荷 | `.dsh-pm-gantt-bar` 条数 |
| ④ 追溯 / RTM 行 | `src/client/views/traceability-view.ts` | `assembleTraceability` 读 `rtm-*.yml` 的 `task_to_tests` / `fr_to_tasks` | 喂入 RTM 生成器的任务集合已按单点过滤（见下段「两个入口」）；**口径限定见「已知边界」** | `.dsh-pm-trace-node[data-type="task"]` 条数 |

**同一分母的第五个消费点（不是展示面，但同源）**：测试覆盖度门（验收前置）的分母也取自该单点（`liveCountOf`）。
它有**两个入口**，必须都改：

| 入口 | 走它的路径 | 要求 |
|---|---|---|
| `syncRTMYaml(deps, tasks, …)` | 会话工具路径（`reqboard_verify_submit` 的探针、确认章落章、`task:status` 等） | 喂入前 `liveTasksOf` ⇒ `coverage.total == liveCardCount` |
| `syncRTMYamlWithSnapshot(workspaceRoot, snapshot, tasks, …)` | HTTP / 看板路径（`requirements.ts` / `tasks.ts` 的端点） | 同上；两条入口读数必须相等 |

只改一条 ⇒ 会话里读到 106、看板端点读到 132——那正是「两套分母」，也正是 D-4 要消灭的病。

**一致性不许靠"碰巧相等"**：各处都必须是**同一个函数的输出**，而不是多段各自正确、恰好同值的代码。
判据的逆验证见 `test-cases.md`：把任一消费点改回手写 filter，该面的读数立刻退回 132（TC-6 的「新增即红」）。

**读数未知不判**：任一面读数缺失（投影降级 / RTM 读不到）时，界面**如实说读不到**，
不得回落成 0、也不得拿别处的数替代——「未知」与「0」是两件事（既有降级信封纪律）。

**活卡 0 张不拦门**：`coverage.total === 0` 时 `coverageGateOf` 返回 `undefined` = **不拦截**
（"无项可判"不等于"100% 达标"，也不等于"0 分"）。同理，**存量需求**（无 `requirement.md` / `artifacts` 为空）
走 `isLegacyForDocs` 豁免、探针为 `undefined`。两种"不判"都有各自的用例（见 `test-cases.md` 边界节）。

### 已知边界：追溯读数可能是**陈旧快照** <!-- serves: FR-2 -->

**存量需求永不触发 RTM**——RTM 同步只在真实动作（`create` / `confirm:plan` / `confirm:artifact` /
`submit:verification` / `task:status`）上跑，历史需求不会因为本需求上线而被重算。
因此：

| 事实 | 后果 | 前端与验收怎么写 |
|---|---|---|
| 某需求最后一次触发 RTM 在取消动作**之前** | 它的 `rtm-*.yml` 里 `task_to_tests` / `fr_to_tasks` **仍含取消卡**（陈旧快照） | 追溯行数会**多于**活卡数——这是**已知事实**，不是缺陷 |
| 本需求不追溯重算 | 界面不得为了"凑齐四数相等"去过滤 RTM 已有的行，也不得回写旧 YAML | 界面**如实渲染** RTM 给的行；不臆造、不裁剪 |

**验收口径据此限定**：四数相等与「追溯行数 == 活卡数」的断言**只对「本需求上线后新触发过 RTM 的需求」成立**。
对存量需求，只断言"界面不出现取消卡**卡片**行 / 不出现取消计数"（FR-5 那半），**不**断言追溯行的数值。
把口径写成"所有需求追溯行都 == 活卡数"，会得到一个永远红或被迫造假的用例。

## 严格不可见（不给开关、不给计数交代） <!-- serves: FR-1, FR-5 -->

按 D-3 与 D-7，本需求选的是**彻底不可见**，不是"默认可隐藏"：

| 不许做 | 具体形态（命中即验收失败） | 依据 |
|---|---|---|
| 不给「显示已取消」开关 | 不加 checkbox / 切换按钮 / 菜单项；不加 `includeCanceled` / `showCanceled` 查询参数或接口字段 | D-3 |
| 不给任何计数交代 | 不出现「另有 N 张已取消」这类行；不出现 `已取消 26` 徽标 / 角标 / 状态分布档；空态文案**不解释**"少掉的卡去哪了" | D-7 |
| 不把取消卡画成"弱化行" | 不出现 `data-status="canceled"` 的行（哪怕透明度 0、哪怕文字被 `aria-hidden`） | D-3 |
| 不在别处**补偿性**交代 | Tab 角标、tab 标题括号、tooltip、`title` 属性、`aria-label`、文档面板的 `discovered` 分组都不许带取消计数或取消卡产物 | D-7、A3 |

**验收怎么判**（任一展示面，判据是计数而不是肉眼）：

1. 该展示面内 `[data-status="canceled"]` 条数 = **0**（chip / bar / trace / node 四类选择器都查一遍）；
2. 该展示面的可见文本里 `已取消` / `canceled` 命中 = **0**（含 `title` / `aria-label` / `data-*` 值）；
3. **同时**台账侧仍读得到取消卡：同一份台账里 `status === 'canceled'` 的记录数**不变**（标本上 = 26），
   磁盘 `docs/requirements/<REQ>/tasks/<task_id>.md` 份数不变 → 界面 0 条 **且** 台账 26 条，两条一起断言。

第 3 条是防"假不可见"的关键：只断言界面 0 条，把台账一起删掉也能过——那不是本需求要的结果（D-1）。

## 可访问性与一致性约束 <!-- serves: FR-1, FR-5 -->

- **不靠颜色单独表达状态**：状态一律文字（`TASK_STATUS_LABELS` 中文名）+ `data-status` 属性双通道；
  既有取消态删除线规则保留（服务审计面），但看板投影不再产生取消行。
- **不新增弹窗**：无新浮层、无新 `z-index` 分层；台账视图就地铺开。
- **不新增路由**：无新 `#` 片段、无新深链；前进 / 后退语义不变。
- **既有 `data-*` 断言不许破**（只改**数值**，不改属性名与列结构）：

| 既有断言锚点 | 归属 | 本需求如何影响它 |
|---|---|---|
| `data-dag-summary="1"` / `data-dag-task-count` / `data-dag-layer-count` / `data-dag-layers` / `data-dag-edge-count` / `data-dag-parallelism` / `data-dag-statuses` | `src/client/views/panels/dag.ts` 图数据摘要 | 属性名与结构不变；数值按活卡算；`data-dag-statuses` 不再含 `canceled` 档 |
| `data-step-row`（八列执行结果表） | `src/client/views/panels/dag.ts` | 列结构不动；执行记录随任务集合过滤 |
| `.dsh-pm-sn-dag-layer` / `.dsh-pm-sn-dag-task` | `src/client/stage-panel.ts` | 只减少行 / 层，不改 class 与嵌套 |
| `.dsh-pm-gantt-bar` / `.dsh-pm-gantt-legend-item` | `src/client/views/timeline.ts` | 只减少 bar 数；状态图例不动——**不新增「已取消」图例项** |
| `.dsh-pm-trace-node[data-type]` | `src/client/views/traceability-view.ts` | 只减少 `data-type="task"` 节点数 |
| `data-doc-row`（文档面板计数恒等式） | `src/client/views/panels/docs.ts` | 计数断言仍必须成立；**对账分母换成活卡口径**（见边界④），行数会减少，属性个数 == `documents.length` 不变 |

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-4, FR-5 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 前端在哪里过滤 | 各渲染块各过滤一遍（改动分散） | **API 边界（`/state`）收敛一处 + 面板投影各自收敛 + 两处客户端兜底（`toCard` / `topoLevels`）** | 卡计数 / 甘特 / DAG 画布共用一份载荷，边界收一次即大体同数；但 `toCard.totalCount` 与客户端分层是**独立漏点**，不能假设"上游好了就自动好" |
| 判据放哪一层 | 新建 `domain/task/TaskLiveness.ts`（我最初的方案）；或放 `shared/live-tasks.ts` | **追加进既有 `domain/status/Predicates.ts`** | 该文件本就是「按意图命名的状态谓词」唯一落点（`isCanceled` 已在此），**不为此新建模块**；`domain` 又是**唯一**被四层同时 import 且自身不 import `shared/` 的层（放 `shared` 会被 `domain/queue/topology.ts` 挡在门外，那一处就又得手写一份） |
| 判据入参 | `TaskRecord`（原型写法） | **结构化 `HasStatus`（`{ status: string }`）** | 要跨四层复用就不能绑 `shared` 的类型；行为逐字一致（只看 `status`） |
| 判据命名 | 简写 `liveTasks` / `liveCount` | **`is` 前缀 + `of` 后缀**（`isLiveTask` / `liveTasksOf` / `liveCountOf` / `liveLayers` / `liveReadyTasks` / `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` / `layerInputOf`） | 便于 grep 与机械断言；与模块内既有 `closingGapOf` 同风格 |
| 只删节点 vs 删节点+剔边 | 只从集合里拿掉取消卡（最小改动） | **拿掉节点 + 剔掉指向它的边，且剪边落进 `topoLevels` 内部** | 客户端 `topoLevels` 把"不在集合里的前置"当 `lv = 0` 计入，只删节点会让活卡凭空多一层 ⇒ 违反 D-8 / 验收 A2 |
| 悬空依赖怎么归类 | 与"已取消"合并成"已满足" | **`dangling` 单独成桶** | 校验（V-3）仍要能报悬空；把悬空默默算 satisfied 会让队列校验失去证据。**分层与开工只认 `satisfied`** |
| 三处 ready 判定怎么办 | 只改最显眼的那一处 | **三处同改，且以已经正确的那一处为基线** | 只改界面用的那处，落盘 `ready` 字段仍是旧口径 ⇒ 两套"可开工"，且队列调度仍被卡死 |
| 覆盖度两个入口 | 只改会话工具走的那条 | **两条同改** | 只改一条就是会话 106 / 看板 132——需求要消灭的正是"两套分母"（D-4） |
| 全仓 54 处手写 filter | 一次全收编 | **只收编消费点 + 三处依赖判定，其余登记为基线** | 一次全收编会把这个缺陷修复变成全仓重构（范围膨胀、回归面不可控）；基线 + 「新增即红」足以止住漂移 |
| 「彻底不可见」的表现 | 默认折叠 + 可展开（"想看还能看"） | **不给开关、不给计数交代** | 用户裁定 D-3 / D-7；给了开关，取消就成了"可选的第二读数"，回退惩罚只是被藏起来 |
| 台账与文档面板是否也跟着过滤 | 都不列（"统一 0 条"） | **界面不列；台账与磁盘文档一条不动** | FR-5 后半句：界面不出现、**台账不消失**；过滤掉台账审计链就断了（D-1）。文档面板按 A3 不列取消卡产物，但不变量必须同步换成活卡口径 |
| 存量需求是否追溯改造 | 给历史需求也补过滤 / 补留痕 / **重算 RTM** | **不追溯**，只对将来的行生效 | FR-6 / D-5：加性可选、零迁移；历史取消卡如实标注"未采集"；**存量需求永不触发 RTM ⇒ 追溯读数可能是含取消卡的陈旧快照**（见「已知边界」），验收口径据此限定 |
| 取消卡复活后留痕怎么办 | 复活时清空三字段（"已不是取消态了"） | **不清空**（语义 = 最近一次取消） | 清空会抹掉回退事故的证据（D-1 的精神）；"最近一次取消"是一个可查的事实，不该随状态变化消失 |

## 技术方案与亮点 <!-- serves: FR-2, FR-4, FR-5 -->

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| 无新增 | — | — | 全部复用既有 TypeScript + 命令式字符串渲染 + vitest 字符串断言 |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/domain/status/Predicates.ts`（追加） | 「活卡 / 依赖已满足 / 分层输入 / 可开工」两组判定的唯一事实源（四层共用） |
| `src/http/routers/stages.ts` | `GET /state` 边界：一次过滤，喂饱卡计数 / 甘特 / DAG 画布 / 任务总览页 |
| `src/shared/protocol.ts`、`src/domain/queue/topology.ts`、`src/application/use-cases/queue-access.ts` | 三处「可开工」判定，收敛到 `isReadyTask` |
| `src/application/query/{QueryStageDetail,QueryDag,QueryDocs,QueryReport,QueryState}.ts` | 面板投影取数：基类 `assemble()` 收敛过滤 / 剔边 / `liveLayers` 出层号 / 不变量重述 |
| `src/client/views/board.ts`、`src/client/views/stage-panel.ts` | 两处**独立漏点**的客户端兜底：`toCard` 的 `liveCountOf`、`topoLevels` 内部剪边 |
| `src/client/views/{timeline,panels/dag}.ts`、`src/client/render/subtask-view.ts` | 只排版 / 收编本地 `live` 辅助，不另算口径 |

**设计模式**：**单点事实源**（判据一个模块，消费点全部复用）+ **边界收敛**（一次请求一处过滤）+
**纯函数渲染**（入参 `unknown`、出参字符串，可直接字符串断言，不需要 DOM）。

**关键实现手法**：

| 手法 | 说明 |
|---|---|
| 判据只暴露"是不是活卡 / 依赖满没满足" | 消费点拿到的是布尔 / 过滤后的数组 / 三个桶，不是"取消卡名单"——名单一旦存在，就会有人拿它去做第二份统计 |
| 过滤与剪边同源 | 剪边走同一模块的 `splitDependencyEdges` / `layerInputOf`（D-8 语义绑死）；拆开就迟早有人只调用一半 |
| 计数走 helper 而不是 `.length` | 分母与行数同源；`.length` 散落各处就是下一次漂移的入口（`toCard.totalCount` 就是活证据） |
| 边界收口 + 独立漏点兜底 | `/state` 一处 + 面板投影一处 + `toCard` / `topoLevels` 两处兜底；**不假设"上游好了下游就自动好"** |
| 只改数值不改属性 | 既有 `data-*` 断言是回归网；本需求只让数字变小，不让选择器失效 |

**攻克的难点**：

| 难点 | 怎么解开 |
|---|---|
| 判据要跨 domain / shared / application / client 四层，而 `domain` 禁 import `shared` | 追加进既有 `domain/status/Predicates.ts`（其模块头已声明"只收结构化最小投影"）、入参 `HasStatus`；这是唯一四层通吃的落点，且**不需要新建模块** |
| 悬空依赖会让层号偏移（掉层 / 多一层），且**真正分层在客户端当场算** | 剪边必须落进 `stage-panel.topoLevels` 内部（那里对未知 id 返回 0 会造幽灵边）；服务端投影剔边只算第一道；并留一条"层号 == 删边重算"的用例把只删节点的半成品钉红（TC-2） |
| 三处 ready 判定只有一处对，且错的正是界面用的那一处 | 先修判定再修显示；用例必须证明"活卡**真的能开工**"，而不只是"不掉层"（TC-3） |
| 覆盖度有两个入口，改一条就两套分母 | 两个入口同源同改；用例对两条路径各断言一次分母（TC-5） |
| 全仓 54 处手写 filter，全收编会把修缺陷变成重构 | 收编清单收敛到消费点 + 依赖判定各处；其余登记基线，配**新建独立用例**的「新增手写点即红」（TC-6，**不挂进当前本就红的 `layer-boundary`**） |
| 「不可见」容易被实现成"藏起来" | 判据用**计数 = 0**（含 `title` / `aria-label`）而不是"看不见"；并配"台账仍有 26 条"的反向断言 |
| 存量需求的追溯读数是陈旧快照 | 如实写进「已知边界」；验收口径限定为"对**新触发过 RTM 的**需求，追溯行数按活卡"，不追溯重算、不裁剪 RTM 已有行 |

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试） |
|---|---|---|---|---|
| 过滤位置 | 各渲染处各写一行 `filter` | **边界收敛（`/state` + 面板投影）** | 手写 filter 会随消费点数量增长而漂移（现状已有 54 处 / 34 文件） | `src/http/routers/stages.ts`；防漂移用例（TC-6） |
| 依赖语义 | 悬空依赖 = 未满足（永久阻塞）；取消卡也当未满足 | **已取消 = 已满足**（边删掉重算）；**悬空单独成桶** | 被取消的卡永远不会完成，当未满足会把活卡永久卡死；悬空又要留给校验报 V-3，不能混算 | `Predicates.ts` 的 `isReadyTask` / `splitDependencyEdges`；开工用例（TC-3） |
| 取消卡的呈现 | 灰行 / 删除线 / "已取消"徽标 | **整行不存在** | 「藏起来」仍可被读出为"没做完"；用户裁定彻底不可见 | `stage-panel.ts` / `panels/dag.ts`；视图用例（TC-1） |
| 统计口径 | 一致靠"约定" | **四读数额额相等 + 一个分母（两个入口）** | 约定不可失败，等式可失败 | `board.ts` / `timeline.ts` / `traceability-view.ts`；一致性用例（TC-4） |

## 前端侧边界（不做什么） <!-- serves: FR-1, FR-5, FR-6 -->

| 不做 | 理由 |
|---|---|
| 不做「显示已取消」开关 / 计数交代 | D-3 / D-7：给了开关或计数，就等于把"退出赛道"重新变成一条可读的读数 |
| 不在渲染块里各写一份过滤 | 过滤只在 `/state` 边界、面板投影、`toCard`、`topoLevels` 四处收口；其余渲染块吃已过滤载荷（FR-4） |
| 不在客户端推可开工 | `BoardState.ready` 是唯一来源（服务端 `isReadyTask` 产出）；客户端自推 = 第四处 ready 判定 |
| 不在客户端另算分层口径 | 分层算法仍是既有 `topoLevels`，本需求只把**剪边**（`layerInputOf` / `splitDependencyEdges`）放进它内部——不是再写一套分层 |
| 不因为追溯读数陈旧而去裁剪 / 重算 RTM | 存量需求永不触发 RTM，陈旧快照是**已知事实**；裁剪 RTM 已有行 = 篡改历史读数 |
| 不物理删除卡片 / 卡文档 | D-1：卡片 id 被依赖、子卡链、追溯、评论引用，且是回退事故的第一手证据 |
| 不改取消 = 人工门这条属性 | FR-5 边界：agent 仍无权取消；前端不新增取消入口 |
| 不改现有统计的计量粒度 | 需求边界：一卡一行的地方仍一卡一行，只做「剔除已取消」这一件事 |
| 不追溯存量需求的展示与留痕 | FR-6 / D-5：历史取消卡如实标注未采集，不回填、不改写 |
| 不新增弹窗、不新增路由、不引新依赖、不新建判据模块 | 最小改动；判据追加进既有 `domain/status/Predicates.ts` |
