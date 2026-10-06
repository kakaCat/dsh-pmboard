# 数据模型设计（REQ-261005155003-f32f）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13 -->

> 三句话讲清本份：
> ① **无表结构变更**——台账（双后端）、`queue.json`、六条只读端点与 `PanelResult`/`Degrade` 信封、
>    `data-action` 写路径**一条都不动**；
> ② 本需求真正的"数据契约"是**三样加法式扩展**：岛内 **CSS 令牌块**、新模块 `src/client/icons.ts` 的**纯导出**、
>    DOM 上的 **`role`/`aria-*`/`tabindex`/`id`**；
> ③ 冻结面**逐条列名**并写明"不变"，兼容靠"旧调用方忽略即无感"，回滚 = 还原三处源码 + `pnpm build:client`。
> 设计主线与取舍依据见 `docs/requirements/REQ-261005155003-f32f/design/architecture.md`。
> 权威原型（取值与形态的对照物）：`docs/requirements/REQ-261005155003-f32f/prototypes/detail-ui-v3.html`。

## 存储形态与冻结面（先讲清边界） `serves: FR-4, FR-13`

| 数据 | 现在存哪 | 本需求是否动 |
|---|---|---|
| 需求台账 `RequirementRecord` | **双后端**：json 分片（默认）｜ `SqliteRequirementStore`（设置里切换） | **不动结构、不加字段**（本需求没有任何新增读取） |
| 任务 DAG | 每个需求目录 `docs/requirements/<REQ>/queue.json` | **不动** |
| 六条只读端点响应（`/report` `/trunk` `/docs` `/dag` `/dialogue` `/token`）与 `PanelResult`/`Degrade` 信封 | `src/http/routers/` + `src/shared/protocol.ts` | **冻结**：不新增字段、不改形状（边界 #1） |
| 评论（`head.comments` / `commentsTotal`）与提交通道 | 台账 + `board-mount.ts:1057` 的 `add-comment` 分支 | **数据不动**；FR-13 只把**详情页头部**那一个输入入口从渲染里去掉，别的调用点与通道一字不改 |
| 注入留痕 / 设置 / 其它 state | `~/.dsh/state/*.json`、`~/.dsh/dsh-reqboard-settings.json` | 不动 |

**由此得出的一条硬约束**：先例（REQ-261004222448-292a）里"台账双后端必须语义一致"那条铁律，
在本需求**天然满足**——因为本需求**没有任何新增读取**。唯一"落下来"的新数据全部在**客户端源码**里
（CSS 文本、字符串常量、DOM 属性），不进台账、不进 schema、不做迁移。

## 新增/修改的数据结构 `serves: FR-1, FR-6, FR-7, FR-10, FR-12`

### 岛内 CSS 令牌块（`src/client/styles/report.ts`） `serves: FR-1, FR-4, FR-6, FR-7, FR-10, FR-12`

**用途**：详情页外观的**唯一取值来源**，也是"诚实浅色岛"的令牌层（FR-4 的口径就钉在这里）。
**作用域**：`.dsh-pm-detail[data-report-shell]` 根节点内——**不外泄全局**（不写 `:root`，不与其他 12 个分片共享）。
**改动的实质**：从"引宿主主题变量 + 回退值"改为"**页面自持浅色原值**"（现状 `:62-65` 的
`var(--dsw-text-primary, …)` / `var(--dsw-alias-label-tertiary, …)` 等一律去掉宿主那一层），并**删掉**
文件末尾的半个主题覆盖块（现状 `:962-966`）。

**定义（改后；值取自原型 `detail-ui-v3.html:4017-4043` 的岛内令牌块，逐条可对照）**：

```css
.dsh-pm-detail[data-report-shell] {
  /* ── 前景/强调：页面自持浅色原值（K2 的成因在此切断：不再引宿主令牌） ── */
  --pm-text: #1d1d1f;               /* 苹果 label · 白底 16.9:1 */
  --pm-text2: #6e6e73;              /* 苹果 secondaryLabel · 5.07:1 —— 承载全部次要真文字 */
  --pm-text3: #86868b;              /* 苹果 tertiaryLabel · 3.62:1 —— **只许非文本/图标** */
  --pm-accent: #0071e3;             /* 唯一强调色（苹果系统蓝）· 白底 4.70:1（当文字也达标） */
  --pm-accent-text: var(--pm-accent);   /* 文字级主色的**契约位（保留名字）**：取值收敛为唯一强调色 */
  --pm-accent-hover: var(--pm-text);    /* hover 不引第二档蓝 → 色数不增加 */

  /* ── 语义前景（浅色岛上只此一套；不再有"暗色主题下换亮一档"的分支） ── */
  --pm-danger: #d70015;   /* 苹果 accessible red · 5.38:1（解掉 FR-4 表里"余量 <5%"那条） */
  --pm-warn-text: #c93400;/* 苹果 accessible orange · 5.28:1 */
  --pm-ok-text: #1e7e34;  /* 5.14:1 */
  --pm-teal-text: #0e7c8f;/* 4.89:1 —— **定义保留**（契约表列名），但 FR-10（二）取消了它作为
                              **前景色的用法**（青/紫不再承载状态；原型把青/紫都收敛为灰，
                              见 detail-ui-v3.html:4057 的 --pm-teal-text/--pm-agent = #6e6e73） */
  --pm-danger-text: var(--pm-danger);
  --pm-ok-text-tint: var(--pm-ok-text);      /* 备好的 tint 级：仅当某处仍保留底色块时启用（FR-4 #6） */
  --pm-teal-text-tint: var(--pm-text2);      /* 同上；本次底色块整体取消，故默认等价于二级灰 */

  /* ── 线 / 底 / 面：底色只两档、边线只一档（FR-10 #2/#5） ── */
  --pm-line: #0000001a;        /* = 苹果 separator = 宿主 --dsw-alias-border-l2 */
  --pm-line-strong: #00000029; /* 需要更强分隔时才用 */
  --pm-line-soft: #0000001a;   /* 收敛到与 --pm-line 同值（原两档灰线并一档） */
  --pm-bg-soft: #f5f5f7;       /* 分组底（唯一允许的第二档底色） */
  --pm-bg-softer: transparent; /* 头部/操作条/评论不加底色（FR-10 #2） */
  --pm-surface: #fff;

  /* ── 【新增】图标尺寸：只两档，不出现第三种（FR-1 #2） ── */
  --pm-icon: 14px;      /* Tab 栏 */
  --pm-icon-sm: 12px;   /* 行内 */

  /* ── 【新增】动效令牌：单点定义，规则里不写裸 ms（FR-6 #3） ── */
  --pm-dur-fast: 90ms; --pm-dur: 120ms; --pm-dur-slow: 150ms;   /* 区间 80–150ms */
  --pm-ease: cubic-bezier(.2,.7,.3,1);

  /* ── 【新增】焦点环：宽度 + 偏移 + 苹果式 halo（FR-2 #2/#5、FR-10 #8） ── */
  --pm-ring-w: 2px; --pm-ring-offset: 2px;
  --pm-halo: 0 0 0 3px rgba(0,113,227,.25);
  --pm-target: 24px;           /* FR-5 命中区下限（min-height/min-width 用它） */

  /* ── 【改】字阶五档 + 行高三档（FR-7；消灭 9.5/10/10.5/11.5/12.5/13.5/21 的零散裸字号） ── */
  --f-tiny: 11px;  --lh-tiny: 15px;
  --f-small: 12px; --lh-small: 16px;
  --f-body: 13px;  --lh-body: 20px;   /* 正文，照宿主 --dsw-font-xs-13 口径 */
  --f-h2: 15px;    --lh-h2: 22px;
  --f-h1: 20px;    --lh-h1: 25px;
  /* 页标题 L0 例外一档：24px/600/1.25/-0.4px（FR-12 A；**不是**新令牌，写在规则里并列入取值表） */

  /* ── 【改】圆角两档 + 发丝线一档（FR-10 #4/#5） ── */
  --r1: 8px; --r2: 8px; --pm-pill: 999px; --pm-hair: .5px;

  /* ── 间距：4/8 栅格（FR-7 #3 的闭集枚举） ── */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 28px;

  /* ── 【新增】模块间距（FR-12，D-7 裁定晚于 FR-7）：36px ──
     36 = 4×9 仍在 4px 栅格上，但它是 FR-7 闭集枚举（4/8/12/16/20/28）的**唯一例外**——
     必须显式声明，不许当成"28 的近似"混过去。H2 = 36 ÷ 模块内 8 = 4.5 ≥ 3（FR-12 B）。 */
  --pm-space-module: 36px;   /* 模块之间；模块标题↔正文 8px、卡片内块间 20px、行内 4–6px */
}
```

**字段说明（令牌逐条，含取值与约束）**：

| 令牌 | 取值 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `--pm-text` / `--pm-text2` / `--pm-text3` | `#1d1d1f` / `#6e6e73` / `#86868b` | 是 | 三档文字色（三档字重之外唯一的层级通道） | `#86868b` **只许非文本**（3.62:1 < 4.5:1）；真文字一律 ≥ `--pm-text2` |
| `--pm-accent` / `--pm-accent-text` | `#0071e3` / `= --pm-accent` | 是 | 唯一强调色 + "文字级主色"的**契约位（名字保留）** | FR-4 表里的 `#2f5fd0`（文字级主色）与"面/文字两级主色"是 **D-5 之前**的取值，已作废；`--pm-accent-text` 这个名字**保留**是为了满足契约表（可核验 `detail-ui-v3.html:4030`）；焦点环与选中 Tab 都用 `--pm-accent` |
| `--pm-accent-hover` | `= --pm-text` | 是 | hover 色 | **不引第二档蓝**（色板外色值会被静态扫描判红） |
| `--pm-danger` / `--pm-warn-text` / `--pm-ok-text` / `--pm-teal-text` | `#d70015` / `#c93400` / `#1e7e34` / `#0e7c8f` | 是 | 语义前景 | 四者在白底分别 5.38 / 5.28 / 5.14 / 4.89 : 1，均 ≥4.5:1（FR-4 表里的 `#dc3545`（4.53:1，余量 <5%）与 `#8a5a00` 是 **D-5 之前**的取值，已作废）。`--pm-teal-text` 只**保留定义**，其作为前景色的**用法**被 FR-10（二）取消 |
| `--pm-line` / `--pm-line-strong` / `--pm-line-soft` | `#0000001a` / `#00000029` / `#0000001a` | 是 | 发丝线（一档 + 一档更强的） | 属**已登记的非文本豁免**（两侧有文字与留白，不标识任何控件/状态）；与宿主同口径 |
| `--pm-bg-soft` / `--pm-bg-softer` / `--pm-surface` | `#f5f5f7` / `transparent` / `#fff` | 是 | 底色**只两档**：白 + 分组底 | 头部/操作条/评论不加底色（FR-10 #2） |
| `--pm-icon` / `--pm-icon-sm` | `14px` / `12px` | 是（新增） | 图标尺寸两档 | **不出现第三种**；Tab 栏内 `<svg>` 实测 14±1（原型 `tabIconSvgW/H`） |
| `--pm-dur-fast` / `--pm-dur` / `--pm-dur-slow` / `--pm-ease` | `90ms` / `120ms` / `150ms` / `cubic-bezier(.2,.7,.3,1)` | 是（新增） | 交互反馈时长与缓动 | 区间 80–150ms；规则里**不写裸 ms**；`prefers-reduced-motion: reduce` 下归零 |
| `--pm-ring-w` / `--pm-ring-offset` / `--pm-halo` | `2px` / `2px` / `0 0 0 3px rgba(0,113,227,.25)` | 是（新增） | 焦点环三件套 | 颜色与相邻色 ≥3:1；面状控件用 `-2px` 内偏移、小控件用 `+2px` |
| `--pm-target` | `24px` | 是（新增） | 命中区下限 | 判据量的是**命中区**（`getBoundingClientRect()`），不是视觉框 |
| `--f-*` / `--lh-*` | 五档 `11/15 · 12/16 · 13/20 · 15/22 · 20/25` | 是 | 字阶 + 行高 | 密集表行可 1.35；页标题 L0 = 24px 单列一档（FR-12 A） |
| `--r1` / `--r2` / `--pm-pill` / `--pm-hair` | `8px` / `8px` / `999px` / `.5px` | 是 | 圆角两档 + 发丝线 | 取消 4px / 6px / 10px / 12px（FR-10 #4） |
| `--s1`…`--s6` | `4/8/12/16/20/28px` | 是 | 间距集合（FR-7 #3 的**闭集枚举**） | 只允许这六个值；裸 `6px` 一类收敛到相邻档 |
| `--pm-space-module` | `36px` | 是（新增） | **模块之间**的间距（FR-12 B） | **FR-7 闭集枚举的唯一例外**，必须显式声明：36 = 4×9 仍在 4px 栅格上；H2 = 36 ÷ 模块内 8 = 4.5 ≥ 3。模块标题↔正文 8px、卡片内块间 20px、行内 4–6px 走既有档位 |
| **被删除**：`--dsw-*` 的全部引用、`[data-ds-dark-theme] .dsh-pm-detail[data-report-shell]` 覆盖块、`--rail`/`--gap-col` 的栅格用法 | — | — | 浅色岛 + 模块改上下结构后不再需要 | 删除即"半个主题残留"消失；`grep` 断言：分片不再出现 `--dsw-alias-label-tertiary` 与四个假令牌名 |

**索引设计**：不适用（CSS 自定义属性不建索引）。
**关联关系**：`1:1` 关联到需求详情页壳（`.dsh-pm-detail[data-report-shell]`）——**只有这一个消费者**；
其余 12 个样式分片与本块**无关联**（边界 #3：一行不改）。

> ✅ **令牌命名已定稿（2026-10-05 父代理裁决 3）：统一叫 `--pm-space-module`**。
> 落定过程中同批文档曾出现三种拼法——本份与 `architecture.md` 按裁决记作 `--pm-space-module`，
> `interfaces.md` / `test-cases.md` 一度记作 `--pm-gap-module`，`frontend.md` 一度记作 `--pm-module-gap`；
> 三者取值与语义完全一致（36px、FR-7 闭集唯一例外、H2 = 4.5），**现已全部收敛为 `--pm-space-module`**：
> 依据是多数派 + 本需求其它新增令牌均为 `--pm-*` 语义命名（`--pm-icon` / `--pm-dur-*` / `--pm-ease` / `--pm-accent-text`），
> 且 `--pm-space-module` 这个词面本身说明了用途。**`--pm-gap-module` 与 `--pm-module-gap` 一律不再使用**
> （实施时若在代码里见到这两个名字，即为漂移，须改回 `--pm-space-module`）。

**三处需在实施汇报里声明的差异**（原型改造层 CSS ≠ 本文条款）：

1. 原型给 `[data-report-seg="head"]` 加了 `background: var(--pm-bg-soft)` + `border-radius: 12px`；
   本条 FR-10 #2/#4 的**字面口径**是"头部不加底色、圆角只 8/999" → **以条款为准**（原型该处属改造层 CSS，
   不参与"内联壳逐字节"比对）。
2. 原型在 FR-2/FR-5 的**说明文字**里点名了 `--pm-ring-offset` 与 `--pm-target`（`detail-ui-v3.html:4874`、`:5069`），
   但令牌块里**没有定义**（`grep` 各 1 处命中，均在说明文字）→ 本文把两个名字**补成真实定义**，消除"文档提到、代码里没有"的悬空。
3. **模块间距 36px 与原型观测值的差**：原型改造层用 `margin: 0 0 36px`（`detail-ui-v3.html` 的布局修复层），
   但它 `proto-geometry` 块里当前记的是 `moduleGap=24`（`moduleGapRatio` 恰好 `3`）——**是旧一轮生成物**。
   本次取 **36px**（FR-12 B 明文，晚于 FR-7 的 D-7 裁定），并在实施阶段**重测**：`moduleGap=36`、
   `moduleInnerGap=8`、比值 **4.5**。**不许**拿 24/3.0 当"已经达标"（那是同一条判据的两个不同取值，
   差异必须由实施落地并复测，见 K7 的同一类问题：原型观测块是生成物，不是判据）。

### 图标模块导出（`src/client/icons.ts`，新增） `serves: FR-1, FR-8`

**用途**：详情页**唯一**的图标源——结构图标的"取值层"（对应令牌层是上文的 `--pm-icon*`）。
**定义（纯导出、无运行时依赖、无副作用）**：

```typescript
// src/client/icons.ts —— 新增模块；不做任何 fetch / DOM / 副作用
import type { ReportTabKey } from './views/report-tabs.js'   // 类型单向依赖：图标模块不反向 import 渲染层

/** 六个 Tab 的内联 SVG（各自不含 width/height，尺寸由 --pm-icon 决定） */
export const TAB_ICON_SVG: Record<ReportTabKey, string>

/** 全族常量（每个图标逐字复用，禁止每个图标各写一套） */
export const ICON_VIEW_BOX = '0 0 16 16'
export const ICON_STROKE_WIDTH = '1.5'
export const ICON_SVG_ATTRS = 'viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
```

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `TAB_ICON_SVG` | `Record<ReportTabKey, string>` | 是 | 键集合 = `'trunk' \| 'docs' \| 'dag' \| 'dialogue' \| 'token' \| 'prompts'`（`report-tabs.ts:40`） | `Record` 的完备性让**漏写一个键 = 编译期类型错**（不回落 emoji） |
| 图标自身属性 | 常量字符串 | 是 | `viewBox="0 0 16 16"` / `stroke-width="1.5"` / `stroke="currentColor"` / `fill="none"` / 圆角端点 / `aria-hidden="true"` | 装饰性（图标旁**总有**可见文字：Tab 名）→ 一律 `aria-hidden`；不出现"只有图标没有名字"的控件 |
| 尺寸 | **不写在 SVG 上** | — | 由 CSS 的 `--pm-icon`（14px）/ `--pm-icon-sm`（12px）决定 | 不出现第三种尺寸；判据实测 `<svg>` 的 `width/height` = 14±1 |
| 来源 | 编译期常量字符串 | — | 与全仓"纯字符串渲染"一致 | **不装图标库、不用 icon font、不引网络资源**（FR-1 #5） |

**索引设计**：不适用。**关联关系**：`1:N` 关联到消费者——Tab 栏（`report-tabs.ts:135` 的 `.dsh-pm-tab-icon` span）
与结构位标记（`panels/prompts.ts:282`）；`FR-8` 的严重度/结论标记若用 SVG 圆点，也取自本模块（`aria-hidden` + 可访问名由周边文字承担）。

**原型对照与一处需声明的差异**：原型为了展示"改前 emoji ↔ 改后 SVG"，在图标 span 上留了
`data-proto-icon-before="📋"` 这类**标注属性**（`detail-ui-v3.html#FR-1` 的壳内 DOM）——它是原型自用的比对标记，
**真实实现不得输出**（否则等于把 emoji 又留在产物里，撞 FR-1 的 `grep` 判据）。

### DOM 属性契约（加法式扩展） `serves: FR-2, FR-3, FR-5, FR-9, FR-11`

**用途**：把"语义/键盘/焦点/披露"这些**不可见的契约**登记成一张表——它们只**新增**，不改任何既有属性与事件通道。
**定义（改后的形状，逐条对应原型 `detail-ui-v3.html#FR-3`、`#FR-2`、`#FR-9`、`#FR-11`）**：

```html
<!-- ① Tab 栏：容器 + 每项 + 面板（FR-3） -->
<div class="dsh-pm-tabs" data-report-tabs="1" role="tablist" aria-label="需求详情分区">
  <button type="button" class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"
          role="tab" id="tab-trunk" aria-selected="true" aria-controls="panel-trunk" tabindex="0">
    <span class="dsh-pm-tab-icon" aria-hidden="true"><svg …aria-hidden="true">…</svg></span>汇报
  </button>
  <!-- 其余五项：aria-selected="false" tabindex="-1" -->
</div>
<div class="dsh-pm-tab-panel" data-tab-host="trunk" data-tab-content="trunk"
     role="tabpanel" id="panel-trunk" aria-labelledby="tab-trunk">…</div>

<!-- ② 主操作按钮的后果披露（FR-11）：title 保留 + aria-describedby 指向视觉隐藏但可访问的节点 -->
<button type="button" class="dsh-pm-btn primary" data-action="move-req" data-id="REQ-…"
        title="<服务端 consequence 原文>" aria-describedby="act-desc-move">提交验收</button>
<span class="dsh-pm-sr-only" id="act-desc-move"><服务端 consequence 原文></span>
```

| 属性 | 取值 | 新增/变更 | 说明 | 约束 |
|---|---|---|---|---|
| `role="tablist"` / `aria-label` | 容器 | 新增 | Tab 组的语义与名字 | 与仓内既有先例对齐（`src/client/views/board.ts` 的视图切换已用 `role="tablist"/"tab"`） |
| `role="tab"` + `aria-selected` + `aria-controls` | 每项 | 新增 | 读屏读成"选项卡 N / 6，已选中" | 选中项**恰 1 个** `aria-selected="true"` |
| `tabindex` | 选中 `0` / 其余 `-1` | 新增 | **roving tabindex**：Tab 键在一组里只停一次 | 方向键 `←/→/Home/End` 走组内（FR-3 #4） |
| `id` / `aria-labelledby` | `tab-<key>` / `panel-<key>` | 新增 | 稳定 id：面板未激活时**不在 DOM**，所以不能靠"实时取引用" | 见下文「兼容性」的 id 唯一性前提 |
| `role="tabpanel"` | 面板容器 | 新增 | 面板语义 | 与 `aria-controls` 成对；不改 `data-tab-host`/`data-tab-content` |
| `aria-describedby` + `.dsh-pm-sr-only` | 主操作按钮 | 新增 | 后果的**第二种披露方式**（`title` 仍在） | 节点文本 === 服务端 `consequence` 原文；节点视觉隐藏（≤1px 或 `clip-path`）但对读屏可见；**不许只剩 `title`**（hover-only 反模式） |
| `aria-hidden="true"` | 每个结构图标 `<svg>` | 新增 | 图标是装饰性的（旁边总有可见文字） | 不出现"只有图标没有名字"的控件 |
| `:focus-visible` 计算样式 | 全部可聚焦元素 | **变更（接管）** | 焦点环：2px 实线 + 两档偏移 + halo | 颜色取唯一强调色；与相邻色 ≥3:1；鼠标点击不留环 |
| `outline-offset` | 面状 `-2px` / 小控件 `+2px` | 新增 | 面状控件不撑出方框、不挤动相邻元素 | 靠选择器特异性分两档（`detail-ui-v3.html#FR-2` 记着实测：`[role=tab]` 必须再写一遍才不被 `:is(...)` 盖住） |

**索引设计**：不适用。**关联关系**：`role="tab"` ↔ `aria-controls="panel-<key>"` ↔ `role="tabpanel" id="panel-<key>"`
三者**互指闭合**（面板挂载时才带同 id，见 FR-3 #5）。

### 兼容性分析与回滚路径 `serves: FR-2, FR-3, FR-5, FR-7, FR-13`

**兼容性分析**：

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| Tab 项新增 `role`/`id`/`aria-*`/`tabindex` | DOM 上只有 `class`/`data-action`/`data-tab` | 多四个属性，事件通道与语义不变 | **属性一律追加在既有属性之后** → `tests/report-shell.test.ts:138` 的连续子串断言 `'class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"'` **依旧成立**（这是 FR-3 点名的耦合；原型把属性插在 `class` 之后会打断子串，**最终实现以子串保住为准**并留痕） |
| Tab 图标由 emoji 变 `<svg>` | `.dsh-pm-tab-icon` 内是一个 emoji 文本节点 | 同 span 内是一个 `aria-hidden` 的 `<svg>` | 旧断言若按 emoji 字面量匹配 → 改为按结构位判据（`grep` 结构位 emoji 归零 / 每个 Tab 含且仅含 1 个 `<svg aria-hidden="true">`）；正文里的装饰性 emoji 不受影响 |
| 新增 `id="tab-<key>"` / `id="panel-<key>"` | 无 id | 稳定 id（**不含 reqId**） | 前提：详情页**同一文档同时只挂一份壳**（既有渲染纪律；原型为演示两态会渲染两份，那是演示态）。若将来出现两份并存 → id 必须改成 `panel-<reqId>-<key>`；本需求按条款用稳定 id，并把这条前提写进断言注释 |
| 头部删除 `.dsh-pm-comment-form` / `[data-role="comment-input"]` / `add-comment` 调用点 | 详情页有 2 个以上评论框（`board-mount.ts:271` 原注释即为此缺陷而写） | 头部这个消失；**通道与其它调用点一字不改**（对话 Tab 的 `dialogue.ts:261-266` 仍在） | `board-mount.ts:276 commentInputOf()` 是"按钮所在表单"作用域取法 → 头部表单消失后**更安全**（`:284` 的整页回落现在只会命中对话 Tab 那个）；`captureDetailDraft()` 的 `comments['head']` 槽位恒空 → `DetailDraft` 类型**不动**（`comment`/`comments` 字段保留，只是没有值），避免动 `board-mount` 的接口 |
| 常驻后果节点改成 sr-only + `aria-describedby` | 可见一行灰字（`.dsh-pm-action-consequence`，实测 10.5px / `0×0`） | 节点视觉隐藏、读屏可读、`title` 保留 | 断言从"存在可见后果"改为"**DOM 不含常驻后果节点，且 `aria-describedby` 指向的文本 === 服务端 `consequence`**"（FR-11 #2/#6）；`sr-only` 节点必须被"最小字号"类断言按可见性排除 |
| 「均需人工确认」→「需人工确认」 | 文案 6 字 | 文案 5 字 | `data-human-only-mark="1"` 与每格 `data-human-only="true"` **逐字不动**（机器可读面是判据，人看的字是外观）；`tests/report-shell.test.ts:219`、`tests/report-firstscreen-gaps.test.ts:447/450-457` 同步 |
| 分片不再引 `--dsw-*` 主题敏感令牌 | `styles/report.ts:62-65` 引四个假令牌 + 一个真令牌 | 四个 `--pm-*` 全部改为页面自持值 | `grep` 断言：分片不再出现 `--dsw-alias-label-tertiary` 与 `--dsw-text-primary/-text-secondary/-accent/-bg-primary`；宿主两套主题下详情页**同一副长相** |
| 阶段条新增 `✓` / `▸` 真实文本节点 | 只有颜色 + 标签文字 | 报告壳路径多两个字符 | **共享渲染器**默认关 → 旧详情页（`stage-detail.ts:199`）输出**逐字节不变**（边界 #3） |

**回滚路径（不涉及数据与台账）**：

1. 还原三处源码：`src/client/views/`（本轮改过的渲染字符串：`report-head.ts` / `report-tabs.ts` / `report-band.ts` /
   `stage-detail.ts` / `panels/prompts.ts` / `artifacts.ts` / `verification.ts`）、**删除** `src/client/icons.ts`、
   还原 `src/client/styles/report.ts`（外观唯一分片）；
2. 还原配套断言与脚本改动（`tests/report-shell.test.ts`、`tests/report-firstscreen-gaps.test.ts`、
   `scripts/req-report-probe.mts` 的新增断言组、**删除** `scripts/req-detail-contrast.mts`）；
3. `pnpm build:client`（C-12，接口与产物名不变）→ 刷新页面即回到旧外观；
4. **不需要**任何数据迁移、台账回滚、端点回滚；服务端与 `data-*` 契约全程未动。

## 冻结面逐条登记（一字不改） `serves: FR-3, FR-9, FR-11, FR-13`

> 为什么单列一节：本需求的判据（探针、用例、原型锚点）全部建立在下面这些标记上；动了任何一个，
> 等于把"可核验"一起动掉。**逐条列名 + 逐条写"不变"的理由**。

**`data-*` 面板契约（冻结）**：

| 契约（逐条列名） | 出现处（证据指针） | 本需求 | 不变的理由 |
|---|---|---|---|
| `data-report-shell` | `report-tabs.ts:194`（壳根） | 不变 | 全部外观选择器的作用域前缀；也是"浅色岛"的边界 |
| `data-report-seg`（head/band/tabs/panel） | `report-tabs.ts:193`（分段局部更新的单位） | 不变 | 分段替换是"滚动/展开态不丢"的实现方式 |
| `data-report-head` / `data-head-row` / `data-head-state` | `report-head.ts:421/462` | 不变 | 头部断言与 D-8 的两行判据靠它们定位 |
| `data-report-band` / `data-band-cell` | `report-band.ts`（状态带三格） | 不变 | 状态带三格的判据锚点 |
| `data-report-tabs` / `data-tab` / `data-tab-host` / `data-tab-content` | `report-tabs.ts:139/180` | 不变 | Tab 切换与"未激活面板不在 DOM"的判据锚点 |
| `data-panel="<key>"`（六个面板各自输出一次） | 各 `panels/*.ts` 根容器 | 不变 | 面板计数断言（`match(/data-panel=/g).length`）靠它；包装器刻意用 `data-tab-host` 避免重复 |
| `data-report-actionbar` / `data-report-actions` / `data-action-grid` / `data-action-key` / `data-action-rank` | `report-head.ts:180/195/197` | 不变 | FR-9 的位置判据（主操作左缘、危险动作间距、同排）靠它们 |
| `data-human-only` / `data-human-only-mark` | `report-head.ts:182/199` | 不变 | 机器可读的人工门面（改的是给人看的文案长度） |
| `data-report-windows` / `data-jump-session` / `data-sid` / `data-role` / `data-archived` | `report-head.ts:127-137` | 不变 | 窗口跳转（含"已归档仍可点"）的判据锚点；D-8 只改**容器归属** |
| `data-created-at` | `report-head.ts:415` | 不变 | D-8 的 `windowLeft < createdAtLeft` 判据靠它 |
| `data-comment-list` / `data-comment-row` / `data-comment-*` | `report-head.ts:338/444`（只读列表） | 不变 | FR-13 只删输入入口，列表判据全留 |
| `data-draft-key` | `report-head.ts:455`（头部表单）、`dialogue.ts`（对话面板） | 头部实例随输入框一起消失；**属性名与对话面板上的那个不变** | 草稿分槽机制（`board-mount.ts:240`）按属性分槽，属性本身不改 |
| `data-severity` / `data-ref-kind` / `data-ref-id` | `report-band.ts:141/147` | 不变 | 缺口严重度与引用的判据锚点（K4 是门禁侧的假锚点问题，**不改这里**） |
| `data-outcome` / `data-gaps` / `data-verify-verdict` / `data-gate-table` / `data-doc-table` | `report-band.ts` / `panels/verification.ts` / `panels/docs.ts` | 不变 | FR-8 的结论三态判据锚点 |
| `data-panel-degraded` / `data-panel-error` / `data-panel-notice` | `report-tabs.ts:159/163/167` | 不变 | 降级/失败/提示三态的可断言性 |
| `data-report-revision` | `report-tabs.ts:195` | 不变 | 缓存键与分段更新的失效依据 |
| `data-msg-text-raw` / `data-dialogue-*` / `data-dag-tab` | `panels/dialogue.ts` / `panels/dag.ts` | 不变 | 对话检索与 DAG 面板判据锚点（本次不碰这两块的内容层） |

**`data-action` 写路径（冻结：不改事件通道与语义）**：

| 通道 | 出现处 | 本需求 | 不变的理由 |
|---|---|---|---|
| `switch-tab` | `report-tabs.ts:134`（Tab 项） | 不变（**方向键也走这一条**） | FR-3 #4：键盘切换复用既有通道，不新造写路径 |
| `move-req` | `report-head.ts:84-86`（`move` 与 `cancel` 同映射） | 不变 | 危险动作的确认框（`data-confirm`，`report-head.ts:188`）与代码级拒绝都在服务端侧 |
| `plan-approve` / `plan-reject` | `report-head.ts:87-88` | 不变 | 计划审批的写路径 |
| `verify-pass` / `verify-rework` | `report-head.ts:89-90` | 不变 | 验收裁决的写路径 |
| `add-comment` | `board-mount.ts:1057` 分支；调用点：`report-head.ts:457`（**本次删除**）、`dialogue.ts:266`、`stage-panel.ts:162`、`stage-detail.ts:135` | **通道不变**，只去掉详情页头部那一个调用点 | FR-13 #2：对话 Tab 的评论链路一字不改；FR-13 #3：`board-mount.ts:271-284` 的解释逻辑要能继续取到对话 Tab 的框 |
| `back` / `jump-session` / `open-doc` / `report-head-retry` / `report-panel-retry` | `report-head.ts:68/127`、`report-tabs.ts:164` | 不变 | 导航/重试类通道；本次不改行为（只改外观与文案） |

**服务端字符串（冻结）**：`label` / `consequence` / `verdictLine` / `nextStepForAgent` 等**一字不改**——
FR-11 是"同一句服务端文本换一个披露位置"（从可见流换到 `title` + `aria-describedby`）。

## 关键决策与取舍 `serves: FR-4, FR-9, FR-10, FR-12, FR-13`

> 主体取舍写在 `architecture.md` 的同名节；本份只补**与本份主题（令牌/契约/冻结面）直接相关**的几条。

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 令牌**取自页面自持**还是继续引宿主变量 | 否掉"引 `--dsw-*` + 回退值"这套写法（现在就是这样，`styles/report.ts:62-65`） | 岛内全部 `--pm-*` 取**浅色原值**，作用域只到 `.dsh-pm-detail[data-report-shell]` | ① 四个令牌名在 DSH 里**定义数 0**（K1 证据①），回退值恒生效 → "跟随主题"是假的；② 唯一真实存在的那个（`--dsw-alias-label-tertiary`）恰好制造"白岛 + 深色主题浅灰字"= 2.13:1（K2）；③ **D-3** 裁定本次只做详情页，插件级接线（426 处）不在范围内。**不取页面自持**的替代品就是"假跟随"，那正是本次要修掉的说谎点 |
| 浅色岛要不要保留 `--pm-accent-text` 这个别名位 | 否掉"直接删掉别名、全用 `--pm-accent`" | **保留别名**，取值 `= var(--pm-accent)` | 别名是"文字级主色"的**表述位**（FR-2/FR-4 的条款与断言里都点名过它）；删名字会让既有表述出现悬空引用，保留而收敛取值既诚实又不动表述。可核验：`detail-ui-v3.html:4030` |
| 高对比度相关令牌保留几档 | 否掉"FR-4 表的两级主色 + 危险保留 `#dc3545`（余量 <5%）" | FR-10 色板逐值定死（唯一强调色 + `#d70015` / `#c93400`） | D-5 之后的收敛结果（"逐值定死，全部按 WCAG 公式核过"）；余量极小的值会变成"下次谁来复核"的负担，换掉即消解 |
| 模块间距取 36 还是 28（FR-7 的闭集 vs FR-12 的分组） | 否掉"用 `--s6: 28px` 顶替"（能守住 FR-7 的枚举，但 H2 = 28 ÷ 12 ≈ 2.3 < 3 → FR-12 的"分组靠比值"不成立）；也否掉"直接写裸 `36px`"（不留名字就无法被断言与文档引用） | **新增专用令牌 `--pm-space-module: 36px`**，并把它**显式声明为 FR-7 闭集枚举（4/8/12/16/20/28）的唯一例外** | **FR-12 B** 明文"模块**之间 36px**"（D-7 裁定晚于 FR-7，取更晚更具体的那条）；36 = 4×9 仍在 4px 栅格上；H2 = 36 ÷ 模块内 8 = **4.5 ≥ 3**。原型 `proto-geometry` 现在记的是 `moduleGap=24`（ratio 3.0，旧一轮生成物）→ 差异由实施落地并**重测**，不许拿旧观测值当"已达标" |
| 冻结面用"约定"还是"逐条列名" | 否掉"写一句'data-* 与写路径不动'" | **逐条列名 + 逐条写理由**（上文两张表） | 冻结面是全部判据的地基；只写一句约定，实施时很容易"顺手"给 `data-tab` 加个后缀或把 `add-comment` 从头部搬到别处——那时判据与原型会**同时**失真，且没人第一批发现 |
| `add-comment` 是"删通道"还是"删调用点" | 否掉"把 `add-comment` 从白名单/分支里删掉"（读起来更干净） | **通道冻结**，只删详情页头部那一个调用点 | FR-13 #2/#3：对话 Tab 的评论链路一字不改，且 `board-mount.ts:271-284` 的原注释就是为"多个评论框"写的——删通道会把对话 Tab 的提交一起打死，属于"删过头" |
| 稳定 id 还是带 reqId 的 id | 否掉 `id="panel-<reqId>-<key>"`（更长、更"安全"） | 稳定 id（`tab-<key>` / `panel-<key>`），并把"同时只挂一份壳"写成前提 | FR-3 #5 明确"`aria-controls` 用**稳定 id**（`panel-<key>`）声明"；带 reqId 会让"未激活面板不在 DOM"这条判据的锚点随需求变，不利于断言复用。前提被写进断言注释，越界即红 |
| 结构图标的"删除"是否要连原型标注一起算 | 否掉"把原型里的 `data-proto-icon-before` 也照搬进真实产物" | 真实实现**不输出**该标注属性 | 它是原型自用的"改前 emoji ↔ 改后 SVG"比对标记；照搬等于把 emoji 留在产物里，撞 FR-1 的结构位 `grep` 判据（判据量的是产物，不是注释） |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-5, FR-6, FR-7, FR-8, FR-11`

> 主体写在 `architecture.md` 的同名节；本份只列**与本份主题（令牌 / 图标导出 / DOM 契约 / 冻结面）相关**的差异。

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 令牌的"存在性"可证伪 | 写 `var(--dsw-xxx, 回退)` 就当它能跟随主题 | 岛内令牌**不引宿主**；宿主侧令牌是否真的存在用两条命令取证（官方清单 + 包内定义数） | "声称跟随主题"与"真的跟随"是两件事，回退值会把它伪装成前者 | K1/K2 证据（`cordis_inspect_query(client/Theme/listTokens)`；`grep -a -c "--dsw-text-primary:" …/app.asar` → 0）；`styles/report.ts:62-65` |
| 图标尺寸与颜色**分离** | 图标自带宽高与配色（emoji/图片/sprite 各自一套） | 尺寸走 `--pm-icon*` 两档、颜色走 `currentColor` | 选中态图标不跟色正是基线实拍的缺陷（`evidence/ui-before-zoom-tabbar.png`） | `src/client/icons.ts`；`styles/report.ts` 的 `.dsh-pm-tab-icon`；FR-1 锚点（`<svg>` 14±1） |
| 覆盖度由**类型**保证 | 图标表漏一个键 → 运行时回落成 emoji 或空 | `Record<ReportTabKey, string>` → 漏键 = **编译期**类型错 | 运行时回落是"静默降级"："点 Token 看到汇报"这类缺陷都是这么来的（`report-tabs.ts:100` 的既有守卫注释同一思路） | `src/client/icons.ts`；`npx tsc --noEmit`（C-15） |
| 焦点环两档偏移靠**特异性**而非两套规则 | 写两条选择器分别设 offset（会被高特异性那条盖掉） | 把 `[role="tab"]` **再写一遍**凑到 `(0,5,1)` | 原型实测：`:is(button,a[href],summary,input,[role="tab"]):focus-visible` 是 `(0,4,1)`，只写 `[role="tab"]:focus-visible`（`(0,4,0)`）**不生效** | `detail-ui-v3.html#FR-2` 的注释（含这次实测）；`styles/report.ts` 焦点环两条规则 |
| 判据阈值**不进原型** | 把阈值写进原型 HTML 的观测块，让人以为是"原型判的" | 原型只记观测量（`proto-geometry` 里只有 name/value/unit/at）；阈值写在脚本与本文 | 阈值是**设计决策**，混进观测物会让"尺子"和"结论"分不开，也无法反向验证判据会红 | `prototypes/detail-ui-v3.html` 的 `<!-- proto-geometry … -->`（36 条观测，无阈值）；`scripts/req-report-probe.mts` 的常量 |
| DOM 属性**加法式**而非重排 | 顺手把属性按"可读顺序"重排（class 后面紧跟 role/aria） | 新属性**一律追加在既有属性之后** | 既有断言按**属性顺序**做子串匹配（`tests/report-shell.test.ts:138`）——重排会当场打断它，而这类"为了好看"的重排最容易顺手做 | `tests/report-shell.test.ts:138`；FR-3 的「已知耦合」；实施汇报须写明选了哪一条 |
| 隐藏文本与"最小字号"判据的关系显式化 | 把 sr-only 也当可见文字一起量 → 假红；或干脆不量 | 断言**按可见性过滤**（零尺寸 / `clip-path` / `overflow:hidden`），并把该节点字号也提到 11px | FR-11 引入的 sr-only 节点实测 10.5px / `0×0` / `overflow:hidden`；不排除它这条断言**必然假红** | 原型覆盖边界 #5；`scripts/req-report-probe.mts` 新增的最小字号断言 |
| 冻结面**逐条列名** | 写一句"契约不变" | 两张表逐条列名 + 逐条理由（含"删通道 vs 删调用点"的区分） | 冻结面是判据地基；一句话约定挡不住"顺手改名"，而改名会让探针、用例、原型锚点一起失真 | 本文「冻结面逐条登记」两张表；`src/client/board-mount.ts:271-284`；FR-13 #3 |
