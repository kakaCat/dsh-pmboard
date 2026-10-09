# REQ-261007220012-bd29 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：工具面精简 27 → 21（保守档 S1~S6）交付完成。净变化：删 7 个冗余壳 + 新增 1 个修缮单入口 task_amend = -6；另 AdvanceTool 目录改名 TaskRunTool（数量不变，消命名债）。语义零损失：六个被复用用例判定逻辑一行未改，能力全部并入存续工具的可选入参与新节。五处口径一致（21/21/21/21/1）；契约矩阵 9 文件 150 例全绿；src 内 15 个旧工具名模式零命中；tsc 0 错误；全量回归逐批差分新增红 0。每批独立可回滚，台账数据零迁移。验收前置文档（design 五份 / reviews / tests 含 33 卡 covers）已补齐。

## 1. 验收列表

### v1-1 · 物理删除 reqboard_task_execute（S1）

**验收内容**：【物理删除 reqboard_task_execute（S1）】验收

**操作步骤**：
1. ① `grep -rn "reqboard_task_execute\|TaskExecuteTool\|defineTaskExecuteTool" src tests README.md` 零命中
2. ② `pnpm vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts` 全绿
3. ③ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rl "reqboard_task_execute|TaskExecuteTool|defineTaskExecuteTool" src tests README.md（除冻结夹具）零命中；vitest tools-dispatch+apply-wiring+tools-render-coverage+task-run-contract → 4 files / 20 tests passed；四处口径 26 一致；tsc 0

**验收状态**：✓ 通过

---

### v1-2 · confirm_receipt 并入 ask_confirm(ticket)（S2）

**验收内容**：【confirm_receipt 并入 ask_confirm(ticket)（S2）】验收

**操作步骤**：
1. ① ask_confirm schema 含可选 `ticket` 入参
2. ② `grep -rn "reqboard_confirm_receipt\|ConfirmReceiptTool\|defineConfirmReceiptTool" src` 零命中
3. ③ ask_confirm(ticket=未知值) 仍抛 REQBOARD_UNKNOWN_TICKET
4. ④ `pnpm vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` 全绿
5. ⑤ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：ask_confirm schema 含可选 ticket；grep "reqboard_confirm_receipt|ConfirmReceiptTool|defineConfirmReceiptTool" src 零命中；vitest ask-confirm-pending（TC-8 未知 ticket → REQBOARD_UNKNOWN_TICKET）+ask-confirm-blocking+confirm-pending-guard+output-contract → 4 files / 65 tests passed

**验收状态**：✓ 通过

---

### v1-3 · run_status 并入 status、task_status 并入 task_tree（S3）

**验收内容**：【run_status 并入 status、task_status 并入 task_tree（S3）】验收

**操作步骤**：
1. ① status 返回体含 run 节（无 active run 时 runId 整键省略不发 null）
2. ② task_tree(task_id=t-x) 返回单卡 task 节（status/progress/run/report/workflow），task_id 与 parent_id 同传报 REQBOARD_INVALID_INPUT
3. ③ `grep -rn "reqboard_run_status\|reqboard_task_status\|RunStatusTool\|TaskStatusTool" src` 零命中
4. ④ `pnpm vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts tests/task-status-ledger.test.ts tests/task-tree.test.ts` 全绿
5. ⑤ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：status 含 run 节（无 active run 时 runId 整键省略不发 null，过自身 schema）；task_tree(task_id) 返回单卡 task 节且与 parent_id 同传报 REQBOARD_INVALID_INPUT；vitest run-status-tool+task-status-integration+task-status-ledger+task-tree → 4 files / 20 tests passed

**验收状态**：✓ 通过

---

### v1-4 · 修缮簇合一 reqboard_task_amend（S4）

**验收内容**：【修缮簇合一 reqboard_task_amend（S4）】验收

**操作步骤**：
1. ① reqboard_task_amend 已注册，op=refs/adopt/chain 各一条等价原工具行为测试通过
2. ② op 必填参数缺失报 REQBOARD_INVALID_INPUT 且 message 点名该 op 必填集
3. ③ `grep -rn "reqboard_task_refs\|reqboard_task_adopt\|reqboard_task_regenerate\|TaskRefsTool\|AdoptTaskTool\|RegenerateTool" src` 零命中
4. ④ `pnpm vitest run tests/adopt-task.test.ts tests/regenerate-chain.test.ts tests/reqboard/backfill-task-refs.test.ts` 全绿
5. ⑤ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：reqboard_task_amend 注册且 op=refs/adopt/chain 各等价用例通过（task-amend-tool 6 例 + adopt-task 10 例 + regenerate/backfill）；缺必填报 REQBOARD_INVALID_INPUT 并点名该 op 必填集；grep 旧三工具名 src 零命中；8 files / 79 tests passed

**验收状态**：✓ 通过

---

### v1-5 · AdvanceTool 目录改名 TaskRunTool（S5）

**验收内容**：【AdvanceTool 目录改名 TaskRunTool（S5）】验收

**操作步骤**：
1. ① `ls src/tools/TaskRunTool` 存在且 `ls src/tools/AdvanceTool` 不存在
2. ② registry 条目 key=TaskRun、dir=TaskRunTool
3. ③ `pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/task-run-contract.test.ts` 全绿
4. ④ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：ls src/tools/TaskRunTool 存在、AdvanceTool 不存在；registry key=TaskRun/dir=TaskRunTool；tools-dispatch+output-contract+apply-wiring+task-run-contract → 4 files / 53 tests passed；错误码清单 6 条 site.file 随动刷新后三件套 36 例绿

**验收状态**：✓ 通过

---

### v1-6 · handoff/open_window schema 常量单源化（S6）

**验收内容**：【handoff/open_window schema 常量单源化（S6）】验收

**操作步骤**：
1. ① `grep -rn "\['fork', 'create'\]" src/tools | wc -l` = 1（WINDOW_MODES 唯一定义）
2. ② inheritance 子 schema 字面量仅 src/tools/shared.ts 一处定义
3. ③ `pnpm vitest run tests/open-window-tool.test.ts tests/handoff.test.ts tests/open-window-inherit.test.ts` 全绿
4. ④ `pnpm test` 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -rn "['fork', 'create']" src/tools | wc -l = 1（shared.ts WINDOW_MODES）；inheritance 属性表字面量仅 shared.ts 一处；vitest open-window-tool+open-window-inherit 全绿（handoff.test.ts 2 例红为 S1 基线既有依赖门）

**验收状态**：✓ 通过

---

### v1-7 · 同步面定稿：README + package.json + 全量验证（FR-7）

**验收内容**：【同步面定稿：README + package.json + 全量验证（FR-7）】验收

**操作步骤**：
1. ① README 工具表 21 行、无 7 个被删工具名、含 reqboard_task_amend
2. ② package.json description 含「21 个」
3. ③ `pnpm vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/tools-schema.test.ts tests/arg-guidance.test.ts tests/error-code-matrix.test.ts` 全绿
4. ④ `pnpm test` 全绿
5. ⑤ apply-wiring 派生注册名单恰 21 个。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：README 21 行/6 组、计数三处 21、被删 7 名零命中、含 reqboard_task_amend；package.json 含「21 个」；9 文件 150 例契约矩阵全绿；apply-wiring 派生注册名单恰 21；tsc error TS 0

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级验收：npx tsx scripts/req-doc-validate.mts --req REQ-261007220012-bd29 → 9 项判据缺口 0、exit 0；五处口径读数 21/21/21/21/1；契约矩阵 9 files/150 tests；src 旧名零命中；tsc 0。FR-1~FR-7 全部 clause_receive_status=done（reqboard_status 读数）。

**验收状态**：✓ 通过

---

## 2. 测试报告

- 五处口径一致：registry 21 / src/tools 磁盘目录 21 / src/index.ts register 21 / README 工具行 21 / package.json 含「21 个」
- 契约矩阵：npx vitest run tools-dispatch + output-contract + apply-wiring + readme-tool-face + toolviews-contract + tools-render-coverage + tools-schema + arg-guidance + error-code-matrix → Test Files 9 passed (9) / Tests 150 passed (150)
- 15 个旧工具名/目录名模式在 src/ 零命中（grep -rl | wc -l = 0，含注释口径；唯一豁免 tests/fixtures 的 v8 历史快照夹具）
- npx tsc --noEmit -p tsconfig.json → error TS 计数 0
- 全量 pnpm test：38 failed files / 68 failed tests / 6948 passed；六批逐批差分新增红 0，失败文件 ∩ 本需求触碰测试 = 空集
- 验收前置文档：design/ 五份、reviews/self-review.md、tests/evidence.md（含 33 张任务卡 covers 标注）
- 阶段证据 12 份：docs/requirements/REQ-261007220012-bd29/evidence/
- 工具面净变化：删 7 个冗余壳 + 新增 1 个 task_amend = -6；另 AdvanceTool 目录改名 TaskRunTool（数量不变）
- 回滚：每批独立文件集可单批 revert；删除目录可由 HEAD 恢复；数据侧零迁移

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 物理删除 reqboard_task_execute（S1） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-2 | confirm_receipt 并入 ask_confirm(ticket)（S2） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-3 | run_status 并入 status、task_status 并入 task_tree（S3） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-4 | 修缮簇合一 reqboard_task_amend（S4） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-5 | AdvanceTool 目录改名 TaskRunTool（S5） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-6 | handoff/open_window schema 常量单源化（S6） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-7 | 同步面定稿：README + package.json + 全量验证（FR-7） | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f | 2026-10-07 23:10 |
