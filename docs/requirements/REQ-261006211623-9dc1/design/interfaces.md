# 接口契约：需求 / 设计 / 拆分三面文档判据门禁（REQ-261006211623-9dc1） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 本文登记本次加固引入的**对外可观察契约**：函数签名、工具入参与出参、错误码、探针 CLI、
> 以及「硬拒 / 软提示」的分界。逐条对照源码写成，未核对到的写法一律不写。
> 配套：`design/data-model.md`（台账字段、不变式、读法单点）。

## 一、契约总览与强度分级 <!-- serves: FR-1, FR-3, FR-4, FR-5, FR-7, FR-8 -->

**强度只有两种，调用方据此决定重试策略**：

| 强度 | 语义 | 调用方应该做什么 | 本次属于这一档的判据 |
|---|---|---|---|
| 硬拒 | 抛错 / `GateFailure`，**台账零改动**（判定都在 mutate 之前） | 按 `how` 修文档或入参，改完**原样重试**；不要重试同一份输入 | `sides` 声明、必填节、条款覆盖、跳联调理由、计划文档任务表 |
| 软提示 | `success: true`，回执里多一个键 | 可直接继续；提示进人读面，由人决定改不改 | 条款判据缺口、零交集依赖边、任务表缺列、词表外符号 |

**五个入口各自的判据集**：

| 入口 | 硬拒 | 软提示（出参键） |
|---|---|---|
| `reqboard_submit(kind=requirement)` | `sidesGateFailure` → `requirement_sides_invalid`；`docSectionGateFailure` → `requirement_section_missing` | `clause_criteria_warnings` |
| `reqboard_submit(kind=plan)` | `assertClauseCoverageGate` → `requirement_uncovered`；计划文档任务表硬判 → `plan_doc_task_table_incomplete`；`normalizePlanTasks` 抛 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED` | `plan_doc_warnings`、`dependency_warnings` |
| `reqboard_decompose(tasks=…)` | 同 `normalizePlanTasks`（共用一份归一）+ 共用 `assertClauseCoverageGate` | 无新增出参键（复用既有回执） |
| `scripts/design-coord-probe.mts` | 进程退出码 1（缺口）/ 2（不可用） | 软观测（符号轨、花括号目录前缀），不改退出码 |
| 看板 DAG 查询 | 无（只读投影，不拒任何写路径） | `DagGraphNode.chainMissing` / 汇总条 `子卡链未生成 N 张` |

## 二、函数契约（逐条） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

### FR-1 条款判据词汇表与扫描 <!-- serves: FR-1 -->

| 符号 / 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `CLAUSE_CRITERIA_WINDOW` | `src/application/internal/clause-criteria.ts:44` | `const = 40` | 数字（条款块向下扫描的行数上限） | 不是判据，只是病态文档兜底（真正的边界是文档结构：下一条款定义行 / 层级不深于本条款的标题） |
| `clauseCriteriaGaps` | `src/application/internal/clause-criteria.ts:88` | `(doc: ParsedDoc) => ClauseCriteriaGap[]` | 逐条缺口 `{ clause, line, excerpt }`；`line` 是 `bodyLines` 的 0 基下标，`excerpt` 截断 60 字 | 纯函数零 I/O，**不抛错**；空数组 = 每条条款块内都有锚点 |
| `clauseCriteriaHints` | `src/application/internal/clause-criteria.ts:122` | `(doc: ParsedDoc) => string[]` | 0 或 1 条人读提示（含逐条点名与修复示例） | 无缺口时返回**空数组**（不是 `undefined`） |
| `EVIDENCE_ANCHOR` | `src/domain/workflow/EvidenceAnchor.ts:23` | `RegExp`（`i`） | 命中 = 有可核验锚点：路径后缀 / 命令名 / `SELECT` / `diff` / `N passed`·`N 通过` | 宽松判定（命中任一即可），刻意不判"这条够不够好" |
| `CLAUSE_VALUE_ANCHOR` | `src/domain/workflow/EvidenceAnchor.ts:36` | `RegExp`（`i`） | 条款级**附加**形态：退出码 / 返回码 / 状态码 / 错误码 / `REQBOARD_[A-Z_]+` / `exit N` / `≥` / `≤` / `==` / `!=` / 不小于 / 不超过 / 等于 / 全绿 / 逐字节 | **刻意不收裸数字**（"8 段进度带"是描述参数，不是判据） |
| `CLAUSE_CRITERIA_ANCHOR` | `src/domain/workflow/EvidenceAnchor.ts:42` | `new RegExp(EVIDENCE_ANCHOR.source + '\|' + CLAUSE_VALUE_ANCHOR.source, 'i')` | 两源的并集（条款级判据的唯一正则） | 与结单证据共用一个词汇表源；两处各写一份必然分叉 |

**定义行口径复用**：条款定义位由 `content-gates.ts` 的 `DEF_LINE_RE` 单点认定
（列表写法 `- **FR-3: …**` 与标题写法 `### FR-1：…` 都算，标题走「给标题文本前置 `**` 再匹配」那一步）：

| 复用点 | 文件 | 说明 |
|---|---|---|
| `DEF_LINE_RE` | `src/application/internal/doc-parse.ts`（导出，`clause-criteria.ts` 直接 import） | 编号门禁 / 条款覆盖门禁 / 条款判据三处**同一份**定义位口径，不另立第二份 |
| `clauseDefinitionOf`（模块私有） | `src/application/internal/clause-criteria.ts:74` | 本模块内的定义位解析；`undefined` = 该行不是条款定义行 |

### FR-2 设计坐标探针（脚本导出面） <!-- serves: FR-2 -->

| 符号 / 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `main` | `scripts/design-coord-probe.mts:889` | `(argv: readonly string[]) => void` | 无（`process.exit`） | 退出码三态由 `main` 统一给出；仅在"被直接执行"时自跑（被 import 时不自 exit） |
| `parseArgs` | `scripts/design-coord-probe.mts:306` | `(argv: readonly string[]) => ParsedArgs \| string` | 解析结果；返回 `string` = 用法错误文案 | 未知参数 / 缺参数值 → 返回错误串，`main` 据此 exit 2（**不静默忽略**） |
| `preflight` | `scripts/design-coord-probe.mts:565` | `(root: string, reqId: string, symbolsPath: string) => string \| null` | `null` = 可用；否则是不可用原因文案 | 需求号形态非法 / 需求目录不存在 / 设计目录缺失 / 设计目录无 `*.md` / 符号词表缺失 → 五类「不可用」 |
| `scanRequirement` | `scripts/design-coord-probe.mts:580` | `(root: string, reqId: string, symbolsPath: string) => ScanResult` | 扫描读数（`gaps` / `observations` / `verdicts` / 计数） | 前置不满足时**抛错**（调用方先跑 `preflight` 把它变成 exit 2） |
| `classifyPaths` | `scripts/design-coord-probe.mts:391` | `(root: string, hits: readonly TokenHit[]) => { verdicts, gaps, observations }` | 路径维判定 | 命中 `WHITELIST` → 记 `whitelist` 不记缺口；目录前缀不在盘上的花括号写法 → 只进软观测 |
| `checkWriteback` | `scripts/design-coord-probe.mts:462` | `(root: string, designText: string, changed: readonly ChangedPath[]) => { gaps: Gap[]; excluded: number }` | 回写缺口 + 被排除条数 | 非源码类落点（`tests/`、`docs/`…）不进 `gaps`，但**必须计入 `excluded`**（不静默少判） |
| `isSourceLanding` | `scripts/design-coord-probe.mts:273` | `(path: string) => boolean` | `true` = 源码类落点（`SOURCE_LANDING_PREFIXES`：`src/`、`scripts/`、`packages/`、`lib/`） | 只有它覆盖的落点才要求回写「模块改动地图」 |
| `loadSymbolSet` | `scripts/design-coord-probe.mts:529` | `(path: string) => Set<string>` | 符号词表 | 词表缺失已被 `preflight` 拦成 exit 2 |
| `classifySymbols` | `scripts/design-coord-probe.mts:543` | `(root: string, hits: readonly SymbolHit[], symbolSet: ReadonlySet<string>) => Observation[]` | 只出 `kind: 'symbol'` 的**软观测** | 词表是导出符号级；设计里同时装着字段名 / 作废变体名 / 拟新增名，硬判会制造大量假红 |
| `buildReport` | `scripts/design-coord-probe.mts:642` | `(root: string, reqId: string, res: ScanResult) => Report` | `--json` 的结构体与退出码来源（`gaps.length === 0 ? 0 : 1`） | 环境不可用不走这里（走 `fail` 的 exit 2 形状） |
| `runSpecimen` | `scripts/design-coord-probe.mts:732` | `() => { cases: SpecimenCase[]; exitCode: 0 \| 1; root: string }` | 5 个内置反例的逐条结论 | 全部在 `mkdtempSync` 合成树里跑，`finally` 整棵删掉——**绝不改仓库真实文件** |
| `WHITELIST` | `scripts/design-coord-probe.mts:147` | `readonly WhitelistRule[]`（`{ match: RegExp; reason: string }`） | 9 条书写法白名单，**顺序即优先级** | 准入条件：每条必须写清「这个人不存在也合理」的可审计理由；说不清的就是缺口 |
| `SOURCE_LANDING_PREFIXES` | `scripts/design-coord-probe.mts:270` | `readonly ['src/', 'scripts/', 'packages/', 'lib/']` | 回写判据的落点前缀 | `tests/`、`docs/`、`templates/`、`prototypes/`、`vendor/` 各有自己的表达位置，不判回写 |

### FR-3 `sides` 判定与门 <!-- serves: FR-3 -->

| 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `sidesDeclarationGap` | `src/application/internal/category-doc-sets.ts:152` | `(category: string \| undefined, frontmatter: Readonly<Record<string, string>>) => string \| undefined` | `undefined` = 合规；否则是缺口文案 | 只对 `feature` / `refactor` 判（其它类型直接 `undefined`）；三类缺口：**key 缺失** / 空串 / 含非法值（合法值只有 `frontend` / `backend`）；`sides: []` 合法（= 明确声明无端侧改动） |
| `frontmatterList` | `src/application/internal/category-doc-sets.ts:100` | `(value: string \| undefined) => string[]` | 括号 / 逗号两种写法都认，逐项去引号 | 与 `VALID_SIDES` 同源；本模块是端侧语义的唯一事实源 |
| `designDocPolicyFrom` | `src/application/internal/category-doc-sets.ts:120` | `(frontmatter: Readonly<Record<string, string>>) => DesignDocPolicy` | `{ sides, exempt }` | 它的 `filter(s => VALID_SIDES.has(s))` 正是修前的**静默过滤**病灶：非法值与缺失后果相同 |
| `sidesGateFailure` | `src/application/internal/content-gate-wiring.ts:492` | `(category: string \| undefined, frontmatter: Readonly<Record<string, string>>, createdAt: number \| undefined) => GateFailure \| undefined` | `GateFailure{ code: 'requirement_sides_invalid', kind: 'requirement' }` 或 `undefined` | 先过 `docQualityRulesApply(createdAt)`：存量需求与 `createdAt` 不可得者**不判**；**独立成门**（不并进格式门：格式门有 `isLegacy`，而首次提交正是 artifacts 为空那一次） |

### FR-4 必填节门与规则起点 <!-- serves: FR-4 -->

| 符号 / 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `FAILURE_CONCURRENCY_SECTION` | `src/application/internal/content-gate-wiring.ts:513` | `const = '失败与并发路径'` | 节名（模板 / 门禁 / 探针三处同源） | 改一处必须改三处 |
| `docSectionGateFailure` | `src/application/internal/content-gate-wiring.ts:529` | `(category: string \| undefined, rootText: string, createdAt: number \| undefined) => GateFailure \| undefined` | `GateFailure{ code: 'requirement_section_missing', kind: 'requirement' }` 或 `undefined` | 三重早退：规则不适用（存量 / 读数不可得）、非 `feature`/`refactor`、`hasRootSection` 命中；**刻意不进 `CATEGORY_DELTAS`**（DELTA 会被拆分提交 / 设计门 / 文档自检复用到存量需求 = 追溯） |
| `DOC_QUALITY_RULES_SINCE` | `src/domain/workflow/DocQualityRules.ts:20` | `const = Date.parse('2026-10-06T12:00:00.000Z')` = `1791288000000` | 规则上线时刻（毫秒） | 常量而非配置：配置化会让"这条需求吃不吃新门"变成每次都要读一遍的运行时问题 |
| `docQualityRulesApply` | `src/domain/workflow/DocQualityRules.ts:28` | `(createdAt: number \| undefined) => boolean` | `createdAt !== undefined && createdAt >= DOC_QUALITY_RULES_SINCE` | `createdAt` 不可得（旧台账 / 测试夹具）→ `false`（**不判**，宁可少报也不把存量误报成违规） |
| `hasRootSection` | `src/application/internal/category-doc-sets.ts:303` | `(rootText: string, name: string) => boolean` | 节是否存在 | 「不适用：<理由>」的**保留节**照样命中（保留节能被判，删节不能——这正是要它存在的原因） |

### FR-5 拆分引用取数与覆盖门 <!-- serves: FR-5 -->

| 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `assertClauseCoverageGate` | `src/application/internal/content-gate-wiring.ts:163` | `(docs: DocsReader, req: RequirementRecord, rawTasks: readonly unknown[]) => Promise<GateFailure \| undefined>` | `GateFailure{ code: 'requirement_uncovered', kind: 'decomposition', gaps }` 或 `undefined`（含 UI 卡锚点维的后续判定） | 早退四条：存量（`artifacts` 为空）/ 需求文档不存在 / 文档无编号条款 / 「条款全被覆盖且非 UI 需求」。**`covered` 只来自 `rawTasks.flatMap(requirementRefsOf)`**；文档覆盖表已删出门禁取数，只留 `how` 里一句「仍建议写但不作依据」 |
| `requirementRefsOf` | `src/application/internal/content-gate-wiring.ts:133` | `(raw: unknown) => string[]` | 任务对象上的 `requirement_refs`（兼容 `requirementRefs`）；非数组 / 非字符串项静默丢弃 | 非对象 → `[]`（不是报错：黑名单式窄口径会让脏值静默漏判） |
| `refsForLanding` | `src/application/internal/plan-refs.ts:55` | `(input: RefsForLandingInput) => Promise<RefsForLandingResult>` | `{ refsByKey: Map<string, string[]>, sources: Map<string, RefSource> }`，`RefSource = 'explicit' \| 'doc' \| 'none'` | 非法显式值抛 `REQBOARD_BAD_REQUIREMENT_REF`（经 `normalizeRequirementRefs`）；文档通道只在显式全空且 `refsByKey.size > 0` 时补齐——**存量 / 回填通道**，新计划走不到 |
| `planRefsFromDoc` | `src/application/internal/content-gate-wiring.ts:105` | `(docs: DocsReader, req: { id: string }) => Promise<Map<string, string[]>>` | `decomposition.md` 覆盖对照表的「计划 key → FR」；文件不存在 → 空 Map | 注意字段名：`taskRefsFromDecomposition` 返回的对象用 **`id`** 承载计划键（不是 `key`） |
| `planRefsMissing` | `src/application/internal/content-gate-wiring.ts:125` | `(keys: readonly string[], refsByKey: ReadonlyMap<string, string[]>) => string[]` | 无落点的计划 key | 本次**保留**（仍被 e2e 直接调用）；门禁已不作为拒绝依据 |
| `unrefedKeys` | `src/application/internal/plan-refs.ts:99` | `(keys: readonly string[], refs: ReadonlyMap<string, string[]>) => string[]` | 无落点的计划 key | 只回答"哪些卡没有落点"，是否拒绝由调用方决定 |

### FR-6 子卡链红标（两份逐字同源） <!-- serves: FR-6 -->

| 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `chainMissingOf`（模块私有，**未导出**） | `src/application/query/QueryDag.ts:67` | `(task: TaskRecord, kids: readonly TaskRecord[]) => boolean` | 判据四步：有子卡 → `false`；`stages: []` 显式 solo → `false`；`status === 'in_progress'` → `true`；`status === 'done'` → `Array.isArray(stages) && stages.length > 0`；其余 → `false` | application 层**禁止** import client（`tests/layer-boundary.test.ts` 机械检查），故只能重写一份；两处漂移的症状是「看板标了、详情页没标」 |
| `chainMissing` | `src/client/dag/progress-bar.ts:200` | `(card: { status: string; stages?: readonly unknown[] }, kids: readonly unknown[]) => boolean` | 同上，逐字同源 | 与 `QueryDag.ts` 必须同步改；`done` 的窄口径理由：不声明 `stages` 的存量 done 卡一律打标会大面积变噪声 |
| `buildDagNodes` | `src/application/query/QueryDag.ts:77` | `(tasks: readonly TaskRecord[], layerOf?: ReadonlyMap<string, number>) => DagGraphNode[]` | 节点数组；`chainMissingOf` 为真时才写 `chainMissing: true`（**缺省不带键**，不写 `false`） | 读侧判据是 `t.chainMissing === true`（`src/client/views/panels/dag.ts:195`） |

**读侧消费点（两处，均只认 `=== true`）**：

| 消费点 | 文件 | 表现 |
|---|---|---|
| 看板汇总条 | `src/client/views/panels/dag.ts:195`、`:211` | `chainMissing > 0` 时输出 `data-dag-chain-missing="N"` 与「子卡链未生成 N 张」 |
| 卡面 chip | `src/client/node-panel.ts:281`、`src/client/views/stage-detail.ts:390` | 逐卡调 `chainMissing(t, kids)` 出 chip |

### FR-7 依赖理由与联调理由 <!-- serves: FR-7 -->

| 符号 / 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `PlanTask.skipIntegrationReason` | `src/shared/protocol.ts:719` | `skipIntegrationReason?: string` | 归一后截断 300 字；空串 → **键整体不带** | 随 `skipIntegration: true` 必填，缺则 `normalizePlanTasks` 抛错（见错误码表） |
| `PlanTask.dep_reasons` | `src/shared/protocol.ts:736` | `dep_reasons?: Record<string, string>` | 归一后恒为 map；`key` 截断 40 字、理由截断 300 字；空 map → 键整体不带 | 三种入参形态归一到它（见下节）；**不落 `TaskRecord`** |
| `depReasonsOf`（模块私有，**未导出**） | `src/shared/protocol.ts:1078` | `(raw: unknown) => Record<string, string> \| undefined` | map；无有效条目 → `undefined` | 形状不合法（既非数组也非对象）按**未申报**处理，不炸整份计划：凭据格式手滑不该让人丢掉整张任务表 |
| `normalizePlanTasks` | `src/shared/protocol.ts:1107` | `(raw: unknown) => PlanTask[]` | 归一后的计划任务表 | `tasks` 非数组 / 空 / >50 项 → `bad()`；`key` 重复 / 依赖悬空 / 前向引用 → `bad()`；缺联调理由 → 抛带 `code` 的错误（唯一一条用带码抛错的字段级硬判） |
| `zeroOverlapDependencyWarnings` | `src/application/internal/plan-deps-check.ts:82` | `(tasks: readonly PlanTask[]) => string[]` | 零交集且无理由的依赖边逐条点名（含两端文件清单与修复示例） | **不拒**；三条沉默边界：本卡抽不到路径、上游抽不到路径、`dep_reasons[dep]` 已给理由 |
| `declaredFiles` | `src/application/internal/conflict-check.ts:28` | `(implementation: string) => string[]` | 从 `implementation` 文本抽出的路径（去重） | 抽取口径由该文件的 `PATH_RE` 决定（`packages` / `scripts` / `tests` / `docs` 四根，含可选 `agent-dh/` 前缀）——**抽不到 = 没有证据 = 不判定**（不误报成伪依赖） |

### FR-8 计划文档任务表读取与判据 <!-- serves: FR-8 -->

| 函数 | 文件 | 签名 | 返回 | 失败语义 |
|---|---|---|---|---|
| `readPlanDocTaskTable` | `src/application/internal/plan-doc-table.ts:38` | `(docText: string) => PlanDocTaskTable` | `{ found, keys, header }`；`keys` 去重（按表内出现顺序，行内多个 key 由 `planKeysIn` 再拆） | 表头判据 = 含「计划 key」（与 `scripts/template-gate-probe.mts` 的 decomposition 判据同词法，改这里必须同时改探针）；只取**第一张**命中表（不猜"合并多表"，猜错会静默放行） |
| `planDocTaskTableMissing` | `src/application/internal/plan-doc-table.ts:52` | `(reading: PlanDocTaskTable) => boolean` | `!reading.found` | 硬判据之一；`found === false` 时另一条硬判据（覆盖）无从判起 |
| `planDocUncoveredKeys` | `src/application/internal/plan-doc-table.ts:57` | `(reading: PlanDocTaskTable, keys: readonly string[]) => string[]` | 文档里**没收录**的卡 key | 硬判据之二；空数组 = 覆盖齐 |
| `planDocColumnWarnings` | `src/application/internal/plan-doc-table.ts:63` | `(reading: PlanDocTaskTable) => string[]` | 缺列点名：缺「验收」/ 缺「工作量」（宽匹配 `工作量\|体量\|footprint\|S/M/L`）/ 缺「依赖」 | 软判据：**只披露不拒**（列缺失是披露问题，不是"批的东西不是落的东西"）；`found === false` 时返回空数组（没表可判列） |
| `planKeysIn` | `src/application/internal/content-trace.ts:147` | `(cell: string) => string[]` | 单元格里的计划 key（按 `，,、\s\|` 拆分、剥括号、排除根编号形态） | 读表层复用它的 key 口径，不另立第二份 |

## 三、工具入参契约（`reqboard_submit`） <!-- serves: FR-5, FR-7 -->

`tasks[]` 的两个新键在 `src/tools/SubmitTool/SubmitTool.ts:84`–`:105` 声明
（该 schema 是 `additionalProperties: false`：**未声明的键被绑定层直接拒收**，所以两种拼法都必须声明）：

| 入参键 | schema 类型 | 归一结果 | 形态纪律（为什么是这个形态） |
|---|---|---|---|
| `tasks[].skip_integration_reason` | `string` | `PlanTask.skipIntegrationReason`（`.trim().slice(0, 300)`） | 与 `skipIntegration: true` **成对**：给 true 不给理由 → 整份计划被拒（`REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`）。camel 拼法 `skipIntegrationReason` 等价，**camel 优先**（`o.skipIntegrationReason ?? o.skip_integration_reason`——`??` 只认 `null` / `undefined`，故 camel 写了**空串**不会回落 snake，那一份照样按"缺理由"被拒） |
| `tasks[].dep_reasons` | `string[]`（数组项 `string`） | `PlanTask.dep_reasons`（map） | 每条形如 `"t2=一句话语义理由"`；分隔符认半角 `=` 与 `：`/`:`，按**第一个**分隔符切（理由正文里可以再出现等号 / 冒号）。camel 拼法 `depReasons` 等价，两者**取并集**（同一条边两种写法各写一遍不互相覆盖，冲突时 camel 胜） |
| `tasks[].requirement_refs` | `string[]` | `TaskRecord.requirementRefs`（经 `refsForLanding`） | 覆盖门禁的**唯一**取数口；只补计划文档覆盖表 = 门禁依旧红 |

**为什么 `dep_reasons` 是字符串数组而不是 map（必读）**：
dsh-tools 的参数 schema DSL **不接受未显式声明值的 map**
（`additionalProperties must be explicitly true or false`）——写成 `{"t2": "…"}` 这种形态会让
`defineSubmitTool` 整个抛 `JsonSchemaError`（2026-10-06 实测踩过），工具定义直接不可用。
故工具面只能表达字符串数组，`键 → 理由` 的还原放在归一里做（`depReasonsOf`）。

**`depReasonsOf` 认三种入参形态（每一种都有真实来源，不是过度设计）**：

| 入参形态 | 来源 | 归一 |
|---|---|---|
| 字符串数组 `["t2=一句话", "t4：一句话"]` | **工具 schema 的形态**（`dep_reasons` / `depReasons`） | 按首个 `=` / `：` / `:` 切成 `{ key: reason }` |
| 对象数组 `[{ key, reason }]` | 结构化写法（agent 更愿意写两栏时）；键名容 `key` / `dep` / `up`，值名容 `reason` / `why` | 逐项 `put()` |
| 纯对象 map `{ "t2": "…" }` | 非工具入口（HTTP / 台账直写 / 历史数据）与 `PlanTask` 自身的存储形态 | 逐键 `put()` |

**归一的丢弃规则**（软失败的边界）：key 空、value 非字符串或空串 → 该条丢弃而非报错；
key 截断 40 字、value 截断 300 字；归一无有效条目 → 键整体不带（不写空 map）。

## 四、工具出参契约 <!-- serves: FR-1, FR-7, FR-8 -->

**统一纪律：非空才出键**——值为空数组时**键整体省略**（不是发 `null`、不是发 `[]`）。
这条纪律让调用方只有一种判空写法：`warnings === undefined || warnings.length === 0`。

| 出参键 | kind | 声明处 | 内容 | 谁产生 |
|---|---|---|---|---|
| `clause_criteria_warnings` | `requirement` | `SubmitTool.ts:228` | 无可执行判据的条款逐条点名（软提示，不阻断） | `clauseCriteriaHints(doc)`；同时拼进 `note` 的「条款判据提示（不阻断）：…」 |
| `plan_doc_warnings` | `plan` | `SubmitTool.ts:252` | 提交的那份计划文档里任务表的**缺列**点名 | `planDocColumnWarnings(table)` |
| `dependency_warnings` | `plan` | `SubmitTool.ts:236` | 依赖面点名：① 文档依赖表声明了依赖而 `tasks[]` 对应 key 全空（漏传 `depends_on` 防线）；② 零交集依赖边（无理由） | `planDependencyWarnings(planDocText, tasks)` **并入** `zeroOverlapDependencyWarnings(tasks)`（同一数组顺序拼接，`SubmitArtifact.ts:486`–`:489`） |

**为什么零交集边并入既有 `dependency_warnings` 而不新开键**：调用方只该有一个「依赖面不对劲」的读数口；
两处点名会让人以为是两件事（而且新键要同步改 schema 三处）。`plan_doc_warnings` 则是新键——
它答的是另一个问题（文档披露完整度），与依赖面无关。

**其他始终在场的键（不适用「非空才出键」）**：

| 键 | kind | 语义 |
|---|---|---|
| `success` | 全部 | 软提示不改变它（恒 `true`）；硬拒根本没有返回体（抛错） |
| `overCapacity` | `plan` | 恒在场，无超容量卡 = **空数组**（调用方只有一种判空写法）；`capacityNote` 自述容量是常量还是配置 |
| `orphan_clauses` | `plan` | 根编号无下游（需求里有、没人接）——**不阻断提交**，供看板标红 |
| `marker_warnings` | `plan` | `capacity.markerGate='warn'` 时的缺标记点名；enforce 路径上键整体省略 |

## 五、错误码表 <!-- serves: FR-3, FR-4, FR-5, FR-7, FR-8 -->

**码 → 触发 → 强度 → 修复锚点**（硬码的判定都在 mutate 之前，**台账零改动**，可原样重试修好的输入）：

| 码 | 触发 | 强度 | 修复锚点 |
|---|---|---|---|
| `requirement_sides_invalid` | `submit(kind=requirement)`：`feature`/`refactor` 的 front-matter `sides` 缺失 / 空串 / 含非法值（如 `[doc]`），且需求适用新规则（`createdAt >= DOC_QUALITY_RULES_SINCE`） | **硬拒**（`sidesGateFailure`，独立成门） | 在 `requirement.md` front-matter 写 `sides: [frontend]` / `[backend]` / `[frontend, backend]` / `[]`（括号与逗号两种写法都认）；值只能是 `frontend` 或 `backend`，`[]` = 明确声明无端侧改动 |
| `requirement_section_missing` | `submit(kind=requirement)`：适用新规则的 `feature`/`refactor` 需求缺必填节「失败与并发路径」 | **硬拒**（`docSectionGateFailure`） | 按 `templates/brainstorming/<category>.md` 的同名节补上；确实不适用写一句「不适用：<理由>」**保留节**，不要删节 |
| `requirement_uncovered` | 拆分提交 / 落库前：某条根编号既没被任何任务卡用 `requirement_refs` 接收、也没标「本轮不做」 | **硬拒**（`assertClauseCoverageGate`；`kind: 'decomposition'`，`gaps` 逐条点名） | **唯一可执行路径**：在 `reqboard_submit(kind=plan)` 的 `tasks[]` / `reqboard_decompose` 的 `tasks[]` 里给每张卡写 `requirement_refs:["FR-N"]`；只补计划文档覆盖表 = 门禁依旧红（文档表已不作依据） |
| `plan_doc_task_table_incomplete` | `submit(kind=plan)` 且 `tasks.length > 0`：读不到那份计划文档（`path` 指向的**提交件**）里的任务表，或表里的 key 覆盖不了 `tasks[].key` 全集 | **硬拒**（`SubmitArtifact.ts:372`–`:398`；两种形态**共码**，靠 `what` 区分） | 照 `templates/decomposing/decomposition.md` 的「## 任务表」补行（第一列表头「计划 key」与 `tasks[].key` 一致），或从 `tasks[]` 删掉不打算做的卡；文档读取抛错时本门**不判**（不把 IO 故障伪装成"缺任务表"） |
| `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED` | `normalizePlanTasks`：某张卡 `skipIntegration === true` 而 `skip_integration_reason` / `skipIntegrationReason` 为空 | **硬拒**（带 `code` 的抛错，在归一阶段即炸） | 给该卡补一句「为什么没有接口面、靠什么判断」（例：「纯文档卡，无运行时接口」「本卡只加内部函数，没有调用方」「只改 CI 脚本，不进 HTTP 边界」） |

**码的容器与消费方式**：表中**前三条**硬码是 `GateFailure['code']` 联合的成员
（`src/application/internal/artifact-gates.ts`：`requirement_sides_invalid` 在 `:151`、
`requirement_section_missing` 在 `:153`、`plan_doc_task_table_incomplete` 在 `:162`），
失败信封、传输码映射、HTTP 状态表都以 `GateFailure['code']` 为**唯一键控点**；
最后一条是**抛错**形态（与 `resolvePlanStages` 的 `REQBOARD_TEMPLATE_CONFLICT` 同款），
因为调用方要能把"缺理由"与"格式错"分开处置。

## 六、探针 CLI 契约（`scripts/design-coord-probe.mts`） <!-- serves: FR-2 -->

### 子命令与参数面 <!-- serves: FR-2 -->

| 参数 | 语义 | 缺省 |
|---|---|---|
| `--req <REQ-xxxxxx>` | 扫该需求 `design/*.md` 的路径坐标，并与 `tasks/*.md` 汇报的源码类落点对账 | 无（不给就 exit 2） |
| `--root <dir>` | 覆盖工作区根（给标本 / 单测指向合成树） | `process.cwd()` |
| `--symbols <path>` | 符号词表路径（相对 `root` 解析，绝对路径原样用） | 相对 `root` 的默认词表 |
| `--json` | stdout 只出可 `JSON.parse` 的结构 | 人读输出 |
| `--specimen` | 跑内置 5 个反例（判据必须真的会红） | 关 |
| `--help` / `-h` | 打用法 | 关 |

**只认这六个开关**：未知参数 → exit 2 并打用法（**不静默忽略**）。

### 退出码三态 <!-- serves: FR-2 -->

| 码 | 含义 | 读法纪律 |
|---|---|---|
| `0` | 判据全过（`gaps.length === 0`） | **不等于**"没发现问题"——软观测（符号轨 / 花括号目录前缀）不影响退出码，要读 `observations` |
| `1` | 有缺口（`path` 或 `writeback` 任一非空），逐条点名 | 存量需求照实报，**不改存量文档**（这是判据在工作，不是待修清单） |
| `2` | **不可用**（用法或环境），不是"判绿" | 五类：需求号形态非法 / 需求目录不存在 / 设计目录缺失 / 设计目录无 `*.md` / 符号词表缺失。与"缺口 0"严格区分 |

### `--json` 的键 <!-- serves: FR-2 -->

| 模式 | 键 |
|---|---|
| `--req … --json`（成功） | `script`、`mode: 'scan'`、`ok`、`exitCode`、`root`、`req`、`criterion.pathReachable{ok,objects,gaps}`、`criterion.writeback{ok,objects,gaps}`、`excludedTestPaths`、`scanned{designDocs,taskDocs,pathTokens,filesChanged,symbolCandidates}`、`counts{exists,whitelist,observations}`、`gaps[]`、`observations[]` |
| `--specimen --json` | `script`、`mode: 'specimen'`、`ok`、`exitCode`、`syntheticRoot`、`cases[]{name,ok,detail}` |
| 不可用（`fail`） | `script`、`mode: 'scan'`、`ok: false`、`exitCode: 2`、`root`、`error`（人读原因） |

**`excludedTestPaths` 为什么必须单列**：回写判据只覆盖**源码类**落点（`src/`、`scripts/`、`packages/`、`lib/`），
被排除的非源码类落点条数在这里如实登记——否则"我悄悄少判了"就成了看不见的事。
`gaps[]` 元素形如 `{ kind: 'path' | 'writeback', token, at, reason, fix }`
（path 缺口的 reason = 「既不在磁盘上，也不在已知书写法白名单里（坐标已与仓库布局脱钩）」，
fix 指向真实路径或白名单登记；writeback 缺口的 reason = 「实现期落点未回写设计」，
fix 指向 `design/architecture.md` 的「模块改动地图」）；
`observations[]` 元素形如 `{ kind: 'symbol' | 'brace-dir', token, at, reason }`。

### 白名单的语义分类（9 条）<!-- serves: FR-2 -->

**不逐条抄正则，按"为什么这类写法不算失效"分四类**（准入条件：每条必须写清可审计理由；
为了过检查而加白是被禁止的——既不在盘上又说不清为什么该存在的 token，就是缺口）：

| 语义类 | 包含的写法 | 为什么这类写法不算失效 |
|---|---|---|
| ① 占位与待生成（3 条 + 1 条占位段） | 需求目录占位 / 通配（`docs/requirements/<REQ>/…`、`docs/requirements/*/…`）；原型权威清单 `prototypes/INDEX.md`；需求相对的原型页（含 `#FR-N` 页内锚点）；带占位段的写法（`tests/<文件>.test.ts`） | 这些名字**由需求自己在后续阶段生成**（INDEX 在需求阶段产出、原型页在设计登记前产出），静态必然不存在；`#FR-N` 是页内锚点不是路径本体。这不是"指针指歪"，而是"还没写"——**写实号的需求号不在此列**，仍走磁盘可达判据 |
| ② 需求目录相对口径（1 条） | `design/`、`tasks/`、`notes/`、`prototypes/`、`prototype/` 开头的引用 | 设计文档按**需求目录相对**口径引用自己的兄弟产物（决议 #2）；权威落点都在 `docs/requirements/<REQ>/` 下——所以"仓库根下没有 `prototypes/`"不是坐标失效 |
| ③ 量词写法（3 条） | `*` 通配；`{a,b}` 花括号并列简写；`...` 省略中间目录 | 它们**指代一组文件或一串被省略的目录**，不是单个路径，展开后的具体集合静态无法判定；价值在模式本身。花括号的目录前缀另有**软观测**（前缀不在盘上时提示），通配与省略不另判 |
| ④ 裸根名枚举（1 条，2026-10-06 本需求 dogfood 补） | 光秃秃一个根 + `/`：`src/`、`packages/`、`tests/` … | 枚举句「四个源码根：`src/`、`scripts/`、`packages/`、`lib/`」里的词是**根名不是坐标**（本仓没有 `packages/` 目录，但写它是陈述口径）。收紧边界：只有"根 + `/` 后什么都没有"才命中，带具体文件名的写法照旧走磁盘判据。实测来源：本需求 `interfaces.md` 先写了 `packages/` 被误判，才补的这条 |

**顺序即优先级**：具体规则必须排在通用规则之前（例如占位形态先于通配，否则 `<REQ>` 会被 `*` 类吃掉）。

### 反例标本（`--specimen`，5 例）<!-- serves: FR-2 -->

| # | 反例 | 期望 |
|---|---|---|
| ① | 设计文档点名一个**不存在的源码路径**（名字由标本在临时树里注入；正文不写该字面量——写了就成"文档里躺着一个假坐标"，正是本探针要抓的形态） | exit 1 且点名该路径 |
| ② | 源码类落点未回写模块改动地图 | exit 1 且点名（测试落点不红但登记条数） |
| ③ | 全绿标本（路径存在 + 源码类落点已回写） | exit 0、`gaps` 空、`excludedTestPaths` = 1 |
| ④ | 词表外标识符 | exit 0（只进观测，不改退出码） |
| ⑤ | 花括号简写的目录前缀不在盘上 | exit 0（软观测提示） |

## 七、对外可观察行为：硬拒 vs 软提示 <!-- serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| 可观察行为 | 档 | 调用方重试策略 |
|---|---|---|
| `sides` 缺失 / 非法 → 抛错，无产物登记 | 硬 | 改 front-matter 后**重试**；同一份输入重试必然再拒 |
| 缺「失败与并发路径」节 → 抛错 | 硬 | 补节（或写「不适用：<理由>」保留节）后重试 |
| 卡上无 `requirement_refs` → 抛错，逐条点名缺哪几条 FR | 硬 | 在 `tasks[]` 补 refs 后重试；**只改文档覆盖表无效** |
| 计划文档无任务表 / 覆盖不全 → 抛错 | 硬 | 补文档任务表（或从 `tasks[]` 删卡）后重试 |
| `skipIntegration: true` 缺理由 → 抛错 | 硬 | 补理由后重试 |
| 探针 exit 1 | 硬（探针语境） | 改真实路径或回写模块改动地图；**存量缺口不要求当场修** |
| 探针 exit 2 | 不可用 | **不要**当成绿：先修环境（需求号 / 目录 / 词表），再重跑 |
| `clause_criteria_warnings` 非空 | 软 | 可直接继续；改不改由人定（判据质量人才能定，硬拦会换来"写废话糊门禁"） |
| `dependency_warnings` 非空 | 软 | 可直接继续；复核那条边是真时序约束（补 `dep_reasons`）还是伪依赖（删依赖） |
| `plan_doc_warnings` 非空 | 软 | 可直接继续；缺列是**披露**问题，硬拒会把"先批后补文档"这条正常路径整条堵死 |
| 看板出现「子卡链未生成 N 张」 | 软（投影读数） | 不改任何写路径；人工判断是否补展开子卡 |

**刻意不做的事（避免调用方误判"漏做"）**：不做存量追溯（`createdAt` 早于规则起点一律不判）、
不把条款判据做成硬门、不给设计文档做逐字实现比对、不新增 `package.json` script 给设计坐标探针
（它按需 `--req` 跑，登记在 `operations.ts` 的 `EXCLUDED`）。
