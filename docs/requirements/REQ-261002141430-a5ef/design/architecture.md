---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 架构设计（REQ-261002141430-a5ef）

> 一句话：给自动链加一道「**有没有人在等作答**」的准入闸，并让这道闸**自己会开**（作答即恢复）、
> **自己会收**（过期/重启后的周期对账），且**没有弹框时绝不出手**。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：人工门禁弹框在途时，自动链一无所知——agent 继续跑、Dive 继续投回合，
下一次写被 `REQBOARD_CONFIRM_PENDING` 打回，空转烧回合直至撞上阶段回合上限。

**当前状况**：停手守卫只拦 4 个写工具（[pending-guard.ts:27](src/application/internal/pending-guard.ts#L27)）；
回合投递准入 `readyToDrive` 只看 fiber/agent 存活/idle/竞争消息（[round-driver.ts:109](src/application/dive/round-driver.ts#L109)）；
实施链只看 `autoRun`（[AdvanceChain.ts:292](src/application/use-cases/AdvanceChain.ts#L292)）。三处都不问"有人在等吗"。

**设计方案（三件事，缺一不可）**：

| # | 构件 | 职责 | 落点 |
|---|---|---|---|
| 1 | **在途弹框登记表**（内存、**同步**） | 弹框投递那一刻就登记；准入判定读它（同步 ⇒ 同拍也拦得住） | `PendingConfirmRegistry` 扩一格 |
| 2 | **停手位**（台账、异步） | `dive.driverHealth={state:'paused',reason:'awaiting-confirm:<ref>'}` + 一条 comment；让人在台账/看板看得到"它在等人" | `internal/awaiting-confirm.ts`（新增） |
| 3 | **准入判定 + 四条恢复出口** | 投回合/派卡前问登记表；作答/看板确认/显式取消/过期对账四条路都能开闸 | round-driver、AdvanceChain、confirm-settle、wake-heartbeat |

**为什么必须拆成"内存同步 + 台账异步"两半**：台账写是异步的（`repo.mutate` 返回 Promise），
而 Dive 的人工门框与起轮**在同一拍相邻**（[session-driver.ts:320](src/application/dive/session-driver.ts#L320) → `:440`）。
若准入判定读台账，同拍那一轮照样会投出去。故：**同步登记管拦截，台账只管道观与重启对账**。

**不这么做的后果**：继续留着"框在屏上、agent 在跑"，agent 每轮都撞写守卫，回合额度被空转吃掉，
人看到的是"需求自己停了"，而真实原因（在等确认）在任何界面都看不见。

## 模块改动地图 `serves: FR-1, FR-4, FR-5`

```
   ① 弹框投递点（三个）
   ┌───────────────────────────────────────────────────────────────┐
   │ AskConfirm（阻塞 + 挂起两条路）                                │
   │ DrainPrompt 门框（Dive 自己在 idle 拍弹）                       │
   │ PendingConfirmRegistry（既有挂起表，扩一格在途登记）             │
   └───────────────┬───────────────────────────────────────────────┘
                   │ enterAwaitingConfirm(ref)   ← 同步登记 + 异步落库
                   ▼
   ┌───────────────────────────────┐        ┌──────────────────────────────┐
   │ 在途登记表（内存，同步读）     │◀──────▶│ 停手位（台账 driverHealth）  │
   └───────┬───────────────┬───────┘        └──────────────┬───────────────┘
           │ dialogInFlight │                               │ isDrivableRequirement
           ▼                ▼                               ▼
   ┌───────────────┐ ┌──────────────────┐        ┌──────────────────────┐
   │ round-driver  │ │ AdvanceChain     │        │ wake-heartbeat 对账  │
   │ 投回合前查一次│ │ 派卡前查一次     │        │ 停了但无在途 → 恢复  │
   └───────────────┘ └──────────────────┘        └──────────────────────┘
           ▲                                              ▲
           │ exitAwaitingConfirm（四条出口）              │
   ┌───────┴──────────────────────────────────────────────┴──────────────┐
   │ ① 作答到达（AskConfirm 同步/后台）② confirm-settle 落章点（看板/证据）│
   │ ③ 人显式取消（ASK_CANCELLED / 降级）④ ticket 过期（心跳周期对账）    │
   └─────────────────────────────────────────────────────────────────────┘
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/application/internal/awaiting-confirm.ts` | 新增 | `enterAwaitingConfirm` / `exitAwaitingConfirm` / `dialogInFlightFor` / `AWAITING_CONFIRM_PREFIX` | FR-1,2,3 | 唯一停手位写入点 |
| `src/adapters/PendingConfirmRegistry.ts` | 改 | 扩一格在途登记（同步增删、按需求查） | FR-1,3 | 内存态，重启即空（见兼容） |
| `src/application/dive/round-driver.ts` | 改 | `drive()` 在 checkpoint 之后、构造 attempt 之前查 `dialogInFlight` | FR-1 | 停手期间不投回合 |
| `src/application/use-cases/AdvanceChain.ts` | 改 | 派卡准入新增 `awaiting-confirm` 停因（不改 `autoRun`） | FR-1 | 停手期间不派下一张牌 |
| `src/application/use-cases/AskConfirm.ts` | 改 | 投递前 `enter`，作答/取消/降级后 `exit` | FR-2,3,5 | 两条等待路径都覆盖 |
| `src/application/internal/confirm-settle.ts` | 改 | 落章/推进收敛点 `exit`（覆盖看板与文字证据通道） | FR-3 | 一处覆盖三条确认通道 |
| `src/application/dive/gate-prompt.ts` | 改 | 弹框前 `enter`、作答/异常后 `exit`；降级不 `enter` | FR-5 | 同拍不再并存 |
| `src/application/dive/wake-heartbeat.ts` | 改 | 新增"停手对账"一趟：停手但无在途 → 恢复 | FR-4 | 过期/重启后的兜底 |
| `src/application/internal/rearm.ts` | 改 | 在途时拒绝 `recoverHealth`（不把等弹框当误停摆） | FR-4 | 看板「继续」不越权 |
| `tests/dialog-inflight-stop.test.ts` | 新增 | TC-1…TC-9 | FR-6 | 修前必红 |

## 停手与恢复时序 `serves: FR-1, FR-3, FR-5`

```
人/自动流程              弹框通道            在途登记表        台账 driverHealth     自动链
    │                       │                    │                    │                │
    │ 提交产物/确认门触发    │                    │                    │                │
    ├──────────────────────▶│                    │                    │                │
    │                       ├─ enter(ref) ──────▶│ 同步登记           │                │
    │                       │                    ├─ mutate ─────────▶│ paused          │
    │                       ├─ questions.ask ───▶│                    │  awaiting-confirm│
    │                       │                    │                    │                │
    │  （宽限超时/人在看）   │                    │                    │  投回合前查表 ─┤ 跳过 ✅
    │                       │                    │                    │  派卡前查表  ─┤ 跳过 ✅
    │ 人在弹框作答           │                    │                    │                │
    ├──────────────────────▶├─ settle ──────────▶│                    │                │
    │                       ├─ exit(ref) ───────▶│ 同步清除           │                │
    │                       │                    ├─ mutate ─────────▶│ healthy        │
    │                       │                    │                    │  触发一次续跑 ─┤ 起轮 ✅
    │                                                                                    │
    ├─ 无人作答，TTL 到 ──▶ 心跳对账：无在途登记 ⇒ exit(ref)（留痕"过期恢复"）──────────────┤ 起轮 ✅
    └─ 插件重启 ─────────▶ 在途表天然为空 ⇒ 同上一条，绝不静默停摆 ────────────────────────┘
```

## 准入判定与不变量 `serves: FR-1, FR-4`

**判据单点**：`dialogInFlightFor(requirementId): boolean`（同步，读内存表并按需求过滤）。

| 消费面 | 判定位置 | 行为 |
|---|---|---|
| 回合投递 | `round-driver.drive()` 在 checkpoint 之后、`createRoundMessage` 之前 | 在途 → 直接 return（不投、不 disarm、不写健康位） |
| 实施链派卡 | `AdvanceChain` 单飞锁内、`autoRun` 判定之后 | 在途 → `stopped='awaiting-confirm'`（不改 `autoRun`） |
| 恢复越权 | `recoverHealth` 入口（含看板「继续」调用） | 在途 → 返回 false + 零写入（note 说明"仍在等确认"） |
| 周期对账 | `wake-heartbeat.tick` 新增一趟 | 停手原因前缀命中且**无在途** → 清停手位并留痕 |

**为什么用 `driverHealth` 而不改 `autoRun`**：`autoRun` 是人的意图开关（看板「暂停/继续」语义），
停手是运行时等待，二者混写会引出"停手前 autoRun 是什么"的恢复难题；而 `driverHealth` 本来就是
"停下来等人"的运行态（[protocol.ts:1069](src/shared/protocol.ts#L1069)），且 `isDrivableRequirement`
天然据此停投——**零新持久字段**。

**不变量（写进用例）**：

- **INV-1 非门禁不停**：无在途登记时，回合投递与派卡行为与改动前逐字一致（反向自检）。
- **INV-2 停手必可恢复**：任一条恢复出口后，`driverHealth` 不含 `awaiting-confirm:` 前缀。
- **INV-3 不改人的意图**：`dive.activation` / `autoRun` 在本需求任何分支都不被改写。
- **INV-4 降级不登记**：弹框通道不可用（fallback=board）时**不得** `enter`，否则无人作答 = 永久停手。

## 兼容、迁移与回滚 `serves: FR-2, FR-4`

| 场景 | 设计 |
|---|---|
| 存量台账 | 零影响：不新增持久字段；不认识 `awaiting-confirm:` 前缀的旧读者只会把它当普通暂停原因 |
| 新增 reason 前缀 | `awaiting-confirm:<ref>` 写进 `RequirementDriverHealth` 的注释枚举（文档级，不改类型） |
| 进程重启 | 在途表为内存态 → 重启即空 → 心跳对账把残留停手位恢复（**宁可多跑一轮，不要静默停摆**） |
| 启动迁移 | `migrate-dive-state` 对已盖章记录不动作；未盖章记录照旧（本需求不依赖它存活） |
| 回滚 | 删掉三处准入判定即可回到改动前行为；残留 `driverHealth=paused(awaiting-confirm:*)` 由既有 `recoverHealth`（看板「继续」）清掉，无需数据迁移 |
| 灰度/开关 | 不需要：无新对外接口、无新工具参数、无新持久字段 |

## 风险与已知取舍 `serves: FR-1, FR-4`

| 风险 | 取舍 |
|---|---|
| 登记与投递的 TOCTOU（登记后弹框投递失败） | 投递失败分支必须 `exit`（AskConfirm 的失败/降级路径已覆盖）；用例断言"失败后无残留停手位" |
| 挂起记录与弹框实际存活不一致（人离开了） | 以 TTL + 心跳对账收敛；过期即恢复，不追着人跑 |
| 人在看板点「继续」而弹框还开着 | `recoverHealth` 拒绝并回一条 note（"仍在等待人工确认"）；人应在弹框作答——避免"框还在、链已跑" |
| 阻塞弹框（capture 五问 / accept_sheet）未纳入判据 | 期间 agent 在工具内等待、不满足投递前提（需求边界 ⑤）；若实测发现阻塞期 status 会转 idle，回补登记 |
