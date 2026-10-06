# 接口设计（REQ-261005213603-eaed）

> 每个接口标注 `serves: FR-x`。本次**无对外接口变更**（无 HTTP / 工具 / 事件），
> 变的是客户端内部函数契约与一处**读侧**摘要键约定。

## 判据函数：`requirementRunInFlight` `serves: FR-1, FR-2`

**用途**：判断「该需求此刻有没有一个后台 run 在跑」（host 推进锁未过期）。

**调用方**：`requirementRunningMark`（同模块）；单测直调。

**接口定义**：

```typescript
/** 只用到摘要里这一个键（便于测试注入假对象）。 */
export interface RequirementRunShape {
  /** host 推进锁持有时刻（ms）；缺省 = 没有 run 在跑。 */
  readonly advanceLockAt?: number
}

/**
 * 推进锁是否**新鲜**。任何非法输入一律 false（不抛错、不猜）。
 * @param now      当前时刻（ms）——注入以便纯函数化
 * @param staleMs  过期阈值；缺省 = LIMITS.advanceLockStaleMs（15min）
 */
export function requirementRunInFlight(
  req: RequirementRunShape,
  now: number,
  staleMs?: number,
): boolean
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `req` | `RequirementRunShape` | 是 | 需求摘要（或整条记录，结构子类型） | — |
| `now` | `number` | 是 | 当前时刻（ms）；调用方传 `Date.now()` | — |
| `staleMs` | `number` | 否 | 过期阈值 | `LIMITS.advanceLockStaleMs` |

**返回值说明**：

| 条件 | 返回 |
|---|---|
| `advanceLockAt` 是有限数且 `now - advanceLockAt < staleMs` | `true` |
| 键缺失 / 非 number / `NaN` / `Infinity` / 恰好等于阈值 / 已过期 | `false` |
| `advanceLockAt` 在未来（`now - lock < 0`） | `true`（与 host `AdvanceChain.ts:747` 同一表达式） |

**异常情况**：无。纯函数，任何输入都不抛（含 `req` 为 `{}` / 带 getter 抛错的畸形对象——实现用 `typeof` 与 `Number.isFinite` 守卫，不读其它字段）。

**使用示例**：

```typescript
requirementRunInFlight({ advanceLockAt: now - 60_000 }, now)         // true
requirementRunInFlight({}, now)                                      // false
requirementRunInFlight({ advanceLockAt: now - 15 * 60_000 }, now)    // false（恰好 stale）
```

## 判据函数：`requirementRunningMark`（组合入口） `serves: FR-1, FR-3`

**用途**：把「会话回合」与「新鲜推进锁」两条判据收敛成一个可渲染的 mark —— **全仓唯一的在跑映射点**。

**调用方**：`src/client/views/board.ts`（泳道卡、列表行两处）。

**接口定义**：

```typescript
export type RunningCause = 'session' | 'run'

/** 在跑标记：只有一个字段——成因，供渲染层决定 title/aria。 */
export interface RunningMark {
  readonly cause: RunningCause
}

export function requirementRunningMark(
  req: RequirementSessionShape & RequirementRunShape,   // 席位 / sourceSessionId / advanceLockAt
  isRunning: (sid: string) => boolean,                  // 注入的会话运行态读数（既有）
  now: number,
  staleMs?: number,
): RunningMark | undefined
```

**返回值说明**：

| 条件 | 返回 |
|---|---|
| `requirementRunning(req, isRunning)` 为真 | `{ cause: 'session' }`（**优先**，即使锁也新鲜） |
| 仅锁新鲜 | `{ cause: 'run' }` |
| 都不成立 | `undefined`（**不返回空对象**：缺失即无指示） |

**异常情况**：无（内部只调两个不抛的纯函数）。

**使用示例**：

```typescript
const mark = requirementRunningMark(req, sid => running.has(sid), Date.now())
// mark === { cause: 'run' } —— 后台跑子卡链期间
```

## 判据函数：`requirementBusy`（布尔便捷入口） `serves: FR-1`

**用途**：给需要布尔值的调用方/测试一个入口；**实现即 `requirementRunningMark(...) !== undefined`**（薄包装，不构成第二份判据）。

```typescript
export function requirementBusy(
  req: RequirementSessionShape & RequirementRunShape,
  isRunning: (sid: string) => boolean,
  now: number,
  staleMs?: number,
): boolean
```

**异常情况**：无。（`requirementRunning` 保持原签名与语义不变，继续作为「会话回合」单判据导出。）

## 渲染单点：`renderRunningDot` `serves: FR-3`

**用途**：把 mark 渲染成转圈元素；**仍然是唯一的运行圈渲染点**（泳道卡与列表行共用）。

**调用方**：`src/client/views/artifacts.ts`（泳道卡）、`src/client/views/board.ts`（列表行）。

**接口定义**：

```typescript
export function renderRunningDot(mark?: RunningMark): string
```

**输出契约（逐字，测试可直接断言）**：

| 入参 | 输出 |
|---|---|
| `undefined` | `''`（**不渲染空壳**——这是「省略参数时输出与改动前逐字节一致」的前提） |
| `{ cause: 'session' }` | 既有形状：`<span class="dsh-pm-running" data-running="true" role="img" aria-label="会话进行中" title="会话进行中（该需求绑定窗口正在执行回合）">…svg…</span>` |
| `{ cause: 'run' }` | 同形状同 class；`aria-label="后台 run 进行中"`、`title="后台 run 进行中（子卡链在执行，窗口可以已空闲）"` |

**不变项（硬约束）**：class `dsh-pm-running` / 属性 `data-running="true"` / SVG 结构 / 尺寸 / 位置（紧跟 REQ id）；
`prefers-reduced-motion` 降级对两种成因一致。

**异常情况**：无（`mark === undefined` 走空串分支）。

## 卡片渲染入参：`renderReqCard` 第 4 参 `serves: FR-3`

```typescript
// 旧：export function renderReqCard(card, now, archived, running = false)
// 新：
export function renderReqCard(
  card: ReqCard,
  now: number,
  archived?: ReadonlySet<string>,
  mark?: RunningMark,
): string
```

- 唯一调用点：`src/client/views/board.ts:126`（改为传 `requirementRunningMark(...)`）；
- `tests/token-card.test.ts` 用 2 参调用 → 不受影响（`mark` 缺省 = 无指示）；
- **不保留布尔参数**：布尔 + 成因两个并行参数会表达出 `running=false && cause='run'` 这种非法态。

## 列表行：`renderListCard` / `buildListView`（签名不变，语义扩展） `serves: FR-1, FR-4`

```typescript
export function renderListCard(
  card: ReqCard,
  now: number,                                   // 由 _now 变为实际使用（判据要它）
  archived?: ReadonlySet<string>,
  running?: ReadonlySet<string>,                 // 仍在跑的**会话 id 集合**（签名不变）
): string
```

- 内部：`renderRunningDot(requirementRunningMark(req, sid => running.has(sid), now))`；
- `buildBoard` / `buildListView` 的第 5/4 参签名与语义**一字不动**（既有测试 TC-08～TC-10 靠它成立）。

## 读侧载荷契约：`GET /dashboard/api/reqboard/state` 的 `advanceLockAt` `serves: FR-2, FR-5`

**host 侧零改动**——本契约只声明客户端**依赖**的既有事实：

```typescript
// 响应 data.requirements[i]（RequirementSummary 投影）
{
  id: string
  status: RequirementStatus
  sourceSessionId?: string
  seats?: WindowSeat[]
  advanceLockAt?: number    // ← 本次唯一依赖的新键；缺省 = 无 run 在跑
  // …其余摘要字段
}
```

| 事实 | 说明 | 出处 |
|---|---|---|
| 键名 | `advanceLockAt`（扁平；不是 `advance.lockAt`） | `RequirementSummary.ts:236` |
| 语义 | host 推进锁持有时刻（ms），run 在跑期间每 30s 刷新 | `AdvanceChain.ts:445` |
| 缺失语义 | **缺失 = 不在跑**（不是 0、不是未知） | 与「缺失 ≠ 0」同纪律 |
| 有界性 | 单个时间戳标量，不违反「摘要不带无界字段」 | `SUMMARY_KEYS` 已列该键 |
| 版本兼容 | 旧服务端不发该键 → 客户端判不在跑 → 与改动前逐字节一致 | FR-5 验收 1 |

**客户端的对应声明**（`src/client/types.ts`）：

```typescript
// RequirementRecord 内新增
advanceLockAt?: number
```

**异常情况**：

| 情形 | 行为 |
|---|---|
| 键缺失 / `null` / 非数 | 判不在跑（`requirementRunInFlight` 返回 false） |
| 服务端整体不可达 | 走既有 `fetchAll` 错误路径（本次不新增错误面） |
| SSE 断流 | 20s 轮询兜底，最迟 20s 后收敛 |

## 错误语义总表 `serves: FR-5`

| 函数 | 会抛错吗 | 非法输入行为 |
|---|---|---|
| `requirementRunInFlight` | 否 | 返回 `false` |
| `requirementRunningMark` | 否 | 返回 `undefined` |
| `requirementBusy` | 否 | 返回 `false` |
| `renderRunningDot` | 否 | `undefined` → `''` |
| `renderReqCard` / `renderListCard` | 否（沿用既有纪律） | `mark` 缺省 → 无指示 |

**红线**：判据不可得的呈现是**没有指示**，不是灰点、不是「未知」、不是 `cause: 'unknown'`（新增枚举值即违约）。

## 不新增的接口（红线） `serves: FR-1, FR-6`

| 不新增 | 原因 |
|---|---|
| host HTTP 接口（如 `/running`） | host 已把唯一凭据写进 `/state` 摘要 |
| 台账字段 / schema | 推进锁已在台账（复用既有 `advance.lockAt`） |
| 新 SSE 通道 / 事件类型 | 复用既有 revision 帧与轮询 |
| 新工具 / 客户端服务注入 | 判据是纯函数，零外部依赖 |
