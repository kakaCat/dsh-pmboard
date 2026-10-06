# t-4c36ac 两处入口回链（说明书索引 + 运行前提页机制一句）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
两处入口回链（说明书索引 + 运行前提页机制一句）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
① grep -rn 'plugin-reload-troubleshooting' docs/architecture/ → 命中 ≥ 2 行，且分别落在 project-manual.md 与 plugin-runtime-prerequisites.md
② plugin-runtime-prerequisites.md 的命中行含 rev
③ git diff --numstat 两页 → 删除列（第二列）为 0

## 实施方案（implementation）
1. docs/architecture/project-manual.md 的索引区新增一行：现象（控制台出现插件包 404 / plugins/events ERR_FAILED）→ 条目相对链接 ../guides/plugin-reload-troubleshooting.md；只增行。
2. docs/architecture/plugin-runtime-prerequisites.md 的「二、构建产物 ≠ 已加载模块」节末尾追加一句机制（包地址带 rev，宿主只服务当前 rev，过期即 404）+ 指向条目的链接；不是裸链接，只追加。
3. 不改两页既有结论、表格结构与标题层级。

## 上游产出摘要（dependsSummary）
- 写排查条目页并落实判据契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T04:10:47.911Z，窗口 session-c9490164-89ba-491f-90ba-824aa5002549）

父卡收尾：两处入口回链已挂且为纯追加，子卡链两段全绿，无偏离。

### 完成项

- 交付：project-manual.md 索引表 +1 行（现象 → 条目链接）
- 交付：plugin-runtime-prerequisites.md 第二节末尾 +6 行机制段（rev 来源、只服务当前 rev、过期即 404）+ 条目链接
- 两处均纯追加：hunk 为 @@ -12,0 +14 @@ 与 @@ -41,0 +42,6 @@，零删除
- 入链命中 2 行分落两页，运行前提页命中行含 rev
- 子卡链两段收口：研发（t-804218）与复核（t-d15f42）均 done，复核结论为无偏离
- 验收 ③ 的逐字口径受本工作树既有改动影响，已在复核段用 hunk 级证据点名归属，不作为返工项

### 改动文件

- `docs/architecture/project-manual.md`
- `docs/architecture/plugin-runtime-prerequisites.md`

### 下一步

开 t-890bc5：判据实测定标并把读数回写条目与用例表

---
