# REQ-261001213924-1441 数据模型设计 · dive 状态收敛、阶段计数与存量迁移 serves: FR-1, FR-2, FR-4, FR-5

> 本需求**给台账加字段**（driverHealth / lastWakeAt），并**修正一个既有字段的语义**（roundsInStage）。
> 因此必须写清迁移矩阵、不变量与回滚。

## DiveState 字段矩阵（修前 → 修后） serves: FR-5

| 字段 | 修前语义 | 修后语义 | 写入者 |
|------|----------|----------|--------|
| activation | 人的意图 + 运行时失败（disarm 会改写） | **只有人的意图** | 人（立项 / clear_pause） |
| phase | 手动模式(idle) + 终态暂停(paused) + 常态(active) | **读侧兼容字段**，由 activation + driverHealth 推导 | 不再由写路径直接写 |
| driverHealth | （不存在） | **运行时健康**：state/reason/since/attempts | 驱动侧（round-driver / wake-reconciler） |
| roundsInStage | 生命周期计数（从不归零） | **当前阶段**计数（跨阶段归零） | transitionRequirement（归零）、准入（自增） |
| lastWakeAt | （不存在） | 最近一次成功唤醒时间 | 投递成功 / 准入成功 |

## roundsInStage 的语义修正 serves: FR-1

+ 归零时机：transitionRequirement 内，仅当 status 变化（from !== to）；
+ 自增时机：准入（消息真的进入 history 才计数，既有纪律不变）；
+ 上限判定：`roundsInStage >= roundLimitFor(当前 status)`，因此上限**只在当前阶段**生效；
+ 不变量：`roundsInStage <= roundLimitFor(status)`——修前该不变量在跨阶段后被破坏（计数带着上一阶段的累积量进入新阶段）。

## 迁移矩阵（一次性，可回滚） serves: FR-2, FR-5

| 存量形态 | 迁移后 | 判定依据 |
|----------|--------|----------|
| activation=disarmed 且 phase=active | activation=armed，driverHealth=healthy | 误停摆（运行时故障改写人的意图） |
| activation=disarmed 且 phase=idle | activation=disarmed（不动） | 人主动 clear_pause（人的意图） |
| phase=paused（reason 为 round-limit / aborted / max-tokens） | activation 不变；driverHealth={state:paused, reason:原原因} | 终态降级为可恢复态 |
| activation=armed 且 phase=active（无 health） | driverHealth=healthy | 常态 |
| roundsInStage > 0 | 归零 | 语义修正 |
| 无 dive 字段（历史记录） | 补 dive：按现状推导；不猜测执行意图 | 存量兼容 |
| 任一形态（迁移过程） | 盖 `dive.migratedAt` 印章 | 幂等：旧记录与新记录形态可能相同（都是 armed+active），只有显式印章才能保证「第二次零写入」；本字段为实施期补充（原设计只列 driverHealth/lastWakeAt），**不 bump version**，避免让在飞回合的预留因 revision 比对而失效 |

+ **迁移方式**：启动对账（既有 R0/R2 通道）内做一次幂等迁移；每条写入一条 comment 留痕（人可复核）；
+ **不做批量猜测**：无法判定人意图的（phase 缺失）一律保守留在 disarmed，由人在看板/会话显式恢复；
+ **可回滚**：迁移只新增 driverHealth/lastWakeAt 与改 activation/roundsInStage；回滚 = 按 migration comment 反向恢复（旧代码忽略未知字段，因此不回滚也不致命）。

## 不变量（写进测试） serves: FR-1, FR-2, FR-4, FR-5

1. **运行时模块不得写 activation**（静态断言 + 单测：只有 createRequirementDirect / ClearPause 出现该赋值）；
2. **driverHealth.state=paused 时 activation 保持原值**；
3. **roundsInStage 只在当前阶段内递增**，跨阶段必为 0；
4. **lastWakeAt 只增不减**，且与 roundsInStage 同源更新（成功唤醒的两种表现）；
5. **attempts 成功即归零**（避免历史失败累计把健康正常的需求推进 paused）。

## 与 advance / autoRun 的边界 serves: FR-5

> 收敛顺序：本需求先把 **Dive 自身**收成两套（activation / driverHealth），并把 advance.pausedReason 与 autoRun 的**归属**在数据模型上写清；两者的字段合并若牵动看板与推进链，另立需求（避免把数据模型改动做得过大）。

| 字段 | 本需求处置 |
|------|-----------|
| autoRun | 保留；语义明确为"自动链开关（任务侧）"，与 activation 无同步关系，**不得**用它表示人的意图或运行时健康 |
| advance.pausedReason | 保留；语义明确为"推进链的熔断原因"，看板展示时与 driverHealth.reason **分区呈现**（两类暂停不再混为一谈） |

## 回滚 serves: FR-5

+ 字段：driverHealth / lastWakeAt 为新增，旧代码忽略即可，无需回滚；
+ 语义：roundsInStage 归零不可逆（信息已丢），但**不影响正确性**（上限只对未来生效）；
+ 行为：还原订阅装配与心跳对账即回到修前行为（含静默停摆——因此回滚前须确认新实现确实有故障）。
