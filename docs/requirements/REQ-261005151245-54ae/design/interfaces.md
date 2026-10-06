---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 接口设计（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）。本份定**签名、回执形状、错误语义**；字段级契约见 `data-model.md`。
> 全部改动**加性**：既有工具入参形状不变，既有回执字段只增不改。

## 端口：`WindowOpenerPort`（`src/application/ports.ts`） `serves: FR-1, FR-2, FR-4`

```ts
export type WindowInheritanceStatus = 'set' | 'skipped' | 'failed'

/** 源会话画像（FR-2）：三项都可缺省；整体不可得 = readProfile 返回 undefined。 */
export interface WindowSourceProfile {
  title?: string
  agentPreset?: string
  modelSelection?: WindowModelSelection
}

export interface WindowModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 继承回执（FR-5）：三项状态 + 只记 skipped/failed 的原因。 */
export interface WindowInheritance {
  title: WindowInheritanceStatus
  preset: WindowInheritanceStatus
  model: WindowInheritanceStatus
  reasons: string[]
}

export interface WindowOpenerPort {
  available(): boolean
  fork(sourceSessionId: string, atSeq?: number): Promise<OpenWindowOutcome>
  create(opts?: WindowCreateOptions): Promise<OpenWindowOutcome>
  resolveSourceProject?(sourceSessionId: string): WindowCreateOptions | undefined

  /** 冷读任一会话画像（FR-2）。**读不到就抛错**（原因即宿主错误原文）；读到但三项都缺读数 → 返回空对象。可选：测试替身可不实现。 */
  readProfile?(sessionId: string): Promise<WindowSourceProfile>
  /** 写定会话标题（FR-1）。失败**抛错**，由用例层翻成 failed + 原因。 */
  rename?(sessionId: string, title: string): Promise<void>
  /** 写定会话模型选择（FR-4）。失败**抛错**。 */
  selectModel?(sessionId: string, selection: WindowModelSelection): Promise<void>
}

/** 读画像的结果（FR-2）：要么拿到画像（可为空对象），要么拿到读不到的原因——**没有"静默 undefined"这一态**。 */
export interface WindowProfileRead {
  /** 读到了：`{}` = 宿主投影里三项都没值（各自按"源无该项"处理） */
  profile?: WindowSourceProfile
  /** 读不到的原因（`profile` 缺席时必有）：`未装配读画像能力（readProfile）` 或 `读画像失败：<宿主错误原文>` */
  reason?: string
}

/** 既有类型，加一个字段（FR-3）。 */
export interface WindowCreateOptions {
  workspaceId?: string
  cwd?: string
  /** 目标 Agent 预设（模式）；与 workspaceId / cwd **正交**，不参与二者的互斥判定。 */
  agentPreset?: string
}
```

| 项 | 约定 |
|---|---|
| 可选方法 | 三个新方法都**可选**：未实现 → 对应项 `failed` + 「未装配…能力」原因；既有测试替身（只有 `fork`/`create`）不改也能过 |
| 互斥判定 | **只**针对 `workspaceId` / `cwd`（与今日逐字一致）；`agentPreset` 不参与 |
| 服务缺失 | 适配器三个新方法在服务不可用时**抛错**（不静默返回成功），由用例层记 `failed` |
| 错误透传 | 宿主错误的 `message` 原文进 `reasons`；跨包 `instanceof` 不可靠 → 读 `code`/`message` 字段（与 `SessionWindowOpener.reasonOf` 同款） |

## 内部模块：`application/internal/window-inherit.ts`（新增） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```ts
/** 标题递增（FR-1）：与客户端 increasedForkTitle 逐字同口径。纯函数、零 I/O。 */
export function increasedWindowTitle(title: string): string

/** 读源会话画像（FR-2）：端口方法缺失 → `{ reason: '未装配读画像能力（readProfile）' }`；抛错 → `{ reason: '读画像失败：<原文>' }`。**本函数永不抛**。 */
export async function readWindowProfile(
  opener: WindowOpenerPort,
  sessionId: string,
): Promise<WindowProfileRead>

/** 算模式三态（FR-3，纯函数，不做 I/O）。 */
export function presetInheritanceOf(
  read: WindowProfileRead,
  mode: 'fork' | 'create',
): { status: WindowInheritanceStatus; reason?: string }

/** 落定三步（标题 / 模式状态 / 模型）并合成回执（FR-1/FR-3/FR-4/FR-5）。 */
export async function applyWindowInheritance(
  opener: WindowOpenerPort,
  args: {
    childKey: string
    mode: 'fork' | 'create'
    /** `readWindowProfile` 的结果；模式三态由它推得，**不再重复读源** */
    sourceRead: WindowProfileRead
    /** 显式标题（`reqboard_open_window` 的 title / 迁移开窗的语义名）；trim 非空才生效 */
    explicitTitle?: string
  },
): Promise<WindowInheritance>
```

### `increasedWindowTitle` 语义 `serves: FR-1`

| 输入 | 输出 | 说明 |
|---|---|---|
| `登录重构` | `登录重构 (1)` | 无后缀 → 追加 ` (1)`（半角括号 + 空格） |
| `登录重构 (2)` | `登录重构 (3)` | 半角后缀 → 末组 +1 |
| `登录重构（3）` | `登录重构（4）` | 全角后缀 → 末组 +1（括号形态保持全角） |
| `登录重构 (abc)` | `登录重构 (abc) (1)` | 非数字括号不算后缀 |
| `''` / `'   '` | **不调用本函数** | 空标题走 `skipped`（不写空标题） |

口径来源：宿主客户端 `packages/api/session-controller/src/client/sessions/service.ts:131-141`
（`increasedForkTitle`）。**逐字同口径**是硬要求——两处漂移会让同一源出现两种命名风格。

### `applyWindowInheritance` 行为表（顺序即语义） `serves: FR-1, FR-3, FR-4, FR-5`

| 步 | 条件 | 调什么 | 状态 |
|---|---|---|---|
| ① 标题 | `explicitTitle` trim 非空 | `rename(childKey, explicitTitle)` | 成功 `set`；抛错 `failed`；方法缺失 `failed` |
| ① 标题 | 无显式标题，且 `sourceRead.profile?.title` 非空 | `rename(childKey, increasedWindowTitle(title))` | 同上 |
| ① 标题 | 无显式标题，画像**读到了**但没有 `title` | 不调 | `skipped` |
| ① 标题 | 无显式标题，且**画像读不到**（`sourceRead.reason` 有值） | 不调 | `failed`（读不到 ≠ 源没有） |
| ② 模式 | 画像有 `agentPreset` | **不调用**（`create` 已随请求带入；`fork` 由宿主继承） | `set` |
| ② 模式 | 画像读到了但无 `agentPreset` | 不调 | `skipped` |
| ② 模式 | 画像读不到 | 不调 | `failed` |
| ③ 模型 | `modelSelection` 的 `provider`/`model` 都有值 | `selectModel(childKey, { provider, model, reasoningEffort? })` | 成功 `set`；抛错 `failed`；方法缺失 `failed` |
| ③ 模型 | 画像读到了但无模型读数 | 不调 | `skipped` |
| ③ 模型 | 画像读不到 | 不调 | `failed` |

钉子：

- **不短路**：①②③ 各试一次，一次性返回三项（标题失败不影响模型继承）。
- `reasoningEffort` **仅在源读数有时**进 `selectModel` 入参（不填 `undefined` 占位）。
- `reasons` 顺序 = 出现顺序（标题 → 模式 → 模型）；`set` 不产生条目；不写"应该没问题"这类推测语。
- **「读不到」与「源没有」必须分开**：前者 `failed`（想做没做成），后者 `skipped`（本来就没有）——
  把读失败报成 `skipped` 等于替宿主断言「源窗口没有标题」，那是编造。

### `reasons` 文案规则（唯一出处，其他文档引用本节） `serves: FR-5`

条目格式固定为 `<项名>：<一句话原因>`，项名 ∈ `标题` / `模式` / `模型`：

| 项 | 状态 | 文案 |
|---|---|---|
| 标题 | `skipped` | `标题：源会话无标题` |
| 标题 | `failed` | `标题：写标题失败：<宿主错误原文>` / `标题：未装配写标题能力（rename）` / `标题：源会话画像不可得——<读失败原因>`（无显式标题时） |
| 模式 | `skipped` | `模式：源会话未登记 Agent 预设` |
| 模式 | `failed` | `模式：源会话画像不可得——<读失败原因>` |
| 模型 | `skipped` | `模型：源会话无模型选择读数` |
| 模型 | `failed` | `模型：设模型失败：<宿主错误原文>` / `模型：未装配设模型能力（selectModel）` / `模型：源会话画像不可得——<读失败原因>` |

`<读失败原因>` 只有两种取值（由 `readWindowProfile` 给出，见上）：
`未装配读画像能力（readProfile）`、`读画像失败：<宿主错误原文>`。

## 适配器实现契约（`src/adapters/SessionWindowOpener.ts`） `serves: FR-1, FR-2, FR-4`

| 方法 | 宿主调用 | 归一规则 |
|---|---|---|
| `readProfile(id)` | `sessionController.projections({ sessionId: id })` | 取 `values.title`（非空 string）/ `values.agentPreset`（非空 string）/ `values.modelSelection?.next`（`provider`+`model` 均非空 string，`reasoningEffort` 可选）；**三项都没值 → 返回 `{}`**；服务不可用 / 宿主抛错 / 返回 `null`（会话不存在）→ **抛错**（原因即「未装配读画像能力」或宿主错误原文），由 `readWindowProfile` 收进 `reason` |
| `rename(id, title)` | `sessionController.rename({ sessionId: id, title })` | 宿主错误原样抛 |
| `selectModel(id, sel)` | `sessionController.selectModel({ sessionId: id, provider, model, ...(reasoningEffort?{reasoningEffort}:{}) })` | 宿主错误原样抛；已知副作用：宿主后台把该选择存为**全局默认模型**（需求 D-6 已接受） |
| `createRequestOf(opts)`（既有函数，加一项） | `sessionController.create({ workspaceId \| cwd, agentPreset? })` | `agentPreset` 仅在非空 string 时进请求体；`workspaceId` 优先、与 `cwd` 互斥的既有规则逐字不变 |

构造函数**不动**：`constructor(resolveService, resolveWorkspaceRegistry?)` 逐字保持。
模式不走宿主 `agentPresets.select`（理由见 `architecture.md`），故**不需要**新增 `agents` /
`agentPresets` 注入，装配处（`src/index.ts`）也无需改动——三个新方法用的仍是既有 `resolveService` 句柄。

## 工具：`reqboard_open_window` `serves: FR-1, FR-5`

```jsonc
// parameters 新增（其余既有参数不动）
"title": {
  "type": "string",
  "description": "新窗口标题（可选，≤200 字符）；不传则按源标题递增（「源标题 (1)」）。写法：每条短句（建议 ≤60 字）；需引号用「」"
}
```

```jsonc
// output schema 新增（既有字段不动；该 schema 是 additionalProperties:false，必须声明）
"inheritance": {
  "type": "object", "additionalProperties": false,
  "description": "继承回执：三项状态 + 只记 skipped/failed 的原因（开窗成功时恒出现）",
  "properties": {
    "title":  { "type": "string", "description": "set | skipped | failed" },
    "preset": { "type": "string", "description": "set | skipped | failed" },
    "model":  { "type": "string", "description": "set | skipped | failed" },
    "reasons": { "type": "array", "items": { "type": "string" }, "description": "skipped/failed 的可读原因" }
  }
}
```

| 项 | 约定 |
|---|---|
| 入参兼容 | `title` 可选；不传 = 递增口径（与改造前相比只多出"继承"这步本身） |
| 回执兼容 | `inheritance` 纯加性；旧消费方（含看板前端）忽略即可 |
| 一行摘要 | `openWindowSummary`（`OpenWindowTool.ts:18-22`）追加继承三态读数，如`（请在侧栏打开；继承 标题/模式/模型 = 3/3）`；不是 `set` 的项在摘要里点名，人一眼看得出少了哪项 |
| 提示词 | `prompt.ts` 补一句：新窗口会继承源窗口的标题 / 模式 / 模型，`inheritance` 三态如实回报 |

## 工具：`reqboard_handoff` `serves: FR-5, FR-6`

`output.schema.properties` 加 `inheritance`（同形状）。出现规则：

| 情形 | `inheritance` |
|---|---|
| 新建接管窗口（缺省 / `mode=fork\|create`） | 出现（同 `reqboard_open_window` 语义） |
| `to_window` 指向**已有**窗口 | **整体省略**（没有新建窗口，就没有可继承的对象） |

## HTTP：看板迁移开窗 `serves: FR-5, FR-6`

`openMigrationWindow(input)`（`src/http/routers/settings-support.ts:158`）返回值：

```ts
{ windowKey: string; task: 'migrate-ledger-to-sqlite'; inheritance: WindowInheritance }
```

| 项 | 约定 |
|---|---|
| 标题 | 显式语义名 `台账迁移窗口`（不递增源标题；迁移窗口不是续作） |
| 失败三态 | 既有三码不变（`window_opener_unavailable` / `window_open_failed` / `dispatch_failed`）；`inheritance` 只在**窗口建成**后出现 |
| 兼容 | 响应加字段，前端不读也不报错 |

## 错误语义总表 `serves: FR-5`

| 情形 | 结果 | 回执 |
|---|---|---|
| 建会话失败 | 开窗**失败**（既有三码 + 文案逐字不变） | 无 `inheritance` |
| 画像读不到（未装配 / 抛错 / 会话不存在） | 开窗**成功** | `title`/`preset`/`model` **三项皆 `failed`**（无显式 `title` 时）+ 读失败原因；有显式 `title` 时该项按写标题结果取值 |
| 画像读到了但源无标题 / 无模型读数 / 无预设 | 开窗**成功** | 对应项 `skipped` + 原因（「源没有」≠「读不到」） |
| `rename` / `selectModel` 抛错 | 开窗**成功** | 对应项 `failed` + 宿主错误原文 |
| 端口未实现写方法（旧装配 / 测试替身） | 开窗**成功** | 对应项 `failed` + 「未装配…能力」 |
| `create` 因 `agentPreset` 非法失败（`agent-preset/not-found`） | 开窗**失败** | 无 `inheritance`；文案给宿主原文（与 `mode=fork`、GUI fork 同行为） |

**不新增 `REQBOARD_*` 错误码**：继承没有"拒绝"态。

## 兼容与默认值 `serves: FR-5, FR-6`

- 三个入口的新字段**全部可选出现**；不出现 = 老行为，消费方无需改动。
- `degraded_note` 与「建会话 ≠ 打开窗口」措辞**逐字不动**。
- 层边界：新增编排在 `application/internal/`（零 IO、不 import 宿主包），宿主访问只在 `adapters/`。
