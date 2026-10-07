# t-4fae3f 看板确认推进改走单点并与窗口在线解耦

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
看板确认推进改走单点并与窗口在线解耦

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/artifact-confirm-board.test.ts 全绿；窗口离线用例断言 advanced === true && delivered === false；grep -n "transitionRequirement(" src/http/routers/requirements.ts 在确认分支零命中（exit 0）

## 实施方案（implementation）
src/http/routers/requirements.ts：确认即推进分支删掉内联 transitionRequirement 与自写 [自动推进] 评论，改调 applyConfirmedAdvance({ requirementId, windowKey, from: gate.from, to: gate.to, nowTs, reason:'看板确认即推进', sourceLabel:'board' })（内容门 / G2 完整性门仍在调用方前置，一字不改）；把 onlineAgent(windowKey) 判定从流程前置改为只决定 delivered 与 note（窗口离线时 advanced 仍为 true）。tests/artifact-confirm-board.test.ts 补窗口离线用例（advanced===true、delivered===false、note 含「窗口不在线」）。

## 上游产出摘要（dependsSummary）
- 抽统一收尾 finishConfirmAdvance 并接进推进单点

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T06:07:36.469Z，窗口 session-f22c57a8-ab6f-4822-806f-7f852cf43e7e）

t2 完成：看板确认的推进收敛到单点，且推进与「窗口在线」解耦；相关 6 份用例文件同步更新并通过。

### 完成项

- 看板确认推进改走 applyConfirmedAdvance（删除 512-538 内联 transitionRequirement 与自写评论）
- 看板推进与「窗口在线」解耦：离线时 advanced 仍为 true、delivered=false、note 如实说明
- artifact-confirm-board 用例更新为 TC-4 语义（离线仍推进），并补 applicationDeps 装配
- 同步修正 4 份既有用例的过时期望（artifact-gates / confirm-group / design-gate-workspace-root / move-gate-paths）

### 改动文件

- `src/http/routers/requirements.ts`
- `tests/artifact-confirm-board.test.ts`
- `tests/artifact-gates.test.ts`
- `tests/confirm-group.test.ts`
- `tests/design-gate-workspace-root.test.ts`
- `tests/move-gate-paths.test.ts`
- `tests/design-completeness-gate.test.ts`

### 下一步

t3（文字证据）已由并行窗口/本窗口完成；t5 对拍用例已落地；待 t5/t6 子卡链收尾

---
## 汇报 2（2026-10-07T06:15:55.174Z，窗口 session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1）

看板确认的推进已收敛到唯一实现 applyConfirmedAdvance，且推进与「窗口在线」解耦；本窗口复核验收判据全绿。

### 完成项

- requirements.ts 确认即推进分支（522）改调 applyConfirmedAdvance，内联 transitionRequirement 已删
- 窗口在线只决定 delivered 与 note：离线时 advanced 仍为 true、状态照常推进
- artifact-confirm-board 用例 4 例全绿
- 窗口离线用例断言 advanced===true、delivered===false、note 含「窗口不在线」
- grep transitionRequirement( 在 requirements.ts 确认分支零命中（236/359 属其它路由分支）

### 改动文件

- `src/http/routers/requirements.ts`
- `tests/artifact-confirm-board.test.ts`

### 下一步

父卡收工；子卡链（研发/联调/复核/测试）与需求后续卡由看板流程承载

---
