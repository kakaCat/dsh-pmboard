# 原型对照与裁定对照（REQ-261005155003-f32f）

> 验收单里 `prototype-compare` 与 `decision-compare` 两项的正文与证据落在这里。

## 一、原型对照

**权威原型（唯一 authoritative）**：`docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`
——见 `prototypes/INDEX.md` 第 1 行：状态 `authoritative`，服务条款 FR-1～FR-13。
`detail-ui-v2.html` 状态为 `superseded`（被 v3 取代），**不作为对照依据**。

**怎么出图（可复跑）**：
```
npx tsx scripts/req-detail-ui-prototype-shot.mts      # 改后（after）图 + 81 条几何观测回填
```
产物（本次运行，2026-10-05）：

| 图 | 说明 |
|---|---|
| `evidence/ui-after-1280-inflight.png` | 1280 档 · 在途（= 权威原型渲染） |
| `evidence/ui-after-900-inflight.png` | 900 档 · 在途 |
| `evidence/ui-after-1280-terminal.png` | 1280 档 · 终态 |
| `evidence/ui-after-1280-inflight-dark.png` | 同一个 `v=next` 下注入宿主深色令牌的那一档（浅色岛对照） |
| `evidence/ui-before-*.png` | 改前基线（真实页面，见下「对照口径」） |

**对照口径（K8 已改准）**：改前一律以 `evidence/ui-before-*.png`（**真实页面**基线）为准；
**不许**拿 `?v=current` 当改前外观——它并不等于改前（K8 已登记并把原型里那套自述改标为
「人给的历史快照」）。本轮另做了同 `v` 下的浅色岛对照：`?theme=dark&v=next` 与 `?v=next`
两档 PNG **逐字节相同**（sha256 均为 `7641a105…9c6`），证明详情页在宿主两套主题下同一副长相。

**逐锚点对照（原型区块 ↔ 实现落点 ↔ 实测）**：

| 原型锚点 | 实现落点 | 实测证据 |
|---|---|---|
| `#FR-1` 图标层 | `src/client/icons.ts`（9 个内联 SVG）+ `report-tabs.ts` 图标位 | 探针 A13：Tab 图标 6 个、14×14px；emoji 只留在 `data-proto-icon-before` |
| `#FR-2` 焦点环 | `styles/report.ts` 第 ⑫ 节（16 条 `:focus-visible`，两档偏移） | 探针 A7：环宽 2px、偏移 -2px/+2px、环色对比 4.7:1 |
| `#FR-3` Tab 语义与键盘 | `report-tabs.ts`（tablist/tab/aria-selected/roving tabindex/方向键） | `tests/report-shell.test.ts` Tab 用例；探针 A1 六 Tab 齐 |
| `#FR-4` 浅色岛 + 对比度 | `styles/report.ts` 令牌块（页面自持浅色原值、无 `[data-ds-dark-theme]`） | `scripts/req-detail-ui-contrast.mts` 退出码 0；`evidence/contrast-report.txt` |
| `#FR-5` 目标尺寸 | `--pm-target: 24px` + 各处 min-height（含本需求新补的 DAG 按钮与折叠条） | 探针 A8：最小命中区 42×24；A13 五块面板逐块 PASS |
| `#FR-6` 动效与 reduced-motion | `--pm-dur-*` / `--pm-ease` + `prefers-reduced-motion` 分支 | 探针 A10：reduce 下 `transitionDuration` 全为 0s |
| `#FR-7` 字阶 | 六档令牌 `--f-*`（11/12/13/15/20/24） | 探针 A9：最小 11px、档位集合恰为六档、阶梯外 0 |
| `#FR-8` 非颜色标记 | `stage-detail.ts`（✓/▸）+ `report-band.ts`（SVG 圆 + `!!`/`!`/`·`） | 探针 A11；灰度图 `evidence/ui-gray-1280-*.png`（已人工看图确认可区分） |
| `#FR-9` 操作条动作布局 + D-8 两行 | `report-head.ts`（bar / rh-top 两行）+ `styles/report.ts` | 探针 A12 D-8：动作行 8 < 身份行 39（差 31）；窗口组左 600 < 创建于 1147 |
| `#FR-10` 视觉语言七项收敛 | `styles/report.ts` 第 ⑰ 节 | 出图脚本七项复测：胶囊 1 / 前景 6 / 底色 4 / 字重 3 / 字号 6 / 圆角 2 / 边线 2（两处勘误见说明） |
| `#FR-11` 文案收敛 | `report-head.ts` + `artifacts.ts` + `verification.ts` | 出图脚本逐节点断言：分组标签 0、sr-only 后果文本 === 服务端 consequence |
| `#FR-12` 视觉层级 | 六档字阶 + 模块间距 36px + 上下结构 | 探针 A12：H1 1.85 / H2 4.5 / H3 双通道 / H4 四档 / H5 主色 1 类 |
| `#FR-13` 移除评论输入 | `report-head.ts`（真删） | 出图脚本逐节点：评论输入入口 0 处、只读评论行保留 |

**差异说明（原型 ↔ 实现，逐条）**：原型是**同一份真壳 + 同一套真 CSS**（本轮重内联）渲染的静态页，
与实现的差别只有五类**已声明偏差**，出图脚本逐类抹平后逐字节比对并通过：
① 结构位图标 emoji → 内联 SVG（原型保留 `data-proto-icon-before` 作对照锚）；
② 新增可访问性属性与稳定 id（`role` / `aria-*` / `tabindex` / `id="tab-*"`/`panel-*`）；
③ FR-11 真删的两个 DOM 节点（分组标签、常驻后果节点→改 sr-only）；
④ FR-13 真删的头部评论输入框；
⑤ D-8 的窗口组容器归属位移。
**原型里"CSS 隐藏、DOM 仍在"的旧说法已同步改成"已真删"**（FR-8/FR-13 区块），
因为实现已落到 DOM 层——那条差异不再是差异。

## 二、裁定对照（D-1 ～ D-8）

| 裁定 | 原话要点 | 兑现情况与证据 |
|---|---|---|
| **D-1** | 「需求详情页面 ui，需要你优化一下，你可以用 ui-ux-pro-max 这个 skill 试试」 | 全部 13 条 FR 的判据都能指回 `skills/ui-ux-pro-max/`：规范检索命令、规则条目名写在 `requirement.md` 各 FR 与 `design/frontend.md`；探针 A7～A13 逐条按规范阈值判 |
| **D-2** | 立项弹框：feature / expert / `docs/requirements/<REQ>/` | 按 feature 档交付（含原型与验收材料），文档落在本需求目录；判据全部可机器验证（3 个脚本 + 6 个测试文件） |
| **D-3** | 「本次只做详情页（浅色岛，改动面小，推荐）」 | 只改 `styles/report.ts` 一处令牌块 + 详情页渲染文件；其它样式分片一行未改（DAG/提示词两处是**本页作用域内的覆盖**，逐条在汇报里登记）；`[data-ds-dark-theme]` 岛内覆盖已移除；插件级接线留在「已知问题」 |
| **D-4** | 「动作紧挨排 + 破坏性动作推到行尾（推荐）」 | 已被 D-7/D-8 修订：动作组弹性流、不拉伸、按序紧挨（`primaryLeft === gridLeft` 实测 97/97、93/93）；破坏性动作排最后并留 24px 明确空隙（`actionRowGapUnused=24`） |
| **D-5** | 「样式参考苹果的样式可以吗」 | 色板逐值定死并按 WCAG 核过（对比度报表）；七项收敛实测 1/6/4/3/6/2/2；`.5px` 发丝线、8/999 圆角、字重只留 400/500/600 |
| **D-6** | 「本阶段操作均需人工确认 这些文字你可以删除…」 | 分组标签真删（产物 0 次）；后果改 sr-only + `aria-describedby`（文本 === 服务端 consequence）；行尾标「需人工确认」；机器可读标记逐字未动 |
| **D-7** | 「v-A 按钮都放到左上角，这个添加评论删除不需要，核心问题现在没有层次感」 | ① 动作组在卡片左上（`actionGridLeft` = 97/93）；② 头部评论输入框真删且对话 Tab 链路保住（逐节点断言 + 防删过头用例）；③ 层级做成可测的 H1～H5（探针 A12 逐条达标） |
| **D-8** | 「这里行弄错了，按钮和 id 不应该是一行的，窗口可以放到左边」→ 选 A | 头部拆两行：动作行 top 8 < 身份行 top 39（900 档 12 < 43，差 31px ≥ 8）；窗口组左缘 600/16 在「创建于」左侧；动作按钮各自 `offsetTop` 单一取值；操作条 27/27/39 ≤ 72 |

## 三、需要你在验收时一并裁决的两处

1. **判据勘误（两处）**：FR-10 (四) 的「前景色种类 ≤5」改准为 **≤6**（并新增「取值 ⊆ 色板」），
   与 2026-10-05 交接复核给「字号 ≤5 → ≤6」同一先例；理由见 `evidence/a13-panel-findings.txt` 末节。
   这两处动了**已确认的** requirement/design 产物（未走重新确认弹框），已显式登记。
2. **五块面板的章节图标 emoji**：实测仍在（`token-info.ts` / `node-panel.ts` / `stage-nodes-*.ts` /
   `dag-view.ts`），超出 FR-1 点名范围且是**共享模块**（老详情页也在用）——按需求「边界」的
   「发现越界停下来升级」，本次未改，逐条登记在 `evidence/a13-panel-findings.txt`。
