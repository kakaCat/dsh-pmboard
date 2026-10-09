---
doc: data-model
requirement_id: REQ-261008020552-4aa0
serves: [FR-1, FR-2, FR-5]
---

# 数据模型：零 schema 变更、零迁移，仅一处留痕取值变更

> 与 design/migration.md 同一结论，本页给出**数据面**的字段级清单。

## 一、是否改表 / 改 schema <!-- serves: FR-1, FR-2 -->

**否。** 台账（`~/.dsh/reqboard`，schemaVersion 9）与队列（queue.json）字段零增删：

| 数据面 | 变更 | 说明 |
|--------|------|------|
| `RequirementRecord.archive.docs` | 无 | 收编后仍由 `amendArchiveManifest` 追加（同一用例、同一字段） |
| `RequirementRecord.archive.amendments[]` | 无 | 只追加语义不变（`{docs, reason, at, by}`） |
| `RequirementRecord.archive.reconcile.listed` | 无 | 随 docs 同步的对账字段，逻辑未动 |
| `RequirementRecord.interruption` | **一处取值变更** | 见下节（`tool` 字段的新记录取值） |
| `RequirementRecord.comments[]` | 无 | `[归档·补录]` / `[断点]` 留痕格式逐字不变 |
| `TaskRecord`（队列） | 无 | 本批不触碰任务落库面 |
| 运行态文件（子卡预算窗口） | 无 | 本批不触碰 |

## 二、唯一数据面值变更：`interruption.tool`（D-3） <!-- serves: FR-2 -->

- 变更：新记录写 `'reqboard_task_amend'`（真实工具名）；历史记录保持原值（历史事实，不改写）。
- 读取兼容：该字段是**可缺省的展示型留痕**，读路径（断点节渲染 / 节点输入包）不做枚举校验，
  新旧值混存无消费方受影响（design/migration.md §2）。
- 回滚影响：回滚 U2 后新写入的 `'reqboard_task_amend'` 值留存——可接受（不驱动任何判定）。

## 三、迁移与回滚 <!-- serves: FR-5 -->

| 项 | 结论 |
|----|------|
| 迁移代码 | **无**（无 schemaVersion bump、无回填脚本） |
| 迁移窗口 | 不适用（插件装配期事实变更，重启/热加载即生效） |
| 数据回滚 | **不需要**：收编前后同一用例写同一结构；回滚代码不改变已写入记录的合法性 |
| 代码回滚 | 按 U1~U5 文件组还原（本批未 commit，见 notes/known-debt.md §四） |

## 四、不变式（供验收核对） <!-- serves: FR-1, FR-2, FR-5 -->

1. `archive.docs` 只增不减（历史不可改写）——补录幂等：已存在 path 进 `skipped` 且不写盘。
2. `interruption` 同一需求只保留一个对象（后写覆盖前写），`pendingAction` 按当前状态重算。
3. 两 op 的拒绝路径**零副作用**（拒绝发生在写台账之前）。
4. 工具面变更不影响台账可读性：19 个工具的读路径与 21 个时代读同一份记录。
