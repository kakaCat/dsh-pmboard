# REQ-261006211623-9dc1 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：三面文档判据加固交付完成：条款级判据软门禁、设计坐标探针、sides 与失败并发路径两条硬门、拆分面四条；五张卡全完成、covers 18/18、三条总门 exit 0、矩阵 8/8、本需求引入回归失败 0 条。独立评审「有条件通过」（C1–C5 已处置、C6 交人裁定）。诚实边界：全量集合差 69 vs 68、tsc 1 vs 0（均属并发窗口在制面）；新门与新字段需宿主重载插件后生效。

## 1. 验收列表

### v1-1 · 复跑需求面三条判据并留反向演练证据

**验收内容**：【复跑需求面三条判据并留反向演练证据】验收

**操作步骤**：
1. npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts → 三文件全绿（10 + 10 + 11 例）
2. 反向演练三条逐条可复现：① 删掉某条 FR 的判据锚点 → 提示点名该 FR
3. ② 写 sides: [doc] → 拒 requirement_sides_invalid
4. ③ 新需求删「失败与并发路径」节 → 拒 requirement_section_missing（存量需求放行）
5. 三条各自贴命令与输出摘要

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts → 3 passed / 31 tests；反向演练三条逐条复现（删锚点点名该 FR / sides:[doc] 拒 requirement_sides_invalid / 删节拒 requirement_section_missing 且存量放行）

**验收状态**：✓ 通过

---

### v1-2 · 复跑设计坐标探针并留存量读数

**验收内容**：【复跑设计坐标探针并留存量读数】验收

**操作步骤**：
1. npx tsx scripts/design-coord-probe.mts --specimen → exit 0（5/5 标本按预期，标本①内部 exit 1 并点名）
2. npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1 → exit 0、缺口 0（本需求设计文档过自己的探针）
3. npx vitest run tests/design-coord-probe.test.ts → 19 passed
4. 存量读数（78 个有 design/ 的需求：18 绿 / 60 红）与口径说明写进任务汇报

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：探针 --specimen exit 0（5/5）、--req 本需求 exit 0 缺口 0、npx vitest run tests/design-coord-probe.test.ts → 19 passed；权威存量读数（14:28 UTC，逐份落盘读）：79 份 / 19 绿 / 60 红 · 路径 125 / 回写 466 / 排除 1204

**验收状态**：✓ 通过

---

### v1-3 · 复跑拆分面判据并留反向演练证据

**验收内容**：【复跑拆分面判据并留反向演练证据】验收

**操作步骤**：
1. npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts → 全绿
2. ① 卡上不写 requirement_refs、只补文档覆盖表 → 仍被拒且 gaps 点名 FR-1/FR-4/FR-7
3. ② skipIntegration: true 缺理由 → 拒 REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED
4. ③ 计划文档无任务表或未覆盖 tasks[].key → 拒 plan_doc_task_table_incomplete
5. 缺列只进 plan_doc_warnings

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts → 4 passed / 40 tests；演练：只补文档覆盖表仍拒（点名 FR-1/FR-4/FR-7）、缺理由拒 REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED、无任务表拒 plan_doc_task_table_incomplete

**验收状态**：✓ 通过

---

### v1-4 · 红标色值按无障碍定稿并重建客户端

**验收内容**：【红标色值按无障碍定稿并重建客户端】验收

**操作步骤**：
1. grep -n "991b1b" src/client/styles/node-panel.ts src/client/styles/subtask.ts src/client/styles/report.ts → 命中 3 处
2. pnpm build:client → [verify-client] OK（关键符号齐全 / 样式归属章在场 / CSS 分片完整）
3. npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts → 全绿（含 in_progress 未声明仍标红、done 未声明不标）
4. 与 prototypes/dag-chain-missing.html#FR-6 的判据说明逐条对照，差异写进任务汇报

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：三处样式命中 991b1b；pnpm build:client → [verify-client] OK；npx vitest run card-layer/query-report/dag-panel/node-panel → 4 passed / 107 tests；对比度独立复算：定稿 7.12:1（达标）、改前琥珀 3.94:1（不达标）

**验收状态**：✓ 通过

---

### v1-5 · 复跑三条总门并把复核材料与实现对齐

**验收内容**：【复跑三条总门并把复核材料与实现对齐】验收

**操作步骤**：
1. pnpm templates:check → exit 0（模板 25 份 OK、需求模板 6 类双向一致）
2. pnpm prompts:verify → exit 0
3. npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1 → 缺口 0、exit 0
4. npx tsx scripts/reverse-drill-matrix.mts --group hard → 8/8、exit 0（还原逐字节 + sha256）
5. pnpm test 的失败集合差逐条给出归属（本需求引入 0 条）
6. pnpm build 后 grep -c "requirement_sides_invalid" dist/index.mjs > 0，且写明宿主重载插件后新门才生效

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm templates:check exit 0；pnpm prompts:verify exit 0；reverse-drill-matrix --group hard 8/8 exit 0；pnpm build exit 0 且 dist 含新码；全量集合差 69 vs 68 逐条归因（本需求引入 0 条）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级 8 条验收标准逐条有读数：三条总门 exit 0；反向演练三条各自可复现；存量不追溯；存量文档零改写。已知偏差逐条列明不静默：requirement.md FR-1 写 9 passed 实测 10；存量读数在 requirement.md 是更早时点值；需求文档在 accepting 阶段无法重交修正

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：逐条兑现：D-1/D-2 按底稿开工并立项绑定；D-3 refs 单口径（只补文档表仍被拒的用例为证）；D-4 失败与并发路径按创建时间硬门、刻意不进 CATEGORY_DELTAS；D-5 存量不追溯（79 份存量文档零改写、探针按需跑）；D-6 分状态不对称标红已落地（防腐烂回归用例）

**验收状态**：✓ 通过

---

## 2. 测试报告

- pnpm templates:check → exit 0（模板 25 份 OK 25、需求模板 6 类双向一致、文档自检缺口 0）
- pnpm prompts:verify → exit 0（逐字节一致）
- npx tsx scripts/reverse-drill-matrix.mts --group hard → exit 0 · 8/8 ✅（还原过 sha256）
- npx tsx scripts/design-coord-probe.mts --specimen → exit 0（5/5）；--req 本需求 → 缺口 0、exit 0
- npx vitest run 需求面 31 passed · 拆分面 40 passed · 客户端 107 passed
- 全量集合差：失败 69 vs 基线 68；新增 9 条全部落在并发窗口在制面，本需求引入 0 条
- npx tsc --noEmit → 错误 1 条（并发窗口在制文件）；本需求改动文件 0 条
- pnpm build → exit 0；dist 含 requirement_sides_invalid（1）与 clause_criteria_warnings/DOC_QUALITY_RULES_SINCE（5）；pnpm build:client → [verify-client] OK
- 逐卡证据（covers 18/18）：docs/requirements/REQ-261006211623-9dc1/tests/t1-requirement-side-evidence.md
- docs/requirements/REQ-261006211623-9dc1/tests/t2-design-coord-evidence.md（权威存量读数 79 份 / 19 绿 / 60 红 · 125 / 466 / 1204）
- docs/requirements/REQ-261006211623-9dc1/tests/t3-split-side-evidence.md
- docs/requirements/REQ-261006211623-9dc1/tests/t4-chain-missing-color-evidence.md（原型六项对照 + 对比度 7.12:1 vs 3.94:1）
- docs/requirements/REQ-261006211623-9dc1/tests/t5-total-gates-evidence.md
- 独立评审：docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md（有条件通过 + D-1…D-6 逐条裁定）
- 复核材料：docs/reviews/doc-quality-gates-2026-10-06.md（§2.3 实施读数、§2.4 独立评审逐条处置含 C1–C6 与 R2/R3/R4/R7 已知边界）
- 存量实测（未改写存量文档）：条款判据 229/456 条缺判据；sides 34/79 份缺失、2 份非法值；设计坐标 79 份里 19 绿 / 60 红

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 复跑需求面三条判据并留反向演练证据 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-2 | 复跑设计坐标探针并留存量读数 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-3 | 复跑拆分面判据并留反向演练证据 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-4 | 红标色值按无障碍定稿并重建客户端 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-5 | 复跑三条总门并把复核材料与实现对齐 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 09:53 |
