# t-30a8aa 系统项编号连续化（FR-3）·测试

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
系统项编号连续化（FR-3）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-items-format.test.ts tests/domain/acceptance-sheet.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts 全绿（无失败用例）

## 汇报 1（2026-09-30T12:32:29.905Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

FR-3 的目标验证全绿：编号断言、预留位清零、相关套件回归三项均符合预期。

### 完成项

- 目标命令：npx vitest run tests/sheet-items-format.test.ts tests/domain/acceptance-sheet.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts → 全绿（此前已逐套跑过，本轮 FR-3 相关套件均通过）
- 断言实测：sheet.items.map(i => i.id) 严格等于 v1-1..v1-N（N === items.length）
- grep -c 'taskCount +' src/domain/workflow/AcceptanceSheetSpec.ts → 0

### 改动文件

- `tests/sheet-items-format.test.ts`
- `tests/domain/acceptance-sheet.test.ts`

### 下一步

父卡收尾：关闭 t3。

---
