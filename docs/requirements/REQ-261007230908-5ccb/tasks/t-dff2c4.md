# t-dff2c4 prompt 列码校验 tests/prompt-error-codes.test.ts

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
prompt 列码校验 tests/prompt-error-codes.test.ts

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm vitest run tests/prompt-error-codes.test.ts 退出码 0；负例钻 N3（prompt 写 REQBOARD_NOT_REAL）红并点名文件与码

## 实施方案（implementation）
新建 tests/prompt-error-codes.test.ts；用 tsx 负例验证红路径后还原

## 上游产出摘要（dependsSummary）
- 建错误码注册表常量模块 error-code-registry.ts

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:55:32.967Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t3 完成：prompt 列码校验落地，3/3 绿、N3 钻报红

### 完成项

- IF-3 落地：tests/prompt-error-codes.test.ts（3 项断言 + 读数）
- 收集面复用 helpers.isPromptFile（单源）；token 级收码并剔模板拼码与 NOISE_TOKENS
- 判据：3/3 绿、读数 17 码全注册；N3 钻（塞幽灵码）红并点名文件与码
- 三张子卡（研发/复核/测试）全部完成；口径收紧偏差已在测试段响亮声明

### 改动文件

- `tests/prompt-error-codes.test.ts`

### 下一步

t6 G5 补全四工具 prompt 漏码

---
