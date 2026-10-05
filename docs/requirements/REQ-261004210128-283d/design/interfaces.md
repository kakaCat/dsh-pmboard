---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 接口设计：看板会话运行中指示（REQ-261004210128-283d） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 本需求**不新增任何 HTTP / Agent 工具接口**。变更面全部在客户端（浏览器 bundle）内部接口。
> 所有新增参数一律**带默认值**，旧调用点逐字不变（可编译、可跑既有断言）。

## 新增模块：`src/client/session-running.ts` `serves: FR-1, FR-6`

```ts
/** 会话列表投影（会话控制器客户端服务的形状；鸭子探测，不 import DSH 类型以免版本耦合）。 */
export interface SessionsListFace {
  getSnapshot(): { byId?: Record<string, { running?: unknown } | undefined> } | undefined
  subscribe?(fn: () => void): () => void
}
export interface SessionsFace { list?: SessionsListFace }

/** 空集合常量：所有「没有在跑的会话」路径共用同一实例（便于集合比较与测试断言）。 */
export const NO_RUNNING: ReadonlySet<string>

/** 单会话是否正在执行回合。sid 空串 / undefined、服务缺失、行缺失、字段非 true → false（不抛）。 */
export function isSessionRunning(sid: string | undefined, access?: SessionRunningAccess): boolean

/** 当前全部在跑的会话 id 集合。服务不可得 → NO_RUNNING（空集）。 */
export function runningSessionIds(access?: SessionRunningAccess): ReadonlySet<string>

/** 订阅会话运行态变化；返回**幂等**退订函数。服务/订阅能力缺失 → 返回 no-op 退订（调用方无需分支）。 */
export function subscribeSessionRunning(fn: () => void, access?: SessionRunningAccess): () => void
```

- **参数**：`access` 缺省 = `windowServiceAccess()`（复用 `session-jump.ts` 的既有惰性投影）；测试注入假投影。
- **返回**：见上；无 `undefined` 泄漏给调用方（集合恒为 `ReadonlySet<string>`）。
- **错误语义**：**本模块不抛错、不打 `console.error`**。能力不可得是降级（返回空集 / no-op 退订），
  不是失败——「失败要响亮」针对的是业务失败，而非「旧客户端没有这个能力」（与 `archivedSessionIds()` 同款纪律）。

## 新增渲染单点：`renderRunningDot` `serves: FR-3, FR-7`

```ts
/** 落位：src/client/render/dom-utils.ts（与 sessionChipHtml 同层，纯字符串、零 IO）。 */
export function renderRunningDot(running: boolean): string
```

- `running === false` → 返回 `''`（**不渲染空壳**，卡面 DOM 与改动前逐字节一致）。
- `running === true` → 返回内联 SVG 转圈环，形如：

```html
<span class="dsh-pm-running" data-running="true" role="img" aria-label="会话进行中"
      title="会话进行中（该需求绑定窗口正在执行回合）">…svg…</span>
```

- **错误语义**：无。纯函数，输入布尔，输出字符串。

## 需求 → 会话映射：`requirementRunning` `serves: FR-2, FR-6`

```ts
/**
 * 落位：src/client/session-running.ts（与判定同模块，保证只有一处口径）。
 * 席位权威：seats 有值 → 只认 seats；缺省 → 折算单 owner sourceSessionId；两者皆无 → false。
 */
export function requirementRunning(
  req: Pick<ClientRequirementSeatShape, 'seats' | 'sourceSessionId'>,
  isRunning: (sid: string) => boolean,
): boolean
```

- **为什么注入 `isRunning`**：纯函数化，单测不需要假服务，也不产生第二次读取。
- **口径来源**：与 host `seatsOf()` 的折算规则一致（`seats` 权威；缺省折算 owner）。
- **不做**：不把 `tasks[].executions[].sessionId` 纳入判据（见 `architecture.md` 边界 4）。

## 修改：`buildBoard` / `renderReqCard` / `renderListCard` `serves: FR-3, FR-4, FR-8`

```ts
// src/client/views/board.ts
export function buildBoard(
  state: BoardState, now?: number, view?: BoardViewKind,
  listOpts?: ListViewOpts, archived?: ReadonlySet<string>,
  running?: ReadonlySet<string>,            // 新增，缺省 NO_RUNNING
): string

export function renderListCard(
  card: ReqCard, now: number,
  archived?: ReadonlySet<string>,
  running?: ReadonlySet<string>,            // 新增，缺省 NO_RUNNING
): string

// src/client/views/artifacts.ts
export function renderReqCard(
  card: ReqCard, now: number,
  archived?: ReadonlySet<string>,
  running?: ReadonlySet<string>,            // 新增，缺省 NO_RUNNING
): string
```

- 传参形态：渲染层只接收**布尔**（由调用方用 `requirementRunning(card.req, …)` 算好），
  避免两个视图各自散落映射逻辑（INV-2）。
- 兼容：省略第 5/6 个参数 = 今天的行为；`tests/client-view.test.ts` 既有断言不需改判据。

## 修改：`createBoardAttachment` 的订阅接线 `serves: FR-5, FR-8`

```ts
// src/client/board-mount.ts（内部实现，无导出签名变化）
let unsubRunning: (() => void) | undefined          // 与 unsubEvents / pollTimer 并列
let lastRunning: ReadonlySet<string> = NO_RUNNING   // 上一次渲染用过的集合（重绘门控的比对基准）
```

行为契约：

1. 挂载：`unsubRunning = subscribeSessionRunning(() => { if (runningSetChanged()) scheduleRender() })`。
2. `runningSetChanged()`：计算「当前 state 中需求的相关会话集合」∩ `runningSessionIds()`，
   与 `lastRunning` 做集合相等比较（元素个数 + 逐个 `has`），相等返回 `false`。
3. 每次 `render()` 成功后把 `lastRunning` 更新为当次所用集合。
4. `dispose()`：`unsubRunning?.()` 并置 `undefined`；退订后任何通知不得触发 `render()`。

**错误语义**：订阅回调内部**不抛**（服务投影已内部 try/catch）；任何异常都不得让看板整块变错误页。

## 修改：客户端类型补 `seats` 声明 `serves: FR-2`

```ts
// src/client/types.ts —— 客户端半不 import host 模块，故本地声明最小形状（与既有做法一致）
export interface ClientWindowSeat {
  windowKey: string
  role: 'owner' | 'worker' | 'observer'
  joinedAt: number
}

export interface RequirementSummary { /* 既有字段 */ seats?: ClientWindowSeat[] }
export interface RequirementRecord  { /* 既有字段 */ seats?: ClientWindowSeat[] }
```

- **只补类型声明**：服务端 `/state` 早已在摘要里原样下发 `seats`（`summarize()` 有则带），本次**不改服务端**。
- 缺省（旧服务端不下发）→ 走 `sourceSessionId` 折算，行为不变。

## 不新增的接口（红线） `serves: FR-6`

| 类别 | 结论 |
|------|------|
| HTTP 路由 | 零新增（`/dashboard/api/reqboard/*` 一律不动） |
| Agent 工具 | 零新增（不新增任何 `reqboard_*`；看板运行态是纯展示） |
| SSE 帧 | 零新增（复用官方 `api-session/status` 客户端通路，不自造推送） |
| 台账字段 | 零新增（运行态不落盘） |

## 错误语义总表 `serves: FR-6, FR-8`

| 情形 | 返回/行为 | 是否可见报错 |
|------|-----------|--------------|
| `sessions` 服务未注入 | `isSessionRunning → false`；`subscribe → no-op` | 否（降级，不噪音） |
| `list.getSnapshot()` 抛错 | 捕获 → 空集 | 否 |
| `byId[sid]` 缺失 | `false` | 否 |
| `running` 字段非布尔 | `false` | 否 |
| 需求无窗口绑定 | 不渲染指示 | 否 |
| 订阅回调内异常 | 吞掉（不让看板整块变错误页） | 否 |

**唯一的可见后果**：该出现的指示没出现 / 不该出现却出现了——由 `test-cases.md` 的 TC-01～TC-10 覆盖。
