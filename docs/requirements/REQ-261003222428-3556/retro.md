# 复盘（REQ-261003222428-3556）

## 一句话

把实施链从「名义能力」拉回「实际行为」：锁不再假死、并发额度真的兑现、
计划依赖不再静默丢失、仓里回到一代实现、三条登记已久的缺口逐条关闭。

## 重大结构决策（本次改动改变了什么「机制」）

| # | 决策 | 理由 | 落地位置 |
|---|---|---|---|
| D1 | 推进锁从**死租约**改**在跑续租**（30s 心跳 + `runId` 守卫） | 单卡实测跑过 15min stale 阈值 → 二次投递收锁 → 同需求双链并跑（P0） | `AdvanceChain.startLockHeartbeat`；`driveChain` finally 归属守卫 |
| D2 | 批内执行从**串行**改**写集分组并行**，且**未声明写集保守串行** | 注释声称并行、代码串行，`maxParallelParents=10` 从未兑现；但真并行需要冲突依据，存量卡写集全空 ⇒ 默认必须 ≡ 旧行为 | `internal/advance-parallel.ts`（自 batch-scheduler 移植）+ driveChain 批内分层 |
| D3 | 跨卡覆盖防线引入 **myWindow 解释**（严格大于开工时刻的落盘归「我自己写的」） | 真并行下该防线必然误伤（我的落盘 mtime 落在并行对方窗口内）——不改则并行永远被挡死 | `internal/cross-card.ts` |
| D4 | 绑定改写收编**唯一留痕入口** `applyRebind` + 静态断言守写入点 | 绑定曾被静默改写且零留痕（N-2）；仓外直写防不住，但仓内不许绕 | `internal/binding-write.ts` + 看板 `req/rebind` 路由 |
| D5 | 成组确认与催办聚合收敛**单一事实源** `GROUP_CONFIRM_KINDS` | 高频产物一次交付积 39 份待确认，人点 39 次（N-3） | `internal/artifact-gates.ts` |
| D6 | 死代码清偿：旧代链实现（StartSubtaskChain/background-runner/batch-scheduler）删除 | 两代实现并存，写集逻辑活在死代码里 | 删除 + 逻辑移植进现役 |
| D7 | 构建指纹 `plugin_build` 进 status 回执 | 陈旧构建曾两次让「已修缺陷」表现为线上事故 | `shared/build-stamp.ts` + apply() 盖章 |

架构说明同步去向：`docs/architecture/automation-chain-contract.md`（§5 摘牌 + 关闭方式 + 判据）与
`docs/architecture/project-manual.md`（变更记录）。

## 重大定性修正（本次最值得记的一条）

「depends_on 落库丢失」初判为系统缺陷并做了完整排查（normalizePlanTasks 复现、报文回读），
结论是 **agent 两次提交计划时漏传字段**——链路本身正确，工具如实接收了空依赖。
真缺口是「文档依赖表 ↔ tasks 数组」无一致性防线。修正已写进需求文档漂移点 3，
并补了 `dependency_warnings` 警告 + 端到端成链用例。

**教训**：把症状写成机制结论之前，先回读自己的输入**原文**。

## 方法论收获

- **反向演练是防线的一部分**：本需求两处静态断言（绑定写入点、锁心跳语义）都用
  「临时注入缺陷 → 红并点名 → 还原绿」证成，而不是只写正向用例。
- **保守默认才敢开并行**：「未声明写集 = 独占串行」让 FR-2 上线时对存量需求零行为变化。
- **偏离要当场声明**：三处偏离（心跳起停位置 / 跨卡 myWindow / wake 签名）均在卡面复核段声明，
  避免了「静默改设计」。

## 外部干扰记录

本需求实施期间有并行窗口在同仓改动（StageKind 扩段、confirm-settle 启链、capture 契约），
期间出现过 3 处外部红（card-types / auto-chain-approval / apply-wiring），全部归属在案并多数自愈；
本需求自身的失败数始终 ≤ 基线。
