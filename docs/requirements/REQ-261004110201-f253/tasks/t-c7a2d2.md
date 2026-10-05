# t-c7a2d2 执行收尾写产出数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
执行收尾写产出数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/stage-telemetry.test.ts 中写入段全绿：传 outputCount 时 execution.outputCount 与 zeroOutput 落盘且 zeroOutput=(outputCount===0)；不传时两个键都不存在（hasOwnProperty 断言）；filesChanged+completed 计数口径正确

## 实施方案（implementation）
① token-usage.ts：CloseExecutionsOpts 增 outputCount?: number；存在时写 e.outputCount 与 e.zeroOutput，缺省时两键都不写。② ExecuteTask.ts：done 路径传 outputCount。③ 新增 tests/stage-telemetry.test.ts 写入段用例

## 上游产出摘要（dependsSummary）
- 定契约：路由解析 + 三个配置 + 可选字段

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T03:16:11.015Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

这一步做完：每次子卡执行都留下了「干出几件产出」这个数——产出为零会被标成 zeroOutput，后面按阶段统计白跑段、以及零产出告警，全靠它

### 完成项

- token-usage.ts：CloseExecutionsOpts 增可选 outputCount；存在时同时落 outputCount 与推导键 zeroOutput=(outputCount===0)，缺省时两键都不写
- ExecuteTask.ts：子卡完工收尾传 outputCount = filesChanged.length + completed.length（遥测数据来源；产出计数唯一写入点）
- 新增 tests/stage-telemetry.test.ts 写入段 6 用例全绿：有产出=2/零产出=true/不传时 hasOwnProperty 双 false/已结束执行不被改写/ExecuteTask 真实路径 outputCount=2/空产出 zeroOutput=true
- 口径说明（如实记录）：parseSubtaskOutput 会把 summary 兜底成一条 completed，故「只写结论」的段计数为 1 而非 0——遥测口径与凭证明细一致，不另立算法
- npx tsc --noEmit 归属本卡文件零错

### 改动文件

- `src/application/internal/token-usage.ts`
- `src/application/use-cases/ExecuteTask.ts`
- `tests/stage-telemetry.test.ts`
- `docs/requirements/REQ-261004110201-f253/tasks/t-c7a2d2.md`

### 下一步

联调 → 测试 → 复核 → 关闭

---
## 汇报 2（2026-10-04T03:16:23.578Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

联调段完成：产出计数只在子卡完工这一条路径写、父卡与失败路径保持原样——不会出现「失败也被记成零产出」这种误报源

### 完成项

- 联调面：npx vitest run tests/stage-telemetry.test.ts tests/advance-chain.test.ts tests/execute-task.test.ts → 41/41 全绿（子卡执行与父卡收尾两条收尾路径都零回归）
- 父卡收尾路径核对：AdvanceChain.finalizeParent 调 closeExecutions 未传 outputCount → 行为与改造前一致（父卡不参与子卡阶段遥测）
- 失败路径核对：ExecuteTask catch 分支的 closeExecutions 同样未传 outputCount（失败执行不写产出数，读侧记未知而非零产出）
- 接口面零破坏：CloseExecutionsOpts 新增可选参，既有调用方（含测试夹具）零改动

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c7a2d2.md`

### 下一步

测试段：全量回归比对基线

---
## 汇报 3（2026-10-04T03:17:23.123Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：写入段 6 用例绿、全量 97≤基线零新增、tsc 零错

### 完成项

- 本卡验收命令：npx vitest run tests/stage-telemetry.test.ts → 写入段 6/6 全绿（含不传时 hasOwnProperty 双 false 的硬断言）
- 全量 pnpm test：97 failed ≤ 基线 98，本卡零新增失败（新增 6 用例在绿侧）
- npx tsc --noEmit：归属本卡文件零错
- 测试段结论：判据成立

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c7a2d2.md`

### 下一步

复核段：对照设计核对写入点与缺省语义

---
## 汇报 4（2026-10-04T03:17:29.523Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过：写入口径与设计公式一致，并补了一条设计没写的边界——失败执行记未知不记零产出，免得告警把失败也算成白跑

### 完成项

- 对照 design/interfaces.md「执行收尾接口」核对：CloseExecutionsOpts.outputCount 可选、存在时写两键、缺省时不写 —— 与设计逐字一致
- 对照 design/data-model.md「字段清单 + 推导规则」核对：outputCount = filesChanged + completed、zeroOutput = (count===0)，与设计公式一致
- 补充声明（设计未写、实施明确的边界，如实记录）：失败路径与父卡收尾**不传** outputCount —— 失败执行记「未知」而非「零产出」，避免把失败误算成白跑段
- 复跑：41 用例绿（本文件 6 + advance-chain + execute-task）；无偏离声明

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c7a2d2.md`

### 下一步

关闭本卡

---
