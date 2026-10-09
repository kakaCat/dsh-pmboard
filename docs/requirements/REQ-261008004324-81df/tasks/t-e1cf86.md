# t-e1cf86 跟进拆分落库路径与卡回执断言

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
跟进拆分落库路径与卡回执断言

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/decompose-tools.test.ts tests/t11-decompose-queue-write.test.ts → 失败数由 5/1 降为 0/0，且 decompose-tools 五条改法与设计 ①~⑤ 一一对应。

## 实施方案（implementation）
按 design/fix-design.md「BUG-4」后两行：tests/decompose-tools.test.ts 五条逐条改——:251 夹具塞一张未取消卡（或改断 TASKS_REQUIRED 路径）、:378 断言只留 doc_path 与 implementation、:403 该断言迁至 verify_submit 用例、:516 改 /REQBOARD_NO_BOUND_REQ/、:529 删 requirement_status 断言；tests/t11-decompose-queue-write.test.ts:114 断言改 landApprovedPlan( 并断言 approved-plan-landing.ts 含 landPlanTasks(。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:12:00.315Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

拆分落库路径与卡回执断言跟进：两文件由 6 条红转全绿。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：decompose-tools 30 passed、t11-decompose-queue-write 3 passed（改前 6 failed | 27 passed）
- 六条断按现行语义跟进：幂等守卫改塞活卡、卡回执键集、blockers 迁 verify_submit、码名口径、需求态直读 store、落库路径改 landApprovedPlan
- 留痕一条条数差异：卡标题写五条、实际六条（第六条被第四条掩盖），已一并收口

### 改动文件

- `tests/decompose-tools.test.ts`
- `tests/t11-decompose-queue-write.test.ts`

---
