# 架构设计（REQ-261005155003-f32f）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13 -->

> 本文档只回答**设计**三问：改成什么样、为什么、边界在哪——"谁在什么时候做什么"不在本文范围（归后续阶段）。
> 需求真相：`docs/requirements/REQ-261005155003-f32f/requirement.md`（FR-1～FR-13、边界、冻结面、K1～K8、D-1～D-8）。
> 权威原型：`docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`（INDEX 标 authoritative；形态参照，非实现依据）。
> 数据契约登记在 `docs/requirements/REQ-261005155003-f32f/design/data-model.md`。
> 同域先例（密度与口吻）：`docs/requirements/REQ-261004222448-292a/design/architecture.md`。
> **一句话主线**：**只动外观层**——`src/client/styles/report.ts` 的令牌与规则 + 详情页渲染字符串的
> 图标/ARIA/文案；**不动信息架构、不动取数、不动写路径、不动台账**。

## 目标与总体方案 `serves: FR-1, FR-4, FR-7, FR-10, FR-12`

**问题**：上一轮（REQ-261004222448-292a）把详情页的**信息架构**做对了（常驻头部 + 状态带 + 六个同级 Tab），
**呈现层**却停在那里。这次要解的不是"审美偏好"，是**可判定的缺陷**（判据来源：D-1 裁定的
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)，本仓已 vendored 于 `skills/ui-ux-pro-max/`）。

**当前状况**（每条都带可复核证据）：

| 缺陷 | 现状证据 | 对应 FR |
|---|---|---|
| 键盘用户看不到焦点 | `grep -rn "focus-visible" src/` → **0 命中** | FR-2 |
| Tab 栏对读屏是一排无名按钮 | `src/client/views/report-tabs.ts:130` 的 `buildTabBar()` 只产 `<button class="dsh-pm-tab" data-action="switch-tab">`，无 `role`/`aria-*`/方向键 | FR-3 |
| 三档真文字不达标 | `styles/report.ts:64` 的 `--pm-text3: var(--dsw-alias-label-tertiary, …)` 是**宿主存在的**令牌（K2），宿主深色下 `#adb2b8` on `#fff` = **2.13:1** | FR-4 |
| 页面自称跟随主题，其实没有 | `styles/report.ts:62-65` 引的 `--dsw-text-primary` / `-text-secondary` / `-accent` / `-bg-primary` 在 DSH 里**定义数 0**（K1 证据①），回退值恒生效 | FR-4 |
| 小控件够不到 24×24 | `evidence/targets-and-fonts-baseline.txt`：`.dsh-pm-window` 216×**20.5**、`.dsh-pm-trunk-open` 71×**19.3** | FR-5 |
| 反馈是瞬变、无 reduced-motion | `grep -c transition src/client/styles/report.ts` → **0**；`prefers-reduced-motion` → **0** | FR-6 |
| 九档零散字阶、真文字最小 9.5px | `styles/report.ts:438`（来源芯片）/`:644`（文档种类）/`:721`（回填标）= 9.5px；另有 ~10 处 12.5px（`:307` 状态带正文等） | FR-7 |
| 状态与严重度主要靠颜色 | `src/client/views/report-band.ts:25` 的 `GAP_DOT = { red: '🔴', yellow: '🟡', gray: '⚪' }`；`report-head.ts:433` 复用的阶段条只有颜色 | FR-8 |
| 一屏 17 个胶囊 / 9 种前景色 / 12 种底色 | `evidence/style-variety-before-after.txt`（headless 计算样式统计） | FR-10 |
| 层级不成立（1.54× / 1.25×） | 页标题 20 ÷ 正文 13 = 1.54；模块间 20 ÷ 模块内 12–16 = 1.25 | FR-12 |

**设计方案**：把改动**钉在三个单点上**，其余一律不碰。

```
                 详情页外观层（本次改动的全部范围）

   ① 结构层（渲染字符串）              ② 取值层（唯一外观分片）        ③ 判据层（脚本）
   views/report-tabs.ts  ──┐          styles/report.ts                scripts/req-report-probe.mts
   views/report-head.ts  ──┤            ├─ 岛内令牌块(:59-79)           （新增断言组）
   views/report-band.ts  ──┼──▶          │   改为页面自持浅色原值        scripts/req-detail-contrast.mts
   views/stage-detail.ts ──┤            ├─ [删] 半个主题残留块           （新增：读令牌算 WCAG 全表）
   views/panels/prompts.ts ┤            │   [data-ds-dark-theme](:962-966)
   icons.ts（新增唯一图标源）┘           └─ 新增：焦点环/动效/字阶/命中区
                                              /胶囊与底色收敛
        │                                      │
        └────────── 冻结面一律不动：data-* 面板契约 / data-action 写路径 / 取数分层 / 无内层滚动 ──────────┘
```

1. **结构层只换"长得难看且不可控"的东西**：emoji 结构图标 → 内联 SVG（FR-1）；平铺按钮 → 标准 Tab 语义（FR-3）；
   颜色单一表达 → 颜色 + 图形/文字（FR-8）；操作条按 D-7/D-8 重排（FR-9）；头部评论输入入口删除（FR-13）。
2. **取值层是唯一的外观改动点**：`styles/report.ts` 一个文件承载全部颜色/字号/间距/圆角/动效/命中区规则（C-05 分片边界不变）。
3. **判据层把"好看"变成"可跑"**：探针新增断言组（焦点环、命中区、最小字号、reduced-motion、非颜色标记），
   新增对比度脚本按 WCAG 相对亮度公式算**全表**（含组合背景与反白关系）——不改判据实现，只加判据。
   （**D-2** 把本需求的提示词难度定在 `expert`：判据必须**可机器验证**，所以"看起来清楚了"这类结论在本设计里不许出现。）

**不这么做的后果**：

- 外观改动**没有可判定判据**时无法收敛（D-5 的"整体就乱乱的"就是这样积起来的）：17 个胶囊 / 9 种前景色的复测表本身就是判据；
- 只改颜色不改**令牌口径**，K2 会以另一种形式回来（下一次有人再把 `--pm-text3` 接回宿主令牌，白岛上又是浅灰字）；
- 不加 `aria`/不接管焦点环，键盘与读屏用户在**冻结的**信息架构上仍然走不完流程——上一轮把结构做对了，这一层不做就等于没交付。

## 模块改动地图 `serves: FR-1, FR-3, FR-5, FR-8, FR-9, FR-11, FR-13`

**图示**：

```
                    client（浏览器）· 详情页外观层

  icons.ts（新增：唯一图标源，纯导出、无副作用）
        ▲                    ▲
        │ TAB_ICON_SVG[key]  │
        │                    └──────────────┐
  report-tabs.ts                            │
   ├─ buildTabBar() (:130) ──▶ <div role="tablist" aria-label>
   │     └─ 每个 Tab: role="tab" aria-selected aria-controls tabindex  ← 新增属性【追加在既有属性之后】
   │     └─ TAB_ICONS(:81) 由 emoji 表 → 取 icons 模块
   ├─ panelWrapper() (:179) ─▶ <div class="dsh-pm-tab-panel" role="tabpanel" id="panel-<key>" aria-labelledby="tab-<key>">
   └─ attach() 键盘闭环: ←/→/Home/End ──复用──▶ 既有 data-action="switch-tab" 通道（不新造写路径）

  report-head.ts（常驻头部）
   ├─ :441/:446  .dsh-pm-rh-bar  动作行 【D-8 第一行】
   │      ├─ 动作不拉伸（弹性流，宽度=内容宽）·按序紧挨（FR-9 #1/#2）
   │      └─ 危险动作同组排最后 + 与前一个动作 ≥24px（D-7 修订 FR-9 #3）
   ├─ :421  .dsh-pm-rh-top  身份行 【D-8 第二行】
   │      └─ :137 窗口组 [data-report-windows] 移到「创建于 …」左侧（窗口靠左）
   ├─ :164-204 操作条：删「本阶段操作」(:196) / 后果改 sr-only + aria-describedby(:178) / 「需人工确认」(:201)
   └─ :444-459 评论区：列表保留；删 .dsh-pm-comment-form + [data-role=comment-input] + add-comment（FR-13）

  report-band.ts
   └─ GAP_DOT(:25) 🔴/🟡/⚪ → 文本标记 !! / ! / ·  + 不依赖字体的圆点（CSS 圆形或 aria-hidden SVG）

  stage-detail.ts
   └─ buildProgressDots() (:30) 增【可选】标记参数（默认识别关）→ 完成 ✓ / 当前 ▸ 以真实文本节点输出
          └─ 旧详情页调用点 (:199) 不传参 → 输出逐字节不变（边界 #3「只到详情页」）

  panels/prompts.ts
   └─ :282 「🧱 A · 固定系统提示词」结构位 emoji → 图标模块（或去图标）

  styles/report.ts（唯一外观分片，967 行）
   ├─ 令牌块 (:59-79) → 页面自持浅色原值（浅色岛，D-3）
   ├─ [删] [data-ds-dark-theme] .dsh-pm-detail[data-report-shell] (:962-966) —— 白岛上的"半个主题"残留
   ├─ 新增：:focus-visible 两档偏移 / --pm-dur-* + prefers-reduced-motion / 字阶五档 + 4/8 栅格
   │        / 命中区 ≥24×24 / 胶囊只留两类 / 底色两档 / 圆角两档 / 发丝线一档
   └─ 不变：C-05 归属章与注入时机（styles.ts 的 data-plugin）

  判据面（同批交付，不在产品路径上）
   ├─ scripts/req-report-probe.mts   新增断言组（焦点环 / 命中区 / 最小字号 / reduced-motion / 阶段条标记）
   ├─ scripts/req-detail-contrast.mts 新增：读 styles/report.ts 的令牌声明算 WCAG 全表
   └─ scripts/req-detail-ui-prototype-shot.mts 出图与几何目标切到权威原型（K7）+ 比对口径改造（D-8 DOM 位移）
```

**改动清单**（文件与符号均为仓库现状实测）：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/client/icons.ts` | **新增** | 唯一图标源：`TAB_ICON_SVG: Record<ReportTabKey, string>` 等纯导出；全族常量 `viewBox="0 0 16 16"` / `stroke-width="1.5"` / `stroke="currentColor"` / `fill="none"` / `stroke-linecap="round"`；无运行时依赖、无副作用、不引网络资源 | FR-1 | 所有 SVG 消费者（目前只有 Tab 栏与结构位标记） |
| `src/client/views/report-tabs.ts` | 改 | ① `buildTabBar()`(:130) 产 `role="tablist" aria-label` + 每项 `role="tab"`/`aria-selected`/`aria-controls`/roving `tabindex`；② `TAB_ICONS`(:81) 改取 icons 模块；③ `panelWrapper()`(:179) 补 `role="tabpanel"` + 稳定 `id="panel-<key>"` + `aria-labelledby`；④ 键盘 `←/→/Home/End` 复用既有 `switch-tab` 通道 | FR-1、FR-3 | 详情页 Tab 栏与面板壳；`tests/report-shell.test.ts:138` 的**属性顺序子串断言**（见「攻克的难点」①） |
| `src/client/views/report-head.ts` | 改 | ① 删 `:196` 的「本阶段操作」标签（**只删这一处**，`:338` 评论列表的同名 class 保留）；② `:178` 常驻后果 → 视觉隐藏节点 + 主操作按钮 `aria-describedby`（`title`(:190) 保留）；③ `:199-201` 行尾标「均需人工确认」→「需人工确认」（`data-human-only-mark="1"` 逐字不动）；④ 动作组按 D-7/D-8（不拉伸、按序、危险动作同组留 ≥24px、动作行独占第一行）；⑤ `:421` 身份行独占第二行、窗口组靠左（D-8）；⑥ `:455-458` 删评论输入框与其两个属性（FR-13） | FR-9、FR-11、FR-13 | 常驻头部；5 条既有断言（需求 FR-11 #5 已逐处核过）；评论草稿槽位 `head`（`board-mount.ts:240-333`） |
| `src/client/views/report-band.ts` | 改 | `GAP_DOT`(:25) → 文本标记 `!!` / `!` / `·`，并把 emoji 圆点换成不依赖系统字体的圆形；`:149` 缺口语义位与 `:141` 引用芯片（`data-ref-kind`/`data-ref-id`）**不动** | FR-8 | 状态带缺口；只读渲染 |
| `src/client/views/stage-detail.ts` | 改 | `buildProgressDots()`(:30) 增**可选**参数（默认识别关）：完成 `✓` / 当前 `▸` 以**真实文本节点**输出（不用 `::before`） | FR-8 | **共享渲染器**：报告壳 `report-head.ts:26/433` 与本文件 `:199` 两处消费；默认关保证旧详情页逐字节不变（边界 #3） |
| `src/client/views/panels/prompts.ts` | 改 | `:282` 结构位 `🧱` → 图标模块（或去掉图标；正文里的装饰性 emoji 不在判据内） | FR-1 | 提示词面板 |
| `src/client/views/artifacts.ts` | 改 | `:273` 提示文案「请在详情头『本阶段操作』条…」→ 点名到具体位置（不能继续指向已不存在的标签） | FR-11 | 文档 Tab 计划块 |
| `src/client/views/verification.ts` | 改 | `:205` 同上一类（「请在详情头『本阶段操作』条…」） | FR-11 | 文档 Tab 验收块 |
| `src/client/styles/report.ts` | 改 | 唯一外观分片：令牌块(:59-79) 改页面自持浅色原值；**删** `[data-ds-dark-theme]` 覆盖块(:962-966)；新增焦点环两档偏移、动效令牌与 reduced-motion、字阶五档 + 行高三档、4/8 栅格（**模块间距 36px 走新令牌 `--pm-space-module`，见「关键决策与取舍」**）、命中区 ≥24×24、图标两档尺寸、胶囊/底色/圆角/边线收敛 | FR-1～FR-10、FR-12 | 详情页全部外观；分片归属章与注入时机不变（C-05） |
| `src/client/board-mount.ts` | **不改**（回归验证点） | `commentInputOf()`(:276) 靠"被点按钮所在 `.dsh-pm-comment-form`"定位输入框；`:271` 注释明写"详情页现在同时有两个以上评论框"——FR-13 后头部那个消失，**必须验证对话 Tab 那个仍取得到、仍提交得走** | FR-13 | 对话 Tab 的评论提交链路 |
| `src/client/styles/*.ts`（其余 12 片） | **不改** | 边界 #3：看板/列表/甘特/设置/toolviews **不在本次**；插件级假令牌接线（K1/K3，11 片共 426 处）单独立项 | — | — |
| `tests/report-shell.test.ts`（`:138`、`:219`）、`tests/report-firstscreen-gaps.test.ts`（`:447`、`:450-457`） | 改 | 按需求 FR-3 的"属性顺序"二选一、FR-11 #5 的逐处清单同步断言（**不许删断言**，只换判据） | FR-3、FR-11 | 回归线（`pnpm test` 失败数 ≤ 基线 106） |
| `scripts/req-report-probe.mts` | 改 | 新增断言组：焦点环计算样式（浅/深两套）、命中区 ≥24×24、可见真文字最小字号 ≥11px、reduced-motion 计算样式、阶段条与结论的非颜色标记 | FR-2、FR-5、FR-6、FR-7、FR-8 | 既有四组合与 `tabsTop ≤ 713` 判据（`TABS_TOP_MAX`）不变；退出码语义 0/1/2 不变（`:505`/`:632`） |
| `scripts/req-detail-contrast.mts` | **新增** | **读** `styles/report.ts` 里的令牌声明（不复制值）算 WCAG 相对亮度全表，覆盖组合背景（芯片浅底 + 文字）与反白关系（白字压主色底）；任何正文档 <4.5、非文本档 <3 → 退出码非 0 | FR-4 | 对比度唯一判据；基线对照 `evidence/contrast-baseline.txt` |
| `scripts/req-detail-ui-prototype-shot.mts` | 改 | 出图与几何目标切到权威原型（K7）；D-8 的 DOM 位移使"逐字节一致"不再成立 → 比对改为"只允许已声明偏差"，并处理 `?v=current` 的话术（K8） | FR-9 | 原型门、after 图与 `proto-geometry` |

## 数据结构变更 `serves: FR-4, FR-10` (When Needed)

**无表结构变更**：台账 `RequirementRecord`（双后端）、`queue.json`、六条只读端点与 `PanelResult`/`Degrade` 信封、
`data-action` 写路径**一律冻结**（需求「接口与数据契约」表）。本设计唯一"落下来的新数据"是**客户端源码里的
字符串常量与 CSS 文本**：岛内 CSS 令牌（含新增的 `--pm-icon*` / `--pm-dur-*` / `--pm-ease` /
`--pm-ring-*` / `--pm-target` / **`--pm-space-module: 36px`**）、`src/client/icons.ts` 的纯导出、DOM 上的
`role`/`aria-*`/`tabindex`/`id`（全部**加法式**）。逐条登记、字段说明、兼容性与回滚路径见 `design/data-model.md`。

## 接口变更 `serves: FR-3, FR-13` (When Needed)

**无对外接口变更**。三个"看似接口"的位置逐条说明：

```typescript
// ① 新增模块（唯一真正的"新接口"）——纯导出，无运行时依赖、无副作用
// src/client/icons.ts
export const TAB_ICON_SVG: Record<ReportTabKey, string>
// 装饰性：一律 aria-hidden="true"；图标旁总有可见文字（Tab 名），不出现"只有图标没有名字"的控件

// ② 共享渲染器的新增【可选】参数（默认值 = 现状行为，故是超集）
// src/client/views/stage-detail.ts
export function buildProgressDots(currentStatus: RequirementStatus, opts?: { markers?: boolean }): string

// ③ DOM 上的**加法式**扩展（FR-3）：只可能新增属性，不改事件通道与语义
// <button class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"
//         role="tab" id="tab-trunk" aria-selected="true" aria-controls="panel-trunk" tabindex="0">
```

**改动原因**：① 图标必须有一个"唯一源"才能保证全族常量一致（FR-1 #1）且不引依赖（FR-1 #5）；
② 阶段条是共享渲染器，FR-8 要求真实文本节点，而边界 #3 要求"只到详情页"——可选项是同时满足两者的最小改动；
③ `role`/`aria-*` 是 FR-3 的语义本体，但**不得改动**既有 `data-*` 与 `data-action`（冻结面）。
**影响范围**：`icons.ts` 的消费者只有 Tab 栏与结构位标记；`buildProgressDots` 的两个调用点之一是旧详情页
（`stage-detail.ts:199`），默认关即不受影响；DOM 属性只被读屏与断言消费，旧调用方忽略即无感。

## 依赖关系 `serves: FR-1`

**新增依赖**：

| 依赖项 | 版本 | 用途 | 不引入的后果 |
|---|---|---|---|
| **无** | — | 图标为**编译期常量字符串**内联（与全仓"纯字符串渲染"一致，`src/client/html.ts:8` 的 `esc()` 仍是唯一转义入口） | 装图标库会引入构建期依赖与网络资源，且带来第二套配色/线宽（FR-1 #5） |

**删除依赖**：（无删依赖——emoji 不是依赖，只是字符串。）

| 依赖项 | 原用途 | 替代方案 |
|---|---|---|
| — | — | — |

**复用的既有能力（不改、不重造）**：

| 复用对象 | 位置 | 用途 |
|---|---|---|
| `esc()` | `src/client/html.ts:8` | 全部文本转义入口（新增结构位一律经它） |
| 注册表契约 `ReportTabDef` | `src/client/views/report-tabs.ts:61` | 六个面板各自一个文件、互不触碰；本次只改壳的渲染 |
| 分段局部更新 | `report-tabs.ts:188-198` 的 `ReportShellSegments` / `wrapShell` | 头部/状态带/Tab 栏/面板四段分开替换，外观改动不引入整页重绘 |
| 评论草稿槽位 | `board-mount.ts:240-333`（`draftKeyOf`/`captureDetailDraft`/`restoreDetailDraft`） | `data-draft-key="head"` 槽位随 FR-13 的输入框一起消失，**读取端无需改动**（缺席即跳过） |
| 样式归属章 | `src/client/styles.ts:34-90`（`data-plugin` / `data-plugin-css`，模块求值期注入） | C-05：分片被删可自愈；本次只改内容不改归属机制 |

## 目录结构 `serves: FR-1` (When Needed)

仅有**一处新增文件**，物理结构不变（C-02 的 400 行预算：`icons.ts` 是常量表，`styles/report.ts` 继续单文件承载本页外观）：

```
src/client/
├── icons.ts                 # 新增：唯一图标源（纯导出 + 全族常量 + aria-hidden 约定）
├── views/
│   ├── report-head.ts       # 改：常驻头部（D-8 两行）、操作条、评论区
│   ├── report-tabs.ts       # 改：Tab 语义与键盘
│   ├── report-band.ts       # 改：状态带非颜色标记
│   ├── stage-detail.ts      # 改：共享阶段条（可选标记参数）
│   └── panels/prompts.ts    # 改：结构位图标
└── styles/
    └── report.ts            # 改：本页外观唯一分片（含新增令牌与规则）

scripts/
└── req-detail-contrast.mts  # 新增：对比度报表（读令牌声明，不复制值）
```

## 关键算法/流程 `serves: FR-6` (When Needed)

### 流程图 `serves: FR-3, FR-6, FR-9`

```
① Tab 键盘闭环（不新造写路径）
   keydown(← / → / Home / End)
        │
        ├─ 目标索引 = clamp(当前索引 ± 1 | 0 | N-1)
        ├─ 焦点：新 target.focus()                     ← roving tabindex：只有选中项 tabindex="0"
        ├─ 语义：aria-selected 前移（恰 1 个 true）
        └─ 切换：派发**既有** data-action="switch-tab" 通道
                 └─▶ 懒加载 + 既有缓存键 reqId::tab::revision
                        └─▶ 未激活面板**仍不在 DOM**（ARIA 不得导致整块渲染）

② 焦点环（两档偏移，靠特异性而不是靠两套选择器）
   :focus-visible 命中？
        ├─ 否（鼠标路径）──▶ 无环（不出现"点一下留个框"）
        └─ 是 ──▶ outline: var(--pm-ring-w) solid var(--pm-accent) + var(--pm-halo)
                    ├─ 面状控件（Tab / 折叠条）: outline-offset = -2px   ← 不撑出方框、不挤动相邻
                    └─ 小控件（按钮 / 胶囊 / 输入框）: outline-offset = +2px

③ 动效（单点令牌 + reduced-motion）
   规则里只写 var(--pm-dur*)/var(--pm-ease)         ← 无裸 ms 字面量
        │
        ├─ 默认：只过渡 color / background-color / border-color / outline-color / opacity（不动几何）
        └─ @media (prefers-reduced-motion: reduce)：transition-duration: 0ms; animation-duration: 0ms
                                                     └─ 终态**直接可读**（不是"变慢"）
```

### 关键决策点 `serves: FR-4, FR-7, FR-9, FR-10, FR-12, FR-13`

| 决策 | 选项A | 选项B | 选了哪个 | 为什么 |
|---|---|---|---|---|
| 主题口径 | 跟随宿主主题（要接线 11 个分片 426 处假令牌） | **诚实浅色岛**（只钉详情页） | **B** | D-3 裁定「本次只做详情页」；K1 证据①③（8 个令牌名定义数 0、共 426 处）；非功能需求「主题」行：宿主两套主题下详情页**同一副长相且都达标**。原型机械证据：`prototypes/detail-ui-v3.html#FR-4` 的 `?theme=dark&v=next` 与浅色档出图逐字节相同 |
| 主色几级 | FR-4 表的"面/文字两级"（面 `#4a7dff`、文字 `#2f5fd0`） | **唯一强调色** `#0071e3`（白底 4.70:1） | **B** | D-5 裁定「参考苹果」+ FR-10（二）逐值定死；`#0071e3` 同时满足"当文字 ≥4.5:1"与"白字压它 ≥4.5:1"，两级失去必要性。`--pm-accent-text` **保留为别名**（开发票：`detail-ui-v3.html:4030` `--pm-accent-text: var(--pm-accent)`），所以"两级"的表述不删、但取值收敛 |
| 危险/警告取值 | FR-4 表：危险保留 `#dc3545`（4.53:1，余量 <5%）、警告 `#8a5a00`（5.93:1） | **FR-10 色板**：`#d70015`（5.38:1）、`#c93400`（5.28:1） | **B** | FR-10 是 D-5 之后的最终色板（"逐值定死，全部按 WCAG 公式核过"）；它顺带解掉了 FR-4 里"余量 <5%"那条待复核标记 |
| 三级灰的口径 | `#81858c`（3.71:1）承载真文字 | `#86868b`（3.62:1，**只许非文本**）+ 真文字一律 ≥ `--pm-text2` `#6e6e73`（5.07:1） | **B** | FR-10 #1 与色板表同口径；原型 `detail-ui-v3.html:4021` 直接把 `--pm-text3` 收敛为二级灰，理由是"它在这个标本里承载的是真文字"。判据侧由新增对比度脚本兜底 |
| 危险动作摆法 | D-4 时期「紧挨排 + `margin-left:auto` 推行尾」 | **同组、按序、与前一个动作留 ≥24px**（D-7 修订） | **B** | D-7 原话「v-A 按钮都放到左上角」：动作组整体移到卡片左上角后**不再有"行尾"**；"分离"这条原则不变，只是机制从"推到行尾"换成"留出明确空隙"（`detail-ui-v3.html#FR-9`：`[data-action-rank="danger"]{margin-left:24px}`） |
| 头部行数 | v3 原型的「布局修复层」（身份行与「创建于 + 窗口」并一行、动作组与之同排） | **两行**：动作行在第一行、身份行在第二行、窗口组靠左（D-8） | **B** | 人 2026-10-05 原话「这里行弄错了，按钮和 id 不应该是一行的，窗口可以放到左边」+ 选项 A；判据 `actionRowTop < identityRowTop`、两行 top 差 ≥8px、`windowLeft < createdAtLeft` |
| 头部卡片底色/圆角 | 原型改造层：`[data-report-seg="head"]{background: var(--pm-bg-soft); border-radius: 12px}` | **FR-10 #2/#4 条款**：头部不加底色（白）、圆角只 `8px`/`999px` | **B（以条款为准）** | FR-10 #2 明文"底色只两档：白 + `#f5f5f7`（分组底）。**头部/操作条/评论不加底色**"，#4 明文"圆角只两档 8/999，取消 4px/6px"。原型的这一处属**改造层 CSS**（不参与"内联壳逐字节"比对，见验收标准 #4b 的三处偏差只涉及 DOM），实施按条款落并在实施汇报里声明这一处与原型 CSS 的差异 |
| 结构图标换到什么范围 | 全仓 emoji 一次清（含 `✅ 成功`/`⚠️` 与看板徽标 `📋 PM ·`） | **只换结构位**：Tab 六个 + `panels/prompts.ts:282` | **B** | FR-1「范围限定」：状态符号正是 FR-8 要的"颜色之外的第二判据"，换掉反而破坏 FR-8；看板徽标属别的页面（边界 #3） |
| 阶段条标记的落点 | 直接改共享的 `buildProgressDots` | **可选参数、默认识别关** | **B** | 该函数被旧详情页 `stage-detail.ts:199` 共用；边界 #3「只到详情页」→ 默认关保证旧调用点输出逐字节不变 |
| 评论区的删法 | 整块删（输入框 + 只读列表） | **只删输入入口**，列表保留只读 | **B** | D-7 原话「这个添加评论删除不需要」指输入入口；列表是"人说过什么"的台账事实（`report-head.ts:440` 的既有注释：只读不等于看不见） |

## 安全/性能考虑 `serves: FR-5, FR-7` (When Needed)

**安全风险**：

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 内联 SVG 拼进 HTML 字符串 | 若图标字符串"参数化"（接受运行时插值）就新开一个注入面 | 图标是**编译期常量**，不接受任何运行时插值；新增结构位文本一律经 `esc()`（`html.ts:8`） |
| `aria-controls` 指向未挂载的节点 | 读屏报"引用了不存在的元素"；或有人为了"补齐"而把未激活面板一起渲染（破坏既有 A4 断言） | 用**稳定 id**（`panel-<key>`）声明，面板挂载时带同 id（FR-3 #5）；未激活面板仍**不在 DOM** |
| 视觉隐藏节点（sr-only 后果文本） | 被"最小字号/可见性"类断言误读为可见真文字 | 节点带显式 class（`.dsh-pm-sr-only`）+ 断言按可见性过滤（宽高 ≤1px / `clip-path` / `overflow:hidden`），FR-7 锚点已把二选一写在条款里 |
| 焦点环被裁切 | 溢出容器边缘吃掉 `outline`，键盘用户又看不到焦点 | `outline` 不参与布局、不产生滚动溢出；壳左右内边距 20px > 2px 偏移（`detail-ui-v3.html#FR-2`）；面状控件改用**内偏移** `-2px` |

**性能影响**：

| 指标 | 改前 | 改后 | 可接受吗 |
|---|---|---|---|
| 首屏预算 `tabsTop`（硬判据 ≤713） | 579（1280 在途）/ 583（900 在途）/ 427（终态）（`evidence/targets-and-fonts-baseline.txt`） | 原型实测 547 / **603**（D-8 换行后）/ 516（需求「实测」表） | ✓ 最紧一档余量 ≥110px；探针 `TABS_TOP_MAX` 判据不回退 |
| 状态带单格高（≤220） | 157 / 144 | 保持同一量级（字号微调只下调） | ✓ |
| 操作条整块高（≤72） | 60（1280） | 65 / 55（原型实测，少一行后果后仍 ≤72） | ✓ |
| DOM 节点 | 6 个 Tab 各 1 个 emoji 文本节点 | 各 1 个 `<svg>`（+6 节点，无深层嵌套） | ✓ 可忽略 |
| 布局抖动 | 无过渡（瞬变） | 过渡**只动颜色/边框/透明度**，不动几何、不触发布局（FR-6 #2） | ✓ 几何判据在动效前后一致 |
| 请求数 / 取数 | 6 条只读端点 + 懒加载缓存 | **一字不变**（边界 #1） | ✓ 无新增读放大 |
| CSS 体积 | `styles/report.ts` 967 行 | 同文件继续承载（新增规则条数有限） | ✓ 归属章与注入路径不变（C-05），`pnpm build:client` 的 `[verify-client]` 会查分片完整性（C-12） |

## 测试策略 `serves: FR-2, FR-5, FR-6, FR-7`

**必测场景**（核心路径 / 边界 / 错误处理；锚点都指真实入口）：

| 场景 | 输入 | 预期输出 | 测试用例编号 |
|---|---|---|---|
| 渲染硬判据四组合不回退 | `npx tsx scripts/req-report-probe.mts`（两档宽度 × 两状态） | 退出码 0，输出含 `tabsTop ≤ 713`、无横向溢出、无内层滚动、未激活面板缺席 | TC-01 |
| 焦点环可见且达标 | 探针新增断言组：对清单内每个控件 `el.focus()` 取计算样式（浅/深两套各一次） | `outlineWidth ≥ 2px` 且 `outlineColor` 与背景对比 ≥3:1；鼠标路径不留环 | TC-02 |
| 命中区 ≥24×24 | 探针遍历 `button` / `[role=tab]` / `a[href]` / `summary` / `input` 取 `getBoundingClientRect()` | 全部 `width ≥ 24 && height ≥ 24`；例外（正文内联链接）在断言代码里**逐条给理由** | TC-03 |
| 最小真文字字号 | 探针取"可见真文字"的最小计算 `font-size` | ≥11px；**排除** sr-only（零尺寸 / `clip-path` / `overflow:hidden`） | TC-04 |
| reduced-motion 终态可读 | 探针模拟 reduced-motion 后取计算样式 | `transitionDuration` 为 `0s` | TC-05 |
| 动效令牌单点（静态） | `grep` 分片：`transition` 时长取值全部来自 `var(--pm-dur` | 无裸 ms 字面量；分片含 `@media (prefers-reduced-motion: reduce)` | TC-06 |
| 状态不靠颜色单一表达 | 探针断言：阶段条三态与结论三态各自含文本或 `<svg>` 子节点；强制灰度截图人工评审 | 三态仍可区分（截图落 `evidence/`） | TC-07 |
| 对比度全表 | `npx tsx scripts/req-detail-contrast.mts` | 退出码 0；正文档 ≥4.5、非文本 ≥3；报表含组合背景与反白关系；出现 `[data-ds-dark-theme]` 对详情页的影响 → 判失败 | TC-08 |
| Tab 语义与键盘 | 探针/用例驱动：`focus` 首个 tab → `ArrowRight` | 焦点与 `aria-selected` 同时前移一格、面板切换；选中项恰 1 个 `aria-selected="true"`；未激活面板仍不在 DOM | TC-09 |
| 既有断言零回退 | `pnpm test`（基线 106 failed）、`tests/report-shell.test.ts`、`tests/report-firstscreen-gaps.test.ts`、`tests/client-styles-ownership.test.ts` | 失败数不高于基线；改动过的用例全绿 | TC-10 |
| 构建 / 类型 / 知识层 | `pnpm build:client`、`pnpm build`、`npx tsc --noEmit`、`pnpm kb:build && pnpm kb:check` | C-11/C-12/C-13/C-15 均不劣化 | TC-11 |
| 浅色岛（同 `v` 下 dark vs 浅色） | 原型 `?theme=dark&v=next` 与 `?v=next` 出图 sha256 对照 | 两档 PNG 逐字节相同；`grep` 断言：分片不再引宿主主题敏感令牌 | TC-12 |

> 判据的分工（**如实登记，不放过**）：FR-6 的"非 reduce 下不是瞬变"在**本机量不到**——本机 headless Chrome 的
> `prefers-reduced-motion` 恒为 reduce（原型覆盖边界 #2）→ 该条用 **CSS 文本静态**断言，④ 用**计算样式**断言；
> 脚本里必须写明哪条量到了、哪条只是读出来的。

## 设计模式 `serves: FR-1` (When Needed)

| 模式 | 用在哪个组件 | 解决什么问题 | 不用会怎样 |
|---|---|---|---|
| （未引入新模式） | — | — | — |
| 复用①：纯函数 → HTML 字符串 | `buildTabBar` / `buildReportHead` / `buildReportBand` | 渲染断言就是字符串断言（vitest 无 jsdom） | 引入 DOM 测试环境，判据变重 |
| 复用②：注册表契约 | `ReportTabDef`（`report-tabs.ts:61`） | 六个面板各自一个文件、互不触碰 | 壳与面板互相 import，改一处炸一片 |
| 复用③：分片 + 归属章 | `styles.ts:34-90`（`data-plugin`） | 样式被别的插件认领/删除后能自愈 | 刷新后样式整张丢（已发生过的缺陷） |
| 复用④：分段局部更新 | `wrapShell` 的 `data-report-seg`（head/band/tabs/panel） | 外观改动不引入整页重绘 | 滚动位置与 `<details>` 展开态归零 |

## 错误处理 `serves: FR-6`

**新增错误码/异常**：**无**（渲染路径不抛异常——`report-tabs.ts:91` 的 `defOf` 回落与 `:103` 的
`isReportTabKey` 守卫都是既有纪律：渲染路径上的异常会整块白屏）。本次新增的"错误面"只有**判据脚本的退出码**：

| 情形 | 触发条件 | 用户/执行者看到什么 | 如何恢复 |
|---|---|---|---|
| 出图/探针**环境不可用** | 找不到 Chrome，或四组合一次都起不来（`scripts/req-report-probe.mts:505`、`:632`） | 一行可读原因 + **退出码 2**（与"断言不过"的退出码 1 严格分开） | 换到有 headless Chrome 的环境重跑；**不得**把退出码 2 当"通过" |
| 对比度脚本前置不可得 | `styles/report.ts` 缺失或令牌声明读不到 | 退出码 2（前置不可用），**不伪造全绿** | 修正分片路径/令牌名后重跑 |
| 令牌改名/漂移 | 规则里出现分片未声明的 `--pm-*` | 静态断言红（"裸值/未声明令牌"） | 把取值收回令牌单点（FR-6 #3、FR-7 #6） |
| 图标键漂移 | `TAB_ICON_SVG` 的键集合与 `ReportTabKey` 不一致 | **编译期**类型错（`Record<ReportTabKey, string>`），不回落 emoji | 补键——**不允许**"缺了就用 emoji 兜底" |
| reduced-motion 量不到 | 本机 headless 恒为 reduce | 判据拆两条（计算样式 + CSS 文本静态），脚本里写明 | 如实记录（不把"读出来的"说成"量到的"） |
| 未激活面板不可达 | 有人为补齐 `aria-controls` 而提前渲染面板 | 既有 A4 断言红（未激活面板必须不在 DOM） | 回到"稳定 id 声明 + 挂载时带同 id"（FR-3 #5） |

## 配置项 `serves: FR-6` (When Needed)

**无新增配置**。唯一"可调"的是新增脚本的阈值常量与探针既有常量（`TABS_TOP_MAX` = 713、状态带 ≤220、
操作条 ≤72、命中区 24、最小字号 11、非文本 3:1、正文档 4.5:1）——它们写在脚本里（**原型 HTML 的
`proto-geometry` 一个阈值都没有**，阈值属设计决策，落本文与 `design/frontend.md`）。

## 文档更新清单 `serves: FR-4, FR-7, FR-10`

| 文档 | 更新内容 | 负责人 |
|---|---|---|
| `docs/requirements/REQ-261005155003-f32f/design/frontend.md` | ①「色值 + 背景 + 实测比值 + 判定」整表（含组合背景与反白关系、非文本档、豁免登记）；②字阶/行高/间距**实际取值表**（FR-7 #6、#1）；③两处与原型 CSS 的差异声明（头部底色/圆角、12.5px 各站点的归并去向） | 本需求 |
| `docs/architecture/requirement-detail-report.md`（领域篇） | 「渲染纪律」补三条：**浅色岛口径**（不引宿主主题敏感令牌）、**结构图标禁令**（emoji 不作结构图标；状态符号例外）、**焦点环两档偏移**（面状 `-2px` / 小控件 `+2px`） | 本需求 |
| `docs/knowledge/design-tokens.md` 与 `design-tokens.classes.tsv`（**生成物**） | 令牌增删后重跑生成器（C-10 不可手改） | 本需求 |
| `docs/knowledge/code-map.md` 与 `code-map.symbols.tsv`（**生成物**） | 新增 `src/client/icons.ts` 的导出符号（重跑 `pnpm kb:build`） | 本需求 |
| `docs/knowledge/conventions.md`（仅当新增纪律时） | 本次**不新增**工程纪律条目（复用 C-05/C-11～C-15）；若实施中把"结构位禁 emoji"做成校验，再按 C-07/C-09 挂真实校验目标 | 本需求 |

## 遗留问题 `serves: FR-4` (When Needed)

| 问题 | 影响 | 计划何时解决 |
|---|---|---|
| **K1**：11 个样式分片引 8 个 DSH 里不存在的令牌名（共 426 处），回退值恒生效 | 全插件所有页面在宿主深色主题下是白岛 | 单独立项（本次已备映射表；落地表现为"页面根 + 10 个分片"的机械映射 + 页面根补 `background`） |
| **K3**：有的令牌存在、有的不存在 → 主题错乱**逐块不同**（不是统一白岛） | 全插件 | 并入 K1：先出"用到的令牌 × 是否存在"对照表，再统一映射 |
| **K4**：原型锚点门有"假锚点"通道——详情页正文的条款引用芯片会渲染成 `id="FR-N"`（`report-band.ts:141` 的 `.dsh-pm-gap-ref`），解析器 `ANCHOR_RE` 把它当真锚点 | 原型门禁（**不是**详情页本身）：会静默放行根本没写的锚点区块 | 单独立项（改门禁：只认 `<section id="FR-N">`；或把芯片的 id 改形态） |
| **K5**：原型登记入口自相矛盾（门禁文案让人调一个派发表里没有的 kind） | 所有 frontend 需求的需求阶段 | 单独立项；**就地缓解**：真实登记路径是触发目录扫描 |
| **K6**：原型没有人工确认门（`prototype.confirmedAt` 无人读） | 所有 frontend 需求（代价延迟到验收期才暴露） | 单独立项；**就地缓解**：owner 主动给原型落一道人工确认，让"人看过这版视觉"成为台账事实 |
| **K7**：出图/几何脚本的产物路径常量仍指向**已被取代的那一版**原型（`scripts/req-detail-ui-prototype-shot.mts:55`），跑它只会回填旧原型的 PNG 与 `proto-geometry` | 本需求的原型出图管线与 before/after 证据可信度 | 本需求实施阶段**先**把目标切到权威原型再跑；若三条断言当场报错，则修原型或把口径改为"只允许已声明偏差" |
| **K8**：原型自述"`?v=current` = 改前外观"**不成立**（文件里没有任何 `[data-proto-v]` 门控），同款前提还撑着两张复测表的"改前"整列 | 原型自身的 before/after 对照能力 | 本需求实施阶段二选一：① 给整块改造层补门控让自述成真；② 把"改前"列改标为"人给的历史快照（对照图见 `evidence/ui-before-*.png`）"并同步脚本话术。**不许继续声称** |
| 原型标本只渲染「汇报」面板 | 另五块面板内的 FR-5 目标尺寸 / FR-7 字阶 / FR-1 结构位 emoji 只写了覆盖规则、**没有实测** | 本需求实施阶段接真页面或扩标本后补测（验收标准 #4c）；在那之前不许当"已验过" |

## 关键决策与取舍 `serves: FR-4, FR-9, FR-10, FR-12, FR-13`

> 每条三件事：**取舍点** → **否掉了什么** → **为什么（依据）**。依据一律可复核（文件:行 / 命令 / 原型锚点 / D-x）。

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 交付档位与判据强度 | 否掉"按 standard 交付、判据只写人读的清单"（省事，但分歧无法收敛） | 按 **feature 档 + expert 难度**交付：每条判据都可机器跑（探针断言组 / 新增对比度脚本 / 渲染字符串断言），并交原型与验收材料 | **D-2** 捕获回执四键原值（`category: feature` / `difficulty: expert` / `docLocation: docs/requirements/<REQ>/`）；D-1 要求"每条改动都能指回规范的具体一行"——指得出来才叫判据 |
| 主题口径：详情页跟随宿主还是做浅色岛 | 否掉"把插件级假令牌接回官方令牌"（能跟随主题，但要动页面根 + 10 个分片、426 处） | **诚实浅色岛**：全部令牌取浅色原值、删岛内 `[data-ds-dark-theme]` 覆盖、不再声称跟随主题 | **D-3** 用户选项原文「本次只做详情页（浅色岛，改动面小，推荐）」；**K1** 证据（8 个令牌名定义数 0 / 426 处）；**K2** 是"半个主题"的现场（2.13:1）；机械证据 `prototypes/detail-ui-v3.html#FR-4`：`?theme=dark&v=next` 与浅色档出图 sha256 一致 |
| 主色一级还是两级 | 否掉 FR-4 表里的"面亮字深"两级（`#4a7dff` / `#2f5fd0`）——**那是 D-5 之前**的取值 | **唯一强调色** `#0071e3`，并**保留 `--pm-accent-text` 这个名字**（取值 = 唯一强调色） | **D-5**「样式参考苹果」→ FR-10（二）逐值定死；`#0071e3` on `#fff` = 4.70:1（当文字已达标），白字压它 = 4.70:1（主按钮达标）→ 两级失去必要性；名字保留是**契约要求**（FR-2/FR-4 与原型 `detail-ui-v3.html:4030` 都点名过它），取值收敛即可 |
| 模块间距取 36 还是 28 | 否掉 `--s6: 28px`（H2 = 28 ÷ 12 ≈ 2.3 < 3，FR-12 的"分组靠比值"不成立）；也否掉裸写 `36px` | **新增 `--pm-space-module: 36px`**（⚠️ 同批文档里 `interfaces.md`/`test-cases.md` 记作 `--pm-gap-module`、`frontend.md` 记作 `--pm-module-gap` —— 三种拼法同一件事，**实施前必须收敛到一个名字**，详见 `design/data-model.md` 的命名告示），并**显式声明它是 FR-7 闭集枚举（4/8/12/16/20/28）的唯一例外** | **FR-12 B**（D-7，晚于 FR-7）明文"模块之间 **36px**"；36 = 4×9 仍在 4px 栅格上；H2 = 36 ÷ 模块内 8 = **4.5 ≥ 3**。原型 `proto-geometry` 当前记 `moduleGap=24`（ratio 3.0，旧一轮生成物）→ 差异由实施落地并**重测**（`moduleGap=36` / `moduleInnerGap=8` / ratio 4.5），不许拿 24 当"已达标" |
| 危险/警告色：保留 FR-4 原值还是取 FR-10 色板 | 否掉 `#dc3545`（4.53:1，**余量 <5%**，FR-4 自己还要求"报表里标出来便于后人复核"）与 `#8a5a00`——两者同样是 **D-5 之前**的取值 | FR-10 色板：`--pm-danger: #d70015`（5.38:1）、`--pm-warn-text: #c93400`（5.28:1）、`--pm-teal-text: #0e7c8f`（4.89:1，**只保留定义、用法被 FR-10（二）取消**） | FR-10 是 D-5 之后的**收敛结果**（"逐值定死，全部按 WCAG 公式核过"）；顺带消掉 FR-4 里那条余量告警，减少"下次谁来复核"的负担 |
| 三级灰承载真文字 | 否掉"把 `#81858c` 用深一点继续当文字色" | `--pm-text3` 只承载非文本/图标（FR-10 的 `#86868b` = 3.62:1 ≥3:1）；**真文字一律 ≥ `--pm-text2` `#6e6e73`（5.07:1）** | FR-10 #1 的计数数字就踩过这个坑（初稿写"三级灰"自相矛盾）；原型 `detail-ui-v3.html:4021` 在标本里直接把 `--pm-text3` 收敛为二级灰；判据由新增对比度脚本兜底 |
| 危险动作怎么"分离" | 否掉 D-4 的 `margin-left:auto`（推行尾） | **同组、按序、与前一个动作留 ≥24px** | **D-7** 原话「v-A 按钮都放到左上角」：动作组移到卡片左上角后没有"行尾"可言，`margin-left:auto` 失去语义；"分离"原则不变、机制换一个（`detail-ui-v3.html#FR-9` 实测 `margin-left:24px`）；**位置不随数量漂移**这条要害在两种机制下都要成立 |
| 头部行结构 | 否掉 v3 原型「布局修复层」把身份行与「创建于 + 窗口」并一行、动作组同排的写法 | **D-8 两行**：动作行独占第一行（左对齐）；身份行独占第二行，窗口组靠左、仍在「创建于 …」左侧 | 人 2026-10-05 原话「这里行弄错了，按钮和 id 不应该是一行的，窗口可以放到左边」+ 选项 A；判据三条：`actionRowTop < identityRowTop`、两行 top 差 ≥8px、`windowLeft < createdAtLeft`；**手段不设限**（`.dsh-pm-rh-top{display:contents}` + `order` 的纯 CSS 方案，或把窗口组移入身份行的 DOM 改动——DOM 改动必须在实施汇报里声明） |
| 头部卡片底色与圆角 | 否掉原型改造层的 `background: var(--pm-bg-soft)` + `border-radius: 12px` | **按 FR-10 #2/#4 条款**：头部不加底色（白）、圆角只 `8px`/`999px` | FR-10 #2 明文"**头部**/操作条/评论不加底色"、#4 明文"取消 4px / 6px"；原型这一处属改造层 CSS（不参与验收标准 #4b 的内联壳逐字节比对），实施按条款落并在实施汇报里**声明这一处差异** |
| 结构图标换到什么范围 | 否掉"全仓 emoji 一次清"（会连 `✅ 成功`/`⚠️` 与看板徽标 `📋 PM ·` 一起换） | 只换**结构位**：Tab 六个（`report-tabs.ts:81`）+ `panels/prompts.ts:282` | FR-1「范围限定」：状态符号是 FR-8 要的"颜色之外的第二判据"，换掉即自伤 FR-8；看板徽标属别的页面（边界 #3）；`grep` 判据也按"结构位归零"写 |
| 阶段条标记落在共享渲染器 | 否掉"直接改 `buildProgressDots` 的函数体"（会改到旧详情页 `stage-detail.ts:199`） | **新增可选参数、默认关闭**（报告壳传开，旧调用点不传） | 边界 #3「只到详情页」；共享渲染器的"改一处、两页变"正是本轮要避免的越界；默认关 = 超集改动，旧路径逐字节不变 |
| 评论区删到什么程度 | 否掉"输入框 + 只读列表一起删" | **只删输入入口**，只读列表保留（`report-head.ts:444-449` 的列表与 `:338` 的「最近评论 N 条」标签都在） | **D-7** 原话「这个添加评论**删除**不需要」指的是那个人工输入入口；列表是"人说过什么"的台账事实（`:440` 既有注释：只读不等于看不见）；职责划分：详情页=汇报（读），对话=会议记录（写） |
| 后果怎么披露 | 否掉"只留 `title`"（悬停才可见） | `title` **保留** + **视觉隐藏节点 + 主操作 `aria-describedby`** | **D-6** A 案；ui-ux-pro-max 的 "Reliance on hover only" 反模式（触屏/键盘/读屏都拿不到）；领域篇既有纪律"按钮只写标签、后果进 title 与确认框"；两条合起来的正确解是**换披露方式，不是删披露** |
| sr-only 节点与"最小字号 11px"相撞 | 否掉"断言不过滤可见性"（会必然假红：`.dsh-pm-action-consequence` 实测 10.5px / 0×0 / `overflow:hidden`） | 断言**按可见性过滤**（零尺寸 / `clip-path` / `overflow:hidden` 排除）；同时把该节点的字号也提到 11px（双保险） | 需求 FR-7 锚点已把二选一写在条款里；原型覆盖边界 #5 实测了这两个"阶梯外字号"（12.5px 是真文字、10.5px 是 sr-only）；**不许把假红当通过** |
| 12.5px 各站点的去向 | 否掉"整体降到 12px"（正文行高与密度会一起变，`tabsTop` 反而可能因换行变化） | 逐站点判：**承载正文/表格正文的归 13/20**，**次级说明的归 12/16**，并在 `design/frontend.md` 列去向表 | FR-7 #1「以 FR-10 为准」的阶梯是 `11/15 · 12/16 · 13/20 · 15/22 · 20/25`；原型覆盖边界 #5 点名 `styles/report.ts:307` 的 12.5px 是**可见真文字且未收敛**；逐站点登记才能让"无阶梯外字号"这条断言可执行 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-3, FR-6, FR-11`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| TypeScript（ESM，相对 import 带 `.js`）+ tsdown | 仓内既有 | 客户端打包 | 与全仓一致；`pnpm build:client` 的 `[verify-client]` 会查关键符号/归属章/分片完整（C-04/C-12） |
| vitest（**无 jsdom**） | 仓内既有 | 渲染断言 | client 渲染一律"纯函数 → HTML 字符串"，渲染断言就是字符串断言（先例 REQ-261004222448-292a 的同一选择） |
| headless Chrome（外部可执行） | 本机既有 | 探针四组合与出图 | 硬判据（`tabsTop`/内层滚动/横向溢出）只能来自真实渲染 |
| **新增 npm 依赖：无** | — | — | FR-1 #5：SVG 以字符串常量内联，不装图标库、不用 icon font（否则引入第二套线宽/配色与网络资源） |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/client/icons.ts` | 唯一图标源（全族常量 + `TAB_ICON_SVG`），装饰性 `aria-hidden` 约定写在这里 |
| `src/client/views/report-tabs.ts` | Tab 栏语义与键盘、面板壳（未激活面板不渲染的纪律） |
| `src/client/views/report-head.ts` | 常驻头部两行（D-8）、操作条（D-7/D-6）、只读评论区（FR-13 后无输入入口） |
| `src/client/views/report-band.ts` | 状态带三格：缺口严重度的非颜色标记（FR-8） |
| `src/client/views/stage-detail.ts` | 共享阶段条渲染器（可选标记参数，默认关） |
| `src/client/styles/report.ts` | 本页外观**唯一**分片：令牌 + 全部规则（含新增动效/焦点/字阶） |
| `scripts/req-report-probe.mts` | 渲染硬判据入口（四组合 + 新增断言组；退出码 0/1/2 语义） |
| `scripts/req-detail-contrast.mts` | 对比度唯一判据（读令牌声明算 WCAG 全表） |

**设计模式**：**未引入新模式**。复用四条既有惯例（纯函数渲染 / 注册表契约 / 分片归属章 / 分段局部更新），
沿用理由见「设计模式」节。

**关键实现手法**（非显然的几处）：

1. **图标是编译期常量，颜色交给 `currentColor`**：选中态由 `.dsh-pm-tab.active` 的 `color` 决定 →
   图标**没有自己的配色规则**，也就不会出现"选中态图标还是琥珀色"（基线实拍 `evidence/ui-before-zoom-tabbar.png` 的现场）。
2. **键盘复用既有写路径**：`←/→/Home/End` 的落点是**既有** `data-action="switch-tab"` 通道，
   不新造事件名、不新造写路径（FR-3 #4）。
3. **焦点偏移两档靠特异性，不靠两套选择器**：原型实测——`:is(button,a[href],summary,input,[role="tab"]):focus-visible`
   整条是 `(0,4,1)`，只写 `[role="tab"]:focus-visible`（`(0,4,0)`）会被它盖住（`outline-offset` 仍是 `+2px`）；
   正解是把 `[role="tab"]` 再写一遍凑到 `(0,5,1)`（`detail-ui-v3.html#FR-2` 的注释里记着这次实测）。
4. **令牌单点**：时长/缓动在岛根以 `--pm-dur-*` / `--pm-ease` 定义，规则里不写裸 ms（FR-6 #3）；
   对比度开关同理——正文档/非文本阈值写在脚本里，原型 HTML 的 `proto-geometry` **一个阈值都没有**。
5. **对比度脚本读令牌声明，不复制值**：FR-4 #9 明确要求"读 `report.ts` 的令牌声明而不是复制一份值，避免两处漂移"——
   这条是本设计与"手抄几个色值"的分水岭。
6. **共享渲染器的加法式改动**：`buildProgressDots(status, opts?)` 默认关标记 → 旧详情页逐字节不变（边界 #3），
   新页显式打开，一个函数两个口径都不撒谎。

**攻克的难点**：

1. **FR-3 的 ARIA 属性插入位置与既有"属性顺序子串断言"相撞**：`tests/report-shell.test.ts:138` 断言的是
   `'class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"'` 这段**连续子串**。
   原型把 `role`/`id`/`aria-*`/`tabindex` 插在 `class` 之后 → **会当场打断这段子串**。
   设计定的是：**新增属性一律追加在既有属性之后**（保住子串，不动既有断言），并在实施汇报里写明选了哪一条
   （FR-3 的"已知耦合"要求二选一并留痕）。原型与最终 DOM 的这点形态差异归入"已声明偏差"（验收标准 #4b 的偏差之一正是"补 ARIA"）。
2. **本机 `prefers-reduced-motion` 恒为 reduce**：不加 flag 也是 reduce，`--force-prefers-reduced-motion=no-preference`
   压不住 → 计算样式永远是 0s。**不放宽阈值**，改拆判据：④ 用计算样式断言；①②③（共享令牌 / 无裸 ms / 只动颜色不动几何）
   用 CSS 文本静态断言，脚本里写明哪条量到了、哪条只是读出来的（原型覆盖边界 #2）。
3. **D-8 使"逐字节一致"不再成立**：头部拆两行 + 窗口组位移是**已声明的 DOM 位移** → 原型与真实壳的比对口径
   必须从"逐字节"改成"只允许已声明偏差"（验收标准 #4b），否则实现永远无法通过（K7 的现场）。
4. **`?v=current` 不是改前外观**（K8）：原型的 before/after 对照能力是"自述成立、机制不存在"→
   本设计的浅色岛证据**不用 `v=current` 做对照组**，改用"**同 `v` 下 dark vs 浅色**"（验收标准 #4）。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 判据来源 | "看着更好就合并" | 每条改动挂 ui-ux-pro-max 的**可判定规则**一行，或宿主自己的实测值 | 分歧可收敛（D-1 的裁定原文） | `skills/ui-ux-pro-max/references/pro-rules.md` §Icons「No Emoji as Structural Icons」、`quick-reference.md` §1 focus-states/focus-appearance、§6 Color Contrast；`detail-ui-v3.html#FR-1`～`#FR-13` |
| 原型与真实壳的关系 | 另做一张"示意图" | 原型内联**同一份标本**的 `buildReportShell` 输出，只换 CSS 层 + 图标 + ARIA（+ 一处已声明的 DOM 位移） | before/after 是**同一个页面**，不是两张图 | `docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`；验收标准 #4b |
| 对比度怎么算 | 手抄几个色值，只算"深字压白底" | 脚本**读令牌声明**算全表，覆盖**组合背景**（芯片浅底 + 文字）与**反白关系**（白字压主色底） | 主按钮那条、芯片那三条正是"只算深字压白底"漏掉的 | `scripts/req-detail-contrast.mts`（新增）；基线 `evidence/contrast-baseline.txt` |
| 图标资产 | 装图标库 / icon font | **编译期常量 SVG**，全族一套 `viewBox/stroke-width/fill`，颜色 `currentColor` | 不引依赖、不引网络资源，且不可能出现"选中态图标不跟色" | FR-1 #1/#5；`src/client/icons.ts` |
| 后果披露 | 常驻一行灰字（现状）或只留 `title` | 视觉隐藏节点 + `aria-describedby` + 保留 `title` | 常驻违背页面纪律，hover-only 是规范反模式——两条都要避开 | `report-head.ts:178/190`；D-6 |
| 首屏预算的角色 | 当作"优化目标" | 当作**回归线**（`tabsTop ≤ 713`，只许更好） | 外观加高很容易把 Tab 栏推出首屏；这条是既有硬判据 | `scripts/req-report-probe.mts` 的 `TABS_TOP_MAX`；需求「非功能需求」表 |
| "无覆盖"要说出来 | 只写做完了什么 | 原型标本只渲染汇报面板 → 另五块面板的三条判据**如实标"未实测"**，并写进验收标准 #4c | 反应付：把"没验过"写成"验过了"，后面一定会有人据此下判断 | 需求「原型的已知覆盖边界」1；本节「遗留问题」末行 |
