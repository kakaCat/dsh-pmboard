# t-7dbf23 新建 domain 门判定纯函数并补单测

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新建 domain 门判定纯函数并补单测

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
pnpm vitest run tests/gate-readings.test.ts 全绿：三态齐全；design 多份有一份未落章即 pending 且 count 为份数；空 artifacts 全 missing；planStateOf 三态与 undefined；archivePreparedOf 两态（归档记录 ∨ 归档产物）。

## 实施方案（implementation）
新建 src/domain/artifact/GateReadings.ts：gateReadingsOf(confirmKinds, artifacts) 判定 confirmed/pending/missing 并给 count（design 成组：任一份未落章即 pending）、planStateOf(plan)、archivePreparedOf({archive, hasArchiveArtifact})；零 IO、不 import shared。新增 tests/gate-readings.test.ts 覆盖三态、成组、count、planState 三态、archivePrepared 两态。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:08:57.424Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

新建 domain 门读数判定单点 GateReadings.ts（零 IO、不 import shared），把原先散在客户端的门三态判定搬进领域层，并补 14 条单测。

### 完成项

- 新建 src/domain/artifact/GateReadings.ts：gateReadingsOf / planStateOf / archivePreparedOf 三个纯函数
- 门三态判定与改动前客户端 computeGateStatuses 逐字一致（含 design 成组确认：任一份未落章即 pending）
- count = 该 kind 产物条数，供卡面「确认产物（全部 N 份）」文案取值
- archivePreparedOf 与 closingGapOf 同口径：归档记录（排除显式 null）∨ 归档产物
- 新增 tests/gate-readings.test.ts 14 条：三态、成组、count、顺序稳定、planState 三态与缺省、archivePrepared 两来源
- paho vitest run tests/gate-readings.test.ts 全绿（14/14）

### 改动文件

- `src/domain/artifact/GateReadings.ts`
- `tests/gate-readings.test.ts`

### 下一步

t2：摘要补 gates/planState/archivePrepared 三键并把装配收成 shared/board-summary 单点

---
## 汇报 2（2026-10-06T10:09:03.051Z，窗口 session-5678dda2-4511-465c-bae1-0b321cd1c0fc）

更正上一段的一处笔误：验收命令是 pnpm vitest run tests/gate-readings.test.ts（上一段误写成 paho vitest）。

### 完成项

- 笔误更正：命令锚点 pnpm vitest run tests/gate-readings.test.ts，实测 14/14 通过

---
