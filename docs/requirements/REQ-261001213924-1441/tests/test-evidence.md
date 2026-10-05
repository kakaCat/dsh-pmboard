---
title: REQ-261001213924-1441 测试证据
type: test-evidence
requirement: REQ-261001213924-1441
created: 2026-10-02
---

# 测试证据 · 唤醒链

## 1. 本需求新增/更新的用例

| 文件 | 用例数 | 覆盖 |
|------|--------|------|
| `tests/dive-round-state.test.ts` | 18 | FR-5 真值表（activation + driverHealth；旧记录按 phase 兼容）、可逆性 |
| `tests/dive-round-driver.test.ts` | 23 | FR-1 跨阶段归零、FR-2 达上限停下等人、FR-6 四种 turn/end 形态一套口径 |
| `tests/dive-rearm.test.ts` | 17 | FR-2/FR-4 恢复（含还额度）、心跳兜底（tick / 连续 3 次失败 / 幂等跳过） |
| `tests/dive-wake-wiring.test.ts` | 10 | FR-3 注册在 agent.ctx、disposed 注销、负例 warn+诊断+comment 三者齐备、[WAKE-RX] |
| `tests/dive-wake-e2e.test.ts` | 5 | FR-7 端到端闸门（该跑就跑 → 停 → 被叫回 → 重启不动 → 计数归零） |
| `tests/dive-migration.test.ts` | 7 | FR-8 迁移矩阵 6 行 + 幂等零写入 + 不改人的意图 |
| `tests/dive-manager-wiring.test.ts` | 6 | 订阅分组后的接线（root 2 + per-agent 6，走真实 agent/created 入口） |
| `tests/dive-manager-alignment.test.ts` | 13 | 对齐验收更新到新契约（健康位而非终态） |

## 2. 可复核命令与结果

```
$ pnpm build
✔ Build complete in 808ms
[verify-client] OK  bundle=333950 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整

$ npx vitest run tests/dive-wake-e2e.test.ts
✓ 5 passed

$ npx vitest run tests/dive-round-state.test.ts tests/dive-round-driver.test.ts tests/dive-rearm.test.ts
✓ 18 + 23 + 17 passed

$ npx vitest run tests/dive-wake-wiring.test.ts tests/dive-migration.test.ts
✓ 10 + 7 passed

$ npx vitest run
Test Files  49 failed | 249 passed | 3 skipped (301)
     Tests  98 failed | 2974 passed | 20 skipped (3092)
```

## 3. 端到端闸门（修前必红）

`tests/dive-wake-e2e.test.ts` 断言的五步在修前恰好全是坏的，故它对旧代码必红：

1. 投递器三参构造错位 / round 端口缺 `delivery` → `drive()` 第一步就抛（该卡之前是 REQ-261001201200-8f8b 的修复面）；
2. 达上限写 `phase=paused`（终态）→ 人确认推进也回不来；
3. 恢复不还额度 → 人点继续后下一拍又立刻撞上限（**本次实测发现并修掉**）；
4. `teardown` 改写 `activation` → 每次重启把所有需求打成手动模式；
5. 回合计数从不归零 → 撞上阶段局部上限就永久停。

## 4. 存量迁移的验证方式

- 6 行矩阵逐行断言（含最老的「连 `dive` 字段都没有」的记录）；
- 幂等：第二次 `migrateDiveState` 后与第一次结果**逐字节相同**（`migrated === 0`）；
- 负例：`disarmed + idle`（人主动暂停）全流程 `activation` 不变、零 comment、不 bump version。

## 5. 任务覆盖对照（covers）

每张任务卡（含子卡段）对应的可运行用例：

- covers: t-7a9e10 · tests/dive-round-state.test.ts（FR-5 真值表：activation + driverHealth）
- covers: t-120a5e · tests/dive-round-state.test.ts（同上，dev 段）
- covers: t-5e5845 · tests/dive-round-state.test.ts（同上，integrate 段）
- covers: t-d75509 · tests/dive-round-state.test.ts（同上，review 段）
- covers: t-35f9b5 · tests/dive-round-state.test.ts（同上，test 段）
- covers: t-dd205a · tests/dive-round-driver.test.ts（FR-1 跨阶段归零）
- covers: t-d2a647 · tests/dive-round-driver.test.ts（同上，dev 段）
- covers: t-0708e0 · tests/dive-round-driver.test.ts（同上，integrate 段）
- covers: t-bf99c7 · tests/dive-round-driver.test.ts（同上，review 段）
- covers: t-7231bf · tests/dive-round-driver.test.ts（同上，test 段）
- covers: t-d5a14d · tests/dive-round-driver.test.ts + tests/dive-rearm.test.ts（FR-2 达上限停下等人与恢复）
- covers: t-a5aff0 · tests/dive-round-driver.test.ts（同上，dev 段）
- covers: t-82a7f1 · tests/dive-rearm.test.ts（同上，integrate 段）
- covers: t-8af611 · tests/dive-rearm.test.ts（同上，review 段）
- covers: t-168f59 · tests/dive-rearm.test.ts（同上，test 段）
- covers: t-b67d56 · tests/dive-wake-wiring.test.ts（FR-3 注册在 agent.ctx / disposed 注销 / 负例三件套）
- covers: t-d2bc95 · tests/dive-wake-wiring.test.ts（同上，dev 段）
- covers: t-cc716c · tests/dive-wake-wiring.test.ts（同上，integrate 段）
- covers: t-df1ad9 · tests/dive-wake-wiring.test.ts（同上，review 段）
- covers: t-438162 · tests/dive-wake-wiring.test.ts（同上，test 段）
- covers: t-39d8aa · tests/dive-rearm.test.ts（FR-4 心跳：tick / 连续 3 次失败 / 幂等跳过）
- covers: t-8d83fa · tests/dive-rearm.test.ts（同上，dev 段）
- covers: t-99baa7 · tests/dive-rearm.test.ts（同上，integrate 段）
- covers: t-cf9e46 · tests/dive-rearm.test.ts（同上，review 段）
- covers: t-b2f032 · tests/dive-rearm.test.ts（同上，test 段）
- covers: t-9314c7 · tests/dive-round-driver.test.ts（FR-6 四种 turn/end 形态一套口径）
- covers: t-8724cc · tests/dive-round-driver.test.ts（同上，dev 段）
- covers: t-fbfb6d · tests/dive-round-driver.test.ts（同上，integrate 段）
- covers: t-f235aa · tests/dive-round-driver.test.ts（同上，review 段）
- covers: t-bb5dc4 · tests/dive-round-driver.test.ts（同上，test 段）
- covers: t-2c9ba9 · tests/dive-wake-e2e.test.ts（FR-7 端到端闸门五步）
- covers: t-232e9b · tests/dive-wake-e2e.test.ts（同上，dev 段）
- covers: t-8880ec · tests/dive-wake-e2e.test.ts（同上，review 段）
- covers: t-132309 · tests/dive-wake-e2e.test.ts（同上，test 段）
- covers: t-703429 · tests/dive-migration.test.ts（FR-8 迁移矩阵 + 幂等）
- covers: t-b80aa4 · tests/dive-migration.test.ts（同上，dev 段）
- covers: t-d57ede · tests/dive-migration.test.ts（同上，integrate 段）
- covers: t-3427d0 · tests/dive-migration.test.ts（同上，review 段）
- covers: t-a9f90e · tests/dive-migration.test.ts（同上，test 段）
