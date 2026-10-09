# REQ-261008020552-4aa0 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：工具面 21→19（archive_amend/note_interruption 收编为 task_amend 的 op=archive/op=interruption），task_move 模型可见文本 1265→591、submit tasks[] 子树 1717→732（双双减半达标），行为零变化（仅 D-3 申报的文案/留痕替换），两道预算门禁常驻防回弹。全量新增失败 0、tsc 0 错、契约面全绿。三项非本批债务（kb:check K1/K3/K14、15 条基线红、baseline 53 条未落账）经用户裁定登记交还，见 notes/known-debt.md。有意不做：dist/ 未重建、未 git commit（第五批先例）。

## 1. 验收列表

### v1-1 · 收编 archive_amend 为 task_amend(op=archive)（U1）

**验收内容**：【收编 archive_amend 为 task_amend(op=archive)（U1）】验收

**操作步骤**：
1. ① grep -rn "reqboard_archive_amend|ArchiveAmendTool|defineArchiveAmendTool" src tests README.md 零命中
2. ② pnpm vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts 全绿
3. ③ pnpm vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts 全绿（ctx.tools 无 reqboard_archive_amend）
4. ④ op=archive 返回体 = 原工具键集 + op 回显（测试断言）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：U1 archive_amend 收编：grep 旧名零命中（exit 1）；npx vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts → 63 passed；用例层 git diff 仅 D-3 申报的 8 处 reject 前缀 + 1 处注释

**验收状态**：✓ 通过

---

### v1-2 · 收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2）

**验收内容**：【收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2）】验收

**操作步骤**：
1. ① grep -rn "reqboard_note_interruption|NoteInterruptionTool|defineNoteInterruptionTool" src tests README.md 零命中
2. ② pnpm vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts 全绿
3. ③ 新增行为测试：挂起确认期间 op=interruption 可调成功、op=refs 仍被 REQBOARD_CONFIRM_PENDING 拦
4. ④ 契约三件（tools-dispatch/apply-wiring/output-contract）绿，ctx.tools 无 reqboard_note_interruption，注册名单 19

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：U2 note_interruption 收编：grep 旧名零命中；npx vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts → 82 passed / 3 failed（3 条为基线登记项 test-baseline.failures.txt:30-32）；新守卫分流测试：挂起期间 op=interruption success=true、op=refs 抛 REQBOARD_CONFIRM_PENDING

**验收状态**：✓ 通过

---

### v1-3 · task_move 描述结构减负 1265→≤630（U3）

**验收内容**：【task_move 描述结构减负 1265→≤630（U3）】验收

**操作步骤**：
1. ① 体量脚本（defineTaskMoveTool(stub deps) 后 description.length + parameters 描述递归和）读数 ≤ 630（基线 1265）
2. ② pnpm vitest run tests/task-move-prompt-budget.test.ts 绿（含细则之家三条断言）
3. ③ pnpm vitest run tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts tests/legacy-compat-6749.test.ts 全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：U3 task_move 减负：体量脚本 1265 → 591（≤630）；行为锁八件（task-move-batch/role、subtask-budget、chain-budget、done-throttle-*、amend-acceptance、legacy-compat-6749）→ 100 passed；参数键集/additionalProperties 由门禁第五条钉住

**验收状态**：✓ 通过

---

### v1-4 · submit tasks[] 子 schema 描述下沉 1717→≤860（U4）

**验收内容**：【submit tasks[] 子 schema 描述下沉 1717→≤860（U4）】验收

**操作步骤**：
1. ① 体量脚本读数：tasks[] 子树描述递归和 ≤ 860（基线 1717）且 SUBMIT_PROMPT ≤ 1300 不破
2. ② 门禁测试（扩展 submit-prompt-budget 或新增姐妹文件）绿：体量判据 + 细则之家逐条（dep_reasons 写法/granularity_exempt 条件/footprint 口径/skipIntegration 联动/prototypeRefs 条件/template 键清单各能在对应回执读到）
3. ③ pnpm vitest run tests/submit-prompt-budget.test.ts tests/plan-granularity.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts tests/dual-field.test.ts tests/plan-footprint.test.ts 全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：U4 submit tasks[] 减负：子树 1717 → 732（≤860）、SUBMIT_PROMPT 1289（≤1300）；tests/submit-tasks-schema-budget.test.ts 8 passed；plan 门禁矩阵 + submit 面 17 文件 → 254 passed；消息卫生棘轮零上升（application 533 持平、tools 74→66、domain/Footprint 21→20）

**验收状态**：✓ 通过

---

### v1-5 · 同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19）

**验收内容**：【同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19）】验收

**操作步骤**：
1. ① pnpm vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/apply-wiring.test.ts 全绿（注册名单=19）
2. ② grep "19 个" package.json README.md 均命中
3. ③ pnpm kb:check 退出码 0
4. ④ pnpm test 全绿
5. ⑤ pnpm baseline:check 与 pnpm typecheck 退出码 0

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：U5 同步面：readme-tool-face/toolviews-contract/tools-render-coverage/apply-wiring → 32 passed（注册名单=19）；grep 「19 个」package.json×1 + README×3；docs 面四处 + 变更历史行 + front-matter 已同步；pnpm kb:build 零漂移；三项非本批债务登记于 notes/known-debt.md

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级五条 FR 逐条：FR-1/FR-2 = grep 旧名零命中（exit 1）+ op=archive/op=interruption 行为矩阵绿；FR-3 = 591 ≤ 630；FR-4 = 732 ≤ 860 且 SUBMIT_PROMPT 1289 ≤ 1300；FR-5 = 注册名单 19 + 「19 个」计数命中 + 契约面 32 测试绿。判据表见 docs/requirements/REQ-261008020552-4aa0/design/test-cases.md，逐条证据见 tests/test-evidence.md

**验收状态**：✓ 通过

---

## 2. 测试报告

- 体量终测（tsx 脚本，defineXTool(stub deps) 递归求和）：task_move description=141 + params=450 = 591（基线 1265，预算 ≤630）；submit tasks[] 子树 = 75 + 657 = 732（基线 1717，预算 ≤860）；SUBMIT_PROMPT=1289（预算 ≤1300，不破）
- 旧工具名零命中：grep -rn "reqboard_archive_amend|reqboard_note_interruption|ArchiveAmendTool|NoteInterruptionTool|defineArchiveAmendTool|defineNoteInterruptionTool" src tests README.md → exit 1（零命中）
- 工具面 19：ls src/tools | grep -c Tool = 19；registry.ts 条目 = 19；契约四件 + toolviews-contract + tools-render-coverage 全绿（32 测试）
- 全量回归：pnpm test → 7149 passed / 15 failed / 27 skipped；pnpm baseline:check → 「新增失败 0 / 不再失败 53」（15 条全在 docs/reviews/test-baseline.failures.txt 基线 68 条内）
- 类型检查：pnpm typecheck（tsc --noEmit）→ 退出码 0，error TS 0 条
- 知识层：pnpm kb:build 零漂移；pnpm kb:check 红 3 项（K1/K3/K14）——非本批引入，取证与处置见 docs/requirements/REQ-261008020552-4aa0/notes/known-debt.md（用户裁定：登记交还）
- 行为等价证据：U1 archive-reconcile-e2e 改打 op=archive 后原断言不变（含 op/success 回显）；U2 新增守卫分流行为测试（挂起期间 op=interruption 放行、op=refs 仍被 REQBOARD_CONFIRM_PENDING 拦）；U3 行为锁八件 100 测试；U4 plan 门禁矩阵 254 测试
- 门禁进场证据（防回弹）：docs/requirements/REQ-261008020552-4aa0/design/test-cases.md 的 TC-6~TC-10 与 RV-1~RV-4；新增 tests/task-move-prompt-budget.test.ts（4 条）、tests/submit-tasks-schema-budget.test.ts（8 条）
- 文档面：docs/requirements/REQ-261008020552-4aa0/ 下 design 六份、reviews/review-report.md、tests/test-evidence.md（含 23 张卡的 covers 标注）、notes/known-debt.md 均已落盘

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 收编 archive_amend 为 task_amend(op=archive)（U1） | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
| v1-2 | 收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2） | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
| v1-3 | task_move 描述结构减负 1265→≤630（U3） | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
| v1-4 | submit tasks[] 子 schema 描述下沉 1717→≤860（U4） | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
| v1-5 | 同步面收尾与全量闸（U5：README/package.json/docs/知识层 21→19） | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-b5a0dac9-3c67-4034-9638-dde9b50134e6 | 2026-10-08 12:19 |
