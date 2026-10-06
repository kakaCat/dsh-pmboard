---
serves: FR-1, FR-2, FR-3, FR-4
---

# 测试策略与用例（REQ-261006170150-52cc）

> 纪律：**先有证据再动手**（D-2）——每个用例先记录"修前必红"的实测形态，修后再跑同一条命令。
> 全部用例只跑本仓既有夹具（`tests/application/harness.ts`）与既有真装配路径，不新造第二套世界。

## 测试策略（三层） `serves: FR-4`

| 层 | 对象 | 手段 | 为什么够 |
|---|---|---|---|
| L1 纯函数/适配器 | `PendingConfirmRegistry`（分档 TTL）、`noteGiveUp` 冷却 | 注入固定时钟直接调用 | 判据无 IO，边界可穷举 |
| L2 用例/收敛点 | `exitAwaitingConfirm`（回调与幂等）、`applyConfirmDecision`（写入顺序与补发条件）、心跳对账 | 夹具 store 记录写序列 + 假 `notifyDrivable` 观察点 | 断言的是**顺序**与**次数**，不是"大概会" |
| L3 端到端 | 真装配（`createCaptureRuntime` + `createDiveRoundDriver`，照 `tests/dive-wake-e2e.test.ts` 的边界替换法） | 假台账 / 假 agent 句柄，其余走真实实现 | 唯一能证明"确认 → 起轮"整链通的方式 |

**观测点选择**：L3 的"起轮"以**投递进 inbox 的回合消息**（`source.kind='dive'`）为观测量——
这正是本次事故里"本应有而没有"的那一条（修前实测：该窗口 `source.kind=dive` 命中数为 0）。

## 用例清单 `serves: FR-1, FR-2, FR-3, FR-4`

| # | 层 | 对象 | 断言（做什么 → 看到什么） | FR |
|---|---|---|---|---|
| TC-1 | L2 | `exitAwaitingConfirm` + 假 `onCleared` | 台账真被清 ⇒ 回调**恰好 1 次**；`notify:false` ⇒ **0 次**；台账本就不是 awaiting ⇒ 0 次 | FR-2 |
| TC-2 | L2 | 同上 | `onCleared` 抛错 ⇒ `exitAwaitingConfirm` 不抛、返回 `cleared:true`，只多一条 `warn` | FR-2 |
| TC-3 | L2 | `applyConfirmDecision`（带 `dialogRef`） | 写入序列里「停手位已非 awaiting」**先于**「`status` 已变」 | FR-1 |
| TC-4 | L2 | 同上 | 推进成功 ⇒ `notifyDrivable` **0 次**；推进被内容门拦下 ⇒ **1 次**；`reject()` 抛错 ⇒ **1 次**（`finally` 兜底） | FR-1、FR-2 |
| TC-5 | L2 | 同上（第二个在途票在场） | 清 A 票后停手位**保持** `awaiting-confirm:B`；清 B 票后才置 healthy | FR-1 |
| TC-6 | L1 | `PendingConfirmRegistry` | 固定时钟：`suspend:true` 越 30 分钟 ⇒ `inFlightFor` false；`suspend:false` 在 30 分钟时**仍 true**、越 60 分钟才 false | FR-3 |
| TC-7 | L1 | 同上 | 过期后 `list()` 不再含该条（惰性删除）；`exit()` 对过期 ref 幂等 | FR-3 |
| TC-8 | L2 | 心跳 `reconcileAwaitingStops` | 台账 awaiting + 在途已过期 ⇒ 一趟 tick：`resumed` 含该需求、停手位非 awaiting、`notifyDrivable` 被调 1 次 | FR-3 |
| TC-9 | L2 | 同上 | 台账 awaiting + 在途**未**过期（阻塞型 30 分钟时）⇒ 停手位保持、`resumed` 不含、`notifyDrivable` 0 次 | FR-3 |
| TC-10 | L1 | `noteGiveUp` | 同 (需求,原因) 连续 5 拍 ⇒ 该窗口恰好 1 条；跨冷却窗 ⇒ 再 1 条 | FR-4 |
| TC-11 | L3 | 真装配端到端（UC-1） | 自动弹框超宽限 → 人晚答 → **不注入任何用户消息**：停手位清、`status` 变、inbox 收到 1 条 `source.kind='dive'` 回合消息（修前必红） | FR-1、FR-2 |
| TC-12 | L3 | 同上（UC-3） | 否定作答 ⇒ 不落章不推进，但 inbox 收到 1 条回合消息（修前必红：什么都不发生） | FR-1、FR-2 |

**新增测试文件**：`tests/awaiting-clear-notice.test.ts`（TC-1、TC-2）、`tests/confirm-settle-order.test.ts`（TC-3~TC-5）、
`tests/awaiting-inflight-ttl.test.ts`（TC-6~TC-9）、`tests/wake-skip-trace.test.ts`（TC-10）、
`tests/wake-after-confirm.test.ts`（TC-11、TC-12，端到端）。

## 回归面（不得变红） `serves: FR-1, FR-2`

| 既有用例 | 锁的是什么 | 为什么本需求会碰到它 |
|---|---|---|
| `tests/ask-confirm-pending.test.ts` | 超宽限挂起、后台落章推进、**作答后不投递** | 它显式断言"唤醒不经投递端口"——本需求**不恢复投递**，该断言必须仍然绿 |
| `tests/dive-confirm-advance.test.ts` | 确认推进后健康位复位、`activation` 不被改写、达上限归零 | FR-1 改了清位时机，不得改这条语义 |
| `tests/confirm-advance-deadlock.test.ts` | 早退分支与主路径同门、缺口时状态不变 | 收敛点改动不得长出第二条推进/门路径 |
| `tests/dive-wake-e2e.test.ts` | 该跑→跑了→停了→被叫回来→重启不动它 | 触发链改动的总回归门 |
| `tests/dive-human-gate-stop.test.ts`、`tests/chain-budget.test.ts` | 四道停机前置 | 新增"清位即驱动"不得绕过停机判据 |
| `tests/gate-handlers.test.ts` | H4 仍返回 skip（`dive_handles_resume`） | 本需求明确**不动** H4 |
| `tests/layer-boundary.test.ts`、`tests/size-budget.test.ts` | 层边界 / 单文件 ≤400 行 | 新增端口与回调不得越层；注意 `index.ts` 等**存量已超限**，本次只做净增最小的改动 |
| `tests/kb-generate.test.ts` | 知识层索引与导出符号一致 | 若动了导出符号，先跑 `pnpm kb:build` 再跑本条 |

## 门禁与读数边界 `serves: FR-4`

| 门禁 | 本需求的读数 | 说明 |
|---|---|---|
| `docs/requirements/<REQ>/design/*` 的 serves / dangling | 每份设计文档：front-matter `serves` + **每个 H2** 带 serves | `checkDesignContentGate` 在 `submit(kind=design)` 一次报全 |
| E2E 覆盖（`e2eCoverageOf`） | **读数未知 → 不判** | 该判据读 **requirement.md** 里带「层级」列的测试策略表；本需求的层级表在**本文件**（设计文档）里，故根文档无表 ⇒ 按既有口径"没有判据对象，不判"（如实声明，不伪造成已覆盖） |
| 尺寸门禁（C-02） | 本次新增多为"改既有文件 + 新增测试" | 新增逻辑优先落在小模块，不塞进已超限文件 |
| 类型闸门 | `npx tsc --noEmit -p tsconfig.json` 无新增错误 | 本仓既有类型基线不为零时，只要求"不新增" |

## 可跑命令与期望 `serves: FR-4`

```bash
# 新增用例（逐条；修前红、修后绿）
npx vitest run tests/awaiting-clear-notice.test.ts tests/confirm-settle-order.test.ts \
               tests/awaiting-inflight-ttl.test.ts tests/wake-skip-trace.test.ts \
               tests/wake-after-confirm.test.ts

# 回归面
npx vitest run tests/ask-confirm-pending.test.ts tests/dive-confirm-advance.test.ts \
               tests/confirm-advance-deadlock.test.ts tests/dive-wake-e2e.test.ts \
               tests/dive-human-gate-stop.test.ts tests/gate-handlers.test.ts

# 规范门禁（C-01 层边界 / 不配置即现状）
npx vitest run tests/layer-boundary.test.ts tests/config-defaults-parity.test.ts

# 文档自检（9 项判据同源既有实现）
npx tsx scripts/req-doc-validate.mts --req REQ-261006170150-52cc --category feature
```

**期望**：新增 5 个文件全绿；回归面全绿（若某条**修前本就红**，需在验收材料里点名区分"存量红"与"本次引入"）；
`req-doc-validate` 的「必填节 / RTM」之外的判据在本阶段不产生**新增**缺口。
