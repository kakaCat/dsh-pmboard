---
serves: FR-1, FR-2, FR-3, FR-4
---

# 用例设计（四条主线 + 一条反向） serves: FR-1, FR-2, FR-3, FR-4

> 全部场景取自 2026-10-02 `REQ-261002161439-277d` 的真实事故现场；每条用例末尾给出「改动前 / 改动后」的可观测差异。

## 场景总览 serves: FR-1, FR-2, FR-3, FR-4

| 用例 | 角色 | 触发 | 覆盖 |
|------|------|------|------|
| UC-1 人把停摆的需求接回自动化 | 需求负责人（看板） | 点「继续」 | FR-3 |
| UC-2 agent 投递失败后拿到可读原因并立刻重试 | 窗口 agent | `reqboard_task_run` | FR-1、FR-2 |
| UC-3 后台确认不再因 owner 口径投递失败 | 系统（settle 后台续跑） | 人在弹框作答 | FR-2 |
| UC-4 agent 解死锁不再拿到假报错 | 窗口 agent | `reqboard_clear_pause` | FR-4 |
| UC-X（反向）自动路径不得偷偷打开人的手动模式 | 系统 | 心跳 / 需求移动 | FR-3 |

## UC-1 人把停摆的需求接回自动化 serves: FR-3

**前置**：需求 `activation=disarmed, phase=idle`（agent 曾用 `clear_pause` 解死锁），还有未完成任务卡。

```
  人               看板              req/autorun 路由           台账                Dive
  │  点「继续」 ───►│                      │                    │                    │
  │                 │ POST {on:true} ─────►│                    │                    │
  │                 │                      │ autoRun=true ─────►│                    │
  │                 │                      │ armExplicit() ────►│ armed + active     │
  │                 │                      │                    │ comment[human]     │
  │                 │                      │ advance(id) ──┐     │                    │
  │                 │◄── advanceNote ◄─────┤              │     │                    │
  │                 │  「已重新武装」       │              ▼     │                    │
  │                 │                      │        链投递任务卡 │                    │
  │                 │                      │                    │ ◄── 心跳（≤60s）───┤
  │                 │                      │                    │   起轮 round+1 ───►│
```

| 观测点 | 改动前 | 改动后 |
|--------|--------|--------|
| 点「继续」后的 `dive.activation` | 仍是 `disarmed`（`rearmIfRecoverable` 拒绝 `idle`） | `armed` + `phase=active` |
| 是否留痕 | 只有 `[自动链] 人已继续` | 多一条 `[Dive 重新武装] 人显式要继续（trigger=board-resume）` |
| 60 秒内是否起轮 | 永不 | `dive.roundsInStage` +1（心跳叫醒） |
| 人的其它意图 | — | `on:false` 行为逐字不变；自动路径仍不改 `disarmed+idle` |

## UC-2 agent 投递失败后拿到可读原因并立刻重试 serves: FR-1, FR-2

**前置**：`autoRun=true`、有 ready 卡，但宿主拒收 owner（或任何投递异常）。

```
  agent                      AdvanceChain                     台账                  宿主 jobs
    │ reqboard_task_run ────►│                                 │                       │
    │                        │ 认领 lockAt/runId ─────────────►│                       │
    │                        │ jobs.start({owner: agent.id}) ──────────────────────►│ ✗ 抛错
    │                        │◄────────────────────────────────────────────────────────│
    │                        │ releaseClaim：清锁 + history + comment ─►│              │
    │◄─ {dispatched:false,   │                                 │                       │
    │    stopped:'dispatch_failed',                            │                       │
    │    code:REQBOARD_DISPATCH_FAILED, reason:'…'}            │                       │
    │ 立刻重试 reqboard_task_run ──►│ 无锁 → 重新认领并投递 ────────────────────────►│ ✓
```

| 观测点 | 改动前 | 改动后 |
|--------|--------|--------|
| `advance.lockAt/runId` | 残留，挡住后续 15 分钟（`REQBOARD_ADVANCE_LOCKED`） | 投递失败即清空 |
| 回执 `code` | `REQBOARD_REQ_NOT_FOUND`（"需求不存在"，误导） | `REQBOARD_DISPATCH_FAILED` |
| 台账留痕 | `advance.history` 为空，人查不到原因 | `DISPATCH_FAILED` 一条 + comment 正文含 `owner_unresolvable` 与原始 message |
| 错误里的 owner | `session "[object Object]"` | 传的是 id，正常路径不再出现该错误；真出错时正文也不含 `[object Object]` |

## UC-3 后台确认不再因 owner 口径投递失败 serves: FR-2

**前置**：agent 用 `reqboard_ask_confirm` 发起确认门，超宽限后转后台挂起；人在看板作答。

```
  agent ── ask_confirm ──► 弹框（后台挂起，捕获工具 exec）
                                   │ 人作答
                                   ▼
                     settleAnswers(deps, exec, …)   ← 后台续跑，**不在 agent 回合内**
                                   │
                        applyConfirmDecision ──► advanceRequirement(deps, reqId, exec)
                                   │
                       owner: exec.agent.id（字符串）─► 宿主 agents.get(id) 命中 ✓
                                   ▼
                        落章 + 推进 + 起链（同一次调用内完成）
```

| 观测点 | 改动前 | 改动后 |
|--------|--------|--------|
| 后台续跑的投递 | 恒失败（传对象） | 成功（传 id；`resolveOwner` 只查注册表，不要求"当前发起者"） |
| 「首个任务未投递」告警 | 每次都出现 | 消失；链在同一次确认内自动开跑 |
| agent 无 exec 的路径（`applyConfirmDecision(uc, {}, …)`） | `owner=undefined` → unowned 投递（宿主允许） | 行为不变，但留痕标 `owner_missing` 便于排查 |

## UC-4 agent 解死锁不再拿到假报错 serves: FR-4

**前置**：需求处于 `armed`，agent 需要手动拆分/落库，被 `REQBOARD_DIVE_ARMED` 挡住。

```
  agent ── clear_pause ──► 用例：activation armed → disarmed, phase → idle
                                │
                                ├─ 宿主渲染 output.render ──► 首行「Dive 已解锁（REQ-…）：armed → disarmed」+ JSON
                                └─ 回执 {success:true, previous_activation:'armed', …}
```

| 观测点 | 改动前 | 改动后 |
|--------|--------|--------|
| 调用方拿到什么 | `INVALID_TOOL_OUTPUT: output.render failed: userRender is not a function`（副作用却已生效） | 正常回执，`previous_activation='armed'` |
| agent 能否判断锁开没开 | 不能（只能再读一次台账） | 能（回执即凭据） |
| 台账副作用 | 已生效 | 逐字不变 |

## UC-X（反向）自动路径不得偷偷打开人的手动模式 serves: FR-3

```
  需求 disarmed+idle ──┬── 心跳 tick（每 60s）──► isDrivableRequirement=false → skip（零写入）
                       ├── requirement-moved ──► isRecoverableDisarm=false → 不武装（零写入）
                       └── 阶段推进 / rollup ──► 不动 dive 字段（零写入）
```

**判据**：对 `disarmed+idle` 的需求只跑自动路径（`recoverHealth` + 心跳 tick + round-driver），台账 `activation` 仍为 `disarmed`、`version` 不变。这条是 UC-1 的守卫：给人开的那扇门，不能变成系统自己开的门。
