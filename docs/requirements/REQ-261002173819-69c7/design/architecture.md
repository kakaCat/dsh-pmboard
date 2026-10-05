---
serves: FR-1, FR-2, FR-3, FR-4
---

# 架构设计（自动化断链的收口） serves: FR-1, FR-2, FR-3, FR-4

> 本文只讲**怎么改**：改哪几个模块、根因是什么、失败路径长什么样。字段与签名分别见 `data-model.md` / `interfaces.md`。
> 轻档：每节三行起，够用即止；不写拆分计划（那是 decomposing 的事）。

## 改动点总览 serves: FR-1, FR-2, FR-3, FR-4

四个改动点彼此独立，可分别验证；共同点是**都只补既有语义，不新增子系统**。

| # | 文件 | 改动 | 服务 |
|---|------|------|------|
| C1 | `src/application/use-cases/AdvanceChain.ts` | 投递失败 → 回收 `advance.lockAt/runId` + 留痕 | FR-1 |
| C2 | `src/application/use-cases/AdvanceChain.ts` + `src/application/ports.ts` | `owner` 传 **agent id**（string），取不到则降级同步推进 | FR-2 |
| C3 | `src/application/internal/rearm.ts` + `src/http/routers/requirements.ts` | 新增「人显式重新武装」路径，看板「继续」接上它 | FR-3 |
| C4 | `src/tools/ClearPauseTool/ClearPauseTool.ts` + `src/tools/render-summaries.ts` | 补 `output.render`（与其余工具同源） | FR-4 |

依赖方向不变：`tools/*` → `application/use-cases` → `application/internal` → `ports`；`http/routers` 只调应用层，不反向依赖 adapters。

## 宿主 owner 契约（FR-2 的根因，已读源码确认） serves: FR-2

DSH 的 `ctx.jobs.start({ owner })` 里，`owner` 是 **session/agent 的 id 字符串**，不是 agent 对象。宿主实现（`@deepseek-ai/dsh-jobs-local` `resolveOwner`）：

```js
resolveOwner(session) {
  if (session === void 0) return void 0;                      // 不传 = unowned，允许
  const owner = agents.get(session);                          // agents.get(id) 只认字符串 id
  if (owner === void 0) throw new Error(`session "${session}" has no live agent …`);
  return owner;
}
```

`@deepseek-ai/dsh-agent` 的注册表签名也写明：`get(id)` 的 `id` 是 "the shared agent/session id"。

而本仓传的是 **agent 对象**（`AdvanceChain.ts:517` 的 `owner: exec.agent`）→ `agents.get(<object>)` → `undefined` → 抛错，错误文本里对象被插值成 `"[object Object]"`。这解释了实测文案 `session "[object Object]" has no live agent`。

**所以 FR-2 是一处口径错位，不是环境问题**：投递从来没有成功过（`REQ-261002161439-277d` 的 `advance.history` 长度为 0 即为证）。

**实测调用链**（可复核）：`reqboard_ask_confirm`（工具，exec = 真 agent 对象）→ `suspendConfirm` 捕获该 exec → 人在弹框作答后**后台续跑** `settleAnswers(deps, exec, …)` → `applyConfirmDecision` → `advanceRequirement(deps, reqId, exec)` → `owner: exec.agent`（对象）→ 抛错。会话此时仍然 live，**唯一的问题就是传了对象而不是 id**。

## 投递失败路径（C1 + C2） serves: FR-1, FR-2

```
  advanceRequirement(reqId, exec)
    │
    ├─ 前置：autoRun / 终态 / 新鲜锁 → 早退（不变）
    │
    ├─ ownerId = dispatchOwnerOf(exec)      // exec.agent.id ?? exec.agent.session.id（字符串）
    │     ├─ 取到 id  → owner = ownerId（DSH 的 resolveOwner 用 agents.get(id) 解析 → 通过）
    │     └─ 取不到   → owner = undefined = **unowned 投递**（DSH 明文允许：resolveOwner(undefined) → undefined）
    │                   并在留痕里标注 owner_missing；仅当宿主连 unowned 也不收时才落进失败分支
    ├─ 认领：advance.lockAt = now, advance.runId = run-xxx          （不变）
    │
    ├─ 投递 jobs.start({ kind, label, owner, run })
    │     │
    │     ├─ 成功 → 立即返回 { dispatched:true, job_id, run_id }     （不变）
    │     │
    │     └─ 失败 → releaseClaim(runId, kind, message)               ← 本次新增
    │                ① 仅当 advance.runId === 本次 runId 才清 lockAt/runId（不误清别人的锁）
    │                ② advance.history += { event:'DISPATCH_FAILED', outcome:'failed', detail }
    │                ③ comment += 可读失败记录（含 requirementId、kind、原始 message）
    │                ④ 返回 { dispatched:false, stopped:'dispatch_failed', reason }
    ▼
```

失败分类只按消息做一次判定：命中 `has no live agent` → `owner_unresolvable`；其余 → `dispatch_failed`。

**为什么先回收锁、再返回**：锁是"有 run 在跑"的唯一凭据；投递失败时没有 run，留着它就是把自己锁死（实测被挡 15 分钟 = `LIMITS.advanceLockStaleMs`）。

## 设计阶段对需求 FR-2 的一处修正（附证据） serves: FR-2

需求文档写的是"owner 不可解析时降级为同步推进"。读到宿主源码后发现这个前提不成立：

```
resolveOwner(session) {
  if (session === void 0) return void 0;      // ← owner 缺省 = unowned job，宿主**允许**，不是失败
  …
}
servesOwner(owner) { if (!this.layers.global.controllers.isEmpty()) return true; … }
```

即：`owner: undefined` 会作为 **unowned job** 正常启动（桌面宿主有全局控制器 → `servesOwner(undefined)` 为真）；把它降级成同步推进，等于把一个本来能异步跑的链变成阻塞调用，是**倒退**。

**修正后的设计**：

| 情形 | 行为 |
|------|------|
| `exec.agent.id` 可取（工具路径、settle 后台路径） | 传 id 投递（**修复点**） |
| 取不到 id（如 `applyConfirmDecision(uc, {}, …)` 的 drive 门路径） | 传 `owner: undefined`，**照常投递**（unowned），留痕标 `owner_missing` |
| `deps.jobs` 未装配 | 走既有同步兼容路径（不变）；这是唯一保留"同步推进"的分支 |

需求 FR-2 的**意图**（不静默空转、失败可诊断）不变，只是"降级目标"从"同步推进"改成"unowned 投递"——后者既保住了异步性，又不需要宿主额外能力。此修正需在本次设计确认门一并裁定。

**为什么先回收锁、再返回**：锁是"有 run 在跑"的唯一凭据；投递失败时没有 run，留着它就是把自己锁死（实测被挡 15 分钟 = `LIMITS.advanceLockStaleMs`）。

## 人工重新武装路径（C3） serves: FR-3

两条恢复路径**分家**，这是本次最关键的一条纪律：

| 路径 | 触发者 | 覆盖形态 | 是否本次新增 |
|------|--------|----------|--------------|
| `rearmIfRecoverable`（既有） | 自动（`requirement-moved`、心跳后置） | `driverHealth=paused`、`disarmed+active`（误停摆） | 不改 |
| `armExplicit`（新增） | **人**：看板「继续」`POST /req/autorun` `on:true` | 上面两种 ∪ `disarmed+idle`（人主动 clear_pause） | 新增 |

```
  看板「继续」(on:true)
    │
    ├─ 置 autoRun=true、清 advance.pausedReason/noopStreak/failureStreak   （不变）
    │
    ├─ armExplicit(id, 'board-resume')                                     ← 本次替换原 rearmIfRecoverable 调用
    │     ├─ 已 armed 且 driverHealth 非 paused → 零写入（幂等）
    │     ├─ driverHealth=paused → healthy + attempts=0；reason=round-limit:* 时 roundsInStage=0
    │     ├─ disarmed+active     → armed（误停摆）
    │     ├─ disarmed+idle       → armed + phase=active               ← 新增能力
    │     └─ 任一分支生效即写 comment：「[Dive 重新武装] 人显式要继续（trigger=board-resume）」
    │
    └─ 触发一次 advance(id)（既有）
          │
          └─ Dive 侧：心跳每 60s 一拍，armed 且 lastWakeAt 超过 10min → 叫醒 → 起轮
```

**为什么不由自动路径补 `disarmed+idle`**：`clear_pause` 与"人主动关掉自动化"在台账上同形，自动改写会把人的意图改掉。人点「继续」是**显式**表达，只有这条路径可以改。

## 工具输出渲染（C4） serves: FR-4

`defineTool` 的 `output.render` 缺失时，宿主渲染该工具输出会抛 `userRender is not a function`，把**已生效**的副作用报成 `INVALID_TOOL_OUTPUT`。

- 全仓 20+ 工具都写 `render: renderSmart(<summary>)`，`clearPause` 与委托别名 `task_execute` 是仅有的两个例外；
- `task_execute` 通过 `Object.assign({}, defineAdvanceTool(deps), {name})` **继承**了 render，运行时无缺口；
- 因此真实缺口只有 `ClearPauseTool` 一处：补 `renderSmart(clearPauseSummary)`，并把 `clearPauseSummary` 加进 `src/tools/render-summaries.ts`（那里是所有摘要的唯一来源）。

## 迁移与回滚 serves: FR-1, FR-2, FR-3, FR-4

| 项 | 处置 |
|---|---|
| 台账数据 | **零迁移**：不新增字段、不改枚举取值（只新增一个 history 事件值，旧记录不受影响） |
| 存量 `disarmed+idle` 需求 | 不自动改写；人点一次「继续」即接回（`REQ-261002161439-277d` 就是第一例） |
| 存量残留锁 | 已有 `advance-stale-reclaim` 兜底；本次让**新**失败不再产生残留 |
| 回滚 | C1/C2 只影响失败路径；C3 去掉看板那一行调用即回到现状；C4 回滚会重现假报错 |
| 开关/灰度 | 不需要：改动都在错误路径与显式人工入口上，正常路径逐字不变 |

## 不做什么 serves: FR-3

- 不改 `rearmIfRecoverable` 的判据（自动路径的"人的意图不可改"纪律不动）；
- 不新增 agent 侧"武装"工具（agent 不得改人的意图；人走看板）；
- 不改 `JobsPort` 的形状与 DSH 宿主契约，只改本仓传参口径；
- 不动 Dive 状态机、心跳阈值、任务链的选择逻辑。
