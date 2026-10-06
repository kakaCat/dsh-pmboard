---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
sides: [frontend, backend]
---

# 架构设计（REQ-261005105032-3b02） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

> **唯一契约源**：`docs/requirements/REQ-261005105032-3b02/notes/design-brief.md`（命名/字段/错误码/门禁行为逐字照它）。
> 需求源：`docs/requirements/REQ-261005105032-3b02/requirement.md`（11 条 FR / 15 条 D-x 裁定）。
> 本文件只写**设计**：不含拆分阶段的任务表与 DAG（那属拆分阶段产物）。
> 第一轮待定项已按 brief **§10 待定项决议（50 条）**回填，逐处引用 `#编号`；§10 未列者仍不自行发明。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-8, FR-10, FR-11`

**问题**：原型没有身份（不属必备产物、不受门禁、不进追溯链），需求阶段的讨论裁定只留在会话里。

**当前状况**：`kindForRelPath` 未命中 → `notes`；`STAGE_ARTIFACT_REQUIREMENTS.brainstorming=['requirement']`；四条转移路径中已有路径漏门（REQ-292a 实测）。

**设计方案**：把原型升格为 `kind=prototype` 的阶段必备产物，再给它三重身份（产物 / 契约 / 判据）。

**做完的可证伪结果**（每条对应验收标准）：

| # | 可证伪结果 | 判据 | serves |
|---|---|---|---|
| 1 | UI 需求不交原型出不了需求阶段 | `sides` 含 frontend 且无已登记 prototype → `brainstorming → design` 返回 `prototype_missing` | FR-1 |
| 2 | 原型只有一个权威版本 | `prototypes/INDEX.md` 的 `authoritative` 恰好一条，否则 `prototype_version_conflict` | FR-3 |
| 3 | 原型可被机器判定 | 权威原型含 `id="FR-N"` 覆盖 + `proto-geometry` 块，缺则 `prototype_anchor_missing` | FR-4 |
| 4 | 讨论裁定逐条落账且可追 | 缺节/空节 → `decision_log_missing`；缺列 → `decision_entry_invalid` | FR-8 |
| 5 | 假引用刷不动覆盖度 | `stripPrototypeAnchors` 后锚点不再产出 FR 编号；锚点走独立字段 `protoRefs` | FR-11 |
| 6 | 四条转移路径无后门 | 一条用例对四路径各断言一次 | FR-10 |

**四条机制线（总览）**：

```
   产物线 (1)                  门禁线 (2)                同源线 (3)                 校验线 (4)
+------------------+     +------------------+     +------------------+     +------------------+
| 骨架幂等落盘     |     | presence 门      |     | 模板 6 份        |     | 锚点单列         |
| submit(prototype)|     | version 门       |     | 四条注入面       |     | protoRefs        |
| 抽锚点+几何量    |     | anchors 门       |     | generated 重生成 |     | D-x 白名单       |
| 元数据落产物簿   |     | 裁定门           |     | R1~R4 机械回归   |     | 阶段门时序       |
+--------+---------+     +--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |                        |
         v                        v                        v                        v
   kind=prototype          四条转移路径统一调用      改任一处必须同步其余三处   StageGateTimeline
   + INDEX.md 权威          MoveRequirement /        片段/回合/输入包/子卡      collectIds 不再被
   + proto-geometry         AskConfirm / 看板端点 /   提示词 + 重生成产物        锚点污染
                            ConfirmArtifact
         |                        |                        |                        |
         +------------------------+------------------------+------------------------+
                                          |
                                          v
                     下游：UI 卡锚点 / RTM 四层 / 提示词 / 验收单 全部可追 FR-x 与 D-x
```

**不改的后果**：靠人眼比对（REQ-292a：文档 Tab 317 行 vs 原型 15 行靠人发现）；讨论裁定继续在验收时口头重申。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

```
      reqboard_submit(kind=prototype)                四路径（缺一即后门）
              |                                  +--> MoveRequirement
              v                                  |    AskConfirm 推进块
   +----------------------+   单点判定          +--+--> 看板移动端点
   | SubmitArtifact       |-----------------> |  |    ConfirmArtifact 推进块
   |  -> kind=prototype   |                   |  +--> contentGatesForMove（#46 新增）
   |  -> 抽 anchors/geom  |                   |          |- presence 门
   +----------+-----------+                   |          |- version 门
              |                               |          '- anchors 门
              v                               |       [全新] decision-gates.ts
   +----------------------+                   |          |- 缺节/空节
   | 产物元数据（产物簿）  |                   |          '- 条目无效
   +----------+-----------+                   |
              |                               v
              |                    +--------------------------------+
              |                    | artifact-gates（同步，不动 #46）|
              |                    +---------------+----------------+
              |                                    v
              |                    +--------------------------------+
              |                    | contentGatesForMove（#46 唯一） |
              |                    +---------------+----------------+
              v                                    v
   +----------------------+            +---------------------------+
   | rtm-yaml 触发点       |            | 拒绝信封（码 + gaps + how）|
   | submit:prototype     |            +---------------------------+
   | 载荷 paths[]（#48）   |
   +----------+-----------+
              v
   +--------------------------------------------------------------+
   | vendor/reqboard/src/rtm：prototypes / decisions 两节 + 一维覆盖 |
   +--------------------------------------------------------------+
              |
              v
   下游消费：ExecuteTask.buildSubtaskPrompt / node-input-package /
             round-state / QueryDocs / panels/docs / 验收单 prototype-compare
```

**改动清单**（逐文件；`serves` 列为该行所服务的条款）：

| 路径 | 新增/改动 | 职责 | serves |
|---|---|---|---|
| `src/domain/artifact/ArtifactSpec.ts` | 改动 | `ArtifactKind` 增 `'prototype'`；`ALL_ARTIFACT_KINDS` 同步；`NAME_TO_KIND` 增 `[/^prototypes\/.+\.html$/, 'prototype']` 与 `[/^prototype\/.+\.html$/, 'prototype']`（旧路径兼容识别）；brainstorming 必备产物按 `sides` 条件追加 prototype | FR-2 |
| `src/domain/workflow/AcceptanceSheetSpec.ts` | 改动 | `VerificationItemSource` 增 `{ kind: 'prototype-compare' }`；UI 需求组装「与原型对照截图（含差异说明）」项 | FR-7 |
| `src/application/internal/category-doc-sets.ts` | 改动 | 条件必交机制从「设计文档」复用到「阶段必备产物」：`DELTA.conditionalStageArtifacts = [{ stage:'brainstorming', kind:'prototype', side:'frontend' }]`（feature/refactor 且 sides 含 frontend 时生效） | FR-1, FR-2 |
| `src/application/internal/prototype-gates.ts` | 新增 | 三个原型门：`checkPrototypePresenceGate` / `checkPrototypeVersionGate` / `checkPrototypeAnchorsGate`；只做取数 + 组装，判定可下沉纯函数；单文件 ≤400 行 | FR-1, FR-3, FR-4 |
| `src/application/internal/decision-gates.ts`（#16 已拍板） | 新增 | 裁定门：缺节/空节 → `decision_log_missing`；条目无效（缺原话来源 / 影响 FR 未命中真实 FR）→ `decision_entry_invalid` 并点名条目；留痕判据走 `hasDecisionTrace`（#20），只用于「要求非空」 | FR-8 |
| `src/application/internal/artifact-gates.ts` | 改动 | **#46 同步单点不动**（`assertArtifactGates(req, from, to)` 签名与职责不变，仍只做产物存在 / 人工确认）；仅 `GateFailure.code` 联合扩 7 个码：`prototype_missing` / `prototype_version_conflict` / `prototype_anchor_missing` / `decision_log_missing` / `decision_entry_invalid` / `verification_prototype_compare_missing` / `stage_gate_overdue` | FR-1, FR-8 |
| `src/application/internal/content-gate-wiring.ts` | 改动 | **#46 新增唯一 async helper** `contentGatesForMove(docs, req, from, to)`：内部按 `(from, to)` 分派到原型门 / 裁定门；四条路径在同步门**之后**调用它；**不合并既有 G2 调用** | FR-1, FR-8, FR-10 |
| `src/application/use-cases/MoveRequirement.ts` | 改动 | 会话语义转移路径（`reqboard_move`）：在既有同步门之后补调 `contentGatesForMove`（#46） | FR-1 |
| `src/application/use-cases/AskConfirm.ts` | 改动 | 弹框确认后的推进块（现状无门，**新增接线**） | FR-1 |
| `src/http/routers/requirements.ts` | 改动 | 看板移动端点（REQ-292a 丢的就是这条）**新增接线** | FR-1 |
| `src/application/use-cases/ConfirmArtifact.ts` | 改动 | 看板确认后自动推进块（`advanceTargetFor`）**新增接线** | FR-1 |
| `src/application/use-cases/SubmitArtifact.ts` | 改动 | `kind=prototype` 登记入口：抽取锚点与几何量写进产物元数据；登记走既有可打开性校验 | FR-2, FR-4 |
| `src/application/use-cases/ExecuteTask.ts` | 改动 | `buildSubtaskPrompt`：UI 卡带原型路径 + 本卡锚点；所有卡带本卡关联 D-x 原话 | FR-6, FR-9 |
| `src/application/dive/round-state.ts` | 改动 | `renderDiveRoundText`：brainstorming / design / implementing 三段各补原型与 D-x 指针 | FR-10 |
| `src/application/internal/node-input-package.ts` | 改动 | 「证据指针」投影含原型路径与 D-x（交棒后新窗口只看本包也能看到） | FR-10 |
| `src/application/query/QueryDocs.ts` | 改动 | 交付物白名单增 `prototypes/*.html` 与 `prototypes/INDEX.md`；**#32** 读 INDEX 后投影 `prototypeRole?` / `supersededBy?`（可选，缺省不注入）；**#34** 恒等式 = `documents` 中来自台账的行数 + Σ`discovered.count` == `artifacts.length` | FR-2 |
| `src/client/views/panels/docs.ts` | 改动 | **#30** `DocPanelKind` 增 `'prototype'`，原型在确定文档块内单列、可点击打开；原型行**必须保留** `data-doc-row="1"`（保恒等式）；不新增弹窗 | FR-2 |
| `src/shared/artifact-labels.ts` | 改动 | **#33** 新增 kind 必配中文名「原型」，否则 `tests/artifact-labels.test.ts` 中文名护栏用例拦；`Record<ArtifactKind, DocPanelKind>` 穷尽性同步 | FR-2 |
| `src/http/envelope.ts` | 改动 | **#43** 逐条登记 7 个新错误码到 `STATUS_BY_CODE` = 400；漏登记会如实落 500 | FR-1, FR-11 |
| `src/application/use-cases/AcceptSheet.ts`、`src/application/internal/accept-sheet-rtm-integration.ts`、`src/application/internal/status-rtm-integration.ts` | 改动 | **#31** 新 source 形状的**三处 `taskId` 分支**必须同时改（弹框 header / RTM 集成两处），否则静默退化成 `undefined` / `fr_id='UNKNOWN'` | FR-7, FR-9 |
| `src/application/internal/rtm-yaml.ts` | 改动 | 触发点增 `submit:prototype`（与既有触发点同构） | FR-5 |
| `src/application/internal/rtm-health.ts` | 改动 | `expectedRTMFiles()` 不变（仍 7 份）；**#19 适用性判据**下 UI 需求（`createdAt ≥ prototypeRulesSince`）缺 `prototypes` 节 = 不健康并点名；存量 `exempted: legacy` | FR-5 |
| `vendor/reqboard/src/rtm/types.ts` | 改动 | 新增 `Prototype` 与 `Decision` 类型；`metadata.rtm_version = "2.0"`（#18 / #42） | FR-5, FR-9 |
| `vendor/reqboard/src/rtm/brainstorming-generator.ts` | 改动 | `outputs` 增 `prototypes` 与 `decisions` 两节 | FR-5, FR-9 |
| `vendor/reqboard/src/rtm/design-generator.ts` | 改动 | 设计章节 `serves` 可指原型锚点与 D-x（锚点走 `protoRefs`，不进 serves） | FR-5, FR-9 |
| `vendor/reqboard/src/rtm/decomposing-generator.ts` | 改动 | `task_coverage[]` 增 `covers_prototypes` / `covers_decisions` | FR-5, FR-9 |
| `vendor/reqboard/src/rtm/coverage-checker.ts`、`coverage-calculator.ts` | 改动 | 增两维：UI 卡必须有原型锚点；每条 D-x 必须被引用——未覆盖则覆盖度 < 100% 并点名 | FR-5, FR-9 |
| `vendor/reqboard/src/rtm/accepting-generator.ts` | 改动 | 验收项含「原型对照」证据条目 | FR-7 |
| `vendor/reqboard/src/rtm/validator.ts` | 改动 | 编号白名单认原型锚点前缀；**宽容度**：缺 `prototypes` / `decisions` 节 = `pending`（不判损坏），未知 key 忽略不报错 | FR-11 |
| `src/domain/prompt/fragments/common/iron-rules.md` | 改动 | 加两条：需求阶段裁定必须落账 D-x；UI 需求需求阶段必交原型 | FR-10 |
| `src/domain/prompt/fragments/brainstorming/feature.md` | 改动 | 加 D-x 落账清单项 + 原型交付项 + 确认前自查 | FR-10 |
| `src/domain/prompt/fragments/{design,decomposing,implementing,accepting}/feature.md` 与 `heavy/overrides.md` | 改动 | 各节点补「引用原型锚点 / D-x」纪律（只改本仓段，vendored 原文逐字节不动） | FR-10 |
| `src/domain/prompt/generated/fragments.ts` | 改动（重生成） | `node scripts/inline-prompt-fragments.mjs` 重生成，再跑校验（构建期内联，运行时不读盘） | FR-10 |
| `templates/brainstorming/feature.md` | 改动 | 新增「讨论与裁定记录（D-x）」节骨架（**仅 feature**，D-12） | FR-8, FR-10 |
| `templates/brainstorming/prototype.html` | 新增（**#21 `git mv` 迁入，旧路径不留**） | 原型骨架：`id="FR-N"` 区块 + `proto-geometry` 块 + INDEX 表格骨架 + 权威版本标记位 | FR-2, FR-4 |
| `templates/design/frontend.md` | 改动 | 「原型页面」节指向权威原型与锚点（P-x/C-x ↔ `#FR-N`），要求引 D-x | FR-5, FR-9 |
| `templates/decomposing/decomposition.md` | 改动 | 任务表增「原型锚点 / 关联 D-x」列（UI 卡必填）；UI 卡验收模板含原型对照判据 | FR-5, FR-6 |
| `templates/implementing/task-card.md` | 改动 | 「范围」节增「原型锚点」「关联 D-x」占位符（现 `{{DESIGN_SERVES}}` 落库实测为空） | FR-6, FR-9 |
| `templates/accepting/verification.md` | 改动 | 增「与原型对照截图」「D-x 对照」两项 | FR-7, FR-9 |
| `scripts/template-gate-probe.mts` | 新增 | R1：按 **#26** `scripts/template-render-map.json` 渲染 `templates/**/*.md` 占位符（表外占位符 → exit 1 并点名）→ 跑 `missingCategoryDocs` + `checkRequirementDocFormatGate` + `checkDesignSectionsHaveServes` → 0 缺口 | FR-10 |
| `scripts/template-render-map.json` | 新增 | **#26** 占位符渲染映射表（R1 的输入口径）；未在表内的占位符 = 脚本 exit 1 并点名（防新占位符没人管） | FR-10 |
| `scripts/doc-section-parity.mts` | 新增 | R2：门禁节名集合（BASE+DELTA）与模板 H2 集合**双向相等** | FR-10 |
| `scripts/prompt-path-probe.mts` | 新增 | R3：扫片段与 `round-state.ts` 文本里的路径 token → 必须存在或属已知产物名 | FR-10 |
| `scripts/req-doc-validate.mts` | 新增 | 自检：跑 9 项（必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling），并入 R1 | FR-11 |
| `package.json` | 改动 | R4：增 `prompts:check`（inline + check 两条脚本）并纳入提交前清单 | FR-10 |

> **「5 个脚本」口径（#17 已拍板）**：**4 个新脚本文件**——`scripts/template-gate-probe.mts` /
> `scripts/doc-section-parity.mts` / `scripts/prompt-path-probe.mts` / `scripts/req-doc-validate.mts`；
> 加上 **`package.json` 接线**（`prompts:check`）。**没有第五个脚本**。
> 既有 `scripts/inline-prompt-fragments.mjs`、`scripts/check-prompt-fragments.mjs` 不新增只接线。

## 数据结构变更 `serves: FR-2, FR-3, FR-4, FR-8, FR-9, FR-11`

### 新增/修改的数据结构 `serves: FR-2, FR-3, FR-4`

```typescript
// 改类型（联合扩一项，零行为变化）：新增 prototype
export type ArtifactKind =
  | 'requirement' | 'plan' | 'decomposition' | 'design' | 'task_detail'
  | 'verification' | 'archive' | 'notes' | 'task_output' | 'prototype'

// #33 连带必改：新 kind 必须配中文名「原型」（src/shared/artifact-labels.ts），
//   并同步 Record<ArtifactKind, DocPanelKind> 穷尽性——否则 artifact-labels 护栏用例拦
// #3  stageForKind('prototype') = 'brainstorming'（显式 case，禁止 default 误归阶段）
// #1  INDEX.md 自身也是 prototype 产物：NAME_TO_KIND 增 [/^prototypes\/INDEX\.md$/, 'prototype']，不落 notes
// #2  路径书写口径：一律**需求目录相对**（'prototypes/x.html'），实现用 normalizeArtifactPath 归一

// 新增：条件必交的**阶段必备产物**（复用设计文档的条件必交机制）
export interface ConditionalStageArtifact {
  stage: 'brainstorming'
  kind: 'prototype'
  side: 'frontend'
}

// #41 / #49 产物元数据承载锚点与几何量：**唯一字段名 StageArtifact.prototypeMeta（可选键）**
//   本文件不再另立字段名；anchors 形状即 #41 的 { fr: string; selector: string }[]
//   #50：该键是台账分片的**新可选键**——加性变更、零迁移；旧记录缺键 = 未采集，不补齐、不改写
export interface PrototypeObservation {
  name: string                                          // #5 同一块的 observations 内唯一
  value: number                                         // 实测值；禁止放阈值（D-10）
  unit: 'px' | 'count' | 'ratio'                        // #5 值域（已拍板）
  at: { width: number; state: 'inflight' | 'terminal' }  // #5 值域（已拍板）
  source?: 'prototype' | 'human'                        // #8 缺省 'prototype'；人给值标 'human'
}
// #41 原文形状（本文件只引用，不复制第二套命名）：
//   StageArtifact.prototypeMeta?: {
//     anchors: { fr: string; selector: string }[]
//     geometry: PrototypeObservation[]
//   }

// 页内单块注释形态（#4 必须**恰好一块**；多块 → prototype_anchor_missing 并点名块数）：
//   <!-- proto-geometry {"observations":[{name,value,unit,at}]} -->
// 页内是 {observations:[...]} 包装；落进产物元数据后展平为 geometry: [...]（#41）

// 新增：锚点引用独立字段，不与 serves 混算（#6 占位符固定 token '<proto-anchor>'）
export interface ProtoRefs {
  protoRefs: string[]   // 形如 'prototypes/detail.html#FR-4'
}

// #36 任务卡承载关联编号（与既有 requirementRefs 命名对齐）
//   #50：prototypeRefs / decisionRefs 是台账分片的**新可选键**——加性变更、零迁移；
//        旧记录缺键 = 未采集，不补齐、不改写
export interface TaskRecordRefs {
  prototypeRefs?: string[]
  decisionRefs?: string[]
}

// #30 / #32 客户端文档面板投影（旧形状不变：两个字段均可选，缺省不注入）
export interface DocPanelPrototypeFields {
  prototypeRole?: 'authoritative' | 'superseded'
  supersededBy?: string
}
```

**权威清单 `prototypes/INDEX.md`**（用表格，既有 `parseDocument` 能解析）：

| 路径 | 状态 | 服务条款 | 被取代于 |
|---|---|---|---|
| `prototypes/detail.html` | `authoritative` | FR-1, FR-4 | — |

- 状态值域：`authoritative` | `superseded`（逐字照 brief，不新增取值）。
- `被取代于` 列：被取代版本填权威路径，权威行留空。
- **#9 维护方式**：INDEX 由 agent 手写，登记门禁**只校验不改写**（保持「登记不改产物内容」纪律）。
- **#10 豁免留痕**：`prototype_exempt` 生效时必须在需求 D-x 里有一条对应裁定记录（人确认文档时必然看到）；G1 弹框文案带该行写进片段纪律，不作机器强制。
- **#7 豁免评论**：登记 / 推进时另写一条需求评论 `[豁免] <理由>`（与 `design_exempt` 同款）。
- **#13 确认时点**：门禁**只要求原型已登记**；确认章为可选加强；G1 确认需求文档时一并展示原型路径。
- **#8 观测值来源**：量原型稿自身渲染（显式窗口宽 + 状态，避免 REQ-292a 漏传宽度量错）；无法量化者由人给并标 `source: 'human'`。

### RTM 数据结构 `serves: FR-5, FR-9`

```typescript
// vendor/reqboard/src/rtm/types.ts —— 新增
export interface Prototype {
  path: string
  authoritative: boolean
  superseded_by?: string
  serves: string[]                                  // 该原型服务哪些 FR（来自 INDEX「服务条款」列）
  anchors: Array<{ fr: string; selector: string }>   // #49 与 #41 同形状，不另立命名
  geometry: PrototypeObservation[]                   // #41 / #49 同形状，不另立命名
}

export interface Decision {
  id: string        // D-1
  source: string    // 原话来源（会话消息 id 或时间戳 + 引用原话）
  verdict: string   // 裁定结论
  serves: string[]  // 影响 FR
  criterion: string // 可验证判据
}
```

- **#18 / #42 `rtm_version` 目标值 = `"2.0"`**：键是 `metadata.rtm_version`，与写入计数 `metadata.version` **不是同一个键**。
- **#14 验收项第二 source**：`decision-compare`（与 `prototype-compare` 并列）。
- **#37 source 载荷形状**：`{ kind:'prototype-compare'; prototypePath: string }`；`{ kind:'decision-compare'; decisionIds: string[] }`（都带载荷，便于渲染与追溯）。
- **#45 已豁免需求**：不强制 `prototype-compare`（批准不做原型 = 无原型可对照）；验收单改渲染一行**豁免说明**「本需求已豁免原型（理由：…）」，该行**不阻塞**验收材料提交。
- **#48 `submit:prototype` 触发载荷**：携带 `paths: string[]`（本次登记的原型路径）；生成器**仍以台账为事实源**，载荷只用于增量刷新与留痕，不当唯一来源。
- **#49 命名统一**：产物元数据与 RTM 两侧的锚点 / 几何量形状**统一指向 #41**，本文件不定义第二套字段名。

### 阶段门时序常量 `serves: FR-11`

```typescript
// 逾期由对应转移的门禁拒绝（不许"红了也没人看"）
export const StageGateTimeline: Readonly<Record<string, readonly string[]>> = {
  设计交完: ['必填节', '格式门', 'serves', '无 dangling'],
  拆分落库: ['覆盖对照（FR→卡）', 'UI 卡原型锚点'],
  实施收尾: ['E2E 覆盖', '三级追溯'],
}
```

### 兼容性分析 `serves: FR-3, FR-11`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `ArtifactKind` 增 `prototype` | 原型 HTML 落 `notes` | 落 `prototype` | 旧路径 `prototype/*.html` 仍识别为 prototype，门禁消息提示迁移到 `prototypes/` |
| `rtm-brainstorming.yml` 增 `prototypes` / `decisions` 节 | 无该节 | 新生成的文件带节 | 旧文件缺节 = `pending`，**不判损坏**；未知 key 忽略不报错 |
| `rtm_version` 升位 | 旧版本号 | `metadata.rtm_version = "2.0"`（#18 / #42） | 读取器按节存在性判定，不按版本号硬拒 |
| `VerificationItemSource` 增两项 | 两值联合 | 四值联合（`prototype-compare` / `decision-compare`，带载荷 #37） | **#31 必须同时改三处 `taskId` 分支**：`AcceptSheet.ts`（弹框 header）、`accept-sheet-rtm-integration.ts`、`status-rtm-integration.ts`——否则静默退化成 `undefined` / `fr_id='UNKNOWN'` |
| 存量需求的 `rtm-brainstorming.yml` | 无 `prototypes` 节 | **#19 适用性判据**：只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince`（插件配置常量，默认规则上线日）的需求才判不健康 | 存量一律 `exempted: legacy` 并如实报告——冲突已拍板，不再存在张力 |
| 台账分片新增三个可选键（#50） | 旧记录没有这些键 | `StageArtifact.prototypeMeta?` / `TaskRecord.prototypeRefs?` / `TaskRecord.decisionRefs?` | **加性（additive）变更、零迁移**：旧记录缺键 = 未采集，**不补齐、不改写、无迁移脚本**；旧读取路径与旧形状不变 |
| 4 个新脚本新增 `--json`（#47） | 无该选项 | 默认人类可读，`--json` 输出机器可读结构 | 退出码语义不变（0 通过 / 1 失败 / 2 环境不可用）；既有调用不受影响 |

> **#50 口径（写死在本文各处）**：`prototypeMeta` / `prototypeRefs` / `decisionRefs` 是**台账分片里的新可选键**，
> 属**加性变更、零迁移**——不写「无 schema 变更」；旧记录缺键视为**未采集**，不补齐、不改写、不写迁移脚本，
> 旧读取路径与旧形状（缺省不注入）保持不变。

## 接口变更 `serves: FR-1, FR-3, FR-4, FR-11`

### 修改的接口 `serves: FR-1, FR-3, FR-4`

```typescript
// 新增（纯函数，与 parseDocument 同族）：锚点不计入 serves
export function stripPrototypeAnchors(text: string): string

// 新增门禁（命名逐字来自 design-brief §2）
export async function checkPrototypePresenceGate(
  docs: DocsReader, req: RequirementRecord,
): Promise<GateFailure | undefined>

export async function checkPrototypeVersionGate(
  docs: DocsReader, req: RequirementRecord,
): Promise<GateFailure | undefined>

export async function checkPrototypeAnchorsGate(
  docs: DocsReader, req: RequirementRecord,
): Promise<GateFailure | undefined>
```

**改动原因**：原型此前无门禁、无判定口径；三条门各管一件事（在不在 / 是不是唯一权威 / 能不能判），便于门禁消息精确点名。
**影响范围**：三条门由新增的 async helper `contentGatesForMove` 分派调用（#46），四条转移路径不吃新签名；同步单点 `assertArtifactGates` 与 `DocsReader` / `RequirementRecord` 形状均不变。

```typescript
// 改类型（零行为变化）：登记入口与产物簿共用
export type VerificationItemSource =
  | { kind: 'requirement' }
  | { kind: 'task'; taskId: string }
  | { kind: 'prototype-compare'; prototypePath: string }   // #37 UI 需求必出现的对照项
  | { kind: 'decision-compare'; decisionIds: string[] }    // #14 与上者并列

// 改函数（签名不变，产出内容变）
// src/application/use-cases/ExecuteTask.ts
//   buildSubtaskPrompt(...)：UI 卡追加「原型路径 + 本卡锚点」；所有卡追加「本卡关联 D-x 原话」
//   #12 新增内容渲染为三个小节标题（非 JSON 字段）：
//     【本卡原型（UI 卡）】/【本卡裁定（D-x 原话）】/【验收判据】

// 改函数（新增）：会话裁定留痕判据（#20）
//   复用两条读法（快照优先 / 冷读回落），只取 source.kind === 'user'，
//   只扫最近 N 条（默认 200），跑祈使词表
export async function hasDecisionTrace(
  sessionProbe: SessionProbePort, req: RequirementRecord, opts?: { limit?: number },
): Promise<boolean>

// #15 节点输入包字段
export interface NodeInputPrototypeFields {
  prototypeRefs?: string[]   // 渲染在「证据指针」节
  decisions?: string[]       // 渲染在「证据指针」节
}
```

**改动原因**：执行侧此前 5 字段、`context` 84/84 为空，子代理不知道原型在哪。
**影响范围**：仅提示词文本；调用方与字段数不变，非 UI 卡不追加原型段。

**决策门接口（#16 已拍板）**：模块文件名 `src/application/internal/decision-gates.ts`；留痕判据走 `hasDecisionTrace`（#20）。
**聚合门接口（#22 + #46 已拍板）**：**不新增** `assertPrototypeGates`；新增的**唯一** async 入口是 `contentGatesForMove(docs, req, from, to)`（`content-gate-wiring.ts`），四条路径在同步门之后调用；门函数本体分别在 `prototype-gates.ts` / `decision-gates.ts`。既有 G2 调用**不合并**。

```typescript
// src/application/internal/content-gate-wiring.ts —— #46 新增（唯一 async 分派入口）
export async function contentGatesForMove(
  docs: DocsReader, req: RequirementRecord, from: RequirementStatus, to: RequirementStatus,
): Promise<GateFailure | undefined>
// 同步单点保持不动：#46
//   assertArtifactGates(req, from, to): GateFailure | undefined   （签名与职责不变）
```
**门禁消息文案（#11 / #40 / #44）**：设计只定 `what` / `why` / `how` 模板与**必含 token**（文件路径 + 可执行命令）；
`GATE_HOW_ANCHOR` 正则扩为 `…|prototype_exempt|decision_…`，且所有新门的 `how` 必须含可执行锚点（`reqboard_submit(kind=prototype)` 或 `templates/…`）。

## 依赖关系 `serves: FR-4, FR-10`

**新增依赖**：

| 依赖项 | 版本 | 用途 | 不引入的后果 |
|---|---|---|---|
| 无 | — | 原型元数据用正则抽取（`<!-- proto-geometry {json} -->`），零新增运行时依赖 | 若引 HTML 解析库，则违背「不新增运行时依赖」边界且把渲染差异带进判据 |

**删除依赖**：无。

- 探针沿用仓库现有 headless Chrome 调用方式，不引第三方视觉/截图库。
- `application/` 层禁止 `import node:`（layer-boundary 用例机械检查），一切 IO 走端口注入。

## 目录结构 `serves: FR-1, FR-2, FR-3`

```
docs/requirements/<REQ>/
├── prototypes/                 # 新增：权威原型目录
│   ├── INDEX.md                # 新增：权威清单（表格四列：路径/状态/服务条款/被取代于）
│   └── <name>.html             # 新增：每个功能点一个 id="FR-N" 区块 + proto-geometry 块
└── prototype/                  # 旧路径（REQ-292a 形态）：兼容识别 + 门禁提示迁移，不新写

templates/
├── brainstorming/
│   ├── feature.md              # 改动：增「讨论与裁定记录（D-x）」节（仅 feature）
│   └── prototype.html          # #21 git mv 迁入：FR 锚点区块 + proto-geometry 块 + INDEX 表格骨架
└── design/prototype.html       # #21 旧路径不留（git mv，避免两份模板）

src/application/internal/
├── prototype-gates.ts          # 新增：三个原型门（≤400 行）
└── decision-gates.ts           # 新增：裁定门（#16 钉死文件名）

scripts/
├── template-gate-probe.mts     # 新增：R1
├── template-render-map.json    # 新增：#26 占位符渲染映射表（R1 输入）
├── doc-section-parity.mts      # 新增：R2
├── prompt-path-probe.mts       # 新增：R3
└── req-doc-validate.mts        # 新增：自检（并入 R1）
```

## 关键算法/流程 `serves: FR-1, FR-3, FR-4, FR-8, FR-9, FR-10, FR-11`

### ① 四条门禁路径的接线（全覆盖） `serves: FR-1, FR-8, FR-10`

```
   ① MoveRequirement（会话语义 reqboard_move）
   ② AskConfirm 的推进块（弹框确认后自动推进）
   ③ http/routers/requirements.ts 看板移动端点
   ④ ConfirmArtifact（看板确认后自动推进）
              |  |  |  |
              +--+--+--+--> 第一段（同步，不动 #46）
                            artifact-gates.assertArtifactGates(req, from, to)
                            |-- 产物存在门
                            '-- 人工确认门
                                   |
                                   v
                            第二段（新增 async 唯一 helper，#46）
                            content-gate-wiring.contentGatesForMove(docs, req, from, to)
                                   |
                                   +--> 按 (from,to) 分派 -->
                                   |      presence 门 --> prototype_missing
                                   |      version 门  --> prototype_version_conflict
                                   |      anchors 门  --> prototype_anchor_missing
                                   |      裁定门      --> decision_log_missing / decision_entry_invalid
                                   |
                                   v
                         拒绝信封：码 + gaps（点名路径/条目）+ how（补什么命令）
```

| # | 路径 | 文件 | 接入点（**同步门之后**调用 `contentGatesForMove`，#46） | 回归断言（缺任一即红） |
|---|---|---|---|---|
| ① | 会话语义转移 | `src/application/use-cases/MoveRequirement.ts` | 既有 `assertArtifactGates` 调用点之后 | 缺原型 → 拒 + `prototype_missing`；G2 仍生效 |
| ② | 弹框确认推进 | `src/application/use-cases/AskConfirm.ts` | 推进块（现状无门，**新增接线**） | 同上，断言走的是同一 helper |
| ③ | 看板移动端点 | `src/http/routers/requirements.ts` | 转移前校验块（REQ-292a 丢门处） | 同上；G2 仍生效 |
| ④ | 看板确认推进 | `src/application/use-cases/ConfirmArtifact.ts` | `advanceTargetFor` 后推进块（**新增接线**） | 同上 |

- **#46 接线纪律（已拍板）**：
  - **不动同步单点**：`assertArtifactGates(req, from, to)` 保持同步、只负责产物存在 / 人工确认，签名与职责都不变。
  - **唯一 async helper**：`contentGatesForMove(docs, req, from, to)` 放 `src/application/internal/content-gate-wiring.ts`，内部按转移分派到原型门 / 裁定门；四条路径在同步门**之后**调用它。
  - **不合并既有 G2 调用**（避免把本需求扩成重构）；未来若要收敛成单一 async 入口，另立项。
  - **回归同时锁两道**：四路径用例既锁 G2（既有完整性门）又锁新门——保证「不再有路径漏门」。
- **判定单点纪律**：判定逻辑只在 `prototype-gates.ts` + `decision-gates.ts` 写一次，四条路径只调用不复制。
- **只有 UI 需求生效**：`sides` 含 frontend 且 category 属 feature / refactor；其余需求四条路径一律放行（`contentGatesForMove` 内部即返 undefined）。
- **逆向判据**：人为注释掉任一路径的调用 → 对应用例必须红（防「某一版快照又丢一条」）。

### ② INDEX 权威唯一性判定 `serves: FR-3`

```
读 prototypes/INDEX.md
   |
   +--> parseDocument().tables：取表头含「路径」「状态」的表
   |        |
   |        +-- 表不存在 / INDEX.md 缺失 -----------> prototype_version_conflict
   |        |
   |        +-- rows 中 status == 'authoritative' 计数
   |                 |
   |                 +-- == 1 --> 该行「路径」= 权威路径（继续下一步）
   |                 +-- == 0 --> 拒（无权威版本）
   |                 +-- >= 2 --> 拒并点名多份路径（REQ-292a 形态）
   |
   +--> 扫描 requirement.md 与 design/frontend.md 中出现的原型路径集合 P
            |
            +-- 任一 p ∈ P 且 INDEX 状态 == 'superseded' --> 拒（引用被作废版本）
            +-- 任一 p ∈ P 且 p != 权威路径 -------------> 拒（引用不一致）
            +-- 权威原型必须覆盖 INDEX「服务条款」列声明的每个 FR
```

| 判定 | 取值 | 结论 |
|---|---|---|
| `authoritative` 计数 | 恰好 1 | 通过 |
| `authoritative` 计数 | 0 或多条 | `prototype_version_conflict` |
| 文档引用路径 | == 权威路径 | 通过 |
| 文档引用路径 | 指向 `superseded` / 非权威 | `prototype_version_conflict`（点名两份） |

### ③ 锚点 strip 防假引用 `serves: FR-11`

```
文本 text
   |
   +-- stripPrototypeAnchors(text)：把 \S+#FR-\d+ 形态替换为固定 token <proto-anchor>（#6）
   |        |
   |        +--> collectIds(...) --> serves（锚点不再产出 FR 编号，覆盖度不虚高）
   |
   +-- 命中集合单独记入 protoRefs（任务卡 / 设计章节）
            |
            +--> 覆盖度**单列统计**，不与 FR 引用混算
```

| 项 | 规则 |
|---|---|
| 规则 | **锚点不计入 serves**；serves 抽取前先调用 `stripPrototypeAnchors(text)` |
| 占位符形态 | 固定 token **`<proto-anchor>`**（#6，便于测试断言与反查） |
| 锚点统计 | 独立字段 `protoRefs`，单独统计 |
| 回归 | 贴锚点不写实现 → 覆盖度**不上升**；`collectIds` strip 后不再产出该 FR（现状 `collectIds('prototypes/x.html#FR-4')` → `['FR-4']`，是假引用） |

### ④ D-x 连续性 / 唯一性 `serves: FR-8, FR-9, FR-11`

```
[必需节] 「讨论与裁定记录（D-x）」
   |
   +-- 缺节 或 空节（且有裁定留痕）--------------> decision_log_missing
   |
   +-- 逐行取五列：编号 | 原话来源 | 裁定 | 影响 FR | 判据
   |        |
   |        +-- 任一列空 / 「影响 FR」未命中真实 FR --> decision_entry_invalid（gaps 列条目编号）
   |
   +-- 编号集合：checkClauseSequence 思路，独立命名空间
   |        +-- 跳号（D-1, D-3）--> 拒
   |        +-- 重复（D-2 两次）--> 拒（用未去重清单，走 checkClauseDuplicates 同款口径）
   |
   +-- 每条 D-x 至少被一条 FR 明细或一张任务卡 requirementRefs 引用
            +-- 未被引用 --> 覆盖度点名该 D-x
```

| 项 | 决定 |
|---|---|
| 节名 | `## 讨论与裁定记录（D-x）`（**仅 feature 需求模板**，D-12） |
| 编号 | `D-1`、`D-2`…；连续、唯一，独立命名空间 |
| 编号白名单 | `ID_PATTERN` 增 `D-\d+`（与既有 `D-[A-Z]+-\d+` 不冲突） |
| 真空态 | 允许整节写「本节无裁定」，不视为空节 |
| 留痕判据 | 人类消息含祈使标记（`改成/不要/必须/加上/应该是/记得/注意/别/要`）→ 视为存在裁定留痕；该启发式**只用于「要求非空」**，不判内容 |

### ⑤ 豁免生效条件 `serves: FR-1`

```
sides 含 frontend 且无已登记 prototype
   |
   +-- prototype_exempt 缺失 / 理由为空 -----------> prototype_missing（豁免无效）
   |
   +-- 理由非空
   |      |
   |      +-- requirement 产物 confirmedAt 已写（G1 已确认）--> 放行 + 留痕
   |      +-- 未落章（agent 自豁免） -----------------------> prototype_missing
   |
   +-- 非 UI 需求（sides 不含 frontend）-------------> 不适用本条（不加仪式）
```

- 载体：`requirement.md` front-matter `prototype_exempt: <理由>`——与 `design_exempt` 同款。
- **不新增弹框**：搭既有 G1 确认门的车（D-13）；agent 不能自己豁免自己。
- 留痕：豁免生效时在需求评论写明「豁免来源 = G1 确认 + 理由原文」。

### ⑥ 阶段门时序 `serves: FR-11`

| 时点 | 必须转绿的门 | 逾期后果 | 依据常量 |
|---|---|---|---|
| 设计交完 | 必填节 + 格式门 + serves + 无 dangling | 设计产物确认 / 推进被拒 | `StageGateTimeline.设计交完` |
| 拆分落库 | 覆盖对照（FR→卡）+ UI 卡原型锚点 | 拆分落库门禁拒绝 | `StageGateTimeline.拆分落库` |
| 实施收尾 | E2E 覆盖 + 三级追溯 | 实施收尾门禁拒绝并点名（#39 内部码 `stage_gate_overdue` / 传输 `REQBOARD_STAGE_GATE_OVERDUE`） | `StageGateTimeline.实施收尾` |

- 现状基线：编号链 orphan、E2E 覆盖 false、三级追溯 FAIL 在 brainstorming 阶段**属正常**——本设计把「何时必须转绿」写死，堵住「红了也没人看」。

### 关键决策点 `serves: FR-3, FR-4, FR-8, FR-11`

| 决策 | 选项A | 选项B | 选了哪个 | 为什么 |
|---|---|---|---|---|
| 权威版本载体 | 页内标记 | `prototypes/INDEX.md` 表格 | INDEX 表格 + 页内标记位并存（权威判定以 INDEX 为准） | `parseDocument` 直接能解析表格；页内标记位留给模板骨架 |
| 几何量载体 | 引 HTML 解析库 | 单块注释 + 正则 | 单块注释 `<!-- proto-geometry {json} -->` | 零新增运行时依赖，与既有 doc 解析同风格 |
| 锚点是否算 FR 引用 | 算（省事） | 单列 `protoRefs` | 单列 | `collectIds` 实测会假引用，覆盖度虚高 |
| 裁定门放在哪 | 验收时才查 | `brainstorming → design` 就卡 | 需求阶段就卡 | 验收才发现 = 白干一轮（D-3 原话） |
| 机器是否抽取裁定 | 门禁全判 | 只判「留痕存在 / 条目无效」 | 后者 | 抽取要判断力（哪句是裁定），交给模型；门禁只做可机械核验的那半 |

## 安全/性能考虑 `serves: FR-1, FR-4`

**安全风险**：

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 原型 HTML 被当文档渲染执行 | 文档 Tab 被脚本污染 | 元数据只做**正则抽取**、不整体加载渲染；客户端原型单列分组、只做打开 |
| 门禁消息泄露会话原文 | D-x 原话来源进错误信息 | 消息只点名**条目编号与缺哪列**，不复制会话原文 |
| agent 自豁免绕过门禁 | 门禁形同虚设 | `prototype_exempt` 须理由非空 + requirement 已落章（人确认） |

**性能影响**：

| 指标 | 改前 | 改后 | 可接受吗 |
|---|---|---|---|
| 单次门禁判定 | 无此判定 | 目录级存在性 + 小文件解析（只读锚点区块，不渲染）< 100ms | 可接受 |
| 原型目录扫描 | 0 | 读 `INDEX.md` 一张表 + 每份权威 HTML 的正则抽锚点 | 可接受（原型份数为个位数） |
| 构建期片段内联 | 无变化 | 重生成产物体积随新增片段线性增长（量级极小） | 可接受 |

## 测试策略 `serves: FR-1, FR-3, FR-4, FR-7, FR-8, FR-9, FR-10, FR-11`

**必测场景**：

| 场景 | 输入 | 预期输出 | 用例编号 |
|---|---|---|---|
| R1 模板产物必过门禁 | 渲染 6 份模板占位符 | `missingCategoryDocs` + 格式门 + serves 门 → 0 缺口 | TC-R1 |
| R1 逆验证 | 人为改坏某模板的必填节标题 | 该回归**必红** | TC-R1R |
| R2 节名集合双向一致 | 门禁节名集合 vs 模板 H2 集合 | 双向相等（体现「该节仅 feature」） | TC-R2 |
| R2 逆验证 | 构造「模板多一节」「门禁少一节」两标本 | 均失败 | TC-R2R |
| R3 提示词路径可达 | 扫片段与回合指令里的路径 token | 全部可达；指向不存在文件 → 失败并点名 | TC-R3 |
| R4 脚本接线 | `package.json` scripts | 含 `prompts:check` 且进提交前清单；改片段不重生成 → 该命令 exit 非 0 | TC-R4 |
| 四路径回归 ① | UI 需求缺原型，走会话语义转移 | 拒 + `prototype_missing`；**G2 门同时仍生效**（#46 双锁） | TC-P1 |
| 四路径回归 ② | 同上，走弹框确认推进 | 拒 + 同一码（同一 helper） | TC-P2 |
| 四路径回归 ③ | 同上，走看板移动端点 | 拒 + 同一码 | TC-P3 |
| 四路径回归 ④ | 同上，走看板确认推进 | 拒 + 同一码 | TC-P4 |
| 四路径逆验证 | 逐条注释掉某路径的 `contentGatesForMove` 调用 | 对应用例**必红**（四条各一次） | TC-P4R |
| 同步门不动（#46） | 断言 `assertArtifactGates` 仍为同步签名、仍只做产物存在 / 确认 | 签名与职责不变；未合并既有 G2 调用 | TC-P5 |
| 豁免验收单（#45） | 已批准 `prototype_exempt` 的 UI 需求提交验收材料 | **不强制** `prototype-compare`；验收单渲染豁免说明行「本需求已豁免原型（理由：…）」且**不阻塞**提交 | TC-C2E |
| 脚本 `--json`（#47） | 4 个新脚本默认与 `--json` 各跑一次 | 默认人类可读、`--json` 机器可读；退出码语义不变（0 / 1 / 2） | TC-R5 |
| RTM 触发载荷（#48） | `submit:prototype` 携带 `paths: string[]` | 载荷用于增量刷新与留痕；生成器**仍以台账为事实源**（载荷与台账不一致时以台账为准） | TC-C6P |
| 加性零迁移（#50） | 旧台账分片（缺 `prototypeMeta` / `prototypeRefs` / `decisionRefs`） | 读取不报错、键缺失=未采集；无迁移脚本、不补齐、不改写；旧形状不变 | TC-K5 |
| 条件生效 | `sides:[frontend]` 未登记 prototype / 交齐后 | 先拒后放行；`sides:[backend]` 不受影响 | TC-C1 |
| 豁免（D-13） | 理由空 / 理由非空但未落章 / 已落章 | 拒 / 拒 / 放行 | TC-C2 |
| 产物识别 | `kindForRelPath('prototypes/x.html')`；旧 `prototype/x.html` | `'prototype'`；识别 + 提示迁移 | TC-C3 |
| 权威版本 | 两版并存；文档引用 `superseded` | 拒并点名两份；指向作废版本拒 | TC-C4 |
| 锚点与几何量（D-10） | 缺 `id="FR-N"` 区块 / 缺 geometry 块 / geometry 含阈值字段 | 拒并点名缺哪条；阈值不出现在原型自证路径上 | TC-C5 |
| 追溯贯通 | UI 卡缺原型锚点；本需求自身标本 | 拆分覆盖门拒绝；RTM 含 `prototypes` 节 + 覆盖多一维 | TC-C6 |
| 执行可见 | `buildSubtaskPrompt` 对 UI 卡 / 非 UI 卡 | UI 卡产含原型路径与锚点；非 UI 卡不追加 | TC-C7 |
| 判据硬（逆验证） | 探针人为改坏一处几何量 | 退出码非 0；无「只打印不判失败」的诊断行（源码级断言） | TC-C8 |
| 裁定落账（FR-8） | 有留痕无节 / 有节但条目缺原话来源或缺影响 FR | 拒并点名缺节；逐条点名无效条目 | TC-D1 |
| 裁定边界（D-11） | 只有疑问句 / 祈使被漏记 | 「本节无裁定」放行；漏记拒 | TC-D2 |
| 裁定被引用（FR-9） | 存在未被引用的 D-x；带 D-x 的卡 | 覆盖度点名该 D-x；提示词含该裁定原话 | TC-D3 |
| 返工顺序（FR-9） | 「人指出文档没写」标本 | 工单要求先补 D-x 条目再改代码 | TC-D4 |
| 禁假引用（FR-11） | `collectIds('prototypes/x.html#FR-4')`；只贴锚点标本 | strip 后不产出该 FR；覆盖度**不上升** | TC-V1 |
| 编号白名单（FR-11） | `collectIds('D-1')`；未定义却被引用 | `['D-1']`；判 dangling | TC-V2 |
| 阶段门时序（FR-11） | 逾期仍红标本 | 对应阶段门禁拒绝并点名 | TC-V3 |
| 自检脚本（FR-11） | `scripts/req-doc-validate.mts` 自身逆验证 | 存在且并入 R1；改坏必填节 → 非 0 退出 | TC-V4 |
| 传输码映射（#35） | 五个内部码各一次；未知内部码一次 | 各映射到 `REQBOARD_*`；未知码**原样透传**（不静默降级为 MISSING_ARTIFACT） | TC-E1 |
| HTTP 状态登记（#43） | 逐个新错误码查 `STATUS_BY_CODE` | 全部登记为 **400**；漏登记会如实落 500（看板显示"服务器坏了"）→ 用例拦 | TC-E2 |
| `how` 锚点（#40 / #44） | 逐条新门的拒绝消息 | 必含可执行锚点（`reqboard_submit(kind=prototype)` 或 `templates/…`）；`prototype_exempt` 命中 `GATE_HOW_ANCHOR` | TC-E3 |
| 缺对照项（#38） | UI 需求提交验收材料时不带 `prototype-compare` | 内部 `verification_prototype_compare_missing` + 传输 `REQBOARD_VERIFICATION_INCOMPLETE` | TC-E4 |
| 端口连带（#31） | 新 source 形状喂 `AcceptSheet.ts` 弹框 header、`accept-sheet-rtm-integration.ts`、`status-rtm-integration.ts` | 三处 taskId 分支显式处理，不出现 `undefined` / `fr_id='UNKNOWN'` | TC-E5 |
| 模板渲染映射（#26） | `scripts/template-render-map.json` 未在表内的占位符 | R1 脚本 exit 1 并点名该占位符 | TC-R1M |
| 探针环境（#25） | 无 Chrome 环境 / 未显式传窗口宽 | **exit 2**（响亮失败，不许静默跳过）；显式传 `--window-size` 并回读 PNG 真实像素 | TC-C8E |
| 冷读会话路径（#24） | 冷读回落读法 | 单测只覆盖快照路径；冷读标 `@integration`（真机会话标本） | TC-D1I |
| 文档面板协议（#30 / #32 / #34） | 原型行投影 | `DocPanelKind` 含 `'prototype'`；原型行保留 `data-doc-row="1"`；恒等式 = `documents` 中来自台账的行数 + Σ`discovered.count` == `artifacts.length` | TC-K3 |
| 编号标签（#33） | `ArtifactKind` 新增值 | `src/shared/artifact-labels.ts` 中 `prototype` 配中文名「原型」；`Record<ArtifactKind, DocPanelKind>` 穷尽 | TC-K4 |
| 兼容 | 存量 66 条 RTM 旧文件；已归档需求 | 读取不报错；**#19 适用性判据**下存量一律 `exempted: legacy`、不被判不健康；不被追溯拒绝 | TC-K1 |
| 类型与知识层 | `pnpm typecheck`；`pnpm kb:build && pnpm kb:check` | 全绿 | TC-K2 |

**逆验证清单（人为改坏 → 必红）**：R1 模板节标题、R1 渲染映射表项、R2 节名集合、R3 路径指针、R4 未重生成、
四条路径各一次、探针几何量、`stripPrototypeAnchors` 移除、`req-doc-validate.mts` 必填节、`STATUS_BY_CODE` 漏登记。

## 设计模式 `serves: FR-1, FR-2, FR-10`

| 模式 | 用在哪个组件 | 解决什么问题 | 不用会怎样 |
|---|---|---|---|
| 条件必交策略（复用） | `category-doc-sets.ts` 的 `conditionalStageArtifacts` | `sides` 驱动「只有 UI 需求才要原型」 | 要么给所有需求加仪式，要么在门禁里散写 if |
| 门禁分层 + 单点分派 | 同步 `artifact-gates.assertArtifactGates`（不动）+ 唯一 async `content-gate-wiring.contentGatesForMove`（#46）+ `prototype-gates.ts` | 四条转移路径共用同一判定，两段职责不混 | 复现 REQ-292a：某条路径漏门成为后门；或把同步/异步职责混在一起变成重构 |
| 纯函数抽取（与 `parseDocument` 同族） | `stripPrototypeAnchors` / 几何量正则 | 判定可单测、可逆验证、零 IO | 判定埋在 IO 里，测不动也验不了 |
| 双列追溯（编号引用 / 锚点引用分列） | 覆盖度与 RTM | 禁假引用、覆盖度可证伪 | 贴锚点即算 serve，链上全绿实际没做 |

**未引入的模式**：无新增架构级模式；不新增第五条注入通路、不重构注入架构。

## 错误处理 `serves: FR-1, FR-3, FR-4, FR-8`

**新增错误码/异常**（内部码逐字照 design-brief §2 / §3；传输码照 §10 #35）：

| 错误码（内部） | 传输码（会话侧，#35） | HTTP（#43） | 触发条件 | 用户看到什么 | 如何恢复 |
|---|---|---|---|---|---|
| `prototype_missing` | `REQBOARD_MISSING_PROTOTYPE` | 400 | `sides` 含 frontend 且无已登记 prototype，且无有效 `prototype_exempt` | 点名「缺什么、放哪、用什么命令补」 | `reqboard_submit(kind=prototype)`；或走豁免（理由非空 + G1 人确认） |
| `prototype_version_conflict` | `REQBOARD_PROTOTYPE_VERSION_CONFLICT` | 400 | `INDEX.md` 缺失 / `authoritative` ≠ 1 / 文档引用指向 `superseded` | 点名两份路径与冲突类型 | 在 INDEX 标记作废版本，把引用改为权威路径 |
| `prototype_anchor_missing` | `REQBOARD_PROTOTYPE_ANCHOR_MISSING` | 400 | 权威原型缺 `id="FR-N"` 覆盖 / 缺 `proto-geometry` 块 / **块数 ≠ 1（#4，点名块数）** / geometry 里出现阈值字段 | 点名缺哪条 FR 锚点或缺哪个块 | 按 `templates/brainstorming/prototype.html` 补锚点与观测量；阈值移到设计阶段产物 |
| `decision_log_missing` | `REQBOARD_DECISION_LOG_MISSING` | 400 | 需求文档缺「讨论与裁定记录（D-x）」节，或 `hasDecisionTrace` 为真而该节为空 | 点名缺节 / 空节，并提示真空态写法 | 逐条落账，或显式写「本节无裁定」 |
| `decision_entry_invalid` | `REQBOARD_DECISION_ENTRY_INVALID` | 400 | 条目五列不齐 / `原话来源` 为空 / `影响 FR` 未命中真实 FR / 编号跳号或重复 | `gaps` 列**具体条目编号** | 按条目编号逐条补齐或删除无效条目 |
| `verification_prototype_compare_missing` | `REQBOARD_VERIFICATION_INCOMPLETE` | 400 | UI 需求提交验收材料时缺 `prototype-compare` 项（#38） | 点名缺「与原型对照截图（含差异说明）」 | 补该项后重交验收材料 |
| `stage_gate_overdue` | `REQBOARD_STAGE_GATE_OVERDUE` | 400 | `StageGateTimeline` 对应阶段门逾期仍红（#39） | 点名逾期未转绿的门 | 按门名补对应产物 / 引用后重试转移 |

**传输层实现约束（#35 / #43 / #40 / #44）**：

- `transportCodeOf` 改为**显式映射表**（上表第 2 列）；**未知内部码原样透传**，不静默降级为 `MISSING_ARTIFACT`。
- **每个新错误码都要逐条登记** `src/http/envelope.ts` 的 `STATUS_BY_CODE` = 400——漏登记会**如实落 500**（看板显示成「服务器坏了」），列为硬约束 + 用例 TC-E2。
- `GATE_HOW_ANCHOR` 正则扩为 `…|prototype_exempt|decision_…`；所有新门的 `how` 文案**必须含可执行锚点**（`reqboard_submit(kind=prototype)` 或 `templates/…`）。

**恢复路径通则**：拒绝一律带三段信封（`what` 缺什么 / `why` 为什么 / `how` 补什么命令），
与 `artifact-gates.ts` 既有口径一致；空泛消息（只写「被拒」）视为缺陷。

**存量/直种需求豁免**：`req.artifacts` 为空（存量）与本仓既有口径一致**放行**新门，不追溯（#19）。

## 配置项 `serves: FR-1, FR-10`

| 配置项 | 默认值 | 作用 | 改了会怎样 |
|---|---|---|---|
| `requirement.md` front-matter `prototype_exempt` | 无（不豁免） | 需求级豁免原型门；理由必填（#10 另需一条 D-x 裁定记录 + #7 需求评论 `[豁免] <理由>`） | 理由非空且 requirement 已落章才生效；agent 自填不生效 |
| `prototypeRulesSince`（插件配置常量，#19） | **规则上线日** | 存量健康判据的适用性分界：`createdAt < prototypeRulesSince` → `exempted: legacy` | 改早了会把存量判成不健康；改晚了会让新需求漏判 |
| `hasDecisionTrace` 扫描窗口（#20） | `limit: 200`（最近 N 条） | 裁定留痕判据的取样范围 | 调小可能漏判「存在裁定留痕」；调大增加会话读取成本 |
| `scripts/template-render-map.json`（#26） | 含 `{{TASK_ID}}`、`{{DESIGN_SERVES}}`→`FR-1` 等映射（前者渲染为占位形态值，非真实卡） | R1 的占位符渲染口径 | 新模板出现未登记占位符 → R1 脚本 exit 1 并点名 |
| `package.json` scripts `prompts:check` | 无（新增） | R4：内联重生成 + 片段校验两条命令 | 不接进 pnpm = 改了片段没重生成是静默断链 |
| `prototype_exempt` 之外的豁免 | 无 | 本条**不新增**配置项（不新增弹框、不加开关） | 需要开关须另立项 |

## 监控埋点 `serves: FR-5, FR-11`

| 埋点 | 触发时机 | 记录内容 | 用于排查什么问题 |
|---|---|---|---|
| RTM 健康检查 | 生成/刷新 RTM 时 | UI 需求缺 `prototypes` 节 = 不健康并点名 | 文件在但内容空（静默降级） |
| 覆盖度点名 | 覆盖度计算时 | 未接原型的 UI 卡、未被引用的 D-x 清单 | 「链上看着全绿实际没做」 |
| 阶段门时序告警 | 各阶段门到期 | 逾期未转绿的门名 | REQ-292a 的门禁丢 9 天无人发现 |
| 门禁拒绝信封 | 每次拒绝 | 码 + gaps + how | 修复指引是否可执行 |

## 部署变更 `serves: FR-1, FR-2, FR-10`

| 变更项 | 上线步骤 | 回滚步骤 |
|---|---|---|
| 三个原型门 + 裁定门 | 随 dist 构建发布；无数据迁移（判定只读目录与文档） | 回退 dist 到上一版；已登记产物与 INDEX 无需回滚（门禁通过也留档） |
| RTM 两节 + `rtm_version` 升位 | 新生成文件带新节；旧文件不重写 | 旧读取器按「缺节 = pending、未知 key 忽略」容忍，无需回滚 |
| 片段产物重生成 | `pnpm prompts:check` 通过后构建 | 回退 `src/domain/prompt/generated/fragments.ts` 与其片段源 |
| `templates/brainstorming/prototype.html` 迁入 + `prototypes/` 骨架落盘 | 进入 brainstorming 时幂等落盘（不存在才写） | 目录留档**不删**（删了会让已登记产物指向不存在文件） |
| `package.json` 增 `prompts:check` | 直接提交 | 删除该 script 条目（R4 用例随之红，需一并回滚） |
| 台账分片新可选键（#50） | **无迁移脚本**：加性变更，写路径按需带上新键 | 无需回滚（旧记录缺键 = 未采集，读取路径不变） |
| `contentGatesForMove` 接线（#46） | 四条路径在同步门后加一行调用 | 删除该行调用即回到旧行为（但四路径回归会红，须一并回滚用例） |

## 兼容与存量豁免 `serves: FR-2, FR-3, FR-11`

| 口径 | 决定 | 依据 |
|---|---|---|
| 存量 66 条 RTM 旧文件 | 缺 `prototypes` / `decisions` 节 = `pending`，**读取不报错、不判损坏**；未知 key 忽略 | brief §5 兼容基线 |
| 已归档需求（8 条） | **不追溯**：不回填原型、不补 D-x、不被新门禁追溯拒绝 | 需求边界 1 / 7 |
| REQ-292a（accepting） | 只享受「解析修好」红利，另行收尾，不在本设计范围 | 需求边界 1 |
| 存量/直种需求（`artifacts` 为空） | 新门**放行**（与既有 `checkDesignServesGate` 等门同口径） | 仓库既有口径 |
| 旧原型路径 `prototype/*.html` | 仍识别为 prototype；门禁消息提示迁移到 `prototypes/` | brief §1 |
| 非 UI 需求 | 不要求原型、不要求 frontend.md | 需求边界 4 |
| 上游 skill 原文 | 只改本仓段（`common/iron-rules.md` / `<stage>/<category>.md` / `heavy/overrides.md`），vendored 原文逐字节不动 | 需求边界 8 |
| **#19 已拍板** | 存量 UI 需求健康判据 = **适用性判据**：只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince` 的需求才判不健康；存量一律 `exempted: legacy` 并如实报告 | brief §10 #19 |
| **#50 已拍板** | 新键 `StageArtifact.prototypeMeta?` / `TaskRecord.prototypeRefs?` / `TaskRecord.decisionRefs?` = **加性变更、零迁移**；旧记录缺键 = **未采集**，不补齐、不改写、无迁移脚本，旧读取路径与旧形状不变 | brief §10 #50 |
| **#45 已拍板** | 已批准豁免的需求**不强制** `prototype-compare`；验收单只渲染豁免说明行且不阻塞提交 | brief §10 #45 |

## 文档更新清单 `serves: FR-10, FR-11`

| 文档 | 更新内容 | 负责人 |
|---|---|---|
| `templates/README.md` | 登记 `templates/brainstorming/prototype.html` 迁入与 INDEX 表格约定 | 本需求 |
| 知识层规范页（`kb-conventions-sync` 生成） | `prompts:check` 接进 pnpm 与提交前清单（R4 同源） | 本需求 |
| `docs/architecture/`（项目说明书） | 归档阶段写「原型产物 + 裁定落账」两节认知 | 归档阶段 |
| 本设计同目录其余 6 份设计文档 | 命名/字段/错误码引用本文件与 brief，不各写一份 | 本需求 |

## 遗留问题 `serves: FR-7, FR-8, FR-10, FR-11`

> 第一轮 7 处「待定（需补充 brief）」已全部由 brief §10 决议吸收：
> #5 / #8 / #16 / #17 / #18 / #19 / #20 / #21 / #22 / #26 / #31 / #33 / #35 / #37 / #41 / #43 / #45 / #46 / #47 / #48 / #49 / #50，
> 详见本文各节的 `#编号` 引用。下表只列**决议后仍然开放**的事项（无「待定（需补充 brief）」残留）。

| 问题 | 影响 | 计划何时解决 |
|---|---|---|
| 需求级验收标准缺「UI 需求验收单必含原型对照项」一条（#27 缺口 A） | 需求文档侧少一条可跑断言 | **#27 已定设计侧补足**：`interfaces.md` 定 `prototype-compare` 项接口并声明「UI 需求验收单缺该项即提交被拒」；需求侧是否补一条**留给用户决定**（可选 `change_note` 重确认） |
| 裁定边界的召回率不可测（#23） | 启发式只保证「命中即要求非空」，可能漏记祈使句 | 如实写「只锁启发式命中即要求非空」；**召回率由 G2 人评审承担**，不假装可测 |
| 冷读会话路径的测试成本（#24） | 单测覆盖不全会给人「已全测」错觉 | 单测只覆盖**快照路径**；冷读标 `@integration`（真机会话标本） |
| 用例的 `covers` 字段在需求侧已写承接关系（#28） | 设计阶段承接卡尚不存在，填了即假引用 | **设计阶段不填**，落库后由既有 backfill 机制回填，文档如实标注 |
| 本需求自身是否要交原型 / 写豁免（#29） | 规则由本需求实现，自证会循环 | **都不做**：规则生效前不追溯（边界 1 / 7）；本需求前端改动极小、无独立原型资产，`frontend.md` 如实写明 |

## 关键决策与取舍 `serves: FR-1, FR-3, FR-4, FR-8, FR-10, FR-11`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 原型放哪个阶段 | 留在设计阶段做 | **需求阶段必交** | 原型是「要做什么」的载体，晚于需求阶段无法约束需求与下游（D-1） |
| 判据强度 | 像素/视觉相似度 | **结构 + 几何量 + 令牌** | 渲染差异（字体/窗口宽）制造长期假红；REQ-292a「漏传窗口宽导致量错」是前车之鉴 |
| 是否新增独立 kind | 复用 `design`（与 frontend.md 合并） | **独立 `kind=prototype`** | 两者生命周期不同；合并会让「缺原型」与「缺设计」同一条消息，人分不清补什么 |
| 权威版本载体 | 页内标记（要解析 HTML 结构） | **INDEX 表格为准** | `parseDocument` 已能解析表格，判定可单测；页内标记只做骨架位 |
| 几何量载体 | 引 HTML 解析库 | **单块注释 + 正则** | 零新增依赖，且不把渲染带进判据（需求边界 5） |
| 锚点算不算 FR 引用 | 锚点即引用（省事） | **锚点单列 `protoRefs`** | 实测 `collectIds('prototypes/x.html#FR-4')` 返回 `['FR-4']`，混算会让「贴锚点」刷出漂亮覆盖度（D-9-2） |
| 是否扩编号白名单 | 让 D-x 保持不可见、FR-9 降级为文本检查 | **扩白名单 + 定 D-x 定义链** | 不可见 = 无法核验「必须被引用」（D-9-1） |
| 裁定门放哪一步 | 只在验收时检查 | **brainstorming → design 就卡** | 验收才发现 = 已白干一轮（D-3 原话） |
| 机器是否抽取会话裁定 | 门禁全判（含内容抽取） | **只判「留痕存在 / 条目无效」** | 抽取要判断力（哪句是裁定），交给模型；门禁只做可机械核验的那半 |
| 改造范围 | 只改门禁（最小改动） | **门禁 + 模板 + 四条注入面同改** | 改门禁不改产出面 = 断链：看不到要求就静默跳过，或模板不产该节而卡死（D-7） |
| 同源怎么守 | 靠评审与自觉 | **R1~R4 机械回归** | D-5 已证明「靠自觉」会分叉：模板与门禁口径不一致且双方都没报错 |
| 上游 skill 片段怎么改 | 直接改 vendored 原文 | **只改本仓段** | `check-prompt-fragments` 断言上游片段与其 vendor 逐字节一致，改原文会被漂移门禁打回 |
| 几何量阈值从哪来 | 原型里写阈值、自己声明自己过 | **原型只声明观测量名与实测值**，阈值由设计阶段按真实数据定死 | 自证不可信；阈值属设计决策，需看到真实页面数据（D-10） |
| 模板改几份 | 六份需求模板同改 | **仅 feature**，其余按需 | 省 5 份不相关模板的改动；代价是类型间不完全对齐（如实记在兼容节） |
| 存量处理 | 全量追溯回填 | **只修解析、不追溯** | 8 条已归档，回填是无收益的翻旧账（需求边界 1 / 7） |

## 技术方案与亮点 `serves: FR-1, FR-4, FR-5, FR-10, FR-11`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| TypeScript | 仓库既有（`typescript ^5.3.3`） | 门禁/类型/脚本 | 与仓库同栈；不用别的语言 |
| vitest | 仓库既有（`vitest ^2.0.0`） | 用例与逆验证 | 既有测试框架；不引新框架 |
| `yaml` | 仓库既有（`yaml ^2.9.1`） | RTM 读写 | 既有依赖；不新增解析库 |
| headless Chrome（仓库既有探针方式） | 仓库既有 | 端到端几何量探针 | 不引第三方视觉/截图库（需求边界 5） |
| 新增运行时依赖 | — | **无** | 原型元数据用正则抽取 |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/domain/artifact/ArtifactSpec.ts` | 产物规约：`prototype` kind + 路径→kind |
| `src/application/internal/category-doc-sets.ts` | 条件必交判定（`sides` 驱动） |
| `src/application/internal/prototype-gates.ts` | 三个原型门（取数 + 组装，≤400 行） |
| `src/application/internal/decision-gates.ts`（#16 钉死） | 裁定门（缺节 / 条目无效） |
| `src/application/internal/artifact-gates.ts` | 同步单点（**不动 #46**）：产物存在 / 确认 + 拒绝信封 |
| `src/application/internal/content-gate-wiring.ts` | **#46 唯一 async 分派入口** `contentGatesForMove(docs, req, from, to)` |
| `vendor/reqboard/src/rtm/*` | 两节生成 + 一维覆盖 + 宽容度 |
| `src/application/use-cases/ExecuteTask.ts` | 子卡提示词带原型与 D-x |
| `src/client/views/panels/docs.ts` + `QueryDocs.ts` | 原型作为确定交付物单列展示 |

**设计模式**：条件必交策略（复用 `sides` 驱动解析）+ 门禁分层单点分派（同步门不动 + #46 唯一 async helper，四路径统一调用）+ 纯函数抽取（判定可单测）。
未使用新架构级模式；不新增第五条注入通路。

**关键实现手法**：

- 锚点 strip：`stripPrototypeAnchors` 把 `\S+#FR-\d+` 换占位符后再 `collectIds`，从**源头**堵假引用（而不是在覆盖度里打补丁）。
- 元数据零依赖：原型内单块注释 `<!-- proto-geometry {json} -->` 走正则，与既有 doc 解析同风格。
- 分层分派（#46）：同步单点不动，三个门 + 裁定门挂在唯一 async helper `contentGatesForMove` 上，四条路径只调用不复制——复制就会再分叉。
- 宽容度前移：RTM 缺节 = `pending` 在**读取器**里定死，而不是在消费者里各写 try/catch。

**攻克的难点**：

| 难点 | 卡在哪 | 怎么解开的 |
|---|---|---|
| 四路径漏门（REQ-292a 丢 9 天） | 判定散在多条路径，快照同步会丢 | 判定下沉单点 + 一条用例对四路径各断言 + 逆验证 |
| 「贴锚点」刷覆盖度 | `collectIds` 把 `#FR-4` 当编号引用 | strip 前置 + 锚点单列 `protoRefs` |
| D-x 对校验器不可见 | `ID_PATTERN` 只有 `D-[A-Z]+-\d+`，`D-1` 0 命中 | 扩白名单 + 定「定义处/引用处/谁接收」三件链规则 |
| 改了片段没重生成（静默） | 构建期内联、运行时不读盘 | R4 把 `prompts:check` 接进 pnpm + 进提交前清单 |
| 下游门红了没人管 | 没有「何时必须转绿」的定义 | `StageGateTimeline` + 逾期由对应转移门禁拒绝 |

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 原型的地位 | 设计稿驱动开发，靠评审会对照 | 原型 = 产物 + 判据，门禁与探针替人做第一轮比对 | 「照原型做」从口头纪律变成代码级门禁 + 可失败断言 | `src/application/internal/prototype-gates.ts`；用例 TC-C5 / TC-C8 |
| 门禁的接线 | 每条转移路径各写一次校验 | 同步门不动 + **唯一 async helper** `contentGatesForMove` 分派，四路径只调用 | 复制必分叉（REQ-292a 的门禁丢 9 天）；合并既有 G2 会把本需求扩成重构（#46） | `content-gate-wiring.ts` / `artifact-gates.ts` + 用例 TC-P1~TC-P4R（同时锁 G2 与新门） |
| 覆盖度口径 | 引用（含锚点）都算 serve | 编号引用与锚点引用**分列** | 假引用会让覆盖度虚高 | `stripPrototypeAnchors` + 用例 TC-V1 |
| 讨论内容保真 | 把需求描述写详细些 | 编号化裁定（D-x）+ 五要素 + 下游必须引用 | 描述再详细也是概括，无法证伪「少了哪句」 | `templates/brainstorming/feature.md` + 用例 TC-D1 / TC-D3 |
| 契约同源 | 靠评审与自觉 | R1~R4 机械回归（模板产物过门禁 / 节名双向一致 / 路径可达 / 脚本接线） | D-5 已证明靠自觉会分叉且双方都不报错 | `scripts/template-gate-probe.mts` / `doc-section-parity.mts` / `prompt-path-probe.mts` / `package.json`；用例 TC-R1~TC-R4 |
| 校验器同步 | 新增节/编号后手工核对 | 固定清单（编号白名单 / 定义行 / serves 抽取 / 编号链 / RTM schema / 面板投影）+ 自检脚本 | 「新东西无人校验」或「校验器把对的判错」 | `scripts/req-doc-validate.mts`（9 项）；用例 TC-V2 / TC-V4 |
| 存量处理 | 全量追溯回填 | 只修解析、不追溯 | 8 条已归档，回填无收益 | 兼容与存量豁免节；用例 TC-K1 |
| RTM 层数 | 只在任务卡带锚点 | RTM 也插原型与裁定节点 | 链上断一层就查不到「哪个 FR 没原型承接」 | `vendor/reqboard/src/rtm/brainstorming-generator.ts` / `coverage-checker.ts`；用例 TC-C6 |
