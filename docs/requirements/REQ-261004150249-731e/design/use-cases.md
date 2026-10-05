---
req_id: REQ-261004150249-731e
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 用例设计（REQ-261004150249-731e）

> 七个场景，覆盖主路径 + 四条降级路径。每条都写清「谁发起 / 看到什么 / 失败时怎么办」。

## UC-1 顶墙续作（主路径，agent 自主） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

**谁**：原窗口 agent。**何时**：`decideHandoff` 返回 `fork` 且当前阶段已收尾（或 `critical`）。

1. 读到 `context_pressure`（`fork` 档，如 87%）；
2. 调 `reqboard_handoff({ reason: '水位 0.87，阶段边界 design→decomposing' })`；
3. 新窗口被创建在**同一 workspace**（侧栏该项目分组内）；
4. 台账：新窗口 `owner`、原窗口 `observer`、`sourceSessionId` = 新窗口（一次 mutate）；
5. 新窗口收到底稿：断点 + 节点输入包（自署 `reqboard-handoff`）；
6. 回执：`from/to/old_role/new_role/delivery.delivered=true`。

**看到什么算成功**：新窗口 `reqboard_status` → `my_seat.role == 'owner'`；写产物无 `PROJECT_ROOT_MISMATCH`。
**失败时**：开窗失败 → 台账零改动，回执给 `REQBOARD_OPEN_WINDOW_UNAVAILABLE`（继续在原窗口干，并如实说水位）。

## UC-2 到档但未到阶段边界（等边界） `serves: FR-3`

**谁**：原窗口 agent。**何时**：`fork` 档已到，但当前阶段还有未收尾产物。

1. 本回合**不开窗**；
2. 写断点 + 在回执/评论里说明「已到 fork 档，将在阶段边界交接」；
3. 下一次阶段推进后（gate 后置链的 resume 时机）重新判定 → 满足则走 UC-1。

**为什么不半路交接**：阶段边界是唯一"上下文自足"的切点；半路交接要靠人复述，正是本需求要消灭的成本。
**例外**：`critical` 档不等边界（宁可半路，也不能硬停）。

## UC-3 人发起（不依赖读数） `serves: FR-1, FR-2`

**谁**：人。**两条路径**：

| 路径 | 操作 | 结果 |
|---|---|---|
| 看板 | 在新窗口点「改绑到本窗口」 | `applyRebind` 同步席位 → 新窗口 owner、原窗口 observer |
| agent | 在新窗口说「接管这条需求」，agent 调 `reqboard_handoff({ to_window: 本窗口 })` | 同 UC-1，但 `mode` 默认 `create` 不适用（已指定窗口则不建窗） |

**边界**：新窗口必须**在线**（`onlineAgent` 前置），否则拒——改绑到死窗口等于制造下一个孤儿。

## UC-4 读数缺席（降级路径） `serves: FR-3`

**谁**：原窗口 agent。**何时**：`contextPressure.source !== 'projection'` 或字段缺席。

1. **不猜、不补 0、不自动交接**（`decideHandoff` → `'unknown'`）；
2. 如实回报：水位不可得 → 建议人确认后再交接；
3. 人明确要求 → 仍可交接（`reason` 必填，回执标 `self_initiated: false`）。

**为什么**：拿"不可得"当"余量充裕"会静默停摆；当"已满"会无谓打断。两者都比"问一句"贵。

## UC-5 底稿投递失败（部分成功） `serves: FR-4`

1. 交接已成立（席位与 `sourceSessionId` 已改）；
2. 投递失败（如新会话 resume 超时）→ 回执 `delivery.delivered=false` + `reason`；
3. **不回滚交接**：人已能进新窗口，重试成本低于回滚（回滚还要再改回来，风险更高）；
4. 给重试入口：可再次调 `reqboard_handoff({ to_window: 同一窗口 })`（幂等：席位已对 → 只补投递）。

## UC-6 非 owner 发起（拒绝路径） `serves: FR-5`

worker / observer 调 `reqboard_handoff` → `REQBOARD_SEAT_NOT_OWNER`，台账零改动。
**为什么不让 worker 交接**：交接 = 换拍板人，属 owner-only 动作（与 `reqboard_move` 同口径）。

## UC-7 `reqboard_capture` 的 handoff 分支同样落对项目 `serves: FR-1`

`on_window_bound=handoff` 时（`use-cases/CaptureRequirement.ts:145`）同样带上源项目解析结果；
否则"本窗口已绑定 → 新项目交给新窗口"这条既有链路会继续把需求记在宿主目录下。

## 场景 × 条款覆盖 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 场景 | FR-1 | FR-2 | FR-3 | FR-4 | FR-5 |
|---|---|---|---|---|---|
| UC-1 顶墙续作 | ● | ● | ● | ● | ● |
| UC-2 等边界 | | | ● | | |
| UC-3 人发起 | ● | ● | | | |
| UC-4 读数缺席 | | | ● | | |
| UC-5 投递失败 | | | | ● | |
| UC-6 非 owner | | | | | ● |
| UC-7 capture handoff | ● | | | | |
