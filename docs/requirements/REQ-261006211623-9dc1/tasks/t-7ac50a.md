# t-7ac50a 复跑拆分面判据并留反向演练证据

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
复跑拆分面判据并留反向演练证据

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts → 全绿；① 卡上不写 requirement_refs、只补文档覆盖表 → 仍被拒且 gaps 点名 FR-1/FR-4/FR-7；② skipIntegration: true 缺理由 → 拒 REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED；③ 计划文档无任务表或未覆盖 tasks[].key → 拒 plan_doc_task_table_incomplete；缺列只进 plan_doc_warnings

## 实施方案（implementation）
不改实现，只复跑与取证。跑 tests/clause-coverage-gate.test.ts、tests/plan-depends-e2e.test.ts、tests/plan-doc-table.test.ts、tests/plan-footprint-tool-schema.test.ts；三条反向演练复现（只补文档覆盖表 / skipIntegration 缺理由 / 任务表缺表或覆盖不全），并核对 design/interfaces.md §二 与 data-model.md 的字段与码和实现一致。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T14:11:20.512Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

t3 收尾：拆分面四条判据复跑与三条反向演练证据已入库

### 完成项

- 子卡三段全完成：四条判据 40 例全绿、三条反向演练复现、设计契约抽样一致
- 证据文件：docs/requirements/REQ-261006211623-9dc1/tests/t3-split-side-evidence.md（含演练断言行号与未覆盖项）
- 演练关键读数：只补文档覆盖表 → 仍拒且点名 FR-1/FR-4/FR-7；缺理由 → REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED；无任务表/覆盖不全 → plan_doc_task_table_incomplete（零副作用）；缺列只进 plan_doc_warnings
- 严格口径未满足项（71 vs 68、tsc 1 vs 0）已归属并发窗口在制改动

### 改动文件

- `docs/requirements/REQ-261006211623-9dc1/tests/t3-split-side-evidence.md`

### 下一步

t4 色值无障碍定稿与客户端重建，随后链尾 t5 总门

---
