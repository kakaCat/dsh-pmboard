---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 接口设计（命令面契约）
status: design
serves: RF-16, RF-17, RF-18, RF-19, RF-20, RF-22, RF-23
---

# 接口设计（REQ-261009174713-7bc8）

> 本需求唯一的**新增宿主可见接口**是斜杠命令面。契约照抄宿主 `@deepseek-ai/dsh-commands@0.2.0-rc.1` 的公开类型（`packages/interaction/commands/src/{index,types}.ts`），
> 并把「回执文案」逐字定死——命令面是用户直接看到的面，文案漂移等于行为漂移。

## 宿主命令契约（只读依赖，不改宿主）`serves: RF-16`

| 宿主类型 | 定义（逐字取自 dsh-commands） | pm 侧用法 |
|---|---|---|
| `CommandDefinition` | `{ definitionId?, name, description, input?: {hint, attachments?}, recordInput?, handler }` | 作为 `register` 的唯一入参 |
| `CommandInvocation` | `{ commandId, agent, rawInput, attachments, signal }` | 取 `agent` 解析窗口、取 `rawInput` 解析语法 |
| `CommandResult` | `{kind:'success', text?, sourceEventSeq?} \| {kind:'error', text}` | handler 的唯一回执形态 |
| `ctx.commands.register(definition)` | 返回卸载 disposer；同一作用域同名重复注册**抛错** | 注册一次；抛错按降级路径处理 |

```ts
// 命令面注册的完整定义（packages/command-pmboard/src/index.ts）
export const name = 'command-pmboard'
export const inject = []                      // 惰性注入，不用静态 inject

export function apply(ctx: Context): void {
  ctx.inject(['commands'], (c: { commands: { register(d: CommandDefinition): () => void } }) => {
    try {
      return c.commands.register({
        definitionId: CommandDefinitionId('dsh-pmboard'),
        name: 'pm',
        description: '创建或查看 pm 需求（pmboard 流水线）',
        input: { hint: '[<需求名称>]', attachments: false },
        handler: invocation => runPmCommand(deps, invocation),
      })
    } catch (error) {
      logUnavailable(ctx, error)              // 留痕，不抛（RF-16）
      return undefined
    }
  })
}
```

- `name: 'pm'` ⇒ 用户输入面为 `/pm`；`attachments: false` ⇒ 带附件的调用由宿主在派发前拒绝（命令面不接附件）。
- `recordInput` 不声明（默认 true）：命令原文进会话日志，便于事后复盘「谁在什么时候立了什么项」。

## 语法文法 `serves: RF-17`

`rawInput` 是**命令名之后的原文（含分隔空白）**，文法由命令面独占：

| 输入 | 解析结果 | 行为 | 回执 kind |
|---|---|---|---|
| `/pm` | `show` | 显示本窗口绑定状态与运行态摘要 | success |
| `/pm` + 纯空白 | `show` | 同上 | success |
| `/pm <名称>` | `create(title)` | 调 `executeCreateRequirement` | success / error |
| `/pm <名称>` 且名称 > 120 字符 | `invalid` | 不落任何数据 | error（用法提示） |
| 其它（含 `/pm --flag`） | `create('--flag')` | 按名称处理（命令面不认旗标，避免「看似支持其实不生效」） | success / error |

- 语法解析是**纯函数**（`parsePmCommand(rawInput): PmCommand`），放 `packages/command-pmboard/src/parse.ts`，单测直接覆盖（含空白、超长、非 ASCII 边界）。
- 无子命令：V1 不做 `/pm list` / `/pm cancel`（命令面 V1 只两条，见需求的「边界」节）。

## 回执契约（逐字文案）`serves: RF-17`

| 场景 | kind | text |
|---|---|---|
| 创建成功 | success | `已创建需求 <REQ-ID> · <board_link>` |
| `show`（本窗口无绑定） | success | `本窗口未绑定需求。用法：/pm <需求名称>` |
| `show`（已绑定） | success | `本窗口需求：<REQ-ID> <title> · 阶段 <status> · <board_link>` |
| 本窗口已绑定进行中需求（`REQBOARD_WINDOW_BOUND`） | error | `本窗口已绑定进行中需求 <REQ-ID>；先推进或取消它再立项` |
| 工作区不可用（`REQBOARD_INVALID_WORKSPACE`） | error | `工作区不可用，需求落不了盘（REQBOARD_INVALID_WORKSPACE）` |
| 入参非法（`REQBOARD_INVALID_INPUT`）/ 名称超长 | error | `用法：/pm [<需求名称>]（名称 ≤ 120 字符）` |
| 未知错误 | error | `命令执行失败：<message>` |

- 错误一律 `kind:'error'`（宿主按错误回执渲染，不进模型上下文）；**不吞异常**：非预期异常转成 error 回执并写插件日志。
- `<board_link>` 取用例回执里的 `board_link` 字段（与工具面同一来源，命令面不自拼链接）。

## 复用契约（core 用例，零复制）`serves: RF-17, RF-18`

| 用途 | 复用的 core 用例 | 入参 | 窗口解析 |
|---|---|---|---|
| `create` | `executeCreateRequirement(deps, args, exec)` | `{ title, category: 'feature', prompt_difficulty: 'standard' }`（类型/档位取缺省；`doc_location` 不传 ⇒ 回落 `docs/requirements/<REQ>/`） | `exec = { agent: invocation.agent }` ⇒ `deps.session.windowKey(exec)`（与 19 工具同一实现） |
| `show` | `queryState(deps, { }, exec)` | 同 | 同 |

- **禁止**在命令面复写 `agentIdOf` / 绑定判据 / 文档落点规则——判据单点在 core（RF-18 的判据之一）。
- `deps` 由根包（组合根）在装配时注入命令面，与工具面共用一个 deps 实例（避免第二套端口接线）。

## 依赖与装配契约 `serves: RF-16, RF-18`

| 项 | 取值 |
|---|---|
| 新增运行时依赖 | `@deepseek-ai/dsh-commands@0.2.0-rc.1`（只引 `types` / `brand` 两个入口） |
| 子包依赖 | `pmboard-core: workspace:*` |
| 注入服务 | `commands`（惰性；缺席 = 不注册 + 留痕，插件其余面照常） |
| 根包接线 | `src/index.ts` 调 `applyCommandSurface(ctx, deps)`；命令面不自行装配端口 |

## 资产解析契约（运行期读盘面） `serves: RF-22, RF-23`

| 资产 | 解析点（现有） | 包化后根 | 不变的部分 |
|---|---|---|---|
| 文档模板 | `adapters/TemplateRoot.ts`（`resolveAddressInjection` / 模板根） | `packages/pmboard-templates` | 选文件的规则、读取顺序、模板内容 |
| UI/UX skill 资产 | `adapters/SkillAssets.ts` + skill 检索脚本 | `packages/pmboard-skills` | 7 个 skill 的清单与文件内容 |
| RTM 引擎 | core 内 `vendor/reqboard` 相对引用 | `packages/reqboard-rtm` | 引擎代码与产物格式 |

- 解析根从「仓库根相对」改为「包目录相对」是**唯一被允许的运行期内部改动**（外部可观测行为不变，RF-1/RF-4 仍成立）。
- 失败契约：资产目录/文件缺失 → 抛错，信息含**期望绝对路径**；禁止回落到空模板或空 skill 列表。
- 发布契约：根包 `package.json` 的 `files` 必须含 `packages/pmboard-templates` 与 `packages/pmboard-skills`；`pnpm pack` 后断言存在。

## 工具注册表契约 `serves: RF-20`

| 项 | 契约 |
|---|---|
| 包结构 | 单包 `tool-pmboard`：`src/{kit,intake,decompose,verify,collab}/` + `src/registry.ts` |
| 聚合位置 | `src/registry.ts` **留在工具包内**，导出 `TOOL_REGISTRY`，形状与迁移前逐字一致（19 名 + schema 摘要哈希） |
| 共享能力 | 三个共享文件（`shared.ts` / `render-summaries.ts` / registry 契约类型）→ 包内 `src/kit/` |
| 禁止 | 四目录之间禁止横向 import（除 `kit/`）；工具包不得 import 根包 |

## 类型规格契约 `serves: RF-25, RF-26, RF-27, RF-28`

```ts
// packages/pmboard-type-kit/src/index.ts（契约，唯一权威）
export interface RequirementTypeSpec {
  readonly category: RequirementCategory            // 'feature' | 'bug' | 'doc' | 'refactor' | 'spike' | 'chore'
  readonly label: string                            // 中文标签（立项弹框/看板显示）
  readonly description: string                      // 一句话说明（弹框选项描述）
  readonly rootSectionsDelta: readonly string[]     // 该类型必填的需求文档节
  readonly requiredDesignDocs: readonly string[]    // 必交设计文档文件名
  readonly conditionalDesignDocs: readonly { name: string; side: 'frontend' | 'backend' }[]
  readonly conditionalStageArtifacts: readonly { stage: string; kind: string; side: 'frontend' | 'backend' }[]
  readonly templates: Readonly<Record<string, string>>   // 阶段 → 模板相对路径（声明，不读盘）
  readonly archive: {
    readonly requireManual: boolean                 // 是否必须申报 manual_updates
    readonly requiredDocs: readonly string[]        // 归档必交文档种类
    readonly mergeTargets: readonly string[]        // 允许的合并去向前缀
    readonly note: string
  }
  readonly promptFragments: readonly PromptFragment[]    // 该类型的提示词片段（运行期内联）
}

export function createTypeRegistry(specs: readonly RequirementTypeSpec[]): TypeRegistry
// TypeRegistry.of(category) 未命中 → throw ReqboardError('REQBOARD_TYPE_UNKNOWN', { category })
```

- 六个类型包各导出 `export const spec: RequirementTypeSpec`；**聚合根包**把六个 spec 注入 `createTypeRegistry()`（core 不 import 任何具体类型包）。
- 类型包只声明 `templates` 路径，**装配期**校验路径在 `pmboard-templates` 内存在（RF-28）；悬空 → 抛错含类型名 + 期望路径。
- `rootSectionsDelta` 与模板内容的关系：模板是「人照抄的骨架」，spec 是「机器校验的判据」——两者必须同步（`templates:check` 覆盖）。

## 测试契约 `serves: RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24`

| 用例 | 断言 |
|---|---|
| 注册成功 | 假 `commands` 服务的 `register` 被调用一次，`name === 'pm'`、`definitionId` 命中品牌 id、`input.hint` 逐字 |
| 注册重复抛错降级 | `register` 抛「already registered」→ `apply` 不抛、日志含 `unavailable` |
| 无服务降级 | 注入缺席（`inject` 回调不触发）→ `apply` 正常返回，无注册调用 |
| 语法表 | `parsePmCommand` 对照文法表逐行（含空白、超长、`--flag`） |
| 创建成功 | 假 deps 跑 handler：台账 +1 条、回执 `kind:'success'` 且含 REQ id |
| 已绑定 | 第二次调用回执 `kind:'error'` 且文案含既有 REQ id、台账条数不变 |
| 窗口解析单点 | 命令面与工具面对同一 agent 解析出同一 windowKey（同一实现断言） |
| 公共包零依赖 | 扫 `packages/pmboard-common/src` 无兄弟包 import；`package.json` 无 workspace 依赖 |
| 工具分类等价 | `TOOL_REGISTRY` 聚合与基线逐字一致（19 名 + schema 摘要哈希） |
| 资产清单等价 | 模板 / skill / RTM 三份资产清单（路径 + 哈希，排序稳定）与基线逐字相同 |
| 分层门禁自检 | 三种越界（类别包互引 / core → 工具包 / 资产包引用代码包）各一例，全被非零退出拒绝 |
