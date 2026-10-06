# 接口设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

> 关注点：**签名 / 返回 / 错误语义**逐字定死。对外工具参数与返回键**零变更**（不新增、不改名），
> 新增的只有一个内部函数。

## I-1 `applyConfirmedAdvance`（新增 · 内部单点） <!-- serves: FR-1, FR-4 -->

模块：`src/application/internal/confirm-settle.ts`（与 `applyConfirmDecision` 同址：同一件事的两条路径不该分居两文件）。

```ts
export interface ConfirmedAdvanceInput {
  requirementId: string
  windowKey: string          // 留痕主体（评论/迁移 actor 的 sessionId）
  from: RequirementStatus    // 调用方读到的当前状态（乐观并发护栏的期望值）
  to: RequirementStatus      // advanceTargetFor(from) 的结果
  nowTs: number
}

export interface ConfirmedAdvanceOutcome {
  advanced: boolean
  /** '' = 已推进；否则是以「；」开头的留痕片段（与改造前逐字同形） */
  advanceNote: string
}

export async function applyConfirmedAdvance(
  deps: UseCaseDeps,
  input: ConfirmedAdvanceInput,
): Promise<ConfirmedAdvanceOutcome>
```

**前置**：调用方已完成落章（产物 `confirmedAt` / `plan.approvedAt` 已写），且已确认 `d.advance !== false`。

**语义（顺序不可换）**：

1. `canReqTransition(from, to)` 为假 → 返回 `{advanced:false, advanceNote:'；当前状态 ' + from + ' 无可自动推进的下一阶段（验收/归档走验收单流程）'}`。
2. 否则在 `mutateIfPresent` 内：`req.status !== from` → 原样返回（**不**迁移，保持既有乐观并发语义）；
   否则 `transitionRequirement(req, to, {at, actor:{kind:'human',sessionId:windowKey}, reason: CONFIRM_ADVANCE_REASON, snap})`
   + 追评 `[自动推进] <from> → <to>：确认弹框肯定答复（reqboard_ask_confirm 原子推进）` + `stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')`。
3. 返回 `{advanced:true, advanceNote:''}`。

**错误**：**不抛**。任一异常被吞进 `advanceNote = '；推进失败：' + message` 且 `advanced:false`
（与改造前 :253-255 逐字一致——调用方据此组装 `gate_failure` 之外的留痕，不得静默）。

**副作用清单**（可被用例断言）：台账 `status` / `statusHistory` / `comments` / `checkpoint`；**不写**产物确认章（那在调用方）。

## I-2 `applyConfirmDecision`（改动 · 主路径行为不变） <!-- serves: FR-1 -->

第 232-255 行的 `try { mutateIfPresent(...) } catch {}` 整块替换为一次 `applyConfirmedAdvance` 调用，
`advanced` / `advanceNote` 取自返回体。**其余每个分支、每句文案、`applyDiveTransition` 的位置与条件都不动**：

- 分支顺序：`contentGateFailure` → `designGateFailure` → 可推进 → `d.advance` 兜底文案（原样）。
- `gateForTransition(from, to)?.id === 'G2'` 的守卫条件（:219）原样保留。
- 返回值 `{from, to, advanced, gateFailure?, note}` 逐字不变。

## I-3 `askConfirm` 早退分支（改动 · 唯一行为变化点） <!-- serves: FR-1, FR-2 -->

触发条件（**不变**）：`alreadyConfirmed && !planAwaitingAdvance`（`AskConfirm.ts:96`）。

```
advanceTo = advanceTargetFor(targetReq.status)
① contentGatesForMove(from, advanceTo) 不过  → 【原样】advanced:false + gate_failure + note「…；from → to 未推进：<msg>」
② kind=design 且 checkDesignCompletenessGate 不过 → 【原样】advanced:false + gate_failure + note（含「仍有 N 份未登记」）
③ 闸门全过 且 advanceTo !== undefined 且 advance !== false
     → 调 applyConfirmedAdvance；advanced === true 时再调 applyDiveTransition('confirm-advance')
     → 【新】{success:true, confirmed:true, advanced:true, from:<原状态>, to:<advanceTo>, requirement_id, note:'产物 <kind> 已确认，未重复弹框（FR-9/FR-11）；已自动推进：<from> → <to>'}
④ 闸门全过但 advanceTo === undefined 或 advance === false → 【原样】advanced:false + note（前缀同 FR-9/FR-11）
```

`note` 前缀**必须保留**「已确认，未重复弹框（FR-9/FR-11）」原串（既有用例与人在看板上读到的语义都靠它；
`tests/design-gate-messages.test.ts` 对 ② 的断言逐字依赖它）。③ 的 `note` 只**追加**推进结论，不改前缀。

## I-4 `reqboard_ask_confirm`（对外工具 · 零变更） <!-- serves: FR-1, FR-2 -->

参数与返回键**均不变**：`target` / `kind` / `question` / `options` / `advance` / `inline_grace_ms`；
返回 `success` / `confirmed` / `advanced` / `from` / `to` / `requirement_id` / `gate_failure?` / `note`。
本次只是让 `advanced:true` 这条**本来就存在的形状**在早退分支上真的出现（此前只有首次确认会给）。

## I-5 `triggerAutoConfirm`（改动 · 变 async） <!-- serves: FR-3 -->

模块：`src/application/internal/auto-confirm.ts`。

```ts
// 改动前： export function triggerAutoConfirm(deps, input, exec): AutoConfirmResult
export async function triggerAutoConfirm(deps, input, exec): Promise<AutoConfirmResult>
```

- 返回体形状**不变**：`{triggered: boolean, reason?: string}`（`output-contract` 静态扫描盯的就是它）。
- 新增早退（FR-3）：`input.target === 'artifact'` 且需求存在且 `advanceTargetFor(req.status) === 'design'`
  且 `checkPrototypePresenceGate(deps.docs, req)` 返回失败 → `{triggered:false, reason: <gate.message>}`，
  **不登记挂起票、不弹框**。
- 其余情况：`{triggered:true}` + 后台 fire-and-forget（逐字不变）。
- 取数前按既有纪律 `applyRequirementWorkspaceRoot(deps, req)` 校正根（同 `AskConfirm` / `confirm-settle`）。
- 弹框通道不可用（`deps.questions.available() === false`）时**先**返回既有 reason，不被新早退改写。

**两个调用点必须 `await`**（`SubmitArtifact.ts` 的 `kind=requirement` 与 `kind=plan` 两处）：
不 await 会把 `Promise` 塞进 `auto_confirm` 字段 → output 校验拒绝（本仓有过同类事故）。

## I-6 错误码表（本次**不新增**码） <!-- serves: FR-2 -->

| 场景 | 现状 | 本次 |
|---|---|---|
| 闸门不过（内容 / 设计完整性） | 返回体 `gate_failure`（code 由门给，如 `design_doc_incomplete`） | 不变 |
| 无产物可落章 | 抛 `REQBOARD_MISSING_ARTIFACT` / `REQBOARD_MISSING_PLAN` | 不变 |
| 需求不在台账 | 抛 `REQBOARD_STORE_INCONSISTENT` | 不变 |
| 无可自动推进的下一阶段 | `advanced:false` + note | 不变（文案由单点产出，与改造前逐字同形） |
| 原型存在门不过（自动确认） | 弹框后闸门不过 | `triggered:false` + `reason`（文案取门本体，不另写） |
