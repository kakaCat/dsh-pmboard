# t-65ce9a 数据契约：rollback / reworkOf 可选字段

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
数据契约：rollback / reworkOf 可选字段

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx tsc --noEmit 错误数 ≤ 开工前基线 150；npx vitest run tests/queue tests/reqboard 不回归（旧台账与旧队列卡无这两个字段时读取行为与现状一致）。

## 实施方案（implementation）
src/shared/protocol.ts 给 RequirementRecord 加 rollback?: { from; to; at; by; reason? }，给 TaskRecord 加 reworkOf?: string；注释写明 rollback 只存最近一次（历史由 statusHistory 与评论承担）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T12:59:37.336Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

数据契约落地：需求多了「退过没」的标记、任务卡多了「重做的是哪张卡」的关系，两个字段都可选，存量数据一行都不用迁。

### 完成项

- RequirementRecord 新增可选 rollback（RollbackMark：from／to／at／by／reason）
- TaskRecord 新增可选 reworkOf（重做卡指向旧卡）
- 两个字段全可选：无回填、无迁移脚本，旧台账与旧队列卡读出即旧行为
- TSC 150 = 基线；tests/queue 与 tests/reqboard 共 471 例全绿

### 改动文件

- `src/shared/protocol.ts`

### 下一步

子卡链联调／复核／测试三段；随后进入 t3 撤销语义

---
