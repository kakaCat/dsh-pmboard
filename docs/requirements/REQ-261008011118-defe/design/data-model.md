---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复 · 数据模型视角"
status: design
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 设计说明 · 数据模型视角（REQ-261008011118-defe）

> `design/fix-design.md`（已确认设计）的数据视角补充件：只写字段面的**增删与语义**，不引入新决策。
> **不改 schema、不迁移存量**：队列 `queue.json` 与需求台账结构不变（v9），本次只多写既有字段。

## 需求台账：`advance` 字段面 <!-- serves: BUG-1 -->

| 字段 | 处置 | 语义 / 依据 |
|---|---|---|
| `runId` | **保留（活字段）** | 链锁标识；认领时写、finally 清；`QueryRunStatus` 现直读它判"有没有 run 在跑" |
| `lockAt` | 保留（活字段） | 锁时刻 + 心跳续租 + stale 接管判据（`LIMITS.advanceLockStaleMs`） |
| `history` | 保留 | 推进事件日志（`AdvanceEvent[]`），断点续传与复盘的事实源 |
| `noopStreak` / `failureStreak` / `pausedReason` | 保留 | 停滞熔断与暂停原因 |
| `stepIndex` / `currentSubtaskId` / `heartbeatAt` | **删除** | 写侧 `CheckpointManager.writeCheckpoint` 在生产代码零调用方 ⇒ 读侧恒报默认值。类型（`AdvanceState`）、工具 schema（`StatusTool.run`）、读侧投影（`RunStatus`）三处同步删；**存量记录里的残留值不迁移、不清洗、不被读** |

连带的死代码删除（同一族）：`src/domain/checkpoint.ts`（`Checkpoint` 类型 + 5 个纯函数）、
`src/application/internal/checkpoint-manager.ts`（管理器类）、`RequirementRepository` 的
`updateRunState` / `readCheckpoint` / `clearCheckpoint`（零生产调用方）。

## 队列任务：回退写面（九字段） <!-- serves: BUG-3 -->

回退落库对任务卡的写入面从"四字段"扩到九字段，字段契约与 `transitionTask`（唯一状态收敛点）同源：

| 字段 | 值来源 | 说明 |
|---|---|---|
| `status` | 计划副本（`canceled` / `todo`） | 取消卡 → `canceled`；子卡原地复位 → `todo` |
| `statusHistory` | 计划副本（`recordStatus` 追加） | **修复点**：取消卡补 `{status:'canceled'}`；复位卡保留 `{status:'todo', reason:'…原地复位…'}`（修前被白名单丢掉） |
| `version` | `(t.version ?? 1) + 1` | **修复点**：状态迁移必 bump（与 `transitionTask` 同源） |
| `updatedAt` / `updatedBy` | 本轮回退的 `at` / actor | `updatedBy` 为**新增搬运项** |
| `revisions` | 计划副本（追加 `kind:'rollback'`） | 保持既有 append-only 语义 |
| `canceledAt` / `canceledBy` / `cancelReason` | 计划副本（`markCanceled`） | 逐键 `!== undefined` 判定保留：复位 ≠ 取消，不得抹掉该卡此前留痕（INV-D2） |

**补偿（写面归还）的对称口径**：归还时对可选字段采用「**本前缺省 ⇒ 删键**」——
前向写入可能给原本没有 `statusHistory` 的老卡**新增**了键，只赋值不删键就恢复不出"回退前逐字节相同"。
恢复只覆盖上表九字段，**不整卡替换**（并发写入者对该卡其它字段的改动不被一起抹掉）。

## 队列任务：执行记录（`executions[]`） <!-- serves: BUG-4 -->

| 项 | 修前 | 修后 |
|---|---|---|
| 认领时点 | run **结束后**（`in_progress` 才写） | **派发之前**（认领即开一条 `running` 执行 + start 快照） |
| born-failed | 引擎/凭证门当场失败 → 只落终止记录（不写 start） | 不再走该分支：起点快照在派发前真实取得 ⇒ 失败执行也有 start/end 与 delta（`openExecution` 的该能力保留给其它调用方） |
| 失败闭合 | 凭证门那条闭合为 failed；跨卡覆盖那条**不闭合** | 两条出口统一经 `rollbackSubtask`：闭合全部 `running` 为 `failed`（带 error）+ 回 `todo` + `attempt+1` + `revisions(rollback)` + 失败评论 |
| 孤儿接管 | 无（当时状态还没写） | `in_progress` 且最近 `running.startedAt` 早于 `LIMITS.orphanTimeoutMs` ⇒ 先闭合陈旧执行为 `failed`（error 含 `stale claim takeover`），再开新执行接管；**不** bump attempt |

## 错误码清单（新增 2 条 / 复用 2 条） <!-- serves: BUG-3, BUG-4, BUG-5 -->

| 码 | 语义 | 何时抛 | 清单登记 |
|---|---|---|---|
| `REQBOARD_SUBTASK_IN_PROGRESS` | 子卡已被另一路新鲜认领 | `claimSubtask` 判定 `age < LIMITS.orphanTimeoutMs` | `error-code-registry.ts`（layer=application）+ `error-code-inventory.json`（tier=fixture） |
| `REQBOARD_ROLLBACK_COMPENSATION_FAILED` | 回退补偿失败（队列未归还） | 需求侧未落账且归还写也失败 | 同上（tier=fault：需假 store 注入） |
| `REQBOARD_BULK_CLOSE` | 批量关卡被节流拦截（**复用**） | 批内非子卡 done 超上限 / 跨批 60s 节流 | 既有码，结构一字不改 |
| `REQBOARD_CONFLICT` | 并发冲突（**复用**） | 需求回退漂移 no-op（`req.status !== from`） | 既有码（另用于任务预算 CAS） |

清单口径：`npx tsx tests/drill/refresh-error-code-inventory.mts` 可重放（本需求连跑第二次零写盘＝幂等）；
`tests/error-code-matrix.test.ts` 的「零覆盖 ≤5」维持 5（两个新码都被各自用例覆盖，未放宽阈值）。

## 数据层与回滚 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

- **不改表、不改 schema、不迁移**：本次只多写既有字段（`statusHistory`/`version`/`updatedBy`）与删读侧死字段。
- **存量兼容**：老卡 `version` 按 `(t.version ?? 1) + 1` 起算；`advance` 里的遗留死字段留在盘上但不被读。
- **回滚方式**：四项各自落在不同文件集（t3/t4 共享注册表与清单，故 t4 依赖 t3），
  任一项可单独 `git checkout -- <该卡落点>` 回退；无不可逆副作用。
- **补偿幂等**：按卡 id 恢复确定值 + 按 id 删本轮物化卡，重复触发结果一致。

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：advance 字段面 / 回退九字段写面 / 执行记录状态迁移 / 错误码清单（验收前置件，无新决策） | session-9574f815 |
