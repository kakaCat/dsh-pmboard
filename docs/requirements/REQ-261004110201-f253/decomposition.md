---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 拆分计划（REQ-261004110201-f253）

> 依据：design/{architecture,interfaces,data-model,test-cases,use-cases,backend}.md（均已确认）。
> 纪律：**契约卡先行**（t1 定死字段/配置/校验），实现卡 depends_on 它；单列兼容卡（t7）；
> 每卡 acceptance 必须能跑。

## 目标

让实施链「跑得省、看得见、排得清」：路由表命中即换模型、子卡执行留下时长/产出/零产出、
多需求并行按优先级与在制上限调度；**三项未配置时全链路行为逐字等于现状**。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `src/domain/task/StageRouting.ts` | 新增（校验 + 两级命中解析） | t1 |
| `src/plugin-config.ts` | 修改（`stageRouting` / `maxInFlightRequirements` / `zeroOutputAlertThreshold` + 装配期校验） | t1 |
| `src/shared/protocol.ts` | 修改（`ExecutionRecord.outputCount/zeroOutput`、`RequirementRecord.priority` 三个可选键） | t1 |
| `src/application/internal/workflow-script.ts` | 修改（`route` 注入 provider/model） | t2 |
| `src/application/use-cases/ExecuteTask.ts` | 修改（传 route；收尾传产出数；零产出告警） | t2 / t3 / t5 |
| `src/application/internal/token-usage.ts` | 修改（`closeExecutions` 收 `outputCount`） | t3 |
| `src/domain/workflow/StageTelemetry.ts` | 新增（按 stageKind 聚合纯函数） | t4 |
| `src/application/query/QueryState.ts` + `src/tools/StatusTool/StatusTool.ts` | 修改（回执 `stage_telemetry` + schema 先声明） | t4 |
| `src/application/use-cases/AdvanceChain.ts` | 修改（priority 排序 + WIP 闸 + `stopped='wip_limit'`） | t6 |
| `docs/architecture/*` | 修改（契约/说明书同步） | t8 |

## 覆盖对照表（需求条款 ↔ 计划 key）

> 格式契约：表头含「需求条款」与「任务」两列时被机读（`taskRefsFromDecomposition`），
> 用于需求侧「逐条接收状态」。任务表的 `requirement_refs` 字段是另一条通道，两处并存、互为复核。

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 按阶段路由模型 | t1、t2、t7、t8 |
| FR-2 | 阶段遥测 | t1、t3、t4、t7、t8 |
| FR-3 | 零产出段标记与告警 | t5、t7、t8 |
| FR-4 | 需求级优先级与全局 WIP 上限 | t1、t6、t7、t8 |

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 定契约：路由解析 + 三个配置 + 可选字段 | implement | backend | — | FR-1, FR-2, FR-4 |
| t2 | 路由注入生成器 | implement | backend | t1 | FR-1 |
| t3 | 执行收尾写产出数 | implement | backend | t1 | FR-2 |
| t4 | 阶段遥测读模型 + status 回执 | implement | backend | t3 | FR-2 |
| t5 | 零产出告警（可推导去重） | implement | backend | t3 | FR-3 |
| t6 | 优先级排序 + WIP 闸 | implement | backend | t1 | FR-4 |
| t7 | 兼容与迁移验证（未配置即现状） | test | backend | t2, t4, t5, t6 | FR-1, FR-2, FR-3, FR-4 |
| t8 | 全量回归 + 文档同步 | test | backend | t7 | FR-1, FR-2, FR-3, FR-4 |

## 各卡验收（可证伪）

- **t1**：`npx vitest run tests/stage-model-routing.test.ts`（含 t1 段：非法路由表抛错并点名、`stageKind@difficulty` 两级命中、缺省字段语义）——契约用例先行全绿。
- **t2**：`npx vitest run tests/stage-model-routing.test.ts` 全绿，其中「未传 route → 生成脚本与基线快照逐字节相同」一条为硬断言。
- **t3**：`npx vitest run tests/stage-telemetry.test.ts` 全绿：传 `outputCount` → 两键落盘；不传 → 无新键。
- **t4**：同文件全绿 + `npx vitest run tests/tools-schema.test.ts`：`stage_telemetry` 已在 StatusTool schema 声明；无数据时回执**无该键**。
- **t5**：`npx vitest run tests/zero-output-alert.test.ts` 全绿：阈值 2 时连续 4 次零产出只写 2 条告警（floor(4/2)）；非零产出后重置。
- **t6**：`npx vitest run tests/requirement-priority.test.ts` 全绿：priority 降序 + 同值 createdAt 升序；上限满 → `stopped='wip_limit'` 且原因点名在跑需求与上限；上限 0 → 与现状一致。
- **t7**：`npx vitest run tests/stage-model-routing.test.ts tests/stage-telemetry.test.ts tests/zero-output-alert.test.ts tests/requirement-priority.test.ts` 四文件全绿，且其中「未配置即现状」断言（脚本逐字节快照 / execution 无新键 / 候选顺序与投递结果不变 / 回执无空壳）逐条在案。
- **t8**：`pnpm test` 失败数 ≤ 基线且本需求新增用例全绿；`npx tsc --noEmit` 归属本需求文件零错；`docs/architecture/automation-chain-contract.md` 与 `project-manual.md` 同步本次新增能力。

## 边界（不做）

不做模型自动优选、不自动改阶段模板、不做跨需求预算硬闸、不回填历史遥测（四条与需求文档一致）。
