# t-d7efd0 三处接线：让声明难度在每条注入路径上算数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
三处接线：让声明难度在每条注入路径上算数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/injection-difficulty.test.ts` 全绿（T-03~T-06、T-09、T-10）：expert/advanced → heavy；simple/standard → light；声明 simple 而文本推断重时取**重**；三处入口对同一需求画面档位一致；有声明时留痕含「声明难度 → 取词档」依据句。`npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts tests/decision-gates.test.ts` 全绿；`npx tsc --noEmit` 0 错误。

## 实施方案（implementation）
三处取词调用点按 design/interfaces.md 接上声明难度：`src/application/internal/capture-section.ts` 与 `src/application/dive/session-driver.ts` 在调 `resolveStagePrompt` 时传 `difficultyFromDeclaredPrompt(stageReq.promptDifficulty)`（未声明则不传该键；采集半同时补 requirement 文本，仍只留痕不投递）；`src/application/use-cases/IsolateNodeContext.ts` 的 `buildNodeInputPackage({ difficulty })` 改为「调用方显式优先 → 否则用声明映射」。用例补在同文件（T-03~T-06、T-09、T-10）。

## 上游产出摘要（dependsSummary）
- 契约先行：同步缝带上难度声明

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:56:20.935Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，「选了 expert 就按 expert 给纪律」在三条注入路径上都成立，包括那条从来没被赋过值的第三路。

### 完成项

- 三处调用点接线（每轮系统提示词 / dive 采集半 / 节点隔离输入包），统一映射 + 未声明不传键
- T-03~T-06、T-09、T-10 用例落地；既有映射与门禁套件零新增失败
- 核实并修掉一处潜伏同病：第三路的 settle.difficulty 全仓无生产者，恒为轻档

### 改动文件

- `src/application/internal/capture-section.ts`
- `src/application/dive/session-driver.ts`
- `src/application/use-cases/IsolateNodeContext.ts`
- `tests/injection-difficulty.test.ts`

---
