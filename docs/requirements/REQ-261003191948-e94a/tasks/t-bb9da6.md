# t-bb9da6 给迁移门补只读预检与可复制迁移命令

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
给迁移门补只读预检与可复制迁移命令

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/migration-gate.test.ts 全绿；新用例断言 preflightLedger 在「有单册无 meta.json」夹具下返回 ok:false 且 failure.code === 'REQBOARD_REQUIRES_MIGRATION'，另两个夹具返回 ok:true 且不抛错；断言 failure.hint 含夹具真实 ledgerFile 与 dataRoot 全路径、含 migrate-ledger-v10.ts 与 --apply、不含子串 '<单册>' 与 '<数据根>'；断言 assertLedgerMigrated 抛出的 message 与 preflightLedger().failure.message 逐字相等。

## 实施方案（implementation）
改 src/repositories/migrationGate.ts：新增 MigrationFailure（code 用字面量类型 'REQBOARD_REQUIRES_MIGRATION'、message、hint、ledgerFile、dataRoot）与 PreflightResult 判别联合；新增纯读 preflightLedger(options): PreflightResult（只 existsSync 两次，不建目录不写文件）；把 hint 构造收成模块内唯一一处（node --import tsx/esm scripts/migrate-ledger-v10.ts --file <真实 ledgerFile> --out <真实 dataRoot> --apply，不做 shell 转义、不加引号）；assertLedgerMigrated 改为调用 preflightLedger 并 rethrow 同一 failure（message 文本逐字节不变，只多 hint 字段）。测试改 tests/reqboard/migration-gate.test.ts：补 preflightLedger 三态（有单册无 meta / 有单册有 meta / 两者皆无）、hint 含真实路径且不含 <单册> 与 <数据根>、以及「抛错 ⟺ ok:false 且 message 逐字相等」的同源断言。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T11:26:05.522Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

迁移门拆成两个入口、共用一份判据：新增只读预检 preflightLedger（返回判别联合、不抛错）与单一 hint 构造点 migrationHint（代入真实路径的可复制命令）；assertLedgerMigrated 改为 preflight + rethrow，message 逐字不变。

### 完成项

- 新增 MigrationFailure 与 PreflightResult 类型，code 用字面量类型锁死取值
- 新增 preflightLedger：只 existsSync 两次，不建目录不写文件不抛错
- 新增 migrationHint：内联真实 ledgerFile 与 dataRoot，含 --apply，无占位符
- migrationMessage 抽成唯一构造点，抛错版与预检版共用
- assertLedgerMigrated 改为调用 preflightLedger 再 rethrow，行为与文案不变
- 补 3 条用例：三态判定、hint 无占位符、两入口 message 逐字相等
- npx vitest run tests/reqboard/migration-gate.test.ts 7 个用例全绿
- npx tsc --noEmit 改动文件错误数 0，全量 150 不高于基线 223

### 改动文件

- `src/repositories/migrationGate.ts`
- `tests/reqboard/migration-gate.test.ts`

### 下一步

t2：抽出 src/http/envelope.ts 并把 REQBOARD_REQUIRES_MIGRATION 映射为 503、透出 hint

---
