---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 调研报告：reqboard 插件潜在问题与功能优化（REQ-261007165643-4275）

> 本报告是 spike 的终态产物。方法：三路并行只读源码审查（工具面 / 状态机与应用层 / 文案契约），
> 所有结论附 `文件:行号` 证据，未修改任何源码。
> 证据基线工作树：dsh-pmboard 仓，2026-10-07。

## 目录 <!-- serves: FR-1 -->

- [FR-1 工具面重复/职责重叠清单](#fr-1-工具面重复职责重叠清单)
- [FR-2 状态机/幂等/并发/降级路径问题清单](#fr-2-状态机幂等并发降级路径问题清单)
- [FR-3 文案与契约一致性清单](#fr-3-文案与契约一致性清单)
- [FR-4 优化方案](#fr-4-优化方案)

---

## FR-1 工具面重复/职责重叠清单 <!-- serves: FR-1 -->

### 1.0 口径说明 <!-- serves: FR-1 -->

- 实际注册工具数 = **27**（`src/tools/registry.ts:35-36`，「27 条 = 磁盘上 27 个工具目录」）；
  package.json 描述与部分文档写 27，本需求早期估算的「28 个目录」系误记（28 个目录中含非工具文件）。
- 注册数以 `grep -c "toolName: 'reqboard_" src/tools/registry.ts` 读数为准。

### 1.1 工具职责总表（27 个） <!-- serves: FR-1 -->

| # | 工具名 | 一句话职责 | 裁定 |
|---|--------|-----------|------|
| 1 | reqboard_capture | 立项弹框四问 + 创建 + 绑定（首选路径） | 核心 |
| 2 | reqboard_create | 已知三值时的手工立项 + 代理立项（owner_window） | 核心（capture 的降级路径，互补但文案重叠） |
| 3 | reqboard_status | 窗口绑定状态自查；返回体极大（席位/FR 覆盖/RTM/追溯链/挂起确认） | 核心但臃肿（输出 schema 全工具面最重） |
| 4 | reqboard_submit | 6 个 kind 合一的阶段产物提交口 | 核心但单体过载（schema 515 行） |
| 5 | reqboard_ask_confirm | 关键确认：弹框路径 + evidence 文字证据路径自动分派 | 核心（原生 ask_user_question 的分层增强，非重复） |
| 6 | reqboard_confirm_receipt | 非阻塞弹框挂起回执取件口（唯一入参 ticket） | **可合并** → ask_confirm 加 ticket 入参 |
| 7 | reqboard_accept_sheet | 验收单逐项弹框验收（批量 ≤10） | 核心 |
| 8 | reqboard_task_run | 自动实施链唯一入口（目录名 AdvanceTool，命名债） | 核心 |
| 9 | reqboard_task_execute | 已弃用别名，真委托同 factory | **冗余，建议删除** |
| 10 | reqboard_run_status | 实施链运行快照（stepIndex/jobStatus/nextReady） | **可合并** → status 加 run 节 |
| 11 | reqboard_task_status | 单卡执行状态 + 最近 run/汇报 | **可合并** → task_tree 单卡展开 |
| 12 | reqboard_task_tree | 父子卡结构只读视图 | 核心（可吸收 10、11） |
| 13 | reqboard_move | 需求阶段推进（五道人工门） | 核心 |
| 14 | reqboard_task_move | 任务状态机 + acceptance 修订 + budget 放行 + tasks[] 批量 | 核心但单体过载（4 种职能，下一个过载候选） |
| 15 | reqboard_task_report | 任务完工汇报 → 卡文档 + 产物登记 | 核心 |
| 16 | reqboard_decompose | 批准计划落库任务卡 DAG | 核心 |
| 17 | reqboard_task_adopt | 归属补救（缺 parentId 补挂） | 修缮类，可合并 |
| 18 | reqboard_task_regenerate | 缺子卡链补链（dry_run/真补） | 修缮类，可合并 |
| 19 | reqboard_task_refs | 补写 requirementRefs（全量替换） | 修缮类，可合并 |
| 20 | reqboard_archive_amend | 归档后补录清单条目（只追加） | 修缮类，可合并（但不建议塞进 submit，见 1.2.7） |
| 21 | reqboard_note_interruption | 断点补写兜底（正常路径已自动写） | 低价值兜底，可下沉 |
| 22 | reqboard_clear_pause | 解除 Dive armed 锁 | 核心（利基但唯一） |
| 23 | reqboard_kb | 项目知识层检索（budgetChars 裁剪 + 指针返回） | 核心（描述刻意冻结保缓存，互补于读文件） |
| 24 | reqboard_open_window | 开新会话窗口（fork/create + seed_text） | 核心（与 handoff schema 逐字重复） |
| 25 | reqboard_bind | 席位管理（worker/observer） | 核心 |
| 26 | reqboard_handoff | 需求交接：换 owner + 留痕 + 投底稿 | 核心（内部复用开窗用例） |
| 27 | reqboard_skill_install | UI/UX skill 资产投放 | 核心（利基但唯一） |

### 1.2 重叠对清单（按严重程度排序） <!-- serves: FR-1 -->

#### 1.2.1 task_execute vs task_run —— 完全重复（冗余度 100%） <!-- serves: FR-1 -->

- 证据：`src/tools/TaskExecuteTool/TaskExecuteTool.ts:28-30` —— `defineTaskExecuteTool` 直接
  `Object.assign({}, defineAdvanceTool(deps), { name: 'reqboard_task_execute', … })`，
  同 parameters、同 output、同 execute、同 autoRun 副作用，只换名字与描述。
- 描述自带「【已弃用：等价 reqboard_task_run，请改用后者】」（`TaskExecuteTool.ts:21-25`），
  但仍占一个常驻 schema 槽位，每轮请求重发。
- 保留理由仅为「删除会让存量调用方硬断」（`TaskExecuteTool.ts:4-8`，decision D-1 选 A）。
- **建议**：给一个版本周期的淘汰期后物理删除；删除前把 `AdvanceTool` 目录改名为 `TaskRunTool`
  （目录名与工具名 reqboard_task_run 不一致，`registry.ts:116-121`，纯认知负担）。

#### 1.2.2 capture vs create —— 双立项路径（重叠度 ~80%，建议保留双工具、收敛文案） <!-- serves: FR-1 -->

- 证据：职责划分清晰（弹框 vs 已知值手工），`CreateTool/prompt.ts:5-10` 与 `CaptureTool/prompt.ts:19`
  互相指路；但两份 prompt 大面积逐字重复同一套纪律文案
  （四问内容、reqboard_status 自查、闲聊不立项——`CreateTool/prompt.ts:21-22` 与 `CaptureTool/prompt.ts:20/23`）。
- 口径分散四处：`CaptureTool/prompt.ts:5` 注释自证「schema + 三处注入文案
  （capture-section.ts / QueryState.ts / CreateTool/prompt.ts）」，改一处必改全部。
- 代理派活双参数路径：create 的 owner_window（`CreateTool.ts:52-59`）vs
  capture 的 on_window_bound=handoff（`CaptureTool.ts:48-52`）。
- **建议**：纪律文案收敛为 shared 常量单源；create 的 prompt 只留「何时用我」+ 指向 capture。

#### 1.2.3 四个查询面 status / task_tree / run_status / task_status（信息重叠 30~50%） <!-- serves: FR-1 -->

- status（`StatusTool.ts:19-262`）：返回体约 6757 字符，27 个工具里输出最重；
  同时还是确认回执的兜底查询面（`ConfirmReceiptTool/prompt.ts:8` 指引「改调 reqboard_status 读 design_docs[].confirmed」）。
- run_status（`RunStatusTool.ts:31-38`）与 task_status（`TaskStatusTool.ts:27-38`）
  的字段与 task_tree 节点（`TaskTreeTool.ts:65-71` 的 status/lastRunOk/reportSummary）字段级重叠。
- **建议**：run_status 并入 status（加 run 节）；task_status 变为 task_tree(task_id) 单卡展开模式。**省 2 个工具槽位**。

#### 1.2.4 move vs task_move vs task_run —— 不算重复，但 task_move 是下一个过载候选 <!-- serves: FR-1 -->

- 三者层级不同：需求状态机（`MoveTool.ts:19-25`）/ 任务状态机（`TaskMoveTool.ts:96-107`）/ 自动链投递（`AdvanceTool.ts:77-170`）。
- task_move 已塞 4 种职能：状态推进 / acceptance 修订 / tasks[] 批量 / budget 放行（`TaskMoveTool.ts:119-133`）；
  `TaskMoveTool.ts:120` 注释自证「不新增工具（工具 schema 每轮请求都要重发）」——作者已知成本，选择在存量工具上堆参数。
- **建议**：保持现状但标注风险；budget 若再长出新参数即应拆分。

#### 1.2.5 ask_confirm 双路径 + confirm_receipt —— 增强非重复，但 confirm_receipt 可并入 <!-- serves: FR-1 -->

- 双路径：`AskConfirmTool.ts:85-86` 按 evidence 是否为空分派 confirmArtifact / askConfirm 两个用例；
  弹框路径是原生 ask_user_question 的超集（阻塞等待 + 自动落章 + 阶段推进 + 写路径停手守卫）。
- confirm_receipt 唯一入参 ticket（`ConfirmReceiptTool.ts:22-26`），只是挂起回执取件口。
- **建议**：confirm_receipt 并入 ask_confirm（可选 ticket 入参 = 取回执模式），**省 1 个工具**；
  同时把 731 字符的单段 prompt 拆成「弹框路径 / evidence 路径」两短段。

#### 1.2.6 开窗能力散布 4 处：open_window / handoff / capture(handoff) / create(owner_window) <!-- serves: FR-1 -->

- open_window 纯造窗（`OpenWindowTool.ts:33-55`）；handoff 造窗 + 换 owner（`HandoffTool.ts:45-58`）。
- mode 枚举逐字重复（`HandoffTool.ts:17-18` vs `OpenWindowTool.ts:14-15`）；
  inheritance 子 schema 逐字重复（`OpenWindowTool.ts:66-80` vs `HandoffTool.ts:86-100`）。
- **建议**：工具数不动；mode/inheritance schema 抽公共常量消两处逐字重复；
  prompt 层面统一分工话术：「造窗找 open_window，交需求找 handoff，立项派活找 capture/create」。

#### 1.2.7 submit(kind=archive) vs archive_amend —— 时间窗不重叠，不建议合并 <!-- serves: FR-1 -->

- submit(kind=archive) 是归档动作本身；archive_amend 是归档后只追加补录（`ArchiveAmendTool.ts:19-26`）。
- **建议**：保留。submit schema 已 515 行过载，再塞第 7 个 kind 更糟；若未来要压缩工具数，
  archive_amend 归入修缮合并工具（见 1.2.8）而非 submit。

#### 1.2.8 五个修缮工具（adopt / regenerate / refs / archive_amend / note_interruption） <!-- serves: FR-1 -->

- 单职能、低频次、均为「补救/兜底」语义。agent 选错面最大的簇之一。
- **建议**：保守版——refs + adopt + regenerate 合一为 `reqboard_task_amend(op=refs|adopt|chain)`（**-2**）；
  激进版——五合一 `reqboard_amend(op=…)`（**-4**）。

#### 1.2.9 kb vs 直接读文件 —— 互补，非重复 <!-- serves: FR-1 -->

- kb 的价值是 budgetChars 裁剪 + 指针返回 + 机器索引（`KnowledgeTool/prompt.ts:4-8` 注释自证描述冻结保前缀缓存）。
- 风险反向：kb 描述仅 103 字符，agent 可能不知道知识层存在——建议在阶段提示词片段引导，而非加长工具描述。

### 1.3 双字段兼容统计 <!-- serves: FR-1 -->

显式双拼法（snake + camel 同时声明、两者都认）**共 3 对 6 个字段，全部集中在 reqboard_submit 的 tasks[] 子 schema**：

| 字段对 | snake | camel | 归一位置 |
|--------|-------|-------|---------|
| 依赖理由 | dep_reasons（`SubmitTool.ts:94`） | depReasons（`SubmitTool.ts:105`） | `protocol.ts:1197-1199`；`plan-deps-check.ts:79` |
| 跳联调理由 | skip_integration_reason（`:88`） | skipIntegrationReason（`:89`） | `protocol.ts:1180-1186` |
| 粒度豁免理由 | granularity_exempt（`:92`） | granularityExempt（`:93`） | `protocol.ts:1218-1220`；`plan-granularity.ts:73` |

- 根因：`SubmitTool.ts:85-87` 注释——schema 是 additionalProperties:false，只声明一种拼法 = 另一种被绑定层拒收。
- 次生问题：归一逻辑分散两处，plan-granularity.ts:73 又独立做一次双拼读取（单源原则破坏点）。
- **隐性命名分裂**：同一 tasks[] 对象内 snake（key/requirement_refs/depends_on/dep_reasons，`:62/63/94/110`）
  与 camel（prototypeRefs/decisionRefs/skipIntegration，`:67/68/84`）混用，agent 实测踩坑高发面
  （`:64-66`、`:90-91` 注释记载 prototypeRefs、footprint、granularity_exempt 都栽过拒收）。

### 1.4 prompt/schema 漂移（本路发现的契约问题，详见 FR-3） <!-- serves: FR-1 -->

- SubmitTool prompt 说「kind 区分五类」（`SubmitTool/prompt.ts:9`），实际 SUBMIT_DISPATCH 6 个 kind（`SubmitTool.ts:29-36`，含 prototype）——**已漂移**。
- AdvanceTool 目录名 ≠ 工具名 reqboard_task_run。
- LONG_TEXT_ARG_NOTE 单源常量在 9 个工具参数描述里逐字重复（`shared.ts:38-49` 登记表）——合规但每处占 schema 字节。

---

## FR-2 状态机/幂等/并发/降级路径问题清单 <!-- serves: FR-2 -->

> 方法：通读 src/domain / src/application（use-cases、gate、internal、dive）/ src/repositories / src/http，
> 逐条附 `文件:行号` 证据；关键证据已由本窗口抽检复核（H1/H2/M1/M3 四处抽检全部属实）。
> TODO 统计：全仓真实标记仅 3 处 TODO、0 处 FIXME/HACK/XXX
> （`orphan-collector.ts:49`、`content-gate-wiring.ts:909`、`:925`——后者使 testCoverage.tested 恒为 0，
> 若被看板消费即静默假数据）。

### 2.1 高危（H） <!-- serves: FR-2 -->

#### H1 确认弹框「否定作答无反馈」路径必抛硬错误 —— 已修事故的漏网孪生 <!-- serves: FR-2 -->

- 证据：`src/application/use-cases/AskConfirm.ts:449` —— 弹框否定作答且无自定义反馈时返回
  `user_feedback: undefined`；经 dsh-tools snapshotJsonValue 校验（walkJsonValue 对 undefined 返回 void 0）
  必抛 "value is not lossless JSON" 的 ToolOutputError。
- 触发条件：五道人工门任一弹框，用户选「需要修改/暂停」但不填反馈意见。
- 后果：软回执（未落章、未推进）变成无信息硬错误，agent 拿不到 user_choice；与已修的
  RunStatusTool null 透传事故同类的漏网孪生。
- 修复方向：条件展开（有反馈才带该键），一行修。**优先级最高。**

#### H2 HTTP 路由完整绕过人工门 + 看板可推子卡进非法态 <!-- serves: FR-2 -->

- 证据：`src/http/routers/tasks.ts:118`、`requirements.ts:148,587` —— actor 取自请求体、
  缺省 'human'、无鉴权（`asActor` 仅校枚举，`protocol.ts:1991`）。
- 触发条件：本地任意进程（含 agent 自己的 bash）`curl` 直接调 HTTP 路由取消/归档需求。
- 后果：human_gate 的代码级拒绝只对工具面有效，HTTP 面敞口——人工门可被间接绕过（本需求 FR-2 重点排查项，坐实）。
- 附带：`handleTaskMove` 不传 role，看板可把子卡推进 integrating/testing/in_review（SUBTASK_TRANSITIONS 无出边的非法态）。
- 修复方向：HTTP 面加窗口/角色校验（至少与工具面同构的 human_gate 判定）；handleTaskMove 传 role。

#### H3 跨进程写无锁：lost update / 分片日志误收编 / 双链并跑 <!-- serves: FR-2 -->

- 证据：`QueueTaskStore.serialize`（`QueueTaskStore.ts:335`）与 `ShardedRequirementWriter.serialize`（`:414`）
  都是**进程内**队列；「写前重读 + rename 原子」防不了跨进程 lost update；
  分片日志「追加→提交点」协议（`ShardedRequirementWriter.ts:285-303`）跨进程交错时会把别进程未提交行当已提交收编；
  advance.lockAt stale 接管存在跨进程 TOCTOU。
- 触发条件：两个 DSH 进程（或插件多实例）同时操作同一工作区台账。
- 后果：同需求双链并跑、台账互相覆盖。
- 修复方向：需先定部署拓扑（单进程假设是否成立）；若要多进程安全，需文件锁或锁服务。**依赖决策，缓执行。**

### 2.2 中危（M） <!-- serves: FR-2 -->

| # | 问题 | 证据 | 触发条件 → 后果 | 修复方向 |
|---|------|------|----------------|---------|
| M1 | run_status 的 stepIndex/currentSubtaskId 是**死字段**：`CheckpointManager.writeCheckpoint` 全仓无调用方 | grep 证实（仅 checkpoint-manager.ts 自身与注释） | 恒报第 0 步 → 静默错进度 | 接上调用方或删字段（与 FR-1 的 run_status 合并一并处理） |
| M2 | 需求 canceled→draft 复活边未入人工门 | `RequirementStatus.ts:77` | agent 可撤销人做的取消（与任务侧 canceled→todo 人工门不对称） | 复活边挂 human_gate |
| M3 | 批量 task_move 在冻结快照上判全批 | `MoveTask.ts:732-746` | 60s 节流（事故 C 防线）在批内整批失效，单次调用可关 20 张顶层卡 | 批内仍计节流或限制批内 done 数 |
| M4 | 回退落库跨存储两段写无 Saga | `MoveRequirement.ts:191-209` | 需求 mutate 失败时已物化/已取消任务无补偿；statusHistory 丢「子卡原地复位」事件、取消卡无 canceled 事件、version 不+1 | 两段写加补偿/顺序调整；补状态事件 |
| M5 | 自动链**先执行后认领** | `ExecuteTask.ts:561-588` | in_progress 在 run 结束后才写 → 自动链与手动入口可并发双跑同一张子卡（双倍成本 + 跨卡覆盖误判）；凭证门基准已改 chainBaselineOf，原始动机已不存在 | 改为先认领（先写 in_progress）后执行 |
| M6 | 时钟漂移使 throttleRemainingMs > 60s | `DoneEvidenceSpec.ts:76-80` | h.at 在未来（时钟回拨/漂移）时节流剩余时间超上限 | clamp 到 [0, 60s] |

### 2.3 低危（L） <!-- serves: FR-2 -->

| # | 问题 | 证据 |
|---|------|------|
| L1 | orphan-collector 死代码 + TODO + Date.now 不走注入时钟 | `orphan-collector.ts:46-50` |
| L2 | 生产代码残留 console.log 调试输出 | `ExecuteTask.ts:391,640,656`、`subtask-evidence.ts:185` |
| L3 | 需求 invalid_transition 报错不含合法边清单（任务侧有 legalEdgesFor，不对称） | MoveRequirement 侧 |
| L4 | QueryRunStatus.autoRun=jobStatus==='running' 与 req.autoRun 口径不一 | QueryRunStatus |
| L5 | QueryRunStatus.findReadyTasks 是第二份 ready 判定（违反 normalizeQueueFile 单点纪律）；canceled 依赖永不 done → 死等无解释 | QueryRunStatus |
| L6 | 懒展开 push 共享数组，与「副本+逐项 catch=该项不落账」承诺有缝 | `MoveTask.ts:880` |
| L7 | atomicWrite 临时文件名无进程标识（与 H3 同族） | `atomicWrite.ts:78` |

### 2.4 正面结论（排查过但健康的面） <!-- serves: FR-2 -->

- **状态机主表**未见缺边/多余边：回退边生成式合成、task 三角色（父卡/子卡/存量卡）表分离，设计良好。
- **幂等实现总体扎实**：canonical 比较 + mtime 判据、BindSeat 全分支幂等、plan 重交旧批准作废。
- **「台账无回滚」是显式设计**且单项失败隔离到位；唯一真实暴露点是 M4 的跨存储两段写。

---

## FR-3 文案与契约一致性清单 <!-- serves: FR-3 -->

> 方法：逐工具对比 prompt.ts / 内联 description 与 *Tool.ts schema、use-cases 实现；
> 用 tsx 实测 agent 可见文案字符数；grep 全量错误码。工具数口径经四方复核：
> package.json / README / registry.ts / src/index.ts 均为 **27**，一致 ✅。

### 3.1 高优先级不一致（文案会误导 agent 行为） <!-- serves: FR-3 -->

| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| C-1 | **立项「几问」六处漂移**：实现是 5 问（`capture-mapping.ts:30-36` CAPTURE_QUESTION_IDS；`CaptureRequirement.ts:335` 回执写「五问」），但文案三问/四问并存：`capture-section.ts:377`「三问」、`QueryState.ts:223`「三问」、`CreateTool/prompt.ts:6`「三问」、`CaptureTool/prompt.ts:10`「四问」、`capture-mapping.ts:1 vs :12` 同文件自相矛盾、`README.md:12 vs :51` 内部不一致 | 见左 | agent 对弹框问题数预期错误；`capture-mapping.ts:12` 声称的「四处同一口径」承诺已破产 |
| C-2 | **submit prompt 说「五类」且完全漏掉 kind=prototype**：`SubmitTool/prompt.ts:11` 只描述五支，prototype 一字未提；实现 6 分派（`SubmitTool.ts:29-36`）。头注释「4 个」/prompt「五个」/实现 6 个三个数字并存 | `SubmitTool.ts:2`、`prompt.ts:2` | 只读描述的 agent 不知道原型登记入口存在 |
| C-3 | **agent 可见文案指向不存在的文档 7 处**：`agent-dh/docs/architecture/requirement-archive.md` 本仓不存在（旧 monorepo 路径）——`SubmitTool/prompt.ts:35`、`protocol.ts:983`、`capture-section.ts:161`、`ArtifactSpec.ts:58,75`、`client/views/verification.ts:253-254`；另 `errors.ts:10` 引 `docs/standards/tool-development.md` 目录不存在 | 见左 | agent 每次归档都踩死链；GUI 也可见 |
| C-4 | **CreateTool prompt 漏 doc_location**：`CreateTool/prompt.ts:11-12` 只列五参，`CreateTool.ts:47` 却有 doc_location（自称「第四问」） | 见左 | 照 prompt 调用永远不设文档位置，静默走默认 |
| C-5 | **ask_confirm 阻塞拦截清单不全**：prompt 列 4 个写路径，实际挂 `assertNoPendingConfirm` 的有 **8 个**（另含 archive_amend/task_refs/task_adopt/task_regenerate：`ArchiveAmendTool.ts:68`、`TaskRefsTool.ts:57`、`TaskAdoptTool.ts:76`、`RegenerateTool/index.ts:86`） | `AskConfirmTool/prompt.ts:16` | 阻塞期调未列出的工具吃到「文案没说」的拒绝 |
| C-6 | **task_move budget 的 CAS 参数有 schema 无描述**：`TaskMoveTool.ts:128-131` expectedWindowIndex 存在但 description 只说 {release, add?} | 见左 | agent 不知道可带 CAS 号防并发覆盖 |

### 3.2 错误码统计 <!-- serves: FR-3 -->

- **大写 REQBOARD_* 码 136 个**（去重），分布 **123 个 .ts 文件**，无集中注册表。
  复核口径注记（t1 定稿重跑）：`grep -rho "REQBOARD_[A-Z_]*" src --include=*.ts | sort -u` 得 139；
  剔除占位符 REQBOARD_XXX（2 处示例文案）与模板串裸前缀 `REQBOARD_`（13 处 `REQBOARD_${…}` 拼码）后 ≈136~138，
  与首查 136 的差在验收标准允许的 ±2 口径差内——差异源是模板拼码与占位符是否计入。
- 分层：application 104 / domain 30 / tools 28 / client 15 / http 14 / adapters 13 / repositories 5 / shared 4。
- 单文件最多：MoveTask.ts 39、SubmitArtifact.ts 21、MoveRequirement.ts 21、SubmitVerification.ts 20、SubmitArchive.ts 20。
- `domain/errors.ts` 的 REQBOARD_ERROR_CODES 只收 16 个小写领域码；136 个大写码全是散落字符串字面量——**设计上就没有事实源**，「prompt 列的码 = 代码抛的码」无法机械检查。
- prompt 错误码清单 vs 实现抽查：Bind/Handoff 清单基本对齐（可作样板 ✅），但普遍漏码：OpenWindow 漏 OPEN_WINDOW_FAILED（`OpenWindow.ts:154`）、SkillInstall 漏包装码 SKILLS_INSTALL_FAILED（`SkillInstallTool.ts:76`）、Create 漏 WINDOW_BOUND/INVALID_INPUT/INVALID_WORKSPACE、RunStatus 漏 REQUIREMENT_NOT_FOUND（`RunStatusTool.ts:130`）。

### 3.3 描述长度排名（实测：description + 参数描述字符数） <!-- serves: FR-3 -->

27 个工具合计 **21,588 字符**（desc 12,192 + params 9,396），每轮请求常驻。前 10：

| 排名 | 工具 | desc | params | 合计 |
|---|---|---|---|---|
| 1 | reqboard_submit | 1,980 | 3,901 | **5,881（占总量 27%）** |
| 2 | reqboard_create | 979 | 690 | 1,669 |
| 3 | reqboard_task_move | 488 | 800 | 1,288 |
| 4 | reqboard_ask_confirm | 731 | 520 | 1,251 |
| 5 | reqboard_capture | 840 | 308 | 1,148 |
| 6 | reqboard_handoff | 837 | 226 | 1,063 |
| 7 | reqboard_run_status | 810 | 80 | 890 |
| 8 | reqboard_open_window | 630 | 222 | 852 |
| 9 | reqboard_bind | 559 | 216 | 775 |
| 10 | reqboard_skill_install | 502 | 168 | 670 |

最短：reqboard_status 62。注：第一路按源码行宽粗估的 ~4 万字符与本路实测 2.16 万存在口径差（前者含 schema 结构开销与注释），**以本路工厂产物实测为准**。

### 3.4 prompt 内嵌历史叙事清单 <!-- serves: FR-3 -->

agent 可见字符串中的 REQ 编号/日期引用约 **12 处**：

1. `SubmitTool/prompt.ts:15`「2026-10-06 12:00 UTC 之后立项」——**功能性判据**（真被用作 cutoff），建议改为按需求记录版本标记而非日期字面量。
2. `SubmitTool/prompt.ts:18`「2026-09-21 起设计阶段只写设计文档」——纯叙事，可删。
3. `SubmitTool/prompt.ts:27-31`「REQ-261006092213-4f5b FR-1/FR-2」。
4. `RunStatusTool/prompt.ts:22-26` 两段修复史（~200/810 字符）——首次接触的 agent 纯噪音。
5. `CaptureTool/prompt.ts:21`「REQ-260922012924-2e29 FR-5」。
6. schema 参数描述内：`AskConfirmTool.ts:62,64,67`、`SubmitTool.ts:198,432,459,490`、`StatusTool.ts:159,174,212`、`HandoffTool.ts:89`。

累积效果：新用户无法判断这些编号是否需要行动，且被引 REQ 文档未必存在，查了可能扑空。

### 3.5 README / CHANGELOG / docs / client 同步 <!-- serves: FR-3 -->

- README 工具表 27 行与 registry 一致且有 `tests/readme-tool-face.test.ts` 机械校验 ✅；唯 `:12` vs `:51` 问数不一致（C-1）。
- `cordis.patch.yml:9` 注释「13 个 reqboard_* 工具」过时（实际 27）。
- `package.json` repository.directory 指向不存在的 monorepo 路径（与 C-3 同源）。
- CHANGELOG 历史段「13 个」属版本记录可不改；docs/ 顶层与代码同步良好。
- host/client 工具面一致 ✅（client 只走 HTTP+SSE，toolviews 按名渲染，无幽灵引用）。

### 3.6 流程指引 vs 回执字段 —— 总体健康 ✅ <!-- serves: FR-3 -->

- decomposing 片段「先看回执再决定是否发起确认」与实现一致（`SubmitArtifact.ts:232,521` 回执文案、`AskConfirm.ts:123-127` 重复发起幂等返回既有 ticket）。
- ConfirmReceiptTool / RunStatusTool / TaskReportTool 的 prompt 与实现逐字核对一致。

### 3.7 危险指引：长文本注记误用 <!-- serves: FR-3 -->

「文本过大拆成多次调用」（LONG_TEXT_ARG_NOTE，`shared.ts:5`）被 **11 处**参数描述复用。
对幂等工具（task_report）是好建议；对**一次性副作用工具**（handoff/move/task_move/note_interruption 的 reason）
是危险指引——拆成多次调用 = 执行多次动作。建议限定于幂等/追加语义工具。

---

## FR-4 优化方案 <!-- serves: FR-4 -->

> 两部分：4.0 问题修复优先级（源自 FR-2/FR-3 证据，供裁决是否立后续 bug/refactor 需求）；
> 4.1~4.3 工具面精简与治理（源自 FR-1/FR-3）。

### 4.0 问题修复优先级（建议的后续立项顺序） <!-- serves: FR-4 -->

1. **H1**（一行修）：AskConfirm.ts:449 条件展开 user_feedback —— 人工门否定路径当前必崩。
2. **H2 的 role 部分**：handleTaskMove 传 role；HTTP 面 human_gate 校验需一次小型设计（鉴权模型）。
3. **M1 / M5**：run_status 死字段（随 S3 合并一并处理）；ExecuteTask 改先认领后执行。
4. **M2 / M3 / M4 / M6**：复活边人工门、批内节流、回退两段写补偿、节流 clamp。
5. **G1~G3**（文案）：死路径、问数口径、submit 六类 —— 低成本高收益，可与 1~2 同批。
6. **H3**：需先裁决部署拓扑（单进程假设是否成立），再定锁方案。

### 4.1 工具面精简路径（27 → 21 保守 / → 19 激进） <!-- serves: FR-4 -->

| 步骤 | 动作 | 工具数变化 | 影响评估 | 证据回溯 |
|------|------|-----------|---------|---------|
| S1 | 删除 reqboard_task_execute（淘汰期后） | -1 → 26 | 存量调用方需迁移到 task_run；真委托零功能损失 | 1.2.1 |
| S2 | confirm_receipt 并入 ask_confirm(ticket) | -1 → 25 | 取回执语义不变 | 1.2.5 |
| S3 | run_status 并入 status；task_status 并入 task_tree | -2 → 23 | 查询面从 4 减到 2；status 顺手瘦身；顺带消 M1 死字段 | 1.2.3、M1 |
| S4（保守） | refs+adopt+regenerate 合为 reqboard_task_amend | -2 → 21 | 修缮簇单入口 | 1.2.8 |
| S4（激进） | 五修缮合一 reqboard_amend | -4 → 19 | archive_amend/note_interruption 一并收编 | 1.2.7、1.2.8 |
| S5 | AdvanceTool 目录改名 TaskRunTool | 0 | 消命名债 | 1.2.1、1.4 |
| S6 | capture/create 纪律文案、handoff/open_window 的 mode+inheritance schema 抽公共常量 | 0 | 单源化，降漂移概率 | 1.2.2、1.2.6 |

### 4.2 不建议动的 <!-- serves: FR-4 -->

- submit 不再加 kind（515 行已过载）；move / task_move 保持分域；kb 描述冻结（缓存策略）；clear_pause / skill_install 利基但唯一。

### 4.3 治理建议 <!-- serves: FR-4 -->

每条可回溯到证据编号（C-x = FR-3 章节，1.2.x = FR-1 章节）：

| # | 建议 | 证据回溯 | 优先级 |
|---|------|---------|--------|
| G1 | 修复 7 处死路径引用（统一改 `docs/architecture/archived-entry.md` 或恢复规范文档），并加「文案引用的仓内路径必须存在」机械检查（可挂现有 prompts:check） | C-3 | 高（agent 每次归档都踩） |
| G2 | 立项问数统一口径：文案只说「立项弹框」不数问数，或以 CAPTURE_QUESTION_IDS 为唯一事实源派生；同步修 CreateTool prompt 漏 doc_location | C-1、C-4 | 高 |
| G3 | submit prompt 修「五类→六类」、补 prototype 支；kind=plan/archive 细则从 description 移到拒绝回执消息（description 每 kind 只留一句话） | C-2、3.3 | 高 |
| G4 | 建 REQBOARD_* 大写码注册表（常量文件 + 扫描门禁，client/toolviews 码→中文映射表可作种子），让 prompt 错误码清单可被 CI 校验 | 3.2 | 中 |
| G5 | 错误码 prompt 清单补全（OpenWindow/SkillInstall/Create/RunStatus 漏码）或统一改为「不列码、只列场景」 | 3.2 | 中 |
| G6 | 删除 agent 可见字符串中的 REQ/FR 编号引用（挪进代码注释；功能性日期判据除外、改版本标记）；RunStatusTool 描述删两段修复史 | 3.4 | 中 |
| G7 | LONG_TEXT_ARG_NOTE 限定于幂等/追加语义工具，从一次性副作用工具（handoff/move/task_move/note_interruption 的 reason）撤下 | 3.7 | 中 |
| G8 | ask_confirm prompt 拦截清单改为「本窗口全部写路径」（或机械派生）；补 task_move budget 的 expectedWindowIndex 描述 | C-5、C-6 | 低 |
| G9 | cordis.patch.yml 注释「13 个工具」、package.json repository.directory 等计数/路径残留清理 | 3.5 | 低 |
| G10 | 双字段双拼归一逻辑单源化（protocol.ts 与 plan-granularity.ts 两处 → 一处）；长期：tasks[] 命名法统一（snake 或 camel 二选一 + 别名兼容期） | 1.3 | 中 |
