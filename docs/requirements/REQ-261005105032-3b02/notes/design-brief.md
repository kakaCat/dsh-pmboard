# 设计 brief（REQ-261005105032-3b02）——7 份设计文档的**唯一契约源**

> 用途：7 份设计文档必须与本文件的命名/字段/错误码/门禁行为**逐字一致**，不得自行发明。
> 若某处本文件未定，**不要编**——在文档里写「待定（需补充 brief）」并在汇报里指出。
> 需求源：`docs/requirements/REQ-261005105032-3b02/requirement.md`（11 条 FR / 15 条 D-x 裁定）。
> 设计门禁硬约束（`content-gate-wiring.checkDesignContentGate`）：**每个 H2 必须带 `serves: FR-x`**，
> H1 或 front-matter 也要有 serves，且引用的条款必须真实存在（FR-1~FR-11）；违反 = 提交被拒。

## 0. 本次要交付的机制（四句话）

1. **原型成为需求阶段的一等产物**（`kind=prototype`），UI 需求不交出不了需求阶段（FR-1/2/3/4）。
2. **追溯贯通**：任务卡「设计落点」带原型锚点、RTM 插入原型节点、D-x 裁定进链（FR-5/9）。
3. **执行与验收可见**：子卡提示词带原型与 D-x 原话；UI 卡 acceptance 含原型对照判据；验收单加对照项（FR-6/7）。
4. **契约同源 + 文档校验同源**：模板、四条注入面、校验器同步改，并由 R1~R4 与自检脚本机械守住（FR-10/11）。

## 1. 产物模型（钉死）

| 项 | 决定 |
|---|---|
| 新 kind | `ArtifactKind` 增加 `'prototype'`；`ALL_ARTIFACT_KINDS` 同步 |
| 权威路径 | `docs/requirements/<REQ>/prototypes/<name>.html` |
| 旧路径 | `docs/requirements/<REQ>/prototype/*.html`（REQ-292a 形态）→ 仍识别为 prototype，**门禁消息提示迁移**到 `prototypes/` |
| 路径→kind | `NAME_TO_KIND` 增 `[/^prototypes\/.+\.html$/, 'prototype']` 与 `[/^prototype\/.+\.html$/, 'prototype']` |
| 权威清单 | `prototypes/INDEX.md`，**用表格**（既有 `parseDocument` 能解析），列为：`路径 \| 状态 \| 服务条款 \| 被取代于`。状态值域：`authoritative` \| `superseded` |
| 权威唯一 | INDEX 中 `authoritative` **恰好一条**；多条 → 拒；零条 → 拒 |
| 引用一致 | `requirement.md` / `design/frontend.md` 里出现的原型路径必须等于 INDEX 的权威路径；指向 `superseded` → 拒 |
| 元数据位置 | **不引 HTML 解析库**：原型内用单块注释 `<!-- proto-geometry {json} -->`（正则抽取，与既有 doc 解析同风格） |
| geometry json 形状 | `{"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]}`；**只放观测量名与实测值，禁止放阈值**（D-10） |
| FR 锚点 | 原型内 `id="FR-N"` 区块（与需求条款同号）；权威原型必须覆盖「服务条款」列中声明的每个 FR |
| 条件必交 | 目录策略扩展：`DELTA.conditionalStageArtifacts = [{ stage:'brainstorming', kind:'prototype', side:'frontend' }]`（feature/refactor 且 sides 含 frontend 时生效） |
| 豁免 | `requirement.md` front-matter `prototype_exempt: <理由>`；**理由非空 + requirement 产物已落章（G1 已确认）** 才生效；agent 无法自行豁免（D-13） |

## 2. 门禁（钉死：模块、错误码、四条路径）

新模块：`src/application/internal/prototype-gates.ts`（尺寸门禁：单文件 ≤400 行；只做取数+组装，判定可下沉纯函数）。

| 函数 | 何时拒 | 错误码 |
|---|---|---|
| `checkPrototypePresenceGate(docs, req)` | sides 含 frontend 且无已登记 prototype、且无有效 `prototype_exempt` | `prototype_missing` |
| `checkPrototypeVersionGate(docs, req)` | INDEX 缺失 / authoritative ≠ 1 / 文档引用指向 superseded | `prototype_version_conflict` |
| `checkPrototypeAnchorsGate(docs, req)` | 权威原型缺 `id="FR-N"` 覆盖 或 缺 `proto-geometry` 块 或 geometry 里出现阈值字段 | `prototype_anchor_missing` |

**四条转移路径必须全部接线**（REQ-292a 的教训：某条路径漏门 = 后门；09-29 快照同步就丢过一条）：

1. `use-cases/MoveRequirement.ts`（会话语义 `reqboard_move`）
2. `use-cases/AskConfirm.ts` 的推进块（弹框确认后自动推进）
3. `http/routers/requirements.ts` 看板移动端点
4. `use-cases/ConfirmArtifact.ts` 看板确认后自动推进

**回归锁死**：一条用例对四条路径各断言一次（缺任一即红）——这是"门禁不再丢"的机械保证。

## 3. D-x 裁定（钉死）

| 项 | 决定 |
|---|---|
| 节名 | `## 讨论与裁定记录（D-x）`（**仅 feature 需求模板**，D-12） |
| 载体 | **表格**：`编号 \| 原话来源 \| 裁定 \| 影响 FR \| 判据` |
| 编号 | `D-1`、`D-2`…；**连续、唯一**（复用 `checkClauseSequence` 思路，独立命名空间） |
| 编号白名单 | `ID_PATTERN` 增 `D-\d+`（与既有 `D-[A-Z]+-\d+` 不冲突；实测 `collectIds('D-1')` 当前为 `[]`） |
| 有效性 | 每行五列齐；`影响 FR` 必须命中真实 FR；`原话来源` 非空 |
| 裁定边界 | 只有**祈使/纠正/补充**算裁定；疑问句不算；允许整节写「本节无裁定」（真空态，不视为空节） |
| 留痕判据 | 会话侧启发式：人类消息含祈使标记（`改成/不要/必须/加上/应该是/记得/注意/别/要`）→ 视为"存在裁定留痕"，此时该节为空即拒（该启发式**只用于"要求非空"**，不判内容） |
| 被引用 | 每条 D-x 至少被一条 FR 明细或一张任务卡 `requirementRefs` 引用，否则覆盖度点名 |
| 错误码 | `decision_log_missing`（缺节/空节）、`decision_entry_invalid`（条目无效，gaps 列条目编号） |

## 4. 锚点 vs 编号（钉死：禁假引用）

实测：`collectIds('prototypes/x.html#FR-4')` → `['FR-4']`（**假引用**，会让覆盖度虚高）。

| 项 | 决定 |
|---|---|
| 规则 | **锚点不计入 serves**。serves 抽取前先调用新增纯函数 `stripPrototypeAnchors(text)`（把 `\S+#FR-\d+` 形态替换为占位符） |
| 锚点统计 | 新增独立字段 `protoRefs`（任务卡/设计章节），单独统计，**不与 FR 引用混算** |
| 回归 | 用例：贴锚点不写实现 → 覆盖度**不上升**；`collectIds` 在 strip 后不再产出该 FR |

## 5. RTM（钉死：两节 + 一维 + 宽容度）

| 文件 | 改动 |
|---|---|
| `vendor/reqboard/src/rtm/types.ts` | 新增 `Prototype`（path/authoritative/superseded_by/serves/anchors/geometry）与 `Decision`（id/source/verdict/serves/criterion）；`rtm_version` 升位 |
| `brainstorming-generator.ts` | `outputs` 增 `prototypes` 与 `decisions` 两节 |
| `design-generator.ts` | 设计章节 `serves` 可指原型锚点与 D-x（锚点走 `protoRefs`，不进 serves） |
| `decomposing-generator.ts` | `task_coverage[]` 增 `covers_prototypes` / `covers_decisions` |
| `coverage-checker.ts` / `coverage-calculator.ts` | 增一维：UI 卡必须有原型锚点；每条 D-x 必须被引用 |
| `accepting-generator.ts` | 验收项含「原型对照」证据条目 |
| `validator.ts` | 认新前缀；**宽容度**：缺 `prototypes`/`decisions` 节 = `pending`（不判损坏）；未知 key 忽略不报错 |
| `rtm-yaml.ts` | 触发点增 `submit:prototype` |
| `rtm-health.ts` | `expectedRTMFiles()` 不变（仍 7 份）；UI 需求缺 `prototypes` 节 = 不健康并点名 |

**兼容基线**：存量 66 条需求的 RTM 旧文件必须**读取不报错、不被判不健康**。

## 6. 同源与校验（钉死：脚本名与判据）

| 编号 | 脚本 | 判据 |
|---|---|---|
| R1 | `scripts/template-gate-probe.mts` | 渲染 `templates/**/*.md` 占位符 → 跑 `missingCategoryDocs` + `checkRequirementDocFormatGate` + `checkDesignSectionsHaveServes` → 0 缺口；人为改坏必红 |
| R2 | `scripts/doc-section-parity.mts` | 门禁节名集合（BASE+DELTA）与模板 H2 集合**双向相等**（体现"该节仅 feature"） |
| R3 | `scripts/prompt-path-probe.mts` | 扫 `src/domain/prompt/fragments/**` + `round-state.ts` 文本中的路径 token → 必须存在或属已知产物名 |
| R4 | `package.json` | 增 `prompts:check`（inline + check 两条脚本）；并入提交前清单（知识层规范页由 `kb-conventions-sync` 生成） |
| 自检 | `scripts/req-doc-validate.mts` | 跑 9 项：必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling；并入 R1 |

**阶段门时序**（FR-11）：`StageGateTimeline` 常量——设计交完必绿：必填节 + 格式门 + serves + 无 dangling；拆分落库必绿：覆盖对照（FR→卡）+ UI 卡锚点；实施收尾必绿：E2E 覆盖 + 三级追溯。逾期由对应转移的门禁拒绝。

## 7. 四条注入面（钉死：文件→改什么）

| 通路 | 文件 | 改什么 |
|---|---|---|
| 片段 | `fragments/common/iron-rules.md` | 加两条：需求阶段裁定必须落账 D-x；UI 需求需求阶段必交原型 |
| 片段 | `fragments/brainstorming/feature.md` | 加 D-x 落账清单项 + 原型交付项 + 确认前自查 |
| 片段 | `fragments/{design,decomposing,implementing,accepting}/{feature.md,heavy/overrides.md}` | 各节点补"引用原型锚点 / D-x"纪律 |
| 片段产物 | `src/domain/prompt/generated/fragments.ts` | `node scripts/inline-prompt-fragments.mjs` 重生成 + `check-prompt-fragments.mjs` 校验 |
| 回合 | `src/application/dive/round-state.ts` `renderDiveRoundText` | brainstorming/design/implementing 三段各补原型与 D-x 指针 |
| 输入包 | `src/application/internal/node-input-package.ts` | 「证据指针」投影含原型路径与 D-x（交棒后新窗口可见） |
| 子卡 | `src/application/use-cases/ExecuteTask.ts` `buildSubtaskPrompt` | UI 卡带原型路径+锚点；所有卡带本卡 D-x 原话 |

## 8. 模板（钉死：6 份）

`brainstorming/feature.md`（加 D-x 节，仅 feature）· `brainstorming/prototype.html`（自 design/ 迁入：FR 锚点区块 + proto-geometry 块 + INDEX 表格骨架）· `design/frontend.md`（「原型页面」节指向权威原型与锚点，要求引 D-x）· `decomposing/decomposition.md`（任务表增「原型锚点 / 关联 D-x」列）· `implementing/task-card.md`（「范围」增两占位符）· `accepting/verification.md`（增两项）。

## 9. 客户端（钉死：最小改动）

| 位置 | 改动 |
|---|---|
| `src/application/query/QueryDocs.ts` | 交付物白名单增 `prototypes/*.html` 与 `prototypes/INDEX.md`；`discovered` 分组计数恒等式保持 `documents + discovered == 台账产物数` |
| `src/client/views/panels/docs.ts` | 原型作为**确定交付物**单列/分组，可点击打开（不新增弹窗） |
| 验收单 | 新增 item source `prototype-compare`：「与原型对照截图（含差异说明）」，UI 需求必出现 |

## 10. 待定项决议（**第一轮拍板，覆盖所有子代理报的"待补充 brief"**）

> 各文档里凡标了「待定（需补充 brief）」的地方，一律以本表结论替换；本表未列的仍不许自行发明。
> 编号 `#N` 供文档交叉引用。

| # | 待定点 | 决议 |
|---|---|---|
| 1 | `prototypes/INDEX.md` 自身的产物 kind | **`prototype`**：`NAME_TO_KIND` 增 `[/^prototypes\/INDEX\.md$/, 'prototype']`；不落 notes |
| 2 | INDEX「路径」与文档引用的书写口径 | **需求目录相对**（`prototypes/x.html`），与 requirement/design 文档引用一致；实现用 `normalizeArtifactPath` 归一 |
| 3 | `stageForKind('prototype')` | **`'brainstorming'`**（显式 case，禁止 default→currentStage 误归阶段） |
| 4 | 原型内出现多块 `proto-geometry` | **拒**（必须恰好一块）；报 `prototype_anchor_missing` 并点名块数 |
| 5 | `unit` / `at.state` 值域与 `name` 唯一性 | `unit ∈ {px, count, ratio}`；`at.state ∈ {inflight, terminal}`；`observations[].name` 块内唯一 |
| 6 | `stripPrototypeAnchors` 的占位符形态 | 固定 token **`<proto-anchor>`**（便于测试断言与反查） |
| 7 | `prototype_exempt` 是否另留痕 | **是**：登记/推进时写一条需求评论 `[豁免] <理由>`（与 `design_exempt` 同款） |
| 8 | proto-geometry 观测值来源 | **量原型稿自身渲染**（显式窗口宽 + 状态，避免 REQ-292a"漏传宽度量错"）；无法量化者由人给并标 `source: "human"`（新增可选字段，缺省 `"prototype"`） |
| 9 | INDEX 维护方式 | **agent 手写；登记只校验不改写**（保持"登记不改产物内容"纪律） |
| 10 | G1 弹框是否显式呈现豁免理由 | **用可机械核验的方式**：豁免必须在 requirement 的 D-x 里有一条裁定记录（人确认文档时必然看到）；弹框文案带该行写进片段纪律（不作机器强制） |
| 11 | 门禁拒绝消息逐字文案 | 设计只定 what/why/how 模板与**必含 token**（文件路径 + 可执行命令）；逐字在实现按既有 `envelope` 风格 |
| 12 | `buildSubtaskPrompt` 新增段落的形态 | 渲染为**三个小节标题**（非 JSON 字段）：`【本卡原型（UI 卡）】`、`【本卡裁定（D-x 原话）】`、`【验收判据】` |
| 13 | 原型产物自身的确认时点 | 门禁**只要求已登记**；确认章为可选加强；G1 确认需求文档时一并展示原型路径 |
| 14 | 验收单第二个 item source 名 | **`decision-compare`**（与 `prototype-compare` 并列） |
| 15 | 节点输入包字段名 | `NodeInput.prototypeRefs?: string[]`、`NodeInput.decisions?: string[]`；渲染在「证据指针」节两行 |
| 16 | 裁定门模块文件名 | **`src/application/internal/decision-gates.ts`** |
| 17 | 「5 个脚本」口径 | **4 个新脚本文件**（`template-gate-probe` / `doc-section-parity` / `prompt-path-probe` / `req-doc-validate`）+ **`package.json` 接线**（`prompts:check`）；**没有第五个脚本** |
| 18 | `rtm_version` 目标值 | **`"2.0"`**（键是 `metadata.rtm_version`，与写入计数 `metadata.version` 不是同一个键） |
| 19 | 存量健康判据冲突（"UI 需求缺节=不健康" vs "存量不判不健康"） | **适用性判据**：只有 `sides` 含 frontend **且** `createdAt ≥ prototypeRulesSince`（插件配置常量，默认规则上线日）的需求才判；存量一律 `exempted: legacy` 并如实报告 |
| 20 | 会话裁定留痕的接入方法 | 新函数 `hasDecisionTrace(sessionProbe, req, opts)`：复用两条读法（快照优先 / 冷读回落），只取 `source.kind === 'user'`，**只扫最近 N 条（默认 200）**，跑祈使词表 |
| 21 | `templates/design/prototype.html` 是否保留 | **`git mv` 到 `templates/brainstorming/prototype.html`，旧路径不留**（避免两份模板） |
| 22 | 是否新增聚合函数 `assertPrototypeGates` | **不新增**：内联到既有单点 `assertArtifactGates`；函数本体在 `prototype-gates.ts` / `decision-gates.ts` |
| 23 | 裁定边界召回率不可测 | 如实写"只锁启发式命中即要求非空"；**召回率由 G2 人评审承担**，不假装可测 |
| 24 | 冷读会话路径的测试成本 | 单测只覆盖**快照路径**；冷读标 `@integration`（真机会话标本） |
| 25 | 探针跨机器假红 | 必须**显式传 `--window-size` 并回读 PNG 真实像素**；无 Chrome 环境 **exit 2**（响亮失败，不许静默跳过） |
| 26 | R1 的"占位符渲染器"口径 | 用 **`scripts/template-render-map.json`** 映射表（如 `{{TASK_ID}}`→`t-000000`、`{{DESIGN_SERVES}}`→`FR-1`）；**未在表内的占位符 → 脚本 exit 1 并点名**（防新占位符没人管） |
| 27 | FR-7 在需求级验收标准里没有对应条目（缺口 A） | **设计侧补足**：`interfaces.md` 定 `prototype-compare` 项接口并声明判据"UI 需求验收单缺该项即提交被拒"；需求侧是否补一条**留给用户决定**（可选 `change_note` 重确认） |
| 28 | 用例的 `covers: t-xxx` | **设计阶段不填**（卡还不存在，编造即假引用）；落库后由既有 backfill 机制回填；文档如实标注 |
| 29 | 本需求自身是否要交原型 / 写 exempt | **都不做**：原型规则由本需求实现，规则生效前不追溯（边界 1/7）；本需求前端改动极小，无独立原型资产，`frontend.md` 如实写明 |
| 30 | 原型在文档 Tab 的协议形态 | **`DocPanelKind` 增 `'prototype'`**，在确定文档块内单列；原型行**必须保留 `data-doc-row="1"`**（保恒等式） |
| 31 | 验收项 source 联合形状与**连带影响** | `VerificationItemSource` 增 `{ kind: 'prototype-compare' }` 与 `{ kind: 'decision-compare' }`；**必须同时改三处 taskId 分支**：`AcceptSheet.ts`（弹框 header）、`accept-sheet-rtm-integration.ts`、`status-rtm-integration.ts`（否则静默退化成 `undefined` / `fr_id='UNKNOWN'`） |
| 32 | 权威/被取代标记的服务端字段 | `QueryDocs` 读 INDEX 后投影：`DocPanelEntry` 增**可选** `prototypeRole?: 'authoritative' \| 'superseded'` 与 `supersededBy?: string`（缺省不注入，旧形状不变） |
| 33 | `ArtifactKind` 新增值的连带必改 | **`src/shared/artifact-labels.ts` 必须配中文名「原型」**（否则 `tests/artifact-labels.test.ts` 中文名护栏用例拦）；`Record<ArtifactKind, DocPanelKind>` 穷尽性同步 |
| 34 | 文档 Tab 恒等式的精确口径 | **`documents` 中来自台账的行数 + Σ`discovered.count` == `artifacts.length`**；`data-doc-row` 条数 == `documents.length` 的既有断言**不许破** |
| 35 | 会话侧新增门的传输码名 | `prototype_missing`→`REQBOARD_MISSING_PROTOTYPE` · `prototype_version_conflict`→`REQBOARD_PROTOTYPE_VERSION_CONFLICT` · `prototype_anchor_missing`→`REQBOARD_PROTOTYPE_ANCHOR_MISSING` · `decision_log_missing`→`REQBOARD_DECISION_LOG_MISSING` · `decision_entry_invalid`→`REQBOARD_DECISION_ENTRY_INVALID`；`transportCodeOf` 改为**显式映射表**，未知内部码**原样透传**（不静默降级为 MISSING_ARTIFACT） |
| 36 | 任务卡承载关联编号的字段名 | `TaskRecord.prototypeRefs?: string[]`、`TaskRecord.decisionRefs?: string[]`（与既有 `requirementRefs` 命名对齐） |
| 37 | 验收项 source 的载荷形状 | `{ kind:'prototype-compare'; prototypePath: string }`；`{ kind:'decision-compare'; decisionIds: string[] }`（都带载荷，便于渲染与追溯） |
| 38 | `SubmitVerification` 缺对照项的错误码 | 内部 `verification_prototype_compare_missing` + 传输 `REQBOARD_VERIFICATION_INCOMPLETE` |
| 39 | 阶段门逾期的错误码 | 内部 `stage_gate_overdue` + 传输 `REQBOARD_STAGE_GATE_OVERDUE` |
| 40 | `prototype_exempt` 是否进 `GATE_HOW_ANCHOR` | **进**：正则扩为 `…\|prototype_exempt\|decision_…`；且**所有新门的 how 文案必须含可执行锚点**（`reqboard_submit(kind=prototype)` 或 `templates/…`）——把后端实测发现变成硬约束 |
| 41 | 产物元数据承载锚点/几何量的字段名 | `StageArtifact.prototypeMeta?: { anchors:{fr:string;selector:string}[]; geometry:{name:string;value:number;unit:'px'\|'count'\|'ratio';at:{width:number;state:'inflight'\|'terminal'};source?:'prototype'\|'human'}[] }` |
| 42 | `rtm_version` 新值 | 见 #18：**`"2.0"`** |
| 43 | **新错误码必须登记 HTTP 状态表**（后端实测发现） | 每个新错误码都要逐条登记 `src/http/envelope.ts` 的 `STATUS_BY_CODE` = **400**；漏登记会**如实落 500**（看板显示成"服务器坏了"）——列为硬约束 + 用例 |
| 44 | 门禁 `how` 文案的机械可验条件 | `GATE_HOW_ANCHOR` 只认 `reqboard_*` / `templates/` / `design_exempt`（实测 `prototype_exempt` 单独出现**不命中**）→ 见 #40；本约束由 `gate-feedback-envelope` 类用例守住 |
| 45 | 已批准 `prototype_exempt` 的需求是否仍强制 `prototype-compare` 验收项 | **不强制**（批准不做原型 = 无原型可对照，否则自相矛盾）；验收单改为渲染一行**豁免说明**「本需求已豁免原型（理由：…）」，该项**不阻塞**验收材料提交 |
| 46 | 三门需 `DocsReader`/async，而同步单点 `assertArtifactGates(req,from,to)` 不取 docs——怎么接 | **不动同步单点**（保持产物存在/确认职责）；新增**唯一** async helper `contentGatesForMove(docs, req, from, to)`（放 `content-gate-wiring.ts`，内部按转移分派到原型门/裁定门），四条路径在同步门**之后**调用它。**不合并既有 G2 调用**（避免把本需求扩成重构）；四条路径的回归用例**同时锁 G2 与新门**——保证"不再有路径漏门"。未来若要收敛成单一 async 入口，另立项 |
| 47 | 4 个新脚本是否提供 `--json` | **提供**：默认人类可读，`--json` 输出机器可读结构（供 CI 与 `req-doc-validate.mts` 消费）；**退出码语义不变**（0 通过 / 1 失败 / 2 环境不可用） |
| 48 | RTM `submit:prototype` 载荷 | 携带 `paths: string[]`（本次登记的原型路径）；**生成器仍以台账为事实源**，载荷只用于增量刷新与留痕，不当唯一来源 |
| 49 | 产物元数据字段命名统一 | **统一用 #41 的 `StageArtifact.prototypeMeta`**；`architecture.md` / `data-model.md` 里内联的 `anchors:{fr,selector}[]` 形状改为指向 #41（语义相同，避免两套字段名） |
| 50 | 台账"有无 schema 变更"的表述（data-model 的结论修正，**采纳**） | `StageArtifact.prototypeMeta?`、`TaskRecord.prototypeRefs?` / `decisionRefs?` 是台账分片里的**新可选键** ⇒ 表述统一为**「加性（additive）变更、零迁移」**，不再写"无 schema 变更"：旧记录缺键 = 未采集，**不补齐、不改写、无迁移脚本**，旧读取路径与旧形状不变 |

## 11. 边界（写进设计文档）

不改既有必填节名与产物语义 · 不追溯存量（8 条 archived + REQ-292a）· 不做像素级视觉回归 · 不给非 UI 需求加仪式 · 不改上游 skill 原文（只改本仓段）· 不新增第五条注入通路 · 不新增弹框（豁免搭 G1）。
