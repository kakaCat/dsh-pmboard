---
serves: FR-1, FR-2, FR-3
---

# 数据模型（只加一个事件值，不加字段） serves: FR-1, FR-2, FR-3

> 结论先行：**零字段新增、零迁移**。本需求只给 `advance.history[].event` 增加一个枚举值，并把 `JobsPort` 的 `owner` 类型从 `unknown` 收紧为 `string`。

## 台账字段（复用既有，不新增） serves: FR-1, FR-2, FR-3

| 字段 | 类型 | 本次是否变更 | 用途（本需求） |
|------|------|--------------|----------------|
| `advance.lockAt` | number? | 语义不变，**写入时机修正** | 单飞锁；投递失败时必须清掉（FR-1） |
| `advance.runId` | string? | 同上 | 锁的归属凭据；只有 `runId` 相符才允许清（FR-1） |
| `advance.history[]` | AdvanceRecord[] | **event 枚举 +1 值** | 投递失败留下可复盘的一条（FR-1 / FR-2） |
| `advance.pausedReason` | string? | 不变 | 人点「继续」时清空（既有行为） |
| `dive.activation` | `'armed' \| 'disarmed'` | 取值不变 | 人的意图；`armExplicit` 可写（FR-3） |
| `dive.phase` | `'active' \| 'idle' \| 'paused'`（读侧兼容旧记录） | 取值不变 | `idle` = 人主动解武装；`armExplicit` 置回 `active`（FR-3） |
| `dive.driverHealth` | `{state, reason?, since, attempts}` | 不变 | 运行时健康；`paused` 由 `armExplicit` 清回 `healthy`（FR-3） |
| `dive.roundsInStage` | number | 不变 | `reason=round-limit:*` 时由 `armExplicit` 归零（额度还给本阶段） |
| `comments[]` | CommentRecord[] | 不变 | 失败留痕 / 重新武装留痕都走这里（追加，不改写历史） |

`RequirementRecord` 与 `schemaVersion` 均不改；旧台账（含 `REQ-261002161439-277d` 的 `disarmed+idle`）无需迁移即可被新代码读取。

## 状态语义（谁可以写哪个字段） serves: FR-3

| 形态 | 含义 | 谁可以改 | 自动路径是否恢复 |
|------|------|----------|------------------|
| `armed` + healthy | 自动跑 | 人 / 驱动侧 | — |
| `armed` + paused | 停下等人（投递失败、达上限…） | 人 / 驱动侧 | ✅ `rearmIfRecoverable` |
| `disarmed` + `active` | 误停摆（基础设施故障） | 自动可救 | ✅ `rearmIfRecoverable` |
| `disarmed` + `idle` | **人主动要手动跑**（`clear_pause`） | **只有人** | ❌ 自动永不改写；仅 `armExplicit` |

新增的一条不变量：

- **I-A：`disarmed+idle` 的唤醒权只属于人。** 判定器不复用 `driverHealth`（那是运行时健康，不是意图），只认 `activation+phase` 组合；任何自动路径（心跳、需求移动、阶段推进）都不得把这一形态改成 `armed`。

## `advance.history` 的事件枚举扩展 serves: FR-1, FR-2

```ts
// src/shared/protocol.ts:941
export type AdvanceEvent =
  | 'OPEN_PARENT' | 'RUN_SUBTASK' | 'FINALIZE_PARENT' | 'ROLLUP' | 'RETRY' | 'PAUSE'
  | 'DISPATCH_FAILED'          // ← 本次新增：投递后台任务失败（无 run 在跑）
```

写入形状（复用既有 `AdvanceRecord`，不新增字段）：

| 字段 | 取值 |
|------|------|
| `event` | `'DISPATCH_FAILED'` |
| `outcome` | `'failed'` |
| `detail` | `'<kind>: <原始 message>'`，`kind ∈ {owner_unresolvable, dispatch_failed}` |
| `durationMs` | `0`（投递是同步返回，没有可计的执行时长） |
| `parentId` / `subtaskId` | 省略（投递阶段还不知道派给哪张卡） |

**为什么要新值而不是复用 `PAUSE`**：`PAUSE` 的语义是"链已暂停、`autoRun` 置 false"（`AdvanceChain` 的 `pauseRequirement` 会写 `autoRun=false`）；投递失败**没有**暂停链，`autoRun` 保持 true，重试应当立刻可行。复用会让人在台账上看到"链已暂停"的假象。

**兼容性**：`AdvanceEvent` 的消费方目前只有本文件的类型与看板通用渲染（`grep` 全仓无按值分支的消费点），新增值不改变既有分支；旧记录里的六个值语义逐字不变。

## 失败留痕的 comment 形状 serves: FR-1, FR-2

与既有系统留痕同形（不改 `CommentRecord`）：

| 字段 | 取值 |
|------|------|
| `id` | `'c-advance-dispatch-failed-' + now` |
| `body` | `[自动链投递失败] REQ-xxxxxx 未能投递后台任务（原因：<kind>）。锁已回收，可直接重试 reqboard_task_run。原始错误：<message>` |
| `createdBy.kind` | `'system'` |

正文**必须**含 `requirementId` 与 `kind`，且**不得**出现 `[object Object]`（A2 断言的就是这条）。

## 重新武装的 comment 形状 serves: FR-3

| 字段 | 取值 |
|------|------|
| `id` | `'c-dive-rearm-explicit-' + now` |
| `body` | `[Dive 重新武装] 人显式要继续（trigger=board-resume）：activation <旧值> → armed；phase <旧值> → active` |
| `createdBy.kind` | `'human'`（**必须**是人：agent 侧没有这条入口） |

与既有 `[Dive 自动恢复]` 留痕区分开，事后复盘能一眼看出是"人接回的"还是"自动救回的"。
