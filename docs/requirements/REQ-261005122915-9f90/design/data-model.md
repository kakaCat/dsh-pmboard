---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 数据模型设计（REQ-261005122915-9f90）

> 本份回答「是否改表 / 改 schema、迁移与回滚」。结论先行：**不改存储形态，只补一条读侧派生口径**。

## 是否改表 / 改 schema `serves: FR-1, FR-4`

**不改**：

- 队列文件 `docs/requirements/<REQ>/queue.json` 的 `TaskRecord` 字段、必填性、默认值**一律不动**；
- 台账分片（`record.json` / `plan.json` / `comments.jsonl` 等）**不动**；
- `schemaVersion` / `QUEUE_VERSION` **不升版**。`reworkOf` 早在 REQ-261003204149-1e80 已落库，本次只改**读它的判据**。

为什么可以不改：本次缺陷的根因是**判据错**（把占位卡当真卡），不是**数据缺字段**。
加字段会引入迁移面，而修复所需的信息（`reworkOf` + `status`）已在盘上。

## 读侧派生口径：真卡 / 占位卡 `serves: FR-1, FR-2, FR-3`

新增一条派生口径（**不落盘**，纯函数）：

```typescript
// 占位卡（回退为「这些活要重做」留的占位）：
//   判据 = reworkOf 非空
// 真卡（活卡里真正已落库、可推进的卡）：
//   判据 = status !== 'canceled' && reworkOf 为空
```

| 口径 | 定义 | 用在哪 |
|---|---|---|
| 占位卡 | `reworkOf` 非空 | 回退态收敛（FR-2）、再次回退的处置（FR-4） |
| 真卡 | `status !== 'canceled'` 且 `reworkOf` 为空 | 落库幂等（FR-1）、批准路径推进（FR-3） |
| 活卡（既有口径，保留） | `status !== 'canceled'` | 队列视图、看板泳道（**语义不变**，不做替换） |

**约束**：三个口径只在 `src/domain/task/ReworkPlaceholder.ts` 定义一次；
`landApprovedPlan`、`confirm-settle`、`handlePlanDecision`、`rollback-tasks` 一律 import，
不得各写一份 `filter(t => t.reworkOf === undefined)`（本仓「两份真相必然漂移」的既有教训）。

## 台账 rollback 字段的使用 `serves: FR-2, FR-5`

`RequirementRecord.rollback`（既有字段）本次**只读，不改形状**：

| 子字段 | 本次用途 |
|---|---|
| `to` | `rollbackTo = rollback.to === req.status` —— 落库编排判定「是否处于回退态」（既有口径，逐字沿用） |
| `seq` | 清场按钮的 `data-seq`（缺省 1，与 `currentRollbackSeq` 同口径）；服务端序号校验不变 |
| `lastMaterialized` | 清场入口的精确匹配清单（既有，本次不动） |

## 迁移、兼容与回滚 `serves: FR-1`

- **迁移**：无。加性修复 + 判据修正，存量记录照常读。
- **兼容**：`alreadyLanded` 的**语义收窄**（不再计占位卡）只影响「统计与推进判据」——
  它不进存储，也不对外承诺过「包含占位卡」，故无兼容负担。
- **存量现场**（REQ-261005105032-3b02）：不需要改历史数据。修复后按既有「清场（第 1 次回退）→
  重新落库」即可复位；验收口径第 6 条会在该现场复演。
- **回滚路径**：若本次改动需回退，直接还原上述文件即可——没有需要反向清洗的数据
  （唯一副作用是占位卡的 `canceled` 状态与 `rollback` 修订，属 append-only 留痕，不丢信息）。
