# t-5eac48 修复：子卡模板产可执行验收标准

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
修复：子卡模板产可执行验收标准

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/subtask-template-acceptance.test.ts → 全绿；且新建需求落库后抽一张子卡，其 acceptance 匹配 /npx vitest run|pnpm /

## 实施方案（implementation）
SubtaskTemplate.ts 各阶段 acceptance 生成改为操作句：dev/integrate = npx vitest run <测试文件> → 全绿；review = 对照 docs/requirements/<REQ>/design/ 逐条核对 + 同一命令；test = pnpm test → 失败数 ≤ 基线、npx tsc --noEmit → 错误数 ≤ 基线。拿不到具体测试文件时给可跑占位，禁止退回断言词。存量卡不追溯。

## 上游产出摘要（dependsSummary）
- 复现：把两个缺陷写成红的用例

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T10:21:13.384Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

模板与门禁同口径：新建需求落库即带可跑验收标准，收尾不再人工回补。

### 完成项

- SubtaskTemplate 16 阶段改造
- A4 用例绿

### 改动文件

- `src/domain/task/SubtaskTemplate.ts`
- `tests/subtask-template-acceptance.test.ts`

### 下一步

t4 回归

---
