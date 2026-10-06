---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
sides: [frontend, backend]
---

# 架构设计（REQ-261005193546-1b1a） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 条款源：`docs/requirements/REQ-261005193546-1b1a/requirement.md`（6 条 FR / 8 条 D-x 裁定）。
> 权威原型：`docs/requirements/REQ-261005193546-1b1a/prototypes/dag-canceled-hidden.html`（`prototypes/INDEX.md` 里唯一那条 `authoritative`）。
> 本文件只写**设计**：不含拆分阶段的任务表与 DAG（那属拆分阶段产物）。
> 命名唯一一套（跨设计文档已统一）：**模块 = 既有 `src/domain/status/Predicates.ts`（`isCanceled` 旁，不新建模块）**；
> 函数 = `isLiveTask` / `liveTasksOf<T>` / `liveCountOf` / `liveLayers` / `liveReadyTasks(tasks, byId)` /
> `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` / `layerInputOf`。写侧落点与 helper 命名以 `data-model.md` / `backend.md` 为准，本文件**不另立第二套**。
> 报告口径：本文引用的源码行号在写稿时**逐条打开文件核过**。需求文档「改动位置与改动对比」表是粗粒度的，且有**两处判断与代码现实不符**、**漏了多处消费点**——见 §需求文档改动位置表的更正对照。

## 需求文档改动位置表的更正对照 <!-- serves: FR-1, FR-2, FR-4 -->

> **本节为什么单列且醒目**：需求文档「改动位置与改动对比」表是**粗粒度**的，其中**两行判断与代码事实不符**、且**漏了多处消费点**。
> 需求文档已确认，**本次不回写它**（改动要再走确认门），所以把对照集中在这里——**拆分阶段读本节即可，不要照需求文档那两行拆卡**，否则卡会拆到不存在的改动点上（改 `coverageGateOf` 不会让 80.3% 变 100%）。

| # | 需求文档写的 | 代码事实（含行号） | 正确收编点（含行号） |
|---|---|---|---|
| ① | 「覆盖度分母（`rtm-yaml.coverageGateOf` ← RTM `task_coverage`）」**没过滤** ← 80.3% 的由来 | `coverageGateOf`（`rtm-yaml.ts:140`）**只把已有结果转成门裁决**：`if (result?.ok !== true) return undefined` → `rtmValidator.checkGate(stage, coverage)`。它**不读任务、不过滤**；分母是生成器按**喂进去的 `tasks` 数组**算的 | **喂入侧两个入口**：`rtm-yaml.ts:153 syncRTMYaml`（实测 **18** 个调用点）+ `rtm-yaml.ts:188 syncRTMYamlWithSnapshot`（HTTP 三条直调绕过前者：`http/routers/requirements.ts:404`、`:464`、`http/routers/tasks.ts:174`）。**只改 `coverageGateOf` 不产生任何效果** |
| ② | 「依赖图 `QueryDag.ts` / `QueryDocs.ts` 各自手写过滤（**已过滤**）」 | `QueryDag.ts` 是**半过滤**：`:138 buildCriticalPath` 里 `const alive = tasks.filter(t => t.status !== 'canceled')` 过滤了；但 `:234 buildDagNodes(tasks, layerIndexOf(queue))` **不过滤**，交给前端的节点数组仍含取消卡（`client/views/panels/dag.ts:206` 的「卡片 N 张」会读成 132）。`QueryDocs.ts:597` 确实已过滤（`buildGateVerdicts` 的 `implementation` 门） | `QueryDag.ts:234` 节点数组过单点；`:138` 的 `alive` 收编为单点调用；`QueryDocs.ts:597` 收编 |
| ③ | 视图只有一处：`QueryStageDetail.ts`（看板「DAG 层级」）**完全没过滤** | 漏点**不止这一处**；且需求文档没点到的几处，才是标本需求（状态 `implementing`）实际会被看到的 | 逐条列在 ③-a ~ ③-h |
| ③-a | （需求文档未提落点粒度） | `QueryStageDetail.ts` 的**基类**是 `StageDetailAssembler`（`:75`），模板方法 `assemble(ctx)`（`:77`）在 `:90` 调 `this.buildBody(req, ledger, ctx)`；各节点装配器（`DecomposeStageAssembler:189`、`ImplementStageAssembler:212`…）**各自**从 `ledger.tasks` 取数，于是漏了两处（`:196`、`:219`） | **在基类 `assemble()` 一次收敛**（`:77`~`:90` 之间把传给 `buildBody` 的 `ledger.tasks` 换成 `liveTasksOf(...)`），**不逐 body 改**——本次病根正是「某处漏了」，逐个 body 补等于把病根留在原地 |
| ③-b | （需求文档未提） | `client/views/board.ts:26-34 toCard`：`tasks = state.tasks.filter(t => t.requirementId === req.id)`，`doneCount` 与 **`totalCount: tasks.length`** 都算 132；`:35 readyIds: state.ready[req.id] ?? []` | 吃 `/state` 收敛后的 `tasks`（本处**不再自己 filter**） |
| ③-c | （需求文档未提 API 边界） | `http/routers/stages.ts:87 handleState`：`:87 taskStore.listAll()` → `:95 tasks: tasks.map(t => ({ ...t }))`（全量）+ `:99-101 ready: …readyTasks(tasks, r.id)…` | **`/state` 出参前双收敛**（`tasks` 过单点、`ready` 走就绪单点）——甘特 / DAG 画布 / 卡面计数 / 可开工绿点四处因此天然一致 |
| ③-d | （需求文档未提客户端分层） | 真正的「DAG 层级」分层在**客户端当场算**：`client/stage-panel.ts:347 renderDecomposingBody → topoLevels(tasks)`（看板阶段详情面板）、`client/node-panel.ts:215` / `:277 buildDagCanvas(b.tasks)`（会话框节点面板）。`StageTaskRef`（`shared/protocol.ts:426`）**没有 `layer` 字段** | `topoLevels`（`stage-panel.ts:319`）输入剔卡 **+ 内部剪边**（它对未知 id 返回 0，不剪边会造幽灵边 → 掉层）；`node-panel.ts:215/277` 靠上游 body 剔卡，**不加第二份 filter** |
| ③-e | （需求文档未提） | `client/board-mount.ts:563-564`：`state?.tasks.filter(t => t.requirementId === reqId)` 后喂 DAG 画布（只按需求过滤）；`:642` 同源取 `state.ready` | 同上，吃 `/state` 收敛后的 `tasks` / `ready` |
| ③-f | （需求文档未提） | `client/views/timeline.ts:128 buildGantt(req, g.tasks, now)` —— 逐行不过滤 | 同上 |
| ③-g | （需求文档未提） | `application/query/QueryReport.ts:402 progressOf`（详情页计数，**已过滤·手写**）、`application/query/QueryState.ts:108` / `:136`（`reqboard_status` 读数，**已过滤·手写**）、`client/render/subtask-view.ts:98 live()`（子卡链进度，**已过滤·手写**） | 三处收编为单点 + `liveCountOf` |
| ③-h | （需求文档未提界面口径） | DAG 的状态档位（`data-dag-statuses`）仍带取消档 ⇒ 显示 `canceled 0` 也是「交代」，与 D-7 冲突 | **状态档位去掉 `canceled` 档**（判据见 §不变量 的落地清单） |
| ④ | （需求文档未提依赖判定） | `FR-1` 只写了「不阻塞活卡的依赖」，未指出**三处口径漂移**：`application/use-cases/queue-access.ts:59 readyTasksOf`（取消边=已满足，**正确·语义源**）vs `shared/protocol.ts:1817 readyTasks` 与 `domain/queue/topology.ts:131 computeReady`（**只认 `done`**） | **三处收敛到一处**，以 `readyTasksOf` 的语义为准（详见 §改前缺陷说明 缺陷 1） |

**拆分阶段的一句话读法**：视图面改「`QueryStageDetail.ts` 基类 `assemble()`（`:77`）一处收敛 + `QueryDag.ts:234` + `client/stage-panel.ts:347` + 吃 `/state` 的三处（`board.ts` / `board-mount.ts` / `timeline.ts`）＋ 界面状态档位去 `canceled` 档」；统计面改「`rtm-yaml.ts:153` + `:188` 两个喂入入口 + `QueryReport.ts:402` + `QueryDocs.ts:597` + `QueryState.ts:108/136` + `client/render/subtask-view.ts:98` + `validateQueue.ts:245` 的 V-5」；依赖面改「`readyTasks`（`protocol.ts:1817`）+ `computeReady`（`topology.ts:131`）收敛到 `readyTasksOf`（`queue-access.ts:59`）语义」。

## 目标与总体方案 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**问题**：上一条需求（REQ-261005105032-3b02）两次回退产生 26 张已取消卡，暴露两个后果——看板「DAG 层级」把取消卡与在位卡混画（人读成「132 张里 26 张没做完」），测试覆盖度门把取消卡算进分母（106/132 = 80.3%，取值 80 ⇒ 压线通过但仍点名 26 张）。

**当前状况**（核过的代码事实；每条都在 §改前缺陷说明 与 §消费点清单 展开）：

- **判据没有单点**：「活卡」语义散成 **54 处 `status` 与 `'canceled'` 的字面量比较、分布在 34 个文件**（实测口径见 §防漂移设计）。既有消费点（统计/视图投影），也有写侧守卫。
- **消费点是一组，不是两处**：`QueryStageDetail`（基类两处漏过滤）、`QueryDag.queryDag` 喂 `buildDagNodes` 的那处（**漏**，且层号取落盘 `layer`）、`QueryDocs`（已过滤需收编）——外加 `QueryReport`、`QueryState`、`rtm-yaml` 两入口、`validateQueue` 的 V-5、以及客户端一整片。
- **依赖判定三处口径漂移（真缺陷）**：`readyTasksOf`（取消边=已满足）vs `readyTasks` / `computeReady`（**只认 `done`**）⇒ 活卡被取消卡**永久卡死**（不是掉层这么轻，是开不了工）。
- **层的计算与显示会分叉**：落盘 `layer` 由 `computeLayers` 按**全量节点**算（取消卡占层），而视图按活卡显示。
- **甘特 / DAG 画布 / 看板卡计数吃同一份 `/state`**：`stages.ts:87 handleState` 全量下发 `tasks` 与 `ready` ⇒ 在 **API 边界收敛一处**，客户端消费面自然一致。

**设计方案**（三条线，各自单点）：

1. **判据单点**：语义落**既有** `src/domain/status/Predicates.ts`（`isCanceled` 旁，**不新建模块**），泛型 `<T extends { status: string }>` 保类型（domain 不许 import `shared/protocol`，层门禁要求，故不引用 `TaskRecord`）。
2. **API 边界单点**：`/state`（`handleState`）出参前同时收敛 `tasks` 与 `ready` ⇒ 甘特、DAG 画布、看板卡计数、可开工绿点四处天然同口径。
3. **依赖判定单点**：以 `readyTasksOf` 的语义为唯一语义，`readyTasks` / `computeReady` / `validateQueue` 的 V-5 收敛过去；层的**计算与显示同源**（INV-5）。

**做完的可证伪结果**（每条对应需求验收标准）：

| # | 可证伪结果 | 判据（可执行） | 服务条款 |
|---|---|---|---|
| 1 | 标本需求（132 张、26 张已取消）的每个界面投影都只出 106 张 | 对标本跑全部投影，逐处断言取消卡条数 = 0 且卡数 = 106 | FR-1、FR-5 |
| 2 | 活卡的依赖指向取消卡时，该边按已满足处理，**且该活卡确实可开工** | 层号与「把该边删掉后重算」相等；且该活卡 id 出现在 `ready` 里（可开工绿点亮） | FR-1 |
| 3 | 界面与统计的卡数永远相等 | 同一份台账，界面卡数 == 统计分母，断言 106 == 106（禁止再出现 132 vs 106） | FR-2 |
| 4 | 覆盖度门分母不再含取消卡 | 上一条需求 REQ-261005105032-3b02 重跑验收前置：80.3% → 100%（口径见 §改前缺陷说明 缺陷 3） | FR-2 |
| 5 | 判据只有一个来源 | 源码级断言：本需求收编面出现 `canceled` 字面量比较即红（独立用例，不挂 `layer-boundary`） | FR-4 |
| 6 | 甘特 / 卡面计数 / DAG 层级同数 | 三者都吃 `/state`，对标本断言三处卡数 == 106 | FR-1、FR-2 |
| 7 | 取消一张卡后台账有谁/何时/为什么 | 取消后读台账，三字段均有值（人 + 时间 + 原因） | FR-3 |
| 8 | 物理数据一条不少、旧数据零写回 | 同一份台账的取消卡记录数不变；读取前后全量目录 mtime 逐份不变 | FR-5、FR-6 |

**机制总览（台账 → 活卡单点 → API 边界 → 三面消费）**：

```
                     +-----------------------------------------------------------+
   台账 / 队列        |  唯一事实源 · 物理数据永在（FR-5 / FR-6 / D-1）              |
   （磁盘）           |  taskStore.listAll() / listByRequirement(r) / readQueue(r) |
                     |   +-----------------------+   +-----------------------+   |
                     |   |  106 张活卡            |   |  26 张 canceled 卡     |   |
                     |   |  （界面/统计的全体）     |   |  （只在盘上、只在审计）  |   |
                     |   +-----------------------+   +-----------------------+   |
                     +---------------------------+-------------------------------+
                                                 |
                           唯一判据从这里切（消费点不得各自 filter）
                                                 v
             +--------------------------------------------------------------------+
             |  活卡单点（FR-4）  src/domain/status/Predicates.ts（isCanceled 旁）     |
             |  既有模块内新增，**不新建模块**；泛型 <T extends { status: string }>    |
             |  （domain 不许 import shared，故不引用 TaskRecord，靠泛型保类型）         |
             |                                                                    |
             |   isCanceled(x)                 ← 既有：唯一的状态字面量             |
             |   isLiveTask(task)              判据                                |
             |   liveTasksOf<T>(tasks)         过滤：界面与统计的唯一入口           |
             |   liveCountOf(tasks)            计数/分母（分子分母必须同源）         |
             |   liveLayers(tasks)             分层（= layerInputOf 上的最长路径）   |
             |   liveReadyTasks(tasks, byId)   就绪集合（语义源 = readyTasksOf）     |
             |   isDependencySatisfied(dep)    undefined | done | canceled = 满足    |
             |   splitDependencyEdges(t, byId) 桶 satisfied / pending / dangling    |
             |                                 ← **唯一约束桶 = pending**           |
             |   isReadyTask(task, byId)       单卡就绪                            |
             |   layerInputOf(tasks)           分层输入（≡ 删掉指向取消卡的边）      |
             +---+-----------------------+-----------------------+----------------+
                 |                       |                       |
                 v                       v                       v
        [API 边界 · 收敛一处]      [服务端统计/门禁面]        [依赖判定面（三处漂移）]
        http/routers/stages.ts     QueryReport 详情页计数       queue-access.readyTasksOf
          handleState:87-101       QueryDocs 实施门裁决          （D-8 语义源 · 保留）
          tasks / ready 双收敛      SubmitVerification 前置门      shared/protocol.readyTasks
        QueryStageDetail 基类        ConfirmArtifact 确认         domain/queue.computeReady
          assemble():77~90 收敛     QueryState:108/136            domain/queue/validateQueue
        QueryDag:234 节点数组      rtm-yaml 两入口(:153/:188)      V-5 假就绪判定 :245
        QueryDag:138 关键路径
                 |                       |                       |
                 v                       v                       v
        [客户端消费面 · 全部吃 /state]
        甘特 timeline.ts:128 · DAG 画布 board-mount.ts:563 · 看板卡计数 board.ts:34
        可开工绿点 board.ts:35 · 节点面板 node-panel.ts:215/277
        阶段详情分层 stage-panel.ts:347 · 子卡链进度 subtask-view.ts:98
                 |                       |                       |
                 +-----------------------+-----------------------+
                                         v
              界面与统计一处都不出现取消卡（FR-5 / D-7，含状态档位不带 canceled）
              层的计算与显示同源（INV-5；落盘 layer 仅历史派生值）
              台账 26 行 + tasks/<id>.md × 26 仍在盘上（FR-5 / FR-6 / D-1）
              取消三字段：谁 / 何时 / 为什么（FR-3 / D-5）
```

**不改的后果**：80.3% 会重演（门禁继续惩罚回退）；活卡会被取消卡永久卡死；每新增一个投影就多一次「这处过滤了吗」的人眼核对。

## 改前缺陷说明 <!-- serves: FR-1, FR-2 -->

三件「改前就是坏的」。前两件让活卡**开不了工**，第三件让读数自相矛盾。

### 缺陷 1 · 活卡被已取消卡卡死（依赖判定三处口径漂移） <!-- serves: FR-1 -->

| # | 位置 | 判据 | 「依赖是取消卡」时 | 结论 |
|---|---|---|---|---|
| ① | `application/use-cases/queue-access.ts:59 readyTasksOf` | `d === undefined \|\| d.status === 'done' \|\| d.status === 'canceled'` | **视为已满足** | D-8 正确口径 |
| ② | `shared/protocol.ts:1817 readyTasks` | `t.dependsOn.every(dep => doneIds.has(dep))`，`doneIds` 只收 `status === 'done'` | 视为**未满足** | **漂移** |
| ③ | `domain/queue/topology.ts:131 computeReady` | `deps.every((dep) => byId.get(dep)?.status === 'done')` | 视为**未满足** | **漂移** |
| ④ | `domain/queue/validateQueue.ts:245`（V-5 假就绪） | `deps.filter(dep => byId.get(dep)?.status !== 'done')` | 视为**未满足** | **漂移（且会当场炸，见下）** |

**为什么是真缺陷而不是理论问题**——调用链核过：

1. `readyTasks`（②）被 **`/state`** 用来算每需求的可开工集合：`stages.ts:99-101`。
2. `/state` 的 `ready` 直接驱动界面的**可开工绿点**：`board-mount.ts:564`、`views/board.ts:35 readyIds`、`dag/card-renderer.ts:241 ready-dot`。
3. `computeReady`（③）算的是**落盘**的 `ready[]`（`QueueTaskStore.recompute` 重算），V-5/V-6 用它做一致性校验。
4. **V-5 假就绪（④）会把修好的写路径自己拒掉**：`QueueTaskStore` 写路径先 `recompute()`（用新的 `computeReady` 产出含该活卡的 `ready`），随后 `JsonQueueRepository.save`（`QueueRepository.ts:203`）`validateQueueFile(file)`；若 `:245` 仍按旧口径判「依赖未全部 done」→ 报**假就绪** → `QUEUE_VALIDATION_FAILED`，**一个字节都不落盘**。⇒ **`validateQueue.ts:245` 必须与判据同批改**，这是执行者最容易漏、且会当场炸的一处。

**后果**：一张活卡，若它唯一的未完成前置被取消，它就**永远不出现在任何 `ready` 里** → 画布永远没绿点 → 调度与人都认为它「不可开工」→ **永久卡死**。这是交付能力被冻结。

**改后行为**：四处置换为 `isDependencySatisfied(dep)`（`undefined | done | canceled` = 满足）；就绪统一走 `isReadyTask(task, byId)`；分层统一走 `layerInputOf(tasks)` + `liveLayers(tasks)`。

**判据（可执行）**：构造「活卡 x 的唯一前置 y 已取消」标本 → 断言 `readyTasksOf` / `readyTasks` / `computeReady` 三者输出逐字相等且都含 x；断言 `validateQueueFile` 对新语义的写盘载荷 `passed === true`（无假就绪）；断言 `/state` 的 `ready[reqId]` 含 x 且画布画出绿点。逆验证：任一处改回 `=== 'done'` → 必红。

### 缺陷 2 · 层的计算与显示不同源 <!-- serves: FR-1, FR-2 -->

| 侧 | 位置 | 口径 |
|---|---|---|
| 写路径（落盘） | `domain/queue/topology.ts:62 computeLayers` | 按**全量节点** Kahn 入度分层（取消卡照占一层）→ 落盘 `QueueLayer[]`，即 `QueueTask.layer` |
| 读路径（展示） | `client/stage-panel.ts:347 topoLevels(tasks)` | 客户端自己按最长依赖深度重算 |

`QueryDag` 又把落盘 `layer` 直接塞进节点：`QueryDag.ts:204 layerIndexOf(queue)` → `:234 buildDagNodes(tasks, layerIndexOf(queue))`。同一张活卡可能有三套层号。

**改后行为**：见 INV-5——**读路径**统一用 `layerInputOf` + `liveLayers`；落盘 `layer` 视为**历史派生值**，不参与显示。

### 缺陷 3 · 三处读数对同一份台账给出两个卡数 <!-- serves: FR-2 -->

核过的取数点（都「按需求过滤、不剔取消卡」）：

| 位置 | 读出什么 | 标本读数 |
|---|---|---|
| `client/views/board.ts:26-34`（`toCard`） | 看板卡面 `totalCount: tasks.length`、`doneCount` | **132** / 100 |
| `client/board-mount.ts:563` | 喂 DAG 画布的任务数组 | 132 |
| `client/views/timeline.ts:128`（`buildGantt`） | 甘特行数 | 132 |
| `QueryStageDetail` 基类（`:77`）→ `:196` / `:219` | DAG 层级 / 实施节点任务集合 | 132 |
| `application/query/QueryDocs.ts:597` | 实施门判据（**已过滤**） | 106 |
| `application/query/QueryReport.ts:402` | 详情页 `ReportProgress.tasks.total`（**已过滤**） | 106 |

**覆盖度的精确口径（两段，别混成一条）**——上一条需求 REQ-261005105032-3b02 的真实历史是两段：

| 段 | 当时状态 | 门裁决 | 说明 |
|---|---|---|---|
| ① | `covers` 标注为 **0** | **被拒**（0%） | 被拒的是 **0% 那一次**，不是 80.3% 那一次 |
| ② | 补上标注后 **106 / 132 = 80.3%** | 取值 80 ⇒ **压线通过**，但仍**点名 26 张** | 阈值边缘通过；「回退即被惩罚」的体感来自这里 |
| 改后 | 分母 132 → **106** | **100%** | 26 张取消卡不再进分母 |

⇒ 本需求修的是**第 ② 段的分母**（并把 ① 段的 0% 与 ② 段分开记）；验收 B5 的「80.3% → 100%」指的是第 ② 段。

## 不变量 <!-- serves: FR-1, FR-2, FR-4, FR-5 -->

**INV-1 · 同一份台账，界面卡数 == 统计卡数。**
判据：同一份台账喂给「视图面全部投影 + 统计面全部分母」，收集各自卡数，断言读数集合大小 == 1（标本期望 106）。

**INV-2 · 已取消卡不参与任何分母、不参与依赖判定、不出现在任何界面投影。**
三个「不」分开断言：① 分母类（覆盖度、进度、完成度、各项计数）不含取消卡；② 依赖判定（分层、关键路径、**可开工集合**）不把取消卡当节点也不当阻塞；③ 界面投影取消卡条数 = 0。

**INV-3 · 取消卡物理数据永在。**
台账记录与 `docs/requirements/<REQ>/tasks/<task_id>.md` 一条不删、一字不改。判据：取消卡记录数与磁盘任务卡文档数不变；读取前后目录 mtime 逐份不变（无写回）。

**INV-4 · 判据只有一个来源（单点），任何消费点不得自写 filter。**
`status` 与 `'canceled'` 的比较只允许出现在 `domain/status/Predicates.ts` 内；依赖判定四处（`queue-access` / `protocol` / `topology` / `validateQueue`）必须同源。

**INV-5 · 层的计算与显示同源（显示侧口径）。**
对每张活卡，「读路径展示的层号」与「删掉指向取消卡/不在场节点的边后重算的层号」必须相等（`layerInputOf` + `liveLayers`）。

> **INV-5 的边界（已知刻意差异，按裁定：守零写回）**：落盘 `layer`（`computeLayers`，`:62`）**照旧按全量节点算、不重写存量队列文件**。因此落盘 `layer` 与显示层号**允许不相等**，落盘值仅作历史派生值、**不参与任何显示读数**。INV-5 只覆盖下列以**读路径**为准的读数——
> ① 阶段详情「DAG 层级」的分层（`topoLevels`，`stage-panel.ts:347`）；
> ② DAG 画布节点层（`dag-view.ts:100 layerOf`）；③ `QueryDag` 节点 `layer`（`:234`，改后从 `liveLayers` 取，不再转发落盘值）；
> ④ 关键路径（`QueryDag.ts:138 buildCriticalPath`）；⑤ 可开工集合（`liveReadyTasks`）。
> **不以读路径为准的**：`queue.json` 的 `tasks[].layer` / `layers[]` 落盘字段本身（允许陈旧），以及 `validateQueue` 的 V-4（它校验的是文件自洽，不是显示）。

**INV-2 的落地清单（可证伪，逐条给锚点）**：

| # | 断言 | 判据（可执行） |
|---|---|---|
| a | 界面**不给**「显示已取消」开关 | 源码命中 `includeCanceled` / `showCanceled` == **0** |
| b | 界面文本与属性里**没有**取消痕迹 | 可见文本与 `data-*` 属性里 `canceled` / `已取消` 命中 == **0** |
| c | DAG 的**状态档位不含 `canceled` 档** | `data-dag-statuses` 的档位集合不含 `canceled`（显示 `canceled 0` 也是交代，与 D-7 冲突） |
| d | 三种投影的取消卡条数均为 0 | DAG 节点数组 / 甘特行 / 追溯行逐处断言 == 0 |

## 消费点清单 <!-- serves: FR-1, FR-2, FR-4, FR-5 -->

状态列：`漏`（没过滤，取消卡会漏进投影）、`半`（同文件一处过滤一处没过滤）、`手写`（已过滤但自写 filter，需收编）。

### ① API 边界（收敛一处，客户端消费面自然一致） <!-- serves: FR-1, FR-2 -->

| 位置 | 下发什么 | 状态 | 改后 |
|---|---|---|---|
| `src/http/routers/stages.ts:87`（`handleState`）→ `:87 taskStore.listAll()`、`:95 tasks: tasks.map(t => ({ ...t }))`、`:99-101 ready: …readyTasks(tasks, r.id)…` | **全量 `tasks` + 每需求 `ready`**——甘特、DAG 画布、看板卡计数、可开工绿点的共同数据源 | **漏**（`tasks` 全量；`ready` 用了只认 `done` 的 `readyTasks`） | 出参前双收敛：`tasks` 过 `liveTasksOf`，`ready` 走 `isReadyTask` / `liveReadyTasks`。**这是最关键的一处收敛** |

> **读路径纪律（裁定 2 + 裁定 ①）**——三段式：
> ① **`ready` 必须现算**，**不得读取落盘 `ready[]`**。现状已符合——`stages.ts:96-98` 的注释明写「不用队列文件的 `ready` 字段（其顺序由 `computeReady` 决定，不保证一致）」。落盘 `ready[]` 的唯一用途是 `validateQueueFile` 的 V-5/V-6 **文件自洽校验**，不参与任何显示。
> ② **读取路径的校验失败不得让整条队列读成 `undefined`**：`JsonQueueRepository` 的读取路径应降级为 **warning + 继续返回队列**（否则一个陈旧的派生值会让该需求任务读作 0 张）。
> ③ **写路径仍严格**：`save`（`QueueRepository.ts:203`）保持强校验、失败即抛 `QUEUE_VALIDATION_FAILED`。一句话口径：**校验的目的是拦住「写坏」，不是让「派生值陈旧」把存量需求判成没有任务。**

### ② 服务端面板与统计 <!-- serves: FR-1, FR-2 -->

| 位置 | 取什么 | 状态 | 改后 |
|---|---|---|---|
| `src/application/query/QueryStageDetail.ts:75`（基类 `StageDetailAssembler`）→ `:77 assemble(ctx)` → `:90 this.buildBody(req, ledger, ctx)` | **所有节点 body 的任务集合**（拆分 `:196`、实施 `:219` 都从 `ledger.tasks` 取） | **漏**（两处） | **在基类 `assemble()` 一次收敛**：`:77`~`:90` 之间把传给 `buildBody` 的 `ledger.tasks` 换成 `liveTasksOf(...)`。**不逐 body 改**——本次病根正是「某处漏了」 |
| `src/application/query/QueryDag.ts:234`（`buildDagNodes`） | DAG Tab 的**节点数组**（`:204 layerIndexOf(queue)` 取落盘 `layer` 一并塞进节点） | **漏**（且层号转发落盘值，见缺陷 2） | 节点数组过 `liveTasksOf`；`layer` 改从 `liveLayers` 取（INV-5） |
| `src/application/query/QueryDag.ts:138`（`buildCriticalPath`） | 关键路径（同文件唯一过滤处） | **手写** | 收编：删掉 `alive` 自己那份 filter，复用单点 |
| `src/application/query/QueryDocs.ts:597`（`buildGateVerdicts` 的 `implementation` 门） | 「已进入实施 + 任务卡已落库」裁决 | **手写** | 收编 + `liveCountOf` |
| `src/application/query/QueryReport.ts:402`（`progressOf`） | 详情页计数与进度线（`ReportProgress.tasks.*`） | **手写** | 收编 + `liveCountOf` |
| `src/application/query/QueryState.ts:108` / `:136` | `reqboard_status` 的任务读数 | **手写** | 收编 |

### ③ 追溯 / 门禁（RTM 两个入口） <!-- serves: FR-2, FR-4 -->

| 入口 | 规模 | 状态 | 改后 |
|---|---|---|---|
| `src/application/internal/rtm-yaml.ts:153 syncRTMYaml` | **18 个调用点**（`SubmitVerification:208/363`、`ConfirmArtifact:118/189`、`ConfirmSettle:187`、`CreateRequirement:75`、`CaptureRequirement:320/328`、`MoveTask:239`、`ReportTask:212`、`AdoptTask:181`、`AmendTaskRefs:133`、`SubmitDesignArtifacts:108/156`、`SubmitArtifact:178/645`、`backfill-task-refs:188/217`） | **漏** | 入口顶部剔卡 ⇒ 18 个调用点全局生效 |
| `src/application/internal/rtm-yaml.ts:188 syncRTMYamlWithSnapshot` | **HTTP 三条直调**：`http/routers/requirements.ts:404`（`confirm:plan`）、`:464`（`confirm:artifact`）、`http/routers/tasks.ts:174`（`task:status`）——**绕过前者** | **漏** | 同样收敛。两个入口都要，缺一条就漏三条路径 |

**覆盖度门的既有边界（沿用，不改）**：**活卡 0 张时不拦**——分母为 0 时门不执法（`coverageGateOf` 已判 `coverage.total <= 0` 即返回 `undefined`；`rtmValidator.checkGate` 的 `total = 0` 边界亦不执法）。本需求沿用该边界，不新增「0 张也算不通过」的口径。

**⚠ 已知边界（必须写进验收口径的限定语）**：**RTM 是快照，不是实时投影**。存量需求若**永不再次触发 RTM**，其追溯读数会**停留在含取消卡的旧快照**上。实证（同一条需求 REQ-261005105032-3b02，两个文件两个数）：

| 文件 | 证据行 | 读数 |
|---|---|---|
| `docs/requirements/REQ-261005105032-3b02/rtm-implementing.yml` | `:8 detail_count: 132`、`:409 tasks_total: 132` | **132（含 26 张取消卡）** |
| `docs/requirements/REQ-261005105032-3b02/rtm-accepting.yml` | `:1447 total: 106`、`:1448 covered: 106`、`:1451 total_tasks: 106`、`:1452 tested_tasks: 106` | **106（活卡）** |

⇒ **验收口径限定语**：追溯读数按活卡 = 「**对新触发过 RTM 的**需求」；存量未再触发的需求**接受其快照陈旧**（含取消卡），**不回填、不重写快照**（守 FR-6 零写回）。这条必须写进验收材料，不假装追溯读数全局实时。

### ④ 客户端消费面（全部吃 `/state`） <!-- serves: FR-1, FR-2, FR-5 -->

| 位置 | 消费什么 | 状态 | 改后 |
|---|---|---|---|
| `src/client/views/board.ts:26-34`（`toCard`） | 看板卡面 `tasks` / `doneCount` / `totalCount` | **漏** | 吃 `/state` 收敛后的 `tasks`；本处不再 filter |
| `src/client/views/board.ts:35` | `readyIds: state.ready[req.id] ?? []`（可开工绿点） | **漏**（上游 `readyTasks` 口径错，见缺陷 1） | 上游修复后自动正确 |
| `src/client/board-mount.ts:563-564` | 喂 DAG 画布的任务数组 + `ready` | **漏**（只按 `requirementId` 过滤） | 同上 |
| `src/client/views/timeline.ts:128`（`buildGantt`） | 甘特逐行 | **漏** | 同上 |
| `src/client/stage-panel.ts:347`（`renderDecomposingBody` → `topoLevels`） | **看板「阶段详情 / DAG 层级」的真正的分层渲染** | **漏** | 上游剔卡 + `topoLevels`（`:319`）内部剪边（§依赖边语义） |
| `src/client/node-panel.ts:215` / `:277`（`buildDagCanvas`） | 会话框节点面板的拆分/实施 DAG 块 | **依赖上游** | 上游基类收敛后自动一致；本处**不加第二份 filter**（否则违反 INV-4） |
| `src/client/render/subtask-view.ts:98`（`live()`） | 父卡/子卡链进度 | **手写** | 收编 |
| DAG 状态档位（`data-dag-statuses`） | 状态图例档位 | **漏**（含 `canceled` 档） | **去掉 `canceled` 档**（INV-2 落地清单 c） |

> 原型锚点：`prototypes/dag-canceled-hidden.html#FR-1`（`#mock-after .chip[data-status="canceled"]` → 0；`#mock-after .chip` → 106）与 `#FR-2`（`#mock-after .strip .bar` → 106；`#mock-after .trace` → 106）。

### ⑤ 依赖判定四处（本需求必须收敛；其余写侧登记为基线） <!-- serves: FR-1, FR-4 -->

| 位置 | 现状口径 | 改后 |
|---|---|---|
| `src/application/use-cases/queue-access.ts:59 readyTasksOf` | 取消边 = 已满足（**D-8 语义源，保留**） | 保留为语义定义，抽到单点（`isDependencySatisfied` / `isReadyTask`） |
| `src/shared/protocol.ts:1817 readyTasks` | **只认 `done`** | 调用单点（`shared` 允许 import `domain`，层门禁核对过） |
| `src/domain/queue/topology.ts:131 computeReady` | **只认 `done`** | 调用单点 |
| `src/domain/queue/validateQueue.ts:245`（V-5 假就绪） | **只认 `done`** | **必须同批改**——否则写路径被自己的 ready 判拒成 `QUEUE_VALIDATION_FAILED`（缺陷 1 第 4 条） |

> **V-4 对取消卡不豁免**（裁定 6）：`validateQueue.ts` 的 V-4 层级一致性仍按**全量节点**校验落盘 `layer`（与 `computeLayers` 同口径），不给取消卡开豁免——否则落盘派生视图的内部自洽会被破坏。

> **V-5 分档（裁定 ①：按「哪条 issue 可自愈」区分）**：
> | V-5 的两半 | 位置 | 性质 | 处置 |
> |---|---|---|---|
> | **假就绪** | `validateQueue.ts:245` | **真问题**（卡未就绪却被标记 ready）——不可自愈 | **仍是 issue**；`save` 照旧抛 `QUEUE_VALIDATION_FAILED` |
> | **漏就绪** | `validateQueue.ts:253`（调 `computeReady`） | **可自愈的陈旧派生值**（下次写路径重算即消失） | **从 issue 降为 warning** |
>
> 理由：漏就绪恰恰是「存量文件的 `ready[]` 是旧语义算的」所触发的形态——若它算 issue，读取路径会把整条队列判成不可用、该需求任务读作 0 张（见 §安全与性能）。判据见 §测试策略 TC-R2 / TC-R4。

### 对齐口径：一个口径的机械表述 <!-- serves: FR-1, FR-2 -->

```
吃 /state 的客户端面                  服务端面
------------------                    ---------
看板卡面 totalCount                    DAG 节点数组长度
DAG 画布节点数                         详情页 tasks.total（QueryReport）
甘特行数                              覆盖度门分母（rtm-yaml 两入口）
可开工绿点数（⊆ 活卡）                  QueryStageDetail 基类过滤后的任务集合长度
                                       implementation 门 live 数
        \                             /
         +---- 必须全等（INV-1）--------+
                        |
                        +--> 层号逐卡相等（INV-5 · 显示侧）
```

## 依赖边语义（D-8）：取消卡不构成依赖阻塞 <!-- serves: FR-1 -->

**规则**：活卡的 `dependsOn` 指向已取消卡时，该条边按**已满足**处理——活卡不因它掉层、不成孤岛、**也不因它开不了工**。

**语义单点**：`readyTasksOf`（`queue-access.ts:59`）的语义就是 D-8 的定义。收敛后由 `isDependencySatisfied(dep)` 表达：

```
isDependencySatisfied(dep)  // dep 是 byId 查表结果（或 undefined）
  undefined（悬空） → 满足
  status === 'done'      → 满足
  status === 'canceled'  → 满足          ← D-8 的全部内容
  其余                    → 未满足
```

`splitDependencyEdges(task, byId)` 把一条卡的依赖边分三桶：`satisfied` / `pending` / `dangling`。
**唯一约束桶 = `pending`**（即：阻塞这张卡的只有 `pending`；`satisfied` 不阻塞、`dangling` 不阻塞且由 V-3 负责检出）。
`isReadyTask(task, byId)` = 「自身 `todo` **且** `pending` 桶为空」。

**为什么「剔卡」之后还必须「剪边」**——既有实现对「未知 id」的容错相反：

| 实现 | 对 `dependsOn` 里不存在的 id 的处理 | 只剔卡不剪边会怎样 |
|---|---|---|
| `src/client/stage-panel.ts:319 topoLevels`（**看板「DAG 层级」用的就是这个**） | `byId.get(id)` 未命中 → `lv = 0`（不抛错） | **幽灵边**：`1 + 0 = 1` → 活卡被算成「有前置」，层号 +1 → **掉层** |
| `src/client/node-panel.ts:92 topoLevels` | 同上（同款复制品） | 同上（经 `renderDag` 保留但已不接线，仍要一致） |
| `src/client/dag/progress-bar.ts:212 collapseToCardLevel` | `if (o === t.id \|\| !isTop[o] \|\| seen[o]) return` → 指向不存在节点的边**自动丢弃** | 正确（无需额外剪边） |
| `src/application/query/QueryDag.ts:143 buildCriticalPath` | `t.dependsOn.filter(d => byId.has(d) && d !== t.id)` → **显式剪边** | 正确（既有正确写法，收编时保留其语义） |
| `src/client/views/dag-view.ts:100 layerOf` | `deps[id]` 来自 `collapseToCardLevel`，已剪边 | 正确 |

**判定算法（写死，全仓唯一口径）**：

```
输入：台账全量 T（含取消卡及其 dependsOn）

① 剔节点        live ← liveTasksOf(T)                    // 第一优先

② 剪边          layerInputOf(T) 给出分层输入：
                  byId ← live 的 id 索引
                  对每张 x ∈ live：
                    { satisfied, pending, dangling } ← splitDependencyEdges(x, byId)
                    deps'(x) ← satisfied ∪ pending     // 只保留在场节点的边 ⇒ 指向取消卡的边被删
                  （dangling 由 V-3 负责报，不参与分层）

③ 分层          liveLayers(T) = 在 (live, deps') 上的最长路径
                  lv(x) = 0                              若 deps'(x) 为空
                  lv(x) = 1 + max{ lv(d) | d ∈ deps'(x) } 否则

④ 就绪          ready ⊇ { x ∈ live | isReadyTask(x, byId) }
                  // 与 ② 同源：被剪掉的边（含指向取消卡的）不参与判定

⑤ 出参一致性    任何把 dependsOn 交给下层的投影（StageTaskRef.dependsOn、
                  DagGraphNode.dependsOn、画布边数组）都写**剪边后**的 deps'(x)
                  —— 否则下层会拿到剪不掉的边，重新长出幽灵边 / 层号分叉
```

**两种被明确否掉的写法**（各给反例，便于写成回归用例）：

- **「只在渲染时跳过」**（数组不过滤、画的时候 `continue`）：节点数组长度仍是 132，`client/views/panels/dag.ts:206` 的「卡片 N 张」与 `summaryHtml` 的层数统计都会读错 → 违反 INV-1。
- **「剔节点但不剪边」**：`topoLevels` 收到含取消卡 id 的 `deps`，`lv(未知 id) = 0`，活卡 `lv` 变 1 → 从第 1 层掉到第 2 层 → 违反 FR-1 判据。

**孤岛判定的边界**：D-8 的「不成孤岛」指**不因取消卡而产生悬空入边**，不是「每张活卡都必须有边」。本来就无前置的活卡在第 1 层、无入边是正常形态（原型 `#FR-1` 的第 1 层「无依赖 · 18 张」就是这批）。回归断言写的是「活卡的入边集合 == 把取消卡的边删掉后的入边集合」，不是「入边数 > 0」。

## 数据结构变更 <!-- serves: FR-2, FR-3, FR-6 -->

```typescript
// src/shared/protocol.ts —— TaskRecord 增三个**加性可选**字段（D-5 / FR-3 / FR-6）
export interface TaskRecord {
  // …既有字段不动…

  /**
   * 取消留痕（REQ-261005193546-1b1a FR-3）。**字段是查询面，`revisions[]` 是历史面**：
   * 本三字段回答「这张卡最近一次取消是谁/何时/为什么」（可被门禁与统计直接读，无需解析）；
   * `revisions[]` 是 append-only 的历史流（重开/重跑/人工改验收都写），回答「这张卡被改过哪些次」。
   * 两者**同源同刻写入、互不替代**。
   *
   * 加性可选：旧分片缺这三个键 = **未采集**，不补齐、不改写、无迁移脚本（FR-6）。
   * 界面**从不渲染**这三个字段（D-7：连「另有 N 张已取消」都不给）；只有台账读取与
   * 归档材料可引用。
   */
  canceledAt?: number                                  // 取消时刻（ms）；与 revisions 里那条的 at 同源
  canceledBy?: { kind: 'human'; sessionId?: string }   // **只写人**：写侧 kind !== 'human' 时**不写该字段**
  cancelReason?: string                                // trim 后非空才写；**不设硬上限**（审计要原文）
}
```

**三字段的写入规则（写侧落点与 helper 命名以 `data-model.md` / `backend.md` 为准）**：

| 字段 | 何时写 | 何时不写 |
|---|---|---|
| `canceledAt` | 每次取消（**批量取消时同批共用一个 `at`**） | —（取消必有时刻） |
| `canceledBy` | 取消者能解析为**人**（`kind === 'human'`，可带 `sessionId`）。**批量取消**（需求级回退 / 误物化清场）取**触发该批动作的人**——回退/清场本身就是人工门动作，触发者可解析 | 取消者**真非人工路径**、解析不出人时 → **整个字段不写**（留作未采集），不写 `kind: 'system'` 这类替身值 |
| `cancelReason` | `reason.trim()` 非空（**批量取消时取该批动作的原因**，如「回退重拆」，不是逐卡理由） | trim 后为空 → 不写；**不设长度硬上限**（若需软上限只做提示、不做拒绝） |

> **批量取消的语义（裁定 ②）**：`canceledBy` = **触发该批动作的人**，`cancelReason` = **该批动作的原因**。因此权威原型 `#FR-3`「每行三个留痕列非空」的锚点**仍然成立**（26 行批量取消的 `canceledBy` 都有人），且不违反「取消 = 人工门」。

**复活（`canceled → todo`）不清空三字段**：`TaskStatus.ts:45` 的 `canceled: ['todo']` 允许复活。复活**不删不清**三字段，语义 = 「**最近一次取消**的留痕」（复活的卡若再次取消，三字段被最新那次覆盖）。历史不丢——每次取消都在 `revisions[]` 里留了一条。**注意**：复活后该卡重新成为**活卡**，于是它立刻回到所有视图与分母里。

**兼容性分析**：

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `TaskRecord` 增三字段 | 记录里没有这三个键 | 新取消的卡带上（按上表规则） | **加性变更、零迁移**：旧记录缺键 = 未采集；读取路径与旧形状不变；不写迁移脚本、不回填、不改写（FR-6） |
| `isLiveTask` 只看 `status` | — | 仍只看 `status` | **判据不依赖三字段**：旧取消卡（无三字段）照样被剔除——这是「旧数据零迁移也能立刻生效」的关键（原型 `#FR-6` 的旧数据形状 `{"status":"canceled","canceledAt":null,…}` 正是这条的标本） |
| `readyTasks` / `computeReady` / V-5 语义变更 | 取消边 = 未满足 | 取消边 = 已满足 | **修缺陷**，非迁数据。落盘 `ready[]` 含义随之变化：存量文件可能「过时」——处置见下行与 §安全与性能（读宽容 / 写严格 / 漏就绪降 warning） |
| `validateQueue.ts` V-5 分档 | 假就绪与漏就绪**同为 issue** | **假就绪仍是 issue**（真写坏）；**漏就绪降为 warning**（可自愈的陈旧派生值） | 校验的目的是拦「写坏」，不是让「派生值陈旧」把存量需求判成没有任务（裁定 ①） |
| 落盘 `layers` 是否按活卡重算 | 按全量节点分层 | **照旧按全量**（B 方案，守零写回） | **不重写存量队列文件**；读路径一律用 `liveLayers`；「落盘 `layer` 仅历史派生值」登记为**已知刻意差异**（INV-5 边界） |
| `validateQueue.ts:245` V-5 假就绪 | 只认 `done` | 与判据同源 | **必须同批改**，否则 `save()` 抛 `QUEUE_VALIDATION_FAILED`（缺陷 1 第 4 条） |
| 归档材料引用 `canceled_count` | 无此计数 | 归档清单可引用（只进归档材料、不进界面） | 无迁移；计数现算，不落新字段 |

## 接口变更 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```typescript
// src/domain/status/Predicates.ts —— 在**既有模块内**（isCanceled 旁）新增，不新建模块
// 该模块既有的层约束：domain 不得 import shared/protocol（layer-boundary 门禁），
// 故只收结构化最小投影、用泛型保类型——与既有 isCanceled(x: HasStatus) 同款。
// HasStatus = { status: string }（既有定义，不动）

/** 唯一的「活卡」判据。全仓只允许这一处出现 status 与 'canceled' 的比较。 */
export function isLiveTask<T extends HasStatus>(task: T): boolean

/** 界面投影与统计分母的唯一入口。 */
export function liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[]

/** 分母 = 活卡数（与 liveTasksOf 同源，堵「过滤用一套、算分母另抄一套」）。 */
export function liveCountOf<T extends HasStatus>(tasks: readonly T[]): number

/** 显示侧分层（= 在 layerInputOf 的输入上跑最长路径）。 */
export function liveLayers<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): ReadonlyMap<string, number>

/** 就绪集合（语义源 = readyTasksOf）。 */
export function liveReadyTasks<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
  byId: ReadonlyMap<string, T>,
): T[]

// ── 依赖侧（D-8）──────────────────────────────────────────────────────────
/** 一条依赖是否已满足：undefined（悬空）| done | canceled = 满足。 */
export function isDependencySatisfied(dep: { status: string } | undefined): boolean

/** 把一张卡的依赖边分三桶；**唯一阻塞桶 = pending**。 */
export function splitDependencyEdges<T extends { id: string; dependsOn?: readonly string[] }>(
  task: T,
  byId: ReadonlyMap<string, T>,
): { satisfied: string[]; pending: string[]; dangling: string[] }

/** 单卡就绪：自身 todo 且 pending 桶为空。 */
export function isReadyTask<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  task: T,
  byId: ReadonlyMap<string, T>,
): boolean

/** 分层输入 ≡「删掉指向取消卡（及不在场节点）的边」后的任务集合。 */
export function layerInputOf<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(
  tasks: readonly T[],
): T[]
```

**改动原因**：现状「过滤逻辑」与「分母算法」是两份可各自漂移的东西（`progressOf`、`buildGateVerdicts`、`QueryState` 都自己过滤又自己数）；依赖判定四处各写一份（缺陷 1）；层号两处各算一次（缺陷 2）。收敛到同一模块后，这三类漂移都没有落脚点。

**影响范围**：纯增函数，不改既有签名。消费点改动是机械替换（`xxx.filter(...)` → `liveTasksOf(xxx)`，或喂入前加一层）。`buildDagNodes` / `syncRTMYamlWithSnapshot` / `handleState` 的**入参形状不变**；`TaskRecord` 只加可选键。

## 取消留痕的写侧与读侧 <!-- serves: FR-3, FR-6 -->

**两面分工（裁定 6）**：

| 面 | 载体 | 回答什么 | 读法 |
|---|---|---|---|
| **查询面** | `canceledAt` / `canceledBy` / `cancelReason` 三字段 | 「这张卡**最近一次取消**是谁/何时/为什么」 | 直接读字段，无需解析；门禁与统计可直接消费 |
| **历史面** | `revisions[]`（append-only，INV-6） | 「这张卡被改过哪些次（含每次取消/复活/重开/改验收）」 | 按时间顺序流式读；自由文本 `reason`，解析成本高且易漂移 |

两者**同源同刻写入**：取消时三字段与 `revisions` 里那条用**同一个 `at` / 同一个 `by` / 同一段 `reason`**。

**写侧**（一次取消 = 一次写入；三处取消点见下）：

```
reqboard_task_move(task_id, to='canceled', reason)     ← MoveTask.ts:163（人工门）
需求级回退（rollback-tasks.ts:63）/ 清场（rollback-cleanup.ts:124）
        |
        v
  ① copy.status       = 'canceled'
  ② copy.canceledAt   = now
  ③ copy.canceledBy   = { kind:'human', sessionId }   ← **仅当取消者解析为人**；否则整字段不写
  ④ copy.cancelReason = reason.trim() 非空才写（不设硬上限）
  ⑤ copy.revisions   += { at: now, by: actor, kind:'rollback', reason,
                          changes: ['status: x→canceled'] }   ← 历史面，行为不变（append-only）
```

**读侧**（三字段全可选，读取路径不许因缺键退化）：

| 情形 | 读到的值 | 界面表现 | 断言 |
|---|---|---|---|
| 新取消（人取消） | 三字段均有值 | **界面无任何表现**（卡不出现在投影里） | 台账三字段非空（验收 C7） |
| 新取消（取消者解析不出人） | `canceledAt` / `cancelReason` 有值，`canceledBy` 缺失 | 同上 | 如实标未采集，**不写 `kind:'system'` 之类的替身值** |
| 旧取消卡（上线前取消） | 三键缺失 = 未采集 | 同上（仍被 `isLiveTask` 剔除，判据只看 `status`） | 读取不报错、不写回（验收 C8） |
| 复活后再取消 | 三字段 = **最近一次**取消 | 复活期间它是活卡、出现在视图；再取消后又消失 | 三字段等于最新那次的 `at`/`by`/`reason` |

**关键纪律**：`isLiveTask` **只看 `status`**，不看三字段。否则旧取消卡（无三字段）会被判成「活卡」重新出现在界面上——本设计最容易写错的一处，写进回归用例。

## 防漂移设计 <!-- serves: FR-1, FR-2, FR-4 -->

**基线事实**（写稿时实测）：`src/` 下 `status` 与 `'canceled'` 的字面量比较共 **54 处、分布在 34 个文件**（口径：`status !==|=== 'canceled'` / `status: 'canceled'` 三种形态，已排除 `tests/`）。**本需求只收编消费点与依赖判定四处**，其余登记为基线。

**四层防线**：

**第 1 层 · 结构防线（编译期）**
消费点不再各自 `filter`；单点模块是唯一导出 `isLiveTask` 的地方。`liveCountOf` / `liveReadyTasks` / `liveLayers` / `layerInputOf` 的存在让「过滤用单点、分母/就绪/层号另抄」这三条常见漂移路径没有产出物。

**第 2 层 · 源码级断言（防「删掉复用改手写」）**

| 档 | 范围 | 规则 | 违反后果 |
|---|---|---|---|
| **A · 硬禁（本需求收编面）** | 消费点清单 ①~④ 的文件 + 依赖判定四处（`queue-access.ts` / `shared/protocol.ts` / `domain/queue/topology.ts` / `domain/queue/validateQueue.ts`） | 出现 `status` 与 `'canceled'` 的字面量比较 → **失败并点名文件 + 行号** | 用例红：即验收 B6「把任一消费点的复用改回手写 filter → 必红」 |
| B · **不强制**（裁定 4） | 其余 54 处余额（写侧/守卫） | **不补注释、不改写法**；只在**新增**手写比较时红 | 「纯注释改 54 处」收益低于噪音成本；守住「**新增手写点即红**」即可 |

- **A 档的基线载体 = 独立清单文件**（裁定 8），按「**文件 + 行原文**」匹配，**不按行号**（抗行号漂移）。
- **FR-4 的断言新建独立用例**（裁定 8），**不要挂进 `tests/layer-boundary.test.ts`**——它当前本就红（见下）。
- **反向（逆验证）**：把 `QueryStageDetail` 基类的 `liveTasksOf(...)` 改回手写 `filter` → A 档必红；把 `readyTasks` / `computeReady` / V-5 改回 `doneIds.has(dep)` → 依赖判定档必红。
- **范围自检（防假绿）**：扫描器必须断言「A 档文件的扫描命中数下限 > 0」——否则路径写错会静默通过（学 `layer-boundary.test.ts` 末尾两条自检）。

> ⚠️ **现场事实（保留告警）**：`tests/layer-boundary.test.ts` 在**本工作树当前是红的**（3 条失败：`application/` 15 处越界 import、`domain/` 2 处 `Date.now()`、`http/routers/` 4 个文件含状态字面量——含 `stages.ts`，它命中的是 `'archived'` 不是 `'canceled'`）。
> 这不属本需求范围，但意味着**新门禁不能假设「仓库是干净的」**：它必须**自带宽窄明确的范围 + 独立清单 + 命中数下限自检**，且**独立成用例**，不与既有红灯耦合。

**第 3 层 · 等值断言（防「两处口径各自漂移但都自洽」）**
即 INV-1 + INV-5 的机器化：构造标本台账（132 张 = 106 活 + 26 取消），
① 跑遍视图面与统计面全部读数，断言读数集合 == `{106}`；
② 逐卡断言 `liveLayers` 结果 == 「删掉指向取消卡的边后重算」；
③ 断言依赖判定四处输出**逐字相等**，且「唯一前置被取消」的活卡出现在 `ready` 里；
④ 断言 `validateQueueFile` 对新语义写盘载荷 `passed === true`（V-5 同源）。
这一层能抓到前两层抓不到的情形：某人新加了一个投影，既没用单点也没写 `canceled` 字面量（例如直接读 `/state` 原始数组）——A/B 两档都不会红，但等值断言会红。

**第 4 层 · 界面口径断言**（INV-2 落地清单）：`includeCanceled` / `showCanceled` 源码命中 0；可见文本与 `data-*` 里 `canceled` / `已取消` 命中 0；`data-dag-statuses` 不含 `canceled` 档。

## 依赖关系 <!-- serves: FR-2, FR-4, FR-6 -->

**新增依赖**：无。

| 依赖项 | 版本 | 用途 | 不引入的后果 |
|---|---|---|---|
| 无 | — | 判据是纯布尔比较 + 数组过滤 + 最长路径分层，零新增运行时依赖 | 若为「活卡」引一个查询构造器/谓词库，是把一句 `!==` 换成一层抽象，违背边界第 5 条 |

**删除依赖**：无。

**既有层约束（本设计逐条对齐过 `tests/layer-boundary.test.ts` 的规则表）**：

| 约束 | 原文 | 对本设计的影响 |
|---|---|---|
| `domain` 不许 import `../shared/**` | 「domain 是最内层：不许碰 I/O、框架、上层模块与 shared」 | 单点只能在**既有** `domain/status/Predicates.ts` 内用泛型收结构化最小投影，不引用 `TaskRecord`——与既有 `isCanceled(x: HasStatus)` 同款 |
| `shared` 不得依赖 `application/adapters/tools/http/client/host` | 「shared 是 host 与 client 共用的契约层」 | `shared/protocol.ts` 的 `readyTasks` **可以** import `domain`（`../domain/` 不在禁止表内）——这是「`readyTasks` 收敛到单点」可行的前提，已核对 |
| `application` 不许 import `client` | 同表 | 单点必须放 `domain`，放 `client/dag/progress-bar.ts` 就只有前端能用 |
| `tools/` 与 `http/` 不得出现任何状态名字面量 | 「状态判断只在 domain」 | `/state` 的收敛必须**调用单点**，不能在 `stages.ts` 里写 `!== 'canceled'`（否则直接撞既有门禁） |

## 安全与性能 <!-- serves: FR-1, FR-4, FR-5 -->

**安全 / 完整性风险**：

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 把「逻辑退出」误实现为物理删除 | 卡片 id 被依赖/子卡链/追溯/评论引用，删数据同时破坏审计线与引用完整性（D-1） | 单点只做**读取侧过滤**，不提供任何删除接口；写路径不因过滤而删除记录 |
| 过滤渗进写路径，导致台账被改写 | 取消卡记录被 `recompute` 顺手清掉 | **过滤只发生在投影与统计的读路径**；写路径照旧收全量卡。回归断言：读取前后全量目录 mtime 逐份不变（验收 C8） |
| **改 `computeReady` 却漏改 V-5 假就绪（`:245`）** | `save()` 抛 `QUEUE_VALIDATION_FAILED`，**一个字节都落不了盘**（写路径被自己的 ready 判据拒掉） | **同批改** `validateQueue.ts:245`；等值断言第 ④ 条锁住「新语义载荷 `passed === true`」 |
| **存量队列文件的 `ready[]` 与新语义不符** | `JsonQueueRepository` 读取路径（`QueueRepository.ts:183` 区）跑 `validateQueueFile`，**失败即「按不可用处理 → 返回 undefined」**；`QueueTaskStore.readQueue` 随之返回 `undefined`、`listByRequirement` 返回 `[]` ⇒ 该需求**任务读作 0 张**（DAG 空、看板计数 0、覆盖度分母 0）。触发形态是 V-5 **漏就绪**（`:253`，旧文件里新解锁的活卡不在 `ready` 中） | **已裁定（A+B 合体）**：① 读取路径**宽容**——校验失败不得让整条队列读成 `undefined`，降级为 **warning + 继续返回队列**；② 读路径的 `ready` **以重算为准**（不读落盘 `ready[]`）；③ **写路径保持严格**（`save` 仍强校验）；④ V-5 分档——**漏就绪降为 warning**（可自愈的陈旧派生值）、**假就绪仍是 issue**（真写坏）。一句话：**校验的目的是拦住「写坏」，不是让「派生值陈旧」把存量需求判成没有任务** |
| 单点被绕过（有人直接读 `/state` 原始数组） | 新消费点天然带 132 口径 | 第 3 层等值断言（INV-1）会红；`/state` 边界收敛后客户端拿不到未过滤数组 |
| `ready` 语义修正带来的调度面变化 | 更多活卡被判「可开工」→ 调度器可能同时投递更多卡 | 这是**修复**（改前被错误卡死）。投递仍受既有并发/席位门约束，不新增并行度。回归断言「`/state` 的 `ready` ⊆ 活卡」 |
| `cancelReason` 泄露会话原文 | 原因里可能带人的原话 | 三字段**只在台账与归档材料可读**，界面从不渲染（D-7）；归档材料是审计面，不是公开展示面 |

**性能影响**：

| 指标 | 改前 | 改后 | 可接受吗 |
|---|---|---|---|
| 单次投影取数 | 各消费点一次 `filter`（O(n)） | 仍是 O(n)，只是收敛到一处 | 可接受 |
| `/state` 出参 | `tasks` 全量 + 逐需求 `readyTasks`（O(R×N)） | 剔卡不增复杂度 | 可接受 |
| 分层（剪边 + 最长路径） | `topoLevels` 递归记忆化 O(V+E) | 同一量级；剪边在建 `byId` 时顺手做掉 | 可接受 |
| RTM 同步 | 喂全量 → 生成器遍历全量 | 入口剔卡后少遍历 26 条 | 略优于改前 |
| 台账读取 | — | **零变化**（读侧不改形状、不加字段读取） | 可接受 |

## 测试策略 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

| 场景 | 输入 | 预期 | 用例编号 |
|---|---|---|---|
| 视图面全投影剔卡 | 标本台账（132 = 106 活 + 26 取消） | 拆分 DAG / 实施 DAG / DAG 节点数组 / 分层列表 / 甘特行 / 追溯行的取消卡条数均为 0，卡数均为 106 | TC-V1 |
| 基类一次收敛 | 对基类 `assemble()` 注入标本 | 任一节点 body 的任务集合都不含取消卡（**不逐 body 断言**，而是断言基类出口） | TC-V2 |
| 视图面逆验证 | 把基类收敛改回手写 filter | 源码级断言用例**必红**（验收 B6） | TC-V1R |
| `/state` 边界收敛 | 同一份含取消卡的台账，`GET /state` | 出参 `tasks` 不含取消卡；`ready[reqId]` ⊆ 活卡；同一响应喂甘特 / DAG 画布 / 卡面，三处卡数 == 106 | TC-A1 |
| 甘特 / 卡面 / DAG 层级同数 | 同上 | `buildGantt` 行数 == `toCard().totalCount` == 分层节点数 == 106（INV-1） | TC-A2 |
| 读路径不读落盘 `ready[]` | 把队列文件的 `ready[]` 手工改成陈旧值 | `/state` 的 `ready` 仍按现算给出正确集合（不受陈旧值影响） | TC-A3 |
| 统计面全分母剔卡 | 同标本 | 覆盖度门分母 = 106；进度/完成度/详情页计数 = 106；`implementation` 门 live 数 = 106 | TC-S1 |
| INV-1 等值断言 | 同标本，收齐全部卡数读数 | 读数集合 == `{106}` | TC-S2 |
| 覆盖度门真值（两段口径） | 上一条需求标本（106 覆盖 / 132 全量） | 第①段（`covers`=0）被拒（0%）；第②段 80.3%（取值 80）压线通过并点名 26 张；改后分母 106 → 100% | TC-S3 |
| **活卡 0 张不拦** | 全部卡已取消的需求提交验收 | 覆盖度门**不执法**（沿用 `total <= 0` 边界），不误拒 | TC-S4 |
| 追溯陈旧快照（已知边界） | 未再触发 RTM 的存量需求 | 读数**允许**停在含取消卡的旧快照（实证 `rtm-implementing.yml:8`=132 / `rtm-accepting.yml:1451`=106）；**不回填不重写**；验收材料写明限定语「对新触发过 RTM 的需求」 | TC-S5 |
| 缺陷 1 四处同源 | 「活卡 x 的唯一前置 y 已取消」标本 | `readyTasksOf` / `readyTasks` / `computeReady` / V-5(`:245`) 四处输出**逐字相等且都含 x** | TC-R1 |
| **V-5 同改（防当场炸）** | 对新语义载荷跑 `validateQueueFile`；再跑一次 `QueueRepository.save` | `passed === true`、无「假就绪」；写盘成功（不抛 `QUEUE_VALIDATION_FAILED`） | TC-R2 |
| **V-5 分档：漏就绪降 warning** | 「`ready[]` 是旧语义」的存量载荷（触发漏就绪，`:253`） | **`passed === true` + 一条 warning**（不再是 issue）；读取路径不判不可用 | TC-R2W |
| **V-5 分档：假就绪仍是 issue** | 「卡未就绪却被标 ready」的载荷（`:245`） | **`passed === false`**；`save` 抛 `QUEUE_VALIDATION_FAILED` | TC-R2E |
| **读路径宽容（存量读得出）** | 「`ready[]` 为旧语义」的存量队列文件 | `listByRequirement` 仍返回 **132 张**（**不是 `[]`**）；读取路径给出 warning；目录 mtime 不变（零写回） | TC-R4 |
| **写路径仍严格** | 真写坏载荷（假就绪） | `save` 抛 `QUEUE_VALIDATION_FAILED`，一个字节不落盘 | TC-R5 |
| 缺陷 1 端到端 | 同上标本，`GET /state` | `ready[reqId]` 含 x；画布给 x 画可开工绿点 | TC-R3 |
| 缺陷 1 逆验证 | 把任一处改回 `=== 'done'` | TC-R1 / TC-R2 / TC-R3 **必红** | TC-R3R |
| 缺陷 2 层号同源 | 同标本 | 逐活卡断言 `liveLayers` == 「删掉指向取消卡的边后重算」（INV-5 显示侧） | TC-L1 |
| 落盘 `layer` 的刻意差异 | 同一份台账 | 落盘 `layer` **允许**与显示层号不等；且落盘 `layer` 不出现在任何显示读数里 | TC-L2 |
| D-8 掉层 | 活卡 x 的 `dependsOn` 只指向一张取消卡 | `lv(x)` == 「把该边删掉后重算」（典型 = 0，第 1 层）；x 的入边集合为空 | TC-D1 |
| D-8 不剪边的反例 | 人为在 `topoLevels` 去掉剪边（保留剔节点） | x 层号变成 1（掉层）→ 该回归用例**必红** | TC-D1R |
| D-8 三桶语义 | `splitDependencyEdges` 对（悬空 / done / canceled / todo）四种依赖 | 分别落 `dangling` / `satisfied` / `satisfied` / `pending`；**唯一阻塞桶 = pending** | TC-D2 |
| D-8 幽灵边出参 | 检查 `StageTaskRef.dependsOn` / `DagGraphNode.dependsOn` | 不含非活卡 id | TC-D3 |
| 关键路径不回归 | 含取消卡的图 | `buildCriticalPath` 结果与改前逐字一致（该处本来就剪边） | TC-D4 |
| 取消留痕写侧（人） | `reqboard_task_move(to='canceled', reason='…')` | 三字段均有值；`revisions` 多一条且**同源同刻**（at/by/reason 相等） | TC-C1 |
| **批量取消语义**（裁定 ②） | 需求级回退 / 清场批量取消 26 张 | 26 行的 `canceledBy` 均 = **触发该批动作的人**（同一 `sessionId`）；`canceledAt` 同批同一值；`cancelReason` = 该批动作的原因（如「回退重拆」）⇒ 原型 `#FR-3`「每行三列非空」锚点通过 | TC-C1B |
| 取消留痕：真非人工路径 | 取消者解析不出人 | `canceledAt` / `cancelReason` 有值，`canceledBy` **整字段不写**（不写 `kind:'system'` 替身） | TC-C2 |
| `cancelReason` 规则 | `reason='   '` / 超长原文 | 空白 → 不写该字段；超长 → **照写不拒绝**（无硬上限） | TC-C3 |
| 复活语义 | `canceled → todo` 再 `→ canceled` | 复活**不清空**三字段；再取消后三字段 = **最近一次**；`revisions` 两次都在 | TC-C4 |
| 查询面 vs 历史面 | 同一张卡 | 三字段 == `revisions` 里最新那条取消的 at/by/reason；`revisions` 保留全部历史 | TC-C5 |
| 旧数据读侧 | 无三字段的旧分片（原型 `#FR-6` 形状） | 读取不报错；三字段 = 未采集；**仍被 `isLiveTask` 剔除**（判据只看 status） | TC-C6 |
| 零写回 | 全量存量需求目录读一遍 | 读取前后 mtime 逐份不变；无迁移脚本、无回填 | TC-C7 |
| 物理数据不消失 | 同标本 | 台账取消卡记录数 = 26；`tasks/<id>.md` × 26 仍在、内容逐字节不变 | TC-K1 |
| **界面口径四条**（INV-2 落地清单） | 全部界面投影与源码 | `includeCanceled` / `showCanceled` 命中 0；可见文本与 `data-*` 里 `canceled` / `已取消` 命中 0；`data-dag-statuses` **不含 `canceled` 档**；三种投影取消卡条数 0 | TC-K2 |
| 写路径收全量 | `QueueTaskStore.recompute` 往返一次 | 落盘 `tasks` 仍含 26 张取消卡（数据不丢） | TC-K3 |
| 源码级断言 A 档 | 收编面注入 `status !== 'canceled'` | 失败并点名文件 + 行原文（独立清单文件匹配、含命中数下限自检） | TC-F1 |
| 源码级断言 B 档不强制 | 其余 54 处保持原写法 | **不报错**（不补注释也通过）；仅在**新增**手写比较时报错 | TC-F2 |
| 既有层边界门禁 | `tests/layer-boundary.test.ts` | **如实记录当前为红**（3 条）；本需求**不新建违规**、**不挂进该文件**、也不假装它已绿 | TC-F3 |
| 类型 | `pnpm typecheck` | 全绿（新函数泛型不影响既有类型） | TC-F4 |

**逆验证清单（人为改坏 → 必红）**：基类 `assemble()` 收敛改回手写 filter、`QueryStageDetail.ts:196`/`:219` 各自手写、`QueryDag.buildDagNodes` 退回全量、`handleState` 去掉 `tasks`/`ready` 收敛、`readyTasks` 退回只认 `done`、`computeReady` 退回只认 `done`、`validateQueue.ts:245` 退回只认 `done`、`validateQueue.ts:253` 从 warning 退回 issue、读取路径把校验失败退回 `return undefined`、`topoLevels` 去掉剪边、`board-mount.ts:563` 去掉过滤、`isLiveTask` 改成「看三字段而不是 status」、界面重新引入 `canceled` 档位、读取落盘 `ready[]`。

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 退出方式 | 物理删除卡片 | **逻辑退出**（只不进视图，数据永在） | 卡片 id 被依赖/子卡链/追溯/评论引用，且是回退事故的第一手证据（D-1） |
| 可见性 | 给「显示已取消」开关 | **彻底不可见**（接口与界面都不返回） | 用户裁定（D-3 / D-7）；开关会让「132 vs 106」的分叉重新长回来 |
| 要不要给计数交代 | 界面上给一行「另有 26 张已取消」 | **连计数都不给**（含**状态档位不带 `canceled` 档**） | 用户裁定（D-7）：显示 `canceled 0` 也是交代 |
| 判据放哪层 | 放 `client/dag/progress-bar.ts`（离用它的地方近） | **放既有 `src/domain/status/Predicates.ts`**（不新建模块） | `application` 禁止 import `client`，统计面也要用同一判据；放 domain 还能被 `shared/protocol.ts` 复用（层门禁核对过） |
| 判据形态 | 一个 `filter` 就够 | **判据 + 计数 + 分层 + 就绪 + 依赖三桶** | 只有 filter 时，分母/就绪/层号会在各处被重算（现状四处 ready、两处层号都是这样） |
| **阶段详情过滤落点** | 逐 body 补（`QueryStageDetail.ts:196`、`:219` 各改一处） | **基类 `assemble()` 一次收敛** | 本次病根就是「某处漏了」；逐 body 补等于把病根留在原地（下次新增节点又会漏） |
| **收敛点选哪** | 逐个消费点补 filter | **API 边界（`/state`）+ 语义单点（domain）** | 甘特 / DAG 画布 / 卡面计数 / 可开工绿点**共吃 `/state`**；收一次，客户端自然一致 |
| D-8 怎么实现 | 只剔节点（最小改动） | **剔节点 + 剪边 + 出参也剪 + 就绪同源 + V-5 同改** | 只剔节点会长幽灵边（掉层）且 ready 口径仍错（开不了工）；漏改 V-5 会当场拒写 |
| ready 语义以谁为准 | 以 `computeReady` 为准（它在写路径） | **以 `readyTasksOf` 为准**（D-8 已正确） | `computeReady` / `readyTasks` / V-5 只认 `done` = 缺陷 |
| 落盘 `layer` 怎么办 | 写路径也按活卡分层（守 INV-5 更彻底） | **B 方案：落盘照旧，读路径用 `liveLayers`** | 写回存量队列文件引入迁移与审计风险，与 FR-6「不回填、零迁移」冲突；落盘 `layer` 登记为**历史派生值** |
| 存量 `ready[]` 怎么办 | 主动重写存量文件；或读路径也严格 | **不重写；读宽容 + 写严格 + 漏就绪降 warning** | 校验的目的是拦住「写坏」，不是让「派生值陈旧」把存量需求判成没有任务（裁定 ①）；`/state` 现算、不读落盘 `ready[]` |
| 取消留痕载体 | 只用 `revisions[]` | **三字段 + `revisions` 并存** | 字段是**查询面**（门禁/统计可直接读），`revisions` 是**历史面**（append-only、自由文本） |
| `canceledBy` 类型 | `ActorRef`（含 agent/system） | **`{ kind: 'human'; sessionId?: string }`**；**批量取消取触发该批动作的人**；真非人工路径不写该字段 | 取消 = 人工门；批量回退/清场本身就是人工门动作，触发者可解析 ⇒ 原型 `#FR-3`「每行三列非空」锚点仍成立（裁定 ②），也不与「取消是人做的决定」矛盾 |
| 复活是否清空三字段 | 复活即清空 | **不清空**，语义 = 「最近一次取消」的留痕 | 历史不丢（`revisions` 逐次留痕）；清空会让「最近一次为什么取消」永久丢失 |
| `cancelReason` 长度 | 设硬上限 | **trim 非空才写、不设硬上限** | 审计要原文；要软上限只做提示、不做拒绝 |
| 活卡 0 张的门 | 0 张也判不通过 | **不拦**（沿用既有 `total <= 0` 边界） | 分母为 0 时无所指；本需求不改计量粒度与既有边界 |
| 存量 RTM 陈旧快照 | 回填/重写快照 | **接受 + 显式声明** | 守零写回；验收口径加限定语「对新触发过 RTM 的需求」 |
| 手写 filter 收编范围 | 全仓 54 处一次收编 | **只收编消费点 + 依赖判定四处**，其余登记基线且**不强制** | 全收编会扩成横切重构；基线守「新增即红」即可 |
| 防漂移怎么守 | 靠 code review 与自觉 | **独立清单文件 + 独立用例 + 等值断言** | 「靠自觉」正是病根（同口径 54 处）；`layer-boundary` 当前本就红，不能挂进去 |

## 边界（本设计不做什么） <!-- serves: FR-1, FR-2, FR-5, FR-6 -->

| 不做 | 越界会破坏什么 |
|---|---|
| **不物理删除任何卡片**（台账记录 + `tasks/<id>.md` 都不删） | 引用完整性 + 回退事故的审计线（D-1） |
| **不做「显示已取消」开关**（也不在状态档位里保留 `canceled` 档） | 重新引入两套口径（D-3 / D-7） |
| **界面不给任何计数交代** | 一个口径（D-7） |
| **不改「取消 = 人工门」这条属性**（agent 仍无权取消） | 权限模型；`TaskStatus.ts` 的 `HUMAN_ONLY_TASK_TRANSITIONS` 不动 |
| **不改现有统计的计量粒度** | 只做「剔除已取消」这一件事 |
| **不改取消卡的历史文档与追溯文件；不回填存量 RTM 快照** | FR-6 的零写回 |
| **不给存量取消卡回填三字段** | 同上（无迁移脚本） |
| **不重写存量队列文件**（落盘 `layer` / `ready[]` 照旧） | 零迁移；代价是登记为**已知刻意差异**（INV-5 边界） |
| **不动 vendored 的 `vendor/reqboard/**`**（只调喂入侧） | 上游片段的漂移门禁 |
| **不重构 RTM 同步链路**（不加新入口、不合并既有调用） | 避免把「剔卡」扩成 RTM 架构改造 |
| **不一次收编全仓 54 处手写比较；不给其余处补注释** | 范围膨胀 + 噪音成本 |
| **不修 `tests/layer-boundary.test.ts` 当前那 3 条失败，也不把新断言挂进去** | 它属既有技术债（越界 import / `Date.now()` / http 状态字面量），与本需求无关 |
| **不在既有四处依赖判定/四处分层之外新写第五份** | 再多一处就是新的漂移源 |

## 遗留问题 <!-- serves: FR-1, FR-2, FR-4, FR-5 -->

> 七条裁定 + 后续两条裁定（①队列校验三段式、②批量取消的 `canceledBy` 取触发者）已落地（见各节的「（裁定 N）」标注）。下表分「已关闭」与「仍然开放」。

**已关闭**

| 原问题 | 裁定 | 落地处 |
|---|---|---|
| 存量队列文件的 `ready[]` 与新语义不符，会让读取路径把整个队列判「不可用」（任务读作 0 张） | **A+B 合体，按「哪条 issue 可自愈」区分**：① 读路径宽容（校验失败降 warning + 继续返回队列）；② 读路径的 `ready` 以重算为准；③ 写路径保持严格（`save` 仍强校验）；④ V-5 分档——**漏就绪降 warning**（可自愈的陈旧派生值）、**假就绪仍是 issue**（真写坏）。一句话：**校验的目的是拦住「写坏」，不是让「派生值陈旧」把存量需求判成没有任务** | §消费点清单① 读路径纪律三段式、§消费点清单⑤ V-5 分档表、§数据结构变更、§安全与性能风险表、TC-R2W / TC-R2E / TC-R4 / TC-R5 |
| 权威原型的台账列写成系统操作者，与「只写人」冲突 | **选 (i)**：批量回退/清场的 `canceledBy` 解析为**触发该次动作的人**（`kind:'human'` + `sessionId`），`cancelReason` = 该批动作的原因（如「回退重拆」）；**真非人工路径仍不写该字段**。原型 `#FR-3`「每行三列非空」锚点**仍然成立** | §数据结构变更 写入规则表的「批量取消的语义」、§取消留痕的写侧与读侧、TC-C1B |

**仍然开放**

| 问题 | 影响 | 建议与何时解决 |
|---|---|---|
| 需求文档「改动位置」表两处与代码不符、且漏多处 | 拆分阶段可能照错行拆卡 | 已按裁定 7 **不回写需求文档**，改为在 §需求文档改动位置表的更正对照 单列对照。请复核该节 |
| 需求文档未点名的漏点（`:219`、甘特、`board.ts` 卡面、`/state` 边界、客户端分层、`QueryReport`/`QueryState`、依赖判定四处） | 未纳入则缺陷仍在 | 已在更正对照节补齐。请确认这些纳入本需求范围，或另立补丁需求 |
| 两个覆盖度标本（80.3%→100% 与 94%）各自保留 | 混算会以为设计自相矛盾 | **已裁定保留、不许为对齐改掉任一**；且 80.3% 那一支已按两段口径精确化（0% 被拒 / 80.3% 压线通过） |
| B 档不强制后，写侧新增手写比较的拦截强度 | 写侧若新增手写比较，只靠「新增即红」这条规则拦（无注释可查理由） | 已按裁定 4 执行（不补注释）。若日后觉得弱，可再议是否引入注释标记 |
| `tests/layer-boundary.test.ts` 当前为红（3 条） | 与本需求无关，但会掩盖「新违规」与「旧违规」的区别 | 已按裁定 8 用**独立清单 + 独立用例**隔离。是否顺带清掉既有 3 条红灯另立项 |
