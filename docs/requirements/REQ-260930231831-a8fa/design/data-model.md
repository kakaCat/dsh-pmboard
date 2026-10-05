# REQ-260930231831-a8fa 数据模型 · dive 字段语义、回合消息形状与留痕形状 serves: FR-1, FR-3

> 结论先行：**本次不新增、不改动任何持久化字段**。改动全在"写路径"（谁在什么时候写 `dive`），
> 因此本文件是"把既有数据契约写清楚 + 声明本次的无迁移结论"，不是一次 schema 变更。

## TL;DR serves: FR-1, FR-3

| 数据结构 | 是否变更 | 本次关系 |
|----------|----------|----------|
| `RequirementRecord.dive` | **不变** | 修后不再被"构造期错误"误写成 `disarmed` |
| Dive 回合消息（内存态，不落盘） | **不变** | 修后能被真正构造出来 |
| `RequirementRecord.comments[]` | 形状不变，**新增一类写入者** | `disarm` 现在会追加一条 system comment |
| 队列任务 / RTM / 台账 schema 版本 | **不变** | 不涉及 |

## dive 字段语义表 serves: FR-1

| 字段 | 类型 | 取值 | 谁写 | 何时写 |
|------|------|------|------|--------|
| `activation` | `'armed' \| 'disarmed'` | armed=自动续跑启用；disarmed=手动模式 | ① 立项（`support.ts`，恒 `armed`）② `disarm()`（→ `disarmed`）③ `reqboard_clear_pause`（→ `disarmed`） | 见左 |
| `phase` | `'active' \| 'paused'` | active=可起轮；paused=终态暂停 | round driver（回合上限 / aborted） | 到顶或回合被中止 |
| `roundsInStage` | `number` | 当前阶段**已准入**的回合数 | `persistAdmission()`（消息真正进入 history 才 +1） | 每次准入 |
| `lastActiveAt` | `number?` | 最近一次"活动"毫秒时间 | ① 立项 ② `persistAdmission()` ③ **`disarm()`** | 见左 |

> 关键推论（也是本次定位根因的工具）：**`lastActiveAt` 有值但 `roundsInStage` 仍为 0，只可能是
> `disarm()` 写的**（准入必然把 `roundsInStage` 抬到 ≥1，而 `roundsInStage=0` 的复位只有
> `reqboard_clear_pause` 会做，实测未调用）。这条推论把"静默停摆"从猜测变成可读的证据。

## 回合消息形状（内存态） serves: FR-1

```jsonc
{
  "id": "msg-<uuid>",              // = createRoundMessage 返回的 messageId（认领锚点）
  "role": "user",
  "content": [{ "type": "text", "text": "继续执行需求 REQ-xxxx（Dive 模式自动续跑，第 N 回合）…" }],
  "source": {
    "kind": "dive",                // 驱动器的唯一身份标记；人工消息是 "user"
    "plugin": "dsh-pmboard",
    "requirementId": "REQ-xxxx",
    "revision": 42,                // 预留时的需求 revision，pre-step 逐字校验
    "round": 3                     // 预留回合号 = 预留时 roundsInStage + 1
  }
}
```

| 约束 | 内容 | 违反后果 |
|------|------|----------|
| id 唯一且非空 | `idFactory()` 的返回值同时用作 `id` 与 `messageId` | 认领失败 → 预留 stale → 起轮被 pre-step 拒绝 |
| 内容不变量 | `content` 与预留登记逐字一致（`sameQueued` 深比较） | pre-step 拒绝并放回同批其它消息 |
| 回合号单调 | `round === roundsInStage + 1` | 同上 |
| 来源合法 | `isDiveRoundSource(source)` 为真 | 该消息不被视为本驱动器登记，永不认领 |

id 生成器（本次新增可注入点）：

| 项 | 契约 |
|----|------|
| 类型 | `() => string` |
| 缺省 | `newCommentId()`（`shared/protocol.ts`：时间戳 + 随机段，全局唯一性够用） |
| 注入 | `createCaptureRuntime({ newMessageId })`——测试注入固定值，便于断言 `messageId` |
| 禁用 | **不得**传对象/常量；装配点由 A1 守卫测试锁死 |

## disarm 留痕形状 serves: FR-3

```
comments[] 追加：
{
  "id": "c-…",                        // newCommentId()
  "body": "[Dive] 已解除武装（手动模式）：driver-failed",
  "createdAt": <now>,
  "createdBy": { "kind": "system" }   // 驱动器自述，不冒充人或 agent
}
```

| 约束 | 内容 |
|------|------|
| 幂等 | 已是 `disarmed` 时整体 `mutate` 返回 `undefined`（不追加、不重复刷屏） |
| 不抛 | 写失败只 `logger.warn`；`disarm()` 的调用方（驱动链 try/catch）语义不变 |
| 可检索 | body 固定前缀 `[Dive] 已解除武装（手动模式）：`，便于看板/日志过滤 |
| 不替代 | 不取代 `logger.warn`（进程日志仍是第一现场），只补齐**台账可见性** |

## 迁移与兼容 serves: FR-1

- **无数据回填**：本次不改存量 `dive` 值。已被误 disarm 的存量需求保持 `disarmed`（其自动恢复属"不做"边界，见需求文档）。
- **指纹只读判据**（用于验收/复盘时确认"这个需求是否中过本 bug"）：

  | 判据 | 期望（中过 bug） |
  |------|------------------|
  | `dive.activation` | `disarmed` |
  | `dive.roundsInStage` | `0` |
  | `dive.lastActiveAt` | 落在"需求创建后首次可驱动拍"（≈首次 `turn/end` 或创建后十余秒），而非任何一次人工确认之后 |
  | 会话日志 | 全窗口 `source.kind='dive'` 消息数为 **0** |

- **回滚**：无 schema 变更 → 回滚 = 代码 revert；存量 `dive` 值在两种版本下都可读（新增仅 comment 与一个可注入 id 工厂）。
