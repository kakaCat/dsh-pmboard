---
serves: FR-1, FR-2, FR-3, FR-4
---

# 接口与数据契约（REQ-261006170150-52cc）

> 契约口径：**工具层零变更**——`reqboard_*` 的参数与返回键一字不动；本需求只改内部端口与一处装配。
> 所有新增/扩展字段一律**可选**，缺省即旧行为（兼容性矩阵见末节）。

## 端口与签名 `serves: FR-1, FR-2, FR-3`

**等待位（清位 + 回调）**

```ts
// src/application/internal/awaiting-confirm.ts
export interface AwaitingConfirmDeps {
  store: RequirementStore
  dialogs?: DialogInFlightPort
  now: () => number
  alert?: { alert(input: { requirementId: string; title: string; content: string }): void }
  /**
   * 停手位**真的被清**（awaiting-confirm:* → healthy）之后回调一次（FR-2）。
   * 纪律：**永不抛**——实现抛错只 `logger.warn`，清位结果不回滚。
   * 缺省 undefined = 零行为（与改造前逐字一致）。
   */
  onCleared?: (requirementId: string) => void
  logger?: { warn(message: string, err?: unknown): void }
}

export interface ExitAwaitingInput {
  requirementId: string
  /** 本次这票的 ref；缺省 = 清该需求任意 `awaiting-confirm:*`（心跳对账/重启恢复用） */
  ref?: string
  reason: AwaitingExitReason            // 'answered' | 'board' | 'canceled' | 'expired' | 'degraded'
  /**
   * 清位成功后是否回调 `onCleared`，**缺省 true**。
   * 只有确认收敛点显式传 false（它把请求推迟到 settle 末尾，理由见 architecture.md §时序）。
   */
  notify?: boolean
}

/** 返回值扩展（向后兼容：调用方可继续忽略） */
export type ExitAwaitingResult = {
  /** 台账停手位**本次真的**从 awaiting-confirm:* 清成 healthy */
  cleared: boolean
  /** 是否真的回调了 onCleared（cleared && notify !== false 且端口在） */
  notified: boolean
}
export function exitAwaitingConfirm(deps: AwaitingConfirmDeps, input: ExitAwaitingInput): Promise<ExitAwaitingResult>
```

**确认收敛点**

```ts
// src/application/internal/confirm-settle.ts
export interface ConfirmDecision {
  requirementId: string
  windowKey: string
  target: 'artifact' | 'plan'
  kind: string
  question: string
  picked: string
  nowTs: number
  advance: boolean
  /**
   * 本次确认对应的在途弹框 ref（FR-1）：
   *   · 会话弹框 = 挂起票 `pc-xxxxxx`；Dive 门框 = `dlg-gate-<req>-<ts>`。
   * 给了 ⇒ **在落章/推进之前**带它 await 清位（`notify:false`）。
   * 缺省 ⇒ 沿用旧行为（不带 ref 的 fire-and-forget 清位；该形态本就不会被停手位挡住不存在的票）。
   */
  dialogRef?: string
}

// 末尾补发的驱动请求（FR-2）：**仅在 `advanced !== true` 时**调用一次
//   deps.notifyDrivable?.(requirementId)
```

**挂起路径透传**

```ts
// src/application/internal/pending-confirm.ts
export interface ConfirmSubmitted {
  requirementId: string
  windowKey: string
  target: 'artifact' | 'plan'
  kind: string
  question: string
  optionLabels: readonly string[]
  advance: boolean
  /** 本次确认的在途弹框 ref（`ticket ?? 'dlg-confirm-<id>-<ts>'`）：透传给 applyConfirmDecision（FR-1） */
  dialogRef?: string
}
```

**用例/驱动依赖面（组合根注入的「清位即驱动」口）**

```ts
// src/application/ports.ts
export interface UseCaseDeps {
  // …既有字段不动
  /**
   * 停手位被清 → 请求一次自动链驱动（FR-2）。
   * 组合根实现 = `(id) => diveManager.roundDriver().onRequirementMoved(id)`
   * （**与 store 桥同一条路**：按需求 → sourceSessionId → agents.get → requestDrive，含误停摆重武装）。
   * 缺省 undefined = 未装配 ⇒ 行为与改造前逐字一致。
   */
  notifyDrivable?: (requirementId: string) => void
}

export interface WakeHeartbeatDeps {
  // …既有字段不动
  /** 同 UseCaseDeps.notifyDrivable：过期对账清位后也要把链路接上（FR-3） */
  notifyDrivable?: (requirementId: string) => void
}
```

**在途登记分档过期**

```ts
// src/adapters/PendingConfirmRegistry.ts
export interface PendingConfirmRegistryOptions {
  now?: () => number
  /** 票 TTL **与**挂起型在途登记 TTL（缺省 `LIMITS.pendingConfirmTtlMs` = 30 分钟，语义不变） */
  ttlMs?: number
  /**
   * 新增：阻塞型在途登记 TTL（缺省 `LIMITS.timeoutInteractiveMs` = 60 分钟）。
   * 为什么是 60 分钟：阻塞弹框的硬上界就是宿主交互工具超时（1 小时），
   * 且缺省宽限 = 59 分钟 < 60 分钟 ⇒ 只有真正"没人答"的登记才会被判过期。
   */
  blockingTtlMs?: number
  newTicket?: () => string
}
```

| 方法 | 语义（本次变化） |
|---|---|
| `enter({ref, windowKey, requirementId, kind, suspend})` | 不变（`since` 由实现盖章） |
| `exit(ref)` | 不变（幂等） |
| `inFlightFor(requirementId)` | **变化**：跳过已过期记录（惰性删除）；过期 ⇒ 返回 false = "无人等待" |
| `list()` | **变化**：同上，只回未过期快照（诊断面与判定面同口径） |

## 调用点清单 `serves: FR-1, FR-2`

| 文件 · 函数 | 本次改动 | 依据 |
|---|---|---|
| `confirm-settle.ts` · `applyConfirmDecision` | ①开头：`dialogRef` 给了就 `await exitAwaitingConfirm({ref: dialogRef, notify:false, reason:'board'})`；否则保留旧的 `void` 无 ref 调用。②`finally`：`if (advanced !== true) deps.notifyDrivable?.(d.requirementId)` | FR-1、FR-2 |
| `AskConfirm.ts` · `settleAnswers` 调用点 | 把算好的 `dialogRef`（`ticket ?? 'dlg-confirm-<id>-<ts>'`）随 `submitted` 传下去（同步与挂起两条路共用） | FR-1 |
| `gate-prompt.ts` · `createGatePromptPort.prompt` | 把自己算出的 `dialogRef` 交给 `applyConfirmDecision` | FR-1 |
| `wake-heartbeat.ts` · `reconcileAwaitingStops` | 清残影的 `exitAwaitingConfirm` 带上 `onCleared: deps.notifyDrivable` | FR-3 |
| `ReqboardDiveManager` · 构造 | `createWakeHeartbeat({ …, notifyDrivable: (id) => this.round.onRequirementMoved(id) })` | FR-2、FR-3 |
| `index.ts` · useCaseDeps 装配 | `notifyDrivable: (id) => diveManager.roundDriver().onRequirementMoved(id)` | FR-2 |
| `round-driver.ts` · `drive()` | 放弃本拍时调 `noteGiveUp(reqId, reason)`（`[WAKE-SKIP]` + 同因 60s 冷却） | FR-4 |

**不动的地方（写明以免误改）**：`h4-resume.ts`（仍 skip）、`pending-confirm.ts` 的 `wake()`（仍是空实现）、
`applyDiveTransition` 的 `confirm-advance` 规则、任何工具的参数与返回键、票 TTL 与三档宽限语义。

## 错误与幂等语义 `serves: FR-1, FR-2, FR-4`

| 场景 | 契约 |
|---|---|
| `dialogRef` 指向一个已不在途的票（迟到作答/重复作答） | `dialogs.exit(ref)` 幂等；台账若非 awaiting 则 `cleared=false`；**不报错** |
| 同需求第二票仍在途 | 台账停手位**不清**（沿用 `stillWaiting` 语义），仅在本次这票真的是当前停手位时清 |
| `onCleared` 抛错 | 吞 + `logger.warn`；`exitAwaitingConfirm` 照常返回 |
| 同一 settle 内推进成功 | **不**补发 notify（事件已驱动）；两条通道互斥（INV-4） |
| 未装配 `notifyDrivable` | 零行为；`advanced !== true` 时也不报错 |
| 过期判定与真实等待冲突 | 阻塞型 TTL 60 分钟 ≥ 缺省宽限 59 分钟 ⇒ 不会"框还在屏幕上、链已经跑起来" |
| 新增错误码 | **无**（不改工具契约，故无需新增 `REQBOARD_*` 码） |

## 组合根装配 `serves: FR-2, FR-3`

```ts
// src/index.ts（diveManager 之后）
notifyDrivable: (id: string) => diveManager.roundDriver().onRequirementMoved(id)

// src/application/dive/ReqboardDiveManager.ts（构造内，this.round 已就绪）
this.heartbeat = createWakeHeartbeat({ …, notifyDrivable: (id) => this.round.onRequirementMoved(id) })
```

为什么两处都要接：确认路径经 `UseCaseDeps`；**过期对账**跑在心跳里，它有自己的 deps 面，不接就只剩"清位了但没人叫"。

**层边界（C-01）**：`notifyDrivable` 是**注入的函数**，`application/**` 不 import `adapters/**` 与组合根；
新增代码不得违反 `npx vitest run tests/layer-boundary.test.ts`。

## 放弃留痕契约 `serves: FR-4`

```ts
/** 驱动本拍放弃的可查痕迹（有界）：同 (需求, 原因) 在冷却窗内只记一次。 */
function noteGiveUp(requirementId: string, reason: 'dialog-in-flight' | 'not-drivable' | 'human-gate'): void
```

| 面 | 契约 |
|---|---|
| 内容 | `[WAKE-SKIP] reason=<原因> req=<需求 id> status=<阶段>` |
| 去处 | `captureDiag(...)` → `~/.dsh/state/reqboard-capture-diag.log`（**不写台账评论**，防刷屏） |
| 频次 | 同 (需求, 原因) 冷却 **60s**：窗口内重复放弃只记一次 |
| 判据 | 单测：连续 5 拍放弃 ⇒ 该窗口内该原因**恰好 1 条**；跨冷却窗 ⇒ 再记 1 条 |

## 兼容性矩阵 `serves: FR-1, FR-2, FR-3`

| 装配形态 | 行为 |
|---|---|
| 全部新增端口缺省（旧装配/既有测试） | 与改造前**逐字一致** |
| 只装配 `dialogs`（无 `notifyDrivable`） | 清位照旧（FR-1 生效），驱动仍靠 `requirement-moved`；不报错 |
| 只装配 `notifyDrivable`（无 `dialogs`） | `onCleared` 只在台账**真的**清了时触发（`stillWaiting` 判据缺省为"无人等待"） |
| 装配齐全（生产） | FR-1/FR-2/FR-3 全生效 |

判据：`npx vitest run tests/layer-boundary.test.ts tests/config-defaults-parity.test.ts`
（后者锁"不配置/不注入 = 现状"，与本矩阵同源口径）。
