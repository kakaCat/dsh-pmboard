# 草案：独立 bug 需求「批准计划自动落库失败后的恢复通道不可用」

> 用途：本需求（REQ-261002110908-81d0）撞上的死锁，与它的三条 FR 无关；按边界约定**另立需求**。
> 本文是该 bug 需求的现成草稿：复现、根因、建议 FR、验收、边界。证据全部可在本机复核。
> 事故现场记录：[incident-autorun-deadlock.md](incident-autorun-deadlock.md)

## 一、一句话

**批准拆分计划 → 自动落库失败 → 需求被推进到 implementing 却没有任务卡，而四条恢复路径全部被代码级门禁挡住**；
同时 `implementing` 阶段 Dive 回合上限是 **1000**，所以它不会自己停，只会持续空转。

## 二、最小复现（本机实测，2026-10-02）

1. 用例：一条 feature 需求走到 `decomposing`，`dive.activation=armed`；
2. 提交**不含任务表**的拆分计划（`reqboard_submit(kind=plan, path=…)`，不传 `tasks`）→ 台账 `plan.tasks` 变成 **0 条**；
3. 人在弹框点「确认（批准计划）」；
4. 观察：台账评论 `[拆分] 按已批准的拆分计划落库 0 个任务` → `[自动开跑] 自动拆分 0 张卡并落库 → 自动进入实施（autoRun=true）`；需求 `status=implementing`，`reqboard_task_tree` 返回 **0 张卡**；
5. 此时尝试恢复，四条路径逐一被拒：

| 尝试 | 结果 |
|---|---|
| `reqboard_submit(kind=plan)` 重交带卡计划 | `REQBOARD_BAD_STATUS`（计划只能在 decomposing 提交） |
| `reqboard_move(to=decomposing)` | `missing_artifact`（implementing 须先有 `task_detail` 产物，而无卡产不出 → 闭环） |
| `reqboard_decompose(tasks=[…])` | `REQBOARD_DIVE_ARMED`（Dive armed 禁手动拆分） |
| `reqboard_clear_pause()` | `REQBOARD_NO_BOUND_REQ`（取 `context.session?.id`，工具桥通道拿不到窗口身份） |
| 看板「拆分」按钮 | 走同一个 `executeDecompose` → 同样吃 Dive 门；且不传 tasks，`plan.tasks=0` 时还会 `REQBOARD_TASKS_REQUIRED` |

## 三、根因（四处，独立编号）

| 编号 | 缺陷 | 位置 | 性质 |
|---|---|---|---|
| D1 | 批准**0 任务**计划时，落库 0 张卡**仍照常推进**到 implementing（缺"0 卡不得推进"守卫） | [confirm-settle.ts:306-336](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/internal/confirm-settle.ts#L306-L336)（`landPlanTasks(draft)` → `createdCount` → `transitionRequirement`） | 状态机漏洞 |
| D2 | 「自动开跑失败」的**官方恢复路径自己也被 Dive 门关着**：工具路径与看板路径都经 `executeDecompose` 的 armed 检查 | [Decompose.ts:49](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/use-cases/Decompose.ts#L49)、[requirements.ts:444](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/http/routers/requirements.ts#L444) | 恢复通道设计缺陷 |
| D3 | `reqboard_clear_pause` 两处接线坏：① 窗口身份用 `context.session?.id` —— `ToolRunContext` 上**没有 `session` 属性**（基线 tsc 报 TS2339），故恒为 'unknown'、**该工具从未工作过**；② 参数声明为**嵌套 `schema`**，`requirement_id` 永远传不进去。**（2026-10-02 已修，见 proposed-fix-clear-pause.md；本 bug 需求仍需补用例）** | [ClearPauseTool.ts:18/42](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/tools/ClearPauseTool/ClearPauseTool.ts#L18)、[ClearPause.ts:42](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/use-cases/ClearPause.ts#L42) | 接线 bug |
| D4 | `reqboard_submit(kind=plan)` **不传 tasks = 静默清空任务表**（不是"沿用上次"）；且 `task_count: 0` 的提示出现在弹框触发之后，来不及拦 | 计划提交入口 | 语义陷阱 |

**穷举证据（本次全仓枚举 dive.activation 写入点）**：全仓只有四类写入——
① 立项置 armed（capture/create）；② reqboard_clear_pause 置 disarmed（**唯一 agent 可达的解锁口，本通道坏**，见 D3）；
③ 误停摆恢复（rearmIfRecoverable，由看板「继续」触发）置 armed——方向相反，且只在 disarmed+active 时生效；
④ 驱动失败 / 投递失败 / 检查点失败 / agent 错误 路径置 disarmed——非 agent 可达。
→ **除 D3 修好外，agent 侧没有任何自解锁路径**；D3 一旦坏掉，死锁是完全封闭的。

**加剧因素**：implementing 的 maxRounds = 1000（[stage-configs.ts:67](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/dive/stage-configs.ts#L67)）→ 死锁态下 Dive 不会自停，持续空转消耗轮次与 token。

**护栏缺口（基线实测）**：`tests/confirm-settle-plan-persist.test.ts`（批准 → 同步落库任务卡）与 `tests/auto-chain-approval.test.ts`（批准后自动跑完链）**在开工前就是红的**（见 [baseline-2026-10-02.md](baseline-2026-10-02.md)：全仓 49 文件 / 98 用例失败）。该面没有绿色护栏，D1 才得以长期潜伏。

## 四、建议的功能条款（bug 档，编号 BUG-x）

- **BUG-1：0 张卡的落库不得推进**——批准的计划若落出 0 张卡，必须**拒绝对应的状态推进**并响亮报错（含"计划任务表为空"与修复指引）；不得出现"implementing 但 0 卡"的形态。
- **BUG-2：失败后的恢复路径必须真的能用**——当 `advance.pausedReason=auto_decompose_failed:*` 时，工具路径与看板路径的拆分必须放行（或给出**该状态下确实可执行**的恢复命令）；错误文案里的恢复指引必须被自己的门禁验证过。
- **BUG-3：`reqboard_clear_pause` 恢复可用**——窗口身份与其它工具同源（`deps.session.windowKey`）；`requirement_id` 按顶层参数接收；不带参数时解锁本窗口绑定需求。
- **BUG-4：重交计划不得静默清空任务表**——不传 `tasks` 时保留旧任务表，或要求显式 `forceClearTasks: true`；提交入口在 `task_count=0` 时直接拒绝。
- **BUG-5（护栏）：把 D1 的面救绿**——`confirm-settle-plan-persist` / `auto-chain-approval` 两个既有失败用例修好并纳入回归。

**可证伪验收（草案）**：

1. 造"计划含 0 任务"的场景 → 批准后断言：**状态仍在 decomposing**、有结构化错误、`task_tree` 仍 0 卡（改前必红：当前会进 implementing）；
2. 造自动落库失败（复用 refs 缺失或 mock 抛错）→ 断言：错误文案给出的恢复命令**执行成功**（落库 5 张卡）；
3. 工具桥通道下 `reqboard_clear_pause({requirement_id})` 与不带参数两种调用**都能**把 armed 需求置为 disarmed；
4. `reqboard_submit(kind=plan)` 不传 tasks 且已有批准计划 → 任务表**保持不变**（或按 force 语义拒绝）；
5. `npx vitest run tests/confirm-settle-plan-persist.test.ts tests/auto-chain-approval.test.ts` 由红转绿。


## 五、死循环：为什么它会一轮接一轮地转（2026-10-02 实测 28+ 轮）

**循环机制**（round-driver.ts 的 drive() 每一拍都重跑这套判定）：
1. bound() 按 sourceSessionId 找到绑定窗口的需求 → 命中；
2. isDrivableRequirement：dive.activation=armed 且（无 driverHealth 时）phase≠paused → **true**；
3. isOpenRequirement：implementing 非终态 → **true**；
4. roundsInStage(=28) ≥ roundLimitFor(implementing)(=**1000**) → **false**，不触发 terminalBlock；
5. 落检查点 → 投递「第 N 回合」消息 → agent 应答 → persistAdmission 写回 roundsInStage=N → 下一拍回到 1。

**四个刹车为何一个都没踩**：

| 刹车 | 设计位置 | 为什么没停 |
|---|---|---|
| 回合上限 | round-driver.ts terminalBlock（到顶写 driverHealth=paused） | implementing 的上限是 **1000**（stage-configs.ts:67）——事实上等于「不停」 |
| 投递健康位 | wake-heartbeat.ts（连续 N 次叫不动 → driverHealth=paused/wake-undeliverable） | 每轮**投递都成功**（agent 每次都应答）→ 健康位恒为 healthy。**应答本身在给循环续命** |
| 中止停机 | round-driver.ts pauseAborted（回合被中止 → phase=paused） | 每轮都正常结束，从未 aborted |
| 人工出口 | reqboard_clear_pause（置 activation=disarmed） | **接线坏**（D3），本通道不可用 |

**根本缺口（这才是「死循环」三个字的由来）**：驱动**没有「有没有进展」的判据**——它只判「能不能驱动」，不判「上一轮有没有产出」。
我们这个需求正好是「可驱动 + 零产出」：implementing + 0 张卡 + 干什么都被门挡 → 每拍都重新满足唤醒条件 → 无限循环。
对照：投递失败有人管、达上限有人管，唯独「轮轮成功但零进展」没有任何护栏。

**这个「可驱动 + 零产出」的态是 D1 造出来的**：批准 0 任务计划时 landPlanTasks(draft=[]) → 0 卡 → 仍 transitionRequirement(implementing)（confirm-settle.ts:306-336）。

**加重项（别指望关 autoRun 能停）**：drive() 里还有一段「实施阶段中断自动恢复」（round-driver.ts:267-288）——
implementing 且 autoRun≠true 且有未完成任务时会**自动把 autoRun 打开**再等下一拍；它同样不判断「有没有活可干」。

**新增建议条款**：

- **BUG-6（无进展护栏）**：同一阶段连续 N 轮（建议 3）**零产出**（无任务状态变化 / 无产物登记 / api 无状态迁移）→ 写 driverHealth=paused(reason=stagnant) 并留 comment，人工确认后才继续；不得靠 1000 轮上限兜底。
- **BUG-7（零任务即无活）**：implementing 阶段若无未取消任务，驱动不得继续投回合（应报「无活可干」并停下等人），而不是无限投递。

**死循环的三种停法（按干净程度排序）**：

| 停法 | 动作 | 副作用 |
|---|---|---|
| ① 台账置 driverHealth=paused(reason=manual-stop) | 需停宿主后改台账 | **可恢复形态**：看板「继续」能叫醒（rearm 认 driverHealth=paused） |
| ② 修 clear_pause + 重载插件（= 选项 A） | 一次解锁 + 落库 5 张卡 | 无副作用，且把需求推回正轨（推荐） |
| ③ GUI 里中断当前回合 | 一键 | 驱动写 phase=paused；但 **armed+phase=paused 是 rearm 不认的组合**，恢复需再动台账 |


## 六、Dive／流水线未覆盖的场景清单（S1–S7）

| 编号 | 未覆盖场景 | 现状后果 | 代码位置 |
|---|---|---|---|
| S1 | **可驱动但零活可干**（implementing 且 0 张未取消任务） | 驱动照常投回合，永远「开工」不了 | round-driver.ts:238-288（无任务数判据） |
| S2 | **轮轮成功但零产出**（没有任何进展判据） | 无限循环，靠 1000 轮上限兜底 | round-driver.ts（无 noop 判据）；对照：投递失败有 driverHealth、达上限有 terminalBlock |
| S3 | **自动开跑失败后的恢复** | 官方恢复路径被自己的 Dive armed 门挡住 | Decompose.ts:49 + requirements.ts:444 |
| S4 | **唯一解锁口自身坏掉**（无兜底/无告警） | 人也没法停，死锁封闭 | ClearPauseTool.ts:18/42 |
| S5 | **阶段上限与阶段语义不匹配** | implementing=1000 轮 ≈ 无上限 | stage-configs.ts:67 |
| S6 | **提交入口的空任务表** | 不传 tasks 即清空且跳过 FR 覆盖校验 | SubmitArtifact.ts:278-310（`if (rawTasks.length > 0)` + `req.plan = { tasks }` 整体替换） |
| S7 | **恢复形态覆盖不全** | `armed + phase=paused`（中断产生）不在 rearm 认的两种可恢复形态里 → 中断一次可能搁浅 | rearm.ts:31-36（只认 driverHealth=paused 与 disarmed+active） |

**S6 的精确机制（本次事故的入口）**：
```ts
const rawTasks = (a.tasks ?? []) as unknown[]      // 不传 → []
if (rawTasks.length > 0) { /* FR 覆盖门禁 */ }      // 空数组 → 门禁整段跳过
req.plan = { path, summary, tasks, ... }            // 计划对象整体替换 → 旧任务表被清空
```
→ 0 任务的计划**连覆盖校验都不走**，直接进入待批准；批准时 settle 落 `planTasks=[]` → `landPlanTasks(draft=[])` → 无空守卫 → `createdCount=0` → **仍 transitionRequirement('implementing')**。

## 七、「上一轮有没有产出」的判据（BUG-6 的可证伪定义）

产出不能看「agent 有没有回话」（那是投递健康，正是它把循环续了命），只能看**台账/盘上的可观测变化**。建议定义为一组谓词，以「本轮开始时的快照」与「本轮结束时的快照」对比，四者皆无变化 = 本轮零产出：

| # | 谓词 | 取数处 | 为什么要排除噪声 |
|---|---|---|
| P1 | 任务状态发生迁移（todo→in_progress→…→done/canceled） | 任务队列 | 驱动自己的评论不算 |
| P2 | 新增/更新产物登记（`req.artifacts` 条数或 path 集合变化） | 台账 | 汇报会登记 task_detail，是真产出 |
| P3 | 需求状态迁移（statusHistory 新增一条） | 台账 | — |
| P4 | 新增任务卡或 `plan.tasks` 变化 | 台账/队列 | 落库算产出 |

**排除项**：驱动自身写入的 `dive.*`（roundsInStage / lastActiveAt / driverHealth）、心跳评论、闸门后置链评论——否则「循环本身」就成了产出，护栏永远不触发（这正是 S2 的坑）。

**建议行为**：连续 3 轮（P1–P4 全无变化）→ 写 `driverHealth={state:'paused', reason:'stagnant:<status>'}` + 一条 comment（含最近 3 轮的产出判据结果），**停下等人**；人在看板点「继续」即清零计数恢复（与 round-limit 同款恢复口径）。


## 八、补记：「自动开跑失败」的兜底 —— 只有告警，没有修正也没有弹框（当面核对）

**你当时的裁定**（本次对话原话）：*「需要兜底逻辑的：1 是修改成正确的，2 是弹框处理。」*

**现状核对（代码级，2026-10-02）**：失败路径只有三样，**没有修正、没有弹框**：

| 现状有的 | 位置 | 性质 |
|---|---|---|
| 台账系统评论（含恢复指引） | confirm-settle.ts:389-397 | 事后告知 |
| advance.pausedReason='auto_decompose_failed: …' | confirm-settle.ts:399 | 看板可见的停摆标记 |
| 高优告警 | confirm-settle.ts:404-408 → adapters/FailureAlert.ts | **只落宿主日志**（该适配器头注释："移除会话投递通道，只保留日志告警"） |

**缺口有两层**：
1. **兜底的两条出口都没有实现**——既不"修改成正确的"，也不"弹框处理"，只是停下 + 写一行指引；
2. 更糟：**写下的那条指引本身不可执行**（"手动调用 reqboard_decompose" 会被 REQBOARD_DIVE_ARMED 挡住；看板「拆分」同理）。兜底兜在空气里——这正是本次死锁的结构性原因（D2 + D3）。

### 建议条款 BUG-8：失败兜底二选一（先修正、修不了再弹框）

**判定顺序（关键：能否"无歧义"地把状态修到正确）**：

| 情形 | 走哪条 | 动作 |
|---|---|---|
| `plan.tasks` 非空，失败发生在落库之后的收尾步骤（文档/RTM/派发） | **自动修正** | 幂等重放落库并把状态修到 implementing；成功后只留一条 comment，不打扰人 |
| `plan.tasks` **为空**（本次形态："正确的任务表"已不在台账里，盘上 decomposition.md 才有） | **弹框** | 把失败原因 + **已验证可执行**的选项交给用户裁决，例如：① 按 decomposition.md 的任务表重新落库（做 key 一致性校验）、② 退回拆分态重提计划、③ 保持停下 |
| 任何其他失败 | **弹框**（默认） | 同上一行；不得只写日志了事 |

**纪律**：弹框里的**每个选项都必须被自己的门禁验证过**——选项指向的命令若会被 REQBOARD_DIVE_ARMED / REQBOARD_BAD_STATUS / missing_artifact 挡住，就不许写进弹框。（本次事故的直接教训。）

**可证伪验收**：

1. 构造"计划含任务表、落库中途抛错" → 断言**自动修正**：最终 `status=implementing` 且任务卡数 = 计划卡数，**全程无人工交互**；
2. 构造"计划任务表为空"（本次形态）→ 断言**弹框出现**，且选项①执行成功后卡数 = decomposition.md 里的 key 数；
3. 反向：把弹框选项改成一个会被门禁拒绝的命令 → 用例必须**红**（守"指引必须可执行"）；
4. 任何失败路径都**不得**留下"implementing + 0 卡 + 无 pending 弹框"的终态（本事故的形态）；
5. `tests/confirm-settle-plan-persist.test.ts` / `tests/auto-chain-approval.test.ts` 由红转绿（该面护栏，见 BUG-5）。

## 九、边界（预期不做的）

- 不改"计划必须人批准才能落库"这一门槛（本次事故不是门槛问题，是失败后无路可走）；
- 不改 Dive 的 armed 语义本身（"人置 armed 后禁止手动拆分"是刻意设计），只修**失败恢复**与**解锁口**；
- 不重做状态机（`implementing→decomposing` 的产物门是既有设计，修的是"别让自己走到需要回退"）。
