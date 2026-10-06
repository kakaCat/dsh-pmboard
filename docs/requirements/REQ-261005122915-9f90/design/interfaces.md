---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 接口设计（REQ-261005122915-9f90）

> 需求源：`requirement.md`（FR-1~FR-5）。本份只定接口形态，数据契约在 `data-model.md`。

## 服务端接口（协议不变的那一个） `serves: FR-5`

`POST /dashboard/api/reqboard/req/rollback-cleanup` —— **请求/响应逐字不变**（本次只补客户端接线）：

```typescript
// 请求
interface RollbackCleanupBody {
  id: string           // REQ-xxxxxx
  rollbackSeq: number  // 必填正整数（第几次回退）；缺省/非法 → invalid_input
  reason?: string      // ≤300 字，进需求评论留痕
}

// 响应（既有形状，逐字沿用）
interface RollbackCleanupResult {
  id: string
  rollbackSeq: number
  canceled: number        // 本次真正取消的卡数
  restoredLinks: number   // 父子关系还原条数
  matchedBy: 'lastMaterialized' | 'reworkOf+title-prefix'
  skipped: { taskId: string; reason: string }[]
  note: string            // 匹配方式的人话说明
}
```

**不做**：不新增 query/body 字段，不改「仅人」纪律（agent 面无此工具，`routes.ts` 不注册 agent 入口）。

## 客户端新增调用 `serves: FR-5`

```typescript
// src/client/api.ts（新增；与 moveReq/approvePlan 同款 post 助手）
export function rollbackCleanup(input: {
  id: string
  rollbackSeq: number
  reason?: string
}): Promise<RollbackCleanupResult>   // POST BASE + '/req/rollback-cleanup'
```

按钮数据契约（DOM → 事件通道）：

```typescript
// src/client/views/stage-detail.ts renderActionBar 追加的按钮
// 渲染条件：req.rollback !== undefined（无回退记录 → 不渲染，不给假按钮）
interface RollbackCleanupButton {
  'data-action': 'rollback-cleanup'
  'data-id': string          // req.id
  'data-seq': string         // String(req.rollback.seq ?? 1)
}
```

## 内部函数签名（新增/变更） `serves: FR-1, FR-2, FR-3, FR-4`

```typescript
// ① src/domain/task/ReworkPlaceholder.ts（新增，纯函数，零外部依赖）
/** 占位重做卡：reworkOf 非空 = 回退为「这些活要重做」留的占位，不是已落库的活。 */
export function isReworkPlaceholder(t: { reworkOf?: string }): boolean
/** 活卡里的**真卡**（未取消且非占位）——幂等与推进判据的唯一取数口径。 */
export function liveRealCards<T extends { status: string; reworkOf?: string }>(tasks: readonly T[]): T[]

// ② src/application/internal/stale-rework.ts（新增；取代 Decompose.ts 的内联块）
export interface CancelStaleReworkInput {
  taskStore: Pick<TaskStore, 'mutate'>
  requirementId: string
  nowTs: number
  actor: ActorRef
  reason?: string     // 缺省 '重新拆分：该重做卡已被新计划取代'
}
/** 把上一轮回退物化的活占位卡一次性置 canceled（无候选 → 不写盘，幂等）。 */
export function cancelStaleReworkCards(input: CancelStaleReworkInput): Promise<{ canceled: number }>

// ③ src/application/internal/approved-plan-landing.ts（改）
interface LandApprovedPlanResult {
  created: LandedTaskRef[]
  createdCount: number
  /** 语义收窄（FR-1）：只计**真卡**——占位卡不再计入。 */
  alreadyLanded: number
  /** 本次顺带收掉的上一轮占位卡数（新增，可观测）。 */
  staleReworkCanceled: number
  // …其余字段不变
}
```

`landApprovedPlan` 的判定顺序（**唯一改动点，顺序即语义**）：

1. 计划已批准校验、FR 覆盖硬门、取数（不变）；
2. `rollbackTo !== undefined` → 先 `cancelStaleReworkCards`（FR-2）；
3. `checkDecomposeIdempotency(fresh.status, liveRealCards(tasks), { rollbackTo })`：
   `ok === false` → 返回 `alreadyLanded = liveRealCards.length`、`created: []`（**真幂等**）；
   `ok === true` → 落库（FR-1）。

## 错误语义 `serves: FR-3, FR-5`

| 场景 | 码 / 表现 | 谁承担 |
|---|---|---|
| 落库确实没发生（真卡 0 张） | 需求**留在 decomposing**；系统评论（原因 + 恢复路径）+ `advance.pausedReason` + 告警 | `confirm-settle` / `handlePlanDecision`（FR-3） |
| 清场序号不存在 | `REQBOARD_UNKNOWN_ROLLBACK_SEQ` | 既有服务端，客户端原样 `alert` 透出 |
| 清场目标需求不存在 | `REQBOARD_NOT_FOUND` | 同上 |
| 清场缺 `rollbackSeq` | `invalid_input` | 客户端按钮恒带 `data-seq`，正常路径不会触发 |
| 无回退记录时点清场 | 按钮**不渲染**（不是「点了报错」） | `stage-detail.ts`（FR-5） |
