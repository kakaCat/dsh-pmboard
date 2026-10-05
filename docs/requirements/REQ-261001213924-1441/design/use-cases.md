# REQ-261001213924-1441 用例设计 · 六条主线场景 serves: FR-1, FR-2, FR-3, FR-4, FR-5

## UC-1 人工门确认后自动续跑（主场景） serves: FR-1, FR-3, FR-7

+ **角色**：会话用户；**前置**：需求 armed+healthy，某阶段产物待确认。
+ **主流程**：点确认 → 落章 + 推进（跨阶段则计数归零）→ requirement-moved → **推**（立即试投）/ **拍**（agent.ctx 收到 idle）任一成功 → 会话收到 source.kind=dive 的回合消息 → agent 继续本阶段工作。
+ **可证伪**：确认后**不发任何消息**，台账 `roundsInStage` 增长、`lastWakeAt` 更新、`activation` 保持 armed。

## UC-2 看板推进同样唤醒 serves: FR-3

+ **主流程**：看板点推进 → HTTP 路由落库 → 同一 requirement-moved 事件 → 同上。
+ **差别**：此路径下 agent 本来就 idle，**拍**通道应直接成立（也是"agent 忙不是主因"的判别用例）。

## UC-3 事件收不到时心跳兜底 serves: FR-4

+ **前置**：需求 armed+healthy，某次 requirement-moved 的推与拍都未生效（事件被过滤/丢失）。
+ **主流程**：wake-reconciler 在 staleMs 后发现"该唤醒而未动" → **直接投递一次**（复用同一投递端口）→ 起轮成功；台账留一条 `[Dive 心跳兜底]` comment。
+ **可证伪**：人为屏蔽事件通道（测试内）后，`tick()` 返回 `woken=[REQ]`，且会话收到 dive 消息。

## UC-4 达上限后可恢复 serves: FR-2

+ **主流程**：当前阶段达 maxRounds → `driverHealth={paused, reason:round-limit:<stage>}`，activation 不变，comment 给出恢复路径 → 人确认推进（阶段切换自动恢复）或点「继续」（同阶段恢复）→ 重新可驱动。
+ **可证伪**：构造达上限需求 → 断言其可被恢复且恢复后能再起轮（修前必须 `clear_pause` 才能解锁）。

## UC-5 运行时失败不再改写人的意图 serves: FR-5

+ **主流程**：投递异常 / 检查点失败 / agent 错误 → `driverHealth={paused, reason:<结构化原因>, attempts+1}` + 台账 comment；`activation` **保持 armed**；下一拍或人一动即重试（有界）。
+ **可证伪**：制造一次投递失败 → 断言 activation 未变、health.reason 正确、comment 存在。

## UC-6 人的主动暂停仍不被覆盖（负例） serves: FR-5

+ **主流程**：人 `reqboard_clear_pause` → activation=disarmed；此后任何自动动作（含心跳对账）**不得**把它改回 armed。
+ **可证伪**：对 disarmed 需求跑 `tick()` 与 requirement-moved → activation 仍 disarmed，零写入。

## 边界与异常 serves: FR-3, FR-4

| 情形 | 期望行为 |
|------|----------|
| 窗口不在线 / agent 不在 | 不投递、不判失败（既有语义）；`lastWakeAt` 不更新；attempts 不增（离线不是故障） |
| 拿不到 agent.ctx（订阅装不上） | 响亮：warn + 诊断行 + 台账 comment；心跳对账继续兜底 |
| 一次 tick 内多条需求 | 顺序处理，单条失败不影响其余（汇总进 ReconcileSummary） |
| 心跳兜底与正常驱动撞车 | 准入去重（roundReservationValid）保证只计一次；重复投递由 sameQueued 判据拦下 |
| 插件 teardown | 停止定时器、注销全部 agent 订阅；不写"停摆"comment（正常收尾） |
