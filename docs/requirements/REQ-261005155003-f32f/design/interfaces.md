# 接口设计（REQ-261005155003-f32f）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13 -->

> 本份只回答一个问题：**改完之后，谁跟谁之间的约定变了**。
> 结论：**对外接口与数据形状零变更**（`requirement.md:638-654` 的「接口与数据契约」逐条成立）；
> 真正新增的只有两件**加法**的东西——一个新客户端模块的**导出签名**，
> 与一批**只加不改**的 DOM 属性 / CSS 令牌。除此之外的一切都在「冻结面」里逐条列明。
> 真相源：`requirement.md` §接口与数据契约（L638-L654）、§边界（L669-L684）、§验收标准（L790-L803）。
> 原型锚点一律指向 `prototypes/detail-ui-v3.html#FR-N`（权威原型见 `prototypes/INDEX.md`）。

## 变更面总览 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13`

| # | 面 | 状态 | 内容 | 依据 |
|---|---|---|---|---|
| ① | `src/client/icons.ts` | **新增** | 纯导出（`TAB_ICON_SVG` / `GAP_DOT_SVG`）：内联 SVG 字符串常量，无运行时依赖、无副作用 | `requirement.md:647`、FR-1 #5 |
| ② | DOM 可访问性属性 | **加法式** | `role` / `aria-selected` / `aria-controls` / `aria-labelledby` / `aria-describedby` / `aria-label` / `tabindex` / 稳定 `id`——**追加在既有属性之后**，旧调用方忽略即无感 | `requirement.md:648`、FR-3、FR-11 |
| ③ | DOM 结构位图标内容 | **换实现不换契约** | `.dsh-pm-tab-icon` 的**文本内容**（emoji）换成 `<svg>`；元素名、class、位置、数量一律不变 | FR-1、`prototypes/detail-ui-v3.html#FR-1` |
| ④ | DOM 删除项 | **删除** | 头部评论表单（`.dsh-pm-comment-form` + `data-role="comment-input"` + `data-action="add-comment"` 那一处）、操作条分组标签 `.dsh-pm-action-bar-label`（操作条那一处）、常驻后果节点 | FR-11、FR-13（详见「删除的接口」） |
| ⑤ | DOM 位移（**已声明，唯一一处**） | **结构变更** | `.dsh-pm-report-windows` 的**容器归属**：移入身份行 `.dsh-pm-rh-top`（D-8）。文本与属性一字不动，只有父容器变 | D-8（`requirement.md:787`）、`requirement.md:688-694` |
| ⑥ | CSS 令牌 | **加法式 + 取值收窄** | 新增 `--pm-icon*` / `--pm-dur-*` / `--pm-ease` / `--pm-accent-text` / `--pm-focus-*` / `--lh-*` / `--f-l1`；**取值来源收窄**：`report.ts` 的 `--pm-*` 从"引宿主主题变量"改为"页面自持浅色原值" | `requirement.md:649-650`、FR-4、FR-10 |
| ⑦ | CSS 覆盖块 | **删除** | `[data-ds-dark-theme] .dsh-pm-detail[data-report-shell] { … }`（`src/client/styles/report.ts:962-966`）——白岛上的"半个主题"残留 | FR-4 #3、`requirement.md:651` |
| ⑧ | HTTP API / 信封 / 写路径 | **冻结，零变更** | 六条只读端点、`PanelResult`/`Degrade`、`data-action` 通道一律不动 | `requirement.md:644-646` |

**变更面的三条纪律**（违反任一条即视为接口破坏）：

1. **只加不删不改序**：新增属性必须**追加**在既有属性之后（硬耦合见「已知耦合与实施约束」①）；
2. **加法式的判据**：删掉本需求的全部新增属性后，产物应当回到"能过既有全部断言"的状态——这是"加法式"的可证伪定义；
3. **不碰数据面**：本需求不新增字段、不改枚举、不改服务端字符串（`label` / `consequence` / `verdictLine` 一字不改，`requirement.md:680-682`）。

## 新增/修改的工具接口 `serves: FR-1`

**本次不新增、不修改任何 Agent 工具接口。** 逐条说明为什么这里是"无"（而不是漏写）：

| 可能的工具面 | 本需求是否触及 | 依据 |
|---|---|---|
| `reqboard_*` 工具 | 否 | 纯前端外观层，无台账/门禁语义变化 |
| Accept / 验收单工具 | 否 | 不改验收规则，只改页面外观 |
| 新增 CLI 脚本 | **是（但不是"工具接口"）** | 对比度报表脚本与探针断言属**产物**，不是对外接口；脚本契约见 `test-cases.md` 的「探针与出图命令」 |
| 六条只读 HTTP 端点 | 否（冻结） | `requirement.md:644` |

新增的是**客户端模块导出**（下节）——它只被 `src/client/**` 内的渲染函数 import，不进宿主 Service/Event 面，
也不被任何工具 schema 描述。

## 新增的模块导出接口：`src/client/icons.ts` `serves: FR-1, FR-8`

### 用途与调用方 `serves: FR-1, FR-8`

**用途**：详情页里**承担结构语义**的图标与**不依赖字体的圆点**的**唯一来源**——
六个 Tab 图标（FR-1）、面板内重复 Tab 图标的结构位（`panels/prompts.ts:282` 的 `🧱 A · 固定系统提示词`）、
缺口严重度圆点（FR-8 #2）。落成字符串常量而不是组件/图标库，理由见「关键决策与取舍」。

**调用方**：`src/client/views/report-tabs.ts#buildTabBar`（Tab 栏）、`src/client/views/panels/prompts.ts`（面板结构位）、
`src/client/views/report-band.ts`（缺口严重度圆点）。**没有别的调用方**；不导出给宿主、不注册到任何 Service。

### 接口定义 `serves: FR-1, FR-8`

```typescript
import type { ReportTabKey } from './views/report-tabs.js'

/**
 * 六个 Tab 的结构图标：值 = **完整的内联 SVG 字符串**，可直接拼进 HTML。
 * 全族常量（不逐图标重写）：viewBox="0 0 16 16" · fill="none" · stroke="currentColor"
 * · stroke-width="1.5" · stroke-linecap="round" · stroke-linejoin="round" · aria-hidden="true"。
 * 字符串内**不含** width/height/class/style/颜色字面量（尺寸与颜色一律由 CSS 令牌与 currentColor 决定）。
 */
export const TAB_ICON_SVG: Record<ReportTabKey, string>

/**
 * 缺口严重度圆点（FR-8 #2：把 emoji 🔴/🟡/⚪ 换成不依赖字体的圆）。
 * 语义与配色仍由 severity 决定（颜色承载严重度），**文本标记 `!!` / `!` / `·` 不在本模块**——
 * 它们是真实文本节点，由 `report-band.ts` 渲染（FR-8 #5：不许只做 CSS 伪元素）。
 */
export const GAP_DOT_SVG: Record<'red' | 'yellow' | 'gray', string>
```

**参数说明**：本模块无函数参数（纯查表）。键的全体由既有 `ReportTabKey`（`report-tabs.ts:40`）与
`ReportGap['severity']`（`report-band.ts:25`）决定，**不新增键**。

**返回值说明**：

| 导出 | 键 | 返回 | 说明 |
|---|---|---|---|
| `TAB_ICON_SVG` | `trunk` / `docs` / `dag` / `dialogue` / `token` / `prompts` | `string` | 恰好 1 个 `<svg … aria-hidden="true"` 的完整标签 |
| `GAP_DOT_SVG` | `red` / `yellow` / `gray` | `string` | 同上；圆由 `currentColor` 上色，不写颜色字面量 |

**异常情况**：**本模块不抛异常**（`Record` 查表，未知键返回 `undefined`）。回落责任在调用方，
且**既有调用方已经具备回落**：

| 调用方 | 现有回落 | 位置 |
|---|---|---|
| `buildTabBar` | `defOf(key)` 未知键回落第一个注册项 | `report-tabs.ts:91-93` |
| 缺口圆点 | `GAP_DOT[severity] ?? '⚪'` → 改为 `GAP_DOT_SVG[severity] ?? GAP_DOT_SVG.gray` | `report-band.ts:149` |

理由（写进验收）：渲染路径上的异常会整块白屏，图标这种"装饰性"资产**绝不允许**成为抛点。

**使用示例**：

```typescript
// report-tabs.ts#buildTabBar（改动后）
import { TAB_ICON_SVG } from '../icons.js'
…
+ '<span class="dsh-pm-tab-icon" data-proto-icon-before="' + TAB_ICONS[def.key] + '">'
+ TAB_ICON_SVG[def.key] + '</span>'
// 属性顺序注意：新增属性（role/aria-*）追加在既有属性之后，见「已知耦合」①
```

> **尺寸令牌与 SVG 的分工**：SVG 字符串**不带** `width`/`height`；14px / 12px 由 CSS 令牌
> `--pm-icon` / `--pm-icon-sm` 施加在 `.dsh-pm-tab-icon` / 行内图标位上（FR-1 #2：
> "图标尺寸只允许两档，不出现第三种"）。这样"尺寸只有两档"是**可 grep 的令牌事实**，不是逐图标的自觉。

## 加法式 DOM 属性契约 `serves: FR-2, FR-3, FR-5, FR-8, FR-11`

### 三条写法规则 `serves: FR-2, FR-3, FR-5, FR-8, FR-11`

| 规则 | 内容 | 理由 |
|---|---|---|
| **R1 追加式** | 新增属性**必须写在既有属性之后**（`class` → `data-action` → `data-tab` → 新属性） | `tests/report-shell.test.ts:138` 按**属性顺序**做子串匹配（硬耦合①）；属性顺序是本次唯一"能悄悄弄红既有测试"的地方 |
| **R2 稳定 id** | `id` 只允许 `tab-<key>` 与 `panel-<key>` 两种形态；**id 是声明**，不要求目标当下在 DOM 里 | FR-3 #5：未激活面板不在 DOM（懒加载纪律），但 `aria-controls` 必须指向一个**稳定**名字 |
| **R3 只描述、不驱动** | 新属性**不得**成为任何行为/取数的判据（不许出现 `[aria-selected="true"]` 驱动切 Tab 的选择器） | 行为仍由既有 `data-action="switch-tab"` + `data-tab` 决定（写路径冻结） |

### 属性表 `serves: FR-2, FR-3, FR-5, FR-8, FR-11`

| 元素（选择器） | 新增属性 | 取值 | 服务于 | 锚点 |
|---|---|---|---|---|
| `.dsh-pm-tabs[data-report-tabs]` | `role` / `aria-label` | `"tablist"` / `"需求详情分区"` | FR-3 #1 | `prototypes/detail-ui-v3.html#FR-3` |
| `.dsh-pm-tab`（每个） | `role` | `"tab"` | FR-3 #2 | 同上 |
| 同上 | `aria-selected` | 选中 `"true"`（**恰 1 个**）、其余 `"false"` | FR-3 #2 | 同上 |
| 同上 | `aria-controls` | `"panel-<key>"`（稳定 id） | FR-3 #2 / R2 | 同上 |
| 同上 | `id` | `"tab-<key>"` | FR-3 #2 | 同上 |
| 同上 | `tabindex` | 选中 `"0"`、其余 `"-1"`（roving） | FR-3 #3 | 同上 |
| `.dsh-pm-tab-panel[data-tab-host]` | `role` / `id` / `aria-labelledby` | `"tabpanel"` / `"panel-<key>"` / `"tab-<key>"` | FR-3 #2 | 同上 |
| 主操作按钮（`data-action-rank="primary"`） | `aria-describedby` | `"<id of sr-only 节点>"`，节点文本 **=== 服务端 `consequence`** | FR-11 #2 | `#FR-11` |
| 常驻后果节点（视觉隐藏） | `class="dsh-pm-action-consequence dsh-pm-sr-only"`（保留原名、加 sr-only） | 文本 === 服务端 `consequence`；`title` 仍在按钮上 | FR-11 #2 | 同上 |
| `.dsh-pm-progress-dots` 三态 | 无新增属性；**新增真实文本/`aria-hidden` SVG 子节点**（`✓` / `▸` / 无） | 文本节点，非 `::before` | FR-8 #1、#5 | `#FR-8` |
| 缺口行 `.dsh-pm-gap-what` | 无新增属性；**新增文本标记** `!!` / `!` / `·` + `GAP_DOT_SVG` | 文本 + `aria-hidden` SVG | FR-8 #2 | 同上 |
| 验收结论（pass / rework / pending） | 无新增属性；**新增字形符号** `✓` / `↺` / `…`（配可见文字或 `aria-label`） | 文本级元素 | FR-8 #3 | 同上 |
| 焦点（无新属性） | 无——焦点环是**纯 CSS**（`:focus-visible`），不加 `tabindex`、不加节点 | FR-2 | `#FR-2` |
| 目标尺寸（FR-5） | **不得新增可聚焦节点**；命中区靠 `padding` 或 `::after` 伪元素扩大 | FR-5 #3 | `#FR-5` |

### FR-5 的"接口级"约束（为什么它出现在接口文档里） `serves: FR-3, FR-5`

FR-5 的判据量的是 `getBoundingClientRect()` = **命中区**，不是视觉框。实现手段不设限，但有两条**契约级**红线：

1. **不许靠新增可聚焦元素**（外层再包一个 `<button>`）来凑尺寸——那会让 Tab 数量、`aria-selected` 计数、
   焦点顺序全部漂移（FR-3 的断言会跟着红）；正确手段是给既有元素加内边距或 `::after` 命中区；
2. **不许新增 `data-*`** 来表达"这是命中区"（`data-*` 面板契约冻结）——CSS 类名可以新增，`data-*` 不行。

## 加法式 CSS 令牌契约（`--pm-*`） `serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-10, FR-12`

**作用域一律是页面根节点**（`.dsh-pm-detail[data-report-shell]`，`report.ts:62`）——
不写进 `:root`，不污染插件其它页面（边界第 3 条：其它样式分片一行不改）。

### 新增令牌 `serves: FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-10, FR-12`

| 令牌 | 值 | 服务于 | 说明 |
|---|---|---|---|
| `--pm-icon` | `14px` | FR-1 | Tab 栏图标尺寸（唯一两档之一） |
| `--pm-icon-sm` | `12px` | FR-1 | 行内图标尺寸（唯一两档之二） |
| `--pm-accent-text` | `var(--pm-accent)`（= `#0071e3`） | FR-2、FR-4、FR-12 | **文字级主色的语义槽位**。焦点环、选中 Tab、链接、人名、"点开看原文"用它 |
| `--pm-focus-ring-w` | `2px` | FR-2 | 焦点环宽度（FR-2 #2：2px 实线） |
| `--pm-focus-offset-face` | `-2px` | FR-2 | 面状控件（Tab / 卡片 / 整块面板）内偏移 |
| `--pm-focus-offset-ctl` | `2px` | FR-2 | 小控件（按钮 / 胶囊 / 输入框）外偏移 |
| `--pm-focus-halo` | `0 0 0 3px rgba(0, 113, 227, .25)` | FR-10 #8 | 苹果式 halo 阴影 |
| `--pm-dur-fast` | `80ms` | FR-6 | 最快一档（区间下界） |
| `--pm-dur` | `120ms` | FR-6 | 默认档 |
| `--pm-dur-slow` | `150ms` | FR-6 | 最慢一档（区间上界） |
| `--pm-ease` | `cubic-bezier(.2, .8, .2, 1)` | FR-6 | 唯一缓动（规则里不写裸值） |
| `--lh-h1` … `--lh-tiny` | 见下 | FR-7 | 行高六档（与字阶一一配对） |
| `--pm-space-module` | `36px` | FR-12 B | **模块之间的间距**。FR-7 #3 的间距闭集（`4/8/12/16/20/28`，即既有 `--s1..--s6`）的**唯一具名例外**（父代理 2026-10-05 裁决，见 C3）；模块内间距用既有 `--s2` = 8px。**令牌名单点**：名字取自 `frontend.md` 的令牌总表（`--pm-space-module`）——该文 §5 表里另写作 `--pm-module-gap`，实施以**本份与令牌总表**的 `--pm-space-module` 为准（同一件事不设两个名字） |
| `--f-l1` | `20px` | FR-12 L1 | 状态主值（现有五槽不含 20px 档，故新增这一个） |

**行高六档（`--lh-*`，与 `--f-*` 一一配对，全部取自 `requirement.md:339` 与 FR-12 A）**：

| 槽位 | 字号令牌 | 行高令牌 | 值 |
|---|---|---|---|
| L0 页标题 | `--f-h1` = `24px` | `--lh-h1` | `1.25` |
| L1 状态主值 | `--f-l1` = `20px` | `--lh-l1` | `25px` |
| L2 模块标题 | `--f-h2` = `15px` | `--lh-h2` | `22px` |
| L3 正文 | `--f-body` = `13px` | `--lh-body` | `20px` |
| L4 说明 | `--f-small` = `12px` | `--lh-small` | `16px` |
| L5 元信息 | `--f-tiny` = `11px` | `--lh-tiny` | `15px` |

> **字阶是"改既有槽位的值"，不是新开一族**：`--f-h1/--f-h2/--f-body/--f-small/--f-tiny` 五个名字
> **已存在**（`report.ts:74`，现值 `21 / 13.5 / 13 / 11.5 / 10.5`），本次只把它们**重定值**为
> `24 / 15 / 13 / 12 / 11`，并新增 L1 与 `--lh-*` 一族。这样"样式分片里只留令牌引用"
> （FR-7 #6）成立，且"阶外字号"是可 grep 的违规。

### 取值被改写 / 归并 / 删除的既有令牌 `serves: FR-4, FR-10`

| 令牌 | 现状 | 本次 | 服务于 |
|---|---|---|---|
| `--pm-text` | `var(--dsw-text-primary, #1d1d1f)`（**宿主不存在该令牌**，回退恒生效） | `#1d1d1f`（浅色原值，不引宿主） | FR-4 #1 |
| `--pm-text2` | `var(--dsw-text-secondary, #5f6368)` | `#6e6e73`（5.07:1） | FR-4、FR-10 |
| `--pm-text3` | `var(--dsw-alias-label-tertiary, …)`（宿主深色 = `#adb2b8` → 白岛上 **2.13:1**） | `#86868b`，**只许非文本/图标**（3.62:1 < 4.5，禁止承载真文字） | FR-4 #2、FR-10 #1 |
| `--pm-accent` | `var(--dsw-accent, #4a7dff)` | `#0071e3`（4.70:1：**文字与面共用一档**，故不再需要两级主色） | FR-4、FR-10 #2 |
| `--pm-warn-text` | `#a86a00`（4.44:1 ✗） | `#c93400`（5.28:1） | FR-4 |
| `--pm-danger` | `#dc3545`（4.53:1，余量 <5%） | `#d70015`（5.38:1，把余量补足） | FR-4、FR-10 |
| `--pm-ok-text` | `#1e7e34`（5.14:1） | 不变 | FR-4 |
| `--pm-line` | `rgba(128,128,128,.20)` | `#0000001a`（= 苹果 separator = 宿主 `--dsw-alias-border-l2`） | FR-10 #5 |
| `--pm-line-soft` | `rgba(128,128,128,.11)` | **删除**（两档灰线统一到一档） | FR-10 #5 |
| `--pm-bg-soft` | `rgba(128,128,128,.045)` | `#f5f5f7`（苹果浅灰；仓内已有同值） | FR-10 #2 |
| `--pm-surface` | `var(--dsw-bg-primary, #fff)` | `#fff`（浅色岛，不引宿主） | FR-4 #1 |
| `--r1` / `--r2` | `6px` / `10px` | `--r1: 8px`；`--r2` **归并**到 `--r1`（圆角只剩 `8px` 与 `--pm-pill: 999px` 两档） | FR-10 #4 |
| `--pm-ok-text-tint` / `--pm-teal-text-tint` / `--pm-danger-text` | — | **备而未用**（`#1e7d34` 4.55:1 / `#0d7789` 4.52:1 / `#c7303e` 4.52:1） | FR-4 #6 |

> **tint 三值为什么"备而不用"**：FR-10 取消了全部 12% 语义底色块 → 组合背景消失了，这三条不达标随之消解
> （FR-4 #6、`requirement.md:254-258`）。但**不许靠"底色没了"默认过关**：若实施中某处仍保留底色块，
> 必须启用这三个令牌并重新实测；对比度脚本必须**同时**覆盖组合背景与反白关系（`requirement.md:260-261`）。

### 令牌口径的三处待裁定（本份已给出裁定与依据，实施照此执行） `serves: FR-2, FR-4, FR-7, FR-10, FR-12`

| # | 冲突 | 裁定 | 依据 |
|---|---|---|---|
| C1 | **主色分级**：FR-4 给"面 `#4a7dff` / 文字 `#2f5fd0`（5.72:1）"两级；FR-10 给**唯一**强调色 `#0071e3`（4.70:1，文字与面都过线） | **以 FR-10 为准（父代理 2026-10-05 裁决）**：`--pm-accent` = `#0071e3`；`--pm-accent-text` **保留为 `--pm-accent` 的别名**（`var(--pm-accent)`），它只为满足契约表（`requirement.md:649`）对该名字的声明，不再承载"更深一档"的语义 | FR-10 §（二）「色板（逐值定死，全部按 WCAG 公式核过）」是 D-5 之后的**唯一权威色板**；`#2f5fd0` 是 D-5 之前 FR-4 表里的取值（**已废弃**，只在本行留痕）。三级文字同理：真文字改用 `--pm-text2`（`#6e6e73` 5.07:1），而不是 `#61666b` |
| C2 | **焦点环颜色**：FR-2 #2 写 `--pm-accent-text`（其 D-5 前取值 `#2f5fd0`）；FR-10 #8 写 `2px solid #0071e3` | `var(--pm-accent-text)` → `var(--pm-accent)` = `#0071e3`（4.70:1），**不引**宿主的 `--dsw-alias-state-business-primary`（宿主深色下是浅蓝 `#7aaaff`，白岛上对比不足） | FR-2 #2 的**理由**（不引宿主令牌）与阈值（≥3:1）都不变；取值随 C1（父代理裁决：色板以 FR-10 为准） |
| C3 | **模块间距**：FR-12 B 说"模块之间 36px"；FR-7 #3 只允许 `4/8/12/16/20/28`（**36 ∉ 闭集**）；原型实测 `moduleGap = 24px`（24 也不在闭集内） | **取 FR-12 B 的 36px**（父代理 2026-10-05 裁决），并**显式声明为 FR-7 #3 闭集的唯一例外**；落成新增令牌 `--pm-space-module: 36px`（单点、可 grep），模块内间距用既有 `--s2` = 8px → H2 = **4.5 ≥ 3** ✓。原型实测的 24px **不在本次口径内**，实施按 36px 落 | 父代理裁决：以 FR-12 B 的显式取值（36px）为准，并把"脱栅格"这件事**登记成唯一例外**而不是悄悄取一个近似值（留 24px 或改取 28px 都会让"例外"隐形成两条）。例外须在 `design/frontend.md` 的间距表与本份同批声明；FR-7 #3 的闭集因此变成"闭集 + 1 个具名例外"，**断言仍按闭集判，须显式放行 `--pm-space-module`** |

## 冻结面（一字不改） `serves: FR-3, FR-4, FR-5, FR-9, FR-11, FR-13`

**判据**：改完之后，下列每一项都必须逐字与改前相同（或"只可能多出新属性"）。
这是本需求能被称为"高风险需求里的低风险改动"的全部理由（`requirement.md:640`）。

| 冻结项 | 内容 | 本次允许的**唯一**变化 |
|---|---|---|
| `data-*` 面板契约 | `data-report-shell` / `data-report-seg`(`head`\|`band`\|`tabs`\|`panel`) / `data-report-head` / `data-report-band` / `data-report-tabs` / `data-panel` / `data-dag-tab` / `data-msg-text-raw` / `data-tab-host` / `data-tab-content` / `data-detail-req` / `data-report-revision` | 无 |
| 操作条契约 | `data-report-actionbar` / `data-report-actions` / `data-action-grid` / `data-action-key` / `data-action-rank`（`primary`\|`secondary`\|`danger`）/ `data-human-only="true"` / `data-human-only-mark="1"` / `data-confirm` / `data-to` / `data-id` | 无（FR-9 只改**布局**，不改这一组） |
| 写路径 `data-action` | `move-req` / `plan-approve` / `plan-reject` / `verify-pass` / `verify-rework` / `switch-tab` / `add-comment`（**对话 Tab 那一处**）/ `jump-session` / `back` / `open-doc` / `report-panel-retry` / `report-head-retry` | **只可能新增属性**；通道名、事件语义、确认保护一律不动（FR-3 #4：方向键切换走**既有** `switch-tab`，不新造写路径） |
| 六条只读端点 | `/report` `/trunk` `/docs` `/dag` `/dialogue` `/token`（+ `/prompts`、`/file`） | 无：不新增字段、不改路径 |
| 信封形状 | `PanelResult` / `Degrade`（`available:false` + `reason` 四值）/ `ReportResponse` / `ReportHead` | 无 |
| 服务端字符串 | `label` / `consequence` / `verdictLine` / `nextStepForAgent` / `missing` 标记 | 无（FR-11 是"同一句服务端文本换一个**披露位置**"，`requirement.md:680-682`） |
| 渲染纪律 | 无内层滚动（不得出现 `overflow: auto\|scroll`）、不加高度上限、一律铺开；`md-inline` 的"只剥标记不改字" | 无（FR-5 加高、FR-7 改字号都不得破这两条） |
| 其它页面 | `data-report-compact`（档二）与看板/列表/甘特/侧栏/设置/toolviews 的一切；其它样式分片（`base.ts` / `board.ts` / `detail.ts` / `node-panel.ts` …） | 无：**一行不改**（边界第 3 条；插件级主题接线属 K1 的后续需求） |
| 状态符号 | `✅ 成功` / `✅ 通过` / `✅ 无缺口` / `⚠️` 这类**状态 emoji** | 无：它们是"颜色之外的第二判据"，正是 FR-8 要的东西；换掉反而破坏 FR-8（FR-1「不改」项） |
| 看板其它页面的图标 | `PM_TOOL_BADGE`（`📋 PM · `）、toolviews 卡片图标、卡面 `🪙 1.2M` 徽章 | 无：属别的页面（边界第 3 条） |

## 删除的接口 `serves: FR-13`

| 接口 / 契约 | 原用途 | 删除原因 | 替代方案 | 服务于 |
|---|---|---|---|---|
| 详情页头部 `.dsh-pm-comment-form`（`report-head.ts:455-458`） | 在详情页直接发评论 | D-7：「这个添加评论删除不需要」；职责上详情页是**汇报**（读），对话是**会议记录**（写） | 对话 Tab 的评论框 / 会话窗口输入框 | FR-13 |
| 头部 `data-role="comment-input"`（同上那一个） | 头部评论框的取数锚点 | 随表单一起删 | 对话 Tab 仍提供同属性节点；`commentInputOf` 的作用域查找继续命中它 | FR-13、耦合② |
| 头部 `data-action="add-comment"`（同上那一个） | 头部发送按钮的写通道 | 随表单一起删 | **通道本身不删**（`add-comment` 仍是冻结面上的合法通道，对话 Tab 在用） | FR-13 |
| 操作条分组标签 `.dsh-pm-action-bar-label`（`report-head.ts:196` 那一处） | 给动作组加一个"本阶段操作"分组名 | FR-11 #1：不提供信息（动作自己就是动词 + 宾语） | 无（动作组靠位置与间距自明） | FR-11 |
| 常驻后果节点（`report-head.ts:178`，从**可见流**移除） | 主操作下方常驻一行短后果 | FR-11 #2：与领域篇「按钮只写标签、后果进 title 与确认框」的既有纪律冲突 | `title` + **视觉隐藏但可访问**的节点（`aria-describedby` 指向，文本 === 服务端 `consequence`）+ 确认框 | FR-11 |

> ⚠️ **两处"同名 class 还在别处用"**，不许顺手多删（`requirement.md:530-531`）：
> ① `.dsh-pm-action-bar-label` 在**评论列表**上仍用（`report-head.ts:338` 的「最近评论 N 条（新的在下）」）——
> 只删操作条那一处；② `add-comment` / `comment-input` 在**对话 Tab** 上仍在用——只删头部那一处。
> "删过头"是本需求最可能的回归方向，故 `test-cases.md` 里有一条专门的反向断言（TC-26）。

## HTTP API 变更 `serves: FR-4, FR-13`

**本次 HTTP API 零变更。** 逐条登记（"无变更"也要说清是"哪些面被确认过"）：

| 面 | 状态 | 证据 / 复核方式 | 服务于 |
|---|---|---|---|
| 六条只读端点 | 冻结：路径、响应形状、`available=false` 降级纪律全不变 | `requirement.md:644`；探针四组合照旧全过（`npx tsx scripts/req-report-probe.mts` 退出码 0） | FR-4 |
| 新增 / 删除端点 | **无** | 本需求改动全在 `src/client/**`（外观层）；服务端零改动 | FR-4 |
| 评论写入 | **通道不变**：`add-comment` 仍走既有 `board-mount` 分支，仅详情页头部那一处入口消失 | `requirement.md:646`；耦合②的回归断言保证对话 Tab 仍可提交 | FR-13 |
| 令牌来源收窄是否触网 | **否**：`--pm-*` 全是 CSS 层取值，与端点无关 | `report.ts:62-74` 的令牌块只改**值**，不改取数 | FR-4 |

## 已知耦合与实施约束 `serves: FR-3, FR-9, FR-11, FR-13`

> 本节是本次**最容易被漏掉、且漏掉就必红**的六条。每条都给了"哪个文件哪一行""怎么判""二选一怎么选"。

### ① 属性顺序耦合（FR-3，需求点名） `serves: FR-3`

- **现象**：`tests/report-shell.test.ts:138` 匹配
  `'class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"'`——**按属性顺序做子串匹配**。
- **后果**：把 `role`/`aria-*`/`tabindex`/`id` 插在 `class` 与 `data-action` 之间，子串立刻断开 → 既有测试变红。
- **二选一**（实施汇报必须写明选了哪个）：
  1. **追加到既有属性之后**（推荐：保住子串，既有断言零改动，加法式契约最纯粹）；
  2. 同步改该断言（改断言 = 增加改动面，且削弱"属性顺序不重要"的既有信号）。
- **判据**：`pnpm test -t 'Tab 栏'` 绿 且 `tests/report-shell.test.ts` 的该行未被修改。

### ② 评论框作用域耦合（FR-13，需求点名） `serves: FR-13`

- **现象**：`board-mount.ts:276-284` 的 `commentInputOf()` **先按作用域取**（`button.closest('.dsh-pm-comment-form')`
  再取该表单内的 `[data-role="comment-input"]`），取不到才回落"整页第一个"。注释原文就写着"详情页现在同时有两个以上评论框"。
- **后果**：删掉头部那个之后，若实现顺手把**对话 Tab 的表单一起删掉**（或改了 `.dsh-pm-comment-form` 类名），
  作用域查找落空 → 回落到"整页第一个"（此时可能是**页面搜索框或别处的输入框**）→ 点了没反应、还不报错（静默失败）。
  这正是该函数当初被写出来的原因（`board-mount.ts:270-275` 注释）。
- **必须做的两条**：
  1. **只删头部那一处**；对话 Tab 的 `.dsh-pm-comment-form` + `data-role="comment-input"` + `data-action="add-comment"` 逐字不动；
  2. **新增一条反向断言**（防"删过头"）：详情页（头部）无 `.dsh-pm-comment-form` / 无头部 `add-comment`，
     **且**对话 Tab 面板内 `.dsh-pm-comment-form` 存在、其 `[data-role="comment-input"]` 可被
     `commentInputOf(sendButton, root)` 取到、点发送仍走 `add-comment`（`test-cases.md` TC-26）。
- **判据**：`pnpm test` 里新增的这条用例绿；既有评论链路用例零回退。

### ③ 原型漂移断言的口径必须同步改（FR-9 / FR-11 的连带） `serves: FR-9, FR-11`

- **现象**：`scripts/req-detail-ui-prototype-shot.mts` 的 `driftCheck()` 对**四段**逐字节/抹平比对：
  `head` 与 `band` 两段要求**逐字节相同**；`panel` 段抹平 ARIA 后相同；`tabs` 段抹平"图标位 + ARIA"后相同。
- **后果（两条，分别触发）**：
  - **D-8 的窗口组 DOM 位移**改变了 `head` 段的**字节内容**（父容器变了）→ 那条"head 逐字节相同"**必然红**；
  - **FR-11 删掉两个节点 + 新增 sr-only 节点**同样改变 `head` 段字节。
- **必须做的**：把 `head` 段的判据从"逐字节相同"改为**"抹平已声明的三处偏差后逐字节相同"**
  （① 图标 emoji→SVG；② 补 ARIA / 稳定 id；③ D-8 的窗口组容器归属位移），
  且**不许删除断言、不许放宽成"不崩就算过"**（`requirement.md:554-558` 的 FR-11 #6 同款纪律）。
  FR-11 那两处删除要落成**逐节点断言**："少的正好是那一个 label span 与那一个常驻后果 span，
  新增的 sr-only 节点文本 === 服务端 `consequence`"。
- **另需**：原型里的内联壳必须先重新内联（改 `report-head.ts` 后重跑内联），否则脚本在漂移核对那一关就退出码 1。

### ④ K7：出图脚本的 `PROTO` 常量仍指向**被取代的原型**（需求点名） `serves: FR-9, FR-11`

- **现象**：`scripts/req-detail-ui-prototype-shot.mts:55` 的 `PROTO` 常量指向前一版原型；而权威原型已是
  `prototypes/detail-ui-v3.html`（`prototypes/INDEX.md` 标 authoritative）。
- **后果**：直接跑它只会重新生成/回填**旧那一版**的 PNG 与 `proto-geometry` → 验收标准 #4b 要求的
  "脚本退出码 0"变成了"验的是被取代的那一份"（假绿）。
- **实施顺序（不许颠倒）**：**先**把 `PROTO` 指向 `detail-ui-v3.html` 并跑一次 → 看三条断言是否当场报错：
  - 若报错，说明 v3 的内联壳被人手改过 → 要么修 v3、要么把漂移口径改成"只允许已声明的偏差"（与③合并处理）；
  - **不许**把本条理解成"脚本能跑就算过"。

### ⑤ K8：`?v=current` **不是**改前外观，不许当对照组（需求点名） `serves: FR-4, FR-10`

- **现象**：原型自述称 `?v=current` = 改造前外观，但文件里没有任何 `[data-proto-v]` CSS 门控（那 3 处命中全是说明文字）。
  交接复核实测：`?v=current` 与 `?v=next` 的头部矩形**逐项相同**，只差结构位图标；
  七项多样性实测也**逐项相同**（胶囊 / 前景 / 底色 / 字重 / 字号 / 圆角 / 边线）。
- **后果**：验收标准 #4 的 sha 对照若按旧写法（拿 `?v=current` 当改前）会退化成"自己跟自己比"（永真断言）。
- **口径（本份钉死）**：浅色岛判据一律用**同 `v` 下 `?theme=dark&v=next` vs `?v=next`（浅色）**出图 sha256 对照；
  改前对照一律用 `evidence/ui-before-*.png`（真实页面基线）。**"不许拿 `?v=current` 当改前"写进用例**（TC-10、TC-21）。

### ⑥ FR-11 的 DOM 断言 vs 原型的 CSS 隐藏（口径不一致，必须真删） `serves: FR-11`

- **现象**：原型里 `.dsh-pm-action-bar-label` 与 `.dsh-pm-action-consequence` 是 **CSS 隐藏（实测 `0×0`）、DOM 节点仍在**；
  而 FR-11 的验收锚点要求"渲染产物**不含**这两个节点（**DOM 断言**，不是字符串 grep）"。
- **后果**：把"CSS 隐藏"当成 FR-11 已达成 → 实施阶段"看着对了"但断言必红。
- **必须做的**：在 `report-head.ts` **真删 DOM 节点**；原型只是预览（`requirement.md:752-755`）。

### ⑦ FR-11 影响面的第 6、7 处（需求清单五处之外的复核发现） `serves: FR-11`

`requirement.md:543-551` 逐处点名了五处测试（其中两处无需改）。**复核同一批断言群时发现另有两处语义随之改变**，
本份如实登记（"改动面不许虚报"对两个方向都成立——不许虚报多，也不许虚报少）：

| 位置 | 现有断言 | FR-11 后 | 处置 |
|---|---|---|---|
| `tests/report-shell.test.ts:212` | `expect(countOf(html, 'dsh-pm-action-consequence')).toBe(1)` | 若**保留** class 作 sr-only 节点（本份选定），计数仍为 1，但**断言对象**从"可见后果"变成"视觉隐藏节点" | **不改也能过**，但必须在实施汇报里显式声明"保留了该 class 作 sr-only 节点"；若改为新类名 `dsh-pm-sr-only-only`，则**必须**同步改这一处 |
| `tests/report-firstscreen-gaps.test.ts:419` | 同上 + `expect(html).toContain('>通过即归档<')` | 同上：文本仍在（只是被 sr-only 隐藏），两处仍绿 | 同上；**并必须**新增"该节点是 sr-only（宽高 ≤1px 或 `clip-path`）且被主操作 `aria-describedby` 指向"这条**新**断言，否则"后果不再常驻"在渲染断言层其实**没被测到** |

> **结论**：FR-11 的"真删"只覆盖两个节点（label span 与**可见**后果 span 的可见性）；
> 后果节点本身**换披露位置而不是消失**（FR-11 #2 的原始裁定）。因此实现必须在两种写法里明确选一种，
> 并同步上面两处（本份推荐：**保留 class + 加 `dsh-pm-sr-only`**，因为它让 FR-7 的"排除 sr-only"那条断言
> 有一个稳定的选择器可用，见 `test-cases.md` TC-15）。

### ⑧ FR-5 加高的预算约束 `serves: FR-5, FR-7`

窗口胶囊与行内"点开看原文"要加到 24px 高（现状 20.5 / 19.3），**不得把首屏余量用光**：
`tabsTop ≤ 713` 是硬判据，v3 实测最紧一档余量 **110px**（`requirement.md:709`）。加高后须由探针复测，不是估算。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-8, FR-10, FR-11, FR-12, FR-13`

> 主体写进 `architecture.md` 的同名节；本份只就地补**与本份主题（接口/契约面）相关**的取舍。

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 图标来源 | 装图标库（lucide / heroicons）或 icon font | **内联 SVG 字符串常量**（`src/client/icons.ts`） | ① 与全仓"纯字符串渲染"一致（渲染函数只产字符串，`report-tabs.ts` 全文无 DOM 依赖）；② 零运行时依赖、无网络资源（FR-1 #5），bundle 里不会因为 tree-shaking 失效而多背一整个图标集；③ **可被字符串断言**（"每个 Tab 含且仅含 1 个 `<svg … aria-hidden`"是纯字符串判据），装库反而要起真 DOM 才测得到 |
| 面板结构位图标（`🧱`） | 在 `panels/prompts.ts` 自己写一份 SVG | **复用 `TAB_ICON_SVG.prompts`** | 它顶的就是 Tab 的图标；两份写法必然漂移（FR-1 范围限定 ② 的原话） |
| 缺口圆点 | 保留 emoji `🔴/🟡/⚪` | **`GAP_DOT_SVG`（`currentColor` 圆）+ 真实文本标记 `!!`/`!`/`·`** | FR-8 #2：emoji 字形/明度由系统字体决定（正是 FR-1 要除掉的那类不可控资产）；文本标记独立可读，"颜色仍承载严重度"不违反"不只用颜色" |
| 可访问性属性的落地方式 | **改契约**：把 `<button>` 换成 `<div role="tab">` 或重写 Tab 渲染 | **加法式属性**（保留 `button` + `data-action` + `data-tab` 不动） | ① 仓内已有先例且是同一套写法（`board.ts:139-142` 的 `role="tablist"/role="tab"`）；② 旧断言、旧调用方（`board-mount.ts` 的 `setDetailTab` 按 `.dsh-pm-tab` + `dataset.tab` 工作）**零感知**；③ 换标签名会同时动 CSS 选择器与事件委派，改的是"面"不是"层" |
| 面板 id 的形态 | 用运行时生成的自增 id / 用 `data-panel` 值当 id | **稳定 id `panel-<key>` / `tab-<key>`** | 未激活面板不在 DOM（懒加载纪律），`aria-controls` 只能指向一个**声明式**的稳定名字（FR-3 #5） |
| 焦点环颜色 | 引宿主的 `--dsw-alias-state-business-primary`（FR-2 #2 引的宿主配方） | **岛内 `--pm-accent-text`** | 宿主该令牌在深色下是浅蓝 `#7aaaff`，白岛上对比不足 3:1；本页是浅色岛，环色必须由岛自己保证（FR-2 #2 / #4） |
| 焦点环偏移 | 统一一档 `+2px` | **两档**：面状 `-2px`（内偏移，不撑出方框、不挤动相邻元素）、小控件 `+2px` | 照宿主口径（FR-2 #5）；Tab 上 `+2px` 会让 Tab 栏整条高度抖动，与 FR-5/FR-7 的预算判据打架 |
| 目标尺寸的手段 | 视觉放大（改字号/内边距，页面变高） | **命中区优先**（`::after` 扩命中区），必要时才加内边距 | FR-5 #3 量的是命中区；FR-5 #4 + FR-7 #5 卡住首屏预算（余量 110px 不许用光） |
| 主题口径 | 把 8 个假令牌接回官方令牌、"跟随主题" | **诚实的浅色岛**（令牌取浅色原值、删掉半个主题的覆盖块） | D-3 的用户裁定：「本次只做详情页（浅色岛，改动面小，推荐）」；插件级接线是 426 处、11 个分片，属后续需求（K1） |
| 删评论入口的方式 | 只 CSS 隐藏（保留 DOM） | **真删 DOM 节点** | FR-11/FR-13 的验收锚点是 DOM 断言；原型受"只换 CSS 层"约束只能 CSS 隐藏，**别把原型当已达成**（`requirement.md:752-755`） |
| `--pm-accent-text` 是否随 C1 合并掉 | 删掉这个名字，全用 `--pm-accent` | **保留名字**，值 = `var(--pm-accent)` | 契约表（`requirement.md:649`）已声明该令牌；且"文字级主色"是**语义槽位**——将来若要再分级，只改这一处而不是重扫全片 |
| 模块间距的取值 | ① 取近似栅格值 `--s6` = 28px（把"脱栅格"藏起来）；② 沿用原型实测的 24px | **`--pm-space-module: 36px`**（FR-12 B 的显式值），并按 FR-7 #3 的**唯一具名例外**声明 | 父代理裁决：以 FR-12 B 为准，同时把例外**显式登记**——取 28 或 24 都会让"例外"变成隐形的第二条口径；36/8 = 4.5 满足 H2 ≥3。见 C3 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-5, FR-6, FR-7, FR-9`

> 同上：主体写进 `architecture.md` 的同名节；本份只写**与本份主题（接口/契约）相关**的差异。

| 差异点（与常规做法比） | 常规做法 | 本次做法 | 可核验指向 |
|---|---|---|---|
| 图标是"数据"不是"组件" | 引入图标组件/库，按需渲染 | 内联 SVG **字符串常量**，全族常量（`viewBox` / `stroke-width` / `currentColor` / `fill="none"`） | `src/client/icons.ts`；断言：每个 Tab 恰好 1 个 `<svg … aria-hidden="true"`（TC-1） |
| 尺寸不是"每个图标自己写" | 每个 SVG 带 `width/height` | SVG **不带**尺寸；尺寸只由 `--pm-icon` / `--pm-icon-sm` 两档令牌施加 | `report.ts` 令牌块；断言：Tab 栏内 `<svg>` 计算 `width/height` = 14±1（TC-2） |
| 令牌单点（可 grep 的纪律） | 规则里写裸 `120ms` / 裸 `10.5px` | 时长/缓动/字号/行高**只从 `--pm-*` / `--f-*` / `--lh-*` 取**；规则里不出现裸 ms 字面量 | 断言：分片里 `transition` 时长全来自 `var(--pm-dur`（无裸 ms）；无裸 `font-size: <n>px`（TC-14、TC-15） |
| 命中区可测 | "看着变大了" | 判据是 `getBoundingClientRect()`（命中区），不是视觉框；手段不设限但结果要真 | FR-5 锚点；TC-12 遍历 `button/[role=tab]/a[href]/summary/input` |
| 加法式契约有**可证伪定义** | "没破坏兼容"（口号） | 定义：**删掉本需求全部新增属性后，产物应回到能过既有全部断言的状态** | `test-cases.md` 的「加法式契约的否证用例」（TC-7 附加步骤） |
| 漂移防护不靠人眼 | 靠"每次重新内联"的自觉 | 出图脚本**每次运行前重算真实壳并与原型内联壳比对**（分四段、两档）、对不上即退出码 1 | `scripts/req-detail-ui-prototype-shot.mts#driftCheck`；本次因 D-8 位移需改口径（耦合③） |
| 主题不靠"声称" | 注释写"跟随主题" | 页面自持浅色原值；**判据是出图 sha256 逐字节相同**（同 `v` 下 dark vs 浅色） | 验收标准 #4；TC-10（另：K8 明确禁止拿 `?v=current` 当对照组） |
| 阈值只在脚本、观测值只在原型 | 阈值散落在文档/注释 | 原型 `<!-- proto-geometry -->` 只放观测值（name/value/unit/at），阈值只在脚本与设计文档 | `scripts/req-detail-ui-prototype-shot.mts` 模块注释「三条纪律」① |
