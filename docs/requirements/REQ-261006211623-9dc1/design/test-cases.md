# 测试用例设计（REQ-261006211623-9dc1）· 需求 / 设计 / 拆分三面判据门禁 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> **这份文件是什么**：本次改动的**测试契约**——每条判据都配一条反向演练（删掉 / 改坏必须红），
> 并把「用什么层级测、跑什么命令、看到什么算过、读数从哪来」写成可复跑的清单。
> **判据不在这里发明**：每条 TC 的命令与断言出处都指到 `文件:行` 或一条真实命令；口径见
> `design/interfaces.md`（函数契约）与 `design/architecture.md:78-113`（模块地图）。
> 本文**不含任务批次与依赖顺序**（那属拆分阶段产物，不进设计文档）。

## 一、判据来源与读法 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| 面 | 判据（唯一实现） | 强度 | 反向演练载体 |
|---|---|---|---|
| 需求面 · 条款判据 | `src/application/internal/clause-criteria.ts:88`（`clauseCriteriaGaps`）→ 回执键 `clause_criteria_warnings` | 软（只提示不拦） | `tests/clause-criteria.test.ts` |
| 需求面 · `sides` | `src/application/internal/category-doc-sets.ts:152`（`sidesDeclarationGap`）+ `src/application/internal/content-gate-wiring.ts:492`（`sidesGateFailure`） | 硬（提交即拒） | `tests/sides-declaration.test.ts` |
| 需求面 · 必填节 | `src/application/internal/content-gate-wiring.ts:529`（`docSectionGateFailure`），按 `src/domain/workflow/DocQualityRules.ts:20` 的规则起点生效 | 硬（**只对新需求**） | `tests/doc-quality-gate.test.ts` |
| 设计面 · 坐标 | `scripts/design-coord-probe.mts`（路径可达 + 源码类落点回写） | 硬（探针 `exit 1`） | `--specimen` 5/5 + `scripts/reverse-drill-matrix.mts` 的 hard 组 |
| 拆分面 · 引用 | `src/application/internal/content-gate-wiring.ts:163`（`assertClauseCoverageGate`）只认卡上 `requirement_refs` | 硬（提交即拒） | `tests/clause-coverage-gate.test.ts` |
| 拆分面 · 任务表 | `src/application/internal/plan-doc-table.ts:38-63`（读表 + 两条硬判 + 一条软判） | 硬 2 + 软 1 | `tests/plan-doc-table.test.ts` |
| 拆分面 · 依赖与联调理由 | `src/application/internal/plan-deps-check.ts:82`（`zeroOverlapDependencyWarnings`）、`src/shared/protocol.ts:1155-1157`（跳联调理由必填） | 软 1 + 硬 1 | `tests/plan-depends-e2e.test.ts`、`tests/plan-footprint-tool-schema.test.ts` |
| 看板面 · 缺链红标 | `src/client/dag/progress-bar.ts:200` 与 `src/application/query/QueryDag.ts:67`（两份逐字同源） | 读数（不阻断，UI 契约见 `design/frontend.md`） | `tests/card-layer.test.ts`、`tests/query-report.test.ts`、`tests/dag-panel.test.ts` |

**读数纪律（三条，跑之前先读）**：

- **「读数不可得」不等于「没做」**：探针 `exit 2`、文档自检的 `unknown`、门禁对存量记录的早退
  都是「不判」，不是「判红」（`scripts/design-coord-probe.mts:565-574`、`scripts/req-doc-validate.mts:129`）。
- **软判只出键、不阻断**：`clause_criteria_warnings` / `dependency_warnings` / `plan_doc_warnings`
  一律「非空才出键」（`src/tools/SubmitTool/SubmitTool.ts:224-256`）——**空键与键缺失是同一件事**，
  调用方只有一种判空写法。
- **拒绝即零副作用**：所有硬拒都发生在 `mutate` 之前（`src/application/use-cases/SubmitArtifact.ts` 的需求面 `:120-136`、
  计划面 `:349-399`），断言里必须带「台账零改动」。

## 二、测试策略（层级 / 范围 / 载体 / 判据） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| 层级 | 范围 | 载体 | 判据 |
|---|---|---|---|
| 单元（unit） | 判据纯函数：条款判据扫描窗口、`sides` 值域、任务表读取与两条硬判、零交集依赖边、`chainMissing` 两份同源实现 | `tests/clause-criteria.test.ts`、`tests/sides-declaration.test.ts`、`tests/plan-doc-table.test.ts`、`tests/plan-footprint.test.ts`、`tests/card-layer.test.ts` | `npx vitest run <文件>` 全绿；**反向用例必须红**（点名到条款编号 / 坐标 / 卡的 key），否则判据空转 |
| 集成（integration） | 提交编排与门禁接线：需求提交三件事（`sides` 硬门 → 节硬门 → 条款软提示）、计划提交三件事（覆盖门 → 任务表硬软判 → 依赖与联调理由） | `tests/doc-quality-gate.test.ts`、`tests/clause-coverage-gate.test.ts`、`tests/plan-depends-e2e.test.ts`、`tests/plan-footprint-tool-schema.test.ts`、`tests/reqboard/plan-landing-parity.test.ts` | 拒绝码逐字对（`requirement_sides_invalid` / `requirement_section_missing` / `requirement_uncovered` / `plan_doc_task_table_incomplete` / `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`）；硬拒时台账零改动；软提示键「非空才出」 |
| **端到端（E2E）** | **反向演练矩阵**：把判据的一处实现真改坏 → 判据必须真红 → 再逐字节还原（sha256 复核） | `npx tsx scripts/reverse-drill-matrix.mts --group hard`（hard 组清单见 `scripts/reverse-drill-matrix.mts:283-378`） | **`exit 0` 且 `8/8`**；任一条演练不再变红 = 判据空转，整条红；还原后工作树逐字节一致（sha256） |
| 探针 / 标本（probe） | 设计坐标探针自身「判据不空转」+ 存量需求的只读扫描 | `npx tsx scripts/design-coord-probe.mts --specimen`、`npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a` | `--specimen` → `exit 0`、5/5 标本按预期；存量 `--req` → `exit 1` 且逐条点名坐标；三态退出码 `0 绿 / 1 有缺口 / 2 不可用` 不许混（`scripts/design-coord-probe.mts:78`） |
| 文档自检（doc self-check） | 一条命令跑完 9 项文档判据 + 模板双向一致 + 提示词产物零漂移 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1`、`pnpm templates:check`、`pnpm prompts:verify` | 9 项判据跑全（`scripts/req-doc-validate.mts:100`）；模板 `OK 25` 且需求模板 6 类双向漂移 0；`[check-prompt-fragments] OK` |

> **判据 ⑦「E2E 覆盖」的读数位置（写清楚，防误读）**：`e2eCoverageOf`
> （`src/application/internal/content-gate-wiring.ts:625`）读的是 **`requirement.md`** 里的「层级」表，
> 不是本文件。本文件的层级表回答的是「测试策略本身写没写全」；**需求文档里没有该表时读数为
> `unknown`（不判、不假红）**。若要让判据 ⑦ 真判，需求文档也要有同形「层级」表并含 E2E 行——
> 这条是本次交付之外的口径，见第六节。

## 三、用例总表（TC-1 … TC-18） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| TC 编号 | 覆盖 FR | 前置 | 步骤（可跑命令） | 期望（退出码或断言） | 载体文件 |
|---|---|---|---|---|---|
| TC-1 | FR-1 | `src/application/internal/clause-criteria.ts` 在位；合成文档内有一条含判据锚点的条款 | **反向演练①**：`npx vitest run tests/clause-criteria.test.ts`，看用例「删掉锚点 → 点名该条款，且提示里给出修复锚点」 | 基线无缺口；把某条 FR 的判据删成一句形容词后，`clauseCriteriaGaps` **点名该 FR**、`clauseCriteriaHints` 给出修复锚点；`Test Files 1 passed`、`exit 0` | `tests/clause-criteria.test.ts:36`、`src/application/internal/clause-criteria.ts:88`、`:122` |
| TC-2 | FR-2 | 临时目录可写（标本走 `mkdtempSync` 临时树） | **反向演练②**：`npx tsx scripts/design-coord-probe.mts --specimen` | 整体 `exit 0`、5/5 标本按预期；其中标本①「设计文档点名一个盘上不存在的 `src/` 坐标」**内部** `exitCode === 1` 且点名该坐标（该合成坐标在本行写成省略中间目录的形态 `src/.../x.ts`——字面量见 `runSpecimen`，这样写是为了不让本条引用自己造出一条缺口） | `scripts/design-coord-probe.mts:842-844`、`:723-724`；`tests/design-coord-probe.test.ts:321` |
| TC-3 | FR-3 | 提交编排可驱动（`SubmitArtifact` 依赖已装配） | **反向演练③**：`npx vitest run tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts`，看 e2e 用例「缺 sides → 拒」与「`sides: [doc]` → 拒」 | 拒，错误码 **`requirement_sides_invalid`**；拒绝文案点名非法值与合法值域；台账零改动 | `tests/sides-declaration.test.ts:29`、`tests/doc-quality-gate.test.ts:106`、`src/application/internal/content-gate-wiring.ts:501` |
| TC-4 | FR-1 | 同 TC-1 | `npx vitest run tests/clause-criteria.test.ts`，看用例「长条款块不假红：判据落在定义行很远的下方」 | 判据落在 `CLAUSE_CRITERIA_WINDOW = 40`（`src/application/internal/clause-criteria.ts:44`）以内仍算本条款 → **无缺口**；该用例红即说明窗口被改小（假红回归） | `tests/clause-criteria.test.ts:102` |
| TC-5 | FR-3、FR-4 | 一份 `createdAt` 早于规则起点的存量需求记录 | `npx vitest run tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts`，看两条「存量不追溯」用例 | 存量需求同样缺 `sides` / 缺节 → **放行**（提交成功）；`docQualityRulesApply(createdAt)` 为 false（`src/domain/workflow/DocQualityRules.ts:28`） | `tests/sides-declaration.test.ts:69`、`tests/doc-quality-gate.test.ts:120` |
| TC-6 | FR-4 | 新需求（`createdAt` 晚于规则起点）的 feature / refactor 文档 | `npx vitest run tests/doc-quality-gate.test.ts`，看用例「feature / refactor 缺节 → `requirement_section_missing`」 | 拒，错误码 **`requirement_section_missing`**；带「不适用：<理由>」的写法**放行**（保留节即可） | `tests/doc-quality-gate.test.ts:50`、`:55`、`src/application/internal/content-gate-wiring.ts:538` |
| TC-7 | FR-5 | 计划里 3 张卡都不带 `requirement_refs`；文档写了覆盖对照表覆盖 FR-1 / FR-4 / FR-7 | `npx vitest run tests/clause-coverage-gate.test.ts`，看用例「卡上无 refs、只有文档覆盖对照表 → 仍被拒」 | 返回 `code === 'requirement_uncovered'`，`gaps === ['FR-1','FR-4','FR-7']`；拒绝文案的 how **只给一条**可执行路径（在 tasks[] 写 `requirement_refs`），且写明文档表「不再是门禁依据」 | `tests/clause-coverage-gate.test.ts:144`、`:166`；`src/application/internal/content-gate-wiring.ts:181` |
| TC-8 | FR-5 | 同上，但卡上写了 `requirement_refs` | `npx vitest run tests/clause-coverage-gate.test.ts tests/reqboard/plan-landing-parity.test.ts` | 覆盖门返回 `undefined`（放行），文档表写不写都不影响；落库后卡上引用来源为 **`explicit`**，`task_coverage.covers_frs` 等于卡上 refs | `tests/clause-coverage-gate.test.ts:154`、`tests/reqboard/plan-landing-parity.test.ts:127`、`:140`、`:152` |
| TC-9 | FR-6 | 四份任务输入：`in_progress` 未声明 `stages` / `done` + `stages:["dev","review"]` / `done` 未声明 / `in_progress` + `stages: []` | `npx vitest run tests/card-layer.test.ts tests/query-report.test.ts` | 四条断言逐一对：① `in_progress` 未声明 → **标**（防腐烂回归，D-6）；② `done` + 显式 `stages` → **标**；③ `done` 未声明 → **不标**；④ `stages: []` → **不标** | `tests/card-layer.test.ts:135-158`、`tests/query-report.test.ts:893-926`、`src/client/dag/progress-bar.ts:200-207` |
| TC-10 | FR-6 | 一份含 1 张缺链卡的 DAG 载荷 | `npx vitest run tests/dag-panel.test.ts` | 汇总条输出 `data-dag-chain-missing="1"` 与文案「子卡链未生成 1 张」；无缺链卡时该格整体不渲染 | `tests/dag-panel.test.ts:129`、`src/client/views/panels/dag.ts:195`、`:211-212` |
| TC-11 | FR-7 | 计划：两张卡 `depends_on` 成边，两端 `implementation` 声明文件零交集 | `npx vitest run tests/plan-depends-e2e.test.ts` | ① 零交集且无 `dep_reasons` → `dependency_warnings` **逐边点名**（含两端文件清单与修复示例），但**不拒**；② 写了语义理由 → 不点名；③ 两端有交集 → 不点名；一端没声明路径 → 沉默（没依据不误报） | `tests/plan-depends-e2e.test.ts:146`、`:156`、`:163`、`:176`；`src/application/internal/plan-deps-check.ts:82` |
| TC-12 | FR-7 | 计划里一张卡写 `skipIntegration: true`（不带理由） | `npx vitest run tests/plan-footprint-tool-schema.test.ts` | ① 缺理由 → **拒**，码 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`；② 带理由（snake / camel 两种写法）→ 落台账；③ `dep_reasons` 写成 `"上游key=一句话"` 数组 → 归一成 map 落台账 | `tests/plan-footprint-tool-schema.test.ts:118`、`:109`、`:125`、`:132`；`src/shared/protocol.ts:1155-1157` |
| TC-13 | FR-8 | 提交计划：`tasks[]` 有 2 张卡，文档或只有 1 张卡的落点、或没有任务表 | `npx vitest run tests/plan-doc-table.test.ts` | ① 文档无任务表 → 拒 `plan_doc_task_table_incomplete` 且台账不留计划；② 表里 key 覆盖不全 → 拒并**点名漏收的 key**；③ 缺「验收」/「工作量」/「依赖」列 → `plan_doc_warnings` 非空但 `success: true`；④ 列齐全 → 该键整体省略 | `tests/plan-doc-table.test.ts:105`、`:121`、`:143`、`:150`；`src/application/internal/plan-doc-table.ts:52-76` |
| TC-14 | FR-2 | 符号词表存在（`docs/knowledge/code-map.symbols.tsv`）；**只读**，不改任何存量文档 | ① `npx tsx scripts/design-coord-probe.mts --specimen`；② `npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a` | ① `exit 0`、5/5（标本①-⑤ 逐条见 `scripts/design-coord-probe.mts:842-878`）；② 存量需求 `exit 1`，逐条点名缺口坐标（含 `docs/requirements/REQ-261005193546-1b1a/design/interfaces.md:19` 那条路径缺口与一条回写缺口）——**这是既知事实，不修（D-5）** | `scripts/design-coord-probe.mts`、`docs/reviews/doc-quality-gates-2026-10-06.md:109-113` |
| TC-15 | FR-3、FR-4 | 模板与 parity 登记表在位 | `pnpm templates:check` | `模板 25 份：OK 25 / FAIL 0；缺口 0`；`需求模板 6 类：OK 6 / FAIL 0；双向漂移 0`；`exit 0`；`templates/brainstorming/refactor.md:10` 自带合法 `sides`（`sides: []` = 明确无端侧改动） | `scripts/template-gate-probe.mts`、`scripts/doc-section-parity.mts`、`templates/brainstorming/refactor.md:10` |
| TC-16 | FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8 | 本需求 `requirement.md` 与已落盘的设计文档 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` | 9 项判据跑全（必填节 / front-matter / 格式门 / 编号链 / 追溯 / RTM 健康 / E2E 覆盖 / serves / dangling，`scripts/req-doc-validate.mts:100`）；退出码 0 = 缺口 0、1 = 有缺口、2 = 环境不可用。**实测读数**（三份设计文档落盘后立即复跑）：`缺口 0；exit 0`，判据 9 项实判 6 / 读数未知 3（追溯与 serves 因设计文档尚未登记为产物而读数未知；E2E 覆盖因 `requirement.md` 没有「层级」表而读数未知——**未知 ≠ 失败**）；「必填节」项同时确认 feature 必交集已齐（`src/application/internal/category-doc-sets.ts:245`） | `scripts/req-doc-validate.mts`、`src/application/internal/content-gate-wiring.ts:625` |
| TC-17 | FR-2、FR-6 | 干净工作树（矩阵会**真改**共用工作树上的文件） | `npx tsx scripts/reverse-drill-matrix.mts --group hard` | `exit 0` 且 **8/8**；每条演练必须真红（含 hard 组的「缺口 2 · 设计坐标」：改坏真实设计文档里的一个路径 → `exit 1` 并点名 → 逐字节还原、sha256 一致） | `scripts/reverse-drill-matrix.mts:283-378`、`:65`；`requirement.md:296` |
| TC-18 | FR-5、FR-8 | 计划已批准、装配完整 | `npx vitest run tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts` | 落库读数与门禁**同口径**：卡上引用来源可观测（`explicit` / `none`）、`task_coverage` 取自真实记录、覆盖缺口时一张卡都不落、重复批准幂等 | `tests/reqboard/plan-landing-parity.test.ts`、`tests/reqboard/board-plan-approve.test.ts:122`、`:128` |

## 四、三条反向演练（逐条口径） <!-- serves: FR-1, FR-2, FR-3 -->

三条演练的共同要求：**改坏之后必须红，而且要点名到具体对象**（条款编号 / 坐标 / 错误码）。
「红是红了但没说清哪里」不算过——那会让人靠猜修。

| 演练 | 改坏什么 | 命令 | 必须看到 | 复核证据 |
|---|---|---|---|---|
| ① 删掉条款判据锚点 | 把某条 FR 定义行块内的判据删成一句形容词 | `npx vitest run tests/clause-criteria.test.ts` | 软提示**点名该条款**（原样无缺口 → 点名该 FR），并给出修复锚点 | `docs/reviews/doc-quality-gates-2026-10-06.md:129` |
| ② 改坏设计里的路径 | 把设计文档点名的路径改成盘上不存在的一个 | `npx tsx scripts/design-coord-probe.mts --specimen` | 标本① 内部 `exit 1` 且点名该路径；整体 `--specimen` 仍 `exit 0`（标本自证判据不空转） | `docs/reviews/doc-quality-gates-2026-10-06.md:130`、`tests/design-coord-probe.test.ts:321` |
| ③ 写 `sides: [doc]` | 把 front-matter 的 `sides` 写成非法值 | `npx vitest run tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts` | 提交被拒，码 **`requirement_sides_invalid`**；台账零改动 | `docs/reviews/doc-quality-gates-2026-10-06.md:131` |

**为什么必须自己跑**：改动前 `sides` 的病灶是**静默过滤**——非法值与缺失都不报错，
`designDocPolicyFrom` 只留合法值（`src/application/internal/category-doc-sets.ts:121`），于是
`sides: [doc]` 与「没写」后果完全相同（条件必交设计文档永不触发）。反向演练是唯一能证明
「这次真的会响亮失败」的手段。

## 五、执行顺序与读数纪律 <!-- serves: FR-1, FR-2, FR-5, FR-7, FR-8 -->

1. **先跑零副作用的**：`pnpm templates:check` → `pnpm prompts:verify`（TC-15；只读校验 + 逐字节比对生成物）。
2. **再跑单测与集成**：上表 TC-1、TC-3 … TC-13、TC-18 的 `vitest` 命令（按面分组，便于把红点归到某一面）。
3. **最后跑会动工作树的**：`--specimen`（临时树，零影响）→ 反向演练矩阵（**真改真还原**）。
   矩阵自带备份、逐字节还原与 sha256 复核（`requirement.md:252-253`），但跑之前仍要先确认
   **没有别的窗口正在改同一批文件**（同工作树并发是常态，见下）。
4. **并发与基线判读**：同工作树有并发窗口在制；全量基线的差异用集合差法读
   （`vitest --reporter=json` 与 `docs/reviews/test-baseline.failures.txt` 对比），
   不把并发面的既有失败算到本次头上（`docs/reviews/doc-quality-gates-2026-10-06.md:163-170`）。
5. **存量需求的红不是缺陷**：TC-14 的第 ② 步按设计就该红——存量设计文档不追溯、不改写（D-5）。
   处置只有两条：修新文档，或按白名单口径登记理由；**不批量跑存量**（`src/domain/knowledge/operations.ts:189-192`
   把它登记为按需探针、不进提交前清单）。
6. **实施收尾实测读数（2026-10-06 22:1x，链尾卡 t5 复跑；复跑为准）**：
   `pnpm templates:check` → `exit 0`（模板 25 份 OK 25、需求模板 6 类双向一致、文档自检缺口 0）；
   `pnpm prompts:verify` → `exit 0`（逐字节一致）；
   `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` → 判据 9 项（实判 6 / 读数未知 3）、缺口 0、`exit 0`；
   `npx tsx scripts/reverse-drill-matrix.mts --group hard` → `exit 0 · 8/8 ✅`（每处还原过 sha256）；
   `npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` → 路径 token 95（存在 68 / 白名单 27）、`缺口 0`、`exit 0`；
   `npx tsx scripts/design-coord-probe.mts --specimen` → 5/5、`exit 0`；
   全量集合差：失败 69 vs 基线 68（新增 9 条**全部**落在并发窗口在制面，本需求引入 0 条）；
   `npx tsc --noEmit` → 错误 1 条（并发窗口在制文件），本需求改动文件 0 条。
   读数明细与归属见 `docs/reviews/doc-quality-gates-2026-10-06.md` §2.3。
7. **宿主生效性**：新门与新字段要**重载插件**后在会话里生效（`pnpm build` 产物已含全部新码）；
   在那之前，会话内的 `reqboard_submit` 会按旧 schema 拒收 `skip_integration_reason` / `dep_reasons`。

## 六、不在本需求范围 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

- **验收单 / 原型门 / 归档校验 / 回归测试基线一律不动**：本次只动文档门禁、模板、拆分落库校验这一片；
  改验收单与归档会与同工作树的并发窗口在制工作冲突，且它们各有自己的判据链
  （`docs/reviews/doc-quality-gates-2026-10-06.md:155-159`、`requirement.md:269-270`）。
- **不改写任何存量需求文档、不批量跑存量探针**（D-5）。
- **不把条款判据做成硬门**：判据质量人才能定，硬拦只会换来「写废话糊门禁」；机械层只判「有没有」。
- **不给设计文档做逐字实现比对**：只判「路径可达 + 源码类落点被提到」。
- **不改判据 ⑦ 的读数位置**：本次不改 `requirement.md`，故判据 ⑦ 在自检里仍是「读数未知（不判）」；
  要让它真判，得由需求文档自己带一张同形「层级」表（含 E2E 行）——**这条不在本次三份设计文档的范围里**，
  如实登记在此以免被读成「E2E 已覆盖」。
