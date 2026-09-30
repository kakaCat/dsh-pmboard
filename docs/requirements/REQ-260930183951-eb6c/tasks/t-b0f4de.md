# t-b0f4de 任务投影单点：透传 parentId（FR-1）·测试

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
任务投影单点：透传 parentId（FR-1）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-projection.test.ts tests/verification-sheet.test.ts → 14 passed (14)；grep -c "acceptance: t.acceptance" src/application/use-cases/SubmitVerification.ts = 0（内联投影已清除）

## 汇报 1（2026-09-30T12:28:40.520Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

FR-1 的目标验证全绿：14/14 通过，且「投影单点已被采用、旧的内联投影已清空」两条 grep 复核都命中预期值。

### 完成项

- 目标命令：npx vitest run tests/sheet-projection.test.ts tests/verification-sheet.test.ts → Test Files 2 passed (2) / Tests 14 passed (14)
- grep -c 'toSheetTasks' src/application/use-cases/SubmitVerification.ts → 3（≥1）
- grep -c 'acceptance: t.acceptance' src/application/use-cases/SubmitVerification.ts → 0（内联投影已清除）

### 改动文件

- `tests/sheet-projection.test.ts`
- `tests/verification-sheet.test.ts`

### 下一步

父卡收尾：子卡链 4 张已全 done，关闭 t1。

---
