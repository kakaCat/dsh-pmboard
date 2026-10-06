# t-b40ed3 立项两条路径（capture / create）守卫前置到建档之前

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
立项两条路径（capture / create）守卫前置到建档之前

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) grep -c "ensureWritableProjectRoot" src/application/use-cases/CaptureRequirement.ts → ≥2（前置 + 护栏）；2) grep -n "ensureWritableProjectRoot" src/application/use-cases/CreateRequirement.ts → 行号小于 createRequirementDirect 调用行；3) npx vitest run tests/project-scope.test.ts tests/application → 全绿。

## 实施方案（implementation）
src/application/use-cases/CaptureRequirement.ts：在 ④createRequirementDirect(:277) 之前用已解析的 workspaceRoot 调 ensureWritableProjectRoot(deps, { workspaceRoot }, { callerRoot: sessionCwd })；拒绝即台账零写入；:300 既有调用保留为护栏。src/application/use-cases/CreateRequirement.ts：把 :63 的守卫前置到 createRequirementDirect(:52) 之前并传 callerRoot: sessionCwd。顺序约束：校正与紧随的写盘之间不插入新的 await。

## 上游产出摘要（dependsSummary）
- 守卫改为按需求记录声明根判定，并在写前校正共享仓储根

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:57:41.191Z，窗口 session-fe2396d0-cd4e-4724-89fd-16e436222a2f）

这一步做完，变化是：立项不再有半截状态——要么记录与产物一起成，要么在写下任何东西之前被拦住并说清原因。

### 完成项

- capture 与 create 两条立项路径的写盘根守卫都前置到建档之前（拒绝即台账零写入）
- 两条路径都传 callerRoot（会话 cwd），保留「记录未声明根」的存量兜底
- capture 建档后保留同口径护栏；create 的 RTM 写盘改由 syncRTMYaml 内部按需求 id 守卫
- 实施期裁决（相对根 → 不判）落进代码与 design/interfaces.md 变更记①
- 基线对照：HEAD worktree 实测 2 红 72 绿；改后 3 红 71 绿 → 净新增意外红 0（唯一新红是 t3 要重写的旧契约用例）
- tsc 错误 1 = 基线 1

### 改动文件

- `src/application/use-cases/CaptureRequirement.ts`
- `src/application/use-cases/CreateRequirement.ts`
- `docs/requirements/REQ-261005123641-3982/design/interfaces.md`

### 下一步

t3：并发窗口回归用例 + 重写被新契约推翻的旧用例（452）+ 声明根不可用用例

---
