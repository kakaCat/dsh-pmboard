# REQ-261007160829-1991 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：把「无锚点结果被静默降级」治成判据单点 + 三个落点，8 张卡全部落地并逐卡自证（含本窗口复跑）。①提交侧在写入前拒绝无锚点结果并点名（FR-1）；②裁决侧降级同写原因、通过清原因，回执按真实原因分派（FR-2）；③人工破坏性改写无锚点文本当场拒绝（FR-3）；④弹框题干写明可核验形态（FR-4）。判据只允许一处（hasResultAnchor），文案只允许一处（VerdictNotices）。证据：全量套件 36 个失败文件与本需求相关文件交集为空；typecheck 退出码 0；评审与测试证据见 reviews/review.md 与 tests/evidence.md（含 39 张卡的 covers 映射）。三条已知差异（已写入文档，请人工裁决）：①错误码传输面显示 opinion_required（修需 2 个卡外文件）；②弹框通道留空点通过不落 unverifiedReason（看板通道正常）；③提交载荷新声明的 needsHuman 不获锚点豁免。另有 8 处范围外写死归因文案（含客户端两处）已点名未改。

## 1. 验收列表

### v1-1 · 落「未复核原因」字段与降级判定单点

**验收内容**：【落「未复核原因」字段与降级判定单点】验收

**操作步骤**：
1. npx vitest run tests/verdict-downgrade-reason.test.ts 退出码 0
2. 断言四类输入分别得到 passed / unverified(blank_pass) / unverified(anchor_missing) / 人工项有文本 passed

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/verdict-downgrade-reason.test.ts → 12 passed；pnpm typecheck 退出码 0；字段两处镜像在 src/shared/protocol.ts 与 src/domain/workflow/AcceptanceSheetSpec.ts

**验收状态**：✓ 通过

---

### v1-2 · 裁决侧写降级原因并在人工自填无锚点时拒绝

**验收内容**：【裁决侧写降级原因并在人工自填无锚点时拒绝】验收

**操作步骤**：
1. npx vitest run tests/verdict-human-anchor-reject.test.ts 退出码 0
2. 拒绝时该批台账 version 未变、错误码为 REQBOARD_VERDICT_ANCHOR_MISSING

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/verdict-human-anchor-reject.test.ts → 13 passed；等价性探针 2016 组输入 status 零不一致，1415 组可比输入零差异

**验收状态**：✓ 通过

---

### v1-3 · 提交侧锚点体检入桶

**验收内容**：【提交侧锚点体检入桶】验收

**操作步骤**：
1. npx vitest run tests/result-anchor-submit.test.ts 退出码 0
2. 断言无锚点普通项进 unanchored，needsHuman 项与系统缺口项不进

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/result-anchor-submit.test.ts → 16 passed（桶级）；入桶五条件见 src/domain/workflow/ResultBinding.ts，判据只调 hasResultAnchor

**验收状态**：✓ 通过

---

### v1-4 · 提交侧锚点拒绝分支与错误码

**验收内容**：【提交侧锚点拒绝分支与错误码】验收

**操作步骤**：
1. npx vitest run tests/result-anchor-submit.test.ts 退出码 0
2. 无锚点 result 提交被拒且点名该项，改交 npx vitest run tests/x.test.ts → 10 passed 形状后成功

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/result-anchor-submit.test.ts tests/accept-sheet-tool.test.ts tests/accept-sheet-zero-input.test.ts → 60 passed；拒绝时 revision 与两个 version 全不动、单里零 result 落库

**验收状态**：✓ 通过

---

### v1-5 · 新建回执文案单点 VerdictNotices

**验收内容**：【新建回执文案单点 VerdictNotices】验收

**操作步骤**：
1. npx vitest run tests/accept-result-question-wording.test.ts 退出码 0
2. unverifiedSummaryOf 输出含两类计数，unverifiedAdviceOf 三种取值各得其文案

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-result-question-wording.test.ts → 10 passed；src/domain/workflow/VerdictNotices.ts 纯字符串零 IO，形态常量含命令/路径/计数

**验收状态**：✓ 通过

---

### v1-6 · 弹框侧接线（题干形态提示 + 回执分派）

**验收内容**：【弹框侧接线（题干形态提示 + 回执分派）】验收

**操作步骤**：
1. npx vitest run tests/accept-result-question-wording.test.ts 退出码 0
2. 断言题干同时含命令 / 路径 / 计数三类形态词，且 anchor_missing 回执含锚点补法

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-result-question-wording.test.ts → 13 passed；题干断言同时含命令/路径/计数三类形态词，anchor_missing 回执含锚点补法

**验收状态**：✓ 通过

---

### v1-7 · HTTP 回执按真实原因分派

**验收内容**：【HTTP 回执按真实原因分派】验收

**操作步骤**：
1. npx vitest run tests/accept-result-question-wording.test.ts 退出码 0
2. HTTP 回执含原因分类，且源码断言无写死句

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-result-question-wording.test.ts tests/verdicts-and-rework.test.ts → 36 passed；POST /api/verdicts 源码级断言不再有写死旧句且真调用单点函数

**验收状态**：✓ 通过

---

### v1-8 · 契约与文案单点的机械钉死

**验收内容**：【契约与文案单点的机械钉死】验收

**操作步骤**：
1. npx vitest run tests/accept-verdict-reason-contract.test.ts tests/accept-result-question-wording.test.ts 退出码 0
2. 字段镜像与可选性断言通过，两处调用同一函数

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-verdict-reason-contract.test.ts tests/accept-result-question-wording.test.ts → 33 passed；镜像与值域用类型层精确相等断言，可选性双保险

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量 npx vitest run --reporter=dot → Test Files 36 failed | 547 passed (588)；36 个失败文件名与本需求相关文件交集为空（grep 零命中）；pnpm typecheck 退出码 0；8 张父卡与 31 张子卡全部 done

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1（就地续作）：reqboard_status 的 seats 仍只有本窗口 owner 一条；D-2（采信实测根因）：design/backend.md S-1 实施期修正 + tests/verdict-downgrade-reason.test.ts 12 passed；D-3（范围 ①+② 且限服务端）：8 张卡 side 全为 backend，src/client 零改动（git status 核对）

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/result-anchor-submit.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/result-anchor-submit.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-12 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——提交侧锚点拒绝分支与错误码 → tests/x.test.ts；提交侧锚点拒绝分支与错误码·复核 → tests/x.test.ts；提交侧锚点拒绝分支与错误码·研发 → tests/x.test.ts；提交侧锚点拒绝分支与错误码·联调 → tests/x.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——提交侧锚点拒绝分支与错误码 → tests/x.test.ts
2. 提交侧锚点拒绝分支与错误码·复核 → tests/x.test.ts
3. 提交侧锚点拒绝分支与错误码·研发 → tests/x.test.ts
4. 提交侧锚点拒绝分支与错误码·联调 → tests/x.test.ts。请把锚点改为真实文件，或回写设计/任务卡
5. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- npx vitest run --reporter=dot → Test Files 36 failed | 547 passed | 3 skipped (588)；Tests 68 failed | 6920 passed
- 失败文件清单与本需求交集核对：对 36 个失败文件名 grep -E "result-anchor|verdict|accept-sheet|acceptance|accept-result|unverified|anchor" → 零命中
- pnpm typecheck → tsc --noEmit -p tsconfig.json，退出码 0
- npx vitest run tests/verdict-downgrade-reason.test.ts → 12 passed（FR-2 判定与落账）
- npx vitest run tests/result-anchor-submit.test.ts → 21 passed（FR-1 桶 + 端到端拒绝）
- npx vitest run tests/verdict-human-anchor-reject.test.ts → 13 passed（FR-3 拒绝与不误伤）
- npx vitest run tests/accept-result-question-wording.test.ts → 23 passed（FR-2/FR-4 文案与两通道接线）
- npx vitest run tests/accept-verdict-reason-contract.test.ts → 10 passed（契约镜像与可选性）
- 回归：tests/result-binding / accept-sheet-tool / accept-sheet-zero-input / application-use-cases → 全绿（含 9 条受影响夹具的锚点化修正）
- 代码落点：AcceptanceSheetSpec.ts（judgePassedVerdict / isHumanAuthored / 原因字段）、ResultBinding.ts（unanchored 桶）、SubmitVerification.ts:575-586（拒绝分支）、AcceptSheet.ts（题干 + 回执）、http/routers/verdicts.ts（回执）、VerdictNotices.ts（文案单点）
- 文档回改三处：requirement.md FR-3 边界与数据契约、design/backend.md S-1 与 S-2、design/interfaces.md I-7（均附实施期修正说明与证据）
- 验收前置材料：reviews/review.md（评审报告）、tests/evidence.md（逐卡读数 + 基线对比 + 交集判据 + 39 张卡的 covers 映射）
- 工作树基线（非本需求）：约 445 个无关在改文件；存量失败含 size-budget / project-scope / layer-boundary / live-tasks-single-source 等，本需求未追未修

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 落「未复核原因」字段与降级判定单点 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-2 | 裁决侧写降级原因并在人工自填无锚点时拒绝 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-3 | 提交侧锚点体检入桶 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-4 | 提交侧锚点拒绝分支与错误码 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-5 | 新建回执文案单点 VerdictNotices | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-6 | 弹框侧接线（题干形态提示 + 回执分派） | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-7 | HTTP 回执按真实原因分派 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-8 | 契约与文案单点的机械钉死 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-10 | 需求级验收 | ✓ 通过 | human/session-38ae86c9-f5e0-4468-b77d-d9426842eebe | 2026-10-07 18:30 |
| v1-11 | 需求级验收 · 孤儿用例 | ⬜ 待验收 |  |  |
| v1-12 | 需求级验收 · 锚点失效 | ⬜ 待验收 |  |  |
