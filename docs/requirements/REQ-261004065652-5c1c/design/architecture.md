---
req_id: REQ-261004065652-5c1c
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
---

# 架构设计（REQ-261004065652-5c1c）

> feature 重档。本设计只回答一件事：**怎么让 Dive 在有限步内停手，且停手状态当拍可信**。
> 不夹带新功能（阶段模板补段属 REQ-261003203909-55f2）；不改五道人工门语义；
> 不改凭证门既有的写入族/结论族判定。
> 读者：写实现卡的人。每章标 `serves:`。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-9, FR-11`

**问题**：Dive 只有"该不该起轮"的判据（`isDrivableRequirement`），没有"该停就停"的判据；
而那唯一的起轮判据读的是可能陈旧的同步快照。2026-10-03 实测：上游 403 后空转 4h36m / 7257 回合。

**当前状况**：
- 起轮判据 `isDrivableRequirement(req)` 读 `dive.activation` / `driverHealth.state` / `advance.pausedReason`；
  在 idle 同步缝里这些字段来自 `peekFacts()`，而 `peekFacts()` 的 `dive`/`advance` 取自
  `factsCache`——**只在建索引与 create 时写一次**的成员；
- 回合异常收尾的唯一动作是 `disarm()`（异步写台账），驱动下一拍照读同一张死快照 → 判据恒真；
- 无熔断、无退避、无全局闩；人工门与人工中止都不是停手条件。

**设计方案：三本账分家**

```
  ① 意图账（台账 dive.activation）        谁改：只有人
        │  不动（本次零改动）
        ▼
  ② 运行时健康账                         谁改：驱动
        ├─ 台账 dive.driverHealth  ← 可观测 + 跨重启线索（异步写，允许慢）
        └─ 内存 state.latch        ← 当拍判定，fail-closed（本次新增，不等写盘）
        │
        ▼
  ③ 当拍事实账 peekFacts()               谁改：写路径（本次修复：读己所写）
        └─ 起轮前必须同时满足：健康未闭锁 ∧ 非人工门 ∧ 未撞全局闩 ∧ 预算允许
```

**不这么做的后果**：判据可以永远为真（本次事故），且任何一次"写成功、读失败"都会复现自旋；
只修投影不改闭锁，则下一次任何新的投影缺陷都会重演同一事故。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

```
   turn/end ──▶ session-driver ──▶ [新] upstream-failure.classifyTurnEnd()
                                      │
                    ┌─────────────────┼──────────────────┬─────────────────┐
                    ▼                 ▼                  ▼                 ▼
              fatal(AUTH)        transient         aborted:user        normal
                    │                 │                  │                 │
                    ▼                 ▼                  ▼                 │
        [新] provider-latch     退避计数 state.failure    state.latch        │
                    │                 │                  │                 │
                    └────────┬────────┴──────────────────┘                 │
                             ▼                                             │
                     state.latch（内存闭锁，fail-closed）                  │
                             │                                             │
   agent idle ──▶ round-driver.readyToDrive() ◀── latch? latch 命中 → 不起轮
                             │
                             ├─ [新] human-gate.humanGateOf(req) → open? 不起轮
                             ├─ [新] provider-latch.isOpen() → 撞闩? 不起轮
                             ├─ [新] chain-budget.checkChainBudget() → 超限? 不起轮
                             └─ peekFacts()（FR-4 修好后当拍可信）→ 起轮

   ShardedRequirementWriter.mutate ──notify(..., facts)──▶ Store 同步刷 index + factsCache
                                                                  │
                                                                  ▼
                                                     peekFacts() 读己所写（FR-4）

   AskConfirm（缺省宽限）─▶ raceAsk(graceMs) ─▶ pending + ticket（FR-7）
   stampInterruption（去重键改为原因类别 + 限流 + 截断）（FR-8）
   启动对账 reconcile-terminal-dive（终态 + armed → disarm-terminal）（FR-9）
   AdvanceChain 开工前 engineReachable 预检（FR-10）
```

**改动清单**：

| 动作 | 文件 | 内容 |
|---|---|---|
| 新增 | `src/application/internal/upstream-failure.ts` | `classifyTurnEnd()` 纯函数：致命/瞬时/中止/正常 + 原因类别 |
| 新增 | `src/application/internal/provider-latch.ts` | 进程级额度闩（TTL + 人可清），注入时钟 |
| 新增 | `src/application/internal/human-gate.ts` | `humanGateOf(req)`：验收单/待确认产物/待批准计划 → 停手 |
| 新增 | `src/application/internal/chain-budget.ts` | WIP 上限 + token 预算判定（纯函数 + 注入限额） |
| 新增 | `src/application/internal/reconcile-terminal-dive.ts` | 启动对账：终态 + armed → `disarm-terminal` |
| 修改 | `src/repositories/ShardedRequirementWriter.ts` | `notify(...)` 增第 5 参 `facts`；三处调用点传 `factsOf(record)` |
| 修改 | `src/repositories/ShardedRequirementStore.ts` | notify 回调同步刷 `factsCache`；`factsOf` 增 `tokenUsage` 三标量 |
| 修改 | `src/application/dive/round-driver.ts` | `DriverState` 增 `latch`/`failure`；`readyToDrive` 增四道前置；异常收尾走分类器 |
| 修改 | `src/application/dive/wake-heartbeat.ts` | 闩开启时整趟跳过；**不得**把 `driverHealth` 重置为 `healthy` |
| 修改 | `src/application/dive/round-state.ts` | `DrivableShape` 增判定所需字段；保持与准入栅栏同源 |
| 修改 | `src/application/use-cases/AskConfirm.ts` | 缺省宽限（配置项）→ 走既有 `raceAsk` 非阻塞路径 |
| 修改 | `src/application/internal/interruption.ts` | `stampInterruption` 去重键 = 原因类别 + 阶段 + 下一步；限流；原因截断 |
| 修改 | `src/domain/dive/transition.ts` | 新增事件 `disarm-terminal`（仅终态需求可命中） |
| 修改 | `src/index.ts` | 装配闩/预算/人工门端口；启动跑 FR-9 对账 |

## FR-1 · 致命错误分类与全局额度闩 `serves: FR-1`

**病**：上游 403（`AUTH` / quota）被当成普通异常 —— 写一次健康位，然后按"事件驱动"继续起轮。

**设计**：
- `classifyTurnEnd(data)` 输出 `{ kind: 'fatal' | 'transient' | 'abort' | 'normal' | 'unknown', reasonClass: string }`。
  判据（**顺序敏感**）：
  1. `reason.kind === 'aborted'` → `abort`，`reasonClass = 'aborted:' + cause.kind`；
  2. `reason.kind === 'error'` 且 `code === 'AUTH'`，或 message 命中
     `/permission_error|usage limit|quota|unauthorized|403/i` → `fatal`，`reasonClass = 'error:AUTH'`；
  3. `reason.kind === 'error'` 其余 → `transient`，`reasonClass = 'error:' + (code || 'UNKNOWN')`；
  4. `completed` / `max-tokens` / `blocked` → `normal`；形态不认识 → `unknown`（不猜、不动）。
- `provider-latch`：`{ trip(reason): void; isOpen(): boolean; clear(by): void; until(): number }`。
  进程级单例（组合根持有并注入 round-driver / wake-heartbeat / 看板恢复路径）。
  `fatal` → `trip('upstream-auth')`；TTL 默认 **5 小时**（额度窗口），可由人显式 `clear`。
- 命中 fatal 时同时写该需求的 `driverHealth={state:'paused',reason:'upstream-auth'}` 与一条留痕。
- 看板恢复（人点「继续」/确认推进）→ `latch.clear(actor)` 并写一条 `createdBy.kind='human'` 留痕。

**为什么闩要跨窗口**：实测两个窗口共享一份 provider 额度、同刻阵亡（E-2）。单需求暂停救不了第二个窗口。

## FR-2 · 退避与熔断 `serves: FR-2`

**设计**：退避与熔断计数**只活在内存**（`DriverState.failure`），台账 `driverHealth.attempts` 仅作展示。

- 首次瞬时失败：`failure = { reasonClass, count: 1, nextAt: now + base }`，`base = 30s`；
- 同因再失败：`count += 1`，`nextAt = now + min(base × 2^(count-1), 10min)`；
- `count >= 3` → 写 `driverHealth={state:'paused',reason:'agent-error-loop'}` + 内存 `latch`，停手等人；
- **原因类别变化** → `count` 归零（不同病因分开数，避免"抖动 + 额度"互相掩盖）；
- 退避期内 `readyToDrive()` 为假（用注入的 `now()` 判定，测试用假时钟）。

## FR-3 · 驱动侧内存闭锁（fail-closed） `serves: FR-3, FR-6`

**设计**：
- `DriverState.latch?: { reasonClass: string; reason: string; at: number }`；
- `readyToDrive()` 第一句就是 `if (state.latch !== undefined) return false`——**先闭锁，再谈台账**；
- 置锁点：`onAgentError`、`turn/end` 异常（error/aborted/interrupted）、熔断、闩、预算拒绝；
- 清锁点（全部为**显式**）：
  1. 人恢复（看板「继续」/确认推进）→ 组合根调 `driver.releaseLatch(requirementId)`；
  2. `requirement-moved` 且**需求 revision 有变化**（证明有人/有链路推进过），且台账 `driverHealth` 非 paused；
  3. 闩过期（仅对 `reasonClass='upstream-auth'`）。
- 清锁时双条件（内存 + 台账），避免"台账说停、内存说跑"的第三种状态。

**不做**：不把 latch 落盘。它的价值是"不依赖任何 I/O 的当拍判定"；落盘化会把它退化成第二个台账。

## FR-4 · 投影读己所写（根因修复） `serves: FR-4`

**裁定 D-1 = A：写路径同源刷新快照**（不把判定字段改成异步权威读——idle 拍是同步缝，改异步会引入新的时序窗口）。

**设计**：
- `ShardedRequirementWriter` 的 `notify` 增可选第 5 参 `facts?: RequirementFacts`；
  三处调用点（create / applyMutation / replaceAll）手上都有整条记录 → 传 `factsOf(record)`；
- `ShardedRequirementStore` 的 notify 回调同步 `index.set(id, summary)` **且** `factsCache.set(id, facts)`；
- `peekFacts()` 形状不变（仍是 `index` 的实时字段 + 快照的 `description/dive/advance/tokenUsage`）；
- **缺失即默认拒绝**：`factsCache` 无该 id 时不伪造 `healthy`（现状即如此：`dive===undefined` → 不起轮），
  本次把这条口径写成测试锁死（防以后有人"顺手补默认值"）。

**为什么不是 B**：`advance.history` 是 append-only 无上界，把判定字段挪到权威读要额外裁剪；
A 方案改动面 < 40 行且不引入新的异步窗口。

## FR-5 · 人工门即停手 `serves: FR-5`

**设计**：新增 `humanGateOf(req) → { open: boolean; reason?: string }`，纯函数 + 一条把"状态 + 产物态"映射成门
的表：

| 条件 | open | reason |
|---|---|---|
| `status==='accepting'` 且验收单存在未裁决项 | ✅ | `acceptance-pending` |
| 存在 `kind=design/plan/requirement/verification` 的已登记未确认产物 | ✅ | `artifact-unconfirmed` |
| `status==='decomposing'` 且计划已提交未批准 | ✅ | `plan-unapproved` |
| 其它 | ❌ | — |

- `drive()` 在构造 attempt **之前**查一次（与既有 `dialogInFlight` 检查同一个"还来得及收手"的点）；
- 命中 → 不起轮、**不写健康位**（等人不是故障，与既有 `dialogInFlight` 口径逐字一致）、
  只幂等更新停手位；
- 人裁决/批准/确认后 → 下一次空闲拍自然起轮（不需要人再点一次）。

## FR-6 · 中止当拍生效 `serves: FR-6`

**设计**：`aborted:*` 一律**先置内存 latch**（`onSessionEvent` 的 turn/end 分支内同步完成），
再走既有的 `pauseAborted` 写台账；`teardown` 与 `requestDrive` 在 latch 存在时不再投递。
停止语义与 error 不同：`abort` 不自动恢复（等人才动），不吃退避计数。

## FR-7 · 弹框缺省有界宽限 `serves: FR-7`

**设计**：
- 新增配置项 `confirmDefaultGraceMs`（缺省 **600000 = 10 分钟**，可被插件配置覆盖，`0` = 回到旧的全阻塞）；
- 装配了 `pendingConfirms` 时：缺省走既有 `raceAsk(ask, graceMs)` → 超时即 `pending=true + ticket`
  （**复用** REQ-260927123256-196b 的非阻塞返回体，不新增形状）；
- **未装配** `pendingConfirms` 时维持全阻塞（行为逐字不变，不制造"假非阻塞"）；
- 显式 `inline_grace_ms` 仍可覆盖缺省（语义不变）。

## FR-8 · 断点留痕去重限流 `serves: FR-8`

**设计**（改 `stampInterruption`，纯函数 + 注入 `now`）：
- 去重键 = `reasonClass(reason) + status + pendingAction`（`reasonClass` 复用 FR-1 的分类器：
  `error:AUTH:<超长 403 文案>` → `error:AUTH`）；
- 限流：同类且 `now - prev.at < 10min`（常量可注入）→ 返回 `false`（不写、不 bump）；
- **原因文本截断**：写进 comment 的 reason 截断到 200 字符（实测一条 403 文案 ≈ 300 字符，逐条落盘会放大台账）；
- **状态变化必须立刻写**（阶段或 pendingAction 变了 → 不受限流影响）。

## FR-9 · 终态收手与启动对账 `serves: FR-9`

**设计**：
- 领域层新增事件 `disarm-terminal`：仅当需求 status ∈ {`done`,`archived`,`canceled`} 时 `changed:true`，
  写 `activation='disarmed'`、保留 `phase`；非终态 → `changed:false`（零写入）；
- 启动对账 `reconcileTerminalDive()`：扫热侧需求，命中"终态 ∧ `activation==='armed'`"→ 应用该事件 +
  一条 `createdBy.kind='system'` 的迁移留痕；幂等、返回计数；
- 起轮侧已有的一半（`isOpenRequirement`）保留，并在心跳与 requestDrive 两个入口补齐同源判定。

## FR-10 · 子卡引擎开工预检 `serves: FR-10`

**设计**：
- `AdvanceChain` 开工（OPEN_PARENT）**之前**调 `engineReachable()` 探针（与既有
  `ENGINE_UNREACHABLE_CODE` 同源判据，来自 `WorkflowEngineRunner` 的注入钩子）；
- 不可达 → 直接以 `stopped='engine_unreachable'` 结束本次推进，回执 = 既有
  `UNREACHABLE_GUIDANCE`（两条出路）+ 一句"本次未落任何子卡"；
- **同一需求只报一次**：以 `advance.history` 中最近一条 `ENGINE_UNREACHABLE` 为幂等键，
  重复推进只做一次零写入的短路（退出回合、不刷屏、不 bump revision）；
- 不替人打开 `dsh-tool-jobs`（边界 B）。

## FR-11 · 全局 WIP 与额度预算闸 `serves: FR-11`

**设计**：`checkChainBudget({ facts, now, limits }) → { allowed, reason?, value? }`，纯函数：
- **WIP 上限**：`facts` 中 `dive.activation==='armed' ∧ autoRun===true ∧ status==='implementing'` 的条数 ≥ `maxInFlightChains`（缺省 **3**）→ 拒绝；
- **token 预算**：`facts` 中各需求 `tokenUsage.totals`（新增投影标量）之和 ≥ `maxCacheReadPerWindow`（缺省 **5×10^8**）→ 拒绝；
- 拒绝时**不起轮**、写一条可读留痕（含阈值名与当前值）；**不杀**已在跑的链（只挡新链）；
- 指标来源：`RequirementFacts.tokenUsage`（FR-4 的同一条投影管道），不新增存储读。

**诚实边界**：token 预算是"粗闸"——它按**需求级累计**读，不按 provider 分账（台账无 provider 字段）；
真正的 provider 级配额核算留待需要时另立需求。

## 分批与回滚 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

一次只改一类东西，每批独立可验证：

| 批 | 内容 | 判据 |
|---|---|---|
| B1 | FR-4 投影读己所写（含 store 契约测试） | `store-projection-ryow` 绿；去掉刷新 → 红 |
| B2 | FR-1/2/3/6 失败分类 + 熔断 + 内存闭锁 | `dive-loop-breaker` 绿；去掉熔断 → 红 |
| B3 | FR-5 人工门停手 + FR-9 终态对账 | `dive-human-gate-stop` / `dive-terminal-reconcile` 绿 |
| B4 | FR-7 缺省宽限 + FR-8 留痕限流 | `ask-confirm-default-grace` / `interruption-dedupe` 绿 |
| B5 | FR-10 引擎预检 + FR-11 预算闸 | `advance-engine-precheck` / `chain-budget` 绿 |

**回滚路径**：全部为**纯增量**（新模块 + 可选字段 + 判定收紧）；回滚 = 逐批 revert。
存量台账零改写（新字段可选、`pausedReason` 只扩值域）；FR-7 回滚 = `confirmDefaultGraceMs: 0`。

## 决策裁定（需求阶段留的 D-1~D-4） `serves: FR-1, FR-4, FR-11`

| # | 裁定 | 理由 |
|---|---|---|
| D-1 | **A：写路径同源刷新快照** | 同步缝内改异步读会引入新的时序窗口；A 改动面最小且可测试 |
| D-2 | **阈值 3 / 退避 30s→1m→2m→4m（封顶 10min）** | 实测均值 23 回合/分：任何 >0 的重复都在烧额度，取保守侧 |
| D-3 | **A：进程内闩 + 台账可见** | 两窗口同刻阵亡（E-2）；只进程内则人看不到"为什么全停" |
| D-4 | **本期做（FR-11 按上文的粗闸形态）** | 单需求 implementing 烧 14 亿 token 是结构性浪费；粗闸 ≤100 行且可测 |
