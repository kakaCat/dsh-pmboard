# 接口设计 · REQ-261006164732-6503 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 关注点：签名 / 返回 / 错误语义逐字定死。
> 对外：`reqboard_ask_confirm` 的**参数零变更、返回键零新增**；`reqboard_status.pending_confirms[]` 既有键不变。
> 对内：新增**一个**内部单点 `requestGate`，其余为既有函数的签名内改动。

## I-1 `requestGate`（新增 · 建门唯一入口） <!-- serves: FR-1, FR-3 -->

模块：`src/application/internal/gate-request.ts`（与 `auto-confirm.ts` / `pending-confirm.ts` 同居 `internal/`：
这三者都是"门的投递与生命周期"，不该散到 `use-cases/`）。

```ts
export interface GateRequestInput {
  requirementId: string
  target: 'artifact' | 'plan'
  kind: string
  question: string                    // 原始题干（披露句由调用方/AskConfirm 追加）
  optionLabels?: readonly string[]
  advance?: boolean
  inlineGraceMs?: number              // 自动弹传 2000；agent 显式弹不传（沿用配置缺省宽限）
}

export type GateRequestOutcome =
  | { mode: 'reused'; ticket: string }                 // 已有未作答门 → 不弹框，返回原 ticket
  | { mode: 'already-settled'; confirmed: boolean }    // 已落章 → 不弹框（沿用既有早退语义）
  | { mode: 'opened'; ticket: string }                 // 新建并登记 → 由调用通道弹框

export async function requestGate(
  deps: UseCaseDeps,
  input: GateRequestInput,
  exec: unknown,
): Promise<GateRequestOutcome>
```

**判定顺序**（不可换序，见 A-3）：`reused` → `already-settled` → `opened`。

**前置（不满足即抛，沿用既有码）**：需求绑定与在册校验（`REQBOARD_NO_BOUND_REQ` /
`REQBOARD_NOT_BOUND_TO_WINDOW`）、`target`/`kind` 值域校验（`REQBOARD_INVALID_INPUT`）、
产物在册校验（`REQBOARD_MISSING_ARTIFACT` / `REQBOARD_MISSING_PLAN`）。

**副作用**：仅 `mode==='opened'` 才登记门；`reused` / `already-settled` **零副作用**（不弹框、不登记、不 settle、不写台账）。

## I-2 三个建门调用点（改） <!-- serves: FR-1, FR-3 -->

| 调用点（模块） | 现状 | 改为 |
|---|---|---|
| `internal/auto-confirm.ts::triggerAutoConfirm` | 直接 `askConfirm(...)` fire-and-forget | 先 `requestGate`；`mode!=='opened'` ⇒ 记一条"未弹框原因"并返回 `{triggered:false, reason}` |
| `use-cases/AskConfirm.ts::askConfirm`（agent 显式 / evidence 路径） | 自行登记 + 弹框 | 经 `requestGate`；`reused` ⇒ 返回 `pending=true + 原 ticket`；`already-settled` ⇒ 既有早退返回体 |
| `use-cases/SubmitVerification.ts`（G4 在 submit 内 `await`） | 直接 `await askConfirm(...)` | 经 `requestGate`（**阻塞形态不变**：仍在 submit 内 await） |

**evidence 文字路径**（`ask_confirm` 传 evidence）：不建门，直接落章；但落章必经 I-6 的两个前提 + 首写不变。

## I-3 `reqboard_ask_confirm` 对外返回（零新增键） <!-- serves: FR-1, FR-2 -->

复用分支返回**既有键**：

```json
{
  "success": true,
  "confirmed": false,
  "advanced": false,
  "pending": true,
  "ticket": "<已有门的 ticket>",
  "requirement_id": "REQ-…",
  "note": "该确认已有一道门在等（ticket=pc-xxxxxx）：未重复弹框。请调 reqboard_confirm_receipt(ticket=\"pc-xxxxxx\") 取回执，或到项目看板作答"
}
```

- **不新增返回键**：避免 `shared/protocol.ts` schema 与绑定层 / output-contract 用例的连带变更；
  "复用"由 `pending=true` + `ticket === 原票` + note 文案表达（用例据此断言）。
- 若将来确需机器可读标记（如 `reused: true`）：只允许**加性可选键**，且必须与 schema、output-contract
  用例在**同一次变更内**提交（本仓已有"新增键未同步 schema 即当场报错"的前科）。
- 早退分支（`already-settled`）返回体与之逐字同前（`note` 仍为「…已确认，未重复弹框（FR-9/FR-11）」）。

## I-4 `PendingConfirmRegistry`（改 · 新增只读查询） <!-- serves: FR-1, FR-2 -->

```ts
/**
 * 只读查同门「未作答且未过期」的记录（纯读：不改状态、不续期、不清理）。
 * 命中至多一条（G-3 不变式）；未命中返回 undefined。
 */
findOpen(input: {
  requirementId: string
  target: 'artifact' | 'plan'
  kind?: ArtifactKind
}): PendingConfirmation | undefined
```

- `register` 语义**不改**（仍登记新票）：幂等判定留在 `requestGate` 一处，避免"两个地方都判一遍"。
- `get` / `pendingForWindow` / `settle` / `markInterrupted` / TTL / `storageActions` 系列**逐字不变**。

## I-5 `AskConfirm` 的陈旧票清理（改 · 分门） <!-- serves: FR-1 -->

现状：登记新票前把**同窗口所有**未作答票 `settle({confirmed:false, advanced:false})`（`AskConfirm.ts:242`）。

改为：

| 命中的旧票 | 处理 |
|---|---|
| **同门**（I1 键相同） | **跳过**（保留，交给 `requestGate` 复用） |
| **异门** | 仍 settle（防止窗口被"上一步留下的门"钉死 30 分钟） |

判据：同门连调两次 ⇒ 票表计数不变、`ticket` 相同；异门实例 ⇒ 旧票 `outcome` 非空、新票在场。

## I-6 落章前提与迟到作答（改） <!-- serves: FR-4, FR-5 -->

```ts
/** confirm-settle.ts：落章前的两个前提（A-4） */
export interface SettlePrecondition {
  gateOpen: boolean        // 该 ref 的记录 outcome === undefined
  onSourceStage: boolean   // req.status === sourceStageOf(target, kind)
}
```

- `applyConfirmDecision`：入口先算前提；`gateOpen === false || onSourceStage === false` ⇒ 返回
  `{success:true, confirmed:false, advanced:false, note:'该确认已被取代（或需求已推进到 <status>）：本次作答不改变状态'}`，
  并调 `recordStaleAnswer` 留一条评论——**不落章、不推进、不抛**。
- 落章写入改为**仅当为空时写**：`approvedAt` / `confirmedAt` / `approvedEvidence` / `confirmedEvidence`。
- `recordStaleAnswer(deps, {requirementId, windowKey, question, picked, nowTs})`（新增，与 `recordDeclinedConfirmation` 同址）：
  只写评论（含"已被取代 / 已推进"事实），返回体中性。

## I-7 文案契约（改） <!-- serves: FR-3 -->

| 面 | 现状 | 改为 |
|---|---|---|
| `SubmitArtifact` 回执 note（G1/G3） | `triggered=true` 时仍写「下一步：调 `reqboard_ask_confirm`…」 | 「已有一道门在等（ticket=…）：调 `reqboard_confirm_receipt` 取回执或到看板作答，**不要**再发起确认」 |
| `internal/capture-section.ts`（设计/拆分两处） | 无条件「提交后调 `reqboard_ask_confirm` 弹框请人批准」 | 条件式：「**若回执已说明有门在等 → 不要重复发起**；否则发起一次」 |
| `domain/prompt/fragments/decomposing/{light,heavy}.md` | 同上（无条件弹框） | 同上条件式（改片段 ⇒ C-16 重生成 + C-17 校验） |
| `domain/prompt/fragments/brainstorming/heavy/overrides.md`（覆盖 1 · 交棒） | 无条件「用 `reqboard_ask_confirm` 交棒」 | 同上条件式 |
| `internal/pending-guard.ts::pendingConfirmRejectMessage` / recovery | 「③ 重新发起 `reqboard_ask_confirm` 覆盖旧记录」 | 「③ 已有一道门在等：①取回执 ②到看板作答」（删掉"覆盖"措辞） |
| `use-cases/ConfirmReceipt.ts` note | 现状 | **不变** |

## I-8 错误码（不新增） <!-- serves: FR-5 -->

| 码 | 触发 | 本次变化 |
|---|---|---|
| `REQBOARD_CONFIRM_PENDING` | 写路径被在途门拦住 | **文案改**（I-7），码与拦截范围不变 |
| `REQBOARD_NO_BOUND_REQ` / `REQBOARD_NOT_BOUND_TO_WINDOW` | 前置：本窗口无绑定需求 | 不变 |
| `REQBOARD_INVALID_INPUT` | 前置：`target`/`kind`/`question`/宽限非法 | 不变 |
| `REQBOARD_MISSING_ARTIFACT` / `REQBOARD_MISSING_PLAN` | 前置：无产物 / 无计划，不建"答不了的门" | 不变 |
| `REQBOARD_NONBLOCK_UNAVAILABLE` | 显式宽限但未装配挂起能力 | 不变 |

**不新增任何错误码**：复用分支不是错误（返回 `success:true`），迟到作答也不是错误（中性回执）。
