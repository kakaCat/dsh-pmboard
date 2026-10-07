# 文档质量门禁加固（需求/设计/拆分三面）

> 执行窗口：session-b4188f2e · 日期：2026-10-06 · 委派来源：产物质量体检（另一窗口只读审计，
> 样本 = 最近 12 条真实需求）· 本文是**复核入口**：每条改动都挂着可复跑的命令与实测输出。
>
> ⚠️ 本需求**尚未进台账**：`reqboard_capture` / `reqboard_create` 被 `REQBOARD_DIRECT_HUMAN_REQUIRED`
> 拦住（委派底稿是自署投递、弹框作答都不算「直接人工回合」），故本次改动落在工作树、未挂 REQ。
> 请用户在本窗口发一句话后补立项（届时可把本文作为需求/设计底稿）。

## 0. 一句话

三面缺口都不是「形状不够」而是「判据缺位」：形状门禁 12/12 全绿而 7/73 条条款毫无判据、
`sides` 写错值被静默过滤、设计里点名的路径实现后失效且无人回写、拆分卡上 refs 落库率 28%。
本次把每一处都变成**可证伪的判据**，并给每条判据配一条**反向演练**（删掉/改坏必须红）。

## 1. 改了什么（四面）

| # | 缺口 | 判据（唯一实现） | 强度 | 反向演练 |
|---|---|---|---|---|
| 1 | 条款无可验收判据（7/73） | `application/internal/clause-criteria.ts` → `clause_criteria_warnings` | **软**（只提示不拦） | `tests/clause-criteria.test.ts` |
| 2 | 设计坐标实施后失效 + 落点无回写 | `scripts/design-coord-probe.mts`（路径可达 + 源码类落点回写） | 硬（探针 exit 1） | `--specimen` 5/5 + `reverse-drill-matrix --group hard` |
| 3 | `sides` 缺/非法被静默过滤 | `sidesDeclarationGap` + `sidesGateFailure` | 硬（提交即拒） | `tests/sides-declaration.test.ts` |
| 3b | 只在顺利路径上写需求（并发仅 5/12 份提及） | `docSectionGateFailure`（「失败与并发路径」节） | 硬（**只对新需求**） | `tests/doc-quality-gate.test.ts` |
| 4 | 拆分面四条（见 §1.4） | `assertClauseCoverageGate` / `chainMissing` / `zeroOverlapDependencyWarnings` / `normalizePlanTasks` / `plan-doc-table.ts` | 硬 3 + 软 2 | 见 §1.4 |

### 1.1 条款级判据软门禁

- **扫描口径**：从条款定义行向下扫到「下一条款定义行」或「层级不深于本条款的标题」为止
  （上限 `CLAUSE_CRITERIA_WINDOW = 40`，只是兜底；真正的边界是文档结构）。定义行口径**逐字复用** `DEF_LINE_RE`
  （含标题写法 `### FR-1：`：门禁侧本来就是给标题文本前置 `**` 再匹配，本次照抄那一步，
  否则同一份文档「编号门禁认得、判据门禁看不见」）。
- **锚点词汇表**：从 `content-gate-wiring` **上移到** `domain/workflow/EvidenceAnchor.ts`——
  结单证据（`evidenceAnchorGap`）与条款判据是同一件事的两种粒度，各写一份必然分叉。
  附加形态只收「明确取值 / 可读数」（退出码 / `REQBOARD_*` / `≥` / `等于` / 逐字节），
  **刻意不收裸数字**（否则「8 段进度带」会让「排版收敛」这类条款侥幸过关）。
- **只提示不拦**：进 `reqboard_submit(kind=requirement)` 回执的 `clause_criteria_warnings`
  （与 `readability_warnings` 同形，非空才出键），并在 `note` 里追加一句。
- **dogfood 逼出的修正**：窗口原取 12（理由"条款块实测 3~8 行"），结果**本需求自己的文档**
  就有 3 条 FR 被判成缺口（判据落在定义行 15 行之后）——假红比漏报更贵（训练人忽略提示），
  故放宽到 40 并加了一条「长条款块不假红」的测试锁住。

### 1.2 设计坐标探针（缺口 2）

- `scripts/design-coord-probe.mts`：`--req <REQ>` 扫该需求 `design/*.md`；
  **硬判据一**「路径 token 必须可解析或命中书写法白名单（9 条，逐条写理由）」；
  **硬判据二**「任务卡汇报的**源码类**落点（`src/ scripts/ packages/ lib/`）必须在该需求
  `design/*.md` 里被提到，否则按『未回写 `design/architecture.md` 的模块改动地图』点名」；
  **软观测**「反引号标识符不在 `code-map.symbols.tsv` 词表」（实测单需求 82 条，
  真缺口 2 条——这正是它必须软的原因，`computeTestingCoverage` 已抓到）。
- 只判源码类落点是**故意**的：测试落点在设计里由 `test-cases.md` 的「实际文件」列与任务卡表达，
  要求它们也进模块表 = 逼人把机器生成的测试名手抄一遍；收窄后同一需求回写缺口 24 → 7，
  全仓绿从 2 个需求提到 18 个（`excludedTestPaths` 如实登记，不静默少判）。
- 注册与演练：登记在 `operations.ts` 的 `EXCLUDED`（按需跑、存量不追溯、**不进提交前清单**、
  不新增 package.json script）；`reverse-drill-matrix` 的 `HARD_DRILLS` 加一条（改坏真实设计文档
  里的一个路径 → exit 1 并点名 → 逐字节还原，sha256 复核）。

### 1.3 `sides` 与「失败与并发路径」

- `sidesDeclarationGap(category, frontmatter)`（`category-doc-sets`，与 `VALID_SIDES` / `frontmatterList`
  同源）：feature / refactor **必须显式声明**，值只能是 `frontend` / `backend`，
  `[]` 是**自洽声明**（明确无端侧改动）而非遗漏——要求非空会逼纯工具类需求写假话。
- **独立成门**而不并进 `checkRequirementDocFormatGate`：后者有 `isLegacy`（`artifacts` 空即早退），
  而**首次提交正是 artifacts 为空那一次**；且它被 `STAGE_GATE_PROBES` 当时点探针复用，
  并进去会把端侧语义外溢到别的时点读数。
- **存量不追溯**：两条门都走 `DOC_QUALITY_RULES_SINCE`（`domain/workflow/DocQualityRules.ts`，
  与 `rtm-health` 的 `PROTOTYPE_RULES_SINCE` 同构）。`docSectionGateFailure`（「失败与并发路径」）
  **刻意不进 `CATEGORY_DELTAS`**：DELTA 会被拆分提交 / 设计门 / 文档自检复用到存量需求上 = 追溯。
  模板侧由 `template-gate-probe` 显式点名、`doc-section-parity` 登记为 optional + 说明，保证
  「模板有、门禁判」两侧可核。

### 1.4 拆分面四条

1. **refs 单口径（留「卡上必须有 refs」）**：`assertClauseCoverageGate` 的 `covered` **只**来自
   `rawTasks.flatMap(requirementRefsOf)`，删掉 `decomposition.md` 覆盖对照表通道。
   理由三句：① 卡上 refs 是**下游唯一读点**（RTM `generateRTMData`、结单证据锚定
   `doneEvidenceAnchorFailure`、条款接收状态都只读 `TaskRecord.requirementRefs`）；
   ② 文档表当门禁依据 = 门禁读 A、下游读 B，于是造出「门禁绿、卡上全空」的静默缺口（实测 28%）；
   ③ 门禁要收的是**落库那一刻的事实**。`refsForLanding` 的文档兜底保留并如实标注为**存量/回填通道**。
2. **`done` + 0 子卡 + 声明了链 → 看板标红**：`QueryDag.chainMissingOf` 与
   `client/dag/progress-bar.ts` 的 `chainMissing` 两份逐字同源改，判据**分状态不对称**——
   `in_progress`：未声明 `stages` 也算期望有链（**与旧行为逐字一致，不放松**）；
   `done`：**仅显式非空 `stages`** 才标（存量 done 不噪声）；`stages: []` = 显式 solo，永不标。
3. **零交集依赖边 → 建议清单**：新增 `PlanTask.dep_reasons`（入参为字符串数组
   `"t2=理由"`，归一为 map——map 形态会让 `defineSubmitTool` 抛 `JsonSchemaError`，
   踩过）与 `zeroOverlapDependencyWarnings`：两端 `declaredFiles(implementation)` 零交集
   且该边无理由 → 进既有 `dependency_warnings`（点名不拒，附两端文件清单与修复示例）。
   理由**不落 `TaskRecord`**：随 `PlanRecord.tasks` 已可查，再搬一份只多一处会漂移的真相。
4. **跳联调要理由 + 文档所见 = 批准所见**：`skipIntegration: true` 必须同时给
   `skipIntegrationReason`（码 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`）；
   `plan-doc-table.ts` 硬判「计划文档有任务表（表头含「计划 key」）且表里的 key 覆盖
   `tasks[].key` 全集」（码 `plan_doc_task_table_incomplete`，与模板探针同词法），
   软判「缺『验收』/『工作量』/『依赖』列」→ 新出参 `plan_doc_warnings`（不拒）。
   实测教训：有需求 `decomposition.md` 41 行无任务表，而 `plan.json` 有 10 张完整卡——
   审批人批的是一份空文档。

## 2. 证据（可复跑）

```text
$ pnpm templates:check
模板 25 份：OK 25 / FAIL 0；缺口 0；观察 6（不计入判据）；文档自检缺口 0（PASS，需求模板 6 份）；exit 0
需求模板 6 类：OK 6 / FAIL 0；双向漂移 0；exit 0

$ pnpm prompts:verify
[check-prompt-fragments] OK: src/domain/prompt/generated/fragments.ts 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致

$ npx tsx scripts/req-doc-validate.mts --req REQ-261006123819-3af3
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 0；exit 0

$ npx tsx scripts/design-coord-probe.mts --specimen            # 5/5 按预期
$ npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a
FAIL 路径可达 src/domain/queue/normalizeQueueFile.ts ← …/design/interfaces.md:19、:148   # 审计点名的那条
FAIL 落点回写 src/application/query/live-artifacts.ts ← …/tasks/t-dcdb26.md              # 设计 0 处提及
exit 1（存量需求本来就该有缺口；未改存量文档）

$ npx tsx scripts/reverse-drill-matrix.mts --group hard
8/8 ✅（含新增的「缺口 2 · 设计坐标」；还原逐字节 + sha256 一致）

$ npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts \
    tests/plan-doc-table.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint.test.ts \
    tests/plan-footprint-tool-schema.test.ts tests/card-layer.test.ts tests/query-report.test.ts \
    tests/clause-coverage-gate.test.ts tests/design-coord-probe.test.ts tests/canceled-reverse-drill-coverage.test.ts
Test Files 12 passed (12) · Tests 156 passed (156)
```

### 2.1 三条反向演练（逐条）

| 演练 | 命令 | 改前 → 改后 |
|---|---|---|
| 删掉条款判据锚点 | `tests/clause-criteria.test.ts`（单测）＋真文档副本演练 | 原样：缺口 0（窗口由 12 放宽到 40 后原先的 FR-3/FR-5 假红消失）→ 把 FR-2 的判据删成一句形容词后：`FR-2`（提示点名该条款） |
| 改坏设计里的路径 | `design-coord-probe --specimen` ① | `src/nope/x.ts` → exit 1 且点名该路径 |
| 写 `sides: [doc]` | `tests/sides-declaration.test.ts` + `tests/doc-quality-gate.test.ts`（走真提交编排） | 拒，码 `requirement_sides_invalid` |
| 删掉「失败与并发路径」节 | `tests/doc-quality-gate.test.ts` | 拒，码 `requirement_section_missing`；存量需求（`createdAt` 早于规则起点）放行 |

### 2.2 存量实测（**只读，未改写任何存量文档**）

> ⚠️ 本节的存量数字是 **21:3x 时点的快照**，**不是**权威读数：权威读数（79 份 / 19 绿 / 60 红 ·
> 路径 125 / 回写 466 / 排除 1204）见 `tests/t2-design-coord-evidence.md` §2 与本节 §2.4。
> 差异来源：① 裸根名前缀白名单加入后路径假红减少；② 本需求自己的 `design/` 落盘后又多一份；
> ③ **采集脚本首版有静默丢样**（管道截断 → JSON 解析失败被 `continue` 跳过，漏了 `REQ-261002161439-277d`）——
> 独立评审复现了这一条，权威读数已按逐份落盘的读法重测。

- 条款判据：84 份 requirement 文档 / 456 条条款中 **229 条无可核验判据（50%）**；最集中的是
  `REQ-261006130057-7a43`（8/8）。
- `sides`：79 份 requirement.md 中 **34 份缺 `sides`**、2 份值非法
  （`REQ-261004222448-292a` = `[frontend, backend, doc]`、`REQ-261006115829-dafb` = `[doc]`）、
  1 份显式 `[]`。
- 设计坐标：78 个有 `design/` 的需求全量实测 **18 绿 / 60 红**；路径缺口 149、回写缺口 458
  （收窄前 1248、绿仅 2——绝大部分噪声来自测试落点）。

## 3. 与门禁同源的四处真相（改一处必须同时改）

1. `category-doc-sets.ts` 的 BASE + DELTA / `sidesDeclarationGap`（运行时真常量）；
2. `templates/brainstorming/*.md`（人照抄的骨架：front-matter `sides`、各必填节、FR 判据口径）；
3. `scripts/doc-section-parity.mts` 的 `REGISTRY` + `scripts/template-gate-probe.mts` 的 requirement 分支
   （机械核「模板有、门禁判」）；
4. `src/domain/prompt/fragments/**`（注入片段）+ `src/domain/prompt/generated/fragments.ts`（逐字节生成物）
   ——本次给 brainstorming 的必填节行、decomposing 完整档补了新纪律；
   **light 档没加**：实测 light 档字符预算已满（decomposing 2493/2500、brainstorming 2468/2500），
   故新规则的「调用即见」位置改在 **工具 description**（`src/tools/SubmitTool/prompt.ts`）。

## 4. 明确没做 / 不在本次范围

- 不动**验收单**（`AcceptanceSheetSpec` / `SubmitVerification` / `sheet-tasks`）、**原型门**、
  **归档校验**、`docs/reviews/test-baseline.*`（回归基线一字未改）。
- 不追溯、不改写任何存量需求文档；探针只在 `--req` 时按需跑。
- `planRefsFromDoc` / `planRefsMissing` **保留**（前者是存量/回填通道，后者仍被 e2e 直接调用）：
  本次只收敛**门禁读点**，没删取数函数。

## 5. 需要知道的现场情况（不是本次改动引起）

1. **同工作树有并发窗口**在改 archive/reconcile 工作流、capture/create 策略、accept-sheet 降级读数、
   client 面板与 workspace-root/predicates 重构。用 vitest JSON 输出与
   `docs/reviews/test-baseline.failures.txt` 做集合差：**新增 48 条失败全部落在上述并发面**
   （archive-reconcile 7、capture-window-bound 5、accept-sheet-tool 5、acceptance-archive 4、
   archive-compat 3、create-delegated-owner 3、kb-archive-deposit 3、client-view 3、…），
   本次改动涉及的 156 条用例全绿；另有 7 条基线失败已由并发窗口救绿。
2. **一条越界修复**：`tests/helpers/tool-deps.ts` 缺本地 `import { resolveWorkspaceRoot }`
   （并发窗口在制状态，`export {…} from` 只转出不建本地绑定）→ 所有用 `stubDocFile` 的测试
   整文件红。我补了那一行 import（并保留转出）；若该窗口随后自行修好，以它的版本为准。
3. `pnpm kb:check` 的 **K1（INDEX 8357 > 8000 字符）是既有红**（HEAD 已是 8189 > 8000），
   并被并发窗口新增的知识条目推高；K3（页面 200 行预算）已被我压回绿，
   K7（生成物漂移）用 `pnpm kb:build` 重生成后绿。
4. 未跟踪目录 `docs/requirements/REQ-261006999999-aaaa/`（并发窗口测试的合成 id 泄漏到仓库根）
   与若干 `rtm-*.yml` 的时间戳/版本变化：均为测试/同步副作用，非本次改动，未清理。

## 6. 待裁定（已按下面口径实现，若要改请点名）

1. 任务表**硬判**只在 `submitPlanArtifact`（`tasks.length>0`），`reqboard_decompose` 创作路径不经它，
   故**未留豁免口**（不需要逃生舱）。
2. 零交集依赖边点名要求**两端都 ≥1 个可抽路径**（一端抽不到就沉默——没依据不误报）。
3. `skipIntegrationReason` 在两条入口都生效（共用 `normalizePlanTasks`）——「这张卡没有接口面」
   应在同一处判。
4. `dep_reasons` 不落 `TaskRecord`（理由随 `PlanRecord.tasks` 可查）。
5. `plan_doc_warnings` 的缺列判据用宽匹配（列名有历史变体），软判，漏报优于误报。
6. `templates/brainstorming/refactor.md` 的 `sides` 缺省写 `[]`（明确「无端侧改动」）而不是
   `[frontend]`：不替需求方认领界面改动；代价是纯内部重排之外的重构需要人**主动**改成 `[frontend]`
   才会触发原型条件必交（与改动前「缺省不触发」等价，但现在是**显式可见**的声明）。

## 2.3 实施阶段读数（链尾卡 t5 复跑 · 2026-10-06 22:1x）

| 判据 | 命令 | 读数 |
|---|---|---|
| 模板过门禁 + 文档自检 | `pnpm templates:check` | **exit 0**：模板 25 份 OK 25 · 需求模板 6 类 OK 6 / 双向漂移 0 · 文档自检缺口 0 |
| 注入产物新鲜度 | `pnpm prompts:verify` | **exit 0**：`generated/fragments.ts` 与 `fragments/**.md` 逐字节一致；`heavy.md` ↔ vendor 原文逐字节一致 |
| 本需求文档自检 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` | **exit 0**：判据 9 项（实判 6 / 读数未知 3）；缺口 0 |
| 反向演练矩阵（端到端） | `npx tsx scripts/reverse-drill-matrix.mts --group hard` | **exit 0 · 8/8 ✅**：每一处改坏都真变红、每一处还原都过 sha256 核对 |
| 构建新鲜度 | `pnpm build` | **exit 0**：`dist/index.mjs`（host）+ `lib/client.js`（client）均重建；`[verify-client] OK` |
| dist 含本批新码 | `grep -c` | `requirement_sides_invalid` → 1；`clause_criteria_warnings`/`DOC_QUALITY_RULES_SINCE` → 5 |

**全量回归集合差（`npx vitest run --reporter=json` vs `docs/reviews/test-baseline.failures.txt`）**：

```
失败 69 条 · 基线 68 条 · 新增 9 · 本需求引入 0 条
新增按文件：client-view 3 · error-code-inventory 2 · live-tasks-single-source 2 ·
artifact-openable 1 · typecheck 1
npx tsc --noEmit → 错误 1 条（tests/query-docs-roots.test.ts）；本需求改动文件 0 条
```

**归属**：新增的 9 条失败与 1 条 tsc 错误**全部落在同工作树并发窗口在制的面**
（client 面板 / error-code 清单 / live-tasks 谓词 / docs 根解析 / 报表降级面板）；
本需求新增与改动的测试（clause-criteria / sides-declaration / doc-quality-gate / plan-doc-table /
design-coord-probe / card-layer / query-report / dag-panel / node-panel）**0 条新增失败**。
按 C-14 的集合差口径，**严格判据未满足**（69 > 68、tsc 1 > 0），如实报出、不记成通过——
等并发窗口在制改动落地后重跑同一命令即可归零。

**宿主生效性（重要）**：运行中的插件是**本次会话启动时加载**的那版，因此
`skip_integration_reason` / `dep_reasons` 这两个新字段在会话里进不了 `tasks[]`（参数校验按旧 schema 拒收），
新门也尚未在会话里拦人；`pnpm build` 产物已含全部新码（见上表 grep 读数），
**宿主重载插件后新门与新字段即生效**（重载后重交同一份拆分计划即可把理由写进 `tasks[]`）。

**实施阶段逐卡证据（可复核）**：

| 卡 | 覆盖 | 证据文件 |
|---|---|---|
| t1 复跑需求面三条判据 | FR-1、FR-3、FR-4 | `docs/requirements/REQ-261006211623-9dc1/tests/t1-requirement-side-evidence.md` |
| t2 设计坐标探针 + 存量读数 | FR-2 | `docs/requirements/REQ-261006211623-9dc1/tests/t2-design-coord-evidence.md` |
| t3 拆分面四条 + 反向演练 | FR-5、FR-7、FR-8 | `docs/requirements/REQ-261006211623-9dc1/tests/t3-split-side-evidence.md` |
| t4 红标色值无障碍定稿 | FR-6 | `docs/requirements/REQ-261006211623-9dc1/tests/t4-chain-missing-color-evidence.md` |

## 2.4 独立评审结论与逐条处置（2026-10-06）

独立复核者（非实现者）产出 `docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md`
（406 行，含它自己跑的命令与输出、D-1…D-6 逐条裁定、以及它**没做**的三项）。

**结论：有条件通过**——判据本体是真的（FR-1/2/3/4/6/8 各做了一次「改坏→真红 / 改回→真绿」的双向核验，
FR-5 有源码取数口 + 过滤用例双重确认），但「交付即完成」不成立。逐条处置如下：

| 编号 | 评审发现 | 处置 |
|---|---|---|
| C1（阻塞） | `req-doc-validate --req` 转红：台账已 `accepting` 却缺 `rtm-accepting.yml`（整体验收标准当下为假） | **已修**：本轮验收材料提交会触发 RTM 同步生成该文件；复跑 `req-doc-validate` 已回绿（见 §2.5 读数） |
| C2（中） | 存量读数**四方互斥**，且 t2 的「最红 5 份」漏掉 `REQ-261002161439-277d` | **已修**：权威读数收敛为一组（79 份 / 19 绿 / 60 红 · 125 / 466 / 1204，2026-10-06 14:28 UTC），t2 §2 换成权威表 + 差异来源表；根因是采集脚本**静默丢样**（管道截断），已改成逐份落盘读 |
| C3（中） | 设计文档对 `design-coord-probe.mts` 的行号**系统性偏 −9**，而探针只判路径不判行号 → 本需求自己的坐标漂了仍报绿 | **已修**：`interfaces.md` 12 处、`architecture.md` 4 处、`test-cases.md` 3 处、`use-cases.md` 2 处按真实符号行号修正并复核（另 2 处经核本就正确）；同时把这条边界写进 §2.5 |
| C4（中） | 「宿主已重载」与「矩阵 8/8」不可核验 | **部分可核验**：矩阵 8/8 的读数见 §2.3（本侧已跑并留痕）；「宿主是否已重载」在会话内部**不可自证**，只能给出可复验命令——`grep -c skip_integration_reason dist/index.mjs` ≥1 且 `dist` mtime 晚于源码 mtime（§2.3 已给） |
| C5（小） | `requirement.md` 的 `status: brainstorming` vs 台账 `accepting` vs `rtm-lifecycle.yml` 的 `decomposing` 三处不一致 | **口径澄清 + 已修一半**：全仓 80 份 requirement.md 里只有 **2 份**带 `status:` 字段（模板遗留，非维护字段）→ 该字段不是真相，台账才是；`rtm-lifecycle.yml` 的陈旧由 C1 的 RTM 同步一并刷新 |
| C6（中，风险最高） | FR-7 零交集判据**在真实数据上大面积空转**：`conflict-check.ts` 的 `PATH_RE` 四根是 `packages|scripts|tests|docs`，**不含 `src/`**（`.mts` 也不在），实测含 `src/` 的 530 行里 **429 行（81%）一条都抽不到** | **未修，交人裁定**：扩 `PATH_RE` 会同时改动 `findWorkSurfaceConflicts`（文件冲突门）的行为，属批准计划之外的范围变更；已把它作为验收单里的显式待决项（见下「已知边界」） |
| R3（中） | 条款判据窗口 40 的余量只剩 2 行（实测首锚点行距：中位 9 / p90 20 / 最大 38） | 采纳为**已知边界**：窗口 40 当前 0 条假红、12 会假红 30 条；余量小这件事写进边界，若将来条款块更长需再评估 |
| R4（中） | 探针不进提交前清单 ⇒ FR-2 是「无触发点」的自愿判据（C3 就是它的直接后果） | 采纳为**已知边界**（这是「存量不追溯」的必然代价）：靠 `reverse-drill-matrix` 的 hard 组与改动时按需跑来兜 |
| R7（中） | 需求能推进到 accepting 而文档自检是红的（链路不看这 9 项自检） | 采纳为**已知边界**：验收材料里逐条列读数，不把「自检绿」当推进前提 |

**小项（评审列出的读数/文案漂移）**：`requirement.md` FR-1 验收标准写「9 passed」实测 **10**（该文件在 G1 后
因加了「长条款块不假红」用例而增长）；`review:45` 白名单「8 条」已改为 9 条；`t2` 的「通报落点 1」是采集时点值。
**需求文档本身在 accepting 阶段无法重交**（`submitRequirementArtifact` 要求 `brainstorming` 状态），
故这些差异**只能逐条列明、不静默**——已列在此表与验收材料里。

**同批修正的坐标类改动（G2 之后的两类同步，均为读数/坐标、未改任何设计决定）**：
① `test-cases.md` §五 填入实施实测读数（t5 卡任务）；② `interfaces.md`/`architecture.md`/`test-cases.md`/`use-cases.md`
的探针行号修正（C3）。

## 2.5 验收材料提交后的复跑（C1 收口）

```
$ ls docs/requirements/REQ-261006211623-9dc1/rtm-accepting.yml
docs/requirements/REQ-261006211623-9dc1/rtm-accepting.yml          ← C1 的缺文件已由验收材料提交触发的 RTM 同步补齐

$ npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1
文档自检汇总：判据 9 项（实判 6 / 读数未知 3）；缺口 0；exit 0   ← C1 转绿（此前为 缺口 1 / exit 1）
```

验收材料提交回执：`status=accepting`、`tasks_done 18/18`、`sheet_items 8`、
`results_bound 8 / results_matched 8 / results_unmatched []`、`results_coverage complete`。
其中 `prototype-compare` 项按规矩标 `needsHuman`（界面视觉只能人看），并附可复核的结构化对照指路。

**仍未闭合的一项交人裁定**：C6（FR-7 零交集判据对 `src/` 落点空转，`PATH_RE` 四根不含 `src/`／`.mts`）。
两个选项：① 扩 `PATH_RE`（同时会改变文件冲突门行为，属批准计划外的范围变更，需重跑
`tests/concurrency-limits.test.ts` 等）；② 保持现状，把该边界写进需求/设计（需求文档在 accepting 阶段
无法重交，只能记在这里与验收材料里）。**建议 ① + 单独一张任务卡**，因为「依赖边有没有文件交集」
这条判据不覆盖 `src/` 等于对绝大多数落点不判——但这要由人拍板。
