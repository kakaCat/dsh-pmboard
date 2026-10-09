---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复设计：M1 死字段 / M3 批内节流 / M4 两段写 / M5 并发双跑"
status: design
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 设计说明（REQ-261008011118-defe）

> 读者：实施者与验收人（零上下文可执行）。技术为主，每个二级章节带 `serves`。
> 本设计**只写怎么做**：不含任务表 / 任务 DAG / 拆分内容（归拆分阶段）。
> 每条结论都有 `文件:行` 依据或本次实测读数；四条各自独立可回滚。
> 需求侧条款见 `requirement.md`（BUG-1..BUG-5）；证据原文见体检报告 §2.2。

## 目标与范围 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

**目标**：把体检报告 §2.2 剩下的四条中危项各自在**一个收敛点**上收口，
每条带「先红 → 后绿」回归读数；不改判据本身、不动既有顺序契约、不做顺手重构。

**范围 = 四条，各自闭环**：

| 条款 | 缺陷 | 本设计的收口点 | 数据/契约面变化 |
|---|---|---|---|
| BUG-1 | run 快照进度字段恒 0 | **删除**死字段与其死代码（决策 DD-1） | `RunStatus`/工具 schema/`AdvanceState` 各少 2–3 键 |
| BUG-2 | 批内 60s 节流失效 | 批量入口加**批内非子卡 done 上限 N=3**（决策 DD-2） | 无新码、无 schema 变化；文案补一句 |
| BUG-3 | 回退两段写无补偿 + 事件丢失 | 需求侧未落账 → **队列补偿**；落库白名单搬 `statusHistory/version` | 队列写面扩到 `transitionTask` 的字段面 |
| BUG-4 | 子卡先执行后认领 | **认领前置** + 失败出口归还收敛到 `rollbackSubtask` | 新增 1 个错误码；执行记录语义微调 |

**需求阶段裁定落点**：`requirement.md` 的 **D-1**（范围 = M1/M3/M4/M5 四项、取舍写进设计）
由本文件「决策记录」的 **DD-1..DD-4** 逐条承接，并经 BUG-1..BUG-5 五个设计章节展开。

**与 `requirement.md` 的差异**：无范围修正；只把需求侧「二选一」的两处**钉死**
（DD-1 删除 / DD-2 限数量 N=3），并明确两个新增错误码的形态。

## 复现口径与本次实测读数 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

四条各自最小重现（2026-10-08 本窗口实测；命令与读数逐字见 `requirement.md` §复现步骤）：

| 条款 | 最小重现 | 修前读数 |
|---|---|---|
| BUG-1 | 造 `advance={runId:'run-live',lockAt:1,history:[…2 条…]}` → `queryRunStatus` | `{"runId":"run-live","stepIndex":0,…}`（`currentSubtaskId` 缺）；`grep -rn "writeCheckpoint(" src` 零生产命中 |
| BUG-2 | 20 张 in_review 顶层卡 + 1 张 todo；一次 `tasks=[20 项 to=done]` | 落账 done **20**、逐项 ok 全 true、`throttleRemainingMs=undefined` |
| BUG-3 | `planRollbackTasks` 纯函数读数 + 落库白名单对照 | 取消卡 `statusHistory=["in_progress","done"]`（无 canceled）、`version=1`；复位卡计划里有 `todo` 复位事件但白名单不搬；需求写无补偿 |
| BUG-4 | 两路并发调 `executeSubtask` 同一张 todo 子卡（BarrierRunner 让两路重叠） | `workflow.start` 调用 **2** 次；第二路跑到 done 门才撞 `invalid_transition done→done` |

**为什么 BUG-1 能长期躲在测试后面**（实施时必须一并纠正）：`tests/run-status-tool.test.ts:69`
把 `advance: { runId, stepIndex: 3, currentSubtaskId: 't-a' }` **直接种进夹具**——
测试自己写、自己读，于是「写侧无人调用」这件事在测试里永远看不见。
故 BUG-1 的回归断言必须落在**字段集**上（见 §回归测试落点），而不是"读回我刚种的值"。

## 决策记录（DD-1 / DD-2 / DD-3 / DD-4） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

需求侧把两处取舍留给设计，此处钉死；另附两处设计内决策。

### DD-1（BUG-1）：**删除**死字段，不接新写入点 <!-- serves: BUG-1 -->

| 方案 | 做法 | 否掉/选中的理由 |
|---|---|---|
| ① 接上调用方 | 在链推进处写 `stepIndex/currentSubtaskId/heartbeatAt` | **否**。① 链是**并行批次**调度（`AdvanceChain.ts:585-600` 的 `groupSubtaskEvents` + 组内 `Promise.all`），单一 `currentSubtaskId` 在批内不唯一，接上只能给"某一卡"，仍是部分假数据；② `stepIndex` 需新定义（本次调用序号？run 内序号？），而链已是**多轮投递**（每次 `driveChain` 重新计数），定义本身要新增语义；③ 代价是**每步多一次需求台账写**（链当前只写锁/历史），把热路径写放大；④ 读侧真正有价值的 `runId`/`nextReady`/`jobStatus` 已在，进度信息由 `reqboard_task_tree` 提供（子卡状态是权威） |
| ② 删除死字段 | 字段、schema、死代码、其单测一并删 | **选中**。写侧 0 调用方 ⇒ 该字段从来没有过真实值，删除 = 把契约改成事实；无新增写路径、无新语义、无假数据；回滚 = `git checkout` 两处文件 |

**保留边界（不能连坐删）**：`RequirementRecord.advance.runId` / `lockAt` / `history` / `noopStreak` /
`pausedReason` **全部保留**——`runId/lockAt` 是链的**活锁**（`AdvanceChain.ts:685-693`、stale 接管判据），
`history` 是推进事件日志，删了会破自动链。

### DD-2（BUG-2）：**限制批内非子卡 done 数量**，上限 `MOVE_BATCH_DONE_MAX = 3` <!-- serves: BUG-2 -->

| 方案 | 做法 | 否掉/选中的理由 |
|---|---|---|
| ① 批内仍计节流 | 让同批已判定通过的 done 项对后续项可见（同 `at` ⇒ 读数 ≈ 60s） | **否**。等价于「一次调用最多关 1 张」：直接推翻 REQ-261007100513-6749 FR-5 明写的「同批卡互不触发节流」（其设计取舍表已论证过"互相触发 = 批量必被拒"），要连带改工具文案 + `done-throttle-guidance.test.ts:68` + 该需求三份设计文档口径；把"合法关 3 张"也逼成 3 次调用 × 60s 等待 |
| ② 限批内 done 数 | 同一批内**非子卡** done 项最多 N 张，其余按既有 `REQBOARD_BULK_CLOSE` 结构拒 | **选中**。小批可用性不动（≤N 与既有测试锚点 `:68` 一致），把单次调用的绕过额度从 `MOVE_BATCH_MAX=20` 压到 N；不新造码、不新造结构；判据 `DoneEvidenceSpec` 一行不改 |
| N 取值 | 3 | 与既有测试「同批一次关 3 张」边界一致（避免为一处新语义改写既有断言）；单窗口 60s 内可关的上限由 20 → **3**；超出项拿到的是 `REQBOARD_BULK_CLOSE` + **确定等待毫秒** + 既有 guidance（含"交给自动链逐张关"这条合规路径） |

### DD-3（BUG-3）：**保序 + 补偿**，不调换写序 <!-- serves: BUG-3 -->

保留 I-11「任务先写、需求后写」（`t12-queue-readonly-ordering.test.ts:109` 打点钉死）。
调序会把失败现场换成「需求退了、旧卡还活着」，直接破坏重拆幂等与 `taskCompletenessGap`。
补偿是显式的跨存储归还：只恢复**本次写面**字段 + 撤销本轮新建的重做卡。

### DD-4（BUG-4）：认领前置；失败归还**复用** `rollbackSubtask` <!-- serves: BUG-4 -->

`failure-handling.ts:63` 的 `rollbackSubtask` 已经是「in_progress → todo + attempt+1 +
`revisions(rollback)` + 失败评论 + 闭合 running 执行」的唯一实现（`AdvanceChain.ts:632` 已在调它）。
`ExecuteTask.ts:650-656` 的内联块是它的第二份实现（也是 REQ-261008004324-81df 已点名的另案）。
本设计让 ExecuteTask 的失败出口**统一改调它**：一次改动同时完成「归还认领」与「合并第二份实现」。

## BUG-1 设计：删除 run 进度死字段 <!-- serves: BUG-1 -->

### 读侧新口径 <!-- serves: BUG-1 -->

`queryRunStatus` 不再经 `CheckpointManager`：直接读 `requirement.advance?.runId`
（与 `AdvanceChain` 的写侧同一字段、同源同刻）。`RunStatus` 收敛为：

```ts
export interface RunStatus {
  runId: string | null          // 保留：活的链锁标识
  nextReady: string[]           // 保留
  jobStatus: 'running' | 'completed' | 'failed' | 'not_found'  // 保留
  pauseReason?: string          // 保留
  autoRun: boolean              // 保留
  // 删除：stepIndex / currentSubtaskId（连同 CheckpointManager.readCheckpoint 调用）
}
```

`QueryState.ts:104` 用 `{ requirement_id, ...status }` 直接摊开 ⇒ 读侧改完即自动生效，
`runId` 非 string 时整键省略的既有降级保持不变。

### 删除清单（逐文件，职责一句） <!-- serves: BUG-1 -->

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/domain/checkpoint.ts` | **删文件** | `Checkpoint` 类型 + 5 个纯函数，全部零生产调用方 |
| `src/application/internal/checkpoint-manager.ts` | **删文件** | `CheckpointManager` 类（write/read/heartbeat/…）零生产写调用方 |
| `src/application/use-cases/QueryRunStatus.ts` | 改 | 删 `CheckpointManager` import 与 `checkpoint.stepIndex/currentSubtaskId`；`runId` 直读 `requirement.advance?.runId`；`RunStatus` 删两键 |
| `src/tools/StatusTool/StatusTool.ts` | 改 | run 节 schema 删 `stepIndex` / `currentSubtaskId` 两键（`additionalProperties:false` 不变，无迁移） |
| `src/client/types.ts` | 改 | `AdvanceState` 删 `currentSubtaskId` / `stepIndex` / `heartbeatAt` 三键 |
| `src/repositories/RequirementRepository.ts` | 改 | 接口与 `InMemoryRequirementRepository` 删 `updateRunState` / `readCheckpoint` / `clearCheckpoint` 与 `Checkpoint` import |
| `tests/unit/checkpoint-manager.test.ts` | **删文件** | 只测被删类本身 |
| `tests/unit/repository-extensions.test.ts` | 改 | 删 `readCheckpoint` / `clearCheckpoint` 两组 describe |
| `docs/knowledge/code-map*` | 重生成 | 符号删除后 `pnpm kb:build` → `pnpm kb:check` 退出码 0 |

### 存量数据处置（不迁移） <!-- serves: BUG-1 -->

`advance` 是开放对象：存量记录里的 `stepIndex/currentSubtaskId/heartbeatAt` **不迁移、不清洗**——
读侧不再读它们，写侧不再写它们，留着无副作用（若写进文档会造成"字段还在"的错觉，
故 `AdvanceState` 类型与工具 schema 必须先删）。同理不写任何迁移脚本。

### 回归断言（必须落在字段集上） <!-- serves: BUG-1 -->

`tests/run-status-tool.test.ts` 改为：
① 种入 `advance: { runId:'run-1', stepIndex:3, currentSubtaskId:'t-a' }`（**故意保留遗产字段**）→
断言 run 节键集 `= {requirement_id, runId, jobStatus, autoRun, …}`，且 `'stepIndex' in run === false`、
`'currentSubtaskId' in run === false`（遗产字段被忽略）；
② 无 `advance.runId` → `runId` 整键省略（既有降级不动）；
③ 返回值仍必须过自己的 schema（沿用 `assertConformsToSchema` 闸门）。

## BUG-2 设计：批内非子卡 done 上限 <!-- serves: BUG-2 -->

### 判定点与口径 <!-- serves: BUG-2 -->

- **位置**：`MoveTask.ts` 的 `gateOne`（`:570` 起），在 done 凭证门（`:630-660`）之后、
  通过项计数之前。`GateContext`（`:735` 构造，按**需求分组**每需求一个）新增内部字段
  `batchDoneCount: number`（初值 0）——与既有 `parentStarts` 同款"同批判定累计"手法。
- **计数条件**：仅当 `to === 'done'` **且** `role !== 'subtask'` **且**该卡已通过 `assertDoneEvidence`。
  子卡豁免沿用现有口径（`assertDoneEvidence` 对子卡早退，`support.ts:735-757`）；
  不合规的卡先按自己的门禁被拒（**不占额度**）。
- **上限**：`MOVE_BATCH_DONE_MAX = 3`，与 `MOVE_BATCH_MAX`（`:77`）同址导出；
  计数达到上限后，同批后续合格的非子卡 done 项一律拒。
- **顺序语义**：入参顺序先到先得（与逐项回执顺序一致，可解释）。

### 拒绝形状（复用既有结构，零新码） <!-- serves: BUG-2 -->

```
rejectPlan(plan.index, plan.windowKey, taskId, 'REQBOARD_BULK_CLOSE', <文案>, throttleMs)
```

- `throttleMs = deps.doneThrottleMs ?? DEFAULT_DONE_THROTTLE_MS`（= 60000，**确定读数**）；
- 文案形状照既有节流拒绝：点明"本批已关 N 张非子卡（上限 N）"+"还需等待约 X 秒"+
  既有三条合规出路（等待 / 推进子卡 / 交自动链），复用 `throttleGuidance` 的措辞风格；
- 顶层 `throttleRemainingMs` 与 `guidance` 由既有装配自动产出
  （`MoveTask.ts:1005-1010`：凡 results 里出现 `code==='REQBOARD_BULK_CLOSE'` 即生效），
  故**工具输出 schema 与回执键集零变化**。

### 不改的东西（回归护栏） <!-- serves: BUG-2 -->

- `DoneEvidenceSpec` 的判据（`findRecentAgentDoneTask` / `doneThrottleRemainingMs`）**一行不改**；
- 跨批节流、单卡路径、父子链收尾豁免、`MOVE_BATCH_MAX`、逐项"坏项不拖累好项"全部不变；
- 自动链的父卡收尾走 `finalizeParent`（不经 `gateOne`）⇒ 不受上限影响。

### 文案同步（必须与实现同批） <!-- serves: BUG-2 -->

- `src/tools/TaskMoveTool/TaskMoveTool.ts:99-100`、`:115-116`：把「同批提交的卡互不触发 60 秒节流」
  改为「同批**非子卡**收尾最多 N 张互不触发节流，超出部分按节流拒」；
- `src/application/use-cases/MoveTask.ts:26`、`:566`、`:688-695` 的注释同步同一句，
  避免注释与行为分叉（本仓"两套口径必然分叉"的教训）。

## BUG-3 设计：回退补偿与事件补齐 <!-- serves: BUG-3 -->

### 前置采集（任务写之前） <!-- serves: BUG-3 -->

在 `MoveRequirement.ts` 的回退分支（`:178-211`）：

1. `createdDraftIds: string[]` = `rollbackPre.taskPlan.reworkDrafts.map(t => t.id)`（本轮物化的重做卡）；
2. `preImage: Map<string, TaskRecord>`——在 `mutateQueue` 回调（`:191-209`）内，
   **逐卡在覆写前**做 `structuredClone(qt)`（只对 `canceledById` 命中的卡）；
   这份快照是补偿的唯一依据（比入口处的 `reqTasks` 更新，且与落笔同一份快照）。

### 触发条件（两个，缺一不可） <!-- serves: BUG-3 -->

需求侧"未落账"的两种形态都必须补偿：

| 形态 | 判据 | 处置 |
|---|---|---|
| 抛错 | `mutateIfPresent(...)` reject（store 写失败 / 域校验抛错） | 补偿 → 抛原错误（消息尾附补偿结论） |
| 漂移 no-op | 回调 `req.status !== from` 返回 `undefined`，或记录不存在 ⇒ `mutateIfPresent` 返回 `undefined` | 补偿 → 抛 `REQBOARD_CONFLICT`（复用已注册码，消息含 `from→当前 status`） |

### 补偿实现（一次队列 mutate） <!-- serves: BUG-3 -->

```
mutateQueue(deps, req0.id, (tasks) => {
  // ① 撤销本轮新建的重做卡（原本不存在 → 直接移除）
  // ② 对 preImage 命中的卡，恢复"本次写面"字段：
  //    status / statusHistory / version / updatedAt / updatedBy /
  //    revisions / canceledAt / canceledBy / cancelReason
  // ③ 无变更 → 返回 undefined（不写盘）
})
```

- **只恢复写面字段**（不整卡替换）：避免把并发写入者在这段时间对该卡其它字段的改动一起抹掉；
- **失败要响亮**：补偿自身抛错 → 抛 `REQBOARD_ROLLBACK_COMPENSATION_FAILED`，
  消息点名受影响卡 id + 补偿失败原因，并在需求台账 push 一条 `[回退补偿失败]` 评论
  （`deps.ids.comment()`）；成功时也把「队列已归还」写进抛出消息，便于事后核对；
- **不做**：不引入事务/文件锁（H3 范围外）、不改 I-11 顺序、不动 `rollback-revocation`（撤销半边）。

### 事件与 version 字段契约（与 `transitionTask` 同源） <!-- serves: BUG-3 -->

`rollback-tasks.ts` 的两类卡副本都补齐 `transitionTask`（`task-transition.ts:52-60`）的字段面：

| 卡类 | status | statusHistory | version | 其它 |
|---|---|---|---|---|
| 被取消（顶层父卡 / 占位重做卡） | `canceled` | 追加一条 `{status:'canceled', at:now, by:actor, reason}`（用 `recordStatus`） | `(t.version ?? 1) + 1` | 仍走 `markCanceled`（三字段口径与人工门不变） |
| 原地复位子卡 | `todo` | 保留既有 `{status:'todo', reason:'…原地复位…'}`（`:122-125`） | `(t.version ?? 1) + 1` | 不写取消三字段（复位 ≠ 取消，`INV-D2` 不变） |

- 为什么用 `recordStatus` 而不是直接 push：`protocol.ts:148-161` 的收敛点带"末条同状态同 at 不重复"
  的幂等保护，重复回退（既有 TC-8 幂等用例）不会重复堆事件；
- **落库白名单同步扩展**（`MoveRequirement.ts:191-209`）：从 `.map` 的副本搬
  `status, statusHistory, version, updatedAt, updatedBy, revisions, canceledAt, canceledBy, cancelReason`
  九项；三字段的逐键 `!== undefined` 判定**保留**（防复位卡被抹成 undefined）。
- 计划侧不走 `transitionTask` 的合法性校验（回退要吃掉任意在途状态，如 `done→canceled`），
  但**字段契约与它同源**——这是刻意的：只借字段面，不借状态机。

### 与既有测试的关系 <!-- serves: BUG-3 -->

`tests/canceled-task-trail.test.ts:265+` 已有「批量取消 · 端到端落盘（防 plan 写了、白名单丢了）」
一节——本设计在同一节补 `statusHistory`/`version` 两条断言（同一类事故形态的补全）。

## BUG-4 设计：先认领后执行 <!-- serves: BUG-4 -->

### 时序（before → after） <!-- serves: BUG-4 -->

| 点 | 修前 | 修后 |
|---|---|---|
| 认领（`in_progress` + `claimedAt` + 开执行记录） | run **结束之后**（`:561-588`） | run **派发之前**（`startedAt` 之后立刻） |
| 并发第二路 | 看到 `todo` → 再跑一遍（`workflow.start` ×2） | 认领 mutate 重读后看到 `in_progress` + 新鲜 running 执行 → **拒**（`REQBOARD_SUBTASK_IN_PROGRESS`） |
| 认领后失败 | 凭证门那条回 todo（`:652`），跨卡覆盖那条**不回**（`:549-556`） | 两条出口都归还（统一调 `rollbackSubtask`） |
| 崩溃留下的 `in_progress` | 不存在（当时还没写状态） | 超 `LIMITS.orphanTimeoutMs`（3min）被既有孤儿回收接管重派 |
| `claimedAt` | run 前取的 `startedAt`（`:462`） | 同值（不变） |

### 认领实现（一次队列 mutate，派发之前） <!-- serves: BUG-4 -->

在 `ExecuteTask.ts` 的 `const startedAt = deps.clock.now()`（`:462`）之后、`deps.workflow.start` 之前：

```
mutateQueue(deps, task.requirementId, (tasks) => {
  const t = tasks.find(x => x.id === task.id); if (!t) return undefined
  if (t.status === 'todo') {
    transitionTask(t, 'in_progress', { at: startedAt, actor, role: 'subtask' })
    t.claimedAt = startedAt; t.claimedBy = input.windowKey
    openExecution(t, { id, trigger: 'auto', at: startedAt, sessionId? }, snapshotForWindow(deps, sessionKey))
    return tasks
  }
  if (t.status === 'in_progress') {
    const running = t.executions.filter(e => e.outcome === 'running')
    const newest = 最近一条 running.startedAt
    if (newest !== undefined && startedAt - newest < LIMITS.orphanTimeoutMs) {
      throw Object.assign(new Error(<指引文案>), { code: 'REQBOARD_SUBTASK_IN_PROGRESS' })
    }
    // 孤儿接管：闭合陈旧执行 + 开新执行 + 更新认领
    closeExecutions(t, { at: startedAt, outcome: 'failed', error: 'stale claim takeover (orphan)' })
    t.claimedAt = startedAt; t.claimedBy = input.windowKey
    openExecution(t, { id, trigger: 'auto', at: startedAt, sessionId? }, snapshotForWindow(deps, sessionKey))
    return tasks
  }
  return undefined   // done / canceled 已在上游早退；其余状态由状态机拒绝
})
```

- 认领失败（拒/抛）→ **不派发**，按 `fail(...)` 返回（`REQBOARD_SUBTASK_IN_PROGRESS`）；
- 接管**不** bump `attempt`（attempt 只在失败归还时 +1）；
- 删除修后不再使用的 `openExecution(..., outcome:'failed')` born-failed 分支调用
  （`ExecuteTask.ts:577-586`）——`openExecution` 的 born-failed 能力本身保留（`token-usage.ts:153-170` 与单测仍在）。

### 失败出口归还（单一收敛点） <!-- serves: BUG-4 -->

新增局部函数（`ExecuteTask.ts` 内，不进 domain）：

```
releaseClaim(reason, code): Promise<void>
  → mutateQueue(deps, task.requirementId, (tasks) =>
      rollbackSubtask(tasks, task.id, deps.clock.now(), deps.ids,
        { category: code === 'REQBOARD_SUBTASK_GATE' || code === 'REQBOARD_CROSS_CARD' ? 'gate_failed' : 'run_failed',
          reason }))
```

调用点两处（覆盖认领后的**全部**失败出口）：
1. 跨卡覆盖早退（`:549-556`，`REQBOARD_CROSS_CARD`）——修前不回退，是本次新增的归还点；
2. done 门 catch（`:640-665`）——替换现有内联块（`:650-656`），行为等价 + 补齐
   `revisions(rollback)`、失败评论、`claimedAt/claimedBy` 清理（`failure-handling.ts:63-104`）。

**注意顺序**：归还必须在 `return fail(...)` **之前**完成（否则调用方读到的是"还在跑"的卡）。

### born-failed 语义变化（显式记档） <!-- serves: BUG-4 -->

修后认领即开 `running` 执行并写 start 快照 ⇒ 失败的执行**有 start/end 与 token delta**
（修前是 born-failed，`token-usage.ts:148-152` 不写 start）。
理由：起点快照在派发前真实取得，"没有可测执行段"的前提不再成立；
`closeExecutions`/`rollbackSubtask` 都会把 outcome 落成 `failed`，读数不假。

### 与自动链的边界 <!-- serves: BUG-4 -->

- 链对 `executeSubtask` 失败的处置（`AdvanceChain.ts:632` 的 `rollbackSubtask`）不变：
  状态已回 `todo` 时它幂等 no-op（`failure-handling.ts:64`），留痕由本设计的归还路径承载；
- 链自身的 `selectAdvanceBatch` 不新增判定：`in_progress` 新鲜卡在 step 2（要求 `todo`）天然不被选中，
  step 2.5 的孤儿回收按 3min 阈值接管；
- 凭证门基准 `chainBaselineOf`（`support.ts:674-705`）不动；`claimedAt` 仍是老数据兜底。

## BUG-5 设计：契约 / 文案 / 错误码 / 基线齐步 <!-- serves: BUG-5 -->

### 新增错误码（2 个，必须注册） <!-- serves: BUG-5 -->

| 码 | 语义 | 注册 | 清单 |
|---|---|---|---|
| `REQBOARD_SUBTASK_IN_PROGRESS` | 子卡已被另一路认领（在跑） | `src/shared/error-code-registry.ts`（按 code 字典序插入，`layer: 'application'`） | `npx tsx tests/drill/refresh-error-code-inventory.mts` 刷新 `tests/fixtures/error-code-inventory.json` |
| `REQBOARD_ROLLBACK_COMPENSATION_FAILED` | 回退补偿失败（队列未归还） | 同上 | 同上 |

复用码（不新增）：`REQBOARD_BULK_CLOSE`（BUG-2 超限）、`REQBOARD_CONFLICT`（BUG-3 漂移）。

### 文案与文档同步面 <!-- serves: BUG-5 -->

| 面 | 改什么 |
|---|---|
| `TaskMoveTool.ts:99-100,115-116` | 批量节流口径补"N 张上限"（BUG-2） |
| `MoveTask.ts:26,566,688-695` 注释 | 同上（注释与行为同批） |
| `ExecuteTask.ts:368-370` 头注释 | 「失败不改子卡状态」的过时表述改为"认领后失败统一经 `rollbackSubtask` 归还" |
| `StatusTool` 描述 | 无需改（run 节仍在，只是少两个字段） |
| `docs/knowledge/*` | `pnpm kb:build` 重生成 → `pnpm kb:check` 退出码 0（BUG-1 删符号） |

### 基线纪律 <!-- serves: BUG-5 -->

`tests/prompt-cost.test.ts` / `tests/prompt-baseline.test.ts` 若因文案字数触发，按"确认非本次引入
不许刷新、本次引入必须刷新并写理由"的既有纪律处置；**禁止改断言转绿**。

## 接口与数据契约（定死） <!-- serves: BUG-1, BUG-2, BUG-4, BUG-5 -->

| 变更项 | 契约 | 兼容性 |
|---|---|---|
| `RunStatus`（`QueryRunStatus.ts`） | 删 `stepIndex: number`、`currentSubtaskId?: string`；`runId: string \| null` 改为直读 `requirement.advance?.runId` | 工具输出 schema 同步删两键；`additionalProperties:false` 无需放宽 |
| `StatusTool.run` schema | 删 `stepIndex` / `currentSubtaskId` 两个 property | 键整体省略是既有合法形状 |
| `AdvanceState`（`client/types.ts`） | 删 `currentSubtaskId` / `stepIndex` / `heartbeatAt` | 看板未消费这三键（`grep src/client` 零命中） |
| 新码 ×2 / 复用码 ×2 | 见 BUG-5 节 | 逐项登记 + 清单刷新 |
| `MOVE_BATCH_DONE_MAX` | `export const MOVE_BATCH_DONE_MAX = 3`（`MoveTask.ts`） | 仅批量路径消费；单卡 ≤1 不受影响 |
| `GateContext.batchDoneCount` | 内部字段（按需求分组的同批计数） | 不外泄到回执（`toItemResult` 只取声明键） |
| 队列写面（回退） | 九字段：`status / statusHistory / version / updatedAt / updatedBy / revisions / canceledAt / canceledBy / cancelReason` | 全为既有 `TaskRecord` 字段，**无 schema 变更** |
| 子卡执行记录 | 认领即开 `running`（含 start 快照）；失败经 `closeExecutions`/`rollbackSubtask` 闭合为 `failed` | `ExecutionRecord` 结构不变 |

## 文件结构（新建 / 修改 / 删除） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

| 文件 | 动作 | 职责一句 |
|---|---|---|
| `src/domain/checkpoint.ts` | 删 | 死类型 + 死纯函数（BUG-1） |
| `src/application/internal/checkpoint-manager.ts` | 删 | 死管理器（BUG-1） |
| `src/application/use-cases/QueryRunStatus.ts` | 改 | run 快照只报活字段（BUG-1） |
| `src/tools/StatusTool/StatusTool.ts` | 改 | run 节 schema 去两键（BUG-1） |
| `src/client/types.ts` | 改 | `AdvanceState` 去三键（BUG-1） |
| `src/repositories/RequirementRepository.ts` | 改 | 去 checkpointer 接口与内存实现（BUG-1） |
| `src/application/use-cases/MoveTask.ts` | 改 | 加 `MOVE_BATCH_DONE_MAX` + `GateContext.batchDoneCount` + 超限拒绝；注释同步（BUG-2） |
| `src/tools/TaskMoveTool/TaskMoveTool.ts` | 改 | 批量口径文案补上限（BUG-2） |
| `src/application/internal/rollback-tasks.ts` | 改 | 取消卡补 canceled 事件；两类卡 version+1（BUG-3） |
| `src/application/use-cases/MoveRequirement.ts` | 改 | 前置采集 + 补偿 + 白名单搬满九字段（BUG-3） |
| `src/application/use-cases/ExecuteTask.ts` | 改 | 认领前置 + `releaseClaim` + 并发拒绝；头注释同步（BUG-4） |
| `src/shared/error-code-registry.ts` | 改 | 注册 2 个新码（BUG-5） |
| `tests/fixtures/error-code-inventory.json` | 改（脚本刷新） | 错误码清单跟随（BUG-5） |
| `tests/run-status-tool.test.ts` | 改 | run 节字段集回归（BUG-1） |
| `tests/done-throttle-guidance.test.ts` | 改/加 | 批内上限边界用例（BUG-2） |
| `tests/task-move-batch.test.ts` | 加 | 单批超限逐项回执形态（BUG-2） |
| `tests/move-rollback.test.ts` | 加 | 补偿（抛错/漂移两臂）+ 事件/version 断言（BUG-3） |
| `tests/canceled-task-trail.test.ts` | 加 | 端到端落盘补 `statusHistory/version`（BUG-3） |
| `tests/execute-task.test.ts` | 加 | 并发只跑一次 + 失败出口归还（BUG-4） |
| `tests/unit/checkpoint-manager.test.ts` | 删 | 随 BUG-1 删除 |
| `tests/unit/repository-extensions.test.ts` | 改 | 删两组 checkpointer 用例（BUG-1） |
| `docs/knowledge/code-map*` | 重生成 | 符号表跟随（BUG-5） |

## 数据层与回滚 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

- **不改 schema、不迁移**：队列 `queue.json` 与需求台账的结构不动（v9）；本次只多写既有字段
  （`statusHistory`/`version`/`updatedBy`），以及删掉读侧的三个死字段；
- **存量兼容**：老卡 `version` 缺省按 `(t.version ?? 1) + 1` 起算；`advance` 里的遗留死字段
  留在盘上但不被读（不写清洗脚本）；
- **回滚方式（逐项独立）**：四项各自落在不同文件集上，任一项可单独 `git checkout -- <files>`
  回退；无不可逆副作用（不删台账数据、不改历史）。BUG-1 的删文件回退 = 恢复两个源文件与两个测试文件；
- **补偿幂等**：补偿按"preImage 字段恢复 + 按 id 删新建卡"执行，重复触发结果一致（卡 id 唯一）；
  若补偿后用户重试，回退从干净现场重跑（与修前"任务写失败 ⇒ 需求未动"的干净语义一致）。

## 回归测试落点与判据 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

每条都必须**先跑出红读数**（与 §复现口径 一致）再修，命令与读数入任务卡。

| 条款 | 落点 | 断言（可执行） |
|---|---|---|
| BUG-1 | `tests/run-status-tool.test.ts`（改） + 删 `tests/unit/checkpoint-manager.test.ts` | run 节键集不含 `stepIndex`/`currentSubtaskId`（**即使 advance 里种了**）；`runId` 仍报；无 runId 时整键省略；过 schema 闸门。命令：`npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts tests/output-contract.test.ts` |
| BUG-2 | `tests/done-throttle-guidance.test.ts`（加） + `tests/task-move-batch.test.ts`（加） | ① 20 张顶层卡一批 → 落账 done = `MOVE_BATCH_DONE_MAX`，其余逐项 `code=REQBOARD_BULK_CLOSE` 且 `throttleRemainingMs ∈ (0,60000]`，顶层带 `guidance`；② ≤N 张仍全落（既有 `:68` 保绿）；③ 跨批仍触发（既有 `:131` 保绿）；④ 子卡批量仍豁免（既有 `:168` 保绿）。命令：`npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` |
| BUG-3 | `tests/move-rollback.test.ts`（加）+ `tests/canceled-task-trail.test.ts`（加） | ① 注入需求写抛错 → 抛错 + 队列**逐字段**回到回退前（卡仍 todo/in_progress、无重做卡）+ 需求 status 未变；② 注入漂移（回调看到 `status !== from`）→ `REQBOARD_CONFLICT` + 同样归还；③ 正常回退 → 取消卡 `statusHistory` 末条 `canceled`、复位卡含 `todo`（reason 含"原地复位"），两类 `version` 均 +1；④ 重复回退仍幂等（既有 TC-8）。命令：`npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts` |
| BUG-4 | `tests/execute-task.test.ts`（加） | ① 两路并发同一张 todo 子卡 → `workflow.start` 恰 **1** 次；第二路 `code=REQBOARD_SUBTASK_IN_PROGRESS` 且执行记录数不变；② 凭证门失败 → 回 todo + `attempt+1` + 执行闭合 failed + `revisions(rollback)` 在；③ 跨卡覆盖（`REQBOARD_CROSS_CARD`）→ 同样归还（修前不回退）；④ 孤儿接管：种一条 `startedAt` 早于 3min 的 running 执行 → 允许接管并把陈旧执行闭合为 failed。命令：`npx vitest run tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts` |
| BUG-5 | `tests/error-code-registry.test.ts` / `error-code-inventory.test.ts` / `error-code-matrix.test.ts` / `prompt-error-codes.test.ts` / `output-contract.test.ts` | 新码已注册且清单已刷新；prompt 面码 ⊆ 注册表；`pnpm kb:check` 退出码 0。命令：`npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts && pnpm kb:check` |

**收口口径**：上述集合全绿；`npx vitest run` 无**新增**红（他窗在飞引入的红逐条点名归属）；
四条各自一条"先红 → 后绿"读数入卡。

## 边界：不做什么 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

- **不改节流判据**（`DoneEvidenceSpec` 一行不改）；**不新造**批量拒绝码与回执结构；
- **不动 I-11 顺序契约**（任务先写、需求后写）与撤销半边（`rollback-revocation`）；
- **不动凭证门基准**（`chainBaselineOf`）与孤儿阈值（`LIMITS.orphanTimeoutMs = 3min`）；
- **不引入事务/文件锁/跨进程锁**（H3 未决，超 bug 档边界）；
- **不迁移存量数据、不写清洗脚本、不追改历史需求文档**；
- **不顺手重构**：不动 `AdvanceChain` 的调度、不动 `rollbackSubtask` 的既有字段契约
  （只把它复用为 ExecuteTask 的归还实现）、不合并 `MOVE_BATCH_MAX` 与上限常量；
- **不修** H1/H2/H3、L1–L7、M2/M6（前批已收或另案）。

## 风险与未决 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

| # | 风险 | 处置 |
|---|---|---|
| R1 | BUG-2 的 N=3 可能对"一次关 8 张"的合法窗口造成等待摩擦 | 已接受：节流本就是"设计内节奏"；拒绝文案给**确定等待毫秒** + 自动链这条零摩擦合规路径；若验收期实测摩擦过大，回退 = 调大 `MOVE_BATCH_DONE_MAX`（单点常量） |
| R2 | BUG-4 认领前置后，进程崩溃会留下 `in_progress` 卡直到 3min 孤儿回收 | 已接受：这是"双跑"的对价；接管走既有孤儿机制（无新阈值、无人工介入）；接管时不 bump attempt，失败归还才 +1 |
| R3 | BUG-3 补偿写入本身失败（磁盘/权限） | 响亮：`REQBOARD_ROLLBACK_COMPENSATION_FAILED` + 需求评论点名受影响卡 id；不做二次重试（避免掩盖真因） |
| R4 | BUG-1 删字段影响别窗在飞的读侧代码 | 本窗口实测 `grep src/client` 零命中；他窗若在飞新增读点，实施前重跑 `grep -rn "stepIndex\|currentSubtaskId" src` 复核并点名叫停，不代改 |
| R5 | 工作树有 234 条他窗在飞改动，可能与本设计的文件集重叠 | 每项实施前对目标文件做 `git status --porcelain` 复核；重叠即点名叫停，不代改、不回滚 |

## 修订记录 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：四项收口设计 + DD-1..DD-4 决策钉死 + 契约/文件/回归/数据层/边界 | session-9574f815 |
