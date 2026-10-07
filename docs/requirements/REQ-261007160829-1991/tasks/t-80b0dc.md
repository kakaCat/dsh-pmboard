# t-80b0dc 提交侧锚点体检入桶

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
提交侧锚点体检入桶

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/result-anchor-submit.test.ts 退出码 0；断言无锚点普通项进 unanchored，needsHuman 项与系统缺口项不进

## 实施方案（implementation）
在 src/domain/workflow/ResultBinding.ts 的 ResultMatchReport 增 unanchored 桶，matchStructuredResults 按 design/backend.md S-3 入桶：命中项 → needsHuman 非真 → 非系统项（gapKind 空）→ 文本非空 → !hasResultAnchor。判据只调用既有的 hasResultAnchor，禁止另写正则。tests/result-anchor-submit.test.ts 先写桶级断言（普通项入桶、人工项与系统项不入桶）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T08:42:29.593Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

提交侧锚点体检入桶：ResultMatchReport 增 unanchored 桶，判据复用既有 hasResultAnchor 不另写正则；16 用例 TDD 先红后绿，回归 8 套件 131 通过，typecheck 退出码 0。

### 完成项

- ResultMatchReport 增 unanchored 桶并同步两处构造点
- 入桶按 S-3 五条件，人工项与系统项明确排除
- tests/result-anchor-submit.test.ts 16 用例先红后绿
- 回归 8 套件 131 通过；pnpm typecheck 退出码 0
- 本卡不做拒绝：SubmitVerification 未改（留给 t4）

### 改动文件

- `src/domain/workflow/ResultBinding.ts`
- `tests/result-anchor-submit.test.ts`

### 下一步

接 t4（提交侧拒绝分支与错误码 REQBOARD_RESULT_UNANCHORED）。

---
