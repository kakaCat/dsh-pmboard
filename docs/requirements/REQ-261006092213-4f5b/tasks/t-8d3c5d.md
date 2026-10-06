# t-8d3c5d HTTP 逐项裁决口径放宽与来源写入

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
HTTP 逐项裁决口径放宽与来源写入

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/verdicts-http.test.ts 退出码 0：空 opinion 的通过请求 → 200 且该项 status==='passed'、opinion===item.result；无 result 且空 opinion → unverified（不是 400）。

## 实施方案（implementation）
src/http/routers/verdicts.ts：删除「passed 且空 opinion → badInput（通过的验收项必须填写实际结果）」的路由层预校验，改由 applyVerdicts 统一判定；响应形状与「任务先、需求后」写入顺序不变；新增 tests/verdicts-http.test.ts。

## 上游产出摘要（dependsSummary）
- 裁决口径与底线：零输入通过 / unverified / 放行判据

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T03:02:02.942Z，窗口 session-851897de-d884-4ab8-b689-160d66853eb4）

t4 完工：看板通道口径放宽与来源写入，放行判据收口

### 完成项

- 路由层删除「通过必填」预校验，判定统一归 applyVerdicts
- 留空点通过取台账 result；无结果记未复核（不再 400）
- 人改结果写 result 并标 human
- 放行判据收口：存在未复核项时「验收通过」被拦
- 既有硬规则与响应形状未变（用例锁定）
- 验收命令 6 项、HTTP 层 516 项、全量失败 68 ≤ 基线 106

### 改动文件

- `src/http/routers/verdicts.ts`
- `tests/verdicts-http.test.ts`

### 下一步

t6：迁移与兼容（老写法、回滚开关、存量单据）

---
