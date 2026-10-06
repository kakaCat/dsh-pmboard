---
serves: FR-1, FR-2, FR-3, FR-4
---

# 架构设计（REQ-261006170150-52cc 确认作答后不唤醒 agent）

> 本文写给零上下文的执行者：只凭 requirement.md + 本目录设计文档即可写出拆分计划；任务卡切分归拆分阶段，本文件不出现。
>
> 口径引用：`kb-conventions-c01`（层边界只许向内）、`docs/architecture/confirm-gate-advance.md`（确认门推进契约）、
> `docs/architecture/automation-chain-contract.md` §六（起轮前的停机前置）。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：人工门确认之后「状态推进了、但没人把 agent 叫起来」。断点不在确认动作，而在**「等待解除」与「驱动触发」两件事没有接着**。

**当前状况**（三条事实，逐条可复核）：

| 事实 | 位置 | 后果 |
|---|---|---|
| 清「弹框在途」停手位被放在落章/推进**之后**，且收敛点那次清位**不带 ref、不 await** | `application/internal/confirm-settle.ts`（`applyConfirmDecision` 开头）、`application/use-cases/AskConfirm.ts`（finally） | 推进写触发的 `requirement-moved` 到达驱动时，停手位还在 ⇒ 驱动被 `isDrivableRequirement` / `dialogInFlight` 挡下并**丢弃这一拍** |
| 唯一自动触发只认 `requirement-moved`（store 桥） | `index.ts` 的 store 订阅桥 → `application/dive/round-subscriptions.ts` | 清停手位写是 `requirement-updated` ⇒ 桥不转发 ⇒ **再也没有第二次触发** |
| 两条历史唤醒实现已失效 | `application/internal/pending-confirm.ts`（`wake()` 空实现）、`application/gate/handlers/h4-resume.ts`（硬编码 skip） | 确认路径**一个唤醒动作都不做**，全部托管给 Dive 驱动器 |

**设计方案**（三件，互为补充，缺一即留缝）：

1. **FR-1** 确认收敛点**先**带本次这票的 ref、**await 完成**解除等待（内存登记 + 台账停手位两半），再做落章与推进
   ⇒ 推进事件到达驱动时，两道门都是开的。
2. **FR-2** 把「停手位被清」本身变成一个**驱动事件**：清位成功 → 回调一次 `onCleared` → 组合根接到
   `diveManager.roundDriver().onRequirementMoved(id)`（**与 store 桥同一条路**，不新增投递路径）
   ⇒ 没有状态迁移的出口（否定作答、过期对账、取消）也能接上链路。
3. **FR-3** 在途登记按形态**分档过期**（挂起型 30 分钟 / 阻塞型 60 分钟），过期即"无人等待"
   ⇒ 兑现台账里已经写下的「过期后自动恢复」，避免停手位把需求**永久**钉住。

**不这么做的后果**：只修时序就够修本次事故（FR-1 单独即可让事件不再被自己挡下），但没有状态迁移的出口仍会停摆；
只修触发（FR-2）而清位仍晚于推进，则清位回调会在**旧阶段**起一轮，投出旧阶段的回合文（见「时序」节的偏差说明）。

## 时序：修前 / 修后 `serves: FR-1, FR-2`

```
修前（本次事故）
  人作答 ─▶ ① void exitAwaitingConfirm(无 ref, 不 await)  ← 内存登记还在 ⇒ 台账也清不掉
            ② 落章  ③ 推进（status 变）──▶ requirement-moved ──▶ drive()
                                                                    ├─ isDrivable? paused ⇒ 挡下
                                                                    └─ dialogInFlight? true ⇒ 停手
            ④ applyDiveTransition(confirm-advance) 复位健康位
            ⑤ finally: exitAwaitingConfirm(带 ref) ⇒ 真的清了（但没人再触发驱动）
  结果：status 前进、台账全绿、agent 不动（只能靠人敲字）

修后
  人作答 ─▶ ① await exitAwaitingConfirm(ref, notify:false)   ← 带 ref、先清（FR-1）
            ② 落章  ③ 门  ④ 推进 ──▶ requirement-moved ──▶ drive()
                                                              ├─ isDrivable? healthy ⇒ 通过
                                                              └─ dialogInFlight? false ⇒ 通过
                                                              ⇒ round 半预留 → 投递 → 准入 ⇒ 起轮（新阶段文案）
            ⑤ applyDiveTransition(confirm-advance)（幂等）
            ⑥ advanced=false 才补一次 notify（FR-2 兜底；推进成功则由 ④ 的事件驱动，避免双触发）
```

**与 FR-2 字面的一处有界偏差（必须在此说明）**：FR-2 说「停手位被清的那一刻请求一次驱动」。
在**确认收敛点**里，清位发生在推进之前（FR-1 要求），若此刻立刻请求驱动，就会投出**旧阶段**的回合文，
并在推进后因 revision 变化被 pre-step 拒绝（白白投一条再丢弃）。故此处清位显式传 `notify:false`，
把请求**推迟到本次 settle 的末尾**（`finally`），且**只在 `advanced !== true` 时**补发——
`advanced === true` 意味着状态真的前进了，`requirement-moved` 事件已经驱动过，再发一次会**起第二轮**。
其余所有清位出口（否定作答、心跳对账、取消/过期、门框 finally）**保持** `notify` 缺省 = true，即字面语义。

## 不变量 `serves: FR-1, FR-2, FR-3`

| # | 不变量 | 违反症状 | 谁来钉 |
|---|---|---|---|
| INV-1 | **「等待解除」与「链路接上」必须同时成立**：任何一次请求驱动的判定，都不得被已经结束的等待挡住 | 本次事故（推进成功、无人起轮） | FR-1 判据 + FR-4 回归锁 |
| INV-2 | **驱动只能经 round 半准入**：本需求不新增任何进会话的投递路径（不复活 `wake()`、不改 H4） | 出现第二条绕过预留/准入的消息 | FR-2 判据 + code review |
| INV-3 | **停机位只有一个权威字段**：`dive.driverHealth`；清位=置 healthy，等弹框=置 `paused/awaiting-confirm:<ref>` | 台账写着等弹框、驱动却照跑 | FR-1/FR-3 判据 |
| INV-4 | **同一次确认最多一次驱动请求**：推进路径靠 `requirement-moved`，非推进路径靠清位回调，两者互斥 | 同一回合被投两次（`roundsInStage` 多跳 / 重复回合文） | FR-2/FR-4 判据 |

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

```
  ConfirmDecision.dialogRef ──▶ applyConfirmDecision ──①带ref清位──▶ exitAwaitingConfirm
        ▲                              │                                   │
        │                              │                         cleared ⇒ onCleared
   AskConfirm / gate-prompt            │                                   │
   （各自的 dialogRef）                │                                   ▼
                                       │                    index.ts 装配的 notifyDrivable
                                       │                                   │
                                       ▼                                   ▼
                              applyConfirmedAdvance              roundDriver.onRequirementMoved
                              （status 变 ⇒ 桥发事件）◀────────── 同一条路（不新增投递）
                                       │
   PendingConfirmRegistry（分档 TTL）───┴──▶ ports.dialogInFlight（过期即"无人等待"）
                                       │
                          wake-heartbeat.reconcile（清残影 ⇒ 也带 onCleared）
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/application/internal/awaiting-confirm.ts` | 改 | `AwaitingConfirmDeps.onCleared`；`ExitAwaitingInput.notify`；清位成功即回调（永不抛）；返回 `{cleared}` | FR-2 | 五处清位点 |
| `src/application/internal/confirm-settle.ts` | 改 | `ConfirmDecision.dialogRef`；收敛点先带 ref、await 清位（`notify:false`）；末尾按 `advanced` 补一次 notify | FR-1、FR-2 | 两条确认通道 |
| `src/application/internal/pending-confirm.ts` | 改 | `ConfirmSubmitted.dialogRef` 透传（类型 + 一处赋值） | FR-1 | 挂起路径 |
| `src/application/use-cases/AskConfirm.ts` | 改 | 把 `dialogRef`（ticket ?? `dlg-confirm-…`）交给 settle 路径 | FR-1 | 会话弹框 |
| `src/application/dive/gate-prompt.ts` | 改 | 把自身 ref 交给 `applyConfirmDecision` | FR-1 | Dive 门框 |
| `src/adapters/PendingConfirmRegistry.ts` | 改 | 在途登记**分档过期**（`suspend ? ttlMs : blockingTtlMs`）+ `inFlightFor`/`list` 惰性过期 | FR-3 | 驱动停机判据 + 心跳对账 |
| `src/application/dive/wake-heartbeat.ts` | 改 | `notifyDrivable?`；对账清位时带上 `onCleared` | FR-3 | 过期恢复 |
| `src/application/dive/ReqboardDiveManager.ts` | 改 | 心跳的 `notifyDrivable` 接 `this.round.onRequirementMoved` | FR-2、FR-3 | 一行装配 |
| `src/application/dive/round-driver.ts` | 改 | 本拍放弃的**有界**留痕（`[WAKE-SKIP]`，同因冷却） | FR-4 | 诊断面 |
| `src/index.ts` | 改 | 装配 `useCaseDeps.notifyDrivable`（同一入口） | FR-2 | 组合根 |

新增文件：**无**（改动全部落在既有模块；测试文件见 `test-cases.md`）。删除文件：**无**。

## 失败与降级 `serves: FR-4`

| 面 | 契约 |
|---|---|
| 未注入 `notifyDrivable` | 与改造前**逐字一致**（只清位、不请求驱动）；不装配不报错 |
| 未传 `dialogRef` 的调用方 | 沿用旧行为（不带 ref 的 fire-and-forget 清位）——本需求不强制改所有调用方 |
| `onCleared` 实现抛错 | **永不抛**：吞掉 + `logger.warn`，清位仍然有效（与 `awaiting-confirm`「永不抛」纪律同源） |
| 台账写失败 | 沿用既有纪律：告警 + 日志，拦截仍生效 |
| 驱动本拍放弃 | 留**有界**痕迹：`captureDiag('[WAKE-SKIP] reason=… req=…')` + 同 (需求, 原因) 冷却 ≥60s，**不写台账评论**（防刷屏） |
| 过期判定 | 只影响**内存在途登记**；票 TTL 与弹框宽限三档语义**一字不改** |

## 与既有契约文档的关系 `serves: FR-2, FR-3`

| 文档 | 章节 | 归档时要点名的变化 |
|---|---|---|
| `docs/architecture/confirm-gate-advance.md` | §1 两条路径一份实现 / §2 对外可观测契约 | 新增一步「清位先于落章/推进」，并把「自动链」行补上「清位即驱动」（非推进出口） |
| `docs/architecture/automation-chain-contract.md` | §六 起轮前的停机前置 | 停机前置表补第 ③.5 条「弹框在途」的驱动语义与它的解除条件（清位即驱动、过期即恢复） |

## 关键设计决策与取舍 `serves: FR-1, FR-2, FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 唤醒落点 | 恢复采集半投递（`wake()` 真投消息） | 唤醒仍唯一经 round 半 | D-1：进会话只走 `createRoundMessage`（留痕/准入一体），新开路径要重做两套纪律 |
| 触发信号 | 事件桥按 `requirement-updated` 全量读盘判定 | 清位成功即回调 | 桥的 change 帧**不含** `driverHealth`，全量读盘=每次写都一次 IO |
| 清位与推进的顺序 | 清位放到推进之后（顺序最简单） | 清位在推进之前（FR-1 字面） + 请求推迟到 settle 末尾 | 清位在推进后时，`confirm-advance` 已把健康位复位 ⇒ 清位判据 `changed=false` ⇒ 回调不触发，FR-2 反而失效 |
| 重复触发 | 无论是否推进都补发一次驱动 | 仅在 `advanced !== true` 时补发 | 两次请求会让驱动清掉已排队的预留并**再投一条**回合文（INV-4） |
| 过期阈值 | 单一 TTL 套所有在途登记 | 按 `suspend` 分档 | 阻塞型弹框最长可等约 59 分钟；套 30 分钟会把「人还在看框」误判成过期 ⇒ agent 抢跑 |
