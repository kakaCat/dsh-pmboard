---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 接口设计（REQ-261004110201-f253）

> 三处对外面（配置 / 回执 / 调度回执）+ 五处内部签名。**未配置即现状**是每条的默认值承诺。

## 配置接口 `serves: FR-1, FR-3, FR-4`

```ts
// src/plugin-config.ts —— PluginConfig 新增三个可选字段（缺省 = 现状行为）
stageRouting?: Record<string, { provider?: string; model?: string }>
maxInFlightRequirements?: number      // 默认 0 = 不限
zeroOutputAlertThreshold?: number     // 默认 2
```

| 配置 | 合法值 | 非法时的语义 |
|---|---|---|
| `stageRouting` | key = StageKind 或 `'<StageKind>@<difficulty>'`；value 至少一项非空字符串 | **装配期抛错**（点名非法键），不静默忽略 |
| `maxInFlightRequirements` | 非负整数 | 负数/非整数 → 装配期抛错 |
| `zeroOutputAlertThreshold` | ≥ 1 的整数 | 同上 |

## 路由解析接口 `serves: FR-1`

```ts
// src/domain/task/StageRouting.ts（纯函数，零 I/O）
export interface StageModelRoute { provider?: string; model?: string }
export function validateStageRouting(raw: unknown): Record<string, StageModelRoute>  // 非法 → throw
export function resolveStageModel(
  stageKind: string,
  difficulty: string | undefined,
  routing: Record<string, StageModelRoute> | undefined,
): StageModelRoute | undefined
// 命中顺序：'<stageKind>@<difficulty>' → '<stageKind>' → undefined（不注入）
```

## 脚本生成接口 `serves: FR-1`

```ts
// src/application/internal/workflow-script.ts
export interface SubtaskScriptInput {
  stageKind: string
  stageLabel: string
  prompt: string
  route?: StageModelRoute        // 新增：命中即注入，未命中 → 脚本与现状逐字节相同
}
```

生成结果（命中时）：

```js
const out = await agent("<prompt>", { schema: {...}, provider: "<provider>", model: "<model>" });
```

**契约门禁不变**：`assertScriptContract` 仍只放行五个 hook；`provider/model` 只是
`agent()` 的第二个参数里的键，不新增 hook、不新增宿主面。

## 遥测读取接口 `serves: FR-2`

```ts
// src/domain/workflow/StageTelemetry.ts（纯函数）
export interface StageTelemetryRow {
  stageKind: string
  runs: number                 // 已完成执行数
  totalDurationMs: number
  avgDurationMs: number
  outputCount: number          // 产出条目合计
  zeroOutputRuns: number
  lastAt: number
}
export function stageTelemetryOf(subtasks: readonly TaskRecord[]): StageTelemetryRow[]
```

回执字段（`reqboard_status`）：

| 键 | 类型 | 何时出现 |
|---|---|---|
| `stage_telemetry` | `StageTelemetryRow[]` | 有已完成的子卡执行时；否则**整体省略键**（不发空数组、不发 null） |

## 执行收尾接口 `serves: FR-2, FR-3`

```ts
// src/application/internal/token-usage.ts
export interface CloseExecutionsOpts {
  at: number
  outcome: 'succeeded' | 'failed' | 'cancelled'
  error?: string
  outputCount?: number          // 新增可选：产出条目数；缺省 → 不写，读侧记「未知」
}
export function closeExecutions(task: TaskRecord, opts: CloseExecutionsOpts, snap?: TokenSnapshot): number
```

写入规则：`outputCount` 存在时同时写 `execution.outputCount` 与 `execution.zeroOutput = outputCount === 0`；
缺省时两键都不写（旧调用方零改动）。

## 调度接口 `serves: FR-4`

```ts
// src/application/use-cases/AdvanceChain.ts
export type AdvanceStop = … | 'wip_limit'          // 新增取值
export async function scanAndResume(deps: UseCaseDeps, exec?: unknown): Promise<AdvanceOutcome[]>
// 行为：候选按 priority 降序（同值 createdAt 升序）遍历；在制数（新鲜锁）≥ 上限 → 该候选返回
//       dispatched:false + stopped:'wip_limit' + reason（点名在跑的需求与上限），不投递。
```

`AdvanceOutcome.reason`（超限样例）：

```
WIP 上限已满（在制 3 / 上限 3）：正在跑 REQ-…a1、REQ-…b2、REQ-…c3；
本轮未投递本需求。解除方式：等其中一条结束，或调大 maxInFlightRequirements。
```

## Schema 同步清单（先声明后回执） `serves: FR-2`

| 工具 | 新增声明键 |
|---|---|
| `reqboard_status` | `stage_telemetry`（array of object） |
| `reqboard_task_run` / `reqboard_run_status` | 若回执透出 `stopped='wip_limit'` 文案 → 走既有 `reason`/`stopReason` 字符串键，**不新增键** |

## 错误语义一览 `serves: FR-1, FR-4`

| 情形 | 语义 |
|---|---|
| 路由表非法（未知 stageKind / 空 value） | 装配期抛错，插件不启用（响亮失败，不半可用） |
| 路由未配置 | 生成脚本不注入 provider/model（现状） |
| WIP 超限 | 不投递 + `stopped='wip_limit'` + 人话原因（不是错误，是如实拒绝） |
| 遥测无数据 | 回执省略 `stage_telemetry` 键（不是空壳） |
