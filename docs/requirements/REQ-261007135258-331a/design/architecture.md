---
req: REQ-261007135258-331a
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 架构设计（REQ-261007135258-331a · 确认通道接线收敛）

> 每章标题带 `serves: FR-x`；本份只讲结构与时序，不写任务表（任务归拆分阶段）。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3`

**问题**：同一次「人确认产物」在四条通道里各有各的代码——落章已共享，**推进有三份、收尾只做了一半**。
REQ-261007101318-c392 的 2.5 小时静默停摆就是这个结构的直接产物。

**当前状况**：

| 通道 | 推进 | 收尾（清停手位 / dive 复位） |
|---|---|---|
| 会话弹框（含超宽限挂起后台） | `applyConfirmDecision → applyConfirmedAdvance` | 有 / 有 |
| Dive 门框 | 同一个收敛点 | 有 / 有 |
| 文字证据 `reqboard_confirm_artifact` | 内联 `transitionRequirement` | **无** / 有 |
| 看板 `POST /req/artifact/confirm` | 内联 `transitionRequirement` | **无** / **无** |

**设计方案**：把「推进」与「推进后的收尾」都收敛到**一个函数**（`applyConfirmedAdvance`），
四条通道一律只调它；每条通道只负责自己的**前置门**（内容门 / G2 完整性门）与**回执文案**。

**不这么做的后果**：通道各写一套 = 语义只靠约定一致；任何一侧改规则都会分叉（52cc 的
需求文档与实现已经分叉一格：文档写「任何确认通道」，实现只改了会话侧）。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

```
 四条确认通道（只保留各自的前置门 + 回执组装）
 +-------------------------------------------------------------+
 | 弹框/挂起后台  AskConfirm ─┐                                 |
 | Dive 门框      gate-prompt ├─▶ applyConfirmDecision ─┐        |
 | 文字证据       ConfirmArtifact ──────────────────────┤        |
 | 看板           requirements.ts(router) ──────────────┘        |
 +--------------------------------------------------------------+
                                    │
                                    ▼
              applyConfirmedAdvance（**唯一**推进 + 唯一收尾）
                 │                    │                     │
                 │ ① canReqTransition │ ② transitionRequirement（乐观护栏）
                 │                    │
                 │ ③ 收尾 finishConfirmAdvance（新增，同一处）
                 │      ├─ exitAwaitingConfirm   ← 清 awaiting-confirm:* 残影
                 │      └─ applyDiveTransition   ← 复位健康位 / 按需归零
                 ▼
        台账（章 + 状态 + 停手位 + 健康位）──▶ 事件 ──▶ Dive roundDriver 起轮
```

**改动清单**：

| 模块 / 文件 | 类型 | 改动内容 | serves | 影响范围 |
|---|---|---|---|---|
| `src/application/internal/confirm-settle.ts` | 改 | `applyConfirmedAdvance` 增可选入参 `reason` / `sourceLabel` / `clearStopPosition`；推进成功后调用新增的 `finishConfirmAdvance` | FR-1, FR-3 | 四条通道共同的下游 |
| `src/application/internal/confirm-advance-finish.ts` | 新建 | 统一收尾：`exitAwaitingConfirm` + `applyDiveTransition('confirm-advance')`，返回结构化结果 | FR-3 | 被 `applyConfirmedAdvance` 调用 |
| `src/application/use-cases/ConfirmArtifact.ts` | 改 | 内联推进块（218-273）删除，改调 `applyConfirmedAdvance` | FR-2 | 文字证据通道 |
| `src/http/routers/requirements.ts` | 改 | 确认即推进块（512-538）删除内联 `transitionRequirement`，改调 `applyConfirmedAdvance`；「窗口在线」不再作为推进前置（479-484 改为只影响 `delivered`） | FR-1, FR-4 | 看板通道 |
| `src/application/internal/decision-gates.ts` | 改 | `how` 文案（182 / 195）指 `reqboard_ask_confirm`，不再指 `reqboard_move` | FR-5 | 门禁回执 |
| `src/application/internal/stage-gate-timeline.ts` | 改 | 同上（359） | FR-5 | 时序门回执 |
| `tests/confirm-channel-parity.test.ts` | 新建 | 四通道对拍（落章 / 推进 / 清位 / 复位四件事） | FR-6 | 回归锁 |

## 时序 `serves: FR-1, FR-3, FR-4`

```
人（任一通道）          收敛点                     台账                    自动链
   │ 肯定作答            │                          │                       │
   ├────────────────────▶│ ① 带 ref await 清位       │                       │
   │                     │   （既有语义，不动）      │                       │
   │                     │ ② 落章（首写即事实）      ├──章──────────────────▶│
   │                     │ ③ 内容门 / G2（前置）     │                       │
   │                     │ ④ 推进（乐观护栏）        ├──status──────────────▶│
   │                     │ ⑤ 收尾 finishConfirmAdvance│                      │
   │                     │    ├ 清 awaiting-confirm:* ├─healthy─────────────▶│
   │                     │    └ applyDiveTransition  ├─健康位/回合──────────▶│
   │◀──回执（advanced/gate_failure/note）────────────┤                       │
   │                     │                          │  requirement-moved    │
   │                     │                          ├──────────────────────▶│ 起轮
```

**三条分支**（各通道口径一致）：

1. **内容门拦下** → 落章保留、不推进、回执带 `gate_failure`；**不**做收尾（阶段没变，健康位不该被"复位"成已推进）。
2. **已落章未推进的补推进**（早退分支）→ 走同一条 ④⑤；`reason` 标出来源（弹框 / 看板 / 文字证据）。
3. **窗口不在线** → 推进照常（台账动作），仅投递失败：回执 `advanced:true, delivered:false`。

## 设计决策 `serves: FR-3, FR-4`

| 编号 | 决策 | 理由 | 被否方案 |
|---|---|---|---|
| D-ARCH-1 | 收尾放进推进实现内部，而不是各通道各调一次 | 通道各调 = 又一处"漏接不会被发现"；放内部由单一函数保证 | 各通道自行调 `exitAwaitingConfirm`（本需求要消灭的形态） |
| D-ARCH-2 | 通道差异只走**入参**（`reason` / `sourceLabel`），不走分支 | 留痕要能看出"谁确认的"，但行为必须一致 | 各通道各写文案 + 各写实现 |
| D-ARCH-3 | 看板推进不再要求窗口在线 | 推进是台账动作；窗口在线只决定"能否投递" | 保持现状（会造成"状态推上去了、链不动"的观感） |
| D-ARCH-4 | 不复活 H4 直投 inbox | 唤醒唯一经 Dive 收敛点；第二条投递路会与之打架（双投递 / 与在飞回合冲突） | 恢复旧 H4 投递通道 |
| D-ARCH-5 | 收尾失败不回滚推进 | 推进是事实；收尾失败响亮留痕、下一趟心跳对账可再清 | 收尾失败即回滚（会把"已推进"写成假象） |

## 失败与降级 `serves: FR-3`

| 失败点 | 行为 | 可观测 |
|---|---|---|
| 收尾 · 清停手位写失败 | 不回滚推进；告警 + 日志 | 台账保留 `awaiting-confirm:*`，下一趟心跳对账 `reason='expired'` 可再清 |
| 收尾 · `applyDiveTransition` 抛错 | 不回滚推进 | 日志 `warn` + 回执 note 带一句"收尾未完成" |
| 推进本身抛错 | 吞进 `advanceNote`（既有语义） | 回执 note |
| 窗口不在线 | 只影响投递 | 回执 `delivered:false` |

## 不做什么 `serves: FR-1`

- 不新增人工门、不改 `G1.humanOnly`、不做"提交即推进"。
- 不改闸门链 skip 语义、不改 `NODE_ISOLATION` 默认值。
- 不动看板 UI / 投影键（要展示"为什么没起轮"另开 UI 需求）。
- 不改停手位 TTL（30 / 60 分钟分档）与心跳停滞阈值（10 分钟）。
