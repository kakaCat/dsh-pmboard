---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复 · 接口视角"
status: design
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-4, BUG-5]
---

# 设计说明 · 接口视角（REQ-261008011118-defe）

> `design/fix-design.md`（已确认设计）的接口视角补充件：只写**对外/对内签名与契约的变化**。
> 本需求无 HTTP 路由新增、无前端组件改动（`sides: [backend]`）。

## 接口清单 <!-- serves: BUG-1, BUG-2, BUG-4, BUG-5 -->

| 接口 id | 接口 / 签名 | 变化 | 兼容性 |
|---|---|---|---|
| IF-1 | `reqboard_status` 的 run 节（工具输出，`StatusTool.run`） | 删 `stepIndex` / `currentSubtaskId` 两个 property | `additionalProperties:false` 不变；键整体省略仍是合法形状；无存量客户端消费这两键（`grep src/client` 零命中） |
| IF-2 | `queryRunStatus(params): Promise<RunStatus>`（use-case） | `RunStatus` 删 `stepIndex`/`currentSubtaskId`；`runId` 改为直读 `requirement.advance?.runId` | 返回体仍满足 `StatusTool` schema；`QueryState` 用 `{requirement_id, ...status}` 摊开，自动跟随 |
| IF-3 | `reqboard_task_move(tasks[])` 的批量语义 | 单批**非子卡** `to=done` 最多 `MOVE_BATCH_DONE_MAX = 3`；超出项按既有 `REQBOARD_BULK_CLOSE` 结构返回（`code` + `throttleRemainingMs` + 顶层 `guidance`） | 回执键集零变化（`results[]` 只带声明过的 8 键）；单卡路径（≤1 张）不受影响；子卡豁免不变 |
| IF-4 | `reqboard_move`（回退方向）的错误面 | 新增 `REQBOARD_ROLLBACK_COMPENSATION_FAILED`（补偿失败）；漂移 no-op 抛 `REQBOARD_CONFLICT`（复用） | 前进方向回执整体不变；回退回执四键（`artifacts_revoked`/`plan_approval_revoked`/`tasks_canceled`/`tasks_reworked`）逐字不变 |
| IF-5 | `executeSubtask(deps, input)` 的失败面（内部用例；由自动链消费） | 新增拒绝码 `REQBOARD_SUBTASK_IN_PROGRESS`（并发第二路） | 其它失败码（`REQBOARD_SUBTASK_GATE`/`REQBOARD_CROSS_CARD`/`REQBOARD_TASK_NOT_FOUND`/`REQBOARD_NOT_SUBTASK`）不变 |
| IF-6 | `MOVE_BATCH_DONE_MAX`（新增导出常量） | `export const MOVE_BATCH_DONE_MAX = 3`（与 `MOVE_BATCH_MAX = 20` 同址） | 工具文案与用例都从它取数（无第二份字面量） |

## 新增内部签名（application 内部） <!-- serves: BUG-3, BUG-4 -->

```ts
// internal/rollback-compensation.ts（新增单点）
rememberRollbackPreImage(preImage: Map<string, TaskRecord>, card: TaskRecord): void
compensateRollbackQueue(input: {
  deps: UseCaseDeps; requirementId: string
  createdDraftIds: readonly string[]; preImage: ReadonlyMap<string, TaskRecord>
}): Promise<CompensationOutcome>            // { ok: boolean; detail: string }
raiseRollbackCompensationFailed(input: {
  deps: UseCaseDeps; requirementId: string; to: string
  cause: string; detail: string; affected: readonly string[]
}): Promise<never>                           // 永远抛（REQBOARD_ROLLBACK_COMPENSATION_FAILED）

// ExecuteTask.ts（模块内）
claimSubtask(deps, input: {
  taskId: string; requirementId: string; at: number; windowKey: string; sessionId?: string
}): Promise<{ code: string; message: string } | undefined>   // undefined = 认领成功
releaseFailedClaim(reason: string, code: string): Promise<void>  // 调 failure-handling.rollbackSubtask
```

## 契约面（agent 可见文案与错误码） <!-- serves: BUG-2, BUG-4, BUG-5 -->

- **工具描述文案**：`TaskMoveTool` 的 description 与 `tasks[]` 参数描述改为
  「同批的**非子卡**收尾最多 {MOVE_BATCH_DONE_MAX} 张互不触发 60 秒节流」；
  `MoveTask` 头注释与 `gateOne` 注释同句（复核时修掉头注释里残留的修前口径）。
- **拒绝文案**：批内超限给出「本批已收尾 N 张 / 单批上限 3 张 / 还需等待约 60 秒」+ 三条合规出路；
  并发认领给出「running 执行开始于 …ms 前 / 孤儿回收阈值 180000ms / 约 …ms 后由孤儿回收接管」+ 两条出路。
- **文案-代码一致性**：复核用 greps 断言（无「同批提交的卡互不触发」旧口径残留；run 节 schema 无两键）。

## 不新增的接口面 <!-- serves: BUG-1, BUG-2 -->

- 不新增工具、不新增 HTTP 路由、不新增配置项；不引入事务/文件锁/跨进程锁（H3 范围外）。
- 不改 `DoneEvidenceSpec` 的判据签名与语义；不改 `transitionTask` / `assertDoneEvidence` 的签名。
- 不改回退四键回执与 `results[]` 键集（验收单按现有键集核对即可）。

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：接口清单（6 项）/ 内部新签名 / 契约文案 / 不新增面（验收前置件，无新决策） | session-9574f815 |
