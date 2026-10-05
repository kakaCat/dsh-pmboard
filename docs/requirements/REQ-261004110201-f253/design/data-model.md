---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 数据模型（REQ-261004110201-f253）

> 三条铁律：① 只加**可选**键，不加必填；② 不动存储版本、不做数据回填；③ 缺键读侧有明确默认。

## 字段清单 `serves: FR-2, FR-4`

| 字段 | 位置 | 类型 | 必填 | 缺省语义 | 写入者 |
|---|---|---|---|---|---|
| `execution.outputCount` | `TaskRecord.executions[]` | number | 否 | **未知**（不计入零产出统计） | `closeExecutions`（收尾唯一入口） |
| `execution.zeroOutput` | 同上 | boolean | 否 | 由 `outputCount` 推导：`0 → true` | 同上 |
| `RequirementRecord.priority` | 需求记录 | number | 否 | `0`（排序时与同值同档） | 看板改优先级 / 创建时可选带 |

**推导规则（读侧唯一口径，避免两处各算各的）**：

```
outputCount = filesChanged.length + completed.length      // 子卡产出的条目数
zeroOutput  = outputCount === 0                            // 两者皆空才算零产出
streak(stage) = 该需求该 stageKind 末尾连续的 zeroOutput 执行数（非零产出即断）
```

## 执行记录形状（改后） `serves: FR-2`

```ts
interface ExecutionRecord {
  id: string
  sessionId?: string
  trigger: 'manual' | 'auto'
  startedAt: number
  endedAt?: number
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  evidence?: string[]
  tokenUsage?: ExecutionTokenUsage
  outputCount?: number        // 新增（可选）
  zeroOutput?: boolean        // 新增（可选）
}
```

## 遥测读模型（派生，不落盘） `serves: FR-2`

```ts
interface StageTelemetryRow {
  stageKind: string        // dev / integrate / review / test / e2e / manual / …
  runs: number             // 已完成执行数（outcome !== 'running'）
  totalDurationMs: number  // Σ(endedAt - startedAt)
  avgDurationMs: number    // totalDurationMs / runs（runs=0 → 0）
  outputCount: number      // Σ outputCount（未知的不计）
  zeroOutputRuns: number   // zeroOutput === true 的执行数（未知的不计）
  lastAt: number           // 最近一次结束时刻
}
```

**刻意不做成落盘桶**：遥测是 `executions` 的投影，落盘会造成「同一事实两份」——
`tokenUsage.byStage` 已经因为 keyed by prompt 阶段而不能复用，不复刻第二个桶。

## 与既有字段的关系（不动的部分） `serves: FR-2`

| 既有 | 关系 |
|---|---|
| `tokenUsage.byStage`（prompt 阶段 token 桶） | **不动**。语义是「需求阶段 × token」，与「子卡阶段 × 时长/产出」并列存在，互不改写 |
| `execution.tokenUsage`（开工/完工快照） | **不动**。新增两键与它平级 |
| `task.lastReport.{filesChanged,completed}` | 产出数的**来源**；遥测不重复存储产出内容，只记计数 |
| `task.executions[].startedAt/endedAt` | 时长的来源；遥测不新增时间字段 |

## 版本与兼容 `serves: FR-2, FR-4`

- 存储 schema 版本：**不变**（仍为现行版本；新增可选键对读写都向后兼容）。
- 旧数据：无 `outputCount`/`zeroOutput` → 读侧记「未知」，**不参与零产出告警**（宁可漏报不误报）；
  无 `priority` → 视作 0。
- 回填：**不做**。历史执行的时长/产出无法可靠重建（当时未记录产出计数），
  伪造近似值会让遥测说谎 ⇒ 只对新增执行生效，并在看板文案里注明数据起点。
- 回滚：删配置即可（路由/WIP）；遥测字段留着无副作用，不影响任何判定门。
