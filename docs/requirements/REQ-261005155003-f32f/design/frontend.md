---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13]
---

# 前端设计（REQ-261005155003-f32f）

> 本文档面向：前端开发、UI 设计、测试——**零上下文的执行者应当能照它把样式落下来**。
> 需求真相：[requirement.md](../requirement.md)（FR-1～FR-13、用户与角色、边界、非功能需求、K1～K8、D-1～D-8、验收标准）。
> 唯一权威原型：[prototypes/detail-ui-v3.html](../prototypes/detail-ui-v3.html)（`prototypes/INDEX.md` 标 `authoritative`）。
> 冻结面（本次一字不改）：`data-*` 面板契约、`data-action` 写路径、服务端字符串、无内层滚动、不加高度上限。
> 落点边界：只到**需求详情页**（`.dsh-pm-detail[data-report-shell]`）；插件级主题接线（K1 / K3）**不在本次**。

## 原型页面 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13`

**唯一权威原型**：`prototypes/detail-ui-v3.html`（由 `templates/brainstorming/prototype.html` 生成，
每个功能点一个 `<section id="FR-N">` 锚点区块，FR-1～FR-13 齐备）。
`prototypes/INDEX.md` 的四列表格只有**一条** `authoritative`（本份路径），第二行标 `superseded`
（v2）——**本设计一律不引用被取代的那一份**；指向 superseded 会被 `prototype_version_conflict` 拒。

原型与真实壳的关系（`requirement.md`「原型与实测」节，逐字口径）：
原型内联的是 `buildReportShell(...)` 的**同一份标本输出**（`scripts/fixtures/req-detail-specimen.mts`），
**只换 CSS 层 + 图标 + 可访问性属性**，另加**一处已声明的 DOM 位移**——D-8（2026-10-05）按人裁定 A 把
`.dsh-pm-rh-top` 与 `.dsh-pm-report-windows` 的容器归属调整了一次（窗口组移进身份行；只改容器归属，
文本与属性一个没动）。因此**逐字节一致已不再成立**，断言口径见验收标准 #4b。

| 页面/组件（编号） | 原型锚点（`P-x/C-x ↔ #FR-N`） | 关联 D-x | 该处结构与交互（一句话） | 该处的可失败判据（结构 / 几何 / 令牌） |
|---|---|---|---|---|
| P-1 | P-1 ↔ prototypes/detail-ui-v3.html#FR-9 | D-7、D-8 | 详情页骨架：动作行（第一行）→ 身份行（第二行）→ 标题 → 状态带 → Tab 栏 → 只含当前面板 | `actionRowTop < identityRowTop` 且差 ≥8px；`windowLeft < createdAtLeft`；未激活面板不在 DOM |
| C-1 | C-1 ↔ prototypes/detail-ui-v3.html#FR-3 | D-1 | Tab 栏：点 Tab 切面板；`←/→` 移焦点，`Home/End` 跳首尾 | 产物含 `role="tablist"`；选中项恰 1 个 `aria-selected="true"`；未激活项 `tabindex="-1"` |
| C-2 | C-2 ↔ prototypes/detail-ui-v3.html#FR-1 | D-1、D-5 | Tab 图标：内联 SVG，跟 `currentColor` 变色 | Tab 内 `<svg>` 的 `width/height` = 14px（±1）；结构位 emoji 命中数 0 |
| C-3 | C-3 ↔ prototypes/detail-ui-v3.html#FR-7 | D-5 | 身份行 / 页标题 / 模块标题：六档字阶 + 两档真文字色（第三档 `--pm-text3` 只做非文本） | 可见真文字最小 `font-size` ≥11px；字号去重 ≤6 且无阶梯外值 |
| C-4 | C-4 ↔ prototypes/detail-ui-v3.html#FR-9 | D-4、D-7、D-8 | 操作条动作：动作独占一行、不拉伸、按序紧挨，破坏性动作排最后 | 动作按钮 `offsetTop` 单一取值；1/2/3 个动作三变体的主操作左缘与危险动作右缘逐次相同 |
| C-5 | C-5 ↔ prototypes/detail-ui-v3.html#FR-11 | D-6 | 操作条文案：无「本阶段操作」；后果走 `aria-describedby`；行尾标「需人工确认」 | 产物不含「本阶段操作」与常驻后果节点；`aria-describedby` 指向节点文本 === 服务端 `consequence` |
| C-6 | C-6 ↔ prototypes/detail-ui-v3.html#FR-12 | D-7 | 状态带三格：标签 11 / 主值 20 / 细节 12（三档且两两差 ≥2px） | H4 三格字号档数 =3 且两两差 ≥2px；H1 `24÷13 = 1.85 ≥ 1.8`；H2 `36÷8 = 4.5 ≥ 3` |
| C-7 | C-7 ↔ prototypes/detail-ui-v3.html#FR-8 | D-1、D-7 | 缺口行：严重度 = 图形标记 + 文本标记（`!!` / `!` / `·`） | 每条缺口行内存在文本或 `svg` 子节点；灰度截图下三态仍可区分 |
| C-8 | C-8 ↔ prototypes/detail-ui-v3.html#FR-13 | D-7 | 最近评论：只读列表保留，输入框移除 | 产物不含 `.dsh-pm-comment-form` 与 `add-comment`；`.dsh-pm-comment` 只读行仍在 |
| C-9 | C-9 ↔ prototypes/detail-ui-v3.html#FR-2 | D-1 | 焦点环（原型里 `data-proto-focus="1"` 那处是**演示**，不是默认外观） | 每个可聚焦元素 `outlineWidth ≥ 2px` 且与背景 ≥3:1；默认态只有蓝色文字 + 蓝色下划线 |
| C-10 | C-10 ↔ prototypes/detail-ui-v3.html#FR-4 | D-1、D-3 | 浅色岛令牌（原型带 `?theme=dark` 开关模拟宿主深色令牌） | `?theme=dark&v=next` 与浅色档出图 sha256 相同；`report.ts` 不再引宿主主题敏感令牌 |
| C-11 | C-11 ↔ prototypes/detail-ui-v3.html#FR-10 | D-5 | 视觉语言：七项多样性收敛（胶囊 / 前景 / 底色 / 字重 / 字号 / 圆角 / 边线） | 同一标本 1280 在途：胶囊 ≤5、**前景 ≤6**（2026-10-05 勘误：原写 ≤5，与色板六种文字色 + FR-8 严重度着色相抵）、底色 ≤4、字重 ≤3、字号 ≤6、圆角 ≤2、边线 ≤2；另判「无阶梯外字号、无阶梯外前景色」 |
| C-12 | C-12 ↔ prototypes/detail-ui-v3.html#FR-6 | D-1 | 动效令牌与 reduced-motion（原型里时长归零可见） | 分片 `transition` 时长全部来自 `var(--pm-dur`；含 `@media (prefers-reduced-motion: reduce)` |
| C-13 | C-13 ↔ prototypes/detail-ui-v3.html#FR-5 | D-1 | 目标尺寸：窗口胶囊 203.1×20.5 → 24 高；行内「点开看原文 →」71.2×19.3 → ≥24×24 | 全部 `button/[role=tab]/a[href]/summary/input` 命中区 ≥24×24，相邻 ≥8px |

**断言口径（不写"与原型一致"）**：结构断言（区块存在 / 顺序 / 层级）+ 几何量硬判据（必须显式写明
窗口宽与状态，如「1280 档 · inflight，`--window-size=1280,800`，实测视口高 713」）+ 令牌（字号 / 颜色名）。
原型 `proto-geometry` 块里**只有观测值与 `at`，没有阈值**——阈值属设计决策，写在本份与需求文档里。

**如实登记：原型的已知覆盖边界与两处自述偏差（不许当成"已经验过"）**

1. **K7 · 出图 / 几何脚本仍指向被取代的 v2**：`scripts/req-detail-ui-prototype-shot.mts:55` 的
   `PROTO` 常量仍是 v2 → 跑它只会重新生成 / 回填 v2 的 PNG 与几何，而验收标准 #4b 要求它退出码 0。
   **实施必须先把 `PROTO` 指向 v3 再跑**；若三条断言（含"内联壳与 `buildReportShell` 逐字节一致"）
   当场报错，就说明 v3 的壳被人手改过——那时要么修 v3、要么把断言口径改为"只允许已声明的偏差"。
2. **K8 · 原型自述与事实不符**："`?v=current` = 改造前外观"**不成立**：文件里**没有任何**
   `[data-proto-v]` CSS 选择器（命中的 3 处全是说明文字）；实测 `?v=current` 与 `?v=next` 的
   `bar / identity / windows / createdAt / tabs` 矩形**逐项相同**，只差结构位图标（emoji ↔ 内联 SVG）。
   **改前对照一律用 `evidence/ui-before-*.png`**（真实页面基线）。
   处置二选一（实施阶段做）：① 给整块改造层补 `[data-proto-v="next"]` 门控让自述成真；
   ② 删掉该说法并把两张复测表的「改前」列改标为"人给的历史快照"——**不许继续声称**。
3. **标本只渲染「汇报」面板**：`docs / dag / dialogue / token / prompts` 五块**不在标本 DOM 里** →
   那五块的 FR-5 目标尺寸、FR-7 字阶、FR-1 面板内结构位 emoji，原型**只写了覆盖规则、没有实测**；
   实施阶段接真页面（或扩标本）后必须补测（验收标准 #4c）。
4. **两处 CSS 隐藏 ≠ DOM 已删**：`.dsh-pm-action-bar-label`（「本阶段操作」）与
   `.dsh-pm-action-consequence` 在原型里是 CSS 隐藏（实测 `0×0`）、**DOM 节点仍在**；
   而 FR-11 的验收锚点要求"渲染产物**不含**这两个节点（DOM 断言，不是字符串 grep）"。
   原型只是预览——**实施必须真删 DOM**（`report-head.ts:196` / `:178`）。
5. **FR-8 的标记在原型里是 CSS `::before`**（受"只换 CSS 层"约束）→ 对读屏不保证可读；
   实施必须落成真实文本节点或 `aria-hidden` 的 SVG + 可访问名。
6. **FR-6 的"非 reduce 下不是瞬变"本机量不到**：本机 headless Chrome 的 `prefers-reduced-motion`
   恒为 reduce（不加 flag 也是，`--force-prefers-reduced-motion=no-preference` 压不住）→
   计算样式永远是 0s。**不放宽阈值**，改拆判据（④ 计算样式 / ①②③ CSS 文本静态）。

## 目录与包结构 `serves: FR-1, FR-3, FR-4, FR-6, FR-7`

前端是**纯字符串渲染**（无组件框架、无虚拟 DOM），页面与样式分处两个目录：视图在 `src/client/views/`，
外观在 `src/client/styles/`。

```
src/client/
├── icons.ts                 （本需求新增：唯一图标源，纯导出、零运行时依赖、零副作用）
├── views/
│   ├── report-tabs.ts       （改动：Tab 栏语义与键盘；TAB_ICONS 迁出）
│   ├── report-head.ts       （改动：两行头部 / 操作条文案 / 删评论输入框）
│   ├── report-band.ts       （改动：状态带三格与缺口行的非颜色标记）
│   ├── stage-detail.ts      （改动：阶段条的完成 / 当前前缀）
│   └── panels/*.ts          （改动：面板内结构位图标与字阶；结构不动）
└── styles/
    └── report.ts            （改动：浅色岛令牌 / 焦点环 / 字阶 / 间距 / 动效，唯一外观源）
scripts/
├── req-report-probe.mts             （改动：新增可访问性断言组）
├── req-detail-ui-prototype-shot.mts （改动：PROTO 指向 v3，见 K7）
└── req-detail-ui-contrast.mts       （新增：WCAG 对比度报表，读 report.ts 的令牌声明）
```

| 路径（完整相对路径） | 内容（文件名+一句话职责） | 新增/改动 | 落此处的理由（为什么不放别处） |
|---|---|---|---|
| src/client/icons.ts | 六个 Tab 结构图标的**唯一源**（`TAB_ICON_SVG: Record<ReportTabKey, string>`）；全族常量 `viewBox="0 0 16 16"` / `stroke-width="1.5"` / `stroke="currentColor"` / `fill="none"` | 新增 | 图标是**跨视图资产**（Tab 栏 + 面板内结构位都要用），不属于任一视图模块；放 `src/client/` 根与 `html.ts` / `dom.ts` 同级；纯字符串导出，与全仓"纯字符串渲染"一致，不引依赖 |
| src/client/views/report-tabs.ts | `buildTabBar` 产出 `role="tablist"/tab` + `aria-selected` + `aria-controls` + roving `tabindex`；`TAB_ICONS` 改为从 `icons.ts` 取 | 改动 | 壳与 Tab 注册契约（`REPORT_TABS` / `ReportTabDef`）已在此处，ARIA 属**壳**不属面板（面板卡只管内容） |
| src/client/views/report-head.ts | 常驻头部按**两行**渲染（动作行 / 身份行）；删「本阶段操作」与常驻后果节点、加 `sr-only` + `aria-describedby`；行尾标改短；删评论输入框 | 改动 | 头部四段（身份行 / 标题 / 操作条 / 评论）的唯一产地；FR-9/FR-11/FR-13 的判据都落在这里的 DOM |
| src/client/views/report-band.ts | 状态带三格与缺口行：严重度改"图形标记 + 文本标记"，短标与全文口径不变 | 改动 | 三格与缺口行的唯一产地；颜色之外的第二判据只能在这里落成真实节点 |
| src/client/views/stage-detail.ts | `buildProgressDots` 的完成 / 当前 / 未开始三态加 `✓` / `▸` / 无前缀 | 改动 | 8 态阶段条是既有实现，FR-8 只要在这里加非颜色标记，**不另画一套** |
| src/client/views/panels/prompts.ts | `🧱 A · 固定系统提示词` 这类**结构位**图标改内联 SVG 或去掉 | 改动 | 它顶着 Tab 的图标，Tab 换 SVG 后不一起换就出现两套图标语言（`requirement.md` FR-1 范围限定第 ① 条） |
| src/client/styles/report.ts | 详情页**唯一外观源**：浅色岛令牌块、焦点环、六档字阶、4/8 间距栅格、动效令牌与 reduced-motion；删除 `[data-ds-dark-theme]` 岛内覆盖 | 改动 | 报告页的类名与旧详情页共用，靠 `.dsh-pm-detail[data-report-shell]` 前缀把特异性提到旧规则之上；旧分片一个字不许改（那是别的页面的长相） |
| src/client/board-mount.ts | **不改**：核对 `commentInputOf`（:271-284）按 `.dsh-pm-comment-form` 作用域取框的逻辑在头部评论框移除后仍成立 | 改动（仅核对注释） | FR-13 的耦合点写在这里；改它属越界（对话 Tab 评论链路是另一个面） |
| scripts/req-report-probe.mts | 新增断言组：焦点环 / 目标尺寸 / 最小字号 / reduced-motion / 阶段条与结论的非颜色标记 | 改动 | 既有硬判据（四组合、退出码 0/1/2 语义）都在此脚本，新增判据必须同批同脚本 |
| scripts/req-detail-ui-contrast.mts | 按 WCAG 相对亮度公式算全表（含**组合背景**与**反白关系**），读 `report.ts` 的令牌声明而不是复制值 | 新增 | 避免"文档一份值、代码一份值"两处漂移；基线报表已成文（`evidence/contrast-baseline.txt`） |

## 组件结构 `serves: FR-1, FR-3, FR-9, FR-11, FR-12, FR-13`

```
P-1 需求详情页（buildReportShell：常驻头部 + 状态带 + Tab 栏 + 只含当前面板）
├── C-3 常驻头部（.dsh-pm-detail-head[data-report-head]；两行 + 标题 + 结论 + 阶段条）
│   ├── C-4 动作行（.dsh-pm-rh-bar 第一行：← 看板 + 本阶段合法动作，整行独占、左对齐）
│   │   └── → 点击走既有 data-action 通道（move-req / plan-approve / plan-reject / verify-pass / verify-rework / cancel）
│   ├── C-5 操作条文案（无分组标签；主操作 aria-describedby → .dsh-pm-sr-only；行尾 .dsh-pm-human-only）
│   ├── C-6 身份行（.dsh-pm-rh-top 第二行：REQ-id · 状态 · 分类 · 难度 · 停留/更新 + 靠左的窗口组 + 行尾「创建于」）
│   │   └── C-6-1 窗口跳转组（.dsh-pm-report-windows：data-action="jump-session"，已归档仍是可点按钮）
│   ├── C-7 阶段条（buildProgressDots：8 态；完成 ✓ / 当前 ▸ / 未开始无前缀）
│   └── C-13 一句话结论（.dsh-pm-report-verdict）+ 下一步（.dsh-pm-report-next）
├── C-8 状态带三格（.dsh-pm-stats[data-report-band]：做到哪了 / 缺口 / 结果与成效）
│   └── C-9 缺口行（.dsh-pm-gap-line[data-severity]：图形标记 + !! / ! / ·；全文进 title）
├── C-1 Tab 栏（.dsh-pm-tabs[data-report-tabs][role=tablist]）
│   └── C-2 Tab 图标（.dsh-pm-tab-icon[aria-hidden] ← icons.ts 的内联 SVG）
├── C-10 面板宿主（.dsh-pm-tab-panel[role=tabpanel]：只渲染当前激活面板；未激活不在 DOM）
│   └── C-11 六个面板（trunk 汇报 / docs 文档 / dag DAG / dialogue 对话 / token Token / prompts 提示词）
└── C-12 最近评论只读列表（.dsh-pm-comments[data-comment-list]；输入框已移除）
    └── → 发评论走对话 Tab / 会话窗口（不在本页）
```

**数据流向**：全部是**服务端字符串 → 纯函数拼字符串**（无 props / emit）。
`buildReportShell(report, active, opts)` 一次性吃 `ReportResponse`（`head` / `progress` / `gaps` /
`actions` / `verdictLine` / `nextStepForAgent` / `outcome`），四段（head / band / tabs / panel）由
`createReportShell` 做**分段替换**；面板载荷由 `ReportTabCtx.load` 懒取，缓存键 `reqId::tab::revision`。
**本次不改数据流**：只改渲染出来的 DOM 属性、文案与外观。

## 页面与组件（编号表） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13`

| 编号 | 类型 | 名称 | 职责（动宾结构，含响应操作） | 数据来源（函数 / 状态） | 新增/改动 | serves |
|---|---|---|---|---|---|---|
| P-1 | 页面 | 需求详情页（report shell） | 渲染常驻头部 + 状态带 + 六个同级 Tab 与**当前**面板；响应 Tab 切换、动作点击、窗口跳转 | `buildReportShell(report, active, opts)` ← `ReportResponse` | 改动 | FR-1, FR-3, FR-9, FR-12 |
| C-1 | 组件 | Tab 栏 | 渲染六个 `role="tab"` 按钮并响应点击与 `←/→/Home/End` 切换面板（走既有 `switch-tab`） | `report-tabs.ts#buildTabBar` + `REPORT_TABS` | 改动 | FR-3, FR-1 |
| C-2 | 组件 | Tab 图标族 | 提供六个结构图标的内联 SVG 字符串（`aria-hidden`、`currentColor`、尺寸走 `--pm-icon` / `--pm-icon-sm`） | 新增 `src/client/icons.ts#TAB_ICON_SVG` | 新增 | FR-1 |
| C-3 | 组件 | 常驻头部 | 按两行渲染头部：动作行在上、身份行在下，标题与结论居中承载；响应各段局部替换 | `report-head.ts#buildReportHead` | 改动 | FR-9, FR-11, FR-12 |
| C-4 | 组件 | 操作条动作区 | 渲染本阶段合法动作按钮（不拉伸、按序紧挨、危险动作最后），响应点击并转发既有 `data-action` | `report-head.ts#buildReportActionBar` ← `report.actions` | 改动 | FR-9, FR-5 |
| C-5 | 组件 | 操作条文案与披露 | 删除分组标签与常驻后果节点；为主操作挂 `aria-describedby` 指向 `sr-only` 后果文本；行尾标渲染「需人工确认」 | `buildReportActionBar` + `shortConsequence` | 改动 | FR-11 |
| C-6 | 组件 | 身份行 | 渲染 `REQ-id · 状态 · 分类 · 难度 · 停留/更新`，并把窗口按钮组放在**靠左**位置、「创建于 …」收在行尾 | `buildReportHead` ① 段 + `report-head.ts#buildWindowJumps` | 改动 | FR-9, FR-5, FR-4 |
| C-7 | 组件 | 阶段条 | 渲染 8 态进度条并为完成 / 当前态附 `✓` / `▸` 非颜色前缀 | `stage-detail.ts#buildProgressDots` ← `head.status` | 改动 | FR-8 |
| C-8 | 组件 | 状态带三格 | 渲染「做到哪了 / 缺口 N 条 / 结果与成效」三格，三格各一档字号（11 / 20 / 12） | `report-band.ts#buildReportBand` ← `progress` / `gaps` / `outcome` | 改动 | FR-12, FR-8 |
| C-9 | 组件 | 缺口行 | 渲染每条缺口的严重度标记（图形 + `!!` / `!` / `·`）与一行短标，全文进 `title` | `report-band.ts#buildGapsCell` + `GAP_DOT` | 改动 | FR-8, FR-10 |
| C-10 | 组件 | 面板宿主 | 只渲染当前激活面板并挂 `role="tabpanel"` + 稳定 `id` + `aria-labelledby`；未激活不在 DOM | `report-tabs.ts#panelWrapper` | 改动 | FR-3 |
| C-11 | 组件 | 六个 Tab 面板 | 各自渲染 汇报 / 文档 / DAG / 对话 / Token / 提示词 的内容；只认自己的载荷，结构不动 | `views/panels/{trunk,docs,dag,dialogue,token,prompts}.ts#render` | 改动（外观相关） | FR-5, FR-7, FR-1 |
| C-12 | 组件 | 最近评论只读列表 | 渲染最近 N 条评论（新的在下、超长收纳），只读；**不再渲染**输入框与发送按钮 | `report-head.ts#buildCommentList` ← `head.comments` / `head.commentsTotal` | 改动 | FR-13, FR-7 |
| C-13 | 组件 | 一句话结论与下一步 | 渲染结论行（在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手）与实施窗口下一步 | `buildReportHead` ③ 段 ← `verdictLine` / `nextStepForAgent` | 改动 | FR-12, FR-4 |
| C-14 | 组件 | 外观层（REPORT_CSS） | 提供浅色岛令牌、焦点环、六档字阶、间距栅格、动效与 reduced-motion 的**唯一样式源** | `src/client/styles/report.ts`（经 `styles.ts` 汇总注入，C-05 归属章既有） | 改动 | FR-2, FR-4, FR-6, FR-7, FR-10 |
| C-15 | 组件 | 结构图标常量 | 与 C-2 同源：面板内结构位（如「A · 固定系统提示词」）复用同一图标族 | `icons.ts` ← `panels/prompts.ts` 等 | 改动 | FR-1, FR-10 |

## 状态管理 `serves: FR-3, FR-6, FR-11, FR-13`

**本次不新增任何全局状态，也不改既有控制器契约**（`createReportTabs` / `createReportShell` 的
`ReportTabCtx` / `ReportTabDef` 导出名与类型一字不改）。

| 状态 | 归属 | 更新时机 | 谁读 | 本次是否动 |
|---|---|---|---|---|
| `active`（当前 Tab 键） | `createReportTabs` 控制器 | 点击 / `←/→/Home/End` → 走既有 `switch-tab` | Tab 栏、面板宿主 | 只加 ARIA 与 `tabindex` 的**渲染结果**，状态本身不动 |
| 面板载荷 + 缓存 `reqId::tab::revision` | 控制器内存 | 首次切到该 Tab 请求；revision 变更只失效「头部 + 当前 Tab」 | 当前面板 | 不动（懒加载与"未激活不在 DOM"纪律不变） |
| 焦点（roving tabindex） | **DOM 原生焦点**，不另建状态 | `←/→` 时把 `tabindex="0"` 交给新的选中项并 `focus()` | 浏览器 | 新增的是 DOM 属性，**不是** JS 状态 |
| Tab → 面板的 id 约定 | 渲染期常量 | 每次渲染 | `aria-controls` / `aria-labelledby` | 新增：稳定 id `tab-<key>` / `panel-<key>`；面板挂载时带同 id（未激活面板不在 DOM 是**既有纪律**，故 `aria-controls` 只声明 id，不保证当下有节点） |
| 评论草稿 | `board-mount` 的 capture/restore（按 `data-draft-key` 分槽） | 分段重绘前后 | 评论输入框 | 头部那个框被删（FR-13）→ 头部槽位消失，对话 Tab 的槽位与链路不动 |
| reduced-motion | **纯 CSS 媒体查询**，零 JS | 由系统设置决定 | 外观层 | 新增：不引入运行时检测（无 SSR 差异，探针可直接读计算样式） |
| 主题（浅色岛） | **纯 CSS 令牌**，零 JS | 静态 | 全页 | 新增口径：不读宿主主题变量，也就不需要运行时同步 |

**为什么不把焦点 / 主题 / 动效提升为 JS 状态**：它们都是"CSS 能表达且可被计算样式断言"的量；
一旦落进 JS，就多出一份需要同步的副本（本仓在 `req-detail-store` 上已踩过"混源失效判据 →
自持重取风暴"）。判据量的是 DOM 与计算样式，不是内部状态。

## 路由与导航 `serves: FR-3, FR-9, FR-13`

**不新增、不修改任何路由**（详情页沿用既有深链与看板跳转；`board-mount` 的挂载分支与回落旧页逻辑不动）。

页内导航（本次涉及的交互路径）：

| 入口 | 点什么 / 按什么 | 发生什么 | 走哪条通道（冻结面） |
|---|---|---|---|
| 六个 Tab | 鼠标点击，或焦点在 Tab 上按 `←/→/Home/End` | 选中项前移 / 跳首尾，面板切换（只请求未缓存的 Tab） | `data-action="switch-tab"` + `data-tab="<key>"`（**属性只增不改**，事件通道不变） |
| 动作按钮 | 点击 / `Enter` | 走既有写路径；危险动作先弹既有 `data-confirm` 确认框（拒绝即拦下） | `data-action="move-req" / "plan-approve" / "plan-reject" / "verify-pass" / "verify-rework" / "cancel"` |
| 窗口胶囊 | 点击 | 打开 / 恢复该会话 | `data-action="jump-session"` + `data-sid` / `data-jump-session` |
| 返回 | 点击「← 看板」 | 回看板 | `data-action="back"` |
| 行内「点开看原文 →」 | 点击 | 打开来源文档（复用 `/file` 链路） | `data-open-doc="<path>"` |
| 发评论 | —（**本页已移除入口**） | 到对话 Tab / 会话窗口发 | 本页不再有 `add-comment`（FR-13） |

权限与只读口径（沿用既有、本次不动）：
`owner` 全部动作；`worker` 领卡 / 汇报 / 提交产物；**`observer` 不渲染写动作按钮**（保留查看与跳转）；
**终态（archived / canceled / done）只留「← 看板」**——不渲染动作条 / 窗口跳转 / 评论输入框，
但评论**列表**仍渲染（它是台账已记下的事实，审计要看"谁批的、说了什么"）。

## 样式与主题 `serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12`

本节是**照着落样式的那一节**：口径 → 令牌表 → 单强调色与焦点环 → 字阶 → 间距 → 圆角与边线 → 动效 →
响应式 → 不做什么。全部取值落在 `src/client/styles/report.ts` 的
`.dsh-pm-detail[data-report-shell]` 作用域内（**唯一样式源**，规则只引令牌不写裸值）。

### 1 口径：详情页是「浅色岛」，且必须是一座**诚实**的浅色岛 `serves: FR-4, FR-10`

1. 详情页全部颜色令牌取**浅色原值**，**不引宿主主题变量**——它的表面本来就是白的，跟着宿主主题翻转
   前景色只会得到"白底浅字"。
2. `--pm-text3` **不再引** `--dsw-alias-label-tertiary`（宿主深色时它是 `#adb2b8`，白底上只有 2.13:1，
   比浅色下更差——K2 记的是成因）。
3. **移除** `[data-ds-dark-theme] .dsh-pm-detail[data-report-shell]` 那组覆盖（现状在
   `src/client/styles/report.ts:962`，8 行 `--pm-*` 覆盖）：它把岛内语义前景色翻成暗色主题值
   （白底上 `--pm-danger` 从 4.53:1 掉到 ≈3.4:1），是"半个主题"的残留。移除后岛内两套宿主主题下
   **同一副长相**。
4. **不再声称**"跟随主题"：现状文件头注释写着"前景走 --dsw-*（暗色主题跟着变）"（`report.ts` 头部
   与 `:71` 一带），与事实不符，是本次要修掉的**说谎点**之一，注释口径一并改。
5. 现存四个令牌名在 DSH 里**一个都不存在**（`--dsw-text-primary` / `-text-secondary` / `--dsw-accent` /
   `--dsw-bg-primary`，定义数 0）→ 回退值恒生效。本次只在 `report.ts` 一处切断依赖；
   **插件级接线（8 个假令牌名、11 个分片共 426 处）不在本次**：D-3 裁定「**A. 本次只做详情页
   （浅色岛，改动面小，推荐）**」，K1 / K3 记成因与后续动作。

### 2 令牌表（新增 / 改动，逐值按 WCAG 相对亮度公式核过） `serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-9, FR-10, FR-12`

| 令牌 | 取值 | 用途 | 白底对比 | 判定 |
|---|---|---|---|---|
| `--pm-text` | `#1d1d1f`（苹果 label） | 正文、标题、主值 | 16.9:1 | ✓ 不变 |
| `--pm-text2` | `#6e6e73`（苹果 secondaryLabel） | **全部**次要真文字：元信息、来源标、短标、**计数数字**、说明（L4 / L5） | 5.07:1 | ✓（改动：原值引的是宿主不存在的 `--dsw-text-secondary`，回退值恒生效；本次自持浅色原值） |
| `--pm-text3` | `#86868b`（苹果 tertiaryLabel） | **只许非文本**：图标、装饰线、未激活描边 | 3.62:1 | 非文本 ≥3:1 ✓；**禁止承载真文字**（低于 4.5:1） |
| `--pm-accent` | `#0071e3`（苹果系统蓝；仓内 `node-panel.ts` 已用同值） | **唯一强调色**——面：进度条 / 左边色条 / 边框 / 下划线 / 图标 / 焦点环；文字：选中 Tab / 链接 / 人名 / 行内「点开看原文 →」；主按钮底色 | 4.70:1 | ✓ **文字与面同值**（4.70 ≥4.5 也 ≥3:1）——见 §3 |
| `--pm-accent-text` | `var(--pm-accent)`（= `#0071e3`） | **文字级槽位**（本次与面级同值）：契约表已声明这个名字，保留它作为"将来若确要再分级"的单点 | 4.70:1 | ✓ 与 `--pm-accent` 同步，不引入第二个色值 |
| `--pm-danger` | `#d70015`（苹果 accessible red） | 危险文字、破坏性动作边线 | 5.38:1 | ✓（取代原 `#dc3545` 4.53:1——余量从 <5% 提到 ~20%） |
| `--pm-warn-text` | `#c93400`（苹果 accessible orange） | 警告文字 | 5.28:1 | ✓（取代原 `#a86a00` 4.44:1，原值差 0.06 不达标） |
| `--pm-ok-text` | `#1e7e34` | 成功 / 通过 / 无缺口文字 | 5.14:1 | ✓ 不变 |
| `--pm-teal-text` | `#0e7c8f` | 验收态（`accepting`）文字 | 4.89:1 | ✓ 保留（不在取消清单内） |
| `--pm-ok-text-tint` / `--pm-teal-text-tint` / `--pm-danger-text` | `#1e7d34` / `#0d7789` / `#c7303e` | **备而未用**：仅在保留同色浅底芯片时启用（组合背景达标） | 4.55:1 / 4.52:1 / 4.52:1 | ✓ 备用；(二) 取消底色块后不再需要 |
| `--pm-line` | `#0000001a`（= 苹果 separator = 宿主 `--dsw-alias-border-l2`） | 发丝线**唯一一档**（`.5px solid`） | 1.25:1 | 非文本豁免（见下"豁免登记"） |
| `--pm-line-strong` | `#00000029`（= 宿主 `border-l4`） | 需要更强分隔时**唯一**备选 | 1.45:1 | 豁免同上 |
| `--pm-line-soft` | **删除**（原 `rgba(128,128,128,.11)`） | — | — | 两档灰线统一到一档（FR-10 #5） |
| `--pm-bg-soft` | `#f5f5f7`（苹果浅灰；仓内已有同值） | 分组底（**唯一**的第二种底色，只用于状态带） | — | — |
| `--pm-surface` | `#fff` | 页面 / 卡片底色（**改动**：不再引宿主不存在的 `--dsw-bg-primary`） | — | — |
| `--pm-icon` / `--pm-icon-sm` | `14px` / `12px` | 图标尺寸**只此两档**，不出现第三种 | — | — |
| `--pm-focus-ring-w` / `--pm-focus-offset-face` / `--pm-focus-offset-ctl` / `--pm-focus-halo` | `2px` / `-2px` / `2px` / `0 0 0 3px rgba(0,113,227,.25)` | 焦点环宽度 / 面状控件内偏移 / 小控件外偏移 / 苹果式 halo | — | — |
| `--pm-dur-fast` / `--pm-dur` / `--pm-dur-slow` | `80ms` / `120ms` / `150ms` | 交互过渡时长（三档全在 80–150ms 内） | — | — |
| `--pm-ease` | `cubic-bezier(.2, .8, .2, 1)` | 唯一缓动曲线 | — | — |
| `--pm-space-module` | `36px` | 模块**之间**的间距（FR-12 B 的 36px；**4/8 栅格的唯一例外**，见 §5） | — | — |
| `--f-h1` / `--f-l1` / `--f-h2` / `--f-body` / `--f-small` / `--f-tiny` + `--lh-*` | 见 §4 | 字阶六档与行高配对（**改既有槽位的值**，不新开一族） | — | — |

> **口径裁定：色板以 FR-10（D-5 之后）为准。** `requirement.md` FR-4 那张表（`#4a7dff` / `#2f5fd0`
> 5.72:1 / `#61666b` 5.80:1 / `#8a5a00` 5.93:1 / `#dc3545` 4.53:1，以及"主色分**面 / 文字两级**"）
> 是 **D-5 之前**的取值；**FR-10**（D-5 之后、且 FR-7 #1 明写"取值与 FR-10 同源，**以 FR-10 为准**"）
> 把强调色定成**唯一** `#0071e3`——它对文字 **4.70:1 ≥ 4.5** 已经达标，**两级不必分**。
> 故：`--pm-accent` = `--pm-accent-text` = `#0071e3`；`--pm-accent-text` **名字保留**（`requirement.md`
> 的 CSS 令牌契约表已声明它，也是"将来若确要再分级"的单点）。此裁定与 `interfaces.md` 的 C1 / C2 一致。
>
> **被取代的旧值（仅留痕，不得作为本次取值写进代码）**：`#4a7dff`（主色旧值 3.70:1）、
> `#2f5fd0`（FR-4 的"文字级主色" 5.72:1）、`#61666b`（FR-4 的"三级真文字" 5.80:1）、
> `#8a5a00`（警告旧值 5.93:1）、`#dc3545`（危险旧值 4.53:1）、`#9aa0a6` / `#81858c` / `#adb2b8`
> （三级灰旧值与宿主深色值）、`#5f6368`（次要旧值）、`#8e44ad`（紫，见取消清单）。
> 权威原型 v3 的改造层实测也是这个口径：`--pm-accent: #0071e3`、
> `--pm-accent-text: var(--pm-accent)`、`--pm-text3: #6e6e73`（v3 的改造层把第三档当**灰阶**用）；
> 本设计按 FR-10 #1 的**规则**执行（三级色只做非文本）、按 FR-10 的**值**取 `#86868b`，
> 真文字一律用 `--pm-text` / `--pm-text2`——**第三档承载真文字这条差异已在此登记**。

**豁免登记（非文本 3:1 按"是否承载信息"划线，不按元素类型划线）**：
**必须 ≥3:1** 的是图标（含 Tab 图标）、进度条完成 / 当前段、状态带左边色条、焦点环、缺口严重度标记；
**逐条豁免**的是纯装饰 hairline（`--pm-line` 1.25:1）与未开始阶段的进度段（1.24:1）——两侧有文字与
留白，且不标识任何控件或状态；控件边线另有文字标签与悬停 / 焦点反馈可识别（WCAG 1.4.11 的
"可通过其他方式识别"情形）。**这与宿主同口径**：DSH 自己的边框就是
`--dsw-alias-border-l1 #0000000a`（1.04:1）～`l4 #00000029`（1.45:1）；若强行要求分隔线也 ≥3:1，
`--pm-line` 得从 `.20` 提到约 `.45`，视觉重量会明显变重——**本页选择与宿主一致**，理由存档于此。

**取消清单**（FR-10 (二)）：全部 12% 语义底色块、全部彩色边线（红 35% / 橙 45% / 蓝实心）、
紫 `#8e44ad`（agent **前景色**取消——agent 署名改用普通文字，窗口码 `窗口 w-xxxx` 本身已足够区分；
需要颜色时只允许降到图标 / 状态点这类**非文本**位）、`rgba(128,128,128,.20)` 与 `.11` 两档灰线
（统一到一档）。**青 `--pm-teal-text #0e7c8f` 保留**（验收态文字 4.89:1，达标）。

### 3 单强调色（`--pm-accent`）与焦点环 `serves: FR-2, FR-4, FR-10`

**一个强调色，文字与面同值**（`--pm-accent` = `--pm-accent-text` = `#0071e3`，4.70:1）：

| 用途 | 用哪个名字 | 值 | 依据 |
|---|---|---|---|
| 面：进度条 / 左边色条 / 边框 / 下划线 / 图标 / 焦点环 | `--pm-accent` | `#0071e3` | 非文本，≥3:1 即可（4.70:1 ✓）；FR-10 (二) 定"强调（**唯一**）" |
| 文字：选中 Tab / 链接 / 人名 / 行内「点开看原文 →」 | `--pm-accent-text`（= `var(--pm-accent)`） | `#0071e3` | 真文字必须 ≥4.5:1（4.70:1 ✓）；H5「主色文字 ≤1 类」= **1 类**（只有一个值承载文字） |
| 主按钮（白字压主色底，如「提交验收」） | 底 `--pm-accent` + 白字 | `#0071e3` | 白字压在它上面 4.70:1 ≥4.5 ✓（旧写法要"拆两级"是因为旧主色 `#4a7dff` 只有 3.70:1，白字不够） |

**焦点环（FR-2 + FR-10 §8）**：

- 形态：`outline: var(--pm-focus-ring-w) solid var(--pm-accent-text); outline-offset: <档位>`，
  另叠苹果式 halo `box-shadow: var(--pm-focus-halo)`（halo 是装饰，不承担对比度）。
- **两档偏移**：**面状控件**（Tab、卡片、整块面板）用 `outline-offset: var(--pm-focus-offset-face)`
  = `-2px`（内偏移，不撑出额外方框、不挤动相邻元素）；**小控件**（按钮、胶囊、输入框）用
  `var(--pm-focus-offset-ctl)` = `+2px`（外偏移，环更清楚）。
- 颜色与背景对比：`#0071e3` on `#fff` = **4.70:1 ≥ 3:1**（浅深同判）。
- 只在**键盘路径**出现：用 `:focus-visible`；不可用时的回退是 `:focus` 但需在鼠标路径去环。
- **不引**宿主的 `--dsw-alias-state-business-primary`（它在宿主深色下是浅蓝 `#7aaaff`，浅色岛上对比不足）。
- **口径冲突登记**：FR-2 ② 写"文字级主色 `#2f5fd0`（5.72:1）"，FR-10 §8 写 `2px solid #0071e3`
  ——`#2f5fd0` 是 **D-5 之前**的取值，本次按裁决统一到 `#0071e3`（4.70:1）；**阈值 ≥3:1 不变**，
  FR-2 的**理由**（"不引宿主令牌"）也不变。
- 覆盖控件类（`grep -rc "focus-visible" src/client/styles/` 必须 ≥1 且覆盖全表）：
  `.dsh-pm-btn`、`.dsh-pm-tab`、`.dsh-pm-window`、`.dsh-pm-input`、`.dsh-pm-trunk-open`、
  `details.dsh-pm-fold > summary`，以及面板内的行内按钮（`.dsh-pm-doc-*` 一类的可点元素，实施时逐类点清）。
- **不引内层滚动**：焦点环不被 `overflow` 裁掉，也不被粘性元素盖住（FR-2 ③）。

### 4 字阶与字重（六档，`requirement.md` FR-12 A + FR-10 判据表） `serves: FR-7, FR-10, FR-12`

| 档 | 字号 / 行高（令牌） | 字重 | 典型用途（真源码类） | 归并来源（旧值 → 新值） |
|---|---|---|---|---|
| L0 | `--f-h1: 24px` / `--lh-h1: 1.25`（字距 `-0.4px`） | 600 | 页标题（`.dsh-pm-detail-title`） | `--f-h1: 21px` → `24px` |
| L1 | `--f-l1: 20px` / `--lh-l1: 25px`，数字 `tabular-nums` | 600 | 状态带主值（`.dsh-pm-report-band-body b`）、卡片内主值 | 20px（**新增槽位**，现有五槽不含它） |
| L2 | `--f-h2: 15px` / `--lh-h2: 22px` | 600 | 模块标题（`.dsh-pm-trunk-title`）、卡片标题 | `--f-h2: 13.5px` → `15px` |
| L3 | `--f-body: 13px` / `--lh-body: 20px`（照宿主 `--dsw-font-xs-13`） | 400 | 正文（`.dsh-pm-trunk-line`、`.dsh-pm-block-summary`、`.dsh-pm-msg-text` 等整段可读文本） | `--f-body: 13px` 不变 + 部分 `12.5px` 并入 |
| L4 | `--f-small: 12px` / `--lh-small: 16px` | 400 | 说明与细节、**状态带正文**、密集列表行（`.dsh-pm-doc-list li`） | `--f-small: 11.5px` → `12px`；`12.5px`（`report.ts` 共 18 处）并入 |
| L5 | `--f-tiny: 11px` / `--lh-tiny: 15px` | 400 / 500 | 元信息、标签、来源芯片（`.dsh-pm-trunk-src`、`.dsh-pm-doc-kind`、`.dsh-pm-stat-label`、`.dsh-pm-card-id`） | `--f-tiny: 10.5px` → `11px`；`9.5px` / `10px` 并入 |

> **字阶是"改既有槽位的值"，不是新开一族**：`--f-h1 / --f-h2 / --f-body / --f-small / --f-tiny`
> 五个名字**已存在**（`src/client/styles/report.ts:74`，现值 `21 / 13.5 / 13 / 11.5 / 10.5`），
> 本次只把它们**重定值**为 `24 / 15 / 13 / 12 / 11`，并新增 L1（`--f-l1: 20px`）与 `--lh-*` 一族。
> 这样"样式分片里只留令牌引用"（FR-7 #6）成立，且"阶外字号"变成**可 grep 的违规**
> （断言：分片内不出现裸 `font-size: <n>px`，白名单只有令牌定义处与 `--pm-mono` 一类）。

**必须消灭的旧字号**（`grep -n 'font-size' src/client/styles/report.ts` 在实施前后对照）：
`9.5px`（`:438` 来源标 / `:644` 文档种类 / `:721` 回填标）、`10px`（`:177` / `:267` / `:704`）、
`10.5px`（`--f-tiny`）、`11.5px`（`:317` / `:615` / `:633`）、`12.5px`（18 处）、`13.5px`（`--f-h2`）、
`21px`（`--f-h1`）。**真文字下限 11px**（基线实测最小 9.5px）——小于 11px 的**真文字**一律消灭。

**`12.5px` 的归并规则（本档定死，实施逐站点核；`requirement.md` 要求"由 `design/frontend.md` 定"）**：

- `.dsh-pm-report-band-body`（`report.ts:307`）→ **12px（L4）**。理由：它是状态带的"细节"档，
  不是模块正文；FR-12 H4 要求三格**三档**（标签 L5 11 / 主值 L1 20 / 细节 L4 12）且两两差 ≥2px。
- 其余 12.5px 站点按用途分：**整段可读正文**（`.dsh-pm-trunk-line` / `.dsh-pm-block-summary` /
  `.dsh-pm-msg-text` / `.dsh-pm-opt-sug` / `.dsh-pm-inj-verdict` / `.dsh-pm-np-iso-reason` 一类）
  → **13px（L3）**；**控件与密集列表行**（`.dsh-pm-doc-list li`、`.dsh-pm-sv-list`、按钮类、
  `.dsh-pm-outcome-verdict`）→ **12px（L4）**。
- 判据（探针新增）：详情页内**可见真文字**的最小计算 `font-size ≥ 11px`，且**无阶梯外字号**。
  **必须排除视觉隐藏节点**（零尺寸 / `clip-path` / `overflow:hidden` 的 `sr-only`）——FR-11 让
  主操作后果改走 `aria-describedby` 指向的视觉隐藏节点，它**当前实测 `10.5px`、`0×0`、`overflow:hidden`**
  （`.dsh-pm-action-consequence`）；不排除它，这条断言必然**假红**。二选一并在实施汇报里写明：
  ① 断言按可见性过滤；② 把那处 `sr-only` 的字号也提到 11px。

**行高六档（与字阶一一配对，`--lh-*`）**：`11→15`、`12→16`、`13→20`（宿主口径）、`15→22`、`20→25`、`24→30`（=1.25）；
密集表行可用 `1.35`。**字重只留 400 / 500 / 600**：消灭 `650`（`report.ts:383` / `:738` / `:901`）
与 `660`、正文里的 `700`（`:327` 的 `font-weight: 700` → 600）。
**口径冲突登记**：页标题字距 FR-12 A 写 `-0.4px`、FR-10 §9 写 `-0.2px`——本设计取 **`-0.4px`**
（FR-12 是人给的**核心**反馈 D-7 的落点，且 24px 比 20px 更需要收字距）。

**首屏预算不回退（硬判据）**：字号微调不得把 Tab 栏推出首屏——`tabsTop ≤ 713`（既有探针 A 组）；
状态带三格 ≤220px、操作条 ≤72px 一并保持。基线实测 1280 在途 579 / 终态 427、900 在途 583 / 终态 431，
D-8 拆两行后 900 在途 603（余量最紧 **110px**）——**不许把这 110px 用光**。

### 5 间距与分组（4/8 栅格 + FR-12 B 的 36px 模块距） `serves: FR-7, FR-10, FR-12`

| 位置 | 取值 | 令牌 | 说明 |
|---|---|---|---|
| 行内元素之间 | `4px` / `8px` | `--s1` / `--s2` | 出现的 `3px` / `6px` 一类裸值收敛到相邻档（如 `margin-bottom: 3px` → 4px） |
| 模块标题 ↔ 正文 | `8px` | `--s2` | FR-12 B |
| 卡片内块间 | `20px` | `--s5` | 状态带三格内部 |
| 模块**之间** | **`36px`** | `--pm-space-module`（新增） | FR-12 B 明写"模块**之间 36px**"（D-7 裁定，晚于 FR-7 的取值枚举） |
| 段之间（头部 / 状态带 / Tab 宿主） | 沿用现值 | — | 段间距不在本次收敛范围 |

硬要求：**模块间距 ÷ 模块内间距 ≥ 3**（`36 ÷ 8 = 4.5` ✓）。

> **令牌命名已定稿（同一件事不许两个名字）**：模块间距令牌**只有** `--pm-space-module` 这一个名字
> （取值 `36px`），其它拼法一律不使用——该名字已在 `interfaces.md` / `architecture.md` /
> `data-model.md` / `test-cases.md` 定稿，本份与之一致；它与本需求其它新增令牌同属 `--pm-*` 语义族
> （`--pm-icon` / `--pm-dur-*` / `--pm-ease` / `--pm-accent-text` / `--pm-focus-*`）。
> **H2 算式（自洽）**：模块间距 `36px` ÷ 模块内间距 `--s2` = `8px` → **4.5 ≥ 3** ✓
> （模块标题 ↔ 正文那 8px 就是模块内间距的最小档；全文凡引此比值处一律 `36 ÷ 8 = 4.5`）。
>
> **本档唯一的栅格例外（必须显式声明）**：FR-7 #3 把段间距写成**闭集枚举**
> "只允许 `4/8/12/16/20/28`（现有 `--s1..--s6` 即此集合）"，而 **36 ∉ 该集合**。
> 本次仍取 **36px**，理由：① FR-12（**更晚**的 D-7 裁定）明写"模块**之间 36px**"；
> ② `36 = 4 × 9` 仍在 **4px 栅格**上，只是不在 FR-7 列的那七个档里；③ H2 = `36 ÷ 8 = 4.5 ≥ 3`，
> 比取 28px（`28 ÷ 8 = 3.5`）留出更多余量。
> **口径差异已声明**：权威原型当前的 `proto-geometry` 记的是 `moduleGap@1280/inflight = 24`
> （`moduleInnerGap = 8`，比值恰好 **3.0**，**零余量**）——**实施按 36px 落地并重测**，
> H2 仍须 ≥3；`proto-geometry` 的那一行待出图脚本重跑后刷新（K7 卡在 `PROTO` 未指向 v3）。

每个模块**必须同时**具备"36px 模块间距"与"标题行"两个边界信号——**不许只靠一条 hairline**。

**模块结构改上下（FR-12 C）**：现版是"左 `150px` 标题栏 + 右内容"（`--rail: 150px` + `--gap-col: 22px`
的 grid，读起来像表格）→ 改成 ① 标题行（L2 标题 + 右侧来源 chip，L5 灰）② 正文（L3）
③ 可选引用行（L4 + `点开看原文 →` 主色文字级）。落点是 `.dsh-pm-trunk-item` 的
`grid-template-columns: 150px 1fr` → `1fr`（窄档 `@media (max-width: 1000px)` 里那条同款规则随之冗余，
可保留无害）；`.dsh-pm-trunk-head` / `.dsh-pm-trunk-title` / `.dsh-pm-trunk-sub` / `.dsh-pm-trunk-src` /
`.dsh-pm-trunk-body` / `.dsh-pm-trunk-open` 的字号按上表落档。

### 6 圆角、边线与阴影（FR-10 (三)） `serves: FR-10, FR-12`

- **圆角只两档**：`8px`（控件 / 卡片 / 输入框；把 `--r1: 6px` 与 `--r2: 10px` 都归到 `8px`）与
  `999px`（状态胶囊，`--pm-pill`）；**取消 4px / 6px**。
- **边线统一一档**：`.5px solid var(--pm-line)`（`#0000001a`）；需要更强分隔时用 `var(--pm-line-strong)`
  （`#00000029`）。取消彩色边线（红 35% / 橙 45% / 蓝实心）；`rgba(128,128,128,.20)` 与 `.11`
  两档灰线统一到一档（`--pm-line-soft` **删除**）。
- **内容页不用阴影**（只允许浮层）：取消卡片阴影（`--pm-shadow-card` 类用法在本页不再使用）。
- **操作条不再是灰底框**：并入头部成为一行，只留一条发丝分隔线（现状是"框里再套框"）。
- **胶囊只留两类**：① 状态胶囊 `.dsh-pm-status`（`999px`、`11px/500`、**无底色**，靠文字色区分状态）；
  ② 可点控件（按钮 / 输入框：`8px` 圆角 + 发丝边）。其余全部去胶囊——元信息（分类 / 难度 / 窗口）
  改**纯文本 + `·` 分隔**；Tab 计数改**纯数字无底**；阶段点是**进度条**不是胶囊（保持 4px 条形）。
  **计数数字用 `--pm-text2`（5.07:1）而不是三级灰**——`#86868b` 只有 3.62:1，而计数是**真文字**。
- **底色只两档**：白（`--pm-surface`）+ `#f5f5f7`（`--pm-bg-soft`，分组底）。头部 / 操作条 / 评论**不加底色**。
- **分组底只用于状态带**；`--pm-bg-softer` 一类中间档并入。

### 7 动效与 reduced-motion（FR-6） `serves: FR-6, FR-10`

- **令牌单点**：在 `.dsh-pm-detail[data-report-shell]` 上定义 `--pm-dur-fast: 80ms`、
  `--pm-dur: 120ms`、`--pm-dur-slow: 150ms`、`--pm-ease: cubic-bezier(.2, .8, .2, 1)`；
  规则里**不写裸 `ms`**（静态断言：分片内 `transition` 的时长取值全部来自 `var(--pm-dur`）。
- **过渡只动颜色 / 边框 / 透明度 / 阴影**：`color` / `background-color` / `border-color` / `opacity` /
  `box-shadow`；**不动几何**（不改宽高、不位移）——避免布局抖动，也保证几何量在动效前后一致。
- **覆盖的交互态**：可点控件（`.dsh-pm-btn` / `.dsh-pm-tab` / `.dsh-pm-window` / `.dsh-pm-trunk-open` /
  `details.dsh-pm-fold > summary` / `.dsh-pm-input`）的 hover / active / focus。
- **尊重"减少动态效果"**：`@media (prefers-reduced-motion: reduce)` 下把时长令牌归零
  （`--pm-dur-fast / --pm-dur / --pm-dur-slow: 0s`）并关闭非必要动画 → **终态直接可读**
  （不是"变慢"，是不动）。用纯 CSS 媒体查询实现，不引运行时检测。
- 基线：`report` 分片 `transition` 与 `prefers-reduced-motion` 命中数**都是 0**（本机
  `grep -c` 实测）——本次是**从 0 到 1**；新增的每一条过渡都必须带令牌时长。

### 8 响应式 `serves: FR-5, FR-7, FR-9`

- **不新增断点**：沿用既有 `@media (max-width: 1000px)`（`src/client/styles/report.ts:944`）；
  窄档只收间距与"补充说明"的呈现，**不换视觉语言、不加内层滚动**、不给高度上限。
- 两档实测口径（出图与探针）：**1280** 与 **900**（`--window-size=W,800`，实测视口高 713）。
- 具体到本次：目标尺寸加高（窗口胶囊 → 24 高）、字号提到 11/12px 后，仍须 `tabsTop ≤ 713`
  （900 在途现 603，余量 110px）；缺口条在窄档仍**一条一行**（不折行顶爆首屏）；
  D-8 拆两行后 900 档身份行会多换一行，`tabsTop@900/inflight` 由 577 → 603（硬判据仍过）。

### 9 不做什么（与需求「边界」一致） `serves: FR-1, FR-4, FR-8, FR-13`

- 不改 `data-*` 面板契约与 `data-action` 写路径；不新增 / 不删除 Tab；不动六个面板的取数与结构。
- 不引入内层滚动（分片内**不出现** `overflow` 的 `auto` / `scroll` 取值），不加高度上限。
- 不动其它样式分片（`base.ts` / `board.ts` / `detail.ts` / `node-panel.ts` / `dag.ts` …）——包括
  "把插件级假令牌接回官方令牌"这件事（K1 / K3，426 处）。
- 不改看板其它页面（泳道 / 列表 / 甘特 / 侧栏 / 设置 / toolviews 卡片图标、`PM_TOOL_BADGE` 的 `📋`、
  卡面 `🪙` 徽章）——它们是**别的页面**的图标。
- **不改状态符号**（`✅ 成功` / `⚠️` / `🔴` 这类）：它们是"颜色之外的第二判据"，换掉反而破坏 FR-8；
  但缺口严重度的 emoji 圆点要换成**不依赖字体的圆形**（CSS 或 `aria-hidden` 的 SVG）+ 文本标记。
- `report.ts` 的 `--pm-*` 定义块内不得再引 `--dsw-alias-label-tertiary` 与 `--dsw-text-primary` /
  `-text-secondary` / `--dsw-accent` / `--dsw-bg-primary`；若其它位置仍引 `--dsw-*`，逐处登记理由。

## 依赖与第三方库 `serves: FR-1, FR-10`

**新增 npm 依赖：0 个。** 本次改动全部用既有能力（纯字符串渲染 + 单一样式分片 + 内联 SVG 字符串常量）。

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| （无新增） | — | — | 图标以**字符串常量内联**在 `src/client/icons.ts`：与全仓"纯字符串渲染"一致、零运行时依赖、零网络资源。**不装图标库**（多一个包 + 多一份 tree-shaking 不确定性）、**不用 icon font**（跨平台字型不一致、不受 `color` 控制——正是 FR-1 要除掉的毛病） |
| 既有：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` | — | 全页字体栈 | 沿用 `report.ts` 现值：宿主本身就是苹果那一套（D-5 的取值依据是**宿主令牌**，不是"我觉得像苹果"） |
| 既有：`--pm-mono: ui-monospace, SFMono-Regular, Menlo, monospace` | — | 需求 id、路径、窗口码 | 沿用现值；等宽处不改字体 |

## 关键决策与取舍 `serves: FR-3, FR-4, FR-9, FR-10, FR-12, FR-13`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 宿主深色主题 | 本次把 426 处假令牌全接回官方令牌（插件级跟随主题） | 详情页钉成诚实的**浅色岛** | D-3 裁定原文「A. 本次只做详情页（浅色岛，改动面小，推荐）」；426 处 × 11 个分片风险不成比例 |
| 主色要不要分"面 / 文字"两级 | 保留 FR-4 的两级（面 `#0071e3` / 文字 `#2f5fd0` 5.72:1） | **一个值**：`--pm-accent` = `--pm-accent-text` = `#0071e3`（4.70:1） | FR-10（D-5 之后）把强调色定成**唯一**，且它对文字 4.70:1 ≥4.5 **已达标**→ 不必分；FR-7 #1 明写"取值以 FR-10 为准"；`--pm-accent-text` 名字保留（契约表已声明，是将来再分级的单点）。H5「主色文字 ≤1 类」= 1 |
| 三级灰怎么分 | ① 让 `--pm-text3` 承载真文字（`#86868b` 3.62:1 不达标；FR-4 的 `#61666b` 5.80:1 是 D-5 前取值）② 干脆取消 `#86868b` | `--pm-text3: #86868b` **只做非文本**（图标 / 装饰 / 未激活描边）；真文字一律用 `--pm-text` / `--pm-text2` | FR-10 #1「三级色只留给非文本（图标 / 装饰线）」；② 图标与装饰需要它，且它与宿主 tertiary 同值（D-5 的证据链）。**代价已登记**：真文字承载色只剩两档（与 FR-7 #4"三档文字色"的字面表述有差异） |
| `12.5px` 归 12 还是 13 | ① 一律归 12 ② 一律归 13 | **按用途分**（细节 → 12，整段正文 → 13） | ① 让模块正文比原来更小且与 L3 语义冲突；② 状态带三格会变成 11/20/13，三格更重、白吃首屏预算 |
| 焦点环颜色 | 保留 FR-2 ② 的"文字级 `#2f5fd0`（5.72:1）" | `--pm-accent-text`（= `#0071e3`，4.70:1） | 与"单强调色"同源（C1 裁定的直接后果）；`#2f5fd0` 是 D-5 之前的取值；**阈值 ≥3:1 不变**，FR-2 "不引宿主令牌"的理由也不变 |
| 危险 / 警告色 | FR-4 的 `#dc3545`（4.53:1）/ `#a86a00`（4.44:1，差 0.06 不达标） | FR-10 定稿的 `#d70015`（5.38:1）/ `#c93400`（5.28:1） | FR-10 是"逐值定死、全部按 WCAG 核过"的色板定稿表；且与 D-5 的苹果色板同源；余量从 <5% 提到 ~20% |
| 页标题字距 | `-0.2px`（FR-10 §9） | `-0.4px`（FR-12 A） | FR-12 是人给的**核心**反馈（D-7）的落点；24px 比 20px 更需要收字距 |
| 模块间距取 36 还是 28 | `--s6` 的 `28px`（落在 FR-7 #3 的闭集里，H2 = 3.5）；或原型的 `24px`（比值恰好 3.0，零余量） | **`36px`**（新增 `--pm-space-module`） | FR-12（更晚的 D-7 裁定）明写"模块**之间 36px**"；`36 = 4×9` 仍在 4px 栅格上；H2 = `36÷8 = 4.5 ≥ 3`。**已显式声明**：这是 FR-7 #3 闭集枚举的唯一例外；原型的 `moduleGap=24` 与之的差异**由实施按 36 落地并重测**（§5） |
| reduced-motion 怎么实现 | JS 检测 `matchMedia` 后切换类名 | **纯 CSS 媒体查询** | 无运行时状态副本、无 SSR 差异、探针可直接读计算样式（判据量的是计算样式） |
| D-8 的头部拆行手段 | 纯 CSS（`.dsh-pm-rh-top{display:contents}` + `order`） | **DOM 改动**（`report-head.ts` 把窗口组移进身份行） | 判据量结果不量手段；而 DOM 层本次**已是必改面**（FR-11 删两个节点、FR-13 删评论框），顺手改归属不增加风险；`display:contents` 在可访问性树上有历史缺陷 |
| 状态标记落在哪 | CSS `::before`（原型做法，受"只换 CSS 层"约束） | **真实文本节点 / `aria-hidden` 的 SVG** | `::before` 的内容读屏不保证读到；FR-8 #5 是硬约束 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-11, FR-12`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| （无新增 npm） | — | — | 见「依赖与第三方库」节：内联 SVG 字符串 + 既有纯字符串渲染 |
| 既有：`scripts/req-report-probe.mts` | — | 四组合硬判据 + 本次新增的可访问性断言组 | 既有判据与退出码语义（0/1/2）已在此，新判据必须同批同脚本，避免"两套探针两套真相" |
| 既有：headless Chrome 出图脚本 | — | before/after 与几何观测 | 与 `evidence/ui-before-*.png` 同脚本同 window-size 才可比（改后脚本需先把 `PROTO` 指向 v3，K7） |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| src/client/icons.ts | 图标族唯一源（六个 Tab 图标 + 全族常量）；纯导出、零副作用 |
| src/client/views/report-tabs.ts | Tab 栏 ARIA / roving tabindex / 键盘；面板宿主 `role=tabpanel` |
| src/client/views/report-head.ts | 两行头部、操作条动作与文案、`sr-only` 后果、评论只读列表（删输入框） |
| src/client/views/report-band.ts | 状态带三格与缺口行的非颜色标记 |
| src/client/views/stage-detail.ts | 阶段条三态前缀 |
| src/client/styles/report.ts | 唯一外观源：令牌 / 字阶 / 间距 / 焦点环 / 动效 / reduced-motion |
| scripts/req-detail-ui-contrast.mts（新增） | 对比度报表（含组合背景与反白），读令牌声明而非复制值 |

**设计模式**：**未引入新模式**。沿用既有的两个：① **注册表**（`REPORT_TABS: ReportTabDef[]` ——
一个 Tab 一条定义，`render` / `badge` / `degraded` 各自实现）；② **控制器 + 分段替换**
（`createReportShell` 把头部 / 状态带 / Tab 栏 / 面板四段分别替换，符号级不整页 `innerHTML`）。
本次只在这些渲染函数的**输出**上加属性与改样式。

**关键实现手法**（非显然的几处，以及为什么这么做）：

1. **令牌单点**：颜色 / 字号 / 间距 / 时长 / 缓动全部在 `.dsh-pm-detail[data-report-shell]` 上定义，
   规则里只引 `var(--pm-*)`；"改一处、全页生效"是这次能收敛的前提（否则又是"每个控件各写一套"）。
2. **图标族常量**：`viewBox="0 0 16 16"` / `stroke-width="1.5"` / `stroke="currentColor"` / `fill="none"`
   是全族常量，不是每个图标各写一套；颜色交给 `currentColor`（选中态由 `.dsh-pm-tab.active` 的
   `color` 决定，图标不需要自己的配色规则）。
3. **ARIA 加法式扩展、且属性追加在既有属性之后**：既有断言按**属性顺序**做子串匹配——
   `tests/report-shell.test.ts:138` 匹配 `'class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"'`。
   新增的 `role` / `aria-*` / `tabindex` / `id` 必须**追加在既有属性之后**（保住子串），或同步改该断言；
   二选一，实施汇报里必须写明选了哪个。
4. **`aria-controls` 用稳定 id 而非"当下存在的节点"**：`panel-<key>` 在未激活时**不在 DOM**
   （懒加载与"只渲染一个面板"是既有不变量），故 `aria-controls` 只声明 id，面板挂载时再带上同 id
   ——这样既满足 Tab 语义，又不回退 A4 断言。
5. **非颜色标记落成真实节点**：阶段条 `✓` / `▸`、缺口 `!!` / `!` / `·`、结论 `✓` / `↺` / `…`
   一律是**文本节点**或 `aria-hidden` 的 SVG（不是 `::before`），读屏可读、灰度可辨。

**攻克的难点**：

- **"加 ARIA" 与 "未激活面板不在 DOM" 的冲突**：解法见上第 4 条（稳定 id + 挂载时补齐）。
- **"字号提下限 / 目标加高" 与 "首屏预算 ≤713" 的冲突**：解法是把高度从**行高、字距、内边距**里
  挣回来（而不是给容器加高度上限或内层滚动）；实测余量最紧 110px（900 在途 603），
  并保留"操作条 ≤72px / 状态带三格 ≤220px"两条既有上限。
- **"外观收敛" 与 "不许碰旧分片" 的冲突**：报告页与旧详情页**共用类名**，解法是靠
  `.dsh-pm-detail[data-report-shell]` 前缀把特异性提到旧规则之上，旧分片一个字不改（C-05 的归属章纪律）。
- **判据可信度**：本机 headless Chrome 的 `prefers-reduced-motion` 恒为 reduce（量不到"非 reduce 下的过渡"）
  → 拆判据（计算样式 / CSS 文本静态），**不放宽阈值**，并在实施汇报里写明"哪条量到了、哪条只是读出来的"。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 结构图标 | emoji 或图标库 | `src/client/icons.ts` 内联 SVG 字符串常量，全族常量 + `currentColor` + `aria-hidden` | emoji 字型由系统决定、不受 `color` 与主题令牌控制、无法统一线条风格 | `src/client/icons.ts`；`grep -rnE "[📋📄🕸💬🪙🧱]" src/client/views/report-tabs.ts src/client/views/panels/` 结构位归零 |
| 主题口径 | "跟随宿主主题" | **明确浅色岛**：全部令牌取浅色原值，不引宿主主题敏感令牌，并删掉"跟随主题"的错误声称 | 页面表面本来就是白的，跟宿主翻转只会白底浅字（宿主深色下 2.13:1） | `src/client/styles/report.ts` 令牌块 + `:962` 覆盖块删除；`?theme=dark&v=next` 与浅色档出图 sha256 相同 |
| 对比度 | 目测 / 只算"深字压白底" | 报表按 WCAG 公式机算**全表**（含组合背景 + 反白关系），脚本读令牌声明 | 主按钮那条、芯片那三条都是"只算深字压白底"漏掉的 | `scripts/req-detail-ui-contrast.mts`（新增）；`evidence/contrast-baseline.txt` |
| 焦点 | 浏览器默认 | 统一 `:focus-visible` 焦点环，**两档偏移**（面状 -2px / 小控件 +2px） | 面状控件外偏移会撑出方框、挤动相邻元素；小控件内偏移看不清 | `src/client/styles/report.ts`；探针断言 `outlineWidth ≥ 2px` 且与背景 ≥3:1 |
| 动效 | 每个控件各写时长（或 150–300ms 通用值） | 详情页根上单点令牌 80–150ms + reduced-motion 归零 | 规范要"共享令牌"且明确反对把 150–300ms 当普适要求 | `report.ts` 分片；`grep` 无裸 `ms`；`@media (prefers-reduced-motion: reduce)` 在场 |
| 状态表达 | 只用颜色 | 颜色 + 图形 + 文本标记三通道 | 红绿不能只靠颜色；灰度下仍须可辨 | `report-band.ts` / `stage-detail.ts`；灰度截图人工评审落 `evidence/` |
| 视觉语言 | 打补丁（哪儿乱改哪儿） | 七项多样性**可测上限**（胶囊 / 前景 / 底色 / 字重 / 字号 / 圆角 / 边线） | 分歧靠规则收敛（D-1、D-5） | `evidence/style-variety-before-after.txt`；出图脚本复测表 |

## 已知缺口与未收敛项 `serves: FR-7, FR-11, FR-13`

> 本节是**响亮失败**的落点：下列各项**本次未完成 / 未收敛**，实施阶段必须逐条处置。
> 不许把"原型里看起来是那样"当成"已经验过"。

| # | 缺口 | 证据 / 现状（可复核） | 实施必须做什么 |
|---|---|---|---|
| 1 | **K7 · 出图 / 几何脚本仍指向被取代的 v2** | `scripts/req-detail-ui-prototype-shot.mts:55` 的 `PROTO` 常量是 v2；而 v3 有「布局修复层 v2」「状态带三格重做」与 `id="FR-13"` 锚点，v2 三者皆无 | **先**把 `PROTO` 指向 v3 并跑一次；若三条断言（含"内联壳与 `buildReportShell` 逐字节一致"）报错，说明 v3 的壳被人手改过 → 修 v3 或把断言改为"只允许已声明的偏差"。**不许**把"脚本能跑"当成过 |
| 2 | **K8 · `?v=current` 不是改前外观** | 文件里**没有任何** `[data-proto-v]` CSS 选择器（命中的 3 处全是说明文字）；实测 `?v=current` 与 `?v=next` 的头部矩形逐项相同，七项多样性也逐项相同 | 二选一：① 给整块改造层补 `[data-proto-v="next"]` 门控让自述成真；② 把两张复测表的「改前」列与 evidence 方法说明改标为"人给的历史快照"，并同步改脚本 `[2c]` 段的基线断言。**不许继续声称** `?v=current` = 改前 |
| 3 | **状态带正文实测 12.5px，尚未收敛** | `src/client/styles/report.ts:307`（`.dsh-pm-report-band-body`）；该文件共 **18 处** 12.5px；原型壳内实测 8 档字号（`10.5/11/12/12.5/13/15/20/24`），其中 `12.5` 是阶梯外**可见真文字** | 按本份「字阶」节的归并规则逐站点落 **12 或 13**；探针断言"**无阶梯外字号**"，且断言须按可见性**排除 sr-only**（见该节末条） |
| 4 | **两处只是 CSS 隐藏，DOM 节点仍在** | `.dsh-pm-action-bar-label`（`report-head.ts:196`）与 `.dsh-pm-action-consequence`（`:178`）在原型里实测 `0×0`、`overflow:hidden`，节点仍在；原型 `proto-geometry` 如实记着 `commentFormsInPage = 1` | 实施必须**真删 DOM**（`report-head.ts`）：删操作条那一处 label（**同名 class 在评论列表 `report-head.ts:338` 还在用，不许顺手删**）、删常驻后果节点并加 `sr-only` + `aria-describedby`；断言按**产物不出现**判（DOM 断言，不是字符串 grep）。日志标签在两处：`tests/report-shell.test.ts:219` 与 `tests/report-firstscreen-gaps.test.ts:447/450-457`，其中两处**不用改**（如实记，不虚报改动面） |
| 5 | **原型标本只渲染 trunk 面板** | `docs / dag / dialogue / token / prompts` 五块不在标本 DOM 里 | 那五块的 FR-5 目标尺寸 / FR-7 字阶 / FR-1 面板内结构位 emoji 三判据，须接真页面（或扩标本）后**补测**（验收标准 #4c）；实施汇报里分清"哪条量到了、哪条只是读出来的" |
| 6 | **FR-6 的"非 reduce 下不是瞬变"本机量不到** | 本机 headless Chrome 的 `prefers-reduced-motion` 恒为 reduce（`--force-prefers-reduced-motion=no-preference` 压不住）→ 计算样式恒为 0s | FR-6 ④ 用**计算样式**断言；FR-6 ①②③（共享令牌 / 无裸 ms / 只动颜色不动几何）用 **CSS 文本静态**断言；**不放宽阈值**，脚本里写明口径 |
| 7 | **FR-9 的"贴行尾"口径已被 D-7 / D-8 修订** | FR-9 原文第 3 / 5 项与「历史实测」表是 **D-4 时期**机制（`margin-left:auto` 推行尾、`markerLeft - dangerRight === 12`） | 验收以 FR-9 **第 7 项** + **D-8 三条**（`actionRowTop < identityRowTop`；两行差 ≥8px；`windowLeft < createdAtLeft`）+ 动作仍同一行（`offsetTop` 单值）+ 整块高 ≤72px 为准；`markerLeft - dangerRight` **不再作为 D-8 之后的判据** |
| 8 | **FR-8 的标记在原型里是 `::before`** | 受原型"只换 CSS 层"约束，`::before` 内容读屏不保证读到 | 实施落成**真实文本节点**或 `aria-hidden` 的 SVG + 可访问名（FR-8 #5，硬约束） |
| 9 | **对比度报表尚未成为脚本** | 基线 `evidence/contrast-baseline.txt` 是按 WCAG 公式算出的现状全表（含豁免登记） | 实施时做成 `scripts/` 下的正式脚本（把"本次改为"三行当验收目标），并覆盖组合背景与反白关系 |
