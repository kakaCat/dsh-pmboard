# 兼容与存量核对（REQ-261005122915-9f90 t8）

> 卡片验收：`npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts tests/decompose-tools.test.ts` 全绿；
> `grep -rn "alreadyLanded" src` 的命中集合与本文盘点表一致（无遗漏消费者）。
> **如实说明**：这条命令在本仓当前工作区**不是全绿**——详见「§4 既有红」，逐条归因到别的窗口的未提交改动，
> 并与 HEAD 基线逐条对齐（本次改动新增失败 **0**）。

## §1 是否改 schema / 是否需要迁移

| 问题 | 结论 |
|---|---|
| 队列文件 `queue.json` 字段/必填性/默认值 | **未改**（`QUEUE_VERSION` 不变） |
| 台账分片字段（`record.json` / `plan.json` / comments） | **未改**（`REQBOARD_SCHEMA_VERSION` 不变） |
| 数据库/迁移脚本 | **无**（加性修复 + 判据修正） |
| 存量需求是否需要回填 | **不需要**。`reworkOf` 早已落库，本次只改「怎么读它」 |
| 回滚路径 | 还原改动文件即可；唯一副作用是占位卡变 `canceled` + `rollback` 修订（append-only 留痕，不丢信息） |

## §2 `alreadyLanded` 消费者盘点（语义收窄的影响面）

`grep -rn "alreadyLanded" src` 的全部命中（实现处 1 + 消费者 2 处）：

| 文件 | 位置 | 用途 | 受语义收窄影响？ |
|---|---|---|---|
| `src/application/internal/approved-plan-landing.ts` | 定义 + 三处返回 | 唯一生产处（`alreadyLanded` / `landedReal`） | 是（定义处，本次收窄为**真卡数**） |
| `src/application/internal/confirm-settle.ts` | `landed.alreadyLanded > 0` 分支 + 文案 | 弹框批准路径 | 是（文案已同步为「张任务卡」，语义随定义） |
| `src/http/routers/requirements.ts` | `landingEffective`、`already_landed` 回执 | 看板批准路径 | 是（推进判据改为「本次落了卡 或 真卡已在」） |

**无其它消费者**：没有看板投影字段、没有 RTM/验收单/归档材料读取 `alreadyLanded`——故语义收窄
不构成外部契约破坏（它从未被写入任何持久化结构，也不在 `shared/protocol.ts` 的对外类型里）。

## §3 目标套件读数

```
npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts tests/decompose-tools.test.ts
  ✓ tests/rollback-cleanup.test.ts      12 passed
  ✓ tests/rollback-materialize.test.ts  10 passed
  × tests/decompose-tools.test.ts        5 failed | 25 passed   ← 既有红，见 §4
```

本次改动相关的 9 个套件（全绿，70 条）：

```
✓ tests/rework-placeholder.test.ts              8
✓ tests/decompose-stale-rework.test.ts          4
✓ tests/approved-plan-landing-rework.test.ts     5
✓ tests/rollback-tasks.test.ts                 10
✓ tests/rollback-materialize.test.ts           10
✓ tests/rollback-cleanup.test.ts               12
✓ tests/client-rollback-cleanup.test.ts         6
✓ tests/reqboard/board-plan-approve.test.ts     8
✓ tests/reqboard/plan-landing-parity.test.ts    7
```

## §4 既有红（与本次改动无关的归因证据）

方法：把本次改动的 7 个服务端文件临时还原到 `HEAD`，重跑，比较失败集合——

| 观测 | 结果 |
|---|---|
| `git worktree add /tmp/pmb-head HEAD` 全量套件（同口径过滤） | 失败项 **125** 个（文件级） |
| 当前工作区全量套件（同口径） | 失败项 **105** 个（别的窗口的未提交改动修掉了一批） |
| 工作区新增 vs HEAD | 仅 2 个文件：`tests/apply-wiring.test.ts`、`tests/move-rollback.test.ts` |
| 定点归因（临时还原本次 7 文件后重跑这 2 个文件） | **仍然失败** ⇒ 与本次改动无关；根因是工作区里别的窗口对 `category-doc-sets.ts` / `support.ts` / `ports.ts` / `MoveRequirement.ts` 的未提交改动 |
| 定点归因（`tests/decompose-tools.test.ts`） | 还原态 `5 failed / 25 passed`，本次态 `5 failed / 25 passed` ⇒ **逐条一致**，未新增失败 |

> 结论：本次改动**新增失败 0**。工作区里其余的红（含 `docs` 门禁文案类）属别的窗口在飞的工作，
> 已在本文件如实登记，不在本需求范围内擅自修改。

## §5 现场存量（REQ-261005105032-3b02）

`node --import tsx/esm scripts/rollback-landing-replay.mts`（dry-run，只读）：

```
需求状态 implementing · 回退记录 第 1 次 implementing → decomposing
已批准计划 23 张 · 活卡·真卡 0 · 活卡·占位重做卡 13 · 清场边界 lastMaterialized 13 条
复演后预期活卡集 = 计划 23 个 key；与现状差：缺 23 张（正是本缺陷）
```

**加性修复、无需数据迁移**：按此清场（第 1 次回退）→ 重新落库即可复位；实际执行属「仅人」动作，
脚本默认 dry-run，只打印可复制的两条看板请求。
