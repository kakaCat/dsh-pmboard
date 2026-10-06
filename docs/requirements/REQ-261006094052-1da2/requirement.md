---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# REQ-261006094052-1da2 确认门死锁：已落章未推进后 agent 无路可走

> 类型：feature · 难度：expert · 来源：缺陷交接底稿（来源需求 REQ-261006092213-4f5b 的现场复现）
> 档位：**bounded**（改的是仓内既有的确认门/早退分支/推进单点三处流程，无新子系统）

## TL;DR <!-- serves: FR-1 -->

- 确认门（brainstorming → design）走完后**产物已落章、需求仍在原地**：`reqboard_ask_confirm` 命中
  「已确认」早退分支后只跑闸门、**从不推进**，返回 `confirmed:true / advanced:false`。
- 此时 agent 三条路全断：`reqboard_move` 被人工门拒（`REQBOARD_HUMAN_GATE`）、再调 ask_confirm 不推进、
  看板确认按钮只有人能点——现场表现就是「总是要人去面板点一下」。
- 修完之后：已落章 + 闸门通过 ⇒ 重发确认门**真的推进**（返回 `advanced:true` + `from/to`）；
  闸门不过时行为**逐字不变**（`gate_failure` 如实回报、状态不变）；UI 需求缺原型时**不制造注定失败的确认**。

## 故障链（现场复现，来源 REQ-261006092213-4f5b） <!-- serves: FR-1 -->

1. `reqboard_submit(kind=requirement)` 登记成功即后台自动弹确认门（`SubmitArtifact.ts:181` → `internal/auto-confirm.ts:39`）——此刻原型尚未产出。
2. 该阶段推进条件含「原型已登记」（`internal/prototype-gates.ts` 的原型存在门），闸门不满足。
3. `internal/confirm-settle.ts` 先落章（:153）再跑闸门（:212）；闸门不过 ⇒ 保留落章、跳过推进。
4. 原型登记后再调 `reqboard_ask_confirm`：命中 `AskConfirm.ts:96` 的 `alreadyConfirmed` 早退分支——
   只算 `advanceTo` + 跑闸门，闸门通过后**直接 `return advanced:false`**（:127），从不推进。
   实测返回 `confirmed:true / advanced:false`、note「产物 requirement 已确认，未重复弹框（FR-9/FR-11）」、无 gate_failure。
5. `reqboard_move(to=design)` 被 `REQBOARD_HUMAN_GATE` 拒 ⇒ 三层锁死。
6. 对照：plan 有逃生口 `planAwaitingAdvance`（`AskConfirm.ts:95`），artifact 没有。

## 产品定义 <!-- serves: FR-1 -->

确认门这一层承担两件事：**落章**（人确认了这个产物）与**推进**（把人确认的结果兑现成状态前进）。
现在这两件事在「首次确认」和「已确认后重发」两条路径上**不是同一套实现**——首次确认走
`applyConfirmDecision`（落章 + 闸门 + 推进 + 门合并，单点），已确认重发走 `AskConfirm.ts:96` 的早退分支
（只跑闸门、没有推进）。于是只要第一次确认时闸门不过（UI 需求最常见：原型还没产出），
系统就停在一个**没有任何 agent 可执行出口**的状态上。

**三要素检查清单**：

- 说清楚「是什么」：让「已落章 + 有下一阶段 + 闸门通过」这一状态**可被一次 ask_confirm 兑现**，而不是只能人去面板点。
- 说清楚「核心价值」：agent 在确认门上不再有死路；人不必当「推进按钮」，也不会有「谁都没做错但流程停住」的静默态。
- 说清楚「与现状的区别」：现状 = 早退分支只报缺口、不推进（缺口补齐后仍不推进）；本需求 = 缺口补齐后重发即推进，缺口未补则**如实拒绝且状态不变**。

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 实施 agent | 产物已落章、需求卡在阶段边界上时重发确认门 | 早退分支只回 `advanced:false`，没有任何可执行的下一步；`reqboard_move` 又被人工门拒 |
| 需求方 / PM | 被 agent 请来「去面板点一下 → 设计」 | 人变成了推进按钮；且不知道点与不点的差别（产物本来就确认过了） |
| 维护者 | 事后复盘「流程为什么停住」 | 同一件事有两套实现（首次确认 / 已确认重发），漂移点无测试锚 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能 | 优先级 |
|---|---|---|
| FR-1 | 已落章的确认门重发时，闸门通过就**真的推进**（返回 `advanced:true` + `from/to`） | P0 |
| FR-2 | 闸门不过时行为逐字不变：`advanced:false` + `gate_failure` 如实回报、台账状态不变 | P0 |
| FR-3 | 首轮自动确认不制造注定失败的确认门（UI 需求缺原型时不弹，回执写明下一步） | P0 |
| FR-4 | 推进实现单点化，且回执给出可执行的恢复路径（不以「请到面板点一下」收尾） | P1 |

### 条款

- **FR-1: 已落章的确认门重发时，闸门通过就真的推进**

  - **谁**：实施 agent。**什么场景**：产物已落章（`confirmedAt` 有值 / `plan.approvedAt` 有值）、需求仍在原阶段。
  - **做什么**：`reqboard_ask_confirm` 在「已确认 + 有 `advanceTo` + 闸门全过」时执行与首次确认同一份推进实现，
    不再次弹框（人已经答过「确认推进」，拦住它的是闸门而不是人）。
  - **看到什么**：返回体 `confirmed:true`、`advanced:true`、`from` = 原状态、`to` = `advanceTo`；
    台账 `status` 真的前进，并留下 `[自动推进] from → to` 需求评论。
  - **接口**：沿用 `reqboard_ask_confirm(target=artifact, kind=<kind>)`，不新增参数、不新增工具。

- **FR-2: 闸门不过时行为逐字不变**

  - **谁**：同上。**什么场景**：闸门（内容门 / 设计完整性门）仍不满足。
  - **做什么**：保持「不推进」——返回 `advanced:false` 且带 `gate_failure`（code / gaps / 可执行的 how），台账状态不变。
  - **看到什么**：与 `tests/design-gate-messages.test.ts` 既有口径一致；缺口文案与 `reqboard_move` 的拒绝理由不互相矛盾。

- **FR-3: 首轮自动确认不制造注定失败的确认门**

  - **谁**：系统（`triggerAutoConfirm`）。**什么场景**：UI 需求（feature/refactor 且 `sides` 含 frontend）
    提交需求文档时，原型尚未登记。
  - **做什么**：这一次自动确认**不弹框**，返回 `{triggered:false, reason}`，`reason` 用现有原型存在门的文案
    （含「把原型落到哪、怎么登记」的可执行路径），并在 submit 回执的 note 里可见。
  - **看到什么**：`auto_confirm.triggered === false` + 明确下一步；原型登记后 agent 重发
    `reqboard_ask_confirm(target=artifact, kind=requirement)` 即按 FR-1 推进。
  - **口径**：**只**预判原型存在门这一道——裁定门 / 内容门不预判，避免把 REQ-261005200052-ce40 决议 #13
    「确认章是可选加强」改成「下游齐了才配确认」（feature 需求的裁定门对所有 feature 生效，宽口径会
    让绝大多数需求提交后不再请人确认）。

- **FR-4: 推进实现单点化 + 恢复路径可读**

  - **谁**：维护者 / agent。**什么场景**：改推进逻辑、或被闸门拦住后找下一步。
  - **做什么**：状态迁移块从 `applyConfirmDecision` 抽成单点（首次确认与已确认重发**共用**同一实现），
    不产生第二份迁移逻辑；被闸门拦住的回执与工具提示语写明「补齐产物 → 重发确认门」。
  - **看到什么**：`grep -n "transitionRequirement" confirm-settle.ts` 只剩单点内一处由本路径使用；
    agent 不再以「请到面板点一下」收尾。

## 修复设计（改动面） <!-- serves: FR-4 -->

| 文件 | 改动 |
|---|---|
| `src/application/internal/confirm-settle.ts` | 抽出 `applyConfirmedAdvance`（canReqTransition → 迁移 + 评论 + 断点；失败只留痕不抛）；`applyConfirmDecision` 的那一段改为调用它（行为逐字不变） |
| `src/application/use-cases/AskConfirm.ts` | `alreadyConfirmed` 早退分支：闸门全过时调 `applyConfirmedAdvance` 并返回 `advanced:true` + `from/to`；闸门失败路径逐字保留 |
| `src/application/internal/auto-confirm.ts` | 加窄口径预判：本次推进目标是 `design` 且原型存在门不过 ⇒ 不弹框，`reason` 用门的文案 |
| `src/application/use-cases/SubmitArtifact.ts` | 接住 `triggerAutoConfirm` 的异步结果并把 `reason` 带进 note（`await` 两处调用点） |
| `tests/confirm-advance-deadlock.test.ts`（新增） | A1 / A2 / A3 的可执行回归 |
| `tests/design-gate-messages.test.ts` | TC-4 第 2 例的期望从 `advanced:false` 修正为 `advanced:true`（原期望把缺陷行为锁成了正确行为） |

## 判定标准（可证伪） <!-- serves: FR-1 -->

- **A1**：已落章 + 闸门通过 ⇒ `reqboard_ask_confirm` 返回 `advanced:true`，且台账 `status` 真前进（读回确认）。
- **A2**：闸门不过 ⇒ 返回 `gate_failure` 且 `status` 不变（对齐 `tests/design-gate-messages.test.ts` 口径）。
- **A3**：UI 需求在原型登记前的首轮自动确认不再死锁：`triggerAutoConfirm` 返回 `triggered:false` + 可执行 reason；
  原型登记后重发确认门 ⇒ 按 A1 推进。
- **A4**：回归：`pnpm typecheck` 不超过 HEAD 基线；`pnpm test` 失败数 ≤ 实测基线（HEAD 上跑得 **70 条失败用例 / 39 个失败文件**，
  固化于 `.dsh-data/baseline-test.txt`），且本次新增用例全绿。

## 迁移与兼容 <!-- serves: FR-4 -->

- 纯行为修复，**无数据迁移**：不新增台账字段、不改产物 schema、不改工具参数。
- 已落章未推进的存量需求（例如来源需求 REQ-261006092213-4f5b 现场）**自动受益**：重发一次确认门即推进。
- `advance:false` 的调用语义不变（不推进）；`planAwaitingAdvance` 的逃生口不动。
- 回滚：三处改动都是仓内单点，`git revert` 即回到「早退分支不推进」的旧行为。

## 边界（不做） <!-- serves: FR-1 -->

- **不碰来源需求 REQ-261006092213-4f5b 的验收项改造**（那是另一个需求的范围，交接底稿明确划定）。
- 不改 `reqboard_move` 的人工门语义（brainstorming → design 仍需人确认产物，这是铁律，不是缺陷）。
- 不把「确认门不弹」扩大成「所有闸门都预判」——只预判原型存在门（见 FR-3 口径）。
- 不改 plan 侧门合并（批准 → 落库 → 开跑）的任何行为。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 交接底稿：「确认门（brainstorming → design）走完后，产物已落章（confirmedAt 有值），需求却仍停在 brainstorming；agent 侧无路可走」 | 立独立需求修复该缺陷（不在来源需求里夹带改） | FR-1, FR-2 | A1, A2 |
| D-2 | 交接底稿修复方向 1：「把推进块从 confirm-settle.ts 的 applyConfirmDecision 抽成单点，让 AskConfirm.ts:96-135 早退分支在「已落章 + 有 advanceTo + 闸门通过」时执行推进」 | 采纳：早退分支执行**同一份**推进实现，返回 `advanced:true` 与 `from/to`；闸门不过时行为不变 | FR-1, FR-2, FR-4 | A1, A2 |
| D-3 | 交接底稿修复方向 2：「triggerAutoConfirm 在「本次推进所需产物未齐备」时不弹确认门（不制造注定失败的确认）」 | 收窄采纳：**只**预判原型存在门（UI 需求缺原型）；不预判裁定门/内容门，避免把「确认章是可选加强」改成「下游齐了才配确认」 | FR-3 | A3 |
| D-4 | 交接底稿修复方向 3：「给 artifact 补 artifactAwaitingAdvance（与 plan 同款），或统一判定「已落章 + 有下一阶段 + 状态未变 ⇒ 待推进」」 | 采纳后半句：早退分支直接判定并**兑现**推进（不再需要第二次人工弹框，人已答过「确认推进」） | FR-1 | A1 |
| D-5 | 交接底稿：「提示词层（次要）：写明「确认被闸门拦住 → 补齐产物后重发确认门；不得以『请到面板点一下』收尾」」 | 采纳：回执 note 与工具提示语写明恢复路径 | FR-4 | A3 |
| D-6 | 用户消息：「应该立项了吧？」 | 立项并绑定本窗口 REQ-261006094052-1da2；台账记为 feature / expert（弹框作答值），与底稿建议的 bug / standard 不同，按台账为准并在此留痕 | FR-1 | A4 |
| D-7 | 交接底稿：「不要在本窗口碰 REQ-261006092213-4f5b 的验收项改造（那是另一个需求）」 | 边界：本次只改确认门/推进/自动确认四处，不碰 4f5b 的验收单改造 | FR-1, FR-4 | A4 |

## 轻 / 重档依据 <!-- serves: FR-1 -->

- 判为 **bounded**：改动集中在仓内既有的三条路径（确认门早退分支 / 推进实现 / 自动确认触发），
  接口与数据契约零变更，可读得到既有流程。
- 按本仓覆盖 4（产物豁免无效）：即使 bounded 也出本 `requirement.md` 并经人确认；不写实现计划书，
  设计文档在 design 节点按 backend 档产出。
- 不判为 spike（不是可行性提问，结论就是可交付代码）；不判为 architectural（不新增子系统、不改对外接口）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t-32e494、t-9aa82b、t-13a8ca、t-c89be1 |
| FR-2 | ✅ 已接收 | t1、t2、t-32e494、t-9aa82b、t-13a8ca、t-c89be1 |
| FR-3 | ✅ 已接收 | t3、t-af9414、t-13a8ca、t-c89be1 |
| FR-4 | ✅ 已接收 | t1、t-32e494、t-c89be1 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
