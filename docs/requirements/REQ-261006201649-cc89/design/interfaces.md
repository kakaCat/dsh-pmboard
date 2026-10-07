---
req_id: REQ-261006201649-cc89
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 接口设计（REQ-261006201649-cc89）

> 本文件把**签名、字段、错误码、值域**定死。定不死的不许进拆分阶段。
> 路径口径一律**需求目录相对**（`prototypes/<name>.html`），与既有三门同源
> （`toReqRelative`）。

## 接口清单（拆分阶段的覆盖对照按此编号引用） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 编号 | 接口 / 改动点 | 位置 | 新建 / 修改 | 服务条款 |
|---|---|---|---|---|
| I-1 | `prototypePlaceholderOf(html, skeletonTemplate)` + `PlaceholderReading` / `PlaceholderHit` / `SKELETON_PLACEHOLDERS` | `src/application/internal/prototype-gates.ts` | 新建（同文件内） | FR-1 |
| I-2 | `observationEvidenceOf(o, deps)` + `ObservationEvidence`；`ProtoObservation` 增 `shot` / `shotSha256` | `src/application/internal/prototype-gates.ts` | 新建 + 修改 | FR-4 |
| I-3 | `humanReasonHasFact(reason)` | `src/application/internal/prototype-gates.ts` | 新建 | FR-4 |
| I-4 | `checkPrototypeAnchorsGate(docs, req)` 内新增两问（非骨架 / 几何量证据）+ `GateFailure.code` 两个新值 | `src/application/internal/prototype-gates.ts` | 修改 | FR-1, FR-2, FR-4 |
| I-5 | `PrototypeEvidencePort`（`exists` / `sha256Of`） | `src/application/ports.ts` + `src/adapters/FileDocRepository`（生产实现） | 新建 | FR-4 |
| I-6 | `compareInputsOf` / `prototypeHtmlPathOf` 的取数改读 INDEX 权威行；存量 `createdAt` 早退 | `src/application/use-cases/SubmitVerification.ts` | 修改 | FR-3 |
| I-7 | `prototypeParityViolations(prototypeHtml, implHtml, contracts, prototypeRef)` + `ParityViolation` / `ParityContracts` | `src/domain/prototype/ParityContracts.ts`（新文件，纯函数） | 新建 | FR-5 |
| I-8 | `STATUS_BY_CODE` 两个新码 → 400 | `src/http/envelope.ts` | 修改 | FR-6 |
| I-9 | `ERROR_CATEGORY` 两个新码中文名 | `src/client/toolviews/shared.ts` | 修改 | FR-6 |
| I-10 | 会话侧传输码 `REQBOARD_PROTOTYPE_PLACEHOLDER` / `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED` | `src/application/use-cases/MoveRequirement.ts` | 修改 | FR-6 |

## 新增纯函数：非骨架判据 `serves: FR-1`

```ts
/** 命中原因（两条独立判据；可同时命中）。 */
export type PlaceholderHit =
  | { kind: 'marker'; marker: string }            // 命中骨架占位标记（原文）
  | { kind: 'similarity'; ratio: number }         // 行重合率（0..1）

/** 判据读数（无论命中与否都给出，便于门禁文案与测试断言）。 */
export interface PlaceholderReading {
  /** 与模板逐行相同的行数 ÷ 本文总行数（去占位符归一后计算；空文件 = 0） */
  lineRatio: number
  /** 命中的占位标记原文（未命中 = 空数组） */
  markers: string[]
}

/** 命中即返回读数 + 命中原因；未命中返回 undefined。模板基线不可得 ⇒ 也返回 undefined（不判）。 */
export function prototypePlaceholderOf(
  html: string,
  skeletonTemplate: string,
): { reading: PlaceholderReading; hits: PlaceholderHit[] } | undefined
```

**值域与口径（逐条可测）**：

| 项 | 口径 |
|---|---|
| `lineRatio` 分母 | 归一后 `html.split('\n').length`；**空串 / 空文件 → 0**（不得除零） |
| 归一 | 把 `{{TITLE}}` / `{{REQ_ID}}` / `{{DATE}}` 替换为固定标记 `X` 后再比（两份都归一） |
| 行相等的定义 | 两侧 `trim()` 后全等（容忍缩进差异——骨架落盘后常被人重排缩进） |
| 相似度阈值 | `lineRatio > 0.90` **命中**；`=== 0.90` **不命中**（阈值是"严格大于"） |
| 占位标记集合 | 常量 `SKELETON_PLACEHOLDERS`，逐字：`（功能点名）`、`（界面草图区`、`（分支：若…则…）`、`按功能点数量照抄改号` |
| 模板基线为空串 | 返回 `undefined`（**不判**）——没有基线时"相似度"无意义 |
| 纯函数 | 零 IO、零依赖：不读文件、不 import `node:`、不引 HTML parser |

**占位标记清单的两条纪律**：

1. **只收骨架模板里真实出现的字符串**（逐字复制，不凭记忆写）；
2. 新增标记必须同时改 `templates/brainstorming/prototype.html` 与
   `prototype-skeleton-template.ts`（两份逐字节一致的既有断言会先红）——
   即"标记清单"与"骨架正文"**同源**，不存在第三处。

## 新增纯函数：几何量读数可复核性 `serves: FR-4`

```ts
/** 一条观测量的读数证据（加性可选；缺两键 = 未采集）。 */
export interface ProtoObservation {
  // …既有六字段（name / value / unit / at / source）一字不动…
  /** 截图路径（**工作区相对**，如 docs/requirements/<REQ>/evidence/x.png） */
  shot?: string
  /** 该截图文件内容的 sha256（64 位小写十六进制） */
  shotSha256?: string
}

/** 单条观测量的复核结论。 */
export type ObservationEvidence =
  | { state: 'collected' }                       // 两键都在且校验通过
  | { state: 'unverified' }                      // 两键都缺（存量口径）
  | { state: 'invalid'; reason: string }         // 给了一键/一键坏 → 拒

/** 校验两条证据键；`shotExists` / `shotSha256Of` 由调用方注入（application 层禁直接读盘）。 */
export function observationEvidenceOf(
  o: ProtoObservation,
  deps: { shotExists(relPath: string): boolean; sha256Of(relPath: string): Promise<string | undefined> },
): Promise<ObservationEvidence>
```

**判定表（实现必须逐行对应）**：

| `shot` | `shotSha256` | 文件存在 | 摘要匹配 | 结论 |
|---|---|---|---|---|
| 缺 | 缺 | — | — | `unverified`（放行） |
| 有 | 缺 | — | — | `invalid`（缺 sha256，无法复核） |
| 缺 | 有 | — | — | `invalid`（缺截图路径） |
| 有 | 有 | 否 | — | `invalid`（截图不在：点名路径） |
| 有 | 有 | 是 | 否 | `invalid`（摘要不符：给期望与实际前 12 位） |
| 有 | 有 | 是 | 是 | `collected` |
| 有 | 有，但非 64 位小写十六进制 | — | — | `invalid`（形态不合法） |

**路径口径**：`shot` 按**工作区相对**解析（与 `evidence` 数组的路径口径一致）；
非工作区相对（绝对路径 / `..` / 伪路径）→ `invalid`，理由「路径口径不合法」。

## 新增纯函数：`needsHuman` 理由的事实性 `serves: FR-4`

```ts
/** 事实性锚点（任一命中即算"给了事实"）。 */
export function humanReasonHasFact(reason: string): boolean
```

**命中口径**（每条都是一个可核对的锚）：

| 锚类型 | 形态 |
|---|---|
| 路径 | 含 `/` 且含 `.`（如 `evidence/x.png`、`src/client/views/a.ts`） |
| 截图 / 图片 | 含 `.png` / `.jpg` / `.jpeg` / `.webp` |
| 命令 | 含 `npx ` / `pnpm ` / `git ` / `node ` |
| 界面位置 | 含 `#FR-` / `prototypes/` / 面板名形态 `\d+屏` |

**不命中的例子（必须拒）**：`不好看`、`不一致`、`视觉上不对`、空串、纯标点。
**命中的例子（必须放行）**：`见 evidence/gate-1280.png 右侧卡片的边框颜色`、
`跑 npx vitest run tests/x.test.ts 看不到该项`。

> 边界：本判据只回答"**有没有给出可核对的事实**"，**不判**理由是否成立——
> 判断"这个理由站得住吗"是人的事。

## 门契约：错误码与触发条件 `serves: FR-1, FR-2, FR-4`

| 码 | 触发条件 | `kind` | HTTP | 触发的门 |
|---|---|---|---|---|
| `prototype_placeholder` | 权威原型的正文命中占位标记**或**行重合率 > 0.90 | `prototype` | 400 | 锚点门 |
| `prototype_geometry_unverified` | 任一观测量的 `observationEvidenceOf` 返回 `invalid` | `prototype` | 400 | 锚点门（同一门内、第二问） |

**早退（保持现有形态）**：INDEX 不存在 / 解析有缺口 / `authoritative` 条数 ≠ 1 时，
两个新判据均返回 `undefined`（那处坏由版本门报一次）。

**门内判定顺序（锚点门）**：

```
权威原型文件不存在        → prototype_anchor_missing（点名路径）
  ↓ 存在
prototypePlaceholderOf    → 命中 ⇒ prototype_placeholder（**先报**，因为它解释"为什么后面都不对"）
  ↓ 未命中（或基线不可得）
geometry 块数 ≠ 1 / JSON 坏 → prototype_anchor_missing
  ↓ 恰好一块
serves 列声明的 FR 覆盖    → 缺 ⇒ prototype_anchor_missing
  ↓ 覆盖齐
阈值字段命中              → prototype_anchor_missing（既有 D-10）
  ↓ 无
observationEvidenceOf     → invalid ⇒ prototype_geometry_unverified
  ↓ collected / unverified
PASS
```

> **为什么非骨架在锚点之前**：骨架必然含示例区块 `id="FR-1"` 与示例 geometry 块，
> 所以骨架天然"锚点齐、块恰好一块"——若把非骨架放在后面，人只会看到
> 「锚点缺失」这类**误导性**的码（实测：骨架因为通用 `FR-1` 反而全绿）。

## 信封形态（人读文案） `serves: FR-1, FR-4`

两个新码的 `message` 走既有 `envelope`（`<what> —— <why>。补齐：<how>`）：

**`prototype_placeholder`**

| 要素 | 内容（模板，`{…}` 为占位） |
|---|---|
| `lead` | `brainstorming → design 推进未执行：` |
| `what` | `权威原型 {path} 仍是模板骨架（没有填过内容）`；命中判据追加：`占位标记「{marker}」` 或 `与模板行重合率 {ratio}%（> 90% 即命中）` |
| `why` | `它不是设计结论，占权威位等于「照模板实现」——原型面的门只查锚点与几何量块，查不出「一个字没填」` |
| `how` | `把每个 FR 区块的界面结构 / 关键控件 / 交互路径填成真实设计，或换一份填过的原型并把 prototypes/INDEX.md 的 authoritative 指过去，再调 reqboard_submit(kind=prototype)（requirement_id="{id}"）重新登记` |

**`prototype_geometry_unverified`**

| 要素 | 内容 |
|---|---|
| `lead` | `brainstorming → design 推进未执行：` |
| `what` | `权威原型 {path} 的观测量 {name} 读数无法复核：{reason}` |
| `why` | `几何量读数是「实现与原型一致」的唯一机器读数；没有截图与摘要，验收只能凭提交者自述` |
| `how` | `在该观测量上补 shot（截图路径，工作区相对）与 shotSha256（该文件 sha256）——两键都要对；确实没截图时两键都留空（记 unverified，放行）；再调 reqboard_submit(kind=prototype)（requirement_id="{id}"）重新登记` |

**`how` 的锚点要求**：两段 `how` 都命中 `GATE_HOW_ANCHOR`
（`reqboard_*` + `templates/` 或 `prototype_exempt`）。

## 验收组装接口：对照项由可选改硬判据 `serves: FR-3`

```ts
/** compareInputsOf 的产出形状**不变**（不新增字段，避免下游两套判定）。 */
interface CompareInputs {
  prototypeCompare?: { path: string } | { exempt: true; reason: string }
  decisionIds: string[]
  needsPrototype: boolean
}
```

**唯一改动：`prototypeCompare.path` 的来源**

| | 现状 | 目标 |
|---|---|---|
| 取数 | `req.artifacts` 里 `kind=prototype` 且以 `.html` 结尾，**排序首项** | 读 `prototypes/INDEX.md`，取**唯一 `authoritative` 行**的路径 |
| 无产物时的行为 | `path === undefined` ⇒ `needsPrototype = true` | **不变**（同一分支、同一码） |
| 有产物但 INDEX 读不出 | — | 降级：沿用既有「排序首项」并**在验收材料里注明降级**（不新增码） |

**为什么改成读 INDEX**：现状「排序首项」在「多份 html」时是**猜**的
（`prototypeHtmlPathOf` 的注释自己说"只为给对照的是哪一版一个稳定落点"）。
版本门已经保证"INDEX 恰好一条 authoritative"——同一个事实两处判定必然漂移，
故这里**消费版本门的结论**，而不是自己再猜一遍。

**存量零回归**：`createdAt < DOC_QUALITY_RULES_SINCE` ⇒ `compareInputsOf` **原样早退**
（现状已有 `artifacts` 空即早退；本次补 `createdAt` 判据，与 `sidesGateFailure` 同构）。

## 结果绑定接口（不改） `serves: FR-3`

`ResultBinding` 的 `ref.kind='prototype-compare'` + `prototypePath` 形状**一字不动**；
`knownResultKeysOf` 的条件化纪律（复核 R2 的两条反例）**不动**——
本次改的是**组装条件**，不是**绑定键**。

## 参数化对齐判据接口 `serves: FR-5`

```ts
/** 一条契约违规（人读；每条必须能独立定位）。 */
export interface ParityViolation {
  contract: 'classes' | 'dataAttrs' | 'order'
  expected: string
  actual: string
  /** 原型锚点（如 prototypes/detail.html#FR-2），供"回原型看" */
  anchor: string
}

export interface ParityContracts {
  classes: readonly string[]
  dataAttrs: readonly string[]      // 形态：'data-result-src' 或 'data-result-src=agent|human|none'
  order: readonly string[]          // 期望的 DOM 先后（按出现顺序）
}

export function prototypeParityViolations(
  prototypeHtml: string,
  implHtml: string,
  contracts: ParityContracts,
  prototypeRef: string,
): ParityViolation[]
```

**判据口径**：

| 契约 | 判据 | 失败示例 |
|---|---|---|
| `classes` | 每个类名在 `implHtml` 中出现（子串命中即可，含复合类） | `dsh-pm-artifact-chip` 未命中 |
| `dataAttrs` | 带 `=` 时判「属性名 + 取值域」；不带 `=` 只判属性名存在 | 期望 `data-result-src`，实现只有 `data-result-source` |
| `order` | 按数组顺序在 `implHtml` 中做**单调递增**定位（前一项的下标 < 后一项的下标） | `err-hint` 出现在 `err-detail` 之前 |

**失败即点名**：三条字段齐（`contract` / `expected` / `actual` / `anchor`），
不许只回一句「不一致」。

**被检需求的配置形态**（放 `tests/`，不进产物）：

```ts
{ prototype: 'docs/requirements/<REQ>/prototypes/<name>.html',   // 权威路径
  render:    () => string,      // 调实现侧渲染入口
  container: (html) => string,  // 只取被测容器
  contracts: { classes: [...], dataAttrs: [...], order: [...] } }
```

## 既有接口的**不变**承诺 `serves: FR-2, FR-6`

| 接口 | 承诺 |
|---|---|
| `checkPrototypePresenceGate(docs, req)` | 签名与返回值不变；判据不变 |
| `checkPrototypeVersionGate(docs, req)` | **逐字不变** |
| `checkPrototypeAnchorsGate(docs, req)` | 签名不变；内部新增第一问与最后一问 |
| `parsePrototypeMetadata(html)` | 返回体**只增** `geometry[].shot` / `geometry[].shotSha256`（可选）；`blocks` / `anchors` / `violations` 语义不变 |
| `parsePrototypeIndex(doc, reqId)` | 逐字不变 |
| `prototypeExemptOf(req, frontmatter)` | 逐字不变（豁免口径只有这一处） |
| `registeredPrototypesOf(req)` | 逐字不变（登记口径只有这一处） |
| `assertClauseCoverageGate(docs, req, tasks)` | **签名仍是三参**（既有测试锁死 `.length === 3`） |
| `contentGatesForMove(...)` | 唯一 async 入口；五处接线点不变 |
| `landPrototypeSkeleton(ports, req, opts)` | 签名不变；`reason` 值域不变（`not-ui` 分支保持不变） |

## 依赖注入 `serves: FR-4`

几何量证据校验需要"文件存在吗 / 摘要多少"两个能力。application 层**禁 `import node:`**，
故走注入（与 `DocsReader` 同形的窄面端口）：

```ts
export interface PrototypeEvidencePort {
  /** 工作区相对路径是否指向一个真实文件 */
  exists(relPath: string): boolean
  /** 该文件的 sha256（64 位小写十六进制）；读不出 → undefined */
  sha256Of(relPath: string): Promise<string | undefined>
}
```

**端口缺省（未装配）时的行为**：`observationEvidenceOf` 返回 `unverified` 并**不抛错**
——与 `prototype-skeleton` 的"端口缺失只告警不阻断"同一条纪律（落不下证据 ≠ 门禁拦死）。
生产实现由 `FileDocRepository` 一侧提供（`exists` 已有；`sha256Of` 新增）。
