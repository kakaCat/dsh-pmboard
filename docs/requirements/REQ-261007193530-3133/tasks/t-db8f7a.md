# t-db8f7a 修复需求 canceled→draft 复活边挂人工门（FR-3）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
修复需求 canceled→draft 复活边挂人工门（FR-3）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -n "canceled>draft" src/domain/requirement/RequirementStatus.ts 命中 HUMAN_ONLY_REQ_TRANSITIONS；pnpm vitest run tests/domain/requirement-status.test.ts 通过：agent 抛 human_gate、human 放行、agentNextActions 不含 draft

## 实施方案（implementation）
src/domain/requirement/RequirementStatus.ts 的 HUMAN_ONLY_REQ_TRANSITIONS 加一行 'canceled>draft'（带对称性注释）。tests/domain/requirement-status.test.ts 新增用例：assertReqTransition('canceled','draft','agent') 抛 code:'human_gate'；human 放行；system 抛 system_gate；agentNextActions('canceled') 不含 draft

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T12:00:29.663Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

FR-3 交付：agent 不可再复活人取消的需求，人操作照常

### 完成项

- M2 修复：HUMAN_ONLY_REQ_TRANSITIONS 加 canceled>draft
- 回归：tests/domain/requirement-status.test.ts 新增 3 条，10 条全绿
- 派生面 agentNextActions 自动跟随

### 改动文件

- `src/domain/requirement/RequirementStatus.ts`
- `tests/domain/requirement-status.test.ts`

### 下一步

无（待链尾总验收卡收口）

---
