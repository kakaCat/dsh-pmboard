# REQ-260930231831-a8fa 接口设计 · 投递器构造契约、回合消息契约与 disarm 留痕 serves: FR-1, FR-2, FR-3

> 本需求不改任何**对外**接口（HTTP 路由、agent 工具 schema 均不动）。以下是本次涉及的内部契约与写路径。

## TL;DR serves: FR-1, FR-2

```
AgentDeliverer.resolveAgents ─┐
AgentDeliverer.idFactory ─────┼─► createRoundMessage(input) ─► { message, messageId }
AgentDeliverer.plugin ────────┘         │
                                        ▼
                        deliverMessage(windowKey, message) ─► { delivered: true }
                                                                │
                                                  失败三态 ─────┴─► { delivered: false, reason }
```

本次接口面 = ① 构造契约（谁必须传什么）② 回合消息形状（什么算合法回合消息）
③ `disarm` 写台账的留痕契约（给人看的可见性）。三者都不是新能力，只是把既有契约**写死并锁住**。

## I-1 · 投递器构造契约 serves: FR-1, FR-2

| 位置 | 名称 | 类型 | 必填 | 语义 |
|------|------|------|------|------|
| 第 1 参 | `resolveAgents` | `() => unknown` | 是 | 惰性取 `ctx.agents`（AgentRegistry）；内部只用 `get(id)` |
| 第 2 参 | `idFactory` | `() => string` | 是 | **必须是函数**，返回非空消息 id；本次根因就在此位收到 `{plugin}` |
| 第 3 参 | `plugin` | `string` | 是 | 写进 `message.source.plugin` 的署名 |

错误语义：**构造期不校验**（保持零依赖、零 I/O）；形状错误在 `createRoundMessage` 首次调用时以
`TypeError` 暴露，由 `requestDrive` 的守卫捕获并 disarm。因此**装配点必须由测试锁住**（见 I-6 / A1）。

组合根侧的注入面：

| 位置 | 名称 | 类型 | 必填 | 缺省 |
|------|------|------|------|------|
| `CaptureRuntimeDeps` | `newMessageId` | `() => string` | 否 | `newCommentId()`（`shared/protocol.ts`） |

## I-2 · 回合消息构造契约 serves: FR-1

```
createRoundMessage(input: {
  requirementId: string; revision: number; round: number; text: string
}) => { message: DiveRoundMessage; messageId: string }
```

- **纯构造，不投递**（投递是 `deliverMessage` 的职责）；
- `messageId` 与 `message.id` 必须**同值**（认领锚点：`user/message` 事件按它匹配预留）；
- 同一预留生命周期内 id 唯一；`revision`/`round` 原样写进 `source`，供 `pre-step` 逐字校验；
- 只有 `idFactory` 非法（不可调用）时才抛——本次修完，这是一条**不可达路径**，由 A1 确保。

## I-3 · 回合消息投递契约 serves: FR-1

```
deliverMessage(windowKey: string, message: unknown) => { delivered: boolean; reason?: string }
```

| 情形 | 返回 | 是否抛 |
|------|------|--------|
| `agents` 服务不可得 | `{delivered:false, reason:'agents 服务不可得…'}` | 否 |
| `agents.get` 抛错 | `{delivered:false, reason:'agents.get 抛错：…'}` | 否 |
| 窗口不存在 / 离线 | `{delivered:false, reason:'窗口 <w> 不在线'}` | 否 |
| agent 无 `followup` | `{delivered:false, reason:'agent 无 followup 投递能力'}` | 否 |
| `followup` 抛错 | `{delivered:false, reason:'投递失败：…'}` | 否 |
| 成功 | `{delivered:true}` | 否 |

**永不抛**是契约（调用方是事件边界）：修前修的都不是这里，这里一行不改。

## I-4 · disarm 留痕契约（本次新增可见性） serves: FR-3

```
disarm(state, reason) → repo.mutate('dive-disarm', ledger => { … })
                          ├─ r.dive.activation = 'disarmed'
                          ├─ r.dive.lastActiveAt = now()
                          └─ r.comments.push({ kind:'system', body:'[Dive] 已解除武装（手动模式）：<reason>' })
```

| 字段 | 取值 | 说明 |
|------|------|------|
| comment.createdBy | `{ kind: 'system' }` | 不是人也不是 agent，属驱动器的自述 |
| comment.body 前缀 | `[Dive] 已解除武装（手动模式）：` | 便于看板/检索识别；`<reason>` 用既有 reason 常量（`driver-failed` / `queue-failed` / `checkpoint-failed` / `prompt-rejected` / `agent-error` / `aborted` / `max-tokens` / `teardown`） |
| 幂等 | 同一需求已是 `disarmed` 时 `mutate` 返回 `undefined`（不写） | 与既有 disarm 写路径同一分支 |

失败语义：写台账失败只 `logger.warn`，**必须**保持 `disarm()` 不抛（否则会污染驱动链）。

## I-5 · 兼容矩阵 serves: FR-2

| 调用方 | 修前 | 修后 |
|--------|------|------|
| 组合根 `createCaptureRuntime` | 两参 + options 对象（错位） | 三参（对齐签名） |
| `tests/agent-deliverer.test.ts` | 两参 + `deliver()`（方法已删除） | 三参 + `createRoundMessage`/`deliverMessage` |
| Dive `drive()` | 只依赖 `createRoundMessage`/`deliverMessage` | **不变** |
| 看板 / HTTP / agent 工具 | 不接触投递器 | **不变** |

## I-6 · 守卫接口（测试即契约） serves: FR-2

`tests/dive-wake-wiring.test.ts` 必须提供两条断言，作为"装配点与签名一致"的机器化契约：

1. 用真实 `createCaptureRuntime` 产出的投递器，`createRoundMessage({...})` **不抛**且 `messageId === message.id`；
2. 该投递器接入真实 `createDiveRoundDriver` 后，一次 `requestDrive(idle agent)` → inbox 收到 1 条
   `source.kind='dive'` 的消息，且台账 `dive.activation` 仍为 `armed`。

测试文件头部（前 20 行）必须带 `serves: FR-1, FR-2`（本仓孤儿测试门禁按此判定）。
