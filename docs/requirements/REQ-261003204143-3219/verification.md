# REQ-261003204143-3219 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：reqboard_capture 回执契约修复完成：① FR-1 schema 的 answers.workspace 声明已在树（并行窗口落地，本需求核对+注释锚点保留）② FR-2 新增 tests/capture-output-contract.test.ts 用绑定层同款校验器过真实回执（成功/取消两路径，3 用例全绿）③ FR-3 answers 五键收敛为 CAPTURE_ANSWER_KEYS 单一事实源，类型/schema/测试三方同源。反向演练双向证成：摘声明→用例红点名、摘常量键→tsc+用例双红点名。口径偏差一处已获人批准：t3 五文件改四文件全绿（capture.test.ts 红归属并行窗口在制改动）。弹框内容逻辑零改动、无顺手重构。注意：运行中的插件加载的是 lib/ 构建产物，本修复需构建重载后才在弹框通道生效

## 1. 验收列表

### v1-1 · 验证契约用例能抓住漂移（复现卡）

**验收内容**：【验证契约用例能抓住漂移（复现卡）】验收

**操作步骤**：
1. 临时从 src/tools/CaptureTool/CaptureTool.ts 的 output.schema.answers 摘除 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts 红且违例信息点名 answers.workspace
2. 恢复声明后同命令全绿。证据 = 红/绿两次运行的输出摘要

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

### v1-2 · 落地 answers 键共享常量并核对 schema 声明（修复卡）

**验收内容**：【落地 answers 键共享常量并核对 schema 声明（修复卡）】验收

**操作步骤**：
1. capture-mapping.ts 导出 CAPTURE_ANSWER_KEYS 且 CaptureMapping.answers 类型由其派生
2. CaptureTool.ts 的 answers.properties 由常量生成（grep 到生成式锚点、无手写五行）
3. npx tsc --noEmit 通过
4. 反向演练②：从常量摘一键 → tsc 报错或键集断言红并点名

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

### v1-3 · 全量回归与反向演练证据（回归测试卡）

**验收内容**：【全量回归与反向演练证据（回归测试卡）】验收

**操作步骤**：
1. 四文件全绿：npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts tests/tools-schema.test.ts tests/capture-hook.test.ts
2. tests/capture.test.ts 的红（断言「不许沉默」）归属并行窗口 REQ-261003204149-1e80 在制改动（capture-section.ts 重写删硬化语、测试只改签名未改断言），本需求零新增失败（pnpm test 98 failed 与文档基线一致）
3. t2 反向演练②证据（摘键→tsc+用例双红点名→恢复绿）写入实施记录

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

### v1-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收 · 不可照着验

**验收内容**：验收项不可照着验（历史数据）：以下验收项没写「怎么验」——验收项 验证契约用例能抓住漂移（复现卡）·分析 缺「怎么验」（"结论含置信度与适用边界，并列出被证伪的假设（附支撑数据的命令或 `docs/requirements/<REQ>/` 下证据路径）"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。。请补可执行操作（命令/可查数据/界面路径）；本条不阻断验收，但必须有人看过并决定。

**操作步骤**：
1. 验收项不可照着验（历史数据）：以下验收项没写「怎么验」——验收项 验证契约用例能抓住漂移（复现卡）·分析 缺「怎么验」（"结论含置信度与适用边界，并列出被证伪的假设（附支撑数据的命令或 `docs/requirements/<REQ>/` 下证据路径）"）——只写断言词不算，必须给**可执行操作**：命令（npx/vitest/curl/pytest…）、可查数据（SQL/字段名）、或可达界面路径（打开某页→看什么）。否则验收只能靠相信，等于没验。。请补可执行操作（命令/可查数据/界面路径）
2. 本条不阻断验收，但必须有人看过并决定。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3

**验收状态**：✓ 通过

---

## 2. 测试报告

- 复现步骤（修前红→修后绿）：临时摘除 CaptureTool.ts 的 workspace 声明 → npx vitest run tests/capture-output-contract.test.ts = 2 failed（违例原文「value.answers.workspace is not a declared property」，与 2026-10-03 20:44 生产实测逐字一致）→ 恢复后 2 passed；证据 docs/requirements/REQ-261003204143-3219/tests/test-evidence.md §3
- 回归测试：npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts tests/tools-schema.test.ts tests/capture-hook.test.ts = 4 文件 95 tests 全绿；证据 test-evidence.md §2
- 反向演练②（防漂移机制证成）：摘 CAPTURE_ANSWER_KEYS 一键 → tsc TS2353 两处点名（capture-mapping.ts:262、CaptureTool.ts:31）+ 契约用例 3 红 → 恢复后 3 passed；证据 test-evidence.md §4
- 全量回归：pnpm test = 3419 passed / 98 failed，与说明书登记基线一致零新增；tests/capture.test.ts 1 红归属并行窗口 REQ-261003204149-1e80 在制改动；证据 test-evidence.md §5/§6
- 根因↔修复对应：根因=第五问上线时三处同步漏改输出 schema 嵌套声明且静态扫描只管顶层键；修复=CAPTURE_ANSWER_KEYS 单一事实源（capture-mapping.ts 导出+类型派生 / CaptureTool.ts 生成式 properties / 契约用例键集断言）
- 类型检查：npx tsc --noEmit 归属本需求三文件错误=0
- 改动文件：src/application/internal/capture-mapping.ts、src/tools/CaptureTool/CaptureTool.ts、tests/capture-output-contract.test.ts（新增）；评审报告 docs/requirements/REQ-261003204143-3219/reviews/review-report.md；任务覆盖对照 test-evidence.md §0

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 验证契约用例能抓住漂移（复现卡） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
| v1-2 | 落地 answers 键共享常量并核对 schema 声明（修复卡） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
| v1-3 | 全量回归与反向演练证据（回归测试卡） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
| v1-4 | 需求级验收 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
| v1-5 | 需求级验收 · 不可照着验 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
| v1-6 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-03 22:21 |
