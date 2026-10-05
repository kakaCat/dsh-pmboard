---
req: REQ-261001170807-06fd
doc: data-model
serves: FR-1
---

# 数据模型 · 归属锚点（serves: FR-1）

| 字段 | 载体 | 来源 | 用途 |
|---|---|---|---|
| `TaskRecord.parentId` | 需求队列 `docs/requirements/<REQ>/queue.json` | 父卡开工时懒展开子卡同事务写入 | **节流判据唯一归属依据** |
| `statusHistory[].{status,at,by}` | 同上 | 每次状态推进追加 | 判"谁在窗口内被关过" |
| `stageKind` | 同上 | 模板生成 | 子卡阶段（dev/review/test/…） |

**实证**：`REQ-261001154450-b918/queue.json` 48 条记录中 38 条带 `parentId`，
真实数据确认该字段在生产数据里存在（不是只在新代码里）。
**不追溯**：存量记录缺 `parentId` 时按"非子卡"处理（保守：仍计入节流）。
