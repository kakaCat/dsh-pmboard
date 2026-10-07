---
req: REQ-261007135258-331a
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 测试用例设计（REQ-261007135258-331a · 确认通道接线收敛）

> 判据一律「跑什么命令、看到什么算过」；空话验收不算。用例文件与断言逐条对应 FR。

## 测试策略 `serves: FR-6`

| 层级 | 对象 | 手段 | 判据入口 |
|---|---|---|---|
| 单元 | `applyConfirmedAdvance` / `finishConfirmAdvance` | vitest + 内存台账替身 | `tests/confirm-advance-deadlock.test.ts`、新增 `tests/confirm-advance-finish.test.ts` |
| 契约 | 四条通道回执形状与语义 | vitest + 工具 harness | `tests/ask-confirm.test.ts`、`tests/confirm-evidence.test.ts`、`tests/artifact-confirm-board.test.ts` |
| 对拍 | 四通道四件事一致性 | vitest 表驱动 | 新增 `tests/confirm-channel-parity.test.ts` |
| 契约（文案） | 门禁 `how` 指路 | vitest 断言字符串 | `tests/decision-gates.test.ts`、`tests/stage-gate-timeline.test.ts` |
| E2E | 看板确认 → 自动起轮（无需人发消息） | vitest + Dive driver 替身 + 台账读回 | `tests/dive-confirm-advance.test.ts`（沿用其口径并加看板入口） |
| 静态 | 内联推进归零 | grep 断言（脚本/Case 内断言） | `grep -rn "transitionRequirement(" src/http/routers/requirements.ts src/application/use-cases/ConfirmArtifact.ts` |

## TC-1 看板推进走单点 `serves: FR-1`

**输入**：台账状态 `brainstorming`、`requirement` 产物已登记；调用 `POST /req/artifact/confirm`。
**期望**：`advanced === true`；`status === 'design'`；`history.jsonl` 新增一条迁移；
`grep -n "transitionRequirement(" src/http/routers/requirements.ts` 在确认即推进分支**无命中**。
**命令**：`npx vitest run tests/artifact-confirm-board.test.ts`
**反例**：内容门拦下时 `advanced === false` 且 `gate_failure.code` 为具体值（不得为空）。

## TC-2 文字证据推进走单点 `serves: FR-2`

**输入**：`evidence` 命中真实用户消息；产物已登记。
**期望**：`stamped` 含该产物路径；`advanced === true` 时状态推进；
`grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts` → **0 命中**。
**命令**：`npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts`
**边界**：传 `advance:false` → `advanced === false` 且无 `gate_failure` 噪声。

## TC-3 收尾两件事都做 `serves: FR-3`

**输入**：构造"停手位 = `awaiting-confirm:pc-x` + 推进"的场景，任一通道确认。
**期望**：

- `dive.driverHealth.state === 'healthy'`；
- `comments.jsonl` 出现 `[Dive 恢复] 等待结束`（`c-awaiting-exit-*`）且与 `c-awaiting-enter-*` 配对；
- `isDrivableRequirement(req) === true`。

**命令**：`npx vitest run tests/awaiting-clear-notice.test.ts tests/dive-confirm-advance.test.ts`
**反例**：停手位原因是 `wake-undeliverable` 时**不得**被收尾顺手清掉（INV-3）。

## TC-4 看板推进与窗口在线解耦 `serves: FR-4`

**输入**：`onlineAgent(windowKey)` 返回 `undefined`（窗口离线）。
**期望**：`advanced === true`、`delivered === false`，`note` 说明"已推进；窗口不在线未投递"；
`reqboard_status` 显示新阶段。
**命令**：`npx vitest run tests/artifact-confirm-board.test.ts`
**反例**：窗口离线且内容门也拦下时，`advanced === false`（门优先，不是窗口优先）。

## TC-5 门禁指路可执行 `serves: FR-5`

**输入**：裁定表条目无效（`影响 FR` 写成"全部"）触发的 `decision_entry_invalid`。
**期望**：`gate_failure.how` 含 `reqboard_ask_confirm`；**不含** `reqboard_move(requirement_id`。
**命令**：`npx vitest run tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts`；
静态：`grep -rn "reqboard_move(requirement_id" src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts` → 空。

## TC-6 四通道对拍 `serves: FR-6`

**输入**：同一台账初始态（同一产物、同一状态、同一 `from/to`），四条通道各跑一次（表驱动 `it.each`）。
**期望**：四元组 `{advanced, status, driverHealth.state, awaitingExit(0|1)}` **逐项相等**；
失败信息含通道名与缺失项。
**命令**：`npx vitest run tests/confirm-channel-parity.test.ts`

## TC-7 已落章未推进的补推进 `serves: FR-1, FR-5`

**输入**：章已落、状态未动；重新 `reqboard_ask_confirm(target=artifact, kind=…)`。
**期望**：不弹第二次框；`advanced === true`；状态推进。
**命令**：`npx vitest run tests/confirm-advance-deadlock.test.ts`（沿用其 TC-1/TC-6 口径）

## TC-8 并发重复确认幂等 `serves: FR-1`

**输入**：两条通道先后确认同一 `(需求, 门)`。
**期望**：只发生一次迁移；第二者 `advanced === false` 或幂等跳过；`artifacts[].confirmedAt` 不被覆写（首写即事实）。
**命令**：`npx vitest run tests/confirm-settle-preconditions.test.ts tests/artifact-group-confirm.test.ts`

## TC-9 收尾失败不回滚推进 `serves: FR-3`

**输入**：注入 `exitAwaitingConfirm` / `applyDiveTransition` 抛错的替身。
**期望**：`status` 已是新阶段；`finish.stopPositionCleared === false`；日志有 `warn`；函数**不抛**。
**命令**：`npx vitest run tests/confirm-advance-finish.test.ts`

## TC-10 零回归 `serves: FR-1, FR-2, FR-3, FR-4`

**输入**：既有全量用例。
**期望**：全绿；`pnpm typecheck` 退出码 0。
**命令**：`pnpm test && pnpm typecheck`

## 判据汇总（可跑） `serves: FR-6`

```bash
npx vitest run tests/artifact-confirm-board.test.ts tests/confirm-evidence.test.ts \
               tests/confirm-settle-preconditions.test.ts tests/confirm-advance-deadlock.test.ts \
               tests/awaiting-clear-notice.test.ts tests/dive-confirm-advance.test.ts \
               tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts \
               tests/confirm-channel-parity.test.ts tests/confirm-advance-finish.test.ts
grep -rn "transitionRequirement(" src/http/routers/requirements.ts src/application/use-cases/ConfirmArtifact.ts
grep -rn "reqboard_move(requirement_id" src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts
pnpm typecheck
```

期望：用例全绿、两条 grep 无输出、typecheck 退出码 0。
