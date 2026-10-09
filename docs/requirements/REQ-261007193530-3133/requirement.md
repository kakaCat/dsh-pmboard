---
requirement_id: REQ-261007193530-3133
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 需求说明（REQ-261007193530-3133）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 排版纪律：段落不超过 4 行；并列项用列表或表格；图一律 ASCII，禁用 mermaid。

## TL;DR

- **现象**：reqboard 插件体检报告（REQ-261007165643-4275，已归档）裁决的第 1 批边界 bug 共 4 处：
  人工门否定作答必抛硬错误（H1）、看板可把子卡推进非法态（H2-role）、
  需求取消可被 agent 复活（M2）、时钟漂移下节流剩余时间超上限（M6）。
- **代价**：H1 让「需要修改/暂停」不留反馈的作答从软回执变成无信息 ToolOutputError；
  其余三处各开一条绕过状态机纪律的缝。
- **做完得到**：四处收敛点各归其位——弹框回执 JSON 安全、HTTP 面与工具面同一张转移表、
  复活边与任务侧对称挂人工门、节流读数钳进 [0, 60s]。

## 背景与证据

证据全文：`docs/requirements/REQ-261007165643-4275/design/research-report.md`（§2.1 H1/H2、§2.2 M2/M6）；
长期摘要：`docs/strategy-research/reqboard-plugin-audit-2026-10-07.md`。
本窗口已逐一复核四处现场，行号与报告一致（2026-10-07 工作树基线）：

| 编号 | 现场 | 病灶 |
|------|------|------|
| H1 | `src/application/use-cases/AskConfirm.ts:449` | 否定作答无反馈时 `user_feedback: undefined` 进回执，snapshotJsonValue 校验必抛「value is not lossless JSON」 |
| H2-role | `src/http/routers/tasks.ts:131` | `handleTaskMove` 调 `transitionTask` 不传 `role`，缺省 `legacy` → 子卡可被看板推进 integrating/testing/in_review（SUBTASK_TRANSITIONS 无出边的非法态） |
| M2 | `src/domain/requirement/RequirementStatus.ts:112` | `HUMAN_ONLY_REQ_TRANSITIONS` 缺 `canceled>draft`：agent 可撤销人做的取消（任务侧 canceled→todo 已挂人工门，不对称） |
| M6 | `src/domain/workflow/DoneEvidenceSpec.ts:76-80` | `h.at` 在未来（时钟回拨/漂移）时 `left = throttleMs - (now - h.at) > throttleMs`，throttleRemainingMs 超 60s 上限 |

范围说明：H2 的另一半（HTTP 面加 human_gate 鉴权模型）按报告 4.0 节需一次小型设计，
**不在本批**；H3（跨进程锁）依赖部署拓扑裁决，不在本批；M1/M3/M4/M5 按报告建议属后续批次。

## 业务流程图

```
【FR-1 H1】
人 ─弹框点「需要修改/暂停」（不留反馈）─▶ AskConfirm 软回执
   修前：user_feedback: undefined ─▶ snapshotJsonValue 必抛 ToolOutputError（无信息硬错误）
   修后：条件展开，无反馈即不带该键 ─▶ 软回执正常返回（confirmed:false + user_choice）

【FR-2 H2-role】
看板 ─POST /tasks/move（子卡 → integrating/testing/in_review）─▶ handleTaskMove
   修前：transitionTask 缺省 role='legacy' ─▶ 走存量卡转移表 ─▶ 非法态放行
   修后：按 parentId/子卡存在性判角色（与 MoveTask.roleOf 同口径）─▶ 子卡转移表拒

【FR-3 M2】
agent ─reqboard_move(canceled → draft)─▶ assertReqTransition
   修前：canceled>draft 不在人工门 ─▶ agent 复活人取消的需求
   修后：canceled>draft ∈ HUMAN_ONLY_REQ_TRANSITIONS ─▶ human_gate 拒绝；人操作正常放行

【FR-4 M6】
时钟回拨（h.at > now）─▶ doneThrottleRemainingMs
   修前：left = 60s - 负值 > 60s ─▶ 节流读数超上限
   修后：clamp 到 [0, throttleMs] ─▶ 读数恒 ∈ [0, 60s]
```

## FR-1 弹框否定作答无反馈时 user_feedback 不落 undefined（H1） <!-- serves: FR-1 -->

**是什么**：`AskConfirm.ts:449` 把 `user_feedback` 改为条件展开——有反馈才带该键，无反馈该键整体缺席。

**为什么**：dsh-tools 的 snapshotJsonValue（walkJsonValue 对 undefined 返回 void 0）会把
含 undefined 的回执打成「value is not lossless JSON」硬错误。软回执（未落章、未推进）必须
原样回到 agent，让它拿到 user_choice 后按意见修改。与已修的 RunStatusTool null 透传事故同类，
纪律同源：**降级形状必须能通过自己的 schema**。

**可核验判据**：
- `grep -n "user_feedback" src/application/use-cases/AskConfirm.ts` 显示条件展开
  （`...(userFeedback.length > 0 ? { user_feedback: userFeedback } : {})` 或等价写法），不存在 `user_feedback: undefined` 路径；
- 单测模拟「否定作答 + 空反馈」：回执 `success:true, confirmed:false`，无 ToolOutputError，
  `JSON.stringify` 回执不抛错且 `user_feedback` 键缺席。

## FR-2 handleTaskMove 按角色校验任务转移（H2-role） <!-- serves: FR-2 -->

**是什么**：`src/http/routers/tasks.ts` 的 `handleTaskMove` 调 `transitionTask` 时传入 `role`，
角色判定与工具面同口径（有 parentId = subtask；有子卡 = parent；否则 legacy）。

**为什么**：`transitionTask` 缺省 `role='legacy'` 用存量卡转移表，子卡经看板（HTTP 面）
可进 integrating/testing/in_review——这些状态在 SUBTASK_TRANSITIONS 里无出边，进去即卡死。
工具面（MoveTask.ts:232 roleOf）早已按角色分表，HTTP 面必须与它同一张表。

**边界**：本卡只修 role 传递；HTTP 面的 actor 鉴权（H2 另一半）不在本批，文档如实声明。

**可核验判据**：
- `grep -n "role" src/http/routers/tasks.ts` 显示 `transitionTask` 调用带 `role` 参数，
  且角色判定逻辑与 `MoveTask.ts` 的 `roleOf` 同口径（parentId → subtask，有子卡 → parent）；
- 单测：子卡经 `handleTaskMove` 推 integrating 被拒（invalid_transition）；
  存量卡 todo→in_progress→testing 老路径不受影响。

## FR-3 需求 canceled→draft 复活边挂人工门（M2） <!-- serves: FR-3 -->

**是什么**：`RequirementStatus.ts` 的 `HUMAN_ONLY_REQ_TRANSITIONS` 增加 `canceled>draft`。

**为什么**：取消需求是人工门（各阶段 >canceled 全在表里），复活却是敞口——agent 可以撤销
人刚做的取消，与任务侧 `canceled>todo` 已挂人工门不对称。对称纪律：破坏性动作与其逆动作同门。

**非目标**：`canceled>archived`（取消后归档）是否同挂人工门不在本批（报告未裁决，维持现状）。

**可核验判据**：
- `grep -n "canceled>draft" src/domain/requirement/RequirementStatus.ts` 命中
  HUMAN_ONLY_REQ_TRANSITIONS 集合；
- 单测：actor=agent 走 canceled→draft 抛 `code:'human_gate'`；actor=human 正常放行；
  `agentNextActions('canceled')` 返回值不再含 `draft`（派生自检，无需手改）。

## FR-4 节流剩余时间 clamp 到 [0, throttleMs]（M6） <!-- serves: FR-4 -->

**是什么**：`DoneEvidenceSpec.ts` 的 `doneThrottleRemainingMs` 把单条历史读数
`left = throttleMs - (now - h.at)` 钳进 `[0, throttleMs]` 后再参与取大。

**为什么**：`h.at` 在未来（时钟回拨/漂移/跨机写入）时 left > throttleMs，
throttleRemainingMs 可超 60s 上限，拒绝文案告诉 agent「等 90 秒」这类不可能读数。
读数契约：返回值恒 ∈ [0, throttleMs]。

**可核验判据**：
- `grep -n -A5 "throttleMs - (now" src/domain/workflow/DoneEvidenceSpec.ts` 可见 clamp
  （Math.min/Math.max 或等价）；
- 单测：构造 `h.at = now + 30_000`（未来 30s），返回 ≤ throttleMs（60_000）；
  正常历史（h.at 在过去 10s）读数不变（≈50_000）。

## 失败与并发路径

- **失败路径**：四处修复全部在既有收敛点内（AskConfirm 回执构造 / transitionTask /
  assertReqTransition / doneThrottleRemainingMs），收敛点纪律「失败 = 抛错且不改动任何字段」
  不变；FR-1 修后回执不含 undefined，不再触发 snapshotJsonValue 硬错误。
- **并发重复**：FR-2 的角色判定是读时派生（parentId / 子卡存在性），不写新字段，
  无跨存储一致性问题；mutate 回调内判定，与既有写事务同生命周期。
- **状态机非法迁移**：FR-2 修复后子卡非法态入口被堵，但**存量已卡进非法态的子卡不迁移**
  （报告未要求数据修复；如验收时发现存量卡死数据，另立修缮项）。
- **不适用**：FR-3/FR-4 为纯判定逻辑收紧，无新状态、新边、新存储。

## 复现步骤

| 编号 | 最小重现 |
|------|---------|
| H1 | 任一人工门弹框选「需要修改/暂停」且不填反馈 → 回执含 `user_feedback: undefined` → snapshotJsonValue 抛「value is not lossless JSON」 |
| H2-role | 看板把一张子卡（有 parentId）推向 integrating/testing/in_review → HTTP 面放行，子卡卡死（SUBTASK_TRANSITIONS 无出边） |
| M2 | agent 调 `reqboard_move` 把 canceled 需求推向 draft → 放行，人做的取消被 agent 撤销 |
| M6 | 任务 statusHistory 出现未来时间戳（h.at > now，时钟回拨/漂移）→ throttleRemainingMs 读数超 60s，拒绝文案出现「还需等待 90 秒」类不可能值 |

## 根因

- **H1**：`AskConfirm.ts:449` 显式写 `user_feedback: undefined`——JSON 无损契约要求键**缺席**而非 undefined（与已修的 RunStatusTool null 透传事故同类：降级形状必须能通过自己的 schema）。
- **H2-role**：`handleTaskMove` 调 `transitionTask` 缺省 `role='legacy'`——HTTP 面是收敛点的漏接调用方，子卡走了存量卡转移表。
- **M2**：`HUMAN_ONLY_REQ_TRANSITIONS` 收齐各阶段 `>canceled` 却漏了复活边 `canceled>draft`——与任务侧 `canceled>todo` 已挂人工门不对称。
- **M6**：`doneThrottleRemainingMs` 对单条历史读数只兜下界（`remaining > 0`），没兜上界。

## 边界

- 本批只做四处运行时行为修复：H1 条件展开、H2-role 传 role、M2 复活边人工门、M6 读数 clamp。
- **不做**：H2 的 HTTP 面 actor 鉴权模型（需一次小型设计，另立项）；H3 跨进程写锁；M1/M3/M4/M5 后续批次；`canceled>archived` 是否挂人工门（报告未裁决，维持现状）；存量已卡非法态子卡的数据迁移（如发现，另立修缮项）；任何顺手重构与工具 schema/prompt 文案改动。

## 回归

- FR-1 → `tests/ask-confirm.test.ts`：否定作答 + 空反馈，回执 JSON 无损、`user_feedback` 键缺席。
- FR-2 → 新建 `tests/http-task-move-role.test.ts`：子卡经 HTTP 面推非法态被拒且字段零改动；存量卡老路径放行。
- FR-3 → `tests/domain/requirement-status.test.ts`：agent 走 canceled→draft 抛 `human_gate`；human 放行；`agentNextActions('canceled')` 不含 draft。
- FR-4 → `tests/done-throttle-guidance.test.ts`：未来时间戳读数 ≤ 60s；正常历史读数不变。
- 全量：`pnpm test` 与基线比对无新增失败；`pnpm typecheck` 退出码 0。

## 验收标准（汇总）

1. 四条 FR 的可核验判据全部通过（grep 证据 + 单测），新增/修改测试进既有测试体系；
2. `pnpm test` 全绿且与基线比对无新增失败，`pnpm typecheck` 退出码 0，无回归；
3. 四处修改均为最小 diff：FR-1 一行级、FR-3 一行级、FR-4 行内 clamp、FR-2 仅 tasks.ts
   一个函数内加角色判定与传参（角色判定函数可复用或内联同口径）；
4. 不夹带：H2 鉴权模型、H3、M1/M3/M4/M5、存量非法态数据迁移均不在本批。

## 回滚

四个文件各自独立可回滚（`git revert` 单提交即可）；无数据迁移、无台账格式变化、无配置项。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-876170、t-68c6fb |
| FR-2 | ✅ 已接收 | t-b6ca79、t-68c6fb |
| FR-3 | ✅ 已接收 | t-db8f7a、t-68c6fb |
| FR-4 | ✅ 已接收 | t-a5ca0d、t-68c6fb |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
