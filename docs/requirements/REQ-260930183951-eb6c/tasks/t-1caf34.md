# t-1caf34 需求级项标题单点（FR-4）·复核

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
需求级项标题单点（FR-4）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

grep -c "requirementItemTitle" src/domain/workflow/AcceptanceSheetSpec.ts ≥ 1；npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts → 17 passed (17)（含 TC-4.1 七种映射断言）

## 汇报 1（2026-09-30T12:35:29.987Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

复核结论：映射表无偏离；唯一补充是把「不可照着验」这一类也纳入了区分（否则重名问题只解决一半）。

### 完成项

- 无偏离：七种「criterion × gapKind」映射与设计 I-4 表逐行一致（需求级验收 / · E2E 覆盖 / · 孤儿用例 / · 追溯断链 / · 锚点失效 / · 三方一致性）
- 合理细化 1 处（已声明）：设计 I-4 追加了「无 gapKind 且以『验收项不可照着验』开头 → 需求级验收 · 不可照着验」一行——实现时发现不补这行，普通需求级项与该系统项仍同名，FR-4「不重名」不成立（TC-4.2 当场暴露）

### 改动文件

- `docs/requirements/REQ-260930183951-eb6c/tests/implementation-2026-09-30.md`

### 下一步

测试段：跑 FR-4 目标命令并附结果。

---
