---
requirement_id: REQ-261008011118-defe
title: "修复 reqboard 体检第五批中危 bug（M1 死字段/M3 批内节流/M4 两段写/M5 并发双跑）"
status: brainstorming
owner: "session-9574f815"
category: bug
sides: [backend]
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5]
---

# 需求说明（REQ-261008011118-defe）

> 状态：需求分析（brainstorming） · 窗口 session-9574f815 · 立据：2026-10-08
> 宣布路径：**Bounded**（四项各自改一处收敛点、各带一条先红后绿回归，不新增能力、不重构；
> 每项独立可回滚——一项回退不影响其余三项）。
> 排版纪律：并列项用列表或表格；图一律 ASCII 字符画，不用 mermaid。
> 环境：仓库 `/Users/mac/Documents/ai/dsh/dsh-pmboard`，HEAD `c49fd5e`，工作树 234 条在飞改动
> （168 修改，含他窗前四批的在飞修复）；node v25.6.1。

## TL;DR

- **现象**：同一条体检报告（`REQ-261007165643-4275/design/research-report.md` §2.2）里剩下的四条中危项，2026-10-08 本窗口复核**四条全部仍在**，且四条都已取到运行读数（见 §复现步骤）。
- **为什么现在做**：这四条各自都是「静默错行为」而非崩溃——① run 进度恒报第 0 步（错进度）；
  ② 单次调用可关 20 张顶层卡（事故 C 防线的批量缺口）；③ 回退两段写失败留半成品（台账自相矛盾）；
  ④ 同一张子卡可被两路并发双跑（双倍算力 + 跨卡覆盖误判）。都不报错，靠人肉才发现。
- **做完得到**：四条各有一条「先红 → 后绿」回归；run 快照不再有恒 0 读数；单次调用可关的顶层卡数
  压到设计上限内且被拒项带确定指引；回退失败可补偿且状态事件/version 齐；子卡执行前先认领、
  认领后的每条失败出口都归还认领；既有测试基线、文案与错误码同批对齐。
- **本批不含**：M2（复活边入人工门）与 M6（时钟漂移 clamp）**已在前批收口**（本窗口复核：
  `src/domain/requirement/RequirementStatus.ts:127`、`src/domain/workflow/DoneEvidenceSpec.ts:71-77`）；
  H1/H2/H3 与 L1–L7 不在本批（§非目标）。

## 背景与动机

本需求是 **reqboard 插件体检（REQ-261007165643-4275）第 5 批收口件**，由代理立项移交本窗口
（立项留痕见 D-1）。前四批（bug 修复 / 文案契约 / 工具面 27→21 / 治理设施）已交付，
本批只收 §2.2「中危（M）」表里剩下的四条。

**为什么这四条值得单独立项**（每条都指向一处「唯一收敛点被绕过」）：

1. **M1 死字段**：`CheckpointManager.writeCheckpoint` 在生产代码 **0 调用方**——链只写
   `advance.runId/lockAt/history`（`AdvanceChain.ts:122-131`、`:685-693`），
   从不写 `stepIndex/currentSubtaskId/heartbeatAt`；而读侧把它们当实况回报
   （`QueryRunStatus.ts:125-126`、`StatusTool.ts:43-44`、`client/types.ts:211-215`）。
   后果：`reqboard_status` 的 run 节**恒报第 0 步**，agent 据此判断链进度必然错。
2. **M3 批内节流失效**：批量 `task_move` 在冻结快照上判全批（`MoveTask.ts:732-746`），
   而「同批卡互不触发 60s 节流」是上一版**显式写下的口径**（`MoveTask.ts:566/688-695`、
   `TaskMoveTool.ts:99-116`）。后果：事故 C 的防线（60s 节流）在批内整批失效，
   一次调用即可关满 `MOVE_BATCH_MAX = 20` 张顶层卡。
3. **M4 回退两段写无补偿**：回退落库顺序是「任务先写（`MoveRequirement.ts:176-211`）、
   需求后写（`:213-249`）」，需求写既没有补偿、也没有拿到失败时的队列归还；
   且落库白名单只搬 `status/revisions/updatedAt` + 取消三字段（`:191-209`），
   把计划里的 `statusHistory`/`version` 丢掉 → 复位子卡看不到「原地复位」事件、
   被取消卡没有 canceled 状态事件、两类卡 version 不 +1。
4. **M5 先执行后认领**：子卡 `in_progress` 在 run **结束后**才写（`ExecuteTask.ts:560-588`）。
   原始动机（让凭证门基准取开工时刻）已被 `chainBaselineOf`（`support.ts:674-705`）取代，
   而代价留了下来：认领窗口内同一张子卡可被自动链与手动入口并发双跑（本次实测 `workflow.start` 被调 2 次）。

**与前批的关系**：M2/M6 同表同批已在 REQ-261007193530-3133 收口（引其 FR-3/FR-4 留痕），
故本批范围就是 M1/M3/M4/M5 四项——**不合并、不顺手扩**。

## 缺陷条款（BUG-x）

每条独立成行；判据均为可执行命令 / 明确读数 / 明确错误码。四条修复各自独立可回滚。

- **BUG-1: M1 · run 快照的进度字段恒报第 0 步（死字段）**
  现状：写侧 0 生产调用方（`grep -rn "writeCheckpoint(" src` 只命中 `checkpoint-manager.ts` 自身），
  读侧照常回报（`QueryRunStatus.ts:125-126`、`StatusTool.ts:43-44`）。
  要求：**二选一**落地，并在 `design/fix-design.md` 写明取舍与理由——
  ① 接上调用方（在实施链推进处写真实检查点）；② 删除死字段与相关 schema（连带其死代码与单测）。
  判据（按选定路径给对应读数，两条分支都要给命令输出）：
  ① 接上：`npx vitest run tests/execute-task.test.ts tests/advance-parallel.test.ts` 全绿，
  且新增断言——真实链跑过一步后 run 节 `stepIndex ≥ 1` 且 `currentSubtaskId` 指向真实子卡 id；
  ② 删除：`grep -rn "stepIndex\|currentSubtaskId\|heartbeatAt" src --include=*.ts` 在生产代码只剩
  `advance.runId/lockAt` 相关，`npx vitest run tests/unit/checkpoint-manager.test.ts tests/output-contract.test.ts` 绿，
  且 run 节仍给出 runId / nextReady / jobStatus；两条共同硬判据：**不再存在恒 0 的进度读数**
  （修前读数见 §复现步骤 M1）。

- **BUG-2: M3 · 批内节流失效（单次调用可关 20 张顶层卡）**
  要求：**二选一**（设计文档写明取舍）——① 批内仍计节流；② 限制批内 `to=done` 数量（设计钉死上限 N）。
  共同硬要求：目标是把「单次调用可关的顶层卡数」压到 N 张以内；`REQBOARD_BULK_CLOSE` 的
  逐项结构（`code` + `throttleRemainingMs ∈ (0,60000]`）与顶层 `guidance`（确定等待 + 可做之事）
  **一字不改**；跨批节流仍生效；子卡豁免口径不变。
  判据：新增回归「单批提交 20 张顶层卡 `to=done`」→ 落账 done 数 ≤ N，被拒项逐项带
  `code=REQBOARD_BULK_CLOSE` 且 `throttleRemainingMs > 0`，顶层带 `guidance`；
  `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` 全绿；
  若选 ①，则 `TaskMoveTool.ts:99-116` 的「同批互不触发」文案与 `tests/done-throttle-guidance.test.ts:68` 的
  既有口径必须**同批改**（不允许文案说 A、代码做 B）；若选 ②，则 `:68` 的 ≤N 张断言保持绿。

- **BUG-3: M4 · 回退两段写无补偿 + 状态事件/version 缺失**
  要求：(a) **不动既有 I-11 顺序**（任务先写、需求后写），给需求侧未落账加补偿：需求 mutate
  抛错、**或**并发漂移导致回调 no-op（`req.status !== from`）时，必须把本轮回退已写的队列变更
  归还（物化重做卡撤销 + 已取消/已复位卡回原状），补偿本身失败要响亮（明确错误码 + 需求留痕），
  禁止静默半成品；(b) 落库白名单搬 `statusHistory` 与 `version`：复位子卡保留「原地复位」事件、
  被取消卡补一条 canceled 状态事件，两类卡 version +1；取消三字段与 rollback 修订的既有口径不变。
  判据：① 注入需求写失败后跑一次真实回退 → 队列逐字段回到回退前（与回退前 queue.json 对比一致）、
  需求 status 未变、回执点明补偿结论；② 正常回退后逐卡读数：取消卡 `statusHistory` 含 `canceled`、
  复位卡含 `todo`（reason 含「原地复位」），两类 `version` 均比回退前 +1；
  ③ `npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/error-code-inventory.test.ts` 全绿，
  且新增断言覆盖 ①②。

- **BUG-4: M5 · 自动链先执行后认领（并发双跑同一张子卡）**
  要求：**执行前先认领**——在派发（`deps.workflow.start` / 团队路径）之前先把子卡写 `in_progress`
  并开一条 running 执行记录；认领后**每一条**失败出口都必须归还认领（回 `todo` + 闭合执行为 failed +
  `attempt+1`，与 `ExecuteTask.ts:652` 既有口径对齐，含 `REQBOARD_CROSS_CARD` 那条早退路径）；
  已有 `in_progress` 且带新鲜 running 执行的卡不得被二次派发（明确错误码 + 指引）；
  失联认领按既有孤儿机制接管（`advance-select.ts:100-110` + `orphan-collector.ts`，
  阈值 `LIMITS.orphanTimeoutMs = 3min`）；凭证门基准仍为 `chainBaselineOf`，
  `claimedAt = 开工时刻` 语义不变（修前修后同值）。
  判据：① 新增回归——并发两路调 `executeSubtask` 同一张 todo 子卡：`workflow.start` 恰被调用 **1** 次，
  第二路以明确码失败且不新增第二条执行记录（修前读数 `workflow.start` = 2，见 §复现步骤 M5）；
  ② 认领后失败两出口（跨卡覆盖 / 凭证门失败）跑完：子卡回 `todo`、执行记录闭合为 `failed`、`attempt+1`；
  ③ `npx vitest run tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts` 全绿。

- **BUG-5: 收口 · 变更与既有契约/文案/基线同批对齐**
  要求：四条修复触及的 agent 可见文案（`TaskMoveTool` 的批量节流口径、`StatusTool` 的 run 节字段）、
  错误码（新增码必须进 `src/shared/error-code-registry.ts` 与错误码清单口径）、类型
  （`src/client/types.ts` 的 `AdvanceState`）与既有测试基线（`done-throttle-guidance`、`task-move-batch`、
  `move-rollback`、`execute-task`、`output-contract`、`prompt-*`）**同批更新**；
  不允许留「文案说 A、代码做 B」「错误码游离未登记」「基线数字靠手改转绿」三种残局。
  判据：`npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts` 全绿；
  若工具描述字符数变化，`npx vitest run tests/prompt-cost.test.ts tests/prompt-baseline.test.ts` 绿
  （基线刷新须逐条写理由）；`pnpm kb:check` 退出码 0（符号增删后知识层重生成）；
  四条修复的回归测试均在**同一批**落地（每条先红后绿，读数入卡）。

## 目标

| 编号 | 目标 | 价值（解决什么问题/对谁的价值） | 衡量指标 | 目标值 |
|---|---|---|---|---|
| 目标-1 | run 快照不再有恒 0 进度 | agent 看 `reqboard_status` 判断链进度不再被骗 | run 节读数 + 回归用例 | 恒 0 读数消失（接上或删除，二选一落地） |
| 目标-2 | 单批可关顶层卡数受控 | 事故 C 防线在批量路径上重新成立 | 单批 20 张的落账 done 数 | ≤ N（设计钉死，N < 20） |
| 目标-3 | 回退失败不留半成品 | 台账自相矛盾（状态没退、卡却取消）不再出现 | 注入失败的队列逐字段对比 | 逐字段与回退前一致 |
| 目标-4 | 子卡并发双跑消除 | 省双倍算力、消除跨卡覆盖误判 | `workflow.start` 并发调用次数 | = 1 |
| 目标-5 | 契约/基线同批对齐 | 不留文案-代码分叉与游离错误码 | 上述 vitest 集合 + `pnpm kb:check` | 全绿 + 退出码 0 |

## 非目标

- N1 **M2 / M6**：前批（REQ-261007193530-3133 FR-3/FR-4）已收口，本批不动（复核坐标见 TL;DR）。
- N2 **H1 / H2 / H3**：确认弹框否定作答、HTTP 面绕过人工门、跨进程写无锁——H3 依赖部署拓扑决策，
  三条都不在本批（§2.1 仍挂账）。
- N3 **L1–L7**（低危：死代码/TODO、console.log、报错不带合法边、`autoRun` 口径不一、
  `findReadyTasks` 第二份 ready 判定、懒展开共享数组、atomicWrite 临时名无进程标识）。
- N4 新增能力 / 新工具 / 新配置项；本批只让既有行为回到设计口径。
- N5 顺手重构（bug 档纪律：回归覆盖复现路径即止）；发现新缺陷出另案，不在本需求就地改。
- N6 他窗在飞改动（工作树 234 条）——遇到冲突点位名，不代改、不回滚。

## 边界（不做什么）

- **不把四条合成一条大改**：四项各自闭环（各自回归、各自可回滚），共用文件（`MoveTask.ts` /
  `ExecuteTask.ts`）上的改动也要能逐项独立 revert。
- **不改节流判据本身**：`DoneEvidenceSpec.findRecentAgentDoneTask` / `doneThrottleRemainingMs`
  仍是唯一判据（M6 的 clamp 已在前批在位）；M3 只在批量入口的**可见性/计数**上做文章。
- **不动 I-11 顺序契约**（任务先写、需求后写）：M4 只加补偿与补齐事件，不调换写序。
- **不为省事删测试**：既有断言（含「同批 ≤3 张不触发节流」）只在**行为口径被有意改变**时才改，
  且改的同一批里必须同时改文案与设计文档；「改断言转绿」一律视为不达标。
- **不引入第二份真相**：run 进度要么来自写入的真实检查点，要么该字段不存在——
  不允许再加一处「按 history 长度猜步数」的派生口径（那是新的第二个判定点）。
- **不动跨进程/多实例拓扑**（H3）：本批的并发防线只在**进程内 + 台账状态**这一层成立，
  不新增文件锁（超出 bug 档范围）。

## 验收标准

1. 四条修复各有一条回归用例：**先复现红**（读数与 §复现步骤 一致）→ 修复后绿，命令与读数写入任务卡。
2. `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts
   tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/execute-task.test.ts
   tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts`
   → 全部通过。
3. `npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts
   tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts`
   → 全部通过；新增错误码已在登记表与清单口径内。
4. `pnpm kb:check` → 退出码 0（符号增删后的知识层生成物与基线一致）。
5. `npx vitest run` 目标集合之外无**新增**红（对照收口前的全量读数逐条点名归属；
   他窗在飞引入的红不算本需求的）。
6. BUG-1 的二选一取舍、BUG-2 的 N 值取舍均在 `design/fix-design.md` 有明确结论 + 理由，
   且与实现一致（验收按该结论逐分支核对）。

## 改动位置

四条各自一条链路，改动点用【】标出：

```
① M1: 链推进(AdvanceChain) ──▶ advance{runId,lockAt,history} ──▶ QueryRunStatus/StatusTool run 节
                              └─【三条进度字段：接上调用方 或 删除字段与 schema】─┘

② M3: reqboard_task_move(tasks[]) ──▶ 【MoveTask 批量门禁：冻结快照判全批】 ──▶ 一次 mutate 落 20 张
                                     └─ 60s 节流(DoneEvidenceSpec) 仍是唯一判据 ─┘

③ M4: reqboard_move(回退) ──▶ 【① 任务先写(队列)】 ──▶ 【② 需求后写(mutate)】 ──▶ 回执 rollback
                              └─ 需求写失败/漂移 no-op ⇒ 队列已落变更无人归还（补偿缺口）

④ M5: 自动链/手动入口 ──▶ 【ExecuteTask：run 之后才写 in_progress】 ──▶ 完工/凭证门
                          └─ 认领窗口 = run 全程 ⇒ 可被第二路重复派发 ─┘
```

| 环节 | 本次是否改动 | 说明 |
|---|---|---|
| 上游：体检报告 §2.2 / 前批留痕 | 否 | 只读证据（`research-report.md:195-205`） |
| 【M1】`checkpoint-manager.ts` / `domain/checkpoint.ts` / `QueryRunStatus.ts` / `StatusTool.ts` / `client/types.ts` / `RequirementRepository.ts` | 是 | 按二选一：接上写入点 或 删字段+死代码+其单测 |
| 【M3】`MoveTask.ts`（批量门禁）、`TaskMoveTool.ts`（文案） | 是 | 批内计节流 或 限批内 done 数（N 由设计钉死） |
| 【M4】`MoveRequirement.ts`（落库白名单 + 补偿）、`rollback-tasks.ts`（事件补齐） | 是 | 补偿触发条件：需求侧抛错或漂移 no-op |
| 【M5】`ExecuteTask.ts`（认领前置 + 失败出口归还） | 是 | 认领点放在全部门禁之后、派发之前；孤儿接管口径不动 |
| 下游：看板 / 验收单 / 自动链行为 | 否（除 M5 的并发拒绝外） | 回执契约除新增拒绝码外逐字不变 |

## 改动对比

| 项 | 修复前（缺陷行为） | 修复后（预期行为） | 说明 |
|---|---|---|---|
| run 快照进度 | `stepIndex` 恒 0、`currentSubtaskId` 恒缺（即使链已有 OPEN_PARENT/RUN_SUBTASK 两步） | 真实步数/当前子卡，或该字段整体消失 | 二选一，设计写明取舍 |
| 单批关顶层卡 | 一次调用 20 张全落（`throttleRemainingMs=undefined`） | 单批 ≤ N，超出项 `REQBOARD_BULK_CLOSE` + 确定指引 | 跨批节流仍生效 |
| 回退失败 | 需求未退、卡已取消/已物化，无补偿；复位事件与 version 丢失 | 队列归还到回退前；失败响亮留痕；事件与 version 齐 | I-11 顺序不动 |
| 同一子卡并发派发 | `workflow.start` 被调 2 次（第二路撞 done→done 才失败） | 认领在先 ⇒ `workflow.start` = 1，第二路明确拒绝 | 认领后失败出口全部归还 |
| 契约与基线 | 文案/错误码/基线可能与实现分叉 | 同批对齐、可机械复核 | `pnpm kb:check` 退出码 0 |

## 复现步骤

**环境**：仓库 `/Users/mac/Documents/ai/dsh/dsh-pmboard`，HEAD `c49fd5e`，工作树 234 条在飞改动，node v25.6.1。
下列读数均为 **2026-10-08 本窗口实测**（现场快照，非转述）。四条各自独立复现。

**M1 · run 进度恒 0**（结构 + 运行时两路读数）

```bash
# ① 生产调用方计数（应无命中——死字段的证据）
grep -rn "writeCheckpoint(" src --include=*.ts
# → 只命中 src/application/internal/checkpoint-manager.ts 自身（定义行）

# ② 运行时读数：需求记录已有真实链步（history 两条），快照仍报第 0 步
cat > /tmp/recon-m1.mts <<'EOF'
import { CheckpointManager } from '/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/internal/checkpoint-manager.js'
import { queryRunStatus } from '/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/use-cases/QueryRunStatus.js'
const cm = new CheckpointManager()
const req = { id: 'REQ-1', status: 'implementing',
  advance: { runId: 'run-live', lockAt: 1, history: [{ at: 1, event: 'OPEN_PARENT' }, { at: 2, event: 'RUN_SUBTASK' }] } } as never
console.log('readCheckpoint =', JSON.stringify(cm.readCheckpoint(req)))
console.log('queryRunStatus =', JSON.stringify(await queryRunStatus({ requirementId: 'REQ-1',
  getRequirement: async () => req as never, getTasks: async () => [] })))
EOF
npx tsx /tmp/recon-m1.mts
# → readCheckpoint = {"runId":"run-live","stepIndex":0,"heartbeatAt":0}
# → queryRunStatus = {"runId":"run-live","stepIndex":0,"nextReady":[],"jobStatus":"not_found","autoRun":false}
# ⇒ runId 是真的（链在跑），进度是假的（恒 0）
```

**M3 · 单批可关 20 张顶层卡**（临时侦察测试，用完即删）

```bash
# 夹具：20 张 in_review 顶层卡（各带 lastReport）+ 1 张 todo 卡；需求 implementing；doneThrottleMs=60000
# 调用：reqboard_task_move(tasks=[20 项 {task_id, to:'done'}])
# → [RECON-M3] success=true 落账done=20 逐项ok=[true,true,...] throttleRemainingMs=undefined
```

**M4 · 计划与落库白名单对不上 + 无补偿**

```bash
# 纯函数读数（planRollbackTasks：父卡 done + 两张子卡）：npx tsx /tmp/recon-m4.mts
# → canceled[0]   = {"id":"t-p","status":"canceled","version":1,"statusHistoryLen":2,
#                    "statusHistory":["in_progress@5","done@6"],"revisions":["rollback"],"canceledAt":1000}
#      ⇒ 被取消卡 statusHistory 里**没有 canceled 事件**，version 未 +1
# → resetTasks  = [{"id":"t-s","status":"todo","version":1,"statusHistoryLen":2,
#                    "statusHistory":["in_progress@7","todo@1000"],...}]
#      ⇒ 计划里**有**「原地复位」事件（rollback-tasks.ts:122-125），但 version 未 +1
# 落库白名单（MoveRequirement.ts:191-209）只搬 status/revisions/updatedAt + canceledAt/By/Reason
#   ⇒ statusHistory 与 version 被丢；复位事件在落盘时消失
# 补偿：:213-249 的 mutateIfPresent 未被 try/catch 包裹，抛错或 req.status!==from 的 no-op 都不归还队列
```

**M5 · 同一张子卡并发双跑**（临时侦察测试，用完即删）

```bash
# 夹具：父卡 in_progress + 子卡 todo（dev）；BarrierRunner 让两路 start 重叠；并发两路调 executeSubtask
# → [RECON-M5] workflow.start 调用次数=2 a.ok=false b.ok=true 终态=done executions=1 outcomes=["succeeded"]
#   （第二路跑到 done 门才被 invalid_transition done→done 拒 —— 双跑已经发生，算力已花）
```

**证据附件**：体检报告 §2.2（`docs/requirements/REQ-261007165643-4275/design/research-report.md:195-205`）；
本窗口本次复核读数（上文四组）；结构坐标见 §根因。临时侦察测试与脚本用完即删，不入库。

## 根因

四条各自是一个**收敛点被绕过**，不是同一根因（各自修、各自回归）：

1. **M1 = 写侧收敛点从未接线**。`CheckpointManager`（`checkpoint-manager.ts:22-96`）与
   `domain/checkpoint.ts:11-100` 是"断点续传"时代的产物；链重构后进度改由 `advance.history`
   与 `lockAt/runId` 表达，写侧没人再调 `writeCheckpoint`，读侧（`QueryRunStatus`）却仍在读——
   **读一个永远没人写的字段**，于是恒 0。注意 `advance.runId` 是**活字段**（链锁，`AdvanceChain.ts:685-693`），
   不能跟着一起删。
2. **M3 = 可见性口径与防线目标冲突**。上一版为了"批量可用"把同批卡从节流判据里排除
   （判全批用**冻结快照**，`MoveTask.ts:732-746`），代价是 60s 节流（事故 C 防线）
   在批内整批失效。逐卡 done 凭证门（汇报 + 真实动作）是另一条防线，但它**不限制单次调用的规模**，
   故批量上限 `MOVE_BATCH_MAX = 20` 成了事实上的绕过额度。
3. **M4 = 跨存储两段写没有第二段失败的归还协议**。队列与需求台账是两个存储，
   顺序契约（I-11：任务先写、需求后写）本身是对的（任务写失败 ⇒ 需求未动，干净）；
   缺的是**第二段失败时对第一段的补偿**。附带两处"计划里写了、落盘按白名单丢了"
   （`rollback-tasks.ts:117-126` 写了复位事件，`MoveRequirement.ts:191-209` 没搬）
   与"根本没人写"（被取消卡的 canceled 事件、两类卡的 version）。
4. **M5 = 认领写在完工一侧**。`ExecuteTask.ts:560-588` 把 `in_progress` 与被认领信息放在
   run 之后写；`startedAt` 却在 run 之前取（`:462`）——即"用开工时刻当认领时刻"。
   当日改造动机（凭证门基准必须早于子代理写文件）现已由 `chainBaselineOf`
   （`support.ts:674-705`，取需求/父卡/子卡 createdAt 最小值）承载，`claimedAt` 只是老数据兜底，
   **动机消失、风险留下**：run 全过程中卡片状态仍是 `todo`，第二路（自动链的另一次投递或手动入口）
   在同一窗口看到 `todo` 就会再派一次。

## 失败与并发路径

（本需求四条缺陷本身就长在失败/并发路径上，故逐条列出；本条同时是实施期的验收清单。）

| 路径 | 修前行为 | 修后要求 |
|---|---|---|
| M1 读取退化记录（`advance` 无进度字段） | 静默报第 0 步 | 若保留字段：读侧只在**有真实写入**时给值，退化记录如实缺省且可解释；若删字段：读数整体消失 |
| M3 批内超限 | 全批落账（20 张） | 超出项逐项拒 + `REQBOARD_BULK_CLOSE` + `throttleRemainingMs` + 顶层 guidance；**拒绝项零副作用** |
| M3 跨批/单卡 | 已触发节流（既有正确行为） | 不变（回归锚点：`done-throttle-guidance.test.ts:89-129`） |
| M4 需求写抛错 | 队列已取消/已物化，无归还、无留痕 | 补偿回滚队列到回退前；补偿失败 → 明确错误码 + 需求评论留痕（点名受影响卡 id） |
| M4 并发漂移（回调 no-op） | 静默：卡变了、需求没退 | 与抛错同路：补偿 + 留痕（不允许"没抛错就不管"） |
| M4 重复回退 | 幂等（既有正确行为） | 不变（既有测试 TC-8 保绿） |
| M5 认领后再失败（凭证门/跨卡覆盖/引擎不可用） | 回 `todo` + `attempt+1`（凭证门那条已有） | **每一条**出口都归还认领；不允许卡停在 `in_progress` 等 3 分钟孤儿回收 |
| M5 认领进程崩溃（真失联） | 无（当时状态还没写） | 超 `orphanTimeoutMs`（3min）由既有孤儿回收接管重派；接管前不得二次派发 |
| M5 两路并发 | 双跑（`workflow.start` ×2） | 第二路明确拒绝（错误码 + 指引），不新增执行记录 |
| 四条共同：他窗并发编辑同一文件 | — | 冲突点位名不入本批；本批每项独立可 revert |

## 回归

- **回归命令**（每条修复都按「先红 → 后绿」跑同一命令，读数入任务卡）：
  `npx vitest run <该文件>`；收口时按 §验收标准 2–4 的集合跑，并复核全量无新增红。
- **回归覆盖**：必须覆盖本条的原复现路径本身，且**修前读数**与 §复现步骤 一致——
  M1 至少覆盖「链跑过一步 vs 退化记录」两种读数；M3 至少覆盖「单批 20 张」「同批 ≤N 张」
  「跨批触发」「子卡豁免」四种；M4 至少覆盖「需求写抛错」「漂移 no-op」「正常回退的事件/version」
  「重复回退幂等」四种；M5 至少覆盖「并发两路」「认领后凭证门失败」「认领后跨卡覆盖」
  「失联超时被孤儿接管」四种。
- **禁顺手重构**：修 M1 时不动 `advance.history`/`lockAt` 的写入；修 M3 时不动
  `DoneEvidenceSpec` 判据；修 M4 时不动 I-11 顺序与回退编排（撤销半边）；修 M5 时不动
  凭证门基准与孤儿阈值（`LIMITS.orphanTimeoutMs`）。
- **基线刷新纪律**：只有确认「非本次引入」才允许刷新测试/提示词基线，
  且刷新处逐条写理由（禁改断言转绿）。
- **防复发**：M3 的超限拒绝、M5 的并发拒绝都必须给**确定指引**（照 `throttleGuidance` 的样式），
  否则下一次只是把"静默双跑"换成"agent 硬试到通"。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| M1 接上还是删除 | 直接接上（写真实 checkpoint） | **待设计钉死**，本需求要求二选一并写明取舍 | 链是并行批次执行，「当前子卡」在批内不唯一；接上必须先定义语义，否则只是换一种假数据（详见设计） |
| M1 是否保留 runId | 连 runId 一起删 | 保留 | `advance.runId/lockAt` 是**活锁**（`AdvanceChain.ts:685-693`），删了会破推进锁与 stale 接管 |
| M3 批内计节流 vs 限数量 | 全批计节流（等于批量必被拒） | **设计钉死**：限批内 done 数（倾向）或批内计节流 | 上一版明确否决「同批互相触发节流」（`REQ-261007100513-6749/design/interfaces.md` 取舍表），理由是批量会被整体拒；限数量能保住小批可用、又把绕过额度从 20 压到 N |
| M4 补偿 vs 调换写序 | 需求先写、任务后写 | 保留 I-11 顺序 + 加补偿 | 调序会把失败现场换成"需求退了、旧卡还活着"，直接破坏重拆幂等与完整性门；I-11 是全仓既有契约（t12 打点钉着） |
| M4 补偿触发条件 | 只在抛错时补偿 | 抛错 **∪** 漂移 no-op | 漂移 no-op 是同一类半成品（卡变了、需求没退），放过它就等于留一条静默分支 |
| M5 认领前置的代价 | 保持"先执行后认领"（改动最小） | 认领前置 + 全失败出口归还 | 原始动机（凭证门基准）已由 `chainBaselineOf` 取代；不前置则并发双跑无法在入口挡住 |
| M5 失联卡怎么办 | 认领后一律拒绝再派（防双跑最严） | 拒绝 + 超时交孤儿回收 | 一律拒绝会把崩溃恢复变成人工介入，链卡死；3min 孤儿阈值是既有机制（`orphan-collector.ts:20-70`） |
| 四条是否合并成一个任务 | 合成一张大卡 | 四条各自独立、可单独回滚 | 需求描述明确「每步独立可回滚」；四条根因不同、回归不同 |

## 技术方案与亮点

（细节写进 `design/fix-design.md`；此处只列本需求的取舍与可核验指向。）

- **M1**：优先「删除死字段」形态——读侧不再回报无人写入的进度，比"接上后仍只能给批内某一卡"更诚实；
  若接上，则必须在 `AdvanceChain` 已有的 `advance` 写入点内同笔落字段（不新增写路径），
  并把「并行批次下 `currentSubtaskId` 的唯一性」写进设计。
- **M3**：新增一个批量内**计数**语义（`ctx` 上累计本批已判定通过的 done 项），
  超 N 的项按既有 `REQBOARD_BULK_CLOSE` 结构拒绝并给出确定指引——不新造错误码，
  复用既有 guidance 文案生成器（`throttleGuidance`）。
- **M4**：补偿走**同一队列存储的一次 mutate**（按 id 恢复 pre-image + 移除本轮物化的重做卡），
  与既有「台账无回滚」的单项隔离纪律不冲突（补偿是显式的跨存储归还，不是事务）；
  事件补齐落在「计划生成」与「落库白名单」两处，避免第二份口径。
- **M5**：认领点放在全部门禁之后、派发之前；把"归还认领"抽成一个局部函数，
  让 `REQBOARD_CROSS_CARD` 等早退路径与既有 catch 共用同一出口（单一收敛点）。
- **与常规做法的差异**：不引入事务/文件锁（H3 未决前不铺跨进程假设），
  四条都在**现有唯一收敛点**上收口，并以"先红后绿"读数作为交付证据。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | reqboard 代理立项留痕（2026-10-08，需求描述原文；授权来源 = 本窗口收到的直接人工指令）：「修复体检报告 §2.2 遗留的四个中危 bug……接上或删除，设计中写明取舍……批内计节流或限批内 done 数……加补偿或调写序 + 补事件……改先认领后执行」 | 范围 = M1/M3/M4/M5 四项，每项**二选一取舍写进设计文档**；不做 M2/M6（前批已收）、不做 H/L 类 | BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 | 本文档 §缺陷条款 的 BUG-1/2 分支判据 + §验收标准 6（取舍与实现一致） |

## 修订记录

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：承接体检 §2.2 剩余四项、补 5 条 BUG 条款与本次实测复现读数、D-1 落账 | session-9574f815 |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| BUG-1 | ✅ 已接收 | t1、t-f33d47 |
| BUG-2 | ✅ 已接收 | t2、t-20f5dc |
| BUG-3 | ✅ 已接收 | t3、t-6969c5 |
| BUG-4 | ✅ 已接收 | t4、t-869f61 |
| BUG-5 | ✅ 已接收 | t5、t-1bb2e9 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
