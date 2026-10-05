---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 架构设计（REQ-261004110201-f253）

> feature 重档。纪律：**未配置就是现状**（路由表/优先级/WIP 三项缺省时行为逐字不变）；
> 不新增子系统，只在既有三层（配置面 / 生成器 / 调度与遥测）各加一处窄口。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4`

一句话（可证伪）：**实施链从「跑得对」进到「跑得省、看得见、排得清」**——
路由表命中即换模型，每段执行留下时长/产出/零产出，多需求并行有优先级与在制上限；
三项均未配置时，全链路行为与改造前逐字一致（由既有全量用例守住）。

方案分四块，各自独立可关：

```
  配置面（plugin config）             生成器                        执行与台账
 ┌────────────────────────┐   ┌──────────────────────┐   ┌────────────────────────────┐
 │ stageRouting           │   │ generateSubtaskScript│   │ ExecuteTask 收尾            │
 │  dev→strong            │──▶│  agent(prompt,{      │──▶│  closeExecutions(+产出数)   │
 │  review/test→cheap     │   │    schema,           │   │   → execution.outputCount   │
 │ maxInFlightRequirements│   │    provider,model})  │   │   → execution.zeroOutput    │
 │ zeroOutputAlertThreshold│  └──────────────────────┘   └────────────┬───────────────┘
 └───────────┬────────────┘                                           │
             │                                                        ▼
             │                                        ┌───────────────────────────────┐
             └───────────────────────────────────────▶│ stageTelemetryOf(tasks) 只读  │
                  scanAndResume 排序 + WIP 闸           │ 按 stageKind 聚合 → 回执/看板 │
                                                      └───────────────────────────────┘
```

**为什么不把遥测塞进 `tokenUsage.byStage`**：那是 **prompt 阶段**（brainstorming/design/…）keyed
且只装 token；本需求要的是**子卡阶段**（dev/integrate/review/test/…）的时长与产出。
两者语义不同，混用会让两个口径互相说谎 ⇒ 遥测做成**从 executions 派生的只读读模型**。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

| 模块 | 动作 | 内容 |
|---|---|---|
| `src/plugin-config.ts` | 修改 | 新增 `stageRouting` / `maxInFlightRequirements` / `zeroOutputAlertThreshold` 三个可选配置 + 装配期校验 |
| `src/domain/task/StageRouting.ts` | 新增 | 纯函数：路由表校验 + `resolveStageModel(stageKind, difficulty, routing)` |
| `src/application/internal/workflow-script.ts` | 修改 | 生成脚本时注入命中的 `provider/model`（未命中不注入） |
| `src/shared/protocol.ts` | 修改 | `ExecutionRecord` 增可选 `outputCount/zeroOutput`；`RequirementRecord` 增可选 `priority` |
| `src/application/internal/token-usage.ts` | 修改 | `closeExecutions` 增可选 `outputCount` → 落 `outputCount/zeroOutput` |
| `src/application/use-cases/ExecuteTask.ts` | 修改 | 收尾时传产出数；零产出连续达阈值 → 结构化告警评论（去重可推导） |
| `src/domain/workflow/StageTelemetry.ts` | 新增 | 纯函数：`stageTelemetryOf(subtasks)` 按 stageKind 聚合 |
| `src/application/use-cases/AdvanceChain.ts` | 修改 | `scanAndResume` 按 priority 排序 + WIP 上限闸（超限不投递并如实说明） |
| `src/application/query/QueryState.ts` | 修改 | 回执增只读 `stage_telemetry`（无数据整体省略键） |
| `src/tools/StatusTool/StatusTool.ts` | 修改 | schema 先声明 `stage_telemetry`（三方同源纪律） |

## FR-1 路由生效路径 `serves: FR-1`

1. 装配期：`validateStageRouting(pluginConfig.stageRouting)`——键必须是合法 `StageKind`，
   值只能是 `{provider?, model?}` 且至少一项非空字符串；非法**装配期响亮抛错**（不静默忽略）。
2. 生成期：`generateSubtaskScript` 收 `route?: {provider?, model?}`，命中即把两键写进
   `agent(prompt, { schema, provider, model })`；未命中 → 与现状**逐字节相同**的脚本。
3. 难度参与：路由表的 key 允许 `'<stageKind>@<difficulty>'` 优先于 `'<stageKind>'` 命中
   （同一张表，两级回落；难度取需求 `promptDifficulty`）。

## FR-2 遥测读模型 `serves: FR-2`

- **写入**：子卡执行收尾（`ExecuteTask` done 路径）调
  `closeExecutions(task, { at, outcome, outputCount })`；
  `outputCount = filesChanged.length + completed.length`（产出条目数），
  `zeroOutput = outputCount === 0`。旧记录无该键 → 读侧记「未知」，**不计入零产出**（不误告警）。
- **聚合**：`stageTelemetryOf(subtasks)` 纯函数，按 `stageKind` 汇总已完成执行：
  `{ stageKind, runs, totalDurationMs, avgDurationMs, outputCount, zeroOutputRuns, lastAt }`。
- **读取**：`reqboard_status` 回执 `stage_telemetry: StageTelemetryRow[]`（无数据整体省略键，
  无损 JSON 纪律：不发 null/undefined）。

## FR-3 零产出告警与去重 `serves: FR-3`

- 判据：同一需求同一 `stageKind` 的**连续** `zeroOutput` 执行数 ≥ 阈值
  （`zeroOutputAlertThreshold`，默认 2）；非零产出执行即重置连续计数。
- 去重（可推导，不新增状态）：已有告警数 `alerts` 与当前连续数 `streak` 比较，
  仅当 `floor(streak / threshold) > alerts` 时才写一条 → 同一轮连续零产出只告警一次，
  恢复后再触发才会再告警。
- 台账留痕：结构化评论 `[零产出告警] stage=… streak=N threshold=M 最近耗时=…ms`，
  **不改模板、不改路由、不阻断链**（改模板是人裁决）。

## FR-4 优先级与 WIP `serves: FR-4`

- 排序：`priority` 降序，同值按 `createdAt` 升序（稳定，避免抖动）。
- 应用点：① `scanAndResume` 的候选遍历顺序；② 看板需求列表的返回顺序（服务端排序，看板零改）。
- WIP 闸：`maxInFlightRequirements`（0 = 不限）。**在制判据 = 有新鲜推进锁**（`advance.lockAt`
  未过期，即真有 run 在跑）；在制数 ≥ 上限 → 本轮**不投递**新需求，
  在回执里如实给出 `stopped='wip_limit'` 与「谁在跑 / 上限多少」。

## 迁移与兼容设计 `serves: FR-1, FR-2, FR-4`

| 项 | 兼容策略 | 回滚 |
|---|---|---|
| 路由表 | 未配置 → 生成脚本与现状逐字节相同 | 删配置即回现状 |
| 遥测字段 | 新增可选键；旧记录读侧记未知 | 字段留着不影响任何判定 |
| 优先级 | 无 `priority` = 0；排序稳定 | 无需回滚（只影响顺序，同值保持 createdAt 序） |
| WIP 上限 | 0（默认）= 不限 = 现状 | 置 0 |

灰度：无。三项都是配置开关 + 纯增量字段，**不需要灰度也不需要数据回填**
（这是本需求「未配置即现状」承诺的直接后果）。

## 风险与对冲 `serves: FR-1, FR-3, FR-4`

| 风险 | 对冲 |
|---|---|
| 路由错配（把 review 段指到弱模型 → 质量下滑） | 路由表是**人写**的配置；本需求只保证「配了就生效、没配不变」，不猜模型能力 |
| 零产出误判（子卡合法地无文件产出，如纯结论段） | 结论族阶段（review/verdict）产出以 `completed` 计；两者皆空才算零产出；且只告警不阻断 |
| WIP 上限把该跑的需求饿死 | 上限默认 0（不限）；超限回执点名「谁在跑」并给出解除方式（等其结束或调大上限） |
