# REQ-261002110908-81d0 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：长文本工具参数的写法约定已写进工具描述与实施提示词——约定只有一个来源（shared.ts 的 LONG_TEXT_ARG_NOTE，42 字含短句/「」代引号/超长拆多次三锚点），覆盖 8 个工具 15 条长文本字段，漏接会被遍历用例点名；入参 schema、返回体、错误码、落盘格式零变更。自检：新增 10 条用例全过、全量失败数与基线逐一对齐（49 文件/98 用例）、类型检查零新增、构建通过、回滚演练可红可绿。一处偏差：implementing 轻档本体未加自检行（2500 字符预算实测超限），纪律落在轻/重档覆盖层。

## 1. 验收列表

### v1-1 · 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手

**验收内容**：【定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts 全绿（10 条：常量三锚点 + 覆盖遍历 + 零变更快照 + 两条反向）
2. 改前必红已留档（文件不存在时 exit 1）。npx tsc --noEmit 无新增错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-2 · 汇报工具描述落三锚点（reqboard_task_report）

**验收内容**：【汇报工具描述落三锚点（reqboard_task_report）】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts -t 报告 全绿
2. TC-5 零变更断言：参数字段集合 = {task_id,summary,completed,files_changed,next_step}、required={task_id,summary}、返回体 7 键不变
3. npx vitest run tests/task-report.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-3 · 同类长文本工具接入同一约定 + 遍历覆盖用例

**验收内容**：【同类长文本工具接入同一约定 + 遍历覆盖用例】验收

**操作步骤**：
1. npx vitest run tests/arg-guidance.test.ts -t 覆盖 全绿（15 条字段零缺项）
2. 反向：移除任一字段约定后必须红。npx tsc --noEmit 无新增错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-4 · 实施片段加「汇报自检」并按 C-16/C-17 重生成校验

**验收内容**：【实施片段加「汇报自检」并按 C-16/C-17 重生成校验】验收

**操作步骤**：
1. node scripts/inline-prompt-fragments.mjs 与 node scripts/check-prompt-fragments.mjs 均 exit 0
2. grep -c "汇报自检" src/domain/prompt/generated/fragments.ts = 3
3. npx vitest run tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-5 · 零变更核验 + 全量回归 + 回滚路径演练（兼容卡）

**验收内容**：【零变更核验 + 全量回归 + 回滚路径演练（兼容卡）】验收

**操作步骤**：
1. npx vitest run 失败集合与基线逐一对齐（49/98）且通过数 2991→3001
2. npx tsc --noEmit 197=197（后续解锁修复后 194）
3. 回滚演练实测：破坏锚点 4 红 → 还原 10 绿
4. pnpm build exit 0 且 dist 含改动。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · 追溯断链

**验收内容**：FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1；FR-2；FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注；通过时意见须写明处置方式。

**操作步骤**：
1. FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1
2. FR-2
3. FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注
4. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/arg-guidance.test.ts → 10 passed（含两条反向证伪）；改前必红留档：同命令 exit 1（无测试文件）
- npx vitest run tests/task-report.test.ts → 7 passed；npx vitest run tests/tools-schema.test.ts → 42 passed
- npx vitest run（全量）→ 失败 49 文件 / 98 用例 = 开工基线，失败集合逐一相同；通过 2991→3001
- npx tsc --noEmit → 零新增（基线 197 → 解锁修复后 194）
- node scripts/inline-prompt-fragments.mjs 与 node scripts/check-prompt-fragments.mjs → 均 exit 0；grep 汇报自检 generated/fragments.ts → 3
- pnpm build → exit 0 + [verify-client] OK；dist/index.mjs 含 拆成多次调用 ×3、汇报自检 ×2
- 回滚演练：破坏拆多次锚点 → 4 failed；还原 → 10 passed
- 端到端：reqboard_clear_pause → disarmed；reqboard_decompose(tasks=5) → 5 父卡 + 12 子卡全部 done → 需求自动进入 accepting
- 任务↔测试覆盖对照（covers 17 个 id）：docs/requirements/REQ-261002110908-81d0/tests/test-evidence.md 第六节
- 评审报告：docs/requirements/REQ-261002110908-81d0/reviews/review-report.md
- 开工基线与偏差记录：docs/requirements/REQ-261002110908-81d0/notes/baseline-2026-10-02.md、notes/work-done-during-wedge.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-2 | 汇报工具描述落三锚点（reqboard_task_report） | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-3 | 同类长文本工具接入同一约定 + 遍历覆盖用例 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-4 | 实施片段加「汇报自检」并按 C-16/C-17 重生成校验 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-5 | 零变更核验 + 全量回归 + 回滚路径演练（兼容卡） | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
| v1-8 | 需求级验收 · 追溯断链 | ✓ 通过 | human/session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612 | 2026-10-02 12:12 |
