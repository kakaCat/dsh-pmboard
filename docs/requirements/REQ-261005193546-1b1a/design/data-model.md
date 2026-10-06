---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 数据模型设计（REQ-261005193546-1b1a 取消留痕字段与取消态读数口径）

> 契约源：`requirement.md`（FR-1~FR-6 / D-1~D-8）+ `prototypes/dag-canceled-hidden.html`（`#mock-ledger` 的三列 + 文末 proto-geometry 观测量）。
> 本份只定**数据结构、字段级约束、取消态与统计的对照关系、迁移与兼容**；接口签名与落点见 `interfaces.md`。
> 标本（下文所有「改前」实测值的事实源）：`docs/requirements/REQ-261005105032-3b02/queue.json` —— 实测 `total=132`（`done=106` + `canceled=26`）、`ready=0`、`version=1`、`schemaVersion=9`。
> 标记约定：**「建议」= 我提的、待人确认**（§6 / §7 汇总）；无标记 = 已定死。

## 0. 模型总览 <!-- serves: FR-3 -->

| # | 结构 | 载体（事实源） | 写入方 | 读取方 | 契约来源 |
|---|---|---|---|---|---|
| 1 | `TaskRecord.canceledAt` / `canceledBy` / `cancelReason` | `src/shared/protocol.ts:1525` `TaskRecord`（⇒ `QueueTask extends TaskRecord`，落 `docs/requirements/<REQ>/queue.json`） | 4 个取消入口（`markCanceled` 唯一写入口） | 审计路径（台账、磁盘卡文档、归档材料）；**不进任何界面投影** | FR-3 / D-5 |
| 2 | 活卡判据（读侧口径） | `src/domain/status/Predicates.ts` | 研发 | 全部消费点 | FR-4 / D-6 |
| 3 | 取消态读数口径（哪些读数含取消卡） | 各投影的取数边界（`interfaces.md` §4） | — | 界面 / 门禁 / 追溯 | FR-1 / FR-2 / FR-5 |
| 4 | 依赖边「已满足」语义 | `src/domain/status/Predicates.ts` | 研发 | `computeReady` / `readyTasks` / `readyTasksOf` / V-5 | FR-1 / D-8 |

## 1. `TaskRecord` 新增三个加性可选字段（FR-3） <!-- serves: FR-3 -->

### 1.1 字段表（类型 / 必填 / 默认 / 约束 —— 全部定死） <!-- serves: FR-3 -->

**三字段的语义 = 「本卡最近一次取消」（覆盖式）**：同一张卡被取消两次（例如取消 → 复活 → 再取消）时，三字段被**第二次取消覆盖**，不留上一次的副本。历史（每一次取消/重开）由既有的 `statusHistory`（每次转移一条）与 `revisions`（append-only）承载——**首次取消不可追**（它只在那两份历史流里，不在三字段里）。这也是三字段「字段是查询面、历史流是历史面」的分工（与 `architecture.md`「数据结构变更」节同口径）。

| 字段 | 类型 | 必填 | 缺省含义 | 约束 | 写入方 |
|---|---|---|---|---|---|
| `canceledAt` | `number`（epoch ms） | **否** | 缺省 = **未采集**（旧数据；不补 `0`、不补 `null`、不补当前时间） | 与 `status='canceled'` 同一次写；值 = 那一次写的时钟值（与 `statusHistory` 那条事件的 `at` **同一个数值**） | `markCanceled` |
| `canceledBy` | `{ kind: 'human'; sessionId?: string }` | **否** | 同上 | `kind` 恒为 `'human'`（取消是人工门动作）；`sessionId` 缺省 = 人从看板按钮操作（无会话，**不写该键**，不写空串） | `markCanceled` |
| `cancelReason` | `string` | **否** | 同上 | **trim 后非空才写该键**（全空白 = 等价于未采集，不写空串）；长度上限见 §6（**建议**） | `markCanceled` |

### 1.2 形状（定死） <!-- serves: FR-3 -->

```ts
export interface TaskRecord {
  // …既有字段不动…
  /**
   * 取消时刻（REQ-261005193546-1b1a FR-3）。**可选**：缺省 = 未采集（本需求上线前取消的卡）。
   * 加性变更、零迁移：不补齐、不改写、无迁移脚本（与 prototypeRefs / decisionRefs / footprint 同款先例）。
   * **覆盖式**：再次取消即覆盖本值 ⇒ 它只回答「最近一次取消是什么时候」；每次取消的历史在 statusHistory。
   */
  canceledAt?: number
  /** 取消人（人工门动作，kind 恒为 'human'）；sessionId 缺省 = 看板按钮操作（不写空串）。覆盖式，同上。 */
  canceledBy?: { kind: 'human'; sessionId?: string }
  /** 取消原因（自由文本；trim 后非空才写）。覆盖式，同上。审计用，不进任何界面投影。 */
  cancelReason?: string
}
```

### 1.3 位置与传播（必须落对地方，否则静默不落盘） <!-- serves: FR-3, FR-6 -->

| 项 | 规定 | 理由 |
|---|---|---|
| 定义处 | **只**在 `src/shared/protocol.ts` 的 `TaskRecord` 加三个可选键 | 队列的 `QueueTask extends TaskRecord`（`src/domain/queue/QueueTypes.ts:41`）⇒ **自动继承**，不需要在 `QueueTask` 再抄一遍；`tests/queue-types.test.ts` 的类型级断言（「`QueueTask` 恰好 = `TaskRecord` + `layer`」）继续成立 |
| 落盘 | 由既有 `QueueTaskStore` / `QueueRepository` 整份写盘承载（不做字段白名单） | 实证：同为加性可选的 `footprint` 已出现在标本 `queue.json` 的每张卡上 |
| 类型必填性 | **三个全部可选**（`?`） | 若设为必填，会让 `tests/queue-types.test.ts` 的 `sampleTask()` 编译失败、并让存量分片读取路径全红（那是「迁移」而不是本需求的「零迁移」） |
| 不动的地方 | `REQBOARD_SCHEMA_VERSION`（保持 **9**）、`QUEUE_VERSION`（保持 **1**）、`validateQueue.ts` 的 `REQUIRED_TASK_FIELDS`（不加这三个） | 加性可选字段对旧读者零影响；先例：`footprint` 的注释即写明「本字段可缺省，故不 bump schemaVersion」 |

### 1.4 零迁移（逐条） <!-- serves: FR-3, FR-6 -->

| 项 | 规定 |
|---|---|
| 迁移脚本 | **无**（不新建、不复用 `scripts/migrate-*`） |
| 旧记录 | **不补齐**、**不改写**、不产生写回（读路径不得因为「看到缺键」就去补写） |
| 字段缺失 | 运行时读为 `undefined`（**未采集**），不抛错、不填默认值 |
| 残留 | 允许「有 `status='canceled'` 但三字段全缺」这一形态长期存在（= 本需求上线前取消的卡）；**不记为不一致、不加校验规则** |

## 2. 既有字段语义不变 <!-- serves: FR-3, FR-1 -->

| 字段 | 值域 / 语义 | 本需求是否改 | 说明 |
|---|---|---|---|
| `status` | 7 值不变：`todo` / `in_progress` / `integrating` / `testing` / `in_review` / `done` / `canceled`（`domain/task/TaskStatus.ts`） | **不改** | 不加值、不改名；转移表（含 `HUMAN_ONLY_TASK_TRANSITIONS`）**一行不动**——「取消 = 人工门」是既有属性（requirement「不做」第 4 条） |
| `status='canceled'` 的语义 | **逻辑退出**：不参与交付、不参与任何读数；台账与任务文档保留 | **不改**（本需求是让「不参与读数」真正落地） | D-1：**不物理删除**（卡 id 被父卡依赖 / 子卡链 / 追溯 / 评论引用） |
| `dependsOn` | `string[]`，本需求内任务的 id，语义 = **直接前置** | **不改结构、不改存储** | 「边按已满足处理」是**判定时**的口径（`interfaces.md` §3），不改数据：`dependsOn` 仍可指向已取消卡，**不删边、不改写** |
| `layer`（队列派生） | 由 `computeLayers` 计算、写回队列文件 | **计算输入收窄为活卡**；取消卡的 `layer` **冻结**在取消时刻的值 | 见 `interfaces.md` §3.3（写读同源 + V-4 仍成立的分析） |
| `revisions` / `statusHistory` / `updatedAt` / `updatedBy` | 既有留痕 | **不改**：取消仍按既有方式追加 `revision`（批量路径）与 `statusHistory` 事件（人工门路径） | 三字段是**补充**留痕，不替代既有留痕 |
| `blocked` / `blockedReason` | 既有 | 不改（批量取消路径既有 `blocked=false` + 删 `blockedReason` 的行为保留） | — |

## 3. 取消态与统计的对照表（改前 → 改后） <!-- serves: FR-2 -->

标本 = `REQ-261005105032-3b02`（`total=132` = `done=106` + `canceled=26`）。「该完成的卡」= 活卡 = **106**。

| # | 读数 | 事实源 / 落点（实测行号） | 改前（实测 / 推断） | 改后 | 依据 |
|---|---|---|---|---|---|
| 1 | 视图行数（「DAG 层级」卡片数） | `QueryStageDetail.ts` 的 `Decompose`/`Implement` body 任务投影 | **含**（该处**无**过滤）= 132 | **106** | FR-1 / A1 |
| 2 | 详情页计数（总任务 / 已完成 / 开发中 / 待开始） | 同上投影（客户端 `views/stage-detail.ts:117-120` 直接数数组） | **含** = 132 / 106 / 0 / 0 | 106 / 106 / 0 / 0 | FR-2 |
| 3 | 进度 / 完成度分母 | `QueryReport.ts:402` `progressOf`（**已过滤**）；`domain/workflow/RollupSpec.ts:65` `activeTasksOf`（**已过滤**） | 已是 106（数值不变） | 106（只改成复用同一判据） | FR-2 / D-4 |
| 4 | 甘特条数 / DAG 画布节点数 | `routes/stages.ts:87 handleState` 的 `tasks`（**全量** `listAll()`） | **含** = 132 | **106** | FR-2 |
| 5 | 追溯行数 | 磁盘 `rtm-decomposing.yml`（`assembleTraceability` 读） | 实测 `outputs.tasks` = **132**、`task_coverage` = **132** | **106**（触发点刷新后；边界见 `interfaces.md` §5） | FR-2 |
| 6 | 测试覆盖度门分母（验收前置） | `rtm-accepting.yml` `coverage.testing.total_tasks`（由 `vendor/.../accepting-generator.ts:135` 按**生成时的全量任务**算） | 需求判据：`106/132` = **80.3%**（标本 `rtm-accepting.yml` 现值 `total=106`，生成于取消卡入册之前 ⇒ **陈旧**，见 §4.4） | `106/106` = **100%** | FR-2 / A4 / A5 |
| 7 | 依赖分层对象（`layer`） | 队列落盘 `layer`（写路径 `computeLayers` 全量算） | 取消卡占层；活卡层号把取消卡当**已满足前置**之外的一层 | 活卡层号 = 「删掉指向取消卡的边后重算」；取消卡 `layer` 冻结 | FR-1 / D-8 / A2 |
| 8 | 可开工集（`ready`） | 队列落盘 `ready` / `GET /state` 的 `ready` | 只认 `done` ⇒ 依赖取消卡的活卡**永不 ready**（标本 `ready=0`） | 取消卡视为了结 ⇒ 该活卡可进入 ready | FR-1 / D-8 |
| 9 | 归档计数 `canceled_count` | 归档材料（原型 `#mock-ledger` / FR-5） | 26（**审计路径可见**） | 26（**不变**；界面仍 0 处） | FR-5 |
| 10 | 任务卡文档数 | 磁盘 `docs/requirements/<REQ>/tasks/<task_id>.md` | 132 份 | 132 份（**不删、不改写**） | FR-5 / FR-6 / A9 |

> 读法：第 1、2、4、5、6、7、8 行是**本次要改的**；第 3 行数值不变（只收编判据）；第 9、10 行**刻意不变**（审计与留痕）。

## 4. 兼容矩阵 <!-- serves: FR-6 -->

### 4.1 旧分片（无三字段） <!-- serves: FR-6, FR-3 -->

| 情形 | 读取行为 | 写回 | 判据 |
|---|---|---|---|
| 旧 `queue.json` 里的取消卡（无 `cancel*` 键） | **零异常**；三字段读为 `undefined` = 未采集 | **无写回**（mtime 逐份不变） | A8 |
| 该卡被审计路径读到（台账 / 归档材料） | 三列渲染为**空字符串**，不是 `undefined` / `null`（原型 FR-6 锚点） | 无 | 原型 FR-6 |
| 该卡被界面投影读到 | 不出现（判据只看 `status`，与三字段无关） | 无 | A1 / A3 |
| 实证 | 标本 `queue.json` 的 26 张取消卡**今天就没有**任何 `cancel*` 键 —— 即「旧数据 = 未采集」的现成样本 | — | — |
| **陈旧派生字段**（`ready[]` / `layer`，按旧口径写入） | **按当前判据在 `load` 内存重算**：返回对象与校验输入用重算结果；**不改磁盘、不写回**（FR-6 逐字节不变） | **无写回** | 父窗口裁定③ |
| 若不在 `load` 重算会怎样 | 活卡 `todo` 且依赖已取消卡时，新口径下它应 ready、而磁盘 `ready[]`（旧口径）没有它 ⇒ V-5「漏就绪」⇒ `QueueRepository.load:183` 判 `passed=false` ⇒ **整份队列按不可用处理（界面空白）**。故必须重算 | — | — |
| `save` 侧边界 | `save` **仍强校验**（`QueueRepository.save:209` 的 `validateQueueFile` 保持 fail-closed）：写盘前按同一口径重算派生字段（由 `normalizeQueueFile` 承担），校验不过则一个字节都不落盘 | 写盘时按新口径 | 父窗口裁定③ |
| 实测（本工作区） | 扫描 `docs/requirements/*/queue.json` 共 **62 份**：活卡依赖已取消卡的边 **0 条**、新口径 ready 相对磁盘 `ready[]` 的差集 **0 条** ⇒ **当前 0 例触发**（该重算是**预防性**的，不是因为已有档案会坏） | — | 设计时实测 |

### 4.2 旧 RTM YAML（缺节） <!-- serves: FR-6, FR-2 -->

| 情形 | 行为 |
|---|---|
| `rtm-decomposing.yml` 缺 `task_coverage` / `rtm-brainstorming.yml` 缺 `prototypes` / `decisions` | 沿用既有宽容度：**未采集**（不报错、不判失败）——本需求不改这条宽容度 |
| 缺 `coverage` / `traceability` | 同上；`assembleTraceability` 缺键即不注入该键（既有降级） |
| 本需求新增的兼容要求 | **无**：RTM 的读侧宽容度不动，只改**喂入**（`interfaces.md` §5） |

### 4.3 已归档需求（不追溯） <!-- serves: FR-6, FR-5 -->

| 项 | 规定 |
|---|---|
| 回填三字段 | **不做**（历史取消卡如实标注「未采集」） |
| 重扫 / 重算 RTM | **不做**（不主动为存量需求重新生成 RTM） |
| 触发点被动刷新 | **照常**：任何既有触发点（`confirm:plan` / `task:status` / `submit:verification` …）触发的重新生成，产物按**新口径**（只含活卡）。这不是「改写历史」，是既有触发点语义 |
| 任务卡文档 / 历史追溯文件 | 不删除、不改写（A9） |

### 4.4 「追溯读数与触发点时机相关」的如实声明 <!-- serves: FR-2, FR-6 -->

RTM YAML 是**触发点写入的快照**，不是实时视图。实例：标本的 `rtm-accepting.yml`（`coverage.testing.total=106`）生成于 26 张取消卡入册**之前**，而 `rtm-decomposing.yml`（132）生成于之后 —— 同一需求的两份 YAML 口径不同。含义：

- 改后「追溯行数 = 活卡数」只在**该需求被触发过一次之后**成立；
- 永不触发的存量需求，其界面追溯读数仍含取消卡（**待人拍板**：接受并如实声明 / 另立一次性重扫）。

## 5. 不变量 <!-- serves: FR-4, FR-5, FR-1 -->

| 编号 | 不变量 | 可断言形式 |
|---|---|---|
| INV-A | **界面卡数 == 统计分母**（同一台账、同一需求） | `liveCountOf(all) === 视图投影条数 === 进度分母 === 甘特条数 === RTM tasks 数`（追溯在触发点刷新后） |
| INV-B | **取消卡只在审计路径可见** | 任何界面投影里 `isLiveTask` 为假的条目数 = 0；磁盘 `tasks/*.md` 与台账记录数不变 |
| INV-C | 判据唯一 | 全仓 `status !== 'canceled'` / `status === 'canceled'` 的命中集合 ⊆ `interfaces.md` §8 基线（新增即红）；判定定义处（`domain/status/Predicates.ts`）豁免 |
| INV-D | 留痕三字段与状态同生 | `canceledAt` 有值 ⇒ 该次写入同时写 `canceledBy`；三者缺省时**全缺**（不出现「只有 `canceledBy` 无 `canceledAt`」的新写入；旧数据允许全缺，不做跨字段校验） |
| INV-D2 | 留痕 = **最近一次**取消且只增不减 | **覆盖式**：再次取消覆盖三字段；**复活（`canceled → todo`）不清空**；**首次取消不可追**（历史只在 `statusHistory` / `revisions`）——已定稿（§1.1） |
| INV-E | 取消卡不阻塞 | 活卡的 `layer` / `ready` 与「把指向取消卡的边删掉后重算」逐字一致（A2） |
| INV-F | 文档面板口径（A3 + 父窗口裁定⑥） | `documents 行数 + Σ discovered.count === 活卡产物数`（取消卡的 `task_detail` 产物在**两侧同时排除**）；审计靠磁盘与台账，不靠文档面板 |
| INV-G | 无删除 | 本需求不产生任何 `tasks[]` 元素的删除：改前 `tasks.length` === 改后 `tasks.length`（标本 132 === 132） |

## 6. 字段级约束的建议（待人确认） <!-- serves: FR-3 -->

以下是我提的**建议**（不是裁定），执行前需人确认：

| # | 建议 | 理由 | 若否决的替代 |
|---|---|---|---|
| 1 | `cancelReason`：**trim 后非空才写该键**；全空白视为未采集 | 避免落一个 `''` 或 `'   '`，让「有原因」与「没原因」在台账上可分 | 一律写原值（会引入「空串」第三态） |
| 2 | `cancelReason` 长度上限 **≤ 500 字符**（超长：**保留前 500** 还是**拒绝写入**需人定） | 取消原因在一句话量级；无上限会让分片里塞长文（注释类文本另有 `comments`） | 不设上限（与 `comments` 同款自由文本） |
| 3 | `canceledAt` 的数值 = `statusHistory` 里那条 `→canceled` 事件的 `at` | 两处留痕可互相校验（同一次写同一时钟值） | 各自取 `clock`（可能差 1ms，无法互相校验） |
| 4 | `canceledBy.sessionId` 缺省时**不写该键**（不写空串） | 与既有 `parentId` 的「空串与 undefined 归一」口径一致（`sheet-tasks.ts:38`） | 写空串（引入两态） |
| 5 | `canceledBy.kind` 保持字面量 `'human'`，不放宽为 `ActorKind` | 取消是人工门（需求「不做」第 4 条）；放宽会让「agent 取消」在类型上合法 | 放宽为 `ActorRef`（则需同时定义非人取消的语义） |
| 6 | ~~复活是否清空三字段~~ **已定稿** | 三字段 = 最近一次取消（覆盖式）⇒ 复活**不清空**（审计要「曾被取消」这个事实），见 §1.1 / INV-D2 | — |
| 7 | 不 bump `QUEUE_VERSION`（保持 1） | 与 `footprint` 的加性先例一致；bump 会让所有旧分片被判定为「格式落后」而触发迁移话题 | bump 为 2（需同时定义旧版本读方行为，属超范围） |

## 7. 示例与反例 <!-- serves: FR-3 -->

### 7.1 新写入（人工门取消一张卡） <!-- serves: FR-3 -->

```jsonc
{
  "id": "t-0a1b2c", "status": "canceled",
  "statusHistory": [ /* …既有… */ { "status": "canceled", "at": 1759700000000, "by": { "kind": "human" }, "reason": "被新计划取代" } ],
  "canceledAt": 1759700000000,                       // 与上面那条事件的 at 同一个数值（建议 §6-3）
  "canceledBy": { "kind": "human" },                 // 无 sessionId：看板按钮操作 ⇒ 不写该键（建议 §6-4）
  "cancelReason": "被新计划取代",                     // trim 后非空
  "blocked": false
}
```

> **再次取消会覆盖上例三字段**（覆盖式，§1.1）：第二次数值进来后，第一次的 `canceledAt/By/Reason` 就不在字段里了——要追第一次，读 `statusHistory` 里更早的那条 `→canceled` 事件（**首次取消不可追**是刻意取舍：字段是查询面，历史流是历史面）。

### 7.2 需求级回退批量取消（标本里 26 张的形态） <!-- serves: FR-3 -->

```jsonc
{
  "status": "canceled",
  "canceledAt": 1759600000000,
  "canceledBy": { "kind": "human", "sessionId": "session-…" },
  "cancelReason": "需求级回退（第 2 次回退）：旧卡退出赛道，由新计划重做",
  "revisions": [ /* …既有 rollback 修订仍在… */ ]
}
```

### 7.3 旧数据（本需求上线前取消；**正确形态，不是缺陷**） <!-- serves: FR-3, FR-6 -->

```jsonc
{ "id": "t-0d4e5f", "status": "canceled" }            // 三键全缺 = 未采集；不补齐、不改写、不报错
```

### 7.4 反例（必须被拦住的写法） <!-- serves: FR-3, FR-6 -->

| 反例 | 为什么错 |
|---|---|
| `"canceledAt": null` / `"canceledBy": null` | `null` 与「未采集」是两态；契约只认 `undefined`（缺键） |
| `"cancelReason": ""` | 空串与未采集是两态；trim 后非空才写（建议 §6-1） |
| `"canceledBy": { "kind": "agent" }` | `kind` 值域只有 `'human'`（取消是人工门） |
| `"canceledAt"` 有值但 `"canceledBy"` 缺键（**新写入**） | 违反 INV-D（同一次写必须两个都写）；旧数据允许全缺 |
| 把三字段写进 `RequirementRecord` | 载体错：留痕是**任务卡**级事实（`TaskRecord`），需求级的取消另有 `status`/`statusHistory` |
| 读取时「发现缺键就补写」 | 违反 §1.4 零迁移 + FR-6（读取前后目录逐字节一致） |
| 把三字段当**历史流**用（以为能查到「每一次」取消） | 三字段是**覆盖式**的最近一次（§1.1）；历史只在 `statusHistory` / `revisions` 里，且**首次取消不可追** |
| 复活（`canceled → todo`）时清空三字段 | 与覆盖式语义冲突（§5 INV-D2）：复活后仍能答「这张卡最近一次是谁为什么取消的」 |

## 8. 关键决策与取舍 <!-- serves: FR-6 -->

| # | 决策 | 取舍 |
|---|---|---|
| 1 | 三字段是**加性可选**，不 bump 任何版本 | 换来零迁移、旧分片零异常；代价是「未采集」与「当时没原因」在台账上不可区分（本需求选择同一含义：都没值） |
| 2 | `canceledBy` 只容 `'human'` | 类型即裁定：agent 无权取消（与 `HUMAN_ONLY_TASK_TRANSITIONS` 同口径）；代价是将来若允许 agent 取消需改类型 |
| 3 | 留痕字段**不进任何界面投影**（连「已取消」标记行都不给） | D-7 的严格口径：界面完全彻底不可见；代价是「少了 26 张」只能在台账/归档里解释 |
| 4 | 取消态的读数差异**全部落在取数边界**（不落数据） | 数据只有一份（台账），口径差异只在投影层；代价是每个新投影都必须记得走活卡判据（由 INV-C 的断言守） |
| 5 | 历史不追溯（不回填、不重扫） | FR-6 优先；代价是存量需求的追溯读数与 DAG 读数在触发点刷新前可能不同口径（§4.4，已如实声明） |
