# 项目说明书（L1 · 索引）

> **TL;DR**：这是本项目的**认知入口**。L1 只放索引与全局约定，具体机制写在领域篇（L2）；
> 领域篇放不下、且只对某次决策有效的推理，留在需求目录的 `docs/requirements/<REQ>/` 里。

## 本手册怎么用

| 想知道什么 | 去哪 |
|---|---|
| 需求流水线怎么走、每个阶段的产物与人工门 | 领域篇《需求流水线》**（待写）** |
| **验收单是怎么生成的、有哪些不变量、两条验收通道有什么区别** | [验收单机制](acceptance-sheet.md) |
| 插件的运行/构建前提（装载层文件、构建产物与已加载模块的陈旧态、**客户端样式表的归属契约**） | [插件运行前提](plugin-runtime-prerequisites.md) |
| **列表视图窄屏怎么适配（列让位断点、滚动兜底、回归探针怎么跑）** | [列表视图自适应](list-view-responsive.md) |
| **会话头部那张需求流程图挂在哪、窄窗口怎么降级、详情面板锚在哪（改头部要动哪些文件、回归怎么跑）** | [会话头部需求流程图](conversation-header-progress.md) |
| **读文档的闸门按哪个根找文件（为什么必须按需求 `workspaceRoot`、根错时哪些门会静默放行）** | [读盘闸门的根解析](gate-read-root.md) |
| **归档需求在看板上的入口与只读口径（"归档≠数据被收回"、两个投影、终态为什么不能有按钮）** | [归档需求的可回看入口](archived-entry.md) |
| **旧 URL 深链在面板时代怎么活过来（兼容入口 / 片段消费 / 定位通道三段链路；为什么是 200 中转页而非 302；可见性门闩）** | [深链与面板导航](panel-deep-links.md) |
| **自动链能不能自己跑（owner 必须是 id 字符串、失败不留锁、人的显式接回、以及三条已知缺口 N-1..N-3）** | [自动链契约](automation-chain-contract.md) |
| **子卡阶段链的段从哪来（五档优先级）、加一段要登记哪几处、`manual` 段为什么能停链等人** | [子卡阶段模板](subtask-stage-template.md) |
| **窗口顶到上下文墙怎么把需求交给新窗口（落点/交接/投递三件事、水位三档判别式、席位↔绑定必须同指一窗）** | [开新窗口续作](continuation-handoff.md) |
| **看板上怎么改每阶段的回合上限、怎么把台账切到 SQLite 库、系统记录里有什么（上限的四级来源与同步快照、确认门两道防线、迁移八步与暂存库、未就绪拒服务）** | [运行设置与存储后端切换](settings-and-storage-backend.md) |
| **看板上「哪条需求正在被处理」这个信号从哪来（客户端已有运行态、席位判据、重绘门控、不伪造红线；以及"展示类需求先找客户端已有信号"这条方法论）** | [看板运行态指示](client-running-indicator.md) |
| **需求详情页怎么写成「工作汇报」（常驻头部 + 六个同级 Tab 的懒加载、六条只读端点与降级信封、会话根解析、缺口判据要合并两个来源、渲染层剥标记、探针硬判据）** | [需求详情页「工作汇报」](requirement-detail-report.md)；改代码上手看[使用与维护指南](../guides/requirement-report-page.md) |
| **这个项目分几层、有哪些硬纪律、改 UI 去哪取颜色、历史结论在哪** | **[项目知识层](../knowledge/INDEX.md)**（入口 ≤8K 字符；`pnpm run kb:check` 九项自检） |

## 全局约定

- **产物路径**：需求材料一律落 `docs/requirements/<REQ>/`（`requirement.md` / `design/` / `decomposition.md` / `tasks/` / `reviews/` / `tests/` / `verification.md`）。
- **证据优先**：任何"完成/通过"的声明都要附可复核命令与输出摘要；不可复核的声明等于没声明。
- **人工门不可绕过**：立项/需求确认/设计确认/计划批准/验收 五道门由人裁决，agent 只能发起与补材料。

## 待写页

- 《需求流水线》：六阶段状态机、五道人工门、产物登记与确认的时序。
- 《任务卡与子卡链》：父卡/子卡生命周期、done 凭证门与补链（**阶段模板部分已写**，见 [子卡阶段模板](subtask-stage-template.md)）。
- 《RTM 追溯》：`rtm-*.yml` 三份报告的生成时机与用途。

### 知识层（`docs/knowledge/`）

新窗口的 Agent 读一份索引就能开工；归档结论自动沉淀成条目，不再散落在需求目录里。

| 想知道什么 | 去哪 |
|---|---|
| 项目分几层、依赖往哪边、加东西落哪 | `docs/knowledge/architecture.md` |
| 本仓有哪些硬纪律、违反哪条测试会红 | `docs/knowledge/conventions.md`（每条挂可跑校验） |
| 前端颜色/变量/断点/类名 | `docs/knowledge/design-tokens.md`（生成物） |
| 历史决策与踩过的坑 | `docs/knowledge/entries/kb-NNNN.md` |
| 全量符号 / 全量类名 | `code-map.symbols.tsv` / `design-tokens.classes.tsv`（用 `reqboard_kb` 按需检索） |
| **开发完必须跑什么**（打包/构建/重生成/测试/发版前） | `docs/knowledge/conventions.md` 的「工程操作」节（四档时机 + 四要素，`pnpm run kb:conventions` 查缺口） |

维护入口：`pnpm run kb:build`（重生成）· `pnpm run kb:check`（生成物零漂移 + 九项自检）。

**缺层会自动生成（REQ-261004174324-4195）**：插件在「项目根确定」时检测 `docs/knowledge/INDEX.md`——缺了就自动补齐骨架与生成物（代码地图 / 设计令牌 / 两份 TSV）；已有知识层则**零读零写**（连 mtime 都不变），手写页与 INDEX 手写行永不覆盖。生成规则单点在 `src/domain/knowledge/generate.ts` + `src/application/use-cases/EnsureKnowledgeLayer.ts`，CLI（`scripts/kb-build.mts`）退化为薄包装——手动命令与自动自举是同一份实现。

| 问题 | 结论 | 判据 |
|---|---|---|
| 什么时候触发自举？ | 三处「根确定」的通知点：插件激活（**仅 `docsRootSource='legacy-cwd'`**）/ 用例根校正 / 看板按会话解析读根 | `npx vitest run tests/kb-bootstrap-hooks.test.ts` |
| 同一项目会不会重复生成？ | 不会：协调器按根的字符串归一去重（同根并发合并为同一个 promise），失败**不自动重试** | 同上（并发/失败两例） |
| 怎么关掉？ | `knowledge.autoBootstrap=false`（回到手动 `pnpm kb:build`）；`knowledge.enabled=false` 优先，整层停用 | `npx vitest run tests/kb-bootstrap-compat.test.ts` |
| 会话根与宿主根不同时会不会写错地方？ | 不会：目标根 ≠ 当前读根时用 `docsFor(root)` 的**根绑定仓储**；取不到就跳过并记日志（绝不退回共享仓储硬写） | 同上（两种读根两例） |
| 知识层还有 UI 入口吗？ | **没有**：知识库页与侧栏入口已删除（`grep -rn "pmboard-knowledge" src/ scripts/ tests/` 零命中）；人要看直接读 `docs/knowledge/INDEX.md` | `evidence/grep-deleted.txt` |

## 机制备忘：改了 src 并 build 过 ≠ 线上生效（宿主按启动时的 dist 跑）

**实测（2026-10-04，REQ-261004183621-de3f 交付当天）**：该需求的归档提交**没有**走到它刚实现的归档闸门——
台账里没有 `reconcile`、评论里没有对账摘要、警告仍是旧的「83 份未列」口径（把 `rtm-*.yml` 与 `tasks/*.md` 都算未列）。
而 `dist/index.mjs`（19:05 构建）确实含新代码（`grep -c REQBOARD_UNLISTED_ACK_REQUIRED dist/index.mjs` = 1），归档提交发生在 19:46。

**结论**：宿主插件进程在**启动时**加载 `dist/`，之后不会因重新 `pnpm build` 而换代码。

| 问题 | 结论 |
|---|---|
| 怎么判断线上跑的是哪一份 | 看行为的"签名"：新代码独有的产物（如 `archive.reconcile`、评论里的对账摘要、新工具名）在不在 |
| 怎么让它生效 | **重载插件宿主**（重启 DSH Web 服务或重新加载 profile）；`pnpm build` 只是把产物更新到磁盘 |
| 教训 | 自证类断言（"我的新闸门拦住了我自己"）必须先确认**被加载的那一份**已更新，否则会得出相反结论 |

## 机制备忘：归档清单对账（漏登不再靠事后警告）

`reqboard_submit(kind=archive)` 提交时会把**需求目录内文件**与清单对账，分三类：**已列 / 命中豁免规则 / 未列未豁免**。

| 问题 | 结论 | 判据 |
|---|---|---|
| 未列文件怎么处置？ | 必须**显式决定**：收进 `docs`，或传 `unlisted_ack: [{path, reason}]` 写明为何不收；两者都不做 → **拒绝提交且零台账改动**（对账在写台账之前） | `npx vitest run tests/archive-reconcile.test.ts` |
| 哪些文件不必进清单？ | 只有**工具重建物**：`rtm-*.yml`（文件名通配）、`rtm-*` 目录、`queue.json`、`state/` 目录段；规则常量带理由，人的工作记录（`tasks/`、`evidence/`、`design/`、`tests/`、`reviews/`）一律**不豁免** | `npx vitest run tests/archive-exemptions.test.ts` |
| 归档后发现漏了怎么办？ | 走受控补录（工具 `reqboard_archive_amend` / 看板路由，共用同一用例）：**只追加**、幂等、必须写理由、留痕；不碰产物文件与 `merged_into`/`manual_updates`/需求状态 | `npx vitest run tests/archive-amend.test.ts` |
| 事后在哪看对账结论？ | 台账 `archive.reconcile` + 需求评论 + 看板归档页「清单对账」行（老记录显示「未对账」，**0 ≠ 未对账**） | `npx vitest run tests/archive-manifest-view.test.ts` |
| 嫌太严想回退？ | `archive.unlistedGate = 'warn'` 回到旧语义（只留痕不拦）；非法值**装配期抛错** | `npx vitest run tests/archive-gate-config.test.ts` |
| 端到端怎么自证？ | 六步用例（工具壳 → 用例 → 台账 → 评论 → 看板渲染，断言可观察终态） | `npx vitest run tests/archive-reconcile-e2e.test.ts` |

**行为变更留痕（2026-10-04）**：本条之前是「归档后遍历目录、只警告不拦」；改为缺省拒绝是**有意**变更（经人工批准）。受影响的 5 处老用例已按新契约修正。

## 机制备忘：需求面板的刷新与陈旧可见

| 问题 | 结论 | 判据 |
|---|---|---|
| 面板为什么不能只靠 `req.updatedAt` 重取？ | 任务级变化（`MoveTask`）**不写** `req.updatedAt`——按它触发等于"任务动了、面板不知道" | `grep -c updatedAt src/application/use-cases/MoveTask.ts` → 0 |
| SSE 算可靠通道吗？ | **只算加速通道**：断线/被代理缓冲时不能没有兜底，故面板自持 5 秒轮询（`src/client/panel-refresh.ts`） | `npx vitest run tests/panel-refresh.test.ts`（假时钟逐毫秒） |
| 陈旧为什么必须可见？ | 事故形态是"服务端 23 张卡、面板显示暂无任务且零提示"——**空 ≠ 旧**；故面板头出「数据时间」、失败出红条 | `npx vitest run tests/panel-freshness-render.test.ts`（TC-K） |
| 前端换版后页面怎么知道自己在跑旧代码？ | 构建戳（`sha256(lib/client.cjs)[0:12]`）内联进 bundle，宿主经 SSE `event: build` 下发；不一致才提示「点此刷新」（不自动刷新） | `pnpm build:client` 的 verify 门禁 + `tests/panel-build-frame.test.ts` |
| 想一键回退到改造前行为？ | `plugin.panel.refreshMs = 0` 关闭周期轮询（只保留打开时拉一次） | `tests/panel-refresh-wiring.test.ts` |

来源：REQ-261001124111-5d36（面板 DAG 层级 / 泳道不显示修复）。

## 机制备忘：收尾门的三条硬约束（验收不留白 / 引用不空转 / 收尾不半截）

| 问题 | 结论 | 判据 |
|---|---|---|
| 验收"通过"要不要留证据？ | **要**：通过但拿不到实际结果 → 记 `unverified`（未复核），**不计入通过**、需求不得据此归档；不再写占位文案冒充 | `npx vitest run tests/domain/req-b918-gates.test.ts` |
| 机器报出的缺口项（缺 E2E / 追溯断链 / 不可照着验）能不能点"通过"了事？ | **不能**：系统项通过必须写明处置，否则整批拒绝（`system_item_disposition_required`，先验后改） | `npx vitest run tests/accept-sheet-tool.test.ts` |
| 计划里"哪张卡承接哪条 FR"写在哪才算数？ | 两通道并存：任务表 `requirement_refs` 字段（此前被 `additionalProperties` 拒收）+ 计划文档覆盖对照表；**两处都空 → 拒绝落库并点名** | `npx vitest run tests/plan-refs.test.ts` |
| 批准计划后链没跑起来，回执会怎么说？ | 如实说：`dispatched:false` + 原因 + `reqboard_task_run` 续跑入口；投递成功才带 run id（旧实现在未投递时也写"已触发"） | `npx vitest run tests/auto-advance-note.test.ts` |
| 关闭太快被节流，agent 怎么知道等多久？ | 拒绝文案给出**剩余秒数** + 三条合规路径（等待 / 子卡链 / 交给自动链），不再靠猜 | `npx vitest run tests/done-throttle-message.test.ts` |
| 一个没人作答的挂起会挡多久？ | 30 分钟（`LIMITS.pendingConfirmTtlMs`，与 capture 拒绝留痕同口径）；中止过的从中止时刻重新计时 | `npx vitest run tests/pending-confirm-ttl.test.ts` |
| "归档了"等于"收尾闭环"吗？ | **不等于**：闭环 = `archived` **且**有归档材料；否则 `closing_gap = archive_missing`，看板与投影都标未闭环 | `npx vitest run tests/closing-gap.test.ts` |
| 规范条目的「期望」写不出来会怎样？ | K11 拦下：期望必须可判定（退出码/反引号锚点）；声明"历史/既有"豁免的条目必须给「基线：`命令`」 | `pnpm run kb:check`（11 项） |

来源：REQ-261001154450-b918（收尾门硬化；源自 REQ-261001143526-8475 的会话审核）。

## 机制备忘：长文本工具入参的写法约定（防整轮报废）

> 一句话：模型把大段中文（连引号）写进工具参数时，**只要一处半角引号漏转义**，该次工具参数 JSON 就非法，
> DSH 适配器在流收尾处判 `MALFORMED_RESPONSE` → **整个回合报废**（本轮推理/文本/其它工具调用全作废，
> 汇报永远落不了库、链停摆）。2026-10-02 同一张卡实测连犯两次，故把「怎么写」写成工具自带的约定。

| 问题 | 结论 | 判据 |
|---|---|---|
| 约定写在哪，才不会「改一处、换个工具又踩」？ | **一处共享常量**：`src/tools/shared.ts` 的 `LONG_TEXT_ARG_NOTE`（42 字，三锚点）＝唯一来源，各工具 description **引用**它、不复制 | `grep -rl LONG_TEXT_ARG_NOTE src/tools/ \| wc -l` → 10 |
| 三个锚点是什么？ | ① 每条短句（建议 ≤60 字）② 需引号用「」避免半角双引号 ③ 文本过大拆成多次调用 | `npx vitest run tests/arg-guidance.test.ts`（TC-1） |
| 哪些工具算「同类长文本」？ | `LONG_TEXT_FIELDS` 清单：15 条 = 8 个工具（task_report / submit / ask_confirm / task_move / capture / note_interruption / task_adopt / task_regenerate） | 同上（TC-2 遍历断言，失败时点名「工具.字段」） |
| 约定会不会被悄悄删掉？ | **不会**：删任一锚点 → 4~6 条用例红；新增同类字段漏接 → TC-2 红并点名 | 反向演练（本次实测：摘 `reqboard_task_regenerate.reason` → 红并点名） |
| 写之前有没有提醒？ | 有：`implementing` 片段加「汇报自检」（轻档 `light/overrides.md` 覆盖 4 一行；重档 `heavy/overrides.md` 覆盖 8 带整轮报废的理由） | `node scripts/check-prompt-fragments.mjs` exit 0 |
| 这次动了行为吗？ | **零行为变更**：入参 schema / 必填 / 返回体 / 错误码 / 落盘格式一字未改 | TC-5 快照断言 + 全量失败集合与基线对齐（49 文件 / 98 用例） |
| 「坏 JSON = 整轮失败」这个粒度修了吗？ | **没修，且在边界外**：适配器侧容错（`llm-deepseek/src/translate.ts`）是跨仓改动，另立需求 | `notes/incident-autorun-deadlock.md` 的「不做」清单 |

**两条可复用的纪律**：

1. **防的是"发生"，不是"报错好看"**：约定放在工具描述里（模型每次调用都读到），而不是等适配器报错后再补救；
   也不做"自动修复模型输出"（二次 LLM 改写 / 客户端正则洗文本）——那会把「响亮失败」换成「静默改数据」。
2. **约定必须有反向用例守着**：只写进描述而无断言，删掉一个字都不会有人发现；本仓口径是「正向 + 两条反向证伪」。


**补记（2026-10-02，原需求 REQ-261002110908-81d0 解锁过程的三条教训）**：

1. **审批链要有「0 产出不得推进」的守卫**：批准一份**任务表为空**的拆分计划时，落库 0 张卡却**照常**把需求推进到 implementing——
   于是造出「可驱动 + 零产出」的形态。口径：落库卡数为 0 时**不得推进**，并响亮报错。
2. **失败恢复指引必须被自己的门禁验证过**：那次事故里系统给的恢复指引（手动调 reqboard_decompose、看板点拆分）
   **两条都被 Dive armed 门挡住**——指引走不通，人也没有出口。口径：写进回执/弹框的每一步恢复命令，都要在产线里实测可达。
3. **驱动需要「无进展护栏」**：Dive 只看「能不能驱动」，不看「上一轮有没有产出」，于是轮轮成功、轮轮零产出 → 无限轮询
   （implementing 的回合上限 1000 ≈ 无上限）。口径：连续 N 轮零产出（任务 / 产物 / 状态 / 计划皆无变化）→ 停下等人。

   附带一条接线教训：当时唯一的解锁口 reqboard_clear_pause **从未工作过**——ToolRunContext 上根本没有 session 属性
   （基线 tsc 就报 TS2339），窗口身份恒为 unknown；参数还被声明成嵌套 schema，requirement_id 传不进去。
   已修（参数扁平化 + 改走 deps.session.windowKey），并清偿了 tests/tools-schema.test.ts 里的「显式留债」标记。
   取证与 bug 草案（0 卡推进 / 恢复通道被自己堵死 / 无进展护栏 / 失败兜底二选一）：
   docs/requirements/REQ-261002110908-81d0/notes/incident-autorun-deadlock.md 与 notes/draft-bug-requirement-autorun-recovery.md。

来源：REQ-261002115204-ba52（重开自 REQ-261002110908-81d0；原需求因落库死锁停摆，实现与证据同源）。

## 机制备忘：PM 插件 agent 测评套件（eval-suite/）

**是什么**：一套针对「agent 驾驶 reqboard」行为的场景化测评——投递预设用户消息序列，按三层断言打分：
台账终态比对（τ-bench 式）+ 工具轨迹校验（有序包含/禁含/预算）+ LLM 评审（产物类 rubric）。

**关键约定**：

| 约定 | 内容 |
|---|---|
| 目录 | `eval-suite/`：scenarios/（36 条 A1-G4）、assertions/{ledger,trajectory}/、rubrics/、calibration/、regression/、reports/、runbook.md、scoring.md |
| 评分 | 六维度加权（D2 纪律/D3 完成度各 25% 最重）+ pass^4（k=4 全过才算一致）+ **红线一票否决**（B2/B3/C2/C3/E3/F2 六条 human_gate 越权类） |
| 可重跑校验 | `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py` → RESULT: PASS（修订套件后必跑） |
| 边界 | 套件只有内容与规程；自动化执行器（fixture 预置、trace 抓取、断言执行）未实现，需另立需求；G3 步数预算基线 TBD 首轮标定 |

来源：REQ-261002120707-deab（spike；调研沉淀见 docs/strategy-research/agent-evaluation-landscape.md）。

## 机制备忘：让自动链"该停就停"的四道前置（2026-10-04，REQ-261004065652-5c1c）

**一句话**：自动链的每一次起轮，都要先过四道闸——**内存闭锁（含退避）→ 全局上游闩 → 人工门 → 预算闸**；
四道全在"构造回合之前"，且前两道**不依赖任何 I/O**。

**为什么会有它**：2026-10-03 的实机事故。上游额度 403 之后 Dive 没有停手，4 小时 36 分里空转
7257 个回合、6605 次 403、烧掉约 43 亿 cacheRead（全仓累计），两个窗口同刻阵亡。
根因是驱动读的**同步窄投影陈旧**——它在 idle 拍里读自己刚写下的 `driverHealth=paused`，
读到的却是建索引那一刻的旧值，于是起轮判据恒真。

**这一轮多出来的三条认知**（写给下一个改这块的人）：

1. **"写了"不等于"读得到"**：同步缝（idle 拍）只能读同步投影，而投影里的判定字段若来自"读到整条记录时才顺手留下的快照"，
   就会长期陈旧。修法只有两条——**写路径同源刷新**，或判定字段改权威读；本项目选了前者（改动 <40 行、不引入新时序窗口）。
   反面教材：测试替身用**活投影**、生产用**快照**，缺陷因此在测试全绿的情况下活了很久。
2. **停机位必须只有一个权威字段**：`dive.driverHealth`（`isDrivableRequirement` 唯一读它）；
   legacy 的 `phase=paused` 只在台账尚未被写停时才补写。两处都判 ⇒ 必然出现"能驱动但准入拒绝"的缝。
3. **"超限/等待"与"故障"必须分家**：人工门与预算闸命中**不写健康位**（那是正常状态，停了要能自己回来）；
   只有致命错误与连续同因失败（≥3 次）才写 `paused` 并要求人介入。把抖动写成"故障"，人就会被叫醒去点「继续」。

**同时沉淀的一条工程纪律**：反向演练（把修复拿掉 → 用例必须红）要做成**一条命令可复跑**的矩阵，
恢复必须**逐字节校验**；本工作区堆着多窗口未提交改动，`git checkout/stash/restore` 一律是破坏性操作
（2026-10-04 已踩过一次，见 `docs/requirements/REQ-261004065652-5c1c/evidence/AskConfirm.recovery-notes.md`）。

**判据**：`npx tsx scripts/reverse-drill-matrix.mts`（六条护栏全部变红且逐字节还原）；
`npx vitest run tests/dive-loop-breaker.test.ts tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts`。

## 机制备忘：子卡阶段模板的六个登记点与 manual 停链（2026-10-04，REQ-261003203909-55f2）

**一句话**：`stageKind` 链是**受控枚举 + 五档优先级解析**出来的；加一段要在 6 个登记点同时落地
（5 张 `Record<StageKind,…>` 漏一处就编译错），其中 `manual` 段是全链唯一合法的「停下等人」断点。

**为什么会有它**：默认模板只有 `dev/integrate/review/test` 四段，端到端断言、人工真机核对、发布门禁、
采集取证这四类工作没有落点——要么塞进 `test` 段糊过去，要么让计划手写 `stages` 逃生
（实测 40 需求 / 627 张子卡里手写 19 次 `change-only`）。这一轮把四段补进枚举、把高频逃生舱口固化成模板键、
并把 `template` 提升为一等字段（`stages` 与 `template` 二选一，同给即 `REQBOARD_TEMPLATE_CONFLICT`）。

**这一轮多出来的三条认知**（写给下一个改这块的人）：

1. **"新段没调用方"与"新段没人写"是两回事**：`manual` 段根本不派 run（引擎里没有"人"），
   它的产物是**清单骨架 + 人的核对结果**；因此它的完工凭证形态必须是写入族，且新鲜度基准要收紧到
   `max(chainSince, manualSkeletonAt + 1)`——否则**提前写好的"核对结果"能过门**，停链等人就变成了走形式。
2. **"在等人"不是"坏了"**：`stopped='awaiting-manual'` 不写 `driverHealth`、不动 `autoRun`；
   回执给的是正常状态码 `REQBOARD_AWAITING_MANUAL` 并直接指路清单文件。把等待写成故障，
   人就会被叫醒去点「继续」，而其实什么都没坏（与「四道停机前置」同一条口径）。
3. **`[]` 与 `undefined` 必须可区分**：`stages: []` 是"本卡明确不落链"，`undefined` 是"没写、走映射表"；
   判据写成 `.length > 0` 就会把前者静默改回默认链——"不需子卡"与"未生成"从此分不清（本仓已踩过）。

**顺带记一条登记纪律**：新增 `stageKind` 的完整清单与"自动跟随/必须人记"的分界见规范
[C-19](../knowledge/conventions.md#c-19) 与领域篇 [子卡阶段模板](subtask-stage-template.md) §三。

**判据**：`npx vitest run tests/domain/subtask-template.test.ts tests/advance-manual-stage.test.ts`；
删掉任意一张 `Record<StageKind,…>` 的一行 → `npx tsc --noEmit` 当场报错。

## 机制备忘：拆分前先算「一轮装不装得下」（体量声明与超容量软门禁）

**一句话**：拆分节点在写计划时**必须给每张卡声明体量**（改几个文件 / 几条验收锚点 / 多少字符）；
容量是**我们自己的常量**（缺省 16 细节量），超容量**不是错误**——提交照样成功，只是把「哪张卡装不下、建议切几批」
在返回体、批准弹框与计划文档里同时摆明。

**为什么会有它**：单轮能清醒处理的细节量有上限，而拆分时**看不见**这个上限——于是常出现"一张卡要改 100 个文件"
被当成一张卡批准，跑到一半才发现装不下。这一轮把上限变成一个可算的量，并让它在**三个必经之处**留下痕迹。

| 问题 | 结论 | 判据 |
|---|---|---|
| 三个量怎么合成一个"明细量"？ | `detailUnits = files×1 + anchors×0.5 + chars/2000`；权重与容量**只在 `src/domain/limits.ts` 定义一次** | `npx vitest run tests/round-capacity.test.ts`（41 条） |
| 声明能不能少报？ | **不能**：`files` 不得小于 `implementation` 里点到的路径数（URL 已剥离、反斜杠归一、大小写不敏感），缩水 → `REQBOARD_BAD_FOOTPRINT` | 同上（含误判方向的反例：`mysrc/`、`https://…/src/a.ts` 不算路径） |
| 超容量会被拒绝吗？ | **不会，刻意如此**：它是**风险**不是错误，`success` 保持 true；人来知情放行 | `npx vitest run tests/plan-overcapacity-notice.test.ts` |
| 那怎么保证人真的看见了？ | 三条通道同源：返回体 `overCapacity`（恒在场，空=[]）+ 批准弹框题干 + 看板批准评论；计划文档内必须写标记 `⚠️超容量(建议N批)` 且 **N == 判定批数**，否则 `plan_overcapacity_marker_missing`（拒绝发生在 `mutate` 之前 ⇒ 零副作用） | 同上（T8a–T8d）+ `npx vitest run tests/plan-smoke.test.ts` |
| 门禁读哪份文档？ | **实际提交的那份**（`reqboard_submit` 的 path 是 agent 可传参数）。硬编码 `decomposition.md` 会让"提交到别处"**静默放行**——本仓最忌的形态，已在复核中修掉并钉住 | 同上（新增 2 条非默认路径用例，去掉路径参数即红） |
| 老数据要不要迁移？ | **不用**：`schemaVersion` 仍为 9；未声明的卡在台账里**不补键**、在任务树上回显 `footprintState: 'undeclared'`（未声明 ≠ 0） | `npx vitest run tests/plan-footprint-compat.test.ts` |
| 工具入参 schema 要不要一起改？ | **必须**：`additionalProperties:false` 的绑定层会在 `execute` 之前拒收未声明键——只改用例层不看壳层，功能在**真实产品入口根本不可达**（本次实测：t2 的"端到端"用例全绿而主入口必拒） | `npx vitest run tests/plan-footprint-tool-schema.test.ts`（修前必红） |
| 提示词要不要同步？ | **要**：`decomposing` 的 light/heavy 两档加了容量纪律段（生成物由 `scripts/inline-prompt-fragments.mjs` 产出，禁止手改） | `node scripts/check-prompt-fragments.mjs` exit 0 + `npx vitest run tests/prompt-gates.test.ts` |

**三条可复用的教训**：

1. **「实现了」不等于「可达」**：功能可能写完、用例全绿，却在**产品主入口**被 schema 挡死。判据必须经过真实入口，
   不要用"绕开壳层"的用例冒充端到端——本次两个窗口各踩了一次（工具入参 schema / 生产装配缺 getter）。
2. **软门禁的失败方向要写清**：超容量**只报不拒**，所以唯一能骗过它的方向是**少报体量**；下限校验（声明 ≥ 证据）
   因此是这条链上真正的地基。
3. **门禁不许有静默放行面**：读固定路径、读不到就 return 空——这类"没查到 ⇒ 放行"的写法必须给出**显式的放行理由**，
   否则换个入口就能绕过整条纪律（本次的标记门禁即因此被复核拦下）。

**未闭合**（一并留给后续）：`interfaces.md` 的计划返回体 `tasks[]` 回显未落地；只有 `contextWindow` 时
节点输入包**整节不显示**而任务树**键在场值缺席**（两份设计文档口径不同，待统一）。

来源：REQ-261002175818-80a8（拆分阶段预判单轮余量：卡片体量声明与超容量强制分批；10 卡 / 43 任务）。

## 机制备忘：运行设置的三条硬口径与两条方法论（2026-10-04，REQ-261004103330-005f）

**三条硬口径**（细节见 [运行设置与存储后端切换](settings-and-storage-backend.md)）：

1. **上限的权威读取口是同步内存快照**——来源顺序 设置文件 > 插件配置 > 环境变量 > 内置默认；
   默认值**必须留在代码里**（抄进设置文件 = 默认值冻结）；**改小不掐断在跑的那一轮**，只影响下一个判定点；
   内置默认**下限 5**（人裁定；`1` 会被读成"只能跑一轮"），守卫 `tests/stage-defaults-floor.test.ts`。
2. **换后端必须过人工确认门，且否定作答不可消费**——两道防线（源头 `denied` + 路由 403），
   演练实测删掉源头那道后路由层仍全绿，证明两层各自独立；看板上的确认面板**不是**"那个同意"
   （真正的同意在作答通道；若把落章挪进路由，这个门就可被任何能打接口的人伪造）。
3. **迁移先备份、再建库、校验不过整个作废**——用「暂存库 + 顶上」而非"事务内回滚"：
   校验作用在"将要成为目标库的那份字节"上，失败时目标库从未被碰过；源分片**全程只读**；
   `--dry-run` 连档案都不写。

**两条方法论**（都来自本轮的返工）：

- **形态也要有会红的断言**：四张前端卡全绿而界面与原型不一致，根因是验收标准里**没有一条视觉结构断言**。
  补 `tests/prototype-parity.test.ts` 后，"四屏共有形态"一条当场抓出「记录屏正常态漏屏标题」的真 bug。
- **改完立刻跑检查**：把反引号写进 CSS 注释会提前闭合模板字符串（样式表后半段失效），
  **构建照样通过**；那次因为没跑 `tsc`/测试，是后续卡才发现的。

## 变更记录

| 日期 | 变更 | 来源 |
|---|---|---|
| 2026-09-30 | 新建本手册；新增领域篇《验收单机制》《插件运行前提》 | REQ-260930183951-eb6c（验收单自证失败修复） |
| 2026-09-30 | 新增领域篇《列表视图自适应》：宽度档位契约（1180/880/720）、三条不变量、回归探针命令 | REQ-260930194112-1ab8（列表视图自适应修复） |
| 2026-10-01 | 新增「知识层」章 + 索引表挂载 `docs/knowledge/INDEX.md`（认知入口 ≤8K 字符、九项自检） | REQ-261001110934-3766（代码知识库：降 token + 快速理解项目） |
| 2026-10-01 | 《插件运行前提》新增第四节「客户端样式表必须自带归属」：client-modules 的认领/删除契约、三条注入契约、症状判据与发版门禁 | REQ-261001101739-25c6（流程节点刷新后样式全丢修复） |
| 2026-10-01 | 新增机制备忘「需求面板的刷新与陈旧可见」：`req.updatedAt` 的缺口、SSE 只作加速通道、陈旧必须可见、构建戳换版提示与一键回退开关 | REQ-261001124111-5d36（面板自刷新与陈旧可见） |
| 2026-10-01 | 知识层新增「工程操作」维度：规范页四档时机 + 四要素、覆盖清单 `operations.tsv`、K10 覆盖度门禁与 `kb-conventions-sync` 骨架生成；三阶段提示词各带一句「先查 / 自证 / 沉淀」 | REQ-261001143526-8475（技术规范自动沉淀 + 补齐打包/发版工程规范） |
| 2026-10-01 | 新增机制备忘「收尾门的三条硬约束」：验收不留白（unverified 第三态）、计划引用两通道与落库门禁、投递回执说真话、节流剩余秒数、挂起 30 分钟过期、收尾闭环判据 `closing_gap`、规范期望可判定（K11） | REQ-261001154450-b918（收尾门硬化：源自 REQ-8475 会话审核） |
| 2026-10-01 | 新增机制备忘「验收单的两条分工与契约三处同步」：验证归 agent（提交材料逐项落结果）、裁决归人（只点通过）；不可自动验证项须写明理由；契约字段按三处点名同步并用类型断言锁死 | REQ-261001184609-cecb |
| 2026-10-01 | 新增机制备忘「唤醒链的两处装配接缝与误停摆判别」：唤醒链有两处装配接缝（`diveRoundPorts.delivery` 与投递器 idFactory），任一处断掉都是**静默停摆**；disarm 是事实终态，用 `disarmed+active` 判别误停摆并可自动/显式恢复，`idle`/`paused` 永不覆盖；关键装配面另配源码级守卫（tsc 信号被既有类型错误淹没） | REQ-261001201200-8f8b |
| 2026-10-01 | 新增领域篇《读盘闸门的根解析》：读盘闸门必须按被核验需求自己的 `workspaceRoot` 读盘（`deps.docs` 是宿主级跨窗口共享单例，根会被别的窗口改掉）；根错时完整性门**误拦**、拆分内容硬门/覆盖门/格式门**静默放行**；唯一收敛入口 `applyRequirementWorkspaceRoot` + 7 处接线 + 防旁路静态断言；含「无根替身会让断言空过」「静态断言必须排除注释行」两条实测教训与两处已知缺口 | REQ-260930193929-897b（G2 闸门未按需求级 workspaceRoot 二次校正） |
| 2026-10-04 | 归档清单改为**提交时对账**：未列必须显式处置（收进清单或声明不收并写理由），否则拒绝提交；豁免规则常量单点（工具重建物）；新增受控补录（只追加+留痕）；对账结果进台账与看板。附一条教训：清单靠人手列必然漏，**把「记得列全」换成「系统对账」**才是解 | REQ-261004183621-de3f（归档清单自动收录目录内文件） |
| 2026-10-04 | 知识层改为**插件自动自举**（项目根确定时检测缺层即生成骨架+生成物；已有层零读零写、手写永不覆盖；`knowledge.autoBootstrap` 可回退），并**删除**知识库页与侧栏入口（人要看直接读 `docs/knowledge/INDEX.md`）；生成规则单点化（脚本退化为薄包装）。附两条实测教训：旧脚本 `rel` 排序而 `abs` 未排序导致符号表 file 列整体错配一行；按会话根自举若用共享仓储会写进插件宿主目录（须用根绑定仓储） | REQ-261004174324-4195（知识层自动自举 + 移除知识库页） |
| 2026-10-02 | **改写**「唤醒链」章：`activation`（只有人能改）与 `driverHealth`（运行时健康，paused=停下等人）分家，`phase` 降为读侧兼容；达上限/运行时故障一律只写健康位，恢复时归还本阶段额度；回合计数改「本阶段」语义（跨阶段归零）；新增心跳兜底（停滞才叫、3 次叫不动留诊断）与 `[WAKE-RX]` 接收证明；存量台账启动幂等迁移（6 行矩阵 + `migratedAt` 印章）。附一条方法论教训：**把症状写成机制结论前先在源码里证伪一遍**（本需求的前提「agent 事件被 scope 过滤器丢弃」经核查不成立，实现保留、理由改为生命周期归属） | REQ-261001213924-1441（唤醒链活性、可恢复性与可观测性） |
| 2026-10-02 | 同节补记：审批链「0 产出不得推进」守卫、恢复指引必须可执行、驱动无进展护栏；并记录 reqboard_clear_pause 接线修复（此前从未工作过） | REQ-261002110908-81d0（与 REQ-261002115204-ba52 同源） |
| 2026-10-02 | 新增机制备忘「长文本工具入参的写法约定（防整轮报废）」：半角引号漏转义 → `MALFORMED_RESPONSE` → 整轮报废；三锚点收敛为一处共享常量 `LONG_TEXT_ARG_NOTE` + 覆盖清单 `LONG_TEXT_FIELDS`（15 条 / 8 工具），遍历用例守覆盖、反向证伪可红；实施片段加「汇报自检」；零行为变更与「适配器粒度修复在边界外」的边界声明 | REQ-261002115204-ba52（重开自 REQ-261002110908-81d0） |
| 2026-10-02 | 新增机制备忘「回执必须与副作用一致（无损 JSON 的两条铁律）」：`undefined` 值属性会被绑定层整体拒收（校验在 `JSON.stringify` **之前**）⇒ 缺值必须**整体省略键**；前值必须在**变更器内**捕获（`mutate()` 只回传 `{changed,revision}`）；失败要按 `changed` 判，否则会把"没改到"报成成功；契约门禁删掉「undefined 当省略」的善意豁免并引入留债登记（修好即摘牌），补洞当场抓到第二处同类活缺陷（ask_confirm 的答复字段） | REQ-261002140814-1a5d（clear_pause 成功却报 value is not lossless JSON） |
| 2026-10-02 | 新增机制备忘「PM 插件 agent 测评套件（eval-suite/）」：36 用例三件套 + 5 rubric + runbook；评分=六维加权+pass^4+红线一票否决（6 条）；可重跑校验脚本；调研沉淀入 strategy-research | REQ-261002120707-deab（PM 插件 Agent 测评套件编制） |
| 2026-10-02 | 新增机制备忘「窗口 chip 的「恢复并打开」契约」：已归档会话在侧栏不可见，看板 chip 是唯一回程入口——点击 = 先 `workspaces.unarchiveSession` 恢复、再 `selectPanel(null)`+`openSession` 打开；恢复必须后于可用性检查（打不开就不改宿主状态）、失败不打开（不制造"以为跳过去了"）、能力缺失保留旧语义并说清是能力问题 | REQ-261002153446-c600（看板窗口 chip：已归档会话点击后取消归档并打开） |
| 2026-10-02 | 新增机制备忘「弹框在途即停手（人工门禁与自动链的准入契约）」：停手判据 = 在途弹框（同步内存登记）+ 台账停手位（复用 `driverHealth`，零新字段）；三处准入（起轮/派卡/恢复不越权）+ 四条恢复出口（作答、看板确认、取消、过期对账）；含「拦截判据必须同步可得」与「基线要用临时置空取，不能 stash 整份文件」两条可复用教训 | REQ-261002141430-a5ef（弹框在途即停手） |
| 2026-10-02 | 新增机制备忘「自动链能不能自己跑（owner 契约 / 失败不留锁 / 人的显式接回）」+ 领域篇 [自动链契约](automation-chain-contract.md)：`owner` 必须是 **id 字符串**（传对象 → `session "[object Object]" has no live agent`，缺省=合法的 unowned）；投递失败必须当场回收 `advance` 锁（否则自锁 15 分钟）并把原因写进 `DISPATCH_FAILED` 留痕；`disarmed+idle`（人按过 `clear_pause`）**只有人**能改回 `armed+active`，自动路径永不改写；登记三条已知缺口 **N-1** armed+死窗口=静默停摆且心跳报成功、**N-2** 窗口绑定可被静默改写（全仓无写入点）、**N-3** 高频产物逐条催办弹框量产 | REQ-261002173819-69c7（修复 reqboard 自动化断链） |
| 2026-10-04 | REQ-261004065652-5c1c | 自动链四道停机前置（内存闭锁/全局闩/人工门/预算闸）+ 投影读己所写 |
| 2026-10-04 | 新增领域篇 [子卡阶段模板](subtask-stage-template.md) + 机制备忘「六个登记点与 manual 停链」：`stageKind` 16→20（`e2e`/`manual`/`release`/`capture`）、模板键 +2（`change-only`/`acceptance`）、`template` 一等字段（与 `stages` 二选一、同给即 CONFLICT）、`manual` 段不派 run 的停链等人形态（防伪造锚 `manualSkeletonAt`）、规范 C-19 登记点全表；已知缺口：不在 vitest include 内的死测试仍写死「16 种 StageKind」 | REQ-261003203909-55f2（子卡阶段模板补充） |
| 2026-10-04 | 新增机制备忘「拆分前先算一轮装不装得下」：体量三量合成 `detailUnits`（容量与权重单点在 limits）、声明下限（少报是唯一能骗过软门禁的方向）、超容量只报不拒但三通道同源可见、计划文档标记批数必须相等且门禁读**实际提交路径**（硬编码即静默放行面）、老数据零迁移（schemaVersion 9 / 不补键 / undeclared≠0）、工具入参 schema 必须同改（否则主入口不可达）、提示词两档同步；附三条教训（实现了≠可达 / 软门禁的失败方向 / 门禁不许有静默放行面） | REQ-261002175818-80a8（拆分阶段预判单轮余量：卡片体量声明与超容量强制分批） |
| 2026-10-04 | 「刷新不得打断读图」补**第三例：看板泳道**——位置保活用独立内存模块 `src/client/board-scroll.ts`（单条快照、按 `data-lane` 记列内位置、不落盘、与 DAG 记忆靠**模块边界**隔离），接线在唯一重绘点 `render()` 的 `innerHTML` 赋值前后（顺序是硬契约）；列高改「拉伸铺满」——行 `align-items: stretch` + 删掉写死的视口减常数上限 + `min-height: 0` 链，列内卡片区成为唯一滚动处（列头固定）。附两条新教训：**测试桩必须复现真实重建**（桩若无条件重建泳道，列表视图分支根本没走到 = 绿着骗人）、**机械锚点别被注释污染**（注释里写原样代码会把 `grep -c … = 0` 顶成 1） | REQ-261004184822-9881（看板泳道自动刷新导致浏览位置丢失 + 列高不铺满） |

## 机制备忘：自动链能不能自己跑（owner 契约 / 失败不留锁 / 人的显式接回）

> 来源：REQ-261002173819-69c7（2026-10-02）。前情：一条在实施中的需求"12 个回合全部正常收尾，
> 但两条自动化通道同时死掉"，之后每一步都靠人手动打「继续」。细节见领域篇 [自动链契约](automation-chain-contract.md)。

| 问题 | 结论 | 判据 |
|------|------|------|
| 投递后台任务时 `owner` 该传什么？ | **agent/session 的 id 字符串**。传对象会被宿主判成"无 live agent"，错误文本还把它藏成 `[object Object]`；不传 = 合法的 unowned job（能跑，但失去 owner 作用域的取消与并发上限） | `tests/advance-dispatch-owner.test.ts`（D-4a/D-4b/D-5/D-6） |
| 投递失败后能不能立刻重试？ | **能**。锁是投递**前**认领的，失败必须当场回收并写 `DISPATCH_FAILED` 留痕；否则这条需求会被自锁 15 分钟且台账看不出原因 | 注入必失败端口 → `advance.lockAt/runId` 均为 `undefined`，紧接着重试 `dispatched=true`（D-1/D-2/D-3） |
| 被 `clear_pause` 关成手动的需求，系统会自己救回来吗？ | **不会，也不该**。`disarmed+idle` 与"人主动关掉自动化"在台账上同形；它是**只有人**能改的形态，入口是看板「继续」（`armExplicit`，固定留人工痕） | `tests/dive-rearm.test.ts`（R-1..R-7）、`tests/reqboard/autorun-rearm.test.ts`（R-8/R-9） |
| 这条链在本机为什么还是投不出去？ | 本 profile 把 `@deepseek-ai/dsh-tool-jobs`（job 控制器）关着 → 宿主一律拒收。**属配置，不是代码缺陷** | `plugin_manager list_plugins` 看 `include:tool-jobs` 的 `enabled` |
| 还有哪些没修的？ | **N-1** armed + 绑定窗口已死 = 静默停摆（心跳仍报 healthy）；**N-2** 窗口绑定可被静默改写（全仓 src 无写入点）；**N-3** 高频产物逐条催办 → 弹框量产 | 见领域篇第五节，含实测时间戳与 json 对照 |

## 机制备忘：节流判据的归属口径与产物生效链

> 来源：REQ-261001170807-06fd（节流不再惩罚正常收尾 + 子卡验收标准自带可跑命令）

### 一、60 秒节流认的是「非子卡」

| 事实 | 说明 |
|---|---|
| 子卡链不受节流 | 子卡走三项口径（报告 / 文件 / 结论），关多少张都不触发节流 |
| 节流只拦非子卡连环关闭 | 判据里排除本卡自己的子卡（parentId 归属），兄弟卡与跨卡仍计入 |
| 为什么 | 关完自己的子卡再关父卡是唯一正确的收尾顺序；节流要拦的是「一次关多家卡」的滥用 |

拒绝文案会给出确定等待秒数与三条合规路径，不必靠试探或硬等找节奏。

### 二、产物生效链：改 src 不等于改现场

| 环节 | 说明 |
|---|---|
| 改 src | pnpm test 跑的就是 src，单测全绿不代表现场变了 |
| pnpm build | 产出 dist/index.mjs（插件入口 main 指向它） |
| 重启宿主 | 宿主进程持有启动时加载的模块，build 不会热加载 |

| 坑 | 症状 | 判据 |
|---|---|---|
| 只改 src 不 build | 单测全绿、现场照旧 | 搜运行期字符串（不是注释）确认 dist 已含改动 |
| build 了没重启 | 同上 | 宿主未重载 —— 必须重启 |
| 拿会被省略的键当探针 | 误判「仍是旧模块」 | 先确认该键在正常情况下必然出现 |

### 三、验收交互的两条纪律

| 纪律 | 内容 |
|---|---|
| 验证是 agent 的活 | 验收项若已带 agent 记录的实际结果，人点「通过」即视为已复核，不逼人重抄 |
| 失败要响亮 | 弹框故障必须报真因（中断 / 工具故障 + 原始错误），不得写成「用户未作答」 |
| 2026-10-01 | 新增机制备忘「节流判据的归属口径与产物生效链」：节流只认非子卡、原始收尾顺序不被惩罚；改 src 必须 build 并重启宿主才影响现场（附三条探针纪律）；验收交互两条纪律（验证归 agent、失败报真因） | REQ-261001170807-06fd |

## 机制备忘：验收单的两条分工与契约三处同步

> 来源：REQ-261001184609-cecb（验收不再要人填结果）

### 一、验证归执行方，裁决归人

| 谁 | 做什么 | 依据 |
|---|---|---|
| agent | 提交验收材料时逐项给出「跑了什么 + 实际输出」 | evidence 写成 <验收项> :: <结果>，提交时绑定 |
| 人 | 只看结论点「通过 / 退回」 | 该项已有结果时弹框只问一次，零输入即可裁决 |
| 只有无法自动验证的项 | 才要求人填写，且必须写明理由 | needsHuman + humanReason（界面视觉、线下流程） |

保留的底线：没有任何结果的项，选「通过」仍记**未复核**（不冒充通过）；人填过的结果**不被 agent 回填覆盖**；
回滚开关 DSH_REQBOARD_NO_ITEM_RESULT=1 可回到旧口径（人自己填）。

### 二、契约同步要按处数点名

同一个字段往往散在**三处**：domain 的 SheetItemLike、protocol 的 VerificationItem、client 的 VerificationItem。
实测教训：只改 domain 一处时 tsc 直接报错、弹框拿到的是没有字段的类型——是编译器拦住的，不是人发现的。

| 纪律 | 做法 |
|---|---|
| 卡要写清处数 | 契约卡的验收标准必须点名「有几处契约要同步」，不能只写「字段可读写」 |
| 用编制兜底 | 加契约三处同步锁（类型断言）：任一处漏字段，测试文件编译失败、跑不起来 |

## 机制备忘：唤醒链的两处装配接缝，与「误停摆 vs 有意停手」的判别

> **一句话**：「人工门确认之后 agent 会不会自己继续」由一条链决定，而这条链有**两处装配接缝**——
> 任一处没接上，症状都是**完全静默的停摆**（看板显示正常、日志里没有面向人的报错）。

```
人工门确认（弹框 / 看板）
  → store.mutate(requirement-moved) → ctx.emit → round driver.onRequirementMoved
  → drive()  ──① ports.delivery 必须在位（src/index.ts 的 diveRoundPorts）
       └─► delivery.createRoundMessage(...)  ──② idFactory 必须是函数（组合根三参构造 AgentDeliverer）
             └─► deliverMessage → agent.followup → 起轮
```

| 接缝 | 断掉的后果 | 现在由谁守 |
|------|-----------|-----------|
| ① `diveRoundPorts.delivery` | `drive()` 第一步抛 `Cannot read properties of undefined` | `tests/dive-wake-wiring.test.ts` 的源码级装配守卫 |
| ② 组合根三参构造（idFactory） | `createRoundMessage` 抛 `this.idFactory is not a function` | 同文件的装配形状守卫 + 构造期 TypeError |

**为什么症状是静默的（历史形态，2026-10-02 前）**：`drive()` 抛错被 `requestDrive` 的 catch 吞掉 → `disarm(state, reason)`
曾把台账 `dive.activation` 写成 `disarmed`——而除立项外没有第二条重新武装的路径，于是**一次异常 = 该需求永久没有自动化**。

### 两套状态：人的意图 vs 运行时健康（2026-10-02 起，REQ-261001213924-1441）

| 字段 | 谁写 | 语义 | 判据 |
|------|------|------|------|
| `dive.activation` | **只有人**（立项置 armed / clear_pause 置 disarmed / 启动迁移对误停摆恢复） | 要不要自动跑 | `isDrivableRequirement` 第一条件 |
| `dive.driverHealth.state` | 运行时（驱动侧） | 现在能不能跑（paused = 停下等人，**不是终态**） | 第二条件 |
| `dive.phase` | 不再写 | 旧字段，读侧兼容一版 | 仅当无 `driverHealth` 时按它推导 |

| 运行时形态 | reason 例 | 恢复方式 |
|-----------|---------|---------|
| 投递/检查点/驱动失败 | `queue-failed` / `checkpoint-failed` / `driver-failed` | 下次 `requirement-moved` 或看板「继续」→ `recoverHealth` |
| 达阶段回合上限 | `round-limit:<阶段>` | 同上，且恢复时**把本阶段额度还回去**（否则一点继续又立刻撞上限） |
| 连续唤醒叫不动 | `wake-undeliverable` | 心跳累计 3 次失败后落此态；修好链路后同上恢复 |
| 人主动停手 | activation=disarmed + phase=idle | ❌ 永不覆盖 |

### 回合计数、心跳与接收证明

- **回合计数是「本阶段」语义**：`transitionRequirement` 跨阶段时归零（修前全生命周期累加，撞上 draft/archived 的 1 回合上限即永久停）。
- **心跳兜底**：每 60s 对账一次，只叫醒「可驱动 + 停滞 > 10 分钟」的需求；连续 3 次叫不动 → `driverHealth=paused(wake-undeliverable)` 并在需求上留一条人话 comment。
- **[WAKE-RX] 接收证明**：per-agent 订阅收到 `agent/status` 即写一条诊断。**下一次「没被唤醒」先看这两种形态**：有 `[WAKE-RX]` 无后续 = 事件到了、驱动侧断；一条都没有 = 事件没到。这比 grep 会话目录可靠（会话目录常被清理，观测面会骗人）。
- **订阅归属**：per-agent 六路注册在 `agent.ctx`（`agent/created` 里取），随 agent 处置注销；拿不到 `agent.ctx` 时 warn + 诊断 + 需求 comment 三者齐备。
- **存量迁移**：启动对账里跑一次（`migrate-dive-state`），按 6 行矩阵归一，`dive.migratedAt` 印章保证幂等，只盖章不 bump version。

### 一条方法论教训：前提也要有证据

本机制最初登记为「agent 事件被 scope 过滤器丢弃」。复核宿主机源码后发现**不成立**：`scopeTarget` 对未打标签的 ctx 一律放行（`packages/core/scope/src/index.ts:165-181`），本插件 ctx 未打标签（profile 以普通 loader 条目装载、无 isolate/scope），且宿主自带的 `goal-round-driver` 同样把 `agent/status` 挂在插件 ctx 上、生产可用。
真正的价值在**生命周期归属**（宿主规范 practices.md:19：agent 处置即注销）与**可观测**（接收证明）。教训：**把「症状」写成「机制结论」之前，先在源码里把它证伪一遍**——否则修得对不对无从判断，闸门也无从变红。

### 三条可复用的教训

1. **装配错误要响亮**：构造期就抛，别拖到运行期第一次调用——拖过去就会被事件循环的 catch 吞成「静默停摆」。
2. **`tsc` 是信号，但会被淹没**：`diveRoundPorts` 缺 `delivery` 本来就有 TS2741，但仓库有近 200 条既有类型错误，没人看。
   所以关键装配面另配**可读、会变红的**源码级断言。
3. **诊断先看「有没有真的投出去」**：`grep -ro "kind":"dive" ~/.dsh/sessions | wc -l` = 0 就说明起轮一次都没成功过；
   再看台账 `dive.roundsInStage`（是否被准入）与 `dive.activation`（是否已被 disarm）。

### 重复立项：同一处断点被两个窗口各立一次（2026-10-02）

**现象**：REQ-260930231831-a8fa（09-30 立项）与 REQ-261001201200-8f8b（10-01 立项）指向**同一处装配接缝**（上面的接缝②）。
后者先交付、验收 7/7 并归档；前者四张卡全程**零代码改动**，按「重复交付」归档。

| 判定信号 | 本次读法 |
|----------|----------|
| 目标交付物已在工作区 | `grep -n "new AgentDeliverer(" src/wiring/pm-capture-root.ts` 已是三参；装配守卫测试在场且全绿 |
| 原计划的取舍与落地实现**相反** | 原计划「idFactory 兜底、构造期不抛」 vs 落地「构造严格抛错、投递宽容」——照原计划做会**回退已验收的设计** |
| 时间线倒挂 | 立项 09-30 → 交付 10-01 → 归档 10-02（先立项的反而零交付） |

**处置口径**（本次采用，可复用）：

- **不重复实施**，也不伪造执行凭证；
- 卡状态**如实**：因懒展开短暂开工的卡退回 `todo`，绝不挂在制；
- 补三份记录：`reviews/duplicate-review.md`（判定证据）、`reviews/acceptance-self-check.md`（逐条自检）、`tests/test-evidence.md`（实跑读数 + `covers:` 映射）；
- 照常走自己的验收与归档，把**「重复性」本身**作为验收对象。

**教训**：已经定位到单点根因的疑问，立项后要尽快推到实施——拖过夜就可能被另一个窗口先交付，
留下一份零交付的重复需求，台账上多一条需要人工判读的记录。

## 机制备忘：刷新不得打断读图（面板视图状态保活 + 注入字符串稳定化）

面板每 ≤5 秒（+每个 SSE 任务事件）会重新取数。**"换数据"与"重建界面"是两件事**——把两者绑在一起，
用户在图上的选择（方向 / 关键路径 / 只看主线 / 钉住 / 页签 / 滚动位置）每次刷新都会被清零。

| 问题 | 结论 | 判据 |
|---|---|---|
| 面板重建后，用户在 DAG 上的选择去哪了？ | 存进**内存记忆表**（`src/client/dag/view-state.ts`），键 = `<canvasId>::<需求id>`；`mountDagCanvas(..., { stateKey })` 挂载时回填 initial、dispose 时先写回再释放 | `npx vitest run tests/dag-view-state.test.ts`（A1-2/A1-3/A5） |
| 为什么键里必须有需求 id？ | `#dag-canvas` / `#np-dag-canvas` 是**固定 canvasId**，同一块画布会承载不同需求的图；键不含需求 id 就会把 A 需求的横向/只看主线带到 B 需求 | A5 用例（读另一需求为 `undefined`） |
| 有状态回填就够了？ | **不够**：还得让"没变数据"时别重建 DOM——否则每轮都在销毁重建画布与滚动容器 | 见下一条 |
| 为什么整段面板会被重建？ | 面板走 `dangerouslySetInnerHTML`，React 只在 `__html` **逐字节不同**时才重设；原先把「数据时间 HH:MM:SS」和「N 分钟前」写进字符串 ⇒ **每轮都变** ⇒ 整段重建 | `npx vitest run tests/panel-freshness-render.test.ts`（A2-1/A2-2） |
| 那易变值放哪？ | **出注入字符串**：字符串里只留稳定钩子（`data-dsh-pm-fresh-slot` / `data-dsh-pm-rel="<ts>"`），值由渲染后的补丁写（`hydrateNodePanel`，只改文本/属性、不插删元素） | `npx vitest run tests/panel-hydrate.test.ts`（A3-1…A3-3） |
| 怎么证明"刷新不再打断"？ | 一条可跑探针：二次挂载后状态与滚动保持 + 两轮（仅时间戳差 5 秒）字符串逐字节相同 | `npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` |
| 兼容旧调用方？ | `opts.stateKey` **可选**，不传 = 改造前行为（缺省 `DEFAULT_DAG_STATE`，不读写记忆表） | `npx vitest run tests/dag-view.test.ts`（29 条既有用例） |

**两条可复用的教训**：

1. **"每轮都变的值"不得进注入字符串**：时间戳、相对时间、"现在"这类字段一旦进了 `__html`，
   等于给每次轮询都发了一张"重建整段 DOM"的通行证——而 React 的替换是整段的，画布、滚动、DOM-only 状态全陪葬。
2. **重建是常态时，状态必须有外部归属**：任何只活在闭包/DOM class 里的用户选择，在多长时间刷新一次的界面上，
   都等价于"下次刷新就会丢"。要么别重建，要么让它可回填——本次两条都做了。

来源：REQ-261001210304-0dfb（会话节点面板 DAG 刷新即重置视图状态）。

### 同款缺陷第三例：看板泳道（2026-10-04，REQ-261004184822-9881）

看板 `render()` 每次取数都 `viewEl.innerHTML = buildBoard(...)` **整段重建**，而重绘有四条触发路径
（SSE 台账事件 / 20 秒轮询 / 手动「刷新」/ 卡面操作后取数）——用户横滚到的列、长列里翻到的位置每次都被打回起点。

| 问题 | 结论 | 判据 |
|---|---|---|
| 泳道位置存哪？ | 独立内存记忆模块 `src/client/board-scroll.ts`（单条快照：横向 `scrollLeft` + 按 `data-lane` 记列内 `scrollTop`） | `npx vitest run tests/board-lane-scroll.test.ts`（TC-1~TC-4） |
| 为什么不塞进 `dag/view-state.ts`？ | 那张表的键是 `<canvasId>::<reqId>`、语义是「某块 DAG 画布的选择」；塞进去等于把「泳道 = 某块画布」这种假关系写进数据模型。**隔离靠模块边界，不靠键前缀**（前缀会被写错，模块边界不会） | TC-4（两套记忆互不影响） |
| 接线点在哪？ | 唯一重绘点 `render()`：`innerHTML` 赋值**前** capture、**后** restore；顺序是硬契约（夹在中间 = 没记） | TC-5（走真 `attachBoard` + 假计时器） |
| 非泳道视图（列表 / 详情 / 空态）会误清记忆吗？ | 不会：找不到 `.dsh-pm-lanes` 时 capture **静默返回且不覆盖**——写零就等于「从详情页返回时把位置冲掉」 | TC-3 |
| 位置落盘吗？ | 不落盘（不写 `sessionStorage` / `localStorage`）；页面重载回最左是明确接受的行为 | TC-4（源码断言） |
| 列为什么「不通到底」？ | 泳道行是 `flex: 1`，但列没被拉伸（`align-items: flex-start`），列高又被写死「100vh 减常数」封顶 ⇒ 列只包住自己内容、下方留一大片空白。改法：**行改 `stretch` + 删掉视口魔术值 + `min-height: 0` 链**，列内卡片区成为唯一滚动处（列头固定） | TC-6（读 `styles/base.ts` 源码的静态断言）+ 人工验收 |
| 矮窗口会不会破版？ | `min-height: 0` 让行与列内卡片区都可收缩；极矮时列内仍能滚到最后一张 | 设计边界见 `docs/requirements/REQ-261004184822-9881/design/frontend.md` |

**这次新长出来的两条教训**：

1. **测试桩必须复现「真实重建」**：桩容器的 `innerHTML` setter 若无条件重建泳道，列表视图下也会「有泳道容器」，
   于是「列表不覆盖记忆」这条真实分支根本没走到——**绿着骗人**。桩要按 HTML 内容决定建什么（含 `dsh-pm-lanes` 才建）。
2. **锚点别被注释污染**：卡内锚点 `grep -c "max-height: calc(100vh" = 0` 被一句「解释历史写法」的注释顶成 1。
   注释里别写原样代码，锚点则要先剥注释——**机械锚点要按机械事实判**。

来源：REQ-261004184822-9881（看板泳道自动刷新导致浏览位置丢失 + 列高不铺满）。

### 同款缺陷第四例：需求详情页（2026-10-04，REQ-261004195831-0f52）

**这次不是"重建丢状态"，是"数据源换了、消费端没跟上"**：`GET /state` 自 B12 ⑥-① 起只下发
**摘要**（`id/title/status/version/commentCount…`，本体字段不再随首屏下发），而详情视图仍从
`state.requirements` 取记录直传 `buildReqDetail` ⇒ `renderComments(req.comments)` 对 `undefined`
取 `.length` ⇒ **点开任一需求即崩、详情页整块不渲染**。全文改由 `GET /requirements/:id` 按需提供——
该客户端函数**早就写好了，却零调用点**（"接口写完了没人接"是这轮最贵的缺陷）。

| 问题 | 结论 | 判据 |
|---|---|---|
| 详情正文从哪来？ | **进入详情时按需取全文**（`src/client/req-detail-store.ts`），摘要只喂骨架（标题/状态/来源窗口）；首屏仍是 **0 次**详情请求 | `npx vitest run tests/req-detail-ondemand.test.ts -t board-wiring`；既有 `tests/state-payload-client.test.ts` 不许放宽 |
| 反复重绘会不会打成请求风暴？ | 两层：① **同 reqId 在途复用**（同一 tick 的 SSE + 轮询只 1 个请求）；② 失效判据必须**方向性**（`上游 > 手里`），`!==` 会在「详情响应比 /state 新」（写入落在两次 `head()` 读之间，常态）时恒真 ⇒ 重取→重绘→ensure **自持成环**（复核实测 50ms 内 250 次请求、501 次触顶） | `-t req-detail-store`（TC-4 含"上游落后不得重取"循环断言） |
| 两个版本号能混用吗？ | **不能**：`record.version` 是按需求的局部计数器，`/state` 的 `revision` 是台账全局计数器。载荷没带 `revision` 时**记为未知**（该判据不成立），绝不回落成另一个计数器 | 变异 M7（混源回落）判红 |
| 取不到全文时怎么办？ | 三态显式呈现（`src/client/views/detail-states.ts`）：加载中 / **未找到**（404）/ 失败（原因 + hint + 重试）；**删掉**了旧的「找不到就静默 `mode = board`」——那是"点了没反应且无痕迹" | `-t detail-states`；`tests/board-attach.test.ts` TC-8 已按新契约改写 |
| 重取途中会闪一下空白吗？ | 不闪：**终端态优先于旧数据**（missing/error 先判），只有"正在重取且手里有上一次渲染过的全文"才先顶着旧内容；需求被删绝不继续装作还在 | 变异 M6（把旧数据优先级改回）判红 |
| 服务端少给字段会崩吗？ | 不会：`renderComments` / 评论计数 / 时间线 / 任务卡一律按"缺失或非数组 → 空态"处理（`null` 也要挡，`typeof null === 'object'` 会骗过只判 `undefined` 的守卫） | `-t detail-defense`（本 bug 回归锚点：摘要形状调 `buildReqDetail` 不抛异常） |

**两条可复用的教训**：

1. **"接口写完"不等于"接线完成"——这必须有机械判据**：模块单测全绿、类型检查通过、build 成功，
   但消费端一个调用点都没有，合入当天缺陷依旧在。第一轮独立复核就是靠"全仓 grep 调用点"抓到的。
   所以：**新模块的验收里必须有一条走真实挂载路径的端到端用例**（这里是 `attachBoard` → 摘要首屏 →
   详情取全文 → 屏幕上出现全文里的真实评论），否则"修了"只是自我感觉。
2. **判据要问"方向"，不只问"不等"**：两个单调计数器的对照，`!==` 会在"手里比上游新"时恒真，
   把一次取数放大成自持循环。凡是"变了就重做"的失效判据，都要写清**谁落后于谁**才重做；
   做不到就宁可不重做（陈旧可刷新，风暴会打穿）。

来源：REQ-261004195831-0f52（看板需求详情页打不开：`/state` 改摘要后未按需取全文）。

## 机制备忘：归档不等于数据被收回（可回看入口与终态只读）

用户的原话是「归档后 DAG 的数据会被收回吗？我看不到 DAG 的数据展示了」——
**数据一条没少，丢的是入口**。完整机制见 [归档需求的可回看入口](archived-entry.md)。

| 问题 | 结论 | 判据 |
|---|---|---|
| 归档会删掉任务吗？ | **不会**：`queue.json` 原样保留，接口 `listAll()` 全量返回，`buildReqDetail` 对 archived 照常画 DAG | `npx tsx docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts`（真实数据 553 任务 / 锚点 39 张） |
| 那为什么看不见？ | `toReqCards()` 把 archived/canceled 全滤掉 → 看板**零卡片** → 点不进详情；归档条 CSS 在但渲染从未接上，列表终态组因此成了死分支 | `npx vitest run tests/archived-entry.test.ts`（A1-2/A4，修前必红） |
| 怎么修才对？ | 抽 `toCard` 单一构造点 → `toReqCards`（不变）+ `toTerminalCards`（归档∪取消），泳道底部折叠归档条、列表终态组各给一个入口 | 同上（A6 不变量：两投影互斥且并集=全部需求） |
| 归档需求详情能操作吗？ | **不能，且必须显式早退**：`renderActionBar` 对 archived/canceled/done 返回 `''`——此前靠"switch 恰好没分支"的巧合，canceled+未批准计划会渲染「批准计划」、legacy done 会渲染点了必 404 的「归档」 | 同上（A3 三态） |
| 为什么不做归档快照？ | 会造出第二份真相（详情画的是哪份？副本过期谁负责）；前提是"数据本来就在"，故只补入口与只读 | `grep -rn "archiveReq\|archive-req" src` → 无输出（残留也一并清零） |

来源：REQ-261002105242-a3fb（2026-10-02）。

## 机制备忘：回执必须与副作用一致（无损 JSON 的两条铁律）

**症状**：调 `reqboard_clear_pause`，锁**真的开了**（台账已改、后续操作可用），同时却收到
`value is not lossless JSON`——调用 agent 因此误判失败，可能重试或绕路。这就是"最坏的错报形态"：
**副作用已发生，回执说没发生**。

| 问题 | 结论 | 判据 |
|---|---|---|
| 什么值会被整包拒收？ | **值为 `undefined` 的属性**。绑定层的无损 JSON 校验（`@deepseek-ai/dsh-util-values` 的 `walkJsonValue`）在 `JSON.stringify` **之前**就看内存值——`undefined` 不属于任何 JSON 值类型 ⇒ 整个回执被转成无信息的硬错误。**不能靠序列化兜底**（`JSON.stringify` 会静默丢键，那正是"看起来没事"的原因） | `tests/status-lossless.test.ts`；`tests/clear-pause-lossless.test.ts` 的 `undefinedPaths` 递归扫描 |
| 缺值该怎么写？ | **整体省略该键**（条件展开 `...(v !== undefined ? { k: v } : {})`）。发 `null` 同样不合法（会被保留并撞上 schema 的类型校验） | 同上（UC-2：`hasOwnProperty` 为 false） |
| 前值从哪取？ | **在变更器内捕获**（与"实际被写入的那份 draft"同源）。`repo.mutate()` 返回的是 `{ changed, revision }`，**不回传**变更器的自定义返回值——从返回值读键必然恒为 `undefined` | `src/application/use-cases/ClearPause.ts`；TS2339 即证据 |
| 失败怎么判？ | 按 `changed.requirements.length`（有没有真的改到）。用 `result === undefined` 判是**死分支**（`mutate` 从不返回 undefined），会把"需求已消失"报成成功——比误报失败更坏 | UC-3：抛 `REQBOARD_MUTATION_FAILED` 且零写入 |
| 怎么防复发？ | 契约测试**删掉**「`obj[k] === undefined` 当省略」的善意豁免，并引入**留债登记表**（登记项必须仍然有问题，修好即强制摘牌） | `tests/output-contract.test.ts` 的 `UNDEFINED_VALUE_DEBT` |
| 还有别的同类实例吗？ | **有**：豁免一删，门禁当场抓到 `reqboard_ask_confirm` 非肯定项且未填意见时 `user_feedback: undefined`（`AskConfirm.ts:312`）——人的"需要修改"答复会变成硬错误；已登记留债（到期 2026-10-16）另立需求 | 同上（留债项断言） |
| 门禁还有看不见的地方？ | TaskAdopt / Knowledge / Regenerate 三工具**没有 `RESPONSE_SOURCES` 映射** ⇒ 它们的返回键压根不被检查（"门禁绿灯只是因为它没看"） | `tests/output-contract.test.ts` 的既有失败 |
| 改了代码就生效了吗？ | **不是**：`src` → `pnpm build` → **重启宿主**（见「节流判据的归属口径与产物生效链」）。故本次交付的"真实调用端到端"必须由重启后的调用复核，不能拿单测代替 | `pnpm build` 后搜 `dist/index.mjs` 的运行期字符串 |

**三条可复用的教训**：

1. **`undefined` 不是"没写"**：内存值与序列化结果不是一回事，校验点在 `stringify` 之前——所以"序列化会丢掉它"这种推理是**反的**，正是它让豁免看起来合理。
2. **"副作用已发生 + 回执报错"比"什么都没发生"更坏**：它把确定性变成猜测。功能修好时，必须把"汇报自己"的那部分一起修——本次两者同在一条链上（值没传出来 → 读成 undefined → 整包拒收）。
3. **门禁的"善意豁免"必须带登记者与到期日**：一条"这个字段可以放过"的例外，就是下一个缺陷的通行证。删豁免 + 留债登记（修好即红）比"以后再补"可靠。

来源：REQ-261002140814-1a5d（2026-10-02）。

## 机制备忘：弹框在途即停手（人工门禁与自动链的准入契约）

> **一句话**：弹框在等人作答时，自动链必须**停手**（不投新回合、不派新任务卡）；
> 人一作答就**自动恢复**；**没有弹框时一律不停**。修前只有"写工具"被守卫拦住，
> 自动链对此一无所知——于是出现"框在屏幕上、agent 还在跑"，下一轮写被
> `REQBOARD_CONFIRM_PENDING` 打回，空转烧回合直至撞上阶段回合上限。

| 问题 | 结论 | 判据 |
|---|---|---|
| 修前到底缺哪一块？ | 停手守卫只拦 4 个写工具（`pending-guard.ts`）；起轮准入 `readyToDrive` 只看 fiber/存活/idle/竞争消息；实施链只看 `autoRun`——**三处都不问"有人在等吗"** | `npx vitest run tests/dialog-inflight-stop.test.ts`（TC-1 / TC-2，修前必红） |
| 停手判据是什么？ | **在途弹框登记**：某个确认门弹框已投递、人还没答（未作答/未过期/台账未落章）。挂起部分复用既有 `livePendingConfirm` | 同上（TC-1 在途不投回合） |
| 为什么要拆成"内存同步 + 台账异步"两半？ | Dive 的人工门框与起轮**在同一 idle 拍相邻**（`session-driver` 的 `captureTick` → `requestDrive`）。台账写是异步的 ⇒ 拿它当拦截判据，同拍那一轮照样投出去。**同步登记管拦截，台账只管可观测与重启对账** | 同上（TC-7：同一拍弹框 1 次、投轮 0 次） |
| 停手位存在哪？ | 复用 `dive.driverHealth`：`{state:'paused', reason:'awaiting-confirm:<ref>'}` + 一条 comment。**零新持久字段、不 bump schemaVersion**；`activation` / `autoRun` 一字不改（人的意图不动） | `grep -rn "awaiting-confirm:" src` 只命中 `internal/awaiting-confirm.ts` |
| 恢复有哪些出口？ | 四条：**作答到达**（含否定/需修改）、**看板确认**（三条确认通道的唯一收敛点 `confirm-settle`）、**显式取消/降级**、**过期或重启**（心跳对账趟）。恢复幂等且必留痕 | 同上（TC-3 / TC-5 / TC-6） |
| 谁会"替人解除等待"？ | **看板「继续」不行**：`rearmIfRecoverable` 在途时返回 false 且零写入，并如实说明"仍在等待人工确认"——否则会造出"框还在、链已跑" | 同上（TC-5：comment 数不变） |
| 最坏的形态（停了没人叫醒）怎么防？ | 心跳每趟**先做停手对账**：台账写着等弹框而实际无在途（TTL 过期 / 重启丢了内存表）→ 清位 + 留痕 + 进 `resumed` 桶 | 同上（TC-6 两条断言） |
| 降级路径怎么处理？ | **不登记**（INV-4）：弹框发不出去就没人会作答，登记 = 永久停手 | 同上（TC-8） |
| 会不会把正常流程也停了？ | 反向自检守这一侧：无在途时起轮/派卡与改动前逐字一致；判据未装配（`dialogs` 缺省）时行为不变 | 同上（TC-4 三条断言） |
| 端到端怎么复核？ | `pnpm build` 后重载插件，在 armed 需求上提交产物且不点弹框 → 观察停手；点确认 → 无需额外输入即续跑（本需求本轮**未执行**这条，已如实登记待补复核） | `docs/requirements/REQ-261002141430-a5ef/tests/test-evidence.md` 第 5 节 |

**两条可复用的教训**：

1. **拦截判据必须同步可得**：只要判据来源是异步落库的状态，就拦不住"同一拍"发起的动作。
   凡是"先投递、后记账"的地方，拦截都得读内存、记账才落库——两者分工要写进注释，否则后人会把它们合并。
2. **取基线不能 stash 整份文件**：`git stash -- <file>` 会把**别人未提交的改动**一起回退，
   于是"改前"跑出一批本来不存在的通过，得出假基线（本次实测踩到：3 条无关失败被误判成本次引入）。
   正确做法是**只把新逻辑临时置为空操作**，其余一字不动，再复跑比对失败名单差集。

来源：REQ-261002141430-a5ef（2026-10-02）。

## 机制备忘：窗口 chip 的「恢复并打开」契约

> **一句话**：已归档会话在侧栏不可见，看板上的「窗口 / 会话」chip 就是**唯一的回程入口**——
> 点它必须真的把人带回去：先取消归档恢复会话，再收面板打开它；恢复不了才说"为什么"。
> 来源：REQ-261002153446-c600（2026-10-02）。

### 一、动作顺序：可用性检查 → 恢复 → 收面板 → 打开

```
点 chip → uiWorkspace / layout 可用？
            ├─ 否 → 'unavailable'（零副作用：不改宿主归档状态）
            └─ 是 → 目标是已归档会话？
                      ├─ 否 → selectPanel(null) → openSession(sid) → 'opened'
                      └─ 是 → await workspaces.unarchiveSession(sid)
                                ├─ 成功 → selectPanel(null) → openSession(sid) → 'opened'
                                ├─ 抛错 → 'restore-failed'（**不** openSession）
                                └─ 无该能力（旧客户端）→ 'archived'
```

三条不变量（违反任一条都是"看起来跳了、其实没跳"）：

| 不变量 | 为什么 |
|---|---|
| 恢复**后于**可用性检查 | 打不开就不该改动宿主状态——否则留下"恢复了却没跳过去"的半成品 |
| 恢复失败**不打开**会话 | 归档会话在侧栏不可见，打开了也没意义；静默失败会让人以为跳转生效 |
| 恢复**只在这里**判定一次 | 渲染层只写 title（点击会发生什么），调用方只把结果翻成人话；三处各写一套判定必然漂移 |

### 二、五个结果态各说什么话

| 结果 | 含义 | 用户看到 |
|---|---|---|
| `opened` | 已收面板并打开（含"恢复后打开"） | 不打扰（已经跳过去了） |
| `archived` | 已归档 + 客户端**不具备**取消归档能力 | 「当前客户端不支持取消归档」——说清是能力问题，不是功能不存在 |
| `restore-failed` | 恢复动作抛错 | 「取消归档失败…未跳转」+ 去会话列表手动恢复的路径 |
| `missing` | 会话不在列表 | 「不在当前会话列表（可能已删除）」 |
| `unavailable` | 导航服务未注入 | 「会话导航服务暂不可用，请刷新页面后重试」 |

### 三、可复用的教训：别把"拒绝理由"当成用户价值

旧实现把已归档 chip 渲染成灰按钮 + 点击弹「已归档，无法跳转」——它**正确地说明了原因**，却把
"能不能回去"这件事留给了用户（而侧栏里根本没有那条会话）。能力（`unarchiveSession`，幂等、可逆）
明明就在，却没有替用户做完。

判据：**当一个动作只差一步可恢复的前置条件时，"告知用户做不到"不是交付，"替用户做完"才是**；
只有真的做完才谈得上失败提示，且提示必须带一条真的能走的路。

验证口径：`npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts`
（时间线 `unarchive → selectPanel → openSession` 顺序可证伪；恢复失败时时间线不含 `openSession`）。



## 机制备忘：计划落库的条款引用只有一处取数、一处门禁、一处写入（2026-10-02，REQ-261002164800-d8f2）

**这条备忘要回答的问题**：卡上的「接哪几条 FR」是怎么来的？——答案必须是**唯一一条**，否则同一条计划换个人点、换个入口点，落出来的卡就不一样。

### 一、三条不变量

| 不变量 | 唯一实现 | 说明 |
|---|---|---|
| 取数单点 | `src/application/internal/plan-refs.ts` 的 `refsForLanding` | 显式 `requirement_refs` 优先 → 计划文档「覆盖对照表」兜底 → 两处皆无给 `sources='none'` |
| 门禁单点 | `assertClauseCoverageGate`（FR 覆盖硬门） | **只有**「每个 FR 必须有落点」一道硬门；「某张卡没有 FR」一律降为警告（纯文档卡天然不接条款） |
| 写入单点 | 建卡时 `plan-landing.ts`；事后 `use-cases/AmendTaskRefs.ts` | 没有第三处；补写入口工具 `reqboard_task_refs` 与看板改卡路由共用同一用例 |

落库编排层是 `src/application/internal/approved-plan-landing.ts`（`landApprovedPlan`）——弹框批准与看板批准都调它，
入口只决定"要不要顺带推进状态"。

### 二、踩过的坑（都留了痕）

1. **字段声明错了地方**：`requirement_refs` 曾只声明在工具**返回体** schema 上，入参 `additionalProperties:false` 直接拒收，
   协议层 `normalizePlanTasks` 又按白名单丢弃——等于"这条通道从入口就是死的"。**教训：新增入参字段要同时改三处（入参 schema / 协议接口 / 归一化函数），少一处就是静默丢弃。**
2. **两处取数必然分叉**：批准路径读计划文档的覆盖表、手动 `reqboard_decompose` 不读 → 同一条计划落出的卡引用不同
   （实测 REQ-261002161439-277d：批准路径抛错 0 卡，手动路径 11 卡全空）。**教训：只要有两份取数实现，迟早不一致；抽单点比"两边都记得改"可靠。**
3. **卡级硬门伤及无辜**：把"每张卡都要有 FR"当拒绝条件，会让含纯文档卡的计划**整批落不了库**。
   **教训：门禁要问"需求条款有没有人接"，而不是"每张卡是不是都接了条款"。**
4. **读数不能拿投影对象算**：`generateRTMData` 曾收到 `LandedTaskRef[]`（无 `requirementRefs` 字段）当 `TaskRecord[]` 用，
   返回体 `covers_frs` 恒空——"落库成功"的读数因此不可信。**教训：返回体读数必须与磁盘同源。**

### 三、存量数据的补法（可回滚）

- 补一张卡：`reqboard_task_refs(task_id, requirement_refs, reason)`（全量替换；值同不写盘；写后同步 RTM + 留痕）。
- 批量补历史卡：`pnpm tsx scripts/backfill-task-refs.ts --dry-run` → `--apply` → `--check`；报告含 `before`，`--restore <报告>` 可还原。
- 纪律：只经 `TaskStore` 与 `DocsReader` 端口；**只补空引用、不覆写**；子卡随父卡；归档需求只报告不回填。

### 四、可复核入口

- 设计与契约：`docs/requirements/REQ-261002164800-d8f2/design/interfaces.md`、`design/data-model.md`
- 测试证据（含逐卡 `covers:` 对照）：`docs/requirements/REQ-261002164800-d8f2/tests/test-evidence.md`
- 收口与基线：`docs/requirements/REQ-261002164800-d8f2/notes/t8-baseline-evidence.md`
- 用例：`tests/reqboard/{requirement-refs,plan-refs,plan-landing-parity,board-plan-approve,task-refs-repair,backfill-task-refs,landing-failure-loud,legacy-refs-compat}.test.ts`

## 机制备忘：需求台账的分片数据层（REQ-261002161439-277d）

台账不再是一份单册 JSON，而是**分片目录** + **单一端口**。三条要记住的：

```
① 数据根 ~/.dsh/reqboard/：meta.json（全局 revision，O(1) 写）+ requirements/<REQ>/{record,comments,
   history,artifacts,plan,verification,archive}；archive/<REQ>/ 是冷存；~/.dsh/dsh-reqboard.json
   退化为**导出格式**（运行时不读写）。索引不落盘 —— 没有索引文件就没有"索引与分片不一致"。
② 读路径只经端口 RequirementStore（get / listSummaries / listComments / listHistory / head）；
   首屏 GET /state 只发**摘要**（计数代替本体），详情走 GET /requirements/:id，产物扫描走
   POST /artifacts/scan —— 扫描是写侧动作，绝不挂在读接口上。
③ 冷侧（archived/done）只读，唯一豁免是"归档收尾"（archive / artifacts 至少一个真的变化，
   见 domain/requirement/ColdWrite.ts）。
```

**为什么值得（实测）**：35 条需求（33 归档）时首屏需求载荷从 **2,768,960 字节降到 5,416 字节（511×）**，
且归档 33 → 200 时载荷不再增长；端口契约由**三个实现**（内存 / 分片 / 只读假 SQL）跑同一份断言，
证明端口不泄漏存储细节 ⇒ 将来的 DB 适配器可直接照此入场。

**迁移与退路**：`migrate-ledger-v10`（v9 单册 → v10 分片）、`rollback-ledger-v10`（反向）；
单册在场而分片目录缺席时**不再整条路由消失**（2026-10-03 修正，REQ-261003191948-e94a）：
宿主 `apply()` 改为**三相启动**——预检命中迁移门即注册一条只回 **503** 的降级路由并正常返回
（不抛，否则 fiber 失败会把路由与客户端半边一起带走），全端点回
`{success:false, code:'REQBOARD_REQUIRES_MIGRATION', error, hint}`，
其中 `hint` 是**代入真实路径**的可复制迁移命令；正常与全新安装两种情形逐字节不变。
客户端 `unwrap` 不再丢弃非 2xx 响应体，看板就地渲染原因与命令块——
**用户看到的从「HTTP 404」变成「为什么 + 怎么修」**。仍**绝不起空台账**：
降级态不建存储、不注册工具、不返回空册。

## 需求级回退通道（REQ-261003204149-1e80）

回退从「改一个状态字段」升级为**原子事务**：回退方向让开产物门与确认门、下游的确认章与计划批准
如实作废、旧卡取消并物化重做卡、断点与自动链按新阶段重算；工具侧与看板侧**共用一处编排**。
回程上五道人工门一道未动——退过不等于免检。机制、三条不变量与涉及文件见
[需求级回退通道](requirement-rollback.md)。

**回退物化的边界（2026-10-04，REQ-261004121649-bfa7 补）**：一次回退曾把 17 张卡炸成 **73 张**
且**没有撤销入口**（46 张垃圾 todo 挡在汇总前，需求永远进不了验收）。现在三条硬边界 +
一个仅人清场入口：**只物化顶层父卡**（子卡原地复位、保留身份）、**物化即终态**（`stages: []`）、
**幂等 + 上限 20（超限在落库前整次拒绝，队列零新增）**；误物化用
`POST /dashboard/api/reqboard/req/rollback-cleanup` 按物化清单一次清掉（不碰 done 卡、可幂等重跑、
回执给 `canceled`/`restoredLinks` 两个可核对数字）。**改动这条通道前请先读
[需求级回退通道](requirement-rollback.md) 的「物化的边界」一节。**

## 机制备忘：弹框问项与输出 schema 的三方同源（嵌套键漂移的防线）

> 一句话：给弹框**加一问**，答案映射、单测、**工具输出 schema** 三处必须同步——
> 漏 schema 的代价是每份回执被绑定层 `additionalProperties:false` 整个拒收（值算出来了、
> 副作用发生了，调用方只拿到一条 invalid output）。

| 问题 | 结论 | 判据 |
|---|---|---|
| 嵌套键（如 `answers.workspace`）漂移为什么能存活？ | 静态契约扫描只比**顶层** return 键；单测断言取值但不过 schema——两层都照不到嵌套对象 | 2026-10-03 实测：第五问上线后 capture 每份回执报 `answers.workspace is not a declared property` |
| 嵌套层的防线放哪？ | 键清单收敛**一处共享常量**（如 `CAPTURE_ANSWER_KEYS`）：类型 `Record<键>` 派生（tsc 守）+ schema 由常量生成（不再手写）+ 契约用例键集断言（运行时守），三方同源 | `npx vitest run tests/capture-output-contract.test.ts` |
| 怎么证明防线有效？ | 双向反向演练：摘声明 → 用例红且点名；摘常量一键 → tsc TS2353 两处 + 用例红 | `docs/requirements/REQ-261003204143-3219/tests/test-evidence.md` §3/§4 |
| 回执校验用谁家的校验器？ | 直接用 dsh-tools 导出的 `validateJsonSchemaValue`（绑定层同一个），不另写"差不多"的检查 | 同上 §1 |

来源：REQ-261003204143-3219（reqboard_capture 弹框答案契约修复）。

## 机制备忘：外部安装一致性判别（界面上「控件静默消失」时先判归属）

> 一句话：用户说「某个控件点一下就没了」时，**先别怀疑本仓插件**——很可能是宿主客户端
> **自己装得不一致**（同一个 `app.asar` 里的两个包版本对不上），而本仓插件根本不注册那个席位。
> 2026-10-04 实例：编辑器模型选择器点开即空白——`ui-model-selection` 要用 `primitives.MenuGroup`，
> 同包内的 `ui-primitives` 却是缺该导出的旧构建 → React `#130` → DSH 插槽把席位**退役**（渲染成空白，不报错）。

### 三步判别法

| 步 | 做什么 | 判据 / 命令 |
|---|---|---|
| ① 看席位 | 查该席位的占用者与是否退役 | `cordis_inspect_query(client / Slots / listSubTree, {root:"<席位键>"})`：`occupants[].registrant` 指认归属；单条目席位 `active:false` = **已退役（崩过）** |
| ② 取原文 | 复现一次，取崩溃原文与堆栈 | 控制台 `slot entry crashed in '<席位>': <error>`（DSH `SlotErrorBoundary` 打的）；React `#130` = 元素类型为 `undefined` |
| ③ 对标安装 | 安装版与 npm 发布版逐符号对照，并查本地补丁痕迹 | `node docs/requirements/REQ-261004095621-c167/evidence/extract-asar.mjs --local <本机 checkout 同名文件的构建产物>`：① 使用方要、安装版没有 = 缺符号；② 发布版同版本有 = 安装自相矛盾；③ **官方两版都没有、安装版却有的符号 = 被本地构建覆盖**（`--local` 另做逐字节对照） |

### 本仓注册面清单（判「这是不是我们的席位」用）

| 席位键 | 占用者 id | 用途 |
|---|---|---|
| `conversation.session.header.utilities` | `dsh-pmboard:progress` | 会话头部需求进度流程图 |
| `tool.call.toolview` | `reqboard_task_move` / `reqboard_submit` / `reqboard_ask_confirm` / `reqboard_status` / `reqboard_capture` 等 9 键 | 业务工具定制卡片 |
| `main`（keyed） | `dsh-pmboard` | 看板页（REQ-261004174324-4195 起：知识库页已删除，知识层改为插件自动生成，不再有 UI 入口） |
| `sidebar.panellist` | `dsh-pmboard` | 侧栏入口（单条） |

> **编辑器工具栏（`conversation.input.*`）不在本仓注册面内**——那里的控件消失与本仓无关。

### 红线

**不要**把本仓注册项塞进宿主自带的席位来「修好外观」：那是遮蔽真因、把责任搬到本仓，且不随版本存活。
正确处置 = ① 出证据报告 ② 用户侧重装/更新客户端 ③ 用替代通路顶住（本例：`/model` 命令换模型）。

**关联**：完整案例与命令 → `docs/requirements/REQ-261004095621-c167/evidence/dsh-model-seat-crash.md`；
知识层判别法 → `docs/knowledge/entries/kb-0022.md`。

| 日期 | 变更 | 来源 |
|---|---|---|
| 2026-10-03 | 新增机制备忘「弹框问项与输出 schema 的三方同源」：嵌套键漂移无防线的事故复盘 + `CAPTURE_ANSWER_KEYS` 共享常量模式（tsc/生成式/键集断言三处守）+ 双向反向演练判据 | REQ-261003204143-3219（capture 弹框答案契约修复） |
| 2026-10-04 | 新增机制备忘「外部安装一致性判别」：席位退役机制 + 三步判别法 + 本仓注册面清单 + 不顶替宿主席位的红线（案例：模型选择器点开即消失，根因是安装包内 primitives 缺 `MenuGroup`） | REQ-261004095621-c167（DSH 席位崩溃取证） |
| 2026-10-04 | 《自动链契约》§5 三条已知缺口摘牌：N-1 wake 活性校验（叫不动转 paused 不刷 lastWakeAt）、N-2 绑定改写唯一留痕入口 applyRebind + 看板「改绑到本窗口」+ 静态断言、N-3 催办按 kind 聚合 + GROUP_CONFIRM_KINDS 成组确认 + 回执落章清单；另落地推进锁续租（30s 心跳+runId 守卫，防双跑）与批内写集分组真并行（未声明写集保守串行 ≡ 旧行为），死代码清偿三文件（StartSubtaskChain/background-runner/batch-scheduler） | REQ-261003222428-3556（实施链可靠性硬化） |
| 2026-10-04 | 新增 L2 领域篇《深链与面板导航》并挂进本手册索引：面板时代的旧 URL（`/dashboard#pmboard?req=…`）必 404 的机理（无 SPA 兜底 / 桌面协议白名单转发 / 片段不进请求）、兼容入口 + 片段消费 + 定位通道三段链路、为什么选 200 中转页而非 302、可见性门闩与「未消费回落」，以及「改 src ≠ 改现场（重建 + 重载插件）」的验证纪律；`board_link` 契约保持一字不改、仅同步工具文案 | REQ-261004111917-f473（看板/需求详情深链 404 修复） |

## 机制备忘：工作流的三项可配开关（模型路由 / 遥测与零产出告警 / 优先级与在制上限）

> 一句话：把「跑得省、看得见、排得清」做成**配置**——不配置时行为逐字等于改造前，
> 配置写错在**装配期就响**（不出现"配了但不生效"）。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 能不能按阶段换模型省钱？ | 能：`stageRouting` 键 = `<StageKind>` 或 `<StageKind>@<difficulty>`（专家档可单独走强模型），值 = `{provider?, model?}`；未命中**不注入**，生成脚本与改造前逐字节相同 | `npx vitest run tests/stage-model-routing.test.ts` |
| 哪一段费时间、哪一段白跑？ | 每次子卡执行记 `outputCount/zeroOutput`，`reqboard_status` 回执给 `stage_telemetry`（按子卡阶段聚合时长/产出/零产出）；**无数据整体省略键** | `npx vitest run tests/stage-telemetry.test.ts` |
| 连着白跑会被提醒吗？ | 会：同一需求同一阶段连续零产出达 `zeroOutputAlertThreshold`（默认 2）→ 台账一条 `[零产出告警]`；去重可推导（`floor(streak/threshold)`），**不自动改模板**；老记录（无产出计数）即断，未知≠零产出 | `npx vitest run tests/zero-output-alert.test.ts` |
| 多需求并行谁先跑、跑几条？ | `scanAndResume` 按 `priority` 降序（同值 createdAt 升序）；`maxInFlightRequirements`（默认 0 = 不限）以**新鲜推进锁**为在制判据，超限不投递并如实点名谁在跑 | `npx vitest run tests/requirement-priority.test.ts` |
| 「不配置等于没改过」有证据吗？ | 有：四条等价面 + 一条"不回填历史遥测"的诚实边界集中成一份清单 | `npx vitest run tests/config-defaults-parity.test.ts` |

来源：REQ-261004110201-f253（PM 工作流业务设计）。

| 日期 | 变更 | 来源 |
|---|---|---|
| 2026-10-04 | 新增机制备忘「工作流的三项可配开关」：阶段模型路由（`stageRouting` 两级命中，未配置不注入）、阶段遥测（`outputCount/zeroOutput` + status 回执 `stage_telemetry`）、零产出告警（阈值去重、未知即断、不改模板）、优先级与在制上限（`priority` + `maxInFlightRequirements`，在制=新鲜锁）；配套「未配置即现状」集中等价面用例 | REQ-261004110201-f253（PM 工作流业务设计） |

## 机制备忘：席位模型与开窗（一条需求可以多个窗口一起干）

> 一句话：把「一条需求 = 一个独占窗口」换成「一条需求 = 一个 owner + 若干席位」；
> 另一个窗口想帮忙，不用再另立一条需求把活劈成两半。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 一条需求能有几个窗口参与？ | 一个 **owner**（唯一）+ 若干席位（默认上限 8，`seatsMax` 可配）；席位三种角色：owner / worker / observer | `npx vitest run tests/bind-seat.test.ts` |
| 谁说了算？ | 推阶段与把关人工门**只归 owner**；领卡、汇报、提交产物 owner 与 worker 都可；observer 只能看。**绑定 ≠ 可写**：observer 也看得见这条需求，但写不动 | `npx vitest run tests/seat-authorization.test.ts` |
| 怎么把另一个窗口叫进来？ | 先 `reqboard_open_window`（用 DSH 现成的会话分支造一个新窗口；**不会替你开并列窗口**，请到侧栏打开），再 `reqboard_bind({role:'worker'})` 派席。只有 owner 能派席，owner 的位子只能换绑 | `npx vitest run tests/open-window-tool.test.ts tests/bind-tool.test.ts` |
| 存量需求要批量迁移吗？ | **不要**：`seats` 缺省时读端折算成单 owner（`joinedAt` 取 `createdAt`），一个字节都不改写；删掉折算即回到改造前 | `npx vitest run tests/legacy-compat.test.ts tests/seat-fold.test.ts` |
| 席位落盘会不会丢？ | 不会：席位只能经 `mutate` 落座（`create` 的字段表不含 `seats`，类型层就拦住），且**永远不写出空席位表**——那样这条需求对所有人不可见也不可写 | `npx vitest run tests/seat-real-store.test.ts` |
| 「谁是这条需求的窗口」还看 `sourceSessionId` 吗？ | 不再当权限用：它是 owner 的锚点。绑定读并取两条来源（我立的 + 席位派给我的），角色由 `canWrite` 判 | `grep -rn "bound\[0\]" src/` 零命中 |

来源：REQ-261003215944-9e04（DSH 会话分支驱动的 agent 自主立项与多窗口绑定）。

## 机制备忘：Dive 状态转化单一入口（改 dive 状态只有一条路）

> 一句话：以前有 8 处各写各的 `draft.dive = ...`，现在只有一个纯函数定规则、一个入口落盘；
> 想改规则只改一处，想回退只回退一处。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 规则写在哪？ | 域层纯函数 `transitionDive(prev, {event, now, actor})`（`src/domain/dive/transition.ts`）：八个事件 → 写入表的**唯一实现**，零 I/O、不看时钟 | `npx vitest run tests/dive-transition.test.ts` |
| 谁负责落盘？ | `applyDiveTransition`（`src/application/dive/applyDiveTransition.ts`）：全仓唯一写口，在 `mutateIfPresent` 回调内**重算**（不信任读到的旧值）；弹框在途时拒写并返回可辨的 code | `npx vitest run tests/dive-apply-transition.test.ts` |
| 全仓还有几处直写？ | **没收敛到零（如实记）**：规则已单点（八事件纯函数），但仍有 **8 个文件 9 处**自行落盘——迁移、终态对账、回退通道、驱动暂停、token 收尾、终态 disarm、`ClearPause`。它们都用同一个纯函数算，只是没走 `applyDiveTransition`；是否继续收口**待裁定**（收口要新增事件 = 改契约，得回计划重新批） | `grep -rn "\.dive = " src/ \| wc -l`（当前 9） |
| 推进弹框与看板「继续」是同一条路吗？ | 是：两条入口都触发 `confirm-advance` 同一个事件 | `npx vitest run tests/dive-confirm-advance.test.ts tests/dive-convergence.test.ts` |
| 有没有不许动的红线？ | 有：`confirm-advance` **不动 `activation`**——只有人能改变"是否自动推进"的意图 | 同上（反向断言：确认推进不得把 disarmed 变 armed） |

来源：REQ-261003215944-9e04（FR-9 / FR-10）。

## 机制备忘：token 读数别把「结论」和「明细」绑在一起（2026-10-04，REQ-261004143941-b2ca）

> 一句话：档位降级该裁的是**明细密度**，不是**结论**。会话头部流程图原先两者一起裁，
> 窄窗口下「这条需求烧了多少」一个数字都不剩（用户实测：「token 统计不展示了」）。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 窄窗口为什么看不到 token？ | `FLOW_TIERS.token = 1000` 的 `@container` 规则把 `.dsh-pm-flow-token` 整批 `display:none`；容器 976（视口 1024）就进 B 档、token 全没。**不是接口没数据** | `./node_modules/.bin/tsx scripts/header-progress-probe.mts`（改造前 B/C/D 档 `tokens=0+0`） |
| 现在怎么保证窄窗口也有数？ | 计数旁常显**需求累计 Token**（`.dsh-pm-cprog-token-total`），它渲染在 `.dsh-pm-flow` **之外** → 档位规则够不着；D 档只收 `🪙` 图标 | 同上（各档 `tokens=<节点级>+1`，A 档 `2+1`） |
| 累计数用哪个口径？ | `assembleRequirementToken(req, {tasks}).totals` 的四桶之和（与节点同源）。**不要用记录上的 `tokenUsage.totals`**——它只在**离开阶段**时写入，还在跑的阶段不在里面 | 实测 `REQ-261004121649-bfa7`：记录总计 12,650,950 vs 正确 25,321,586（差额=进行中的 implementing）；脚本 `docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts` |
| 「没有」与「是 0」怎么区分？ | **缺失 ≠ 0**：无快照时宿主**不发** `requirement.tokenTotal`，前端不渲染徽章（不显示「🪙 0」） | `tests/session-progress.test.ts` TC-3b + `tests/header-progress-responsive.test.ts` TC-2b/2c |
| 子代理的消耗算进去了吗？ | **没有**（已知边界，专项需求另立）：快照读执行窗口自己的会话投影，DSH 的 `tokenUsage` 也是会话级；子代理是独立 session（`origin:"subagent"`，父会话只收到无 usage 字段的 `subagent-settled` 文本） | 本工作区 88 会话中 33 个为子代理会话；样例窗口自身 141.1M + 14 个子代理 85.3M |
| 为什么改完 dist 后接口还是旧形状？ | 宿主把插件 `dist/index.mjs` **常驻内存**，重建不换已加载模块——要么重载/重启 DSH，要么在进程内用真数据探针取证（本需求走后者） | `curl .../session/<sid>/progress` 重建后仍无该字段 |

**顺带踩到的一个坑（值得记住）**：设计文档 `design/test-cases.md` **不会**进 `rtm-design.yml` 的
`fr_to_design` 覆盖映射——RTM 生成器按测试文档把它排除了（`vendor/reqboard/src/rtm/context.ts` 的
`TEST_DOC_NAMES` 过滤）。所以「回归/测试」类条款（FR-4）必须在**设计正文文档**里也有一节带 `serves: FR-4`，
否则 `reqboard_submit(kind=design)` 会被覆盖度门禁拒（实测：75% < 100%）。

来源：REQ-261004143941-b2ca（会话右上角流程图 token 统计不展示：定位与修复）。

## 机制备忘：密集展示的三条纪律——旧账、等式、主次（2026-10-04，REQ-261004151652-d535）

> 一句话：会话头部那张流程图挤过三回。三回都不是「再加点东西」，而是**把已有的东西放对位置**：
> 阈值要按**当前**尺寸重算（旧账会伪装成物理限制）、相邻信息的显隐要用**一条等式**锁在一起、
> 排版一换**字号主次**就得跟着重审。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 「7 个节点带数字要 790px，窄窗口塞不下」是真的吗？ | **不是——那是旧账**。790px 出自圆点 22→14px、节点最小宽 58→32px **之前**；实测横排 358px、上下两行 **214px**（芯片 463 → 320px）。容器 > 476px 就放得下，阈值保守取 600 | `./node_modules/.bin/tsx docs/requirements/REQ-261004151652-d535/evidence/shot-specimen.mts` + 探针 DIAG |
| 怎么保证「有名字就有数」不靠巧合？ | 让 `FLOW_TIERS.token === FLOW_TIERS.label`（1000 → 600）——名字全隐的档位**恰好**是节点数全隐的档位，于是规则变成结构性事实 | 单测 TC-2g（等式 + 三段阈值与常量逐一相等）；探针 720 档应为 `1 名 + 1 数` |
| 累计总数什么时候出现？ | **只在明细全隐时**（容器 ≤600px）。明细可见时各节点相加就是总数，再挂一个是重复 | 探针三条断言码：`TOKENS_HIDDEN_BESIDE_LABELS` / `TOTAL_MISSING` / `TOTAL_DUPLICATED` |
| 上下两行后字体怎么定？ | **名字与数字同号（8px）**，数字**次要灰**、名字保留状态色；计数与徽章 9px。第一版数字 10px 正文黑比名字还大还深 ⇒ 用户判「字体太大、颜色不对」 | `evidence/font-after-fix.png`；对照候选 `font-A/B/C/D.png` |
| CSS 分片顺序有坑吗？ | **有**。拼接顺序 BASE → BOARD → TOKEN，**同特异性时后被追加者胜**：写在 TOKEN_CSS 里的默认 `display:none` 会压住 BOARD_CSS 里的显示规则（实测探针报 `TOTAL_MISSING`）。修法：显示规则带 `.dsh-pm-cprog-inline` 前缀提高特异性 | `tests/header-progress-responsive.test.ts` TC-2f 断言该前缀，去掉即红 |
| 探针的档位模型该有几档？ | **两档**（明细档 C>600 / 紧凑档 C≤600），与 CSS 的两段 `@container` 一一对应。四档（A/B/C/D）是旧阈值的产物，改判据时要跟着收 | `scripts/header-progress-probe.mts` 的 `TIERS` 表与三条断言码 |

**可复用的教训**：
① **旧账伪装成限制**——「放不下」要在当前尺寸上重新量一次，再决定裁谁；
② **相邻信息的显隐用等式锁**，别让两条独立规则碰巧对上（等式要有单测守着）；
③ **排版换向 = 视觉权重重排**，字号/颜色主次必须跟着重审（横排合格的数字，竖排就成了主角）。

来源：REQ-261004151652-d535（流程图每节点 token 在窄窗口也要看得到）。

## 机制备忘：开新窗口续作的三件事与三条不变量（2026-10-04，REQ-261004150249-731e）

> 一句话：把需求交给新窗口**不是「开个窗」那么简单**——落点、交接、投递三件事各自会单独失败，
> 而三处失败在用户眼里长得**一模一样**：「新窗口绑定不上/干不了活」。
> 领域篇：[开新窗口续作](continuation-handoff.md)

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 新会话为什么会落在 `/Users/mac/.dsh/profiles/desktop`？ | `create` 没传落点，DSH 回落到 `defaultCwd = 宿主 process.cwd()`。修法：优先源会话所属 **workspace**（DSH 连带 `attachSession`，侧栏直接归该项目）→ 其次源会话 **cwd** → 都拿不到**响亮失败且不建会话** | `tests/open-window-project-root.test.ts`（6 条） |
| 「绑定改了却干不了活」是什么鬼？ | **两套口径**：授权读 `seats`（席位权威），会话标题栏流程图锚点读 `sourceSessionId`。看板改绑只改后者 ⇒ 回执 `rebound:true` 是**假成功**。修法：一次 mutate 同时改（INV-2），并把回执判据落在「席位里谁是 owner」 | `tests/handoff-owner.test.ts` 的「假成功防线」（改造前该断言必红） |
| owner 转交能拆成两步吗？ | **不能**。半步 = 两个 owner，或没人可拍板。失败必须整条不动（席位/绑定/评论/updatedAt 四处都不变） | 「半截交接防线」（写入点全在构造之后，注入异常即验） |
| 什么时候该分叉？ | 水位三档 `0.75/0.85/0.90`（可配，非法装配期抛错）+ **阶段边界优先** + `critical` 兜底不等边界；读数缺席一律 `unknown`——**不猜、不补 0、不自动交接**；只有顶墙两档允许 agent 自主 | `tests/handoff-policy.test.ts`（23 条，含四种缺席） |
| 底稿投不出去，是没实现吗？ | **不是**：`AgentDeliverer` 早已实现 `CrossWindowDeliveryPort`（含冷会话 resume），只是组合根 `useCaseDeps.crossWindowDeliver` 从未赋值 ⇒ 表现为「能力不可用」。**FR-4 落地就是一行装配** | `src/index.ts` 的 `crossWindowDeliver`；探针 `scripts/handoff-probe.mts` 打印 `delivery` |

**可复用的教训**：
① **两套口径必然互相说谎**——要么写死不变量，要么删掉一套，别指望两处各自维护还一致；
② **回执可能假成功**——只改一半时接口照样返回成功，判据要落在"人真正在意的那一处"；
③ **「没实现」与「没装配」长得一样**——排查"某能力不好使"时先读组合根，再决定要不要新写适配器。

**已知边界**（本次刻意不做）：并行分叉（多 worker 分卡）、让流程图路由认席位、`reqboard_kb` 的根解析修复（同根因类，另立项）。

来源：REQ-261004150249-731e（开新会话绑定原项目、owner 交接与接续投递）。

## 机制备忘：token 读数的血缘口径——「这个窗口」还是「这摊活」（2026-10-04，REQ-261004154937-2ca3）

> 一句话：pmboard 原来只数**执行窗口自己那个会话**，而子代理跑在**独立会话**里——
> 用子代理越多的活，数字越被系统性低估。实测某真实窗口：报 141.1M，实际 **226.4M**（漏计 **37.7%**）。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 子代理的消耗到哪去了？ | 父会话**收不到**：子代理是独立 session（`origin:"subagent"`、`delegationDepth≥1`、`parentSession`），父会话只收到一条**纯文本** `subagent-settled` 通知（无 usage 字段）；DSH 的 `tokenUsage` 投影本身也是会话级 | `~/.dsh/sessions/<ws>/<id>/session.v4.jsonl.zstd` 首行可核 |
| 那怎么把它们数进来？ | pmboard 侧自己聚合：`sessionPersistence.list()` 枚举 header（**零日志读**）→ `parentSession` 传递闭包 → 逐成员取数（`sessionProjectionCache.cachedSnapshot` **同步**、缓存命中零读）→ 求和 | 唯一实现：`src/domain/token/lineage.ts` + `src/adapters/SessionProbeAdapter.ts` |
| 谁是「后代」？ | `parentSession` 链上 **且**（`delegationDepth ≥ 1` **或** `origin === 'subagent'`）。**fork 出来的分支窗口不算**（它有 parentSession 但 depth 0、无 origin）——判据取或、且要有单测锁 | `tests/lineage-delta.test.ts` TC-1d |
| 两次快照之间新起了子代理怎么算？ | **全额计入本次**（它诞生于两次快照之间，全部消耗都发生在这一段）；**消失的成员记 0**（不记负值，否则会把总数拉低）；**水位不可比的成员不参与**并标降级 | `deltaSnapshots` 五态规则 + TC-2a~h |
| 为什么不用「总数相减」一把梭？ | `Σ_M2 − Σ_M1 = Σ_交集(t2−t1) + Σ_新 t2 − Σ_消失 t1`——最后一项会把总数**拉低**，逐桶截断又会抹成 0（静默失真）。逐成员算，每一项都能指着规则解释 | 同上 |
| 取数为什么是「异步枚举 + 同步读数」？ | `list()` 返回 Promise，而快照链是**同步的**（30 处调用点）。故集合后台刷新、用量同步读——不把 await 引进调用链 | `SessionProbeAdapter` 的 `lineageCache` + `refreshDescendants` |
| 取不到怎么办？ | **缺失 ≠ 0**：未命中的成员进 `degradedMembers`、不进合计，并按预算（默认 8）异步冷读预热写回缓存；服务缺失则退回只算自身并标 `descendants-unavailable` | `tests/session-probe-lineage.test.ts` |
| 口径改了，闸门呢？ | **预算闸不动**（仍按 `cacheRead` 累计、不含子代理）——展示口径 ⊃ 闸门口径，这条差异写在 Token tab 文案里；改闸门要另立项并重新标定阈值 | `tests/chain-budget.test.ts` 一条未改仍全绿 |

**可复用的三条**：
① **「一个数」背后往往有一个隐含主语**（这里的主语是「这个会话」）——口径变更先把主语写进文档，再改代码；
② **血缘要靠一条可测的判据**（depth 或 origin 取或），不要靠「像子代理就算」；
③ **集合在变时，差值规则必须逐项可解释**，「总数相减」这种看似等价的做法会静默失真。

来源：REQ-261004154937-2ca3（token 统计纳入子代理消耗：跨会话聚合口径）。

## 机制备忘：需求详情页「工作汇报」的取数与缺口判据（2026-10-05，REQ-261004222448-292a）

> 一句话：详情页从「按数据来源堆 Tab 的证据面」改成「按读者六个问题组织的工作汇报」——
> 常驻头部 + 六个同级 Tab，切到哪个才请求哪个。交付当天在验收现场逮到三起事故，
> 三起的根因都不是「功能没写」，而是**取数根 / 判据来源 / 渲染层**各踩了一个静默坑。
> 机制全文见领域篇 [需求详情页「工作汇报」](requirement-detail-report.md)。

| 想知道什么 | 结论 | 判据 |
|---|---|---|
| 端点为什么把 317 份文档全判「文件缺失」、任务计数为 0？ | **宿主 `process.cwd()` 是插件宿主目录，不是用户工作区**。端点必须按会话解析读根：`resolveDocRoot(deps, session)` → 据此建文档仓储与**只读**队列读端（不碰写路径）。既有 `/stage/:stage` 至今仍是 cwd 口径（开工前既有问题） | `src/http/routers/shared.ts` 的 `resolveDocRoot`；重启宿主后 `curl` 真端点才暴露（本机单测全绿） |
| 首屏为什么谎报「15 条 FR 没人接」（真值 15/15 全 done）？ | `clauseReceiveStatus` 原先**只取 `collectTaskRefs`**（读 `decomposition.md` 的 RTM 表），而写绑定的 `reqboard_task_refs` **只写台账卡片字段**——两个来源不一致，投影只信了空的那个。修法：`collectReceiveRefs = 文档表 ∪ 台账卡`，三个调用点统一 | 新增 `ledgerTaskRefs` / `mergeTaskRefs`（`src/application/internal/content-trace.ts`）；`tests/receive-mark.test.ts` 三例（台账有文档空 / 文档有台账空 / 两边都有取并集） |
| 页面上的 Markdown 标记（`**粗**`、行内 code、列表）在哪剥？ | **只能在渲染层**：抽取契约要求摘要必须是**原文子串**（用例断言 `arch.includes(summary[0])`），服务端**一个字都不许改**。故转换在 `mdInline`——**先转义再替换**，只剥标记不改字，只出内联级元素 | `src/client/render/md-inline.ts`；无标记时输出与 `esc(text)` 逐字节相同 |
| 操作条为什么不能在每个按钮后挂一段解释？ | **按钮只写标签，后果进 `title` 与确认框正文**。同理：截断必须给出路（`title` 全文或去对应落点），同类信息同一口径；头部评论列表只渲染 human/agent，机器事件归「对话」Tab | 「排版散架」验收反馈后的重做；`src/client/views/report-head.ts` |
| 怎么防「首屏又被顶出屏幕」这类版式回退？ | 用**真实 CSS + headless Chrome** 的几何硬判据，不用字符串断言：Tab 栏 top ≤ 713、评论列表 ≤ 260px、操作条 ≤ 72px 且按钮同一行、状态带三格 ≤ 220px、无内层滚动容器（合法例外 `.dsh-pm-detail` / `[data-dag-wrap]` / `.dsh-pm-dag-canvas-wrap`）。退出码 0/1/2 | `npx tsx scripts/req-report-probe.mts`；反向验证：人为加一处 `overflow:auto; max-height` → 退出码 1 |

**可复用的三条**：
① **取数要问「这是谁的根」**——任何按相对路径读文件的端点，先确认它解的是**会话/项目**的根，而不是进程的 cwd；
② **两个真相来源之间必须显式合并**——判据要写明它认哪个来源、以及两边不一致时怎么办，否则投影会安静地给出与事实相反的红；
③ **「诚实」可以做成类型约束**——读不到给独立形状（`available:false` + 四种 reason），比前端靠文案纪律兜底可靠；渲染层做显示转换、数据层保原文，是同一枚硬币的两面。

来源：REQ-261004222448-292a（需求详情页「测评证据面」信息设计与 UI 优化：六端点 + 六 Tab 工作汇报）。
事故复盘在 `docs/requirements/REQ-261004222448-292a/evidence/verification-summary.md` §四-14/§四-15。
