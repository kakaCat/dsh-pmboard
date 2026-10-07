---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 架构设计（REQ-261007125552-32cb）

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

**问题**：拆分阶段产出的任务卡太粗——一张功能卡常覆盖多个接口、一张页面卡覆盖整个页面，且拆分缺少设计依据（用户原话见 requirement.md D-1）。

**当前状况**：

1. decomposing 提示词档（`src/domain/prompt/fragments/decomposing/{light,heavy,feature}.md`）只有「对照设计盘点改动」与容量**上限**（16 DU），无粒度下限与形态约束；
2. 门禁侧（`normalizePlanTasks`、`assertClauseCoverageGate`、`plan-doc-table`）只查 key 唯一、依赖合法、FR 覆盖、文档表收齐——**不查一卡声明几个接口、清单条目有没有卡接**；
3. 设计文档模板（`templates/design/interfaces.md` / `frontend.md`）没有机器可扫的「接口清单」「组件树」节，拆分时无清单可对照。

**设计方案**：三层锁——设计先行（产出清单）→ 拆分对照（清单条目必有卡接）→ 粒度门禁（一卡一接口 / 一卡一锚点）。

```
 design 阶段                    decomposing 阶段                     落库
 ┌────────────────────┐   ┌──────────────────────────┐   ┌────────────────┐
 │ interfaces.md       │   │ decomposition.md          │   │ tasks[] 落库    │
 │  +【接口清单】表    │──▶│  +【接口清单↔卡key】对照表 │──▶│ RTM 一对多      │
 │  (FR-1，硬门 G-D1)  │   │  +【组件树↔卡key】对照表   │   │ (FR-6 回归)     │
 │ frontend.md         │   │  (FR-2，硬门 G-D2)        │   └────────────────┘
 │  +【组件树】节      │   │ tasks[] 粒度门禁：         │
 └────────────────────┘   │  · 一卡接口数>1 → 拒 (FR-4)│
                          │  · footprint.files>5 → 警告 │
                          │  · UI卡锚点>1 → 警告 (FR-5) │
                          └──────────────────────────┘
 提示词档（软规则，FR-3）：decomposing 三档补「接口级/组件级/一卡一锚」；
 design 档补「接口清单/组件树必备节」
```

**不这么做的后果**：粒度约束只靠提示词时遵守率低——本仓已有实测记录（伪依赖 78/107 条零交集、跳联调 20/99 仅 4 份写理由，见 heavy.md）；粗卡的代价在实施期以「一轮装不下 / 并行互相覆盖 / 验收锚点含糊」的形式返工。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```
  reqboard_submit(kind=plan) ──▶ SubmitArtifact.submitPlanArtifact ──┐
  reqboard_decompose(tasks=…) ──▶ Decompose.executeDecompose ────────┼──▶ assertGranularityGates（新增，唯一分派入口）
  看板批准计划自动落库 ──▶ approved-plan-landing ────────────────────┘         │
                                                                              ▼
                                              ┌── plan-granularity.ts（新增 wiring：读清单/对照表，组装 GateFailure）
                                              ├── domain/task/Granularity.ts（新增纯函数：接口声明计数 / files 超限 / 锚点超限）
                                              └── domain/limits.ts（+2 常量：maxInterfacesPerCard / footprintFilesSoftMax）

  reqboard_submit(kind=design) ──▶ checkDesignContentGate ──▶ +接口清单/组件树节校验（FR-1，聚合报错复用既有信封）

  提示词档：fragments/decomposing/{light,heavy,feature}.md（FR-3）
            fragments/design/{light,heavy}/overrides.md + feature.md（FR-1）
            └─▶ 改动后跑 node scripts/inline-prompt-fragments.mjs 再生成 generated/fragments.ts（不手改）

  模板：templates/design/interfaces.md（+接口清单节）/ frontend.md（+组件树节）
        templates/decomposing/decomposition.md（+两段对照表节）
        └─▶ 表头判据与 scripts/template-gate-probe.mts、doc-section-parity.mts 同口径登记
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves哪条FR） | 影响范围 |
|---|---|---|---|---|
| `src/domain/task/Granularity.ts` | 新增 | 纯函数：`countInterfaceDeclarations`、`granularityWarningsOf` | FR-4, FR-5 | 门禁判定单点 |
| `src/domain/limits.ts` | 修改 | +`maxInterfacesPerCard: 1`、`footprintFilesSoftMax: 5`（标注待标定） | FR-4, FR-5 | 阈值单一源 |
| `src/application/internal/plan-granularity.ts` | 新增 | wiring：读设计清单/对照表、组装 `assertGranularityGates` | FR-2, FR-4, FR-5 | 三条入口共用 |
| `src/application/use-cases/SubmitArtifact.ts` | 修改 | kind=plan 挂 `assertGranularityGates` | FR-2, FR-4, FR-5 | 提交路径 |
| `src/application/use-cases/Decompose.ts` | 修改 | 落库前挂同一门 | FR-2, FR-4, FR-5 | 落库路径 |
| `src/application/internal/approved-plan-landing.ts` | 修改 | 批准直落路径挂同一门 | FR-2, FR-4, FR-5 | 批准路径 |
| `src/application/internal/content-gate-wiring.ts` | 修改 | `checkDesignContentGate` 聚合 +清单节缺失维 | FR-1 | design 提交门 |
| `src/shared/protocol.ts` | 修改 | PlanTask +`granularity_exempt`（白名单透传+长度校验） | FR-4 | 豁免通道 |
| 提示词档 + 生成物 | 修改 | 见改动地图 | FR-1, FR-3 | agent 行为 |
| 模板三份 + 探针登记 | 修改 | 见改动地图 | FR-1, FR-2 | 文档骨架/判据同源 |
| `tests/plan-granularity.test.ts` 等 | 新增 | 见 test-cases.md | FR-1~FR-6 | 回归 |

## 关键设计裁定（本阶段拍板） `serves: FR-1, FR-2, FR-4, FR-5`

| 决策点 | 裁定 | 理由 |
|---|---|---|
| FR-1 清单节缺失的强度 | **硬拒**，挂进 `checkDesignContentGate` 聚合报错 | 软提示遵守率低有实测记录；且该门已有聚合信封与存量豁免惯例 |
| FR-2 对照表缺失时的强度 | 设计文档**有**清单 → 硬拒；设计文档**无**清单（豁免/存量）→ 降级 warn | 没有清单就没有判据对象，硬拒会锁死合法豁免场景（与 e2eCoverageOf「读数未知不判」同口径） |
| FR-4 豁免通道 | 显式 `granularity_exempt: "理由"`（必填理由，snake/camel 双拼法） | 与 `skipIntegrationReason` 同模式：砍约束是减法，理由必须可复核；不按 phase/side 隐式豁免（隐式 = 静默放行面） |
| FR-5 的强度 | **软门**（进返回体 `granularity_warnings`，不拒） | 与超容量门同哲学：超了是风险不是错误，人可知情放行；不复制 ⚠️标记词法（避免又一套标记语法） |
| 生效口径 | FR-1/FR-2/FR-4 按 `docQualityRulesApply(req.createdAt)` 门控（2026-10-06 12:00 UTC 后立项的需求）；FR-5 软门全量生效 | 与 sidesGateFailure / docSectionGateFailure 同款的「新规则不追溯存量」惯例；软门不拒故无锁死风险 |
| 门禁挂载形态 | 一个判定单点 `assertGranularityGates`，三条入口（submit / decompose / 批准直落）只调用 | 本仓事故教训：多条路径各写分派必然分叉漏接线（§10 #46 已有同款裁定） |

## 数据结构变更 `serves: FR-4, FR-5`

仅新增一个可选字段与一个返回体字段，无台账迁移——明细见 [data-model.md](data-model.md)：

- `PlanTask.granularity_exempt?: string`（豁免理由，≤300 字符）；
- 提交/落库返回体 +`granularity_warnings?: string[]`；
- `LIMITS` +2 常量。

## 失败与降级路径 `serves: FR-2, FR-4, FR-6`

- **设计文档无清单节**（FR-1 豁免或存量需求）：FR-2 对照表门降级为 warn，返回体点名「降级原因：interfaces.md 无接口清单节」，**不静默放行**；
- **接口检测误报**（注释/文档串误命中）：词法只认声明式写法（见 [interfaces.md](interfaces.md) §接口声明词法）；仍误报时走 `granularity_exempt` 显式豁免；
- **存量计划**：`docQualityRulesApply` 判 false 的需求整门跳过（FR-6 的「不追溯」落点）；
- **写路径半成品**：三个门全部在 mutate 之前判定，拒绝零副作用（与 assertClauseCoverageGate 同位置）。

## 迁移与回滚 `serves: FR-6`

- **无数据迁移**：不改 TaskRecord/RequirementRecord 已落库字段；`granularity_exempt` 是可选新键，旧记录缺省 = 未豁免，语义不变；
- **回滚路径**：三个门各有独立错误码，可按 FR 单独降级为 warn（改一处 `enforce → warn` 判定）即可止血，无需回滚数据；
- **兼容**：旧形态计划（无对照表）在降级路径下可落库并有提示——由 FR-6 回归用例锁死。
