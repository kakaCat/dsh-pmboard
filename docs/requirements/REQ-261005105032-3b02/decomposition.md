# 拆分计划（REQ-261005105032-3b02 让原型进流水线：UI 需求在需求阶段必交原型，且原型可判定）

> 目标：把「原型」升格为需求阶段必交的一等产物（`kind=prototype`）并让它可判定、可追溯，
> 同时把需求阶段的讨论裁定编号化（D-x）进追溯链、把模板与四条注入面与校验器同源落地。
> 做法：**契约先行 → 门禁单点 → 追溯与产出面 → 校验脚本 → 兼容与端到端证据**，23 张卡。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。
> 契约源：`docs/requirements/REQ-261005105032-3b02/notes/design-brief.md`（§1~§9 钉死项 + §10 五十条决议）；
> 需求源：`docs/requirements/REQ-261005105032-3b02/requirement.md`（11 条 FR / 15 条 D-x / 22 条验收标准）。
> 机器可读同源文件：`docs/requirements/REQ-261005105032-3b02/notes/plan-tasks.json`（本文件 §2/§3 与它逐字同源）。
> 本阶段**不二次创作设计**：与设计不一致之处一律进 §5「需退回设计」，不在卡里私改口径。

## 改动盘点（对照 design/ 7 份逐份列）

### 1. architecture.md（模块改动地图 / 数据结构 / 关键算法）

| 类别 | 清单 |
|---|---|
| 新增 | `src/application/internal/prototype-gates.ts`（t4）· `src/application/internal/decision-gates.ts`（t5）· `scripts/template-gate-probe.mts` + `scripts/template-render-map.json` + `scripts/doc-section-parity.mts`（t19）· `scripts/prompt-path-probe.mts`（t20）· `scripts/req-doc-validate.mts`（t21）· `templates/brainstorming/prototype.html`（t11，自 design/ `git mv` 迁入）· **偏差**：`src/application/internal/prototype-skeleton.ts`（t11，设计目录结构未列，见 §5-3） |
| 修改 | `src/domain/artifact/ArtifactSpec.ts` / `src/shared/artifact-labels.ts` / `src/shared/protocol.ts`（t1）· `src/application/internal/artifact-gates.ts` / `gate-feedback.ts` / `src/http/envelope.ts` / `src/application/use-cases/MoveRequirement.ts`（t2）· `src/application/internal/content-gates.ts`（t3）· `src/application/internal/category-doc-sets.ts`（t4）· `src/application/internal/content-gate-wiring.ts`（t6 加 `contentGatesForMove`、t12 扩 `assertClauseCoverageGate`、t13 加阶段门分派）· `AskConfirm.ts` / `src/http/routers/requirements.ts` / `ConfirmArtifact.ts`（t6）· `SubmitArtifact.ts`（t10、t12）· `vendor/reqboard/src/rtm/{types,brainstorming-generator,design-generator,decomposing-generator}.ts`（t7）· `vendor/reqboard/src/rtm/{coverage-checker,coverage-calculator,validator,accepting-generator}.ts`（t8）· `src/application/internal/rtm-yaml.ts` / `rtm-health.ts`（t9）· `src/application/internal/approved-plan-landing.ts` / `src/application/use-cases/Decompose.ts`（t12）· `src/domain/gate/GateCatalog.ts`（t13，加 `StageGateTimeline`）· `src/application/dive/round-state.ts` / `node-input-package.ts` / `src/application/use-cases/ExecuteTask.ts`（t16）· `src/application/query/QueryDocs.ts` / `src/client/views/panels/docs.ts` / `src/client/styles/report.ts`（t17、t18）· `src/domain/workflow/AcceptanceSheetSpec.ts` / `AcceptSheet.ts` / `accept-sheet-rtm-integration.ts` / `status-rtm-integration.ts` / `SubmitVerification.ts`（t18）· 6 份模板（t14）· `src/domain/prompt/fragments/**` + `generated/fragments.ts`（t15）· `package.json`（t20）· `scripts/req-report-probe.mts`（t23） |
| 删除 | `templates/design/prototype.html`（t11：`git mv` 迁入 `templates/brainstorming/`，**旧路径不留**，避免两份模板） |

### 2. interfaces.md（8 个接口面）

| 接口 | 改动 | 落卡 |
|---|---|---|
| I-1 `reqboard_submit(kind='prototype')` | 新增 kind 分支 + 入参 `path` + 返回 `registered_count`/`prototypes[]`/`blockers` | t10（契约类型 t1/t3） |
| I-2 门禁错误码（内部码 + 传输码） | 7 个新码入联合、`transportCodeOf` 改显式映射表、`STATUS_BY_CODE` 逐码 400 | t2 |
| I-3 门禁函数签名（三门 + 裁定门 + `contentGatesForMove`） | 新增 `src/application/internal/prototype-gates.ts`、`decision-gates.ts`、`content-gate-wiring.contentGatesForMove` | t4、t5、t6 |
| I-4 脚本接口 R1~R4 + 自检 + 探针 | 4 个新脚本文件 + `package.json` 接线；探针硬判据与 exit 2 | t19、t20、t21、t23 |
| I-5 RTM 触发点 `submit:prototype` | 触发点 + 载荷 `paths` + 刷新范围 | t9（类型 t7） |
| I-6 验收单项 `prototype-compare` / `decision-compare` | 判别联合两新成员（带载荷）+ 三处 `taskId` 分支 | t18 |
| I-7 文档查询白名单（QueryDocs） | 白名单 + `prototypeRole`/`supersededBy` 投影 | t17 |
| I-8 HTTP API | **无新增**（本计划不改路由 / 不新增端点，仅既有端点行为变更经 t6/t13 生效） | —（不改，如实记录） |
| 删除 | 无 | — |

### 3. data-model.md（结构 / 字段 / 不变量）

| 类别 | 清单 |
|---|---|
| 新增 | `ArtifactKind += 'prototype'` 与 `ALL_ARTIFACT_KINDS` 同步、`NAME_TO_KIND` 三条正则、`DocPanelKind += 'prototype'`（t1）· `StageArtifact.prototypeMeta?`、`TaskRecord.prototypeRefs?`/`decisionRefs?`（t3）· RTM `Prototype` / `Decision` 两类型 + `metadata.rtm_version='2.0'`（t7）· 需求目录 `prototypes/` 与 `prototypes/INDEX.md`（骨架 t11 落盘，内容 agent 手写） |
| 修改 | `ID_PATTERN` 增 `D-\d+`；serves 抽取前置 `stripPrototypeAnchors`（t3）· `conditionalStageArtifacts` 条件必交档（t4）· `prototype_exempt` front-matter 解析（t4）· RTM `outputs.prototypes`/`decisions`、`task_coverage[].covers_prototypes`/`covers_decisions`（t7） |
| 删除 | 无；**无迁移脚本**（三处新键一律加性变更、零迁移，旧记录缺键=未采集，t22 核对） |

### 4. backend.md（S-1~S-15）

| 服务/函数 | 落卡 | 服务/函数 | 落卡 |
|---|---|---|---|
| S-1 presence 门 | t4 | S-9 `prototypeExemptOf` | t4（判定）+ t10（留痕评论） |
| S-2 version 门 | t4 | S-10 `StageGateTimeline` | t13 |
| S-3 anchors 门 | t4 | S-11 `syncRTMYaml('submit:prototype')` | t9（触发）+ t10（调用） |
| S-4 `parsePrototypeMetadata` | t4 | S-12 `handleReqMove` 接线 | t6 |
| S-5 `checkDecisionLogGate` | t5 | S-13 `buildSubtaskPrompt` 扩展 | t16 |
| S-6 `stripPrototypeAnchors` | t3 | S-14 验收单扩展 | t18 |
| S-7 `submitPrototypeArtifact` | t10 | S-15 `contentGatesForMove` | t6（+t13 扩分派） |
| S-8 `conditionalStageArtifactsFor` | t4 | 删除 | 无 |

### 5. frontend.md（P-1 / C-1~C-4）

| 类别 | 清单 |
|---|---|
| 修改 | `src/application/query/QueryDocs.ts`（白名单 + 投影 + 恒等式，t17）· `src/client/views/panels/docs.ts`（C-2 原型单列 + `data-verify-source`，t17/t18）· `src/shared/artifact-labels.ts`（C-1 中文名「原型」，t1）· `src/shared/protocol.ts`（`DocPanelKind`/`DocPanelEntry`，t1）· `src/client/styles/report.ts`（≤3 条规则，t17） |
| 新增 | 无新前端文件（C-2/C-3 是既有面板文件内的渲染块） |
| 删除 | 无（不新增弹窗、不新增路由、不引新依赖） |

### 6. test-cases.md（TC-1~TC-48）

| 类别 | 清单 |
|---|---|
| 新增用例文件 | `tests/prototype-gates.test.ts`、`tests/prototype-metadata-parse.test.ts`、`tests/decision-gates.test.ts`、`tests/move-gate-paths.test.ts`、`tests/submit-prototype.test.ts`（+ 豁免）、`tests/prototype-skeleton.test.ts`、`tests/rtm-prototype-sections.test.ts`、`tests/rtm-coverage-prototype.test.ts`、`tests/rtm-validator-tolerance.test.ts`、`tests/rtm-trigger-prototype.test.ts`、`tests/plan-prototype-anchor-gate.test.ts`、`tests/stage-gate-timeline.test.ts`、`tests/subtask-prompt-prototype.test.ts`、`tests/probe-hard-criteria.test.ts`、`tests/gate-feedback-envelope.test.ts` 等（逐卡 acceptance 列出） |
| 修改用例文件 | `tests/artifact-spec.test.ts`、`tests/artifact-labels.test.ts`、`tests/category-doc-sets.test.ts`、`tests/clause-numbering.test.ts`、`tests/serve-extraction.test.ts`、`tests/docs-panel.test.ts`、`tests/query-docs.test.ts`、`tests/accept-sheet-rtm-integration.test.ts`、`tests/accept-sheet-tool.test.ts`、`tests/compat-regression.test.ts`、`tests/rtm-health-legacy.test.ts`、`tests/node-input-package.test.ts`、`tests/prompt-tiers.test.ts` 等 |
| 删除 | 无 |
| 说明 | 设计阶段 `covers`（任务卡编号）不填（§10 #28），落库后由既有 backfill 回填；本计划 §1 表即落库通道的对照源 |

### 7. use-cases.md（UC-1~UC-7）

| UC | 承接卡 |
|---|---|
| UC-1 PM 在需求阶段交付原型 | t4、t10、t11、t14 |
| UC-2 agent 逐条落账 D-x | t5、t14、t15 |
| UC-3 门禁拒绝与恢复（含豁免） | t2、t6、t10 |
| UC-4 实施子代理按锚点与 D-x 干活 | t12、t16、t23 |
| UC-5 人的两道裁决（G1 / G4） | t10、t18 |
| UC-6 交棒 / 新窗口只靠节点输入包 | t16 |
| UC-7 非 UI 需求不被加仪式 | t4、t6、t18 |
| 新增/删除文件 | 无（场景由既有工件承载） |

## §1 RTM 覆盖对照表（根编号 ↔ 接口/模块/用例/接收任务）

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-2, I-3 | S-1, S-8, S-9, S-15 | TC-1, TC-2, TC-3, TC-4, TC-5, TC-6, TC-7, TC-43, TC-44 | t2, t4, t6, t10, t23 | ✅ |
| FR-2 | I-1, I-7 | S-7, S-12, C-1, C-2 | TC-8, TC-9, TC-10, TC-43 | t1, t10, t11, t17, t22 | ✅ |
| FR-3 | I-3 | S-2, C-2 | TC-11, TC-12 | t2, t4, t17 | ✅ |
| FR-4 | I-1, I-3, I-4 | S-3, S-4, S-7 | TC-13, TC-14, TC-15, TC-16, TC-44 | t2, t4, t10, t11, t14 | ✅ |
| FR-5 | I-5 | S-2, S-11, S-15 | TC-17, TC-18, TC-42 | t3, t7, t8, t9, t12, t14, t22 | ✅ |
| FR-6 | I-4 | S-13, P-1 | TC-19, TC-20, TC-21, TC-22 | t12, t14, t16, t23 | ✅ |
| FR-7 | I-6 | S-14, C-3 | TC-23, TC-24 | t8, t14, t18 | ✅ |
| FR-8 | I-2, I-3 | S-5, S-15 | TC-25, TC-26, TC-27, TC-28, TC-29, TC-47 | t2, t5, t6, t14, t15 | ✅ |
| FR-9 | I-1, I-6 | S-13, S-14 | TC-30, TC-31, TC-32 | t3, t5, t7, t8, t16, t18 | ✅ |
| FR-10 | I-4 | 模板 6 份 + 四条注入面（片段/回合/输入包/子卡） | TC-33, TC-34, TC-35, TC-36, TC-45, TC-46, TC-48 | t6, t14, t15, t16, t19, t20 | ✅ |
| FR-11 | I-2, I-4 | S-6, S-10 | TC-37, TC-38, TC-39, TC-40, TC-41, TC-42 | t1, t2, t3, t7, t8, t9, t12, t13, t17, t21, t22, t23 | ✅ |
| **合计** | 8 接口 | 15 后端服务 + 4 前端渲染块 | 48 用例 | 23 任务 | **11/11 条款有主** |

- 每行「接口 / 页面模块 / 用例」三格均非空；无「—」豁免行（本需求无纯文档条款）。
- 反向核对：interfaces.md 的 I-1~I-7 均被认领，I-8 如实记为「无新增」（设计明文）；backend.md 的 S-1~S-15 全部有卡；frontend.md 的 P-1/C-1~C-4 全部有卡；test-cases.md 的 TC-1~TC-48 按上述分列认领。

## §2 任务表

| key | 标题 | phase | side | depends_on | footprint（files/anchors/chars → DU） | requirement_refs |
|---|---|---|---|---|---|---|
| t1 | 定义 prototype 产物与枚举契约 | implement | backend | — | 5/7/2600 → 9.8 | FR-2, FR-11 |
| t2 | 登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约 | implement | backend | — | 6/9/2900 → 11.95 | FR-1, FR-3, FR-4, FR-8, FR-11 |
| t3 | 扩编号白名单（`D-\d+`）与台账新可选字段契约 | implement | backend | t1 | 5/8/2300 → 10.15 | FR-5, FR-9, FR-11 |
| t4 | 实现原型三门与元数据解析 | implement | backend | t1, t2, t3 | 5/14/4200 → 14.1 | FR-1, FR-3, FR-4 |
| t5 | 实现裁定记录门与会话留痕判据 | implement | backend | t2, t3 | 3/9/2900 → 8.95 | FR-8, FR-9 |
| t6 | 加唯一 async 门禁入口并接线四条转移路径 | implement | backend | t4, t5 | 7/11/4000 → 14.5 | FR-1, FR-8, FR-10 |
| t7 | 扩展 RTM 类型并生成 prototypes/decisions 两节 | implement | backend | t3 | 5/8/3000 → 10.5 | FR-5, FR-9, FR-11 |
| t8 | 加 RTM 覆盖度两维与校验器宽容度 | implement | backend | t7 | 5/8/2800 → 10.4 | FR-5, FR-7, FR-9, FR-11 |
| t9 | 加 RTM 触发点 `submit:prototype` 与健康检查适用性判据 | implement | backend | t7 | 5/9/3000 → 11 | FR-5, FR-11 |
| t10 | 实现 `reqboard_submit(kind=prototype)` 登记编排与豁免留痕 | implement | backend | t1, t3, t4, t6, t9 | 6/12/3600 → 13.8 | FR-1, FR-2, FR-4 |
| t11 | 把原型骨架迁入 brainstorming 并幂等落盘 | implement | backend | t1, t4 | 5/9/3000 → 11 | FR-2, FR-4 |
| t12 | 加拆分覆盖门的 UI 卡原型锚点维度 | implement | backend | t1, t3, t6 | 6/7/2600 → 10.8 | FR-5, FR-6 |
| t13 | 定义阶段门时序常量与逾期码接线 | implement | backend | t6, t8, t12 | 4/8/2800 → 9.4 | FR-11 |
| t14 | 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项 | doc | doc | t4, t5 | 8/10/3400 → 14.7 | FR-4, FR-5, FR-6, FR-7, FR-8, FR-10 |
| t15 | 注入片段面加 D-x/原型纪律并重生成内联产物 | doc | doc | t14 | 10/7/2600 → 14.8 | FR-8, FR-10 |
| t16 | 三条注入通路带上原型与 D-x（回合/输入包/子卡提示词） | implement | backend | t3 | 6/9/3400 → 12.2 | FR-6, FR-9, FR-10 |
| t17 | 客户端文档面板原型单列与权威/被取代投影 | ui | frontend | t1 | 5/10/3400 → 11.7 | FR-2, FR-3, FR-11 |
| t18 | 验收单加两支对照项并同步三处 taskId 分支 | implement | backend | t1, t5 | 7/10/4200 → 14.1 | FR-7, FR-9 |
| t19 | 加 R1 模板门禁探针与 R2 节名双向一致探针 | test | doc | t4, t14 | 5/10/3200 → 11.6 | FR-10 |
| t20 | 加 R3 提示词路径可达探针与 R4 pnpm 脚本接线 | test | doc | t15, t16 | 7/7/2400 → 11.7 | FR-10 |
| t21 | 加文档自检脚本 `req-doc-validate.mts`（9 项）并并入 R1 | test | doc | t3, t13, t19 | 4/7/2600 → 8.8 | FR-11 |
| t22 | 核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免） | test | backend | t9, t10, t11 | 6/8/2800 → 11.4 | FR-2, FR-5, FR-11 |
| t23 | 产出端到端证据与六条逆验证（几何量硬判据 / exit 2） | test | fullstack | t6, t13, t18, t20, t21 | 5/9/3000 → 11 | FR-1, FR-6, FR-11 |

- 23 张卡，**无一张超容量**（容量 16 DU，最大 t15 = 14.8 DU），故计划行**不含** `⚠️超容量(建议N批)` 标记。
- 依赖只有前向引用（`depends_on` 只引更早的 key），无环。
- 子卡段一律走默认模板（按 phase/需求分类兜底），本计划不显式指定 `stages`/`template`；t7/t8 等无新接口的卡由落库方按默认段展开即可。

## §3 逐卡 implementation 与 acceptance

### t1 定义 prototype 产物与枚举契约

**implementation**：改 `src/domain/artifact/ArtifactSpec.ts`：`ArtifactKind` 联合与 `ALL_ARTIFACT_KINDS` 各加 `'prototype'`；`NAME_TO_KIND` 在既有 7 条之后追加三条（`/^prototypes\/.+\.html$/`、`/^prototype\/.+\.html$/`、`/^prototypes\/INDEX\.md$/` → `prototype`；首条权威路径、次条旧路径兼容、末条 INDEX 自身，均不得再回落 `notes`）；`stageForKind` 为 `'prototype'` 加显式 case 返回 `'brainstorming'`（禁止 default 误归阶段）。改 `src/shared/artifact-labels.ts`：`KIND_LABELS.prototype = '原型'` 且 `Record<ArtifactKind, DocPanelKind>` 穷尽（否则 artifact-labels 中文名护栏用例拦）。改 `src/shared/protocol.ts`：`DocPanelKind` 增 `'prototype'`；`DocPanelEntry` 增可选 `prototypeRole?: 'authoritative'|'superseded'` 与 `supersededBy?: string`（缺省不注入，旧形状不变）；`SUBMIT_KINDS` 增 `'prototype'`。注意：`VerificationItemSource` 的真源在 `src/domain/workflow/AcceptanceSheetSpec.ts`、`protocol.ts` 只 re-export，本卡不动它（由 t18 改）。依据 design-brief §1 与 §10 #1/#3/#30/#33。验证：`pnpm typecheck`。

**acceptance**：`pnpm typecheck` 退出码 0；`npx vitest run tests/artifact-spec.test.ts tests/artifact-labels.test.ts` 全绿且含断言：`kindForRelPath('prototypes/detail.html')==='prototype'`；`kindForRelPath('prototype/detail.html')==='prototype'`；`kindForRelPath('prototypes/INDEX.md')==='prototype'`；`kindForRelPath('prototypes/detail.html.bak')==='notes'`；`stageForKind('prototype')==='brainstorming'`；`KIND_LABELS.prototype==='原型'`。`git diff package.json` 为空（零新增运行时依赖）。

### t2 登记 7 个新门禁错误码与信封/传输码/HTTP 状态契约

**implementation**：改 `src/application/internal/artifact-gates.ts`：`GateFailure.code` 联合追加 `prototype_missing` / `prototype_version_conflict` / `prototype_anchor_missing` / `decision_log_missing` / `decision_entry_invalid` / `verification_prototype_compare_missing` / `stage_gate_overdue` 七个码（不新增门禁函数）。改 `src/application/internal/gate-feedback.ts`：`GATE_HOW_ANCHOR` 扩为 `/reqboard_[a-z_]+|templates\/|design_exempt|prototype_exempt|decision_/`（实测 `prototype_exempt` 单独出现不命中旧正则）。改 `src/http/envelope.ts`：`STATUS_BY_CODE` 逐条登记上述 7 码 = 400（漏登记会如实落 500，看板显示成「服务器坏了」）。改 `src/application/use-cases/MoveRequirement.ts`：`transportCodeOf` 由隐式推导改显式映射表——`prototype_missing`→`REQBOARD_MISSING_PROTOTYPE`、`prototype_version_conflict`→`REQBOARD_PROTOTYPE_VERSION_CONFLICT`、`prototype_anchor_missing`→`REQBOARD_PROTOTYPE_ANCHOR_MISSING`、`decision_log_missing`→`REQBOARD_DECISION_LOG_MISSING`、`decision_entry_invalid`→`REQBOARD_DECISION_ENTRY_INVALID`；未知内部码原样透传，不得静默降级为 `MISSING_ARTIFACT`。依据 design-brief §2 与 §10 #35/#38/#39/#40/#43/#44。

**acceptance**：`npx vitest run tests/gate-feedback-envelope.test.ts tests/http-envelope-status.test.ts` 全绿：7 个内部码逐一 `statusForCode(code)===400`；`GATE_HOW_ANCHOR.test('prototype_exempt')===true`；`transportCodeOf` 对五个新码各映射到对应 `REQBOARD_*`；`transportCodeOf('some_unknown')==='some_unknown'`（原样透传）；每个新门的 `how` 文案命中 `reqboard_submit(kind=prototype)` 或 `templates/`。`pnpm typecheck` 退出码 0。

### t3 扩编号白名单（`D-\d+`）与台账新可选字段契约

**implementation**：改 `src/application/internal/content-gates.ts`：`ID_PATTERN` 交替里新增一支 `D-\d+`（与既有 `D-[A-Z]+-\d+` 共存、互不冲突）；新增纯导出函数 `stripPrototypeAnchors(text)`，把 `\S+#FR-\d+` 形态替换为固定 token `<proto-anchor>`，并在 `extractServesFrom` 与 serves 抽取入口前置调用（锚点不计 serves，堵假引用）。改 `src/shared/protocol.ts`：`StageArtifact` 增可选 `prototypeMeta?: { anchors: {fr: string; selector: string}[]; geometry: {name: string; value: number; unit: 'px'|'count'|'ratio'; at: {width: number; state: 'inflight'|'terminal'}; source?: 'prototype'|'human'}[] }`；`TaskRecord` 增可选 `prototypeRefs?: string[]` 与 `decisionRefs?: string[]`。三个新键一律**加性变更、零迁移**：旧记录缺键=未采集，不补齐、不改写、无迁移脚本，旧读取路径与旧形状不变。依据 design-brief §4 与 §10 #6/#36/#41/#49/#50。

**acceptance**：`npx vitest run tests/clause-numbering.test.ts tests/serve-extraction.test.ts` 全绿且含断言：`collectIds('D-1')` 深等于 `['D-1']`；`collectIds('D-ARCH-2')` 深等于 `['D-ARCH-2']`；`collectIds('D-1 D-ARCH-2')` 同时含两项；`collectIds('D-1abc')` 为空数组；`stripPrototypeAnchors('prototypes/x.html#FR-4')` 输出含 `'<proto-anchor>'` 且对该输出再 `collectIds` 不含 `'FR-4'`。`pnpm typecheck` 退出码 0。

### t4 实现原型三门与元数据解析

**implementation**：新建 `src/application/internal/prototype-gates.ts`（≤400 行；只做取数+组装，判定下沉纯函数），导出 `checkPrototypePresenceGate(docs, req)`→`prototype_missing`、`checkPrototypeVersionGate(docs, req)`→`prototype_version_conflict`、`checkPrototypeAnchorsGate(docs, req)`→`prototype_anchor_missing`，以及纯函数 `parsePrototypeMetadata(html)`（零 IO：正则抽 `id="FR-N"` 锚点、抽**恰好一块** `<!-- proto-geometry {json} -->` 并返回块数与解析错误；递归扫 JSON 键，命中阈值禁用词表 `threshold/max/min/limit/expected/tolerance/upper/lower/range/budget/target/pass/fail` 即违规）与 `prototypeExemptOf(req, frontmatter)`（理由 trim 后非空 **且** requirement 产物 `confirmedAt` 已写，才生效）。INDEX 用既有 `parseDocument` 读 `prototypes/INDEX.md` 表格（列：路径/状态/服务条款/被取代于），`authoritative` 必须恰好一条；路径一律 `normalizeArtifactPath` 归一为需求目录相对口径；`requirement.md` 与 `design/frontend.md` 中出现的原型路径必须等于权威路径，指向 `superseded` 即拒。改 `src/application/internal/category-doc-sets.ts`：增 `ConditionalStageArtifact` 类型与 `conditionalStageArtifactsFor(category, sides)`，与 `effectiveDesignDocs` 同源解析 sides，feature/refactor 命中 `{stage:'brainstorming', kind:'prototype', side:'frontend'}`；阶段必备产物取 `STAGE_ARTIFACT_REQUIREMENTS[stage] ∪ 条件命中项`。非 UI 需求三件门一律返回 `undefined`。依据 design-brief §1/§2 与 §10 #2/#4/#5/#8/#9/#19。

**acceptance**：`npx vitest run tests/prototype-gates.test.ts tests/prototype-metadata-parse.test.ts tests/category-doc-sets.test.ts` 全绿：缺已登记 prototype 且无有效豁免 → `prototype_missing`；INDEX 的 `authoritative` 为 0 条与 2 条 → `prototype_version_conflict` 且 gaps 点名路径；`requirement.md` 引用 superseded 版 → 同码；缺 `id="FR-4"` 区块 → `prototype_anchor_missing` 且 gaps 点名 FR-4；geometry 两块或含 `threshold` → 同码并点名块数；合法标本 → 三门均 `undefined`；`sides:[backend]` 标本 → 三门均 `undefined`；豁免三态（空理由拒 / 未落章拒 / 已落章放行）各断言一次。`pnpm typecheck` 退出码 0。

### t5 实现裁定记录门与会话留痕判据

**implementation**：新建 `src/application/internal/decision-gates.ts`（≤400 行），导出 `checkDecisionLogGate(docs, req)` 与 `hasDecisionTrace(sessionProbe, req, opts?)`。门禁：找节名逐字 `## 讨论与裁定记录（D-x）`（仅 feature 需求要求该节，D-12）；缺节 → `decision_log_missing`；节内表格按五列 `编号|原话来源|裁定|影响 FR|判据` 逐行校验，任一列空或「影响 FR」未命中 `extractClauseDefinitions` 的真实条款 → `decision_entry_invalid` 且 gaps 逐条点名条目编号（不是修一条报一条）；编号 `D-\d+` 连续且唯一（复用 `checkClauseSequence` 思路，独立命名空间；跳号与重复都拒）；整节只写「本节无裁定」视为真空态、不视为空节、放行。留痕：`hasDecisionTrace` 复用两条读法（快照事件优先、持久化冷读回落），只取 `source.kind==='user'`，只扫最近 200 条（`opts.limit` 可覆写），命中祈使词表 `改成/不要/必须/加上/应该是/记得/注意/别/要` 即视为存在留痕；该启发式**只用于「要求本节非空」**，不判条目内容、不承诺召回率可测（召回由 G2 人评审承担）；并断言不新增数据源。依据 design-brief §3 与 §10 #16/#20/#23/#24。

**acceptance**：`npx vitest run tests/decision-gates.test.ts` 全绿：有留痕且缺节 → `decision_log_missing`；条目缺原话来源或影响 FR 未命中真实 FR → `decision_entry_invalid` 且 gaps 同时列出 D-3 与 D-5；跳号 `D-1,D-3` 与重复 `D-2,D-2` 均拒；真空态且无留痕 → 放行；有留痕却只写真空态 → 仍拒；非 feature 需求返回 `undefined`；冷读路径用例标 `@integration` 且默认不跑。`pnpm typecheck` 退出码 0。

### t6 加唯一 async 门禁入口并接线四条转移路径

**implementation**：改 `src/application/internal/content-gate-wiring.ts`：新增**唯一**的 async helper `contentGatesForMove(docs, req, from, to)`，内部按 `(from,to)` 分派——`brainstorming→design` 依次跑 `checkPrototypePresenceGate` → `checkPrototypeVersionGate` → `checkPrototypeAnchorsGate` → `checkDecisionLogGate`，短路返回首个 `GateFailure`；其余转移与非 UI（sides 不含 frontend）或非 feature/refactor 需求返回 `undefined`。四条路径在**同步门之后**调用它：① `src/application/use-cases/MoveRequirement.ts`（`assertArtifactGates` 之后、G2 判定之前）；② `src/application/use-cases/AskConfirm.ts` 的推进块（新增接线，失败 → `advanced:false` + 门消息）；③ `src/http/routers/requirements.ts` 的 `handleReqMove`（`preGate` 之后、`g2CompletenessFailure` 之前，mutate 内复查）；④ `src/application/use-cases/ConfirmArtifact.ts`（`advanceTargetFor` 命中且未显式关闭推进时，失败 → `advanceNote` 追加门消息、不推进）。**不动**同步单点 `assertArtifactGates` 的签名与职责，**不合并**既有 G2 调用。回归写成一个文件 `tests/move-gate-paths.test.ts`：对四条入口各断言一次，且同时断言既有 G2 仍生效；逐条注释掉任一调用点该用例必须红。依据 design-brief §2 与 §10 #22/#46。

**acceptance**：`npx vitest run tests/move-gate-paths.test.ts` 全绿：S-1 标本（feature + sides 含 frontend + 无已登记 prototype）走四条路径**全部**返回 `prototype_missing`，会话侧传输码均为 `REQBOARD_MISSING_PROTOTYPE`；同标本把 G2（设计文档集）置为失败时四条路径也都拒（双锁）；人为注释掉任一调用点后重跑 → 对应用例红（四条各一次）。`npx vitest run tests/artifact-gates.test.ts tests/design-gates.test.ts` 既有用例零回归；`pnpm typecheck` 退出码 0。

### t7 扩展 RTM 类型并生成 prototypes/decisions 两节

**implementation**：改 `vendor/reqboard/src/rtm/types.ts`：新增 `Prototype`（`path`/`authoritative`/`superseded_by?`/`serves`/`anchors`/`geometry`）与 `Decision`（`id`/`source`/`verdict`/`serves`/`criterion`）两个接口，锚点与几何量元素形状统一指向 `StageArtifact.prototypeMeta`（不另立第二套字段名）；`metadata.rtm_version` 目标值 `"2.0"`（与写入计数 `metadata.version` 不是同一个键）。改 `vendor/reqboard/src/rtm/brainstorming-generator.ts`：`outputs` 增 `prototypes`（每条=一个 `Prototype`，来源=台账 `kind=prototype` 产物 + `prototypes/INDEX.md`）与 `decisions`（每条=一个 `Decision`，来源=requirement 的 D-x 表）两节，既有 `requirements` 节形状不变。改 `vendor/reqboard/src/rtm/design-generator.ts`：设计章节 `serves` 允许引用 D-x；原型锚点走独立字段 `protoRefs`、**不进** `serves`（抽 serves 前先 `stripPrototypeAnchors`）。改 `vendor/reqboard/src/rtm/decomposing-generator.ts`：`task_coverage[]` 增 `covers_prototypes`（来源 `TaskRecord.prototypeRefs`）与 `covers_decisions`（来源 `decisionRefs`）。依据 design-brief §5 与 §10 #18/#42/#48/#49。

**acceptance**：`npx vitest run tests/rtm-prototype-sections.test.ts` 全绿：对标本跑生成后 `rtm-brainstorming.yml` 含非空 `outputs.prototypes`（每条带 `authoritative` 与 `anchors`）与 `outputs.decisions` 两节；`metadata.rtm_version==='2.0'` 而 `metadata.version` 仍是写入计数；`rtm-decomposing.yml` 的 `task_coverage` 每项含 `covers_prototypes` 与 `covers_decisions` 键；设计章节文本里的 `prototypes/x.html#FR-4` 经 strip 后不进 `serves`。`pnpm typecheck` 退出码 0。

### t8 加 RTM 覆盖度两维与校验器宽容度

**implementation**：改 `vendor/reqboard/src/rtm/coverage-checker.ts` 与 `coverage-calculator.ts`：新增两维——① UI 卡（feature/refactor 且 sides 含 frontend 的任务卡）必须有原型锚点（`covers_prototypes` 非空），缺则覆盖度 < 100% 并点名该卡；② 每条 D-x 必须被至少一条 FR 明细或一张卡的 `requirementRefs`/`decisionRefs` 引用，未被引用则点名该 D-x（只降覆盖度与点名，不拒阶段转移）。改 `vendor/reqboard/src/rtm/validator.ts`：编号白名单认原型锚点前缀（防把锚点判成 dangling）；缺 `prototypes`/`decisions` 节 = `pending`（未采集，不判损坏）；未知 key 忽略不报错（存量 66 条读取不报错）。改 `vendor/reqboard/src/rtm/accepting-generator.ts`：验收项含「原型对照」证据条目。依据 design-brief §5 与 §10 #19。

**acceptance**：`npx vitest run tests/rtm-coverage-prototype.test.ts tests/rtm-validator-tolerance.test.ts` 全绿：UI 卡 `prototypeRefs` 为空 → 覆盖度 < 100% 且 gaps 点名该卡编号；D-7 未被任何 FR/卡引用 → 点名 D-7 且该维覆盖度下降；缺 `prototypes` 与 `decisions` 节的旧 YAML → 读出 `pending` 且不产生错误；含未知 key 的旧 YAML → 忽略不报错；accepting 生成结果含「原型对照」条目。`pnpm typecheck` 退出码 0。

### t9 加 RTM 触发点 `submit:prototype` 与健康检查适用性判据

**implementation**：改 `src/application/internal/rtm-yaml.ts`：`RTMTrigger` 增 `'submit:prototype'`（与既有 6 个触发点同构），载荷 `{ paths: string[] }`（本次登记的原型路径），刷新 `rtm-brainstorming.yml` 与 `rtm-lifecycle.yml`；生成器仍以台账为事实源，载荷只用于增量刷新与留痕、不当唯一来源；RTM 失败只记 warning 并结构化返回，不打断登记主流程。改 `src/application/internal/rtm-health.ts`：`expectedRTMFiles()` 不变（仍 7 份）；新增适用性判据——只有 sides 含 frontend **且** `createdAt >= prototypeRulesSince`（插件配置常量，缺省 = 规则上线日）的需求，缺 `prototypes` 节才判不健康并点名；`createdAt < prototypeRulesSince` 的一律标 `exempted: legacy` 并如实报告，不判不健康。依据 design-brief §5 与 §10 #19/#48。

**acceptance**：`npx vitest run tests/rtm-trigger-prototype.test.ts tests/rtm-health-legacy.test.ts` 全绿：调 `syncRTMYaml('submit:prototype', {paths:['prototypes/detail.html']})` 后 brainstorming YAML 被刷新且返回 `ok`、paths 在留痕中可见；RTM 写盘失败只返回 warning、不抛；存量标本（`createdAt < prototypeRulesSince`）缺节 → `exempted: legacy` 且不判不健康；新需求标本（`createdAt >= prototypeRulesSince` 且 sides 含 frontend）缺节 → 不健康并点名该需求；`expectedRTMFiles()` 仍返回 7 项。`pnpm typecheck` 退出码 0。

### t10 实现 `reqboard_submit(kind=prototype)` 登记编排与豁免留痕

**implementation**：改 `src/application/use-cases/SubmitArtifact.ts`：增 `kind='prototype'` 分支——① `assertArtifactOpenable` 按需求目录相对口径归一路径（伪路径/越界即拒）；② `kindForRelPath` 必须判为 `prototype`，旧 `prototype/*.html` 仍识别并在消息里提示迁移到 `prototypes/`；③ `parsePrototypeMetadata` 抽锚点与几何量（geometry JSON 坏按缺块记录，不抛；登记不阻断）；④ `registerArtifact` 幂等（stage+kind+path 去重）并写 `StageArtifact.prototypeMeta`；⑤ `triggerAutoConfirm` 请人确认（门禁只要求已登记，确认章为可选加强）；⑥ `syncRTMYaml('submit:prototype', {paths})` 失败只 warning。改 `src/tools/SubmitTool/SubmitTool.ts`：kind 入参含 `'prototype'`（`SUBMIT_KINDS` 已含）与可选 `path`（缺省扫 `docs/requirements/<REQ>/prototypes/*.html`），返回体增 `registered_count` 与逐份 `prototypes[]`（name/path/on_disk/registered/confirmed/exempted/authoritative/superseded_by/serves/anchors/geometry）与 `blockers`，失败不谎报成功。豁免生效时按 `prototypeExemptOf` 写一条需求评论 `[豁免] <理由>`（与 `design_exempt` 同款），且登记只校验不改写 INDEX。依据 design-brief §1 与 §10 #7/#9/#13/#41。

**acceptance**：`npx vitest run tests/submit-prototype.test.ts tests/submit-prototype-exempt.test.ts` 全绿：合法标本 `reqboard_submit(kind='prototype')` → `success=true`、`registered_count=1`、返回项 `anchors` 含 `'FR-4'`、`geometry` 观测量名含 `'tabsTop'`；重复调用 → `registered_count=0` 且台账不重复入簿、INDEX 内容逐字节未改；目录不存在 → `success=false`、`registered_count=0`、`blockers` 含 `prototype_missing`（不谎报成功）；豁免三态：空理由 → 仍拒；理由非空但 requirement 未落章 → 仍拒（agent 不能自豁免）；已落章 → 放行且写入一条 `[豁免] <理由>` 需求评论。`pnpm typecheck` 退出码 0。

### t11 把原型骨架迁入 brainstorming 并幂等落盘

**implementation**：① `git mv templates/design/prototype.html templates/brainstorming/prototype.html`（旧路径不留，避免两份模板）。② 骨架按 brief 补齐：每个功能点一个 `<section id="FR-N">` 区块位、**恰好一块** `<!-- proto-geometry {"observations":[...]} -->` 注释位、`prototypes/INDEX.md` 四列表格骨架（路径/状态/服务条款/被取代于）、权威版本标记位。③ 新增落盘 helper `src/application/internal/prototype-skeleton.ts`（≤120 行，IO 走注入端口）：`mkdir -p docs/requirements/<REQ>/prototypes/` 并只在目标文件不存在时按模板写 `prototypes/<name>.html`，永不覆盖已写内容。④ 在进入 brainstorming 的两处调用：`src/application/use-cases/CreateRequirement.ts`（立项即落）与 `src/application/use-cases/MoveRequirement.ts`（转移进入时）；落盘失败只 warning、不阻断转移。⑤ 在 `src/domain/template/registry.ts` 登记该模板引用。⑥ 旧目录 `prototype/*.html` 的迁移提示由存在门的 how 文案给出（见 t4/t2），本卡只保证识别不再落 `notes`。依据 design-brief §1 与 §10 #21。

**acceptance**：`npx vitest run tests/prototype-skeleton.test.ts` 全绿：进入 brainstorming 后需求目录下 `prototypes/<name>.html` 存在且含 `proto-geometry` 注释位与 INDEX 骨架；再次进入同一需求内容逐字节不变（先手改一行再跑仍不被覆盖）；`test ! -e templates/design/prototype.html` 为真且 `templates/brainstorming/prototype.html` 存在；非 UI 需求（sides 不含 frontend）进入 brainstorming **不**落盘。`pnpm typecheck` 退出码 0。

### t12 加拆分覆盖门的 UI 卡原型锚点维度

**implementation**：扩既有拆分覆盖门 `assertClauseCoverageGate`（在 `src/application/internal/content-gate-wiring.ts` 内，与 FR 落点门同一个判定单点）：当需求为 feature/refactor 且 sides 含 frontend 时，除「每条 FR 有落点」外再断言**每张 UI 卡的「设计落点」带原型锚点**——判据是任务对象或 `decomposition.md` 覆盖对照表的 `prototypeRefs`（形态 `prototypes/<name>.html#FR-N`）非空、且锚点文件路径与 INDEX 权威路径一致；缺失即拒并逐卡点名（gap 文案给出补写位置与模板）。两条落库入口自动复用（`src/application/use-cases/Decompose.ts` 与 `src/application/internal/approved-plan-landing.ts`），计划提交预检复用（`src/application/use-cases/SubmitArtifact.ts` 的 kind=plan 分支），既有调用点签名不变；非 UI 需求与存量需求（`req.artifacts` 为空）直接放行。依据 requirement.md FR-5 与 design/test-cases.md TC-17。

**acceptance**：`npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/clause-coverage-gate.test.ts` 全绿：UI 卡 `prototypeRefs` 为空 → 落库前被拒并点名该卡 key 与「设计落点」补写位置；补上 `prototypes/detail.html#FR-4` 后放行；非 UI 需求与存量需求不受影响；`assertClauseCoverageGate` 对「某条 FR 无落点」的既有拒绝行为零回归。`pnpm typecheck` 退出码 0。

### t13 定义阶段门时序常量与逾期码接线

**implementation**：新增常量 `StageGateTimeline`（放 `src/domain/gate/GateCatalog.ts`，与既有 `gateForTransition` 同源、可被脚本 import）：设计交完 → `['必填节','格式门','serves','无 dangling']`；拆分落库 → `['覆盖对照（FR→卡）','UI 卡原型锚点']`；实施收尾 → `['E2E 覆盖','三级追溯']`。新增逾期判据函数，返回 `GateFailure{code:'stage_gate_overdue'}` 并点名逾期门名。接线：在 `src/application/internal/content-gate-wiring.ts` 的 `contentGatesForMove` 内按 `(from,to)` 为 `design→decomposing`、`decomposing→implementing`、`implementing→accepting` 三个转移各判一次对应时点的门（复用既有 `checkNumberChainGate` / `checkRequirementDocFormatGate` / `checkDesignServesGate` / `assertClauseCoverageGate` 与三级追溯、E2E 覆盖读数），逾期即拒；brainstorming 期编号链 orphan 与 E2E 覆盖为 false **不算逾期**（防假红）。依据 design-brief §6 与 §10 #39。

**acceptance**：`npx vitest run tests/stage-gate-timeline.test.ts` 全绿：三标本各自被对应转移拒绝且 code 为 `stage_gate_overdue`、gaps 点名逾期门（设计已交完而 dangling 未绿 / 拆分已落库而 UI 卡无锚点 / 实施已收尾而 E2E 覆盖 false）；brainstorming 期编号链全 orphan 且 E2E false 的标本走同一门 → 放行；会话侧传输码为 `REQBOARD_STAGE_GATE_OVERDUE`。`pnpm typecheck` 退出码 0。

### t14 改 6 份模板：D-x 节、原型骨架、锚点列与两个对照项

**implementation**：逐份改：① `templates/brainstorming/feature.md` 增「讨论与裁定记录（D-x）」节骨架（表格五列 编号/原话来源/裁定/影响 FR/判据；**仅 feature**，同族五份不动，D-12）。② `templates/brainstorming/prototype.html`（t11 已迁入）确认含 `id="FR-N"` 区块位、单块 `proto-geometry` 位、INDEX 四列表格骨架、权威标记位。③ `templates/design/frontend.md`「原型页面」节改为指向权威原型与锚点（P-x/C-x ↔ `#FR-N`）并要求引用 D-x。④ `templates/decomposing/decomposition.md` 任务表增「原型锚点」「关联 D-x」两列（UI 卡必填），且 UI 卡验收标准模板含至少一条可失败的原型对照判据（结构断言 + 几何量硬判据）。⑤ `templates/implementing/task-card.md`「范围」节增「原型锚点」「关联 D-x」两个占位符，且占位符名必须与落库写入对齐（现有 `{{DESIGN_SERVES}}` 落库实测为空，不得再出现「模板有、落库无」）。⑥ `templates/accepting/verification.md` 增「与原型对照截图」「D-x 对照」两项。顺带修同族缺陷（D-5）：必填节标题的 serves 尾巴统一改成 `（serves: FR-x）` 括号写法（或让 `hasRootSection` 容忍行尾 HTML 注释，二选一并在卡内说明选了哪个），使照模板写出的文档能过 G2 必填节门禁。改完跑 `npx tsx scripts/template-gate-probe.mts`（t19 交付）确认 0 缺口。

**acceptance**：`npx vitest run tests/category-doc-sets.test.ts` 全绿且含断言：`templates/brainstorming/feature.md` 与 `templates/design/frontend.md` 渲染占位符后喂 `hasRootSection`/`missingCategoryDocs` → 0 缺口（D-5 逆验证：把必填节标题改坏 → 必红）；feature.md 的 H2 集合含「讨论与裁定记录（D-x）」而其余五份同族模板不含（D-12）；decomposition.md 任务表表头含「原型锚点」与「关联 D-x」；verification.md 含「与原型对照截图」与「D-x 对照」；task-card.md 含两个新占位符。`pnpm typecheck` 退出码 0。

### t15 注入片段面加 D-x/原型纪律并重生成内联产物

**implementation**：只改本仓段（vendored 原文与 vendor 逐字节一致，不得手改上游）：① `src/domain/prompt/fragments/common/iron-rules.md` 加两条铁律——需求阶段裁定必须落账 D-x；UI 需求在需求阶段必交原型。② `src/domain/prompt/fragments/brainstorming/feature.md` 加 D-x 落账清单项 + 原型交付项 + 确认前自查清单。③ `src/domain/prompt/fragments/design/feature.md`、`decomposing/feature.md`、`implementing/feature.md`、`accepting/feature.md` 各补「引用原型锚点 / D-x」纪律；有 `heavy/overrides.md` 的档（design/implementing/accepting）同步补一条覆盖段；`decomposing/` 实测只有 `feature.md`、无 overrides.md，如实说明不乱造文件。④ 重生成构建期内联产物：`node scripts/inline-prompt-fragments.mjs`，随后 `node scripts/check-prompt-fragments.mjs` 必须 exit 0（运行时不读盘，不重生成 = 注入的还是旧纪律）。⑤ 片段里出现的路径指针必须是真实存在的路径（供 t20 的 R3 扫描）。依据 design-brief §7 与 §10 #17。

**acceptance**：`node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs` 退出码 0（源与 `src/domain/prompt/generated/fragments.ts` 一致）；`npx vitest run tests/prompt-tiers.test.ts` 全绿；源码级断言：`iron-rules.md` 文本含 `'D-x'` 与原型必交两条，`brainstorming/feature.md` 片段含 D-x 与原型清单项；`git diff --stat vendor/` 为空（未改上游原文）。

### t16 三条注入通路带上原型与 D-x

**implementation**：① 改 `src/application/dive/round-state.ts` 的 `renderDiveRoundText`：brainstorming 回合提「裁定落账 + 交原型」，design 回合提 frontend.md 与原型锚点，implementing 回合提本卡锚点与 D-x 指针。② 改 `src/application/internal/node-input-package.ts`：`NodeInput` 增可选 `prototypeRefs?: string[]` 与 `decisions?: string[]`，渲染在「证据指针」节**两行**；`IsolateNodeContext` 与 handoff 底稿同源复用，保证遗弃上下文后新窗口只看输入包也能看到原型与裁定。③ 改 `src/application/use-cases/ExecuteTask.ts` 的 `buildSubtaskPrompt`：新增内容渲染为**三个小节标题**（非 JSON 字段）——`【本卡原型（UI 卡）】`（只 UI 卡：权威原型路径 + 本卡锚点）、`【本卡裁定（D-x 原话）】`（所有卡：按编号从 requirement 的 D-x 表逐条取原话，不概括、不重写）、`【验收判据】`；原型路径取 INDEX 权威版本，不取「目录里第一个 html」。依据 design-brief §7 与 §10 #12/#15/#36。

**acceptance**：`npx vitest run tests/subtask-prompt-prototype.test.ts tests/node-input-package.test.ts tests/round-state-dive.test.ts` 全绿：UI 卡提示词包含 `【本卡原型（UI 卡）】` 与 `prototypes/detail.html` 与 `#FR-4`；非 UI 卡**不含**该小节；带 `decisionRefs` 的卡提示词包含 `【本卡裁定（D-x 原话）】` 且该句与 requirement 文档里的裁定原文逐字一致；节点输入包渲染的「证据指针」节出现 `prototypeRefs` 与 `decisions` 两行，交棒底稿复用同一投影。`pnpm typecheck` 退出码 0。

### t17 客户端文档面板原型单列与权威/被取代投影

**implementation**：① 改 `src/application/query/QueryDocs.ts`：交付物白名单增 `prototypes/*.html` 与 `prototypes/INDEX.md`（kind 均为 `prototype`），原型不再落 `discovered`；读 INDEX 后投影 `DocPanelEntry.prototypeRole?: 'authoritative'|'superseded'` 与 `supersededBy?: string`（缺省不注入，旧形状不变，读 INDEX 失败也不伪造角色）；恒等式保持「`documents` 中来自台账的行数 + Σ `discovered.count` == `artifacts.length`」。② 改 `src/client/views/panels/docs.ts`：原型作为**确定交付物**在确定文档块内单列（新增 `data-doc-group="prototype"` 与原型计数），原型行**必须保留 `data-doc-row="1"`**（既有 `data-doc-row` 条数 == `documents.length` 的断言不许破），可点击打开走既有 `[data-open-doc]` 委派、不新增弹窗；对本次改动前已登记为 `notes` 的旧原型行用 `prototypeGroupOf(path)`（认 `prototypes/` 与 `prototype/` 两个前缀）在展示侧兜底归组，台账 kind 不回填。③ 改 `src/client/styles/report.ts`：新增 ≤3 条规则（原型徽标 / 计数 / superseded 弱化），只复用既有令牌并写在 `[data-report-shell]` 作用域内。依据 design-brief §9 与 §10 #30/#32/#34。

**acceptance**：`npx vitest run tests/docs-panel.test.ts tests/query-docs.test.ts` 全绿：`prototypes/detail.html` 与 `prototypes/INDEX.md` 出现在 `documents` 且 kind 为 `prototype`、不再出现在任何 `discovered` 分组；`documents` 中台账行数 + Σ `discovered.count` == `artifacts.length`；`data-doc-row` 条数 == `documents.length`；INDEX 有一条 `authoritative` + 一条 `superseded` 时两行分别带 `prototypeRole` 与 `supersededBy`，读不到 INDEX 时两字段都不注入；原型行可点开（存在 `data-open-doc`）且无新增弹窗与路由。`pnpm typecheck` 退出码 0。

### t18 验收单加两支对照项并同步三处 taskId 分支

**implementation**：① 改 `src/domain/workflow/AcceptanceSheetSpec.ts`（`VerificationItemSource` 的唯一真源，`src/shared/protocol.ts` 只 re-export）：判别联合增 `{kind:'prototype-compare';prototypePath:string}` 与 `{kind:'decision-compare';decisionIds:string[]}`；UI 需求（feature/refactor 且 sides 含 frontend 且存在已登记 prototype）组装 `prototype-compare` 项，`criterion` 逐字「与原型对照截图（含差异说明）」、`needsHuman=true` 且 `humanReason` 说明界面视觉需人对照权威原型；有 D-x 条目时组装 `decision-compare` 项（`criterion`「与裁定对照（逐条说明如何落实）」，载荷带 `decisionIds`）；已批准 `prototype_exempt` 的需求**不强制**该项，改渲染一行豁免说明「本需求已豁免原型（理由：…）」且不阻塞提交；非 UI 需求不出现该项。② **必须同时改三处 `taskId` 分支**，否则新 source 静默退化成 `undefined` / `fr_id='UNKNOWN'`：`src/application/use-cases/AcceptSheet.ts`（弹框 header 的中文标题分支）、`src/application/internal/accept-sheet-rtm-integration.ts`、`src/application/internal/status-rtm-integration.ts`（各自把两个新 kind 映射到原型/裁定标识）。③ 缺该项即拒：`src/application/use-cases/SubmitVerification.ts` 返回内部码 `verification_prototype_compare_missing`（传输码 `REQBOARD_VERIFICATION_INCOMPLETE`），豁免需求例外。④ 面板只加属性：`src/client/views/panels/docs.ts` 行上新增 `data-verify-source="<source.kind>"`，列结构不动。依据 design-brief §9 与 §10 #14/#31/#37/#38/#45。

**acceptance**：`npx vitest run tests/accept-sheet-rtm-integration.test.ts tests/accept-sheet-tool.test.ts tests/acceptance-criteria.test.ts` 全绿：UI 需求验收单必含 `prototype-compare` 项且 `criterion` 逐字为「与原型对照截图（含差异说明）」，非 UI 需求不含；有 D-x 时含 `decision-compare` 项且 `decisionIds` 非空；三处消费点喂新 source 后弹框 header 无 `'undefined'`、RTM 里无 `fr_id='UNKNOWN'`；已豁免需求无该项但有豁免说明行且提交不被阻塞；非豁免 UI 需求提交缺该项 → 内部码 `verification_prototype_compare_missing`。`pnpm typecheck` 退出码 0。

### t19 加 R1 模板门禁探针与 R2 节名双向一致探针

**implementation**：新增 `scripts/template-gate-probe.mts`（R1）：按 `scripts/template-render-map.json` 映射表渲染 `templates/**/*.md` 占位符（如 `{{TASK_ID}}`→`t-000000`、`{{DESIGN_SERVES}}`→`FR-1`；**未在表内的占位符 → exit 1 并点名**），把渲染结果喂 `missingCategoryDocs` + `checkRequirementDocFormatGate` + `checkDesignSectionsHaveServes`，0 缺口才 exit 0；提供 `--json`（机器可读结构；退出码语义不变 0 通过 / 1 判据失败 / 2 环境不可用）。新增 `scripts/doc-section-parity.mts`（R2）：门禁必填节集合（BASE+DELTA）与模板 H2 集合**双向相等**，并体现「讨论与裁定记录（D-x）」**仅 feature 模板**（D-12）；两个方向各造一次反例必须失败。两个脚本沿用既有 `tsx` 跑法（`npx tsx scripts/...`），不直跑 node。依据 design-brief §6 与 §10 #17/#26/#47。

**acceptance**：`npx tsx scripts/template-gate-probe.mts` 退出码 0 并打印 6 份模板逐份 OK 与「缺口 0」；人为把 `templates/brainstorming/feature.md` 的必填节标题改坏 → 退出码 1 且点名该模板与缺口；往模板塞未登记占位符 `{{NOPE}}` → 退出码 1 且点名该占位符；`npx tsx scripts/doc-section-parity.mts` 退出码 0，构造「模板多一节」与「门禁少一节」两个标本各退出码 1 并点名该节；两脚本 `--json` 输出可 `JSON.parse` 且退出码语义不变。

### t20 加 R3 提示词路径可达探针与 R4 pnpm 脚本接线

**implementation**：① 新增 `scripts/prompt-path-probe.mts`（R3）：扫 `src/domain/prompt/fragments/**` 与 `src/application/dive/round-state.ts` 文本里的路径 token（`templates/...`、`prototypes/...`、`docs/requirements/...`），每个必须真实存在或属已知产物名白名单；未命中即 exit 1 并列名单；提供 `--json`。② 改 `package.json`（R4）：增 `"prompts:check": "node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs"`，并把它并入提交前清单（知识层规范页由 `kb-conventions-sync` 生成，不得手改生成页）。依据 design-brief §6 与 §10 #17/#47。

**acceptance**：`npx tsx scripts/prompt-path-probe.mts` 退出码 0（片段与回合指令里的路径全部可达）；插一个指向不存在文件的指针 `templates/nope.md` → 退出码 1 并点名该指针；`pnpm prompts:check` 退出码 0，改一处片段源而不重生成后重跑 `pnpm prompts:check` → 退出码非 0（堵「静默注入旧纪律」）；读 `package.json` 的 `scripts['prompts:check']` 含 inline 与 check 两条命令。

### t21 加文档自检脚本 `req-doc-validate.mts`（9 项）并并入 R1

**implementation**：新增 `scripts/req-doc-validate.mts`：一条命令跑完 9 项文档校验——必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling；判定函数全部 import 既有实现（`content-gates`、`content-gate-wiring`、`rtm-health`、`content-trace`），不另写第二份判据；阶段时点清单同源读 `StageGateTimeline`（t13）。输出默认人类可读逐条 OK/FAIL + 汇总「缺口 n；exit 0|1」，`--json` 给机器可读结构；退出码 0 通过 / 1 判据失败 / 2 环境不可用。并入 R1：`scripts/template-gate-probe.mts` 在模板门禁之后调用本脚本的判据集合（或显式 spawn 本脚本并透传退出码），使「模板产物必过门禁」覆盖到文档校验全套。依据 design-brief §6 与 requirement.md FR-11 自检前置。

**acceptance**：`npx tsx scripts/req-doc-validate.mts` 退出码 0 并逐条打印 9 项 OK；人为删掉 `requirement.md` 的一个必填节标题 → 退出码 1 并点名缺哪一节；`npx tsx scripts/req-doc-validate.mts --json` 输出可 `JSON.parse` 且含 9 项判据名与缺口数组；`npx tsx scripts/template-gate-probe.mts` 的输出与退出码包含本自检结论（断言 R1 接线成立）。

### t22 核对存量兼容（加性零迁移 / RTM 缺节 pending / legacy 豁免）

**implementation**：对本仓存量需求与 8 条 archived 做核对与补齐判据，**不加迁移脚本、不改写旧数据**：① 断言三个新键（`StageArtifact.prototypeMeta?`、`TaskRecord.prototypeRefs?`、`decisionRefs?`）在旧分片缺键时读取不报错、值为未采集 `undefined`，只有写侧才带新键（口径 = 加性变更、零迁移）；② 断言 `vendor/reqboard/src/rtm/validator.ts` 对缺 `prototypes`/`decisions` 节与含未知 key 的旧 YAML 读出 `pending` 且不判损坏；③ 断言 `src/application/internal/rtm-health.ts` 的适用性判据下存量一律 `exempted: legacy`、不被判不健康；④ 断言新门对 `req.artifacts` 为空的存量/直种需求放行（`isLegacy` 与既有两个门同口径），已归档需求不被追溯拒绝、不回填原型与 frontend.md。跑法固化为 `npx vitest run tests/compat-regression.test.ts tests/rtm-health-legacy.test.ts` 加一次对存量目录的全量读取（读全部 `docs/requirements/*/rtm-*.yml` 不抛）。依据 design-brief §5 兼容基线与 §10 #19/#50。

**acceptance**：`npx vitest run tests/compat-regression.test.ts` 全绿：全量读取存量 `docs/requirements/*/rtm-*.yml` 零异常；缺节标本读出 `pending`；旧台账分片缺三个新键时读取路径不报错且不产生写回（`git status` 无旧分片改动）；存量需求走新门禁 → 放行；存量健康检查 → `exempted: legacy` 且不判不健康；本轮未新增任何迁移脚本（`git status` 无 `migrate-*` 新文件）。

### t23 产出端到端证据与六条逆验证

**implementation**：① 把探针族只打印的诊断行升为硬判据：改 `scripts/req-report-probe.mts`（既有 `--window-size` 与 `TABS_TOP_MAX=713` 硬上限保留），确保每个几何量都有断言分支、无 Chrome 环境 `exit 2`（响亮失败、不许静默跳过），并在回读时校验实际视口宽等于期望（`--window-size` 未生效即报错）。② 新增源码级断言用例 `tests/probe-hard-criteria.test.ts`：扫 `scripts/req-*-probe.mts` 中「只 `console.log` 几何量、无断言分支」的行，命中数必须为 0。③ 用既有 `scripts/reverse-drill-matrix.mts` 跑 6 条逆验证（人为改坏 → 必红）：R1 模板节标题、R1 渲染映射表项、R2 节名集合、R3 路径指针、R4 未重生成、`stripPrototypeAnchors` 移除。④ 把本轮四路径门禁回归（t6）、验收单对照项（t18）、文档自检（t21）串成一份端到端证据清单（命令 + 原始输出摘要 + 探针截图路径），供验收材料直接引用。依据 design-brief §6 与 §10 #25 及 requirement.md 验收标准 8/21/22。

**acceptance**：`npx tsx scripts/req-report-probe.mts` 退出码 0 且打印 `PROBE PASS`；人为改坏一处几何量（把硬上限改成必然违反的值）→ 退出码非 0 并打印具体判据；`CHROME_BIN=/nonexistent` 时 → 退出码 2；`npx vitest run tests/probe-hard-criteria.test.ts` 断言命中数为 0；`npx tsx scripts/reverse-drill-matrix.mts` 六条逆验证全部判定为必红（每条打印改坏点）；`pnpm typecheck` 与 `pnpm test` 全绿。

## §4 判定口径

- **容量口径（单一源）**：`detailUnits = files×1 + anchors×0.5 + chars/2000`，权重与容量取自 `src/domain/limits.ts`（`detailWeightPerFile=1`、`detailWeightPerAnchor=0.5`、`detailCharsPerUnit=2000`、`roundDetailUnits=16`）；判定函数 `judgeFootprint` 用**未取整原值**比较，`detailUnitsOf` 只做展示取整。**每张卡 ≤ 16 DU**。
- **声明下限**：`files` 不得小于 `implementation` 里点到的去重路径数（`declaredFilesFloorFrom` / `assertFootprintFloor`，路径前缀只认 `src|tests|docs|scripts`；`templates/`、`vendor/`、`package.json`、`docs/…` 之外的散文不计入）。允许留余量，**不允许缩水**（缩水是唯一能骗过容量门禁的方向）。
- **超容量**：本计划 **0 张超容量**，故计划行不出现 `⚠️超容量(建议N批)`；`suggestedBatchesOf = max(2, ceil(DU/16))` 仅在超容量时使用。
- **依赖口径**：`depends_on` 只允许引用**本计划内更早**的 key（禁前向引用）；本计划 23 卡构成 DAG，无环。
- **契约先行**：t1/t2/t3 是契约卡（类型 / 错误码与信封 / 编号与台账字段），实现卡一律 `depends_on` 它们；卡不跨层（domain 契约 → application 门禁 → 产出面/客户端 → 脚本/证据），每卡只在一个层内改动。
- **验收可跑**：每卡 `acceptance` 都给出命令（`pnpm typecheck` / `npx vitest run <文件>` / `npx tsx scripts/<脚本>`）与期望结果（断言名、退出码、必含字符串），无「相关模块通过」类空话；逆验证一律要求「人为改坏 → 必红」。
- **覆盖完整性**：FR-1~FR-11 每条至少被一张卡的 `requirement_refs` 接收（见 §1），无「本轮不做」；反向核对设计的 S-1~S-15 / P-1 / C-1~C-4 / I-1~I-8 / TC-1~TC-48 均被认领（I-8「无新增 HTTP API」如实记录为不改）。
- **零会话历史可开工**：每卡 `implementation` 写清改哪些文件、步骤、验证方式；不依赖本计划外的口头上下文。
- **本阶段不二次创作设计**：与设计矛盾之处不在卡内私改，统一进 §5。

**自测证据（用仓库真实函数逐卡计算，已跑并留档）**：探针 `scripts/tmp-plan-footprint-probe.mts`（用后删除）import `detailUnitsOf` / `judgeFootprint` / `suggestedBatchesOf` / `declaredFilesFloorFrom` / `assertFootprintFloor` / `checkAcceptance` / `normalizePlanTasks` + `LIMITS`，逐卡输出 DU 表并断言：每卡 ≤ 16 DU、`files ≥ 去重路径数`、`chars ≥ implementation` 长度、`acceptance` 过仓库可证伪校验、FR-1~FR-11 全覆盖、`depends_on` 无前向引用，最后把整份任务表喂**仓库真实归一函数 `normalizePlanTasks`**（即 `reqboard_submit(kind=plan)` 的落库入口）。结果：**23 卡全部 OK，最大单卡 14.8 DU（t15），总 DU 268.35，`normalizePlanTasks` 通过 23 张卡，`ALL CHECKS PASS`**（两次运行：首轮 t20/t22 触发 `REQBOARD_BAD_FOOTPRINT`，`files` 已按实测路径数从 5→7、4→6 修正后全绿）。

## §5 需退回设计的问题

1. **`StageGateTimeline` 的落点与「对应转移门禁」未点名**（非矛盾，是设计留白）：design-brief §6 只给常量内容与「逾期由对应转移的门禁拒绝」，未指定落点文件与承载函数。本计划落在 `src/domain/gate/GateCatalog.ts`（与既有 `gateForTransition` 同源、可被脚本 import）+ `content-gate-wiring.contentGatesForMove` 扩分派（t13）。请设计确认落点，或指定其他唯一处。
2. **「拆分覆盖门」的 UI 卡锚点维度未点名函数**：requirement FR-5 与 test-cases TC-17 只写「落库前跑覆盖门」，backend/interfaces 的 S-15 只覆盖 RTM `covers_prototypes`。本计划扩既有单点 `assertClauseCoverageGate`（`src/application/internal/content-gate-wiring.ts`，t12）。请设计确认是否就是这个单点，避免实现落成第二处覆盖判定。
3. **原型骨架落盘的承载模块未点名**：design-brief §1 只写「进入 brainstorming 时按模板幂等落盘」，architecture 的目录结构未列该模块。本计划新建 `src/application/internal/prototype-skeleton.ts`（t11，≤120 行、IO 走端口）——这是**本计划新增的模块**（改动盘点已标偏差）。请设计确认：新建模块，还是并入既有 `category-doc-sets.ts` / `template/registry.ts` 的消费者。
4. **`fragments/decomposing/heavy/overrides.md` 在仓库不存在**：design-brief §7 把该文件列为必改项，实测 `src/domain/prompt/fragments/decomposing/` 只有 `feature.md`（无 `heavy/overrides.md`；design/implementing/accepting 有）。本计划按「有则补、无则新建由设计点名」处理（t15 只改存在的文件）。请设计确认是否要新建该覆盖段文件。
5. **`VerificationItemSource` 的声明处与设计描述不一致**：design/frontend.md 与 interfaces.md 把它写在 `src/shared/protocol.ts`，实测**真源**在 `src/domain/workflow/AcceptanceSheetSpec.ts`（`protocol.ts` 只 `import type` + `export type` 再导出）。本计划以 `AcceptanceSheetSpec.ts` 为唯一真源、不在 `protocol.ts` 重复声明（t1 不动它、t18 改真源）。请设计确认，避免出现两处声明（正是本需求要禁的「两份真相」）。
6. **需求级验收标准缺 FR-7 条目（设计 §10 #27 已记，需求侧待决）**：设计侧已由 `interfaces.md` 的 `prototype-compare` 项接口 + 判据补足，需求侧是否补一条 22 条之外的需求级验收标准**留给用户决定**（可选 `change_note` 重确认）。本计划不替需求发明条款（t18 按设计侧口径验收）。

> 除上述 6 条外，本计划与 7 份设计**无矛盾**；无「待定（需补 brief）」残留——brief §10 五十条决议在本计划内逐处引用（`#1`~`#50`）。

## 覆盖完整性规则

1. **每行三格不许空**：§1 表「接口 / 页面模块 / 用例」三格均非空，无「—」豁免行（本需求无纯文档条款）。
2. **反向也要查**：设计文档与用例表里的编号在 §1 表均已认领；I-8「无新增 HTTP API」为设计明文结论，如实记录为「不改」，非超范围。
3. **每个 FR-x 必须有人接**：FR-1~FR-11 全部有接收任务；任务卡 `requirement_refs` 由本计划 §2 与 `notes/plan-tasks.json` 同源落库（悬空引用会被拒）。
