---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 迁移与回滚（REQ-261005193546-1b1a）

> **一句话结论：无迁移脚本、无版本常量变更、回滚不需要动数据。**
> 本需求改的是**取数与判据**（同一份台账/队列，换一种读法），不是数据结构。
> 唯一被写入的新东西是三个**加性可选**字段（缺省 = 未采集），新旧读方都能读。
>
> 后端实现落点与函数命名以 `design/backend.md` 为唯一出处（本篇只谈迁移、回滚、兼容、风险、上线）。
> **边界**：不删数据、不写回填、不加开关、不追溯存量、**不新增错误码**。

## 迁移步骤 <!-- serves: FR-3, FR-6 -->

### 结论：**无迁移脚本** <!-- serves: FR-3, FR-6 -->

| 数据面 | 是否迁移 | 为什么 |
|---|---|---|
| 队列分片 `queue.json`（`TaskRecord`） | **否** | 新增 `canceledAt` / `canceledBy` / `cancelReason` 三个**可选**字段。旧分片缺键 = **未采集**，不是"损坏"、不是"待补齐"。类型上可选、运行时不校验键存在 ⇒ 旧文件原样被读。 |
| 台账 `.dsh-data/dsh-reqboard.json` | **否** | `REQBOARD_SCHEMA_VERSION` 保持 **9**、`QUEUE_VERSION` 保持 **1**；常量、读路径、写路径一字不改。 |
| RTM YAML（`rtm-*.yml`，派生文件） | **否** | 形状不变（不加节、不加字段），只是下次触发时**内容**不含取消卡。旧读取器零适配。 |
| 历史 RTM 追溯文件与任务卡文档 | **否（且不删不改）** | FR-6：不删除、不改写；本需求不提供清理/回填/重写脚本。 |
| 需求目录（含已归档需求） | **否** | 不追溯：不遍历历史需求重算，只在自然触发时按新口径生成。 |

### 为什么"没有迁移"是安全的（而不是"忘了写"） <!-- serves: FR-3, FR-6 -->

1. **缺省语义自洽**：三字段的可选性本身就是语义——`canceledAt === undefined` 表示
   「这次取消发生在留痕上线之前，未采集」。这是**如实**的历史陈述；回填会篡改审计事实
   （FR-6 判据：读取前后目录逐字节一致）。
2. **旧读方不会因新字段出错**：新增可选键对 JSON 解析透明；全仓没有"未知键即报错"的严格校验器，
   也没有按键集判等的运行时形状校验（`TaskRecord` 只是 TS 接口）。
3. **新读方不会因旧数据出错**：所有消费点只读 `status`；三字段只被审计/展示路径按需读取
   （`undefined` → 「未采集」）。
4. **读路径不写回**：`QueueTaskStore.loadInto`（`src/repositories/QueueTaskStore.ts:303`）只做
   `repo.load` → 缓存 → 返回克隆，**不**做规范化回写 ⇒ FR-6 的"读前后逐字节一致"成立。

### 会被"重算"的派生字段（不是迁移，但如实声明） <!-- serves: FR-1, FR-6 -->

`queue.json` 里的 `ready[]` / `layers` / `tasks[].layer` 是**派生视图**，其既有机制是
「每次写事务前用 `topology.compute*` 重算」（`src/domain/queue/normalizeQueue.ts:39`、
`src/repositories/QueueTaskStore.ts:270`）。本需求的口径如下（与 `design/backend.md` 一致）：

| 派生读数 | 本次口径 | 说明 |
|---|---|---|
| `ready[]` | **存量不重写**；下次写事务按新判据（`isDependencySatisfied`）重算 ⇒ 可能**变大**（原先被取消卡钉死的活卡解锁） | **读路径不得读落盘 `ready[]`**（一律 `liveReadyTasks`）✅ FR-1 / D-8 预期 |
| `tasks[].layer` / `layers` | **照旧**（`computeLayers` 判据不改、不重写） | 登记为**刻意差异**：落盘 `layer` **仅历史派生值**，与 `liveLayers` 可能不一致；读路径一律 `liveLayers` |
| `edges` | **不变**（忠实展开全部依赖，V-3 靠它检出悬空） | 刻意不改 |

**这不是迁移动作**：不需要人工运行任何脚本、不写回历史文件、读路径（`loadInto`）不触发重算。

## 回滚路径 <!-- serves: FR-2, FR-6 -->

### 回滚 = 让活卡谓词恒真（一行），并让依赖判据退回"只认 done" <!-- serves: FR-2, FR-6 -->

单点设计自带回滚面：所有消费点都经 `isLiveTask` / `liveTasksOf`，**过滤是否发生**只由这一个谓词决定；
依赖侧同理只由 `isDependencySatisfied` 决定。两处各一行改回原语义即**逐字节恢复旧行为**：

| 面 | 旧行为（回滚后） | 机制 |
|---|---|---|
| 界面投影 | 取消卡**重新出现**（DAG 层级 / 文档面板 / 详情计数 / 卡片列表） | 出口的 `liveTasksOf` 恒等 |
| 覆盖度分母 | 取消卡**重新计入**：标本回到 `106 / 132 = 80`（**压线通过但点名 26 张**；取消卡到 28 张即被拒） | 两个 RTM 入口的 `liveTasksOf` 恒等 |
| 依赖与就绪 | 回到「取消卡阻塞依赖」；被取消卡钉死的活卡重新不可就绪 | `isDependencySatisfied` 退回"只认 done" |
| 分层 | 读路径回到回读落盘 `layer`（活卡可能被取消卡压层） | `liveLayers` 退回落盘值 |
| 取消留痕三字段 | **保持写入**（加性字段在旧读法下被忽略，无害） | 字段仍在台账里，不删不改 |

**回滚是否需要动数据：不需要。** 四条理由：

1. 新三字段是**加性可选**：旧代码读到它们只是忽略，不报错、不需清洗。
2. 回滚后的写路径把 `ready[]` 按**旧判据**重算（同一既有机制），无需人工修数据。
3. RTM YAML 在下一次触发时按旧口径重写，不需手工重建。
4. 全程**没有**破坏性写入（不删卡、不改 id、不改依赖）⇒ 不存在"回滚需要反向迁移"的形态。

**一个必须配套的动作**：依赖判据回滚时，`computeReady`（写路径）与 **V-5**（校验）**必须一起回滚**——
只回滚一处会让 `QueueRepository.save` 直接把队列写拒成 `QUEUE_VALIDATION_FAILED`
（`load` 侧则会 warn 后按不可用处理 ⇒ 队列视图空白）。两条判据的绑定关系见 §风险 ④。

**回滚粒度与代价**：

| 方式 | 动作 | 代价 |
|---|---|---|
| 谓词级（推荐用于"口径要撤"） | 改 `isLiveTask` 与 `isDependencySatisfied` 各一行（V-5 随 `isDependencySatisfied` 同步） | 最小时延；消费点接线与断言域文件都保留（下次再开只需改回） |
| 接线级（用于"某出口出问题"） | 只撤某个出口的单点调用 | 会重新制造"两套口径"——**仅作故障止血**，止血后必须补回 |
| 版本级（用于"整体不可接受"） | 回退代码版本 | 覆盖度分母回到"压线 + 点名 26 张"的惩罚态；历史留痕字段保留 |

> **代价如实说**：回滚让"回退惩罚覆盖度"的病回来（标本 100% → 80 且点名 26 张；取消卡到 28 张即被拒），
> 而 26 张取消卡正是两次回退的产物。故回滚是**故障止血**手段，不是常态选择。

## 兼容期行为 <!-- serves: FR-1, FR-3, FR-5, FR-6 -->

| 情形 | 行为 | 判据 |
|---|---|---|
| 旧分片（无三字段）经生产读路径读取 | 不报错；三字段读出 `undefined`（未采集）；**不写回** | 读前后 `queue.json` 逐字节一致（mtime 亦不变） |
| 已取消的**存量卡**（标本 26 张） | 不回填三字段；不被追溯拒绝；不作为门禁缺口 | 台账三字段仍为 `undefined` |
| 旧 RTM 追溯文件（含取消卡条目） | 保留原样；下次触发才按新口径重写 | 文件不被本需求删除或改写 |
| **存量需求永不触发 RTM（已知边界）** | **追溯读数可能仍含取消卡**——本需求不主动重算任何存量 RTM | 实证：标本 `rtm-accepting.yml` = **106（陈旧）**、`rtm-decomposing.yml` = **132**，两文件自相矛盾且都不完整反映新口径；只有再次触发（任一触发点）才一致 |
| 存量 `queue.json` 的 `ready[]` / `layer` | 不重写；**读路径不读**（用 `liveReadyTasks` / `liveLayers`）；下次写路径自然归一 | 读盘即为旧值，界面读数取现算值 |
| **校验失败的队列（读路径）** | **不得读成 0 张**：降级为 warning + **继续返回队列**；`ready` 以**内存重算**为准（不写盘） | `load` 返回非 `undefined`；`listByRequirement` 返回真实任务数（不是 `[]`） |
| **校验失败的队列（写路径）** | **仍严格**：假就绪照旧拒绝落盘（`QUEUE_VALIDATION_FAILED`，一个字节不落） | `save` 抛错；文件保持上次有效内容 |
| **V-5「漏就绪」** | **从 issue 降为 warning**（可自愈的陈旧派生值） | 上报级别为 warning；不阻断读、不阻断写 |
| **V-5「假就绪」** | **仍是 issue**（真问题） | 上报级别为 issue；`save` 拦死 |
| **JSON 解析失败** | 沿用既有隔离路径（改名挪走 + 返回 `undefined`） | 本次不改这一支（只改"校验失败"的读侧处置） |
| **二次取消（覆盖式）** | 三字段被最新一次取消**覆盖**：**首次取消不可追**（历史看 `statusHistory`） | 第二次取消后 `canceledAt` = 第二次的时间 |
| 已归档 / 已终态需求 | 不重算、不追溯 | 只在自然触发时按新口径生成 |
| 半新半旧（上线后取消的卡 vs 之前取消的卡） | 新卡三字段有值、旧卡未采集；**界面口径一致**（都不显示） | 界面取消卡条数 = 0；台账都保留 |
| 需求级 `canceled`（需求状态，非任务卡） | **不在本需求范围**：需求取消的既有语义、按钮、归档区显示都不变 | `tests/report-shell.test.ts` 的终态按钮断言保持绿 |
| 复活（`canceled → todo`，人工门） | 三字段**保留**（审计事实："曾经取消过"）；该卡重新进入活卡口径 | 复活后该卡出现在视图与分母里 |
| `data-dag-statuses` 属性 | **不含 `canceled` 档**（显示「canceled 0」也是交代，D-7） | 前端属性由 `design/frontend.md` 与 `design/test-cases.md` TC-11 守；后端只保证不把取消卡递出去 |

## 灰度与观测 <!-- serves: FR-2, FR-4 -->

### 开关：**无开关、一次性口径修正**（已裁定） <!-- serves: FR-2 -->

| 理由 | 说明 |
|---|---|
| 口径修正应一次到位 | 开关意味着**同时存在两套分母**——而病根正是"界面 106 / 统计 132 两套口径"。半开状态下门禁按新口径放行、看板按旧口径显示（或反之）会立刻复现本次要修的不一致，且更难定位。 |
| 没有需要渐进暴露的数据风险 | 不改结构、不删数据、不写回填；唯一写行为是加性字段。回滚成本是撤掉单点引用（两行判据）⇒ 用"可一行回滚"替代"灰度"。 |
| 开关会变成永久负担 | 一旦落进配置，就长期存在"该不该开"的分叉与两套断言口径（本仓已有"白名单只增不减"的教训）。 |
| **裁定** | **不加开关**；不做"按需求 / 按端侧 / 按出口"的任何粒度开关（那是把一个口径问题变成 N 个口径问题）。**回滚路径 = 撤掉单点引用（把 `isLiveTask` / `isDependencySatisfied` 退回旧语义，V-5 随之配对回退），不改任何数据。** |

### 观测 <!-- serves: FR-2, FR-4 -->

| 观测点 | 手段 | 是否需要新增 |
|---|---|---|
| 分母口径变化 | 门禁文案已含 `covered/total`（`rtmValidator.checkGate`）⇒ 分母由 132 变 106 **天然可见** | **不需要**新增埋点 |
| 剔卡规模 | `grep -c 'task_id:' <REQ>/rtm-decomposing.yml` 与标本卡数对照 | 不需要（命令即可） |
| 队列校验是否被误伤 | 既有 `console.warn`（`[queue] 队列未通过校验…`）+ `QUEUE_VALIDATION_FAILED` 抛错；**读路径改为 warn + 继续返回**后，"看板空白"这一后果不再出现 | 不需要新增（这是 §风险 ④ 的观测口） |
| RTM 同步失败 | 既有 `console.warn` + `.dsh-data/state/rtm-failures.json` | 不需要（既有） |
| 取消留痕是否落上 | 台账读三字段（或用例断言） | 不需要新增日志 |
| 取消时写需求评论 | **刻意不写**（已裁定）：`statusHistory`（时间 + 人）+ 三字段已覆盖同一事实，第三份副本只增加漂移面 | **已裁定：不写**（见 `design/backend.md` §可观测性） |

## 风险与对策 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

### 风险 ①：某消费点漏改 → 「界面 106 / 统计 132」再次不一致 <!-- serves: FR-2, FR-4 -->

| 项 | 内容 |
|---|---|
| 形态 | 只改了部分出口或只改了一个 RTM 入口；界面与分母各说各话。**本需求的成因就是这个形态**——`SubmitVerification` 的同一用例里，探针（`:208`）吃全量 132、落盘（`:363`）吃 106。 |
| 对策 1 | **单点**：判据 `isLiveTask`、取数 `liveTasksOf`、分母 `liveCountOf`（同文件同源）；消费点不得自写 filter。 |
| 对策 2 | **源码级断言（新建独立用例）**：`tests/live-tasks-single-source.test.ts` 对断言域文件清单逐个断言「不含 `status …'canceled'` 手写比较」且「调用单点」。删掉复用改回手写 → **必红**。 |
| 对策 3 | **两个 RTM 公开入口同时收敛**：看板三条路由直调 `syncRTMYamlWithSnapshot`，只改 `syncRTMYaml` 会漏三条；断言 4 要求**两处入口函数体**都含 `liveTasksOf(`。 |
| 对策 4 | **逆验证（人工，必做一次）**：把 `isLiveTask` 临时改为 `return true` → 单点用例与分母用例**必红**；恢复后转绿。 |
| 残留风险 | 断言域是**显式清单**：新增消费点不进清单就不受保护。缓解：清单写在用例里，评审时以「有没有调用 `liveTasksOf`」为检查项。 |

### 风险 ②：依赖图分层变化影响既有断言 <!-- serves: FR-1 -->

| 项 | 内容 |
|---|---|
| 形态 | 分层与就绪口径变化（取消卡不再阻塞/占层、活卡可能解锁）⇒ 任何把"含取消卡依赖"的期望写死的断言都可能红。 |
| 对策 1 | **口径先定死（D-8 + 本裁定）**：取消卡不构成依赖阻塞；活卡层号 = **删掉指向取消卡的边后重算**（`liveLayers`）。断言按口径改，不按"让测试过"改。 |
| 对策 2 | **先跑一遍看谁真的红**（命令见 §上线顺序 步骤 3）：实测结论是——DAG/层号/`/state`/卡面计数类既有用例**不含取消卡标本**，因此**不会**自然变红；它们属于"**保护不到这次口径**"，需要**新增**标本，而不是改期望值。 |
| 对策 3 | **逐条结论**：见下表（含"不用改"的证据）。 |
| 注意（预期行为，不是缺陷） | `computeReady` 改后：`todo` 卡若唯一前置已取消 ⇒ **立即就绪**，自动链会开工它。这是 D-8 的预期结果（等一张永远不会完成的卡 = 永久卡死）。 |

**既有断言清单（实测 `canceled` 命中数 + 结论）**：

| 用例 | 实测 | 结论 | 为什么 |
|---|---|---|---|
| `tests/read-sites-equivalence.test.ts` | 夹具 `tests/fixtures/read-sites-v8-ledger.json` = **56 卡（50 done + 5 todo + 1 in_progress），0 张 canceled** | **不改** | 逐字节比对（`/state` 的 `tasks`）与计数断言在"无取消卡"标本下过滤后**逐字节不变** |
| `tests/queue/topology.test.ts:205`（非 todo 状态不进 ready，含 `canceled`） | 有 canceled 标本 | **不改** | 该条说的是"取消卡**自身**不是 ready 候选"，与"取消卡作为**依赖**是否已了结"正交 |
| `tests/sheet-projection.test.ts:49`（TC-1.3 canceled 剔除） | 有 canceled 标本 | **不改** | 验收单投影既有口径本就剔取消卡，收编单点后行为等价 |
| `tests/consistency.test.ts:101` / `tests/marks-surfaces.test.ts:85`（取消卡不算条款接收） | 有 canceled 标本 | **不改** | 三方一致性判据已按活卡口径写；本次只是把实现收编到单点 |
| `tests/card-layer.test.ts` / `tests/dag-panel.test.ts` / `tests/dag-view.test.ts` / `tests/dag-layout.test.ts` / `tests/dag-view-state.test.ts` | `canceled` 命中 **0** | **不改，但需新增** | 无取消卡标本 ⇒ 改动不会让它们红，同时它们**保护不了** FR-1 的层号口径 ⇒ 必须新增"取消卡前置 → 活卡不掉层"的标本 |
| `tests/state-payload-client.test.ts` | `canceled` 命中 **0**（payload 为空 stub） | **不改，但需新增** | `/state` 的 `tasks`/`ready` 读数需要带取消卡标本的断言 |
| `tests/queue/topology-integration.test.ts` / `tests/queue-types-integration.test.ts` | `canceled` 命中 **0** | **不改，但需新增** | 三处就绪实现需要"同一标本三处一致"的断言（改前实测三处不一致） |
| `tests/stage-detail.test.ts` | `canceled` 命中 **0** | **不改，但需新增** | 阶段详情（DAG 层级）是"漏过滤"主现场，必须新增含取消卡的装配断言 |
| `tests/header-progress-responsive.test.ts:31` / `tests/report-shell.test.ts` | 命中的是**需求级** `canceled` | **不改、不相关** | 需求状态（需求取消）不在本需求范围 |
| `tests/layer-boundary.test.ts` / `tests/size-budget.test.ts` | **基线本就红**（实测：2 文件 / 4 用例失败；layer-boundary 三条规则红、size-budget 有多个未白名单超限文件） | **不作门禁依据** | 故 FR-4 的断言必须**新建自包含用例**，不得寄望"跑绿这两个"来证明；也不得把它们当回归门 |

### 风险 ③：覆盖度门"放宽"后掩盖真实未覆盖 <!-- serves: FR-2 -->

| 项 | 内容 |
|---|---|
| 形态 | 剔卡让分母变小 ⇒ 覆盖率升高（标本 80 → 100）⇒ 可能掩盖"真的有卡没测试"。 |
| 对策 1 | **分母只剔 `canceled`**：`todo` / `in_progress` / `integrating` / `testing` / `in_review` **一律留在分母**。真未完成的卡照样把覆盖率拉下来。 |
| 对策 2 | **对照标本（同一份真数据，改前后都可复算）**：标本 `REQ-261005105032-3b02` = 132 卡（106 done + 26 canceled），`task_to_tests` 覆盖 106 张。改前 `106/132 = 80.3%` → `rateOf` 取整 **80**（**`80 >= 80` 压线通过**，但 `uncovered` **点名 26 张取消卡**；被**真正拒绝**过的是更早的 `0/132 = 0%` 那一次）；改后 `106/106 = 100%`。差额**恰好等于 26 张取消卡**（不是"少了 26 条测试"）。 |
| 对策 3 | **可证伪的风险触发条件（已算准）**：改前口径下取消卡从 26 张增到 **28 张**（分母 134）时 `106/134 = 79.1%` 取整 **79 < 80** ⇒ 被拒（27 张时 79.7% 取整仍为 80，尚压线）。改后该惩罚消失——这正是本需求的目标，也是"若口径回滚，病会回来"的判据。 |
| 对策 4 | **排除"顺手放宽实施覆盖度"的疑虑（实测）**：把 26 张取消卡从 `fr_to_tasks` 剔除后，11 条 FR **没有一条**掉成全无覆盖；实施覆盖度 **138/138 不变**（阈值 100%）。 |
| 对策 5 | **人可复核的反向读数**：改后 `task_coverage[]` 与 `inputs.tasks[]` **不含**取消卡；复核时看**总数与卡 id 清单**，不看百分比。 |
| 残留风险 | 若某需求**全部**卡被取消 ⇒ 分母 0 ⇒ 门禁**不执法**（既有边界）。此时 100% 是"无项可判"，不是"都测过"。**如实保留**（改它等于改门禁语义，超出本需求）。 |

### 风险 ④：**V-5 与写路径的隐性耦合 → 写被拒 / 读成空队列** <!-- serves: FR-1, FR-6 -->

> 执行者最容易漏、且会**当场炸**的一处。后端篇与本篇各出现一次（同一风险，两处可见）。

| 项 | 内容 |
|---|---|
| 位置 | `src/domain/queue/validateQueue.ts`：V-5「假就绪」`unmet` 判据（`:245`）、假就绪上报（`:247`/`:249`）、「漏就绪」比对（`:253`） |
| **炸点留档（读路径）** | `JsonQueueRepository.load`（`src/repositories/QueueRepository.ts:183`）校验失败原本只 `onWarn` 然后 `return undefined`；上层 `QueueTaskStore.listByRequirement` 把 `undefined` 摊成 `[]` ⇒ **存量只读需求的任务读作 0 张、看板空白**，且只有一条 warn。这条是不得再出现的形态。 |
| 形态 A（写） | `computeReady` 改成"取消卡视为已了结"后，若 V-5 仍按 `byId.get(dep)?.status !== 'done'` 判依赖满足 ⇒ V-5 把新写出的 `ready[]` 判成**假就绪**。`save`（`QueueRepository.ts:209`）在落盘**前**校验，不通过即抛 **`QUEUE_VALIDATION_FAILED`** 且**一个字节都不落盘** ⇒ 该需求**每一次写这张卡所在队列都失败**。 |
| 形态 B（读） | 存量 `ready[]` 为旧口径（已裁定**不重写**）⇒ 新判据下「漏就绪」会命中；若沿用"校验失败 ⇒ 按不可用处理"，整个需求的队列会被读成空。 |
| **对策 1（已裁定：读侧 A+B 合体）** | **读路径宽容**：`validateQueueFile` 失败**不得让整条队列读成 `undefined`** ⇒ 降级为 **warning + 继续返回队列**；`ready` 一律以**内存重算**为准（不读落盘 `ready[]`，**一个字节不写**）。 |
| **对策 2（已裁定：写侧仍严格）** | `save` **强校验不变**：假就绪照旧拦死、拒绝落盘。 |
| **对策 3（已裁定：V-5 两级）** | **「漏就绪」（`:253`）从 issue 降为 warning**（可自愈的陈旧派生值）；**「假就绪」（`:247`/`:249`）仍是 issue**（真问题）。一句话理由：**校验的目的是拦住"写坏"，不是让"派生值陈旧"把存量需求判成没有任务。** |
| 对策 4 | **V-5 判据必须与 `computeReady` 同批改**：`unmet` 改 `isDependencySatisfied`，漏就绪侧继续用 `computeReady`（本就同源）⇒ 写路径自洽；源码级断言（单点用例断言 5/6）守住。 |
| 对策 5 | **V-4 对取消卡不豁免**（与"落盘 `layers` 照旧"配套）：V-4 的 layer 连续性校验基准不变，不因本次改动放宽。 |
| 保留的不变式 | **JSON 解析失败仍走既有隔离路径**（改名挪走 + 返回 `undefined`）——本次只改"**校验**失败"的读侧处置，不碰损坏隔离。存量 `ready[]` 仍**不重写**，下次写路径自然归一。 |
| 判据（可执行） | 造一份"`todo` 卡依赖已取消卡 + 落盘 `ready[]` 为旧口径"的队列标本：**`load` 必须返回非 `undefined`**（队列可用、任务不是 0 张）、**`save` 必须成功**（不抛 `QUEUE_VALIDATION_FAILED`）、读出的 `ready` 含该 `todo` 卡且来自内存重算；标本命令见 §上线顺序 步骤 1。 |

### 风险 ⑤：API 出口漏接 → 客户端各画各的 <!-- serves: FR-1, FR-2, FR-5 -->

| 项 | 内容 |
|---|---|
| 形态 | `handleState`（`stages.ts:87`）全量下发 `tasks`/`ready`，甘特/DAG 画布/卡面计数/详情投影都吃它；漏接这个出口 ⇒ 客户端"一处不一致，处处不一致"。另有 DAG 面板（`QueryDag.ts:234`）与阶段详情（`QueryStageDetail.ts:196/:219`）是独立出口。 |
| 对策 | 出口清单**逐条接线**（`design/backend.md` §出口清单），出口清单与断言域文件清单**一一对应**；新增出口必须同时进两处。 |
| 对策 | 卡面计数（`tasksTotal` / `percentage` / `byStatus`）与任务清单**同源**：都从 `liveTasksOf` / `liveCountOf` 派生，不允许"清单剔了、分母没剔"（这正是"界面 106 / 统计 132"的同型错误）。 |

### 风险 ⑥：留痕写侧漏接"回退批量取消" <!-- serves: FR-3 -->

| 项 | 内容 |
|---|---|
| 形态 | 取消有三类写路径：单卡迁移（`transitionTask`）、需求回退批量取消（`planRollbackTasks`）、占位卡清理（`cancelStaleReworkCards` / `rollbackCleanup`）。只改 `transitionTask` ⇒ **回退产生的取消卡仍无留痕**——而标本 26 张**全部**来自回退。 |
| 对策 | 四个写入点共用 `markCanceled`，且都在**写 `status` 的同一行、同一事务**内（原子、无补偿）。三处批量直写点的 `canceledBy` = **解析为触发该次回退的人**（`kind: 'human'` + `sessionId`）、`cancelReason` = **该批动作的原因**（整批同一条）；触发者真非人工时仍**不写** `canceledBy`。 |
| 验证 | 三路各取消一张卡，逐一断言三字段有值；并断言"回退一次需求"产生的取消卡**全部**有 `canceledAt`/`canceledBy`/`cancelReason`。 |

### 风险 ⑦：三字段的成败语义被误读 <!-- serves: FR-3 -->

| 项 | 内容 |
|---|---|
| 形态 A | 三字段是**覆盖式**（记录"最近一次取消"），与 `statusHistory` 的**追加式**事件流不同族；按"追加"读会误判为丢事件。**如实声明：首次取消不可追**——第二次取消覆盖第一次的 `at`/`by`/`reason`，历史一律看 `statusHistory`。 |
| 对策 | 字段语义写明"最近一次取消"；"全部取消历史"仍以 `statusHistory` 为准（两者同源写入、不冲突）。 |
| 形态 B | `by.kind !== 'human'` 时**不写** `canceledBy` ⇒ 会出现"有 `canceledAt` 无 `canceledBy`"的记录。 |
| 对策 | 语义定死：**留痕只记人**；`canceledBy === undefined` = 非人路径（或未采集），不得据此推断"人没取消"。 |
| 形态 C | 复活（`canceled → todo`）后三字段保留 ⇒ 出现"活卡带 `canceledAt`"。 |
| 对策 | 三字段是**审计事实**（"曾经取消过，谁/何时/为何"），当前态一律看 `status`。 |

## 上线顺序与验证 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 三步顺序的理由：**先把"读法"统一（单点 + 全部出口接线 + 依赖四处判据同改），再加"新写入的字段"，
> 最后补断言**。前两步各自可独立验证且可一行回滚；断言放最后是让"口径先定死、断言照口径写"，
> 而不是让实现去迁就旧期望值。

### 步骤 1：单点 + 全部消费点接线 + 依赖判据四处同改 <!-- serves: FR-1, FR-2, FR-4, FR-5, FR-6 -->

范围：`isLiveTask`/`liveTasksOf`/`liveCountOf`/`liveLayers`/`liveReadyTasks`/`isDependencySatisfied`/
`splitDependencyEdges`/`isReadyTask`/`layerInputOf`（`domain/status/Predicates.ts`）→ 出口清单逐条接线
（`stages.ts`、`QueryDag.ts`、`QueryStageDetail.ts`、`QueryDocs.ts`、`QueryReport.ts`、`QueryState.ts`、
`sheet-tasks.ts`、`content-trace.ts`、`verification-doc-writer.ts`、`backfill-task-refs.ts`、
`SubmitVerification.ts` 四处）→ RTM **两个公开入口顶部** `liveTasksOf` →
**依赖判据四处同改**（`computeReady`、`readyTasks`、`readyTasksOf`、**V-5**）。

验证（仓库根执行；**不把 `layer-boundary` / `size-budget` 当门禁**——二者基线本就红）：

```bash
# 1) 单点行为：7 个状态逐一取值，只有 canceled 不算活卡；消费点无手写 filter
npx vitest run tests/live-tasks-single-source.test.ts

# 2) 分母：两个 RTM 入口同一标本得到同一 coverage.total，且不含取消卡
npx vitest run tests/rtm-yaml-live-tasks.test.ts

# 3) 依赖与就绪：三处就绪一致 + V-5 与写路径自洽 + 取消卡不阻塞 + 活卡层号 = 删边后重算
npx vitest run tests/queue/topology.test.ts tests/queue/topology-integration.test.ts \
  tests/queue/QueueTaskStore.test.ts tests/queue/validateQueue.test.ts \
  tests/queue-types-integration.test.ts

# 4) 出口：/state 的 tasks/ready 与卡面计数不含取消卡
npx vitest run tests/state-payload-client.test.ts tests/stage-detail.test.ts

# 5) 存量不受影响（逐字节等价；夹具实测 0 张取消卡）
npx vitest run tests/read-sites-equivalence.test.ts
```

**V-5 耦合的专项标本（步骤 1 必须绿）**：构造 `todo` 卡依赖已取消卡、且落盘 `ready[]` 为旧口径的队列：

- `load` 返回**非 `undefined`**（队列可用，不被降级成空）；
- `listByRequirement` 返回**真实任务数**（**不是 `[]`、不是 0 张**）——这条专治"看板空白"；
- `save` **不抛** `QUEUE_VALIDATION_FAILED`（写路径仍强校验，但新写出的 `ready[]` 与判据自洽）；
- 读路径的 `ready` 读数来自 `liveReadyTasks`（含该 `todo` 卡，且**不读落盘 `ready[]`**）；
- 上报级别：同一份标本里**「漏就绪」是 warning、「假就绪」是 issue**（用一份刻意写坏 `ready[]` 的标本触发假就绪，断言它仍是 issue 且 `save` 拦死）。

**标本级复核（可直接跑）**：

```bash
grep -c 'task_id:' docs/requirements/REQ-261005105032-3b02/rtm-decomposing.yml   # 重新触发一次 RTM 后应为 106
grep -n 'total_tasks\|tested_tasks' docs/requirements/REQ-261005105032-3b02/rtm-accepting.yml  # 106 / 106
```

> 说明：`rtm-*.yml` 是**触发时生成**的派生文件。**存量需求永不触发 RTM** ⇒ 不重新触发就仍是旧值
> （标本现状：`rtm-accepting.yml` = 106 陈旧、`rtm-decomposing.yml` = 132）。用例内复算请用
> **临时工作区**（把标本队列拷进去），不要写生产需求目录。

### 步骤 2：加字段（加性、可选、零迁移） <!-- serves: FR-3, FR-6 -->

范围：`TaskRecord` 三可选字段 → `markCanceled` → 四个取消写入点（`transitionTask` +
`rollback-tasks` + `stale-rework` + `rollback-cleanup`）。**本步不碰任何读判据**（判据已在步骤 1 定死）。

验证：

```bash
# 取消一张卡：三字段有值（人 / 时间 / 原因，且 canceledAt 与 statusHistory.at 同值）；
# 回退路径产生的取消卡同样有值；非 human 路径不写 canceledBy
npx vitest run tests/live-tasks-single-source.test.ts tests/task-transition-guard.test.ts \
  tests/move-rollback.test.ts tests/rollback-cleanup.test.ts tests/decompose-stale-rework.test.ts

# 旧分片（无三字段）读不报错、不写回（读前后逐字节一致，含 mtime）
npx vitest run tests/t1-decompose-queue-write.test.ts tests/t12-queue-readonly-ordering.test.ts
```

### 步骤 3：补断言（口径先定死，断言照口径写；**新建独立用例**） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**以新增为主**：实测既有 DAG/层号/`/state`/卡面计数用例**不含取消卡标本**，既不会因本次改动变红、
也**保护不了**本次口径（逐条结论见 §风险 ②）。**FR-4 的「新增即红」断言必须新建自包含用例**
（`tests/layer-boundary.test.ts` 当前本就红，不作依据）。

| 新增断言 | 内容 | 为什么 |
|---|---|---|
| 分母 | 同一标本（132 = 106 + 26）经**两个 RTM 入口**得到同一个 `coverage.total = 106`、`rate = 100%` | 防"同一用例两个分母"复现 |
| 分层 | 活卡层号 = **删掉指向取消卡的边后重算**；取消卡不占层、不参与 | FR-1 判据 A2 |
| 依赖 | 同一标本三处就绪实现（`computeReady` / `readyTasks` / `readyTasksOf`）输出**一致**；`todo` 卡唯一前置已取消 ⇒ 进 ready | 改前实测三种答案 |
| **V-5** | 与写路径同判据：新写出的 `ready[]` 不被判假就绪；陈旧 `ready[]` **不把队列读空**（`load` 非 `undefined`、任务不是 0 张）；**漏就绪 = warning、假就绪 = issue** | 风险 ④ 的回归锁 |
| 出口 | `/state` 的 `tasks` 与 `ready` 里取消卡条数 = **0**；`tasksTotal` = 活卡数、`percentage` 按活卡算 | FR-5 / FR-2 判据 A1/A3 |
| 留痕 | 取消后三字段有值（同 `statusHistory.at`）；**回退**批量取消的卡也全有值；非 human 不写 `canceledBy` | FR-3 判据 C7 |
| 兼容 | 旧分片（手工删掉三字段）读 → 不报错、值未采集、**不写盘**（mtime 逐份不变） | FR-6 判据 C8 |
| 防漂移 | 断言域文件清单逐个"不含手写 filter 且调用单点"；两个 RTM 入口都含 `liveTasksOf(`；V-5 含 `isDependencySatisfied(` | FR-4 判据 B6 |

**逆验证（人工，一次性，记录进验收材料）**：

```bash
# ① 把 domain/status/Predicates.ts 的 isLiveTask 临时改为 return true
npx vitest run tests/live-tasks-single-source.test.ts tests/rtm-yaml-live-tasks.test.ts   # 期望：红
# ② 恢复实现
npx vitest run tests/live-tasks-single-source.test.ts tests/rtm-yaml-live-tasks.test.ts   # 期望：绿
```

**全量回归**：`pnpm test`（`layer-boundary` / `size-budget` **基线本就红**，需按"红的是不是本次引入"
逐条分辨，不把它们当门槛）+ `pnpm typecheck`。

## 关键决策与取舍 <!-- serves: FR-2, FR-3, FR-4, FR-6 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 存量取消卡 | 写迁移脚本回填三字段 | **不回填（未采集）** | 回填会篡改审计事实（"当初谁因为什么取消的"变成脚本运行时间）；FR-6 明令无迁移脚本 |
| 字段形态 | 只靠 `statusHistory`（已有 by/reason） | **加三个可选字段** | 留痕要能**按字段**读（RTM/归档/看板）；加性可选 ⇒ 零迁移 |
| 版本常量 | 顺手 bump `QUEUE_VERSION` / `REQBOARD_SCHEMA_VERSION` | **都不动**（1 / 9） | 没有形状变化；bump 会牵出"旧版本拒绝加载"这类既有硬边界（本仓曾踩过） |
| 开灰度开关 | `plugin-config` 加"活卡口径开关" | **不加**（已裁定：无开关、一次性口径修正） | 半开 = 同时存在两套分母，正是本次要修的病；回滚 = 撤掉单点引用（不改数据） |
| 读路径遇校验失败 | 沿用"整条判不可用"（`load` 返回 `undefined` ⇒ 任务读作 0 张、看板空白） | **warning + 继续返回队列；`ready` 内存重算（不写盘）；`save` 仍强校验** | 校验的目的是拦住"写坏"，不是让"派生值陈旧"把存量需求判成没有任务（A+B 合体裁定） |
| 一次性 vs 分批 | 按"按需求/按端侧"分批生效 | **一次到位** | 分批 = 同一时刻两种口径并存；且无需要渐进暴露的数据风险 |
| 读路径取就绪/层号 | 回读落盘 `ready[]` / `layer` | **`liveReadyTasks` / `liveLayers` 现算** | 落盘值有时效窗口（`ready` 只在下一次写事务刷新；`layer` 已裁定为历史派生值） |
| 落盘 `layers` | 同步改成活卡口径 | **照旧**（登记为刻意差异） | 减少改动面；V-4 校验基准不变；读路径不依赖它 |
| 存量 `ready[]` | 读一次就顺手重写 | **不重写**（读路径不读它） | 读路径写盘会破坏 FR-6「读前后逐字节一致」 |
| V-5 | 只改 `computeReady`（V-5 以后再说） | **同批改**（读侧另加宽容，见风险 ④） | 不同改 ⇒ 写被 `QUEUE_VALIDATION_FAILED` 拒、读被降级成空队列 |
| 断言策略 | 改既有期望值让测试过 | **先定口径，新建自包含用例为主** | 既有用例里没有取消卡标本（实测），改期望值改不到点子上；且 `layer-boundary` 基线本就红 |
| 需求评论留痕 | 取消时写一条需求评论（照豁免先例） | **刻意不写（已裁定）** | `statusHistory`（时间 + 人）+ 三字段已覆盖同一事实，第三份副本只增加漂移面 |

## 技术方案与亮点 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**为什么这次可以"零迁移"**：

1. **改读法不改写盘结构**：修的是"谁进分母 / 谁进视图 / 谁的边算阻塞"，台账与队列结构一字未动。
2. **加性可选字段**：新字段缺省即有语义（未采集）⇒ 不存在"必须回填才能读"的形态。
3. **派生数据自愈**：`ready[]` 由既有"写前重算"机制按新判据刷新；RTM YAML 由触发重写；
   `layers` 照旧但读路径不依赖它。
4. **回滚面 = 两行判据**：单点设计让"口径是否生效"收敛到可替换的判定函数，回滚不需要反向迁移、
   不需要清洗数据；判据回滚时 `computeReady` 与 V-5 一起退（配对关系已写进风险 ④）。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向 |
|---|---|---|---|---|
| 迁移 | 加字段就写迁移脚本 | **无脚本**（缺省 = 未采集） | 历史事实不能被脚本重写时间戳 | 本篇 §迁移步骤；验收 C8 |
| 回滚 | 准备反向迁移/数据修复 | **两行判据恒真 / 退回旧判据** | 单点设计自带回滚面；无破坏性写入 | 本篇 §回滚路径 |
| 灰度 | 加配置开关按比例放量 | **不加开关，一次到位** | 两套分母并存 = 复现本需求要修的病 | 本篇 §灰度与观测 |
| 派生值 | 读落盘 `ready[]` / `layer` | **读路径现算且与写路径同判据** | 落盘值有时效窗口；且 V-5 的判据必须与写路径一致 | 验收 A2 / 风险 ④ |
| 断言 | 改动后修既有期望值 | **先定口径、新建自包含用例** | 既有用例无取消卡标本（实测）；`layer-boundary`/`size-budget` 基线本就红 | 本篇 §风险 ②；验收 B6 |
| 存量追溯 | 遍历重算所有需求的 RTM | **只声明已知边界**（存量永不触发 ⇒ 读数可能含取消卡） | 主动重算会大面积改写派生文件与审计面 | 本篇 §兼容期行为（实证 106 / 132） |

**遗留与如实声明**：

- 断言域是**显式清单**（消费点必须进清单才受源码级断言保护）——清单不足以防"未来新增出口漏接"。
- `total = 0` 不执法（全卡取消）时覆盖率显示 100% 是"无项可判"，不是"都测过"：**保留**该既有边界。
- 落盘 `layer` 与 `liveLayers` 可能不一致：**刻意差异**（落盘值仅历史派生值）。
- 存量需求永不触发 RTM ⇒ 追溯读数可能长期含取消卡：**已知边界**（不假装已修）。
- 读路径遇校验失败**不再**把整条队列判为不可用（降级为 warning + 继续返回 + `ready` 内存重算）；
  `save` 仍强校验；V-5「漏就绪」= warning、「假就绪」= issue。**已裁定**（风险 ④ 对策 1~3）。
- 三字段为"最近一次取消"语义（覆盖式）：**首次取消不可追**（历史看 `statusHistory`）；非 human 不写 `canceledBy`。
- **无开关**（一次性口径修正）：回滚 = 撤掉单点引用（`isLiveTask` / `isDependencySatisfied` 退回旧语义，V-5 配对回退），**不改任何数据**。
- 取消时**刻意不写**需求评论/任务评论（避免同一事实的第三份副本）。
- 本篇与 `design/backend.md` 无内容重复：本篇只谈**迁移/回滚/兼容/风险/上线**，
  代码落点、出口清单与函数契约一律以后端篇为唯一出处；**落点以函数名为准、行号仅供参考**（并发改动可能漂移）。
