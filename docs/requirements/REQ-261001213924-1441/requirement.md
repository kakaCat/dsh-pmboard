# REQ-261001213924-1441 修复唤醒链的订阅作用域与回合上限语义：让 Dive 真的能持续驱动流水线

> 档位：**重档**（含数据模型与迁移、开关收敛等多决策点）· 类型：feature（缺陷修复族）

## TL;DR

**现象**：人工门确认（会话弹框或看板推进）之后，需求并不会自动继续——用户必须手打一句「继续」，而且这一步在**每个阶段、每条需求**上都要重来。看板一切正常、没有任何面向人的报错。

**这一晚查清了什么**：这不是一个 bug，而是**同一条唤醒链上的四处独立缺陷**，它们各自都能让流水线"静默停摆"，症状完全一样，所以修一处看不出变化。

```
人工门确认（弹框 / 看板）
  → 落章 + 推进（正常）→ 闸门后置链 H1..H5
        └─ H4「唤醒」= 硬编码 skip（唤醒唯一托管给 Dive）
  → Dive 回合驱动器
        ├─[缺陷① 装配] 投递器构造参数错位 ................. 已修（REQ-…-8f8b，已归档）
        ├─[缺陷② 装配] diveRoundPorts 未接 delivery ........ 已修（同上）
        ├─[缺陷③ 订阅] agent/* 事件挂在插件 ctx，疑似被作用域过滤 ..... 待运行时取证
        ├─[缺陷④ 上限] roundsInStage 从不按阶段重置 + 达上限即终态 ..... 生产实测已复现
        └─[缺陷⑤ 开关] activation / phase / autoRun / advance.pausedReason
                        四套开关互不同步，任一都能让一切停下来 ............ 已证实
```

## 一、已证实的缺陷（生产实测，可复核）

| # | 缺陷 | 实测证据 | 后果 |
|---|------|----------|------|
| ④ | **回合计数不按阶段重置**：`roundsInStage` 名为"本阶段已准入回合数"，但全仓只有 3 处写点（立项=0、准入时自增、人 `clear_pause`=0），**阶段推进时无重置** | `roundsInStage` 全仓 grep：仅 support.ts:597 / round-driver.ts:170 / ClearPause.ts:64 三处 | 生命周期计数撞上**阶段局部**上限 |
| ④ | **达上限 = 终态不可驱动**：`drive()` 判 `roundsInStage >= roundLimitFor(当前阶段)` → `terminalBlock` → `phase=paused`；而 `isDrivableRequirement` 要求 `phase=active` | 台账：`[Dive 回合上限] 阶段 archived 达上限 1 回合（roundsInStage=1）→ 终态暂停 paused/round-limit` | 跑完一轮就**永久不可驱动**，只能人 `clear_pause` 解锁 |
| ④ | **上限值极小**：stage-configs 里 draft / done / archived / canceled 的 `maxRounds` 都是 **1** | `src/application/dive/stage-configs.ts:32,83,91,99` | draft 期间被驱动一次就"达上限"——与该阶段还有多少活毫无关系 |
| ⑤ | **四套开关互不同步**：`dive.activation` / `dive.phase` / `autoRun` / `advance.pausedReason` | 台账实例：`disarmed+active+roundsInStage=0`、`armed+paused(round-limit)`、`autoRun=true` 但 `advance.pausedReason=auto_decompose_failed: 计划卡缺少需求条款引用（t1…t6）` | 看板说在跑、引擎说停了；人也分不清该按哪个按钮 |
| ⑤ | **运行时故障会改写人的意图**：`disarm` 把 `activation` 置 disarmed，而它是事实终态（除立项外无重新武装路径） | 台账本次快照：7 条未归档需求中 **5 条** disarmed；其中一条需求**创建 3 秒后**即被 disarm | 一次异常 = 该需求永久失去自动化 |
| — | 已修：装配面两处断点 | `[Dive 自动恢复] 检测到误停摆…已重新武装（触发：requirement-moved）` 于 13:37:39 在真机触发；该需求 `roundsInStage` 随后 = 1（**真的起过轮**） | 已由 REQ-261001201200-8f8b 交付（已归档） |

**必须记账的一处自我纠正**：我曾断言"改造至今 dive 从未成功过一次"，依据是 `grep ~/.dsh/sessions` 数 dive 消息得 0 条——**该判断是错的，观测面选错了**（那条消息不落会话文件）。权威观测面是台账的 `roundsInStage`：实测至少有一条需求起过 1 轮。教训写进本需求：**判定"链路是否真的工作"必须用台账口径，而不是猜某个文件的格式**。

## 二、待运行时取证的嫌疑（尚不能宣称）

| # | 嫌疑 | 支持证据 | 反证 / 不确定性 |
|---|------|----------|------------------|
| ③ | **agent 主题事件被作用域过滤，插件一条也收不到** | cordis 派发按发射方作用域载体过滤（`cordis/lib/index.js:263`：`hook.global \|\| !filter \|\| filter(thisArg, hook.ctx)`）；`scopeTarget` 的过滤器只放行**未打标签**或**处于发射方作用域链上**的 ctx（`packages/core/scope/src/index.ts:170-181`）；agent 事件在 agent 自己的作用域派发（`agent-loop/src/agent.ts:129,150`）；宿主插件规范明说 per-agent 行为要注册到 **`agent.ctx`**（`skills/cordis-plugin-development/references/practices.md:19`） | 插件 ctx 是 profile 级全局的，未必被打标签；且插件确实收得到 `session/event`（宿主的 contained observers 机制）与自发的 `reqboard/requirement-moved` |
| — | **turn/end 载荷读法不一致**：断点写入器用宽解析 `turnEndOutcome`（`data.reason.kind`，aborted 还要读 `reason.reason.kind`），round driver 只读 `data.reason?.kind` 一层 | 台账 `[断点] aborted:user` 与 `activation` 未被 disarm 同时出现（按 round driver 设计，aborted 且无在飞回合本应 disarm） | 也可能由 `agents.get(sid)` 当时不可得解释 |

**取证方式（本需求 FR-4 的一部分）**：在唤醒链各早退分支加文件化诊断（落 `~/.dsh/state/reqboard-capture-diag.log`，不依赖 stdout），重启后读文件即可判定，不再靠推理。

## 判定标准（可证伪，全部可跑）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 回合计数按阶段 | 单测：需求在 draft 用掉 1 轮 → 推进到 brainstorming → 断言 `dive.roundsInStage === 0` 且 `isDrivableRequirement === true` | 通过（修前必红：计数保持 1，且 draft 上限 1 已触 terminalBlock） |
| A2 达上限可恢复 | 单测 + 台账断言：构造达上限需求 → 走一次人确认推进（或看板「继续」）→ 断言其重新可驱动 | 通过（修前永久 `paused`，只能 `clear_pause`） |
| A3 事件可达性 | 诊断文件：重启后确认一个人工门，随后 `grep -c "dive-diag.*agent/status" ~/.dsh/state/reqboard-capture-diag.log` | 计数 > 0，且同一需求台账 `roundsInStage` 增长 |
| A4 停摆可见 | 台账 + 看板：任一停摆路径触发后 | 需求上有含原因的 comment，且看板出现明确状态（红标/徽章），不是"没动静" |
| A5 开关收敛 | 数据契约测试：断言同一时刻只有一组权威状态；运行时故障只写健康位 | `activation` 不被运行时改写（改由 `driverHealth` 承载） |
| A6 载荷解析统一 | 单测：对 `reason` 为对象/字符串/嵌套三种形状，两个读取者结果一致 | 通过 |
| A7 **真端到端**（本需求的主判据） | 真实会话：确认一个人工门后**不发任何消息**，观察 60 秒；再读台账 | 台账 `roundsInStage` 增长且 `activation` 保持 armed；会话日志出现 `source.kind=dive` |

## 产品定义

「唤醒链」是本插件流水线的**驱动引擎**：需求在 brainstorming → design → decomposing → implementing → accepting 之间前进时，每一次阶段切换或人工门确认之后，都必须有人把 agent 从"停下等人"叫起来。当前实现把这件事**唯一**托管给 Dive 回合驱动器（驱动点：`agent/status === idle`；事件源：`reqboard/requirement-moved`），并用一组状态位控制它何时可跑。

本需求要建立的产品性质有三条：

1. **活性可自愈**：单点事件丢失、单次投递失败、一次达到回合上限，都**不得**把需求变成永久不可驱动；
2. **停摆可见**：任何"该动而没动"的状态必须在台账与看板上以人可读形式呈现，并给出下一步该怎么办；
3. **意图与健康分离**：人表达的"要不要自动跑"与运行时健康"此刻能不能跑"是两件事，前者只有人能改，后者任何故障都不得覆盖前者。

## 用户与角色

- **会话用户（需求方）**：期望「点通过 ＝ 流水线继续」。当前必须在每个阶段手打「继续」，且得不到"为什么需要我敲"的任何解释。
- **实施 agent**：回合边界由人喂消息决定而非由闸门事件决定；每个阶段重复"卡住 → 等人 → 被叫起来"，并在多轮工作时被回合上限偷袭。
- **看板使用者 / 运维**：需要一眼看出"这条需求为什么不动了"，并按提示知道该按哪个按钮（现在是四套开关，按钮含义互相矛盾）。
- **插件维护者**：需要一条**真实组合根 + 真实契约**的端到端断言。三次断点全在接缝上，而现有测试用假端口，恰好绕开接缝。

## 功能点

- **FR-1: 回合计数按阶段重置**——阶段推进（`transitionRequirement`）时把 `dive.roundsInStage` 归零，使"本阶段已准入回合数"与字段语义一致；`roundLimitFor` 只对当前阶段生效。
- **FR-2: 达上限不得成为终态**——回合上限命中时应进入"停下等人"的可恢复态（保持需求可被唤醒），并在人确认推进或看板「继续」后自动恢复，而不是置 `phase=paused` 后只能靠 `clear_pause` 解锁；同时复核 draft / done / archived / canceled 的 `maxRounds=1` 是否应参与上限判定。
- **FR-3: 唤醒链可达性修复**——按宿主插件规范把 agent 主题事件的订阅从插件 ctx 改为「`agent/created` 取得 `agent` → 在 `agent.ctx` 上注册 → `agent/disposed` / 插件卸载时注销」；订阅未成立必须响亮失败，不得静默降级。
- **FR-4: 停摆可见 + 心跳对账 + 诊断**——（a）任一停摆路径都写含原因的台账 comment 并在看板呈现；（b）新增"该唤醒而无动静"的判据与周期性对账，超阈值直接投递或响亮告警，使单点事件丢失也能自愈；（c）唤醒链各早退分支落文件化诊断（`~/.dsh/state/reqboard-capture-diag.log`），供事后取证。
- **FR-5: 开关收敛（意图 vs 健康）**——`activation` 只表示人的意图、只有人能改；新增 `driverHealth`（state/reason/since/attempts）承载运行时故障与有界重试；明确 `autoRun` 与 `advance.pausedReason` 的归属或归并，消除"四套开关互不同步"。
- **FR-6: turn/end 载荷单一解析**——统一 `turn/end` 的解析入口（以 `turnEndOutcome` 为唯一解析器），消除 round driver 的窄读法与断点写入器的宽读法不一致。
- **FR-7: 端到端契约断言**——新增一条以**真实组合根 + 真实投递器 + 真实 round driver** 驱动的断言："一次人工门推进 ⇒ 真的投出一条回合消息"；该断言是这条链的唯一 CI 门禁（修前必红）。

## 接口与数据契约

| 契约 | 现状 | 目标 |
|------|------|------|
| `RequirementRecord.dive` | `activation`（armed/disarmed）与 `phase`（active/idle/paused）混用策略与健康 | `activation` = 人的意图；新增 `driverHealth: { state: healthy \| paused; reason?; since?; attempts? }`；`roundsInStage` 语义修正为**阶段内**计数 |
| `roundsInStage` 写入点 | 仅 3 处（立项/准入/clear_pause） | 增加"阶段推进时归零"；写入点集中，禁止旁路 |
| `advance.pausedReason` / `autoRun` | 与 Dive 状态互不同步 | 归并或定义明确主从关系（设计阶段定），对看板只暴露**一套**人可理解的状态 |
| `turn/end` 解析 | 两处读法宽窄不同 | 单一解析入口（`turnEndOutcome`），两处共用 |
| 诊断通道 | 仅采集侧 NODE-1..5 | 扩展至唤醒链各早退分支（前缀可检索，如 `[dive-diag]`） |

## 迁移与兼容

- **存量需求分类迁移**（一次性，可回滚）：
  - `disarmed + phase=active`（误停摆）→ 恢复人的意图为 armed，健康位置 healthy 并留痕；
  - `disarmed + phase=idle`（人 `clear_pause`）→ **不动**，尊重人的选择；
  - `phase=paused`（上限/aborted 终态）→ 按 FR-2 转为可恢复态，并留痕说明原因；
  - `roundsInStage` 按当前阶段重置为 0。
- **回滚**：本需求不改人工门强度、不改五阶段状态机，回滚即还原新增字段与订阅方式；台账新增字段对旧代码无害。
- **不迁移**：不重写历史 comments；不批量改写 task 状态。

## 边界

**做**：

1. 上述 FR-1 ~ FR-7 的实现与测试；
2. 一次性存量需求分类迁移（含留痕与回滚路径）。

**不做**：

1. **不重写 round driver 本体**（预留 / 准入 / 并发栅栏的纪律是对的，问题在外部条件与状态语义）；
2. **不恢复 H4 直投作为主通道**（唤醒仍由 Dive 托管；直投能力若要回来，只作为 FR-4 心跳对账的兜底动作）；
3. **不动五道人工门的强度**（立项/需求/设计/计划/验收仍由人裁决），本需求只让"人点头之后"真的自动继续。

## 证据（本次调查的原始命令与结果）

1. `get_goal` → `{ goal: null }`：本窗口未进入宿主 Goal 状态；插件全程未使用宿主 Goal，而是"照 dsh-goal-round-driver 自实现"（源码注释 `round-driver.ts:3` 等 8 处）。
2. 台账 `REQ-...-0dfb`：`[Dive 自动恢复]` 13:37:39（本仓修复在真机生效）、`roundsInStage: 1`、13:55:04 `[Dive 回合上限] 阶段 archived 达上限 1 回合 → 终态暂停 paused/round-limit`。
3. `src/application/dive/stage-configs.ts:32,83,91,99`：draft/done/archived/canceled 的 `maxRounds = 1`。
4. `roundsInStage` 全仓写点 grep：`support.ts:597`（立项）、`round-driver.ts:170`（准入）、`ClearPause.ts:64`（人解锁）——**无阶段重置点**。
5. 台账 `REQ-...-0fbf`：`autoRun=true` 而 `advance.pausedReason=auto_decompose_failed: 计划卡缺少需求条款引用（t1…t6）`（两套开关并存的实例）。
6. 台账未归档需求：7 条中 5 条 `disarmed`；其中一条创建 3 秒后即被 disarm。
7. cordis 派发与作用域：`cordis/lib/index.js:263`、`packages/core/scope/src/index.ts:170-181`、`packages/core/agent-loop/src/agent.ts:129,150`、宿主插件规范 `practices.md:19`。
8. 诊断面：`~/.dsh/state/reqboard-capture-diag.log`（文件化，可读），第 2278 行 `[NODE-1] session/event=SUCCESS agent/status=SUCCESS`（订阅"成立"只说明 on() 返回了解绑函数，**不等于事件投得到**）。

## 下一步

design —— 需求文档经人确认后进入设计阶段（本需求的第一个决策点：开关收敛的目标形态与迁移口径）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t2、t7 |
| FR-2 | ✅ 已接收 | t7、t3、t8 |
| FR-3 | ✅ 已接收 | t7、t4 |
| FR-4 | ✅ 已接收 | t7、t5 |
| FR-5 | ✅ 已接收 | t8、t1 |
| FR-6 | ✅ 已接收 | t6 |
| FR-7 | ✅ 已接收 | t7 |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
