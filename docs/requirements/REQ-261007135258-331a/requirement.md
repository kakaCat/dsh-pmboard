---
req: REQ-261007135258-331a
sides: [backend]
---

# REQ-261007135258-331a · 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点

## TL;DR

- 「人确认产物」这件事在四条通道里各有各的代码：**落章已统一，推进有三份，收尾只做了一半**。
- 后果已经真实发生：REQ-261007101318-c392 在 brainstorming **静默停摆 2.5 小时**（台账有 `awaiting-enter`、无 `awaiting-exit`，期间零唤醒）。
- 做完得到什么：确认一次 = 落章 + 推进 + 清停手位 + 复位运行时健康，**四通道逐项对拍一致**，并由一条用例锁死回归。

## 现状取证（2026-10-07 实测）

### 四条确认通道 × 五件事的接线矩阵

| 确认通道 | 入口 | 落章 | 推进 | 清停手位 | dive 复位/回合归零 | 链投递 |
|---|---|---|---|---|---|---|
| 会话弹框（含超宽限挂起后台） | `reqboard_ask_confirm` → `settleAnswers` | `stamp*Once` 共享 | `applyConfirmDecision` → `applyConfirmedAdvance` 统一 | 有（带 ref await） | 有 | 有 |
| Dive 门框 | `createGatePromptPort` | 共享 | 同一个 `applyConfirmDecision` | 有 | 有 | 有 |
| 文字证据 | `reqboard_confirm_artifact` | 共享 | **自己内联** | **无** | 有 | — |
| 看板一键 | `POST /req/artifact/confirm` | 共享 | **自己内联** | **无** | **无** | 有（自己 enqueue） |

### 可复核的行号与判据（不是推断）

| 缺口 | 位置 | 复核命令（命中即证据） |
|---|---|---|
| 看板推进内联 | `src/http/routers/requirements.ts:512-538` | `grep -n "transitionRequirement(" src/http/routers/requirements.ts` |
| 看板不清停手位、不复位 dive | 同上文件 | `grep -n "awaiting\|applyDiveTransition" src/http/routers/requirements.ts` → **0 命中** |
| 看板推进额外要求窗口在线 | `src/http/routers/requirements.ts:479-484` | 读该分支：窗口不在线 ⇒ `advanced:false` |
| 文字证据推进内联 | `src/application/use-cases/ConfirmArtifact.ts:218-273` | `grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts` |
| 统一实现（收敛点） | `src/application/internal/confirm-settle.ts:239`（`applyConfirmedAdvance`）、`:301`（`applyConfirmDecision`） | `grep -n "export async function applyConfirmedAdvance" src/application/internal/confirm-settle.ts` |
| 门禁回执指路到人工门 | `src/application/internal/decision-gates.ts:182`、`:195`、`src/application/internal/stage-gate-timeline.ts:359` | `grep -n "reqboard_move" src/application/internal/decision-gates.ts` |
| 文档口径比实现宽一格 | `docs/requirements/REQ-261006170150-52cc/requirement.md:92`（写「任何确认通道」）vs `design/use-cases.md:26`（看板交给 TTL 兜底） | 逐行对读 |

### 事故链（本需求的存在理由）

```
人点「确认」 ──▶ 落章 ✅ ──▶ 内容门拒（裁定表 D-2 无效）──▶ 推进 ✘
                                                    │
              ┌─────────────────────────────────────┘
              ▼
     门禁回执指路「调 reqboard_move」 ──▶ agent 无权（humanOnly）──▶ 无路可走
              │
              ▼
     弹框停手位未清 ──▶ isDrivableRequirement=false ──▶ 2.5 小时零唤醒（静默停摆）
```

## 业务流程图

```
人（四通道之一：弹框 / 门框 / 文字证据 / 看板）
      │ 点「确认」
      ▼
  落章（首写即事实，四处共用同一单点）── 章已落、迁移未发生 ⇒ 仍可补推进
      │
      ▼
  内容门（原型三门 / 裁定门；不过 ⇒ 落章保留、推进不执行、回执如实报）
      │ 过
      ▼
  推进（本需求要求：唯一实现 applyConfirmedAdvance）
      │
      ▼
  收尾（本需求要求：清停手位 + 复位运行时健康，四通道同一处）
      │
      ▼
  自动链起轮 ──▶ agent 被唤醒，进入下一阶段（无需人再发消息）
```

## 产品定义

这是**确认通道的接线收敛**：把「人确认产物」之后要发生的事，从"四条通道各写一套"收敛成
**一份实现 + 一份收尾**，让"确认了就该动"成为结构上的性质，而不是靠四处约定维持的巧合。

核心价值：**消灭「状态变了 / 章落了，agent 却不动」这一整类故障**，并让下一次新增通道时不会重蹈。

与现状的区别：今天四条通道的落章已共享（`stampArtifactOnce` / `stampPlanOnce`），但推进实现有三份、
收尾缺两处；本需求只做"把剩下的线接上"，**不新增门、不动 UI、不改投影键**。

## 用户与角色

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 需求提出者 / 人 | 在弹框、门框、看板任一通道点「确认」 | 确认后要不要再发一句"继续"，取决于走的是哪条通道 |
| agent（窗口） | 人工门确认后应被唤醒继续下一阶段 | 有时被叫、有时不被叫；不被叫时自己也无权推进（humanOnly 门） |
| 维护者 | 新增/修改一条确认路径 | 不知道要接哪几件事，漏接不会被任何门禁发现（例如清停手位） |

## 边界

### 做什么

- 把**看板确认**与**文字证据确认**的推进块，换成既有统一实现 `applyConfirmedAdvance`（内容门仍在调用方前置）。
- 把「推进后收尾」收敛成一处：**清停手位**（`exitAwaitingConfirm`）+ **复位运行时健康/回合归零**（`applyDiveTransition('confirm-advance')`），四通道都只经这一点。
- 把**看板推进**与「窗口在线」解耦：推进是台账动作；窗口在线只决定"能否投递"，不决定"能否推进"。
- 把**门禁回执的指路**改成 agent 可执行的统一入口（`reqboard_ask_confirm`），不再指 `reqboard_move`（人工门）。
- 补一条**逐通道对拍用例**，把「落章 / 推进 / 清位 / 复位」四件事锁成一致。

### 不做什么

- 不新增人工门、不改 `G1` 的 `humanOnly` 语义，不做"提交即推进"。
- 不改闸门链的 skip 语义，不改 `NODE_ISOLATION` 的默认值与含义（压缩与唤醒保持解耦）。
- 不复活 H4 直投 inbox 那条旧唤醒通道（Dive 作为唯一唤醒通道的收敛不回退）。
- 不动看板 UI / 投影键 / 渲染（若将来要展示"为什么没起轮"，另开 UI 需求）。
- 不改停手位 TTL 数值与心跳节拍（沿用既有 30 分钟 / 60 分钟分档与 10 分钟停滞阈值）。

### 边界理由

- 只碰"确认之后"的一段，意味着改动面有界、可逐通道对拍；
- 把 UI 排除在外，是因为病灶在台账与驱动前置条件，不在呈现；
- 不改 skip 与开关，是因为本案的诊断结论是"唤醒与否由停手位与窗口在线决定，不由 skip 决定"。

## 功能点（需求条款）

### 功能点清单

| 编号 | 功能 | 优先级 |
|---|---|---|
| FR-1 | 看板确认的推进改走统一实现，行为与另三条通道一致 | P0 |
| FR-2 | 文字证据确认的推进改走同一实现，保留其自有开关语义 | P0 |
| FR-3 | 推进后的收尾收敛为一处：清停手位 + 复位运行时健康 | P0 |
| FR-4 | 看板推进不再以「窗口在线」为前置；在线只影响投递 | P0 |
| FR-5 | 门禁回执的指路指向 agent 可执行的统一入口 | P1 |
| FR-6 | 逐通道对拍用例 + 「确认后无需人干预即起轮」回归锁 | P0 |

### FR-1: 看板确认的推进走统一实现

**谁**：维护者与看板使用者（人）。
**什么场景**：人在看板点「确认产物」，且该确认构成一道可推进的闸门。
**做什么**：看板路由不再自己 `transitionRequirement`，改调 `applyConfirmedAdvance`（内容门与 G2 完整性门仍在调用方前置）。
**看到什么结果**：看板确认后的推进结果与弹框通道**逐字段一致**；台账留痕仍标明来源是看板。

**判据**：
- 命令：`npx vitest run tests/artifact-confirm-board.test.ts tests/confirm-advance-deadlock.test.ts`
- 读数：`grep -n "transitionRequirement(" src/http/routers/requirements.ts` 的输出中，不再出现于「确认即推进」分支（该分支只剩 `applyConfirmedAdvance` 调用）。
- 明确取值：看板确认成功回执 `advanced === true`，且 `history.jsonl` 新增一条状态迁移记录（`status` 由 `from` 变为 `to`）。

### FR-2: 文字证据确认的推进走同一实现

**谁**：agent（窗口）。
**什么场景**：agent 收到用户的明确答复原文，调 `reqboard_confirm_artifact`（带 `evidence`）。
**做什么**：该路径的推进块改调 `applyConfirmedAdvance`；保留其 `advance:false` 时不推进的语义。
**看到什么结果**：落章保留、推进与另三条通道同源；`gate_failure` 回执形状不变。

**判据**：
- 命令：`npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts`
- 读数：`grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts` → **0 命中**（推进只经单点）。
- 明确取值：传 `advance:false` 时回执 `advanced === false` 且台账状态不变。

### FR-3: 推进后的收尾收敛为一处

**谁**：所有四条通道的使用者。
**什么场景**：任一通道完成一次**成功推进**（或"已落章未推进"的补推进）。
**做什么**：在同一处（推进实现的收尾段）做两件事：① `exitAwaitingConfirm`（清本需求 `awaiting-confirm:*` 残影，缺省 ref 形态）；② `applyDiveTransition('confirm-advance')`（复位运行时健康位、按需归零 `roundsInStage`）。
**看到什么结果**：确认之后 `driverHealth.state !== 'paused'`，且**无需人再发消息**即出现一次自动链起轮。

**判据**：
- 命令：`npx vitest run tests/awaiting-clear-notice.test.ts tests/dive-confirm-advance.test.ts`
- 读数：台账 `dive.driverHealth.state` 由 `paused` 变为 `healthy`；`comments.jsonl` 出现 `[Dive 恢复] 等待结束` 一条（`awaiting-exit` 与 `awaiting-enter` 配对）。
- 明确取值：清位成功后 `isDrivableRequirement(req) === true`（`activation=armed` 且健康非 paused）。

### FR-4: 看板推进与「窗口在线」解耦

**谁**：看板使用者（人）。
**什么场景**：人在看板确认，但绑定窗口当前不在线。
**做什么**：推进照常执行（台账动作）；"窗口在线"只决定 `delivered` 与提示文案。
**看到什么结果**：回执 `advanced === true` 且 `delivered === false`，提示"已推进，但窗口不在线未投递"。

**判据**：
- 命令：`npx vitest run tests/artifact-confirm-board.test.ts`
- 读数：`grep -n "窗口不在线" src/http/routers/requirements.ts` 命中处不再把 `advanced` 置 false。
- 明确取值：窗口离线用例断言 `advanced === true`、`delivered === false`。

### FR-5: 门禁回执的指路指向统一入口

**谁**：agent（窗口）。
**什么场景**：确认被内容门拦下（如裁定表条目无效），agent 需要一条**自己能走**的恢复路径。
**做什么**：把 `decision-gates.ts:182`、`:195` 与 `stage-gate-timeline.ts:359` 的 `how` 文案改为"补齐后重新调 `reqboard_ask_confirm`（产物已落章 ⇒ 走已确认分支，闸门全过即自动推进）"。
**看到什么结果**：agent 不再被指去 `reqboard_move`（人工门命令）；`REQBOARD_HUMAN_GATE` 死路从文案层消失。

**判据**：
- 命令：`npx vitest run tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts`
- 读数：`grep -rn "reqboard_move(requirement_id" src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts` → **0 命中**。
- 明确取值：缺口回执的 `how` 字段包含字符串 `reqboard_ask_confirm`。

### FR-6: 逐通道对拍用例与回归锁

**谁**：维护者。
**什么场景**：任何一条确认通道被修改。
**做什么**：新增一条对拍用例：同一台账初始态，四条通道各走一次，断言「落章时间戳一致 / 推进结果一致 / 停手位都清 / `driverHealth` 都复位」四件事；并锁"看板确认后无需人干预即起轮"。
**看到什么结果**：任一条通道漏接，用例点名失败（不再靠人肉发现）。

**判据**：
- 命令：`npx vitest run tests/confirm-channel-parity.test.ts`
- 读数：用例内四个 `expect` 组各有一条针对"通道 i"的断言，失败信息含通道名与缺失项。
- 明确取值：四通道的 `{advanced, status, driverHealth.state, awaitingExit}` 四元组逐项相等。

## 失败与并发路径

**失败路径**（每一处都要"响亮但不阻断"）：

| 失败点 | 期望行为 |
|---|---|
| 内容门 / G2 完整性门拦下 | 落章保留、推进不执行；回执带 `gate_failure`（形状不变，四通道一致） |
| `applyConfirmedAdvance` 抛错 | 吞进 `advanceNote`，**不抛**；台账保留已落章的章 |
| 清停手位写台账失败 | 响亮留痕（告警 + 评论），**不回滚**已完成的推进；下一趟心跳对账可再清 |
| `applyDiveTransition` 失败 | 同上：不回滚推进；健康位留在原状并留痕 |
| 窗口不在线 | 推进照常（FR-4）；仅投递失败，提示如实 |

**并发重复**：

- 同一 (需求, 门) 被两通道同时确认：`applyConfirmedAdvance` 内 `if (req.status !== input.from) return undefined` 是乐观护栏 ⇒ 第二个到达者幂等跳过、不重复迁移。
- 落章重复：`stampArtifactOnce` / `stampPlanOnce` 首写即事实 ⇒ 已盖章的产物不被覆写（证据原文与时间戳是审计链）。
- 清停手位重复：`exitAwaitingConfirm` 幂等（重复调用 / 未知 ref 零动作）；重复清位不叠加驱动请求（`requestDrive` 自带合并语义）。

**状态机非法迁移**：

- `canReqTransition(from, to) === false` ⇒ 不推进，返回与改造前逐字一致的兜底文案（"当前状态 X 无可自动推进的下一阶段"）。
- 人工门迁移（如 `brainstorming → design`、`accepting → archived`）仍**只由人发起**：agent 调 `reqboard_move` 一律被 `REQBOARD_HUMAN_GATE` 拒（本需求不放松这条）。
- 终态需求（`done` / `archived` / `canceled`）不参与任何确认推进。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 本窗口用户消息（2026-10-07 13:52）：「你梳理一下把线对齐了」 | 本需求范围 = 四通道接线对齐与收敛；不新增门、不动 UI | FR-1, FR-2, FR-3 | 接线矩阵表四通道五件事逐项无缺口 |
| D-2 | 本窗口用户消息（2026-10-07 13:50）：「确认我记得让实现一个统一的方法提供给确认按钮哪里不能连接代码吗？」 | 统一方法沿用既有 `applyConfirmDecision` / `applyConfirmedAdvance`，不另立第二套；缺口按通道补齐 | FR-1, FR-2 | 两处内联推进归零（grep 0 命中） |
| D-3 | 本窗口用户消息（2026-10-07 13:47）：「所有改skip 就会自动唤醒agent了」 | 唤醒与否由停手位与窗口在线决定、不由闸门链 skip 决定；本需求不改 skip 语义 | FR-3 | 清位后不注入用户消息仍起轮一次 |
| D-4 | 本窗口用户消息（2026-10-07 13:44）：「什么设置把skip了」 | 不改 `NODE_ISOLATION` 默认值与语义（压缩与唤醒解耦） | FR-3 | 压缩开关关闭时 FR-3 判据仍全绿 |
| D-5 | 本窗口用户消息（2026-10-07 13:34）：「需求分析到设计直接没有实现agent自动唤醒原因」 | 病灶定性为"停手位未清 + 指路到人工门"；不把"提交即推进"纳入（G1 保持 humanOnly） | FR-3, FR-5 | G1 `humanOnly` 断言不变（既有用例保持绿） |
| D-6 | 本窗口用户消息（2026-10-07 13:48）：「是提交文档的时候没有改状态对吗」 | 提交只登记产物、不改状态是设计而非缺陷；只在回执/文档口径上减少误解 | FR-5 | 提交回执与文档均写明"推进由人工门确认后自动完成" |

## 判据汇总（可跑）

```bash
npx vitest run tests/artifact-confirm-board.test.ts tests/confirm-advance-deadlock.test.ts \
               tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts \
               tests/awaiting-clear-notice.test.ts tests/dive-confirm-advance.test.ts \
               tests/confirm-channel-parity.test.ts
grep -rn "transitionRequirement(" src/http/routers/requirements.ts src/application/use-cases/ConfirmArtifact.ts
grep -rn "reqboard_move(requirement_id" src/application/internal/decision-gates.ts src/application/internal/stage-gate-timeline.ts
pnpm typecheck
```

期望：用例全绿；两条 grep 的输出为空（推进与指路都只经单点）；`typecheck` 退出码 0。

## 档位依据与升级信号

**档位**：重档——改动跨路由 / 用例 / 领域文案三层，且触及"确认后是否唤醒"的运行时语义；需要逐通道对拍与回归锁。

**升级信号**：若实现对拍时发现第四条通道（如回执续跑 `reqboard_confirm_receipt`）也带推进副作用，则把该通道一并纳入矩阵，范围扩为"五通道"。

**下一步**：本文件登记后请人确认进入 design；设计阶段写 `design/backend.md`（四通道收尾时序 + 单点签名）与既有五份设计文档的对应章节。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t2、t-4fae3f |
| FR-2 | ✅ 已接收 | t3、t-a1b3e5 |
| FR-3 | ✅ 已接收 | t1、t-cd1673 |
| FR-4 | ✅ 已接收 | t2、t-4fae3f |
| FR-5 | ✅ 已接收 | t4、t-9373c5 |
| FR-6 | ✅ 已接收 | t5、t6、t-3bb415、t-391a5b |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
