# t-ccca0a 跟进拆分落库路径与卡回执断言·复现

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
跟进拆分落库路径与卡回执断言·复现

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/decompose-tools.test.ts tests/t11-decompose-queue-write.test.ts` → 修复前失败、修复后通过（贴两次输出）

---
## 汇报 1（2026-10-07T17:11:48.186Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

复现段：6 条红读数逐条定位（设计写五条，第 6 条被第 4 条掩盖）。

### 完成项

- 补文件证据：本段只读不写；下面列出的是被复现的两个测试文件，作为写入族阶段的文件凭据
- 红读数：6 failed | 27 passed（2 failed files）
- 逐条：:251 期望 ALREADY_DECOMPOSED 实得 TASKS_REQUIRED；:378 acceptance 已无；:403 blockers 不在 done 回执；:516 期望 NOT_BOUND_TO_WINDOW 实得 NO_BOUND_REQ；:529 requirement_status 已无；t11:114 源码不含 landPlanTasks(

### 改动文件

- `tests/decompose-tools.test.ts`
- `tests/t11-decompose-queue-write.test.ts`

---
