# t-cfb44b 系统项编号连续化（FR-3）·联调

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
系统项编号连续化（FR-3）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/sheet-selfproof.test.ts → 1 passed；该用例断言 sheet.items.map(i => i.id) 严格等于 v1-1..v1-N（N === items.length，无空洞）

## 汇报 1（2026-09-30T12:32:15.315Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

编号在整链上也连续了：真实 use case 产出的单据逐项对得上 v1-1..v1-N，且原有断言未被破坏。

### 完成项

- 整链用例 tests/sheet-selfproof.test.ts：真实 use case 产出的验收单 id 严格等于 v1-1..v1-N（N === items.length），无空洞
- 既有套件回归：tests/domain/acceptance-sheet.test.ts、tests/e2e-coverage.test.ts、tests/consistency.test.ts、tests/design-serves-gate.test.ts 全绿（旧口径断言未被破坏）

### 改动文件

- `tests/sheet-selfproof.test.ts`

### 下一步

复核段：核对编号契约与设计 D-1/I-3 一致。

---
