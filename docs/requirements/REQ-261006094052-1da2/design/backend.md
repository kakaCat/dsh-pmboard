# 后端设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 关注点：**谁写台账、按什么顺序、失败怎么响亮、并发与幂等怎么兜**。规则单点在
> `application/internal/confirm-settle.ts`，用例层（`AskConfirm` / `auto-confirm`）只编排。

## B-1 调用顺序（不可换序） <!-- serves: FR-1 -->

```
askConfirm()
  ① 绑定与参数校验（不动）                        → 不通过：REQBOARD_NO_BOUND_REQ / NOT_BOUND / INVALID_INPUT
  ② 落章判定 alreadyConfirmed（不动）
       ├ 已确认 → 早退分支：contentGatesForMove → checkDesignCompletenessGate（kind=design）
       │            └ 全过 → applyConfirmedAdvance（**新**）→ applyDiveTransition('confirm-advance')
       └ 未确认 → 弹框 → 作答 → applyConfirmDecision
                                  ├ 落章（单一 mutate）
                                  ├ syncRTMYaml
                                  ├ applyConfirmedAdvance（**抽出**，位置与原迁移块相同：门在它之前）
                                  ├ applyDiveTransition（无条件，位置不动）
                                  └ plan 门合并（仅 from=decomposing，不动）
```

两条路径的**共同纪律**：**先门后迁移**（门不过不得动 `status`）；**落章与推进分开**（推进失败不回滚确认章）。

## B-2 为什么 `triggerAutoConfirm` 的预判必须早于登记挂起票 <!-- serves: FR-3 -->

挂起票（`pendingConfirms.register`）会拦本窗口写路径（`reqboard_submit` / `reqboard_decompose` /
`reqboard_move` / `reqboard_task_move`）。若先登记票再发现「这次推进注定进不去」，人就得为一个
**没有下游价值的确认**作答，或在 30 分钟 TTL 里被钉住——REQ-261005200052-ce40 FR-1 已经为同族形态付过代价。
故预判放在 `askConfirm` 之前（`triggerAutoConfirm` 内），返回 `{triggered:false}` 时**不产生任何票**。

## B-3 失败响亮（禁静默降级） <!-- serves: FR-2 -->

| 失败 | 表现（必须可见） |
|---|---|
| 闸门不过 | 返回体 `gate_failure{code,gaps,message}`（含可执行 `how`），note 带「…未推进：<msg>」 |
| 迁移抛错 | `advanceNote = '；推进失败：<msg>'` + `advanced:false`（**不吞**，由调用方进 note） |
| 自动确认被预判拦下 | `{triggered:false, reason:<门文案>}`，且 submit 回执 note 里可见 |
| 弹框通道不可用 | 既有 `fallback:'board'` 路径（不变）——**不得**因为新增预判把这条路径吞掉 |

## B-4 幂等与重复调用 <!-- serves: FR-1, FR-2 -->

- **已推进 + 再重发**：`advanceTargetFor(from)` 给出**新**目标（design → decomposing），闸门（设计完整性）
  多半不过 → `advanced:false + gate_failure`。这是**如实的新一次尝试**，不是重复推进。
- **同一 `from → to` 的重复迁移**：单点内 `req.status !== from` ⇒ 原样返回（不写第二条 `[自动推进]` 评论）。
- **`applyConfirmDecision` 的主路径**：`plan` 门合并的幂等（`landed.alreadyLanded > 0` ⇒ 跳过重复拆分后仍推进）
  由既有代码保证，本次不动它。
- **`triggerAutoConfirm`**：每次 submit 至多触发一次；预判拦下时不写任何状态（纯读 + 早退）。

## B-5 并发与多窗口 <!-- serves: FR-1 -->

- 席位模型不变（owner/worker/observer）；`applyConfirmedAdvance` 的 actor 一律 `{kind:'human', sessionId: windowKey}`，
  与本窗口的确认动作同源（人确认了这次推进）。
- 台账写入走 `mutateIfPresent` + `status` 期望值（乐观并发）：另一窗口先推进 ⇒ 本次空转，不覆盖别人的状态。
- 挂起票仍是**按窗口**的唯一性（`pendingForWindow` 覆盖旧票的既有语义不变）。

## B-6 与既有门禁的关系（不越权） <!-- serves: FR-2, FR-4 -->

- `contentGatesForMove` 仍是**唯一**的 async 内容门入口（含原型三门 + 裁定门 + 阶段时序门）；
  本次既没有新增门，也没有把门的判定复制到别处——早退分支调用的就是它。
- `checkPrototypePresenceGate` 仍是**唯一**的原型存在判据；`triggerAutoConfirm` 的预判直接调用它，
  **不另写**「什么算 UI 需求」（复用 `category-doc-sets` 的 sides 解析）。
- `reqboard_move` 的人工门、产物闸门（`artifact_not_confirmed`）**均不修改**：本需求只让 agent 在
  确认门上多一条合法出口，不给人门开后门。

## B-7 代码落点（一句话职责） <!-- serves: FR-4 -->

| 文件 | 职责（改动后） |
|---|---|
| `src/application/internal/confirm-settle.ts` | 确认裁决的**全部**写入：落章、单点推进、门合并、失败留痕 |
| `src/application/use-cases/AskConfirm.ts` | 编排：绑定校验、落章判定、弹框、早退分支（复用单点推进） |
| `src/application/internal/auto-confirm.ts` | 自动唤醒：**先预判（原型存在门）再弹框**，fire-and-forget |
| `src/application/use-cases/SubmitArtifact.ts` | 接住异步 `triggerAutoConfirm` 的结果并把 `reason` 带进回执 note |
