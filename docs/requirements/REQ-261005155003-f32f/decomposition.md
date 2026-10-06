# 拆分计划（REQ-261005155003-f32f）

> **目标**：把「需求详情页」的**外观层**提到与信息架构相称的水准——**看得清**（三档文字 ≥4.5:1、字阶收到六档、层级可测）、
> **走得通**（焦点环可见、Tab 有语义与方向键）、**点得中**（交互目标 ≥24×24）、**不刺眼**（动效令牌 + reduced-motion），
> 且**首屏预算不回退**（`tabsTop ≤ 713`）、冻结面一字不改。
> **做法**：改动钉在三个单点上——① 渲染字符串（`src/client/icons.ts` 新增 + `views/report-*` 的图标/ARIA/文案）；
> ② 唯一外观分片 `src/client/styles/report.ts`（浅色岛令牌 / 焦点环 / 字阶 / 间距 / 动效）；
> ③ 判据层（探针新增可访问性断言组、新增对比度报表脚本、出图脚本改指权威原型 v3）。其余一律不碰。
> 本计划须**人批准**后才能落任务卡（reqboard_decompose）。**覆盖不齐不许批**——缺什么回什么节点补文档（见文末「覆盖完整性规则」）。
> **容量**：`detailUnits = files×1 + anchors×0.5 + chars/2000`，缺省容量 **16 DU**（`src/domain/limits.ts` 的 `roundDetailUnits`，`calibrated=false` 的待标定假设值）；
> 本计划 16 张卡**全部 ≤ 16 DU**（最重 t10 = 7.60），**无超容量卡**，逐卡读数见「体量声明（footprint 与 DU）」。

## 编号口径

（覆盖对照靠编号跨文档拉齐；引用必须能在对方文档里查到——查不到 = 悬空引用，等同于没写。）

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（本需求 **FR-1～FR-13**） |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（**D-1～D-8**）——任务卡「关联 D-x」列与验收单「D-x 对照」项按它回取原话 |
| I-x | interfaces.md §变更面总览 ①～⑧（**本计划内按位编号**，见下方对照表） | 接口 / 客户端契约面 |
| P-x / C-x | frontend.md §页面与组件（编号表） | 页面 / 组件（P-1、C-1～C-15） |
| UC-x | use-cases.md 场景总览 | 用户场景（UC-1～UC-6） |
| TC-x | test-cases.md 功能测试用例 | 测试用例（TC-1～TC-28） |
| tN | 本文档任务表 | 计划 key（t1…t16） |

三条编号纪律（本计划实际执行的）：

1. **interfaces.md 没有原生 `I-x` 记法**——它用 ①～⑧ 列「变更面总览」。本计划**按位**给它编 `I-1…I-8`（下表逐条对照到 ①～⑧），除此之外全篇引用都以 interfaces.md 的 ①～⑧ 为准可查（下表「interfaces.md 出处」列即回查键）。
2. **C-x 取 frontend.md §页面与组件（编号表）** 的 C-1…C-15。该文另有一张 §原型页面 的 `P-x/C-x ↔ #FR-N` 简表，**C-3 起与编号表分叉（同号不同物）**——本计划**不用它做编号来源**，只用它取锚点；原型锚点一律以 `prototypes/INDEX.md` 的**权威行**（`prototypes/detail-ui-v3.html`，标 authoritative）为准，指向 v2（superseded）会被 `prototype_version_conflict` 拒。
3. **本需求没有 T-x / S-x / M-x**：data-model.md 已定「无表结构变更、无新增读取」，interfaces.md 已定「不新增、不修改任何 Agent 工具接口」——没有表/服务/迁移可编号。UC-x 不进「页面/模块」列，改由文末「反向核查」逐条认领（同号不重复计两遍）。

**I-x 对照（本计划内编号 ↔ interfaces.md 的 ①～⑧）**

| 编号 | 名称 | interfaces.md 出处 | serves |
|---|---|---|---|
| I-1 | 新增模块 `src/client/icons.ts`（纯导出 `TAB_ICON_SVG` / `GAP_DOT_SVG`，零依赖零副作用） | ① | FR-1, FR-8 |
| I-2 | 加法式 DOM 可访问性属性（`role` / `aria-*` / `tabindex` / 稳定 id，**追加在既有属性之后**） | ② | FR-2, FR-3, FR-5, FR-8, FR-11 |
| I-3 | DOM 结构位图标内容（emoji → 内联 SVG，换实现不换契约） | ③ | FR-1 |
| I-4 | DOM 删除项（头部评论表单 / 操作条分组标签 / 常驻后果节点） | ④ | FR-11, FR-13 |
| I-5 | DOM 位移（`.dsh-pm-report-windows` 移入身份行，**唯一一处已声明位移**） | ⑤ | FR-9 |
| I-6 | CSS 令牌（新增 `--pm-icon*` / `--pm-dur-*` / `--pm-ease` / `--pm-accent-text` / `--pm-focus-*` / `--f-l1` / `--lh-*` / `--pm-space-module`；取值收窄为页面自持浅色原值） | ⑥ | FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-10, FR-12 |
| I-7 | CSS 覆盖块删除（`[data-ds-dark-theme] .dsh-pm-detail[data-report-shell]`） | ⑦ | FR-4 |
| I-8 | HTTP API / 信封 / 写路径 / 服务端字符串（冻结，零变更） | ⑧ | FR-3, FR-4, FR-9, FR-11, FR-13 |

**P-x / C-x 对照（取 frontend.md §页面与组件（编号表））**

| 编号 | 名称 | 编号 | 名称 |
|---|---|---|---|
| P-1 | 需求详情页（report shell） | C-8 | 状态带三格 |
| C-1 | Tab 栏 | C-9 | 缺口行 |
| C-2 | Tab 图标族 | C-10 | 面板宿主 |
| C-3 | 常驻头部 | C-11 | 六个 Tab 面板 |
| C-4 | 操作条动作区 | C-12 | 最近评论只读列表 |
| C-5 | 操作条文案与披露 | C-13 | 一句话结论与下一步 |
| C-6 | 身份行 | C-14 | 外观层（REPORT_CSS，唯一样式源） |
| C-7 | 阶段条 | C-15 | 结构图标常量（与 C-2 同源） |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 落地浅色岛令牌块并移除宿主深色覆盖 | FR-4, FR-10 | I-6, I-7 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-4, #FR-10 | D-3, D-5 | ui | frontend | — | M | ① `grep -n -e '--dsw-text-primary' -e '--dsw-text-secondary' -e '--dsw-accent' -e '--dsw-bg-primary' -e '--dsw-alias-label-tertiary' src/client/styles/report.ts` 命中 0；② `grep -c 'data-ds-dark-theme' src/client/styles/report.ts` = 0；③ `grep -c 'rgba(128,128,128' src/client/styles/report.ts` = 0 且 --pm-text3 的值是 #86868b（只做非文本，逐处注释列明）；④ 原型对照（可失败）：headless Chrome 对 prototypes/detail-ui-v3.html?theme=dark&v=next&annot=0 与 ?v=next&annot=0 各出一张 PNG（1280 档 · 在途，--window-size=1280,800 --hide-scrollbars），shasum -a 256 两值相同；禁止用 ?v=current 当对照组（K8）；⑤ `pnpm build:client` 输出含 [verify-client] OK。 | （skipIntegration：本卡无接口可联调） |
| t2 | （落库后回填） | 新建单一图标源模块 src/client/icons.ts | FR-1 | I-1 + src/client/icons.ts（新增）; tests/report-shell.test.ts（图标族用例群） | prototypes/detail-ui-v3.html#FR-1 | D-1 | ui | frontend | — | S | ① `grep -c 'viewBox=' src/client/icons.ts` = 9（6 个 Tab + 3 个圆点）；② `grep -c -e 'width=' -e 'height=' -e 'style=' src/client/icons.ts` = 0，且 6 位十六进制色值 0 命中；③ `grep -c 'aria-hidden' src/client/icons.ts` = 9 且每个值恰 1 个 <svg；④ `npx vitest run tests/report-shell.test.ts -t '图标族'` 全绿（九键齐全、无尺寸与颜色字面量）；⑤ 原型对照（可失败）：权威原型 prototypes/detail-ui-v3.html#FR-1（1280 档 · 在途，--window-size=1280,800）实测 Tab 栏内 <svg> 宽高 14±1（6/6 命中），且本模块字符串无尺寸字面量 → 尺寸只能来自 CSS 令牌；对照截图与差异说明落 docs/requirements/REQ-261005155003-f32f/evidence/。⑥ `pnpm build:client` 含 [verify-client] OK（新增客户端模块后 bundle 重建通过，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t3 | （落库后回填） | Tab 栏换内联 SVG 并补 tablist/tab 语义与方向键 | FR-1, FR-3 | I-2, I-3 + src/client/views/report-tabs.ts; src/client/icons.ts（引用） | prototypes/detail-ui-v3.html#FR-1, #FR-3 | D-1 | ui | frontend | t2 | M | ① `npx vitest run tests/report-shell.test.ts -t 'Tab 栏'` 全绿且该文件 :138 逐字未改；② 渲染断言：产物含 1 个 role=tablist（带 aria-label），每项含 role=tab 与 aria-selected，aria-selected=true 恰 1 个且等于 active 键；每项 aria-controls=panel-<key>，面板容器 role=tabpanel 且 id=panel-<key>、aria-labelledby=tab-<key>，id 形态只有 tab-<key>/panel-<key>；③ `npx tsx scripts/req-report-probe.mts` 退出码 0（A4：未激活面板 0 个、包装器恰 1 个、默认 trunk 在场）；④ 否证步骤：剥离全部新增属性后既有断言仍全绿（加法式成立），若出现红即说明是改契约而不是加属性；⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-3（1280 档 · 在途，--window-size=1280,800）实测 role=tablist 在场、选中项恰 1 个 aria-selected=true、←/→ 后焦点与 selected 同时前移一格且面板段换成 panel-<新 key>。⑥ `pnpm build:client` 含 [verify-client] OK（改客户端渲染源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t4 | （落库后回填） | 统一键盘焦点环（两档偏移） | FR-2 | I-6 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-2 | D-1 | ui | frontend | t1 | S | ① `grep -c 'focus-visible' src/client/styles/report.ts` ≥ 1，且 grep -n 输出逐类命中 FR-2 清单（缺一类即红）；② 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-2（1280 档 · 在途，--window-size=1280,800）用键盘聚焦一个 .dsh-pm-tab，计算样式 outline-width:2px、outline-offset:-2px、outline-color:rgb(0,113,227)；原型上 data-proto-focus=1 的方框是演示，不得当默认外观；③ 探针读数（t14 的 A7 组）：清单控件 el.focus() 后 outlineWidth ≥ 2px、outlineColor 与背景对比 ≥ 3:1、outlineOffset = -2px（面状）/2px（小控件），浅深两套宿主主题各跑一次；④ 鼠标路径无环：page.mouse.click() 后 outline 为 none/0；⑤ `pnpm build:client` 含 [verify-client] OK。 | （skipIntegration：本卡无接口可联调） |
| t5 | （落库后回填） | 把交互目标加高到 ≥24×24（窗口胶囊/行内链接） | FR-5 | I-2, I-6 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-5 | D-1 | ui | frontend | t1 | S | ① 探针读数（t14 的 A8 组，可失败）：遍历 button/[role=tab]/a[href]/summary/input，getBoundingClientRect() 宽高均 ≥ 24、相邻间隙 ≥ 8px，例外清单显式写在断言里逐条给理由；② 静态：grep -n -e 'dsh-pm-window' -e 'dsh-pm-trunk-open' src/client/styles/report.ts 命中处带 min-height:24px 或 ::after 命中区规则；③ `npx tsx scripts/req-report-probe.mts` 退出码 0（A1 的 tabsTop ≤ 713、A2 无横向溢出、A3 无内层滚动、A5 不重叠、A6 整块 ≤ 72px）；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-5（1280 档 · 在途，--window-size=1280,800）实测最矮目标 .dsh-pm-window = 203.1×24.0、.dsh-pm-trunk-open ≥ 24 高（proto-geometry 记 48×24），对照截图与差异说明落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK（改客户端外观源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t6 | （落库后回填） | 落地动效令牌与 reduced-motion 分支 | FR-6 | I-6 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-6 | D-1 | ui | frontend | t1 | S | ① `grep -c -e 'transition' src/client/styles/report.ts` ≥ 1，且 `grep -n 'ms' src/client/styles/report.ts` 的输出里 transition 时长全部形如 var(--pm-dur，裸 ms 字面量 0 命中；② `grep -c 'prefers-reduced-motion' src/client/styles/report.ts` ≥ 1，且该分支内三个时长令牌均为 0s；③ 探针读数（t14 的 A10 组）：模拟 reduced-motion 后计算 transitionDuration = 0s（脚本注释写明本机 headless 恒为 reduce，只报量到的这一条，①②是 CSS 文本静态断言）；④ `npx tsx scripts/req-report-probe.mts` 退出码 0（过渡不改几何：宽高与 offsetTop/offsetLeft 前后一致）；⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-6（1280 档 · 在途，--window-size=1280,800）实测 reduced-motion 下过渡时长 0s，与 proto-geometry 读数一致。⑥ `pnpm build:client` 含 [verify-client] OK（改客户端外观源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t7 | （落库后回填） | 收敛字阶到六档并重建视觉层级（间距 36px／模块上下结构／主色纪律） | FR-7, FR-12 | I-6 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-7, #FR-12 | D-5, D-7 | ui | frontend | t1 | M | ① 静态：grep -nE 裸 font-size 数字 px 在 src/client/styles/report.ts 除令牌定义处 0 命中；`grep -n -e '9.5px' -e '10px' -e '10.5px' -e '11.5px' -e '12.5px' -e '13.5px' -e '21px' src/client/styles/report.ts` 在字号位 0 命中；`grep -n -e 'font-weight: 650' -e 'font-weight: 660' -e 'font-weight: 700' src/client/styles/report.ts` 0 命中；② `npx tsx scripts/req-report-probe.mts` 退出码 0（tabsTop ≤ 713、状态带单格 ≤ 220px、操作条 ≤ 72px、无内层滚动、无横向溢出）；③ 探针读数（t14 的 A9/A12 组，可失败）：可见真文字最小 font-size ≥ 11px、档位集合 ⊆ {11,12,13,15,20,24} 且无阶梯外字号（按可见性排除 sr-only）；H1 24÷13=1.85 ≥ 1.8、H2 36÷8=4.5 ≥ 3、H3 模块标题 15/600 对正文 13/400、H4 卡片内三格档数 3 且两两差 ≥ 2px、H5 主色文字类数 ≤ 1；④ 阶梯外间距断言显式放行 --pm-space-module 一个令牌，出现第二个脱栅格值即红；⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-7 与 #FR-12（1280 档 · 在途，--window-size=1280,800）实测 h1=24px、模块标题 15px/600，原型 moduleGap=24px 与 C3 裁决的 36px 差异逐条写明理由，截图与差异说明落 evidence/；⑥ `pnpm kb:build && pnpm kb:check` 退出码 0（字阶与色值是生成物来源）。⑦ `pnpm build:client` 含 [verify-client] OK（改客户端外观源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t8 | （落库后回填） | 收敛胶囊/圆角/边线/阴影（苹果式克制） | FR-10 | I-6 + src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-10 | D-5 | ui | frontend | t1 | M | ① 静态：`grep -n -e 'rgba(128,128,128,.11)' -e '--pm-line-soft' -e '--pm-bg-softer' -e '--pm-shadow-card' src/client/styles/report.ts` 命中 0；② 原型对照（可失败）：在 prototypes/detail-ui-v3.html#FR-10（1280 档 · 在途，--window-size=1280,800，壳内 213 个元素）复量七项多样性，读数须 ≤ 上限——胶囊 ≤ 5、前景色 ≤ 5、底色 ≤ 4、字重 ≤ 3（不含 650/660）、字号 ≤ 6 且无阶梯外值、圆角 ≤ 2、边线色 ≤ 2（原型实测 1/5/4/3/5/2/1）；复量命令与读数落 evidence/style-variety-before-after.txt、整页对照图落 evidence/ui-before-after-full-1280.png；③ 同一批断言复跑 `npx tsx scripts/req-detail-ui-prototype-shot.mts` 时 FR-1～FR-13 既有断言一条不回退（任一项超上限即退出码非 0）；④ `pnpm build:client` 含 [verify-client] OK；⑤ `pnpm kb:build && pnpm kb:check` 退出码 0。 | （skipIntegration：本卡无接口可联调） |
| t9 | （落库后回填） | 头部拆两行：动作行独占、身份行另起且窗口靠左 | FR-9 | I-5 + src/client/views/report-head.ts; src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-9 | D-4, D-7, D-8 | ui | frontend | t7 | M | ① D-8 三条（t15 出图脚本与 t14 探针各量一次，可失败）：actionRowTop < identityRowTop、identityRowTop 减 actionRowTop ≥ 8px、windowLeft < createdAtLeft（1280 与 900 两档各一组）；② 回归线：动作按钮 offsetTop 单一取值、操作条整块高 ≤ 72px、`npx tsx scripts/req-report-probe.mts` 退出码 0（A5 不重叠、A6 版式、A1 的 tabsTop ≤ 713；900 档 tabsTop 由 577 变 603 是预期值）；③ 位置不随数量漂移：同一标本注入 1/2/3 个动作各渲一次，主操作 offsetLeft 与破坏性动作位置三次相同（变体标本落 scripts/fixtures/req-detail-specimen.mts，断言随 t15 落地）；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-9（1280 档 · 在途，--window-size=1280,800）实测 actionGridLeft 等于卡片内容区左缘、窗口组在「创建于」左侧；原型「布局修复层 v2 (1)」把身份行与创建于+窗口并成一行、动作组与之同排——该写法已被 D-8 撤销，差异须逐条写进对照说明并落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK（改客户端渲染源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t10 | （落库后回填） | 操作条文案收敛并真删 DOM 节点（含两处提示文案同步） | FR-11 | I-2, I-4 + src/client/views/report-head.ts; src/client/styles/report.ts; src/client/views/artifacts.ts; src/client/views/verification.ts | prototypes/detail-ui-v3.html#FR-11 | D-6 | ui | frontend | t9 | M | ① 渲染断言：产物不含操作条那一处 .dsh-pm-action-bar-label（「本阶段操作」），且 `grep -n '本阶段操作' src/client/views/` 只命中评论列表 report-head.ts:338；② 渲染断言：主操作按钮有 aria-describedby，指向节点文本 === 服务端 consequence，该节点视觉隐藏（宽高 ≤ 1px 或 clip-path）但对读屏可见；③ 渲染断言：行尾标文本 ===「需人工确认」、data-human-only-mark=1 仍在、data-human-only=true 计数不变；④ `grep -n '本阶段操作' src/client/views/artifacts.ts src/client/views/verification.ts` 命中 0；⑤ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-11（1280 档 · 在途，--window-size=1280,800）实测 .dsh-pm-action-bar-label 与可见后果节点均 0×0（CSS 隐藏、DOM 仍在——原型只是预览，本卡要求真删），差异说明落 evidence/；⑥ `pnpm build:client` 含 [verify-client] OK。 | （skipIntegration：本卡无接口可联调） |
| t11 | （落库后回填） | 真删详情页评论输入框并保住对话 Tab 评论链路 | FR-13 | I-4 + src/client/views/report-head.ts; src/client/board-mount.ts（仅核对） | prototypes/detail-ui-v3.html#FR-13 | D-7 | ui | frontend | t9 | S | ① 渲染断言：详情页头部产物不含 dsh-pm-comment-form、不含头部 [data-action=add-comment]、不含 [data-role=comment-input]，但含 data-comment-list（「最近评论 N 条（新的在下）」仍在）；② 切到 dialogue 面板：.dsh-pm-comment-form 存在、其 [data-role=comment-input] 能被 commentInputOf(sendButton, root) 取到（不回落到整页第一个输入框），点发送仍走 add-comment——这是删过头的唯一防线；③ `npx tsx scripts/req-report-probe.mts` 退出码 0（四组合、终态只读、A4 纪律不变）；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-13（1280 档 · 在途，--window-size=1280,800）实测 proto-geometry 记 commentFormsInPage=1（头部那处 CSS 隐藏、DOM 仍在），本卡要求头部 DOM 真删、对话 Tab 那处保留，差异说明落 evidence/。⑤ `pnpm build:client` 含 [verify-client] OK（改客户端渲染源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t12 | （落库后回填） | 状态不靠颜色单一表达（真实文本／aria-hidden SVG） | FR-8 | I-1, I-2 + src/client/views/report-band.ts; src/client/views/stage-detail.ts; src/client/styles/report.ts | prototypes/detail-ui-v3.html#FR-8 | D-1 | ui | frontend | t1 | M | ① 渲染断言：阶段条三态与结论三态各自元素内存在文本节点或 svg 子节点；标记若实现为 CSS ::before content 则判红；② `grep -c -e '🔴' -e '🟡' -e '⚪' src/client/views/report-band.ts` = 0，且三档 severity 各带对应文本标记（!! / ! / ·）与 aria-hidden 的 SVG 圆；③ 灰度人工评审：探针注入 filter:grayscale(1) 后出图（1280 档在途 + 终态），人工核对阶段/缺口/结论三处仍可区分，截图落 docs/requirements/REQ-261005155003-f32f/evidence/（说不出来即判红并回到本卡）；④ 原型对照（可失败）：prototypes/detail-ui-v3.html#FR-8（1280 档 · 在途，--window-size=1280,800）实测阶段条 completed=✓ / current=▸；原型用 ::before（受只换 CSS 层约束），本卡必须落成真实节点，差异逐条说明。⑤ `pnpm build:client` 含 [verify-client] OK（改客户端渲染与外观源码后重建，C-12）。 | （skipIntegration：本卡无接口可联调） |
| t13 | （落库后回填） | 新增对比度报表脚本（读 report.ts 令牌声明） | FR-4 | I-6, I-7 + scripts/req-detail-ui-contrast.mts（新增） | prototypes/detail-ui-v3.html#FR-4 | D-1 | test | frontend | t1 | M | ① `npx tsx scripts/req-detail-ui-contrast.mts` 退出码 0，输出含每个色值的实测比值与判定（正文档 ≥ 4.5、非文本档 ≥ 3）；② 可失败性自证：临时把 --pm-warn-text 改回 #a86a00 后退出码非 0（4.44 < 4.5），恢复后复绿；③ `grep -c -e '--pm-ok-text-tint' -e '--pm-teal-text-tint' -e '--pm-danger-text' src/client/styles/report.ts` ≥ 3（tint 三值备而未用但在场）；④ `grep -c 'data-ds-dark-theme' src/client/styles/report.ts` = 0，且脚本里有「报表出现宿主深色影响即判失败」的分支；⑤ 报表落 docs/requirements/REQ-261005155003-f32f/evidence/，并与 evidence/contrast-baseline.txt 的豁免登记逐条对齐。 | dev, review, test |
| t14 | （落库后回填） | 探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记） | FR-2, FR-5, FR-6, FR-7, FR-8 | I-2, I-6 + scripts/req-report-probe.mts; scripts/fixtures/req-detail-specimen.mts | prototypes/detail-ui-v3.html#FR-2, #FR-5, #FR-6, #FR-7, #FR-8 | D-1 | test | frontend | t3, t4, t5, t6, t7, t9, t12 | M | ① `npx tsx scripts/req-report-probe.mts` 退出码 0，输出含 tabsTop ≤ 713 与 A7～A13 每条实测值行（缺一条即红）；② 可失败性自证：临时把某控件高度改到小于 24、去掉 :focus-visible、把某处字号改回 12.5px，对应断言各报红且退出码 1，恢复后复绿；③ `grep -c 'sr-only' scripts/req-report-probe.mts` ≥ 1（按可见性过滤，T1 假红防线在场）；④ 输出含 docs/dag/dialogue/token/prompts 五块逐块实测行（五块面板不再只是覆盖规则）；⑤ 退出码语义不变：0 全过、1 有断言失败、2 环境不可用（找不到 Chrome 即响亮失败，不静默跳过）。 | dev, review, test |
| t15 | （落库后回填） | 出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8） | FR-4, FR-9, FR-11 | I-4, I-5 + scripts/req-detail-ui-prototype-shot.mts; prototypes/detail-ui-v3.html（重内联） | prototypes/detail-ui-v3.html#FR-4, #FR-9, #FR-11 | D-2, D-8 | test | frontend | t9, t10, t11 | M | ① `npx tsx scripts/req-detail-ui-prototype-shot.mts` 退出码 0；② `grep -c 'detail-ui-v3.html' scripts/req-detail-ui-prototype-shot.mts` ≥ 1 且 `grep -c 'detail-ui-v2.html' scripts/req-detail-ui-prototype-shot.mts` = 0；③ 漂移核对仍逐段比对（head/band/panel/tabs 四段全在），判据为「除已声明偏差（图标 emoji 换 SVG、补 ARIA 与稳定 id）外逐字节相同」——D-8 的两行头部先改进真壳（report-head.ts 真删真移）再由真壳重新内联，故不构成偏差；FR-11 两处删除以逐节点断言打印少的两个节点与 sr-only 文本；④ 浅色岛 sha256：?theme=dark&v=next&annot=0 与 ?v=next&annot=0（1280 档 · 在途，--window-size=1280,800）两档 PNG 逐字节相同；⑤ K8：脚本里不再有「拿 ?v=current 当改前基线」的断言，两张复测表与 evidence 方法说明改标完成；⑥ proto-geometry 观测条数按重测刷新（≥ 36 条），before/after 图同批产出。 | dev, review, test |
| t16 | （落库后回填） | 同步既有渲染断言（五处改动 + 两条新增） | FR-11, FR-13 | I-4 + tests/report-shell.test.ts; tests/report-firstscreen-gaps.test.ts | prototypes/detail-ui-v3.html#FR-11, #FR-13 | D-6, D-7 | test | frontend | t10, t11 | M | ① `npx vitest run tests/report-shell.test.ts tests/report-firstscreen-gaps.test.ts` 全绿；② `git diff --stat` 显示两份测试文件的改动恰好是清单处数（report-shell 改 1 处 + 新增断言块，firstscreen 改 2 处 + 新增两条），且 tests/report-shell.test.ts:138 与 Tab 栏用例逐字未改；③ `pnpm test` 失败数 ≤ 基线 106 且改过的用例全绿；④ 可失败性自证：临时去掉渲染里的 aria-describedby 后新增断言①报红，恢复后复绿。 | dev, review, test |

- 一个任务只干一件事，标题动词开头；工作量口径 S = 半天内 / M = 1~2 天；**全卡 S/M，无 L**（最重的一张 t7 为 M：字阶、间距、模块结构、主色纪律同属 `report.ts` 一处改动的三个面，同批一次验收）。
- **落点** = 覆盖对照里出现过的编号 + 具体文件路径（本需求全部落点在 `src/client/**`、`scripts/**`、`tests/**` 与 `prototypes/**`，逐条可核）。
- **原型锚点 / 关联 D-x**：UI 卡（t1～t12 与 t15）两列必填，锚点形态 `prototypes/<name>.html#FR-N`，指 `prototypes/INDEX.md` 的权威行 v3；**锚点不写进「覆盖条款」列**（贴锚点 ≠ 覆盖该条款）；D-x 原文取自 requirement.md 的「讨论与裁定记录（D-x）」，按编号回取原话、不概括。
- **UI 卡的验收标准至少一条可失败的原型对照判据**：本计划每张 UI 卡都写了「结构断言 + 几何量硬判据（写明窗口宽与状态）+ 差异说明」三者之一以上，并逐条写明窗口宽与状态（统一口径：**1280 档 · 在途（inflight）**，`--window-size=1280,800`，实测视口高 713；需要第二档时写 900；终态写 terminal）；只写「与原型一致」不算判据。
- **子卡段**：本需求改动全在客户端与脚本层，**无接口可联调** → 12 张 ui 卡一律 `skipIntegration: true`（不落联调子卡）；4 张 test 卡用 `stages: [dev, review, test]`（验证卡无新接口，同样不落联调）。
- **通用收口（每卡都算，不重复写进每格）**：改 `src/client/**` 的卡，验收都含 `pnpm build:client`（C-12，输出 `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整`）与 `npx tsc --noEmit` 错误数 ≤ 基线 **223**（C-15）；t1 / t7 / t8 三张改「生成物来源」（色值 / 字阶 / 视觉语言）的卡另跑 `pnpm kb:build && pnpm kb:check`（C-13）；全部卡改完跑 `pnpm test` 失败数 ≤ 基线 **106**（C-14）。
- **顺序不许颠倒**（test-cases.md 的调用顺序）：① `npx tsx scripts/req-detail-ui-prototype-shot.mts`（**先把 PROTO 指向 v3**，t15） → ② `npx tsx scripts/req-report-probe.mts`（t14） → ③ `pnpm build:client` → `pnpm test` → `npx tsc --noEmit` → `pnpm kb:build && pnpm kb:check`。

### 逐卡实施方案（implementation）

- **t1｜落地浅色岛令牌块并移除宿主深色覆盖**：改 src/client/styles/report.ts 三处：① `.dsh-pm-detail[data-report-shell]` 令牌块（现 :62-74）改为页面自持浅色原值——--pm-text:#1d1d1f、--pm-text2:#6e6e73、--pm-text3:#86868b（注释写明只许非文本）、--pm-accent:#0071e3、--pm-surface:#fff、--pm-warn-text:#c93400、--pm-danger:#d70015、--pm-line:#0000001a、--pm-bg-soft:#f5f5f7，删掉全部 var(--dsw-…, 回退值) 那一层；② 新增 --pm-accent-text: var(--pm-accent) 与 --pm-line-strong:#00000029，删除 --pm-line-soft，--r1/--r2 归并为 8px（--pm-pill 不动）；③ 文件头与 :70-71 注释改成「浅色岛，不跟随宿主主题」，并整块删除 :962-966 的 [data-ds-dark-theme] .dsh-pm-detail[data-report-shell] 覆盖块。其它样式分片（base/board/detail/node-panel…）一行不改。
- **t2｜新建单一图标源模块 src/client/icons.ts**：新建 src/client/icons.ts：导出 TAB_ICON_SVG: Record<ReportTabKey, string>（trunk/docs/dag/dialogue/token/prompts）与 GAP_DOT_SVG: Record<'red'\|'yellow'\|'gray', string>；全族常量 viewBox=0 0 16 16、fill=none、stroke=currentColor、stroke-width=1.5、stroke-linecap=round、stroke-linejoin=round、aria-hidden=true；字符串内不带 width/height/class/style/颜色字面量；键只取既有 ReportTabKey（src/client/views/report-tabs.ts:40）与 ReportGap['severity']（src/client/views/report-band.ts:25），类型用 import type。本卡不接调用方（接线在 t3/t12）；图标族断言落 tests/report-shell.test.ts 的新增用例群（-t 图标族）。
- **t3｜Tab 栏换内联 SVG 并补 tablist/tab 语义与方向键**：改 src/client/views/report-tabs.ts：① TAB_ICONS（:81）与 buildTabBar（:130）的图标位改用 TAB_ICON_SVG（import { TAB_ICON_SVG } from '../icons.js'），保留 .dsh-pm-tab-icon 与 data-proto-icon-before；② 每个 Tab **在既有属性之后追加** role=tab、id=tab-<key>、aria-selected、aria-controls=panel-<key>、tabindex（选中 0、其余 -1），容器 .dsh-pm-tabs 追加 role=tablist 与 aria-label=需求详情分区；③ panelWrapper（:179）追加 role=tabpanel、id=panel-<key>、aria-labelledby=tab-<key>；④ 在既有控制器（:570-590 的 click 委派同一处）加 keydown 分支：←/→ 相邻、Home/End 首尾，切换复用既有 data-action=switch-tab 与 data-tab（不新造写路径、不新增 data-*）；⑤ 未激活面板仍不入 DOM（aria-controls 只声明稳定 id）。属性顺序选追加式（不改 tests/report-shell.test.ts:138），选择写进实施汇报。
- **t4｜统一键盘焦点环（两档偏移）**：改 src/client/styles/report.ts：新增 --pm-focus-ring-w:2px、--pm-focus-offset-face:-2px、--pm-focus-offset-ctl:2px、--pm-focus-halo:0 0 0 3px rgba(0,113,227,.25)；新增 :focus-visible 规则覆盖 .dsh-pm-btn、.dsh-pm-tab、.dsh-pm-window、.dsh-pm-input、.dsh-pm-trunk-open、details.dsh-pm-fold > summary 以及面板内行内可点元素（实施时逐类点清并写进汇报）；面状控件（Tab/卡片/整块面板）用 outline-offset: var(--pm-focus-offset-face)，小控件（按钮/胶囊/输入框）用 var(--pm-focus-offset-ctl)；outline: <w> solid var(--pm-accent-text) 叠加 box-shadow: var(--pm-focus-halo)；不引宿主 --dsw-alias-state-business-primary；不新增 DOM 节点或属性（FR-2 无新属性）；焦点环不得被 overflow 裁切、不得被粘性元素遮挡。
- **t5｜把交互目标加高到 ≥24×24（窗口胶囊/行内链接）**：改 src/client/styles/report.ts：.dsh-pm-window（基线 216.2×20.5）与 .dsh-pm-trunk-open（基线 71.2×19.3）改为命中区 ≥24 高——优先用 ::after 扩命中区（不改视觉框、不撑高行），必要时加内边距；窗口胶囊组内相邻目标间距 ≥8px；不得新增可聚焦元素、不得新增 data-*；正文内联链接按 WCAG inline 例外写进例外清单并逐条给理由；加高后须复测首屏预算（余量最紧 110px，不许用光）。
- **t6｜落地动效令牌与 reduced-motion 分支**：改 src/client/styles/report.ts：① 详情页根上定义 --pm-dur-fast:80ms、--pm-dur:120ms、--pm-dur-slow:150ms、--pm-ease:cubic-bezier(.2,.8,.2,1)；② 给 .dsh-pm-btn、.dsh-pm-tab、.dsh-pm-window、.dsh-pm-trunk-open、details.dsh-pm-fold > summary、.dsh-pm-input 的 hover/active/focus 加 transition，只动 color/background-color/border-color/opacity/box-shadow（不动几何），规则里不写裸 ms；③ 新增 @media (prefers-reduced-motion: reduce) 把三个时长令牌归零（0s）并关闭非必要动画，用纯 CSS 媒体查询、不引 JS 检测。
- **t7｜收敛字阶到六档并重建视觉层级（间距 36px／模块上下结构／主色纪律）**：改 src/client/styles/report.ts：① 令牌重定值 --f-h1:24px、新增 --f-l1:20px、--f-h2:15px、--f-body:13px、--f-small:12px、--f-tiny:11px，新增 --lh-* 六档（11→15/12→16/13→20/15→22/20→25/24→30）与 --pm-space-module:36px；② 消灭裸字号 9.5/10/10.5/11.5/13.5/21px 与 18 处 12.5px（按归并规则：状态带正文 .dsh-pm-report-band-body :307 → 12px；整段可读正文 → 13px；控件与密集列表 → 12px），字重只留 400/500/600（消灭 650/660 与正文 700），页标题字距 -0.4px；③ 间距回 4/8 栅格（裸 3px/6px 收敛到相邻档）：模块之间 36px、模块标题↔正文 8px（--s2）、卡片内块间 20px（--s5）；④ 模块结构改上下：.dsh-pm-trunk-item（:530）的 grid-template-columns:150px 1fr 改为 1fr，按标题行 + 正文 + 可选引用行落档；⑤ 主色文字 ≤1 类（只 --pm-accent-text），层级靠两档灰 + 三档字重。36px 是 FR-7 #3 间距闭集的唯一具名例外，须在原位注释声明，不许出现第二个脱栅格值。
- **t8｜收敛胶囊/圆角/边线/阴影（苹果式克制）**：改 src/client/styles/report.ts：① 胶囊只留状态胶囊 .dsh-pm-status（999px、11px/500、无底色、靠文字色区分）与可点控件（按钮/输入框：8px 圆角 + 发丝边）；元信息（分类/难度/窗口）改纯文本 + · 分隔；Tab 计数改纯数字无底且用 --pm-text2（不用三级灰）；② 取消全部 12% 语义底色块与彩色边线（红 35%/橙 45%/蓝实心）、紫 --pm-agent 前景色（需要时只降到图标或状态点）；③ --pm-line-soft 删除，灰线统一 .5px solid var(--pm-line)（更强分隔用 --pm-line-strong）；圆角只 8px/999px（取消 4/6px）；④ 内容页取消卡片阴影（只允许浮层）；底色只白 + --pm-bg-soft（分组底只用于状态带）；⑤ 操作条不再是灰底框，并入头部只留一条发丝分隔线。
- **t9｜头部拆两行：动作行独占、身份行另起且窗口靠左**：改 src/client/views/report-head.ts：① 第一行 .dsh-pm-rh-bar（data-report-actionbar）承载全部动作（← 看板 + 阶段动作），独占整行、左对齐，不与身份行同排；② 第二行 .dsh-pm-rh-top 独占整行（REQ-id · 阶段 · 分类 · 难度 · 停留或更新时间），把 .dsh-pm-report-windows（buildWindowJumps）移入该行、落在「创建于 …」左侧——data-action=jump-session 通道与文本一字不动，只改父容器归属（本次唯一已声明 DOM 位移）；③ 破坏性动作恒排最后、与前一个动作留 ≥ 24px 空隙（或 1px 竖线 + 两侧各 12px），撤销 D-4 的 margin-left:auto 推行尾机制；④ 动作组左端恒等于卡片内容区左缘、位置不随动作数量漂移、动作仍同一行（offsetTop 单值）、操作条整块 ≤ 72px；⑤ src/client/styles/report.ts 只改与两行版式及身份行内窗口组靠左相关的规则。
- **t10｜操作条文案收敛并真删 DOM 节点（含两处提示文案同步）**：改 src/client/views/report-head.ts：① 真删 buildReportActionBar 里 .dsh-pm-action-bar-label（:196 的「本阶段操作」）——同名 class 在评论列表 :338 仍在用，不许顺手删；② 常驻后果节点退出可见流：:178 的 span.dsh-pm-action-consequence 保留 class 名并加 dsh-pm-sr-only（1px 裁切或 clip-path），文本 === 服务端 consequence；主操作按钮在既有属性之后追加 aria-describedby 指向它，按钮 title 全文保留（不许只剩 title）；③ 行尾标「均需人工确认」改为「需人工确认」，data-human-only-mark=1 与每格 data-human-only=true 逐字不动；④ 同步两处引用：src/client/views/artifacts.ts:273 与 src/client/views/verification.ts:205 改为点名具体位置（不再指向已删标签）；⑤ src/client/styles/report.ts 新增 .dsh-pm-sr-only（1px 裁切或 clip-path: inset(50%) 加 white-space: nowrap），保证它不承载可见文字。
- **t11｜真删详情页评论输入框并保住对话 Tab 评论链路**：改 src/client/views/report-head.ts:455-458：删除头部 .dsh-pm-comment-form 分支（含 [data-role=comment-input] 与 [data-action=add-comment] 那一处）；保留 buildCommentList 的只读列表 .dsh-pm-comments[data-comment-list]（含终态）；一字不动对话 Tab 的评论表单与通道（src/client/views/panels/dialogue.ts:263-266）；核对 src/client/board-mount.ts:271-284 的 commentInputOf 作用域查找与 data-draft-key=head 草稿槽（头部槽位消失后不得报错、不得回落到整页第一个输入框）；不删 add-comment 通道本身。
- **t12｜状态不靠颜色单一表达（真实文本／aria-hidden SVG）**：① 改 src/client/views/stage-detail.ts 的 buildProgressDots（:30-35）：完成态加真实文本前缀 ✓、当前态加 ▸、未开始不带；② 改 src/client/views/report-band.ts：GAP_DOT（:25 的 emoji 圆点）改用 GAP_DOT_SVG（aria-hidden 的 currentColor 圆），并在 .dsh-pm-gap-what 内加真实文本标记 !! / ! / ·（不是 ::before；全文仍进 title）；③ 验收结论三态（pass/rework/pending）加字形符号 ✓ / ↺ / …（文本级元素，配可见文字或 aria-label）；④ 已达标的状态芯片（本身已有文字）不动；⑤ src/client/styles/report.ts 给 GAP_DOT_SVG 配尺寸与颜色（--pm-icon-sm、currentColor）。
- **t13｜新增对比度报表脚本（读 report.ts 令牌声明）**：新增 scripts/req-detail-ui-contrast.mts：从 src/client/styles/report.ts 的令牌声明解析色值（不复制一份值），按 WCAG 相对亮度公式打印「用途 / 色值 / 背景 / 实测比值 / 判定」全表；必须覆盖三类关系——① 深字压白底（text 16.9、text2 5.07、ok 5.14、teal 4.89、danger 5.38、warn 5.28、accent 4.70）；② 组合背景（12% 同色浅底 + 文字：若某处仍留底色块则启用 --pm-ok-text-tint #1e7d34 4.55 / --pm-teal-text-tint #0d7789 4.52 / --pm-danger-text #c7303e 4.52 并重测，不许靠底色没了默认过关）；③ 反白关系（白字压 --pm-accent 主按钮底 4.70）；非文本档 ≥ 3:1（图标、进度条完成与当前段、状态带左边色条、焦点环、缺口严重度标记）；豁免逐条登记并给理由（--pm-line 1.25、--pm-line-strong 1.45、未开始阶段段 1.24）；报表里出现 [data-ds-dark-theme] 对详情页的任何影响即判失败；退出码 0/1/2 语义与既有探针一致（2 = 环境不可用，响亮失败）。基线全表见 evidence/contrast-baseline.txt。
- **t14｜探针新增可访问性断言组（焦点环/目标尺寸/最小字号/reduced-motion/阶段条标记）**：改 scripts/req-report-probe.mts（A1～A6 与 readbackProblems() 口径不动）新增断言组，每条打印实测值、失败即退出码 1：A7 焦点环（清单控件 el.focus() 后 outlineWidth ≥ 2px、outlineColor 与背景 ≥ 3:1、outlineOffset = 面状 -2px 或小控件 2px，浅深两套主题各一次）；A8 目标尺寸与间距（遍历 button/[role=tab]/a[href]/summary/input，命中区 ≥ 24×24、相邻 ≥ 8px，例外清单显式写在断言里逐条给理由）；A9 最小字号与档位（可见真文字最小 ≥ 11px、档位集合 ⊆ {11,12,13,15,20,24} 且无阶梯外字号，按可见性排除 sr-only）；A10 reduced-motion（计算 transitionDuration = 0s，脚本注释写明本机恒为 reduce、只报量到的这一条）；A11 阶段条/缺口/结论的非颜色标记（元素内存在文本或 svg 子节点）；A12 H1～H5 与 D-8 三条几何（actionRowTop < identityRowTop 且差 ≥ 8px、windowLeft < createdAtLeft）；A13 五块面板补测（TC-28 与验收标准 #4c）：扩展 scripts/fixtures/req-detail-specimen.mts 补 docs/dag/dialogue/token/prompts 载荷，逐块量目标尺寸、字号档、结构位 emoji 并逐块打印。
- **t15｜出图脚本改指权威原型并改造漂移断言口径（K7）、修正 ?v=current 口径（K8）**：改 scripts/req-detail-ui-prototype-shot.mts：① 第一步把 PROTO（:55，现状 detail-ui-v2.html）改为 prototypes/detail-ui-v3.html 并跑一次，看三条断言是否当场报错（报错即说明 v3 内联壳被手改过）；② driftCheck() 的 head 段判据由逐字节相同改为「抹平已声明三处偏差后逐字节相同」（图标 emoji 换 SVG、补 ARIA 与稳定 id、D-8 的窗口组容器归属位移），不许删除断言、不许放宽成不崩就算过；FR-11 的两处删除落成逐节点断言（少的正好是那一个 label span 与那一个常驻后果 span，新增 sr-only 节点文本 === 服务端 consequence）；③ 按 D-8 与 FR-11 的改动重新内联原型壳、重出 after 图并刷新 proto-geometry（含把 v3 头部按 D-8 两行写法落地，v3 现有「布局修复层 v2 (1)」已被 D-8 撤销）；④ K8 处置：把两张复测表的改前列与 evidence/style-variety-before-after.txt 的方法说明改标为「人给的历史快照（出自真实页面基线，对照图见 evidence/ui-before-*.png）」，并同步改脚本 [2c] 段那句「每次运行再量一遍 ?v=current 当改前、对不上就响亮失败」的基线断言；⑤ FR-9 的三件事（主操作左缘等于动作区左缘、破坏性动作与前一个动作固定 ≥ 24px 空隙、动作 offsetTop 单值）与 D-8 三条逐档打印，1/2/3 动作变体用共享标本各渲一次并断言位置三次相同。
- **t16｜同步既有渲染断言（五处改动 + 两条新增）**：改 tests/report-shell.test.ts 与 tests/report-firstscreen-gaps.test.ts：report-shell 的 :219 toContain(均需人工确认) 改为「需人工确认」；:138 的按序子串断言不改（属性追加在既有属性之后）；:212 的 countOf(html, dsh-pm-action-consequence) === 1 保持（保留该 class 作 sr-only 节点，须在实施汇报里显式声明）。firstscreen-gaps 的 :447 countOf(html, 均需人工确认) === 1 改为「需人工确认」；:411 expect(grid).not.toContain(本阶段操作) 不改；:419 的 countOf 与 toContain(通过即归档) 不改；:450 countOf(html, data-human-only=true) === ACTIONS.length 不改；:450-457 的 auto 用例 not.toContain(均需人工确认) 改为「需人工确认」（否则变成永远为真的空断言）。新增两条：① 主操作按钮有 aria-describedby 且指向节点文本 === 服务端 consequence、节点视觉隐藏；② 行尾标文本 ===「需人工确认」且 data-human-only-mark=1 仍在。按 FR-13 把既有相关断言改成不存在（头部无 dsh-pm-comment-form 与头部 add-comment），并新增「对话 Tab 评论框仍存在且可提交」一条。不许删断言。

### 体量声明（footprint 与 DU）

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU（`src/domain/limits.ts`）。`chars` = 该卡 implementation + acceptance 的合计字符量（实施描述与目标改动量的量级）。

| 计划 key | files | anchors | chars | detailUnits | 是否超容量 |
|---|---|---|---|---|---|
| t1 | 2 | 5 | 1170 | 2 + 2.5 + 0.58 = **5.08** | 否 |
| t2 | 2 | 5 | 1100 | 2 + 2.5 + 0.55 = **5.05** | 否 |
| t3 | 3 | 5 | 1300 | 3 + 2.5 + 0.65 = **6.15** | 否 |
| t4 | 1 | 5 | 1110 | 1 + 2.5 + 0.56 = **4.05** | 否 |
| t5 | 1 | 4 | 850 | 1 + 2 + 0.42 = **3.42** | 否 |
| t6 | 1 | 5 | 1070 | 1 + 2.5 + 0.54 = **4.04** | 否 |
| t7 | 1 | 6 | 1590 | 1 + 3 + 0.80 = **4.79** | 否 |
| t8 | 1 | 5 | 1030 | 1 + 2.5 + 0.52 = **4.01** | 否 |
| t9 | 2 | 4 | 1170 | 2 + 2 + 0.58 = **4.58** | 否 |
| t10 | 4 | 6 | 1200 | 4 + 3 + 0.60 = **7.60** | 否 |
| t11 | 3 | 4 | 1000 | 3 + 2 + 0.50 = **5.50** | 否 |
| t12 | 3 | 4 | 990 | 3 + 2 + 0.49 = **5.50** | 否 |
| t13 | 3 | 5 | 1100 | 3 + 2.5 + 0.55 = **6.05** | 否 |
| t14 | 2 | 5 | 1060 | 2 + 2.5 + 0.53 = **5.03** | 否 |
| t15 | 3 | 6 | 1350 | 3 + 3 + 0.68 = **6.67** | 否 |
| t16 | 2 | 4 | 1030 | 2 + 2 + 0.52 = **4.51** | 否 |
| **合计（16 卡）** | — | — | 18120 | 最重 **t10 = 7.60** ≤ 16 | **0 张超容量** |

- 无卡超容量，故任务表里没有 `⚠️超容量(建议N批)` 标记，也没有需要拆细的卡。
- `files` 均 ≥ implementation 里点到的路径数（逐卡自查：t1 = 2/1、t2 = 2/2、t3 = 3/3、t4 = 1/1、t5 = 1/1、t6 = 1/1、t7 = 1/1、t8 = 1/1、t9 = 2/2、t10 = 4/4、t11 = 3/3、t12 = 3/3、t13 = 3/3、t14 = 2/2、t15 = 3/3、t16 = 2/2——**只留余量，不缩水**）。

## 覆盖对照

（四份文档拉齐：需求条款 ↔ 设计落点（接口 / 页面模块）↔ 测试用例 ↔ 接收任务。一格一个编号，括号里是数量；接口列的 `I-x` 是编号口径里声明过的**按位编号**，回查键是 interfaces.md 的 ①～⑧。）

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-3, I-6（3） | P-1, C-1, C-2, C-11, C-15（5） | TC-1, TC-2, TC-28（3）+ 命令表 #5、#6 | t2, t3（2） | ✅ |
| FR-2 | I-6（1） | C-14（1） | TC-3, TC-4（2）+ 命令表 #2 | t4（1） | ✅ |
| FR-3 | I-2, I-8（2） | P-1, C-1, C-10（3） | TC-5, TC-6, TC-7, TC-8, TC-27（5） | t3（1） | ✅ |
| FR-4 | I-6, I-7, I-8（3） | C-6, C-13, C-14（3） | TC-9, TC-10, TC-11（3）+ 命令表 #3、#4 | t1, t13, t15（3） | ✅ |
| FR-5 | I-2, I-6（2） | C-4, C-6, C-11（3） | TC-12, TC-13, TC-28（3）+ 命令表 #2、#4c | t5, t14（2） | ✅ |
| FR-6 | I-6（1） | C-14（1） | TC-14（1）+ 命令表 #2 | t6, t14（2） | ✅ |
| FR-7 | I-6（1） | C-11, C-12, C-14（3） | TC-15, TC-16, TC-28（3）+ 命令表 #1 | t7, t14（2） | ✅ |
| FR-8 | I-1, I-2（2） | C-7, C-8, C-9（3） | TC-17, TC-18（2）+ 命令表 #2 | t12, t14（2） | ✅ |
| FR-9 | I-5, I-8（2） | P-1, C-3, C-4, C-6（4） | TC-19, TC-20（2）+ 命令表 #4b | t9, t15（2） | ✅ |
| FR-10 | I-6（1） | C-9, C-14, C-15（3） | TC-21（1）+ 命令表 #6、#7 | t1, t8（2） | ✅ |
| FR-11 | I-2, I-4（2） | C-3, C-5（2） | TC-22, TC-23, TC-24（3）+ 命令表 #4b | t10, t15, t16（3） | ✅ |
| FR-12 | I-6（1） | P-1, C-3, C-8, C-13（4） | TC-25（1）+ 命令表 #7 | t7（1） | ✅ |
| FR-13 | I-4, I-8（2） | C-12（1） | TC-26, TC-27（2） | t11, t16（2） | ✅ |
| **合计** | 8 项接口（I-1…I-8） | 16 个页面/模块（P-1, C-1…C-15） | 28 条用例（TC-1…TC-28） | 16 张卡（t1…t16） | 13/13 条款有主 |

（合计数字和上游文档逐份对得上：interfaces.md 的变更面 **8** 项（①～⑧）；frontend.md 的页面/组件编号 **16** 个（P-1 与 C-1…C-15）；test-cases.md 的用例 **28** 条（该文末「统计」自述「用例 28 条；FR-1～FR-13 13/13 全覆盖」）；本计划 **16** 张卡、**13/13** 条款有主。）

**反向核查（设计里有的编号，本计划有没有人认领）**

- **接口 I-1…I-8 全部被认领**：I-1 → t2, t3, t12；I-2 → t3, t5, t10, t14；I-3 → t2, t3；I-4 → t10, t11, t15, t16；I-5 → t9, t15；I-6 → t1, t4, t5, t6, t7, t8, t13, t14；I-7 → t1, t13；I-8 → t3, t9, t11（以及 TC-27 的冻结面回归）。**无未被认领的接口，也无本计划自造的第 9 项契约。**
- **页面/模块 P-1, C-1…C-15 全部被认领**：见上表各行（P-1：FR-1/3/9/12；C-1：FR-1/3；C-2：FR-1；C-3：FR-9/11/12；C-4：FR-5/9；C-5：FR-11；C-6：FR-4/5/9；C-7：FR-8；C-8：FR-8/12；C-9：FR-8/10；C-10：FR-3；C-11：FR-1/5/7；C-12：FR-7/13；C-13：FR-4/12；C-14：FR-2/4/6/7/10；C-15：FR-1/10）。**16/16 有主。**
- **用例 TC-1…TC-28 全部被认领**：逐行见上表（TC-28 落在 FR-1 / FR-5 / FR-7 三行、TC-27 落在 FR-3 / FR-13 两行，是设计自述的「serves 多条」的结果，不是重复计数）。**无超范围设计、无用例被漏。**
- **场景 UC-1…UC-6 逐条有人接**（不进「页面/模块」列，避免同号计两遍）：UC-1（键盘与读屏走完全流程）→ TC-3/4/5/6/12/17，卡 t4, t5, t14；UC-2（弱视 / 深色主题）→ TC-9/10/11，卡 t1, t13；UC-3（人扫一眼判行有没有弄错）→ TC-19/20/21/25，卡 t9, t15；UC-4（运动敏感）→ TC-14，卡 t6, t14；UC-5（实施窗口逐条落样式）→ 验收标准 #1～#8，卡 t14, t15, t16 收口；UC-6（1/2/3 动作变体）→ TC-20，变体标本落 `scripts/fixtures/req-detail-specimen.mts`，卡 t15。
- **命令表 #1～#8 逐条有主**：#1 → t14；#2 → t14；#3 → t13；#4 → t1, t15；#4b → t15；#4c → t14（五块面板补测）；#5 → t3, t12（静态 grep 断言）；#6/#7 → 各改 `src/client/**` 的卡（通用收口行）；#8 → t15 与 `evidence/` 下 before/after 成对图。

## 覆盖完整性规则

1. **每行三格不许空**：接口 / 页面模块 / 用例任一为 0 → **不批准**，除非该行是纯文档条款
   （写 "—" + 一句话理由，如"纯 CI 脚本无运行时接口"——括号注、阶段豁免不算理由）：
   - 缺接口/页面模块 → 回退 design 补设计文档；或回 requirement 砍/改条款；
   - 缺测试用例 → 回退 design 补 test-cases.md；
   - 缺接收任务 → 本计划补任务（不许先批后补）。
2. **反向也要查**：设计文档/用例表里的编号在覆盖对照没人认领 = 超范围设计——
   删掉，或回 requirement 补条款。
3. 每个 FR-x 必须有人接——孤儿条款看板标红；任务卡 requirement_refs 悬空引用会被拒。

**本计划自检（逐条对照上面三条）**

1. **三格不空**：FR-1～FR-13 十三行的接口 / 页面模块 / 用例三格全部有编号（见上表），**没有一行写 "—"**——本需求虽然"对外接口零变更"，但仍有一批**加法式契约**（新增模块导出、DOM 属性、CSS 令牌、DOM 删除项、唯一一处 DOM 位移）可编号，故无需以"纯外观、无接口"为由留空。若某行确实无接口可指（本计划未出现），才需要按规则写 "—" + 一句话理由。
2. **反向无超范围**：interfaces.md 的 8 项契约、frontend.md 的 16 个编号、test-cases.md 的 28 条用例、use-cases.md 的 6 个场景**全部被认领**（见上「反向核查」）；本计划没有自造上游不存在的编号，也没有把 superseded 的 v2 原型写进任何一格。
3. **每 FR 有主**：FR-1 → t2, t3；FR-2 → t4；FR-3 → t3；FR-4 → t1, t13, t15；FR-5 → t5, t14；FR-6 → t6, t14；FR-7 → t7, t14；FR-8 → t12, t14；FR-9 → t9, t15；FR-10 → t1, t8；FR-11 → t10, t15, t16；FR-12 → t7；FR-13 → t11, t16 ——**13/13 有主，无孤儿条款**；16 张卡的 `requirement_refs` 全部落在 FR-1～FR-13 内，无悬空引用。
4. **容量与形态**：16 张卡 `detailUnits` 全部 ≤ 16 DU（最重 7.60），无卡需要拆细或标 `⚠️超容量`；`depends_on` 只引用**先定义**的 key（逐卡：t3→t2、t4/t5/t6/t7/t8/t12/t13→t1、t9→t7、t10/t11→t9、t14→t3,t4,t5,t6,t7,t9,t12、t15→t9,t10,t11、t16→t10,t11——**无前向引用**）；无 L 级卡。
5. **写作边界**：本计划不含实施代码、不改任何设计文档与需求文档；落点路径逐条对着真源码核过（`report-tabs.ts:40/81/130/179`、`report-head.ts:178/196/338/455-458`、`report-band.ts:25`、`stage-detail.ts:30`、`styles/report.ts:62-74/307/530/962-966`、`board-mount.ts:271-284`、`panels/dialogue.ts:263-266`、`scripts/req-detail-ui-prototype-shot.mts:55`、`tests/report-shell.test.ts:138/212/219`、`tests/report-firstscreen-gaps.test.ts:411/419/447/450`）。
