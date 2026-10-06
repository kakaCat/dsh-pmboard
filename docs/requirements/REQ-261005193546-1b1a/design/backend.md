---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 后端设计（REQ-261005193546-1b1a）

> 后端只做四件事：**一个活卡口径单点**（视图/统计/门禁分母共用）、**两个 RTM 公开入口同时收敛**
> （覆盖度分母剔卡）、**取消留痕写侧**（谁/何时/为什么）、**零迁移兼容**（旧分片不报错、不写回、不追溯）。
> 边界：不物理删卡、不加「显示已取消」开关（D-3）、**也不加口径灰度开关（无开关、一次性口径修正）**、
> 不改「取消 = 人工门」、**不新增任何错误码**、
> **不 bump `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1）**。
>
> **口径来源**：`requirement.md` FR-1~FR-6 与 D-1~D-8；**函数名与类型以本文件为唯一一套**
> （三份设计文档曾各写一套，已按裁定统一，见 §判据与写侧的命名契约）。
> **落点以函数名为准，file:line 只作参考**——设计阶段有并发方在改 `src/**`（近一小时 8 个文件，
> 非本篇作者所为），行号可能漂移；执行时按函数名/语义定位。
> （需求文档「改动位置」表是粗粒度摘要，其中两处判断已在此更正。）
>
> 本篇只写后端；前端渲染口径见 `design/frontend.md`，接口/数据形状见 `design/interfaces.md` 与
> `design/data-model.md`，迁移与回滚见 `design/migration.md`。

## 服务与接口实现 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

### 判据与写侧的命名契约（唯一一套，不新建模块） <!-- serves: FR-1, FR-3, FR-4 -->

| 名字 | 归属 | 语义 |
|---|---|---|
| `isCanceled`（既有，不改） | `src/domain/status/Predicates.ts:75` | 「被取消了」的既有唯一写法 |
| `isLiveTask` | 同上（`isCanceled` 旁） | 「活卡 = 不是 canceled」的**唯一**判据 |
| `liveTasksOf<T>` | 同上 | 活卡取数（`T extends HasStatus` 保类型） |
| `liveCountOf` | 同上 | **分母** = 活卡数（与取数同源，计数器不得自成一套） |
| `liveLayers` | 同上 | **读路径**分层：只对活卡算层号 |
| `liveReadyTasks` | 同上 | **读路径**就绪集 |
| `isDependencySatisfied` | 同上 | 依赖是否已了结（`done` ∨ `canceled`）——依赖侧语义单点 |
| `splitDependencyEdges` | 同上 | 依赖分桶 `{ satisfied, pending, dangling }`；**唯一约束桶 = `pending`** |
| `isReadyTask` | 同上 | 自身 `todo` ∧ 无 `pending` 依赖 |
| `layerInputOf` | 同上 | 分层输入（活卡节点 + 分桶后的边） |
| `markCanceled(task, { at, by, reason? })` | `src/shared/protocol.ts`（`recordStatus:143` 旁） | 取消留痕三字段的**唯一写入口** |

**RTM 两个入口顶部统一**：`const live = liveTasksOf(tasks)`（见 §两个 RTM 公开入口）。
**落点固定为既有 `domain/status/Predicates.ts`，不新建模块**（消费点跨 domain/application/shared/client，
domain 是唯一四层都合法的位置）。

| 编号 | 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 | serves |
|---|---|---|---|---|---|---|---|---|
| S-1 | 函数 | `isLiveTask` / `liveTasksOf<T>` / `liveCountOf` | 活卡判据 + 取数 + 分母（同源三件） | `t ({status})` / `tasks: readonly T[]` | `boolean` / `T[]` / `number` | 全部消费点 | `isCanceled` | FR-2, FR-4 |
| S-2 | 函数 | `isDependencySatisfied` / `splitDependencyEdges` | 依赖已了结的判据 + 分桶（`satisfied`/`pending`/`dangling`） | `dep` / `task, byId` | `boolean` / 三桶 | S-3、S-4、S-5、V-5 | `isCanceled` | FR-1, FR-4 |
| S-3 | 函数 | `isReadyTask` / `liveReadyTasks` | 就绪判定单点 + 读路径就绪集 | `task, byId` / `tasks` | `boolean` / `TaskRecord[]` | S-6、S-7、S-8 | S-2 | FR-1 |
| S-4 | 函数 | `layerInputOf` / `liveLayers` | 分层输入构造 + **读路径**活卡分层 | `tasks` | `string[]`（层序） | S-10 | S-2 | FR-1 |
| S-5 | 函数 | `computeReady`（既有，+S-2/S-3） | **写路径**就绪集（落盘 `ready[]` 的来源） | `tasks: readonly QueueTask[]` | `string[]` | `normalizeQueueFile:60` | S-2, S-3 | FR-1 |
| S-6 | 函数 | `readyTasks`（既有，收敛为 S-3 薄封装） | `/state` 的 `ready` 视图（shared 侧） | `tasks, requirementId` | `TaskRecord[]` | S-9 | S-3 | FR-1, FR-4 |
| S-7 | 函数 | `readyTasksOf`（既有，收敛为 S-3 薄封装） | application 侧就绪取数口 | `tasks: readonly TaskRecord[]` | `TaskRecord[]` | 日志/父卡取数 | S-3 | FR-1, FR-4 |
| S-8 | 函数 | V-5（`validateQueueFile`，**必须同改**） | ready 双向一致性校验（假就绪 + 漏就绪） | `QueueFile` | `issues[]` | `QueueRepository` 读/写两路径 | S-2, S-3, S-5 | FR-1, FR-6 |
| S-9 | 接口 | `handleState`（既有，+S-1/S-3） | 看板首屏：全量下发 `tasks` / `ready` 与卡面计数 | HTTP `GET /state` | 只含活卡的 payload | 看板客户端 | S-1, S-3, 既有计数 helper | FR-1, FR-2, FR-5 |
| S-10 | 函数 | `queryDag`（既有，+S-4） | `GET /requirements/:id/dag`：节点、层号、关键路径 | `deps, { requirementId }` | `DagResponse`（活卡） | DAG 面板 | S-1, S-4 | FR-1, FR-5 |
| S-11 | 服务 | `syncRTMYamlWithSnapshot`（既有，+S-1） | RTM 写盘公开入口之一（看板三条路由直调） | `workspaceRoot, snapshot, tasks, reqId, trigger, payload?` | `RTMTriggerResult \| undefined` | 看板路由 | S-1, `RTMGenerator` | FR-2, FR-4, FR-6 |
| S-12 | 服务 | `syncRTMYaml`（既有，+S-1） | RTM 写盘公开入口之二（15 个用例调用点） | `deps, tasks, reqId, trigger, payload?` | `RTMTriggerResult \| undefined` | 用例 | S-1, S-11 | FR-2, FR-6 |
| S-13 | 函数 | `markCanceled(task, { at, by, reason? })` | 取消留痕三字段的唯一写入口（同一次写盘） | `task, { at, by, reason? }` | `void`（就地改字段） | S-14 与三个直写点 | 无 | FR-3 |
| S-14 | 函数 | `transitionTask`（既有，+S-13） | 任务状态迁移唯一收敛点；`to === 'canceled'` 时调 S-13 | `task, to, { at, actor, reason?, role? }` | `void` | `MoveTask`、工具/路由、自动链 | S-13、`assertTaskTransition` | FR-3 |
| S-15 | 函数 | `coverageGateOf`（既有，**不改**） | 覆盖度门探针 → `GateResult`；`total <= 0` 时不执法 | `stage, result` | `GateResult \| undefined` | 三触发点 | `rtmValidator.checkGate` | FR-2 |

### 两个 RTM 公开入口必须同时收敛（改一处会漏三条路径） <!-- serves: FR-2, FR-4, FR-6 -->

**这不是单入口。** 全仓 `syncRTMYaml` 有 **18 处调用点**（15 个用例调用点 + 3 处看板路由），
而看板三条路径**绕过它、直调 `syncRTMYamlWithSnapshot`**：

| # | 路径 | 位置 | 走的入口 | 只在 `syncRTMYaml` 剔卡会怎样 |
|---|---|---|---|---|
| 1 | 会话语义（三触发点等 15 处） | `SubmitVerification.ts:208` `:363`、`ConfirmArtifact.ts:118` `:189` 等 | `syncRTMYaml` | 生效 |
| 2 | 看板批准计划 | `src/http/routers/requirements.ts:404` | `syncRTMYamlWithSnapshot`（直调） | **漏**（分母仍含取消卡） |
| 3 | 看板确认产物 | `src/http/routers/requirements.ts:464` | `syncRTMYamlWithSnapshot`（直调） | **漏** |
| 4 | 看板任务状态变更 | `src/http/routers/tasks.ts:174` | `syncRTMYamlWithSnapshot`（直调） | **漏** |

**契约定死**：**两个公开入口各自顶部**统一一行，共用同一 helper，且**幂等**：

```ts
// syncRTMYaml        （src/application/internal/rtm-yaml.ts:153）
// syncRTMYamlWithSnapshot（同文件:188）
const live = liveTasksOf(tasks)      // S-1；喂给后续 RTM 投影的只有这一份
```

- 两处接线、一个 helper ⇒ 18 + 3 个调用点全覆盖；入口层之外**不得**再各写一遍 filter（幂等）。
- 断言落在**两个入口函数体**上（源码级）：两处都含 `liveTasksOf(` ⇒ "哪个入口漏接线"一眼可见、可失败。
- 反面教材（本需求成因）：`SubmitVerification` 的**同一个用例**里，`:208` 的探针吃全量任务、
  `:363` 的落盘吃过滤后的任务 ⇒ **门禁读 132、文件写 106**（详见下节）。
- 等价备选（被否）：把过滤下沉到二者共同下游 `ledgerReaderOf(...).tasksOf`（`:114`）也能一处生效，
  但"入口是否接线"在源码上不可见；本裁定选**两条入口显式接线 + 断言两处都在**。

### 覆盖度分母口径与三个触发点（含 `total = 0` 边界） <!-- serves: FR-2 -->

**改前的真实读数（本仓真标本 `REQ-261005105032-3b02`，`queue.json` = 132 卡 = 106 `done` + 26 `canceled`）**：
`task_to_tests` 覆盖 106 张（26 张取消卡 0 测试）。覆盖度门经历过**两段**，不要写成"80.3% 被拒"：

| 段 | 时点 | 读数 | 门禁行为 |
|---|---|---|---|
| ① | 测试文档里还没有 `covers:` 标注 | `0 / 132` = **0%** | **真正被拒的是这一次**（`REQBOARD_TESTING_COVERAGE_GATE`） |
| ② | 补上 `covers:` 标注后 | `106 / 132 = 80.3%` → `rateOf` 取整 **80** | 阈值 80 ⇒ `80 >= 80` **压线通过**；但 `coverage.uncovered` **点名 26 张取消卡**（写进 `rtm-accepting.yml` 的 `coverage.testing.untested[]`） |

**可证伪的风险触发条件（算准了，别写"约几张"）**：分母含取消卡 ⇒ 取消卡到 **27 张**（分母 133）时
`106/133 = 79.7%` 取整仍为 **80**（仍压线通过）；到 **28 张**（分母 134）时 `106/134 = 79.1%` 取整 **79 < 80**
⇒ **再取消 2 张即被拒**。门禁在惩罚"回退"这个正当动作，这正是本需求要撤销的惩罚。
同一用例的两次写盘还给出两个数：探针 `:208` 的分母 132，落盘 `:363` 的分母 106
（盘上现值 `total_tasks: 106 / tested_tasks: 106`）——**门禁在读它自己刚写下的另一份数**。

| 触发点 | 覆盖度维度（分母来自哪） | 改前 | 改后（剔取消卡） | 备注 |
|---|---|---|---|---|
| `submit:verification`（`SubmitVerification.ts:208` 探针 / `:363` 落盘） | 测试覆盖度 = 有测试的卡 / 全部卡（阈值 **80%**） | 106 / 132 = 80（压线通过、点名 26 张） | 106 / 106 = **100%** | 两次写盘同源后不再自相矛盾；`:363` 的手写 filter 收编为单点 |
| `confirm:artifact`（`ConfirmArtifact.ts:189`，`kind=artifact`） | 测试覆盖度（同上） | 分母含 26 取消卡 | 分母 106 | 落章时的 RTM 刷新 |
| `confirm:plan`（`ConfirmArtifact.ts:118` 探针 / `:189`，`kind=plan`） | **实施覆盖度** = 有任务认领的设计章节 / 全部设计章节（阈值 **100%**） | 分母不变（138 章节），分子口径改为「**活卡**认领」 | 标本实测 **138 / 138 不变** | 探针路径 `(targetReq.artifacts ?? []).length > 0` 才执法 |

**`total = 0` 不执法的既有边界保持不动**：S-15（`coverageGateOf:140`）的早退分支
（`result?.ok !== true` / `coverage === undefined` / `coverage.total <= 0` → `undefined`）**一字不改**。
剔卡只会让分母变小、不会制造新的 `total = 0` 形态：全部卡被取消（极端样本）⇒ 分母 0 ⇒ **不执法**
（与"无项可判"同义，不是"100% 通过"）；`confirm:plan` 在"批准计划先于拆分落库"的既有流程里分母恒 0
⇒ 行为逐字节不变（`ConfirmArtifact.ts:113-115` 的既有注释仍成立）。

**剔卡不影响追溯链成色（实测）**：把 26 张取消卡从 `fr_to_tasks` 剔除后，11 条 FR **没有任何一条**
掉成全无覆盖（23 张活卡仍覆盖全部 11 条），实施覆盖度 138/138 不变 ⇒ 这是**分母口径修正**，不是放宽。

### 依赖判定：改前缺陷、V-5 必改、分层口径 <!-- serves: FR-1, FR-4, FR-6 -->

**改前缺陷（同一标本三种答案）**。标本：`t-l`（`todo`）依赖 `t-c`（`canceled`）。本仓实测：

```
readyTasksOf  : [ 't-l' ]      ← application（queue-access.ts:59）判据正确
readyTasks    : []             ← shared/protocol.ts:1817 只认 done ⇒ 活卡被永久卡死
computeReady  : []             ← domain/queue/topology.ts:131 只认 done ⇒ 同上
```

`readyTasks` 供 `GET /state` 的 `ready`（`stages.ts:99`），`computeReady` 供队列文件 `ready[]` 落盘
（`normalizeQueue.ts:60`）⇒ 取消一张前置卡会把下游活卡**永久钉死**，且取消卡已不可见、人查不出原因。

**收敛口径**：S-1/S-2/S-3 为唯一判据；四处判定共用 `isDependencySatisfied`，**悬空依赖策略各自保持**：

| 位置 | 改法 | 明确不改的 |
|---|---|---|
| `domain/queue/topology.ts:131` `computeReady`（写路径） | 判据改 `isReadyTask` / `splitDependencyEdges` | **悬空依赖仍按"未满足"**（保守不放行） |
| `shared/protocol.ts:1817` `readyTasks` | 收敛为 `liveReadyTasks` 的薄封装 | 仍只让 `todo` 卡进 ready |
| `application/use-cases/queue-access.ts:59` `readyTasksOf` | 收敛为 `liveReadyTasks` 的薄封装 | **悬空依赖仍按"已满足"**（`d === undefined → true`） |
| **`src/domain/queue/validateQueue.ts:245` V-5（`validateQueueFile`）** | **必须同改**：`unmet` 判据改 `isDependencySatisfied`（漏就绪侧本来就调 `computeReady`） | V-4（layer 连续性）**不动**；V-4 对取消卡**不豁免** |

> ⚠️ **V-5 不同改会当场炸**（执行者最容易漏的一处）：
> `QueueRepository.save`（`src/repositories/QueueRepository.ts:209`）在落盘**前**跑 `validateQueueFile`，
> 不通过就抛 **`QUEUE_VALIDATION_FAILED`** 且一个字节都不落盘。V-5 的"假就绪"分支按
> `byId.get(dep)?.status !== 'done'`（`:245`）判依赖满足 ⇒ **写路径会被自己新写出的 `ready[]` 拒掉**：
> `computeReady` 说 `t-l` 就绪、V-5 说它"依赖未全部 done" ⇒ 每一次写这张卡所在队列都失败。
> 反向同理：`QueueRepository.load`（`:183`）也跑 V-5，只 warn 后**按不可用处理（返回 `undefined`）**
> ⇒ 读旧文件时"漏就绪"分支会把整个需求的队列读成空（看板空白）。两条后果都列进风险清单
> （见 `design/migration.md` §风险 ④）。

**分层口径（刻意差异，定死）**：

| 项 | 结论 |
|---|---|
| 读路径 | 一律用 `liveLayers`（= `layerInputOf(活卡)` 后分层）：取消卡不参与、**来自取消卡的边不算数** ⇒ 活卡层号 = "删掉指向取消卡的边后重算"（FR-1 判据 A2） |
| 写路径落盘 `layers` / `tasks[].layer` | **照旧**（`computeLayers` 判据不改、不重算、不重写存量） |
| 登记为**刻意差异** | 落盘 `layer` **仅历史派生值**，任何读方不得把它当口径；它与 `liveLayers` 可能不一致（实测：活卡 `t-l` 落盘 layer 2，`liveLayers` 为 1） |
| 存量 `ready[]` | **不重写**；但**读路径不得读落盘 `ready[]`**（一律 `liveReadyTasks`）；V-5 的读侧后果见上 |
| V-4 | 对取消卡**不豁免**（与"落盘 layers 照旧"配套：校验基准不变） |

### 向界面/统计下发任务的全部出口（一处改、客户端全一致） <!-- serves: FR-1, FR-2, FR-5 -->

HTTP 主出口是 `handleState`（`src/http/routers/stages.ts:87`）：**全量下发 `tasks`（`:95`）与 `ready`（`:99`）**，
甘特 / DAG 画布 / 卡面计数 / 详情投影都吃这一份 ⇒ 出口收敛点定在 **API 边界**：

| 出口 | 位置 | 现状 | 改法 |
|---|---|---|---|
| 看板首屏任务清单 + ready | `stages.ts:95` `:99` | 下发全量（含取消卡） | `liveTasksOf` 后下发；`ready` 用 `liveReadyTasks`（不读落盘 `ready[]`） |
| 需求摘要计数 | `stages.ts:226-239` | `tasksTotal: tasks.length`、`percentage: done/tasks.length` 含取消卡 | `tasksTotal = liveCountOf(...)`；`done`/`active` 用既有 helper（已剔取消，不动） |
| 会话流程面板进度 + 任务行 | `stages.ts:285-341` | `progress.total/byStatus/tasks` 含取消卡 | 同上；`byStatus.canceled` 恒 0（**不新增**「另有 N 张」文案，D-7） |
| 节点详情 / 总览装配 | `stages.ts:378` `:403` | 传入全量 | 传入活卡（装配器仍同步、不碰 IO） |
| DAG 面板 | `QueryDag.ts:234`（`buildDagNodes`）+ `:204`（`layerIndexOf`） | **漏过滤**；层号回读落盘 `layer` | 传入活卡；层号改 `liveLayers` **现算**（不回读落盘值） |
| 阶段详情（DAG 层级） | `QueryStageDetail.ts:196`（拆分）/ `:219`（实施） | **漏过滤**（用户看到 132 张的地方） | 复用单点 |
| 文档面板 | `QueryDocs.ts:597` | 手写 filter（已过滤） | 收编单点 |
| 报告页 | `QueryReport.ts:402` | 手写 filter（已过滤） | 收编单点 |
| 会话进度投影 | `QueryState.ts:108` `:136` | 手写 filter ×2（已过滤） | 收编单点 |
| 验收单投影 | `internal/sheet-tasks.ts:37` | 手写 filter（已过滤） | 收编单点 |
| 验收文档渲染 | `internal/verification-doc-writer.ts:53` | 手写 filter（已过滤） | 收编单点 |
| 追溯投影 | `internal/content-trace.ts:357` | 手写 filter（已过滤） | 收编单点 |
| 回填引用 | `internal/backfill-task-refs.ts:89` | 手写 filter（已过滤） | 收编单点 |
| 验收用例内部 4 处 | `SubmitVerification.ts:139` `:176` `:293` `:333` | 手写 filter ×4（已过滤） | 收编单点（`:333` 正是落盘 106 的由来） |
| RTM 全部投影 | `rtm-yaml.ts` 两个公开入口 | **漏过滤** | 入口顶部 `liveTasksOf`（S-11/S-12） |

> `data-dag-statuses`（前端属性，`src/client/views/panels/dag.ts:213`）**不含 `canceled` 档**——
> 显示「canceled 0」也是交代，D-7 禁止。后端不产出该属性，此条由 `design/frontend.md` 与
> `design/test-cases.md` TC-11 守；后端只需保证出口不把取消卡递出去。

### 取消留痕写侧：字段、落点、原子性与人工门不变式 <!-- serves: FR-3 -->

| 项 | 结论 |
|---|---|
| 字段（固定） | `canceledAt?: number`（epoch ms，**与该次 `statusHistory.at` 同值**）、`canceledBy?: { kind: 'human'; sessionId?: string }`、`cancelReason?: string` |
| `cancelReason` 写法 | **`trim()` 后非空才写**；**不设硬上限** |
| `canceledBy` 写法 | 类型**收窄为 `kind: 'human'`**；`by.kind !== 'human'` 时**不写**该字段（留痕只记人；自动/系统路径不冒充"人取消"） |
| 写入落点 | S-13 `markCanceled(task, { at, by, reason? })`（`shared/protocol.ts`，`recordStatus:143` 旁）；**唯一写入口** |
| 调用点①（主） | `internal/task-transition.ts:31` `transitionTask`：`to === 'canceled'` 时调 S-13（`at`/`by`/`reason` 取自 `opts`） |
| 调用点②③④（直写点） | `internal/rollback-tasks.ts:49`（需求回退批量取消）、`internal/stale-rework.ts:59`（占位卡清理）、`internal/rollback-cleanup.ts:124`（幂等再清一次）——四处共用 S-13 |
| ②③④ 的 `by` / `reason` 语义（已裁定） | `canceledBy` = **解析为触发该次回退的人**（`kind: 'human'` + `sessionId`）；`cancelReason` = **该批动作的原因**（回退理由 / 占位卡清理理由，整批同一条）。真非人工路径（触发者 `kind !== 'human'`）**仍不写** `canceledBy`（同一规则） |
| 原子性 | 三字段与 `status` 在**同一对象、同一次 `mutateQueue` 写事务**内落盘；无第二次写、无补偿逻辑 ⇒ 半迁移态不可能出现 |
| 与 `statusHistory` 的关系 | 事件流照旧由 `recordStatus` 写；三字段是**可投影的台账字段**，与事件**同源**（同一次调用的 `at`/`by`/`reason`），不允许任一处另取值 |
| 人工门属性 | **不变**：`HUMAN_ONLY_TASK_TRANSITIONS`（`domain/task/TaskStatus.ts:129`，6 条 `*>canceled`）与 `assertTaskTransition` 一字不改 ⇒ agent 仍无权取消（`human_gate`） |
| 复活（`canceled → todo`） | 三字段**保留**（审计事实："曾经取消过，谁/何时/为何"）；当前态一律看 `status` |
| 存量卡 | 缺三字段 = **未采集**（读取不报错、不补齐、不改写、无迁移脚本） |

## 数据流 <!-- serves: FR-1, FR-2, FR-3, FR-5, FR-6 -->

### 流程 1：一次 RTM 同步（分母收敛点） <!-- serves: FR-2, FR-4, FR-6 -->

```
事件：任一触发点（15 个用例调用点 / 看板三条路由）
  ↓
步骤 1：入口二选一
  ├─ syncRTMYaml：取工作区根 + 台账摘要页 + assertWritableRequirementProject（失败只告警，增强层纪律不变）
  └─ syncRTMYamlWithSnapshot：看板路由直调
  ↓
步骤 2：两处入口顶部各一行 `const live = liveTasksOf(tasks)`（S-1；同一 helper、幂等）
  ↓
步骤 3：ledgerReaderOf(snapshot, live).tasksOf(reqId)（:114）→ map(toTaskLike)（字段不动）
  ↓
步骤 4：runRTMTrigger(generator, trigger, reqId, payload)（:208）
  ├─ 分母 = 活卡（computeTestingCoverage 的 tasks 已是活卡）
  └─ 生成器仍以**台账**为事实源：过滤只发生在"投影给生成器"这一步，不改台账
  ↓
步骤 5：写 rtm-*.yml + 失败只记 warning（既有，逐字不变）
  ↓
步骤 6：门禁读数 coverageGateOf(stage, result)（S-15）
  └─ total <= 0 → undefined（不执法，边界保持）；否则 rtmValidator.checkGate
【副作用】：RTM YAML（派生文件，可失败、只告警）；台账/队列**零写入**
```

### 流程 2：取消一张卡（留痕写侧） <!-- serves: FR-3 -->

```
事件：人（看板/弹框）或回退流程发起取消
  ↓
步骤 1：assertTaskTransition(from,'canceled',actor,role) —— 人工门（agent 一律 human_gate，不变）
  ↓
步骤 2：transitionTask(task,'canceled',{at,actor,reason,role})
  ├─ task.status = 'canceled'（既有）
  ├─ recordStatus(...)（既有：statusHistory 追加一条，at 与三字段同值）
  └─ markCanceled(task, { at, by: actor, reason })（新增；actor.kind !== 'human' → 不写 canceledBy）
  ↓
步骤 3：同一 mutateQueue 事务落盘（三字段与状态同一次写）
  ↓
步骤 4（回退路径）：planRollbackTasks / cancelStaleReworkCards / rollbackCleanup 三个直写点
  └─ 同样在写 status 的那一行调 markCanceled（同事务、同对象）
【副作用】：queue.json 一次写；无第二次写、无补偿
```

### 流程 3：看板首屏下发（视图收敛点） <!-- serves: FR-1, FR-2, FR-5 -->

```
事件：GET /state
  ↓
步骤 1：taskStore.listAll()（含取消卡；读路径不写回）
  ↓
步骤 2：liveTasksOf(tasks)（S-1）—— 唯一的剔卡点
  ├─ tasks  ↦ 只含活卡（FR-5：界面投影里取消卡条数 = 0）
  ├─ ready  ↦ liveReadyTasks(活卡)（**不读落盘 ready[]**）
  └─ 计数   ↦ tasksTotal = liveCountOf(...)；done/active 用既有 helper（已剔取消）
  ↓
步骤 3：需求明细 / 会话面板 / DAG 面板各自出口同样先过单点
  ↓
步骤 4：客户端全量消费同一份 payload ⇒ 客户端不另写过滤（前端篇同源引用判据）
【副作用】：无（纯读）
```

### 流程 4：依赖与分层（写路径 / 读路径同源判据） <!-- serves: FR-1 -->

```
输入：同一需求的 QueueTask[]（含取消卡）
  ↓
splitDependencyEdges（S-2）：把每条依赖分桶
  ├─ satisfied（done ∨ canceled）  ← 不阻塞
  ├─ pending  （存在且未了结）      ← **唯一约束桶**：只有它挡就绪
  └─ dangling （指向不存在的卡）    ← 由 V-3 负责检出，不在此报错
  ↓
写路径：computeReady（S-5）→ normalizeQueueFile:60 → 落盘 ready[]
         ↓ 立刻被 V-5 校验（S-8）——**判据必须同改，否则 QUEUE_VALIDATION_FAILED**
读路径：liveReadyTasks（S-3）/ liveLayers（S-4）——不读落盘 ready[] / layer
  ↓
层号：liveLayers = layerInputOf(活卡) 分层（取消卡不参与、来自取消卡的边不算数）
【副作用】：写路径下次事务重算 queue.json 的 ready[]（派生字段）；落盘 layers/layer **照旧**
```

## 关键逻辑 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

### 覆盖度分母：剔的只有取消，剔的只有两行入口 <!-- serves: FR-2 -->

| 项 | 口径 |
|---|---|
| 剔谁 | **只剔 `canceled`**。`todo` / `in_progress` / `integrating` / `testing` / `in_review` **一律留在分母**（真未完成的证据） |
| 剔几处 | **两个公开入口各一行**（S-11/S-12 顶部），其余 18 + 3 个调用点零改动 |
| 分母形状 | `computeTestingCoverage` 的 `total = liveCountOf(...)`；`calculateImplementationCoverage` 的分子只认活卡认领 |
| 不执法边界 | `coverageGateOf` 的 `total <= 0 → undefined` **不动**（全取消 = 无项可判，不是通过） |
| 反向核对 | 标本：改后 `106/106 = 100%`；改前 `106/132 = 80`（压线通过、点名 26 张）——两个数都在同一份真标本上可复算 |

### 防漂移：单点归属、导出面与源码级断言 <!-- serves: FR-4 -->

**模块归属（定名）**：`src/domain/status/Predicates.ts`（`isCanceled:75` 旁，**不新建模块**）。
理由：消费点横跨 domain（`topology`/`validateQueue`）、application（query/use-cases）、shared（`readyTasks`）
三层，client 也能 import domain ⇒ domain 是唯一"一处定义、各层都用"的位置（layer-boundary 只禁 domain→上层）。

**导出面（只有 §命名契约 那一套名字，不另造别名）**，泛型保类型：
`liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[]`（不得退化为 `string[]`/`unknown[]`）。

**「消费点不得自写 filter」的源码级断言**——**新建独立用例** `tests/live-tasks-single-source.test.ts`
（既有 `tests/layer-boundary.test.ts` **当前本就红**，不作门禁依据；新用例自包含、不依赖它）：

| # | 断言 | 反例（必红） |
|---|---|---|
| 1 | `isLiveTask` 对 7 个 `TaskStatus` 逐一取值：仅 `canceled` 为 `false`（遍历 `TASK_STATUS_ORDER`，将来新增状态自动进判据） | 写成白名单 `['done','todo']` |
| 2 | 对**断言域文件清单**（下表）逐个读源码：**(a)** 不含正则 `/status\s*(?:!==|===)\s*['"]canceled['"]/`；**(b)** 含 `isLiveTask(` / `liveTasksOf(` / `liveCountOf(` | 把任一消费点的复用改回手写 filter |
| 3 | `liveCountOf(tasks) === liveTasksOf(tasks).length`（计数器不得自成一套） | 计数器另写一份判定 |
| 4 | **两个 RTM 入口函数体**都含 `liveTasksOf(`（S-11 与 S-12），且三处就绪实现都含 `isDependencySatisfied(` / `isReadyTask(` | 只给一个入口接线 / 某处退回 `=== 'done'` |
| 5 | V-5（`validateQueue.ts`）含 `isDependencySatisfied(`（防"忘了同改"）；且**「漏就绪」（`:253`）按 warning 上报、「假就绪」（`:247`/`:249`）按 issue 上报** | 只改 `computeReady` 忘了 V-5 / 把两类混成一个级别 |
| 6 | 读路径：校验失败**不得**让 `JsonQueueRepository.load` 返回 `undefined`（用"陈旧 `ready[]` + `todo` 卡依赖已取消卡"的标本跑 `load`，断言非 `undefined`） | 沿用"校验失败 ⇒ 按不可用处理" |

**断言域文件清单**（= 本需求消费点，逐条对应 §出口清单；新增消费点必须进清单）：

```
src/application/internal/rtm-yaml.ts          src/application/internal/sheet-tasks.ts
src/application/internal/content-trace.ts     src/application/internal/verification-doc-writer.ts
src/application/internal/backfill-task-refs.ts
src/application/query/QueryDag.ts             src/application/query/QueryDocs.ts
src/application/query/QueryReport.ts          src/application/query/QueryState.ts
src/application/query/QueryStageDetail.ts
src/application/use-cases/SubmitVerification.ts
src/http/routers/stages.ts
```

**豁免清单（语义不同，明确不收编、也不进断言域）**：`advance-select.ts` / `queue-access.ts`（"这张卡还要不要动"）·
`rollback-tasks.ts` / `rollback-cleanup.ts` / `stale-rework.ts` / `rework-update.ts`（"清理与回退的处置对象"）·
`Decompose.ts` / `AdvanceChain.ts` / `ExecuteTask.ts` / `SubtaskTeamRun.ts` / `support.ts` /
`subtask-evidence.ts` / `task-completeness.ts` / `content-gate-wiring.ts`（守卫式"已取消就跳过"）。
全仓实测共 **54 处** `status …'canceled'` 落在 34 个文件——**本次只收编断言域内的**，其余登记为基线；
新增消费点进清单（进清单即受断言 2 约束）。

### 取消留痕的原子性、覆盖语义与人工门不变式 <!-- serves: FR-3 -->

- **同一次写**：`markCanceled` 不做独立落盘、不排队、不发事件；只改内存对象字段，由调用方所在
  的 `mutateQueue` 事务落盘。
- **覆盖语义（定死：覆盖式）**：三字段回答「**最近一次**取消」，与 `updatedAt`/`updatedBy` 同族（不追加）。
  **如实声明：首次取消不可追**（第二次取消会覆盖第一次的 `at`/`by`/`reason`）；"首次/全部取消历史"
  一律以 `statusHistory` 为准。二者同源写入，不冲突。
- **不写 `canceledBy` 的情形**：`by.kind !== 'human'`（自动/系统路径）⇒ 只写 `canceledAt`（+ 有理由时
  `cancelReason`），**留空 `canceledBy`**——不允许系统路径冒名成"人取消"。
- **人工门不变式**：`HUMAN_ONLY_TASK_TRANSITIONS` 的 6 条 `*>canceled` 与 `canceled>todo` **逐字不动**；
  `assertTaskTransition` 的 `human_gate` 分支不动；`SYSTEM_TASK_TRANSITIONS`（只含
  `todo>in_progress` / `in_progress>todo`）不动。
- **不追溯**：存量已取消卡**不**回填三字段（`canceledAt === undefined` 即"未采集"）；读取不得据此报错或写回。

## 兼容与零迁移 <!-- serves: FR-3, FR-5, FR-6 -->

| 面 | 事实 | 机制 |
|---|---|---|
| 队列分片 `queue.json`（`TaskRecord`） | 旧分片缺三字段 | 三字段**全可选**；无运行时形状校验强制其存在；读路径 `QueueTaskStore.readQueue:104` → `repo.load` → 原样缓存，**不补字段、不写盘** |
| **队列校验（V-1~V-6）** | **读/写两路径都跑** `validateQueueFile`（`JsonQueueRepository.load:183` / `save:209`） | **A+B 合体裁定**：① 读侧**不得**因校验失败把整条队列读成 `undefined`（否则 `listByRequirement` 摊成 `[]` ⇒ 存量需求任务读作 0 张、看板空白）——降级为 warning + **继续返回队列**，`ready` 一律以**内存重算**为准（不读落盘值、一个字节不写）；② 写侧 `save` **仍强校验**（假就绪照旧拦死）；③ **「漏就绪」（`:253`）从 issue 降为 warning**（可自愈的陈旧派生值），**「假就绪」（`:247`/`:249`）仍是 issue**（真问题）。V-5 判据本身**必须与 `computeReady` 同批改**（S-8） |
| 台账 `.dsh-data/dsh-reqboard.json` | **不动 schema** | `REQBOARD_SCHEMA_VERSION` 保持 **9**；`QUEUE_VERSION` 保持 **1**（不改常量、不加迁移分支） |
| 台账视图（RTM 的 `ledgerReaderOf.requirement`） | 取消卡**仍在台账**（FR-5：台账不消失） | 只过滤任务投影，`requirement()` 不动 ⇒ 归档材料仍可引用计数 |
| 旧 RTM 追溯文件 | **不删、不改写** | 改动只影响"下一次触发"的生成结果；不提供清理/回填脚本 |
| **存量需求永不触发 RTM**（**已知边界，如实声明**） | 追溯读数可能**仍含取消卡** | 实证：标本 `rtm-accepting.yml` = 106（**陈旧**，且与 `rtm-decomposing.yml` = 132 不一致）；只有再次触发（任一触发点）才按新口径重写 |
| 已归档/已终态需求 | **不追溯** | 只在自然触发时按新口径投影；不遍历历史需求重算 |
| 队列派生字段 `ready[]` | **不重写存量**；下次写事务按新口径重算（自然归一） | **读路径不得读落盘 `ready[]`**（一律 `liveReadyTasks`）；读侧的陈旧值处置 = **`load` 内存重算、不写盘**，`save` 仍强校验（已裁定，见 §风险 ④ 对策 2） |
| 队列派生字段 `layers` / `tasks[].layer` | **照旧**（`computeLayers` 判据不改、不重算） | 登记为**刻意差异**：落盘 `layer` 仅历史派生值；读路径一律 `liveLayers` |
| 由"重算"带来的可见变化（如实声明） | 下次写事务后 `ready[]` 可能**变大**（取消卡不再卡死下游） | 正是 FR-1 / D-8 的预期结果；`queue.json` 是派生视图载体，不是审计档案 |

**零迁移结论**：**无迁移脚本**（逐条理由见 `design/migration.md` §迁移步骤）。

## 可观测性 <!-- serves: FR-2, FR-3 -->

| 项 | 建议 | 状态 |
|---|---|---|
| 取消时写**需求评论** | **刻意不写**：`statusHistory` 已记 `by`/`reason`，三字段已成可直读的台账字段 ⇒ 再加评论是同一事实的**第三份副本**，只增加漂移面 | **已裁定：刻意不写** |
| 取消时写**任务评论** | 同一理由（避免第三副本）；既有 `t.comments` 通道仍在（`failure-handling.ts:85` 先例），本需求**不新增**写入 | **同判：不新增** |
| 新增日志 | **不新增**；取消的既有通道（`console.warn` + `.dsh-data/state/rtm-failures.json`）不变 | 定稿 |
| 分母口径变化的可观测 | 门禁文案已含 `covered/total`（`rtmValidator.checkGate`）⇒ 分母由 132 变 106 **天然可见** | 定稿 |
| 取消卡计数 | 界面**不出现任何计数交代**（D-7）；`byStatus.canceled` 恒 0，不新增「另有 N 张」字段 | 定稿（前端篇不渲染） |

## 错误处理 <!-- serves: FR-1, FR-2, FR-3, FR-6 -->

**本需求不新增任何错误码**（不加门、不加拒绝分支）⇒ `src/http/envelope.ts` 的 `STATUS_BY_CODE` **零改动**。

| 既有错误码 | 语义变化 | 触发条件 | 用户提示 | 恢复路径 | 降级 |
|---|---|---|---|---|---|
| `REQBOARD_TESTING_COVERAGE_GATE` | **分母口径修正**（含取消卡 → 只含活卡） | `submit:verification` 的测试覆盖度 < 80% | 既有文案（含 `covered/total` 与缺口卡 id） | 补测试用例标注 `covers: t-xxx` | 不降级（`total = 0` 时不执法，既有边界） |
| `REQBOARD_IMPLEMENTATION_COVERAGE_GATE` | 分子改为"活卡认领"（分母仍为设计章节） | `confirm:plan` 的实施覆盖度 < 100% | 既有文案 | 为缺口设计章节补落库任务 | 不降级（`total = 0` 时不执法） |
| **`QUEUE_VALIDATION_FAILED`** | **不新增码；读/写两路径按"哪条 issue 可自愈"区分**（详见下） | **写**：V-5 判据与写路径不一致（"改了 `computeReady` 忘了 V-5"）；**读**：落盘 `ready[]` 陈旧 | 既有文案（前 5 条 issue） | **V-5 与 `computeReady` 同批改**（S-8） | **写：不降级**（强校验、拒绝落盘）；**读：降级为 warning + 继续返回队列**（不再整条判不可用），`ready` 以**内存重算**为准 |
| `human_gate` | **不变** | agent 尝试 `*>canceled` | 「该任务转移为人工闸门，仅人可操作」 | 由人在看板/弹框取消 | 不降级 |
| RTM 生成/取数失败 | **不变** | RTM 失败 | 只 `console.warn` + `rtm-failures.json` | 下一次触发重试 | 增强层失败**绝不**打断主流程 |

**V-5 的 issue / warning 分层（已裁定，定死）**：

| V-5 分支 | 位置 | 级别 | 为什么 |
|---|---|---|---|
| **假就绪**（ready 里的卡依赖未了结 / 自身非 todo） | `validateQueue.ts:247` `:249` | **仍是 issue** | 真问题：写坏了的派生值，必须拦住写（`save` 拒绝落盘） |
| **漏就绪**（依赖已了结且自身 todo，却不在 ready 中） | `validateQueue.ts:253` | **降为 warning** | 可自愈的**陈旧派生值**（存量 `ready[]` 按旧口径写的）；把"陈旧"判成"文件不可用"会把存量只读需求读成 0 张任务 |

**降级原则（本需求唯一被改动的边界，如实声明）**：RTM 是增强层（取数/生成失败只告警）；
台账与队列是事实源（**写失败必须响亮**）。
本次把**读路径**的处置从"校验失败 ⇒ 整条判不可用（返回 `undefined`）"改为
**"warning + 继续返回队列，`ready` 以内存重算为准（不写盘）"**——理由是
**校验的目的是拦住"写坏"，不是让"派生值陈旧"把存量需求判成没有任务**。
两个不动的既有分支：JSON 解析失败仍走既有隔离路径（改名挪走 + 返回 `undefined`）；
`save` 仍强校验。

**炸点留档（`JsonQueueRepository` 读取路径）**：`src/repositories/QueueRepository.ts:183`（`load`）里
校验失败原本只 `onWarn` 然后 `return undefined`；上层 `QueueTaskStore.listByRequirement` 把 `undefined`
摊成 `[]` ⇒ **存量需求的任务读作 0 张、看板空白**，且只有一条 warn。本次裁定正是为消除这条：
**读路径不得因校验失败把整条队列读成 `undefined`**。

## 数据库设计 <!-- serves: FR-1, FR-3, FR-6 -->

**结论：无新表、无版本常量变更、无迁移脚本；队列记录为加性可选字段。**

| 项 | 结论 |
|---|---|
| 新增表 / 表结构变更 | 无（台账仍为 JSON 分片，`REQBOARD_SCHEMA_VERSION` = **9**；`QUEUE_VERSION` = **1**） |
| `TaskRecord`（`shared/protocol.ts:1525`）新增 | `canceledAt?: number`（epoch ms，与该次 `statusHistory.at` 同值）、`canceledBy?: { kind: 'human'; sessionId?: string }`、`cancelReason?: string`（`trim()` 后非空才写，不设硬上限） |
| 变更性质 | **加性（additive）、零迁移**：旧记录缺键 = **未采集**；不补齐、不改写、无迁移脚本；**不 bump 版本常量** |
| 索引 / 约束 | 无新增；「取消是人工门」是**代码级**约束（`HUMAN_ONLY_TASK_TRANSITIONS`），不进数据约束 |
| RTM YAML（派生文档型数据） | 形状**不变**（不加节、不加字段）：`task_coverage[]` / `inputs.tasks[]` / `traceability.*` 只是**内容变少** ⇒ 旧读取器零适配 |
| `queue.json` | 文件版本与形状不变；`ready[]` 值随写事务按新口径刷新（存量不重写）、`layers`/`layer` 照旧（历史派生值） |
| 幂等 | `markCanceled` 覆盖式写入（同事务、同对象）；既有 `registerArtifact` 等幂等语义不受影响 |

## 性能考量 <!-- serves: FR-2, FR-4 -->

| 指标 | 目标 | 测算依据 | 瓶颈分析 | 优化方案 |
|---|---|---|---|---|
| 单次剔卡 | O(n) 一次遍历 | `liveTasksOf` 是 `Array.filter`；标本 n = 132 | 无热点 | 不缓存（缓存引入失效逻辑，得不偿失） |
| RTM 同步 | **与改前同量级** | 过滤在投影前，生成器写入次数/文件数不变 | 仍是 7 份 YAML 写盘 | 不改触发频率 |
| `GET /state` | **与改前同量级** | `listAll()` 读取量与排序不变，只多一次 filter | 大目录扫盘（既有） | 不新增 IO |
| `liveLayers` 现算 | 单需求 O(V+E) 一次 | 既有 `computeLayers` 纯函数；单需求任务量 ≪ 全仓 | 读落盘 layer 可省这一次计算 | **仍选现算**：省下的计算换不来"与写路径同源"，且取消卡已不在输入里、V 更小 |
| 新增运行时依赖 | **零** | 纯函数 + 既有模块 | — | — |

## 安全设计 <!-- serves: FR-3, FR-5 -->

| 面 | 规则 | 理由 |
|---|---|---|
| 权限面 | **不新增端点、不新增权限面、不改鉴权** | 全是既有端点的读数口径修正 |
| 人工门 | agent 仍无权取消（`human_gate` 不变）；`by.kind !== 'human'` 时**不写** `canceledBy` | 留痕不得把自动路径写成"人取消"（审计真实性） |
| 写路径 | 三字段只由 `markCanceled` 写，且只在该卡**自身**的写事务内 | 防跨卡/跨需求越权写 |
| 读路径 | 只读、不写回（`QueueTaskStore.loadInto:303` 只 `load` + 缓存） | FR-6：读取前后目录逐字节一致 |
| 数据保留 | **不删任何卡、不删任何 RTM 文件**；取消卡在台账与磁盘上都在 | FR-5：审计与回退事故的第一手证据必须留 |
| 敏感信息 | 三字段只存 `{ kind: 'human', sessionId? }` 与自由文本原因 | 不采集新个人信息；`sessionId` 是既有审计字段 |
| 注入面 | 不新增提示词/模板渲染；`cancelReason` 只落台账（若加评论也只落评论） | 防"用户可控文本进系统提示词" |

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-6 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| RTM 剔卡落点 | 在 18 个调用点各过滤一次 / 只改 `syncRTMYaml` | **两个公开入口顶部各一行（同一 helper、幂等）** | 看板三条路由**绕过** `syncRTMYaml` 直调 `syncRTMYamlWithSnapshot` ⇒ 只改一处会漏三条路径，正是"界面 106 / 统计 132"的成因 |
| 等价备选 | 下沉到共同下游 `ledgerReaderOf().tasksOf` | 未采用（登记备选） | 一处生效但"入口是否接线"源码不可见；两入口显式接线 + 断言两处都在，可失败、可评审 |
| 活卡单点归属 | 新建 `application/internal/live-tasks.ts` | **既有 `domain/status/Predicates.ts`（`isCanceled` 旁）** | 消费点跨 domain/application/shared/client；domain 是唯一四层都合法的位置；三份文档曾各写一套，故**名字统一、不新建模块** |
| 层号从哪来 | 沿用落盘 `queue.json` 的 `layer` | **读路径 `liveLayers` 现算** | 落盘值要等下一次写事务才刷新；且已裁定落盘 `layer` 仅历史派生值（**刻意差异**） |
| 落盘 `layers` | 同步改成活卡口径 | **照旧**（`computeLayers` 判据不改） | 减少改动面；读路径不依赖它；V-4 校验基准不变（V-4 对取消卡不豁免） |
| `ready[]` | 重写存量 ready | **不重写；读路径不读落盘值** | 避免"读一次写一次"的隐式写回（FR-6）；正确性由 `liveReadyTasks` 保证 |
| 依赖判定 | 只修一处 / 只修 `readyTasksOf`（它本来就对） | **四处一起收敛到 `isDependencySatisfied`（含 V-5）** | 实测三处对同一标本给出三种答案；且 **V-5 不同改会把写路径自己拒掉** |
| 读路径遇校验失败 | 沿用"按不可用处理"（`load` 返回 `undefined` ⇒ 队列读成 0 张、看板空白） | **warning + 继续返回队列；`ready` 以内存重算为准（不写盘）** | 校验的目的是拦住"写坏"，不是让"派生值陈旧"把存量需求判成没有任务（A+B 合体裁定） |
| V-5 两级 | 假就绪与漏就绪同为一个级别 | **假就绪 = issue（真问题）；漏就绪 = warning（可自愈的陈旧派生值）** | 只有"写坏"该拦；陈旧 `ready[]` 属于读侧自愈范畴 |
| 悬空依赖 | 顺手统一宽松/保守策略 | **各自保持原策略** | 统一是行为变更、超出边界（FR-6 不追溯）；V-3 已负责检出悬空 |
| 留痕写侧落点 | 在 `MoveTask` 用例里写 | **`transitionTask` 收敛点 + 三个直写点共用 `markCanceled`** | 回退/占位卡清理**不经** `MoveTask`（直写 `status`），只改用例会漏掉需求回退这一大类（标本 26 张正是回退产物） |
| 三字段形态 | 只靠 `statusHistory`（已有 by/reason） | **加三个可投影字段** | D-5 明确要求"字段"；RTM/归档/看板要能**按字段**直读；加性可选 ⇒ 零迁移 |
| `canceledBy` 类型 | 复用宽 `ActorRef`（kind 三态） | **收窄 `{ kind: 'human'; sessionId? }` + 非 human 不写** | 留痛必须只记人；宽类型会让"系统取消"看起来像"人取消" |
| 覆盖度门强度 | 顺带放宽阈值 / 剔掉所有非完成态 | **只剔 `canceled`，阈值不动** | 剔掉 `todo/in_review` 会把真实未完成洗干净——那是掩盖缺口，不是修口径 |
| 错误码 | 顺手加"取消字段缺失"告警 | **零新增错误码** | 字段可选是设计的一部分（未采集合法），为它加错误码会把兼容性设计反噬成负担 |

## 技术方案与亮点 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**模块划分**：

| 模块 | 职责 |
|---|---|
| `src/domain/status/Predicates.ts` | 新增 `isLiveTask` / `liveTasksOf` / `liveCountOf` / `liveLayers` / `liveReadyTasks` / `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` / `layerInputOf`（判据唯一来源） |
| `src/domain/queue/topology.ts` | `computeReady` 判据改调单点（写路径落盘 `ready[]`）；`computeLayers` 判据**照旧** |
| `src/domain/queue/validateQueue.ts` | **V-5 必须同改**（`unmet` 判据改 `isDependencySatisfied`）；V-4 不动 |
| `src/shared/protocol.ts` | `TaskRecord` 三可选字段 + `markCanceled`（`recordStatus` 旁）+ `readyTasks` 收敛为薄封装 |
| `src/application/internal/task-transition.ts` | `to === 'canceled'` 时调 `markCanceled`（主写入点） |
| `src/application/internal/rollback-tasks.ts` / `stale-rework.ts` / `rollback-cleanup.ts` | 三个直写点共用 `markCanceled` |
| `src/application/internal/rtm-yaml.ts` | 两个公开入口顶部 `liveTasksOf`；`coverageGateOf` **不动** |
| `src/application/query/QueryStageDetail.ts` / `QueryDag.ts` | 补上漏掉的过滤；DAG 层号改 `liveLayers` |
| `src/application/query/QueryDocs.ts` / `QueryReport.ts` / `QueryState.ts` | 收编手写 filter 为单点 |
| `src/application/internal/{sheet-tasks,content-trace,verification-doc-writer,backfill-task-refs}.ts` | 收编手写 filter 为单点 |
| `src/application/use-cases/SubmitVerification.ts` | 4 处手写 filter 收编为单点（`:333` 是分母 106 的由来） |
| `src/http/routers/stages.ts` | API 边界出口：`tasks` / `ready` / 计数全部按活卡下发 |

**关键实现手法**：

- **入口漏斗**：分母口径只在两个公开入口各一行，18 + 3 个调用点零改动。
- **判据与取数同源**：`isLiveTask`（判据）、`liveTasksOf`（取数）、`liveCountOf`（分母）同文件同源（断言 3 守）。
- **读路径不信任落盘派生值**：`liveReadyTasks` / `liveLayers` 现算；落盘 `ready[]`/`layer` 降级为派生缓存
  （前者下次写事务刷新、后者登记为历史值）。
- **写读判据同一份**：`computeReady`（写）与 V-5（校验）必须同批改——这是本需求最容易当场炸的一处。
- **同一次写**：留痕三字段与 `status` 在同一事务、同一对象（无补偿、无半态）。
- **加性零迁移**：三字段全可选，缺省 = 未采集；不 bump 版本常量、不写迁移脚本。
- **人工门不松**：`HUMAN_ONLY_TASK_TRANSITIONS` 逐字不动——留痕是"记下来"，不是"放开"。

**攻克的难点**：

- **同一用例两个分母**：`SubmitVerification` 的探针与落盘喂了两份不同卡集（132 / 106）⇒ 门禁看 80（压线、点名 26 张）、文件写 100。入口收敛后只可能有一个数。
- **三处依赖判定漂移**（实测三种答案）：取消一张前置卡把下游活卡永久钉死，且取消卡不可见 ⇒ 人查不出原因。
- **V-5 与写路径的隐性耦合**：改了 `computeReady` 不同改 V-5，写会被 `QUEUE_VALIDATION_FAILED` 拒、读会被降级成空队列。
- **取消卡参与分层**：实测活卡 `t-l` 落 layer 2，删掉指向取消卡的边后是 layer 1（掉一档）。
- **回退批量取消绕过收敛点**：26 张卡正是 `planRollbackTasks` 直写 `status` 产生的 ⇒ 留痕必须接四个写入点。
- **存量需求永不触发 RTM**：追溯读数可能长期含取消卡（标本两个文件 106 / 132 互不一致）⇒ 只作已知边界声明，不假装已修。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向 |
|---|---|---|---|---|
| 分母修正 | 在门禁处 `filter` | 在**两个 RTM 入口**剔（同一 helper） | 门禁只是读方之一；入口剔卡让门禁、追溯、看板同源 | `rtm-yaml.ts:153/:188`、验收 B4/B5 |
| 活卡判据 | 各消费点各写 `!== 'canceled'` | 单点 + 源码级断言（消费点自写即红） | 病根就是"四处实现、两处漏了" | `tests/live-tasks-single-source.test.ts`、验收 B6 |
| 取消留痕 | 在业务用例里写 | 收敛点 + `markCanceled`，四个写入点全接 | 回退批量取消不经用例 | `markCanceled`、验收 C7 |
| 依赖已了结 | 只认 `done` | `isDependencySatisfied`（`done ∨ canceled`）**且 V-5 同改** | 取消卡永远不会完成，当未满足 = 把活卡永久卡死（D-8）；V-5 不同改会当场炸 | 三处就绪 + V-5、验收 A2 |
| 落盘派生值 | 读 `ready[]` / `layer` | 读路径现算（`liveReadyTasks` / `liveLayers`） | 存量派生值与新口径可能不一致，读它即复现旧病 | 验收 A2/C8 |
| 兼容 | 写迁移脚本回填 | **无迁移脚本**（缺省 = 未采集） | 回填会篡改审计事实；加性字段天然兼容 | `design/migration.md`、验收 C8 |
