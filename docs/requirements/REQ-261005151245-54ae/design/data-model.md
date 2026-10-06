---
serves: [FR-2, FR-3, FR-5]
---

# 数据模型设计（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）。本份定**字段、类型、必填性、缺省、读数出处与缺失语义**；
> 完整签名与错误语义见 `interfaces.md`，调用时序与取舍见 `architecture.md`。
> 读完本份即可回答：字段从哪儿来、没有时按什么语义处理、落不落盘、回滚留不留数据。

## 新增数据契约总览 `serves: FR-2, FR-3, FR-4, FR-5`

```
projections({ sessionId })                    <- 唯一数据来源（宿主只读投影，一次调用）
        |
        v
  WindowProfileRead { profile?  reason? }                               [FR-2]
        |                     |
        | profile 有值         | reason 有值（未装配 / 抛错 / 会话不存在）
        v                     v
  WindowSourceProfile { title?  agentPreset?  modelSelection? }   三项状态：title/preset/model = failed
        |                                    |
        | 有 agentPreset                     | 有 modelSelection
        v                                    v
  WindowCreateOptions.agentPreset      WindowModelSelection
        |                              { provider  model  reasoningEffort? }  [FR-4]
        |                                    |
        +------------------+-----------------+
                           v
            WindowInheritance { title  preset  model  reasons[] }         [FR-5]
                           |
                           v
                   回执（瞬时契约，不落盘）
```

| 类型 | 性质 | 生命期 | serves |
|---|---|---|---|
| `WindowProfileRead` | 读画像的结果（读到了 / 读不到 + 原因） | 单次开窗调用的内存值 | FR-2 |
| `WindowSourceProfile` | 源会话画像（读入） | 同上 | FR-2 |
| `WindowModelSelection` | 模型选择读数（读入后写出） | 同上 | FR-4 |
| `WindowCreateOptions.agentPreset` | 加性入参字段（新增一个键） | 随 `create` 请求体，不落盘 | FR-3 |
| `WindowInheritance` / `WindowInheritanceStatus` | 回执字段（写出） | 瞬时契约，不落盘 | FR-5 |

五类都**不落盘、不进台账**，故本份没有索引 / 关联关系 / schema 迁移三节（见「无持久化 / 无迁移」）。

## `WindowSourceProfile`（源会话画像） `serves: FR-2`

**定义**（`src/application/ports.ts`）：

```ts
export interface WindowSourceProfile {
  title?: string
  agentPreset?: string
  modelSelection?: WindowModelSelection
}
```

| 字段 | 类型 | 必填性 | 缺省 | 来源 | 缺省时语义 |
|---|---|---|---|---|---|
| `title` | `string` | 可选 | 键缺席（不写 `undefined` 占位、不写空串） | `projections.values.title`（trim 后非空才算） | **画像读到了**但无标题 -> 不调 `rename`，`inheritance.title = 'skipped'` + 原因「源会话无标题」；**画像整体读不到** -> `inheritance.title = 'failed'` + 读失败原因（无显式 `title` 时） |
| `agentPreset` | `string` | 可选 | 键缺席 | `projections.values.agentPreset`（非空） | `inheritance.preset = 'skipped'`；`create` 请求体**不含**该键 |
| `modelSelection` | `WindowModelSelection` | 可选 | 键缺席 | `projections.values.modelSelection.next` | 不调 `selectModel`，`inheritance.model = 'skipped'` + 原因 |
| **画像整体** | `WindowProfileRead`（见下） | 读失败即整体缺席 | `{ reason: <读失败原因> }` | `readWindowProfile`（端口 `readProfile`） | 无显式标题时 `title`/`preset`/`model` **三项皆 `'failed'`** + 读失败原因；**不阻断开窗** |

一条铁律：**三个字段各自独立缺省、不互相兜底**——有标题没预设是合法画像，不许拿标题去推预设。
另一条铁律：**「读不到」与「源没有」分开** —— 前者 `failed`（想做没做成），后者 `skipped`（本来就没有）；
把读失败报成 `skipped` 等于替宿主断言"源窗口没有标题"，那是编造。

## `WindowProfileRead`（读画像的结果） `serves: FR-2`

```ts
export interface WindowProfileRead {
  profile?: WindowSourceProfile   // 读到了：{} = 三项都没值
  reason?: string                 // 读不到：'未装配读画像能力（readProfile）' | '读画像失败：<宿主错误原文>'
}
```

| 情形 | `profile` | `reason` | 三项状态 |
|---|---|---|---|
| 读到完整画像 | 有值 | 缺席 | 各按读数取 `set` / `skipped` |
| 读到空画像（宿主投影里三键都无值） | `{}` | 缺席 | 三项皆 `skipped`（各带自己的原因） |
| `readProfile` 方法未装配 | 缺席 | `未装配读画像能力（readProfile）` | 无显式标题时三项皆 `failed` |
| 宿主 `projections` 抛错 / 服务不可用 / 会话不存在（`null`） | 缺席 | `读画像失败：<宿主错误原文>` | 同上 |

## `WindowModelSelection`（模型选择读数） `serves: FR-4`

**定义**（`src/application/ports.ts`）：

```ts
export interface WindowModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}
```

| 字段 | 类型 | 必填性 | 缺省 | 来源 | 缺省时语义 |
|---|---|---|---|---|---|
| `provider` | `string` | 必填 | 无（对象存在即必须有） | `next.provider` | 非空 string 校验不过 -> **整个** `modelSelection` 键缺席（不做部分赋值） |
| `model` | `string` | 必填 | 无 | `next.model` | 同上 |
| `reasoningEffort` | `string` | 可选 | 键缺席 | `next.reasoningEffort` | 调 `selectModel` 时**不带**该键（不填 `undefined` 占位） |

对象整体语义：`readProfile` 取 `values.modelSelection?.next`；`next` 非对象 / `null` / `provider` 或 `model` 非非空 string
-> 「有模型读数」不成立 -> `modelSelection` 键缺席，模型走 `skipped`（FR-4 验收 3）。

## `WindowCreateOptions.agentPreset`（加性字段） `serves: FR-3`

**定义**（既有类型加一个键；`src/application/ports.ts:803` 起）：

```ts
export interface WindowCreateOptions {
  workspaceId?: string
  cwd?: string
  /** 目标 Agent 预设（模式）；仅 create 路径使用，与 workspaceId/cwd 正交（不参与互斥判定）。 */
  agentPreset?: string
}
```

| 字段 | 类型 | 必填性 | 缺省 | 来源 | 缺省时语义 |
|---|---|---|---|---|---|
| `agentPreset` | `string` | 可选 | 键缺席（**不是** `agentPreset: undefined`） | `sourceRead.profile?.agentPreset` | 请求体与改造前逐字节一致（`{}` / `{ workspaceId }` / `{ cwd }`） |

**与落点字段正交**（互斥只针对两个落点字段）：

```
createRequestOf(opts):
  1. workspaceId 非空 string --> { workspaceId, ...(agentPreset ? { agentPreset } : {}) }
  2. 否则 cwd 非空 string   --> { cwd,         ...(agentPreset ? { agentPreset } : {}) }
  3. 都无                  --> { ...(agentPreset ? { agentPreset } : {}) }   <- 仍保持既有 {} 语义
```

- 互斥判定仍只发生在 `workspaceId` 与 `cwd` 之间（宿主 `session/create` 只在这两者同时出现时报 `gateway/bad-request`）；
  `agentPreset` 与任一落点**同时出现是合法的**（FR-3 验收 1）。
- 改动点：`src/adapters/SessionWindowOpener.ts:45-51` 的 `createRequestOf` 透传该键。

## `WindowInheritance`（回执字段） `serves: FR-5`

**定义**（`src/application/ports.ts`）：

```ts
export interface WindowInheritance {
  title: WindowInheritanceStatus
  preset: WindowInheritanceStatus
  model: WindowInheritanceStatus
  reasons: string[]
}
```

| 字段 | 类型 | 必填性 | 缺省 | 来源 | 缺省时语义 |
|---|---|---|---|---|---|
| `title` | `WindowInheritanceStatus` | 必填 | 无（恒有值） | `applyWindowInheritance` 步骤 1 | — |
| `preset` | `WindowInheritanceStatus` | 必填 | 无 | 步骤 2（`presetInheritanceOf` 纯函数） | — |
| `model` | `WindowInheritanceStatus` | 必填 | 无 | 步骤 3 | — |
| `reasons` | `string[]` | 必填 | 空数组（三项全 `set` 时为空） | 步骤 1/2/3 中 `skipped` / `failed` 的原因 | 空数组 != 失败：人读三态，不读数组长度 |

出现条件（三入口形状同、出现条件不同）：

| 入口 | `inheritance` 出现条件 |
|---|---|
| `reqboard_open_window` | 开窗成功时**恒出现** |
| `reqboard_handoff` | **仅新建窗口**时出现；`to_window` 指向已有窗口 -> 该键整体省略 |
| 看板迁移开窗（`POST` 存储与数据库页） | 开窗成功时恒出现 |

> schema 声明位置（`additionalProperties: false` 的硬约束）与回执装配点见 `backend.md`。

## `WindowInheritanceStatus` 三态语义 `serves: FR-5`

**定义**：`export type WindowInheritanceStatus = 'set' | 'skipped' | 'failed'`

| 状态 | 是什么 | 谁产生 | 人看到什么 |
|---|---|---|---|
| `set` | 该项已按源窗口写定 | 标题 = `rename` 成功；模型 = `selectModel` 成功；模式 = `create` 随请求带入，或 `fork` 由宿主继承（构造事实） | 侧栏标题「<源标题> (1)」、模式芯片 = 源模式、模型选择器 = 源模型；`reasons` 无对应条目 |
| `skipped` | 源侧**没有**这项读数：按纪律不动、不猜默认值 | 步骤 1/2/3 的缺读数分支（源无 `title` / 无 `agentPreset` / 无 `modelSelection`） | 该项显示为宿主默认值（**不是**源的值），`reasons` 有一句中文原因 |
| `failed` | 想做、但没做成（能力缺失 / 宿主抛错 / 画像整体不可得） | `readProfile` 返回 `undefined`；`rename` / `selectModel` 抛错或端口方法未装配 | `reasons` 含宿主错误原文，便于人复核；开窗仍 `success: true` |

三态是**并列且独立**的：三项各自取值，不做「一荣俱荣」的折叠。
`skipped` 与 `failed` 的区别是「本来就没有」与「有但没拿到」——这个区别会进 `reasons` 文案，人不看源码也能分清。

## 读数出处映射 `serves: FR-2`

| 画像字段 | 宿主读数出处 | 取值判定 | 空串 / 非对象 / 非字符串 |
|---|---|---|---|
| `title` | `projections.values.title` | 非空 string（trim 后非空） | **按缺失处理**（不写空标题） |
| `agentPreset` | `projections.values.agentPreset` | 非空 string | **按缺失处理**（不传空串） |
| `modelSelection` | `projections.values.modelSelection.next`（`next = pending ?? lastUsed`） | 对象且 `provider` / `model` 均非空 string | **按缺失处理**（整个键缺席） |

调用形态：`sessionController.projections({ sessionId })`——**一次调用读全三样**，不 resume 源会话、不新增数据源。
服务不可用 / 抛错 / 返回 `null`（会话不存在）→ 适配器**抛错**，`readWindowProfile` 收进
`WindowProfileRead.reason`（`读画像失败：<原文>`），三项按"读不到"记 `failed`（见 `WindowProfileRead` 一节）。

三条纪律：

- 空串 / 纯空白 / 非字符串 / 非对象**一律按缺失**，绝不「照抄一个空值上去」（不写空标题、不传空串）。
- `reasoningEffort` 仅在源读数为非空 string 时才带；缺省就是**不带该键**。
- 源会话只读**一次**；fork 路径不追加读子会话核验 preset（核验即第 4 次调用，突破 NFR <=3）。

## `reasons` 的纪律 `serves: FR-5`

| 纪律 | 内容 |
|---|---|
| 条目格式 | 固定 `<项名>：<一句话原因>`，项名 ∈ `标题` / `模式` / `模型`（唯一文案规则见 `interfaces.md` §`reasons` 文案规则） |
| 只记非 `set` | 只有 `skipped` / `failed` 产生条目；`set` 不产生条目（不写「成功继承了标题」这类话） |
| 宿主原文优先 | 取宿主错误的 `message`（读 `code` / `message` 两个字段，跨包 `instanceof` 不可靠），与 `src/adapters/SessionWindowOpener.ts:53-64` 的 `reasonOf` 同款 |
| 不写推测语 | 自造原因用中文一句话（如「源会话无标题」「未装配写标题能力（rename）」），禁「应该没问题」这类不可证伪措辞 |
| 顺序 = 出现顺序 | 数组顺序即执行顺序：标题 -> 模式 -> 模型；同一项只记一条 |
| 画像读不到 | `title`（无显式标题时）/ `preset` / `model` 各记一条，原因均为 `源会话画像不可得——<读失败原因>` |

## 无持久化 / 无迁移 `serves: FR-2, FR-5`

| 项 | 结论 |
|---|---|
| 台账字段 | **不新增**：`record.json`、SQLite schema、摘要投影（`SUMMARY_KEYS`）零改动 |
| 数据模型 | **不改**：无新增表 / 列 / 索引，无 schema 版本变更（本次连加列都没有） |
| 数据回填 | **不涉及**：存量无标题 / 默认模型的窗口不追溯（`requirement.md` 边界：不追溯既有窗口） |
| `inheritance` | **瞬时契约**：只随本次回执返回，不落盘；**只增不改**，旧调用方忽略该键即可 |
| 回滚 | **回退插件构建即可（无数据残留）**：本需求零写入，回退后行为立即回到改造前 |

**为什么可以完全无持久化**：三项继承都是宿主侧会话属性（`title` / `agentPreset` / `modelSelection`）的**一次性写入**，
写定后由宿主自己持久化；本仓只做「读一次、调三次、报一次」，没有任何本地状态需要记。
已开窗口的标题 / 模型是宿主侧会话属性，不是本仓数据，回退构建不会把它们擦掉。

## 契约兼容表（三个入口） `serves: FR-5, FR-6`

| 入口 | 新增项 | 可选性 | 缺省行为 | 与改造前是否逐字一致 |
|---|---|---|---|---|
| `reqboard_open_window` | 入参 `title: string` | 可选（<=200 字符；trim 后为空**视为未传**） | 不传 => 按源标题递增（`increasedWindowTitle`） | 入参缺省路径与改造前一致（新增的是继承步骤本身） |
| `reqboard_open_window` | 回执 `inheritance` | 开窗成功时恒出现 | — | 既有键 `success` / `window_key` / `parent_session_id` / `mode` / `degraded_note` / `delivery` **逐字不变** |
| `reqboard_handoff` | 入参 | **不新增** | — | 入参形状逐字不变 |
| `reqboard_handoff` | 回执 `inheritance` | 仅新建窗口时出现 | 指定已有窗口 => 键整体省略 | 既有键逐字不变（含 `delivery` / `context_pressure` / `note`） |
| 看板迁移开窗（`POST`） | 入参 | **不新增**（标题走内部显式语义名「台账迁移窗口」） | — | 请求体形状不变 |
| 看板迁移开窗（`POST`） | 回执 `inheritance` | 开窗成功时恒出现 | — | 既有响应字段不变；`window_opener_unavailable` / `window_open_failed` / `dispatch_failed` 三码逐字不变 |

**不新增 `REQBOARD_*` 错误码**：继承没有「拒绝」态，只有 `set` / `skipped` / `failed` 三态。
唯一例外是 `create` 路径的 `agentPreset` 非法（宿主 `agent-preset/not-found`）：它属于**建会话请求本身**，
会话建不出来 => 开窗失败，走既有 `open_failed` 路径（与 `mode=fork` 及 GUI fork 的既有行为一致）。
