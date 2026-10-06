---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 架构设计（REQ-261005122915-9f90）

> 需求文档：`docs/requirements/REQ-261005122915-9f90/requirement.md`（FR-1~FR-5）。
> 本份只写设计，不写拆分内容（那归 decomposing）。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：回退物化出的**占位重做卡**（`reworkOf` 非空）在两条批准落库路径上被当成「已落库的任务」，
于是新计划 0 张落库、状态却推进到实施。

**设计方案**：把「占位卡」从一个**隐含事实**升级为**一等判据**，并在三处收口：

```
              ┌─ 占位卡判据（domain 纯函数）  isReworkPlaceholder / liveRealCards
              │
落库幂等 ──────┼─ 幂等只看「真卡」  → 占位卡不再命中 alreadyLanded   （FR-1）
              │
回退态收敛 ────┼─ 单一实现 cancelStaleReworkCards
              │     ├─ 手动 reqboard_decompose
              │     ├─ 弹框批准（confirm-settle → landApprovedPlan）
              │     └─ 看板批准（handlePlanDecision → landApprovedPlan）  （FR-2）
              │
推进判据 ──────┴─ 只有「真卡在」才推进 implementing；否则响亮留痕不推进 （FR-3）
```

**不这么做的后果**：继续用「有任一未取消任务」当判据，任何「回退 → 重新批准」都会静默丢整批卡；
而占位卡在每个后续回退里被复位而非取消（FR-4），污染会累积且无法自愈。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 关注点 | 落点 | 改动性质 |
|---|---|---|
| 占位卡判据（纯函数） | `src/domain/task/ReworkPlaceholder.ts`（新增） | 新增单点 |
| 回退态收敛占位卡 | `src/application/internal/stale-rework.ts`（新增） | 从 `Decompose.ts` 内联块抽出 |
| 落库幂等 + 收敛调用 | `src/application/internal/approved-plan-landing.ts` | 判据替换 + 前置收敛 |
| 手动拆分路径改调单一实现 | `src/application/use-cases/Decompose.ts` | 删内联块、改调模块 |
| 弹框批准推进判据 | `src/application/internal/confirm-settle.ts` | 判据由「未取消卡数」换「真卡数」 |
| 看板批准推进判据 | `src/http/routers/requirements.ts`（`handlePlanDecision`） | 推进条件收窄 |
| 再次回退的占位卡处置 | `src/application/internal/rollback-tasks.ts` | `resetTasks` 过滤加一条 |
| 看板清场入口 | `src/client/api.ts`、`src/client/views/stage-detail.ts`、`src/client/board-mount.ts` | 新增调用 + 按钮 + 回执 |
| 清场 HTTP 协议 | `src/http/routers/requirements.ts`（`handleRollbackCleanup`） | **不动** |

## 单一实现收敛（三条落库入口） `serves: FR-2`

入口有三条，落库编排只有一份：

- 手动 `reqboard_decompose` → `executeDecompose` → `landPlanTasks`
- 弹框批准 → `confirm-settle` → `landApprovedPlan` → `landPlanTasks`
- 看板批准 → `handlePlanDecision` → `landApprovedPlan` → `landPlanTasks`

「回退态先收掉上一轮占位卡」此前只写在第一条（`Decompose.ts` 内联 mutateQueue）——这就是漂移点。
本设计把它抽成 `cancelStaleReworkCards`，**由两条落库编排各调一次**：
`approved-plan-landing` 覆盖批准两条入口，`Decompose.ts` 覆盖手动入口。

判据（`rollbackTo = req.rollback?.to === req.status`）沿用 `Decompose.ts` 既有口径，不改宽窄：
非回退态的重复落库仍由 `checkDecomposeIdempotency` 拒（事故 B 的幽灵卡防线不削弱）。

## 层级与依赖方向 `serves: FR-1, FR-2`

- 纯判据（`isReworkPlaceholder` / `liveRealCards`）放 **domain**：零外部依赖，application 与 http 都可用；
- 落库与收敛编排放 **application**：不允许 http 层自己再写一份判据（看板路径只调 `landApprovedPlan`）；
- client 只做「发请求 + 展示回执」：不复制服务端的跳过原因文案，逐条照原样展示。

## 不做什么（与需求边界对齐） `serves: FR-1, FR-3`

1. 不改 `RollbackSpec` 的阶段语义与物化规则（FR-4 只改「占位卡别再复位」这一条分流）；
2. 不改 `POST /req/rollback-cleanup` 协议、不新增 agent 可调用的清场工具（保持「仅人」）；
3. 不改队列文件与台账 schema——本设计全部是加性与判据修正，无数据迁移。
