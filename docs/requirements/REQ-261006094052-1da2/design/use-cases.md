# 用例设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 关注点：**谁在什么场景下走这条路径、看到什么、失败时看到什么**。全部以 agent 或人的可观测面（工具返回体 /
> 台账状态）描述，不写类名与行号的地方留给 interfaces.md。

## UC-1 已落章的确认门重发（本需求的核心场景） <!-- serves: FR-1 -->

- **谁**：实施 agent（本窗口）。
- **前置**：需求 `status = brainstorming`；`kind=requirement` 产物已登记且**已落章**；该阶段闸门此刻**全过**
  （例：UI 需求的原型已登记，或非 UI 需求的内容/裁定门已满足）。
- **触发**：调 `reqboard_ask_confirm(target=artifact, kind=requirement, question=…)`。
- **主流程**：命中「已确认」判定 → 跑闸门 → 全过 → 执行推进（单点）→ 复位 dive → 返回。
- **看到什么**：`confirmed:true`、**`advanced:true`**、`from:'brainstorming'`、`to:'design'`；
  台账 `status` 读回为 `design`；需求评论多一条 `[自动推进] brainstorming → design`；**没有再弹一次框**。
- **后置**：agent 可以继续 design 节点的工作，不再需要请人去面板点。

## UC-2 已落章但闸门仍不过（缺口如实回报） <!-- serves: FR-2 -->

- **谁**：同上。
- **前置**：已落章；闸门不过（内容门或设计完整性门）。
- **看到什么**：`confirmed:true`、`advanced:false`、`gate_failure`（含 `code` / `gaps` / 可执行的 `how`）、
  note 前缀「已确认，未重复弹框（FR-9/FR-11）」+「…未推进：<msg>」；**`status` 不变**。
- **下一步**：按 `gate_failure.how` 补齐产物 → 重发确认门（回到 UC-1）。**不要**以「请到面板点一下 → 设计」收尾：
  面板按钮走的是同一条判定，缺口没补时同样不推进。

## UC-3 UI 需求：原型登记前的自动确认（FR-3 的现场） <!-- serves: FR-3 -->

- **谁**：`reqboard_submit(kind=requirement)` 的调用方（agent）+ 人。
- **前置**：feature/refactor 且 `sides` 含 frontend；原型尚未登记。
- **主流程**：submit 成功 → `triggerAutoConfirm` 先跑原型存在门 → 不过 → 返回
  `{triggered:false, reason:'…把原型落到 docs/requirements/<REQ>/prototypes/… 再调 reqboard_submit(kind=prototype)…'}`。
- **看到什么**：**没有弹框**（人不会先确认一个进不去的门）；submit 回执的 note 里带这段可执行路径。
- **继续**：agent 登记原型（`reqboard_submit(kind=prototype)`，登记即生效、无人工确认门）→ 再调
  `reqboard_ask_confirm(kind=requirement)` → 走 UC-1 推进。**死锁消失**。

## UC-4 非 UI 需求：首轮确认（行为不变，作为对照） <!-- serves: FR-3 -->

- **前置**：`sides` 不含 frontend（如本需求自身 `sides: [backend]`）。
- **主流程**：submit(kind=requirement) → `triggered:true`（原型存在门不适用）→ 后台弹框 → 人确认 → 落章并推进。
- **口径**：本需求的窄口径预判**不得**影响这条路径（否则等于改掉 REQ-261005200052-ce40 决议 #13）。

## UC-5 已推进到下一阶段后的重发（幂等语义） <!-- serves: FR-1, FR-2 -->

- **前置**：需求已在 design（上一轮已推进）。
- **看到什么**：`advanceTargetFor('design') = 'decomposing'`；此时设计完整性门通常不过 → `advanced:false` +
  `gate_failure`（`design_doc_incomplete`，含「未登记 / 待确认」两类病因与各自命令）。
- **口径**：这不是「重复推进」，而是**新的一次**阶段推进尝试；不得返回「什么都没发生」的空回执（避免再次死锁）。

## UC-6 plan 路径（回归对照，行为不变） <!-- serves: FR-2, FR-4 -->

- **前置**：`target=plan`，`plan.approvedAt` 有值。
- **两条**：① `status = decomposing` ⇒ 命中 `planAwaitingAdvance` → 走弹框路径 → 批准后门合并（落库+开跑，本次不动）；
  ② 其它状态 ⇒ 走早退分支 → 与 artifact 同款：闸门全过即推进（本次新获得的能力）、不过即如实拒绝。

## UC-7 人的视角：什么时候还需要点面板 <!-- serves: FR-4 -->

- 需要人动手的只有**确认**（落章）本身：首次确认、或产物被改后的重确认（`change_note` 路径）。
- **推进**不再需要人点。看板「→ 设计」按钮仍可用（等价通道），但它不再是流程继续的**唯一**出口。
