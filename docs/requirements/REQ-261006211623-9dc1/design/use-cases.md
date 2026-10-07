# 用例设计（REQ-261006211623-9dc1）· 三条主用例与人的动作点 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

> **这份文件是什么**：从**用的人**那一侧描述本次门禁加固——谁、在哪个时点、做什么、
> 看到什么算通过、失败时看到什么。它是 `requirement.md` 的功能点清单与
> `design/test-cases.md` 的用例表之间的「人话桥」。
> **口径**：每条读数都指到一条可跑命令或一个错误码；判据本体见 `design/interfaces.md`，
> UI 契约见 `design/frontend.md`，命令清单见 `design/test-cases.md`。
> 本文**不含任务批次与依赖顺序**（那属拆分阶段产物，不进设计文档）。

## 一、用例总览 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

| 用例 | 谁 | 何时（阶段 / 节点） | 覆盖 FR | 「通过」的定义（一句话） |
|---|---|---|---|---|
| UC-1 写需求文档 | 需求方 / PM（agent 代笔，人确认） | brainstorming，`reqboard_submit(kind=requirement)` 之前 | FR-1、FR-3、FR-4 | 提交成功，且软提示**没有**点名任何条款；缺 `sides` / 缺节被当场拒 |
| UC-2 写设计文档并跑坐标探针 | 设计者（agent），复核人读输出 | design，人确认设计（G2）之前；**按需跑** | FR-2 | 探针 `exit 0`、缺口 0；坐标全部可达、源码类落点已回写模块地图 |
| UC-3 写计划文档、落库任务卡并看红标 | 拆分者 / 实施窗口 agent；人批准计划 | decomposing → implementing（落库与看板） | FR-5、FR-6、FR-7、FR-8 | 计划被批准并落库，卡上引用非空；「声明了子卡段却 0 子卡」的卡在看板标出 `[链未生成]` |

**三条用例合起来覆盖 8 条 FR**；每条 FR 至少出现在一条用例的「看到什么 / 失败时看到什么」里。

## 二、UC-1 写需求文档（含 `sides` 与「失败与并发路径」节） <!-- serves: FR-1, FR-3, FR-4 -->

| 维度 | 内容 |
|---|---|
| **谁** | 需求方 / PM；本仓常态是实施窗口 agent 代笔，人做确认（G1） |
| **何时** | brainstorming 阶段写 `docs/requirements/REQ-261006211623-9dc1/requirement.md`，提交那一刻判定 |
| **做什么** | ① front-matter 显式写 `sides`（合法值只有 `frontend` / `backend`；`[]` = 明确声明「无端侧改动」，缺 key 与写非法值都会被拒）；② 写「失败与并发路径」节（失败路径 / 并发重复 / 状态机非法迁移 / 写路径半成品清理），确实不适用就写「不适用：<理由>」**保留节**；③ 每条 FR 的定义行块内给一个可核验判据（命令 / 断言 / 可读数 / 明确取值）；④ 调 `reqboard_submit(kind=requirement)` |
| **看到什么** | 提交回执 `success: true`；条款都带判据时回执里**没有** `clause_criteria_warnings` 键（键非空才出）；有缺口时该键**逐条点名条款号**并在 `note` 里追加一句提示；`pnpm templates:check` 里那一条 `需求模板 6 类双向一致` 说明「照模板写就天然满足两条硬门」 |
| **失败时看到什么** | ① 缺 `sides` 或值非法 → 拒，码 **`requirement_sides_invalid`**，文案点名非法值与合法值域；② 新需求缺「失败与并发路径」节 → 拒，码 **`requirement_section_missing`**，文案给出模板路径与「写什么」；③ 两条都在 `mutate` 之前 ⇒ **台账零改动**，改完重交即可；④ 条款缺判据**不拒**（只软提示）——判据的**质量**人才能定，机械层只判「有没有」 |

**为什么软硬分明**：`sides` 写错与缺节的后果此前是**静默的**（条件必交设计文档永不触发、
顺利路径假设无人检查），属于「缺陷静默失效」，故硬拦；条款判据缺失属「判据质量」，
硬拦只会换来「写废话糊门禁」（本仓最贵的失败形态），故只提示。
出处：`src/application/use-cases/SubmitArtifact.ts:120`（sides 门）、`:127`（节门）、`:136`（软提示）、`:226`（出参键）；
`requirement.md:99`（为什么软）。

## 三、UC-2 写设计文档并跑坐标探针 <!-- serves: FR-2 -->

| 维度 | 内容 |
|---|---|
| **谁** | 设计者（agent）；复核人读探针的人读输出（`--json` 供机器消费） |
| **何时** | design 阶段，人确认设计（G2）之前；**按需跑**——不进提交前清单、不批量扫存量 |
| **做什么** | ① 写 `design/` 下的设计文档（本需求 = `frontend.md` / `test-cases.md` / `use-cases.md`，兄弟面见 `design/architecture.md`、`design/backend.md`、`design/interfaces.md`）；② 设计里点名的路径必须是**真实可达的坐标**；③ 实施期新增 / 改名的**源码类**落点（四个前缀：`src/`、`scripts/`、`packages`、`lib/`，见 `scripts/design-coord-probe.mts:270`）回写到 `design/architecture.md:78-113` 的「模块改动地图」节；④ 跑 `npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` |
| **看到什么** | `exit 0` + 「缺口 0」；每个路径 token 逐条 verdict 为 `exists`，或命中白名单且**带审计理由**；词表外符号只进 observations（软观测，不改退出码）；`--specimen` 5/5 证明「判据不空转」；`--json` 里缺口与观测分列，机器可断言 |
| **失败时看到什么** | `exit 1` + **逐条点名**：坐标缺口给「token ← 出处 `文件:行`」，回写缺口给「落点 ← 哪张任务卡」，并附可执行的修复锚点（改成真实路径 / 在模块改动地图补一行）；词表外符号**不判红**（实测同一需求 82 条词表外、真缺口 2 条——硬判会制造大量假红）。**存量需求的红是既知事实**，见第六节（D-5，不追溯） |

**边界（刻意不做）**：探针只判「路径可达 + 源码类落点被提到」，不判设计与实现逐字一致；
测试落点（`tests/`）不服回写判据，但**如实登记条数**（`excludedTestPaths`），不静默少判。
出处：`scripts/design-coord-probe.mts:565-574`（preflight）、`:642`（退出码）、`:453`（回写判据）。

## 四、UC-3 写计划文档、落库任务卡并看红标 <!-- serves: FR-5, FR-6, FR-7, FR-8 -->

| 维度 | 内容 |
|---|---|
| **谁** | 拆分者 / 实施窗口 agent 写计划；**人**点「批准计划」；落库后所有人读看板 |
| **何时** | decomposing 阶段提交计划（`reqboard_submit(kind=plan)`）→ 人批准 → 落库任务卡 → 看板显示 |
| **做什么** | ① 写计划文档：含**任务表**（表头含「计划 key」），表里的 key 覆盖 `tasks[]` 全集，列尽量齐（验收 / 工作量 / 依赖）；② **每张卡**在 `tasks[]` 里写 `requirement_refs`（覆盖门禁只认卡上这一条通道，文档对照表已降级为人读汇总）；③ 跳联调的卡写 `skipIntegrationReason`；④ 两端声明文件零交集却确需串行的依赖边，写 `dep_reasons`；⑤ 人批准后 `reqboard_decompose` 落库，看板读 DAG |
| **看到什么** | 提交成功；缺列才出 `plan_doc_warnings`（不拒）；零交集依赖边只在**没写理由**时进 `dependency_warnings`（点名不拒）；批准后卡落库、卡上 `requirementRefs` 非空（来源可观测为 `explicit`），`task_coverage` 与门禁同口径；看板 DAG 里「计划声明了子卡段却 0 子卡」的卡标红 `[链未生成]`——三处落点与四态判据见 `design/frontend.md` |
| **失败时看到什么** | ① 卡上没 refs（**只补文档覆盖对照表也一样**）→ 拒，码 `requirement_uncovered` 且 `gaps` 点名条款号，how 只给一条可执行路径（在 `tasks[]` 里写 `requirement_refs`）；② 文档没有任务表、或表里 key 覆盖不全 → 拒，码 **`plan_doc_task_table_incomplete`**（点名漏收的卡 key）；③ 跳联调缺理由 → 拒，码 **`REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`**；④ 硬拒一律在 `mutate` 之前 ⇒ 台账零改动；⑤ **红标不阻断任何流程**——`[链未生成]` 是给人看的读数，不是门 |

**为什么引用只认卡上那一份**：卡上 refs 是**下游唯一读点**（RTM 生成、结单证据锚定、
条款接收状态都只读卡上这一份）；文档表当门禁依据会造出「门禁绿、卡上全空」的静默缺口
（实测落库率 28%）。门禁要收的是**落库那一刻的事实**。出处：`requirement.md:171-176`、
`src/application/internal/content-gate-wiring.ts:163`、`src/application/internal/plan-refs.ts:75`。

## 五、人的动作点（G1 / G2 / 批准计划） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8 -->

| 人工门 | 在哪一步 | 触发什么 | agent **不能**代替的部分 |
|---|---|---|---|
| **G1 确认需求** | brainstorming → design | 确认需求产物 → 落章并推进到 design；未确认时 `reqboard_move` 被代码级拒绝 | 判据的**质量**：条款写得值不值得验；软提示只负责点名缺口，取舍在人 |
| **G2 确认设计** | design → decomposing | 确认设计产物 → 设计登记态转 confirmed；未登记 / 未确认时推进被拒（先跑 `reqboard_submit(kind=design)` 登记） | 设计坐标的**业务正确性**：探针只判「可达 + 已回写」，判不了「这条设计对不对、够不够」 |
| **批准计划** | decomposing → 落库 | 批准计划 → 落库任务卡并推进到 implementing；未批准时 `reqboard_decompose` 拒绝 | 依赖边**是否真的必要**、卡切得合不合手；机器只能点名「两端文件零交集、请给理由」 |

**共同点**：三道门都是**代码级人工门**（`human_gate`），agent 越权推进会被拒，报错里会说明当前角色与合法边；
`reqboard_ask_confirm` 缺省**阻塞等待**——人不作答，agent 就停在这一步，不会「先干起来再说」。
出处：`requirement.md` 的业务流程图（`:27-46`）与 `docs/reviews/doc-quality-gates-2026-10-06.md:180-191`（待裁定口径）。

## 六、异常路径：探针 `exit 2` 与 `exit 1`，以及存量需求为什么本来就会红 <!-- serves: FR-2, FR-3, FR-4 -->

**三态退出码的区别与处置**（与 `scripts/template-gate-probe.mts` 同款语义）：

| 退出码 | 含义 | 典型现场 | 处置 |
|---|---|---|---|
| `0` | 判据**全过** | 该需求 `design/*.md` 里全部坐标可达、源码类落点已回写 | 什么都不用做 |
| `1` | **有缺口** | 坐标与仓库布局脱钩（文件改名 / 迁移后无人回写）；源码类落点没进设计文档 | 逐条修：改成真实路径、或在模块改动地图补一行；确属「静态判不了的书写法」按白名单登记并写理由 |
| `2` | **环境或参数不可用**（**不是判绿**） | 需求目录不存在、`design/` 目录缺失或里面没有 `.md`、符号词表缺失、参数错（未知参数 / 缺值） | 先修环境与参数（补 `--req`、改对 `--root`），**绝不把 `2` 读成「过」** |

`exit 1` 与 `exit 2` 必须分开：`1` 的处置是「改文档」，`2` 的处置是「改环境」——混在一个码里，
人就会把「我路径写错了」当成「我的设计有缺口」。出处：`scripts/design-coord-probe.mts:78`、
`:555-564`（preflight 一律 `exit 2`，不静默跳过）、`:700-705`。

**探针在存量需求上会红（既知、不追溯）**：实测 78 个有 `design/` 的需求 18 绿 / 60 红
（`docs/reviews/doc-quality-gates-2026-10-06.md:141`）。处置是**不追溯**（D-5）：
不改写任何存量文档、不批量跑、不进提交前清单，只在改动 / 复核某条需求时按需 `--req`
（登记在 `src/domain/knowledge/operations.ts:189-192` 的 `EXCLUDED`）。
新规则的存量豁免一律按需求创建时间判定（`src/domain/workflow/DocQualityRules.ts:20` 的
`DOC_QUALITY_RULES_SINCE`）——**读不到 `createdAt` 就不判**（宁可少报，不误报存量）。

**反向演练脚本在共用工作树上的处置**：矩阵会**真改**工作树上的文件；它自带备份、
检测并发写入（他人改过就不回写）、并在结束后**逐字节还原 + sha256 复核**
（`requirement.md:252-253`）。跑之前先确认没有别的窗口正在改同一批文件。

## 七、与需求条款、复核证据的对照 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->

**证据编号记法**（本文自定的引用口径，便于逐条反查）：

- `review:§1#n` = `docs/reviews/doc-quality-gates-2026-10-06.md` §1 表第 n 行（该表在 `:18-:24`，`#3b` 是其中的第 3b 行）；
- `review:§2.1#n` = 同文件 §2.1 表第 n 行（该表在 `:127-:132`）；
- `review:NNN` = 同文件的第 NNN 行（行号即证据编号）。

| 用例 | 覆盖 FR | 需求条款 | 复核证据 |
|---|---|---|---|
| UC-1 | FR-1、FR-3、FR-4 | `requirement.md:88-104`（FR-1）、`:128-145`（FR-3）、`:147-163`（FR-4） | `review:§1#1`、`review:§1#3`、`review:§1#3b`、`review:§2.1#1`、`review:§2.1#4`、`review:118-122` |
| UC-2 | FR-2 | `requirement.md:106-126` | `review:§1#2`、`review:§2.1#2`、`review:109-113`、`review:136-142`（存量实测） |
| UC-3 | FR-5、FR-6、FR-7、FR-8 | `requirement.md:165-181`（FR-5）、`:183-202`（FR-6）、`:204-219`（FR-7）、`:221-236`（FR-8） | `review:§1#4`、`review:71-94`（拆分面四条）、`review:115-116`（矩阵 8/8） |
| 人的动作点 | （横跨全部） | `requirement.md:27-46`（业务流程图的三道人确认） | `review:180-191`（§6 待裁定口径） |
| 异常路径与存量不追溯 | FR-2、FR-3、FR-4 | `requirement.md:242-260`（失败与并发路径）、`:266-268`（不做存量追溯） | `review:136-142`（存量实测）、`review:157-159`（明确没做） |

**一句话收口**：本次把「形状对了」升级成「每条判据都有反向演练」——三条用例的失败分支
（被拒 / `exit 1` / 点名）才是这套门禁真正的交付物；一路顺风的那条路本来就没人怀疑。
