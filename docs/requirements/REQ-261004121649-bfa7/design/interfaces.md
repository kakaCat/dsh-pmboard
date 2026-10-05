# 接口契约（REQ-261004121649-bfa7）

> serves: FR-3, FR-4

## 一、物化编排的返回体（serves: FR-3）

`applyRequirementRollback(...)` 的 `taskPlan` 增加两个可观测字段，供调用方与看板判断
「这次回退将要/已经做了什么」：

| 字段 | 类型 | 语义 |
|---|---|---|
| `reworkDrafts` | `TaskDraft[]` | 仅**顶层父卡**的重做草稿（FR-1 后不再含子卡派生项） |
| `resetSubtasks` | `string[]` | 被原地复位的子卡 id（FR-1；新增） |
| `materializeCount` | `number` | 本次物化张数（= `reworkDrafts.length`；用于上限判定与留痕） |

## 二、幂等键与上限（serves: FR-3）

```
幂等键 = (requirementId, taskId, rollbackSeq)
   rollbackSeq：该需求第几次回退（需求台账上累加，随需求记录走）
   命中已有物化记录 → 跳过，不重复建卡（第二次执行物化数 = 0）
```

| 规则 | 行为 |
|---|---|
| 同一键重复 | 跳过（幂等），`materializeCount` 计入跳过数 |
| `materializeCount > 20` | **整次拒绝**，抛 `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`，**队列零新增**（不落库） |
| 错误文案 | 必含：将被物化的张数、上限值、以及一条建议（如先批量清理上一次物化） |

## 三、批量清理入口（serves: FR-4）

清场不能靠人逐张点（本次实测需清 53 张）。新增一个**仅人可操作**的看板入口：

```
POST /dashboard/api/reqboard/req/rollback-cleanup
body: { id: <REQ>, rollbackSeq: <number> }
→ { success, canceled: <number>, restoredLinks: <number>, note }
```

语义：把该次回退物化出来的重做卡**批量置 canceled**，并恢复被误伤的父子关系
（把原父卡重新挂回其子卡的 `parentId`，或按 `reworkOf` 反向还原）。

- **仅人**：**本入口刻意不注册任何 agent 工具**——agent 面没有可调用的清场工具，
  与看板「改绑」入口同款纪律：**代码级拒绝 = 工具面不存在**（人工裁定 2026-10-04）。
  初稿曾写「agent 调用返回 `REQBOARD_HUMAN_GATE`」，但那条做不到也测不出：HTTP 调用方的身份
  （人点的按钮 vs agent 发的 fetch）在服务端无法辨别，靠 body 自称等于把门锁在门上贴的标签上；
- 幂等：同一次回退清理两次 → 第二次 `canceled: 0`；
- 不改任何已完成（done）的卡（跳过并在回执 `skipped` 里给原因）。

## 四、错误码（serves: FR-3, FR-4）

| 码 | 场景 |
|---|---|
| `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT` | 单次回退物化数超上限（整次拒绝） |
| `REQBOARD_UNKNOWN_ROLLBACK_SEQ` | 清理时给了不存在的回退序号（**拒绝**，不清「最近的」） |

「仅人」不经错误码表达：能力只开在看板 HTTP 通道（人在看板点按钮），agent 面**没有**这个工具
（见 §三 的人工裁定）。
