---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 后端设计（REQ-261005105032-3b02）

> 后端只做四件事：**产物身份**（kind=prototype）、**门禁单点**（四条转移路径同一份判定）、
> **锚点抽取**（正则，不引 HTML/DOM 解析库）、**追溯刷新**（RTM 两节 + 一维覆盖度）。
> 契约源：`notes/design-brief.md` 第 1~5 节 + **§10 待定项决议**（文中 `#N` 即该表编号）。
> 边界：不新增数据表、不改既有必填节与产物语义、不追溯存量。

## 服务与接口实现 `serves: FR-1, FR-2, FR-3, FR-4, FR-6, FR-7, FR-8, FR-9`

| 编号 | 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 | serves |
|---|---|---|---|---|---|---|---|---|
| S-1 | 函数 | `checkPrototypePresenceGate` | UI 需求缺已登记 prototype 且无有效豁免则拒（`prototype_missing`） | `docs (DocsReader)`, `req (RequirementRecord)` | `GateFailure` 或 `undefined`（通过） | 四条转移路径统一门 | S-8, S-9, `STAGE_ARTIFACT_REQUIREMENTS` | FR-1 |
| S-2 | 函数 | `checkPrototypeVersionGate` | 核 INDEX 权威唯一 + 文档引用一致性（`prototype_version_conflict`） | `docs`, `req` | `GateFailure` 或 `undefined` | 四条转移路径统一门 | S-4, `parseDocument`（INDEX 表格） | FR-3 |
| S-3 | 函数 | `checkPrototypeAnchorsGate` | 核权威原型锚点覆盖 / geometry 块存在 / geometry 无阈值（`prototype_anchor_missing`） | `docs`, `req` | `GateFailure` 或 `undefined` | 四条转移路径统一门 | S-4, INDEX 的「服务条款」列 | FR-4 |
| S-4 | 函数 | `parsePrototypeMetadata` | 纯正则抽 `id="FR-N"` 锚点与 `proto-geometry` 注释 JSON | `html (string)` | `{ anchors: {fr,selector}[], geometry: Observation[], blocks: number, parseError?: string }` | S-2, S-3, S-7 | 无（零 IO、无第三方依赖） | FR-4 |
| S-5 | 函数 | `checkDecisionLogGate` | 裁定记录门：缺节/空节 + 有留痕 → `decision_log_missing`；条目无效 → `decision_entry_invalid` | `docs`, `req`, `hasDecisionTrace (boolean)`（来源见 #20） | `GateFailure` 或 `undefined`（`gaps` 点名条目编号） | 四条转移路径统一门 + `submit:requirement` 预检 | 模块 `internal/decision-gates.ts`（#16）、`parseDocument`, `extractClauseDefinitions` | FR-8 |
| S-6 | 函数 | `stripPrototypeAnchors` | 把 `\S+#FR-\d+` 形态替换为固定占位符 `<proto-anchor>`（#6），防锚点被算成 serves | `text (string)` | `text (string，锚点已替换为 `<proto-anchor>`)` | `extractServesFrom` / `checkClauseCoverage` 的调用点 | 无（纯函数、零 IO） | FR-11 |
| S-7 | 服务 | `submitPrototypeArtifact` | `reqboard_submit(kind=prototype)` 服务端编排：可打开性校验 → 登记 → 抽锚点写元数据 → 触发 RTM | `deps`, `args {path, summary}`, `exec` | `{ registered: boolean, artifact: StageArtifact, anchors, geometry }` | agent 工具 `reqboard_submit` | `assertArtifactOpenable`, `registerArtifact`, `syncRTMYaml('submit:prototype')` | FR-2 |
| S-8 | 函数 | `conditionalStageArtifactsFor` | 按 category + sides 给出条件必交的阶段必备产物（新档 `{stage:'brainstorming', kind:'prototype', side:'frontend'}`） | `category (string)`, `sides (string[])` | `{ stage: StageKey, kind: ArtifactKind, side }[]`（未命中 → `[]`） | S-1, `assertArtifactGates` | `CATEGORY_DELTAS`（feature / refactor 两条） | FR-1, FR-2 |
| S-9 | 函数 | `prototypeExemptOf` | 判豁免是否生效：理由非空 **且** requirement 产物已落章 | `req`, `frontmatter` | `{ active: boolean, reason: string }` | S-1 | `frontmatterList` 同族解析（`prototype_exempt`） | FR-1 |
| S-10 | 常量 | `StageGateTimeline` | 三阶段各自必须转绿的门清单（设计交完 / 拆分落库 / 实施收尾） | 无 | 常量表 | 三阶段转移门禁、`scripts/req-doc-validate.mts` | S-6、覆盖度检查器 | FR-11 |
| S-11 | 服务 | `syncRTMYaml(trigger)` | 触发点 `submit:prototype` 刷新 `rtm-brainstorming.yml`（含 `prototypes` / `decisions` 两节）；载荷带 `paths: string[]`（#48） | `root`, `snapshot`, `reqId`, `trigger`, `payload { paths?: string[] }` | `RTMTriggerResult { ok, files, error? }` | S-7、`submit:requirement` | `RTMGenerator`（vendor）、`rtm-health` | FR-5, FR-9 |
| S-12 | 接口 | `handleReqMove`（`POST .../req/move`） | 看板移动端点：同步预检 + async helper + mutate 内复查 | `body {id, to, actor, reason, sessionId?}` | `ok` 信封 或 `fail` 信封（含 `code`） | 看板拖拽 | S-15, S-1~S-5, `fail()` | FR-1 |
| S-13 | 函数 | `buildSubtaskPrompt`（扩展） | UI 卡提示词带原型路径 + 本卡锚点；所有卡带本卡关联 D-x 原话 | `parent (TaskRecord)`, `subtask (TaskRecord)`, `label`, `workspaceRoot?` | `prompt (string)`（新增三个小节标题，见 #12） | `ExecuteTask` 单卡 / 批量两个调用点 | `TaskRecord.prototypeRefs` / `decisionRefs`（#36）、S-2 的权威路径 | FR-6, FR-9 |
| S-14 | 服务 | `AcceptSheet` / `VerificationItemSource`（扩展） | 验收单项新增两个来源 `prototype-compare` / `decision-compare`（#14/#37），UI 需求必出现；提交验收材料缺该项即拒（#38）——**已批准 `prototype_exempt` 的需求不强制该项**（#45） | `req`, `tasks`, `prototypeRefs` | 验收单 items（含两类对照项；豁免需求为一行豁免说明） | 验收单弹框 / `SubmitVerification` | `AcceptanceSheetSpec`、三处 source 分支（#31）、S-2 的权威路径 | FR-7 |
| S-15 | 函数 | `contentGatesForMove(docs, req, from, to)` | **唯一** async 内容门 helper：按转移分派到原型门 / 裁定门，四条路径在同步门之后调用（#46） | `docs (DocsReader)`, `req`, `from`, `to` | `GateFailure` 或 `undefined` | 四条转移路径（S-12 含看板） | S-1, S-2, S-3, S-5 | FR-1, FR-3, FR-4, FR-8 |

### 门禁模块 `prototype-gates.ts` / `decision-gates.ts` `serves: FR-1, FR-3, FR-4, FR-8`

原型三门在 `src/application/internal/prototype-gates.ts`；裁定门在
`src/application/internal/decision-gates.ts`（#16）。两模块尺寸门禁单文件 ≤400 行；**只做取数 + 组装**，
判定下沉纯函数（`parsePrototypeMetadata` 零 IO，可单测）。
**接入点（#22 + #46）**：不新增聚合函数 `assertPrototypeGates`；同步单点 `assertArtifactGates(req, from, to)`
**不动**（保持产物存在 / 确认职责，它不取 docs）。新增**唯一** async helper
`contentGatesForMove(docs, req, from, to)`（落在 `content-gate-wiring.ts`），内部按转移分派到原型门 / 裁定门；
四条路径在**同步门之后**调用它。**不合并既有 G2 调用**（避免把本需求扩成重构）；未来若要收敛成单一 async 入口，另立项。

| 函数 | 何时拒 | 错误码 | 缺口内容（`gaps`） |
|---|---|---|---|
| `checkPrototypePresenceGate` | sides 含 frontend 且无已登记 prototype，且无有效 `prototype_exempt` | `prototype_missing` | 缺什么 / 放哪 / 用哪条命令补 |
| `checkPrototypeVersionGate` | INDEX 缺失、`authoritative` ≠ 1 条、文档引用指向 `superseded` | `prototype_version_conflict` | 点名两份路径或那处错引用 |
| `checkPrototypeAnchorsGate` | 权威原型缺 `id="FR-N"` 覆盖、`proto-geometry` 块数 ≠ 1（#4）、geometry 出现阈值字段 | `prototype_anchor_missing` | 点名缺哪条 FR / 实际块数 |
| `checkDecisionLogGate` | 缺节或空节且有裁定留痕；条目缺列 / 影响 FR 不命中真实 FR | `decision_log_missing` / `decision_entry_invalid` | 逐条点名无效条目编号 |

判定与「非 UI 需求」正交：`sides` 不含 `frontend` 或 category 非 feature / refactor ⇒ 三个原型门直接返回
`undefined`（不给纯后端 / 文档需求加仪式）。

### 四条转移路径接线清单 `serves: FR-1, FR-3, FR-8`

`brainstorming → design` 的原型门与裁定门**必须四条路径全部接线**（REQ-292a 的教训：某条路径漏门 = 后门）。

| # | 路径 | 文件 | 接线点（真实位置） | 调用形态（#46） |
|---|---|---|---|---|
| 1 | 会话语义 `reqboard_move` | `src/application/use-cases/MoveRequirement.ts` | 同步门 `assertArtifactGates` **之后**、`gateForTransition(from,to)?.id === 'G2'` 之前 | `await contentGatesForMove(deps.docs, req0, from, to)`，拒绝即 `reject(...)` |
| 2 | 弹框确认后自动推进 | `src/application/use-cases/AskConfirm.ts` | 推进块的早门（与 `checkDesignCompletenessGate` 同一处，同步门之后） | 失败 → `advanced: false` + `gate_failure` 回执（不推进） |
| 3 | 看板移动端点 | `src/http/routers/requirements.ts` `handleReqMove` | 同步门 `preGate` 之后、`g2CompletenessFailure` 之前；mutate 内复查防漂移 | `throw Object.assign(new Error(msg), { code })` → `fail()` |
| 4 | 看板确认后自动推进 | `src/application/use-cases/ConfirmArtifact.ts` | 同步门通过后、`gateFromStage(changed.status)` 命中且 `advance !== false` 时 | 失败 → `advanceNote` 追加该门消息（不推进） |

**回归锁死（#46）**：一条用例对四条路径各断言一次，且**同时锁既有 G2 与新门**（缺任一即红）——
「门禁不再丢」的机械保证。

**会话侧传输码（#35：`transportCodeOf` 改为显式映射表，未知内部码原样透传，不静默降级为 `MISSING_ARTIFACT`）**：

| 内部码 | 传输码 |
|---|---|
| `prototype_missing` | `REQBOARD_MISSING_PROTOTYPE` |
| `prototype_version_conflict` | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` |
| `prototype_anchor_missing` | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` |
| `decision_log_missing` | `REQBOARD_DECISION_LOG_MISSING` |
| `decision_entry_invalid` | `REQBOARD_DECISION_ENTRY_INVALID` |

### `reqboard_submit(kind=prototype)` 服务端流程 `serves: FR-2, FR-4`

| 步骤 | 动作 | 失败处理 |
|---|---|---|
| 1 | 绑定读：本窗口绑定需求（`boundSummariesOf`） + 阶段纪律（`stageForKind('prototype') = 'brainstorming'`，显式 case，禁止 default 误归阶段，#3） | `REQBOARD_NO_BOUND_REQ` / `REQBOARD_BAD_STATUS` |
| 2 | `assertArtifactOpenable(docs, path)`：形态（空串 / `..` / 反斜杠 / brace / 越界）→ 存在性；路径按需求目录相对口径归一（#2） | `REQBOARD_ARTIFACT_NOT_OPENABLE` / `REQBOARD_FILE_MISSING` |
| 3 | `kindForRelPath` 必须判为 `prototype`：`prototypes/*.html`、`prototypes/INDEX.md`（#1）；旧 `prototype/*.html` 识别并在消息里提示迁移 | 形态不符 → 拒并给迁移指引 |
| 4 | `parsePrototypeMetadata(html)`：抽 FR 锚点 + geometry（块数记录，≠1 由锚点门拒）；`JSON.parse` 失败按「缺块」处理（不外抛） | 不阻断登记（锚点门在转移时判） |
| 5 | `registerArtifact`（幂等：同 stage+kind+path 不重复 push）+ 写 `StageArtifact.prototypeMeta`（#41） | 幂等返回 `registered: false` |
| 6 | `triggerAutoConfirm` 请人确认（**门禁只要求已登记**，确认章为可选加强，#13） + `syncRTMYaml('submit:prototype')` | RTM 失败只记 warning，**不打断主流程** |

**INDEX 维护方式（#9）**：`prototypes/INDEX.md` 由 **agent 手写**；登记流程**只校验、不改写**产物内容
（保持「登记不改产物」纪律）。

### 执行侧、注入面与验收侧后端落点 `serves: FR-6, FR-7, FR-10`

| 位置 | 改法（结论，已按 §10 拍板） | 依据 |
|---|---|---|
| `buildSubtaskPrompt`（`src/application/use-cases/ExecuteTask.ts`） | 新增内容渲染为**三个小节标题**（不是 JSON 字段）：`【本卡原型（UI 卡）】`、`【本卡裁定（D-x 原话）】`、`【验收判据】`；非 UI 卡不出原型小节 | #12 |
| `TaskRecord` 投影 | `TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（与既有 `requirementRefs` 命名对齐）；提示词与 RTM `covers_prototypes` / `covers_decisions` 共用同一字段 | #36 |
| 节点输入包（`internal/node-input-package.ts`） | `NodeInput.prototypeRefs?: string[]`、`NodeInput.decisions?: string[]`，渲染在「证据指针」节两行（交棒后新窗口可见） | #15 |
| `VerificationItemSource` / `AcceptSheet` | 增两支：`{ kind:'prototype-compare'; prototypePath: string }` 与 `{ kind:'decision-compare'; decisionIds: string[] }`（#14 命名、#37 载荷）；UI 需求自动出现 | #31, #37 |
| `AcceptSheet` / `accept-sheet-rtm-integration.ts` / `status-rtm-integration.ts` | **必须同时改三处 `taskId` 分支**（弹框 header 与两个 RTM 集成），否则静默退化成 `undefined` / `fr_id='UNKNOWN'` | #31 |
| `SubmitVerification` | UI 需求缺 `prototype-compare` 项即拒：内部码 `verification_prototype_compare_missing` + 传输码 `REQBOARD_VERIFICATION_INCOMPLETE` | #38 |

**边界**：原型路径与锚点由 S-2 的**权威版本**结果给出（不取「目录里第一个 html」）；
D-x 原话按编号从需求文档「讨论与裁定记录」节逐条取原文，不重写、不概括。
片段源（`fragments/**`）与回合指令（`renderDiveRoundText`）的改法见 brief §7 / #15，本文件不重复。

### `category-doc-sets.ts` 条件产物扩展 `serves: FR-1, FR-2`

| 项 | 改法 |
|---|---|
| 新类型 | `ConditionalStageArtifact { stage: StageKey; kind: ArtifactKind; side: 'frontend' / 'backend' }` |
| 新字段 | `CategoryDocDelta.conditionalStageArtifacts?`；feature / refactor 两条各登记 `{ stage:'brainstorming', kind:'prototype', side:'frontend' }` |
| 新函数 | `conditionalStageArtifactsFor(category, sides)`——与既有 `effectiveDesignDocs(category, sides)` **同构同口径**（同源 `sides` 解析，避免两套判定） |
| 门禁接入 | 阶段必备产物 = `STAGE_ARTIFACT_REQUIREMENTS[stage]` ∪ 条件命中项；既有必填节与产物语义不动 |
| 复用点 | 既有 `designDocPolicyFrom` 的括号 / 逗号等价解析直接复用（不另写一份 front-matter 切片） |

## 数据流 `serves: FR-2, FR-4, FR-5, FR-8`

### 流程 1：登记原型（唯一写路径） `serves: FR-2, FR-4`

```
事件：需求进入 brainstorming（或 agent 调 reqboard_submit(kind=prototype)）
  ↓
步骤 1：模板幂等落盘 → docs/requirements/<REQ>/prototypes/<name>.html
  ↓ `git mv templates/design/prototype.html templates/brainstorming/prototype.html`，旧路径不留（#21）；不存在才写
步骤 2：agent 填每个功能点一个 id="FR-N" 区块 + 恰好一块注释 <!-- proto-geometry {json} --> + 手写 prototypes/INDEX.md（#9）
  ↓ geometry 维度：unit ∈ {px,count,ratio}；at.state ∈ {inflight,terminal}；observations[].name 块内唯一（#5）
步骤 3：reqboard_submit(kind=prototype) → assertArtifactOpenable 归一路径（需求目录相对口径，#2）
  ├─ 伪路径 / 越界 → REQBOARD_ARTIFACT_NOT_OPENABLE（不读、不登记）
  └─ 通过 → 步骤 4
步骤 4：parsePrototypeMetadata 抽 anchors（id="FR-N"）与 geometry（观测量名 + 实测值 + source）
  ├─ geometry JSON 坏 → 按「缺块」记录，不抛
  └─ 正常 → 步骤 5
步骤 5：registerArtifact 登记 kind=prototype（幂等）+ 写 StageArtifact.prototypeMeta（#41）
步骤 6：syncRTMYaml('submit:prototype') → 刷新 rtm-brainstorming.yml（outputs.prototypes 节）
【副作用】：文件系统（骨架落盘，幂等）；台账 JSON 分片（artifacts 追加一条）；RTM YAML（可失败、只告警）
```

### 流程 2：`brainstorming → design` 门禁判定（四条路径共用） `serves: FR-1, FR-3, FR-4, FR-8`

```
触发：四条转移路径任一（会话 move / 弹框推进 / 看板移动 / 看板确认后自动推进）
  ↓
步骤 1：策略解析 designDocPolicyFrom(front-matter) → category + sides（括号与逗号写法等价）
  ↓
步骤 2：条件必交判定 conditionalStageArtifactsFor(category, sides)
  ├─ 不需要（非 feature·refactor 或 sides 不含 frontend）→ 跳过原型三门前置，进入步骤 7
  └─ 需要 → 步骤 3
步骤 3：豁免判定 prototypeExemptOf → 理由非空 **且** requirement 产物已落章
  ├─ 生效 → 跳过步骤 4~6
  └─ 不生效 → 继续
步骤 4：checkPrototypePresenceGate：已登记 prototype 产物?
  ├─ 无 → 拒 prototype_missing（what/why/how 三要素，how 含 reqboard_submit(kind=prototype)）
  └─ 有 → 步骤 5
步骤 5：checkPrototypeVersionGate：读 prototypes/INDEX.md 表格
  ├─ INDEX 缺失 / authoritative ≠ 1 条 / requirement.md·design/frontend.md 引用 superseded
  │   → 拒 prototype_version_conflict（点名两份路径或那处错引用）
  └─ 通过 → 步骤 6
步骤 6：checkPrototypeAnchorsGate：权威原型 anchors 是否覆盖 INDEX「服务条款」列每个 FR；geometry 块存在且无阈值字段
  ├─ 缺 → 拒 prototype_anchor_missing（点名缺哪条 / 哪块）
  └─ 通过 → 步骤 7
步骤 7：checkDecisionLogGate：「讨论与裁定记录（D-x）」节存在且非空；条目五列齐、影响 FR 命中真实 FR
  ├─ 缺节 / 空节（且有裁定留痕）→ 拒 decision_log_missing
  ├─ 条目无效 → 拒 decision_entry_invalid（gaps 逐条点名）
  └─ 全过 → 放行转移
【副作用】：无（全部只读）；不写盘、不改状态
```

### 流程 3：RTM 刷新链路 `serves: FR-5, FR-9`

| 触发点 | 刷新文件 | 本需求新增内容 |
|---|---|---|
| `submit:prototype`（新增，与既有 6 个触发点同构） | `rtm-brainstorming.yml` | `outputs.prototypes` 节（路径 / 权威标记 / 覆盖 FR）；载荷带 `paths: string[]`（#48），**生成器仍以台账为事实源**，载荷只用于增量刷新与留痕 |
| `submit:requirement` | `rtm-brainstorming.yml` `rtm-lifecycle.yml` | `outputs.decisions` 节（D-x 五要素投影） |
| `confirm:artifact` / `submit:design` | `rtm-design.yml` | 设计章节可指原型锚点（锚点走 `protoRefs`，**不进 `serves`**）与 D-x |
| `confirm:plan` / `task:status` | `rtm-decomposing.yml` `rtm-implementing.yml` | `task_coverage[].covers_prototypes` / `covers_decisions` |

覆盖度新增一维：**UI 卡必须有原型锚点**；**每条 D-x 至少被一条 FR 明细或一张任务卡的 `requirementRefs` 引用**，
未覆盖即点名（不上升为 100%）。

## 关键逻辑 `serves: FR-1, FR-3, FR-4, FR-8, FR-11`

### S-2 INDEX 权威唯一性（`checkPrototypeVersionGate`） `serves: FR-3`

**功能**：以 `prototypes/INDEX.md` 表格为唯一权威清单，判「唯一权威版本」与「引用一致」。

**处理步骤**：
1. 读 `prototypes/INDEX.md`；不存在 → 拒（`prototype_version_conflict`，点名期望路径）。
2. 用既有 `parseDocument` 取表格，列为 `路径 / 状态 / 服务条款 / 被取代于`；状态值域 `authoritative` / `superseded`。
3. 统计 `authoritative` 条数：`1` 通过；`0` 或 `≥2` 拒并**点名全部** `authoritative` 行路径。
4. 扫 `requirement.md` 与 `design/frontend.md` 正文中的原型路径：必须等于权威路径；命中 `superseded` 行 → 拒。

**路径口径（#2）**：INDEX「路径」列与文档引用都写**需求目录相对**（如 `prototypes/x.html`），
与 requirement / design 文档引用一致；比对前统一过 `normalizeArtifactPath` 归一。

**边界条件**：
- 旧目录 `prototype/*.html` 仍识别为 prototype，但门禁消息提示迁移到 `prototypes/`。
- 状态值拼写不在值域：按「未标 superseded」参与多版并存判定（宁可拒，不静默放行）。
- INDEX 表格列名漂移（如「服务条款」写成英文）：解析不到即按缺列处理并点名。

**示例**：INDEX 两条 `authoritative` → 输出 `prototype_version_conflict`，`gaps` = 两份路径；
改成一条 `authoritative` + 一条 `superseded-by` 后放行。

**性能指标**：一次目录 `exists` + 一次 ≤ 数 KB 文本解析；< 5ms。

### S-6 `stripPrototypeAnchors` 防假引用（覆盖度不虚高） `serves: FR-11`

**功能**：在 serves 抽取**之前**剥离锚点形态，使「贴个原型锚点」不再等于「已覆盖该 FR」。

**处理步骤**：
1. 对输入文本按 `\S+#FR-\d+` 匹配，逐个替换为**固定 token `<proto-anchor>`**（#6，便于测试断言与反查）。
2. `extractServesFrom` / `checkClauseCoverage` 只吃剥离后的文本。
3. 锚点另存独立字段 `protoRefs`（任务卡 / 设计章节；`TaskRecord.prototypeRefs` 见 #36），单独统计，**不与 FR 引用混算**。

**边界条件**：
- 实测依据：现状 `collectIds('prototypes/x.html#FR-4')` 返回 `['FR-4']`——剥离后必须返回 `[]`。
- 同一行既有编号引用又有锚点：只剥锚点，编号引用保留（不误伤正常 serve）。
- 锚点出现在代码围栏内：`parseDocument` 已剥围栏，不参与判定。

**回归**：用例断言「贴锚点不写实现 → 覆盖度不上升」与「strip 后 `collectIds` 不再产出该 FR」。

### S-5 D-x 连续 / 唯一 / 五列校验（`checkDecisionLogGate`，模块 `decision-gates.ts`） `serves: FR-8`

**功能**：把「讨论内容被概括掉」从不可见变成可核验。模块落点 `src/application/internal/decision-gates.ts`（#16）。

**处理步骤**：
1. 找节名 `## 讨论与裁定记录（D-x）`（**仅 feature 模板**）；缺节 → `decision_log_missing`。
2. 节内表格按 `编号 / 原话来源 / 裁定 / 影响 FR / 判据` 五列逐行校验：任一列空 → 该条无效。
3. 编号连续性 / 唯一性复用既有 `checkClauseSequence` 思路（`D-x` 独立命名空间：`D-1`、`D-2`…）。
4. `影响 FR` 必须命中 `requirement.md` 真实条款（用 `extractClauseDefinitions` 的查找表）；未命中 → 该条无效。
5. 有无效条目 → `decision_entry_invalid`，`gaps` 逐条点名编号；否则通过。

**边界条件**：
- **真空态**：整节只写「本节无裁定」视为非空、放行（禁止为过门禁硬凑条目）。
- 只有概括句（无原话来源 / 无影响 FR）的条目一律无效——正是 FR-8 要堵的形态。
- 非 feature 需求不要求该节（D-12 口径）。

### 裁定留痕启发式（只用于「要求非空」） `serves: FR-8`

| 项 | 口径 |
|---|---|
| 接入方法（#20） | 新函数 `hasDecisionTrace(sessionProbe, req, opts)`：复用两条读法（快照事件优先 / 持久化冷读回落），只取 `source.kind === 'user'`，**只扫最近 N 条（默认 200）**，跑祈使词表 |
| 判据 | 含祈使标记之一：`改成` / `不要` / `必须` / `加上` / `应该是` / `记得` / `注意` / `别` / `要` ⇒ 视为「存在裁定留痕」 |
| 用途 | **只用于判「该节是否被要求非空」**；不判内容对错、不判条数、不代替 agent 抽取 |
| 结果 | 有留痕 + 节空 → 拒 `decision_log_missing`；无留痕 + 节空 → 放行（允许真空态） |
| 边界 | 疑问句与事实确认不算裁定（D-11）；标记是**启发式**，误判代价是「要求补文档」而非「判内容错」 |
| 召回率（#23） | **不可测，如实写**：只锁「启发式命中即要求非空」；**召回率由 G2 人评审承担**，不假装可测 |
| 测试口径（#24） | 单测只覆盖**快照路径**；冷读真实会话路径标 `@integration`（真机会话标本） |

### S-9 豁免生效条件 `serves: FR-1`

| 条件 | 判法 | 不满足时 |
|---|---|---|
| 声明存在 | `requirement.md` front-matter `prototype_exempt: <理由>`（与 `design_exempt` 同款解析） | 按未豁免处理 |
| 理由非空 | `reason.trim() !== ''` | 缺失清单注明「豁免无效：理由为空」 |
| **人已确认** | 该需求 `kind=requirement` 产物 `confirmedAt !== undefined`（搭既有 G1 确认门，**不新增弹框**） | 仍拒（agent 不能自豁免） |

**边界**：豁免只放行「存在门」，**不放行**权威版本门与锚点门——豁免等于「本次不要原型」，
一旦交了原型，原型本身仍必须可判定、唯一权威。

**留痕（#7）**：豁免生效时写一条需求评论 `[豁免] <理由>`（与 `design_exempt` 同款）。
**可见性（#10）**：豁免必须在 `requirement.md` 的 D-x 里有**一条裁定记录**（人确认需求文档时必然看到）；
弹框文案带该行的要求写进片段纪律（**不作机器强制**）。

### S-10 阶段门时序 `StageGateTimeline` `serves: FR-11`

| 阶段节点 | 必须转绿的门 | 逾期处置 |
|---|---|---|
| 设计交完 | 必填节 + 格式门 + serves + 无 dangling | 由该阶段转移门禁拒绝（内部码 `stage_gate_overdue`、传输码 `REQBOARD_STAGE_GATE_OVERDUE`，#39） |
| 拆分落库 | 覆盖对照（FR → 卡）+ UI 卡原型锚点 | 同上（#39） |
| 实施收尾 | E2E 覆盖 + 三级追溯 | 同上（#39） |

常量与自检脚本 `scripts/req-doc-validate.mts` 共用同一份清单（同源）：脚本跑 9 项
（必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling）。
**脚本口径（#17 + #47）**：共 **4 个新脚本文件**（`template-gate-probe` / `doc-section-parity` /
`prompt-path-probe` / `req-doc-validate`）+ `package.json` 接线（`prompts:check`）——**没有第五个脚本**；
4 个脚本均**提供 `--json`**（默认人类可读；`--json` 输出机器可读结构，供 CI 与 `req-doc-validate.mts` 消费），
**退出码语义不变**（0 通过 / 1 失败 / 2 环境不可用）；
R1 的占位符渲染用 `scripts/template-render-map.json` 映射表，未在表内的占位符 → exit 1 并点名（#26）。

### 拒绝消息统一信封 `serves: FR-1, FR-8`

所有新增门的 `message` 走既有 `envelope()`：`<what> —— <why>。补齐：<how>`。

| 项 | 约束 |
|---|---|
| 逐字口径（#11） | 设计只定 what / why / how **模板与必含 token**（文件路径 + 可执行命令）；逐字文案在实现按既有 `envelope` 风格落 |
| `how` 锚点（#40、#44） | `GATE_HOW_ANCHOR` 扩为 `…|prototype_exempt|decision_…`；**所有新门的 `how` 必须含可执行锚点**（`reqboard_submit(kind=prototype)` 或 `templates/…`），由 `gate-feedback-envelope` 类用例守住 |
| 已踩坑（#44） | 实测 `prototype_exempt` 单独出现**不命中**旧正则 ⇒ 除扩正则外，`how` 仍须带 `reqboard_submit(kind=prototype)` 或 `templates/brainstorming/prototype.html` |

## 错误处理 `serves: FR-1, FR-3, FR-4, FR-8`

| 内部错误码 | 传输码（#35/#38/#39） | 触发条件 | HTTP | 用户提示（what / why / how 三要素） | 恢复路径 | 降级 |
|---|---|---|---|---|---|---|
| `prototype_missing` | `REQBOARD_MISSING_PROTOTYPE` | UI 需求缺已登记 prototype 且豁免无效 | 400 | 「需求阶段未交原型」——门禁要求 UI 需求必交。补齐：`reqboard_submit(kind=prototype)` | 交原型；或人确认 `prototype_exempt: <理由>`（+ D-x 留一条，#10） | 不降级（流程门明确拒绝） |
| `prototype_version_conflict` | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` | INDEX 缺失 / `authoritative` ≠ 1 / 引用 `superseded` | 400 | 点名两份路径或那处错引用。补齐：改 `prototypes/INDEX.md` 与引用 | 改 INDEX 留唯一权威；把被作废版标 `superseded-by`；修正 `requirement.md` / `design/frontend.md` 引用 | 不降级 |
| `prototype_anchor_missing` | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` | 权威原型缺 `id="FR-N"` 覆盖 / `proto-geometry` 块数 ≠ 1（#4）/ geometry 含阈值 | 400 | 点名缺哪条 FR、实际块数。补齐：`templates/brainstorming/prototype.html` 骨架 | 补锚点区块与唯一一块 `<!-- proto-geometry {json} -->`；把阈值搬到设计阶段产物 | 不降级 |
| `decision_log_missing` | `REQBOARD_DECISION_LOG_MISSING` | feature 需求缺「讨论与裁定记录（D-x）」节或空节（且有裁定留痕） | 400 | 「需求文档缺裁定记录节」——讨论里的补充会丢。补齐：`templates/brainstorming/feature.md` 的该节骨架 | 逐条落账五要素；确无裁定写「本节无裁定」 | 不降级 |
| `decision_entry_invalid` | `REQBOARD_DECISION_ENTRY_INVALID` | 条目五列缺项 / 影响 FR 不命中真实 FR / 编号不连续 | 400 | 逐条点名无效条目编号。补齐：补原话来源与影响 FR | 按点名补列；编号重排连续唯一 | 不降级 |
| `verification_prototype_compare_missing` | `REQBOARD_VERIFICATION_INCOMPLETE` | UI 需求验收单缺 `prototype-compare` 项（**已批准 `prototype_exempt` 的需求不适用**，#45） | 400 | 点名缺「与原型对照截图（含差异说明）」项。补齐：重交含该项的验收材料 | 补该项后重提验收材料；豁免需求改为渲染一行豁免说明「本需求已豁免原型（理由：…）」，不阻塞提交 | 不降级（豁免需求例外，见 #45） |
| `stage_gate_overdue` | `REQBOARD_STAGE_GATE_OVERDUE` | 该阶段必须转绿的门逾期仍红（`StageGateTimeline`） | 400 | 点名逾期门与所在阶段。补齐：跑 `scripts/req-doc-validate.mts` 定位缺口 | 补齐该阶段该绿的门后重试转移 | 不降级 |
| `REQBOARD_ARTIFACT_NOT_OPENABLE` | 同码（既有） | 登记路径为伪路径 / 越界 / 含 `..` 或反斜杠 | 400 | 既有登记门消息（含 normalized 路径） | 改传工作区内真实相对路径 | 不降级 |
| `REQBOARD_FILE_MISSING` | 同码（既有） | 归一后文件不存在（骨架没落盘 / 路径写错） | 400 | 既有登记门消息 | 先落盘再登记 | 不降级 |
| `design_doc_incomplete`（既有） | 同码（既有） | 非本需求新增；与原型门同段调用 | 400 | 既有 G2 消息 | 既有恢复路径 | 不降级 |

**错误降级原则**：
- 流程门（400 系）：明确拒绝，不降级——门禁红必须响亮，不允许「红了也没人看」。
- 存量兼容：`req.artifacts` 为空 / `undefined` 的存量需求一律放行（`isLegacy` 与既有两个门同口径），不被追溯拒绝。
- 增强层：RTM 刷新失败只记 warning（`rtm-health` 留痕），绝不打断提交 / 推进主流程。
- **硬约束（#43）**：每个新错误码都要逐条登记 `src/http/envelope.ts` 的 `STATUS_BY_CODE` = **400**；
  漏登记会**如实落 500**（看板显示成「服务器坏了」）——列为硬约束 + 用例。

## 数据库设计 `serves: FR-2, FR-5, FR-8, FR-9`

**结论：无新表；台账 / 队列分片为「加性（additive）变更、零迁移」（#50）。**
`StageArtifact.prototypeMeta?`、`TaskRecord.prototypeRefs?` / `decisionRefs?` 都是**新增可选键**——
不写「schema 未变」那类表述；旧记录缺键 = **未采集**，不补齐、不改写、**无迁移脚本**。台账仍为 JSON 分片（schema v9）。

| 项 | 结论 |
|---|---|
| 新增表 | 无 |
| 表结构变更 | 无（`CREATE TABLE` / `ALTER TABLE` 均不涉及） |
| 索引 / 约束 | 无新增数据库索引；「INDEX `authoritative` 恰好一条」是**代码级**校验，不进数据库约束 |
| 原型在台账中的形态 | `req.artifacts[]` 追加一条 `{ stage:'brainstorming', kind:'prototype', path, registeredAt, registeredBy, confirmedAt? }`（沿用 `StageArtifact`） |
| 锚点 / 几何量落点（#41 + #49） | `StageArtifact.prototypeMeta?: { anchors: { fr: string; selector: string }[]; geometry: { name: string; value: number; unit: 'px' / 'count' / 'ratio'; at: { width: number; state: 'inflight' / 'terminal' }; source?: 'prototype' / 'human' }[] }`（`source` 缺省 `'prototype'`）——**本字段名是全仓唯一口径**，其它文档内联的同形字段一律指向 #41，不出现第二套命名 |
| 变更性质（#50） | **加性（additive）变更、零迁移**：`prototypeMeta` / `prototypeRefs` / `decisionRefs` 均为**新可选键**；旧记录缺键 = 未采集，不补齐 / 不改写 / 无迁移脚本 |
| 幂等约束 | `registerArtifact` 按 `stage + kind + path` 去重（既有语义，不改） |
| 队列侧引用字段（#36） | `TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（与既有 `requirementRefs` 命名对齐）；RTM `covers_prototypes` / `covers_decisions` 与此同源 |

**RTM YAML（文档型「数据」变更）**：

| 文件 | 变更 | 说明 |
|---|---|---|
| `vendor/reqboard/src/rtm/types.ts` | 新增 `Prototype`（`path` / `authoritative` / `superseded_by` / `serves` / `anchors` / `geometry`）与 `Decision`（`id` / `source` / `verdict` / `serves` / `criterion`） | 唯一类型事实源 |
| `rtm-brainstorming.yml` | `outputs` 增 `prototypes` 与 `decisions` 两节 | 加节，不改既有 `requirements` 节形状 |
| `rtm-design.yml` / `rtm-decomposing.yml` / `rtm-accepting.yml` | 设计章节可指原型锚点与 D-x（锚点进 `protoRefs`）；`task_coverage[]` 增 `covers_prototypes` / `covers_decisions`；验收项含「原型对照」证据条目 | 加可选字段 |
| `rtm_version` | **升位至 `"2.0"`**（#18 / #42；键是 `metadata.rtm_version`，与写入计数 `metadata.version` 不是同一个键） | schema 变更可识别 |

**兼容与容错（宽容度定死）**：

| 情形 | 处置 |
|---|---|
| 旧文件缺 `prototypes` / `decisions` 节 | 视为**未采集（pending）**，不判损坏 |
| 旧读取器遇到未知 key | 忽略、不报错（不抛、不判不健康） |
| 存量 66 条需求 | 读取不报错、不被判不健康（兼容基线） |
| 「UI 需求缺 `prototypes` 节 = 不健康并点名」的适用范围（#19） | **适用性判据**：只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince`（插件配置常量，默认规则上线日）的需求才判不健康并点名；存量一律 `exempted: legacy` 并如实报告——解决「缺节不健康」与「存量不判不健康」的冲突 |
| `expectedRTMFiles()` | **不变**（仍 7 份）——不因新增节多出一份文件 |

## 性能考量 `serves: FR-1, FR-4`

| 指标 | 目标 | 测算依据 | 瓶颈分析 | 优化方案 |
|---|---|---|---|---|
| 单次原型门禁判定 | < 100ms | 目录级 `exists` + 小文件正则 / JSON 解析（原型 HTML 只读锚点区块与注释块） | 无热点；最慢环节是多次 `docs.read` | 一次读入复用同一份文本给三门前置（避免重复读盘） |
| 锚点抽取 | < 5ms | 正则扫 `id="FR-N"` 与单块注释；不整体加载渲染 | 大 HTML 全文扫描 | 只扫目标行（锚点 / 注释） |
| INDEX 解析 | < 5ms | 单个 ≤ 数 KB Markdown 表格（复用 `parseDocument`） | 无 | — |
| RTM 刷新 | 与既有触发点同量级 | 复用 `runRTMTrigger`，失败只 warning | 7 份 YAML 写盘 | 不改触发频率（登记 / 提交各一次） |
| 依赖面 | **零新增运行时依赖** | 不引 HTML/DOM 解析库、不引视觉/截图库 | — | 正则 + `JSON.parse` 已足够 |

**瓶颈分析**：最慢环节是「门禁判定要读 2~3 个文件（INDEX + 权威原型 + 需求文档）」。
四条路径均为低频人工动作（状态转移 / 提交），不构成吞吐压力；不做缓存，避免引入失效逻辑。

## 安全设计 `serves: FR-2, FR-4`

| 面 | 规则 | 拒绝示例 | 理由 |
|---|---|---|---|
| 路径越界 | 不读未过 `normalizeArtifactPath` 的原始路径；复用既有 `assertArtifactOpenable` 口径（空串 / `..` 段 / 反斜杠 / brace 通配 / 工作区外一律拒） | `../../etc/passwd`、`{a,b}.html` | 防路径遍历与非真实文件路径；门禁只读「已登记且归一」的 path |
| 原型内脚本 | **不执行、不渲染、不 eval** 原型内任何脚本或表达式；只做文本正则与注释块 `JSON.parse` | `<script>fetch(...)</script>` | 原型是**数据**不是可执行内容 |
| 解析失败 | geometry JSON 坏 / 锚点块畸形 → 按「缺块」判缺并拒（不把异常外抛、不吞成通过） | `<!-- proto-geometry {oops -->` | fail-closed：坏数据不得算通过 |
| INDEX 内容 | 只当表格解析；不解释单元格里的任何命令或路径指令（仅作字符串比对） | 单元格写 `rm -rf` | 文档内容不产生副作用 |
| 大小上限 | 只读锚点行 / 注释块，不整体渲染大文件；门禁不做全量 DOM 构建 | 超大 HTML | 防解析放大 |
| 鉴权 | 不新增端点、不新增权限面；看板移动沿用既有 `handleReqMove` + `fail()` 映射；豁免由人确认（搭 G1） | — | agent 不能自豁免（D-13） |
| 敏感信息 | 本需求不采集、不落盘任何凭证 / 个人信息；日志只记路径与编号 | — | 无新增敏感面 |

## 关键决策与取舍 `serves: FR-1, FR-3, FR-11`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 权威版本载体 | 页内标记（改原型即改状态） | **`prototypes/INDEX.md` 表格** | 既有 `parseDocument` 直接能解析；页内标记要写 HTML 解析器 |
| 元数据抽取 | 引 HTML/DOM 解析库 | **单块注释 `<!-- proto-geometry {json} -->` + 正则** | 边界明令不新增运行时依赖；注释块 JSON 可 `JSON.parse`，坏数据可判 |
| 锚点是否算 FR 引用 | 锚点即引用（省事） | **锚点单列 `protoRefs`，`stripPrototypeAnchors` 剥离** | 实测 `collectIds('prototypes/x.html#FR-4')` = `['FR-4']`——混算会让「贴锚点」刷出漂亮覆盖度 |
| 豁免怎么给 | 新增弹框专门问 | **搭既有 G1 确认门**（理由非空 + requirement 已落章） | 不新增弹框（边界）；agent 不能自豁免（D-13） |
| 裁定门强度 | 机器判「哪句是裁定」 | **机器只判「有留痕 / 条目无效」** | 抽取要判断力（交给模型）；门槛只做可机械核验的那半 |
| 条件必交复用 | 另写一套「阶段必备产物」判定 | **复用 `category-doc-sets` 的 sides 策略** | 一处口径（同源 `designDocPolicyFrom`），避免第二份真相 |
| 门禁放置 | 各路径各写一遍判定；或顺手把 async 门并进同步单点 | **判定本体在 `prototype-gates.ts` / `decision-gates.ts`，接入点是唯一 async helper `contentGatesForMove`（#46）；同步单点 `assertArtifactGates` 不动，既有 G2 不合并** | REQ-292a 实测「某条路径漏门 = 后门」；合并同步/异步职责会把本需求扩成重构（#46 明令另立项） |
| 缺节处理 | RTM 新节缺失判损坏 | **缺节 = pending，不判损坏** | 存量 66 条需求的旧文件不能被判坏 |
| 错误传输码 | 内部码原样透出（旧法未知码降级为 `MISSING_ARTIFACT`） | **显式映射表 + 未知码原样透传 + 逐码登记 `STATUS_BY_CODE`（#35 / #43）** | 静默降级会让 agent 按错的码分支；漏登记 HTTP 表则如实落 500（看板显示成「服务器坏了」） |

## 技术方案与亮点 `serves: FR-10, FR-11`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| TypeScript | 仓内既有 | 类型即契约 | — |
| vitest | 仓内既有 | 四条路径接线回归、逆验证 | — |
| `parseDocument` / `collectIds`（本仓） | 仓内既有 | INDEX 表格与编号解析 | 复用同源解析，不另写解析器 |
| 新增运行时依赖 | **无** | 锚点 / geometry 用正则 + `JSON.parse` | 不引 HTML/DOM 解析库、不引视觉库（边界 5） |

**模块划分**：

| 模块 | 职责 |
|---|---|
| `src/domain/artifact/ArtifactSpec.ts` | `ArtifactKind` 增 `prototype`（连带 `shared/artifact-labels.ts` 配中文名「原型」，否则中文名护栏用例拦，#33）；`NAME_TO_KIND` 认 `prototypes/*.html`、`prototypes/INDEX.md`（#1）与旧 `prototype/*.html`；`stageForKind('prototype') = 'brainstorming'` 显式 case（#3） |
| `src/application/internal/category-doc-sets.ts` | `conditionalStageArtifactsFor`（sides 驱动的阶段必备产物） |
| `src/application/internal/content-gate-wiring.ts` | 新增**唯一** async helper `contentGatesForMove(docs, req, from, to)`：按转移分派原型门 / 裁定门（#46）；既有 G2 调用不合并 |
| `src/application/internal/prototype-gates.ts` | 三个原型门 + 元数据解析（尺寸门禁 ≤400 行） |
| `src/application/internal/decision-gates.ts` | 裁定门 `checkDecisionLogGate` + `hasDecisionTrace`（#16 / #20） |
| `src/application/internal/content-gates.ts` / `doc-parse.ts` | `ID_PATTERN` 增 `D-\d+`；`stripPrototypeAnchors`（固定 token `<proto-anchor>`）接入 serves 抽取 |
| `src/application/internal/rtm-yaml.ts` / `rtm-health.ts` | 触发点 `submit:prototype`；UI 需求缺 `prototypes` 节判不健康（适用性判据见 #19） |
| `src/application/internal/node-input-package.ts` | `NodeInput.prototypeRefs` / `decisions`，渲染在「证据指针」节（#15） |
| `src/application/use-cases/ExecuteTask.ts` | `buildSubtaskPrompt` 追加三个小节标题；原型段只对 UI 卡（#12） |
| `src/domain/workflow/AcceptanceSheetSpec.ts` / `use-cases/AcceptSheet.ts` / `internal/{accept-sheet,status}-rtm-integration.ts` | 新增 `prototype-compare` / `decision-compare` 两支 source，并同改三处 `taskId` 分支（#31 / #37） |
| `vendor/reqboard/src/rtm/*` | `Prototype` / `Decision` 类型、两节生成、覆盖度新维、校验器前缀与宽容度 |
| `src/http/routers/requirements.ts` / `envelope.ts` | 看板路径接线；新增码登记 `STATUS_BY_CODE` |

**设计模式**：条件必交策略（复用 `sides` 驱动的策略解析）＋ 门禁单点（唯一 async helper
`contentGatesForMove` 供四条转移路径统一调用，#46）＋ 幂等登记（`stage + kind + path` 去重）。

**关键实现手法**：
- 判定与取数分离：`parsePrototypeMetadata` 零 IO 纯函数，门禁只做「取数 + 组装」——单测可直接喂字符串。
- 锚点剥离前置：`stripPrototypeAnchors` 放在 serves 抽取**之前**，一处收口影响全部覆盖度统计。
- 同步 / 异步分工（#46）：同步 `assertArtifactGates` 只管产物存在 / 确认，async `contentGatesForMove` 管内容门，互不吞并。
- 加性零迁移（#50）：新键全部可选，旧记录缺键即未采集——不写迁移脚本、不改写旧分片。
- 同源清单：`StageGateTimeline` 同时被门禁与 `req-doc-validate.mts` 读取，避免两套时点。
- 拒绝信封复用：新增门不另写文案拼接，一律走 `envelope()` 三要素（`how` 必须可执行）。

**攻克的难点**：
- **假引用**：锚点形态与编号引用在文本上无法区分 ⇒ 抽取前剥离 + 独立字段 `protoRefs` 分开统计。
- **门禁丢失**：曾出现「某条路径漏门」⇒ 四条路径各一条接线断言，缺任一即红。
- **存量兼容**：新节/新码必须让旧 RTM 文件读取不报错 ⇒ 缺节 = pending、未知 key 忽略。
- **D-x 不可见**：`ID_PATTERN` 不认 `D-1` ⇒ 扩白名单 + 定定义链，否则「必须被引用」无从核验。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向 |
|---|---|---|---|---|
| 原型的身份 | 附件 / `notes` 兜底 | 一等产物 `kind=prototype` + 必交门 | 附件不受门禁、不进追溯链 | `ArtifactSpec.ts`、验收标准 1 / 3 |
| 原型判据 | 人眼比对 / 像素相似度 | 结构 + 几何量 + 令牌（阈值由设计阶段定死） | 渲染差异会制造长期假红 | `prototype-gates.ts`、验收标准 5 |
| 覆盖度口径 | 锚点即引用 | 锚点单列 `protoRefs` | 防「贴锚点刷覆盖度」 | `stripPrototypeAnchors`、验收标准 20 |
| 下游门时序 | 红了也没人看 | `StageGateTimeline` 写明各阶段必须转绿的门 | REQ-292a 的门禁丢 9 天没人发现 | `StageGateTimeline`、`req-doc-validate.mts`、验收标准 21 |
| 拒绝文案 | 「未交」「未确认」结论 | 三要素信封（what / why / how，`how` 可执行） | 只给结论等于把排查成本转给 agent | `envelope()`、验收标准 1 / 2 |
