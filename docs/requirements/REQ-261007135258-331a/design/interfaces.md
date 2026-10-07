---
req: REQ-261007135258-331a
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 接口设计（REQ-261007135258-331a · 确认通道接线收敛）

> 本份定死「推进 + 收尾」的单点签名、四条通道的回执契约与错误码；不写任务表。

## 接口清单 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 接口 id | 名称 | 形态 | 变更 | serves |
|---|---|---|---|---|
| I-1 | `applyConfirmedAdvance` | 内部函数（TS） | 扩可选入参 + 扩返回体（向后兼容） | FR-1, FR-2, FR-3 |
| I-2 | `finishConfirmAdvance` | 内部函数（TS，新建模块） | 新增 | FR-3 |
| I-3 | `POST /req/artifact/confirm`（看板一键确认） | HTTP JSON | 回执字段语义调整（推进不再依赖窗口在线） | FR-1, FR-4 |
| I-4 | `reqboard_confirm_artifact`（文字证据确认） | 工具 | 回执形状不变，实现改走 I-1 | FR-2 |
| I-5 | 内容门 / 时序门回执的 `how` 文案 | 文案契约 | 指路改为 `reqboard_ask_confirm` | FR-5 |
| I-6 | `ConfirmDecision.advanceReason`（可选） | 内部入参 | 新增可选键 | FR-1, FR-2 |

## I-1 推进单点 `serves: FR-1, FR-2, FR-3`

```typescript
// src/application/internal/confirm-settle.ts
export interface ConfirmedAdvanceInput {
  requirementId: string
  windowKey: string
  /** 调用方读到的当前状态（乐观并发护栏的期望值） */
  from: RequirementStatus
  to: RequirementStatus
  nowTs: number
  /** 新增（可选）：留痕原因；缺省 = 既有 CONFIRM_ADVANCE_REASON（逐字节不变） */
  reason?: string
  /** 新增（可选）：通道来源标签，只进留痕，不改行为 */
  sourceLabel?: 'prompt' | 'gate-prompt' | 'evidence' | 'board'
  /** 新增（可选）：缺省 true = 推进成功后做统一收尾；false 只推进（测试与特殊路径用） */
  clearStopPosition?: boolean
}

export interface ConfirmedAdvanceResult {
  advanced: boolean
  /** 既有：未推进 / 失败的可读说明（"；"+ 一句），形状与语义不变 */
  advanceNote: string
  /** 新增（可选）：本次收尾结果；未推进时整体省略 */
  finish?: {
    /** 后置条件：收尾结束时该需求**不处于** awaiting-confirm:*（已在更早步骤清过 ⇒ 仍为 true） */
    stopPositionCleared: boolean
    /** 本次动作**真的**把停手位从 awaiting-confirm:* 清成了 healthy（幂等复查用） */
    clearedNow: boolean
    /** 后置条件：收尾后 driverHealth.state !== 'paused'（含"本来就是 healthy"） */
    healthReset: boolean
    /** 是否发生了跨阶段迁移（= advanced） */
    stageChanged: boolean
  }
}

export function applyConfirmedAdvance(
  deps: UseCaseDeps,
  input: ConfirmedAdvanceInput,
): Promise<ConfirmedAdvanceResult>
```

**行为契约（必须逐条成立）**：

1. `canReqTransition(from, to) === false` → `advanced:false` + 既有兜底文案，**不**调用收尾。
2. `req.status !== from`（并发下已被别人推进）→ 幂等跳过，**不**报错、**不**重复迁移、**不**重复留痕。
3. 迁移成功 → 写 `[自动推进] <from> → <to>：<reason>` 评论 + `stampCheckpoint`（既有语义）→ 调用 I-2 收尾。
4. 任何异常都**不抛**：吞进 `advanceNote`（既有口径，:276-278）。

## I-2 统一收尾 `serves: FR-3`

```typescript
// src/application/internal/confirm-advance-finish.ts（新建）
export interface FinishConfirmAdvanceInput {
  requirementId: string
  windowKey: string
  from: RequirementStatus
  to: RequirementStatus
  nowTs: number
  /** 本次这票的弹框 ref；缺省 = 清该需求任意 awaiting-confirm:* 残影 */
  dialogRef?: string
}

export interface FinishConfirmAdvanceResult {
  stopPositionCleared: boolean
  healthReset: boolean
  stageChanged: boolean
}

/** 永不抛：内部两件事各自 try/catch，失败只留痕（告警 + 日志），绝不回滚已完成的推进。 */
export function finishConfirmAdvance(
  deps: UseCaseDeps,
  input: FinishConfirmAdvanceInput,
): Promise<FinishConfirmAdvanceResult>
```

**内部两步（顺序固定）**：

1. `exitAwaitingConfirm(awaitingConfirmDepsFrom(deps), { requirementId, ...(dialogRef ? { ref: dialogRef } : {}), reason: 'answered' })`
   —— 清台账停手位；成功清位时 `onCleared → notifyDrivable` 会请求一次驱动（既有语义）。
2. `applyDiveTransition({store, now}, requirementId, 'confirm-advance', { kind:'human', sessionId: windowKey }, { stageChanged: true, status: from })`
   —— 复位运行时健康位、按需归零 `roundsInStage`，**不改 `activation`**（既有语义）。

## I-3 看板一键确认回执 `serves: FR-1, FR-4`

```typescript
// POST /req/artifact/confirm  →  200 JSON（既有字段保留，语义收紧）
interface BoardConfirmResponse {
  id: string
  status: RequirementStatus
  artifacts: unknown[]
  /** 本次是否真的完成了阶段推进 */
  advanced: boolean
  /** 是否成功把唤醒回合投给绑定窗口（与 advanced 解耦） */
  delivered: boolean
  /** 被内容门 / G2 拦下时的结构化缺口（未推进时才有） */
  gate_failure?: { code: string; gaps: string[]; message: string }
  note?: string
}
```

**契约变化（FR-4）**：`advanced` 只由「台账能否推进」决定；窗口不在线时
`advanced:true, delivered:false, note:'已推进；窗口不在线未投递'`。
改造前该分支是 `advanced:false`（把投递前置当成了推进前置）。

## I-4 文字证据确认回执 `serves: FR-2`

`reqboard_confirm_artifact` 的返回键**逐字不变**（`success / requirement_id / target / kind / via / advanced / stamped / evidence_verified / gate_failure? / note`）。
变化只在实现：推进块改调 I-1；`advance:false` 时行为与改造前一致（不推进、不报假缺口）。

## I-5 门禁回执的指路契约 `serves: FR-5`

内容门（`decision-gates.ts`）与时序门（`stage-gate-timeline.ts`）的 `gate_failure.how`
**必须**包含字符串 `reqboard_ask_confirm`，且**不得**包含 `reqboard_move(requirement_id`。

理由：`brainstorming → design` 等门是 `humanOnly`，agent 调 `reqboard_move` 必被
`REQBOARD_HUMAN_GATE` 拒（实测：REQ-261007101318-c392 10:27:34）。agent 唯一可执行的恢复路径是
重新 `reqboard_ask_confirm`（产物已落章 ⇒ 走"已确认未推进"分支 ⇒ 闸门全过即自动推进）。

## 错误码（保持不变，供回执与测试断言） `serves: FR-1, FR-5`

| 错误码 | 触发 | 本需求是否改 |
|---|---|---|
| `REQBOARD_HUMAN_GATE` | agent 调 `reqboard_move` 走人工门迁移 | 不改（且 @I-5 让文案不再把 agent 引到这里） |
| `REQBOARD_CONFIRM_PENDING` | 确认门在途时调用写工具（submit / decompose / move / task_move） | 不改 |
| `decision_entry_invalid` | 裁定表条目五要素不全（`gate_failure.code`） | 不改判定，只改 `how` |
| `design_contains_decomposition` | 设计文档命中任务表 / 拆分章节特征 | 不改 |
| `design_doc_incomplete` | `design → decomposing` 时文档集不齐或未全部落章 | 不改 |

## 向后兼容 `serves: FR-1`

- I-1 新增入参**全部可选**：不传 = 改造前行为（`reason` 走既有常量、收尾默认执行）。
- I-1 返回体的 `finish` 键在未推进时**整体省略**（不发 `null`）。
- I-3 的 `advanced` 语义变化是本需求**故意**的行为变更，已在 `test-cases.md` TC-4 正面断言。
- I-4 回执键零变更（既有消费者与测试不受累）。
