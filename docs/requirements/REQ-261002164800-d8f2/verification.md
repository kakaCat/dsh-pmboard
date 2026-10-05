# REQ-261002164800-d8f2 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：计划落库的条款引用断链已修好——取数、门禁、写入各只剩一处实现，三条入口（弹框批准 / 看板批准 / reqboard_decompose）落出的卡、引用、状态一致；落错或漏写的引用事后能补；存量空引用有可试跑、可回滚的批量补法。FR-1 三入口收敛；FR-2 计划任务表 requirement_refs 通道打通；FR-3 文档覆盖表兜底三入口一致生效；FR-4 新增唯一补写入口 reqboard_task_refs；FR-5 存量回填器 dry-run / apply / check / restore（真库只读试跑候选 10、无来源 1、跳过 618）；FR-6 失败与降级响亮且恢复指引只指可执行入口；FR-7 覆盖度读数改取真实任务记录。遗留如实登记：① 真实库未执行 --apply（会改活数据，留人拍板）；② 既有 3 项输出契约失败与 3 条既有断言行在改动前后同样失败，非本需求引入；③ 拆分到实施的投递/锁缺陷属另一条需求，不在本次范围。基线：全量 99 failed ≤ 106、tsc 189 ≤ 223、build 退出码 0。

## 1. 验收列表

### v1-1 · 定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema

**验收内容**：【定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema】验收

**操作步骤**：
1. npx vitest run tests/reqboard/requirement-refs.test.ts 全绿：合法值去重保序，X-1 / FR-99x / 空串被拒且错误文本含卡 key 与非法值
2. pnpm typecheck 改动文件零错误。修前该用例全红（字段在协议层被丢弃）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-2 · 取数单点：refsForLanding 合并显式与文档覆盖表

**验收内容**：【取数单点：refsForLanding 合并显式与文档覆盖表】验收

**操作步骤**：
1. npx vitest run tests/reqboard/plan-refs.test.ts 全绿：显式优先、缺失时文档兜底、两处皆无则 sources=none
2. grep -rn refsByKey src 只命中 plan-refs.ts 与 plan-landing.ts。修前 decompose 路径不读文档表，同 key 两路结果不一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-3 · 落库层收敛：landApprovedPlan 三入口共用 + 读数取真实记录

**验收内容**：【落库层收敛：landApprovedPlan 三入口共用 + 读数取真实记录】验收

**操作步骤**：
1. npx vitest run tests/reqboard/plan-landing-parity.test.ts 全绿：11 张卡（含 1 张无 FR）落库 11 张、unrefed=[t7]、task_coverage 的 covers_frs 非空且等于卡上 refs。修前 0 张且抛 REQBOARD_PLAN_REFS_MISSING
2. wc -l src/application/internal/confirm-settle.ts ≤400（修前 439）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-4 · 看板「批准计划」也落库并推进，与弹框路径同结果

**验收内容**：【看板「批准计划」也落库并推进，与弹框路径同结果】验收

**操作步骤**：
1. npx vitest run tests/reqboard/board-plan-approve.test.ts 全绿：批准后台账任务数 = 计划卡数、需求状态为 implementing
2. 重复批准不新增卡（幂等）。修前批准只盖 approvedAt，0 张卡、状态不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-5 · 补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例

**验收内容**：【补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例】验收

**操作步骤**：
1. npx vitest run tests/reqboard/task-refs-repair.test.ts 全绿：改 refs 后卡上值变更且 RTM 的 serves 同步
2. 同值重复调用 changed:false 且队列文件 mtime 不变
3. 跨需求卡被拒（REQBOARD_TASK_NOT_BOUND）。修前全仓无任何卡级 refs 写入口。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-6 · 存量回填器：dry-run / apply / check / restore

**验收内容**：【存量回填器：dry-run / apply / check / restore】验收

**操作步骤**：
1. pnpm tsx scripts/backfill-task-refs.ts --dry-run 输出候选数且零文件变更（mtime 不变）
2. --apply 后 --check 输出 empty_with_doc_coverage: 0
3. 二次 --apply 报 applied:0
4. --restore <report> 后卡上 refs 回到 before。对应单测 npx vitest run tests/reqboard/backfill-task-refs.test.ts 全绿。修前 590 卡中 531 张 refs 为空且无回填路径。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-7 · 失败与降级要响亮：无落点警告可见、文案只指可执行入口

**验收内容**：【失败与降级要响亮：无落点警告可见、文案只指可执行入口】验收

**操作步骤**：
1. npx vitest run tests/reqboard/landing-failure-loud.test.ts 全绿：注入落库抛错时需求状态不推进且 advance.pausedReason 非空、评论含可执行恢复入口
2. 无落点卡场景 warning 与评论各出现一次
3. grep -rn REQBOARD_PLAN_REFS_MISSING src 不再命中拒绝分支。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-8 · 迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归

**验收内容**：【迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归】验收

**操作步骤**：
1. npx vitest run tests/reqboard/legacy-refs-compat.test.ts 全绿
2. pnpm test 失败数 ≤ 基线 106 且无新增失败
3. pnpm typecheck 错误数 ≤ 223
4. pnpm build 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed

**验收状态**：✓ 通过

---

## 2. 测试报告

- 本需求 8 个用例文件：npx vitest run tests/reqboard/requirement-refs.test.ts tests/reqboard/plan-refs.test.ts tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts tests/reqboard/landing-failure-loud.test.ts tests/reqboard/legacy-refs-compat.test.ts → 8 files / 56 passed
- 全量回归：npx vitest run → 99 failed / 3240 passed / 20 skipped，≤ 基线 106（C-14）
- 类型检查：npx tsc --noEmit → 189 errors，≤ 基线 223（C-15）；本需求改动文件零错误
- 构建：pnpm build → 退出码 0（host dist/ + client lib/client.js，verify-client OK bundle=335946 bytes）
- 真库只读试跑：pnpm tsx scripts/backfill-task-refs.ts --dry-run --root <repo> --ledger ~/.dsh/dsh-reqboard.json → 需求 26 / 候选 10 / 无来源 1 / 跳过 618；--check → empty_with_doc_coverage: 10
- 测试证据（逐卡 covers 对照与修前必红表）见 docs/requirements/REQ-261002164800-d8f2/tests/test-evidence.md
- 自评报告（FR 逐条对照 + 5 条偏离 + 回滚路径）见 docs/requirements/REQ-261002164800-d8f2/reviews/self-review.md
- 收口证据（基线对照 + 回滚演练 + 既有噪声说明）见 docs/requirements/REQ-261002164800-d8f2/notes/t8-baseline-evidence.md
- 关键实现见 src/application/internal/plan-refs.ts、src/application/internal/approved-plan-landing.ts、src/application/internal/backfill-task-refs.ts、src/application/use-cases/AmendTaskRefs.ts、scripts/backfill-task-refs.ts
- 逐卡逐段汇报见 docs/requirements/REQ-261002164800-d8f2/tasks/

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-2 | 取数单点：refsForLanding 合并显式与文档覆盖表 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-3 | 落库层收敛：landApprovedPlan 三入口共用 + 读数取真实记录 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-4 | 看板「批准计划」也落库并推进，与弹框路径同结果 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-5 | 补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-6 | 存量回填器：dry-run / apply / check / restore | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-7 | 失败与降级要响亮：无落点警告可见、文案只指可执行入口 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-8 | 迁移兼容与收口：旧数据零迁移可读 + 回滚演练 + 全量回归 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
| v1-10 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-fcfe356b-c62e-48cd-aee7-a94245188531 | 2026-10-02 17:33 |
