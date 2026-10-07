---
req_id: "REQ-261006211623-9dc1"
title: "需求/设计/拆分三面文档判据门禁加固"
status: brainstorming
owner: "session-b4188f2e"
category: feature
# sides: 条件必交设计文档与原型门的触发器。本需求改的是文档门禁/模板，同时改了看板 DAG 卡的
# 红标判据（src/client/dag/progress-bar.ts）——用户可见的行为变化，故两端都声明。
#   [frontend] 有界面改动 · [backend] 有服务端改动 · [frontend, backend] 两端 · [] 明确无端侧改动
sides: [frontend, backend]
---

# 需求说明（REQ-261006211623-9dc1）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> **人读三件套**：TL;DR（≤3 行）+ 一张 ASCII 业务流程图 + 功能点总览表。
> **排版纪律**：禁止超过 4 行的连续段落；3 个及以上并列项用表格；图一律 ASCII 字符画，禁用 mermaid。

## TL;DR <!-- serves: FR-1 -->

需求/设计/拆分三面都不缺"形状"，缺的是**判据**：形状门禁全绿而 7/73 条条款毫无验收判据、
`sides` 写错值被静默过滤、设计里点名的路径实现后失效且无人回写、拆分卡上引用落库率只有 28%。
本次把每一处都变成**可证伪的判据**，并给每条判据配一条**反向演练**（删掉 / 改坏必须红）。

## 业务流程图 <!-- serves: FR-1 -->

```
写需求文档 ──▶ reqboard_submit(kind=requirement)
                 │
                 ├─ 硬门① front-matter sides 必须显式且值域合法（缺/非法即拒）
                 ├─ 硬门② 新需求必须有「失败与并发路径」节（存量不追溯）
                 └─ 软提示 条款级判据缺口 → clause_criteria_warnings（不阻断）
                 │
                 ▼  人确认（G1）
              写设计文档 ──▶ npx tsx scripts/design-coord-probe.mts --req <REQ>
                 │                 └─ 路径必须可达；源码类落点必须回写「模块改动地图」
                 ▼  人确认（G2）
              写拆分计划 ──▶ reqboard_submit(kind=plan)
                 │
                 ├─ 硬门 每张卡有 requirement_refs（覆盖门禁只认卡上这一条通道）
                 ├─ 硬门 skipIntegration:true 必须带理由
                 ├─ 硬门 计划文档任务表必须覆盖 tasks[] 的全部 key
                 └─ 软提示 零交集依赖边进 dependency_warnings / 缺列进 plan_doc_warnings
                 ▼  人批准计划
              落库任务卡 ──▶ 看板 DAG：计划声明了子卡段却 0 子卡 → 标 [链未生成]
```

## 产品定义 <!-- serves: FR-1 -->

**一套"文档说得能验"的机械判据。** 它不是新功能面板，而是给已有的三个节点（需求 / 设计 / 拆分）
补上缺位的那半道门：**形状对了不等于内容能验**。核心价值：把"验收时才发现的判据缺口"
提前到"提交那一刻由机器点名"，且**只在该拦的地方拦**（缺陷是静默失效的才硬拦，
判据质量人才能定的只软提示）。

**三要素检查清单**：
- [x] 说清楚"是什么"：三面（需求条款 / 设计坐标 / 拆分歧义）的判据补齐，且同源（模板、门禁、探针、提示词）
- [x] 说清楚"核心价值"：把静默失效变成响亮失败；把人为判据质量的部分留给软提示
- [x] 说清楚"与现状的区别"：现状是"形状门禁全绿"，本次是"每条判据都有反向演练"

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点（本次要治的） |
|---|---|---|
| 需求方 / PM | 写 requirement.md、批准设计 | 条款写得"齐"但没法验；验收时才发现"这条拿什么算做到" |
| 实施窗口 agent | 按设计与计划干活 | 设计里点名的路径/符号实施后失效，照文档做会撞空 |
| 拆分者 | 写 decomposition.md、落库任务卡 | 卡上没引用 → RTM/结单证据链全空；伪依赖把可并行的卡串成链 |
| 验收人 | 逐项核验交付 | 卡上 refs 落库率 28%，追溯链断在半路 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能点 | 优先级 |
|---|---|---|
| FR-1 | 条款级判据软门禁：每条条款的定义行块内须有可核验判据，缺了只提示不拦 | P0 |
| FR-2 | 设计坐标探针：design/*.md 点名的路径必须可达，源码类落点必须回写模块改动地图 | P0 |
| FR-3 | front-matter `sides` 硬门：feature / refactor 必须显式且值域合法 | P0 |
| FR-4 | 「失败与并发路径」必填节：新需求必交，存量不追溯 | P0 |
| FR-5 | 拆分引用单口径：覆盖门禁只认卡上 `requirement_refs` | P0 |
| FR-6 | 子卡链静默失效看板标红：声明了子卡段却 0 子卡（含 done）即标 | P0 |
| FR-7 | 依赖与联调的理由必填：零交集依赖边给语义理由，跳联调给理由 | P1 |
| FR-8 | 文档所见 = 批准所见：计划文档任务表必须覆盖 tasks[] 全部 key | P0 |

### 功能点详细说明

**填写要求**：每条 FR 独立成段、用三级标题；**每条至少一个可核验判据锚点**（命令 / 读数 / 明确取值）。

### FR-1：条款级判据软门禁 <!-- serves: FR-1 -->

**功能描述**：需求文档里每条条款（FR-x / BUG-x / RF-x / SP-x / DOC-x / CH-x）的**定义行块内**
必须出现可核验判据（命令 / 断言 / 可读数 / 明确取值）；缺了**只提示不拦**。

**详细说明**：
- **扫描口径**：从条款定义行向下扫到「下一条款定义行」或「层级不深于本条款的标题」为止
  （数字上限 40 只是兜底，真正的边界是文档结构）；
  定义行口径**逐字复用**编号门禁的 `DEF_LINE_RE`（含标题写法与列表写法），不另立第二份真相。
- **锚点词汇表**：与结单证据同一份（`domain/workflow/EvidenceAnchor.ts`），附加形态只收"明确取值 / 可读数"
  （退出码 / `REQBOARD_*` / `≥` / `等于` / 逐字节）；**刻意不收裸数字**（否则"8 段进度带"会让"排版收敛"侥幸过关）。
- **为什么软**：判据的**质量**人才能定，机械层只判"有没有"；硬拦会逼人写废话糊门禁（本仓最贵的失败形态）。

**验收标准**：
1. `npx vitest run tests/clause-criteria.test.ts` → 9 passed（含"删掉锚点必须报警"的反向演练）。
2. 提交回执里**有缺口才出现** `clause_criteria_warnings` 键；条款都带判据时该键整体省略
   （`tests/doc-quality-gate.test.ts` 的 e2e 两例分别锁这两侧）。

### FR-2：设计坐标探针 <!-- serves: FR-2 -->

**功能描述**：设计文档点名的路径必须能解析；实施期新增/改名的**源码类**落点必须回写到该需求
`design/*.md`（正路是 `design/architecture.md` 的「模块改动地图」节）。

**详细说明**：
- 载体：`scripts/design-coord-probe.mts`（按需跑，**不进提交前清单**）：
  `--req <REQ>` 判该需求；`--specimen` 内置反例证明判据不空转；`--json` 供机器消费。
- 只判源码类落点（`src/ scripts/ packages/ lib/`）：测试落点由 `design/test-cases.md` 的「实际文件」列
  与任务卡表达，要求它们也进模块表 = 逼人把机器生成的测试名手抄一遍；被排除的落点如实登记
  （`excludedTestPaths`），不静默少判。
- 词表外符号（如全仓不存在的 `computeTestingCoverage`）只作**软观测**：实测同一需求 82 条词表外、
  真缺口 2 条——硬判会制造大量假红。

**验收标准**：
1. `npx tsx scripts/design-coord-probe.mts --specimen` → **exit 0**，5/5 反例按预期（把路径改成
   `src/nope/x.ts` 必须 exit 1 并点名）。
2. `npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a` → **exit 1**，且点名
   `src/domain/queue/normalizeQueueFile.ts ← design/interfaces.md:19`（存量缺口照实报，不改存量文档）。
3. `npx tsx scripts/reverse-drill-matrix.mts --group hard` → exit 0，8/8（含本需求新增的那条 drill，
   还原逐字节 + sha256 一致）。

### FR-3：`sides` 硬门 <!-- serves: FR-3 -->

**功能描述**：feature / refactor 的需求文档 front-matter 必须**显式**声明 `sides`，值域只允许
`frontend` / `backend`；`[]` = 明确声明"无端侧改动"（自洽声明，不是遗漏）。

**详细说明**：
- 判据单点：`category-doc-sets.ts` 的 `sidesDeclarationGap`（与 `VALID_SIDES` / `frontmatterList` 同源）；
  提交期由 `sidesGateFailure` 执行，**独立成门**而不并进格式门——格式门有 `isLegacy`（artifacts 为空即早退），
  而**首次提交正是 artifacts 为空那一次**；且格式门被时点探针复用，并进去会把端侧语义外溢到别的时点读数。
- 修前病灶是**静默过滤**：`designDocPolicyFrom` 只留合法值，非法值与缺失都不报错 ⇒
  `sides: [doc]` 与"没写"后果完全相同（条件必交设计文档永不触发）。
- 存量不追溯：只看 `createdAt ≥ DOC_QUALITY_RULES_SINCE` 的需求。

**验收标准**：
1. `npx vitest run tests/sides-declaration.test.ts` → 10 passed；反向演练：写 `sides: [doc]` 提交 →
   拒，错误码 `requirement_sides_invalid`。
2. `pnpm templates:check` → 模板 25 份 OK 25；`templates/brainstorming/refactor.md` 现在自带合法 `sides`
   （修前它没有 ⇒ refactor 的原型条件必交永不触发）。

### FR-4：「失败与并发路径」必填节 <!-- serves: FR-4 -->

**功能描述**：新立项的 feature / refactor 需求，requirement.md 必须带「失败与并发路径」节
（失败路径 / 并发重复 / 状态机非法迁移 / 写路径半成品清理）；确实不适用的需求写
「不适用：<理由>」保留节。

**详细说明**：
- **刻意不进 `CATEGORY_DELTAS`**：DELTA 会经 `missingCategoryDocs` 在拆分提交 / 设计门 / 文档自检上
  对**存量需求**一起判 = 追溯（实测会让在飞老需求提交拆分计划时被新节拦住）。
  故实现为**提交期硬门** `docSectionGateFailure`，按需求创建时间生效。
- 模板侧（`templates/brainstorming/{feature,refactor}.md`）照旧有这一节，由 `templates:check` 双向锁；
  `doc-section-parity` 把它登记为 optional 并在理由里指向本门。

**验收标准**：
1. `npx vitest run tests/doc-quality-gate.test.ts` → 11 passed；反向演练：删掉该节 → 拒，
   错误码 `requirement_section_missing`。
2. 存量需求（`createdAt` 早于规则起点）同样文档不完整 → **放行**（同文件有用例锁）。

### FR-5：拆分引用单口径 <!-- serves: FR-5 -->

**功能描述**：条款覆盖门禁的 covered **只**来自任务对象的 `requirement_refs`；
计划文档的覆盖对照表**不再是门禁依据**（降级为人读汇总 + 存量回填通道）。

**详细说明**：
- 三句理由：① 卡上 refs 是**下游唯一读点**（RTM `generateRTMData`、结单证据锚定
  `doneEvidenceAnchorFailure`、条款接收状态都只读 `TaskRecord.requirementRefs`）；
  ② 文档表当门禁依据 = 门禁读 A、下游读 B ⇒ 造出"门禁绿、卡上全空"的静默缺口（实测落库率 28%）；
  ③ 门禁要收的是**落库那一刻的事实**。
- 拒绝时的 how 只给一条可执行路径：在 `tasks[]` 里写 `requirement_refs:["FR-N"]`。

**验收标准**：
1. `npx vitest run tests/clause-coverage-gate.test.ts` → 全绿；其中"只补文档覆盖表"的用例已**反转为必拒**
   （gaps 点名 FR-1/FR-4/FR-7），并新增"卡上写了 refs → 放行"。
2. `npx vitest run tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts`
   → 全绿（落库读数与门禁同口径）。

### FR-6：子卡链静默失效看板标红 <!-- serves: FR-6 -->

**功能描述**：看板 DAG 的 `[链未生成]` 判据改为**分状态不对称**：
`in_progress` + 0 子卡（**未声明 `stages` 也算**）→ 标红；`done` + 0 子卡 **且显式声明了非空 `stages`** → 标红；
`stages: []`（显式 solo）与 `todo` 永不标。

**详细说明**：
- 为什么 `done` 也要标：`autoRun=false` 的手动开工路径从不展开子卡，而 `expandSubtasks` 是幂等的
  「只一次机会」⇒ 卡走完五段到达 done、名下 0 子卡，而计划里白纸黑字写着"这张卡要 dev,review"；
  那一刻没有任何红灯：人看到"卡做完了"，真相是"链从没生成过"。
- 为什么 `done` 只认显式声明：不声明 `stages` 的存量 done 卡如果一律打标，会大面积变噪声
  （噪声判据 = 没人看的判据）。这条非对称（`in_progress` 防漏报、`done` 防误报）在代码注释里写明。
- 两份实现逐字同源（`application/query/QueryDag.ts` 与 `client/dag/progress-bar.ts`；
  application 禁止 import client，`tests/layer-boundary.test.ts` 机械检查）。

**验收标准**：
1. `npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts` → 全绿；
   四条状态各有用例（含"`in_progress` 未声明仍标红"的防腐烂回归与"`done` 未声明不标"）。
2. 原型 `prototypes/dag-chain-missing.html`（`prototypes/INDEX.md` 标唯一 authoritative）画出四种状态对照，
   UI 卡 `prototypeRefs` 指向 `prototypes/dag-chain-missing.html#FR-6`。

### FR-7：依赖与联调的理由必填 <!-- serves: FR-7 -->

**功能描述**：`skipIntegration: true` 必须同时给 `skipIntegrationReason`（否则拒）；
某条 `depends_on` 两端 `implementation` 声明的文件**零交集**时，在 `dep_reasons` 里给一句语义理由，
无理由只进 `dependency_warnings` 建议清单（不拒）。

**详细说明**：
- 实测 78/107 条依赖边两端文件零交集（可并行的卡被串成链）；20/99 张卡跳联调而只有 4 份计划写了理由。
- `dep_reasons` 入参是**字符串数组**（`"t2=理由"`）并归一为 map：map 形态会让 `defineSubmitTool`
  抛 `JsonSchemaError`（踩过），schema 层不支持未显式声明值的 map。
- 理由**不落 `TaskRecord`**：随 `PlanRecord.tasks` 已可查，再搬一份只多一处会漂移的真相。

**验收标准**：
1. `npx vitest run tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts` → 全绿；
   含四例（零交集点名 / 有理由放行 / 有交集不误报 / 数组→map 落台账）。
2. `skipIntegration: true` 缺理由 → 拒，码 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`（同文件有用例）。

### FR-8：文档所见 = 批准所见 <!-- serves: FR-8 -->

**功能描述**：`reqboard_submit(kind=plan)` 且 `tasks.length > 0` 时，**硬判**提交的那份计划文档里
存在任务表（表头含「计划 key」）且表里的 key 覆盖 `tasks[].key` 全集；**软判**列齐全
（缺「验收」/「工作量」/「依赖」列 → `plan_doc_warnings`，不拒）。

**详细说明**：
- 实测教训：有需求 `decomposition.md` 只有 41 行、**没有任务表**，而 `plan.json` 里躺着 10 张完整卡——
  门禁全绿、人批的是一份空文档、落的是另一批卡。
- 表头判据与 `scripts/template-gate-probe.mts` 的 decomposition 判据**同口径**（同一件事只能有一份词法）。
- 硬判只在 `submitPlanArtifact`：`reqboard_decompose` 创作路径不经它，故不需要豁免口。

**验收标准**：
1. `npx vitest run tests/plan-doc-table.test.ts` → 10 passed（读表口径 + 两条硬判 + 软判三条）。
2. 文档无任务表 / 表覆盖不全 → 拒，码 `plan_doc_task_table_incomplete`；缺列 → 出参 `plan_doc_warnings`
   非空但 `success: true`（同文件有用例锁两侧）。

## 失败与并发路径 <!-- serves: FR-6 -->

**填写要求**：每条写"发生什么 → 看到什么"。本节是本需求**自己的**新必填节，按同一标准写。

- **失败路径（判据自身失效）**：
  - 探针扫不到（工作区根不对 / 需求目录不存在）→ **不是**判绿，而是 `exit 2` + 用法，
    与"缺口 0"区分（`0 绿 / 1 有缺口 / 2 不可用`三态）。
  - 表头词法漂移（计划文档任务表列名改了）→ 任务表读不出来 → 硬判**拒绝**并点名"没有任务表"，
    不会静默放行（同口径复用模板探针的词法）。
  - 无法解析的读数（`createdAt` 不可得、设计目录不存在）→ **不判**（宁可少报，不误报存量）。
- **并发与重复（同一动作并发发起）**：
  - 同一窗口重复提交同一份需求文档 → 幂等命中（`registered: false`），软提示不重复刷屏。
  - 同一需求两个窗口同时 `reqboard_submit(kind=plan)` → 由既有的确认门挂起票拦住后到者
    （返回 `REQBOARD_CONFIRM_PENDING`），台账零改动。
  - 反向演练脚本在**共用工作树**上改文件时会先备份 + 检测并发写入（他人改过就不回写），
    避免把别的窗口在制的改动覆盖掉。
- **状态机（本需求改的判据本身有状态轴）**：卡状态 `todo / in_progress / done / canceled`
  对红标判据是非对称的（`todo` 与 `canceled` 永不标）；新增状态时必须回来改这两份同源实现。
- **写路径（半成品谁清理）**：
  - 反向演练的临时改动必须**逐字节还原**（`reverse-drill-matrix` 备份 + sha256 复核；
    探针 `--specimen` 在 `mkdtempSync` 临时树里跑，`finally` 整棵删掉）。
  - `pnpm kb:build` 重生成的 `docs/knowledge/**` 必须与源码零漂移（否则 `pnpm kb:check` 红）。
- **确实不适用的部分**：本需求不改数据库与外部接口，故"数据畸形 / 网络中断"两类不适用。

## 边界（不做什么） <!-- serves: FR-1 -->

**填写要求**：列出容易被误解为"应该做"的事，每条带理由。

- **不做存量追溯**：不改写任何存量需求文档、不批量跑设计坐标探针、不给存量需求补 `sides` 或
  补「失败与并发路径」节。原因：规则生效前立项的需求不该被追着改（那是把系统债转嫁给当时的人）；
  新规则一律按 `createdAt` 判定（`DOC_QUALITY_RULES_SINCE`）。
- **不碰验收单 / 原型门 / 归档校验 / 回归测试基线**：本次只动文档门禁、模板、拆分落库校验这一片；
  改验收单与归档会与并发窗口（同一工作树）在制的工作冲突，且它们各有自己的判据链。
- **不把条款判据做成硬门**：判据质量人才能定，硬拦只会换来"写废话糊门禁"；机械层只判"有没有"。
- **不给设计文档做逐字实现比对**：只判"路径可达 + 源码类落点被提到"，不判设计与实现逐字一致
  （那需要语义理解，机械层做不到，硬做会制造大量假红）。
- **不新增 package.json script 给设计坐标探针**：加了就要同步知识层 C-NN 条目与 INDEX 预算
  （INDEX 已超 8000 字符预算的既有红）；它按需 `--req` 跑，登记在 `operations.ts` 的 EXCLUDED。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

<!-- 门禁在 brainstorming → design 逐条校验：五列齐 + 编号连续唯一 + 「影响 FR」命中真实条款。 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 用户在本窗口立项弹框作答（2026-10-06 20:16 UTC，原话：「按底稿开工」） | 按委派底稿开工，四面缺口一次做完；不另开分支需求 | FR-1、FR-2、FR-3、FR-4 | 本需求 8 条 FR 全部落地并各有反向演练（见各 FR 的验收标准） |
| D-2 | 用户消息（2026-10-06 20:16 UTC，原话：「继续」） | 立项（feature / expert）并把已完成的改动台账化；文档落 `docs/requirements/REQ-261006211623-9dc1/` | FR-1、FR-2、FR-3、FR-4 | `reqboard_status` 显示本窗口绑定本需求，本文档落盘并经 `reqboard_submit(kind=requirement)` 登记 |
| D-3 | 委派底稿（产物质量体检窗口投递，2026-10-06，原话：「refs 门禁收敛为单口径（「文档对照表满足」与「卡上必须有 refs」只能留一个，并说明理由）」） | 留「卡上必须有 refs」：删掉覆盖门禁的文档对照表通道，文档表降级为人读汇总 + 存量回填通道 | FR-5 | `tests/clause-coverage-gate.test.ts` 的「只补文档表 → 仍被拒」用例；`plan-landing-parity` 断言 refs 来源为 explicit |
| D-4 | 委派底稿（同上，原话：「模板加「失败与并发路径」节（状态机/写路径类需求必填）」） | 实现形态改为**按需求创建时间的提交期硬门**，**刻意不进 `CATEGORY_DELTAS`**（进去会让 `missingCategoryDocs` 追溯存量） | FR-4 | `tests/doc-quality-gate.test.ts`：新需求缺节拒、存量需求放行；`pnpm templates:check` 双向锁模板 |
| D-5 | 委派底稿（同上，原话：「存量需求不追溯、不改写」） | 两条硬门一律按 `DOC_QUALITY_RULES_SINCE` 判定；探针只在 `--req` 时按需跑，不批量扫存量 | FR-2、FR-3、FR-4 | 存量实测：78 个有 design/ 的需求 18 绿 / 60 红，**未改任何存量文档**（`git status -- short docs/requirements/` 除本需求目录外无改动） |
| D-6 | agent 复核子代理实现（2026-10-06 20:4x，委派底稿要求「反向演练必须自己跑」） | 打回 `chainMissing` 的一处静默放松：`in_progress` 且未声明 `stages` 的卡原本会标红，新写法会放过 → 改回分状态不对称判据 | FR-6 | `tests/card-layer.test.ts` 新增「`in_progress` 未声明仍标红」防腐烂回归用例 + 「`done` 未声明不标」用例 |

## 验收标准（整体） <!-- serves: FR-1 -->

- [ ] `pnpm templates:check` → `模板 25 份 OK 25；需求模板 6 类双向一致；exit 0`
- [ ] `pnpm prompts:verify` → `[check-prompt-fragments] OK`（改了注入片段即必须重生成产物）
- [ ] `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` → `缺口 0；exit 0`（9 项判据）
- [ ] `npx tsx scripts/design-coord-probe.mts --specimen` → `exit 0`（5/5 反例按预期变红）
- [ ] `npx tsx scripts/reverse-drill-matrix.mts --group hard` → `exit 0`（8/8，含本次新增 drill）
- [ ] `npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts tests/plan-doc-table.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint.test.ts tests/plan-footprint-tool-schema.test.ts tests/card-layer.test.ts tests/query-report.test.ts tests/clause-coverage-gate.test.ts tests/design-coord-probe.test.ts` → 全绿
- [ ] 三条反向演练各一条：删条款判据锚点 → 软提示点名；改坏设计路径 → 探针 exit 1；
      写 `sides: [doc]` → 提交被拒
- [ ] `pnpm kb:check` 的非本次项如实说明（K1 INDEX 超预算为既有红：HEAD 已 8189 > 8000 字符）

## 依赖与约束 <!-- serves: FR-1 -->

- **同工作树有并发窗口**（archive/reconcile、capture/create、accept-sheet、client 面板、
  workspace-root 重构）：全量基线集合差里新增的 48 条失败全部落在那些并发面，本需求改动 0 条新增
  （判读方法：`vitest --reporter=json` + `docs/reviews/test-baseline.failures.txt` 做集合差）。
- 复核入口：`docs/reviews/doc-quality-gates-2026-10-06.md`（逐条命令与输出摘要）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t-fe268e、t-079d43 |
| FR-2 | ✅ 已接收 | t2、t-80e73f、t-079d43 |
| FR-3 | ✅ 已接收 | t1、t-fe268e、t-079d43 |
| FR-4 | ✅ 已接收 | t1、t-fe268e、t-079d43 |
| FR-5 | ✅ 已接收 | t3、t-7ac50a、t-079d43 |
| FR-6 | ✅ 已接收 | t4、t-7cc3c1、t-079d43 |
| FR-7 | ✅ 已接收 | t3、t-7ac50a、t-079d43 |
| FR-8 | ✅ 已接收 | t3、t-7ac50a、t-079d43 |

> 无未接收条款（8 条全部有落点）。

<!-- reqboard:marks:end -->
