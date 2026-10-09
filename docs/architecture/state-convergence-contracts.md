---
title: 状态收敛点与回执/读数契约
updated: 2026-10-08
source: REQ-261008011118-defe
---

# 状态收敛点与回执/读数契约

> **TL;DR**：本仓把「状态合法性 / 角色判定 / 闸门 / 读数域界」都收在**单点**。
> 收敛点本身很少出错，出错的是**它的第二个、第三个调用方忘了传参数**，以及**可选字段被写成 `undefined`**。
> 本文沉淀 2026-10-07 那批边界 bug（H1 / H2-role / M2 / M6）与 2026-10-08 那批中危项
> （M1 死字段 / M3 批量防线 / M4 两段写补偿 / M5 认领时序）的机制性根因与防回归判据。

## 为什么需要它（四个共享同一种根因的缺陷）

| 缺陷 | 表面症状 | 机制性根因 |
|------|---------|-----------|
| H1 | 弹框选「需要修改」不留反馈 → 工具层抛 `value is not lossless JSON` | 回执把可选字段写成 `user_feedback: undefined`；无损 JSON 契约要求**键缺席** |
| H2-role | 看板把子卡推进 `integrating/testing/in_review`，卡死 | `transitionTask` 有 `role` 参数（决定用哪张转移表），但 HTTP 面这个调用方没传 → 缺省 `legacy` |
| M2 | agent 能撤销人刚做的取消（`canceled → draft`） | 人工门集合收齐了「去取消」，漏了它的**逆动作**「复活」 |
| M6 | 节流拒绝文案出现「还要等 90 秒」 | 读数只兜了下界（`> 0`），没兜上界；`h.at` 在未来时溢出 |

四条的共同点：**判据是单点的，但单点的"边界"没有覆盖全部调用方 / 全部取值**。

## 契约 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

### 1. 收敛点：每个调用方都要把「角色/身份」传全（H2-role 的教训）

- 任务状态只能经 `transitionTask`（`src/application/internal/task-transition.ts`）改变；
  它按 `role`（`subtask` / `parent` / `legacy`）选转移表，缺省 `legacy`。
- **缺省值是给存量调用方的兼容，不是给新调用方的省事**：新调用方必须显式传 `role`。
  角色判定用**单源** `roleOfTask(task, tasks)`（与工具面 `MoveTask.roleOf` 同口径）。
- 防回归判据：**起点必须选在两张表的分叉点**上。`todo → integrating` 在两张表里都非法
  （用它做用例，修前修后都绿 = 假测）；真正能测出漏传 `role` 的是 `in_progress → integrating/testing`。
  用例见 `tests/http-task-move-role.test.ts`（走真实 HTTP 处理器，病灶在路由层）。

### 2. 回执：可选键**缺席**，不写 `undefined`（H1 的教训）

- 降级/软回执的形状必须能通过**自己的 schema**。dsh-tools 的 `snapshotJsonValue` 对 `undefined`
  值必抛 `"value is not lossless JSON"`——把「未落章、未推进」的软回执变成无信息硬错误。
- 写法：`...(x.length > 0 ? { user_feedback: x } : {})`。
- 这是**同类事故的第二次**（第一次是 RunStatusTool 的 null 透传）：判断新回执时先问
  「这个形状能通过自己的 schema 吗」。

### 3. 闸门：破坏性动作与它的**逆动作**同门（M2 的教训）

- 需求侧 `HUMAN_ONLY_REQ_TRANSITIONS` 收齐了各阶段 `> canceled`，却漏了 `canceled > draft`；
  任务侧 `canceled > todo` 早就在门里——**不对称本身就是 bug**。
- 加门的口径：只影响 `actor !== 'human'`；**合法边表不动**（`canReqTransition` 仍为真），
  派生面（`agentNextActions`）自动跟随，无需手改。
- 加门后自检：`agentNextActions('canceled')` 不再含 `draft`。

### 4. 读数：对外返回的数值必须有**域界**（M6 的教训）

- `doneThrottleRemainingMs` 的契约是 `[0, throttleMs]`：下界有 `> 0` 兜底，上界必须显式 clamp。
- 时钟回拨 / 漂移 / 跨机写入会让 `h.at` 落在未来——**外部输入不可信**，读数先钳再用。
- 修读数而不是修数据：可逆、无写风险；数据侧不动。

### 5. 死字段：读数只报**有写入来源**的字段（M1 的教训）

- `reqboard_status` 的 run 节曾报 `stepIndex` / `currentSubtaskId` / `heartbeatAt`，
  而它们的写侧（`CheckpointManager.writeCheckpoint`）在生产代码**零调用方**——读一个永远没人写的字段
  ⇒ **恒报第 0 步**（静默错进度）。链只写 `advance.runId/lockAt/history`。
- 两条出路只有两条：**接上唯一写侧**，或**删字段连同死代码**。本次选删除（链是并行批次调度，
  单一"当前子卡"在批内不唯一，接上只能给部分假数据）；`advance.runId/lockAt` 是活锁，必须保留。
- **为什么测试没拦住**：用例自己把 `stepIndex` 种进 `advance` 再读回来（自种自读）。修法是把断言
  落在**字段集**上——"即使夹具种了遗产字段，run 节也必须不出现"（`tests/run-status-tool.test.ts`）。
- 判据：`grep -rn "stepIndex\|currentSubtaskId\|heartbeatAt" src --include=*.ts` 只剩解释性注释；
  `npx vitest run tests/run-status-tool.test.ts tests/unit/query-run-status.test.ts tests/unit/migration-v8.test.ts` 全绿。

### 6. 批量防线：同批可见性不许绕过**条数上限**（M3 的教训）

- 批量 `task_move` 用**冻结快照**判定（同批互不可见）⇒ 60s 节流在批内整批失效，
  单次调用可关满 `MOVE_BATCH_MAX = 20` 张顶层卡（实测 20 张全落）；逐卡凭证门是另一条防线，
  但它**不限制单次调用规模**。
- 修法 = 给可见性豁免加**条数上限**（`MOVE_BATCH_DONE_MAX = 3`，只数非子卡、且已过凭证门的项），
  超出项复用既有 `REQBOARD_BULK_CLOSE` 结构 + `throttleRemainingMs` + 顶层 `guidance`。
  与"父卡并发上限按批内累计"同一手法：**不是改判据，是让判据在批量语义下仍然成立**。
- 为什么不选"批内计节流"：那等于"一批只能关 1 张"，会推翻小批可用性（上一版 `FR-5` 的取舍）。
- 判据：`npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` 全绿
  （20 张 → 落 3 张；同批 ≤3 不触发；跨批触发；子卡豁免）。

### 7. 跨存储两段写：第二段未落账必须**归还第一段**（M4 的教训）

- 回退落库跨两个存储（队列 / 台账），顺序契约 **I-11 = 任务先写、需求后写**本身是对的
  （任务写失败 ⇒ 需求未动，干净）；缺口是**第二段未落账时对第一段的归还**：
  需求写抛错、或并发漂移让回调 no-op，都会留下"卡已取消/已物化、需求没退"的半成品。
- 补偿口径（单点 `application/internal/rollback-compensation.ts`）：
  ① 写前在**同一份 mutate 快照**里逐卡留档（`rememberRollbackPreImage`）；
  ② 归还只恢复**本次写面九字段**（不整卡替换，避免抹掉并发写入者改的其它字段），
  可选字段按「本前缺省 ⇒ 删键」恢复（前向写入可能新增了键）；
  ③ 移除本轮物化的重做卡；④ 归还失败**响亮**（`REQBOARD_ROLLBACK_COMPENSATION_FAILED` + 台账留痕点名卡 id）。
- 同一类事故的另一半：落库白名单必须搬 `statusHistory` 与 `version`（此前只搬四字段 ⇒
  「复位子卡看不到原地复位事件」「取消卡无 canceled 事件」「version 不 +1」）。
- 判据：`npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts` 全绿
  （含注入抛错 / 注入漂移两臂 + 事件与 version 断言）。

### 8. 认领时序：先认领后执行（M5 的教训）

- 子卡 `in_progress` 曾写在 run **结束之后**，原始动机是"凭证门基准要早于子代理写文件"；
  该动机已被 `chainBaselineOf`（需求/父卡/子卡 `createdAt` 最小值）取代，代价留下：
  整个 run 期间卡仍是 `todo` ⇒ 第二路（另一次投递 / 手动入口）会**再派一次**（实测 `workflow.start` ×2）。
- 修法 = `claimSubtask` 放在**全部门禁之后、派发之前**；并发第二路看到新鲜 running 执行即拒
  （`REQBOARD_SUBTASK_IN_PROGRESS`，阈值复用孤儿 `LIMITS.orphanTimeoutMs`，不新增阈值）；
  陈旧/无 running 执行按既有孤儿口径**接管**（先闭合陈旧执行为 failed，不 bump attempt）。
- **认领后每一条失败出口都必须归还**：统一经 `failure-handling.rollbackSubtask`
  （回 todo + `attempt+1` + `revisions(rollback)` + 失败评论 + 闭合 running 执行）——
  修前跨卡覆盖那条出口完全不归还，且 ExecuteTask 还持有一份内联第二实现。
- 判据：`npx vitest run tests/execute-task.test.ts tests/concurrency-limits.test.ts` 全绿
  （并发只跑一次 / 凭证门与跨卡覆盖两出口归还 / 孤儿接管）。

## 判据（可跑）

| 断言 | 命令 | 通过条件 |
|------|------|---------|
| 子卡经看板不可进中段非法态 | `npx vitest run tests/http-task-move-role.test.ts` | 4 例全绿（且**移除 `role` 传参必红**） |
| 否定回执无损 | `npx vitest run tests/ask-confirm.test.ts` | 13 例全绿（键缺席 + 递归无 `undefined`） |
| 复活边与取消同门 | `npx vitest run tests/domain/requirement-status.test.ts` | 10 例全绿 |
| 节流读数值域 | `npx vitest run tests/done-throttle-guidance.test.ts` | 9 例全绿（未来时间戳 ≤ throttleMs） |
| run 节不再报死字段 | `npx vitest run tests/run-status-tool.test.ts` | 7 例全绿（夹具种入遗产字段也不出现） |
| 批内 done 条数上限 | `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` | 27 例全绿（20 张 → 落 3） |
| 回退两段写可归还 | `npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts` | 全绿（注入抛错/漂移两臂 + 事件/version） |
| 子卡并发只跑一次 | `npx vitest run tests/execute-task.test.ts tests/concurrency-limits.test.ts` | 全绿（`workflow.start` = 1；两出口归还） |

## 不在本页范围

- HTTP 面的 **actor 鉴权**（本地进程仍可伪造 `actor:'human'`）：需独立的小型设计；
  本页只保证「角色判定」不漏传，不保证「身份不可伪造」。
- 跨进程写锁：需先裁决部署拓扑（单进程假设是否成立）。
