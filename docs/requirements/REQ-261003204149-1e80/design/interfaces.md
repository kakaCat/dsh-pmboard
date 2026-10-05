---
serves: FR-1, FR-2, FR-5
---

# 接口设计 · REQ-261003204149-1e80 <!-- serves: FR-1, FR-2, FR-5 -->

> 一句话：`reqboard_move` 的**入参不变**，回退时返回体多一个 `rollback` 对象如实交代"作废了什么"；
> 该对象**必须**同步声明进 `output.schema`（本仓当天已两次因漏声明而把成功变成报错）。

## TL;DR <!-- serves: FR-1, FR-5 -->

不新增工具、不改工具名、不改入参。变化只有两处：**回退不再被 `REQBOARD_HUMAN_GATE` 拒**，
以及**返回体多一个 `rollback` 块**。看板侧复用同一用例，返回同形。

## 外部接口 · `reqboard_move` <!-- serves: FR-1, FR-2 -->

**入参（不变）**

```ts
{
  requirement_id?: string   // 缺省 = 本窗口绑定需求
  to: RequirementStatus     // 目标阶段；早于当前阶段即回退
  reason?: string           // ≤500 字符；回退时强烈建议写清"为什么退"
}
```

**返回体（新增 `rollback`，其余字段不变）**

```ts
{
  success: true
  requirement_id: string
  from: RequirementStatus
  to: RequirementStatus
  status: RequirementStatus        // 回退后 = to
  rollback?: {                     // ★ 仅回退方向出现；前进方向**整体省略**
    artifacts_revoked: string[]    // 被撤章的产物 path（空数组 = 无下游产物）
    plan_approval_revoked: boolean // 是否清掉了 plan.approvedAt
    tasks_canceled: number         // 被标 canceled 的旧卡数
    tasks_reworked: number         // 物化的重做卡数
  }
}
```

⚠️ **纪律（非可选）**：`rollback` 及其四个子键必须**逐字声明**进 `tools/MoveTool` 的
`output.schema`（含 `additionalProperties: false` 与子对象自己的声明）。
本仓 2026-10-03 当天已因两处同类漂移（`capture` 的 `answers.workspace`、`submit` 的 `auto_confirm`）
把"值算出来了、副作用也发生了"的成功调用变成一条 `invalid output`；
本设计的返回体**新增嵌套对象**，是同类风险的高发形状，必须在实现阶段一并补
`tests/output-contract.test.ts` 的动态用例（该防线的递归校验能走进嵌套对象）。

**错误语义（回退方向）**

| 情形 | 结果 |
|---|---|
| `to` 早于当前阶段 | **放行**（agent 可自行发起；不再 `REQBOARD_HUMAN_GATE`） |
| `to` 等于当前阶段 | 幂等：不改状态，`rollback` 整体省略，`success: true` |
| `to` 晚于当前阶段 | 走既有前进路径：该要的产物门 / 人工门 / 任务完整性**照旧拦** |
| `to = 'canceled'` | 仅人可操作（既有 `human_gate`，本需求不动） |
| `to ∈ {archived, done}` | `invalid_transition`（终点无出边，本需求不动） |
| 回退目标越界（不在流水线序中） | `invalid_transition` |

**事务性**：状态、撤销、卡处置、断点写在**同一笔 mutate** 内；任一步抛错 → 整体回滚，
不出现"状态退了但章没撤"或"卡取消了但状态没退"的中间态（与 verdicts 的原子性契约同款）。

## 看板侧接口 <!-- serves: FR-5 -->

`POST /requirements/move`（`http/routers/requirements.ts` 的 `handleReqMove`）：

- **改为调用与 `reqboard_move` 相同的回退编排**，不再自写一段。
- 请求体与响应体形状**不变**（仍 `{ id, to, reason, actor, sessionId? }`）；
  回退时响应体同样带 `rollback` 块。
- `actor` 语义不变：看板侧为 `human`，工具侧为 `agent`——审计留痕各自如实，**行为一致**。

## 内部接口（新增 / 改动签名） <!-- serves: FR-1, FR-2, FR-5 -->

```ts
// 新增 · domain/requirement/RollbackSpec.ts（纯函数，零 IO）
export const PIPELINE_ORDER: readonly PipelineStage[]
export function isRollback(from: RequirementStatus, to: RequirementStatus): boolean
export function stagesAfter(to: RequirementStatus): readonly PipelineStage[]

// 新增 · application/internal/rollback-revocation.ts
export function applyRollbackRevocation(
  req: RequirementRecord, from: RequirementStatus, to: RequirementStatus,
  now: number, actor: ActorRef, reason?: string,
): { artifactsRevoked: string[]; planApprovalRevoked: boolean }

// 新增 · application/internal/rollback-tasks.ts
export function planRollbackTasks(
  req: RequirementRecord, tasks: readonly TaskRecord[], to: RequirementStatus,
  now: number, actor: ActorRef, ids: IdFactory,
): { canceledIds: string[]; reworkDrafts: TaskRecord[] }

// 新增 · application/internal/rollback.ts（编排：供工具侧与看板侧共用）
export function applyRequirementRollback(
  req: RequirementRecord, tasks: readonly TaskRecord[], to: RequirementStatus,
  now: number, actor: ActorRef, reason: string | undefined, ids: IdFactory,
): { revocation: RollbackRevocation; taskPlan: RollbackTaskPlan }

// 改动 · domain/requirement/RequirementStatus.ts
export const REQ_TRANSITIONS            // 形状不变；由 FORWARD + BACKWARD 合成
export const HUMAN_ONLY_REQ_TRANSITIONS // 移除 'implementing>design'

// 改动 · application/internal/artifact-gates.ts
export function assertArtifactGates(req, from, to): GateFailure | undefined
//   新增首部豁免：if (isRollback(from, to)) return undefined

// 改动 · domain/workflow/DecomposeSpec.ts
export function checkDecomposeIdempotency(
  status: RequirementStatus, existingTasks: readonly ExistingTaskLike[],
  ctx?: { rollbackTo?: RequirementStatus },
): DecomposeVerdict

// 改动 · tools/MoveTool（仅 schema + 回执透传）与 application/use-cases/MoveRequirement.ts（编排调用）
```

**不含**：不新增工具、不改 `reqboard_move` 的工具名与入参、不改 `StageActions` 的允许集、
不改 `GateCatalog` 的门数量。

## 契约一致性检查（实现阶段的硬要求） <!-- serves: FR-1, FR-5 -->

1. `rollback` 的**每个键**都被 `output.schema` 声明（A/B：删掉声明后
   `tests/output-contract.test.ts` 回退用例必须变红）。
2. 工具侧与看板侧**同一 from→to** 的返回体结构一致（同一用例保证，测试用两入口对拍）。
3. 前进方向调用**不出现** `rollback` 键（整体省略，不是发 `null`/`undefined`）。
4. 回退后 `status === to` 且 `rollback.to === to`（台账自洽）。
