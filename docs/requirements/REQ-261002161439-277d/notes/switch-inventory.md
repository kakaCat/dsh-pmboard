# t8 运行时切换清单（机械生成，勿手改）

> 生成方式：本文件由 `grep -rn` 现算得出（见已知缺口文档 §9 的生成命令）。
> 用途：t8 是**一次性原子切换**——从开始到结束之间仓库不可编译，故不靠探索、照本清单逐条执行。

## 0. 已完成的前置切片（不要重做）

- **迁移门已落地**：`src/repositories/migrationGate.ts` 的 `assertLedgerMigrated({dataRoot, ledgerFile})`
  —— 单册在场而数据根缺 `meta.json` → 抛 `REQBOARD_REQUIRES_MIGRATION`，**只读不建目录**；
  4 条测试在 `tests/reqboard/migration-gate.test.ts`（覆盖验收④）。
  **t8 装配时只需在 `src/index.ts` 调它一次**，不必重写这道门。
- **验收①的同名函数已清除**：`src/client/panel-refresh.ts` 的内部函数已改名 `readFreshness`
  （对外方法名 `freshness` 不变），客户端产物已重建并通过 `[verify-client] OK`。
  **当前基线：`grep -rn "snapshot()" src` = 97 处，client 侧 0 处**——剩下的全是 host 侧真要改的读点。
  ⚠️ 改名时连**注释里的字面量**也要清掉（注释同样命中 grep），且别漏对外导出处的简写引用
  （本卡实测踩过：改了函数名却漏了 `freshness: snapshot` 简写，导致 11 条用例 `snapshot is not defined`）。

## 1. 删除清单（不留兼容壳）

- `src/adapters/JsonLedgerRepository.ts`（整文件；`persistAtomic` 已在 t3 迁出）
- `src/application/ports.ts`：`ReqboardRepository` / `LedgerView` / `MutableLedger` / `LedgerChange` / `LedgerMutateResult`

## 2. 读点：snapshot() 共 101 处

### A. .requirements.find（按 id 取一条）（28 处）

- src/tools/RunStatusTool/RunStatusTool.ts:109
- src/wiring/pm-capture-root.ts:177
- src/http/routers/requirements.ts:102
- src/http/routers/requirements.ts:273
- src/http/routers/requirements.ts:291
- src/http/routers/requirements.ts:351
- src/http/routers/requirements.ts:402
- src/http/routers/requirements.ts:508
- src/http/routers/requirements.ts:522
- src/index.ts:439
- src/application/dive/round-driver.ts:103
- src/application/dive/round-driver.ts:108
- src/application/dive/round-driver.ts:255
- src/application/internal/plan-landing.ts:104
- src/application/internal/plan-landing.ts:300
- src/application/internal/approved-plan-landing.ts:74
- src/application/internal/confirm-settle.ts:96
- src/application/internal/confirm-settle.ts:177
- src/application/internal/confirm-settle.ts:188
- src/application/internal/pending-guard.ts:61
- src/application/internal/rearm.ts:52
- src/application/use-cases/MoveTask.ts:101
- src/application/use-cases/AdvanceChain.ts:146
- src/application/use-cases/AdvanceChain.ts:192
- src/application/use-cases/SubmitDesignArtifacts.ts:139
- src/application/use-cases/AcceptSheet.ts:57
- src/application/use-cases/AcceptSheet.ts:307
- src/application/use-cases/ConfirmReceipt.ts:51

### B. .requirements.filter（按条件取一批）（2 处）

- src/application/dive/wake-heartbeat.ts:78
- src/application/dive/wake-heartbeat.ts:107

### C. .requirements.some（存在性）（1 处）

- src/http/routers/tasks.ts:101

### D. .revision（取全局版本）（3 处）

- src/index.ts:302
- src/application/internal/node-settlement.ts:126
- src/application/gate/handlers/h2-compact.ts:61

### E. 整册作为实参传给纯函数（16 处）

- src/wiring/pm-capture-root.ts:141
- src/wiring/pm-capture-root.ts:151
- src/http/routers/requirements.ts:268
- src/http/routers/requirements.ts:330
- src/http/routers/tasks.ts:177
- src/gate-wiring.ts:172
- src/gate-wiring.ts:176
- src/application/dive/boundary-guard.ts:51
- src/application/internal/rtm-yaml.ts:149
- src/application/internal/support.ts:626
- src/application/use-cases/AmendTaskRefs.ts:151
- src/application/use-cases/MoveTask.ts:141
- src/application/use-cases/AdvanceChain.ts:208
- src/application/use-cases/NoteInterruption.ts:40
- src/application/use-cases/ExecuteTask.ts:380
- src/client/panel-refresh.ts:201

### F. 整册赋值给局部变量（6 处）

- src/adapters/ArtifactSync.ts:93
- src/adapters/ArtifactSync.ts:159
- src/http/routers/verdicts.ts:55
- src/http/routers/verdicts.ts:198
- src/application/use-cases/IsolateNodeContext.ts:234
- src/application/gate/handlers/shared.ts:16

### G. 其他/定义处（45 处）

- src/tools/RunStatusTool/RunStatusTool.ts:70
- src/tools/AdvanceTool/AdvanceTool.ts:75
- src/adapters/JsonLedgerRepository.ts:177
- src/gate-wiring.ts:122
- src/application/dive/session-driver.ts:250
- src/application/dive/ReqboardDiveManager.ts:151
- src/application/dive/boundary-guard.ts:22
- src/application/internal/backfill-task-refs.ts:70
- src/application/internal/rtm-yaml.ts:35
- src/application/internal/verification-doc-writer.ts:19
- src/application/internal/verification-doc-writer.ts:37
- src/application/internal/window.ts:16
- src/application/internal/agent-handle.ts:35
- src/application/use-cases/AskConfirm.ts:88
- src/application/use-cases/MoveTask.ts:79
- src/application/use-cases/SubmitVerification.ts:76
- src/application/use-cases/SubmitVerification.ts:301
- src/application/use-cases/ClearPause.ts:48
- src/application/use-cases/AdvanceChain.ts:296
- src/application/use-cases/AdvanceChain.ts:442
- src/application/use-cases/AdvanceChain.ts:552
- src/application/use-cases/MoveRequirement.ts:28
- src/application/use-cases/CaptureRequirement.ts:121
- src/application/use-cases/ConfirmArtifact.ts:77
- src/application/use-cases/ReportTask.ts:49
- src/application/use-cases/TaskTree.ts:119
- src/application/use-cases/SubmitArchive.ts:72
- src/application/use-cases/AdoptTask.ts:52
- src/application/use-cases/ExecuteTask.ts:180
- src/application/use-cases/Decompose.ts:35
- src/application/use-cases/AmendTaskAcceptance.ts:52
- src/application/use-cases/SubmitDesignArtifacts.ts:52
- src/application/use-cases/SubmitArtifact.ts:43
- src/application/use-cases/SubmitArtifact.ts:201
- src/application/use-cases/RegenerateChain.ts:52
- src/application/use-cases/AcceptSheet.ts:38
- src/application/ports.ts:90
- src/application/ports.ts:102
- src/application/ports.ts:106
- src/application/ports.ts:285
- src/application/query/QueryStageOverview.ts:18
- src/application/query/QueryStageDetail.ts:388
- src/client/panel-refresh.ts:157
- src/client/panel-refresh.ts:172
- src/client/panel-refresh.ts:183
