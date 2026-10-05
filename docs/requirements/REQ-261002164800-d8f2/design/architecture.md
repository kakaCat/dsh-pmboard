---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 架构：计划落库的取数单点与三入口收敛 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 一句话：把「哪张卡接哪几条 FR」这件事的**取数、门禁、写入**各收敛成一处，三条入口共用。
> 只写设计，不写任务清单（清单属拆分阶段）。

## 现状与病灶 serves: FR-1, FR-3, FR-6

| 位置 | 现状 | 后果 |
|---|---|---|
| `confirm-settle.ts:288-307` | 自建 refs 组装 + `planRefsMissing` **硬拒**（每张卡都要有 FR） | 一张纯文档卡（无 FR）⇒ 整批 0 卡；实测 277d 16:30:40 |
| `Decompose.ts:182-192` | 自建 refs 组装（只读 `a.tasks ∪ plan.tasks`），**不读文档覆盖表** | 手动补落库的卡 refs 全空 |
| `SubmitTool.ts:54-79` | 入参 `tasks.items` = `additionalProperties:false`，**无** `requirement_refs` | 报错指引的动作做不到 |
| `protocol.ts:598-629 / 846-858` | `PlanTask` 无该字段、`normalizePlanTasks` 白名单丢弃 | 计划携带任务表的 refs 恒空 |
| `requirements.ts:164-209` | 看板批准只盖 `approvedAt`，不落库不开跑 | 文案称"同样是有效通道"与行为不符 |
| 全局 | 落库后**无任何** refs 写入口 | 存量 531 张空 refs 补不回 |

## 目标模块图 serves: FR-1, FR-2, FR-3

```
                  ┌────────────────────────────────────────────────┐
   入口（三条）    │  application/internal/plan-refs.ts             │
 ┌──────────────┐ │   normalizeRequirementRefs(raw)                │
 │ 确认弹框      │ │   refsForLanding({plan, explicitTasks, docs,   │
 │ applyConfirm │─┼──▶  req}) : Map<planKey, FR[]>                  │
 │ 看板批准      │ │   unrefedKeys(keys, map) : string[]  ← 警告用   │
 │ reqboard_    │ │   （显式 refs 优先 → 文档覆盖表兜底 → 空）       │
 │ decompose    │ └───────────────────────┬────────────────────────┘
 └──────┬───────┘                         │ 三条入口唯一的 refs 来源
        │                                 ▼
        │        ┌────────────────────────────────────────────────┐
        └───────▶│  application/internal/plan-landing.ts（既有）   │
                 │   landPlanTasks({draft, refsByKey, …})          │
                 │   ① 门禁：FR 覆盖（硬）    ② 卡无落点 → 警告      │
                 └──────┬───────────────────────────┬──────────────┘
                        │                           │
                        ▼                           ▼
              TaskStore.createMany           rtm 同步（serves ← refs）
              （卡：requirementRefs）         + 返回体 task_coverage（真实记录）

  落库后的补写（FR-4）：tasks/AmendTaskRefs.ts ← 工具 reqboard_task_refs
                                              ← 看板 PATCH 路由（同一用例）
  存量回填（FR-5）：scripts/backfill-task-refs.ts（只经 TaskStore 端口）
```

## 依赖方向与分层 serves: FR-1, FR-5

- `domain/`：零 IO。新增的 refs 校验（编号形态、去重）放这里（可纯函数单测）。
- `application/internal/plan-refs.ts`：唯一 refs 组装点；可读文档（`DocsReader` 端口）。
- `application/internal/plan-landing.ts`：唯一落库编排（既有模块，本次只改返回值与 RTM 入参）。
- `tools/` 与 `http/`：薄壳，只做协议转换，复用同一用例（C-01：边界只许向内）。
- 脚本 `scripts/backfill-task-refs.ts`：只经 `TaskStore` 端口与既有用例，**不直接读写队列文件**（与在途的 v10 分片迁移解耦）。

## 三条不变量 serves: FR-1, FR-2, FR-3

1. **取数单点**：`grep -rn "refsByKey" src` 只允许出现在 `plan-refs.ts`（构造）与 `plan-landing.ts`（消费）；两条旧入口不再自己拼。
2. **门禁单点**：硬门只有一道「每个 FR 有落点」（`assertClauseCoverageGate`）；「卡无 FR 落点」**一律降为警告**，在返回体 `unrefed_cards` 与需求评论两处可见。
3. **写入单点**：`TaskRecord.requirementRefs` 只有两处写点——建卡（`plan-landing`）与补写用例（`AmendTaskRefs`）；没有第三处。

## 尺寸与拆分 serves: FR-1

- 宿主单文件 ≤400 行（C-02）：`confirm-settle.ts` 现 **439 行**已超线，本次必须**净减**——把 refs 组装与卡级门禁整段搬去 `plan-refs.ts`。
- 新增模块各自承担单一职责，避免再造 400 行以上文件。

## 本次不做 serves: FR-1, FR-6

- 不改看板客户端 UI（补写入口只到工具 + HTTP 路由）。
- 不新增第二种 RTM 事实源（只收敛取数）。
- 不动 v10 分片迁移；不直连队列文件。
- 不回填归档需求。
