---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 测试用例（REQ-261003222428-3556）

> 六个新测试文件 23 用例，全部可复跑；每个文件对应一张卡（t8 无新文件，做全量比对）。

## 用例总表 `serves: FR-1, FR-2, FR-3, FR-5, FR-6, FR-7`

| 文件 | 卡 | 用例数 | 抓住的形态 |
|---|---|---|---|
| `tests/advance-lock-heartbeat.test.ts` | t1 / FR-1 | 3 | 锁不假死（续租越过 stale 仍 locked）；心跳死不刷新；他人 runId 双不越权 |
| `tests/advance-parallel.test.ts` | t2 / FR-2 | 4 | 无冲突重叠并行；冲突对串行；未声明写集保守串行；组内一败暂停+成功保留+失败回滚 |
| `tests/plan-depends-e2e.test.ts` | t3 / FR-3 | 4 | 带 depends_on 落库逐环成链；漏传 doc↔tasks 警告点名；不误报；指纹回执+schema 同源 |
| `tests/dive-wake-liveness.test.ts` | t5 / FR-5 | 3 | 活窗口受理；死窗口 3 次后 paused 且不刷 lastWakeAt；边界两形态原因各异 |
| `tests/binding-trace.test.ts` | t6 / FR-6 | 5 | 改绑留痕三形态；同窗口幂等；静态断言（赋值唯一豁免）；agent 面无改绑工具 |
| `tests/artifact-group-confirm.test.ts` | t7 / FR-7 | 4 | 催办聚合 5→1；单份不成组；5 份一次全 confirmed+stamped；design 成组与首份语义零回归 |

## 反向演练（防线有效性证成） `serves: FR-3, FR-6`

| 演练 | 操作 | 实测 |
|---|---|---|
| 绑定静态断言 | window.ts 临时注入 `.sourceSessionId = 'x'` | ✅ binding-trace 红并点名 window.ts:192 → 还原绿 |
| 锁 stale 对照 | 心跳停 + 越过 stale | ✅ lockAt 停在原地（配合 stale-lock 既有用例 = 真死才接管） |
| 跨卡边界 | myWindow 严格大于边界 | ✅ 串行既有用例零改动转绿（concurrency-limits） |

## 回归口径 `serves: FR-4`

- 删除清偿：grep 四符号（StartSubtaskChain/backgroundRunner/CheckpointManager 外部调用/scheduleBatches）src/ 零命中。
- 全量：`pnpm test` 失败数 ≤ 基线 98（终态 97，且 execute-task.test.ts 旧红转绿）。
- tsc：归属本需求文件零错（总错误数较开工净减）。
