# REQ-261001201200-8f8b 用例设计 · 五条主线场景 serves: FR-1, FR-2, FR-3, FR-4

## UC-1 人工门确认后自动续跑（主场景） serves: FR-1

- **角色**：会话用户（需求方）；**前置**：需求 armed/active，某阶段产物已登记待确认。
- **主流程**：人在弹框点「确认，推进到下一阶段」→ 落章加推进（既有）→ requirement-moved 事件 → round driver 起轮 → 会话收到一条 source.kind=dive 的消息 → agent 继续下一阶段的活。
- **修前**：同一路径在 createRoundMessage 抛 TypeError，被吞后 disarm，会话无声等待。
- **可证伪**：修后确认一个人工门并**不发任何消息**，会话应自行起一轮；`~/.dsh/sessions` 中出现 source.kind=dive 的消息。

## UC-2 看板「推进节点」同样能唤醒 serves: FR-1

- **主流程**：人在看板点「→ 设计」等推进按钮 → 需求推进 → requirement-moved → round driver 起轮。
- **与 UC-1 的差别**：这条路径不经过弹框，直接由 HTTP 路由落库（src/http/routers/requirements.ts），事件桥接同源。
- **可证伪**：看板推进后不敲字，会话起轮（与 UC-1 同一条断言，两条入口分别覆盖）。

## UC-3 投递失败不再静默（失败要响亮） serves: FR-3

- **前置**：需求 armed/active，构造已修（UC-1 通过），但投递失败（如窗口不在线的竞态）。
- **主流程**：drive 构造成功 → deliverMessage 返回 delivered=false → disarm → **台账写入 `[Dive] 已解除武装（手动模式）：queue-failed`**。
- **用户可见**：在看板需求详情/时间线能看到这条 comment，知道「自动链停了、为什么停」。
- **可证伪**：人为制造一次投递失败后读台账，需求 comments 末尾出现该条。

## UC-4 存量误停摆需求的恢复 serves: FR-4

- **前置**：某需求此前被误 disarm（`disarmed / active`），例如历史遗留的 13 条之一。
- **两条恢复路径**：
  1. **自动**：该需求下一次发生任何推进（人确认、看板推进、派生推进）→ onRequirementMoved 检出可恢复 → 重新武装 → 同一次事件里起轮；
  2. **显式**：人在看板点「继续」（autorun on=true）→ 走同一恢复入口 → 重新武装并触发一次推进。
- **可证伪**：对一条 `disarmed / active` 需求触发上述任一入口，随后台账 `activation` 回到 armed 且 `roundsInStage` 开始增长。

## UC-5 人的主动暂停不被覆盖（负向用例） serves: FR-4

- **主流程**：人调 reqboard_clear_pause（或需求达回合上限）→ `disarmed / idle`（或 `… / paused`）。
- **随后**发生任何 requirement-moved → 判别器**不成立** → 零写入，需求保持手动模式。
- **可证伪**：对 `disarmed / idle` 需求触发一次 requirement-moved，台账 `activation` 仍为 disarmed、**不新增**恢复 comment。

## 边界与异常 serves: FR-1, FR-4

| 情形 | 期望行为 |
|------|----------|
| 窗口不在线 | requestDrive 的 agentLive 不成立 → 不驱动、不 disarm（既有语义） |
| 需求未绑定会话 | requirement-moved 找不到 agent → 不驱动；恢复判定仍可写（不依赖会话） |
| 同一需求连续多次推进 | 恢复幂等（第二次已 armed → false，不重复写 comment） |
| 插件 teardown | disarm 不写 comment；下次启动对账后由恢复入口自然收敛 |
