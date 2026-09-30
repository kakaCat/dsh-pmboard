# t-543bfd 需求级项标题单点（FR-4）·测试

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
需求级项标题单点（FR-4）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts tests/verification-sheet.test.ts tests/accept-sheet-tool.test.ts 全绿（无失败用例）

## 汇报 1（2026-09-30T12:35:40.094Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

FR-4 的目标验证全绿：四套件通过、字面量收敛到单点、标题不重名三条都达标。

### 完成项

- 目标命令：npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts tests/verification-sheet.test.ts tests/accept-sheet-tool.test.ts → 全绿（四套件均已跑通）
- grep -rn "'需求级验收'" src → 只在 src/domain/workflow/AcceptanceSheetSpec.ts 命中
- 渲染断言：含 E2E 缺口 + 锚点失效的验收单，各需求级项标题互不相同

### 改动文件

- `tests/sheet-items-format.test.ts`
- `tests/domain/verification-doc.test.ts`

### 下一步

父卡收尾：关闭 t4。

---
