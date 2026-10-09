---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复 · 架构视角"
status: design
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 设计说明 · 架构视角（REQ-261008011118-defe）

> 本文件是 `design/fix-design.md`（已确认设计）的**架构视角补充件**：只做同一决策的视图切分，
> 不引入任何新决策、不改任何取值。验收前置文档（AC-7.5）之一。
> 四条修复各自独立可回滚：文件集互不重叠（t4 与 t3 共享错误码注册表/清单，故串行）。

## 四条修复在装配中的位置 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

```
                      ┌─────────────────────────── 工具面（agent 可见契约）───────────────────────────┐
  reqboard_status ───▶│ QueryRunStatus（run 快照：只报活字段 runId/jobStatus/nextReady/autoRun）      │
                      │  · 直读台账 advance.runId（链锁）——不再经 CheckpointManager（已删，BUG-1）    │
                      ├──────────────────────────────────────────────────────────────────────────────┤
  reqboard_task_move ─▶│ MoveTask：planMoveTasks（只读预检）→ applyMovePlans（一次 mutate 落笔）       │
                      │  · gateOne 内两层"让判据在批量语义下成立"的叠加：父卡并发上限 / 批内 done 上限  │
                      │    （MOVE_BATCH_DONE_MAX = 3，BUG-2）                                          │
                      ├──────────────────────────────────────────────────────────────────────────────┤
  reqboard_move ─────▶│ MoveRequirement：任务先写（队列）→ 需求后写（台账）                            │
                      │  · 第二段未落账 ⇒ internal/rollback-compensation 归还第一段（BUG-3）           │
                      ├──────────────────────────────────────────────────────────────────────────────┤
  reqboard_task_run ─▶│ AdvanceChain → ExecuteTask.executeSubtask                                     │
                      │  · claimSubtask（派发前认领）→ run → 凭证门 → 失败则 releaseFailedClaim（BUG-4）│
                      └──────────────────────────────────────────────────────────────────────────────┘
```

四条各自只动**一个收敛点**，不新增调用链、不新增数据源：

| 收敛点 | 位置 | 职责 |
|---|---|---|
| run 快照投影 | `application/use-cases/QueryRunStatus.ts` | 只从台账读活字段（`advance.runId`） |
| 批量落笔判定 | `application/use-cases/MoveTask.ts` 的 `gateOne` | 逐卡门禁 + 两层批内叠加（父卡开工数 / 非子卡 done 数） |
| 回退两段写归还 | `application/internal/rollback-compensation.ts` | 留档、归还、失败响亮（唯一实现处） |
| 子卡认领与归还 | `application/use-cases/ExecuteTask.ts`（`claimSubtask` / `releaseFailedClaim`） | 认领前置 + 失败出口统一归还（复用 `failure-handling.rollbackSubtask`） |

## 模块边界与依赖方向 <!-- serves: BUG-1, BUG-3, BUG-4 -->

- **domain 零 IO 纪律保持**：`domain/task/SubtaskTemplate`、`domain/workflow/DoneEvidenceSpec`
  等判定模块**零改动**；判据仍是唯一事实源（BUG-2 只改可见性叠加，不改判据）。
- **application 内部模块**：新增 `application/internal/rollback-compensation.ts`（补偿单点），
  依赖方向为 application → ports/domain，无反向依赖；`MoveRequirement` 只做装配（调用 + 参数组装）。
- **删除的死代码**：`application/internal/checkpoint-manager.ts` 与 `domain/checkpoint.ts`
  是"断点续传时代"的孤岛（写侧零调用方），删除后 run 状态只剩一条真相：台账 `advance`。
- **失败语义单一化**：子卡失败归还统一经 `failure-handling.rollbackSubtask`
  （修前 ExecuteTask 持有一份内联第二实现，正是两处口径分叉的来源）。

## 不动的边界（架构级不变量） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

| 不变量 | 依据 |
|---|---|
| I-11 顺序契约：任务先写 → 需求后写 → RTM 同步 | `tests/t12-queue-readonly-ordering.test.ts` 打点断言；BUG-3 只加补偿不调序 |
| `advance.runId/lockAt` 是链的**活锁**（stale 接管凭据） | `AdvanceChain.ts` 认领/清锁/heartbeat；BUG-1 明确保留 |
| 凭证门基准 = `chainBaselineOf`（需求/父卡/子卡 createdAt 最小值） | `internal/support.ts`；BUG-4 不改基准（`claimedAt` 只作老数据兜底） |
| 60s 节流判据在 `domain/workflow/DoneEvidenceSpec` | BUG-2 一行未改（跨批节流与子卡豁免口径不变） |
| 孤儿阈值 = `LIMITS.orphanTimeoutMs`（3min），回收器 `internal/orphan-collector.ts` | BUG-4 复用，不新增阈值 |
| 跨进程写无锁（H3）不在本需求 | 单进程 + 台账状态这一层的防线，不铺跨进程假设 |

## 部署与运行形态假设 <!-- serves: BUG-4, BUG-5 -->

- **本 profile 子卡执行引擎不可达**（`subtask_engine_unreachable`）：现实路径是 owner 窗口自证过凭证门
  （`reqboard_task_report` 写 filesChanged/completed）；本次四卡的"复现/修复/复核/回归"子卡即按此路径闭环。
- **多窗口共用同一工作树**：本需求落地时工作树含 194+ 改动文件（含未跟踪 260），
  故每张卡都做了"落点是否被他窗在飞改动"的复核与归属澄清（见 `reviews/`）。
- **知识层为生成物**：符号增删后必须 `kb-build --write` 重生成（本需求已重生成，K7/K9 零漂移）。

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：四条修复的装配位置 / 收敛点 / 不变量 / 运行形态（验收前置件，无新决策） | session-9574f815 |
