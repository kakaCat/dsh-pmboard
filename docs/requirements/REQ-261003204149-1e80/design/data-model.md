---
serves: FR-1, FR-3, FR-4
---

# 数据模型设计 · REQ-261003204149-1e80 <!-- serves: FR-1, FR-3, FR-4 -->

> 一句话：**只加两个可选字段**（`rollback` / `reworkOf`），其余全部复用既有结构；
> 不换存储、不改文件格式、不写迁移。撤销靠"清章"而不是"新加失效标记"。

## TL;DR <!-- serves: FR-1, FR-3 -->

回退需要"记住退过"这件事（供拆分守卫判定回退态），以及"这张卡是重做的"这层关系。
两处各加**一个可选字段**即可，其余（撤章、撤批准、旧卡取消）都是**改既有字段的值**，不引入新结构。

## 新增字段 <!-- serves: FR-1, FR-4 -->

```ts
/** 需求台账（shared/protocol.ts）——新增可选字段，旧台账读入即合法。 */
interface RequirementRecord {
  // …既有字段不变…
  /** 最近一次需求级回退的留痕（FR-1/FR-3）；undefined = 从未回退过。 */
  rollback?: {
    from: RequirementStatus
    to: RequirementStatus
    at: number
    by: ActorRef
    reason?: string
  }
}

/** 任务卡（shared/protocol.ts）——新增可选字段。 */
interface TaskRecord {
  // …既有字段不变…
  /** 本卡是为取代哪张旧卡而物化的重做卡（FR-4）；undefined = 常规卡。 */
  reworkOf?: string   // 被取代的旧卡 id（t-xxxxxx）
}
```

**为什么 `rollback` 只留最近一次**：它是**状态标记**（"当前处在回退态"），不是历史账
——历史由 `statusHistory` 的状态事件与 `[回退]` 评论承担（只增不改）。
重复回退覆盖它，符合"后写覆盖前写"的既有断点口径。

## 复用的既有结构（不新增） <!-- serves: FR-3, FR-4 -->

| 需求 | 复用对象 | 用法 |
|---|---|---|
| 撤章 | `StageArtifact.confirmedAt / confirmedBy / confirmedVia` | **清空**（`delete`），产物登记本身保留 |
| 撤批准 | `RequirementRecord.plan.approvedAt / approvedBy` | **清空** |
| 待同步标记 | `RequirementRecord.docSyncPending[]`（`DocSyncSource = 'requirement' \| 'plan'`） | 复用 `applyDocSync` |
| 旧卡取消留痕 | `CardRevision.kind = 'rollback'`（已存在） | push 一条修订 |
| 审计 | `StatusEvent[]`（状态事件）+ `comments[]` | 回退写一条事件 + 一条评论 |

**关键取舍**：不引入 `StageArtifact.supersededAt` 这类"失效标记"。
理由是既有代码已有先例——`SubmitArtifact` 重写需求文档时就是 `delete art.confirmedAt`
（"旧确认作废需重新确认"），撤销语义全仓同一口径，不制造第二套"作废"表达。

## 状态迁移与数据副作用对照 <!-- serves: FR-3 -->

| `to`（回退目标） | 撤哪些章 | 撤批准 | 卡处置 |
|---|---|---|---|
| `accepting → implementing` | `verification` | 否 | 不取消（验收返工走既有 verdicts 物化返工卡） |
| `implementing → design` | `verification`（若有）+ `task_detail`（若晚于 design） | **是** | 旧卡全 canceled + 物化重做卡 |
| `decomposing → design` | `decomposition` | **是** | 同上 |
| `design → brainstorming` | `design` | **是** | 同上（此时通常无卡） |
| `* → draft` | 全部下游 | **是** | 同上 |

判据统一为 `stagesAfter(to)`，不写死阶段名——避免"退回 brainstorming 却漏撤 decomposition"这类遗漏。

## 兼容与迁移 <!-- serves: FR-1 -->

- **旧数据**：两个新字段均可选；旧台账、旧队列卡读入后 `undefined`，行为与现状一致。
- **无回填**：不猜测历史需求"是否被回退过"——`rollback` 只为**新发生**的回退写入。
- **无迁移脚本**：字段级别向后兼容，旧代码读到新字段直接忽略。
- **回滚路径**：还原代码即可；已写入的 `rollback` / `reworkOf` 被旧代码忽略，不会损坏台账。
- **规模**：每个需求最多 1 条 `rollback`；重做卡数量 = 被取代的旧卡数量（无卡则 0）。

## 边界与不变量 <!-- serves: FR-4 -->

- `reworkOf` 只指向**同一需求**内的卡；跨需求引用不合法（与 `requirementRefs` 的越界纪律一致）。
- 重做卡 `dependsOn: []`——旧依赖关系随旧卡一起失效，保留会引用已取消的卡。
- 重做卡**不得**让 `taskCompletenessGap` 误判：该判据的输入是 `status !== 'canceled'` 的活卡，
  回退后活卡 = 重做卡（新 id），语义正确（"有活卡"→允许进入实施）。
- `rollback.to` 必须等于回退发生后的 `status`；两者不一致的台账按"无回退态"处理并记警告（不静默猜）。
