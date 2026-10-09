# REQ-261008011118-defe 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：体检 §2.2 四条中危项全部收口并交付：① M1 删 run 快照三个死字段与其死代码（run 节只报活字段，runId 直读 advance.runId）；② M3 批内非子卡收尾上限 MOVE_BATCH_DONE_MAX=3（复用 REQBOARD_BULK_CLOSE + throttleRemainingMs=60000 + 既有 guidance，DoneEvidenceSpec 判据一行未改，跨批节流与子卡豁免不变）；③ M4 保 I-11 写序加队列补偿（抛错与漂移两路都归还、可选字段本前缺省即删键），落库白名单补齐 statusHistory/version/updatedBy 并补取消卡 canceled 事件，补偿失败响亮 REQBOARD_ROLLBACK_COMPENSATION_FAILED + 台账留痕；④ M5 子卡先认领后执行，并发第二路拒 REQBOARD_SUBTASK_IN_PROGRESS（阈值复用孤儿 3min），跨卡覆盖与凭证门两条失败出口统一经 rollbackSubtask 归还。四条各带先红→后绿读数、各自独立可回滚；知识层零漂移、契约与提示词门全绿、tsc 0 错误、四卡验收 13 文件 / 190 用例全绿；covers 覆盖 24/24 任务。已知偏离（响亮记录）：pnpm kb:check 未达退出码 0，余 3 项为 HEAD 既存/他窗改动；全量集合差新增 7 条全在 kb-ensure 且为顺序相关（非本需求，不代刷基线）。

## 1. 验收列表

### v1-1 · 删除 run 快照的三处死字段与其死代码

**验收内容**：【删除 run 快照的三处死字段与其死代码】验收

**操作步骤**：
1. ① `grep -rn "stepIndex\|currentSubtaskId\|heartbeatAt" src --include=*.ts` → 无命中（除 advance.runId/lockAt 相关注释外）
2. ② `npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts tests/output-contract.test.ts` → 全绿
3. ③ run 节键集不含 stepIndex/currentSubtaskId（即使 advance 里种了值），且返回值仍过自身 schema 闸门。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：BUG-1：grep 复核生产代码零命中（仅 3 处解释性注释）；npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts tests/output-contract.test.ts tests/unit/query-run-status.test.ts tests/unit/migration-v8.test.ts → 5 文件 / 68 用例全绿；邻域 19 文件 / 227 用例全绿；先红 2 failed → 后绿 7 passed

**验收状态**：✓ 通过

---

### v1-2 · 给批量收尾加非子卡 done 上限 N=3

**验收内容**：【给批量收尾加非子卡 done 上限 N=3】验收

**操作步骤**：
1. ① 20 张顶层卡一批 to=done → 落账 done = 3，其余逐项 code=REQBOARD_BULK_CLOSE 且 0 < throttleRemainingMs ≤ 60000，顶层带 guidance
2. ② `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` → 全绿（既有同批 3 张、跨批、子卡豁免三条保绿）
3. ③ `git diff --stat src/domain/workflow/DoneEvidenceSpec.ts` → 空（判据零改动）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：BUG-2：单批 20 张顶层卡 → 落账 3 张，其余 17 项 code=REQBOARD_BULK_CLOSE 且 throttleRemainingMs ∈ (0,60000]、顶层带 guidance；npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts → 27 用例全绿；DoneEvidenceSpec 本卡零触碰；邻域 10 文件 / 147 用例全绿

**验收状态**：✓ 通过

---

### v1-3 · 回退加队列补偿并补齐取消/复位事件与 version

**验收内容**：【回退加队列补偿并补齐取消/复位事件与 version】验收

**操作步骤**：
1. ① 注入需求写抛错跑一次真实回退 → 抛错且队列逐字段回到回退前（卡状态与回退前一致、无重做卡）、需求 status 未变
2. ② 注入漂移（回调看到 status !== from）→ code=REQBOARD_CONFLICT 且同样归还
3. ③ 正常回退后：取消卡 statusHistory 末条为 canceled、复位卡含 todo（reason 含「原地复位」），两类 version 均比回退前 +1
4. ④ `npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts` → 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：BUG-3：注入需求写抛错 → 队列逐字段回到回退前（JSON 相等）且需求 status 未变；注入漂移 → REQBOARD_CONFLICT + 同样归还；补偿失败 → REQBOARD_ROLLBACK_COMPENSATION_FAILED + 需求留痕；正常回退后取消卡 statusHistory 末条 canceled、复位卡含原地复位事件、两类 version 1→2；npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts → 全绿；邻域 8 文件 / 160 用例全绿

**验收状态**：✓ 通过

---

### v1-4 · 子卡执行改先认领后执行并对并发派发说不

**验收内容**：【子卡执行改先认领后执行并对并发派发说不】验收

**操作步骤**：
1. ① 两路并发同一张 todo 子卡 → workflow.start 恰被调用 1 次，第二路 code=REQBOARD_SUBTASK_IN_PROGRESS 且执行记录数不变
2. ② 凭证门失败与跨卡覆盖两条出口跑完 → 子卡回 todo + attempt+1 + 执行闭合 failed + revisions(rollback) 在
3. ③ 种一条 startedAt 早于 3min 的 running 执行 → 允许接管且陈旧执行被闭合为 failed
4. ④ `npx vitest run tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts tests/error-code-registry.test.ts` → 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：BUG-4：并发两路同一张 todo 子卡 → workflow.start 恰 1 次、第二路 REQBOARD_SUBTASK_IN_PROGRESS 且执行记录数不变；凭证门失败与跨卡覆盖两条出口 → 回 todo + attempt+1 + 执行闭合 failed + revisions(rollback)；孤儿（running 早于 3min）可接管且陈旧执行闭合 failed；npx vitest run tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts tests/error-code-registry.test.ts → 全绿；邻域 16 文件 / 142 用例全绿

**验收状态**：✓ 通过

---

### v1-5 · 收口：知识层与契约基线齐步并跑全量回归

**验收内容**：【收口：知识层与契约基线齐步并跑全量回归】验收

**操作步骤**：
1. ① `pnpm kb:check` → 退出码 0
2. ② `npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts tests/prompt-cost.test.ts tests/prompt-baseline.test.ts` → 全绿
3. ③ `pnpm test` → 无新增红（与基线集合差为空，剩余红逐条有归属）
4. ④ t1..t4 的验收命令在同一批复跑全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：BUG-5：kb-build 后 K7/K9 零漂移；错误码清单幂等（第二次零写盘）；契约与提示词 7 文件 / 73 用例全绿；四卡验收命令 13 文件 / 190 用例全绿；全量集合差新增 7（kb-ensure 顺序相关，已三条证据归因为非本需求）/ 不再失败 52；tsc 0 错误。偏离：kb:check 仍余 3 项 HEAD 既存/他窗失败（未代改，证据见 tests/fix-evidence.md）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求条款 5/5 全部有卡承接（BUG-1→t-f33d47 / BUG-2→t-20f5dc / BUG-3→t-6969c5 / BUG-4→t-869f61 / BUG-5→t-1bb2e9）；条款接收状态全 received、无未接收条款；验收前置 9 类文档已齐（requirement.md、design 四份 + fix-design、decomposition.md、reviews/、tests/、每任务一份卡）；covers 标注覆盖 24/24 任务（=100% ≥ 80% 门禁）。D-1 裁定（范围 = 四项、取舍写进设计）由设计 DD-1..DD-4 承接并在各卡实现中兑现；bug 档不组装 decision-compare 对照项（D-12：该节只在 feature 模板）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/concurrency-limits.test.ts、tests/error-code-registry.test.ts、tests/execute-task.test.ts、tests/move-rollback.test.ts、tests/output-contract.test.ts、tests/prompt-cost.test.ts、tests/run-status-tool.test.ts、tests/unit/migration-v8.test.ts、tests/unit/query-run-status.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/concurrency-limits.test.ts、tests/error-code-registry.test.ts、tests/execute-task.test.ts、tests/move-rollback.test.ts、tests/output-contract.test.ts、tests/prompt-cost.test.ts、tests/run-status-tool.test.ts、tests/unit/migration-v8.test.ts、tests/unit/query-run-status.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：「确认无需 E2E：纯函数模块，无外部接口」

**验收状态**：✓ 通过

---

## 2. 测试报告

- 单卡验收命令同批复跑：npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts tests/output-contract.test.ts tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts → Test Files 13 passed / Tests 190 passed
- 先红 → 后绿读数（四组；BUG-3/BUG-4 的红通过临时还原 HEAD 版生产文件取得，恢复后 diff 逐字一致）：① tests/run-status-tool.test.ts 2 failed | 5 passed → 7 passed；② tests/done-throttle-guidance.test.ts 2 failed | 9 passed → 11 passed；③ tests/move-rollback.test.ts + tests/canceled-task-trail.test.ts 5 failed | 38 passed → 全绿；④ tests/execute-task.test.ts + tests/concurrency-limits.test.ts 4 failed | 33 passed → 全绿
- 邻域回归（逐卡防扩散）：BUG-1 → 19 文件 / 227 用例；BUG-2 → 10 文件 / 147 用例；BUG-3 → 8 文件 / 160 用例；BUG-4 → 16 文件 / 142 用例（含 tests/failure-handling.test.ts 8/8 由基线红转绿）——全部 Test Files passed
- 类型与全量：npx tsc --noEmit → exit 0 / error TS 0；npx tsx scripts/test-baseline.mts --check → 本次失败 23 条 · 基线 68 条；差集新增 7 / 不再失败 52
- 新增 7 条归属（非本需求引入）：全部落在 tests/kb-ensure.test.ts 的顺序相关用例——单跑 11/11 绿、与知识层家族同跑 55/55 绿、与本需求全部测试文件同跑 150/150 绿；该测试文件与其被测模块均未被任何改动（HEAD 状态），且只用 mkdtemp 临时根、不读真仓 docs/knowledge ⇒ 与本需求零交集，按边界不代刷基线
- 知识层与清单：npx tsx scripts/kb-build.mts --write 后 pnpm kb:check → K7 生成物与源码一致（零漂移）✅ / K9 符号表 3394 = 源码口径 3394 ✅（改前 2 处漂移）；npx tsx tests/drill/refresh-error-code-inventory.mts 连跑第二次 → 清单无变化（幂等：未写盘）
- kb:check 剩余 3 项失败的 HEAD 证据：K1 INDEX.md 工作树 18194 字节 / HEAD 版即 16624 字节 > 8000（且工作树被别窗新增 5 行索引）；K3 conventions.md 222 行 > 200 且该文件工作树未修改（HEAD 即 222 行）；K14 kb-0064/kb-0065 两条 tracked 且未修改、unverifiable.baseline.txt 不含它们（待刷基线）
- 契约与提示词门：npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/error-code-exempt.test.ts tests/prompt-error-codes.test.ts tests/prompt-cost.test.ts tests/prompt-baseline.test.ts → 7 文件 / 73 用例全绿（error-code-matrix 零覆盖率维持 5）
- 落点 diff 摘要：9 个生产/类型文件 +362/-179（QueryRunStatus / StatusTool / client types / RequirementRepository / MoveTask / TaskMoveTool / rollback-tasks / MoveRequirement / ExecuteTask）；删除 3 个死文件（src/domain/checkpoint.ts、src/application/internal/checkpoint-manager.ts、tests/unit/checkpoint-manager.test.ts）；新增 src/application/internal/rollback-compensation.ts（补偿单点，163 行）；知识层 code-map 两件重生成 +251/-55
- 证据文档（验收前置 9 类文档集）：requirement.md；design/architecture.md（装配位置/收敛点/不变量）、design/data-model.md（advance 字段面/回退九字段写面/执行记录状态迁移/错误码清单）、design/interfaces.md（接口清单 IF-1..IF-6 + 内部新签名 + 契约文案）、design/test-cases.md（19 条用例逐条先红后绿 + 3 条偏离）、design/fix-design.md（已确认设计）；decomposition.md；reviews/code-review-2026-10-08.md（四卡合并评审 + 归属澄清 + 遗留 L-1..L-4）；tests/fix-evidence.md（六组可复核读数 + 落点回滚清单 + covers 24/24）；tasks/ 下 5 张父卡 + 19 张子卡完工记录

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 删除 run 快照的三处死字段与其死代码 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-2 | 给批量收尾加非子卡 done 上限 N=3 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-3 | 回退加队列补偿并补齐取消/复位事件与 version | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-4 | 子卡执行改先认领后执行并对并发派发说不 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-5 | 收口：知识层与契约基线齐步并跑全量回归 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
| v1-7 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-9574f815-da99-4e7f-9089-19c7795e1ed1 | 2026-10-08 02:09 |
