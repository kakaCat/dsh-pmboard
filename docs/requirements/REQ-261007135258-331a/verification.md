# REQ-261007135258-331a 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：四条确认通道（会话弹框 / Dive 门框 / 文字证据 / 看板一键）已统一走「落章 + 推进 + 收尾」单点：看板与文字证据的推进改调 applyConfirmedAdvance，推进后统一清停手位 + 复位运行时健康；看板推进不再以窗口在线为前置；门禁回执改指 reqboard_ask_confirm；四通道对拍用例把一致面锁死并经逆验证证明非空转。需求自身 10 个用例文件 103 例全绿、typecheck 0 错误、两条定向 grep 空输出。全量 pnpm test 仍红，经人工裁决收窄验收口径并如实留痕（既有基线红 + 在飞改动红，与本需求无关）。

## 1. 验收列表

### v2-1 · 抽统一收尾 finishConfirmAdvance 并接进推进单点

**验收内容**：【抽统一收尾 finishConfirmAdvance 并接进推进单点】验收

**操作步骤**：
1. npx vitest run tests/confirm-advance-finish.test.ts 全绿
2. 断言收尾后 dive.driverHealth.state === 'healthy' 且 reason 不以 awaiting-confirm: 开头
3. 注入 exitAwaitingConfirm 抛错替身时函数不抛且 req.status 已是 to（exit 0）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/confirm-advance-finish.test.ts → 4 passed；tests/confirm-advance-deadlock.test.ts → 11 passed；单点收尾 finishConfirmAdvance 内两件事各自 try/catch、永不抛

**验收状态**：✓ 通过

---

### v2-2 · 看板确认推进改走单点并与窗口在线解耦

**验收内容**：【看板确认推进改走单点并与窗口在线解耦】验收

**操作步骤**：
1. npx vitest run tests/artifact-confirm-board.test.ts 全绿
2. 窗口离线用例断言 advanced === true && delivered === false
3. grep -n "transitionRequirement(" src/http/routers/requirements.ts 在确认分支零命中（exit 0）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/artifact-confirm-board.test.ts → 4 passed；离线用例断言 advanced===true、delivered===false、note 含「窗口不在线」；确认分支（requirements.ts:522）只调 applyConfirmedAdvance

**验收状态**：✓ 通过

---

### v2-3 · 文字证据确认推进改走单点

**验收内容**：【文字证据确认推进改走单点】验收

**操作步骤**：
1. npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts 全绿
2. grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts 零命中（exit 0）
3. advance:false 用例断言 advanced === false

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/confirm-evidence.test.ts（9 例）+ tests/confirm-settle-preconditions.test.ts（6 例）→ 15 passed；grep transitionRequirement( ConfirmArtifact.ts → 空输出；逆验证：跳过收尾时「停手位被清」必红

**验收状态**：✓ 通过

---

### v2-4 · 门禁 how 指路改指 reqboard_ask_confirm

**验收内容**：【门禁 how 指路改指 reqboard_ask_confirm】验收

**操作步骤**：
1. npx vitest run tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts 全绿
2. grep -rn "reqboard_move(requirement_id" src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts 空输出（exit 1）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/decision-gates.test.ts（36 例 | 2 skipped）+ tests/stage-gate-timeline.test.ts（20 例）→ 全绿；grep reqboard_move(requirement_id 两个源文件 → 空输出（exit 1）；how 文案含 reqboard_ask_confirm

**验收状态**：✓ 通过

---

### v2-5 · 四通道对拍用例与起轮回归锁

**验收内容**：【四通道对拍用例与起轮回归锁】验收

**操作步骤**：
1. npx vitest run tests/confirm-channel-parity.test.ts 全绿
2. 逆验证一次（注释收尾调用后该用例失败）并把两次输出摘要写进实施记录

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/confirm-channel-parity.test.ts → 5 passed；逆验证：跳过单点收尾 → 3 例红并点名 evidence/board 通道与四元组本体，恢复后转绿

**验收状态**：✓ 通过

---

### v2-6 · 全量回归与静态断言收尾

**验收内容**：【全量回归与静态断言收尾】验收

**操作步骤**：
1. npx vitest run（本需求 10 个用例文件：artifact-confirm-board / confirm-advance-deadlock / confirm-evidence / confirm-settle-preconditions / awaiting-clear-notice / dive-confirm-advance / confirm-channel-parity / confirm-advance-finish / decision-gates / stage-gate-timeline）→ 全绿
2. pnpm typecheck → 退出码 0
3. grep -rn "transitionRequirement(" 在确认即推进分支零命中（ConfirmArtifact.ts 零命中 + requirements.ts 确认分支只调 applyConfirmedAdvance），其它路由的合法调用保留
4. grep -rn "reqboard_move(requirement_id" 两个门禁文件空输出（exit 1）。全量 pnpm test 记为既有红 + 在飞改动红，如实留痕、不阻塞本卡（人工裁决 2026-10-07）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm typecheck → 0 错误；需求 10 文件 103 例全绿；两条定向 grep 空输出。全量 pnpm test 对照：HEAD 41 文件/76 例红、当前树 52 文件/100 例红，差额主因在飞 vitest 权限模型未放行 child_process（53 处 execSync 被拒），非本需求归因（人工裁决收窄验收口径并留痕，见 tests/verification-evidence.md §6）

**验收状态**：✓ 通过

---

### v2-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run（需求 10 文件）→ Test Files 10 passed、Tests 103 passed | 2 skipped；pnpm typecheck → exit 0；两条定向 grep 空输出（exit 1）。见 docs/requirements/REQ-261007135258-331a/tests/verification-evidence.md §1-§3

**验收状态**：✓ 通过

---

### v2-8 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：逐条兑现：D-1 四通道接线矩阵无缺口、未新增门/未动 UI；D-2 两处内联推进归零（ConfirmArtifact grep 空、requirements.ts 确认分支只调单点）；D-3 清位后无需人发消息即起轮（awaiting-clear-notice 5 例 + 对拍用例「等待结束」痕）；D-4 未改 NODE_ISOLATION 默认值；D-5 G1 humanOnly 断言不变；D-6 提交回执与文档写明推进由人工门确认后自动完成

**验收状态**：✓ 通过

---

## 2. 测试报告

- 需求自身 10 个用例文件 → Test Files 10 passed；Tests 103 passed | 2 skipped
- pnpm typecheck → 退出码 0
- grep transitionRequirement( ConfirmArtifact.ts → 空输出；requirements.ts 确认分支只调 applyConfirmedAdvance
- grep reqboard_move(requirement_id 两个门禁文件 → 空输出（exit 1）
- 逆验证：跳过单点收尾 → 对拍用例 3 例红并点名通道；恢复后 5 例全绿
- 全量 pnpm test 对照：HEAD 76 例红；当前树 100 例红，差额主因在飞 vitest 权限模型未放行 child_process（人工裁决收窄验收、如实留痕）
- 证据文档：docs/requirements/REQ-261007135258-331a/tests/verification-evidence.md
- 评审文档：docs/requirements/REQ-261007135258-331a/reviews/final-review.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 抽统一收尾 finishConfirmAdvance 并接进推进单点 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-2 | 看板确认推进改走单点并与窗口在线解耦 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-3 | 文字证据确认推进改走单点 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-4 | 门禁 how 指路改指 reqboard_ask_confirm | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-5 | 四通道对拍用例与起轮回归锁 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-6 | 全量回归与静态断言收尾 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-7 | 需求级验收 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
| v2-8 | 需求级验收 | ✓ 通过 | human/session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1 | 2026-10-07 14:23 |
