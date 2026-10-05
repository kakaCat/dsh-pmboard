# REQ-260930231831-a8fa 架构设计 · 唤醒链的装配修正与失效可见化 serves: FR-1, FR-2, FR-3

> 范围：只改「构造一个投递器」与「disarm 时留一条痕」两处；回合语义、驱动点、闸门链顺序一律不动。

## TL;DR serves: FR-1, FR-2, FR-3

唤醒链上有三个部件，本次只修接缝：

```
  人工门确认
      │  (reqboard/requirement-moved)
      ▼
  闸门后置链 H1..H5 ── H4 = skip（唤醒托管给 Dive，保持不动）
      │
      ▼
  Dive round driver  drive()  ── 逻辑不动
      │
      ▼
  AgentDeliverer.createRoundMessage()  ← ✗ 修前：idFactory 位收到 {plugin} → TypeError
      │                                   修后：注入真实 id 工厂 → 正常构造
      ▼
  deliverMessage() → agent.followup() → 起轮
```

修前：异常被 `requestDrive` 就地吞掉 → `disarm('driver-failed')` → 该需求此后所有唤醒触发在
`isDrivableRequirement()` 处静默 return。修后：构造不再抛错，正常起轮；真投递失败时仍按既有纪律
disarm，但会**在需求上留一条 comment**（修前只有 `logger.warn`）。

```
修前（静默停摆）                        修后（可恢复 + 可见）
─────────────────────────────           ─────────────────────────────
drive() ─► TypeError ─► disarm           drive() ─► 构造 OK ─► followup ─► 起轮
                          │                                        │
                          └─ 只有 logger.warn                      └─ 失败才 disarm
                             (看板/台账均不可见)                       └─ + 台账 comment（可见）
```

## 组件与职责 serves: FR-1, FR-2, FR-3

| 组件 | 文件 | 本次动作 |
|------|------|----------|
| 投递适配器 | [AgentDeliverer.ts](../../../../src/adapters/AgentDeliverer.ts) | 签名不动；补 idFactory 缺省兜底（防御，可选） |
| 组合根装配 | [pm-capture-root.ts](../../../../src/wiring/pm-capture-root.ts) | **主修点**：三参构造；`CaptureRuntimeDeps` 增可选 id 工厂 |
| 回合驱动器 | [round-driver.ts](../../../../src/application/dive/round-driver.ts) | 仅 `disarm()` 增写台账 comment；驱动逻辑不动 |
| 闸门后置链 | [h4-resume.ts](../../../../src/application/gate/handlers/h4-resume.ts) | 不动（继续 skip，唤醒归 Dive） |
| 形状守卫测试 | `tests/dive-wake-wiring.test.ts`（新增） | 锁「组合根产出的投递器可构造回合消息」 |
| 单测迁移 | [agent-deliverer.test.ts](../../../../tests/agent-deliverer.test.ts) | 从已删除的 `deliver()` 迁到 `createRoundMessage`/`deliverMessage` |

## 数据流与修法 serves: FR-1

```ts
// 修前（错位）：第二参位置是 {plugin}，第三参缺省 → idFactory 不可调用
new AgentDeliverer(deps.getAgents, { plugin: deps.plugin })

// 修后（对齐签名）：idFactory 是函数；测试可注入固定 id
new AgentDeliverer(deps.getAgents, deps.newMessageId ?? newCommentId, deps.plugin)
```

`createCaptureRuntime(deps)` 的 `CaptureRuntimeDeps` 增一个**可选**字段 `newMessageId?: () => string`：
缺省取 `shared/protocol.ts` 的 `newCommentId()`（本仓既有的消息/评论 id 生成器，读路径无需感知）。
之所以做成可注入：A1 断言需要**可复现的 id**，也让将来换 id 方案时不必再动装配点。

## 失效模式与兜底 serves: FR-1, FR-3

| 失效点 | 修前行为 | 修后行为 |
|--------|----------|----------|
| idFactory 非法（本次根因） | 构造抛错 → driver 抛 → disarm，静默 | 不可能：装配点由 A1 守卫测试锁死；tsc 也不再报 TS2554 |
| `agents` 服务不可得 / 窗口离线 | `deliverMessage` 返回 `delivered:false`，driver 记 warn + disarm | 不变（但 disarm 现在留痕） |
| `followup` 抛错 | 同上 | 同上 |
| disarm 本身写台账失败 | — | 只 `logger.warn`，**不得冒泡**（与既有"留痕失败不中断链"同口径） |

## 兼容与回滚 serves: FR-2

- **编译期兼容**：签名是三参位置参数，旧两参写法必然 `TS2554`；本次顺带把这条信号从"淹没在 212 个类型错误里"提升为"有专属守卫测试"。
- **运行时兼容**：`deliverMessage` 的三态返回与"永不抛"契约不变，调用方（`drive()`）无需改。
- **回滚**：改动集中在一个装配函数 + 一个 `disarm()`；`git revert` 单提交即可回滚，无数据迁移、无 schema 变更。
- **明确不做**：不新增 re-arm 入口、不改 `dive` 数据结构、不动回合上限与终态暂停。

## 不变量 serves: FR-1, FR-2, FR-3

1. 台账 schema 不变（`dive` 仍是 `{activation, phase, roundsInStage, lastActiveAt}`）。
2. 起轮的唯一前置仍是 `activation='armed' && phase='active'`（本次不放松）。
3. `disarm()` 永不抛、永不阻断调用方（新增写台账路径同样受此约束）。
4. 一条回合消息在任意时刻最多一条在飞（预留纪律不动）。
