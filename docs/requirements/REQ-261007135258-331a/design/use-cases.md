---
req: REQ-261007135258-331a
serves: [FR-1, FR-2, FR-3, FR-4, FR-6]
---

# 用例设计（REQ-261007135258-331a · 确认通道接线收敛）

> 六条用例覆盖四条通道 + 补推进 + 收尾失败；每条都给"人能看到的结果"与机器可读的读数。

## 用例总览 `serves: FR-6`

| 用例 | 触发者 | 通道 | 主要覆盖 |
|---|---|---|---|
| UC-1 | 人（弹框） | 会话弹框 / 超宽限挂起后台 | FR-1, FR-3 |
| UC-2 | 人（Dive 门框） | Dive gate-prompt | FR-3 |
| UC-3 | agent（文字证据） | `reqboard_confirm_artifact` | FR-2, FR-3 |
| UC-4 | 人（看板） | `POST /req/artifact/confirm` | FR-1, FR-4 |
| UC-5 | 人 / agent | 已落章未推进的补推进 | FR-1, FR-5 |
| UC-6 | 系统 | 收尾失败降级 | FR-3 |

## UC-1 会话弹框确认 `serves: FR-1, FR-3`

**前置**：需求处于某阶段且该门产物已登记；`dive.activation = armed`。
**主流程**：人点「确认，推进到下一阶段」→ 收敛点带 ref await 清位 → 落章 → 内容门过 → 推进 → 收尾。
**异常**：内容门拦下（不推进、回执带 `gate_failure`）；超宽限挂起（后台续跑，作答到达后同一收敛点生效）。
**可观察结果**：

- 状态推进（`reqboard_status` 的 `status` 变化）；
- 台账出现 `[自动推进]` 与 `[Dive 恢复] 等待结束` 两条评论；
- `driverHealth.state === 'healthy'`；
- **无需人再发消息**，出现一次 `source.kind='dive'` 的回合消息。

## UC-2 Dive 门框确认 `serves: FR-3`

**前置**：门已满足但状态未动（`gatePromptFor` 分支 b），或产物已登记未确认（分支 a）。
**主流程**：Dive idle 拍弹框 → 人点肯定 → `applyConfirmDecision` → 同一收敛点。
**异常**：弹框通道不可用 → 降级（只记日志，不投递、不冒充推进）。
**可观察结果**：与 UC-1 相同四条；额外要求：弹框在途期间写工具被 `REQBOARD_CONFIRM_PENDING` 拦住（既有语义不变）。

## UC-3 文字证据确认 `serves: FR-2, FR-3`

**前置**： agent 拿到用户的明确答复原文；产物已登记。
**主流程**：`reqboard_confirm_artifact(target=artifact, kind=…, evidence="<用户原话>")` → 首写即事实落章 → 内容门 → **改调 I-1 推进** → 收尾。
**异常**：`evidence` 未命中真实用户消息 → 拒（既有）；`advance:false` → 不推进（不报假缺口）。
**可观察结果**：回执键与改造前逐字一致；推进与 UC-1 逐字段一致；停手位（若此前有弹框残留）被清。

## UC-4 看板一键确认 `serves: FR-1, FR-4`

**前置**：产物已登记；人在看板点「确认产物」。
**主流程**：落章（`via:'board'`）→ 内容门 / G2 → **改调 I-1 推进** → 收尾 → 回执。
**分支**：

| 分支 | 回执 | 说明 |
|---|---|---|
| 窗口在线 | `advanced:true, delivered:true` | 后置链 enqueue 并运行 |
| 窗口离线 | `advanced:true, delivered:false` | **本需求变更点**：推进不再被"窗口离线"挡住 |
| 内容门拦下 | `advanced:false, gate_failure` | 落章保留 |

**可观察结果**：离线分支下 `reqboard_status` 显示状态已推进，且窗口上线后（或下一趟心跳）即起轮。

## UC-5 已落章未推进的补推进 `serves: FR-1, FR-5`

**前置**：产物已落章、状态停在门下（如 `brainstorming`），且门对应的迁移尚未发生。
**主流程**：重新发 `reqboard_ask_confirm(target=artifact, kind=…)` → 命中"已确认"早退分支 → 内容门 / G2 → I-1 推进 + 收尾（不重复弹框）。
**异常**：内容门仍不过（例如裁定表条目仍无效）→ 回执 `advanced:false` + `gate_failure`，`how` **指向 `reqboard_ask_confirm`**（@I-5），agent 有条可走的路。
**可观察结果**：无需人再点一次；回执 `note` 含"已自动推进：<from> → <to>"。

## UC-6 收尾失败降级 `serves: FR-3`

**前置**：推进已成功；随后清停手位或 `applyDiveTransition` 抛错。
**主流程**：收尾内部各自 try/catch → 记录结果 → 回执带一句说明 → **不回滚推进**。
**可观察结果**：

- `status` 已是新阶段（推进是事实）；
- 日志有 `warn`，台账可能出现 `awaiting-confirm:*` 残留；
- 下一趟心跳对账（`reason='expired'`）或人再确认一次即可清掉；
- 回执 `finish.stopPositionCleared === false`（读数可查）。

## 通道对拍矩阵（UC-1~UC-4 必须一致） `serves: FR-6`

| 断言项 | UC-1 | UC-2 | UC-3 | UC-4 |
|---|---|---|---|---|
| `advanced` | 同一台账初始态下相同 | 同 | 同 | 同 |
| 推进后 `status` | 同 | 同 | 同 | 同 |
| `artifacts[].confirmedAt` | 同一秒级戳 | 同 | 同 | 同 |
| `driverHealth.state` | `healthy` | `healthy` | `healthy` | `healthy` |
| `awaiting-exit` 评论 | 有 | 有 | 有 | 有 |
| 回执键集 | 各通道自有形状（不要求一致） | — | — | — |

> 前五行是本需求要锁死的"一致面"；回执形状刻意允许不同（各通道面向不同消费者）。
