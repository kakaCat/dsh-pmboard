# REQ-261002140814-1a5d 用例设计 · 解锁的五条路径 `serves: FR-1, FR-2, FR-3`

> 五条路径里**两条是失败路径**：解锁工具的价值不在 happy path，而在"失败时不许说谎"。
> 每条都写清：前置 → 期望回执 → 期望台账（副作用）。

## 1. UC-1 主流程：armed 需求被解锁 `serves: FR-1`

| 项 | 内容 |
|---|---|
| 前置 | 窗口绑定 `REQ-x`；`dive = { activation: 'armed', phase: 'active', roundsInStage: 3, pausedReason: 'foo' }` |
| 步骤 | 调 `reqboard_clear_pause`（可带 `requirement_id`，也可不带） |
| 期望回执 | `{ success: true, requirement_id: 'REQ-x', previous_activation: 'armed', message: '需求 REQ-x 的 Dive 模式已解除锁定，现在可以手动操作了。' }`；**无任何值为 undefined 的属性** |
| 期望台账 | `activation='disarmed'`、`phase='idle'`、`pausedReason` 键不存在（或为 undefined）、`roundsInStage` 保持 3、`version` +1、`comments` 追加 1 条 |
| 期望留痕 | 该评论 `body` 含 `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：armed`，`createdBy = { kind:'agent', sessionId: windowKey }`（FR-2） |

## 2. UC-2 无 dive 记录的存量需求 `serves: FR-1`

| 项 | 内容 |
|---|---|
| 前置 | `req.dive === undefined`（老台账 / 直种需求） |
| 期望回执 | `previous_activation` **键整体省略**（`hasOwnProperty` = false）；`success: true`；其余键齐全 |
| 期望台账 | 新建 `dive = { activation:'disarmed', phase:'idle', roundsInStage:0 }` |
| 期望留痕 | 正文含 `之前状态：none` |
| 为什么单列 | 这是**唯一**会产出 undefined 的路径——修前必红的那条；也是"缺值就该省略键"的活教材 |

## 3. UC-3 变更期间需求消失（假成功修补）`serves: FR-1`

| 项 | 内容 |
|---|---|
| 前置 | 快照能查到 target（因此通过了窗口校验），但 `mutate` 的草稿里该需求已被移除（并发删除/数据冲突） |
| 期望 | 抛带 code 的错误 `REQBOARD_MUTATION_FAILED`：**不得**返回 `success: true` 或"已解除锁定"文案 |
| 期望台账 | 未写任何字段（变更器返回 undefined ⇒ 不落盘、不 bump revision） |
| 改前行为 | 返回 `success: true` + "已解除锁定"——**副作用没发生却宣布成功**（比误报错误更坏） |

## 4. UC-4 拒绝路径（零行为变更）`serves: FR-1`

| 路径 | 前置 | 期望 |
|---|---|---|
| 本窗口无绑定需求 | 窗口未绑定 或 绑定需求已终态 | 抛 `REQBOARD_NO_BOUND_REQ`；文案不变；零写入 |
| 显式 id 不属本窗口 | 传了别的窗口的 `requirement_id` | 抛 `REQBOARD_NOT_BOUND_TO_WINDOW`；文案不变；零写入 |
| 参数越界 | `requirement_id` 超长/非字符串 | `normalizeText` 抛 `REQBOARD_INVALID_INPUT`（既有行为） |

## 5. UC-5 人在看板上看到留痕 `serves: FR-2`

| 项 | 内容 |
|---|---|
| 前置 | 完成 UC-1 |
| 步骤 | 打开看板需求详情 → 阶段评论区 |
| 期望 | 能看到那条解锁评论（渲染的是 `body`）；**改前**：评论存在但渲染为空字符串 |
| 复核口径 | 数据层断言 `comments.at(-1).body` 非空且 `hasOwnProperty('text') === false`（GUI 渲染路径见 `src/client/render/dom-utils.ts:254`） |

## 6. 路径 × 条款映射 `serves: FR-1, FR-2, FR-3`

| 用例 | FR-1 回执无损 | FR-2 留痕可见 | FR-3 门禁/回归 |
|---|---|---|---|
| UC-1 | ✅ 主断言 | ✅ | — |
| UC-2 | ✅ 缺值省略 | ✅ `none` 文案 | — |
| UC-3 | ✅ 失败不说谎 | — | ✅ 死分支变活分支 |
| UC-4 | ✅ 零行为变更 | — | ✅ 回归 |
| UC-5 | — | ✅ | — |
