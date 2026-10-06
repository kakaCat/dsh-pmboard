---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 测试策略与用例（REQ-261005122915-9f90）

> 原则：**先写能红的判据**。本缺陷之所以能悄悄发生，是因为既有用例只覆盖了
> 「回退物化」与「清场」两端，**没有一条**覆盖「回退之后再落库」。

## 测试策略 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 层 | 手段 | 覆盖 |
|---|---|---|
| domain | 纯函数单测（占位卡判据 / 回退分流） | FR-1、FR-4 |
| application | 存储替身 + `landApprovedPlan` / `executeDecompose` / confirm-settle 编排 | FR-1、FR-2、FR-3 |
| http | 看板批准路由（`handlePlanDecision`）落库 + 推进判据 | FR-3 |
| client | 渲染字符串断言 + 动作通道断言 | FR-5 |
| 现场 | 对 REQ-261005105032-3b02 复演一次清场 → 重落库 | FR-1、FR-2、FR-5 |

## 核心判据用例（必须新增） `serves: FR-1, FR-2, FR-3`

新建 `tests/approved-plan-landing-rework.test.ts`：

1. **占位卡不再冒充已落库**：队列预置 N 张 `reworkOf` 非空的 `todo` 占位卡 + 一份已批准计划（M 张）→
   调 `landApprovedPlan` → `createdCount === M`、`alreadyLanded === 0`、`staleReworkCanceled === N`。
   （**修复前该用例必红**：现状返回 `createdCount === 0`、`alreadyLanded === N`。）
2. **真幂等仍成立**：连调两次 → 第二次 `createdCount === 0`、`alreadyLanded === M`、queue.json mtime 不变。
3. **非回退态不许重复落库**：需求在 `implementing` 且已有真卡 → 仍走幂等跳过（事故 B 防线不动）。
4. **落库真失败不推进**（`confirm-settle` 路径）：令覆盖门禁抛错且队列**只剩占位卡** →
   需求状态仍为 `decomposing`、台账出现失败系统评论（含恢复路径）、`advance.pausedReason` 有值。
5. **三入口同结果**：同一初始状态分别走手动 decompose / 弹框批准 / 看板批准 →
   三者的「真卡集合」一致（防再次漂移）。

## 回退物化用例 `serves: FR-4`

在 `tests/rollback-materialize.test.ts` 增补：

1. **第二轮回退**：队列含占位卡（`reworkOf` 非空、`todo`）→ 再回退一次 →
   占位卡状态为 `canceled`，**不得**回到 `todo`（现状会复位 → 该用例修复前必红）；
2. 占位卡不产生「重做卡的重做卡」（既有性质，回归锁定 `reworkDrafts` 仍为 0）；
3. 真子卡（`parentId` 非空）仍按既有规则复位为 `todo`（**不得**被本改动误伤）。

## 清场入口用例 `serves: FR-5`

- 服务端沿用 `tests/rollback-cleanup.test.ts`：补一条「连清两次 → 第二次 `canceled === 0`」（幂等）；
- 客户端新建 `tests/client-rollback-cleanup.test.ts`：
  1. `req.rollback` 有记录 → 操作条出现 `data-action="rollback-cleanup"` 且 `data-seq` 等于序号；
  2. `req.rollback` 缺失 → 操作条**不含**该按钮（不给点了必失败的假按钮）；
  3. `api.rollbackCleanup` 打到 `POST /dashboard/api/reqboard/req/rollback-cleanup` 且 body 形状正确。

## 逆验证（不许只跑正例） `serves: FR-1, FR-3`

1. **反例 A**：把 `liveRealCards` 换回「未取消即真卡」→ 核心用例 1 必须红（证明判据是用例真正在测的东西）；
2. **反例 B**：把 `cancelStaleReworkCards` 的调用从 `landApprovedPlan` 摘掉 → 用例 1 必须红；
3. **反例 C**：把推进判据改回「未取消任务数 > 0」→ 用例 4 必须红；
4. 全部用例在实际实现前先跑一次，记录「红」的证据（进验收材料的证据清单）。

## 可执行验收命令 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```
pnpm typecheck
npx vitest run tests/approved-plan-landing-rework.test.ts
npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts
npx vitest run tests/client-rollback-cleanup.test.ts
```
