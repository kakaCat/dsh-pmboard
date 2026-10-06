# t-0f4bb6 加拆分覆盖门的 UI 卡原型锚点维度

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加拆分覆盖门的 UI 卡原型锚点维度

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/clause-coverage-gate.test.ts 全绿：UI 卡 prototypeRefs 为空 → 落库前被拒并点名该卡 key 与『设计落点』补写位置；补上 prototypes/detail.html#FR-4 后放行；非 UI 需求与存量需求不受影响；assertClauseCoverageGate 对『某条 FR 无落点』的既有拒绝行为零回归。pnpm typecheck 退出码 0。

## 实施方案（implementation）
扩既有拆分覆盖门 assertClauseCoverageGate（在 src/application/internal/content-gate-wiring.ts 内，与 FR 落点门同一个判定单点）：当需求为 feature/refactor 且 sides 含 frontend 时，除『每条 FR 有落点』外再断言每张 UI 卡的『设计落点』带原型锚点——判据是任务对象或 decomposition.md 覆盖对照表的 prototypeRefs（形态 prototypes/<name>.html#FR-N）非空、且锚点文件路径与 INDEX 权威路径一致；缺失即拒并逐卡点名（gap 文案给出补写位置与模板）。两条落库入口自动复用（src/application/use-cases/Decompose.ts 与 src/application/internal/approved-plan-landing.ts），计划提交预检复用（src/application/use-cases/SubmitArtifact.ts 的 kind=plan 分支），既有调用点签名不变；非 UI 需求与存量需求（req.artifacts 为空）直接放行。依据 requirement.md FR-5 与 design/test-cases.md TC-17。

## 上游产出摘要（dependsSummary）
- 加唯一 async 门禁入口 contentGatesForMove 并接线四条转移路径

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
