# 后端设计（REQ-261006211623-9dc1）<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> 本文是**服务端面**设计：两条判据链的顺序与短路点、错误码、取数单点、不变式、可跑证据。
> 每条结论指到 `文件:行` 或一条可跑命令；**不含任务批次**（批次属于拆分阶段产物）。
> 本轮只写设计文档，未改任何代码；下文的"读数"标注了来源（复核材料已实测 / 设计期预期）。

## 服务端判据链 <!-- serves: FR-1, FR-3, FR-4, FR-5, FR-7, FR-8 -->

两个入口都在 `src/application/use-cases/SubmitArtifact.ts`：`:61` `submitRequirementArtifact`、
`:249` `submitPlanArtifact`。共同纪律：**全部硬门在 `mutate` 之前**——拒绝时台账与磁盘零副作用，
"补完重调本入口"永远是一条干净的重试。

### brainstorming 面（需求文档提交） <!-- serves: FR-1, FR-3, FR-4 -->

顺序 + 短路点（括号内为 `SubmitArtifact.ts` 行号；任一硬门失败即返回，不再往后走）：

```
submit(kind=requirement)
 0. 入参归一 + 取本窗口绑定中的进行中需求           (:64-84)
      └─ REQBOARD_NO_BOUND_REQ / REQBOARD_NOT_BOUND_TO_WINDOW / REQBOARD_REQUIREMENT_NOT_FOUND
 1. 阶段纪律：status 必须 === 'brainstorming'        (:90-96)
      └─ REQBOARD_BAD_STATUS
 2. 路径可打开性 assertArtifactOpenable              (:100-103, design-gates.ts:79)
      └─ REQBOARD_ARTIFACT_NOT_OPENABLE（空串 / 含 .. 或反斜杠 / 不存在）
 3. 格式门 checkRequirementDocFormatGate             (:107-110)
      └─ requirement_missing_clauses / requirement_clause_sequence_gap / requirement_clause_duplicates
      └─ 早退：isLegacy（artifacts 为空即跳过）——**首次提交正是这一档**，故下面两道门独立
 4. 端侧声明门 sidesGateFailure                      (:120-123, content-gate-wiring.ts:492)
      └─ requirement_sides_invalid   [硬]  ← FR-3
 5. 必填节门 docSectionGateFailure                   (:127-130, content-gate-wiring.ts:529)
      └─ requirement_section_missing  [硬]  ← FR-4
 6. 软提示（**不短路**，只进回执）                    (:135-136 → 出键 :225-226)
      ├─ readability_warnings
      └─ clause_criteria_warnings    [软]  ← FR-1
 7. 变更留痕：已确认过再交 ⇒ change_note 必填        (:151-162)
      └─ REQBOARD_CHANGELOG_REQUIRED
 8. mutate：registerArtifact（幂等）→ 留痕评论 → 作废旧确认 / 标记下游待同步 → stampCheckpoint
 9. 返回体：registered（幂等命中 false）+ auto_confirm + 软提示
```

三条设计取舍，各有实测依据：

- **端侧门与节门独立于格式门**（第 3 步 vs 第 4/5 步）：格式门有 `isLegacy` 早退
  （`content-gate-wiring.ts:416`，`artifacts` 空即返回），而"最该管的那次"恰是首次提交；
  且格式门被 `STAGE_GATE_PROBES` 当时点探针复用，并进去会把端侧语义外溢到别的时点读数
  （`content-gate-wiring.ts:480-491`）。
- **软提示放在硬门之后**：能提交的文档才需要读提示；被拒的文档连回执都没有，
  提示会在"修完再交"时自然出现。
- **软提示"非空才出键"**：条款都带判据时 `clause_criteria_warnings` 键整体省略
  （与 `readability_warnings` 同口径，`SubmitArtifact.ts:225-226`），调用方只有一种判空写法。

### decomposing 面（计划文档提交） <!-- serves: FR-5, FR-7, FR-8 -->

```
submit(kind=plan)
 0a. 入参归一：path / summary 非空                    (:257-258)
       └─ REQBOARD_INVALID_INPUT
 0b. tasks 解析 normalizePlanTasks                    (:263, protocol.ts:1107)
       └─ REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED   [硬] ← FR-7（:1149-1159）
       └─ REQBOARD_BAD_REQUIREMENT_REF（refs 非法）/ REQBOARD_TEMPLATE_CONFLICT（stages 与 template 冲突）
       └─ bad()：key 重复 / 依赖前向引用 / 标题空 / 验收与实施方案缺失
 1. 绑定 + 阶段纪律：status 必须 === 'decomposing'     (:266-292)
       └─ REQBOARD_NO_BOUND_REQ / REQBOARD_NOT_BOUND_TO_WINDOW / REQBOARD_REQUIREMENT_NOT_FOUND / REQBOARD_BAD_STATUS
 2. 计划变更留痕：已批准过再交 ⇒ change_note 必填      (:295-302)
       └─ REQBOARD_CHANGELOG_REQUIRED
 3. 路径可打开性                                      (:305)
 4. 编号串联门 checkNumberChainGate                   (:310-313)
       └─ dangling_reference（serves 引用了不存在的编号）[硬]
 5. 设计章节 serves 门 checkDesignServesGate          (:315-318)
       └─ design_orphan（H2 章节缺 serves 标注）      [硬]
 6. 分类文档集 missingCategoryDocs                    (:321-343)
       └─ REQBOARD_MISSING_REQUIRED_DOC（必填节 + 必交设计文档）[硬]
 7. 条款覆盖门 assertClauseCoverageGate               (:347-353, content-gate-wiring.ts:163)
       └─ requirement_uncovered        [硬] ← FR-5：covered **只**取 :181 的卡上 refs
       └─ prototype_anchor_missing     [硬]（UI 卡原型锚点维，同一判定单点）
 8. 文档任务表硬判（tasks.length > 0 且文档读得到）    (:363-398, plan-doc-table.ts)
       └─ plan_doc_task_table_incomplete（无任务表 / 表未覆盖 tasks[].key 全集）[硬] ← FR-8
 9. 超容量标记门 checkOverCapacityMarkerGate          (:407-413)
       └─ plan_overcapacity_marker_missing（enforce 档）[硬]
10. mutate：req.plan = { path, summary, tasks, submittedAt } + 登记 decomposition 产物 + 自动批准弹框
11. 软读数（**不短路**）                                (:482-505)
       ├─ dependency_warnings = 文档→数组方向（plan-deps-check.ts:47）
       │                      + 零交集依赖边（plan-deps-check.ts:82）[软] ← FR-7
       ├─ marker_warnings（markerGate='warn' 档）
       └─ plan_doc_warnings（任务表缺列）[软] ← FR-8
```

关键短路取舍：

- **任务表硬判只在 `submitPlanArtifact`**（`tasks.length > 0`）：`reqboard_decompose` 的创作路径
  不经它，故**不留豁免口**——不需要逃生舱（复核材料 §6.1）。
- **文档读不到时不判**（`SubmitArtifact.ts:366-369`）：IO 故障不伪装成"文档缺任务表"，
  路径存在性已由第 3 步把关。
- **第 7 步在第 8 步之前**：先确认"每条条款有落点"，再确认"批准人看得见这些卡"；
  顺序反了会让人先补文档表、再被覆盖门拒一次（两次返工）。
- **第 0b 步最靠前且不依赖台账**：它是纯解析（`protocol.ts:1107`），两条入口
  （`submit` 与 `reqboard_decompose`）共用同一份，跳联调理由因此"在同一处判"。

## 错误码表 <!-- serves: FR-3, FR-4, FR-5, FR-7, FR-8 -->

强度：**硬** = 拒绝且零副作用；**软** = 只进回执键。码的联合类型唯一键控点是
`src/application/internal/artifact-gates.ts:132-186`（传输码映射与 HTTP 状态表都以它为源）。

| 码 | 触发条件 | 强度 | 修复锚点 |
|---|---|---|---|
| `requirement_sides_invalid` | feature / refactor 的 `requirement.md` front-matter 缺 `sides`、写空串、或含 `frontend` / `backend` 之外的值（`category-doc-sets.ts:152`） | 硬（仅 `createdAt ≥ DOC_QUALITY_RULES_SINCE`） | 写 `sides: [frontend]` / `[backend]` / `[frontend, backend]` / `[]`（显式声明无端侧改动）；文案给的正是这四种写法（`content-gate-wiring.ts:507`） |
| `requirement_section_missing` | 新需求（同样按 `createdAt`）的 `requirement.md` 缺「失败与并发路径」节，且类型是 feature / refactor（`content-gate-wiring.ts:529-547`） | 硬（同上；存量不判） | 照 `templates/brainstorming/{feature,refactor}.md` 同名节补：失败路径 / 并发重复 / 状态机非法迁移 / 写路径半成品谁清理；**确实不适用就写「不适用：<理由>」保留节，不要删节** |
| `requirement_uncovered` | 需求条款既没被任何卡用 `requirement_refs` 接收、也没标「本轮不做」（`content-gate-wiring.ts:163-202`） | 硬 | **唯一可执行路径**：在 `submit(kind=plan)` 的 `tasks[]` 里给每张卡写 `requirement_refs:["FR-N"]`；计划文档的覆盖对照表仍建议写（人读汇总 / RTM 的样子），但它**不再是门禁依据**——只补文档表 = 门禁依旧红 |
| `plan_doc_task_table_incomplete` | 提交的那份计划文档里找不到任务表（表头应含「计划 key」），或表里的 key 覆盖不了 `tasks[].key` 全集（`SubmitArtifact.ts:371-398`，词法在 `plan-doc-table.ts:23`） | 硬 | 照 `templates/decomposing/decomposition.md` 的任务表补行（列名逐字照抄，第一列「计划 key」与 `tasks[].key` 一致），或从 `tasks[]` 里删掉不打算做的卡；补完重调入口 |
| `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED` | 某张卡 `skipIntegration: true` 但没给 `skipIntegrationReason`（`protocol.ts:1149-1159`） | 硬（带 code 抛错，与 `REQBOARD_TEMPLATE_CONFLICT` 同形态） | 在 `tasks[]` 里该卡补 `skipIntegrationReason`：一句话说明"为什么这张卡没有接口面、靠什么判断"（纯文档卡 / 无调用方 / 不进 HTTP 边界 / 只改 CI 脚本） |
| `dangling_reference` | 文档里的 serves 引用了需求里不存在的编号（`content-gate-wiring.ts:741-757`） | 硬 | 改 serves 指向真实条款，或回需求文档补该条款 |
| `design_orphan` | 设计文档的某个 H2 章节缺 serves 标注（`content-gate-wiring.ts:289-315`） | 硬（plan 提交期） | 标题行补 `<!-- serves: FR-# -->`（多值逗号分隔）；不服务任何条款的章节删掉或合并 |
| `prototype_anchor_missing` | UI 需求（feature / refactor 且 sides 含 frontend）的 `side === 'frontend'` 卡缺原型锚点，或锚点不是 `prototypes/INDEX.md` 的权威行（`content-gate-wiring.ts:249-263`） | 硬 | 计划文档任务表补「原型锚点（UI 卡必填）」列，或在 `tasks[]` 写 `prototypeRefs:["prototypes/x.html#FR-N"]`；非 UI 卡显式声明 side |
| `REQBOARD_MISSING_REQUIRED_DOC` | 该类型必填节或必交设计文档未交齐（`SubmitArtifact.ts:330-342`，判定 `category-doc-sets.ts:309`） | 硬 | 按模板补文档/章节；确实不适用的在需求 front-matter 写 `design_exempt=<文件名>=理由` |
| `plan_overcapacity_marker_missing` | `enforce` 档下超容量卡在计划文档里没有「⚠️超容量(建议N批)」标记（`content-gate-wiring.ts:992-1030`，判定 `:939`） | 硬（`warn` 档降级为 `marker_warnings`） | 按分批建议在文档任务表该卡行标出建议批数 |
| `REQBOARD_CHANGELOG_REQUIRED` | 需求文档已人确认过 / 计划已批准过，重交未给 `change_note`（`SubmitArtifact.ts:155`、`:296`） | 硬 | 传 `change_note`（改了什么 / 为什么）；旧确认或旧批准随之作废 |
| `REQBOARD_BAD_STATUS` | 提交的阶段与当前 `status` 不符（需求必须是 `brainstorming`、计划必须是 `decomposing`） | 硬 | 按回执指明的阶段重来；计划要改也在拆分阶段重交 |
| `REQBOARD_BAD_REQUIREMENT_REF` | `requirement_refs` 出现非法编号形态（`protocol.ts:1169-1172`） | 硬 | 改成 `FR-N` 形态（编号形态与需求文档条款定义位同源） |
| `REQBOARD_ARTIFACT_NOT_OPENABLE` | 路径为空 / 含 `..` 或反斜杠 / 磁盘上不存在（`design-gates.ts:79-96`） | 硬 | 改为工作区内真实相对路径（不带 `..` 与反斜杠） |
| `REQBOARD_CONFIRM_PENDING` | 同需求已有在制的确认票，后到的写路径被拦（并发窗口） | 硬 | 等前一张票作答，或凭 ticket 调 `reqboard_confirm_receipt` 取回执 |

## 读法与取数单点 <!-- serves: FR-5, FR-6 -->

**卡上 `requirementRefs` 是下游唯一读点**——三处下游各只有一条读法，且都只认
`TaskRecord.requirementRefs`（无一处读计划文档的覆盖对照表）：

| 下游 | 读点 | 形态 |
|---|---|---|
| RTM 数据 | `src/application/internal/rtm-integration.ts:32` `generateRTMData` | 由 `plan-landing.ts:361` 在落库后调用 |
| 结单证据锚定 | `src/application/internal/content-gate-wiring.ts:719` `doneEvidenceAnchorFailure`（判据 `:692` `evidenceAnchorGap`） | 结单时逐条核对证据能不能定位到条款 |
| 条款接收状态 | `src/application/internal/plan-landing.ts:334` → `use-cases/SyncRequirementMarks.ts`（`syncRequirementMarks`） | 决定 RTM 上哪条条款显示"已接收" |

**文档覆盖表为什么降级为人读汇总**（`content-gate-wiring.ts:95-119`、`plan-refs.ts:74-79`）：

1. 下游三处都只读卡上 refs，文档表**没有任何消费方**；
2. 把文档表当门禁依据 = 门禁读 A、下游读 B ⇒ 造出"门禁绿、卡上全空"的静默缺口
   （实测落库率 28%，复核材料 §1.4 第 1 条）；
3. 门禁要收的是**落库那一刻的事实**，而文档表只是人读的汇总。

文档通道**保留但收敛**：`plan-refs.ts:80-87` 只在显式 refs 全空时补齐，来源标记为 `'doc'`
（`RefSource:22` 三值 `explicit` / `doc` / `none`），供"规则生效前已批准的老计划"回填——
它不是第二处判据，是取数兜底，且 `tests/reqboard/plan-landing-parity.test.ts` 断言新计划来源为 `explicit`。

## 不变式 <!-- serves: FR-4, FR-6, FR-7 -->

| 不变式 | 内容 | 唯一实现 / 证据 |
|---|---|---|
| INV-A · `stages: []` 是显式 solo | 显式空数组 = "这张卡不要子卡链"，**永不**标红；不声明 `stages` 与 `stages: []` 语义不同 | `QueryDag.ts:70`、`progress-bar.ts:203`（两份逐字同源） |
| INV-B · 红标判据分状态**非对称** | `in_progress` + 0 子卡 → 标（**未声明 stages 也算**，与旧行为逐字一致，不放松）；`done` + 0 子卡 → **仅显式非空 `stages`** 才标（存量 done 不噪声）；`todo` / `canceled` → 永不标 | `QueryDag.ts:67-74`、`progress-bar.ts:200-207`；三份测试各覆盖四态 |
| INV-C · 存量豁免按创建时间 | 两条新硬门只对 `createdAt ≥ DOC_QUALITY_RULES_SINCE`（`DocQualityRules.ts:20`，2026-10-06T12:00:00Z）的需求生效；`createdAt` 不可得 → **不判**（宁可少报，不误报存量） | `DocQualityRules.ts:28`；`content-gate-wiring.ts:497`、`:534` |
| INV-D · 必填节走提交门而非类型 DELTA | 「失败与并发路径」刻意不进 `CATEGORY_DELTAS`：DELTA 会被 `missingCategoryDocs` 在拆分提交 / 设计门 / 文档自检上复用到存量需求上 = 追溯 | `content-gate-wiring.ts:515-528`、`category-doc-sets.ts:244` 注释、`scripts/doc-section-parity.mts:103` |
| INV-E · 理由不落 `TaskRecord` | `dep_reasons` 与跳联调理由随 `PlanRecord.tasks` 可查，不再搬一份到任务卡（多一处会漂移的真相） | `protocol.ts:736`、`:1146-1165`；复核材料 §6.4 |
| INV-F · 拒绝即零副作用 | 全部硬门在 `mutate` 之前；拒绝时台账 / 产物 / 评论零改动 | `SubmitArtifact.ts:105-136`、`:305-413` |
| INV-G · 软提示不刷屏 | 软键**非空才出**；幂等重交 `registered:false`，不重复登记 | `SubmitArtifact.ts:147-149`、`:225-226`、`:503-505` |
| INV-H · 词法同源 | 任务表表头词法（含「计划 key」）在 `plan-doc-table.ts:23` 与 `scripts/template-gate-probe.mts` 的 decomposition 分支必须一致：同一件事在全仓只能有一份词法 | `plan-doc-table.ts:14-15` 的注释 + `pnpm templates:check` |
| INV-I · 理由必填只一条 | 唯一的"理由必填"硬判是跳联调（`REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`）；依赖边理由只是软点名——机器不再判理由写得好不好 | `protocol.ts:1077`、`plan-deps-check.ts:80` |

**新增状态时必须回来改两份同源实现**（INV-A/B 的运维口径）：`chainMissing` 的两份实现
（服务端 + 看板）对状态轴非对称，任何新状态若不显式归入某一侧，就会出现
"看板标了、详情页没标"。两处注释正互指对方（`QueryDag.ts:64-65`、`progress-bar.ts:196-198`）。

## 可观测读数与证据命令 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

每条判据都有**一条能红的命令**。下表与 `requirement.md` 各 FR 的验收标准一一对齐；
"读数来源"列如实标注：`复核` = `docs/reviews/doc-quality-gates-2026-10-06.md:98-123` 已记录实测输出，
本轮（设计阶段）未复跑，不改代码。

| 判据 | 命令 | 期望读数 | 对齐 | 读数来源 |
|---|---|---|---|---|
| 条款判据软门禁 | `npx vitest run tests/clause-criteria.test.ts` | 9 passed（含"删掉锚点必须报警"） | FR-1 验收 1 | 复核（12 文件 156 用例全绿） |
| 软键两侧 | `npx vitest run tests/doc-quality-gate.test.ts` | 11 passed；有缺口出 `clause_criteria_warnings`、无缺口整体省略 | FR-1 验收 2 | 复核 |
| 端侧硬门 | `npx vitest run tests/sides-declaration.test.ts` | 10 passed；写 `sides: [doc]` → 码 `requirement_sides_invalid` | FR-3 验收 1 | 复核 |
| 模板双向 | `pnpm templates:check` | `模板 25 份：OK 25 / FAIL 0；缺口 0`；`需求模板 6 类：OK 6 / FAIL 0；双向漂移 0`；exit 0 | FR-3 验收 2、FR-4 验收 2 | 复核（`:99-101`） |
| 必填节硬门 | `npx vitest run tests/doc-quality-gate.test.ts` | 11 passed；删节 → 码 `requirement_section_missing`；存量（`createdAt` 早于规则起点）放行 | FR-4 验收 1、2 | 复核 |
| 覆盖门单口径 | `npx vitest run tests/clause-coverage-gate.test.ts` | 全绿；"只补文档表"用例**必拒**并点名 gaps；"卡上写了 refs → 放行" | FR-5 验收 1 | 复核 |
| 落库读数同口径 | `npx vitest run tests/reqboard/plan-landing-parity.test.ts tests/reqboard/board-plan-approve.test.ts` | 全绿（refs 来源断言为 `explicit`） | FR-5 验收 2 | 复核 |
| 子卡链四态 | `npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts` | 全绿；含"`in_progress` 未声明仍标红"与"`done` 未声明不标" | FR-6 验收 1 | 复核 |
| 依赖与联调理由 | `npx vitest run tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts` | 全绿；四例（零交集点名 / 有理由放行 / 有交集不误报 / 数组→map 落台账）+ 缺理由被拒 | FR-7 验收 1、2 | 复核 |
| 文档任务表 | `npx vitest run tests/plan-doc-table.test.ts` | 10 passed（读表口径 + 两条硬判 + 软判三条）；缺列 → `plan_doc_warnings` 非空且 `success: true` | FR-8 验收 1、2 | 复核 |
| 设计坐标探针自证 | `npx tsx scripts/design-coord-probe.mts --specimen` | 5/5 按预期；反例①把坐标改成磁盘上不存在的伪造文件 → exit 1 并点名该坐标；整体 exit 0 | FR-2 验收 1 | 复核（`:109`） |
| 设计坐标探针（存量照实报） | `npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a` | exit 1，点名一条存量失效坐标（`src/domain/queue/` 下的 `normalizeQueueFile.ts`，真实文件是 `normalizeQueue.ts`；探针输出原文见复核材料 `:111`）；未改任何存量文档 | FR-2 验收 2 | 复核（`:110-113`） |
| 设计坐标探针（本需求·本两册自检） | `npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` | 实测（本窗口跑过一次）：`路径 token 77（真实存在 56 / 书写法白名单 19）；缺口 路径 2 + 回写 0`——**2 条缺口全部点名同需求的 `design/interfaces.md`，`architecture.md` / `backend.md` 贡献 0 条** | FR-2（本设计文档的自检） | **实测**（输出摘要见本行；`interfaces.md` 由另一窗口在制，归其作者修） |
| 探针不可用态 | `npx tsx scripts/design-coord-probe.mts --req`（缺值）/ `--root /nope` | exit 2 + 用法（与"缺口 0"明确区分） | FR-2（三态口径） | 代码锚点：`design-coord-probe.mts:68-69`、`:555`、`:700-705` |
| 反向演练矩阵 | `npx tsx scripts/reverse-drill-matrix.mts --group hard` | 8/8 ✅，含"改坏设计坐标"那条；还原逐字节 + sha256 一致 | FR-2 验收 3 | 复核（`:115-116`） |
| 层边界 | `npx vitest run tests/layer-boundary.test.ts` | 全绿（domain 不依赖 application；application 不 import client） | FR-6（两份同源的结构前提） | **设计期预期**：该文件不在复核材料 §2 的 12 文件批次内（`:118-122`），待实现后复跑 |
| 需求文档自检 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` | `缺口 0；exit 0`（9 项判据） | 整体验收 | 复核（`:106-107`，样本为另一需求） |
| 提示词片段重生成 | `pnpm prompts:verify` | `[check-prompt-fragments] OK`（改了注入片段即必须重生成产物） | 整体验收 | 复核（`:103-104`） |
| 知识层零漂移 | `pnpm kb:build && pnpm kb:check` | K7 绿；**K1（INDEX 超 8000 字符预算）如实报为既有红**（HEAD 已 8189 > 8000） | 整体验收 | 复核（`:174`） |

**怎么读"三态"**（避免把环境故障读成判绿）：探针的 `0 / 1 / 2` 分别对应
**绿 / 有缺口 / 不可用**（`design-coord-probe.mts:66-69`）；`--json` 出参里
`exitCode` 与 `gaps` / `observations` / `excludedTestPaths` 三者同时在场——
"观测 0"是**软轨**读数（词表外符号），**不等于**"设计没写符号"，更不改变退出码
（`:35-39`、`:852-863` 的 specimen 用例把这条锁住）。
