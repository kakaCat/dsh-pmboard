# 确认门的推进契约：已落章 + 闸门通过 ⇒ 兑现推进（contract）

> 来源：**REQ-261006094052-1da2**（2026-10-06 立项 / 2026-10-06 验收归档）。
> 追认缺陷现场：来源需求 **REQ-261006092213-4f5b**（UI 需求）实测「产物已落章、需求仍停在 brainstorming」。
> 本文只写**会被别的需求引用**的契约与口径；执行期的裁决与偏差记录留在该需求的
> `reviews/implementation-review.md` 与 `reviews/decision-mapping.md`。

## 1. 两条路径，一份实现

「确认门」承担两件事：**落章**（人确认了这个产物）与**推进**（把人确认的结果兑现成状态前进）。
改动前这两件事只在**首次确认**那条路径上齐全：另有一条「产物已落章后重发确认」的**早退分支**，
它算完闸门却**从不推进**（`return advanced:false`），于是「已落章 + 产物补齐」之后 agent 没有任何
可执行出口——`reqboard_move` 被人工门拒，重发确认不推进，只能请人去面板点。

| 路径 | 触发 | 实现 |
|---|---|---|
| 首次确认 | 产物未落章 → 弹框 → 人肯定作答 | `applyConfirmDecision`：落章 → 门 → 推进 → （plan）门合并开跑 |
| 已落章重发 | `alreadyConfirmed && !planAwaitingAdvance` | `AskConfirm` 早退分支：门 → **调同一份推进单点** |

**单点**：`application/internal/confirm-settle.ts` 的
`applyConfirmedAdvance(deps, {requirementId, windowKey, from, to, nowTs})` → `{advanced, advanceNote}`。

**调用纪律（不可换序）**：

1. 调用方**必须先过闸门**（门不过不得调它——那正是「状态不变」的判据）；
2. 单点只做状态迁移（`transitionRequirement` + `[自动推进]` 评论 + `stampCheckpoint`）；
3. 迁移抛错**只留痕不抛**（`advanceNote = '；推进失败：<msg>'`，`advanced:false`）；
4. 单点**不碰确认章**（落章在调用方；重复写会把确认时间与证据洗成第二次）；
5. `req.status !== from` ⇒ 原样返回（乐观并发护栏，不重复迁移、不写第二条评论）；
6. **清位先于落章/推进**（REQ-261006170150-52cc FR-1）：收敛点开头必须带**本次这票的 `ref`**
   **await** 完成解除等待（内存登记 + 台账停手位两半），再做落章与推进。
   为什么不可换序：不 await / 不带 ref ⇒ 内存登记还在 ⇒ 紧接着推进触发的 `requirement-moved`
   到达驱动时被 `dialogInFlight` 挡下并**丢弃这一拍**（2026-10-06 事故：状态前进了、agent 不动，
   人只能手敲「继续」）。此处显式传 `notify:false`——推进那次写会驱动一次，再发会投出旧阶段的回合文。
7. **没推进成功要补一次驱动**（FR-2）：本次 settle 结束时 `advanced !== true` ⇒ 补发
   `notifyDrivable` 恰一次；`advanced === true` 则不补（事件已驱动，再补会起第二轮）。

## 2. 对外可观测契约

| 面 | 契约 |
|---|---|
| 工具 | `reqboard_ask_confirm(target=artifact, kind=<kind>)`——参数与返回键**零变更** |
| 返回体 | `confirmed:true` + `advanced:true` + `from`（原状态）+ `to`（`advanceTargetFor(from)`） |
| note | 前缀保留「已确认，未重复弹框（FR-9/FR-11）」；推进时追加「；已自动推进：from → to」 |
| 台账 | `status` 真前进；评论多一条 `[自动推进] <from> → <to>：确认弹框肯定答复（reqboard_ask_confirm 原子推进）` |
| 自动链 | 推进后发 `confirm-advance` 事件（复位健康位；**绝不改写 activation**）——与首次确认同源；另有 **清位即驱动**：停手位被清成功即回调 `notifyDrivable` → round 半 `onRequirementMoved`（不新增进会话的投递路径） |
| 闸门不过 | `advanced:false` + `gate_failure{code,gaps,message}` + note「…未推进：<msg>」，**状态不变** |
| 无下一阶段 | `advanced:false`、**无** `gate_failure`、note 前缀为「已确认，未重复弹框」 |
| `advance:false` | 明确不推进（人的开关优先于闸门） |

## 3. 门必须与主路径**同一份**（后门事故，必读）

早退分支的设计完整性门原先**只按 `kind=design` 判**，而主路径按
`gateForTransition(from, to)?.id === 'G2'` 判。两条口径不一致 ⇒ 在 `design` 阶段用
`kind=requirement` 重发确认，就能**绕过 G2 直接推进到 decomposing**。
这正是本仓反复栽过的「**某条路径漏门 = 后门**」形态：**只要给一条路径补上"推进"，就必须同时检查
它的门与主路径是否同源**。

正确写法（两条条件取并集，保留旧的「已确认设计产物 → 报缺口」语义）：

```ts
const designGateApplies = (targetKind === 'artifact' && kindRaw === 'design')
  || (advanceTo !== undefined && gateForTransition(targetReq.status, advanceTo)?.id === 'G2')
```

回归锚点：`tests/confirm-advance-deadlock.test.ts` 的 **TC-9**（design 阶段设计文档未交齐 ⇒ 不推进、状态不变）。

## 4. 自动确认：窄口径预判，只挡「注定失败」的那一道门

`triggerAutoConfirm` 在**登记任何挂起票之前**多一步预判：本次确认的推进目标是 `design`
（即 `advanceTargetFor(req.status) === 'design'`）且原型存在门不通过（UI 需求缺已登记原型）时，
返回 `{triggered:false, reason: <门文案>}`，**不弹框、不登记票**（挂起票会拦整个窗口的写路径，
绝不能为一个进不去的确认钉上一张）。

**为什么只预判这一道门（不是 `contentGatesForMove` 全套）**：裁定门对**所有 feature 需求**生效
（`checkDecisionLogGate` 只按 `category === 'feature'` 早退，不看端侧）。宽口径预判会让一个新 feature
需求在写「讨论与裁定记录（D-x）」之前**永远不被请人确认**——等于把 REQ-261005200052-ce40 决议 #13
「确认章是可选加强」改成「下游齐了才配确认」。

## 5. 存量收益与回滚

- **存量**：「已落章未推进」的需求**无需迁移**——重发一次确认门即推进（读路径不变，写路径自然受益）。
- **零 schema 变更**：不新增台账字段、不改产物 schema、不改工具参数（`src/shared/protocol.ts` 未改）。
- **回滚**：`revert` 三处源码即回到旧行为，无数据残留。

## 6. 可复核锚点

| 面 | 位置 |
|---|---|
| 单点 | `src/application/internal/confirm-settle.ts` · `applyConfirmedAdvance` |
| 早退分支 | `src/application/use-cases/AskConfirm.ts`（门适用条件 + 调用单点 + dive 复位） |
| 预判 | `src/application/internal/auto-confirm.ts`（`triggerAutoConfirm` 改 async） |
| 回执 | `src/application/use-cases/SubmitArtifact.ts`（两处 `await` + note 带 `reason`） |
| 用例 | `tests/confirm-advance-deadlock.test.ts`（TC-1~TC-9）；`tests/design-gate-messages.test.ts` TC-4 |
| 需求材料 | `docs/requirements/REQ-261006094052-1da2/`（requirement / design / reviews / tests / verification） |

**改这一片时的三条自检**：① 早退分支的门与主路径是否同源；② 单点是否被两条路径共用（不得长出第二份迁移逻辑）；
③ 动了导出符号后跑 `pnpm kb:build`（否则 `tests/kb-generate.test.ts` 会红，与功能无关）。
