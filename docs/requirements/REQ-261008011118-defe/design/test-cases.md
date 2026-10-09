---
requirement_id: REQ-261008011118-defe
title: "第五批中危 bug 修复 · 测试用例"
status: design
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 设计说明 · 测试用例（REQ-261008011118-defe）

> `design/fix-design.md`（已确认设计）的用例视角补充件。每条用例都落到**真实测试文件**，
> 并给出「先红 → 后绿」两段读数（红读数通过临时还原 HEAD 版生产文件取得，恢复后 diff 逐字一致）。
> 修复类卡的红读数均来自**新增断言本身**，不是把既有断言改绿。

## 用例总览 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

| 用例 id | 覆盖条款 | 文件 | 断言要点 | 先红读数 | 后绿读数 |
|---|---|---|---|---|---|
| TC-B1-1 | BUG-1 | `tests/run-status-tool.test.ts` | run 节键集**不含** `stepIndex`/`currentSubtaskId`（夹具故意种入遗产字段） | 2 failed / 5 passed | 7 passed |
| TC-B1-2 | BUG-1 | `tests/run-status-tool.test.ts` | 无 `advance.runId` ⇒ `runId` 整键省略 + 过自身 schema | 同上（同一批） | 7 passed |
| TC-B1-3 | BUG-1 | `tests/unit/query-run-status.test.ts` | 用例级同断言（读到遗产字段也不回报；`'stepIndex' in result === false`） | 同批红 | 全绿 |
| TC-B1-4 | BUG-1 | `tests/unit/migration-v8.test.ts` | 带已删死字段的历史记录仍可加载（不迁移、不读） | 同批红 | 全绿 |
| TC-B2-1 | BUG-2 | `tests/done-throttle-guidance.test.ts` | 单批 20 张顶层卡 → 落账 3 张，其余 17 项 `REQBOARD_BULK_CLOSE` + `throttleRemainingMs ∈ (0,60000]` | 2 failed / 9 passed（20 张全落） | 11 passed |
| TC-B2-2 | BUG-2 | `tests/done-throttle-guidance.test.ts` | 边界：单批 4 张 → `[true,true,true,false]` | 同批红（4 张全落） | 11 passed |
| TC-B2-3 | BUG-2 | `tests/done-throttle-guidance.test.ts` | 既有口径保绿：同批 3 张不触发 / 跨批触发 / 子卡豁免 | — | 11 passed |
| TC-B3-1 | BUG-3 | `tests/move-rollback.test.ts` | 正常回退后：取消卡 `statusHistory` 末条 `canceled`、复位卡含原地复位事件、两类 `version` 1→2 | 5 failed / 38 passed | 全绿 |
| TC-B3-2 | BUG-3 | `tests/move-rollback.test.ts` | 需求写抛错 → 队列逐字段回到回退前（JSON 相等）+ 需求 status 未变 + 消息含「补偿成功」 | 同批红 | 全绿 |
| TC-B3-3 | BUG-3 | `tests/move-rollback.test.ts` | 漂移 no-op → `REQBOARD_CONFLICT` + 同样归还 | 同批红 | 全绿 |
| TC-B3-4 | BUG-3 | `tests/move-rollback.test.ts` | 补偿失败 → `REQBOARD_ROLLBACK_COMPENSATION_FAILED` + 点名受影响卡 + 需求留痕 | 同批红 | 全绿 |
| TC-B3-5 | BUG-3 | `tests/canceled-task-trail.test.ts` | 端到端落盘补 `statusHistory`/`version` 两条（防「plan 写了、白名单丢了」） | 同批红 | 20 passed |
| TC-B4-1 | BUG-4 | `tests/execute-task.test.ts` | 并发两路同一张 todo 子卡 → `workflow.start` 恰 1 次；第二路 `REQBOARD_SUBTASK_IN_PROGRESS` | 4 failed / 33 passed（start ×2） | 27 passed |
| TC-B4-2 | BUG-4 | `tests/execute-task.test.ts` | 凭证门失败 → 回 todo + `attempt+1` + 执行闭合 failed + `revisions(rollback)` + 失败评论 | 同批红 | 27 passed |
| TC-B4-3 | BUG-4 | `tests/execute-task.test.ts` | 孤儿接管：陈旧 running 执行 → 允许接管且陈旧执行闭合 `failed`（`stale claim takeover`） | 同批红 | 27 passed |
| TC-B4-4 | BUG-4 | `tests/concurrency-limits.test.ts` | 跨卡覆盖出口 → 归还（`attempt=1` + 执行闭合 failed + rollback 修订） | 同批红 | 全绿 |
| TC-B5-1 | BUG-5 | `tests/error-code-registry.test.ts` 等 | 新码已注册、清单双向一致、tier 已勘定、prompt 面码 ⊆ 注册表 | — | 7 文件 / 73 用例全绿 |
| TC-B5-2 | BUG-5 | `tests/output-contract.test.ts` | 工具全部 return 分支键均已声明（补偿 helper 抽件后无内部返回误收） | 曾红（见偏离 D-2） | 36 passed |
| TC-B5-3 | BUG-5 | `tests/prompt-cost.test.ts` 等 | 描述文案改动未破提示词字数基线 | — | 全绿 |

## 命令与范围 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

- **单卡验收命令**（同批复跑读数）：13 个测试文件 / 190 用例全绿
  （`run-status-tool`、`unit/repository-extensions`、`output-contract`、`done-throttle-guidance`、
  `task-move-batch`、`move-rollback`、`canceled-task-trail`、`execute-task`、
  `t12-queue-readonly-ordering`、`advance-parallel`、`concurrency-limits`、`error-code-registry`、
  `error-code-inventory`）。
- **邻域回归**（每卡各一组，防扩散）：BUG-1 → 19 文件 / 227 用例；BUG-2 → 10 文件 / 147 用例；
  BUG-3 → 8 文件 / 160 用例；BUG-4 → 16 文件 / 142 用例（含 `failure-handling` 由红转绿）。
- **全量**：`npx tsx scripts/test-baseline.mts --check` → 本次失败 23 / 基线 68；新增 7 / 不再失败 52；
  `npx tsc --noEmit` → error TS 0。
- **仓库门**：`pnpm kb:check` → K7/K9 零漂移 ✅（其余 3 项见偏离 D-1）。

## 偏离记录（测试面） <!-- serves: BUG-5 -->

| 编号 | 偏离 | 定性 |
|---|---|---|
| D-1 | `pnpm kb:check` 未达「退出码 0」：余 K1（INDEX.md 超限，HEAD 版即超）、K3（conventions.md 222 行 > 200，文件未修改）、K14（kb-0064/0065 待刷基线，条目未修改） | 均为 HEAD 既存 / 他窗改动；按边界不代改不代刷（证据见 `tests/fix-evidence.md`） |
| D-2 | 本需求 BUG-3 实施中途引入过一条契约红（补偿 helper 的内部 return 字面量被 output-contract 扫描器误收 + `MoveRequirement.ts` 涨到 408 行破尺寸门） | **当场修掉**：补偿逻辑抽成单点模块（`internal/rollback-compensation.ts`），`MoveRequirement.ts` 回到 357 行、扫描器干净 |
| D-3 | 全量集合差「新增 7 条」全部落在 `tests/kb-ensure.test.ts` | 顺序相关：单跑 11/11 绿、与知识层家族同跑 55/55 绿、与本需求全部测试文件同跑 150/150 绿；该文件与其被测模块均未被改动 ⇒ 非本需求引入（不代刷基线） |

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：19 条用例逐条先红后绿读数 + 命令与范围 + 3 条偏离记录 | session-9574f815 |
