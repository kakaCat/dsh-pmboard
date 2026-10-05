---
req: REQ-261002161439-277d
kind: notes
title: 已知缺口与流程缺陷记录
---

# 已知缺口与流程缺陷（REQ-261002161439-277d）

> 本文记录实施期间实测到的**流程/工具面缺陷**与**本需求的两处残留瑕疵**。目的是：
> ① 验收与归档时不必重新侦查；② 把「该修工具、而不是修数据」的结论固化下来。
> 全部结论都有代码行号或命令输出为据，不含推测。

## 1. 计划覆盖对照表漏写 t10（本需求·已确认无法修正）

**现象**：`ts` 之外 10 张卡都在计划文档的覆盖对照表里有 FR 归属，**唯独 t10 没有**。

**后果（当时）**：计划批准后的 settle 重跑自动拆分时，被 `REQ-261001154450-b918 FR-7` 门禁拦下
（`confirm-settle.ts` 先算 `refsByKey` 再 `planRefsMissing`），抛错 → `req.advance.pausedReason`
写入 `auto_decompose_failed: …计划卡缺少需求条款引用（t10）`，卡片**一张都没落库**。

**为什么无法修正（两条代码事实）**：

1. 重交计划要求状态为 `decomposing`——`SubmitArtifact.ts:216` 对 `target.status !== 'decomposing'`
   直接 `REQBOARD_BAD_STATUS` 拒绝；需求此刻已在 `implementing`。
2. 状态机 `REQ_TRANSITIONS` 里**没有** `implementing → decomposing`；唯一回退边是
   `implementing → design`，且被标注为**人工闸门·破坏性**（"会触发卡片修订，退回后重走
   design→批准计划→拆分→实施"）。

**功能影响：零**。该门禁只在 `decomposing` 阶段的计划批准 settle 中执行；需求已越过该阶段，
这条路径不可能再触发。残留仅为看板上一条**过期错误标记**（`advance.pausedReason`），
它只影响自动链（`reqboard_task_run`），而自动链在本环境本就不可用（见 §3.1）。

## 2. 11 张父卡的 requirementRefs 全空（本需求·无法回填）

**现象**：`queue.json` 里 11 张父卡的 `requirementRefs` 全部为 `[]`（实测：有 refs 的 0 张）。

**根因链（三段缺一不可）**：

1. `reqboard_submit(kind=plan)` 的返回声称"批准后自动拆分落库"，**实际没落库**（见 §3.1）；
2. 为解除阻塞，改用 `reqboard_decompose` 手动补落库——**该路径传入的 `refsByKey` 为空**
   （`landPlanTasks` 的 refsByKey 由调用方构造，手动路径没有从计划文档覆盖表构造）；
3. `QueueTaskStore.createMany` 对已存在 id **幂等跳过、不覆盖** ⇒ 重交计划或重跑拆分
   **都补不回**已落库卡的字段；工具面也没有"给已有卡设 requirementRefs"的入口。

**后果**：`rtm-yaml.ts:58` 的 RTM 投影读 `t.requirementRefs`，故本需求在看板上的
**追溯覆盖度显示为 0**。功能与验收判据不受影响（判据是测试/typecheck/构建与 A1–A13）。

**唯一修法**：取消并重建 11 父卡 + 4 子卡（人工操作，走会自动填 refs 的 settle 路径）。
**判定：不值得**——代价是已完工的 t1 证据作废重做，收益仅是看板投影好看。

## 3. 工具面缺陷（建议另立小需求修，勿在本需求返工）

| 编号 | 缺陷 | 代码位置 | 影响 |
|------|------|---------|------|
| 3.1 | 批准计划后的**自动落库没跑**（工具返回却声称会跑） | `confirm-settle.ts` 的 auto-decompose 段 | 逼出"手动落库"这条路，直接导致 §2 |
| 3.2 | **手动 `reqboard_decompose` 路径 refsByKey 为空**，与 settle 路径口径不一致 | `plan-landing.ts:140`（refsByKey 由调用方给） | 手动路径落库必然丢 refs |
| 3.3 | **门禁双源、投影单源**：条款引用在门禁上读「计划任务字段 ∪ 计划文档覆盖表」，在 RTM 投影上只读卡片字段 | `content-gate-wiring.ts:120-125` vs `rtm-yaml.ts:58` | 只要走非 settle 路径落库，投影必然空白 |
| 3.4 | `reqboard_clear_pause` **渲染崩溃**（`output.render failed: userRender is not a function`），副作用却已生效 | 工具输出渲染层 | 调用方无法从返回值判断副作用是否发生 |
| 3.5 | 客户端文案与人工门矛盾：写着「任务落库/开工后**系统自动推进**到实施」 | `src/client/views/stage-detail.ts:205` | 与 2026-09-14 五门裁定（该转移仅人可操作）冲突，误导操作者 |

补充事实（3.1/自动链）：两次投递均以
`session "[object Object]" has no live agent (background job owner must be live)` 失败；
随后 `reqboard_task_run` 报 `REQBOARD_ADVANCE_LOCKED`（失败投递留下的 `advance.runId` 锁）。
**结论：本环境自动实施链不可用，任务卡由窗口按卡直接执行**（本次 t1 即如此完成）。

## 4. 既有数据质量缺陷（影响迁移，已在本需求内处理）

对线上台账（35 条需求 / 1987 条评论 / 251 条状态事件）逐字段反查，发现 **5 条残缺行**：

| 需求 | seq | 缺失字段 |
|------|-----|---------|
| REQ-260930094139-2d65 | 6 | 状态事件缺 `at` |
| REQ-260930094139-2d65 | 7 | 状态事件缺 `by` |
| REQ-261002110908-81d0 | 22 | 评论缺 `body` |
| REQ-261002120707-deab | 14 | 评论缺 `body` |
| REQ-261002120707-deab | 15 | 评论缺 `body` |

**若不处理**：这 5 行会被判为"坏行"丢弃 → seq 断裂 → 计数截断发现有效行少于提交点声明 →
抛 `COUNT_EXCEEDS_LINES` → **上述 3 个需求整个读不出来**。

**已在 t1 内修正**：解码策略改为「缺字段**保留行** + 登记缺陷；坏 JSON / 类型错 / 身份字段缺失
才判损坏」。真实数据回放定论：`malformed=0`、缺陷 5 条、**丢失行 0**。
迁移脚本（t6）须把这份缺陷清单写进迁移报告，不得静默。

## 5. 设计文档内部不一致（t2 复核发现，已按本意落地并在此留痕）

| 位置 | 不一致 | 处置 |
|------|--------|------|
| `design/interfaces.md` §端口 `RequirementStore` 代码块 vs 同节映射表 | 代码块写 `listSummaries(): Promise<readonly RequirementSummary[]>`（无游标），映射表写"摘要投影数组 **+ 下一页游标**" | **以映射表的本意落地**：返回 `RequirementSummaryPage`（`items` + `nextCursor`）。理由写在 `ports.ts` 该签名上方：游标只有存储自己产生得出，回数组会把分页细节泄漏到 HTTP 路由，与 FR-6 相悖 |
| `design/interfaces.md` 代码块未列 `peekSummaries` | 该方法是支撑类型表与 `backend.md` §同步口的处置里明文要求的 | 按明文实现，不视为缺项（机械比对结论：设计声明的 13 个方法一个不缺） |

**教训（写给下一个需求）**：接口代码块与映射表是**两处真相**，写设计时就该让它们同源
（或干脆只留一处）。t2 的机械比对脚本因此专门做了双向 diff（设计有而端口缺 / 端口有而设计未列），
而不是只看"缺不缺"。

## 6. t2 复核中被固化进契约的一条隐性约定

`listSummaries` 的**排序**此前只是内存替身的偶然行为（`updatedAt` 降序、同刻 `id` 升序）。
复核判定：分页游标要求排序稳定，排序键属于**端口承诺**而非实现细节，
已写进 `ports.ts` 的 `listSummaries` 文档（"改排序键 = 改契约"）。

**同时如实记录一处尚存的证明缺口**：契约测试目前只跑**一个**实现（内存替身），
所以"端口可替换"尚未被真正证明——参数化骨架已就位，等 t4 的分片实现接入后
（t11 再接入假 SQL 替身）才算数。这条不写会让人误读为"契约已被交叉验证"。


## 7. t5 复核登记的三处实现偏差（写侧）

| # | 设计/卡里写的 | 实际落地 | 影响 | 处置建议 |
|---|---------------|---------|------|---------|
| 7.1 | **draft 惰性装配**（外置对象只在变更器实际访问时读） | **急切装配**：每次写先装配完整 draft（含四个外置对象） | 单次写多读最多约 190KB（O(单需求)，与库容无关） | **做不到真惰性**：属性访问是同步的、分片 IO 是异步的。要么接受现值，要么改端口为"窄方法"（但那会让 90 处变更器重写）。建议在 `design/backend.md` 修词，承认急切装配 |
| 7.2 | 订阅帧带 `revision` | `notify` 里 `revision` 目前是占位 `0`（内存索引只用 `summary`，功能无影响） | SSE 帧的版本号不准；`revision` 短路判据会退化 | t8 接线时一并修（那时 `subscribe` 才真正接到 SSE） |
| 7.3 | 写放大超阈值 `onWarn`（第 ⑦ 条） | `warnIfAmplified` 是**空壳**（没有真实字节数） | 线上不会因写放大异常告警 | 需要把 fs 端口挂上写字节计数器（测试里已有 `FakeShardFs.writeBytes`，生产侧待接） |

## 8. t7（回滚）复核发现的两件事

### 8.1 【已修·真数据丢失】t6 迁移首版把 `triages` 丢了

v10 布局里分诊记录没有天然归属，t6 首版只写了 `schemaVersion/revision/migrations` ⇒ **分诊记录被静默丢弃**
（现状虽为 0 条，但"现状为空"不是丢键的理由）。**已修**：`ShardMeta` 增 `triages`，
迁移原样带过、回滚原样带回；测试里用**非空** triages 锁死（断言导出文件 `triages.length === 1`）。

### 8.2 【固有代价·不修】回滚导出的需求**顺序不保证**与迁移前一致

v10 分片布局里**没有"全局顺序"这个事实**（每条需求一个目录，枚举只能按目录名字典序）。
故"迁移 → 回滚"后 `requirements[]` 的**顺序**会变成字典序：**集合一致，顺序不保证**。

- 判据据此收敛为**集合**一致（与 FR-8/A11 的"条数与 id 集合一致"一致）；
- 影响面：`readV9Ledger` 的读者一律按 id 查（看板/用例皆如此），故无功能影响；
- 若将来确实需要保序，得在 v10 布局里引入显式序号——那是**新的契约**，不该在回滚脚本里偷偷补。

## 9. t8 切换清单的生成方式与一个执行风险

清单落在 `notes/switch-inventory.md`，**现算**而非手抄（数字会随工作树变动）：

```bash
grep -rn "snapshot()" src --include=*.ts        # 读点（本次实测 101 处）
grep -rn "\.mutate(" src --include=*.ts         # 写点（97 处）
grep -rn "new JsonLedgerRepository" src tests   # 测试构造点（41 处）
grep -rln "JsonLedgerRepository" src tests scripts  # 引用面（92 个文件）
```

**执行风险（写给下一个执行者）**：本仓当时**有另一个窗口在并发修改同一工作树**
（`REQ-261002164800-d8f2`，改 `src/shared/protocol.ts` 等）。上面的数字在几分钟内就从
95/90/41 变成 101/97/41。一次性大切换要求"从开始到结束编译不过"，期间并发改动会同时
放大冲突面与归因难度——**建议 t8 在无并发写入的窗口执行**（或先确认另一个窗口已收工）。

## 10. t8 执行期新发现的两条（本窗口 2026-10-02 实测登记）

### 10.1 `RequirementStore` 无 triage API，而设计文档声称那几个纯函数不读 triages

| 项 | 事实 |
|----|------|
| 端口 | `RequirementStore` 14 个方法里**没有**任何 triage 读写；`LedgerHead = {revision, schemaVersion}` |
| 旧端口 | `LedgerView.triages` 是公开字段，被 6 处读（`window.ts:31,48`、`rollup.ts:46,56`、`verdicts.ts:60,203`、`AcceptSheet.ts:273`） |
| 写者 | **零**：`newTriageId` 在 `src`/`scripts`/`tests` 下零调用点；线上 `triages.length === 0`；迁移/回滚只原样搬运 |
| 设计文档 | `design/backend.md` §同步口写这三个纯函数「**只用 `status` / `sourceSessionId`**」——**与代码不符**，它们还读 `ledger.triages` |

**后果**：照设计把 `openRequirementsFor` / `shouldCaptureWindow` / `draftRequirementsFor`
窄化成只收 `RequirementSummary[]`，会**静默**去掉 triage 锚点路径（`window.ts:31-40,48-56`）。
今日零功能影响（无写者、0 条），但"静默"本身违反本仓铁律，故必须显式裁定：
(a) 桥侧经 `RequirementShardRepository.readMeta` 读 `meta.triages`（只推迟到 B12）；
(b) 给端口加 `listTriages()`（契约变更 ⇒ 重新批准）；(c) 显式承认永久移除该路径。

**教训**：设计文档里「某函数只用 X 字段」这类**收缩性断言**必须机械核对（grep 该函数体），
否则窄化改造会照着一句错话把活路径删掉。与 §5 的"接口代码块 vs 映射表两处真相"同源。

### 10.2 插件重载会清空文字确认核验缓冲 ⇒ evidence 路径短暂不可用

`application/internal/session-buffers.ts` 的 `recentUserMsgs` 是**插件运行时的内存 Map**，
只在 `dive/session-driver.ts:404` 一个采集点写入。因此：

1. `plugin_manager set_plugin` 停/启 `include:pmboard` 会**清空**它 ⇒ 重载后 60 分钟内
   `reqboard_ask_confirm(evidence=…)` 必报 `REQBOARD_EVIDENCE_FAKE`（时间窗内零条记录）；
2. `ask_user_question` 的**选项点选**不进该缓冲（2026-10-02 实测：用选项批准后缓冲仍为空，
   报错原文为「时间窗内没有该窗口的真实用户消息记录」）⇒ 弹框选项**不能**当文字证据；
3. 核验要求消息 **≥4 字符**（`session-buffers.ts:86` 的 `m.text.length >= 4`），
   故「继续」「好」这类短指令**天然不能作证**——这与该处注释"太易撞库"的意图一致，
   但副作用是"用户在对话里说继续"无法落章，只能退化成非留痕的对话批准。

**建议**（另立小需求）：把该缓冲落成可恢复形态（或至少在重载时从会话日志回填最近用户消息），
否则"绑定窗口需要重载插件"与"文字确认需要缓冲"这两件事互相拆台。

### 10.3 附带登记：绑定窗口的**唯一可行路径**（改文件无效）

台账 `sourceSessionId` 只在立项时写一次，本仓无改绑定代码路径；而**直接改台账文件无效**——
`adapters/JsonLedgerRepository.load()` 命中 `this.loaded` 即返回，进程内存副本会在下一次
写盘时把外部改动**覆盖回去**（2026-10-02 实测：改盘后 t+8s 被还原，revision 2721→2728，
且改盘期间 `reqboard_status` 始终 `bound:false`）。

可行办法：**先改盘 → `plugin_manager set_plugin(target="include:pmboard", enabled=false)`
→ 再改盘（此刻无写者）→ `enabled=true`**，插件重载让新实例重跑 `load()` 从盘读入。
注意 `target` 必须用 **`include:pmboard`**（用 `pmboard` 报 `unknown-plugin`）。
