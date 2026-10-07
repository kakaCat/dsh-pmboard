# t-269ffb 提交侧锚点拒绝分支与错误码

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
提交侧锚点拒绝分支与错误码

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/result-anchor-submit.test.ts 退出码 0；无锚点 result 提交被拒且点名该项，改交 npx vitest run tests/x.test.ts → 10 passed 形状后成功

## 实施方案（implementation）
在 src/application/use-cases/SubmitVerification.ts 的 bindStructuredResults 增分支（判定顺序排在漏项之后），拒绝码 REQBOARD_RESULT_UNANCHORED，四段式回执逐条点名并给可照抄样例；补齐 tests/result-anchor-submit.test.ts 的端到端断言（拒绝后验收单零改动、补锚点后提交成功、排除项不受影响）。

## 上游产出摘要（dependsSummary）
- 提交侧锚点体检入桶

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T08:57:53.222Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

提交侧拒绝门落地：无锚点结果在提交那一刻被拒并点名，9 条受影响夹具按带锚点口径修正。

### 完成项

- bindStructuredResults 增 REQBOARD_RESULT_UNANCHORED 拒绝分支
- 位置排在漏项之后、写盘之前（台账零改动）
- how 复用单点形态常量，无第二份文案
- 连带夹具修正 3 个文件（含清单外多找出的 verify-item-result）
- 错误码清单按仓内自助路径刷新并定 tier
- 本窗口复跑 5 文件 86 passed、typecheck 退出码 0

### 改动文件

- `src/application/use-cases/SubmitVerification.ts`
- `tests/result-anchor-submit.test.ts`
- `tests/accept-sheet-tool.test.ts`
- `tests/accept-sheet-zero-input.test.ts`
- `tests/verify-item-result.test.ts`

### 下一步

接 t7（HTTP 回执接线）与 t8（契约钉死）。

---
