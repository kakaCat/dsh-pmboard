---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 修复 reqboard 自动化断链：Dive 无法重新武装 + 自动实施链投递失败

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**轻档**（依据见文末「档位依据与单向升级」） ｜ 立项：2026-10-02
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话：**让自动化断掉之后「看得见、能一键接回、原因不被锁和渲染错误掩盖」。**

现场来自 2026-10-02 的 `REQ-261002161439-277d` 实施窗口（`session-8c9338a3`）。该窗口 12 个回合全部正常收尾，**没有崩溃**——但两条自动化通道同时死掉，之后每一步都靠人手动打「继续」：

| 通道 | 死因 | 关键证据 |
|---|---|---|
| Dive 自动续跑 | 08:31:11 agent 为解死锁调 `reqboard_clear_pause` → `disarmed+idle`，而这是设计上的不可恢复态 | `rearm.ts:61-64` 只救 `paused` 与 `disarmed+active`；`wake-heartbeat.ts:109` 对非可驱动需求直接 skip |
| 自动实施链 | 首次投递即失败：`session "[object Object]" has no live agent`；失败后**不回收锁** → 后续 15 分钟全被 `REQBOARD_ADVANCE_LOCKED` 挡下 | `AdvanceChain.ts:506-507` 先认领锁、`:524` 失败不回滚；实测 16:36:10 被拒 |

叠加一个放大器：`reqboard_clear_pause` 副作用生效却返回 `INVALID_TOOL_OUTPUT: output.render failed: userRender is not a function`——全仓只有它（与已弃用的 TaskExecute）没声明 `output.render`。调用方因此**无法判断锁开没开**。

本需求只做 4 件事：投递失败回收锁、owner 失败可诊断、看板「继续」能重新武装、补上 `clear_pause` 的渲染。**不动** Dive 驱动架构、不动存储层。

## 断链流程图（现状 → 目标）

```
 现状（一次死锁 → 终身手动）                    目标（失败响亮 + 人一键接回）
 ────────────────────────────────              ──────────────────────────────
  计划批准                                      计划批准
     │  settle 自动拆分被门禁拦下（t10 缺 refs）      │  settle 投递失败
     ▼                                            ▼
  0 张卡落库                                    失败留痕（可读原因）+ 锁已回收
     │                                              │
     ▼                                            ▼
  agent 手动 decompose ←── 被 DIVE_ARMED 拒      下一次 task_run 立即可重试
     │                                              │
     ▼                                            ▼
  clear_pause 解死锁                             人点看板「继续」
     │  ⇒ disarmed + idle                          │  ⇒ armed + active（留痕）
     ▼                                            ▼
  ✗ 无任何回程（rearm 拒绝 / 心跳 skip）          Dive 起轮，链续跑
     │
     ▼
  人工逐卡打「继续」⇒ 回合耗尽即静默停摆
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 投递失败不留锁 | 注入必失败的 Jobs 端口 → 调 `reqboard_task_run` | 返回 `dispatched:false`；台账 `advance.lockAt` 与 `advance.runId` **均为 undefined**；紧接着再调一次得到 `dispatched:true`（不再 `REQBOARD_ADVANCE_LOCKED`） |
| A2 失败原因可诊断 | 同上场景，读台账 comment / `advance.history` | 出现含 `requirementId` 与失败分类的可读记录（如 `owner_unresolvable` 或 `dispatch_failed`）；**全文不含 `[object Object]`** |
| A3 可降级不空转 | 同上场景（`deps.jobs` 不可用分支） | 走同步推进路径，一步一个 `advance.history` 事件，而不是"投递失败后什么都不发生" |
| A4 人能一键接回 | 造一个 `disarmed+idle` 的需求 → 走看板「继续」（`POST /req/autorun` `on:true`） | 台账变 `activation=armed`、`phase=active`（`driverHealth` 非 paused 时归 healthy）；并有一条人工留痕 comment |
| A5 幂等 | 对已 `armed` 的需求重复点「继续」 | 台账零变更（version 不变），不重复写 comment |
| A6 人的意图不被自动改写 | 对 `disarmed+idle` 需求只跑自动路径（心跳 tick / 需求移动事件） | `activation` 仍为 `disarmed`（**除人显式动作外零改写**） |
| A7 clear_pause 不再假报错 | 调 `reqboard_clear_pause`（armed 需求） | 返回 `success:true` 且 `previous_activation:"armed"`；**不再**出现 `INVALID_TOOL_OUTPUT` / `userRender` |
| A8 渲染与其余工具同源 | 静态检查 `src/tools/*/*Tool.ts` | 除已弃用别名外，**每个工具**都声明 `output.render`；新增用例锁死这条性质 |
| A9 工具面零回归 | `npx vitest run tests/` | 失败数 ≤ 基线 **106**，且新增用例全绿 |
| A10 类型与构建 | `pnpm typecheck` / `pnpm build` | 类型错误 ≤ 基线 **223**；构建退出码 0（C-11 / C-15） |

## 边界

- **做**：① 投递失败回收 `advance` 锁；② 投递失败可诊断（不留 `[object Object]`）与可降级；③ 看板「继续」对 `disarmed+idle` 重新武装；④ 补 `reqboard_clear_pause` 的 `output.render`。
- **不做**：Dive 驱动架构重写、自动链「团队执行」分支改造、唤醒心跳策略调整（只做验证不改行为）。
- **不做**：存储层 / 分片 / SQLite 适配（属 `REQ-261002161439-277d`）；**不**新增 agent 侧"武装"工具（改"人的意图"只允许人来）。
- 没写进边界的即本次不做。

## 产品定义

reqboard 的自动化有两条通道：**Dive 起轮**（谁在什么时候叫醒窗口）与**自动实施链**（任务卡按 DAG 自己往下跑）。

本需求把这两条通道的**故障语义**修成可恢复：断掉要留可读的原因、不能顺手把重试锁死、并且必须给人留一个显式的接回开关。

一句话：**自动化可以坏，但不能坏得无声、坏得锁死、坏得没人能接回来。**

## 用户与角色

| 角色 | 是谁 | 在本需求里关心什么 |
|---|---|---|
| 需求负责人（人） | 看板 + 对话里的决策者 | 「它不动了」要一眼看出为什么；点一下「继续」就能接回 |
| 窗口 agent | 在需求窗口里干活的执行体 | 调用 `clear_pause` / `task_run` 要拿到**可信**返回值；失败要有恢复指引 |
| 看板操作者 | 同一个人，在 `/dashboard#pmboard` | 「继续」按钮的语义要覆盖"我改主意了，让它自动跑" |

## 功能点

- **FR-1: 自动链投递失败必须回收推进锁**

  现状：`AdvanceChain.ts:506-507` 在 `jobs.start` **之前**认领 `advance.lockAt/runId`，`:524` 的 catch 只返回失败、**不回滚**。锁的 stale 阈值是 `LIMITS.advanceLockStaleMs = 15 分钟`（`src/domain/limits.ts:46`），期间任何重试都被 `REQBOARD_ADVANCE_LOCKED` 挡下（2026-10-02 16:36:10 实测）。

  要求：投递失败分支必须先清除 `lockAt/runId` 再返回，使重试立即可行；同时保证"真跑着的 run 不被误清"（成功路径与 stale 回收语义不变）。

- **FR-2: 投递失败的原因必须可诊断，并且不静默空转**

  现状：`AdvanceChain.ts:517` 把 `exec.agent` 原样交给 `DshJobsAdapter.start`（`DshJobsAdapter.ts:139-144`）；自动化 settle 路径下该 owner 被判"不是 live agent"，错误文本里 owner 被字符串化成 `[object Object]`，`advance.history` **长度为 0**（一步都没跑），人也看不出发生了什么。

  要求：owner 不可解析时给出**可读分类**（如 `owner_unresolvable`）并留痕（comment + `advance.history` 事件）；在 `deps.jobs` 不可用或 owner 不可解析时，**降级为同步推进**（该分支已存在）而不是"投递失败后什么都不发生"。

- **FR-3: 看板「继续」必须能把 `disarmed+idle` 的需求接回自动化**

  现状：`rearm.ts:61-64` 只恢复 `driverHealth=paused` 与 `disarmed+active`；agent 为解死锁调的 `clear_pause` 写的正是 `disarmed+idle`（`ClearPause.ts:82-83`），于是该需求**终身失去自动化**——看板「继续」（`requirements.ts:491`）也救不回来。

  要求：看板 `POST /dashboard/api/reqboard/req/autorun`（`on:true`，**仅人可经看板触发**）对 `disarmed+idle` 也置 `armed + phase=active`，并留一条人工留痕；自动路径（心跳 / 需求移动）**一律不改写** `disarmed+idle`。

- **FR-4: `reqboard_clear_pause` 补 `output.render`，工具不再假报错**

  现状：`ClearPauseTool.ts:25-36` 只声明 `output.schema`，**没有** `output.render`；全仓 20+ 工具都用 `renderSmart(...)`（`src/tools/shared.ts`），只有它与已弃用的 `TaskExecuteTool` 例外。2026-10-02 实测：副作用（`armed → disarmed`）确实生效，但调用方收到 `INVALID_TOOL_OUTPUT: output.render failed: userRender is not a function`，**无法判断锁开没开**。

  要求：补上与其余工具同源的 `render`；返回体四键（`success` / `requirement_id` / `previous_activation` / `message`）与无损 JSON 纪律（缺值整体省略）保持不变；加用例锁死"每个工具都声明 render"。

## 接口（对外入口）

| 入口 | 谁调用 | 输入 | 输出 / 错误语义 |
|---|---|---|---|
| `reqboard_clear_pause`（既有工具） | 窗口 agent | `{ requirement_id?: string }` | 返回体**不变**；本次只补 `output.render`（首行中文摘要 + JSON 明细） |
| `reqboard_task_run`（既有工具） | 窗口 agent | `{ task_id? , requirement_id? }` | 失败时返回可读 `reason`；**副作用修正**：失败不再留 `advance.lockAt/runId` |
| `POST /dashboard/api/reqboard/req/autorun`（既有路由） | 看板（人） | `{ id, on:true, reason? }` | `on:true` 语义增补：`disarmed+idle` → `armed+active`；沿用既有 `advanceNote` 通道说明结果，**不新增返回键** |
| 内部：`AdvanceChain` 投递段 | 自动链 / settle | 既有 | 失败返回 `{ dispatched:false, reason }` + 台账留痕 + 锁已回收 |

## 数据契约

- **不新增台账字段**，`schemaVersion` 不变；复用 `dive.activation` / `dive.phase` / `dive.driverHealth` / `advance.lockAt` / `advance.runId` / `advance.history`。
- 取值枚举不变：`activation ∈ {armed, disarmed}`，`phase ∈ {active, idle, paused}`。
- 新增 comment 一律走既有 `comments` 追加通道（`createdBy.kind` 用 `human` 或 `system`，与既有惯例一致）。
- 若实现确实需要新错误码，只允许新增导出常量（`REQBOARD_*`），不改既有错误码语义。

## 迁移与兼容

| 项 | 处置 |
|---|---|
| 存量 `disarmed+idle` 需求（含 `REQ-261002161439-277d`） | **不自动改写**（"人的意图"只能由人改）；需要人点一次看板「继续」 |
| 存量 `disarmed+active` / `driverHealth=paused` | 行为不变（既有 `rearmIfRecoverable` 路径不动） |
| 旧客户端 | 路由与工具返回键均不变，无需同步；看板无需改文案即可用 |
| 回滚 | 撤回 FR-3 的分支即回到现状；FR-1/FR-2 回滚只影响失败路径；FR-4 回滚会重现假报错 |

## 验收（怎么跑）

```
# 1. 目标用例（含本次新增）
npx vitest run tests/advance-stale-lock.test.ts tests/dive-rearm.test.ts \
               tests/dive-round-state.test.ts tests/clear-pause-lossless.test.ts

# 2. 类型（C-15：不高于基线 223）
pnpm typecheck

# 3. 全量（C-14：失败数 ≤ 基线 106，且新增用例全绿）
pnpm test

# 4. 构建（C-11）
pnpm build

# 5. 端到端（人工，一次即可）
#   对 REQ-261002161439-277d 点看板「继续」→ 读台账：
#   dive.activation=armed 且 phase=active；下一拍 dive.roundsInStage +1（Dive 确实起轮）
```

## 档位依据与单向升级

**为什么可以走轻档**：

- 改动面小：3 个源文件（`AdvanceChain.ts` 投递段、`requirements.ts` 的 autorun 分支、`ClearPauseTool.ts` 的 output），加测试。
- 无新决策点：4 条 FR 都是"把既有语义补完整"，产品定义与角色不变，不新增工具、不新增台账字段。
- 可证伪：每条 FR 都有可跑的断言（A1–A8），端到端只有一条人工步骤。

**单向升级信号（出现任一条立即停手升级为重档，不许反向降级）**：

- 发现 owner 问题必须改 `JobsPort` / 宿主 owner 契约（= 动架构）；
- 发现需要区分「人触发的 clear_pause」与「agent 触发的 clear_pause」而必须新增台账字段（= 改数据模型）；
- 发现需要改动 Dive 驱动/唤醒心跳的状态机（= 新增子系统行为）。

## 批准闸门

本产物经人确认后方可进入 design（`reqboard_ask_confirm(target=artifact, kind=requirement)`）。未获批准不进入下一步。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t2、t5 |
| FR-2 | ✅ 已接收 | t2、t5、t1 |
| FR-3 | ✅ 已接收 | t5、t3 |
| FR-4 | ✅ 已接收 | t5、t4 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
