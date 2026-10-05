# t-fb1ed6 批内写集分组真并行·研发

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
批内写集分组真并行·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T15:59:53.785Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t2 研发段完成：批内从「假并行」变「真并行」——写集无冲突的父卡子卡真的同时跑（maxParallelParents 首次兑现），未声明写集保守串行 ≡ 旧行为；顺带修复并行暴露的跨卡检查误伤（自己写的文件被自己窗口解释）

### 完成项

- 新增 advance-parallel.ts：effectiveWriteSet（scope.files∪filesPlanned，子卡未声明回落父卡）+ groupSubtaskEvents 贪心分组（未声明写集=独占串行组）
- AdvanceChain.ts driveChain 批内重构：非 RUN_SUBTASK 快事件串行先行；RUN_SUBTASK 按写集分组、组间串行组内 Promise.all；失败收集后按首败决策（回滚全部失败卡/成功卡保留）；history 新增可选 batchId
- 跨卡覆盖检查并行适配（设计外同类必要修复）：detectCrossCardOverwrite 新增 myWindow 排除——我自己开工后的落盘不再被误判为并行对方覆盖；严格大于边界保留串行语义
- 新增 tests/advance-parallel.test.ts 四用例全绿：①无冲突重叠并行 ②冲突对串行 ③未声明保守串行 ④组内一败暂停+成功保留+失败回滚
- 回归：advance 一族+concurrency-limits 共 44 用例全绿；tsc 归属本卡文件零错
- git diff --stat：advance-parallel.ts 新增；cross-card.ts +14；ExecuteTask.ts +14；AdvanceChain.ts 批内段重构；protocol.ts 加可选 batchId

### 改动文件

- `src/application/internal/advance-parallel.ts`
- `src/application/use-cases/AdvanceChain.ts`
- `src/application/internal/cross-card.ts`
- `src/application/use-cases/ExecuteTask.ts`
- `src/shared/protocol.ts`
- `tests/advance-parallel.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-fb1ed6.md`

### 下一步

联调段（t-1c86df）：并行与凭证门/跨卡防线/失败重试的对接验证

---
