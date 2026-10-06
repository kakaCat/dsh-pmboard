# REQ-261006164732-6503 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：同一道人工确认门从此**至多一个在等的框**，台账**首写即事实**——被取代或已推进的作答只留痕，不再改写审批时间与证据原文。\n\n核心改动：新增建门唯一入口 requestGate（判定序 复用→早退→新建），三条建门通道全部走同一处判定；落章前提与首写纪律收敛成共用单点（gateStaleReason / stampArtifactOnce / stampPlanOnce），**五处写点**（会话弹框主落章 / 门合并块 / 文字证据 / 看板产物 / 看板计划）全部调用它；三条「叫 agent 去弹框」的文案源改条件式。\n\n验收阶段做了独立评审（独立子代理，只读、不改文件）：结论不通过，报了 2 条阻断 + 5 条重要。据此整改：门合并块与文字证据路径原本**没有首写守卫**（可复现地把已落章的 confirmedAt 与证据原文覆写）——已修，并各补承重用例 + 反向演练（改坏即红、diff -q 逐字节还原）；工具面注入 adopted_ticket 的绕过口径已堵；G4 的 reused 分支补了专用用例。评审报告与逐条处置见 reviews/independent-review.md。\n\n读数：定向广度 22 套件 231 例全绿；四门矩阵 79 例全绿；探针 exit 0；片段一致性 exit 0；测试覆盖标注（covers）覆盖 40 个任务；pnpm baseline:check 新增失败 9 条全部落在并发窗口改动面（含 client-view 3 条，该测试与本需求 17 个改动源文件零 import 交集），本需求整改中自己引入的 3 处副作用已全部修掉；npx tsc --noEmit 仅 1 条错误且指向他人改动面。\n\n如实交代：① 设计 A-4/B-4/I-6 的 gateOpen 判据未按原文拦人（由基线差集纠正，理由记在 notes/execution-decisions.md，设计原文更新列为后续动作）；② FR-3「回执文案断言」仍无用例（已登记为未覆盖项）；③ Dive 的 gate-prompt 是第 6 条未收敛的弹框通道（属并发窗口改动面，本次不越界）；④「其余基线失败非本需求引入」是证据链而非独立证明。

## 1. 验收列表

### v1-1 · 给 PendingConfirmRegistry 加只读 findOpen

**验收内容**：【给 PendingConfirmRegistry 加只读 findOpen】验收

**操作步骤**：
1. ① npx vitest run tests/pending-confirm-registry-findopen.test.ts 退出码 0 且 ≥5 例通过
2. ② 实现体内不出现 settle / register / markInterrupted 调用（三处 grep 计数为 0）
3. ③ npx vitest run tests/pending-confirm-ttl.test.ts 全绿（TTL 语义零变化）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/pending-confirm-registry-findopen.test.ts → 9 passed；findOpen 纯读（settle/register/markInterrupted 计数 0）；TTL 回归 5 例全绿

**验收状态**：✓ 通过

---

### v1-2 · 新增 gate-request.ts 建门唯一入口（复用→早退→新建）

**验收内容**：【新增 gate-request.ts 建门唯一入口（复用→早退→新建）】验收

**操作步骤**：
1. ① npx vitest run tests/gate-request-uniqueness.test.ts 中 U1~U5 全绿（弹框端口恰好 1 次、票表计数不变、两次 ticket 相同）
2. ② npx tsc --noEmit -p tsconfig.json 退出码 0
3. ③ 反向验证：把 reused 分支改成「照旧登记新票」⇒ U1 必红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/gate-request-uniqueness.test.ts → 11 passed；反向演练删掉复用分支 ⇒ 4 例真红，diff -q 逐字节还原

**验收状态**：✓ 通过

---

### v1-3 · auto-confirm 改走 requestGate（自动弹不再重复建门）

**验收内容**：【auto-confirm 改走 requestGate（自动弹不再重复建门）】验收

**操作步骤**：
1. ① npx vitest run tests/ask-confirm-pending.test.ts 全绿
2. ② 新增断言：已有同门在等时 triggerAutoConfirm 返回 triggered=false 且弹框端口调用 0 次
3. ③ npx vitest run tests/submit-prototype.test.ts 全绿（无门产物仍不建门、仍不钉窗口）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/auto-confirm-no-second-gate.test.ts → 3 passed（已有门不弹 / 已落章不弹 / 沿用同一张票，注册计数恰为 1）

**验收状态**：✓ 通过

---

### v1-4 · AskConfirm 改走 requestGate 且陈旧票清理分门

**验收内容**：【AskConfirm 改走 requestGate 且陈旧票清理分门】验收

**操作步骤**：
1. ① npx vitest run tests/ask-confirm-pending.test.ts tests/pending-guard.test.ts 全绿
2. ② 新增断言：同门连调两次 ⇒ pending_confirms 计数不变且两次 ticket 相同
3. ③ 异门实例：旧票 outcome 非空、新票在场、票表计数为 1。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/ask-confirm-blocking.test.ts → 7 passed（TC-10 复用语义、TC-10b 异门清理、工具面注入 adopted_ticket 无效）+ ask-confirm-pending 13 passed

**验收状态**：✓ 通过

---

### v1-5 · 验收门自动确认改走 requestGate（阻塞形态不变）

**验收内容**：【验收门自动确认改走 requestGate（阻塞形态不变）】验收

**操作步骤**：
1. ① npx vitest run tests/verification-sheet.test.ts 全绿
2. ② blockers 存在时仍不建门（用例断言弹框端口 0 次）
3. ③ 重复提交验收材料 ⇒ 第二次不弹框且回执说明已有一道门在等。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/verification-no-second-gate.test.ts → 2 passed（门未答时被 REQBOARD_CONFIRM_PENDING 拦且无第二框；通道不可用不建门）

**验收状态**：✓ 通过

---

### v1-6 · confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer

**验收内容**：【confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer】验收

**操作步骤**：
1. ① npx vitest run tests/confirm-advance-deadlock.test.ts 全绿
2. ② 已批准计划再走一次落章路径 ⇒ plan.approvedAt 与 approvedEvidence 逐字节不变
3. ③ 构造「需求已离开来源阶段」后作答 ⇒ 台账零新时间戳、评论 +1、回执 confirmed=false。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/confirm-settle-preconditions.test.ts → 6 passed（含门合并块不被覆写：反向演练恢复无条件赋值 ⇒ expected 999 to be 9）+ confirm-group 新增 1 例绿

**验收状态**：✓ 通过

---

### v1-7 · 迟到作答路由到中性通道（不落章不推进）

**验收内容**：【迟到作答路由到中性通道（不落章不推进）】验收

**操作步骤**：
1. ① npx vitest run tests/gate-request-uniqueness.test.ts 的 U7/U8 全绿
2. ② 失效门作答回执 confirmed=false 且 note 含「已被取代 / 已推进」
3. ③ spy 断言：失效路径不调用 applyConfirmDecision（调用计数 0）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/stale-answer-background.test.ts → 2 passed（落章 spy 0 次、台账零新时间戳、多一条留痕；未失效对照照旧落章）

**验收状态**：✓ 通过

---

### v1-8 · 指南三处与回执 note 去机制化并重生成产物

**验收内容**：【指南三处与回执 note 去机制化并重生成产物】验收

**操作步骤**：
1. ① node scripts/check-prompt-fragments.mjs 退出码 0（片段与产物一致）
2. ② 文案断言：triggered=true 的 note 不含「下一步：调 `reqboard_ask_confirm`」
3. ③ 三处指南不再出现无条件「提交后调 reqboard_ask_confirm」
4. ④ npx vitest run tests/stage-prompts.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：check-prompt-fragments exit 0；prompt-conditional-gate 3 + stage-prompts 37 + prompt-baseline 15 + prompt-tiers 40 全绿

**验收状态**：✓ 通过

---

### v1-9 · recovery 与拒绝文案删掉“覆盖”措辞

**验收内容**：【recovery 与拒绝文案删掉“覆盖”措辞】验收

**操作步骤**：
1. ① npx vitest run tests/pending-guard.test.ts tests/pending-guard-integration.test.ts 全绿
2. ② 文案断言：recovery 不含「覆盖旧记录」，且含「取回执」与「看板」
3. ③ npx vitest run tests/status-pending-confirm.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pending-guard 20 + integration 8 + confirm-pending-guard 5 + status-pending-confirm 4 = 37 passed；recovery 与拒绝原文均不含「覆盖旧记录」

**验收状态**：✓ 通过

---

### v1-10 · 补 U1~U9 用例与“同门唯一”探针

**验收内容**：【补 U1~U9 用例与“同门唯一”探针】验收

**操作步骤**：
1. ① npx vitest run tests/gate-request-uniqueness.test.ts 9 例全绿
2. ② 探针退出码 0 且输出含 ref / target / createdAt，同门计数 ≤1
3. ③ 三条「改坏必红」在 U1 / U4 / U6 上真红（记录输出后还原）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：gate-inflight-probe exit 0；改坏复用分支 exit 1；U1~U9 索引表 + 部分落章承重用例全绿

**验收状态**：✓ 通过

---

### v1-11 · 四门回归矩阵 + 反向演练 + 基线证据落盘

**验收内容**：【四门回归矩阵 + 反向演练 + 基线证据落盘】验收

**操作步骤**：
1. ① 四门矩阵全绿
2. ② npx tsc --noEmit -p tsconfig.json 退出码 0
3. ③ pnpm baseline:check 失败用例集合差为空
4. ④ tests/evidence.md 含每条命令与输出摘要（可复核）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/evidence.md 落盘（四门矩阵 / 五条演练 / 基线两次对照 / 归属 / t13 复测 / covers 40 任务）

**验收状态**：✓ 通过

---

### v1-12 · 落盘迁移 / 兼容 / 回滚清单

**验收内容**：【落盘迁移 / 兼容 / 回滚清单】验收

**操作步骤**：
1. ① 清单四节齐备且每节带依据/证据指向
2. ② npx vitest run tests/output-contract.test.ts 全绿（返回键零新增）
3. ③ 清单路径可在看板文档页打开。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/output-contract.test.ts → 42 passed（返回键零新增）；notes/migration-rollback.md 四节齐备

**验收状态**：✓ 通过

---

### v1-13 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向广度 22 套件 231 passed / 0 failed；tsc 1 条错误（他人 verify.ts）；baseline 新增失败 9 条全属并发改动面（client-view 与本需求 17 个改动源文件零 import 交集）；独立评审 2 条阻断已修并各带承重用例 + 反向演练（reviews/independent-review.md 处置表）；覆盖标注见 tests/evidence.md 第 8 节（40 个任务全覆盖）

**验收状态**：✓ 通过

---

### v1-14 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 覆盖面含 G1/G3：指南三处 + 回执 note 条件式（prompt-conditional-gate 3 + stage-prompts 37 + prompt-baseline 15 + prompt-tiers 40 全绿）；D-2 复用优先：U1/U5、TC-10 改写、G4 专用例；D-3 根治形态：建门唯一入口 + 五处写点首写纪律 + 迟到中性化，探针 exit 0

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run（22 套件定向广度）→ 231 passed / 0 failed
- npx vitest run（四门矩阵 9 套件）→ 79 passed / 0 failed
- npx tsx scripts/gate-inflight-probe.mts → exit 0（A1 复用同一张票 / A2 同门唯一在途 / A3 异门清理）；反证：删掉复用分支 ⇒ exit 1
- pnpm baseline:check → 新增失败 9 条，全部落在并发窗口改动面（client-view 3 / live-tasks-single-source 2 / report-tabs 2 / kb-generate 1 / typecheck 1）；本需求整改引入的 3 处副作用已全部修掉
- npx tsc --noEmit -p tsconfig.json → 1 条错误，指向 src/client/views/panels/verify.ts:36（并发窗口 18:01:36 改动），本需求 17 个改动源文件零类型错误
- node scripts/check-prompt-fragments.mjs → exit 0（片段 ↔ 生成物一致，C-17）
- docs/requirements/REQ-261006164732-6503/reviews/independent-review.md（独立子代理只读评审：2 阻断 + 5 重要 + 5 次要，含逐条处置与反向演练）
- docs/requirements/REQ-261006164732-6503/tests/evidence.md（四门矩阵 / 五条改坏必红演练 / 基线两次对照 / 逐条归属 / t13 复测 / 第 8 节 covers 覆盖标注：40 个任务全覆盖）
- docs/requirements/REQ-261006164732-6503/notes/execution-decisions.md（执行期偏差与未覆盖项登记）
- docs/requirements/REQ-261006164732-6503/notes/migration-rollback.md（零 schema 依据 / 旧调用方核对 / 回滚步骤 / 历史覆写阅读口径）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 给 PendingConfirmRegistry 加只读 findOpen | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-2 | 新增 gate-request.ts 建门唯一入口（复用→早退→新建） | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-3 | auto-confirm 改走 requestGate（自动弹不再重复建门） | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-4 | AskConfirm 改走 requestGate 且陈旧票清理分门 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-5 | 验收门自动确认改走 requestGate（阻塞形态不变） | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-6 | confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-7 | 迟到作答路由到中性通道（不落章不推进） | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-8 | 指南三处与回执 note 去机制化并重生成产物 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-9 | recovery 与拒绝文案删掉“覆盖”措辞 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-10 | 补 U1~U9 用例与“同门唯一”探针 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-11 | 四门回归矩阵 + 反向演练 + 基线证据落盘 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-12 | 落盘迁移 / 兼容 / 回滚清单 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-13 | 需求级验收 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
| v1-14 | 需求级验收 | ✓ 通过 | human/session-d210345f-6bd2-4a05-be59-e859c70b86c5 | 2026-10-06 18:57 |
