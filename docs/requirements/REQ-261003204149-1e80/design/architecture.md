---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 架构设计 · REQ-261003204149-1e80 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 一句话：把"回退"从**改一个 status 字段**升级成**一笔原子事务**——回退方向放行、下游如实作废、
> 旧卡有归宿、注入按新阶段重算，而**前进方向的人工门一道不动**。

## TL;DR <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

回退边早已存在，缺的是三件事：**判定**（哪些转移算回退）、**撤销**（退了以后什么不再作数）、
**处置**（旧任务卡去哪儿）。三者都收敛进既有唯一事实源，不新增子系统、不换存储。

```
  reqboard_move(to=更早节点)  ──►  isRollback(from,to) ?
                                     │ 是
                                     ├─► ① 闸门：跳过"离开已完成节点"的产物门（FR-2）
                                     ├─► ② 撤销：清下游章 + 清计划批准 + 标待同步（FR-3）
                                     ├─► ③ 卡处置：旧卡 canceled + 物化重做卡（FR-4）
                                     └─► ④ 重算：断点 / 边界 / armed 按新阶段（FR-6）
                                            └─► 一笔 mutate 内完成，失败整体回滚
```

## 现状与根因 <!-- serves: FR-1, FR-2 -->

| 缺口 | 现有位置 | 为什么现状会错 |
|---|---|---|
| 产物门只查 `from` | `application/internal/artifact-gates.ts` | 门的语义是"离开一个**已完成**的节点"，回退时 from 恰恰没完成 |
| 回退不撤销 | `application/use-cases/MoveRequirement.ts` | 只改 status + 写评论，章与 `plan.approvedAt` 原样留着 |
| 旧卡孤儿化 | `domain/workflow/DecomposeSpec.ts` + `application/internal/task-completeness.ts` | 判据是"已有未取消任务"，回退后旧卡让重拆被拒、二次实施又跑旧卡 |
| 双通道各写 | `application/use-cases/MoveRequirement.ts` vs `http/routers/requirements.ts` | 两段独立实现，改一处即分叉 |
| agent 被门挡 | `domain/requirement/RequirementStatus.ts` | `implementing>design` 在 `HUMAN_ONLY_REQ_TRANSITIONS` |

## 分层与收敛点 <!-- serves: FR-5 -->

```
  domain（纯函数、零 IO）                       application（用例编排）              adapter
  ─────────────────────────────                ──────────────────────              ───────
  requirement/RollbackSpec.ts   ← 新增          internal/rollback.ts    ← 新增        tools/MoveTool
    isRollback / stagesAfter                      applyRequirementRollback            http/routers/requirements.ts
    PIPELINE_ORDER                              use-cases/MoveRequirement.ts
  requirement/RequirementStatus.ts ← 改          （两侧共用同一用例）
    REQ_TRANSITIONS 生成式合成
    HUMAN_ONLY 去 implementing>design
  workflow/DecomposeSpec.ts     ← 改
    幂等守卫支持回退态重建
```

**唯一事实源纪律**：判定在 domain、撤销与卡处置在 application，工具与看板**都调用同一个用例**；
不得在 `handleReqMove` 里再写一遍。`layer-boundary` 测试机械检查 domain 不 import 外层。

## 回退判定与状态机 <!-- serves: FR-1 -->

新增 `domain/requirement/RollbackSpec.ts`（纯函数，零 IO）：

```ts
export const PIPELINE_ORDER = ['draft','brainstorming','design','decomposing','implementing','accepting','archived'] as const
export function isRollback(from: RequirementStatus, to: RequirementStatus): boolean   // 两者在序中且 index(to) < index(from)
export function stagesAfter(to: RequirementStatus): readonly PipelineStage[]          // 序中晚于 to 的阶段（决定撤销范围）
```

`RequirementStatus.ts` 的转移表改为**生成式合成**，`REQ_TRANSITIONS` 的**导出形状与消费点零改动**：

```
  FORWARD_EDGES（显式，保持既有语义）
      draft→brainstorming · brainstorming→design · design→decomposing
      decomposing→implementing · implementing→accepting · accepting→archived
  BACKWARD_EDGES（由 PIPELINE_ORDER 生成）
      对 draft..accepting 每个 s：允许回到序中**任意更早**阶段   ← FR-1「可退到任何之前的节点」
  TERMINAL（原样保留）
      archived: [] · done: [] · canceled: [draft, archived]
      draft/brainstorming/design/decomposing/implementing/accepting → canceled（既有）
```

**为什么不给 `assertReqTransition` 加"回退旁路"**：那会让"合法转移"变成表 + 旁路两段逻辑，
违反本仓 INV-1（同一条状态机规则全仓只有一处）。生成式合成后，表仍是唯一且静态可读的。

## 闸门策略：回退方向的豁免 <!-- serves: FR-2, FR-3 -->

`assertArtifactGates` 首部增加一条与既有 `to === 'canceled'` 同款的**方向性豁免**：

```ts
if (to === 'canceled') return undefined          // 既有：取消是放弃路径，不是节点推进
if (isRollback(from, to)) return undefined       // 新增：回退同理——from 没做完正是回退的理由
```

**安全责任转移**：出问题的地方从"出门前检查"移到"退回去之后作废"（FR-3）。
前置条件是 FR-3 必须在同一笔 mutate 内执行——否则豁免就变成了闸门缺口。

`HUMAN_ONLY_REQ_TRANSITIONS` 同步调整：

- **移除** `implementing>design`（回退方向上 agent 可自行发起）。
- **保留** `brainstorming>design`、`decomposing>implementing`、`accepting>archived`、`*>canceled`、`canceled>archived`
  —— 它们全在**回程**上，正是"退回去再上来必须重新过门"的保障。

## 撤销语义 <!-- serves: FR-3 -->

新增 `application/internal/rollback-revocation.ts`：

```ts
export interface RollbackRevocation { artifactsRevoked: string[]; planApprovalRevoked: boolean }
export function applyRollbackRevocation(
  req: RequirementRecord, from: RequirementStatus, to: RequirementStatus, now: number, actor: ActorRef, reason?: string,
): RollbackRevocation
```

| 动作 | 判据 | 结果 |
|---|---|---|
| 撤章 | `stagesAfter(to).includes(a.stage)` | `delete confirmedAt / confirmedBy / confirmedVia`（**保留登记**，只撤章） |
| 撤批准 | `to` 早于 `decomposing` | `delete plan.approvedAt / plan.approvedBy` |
| 标待同步 | 有下游产物 | 复用 `applyDocSync(req, source, …)`：source = 被作废的最上游 kind 对应值 |
| 留痕 | 总是 | `req.rollback = { from, to, at, by, reason }` + 一条 `[回退]` 评论列明作废清单 |

**幂等**：重复回退到同一目标不产生重复 `docSyncPending` 条目（`applyDocSync` 本身按 source 去重）。

## 旧卡处置与重做卡 <!-- serves: FR-4 -->

新增 `application/internal/rollback-tasks.ts`：

```ts
export interface RollbackTaskPlan { canceledIds: string[]; reworkDrafts: TaskRecord[] }
export function planRollbackTasks(
  req: RequirementRecord, tasks: readonly TaskRecord[], to: RequirementStatus,
  now: number, actor: ActorRef, ids: IdFactory,
): RollbackTaskPlan
```

- **旧卡**：全部未取消卡 → `status='canceled'`，并 push `revisions[] = { kind:'rollback', reason, changes:['status: …→canceled'] }`（`CardRevision.kind` 已有 `'rollback'`，复用）。
- **重做卡**：为每张旧卡物化一张 `{ title:'[重做] ' + 旧.title, reworkOf: 旧.id, status:'todo', dependsOn: [] }`
  —— 让"这些活要重做"在 DAG 上可见，不被静默丢弃。范式照抄 `application/internal/verdicts.ts` 的验收返工。
- **落库顺序**：任务先写、需求后写（既有 I-11 顺序契约，与 verdicts 同款）。

拆分守卫放宽（`domain/workflow/DecomposeSpec.ts`）：

```ts
export function checkDecomposeIdempotency(
  status: RequirementStatus, existingTasks: readonly ExistingTaskLike[],
  ctx?: { rollbackTo?: RequirementStatus },
): DecomposeVerdict
```

- **回退态判据**：`ctx.rollbackTo === status`（即"当前阶段正是上次回退的目标"）。
- 回退态下放行重建；`reqboard_decompose` 在落库前**先把该需求下所有未取消的重做卡标 canceled**
  （它们被新计划取代），再落新卡 ⇒ 不产生双份。
- **不变量**：非回退态的判据**一字不改**——事故 B（幽灵任务双倍落库）的防线不得削弱。

## 注入与断点重算 <!-- serves: FR-6 -->

| 面 | 处置 |
|---|---|
| 断点 | 回退后调既有 `stampCheckpoint(req, now, 'reqboard_move')`，`pendingAction` 按**新状态**由 `internal/interruption.ts` 重算 |
| 阶段边界 | `domain/stage/StageActions.ts` 的允许集无需改（`reqboard_move` 已覆盖 brainstorming..accepting）；回退后状态必落在其中 |
| dive armed | 回退时 `req.dive.activation = 'disarmed'` 并清 `pausedReason`——自动链不得继续指向旧阶段 |
| 节点输入包 | `internal/node-input-package.ts` 按状态现算，回退后自动取新阶段内容 |

## 兼容与回滚 <!-- serves: FR-1 -->

- **数据兼容**：只**新增可选字段**（`rollback` / `reworkOf`），旧台账读入即合法；无回填、无迁移脚本。
- **代码回滚**：本设计的改动集中在 6 个文件（含 3 个新增），回滚 = 还原这些文件；新增字段被旧代码忽略，不损坏数据。
- **行为兼容**：存量需求（无 `artifacts`）沿用 `isLegacy` 口径；前进方向的门与文案不变。

## 不变量与反例 <!-- serves: FR-3, FR-4 -->

- **不得白送闸门**：回退后凭旧章推进必须被拒（反例：退回 design 后未重新确认就 `design→decomposing` → 应 `artifact_not_confirmed`）。
- **不得削弱事故 B 防线**：非回退态重复 `reqboard_decompose` → 仍应 `REQBOARD_ALREADY_DECOMPOSED`。
- **不得留旧卡在制**：回退后不存在 `in_progress/todo` 的旧卡（重做卡是新 id，不冒充旧卡）。
- **不得两处分叉**：工具侧与看板侧同一 from→to 的结果与错误码逐字一致。
