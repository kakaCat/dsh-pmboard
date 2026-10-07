# 需求详情页「工作汇报」（L2 领域篇）

> **TL;DR**：详情页从「按数据来源堆 Tab 的证据面」改成「按读者六个问题组织的工作汇报」——
> **常驻头部**（结论头 / 操作条 / 状态带）+ **六个同级 Tab**（汇报 · 文档 · DAG · 对话 · Token · 提示词），
> **切到哪个才请求哪个**；台账一变只换该换的两块（壳 + 当前面板），滚动位置与展开态不归零。
> 三条最要紧的机制：**① 六个 Tab 各一条只读端点，读不到就返回 `available:false`，不拿 0 冒充未知**；
> **② 六个端点一律按会话解析工作区根**（宿主 `process.cwd()` 是插件宿主目录，不是用户工作区）；
> **③ 缺口判据必须合并「拆分文档 RTM 表 ∪ 台账卡片绑定」两个来源**——只信一个会安静地谎报。

## 它是什么（形态与取数分层）

| 层 | 取什么 | 请求数 | 时机 |
|---|---|---|---|
| L0 常驻头部 | 结论头 + 操作条 + 状态带（做到哪 / 缺口 / 结果与成效） | **1**（`report`） | 进详情 |
| 默认 Tab | 汇报七条（抽取值） | 紧随 +1（`trunk`） | 头部之后 |
| L1 其余 Tab | 文档 / DAG / 对话 / Token / 提示词 | **0 直到切到它** | 点 Tab |
| L2 明细 | 文档正文 / 提示词正文 / 验收证据 | 点开才取 | 点开 |

- 壳体三段：头部（`src/client/views/report-head.ts`）、状态带（`report-band.ts`）、Tab 容器（`report-tabs.ts`）；
  六个面板各自一个文件，都在 `src/client/views/panels/*.ts`（`trunk / docs / dag / dialogue / token / prompts`）。
- **内存缓存键 `reqId::tab::revision`**（`report-tabs.ts`）：同一修订内切回不重复请求。
- **台账 revision 变更只失效并重取当前 Tab**；头部归壳负责。产物按 `<div data-report-seg="head|band|tabs|panel">` 分段替换——
  这是「滚动位置与展开态不归零」的实现方式（不再整页 `innerHTML` 重绘）。
- **未激活的 Tab 面板不在 DOM 里**（切走即卸载）。判据：产物里不出现未激活 key 的 `data-panel=`。

**事实来源**：2026-10-05 交付（REQ-261004222448-292a）；`evidence/verification-summary.md` §一/§二。

## 六条只读端点与契约

六条端点全 `GET`，挂在现有 `/dashboard/api/reqboard/` 下，形状/分页校验与降级**一处实现**
（`src/http/routers/panels.ts`，注册在 `src/http/routes.ts`）。

| 端点 | 落点 | 实现 |
|---|---|---|
| `/requirements/:id/report` | 常驻头部（首屏唯一请求） | `src/application/query/QueryReport.ts` |
| `/requirements/:id/trunk`（别名 `…/report/trunk`） | 📋 汇报 | `QueryTrunk.ts` |
| `/requirements/:id/docs` | 📄 文档 | `QueryDocs.ts` |
| `/requirements/:id/dag` | 🕸 DAG | `QueryDag.ts` |
| `/requirements/:id/dialogue` | 💬 对话 | `QueryDialogue.ts` |
| `/requirements/:id/prompts` | 🧱 提示词 | `QueryPrompts.ts` |
| `/requirements/:id/token`（既有端点**扩展**） | 🪙 Token | `QueryToken.ts` |

- **别名两条都通**：`…/report/trunk` 是 `design/interfaces.md` 承诺的两段路径，路由把它归一到 `trunk`——
  同一处理器、同一份校验与降级，**响应逐字段相同**。上线冒烟时它曾 404（用例照着实现路径写断言，没照文档承诺写）。
- **降级信封**：`PanelResult<T> = (T & { available?: true }) | Degrade`，`Degrade = { available:false; reason; note }`，
  `reason ∈ port-unavailable | file-missing | ledger-unreadable | no-snapshot`（`src/shared/protocol.ts`）。
- **纪律**：读不到就说读不到，**不拿 0 冒充未知**。同一句话也适用反向：没有验收单时不给 `outcome`（不是「通过 0 项」）。

## 会话根解析（踩过的坑）

**宿主进程的 `process.cwd()` 是插件宿主目录，不是用户工作区。** 端点若不按会话解析工作区根：

| 症状 | 机理 |
|---|---|
| `/docs` 把 **317 份登记文档**全判 `file-missing` | 文档仓储建在宿主 cwd 上，相对路径全部落空 |
| `/trunk` 把七条主干全判「文档未提供该节」 | 同上（读不到需求文档） |
| 任务计数 / DAG 全为 **0**（`queue.json` 明明有 84 张卡） | 队列读端也建在宿主 cwd 上 |

**口径**：`resolveDocRoot(deps, session)`（`src/http/routers/shared.ts`）→ 按会话解析读根，再据此建文档仓储
与**只读**队列读端（不碰写路径）。前端七个取数函数都要带上会话 id。

**边界**：既有 `/stage/:stage` 端点**至今仍是 cwd 口径**（返回 0 张卡）——那是开工前既有的部署问题，
不在本需求边界内。

**教训**：本机单测全绿 ≠ 上线可用；这四处是**重启宿主后打真端点**才暴露的。

## 缺口判据必须合并两个来源（最重要的一条认知）

**有据可查的事故**：首屏曾报「缺口 16 条」，其中 15 条是「条款 FR-1~FR-15 没人接」——**不是真的**。
真值 **15/15 全部已接收且完成**（18 张父卡的 `requirementRefs` 完整覆盖，承接卡全部结单带证据）。
修复后缺口由 16 条降为 **1 条**（仅 `verification.md` 产物待确认，那条是真的）。

| 项 | 内容 |
|---|---|
| 根因 | `clauseReceiveStatus` 的输入原先**只取 `collectTaskRefs`**（读 `decomposition.md` 的 RTM 表）；而写绑定的 `reqboard_task_refs` **只写台账卡片字段**。本需求 `decomposition.md` 里一个 FR 引用都没有 → `taskRefs=[]` → 15 条全判 `unreceived` |
| 修法 | `collectReceiveRefs = 文档表 ∪ 台账卡`：新增 `ledgerTaskRefs` / `mergeTaskRefs`（`src/application/internal/content-trace.ts`），实现即 `mergeTaskRefs(await collectTaskRefs(docs, req), ledgerTaskRefs(tasks))` |
| 三个调用点 | `QueryReport.ts` / `QueryRequirementMarks.ts` / `QueryState.ts` 统一走它 |
| 口径 | **判红 = 既没有卡承接、也没有裁剪记录**；不是「拆分文档那张表里没写」 |
| 回归 | `tests/receive-mark.test.ts` 三例：台账有文档表空（事故现场）、文档表有台账空（原口径不许退化）、两边都有取并集 |

**可复用的教训**：判据要写明**认哪个来源**、以及**两个来源不一致时怎么办**；
否则投影会安静地给出与事实相反的红。

## 渲染纪律：剥标记在渲染层，服务端一字不改

- 页面铺的是**文档 / 台账原文**（需求文档节选、汇报摘要、验收单条目、对话消息）。抽取契约要求
  **摘要必须是原文子串**（用例断言 `arch.includes(summary[0])`）→ **服务端字符串一字不改**。
- 显示转换只发生在 DOM 之前的最后一跳：`src/client/render/md-inline.ts`——
  `mdInline(text)` **先转义再替换**（`**x**`→`<b>`、行内 code、行首列表 / 引文 / 表格行 / 标题）；
  `mdInlineEscaped` 接已转义的串（对话检索高亮的 `<mark>` 已插入），自己不再转义；`mdPlain` 给 `title` 用。
- 三条纪律：先转义再替换；只剥标记 / 只换标签、**不改字**；只出内联级元素（`<span>`，不产 `<div>`——
  块级元素塞进 `<p>` 会被浏览器提前闭合）。
- **`data-*` 是面板契约，不许动**：六个面板根容器各带自己的 `data-panel="<key>"`，
  还有 `data-report-shell` / `data-report-seg` / `data-report-tabs` / `data-dag-tab` / `data-msg-text-raw` 等；
  断言（含探针）都建立在这些标记上。

## 硬判据（探针）

`scripts/req-report-probe.mts`：用**真实 CSS + headless Chrome**出图并断言（不是字符串断言）。
四组合（两档宽度 × 两种状态）全过才算过。

| 判据 | 阈值 | 说明 |
|---|---|---|
| Tab 栏 top | **≤ 713** | headless 800 档实测视口高 713（`--window-size` 含约 87px 外框），比设计的 800 更严 |
| 评论列表整块高 | **≤ 260px** | 限条数 + 截断之后仍要装得下 |
| 操作条整块高 | **≤ 72px** 且动作按钮 `offsetTop` 只有一个取值 | 仅 1280 档；「排版散架」缺陷的硬判据 |
| 状态带三格各自高 | **≤ 220px** | 半句截断缺陷的硬判据 |
| 四问落点在首屏 | 结论头 / 操作条 / 状态带 | 首屏判定集 |
| 无横向溢出 | — | — |
| 无内层滚动容器 | 计算样式 `overflow-y\|overflow-x ∈ {auto, scroll}` 即算 | **真 DOM 实测**；合法例外 `.dsh-pm-detail` / `[data-dag-wrap]` / `.dsh-pm-dag-canvas-wrap`（`overflow:hidden` 不算） |
| 未激活面板不在 DOM | — | — |
| 操作条不重叠 | — | — |

**退出码**：`0` 全过 / `1` 有断言失败（并指名具体元素与几何）/ `2` 环境不可用（无 Chrome 等）。

**反向验证**（防「恒绿装饰」）：人为给面板容器加 `overflow:auto; max-height:200px` → 退出码 1；还原 → 0。

## 交互与内容纪律

| 纪律 | 做法 |
|---|---|
| 动作按钮只写标签 | **后果进 `title` 与确认框正文**；按钮后挂一段解释是错的（缺陷修复时删掉了那些解释段） |
| 头部评论列表只渲染 human / agent | 机器事件归「对话」Tab 的 system 消息 |
| 截断必须给出路 | `title` 给全文，或指向对应落点（不能截了就算） |
| 同类信息同一口径 | 评论文本用同一套渲染（`mdInline`），不再一处原文一处剥标记 |

## 契约的加法式扩展（不破坏旧调用方）

全部**向后兼容**：旧客户端读不到新字段就不渲染，旧服务端不返回新字段时页面走既有空态（**绝不显示 0**）。

| 扩项 | 位置 | 为何加 |
|---|---|---|
| `ReportHead.commentsTotal?` | `src/shared/protocol.ts` | 头部评论只渲染前几条，**限条数必须同时报总数** |
| `DocsResponse.discovered?` | 同上 | `documents` 只装「确定文档」（人写的交付物，8 类路径白名单）；自动扫到的**非交付物**按类型分组给计数 + 样例，避免 317 行把 Tab 变成倾倒场 |
| `PromptInjectionRecord.origin` 增 `'system-prompt'` | 同上 | 设计只列了三处写入点，实施发现「每轮系统提示词装配」也写留痕（第四处）；不撒谎就加法式扩枚举 |
| `PanelQueryDeps` 的 `docs?` / `now?` / `isolations?` / `systemPrompt?` / `pendingConfirms?` | 同上 | 六查询共用端口，按需注入 |
| `tabCounts` 的 `docs` / `dag` / `token` | 同上 | 只填**便宜拿得到**的角标；`token` 没数据就不给（不写 `'0'`） |

## 四条交付门（改这一块必须全过）

| 门 | 命令 | 通过信号 |
|---|---|---|
| 发版前构建 | `pnpm build` | exit 0，`dist/index.mjs` 与 `lib/client.js` 均更新 |
| 客户端重建 | `pnpm build:client` | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| 知识层自检 | `pnpm kb:build && pnpm kb:check` | exit 0（生成物零漂移 + 自检） |

渲染硬判据与外观层判据另外单独跑（**都要求退出码 0**）：

| 脚本 | 判什么 |
|---|---|
| `npx tsx scripts/req-report-probe.mts` | A1～A6（首屏四问 / 无横向溢出 / 无内层滚动 / 未激活面板缺席 / 操作条不重叠 / 版式与状态带高度）+ **A7～A13**（焦点环 / 目标尺寸与间距 / 字号档位 / reduced-motion / 非颜色标记 / H1～H5 与 D-8 几何 / 五块面板补测） |
| `npx tsx scripts/req-detail-ui-contrast.mts` | 对比度全表：真文字（含**反白**与**组合背景**）、有意义的非文本、豁免逐条登记、浅色岛口径（宿主令牌 0 引用） |
| `npx tsx scripts/req-detail-ui-prototype-shot.mts` | 权威原型出图 + 四段漂移核对（抹平五类已声明偏差后逐字节相同）+ 逐节点断言 + 浅色岛 sha256 + 几何回填 |
| `npx tsx scripts/report-style-snapshot.mts --check` | **判据一 · 外观零变更**：逐组件「计算样式 + 几何」快照与基线逐键全等（28 个采样条件，差异点名到 组件 · 选择器 · 属性 · 基线值 → 现值） |
| `npx tsx scripts/report-style-ownership.mts` | **判据二 · 分片归属**：组件专属规则只住在自己的分片（组件越界 0 处 / 公共层含具体组件取值 0 处），外加清单完整性与 10 个 DOM 根实检 |

灰度评审（人眼判读，非门禁）：`npx tsx scripts/req-detail-ui-grayscale-shot.mts`。

## 样式分片与外观归属（2026-10-07 · REQ-261007133149-0716）

**一句话口径**：详情页的外观按**组件**分片——一个组件的外观只住在它自己的分片里；
「谁拥有哪块界面、改它该动哪、不必读什么」写在**一份机器清单**里，两条门禁按它判。

### 13 个分片（唯一真相：`src/client/styles/report/manifest.ts`）

| 组件 | DOM 根 | 外观分片 |
|---|---|---|
| head 常驻头部 | `[data-report-seg="head"]` | `styles/report/head.ts` |
| band 状态带三格 | `[data-report-seg="band"]` | `styles/report/band.ts` |
| tabs 进度带 + Tab 栏 | `[data-report-seg="tabs"]` | `styles/report/tabs.ts` |
| trunk 汇报 | `.dsh-pm-trunk` | `styles/report/panels/trunk.ts` |
| docs 文档 | `[data-panel="docs"]` | `styles/report/panels/docs.ts` |
| dag DAG | `[data-panel="dag"]` | `styles/report/panels/dag.ts` |
| dialogue 对话 | `[data-panel="dialogue"]` | `styles/report/panels/dialogue.ts` |
| verify 验收 | `[data-panel="verify"]` | `styles/report/panels/verify.ts` |
| token Token | `[data-panel="token"]` | `styles/report/panels/token.ts` |
| prompts 提示词 | `[data-panel="prompts"]` | `styles/report/panels/prompts.ts` |
| 公共层（不成组件） | — | `base.ts`（⓪基底）/ `tokens.ts`（①令牌）/ `shared.ts`（⑤公共件 + 跨 ≥2 组件的成组规则） |
| 出口 | — | `styles/report.ts`：`REPORT_CSS` 按**固定顺序**拼（名字与用法不变） |

清单每条给 `id / label / root / shard / prefixes / serves / dependsOn / tailIn`：
`prefixes` 是「这个组件拥有哪些类名」（门禁按它判越界），`tailIn` 是「外观还散在别处」的清单——
**十片皆空**（`[]`），片尾覆盖层已按组件归位。

**拼接顺序**（`report.ts`）：⓪base ①tokens ⑤公共件 ②head ③band ④tabs ⑥trunk ⑦docs ⑪b verify
⑧dialogue ⑨token ⑩prompts ⑪dag，最后是 `shared.ts` 的公共收口层（⑫–⑱ / ⑰ / ㉑ 等）。

**拼接约定（改分片文本时必须知道）**：每个分片是一段模板字面量，且它的**结尾是一段悬挂的段落头注释**
（`/* ═══…`），由**下一个分片**的开头收尾。所以往分片末尾追加内容要插在那段注释**之前**——
插到之后 = 整批规则落进注释里失效（肉眼看不出来，判据一会红）。

### 两条门禁（判据先行，`--self-test` 保证它们不是恒绿装饰）

| 门禁 | 判什么 | 正向 | 反向（`--self-test`） |
|---|---|---|---|
| `report-style-snapshot.mts` | **外观零变更**：逐组件计算样式 + 几何，与基线逐键比对 | `--check` 退出码 0；报告逐组件给「键数 / 不同键数」，全 0 | 在标本页里塞一条合成规则改一个属性 → **必红且点名**「组件 · 属性 · 基线值 → 现值」；塞一条匹配不到的规则 → 不许红 |
| `report-style-ownership.mts` | **分片归属**：组件专属规则只住自己的分片；公共层只写宽选择器与跨 ≥2 组件的成组规则；清单完整性（真实渲染的类名要么被某个前缀认领、要么在逐条带理由的白名单里）；10 个 DOM 根实检 | 退出码 0，输出「组件越界 0 处 / 公共层含具体组件取值 0 处」 | 注入两条内存规则：组件选择器写进别人分片、组件规则写进公共层 → **必红且点名归属**；本组件写本组件 → 不许红 |

**改动归位后的处置**：判据一红了先问「是不是我要的」——是就在提交说明里写清并 `--write` 更新基线
（基线是"当前外观的事实"）；不是就回滚那一处，**不许**用 `--write` 把差异盖掉。
判据二红了基本没有"有意"这一说：组件外观搬回它的分片；跨组件成组规则留公共层；
公共件要写进脚本里的**逐条带理由**白名单。

### 归位做到了什么（可复核的读数）

- 从公共层片尾搬走 **198 条**只服务一个组件的规则（含新建 `panels/verify.ts`、把跨组件小标题组按组件拆开、
  把 `@media` 里只服务一个组件的那几条连外壳一起搬）；跨 ≥2 组件的成组规则**整组留公共层**。
- 判据二从「组件越界 7 处 / 公共层含具体组件取值 220 处」降到 **0 处 / 0 处**；
  判据一 28 个采样条件、10 个组件**逐键全等**（外观一点没动）。
- 两条规则补了一个恒真的同义属性选择器（`[data-report-shell]` 再写一遍）买回「原来靠位置赢」的那一局：
  head 的「长日志已收纳」标、token 的按节点表折叠条。**补之前**用浏览器实测过该元素上
  全部竞争规则的特异性 ≤ 原值（不是猜的）。
- 读面：改一个组件从「跨 6~9 处、含 2389 行」变成「它自己那一片」——片尾公共层从 1289 行降到约 590 行。

### 已知盲点（写在明处，别当它判到过）

- 判据二按**类名**判归属：看不见「岛级规则里为某一个组件定义的令牌族」
  （例：`--pm-tab-*` 原先住在公共层的岛级规则里，门禁判不到——归位时是顺手搬对、不是门禁逼出来的）。
- 判据一采的是**代表节点**（每个「标签名 + 类集合」首个节点）的那几个属性：
  没被代表的节点、或没进属性表的属性，它看不见。故判据一红了一定是真的变了，**绿了不等于"随便改都没事"**。
- 面板契约那一层（`Panel` / `ReportTabKey` / 端点名同源）与这两条门禁是**三层互不依赖**的判据：
  类型红（编译期）→ 归属红（静态扫描）→ 外观红（浏览器读数），任一层都能独立发现问题。

## 已知边界与未落地

| 项 | 状态与理由 |
|---|---|
| FR-10「再往上汇总」四项 | 墙钟 / 窗口数 / 轮次 / 零产出执行，**服务端未给**；面板按「响应里有才渲染」实现，**不伪造 0**。要真落地需服务端补字段 |
| Tab 角标只填三处 | `docs`（产物条数）/ `dag`（任务卡数）/ `token`（合计，K/M 一位小数）；`trunk` / `dialogue` / `prompts` **留空**——要额外读文档目录 / 会话事件 / 留痕，首屏只有一个请求，不为此加读；拿不到就不显示角标 |
| 窄档单栏未做 | 900×800 下强推单栏会把第三格（缺口清单）推到 top=760 > 视口 713，当场违反「900 档首屏仍答出缺口」；两口径冲突时取产品判据，**取舍写在 `src/client/styles/report.ts` 注释里** |
| DAG「谁做」列不缩写会话 id | `sessionId` 就是窗口码（本仓既有口径），照原样给、不改写（`src/client/views/panels/dag.ts`） |
| 对话超长消息 | 仍是**文本流**，未做折叠 / 摘要（正文按原文渲染，不截断） |
| 确认框正文仍在 `board-mount` | 「验收通过并归档 / 退回返工」的确认文案由 `src/client/board-mount.ts` 的 `verifyConfirmCopy()` 装配，未迁进新面板 |
| ~~在途态 Tab 栏落在首屏之外~~ **已解决（2026-10-05，REQ-261005155003-f32f）** | 旧口径下 Tab 栏只打印不判失败；现在它是**硬判据**（`tabsTop ≤ 713`）。外观层收口 + 操作条文案收敛 + 评论输入框真删之后，实测 497/527/437/441，最紧的一档还余 186px |

| 面板章节图标仍是 emoji | 文档/DAG/对话/Token/提示词五块里的**章节图标**仍用 emoji（`token-info.ts` / `node-panel.ts` / `stage-nodes-*.ts` / `dag-view.ts`）。它们不在 FR-1 点名范围内，且是**共享模块**（老详情页也在用）——按需求「边界」的「发现越界停下来升级」，本次未改，逐条登记在 `evidence/a13-panel-findings.txt`，待裁定 |
| 插件级令牌名有 8 个在 DSH 里不存在 | 全插件 11 个样式分片共 **426 处**引了不存在的主题令牌名（`--dsw-text-primary` 等）→ 其余页面的引脚面恒白。本次只把**详情页**钉成诚实的浅色岛，插件级接线作为后续需求（证据与映射表见 `requirement.md` 的「已知问题」K1） |

## 外观层：视觉语言与可访问性判据（2026-10-05，REQ-261005155003-f32f）

### 分段控件式的 Tab 栏（设计契约 v2 改造层 ⑦，2026-10-05 补落地）

Tab 栏**不是下划线页签**，是苹果**分段控件**：`#f5f5f7` 灰轨道（`inline-flex` + `gap: 2px` +
`padding: 2px` + `8px` 圆角）+ 选中项**白色滑块**（`--pm-surface`）+ `500` 字重 + **正文字色**；
没有下划线、没有描边、没有新颜色。轨道**是容器不是信息**，可识别性由标签文字承担。

⚠️ 这条曾经**整段没落地**（实现是下划线式），且判据照不出来——因为原型 v3 被"重新内联成实现的渲染"，
实现偏什么原型就跟着偏什么。教训与防复发判据见
[`prototypes/INDEX.md`](../requirements/REQ-261005155003-f32f/prototypes/INDEX.md) 与
`scripts/req-detail-design-conformance.mts`：**改这一页时必跑该脚本**（把契约层叠回实现逐元素比，
差异必须为空；同时断言原型内联 CSS 与当前分片逐字节同源）。

⚠️ 判据连带改准一处：`A12 H5`（主色文字类数）原先把"选中页签"当主色角色采样，而本设计明确选中页签取
**正文字色**——旧口径量的是"正文色 ≠ 主色"，恒红。现采真正承载主色的两处（`点开看原文` + `焦点环`），
并**新增正面断言**：选中页签不得等于主色、必须是白色滑块（比原来更严）。



这一节是**改外观时必须照的规则**。它不是审美偏好，每条都能指回
[ui-ux-pro-max](../../skills/ui-ux-pro-max/) 的可判定规则或 WCAG，并由脚本守着。

### 口径：详情页是**浅色岛**

`src/client/styles/report.ts` 的 `--pm-*` 全部取**浅色原值**，**不引宿主主题变量**：
页面底色本来就是白的，跟着宿主深色主题翻转前景色只会得到"白底浅字"。
岛内已**没有** `[data-ds-dark-theme]` 覆盖块——宿主两套主题下同一副长相。
（全插件级的令牌接线是另一件事，见「已知边界」。）

### 色板（逐值定死，全部按 WCAG 相对亮度公式核过）

| 用途 | 令牌 | 值 | 白底对比 |
|---|---|---|---|
| 正文 | `--pm-text` | `#1d1d1f` | 16.83:1 |
| 次要 / 元信息 | `--pm-text2` | `#6e6e73` | 5.07:1 |
| 三级（**只许非文本**：图标 / 装饰） | `--pm-text3` | `#86868b` | 3.62:1（非文本 3:1 达标；**承载真文字即违规**） |
| 唯一强调色（当字 / 当底 / 白字压它） | `--pm-accent` = `--pm-accent-text` | `#0071e3` | 4.70:1 |
| 危险 / 警告 / 成功 / 验收态 | `--pm-danger` / `--pm-warn-text` / `--pm-ok-text` / `--pm-teal-text` | `#d70015` / `#c93400` / `#1e7e34` / `#0e7c8f` | 5.38 / 5.28 / 5.14 / 4.89 |
| 发丝线 / 分组底 | `--pm-line` / `--pm-bg-soft` | `#0000001a` / `#f5f5f7` | 非文本，**豁免并逐条登记** |

**阈值不可商量**：真文字 ≥ 4.5:1、有意义的非文本 ≥ 3:1。
**主色只有一级**（早期草案的"面亮字深两级主色"已废）：面、字、白字压底都取同一个 `#0071e3`。
组合背景（文字压在同色浅底上）与反白（白字压主色底）**必须一起算**——
只算"深字压白底"正是主按钮与三档芯片漏判的原因（对比度脚本的 D 段就是为此而设）。

### 字阶 / 间距 / 字重

- 字阶**六档**：`11/15 · 12/16 · 13/20（正文）· 15/22 · 20/25 · 24/30`；**不许出现阶梯外字号**，
  真文字下限 11px（改前实测最小 9.5px 的三处芯片）。
- 间距回 4/8 栅格；**面板板块一律成卡**（见下「卡片语汇」）：卡间 `--s3`(12px)、卡内上下
  `--s2`(8px) / 左右 `--s3`(12px)、卡内标题↔正文 `--s2`(8px) —— 分组靠**卡边界 + 间距比 ≥3**。
  2026-10-07 前的「模块之间 36px」（`--pm-space-module`，间距闭集唯一具名例外）随之退役：
  令牌仍在（历史出处见 REQ-261005155003-f32f 的 C3），但报告壳内的板块已由卡片边界分组。
- 字重只留 **400 / 500 / 600**（消灭 650/660 与正文里的 700）。
- 层级靠"字号 + 字重"**双通道**拉开（模块标题 15/600 vs 正文 13/400），不靠再加颜色。

### 卡片语汇（2026-10-07 · 人反馈「原型都是卡片，实现的没有卡片、乱乱的」＋「卡片颜色原型改成了白色底」）

权威原型 v1.5 的 `.pm-card` / `.band-cell` / `.tabs` / `.blk` / `.t-mod` / `.stat` 是**全页所有卡片**的版式基准：

| 项 | 口径 |
|---|---|
| 卡的构成 | **白面**（`--pm-surface`，= 原型 `--card: #FFFFFF`）+ **1px** 描边（`--pm-line`）+ `--r1`(8px) 圆角 + 内边距 `--s2`/`--s3` |
| 卡底色 | **白**，与页底同色——卡与页的分别由**描边 + 圆角**承担，不由底色承担。2026-10-05「卡片要有背景 → 灰底卡（`--pm-bg-soft`）」的口径已由 2026-10-07 的人裁定取代（原型两边都是白卡） |
| 描边宽度 | `--pm-card-line: 1px`。**发丝线（`.5px`）只承担卡内分隔**（行 / 表头 / 折叠条）——白面 + 发丝在视觉上等于没有卡（`.dsh-pm-tok-stat` 原写 `var(--pm-hair)`，就是"写了 border 却看不出是卡"的根因） |
| 成卡的容器 | 壳体三张：头部（`.dsh-pm-detail-head`）、状态带三格（`.dsh-pm-stat[data-band-cell]`）、Tab 栏（`.dsh-pm-tabs`）；面板内：文档 / 验收板块（`.dsh-pm-block`）、提示词分节（`.dsh-pm-pp-sec`）、对话面板（`.dsh-pm-dialogue`）、验收空态（`.dsh-pm-verify-empty`）、汇报模块（`.dsh-pm-trunk-item`）、Token 汇总卡（`.dsh-pm-tok-stat`）、DAG 工具行+画布（`.dsh-pm-report-dag`） |
| 不在射程内 | **状态色**：缺口格红底（`.dsh-pm-stat[data-gap-focus]`）、闸门提示条琥珀底、状态胶囊的语义文字色——它们是"状态"不是"卡面" |
| 卡间距 | `.dsh-pm-block` 等相邻板块 `--s3`；flex gap 容器（提示词 / Token 面板）内**只由 gap 出一次**，卡不叠 margin |
| 落点 | `src/client/styles/report.ts` 片尾「㉑ 卡片语汇」一层（唯一改外观的地方；板块与壳卡的旧平铺/灰底规则只留出处注释） |

### 适配（窄档 / 视口收缩）· 2026-10-07「详情页面不适配」

**口径**：详情页是**流式**布局——壳宽 = `min(视口宽, 1280px)`（`max-width` 居中）；
≤1000px 状态带三格退单列、汇报网格退单列；Tab 栏窄档 `nowrap + overflow-x: auto`（横滚不换行）。

**铁律（本次事故换来的）**：**长文本元素一旦 `white-space: nowrap`，就必须同时把内在尺寸贡献清零**
（本页统一用 `contain: inline-size`）。

- 为什么：`nowrap` 的文本其 **min-content = 整行文本宽**（实测一条长日志 ≈6.2 万 px），而
  `min-width: 0` 只允许**收缩**、削不掉**min-content 贡献**。它一旦进入壳的 flex 链
  （评论行 → 头卡 → `.dsh-pm-detail`），壳的 min-content 就被顶到 1280 以上；壳被自己的
  `max-width: 1280px` 截住**不再收缩**，宿主 `.dsh-pm-view { overflow: hidden }` 把右侧
  **静默裁掉**——现场：900 视口下右侧 380px 不可见且**没有任何滚动条**（这正是"不适配"）。
- 为什么是 `contain` 而不是 `width: 0`：`contain: inline-size` 只把"内联尺寸由内容决定"这件事
  解耦（块级语境仍铺满父宽、flex 语境尺寸由 flex 分配）；`width: 0` 在块级语境会把它压成 0。

**本次修的四处 + 一处窄档保护**：

| 位置 | 症状 | 处置 |
|---|---|---|
| `.dsh-pm-comment-body--clip`（折叠长日志单行摘要） | min-content ≈6.2 万 px，单独就能把壳顶到 1280 | `contain: inline-size` |
| `.dsh-pm-bubble--long`（对话里的长日志气泡） | 同上（对话面板在 <1280 里整体不收缩） | `contain: inline-size` |
| `.dsh-pm-tabs[data-report-tabs]` | 7 枚页签 min-content 合计 ≈628px → 壳在 <700 视口停在 660 | `contain: inline-size`（栏身铺满、页签栏内横滚 = FR-4 窄档设计） |
| `.dsh-pm-vitem-opinion`（验收裁决意见框） | 基件（`styles/board.ts`）写死 `min-width: 260px` → 窄格里顶出卡片 123px | 本页去掉下限（`min-width: 0` + 铺满格），**不改 board.ts 那一片** |
| ≤760px 窄档（设计只定到 900，这是"再窄也不出横滚"的兜底） | 文档表 / 门禁表带固定 px 列宽 + 表头 nowrap → 640~700 撑出卡片 25~54px | 窄档媒体查询：表头可折行、列宽自适应（宽档一字不变） |

**实测**（自建逐档量测，七个面板 × 1400/1280/1152/1024/960/900/820/768/700/640/600/560）：
零页面级横向溢出、零壳内横向溢出、壳宽恒 = `min(视口, 1280)`（1400 档只跑 max-width 居中）。

**判据同步**：探针 `A2` 由"隐藏两个登记源看残余"**收紧为硬判据**（页面级横向溢出 > 1px 即红，
不再有"登记在案就放行"）；`A3` 不新增白名单——900 档 Tab 栏仍是 `sw == cw`（不进白名单），
<660px 的栏内横滚是 FR-4 明确的窄档行为。

### 折叠块（`<details>`）：合上必须藏，由本片自己钉

**口径**：报告壳里所有折叠块（对话长日志气泡 `.dsh-pm-long`、评论区 `.dsh-pm-comment-fold`、
提示词 `.dsh-pm-frag` / `.dsh-pm-prompt` / `.dsh-pm-fold` / `.dsh-pm-inj-body`、验收逐项
`.dsh-pm-rtm-detail`）**合上时非 `summary` 子节点一律 `display: none`**，这条由
`report.ts` 的 ⓪ 基底段显式写出（`details:not([open]) > :not(summary) { display: none }`），
**不依赖引擎的 UA 实现**。

- **为什么必须自己写**（2026-10-07 事故，人给图：「对话气泡的收纳行和全文同时显示」）：
  Chromium 131 起把"合上隐藏内容"从**不可覆盖的影子槽**改成了**一条可被作者样式覆盖的 UA 规则**
  （`details:not([open]) > :not(summary)` + `::details-content` 的 `content-visibility`）。
  同一份产物在开发机的 Chrome 154 上正常，在 DSH 桌面端的 Electron/Chromium 152 上**漏出全文**——
  跨引擎版本不可靠，而这条恰是"折叠有没有生效"的唯一开关。本仓已有同款先例：`[hidden]` 的隐藏
  也被显式钉过两次（理由一样：作者样式的 `display` 会盖掉 UA 的隐藏）。
- **判据**：`tests/dialogue-panel.test.ts` 断言这条规则在场；出图/探针脚本用**真 DOM 实测** ——
  七个面板共 36 个折叠块逐个核"合上 = 内容 `display: none`、打开 = 内容可见"（全绿）。
- **连带一条**：长日志气泡那一格的收纳行用了 `contain: inline-size`（适配窄窗的前提，见上一节），
  它把**max-content 也清零**了——所以消息行必须补 `.dsh-pm-cmsg:has(.dsh-pm-long) { width: 100% }`
  + 气泡栏 `flex: 1 1 auto`，否则整条收缩成"标记 + 展开"宽（实测 130px）。原型里长日志气泡是
  占满气泡栏的一行截断，宽度口径以本条为准。

### 可交互与可访问

- **焦点环**：`2px 实线 + 2px 偏移`，颜色取文字级主色；**面状控件内偏移 -2px、小控件外偏移 +2px**
  两档（照宿主配方）；另加苹果式 halo（装饰，不承担对比度）。
  `:focus-visible` 才出环——鼠标点击不留环。
- **目标尺寸**：详情页内全部可点/可聚焦目标 ≥ **24×24 CSS px**（WCAG 2.5.8 AA），
  相邻 ≥ 8px。例外只允许两类且必须逐条写明理由：同组相邻的 Tab（4px，Tab 本身 33px 高已达标）、
  WCAG 的正文内联链接。
- **动效**：时长走 `--pm-dur-*`（80/120/150ms）、缓动走 `--pm-ease` 单点；
  **只动颜色/边框/透明度/阴影**，不动几何；`prefers-reduced-motion: reduce` 下**直接给终态**（0s）。
- **不靠颜色单一表达**：阶段条三态带**真实文本** `✓ / ▸ / 无`；缺口严重度带
  `aria-hidden` 的内联 SVG 圆 **+ 真实文本** `!! / ! / ·`（**不许用 `::before`**——伪元素对读屏不可靠）；
  验收结论本身有可见文字。
- **结构位不许用 emoji**：Tab 栏六个图标与按钮的 affordance 图标一律内联 SVG
  （`src/client/icons.ts`，单一图标族、`currentColor`、尺寸只走 `--pm-icon` 14px / `--pm-icon-sm` 12px 两档）。
  状态符号（✅ / ⚠️ / ⏳ / 🔁 / ✓ / ▸）是 FR-8 要求的"第二判据"，**不算**结构图标。

### 视觉语言的收敛上限（同一标本 1280 在途）

胶囊 ≤5 · 前景色 ≤6 · 底色 ≤4 · 字重 ≤3 · 字号 ≤6 · 圆角 ≤2 · 边线色 ≤2；
另判"**无阶梯外字号、无阶梯外前景色**"。

> 两处**判据勘误**（判据与自己的色板/字阶相抵，2026-10-05 改准，与"字号 ≤5 → ≤6"同一先例）：
> ① 字号上限取 **≤6**（六档字阶）；② 前景色上限取 **≤6**——色板自身就列了六种"允许承载文字"的色，
> 且 FR-8 要求缺口严重度**颜色仍承载严重度**。归因见
> `../requirements/REQ-261005155003-f32f/evidence/a13-panel-findings.txt`。

### 原型与判据的分工

权威原型 `../requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`（`authoritative`）是
**同一份真壳 + 同一套真 CSS**渲染的静态页：与实现的差别只有五类**已声明偏差**
（图标 emoji→SVG、新增 ARIA 与稳定 id、FR-11 真删的两个节点、FR-13 真删的评论框、D-8 的窗口组位移），
出图脚本逐类抹平后逐字节比对。**改前对照一律用 `evidence/ui-before-*.png`（真实页面）**，
不许拿 `?v=current` 当改前。

## 关联

- 使用与维护指南（改哪一块动哪个文件、四道门怎么跑）：[需求详情页工作汇报 · 使用与维护](../guides/requirement-report-page.md)
- 手册索引与机制备忘：[项目说明书](project-manual.md)
- 交付证据（含三起验收现场事故的根因 / 处置 / 影响面 / 回归）：`../requirements/REQ-261004222448-292a/evidence/verification-summary.md`
- 接口设计原稿：`../requirements/REQ-261004222448-292a/design/interfaces.md`
