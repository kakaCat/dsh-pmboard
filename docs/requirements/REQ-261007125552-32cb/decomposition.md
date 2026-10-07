# 拆分计划（REQ-261007125552-32cb）

> 目标：把拆分粒度锁到接口级/组件级——设计先行（清单节硬门）+ 拆分对照表硬门 + 接口数门禁 + 形态软门 + RTM 回归。
> 做法：domain 纯函数 → protocol 字段透传 → wiring 三入口挂载 → design 门聚合 → 提示词/模板 → 测试 → 总验收。
> 本计划自举新格式：含「接口清单 ↔ 卡 key」对照表（清单来自 design/interfaces.md）。

## 代码层面变更盘点

**新增**：
- `src/domain/task/Granularity.ts`（接口声明计数 + 粒度警告判定，纯函数）
- `src/application/internal/plan-granularity.ts`（`assertGranularityGates` 唯一分派入口）
- `tests/plan-granularity.test.ts`（门禁测试）

**修改**（精确到模块/函数）：
- `src/domain/limits.ts`：LIMITS +`maxInterfacesPerCard`、`footprintFilesSoftMax`
- `src/shared/protocol.ts`：`normalizePlanTasks` 白名单 +`granularity_exempt`（双拼法、≤300、去空）；PlanTask 类型 +可选字段
- `src/application/use-cases/SubmitArtifact.ts`：kind=plan 挂 `assertGranularityGates`（覆盖门之后、超容量门之前）；返回体 +`granularity_warnings`
- `src/application/use-cases/Decompose.ts`：mutate 前挂同一门
- `src/application/internal/approved-plan-landing.ts`：批准直落路径挂同一门
- `src/application/internal/content-gate-wiring.ts`：`checkDesignContentGate` 聚合 +清单节维（FR-1）
- 提示词档：`fragments/decomposing/{light,heavy,feature}.md`、`fragments/design/{light,heavy}/overrides.md`、`fragments/design/feature.md`；再生成 `generated/fragments.ts`
- 模板：`templates/design/{interfaces,frontend}.md`、`templates/decomposing/decomposition.md`
- 探针登记：`scripts/template-gate-probe.mts`、`scripts/doc-section-parity.mts`
- `tests/decompose-rtm-integration.test.ts`：+一对多接收用例（TC-9）

**删除**：无。

## 接口清单 ↔ 卡 key（对照表）

| 接口 | 接收卡 key |
|---|---|
| IF-1 countInterfaceDeclarations | t1 |
| IF-2 assertGranularityGates | t3 |
| IF-3 plan_card_multi_interface | t3 |
| IF-4 plan_interface_map_missing / plan_component_map_missing | t3 |
| IF-5 REQBOARD_DESIGN_CONTENT_GATE（聚合维） | t4 |
| IF-6 granularity_warnings | t3 |

> 列名刻意用「接收卡 key」而非「计划 key」：`readPlanDocTaskTable` 取**第一张**表头含「计划 key」的表当任务表，对照表若用同名会被误认（本需求实施时已实测撞上）。该词法冲突的规避已写进 design/interfaces.md §文档格式契约三。

组件树对照：不适用（sides=[backend]，无 UI 改动）。

## 任务表

| 计划 key | 任务 | 验收 | 工作量 | 依赖 | 关联 D-x |
|---|---|---|---|---|---|
| t1 | 新增粒度判定纯函数与阈值常量 | vitest 词法用例全绿；tsc ≤ 基线 | S（files 2 / anchors 4） | — | D-1 |
| t2 | PlanTask 透传 granularity_exempt | 双拼法透传单测绿；空串不留键 | S（files 1 / anchors 3） | — | D-1 |
| t3 | 粒度门禁 wiring 与三入口挂载 | TC-3/4/5/6/10 绿；三入口同码同名 | M（files 5 / anchors 8） | t1, t2 | D-1, D-2 |
| t4 | design 提交门聚合清单节校验 | TC-1/TC-2 绿（硬拒 + 存量豁免） | S（files 2 / anchors 3） | — | D-1 |
| t5 | 提示词档与模板落粒度规则 | prompts:check 绿；grep 命中接口级/组件级 | M（files 13 / anchors 4）⚠️超形态软上限 | — | D-1 |
| t6 | 粒度门禁与 RTM 回归测试 | plan-granularity 测试全绿；TC-9 一对多绿 | L（files 3 / anchors 20） | t1, t2, t3, t4 | D-2 |
| t7 | 全量回归与验收 | pnpm test / tsc ≤ 基线；验收单逐项过 | S（files 1 / anchors 3） | t3, t4, t5, t6 | D-2 |

> t5 的 files=13 超过形态软上限（5）：本需求落地后该卡会触发 `granularity_warnings`——已知情接受（均为独立的提示词/模板/探针小文档编辑，再细拆只会增加仪式）。
