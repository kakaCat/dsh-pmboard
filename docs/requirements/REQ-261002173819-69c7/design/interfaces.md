---
serves: FR-1, FR-2, FR-3, FR-4
---

# 接口设计（端口签名 · 工具回执 · 错误码） serves: FR-1, FR-2, FR-3, FR-4

> 三个对外面（JobsPort 端口、reqboard_task_run 工具、看板 autorun 路由）与一个新内部函数。**不新增工具、不新增路由、不新增返回键**。

## JobsPort：`owner` 从 `unknown` 收紧为 `string` serves: FR-2

```ts
// src/application/ports.ts（JobStartSpec）
export interface JobStartSpec {
  kind: string
  label: string
  /**
   * Job 归属：**agent/session 的 id 字符串**（宿主 `agents.get(id)` 用它解析 live agent）。
   * 传对象会被宿主判为"无 live agent"（实测：session "[object Object]" has no live agent）；
   * 缺省 = unowned job（宿主允许，但失去 owner 作用域的取消与并发上限）。
   */
  owner?: string
  run: (signal: AbortSignal) => Promise<void>
}
```

| 变更 | 前 | 后 | 兼容性 |
|------|----|----|--------|
| `owner` 类型 | `unknown` | `string \| undefined` | 编译期收紧；唯一生产点已改（见下）；`DshJobsAdapter.start` 原样透传，零改动 |

`DshJobsAdapter.start`（`src/adapters/DshJobsAdapter.ts:138-145`）不改代码：它本来就 `owner: spec.owner` 透传。

## 新增：`dispatchOwnerOf(exec)` serves: FR-2

```ts
// src/application/internal/support.ts（新增导出）
/**
 * 后台任务 owner：宿主契约要的是 **id 字符串**，不是 agent 对象。
 * 读取顺序与 dive 的 agentIdOf 同源（agent.id → agent.session.id），
 * 后者由本函数转出，避免两处口径漂移（有用例锁死两者一致）。
 */
export function dispatchOwnerOf(exec: unknown): string | undefined
```

- 复用既有 `agentIdOf`（`src/application/dive/round-state.ts:197`，纯函数、零 IO）；`support.ts` 直接转出，不再抄第二份。
- 返回 `undefined` 是**合法值**（= unowned），调用方不得把它当失败。

### 调用点改造 serves: FR-2

```ts
// src/application/use-cases/AdvanceChain.ts:517（改造前 → 改造后）
- owner: (exec as { agent?: unknown })?.agent,
+ owner: dispatchOwnerOf(exec),          // string | undefined
```

## `advanceRequirement` 返回值（形状不变，取值 +1） serves: FR-1, FR-2

```ts
export type AdvanceStop =
  | 'rollup' | 'paused' | 'noop' | 'terminal' | 'not_autorun' | 'not_found' | 'max_steps' | 'locked'
  | 'awaiting-confirm'
  | 'dispatch_failed'        // ← 新增：后台任务投递失败（无 run 在跑）
```

| 情形 | `dispatched` | `stopped` | 附带的键 |
|------|--------------|-----------|----------|
| 投递成功 | `true` | `'noop'`（既有） | `job_id` / `run_id` |
| 投递失败（任何原因） | `false` | `'dispatch_failed'`（**不再是 `'not_found'`**） | `reason` 含 `<kind>: <原始 message>` |
| 新鲜锁挡下 | `false` | `'locked'` | `reason` 含 runId |
| 需求不存在 | `false` | `'not_found'` | `reason` |

**为什么要改 stopped 取值**：今天投递失败返回 `stopped:'not_found'`，`reqboard_task_run` 于是映射成 `REQBOARD_REQ_NOT_FOUND`（"需求不存在"，见 `AdvanceTool.ts:135`）——一个纯粹的误导。改值后自动落到兜底映射 `REQBOARD_DISPATCH_FAILED`，**不需要改工具壳**。

## 新增：`armExplicit`（人显式重新武装） serves: FR-3

```ts
// src/application/internal/rearm.ts（新增导出；recoverHealth / rearmIfRecoverable 一律不动）
export interface RearmDeps { repo: ReqboardRepository; now: () => number; dialogInFlight?: (id: string) => boolean }

/**
 * 人显式要求「继续」→ 把需求交回 Dive。只允许人工入口调用（看板「继续」），
 * 自动路径（requirement-moved / 心跳）永不调用本函数。
 * @returns 本次是否真的改了台账（幂等：已 armed 且健康 → false，零写入）
 */
export async function armExplicit(deps: RearmDeps, requirementId: string, trigger: 'board-resume'): Promise<boolean>
```

行为矩阵（mutate 内部判定，条件写在变更器里保证幂等）：

| 进入形态 | 写入 | 备注 |
|----------|------|------|
| `armed` 且 `driverHealth.state !== 'paused'` | **零写入** | 幂等（A5） |
| `disarmed + idle` | `armed` + `phase='active'` | **本次新增能力**（FR-3 核心） |
| `disarmed + active` | `armed` | 与 `rearmIfRecoverable` 同效，留痕不同 |
| `driverHealth=paused` | `healthy` + `attempts=0`；`reason` 以 `round-limit` 开头时额外 `roundsInStage=0` | 与既有恢复语义一致 |

守卫与留痕：`dialogInFlight(id) === true` → 直接 `false`（**不越权**，弹框还在等作答）；生效时写 comment `[Dive 重新武装] 人显式要继续（trigger=board-resume）`，`createdBy.kind='human'`（见 `data-model.md`）。

### 看板入口（既有路由，语义增补） serves: FR-3

```
POST /dashboard/api/reqboard/req/autorun
body: { id: "REQ-…", on: true, reason?: string }
```

| 项 | 行为 |
|----|------|
| 输入 | 不变 |
| `on:false` | 不变（只置 `autoRun=false` + `pausedReason='manual'`） |
| `on:true` | 置 `autoRun=true`、清 `pausedReason/noopStreak/failureStreak`（不变）；**把 `rearmIfRecoverable` 调用换成 `armExplicit`**（原调用在 `requirements.ts:491`） |
| 输出 | **不新增键**；沿用既有 `advanceNote` 文案通道说明三种结果：已重新武装（人显式） / 已重新武装（误停摆） / 已置 autoRun=true |
| 触发 | 既有：`ctx.deps.advance(id)` 触发一次推进；Dive 侧由心跳（60s 一拍，`lastWakeAt` 超 10min 即叫醒）在 ≤1 分钟内接上 |

> 「继续」的语义到此完整：**人按一下 = autoRun 开 + 意图回到自动 + 立刻试跑一次 + Dive 一分钟内接上**。

## `reqboard_clear_pause`（工具面） serves: FR-4

| 项 | 内容 |
|----|------|
| 入参 | `{ requirement_id?: string }` —— 不变 |
| 出参 schema | 四键 `success` / `requirement_id` / `previous_activation` / `message` —— 不变（缺值整体省略，不发 undefined） |
| **新增** | `output.render = renderSmart(clearPauseSummary)`，摘要函数加进 `src/tools/render-summaries.ts`（该文件是所有工具摘要的唯一来源） |
| 首个文本行 | `Dive 已解锁（REQ-…）：armed → disarmed，现在可手动操作` |
| 副作用 | 不变（`activation='disarmed'`, `phase='idle'`）；**本次只修"副作用生效却报错"这一件事** |

不改其它工具：`TaskExecuteTool` 是委托别名（`Object.assign({}, defineAdvanceTool(deps), {name})`），render 在运行时被继承，无需改代码。

## 错误码与分类串 serves: FR-1, FR-2, FR-3, FR-4

| 名字 | 类型 | 出处 | 何时出现 |
|------|------|------|----------|
| `REQBOARD_DISPATCH_FAILED` | 工具回执 `code`（**既有**） | `AdvanceTool.ts:135` 兜底分支 | 本次变为投递失败的正确映射（此前被 `REQBOARD_REQ_NOT_FOUND` 顶掉） |
| `REQBOARD_ADVANCE_LOCKED` | 工具回执 `code`（既有） | 同上 | 锁未过期；FR-1 后**投递失败不再制造**这种锁 |
| `REQBOARD_DIVE_ARMED` | 工具错误码（既有） | `Decompose.ts:50` | 不变（armed 期间禁止手动拆分） |
| `owner_unresolvable` | 留痕分类串（**新增，非错误码**） | `advance.history[].detail` / comment 正文 | 宿主报 `has no live agent` 时 |
| `dispatch_failed` | 留痕分类串（**新增，非错误码**） | 同上 | 其它投递异常 |
| `owner_missing` | 留痕分类串（**新增，非错误码）** | 同上 | 取不到 id、按 unowned 投递成功时 |

分类串只进台账正文与 `detail`，**不进工具 schema**（不新增回执键，避免绑定层拒收）。
