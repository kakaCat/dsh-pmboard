# t-f5aa5a 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
npx vitest run tests/category-doc-sets.test.ts 全绿且含断言：templates/brainstorming/feature.md 与 templates/design/frontend.md 渲染占位符后喂 hasRootSection/missingCategoryDocs → 0 缺口（D-5 逆验证：把必填节标题改坏 → 必红）；feature.md 的 H2 集合含『讨论与裁定记录（D-x）』而其余五份同族模板不含（D-12）；decomposition.md 任务表表头含『原型锚点』与『关联 D-x』；verification.md 含『与原型对照截图』与『D-x 对照』；task-card.md 含两个新占位符。pnpm typecheck 退出码 0。

## 实施方案（implementation）
逐份改：① templates/brainstorming/feature.md 增『讨论与裁定记录（D-x）』节骨架（表格五列 编号/原话来源/裁定/影响 FR/判据；仅 feature，同族五份不动，D-12）。② templates/brainstorming/prototype.html（t11 已迁入）确认含 id="FR-N" 区块位、单块 proto-geometry 位、INDEX 四列表格骨架、权威标记位。③ templates/design/frontend.md『原型页面』节改为指向权威原型与锚点（P-x/C-x ↔ #FR-N）并要求引用 D-x。④ templates/decomposing/decomposition.md 任务表增『原型锚点』『关联 D-x』两列（UI 卡必填），且 UI 卡验收标准模板含至少一条可失败的原型对照判据（结构断言 + 几何量硬判据）。⑤ templates/implementing/task-card.md『范围』节增『原型锚点』『关联 D-x』两个占位符，且占位符名必须与落库写入对齐（现有 {{DESIGN_SERVES}} 落库实测为空，不得再出现『模板有、落库无』）。⑥ templates/accepting/verification.md 增『与原型对照截图』『D-x 对照』两项。顺带修同族缺陷（D-5）：必填节标题的 serves 尾巴统一改成（serves: FR-x）括号写法（或让 hasRootSection 容忍行尾 HTML 注释，二选一并在卡内说明选了哪个），使照模板写出的文档能过 G2 必填节门禁。改完跑 npx tsx scripts/template-gate-probe.mts（t19 交付）确认 0 缺口。

## 上游产出摘要（dependsSummary）
- 实现原型三门与元数据解析（prototype-gates.ts + 条件必交判定）
- 实现裁定记录门与会话留痕判据（decision-gates.ts）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T05:52:38.903Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，模板与门禁第一次同源：照模板写出来的文档能过门禁，而「模板有、落库无」这类分叉被机器点名。

### 完成项

- 需求模板新增裁定记录节骨架，并落逐字真空态占位（防新需求被自己的裁定门拦死）
- 设计模板「原型页面」改为指向权威原型与锚点并要求引用裁定
- 拆分模板任务表增原型锚点与关联裁定两列，UI 卡验收含可失败的原型对照判据
- 实施模板范围节增两个占位符，名字与台账键对齐且落库侧可填值
- 验收模板增两个对照项（判据与验收单逐字对齐）
- 修 D-5 家族：必填节标题容忍行尾 HTML 注释；8 份设计模板补 39 处 serves，全部 0 缺口
- 补「8 份设计模板喂门禁 0 缺口」断言 + 真改盘逆验证；78 例全绿、tsc=0

### 改动文件

- `templates/brainstorming/feature.md`
- `templates/design/frontend.md`
- `templates/decomposing/decomposition.md`
- `templates/implementing/task-card.md`
- `templates/accepting/verification.md`
- `templates/design/architecture.md`
- `templates/design/backend.md`
- `templates/design/data-model.md`
- `templates/design/interfaces.md`
- `templates/design/migration.md`
- `templates/design/test-cases.md`
- `templates/design/use-cases.md`
- `src/application/internal/category-doc-sets.ts`
- `src/application/internal/task-card-generator.ts`
- `tests/category-doc-sets.test.ts`
- `tests/report-template.test.ts`

### 下一步

t19 的 R1 探针按文档类分派（需求模板 → 必填节 + 格式门；设计模板 → serves 门），并排除 examples/。

---
