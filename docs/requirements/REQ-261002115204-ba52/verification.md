# REQ-261002115204-ba52 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：长文本工具参数的写法约定已全量落地并自证，覆盖 3 条 FR——FR-1 报告工具入参写清怎么写（三锚点：每条短句 ≤60 字 / 需引号用「」/ 超长拆多次调用）；FR-2 约定收敛为一处共享常量 LONG_TEXT_ARG_NOTE + 覆盖清单 LONG_TEXT_FIELDS（15 条 / 8 工具），各工具 description 引用它，遍历用例守覆盖面；FR-3 实施阶段轻档/重档片段加「汇报自检」（C-16 重生成、C-17 校验通过）。零行为变更已核验：入参 schema / 必填 / 返回体 7 键、错误码、落盘格式全部未动；全量回归失败集合与开工基线逐一对齐（49 文件 / 98 用例），通过数 2991 → 3001；改动清单过滤 tsc 输出零命中；回滚路径演练通过（还原文本 → 用例复现红）。构建产物 dist/index.mjs 已含新文本（重启宿主生效）。本条为旧需求 REQ-261002110908-81d0 的重开复用（正文一字不改、仅换 id + provenance），实现与证据同源。如实记录 3 处数字口径偏差与 1 处设计落点偏离，见 tests/test-evidence.md、reviews/self-review.md 与 notes/t5-verification-evidence.md。

## 1. 验收列表

### v1-1 · 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手

**验收内容**：【定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts -t 约定常量 全绿：LONG_TEXT_ARG_NOTE 同时含三锚点（短句字数上限 /「」代引号 / 拆多次调用）且长度 ≤120 字
2. LONG_TEXT_FIELDS 为只读且登记 ≥7 个工具
3. 反向：assertNoteAnchors('随便一段没有约定的文本') 返回非空缺失列表（证明断言非恒真）。改前必红（文件不存在，exit 1）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-2 · 汇报工具描述落三锚点（reqboard_task_report）

**验收内容**：【汇报工具描述落三锚点（reqboard_task_report）】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts -t 报告 全绿：TASK_REPORT_PROMPT 与 summary/completed/next_step 的 description 均命中锚点
2. node -e 断言三字段的 type/required 与基线一致（零行为变更：参数字段集合 = {task_id,summary,completed,files_changed,next_step}、required = {task_id,summary}、返回体 7 键不变）
3. npx vitest run tests/task-report.test.ts 保持全绿（既有行为未变）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-3 · 同类长文本工具接入同一约定 + 遍历覆盖用例

**验收内容**：【同类长文本工具接入同一约定 + 遍历覆盖用例】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts -t 覆盖 全绿：清单 15 条「工具.字段」零缺项，失败时输出缺失名单
2. 反向：临时删除任一字段的约定短语 → 该用例必须红（TC-4）
3. npx tsc --noEmit 无新增错误（≤197 且改动文件零新增）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-4 · 实施片段加「汇报自检」并按 C-16/C-17 重生成校验

**验收内容**：【实施片段加「汇报自检」并按 C-16/C-17 重生成校验】验收

**操作步骤**：
1. node scripts/inline-prompt-fragments.mjs 退出码 0 且 generated/ 有更新（128 fragments / 72702 bytes）
2. node scripts/check-prompt-fragments.mjs 退出码 0（片段与产物一致、heavy 与 vendor 原文逐字节一致）
3. grep -c 汇报自检 src/domain/prompt/generated/fragments.ts = 3（≥1）
4. 反向：手工改一处生成产物 → check-prompt-fragments 必须非零退出（验完还原）
5. npx vitest run tests/prompt-tiers.test.ts 全绿（light 档 ≤2500 字符）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-5 · 零变更核验 + 全量回归 + 回滚路径演练（兼容卡）

**验收内容**：【零变更核验 + 全量回归 + 回滚路径演练（兼容卡）】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts 全绿（10 passed，含 TC-1/1b/2/4/5 与两条反向）
2. npx vitest run 失败集合与开工基线（49 文件 / 98 用例）逐一对齐且通过数 2991 → 3001
3. npx tsc --noEmit 错误数 197 = 197 且改动文件零新增
4. 回滚演练：破坏锚点 → 4 failed，还原 → 10 passed
5. pnpm build exit 0 且 dist/index.mjs 命中「拆成多次调用」×3、「汇报自检」×2。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts

**验收状态**：✓ 通过

---

## 2. 测试报告

- 用例证据：npx vitest run tests/arg-guidance.test.ts → 10 passed（TC-1/1b/2/4/5 + 两条反向证伪），exit 0；文件 tests/arg-guidance.test.ts
- 反向证伪证据：摘掉 LONG_TEXT_ARG_NOTE 任一锚点 → 4~6 条用例转红；摘掉 reqboard_task_regenerate.reason 的约定 → TC-2 红并点名「reqboard_task_regenerate.reason（缺 短句上限/「」代引号/拆多次调用）」；还原后 10 passed
- 全量回归证据：npx vitest run --reporter=dot → 49 failed / 251 passed（303 文件）；98 failed / 3001 passed（3119 用例）；与开工基线（49 文件 / 98 用例失败，通过 2991）失败集合逐一对齐；基线记录 docs/requirements/REQ-261002115204-ba52/notes/baseline-2026-10-02.md
- 类型核验证据：npx tsc --noEmit → 194 行（基线 197）；按本次改动清单（14 个文件）过滤输出 → 0 命中；存量 2 条位于 src/tools/RunStatusTool/RunStatusTool.ts:122 与 src/tools/StatusTool/StatusTool.ts:13，不在改动清单内
- 片段契约证据：node scripts/inline-prompt-fragments.mjs → exit 0（128 fragments / 72574 bytes）；node scripts/check-prompt-fragments.mjs → exit 0；反向改一处产物 → 非零退出（expected 72574 / actual 72576）
- 构建与生效证据：pnpm build → exit 0（[verify-client] OK, bundle=335555 bytes）；dist/index.mjs（mtime 11:58:29）命中「拆成多次调用」×2、「汇报自检」×2
- 回滚路径证据：把 LONG_TEXT_ARG_NOTE 还原为旧形态 → 6 failed / 4 passed；还原 → 10 passed（无数据迁移、无状态残留）
- 核验记录与口径偏差：docs/requirements/REQ-261002115204-ba52/notes/t5-verification-evidence.md（含 dist 命中 ×2 非 ×3、generated 命中 ×2 且 72574 bytes 非 72702、tsc 194 非 197 三处如实记录）
- 测试证据文档（含 covers: t-xxx 卡↔测试标注，16 张卡全覆盖）：docs/requirements/REQ-261002115204-ba52/tests/test-evidence.md
- 评审报告：docs/requirements/REQ-261002115204-ba52/reviews/self-review.md（维度清单 + 5 条问题与偏差，含 1 处设计落点偏离与死锁问题属范围外的说明）
- 任务卡完工记录：docs/requirements/REQ-261002115204-ba52/tasks/ 下 12 份卡文档（5 张父卡 + 7 张子卡）均含完工记录与命令证据
- 改动落点：src/tools/shared.ts（LONG_TEXT_ARG_NOTE + LONG_TEXT_FIELDS）、8 个工具文件的长文本字段说明（TaskReportTool/SubmitTool/AskConfirmTool/TaskMoveTool/CaptureTool/NoteInterruptionTool/AdoptTaskTool/RegenerateTool）、src/domain/prompt/fragments/implementing/{light/overrides.md,heavy/overrides.md} 与 src/domain/prompt/generated/fragments.ts

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手 | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-2 | 汇报工具描述落三锚点（reqboard_task_report） | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-3 | 同类长文本工具接入同一约定 + 遍历覆盖用例 | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-4 | 实施片段加「汇报自检」并按 C-16/C-17 重生成校验 | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-5 | 零变更核验 + 全量回归 + 回滚路径演练（兼容卡） | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5 | 2026-10-02 12:01 |
