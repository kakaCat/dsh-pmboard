---
req_id: REQ-261004065652-5c1c
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
---

# 测试用例设计（REQ-261004065652-5c1c）

> 纪律：**每条 FR 至少一条"反向演练"**（把修复拿掉 → 用例必须变红）。
> 这是本需求唯一能证明"护栏真的在拦"的方式——本次事故的护栏一个都没拦住的根因，
> 正是只有正向断言、没有反向演练。
> 时间敏感项一律用**注入时钟 / 假时钟**，禁止真实 `sleep`。

## 测试策略与落点 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

| 层级 | 覆盖对象 | 测试文件（实际文件） |
|---|---|---|
| 单元（纯函数） | 分类器 / 闩 / 人工门 / 预算 / 留痕去重 | tests/upstream-failure.test.ts、tests/provider-latch.test.ts、tests/human-gate.test.ts、tests/chain-budget.test.ts、tests/interruption-dedupe.test.ts |
| 集成（存储） | 投影读己所写 | tests/store-projection-ryow.test.ts |
| 集成（驱动） | 闭锁 / 熔断 / 中止 / 人工门停手 | tests/dive-loop-breaker.test.ts、tests/dive-abort-latch.test.ts、tests/dive-human-gate-stop.test.ts |
| 集成（用例） | 弹框缺省宽限 / 终态对账 / 引擎预检 | tests/ask-confirm-default-grace.test.ts、tests/dive-terminal-reconcile.test.ts、tests/advance-engine-precheck.test.ts |
| E2E（重放） | 死循环场景重放（假 agent：投递即 AUTH 失败） | tests/dive-loop-breaker.test.ts（`-t "loop replay"`） |

## TC-1: 投影读己所写 `covers: t1` `serves: FR-4`

**测试目标**：写入的 `dive`/`advance` 变更，**同拍**可从同步投影读到。

**步骤**：
1. 建 store（分片实现，临时 root）→ 建一条需求（`armed+healthy`）→ 触发建索引（`peekFacts()` 有该 id）；
2. `store.mutate(id, r => { r.dive.driverHealth = { state:'paused', reason:'agent-error', since: now, attempts:1 }; ... })`；
3. **不 await 任何读**，直接 `store.peekFacts().find(r => r.id === id)`。

**预期结果**：
- `facts.dive.driverHealth.state === 'paused'`（现状：`healthy`，红）；
- `isDrivableRequirement(facts) === false`；
- 反向演练：注释掉 notify 里的 `factsCache.set` → TC-1 红。

## TC-2: roundsInStage 不再恒 0 `covers: t1` `serves: FR-4`

**测试目标**：准入计数经投影可见，回合上限判据因此生效。

**步骤**：写 `dive.roundsInStage = 1` → 同拍读 `peekFacts()` → 断言 `round = roundsInStage + 1 === 2`。

**预期结果**：`round === 2`（现状：恒 `1`，红）。

## TC-3: 致命错误不可重试 `covers: t2` `serves: FR-1`

**测试目标**：`AUTH` 类错误只投一次，然后停手 + 全局闩。

**步骤**（假 agent：每投一回合即回 `turn/end = error{AUTH,403}`）：
1. 起轮一次 → 回合失败；
2. 反复触发 idle 拍（20 次）；
3. 断言投递次数、`driverHealth`、`providerLatch.isOpen()`。

**预期结果**：
- 投递次数 === 1（不是 20、更不是 7000）；
- `driverHealth = { state:'paused', reason:'upstream-auth' }`；
- `providerLatch.isOpen() === true`；另一条 `armed+healthy` 需求也零投递；
- 反向演练：把 `AUTH` 归到 `transient` → 投递次数 > 1，TC-3 红。

## TC-4: 瞬时错误退避与熔断 `covers: t2` `serves: FR-2`

**测试目标**：同因失败 5 次 → 实际投递 ≤ 3；退避序列正确；原因变化归零。

**步骤**（假时钟）：
1. 连续注入 `error{TRANSPORT}`：断言 `failure.count` 1→2→3 与 `nextAt` 序列 30s/1m/2m；
2. `count===3` 时断言 `driverHealth.reason === 'agent-error-loop'` 且再触发 idle 也零投递；
3. 另一条路径：注入"失败 2 次 → 成功" → 断言 `failure === undefined`。

**预期结果**：投递次数 ≤ 3；退避期内零投递；成功后退避账清空。

## TC-5: 内存闭锁 fail-closed（写盘失败也停） `covers: t2` `serves: FR-3`

**测试目标**：闭锁不依赖台账。

**步骤**：注入**写必失败**的假 store + 一次 `agent-error` → 立即断言 `readyToDrive() === false`，
并再触发 20 次 idle → 零投递。

**预期结果**：零新增回合（现状：写失败 → 投影永远 healthy → 自旋）。

## TC-6: 人中止当拍生效 `covers: t2` `serves: FR-6`

**测试目标**：`aborted:user` 后当拍闭锁、零投递。

**步骤**：投递 → 回 `turn/end = aborted{reason:{kind:'user'}}` → 连续 20 次 idle → 断言投递次数不再增长、
`latch.reasonClass === 'aborted:user'`。

**预期结果**：停止生效 ≤ 1 拍（对应实测"20 秒、84 回合"的退化）。

## TC-7: 人工门即停手 `covers: t3` `serves: FR-5`

**测试目标**：待裁决/待确认/待批准三种形态都零唤醒。

**步骤**：造三条需求（验收单 9 项 pending / 有未确认产物 / 计划未批准）→ 各触发 20 次 idle 拍。

**预期结果**：三条均零投递、零健康位写入；`humanGateOf()` 的 reason 分别为
`acceptance-pending` / `artifact-unconfirmed` / `plan-unapproved`；
全部裁决/确认/批准后 → 下一次 idle 即可起轮。

## TC-8: 弹框缺省有界宽限 `covers: t4` `serves: FR-7`

**测试目标**：缺省不再无限阻塞。

**步骤**（假时钟 + 假 pendingConfirms）：
1. 调 `reqboard_ask_confirm`（不传 `inline_grace_ms`）→ 推进假时钟超过 `confirmDefaultGraceMs`；
2. 断言返回 `pending === true` 且带 `ticket`，**不抛超时错**；
3. 未装配 `pendingConfirms` 的实例：断言仍为全阻塞（行为不变）。

**预期结果**：宽限内作答仍走"落章 + 推进"原子路径（既有 `ask-confirm-blocking` 用例不回归）。

## TC-9: 断点留痕去重限流 `covers: t4` `serves: FR-8`

**测试目标**：交替原因不再刷屏。

**步骤**（假时钟）：交替 `stampInterruption(req, now, 'error:AUTH:<300 字符>')` 与
`'aborted:user'` 各 10 次（间隔 1 分钟）→ 断言写入次数。

**预期结果**：写入 ≤ 2 条；comment 正文长度 ≤ 200 字符 + 固定前后缀；
阶段推进（status 变化）产生的留痕**立即**写入、不受限流。

## TC-10: 终态收手与启动对账 `covers: t3` `serves: FR-9`

**测试目标**：终态需求不再被唤醒；存量"终态却 armed"被归一。

**步骤**：
1. 造 `archived + armed + healthy` 记录 → 跑 `reconcileTerminalDive()` → 断言 `activation==='disarmed'`、
   且有一条 `terminal-reconciled` 留痕；再跑一次 → 零写入（幂等）；
2. 心跳 tick 对终态需求 → 零唤醒。

**预期结果**：归一 + 幂等 + 留痕可复核；反向脚本（`scripts/rollback-terminal-reconcile.ts`）能按评论还原。

## TC-11: 子卡引擎开工预检 `covers: t5` `serves: FR-10`

**测试目标**：不可达时响亮报错、不落假子卡、不刷屏。

**步骤**：注入不可达探针 → 触发开工 3 次。

**预期结果**：第 1 次回执含 `subtask_engine_unreachable` + "本次未落任何子卡" + 两条出路；
第 2/3 次短路零写入（`advance` revision 不变）；引擎可达时行为与现状逐字一致。

## TC-12: 全局预算闸 `covers: t5` `serves: FR-11`

**测试目标**：WIP 与 token 两条阈值各拦一次。

**步骤**：
1. 造 `maxInFlightChains + 1` 条可起轮需求 → 断言第 N+1 条被拒、`reason==='wip-limit'`；
2. 造 `tokenUsage.cacheReadTokens` 之和超限 → 断言 `reason==='token-budget'`；
3. 在跑链结束后 → 名额释放、下一条可起轮。

**预期结果**：拒绝时零投递 + 一条含阈值名与当前值的留痕；**不杀**已在跑的链。

## TC-13: 缺省即旧行为（可灰度判据） `covers: t6` `serves: FR-1, FR-3, FR-5, FR-11`

**测试目标**：四个新端口全不装配时，既有行为逐字不变。

**步骤**：构造 `DiveRoundPorts`（不含 `providerLatch` / `humanGate` / `chainBudget`）→
跑既有 `tests/dive-round-driver.test.ts` 场景。

**预期结果**：既有 8 个测试文件的结果与开工基线一致（1 failed / 101 passed），零新增失败。

## TC-14: 死循环场景重放（E2E） `covers: t6` `serves: FR-1, FR-2, FR-3`

**测试目标**：把 2026-10-03 的事故在假 agent 上重放，验证"有限步"。

**步骤**：假 agent 每次投递立即回 `error{AUTH,403}`；跑 300 拍（假时钟推进 30 分钟）。

**预期结果**：投递次数 ≤ 3；台账 `driverHealth.state === 'paused'`；
**断言 300 拍内回合数不增长**（对应实测 7257 回合 / 276 分钟）。
