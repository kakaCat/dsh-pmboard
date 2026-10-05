---
req: REQ-261002173819-69c7
kind: evidence
title: t5 收口验收记录（兼容核对 · 回归基线 · 端到端接回）
---

# t5 收口验收记录

> 命令一律在 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 下原样执行。**失败的项不写成成功**。

## 1. 目标用例（本需求新增与扩写）

```
npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts \
               tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts \
               tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts
```

结果：**6 文件 61 例全绿，exit 0**。

| 文件 | 例数 | 对应断言 |
|------|------|----------|
| advance-dispatch-owner | 7 | D-1/D-2/D-3/D-4a/D-4b/D-5/D-6/D-7 |
| dive-rearm | 24 | 含新增 R-1..R-7 |
| reqboard/autorun-rearm | 2 | R-8/R-9 |
| tools-render-coverage | 3 | T-1/T-2/T-2b |
| clear-pause-lossless | 9 | 含新增 T-3/T-4 |
| unit/dsh-jobs-adapter | 16 | owner 透传（夹具改字符串 id） |

## 2. 既有契约（不得回归）

```
npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts \
               tests/task-run-contract.test.ts tests/dive-round-state.test.ts tests/dive-round-driver.test.ts
```

结果：**125 passed / 3 failed**。

- 3 例失败全在 `output-contract.test.ts`，断言的是 `defineTaskAdoptTool` / `defineKnowledgeTool` /
  `defineRegenerateTool` **缺响应源映射**（RESPONSE_SOURCES）——与本需求零交集，且在 t1 开工前的
  全量回归里就已失败（见 §4 的失败文件集合比对）。
- 其余 4 文件（tools-schema 45、task-run-contract 7、dive-round-state 18、dive-round-driver 26）全绿。

## 3. 类型 / 全量 / 构建

| 项 | 命令 | 结果 | 基线 | 判定 |
|----|------|------|------|------|
| 类型 | `pnpm typecheck` | **187** 条 | 223（C-15） | 通过；本需求改动文件零错误 |
| 全量 | `pnpm test` | 329 文件 / 3446 例，**99 failed** / 3327 passed / 20 skipped | 106（C-14） | 通过 |
| 构建 | `pnpm build` | **exit 0**；`dist/index.mjs` 1240095B；`[verify-client] OK bundle=335946 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` | C-11 / C-12 | 通过 |

## 4. 回归失败集合逐文件比对（证明"没有新增失败"）

对 t1 开工前、t2 后、t3 后、t4 后四次全量回归的 `FAIL` 文件清单做集合比对：

| 轮次 | 失败文件数 | 与上一轮的新增 | 与上一轮的消失 |
|------|-----------|----------------|----------------|
| t1 前 | 49 | — | — |
| t2 后 | 49 | 无 | 无 |
| t3 后 | 49 | 无 | 无 |
| t4 后 | 49 | 无 | 无 |

另：全量日志里检索 `dispatchOwnerOf` / `DISPATCH_FAILED` / `armExplicit` / `releaseClaim` 命中数均为 **0**，
即"没有一例失败与本需求改动有关"。

## 5. 兼容核对（三项）

### ① 数据契约：无字段新增

- `RequirementRecord` 字段集合未动；`schemaVersion` 仍为 **9**（生产台账实读）。
- 唯一新增：`AdvanceEvent` 联合类型多一个取值 `'DISPATCH_FAILED'`（`src/shared/protocol.ts`）。
- 全仓检索确认**没有任何消费方按 `AdvanceEvent` 取值分支**，新增取值不改变既有分支。

### ② 看板响应形状不变

- 由 `tests/reqboard/autorun-rearm.test.ts` R-8 断言：响应键集合 ⊆ 需求记录字段 ∪ `{ advanceNote}`，
  即**不新增返回键**；`on:false` 侧由 R-9 断言 `dive` 字段逐字节不变。

### ③ 生产台账只读实况（REQ-261002161439-277d）

纯读、不写盘，仅做判据推演：

```
status           = implementing
dive             = {activation: disarmed, phase: idle, roundsInStage: 0,
                    driverHealth: {state: healthy, attempts: 0}}
advance          = {lockAt: 1790935522764, runId: run-1790935522805-ggkx9kz}
父卡数            = 11
schemaVersion    = 9

isDrivableRequirement(现在) = false      ← 它不会自动跑（本需求要解决的问题形态）
recoverHealth 可恢复?       = false      ← 自动路径救不回（设计如此）
armExplicit 可救?           = true       ← 人点「继续」可以救回（本需求新增能力）
```

结论：旧台账可被新代码原样读取；`disarmed+idle` 这一形态的三种判据与设计预期**逐条一致**。
另注：`advance.lockAt = 1790935522764` 是一条**本修复生效前**留下的残留锁，正是 FR-1 要消除的产物
（新代码的失败路径会当场回收它）。

## 6. 端到端接回：副本端到端 + 实机重新武装已通过，**`roundsInStage` 一项受阻于死窗口**

卡面要求的端到端证据是「对 REQ-261002161439-277d 点看板「继续」→ 60s 内 `dive.roundsInStage` 由 0 变 1」。
拆成两段，分别交代：

### 6.1 真实数据 + 真实实现的路由级端到端：**已通过**

```
npx tsx docs/requirements/REQ-261002173819-69c7/evidence/t5-e2e-real-copy.mts
```

脚本把**生产台账整份复制**到临时目录（生产文件全程只读，跑完比对 sha256），用真实仓储
（`JsonLedgerRepository`）+ 真实 HTTP 路由打一次 `POST /req/autorun {on:true}`：

```
【副本端到端】台账需求总数 = 39
【基线】 REQ-261002161439-277d dive = {activation: disarmed, phase: idle, roundsInStage: 0, …}
【结果】 REQ-261002161439-277d dive = {activation: armed,    phase: active, roundsInStage: 0, …}
【判据】 isDrivableRequirement = true
【留痕】 含 [Dive 重新武装] = true
【响应键】 26 个 = 需求记录自带 25 字段 + advanceNote（未新增键）
【生产台账未被改写】 sha256 相同 = true
E2E-COPY: PASS
```

这一段证明了本需求的产物在**真实记录**（含 `migratedAt` / `lastWakeAt` 等真实字段）上确实生效，
且响应形状不变。

### 6.2 宿主进程内的实机一步（人授权代点「继续」）

1. ~~运行中的宿主仍加载旧构建~~ → **已解除**：宿主于 2026-10-02 18:23:02 重启并重新 apply 插件
   （diag 记录 `[EARLY]: apply function STARTED`），现在跑的就是新构建——见 §6.3 的实机留痕。
2. **「继续」按设计只能由人触发**：FR-3 的全部意义就是"改人的意图只能由人做"；由 agent 去调
   `/req/autorun` 等于绕过自己刚立的规矩（6.1 用的是台账副本，不改生产数据，因此不算越权）。

**已执行（2026-10-02 18:24:53，人授权窗口代点）**：

用户在弹框中选择「授权我代点一次」，窗口据此向看板发了一次
`POST /dashboard/api/reqboard/req/autorun {id:"REQ-261002161439-277d", on:true}`（reason 里写明是用户授权），
HTTP 200。**生产台账随即可见**：

```
18:24:53 human  [自动链] 人已继续（autoRun=true）：用户在看板上一直未点成；经弹框明确授权窗口代点一次…
18:24:53 human  [Dive 重新武装] 人显式要继续（trigger=board-resume）：activation disarmed → armed；phase idle → active
18:24:53 system [自动链投递] …owner 缺失（owner_missing）…
18:24:53 system [自动链投递失败] …（原因：dispatch_failed）。锁已回收…
```

响应 `advanceNote = 已重新武装（人显式要继续，Dive 将在一分钟内接上）；已触发一次推进：0 步，停止于 dispatch_failed`

| 卡面核对项 | 结果 |
|------------|------|
| `dive.activation` disarmed → **armed** | ✅ 生产台账实测 |
| `dive.phase` idle → **active** | ✅ 生产台账实测 |
| `[Dive 重新武装]` 人工留痕 | ✅ 写入，`createdBy.kind=human` |
| `dive.roundsInStage` 0 → 1（≤60s） | ⚠️ **环境受限未实测**（原为加强项，见下方口径修订）——原因见 §6.4 |

**口径修订（2026-10-02 经人裁定）**：卡面原写的「`dive.roundsInStage` 由 0 变 1」**降级为「环境受限未实测」**，
不再作为本卡的通过条件；端到端以**需求文档自己的判据 A4** 为准（台账变 `armed` + `phase=active` 且有人工留痕）。

依据（三条，都可复核）：

1. **A4 是本需求自己定的判据**，它不要求 `roundsInStage`（见 `requirement.md` 判定标准表 A4 行）；
2. 「起轮」验的是 **Dive 既有的投递行为**，本需求一行没改它——本需求改的是 `activation/phase`（FR-3）；
3. 该行为当前被**两个本需求边界之外的东西**挡着：绑定窗口 `session-afb5b804` 重启后已死（§6.4），
   以及新缺陷 **N-1**（armed + 死窗口 = 静默停摆，心跳仍报 healthy）。


### 6.3 实机旁证：重启后新代码在生产台账上自己跑了一遍（FR-1 + FR-2 的活证据）

宿主于 **18:23:02** 重启并重新 apply 插件；启动恢复扫描（`application/internal/startup-scan.ts` →
`scanAndResume`）随即对 `autoRun=true` 的 277d 发起了一次推进。它在**生产台账**上留下了三条
**只有新代码才会写**的痕迹：

```
2026-10-02T10:23:03.044Z system [自动链投递] REQ-261002161439-277d 的投递 owner 缺失（owner_missing）
                          ——按无主 job 投递：不会被会话归档连带取消，也不计入每 owner 并发上限。
2026-10-02T10:23:03.178Z system [自动链投递失败] REQ-261002161439-277d 未能投递后台任务
                          （原因：dispatch_failed）。锁已回收，可直接重试 reqboard_task_run。
                          原始错误：background jobs unavailable: no job controller serves this agent
                          (load @deepseek-ai/dsh-tool-jobs in its composition)

advance.history 新增一条：
  { event: DISPATCH_FAILED, outcome: failed, durationMs: 0, detail: "dispatch_failed: background jobs unavailable: …" }
advance.lockAt / advance.runId：**已被清空**（对比 §5③ 里修复前留下的那两条残留锁）
```

同时证明两件事：

| 修复 | 实机表现 |
|------|----------|
| FR-2 owner 口径 | 启动路径没有 agent（`exec` 缺失）→ 走**无主投递**并留 `owner_missing` 痕，**不再**抛 `session "[object Object]" has no live agent` |
| FR-1 锁回收 | 投递仍失败（宿主侧原因见 §6.4）→ **锁当场回收** + `DISPATCH_FAILED` 留痕；修复前这种失败会留下 15 分钟残留锁（今天 09:54、10:05 各观测到一次） |

### 6.4 为什么 `roundsInStage` 没变成 1：绑定的窗口在重启后不是活的了

Dive 只会把回合投给**需求绑定的那个窗口**（`sourceSessionId` → `agents.get(id)`）。277d 的绑定现状：

```
277d.sourceSessionId 现在 = session-afb5b804-c1ec-4a72-88b2-c86c8164a772
但是：
  · 该会话日志最后写入 = 18:20（本地），此后无写入
  · diag 里它最后一次事件 = 10:20:57 [WAKE-RX] agent/status=idle
  · 18:23:02 宿主重启后，只有 session-c997b014 / 5c6b1a8b / 7fc133ad 有事件
⇒ 重启后它不是 live agent ⇒ Dive 无处投递 ⇒ roundsInStage 停在 0（台账上却显示 armed+healthy）
```

**并且绑定本身被改过**（有备份为证，本仓 src 里没有写 `sourceSessionId` 的代码）：

```
~/.dsh/dsh-reqboard.json.bak-bind   （18:02 生成，revision 2721）
   └ 277d.sourceSessionId = session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783   ← 立项窗口
~/.dsh/dsh-reqboard.json            （现在，revision 2800）
   └ 277d.sourceSessionId = session-afb5b804-c1ec-4a72-88b2-c86c8164a772   ← 被人/某进程手改成当时活着的窗口
```

这一节暴露的是**两个新缺陷**（都不在本需求边界内，另行立项为宜）：

| # | 缺陷 | 证据 | 后果 |
|---|------|------|------|
| N-1 | **armed + 绑定窗口已死 = 静默停摆**：唤醒心跳的 `wake` 端口"受理即算成功"（`ReqboardDiveManager.ts:66` 返回 true），投不出去也记 healthy、照刷 `lastWakeAt` | 本次实测：armed+active 2 分钟，`roundsInStage` 恒 0，而 `driverHealth=healthy`、无任何异常留痕 | 正是本需求想消灭的"它不动了但看不出为什么"；且**无人接管**死掉的绑定窗口 |
| N-2 | **窗口绑定可被静默改写**：`sourceSessionId` 被改过（`.bak-bind` 为证），而全仓 src 没有任何写入点——改写来自仓外脚本/在飞代码，且不留台账留痕 | 上头两条 json 对照 | "这条需求归哪个窗口"不再可信；改错就把需求绑到将死的窗口上（本次即如此） |

**要拿到卡面那条 `roundsInStage 0 → 1`，人只需做一件事**：把 277d 那个会话窗口重新打开（它的
session id 仍是 `afb5b804`，重开后即恢复为 live agent），Dive 会在下一次空闲拍（≤60 秒）把回合投过去，
`roundsInStage` 随即 0 → 1。


### 6.5 顺带查明的环境事实（不在本需求边界，但必须响亮报出）

实机错误 `background jobs unavailable: no job controller serves this agent` 的成因**不是**本需求修的
口径问题，而是**本 profile 关掉了 `@deepseek-ai/dsh-tool-jobs`**（插件清单里
`include:tool-jobs` → `enabled: false`）。宿主的 `servesOwner` 在没有全局控制器时返回假，于是投递一律被拒。

影响：**本 profile 里自动实施链无法投递后台任务**——与 owner 口径无关，属 profile 配置选择。
是否恢复由人决定（一行配置：`- id: tool-jobs / disabled: false`），本需求不擅自改。
它**不影响**本次端到端要验的 Dive 接回——起轮走心跳，不经过 jobs。
