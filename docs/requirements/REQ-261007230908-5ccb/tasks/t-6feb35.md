# t-6feb35 建错误码注册表常量模块 error-code-registry.ts

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
建错误码注册表常量模块 error-code-registry.ts

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
src/shared/error-code-registry.ts 存在；条目数 = scanErrorCodes().uppercase 码数（npx tsx 一次性脚本比对打印）；pnpm typecheck 0 错；NOISE_TOKENS 零收录

## 实施方案（implementation）
新建 src/shared/error-code-registry.ts；用 npx tsx -e 调 tests/helpers/error-code-scan.ts 的 scanErrorCodes 打印码清单逐条誊 message/layer；不迁移任何字面量产生点

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:44:54.075Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

建成错误码注册表常量模块（IF-1）：133 个大写码全量收录，与扫描口径双向一致，typecheck 0 错

### 完成项

- 新建注册表模块：133 条目（code/message/layer），字典序、零重复、message 全非空
- message 种子：10 条取 toolviews/shared.ts 映射、10 条取 throw 现场提炼、113 条按产生点上下文补齐
- 派生物 REQBOARD_CODE_SET 与 errorCodeMessage() 机械派生
- NOISE_TOKENS 补 2 条（注册表自身标识符 REQBOARD_CODE_REGISTRY/REQBOARD_CODE_SET，同 ERROR_CODES 先例）
- 刷新 inventory fixture（排除清单 5→7），存量守卫 11 项全绿
- 验证：扫描 133 = 注册表 133，双向差集为空；pnpm typecheck 0 错

### 改动文件

- `src/shared/error-code-registry.ts`
- `tests/helpers/error-code-scan.ts`
- `tests/fixtures/error-code-inventory.json`

### 下一步

t2 注册表一致性硬门（把本次一次性比对固化成 vitest 守卫）

---
