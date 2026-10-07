# 数据模型：台账加性字段、判定投影与读法单点（REQ-261006211623-9dc1） <!-- serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 本文只登记**数据的形状与读法**：新增了哪些键、缺省语义是什么、哪些判定**刻意不落库**、
> 零迁移与回滚怎么做、每个字段谁读、读不到时表现如何。字段名与类型逐条对照
> `src/shared/protocol.ts` 与 `src/application/internal/artifact-gates.ts` 写成。
> 契约面（签名 / 入参出参 / 错误码 / CLI）见 `design/interfaces.md`。

## 一、台账字段（加性变更） <!-- serves: FR-3, FR-4, FR-7, FR-8 -->

### 1.1 新增字段一览 <!-- serves: FR-7, FR-8 -->

| 字段 | 类型 | 宿主接口 | 写入点 | 缺省语义 | 向后兼容 |
|---|---|---|---|---|---|
| `skipIntegrationReason` | `string?` | `PlanTask`（`protocol.ts:719`） | `normalizePlanTasks`（`protocol.ts:1146`–`:1159`、`:1197`） | **键整体不带**（空串不写） | 旧计划不带该键仍合法；只有 `skipIntegration === true` 时才被要求 |
| `dep_reasons` | `Record<string, string>?` | `PlanTask`（`protocol.ts:736`） | `normalizePlanTasks`（`:1163`–`:1165`、`:1198`） | **键整体不带**（空 map 不写） | 旧计划不带该键 = 未给理由：零交集边**只点名不拒**，判定照常 |
| `requirement_sides_invalid` | `GateFailure['code']` 成员（`artifact-gates.ts:151`） | `GateFailure`（`:132`） | `sidesGateFailure`（`content-gate-wiring.ts:492`） | 不是台账字段——只在失败信封里出现 | 加进联合是**编译期**加性：既有码一字未动，无历史数据受影响 |
| `requirement_section_missing` | `GateFailure['code']` 成员（`artifact-gates.ts:153`） | 同上 | `docSectionGateFailure`（`content-gate-wiring.ts:529`） | 同上 | 同上 |
| `plan_doc_task_table_incomplete` | `GateFailure['code']` 成员（`artifact-gates.ts:162`） | 同上 | `submitPlanArtifact`（`SubmitArtifact.ts:372`–`:398`，两种形态**共码**） | 同上 | 同上 |

**新增码的条数口径（与"新增两码"说法的对照）**：`git diff` 显示本次改动给
`GateFailure['code']` 联合加了**三条**——`requirement_sides_invalid`（FR-3）与
`requirement_section_missing`（FR-4）是本需求**两条新门**的码（"两码"指的就是这两条），
外加 `plan_doc_task_table_incomplete`（FR-8，计划文档任务表硬判）；同一份工作树里另有
`prototype_placeholder` / `prototype_geometry_unverified` 两码来自**并发窗口**的
REQ-261006201649-cc89，**不属本需求**，本文不登记。

**加性的两条纪律（本仓已栽过的坑）**：
① **白名单搬运不带上新键 = 静默丢弃**——`normalizePlanTasks` 是按字段逐个搬运的，
新增字段必须在 `out.push({...})` 里显式带上（`stages` 与 `requirement_refs` 各栽过一次）；
② **`additionalProperties: false` 的工具 schema 不声明新键 = 绑定层直接拒收**——
故 `skip_integration_reason` / `skipIntegrationReason` / `dep_reasons` / `depReasons` **四个键都要声明**
（`SubmitTool.ts:88`–`:105`），只声明一种拼法会让另一种写法报"参数名写错"。

### 1.2 `PlanTask.skipIntegrationReason` 的缺省语义 <!-- serves: FR-7 -->

| 情形 | 台账形状 | 判定行为 |
|---|---|---|
| 给了 `skipIntegration: true` 且给了理由 | `skipIntegration: true` + `skipIntegrationReason: '<≤300 字>'` | 通过（**硬门在这一处**） |
| 给了 `skipIntegration: true` 但理由缺失 / 空串 / 全空白 | —（`normalizePlanTasks` 抛错） | **整份计划被拒**，码 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`：计划根本没落成 `PlanRecord` |
| 没给 `skipIntegration`（或 `false`）而写了理由 | `skipIntegration` 不带 + `skipIntegrationReason` 照实带 | 通过；理由留在计划里可查（不使用的声明不报错——它与开关是"成对"而非"绑定"） |

**不落 `TaskRecord`**：`plan-landing.ts:167` 只把 `d.skipIntegration === true` 搬进 `TaskRecord.skipIntegration`
（`protocol.ts:1783`，`boolean?`），**没有** `TaskRecord.skipIntegrationReason`
——理由留在 `PlanRecord.tasks`（见 §3.1 的理由）。

### 1.3 `PlanTask.dep_reasons` 的三种入参形态与归一 <!-- serves: FR-7 -->

**归一目标形状恒为 map**：`{ 上游计划 key: 一句话 }`。工具面只能表达**字符串数组**，
其余两种形态服务非工具入口与历史数据：

| # | 入参形态 | 来源 | 归一规则 |
|---|---|---|---|
| ① | 字符串数组：`["t2=上游建队列文件，本卡读它", "t4：虽无同名文件但有时序约束"]` | **工具 schema 的形态**（`dep_reasons` / `depReasons`） | 按**第一个** `=` / `：` / `:` 切成 key 与理由（理由正文里可以再出现等号 / 冒号）；key 截断 40 字、理由截断 300 字 |
| ② | 对象数组：`[{ key: "t2", reason: "…" }]` | 结构化写法（agent 更愿意写两栏时） | 键名容 `key` / `dep` / `up`，值名容 `reason` / `why`；命中其一即收 |
| ③ | 纯对象 map：`{ "t2": "…" }` | 非工具入口（HTTP / 台账直写 / 历史数据）与 `PlanTask` 自身的存储形态 | 逐键收取 |

**三个拼法取并集**：`dep_reasons`（主拼 snake）与 `depReasons`（兼容 camel）各归一次，
再 `Object.assign` 合并——同一条边在两种写法里各写一遍**不互相覆盖**；同一 key 冲突时
**camel 胜**（后写覆盖前写）。归一里所有"丢弃"都是软失败（key 空 / 值非字符串 / 值空串 → 丢该条），
**只有一条字段级硬判**（`skipIntegration` 的理由必填），理由：这里的键是"凭据"，
凭据格式手滑不该让人丢掉整张任务表。

### 1.4 `GateFailure['code']` 新增码的**加性**边界 <!-- serves: FR-3, FR-4, FR-8 -->

新码**不改**任何既有码的语义、**不合并**既有码：`plan_doc_task_table_incomplete` 同时覆盖
「文档里没有任务表」与「表覆盖不全」两种形态——它们**共码**（同一句话的两种失败：
"批准人没东西可批"与"批的东西不全"），靠 `what` 文本区分，`gaps` 不参与这两种形态；
反过来 `requirement_sides_invalid` 与 `requirement_section_missing` **不共码**：
前者是"值域 / 声明缺失"，后者是"节缺失"，共码会让人靠读 `what` 猜病因。

## 二、不变式 <!-- serves: FR-4, FR-6, FR-8 -->

### 2.1 `stages: []` = 显式 solo（唯一"不要子卡"的表达） <!-- serves: FR-6 -->

| 输入 | 语义 | 红标判据 |
|---|---|---|
| `stages: []`（显式空数组） | **显式 solo**：本卡不要子卡（`lazy-expand` 里只有这个值表示"不要"） | 永不打标（任何 `status`） |
| 不写 `stages` | "按卡 `phase` / 需求分类推默认链"——**不等于**不要链 | `in_progress` 打标（与旧行为逐字一致，非对称的防漏报一半） |
| 非空 `stages` | 计划里**白纸黑字声明过**要这些子卡段 | `done` 且 0 子卡 → 打标；`todo` → 不打（还没到懒展开） |

**非对称的理由**：两半刻意不对称——`in_progress` 防**漏报**（未声明也算期望有链，
与旧版 `in_progress && !(stages 是显式空数组)` 逐字一致，不许放松）；
`done` 防**误报**（不声明 `stages` 的存量 done 卡一律打标 = 大面积噪声，
噪声判据 = 没人看的判据）。`todo` / `canceled` 永不标。

### 2.2 红标是**投影读数**，字段依据是三元组 <!-- serves: FR-6 -->

判定只读三样东西，缺一样就得不出结论：

| 依据 | 来源 | 缺省读法 |
|---|---|---|
| `stages` | `TaskRecord.stages?: StageKind[]` | 缺省 = **未声明**（不是空数组）：`Array.isArray(stages) && stages.length === 0` 为假 ⇒ 显式 solo 不成立 |
| 子卡数 | `tasks.filter(x => x.parentId === t.id).length`（`QueryDag.buildDagNodes:86`） | 数为 0 才继续判；>0 立即 `false` |
| `status` | `TaskRecord.status` | 只有 `in_progress` / `done` 会进判据；其余一律 `false` |

**出参纪律**：`DagGraphNode.chainMissing?: boolean`（`protocol.ts:2937`）**只在为真时带键**
（`...(chainMissingOf(t, kids) ? { chainMissing: true } : {})`，`QueryDag.ts:98`）——
读侧必须用 `t.chainMissing === true` 判，不要用真值性判 `undefined` / `false`。
新增卡状态时必须回来改**两份同源实现**（`application/query/QueryDag.ts:67` 与
`client/dag/progress-bar.ts:200`；application 禁止 import client，`tests/layer-boundary.test.ts` 机械检查）。

### 2.3 存量判定的依据是 `createdAt` <!-- serves: FR-4 -->

| 不变式 | 实现 |
|---|---|
| 规则起点是**常量**且唯一 | `DOC_QUALITY_RULES_SINCE = Date.parse('2026-10-06T12:00:00.000Z') = 1791288000000`（`domain/workflow/DocQualityRules.ts:20`）。配置化会让"这条需求吃不吃新门"变成每次都要读一遍的运行时问题 |
| 判定单点 | `docQualityRulesApply(createdAt) = createdAt !== undefined && createdAt >= DOC_QUALITY_RULES_SINCE`（`:28`） |
| `createdAt` 不可得 → **不判**（`false`） | 旧台账记录 / 测试夹具都可能是这个形状；读数不可得时不判是既有口径（宁可少报，也不把存量误报成违规） |
| 两条门共用同一份判定 | `sidesGateFailure` 与 `docSectionGateFailure` 的第一行都是 `if (!docQualityRulesApply(createdAt)) return undefined` —— 各自写一个日期 = 两份真相 |
| 「失败与并发路径」节**刻意不进 `CATEGORY_DELTAS`** | DELTA 会经 `missingCategoryDocs` 在**拆分提交 / 设计门 / 文档自检**上对存量需求一起判 = 追溯（实测会让在飞老需求提交拆分计划时被新节拦住） |

## 三、不落库的判定（明确写"为什么不落库"） <!-- serves: FR-1, FR-6, FR-7, FR-8 -->

### 3.1 `dep_reasons` 只随 `PlanRecord.tasks` 可查 <!-- serves: FR-7 -->

| 项 | 结论 |
|---|---|
| 落库位置 | `RequirementRecord.plan.tasks[].dep_reasons`（`RequirementRecord.plan?: PlanRecord` 在 `protocol.ts:1583`；`PlanRecord` 在 `protocol.ts:786`–`:803`）；`PlanRecord.tasks` 是计划任务表的**权威副本** |
| 不落 `TaskRecord` 的理由 | 随 `PlanRecord.tasks` **已可查**，再搬一份只多一处会漂移的真相（判据消费方是计划提交那一刻的检查，不是运行期读卡） |
| 因此读它必须 | 走 `req.plan.tasks`（而不是 `listByRequirement` 出来的卡）；卡上**永远没有**这个键 |
| 旧计划（无 `dep_reasons`） | 被当作"未给理由"：零交集边照常点名，**不拒绝**（未声明 ≠ 违规） |

### 3.2 红标是投影读数，不是存储字段 <!-- serves: FR-6 -->

| 项 | 结论 |
|---|---|
| 存储字段 | **不存在**。`TaskRecord` 全无 `chainMissing`；台账里写不进这个判定 |
| 计算点 | `QueryDag.buildDagNodes`（查询时**现算**）：`chainMissingOf(t, kids)` 逐卡跑一次，出参进 `DagGraphNode.chainMissing` |
| 为什么不落库 | 它是**三元的函数**（`status` × 子卡数 × `stages`），三样都会在卡的生命周期里变：落库就必然过期，而过期的红标比没有红标更贵（人会照着一条陈旧的红去改东西）。查询现算 = 读数永远等于当下事实 |
| 下游派生 | 看板汇总条 `data-dag-chain-missing="N"`（`client/views/panels/dag.ts:211`）与卡面 chip（`node-panel.ts:281`、`stage-detail.ts:390`）都是同一个投影的再聚合，各自**不另判** |

### 3.3 条款判据缺口与计划文档缺列——**判定不落库** <!-- serves: FR-1, FR-8 -->

| 判定 | 落库 | 为什么不落库 |
|---|---|---|
| `clauseCriteriaGaps` → `clause_criteria_warnings` | **不落**：只进 `submit(kind=requirement)` 的回执与 `note` | 它是**提交那一刻文档**的读数；文档随人改写而变，落库的缺口列表立刻过期。要复核就重跑（纯函数，输入同一份文本结果同一份缺口） |
| `planDocColumnWarnings` → `plan_doc_warnings` | **不落**：只进 `submit(kind=plan)` 的回执 | 同上：缺列是披露问题，硬拒会把"先批后补文档"这条正常路径整条堵死，所以既不拒也不存档 |
| `zeroOverlapDependencyWarnings` → `dependency_warnings` | **不落**：判定在落库之后（`SubmitArtifact.ts:482`–`:490`）才跑 | 它是**给作者的复核提示**，不是台账事实；唯一被要求落库的凭据是作者写的 `dep_reasons`（那是**声明**，不是机器的判定） |

## 四、迁移与回滚 <!-- serves: FR-3, FR-4, FR-6, FR-7, FR-8 -->

### 4.1 零迁移（加性） <!-- serves: FR-7 -->

| 项 | 结论 |
|---|---|
| schema 版本 | **不 bump** `REQBOARD_SCHEMA_VERSION` / `QUEUE_VERSION` |
| 迁移脚本 | **无**：不补齐、不改写历史记录、不加进 `validateQueue.ts` 的必填字段清单 |
| 新键的缺省 | 键**整体不带**（不是 `''`、不是 `{}`、不是 `null`）——"未声明"与"声明了空值"必须是两种可区分的形状 |
| 唯一需要新增的读取兼容 | 读 `dep_reasons` 时只看 `req.plan.tasks`；读卡时**不查**该键（卡上本就没有，查了会得到 `undefined` 而不是报错——这正是要的） |

### 4.2 回滚方式 <!-- serves: FR-3, FR-4, FR-6, FR-8 -->

| 层 | 回滚动作 | 影响面 |
|---|---|---|
| 两条需求门（`sides` / 必填节） | 把 `docQualityRulesApply` 的返回改成 `false`（一处），或把 `DOC_QUALITY_RULES_SINCE` 推向未来 | 新需求不再被这两门拦；**已通过的文档不受影响**（门是纯读判定，不留痕） |
| 计划文档任务表硬判 | 摘掉 `SubmitArtifact.ts:363`–`:401` 那一段调用 | 回滚到"批准所见 ≠ 文档所见"的旧行为（**有代价**：文档空壳可以再次通过审批） |
| 跳联调理由硬门 | 摘掉 `protocol.ts:1149`–`:1159` 的抛错分支 | 已有理由的计划照旧带着理由（加性字段无副作用） |
| 红标判据 | 把两份 `chainMissing*` 的 `done` 分支改回 `false` | 只影响画布读数，**不碰台账**（投影本来就是现算的，回滚零数据动作） |
| 探针 | 删 `scripts/design-coord-probe.mts` + `operations.ts` 的 `EXCLUDED` 登记 | 它不进提交前清单、不新增 `package.json` script，回滚面最小 |

**共同点**：本次全部改动的判定都**不写台账数据**（只写两条计划任务的**声明**字段），
故每条回滚动作都不需要数据迁移或补偿。

### 4.3 旧台账（无这些字段）如何被判据对待 <!-- serves: FR-4, FR-7 -->

| 旧形状 | 判据行为 | 一句话口径 |
|---|---|---|
| 旧需求（`createdAt` 早于规则起点，或 `createdAt` 不可得） | `sides` / 必填节两门**整门跳过** | **存量不追溯** |
| 旧计划（`tasks[]` 不带 `dep_reasons`） | 零交集依赖边**照常点名**（软提示），不拒 | **未声明 = 不判定，不冒充 0** |
| 旧卡（`TaskRecord` 无 `stages`） | `done` **不打标**；`in_progress` 打标（与旧行为逐字一致） | 未声明 ≠ 明确声明"不要链" |
| 旧 `PlanTask`（无 `skipIntegrationReason`） | 只有它同时 `skipIntegration: true` 才会被问理由（旧计划本就落过库 = 当时无此规则，重交才受新规则约束） | 新规则只管**新提交**，不改历史记录 |
| `chainMissing` 读数 | 永远是查询现算，**没有"旧数据缺这个字段"这回事** | 投影读数天生零迁移 |

## 五、读法单点 <!-- serves: FR-1, FR-5, FR-6, FR-7, FR-8 -->

**一个字段只有一处权威读点**；下表是"谁读 → 读不到时表现"，用于排查"同一条数据两处读数不一致"。

| 字段 / 读数 | 权威写点 | 谁读（读点） | 读不到时的表现 |
|---|---|---|---|
| `TaskRecord.requirementRefs` | `plan-landing.ts:178`（经 `refsForLanding`，`sources` 标 `explicit` / `doc` / `none`） | ① RTM：`generateRTMData`（`rtm-integration.ts:43` 取 `t.requirementRefs ?? []`，`rtm-yaml.ts:76` 写成 `serves`）；② 结单证据锚定：`doneEvidenceAnchorFailure`（`content-gate-wiring.ts:719`，`collectTaskRefs` 取该卡的 refs）；③ 条款接收状态：`syncRequirementMarks`（`SyncRequirementMarks.ts:30` → `assembleRequirementMarks` → `collectReceiveRefs` 的 `ledgerTaskRefs` 分支）；④ 覆盖门禁（只读这一处） | 空数组是**有意义的口径**（不是缺省）：RTM `serves` 空、结单证据只能靠命令/路径锚点、接收状态回落「🔴 未被接收」。**门禁侧**在提交那一刻就拒（`requirement_uncovered`），所以新计划不会以"全空"落库 |
| `PlanTask.dep_reasons` | `normalizePlanTasks`（`protocol.ts:1163`–`:1198`，恒为 map） | 只有 `zeroOverlapDependencyWarnings`（`plan-deps-check.ts:96`：`t.dep_reasons?.[dep] !== undefined` ⇒ 放行） | `undefined` = **未给理由**：该边若零交集则进 `dependency_warnings`（软提示）。**不是错误**，不阻断落库 |
| `PlanTask.skipIntegrationReason` | `normalizePlanTasks`（`protocol.ts:1146`–`:1198`，空串不带键） | 批准人读计划（`PlanRecord.tasks`）；`TaskRecord` **不读**（未落库） | 只可能在"`skipIntegration` 为 false 而理由存在"这一无害形态下存在；真缺理由时提交已被拒，**读不到这件事本身不会发生** |
| `TaskRecord.skipIntegration` | `plan-landing.ts:167` | 子卡展开（跳过联调段） | `undefined` = 按卡 `side` / 需求分类默认是否需要联调 |
| `DagGraphNode.chainMissing` | 无（投影，查询现算：`QueryDag.buildDagNodes:98`） | ① 看板汇总：`client/views/panels/dag.ts:195`、`:211`；② 卡面 chip：`client/node-panel.ts:281`、`client/views/stage-detail.ts:390`（同一个 `client/dag/progress-bar.ts:200` 的 `chainMissing`） | 键**缺省 = 不打标**（读侧必须 `=== true`）；不会出现"读不到所以报错"——它是可选键，缺省即"没这个问题" |
| `GateFailure['code']`（三条新码） | 各自的门函数（`sidesGateFailure` / `docSectionGateFailure` / `submitPlanArtifact`） | 失败信封 + 传输码映射 + HTTP 状态表（三者都以该联合为**唯一键控点**） | 无"读不到"形态：码要么在信封里，要么这次提交成功了（软提示走回执键） |
| `clause_criteria_warnings` | `SubmitArtifact.ts:226`（非空才出键） | 调用方 / `note` 的人读文本 | **键缺省 = 没有缺口**（与 `readability_warnings` 同口径）；不要把它读成"没判过"——判定总在跑，只在有缺口时才有话说 |
| `plan_doc_warnings` | `SubmitArtifact.ts:505`（非空才出键） | 调用方 / 批准人 | 同上：键缺省 = 列齐（或缺到判不了：`found === false` 时返回空数组） |
| `dependency_warnings` | `SubmitArtifact.ts:503`（文档通道 + 零交集通道**并成一个键**） | 调用方 / 拆分者 | 键缺省 = 依赖面没发现问题；两个通道的点名在同一数组里，**不按来源分组**（调用方只该有一个"依赖面不对劲"的读数口） |
