---
requirement_id: REQ-261007220012-bd29
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend]
---

# 需求说明（REQ-261007220012-bd29）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 排版纪律：段落不超过 4 行；并列项用列表或表格；图一律 ASCII，禁用 mermaid。

## TL;DR

- **现象**：reqboard 工具面 27 个常驻 schema 槽位，其中 6 个是冗余/可合并的：
  弃用别名（task_execute）、单入参取件口（confirm_receipt）、字段级重叠的查询面
  （run_status / task_status）、同语义的三个修缮工具（refs / adopt / regenerate）。
- **代价**：每个工具 schema 每轮请求重发，白烧 token；查询面 4 选 1、修缮簇 3 选 1
  是 agent 选错面最大的簇；AdvanceTool 目录名与工具名 reqboard_task_run 不一致是纯认知负担。
- **做完得到**：工具面 27 → 21（保守档），语义零损失——被删工具的能力全部并入
  存续工具的可选入参；目录命名债与 schema 逐字重复一并消掉。

## 背景与证据

证据全文：`docs/requirements/REQ-261007165643-4275/design/research-report.md`
§1.2（重叠对清单：1.2.1 / 1.2.3 / 1.2.5 / 1.2.6 / 1.2.8）与 §4.1（精简路径 S1~S6）。
第 1 批（边界 bug，REQ-261007193530-3133）与第 2 批（文案契约漂移，REQ-261007200706-89b7）
同源自该报告，均已完成/验收。

用户已明确授权：「不用的工具可以删除」——S1 的弃用别名 reqboard_task_execute
跳过淘汰期，直接物理删除（原方案 D-1 选 A 的保留理由被授权覆盖）。

### 精简账（27 → 21）

| 步骤 | 动作 | 工具数 | 证据回溯 |
|------|------|--------|---------|
| S1 | 物理删除 reqboard_task_execute（真委托 defineAdvanceTool，零功能损失） | -1 → 26 | §1.2.1 |
| S2 | confirm_receipt 并入 ask_confirm（可选 ticket 入参 = 取回执模式） | -1 → 25 | §1.2.5 |
| S3 | run_status 并入 status（加 run 节）；task_status 并入 task_tree（task_id 单卡展开） | -2 → 23 | §1.2.3 |
| S4 | refs + adopt + regenerate 合一为 reqboard_task_amend(op=refs\|adopt\|chain) | -2 → 21 | §1.2.8 |
| S5 | AdvanceTool 目录改名 TaskRunTool（消命名债） | 0 | §1.2.1、§1.4 |
| S6 | handoff / open_window 的 mode 枚举 + inheritance 子 schema 抽公共常量 | 0 | §1.2.6 |

## 目标（功能条款）

七条 FR 与 S1~S6 + 同步面一一对应；每条的「判据」是可机械核验的命令 / 读数 / 明确取值。

## 现状

- 27 个工具目录 ↔ registry 27 条 ↔ index.ts 27 次 register（I-1~I-3 机械不变量约束三方一致）。
- 6 个槽位冗余：task_execute 是 task_run 的真委托别名（同 factory 产物，占独立 schema 槽位）；
  confirm_receipt 是单入参（ticket）取件口；run_status / task_status 与 status / task_tree
  字段级重叠 30~50%；refs / adopt / regenerate 是同语义「修缮簇」三个独立入口。
- AdvanceTool 目录名与工具名 reqboard_task_run 不一致（registry.ts:116-121，纯认知负担）。
- handoff 与 open_window 的 mode 枚举、inheritance 子 schema 逐字重复两处（改一处必改全部）。

## 目标结构

- 工具面 21 个 = 27 − 6：删 task_execute / confirm_receipt / run_status / task_status /
  task_refs / task_adopt / task_regenerate 七个壳（6 个净槽位），新增 task_amend 一个壳。
- 查询面 4 → 2：status（绑定状态 + run 节）、task_tree（父子结构 + task_id 单卡展开）。
- 确认面：ask_confirm 三分派（evidence 文字路径 / ticket 取回执 / 弹框路径）。
- 修缮簇单入口：reqboard_task_amend(op=refs|adopt|chain)，用例层零改动。
- 目录命名对齐：TaskRunTool ↔ reqboard_task_run；WINDOW_MODES / windowInheritanceSchema 单源。

## 行为不变式

- 存续工具缺省调用形状不变：status 零参 / task_tree 不传 task_id / ask_confirm 不传 ticket
  时返回体逐字保持现状（只做加法：新节、新入参）。
- 6 个被复用用例（ConfirmReceipt / QueryRunStatus / AmendTaskRefs / AdoptTask /
  RegenerateChain / TaskTree 既有分支）实现一行不改，其行为测试原样绿。
- 错误语义不变：REQBOARD_UNKNOWN_TICKET / REQBOARD_INVALID_INPUT 等错误码与触发条件逐字保持；
  降级形状不变（无 active run 时 runId 整键省略，不发 null）。
- 幂等性不变：refs 值同不写盘 / adopt 只补缺失归属 / chain 缺省 dry_run 只读。
- 状态机与台账写路径不变：本批无任何需求/任务状态迁移表改动，无台账 schema 迁移。

## FR-1 物理删除 reqboard_task_execute（S1） <!-- serves: FR-1 -->

定义：删 `src/tools/TaskExecuteTool/` 整目录；`src/index.ts` 注册、`src/tools/registry.ts` 条目、
`render-summaries.ts`、`StageActions.ts`、AdvanceTool prompt 指路文案、相关测试全部同步摘除。
判据：`grep -rn "reqboard_task_execute\|TaskExecuteTool\|defineTaskExecuteTool" src tests README.md`
零命中；`pnpm vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` 通过。

## FR-2 confirm_receipt 并入 ask_confirm（S2） <!-- serves: FR-2 -->

定义：ask_confirm 增加可选 `ticket` 入参（给了 = 取回执模式，语义与今 ConfirmReceiptTool 一致）；
删 `src/tools/ConfirmReceiptTool/` 目录，注册与清单同步。
判据：ask_confirm schema 含 `ticket`；`ctx.tools` 无 `reqboard_confirm_receipt`；
原 confirm-receipt 行为测试改为打 ask_confirm(ticket) 后通过。

## FR-3 查询面 4 → 2：run_status 并入 status、task_status 并入 task_tree（S3） <!-- serves: FR-3 -->

定义：status 返回体加 run 节（runId/stepIndex/nextReady/jobStatus/pauseReason/autoRun，
无 active run 时按今降级形状）；task_tree 加 `task_id` 入参 = 单卡展开模式
（返回今 task_status 的 status/progress/lastRun/lastReport）；删 RunStatusTool、TaskStatusTool 两目录。
判据：status 输出含 run 节；`reqboard_task_tree(task_id=t-xxx)` 返回单卡执行详情；
`ctx.tools` 无 `reqboard_run_status` / `reqboard_task_status`。

## FR-4 修缮簇三合一 reqboard_task_amend（S4 保守档） <!-- serves: FR-4 -->

定义：新增 `reqboard_task_amend(op=refs|adopt|chain)`，三个 op 分别复用今
AmendTaskRefs / AdoptTask / RegenerateChain 用例，入参为各原工具入参的映射；
删 TaskRefsTool、AdoptTaskTool、RegenerateTool 三目录。
判据：新工具注册且三 op 各有一条等价原工具行为的测试通过；
`ctx.tools` 无 `reqboard_task_refs` / `reqboard_task_adopt` / `reqboard_task_regenerate`。

## FR-5 AdvanceTool 目录改名 TaskRunTool（S5） <!-- serves: FR-5 -->

定义：`src/tools/AdvanceTool/` → `src/tools/TaskRunTool/`，registry 条目
（key/factoryFile/dir）、index.ts import、测试引用同步；工具名 `reqboard_task_run` 不变。
判据：`ls src/tools/TaskRunTool` 存在且 `src/tools/AdvanceTool` 不存在；
registry I-1~I-3 不变量测试（tools-dispatch / output-contract / apply-wiring）通过。

## FR-6 handoff / open_window 公共 schema 单源化（S6） <!-- serves: FR-6 -->

定义：mode 枚举（fork/create）与 inheritance 子 schema（三项回执）抽成共享常量，
两处工具改为引用。
判据：`pnpm vitest run tests/open-window-tool.test.ts tests/handoff.test.ts tests/open-window-inherit.test.ts`
全通过（schema 行为不变）；mode 枚举与 inheritance 字面量在 src 下各只有 1 处定义
（`grep -rn "'fork', 'create'\|enum: \['fork'" src/tools | wc -l` = 1），HandoffTool/OpenWindowTool 两处改为 import 引用。

## FR-7 同步面全绿（registry / README / package.json / 契约测试） <!-- serves: FR-7 -->

定义：registry 21 条；README 工具表更新；package.json 描述计数 27 → 21；
client toolviews **零改动**（已核实 src/client 对被删 7 个工具名零引用、无按名映射表），
由 tools-render-coverage / toolviews-contract 机械校验守住
（含摘除 TaskExecuteTool 的 DELEGATING_ALIASES 白名单条目）。
判据：`pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts
tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts
tests/tools-render-coverage.test.ts` 全通过；package.json description 含「21 个」。

## 非目标

- N1：`reqboard_archive_amend` 与 `reqboard_note_interruption` 本批不动（激进档五合一不采纳，保守档只收三修缮）。
- N2：capture / create 纪律文案收敛（§1.2.2 建议项）不在本批，只抽 handoff/open_window 的 schema 常量（S6）。
- N3：不改变任何存续工具的行为语义（status/task_tree/ask_confirm 只做加法：新节、新入参模式；缺省调用形状不变）。
- N4：M1（run_status 死字段 prompt/schema 漂移）随 S3 合并自然消失，不单独修。
- N5：client 端侧零改动——已核实 `src/client/` 对被删 7 个工具名零引用、toolviews 无按名映射表
  （toolviews-contract 只用 status/task_move 做通用渲染样本），故 sides 声明为 [backend]，
  不触发原型门禁；toolviews 面由既有机械校验守住（FR-7 判据）。

## 业务流程图

```
【合并总览】
删除面（6 槽位）                存续面（承接能力）
reqboard_task_execute      ──▶  reqboard_task_run（本来就真委托，无承接成本）
reqboard_confirm_receipt   ──▶  reqboard_ask_confirm(ticket=pc-…)        取回执模式
reqboard_run_status        ──▶  reqboard_status（输出加 run 节）
reqboard_task_status       ──▶  reqboard_task_tree(task_id=t-…)          单卡展开模式
reqboard_task_refs         ──┐
reqboard_task_adopt        ──┼─▶ reqboard_task_amend(op=refs|adopt|chain)
reqboard_task_regenerate   ──┘

【目录改名 S5】
src/tools/AdvanceTool/ ──git mv──▶ src/tools/TaskRunTool/
  registry key Advance→TaskRun、factoryFile、dir 同步；工具名 reqboard_task_run 不动

【回滚单元】
S1 / S2 / S3 / S4 / S5+S6 各自独立 commit；任一步出问题 git revert 单步即回滚，
不影响其他步已落地的精简。
```

## 失败与并发路径

- **失败路径①（存量调用方硬断）**：合并后 agent 按旧记忆调 `reqboard_task_execute` 等 6 个
  旧名 → 宿主报 unknown tool。缓解：存续工具的 prompt 保留指路文案
  （如 task_run prompt 已有「task_execute 是已弃用别名」改为「已删除，唯一入口是本工具」）；
  ask_confirm / status / task_tree / task_amend 的 description 写明承接的旧能力。
- **失败路径②（合并遗漏面）**：某同步面（registry / index / README / toolviews / package.json）
  漏改 → 由既有机械门禁兜住：tools-dispatch（I-1 目录集合）、apply-wiring（I-2 注册名集合）、
  output-contract（I-3 工厂扫描）、readme-tool-face（README 表）、tools-render-coverage
  （toolviews 覆盖）任一失守即红，不允许「看着绿」。
- **并发重复**：task_amend 三 op 复用原用例，幂等性原样继承——refs 全量替换语义
  （值没变幂等不写盘）、adopt 只补缺失归属（重复调用 REQBOARD_INVALID_INPUT）、
  chain 缺省 dry_run 只读；无需新增并发保护。
- **状态机非法迁移**：本批不触碰需求/任务状态机与台账写路径；运行中的实施链 run 与
  挂起确认 ticket 的存取逻辑原样保留——ask_confirm(ticket) 取的是同一个
  pending-confirm registry，旧 ticket 在合并前后均可取回执。
- **中途回滚**：每步独立 commit；回滚任一步只需 revert 该 commit，
  台账数据（~/.dsh/reqboard）不受工具面变更影响，无需数据迁移。

## 验收方式（摘要）

1. FR-1~FR-7 各条判据逐条跑（grep 零命中 / schema 断言 / 契约测试矩阵）。
2. 全量测试：`pnpm test` 绿（含既有行为测试，证明语义零损失）。
3. 工具数核验：apply-wiring 派生的注册名单 = 21 个，package.json/README/registry 三处口径一致。

## 边界

- 本批只动工具面与查询组合：src/tools/ 七个壳删除、一个新壳、一个改名；QueryState/TaskTree
  只做加法分支；同步面（registry / index / README / package.json / 契约测试派生）。
- 不越界到：6 个存续用例的实现、台账 schema、状态机、HTTP 面、client 端（零改动已核实）、
  archive_amend 与 note_interruption、capture/create 文案（见「非目标」N1~N5）。
- 与设计的矛盾处理：拆分或实施中发现与本节冲突的诉求（如要改用例实现、要动 client），
  退回 design 阶段改设计，不在实施中夹带。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-c21292 |
| FR-2 | ✅ 已接收 | t-38c7cd |
| FR-3 | ✅ 已接收 | t-856177 |
| FR-4 | ✅ 已接收 | t-ef2395 |
| FR-5 | ✅ 已接收 | t-084edc |
| FR-6 | ✅ 已接收 | t-06c363 |
| FR-7 | ✅ 已接收 | t-34ec16 |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
