---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 接口设计（REQ-261005165552-6783）

<!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 结论先行：**没有新增 agent 工具、没有新增 HTTP 端点、没有改任何函数签名**。
> 唯一的接口面变化是**调用宿主注册段时多传一个字段**（`interpolate: false`）。

## 新增/修改的工具接口 `serves: FR-1`

**无变更**。本插件注册的全部 agent 工具（`reqboard_capture` / `reqboard_submit` / `reqboard_move` /
`reqboard_task_run` / …）签名、入参、错误码一律不动；本次改动不产生任何新的用户可见命令。

### systemPrompt.section(spec)：本插件唯一改动的对外接口 `serves: FR-1, FR-4`

宿主提供的段注册接口（调用点：`src/gate-wiring.ts` 内 `spCtx.systemPrompt.section({…})`）。

```
section(spec: PromptSection): Disposable
```

| 参数 | 类型 | 本次变化 | 语义 |
|---|---|---|---|
| `spec.name` | `string` | 不变 | 段名；本插件 `reqboard:capture`（全局唯一） |
| `spec.order` | `number` | 不变 | 排序位；本插件 60 |
| `spec.text` | `string \| ((ctx: AssembleContext) => string)` | 不变 | 函数式：每回合按窗口求值 |
| `spec.interpolate` | `boolean` | **新增传值 `false`** | `false` = 文本原样进提示词（不做变量扫描）；缺省 `true` = 按模板插值 |

**返回**：`Disposable`（本插件已 push 进 `disposers`，dispose 时随插件卸载）。
**错误语义**：`order` 非有限数 → 宿主抛 `TypeError`（本次不触碰该路径）；
`name` 重复 → 宿主抛"already registered"（本次不改段名，不触发）。
**未传 `interpolate` 的旧行为**（改动前）：文本按宿主模板语义扫描 `{{name}}`，见下节的四类抛错。

## 内部函数接口（签名不变） `serves: FR-2`

段产能的三个入口保持原签名与原语义，本次**一个字都不改**（改动只在注册处）：

| 函数 | 签名（要点） | 本次变化 | 作用 |
|---|---|---|---|
| `captureSectionTextFrom` | `(facts: readonly RequirementFacts[], context: unknown, pending?: PendingCaptureMessage) => string` | 无 | 按窗口绑定/待捕获态选产能 |
| `capturePromptForMessage` | `(windowKey: string, text: string) => string` | 无 | 动态立项引导（引用用户消息节选，≤300 字） |
| `boundSectionTextFrom` | `(facts, tasks: readonly TaskRecord[] \| undefined, context: unknown, injectionLog?) => string` | 无 | 绑定窗口的推进纪律 + 在制任务字段 + 阶段提示词 |
| `captureGuidanceText` | `(windowKey: string) => string` | 无 | 静态立项引导（纯字面量） |

**契约要点（本次要守住的不变式）**：三者的返回文本**逐字节保真**——外来原文（用户消息、任务字段、需求标题）
原样出现在段文本里，不转义、不清洗、不截断（截断规则本身也不变：用户消息 300 字上限）。

## 宿主插值器的错误语义（只读参考契约） `serves: FR-1, FR-2`

改动前，段文本会被宿主的 `interpolate` 扫描。本节的四类抛错正是"整轮失败"的机制，
也是回归测试里"与宿主同语义的判据"要对齐的口径（**只读参考，本次不修改宿主**）：

| 输入形态 | 宿主行为 |
|---|---|
| 完整的 `{{name}}`，名字不匹配 `/^[a-z][a-z0-9_]*$/`（如全大写占位符） | **抛**：`malformed prompt variable reference "{{…}}" in section "<段名>"` |
| 完整 `{{name}}`，名字合法但未注册 | **抛**：`unknown prompt variable "{{…}}"；registered variables: …` |
| 完整 `{{name}}`，已注册但本回合取值为 `undefined` | **抛**：`prompt variable "{{…}}" has no value for this assembly` |
| 有 `{{` 但之后没有任何 `}}` | **不抛**：当普通散文（原样保留） |
| 组内形态不符合简单 `{{name}}` 规则（如嵌套/带空格以外的怪形态） | **抛**：`malformed prompt variable reference at "…"`（references are complete simple groups） |

**本插件为何必然落到"抛"这一侧**：全仓没有任何 `systemPrompt.variable(...)` 注册（宿主变量表对本插件为空），
所以任何合法小写名字也走"未注册 ⇒ 抛"；而模板里常见的大写占位符直接走第一类"名字非法 ⇒ 抛"。

## HTTP API 变更 `serves: FR-3`

**无变更**。看板/API 不新增端点；被卡窗口的解冻**不是**靠新接口，而是靠"重建产物 + 重载插件"后同一段文本不再抛错。

## 关键决策与取舍 `serves: FR-1, FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 接口改动的粒度 | 拆成两个段（静态段 + 动态段）分别声明插值 | 单段内改一个字段 | 拆段会改段名/序位与"全局唯一"契约，收益为零 |
| 是否给段加运行时自检 | 段回调里自己检测 `{{…}}` 并打日志 | 不加 | 关掉插值后无风险；日志噪音换不来防线 |
| 字段缺省怎么处理 | 依赖宿主缺省（不显式传） | 显式传 `false` + 测试断言显式性（FR-4） | 缺省是隐性契约，本仓事故正是隐性缺省造成 |

## 技术方案与亮点 `serves: FR-2`

- **接口面最小**：一个布尔字段，无签名变更、无新工具、无新端点——对使用者的可感知面为零（除了"不再炸"）。
- **参考契约进设计文档**：把宿主插值器的四类抛错写进本文件，让"反例测试的判据"有**共同口径**，
  下一个人不必再去翻宿主源码才能理解测试在断言什么。
