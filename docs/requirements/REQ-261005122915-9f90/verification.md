# REQ-261005122915-9f90 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：修掉「回退 → 重新批准计划」的静默丢卡，并把已交付却从未接线的看板清场入口接上。

六处改动：① 占位重做卡升为 domain 判据单点；② 回退态收敛抽成单一实现，三条落库入口共用；③ 落库幂等只看真卡（回退态另用顶层真卡区分「已重建/还没重建」）；④ 两条批准路径落库没真发生就不推进；⑤ 再次回退时占位卡随本轮取消而非复位；⑥ 看板需求详情补「清理误物化重做卡」按钮与可核对回执。

证据：9 个套件 70 例全绿；四条逆验证注入旧实现全部变红、还原全绿；typecheck 全绿；构建产物已重建；全量套件对 HEAD 基线本次新增失败 0；covers 标注 8/8 覆盖。

现场 3b02：已由 peer 窗口用「再回退一次」绕行解开（其理由原文承认撞上同一缺陷），现 47 张活卡与 23 卡计划对齐、执行中；占位卡 0 张，授权代跑清场两次均为空操作。

待人工：验收（本页）。另一条独立缺陷（workspaceRoot 进程级单例被并发窗口覆写，今天两次打断本需求）建议另行立项，未夹带进本次改动。

## 1. 验收列表

### v1-1 · 定义占位卡判据单点（isReworkPlaceholder / liveRealCards）

**验收内容**：【定义占位卡判据单点（isReworkPlaceholder / liveRealCards）】验收

**操作步骤**：
1. npx vitest run tests/rework-placeholder.test.ts 全绿（含三条断言：占位卡不进 liveRealCards / canceled 不进 / 真卡进）
2. pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-2 · 抽「回退态收敛占位卡」为单一实现并让手动拆分改调

**验收内容**：【抽「回退态收敛占位卡」为单一实现并让手动拆分改调】验收

**操作步骤**：
1. npx vitest run tests/decompose-stale-rework.test.ts 全绿：① 回退态落库后占位卡全 canceled
2. ② 无占位卡时 queue.json mtime 不变（不写盘）
3. ③ 修订理由含「已被新计划取代」。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-3 · 落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan）

**验收内容**：【落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan）】验收

**操作步骤**：
1. npx vitest run tests/approved-plan-landing-rework.test.ts 全绿：① 预置 N 张占位卡 + 已批准 M 卡计划 → createdCount===M、alreadyLanded===0、staleReworkCanceled===N
2. ② 连调两次 → 第二次 createdCount===0 且 queue.json mtime 不变
3. ③ 非回退态已有真卡 → 仍幂等跳过（事故 B 防线）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-4 · 两条批准路径推进判据收窄：落库没真发生就不推进

**验收内容**：【两条批准路径推进判据收窄：落库没真发生就不推进】验收

**操作步骤**：
1. npx vitest run tests/confirm-settle-landing-gate.test.ts 全绿：① 覆盖门禁抛错且队列只剩占位卡 → 状态仍 decomposing、有含恢复路径的系统评论、advance.pausedReason 非空
2. ② 正常落库 → 仍推进
3. ③ 看板路径同判据 → 不推进且 landing.failed===true。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-5 · 再次回退时占位卡取消而非复位（planRollbackTasks 分流）

**验收内容**：【再次回退时占位卡取消而非复位（planRollbackTasks 分流）】验收

**操作步骤**：
1. npx vitest run tests/rollback-materialize.test.ts 全绿，含新增断言：第二轮回退后占位卡状态为 canceled（修复前必红）、真子卡仍复位为 todo、reworkDrafts 仍为 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-6 · 看板需求详情接上「清理误物化重做卡」入口与回执

**验收内容**：【看板需求详情接上「清理误物化重做卡」入口与回执】验收

**操作步骤**：
1. npx vitest run tests/client-rollback-cleanup.test.ts 全绿：① 有回退记录时操作条含 data-action="rollback-cleanup" 且 data-seq 等于序号
2. ② 无回退记录时不含该按钮
3. ③ api.rollbackCleanup 请求路径与 body 形状正确。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-7 · 逆验证（三条必红）与 3b02 现场复演证据

**验收内容**：【逆验证（三条必红）与 3b02 现场复演证据】验收

**操作步骤**：
1. 三条逆验证在注入旧实现时各自红、还原后绿（红/绿输出留档）
2. 复演后 queue.json 活卡逐 key 等于 3b02 已批准的 23 卡计划
3. 台账保留清场与落库两条评论。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-8 · 兼容与存量核对：语义收窄的消费者盘点、无迁移确认

**验收内容**：【兼容与存量核对：语义收窄的消费者盘点、无迁移确认】验收

**操作步骤**：
1. npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts tests/decompose-tools.test.ts 全绿
2. grep -rn "alreadyLanded" src 的命中集合与盘点表一致（无遗漏消费者）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——两条批准路径推进判据收窄：落库没真发生就不推进 → tests/confirm-settle-landing-gate.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——两条批准路径推进判据收窄：落库没真发生就不推进 → tests/confirm-settle-landing-gate.test.ts。请把锚点改为真实文件，或回写设计/任务卡
2. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run（9 个套件）→ Test Files 9 passed / Tests 70 passed；原始输出 evidence/tests-9-suites.txt
- node --import tsx/esm scripts/rework-inverse-verification.mts → 四处注入旧实现全部变红、还原全绿、退出码 0；留档 notes/inverse-verification.md
- pnpm typecheck → 零输出（全绿）；evidence/typecheck.txt
- pnpm build → 构建通过（verify-client OK）；lib/client.js 含 rollback-cleanup 与按钮文案；dist/index.mjs 含 staleReworkCanceled / liveRealCards
- 全量套件 + HEAD worktree 基线：工作区 105 失败项 vs HEAD 125；新增 2 个文件经临时还原本次 7 个文件后仍失败 ⇒ 与本次无关；decompose-tools 还原态与本次态逐条一致（5 failed / 25 passed）⇒ 本次新增失败 0；归因见 notes/compat-check.md §4
- node --import tsx/esm scripts/rollback-landing-replay.mts → 3b02 现场：implementing / 已批准 23 张 / 活卡真卡 47（父 23 + 子 24）/ 占位重做卡 0 / canceled 26，与计划对齐
- 授权代跑清场入口两次复核：canceled=0、matchedBy=reworkOf+title-prefix —— 均空操作（现场已由 peer 窗口解开）
- peer 窗口（session-5632659d）二次回退理由原文（台账 rollback.reason 可复核）：上一次回退物化的 13 张 [重做] 卡仍在存活，导致 decompose 被「已有任务，禁止重复拆分」拒（放行条件 rollbackTo===当前状态 在批准后推进到 implementing 时失效）——同一缺陷的绕行证据
- 阶段推进留痕：decomposing→implementing 由用户在对话弹框中明确授权后经看板通道代发（actor=human，reason 写明授权来源）；该门在设计上无 agent 通路（rollup.ts 注释：2026-09-14 五门裁定已移除 R4 自动推进）
- 前置文档：tests/test-evidence.md（含 covers: t-7af9da / t-a01528 / t-f92ad7 / t-a31e2a / t-9a8894 / t-661b0f / t-a1a67b / t-fa6136 全量覆盖标注）、reviews/self-review.md（四节自评）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定义占位卡判据单点（isReworkPlaceholder / liveRealCards） | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-2 | 抽「回退态收敛占位卡」为单一实现并让手动拆分改调 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-3 | 落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan） | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-4 | 两条批准路径推进判据收窄：落库没真发生就不推进 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-5 | 再次回退时占位卡取消而非复位（planRollbackTasks 分流） | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-6 | 看板需求详情接上「清理误物化重做卡」入口与回执 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-7 | 逆验证（三条必红）与 3b02 现场复演证据 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-8 | 兼容与存量核对：语义收窄的消费者盘点、无迁移确认 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-10 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
| v1-11 | 需求级验收 · 锚点失效 | ✓ 通过 | human/session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2 | 2026-10-05 14:18 |
