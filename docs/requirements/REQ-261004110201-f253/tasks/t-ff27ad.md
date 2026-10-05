# t-ff27ad 阶段遥测读模型 + status 回执

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
阶段遥测读模型 + status 回执

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/stage-telemetry.test.ts 全绿：stageTelemetryOf 按 stageKind 聚合 runs/totalDurationMs/avgDurationMs/outputCount/zeroOutputRuns/lastAt；旧记录缺 outputCount 时 zeroOutputRuns 不计它；无数据时 reqboard_status 回执 hasOwnProperty('stage_telemetry') === false；npx vitest run tests/tools-schema.test.ts 绿且 schema 已声明该键

## 实施方案（implementation）
① 新增 domain/workflow/StageTelemetry.ts：stageTelemetryOf(subtasks) 汇总已完成执行。② QueryState.ts：回执加 ...(rows.length>0 ? {stage_telemetry: rows} : {})。③ StatusTool.ts：output.schema 先声明 stage_telemetry（array of object）。④ 补聚合/省略/未知态用例

## 上游产出摘要（dependsSummary）
- 执行收尾写产出数

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T03:18:56.019Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

这一步做完：每段花的时长、干出多少产出、白跑了几次，都能在 reqboard_status 里按阶段读到了；没有数据的需求不会看到空壳字段

### 完成项

- 新增 domain/workflow/StageTelemetry.ts：stageTelemetryOf 只统计子卡（parentId 存在）已完成执行，按 stageKind 汇总 runs/totalDurationMs/avgDurationMs/outputCount/zeroOutputRuns/lastAt；未知产出计数与标记不参与统计
- QueryState.ts：回执加 stage_telemetry，且**无已完成执行时整体省略键**（不发空数组、不发 null）；数据取自同一次任务读取，零额外读盘
- StatusTool.ts：output.schema 先声明 stage_telemetry（七个字段全部显式声明）
- 读取段 4 用例全绿：两阶段聚合正确（含「仍在跑不计」「未知产出只计 runs/时长」「父卡不参与」）、空态与排序稳定、有数据回执出现、无数据 hasOwnProperty false
- npx tsc --noEmit 归属本卡文件零错；tools-schema 全绿（新键已声明）

### 改动文件

- `src/domain/workflow/StageTelemetry.ts`
- `src/application/query/QueryState.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `tests/stage-telemetry.test.ts`
- `docs/requirements/REQ-261004110201-f253/tasks/t-ff27ad.md`

### 下一步

联调 → 测试 → 复核 → 关闭

---
## 汇报 2（2026-10-04T03:19:09.376Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

联调段完成：schema 与回执两侧对齐、数据源复用同一次任务读取、异常落在既有旁路兜底里——status 不会因为遥测出问题而失败

### 完成项

- 联调面：npx vitest run tests/stage-telemetry.test.ts tests/tools-schema.test.ts tests/reqboard/plan-landing-parity.test.ts → 63/63 全绿
- 回执契约对接：schema 先声明（StatusTool）→ 回执后写入（QueryState），两侧字段名与语义逐字一致；tools-schema 构造全绿
- 数据源对接：遥测取自与 RTM 同一批任务读取（复用 reqTasks），不新增读盘、不加锁、无副作用
- 旁路安全：聚合异常被既有 try/catch 覆盖（与 RTM 集成同一块），遥测失败不会打断 status 主流程（只影响该键是否出现）

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-ff27ad.md`

### 下一步

测试段：全量回归比对基线

---
## 汇报 3（2026-10-04T03:20:12.648Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：10 用例绿、schema 全绿、全量 97≤基线零新增、tsc 零错

### 完成项

- 本卡验收命令：npx vitest run tests/stage-telemetry.test.ts → 10/10 全绿（含读取段四条：聚合正确/未知不计/空态省略键/排序稳定）
- schema 面：npx vitest run tests/tools-schema.test.ts → 全绿（stage_telemetry 已声明）
- 全量 pnpm test：97 failed ≤ 基线 98，本卡零新增失败（新增 4 用例在绿侧）
- npx tsc --noEmit：归属本卡文件零错
- 测试段结论：判据成立

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-ff27ad.md`

### 下一步

复核段：对照设计核对字段与省略语义

---
## 汇报 4（2026-10-04T03:20:20.732Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过：字段与省略语义和设计逐字一致，并补声明一条边界——父卡不进遥测，免得分段读数被无阶段语义的执行污染

### 完成项

- 对照 design/interfaces.md「遥测读取接口」核对：StageTelemetryRow 七字段（stageKind/runs/totalDurationMs/avgDurationMs/outputCount/zeroOutputRuns/lastAt）与设计逐字一致；stageTelemetryOf 签名一致
- 对照 design/data-model.md「遥测读模型」核对：只统计已完成执行、未知不计入、按 stageKind 派生不落盘——三条实施口径与设计一致
- 对照 design/interfaces.md「Schema 同步清单」核对：StatusTool 先声明后回执 ✓；无数据整体省略键 ✓
- 补充声明（设计未写、实施明确的边界）：父卡执行不参与遥测（只看子卡 stageKind）——父卡无阶段语义，混入会污染分段读数
- 无偏离声明：改动 = 设计声明的三处（StageTelemetry 新增 / QueryState 回执 / StatusTool schema）+ 测试文件

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-ff27ad.md`

### 下一步

关闭本卡

---
