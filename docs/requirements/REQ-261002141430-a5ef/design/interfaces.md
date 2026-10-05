---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 接口设计（REQ-261002141430-a5ef）

> 对外工具接口**零变更**（不加参数、不改返回体）：本需求动的是**内部端口与准入判定**。

## 新增内部模块：awaiting-confirm `serves: FR-1, FR-2, FR-3`

**用途**：停手位的**唯一**写入/清除点，兼作准入判据的同步读口。

**调用方**：`AskConfirm`（用例）、`gate-prompt`（Dive 端口实现）、`confirm-settle`（落章收敛点）、
`wake-heartbeat`（对账）、`round-driver` / `AdvanceChain`（只读判据）。

**接口定义**：

```typescript
/** 停手原因前缀（判定、清理、对账三处共用，避免字面量散落） */
export const AWAITING_CONFIRM_PREFIX = 'awaiting-confirm:'

export interface AwaitingConfirmDeps {
  repo: ReqboardRepository          // 台账写（异步）
  dialogs: DialogInFlightPort       // 在途登记表（同步）
  now: () => number
  alert?: { alert(input: { requirementId: string; title: string; content: string }): void }
  logger?: { warn(message: string, err?: unknown): void }
}

/** 登记在先（同步），落库在后（异步；返回的 Promise **永不 reject**，调用方可不 await） */
export function enterAwaitingConfirm(
  deps: AwaitingConfirmDeps,
  input: { requirementId: string; windowKey: string; ref: string; kind: 'confirm' | 'gate'; suspend?: boolean; question?: string },
): Promise<void>

/** 清除（幂等；四处出口共用；留痕写明出口；返回的 Promise **永不 reject**） */
export function exitAwaitingConfirm(
  deps: AwaitingConfirmDeps,
  input: { requirementId: string; ref?: string; reason: 'answered' | 'board' | 'canceled' | 'expired' | 'degraded' },
): Promise<void>

/** 准入判据（同步、纯内存读；自动链唯一可用的"有人在等吗"；判据抛错按"无在途"放行） */
export function dialogInFlightFor(source: { dialogs?: DialogInFlightPort }, requirementId: string): boolean

/** 台账侧谓词：这条需求是否处于"等弹框"停手态（心跳对账用） */
export function isAwaitingConfirmStop(req: RequirementRecord | undefined): boolean

/** 从台账停手位取回 ref（不认识该形态 → undefined） */
export function awaitingRefOf(req: RequirementRecord | undefined): string | undefined
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `requirementId` | `string` | 是 | 归属需求；准入判定与对账的键 | 无 |
| `ref` | `string` | 是 | 在途引用（挂起路径 = ticket） | 无 |
| `kind` | `'confirm' \| 'gate'` | 是 | 诊断用来源标记 | 无 |
| `reason` | 枚举 | 是（exit） | 出口：作答 / 看板 / 取消 / 过期 / 降级 | 无 |

**返回值说明**：三个函数均无返回值（`void`）；**永不抛**（内部自吞并告警），
因为调用点位于弹框投递与事件回调路径上，抛错会污染宿主事件循环。

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| （无） | 台账写失败 | `alert` 告警 + `logger.warn`，**不改写**在途表（拦截优先于台账美观） |
| （无） | `exit` 遇未知 ref | 零动作（幂等），可选 debug 日志 |

**使用示例**：

```typescript
enterAwaitingConfirm(deps, { requirementId, windowKey, ref: ticket, kind: 'confirm', question })
try { answers = await ask } finally { exitAwaitingConfirm(deps, { requirementId, ref: ticket, reason }) }
```

## 在途登记端口：DialogInFlightPort `serves: FR-1, FR-3`

`PendingConfirmRegistry` 新增实现（与既有 ticket 表同实例）：

```typescript
export interface DialogInFlightPort {
  enter(input: { ref: string; windowKey: string; requirementId: string; kind: 'confirm' | 'gate'; suspend: boolean }): void
  exit(ref: string): void
  /** 该需求是否有未解除的在途弹框（同步） */
  inFlightFor(requirementId: string): boolean
  /** 诊断/对账用快照 */
  list(): readonly { ref: string; requirementId: string; kind: string; since: number }[]
}
```

**契约**：`enter` 幂等（同 ref 重复登记不叠加）；`exit` 幂等；`inFlightFor` **同步**返回
（这是"同拍也拦得住"的全部依据，实现中不得引入 await 或 IO）。

## 既有端口的判定扩展 `serves: FR-1, FR-4, FR-5`

### DiveRoundPorts 新增 `dialogInFlight` `serves: FR-1`

```typescript
export interface DiveRoundPorts {
  // …既有字段不变
  /** 在途弹框判据（注入而非 import：application/dive 不反向依赖 adapters） */
  dialogInFlight?(requirementId: string): boolean
}
```

**行为**：`drive()` 在 `checkpoint()` 之后、`createRoundMessage(...)` 之前调用一次；
为真 → 直接 return（**不** `disarm`、**不**写健康位：这是"正常的等人"，不是故障）。
未注入（缺省）→ 行为与改动前逐字一致（向后兼容，既有测试不受影响）。

### AdvanceChain 新增停因 `serves: FR-1`

```typescript
// 既有：stopped = 'not_autorun' | 'no_ready' | 'stagnation' | …
// 新增：
stopped = 'awaiting-confirm'   // 有待作答弹框：本轮不派卡，不置 autoRun=false
```

**语义**：判据位于单飞锁内、`autoRun` 判定之后；命中即结束本轮，**不改** `autoRun`、
**不**计 `noopStreak`（等人不是停滞，不得触发熔断）。

### GatePromptPort.prompt 时序 `serves: FR-5`

| 步骤 | 修前 | 修后 |
|---|---|---|
| 1 | 直接 `questions.ask` | 先 `enterAwaitingConfirm(kind='gate')`，**再** `questions.ask` |
| 2 | 作答 → `applyConfirmDecision` | 作答 → `applyConfirmDecision` → `exit(reason='answered')` |
| 3 | 通道不可用 → 降级返回 | 通道不可用 → 降级返回，**不 enter**（INV-4） |
| 4 | 抛错 → 吞掉降级 | 抛错 → 吞掉降级 + `exit(reason='degraded')`（不留残影） |

### recoverHealth 新增依赖 `serves: FR-4`

```typescript
export interface RearmDeps {
  repo: ReqboardRepository
  now: () => number
  /** 在途时不越权（缺省 undefined = 既有行为不变） */
  dialogInFlight?: (requirementId: string) => boolean
}
```

**行为**：`dialogInFlight(id) === true` → 立即返回 `false`、**零写入**；调用方（看板「继续」路由）
据此在 `advanceNote` 里如实说明"仍在等待人工确认，未解除等待"。

### wake-heartbeat 新增对账趟 `serves: FR-4`

```typescript
export interface WakeTickResult {
  woken: string[]; failed: string[]; paused: string[]; skipped: string[]
  /** 新增：因"停手位残留但已无在途弹框"被恢复的 */
  resumed: string[]
}
```

**顺序**：对账趟**先于**既有唤醒趟执行（先清残影，再叫醒）。
判据：`isAwaitingConfirmStop(req)` 且 `dialogInFlightFor(req.id) === false` → 清停手位 + 留痕。

## 错误与降级语义 `serves: FR-3, FR-5`

| 情形 | 语义 |
|---|---|
| 弹框通道不可用（`REQBOARD_NO_UI` / fallback=board） | **不登记**（没有人在作答）；恢复由看板通道完成 |
| 用户在弹框取消（`ASK_CANCELLED`） | `exit(reason='canceled')` → 恢复；不产生下游产物（既有语义不变） |
| 等待被中止（`ASK_ABORTED`） | 既有的 `markInterrupted(ticket)` 保留（守卫继续拦）；`exit(reason='degraded')` 让自动链**不停着等人** |
| 台账写失败 | 在途表照常生效（拦截优先）；告警 + 日志（失败要响亮） |

## 对外契约零变更 `serves: FR-5`

- 工具参数与返回体：`reqboard_submit` / `reqboard_ask_confirm` / `reqboard_accept_sheet` / `reqboard_status` 全部**逐字不变**；
- 输出契约门禁（`tests/output-contract.test.ts`）新增字段为零，不触碰该用例的逐键对账；
- 看板/HTTP：不新增端点、不新增字段；`POST /req/autorun` 仅 `advanceNote` 文案可能多一句解释。
