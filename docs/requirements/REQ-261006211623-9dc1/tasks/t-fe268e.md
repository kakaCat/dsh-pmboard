# t-fe268e 复跑需求面三条判据并留反向演练证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
复跑需求面三条判据并留反向演练证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts → 三文件全绿（10 + 10 + 11 例）；反向演练三条逐条可复现：① 删掉某条 FR 的判据锚点 → 提示点名该 FR；② 写 sides: [doc] → 拒 requirement_sides_invalid；③ 新需求删「失败与并发路径」节 → 拒 requirement_section_missing（存量需求放行）；三条各自贴命令与输出摘要

## 实施方案（implementation）
不改实现，只复跑与取证。读 src/application/internal/clause-criteria.ts 与 src/application/internal/content-gate-wiring.ts 的两条门，逐条跑 tests/clause-criteria.test.ts、tests/sides-declaration.test.ts、tests/doc-quality-gate.test.ts；三条反向演练按测试里的用例逐条复现（删判据锚点 / sides: [doc] / 删失败与并发路径节），把命令与输出摘要写进任务汇报，并核对设计文档 interfaces.md §二 FR-1/FR-3/FR-4 的契约与实现一致（函数名、码、强度）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T14:01:57.238Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

需求面三条判据复跑通过（31 例全绿），三条反向演练逐条复现，文档与实现契约 28/28 命中

### 完成项

- 跑 npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts → 3 文件全绿 31 例（10+10+11）
- 反向演练①：删掉条款判据锚点 → 提示点名该 FR（tests/clause-criteria.test.ts 用例通过；真文档副本演练：删掉 FR-2 判据后缺口从 0 变为 FR-2）
- 反向演练②：写 sides: [doc] → 拒 requirement_sides_invalid（tests/sides-declaration.test.ts 用例通过）
- 反向演练③：新需求删「失败与并发路径」节 → 拒 requirement_section_missing；存量需求（createdAt 早于规则起点）放行（tests/doc-quality-gate.test.ts 用例通过）
- 设计↔实现一致性：interfaces.md §二 / data-model.md 声明的 28 项契约、字段与错误码逐项在源码命中（0 项缺失，含三个新码与两个出参键）
- 顺带确认窗口修正有效：CLAUSE_CRITERIA_WINDOW 由 12 放宽到 40 后，REQ-261006123819-3af3 的 FR-3/FR-5 两处假红消失（同一文档删锚点仍能点名）

### 下一步

t2/t3/t4 三张同级卡并行复跑，t5 链尾总门等四张卡齐后开跑

---
