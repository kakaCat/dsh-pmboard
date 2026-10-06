# t-7e7da9 加 R1 模板门禁探针与 R2 节名双向一致探针

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加 R1 模板门禁探针与 R2 节名双向一致探针

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：doc

## 得到什么结果
npx tsx scripts/template-gate-probe.mts 退出码 0 并打印 6 份模板逐份 OK 与『缺口 0』；人为把 templates/brainstorming/feature.md 的必填节标题改坏 → 退出码 1 且点名该模板与缺口；往模板塞未登记占位符 {{NOPE}} → 退出码 1 且点名该占位符；npx tsx scripts/doc-section-parity.mts 退出码 0，构造『模板多一节』与『门禁少一节』两个标本各退出码 1 并点名该节；两脚本 --json 输出可 JSON.parse 且退出码语义不变。

## 实施方案（implementation）
新增 scripts/template-gate-probe.mts（R1）：按 scripts/template-render-map.json 映射表渲染 templates/**/*.md 占位符（如 {{TASK_ID}}→t-000000、{{DESIGN_SERVES}}→FR-1；未在表内的占位符 → exit 1 并点名），把渲染结果喂 missingCategoryDocs + checkRequirementDocFormatGate + checkDesignSectionsHaveServes，0 缺口才 exit 0；提供 --json（机器可读结构；退出码语义不变 0 通过 / 1 判据失败 / 2 环境不可用）。新增 scripts/doc-section-parity.mts（R2）：门禁必填节集合（BASE+DELTA）与模板 H2 集合双向相等，并体现『讨论与裁定记录（D-x）』仅 feature 模板（D-12）；两个方向各造一次反例必须失败。两个脚本沿用既有 tsx 跑法（npx tsx scripts/...），不直跑 node。依据 design-brief §6 与 §10 #17/#26/#47。

## 上游产出摘要（dependsSummary）
- 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T10:14:13.930Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

这一步做完，「模板产出能不能过线上门禁」和「门禁必填节与模板节名有没有分叉」都成了可一条命令验证的机械判据——模板与门禁不再靠人记着同步。

### 完成项

- R1 模板门禁探针：按文档类分派、渲染占位符、0 缺口才 exit 0，并提供机器可读输出
- R2 节名双向一致探针：门禁必填节与模板 H2 双向相等，含裁定门节名与仅 feature 口径
- 两条探针组合成一条模板检查命令，CI 可一条命令消费
- 实测：25 份模板全 OK、缺口 0；需求模板 6 类双向漂移 0；组合命令 exit 0
- 变异验证（父窗口亲跑）：改坏必填节标题 → exit 1 并点名该模板与缺口；还原后 sha256 一致
- 如实标注：4 份模板无对应线上门禁，只做占位符登记与观察，不计入判据

### 改动文件

- `scripts/template-gate-probe.mts`
- `scripts/doc-section-parity.mts`
- `scripts/template-render-map.json`
- `package.json`

### 下一步

t21 的文档自检脚本并入本卡探针（R1 透传退出码）。

---
