# 评审报告（REQ-261003222428-3556）

> 复核通道：各卡复核子卡逐条核对设计（t-26d8eb / t-ed2cec / t-dff3c4 / t-931e8f / t-177514 / t-765eab / t-903b73 / t-3f376f），本报告是总核。

## 结论

**通过**。七功能点全部落地且判据可复跑；行为不变式六条成立；三处偏离均已声明且有意图等价论证。

## 八卡核对 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 卡 | 判据 | 状态 | 证据 |
|---|---|---|---|
| t1 锁续租 | 假时钟三用例 | ✅ | tests/advance-lock-heartbeat.test.ts |
| t2 真并行 | 重叠/串行/失败语义四用例 + advance-select 零改动 | ✅ | tests/advance-parallel.test.ts |
| t3 依赖防线+指纹 | 成链 e2e + 一致性警告 + plugin_build schema 同源 | ✅ | tests/plan-depends-e2e.test.ts |
| t4 死代码清偿 | grep 零命中 + 基线逐文件一致 | ✅ | diff exit 0（98=98 时点） |
| t5 wake 活性 | 死窗口 paused 不刷 lastWakeAt + dive 26 回归 | ✅ | tests/dive-wake-liveness.test.ts |
| t6 绑定留痕 | 留痕/幂等/静态断言反向演练/无改绑工具 | ✅ | tests/binding-trace.test.ts |
| t7 催办聚合 | 聚合 5→1 + 5 份一次全 confirmed + design 零回归 | ✅ | tests/artifact-group-confirm.test.ts |
| t8 收口 | 全量 ≤ 基线 + 摘牌 + 变更记录 | ✅ | 97≤98；automation-chain-contract §5 |

## 偏离总账（三处，均已声明）

| 处 | 设计原文 | 实现 | 等价论证 |
|---|---|---|---|
| t1 | 「driveChain finally 先停心跳再清锁」 | 心跳起停在 run 包装外层 | runId 守卫使两序等价（注释在案） |
| t2 | 「跨卡防线不动」 | myWindow 排除（严格大于边界） | 真并行下不动则并行必被误伤；串行语义逐字保留（既有用例零改动绿） |
| t5 | 「wake 端口返回值改为含受理与否+原因」 | 保持 boolean，原因走诊断日志 | 避免心跳签名级联；受理与否=返回值、原因=日志，意图完整 |

## 定性修正（一处，重大）

「depends_on 落库丢失」初判为系统缺陷，经 tsx 复现 + 报文回读证实为 **agent 两次漏传字段**；
真缺口是提交侧无 doc↔tasks 一致性防线。需求文档漂移点 3 已改写留痕，防线（dependency_warnings）
与端到端看守（plan-depends-e2e）已落地。

## 顺手修复声明（同类缺陷，非夹带）

- driveChain finally 清锁 runId 守卫（t1 同类：锁归属）。
- execute-task.test.ts 旧红转绿（t2 接触面修复的净效果）。

## 边界核对

- 未碰并行窗口在制文件（capture-section / RESPONSE_SOURCES / StageKind 扩段）；
  期间出现的外部红（card-types、auto-chain-approval）均归属在案且多数已自愈。
- 行为不变式六条（t8 复核段逐条核验）成立。
