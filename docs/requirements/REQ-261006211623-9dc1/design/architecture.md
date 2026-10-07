# 架构设计（REQ-261006211623-9dc1）<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 本文是**架构面**设计：判据落在哪一层、唯一实现在哪个文件的哪个函数、改动波及谁。
> 实现细节与判据口径以源码为准，本文每条结论都指到 `文件:行` 或一条可跑命令。
> 本文**不含任务批次**：批次划分与依赖顺序属于拆分阶段产物，不进设计文档。

## 架构总览：四条判据分别落在哪一层 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

本需求不改业务数据模型，只在三个提交节点（需求 / 设计 / 拆分）与其下游读数上补齐**判据**。
判据按"能不能机械判定"分两档：**静默失效的硬拦**（`sides` 缺声明、缺必填节、卡上无引用、
文档任务表与提交的卡对不上、跳联调无理由），**判据质量人才能定的软提示**（条款判据有没有、
依赖边理由该不该给、文档缺列）。

```
                    ┌──────────────────────────────────────────────────────┐
 domain（纯函数/常量）│ workflow/EvidenceAnchor.ts   判据锚点词汇表（唯一）    │
                    │ workflow/DocQualityRules.ts  规则起点（存量豁免单点）  │
                    └───────────────────────┬──────────────────────────────┘
                                            │ import（只向内，不反向）
                    ┌───────────────────────▼──────────────────────────────┐
 application（判据与  │ internal/clause-criteria.ts   条款判据缺口（软）       │
 编排、零 I/O）      │ internal/plan-doc-table.ts    文档任务表读取（硬2 软1） │
                    │ internal/plan-deps-check.ts   依赖边点名（软）        │
                    │ internal/plan-refs.ts         落库取数单点（三来源）   │
                    │ internal/content-gate-wiring.ts sides门/节门/覆盖门   │
                    │ use-cases/SubmitArtifact.ts   编排 + 出参键           │
                    │ query/QueryDag.ts             chainMissingOf（服务端） │
                    └───────────────────────┬──────────────────────────────┘
                                            │ 同一份判据，两处部署（禁止跨层 import）
                    ┌───────────────────────▼──────────────────────────────┐
 client（看板渲染）  │ dag/progress-bar.ts           chainMissing（逐字同源）  │
                    └──────────────────────────────────────────────────────┘

 旁路（按需，不进提交链）：scripts/design-coord-probe.mts ── 读 design/*.md + tasks/*.md
                                                            退出码 0 绿 / 1 有缺口 / 2 不可用

 四处同源（改一处必须同改，`docs/reviews/doc-quality-gates-2026-10-06.md` §3）：
   category-doc-sets.ts  ⇄  templates/**  ⇄  scripts/{template-gate-probe,doc-section-parity}.mts
                         ⇄  src/domain/prompt/fragments/** + generated/fragments.ts
```

三条结构性选择，各有一句理由：

- **词汇表进 domain**：`EvidenceAnchor.ts` 是纯正则、零 I/O，被 domain 侧条款判据与 application 侧
  结单证据同时需要；放 application 会让 domain 反向依赖（`tests/layer-boundary.test.ts` 会红）。
- **探针进 scripts 而不是 application**：它要读工作区磁盘（`design/*.md`、`tasks/*.md`），
  按需跑、存量不追溯（`src/domain/knowledge/operations.ts:189-192` 登记进 `EXCLUDED`）。
- **看板红标两处同源而非共享一份**：application 禁止 import client，症状是"看板标了、详情页没标"
  （`src/application/query/QueryDag.ts:62-65` 写明了这条约束与代价）。

## 判据单点地图 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

本需求的核心命题是"**同一约束只能有一处判据**"。下表逐条给出唯一实现、强度、触发时点与反向演练载体；
任何一行出现"第二处实现"，就是本次要堵的静默缺口。

| 判据 | 唯一实现（文件:函数） | 强度 | 触发时点 | 反向演练载体 |
|---|---|---|---|---|
| 判据锚点词汇表 | `src/domain/workflow/EvidenceAnchor.ts:42` `CLAUSE_CRITERIA_ANCHOR`（= `EVIDENCE_ANCHOR:23` ∪ `CLAUSE_VALUE_ANCHOR:36`） | 词法本身无强度（强度由消费方定：条款侧软） | 被条款判据与结单证据各自 import | `tests/clause-criteria.test.ts`（组合词法）、`tests/evidence-anchor.test.ts`（`EVIDENCE_ANCHOR` 本尊 + 结单证据锚定） |
| 条款判据缺口（扫描 + 文案） | `src/application/internal/clause-criteria.ts:88` `clauseCriteriaGaps` / `:122` `clauseCriteriaHints`（窗口常量 `:44`） | **软**（只进回执，不拒） | `submit(kind=requirement)` | `tests/clause-criteria.test.ts`（含"删掉锚点必须报警"） |
| 端侧声明合法性 | `src/application/internal/category-doc-sets.ts:152` `sidesDeclarationGap`（值域 `VALID_SIDES:87`、解析 `frontmatterList:100` 同源） | **硬**（拒，码 `requirement_sides_invalid`） | `submit(kind=requirement)`，执行点 `content-gate-wiring.ts:492` `sidesGateFailure` | `tests/sides-declaration.test.ts`；真提交编排在 `tests/doc-quality-gate.test.ts` |
| 存量豁免（两条硬门共用） | `src/domain/workflow/DocQualityRules.ts:28` `docQualityRulesApply`（起点常量 `:20`） | 硬（对适用需求） | 上面两条门内各调一次 | `tests/doc-quality-gate.test.ts` 的"存量放行"用例 |
| 「失败与并发路径」必填节 | `src/application/internal/content-gate-wiring.ts:529` `docSectionGateFailure`（节名常量 `:513` `FAILURE_CONCURRENCY_SECTION`） | **硬**（拒，码 `requirement_section_missing`） | `submit(kind=requirement)`；仅 feature / refactor 且新需求 | `tests/doc-quality-gate.test.ts`（删节拒 / 存量放行） |
| 设计路径可达 | `scripts/design-coord-probe.mts:391` `classifyPaths` + `:147` `WHITELIST` | **硬**（探针 exit 1） | 按需 `--req <REQ>`（不进提交前清单） | `--specimen` 5 例（`:723` `runSpecimen`）+ `scripts/reverse-drill-matrix.mts` 的 hard 组末条 |
| 实施落点回写 | `scripts/design-coord-probe.mts:462` `checkWriteback`（只判源码类，`:261` `SOURCE_LANDING_PREFIXES`） | **硬**（探针 exit 1） | 同上 | 同上（`--specimen` 第 2 例） |
| 词表外符号 | `scripts/design-coord-probe.mts:507` `extractCodeSymbols` + `:520` `loadSymbolSet` | **软**（observation，不影响退出码） | 同上 | `--specimen` 第 4 例锁 exit 0 |
| 条款覆盖（落库事实） | `src/application/internal/content-gate-wiring.ts:163` `assertClauseCoverageGate`，covered 唯一来源 `:181` | **硬**（拒，码 `requirement_uncovered`） | `submit(kind=plan)` / Decompose / 落库前 | `tests/clause-coverage-gate.test.ts`（只补文档表 → 必拒） |
| 落库 refs 取数 | `src/application/internal/plan-refs.ts:55` `refsForLanding`（文档兜底 `:80-87`） | 取数（非门禁）；文档通道标注为存量/回填 | 落库（两条入口共用） | `tests/reqboard/plan-landing-parity.test.ts` |
| 子卡链缺失（服务端读数） | `src/application/query/QueryDag.ts:67` `chainMissingOf`，出参 `:98` | **硬**（读数标红，不拒任何提交） | DAG 查询（看板 / 详情页） | `tests/card-layer.test.ts`、`tests/query-report.test.ts` |
| 子卡链缺失（看板渲染） | `src/client/dag/progress-bar.ts:200` `chainMissing`（与上一行逐字同源） | **硬**（同上） | 看板渲染 | `tests/dag-panel.test.ts` |
| 零交集依赖边 | `src/application/internal/plan-deps-check.ts:82` `zeroOverlapDependencyWarnings` | **软**（进 `dependency_warnings`，不拒） | `submit(kind=plan)` | `tests/plan-depends-e2e.test.ts` |
| 跳联调必须给理由 | `src/shared/protocol.ts:1149-1159`（`normalizePlanTasks` 内） | **硬**（抛，码 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`） | 计划任务解析（两条入口共用） | `tests/plan-depends-e2e.test.ts`、`tests/plan-footprint-tool-schema.test.ts` |
| 计划文档任务表 | 表头词法 `src/application/internal/plan-doc-table.ts:23` `TASK_TABLE_HEADER`；读取 `:38`；硬判 `:52`/`:57`；软判 `:63` | **硬 2 + 软 1**（硬码 `plan_doc_task_table_incomplete`） | `submit(kind=plan)` 且 `tasks.length > 0` | `tests/plan-doc-table.test.ts` |

**为什么"唯一实现"是硬约束**：`docs/reviews/doc-quality-gates-2026-10-06.md` §1.4 第 1 条记的病灶是
门禁读 A、下游读 B，于是"门禁绿、卡上全空"（实测落库率 28%）。判据本身就是"谁说了算"的问题——
两处实现不是冗余，是**两份真相**。

## 模块改动地图 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

本节即 FR-2 探针硬判据 2 的回写落点：`scripts/design-coord-probe.mts:462` 会把该需求
`tasks/*.md` 汇报的**源码类**落点（四个源码根：`src`、`scripts`、`packages`、`lib`，常量
`:261` `SOURCE_LANDING_PREFIXES`）拿来与本表比对，
未出现在 `design/*.md` 里即点名"未回写模块改动地图"。故下表必须覆盖本次全部源码类改动。

| 模块 / 文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/domain/workflow/EvidenceAnchor.ts` | 新增 | 判据锚点词汇表：`EVIDENCE_ANCHOR:23`、`CLAUSE_VALUE_ANCHOR:36`、组合 `CLAUSE_CRITERIA_ANCHOR:42` | FR-1 | 结单证据与条款判据吃同一份词法；`content-gate-wiring.ts:65` 改为从这里 import 并再导出，既有调用方 import 路径不变 |
| `src/domain/workflow/DocQualityRules.ts` | 新增 | `DOC_QUALITY_RULES_SINCE:20`（2026-10-06T12:00:00Z）+ `docQualityRulesApply:28` | FR-3、FR-4 | 两条硬门的存量豁免单点；`createdAt` 不可得判 false（不判） |
| `src/application/internal/clause-criteria.ts` | 新增 | `CLAUSE_CRITERIA_WINDOW:44`、`clauseCriteriaGaps:88`、`clauseCriteriaHints:122`；定义行口径复用 `DEF_LINE_RE`（`doc-parse.ts`） | FR-1 | 需求提交回执；`SubmitArtifact.ts:136` 调用、`:226` 出键 |
| `src/application/internal/plan-doc-table.ts` | 新增 | `TASK_TABLE_HEADER:23`、`readPlanDocTaskTable:38`、`planDocTaskTableMissing:52`、`planDocUncoveredKeys:57`、`planDocColumnWarnings:63` | FR-8 | 计划提交硬判 2 + 软判 1；表头词法与 `scripts/template-gate-probe.mts` 的 decomposition 分支同口径 |
| `scripts/design-coord-probe.mts` | 新增 | 硬 1 路径可达（`classifyPaths:382`）、硬 2 落点回写（`checkWriteback:453`）、软符号轨（`:498`/`:520`）；`WHITELIST:147` 每条写理由；`--req/--root/--json/--specimen/--symbols` 与退出码 0/1/2（`:68-69`、`:642`） | FR-2 | 按需探针；`--specimen` 走 `mkdtempSync` 临时树（`:723-724`），工作区零改动；登记 `operations.ts:189-192` 的 `EXCLUDED` |
| `src/application/internal/content-gate-wiring.ts` | 修改 | 新增 `sidesGateFailure:492`、`FAILURE_CONCURRENCY_SECTION:513`、`docSectionGateFailure:529`；`assertClauseCoverageGate:163` 的 covered 收敛为 `:181` 一行；不再自带锚点词法（改从 domain 导入） | FR-1、FR-3、FR-4、FR-5 | 三条入口（`SubmitArtifact.ts`、`Decompose.ts`、`approved-plan-landing.ts`）共用同一判定单点 |
| `src/application/internal/category-doc-sets.ts` | 修改 | 新增 `sidesDeclarationGap:152`；`VALID_SIDES:87` 与 `frontmatterList:100` 仍是值域/解析的唯一源 | FR-3 | `designDocPolicyFrom:120` 保持"只留合法值"的原行为（病灶对照面，不动它以免外溢端侧语义） |
| `src/application/internal/artifact-gates.ts` | 修改 | `GateFailure['code']` 联合补三码：`requirement_sides_invalid:151`、`requirement_section_missing:153`、`plan_doc_task_table_incomplete:162` | FR-3、FR-4、FR-8 | 该联合是传输码映射 / HTTP 状态表的唯一键控点；只加联合成员，不新增门禁函数、签名不变 |
| `src/application/use-cases/SubmitArtifact.ts` | 修改 | 需求面接线 `:120`（sides 门）→ `:127`（节门）→ `:136`（软提示）→ `:226`（出参键）；计划面 `:349`（覆盖门）、`:371-399`（任务表硬/软判）、`:489`（零交集警告）、`:505`（`plan_doc_warnings` 出键） | FR-1、FR-3、FR-4、FR-5、FR-7、FR-8 | 全部拒绝都在 `mutate` 之前（拒绝即零副作用）；`tasks.length === 0` 时任务表门不判 |
| `src/tools/SubmitTool/SubmitTool.ts` | 修改 | output.schema 增 `clause_criteria_warnings:228`、`plan_doc_warnings:252`；input schema 增 `skipIntegrationReason:89`、`dep_reasons:90`（字符串数组） | FR-1、FR-7、FR-8 | 两处 schema 都是 `additionalProperties:false`：算出来没声明 = 调用方只看到一条 invalid output |
| `src/tools/SubmitTool/prompt.ts` | 修改 | description 里加"本次提交的文档硬性要求"三条（`sides` / 必填节 / 条款判据） | FR-1、FR-3、FR-4 | 轻量档提示词字符预算已满（复核 §3），故新规则的"调用即见"位置放在工具 description |
| `src/shared/protocol.ts` | 修改 | `normalizePlanTasks:1107` 内：跳联调缺理由抛 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`（`:1149-1159`）；`depReasonsOf:1078` 归一三种入参形态；`dep_reasons` 白名单搬运（`:1163-1165`、`:1198`）；`PlanTask.dep_reasons` 字段声明 `:736` | FR-7 | 两条入口（submit 与 decompose）共用这一份解析；理由不落 `TaskRecord`（随 `PlanRecord.tasks` 可查） |
| `src/application/internal/plan-refs.ts` | 修改 | `refsForLanding:55` 的文档通道 `:80-87` 如实标注为**存量 / 回填**；`RefSource:22` 三值让"这条引用从哪来"可观测 | FR-5 | 只收敛门禁读点，不删取数函数（`planRefsMissing` 仍被 e2e 直接调用） |
| `src/application/internal/plan-deps-check.ts` | 修改 | 新增 `zeroOverlapDependencyWarnings:82`；保留反方向既有 `planDependencyWarnings:47` | FR-7 | 两条方向同进 `dependency_warnings`（不新开键：调用方只该有一个"依赖面不对劲"的读数口） |
| `src/application/query/QueryDag.ts` | 修改 | `chainMissingOf:67` 改分状态不对称；`buildDagNodes:98` 按需出 `chainMissing` | FR-6 | 服务端 DAG 读数（看板数据面 / 详情页） |
| `src/client/dag/progress-bar.ts` | 修改 | `chainMissing:200` 与上一行逐字同源；注释 `:196-198` 点名来源与漂移症状 | FR-6 | 看板卡片层渲染 |
| `templates/brainstorming/feature.md`、`templates/brainstorming/refactor.md` | 修改 | `feature.md:3` 自带 `sides: [frontend, backend]`；`refactor.md:10` 缺省 `sides: []`（显式"无端侧改动"）；两模板均含「失败与并发路径」节（`feature.md:185`、`refactor.md:50`） | FR-3、FR-4 | 照模板写即天然满足两条硬门；`pnpm templates:check` 双向锁 |
| `templates/decomposing/decomposition.md`、`templates/README.md` | 修改 | 任务表列名（含「计划 key」列）与文档纪律 | FR-8 | 与 `plan-doc-table.ts:23` 的表头词法同口径；模板探针按此渲染后喂真门禁 |
| `src/domain/prompt/fragments/brainstorming/feature.md`、`.../refactor.md`、`.../decomposing/heavy.md`、`src/domain/prompt/generated/fragments.ts` | 修改 | 必填节行补「失败与并发路径」；拆分档补文档纪律；生成物逐字节重生成 | FR-1、FR-3、FR-4、FR-5 | `pnpm prompts:verify` 逐字节核对；`generated/fragments.ts` 是生成物，手改即漂移 |
| `scripts/template-gate-probe.mts`、`scripts/doc-section-parity.mts`、`scripts/reverse-drill-matrix.mts` | 修改 | 模板探针 requirement 分支点名缺节（`:369-384`）；parity 把「失败与并发路径」登记为 optional 并在理由里指向本门（`:103`、`:136`）；矩阵 hard 组加一条"改坏设计坐标"（`:277-278`、`:364`） | FR-2、FR-4 | 机械核"模板有、门禁判"两侧可核；反向演练真改坏、真还原、sha256 复核 |
| `src/domain/knowledge/operations.ts` | 修改 | `EXCLUDED` 登记 `design-coord-probe.mts`（`:189-192`，写明不进必跑清单、不新增 script 的理由） | FR-2 | 覆盖度门 C-13 因此不把它当未登记入口；`package.json` 本次只改 description，**未新增 script** |
| `docs/knowledge/INDEX.md`、`code-map.md`、`code-map.symbols.tsv`、`conventions.md`、`design-tokens*.{md,tsv}` | 修改 | `pnpm kb:build` 重生成（新增符号进 code-map，供探针软轨比对） | FR-2 | `pnpm kb:check` K7 零漂移；K1（INDEX 超 8000 字符预算）是既有红，见末节 |

**判据不落 `TaskRecord`、也不新增配置项**：`dep_reasons` 与跳联调理由随 `PlanRecord.tasks` 可查
（`protocol.ts:1146-1165`），再搬一份只多一处会漂移的真相；`DOC_QUALITY_RULES_SINCE` 刻意是常量而非
配置——配置化会让"这条需求吃不吃新门"变成每次都要读一遍的运行时问题（`DocQualityRules.ts:9-13`）。

## 依赖方向与边界 <!-- serves: FR-1, FR-6 -->

| 边界 | 规则 | 机械检查 / 证据 |
|---|---|---|
| domain → 上层 | 禁止 import application / client / adapters / tools / http / host / shared 与 `node:` | `tests/layer-boundary.test.ts` 的 `LAYER_RULES.domain.forbidden` |
| application → client | 禁止 import client（含 `dag/progress-bar.ts`） | 同文件 `LAYER_RULES.application.forbidden` |
| 判据 → I/O | 判据函数是纯函数（`clause-criteria.ts` 零 I/O，收 `ParsedDoc`）；磁盘读一律由调用方（`DocsReader` 端口）做 | `clause-criteria.ts:26`；`plan-doc-table.ts:38` 收 `docText` 字符串 |

**两份 `chainMissing` 为什么必须手工同步**：判据本来在 `src/client/dag/progress-bar.ts:200`，
而服务端要做同一读数，唯一路径是重写一份（application 禁止 import client，
`QueryDag.ts:62-65` 写明）。代价是"漂移即两份真相"，症状为**看板标了链未生成、详情页没标**。
本次的兜底是注释互指（两处都点名对方）+ 三份测试分别覆盖四态（`tests/card-layer.test.ts`、
`tests/query-report.test.ts`、`tests/dag-panel.test.ts`）。若将来把这个判据搬进 domain 纯函数，
两处 import 同一份，才是根治——**本次不做**（越界改动会与并发窗口在制的 workspace-root 重构冲突）。

**"设计文档不写实现逐字"的边界**：探针只判"路径可达 + 源码类落点被提到"，
不判设计与实现逐字一致（那需要语义理解，硬做会制造大量假红，见 `requirement.md` §边界）。

## 失败与并发路径 <!-- serves: FR-1, FR-2, FR-5, FR-6, FR-7, FR-8 -->

**判据自身失效时的三态**（探针，`scripts/design-coord-probe.mts:66-69`）：

| 态 | 含义 | 退出码 | 判定点 |
|---|---|---|---|
| 绿 | 两条硬判据全过 | 0 | `:642` `res.gaps.length === 0 ? 0 : 1` |
| 有缺口 | 路径不可达或落点未回写，逐条点名 | 1 | 同上；`--specimen` 同样用 1 表达"反例按预期变红" |
| 不可用 | 工作区根 / 需求目录 / 词表缺失，或参数非法 | 2 | `preflight`（`:555`）+ `fail`（`:700-705`） |

**2 与 1 分开是刻意的**：处置不同（补环境 vs 改坐标）。把环境故障读成"判据绿"是本仓最忌讳的
静默放行，故 `:911` 在缺 `--req` 且无 `--specimen` 时直接 exit 2 并打用法。

**写路径半成品谁清理**（三条，各自有机械复核）：

- `--specimen` 的一切写入都在 `mkdtempSync(join(tmpdir(), ...))` 的临时树里，`finally` 整棵 `rmSync`
  （`:718-724`），工作区零字节改动。
- `reverse-drill-matrix` 改的是**真实文件**：先整份备份 + sha256，还原后复核 sha256 一致；
  检测到并发写入即中止（`:112-204`、`:275-278`），避免覆盖别的窗口在制的改动。
- 提交侧全部拒绝发生在 `mutate` 之前（`SubmitArtifact.ts:105-136`、`:305-411`），
  拒绝时台账与磁盘零副作用。

**并发与重复**：

- 同一窗口重复提交同一份需求文档 → `registerArtifact` 幂等命中（`SubmitArtifact.ts:147-149`
  预判 + `registered:false`），软提示不重复刷屏。
- 同一需求两个窗口同时提交计划 → 既有的确认门挂起票拦住后到者（返回 `REQBOARD_CONFIRM_PENDING`），
  台账零改动；本需求不新增锁。
- 判据本身**无状态**：`clauseCriteriaGaps` / `planDocColumnWarnings` / `zeroOverlapDependencyWarnings`
  都是纯函数，同一输入恒同输出；唯一的跨调用状态是 `DOC_QUALITY_RULES_SINCE` 这个常量。

**状态机轴（本需求唯一带状态轴的判据）**：`chainMissing` 对卡状态 `todo / in_progress /
integrating / testing / in_review / done / canceled` **非对称**——`in_progress` 防漏报、
`done` 防误报、`todo` 与 `canceled` 永不标。新增状态时必须回来改两份同源实现（注释已写明）。

## 兼容与回滚 <!-- serves: FR-3, FR-4, FR-5, FR-8 -->

**存量不追溯**：两条新硬门（`sides`、必填节）一律按 `RequirementRecord.createdAt` 比
`DOC_QUALITY_RULES_SINCE` 判定（`content-gate-wiring.ts:497`、`:534`），`createdAt` 不可得判"不判"。
设计坐标探针只在 `--req` 时按需跑，不批量扫存量（78 个有 `design/` 的需求实测 18 绿 / 60 红，
全是历史改名/迁移留下的坐标，未改任何存量文档）。

**加性变更清单**（全部为新增键 / 新增码 / 新增字段，不改既有语义）：

| 变更面 | 内容 | 兼容理由 |
|---|---|---|
| 新出参键 | `clause_criteria_warnings`（`src/tools/SubmitTool/SubmitTool.ts:228`）、`plan_doc_warnings`（`:252`） | 与 `readability_warnings` 同形：**非空才出键**，缺省整体省略（无损 JSON 纪律） |
| 新错误码 | `requirement_sides_invalid`、`requirement_section_missing`、`plan_doc_task_table_incomplete` | 只往 `GateFailure['code']` 联合里**加成员**（`src/application/internal/artifact-gates.ts:151/153/162`），不改既有码含义 |
| 新入参字段 | `skipIntegrationReason`、`dep_reasons`（字符串数组形态） | 未声明即可选缺省；`dep_reasons` 用数组而非 map，因为工具 schema DSL 不接受未显式声明值的 map（会让 `defineSubmitTool` 抛 `JsonSchemaError`，实测踩过） |
| 新落库字段 | `PlanTask.dep_reasons`（`src/shared/protocol.ts:736`） | 可选；不落 `TaskRecord` |
| 取数标注 | `refsForLanding` 的文档通道标注为存量/回填（`plan-refs.ts:74-79`） | 函数与行为都不删：规则生效前已批准的老计划仍靠它把引用补回落库值 |

**回滚方式（不残留半套判据）**：删掉 5 个新增文件
（`clause-criteria.ts`、`EvidenceAnchor.ts`、`DocQualityRules.ts`、`plan-doc-table.ts`、
`design-coord-probe.mts`），再还原 3 处接线——`content-gate-wiring.ts` 的 `sidesGateFailure` /
`docSectionGateFailure` / `assertClauseCoverageGate` 的 covered 行、`SubmitArtifact.ts` 的两个分支接线、
`SubmitTool.ts` 的两处 schema 键。模板 / 片段 / 知识层各自有双向门（`templates:check`、
`prompts:verify`、`kb:check`），删一侧即当场红，不存在"删了判据但模板还在教人写"的中间态。
`package.json` 本次**没有新增 script**，故回滚无需动它（`operations.ts:191` 的 `EXCLUDED` 条目随之失效，
删掉即可）。

## 未决与已知限制 <!-- serves: FR-2, FR-5, FR-8 -->

三条限制 + 一条范围边界，如实登记（都是"知道它不完美、但刻意留的"）：

1. **`plan_doc_warnings` 的缺列判据用宽匹配**（`plan-doc-table.ts:67-75`：`header.includes('验收')`、
   `/工作量|体量|footprint|S\/M\/L/i`、`includes('依赖')`）。列名有历史变体，硬匹配会误报；
   故软判 + 宽匹配 = **漏报优于误报**。已知代价：把「验收标准」列改名成「验收口径」仍算命中。
   待设计确认：是否需要在模板与探针之间引入一份列名白名单（当前只靠 `templates/decomposing/decomposition.md`
   与 `scripts/template-gate-probe.mts` 的口径一致来约束）。
2. **符号轨只作软观测**（`design-coord-probe.mts:35-39`、`:498`）：词表是导出符号级的，
   设计文档反引号里同时装着局部函数名、字段名、故意点名的作废变体与拟新增名字——
   实测同一需求 82 条词表外、真缺口 2 条，硬判会制造大量假红。它给人当线索，不是门禁。
3. **`pnpm kb:check` 的 K1（INDEX 超 8000 字符预算）是既有红**：复核材料 §5.3 记 HEAD 已 8189 > 8000
   （`docs/reviews/doc-quality-gates-2026-10-06.md:174`），并被并发窗口新增的知识条目推高。
   本次不修它与本需求无关的预算问题——**不新增 package.json script** 正是为了不把这个数字推得更高
   （`operations.ts:189-191` 写明这条理由）。
4. **不在本次范围的边界**（`requirement.md` §边界，逐条有理由）：不给设计文档做逐字实现比对、
   不把条款判据做成硬门、不追溯存量、不碰验收单 / 原型门 / 归档校验 / 回归基线。
5. **同需求其它设计文档的坐标缺口（本窗口实测快照，不是本两册的缺口）**：
   `design/` 目录由**多个窗口并发**写入（本窗口落笔时在场 4 份：`architecture.md` / `backend.md` /
   `data-model.md` / `interfaces.md`，后两份非本窗口所写）。当时跑
   `npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` 的实测读数是
   `路径 token 77（真实存在 56 / 书写法白名单 19）；缺口 路径 2 + 回写 0；exit 1`——
   **两条缺口都点名 `interfaces.md`**（一个是把源码根名当成目录路径写，而 `packages` 这个目录
   在本仓并不存在；一个是把 `--specimen` 反例里的伪造坐标原样抄进了正文）。`architecture.md` /
   `backend.md` 贡献 0 条（本两册按同一判据自查过：逐条比对，无一条缺口落在本两册行号上）。
   这两条归该文档作者修（**本次不越界改别人的文件**）；文档数还会随并发窗口增长，故这条读数是
   **快照**而不是终值。写下它正是为了让"探针红"与"本设计有问题"两件事不被混为一谈。
