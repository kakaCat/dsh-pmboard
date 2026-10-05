# 测试证据（REQ-261003222428-3556）

> 全部命令在工作区根 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 执行，时点 2026-10-04。

## 0. 任务覆盖对照

| 任务 | covers | 证据节 |
|---|---|---|
| t-b0a546 锁续租（父） | covers: t-b0a546 | §1 |
| t-307661 研发 | covers: t-307661 | §1 |
| t-45b50b 联调 | covers: t-45b50b | §1 |
| t-26d8eb 复核 | covers: t-26d8eb | §1 |
| t-aab87d 测试 | covers: t-aab87d | §1 §7 |
| t-9084a6 真并行（父） | covers: t-9084a6 | §2 |
| t-fb1ed6 研发 | covers: t-fb1ed6 | §2 |
| t-1c86df 联调 | covers: t-1c86df | §2 |
| t-ed2cec 复核 | covers: t-ed2cec | §2 |
| t-58eede 测试 | covers: t-58eede | §2 §7 |
| t-ee86f6 依赖防线+指纹（父） | covers: t-ee86f6 | §3 |
| t-b875fa 研发 | covers: t-b875fa | §3 |
| t-dff3c4 复核 | covers: t-dff3c4 | §3 |
| t-76faba 测试 | covers: t-76faba | §3 §7 |
| t-bdc766 死代码清偿（父） | covers: t-bdc766 | §4 |
| t-3c090e 研发 | covers: t-3c090e | §4 |
| t-0d1d00 联调 | covers: t-0d1d00 | §4 |
| t-931e8f 复核 | covers: t-931e8f | §4 |
| t-f94bde 测试 | covers: t-f94bde | §4 §7 |
| t-ee6da8 wake 活性（父） | covers: t-ee6da8 | §5 |
| t-d52139 研发 | covers: t-d52139 | §5 |
| t-e32a83 联调 | covers: t-e32a83 | §5 |
| t-177514 复核 | covers: t-177514 | §5 |
| t-498033 测试 | covers: t-498033 | §5 §7 |
| t-d47938 绑定留痕（父） | covers: t-d47938 | §6 |
| t-9db35a 研发 | covers: t-9db35a | §6 |
| t-d4a122 联调 | covers: t-d4a122 | §6 |
| t-765eab 复核 | covers: t-765eab | §6 |
| t-0d7d5d 测试 | covers: t-0d7d5d | §6 §7 |
| t-188b05 催办聚合（父） | covers: t-188b05 | §8 |
| t-0ee5d2 研发 | covers: t-0ee5d2 | §8 |
| t-94661d 联调 | covers: t-94661d | §8 |
| t-903b73 复核 | covers: t-903b73 | §8 |
| t-d3b93c 测试 | covers: t-d3b93c | §8 §7 |
| t-ca7708 收口（父） | covers: t-ca7708 | §7 §9 |
| t-544e5f 研发 | covers: t-544e5f | §9 |
| t-3f376f 复核 | covers: t-3f376f | §9 |
| t-926ad1 测试 | covers: t-926ad1 | §7 |

## 1. t1 锁续租（FR-1）

```
$ npx vitest run tests/advance-lock-heartbeat.test.ts
 ✓ 3 tests：心跳续租越过 stale 仍 locked / 心跳死 lockAt 停原地 / 他人 runId 双不越权
$ npx vitest run tests/advance-chain.test.ts tests/advance-stale-lock.test.ts …（advance 一族）
 29 passed（零回归）
```

## 2. t2 批内真并行（FR-2）

```
$ npx vitest run tests/advance-parallel.test.ts
 ✓ 4 tests：无冲突重叠（两 start 先于任何 end）/ 冲突对串行 / 未声明写集串行 /
   组内一败→暂停+成功保留+失败回滚（history 同批共享 batchId）
$ npx vitest run tests/concurrency-limits.test.ts
 跨卡既有用例零改动转绿（myWindow 严格大于边界）
```

## 3. t3 依赖防线+指纹（FR-3）

```
$ npx vitest run tests/plan-depends-e2e.test.ts
 ✓ 4 tests：带 depends_on 落库逐环成链（真实 id）/ 漏传警告点名 t2 /
   带依赖与无表格不误报 / plugin_build 回执+schema 同源
```

## 4. t4 死代码清偿（FR-4）

```
$ grep -rn "StartSubtaskChain\|backgroundRunner\|CheckpointManager\|scheduleBatches" src/ | wc -l
 0（仅注释中的清偿记录，生产零引用）
$ pnpm test（删除后）
 98 failed = 基线，失败清单与基线逐文件 diff exit 0
```

## 5. t5 wake 活性（FR-5 / N-1）

```
$ npx vitest run tests/dive-wake-liveness.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts
 29 passed（死窗口 3 次后 paused 且 lastWakeAt 不刷新；活窗口逐字不变）
```

## 6. t6 绑定留痕（FR-6 / N-2）

```
$ npx vitest run tests/binding-trace.test.ts
 ✓ 5 tests：留痕三形态 / 同窗口幂等 / 静态断言 / agent 面无改绑工具 / 路由存在
反向演练：window.ts 注入 `.sourceSessionId = 'x'` → 静态断言红并点名 window.ts:192 → 还原绿
```

## 7. 全量回归（终态）

```
$ pnpm test
 Test Files  47 failed | 300 passed | 3 skipped (350)
 Tests  97 failed | 3523 passed | 20 skipped (3640)
失败清单与基线 diff：唯一变化 = tests/execute-task.test.ts 由红转绿（净改善），零新增失败
$ npx tsc --noEmit | grep -c "error TS"
 144（较本需求开工时 150 净减 6；归属本需求文件 0）
```

## 8. t7 催办聚合（FR-7 / N-3）

```
$ npx vitest run tests/artifact-group-confirm.test.ts
 ✓ 4 tests：聚合 5→1 / 单份不成组 / 5 份一次全 confirmed+stamped / design 成组与首份语义零回归
$ npx vitest run tests/artifact-gates.test.ts tests/pending-confirm-ttl.test.ts
 零回归
```

## 9. 契约文档摘牌（t8）

`docs/architecture/automation-chain-contract.md` §5：N-1/N-2/N-3 三条「已关闭」标注 + 关闭方式 + 判据命令；
`docs/architecture/project-manual.md` 变更记录补行。本文件 §0-§8 即全部判据的可复跑证据。
