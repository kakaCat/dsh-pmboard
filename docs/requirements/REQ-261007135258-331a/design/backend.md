---
req: REQ-261007135258-331a
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 后端设计（REQ-261007135258-331a · 确认通道接线收敛）

> 本份写服务端实现细节：入口时序、收尾顺序与守卫、并发幂等、留痕读数、写盘预算、回滚。
> 对应 `sides: [backend]`（本需求无前端改动）。

## 服务端改动面 `serves: FR-1, FR-2`

| 进程面 | 入口 | 改动 |
|---|---|---|
| 工具（会话内） | `reqboard_ask_confirm` → `AskConfirm.settleAnswers` | 不变（已走单点） |
| 工具（会话内） | `reqboard_confirm_artifact` → `ConfirmArtifact` | 推进块改调 `applyConfirmedAdvance` |
| 工具（内部） | `createGatePromptPort` → `applyConfirmDecision` | 不变（已走单点） |
| HTTP（看板） | `POST /req/artifact/confirm` → `handleArtifactConfirm` | 推进块改调单点；推进与"窗口在线"解耦 |
| 后台续跑 | `suspendConfirm` → `settle(answers)` → `applyConfirmDecision` | 不变（已走单点） |

**收敛后每通道只剩三件事**：① 自己的前置门；② 调单点；③ 组装回执。

## 入口时序 `serves: FR-1, FR-4`

**A. 工具路径（`reqboard_ask_confirm`，含超宽限挂起）**

```
注册在途（内存 + 台账停手位）
  → 宽限内作答：settleAnswers → applyConfirmDecision
  → 超宽限：挂起票 + 后台 run → 作答到达 → settle(answers) → applyConfirmDecision
```

**B. 看板 HTTP 路径（改动后）**

```
POST /req/artifact/confirm
  → 设计文档拆分内容门（kind=design 时）
  → 落章（stampArtifactOnce, via:'board'）
  → 窗口在线？ ── 否 ──▶ 仍然推进（FR-4）→ 回执 advanced:true, delivered:false
  → 内容门 / G2 完整性门 ── 拦 ──▶ 回执 advanced:false + gate_failure（落章保留）
  → applyConfirmedAdvance（含收尾）→ 回执 advanced:true
  → 后置链 enqueue（仅在窗口在线且门匹配时）
```

**关键改动**：原实现把 `onlineAgent(windowKey) === undefined` 当作**整个流程的前置**并直接返回
`advanced:false`；改后它只决定"是否投递 + note"，不影响推进。

## 收尾实现细节 `serves: FR-3`

```typescript
// 收尾顺序（固定），每一步都幂等、永不抛
1. exitAwaitingConfirm(awaitingConfirmDepsFrom(deps), { requirementId, ...(ref?{ref}:{}), reason:'answered' })
   ├─ 同步：dialogs.exit(ref)  ← 必须先做：解除"弹框在途"守卫
   ├─ 台账：awaiting-confirm:* → healthy（幂等；非该前缀 → 零动作，INV-3）
   └─ 清位成功 ⇒ onCleared → notifyDrivable（请求一次驱动）
2. applyDiveTransition({store, now}, id, 'confirm-advance', {kind:'human', sessionId}, { stageChanged, status: from })
   ├─ 跨阶段 ⇒ roundsInStage 归零
   ├─ driverHealth.state === 'paused' ⇒ 复位成 healthy（**绝不**改 activation）
   └─ 弹框在途守卫：此刻已在途=false，故写入不被拦（顺序即理由）
3. 后置读数：重新取整条，`awaitingRefOf(fresh) === undefined` ⇒ 报告"无停手位"
```

**读数语义（刻意写清，避免误读）**：

| 结果字段 | 含义 |
|---|---|
| `stopPositionCleared` | **后置条件**：收尾结束时该需求**不处于** `awaiting-confirm:*`。已在更早步骤清过 ⇒ 仍为 `true` |
| `clearedNow` | 本次动作**真的**把停手位从 `awaiting-confirm:*` 清成了 healthy |
| `healthReset` | 收尾后 `driverHealth.state !== 'paused'`（含"本来就是 healthy"） |
| `stageChanged` | 本次是否跨阶段（= `advanced`） |

> 为什么区分两个读数：弹框路径在 settle 开头已带 ref 清位，收尾这一步是**幂等复查**；
> 若只报"这次有没有清"，会把"其实已经清了"报成 `false`（读者会以为停手位还在）。

## 并发与幂等 `serves: FR-1, FR-3`

| 竞争形态 | 保护 | 结果 |
|---|---|---|
| 两条通道同时确认同一 `(需求, 门)` | `mutateIfPresent` 内 `if (req.status !== input.from) return undefined` | 只迁移一次；后者零写入 |
| 重复确认已落章产物 | `stampArtifactOnce` / `stampPlanOnce` 首写即事实 | 章与证据原文不被覆写 |
| 收尾与另一拍心跳对账同时清位 | `exitAwaitingConfirm` 幂等 + 前缀校验 | 一次清位、一次留痕（`c-awaiting-exit-*` 同一 ref 幂等） |
| 收尾的驱动请求 + `requirement-moved` 驱动 | `requestDrive` 自带合并（`state.requested`） | 同拍合成一次起轮，不投两回合 |
| 推进与「弹框在途」并存 | `applyDiveTransition` 的 `DIALOG_GUARDED` 守卫 | 有框在屏幕上时零写入（顺序保证此步之前已 exit） |

## 留痕与可观测 `serves: FR-3, FR-5`

**台账留痕**（供人事后复盘，四通道一致）：

| 留痕 | 何时写 | 内容要点 |
|---|---|---|
| `[自动推进] <from> → <to>：<reason>` | 迁移成功 | `reason` 带通道来源标签（`sourceLabel`），人读可辨 |
| `[Dive 恢复] 等待结束（出口=…，原 ref=…）` | 停手位被清 | `c-awaiting-exit-*`，与 `c-awaiting-enter-*` 配对 |
| `[Dive 停手] 人工门禁弹框在途（ref=…，来源=…）` | 进等待 | 既有，不在本次改动面 |
| `how`（缺口回执） | 门禁拦下 | 必须含 `reqboard_ask_confirm`（@I-5 契约） |

**诊断读数**（回答"为什么没起轮"）：

- `wake-skip-trace` 的 `noteGiveUp(req, status, reason)`：`not-drivable` / `dialog-in-flight` / `human-gate` / `budget`；
- `dive.driverHealth`（`state` / `reason` / `since` / `attempts`）与 `dive.lastWakeAt`；
- 两者合起来可判定："停手位没清"（`reason` 前缀 `awaiting-confirm:`）还是"叫不动"（`wake-undeliverable`）。

## 失败与降级 `serves: FR-3`

| 失败 | 处理 | 不回滚什么 |
|---|---|---|
| `exitAwaitingConfirm` 写台账失败 | `reportWriteFailure`（告警 + 日志），**拦截仍放开** | 推进结果 |
| `applyDiveTransition` 抛错/`apply-failed` | 记 `onError` + warn | 推进结果与已清停手位 |
| 后置读失败 | 结果字段置 `false` + warn | 一切已写事实 |
| 门禁拦下 | 落章保留、推进不执行、回执结构化缺口 | 落章 |

**统一口径**：收尾的任何失败都**不**把已完成的推进"撤回"——推进是事实，收尾是补偿动作。

## 性能与写盘预算 `serves: FR-3`

| 指标 | 改造前（会话通道） | 改造后（四通道一致） |
|---|---|---|
| 一次确认的台账 mutate 次数 | 3~4（清位 / 落章 / 迁移 / 收尾） | 3~4（同量；**不新增**：清位 + 迁移 + 收尾两步） |
| 新增 IO | — | 0（无新文件、无新表；后置读复用一次 `get`） |
| 回合预算 | — | 0 增量（收尾不投消息；驱动走既有 requestDrive 合并） |

**不做**的事：不把三次 mutate 合并成一次大事务——各自独立能在失败时保留"已完成的那部分"，
这是既有纪律（落盘保留、推进可拦），合并会把可恢复失败变成全有全无。

## 灰度、回滚与回归 `serves: FR-4, FR-6`

- **灰度**：不新增开关。接线收敛不改变判定语义；观察面 = `[Dive 恢复]` 留痕数 + `driverHealth` 读数。
- **回滚**：`git revert` 纯代码回滚；无 schema 变更、无数据迁移（见 `data-model.md`）。
- **回归**：`pnpm test && pnpm typecheck` 全绿；两条静态 grep（内联推进 / 旧指路文案）无输出；
  新增 `tests/confirm-channel-parity.test.ts` 与 `tests/confirm-advance-finish.test.ts` 覆盖 FR-6 与 FR-3。
- **人工验收面**：看板确认一次 → 状态推进且**无需人再发消息**即出现一次自动回合。
