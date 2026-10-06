# 测试用例设计（REQ-261005155003-f32f）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13 -->

> 三层：**静态文本层**（`grep` 断言 CSS/渲染源码）· **渲染断言层**（`pnpm test`，断言 HTML 字符串）·
> **探针层**（headless Chrome，真实渲染 + 真实计算样式 + 出图）。
> 口径引用本仓规范：改客户端必重建 `conventions.md#c-12`、提交前跑测试 `#c-14`、
> 改源码必类型检查 `#c-15`、发版前构建 `#c-11`、改生成物来源必跑知识层 `#c-13`。
> 每条用例标题只标 `validates: FR-N`（本阶段卡片尚不存在，标任何卡片号都是假引用）。
> 原型锚点一律 `prototypes/detail-ui-v3.html#FR-N`（权威原型，见 `prototypes/INDEX.md`）。
> **本文里的全部数值判据都必须在实施阶段用真实运行结果回填/复核**——本份给的是"跑什么、看什么信号、什么算红"。

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13`

### TC-1: 结构位无 emoji；六个 Tab 图标为内联 SVG `validates: FR-1` <!-- serves: FR-1 -->

**测试目标**：详情页**结构位**（Tab 栏六个 + 面板内重复 Tab 图标的结构标记）不再出现 emoji，且每个 Tab 恰好 1 个装饰性 SVG。

**前置条件**：已改 `report-tabs.ts#buildTabBar` 与 `panels/prompts.ts:282`；`src/client/icons.ts` 已落盘。

**步骤（跑什么）**：
1. `grep -rn "📋\|📄\|🕸\|💬\|🪙\|🧱" src/client/views/report-tabs.ts src/client/views/panels/`
2. `npx vitest run tests/report-shell.test.ts -t 'Tab 栏'`
3. 新增渲染断言：对 `buildTabBar(...)` 的产物计数 `<svg` 与 `aria-hidden="true"`

**预期（看什么信号）**：
- ① 的**结构位**命中数为 **0**（装饰性正文里的 emoji 不受此判据约束，必须由实现注释**逐处列明**）；
- 六个 Tab 各含**恰好 1 个** `<svg` 且带 `aria-hidden="true"`（图标旁总有可见文字，故一律装饰性）；
- 面板内 `🧱` 已换或已去掉（它顶的是 Tab 的 `prompts` 图标 → 复用 `TAB_ICON_SVG.prompts`，不另写一份）。

**反例（判红条件）**：把状态符号（`✅ 成功` / `⚠️`）也一起换掉 → 破坏 FR-8 的"颜色之外第二判据"，判**红**。

### TC-2: 图标族常量与尺寸两档 `validates: FR-1` <!-- serves: FR-1 -->

**测试目标**：图标全族常量一致（`viewBox="0 0 16 16"` / `stroke-width="1.5"` / `stroke="currentColor"` / `fill="none"`），尺寸只走两档令牌。

**步骤（跑什么）**：
1. 静态：`grep -c 'viewBox="0 0 16 16"' src/client/icons.ts` → 应等于图标总数；`grep -c -E ' (width|height|style)=' src/client/icons.ts` → **0**、`grep -c '#[0-9a-fA-F]\{6\}' src/client/icons.ts` → **0**（SVG 字符串不带**尺寸/样式属性**、不带颜色字面量）
   > ⚠️ **口径订正（t2 实施时实测，2026-10-05）**：原判据写的是朴素 `grep -c 'width=\|height='`，但它会命中 **`stroke-width="${ICON_STROKE_WIDTH}"`** —— 而线宽 1.5 正是 FR-1 #1 要求写进字符串的全族常量，两者自相矛盾（必红）。故改为**按属性边界**匹配（`' (width|height|style)='`），测的仍是「尺寸只许来自 CSS 令牌」这一本意。`stroke-width` 属形状常量，不在禁用项内。
2. 探针（新增断言组）：Tab 栏内每个 `<svg>` 的 `getBoundingClientRect()` 宽高
3. 静态：`grep -n -- '--pm-icon' src/client/styles/report.ts` → 应恰好两处定义（`--pm-icon: 14px` / `--pm-icon-sm: 12px`）

**预期（看什么信号）**：
- 探针实测 `width` 与 `height` 均 = **14px ±1**（六个 Tab 全中）；
- 令牌定义**恰好两档**，样式规则里不出现第三种图标尺寸裸值。

**覆盖场景**：边界值（12px 行内档须在 `prompts` 面板结构位上量到，见 TC-28）。

### TC-3: 键盘焦点可见（`:focus-visible` 真生效） `validates: FR-2` <!-- serves: FR-2 -->

**测试目标**：所有可聚焦元素在键盘聚焦时显示统一焦点环，鼠标点击不留环。

**前置条件**：`report.ts` 里已加 `:focus-visible` 规则；探针新增焦点断言组。

**步骤（跑什么）**：
1. 静态：`grep -rc "focus-visible" src/client/styles/report.ts` → ≥ 1，且覆盖 FR-2 声明的全部控件类（Tab / 按钮 / 胶囊 / 链接式按钮 / 输入框 / `summary`）
2. 探针：对清单里每个控件 `el.focus()`（键盘路径）后取计算样式
3. 探针：同一控件用 `page.mouse.click()` 后取计算样式

**预期（看什么信号）**：
- 键盘路径：`outlineWidth ≥ 2px` 且 `outlineColor` 与背景对比度 **≥3:1**；浅/深两套宿主主题**各跑一次**（浅色岛口径下两次读数应一致）；
- 鼠标路径：**无**焦点环（这是"加法式"的一部分——旧观感不因此变化）。

### TC-4: 焦点环两档偏移，且不被裁切、不被遮挡 `validates: FR-2` <!-- serves: FR-2 -->

**测试目标**：面状控件用 `outline-offset: -2px`、小控件用 `+2px`（照宿主口径）；焦点环在溢出容器边缘不被 `overflow` 吃掉、不被粘性元素盖住。

**步骤（跑什么）**：探针（新增断言组）——对 Tab（面状）与按钮/胶囊/输入框（小控件）分别断言计算 `outlineOffset`；对每组控件取焦点态包围盒与父容器裁剪盒求交。

**预期（看什么信号）**：
- `outlineOffset` = `-2px`（面状）/ `2px`（小控件），与声明逐档一致；
- 焦点环矩形**完整落在**可视区内（四边不被裁），且 `elementFromPoint(环上四点)` 命中的是该控件或其祖先（不被盖住）；
- **演示态不算外观**：原型上 Tab 的那个方框是 `data-proto-focus="1"` 的**演示**，默认外观只有蓝字 + 蓝下划线——断言**不许**把它当默认。

### TC-5: Tab 语义四件套 + 选中恰 1 个 `validates: FR-3` <!-- serves: FR-3 -->

**测试目标**：六个 Tab 具备标准 Tab 组件语义。

**前置条件**：`buildTabBar` / `panelWrapper` 已按 `interfaces.md` 的「加法式 DOM 属性契约」落地。

**步骤（跑什么）**：
1. 渲染断言：`buildReportShell(makeReport(), 'trunk', …)` 产物字符串
2. 探针：真 DOM 里 `getAttribute` 复核

**预期（看什么信号）**：
- 产物含 1 个 `role="tablist"`（带 `aria-label`）；每项含 `role="tab"` 与 `aria-selected`；
- `aria-selected="true"` **恰 1 个**，且它就是 `active` 键；
- 每项 `aria-controls` = 稳定 id `panel-<key>`；面板容器 `role="tabpanel"` + `id="panel-<key>"` + `aria-labelledby="tab-<key>"`；
- id 形态只允许 `tab-<key>` / `panel-<key>` 两种（不许自增 id）。

### TC-6: roving tabindex 与方向键切换（走既有通道） `validates: FR-3` <!-- serves: FR-3 -->

**测试目标**：Tab 键在页面里只停一次；组内用方向键走；切换触发**既有** `data-action="switch-tab"`。

**步骤（跑什么）**：探针驱动键盘：
1. `focus` 第一个 tab → 连续 `Tab` 键 → 断言焦点**离开**整组
2. `focus` 第一个 tab → `ArrowRight` → 读焦点元素与 `aria-selected`
3. `Home` / `End`
4. 断言切换时发出的写请求（或 `data-action` 委派）走的仍是 `switch-tab`

**预期（看什么信号）**：
- 选中项 `tabindex="0"`、其余 `tabindex="-1"`；
- `ArrowRight` 后**焦点与 `aria-selected` 同时前移一格**且面板段被换成 `panel-<新 key>`；
- `Home` → 首项、`End` → 末项；到端点不回绕（或明确回绕，二选一写进实现注释并断言）；
- 写路径未新造：命中通道名仍是 `switch-tab`（不是新 `data-action`）。

### TC-7: 属性顺序（追加式）与"加法式契约"的否证 `validates: FR-3` <!-- serves: FR-3 -->

**测试目标**：新增属性**追加在既有属性之后**，既有的按序子串断言不被破坏；并**可证伪地**证明这是加法式扩展。

**步骤（跑什么）**：
1. `npx vitest run tests/report-shell.test.ts`（该文件第 138 行为按序子串匹配：
   `'class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"'`）
2. **否证步骤**：临时用一个剥离函数去掉全部新增属性（`role` / `aria-*` / `tabindex` / `id`）后再跑同一批断言

**预期（看什么信号）**：
- ① 全绿，且 `tests/report-shell.test.ts` 的该行**未被修改**（若选择"同步改断言"，必须在实施汇报里写明——二选一）；
- ② 剥离后旧断言全绿 → 证明"加法式"成立；若剥离后有红 → 说明某处是**改**契约而不是**加**属性。

### TC-8: 未激活面板仍不在 DOM（加 ARIA 不许整块渲染） `validates: FR-3` <!-- serves: FR-3 -->

**测试目标**：懒加载与"未激活面板不在 DOM"的纪律不变（沿用既有 A4 断言）。

**步骤（跑什么）**：`npx tsx scripts/req-report-probe.mts`（A4 组）+ 渲染断言：
`document.querySelector('[data-panel="token"]')` 在未激活时须为 `null`；`[data-tab-host]` 计数须为 1。

**预期（看什么信号）**：A4 三项全过（未激活面板 0 个 / 包装器恰 1 个 / 默认 trunk 在场）；产物里不出现未激活 key 的 `data-panel=`。

**反例**：为了让 `aria-controls` "指向存在的节点"而把六个面板全渲染出来 → 判**红**（这正是本仓要修的老病）。

### TC-9: 对比度报表（含组合背景与反白关系） `validates: FR-4` <!-- serves: FR-4 -->

**测试目标**：三档文字 ≥4.5:1、承载信息的非文本 ≥3:1，且**按实际色值算**而不是靠看。

**前置条件**：新增脚本落 `scripts/`（随本需求交付，基线见 `evidence/contrast-baseline.txt`；
**名字在实施时定**，本份先钉住契约：读 `report.ts` 的令牌声明而不是复制一份值，避免两处漂移）。

**步骤（跑什么）**：`npx tsx scripts/<对比度脚本>.mts`

**预期（看什么信号）**：
- 退出码 **0**；报表打印每个色值的**实测比值 + 判定**；
- **必须覆盖三类关系**（缺一类都不算过）：
  ① 深字压白底；② **组合背景**（芯片的浅底 + 文字）；③ **反白关系**（白字压主色底的主按钮）——
  "主按钮那条 + 芯片那三条"正是只算"深字压白底"时漏掉的（`requirement.md:260-261`）；
- 任何正文档 <4.5 或非文本档 <3 → **退出码非 0**；
- 报表里出现 `[data-ds-dark-theme]` 对详情页的**任何影响** → 判失败（浅色岛不该被宿主主题翻转）；
- 豁免项（纯装饰 hairline、未开始阶段段）**逐条登记**且给理由（WCAG 1.4.11 的"可通过其他方式识别"）；
- 若实施中某处仍保留 12% 底色块 → 必须启用 tint 级令牌（`--pm-ok-text-tint` / `--pm-teal-text-tint` / `--pm-danger-text`）并重新实测——**不许靠"底色没了"默认过关**。

### TC-10: 浅色岛口径（同 `v` 下 dark vs 浅色出图逐字节相同） `validates: FR-4` <!-- serves: FR-4 -->

**测试目标**：详情页在宿主两套主题下**同一副长相**，不再被宿主主题翻转。

**前置条件**：出图脚本可用；`PROTO` 已指向权威原型（见 TC-24 的前置与 K7）。

**步骤（跑什么）**：
1. 出图：`?theme=dark&v=next&annot=0` 与 `?v=next&annot=0`（**同 `v`**、同 `state`、同 `--window-size`），对 PNG 求 sha256 比对
2. 静态：`grep -n -- '--dsw-text-primary\|--dsw-text-secondary\|--dsw-accent\|--dsw-bg-primary\|--dsw-alias-label-tertiary' src/client/styles/report.ts` → **0**

**预期（看什么信号）**：
- 两档 PNG **逐字节相同**（sha256 一致）；
- 详情页不引用任何宿主主题敏感令牌；
- ⚠️ **不许拿 `?v=current` 当对照组**——它不是改前外观（实测与 `?v=next` 逐项相同，见「已知陷阱」K8）；
  用它对照 = 自己跟自己比（永真断言），判**红**。

### TC-11: 移除"半个主题"的残留覆盖块 `validates: FR-4` <!-- serves: FR-4 -->

**测试目标**：`[data-ds-dark-theme] .dsh-pm-detail[data-report-shell] { … }` 这组覆盖被删除。

**步骤（跑什么）**：
1. `grep -n 'data-ds-dark-theme' src/client/styles/report.ts` → 期望 **0** 命中
2. 探针：宿主带 `[data-ds-dark-theme]` 时取详情页内的语义前景色计算值，与不带时逐项比对

**预期（看什么信号）**：grep 0 命中；探针两次读数**逐项相同**（`--pm-danger` 不再从 4.53:1 掉到 ≈3.4:1）。

### TC-12: 全部交互目标 ≥24×24 CSS px `validates: FR-5` <!-- serves: FR-5 -->

**测试目标**：详情页内全部可点击/可聚焦目标满足 WCAG 2.2 SC 2.5.8（AA），**判据量命中区**。

**步骤（跑什么）**：探针（新增断言组）——遍历详情页内全部 `button` / `[role=tab]` / `a[href]` / `summary` / `input`，
取 `getBoundingClientRect()`，逐条打印 `选择器 + 实测宽高`。

**预期（看什么信号）**：
- 全部满足 `width ≥ 24 && height ≥ 24`；任一不满足 → 打印该选择器与实测宽高并以**退出码 1** 结束；
- 基线里点名的不达标项必须转绿：`.dsh-pm-window`（原 216.2×**20.5** / 203.1×**20.5**）、
  `.dsh-pm-trunk-open`（原 71.2×**19.3**）——`evidence/targets-and-fonts-baseline.txt`；
- **例外清单必须显式**且写在断言代码里、逐条给理由（如正文内联链接属 WCAG "inline" 例外）；
  例外之外不许有"漏网"的豁免。

### TC-13: 相邻目标间距 ≥8px `validates: FR-5` <!-- serves: FR-5 -->

**测试目标**：相邻交互目标之间 ≥8px，避免误触。

**步骤（跑什么）**：探针对同一行内相邻目标取包围盒，计算水平/垂直间隙；对窗口胶囊组逐个求最小间隙。

**预期（看什么信号）**：全部相邻间隙 ≥8px；**加高不得破首屏预算**（同批复测 TC-16 的 `tabsTop ≤ 713`）。

### TC-14: 动效令牌与减少动态效果 `validates: FR-6` <!-- serves: FR-6 -->

**测试目标**：交互反馈不是瞬变；时长/缓动单点；`prefers-reduced-motion` 下终态可读。

**步骤（跑什么）**：
1. 静态：`grep -n 'transition' src/client/styles/report.ts` → 每条时长取值必须来自 `var(--pm-dur`（**无裸 ms 字面量**）
2. 静态：`grep -c 'prefers-reduced-motion' src/client/styles/report.ts` → ≥1
3. 探针：模拟 reduced-motion 后取计算样式 `transitionDuration`

**预期（看什么信号）**：
- 时长全部落在 **80–150ms** 且只有三个令牌档（`--pm-dur-fast` / `--pm-dur` / `--pm-dur-slow`），无"每个控件一个时长"；
- 过渡**只动颜色/边框/透明度**：动效前后几何量（宽高、`offsetTop`/`offsetLeft`）逐项一致；
- reduced-motion 下 `transitionDuration` = **`0s`**（是"不动"，不是"变慢"），且终态直接可读。

**⚠️ 本机口径（必须写进脚本注释）**：本机 headless Chrome 的 `prefers-reduced-motion` **恒为 reduce**
（`--force-prefers-reduced-motion=no-preference` 压不住）→ 计算样式永远是 `0s`，**量不到"非 reduce 下不是瞬变"**。
故判据拆开：④ 用**计算样式**断言（量到了）；①②③（共享令牌 / 无裸 ms / 只动颜色不动几何）用 **CSS 文本静态**断言
（只是读出来的）。**不放宽阈值**，也不假装量到了。

### TC-15: 字阶五档 + 无阶梯外字号（排除 sr-only） `validates: FR-7` <!-- serves: FR-7 -->

**测试目标**：字号收敛到阶梯 `11/12/13/15/20/24`；**可见真文字**最小 ≥11px；视觉隐藏节点不参与该断言。

**步骤（跑什么）**：
1. 静态：`grep -n 'font-size:\s*[0-9.]*px' src/client/styles/report.ts`（白名单：令牌定义处与 `--pm-mono` 等）
2. 探针（新增断言组）：详情页内**可见真文字**的最小计算 `font-size`，按可见性过滤
3. 探针：统计壳内计算字号的**档位集合**

**预期（看什么信号）**：
- ① 分片里不再出现**裸** `font-size: <number>px`；特别不许出现 `10px` / `10.5px` / `12.5px`；
- ② 可见真文字最小字号 **≥11px**（基线最小 **9.5px**，三处：`.dsh-pm-trunk-src` / `.dsh-pm-doc-kind` / `.dsh-pm-gate-*`）；
- ③ 档位集合 ⊆ 阶梯，**无阶梯外字号**——且**必须排除视觉隐藏节点**：FR-11 让主操作后果改走
  `aria-describedby` 指向的视觉隐藏节点，它当前实测 **`font-size: 10.5px` / `0×0` / `overflow:hidden`**
  （`.dsh-pm-action-consequence`）。**不排除它，这条断言必然假红**。
- **二选一并在实施汇报里写明**：① 断言按可见性过滤（推荐——它与 FR-11"视觉隐藏"是同一件事）；
  ② 把那处 sr-only 的字号也提到 11px。
- 另：`12.5px` 是**可见真文字**且是阶梯外档（来源 `report.ts:307` 等 ~10 处），**必须归入 12 或 13**（取值由 `design/frontend.md` 定）。

### TC-16: 首屏预算不回退（`tabsTop ≤ 713`） `validates: FR-7` <!-- serves: FR-7 -->

**测试目标**：字号微调与目标加高**不得**把 Tab 栏推出首屏，状态带三格 ≤220px、操作条 ≤72px 一并保持。

**步骤（跑什么）**：`npx tsx scripts/req-report-probe.mts`（四组合：1280/900 × 在途/终态）

**预期（看什么信号）**：
- 退出码 **0**，输出含 `tabsTop ≤ 713`；四组合的 `tabsTop` 逐档打印且全部合规；
- 状态带单格 ≤220px、操作条整块 ≤72px、无横向溢出、无内层滚动、未激活面板缺席、操作条不重叠、四问可答；
- v3 复核的余量最紧一档为 **110px**（`requirement.md:709`）——**不许把这 110px 用光**（预算不是目标值）；
- 退出码语义：`0` 全过 / `1` 有断言失败 / `2` 环境不可用（找不到 Chrome——**响亮失败，不静默跳过**）。

### TC-17: 状态不靠颜色单一表达（且标记是真实内容） `validates: FR-8` <!-- serves: FR-8 -->

**测试目标**：阶段条 / 缺口严重度 / 验收结论在颜色之外各有可辨标记，且标记是**真实文本节点或 `aria-hidden` SVG**，不是只做 CSS 伪元素。

**步骤（跑什么）**：
1. 渲染断言：阶段条三态（completed / current / 未开始）与结论三态（pass / rework / pending）各自元素内**存在文本节点或 `svg` 子节点**；
2. 静态：断言实现的标记**不是** `.x::before { content: … }`（`::before` 的内容读屏不保证读到）；
3. 探针 + 人工：把详情页强制灰度（注入滤镜）后截图，落 `evidence/`

**预期（看什么信号）**：
- 阶段条：`completed` 带 `✓` 前缀、`current` 带 `▸` 前缀、未开始不带（原型已实测该口径）；
- 缺口：`!!` / `!` / `·` 文本标记 **+** 不依赖字体的圆（`GAP_DOT_SVG`，`aria-hidden`）；
- 结论：`✓` / `↺` / `…` 字形符号（读屏可读，配可见文字或 `aria-label`）；
- 灰度截图人工评审：三态**仍可区分**；
- **已达标的部分不动**：状态芯片本身已有文字 → 不为了统一而制造改动。

### TC-18: 灰度人工评审（FR-8 的人工兜底） `validates: FR-8` <!-- serves: FR-8 -->

**测试目标**：把"颜色即信息"的残留看出来。

**步骤（跑什么）**：探针在详情页注入 `filter: grayscale(1)` 后出图（1280 在途 + 终态两态），落
`docs/requirements/REQ-261005155003-f32f/evidence/`（文件名随实施定）。

**预期（看什么信号）**：人工逐项核对"阶段/缺口/结论"三处——**灰度下仍能说出哪个是完成、哪个是当前、哪个是严重缺口**；
说不出来即判红并回到 TC-17。

### TC-19: D-8 头部拆行三条断言 `validates: FR-9` <!-- serves: FR-9 -->

**测试目标**：动作行独占第一行、身份行另起一行、窗口按钮组靠左（在「创建于 …」左侧）。

**步骤（跑什么）**：探针 / 出图脚本各量一次：

**预期（看什么信号）**：
- ① `actionRowTop < identityRowTop`（动作行在身份行**之上**）；
- ② `identityRowTop - actionRowTop ≥ 8px`（两行**真拆开**，不是同排的视觉错觉）；
- ③ `windowLeft < createdAtLeft`（窗口按钮组靠左、仍在「创建于 …」左侧）；
- 回归线：动作按钮在**各自行内** `offsetTop` 只有一个取值；操作条整块 ≤72px；`tabsTop ≤ 713`；
- 900 档已知：身份行会多换一行，`tabsTop@900/inflight` 由 577 变 603（硬判据仍过，余量 110px）——**这是预期值，不是回归**。

### TC-20: 动作位置不随动作数量漂移 `validates: FR-9` <!-- serves: FR-9 -->

**测试目标**：1 个 / 2 个 / 3 个动作三种标本下，主操作与破坏性动作的位置**逐个相同**。

**前置条件**：同一份标本注入 1/2/3 个动作各渲一次（标本变体由探针侧构造，复用 `scripts/fixtures/req-detail-specimen.mts` 的构造口径）。

**预期（看什么信号）**：
- 主操作 `offsetLeft` 三次**相同**，且 = 卡片内容区左缘；
- 破坏性动作**恒为最后一个**，与前一个动作之间距离固定（FR-9 #7：≥24px 空隙，或 1px 竖分隔线 + 两侧各 12px）；
- 动作按钮 `offsetTop` 单一取值（仍在同一行）；
- **口径提示**：`margin-left:auto` 推行尾是 **D-4 时期**机制，已被 D-7/D-8 取代——断言按"与前一个动作的固定空隙"判，
  不按"贴行尾"判（别照抄 FR-9 第 3 项的旧文）。

### TC-21: 视觉语言七项收敛（改前 → 改后） `validates: FR-10` <!-- serves: FR-10 -->

**测试目标**：同一标本（1280 在途态，壳内 213 个元素）下七项多样性收敛到上限内。

**步骤（跑什么）**：`npx tsx scripts/req-detail-ui-prototype-shot.mts`（**须先满足 TC-24 的前置：`PROTO` 指向 v3**）

**预期（看什么信号）**：脚本打印"改前 → 改后"七项复测表，任一项超上限即**退出码非 0**（阈值写在脚本里）：

| 维度 | 改前 | 上限 | 判定信号 |
|---|---|---|---|
| 胶囊元素 | 17 | ≤5 且只剩"状态 + 可点"两类 | 脚本打印 |
| 前景色种类 | 9 | ≤6（2026-10-05 勘误，与 FR-10 (二) 六色文字色板 + FR-8 严重度着色一致；另判「无阶梯外色」）| 同上 |
| 底色种类 | 12 | ≤4 | 同上 |
| 字重种类 | 5 | ≤3（不含 650/660） | 同上 |
| 字号种类 | 10 | ≤6（= `24/20/15/13/12/11`，除页标题外 ≤5）且**无阶梯外字号** | 同上 |
| 圆角种类 | 3～4 | ≤2 | 同上 |
| 边线色种类 | 5 | ≤2 | 同上 |

- 复测表落 `evidence/style-variety-before-after.txt`；before/after 整页对照图落 `evidence/ui-before-after-full-1280.png`；
- **FR-1～FR-13 的既有断言一条都不许回退**（同一脚本同一批断言）；
- ⚠️ **"改前"这一列不许拿 `?v=current` 现量当基线**（K8：实测与 `?v=next` 七项**逐项相同**，该基线断言在原 v3 上不可能成立）。
  二选一（实施阶段做）：① 给整块改造层补 `[data-proto-v="next"]` 门控让自述成真；
  ② 把两张表的「改前」列与 evidence 的方法说明改标为"**人给的历史快照**（出自真实页面基线，对照图见 `evidence/ui-before-*.png`）"
  并同步改脚本里那段基线复现。**不许继续声称 `?v=current` = 改前**。

### TC-22: 操作条文案收敛（删标签 · 换披露 · 改短行尾标） `validates: FR-11` <!-- serves: FR-11 -->

**测试目标**：分组标签消失；主操作后果改走 `aria-describedby` + 视觉隐藏文本 + `title`；行尾标改短；机器可读面逐字不动。

**步骤（跑什么）**：
1. 渲染断言（真 DOM / 字符串）：产物**不含**操作条那一处 `.dsh-pm-action-bar-label`（「本阶段操作」）与**可见**的常驻后果节点；
2. 渲染断言：主操作按钮有 `aria-describedby`，指向节点文本 **=== 服务端 `consequence`**，且该节点视觉隐藏
   （宽高 ≤1px 或 `clip-path`）但对读屏可见；
3. 渲染断言：行尾标文本 === 「**需人工确认**」且 `data-human-only-mark="1"` 仍在、每格 `data-human-only="true"` 计数不变；
4. `grep -n '本阶段操作' src/client/views/` → 仅应命中**评论列表**那一处（`report-head.ts:338` 的「最近评论 N 条（新的在下）」）

**预期（看什么信号）**：
- 不许"只留 `title`"——那是 hover-only 反模式（触屏/键盘/读屏都拿不到），判**红**；
- **不许删断言**（把"存在"改成"不存在"是换判据，删掉是丢判据）；
- 同名 class 不许顺手多删（评论列表那处必须仍在）；
- `title` 全文仍在按钮上（悬停可读全文）。

### TC-23: FR-11 的五处测试同步（两处不改）+ 新增两条 `validates: FR-11` <!-- serves: FR-11 -->

**测试目标**：既有断言群按"存在 → 不出现"改写到位，且改动面不多报不少报。

**步骤（跑什么）**：`npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts`

**预期（看什么信号）**——逐处核对（照 `requirement.md:543-551` 的清单，**两处无需改**，如实记）：

| 位置 | 现有断言 | FR-11 后 | 本次动作 |
|---|---|---|---|
| `tests/report-shell.test.ts:219` | `toContain('均需人工确认')` | →`toContain('需人工确认')` | **改** |
| `tests/report-firstscreen-gaps.test.ts:411` | `expect(grid).not.toContain('本阶段操作')` | 删标签后仍成立 | **不改**（不虚报改动面） |
| 同上 `:447` | `countOf(html,'均需人工确认') === 1` | →`需人工确认` | **改** |
| 同上 `:450` | `countOf(html,'data-human-only="true"') === ACTIONS.length` | 机器可读面不动 | **不改** |
| 同上 `:450-457` 的 `auto` 用例 | `expect(auto).not.toContain('均需人工确认')` | →`需人工确认`，否则变成永远为真的空断言 | **改** |
| `tests/report-shell.test.ts:212`、`report-firstscreen-gaps.test.ts:419` | `countOf(html,'dsh-pm-action-consequence') === 1` + `toContain('>通过即归档<')` | 若保留 class 作 sr-only 节点则仍绿，但**断言对象**从"可见后果"变成"隐藏节点" | **不改也能过，但必须在实施汇报里显式声明保留了该 class**（见 `interfaces.md` 耦合⑦） |

**新增两条**：① 主操作有 `aria-describedby` 且指向节点文本 === 服务端 `consequence`；
② 行尾标文本 === 「需人工确认」且 `data-human-only-mark="1"` 仍在。

### TC-24: 原型漂移断言改造（差异恰为可枚举的两处） `validates: FR-11` <!-- serves: FR-11 -->

**测试目标**：原型内联壳与真实 `buildReportShell` 输出的差异**恰好**是可枚举的已声明偏差，不是"不崩就算过"。

**前置条件（顺序不许颠倒）**：
1. **先**把出图脚本的 `PROTO` 常量指向权威原型 `prototypes/detail-ui-v3.html`（现状仍指向**被取代的前一版**，见「已知陷阱」K7）；
2. **再**按 D-8 与 FR-11 的改动**重新内联**原型壳（否则漂移核对那一关先红）。

**步骤（跑什么）**：`npx tsx scripts/req-detail-ui-prototype-shot.mts`

**预期（看什么信号）**：
- 退出码 **0**；段比对判据改为"抹平**已声明偏差**后逐字节相同"，已声明偏差**恰好三处**：
  ① 图标 emoji→内联 SVG；② 补 ARIA / 稳定 id；③ D-8 的窗口组容器归属位移；
- FR-11 那两处删除落成**逐节点断言**："少的正好是那**一个** label span 与那**一个**常驻后果 span，
  新增的 sr-only 节点文本 === 服务端 `consequence`"；
- **禁止**把断言删掉、也**禁止**放宽成"不崩就算过"；
- 观测与 before/after 图同批产出（`proto-geometry` 块内当前 36 条，改后条数与内容须随之更新）。

### TC-25: 视觉层级 H1～H5 `validates: FR-12` <!-- serves: FR-12 -->

**测试目标**：层次感做成可测的五条。

**步骤（跑什么）**：探针 / 出图脚本新增断言组（H1～H5），同批打印实测值。

**预期（看什么信号）**：

| # | 判据 | 阈值 | 改前（实测） |
|---|---|---|---|
| H1 | `h1 字号 ÷ 正文字号` | **≥1.8** | 1.54 ✗ |
| H2 | `模块间距 ÷ 模块内间距` | **≥3** | 1.25 ✗ |
| H3 | 模块标题 vs 正文：**字号与字重都不同** | `15/600` vs `13/400` | 同号 13 ✗ |
| H4 | 卡片内三格字号档数 | **=3 且两两差 ≥2px** | — |
| H5 | 主色文字类数 | **≤1** | — |

- 模块结构须同时具备"模块间距"与"标题行"两个边界信号（不许只靠一条 hairline）；
- **间距口径**（见 `interfaces.md` 待裁定 C3，父代理 2026-10-05 裁决）：模块间距取 **`--pm-space-module: 36px`**（FR-12 B 的显式值）、模块内 `--s2` = 8px → H2 = **4.5 ≥ 3** ✓；
  `36px` 是 FR-7 #3 间距闭集（`4/8/12/16/20/28`）的**唯一具名例外**，须在 `design/frontend.md` 同批声明；
  因此"阶梯外间距"断言必须**显式放行 `--pm-space-module` 这一个令牌**（不是放宽整条判据，也不许出现第二个脱栅格值）；
- 判据脚本里的阈值与本文一致（阈值是设计决策，写在文档与脚本里）。

### TC-26: 详情页无评论输入入口 + 对话 Tab 评论框仍可提交 `validates: FR-13` <!-- serves: FR-13 -->

**测试目标**：删对了（头部入口没了）**且没删过头**（对话 Tab 链路完好）。

**前置条件**：`report-head.ts:455-458` 的表单已删；对话 Tab 面板一字未动。

**步骤（跑什么）**：
1. 渲染断言（详情页头部）：产物**不含** `dsh-pm-comment-form` / 头部 `data-action="add-comment"` / `data-role="comment-input"`；
   但**含**评论列表（`data-comment-list`，只读的「最近评论 N 条（新的在下）」）
2. 渲染断言（对话 Tab）：切到 `dialogue` 后面板内 `.dsh-pm-comment-form` 存在，
   其 `[data-role="comment-input"]` 可被 `commentInputOf(sendButton, root)` 取到（`board-mount.ts:276-284` 的作用域查找**命中它**）
3. 交互断言：点该表单的发送按钮仍走 `add-comment`（提交不被拦）
4. 既有相关断言按"不存在"改写 + 本条新增

**预期（看什么信号）**：
- ① 三项"不含"全中，评论列表仍在（内容不因删入口而消失）；
- ② 作用域查找**不回落到"整页第一个输入框"**（那正是 `board-mount.ts:270-275` 注释里说的静默失败）；
- ③ 提交链路走通、有留痕；
- **这是"删过头"的唯一防线**——没有它，两处一起删掉时页面看起来"更干净"，没有任何断言会响。

### TC-27: 冻结面回归（`data-*` / 写路径 / 端点 / 信封） `validates: FR-13` <!-- serves: FR-3, FR-13 -->

**测试目标**：本次**没有**动冻结面（除已声明的删除项与加法式属性之外，一字未变）。

**步骤（跑什么）**：
1. `git diff --stat` 复核改动面只落在声明的文件（`src/client/icons.ts`（新增）、`src/client/views/report-tabs.ts`、`report-head.ts`、`report-band.ts`、`panels/prompts.ts`、`src/client/styles/report.ts`、两个测试文件、两个脚本）
2. `grep -rn 'data-action="' src/client/views/report-head.ts src/client/views/report-tabs.ts` → 通道名集合与改前**逐字相同**（`move-req`/`plan-approve`/`plan-reject`/`verify-pass`/`verify-rework`/`switch-tab`/`add-comment`/`jump-session`/`back`/`report-*-retry`）
3. `grep -rn 'data-report-shell\|data-report-seg\|data-report-head\|data-report-band\|data-report-tabs\|data-panel\|data-dag-tab\|data-msg-text-raw' src/client/` → 无删除、无重命名（只可能新增属性）
4. `npx tsx scripts/req-report-probe.mts`（A1～A6 全过）+ 端点形状相关既有用例全绿

**预期（看什么信号）**：
- 六条只读端点与 `PanelResult`/`Degrade` 形状零变化（不新增字段、不改 `available=false` 纪律）；
- 服务端字符串（`label` / `consequence` / `verdictLine`）一字未改；
- 其它样式分片（`base.ts` / `board.ts` / `detail.ts` / `node-panel.ts` …）**一行未改**；
- 无内层滚动、无高度上限（既有判据同批全过）。

### TC-28: 五块未覆盖面板补测（原型标本只渲染「汇报」） `validates: FR-5` <!-- serves: FR-1, FR-5, FR-7 -->

**测试目标**：`docs / dag / dialogue / token / prompts` 五块补齐三条判据的**实测**（不再只是"覆盖规则"）。

**前置条件**：接真页面或扩标本（`scripts/fixtures/req-detail-specimen.mts`）——原型标本只渲染 trunk，
那五块**不在标本 DOM 里**，所以原型对它们**只写了覆盖规则、没有实测**。

**步骤（跑什么）**：探针 / 出图脚本扩大到五块面板，逐块量：① 交互目标尺寸（FR-5）；
② 字号档（FR-7）；③ 结构位图标是否已去 emoji（FR-1，含 `prompts` 面板的 `🧱`）。

**预期（看什么信号）**：
- 五块的 `minTargetW/H ≥ 24`、字号 ⊆ 阶梯、结构位无 emoji，**逐块打印实测值**；
- 任一块未实测到 → 该条**不算过**（不许把"覆盖规则"当成"已验过"）。

## 探针与出图命令用例 `serves: FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12`

> 需求验收标准 8 条 → 命令与通过信号的一一对应（`requirement.md:790-803`）。
> **退出码语义统一**：`0` 全过 / `1` 有断言失败 / `2` 环境不可用（找不到 Chrome——响亮失败，不静默跳过）。

| # | 判据 | 命令 | 通过信号 | 服务于 |
|---|---|---|---|---|
| 1 | 渲染硬判据四组合（1280/900 × 在途/终态）全过 | `npx tsx scripts/req-report-probe.mts` | 退出码 0，输出含 `tabsTop ≤ 713` | FR-7 |
| 2 | 新增可访问性判据（焦点环 / 目标尺寸 / 最小字号 / reduced-motion / 阶段条非颜色标记） | 同一探针（**新增断言组**） | 退出码 0；**每条断言打印实测值** | FR-2、FR-5、FR-6、FR-7、FR-8 |
| 3 | 对比度报表（含组合背景 + 反白关系） | 新增脚本（落 `scripts/`，基线 `evidence/contrast-baseline.txt`） | 退出码 0；每个色值有实测比值与判定；芯片 tint 三条也须绿 | FR-4 |
| 4 | 浅色岛口径（不受宿主主题翻转） | 同 `v` 下 `?theme=dark&v=next` vs `?v=next` 出图 sha256 对照 + `grep` 断言 | 两档 PNG 逐字节相同；不引用宿主主题敏感令牌；`[data-ds-dark-theme]` 岛内覆盖已移除。**不许拿 `?v=current` 当对照组** | FR-4 |
| 4b | 原型自身可复现、且与真实壳只差已声明的三处 | `npx tsx scripts/req-detail-ui-prototype-shot.mts`（**须先把 `PROTO` 指向 v3**） | 退出码 0；除三处已声明偏差外逐字节相同；观测与 before/after 图同批产出 | FR-9、FR-11 |
| 4c | 五块未覆盖面板补测 | 同一脚本（扩大到真页面或扩标本后） | docs/dag/dialogue/token/prompts 的目标尺寸、字阶、结构位图标三条都**实测到** | FR-1、FR-5、FR-7 |
| 5 | 结构位无 emoji 图标 | `grep -rn` 断言（写进用例或脚本） | 命中数 0（例外清单逐条给理由） | FR-1 |
| 6 | 客户端 bundle 重建通过 | `pnpm build:client`（C-12） | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` | FR-1、FR-10 |
| 7 | 构建 / 类型 / 测试 / 知识层 | `pnpm build`（C-11）、`pnpm typecheck`（C-15）、`pnpm test`（C-14）、`pnpm kb:build && pnpm kb:check`（C-13） | 与基线比**不劣化**：`pnpm test` 失败数 ≤ 基线 **106** 且新增/改动用例全绿；`tsc --noEmit` 错误数 ≤ 基线 **223**；知识层退出码 0（生成物零漂移 + 九项自检 + K10 覆盖度） | FR-4、FR-10、FR-12 |
| 8 | before/after 可对照 | `docs/requirements/REQ-261005155003-f32f/evidence/` 下基线图与改后图 | 同宽同状态成对存在（`ui-before-*` / `ui-after-*`），差异可肉眼指出 | FR-1～FR-13 |

**调用顺序（写死，不许颠倒）**：
1. `npx tsx scripts/req-detail-ui-prototype-shot.mts`（**改 `PROTO` 指向 v3 之后**）→ 出图 + 几何断言 + 漂移核对；
2. `npx tsx scripts/req-report-probe.mts`（对 `src/` 的真页面壳）；
3. `pnpm build:client` → `pnpm test` → `pnpm typecheck` → `pnpm kb:build && pnpm kb:check`。

## 已知陷阱与反例断言 `serves: FR-1, FR-4, FR-6, FR-7, FR-8, FR-10, FR-11, FR-13`

> 这一节不是"注意事项"，是**会静默变绿/静默变红**的具体机关。每条都给了判红条件。

| # | 陷阱 | 现象（可复现） | 反例断言（判红条件） |
|---|---|---|---|
| K7 | **出图脚本的 `PROTO` 仍指向被取代的原型** | `scripts/req-detail-ui-prototype-shot.mts:55` 的常量指向前一版；直接跑只会回填旧版的 PNG 与 `proto-geometry`——而验收标准 #4b 要求它退出码 0 | 实施**第一步**必须是"把 `PROTO` 指向 `prototypes/detail-ui-v3.html` 并跑一次"；若跑出红（三条断言报错），说明 v3 的内联壳被人手改过 → 要么修 v3、要么把漂移口径改成"只允许已声明的偏差"。**不许**理解成"脚本能跑就算过" |
| K8 | **拿 `?v=current` 当改前外观** | 原型自述称 `?v=current` = 改造前，但文件里**没有任何 `[data-proto-v]` CSS 门控**；实测 `?v=current` 与 `?v=next` 的头部矩形**逐项相同**、七项多样性也**逐项相同** | 任何"改前 vs 改后"断言若以 `?v=current` 为基线 → **判红**（自己跟自己比，永真）。改前一律用 `evidence/ui-before-*.png`；浅色岛用**同 `v`** 下 dark vs 浅色对照 |
| T1 | **FR-7 的"最小真文字 ≥11px"被 sr-only 假红** | `.dsh-pm-action-consequence` 当前实测 `font-size: 10.5px` / `0×0` / `overflow:hidden`（FR-11 之后它仍是视觉隐藏节点） | 断言**必须**按可见性过滤（推荐）或把那处 sr-only 字号提到 11px；二选一写进实施汇报。不过滤 → 必然假红 |
| T2 | **FR-11 的"原型 CSS 隐藏"被当成已达成** | 原型里 `.dsh-pm-action-bar-label` 与 `.dsh-pm-action-consequence` 是 `display` 层隐藏（实测 `0×0`）、**DOM 节点仍在**；而验收锚点要求**真删 DOM 节点** | 断言必须是**真 DOM / 字符串**判据（不是"看不见就算没有"）；原型只是预览 |
| T3 | **只留 `title` 的 hover-only 反模式** | FR-11 #2 若实现成"删掉常驻后果、只留 `title`"，触屏/键盘/读屏都拿不到后果 | 断言：主操作**必须有** `aria-describedby` 且指向节点文本 === 服务端 `consequence`、节点视觉隐藏但对读屏可见 —— 缺一判红 |
| T4 | **本机 `prefers-reduced-motion` 恒为 reduce** | 不加 flag 也是 reduce；`--force-prefers-reduced-motion=no-preference` 压不住 → 计算样式永远 `0s` | **不放宽阈值**：FR-6 ④ 用计算样式断言（量到了），FR-6 ①②③ 用 CSS 文本静态断言（只是读出来的）——脚本里必须写明哪条量到了、哪条只是读出来的 |
| T5 | **加高/改字号把 Tab 栏顶出首屏** | 首屏余量最紧一档只有 110px（v3 实测 `tabsTop@900=603`，上限 713） | 探针四组合的 `tabsTop ≤ 713` 一红即判失败；不许用 `max-height` / 内层滚动去"达标"（A3 会同时判红） |
| T6 | **`12.5px` 可见真文字被漏掉** | `src/client/styles/report.ts:307` 等 ~10 处 `12.5px`，是**可见真文字**且属阶梯外档 | TC-15 的档位集合断言必须把它揪出来（"无阶梯外字号"）；只查最小字号会漏 |
| T7 | **属性顺序把既有断言弄红** | `tests/report-shell.test.ts:138` 按**属性顺序**做子串匹配 | 新属性追加在既有属性之后（推荐）或同步改断言，二选一并在实施汇报写明；TC-7 的**否证步骤**（剥离新属性后旧断言全绿）必须过 |
| T8 | **删过头：连对话 Tab 的评论框一起删** | `board-mount.ts:276-284` 按作用域取评论框，找不到就回落"整页第一个输入框"→ 点了没反应、也不报错 | TC-26 是唯一防线；缺它则"更干净"的删法没有任何断言会响 |
| T9 | **五块面板"只写了覆盖规则"当成"已验过"** | 原型标本只渲染「汇报」，`docs/dag/dialogue/token/prompts` 不在标本 DOM 里 | 验收标准 #4c：五块的目标尺寸/字阶/结构位图标三条都**实测到**才算过 |
| T10 | **FR-8 的标记只做成 CSS `::before`** | 原型受"只换 CSS 层"约束用 `::before`；`::before` 的内容**读屏不保证读到** | 断言"对应元素内存在**文本节点或 svg 子节点**"；只有伪元素 → 判红 |
| T11 | **把断言删掉/放宽当过关** | FR-11 #6 与漂移核对都明令禁止 | 漂移断言只许改口径（差异恰为可枚举的已声明偏差），不许删、不许放宽成"不崩就算过"；"存在 → 不存在"是换判据，删掉是丢判据 |
| T12 | **原始标本的骨架漂移后继续"绿"** | 标本（mock 数据/壳结构/文案）一改，内联进原型的那份就悄悄过期，而 PNG 与观测值会继续绿着说一个不存在的页面 | 出图脚本每次运行前重算真实壳并逐段比对（`driftCheck`），对不上即退出码 1；本次因 D-8 位移必须同步改该口径 |

## 测试覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13`

| 需求条款 | 关联任务 | 测试用例 | 覆盖状态 |
|---|---|---|---|
| FR-1（结构图标内联 SVG） | —（待回填） | TC-1, TC-2, TC-28 + 命令表 #5、#6 | ✅ 已覆盖（含 4c 补测） |
| FR-2（键盘焦点可见） | —（待回填） | TC-3, TC-4 + 命令表 #2 | ✅ 已覆盖 |
| FR-3（Tab 语义与键盘） | —（待回填） | TC-5, TC-6, TC-7, TC-8, TC-27 | ✅ 已覆盖 |
| FR-4（浅色岛 + 对比度） | —（待回填） | TC-9, TC-10, TC-11 + 命令表 #3、#4 | ✅ 已覆盖 |
| FR-5（目标尺寸） | —（待回填） | TC-12, TC-13, TC-28 + 命令表 #2、#4c | ✅ 已覆盖 |
| FR-6（动效令牌与 reduced-motion） | —（待回填） | TC-14 + 命令表 #2（含 T4 拆判据） | ✅ 已覆盖（"非 reduce 下不是瞬变"本机量不到，已拆为静态断言） |
| FR-7（排版节奏 / 首屏预算） | —（待回填） | TC-15, TC-16, TC-28 + 命令表 #1 | ✅ 已覆盖（含 T1 sr-only、T6 12.5px 两个陷阱） |
| FR-8（状态不只靠颜色） | —（待回填） | TC-17, TC-18 + 命令表 #2 | ✅ 已覆盖（含 T10 伪元素反例） |
| FR-9（操作条动作布局 / D-8 拆行） | —（待回填） | TC-19, TC-20 + 命令表 #4b | ✅ 已覆盖 |
| FR-10（视觉语言苹果式克制） | —（待回填） | TC-21 + 命令表 #6、#7 | ✅ 已覆盖（含 K8 基线陷阱） |
| FR-11（操作条文案收敛） | —（待回填） | TC-22, TC-23, TC-24 + 命令表 #4b | ✅ 已覆盖（含 T2、T3、T11 反例） |
| FR-12（视觉层级 H1～H5） | —（待回填） | TC-25 + 命令表 #7 | ✅ 已覆盖 |
| FR-13（移除评论输入入口） | —（待回填） | TC-26, TC-27 | ✅ 已覆盖（含 T8「删过头」防线） |
| 验收标准 #1～#8 | —（待回填） | 见「探针与出图命令用例」表 #1/#2/#3/#4/#4b/#4c/#5/#6/#7/#8 | ✅ 逐条有命令与通过信号 |
| 已知问题 K7 / K8 | —（待回填） | 「已知陷阱」K7、K8 + TC-10、TC-21、TC-24 | ✅ 已落成可判定反例 |

**统计**：用例 **28** 条；`FR-1`～`FR-13` **13/13 全覆盖**；验收标准 8 条逐条落到命令与信号；
已知问题 K7/K8 两条都落成"判红条件"。

## 关键决策与取舍 `serves: FR-2, FR-5, FR-6, FR-7, FR-8, FR-10, FR-11`

> 主体写进 `architecture.md` 的同名节；本份只就地补**与本份主题（测试口径）相关**的取舍。

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| reduced-motion 的判据 | 放宽阈值 / 假装量到了 | **拆判据**：④ 计算样式断言，①②③ CSS 文本静态断言 | 本机 headless 恒为 reduce，测不到"非 reduce 不是瞬变"；放宽阈值等于把这条判据作废（T4） |
| 焦点/尺寸/字号的量法 | 静态读 CSS 源码 | **探针真 DOM 计算样式 + `getBoundingClientRect()`** | FR-5 的判据是**命中区**不是视觉框；CSS 源码读不出命中区与遮挡（FR-2 #3） |
| 浅色岛的对照方式 | `?v=current` vs `?v=next` | **同 `v` 下 `?theme=dark` vs 浅色**（sha256） | K8：`?v=current` 与 `?v=next` 实测逐项相同，那样对照是永真断言 |
| 最小字号的取数范围 | 全量元素（含 sr-only） | **按可见性过滤**（排除 `0×0` / `clip-path` / `overflow:hidden`） | FR-11 让后果改走 sr-only，不过滤必然假红（T1、FR-7 锚点） |
| FR-11 的断言改法 | 删掉旧断言 / 放宽 | **"存在 → 不出现"换判据 + 新增两条** | 删断言 = 丢判据；FR-11 #5 明令 |
| 灰度判据 | 全自动（按色差算） | **自动出灰度图 + 人工评审** | FR-8 的"可区分"是知觉判断，机算容易做成"数值达标但看不出"；人工评审结论落 `evidence/` |
| 漂移核对的改法 | 删掉逐字节比对 | **改口径为"差异恰为可枚举的已声明偏差"** | 逐字节是防漂移的价值所在；删掉等于把价值扔掉（FR-11 #6） |
| 覆盖度怎么算 | 只数"有没有用例" | **逐条点名命令 + 通过信号 + 判红条件** | 本需求是 expert 档：判据必须可机器验证（D-2） |

## 技术方案与亮点 `serves: FR-1, FR-5, FR-7, FR-10`

> 同上：只写与本份主题相关的差异。

| 差异点 | 常规做法 | 本次做法 | 可核验指向 |
|---|---|---|---|
| 用例不只写"预期"，写"命令 + 信号 + 判红条件" | 用例文档写"应正确显示" | 每条给出可跑的 `npx tsx` / `pnpm` / `grep`，并写明**什么算红** | 本文「探针与出图命令用例」+ 各 TC 的"预期（看什么信号）" |
| 反例断言与正向断言同权重 | 只测"该有的有" | 每个高风险改动配一条**反例**（删过头、假红、永真、伪元素、hover-only） | T1～T12 |
| 陷阱当一等公民 | 陷阱散落在提交说明里 | 把 K7 / K8 / T1～T12 写成**可判定反例**（写进脚本注释与断言） | 本文「已知陷阱与反例断言」 |
| 阈值单点 | 阈值散落在文档与注释 | 阈值只在脚本与设计文档；原型 `proto-geometry` 只放观测值 | `scripts/req-detail-ui-prototype-shot.mts` 模块注释「三条纪律」① |
| 覆盖度可核 | "覆盖率 100%"（口号） | FR → 用例的**双向表**（谁覆盖谁 + 哪条命令判） | 本文「测试覆盖度统计」 |
| 分层：静态 / 渲染 / 探针 | 全塞进一个 e2e | 三条腿各测它能测的（静态能测"无裸 ms"，探针能测"命中区 24px"） | 各 TC 的"步骤（跑什么）" |
