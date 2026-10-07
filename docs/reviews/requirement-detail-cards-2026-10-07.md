# 需求详情页 · 面板卡片化（2026-10-07）

> 结论：面板板块按权威原型 v1.5 的卡片语汇重排（一板一卡），卡片底色按原型改为**白底**。
> 四个门与七项收敛量测全过；出图对照 `docs/reviews/detail-cards-2026-10-07/`
> （`first-screen-before-after.png` + `tab-*-before-after.png`，各含 原型 / 改前 / 改后 三段）。

## 由来（人的反馈原文）

> 「7 个 tab 没问题，里面的样式不对，原型都是卡片，条理清晰，实现的没有卡片乱乱的」

后续裁决（同日）：

> 「1、卡片颜色原型改成了白色底了这个先修复」

## 根因

1. **面板板块的外观是 292a 时代的「平铺」层**：`report.ts` 里 `.dsh-pm-block { border: 0;
   background: none; padding: 0 }`、`.dsh-pm-trunk-item { border: 0; background: none }`
   —— 板块直接铺在白面上，只靠发丝线与 36px 留白分组。
2. 而 **7a43 的权威原型 v1.5 是卡片版**：`.blk`（文档/验收/提示词/对话）、`.t-mod`（汇报模块）、
   `.stat`（Token 汇总卡），一律白面 + 1px 描边 + 8px 圆角 + 8/14 内边距。
3. 一处"写了看不出"的**假卡片**：`.dsh-pm-tok-stat` 原本就有 `background: surface + border`，
   但描边写的是 `var(--pm-hair)` = **.5px**（10% 黑）——白面上等于没画，所以"四张汇总卡"看着像四个数字。

## 改动（三处，均不改 `data-*` 契约）

| 文件 | 改动 |
|---|---|
| `src/client/styles/report.ts` | 片尾新增**㉑ 卡片语汇**一层（唯一改外观的地方）：`--pm-card-line/pad-y/pad-x/gap` 四个令牌 + 成卡容器规则 + `.dsh-pm-tok-stat` 描边由发丝提到 1px + DAG 面板合成一张卡；**⑤ 壳体的三张卡（头部 / 状态带三格 / Tab 栏）也改白底 + 1px 描边**。三处旧规则的指针注释（外观已移到 ㉑）：`.dsh-pm-block`、`.dsh-pm-trunk-item`，并删除平铺时代的 `.dsh-pm-trunk-item:first-of-type { border-top: 0 }`（卡片化后第一张卡会缺上边） |
| `src/client/token-info.ts` | 「按阶段 · 按节点」小标题 + 表包进一张卡（`.dsh-pm-block[data-tok-section="stages"]`）——原型里这节就是 `.blk` 一张卡 |
| 连带极性修正 | 头部卡由灰改白后，两处"灰卡连带修正"逐条处置：**状态胶囊**（白底 + 发丝边）保留——白卡上发丝边仍是胶囊形态的唯一载体，文字对比度仍按白底口径 4.70:1；**未开始阶段段**（原为灰卡上改白底保可见）**退役**——白卡上白底段才是隐形，交回 ⑰ 段的 `--pm-bg-soft` 基色 |

**成卡清单**：`.dsh-pm-block`（文档 / 验收板块）、`.dsh-pm-pp-sec`（提示词分节）、
`.dsh-pm-dialogue`（对话面板）、`.dsh-pm-verify-empty`（验收空态）、`.dsh-pm-trunk-item`（汇报模块）、
`.dsh-pm-tok-stat`（Token 汇总卡）、`.dsh-pm-report-dag`（DAG 工具行 + 画布）、
**`.dsh-pm-detail-head`（头部）、`.dsh-pm-stat[data-band-cell]`（状态带三格）、`.dsh-pm-tabs`（Tab 栏）**。

**卡底色 = 白**（`--pm-surface`）：与原型 `.pm-card` / `.band-cell` / `.tabs` / `.blk` / `.t-mod` / `.stat`
的 `background: var(--card)` = `#FFFFFF` 一致。此前一轮的灰底卡（`--pm-bg-soft`，2026-10-05
人裁定「卡片要有背景」，理由是"白底 + 发丝边在白页上几乎不可见"）**随之退役**——
卡与页的分别由**描边 + 圆角**承担，不由底色承担（这是原型自己的做法）。
状态色不在射程内：缺口格红底（`.dsh-pm-stat[data-gap-focus]`，特异性 0,5,0 高于本条）、闸门琥珀条照旧。

**描边口径**：卡描边取 `--pm-line`（10% 黑 ≈ `#e6e6e6`，与原型 `#E2E8F0` 同量级）**1px**；
卡内分隔仍是 `.5px` 发丝——两级差别在**线宽**，不在深浅。⑲ 设计契约层用 `:is()` 把
`.dsh-pm-block` / `.dsh-pm-trunk-item` 的 `border-color` 钉在 `--pm-line`（特异性 0,4,0），
那正是本层想要的取值，故本层不再写 `--pm-line-strong`（写了也不生效）。

**间距**：卡间 `--s3`(12px)、卡内上下 `--s2` / 左右 `--s3`；flex gap 容器（提示词 / Token 面板）里
卡不叠 margin，避免间距双份。原「模块之间 36px」（`--pm-space-module`）在报告壳内退役。

## 验证（全部在本机实跑）

| 判据 | 结果 |
|---|---|
| `npx tsx scripts/req-report-probe.mts` | **PROBE PASS 4/4 组合**（1280/900 × 在途/终态）+ **A13 六面板全 PASS**；`tabsTop` 562/841/423/678（较改前 +4~8px = 三张壳卡各多 1px 描边的合计，上限 713/1153 内） |
| `npx vitest run`（15 个页面相关套件） | **364 例全绿** |
| `npx tsx scripts/req-detail-ui-contrast.mts` | **CONTRAST PASS** |
| FR-10 七项收敛（胶囊 / 前景色 / 底色 / 字重 / 字号 / 圆角 / 边线色） | 自建复算（口径照 `req-detail-ui-prototype-shot.mts` 注释）：① 卡片化那一轮与改前**逐值一致**；② 白底那一轮**颜色集合与计数均不变**（只是白与灰的枚举次序互换）——两轮都不新增颜色 / 圆角 / 字号 |
| 出图 | `first-screen-before-after.png`（首屏三段）+ `tab-{docs,token,verify,prompts,trunk,dialogue,dag}-before-after.png`（各含原型 / 改前 / 改后）+ `panels-after-overview.png` |

## 已知边界（如实登记）

- `scripts/req-detail-design-conformance.mts` **早于本次改动即为退出码 1**：f32f 的
  `detail-ui-v3.html` 内联 CSS 与当前 13 片早已不同源（250193 vs 300464 字符）。
  本次**不去改 f32f 的归档原型**——那会把实现反灌回原型（正是该脚本注释里警告的"原型被实现带偏"）。
  该脚本的判据待随 7a43 的视觉基准重定；在此之前它不是本页的可用门禁。
- 本次工作**未绑定需求**（立项弹框未作答）：改动以本文件 + 出图留痕，未进台账 RTM。

## 回滚

删掉 `report.ts` 片尾「㉑ 卡片语汇」整段 + `token-info.ts` 里那层 `<div class="dsh-pm-block">`
包装 + 两处指针注释，即回到改前（`.dsh-pm-tok-stat` 的描边也随之回到 .5px 发丝）。

## 第 2 项：适配（窄档 / 视口收缩）

**症状**：视口 <1280 时详情页不收缩——壳恒 1280 宽，被宿主 `.dsh-pm-view{overflow:hidden}`
**静默裁掉右侧**（900 视口下右侧 380px 不可见，且没有滚动条）。探针里这两处早已被"登记"成
已接受偏差（`A2 … 已登记两源：标题行操作区 + 折叠长日志单行体`）——登记在案就放行，正是它烂掉的原因。

**根因**：`white-space: nowrap` 的长文本元素其 **min-content = 整行宽**（实测评论摘要体 ≈6.2 万 px）；
`min-width: 0` 只允许收缩、削不掉 min-content 贡献，于是壳的 min-content 被顶到 1280 以上，
又被自己的 `max-width: 1280px` 截住 → 永不收缩。

**修了四处 + 一处兜底**（详见领域篇「适配（窄档 / 视口收缩）」一节）：

| 位置 | 处置 |
|---|---|
| `.dsh-pm-comment-body--clip`（折叠长日志单行摘要） | `contain: inline-size` |
| `.dsh-pm-bubble--long`（对话长日志气泡） | `contain: inline-size` |
| `.dsh-pm-tabs[data-report-tabs]`（7 枚页签 min-content ≈628） | `contain: inline-size`（栏身铺满、页签栏内横滚） |
| `.dsh-pm-vitem-opinion`（验收裁决意见框，基件 `min-width: 260px`） | 本页 `min-width: 0`（不改 board.ts） |
| ≤760px 窄档表格（固定列宽 + 表头 nowrap） | 窄档媒体查询：表头折行、列宽自适应 |

**验证**：自建逐档量测 12 档 × 7 面板 → **零页面级横向溢出、零壳内横向溢出、壳宽恒 = min(视口,1280)**；
探针 `A2` 由"隐藏登记源看残余"**收紧为硬判据**（>1px 即红），4/4 组合 + A13 仍全 PASS；
15 个页面套件 **365 例全绿**。出图：`adaption-900-before-after.png`（900 视口 改前/改后）。

## 第 3 项：折叠块「合上却漏出全文」（对话长日志气泡）

**症状**（人给图）：对话 Tab 的长日志气泡里，**收纳行（「长日志已收纳 t5 复核已…」）与全文同时显示**，
展开钮还是「展开」（= 块是合上的）。

**根因（跨引擎版本，不是我们写错了结构）**：Chromium 131 起把"合上的 `<details>` 藏非 summary 内容"
从**不可覆盖的影子槽**改成了**一条可被作者样式覆盖的 UA 规则**（`details:not([open]) > :not(summary)`
+ `::details-content { content-visibility: hidden }`）。同一份产物：
- 开发机 Chrome 154（`/Applications/Google Chrome.app`）：正常，只显示收纳行；
- DSH 桌面端 **Electron/Chromium 152**（`Electron Framework` 里 `Chrome/152.0.7977.54`）：漏出全文。

**修法**：不再依赖 UA —— 在 `report.ts` 的 ⓪ 基底段显式钉死
`details:not([open]) > :not(summary) { display: none }`（本仓对 `[hidden]` 已有同款先例）。
特异性 (0,3,2)，高于本片任何给气泡设 `display` 的规则。

**连带修的一处（我上一轮引入的回归）**：长日志收纳行为了适配窄窗加了 `contain: inline-size`，
它会把 **max-content 也清零**；而消息行/气泡栏本来是"按内容收缩"的，于是整条收缩成 130px
（气泡里只剩「长日志已收纳 […]」）。补 `.dsh-pm-cmsg:has(.dsh-pm-long) { width: 100% }`
+ 气泡栏 `flex: 1 1 auto` → 收纳行按一行截断铺满 76% 栏，与原型一致。

**验证**：
- **七个面板 36 个折叠块**逐个真 DOM 实测：合上 → 非 summary 子节点 `display: none`；临时打开 → 内容可见。**全绿**；
- 新增两条回归断言（`tests/dialogue-panel.test.ts`）：折叠块的显式隐藏规则在场、长日志那条的宽度规则在场；
- 探针 4/4 组合 + A13 六面板 PASS；15 个页面套件 **367 例全绿**；
- 出图：`dialogue-fold-fixed.png`（一行截断 + 省略号，全文不再漏出）。

## 一个可调旋钮（若还想更强分组）

卡面现在是**白面 + 1px 描边**（照原型）。原型整页底是 `--bg: #F8FAFC`（很浅的灰），
白卡在**纯白页**上只靠 1px 描边分层；若想更接近原型的层次，把详情页岛底也换成 `#f8fafc`
（`.dsh-pm-detail[data-report-shell]` 加一条 `background`）即可——一处改动，卡与页的分别立刻变明显。
