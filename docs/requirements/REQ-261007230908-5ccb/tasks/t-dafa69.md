# t-dafa69 prompt 列码校验 tests/prompt-error-codes.test.ts·研发

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
prompt 列码校验 tests/prompt-error-codes.test.ts·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/prompt-error-codes.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T15:54:41.527Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t3 研发完成：prompt 列码校验 3/3 绿，读数 17 码全注册，N3 钻按预期报红

### 完成项

- 新建 tests/prompt-error-codes.test.ts：收集面复用 helpers 导出的 isPromptFile，token 级收码并剔模板拼码与 NOISE_TOKENS
- 首版口径自证不足：引号紧贴形态只命中 1 个码 → 改为 token 级后命中 17 个（口径修正记录在用例注释里）
- 判据：3/3 绿；读数 17 个 prompt 面码全部已注册
- 负例钻 N3（prompt 塞幽灵码）→ 红并点名 src/tools/OpenWindowTool/prompt.ts → REQBOARD_NOT_A_REAL_CODE；还原后 3 绿

### 改动文件

- `tests/prompt-error-codes.test.ts`

### 下一步

复核段

---
