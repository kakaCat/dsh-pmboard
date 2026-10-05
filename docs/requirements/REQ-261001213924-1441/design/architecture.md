# REQ-261001213924-1441 架构设计 · 唤醒链的活性、可恢复性与可观测性 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 范围：**不动** round driver 的预留/准入/并发栅栏纪律，**不动**五道人工门的强度。
> 本设计改两件事：①驱动赖以存活的外部条件（事件能不能收到、丢了怎么办）；②状态语义（谁在什么条件下算该跑/能跑/为什么停）。

## TL;DR serves: FR-1, FR-2, FR-3, FR-5

```
现状（四处独立断点，症状相同：静默停摆）
  人工门确认 → requirement-moved ─┐
                                  ├─►（唯一驱动点）agent/status idle ← 订阅无归属、收没收到观测不到（缺陷③）
  闸门链 H1..H5（H4=skip）────────┘
                                  └─► drive()
                                        ├─ roundsInStage ≥ 阶段上限 → terminalBlock → phase=paused → 永久不可驱动（缺陷④）
                                        └─ 失败 → disarm → activation=disarmed（终态，改写人的意图）（缺陷⑤）

修后（三通道互补 + 两套状态 + 上限可恢复）
  人工门确认 → 推进（roundsInStage 归零）→ requirement-moved
       ├─[推] 立即试投一次（不等空闲拍）
       ├─[拍] agent.ctx 上的 agent/status=idle（订阅归该 agent；[WAKE-RX] 可证收到）
       └─[心跳] 对账器：armed+healthy+超时未动 → 兜底直投 / 连续失败 → 响亮告警
  失败 → driverHealth.paused（不改 activation）；达上限 → 同上（人一动即恢复）
```

## 组件与职责 serves: FR-3, FR-4, FR-5

| 组件 | 文件 | 现状 | 本次动作 |
|------|------|------|----------|
| 状态语义 | src/shared/protocol.ts (DiveState) | activation/phase 混用策略与健康 | 收敛为 activation（人的意图）+ driverHealth（运行时）；phase 读侧兼容一版 |
| 回合计数 | src/application/internal/token-usage.ts (transitionRequirement) + round-driver | 计数器全生命周期累加 | 阶段推进时 roundsInStage=0；上限只对当前阶段生效 |
| 上限处置 | src/application/dive/round-driver.ts (terminalBlock) | 置 phase=paused（终态） | 改置 driverHealth={state:paused,reason}；人确认/继续/阶段切换即恢复 |
| 订阅装配 | src/application/dive/ReqboardDiveManager.ts、round-subscriptions.ts | agent 事件挂插件 ctx | 新增 agent/created → 在 agent.ctx 注册；按 agent 管理 disposer |
| 心跳对账 | 新增 src/application/dive/wake-reconciler.ts | 无 | 周期 + 启动扫描；兜底直投 + 连续失败告警 |
| 载荷解析 | src/application/internal/interruption.ts | 两个读取者宽窄不一 | turnEndOutcome 作为唯一解析器，round-driver 改用 |
| 诊断 | src/application/internal/diag-log.ts 的使用面 | 仅采集侧 NODE-1..5 | 扩展到唤醒链各早退分支（前缀 [dive-diag]） |
| 兜底投递 | src/adapters/AgentDeliverer.ts (deliverMessage) | 仅回合驱动用 | 心跳对账复用同一投递端口（不新增通道实现） |

## 状态模型收敛（本次最大的一处改动） serves: FR-5

```ts
// 修前：四套开关，互不同步
dive.activation: armed | disarmed        // 混用：人的意图 + 运行时失败
dive.phase:      active | idle | paused // 混用：手动模式 + 终态暂停
autoRun:         boolean                 // 自动链开关（与上面两者无关）
advance.pausedReason?: string            // 自动链熔断原因（第三套）

// 修后：两套，职责单一
dive.activation: armed | disarmed        // 只有人能改（立项=armed；clear_pause=disarmed）
dive.driverHealth: { state: healthy | paused; reason?; since?; attempts? }
                                          // 只有运行时能改；任何故障都不再覆盖 activation
```

迁移矩阵（一次性，读侧兼容一版）：

| 修前 | 修后 | 理由 |
|------|------|------|
| disarmed + phase=active | activation=armed，health=healthy | 误停摆：运行时故障改写了人的意图，恢复它 |
| disarmed + phase=idle | activation=disarmed | 人主动 clear_pause，**不动** |
| phase=paused（round-limit/aborted） | activation 不变，health={paused,reason} | 终态降级为可恢复的"停下等人" |
| phase=active | health=healthy | 常态 |
| roundsInStage>0 | 归零 | 语义修正为"本阶段" |

## 数据流：一次人工门确认（修后） serves: FR-1, FR-2, FR-3, FR-4

```
人点确认（弹框 / 看板）
  → 落章 + transitionRequirement（跨阶段：roundsInStage=0、health.attempts=0）        ← FR-1
  → requirement-moved 事件
      ├─[推] onRequirementMoved：置 requested 并立即试投一次                          ← FR-3
      ├─[拍] agent.ctx 上收到 agent/status=idle → requestDrive（订阅归该 agent + [WAKE-RX] 接收证明）← FR-3
      └─[心跳] wake-reconciler：armed+healthy+超时未动 → 兜底直投 / 连续失败即告警   ← FR-4
  → drive() → createRoundMessage → deliverMessage → agent.followup
      ├─ 成功 → roundsInStage=round、lastWakeAt=now、health.attempts=0
      └─ 失败 → health={paused, reason, attempts+1}（不改 activation）+ 台账 comment   ← FR-2/FR-5
```

## 订阅装配（归属修正） serves: FR-3

```
修前：插件 ctx ──on(agent/status|pre-step|inbox/*|error|disposed)──► 订阅无归属：agent 处置后仍留在插件上

修后：插件 ctx ──on(agent/created)──► 取到 agent.ctx
        └─► agent.ctx.on(agent/status|pre-step|inbox/*|error|disposed)  ← 归属该 agent，处置即注销
     插件 ctx ──on(reqboard/requirement-moved)──► 保持不变（自发事件）
     agent/disposed 或插件卸载 → 按 agent 注销全部 disposer（Map<agentId, () => void>）
```

- 依据：宿主插件规范 cordis-plugin-development/references/practices.md:19 —— per-agent 行为注册到 `agent.ctx`，**理由是生命周期归属**：agent 处置即移除；卸载插件不会自动移除 agent.ctx 上的注册，故本插件自己保留登记（keyed by agent）。
- **前提更正（2026-10-01 复核，经人裁决保留实现）**：本节最初登记为「agent/* 事件被 scope 过滤器丢弃」，核查宿主机源码后**未获支持**，故理由改为归属与可观测：
  ① `scopeTarget` 的过滤器对**未打标签**的 ctx 一律放行（packages/core/scope/src/index.ts:171-176）；
  ② 本插件以普通 loader 条目装载、ctx 未打标签（~/.dsh/profiles/web/cordis.patch.yml 无 isolate/scope）；
  ③ 宿主自带 goal-round-driver 同样把 `agent/status` 挂在插件 ctx 上且生产可用（packages/goal/goal-round-driver/src/index.ts:245,269）。
  真正被生产证据证实的病因是**回合计数不归零（达上限后永久 paused）**与**运行时故障改写 activation**，见 FR-1/FR-2/FR-5。
- **订阅未成立必须响亮**：拿不到 agent.ctx / ctx.on 返回非函数 → warn + 诊断行 + 台账 comment，不得静默降级（修前只留一行 info）。
- **[WAKE-RX] 接收证明（新增）**：收到 `agent/status` 即写一条诊断。这样下一次「没被唤醒」能在日志里分开两种病：有 RX 无后续 = 事件到了、驱动侧断；一条 RX 都没有 = 事件没到。

## 心跳对账器（新增） serves: FR-4

| 项 | 设计 |
|----|------|
| 触发 | 启动时一次 + 每隔 WAKE_RECONCILE_MS（默认 30s，可配） |
| 判据 | activation=armed 且 driverHealth.state=healthy 且 status 属于需 agent 继续的阶段 且 now - lastWakeAt > WAKE_STALE_MS（默认 120s）且无活跃 run |
| 动作 | 复用 createRoundMessage + deliverMessage 直投一次（即直投兜底），成功则更新 lastWakeAt；投不出则 attempts+1 |
| 到顶 | attempts ≥ 3 → driverHealth={paused, reason:wake-undeliverable} + 台账 comment + 看板可见 |
| 生命周期 | 定时器 unref()，随插件 disposer 清理；只读台账，不打断在飞回合 |
| 为什么不是"再挂一个事件" | 对账器**不依赖任何事件**，才能兜住"事件收不到"这一类故障 |

## 为什么不改 round driver 本体 serves: FR-1, FR-2

- 预留 / 准入 / 并发栅栏（roundReservationValid）的纪律是对的：它保证"消息真的进了 history 才计数"，是防重复与防伪造的正确做法；本次只改它**读的状态**（健康位、阶段计数）与**订阅位置**。
- 上限本身要保留（防无人值守烧 token），改的只是"达上限之后的语义"：从"永久不可驱动"改为"停下等人、人一动即恢复"。

## 风险与边界 serves: FR-2, FR-5

| 风险 | 评估 | 处置 |
|------|------|------|
| phase 下线影响既有读点 | 读点散布 round-state / session-driver / 看板投影 | 读侧保留一版兼容（无 driverHealth 时按旧 phase 推导），写侧只写新字段 |
| 心跳兜底与回合驱动重复投递 | 两者都走 deliverMessage，可能同时触发 | 对账器与 drive() 共用同一预留登记，准入去重仍由 roundReservationValid 兜住 |
| 上限放宽后烧 token | 阶段切换才自动恢复；同阶段内恢复需人动作 | 保留 maxRounds 且对账器只兜"该唤醒未唤醒"，不替代上限 |
| 存量 5 条 disarmed 一次性恢复 | 其中可能确有人主动关的 | 迁移按 phase 区分（idle=人的意图，不动），并逐条留痕 |
