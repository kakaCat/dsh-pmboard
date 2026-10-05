# REQ-260930183951-eb6c 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v4

**交付结论**：四个 FR 全部落地并有可复核证据：①FR-1 任务投影单点透传 parentId（证伪：删掉即变红）；②FR-2 锚点存在性守卫（缺失即出可见项，含无 tests/ 目录护栏）；③FR-3 系统项编号连续无空洞；④FR-4 需求级项标题单点、按缺口类型区分。另完成两项阻断性前置修复（4 个缺失模块复原；插件装载层 cordis.patch.yml 重建，此前缺失致宿主跳过 pmboard bundle、工具全失）与一处并发覆写遗留的语法损坏修复（AcceptSheet.ts:160 曾使构建失败）。验证：18 条新用例全绿；全量回归 103 failed / 2628 passed（零新增）；tsc 220→213；构建 Build complete；covers 覆盖 29 张卡。生产链路自证：宿主 20:52 加载 20:23 构建，验收单 v2/v3 即由修复后代码生成——编号连续、系统项标题可区分，v1 的跳号与三行同名不复现。

## 1. 验收列表

### v4-1 · 前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml

**验收内容**：【前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml】验收

**操作步骤**：
1. 宿主加载器复验：dsh-pmboard 不再出现在 skippedBundles，且组合后存在 id=pmboard 行（已验证 ✅）
2. npx vitest run tests/verification-sheet.test.ts 不再出现 "Failed to load url ../internal/auto-confirm.js"，且 10/10 通过
3. npx tsc --noEmit 错误数严格小于 220
4. 重启后 reqboard_* 工具可用（人验，已验 ✅）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-2 · 任务投影单点：透传 parentId（FR-1）

**验收内容**：【任务投影单点：透传 parentId（FR-1）】验收

**操作步骤**：
1. npx vitest run tests/sheet-projection.test.ts tests/verification-sheet.test.ts 全绿（实测 14/14）
2. 证伪检查（必须执行并留证）：临时删掉 toSheetTasks 返回对象里的 parentId 后重跑，TC-1.1 必须变红，随后恢复
3. grep -c "toSheetTasks" src/application/use-cases/SubmitVerification.ts ≥1 且不再出现内联 acceptance: t.acceptance 投影。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-3 · 验收锚点存在性守卫（FR-2）

**验收内容**：【验收锚点存在性守卫（FR-2）】验收

**操作步骤**：
1. npx vitest run tests/sheet-anchor-gaps.test.ts 全绿（7 条：存在不报 / 缺失点名 / 多失效只出一条项 / pending+consistency+requirement 来源 / 非测试文件不触发 / canceled 不征集 / 无 tests 目录整段跳过）
2. grep -n "anchorGaps" src/domain/workflow/AcceptanceSheetSpec.ts src/application/use-cases/SubmitVerification.ts 均命中。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-4 · 系统项编号连续化（FR-3）

**验收内容**：【系统项编号连续化（FR-3）】验收

**操作步骤**：
1. npx vitest run tests/sheet-items-format.test.ts tests/domain/acceptance-sheet.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts 全绿
2. 断言 items.map(i => i.id) 严格等于 ['v1-1', …, 'v1-N']（N === items.length）
3. grep -c "taskCount +" src/domain/workflow/AcceptanceSheetSpec.ts 输出 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-5 · 需求级项标题单点（FR-4）

**验收内容**：【需求级项标题单点（FR-4）】验收

**操作步骤**：
1. npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts tests/verification-sheet.test.ts tests/accept-sheet-tool.test.ts 全绿
2. grep -rn "'需求级验收'" src 只在 src/domain/workflow/AcceptanceSheetSpec.ts 命中
3. 渲染断言：含 E2E 缺口 + 锚点失效两张需求级项时各行标题不相同。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-6 · 端到端回归 + 生产链路自证

**验收内容**：【端到端回归 + 生产链路自证】验收

**操作步骤**：
1. npx tsc --noEmit 2>&1 | grep -c "error TS" 不高于 t0 后基线（213）
2. npx vitest run 2>&1 | grep "Tests " 失败数不高于 103（零新增）
3. npx tsdown -c tsdown.config.mjs 2>&1 | tail -1 含 Build complete
4. 2d65 重交后验收单满足「任务项 = 6 ∧ 含追溯断链项 ∧ 含锚点失效项 ∧ 编号连续」（存证到本需求 tests/）。如实声明：生产链路自证要求宿主已加载新构建，若未加载则不得声称通过，须在验收材料标注「生产链路自证未完成，仅单测覆盖」。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

### v4-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）

**验收状态**：✓ 通过

---

## 2. 测试报告

- docs/requirements/REQ-260930183951-eb6c/tests/test-evidence.md（测试证据 + covers 标注，29 张卡全覆盖）
- npx vitest run tests/sheet-projection.test.ts tests/sheet-anchor-gaps.test.ts tests/sheet-items-format.test.ts tests/sheet-selfproof.test.ts → 18 条用例全绿
- npx vitest run → Tests 103 failed / 2628 passed（失败数与施工前基线同为 103，零新增）
- npx tsc --noEmit 2>&1 | grep -c "error TS" → 213（施工前 220）
- npx tsdown -c tsdown.config.mjs → Build complete in 1203ms
- 宿主 20:52 已加载 20:23 构建：v2/v3 验收单可直接核对 FR-1~FR-4 的编号连续与标题区分
- docs/requirements/REQ-260930183951-eb6c/tests/implementation-2026-09-30.md
- docs/requirements/REQ-260930183951-eb6c/tests/repair-2026-09-30.md
- docs/requirements/REQ-260930183951-eb6c/tests/incident-2026-09-30-docs-wipe.md
- docs/requirements/REQ-260930183951-eb6c/reviews/review-round-1.md
- cordis.patch.yml

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v4-1 | 前置修复：复原 4 个缺失模块 + 重建插件装载层 cordis.patch.yml | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-2 | 任务投影单点：透传 parentId（FR-1） | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-3 | 验收锚点存在性守卫（FR-2） | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-4 | 系统项编号连续化（FR-3） | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-5 | 需求级项标题单点（FR-4） | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-6 | 端到端回归 + 生产链路自证 | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-7 | 需求级验收 | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
| v4-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-3643cb19-3ef8-4687-9636-586f8826d1a9 | 2026-09-30 21:48 |
