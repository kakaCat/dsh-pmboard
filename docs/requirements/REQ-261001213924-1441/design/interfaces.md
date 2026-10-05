# REQ-261001213924-1441 接口设计 · 状态契约、订阅装配与对账端口 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 本设计不新增对外工具、不改 HTTP 返回形状；下面是插件内部契约与台账字段契约。

## DiveState 数据契约（改） serves: FR-1, FR-5

```ts
interface DiveState {
  /** 人的意图：只有人能改（立项=armed；reqboard_clear_pause=disarmed）。运行时故障不得改写。 */
  activation: armed | disarmed
  /** 运行时健康：只有驱动侧能改。 */
  driverHealth?: {
    state: healthy | paused
    /** 结构化前缀便于看板与人读：round-limit:<stage> / wake-undeliverable / checkpoint-failed / queue-failed / driver-failed / agent-error / aborted / max-tokens / prompt-rejected */
    reason?: string
    /** 进入当前 health 的时间戳 */
    since?: number
    /** 连续唤醒失败次数（成功即归零；≥3 进 paused） */
    attempts?: number
  }
  /** 本阶段已准入回合数（FR-1：阶段推进时归零，不再是生命周期计数） */
  roundsInStage: number
  /** 最近一次成功唤醒（投递成功或准入成功）的时间戳（FR-4 心跳判据） */
  lastWakeAt?: number
  /** 兼容字段（读侧一版）：由 activation + driverHealth 推导 */
  phase?: active | idle | paused
}
```

| 字段 | 唯一写点 | 约束 |
|------|----------|------|
| activation | createRequirementDirect（armed）、ClearPause（disarmed） | **运行时模块不得写它**（用测试锁死） |
| driverHealth | round-driver 的准入/失败/上限分支、wake-reconciler | 失败只写这里，不改 activation |
| roundsInStage | transitionRequirement（跨阶段归零）、round-driver 准入（=round） | 只数**当前阶段** |
| lastWakeAt | 投递成功 / 准入成功 | 心跳判据 |

## 判定函数（改） serves: FR-1, FR-2

```ts
/** 可起轮：人的意图为 armed，且运行时健康（不再要求 phase） */
export function isDrivableRequirement(req: RequirementRecord | undefined): boolean
// 修后：activation === armed 且 (driverHealth?.state ?? healthy) !== paused

/** 误停摆判别（恢复入口用；状态收敛后只服务存量数据） */
export function isRecoverableDisarm(req: RequirementRecord | undefined): boolean

/** 恢复运行时健康（人一动即调用）：清 paused、attempts 归零、留痕 */
export async function recoverHealth(deps: RearmDeps, requirementId: string, trigger: RecoverTrigger): Promise<boolean>
```

## 回合计数归零（改） serves: FR-1

```ts
// src/application/internal/token-usage.ts → transitionRequirement(r, to, ctx)
if (from !== to) {
  r.dive.roundsInStage = 0
  if (r.dive.driverHealth !== undefined) r.dive.driverHealth.attempts = 0
}
```

| 项 | 契约 |
|----|------|
| 触发 | 仅当 status 真的变化（from !== to）；同阶段内不归零 |
| 幂等 | 同一转换重复调用结果一致 |
| 不变量 | roundsInStage 永远小于等于"当前阶段的 maxRounds"（上限判定因此才有意义） |

## 上限处置（改） serves: FR-2

```ts
function terminalBlock(req: RequirementRecord, limit: number): void
// 修前：r.dive.phase = paused（终态，只能 clear_pause 解锁）
// 修后：r.dive.driverHealth = { state: paused, reason: round-limit:<stage>, since: now }
//       activation 不变；comment 文案给出恢复路径（人确认推进 / 看板继续 / 阶段切换）
```

## 订阅装配（改） serves: FR-3

```ts
export interface AgentSubscriptionPorts {
  /** 插件 ctx：订阅 agent/created 与 reqboard/requirement-moved */
  rootOn?: (event: string, listener: (...a: unknown[]) => unknown) => (() => void) | void
  /** 由 agent 句柄取它自己的 ctx（agent.ctx；拿不到 → 响亮失败，不静默） */
  agentCtxOf?: (agent: unknown) => { on?: (event: string, listener: (...a: unknown[]) => unknown) => (() => void) | void } | undefined
}
type AgentDisposers = Map<string, () => void>   // agentId → 合并注销函数
```

| 契约 | 说明 |
|------|------|
| 注册位置 | agent.ctx（不是插件 ctx）——**归属理由**：agent 处置即注销；卸载插件不会自动移除 agent.ctx 上的注册（宿主规范 practices.md:19） |
| 注册内容 | `agent/status`、`agent/pre-step`、`agent/inbox/inserted`、`agent/inbox/claimed`、`agent/inbox/discarded`、`agent/error`、`agent/disposed` |
| 注销 | agent/disposed 与插件卸载各一次，幂等 |
| 失败语义 | 拿不到 agent.ctx → logger.warn + captureDiag("[dive-diag] agent 订阅未成立 …") + 台账 comment |

## 心跳对账端口（新增） serves: FR-4

```ts
export interface WakeReconcilerDeps {
  snapshot(): ReqboardLedger
  repo: ReqboardRepository
  now(): number
  deliver: DiveRoundDeliveryPort     // 复用既有投递端口（createRoundMessage + deliverMessage）
  agents: { get(id: string): unknown | undefined }
  intervalMs?: number                // 默认 30000
  staleMs?: number                   // 默认 120000
  maxAttempts?: number               // 默认 3
  logger: { info(m: string): void; warn(m: string, e?: unknown): void }
}
export function createWakeReconciler(deps: WakeReconcilerDeps): {
  start(): () => void;               // 返回停止函数（unref 定时器）
  tick(): Promise<ReconcileSummary>; // 单次扫描（可测、可被验收命令直接驱动）
}
export interface ReconcileSummary { scanned: number; woken: string[]; failed: string[]; paused: string[] }
```

## turn/end 解析（改） serves: FR-6

```ts
export function turnEndOutcome(data: unknown): TurnEndOutcome | undefined   // 既有，扩展为唯一入口
// round-driver 改为：const outcome = turnEndOutcome(evt.data)
//   按 outcome.abnormal / outcome.reason（completed|max-tokens|blocked|interrupted|aborted:<cause>|error:<code>:<msg>）分支
// 删除 round-driver 内的 data.reason?.kind 窄读
```

| 契约 | 说明 |
|------|------|
| 唯一性 | 全仓只有 turnEndOutcome 解析 turn/end；新增读取者必须复用它（用测试锁死） |
| 容错 | 未知形状返回 undefined（调用方按"判不出"处理，不猜） |

## 诊断接口（扩展使用面） serves: FR-4

```ts
export function captureDiag(message: string): void   // 既有，落 ~/.dsh/state/reqboard-capture-diag.log
// 新增调用点（统一前缀 [dive-diag]，便于 grep 定位）：
//   [dive-diag] agent/created agent=<id>
//   [dive-diag] agent.ctx 订阅结果 ok=<n> failed=<n> agent=<id>
//   [dive-diag] agent/status status=<idle|running> agent=<id>
//   [dive-diag] requirement-moved id=<REQ> agent=<found|missing> health=<..> rounds=<n>
//   [dive-diag] drive early id=<REQ> reason=<not-drivable|ready-false|round-limit|no-agent>
//   [dive-diag] drive deliver id=<REQ> delivered=<bool> reason=<..> round=<n>
//   [dive-diag] reconcile tick scanned=<n> woken=<n> failed=<n>
```

## 端到端断言（新增，这条链唯一的 CI 门禁） serves: FR-7

```ts
// tests/dive-wake-e2e.test.ts
// 真实 createCaptureRuntime（真 AgentDeliverer）+ 真 createDiveRoundDriver + 假 agent（带 followup）；
// 断言：触发一次 requirement-moved ⇒ inbox 收到 1 条 source.kind=dive 消息
//      且 roundsInStage=1、lastWakeAt 已更新、driverHealth.attempts=0
```

## 兼容性 serves: FR-5

- **对外零破坏**：不新增工具、不改工具入参出参、不改 HTTP 返回形状。
- **读侧兼容一版**：无 driverHealth 的旧记录按 phase 推导（idle → 人的意图为 disarmed；paused → paused）；迁移完成后该分支只服务存量。
- **回滚**：还原新增字段与订阅方式即可；台账新增字段对旧代码无害（多余字段被忽略）。
