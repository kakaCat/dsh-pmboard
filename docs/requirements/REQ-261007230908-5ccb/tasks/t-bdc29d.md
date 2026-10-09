# t-bdc29d 双拼归一单源化 dual-field.ts + 4 处改写·研发

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
双拼归一单源化 dual-field.ts + 4 处改写·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/dual-field.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T15:50:36.773Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

研发完成：dual-field 单源模块落地，4 处双拼读取点改调用，单测 10/10 绿

### 完成项

- 新建 src/shared/dual-field.ts（readDual/dualMapMerged 纯函数，语义与 data-model.md 语义表逐字对应）
- protocol.ts 3 处、plan-granularity.ts 1 处改为调用（含导入与注释）
- 判据：npx vitest run tests/dual-field.test.ts → 10/10 绿；pnpm typecheck → 0 错

### 改动文件

- `src/shared/dual-field.ts`
- `src/shared/protocol.ts`
- `src/application/internal/plan-granularity.ts`
- `tests/dual-field.test.ts`

### 下一步

联调段：确认无接口面

---
