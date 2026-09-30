# t-beb9d9 系统项编号连续化（FR-3）·复核

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
系统项编号连续化（FR-3）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

grep -c "taskCount +" src/domain/workflow/AcceptanceSheetSpec.ts = 0；grep -c "ItemDraft" src/domain/workflow/AcceptanceSheetSpec.ts ≥ 2；npx vitest run tests/sheet-items-format.test.ts → 7 passed (7)

## 汇报 1（2026-09-30T12:32:23.111Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

复核结论：无偏离——编号与顺序契约逐条对齐设计，唯一补充是内部用一个「未编号草稿」类型表达，不影响对外契约。

### 完成项

- 无偏离：编号契约（id = v<version>-<n>，n 连续到 items.length，无空洞）与设计 D-1 / I-3 一致；项顺序（任务项→需求级→孤儿→不可照验→E2E→三方一致性→锚点失效→追溯断链）与 I-3 表逐行一致
- 无偏离：返工续版（reworkOnly）沿用「只带未过项 + 未裁决项」语义并同样连续重排，与 D-5 兼容矩阵一致
- 合理细化 1 处（已声明）：实现里引入非导出的 ItemDraft 类型承载「未编号草稿」，属内部表达、不改对外契约

### 改动文件

- `docs/requirements/REQ-260930183951-eb6c/tests/implementation-2026-09-30.md`

### 下一步

测试段：跑 FR-3 目标命令并附结果。

---
