# t-20f5dc 给批量收尾加非子卡 done 上限 N=3

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
给批量收尾加非子卡 done 上限 N=3

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① 20 张顶层卡一批 to=done → 落账 done = 3，其余逐项 code=REQBOARD_BULK_CLOSE 且 0 < throttleRemainingMs ≤ 60000，顶层带 guidance；② `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` → 全绿（既有同批 3 张、跨批、子卡豁免三条保绿）；③ `git diff --stat src/domain/workflow/DoneEvidenceSpec.ts` → 空（判据零改动）。

## 实施方案（implementation）
① `src/application/use-cases/MoveTask.ts`：新增导出常量 MOVE_BATCH_DONE_MAX = 3；GateContext 加 batchDoneCount（按需求分组、初值 0）；gateOne 在 done 凭证门之后判额度——只对 to==='done' 且 role!=='subtask' 且已过 assertDoneEvidence 的项计数，达上限后用 rejectPlan 以 code=REQBOARD_BULK_CLOSE + throttleRemainingMs=60000 拒绝（文案复用 throttleGuidance 措辞与三条合规出路），通过项计数 +1；② `src/tools/TaskMoveTool/TaskMoveTool.ts` 的批量口径文案补「同批非子卡最多 N 张」，`src/application/use-cases/MoveTask.ts` 头注释同步同一句（防注释与行为分叉）；③ `tests/done-throttle-guidance.test.ts` 与 `tests/task-move-batch.test.ts` 补超限用例，并保既有三条（同批 ≤3 全落、跨批触发、子卡豁免）绿。DoneEvidenceSpec 判据一行不改。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:40:29.611Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

父卡收尾：BUG-2 完成——批内非子卡 done 上限 N=3，先红后绿与邻域回归齐备

### 完成项

- 四张子卡全 done（复现 → 修复 → 复核 → 回归）；BUG-2 达成：单批可关的顶层卡数从 20 压到 3
- 先红 → 后绿读数：tests/done-throttle-guidance.test.ts 2 failed / 9 passed → 11 passed；加 tests/task-move-batch.test.ts 共 27 用例全绿
- 关键实现：MOVE_BATCH_DONE_MAX=3 + GateContext.batchDoneCount（按需求计数）；判定点位于 done 凭证门之后（不合规项不占额度）；拒绝复用 REQBOARD_BULK_CLOSE + throttleRemainingMs=60000（顶层 guidance 由既有装配产出，回执键集零变化）
- 取舍实现（DD-2）：限条数而非批内计节流——保住「同批 ≤3 张不触发」的既有小批可用性与断言，未推翻上一版 FR-5 口径；DoneEvidenceSpec 判据一字未改
- 契约齐步：TaskMoveTool 文案与 MoveTask 注释同批改；prompt-cost/prompt-baseline/prompt-error-codes 26 用例全绿；tsc --noEmit exit 0

### 改动文件

- `src/application/use-cases/MoveTask.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `tests/done-throttle-guidance.test.ts`

### 下一步

本卡收尾；下一张卡 t-6969c5（BUG-3：回退补偿 + 取消/复位事件与 version）

---
