# t-c7b3da 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/canceled-task-trail.test.ts tests/task-transition-guard.test.ts tests/rollback-tasks.test.ts tests/rollback-cleanup.test.ts` 全绿；断言：人取消一张卡后 `canceledAt` 为有限数字且 `=== statusHistory` 最近一条 `→canceled` 事件的 `at`、`canceledBy.kind === 'human'`、无会话时 `'sessionId' in canceledBy === false`、`cancelReason` 等于传入原文；真非人工路径取消后 `'canceledBy' in task === false`（且不出现 `kind === 'agent'`）；`reason === '   '` 时不写 `cancelReason`；超长原文逐字写入不被截断；复活后再取消时三字段等于**最新一次**取值；回退一次需求产生的每张取消卡 `canceledAt`/`cancelReason` 都有值；`pnpm typecheck` 退出码 0。

## 实施方案（implementation）
① 改 `src/shared/protocol.ts`：`TaskRecord` 增三个**加性可选**字段 `canceledAt?: number`、`canceledBy?: { kind: 'human'; sessionId?: string }`、`cancelReason?: string`（注释写明：语义=**最近一次取消**（覆盖式）、缺省=**未采集**、不 bump `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1）、**不加进** `REQUIRED_TASK_FIELDS`）；在既有 `recordStatus` 旁新增**唯一写入口** `markCanceled(task: TaskRecord, opts: { at: number; by: ActorRef; reason?: string }): void`——就地写：`task.canceledAt = opts.at`；仅当 `opts.by.kind === 'human'` 才写 `task.canceledBy = { kind: 'human', ...(sessionId !== undefined ? { sessionId } : {}) }`（真非人工路径**整字段不写** + `console.warn`，不写 `kind:'system'` 之类替身值）；`opts.reason` 的 `trim()` 非空才写 `cancelReason`（不设硬上限）；**不做 IO、不返回新对象、不落盘**。② `src/application/internal/task-transition.ts` 的 `transitionTask`：`to === 'canceled'` 时在 `task.status = to` 同一处调 `markCanceled(task, { at: opts.at, by: opts.actor, reason: opts.reason })`（同对象、同一次写事务；`assertTaskTransition` 失败路径不改任何字段）。③ 三个批量直写点同款接线（都在 `copy.status = 'canceled'` 的相邻行）：`src/application/internal/rollback-tasks.ts` 的 `planRollbackTasks`、`src/application/internal/stale-rework.ts` 的 `cancelStaleReworkCards`、`src/application/internal/rollback-cleanup.ts` 的 `planRollbackCleanup`——`at` 取该批动作的 `now`（同批同一值）、`by` 取**触发该批动作的人**、`reason` 取**该批动作的原因**（如「回退重拆」，不是逐卡理由）。**复活（`canceled → todo`）不清空三字段**（本卡不加任何清空逻辑）；`HUMAN_ONLY_TASK_TRANSITIONS` 与 `assertTaskTransition` 一字不改。④ 新增 `tests/canceled-task-trail.test.ts`：写侧四条形态（人工取消 / 非人工不写 / 空白 reason 不写 / 复活不清空）+ 与 `statusHistory` 同源同刻 + 批量取消整批有值。验证：`npx vitest run tests/canceled-task-trail.test.ts`。依据 design/data-model.md §1/§7 与 backend.md §取消留痕写侧。

## 上游产出摘要（dependsSummary）
- 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T17:02:56.587Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t3 收口：取消动作从此留下「谁/何时/为什么」，且保证真的落盘——顺带堵掉三处会让新字段静默消失的白名单缺口。

### 完成项

- 取消时记下谁/何时/为什么：唯一写入口 + 四个写入点，加性可选字段零迁移
- 补掉三处会静默丢弃字段的白名单缺口（含看板侧 http 那一行）
- 非人工触发不编造 canceledBy；空白原因不写；原文不截断
- 20 条用例 + 8 条逆验证必红 + 全仓穷尽排查（无第四处）
- 如实登记一条原型口径冲突：canceledBy 仅人工触发时非空

### 改动文件

- `src/shared/protocol.ts`
- `src/application/internal/task-transition.ts`
- `src/application/internal/rollback-tasks.ts`
- `src/application/internal/stale-rework.ts`
- `src/application/internal/rollback-cleanup.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/application/use-cases/RollbackCleanup.ts`
- `src/http/routers/requirements.ts`
- `tests/canceled-task-trail.test.ts`

### 下一步

t8 客户端展示面与 t10 迁移兼容（依赖已解锁）

---
