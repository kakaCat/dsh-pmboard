# t-ea4b95 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项·研发

> 需求：REQ-261005105032-3b02 UI 需求必须在需求阶段交付原型产物并让原型可判定（门禁 + 唯一权威版本 + 锚点追溯）

## 在做什么
改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:52:33.662Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段：模板与门禁第一次同源——照模板写出来的文档能过门禁，写不出来的缺口被机器点名。

### 完成项

- 需求模板新增裁定记录节骨架并落真空态占位（忘删说明也不会被自己的裁定门判空节）
- 设计模板「原型页面」节改为指向权威原型与锚点，并要求引用裁定
- 拆分模板任务表增原型锚点与关联裁定两列，UI 卡验收含可失败的原型对照判据
- 实施模板范围节增两个占位符，占位符名与台账键对齐，且落库侧能真正填值
- 验收模板增两个对照项（判据与验收单逐字对齐）
- 修 D-5 家族：必填节标题容忍行尾 HTML 注释；8 份设计模板补 39 处 serves，全部 0 缺口
- 补一条「8 份设计模板渲染后喂门禁 0 缺口」的断言，并带真改盘逆验证

### 改动文件

- `templates/brainstorming/feature.md`
- `templates/design/frontend.md`
- `templates/decomposing/decomposition.md`
- `templates/implementing/task-card.md`
- `templates/accepting/verification.md`
- `src/application/internal/category-doc-sets.ts`
- `src/application/internal/task-card-generator.ts`
- `tests/category-doc-sets.test.ts`
- `tests/report-template.test.ts`
- `templates/design/architecture.md`
- `templates/design/backend.md`
- `templates/design/data-model.md`
- `templates/design/interfaces.md`
- `templates/design/migration.md`
- `templates/design/test-cases.md`
- `templates/design/use-cases.md`

### 下一步

联调段：核验模板产物能过门禁（这一卡的存在意义就是这条）。

---
