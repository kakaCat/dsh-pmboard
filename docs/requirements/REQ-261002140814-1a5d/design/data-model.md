# REQ-261002140814-1a5d 数据模型设计 · 写入字段与回执数据契约 `serves: FR-1, FR-2, FR-3`

> 本文件的"数据模型"有两层：① **落盘的**台账结构（本次不动）；② **不落盘的**工具回执结构（本次就是改它）。
> 关键比例：越界风险在"值域/缺值语义"，不在字段多少。

## 1. 不改的落盘结构 `serves: FR-1`

| 结构 | 字段 | 类型 | 约束 | 本次 |
|---|---|---|---|---|
| `RequirementRecord.dive` | `activation` | `'armed' \| 'disarmed'` | 只有人能改（立项 armed / 本工具 disarmed） | 不动 |
| | `phase` | `'idle' \| 'active' \| 'paused'` | 本工具固定写 `idle` | 不动 |
| | `roundsInStage` | `number` | 非负整数；本工具写 0（仅在 `!req.dive` 新建时） | 不动 |
| | `pausedReason` | `string \| undefined` | 本工具清除 | 不动 |
| `RequirementRecord.comments[]` | `CommentRecord` | `{ id: string; body: string; createdAt: number; createdBy?: ActorRef }` | `id/body/createdAt` 必填 | **只改写入方用的键名**（§2） |
| `RequirementRecord` | `version` / `updatedAt` / `updatedBy` | `number` / `number` / `ActorRef` | 每次成功变更 +1 / 刷新 | 不动 |

## 2. 写入字段对照 `serves: FR-2`

| 位置 | 改前 | 改后 | 后果 |
|---|---|---|---|
| `comments[].键名` | `text`（`CommentRecord` 未声明该键；`tsc` 报 TS2353） | `body` | 改前：数据写进去了，看板渲染读 `c.body` ⇒ **显示为空**；改后：评论可见 |
| `comments[].createdBy` | `{ kind: 'agent', sessionId: windowKey }` | 同左 | 不变（保留"谁解开的锁"） |
| 正文文案 | `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：${previousActivation \|\| 'none'}` | 同左 | 不变（缺值时显示 `none`） |

**约束**：`CommentRecord` 不加新键、不加 `text` 兼容字段——一处真相，避免"两处都写必然漂移"。

## 3. 回执数据契约 `serves: FR-1`

| 字段 | 类型 | 必填 | 值域 | 缺值语义 |
|---|---|---|---|---|
| `success` | `boolean` | 是 | `true` | — |
| `requirement_id` | `string` | 是 | `REQ-xxxxxx`（本窗口绑定需求） | — |
| `previous_activation` | `string` | **否** | `'armed' \| 'disarmed'` | **键整体省略**（不是 `undefined`、不是 `null`、不是 `''`） |
| `message` | `string` | 是 | 人话（含 REQ id 与"可以手动操作"） | — |

三条硬规则：

1. **值为 `undefined` 的属性一律不得出现在回执里**。理由：绑定层的无损 JSON 校验（`walkJsonValue`）在 `JSON.stringify` **之前**检查内存值，`undefined` 不属于任何 JSON 值类型 ⇒ 整个回执被转成无信息的 `value is not lossless JSON`。**不能靠序列化兜底**（`JSON.stringify` 会静默丢键，检测点更早）。
2. **可选字段用条件展开**：`...(prev !== undefined ? { previous_activation: prev } : {})`。
3. **回执的 `success` 必须与副作用一致**：只有在 `changed.requirements.length === 1`（真的改到了）时才可返回 `success: true`。

## 4. 迁移、兼容与回滚 `serves: FR-1, FR-2`

| 维度 | 结论 |
|---|---|
| schemaVersion / 迁移脚本 | 不动、不加（无字段增删改） |
| 数据回填 | 不做；旧的 `text` 键评论保持原样（读方不认 ⇒ 继续不显示，登记为已知残留） |
| 读侧兼容 | 不加 `c.body ?? c.text` 之类回退（会制造第二个真相源） |
| 回滚 | revert 提交；无迁移 ⇒ 无补偿、无半写状态 |
