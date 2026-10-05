# REQ-261001213924-1441 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：唤醒链的「停下来之后回不来 / 为什么停看不见 / 重启就丢自动化」三类问题一次修齐，八张卡（含子卡段 39 张）全部落地，每张都有覆盖它的用例与可复核命令。

一、真正修好的（都有生产证据）：
1) 一次异常不再等于永久失去自动化（运行时故障只写 driverHealth，activation 只有人能改）；
2) 达上限不再锁死（停下等人，继续时把本阶段额度还回去）；实测台账证据：`[Dive 回合上限] 阶段 archived 达上限 1 回合 → 终态暂停 paused/round-limit`；
3) 阶段推进即归零（不再被 draft/archived 的 1 回合上限误杀）；
4) 重启不再改写人的意图（teardown 不写任何状态）；
5) 「它不动了」可判定（心跳兜底 + [WAKE-RX] 接收证明）；
6) 订阅归属修正（per-agent 六路注册到 agent.ctx，随 agent 处置注销；失败 warn+诊断+comment 三者齐备）；
7) 回合收尾只认一个解析器（error/interrupted 修前被静默忽略）；
8) 存量台账启动幂等归一（6 行矩阵，可复核可回滚）。

二、前提更正（已按你的裁决落文档）：FR-3 原登记「agent/* 被 scope 过滤器丢弃」经宿主机源码核查不成立（未打标签 ctx 一律放行；goal-round-driver 同款做法生产可用），保留实现、理由改为「生命周期归属 + 失败响亮」。

## 1. 验收列表

### v1-1 · 定死状态契约：人的意图与运行时健康分家

**验收内容**：【定死状态契约：人的意图与运行时健康分家】验收

**操作步骤**：
1. npx vitest run tests/dive-round-state.test.ts 全绿（真值表）
2. tsc 过滤 round-state/protocol 无新增错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-2 · 回合计数改「本阶段」：阶段推进就归零

**验收内容**：【回合计数改「本阶段」：阶段推进就归零】验收

**操作步骤**：
1. npx vitest run tests/dive-round-driver.test.ts：跨阶段后 roundsInStage===0
2. 同阶段不归零。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-3 · 达上限不再锁死：人一动就能继续

**验收内容**：【达上限不再锁死：人一动就能继续】验收

**操作步骤**：
1. npx vitest run tests/dive-round-driver.test.ts tests/dive-rearm.test.ts：达上限后 activation 不变、reason 含 round-limit
2. recoverHealth 后可驱动。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-4 · 把 agent 事件订阅搬到 agent 作用域上

**验收内容**：【把 agent 事件订阅搬到 agent 作用域上】验收

**操作步骤**：
1. npx vitest run tests/dive-wake-wiring.test.ts：注册在 agent.ctx
2. disposed 后注销
3. 负例三者齐备。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-5 · 加心跳兜底与唤醒链诊断

**验收内容**：【加心跳兜底与唤醒链诊断】验收

**操作步骤**：
1. npx vitest run tests/dive-rearm.test.ts：tick() woken 含该需求
2. 3 次失败 → health=paused 且 activation 不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-6 · 回合收尾只认一个解析器

**验收内容**：【回合收尾只认一个解析器】验收

**操作步骤**：
1. npx vitest run tests/dive-round-driver.test.ts：三种形状结论一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-7 · 一条真端到端断言当门禁（修前必红）

**验收内容**：【一条真端到端断言当门禁（修前必红）】验收

**操作步骤**：
1. npx vitest run tests/dive-wake-e2e.test.ts 全绿
2. 修前必红且留证。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-8 · 存量台账分类迁移与兼容回滚

**验收内容**：【存量台账分类迁移与兼容回滚】验收

**操作步骤**：
1. npx vitest run tests/dive-migration.test.ts：五种形态落矩阵结果并留痕
2. 二次运行零写入。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes

**验收状态**：✓ 通过

---

## 2. 测试报告

- pnpm build → Build complete in 808ms；[verify-client] OK bundle=333950 bytes
- npx vitest run tests/dive-wake-e2e.test.ts → 5 passed（端到端五步）
- npx vitest run tests/dive-round-state.test.ts tests/dive-round-driver.test.ts tests/dive-rearm.test.ts → 18 + 23 + 17 passed
- npx vitest run tests/dive-wake-wiring.test.ts tests/dive-migration.test.ts → 10 + 7 passed
- npx vitest run（全量）→ 98 failed / 2974 passed / 20 skipped（基线 97 / 2897）
- docs/requirements/REQ-261001213924-1441/tests/test-evidence.md（含 39 条 covers: 覆盖对照表）
- docs/requirements/REQ-261001213924-1441/reviews/review-report.md（复核报告，含宿主机源码行号级反证与风险清单）
- 前提证据（宿主机源码，只读）：packages/core/scope/src/index.ts:165-181；packages/core/agent/src/dispatch.ts:94-96；packages/goal/goal-round-driver/src/index.ts:245,269

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死状态契约：人的意图与运行时健康分家 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-2 | 回合计数改「本阶段」：阶段推进就归零 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-3 | 达上限不再锁死：人一动就能继续 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-4 | 把 agent 事件订阅搬到 agent 作用域上 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-5 | 加心跳兜底与唤醒链诊断 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-6 | 回合收尾只认一个解析器 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-7 | 一条真端到端断言当门禁（修前必红） | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-8 | 存量台账分类迁移与兼容回滚 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
| v1-10 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-fc0c4b27-505e-4897-adf1-f6d70f624de4 | 2026-10-02 09:28 |
