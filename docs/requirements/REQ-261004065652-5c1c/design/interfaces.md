---
req_id: REQ-261004065652-5c1c
serves: FR-1, FR-2, FR-3, FR-5, FR-7, FR-8, FR-10, FR-11
---

# 接口设计（REQ-261004065652-5c1c）

> 对外工具契约**零破坏**：不新增工具、不新增错误码、不改任何入参 schema、不改回执字段集合。
> 本次新增的全部是对内接口（application 层纯函数 + 注入端口）；对外只变**行为**（何时停手）。

## 新增的内部接口 `serves: FR-1, FR-2, FR-3, FR-5, FR-11`

### classifyTurnEnd `serves: FR-1, FR-2`

**用途**：把宿主 `turn/end` 的原始形态归一成"病因类别"，供熔断/闩/留痕共用**同一个口径**。

**调用方**：`round-driver.onSessionEvent`、`session-driver` 的 turn/end 分支、`stampInterruption`。

**接口定义**：
```typescript
type FailureKind = 'fatal' | 'transient' | 'abort' | 'normal' | 'unknown'

interface TurnEndClassification {
  kind: FailureKind
  /** 归一后的病因类别（进熔断计数与留痕去重键）：'error:AUTH' / 'error:TRANSPORT' / 'aborted:user' … */
  reasonClass: string
  /** 从原始 reason 截出的可读原因（≤200 字符，进 comment） */
  reasonText: string
}

function classifyTurnEnd(data: unknown): TurnEndClassification
```

**判定顺序（顺序敏感，写成用例锁死）**：

| # | 输入 | kind | reasonClass |
|---|---|---|---|
| 1 | `reason.kind==='aborted'` | `abort` | `aborted:<cause.kind \| unknown>` |
| 2 | `reason.kind==='error'` ∧ (`code==='AUTH'` ∨ message 命中 `/permission_error\|usage limit\|quota\|unauthorized\|403/i`) | `fatal` | `error:AUTH` |
| 3 | `reason.kind==='error'` 其它 | `transient` | `error:<code \| UNKNOWN>` |
| 4 | `completed` / `max-tokens` / `blocked` | `normal` | 同名 |
| 5 | 形态不认识 | `unknown` | `unknown`（**不猜、不写、不动**） |

**错误语义**：本函数**永不抛**（输入任意 JSON 值都有返回值）；`unknown` 的语义是"什么都不做"。

### createProviderLatch `serves: FR-1`

**用途**：进程级"上游不可用"闩——一个窗口撞上致命错误，所有窗口一起停。

**接口定义**：
```typescript
interface ProviderLatch {
  /** 置闩（幂等；重复置闩只更新 until） */
  trip(input: { reasonClass: string; requirementId?: string; ttlMs?: number }): void
  /** 是否仍在闩内（用注入的 now()） */
  isOpen(): boolean
  /** 闩的失效时刻（未置闩 = undefined） */
  until(): number | undefined
  /** 人显式清闩（看板「继续」/确认推进）——必须带 actor，写留痕 */
  clear(input: { by: 'human' | 'system'; reason?: string }): void
}

function createProviderLatch(deps: { now: () => number; defaultTtlMs?: number }): ProviderLatch
```

**契约**：
- `trip` 幂等、`isOpen()` 是纯读（不写盘、不 await）；
- 缺省 TTL **5 小时**（provider 额度窗口口径）；
- `clear` 只由人通道或系统"额度恢复"调用；**自动路径不得 clear**（否则又变成自旋）。

### humanGateOf `serves: FR-5`

**用途**：回答"这条需求现在是不是在等人"（等人 ≠ 故障 → 不写健康位）。

**接口定义**：
```typescript
interface HumanGate { open: boolean; reason?: 'acceptance-pending' | 'artifact-unconfirmed' | 'plan-unapproved' }

function humanGateOf(req: RequirementRecord): HumanGate
```

**边界**：纯函数、零 I/O（只读入参记录）；`dialogInFlight`（弹框在途）仍走注入端口，
两者**并存**（弹框在途是内存态，人工门是台账态）。

### checkChainBudget `serves: FR-11`

**用途**：起新链前的预算闸（WIP + token），拒绝理由可读。

**接口定义**：
```typescript
interface ChainBudgetLimits {
  maxInFlightChains: number         // 缺省 3
  maxCacheReadTokens: number        // 缺省 5e8
}

interface ChainBudgetVerdict {
  allowed: boolean
  reason?: 'wip-limit' | 'token-budget'
  detail?: { name: string; current: number; limit: number }
}

function checkChainBudget(input: {
  facts: readonly RequirementFacts[]
  candidateId: string
  limits: ChainBudgetLimits
}): ChainBudgetVerdict
```

**契约**：纯函数；只算 `armed ∧ autoRun ∧ implementing` 的链数与 `tokenUsage.totals.cacheReadTokens` 之和；
**不杀**已在跑的链（只回答"要不要起新的"）。

### DiveRoundPorts 扩四个注入端口 `serves: FR-1, FR-3, FR-5, FR-11`

```typescript
interface DiveRoundPorts {
  // …既有端口不动
  /** 进程级上游闩（缺省 undefined = 不启用，行为与改动前逐字一致） */
  providerLatch?: ProviderLatch
  /** 人工门判据（缺省 undefined = 恒闭 → 行为不变） */
  humanGate?: (requirementId: string) => HumanGate
  /** 预算判据（缺省 undefined = 不启用） */
  chainBudget?: (candidateId: string) => ChainBudgetVerdict
  /** 人恢复时释放内存闭锁（组合根在看板「继续」/确认推进后调用） */
  releaseLatch?: (requirementId: string) => void   // 由 driver 自身提供，非外部注入
}
```

**缺省即旧行为**：四个端口全部可选，未装配时逐字保持现状——这是"可灰度、可回滚"的落点。

## 既有对外接口的行为变更（schema 不变） `serves: FR-7, FR-8, FR-10`

### reqboard_ask_confirm：缺省阻塞 → 缺省有界宽限 `serves: FR-7`

| 面 | 改动 |
|---|---|
| 入参 schema | **不变**（`inline_grace_ms` 仍是唯一的显式覆盖入口） |
| 缺省行为 | 装了 `pendingConfirms` 时：阻塞至 `confirmDefaultGraceMs`（缺省 600000ms）→ 返回 `pending=true + ticket` |
| 未装 `pendingConfirms` | **不变**：全阻塞（不制造假非阻塞） |
| 回执形状 | **不变**：复用既有 `pending/ticket` 非阻塞返回体 |
| 取回执 | `reqboard_confirm_receipt(ticket)` 不变 |

### 实施链回执：引擎不可达的文本强化 `serves: FR-10`

| 面 | 改动 |
|---|---|
| 回执字段 | **不变**（`stopped` / `reason` 等键不动） |
| `reason` 文本 | 追加一句"**本次未落任何子卡**" + 既有两条出路指引（人可行动） |
| 幂等 | 同需求重复推进：最近一条 `ENGINE_UNREACHABLE` 已在案 → 短路零写入 |

### 断点留痕：去重与限流 `serves: FR-8`

| 面 | 改动 |
|---|---|
| `stampInterruption(req, now, reason, tool)` 签名 | **不变**（内部改去重键与截断） |
| 去重键 | `reason` 原文 → `reasonClass + status + pendingAction` |
| 限流 | 同类且 `now - prev.at < 10min` → 不写 |
| comment 正文 | reason 截断到 200 字符 |

## 错误码与不变量 `serves: FR-1, FR-3, FR-10`

**不新增错误码。** 既有码语义不动（`REQBOARD_CONFIRM_PENDING` / `REQBOARD_SUBTASK_GATE` /
`LIMITS.advanceLockStaleMs` 等）。新增行为用**留痕**表达，不用新码：

| 不变量 | 判据（可测） |
|---|---|
| 闭锁优先于一切 | `latch` 存在时 `readyToDrive()===false`，与台账内容无关 |
| 闩不自动清 | 除"人 clear"与"TTL 过期"外无第三条路径 |
| 缺省即旧行为 | 四个新端口全不装配时，既有 8 个测试文件结果逐字不变 |
| 起轮前四查 | `drive()` 里 latch → 人工门 → 闩 → 预算，四查全在构造 attempt **之前** |
