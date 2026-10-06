---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 接口设计（REQ-261005105032-3b02）

> 契约源：`docs/requirements/REQ-261005105032-3b02/notes/design-brief.md`（§1~§9 钉死项 + **§10 待定项决议 #1~#44**）——命名 / 字段 / 错误码逐字照它。
> 需求源：`requirement.md`（FR-1~FR-11 / D-1~D-15）。§10 未列的仍不许自行发明：本份末节列出真·待定项。
> 边界：本份只定**接口形态**；产物模型的类型定义在 `architecture.md`，本份仅引用其接口。

## 接口总览 `serves: FR-1`

| # | 接口 | 形态 | 落点 | 服务条款 |
|---|---|---|---|---|
| 1 | `reqboard_submit(kind='prototype')` | 工具入参 + 返回体 + 产物元数据 | `src/tools/SubmitTool/`（分派表新增一项） | FR-2、FR-4 |
| 2 | 门禁错误码：内部码 + 传输码 | `GateFailure` 联合 + 映射表 | `internal/artifact-gates.ts`、`internal/gate-feedback.ts`、`use-cases/MoveRequirement.ts` | FR-1、FR-3、FR-4、FR-8 |
| 3 | 门禁函数签名（含裁定留痕读取） | TS 函数签名 | `internal/prototype-gates.ts`、`internal/decision-gates.ts` | FR-1、FR-3、FR-4、FR-8 |
| 4 | 脚本接口 R1~R4 + 自检 + 探针 | CLI（退出码 0 / 1 / 2） | `scripts/*.mts`、`scripts/template-render-map.json`、`package.json` | FR-4、FR-6、FR-10、FR-11 |
| 5 | RTM 触发点 `submit:prototype` | 触发点 + 载荷 + 刷新范围 | `internal/rtm-yaml.ts`、`vendor/reqboard/src/rtm/` | FR-5、FR-9 |
| 6 | 验收单项 `prototype-compare` / `decision-compare` | 判别联合新成员（带载荷） | `domain/workflow/AcceptanceSheetSpec.ts` | FR-7、FR-9 |
| 7 | 文档查询白名单（QueryDocs） | 路径白名单 + 客户端投影字段 | `application/query/QueryDocs.ts`、`client/views/panels/docs.ts` | FR-2 |
| 8 | HTTP API | **无新增**（理由见同名节） | — | FR-1 |

## 工具接口：reqboard_submit(kind='prototype') `serves: FR-2, FR-4`

**用途**：把 `prototypes/` 下的原型登记为 `kind=prototype` 的一等产物，并抽出锚点与几何量清单写进产物元数据。
**调用方**：agent（需求阶段交原型后）；看板侧不直接调，走既有确认门。

**接口定义**：
```typescript
type SubmitKind = 'requirement' | 'plan' | 'verification' | 'archive' | 'design' | 'prototype'

interface SubmitPrototypeInput {
  kind: 'prototype'
  /** 缺省 = 本窗口绑定需求 */
  requirement_id?: string
  /** 缺省 = 扫 docs/requirements/<REQ>/prototypes/*.html；传了只登记该份（仍走可打开性校验） */
  path?: string
}

/** §10 #41 / #49：产物元数据的**唯一**命名——`StageArtifact.prototypeMeta?: PrototypeMeta` */
interface PrototypeMeta {
  anchors: { fr: string; selector: string }[]
  geometry: {
    name: string; value: number; unit: 'px' | 'count' | 'ratio'
    at: { width: number; state: 'inflight' | 'terminal' }
    source?: 'prototype' | 'human'      // #8：缺省 'prototype'，人给的标 'human'
  }[]
}

/** 逐份登记态（磁盘 / 产物簿 / INDEX / 确认章 四源合成，与 kind=design 的 design_docs 同构） */
interface PrototypeDocStatus {
  name: string
  path: string
  on_disk: boolean
  registered: boolean
  confirmed: boolean          // #13：确认章为可选加强，门禁只要求「已登记」
  exempted?: string           // 有效豁免理由（front-matter prototype_exempt）
  authoritative: boolean      // INDEX「状态」列 === 'authoritative'
  superseded_by?: string      // INDEX「被取代于」列
  serves: string[]            // INDEX「服务条款」列声明的 FR（自然排序）
  anchors: string[]           // 抽到的 id="FR-N"（自然排序）
  geometry: string[]          // proto-geometry 的观测量**名**清单（不含值/阈值）
}

interface SubmitPrototypeOutput {
  success: boolean
  requirement_id: string
  /** 本次新登记条数（幂等命中不计数） */
  registered_count: number
  prototypes: PrototypeDocStatus[]
  /** 未登记/不可登记的原因（不谎报成功） */
  blockers?: string[]
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `kind` | `'prototype'` | 是 | 分派表新增键（`SUBMIT_KINDS` 同步） | — |
| `requirement_id` | string | 否 | 目标需求 | 本窗口绑定需求 |
| `path` | string | 否 | 单份原型；缺省扫 `docs/requirements/<REQ>/prototypes/` | 扫目录 |

**校验顺序（登记前一次性跑完，失败即拒并点名）**：

| # | 校验 | 判据 | 不通过时 |
|---|---|---|---|
| 1 | kind 合法 | `SUBMIT_KINDS` 含 `prototype` | schema 层 `invalid_input` |
| 2 | 需求可写 | 需求存在且本窗口有写席位（既有纪律） | `REQBOARD_NOT_FOUND` / 既有席位错误码 |
| 3 | 扫描范围 | `prototypes/` 存在且有 `.html`；旧目录 `prototype/*.html` 兼容识别 | `success=false` + `registered_count=0` + `prototype_missing`，并提示迁移到 `prototypes/` |
| 4 | 文件存在且可打开 | 逐份存在且可读（复用既有登记可打开性校验） | `prototype_missing`，`gaps` 点名路径 |
| 5 | INDEX 在场且权威唯一 | `prototypes/INDEX.md` 存在；表格「状态」列 `authoritative` **恰好一条** | `prototype_version_conflict`，`gaps` 点名两条 / 零条 |
| 6 | 引用一致 | `requirement.md`、`design/frontend.md` 里出现的原型路径 === INDEX 权威路径（`normalizeArtifactPath` 归一，§10 #2） | `prototype_version_conflict`，`gaps` 点名被引用的作废路径 |
| 7 | 锚点覆盖 | 权威原型含 INDEX「服务条款」列**每个** FR 的 `id="FR-N"` 区块 | `prototype_anchor_missing`，`gaps` 点名缺哪条 FR |
| 8 | geometry 块 | **恰好一块** `<!-- proto-geometry {json} -->`（多块即拒，§10 #4）；`unit ∈ {px,count,ratio}`、`at.state ∈ {inflight,terminal}`、`observations[].name` 块内唯一（§10 #5）；字段集闭合于 #41（**无阈值位**） | `prototype_anchor_missing`，点名块数 / 字段 / 重名 |
| 9 | 登记 | 同 `path` 已登记 → 跳过（幂等）；首次登记写 `prototypeMeta`；**登记只校验不改写 INDEX**（§10 #9） | — |

**幂等语义**：

| 情形 | 行为 |
|---|---|
| 同 path 已登记 | 不重复入簿，`registered_count` 不计数；该份 `registered=true` |
| 多份一次登记 | `registered_count` 只数本次新登记；`prototypes[]` 返回全部逐份态 |
| 骨架落盘 | 不存在才写，永不覆盖已写内容（既有纪律） |
| 目录不存在 | `registered_count=0` 且 `success=false`，如实说明（不谎报成功） |

**返回值说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | boolean | 全部校验通过并完成登记 = true |
| `requirement_id` | string | 实际作用的需求 |
| `registered_count` | number | 本次新登记条数（幂等命中不计数） |
| `prototypes` | `PrototypeDocStatus[]` | 逐份登记态（磁盘 / 产物簿 / INDEX / 确认章） |
| `blockers` | string[] | 未登记原因；无则省略 |

**异常情况**：

| 内部码 | 传输码（§10 #35） | 触发条件 |
|---|---|---|
| `prototype_missing` | `REQBOARD_MISSING_PROTOTYPE` | 目录或指定文件不存在、零 `.html` |
| `prototype_version_conflict` | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` | INDEX 缺失 / authoritative ≠ 1 / 引用 superseded |
| `prototype_anchor_missing` | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` | 锚点未覆盖 / geometry 多块或形状外字段 |
| `invalid_input` | `REQBOARD_INVALID_INPUT`（既有） | kind / path 非法 |

**配套接口（同批接线，形态照 §1 / §10）**：

| 接口 | 形态 | 说明 |
|---|---|---|
| 路径 → kind | `NAME_TO_KIND` 增 `/^prototypes\/.+\.html$/`、`/^prototype\/.+\.html$/` 与 `/^prototypes\/INDEX\.md$/` → `'prototype'` | INDEX 也是 prototype，不落 notes（§10 #1） |
| 阶段归属 | `stageForKind('prototype')` = `'brainstorming'`（显式 case） | 禁止 default→currentStage 误归阶段（§10 #3） |
| 条件必交 | `DELTA.conditionalStageArtifacts = [{ stage:'brainstorming', kind:'prototype', side:'frontend' }]` | feature/refactor 且 sides 含 frontend 时生效 |
| 豁免 | front-matter `prototype_exempt: <理由>` | 理由非空 **且** requirement 已落章（G1 已确认）；登记/推进时写需求评论 `[豁免] <理由>`（§10 #7）；豁免必须在 requirement 的 D-x 里有一条裁定记录（§10 #10） |
| 中文名 | `src/shared/artifact-labels.ts` 配「原型」；`Record<ArtifactKind, DocPanelKind>` 穷尽性同步 | 否则 `artifact-labels` 中文名护栏用例拦（§10 #33） |
| 命名统一 | 产物元数据只用 `StageArtifact.prototypeMeta`（#41 形状） | 其他文档里内联的 `anchors:{fr,selector}[]` 形状改为指向 #41，不另起字段名（§10 #49） |
| 台账契约口径 | `StageArtifact.prototypeMeta?`、`TaskRecord.prototypeRefs?` / `decisionRefs?` 是分片**新可选键** | 口径 = **加性（additive）变更、零迁移**（不写「无 schema 变更」，§10 #50） |

**使用示例**：
```typescript
const out = await tools.reqboard_submit({ kind: 'prototype', requirement_id: 'REQ-261005105032-3b02' })
// → { success: true, registered_count: 1,
//     prototypes: [{ name: 'detail.html', authoritative: true, serves: ['FR-4'],
//                    anchors: ['FR-4'], geometry: ['tabsTop'], registered: true, confirmed: false }] }
```

## 门禁失败信封与错误码 `serves: FR-1, FR-3, FR-4, FR-8`

**信封形态**（复用既有 `envelope()`，三要素缺一不可）：
```typescript
interface GateFailure {
  code: PrototypeGateCode | DecisionGateCode        // 追加进既有联合（artifact-gates.ts）
  kind?: ArtifactKind
  message: string      // envelope({ lead?, what, why, how }) 拼装
  gaps?: string[]      // 结构化缺口：路径 / FR / 条目编号 / 块数
}

type PrototypeGateCode =
  | 'prototype_missing' | 'prototype_version_conflict' | 'prototype_anchor_missing'
type DecisionGateCode = 'decision_log_missing' | 'decision_entry_invalid'
```
拼接格式逐字沿用 `gate-feedback.ts`：`<lead><what> —— <why>。补齐：<how>`。
机械条件：每条 `how` 必须命中 `GATE_HOW_ANCHOR`；该正则按 §10 #40 扩为 `reqboard_[a-z_]+ | templates/ | design_exempt | prototype_exempt | decision_*`（实测 `prototype_exempt` 单独出现不命中，故必须扩）。
逐字措辞不在设计里定（§10 #11）：设计只定 what/why/how 的**模板与必含 token**（文件路径 + 可执行命令）。

**错误码总表（内部码 → 传输码 → gaps）**：

| 内部码 | 传输码（§10 #35） | 触发门禁 | 典型 `gaps` |
|---|---|---|---|
| `prototype_missing` | `REQBOARD_MISSING_PROTOTYPE` | 存在门 | `['prototypes/ 内 0 份 .html', '无已登记 kind=prototype 产物']` |
| `prototype_version_conflict` | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` | 版本门 | `['authoritative ×2：detail.html、detail-v2.html']` |
| `prototype_anchor_missing` | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` | 锚点门 | `['detail.html 缺 id="FR-4"']`、`['geometry 块 ×2']`、`['形状外字段：threshold']` |
| `decision_log_missing` | `REQBOARD_DECISION_LOG_MISSING` | 裁定门 | `['requirement.md 缺「讨论与裁定记录（D-x）」节']` |
| `decision_entry_invalid` | `REQBOARD_DECISION_ENTRY_INVALID` | 裁定门 | `['D-3（缺原话来源）', 'D-5（影响 FR 未命中真实条款）']` |
| `verification_prototype_compare_missing` | `REQBOARD_VERIFICATION_INCOMPLETE` | 验收提交 | `['缺「与原型对照截图（含差异说明）」项']`（§10 #38） |
| `stage_gate_overdue` | `REQBOARD_STAGE_GATE_OVERDUE` | 阶段门时序 | `['设计交完：dangling 未转绿']`（§10 #39） |

**传输码映射实现**：`MoveRequirement.ts` 的 `transportCodeOf` 由隐式推导改为**显式映射表**；未知内部码**原样透传**，不静默降级为 `MISSING_ARTIFACT`（§10 #35）。

**文案模板（what / why / how 三段；`how` 必含可执行锚点）**：

**① `prototype_missing`**（FR-1）
- **what**：需求 `REQ-xxx` 声明了 frontend 端侧，但产物簿无已登记的 `kind=prototype` 产物。
- **why**：UI 需求的原型是需求阶段必交产物，未交不得进入设计。
- **how**：把原型落到 `docs/requirements/REQ-xxx/prototypes/`（骨架见 `templates/brainstorming/prototype.html`），在 `prototypes/INDEX.md` 标出唯一权威版本，再调 `reqboard_submit(kind=prototype, requirement_id="REQ-xxx")`；确需豁免时写 `prototype_exempt: <理由>` 并落一条 D-x 裁定，经人确认 requirement 产物。

**② `prototype_version_conflict`**（FR-3）形态 A：权威版本不唯一
- **what**：`prototypes/INDEX.md` 的权威版本不唯一（`detail.html`、`detail-v2.html` 两条 `authoritative`）。
- **why**：原型必须有且只有一个权威版本；多版并存、或引用被作废版本即拒。
- **how**：在 `docs/requirements/REQ-xxx/prototypes/INDEX.md` 把被取代那份「状态」改为 `superseded`、「被取代于」列填权威路径，再调 `reqboard_submit(kind=prototype, requirement_id="REQ-xxx")`。

**②b `prototype_version_conflict`**（FR-3）形态 B：文档引用被作废版本
- **what**：`requirement.md` 引用 `prototypes/detail-v1.html`，而 INDEX 该行状态为 `superseded`。
- **how**：把 `requirement.md` / `design/frontend.md` 的引用改为 INDEX 的权威路径后调 `reqboard_move(requirement_id="REQ-xxx", to="design")`。

**③ `prototype_anchor_missing`**（FR-4）形态 A：FR 锚点未覆盖
- **what**：权威原型 `prototypes/detail.html` 缺 `id="FR-4"` 区块（INDEX「服务条款」列声明了 FR-4）。
- **why**：原型必须可判定——锚点须覆盖声明条款；原型只声明观测量名与实测值，阈值由设计阶段定死。
- **how**：按 `templates/brainstorming/prototype.html` 补 `<section id="FR-4">` 与单块 `<!-- proto-geometry {"observations":[…]} -->`，再调 `reqboard_submit(kind=prototype, requirement_id="REQ-xxx")`。

**③b `prototype_anchor_missing`**（FR-4）形态 B：geometry 块不合法
- **what**：`proto-geometry` 出现两块（或含形状外字段 `threshold`）。
- **how**：合并为**恰好一块**且只留 `name/value/unit/at/source` 字段（阈值改由设计阶段 `frontend.md` 定死），再调 `reqboard_submit(kind=prototype, requirement_id="REQ-xxx")`。

**④ `decision_log_missing`**（FR-8）
- **what**：`requirement.md` 无「讨论与裁定记录（D-x）」节，而会话里有人的补充/指正留痕。
- **why**：讨论裁定必须逐条落账（祈使 / 纠正 / 补充三类算裁定）；有留痕而该节为空即拒。
- **how**：按 `templates/brainstorming/feature.md` 补该节并逐条落五要素（编号 / 原话来源 / 裁定 / 影响 FR / 判据）；确实无裁定写「本节无裁定」，再调 `reqboard_move(requirement_id="REQ-xxx", to="design")`。

**⑤ `decision_entry_invalid`**（FR-8）
- **what**：裁定记录 `D-3` 行无效——缺原话来源（或 `影响 FR` 未命中真实条款）。
- **why**：五要素缺一即无效；只有概括句、无可核验来源的条目一律视为无效。
- **how**：补 `D-3` 行的原话来源（会话消息 id 或时间戳 + 原话）与 `影响 FR`（须命中 FR-1~FR-11），再调 `reqboard_move(requirement_id="REQ-xxx", to="design")`。

## 门禁函数签名与四条转移路径 `serves: FR-1, FR-3, FR-4, FR-8`

**模块划分（§10 #16 / #22）**：

| 模块 | 内容 | 尺寸约束 |
|---|---|---|
| `src/application/internal/prototype-gates.ts` | 存在门 / 版本门 / 锚点门 | 单文件 ≤400 行；只做取数 + 组装，判定下沉纯函数 |
| `src/application/internal/decision-gates.ts` | 裁定门 + 裁定留痕读取 | 同上 |

**函数签名**：
```typescript
import type { RequirementRecord } from '../../shared/protocol.js'
import type { DocsReader } from './content-gates.js'
import type { GateFailure } from './artifact-gates.js'

// prototype-gates.ts
export async function checkPrototypePresenceGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>
export async function checkPrototypeVersionGate (docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>
export async function checkPrototypeAnchorsGate (docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>

// decision-gates.ts
export async function checkDecisionLogGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>

/** §10 #20：会话裁定留痕判据——只取 source.kind === 'user'，只扫最近 N 条（默认 200），跑祈使词表 */
export async function hasDecisionTrace(
  sessionProbe: SessionProbe, req: RequirementRecord, opts?: { limit?: number },
): Promise<{ hit: boolean; sample?: string }>

// content-gate-wiring.ts —— §10 #46：本需求**唯一**的 async 门禁入口
export async function contentGatesForMove(
  docs: DocsReader, req: RequirementRecord, from: RequirementStatus, to: RequirementStatus,
): Promise<GateFailure | undefined>
```
`undefined` = 通过。返回值统一 `Promise`：`DocsReader.read` 是 Promise 端口（与既有 `design-gates.ts` 同款）。
裁定门只判「存在留痕即要求非空」，**不判裁定抽取的召回率**（如实口径，§10 #23；召回率由 G2 人评审承担）。

**接线口径（§10 #22 / #46，钉死）**：

| 项 | 决定 |
|---|---|
| 同步单点 `assertArtifactGates(req, from, to)` | **不动**：保持同步，职责仍是产物存在 / 确认门 |
| 新 async 入口 | **唯一** `contentGatesForMove(docs, req, from, to)`（放 `content-gate-wiring.ts`），内部按转移分派到原型三门 / 裁定门 |
| 分派规则 | `brainstorming → design`：存在门 → 版本门 → 锚点门 → 裁定门（顺序短路，返回首个失败）；其余转移无适用门 → 返回 `undefined` |
| 既有 G2 / 完整性门 | **不并入、不合并**（避免把本需求扩成重构）；各路径原调用点原样保留 |
| 调用顺序（四条路径统一） | ① 同步 `assertArtifactGates` → ② `contentGatesForMove`（新） → ③ 既有 G2 / 完整性门（不动） → 写盘 |
| 回归用例 | 同时锁 **G2 与新门**（缺任一即红）；未来若要收敛成单一 async 入口，另立项 |

**各门禁的判据与生效条件**：

| 门禁 | 拒绝条件 | 不生效（放行） |
|---|---|---|
| 存在门 | sides 含 frontend 且无已登记 prototype，且无有效 `prototype_exempt` | sides 不含 frontend；非 feature/refactor；豁免理由非空 **且** requirement 已落章；存量需求 `artifacts` 空/undefined；`to='canceled'` 或回退方向 |
| 版本门 | INDEX 缺失 / `authoritative` ≠ 1 / 文档引用指向 `superseded` | 无 prototype 产物且无原型目录（属存在门职责） |
| 锚点门 | 权威原型缺 `id="FR-N"` 覆盖 / geometry 块 ≠ 1 / 形状外字段 | 同上 |
| 裁定门 | 缺节 / 空节（而 `hasDecisionTrace` 命中）/ 条目五要素不全 | 非 feature 需求（D-12：该节仅 feature 模板） |

**四条转移路径调用点清单**（缺任一即后门）：

| # | 调用点 | 触发动作 | 调用顺序（§10 #46 钉死） | 失败表现 |
|---|---|---|---|---|
| 1 | `use-cases/MoveRequirement.ts` | 会话语义 `reqboard_move` | ① `assertArtifactGates`（同步，`preGate`） → ② `contentGatesForMove` → ③ 既有完整性门 → 写盘 | 抛 `GateFailure`；状态零变化；`transportCodeOf` 映射传输码 |
| 2 | `use-cases/AskConfirm.ts` | 弹框确认后的自动推进块 | ① 同步门（`earlyGate` 同点） → ② `contentGatesForMove` → ③ 既有门原样保留 | 不推进；回执注明「未推进：<message>」 |
| 3 | `http/routers/requirements.ts` | 看板移动端点 `POST /dashboard/api/reqboard/req/move` | ① `assertArtifactGates` → ② `contentGatesForMove` → ③ `g2CompletenessFailure`（**不并入**） | `fail()` 400 信封 + `code` |
| 4 | `use-cases/ConfirmArtifact.ts`（经 `internal/confirm-settle.ts` 推进块） | 看板确认产物后的自动推进 | ① 同步门 → ② `contentGatesForMove` → ③ 既有 `designGateFailure` 兜底 | `advanceNote` 追加「未推进」+ `gateFailure` 字段 |

**回归锁死**：一条用例对四条路径**各断言一次**，且**同时锁 G2 与新门**（缺任一即红）——这是「门禁不再丢」的机械保证。

## 脚本接口（R1~R4、自检与探针） `serves: FR-4, FR-6, FR-10, FR-11`

**脚本清单与判据**（§6 逐字 + §10 修订）：

| 编号 | 脚本 | 用途 | 判据 |
|---|---|---|---|
| R1 | `scripts/template-gate-probe.mts` | 模板产物必过门禁 | 渲染 `templates/**/*.md` 占位符 → `missingCategoryDocs` + `checkRequirementDocFormatGate` + `checkDesignSectionsHaveServes` = 0 缺口；渲染取值来自 `scripts/template-render-map.json`（如 `{{TASK_ID}}`→`t-000000`、`{{DESIGN_SERVES}}`→`FR-1`）；**未在映射表内的占位符 → exit 1 并点名**（§10 #26） |
| R2 | `scripts/doc-section-parity.mts` | 节名集合双向一致 | 门禁节名集合（BASE+DELTA）与模板 H2 集合**双向相等**（体现「该节仅 feature」） |
| R3 | `scripts/prompt-path-probe.mts` | 提示词路径可达 | 扫 `src/domain/prompt/fragments/**` + `round-state.ts` 的路径 token → 必须存在或属已知产物名 |
| R4 | `package.json` | 脚本接线 | 增 `prompts:check`（inline + check 两条脚本）；并入提交前清单 |
| 自检 | `scripts/req-doc-validate.mts` | 一条命令跑完全套文档校验 | 9 项：必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling；并入 R1 |
| 探针 | `scripts/req-*-probe.mts`（既有族升级，非新增） | 几何量硬判据 | 诊断行一律升为硬判据；**显式传 `--window-size` 并回读 PNG 真实像素**；无 Chrome → **exit 2**（不许静默跳过）；逆验证改坏必红（§10 #25） |

**口径（§10 #17）**：本需求只有 **4 个新脚本文件** + `package.json` 接线，**没有第五个脚本**。

**用法与退出码语义**：

| 退出码 | 语义 | 输出要点 |
|---|---|---|
| `0` | 判据全过（无缺口） | 逐判据 `OK` + 汇总 |
| `1` | **判据失败**（有缺口）：逐条点名对象与缺口 | 失败行 + 修复提示 |
| `2` | **用法 / 环境错误**（工作区根不可解析、`tsx` 不可用、无 Chrome、参数非法） | 一行原因 + 一行修复建议 |

用法：`tsx scripts/template-gate-probe.mts`（与既有 `kb:build` 同款跑法）；`.mts` 一律经 `tsx` 执行，不直跑 `node`。

**输出格式（§10 #47）**：

| 模式 | 形态 | 用途 |
|---|---|---|
| 默认（人类可读） | 一行一条：`[<script>] OK\|FAIL <判据> <对象> → <缺口>`；末尾 `缺口 {n}；exit {0\|1}` | 人跑、排错 |
| `--json` | 机器可读结构（判据名 / 对象 / 缺口数组 / 计数），供 CI 与 `req-doc-validate.mts` 消费 | 自动链、CI |

退出码语义两种模式**不变**（0 通过 / 1 失败 / 2 环境不可用）。

| 行型（默认模式） | 例 |
|---|---|
| 通过 | `[template-gate-probe] OK 模板门禁（6 份）` |
| 失败 | `[doc-section-parity] FAIL 节名集合 requirement.md → 模板多一节「讨论与裁定记录（D-x）」` |
| 汇总 | `[req-doc-validate] 缺口 2；exit 1` |
| 环境 | `[template-gate-probe] ERROR（用法或环境，退出码 2）：工作区根不可解析` |

**`pnpm prompts:check` 的接线**：
```json
{ "scripts": { "prompts:check": "node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs" } }
```
- `inline` 只重生成产物（构建期内联，运行时不读盘）；`check` 是判据门（源与产物不一致 → `exit 1`）。
- 退出码 = 两条的与（inline 失败即短路）；该命令必须出现在提交前清单，规范页由 `kb-conventions-sync` 生成，**不得手改生成页**。

**阶段门时序（`StageGateTimeline`，FR-11；逾期码 `stage_gate_overdue` / `REQBOARD_STAGE_GATE_OVERDUE`，§10 #39）**：

| 时点 | 必须转绿的门 | 逾期后果 |
|---|---|---|
| 设计交完 | 必填节 + 格式门 + serves + 无 dangling | 由该转移的门禁拒绝（`stage_gate_overdue`） |
| 拆分落库 | 覆盖对照（FR → 卡）+ UI 卡原型锚点 | 同上 |
| 实施收尾（进验收前） | E2E 覆盖 + 三级追溯 | 同上 |

## RTM 触发点：submit:prototype `serves: FR-5, FR-9`

**触发点扩展**：
```typescript
type RTMTrigger = /* 既有 9 个 */
  | 'submit:prototype'                      // 登记原型产物即刷新
/** §10 #48：载荷携带本次登记的原型路径 */
interface SubmitPrototypePayload { paths: string[] }
```

| 项 | 口径 |
|---|---|
| 触发时机 | `reqboard_submit(kind='prototype')` 登记成功之后（与既有 6 个触发点同构） |
| 载荷 | `{ paths: string[] }`（本次登记的原型路径）；**生成器仍以台账为事实源**，载荷只用于增量刷新与留痕，**不当唯一来源**（§10 #48） |
| 刷新文件 | `rtm-brainstorming.yml`、`rtm-lifecycle.yml` |
| 返回值 | `RTMTriggerResult{ ok, trigger, requirement_id, files }`；`coverage` 为空（与 `submit:requirement` 同款） |
| 生成内容 | `outputs` 增 `prototypes`（path / authoritative / superseded_by / serves / anchors / geometry）与 `decisions`（D-x：原话来源 / 裁定 / 影响 FR / 判据）两节 |
| 设计侧引用 | 设计章节 `serves` 可指原型锚点与 D-x；**锚点走 `protoRefs`，不进 serves**：serves 抽取前先 `stripPrototypeAnchors(text)`，把 `\S+#FR-\d+` 替换为固定 token **`<proto-anchor>`**（§10 #6） |
| 覆盖度来源 | 任务卡 `TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（与既有 `requirementRefs` 命名对齐，§10 #36） |
| `rtm_version` | 目标值 **`"2.0"`**（键是 `metadata.rtm_version`，与写入计数 `metadata.version` 不是同一个键，§10 #18 / #42） |

**兼容与失败语义**：

| 项 | 口径 |
|---|---|
| 失败 | 结构化返回 + `console.warn`，**不打断**登记主流程（沿用既有纪律） |
| 旧文件缺 `prototypes` / `decisions` 节 | 视为**未采集（pending）**，不判损坏；未知 key 忽略不报错（存量 66 条读取不报错） |
| UI 需求缺 `prototypes` 节 | `rtm-health.ts` 判**不健康**并点名，但适用性判据收紧：只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince`（插件配置常量，默认规则上线日）的需求才判；存量一律 `exempted: legacy` 如实报告（§10 #19） |
| `expectedRTMFiles()` | 不变（仍 7 份） |
| 台账 / RTM 契约口径（§10 #50） | 新增节与 `prototypeMeta` / `prototypeRefs` / `decisionRefs` 均为**加性（additive）变更、零迁移**——不写「无 schema 变更」 |

## 验收单项接口：prototype-compare / decision-compare `serves: FR-7, FR-9`

**判别联合扩展**（两个新成员都带载荷，§10 #14 / #37）：
```typescript
export type VerificationItemSource =
  | { kind: 'requirement' }
  | { kind: 'task'; taskId: string }
  | { kind: 'prototype-compare'; prototypePath: string }
  | { kind: 'decision-compare'; decisionIds: string[] }
```
**连带必改三处 `taskId` 分支**（否则静默退化成 `undefined` / `fr_id='UNKNOWN'`，§10 #31）：
`use-cases/AcceptSheet.ts`（弹框 header）、`internal/accept-sheet-rtm-integration.ts`、`internal/status-rtm-integration.ts`。

**出现条件**：

| 情形 | `prototype-compare` | `decision-compare` |
|---|---|---|
| feature/refactor 且 `sides` 含 frontend，且存在已登记 prototype | **必出现** | 该需求有 D-x 条目时出现 |
| 同上，但 `prototype_exempt` 已批准生效（§10 #45） | **不强制**：验收单改为渲染一行**豁免说明**「本需求已豁免原型（理由：…）」，**不阻塞**验收材料提交 | 同上规则 |
| `sides` 不含 frontend | 不出现 | 有 D-x 条目时出现 |
| 非 feature/refactor | 不出现 | 不出现（该节仅 feature 模板，D-12） |

**项形状**：

| 字段 | `prototype-compare` | `decision-compare` |
|---|---|---|
| `id` | 沿用 `buildSheet` 既有编号生成 | 同左 |
| `source` | `{ kind:'prototype-compare', prototypePath:'prototypes/detail.html' }` | `{ kind:'decision-compare', decisionIds:['D-3','D-5'] }` |
| `criterion` | 「与原型对照截图（含差异说明）」——**逐字**照 §9 | 「与裁定对照（逐条说明如何落实）」 |
| `evidence` | 截图路径 + 差异说明 | 每条 D-x 的落实证据（命令 / 输出摘要 / 文件） |
| `needsHuman` / `humanReason` | true / 「界面视觉需人对照权威原型」 | 沿用既有「无法自动验证的项必须显式标注理由」机制 |
| 追溯 | 每项可追 `FR-x` / `D-x`（FR-9） | 同左，可直接追到 `decisionIds` |

**缺项即拒（§10 #27 / #38 / #45）**：提交验收材料时，UI 需求缺 `prototype-compare` 项（或该项 `evidence` 为空）、有 D-x 却缺 `decision-compare` 项 → 拒。
内部码 `verification_prototype_compare_missing`，传输码 `REQBOARD_VERIFICATION_INCOMPLETE`；`gaps` 点名缺哪一项。
**豁免例外（§10 #45）**：已批准 `prototype_exempt` 的需求**不强制**该项，只渲染豁免说明行，**不阻塞**提交。
本份即 FR-7 的设计侧落点：**判据 = 缺该项即提交被拒**（需求侧是否补一条需求级验收标准由用户决定）。

## 文档查询接口（QueryDocs 白名单） `serves: FR-2`

| 位置 | 接口变更 | 判据 |
|---|---|---|
| `src/application/query/QueryDocs.ts` | 交付物白名单增 `prototypes/*.html` 与 `prototypes/INDEX.md`（均 kind=`prototype`） | 读 INDEX 后投影 `DocPanelEntry` 增**可选** `prototypeRole?: 'authoritative' \| 'superseded'` 与 `supersededBy?: string`（缺省不注入，旧形状不变，§10 #32） |
| `src/client/views/panels/docs.ts` | 原型在确定文档块内**单列**（`DocPanelKind` 增 `'prototype'`） | 原型行**必须保留 `data-doc-row="1"`**；不新增弹窗（§10 #30） |
| 恒等式口径（§10 #34） | `documents` 中来自台账的行数 + Σ`discovered.count` === `artifacts.length` | 既有「`data-doc-row` 条数 === `documents.length`」断言**不许破** |
| 兼容口径（§10 #50） | `DocPanelEntry.prototypeRole?` / `supersededBy?` 为新可选键 | **加性（additive）变更、零迁移**；缺省不注入，旧读取器不受影响 |

## HTTP API `serves: FR-1`

**结论：无新增 HTTP API**——不新增路由、不新增方法、不新增路径。

| # | 理由 | 说明 |
|---|---|---|
| 1 | 门禁不新开入口 | 四条转移路径中只有 1 条是 HTTP：既有 `POST /dashboard/api/reqboard/req/move`；看板确认走既有 `POST /dashboard/api/reqboard/req/artifact/confirm` |
| 2 | 原型取阅复用既有文件端点 | `GET /dashboard/api/reqboard/file?path=`（不新增下载 / 预览端点） |
| 3 | 响应体形状不变 | 失败仍是 `{ success:false, error, code?, hint? }` |
| 4 | **状态码映射表必须逐条登记**（§10 #43） | `src/http/envelope.ts` 的 `STATUS_BY_CODE` 为本需求**每个新码**（内部码与传输码成对）补 **400**；漏登记按 `statusForCode` **如实落 500**，看板会显示成「服务器坏了」，故列为硬约束 + 用例 |

**既有端点行为变更（非新增）**：

| 端点 | 变更 | 状态码 |
|---|---|---|
| `POST /req/move` | 转移前多跑原型三门 + 裁定门（经 §10 #46 的 `contentGatesForMove`，**非**内联同步单点），失败即拒 | 400 + `code` ∈ 新码/新传输码 |
| `POST /req/artifact/confirm` | 确认后自动推进块同批跑同一门禁 | 200（推进成功）/ 200 带「未推进」note（门禁拦下） |

## 关键决策与取舍 `serves: FR-2, FR-8, FR-11`

（主体写进 `architecture.md` 的同名节；本份只列与本份主题相关的取舍。）

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 原型产物形态 | 复用 `design`（与 `frontend.md` 合并） | 独立 `kind='prototype'`（INDEX 亦同 kind） | 生命周期不同：缺原型与缺设计要两条不同消息，人才知道补什么 |
| 锚点算不算 FR 引用 | 锚点即引用（省事） | **锚点单列 `protoRefs`**；抽取前 `stripPrototypeAnchors` → `<proto-anchor>` | 实测 `collectIds('prototypes/x.html#FR-4')` 返回 `['FR-4']`，混算会刷出虚高覆盖度 |
| 门禁组装方式 | 新增聚合函数 `assertPrototypeGates` / 改同步单点 | **不动**同步单点；新增**唯一** async helper `contentGatesForMove(docs, req, from, to)`，四路径在同步门之后调用 | 同步单点职责（产物存在/确认）不该被 async 读盘污染；只有一个新 async 入口，就不存在"某路径漏门"（§10 #22 / #46） |
| 裁定门放在哪一步 | 只在验收时检查 | `brainstorming → design` 就卡 | 验收才发现 = 白干一轮；且同阶段同一道门一次钉住 |
| 传输码映射 | 隐式推导 / 未知码降级为 `MISSING_ARTIFACT` | **显式映射表** + 未知码原样透传 | 降级会把「缺原型」伪装成「缺产物」，人拿不到补齐命令（§10 #35） |
| 新错误码映射 | 让未登记码落 500 | `STATUS_BY_CODE` 逐条补 400 | 500 让人以为服务器坏了，实际是流程问题（§10 #43） |

## 技术方案与亮点 `serves: FR-10`

| 项 | 内容 |
|---|---|
| 复用而非新造 | 信封 `envelope()`、可打开性校验、条件必交策略、产物登记幂等、`tsx` 脚本跑法全部沿用既有实现 |
| 单点收口 | 错误文案只在 `gate-feedback.ts` 拼；判定只在 `prototype-gates.ts` / `decision-gates.ts` 组装，纯函数下沉 |
| 可核验指向 | 每个接口都能指到文件 / 命令：新码指 `gate-feedback-envelope` 用例，脚本指 `pnpm prompts:check`，路径 token 指 R3，占位符指 `template-render-map.json` |
| 不新增依赖 | 原型元数据用正则抽注释块（`<!-- proto-geometry {json} -->`），不引 HTML 解析库、不引视觉库 |
| 与常规做法的差异 | 常规「设计稿驱动」靠评审会；本方案把原型变成**产物 + 判据**，让门禁与探针替人做第一轮比对 |

## 待定项（已全部拍板，本份无遗留） `serves: FR-10, FR-11`

本份原有 4 处「待定（需补充 brief）」已由 §10 拍板，全部替换为定论：

| 原待定项 | 结论 | 落点 |
|---|---|---|
| 已批准 `prototype_exempt` 的需求是否仍强制 `prototype-compare` 项 | **不强制**（批准不做原型 = 无原型可对照）：渲染豁免说明行、不阻塞提交（§10 #45） | §验收单项接口（出现条件表 + 缺项即拒的豁免例外） |
| 三个原型门需 `DocsReader`/async，同步单点不取 docs，怎么接 | **不动同步单点**；新增唯一 async helper `contentGatesForMove(docs, req, from, to)`；不合并既有 G2；四路径回归同时锁 G2 与新门（§10 #46） | §门禁函数签名与四条转移路径 |
| 4 个新脚本是否提供 `--json` | **提供**：默认人类可读，`--json` 供 CI 与 `req-doc-validate.mts` 消费；退出码 0/1/2 语义不变（§10 #47） | §脚本接口（输出格式） |
| RTM `submit:prototype` 载荷是否携带路径 | **携带 `paths: string[]`**；生成器仍以台账为事实源，载荷只用于增量刷新与留痕（§10 #48） | §RTM 触发点（触发点扩展 + 载荷行） |

另两条本份已对齐：产物元数据命名统一（§10 #49，只用 `StageArtifact.prototypeMeta`）、台账新可选键口径（§10 #50，加性变更 / 零迁移）。
§10 未列之处仍不许自行发明；若后续发现新的未定点，按同款格式追加到本表并回报。
