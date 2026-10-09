# 接口（REQ-261007193530-3133）

> 视角：本批修改到/新增的每一个接口（函数签名、参数、返回、错误码），以及与 HTTP 面的请求响应契约。
> 契约在此定死；拆分与实施按此对照。

## 内部函数接口 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

### `roleOfTask`（新增导出 · FR-2） <!-- serves: FR-2 -->

```ts
// src/application/internal/task-transition.ts
export function roleOfTask(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole  // 'subtask' | 'parent' | 'legacy'
```

- 语义：`task.parentId` 非空串 → `'subtask'`；`tasks.some(t => t.parentId === task.id)` → `'parent'`；否则 `'legacy'`。
- 与 `MoveTask.ts` 内部 `roleOf` **同口径**（本批把它提取为可复用单源；`MoveTask` 内那份是否改为委托本助手为允许项、非必须项）。
- 纯函数，无副作用、无 I/O。

### `transitionTask`（调用点变化 · FR-2） <!-- serves: FR-2 -->

```ts
transitionTask(task: TaskRecord, to: TaskStatus, opts: {
  at: number; actor: ActorRef; reason?: string;
  role?: TaskRole           // ← 本批 HTTP 调用方开始显式传入；缺省仍为 'legacy'（既有行为不变）
  allowIllegalTransition?: boolean
}): void
```

- 错误：非法转移抛 `{ code: 'invalid_transition' }`；人工门抛 `{ code: 'human_gate' }`；`system` 越权抛 `{ code: 'system_gate' }`。
- 失败时**字段零改动**（本批回归用例断言 `status`/`version`/`statusHistory`）。

### `assertReqTransition`（集合内容变化 · FR-3） <!-- serves: FR-3 -->

```ts
assertReqTransition(from: RequirementStatus, to: RequirementStatus, actor: ActorKind): void
```

- 本批变化：`HUMAN_ONLY_REQ_TRANSITIONS` 增加 `'canceled>draft'`。
- 调用契约不变：`'canceled' → 'draft'` 且 `actor !== 'human'` → 抛 `{ code: 'human_gate' }`（`system` 亦拒）。
- 派生面：`agentNextActions('canceled')` 自动不再含 `'draft'`（同集合过滤，无手改）。

### `doneThrottleRemainingMs`（返回契约收紧 · FR-4） <!-- serves: FR-4 -->

```ts
doneThrottleRemainingMs(
  tasks: readonly TaskWithHistory[], taskId: string, requirementId: string, now: number, throttleMs: number
): number   // 返回契约：恒 ∈ [0, throttleMs]
```

- 本批变化：单条读数 `left` 由 `throttleMs - (now - h.at)` 改为 `Math.max(0, Math.min(throttleMs, throttleMs - (now - h.at)))`。
- 正常历史（`h.at` 在过去）读数逐值不变（回归锚点：-10s → 50000）。

### 弹框否定回执（形状契约 · FR-1） <!-- serves: FR-1 -->

```ts
// AskConfirm 弹框路径，非肯定作答分支
{
  success: true; confirmed: false; advanced: false;
  user_choice: string;
  user_feedback?: string      // ← 仅当反馈非空时存在；无反馈时**键缺席**（不写 undefined）
  note: string;
}
```

- 理由：dsh-tools `snapshotJsonValue` 对 `undefined` 值抛 `"value is not lossless JSON"` 硬错误。
- 肯定分支/pending 分支/`fallback=board` 分支形状不变。

## HTTP 接口 <!-- serves: FR-2 -->

```
POST /dashboard/api/reqboard/task/move
body: { id: string, to: TaskStatus, actor?: 'human'|'agent'|'system' (default 'human'), reason?: string, session?: string }
```

| 场景 | 状态码 | 响应 |
|------|--------|------|
| 合法转移（含子卡 `in_progress → done`、存量卡 `in_progress → integrating`） | 200 | `{ success: true, ...movedTask }` |
| 子卡/父卡目标态非法（`integrating` / `testing` / `in_review`） | 400 | `{ success: false, code: 'invalid_transition', error }` |
| 任务不存在 | 404 | not found 信封 |

- 本批变化：处理函数按 `roleOfTask` 派生角色传入收敛点（此前缺省 `legacy`，子卡可被推进非法态）。
- **未覆盖面**：`actor` 仍取自请求体且无鉴权（H2 另一半，另立项）。

## 工具接口 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

本批**不改任何工具 schema 与 prompt**（reqboard_move / reqboard_task_move / reqboard_ask_confirm 的入参出参形状逐字不变）；
变化的只是运行时行为：新增一种被拒情形（FR-2 子卡非法态、FR-3 复活边）、修正一种读数（FR-4）、修正一种回执形状（FR-1）。
