# 架构设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 关注点：确认门的**两条路径为什么漂移**、推进为什么必须单点、以及本次不做什么（含被否掉的方案）。
> 事实源：`src/application/use-cases/AskConfirm.ts`、`src/application/internal/confirm-settle.ts`、
> `src/application/internal/auto-confirm.ts`（下列行号均为改动前 HEAD）。

## 改动前：两条路径，一条有推进 <!-- serves: FR-1, FR-4 -->

```
人点「确认」 ──▶ askConfirm()
                  │
                  ├─ 未确认（首次） ──▶ settleAnswers ──▶ applyConfirmDecision
                  │                                        ├─ 落章（:153）
                  │                                        ├─ contentGatesForMove（:212）
                  │                                        ├─ checkDesignCompletenessGate（:225）
                  │                                        ├─ 迁移 status + 评论 + 断点（:234-252）
                  │                                        └─ applyDiveTransition('confirm-advance')（:267）
                  │
                  └─ 已确认（重发） ──▶ 【早退分支 AskConfirm.ts:96-135】
                                           ├─ contentGatesForMove（:104）
                                           ├─ checkDesignCompletenessGate（:123，仅 kind=design）
                                           └─ return advanced:false（:127 / :133）   ← ✗ 没有推进
```

首次确认与已确认重发**闸门口径相同**，差别只在「有没有那段迁移」——推进实现只长在其中一条路径上，
这就是死锁的结构性原因（不是偶发 bug）。

## 改动后：推进唯一实现 + 早退分支复用 <!-- serves: FR-1, FR-4 -->

```
applyConfirmedAdvance(deps, {requirementId, windowKey, from, to, nowTs})   ← 【新增单点】内部实现
   ├─ canReqTransition(from,to) 不过 ──▶ {advanced:false, advanceNote:'；当前状态 … 无可自动推进的下一阶段…'}
   ├─ mutateIfPresent: status !== from ⇒ 原样返回（乐观并发护栏，保持既有语义）
   ├─ transitionRequirement + '[自动推进] from → to' 评论 + stampCheckpoint
   └─ 任一步抛错 ──▶ {advanced:false, advanceNote:'；推进失败：<msg>'}（**只留痕不抛**，保持既有语义）

   ▲                                    ▲
   │ 调用（首次确认）                    │ 调用（已确认重发）
applyConfirmDecision:234 段          AskConfirm 早退分支：闸门全过时
   └─ 之后仍由 applyConfirmDecision      └─ 之后由早退分支自己调
      调 applyDiveTransition                applyDiveTransition('confirm-advance')
```

为什么把 `applyDiveTransition` 留在调用方、**不**放进单点：`applyConfirmDecision` 里的那次 dive 复位是
**无条件**的（闸门不过 / `advance:false` 时也要复位；:267 一行在 `if` 之外）。塞进单点会让主路径
从「一次」变成「两次」或改变闸门失败时的行为——超出了本需求范围（见「不做」）。早退分支只在
**真的推进了**（`advanced === true`）时复位，语义与 FR-10 一致。

## 为什么不重新弹框（否掉 artifactAwaitingAdvance） <!-- serves: FR-1 -->

来源需求给的另一条路是「artifact 也补一个 `planAwaitingAdvance` 逃生口」——那条路的形状是
**再弹一次确认框、等人再答一次**（`plan` 侧现状）。本次不采用，理由：

- 拦住推进的是**闸门**，不是人。人已经在第一次确认里答过「确认推进」，再问一次是让同一个人
  为同一件事签两次字；而缺的是产物，不是许可。
- 逃生口做成「再弹框」还会引入新的等待面（挂起票、阻塞写路径、TTL），正是
  REQ-261005200052-ce40 FR-1 已经付过代价的形态。
- 判据 A1 要求的正是「已落章 + 闸门通过 ⇒ 一次 `ask_confirm` 就前进」，与「再问一次」无关。

故：**已落章 + 有下一阶段 + 状态未变 ⇒ 重发即尝试推进**（来源需求判据里的后半句），闸门不过则
如实拒绝、状态不变（FR-2）。

## 自动确认的窄口径预判（FR-3） <!-- serves: FR-3 -->

`triggerAutoConfirm` 在弹框**之前**多一步：本次确认的推进目标若为 `brainstorming → design`
（即 `advanceTargetFor(req.status) === 'design'`），先跑**原型存在门**（`checkPrototypePresenceGate`）——
不过就返回 `{triggered:false, reason: <门的文案>}`，不弹。

**刻意只预判这一道门**：`contentGatesForMove` 的全套里还有裁定门，而裁定门对**所有 feature 需求**生效
（`checkDecisionLogGate` 只按 `category === 'feature'` 早退，不看端侧）。若宽口径预判全套，
一个新 feature 需求在没写「讨论与裁定记录」节之前永远不会被请人确认——等于把
REQ-261005200052-ce40 决议 #13「确认章是可选加强」改成「下游齐了才配确认」，并大面积改写既有用例的期望。
窄口径只覆盖来源需求复现的那一类（UI 需求缺原型），代价与收益都清楚。

## 不做 <!-- serves: FR-4 -->

- 不改 `reqboard_move` 的人工门（brainstorming → design 仍需人确认产物）。
- 不改 plan 侧门合并（批准 → 落库 → 开跑）与 `planAwaitingAdvance` 的既有语义。
- 不给早退分支加「重新弹框」路径（见上）。
- 不碰来源需求 REQ-261006092213-4f5b 的验收项改造。
- 不修 `advanced = true` 在「status 已变 ⇒ mutate 空转」时的既有宽松语义（那是一条独立的既有行为，
  改它需要独立的判据与用例）。
