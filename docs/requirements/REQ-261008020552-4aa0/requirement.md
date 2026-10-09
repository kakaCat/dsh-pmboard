---
requirement_id: REQ-261008020552-4aa0
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [backend]
---

# 需求说明（REQ-261008020552-4aa0）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 排版纪律：段落不超过 4 行；并列项用列表或表格；图一律 ASCII，禁用 mermaid。

## TL;DR

- **现象**：工具面 21 个常驻 schema 槽位中还有 2 个低频修缮工具可收编
  （archive_amend / note_interruption）；task_move 一壳塞 4 种职能（状态推进 /
  acceptance 修订 / tasks[] 批量 / budget 放行），模型可见文本 1265 字符为全工具面最重；
  submit 的 tasks[] 子 schema 逐字段长描述 1717 字符每轮重发。
- **代价**：每轮请求白烧 token；修缮簇 5 选 1 是 agent 选错面最大的簇之一。
- **做完得到**：工具面 21 → 19（被删能力全部并入 task_amend 的新 op，语义零损失）；
  task_move 模型可见文本减半；submit tasks[] 细则下沉到拒绝回执（G3 已验证模式）。

## 背景与证据

证据全文：`docs/requirements/REQ-261007165643-4275/design/research-report.md`
§1.2.4（task_move 过载候选）、§1.2.7（archive_amend 归宿）、§1.2.8（五修缮合一激进档）、
§4.1（S4 激进：→ 19）。前五批同源自该报告，均已完成/验收。

本批是**收官可选批**：收益递减、回归面大，每步必须独立可回滚——任一 FR 实施中
发现收益不抵回归面，按「业务流程图」的回滚单元单独放弃该步，不影响其他步。

### 实测基线（2026-10-08，测量口径：defineXTool(stub deps) 后取
description.length + parameters 描述递归和 / JSON.stringify 长度）

| 对象 | 基线读数 | 备注 |
|------|---------|------|
| 工具面 | 21 个（registry.ts 21 条 ↔ 21 目录，I-1~I-3 不变量约束） | 目标 19 |
| TaskMoveTool.ts | 17945 字符（全工具面最重文件） | 4 职能一壳 |
| task_move 模型可见文本 | **1265** = description 494 + parameters 描述 771（budget 子树 278、tasks 子树 312） | 目标 ≤ 630 |
| task_move parameters JSON | 1501；output JSON 1868 | 参考 |
| SubmitTool.ts | 34817 字符 / 517 行 | — |
| SUBMIT_PROMPT | 1289（预算 ≤ 1300，余量仅 11 字符） | submit-prompt-budget 门禁 |
| submit parameters 描述 | 3306，其中 **tasks[] 子树 1717**（21 个属性）、results[] 510 | tasks[] 目标 ≤ 860 |
| ArchiveAmendTool / NoteInterruptionTool | 3415 / 2589 字符（壳） | 用例不动，壳删除 |

### 裁决记录（需求阶段裁定，随本文档确认生效）

- **D-1：archive_amend 去向 → task_amend(op=archive)**（否掉「submit 第 7 个 kind」）。
  理由：§1.2.7 明确「时间窗不重叠、不归 submit、未来压缩归修缮合并工具」；
  SUBMIT_PROMPT 预算仅剩 11 字符，塞新 kind 必破既有门禁；
  task_amend 的 op 分派 + 用例零改动模式已被 REQ-261007220012-bd29 FR-4 验证。
- **D-2：note_interruption 去向 → task_amend(op=interruption)**（否掉「status 写侧辅助」）。
  理由：status 是只读查询面（QueryState 用例），塞写操作破坏读写分离与「只读」文案契约；
  五修缮合一正是 §1.2.8 激进档终态，低频兜底语义同簇。
- 工具名保持 `reqboard_task_amend` 不改名（改名会断刚发布一批的存量调用，违反行为零变化）。

## 目标（功能条款）

五条 FR：FR-1/FR-2 工具收编（21→19）、FR-3/FR-4 描述结构减负、FR-5 同步面全绿。
每条的「判据」是可机械核验的命令 / 读数 / 明确取值。

## 现状

- 21 个工具目录 ↔ registry 21 条 ↔ index.ts 21 次 register（I-1~I-3 机械不变量约束三方一致）。
- archive_amend（归档后只追加补录）与 note_interruption（断点补写兜底）是单职能低频壳，
  各自薄壳委托 application 用例（AmendArchiveManifest / NoteInterruption）。
- task_move 的 budget 子对象与 tasks[] 批量子 schema 把幂等/CAS/节流细则全写在
  每轮重发的描述里（278 + 312 字符），而这些细则在既有拒绝回执
  （REQBOARD_CONFLICT 带当前窗口号、REQBOARD_BULK_CLOSE 带 throttleRemainingMs+guidance）
  与卡文档里已有承载点。
- submit 的 tasks[] 21 个属性逐字段长描述（1717 字符），含三对 snake/camel 双拼说明、
  dep_reasons 写法课、footprint 逐字段释义；第二批 G3 已验证「细则进拒绝回执」模式
  （submit-prompt-budget.test.ts 钉住 SUBMIT_PROMPT ≤ 1300 + 细则之家逐条断言）。

## 目标结构

- 工具面 19 个 = 21 − 2：删 ArchiveAmendTool、NoteInterruptionTool 两个壳目录；
  task_amend 扩为 5 op（refs / adopt / chain / archive / interruption）。
- 用例层零改动：executeAmendArchiveManifest 与 noteInterruption 原样被新 op 分派复用，
  判定、拒绝条件、幂等性、留痕完全继承。
- task_move 模型可见文本 1265 → ≤ 630：description 每职能只留一句话；
  budget/tasks 子字段描述压成短句，细则下沉到既有拒绝回执的指引文案（只追加不改语义）。
- submit tasks[] 子树描述 1717 → ≤ 860：逐字段细则下沉到 plan 各门禁的拒绝回执
  （deps 伪依赖 / 粒度豁免 / 原型锚点 / footprint 软门禁等，回执逐条点名规则），
  schema 只留「键存在 + 一句话」；双拼字段说明合并为一句「snake/camel 都认」。

## 行为不变式

- **行为零变化是铁律**：所有存续工具的判定逻辑、状态机、台账写路径、错误码与
  触发条件逐字保持；本批只动描述结构（文案位置）与工具收编（壳层分派）。
- 被复用的两个用例（AmendArchiveManifest / NoteInterruption）实现一行不改，
  其行为测试改为打 task_amend 对应 op 后原样绿。
- task_amend 既有三 op（refs/adopt/chain）的入参、返回体、幂等性不变；
  缺省调用形状不变（op 必填集判定只对新 op 追加分支）。
- task_move / submit 的**参数形状零变化**：键名、类型、必填性、枚举、
  additionalProperties 全部不动——只缩短/迁移描述字符串。
- 拒绝回执只做加法：既有错误码、结构化字段（throttleRemainingMs / windowIndex 等）
  不变，指引文案允许追加细则句（测试断言的是码与字段，不是整段文案逐字）。
- 降级形状不变：无绑定需求 / 无断点等场景的返回形状逐字保持。

## FR-1 archive_amend 收编为 task_amend(op=archive) <!-- serves: FR-1 -->

定义：task_amend 新增 op=archive（入参 = 原 ArchiveAmendTool 的 requirement_id / docs /
reason 映射），分派复用 AmendArchiveManifest 用例；删 `src/tools/ArchiveAmendTool/` 目录，
index.ts 注册、registry 条目、render-summaries、ArchiveAmendTool/summary.ts 迁移或摘除。
判据：`grep -rn "reqboard_archive_amend\|ArchiveAmendTool\|defineArchiveAmendTool" src tests README.md`
零命中（HTTP 面 `src/http/routers/requirements.ts` 看板补录入口的**注释**改为指 task_amend，
路由与用例不动）；`reqboard_task_amend(op=archive, …)` 行为测试通过（原 archive-amend 测试改造）；
`ctx.tools` 无 `reqboard_archive_amend`。

## FR-2 note_interruption 收编为 task_amend(op=interruption) <!-- serves: FR-2 -->

定义：task_amend 新增 op=interruption（入参 = 原 NoteInterruptionTool 的 reason /
requirement_id 映射），分派复用 NoteInterruption 用例；删 `src/tools/NoteInterruptionTool/`
目录，注册与清单同步；`StageActions.ts` 的工具名映射、`shared.ts` 长文本登记表
（`reqboard_note_interruption:reason` 条目）、`protocol.ts` / `interruption.ts` 注释同步改写。
判据：`grep -rn "reqboard_note_interruption\|NoteInterruptionTool\|defineNoteInterruptionTool" src tests README.md`
零命中；`reqboard_task_amend(op=interruption, reason=…)` 行为测试通过
（原 interruption 工具面测试改造，用例层 interruption-checkpoint/dedupe 测试不动）；
`ctx.tools` 无 `reqboard_note_interruption`。

## FR-3 task_move 描述结构减负（1265 → ≤ 630，行为零变化） <!-- serves: FR-3 -->

定义：description 压到每职能一句话（批量细则、节流上限、CAS 细则、幂等说明撤出）；
budget 子对象与 batchItemSchema 的逐字段长描述压成短句；撤下的细则补进既有拒绝回执
（REQBOARD_CONFLICT / REQBOARD_BULK_CLOSE / REQBOARD_INVALID_INPUT 的指引文案只追加）
与子卡预算的卡文档说明。**参数形状、返回体、错误码逐字不动**。
判据：用「实测基线」同口径脚本测得 description + parameters 描述合计 ≤ 630 字符
（减半）；`pnpm vitest run tests/task-move-batch.test.ts tests/task-move-role.test.ts
tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts
tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts` 全绿（允许为回执追加文案
调整断言，禁止改码/字段断言）；新增预算门禁测试钉住 ≤ 630。

## FR-4 submit tasks[] 子 schema 描述下沉（1717 → ≤ 860） <!-- serves: FR-4 -->

定义：tasks[] 21 个属性的逐字段长描述压成一句话；三对双拼字段（dep_reasons/depReasons、
skip_integration_reason/skipIntegrationReason、granularity_exempt/granularityExempt）
说明合并为一句「snake/camel 等价，两者都认」；撤下的细则（dep_reasons 写法、粒度豁免生效
条件、footprint 三量口径、skipIntegration 必填联动、prototypeRefs 必填条件）下沉到 plan
提交被拒时的回执指引（plan-deps-check / plan-granularity / 原型锚点门禁 / footprint 软门禁
的拒绝消息逐条携带对应规则，沿用 G3 模式）。
判据：同口径测得 tasks[] 子树描述 ≤ 860；SUBMIT_PROMPT ≤ 1300 既有预算不破；
`pnpm vitest run tests/submit-prompt-budget.test.ts tests/plan-granularity.test.ts
tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts
tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts` 全绿
（REQBOARD_TESTING_COVERAGE_GATE 等既有契约不受影响）；新增「细则之家」断言
（每条撤下的规则能在某个拒绝回执里读到，防减过头）。

## FR-5 同步面全绿（19 口径 + 契约测试 + 文档/知识层） <!-- serves: FR-5 -->

定义：registry 19 条；README 工具表 21→19（两行摘除、task_amend 行改写）；
package.json description「21 个」→「19 个」；`docs/architecture/tool-face-inventory.md`、
`docs/architecture/project-manual.md`（含 LONG_TEXT_FIELDS 计数段）、`docs/knowledge/`
两页同步；client toolviews **预期零改动**（已初核 src/client 对两个工具名零引用），
由机械校验守住。
判据：`pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts
tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts
tests/tools-render-coverage.test.ts` 全通过；package.json description 含「19 个」；
`pnpm kb:check` 通过；`pnpm test` 全绿。

## 非目标

- N1：不动用例层——AmendArchiveManifest / NoteInterruption / MoveTask / SubmitArtifact
  等实现一行不改；不触碰状态机、台账 schema、HTTP 路由。
- N2：不改 task_amend 工具名（reqboard_task_amend 保持；激进档原名 reqboard_amend 不采纳，
  改名 = 断存量调用）。
- N3：不做 submit 加 kind（D-1 已否）；不做 tasks[] 双拼字段归一化（§4.3 G10，另立需求）。
- N4：不动 kb 描述（缓存策略冻结）、不动 capture/create 文案、不动 ask_confirm。
- N5：client 端侧预期零改动——若实施中发现 toolviews 真有按名引用，退回 design 改设计，
  不在实施中夹带。
- N6：描述减负只到「减半」档位，不追求极限压缩——细则必须全部有回执之家，
  减过头（agent 读不到规则）视为事故。

## 业务流程图

```
【收编总览（21 → 19）】
删除面（2 槽位）                 存续面（承接能力）
reqboard_archive_amend     ──▶  reqboard_task_amend(op=archive)         复用 AmendArchiveManifest
reqboard_note_interruption ──▶  reqboard_task_amend(op=interruption)    复用 NoteInterruption

【描述减负（行为零变化）】
task_move：budget/tasks 细则 ──▶ REQBOARD_CONFLICT / REQBOARD_BULK_CLOSE / INVALID_INPUT 回执（只追加）
submit：  tasks[] 字段细则   ──▶ plan 各门禁拒绝回执（deps/granularity/锚点/footprint，G3 模式）

【回滚单元（各自独立 commit，git revert 单步即回滚）】
U1 = FR-1（archive 收编）  U2 = FR-2（interruption 收编）
U3 = FR-3（task_move 减负） U4 = FR-4（submit 减负）  U5 = FR-5（同步面收尾）
依赖序：U5 收尾依赖于它之前已落地的 U；U1~U4 互不依赖，任一步可单独放弃。
```

## 失败与并发路径

- **失败路径①（存量调用方硬断）**：合并后 agent 按旧记忆调 `reqboard_archive_amend` /
  `reqboard_note_interruption` → 宿主报 unknown tool。缓解：task_amend prompt 与 op 描述
  写明承接的旧能力（参照第三批 S2/S3 做法：存续工具 description 带指路句）。
- **失败路径②（减负减过头）**：细则从 schema 删了、回执里又没有 → agent 再也读不到规则。
  缓解：FR-3/FR-4 判据含「细则之家」逐条断言（每条撤下的规则能在某个拒绝回执里读到），
  参照 submit-prompt-budget.test.ts 的既有双判据（减过头 + 没减够）。
- **失败路径③（合并遗漏面）**：registry / index / README / package.json / toolviews /
  知识层任一处漏改 → 由既有机械门禁兜住：tools-dispatch（I-1）、apply-wiring（I-2）、
  output-contract（I-3）、readme-tool-face、tools-render-coverage、kb:check 任一失守即红。
- **失败路径④（回执文案追加撞断言）**：既有测试若逐字断言拒绝消息全文，追加细则句会变红。
  处置：只允许为追加文案放宽文案断言，禁止改错误码 / 结构化字段断言；逐条留痕。
- **并发重复**：两个新 op 复用原用例，幂等性原样继承——archive 只追加（已存在条目幂等跳过）、
  interruption 同一需求只保留一个断点（后写覆盖前写）；无需新增并发保护。
- **中途回滚**：每步独立 commit；回滚任一步只需 revert 该 commit，
  台账数据（~/.dsh/reqboard）不受工具面变更影响，无需数据迁移。

## 验收方式（摘要）

1. FR-1~FR-5 各条判据逐条跑（grep 零命中 / 体量脚本读数 / 契约测试矩阵）。
2. 全量测试：`pnpm test` 绿（含既有行为测试，证明语义零损失）；`pnpm kb:check` 绿。
3. 工具数核验：apply-wiring 派生的注册名单 = 19 个，package.json / README / registry
   三处口径一致；体量核验：task_move ≤ 630、submit tasks[] ≤ 860（同口径脚本复测）。

## 边界

- 本批只动：两个壳目录删除 + task_amend 壳扩 2 个 op 分派分支；task_move / submit 的
  描述字符串与对应回执指引文案（只追加）；同步面（registry / index / README /
  package.json / docs / 知识层 / 注释）。
- 不越界到：用例实现、状态机、台账 schema、HTTP 面、client 端（预期零改动）、
  双拼字段归一化、kb 描述、capture/create/ask_confirm 文案（见「非目标」N1~N6）。
- 与设计的矛盾处理：拆分或实施中发现与本节冲突的诉求（如要改用例实现、要动 client、
  要把 archive_amend 改塞 submit），退回 brainstorming/design 阶段改裁决，不在实施中夹带。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-5ae432 |
| FR-2 | ✅ 已接收 | t-aa5503 |
| FR-3 | ✅ 已接收 | t-6b550f |
| FR-4 | ✅ 已接收 | t-9f79be |
| FR-5 | ✅ 已接收 | t-0f675d |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
