# 裁定对照（D-x 逐条落实）· REQ-261006094052-1da2

> 针对验收单 v1 中**未通过项 v1-7**（「与裁定对照（逐条说明如何落实）」）的返工产物。
> 口径：每条裁定取 `requirement.md`「讨论与裁定记录（D-x）」的**原话**（不概括、不重写），
> 逐条给出**落实点（文件:行）**与**可复核证据**。行号为当前工作树实测（2026-10-06 09:56）。

| 编号 | 裁定（原话来源摘录） | 落实点 | 证据 | 结论 |
|---|---|---|---|---|
| D-1 | 交接底稿：「确认门（brainstorming → design）走完后，产物已落章（confirmedAt 有值），需求却仍停在 brainstorming；agent 侧无路可走」→ 立独立需求修复该缺陷（不在来源需求里夹带改） | 本需求 `REQ-261006094052-1da2` 独立立项并独占改动面；来源需求目录零写入 | 需求文档 D-1 行；改动集仅 4 源文件 + 2 测试文件（见 `reviews/implementation-review.md` §3.5）；来源需求 REQ-261006092213-4f5b 的验收项改造未触碰 | 落实 |
| D-2 | 交接底稿修复方向 1：「把推进块从 confirm-settle.ts 的 applyConfirmDecision 抽成单点，让 AskConfirm.ts:96-135 早退分支在「已落章 + 有 advanceTo + 闸门通过」时执行推进」 | 新增单点 `applyConfirmedAdvance`（`src/application/internal/confirm-settle.ts:109`）；`applyConfirmDecision` 迁移块改调它；早退分支在闸门全过后调用（`src/application/use-cases/AskConfirm.ts:145`） | TC-1（`advanced:true` + 台账 `status=design` + 评论 `[自动推进]`）；TC-2（闸门不过 ⇒ `decision_log_missing` 且状态不变） | 落实 |
| D-3 | 交接底稿修复方向 2：「triggerAutoConfirm 在「本次推进所需产物未齐备」时不弹确认门」→ 收窄采纳：**只**预判原型存在门 | `src/application/internal/auto-confirm.ts:64-67`：仅当「本次推进目标 = design」且 `checkPrototypePresenceGate` 失败时返回 `{triggered:false, reason}`（登记任何票之前） | TC-5（UI 缺原型 ⇒ `triggered:false` + reason 含原型目录与 `reqboard_submit(kind=prototype)`）；**TC-7（非 UI 照弹）证明未越界**——裁定门/内容门不预判 | 落实 |
| D-4 | 交接底稿修复方向 3：「给 artifact 补 artifactAwaitingAdvance（与 plan 同款），或统一判定「已落章 + 有下一阶段 + 状态未变 ⇒ 待推进」」→ 采纳后半句 | `AskConfirm.ts:132-175`：早退分支直接判定并**兑现**推进（不再产生第二次人工弹框） | TC-1/TC-6/TC-6b 均在一次调用内推进；`ask-confirm-pending` TC-20 的 `asked === 1`（未新增弹框）保持 | 落实 |
| D-5 | 交接底稿：「提示词层（次要）：写明「确认被闸门拦住 → 补齐产物后重发确认门；不得以『请到面板点一下』收尾」」 | 闸门失败回执带 `gate_failure.how`（既有门文案）+ note「未推进：<message>」；自动确认早退的 reason 进 submit 回执（`SubmitArtifact.ts:203`） | `AskConfirm.ts:169` 的「；已自动推进：from → to」；TC-2 的 note 含「未推进」；TC-5 的 reason 即门原文 | 落实 |
| D-6 | 用户消息：「应该立项了吧？」→ 立项并绑定本窗口；台账记为 feature / expert（弹框作答值），与底稿建议的 bug / standard 不同，按台账为准并留痕 | 立项即为 feature/expert（`reqboard_capture` 回执）；差异已写入需求文档 D-6 行 | `reqboard_status` 显示 category=feature；需求文档 D-6 行；本对照表 | 落实 |
| D-7 | 交接底稿：「不要在本窗口碰 REQ-261006092213-4f5b 的验收项改造（那是另一个需求）」→ 边界：只改确认门/推进/自动确认四处 | 改动集：`confirm-settle.ts` / `AskConfirm.ts` / `auto-confirm.ts` / `SubmitArtifact.ts`（+ 2 个测试文件）；来源需求目录零写入 | `git diff --stat` 的改动集；`stat` 显示本窗口写入时间（09:45 起）与来源需求目录无交集；`reviews/implementation-review.md` §4 遗留项 | 落实 |

## 补充：实施期新增的一条裁定（超出计划、已在评审报告披露）

| 编号 | 事项 | 落实点 | 证据 | 结论 |
|---|---|---|---|---|
| D-2′ （实施期派生） | 早退分支的设计完整性门原只按 `kind=design` 判，与主路径（`gateForTransition(...)?.id === 'G2'`）不一致 ⇒ `kind=requirement` 在 design 阶段重发确认可**绕过 G2** | `AskConfirm.ts:132-134` 把适用条件对齐为「kind=design **或** G2」 | **TC-9**：design 阶段设计文档未交齐 ⇒ `advanced:false` + `gate_failure` 且状态不变（后门封死） | 落实 |

## 覆盖度自述（不冒充）

- 上表 7 条裁定 + 1 条实施期派生裁定**逐条**给出落实点与可复核证据；每条的「证据」列都能在
  `tests/confirm-advance-deadlock.test.ts` / `tests/design-gate-messages.test.ts` 或工作树里复核到。
- 本表由**实施窗口自评**（agent 侧），不构成独立复核；独立复核仍以人在验收单上的裁决为准。
