# 自动链能不能自己跑：owner 契约、失败不留锁、人的显式接回（L2 领域篇）

> **TL;DR**：reqboard 的"自动跑"由两条通道构成——**自动实施链**（任务卡按 DAG 自己往下走）与
> **Dive 起轮**（谁来叫醒窗口）。本页把两条通道的**契约与失败语义**定死，共三条：
> ① 交给宿主后台任务系统的 `owner` 必须是 **agent/session 的 id 字符串**（不是对象）；
> ② 投递失败必须**当场回收**推进锁并留可读原因（失败不能把重试锁死）；
> ③ 把需求交回自动化（`disarmed+idle` → `armed+active`）**只能由人**发起，自动路径永不改写人的意图。
> 另附：当前 profile 的一个**环境前提**（`dsh-tool-jobs` 被关 → 投递必被拒）与三条**已知缺口**
> （N-1~N-3 已于 REQ-261003222428-3556 逐条关闭，判据见 §5）。

**来源**：REQ-261002173819-69c7（2026-10-02）。前情：REQ-261002161439-277d 的实施窗口实测"12 个回合全部正常收尾，
但两条自动化通道同时死掉，之后每一步都靠人手动打「继续」"。

## 一、owner 契约：宿主只认 id 字符串

宿主 `@deepseek-ai/dsh-jobs-local` 的解析逻辑（源码可查）：

```js
resolveOwner(session) {
  if (session === void 0) return void 0;                       // 不传 = unowned job，宿主**允许**
  const owner = agents.get(session);                           // 只认 id
  if (owner === void 0) throw new Error(`session "${session}" has no live agent …`);
  return owner;
}
```

`@deepseek-ai/dsh-agent` 的注册表签名同样写明：`get(id)` 的 `id` 是 "the shared agent/session id"。

| 传什么 | 结果 |
|--------|------|
| agent 的 **id 字符串** | ✅ 解析成功（`agents.get(id)` 命中） |
| agent **对象** | ❌ 抛错，且错误文本把对象插值成 `session "[object Object]" has no live agent` |
| 不传（`undefined`） | ⚠️ 合法的 **unowned job**：能跑，但失去 owner 作用域的取消与并发上限；留痕标 `owner_missing` |

**教训**：这条口径错位不报编译错、不报测试错，只在真投递那一刻炸，且错误文本把真实原因（传错了类型）藏成 `[object Object]`。
取 id 的唯一入口是 `src/application/internal/support.ts` 的 `dispatchOwnerOf`（转出 dive 的 `agentIdOf`，不抄第二份）。

## 二、失败路径契约：不留锁、原因可读

推进锁（`advance.lockAt/runId`）是"有 run 在跑"的唯一凭据，而它是在投递**之前**认领的。
投递抛错时根本没有 run，**留着锁就是把自己挡死 `LIMITS.advanceLockStaleMs`（15 分钟）**。

| 契约 | 实现 | 判据 |
|------|------|------|
| 失败先回收锁，再返回 | `AdvanceChain` 的 `releaseClaim`（只清自己认领的那把，`adv.runId === 本次 runId`） | 注入必失败端口 → `lockAt/runId` 均为 `undefined`，紧接着重试 `dispatched=true` |
| 失败留可读痕 | `advance.history` 记 `DISPATCH_FAILED` + comment 含需求号与分类（`owner_unresolvable` / `dispatch_failed`）；**不得**出现 `[object Object]` | 用例 D-3 |
| 回执说真话 | 失败返回 `stopped='dispatch_failed'` → 工具回执 `REQBOARD_DISPATCH_FAILED`（此前误映射成 `REQBOARD_REQ_NOT_FOUND`「需求不存在」） | `tests/advance-dispatch-owner.test.ts` |
| 锁回收自身失败也不吞 | 把原因追加进 `reason`，人看得见"锁还在" | 代码路径 + 复核记录 |

## 三、人的意图契约：`disarmed+idle` 只有人能改

台账里 `dive` 有两个维度，**谁可以写**是硬边界：

| 形态 | 含义 | 谁可以改 | 自动路径能救吗 |
|------|------|----------|----------------|
| `armed` + healthy | 自动跑 | 人 / 驱动侧 | — |
| `armed` + paused（`driverHealth`） | 停下等人（投递失败、达上限…） | 人 / 驱动侧 | ✅ `recoverHealth` |
| `disarmed` + `active` | 误停摆（基础设施故障改写） | 自动可救 | ✅ `recoverHealth` |
| `disarmed` + `idle` | **人主动要手动跑**（`clear_pause` 的产物） | **只有人** | ❌ 自动永不改写；仅 `armExplicit` |

- 两条恢复路径**分家**：`recoverHealth`（自动：`requirement-moved` / 心跳后置）与 `armExplicit`（人：看板「继续」）。
  后者是 `disarmed+idle` 的**唯一**入口，且固定写 `createdBy.kind='human'` 的留痕，便于事后区分"人接回的"与"自动救回的"。
- 越权守卫：弹框在途（`dialogInFlight`）时一律零写入。
- 幂等：已 `armed` 且健康 → 零写入、不刷 comment。

**为什么必须分家**：`clear_pause` 与"人主动关掉自动化"在台账上同形；自动改写会把人的意图改掉。
事故里 agent 自己调 `clear_pause` 解死锁，于是该需求**终身失去自动化**——除非人显式按一下。

## 四、环境前提：投递还需要宿主侧有 job 控制器

即使 owner 传对了，宿主还要有**控制器**才收 job：

```
background jobs unavailable: no job controller serves this agent (load @deepseek-ai/dsh-tool-jobs in its composition)
```

本机 desktop profile 的 `cordis.patch.yml` 层把 `@deepseek-ai/dsh-tool-jobs` 关着（`include:tool-jobs → enabled: false`），
因此**这个 profile 里自动链投不出后台任务**。这是配置选择，不是代码缺陷；要恢复自动链需人决定是否打开该条目。
判据：`plugin_manager list_plugins` 里看 `include:tool-jobs` 的 `enabled`。

（其余装载层前提见 [插件运行前提](plugin-runtime-prerequisites.md)。）

## 五、已知缺口（2026-10-02 实测登记）

| # | 缺口 | 状态 |
|---|------|------|
| N-1 | **armed + 绑定窗口已死 = 静默停摆** | ✅ **已关闭**（REQ-261003222428-3556 t5 / FR-5） |
| N-2 | **窗口绑定可被静默改写** | ✅ **已关闭**（REQ-261003222428-3556 t6 / FR-6） |
| N-3 | **高频产物逐条催办 → 弹框量产** | ✅ **已关闭**（REQ-261003222428-3556 t7 / FR-7） |
| N-4 | 本 profile 关了 `dsh-tool-jobs` | 见第四节，由人决定是否打开 |

### N-1 的关闭方式与判据

wake 受理前增加**活性校验**（`application/dive/wake-liveness.ts` 的 `wakeAcceptance`）：
需求存在 + 有绑定窗口 + 窗口是活 agent（经 `DiveRoundPorts.agents` 只读注入）三条齐备才受理。
叫不动 → 返回 false，心跳既有失败路径接管：**不刷 lastWakeAt**、连续 3 次 → `driverHealth=paused`
（wake-undeliverable）+ 诊断评论；恢复仍走 `recoverHealth` / `armExplicit` 两条既有通道。
判据：`npx vitest run tests/dive-wake-liveness.test.ts tests/dive-rearm.test.ts`（死窗口 3 次后 paused
且 lastWakeAt 不刷新；活窗口行为逐字不变）。

### N-2 的关闭方式与判据

仓内 `sourceSessionId` 改写收编到**唯一留痕入口**（`application/internal/binding-write.ts` 的
`applyRebind`）：每次变更写评论（actor/at/from/to/reason），同窗口幂等零写入。
看板新增「改绑到本窗口」（`POST /dashboard/api/reqboard/req/rebind`，目标窗口必须在线，
仅人通道；agent 面不注册改绑工具 = 代码级拒绝）。静态断言把「绕过留痕」钉成测试红：
`src/` 内 `.sourceSessionId =` 直接赋值仅 binding-write.ts 豁免。
诚实边界：仓外脚本直写存储层仍防不住（不是代码能守的边界），但自此仓内改写条条留痕。
判据：`npx vitest run tests/binding-trace.test.ts`（含反向演练：临时注入赋值 → 红并点名 → 还原绿）。

### N-3 的关闭方式与判据

成组 kind 收敛为单一事实源 `GROUP_CONFIRM_KINDS`（design + task_detail + task_output，
`application/internal/artifact-gates.ts`），三条确认通道（弹框/文字证据/看板一键）同源：
一次确认 = 该 kind 全部落章，回执 `stamped` 如实列出落章清单。
催办按 kind 聚合（`aggregateUnconfirmedLabels`）：注入面待确认从逐条变「kind×N（成组确认一次清）」。
确认门语义不变（仍需人点），变的是组织：实测 39 份待确认从「点 39 次」变「点 1 次」。
判据：`npx vitest run tests/artifact-group-confirm.test.ts tests/artifact-gates.test.ts`（5 份一次全 confirmed、
聚合 5→1、design 成组零回归）。

## 六、起轮前的四道停机前置（2026-10-04 起，REQ-261004065652-5c1c）

> **这一节回答**：一次上游故障之后，自动链凭什么"一定会停"，而不是靠运气。
> 背景是 2026-10-03 的实机事故：上游额度 403 之后 Dive 没停手，4 小时 36 分里空转 7257 个回合、
> 6605 次 403（根因是驱动读的同步投影陈旧，读不到自己刚写的暂停位）。

### 四道前置（按 `round-driver.drive()` 的**实际判定顺序**）

| # | 前置 | 判据 | 通过后写入什么 | 谁放行 | 缺省（不装配时） |
|---|---|---|---|---|---|
| ① | **内存闭锁**（+退避） | `state.latch` 不存在；`failure.nextAt` 未到点 | 无（纯内存，不依赖 I/O） | 台账被**显式**复位为 healthy 且我方停手位写成功 | 无锁 → 不拦 |
| ② | **全局上游闩** | `providerLatch.isOpen() === false` | 无（进程级内存） | 人清闩（看板「继续」/确认推进）或 TTL 到期 | `undefined` → 不拦 |
| ③ | **人工门** | 台账态：验收单有待裁决 / 有未确认的门类产物 / 计划已提交未批准 | **不写健康位、不改 activation**（等人不是故障） | 人裁决/批准/确认后自然关闸 | `undefined` → 不拦 |
| ④ | **预算闸** | `checkChainBudget()` 放行（在跑链 < 3；cacheRead 合计 < 5×10⁸） | 无（只拒绝，不杀在跑链） | 名额释放 / 预算回到线下 | `undefined` → 不拦 |

**顺序为什么是这样**：①② 是"**与 I/O 无关的当拍判定**"——台账坏的、写盘失败、上游全挂，它们照样拦得住；
③④ 是"台账态 / 全局态"的判定，放在后面。**四道全部在构造回合预留（attempt）之前**，即"还来得及收手"的那个点。

### 三条不变量

1. **闭锁先于一切台账判据**：`latchBlocks()` 是 `readyToDrive()` 的第一句——不看台账、不 await，因此
   "投影陈旧"这类缺陷复发时也不会自旋（这是本次事故的第二道防线）。
2. **停机位只有一个权威字段**：`dive.driverHealth`（`isDrivableRequirement` 唯一读它）。
   legacy 的 `dive.phase=paused` 只在台账尚未被写停时才补写。
3. **超限与等待都不是失败**：人工门与预算闸命中时**不写健康位、不改人的意图**；只有
   致命错误（AUTH/额度）与连续同因失败（≥3 次）才写 `driverHealth=paused` 并要求人来。

### 判据（可复跑）

```bash
npx vitest run tests/dive-loop-breaker.test.ts tests/dive-abort-latch.test.ts \
               tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts
npx tsx scripts/reverse-drill-matrix.mts     # 六条护栏的反向演练（拿掉修复 → 必须变红）
```

### 这四道前置**不**负责什么

- **不控"要不要自动跑"**：`dive.activation` 仍只有人能改（见第三节）。
- **不做跨进程协调**：全局闩是**进程内**的（插件实例级）；跨重启靠台账的 `driverHealth` 接管。
- **不替人做取舍**：终态记录在冷侧只读（`REQBOARD_COLD_IMMUTABLE`），对账**改不动**它们——
  这一条刻意不去放宽，见 `docs/requirements/REQ-261004065652-5c1c/evidence/decisions.md` 的 D-5。

## 七、调度与观测（2026-10-04 增补，REQ-261004110201-f253）

自动链的**派发顺序**与**可见性**各有了一处可配开关，二者缺省时行为与本文档前述各节**逐字一致**：

| 能力 | 开关 / 入口 | 语义 |
|---|---|---|
| 派发顺序 | 需求级 `priority`（缺省 0） | `scanAndResume` 按 (-priority, createdAt) 遍历：高优先级先投；同值先创建的先行（稳定，不抖动） |
| 全局在制上限 | `maxInFlightRequirements`（缺省 0 = 不限） | 在制判据 = **有新鲜推进锁**（真有 run 在跑），不是「开了 autoRun」——后者会把排队中的需求也算在制而自我堵死；超限不投递，回执 `stopped='wip_limit'` 且点名在跑者、上限与解除方式 |
| 阶段遥测 | `reqboard_status` 回执 `stage_telemetry` | 按**子卡阶段**聚合时长/产出/零产出（派生自 execution，不落第二个桶）；无数据省略键 |
| 零产出告警 | `zeroOutputAlertThreshold`（缺省 2） | 同需求同阶段连续零产出达阈值 → 台账一条 `[零产出告警]`；去重可推导、老记录即断、**不改模板不阻断链** |
| 阶段模型路由 | `stageRouting` | `<StageKind>` / `<StageKind>@<difficulty>` 两级命中；未命中不注入（脚本逐字节不变） |

判据：`tests/requirement-priority.test.ts`（排序/在制）、`tests/stage-telemetry.test.ts`（遥测）、
`tests/zero-output-alert.test.ts`（告警）、`tests/stage-model-routing.test.ts`（路由）、
`tests/config-defaults-parity.test.ts`（不配置即现状）。

## 八、可复核入口

- 需求目录：`docs/requirements/REQ-261002173819-69c7/`（`requirement.md` 判据 A1–A10 / `design/` / `reviews/review-report.md` / `tests/test-evidence.md`）
- 实机与端到端证据：`docs/requirements/REQ-261002173819-69c7/evidence/t5-acceptance.md`（§6.3 实机旁证 / §6.4 死窗口原因 / §6.5 环境事实）
- 可复跑脚本：`docs/requirements/REQ-261002173819-69c7/evidence/t5-e2e-real-copy.mts`（读生产台账副本，跑完校验 sha256 未变）
- 用例：`tests/advance-dispatch-owner.test.ts`、`tests/dive-rearm.test.ts`、`tests/reqboard/autorun-rearm.test.ts`、`tests/tools-render-coverage.test.ts`
- **四道停机前置的交付证据**（REQ-261004065652-5c1c）：
  `docs/requirements/REQ-261004065652-5c1c/evidence/regression.md`（反向演练矩阵 + 全量回归 + 类型闸门）、
  `evidence/reconcile-drill.md`（真台账副本上跑启动对账，逐文件 sha256 证明零改写）、
  `evidence/decisions.md`（两条人工裁定 D-5/D-6）；
  可复跑脚本：`scripts/reverse-drill-matrix.mts`、`scripts/reconcile-terminal-drill.mts`
- **N-1~N-3 关闭证据**（REQ-261003222428-3556）：`tests/dive-wake-liveness.test.ts`（活性校验）、
  `tests/binding-trace.test.ts`（绑定留痕+静态断言反向演练）、`tests/artifact-group-confirm.test.ts`（催办聚合+成组确认）；
  同需求另有 `tests/advance-lock-heartbeat.test.ts`（锁续租）与 `tests/advance-parallel.test.ts`（批内真并行）

```bash
# 三条契约的判据（全绿即成立）
npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts \
               tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts
```
