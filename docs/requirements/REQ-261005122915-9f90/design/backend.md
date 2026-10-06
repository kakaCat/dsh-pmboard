---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 后端设计（REQ-261005122915-9f90）

> 本份只写服务端改动（application / domain / http）。客户端在 `frontend.md`。

## 改动清单（逐文件） `serves: FR-1, FR-2, FR-3, FR-4`

| # | 文件 | 改动 | 条款 |
|---|---|---|---|
| 1 | `src/domain/task/ReworkPlaceholder.ts`（新增） | `isReworkPlaceholder` / `liveRealCards` 纯函数（唯一判据处） | FR-1、FR-2、FR-4 |
| 2 | `src/application/internal/stale-rework.ts`（新增） | `cancelStaleReworkCards`：占位卡批量 `canceled` + `rollback` 修订；无候选不写盘 | FR-2 |
| 3 | `src/application/internal/approved-plan-landing.ts` | 回退态先收敛；幂等改用 `checkDecomposeIdempotency` + `liveRealCards`；返回体加 `staleReworkCanceled` | FR-1、FR-2 |
| 4 | `src/application/use-cases/Decompose.ts` | 删内联收敛块，改调 `cancelStaleReworkCards` | FR-2 |
| 5 | `src/application/internal/confirm-settle.ts` | 推进证据由「未取消卡数」换「真卡数」 | FR-3 |
| 6 | `src/http/routers/requirements.ts`（`handlePlanDecision`） | 推进条件收窄为「本次落了卡 或 真卡已在」 | FR-3 |
| 7 | `src/application/internal/rollback-tasks.ts` | `resetTasks` 过滤掉占位卡（它们保持 `canceled`） | FR-4 |
| 8 | `src/http/routers/requirements.ts`（`handleRollbackCleanup`） | **不动**（协议与纪律逐字保留） | FR-5 |

## 落库编排新顺序 `serves: FR-1, FR-2`

`landApprovedPlan` 内（顺序即语义，改动集中在此）：

```
① 计划已批准 / FR 覆盖硬门 / 取数（不变）
② rollbackTo = req.rollback?.to === req.status
③ rollbackTo !== undefined → await cancelStaleReworkCards(...)      ← 新增（FR-2）
④ 重读队列 → liveReal = liveRealCards(tasks)                        ← 判据（FR-1）
⑤ checkDecomposeIdempotency(req.status, liveReal, { rollbackTo })
     ├─ ok=false → alreadyLanded = liveReal.length；created: []
     └─ ok=true  → landPlanTasks(...)                               ← 真落库
⑥ 返回体带 createdCount / alreadyLanded（语义已收窄）/ staleReworkCanceled
```

**为什么先收敛再判定**：先判定会把占位卡算成「真卡已在」而短路；先收敛让「回退态」与
「非回退态的重复落库」自然分开——后者（事故 B 幽灵卡）仍被第 ⑤ 步拒死。

## 两条批准路径的推进判据 `serves: FR-3`

- **弹框批准**（`confirm-settle.ts`）：`landed.alreadyLanded > 0` 时仍按既有「已落库 → 仍推进」
  分支处理（G3 重弹框场景），但该分支的**证据**从 `taskCount > 0`（未取消卡数）换成
  `realTaskCount > 0`（真卡数）。两者皆 0 → 走既有「自动开跑失败」响亮路径：不推进 +
  系统评论（含恢复路径）+ `advance.pausedReason` + 告警。
- **看板批准**（`handlePlanDecision`）：仅当 `landed.createdCount > 0 || landed.alreadyLanded > 0`
  才推进 `implementing`；否则写失败评论、**不推进**（`landing.failed` 如实回给看板）。

**验收口径**：构造「队列只剩占位卡」+「覆盖门禁抛错」→ 需求状态必须仍为 `decomposing`。

## 回退物化的占位卡处置 `serves: FR-4`

`planRollbackTasks` 的三路分流改为：

| 卡 | 现行为 | 新行为 |
|---|---|---|
| 顶层真父卡 | `canceled` + 物化占位卡 | 不变 |
| 真子卡（有 `parentId`） | 复位 `todo`（保留子卡身份） | 不变 |
| **占位卡（`reworkOf` 非空）** | 被当子卡**复位 `todo`** → 永远清不掉 | **保持 `canceled`**（从 `resetTasks` 过滤掉） |

判据实现：`resetTasks` 的过滤加一条 `!isReworkPlaceholder(c)`；`canceled` 数组本就包含它们，
调用方（`MoveRequirement` 工具侧 / 看板 `req/move`）的写入路径无需改动。

## 回归风险 `serves: FR-1, FR-3`

1. **事故 B 防线**（`checkDecomposeIdempotency` 拒重复拆分）：本设计只**替换取数**（活卡 → 真卡），
   不放宽 `ok` 条件；非回退态且有真卡时仍拒。回归用例：core-case 3。
2. **看板批准的成功路径**：正常批准（无占位卡）时 `createdCount === M > 0` → 推进行为不变。
3. **清场入口**：本次零协议改动；仅客户端接线，服务端回归靠既有 12 条用例。
