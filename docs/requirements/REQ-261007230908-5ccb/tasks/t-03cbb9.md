# t-03cbb9 注册表一致性硬门 tests/error-code-registry.test.ts·研发

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
注册表一致性硬门 tests/error-code-registry.test.ts·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/error-code-registry.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T15:52:24.619Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t2 研发完成：注册表硬门 11 项全绿，三条负例钻均按预期报红

### 完成项

- 新建 tests/error-code-registry.test.ts：四组守卫 11 项（双向一致 / 条目形态 / 占位噪声 / client 无回流）
- helpers 仅追加导出 isPromptFile（一行，扫描逻辑未动）；只 import scanErrorCodes 与 NOISE_TOKENS
- 判据：11/11 绿；负例钻 N1 删条目→3 红、N2 塞死码→2 红、N4 塞占位→5 红，还原后 11 绿

### 改动文件

- `tests/error-code-registry.test.ts`
- `tests/helpers/error-code-scan.ts`

### 下一步

复核段

---
