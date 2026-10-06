# 确认门的唯一性：一道门只开一个框，台账首写即事实

> 沉淀自 REQ-261006164732-6503（2026-10-06，feature）。事故现场：`reqboard_submit(kind=plan)` 自动弹了一次
> 「批准拆分计划」框，指南又要求 agent 显式再弹一次；人先答了 agent 那个（需求已推进到 implementing），
> 随后答了自动弹那个——**迟到的第二个答复把 `plan.approvedAt` 与审批证据原文覆写了**。
> 独立评审报告与逐条处置：`docs/requirements/REQ-261006164732-6503/reviews/independent-review.md`。

## 1. 四条不变量（改这块代码前先读）

| # | 不变量 | 落点 |
|---|---|---|
| I1 | **同门至多一个在途框**：同一 `(requirementId, target, kind)` 只允许一道未作答的门（跨窗口） | `gate-request.ts` 判定序 + `PendingConfirmRegistry.findOpen`（键不含 windowKey） |
| I2 | **建门不由模型决定**：三条建门通道（提交自动弹 / agent 显式请求 / 验收门）都走 `requestGate`，它是唯一 `register` 点 | `src/application/internal/gate-request.ts` |
| I3 | **首写即事实**：已落章的产物/计划，后到路径一律不覆写时间戳与证据原文 | `stampArtifactOnce` / `stampPlanOnce`（`confirm-settle.ts`），**五处写点共用** |
| I4 | **在途可观测**：未作答的门在 `reqboard_status.pending_confirms[]`、`reqboard_confirm_receipt`、看板三面同源可见 | `pending-guard.ts` → `QueryState` |

判定序（唯一入口内）：**复用 → 早退 → 新建**。
- 复用：同门已有未作答票 ⇒ 返回 `reused` + 原 ticket，**不新开框、不二次登记、不续期**；
- 早退：该门已落章/已处理 ⇒ 返回 `already-settled`，只解释不动手；
- 新建：登记新票，并**清理异门的陈旧票**（这一步原在 `AskConfirm`，实测会被"沿用已建好的门"分支跳过，故随建门动作搬家）。

## 2. 落章的两条纪律（别再各写一遍）

1. **能不能落章**：`gateStaleReason(req, target, kind)` —— 判「**这道门守的那次迁移是否已经发生过**」。
   - 已经发生过 ⇒ 迟到作答：只留痕（`recordStaleAnswer`）、不改台账、不推进；
   - **没发生过 ⇒ 放行**，包括「章已落、迁移未发生」这种**补推进**情形（REQ-261006094052-1da2 刻意保留：
     已落章未推进时 agent 无路可走，必须允许再确认一次把阶段推上去）。**不要**改回按"章是否已落"拦人——
     那会同时误杀补推进路径，并把「阶段已推进但尚无章」的**补章**路径一起堵死（历史用例钉着它）。
2. **写了什么**：`stampArtifactOnce` / `stampPlanOnce` —— 已盖章就不写（首写即事实）。
   评论也要跟着"真的盖上了"才写，否则重复作答会反复留下「人已确认」的假记录（事故的第二条记录就是这么来的）。

五处落章写点（新增写点请一并接入，否则 FR-4 只兑现一部分）：

| # | 写点 | 文件 |
|---|---|---|
| 1 | 会话弹框主落章 | `application/internal/confirm-settle.ts` |
| 2 | 门合并块（批准计划时给 decomposition 产物落章） | 同上（**独立评审的阻断项就在这里**） |
| 3 | 文字证据路径（`reqboard_ask_confirm(evidence=…)`） | `application/use-cases/ConfirmArtifact.ts` |
| 4 | 看板确认产物 | `http/routers/requirements.ts`（产物确认） |
| 5 | 看板批准计划 | 同上（计划决策） |

## 3. 三条作答通道与它们的**已知例外**

会话弹框 / 文字证据 / 看板三条通道共用上面的纪律。**已知例外**：Dive 的人工门弹框
（`src/application/dive/gate-prompt.ts`）自己 `questions.ask` + 直接调 `applyConfirmDecision`，
不经 `gate-request`、不登记 `pc-` 票，因此不进 `pending_confirms[]` 投影——同一道门在 Dive 下
仍可能出现「pc- 票 + Dive 框」并存。要收敛它，得让 Dive 的 tick 先读 `findOpen`/`dialogInFlight` 再决定弹不弹。

## 4. 工具边界的内部参数纪律

`adopted_ticket` 是**内部**参数（建门方沿用自己那口门），工具层必须显式剔除：
本仓工具绑定不设 `additionalProperties:false`，`parameters` 里没声明的键会原样透传给 `execute`
⇒ 不剔除就等于开了一道「凭一个 ticket 绕过建门唯一入口、直接弹第二个框」的后门。

## 5. 判据下限（为什么不是"该门来源阶段"）

「需求必须停在门的来源阶段才能作答」这条更窄的判据**不能用**：设计阶段批准计划是合法历史行为
（`tests/ask-confirm.test.ts`），而它的来源阶段（decomposing）确实还没到。用迁移是否已发生来表达，
既拦住真正的迟到作答，又不动那条路径。执行期偏差的完整记录见
`docs/requirements/REQ-261006164732-6503/notes/execution-decisions.md`。
