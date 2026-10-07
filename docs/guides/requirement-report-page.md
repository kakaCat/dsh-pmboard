# 需求详情页「工作汇报」· 使用与维护指南

> 面向**下一个要动这个页面的人**。机制与架构先读领域篇：[需求详情页「工作汇报」（L2）](../architecture/requirement-detail-report.md)。
> 本页只回答三件事：**想改哪一块该动哪个文件**、**改完必须跑什么**、**哪些地方一碰就红**。

## 一、想改哪一块 → 动哪个文件

| 想改的东西 | 动这里 |
|---|---|
| 结论头（id / 状态 / 席位 / 窗口跳转 / 评论列表） | `src/client/views/report-head.ts` |
| 状态带三格（做到哪 / 缺口 / 结果与成效） | `src/client/views/report-band.ts` |
| Tab 栏、懒加载、缓存键、分段替换、面板包装器 | `src/client/views/report-tabs.ts` |
| 📋 汇报面板（七条 + 来源标 + 缺节 + 亮点反应付） | `src/client/views/panels/trunk.ts` |
| 📄 文档面板（确定文档 + 非交付物分组 + 核验表 + 门禁留痕） | `src/client/views/panels/docs.ts` |
| 🕸 DAG 面板（画布复用 + 每步执行结果表） | `src/client/views/panels/dag.ts` |
| 💬 对话面板（一条流 + 系统消息 + 回复框 + 检索高亮） | `src/client/views/panels/dialogue.ts` |
| 🪙 Token 面板（按阶段 + 每次调用均 / 缓存命中 + 优化点） | `src/client/views/panels/token.ts` |
| 🧱 提示词面板（系统提示词 / 注入留痕 / 上下文三段） | `src/client/views/panels/prompts.ts` |
| 样式（作用域 `[data-report-shell]`、窄档收口、浅色岛） | **按组件分片**：`src/client/styles/report/*.ts` 与 `panels/*.ts`；出口 `report.ts`；谁住哪见 §八 |
| 正文里的 Markdown 标记怎么显示 | `src/client/render/md-inline.ts` |
| 视图状态机、详情挂载 / 卸载、确认框文案 | `src/client/board-mount.ts` |
| 取数函数（前端 fetch 层） | `src/client/api.ts` |

## 二、服务端：取数与端点装配

| 层 | 文件 |
|---|---|
| 六查询（+Token 扩展） | `src/application/query/QueryReport.ts` · `QueryTrunk.ts` · `QueryDocs.ts` · `QueryDag.ts` · `QueryDialogue.ts` · `QueryPrompts.ts`；Token 扩展在 `QueryToken.ts`（它包着既有汇总 `QueryRequirementToken.ts`，**不改后者**） |
| 端点形状 / 分页校验 / 降级（一处实现） | `src/http/routers/panels.ts` |
| 路由注册（含别名 `…/report/trunk` 归一） | `src/http/routes.ts` |
| 读根解析（按会话） | `src/http/routers/shared.ts` 的 `resolveDocRoot(deps, session)` |
| 缺口判据的合并实现 | `src/application/internal/content-trace.ts` 的 `ledgerTaskRefs` / `mergeTaskRefs` / `collectReceiveRefs` |
| 契约类型（`PanelResult` / `Degrade` / 响应形状） | `src/shared/protocol.ts` |

**改服务端时记住**：新增读取必须**双后端都实现**（json 分片 + sqlite，同一端口、共享用例）；
一致性有回归 `tests/report-backend-parity.test.ts`。

## 三、改完必须跑（原样给出）

```bash
# ① 四道交付门
pnpm build
pnpm build:client          # 期望看到 [verify-client] OK
npx tsc --noEmit -p tsconfig.json
pnpm kb:build && pnpm kb:check

# ② 渲染硬判据（真实 CSS + headless Chrome 出图断言）
npx tsx scripts/req-report-probe.mts      # 期望 4/4 PASS，退出码 0
```

探针退出码：`0` 全过 / `1` 有断言失败 / `2` 环境不可用（无 Chrome 等）。
**反向验证**（确认探针不是恒绿装饰）：临时给面板容器加 `overflow:auto; max-height:200px`，应当退出码 1 并指名元素。

相关回归（改动后至少跑这些）：

```bash
npx vitest run tests/report-shell.test.ts tests/report-degrade.test.ts tests/report-content.test.ts \
  tests/report-template.test.ts tests/report-routes.test.ts tests/query-trunk.test.ts \
  tests/receive-mark.test.ts tests/report-backend-parity.test.ts
```

**注意**：`pnpm build` 只更新磁盘产物。宿主插件进程在**启动时**加载 `dist/`——真机验证必须**重载插件宿主**，
否则会得出「改了没生效」的错误结论（见 [项目说明书](../architecture/project-manual.md) 的机制备忘「改了 src 并 build 过 ≠ 线上生效」）。

## 四、五条不许破的纪律

| # | 纪律 | 为什么 |
|---|---|---|
| 1 | **`data-*` 是面板契约，不许动** | 壳、面板、用例、探针都按 `data-report-shell` / `data-report-seg` / `data-report-tabs` / `data-panel="<key>"` / `data-dag-tab` / `data-msg-text-raw` 等取值；改名 = 静默失联 |
| 2 | **不加 `overflow: auto\|scroll`，也不加限高** | 内层滚动是探针的硬判据（真 DOM 实测）；长出由页面滚动或外层 `<details>` 承担 |
| 3 | **正文不许在服务端改写** | 抽取契约要求摘要必须是**原文子串**（有用例断言）；Markdown 标记只在渲染层 `md-inline.ts` 剥 |
| 4 | **同类信息同一口径** | 同一种文本走同一套渲染 / 同一种计数走同一个来源，否则两个面板会给出互相矛盾的数字 |
| 5 | **样式作用域 `[data-report-shell]`** | 详情页样式必须挂在这个前缀下，免得漏进看板 / 其他面板；客户端构建会校验「样式归属章在场」 |

## 五、三个「一改就红」的钉子

| 钉子 | 位置 | 何时会咬人 |
|---|---|---|
| `TRUNK_SECTION_ALIASES` | `src/application/query/QueryTrunk.ts`（`架构 → ['架构','目标与总体方案']`） | 文档模板改了二级标题名 → 抽取「实现思路」永远少一半，**不报错**。新增别名必须**同时补一条用例** |
| `isDeliverableDocPath` 的白名单 `DELIVERABLE_DOC_PATTERNS` | `src/application/query/QueryDocs.ts` | 白名单只管**需求目录内**的 8 类路径；新增一类交付物要**显式加一行**（认不出的一律不算交付物，落进 `discovered` 分组计数）。改这里要同时跑 `QueryReport` 的 `tabCounts.docs` 口径 |
| 探针阈值常量 | `scripts/req-report-probe.mts`：`TABS_TOP_MAX = 713`、`COMMENT_LIST_MAX_H = 260`、`ACTION_BAR_MAX_H = 72`、`BAND_CELL_MAX_H = 220` | 头部加一行内容就可能把 Tab 栏顶出首屏。改头部顺序 / 评论条数 / 状态带内容后，**先跑探针**再谈别的 |

## 六、真机冒烟（单测全绿 ≠ 上线可用）

```bash
curl -s "http://127.0.0.1:<port>/dashboard/api/reqboard/requirements/<REQ>/report" | head -c 400
curl -s "http://127.0.0.1:<port>/dashboard/api/reqboard/requirements/<REQ>/report/trunk" | head -c 400   # 别名也要通
```

看三件事：`available` 不是 false、`documents` 不是全 `file-missing`、任务计数不是 0。
这三处曾同时踩中「宿主 cwd ≠ 用户工作区」的坑（见领域篇 §会话根解析）。

## 七、外观层：想改「长相」该动哪、改完跑什么（2026-10-05，REQ-261005155003-f32f）

**一句话口径**：详情页是**浅色岛**——`src/client/styles/report.ts` 的 `--pm-*` 全部是页面自持的浅色原值，
**不引宿主主题变量**（引了就会得到"白底浅字"）。岛内没有 `[data-ds-dark-theme]` 覆盖块，
宿主两套主题下同一副长相。

| 想改的东西 | 动这里 |
|---|---|
| 色板 / 字阶 / 间距 / 圆角 / 发丝线 / 阴影 | `src/client/styles/report.ts` 的令牌块（**只改值，不要在规则里写裸值**） |
| **卡片外观**（卡底色 / 描边宽度 / 内边距 / 卡间距）——含头部 / 状态带三格 / Tab 栏三张壳卡 | 同上，片尾 **「㉑ 卡片语汇」** 一层（2026-10-07 起唯一改外观的地方；板块与壳卡的旧平铺 / 灰底规则只留出处注释） |
| 焦点环（宽度 / 两档偏移 / halo） | 同上，`--pm-focus-*` 令牌 + 第 ⑫ 节规则 |
| 动效时长 / 缓动 / reduced-motion | 同上，`--pm-dur-*` / `--pm-ease` + 媒体查询分支 |
| 图标（Tab 六个 + 缺口严重度圆点） | `src/client/icons.ts`（**唯一图标源**，纯字符串常量，不装图标库） |
| 目标尺寸下限 | `--pm-target: 24px`（改它一处，全页命中区跟着走） |
| 状态的非颜色标记（✓/▸、!!/!/·） | `src/client/views/stage-detail.ts`（阶段点）+ `src/client/views/report-band.ts`（缺口条） |

**改完必须跑（四条，都要求退出码 0）**：

```
npx tsx scripts/req-report-probe.mts              # A1～A13：首屏/滚动/版式 + 可访问性与视觉层级
npx tsx scripts/req-detail-ui-contrast.mts        # 对比度全表（真文字/非文本/组合背景/反白/豁免）
npx tsx scripts/req-detail-ui-prototype-shot.mts  # 权威原型出图 + 漂移核对 + 几何回填
npx tsx scripts/req-detail-ui-grayscale-shot.mts  # 灰度评审图（人眼判读，非门禁）
```

**一碰就红的地方（都是判据，不是建议）**：

- 真文字 < 4.5:1、有意义的非文本 < 3:1 —— 对比度脚本会点名色值与背景。
- 出现**阶梯外字号**（不是 11/12/13/15/20/24）或**阶梯外前景色**（不在色板里）——探针 A9/A12 + 出图脚本。
- 三级色 `#86868b` 被用来承载**看得见的真文字**——它只许非文本。
- 任一可点/可聚焦目标 < 24×24（**含其它样式分片里的控件**：DAG 工具栏按钮就曾在详情页内只有 45×21.5，
  修法是本片加 `[data-report-shell]` 前缀的覆盖，**不改别的分片**）。
- 把状态标记写成 CSS `::before`——伪元素对读屏不可靠，必须是真实文本或 `aria-hidden` 的 SVG。
- 首屏预算：`tabsTop > 713`、状态带单格 > 220px、操作条整块 > 72px（给壳卡加描边 / 内边距都会长高，注意余量）。
- 卡底色必须**白**（= 原型 `--card`）：改回灰底就与原型不符；要"更强分组"走页底（原型 `--bg: #F8FAFC`）而不是卡底。
- **`white-space: nowrap` 的长文本元素必须同时给 `contain: inline-size`**（2026-10-07「详情页面不适配」）：
  nowrap 文本的 min-content = 整行宽，`min-width: 0` 削不掉它；它会把报告壳的 min-content 顶到 1280+，
  壳被自己的 `max-width` 截住不再收缩，宿主 `overflow: hidden` 就把右侧**静默裁掉**（无滚动条）。
  已按此处理的四处：`.dsh-pm-comment-body--clip` / `.dsh-pm-bubble--long` / `.dsh-pm-tabs[data-report-tabs]` /
  ≤760px 窄档的表格。**别在长文本上省这一条**——它是"页面能不能适配窄窗"的开关。
- 窄档宽度自查（改布局后跑）：`1400/1280/1152/1024/960/900/820/768/700/640/600/560` 逐档看
  `documentElement.scrollWidth == clientWidth` 且**报告壳宽 = min(视口, 1280)**；探针 A2 现在就是这条硬判据。
- 用 `?v=current` 当"改前对照"——它不是改前；改前看 `evidence/ui-before-*.png`。

**改原型的正确姿势**：权威原型 `prototypes/detail-ui-v3.html` 内联的是**当前 `buildReportShell` 输出 + 真实 13 片 CSS**
（防漂移）。改了渲染或样式之后，**不要手改原型**——跑一次出图脚本，它会重新内联、重出图并回填 `proto-geometry`。
脚本会拒绝"原型被手改过"（除五类已声明偏差外任何差异都响亮失败）。

> ⚠️ **判据现状（2026-10-07）**：面板板块的外观基准已换成
> `../requirements/REQ-261006130057-7a43/prototypes/detail.html` v1.5（`.blk` / `.t-mod` / `.stat`
> 的卡片语汇，见领域篇「卡片语汇」一节）。f32f 的 `detail-ui-v3.html` 内联 CSS **早于本次改动
> 就已不再与当前分片逐字节同源**（`npx tsx scripts/req-detail-design-conformance.mts` 退出码 1，
> 差异在"原型画的是旧样式"这一条上），该脚本的"实现 == v2 设计契约"判据待随 7a43 的视觉基准重定；
> 在此之前它**不是**本页的可用门禁，别拿它当"改对了"的证据。

## 八、外观归属与零变更门禁（2026-10-07 · REQ-261007133149-0716）

**一句话口径**：**一个组件的外观只住在它自己的分片里**。改外观 = 打开那一个文件，不用再通读 2389 行；
「改了没生效 / 改到了别处 / 悄悄改了长相」由两条门禁当场点名，不靠人眼。

### 谁住哪（唯一真相：`src/client/styles/report/manifest.ts`）

| 想改的东西 | 动这个分片 |
|---|---|
| 常驻头部（标识行 / 标题行 / 闸门条 / 结论行 / 下一步 / 阶段条 / 最近评论） | `styles/report/head.ts` |
| 状态带三格 | `styles/report/band.ts` |
| 进度带 + Tab 栏 | `styles/report/tabs.ts` |
| 汇报 / 文档 / DAG / 对话 / 验收 / Token / 提示词 七个面板 | `styles/report/panels/<key>.ts` |
| 基底 / 令牌 / 公共件 / 跨组件的成组规则 | `styles/report/base.ts` · `tokens.ts` · `shared.ts`（**公共层只许写"每处都一样的口径"**） |

清单里每条还给 `prefixes`（这个组件拥有哪些类名——门禁按它判越界）与 `tailIn`（外观还散在别处；**十片皆空**）。

### 改外观跑什么（都要求退出码 0）

```bash
npx tsx scripts/report-style-snapshot.mts --check     # 判据一 · 外观零变更（28 条件 × 逐组件逐键全等）
npx tsx scripts/report-style-ownership.mts            # 判据二 · 分片归属（越界 0 处 / 公共层含组件取值 0 处）
npx tsx scripts/req-report-probe.mts                  # 硬判据：4/4 组合 + A13 六面板
```

退出码：`0` 全过 · `1` 有差异或越界（**点名到组件与属性**）· `2` 环境不可用（找不到 Chrome）。

### 红了怎么办

| 门禁 | 输出长什么样 | 是**有意的**改动 | 是**无意的**（漏改 / 改到别处） |
|---|---|---|---|
| 判据一 · 快照 | `trunk-1280-inflight · trunk · 代表节点 #5 h3.dsh-pm-trunk-title · color · rgb(29,29,31) → rgb(1,2,3)` | 跑一次 `--write` **显式更新基线**（diff 里就能看出「哪个组件哪条样式变了」），提交说明里写清为什么改 | 回滚那一处。**不许**用 `--write` 把差异盖掉——那等于把判据关掉 |
| 判据二 · 归属 | `shared.ts · .dsh-pm-… · 它属于 verify` | 组件外观搬回它的分片；跨 ≥2 组件的成组规则留公共层；公共件写进脚本里的**逐条带理由**白名单 | 同上；脚本会点名「它属于谁」，照着搬回去 |

先确认门禁真的会红（两条都自带反向验证，**故意违规必须红**）：

```bash
npx tsx scripts/report-style-snapshot.mts --self-test    # R-1：合成规则改一条组件规则 → 必红且点名
npx tsx scripts/report-style-ownership.mts --self-test   # R-2：组件选择器写进别人分片 → 必红且点名
```

### 六条纪律（改分片文本时）

| # | 纪律 | 为什么 |
|---|---|---|
| 1 | 组件专属规则只写在该组件的分片；跨 ≥2 组件的成组规则留 `shared.ts` | 判据二按这条判，越界即红 |
| 2 | 分片是**模板字面量**，且**结尾是一段悬挂的段落头注释**（由下一个分片收尾） | 追加内容要插在它**之前**；插到之后 = 整批规则落进注释里失效（肉眼看不见，判据一才红） |
| 3 | 公共层不许写只服务一个组件的取值 | 那是让公共层替某个组件背外观（判据二点名） |
| 4 | 新加的跨组件零件 → 进 `scripts/report-style-ownership.mts` 的 `PUBLIC_CLASSES`，**逐条带理由** | 宽泛豁免 = 把这条判据关掉 |
| 5 | 改外观**必须**更新快照基线（`--write`） | 基线是"当前外观的事实"；不更新基线 = 判据失效 |
| 6 | 搬动规则时**别改声明**；顺序变化交给判据一逐键验 | 顺序也是外观（级联的胜者会变） |

> **补特异性（极端情况）**：搬走的规则若在**同一元素**上输了「原来靠位置赢」的那一局，可以给它补一个
> 恒真的同义属性选择器（`[data-report-shell]` 再写一遍）。**补之前**先确认该元素上所有竞争规则的
> 特异性都 ≤ 原值（浏览器实测），补完必须跑判据一。本仓现有两处：head 的「长日志已收纳」标、
> token 的按节点表折叠条。

### R-1~R-5：五条反向验证（判据不许是恒绿装饰）

| # | 故意做的破坏 | 命令 | 必须看到 |
|---|---|---|---|
| R-1 | 改一条组件规则的值、不更新基线 | `report-style-snapshot.mts --self-test` | 退出码 0 且点名「组件 · 属性 · 基线值 → 现值」 |
| R-2 | 把 A 组件的选择器写进 B 组件分片 | `report-style-ownership.mts --self-test` | 退出码 0 且点名「它属于谁」 |
| R-3 | 面板少实现一个契约成员 | `pnpm typecheck`（用例里有一行 `@ts-expect-error` 钉住它） | **编译失败** |
| R-4 | 注册表里重复一个键 | `npx vitest run tests/report-contract.test.ts` | 用例红（键唯一） |
| R-5 | 交换注册表两项顺序 | 同上 | 用例红（顺序即展示顺序） |

## 关联

- 机制与架构：[需求详情页「工作汇报」（L2 领域篇）](../architecture/requirement-detail-report.md)
- 手册索引：[项目说明书](../architecture/project-manual.md)
- 交付证据与三起事故复盘：`../requirements/REQ-261004222448-292a/evidence/verification-summary.md`
