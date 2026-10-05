# REQ-261002141430-a5ef 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：人工门禁弹框在途时自动链停手、作答到达即自动解除并续跑、没有弹框时一律不停——三条口径全部落地。7 张父卡 + 28 张子卡全 done（33 张卡逐卡覆盖标注见测试证据第 6 节）；改动文件类型错误 0；全量测试失败数 100 ≤ 精确基线 105（新引入失败为空集，5 条新用例由红转绿=修前必红有据）；pnpm build 退出码 0。唯一缺口：真弹框的人工端到端本轮未执行，已如实登记为待补复核。

## 1. 验收列表

### v1-1 · 落地「在途弹框登记 + 停手位」契约

**验收内容**：【落地「在途弹框登记 + 停手位」契约】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-9" 全绿：重复 exit 零写入且不抛
2. 注入 mutate 抛错时 alert 恰被调用一次，且 inFlightFor(requirementId) 仍为 true（拦截优先于台账）。另 grep -rn "awaiting-confirm:" src 只命中 awaiting-confirm.ts（前缀单点，别处只能 import 常量）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-2 · 回合投递先问「有人在等吗」

**验收内容**：【回合投递先问「有人在等吗」】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-1" 绿：在途时 deliverMessage 调用次数 = 0、createRoundMessage = 0，driverHealth.state !== 'paused'，roundsInStage 不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-3 · 实施链派卡先问「有人在等吗」

**验收内容**：【实施链派卡先问「有人在等吗」】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-2" 绿：out.stopped === 'awaiting-confirm'，req.autoRun === true 保持不变，advance.noopStreak 未增长，无新任务进入 in_progress。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-4 · 三个弹框投递点接上登记与清除

**验收内容**：【三个弹框投递点接上登记与清除】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-7" 与 -t "TC-8" 绿：同一 idle 拍弹框 1 次、投递回合 0 次
2. 弹框通道不可用时在途表为空且 driverHealth 无 awaiting-confirm 前缀。既有的 ask_confirm / accept_sheet / 输出契约用例保持全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-5 · 补齐四条恢复出口与周期对账

**验收内容**：【补齐四条恢复出口与周期对账】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-5" 与 -t "TC-6" 绿：在途时 recoverHealth 返回 false 且零写入（comment 数不变），解除后返回 true 并转 healthy
2. 心跳对账把「停手但无在途」恢复且 resumed 含该需求，在途仍在时同一趟不恢复。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-6 · 回归用例：停手、续跑、反向自检

**验收内容**：【回归用例：停手、续跑、反向自检】验收

**操作步骤**：
1. npx vitest run tests/dialog-inflight-stop.test.ts 全部用例绿，且 TC-1/TC-2/TC-3/TC-5/TC-6/TC-7/TC-9 在改动前必红（用例内置反向自检，禁止恒真断言）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-7 · 兼容、回滚与端到端核对

**验收内容**：【兼容、回滚与端到端核对】验收

**操作步骤**：
1. pnpm typecheck 2>&1 | grep -E "awaiting-confirm|round-driver|rearm|gate-prompt|wake-heartbeat" 无输出（C-15）
2. pnpm test 失败数 ≤ 基线 106 且新增用例全绿（C-14）
3. pnpm build 退出码 0（C-11）
4. 端到端记录含「提交产物→停手可见→点确认→自动续跑」四步实测结果。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/dialog-inflight-stop.test.ts → 14 passed（TC-1…TC-9）
- 修前必红取证（精确基线）：awaiting-confirm 三函数临时置空 → 全量失败 105；恢复真实实现 → 100；差集「新引入的失败 = 空集」，唯一差值是本文件 5 条用例由红转绿。取证记录：docs/requirements/REQ-261002141430-a5ef/tests/test-evidence.md 第 2 节
- npx tsc --noEmit 过滤本次改动文件 → 0 条（C-15）
- pnpm build → 退出码 0；[verify-client] OK bundle=335555 bytes（C-11）
- 独立复核报告：docs/requirements/REQ-261002141430-a5ef/reviews/self-review.md（含一条我自己的误判与纠正）
- 逐卡覆盖对照（33 张卡，covers: t-xxx 标注）：docs/requirements/REQ-261002141430-a5ef/tests/test-evidence.md 第 6 节
- 代码锚点：src/application/internal/awaiting-confirm.ts、src/application/dive/round-driver.ts、src/application/use-cases/AdvanceChain.ts、src/application/dive/gate-prompt.ts、src/application/dive/wake-heartbeat.ts、src/application/internal/rearm.ts
- 覆盖对照：docs/requirements/REQ-261002141430-a5ef/decomposition.md §3（FR-1…FR-6 全部有落点）
- 测试主文件：tests/dialog-inflight-stop.test.ts（14 条断言）
- 待补复核（如实）：人工端到端四步未执行；阻塞弹框未纳入判据（边界 ⑤）——见 docs/requirements/REQ-261002141430-a5ef/tests/test-evidence.md 第 5 节

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 落地「在途弹框登记 + 停手位」契约 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-2 | 回合投递先问「有人在等吗」 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-3 | 实施链派卡先问「有人在等吗」 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-4 | 三个弹框投递点接上登记与清除 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-5 | 补齐四条恢复出口与周期对账 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-6 | 回归用例：停手、续跑、反向自检 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-7 | 兼容、回滚与端到端核对 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
| v1-9 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-0dc94a2a-9c00-455b-ac58-f96624a21da2 | 2026-10-02 14:44 |
