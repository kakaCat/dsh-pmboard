/**
 * pmboard 样式分片 · report（需求详情页「工作汇报」壳，REQ-261004222448-292a）。
 *
 * ## 这一片是什么
 *
 * **报告页的外观收在自己这一层**（2026-10-05 重做，第二轮验收「样式还是不对」的处置）。
 *
 * 为什么必须自己一层：壳与六个面板沿用的是旧详情页的类（`.dsh-pm-detail-head` /
 * `.dsh-pm-stats` / `.dsh-pm-tabs` / `.dsh-pm-block` / `.dsh-pm-dot` …），而它们的**外观由旧分片定义**
 * ——两套视觉语言叠在一起，看出来的就是「旧详情页 + 一层补丁」。旧分片的规则**一个字都不许改**
 * （那是别的页面的长相），所以这里把报告页需要的全部外观**重写一遍**，并靠
 * `.dsh-pm-detail[data-report-shell]` 前缀把特异性提到旧规则之上（旧规则最高是
 * `.dsh-pm-detail details.dsh-pm-fold summary` 量级；本片对应写作 `.dsh-pm-detail[data-report-shell] details.dsh-pm-fold summary`）。
 *
 * ## 视觉唯一规范
 *
 * `docs/requirements/REQ-261004222448-292a/prototype/detail-report.html` 的内联 `<style>`。
 * 本片的每条规则都能指回原型那一段（注释里给的是原型的类名），尺寸/字号/间距用原型 `:root` 的原值
 * （`--s1..--s6` / `--pm-space-module` / `--r1..--r2` / `--f-*` / `--lh-*` / `--page` / `--rail` / `--gap-col`）。
 *
 * 色值口径（REQ-261005155003-f32f / FR-4）：**详情页是一座诚实的浅色岛，不跟随宿主主题**。
 * 全部颜色令牌取页面自持的浅色原值，一个宿主主题变量都不引——旧写法「引宿主令牌 + 回退值」是假跟随：
 * 它所引的四个名字在 DSH 里根本不存在（回退值恒生效），而三级灰引的那个宿主令牌在宿主深色下是
 * `#adb2b8`，白底上只剩 2.1:1（比浅色下更差）。宿主两套主题下本片**同一副长相**：岛内已无深色主题覆盖块。
 * 线条/底色一律走本片令牌（`--pm-line` / `--pm-line-strong` / `--pm-bg-soft`），规则里不写裸色值。
 *
 * ## 两条不许丢的规则（最上面两条）
 *
 *  - `.dsh-pm-tab-panel { display: block }`：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动；
 *    唯一豁免 = 对话面板的 `.dsh-pm-chat-scroll`，460px 固定高内滚动，见 ⑧ 段 FR-6 标记块）；
 *  - 对话面板的消息行是 `display:flex`（气泡布局）——任何 `display` 规则都会盖掉浏览器默认的
 *    `[hidden]{display:none}`（那是最弱的一条），所以这里用**更高特异性**把隐藏规则钉死。
 *
 * ## 硬约束（本片自我约束，探针会真 DOM 实测）
 *
 * 全片**不出现** overflow 的 auto / scroll 取值，**也不出现**高度上限（不限高）：一律铺开、不做内层滚动。
 * **唯一豁免**（REQ-261006130057-7a43 · FR-6 · D-5/D-7，architecture §边界裁决 3）：对话面板的
 * `.dsh-pm-chat-scroll`——460px 固定高、纵向内滚动，吸顶分页条挂在它里面（见 ⑧ 段 FR-6 标记块）。
 * （这两个 CSS 片段刻意不在这里按原样写出：注释里留一份同样的字面量，会让「分片是否违规」只能靠
 *   人去分辨注释与规则——探针只看真 DOM，这条纪律也照同一口径表述。）
 * 高度是靠字号/行距/内边距收紧 + 少渲染几条挣回来的，不是靠把内容关进滚动框。
 */
export const REPORT_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   ⓪ 基底：面板包装器不吃内层滚动 · 消息隐藏规则钉死
   ══════════════════════════════════════════════════════════════════════════ */

/* 面板包装器：一律铺开（FR-11 #7）。这条是壳体契约，不加作用域前缀也要成立。 */
.dsh-pm-tab-panel { display: block; }

/* 对话面板：被标 hidden 的消息必须真的看不见。
   下面 ⑧ 段把 .dsh-pm-msg 写成了 display:flex，故这里必须用更高特异性（+1 个类 = .dsh-pm-detail[data-report-shell]）
   才盖得住；两条都留，防的是"后人又给 .dsh-pm-msg 加了一条 display"。 */
.dsh-pm-msg[hidden],
.dsh-pm-msg[data-msg-hit="0"] { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[hidden],
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[data-msg-hit="0"] { display: none; }

/* ══════════════════════════════════════════════════════════════════════════
   ① 壳体与设计令牌（对应原型 :root + .wrap）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] {
  /* ── 浅色岛令牌：页面自持浅色原值，**不跟随宿主主题**（FR-4；D-3 裁定本次只做详情页）──
     这里每一个前景/表面都写死浅色原值、不引宿主主题变量：曲面本来就是白的，跟着宿主主题翻转
     前景色只会得到「白底浅字」。宿主深色主题下**同一副长相**——岛内不再有任何深色主题覆盖块。 */
  --pm-text: #1d1d1f;                  /* 苹果 label · 白底 16.9:1 */
  --pm-text2: #6e6e73;                 /* 苹果 secondaryLabel · 5.07:1 —— 承载全部次要真文字 */
  --pm-text3: #86868b;                 /* 苹果 tertiaryLabel · 3.62:1 —— **只许非文本/图标**：禁止承载真文字（<4.5:1） */
  --pm-accent: #0071e3;                /* 唯一强调色（苹果系统蓝）· 4.70:1：当字、当底、白字压它都达标 */
  --pm-accent-text: var(--pm-accent);  /* 文字级主色的**契约位**（名字保留、取值收敛为唯一强调色，不再有更深一档） */
  /* ── 键盘焦点环（FR-2）：宽度 / 两档偏移 / 苹果式 halo ──
     环色取岛内文字级主色（= 唯一强调色 #0071e3，白底 4.70:1 ≥ 3:1，浅深同判）；
     **不引**宿主 「--dsw-alias-state-business-primary」——它在宿主深色下是浅蓝 #7aaaff，白岛上对比不足。
     halo 是装饰，不承担对比度。 */
  --pm-focus-ring-w: 2px;              /* 环宽：2px 实线 */
  --pm-focus-offset-face: -2px;        /* 面状控件（Tab 条 / 折叠条 / 卡片 / 整块面板）：内偏移，不撑出方框、不挤动相邻元素 */
  --pm-focus-offset-ctl: 2px;          /* 小控件（按钮 / 胶囊 / 输入框）：外偏移，环更清楚 */
  --pm-focus-halo: 0 0 0 3px rgba(0,113,227,.25);  /* 苹果式 halo（装饰，不承担对比度） */
  /* ── 命中区下限（FR-5 · WCAG 2.5.8）：min-height / min-width 都引它，不写裸 24px ──
     「design/data-model.md」 的令牌表把它列为**必填（新增）**（「--pm-target | 24px | 命中区下限」），
     「design/architecture.md」 的新增令牌清单里也有它；原型 「#FR-5」 段落的写法同样是
     min-height: var(--pm-target) —— 但原型的令牌块**没有定义**它（该份 data-model 的差异声明 ②：
     那两个名字"文档提到、代码里没有"，要求补成真实定义）。这里就是那个定义点。 */
  --pm-target: 24px;
  /* ── 动效令牌（FR-6）：时长 / 缓动**单点**——规则里只引 var(--pm-dur*)，不写裸毫秒 ──
     三档全在 80～150 毫秒区间内（FR-6 #1；取值见 design/frontend.md §7 的令牌表）。
     三档是"本页共享令牌"，不是"标准值"：ui-ux-pro-max 的 Duration Timing 条目明确反对把
     150～300 毫秒一类区间当普适要求，故这里只说共享这一套（出处见 requirement.md FR-6）。
     与 design/data-model.md 令牌表的差异：那份记的是 90 毫秒 + cubic-bezier(.2,.7,.3,1)
     （与原型改造层同值），本卡（t-70b3f0）与 design/frontend.md §7 记的是 80 毫秒 +
     cubic-bezier(.2,.8,.2,1)——按**任务卡 + 落样式那一节**执行，差异已写进卡汇报待裁。 */
  --pm-dur-fast: 80ms;
  --pm-dur: 120ms;
  --pm-dur-slow: 150ms;
  --pm-ease: cubic-bezier(.2, .8, .2, 1);
  --pm-danger: #d70015;                /* 苹果 accessible red · 5.38:1；遗留的 --pm-ok / --pm-warn 已并入下面 -text 两档 */
  --pm-line: #0000001a;                /* = 苹果 separator = 宿主 border-l2 · 发丝线唯一一档 */
  --pm-line-strong: #00000029;         /* 需要更强分隔时唯一备选 */
  --pm-bg-soft: #f5f5f7;               /* 分组底（唯一允许的第二档底色） */
  /* 中间底色档（浅色岛原第三档）**删除**：FR-10 (二) 定「底色只两档」——白 + --pm-bg-soft，
     而分组底只用于状态带；它原先的用处（头部 / 操作条 / 评论 / 折叠条 hover / 表格 hover /
     证据行 / 口径说明块）一律改为不加底色。 */
  --pm-surface: #fff;
  --pm-hair: .5px;                     /* FR-10 ⑤ 发丝线宽度（设计层令牌名；实现里 .5px 的别名） */
  --pm-accent-hover: #0062c4;          /* 主按钮 hover（设计层令牌名） */                  /* 浅色岛表面：不再引宿主表面色 */
  /* 语义**前景**色：浅色岛上只此一套——宿主深色主题下不换档（岛内覆盖块已整块删除），
     否则白底上的深绿/深棕会被翻成亮一档、对比度反而掉下去。 */
  --pm-ok-text: #1e7e34; --pm-warn-text: #c93400;  /* 苹果 accessible orange · 5.28:1（原值 4.44:1 不达标） */
  --pm-agent: var(--pm-text2); --pm-teal-text: #0e7c8f;   /* 紫色前景色取消（FR-10 (二)）：agent 署名改用普通文字（二级灰） */
  /* tint 三值：**备而未用**（FR-4 #6）——只在某处仍保留同色浅底块时启用并重测；
     取值以 design/frontend.md 令牌表与 interfaces.md「备而未用」行与 test-cases/use-cases 为准
     （design/data-model.md 曾写别名口径，属该份的笔误，已在本卡汇报里登记）。
     三个值都是「压在同色 12% 浅底上仍 ≥4.5:1」的那一档。 */
  --pm-danger-text: #c7303e;      /* 4.52:1 on 12% danger tint */
  --pm-ok-text-tint: #1e7d34;     /* 4.55:1 on 12% ok tint */
  --pm-teal-text-tint: #0d7789;   /* 4.52:1 on 12% teal tint */
  --pm-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  /* ── 图标尺寸两档（FR-1 #2）：**只此两档**，SVG 自己不带 width/height ──
     「--pm-icon」 = Tab 栏结构图标（14px）；「--pm-icon-sm」 = 行内图标（缺口严重度圆点等，12px）。
     为什么尺寸必须在 CSS 而不在 SVG 字符串里：图标值保持"无尺寸字面量"，消费端换档只改一处；
     也正因为 icons.ts 的值里没有尺寸，**令牌缺失时 SVG 会退化到浏览器默认盒**——
     故这两个名字必须与 icons.ts 的文档口径同时在场（FR-1 锚点：Tab 栏内 <svg> 实测 14±1）。 */
  --pm-icon: 14px; --pm-icon-sm: 12px;
  /* 间距 / 圆角 / 字阶：原型同名令牌（--pill 改名 --pm-pill，避免与全局撞名） */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 28px;
  /* ── 模块间距 = FR-7 #3 间距闭集的**唯一具名例外**（FR-12 B 明写 36px；D-7 裁定晚于 FR-7 的取值枚举）──
     闭集就是上面那七档（--s1..--s6 = 4/8/12/16/20/28）；模块**之间**取 36px：36 = 4×9 仍在 4px 栅格上，
     只是不在那七档里；H2 = 36 ÷ 8（模块标题↔正文 = --s2）= 4.5 ≥ 3。**除它以外本片没有第二个脱栅格间距值。** */
  --pm-space-module: 36px;
  --r1: 8px; --r2: 8px; --pm-pill: 999px;   /* 圆角只两档：8px（控件/卡片/输入框）与 999px（状态胶囊）——--r2 归并到 --r1 */
  /* ── 字阶六档（FR-12 A / FR-10 §9）：L0 24 · L1 20 · L2 15 · L3 13 · L4 12 · L5 11 ──
     口径是"**改既有槽位的值**，不新开一族"（--f-h1/--f-h2/--f-body/--f-small/--f-tiny 五个名字本来就在），
     --f-l1 是本卡**新增的槽位**（状态带主值 / 卡片内主值）。行高与字阶一一配对（--lh-*，单位 px，
     取值照 design/frontend.md §4：11→15 / 12→16 / 13→20 / 15→22 / 20→25 / 24→30 = 1.25）。
     分片里不出现裸 font-size（只留 var(--f-*)）；12.5px 等九档散值按"整段正文 13 / 控件与密集列表 12"归并。 */
  --f-h1: 24px; --f-l1: 20px; --f-h2: 15px; --f-body: 13px; --f-small: 12px; --f-tiny: 11px;
  --lh-h1: 30px; --lh-l1: 25px; --lh-h2: 22px; --lh-body: 20px; --lh-small: 16px; --lh-tiny: 15px;
  --rail: 150px; --gap-col: var(--s2);   /* 模块改上下结构后 --rail 只剩历史槽位（不再参与 trunk 版式）；--gap-col 收进栅格 */

  /* 版心：原型 .wrap { max-width: 1240px; padding: 22px 20px 90px } → 1240 + 2×20 = 1280 */
  display: flex; flex-direction: column; gap: 0;
  max-width: 1280px; margin: 0 auto;
  padding: 8px 20px 72px;
  font-size: var(--f-body); line-height: 1.55; color: var(--pm-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.dsh-pm-detail[data-report-shell] [data-report-seg] { min-width: 0; }
/* 段间距照原型：结论头自带下边框、状态带自带上下留白与下边框、Tab 宿主只留一点上留白 */
.dsh-pm-detail[data-report-shell] [data-report-seg="band"] { padding: var(--s2) 0; border-bottom: .5px solid var(--pm-line); }
.dsh-pm-detail[data-report-shell] [data-report-seg="tabs"] { padding-top: var(--s2); }

/* ══════════════════════════════════════════════════════════════════════════
   ② 常驻头部（对应原型 .head / .head-top / .chip / h1.title / .verdict / .stages / .actions / .winbtn）
   ══════════════════════════════════════════════════════════════════════════ */

/* 头部整块 = 一张**卡片**（人裁定，2026-10-05）：「这个里（动作条 + 身份行 + 标题）原型是卡片」。
   ⚠️ 这条**推翻了本需求已确认的 FR-10 (三) 2**（原文：「底色只两档：白 + #f5f5f7（分组底）。
   **头部/操作条/评论不加底色**」），也**不是**原型 v2/v3 的现状（两边渲染都是平的）。以人的裁量为准。
   ⚠️ **为什么是灰底卡**：人对照原型后明确要「卡片**有背景**」——白底 + 发丝边在白页上几乎不可见。
   灰底（--pm-bg-soft，与状态带三格同一语汇）才有「层次」。灰底的两个连带修正放在本文件末尾
   的「头部灰卡连带修正」段（状态胶囊改白底保对比度、未开始阶段段改白底可见），
   因为并层原文在此之后、同特异性会盖掉这里的取值，而并层是契约原文、不去动它。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s2);
  padding: var(--s3) var(--s4);
  background: var(--pm-bg-soft); border: 0; border-radius: var(--r1);
}
/* 身份行（原型 .head-top）= **头部第二行**（FR-9 第 7 项 / D-8）：
   id · 状态芯片 · 分类 · 难度 · 「停留/更新」+ **靠左的窗口组** + 行尾「创建于 …」。
   「flex-basis: 100%」让它独占整行——动作行（「.dsh-pm-rh-bar」）排第一行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  flex-basis: 100%; min-width: 0; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-card-id {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
}
/* 状态胶囊 = **全页唯一的胶囊**（FR-10 (三) 1）：999px、11px/500、**无底色**，靠文字色区分状态。
   旧写法是"主色 12% 浅底 + 主色字 + 600"——满地胶囊与 12% 语义底的起因；底色与描边一并取消。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-status {
  font-size: var(--f-tiny); font-weight: 500; line-height: var(--lh-tiny);
  padding: 0; border: 0; border-radius: var(--pm-pill);
  background: none; color: var(--pm-accent-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"],
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { background: none; color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { background: none; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { background: none; color: var(--pm-teal-text); }
/* 分类 / 难度 / 阻塞理由 = **纯文本 + 「·」分隔**（FR-10 (三) 1：元信息全部去胶囊）。
   分隔符由第 ⑰ 节的 ::before 画（DOM 归属是 report-head.ts，本卡只出外观）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); padding: 0;
  border: 0; border-radius: 0; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta[data-blocked-reason] {
  border: 0; color: var(--pm-text2); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-flag {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); padding: 0; border-radius: 0;
  background: none; color: var(--pm-text2); border: 0;
}
/* 「停留 … · 距上次更新 …」在身份行里**不再右推**（FR-9 第 7 项 / D-8）：
   行尾的位置留给「创建于 …」，窗口组才有"靠左、在创建于左侧"可言——两者都在这一行里
   按顺序左起排，只有一个元素吃「margin-left: auto」（见下面「[data-created-at]」）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-updated {
  font-size: var(--f-small); color: var(--pm-text2);
  font-variant-numeric: tabular-nums;
}
/* 标题 = 原型 h1.title（21px / 660 / 1.32 / -0.2px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  flex-basis: 100%; margin: var(--s2) 0 0; font-size: var(--f-h1); font-weight: 600;
  line-height: var(--lh-h1); letter-spacing: -.4px; color: var(--pm-text);
}
/* 身份行的**行尾** = 「创建于 …」（FR-9 第 7 项 / D-8：窗口组靠左，创建时刻仍在行尾右侧）。
   DOM 归属是 report-head.ts（本卡只出外观）：「[data-created-at]」就是那一格。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] {
  margin-left: auto; font-size: var(--f-small);
}
/* 身份行里的窗口组：**靠左**（撤掉 D-4 时期"贴右缘"的「margin-left: auto」），
   并抹掉分组标签从旧操作条带来的上内边距（它现在与元信息同一条基线）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows { margin-left: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows > .dsh-pm-action-bar-label {
  padding-top: 0; font-size: var(--f-tiny);
}
/* 一句话结论 = 原型 .verdict（左侧 3px 主色条 + 13.5px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  flex-basis: 100%; margin-top: var(--s2); padding: 0 0 0 var(--s3);
  border: 0; border-left: 3px solid var(--pm-accent); border-radius: 0; background: none;
  font-size: var(--f-h2); font-weight: 400; line-height: var(--lh-h2); color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  flex-basis: 100%; font-size: var(--f-small); line-height: 1.5; color: var(--pm-text2);
}
/* 阶段条 = 原型 .stages / .stage：**进度条不是胶囊**（FR-10 (三) 1 点名）——4px 条形 + 8px 圆角
   （浏览器按半高收成 2px 端头）；done 绿 / cur 蓝，未开始段走分组底（白岛上看得见，且不多一种底色）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  flex-basis: 100%; display: flex; gap: var(--s1);
  margin: var(--s2) 0 0; padding: 0; max-width: 520px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot {
  width: 100%; height: 4px; border-radius: var(--r1); opacity: 1;
  /* 未开始阶段段：分组底（--pm-bg-soft）——不再是发丝线色，也不引入新的底色种类。 */
  background: var(--pm-bg-soft);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot {
  width: 100%; height: 4px; background: var(--pm-accent); box-shadow: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); color: var(--pm-text2); text-align: center; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label,
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot-label {
  color: var(--pm-text); font-weight: 600;
}
/* 三态的非颜色标记（FR-8 #1）：✓（完成）/ ▸（当前）/ 空（未开始）——**真实文本节点**
   （由 stage-detail.ts 输出，不是 ::before）。未开始那一档没有标记，这里只管它的字重一致。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-mark { font-weight: 600; }
/* 操作条（FR-10 (三) 7 + FR-9 第 1/6/7 项）：**头部第一行**——动作行独占整行、左对齐，
   不与身份行（第二行）同排。不再是灰底框，也不再带"上方一条分隔线"：它自己已经是最上面那一块，
   分隔线由头部自己的下边框承担（「box-shadow: none」的纪律见第 ⑰ 节）。
   层级仍是「← 看板」｜ 动作组 ｜ 「需人工确认」；按钮区自己承担换行，行尾标不参与它的换行计算。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  flex-basis: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  margin: 0; padding: 0; background: none; border: 0; border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar .dsh-pm-report-actions {
  flex: 0 1 auto; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  padding: 0; border: 0; background: none;
}
/* 按钮区：**弹性流**（FR-9 第 1/4 项：动作不拉伸、按序紧挨）。
   为什么不是等宽栅格（「repeat(auto-fit, minmax(150px, 1fr))」）：栅格把每个动作拉成"第 i/N 列"，
   N 一变位置就变——破坏性动作的落点随动作数量漂移，TC-20 直接判红。
   内容宽度的弹性流里，主操作左缘恒等于动作区左端、破坏性动作恒接在前一个动作之后。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid {
  flex: 0 1 auto; min-width: 0; display: flex; align-items: flex-start; flex-wrap: wrap;
  gap: var(--s1) var(--s3);
}
/* 破坏性动作：恒排**最后**（顺序由 report-head.ts 定），且与前一个动作留 ≥24px 明确空隙
   （FR-9 第 3 项 / D-7 修订：动作组整体靠左之后不再有"行尾"可言）。
   撤销的是 D-4 时期「[data-action-rank="danger"]{margin-left:auto}」的"推行尾"机制——
   那正是「取消立项」被推到窗口组右边、与身份行同排的原因（人 2026-10-05 指出的错排）。
   「:not(:first-child)」：FR-9 第 3 项说的是"**与前一个动作**留空隙"——当阶段里**只有**破坏性
   动作时它没有前一个动作，此时它必须与其它动作一样贴动作区左缘（"动作组左端恒等于卡片内容区左缘"，
   FR-9 第 4 项），不许凭空缩进 24px。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid > [data-action-rank="danger"]:not(:first-child) {
  margin-left: 24px;
}
/* 分组标签（「本阶段操作」/「窗口」/「最近评论 N 条」共用同一个 class）：
   操作条那一处已按 FR-11 #1 **真删**（DOM 层，不是 CSS 隐藏），这里留下的是**评论列表**与
   **窗口组**的用法——所以这条规则不许跟着删（删了评论列表的标签就没样式了）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-action-bar-label {
  font-size: var(--f-small); color: var(--pm-text2); padding-top: var(--s2); white-space: nowrap;
}
/* 每个动作 = 一格：**只有按钮**（说明不挨着按钮，常驻可见区没有后果文字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); min-width: 0; max-width: 100%;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { white-space: nowrap; }
/* 后果节点（FR-11 #2）：**保留 class 名**（断言与审计按它取节点），但退出可见流——
   文本 === 服务端「consequence」，由主操作的「aria-describedby」指向它。
   规则本身仍是"一行灰字"的旧口径（供将来任何可见用法），真正的隐藏由下面的 .dsh-pm-sr-only 施加。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-action-consequence {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden;
  max-width: 100%; font-size: var(--f-tiny); line-height: 1.4; color: var(--pm-text2);
}
/* 视觉隐藏但读屏可访问（FR-11 #2）：1px 裁切 + clip-path。
   为什么不是 display:none / visibility:hidden：那会把节点从可访问树里摘掉，读屏读不到后果，
   正是 FR-11 要防的 hover-only 反模式（触屏 / 键盘同样拿不到）。
   为什么绝对定位：它不占可见流，操作条整块高不因它变化（A6 的 ≤72px 与"按钮同一行"两条回归线）。
   注意：**不许**给它「display」之外的可见盒，也不许把 1px 盒改成其它尺寸（判据量的是它的可见性）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
/* 行尾统一标一次（11px 灰字，不是三个粉色实心块）：逐按钮重复会被读成"要点三次"。
   每格各自是否人工门写在 data-human-only="true" 上（机器可读）。
   「margin-top」已归零：它原先是"跟分组标签的下内边距对齐"的补偿，标签删了（FR-11 #1），
   现在靠操作行的「align-items: center」与按钮同一条中线。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-human-only {
  font-size: var(--f-tiny); font-weight: 400; padding: 0; border: 0; border-radius: 0;
  background: none; color: var(--pm-text2); white-space: nowrap; margin-top: 0;
}
/* 危险动作（取消这类）：红色 + 弱化（描边不实心），**排最后**（Pajamas · Destructive actions） */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { border-color: var(--pm-danger); color: var(--pm-danger); background: var(--pm-surface); }
/* 终态只读说明：跟「← 看板」同一行的居中项，不单独占一行（操作行的 align-items: center 负责基线）。
   旧分片 base.ts 给的是琥珀浅底 + 琥珀边线（多出第 3 种底色 / 第 3 种边线色）→ 收成纯文字。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate { font-size: var(--f-small); color: var(--pm-text2); background: none; border: 0; }
/* 窗口跳转 = 原型 .winbtn（等宽小胶囊） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-windows {
  display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--s2); padding: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window {
  font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover {
  border-color: var(--pm-accent); color: var(--pm-accent-text); background: var(--pm-surface);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: solid; color: var(--pm-text2); }
/* 按钮 = 原型 .abtn */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn {
  padding: var(--s1) var(--s3); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: var(--f-small); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:hover { border-color: var(--pm-accent); color: var(--pm-accent-text); background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary {
  background: var(--pm-accent); border-color: transparent; color: #fff;
}
/* 输入框（评论 / 回复 / 检索）：原型 .replybox input */
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: var(--f-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-input::placeholder { color: var(--pm-text2); }
/* 评论列表（头部最近几条）：紧凑流式块——列表在上、输入框在下（与"新的在下"同向） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments {
  flex-basis: 100%; display: flex; flex-direction: column; gap: 0; margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  font-size: var(--f-tiny); color: var(--pm-text2); margin-bottom: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment {
  display: flex; align-items: baseline; gap: var(--s2); min-width: 0;
  padding: 0; border: 0; border-bottom: .5px solid var(--pm-line); border-radius: 0;
  background: none;   /* 旧分片 base.ts 给 .dsh-pm-comment 铺过 rgba(128,128,128,.05)：评论不加底色（FR-10 #2），这里显式压掉 */
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment:last-child { border-bottom: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-meta { flex: none; font-size: var(--f-tiny); color: var(--pm-text2); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who { font-weight: 600; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who[data-actor="human"] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag { color: var(--pm-text2); font-weight: 500; }
/* 正文最多两行（全文在 title 属性里，一字不丢；再长的那类是机器转储，已在渲染层收纳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body {
  flex: 1 1 auto; min-width: 0;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  font-size: var(--f-small); line-height: 1.35; color: var(--pm-text); word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form {
  flex-basis: 100%; display: flex; gap: var(--s2); margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-input { flex: 1 1 auto; min-width: 0; padding: var(--s1) var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-btn { padding: var(--s1) var(--s2); }

/* ══════════════════════════════════════════════════════════════════════════
   ③ 状态带三格（对应原型 .band / .band-i / .band-h / .band-b / .gap-line / .dot）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] {
  /* FR-2（REQ-261006130057-7a43 t5）：三格不再等大平权——1fr : 1.5fr : 0.9fr
     （做到哪了 / **缺口**（焦点，最宽）/ 结果与成效（占位态折叠，最窄））；
     配套焦点/折叠样式见本节后部「── FR-2 状态带权重 ──」标记块。 */
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, .9fr); gap: var(--s3);
  padding: 0; margin: 0;
}
/* 每格 = **分组底卡**（FR-10 (三) 2：分组底只用于状态带）。
   左侧 3px 语义色条（蓝实心 / 红 / 绿）与 1px 边线**整批取消**（FR-10 (二) 的取消清单第一项就是"蓝实心"）：
   语义改由格内**文字**承担（FR-8），三格靠 --pm-bg-soft 分组底 + 8px 圆角分层。
   原来是"三张带彩条的边线卡 + 「无缺口」再靠 :has 把色条转绿"——那 4 条规则随之作废，不留在片里假装还有效。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  display: block; margin: 0; padding: var(--s2) var(--s3);
  border: 0; border-radius: var(--r1); background: var(--pm-bg-soft); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label {
  font-size: var(--f-tiny); font-weight: 400; text-transform: none;
  color: var(--pm-text2); margin-bottom: var(--s5);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body {
  /* FR-12 H4 裁定（2026-10-05）：卡内三格必须**两两差 ≥2px**——标签 11 与细节 12 只差 1px，
     故细节档由 --f-small(12) 提到 --f-body(13)，三格成为 {11, 13, 20} → 差 2 / 9 / 7 全 ≥2。 */
  font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text); word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-band-ok { color: var(--pm-ok-text); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-band-mut { color: var(--pm-text2); }
/* 缺口逐条：**一条一行**（项名 + 状态），超出省略号收尾；全文（what ｜ why ｜ 出处）在 title。
   2026-10-05 人类验收：原来把验收标准原文 + 意见整段塞进小格再截断，读出来是"半句 + …"；
   常驻状态带只答"哪几条、多严重"，逐项原文在条款所在的文档 / 门禁（截断必须给出路）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line {
  display: flex; align-items: baseline; gap: var(--s2); min-width: 0;
  margin: 0; padding: 0; border: 0; border-radius: 0; background: none;
  font-size: var(--f-small); line-height: var(--lh-small);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 严重度的两条非颜色通道（FR-8 #2）：
   ① SVG 圆（装饰性，aria-hidden）——尺寸只走 --pm-icon-sm 一档，颜色跟随本行的 color；
   ② **真实文本**标记（!! / ! / ·）——等宽、不换行、与正文有半个字的间隙。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-sev { display: inline-flex; vertical-align: -1px; margin-right: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-sev > svg { width: var(--pm-icon-sm, 12px); height: var(--pm-icon-sm, 12px); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-mark {
  font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 600; margin-right: var(--s1);
}
/* 严重度的**颜色**通道（FR-8 #2）：只给标记（圆 + !! / ! / ·）上色，**不给正文上色**——
   正文染色会把"哪条更严重"变成整行的红色噪音，而层级纪律要求正文只有三档灰（FR-12 D）。
   三色全部按 WCAG 非文本 3:1 核过（danger 5.38 / warn 5.28 / text2 5.07，见对比度报表）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-sev,
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-mark { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="yellow"] .dsh-pm-gap-sev,
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="yellow"] .dsh-pm-gap-mark { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="gray"] .dsh-pm-gap-sev,
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="gray"] .dsh-pm-gap-mark { color: var(--pm-text2); }
/* 出处芯片（如 FR-2 / 门禁号）：等宽小灰底，**不换行**（它是这一行的锚点） */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-ref {
  flex: none; font-family: var(--pm-mono); font-size: var(--f-tiny); padding: 0; border-radius: 0;
  background: none; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-more { font-size: var(--f-tiny); color: var(--pm-text2); margin-top: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict { font-size: var(--f-small); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="rework"] { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pending"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-counts { font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover-title { display: block; margin-top: var(--s1); font-weight: 600; }
/* 遗留逐条：同上**一条一行**（项名 · 状态）；标准原文与意见在 title，逐项正文在『文档』Tab 的验收单 */
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); margin: var(--s1) 0; padding: 0 0 0 var(--s2);
  border-left: .5px solid var(--pm-line-strong); border-radius: 0; background: none;
  color: var(--pm-text2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── FR-2 状态带权重（REQ-261006130057-7a43 t5）──
   蓝本 = 原型 prototypes/detail.html v1.5「#FR-2」区块（.band / .band-cell.focus / .gap-count /
   .band-outcome 折叠）。三件事：
   ① 缺口格 = 视觉焦点：红浅底（--pm-danger-tint，12% --pm-danger 压白——FR-10「底色只两档」
      的唯一新增例外，由本需求 FR-2 显式引入；与设计「12% tint」口径同值）+ 左 3px 红条
      （inset box-shadow，不吃盒宽、不挤动相邻格）+ 标签转红色；
   ② 红色计数徽标（值 = waitingHuman，与 verdictLine 同口径）：红底白字胶囊，
      数字本身是真文本节点（FR-8：不靠颜色单一表达）；
   ③ 结果格折叠：原生 details/summary，一行灰字 + 「展开说明」（JS 缺席也开合正常）；
      开/合两态文案都是真文本，CSS 按 [open] 换显（不是 ::before，读屏读得到）。
   令牌纪律：规则里只引 --pm-*；--pm-danger-tint 定义在本块内（新增令牌随引入它的规则走）。 */
/* 复核 P1-1 修复：#fae0e3 → #fdf2f3——tint 上三档真文字对比度全过 4.5:1
   （danger 4.92 / warn 4.82 / text2 4.63，WCAG 相对亮度实测），浅红观感不变。 */
.dsh-pm-detail[data-report-shell] { --pm-danger-tint: #fdf2f3; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="gaps"][data-gap-focus="1"] {
  background: var(--pm-danger-tint); box-shadow: inset 3px 0 0 var(--pm-danger);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-gap-focus="1"] .dsh-pm-stat-label { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 var(--s1); border-radius: var(--pm-pill);
  background: var(--pm-danger); color: #fff;
  font-size: var(--f-tiny); font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums;
  vertical-align: 1px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-fold > summary.dsh-pm-outcome-fold-line {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
  cursor: pointer; list-style: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-fold > summary.dsh-pm-outcome-fold-line::-webkit-details-marker {
  display: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-toggle { flex: none; color: var(--pm-accent-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-toggle-close { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-fold[open] .dsh-pm-outcome-toggle-open { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-fold[open] .dsh-pm-outcome-toggle-close { display: inline; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-fold-body { margin-top: var(--s1); font-size: var(--f-small); line-height: var(--lh-small); }
/* 窄档（沿用本片 ≤1000px 断点，900 档命中）：三格退为单列，缺口格排第一。
   「order」只改**视觉序**，DOM 序不变（读屏/键盘顺序仍是 做到哪了→缺口→结果）。 */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] { grid-template-columns: minmax(0, 1fr); }
  .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="gaps"] { order: -1; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ④ Tab 栏（对应原型 .tabs / .tab / .tab.active / .tab .cnt）
   ——文字页签 + 选中下划线 + 计数角标；**不是**胶囊芯片
   ══════════════════════════════════════════════════════════════════════════ */

/* Tab 栏 = 苹果**分段控件**（Segmented Control）——设计契约 v2 改造层 ⑦，2026-10-05 补落地。
   为什么现在才补：这条在本需求实施期被整段漏掉，而原型 v3 又被"重新内联成实现的渲染"，
   于是**偏移被固化进了原型**，判据从此照不出它（人眼一眼就看出来了：Tab 应该是一整条灰轨道）。 */
/* #f5f5f7 轨道 + 白色圆角滑块（选中），**没有下划线、没有描边、没有新颜色**。
   轨道是**容器不是信息**：它的可识别性由标签文字承担（与 FR-4 登记的装饰豁免同口径）。
   选中态靠"白滑块 + 500 字重 + 正文字色"三重表达，不是只靠颜色。
   ⚠️ 轨道**铺满整行**（display: flex + 六格 flex: 1 1 0 等宽平分），不是收缩到内容宽度：
   设计层原话是 inline-flex（收缩），2026-10-05 人对照原型后裁定「应该**满行**的」，
   以人的裁定为准；本条已登记进 scripts/req-detail-design-conformance.mts 的按属性白名单。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  margin: 0 0 var(--s3); padding: 2px;
  background: var(--pm-bg-soft); border: 0; border-radius: var(--r1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  /* 六格等宽平分整行：flex-basis: 0 + justify-content: center（内容居中，格子等宽）。
     为什么不是 flex: 1 1 auto：那样每格 = 自身内容宽 + 均分余量，长标签的格子会更宽，
     整排看起来仍是"参差"的；等宽才是分段控件的规矩（候选版 V-C 的描述就是「六格等宽」）。 */
  flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; gap: var(--s1);
  margin: 0; padding: 6px 12px; border: 0; border-radius: var(--r1); background: none;
  color: var(--pm-text); font-size: var(--f-body); line-height: var(--lh-body); font-weight: 400;
  cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab:hover { background: none; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  background: var(--pm-surface); color: var(--pm-text); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--f-body); line-height: 1;
}
/* 结构图标尺寸**只走令牌**（FR-1 #2）：SVG 字符串里没有 width/height，尺寸在这里施加——
   14px 是两档中的 Tab 档；颜色由 currentColor 跟随 .dsh-pm-tab 的文字色（选中态自动跟色）。
   ⚠️ **兜底值 14px 不是装饰**：这条规则曾经因为 --pm-icon 令牌**没被定义**而整条失效
   （width: var(--pm-icon) 解析不出 → SVG 拿到 0×0 → **六个 Tab 图标全部不可见**，
   而字符串断言与「Tab 有 6 个」的判据都照过）。加了兜底之后，令牌缺失也只会是尺寸不对，
   不会变成"图标消失"；探针 A13 另有 Tab 图标 6 个 / 14px 的硬断言守着。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon > svg {
  width: var(--pm-icon, 14px); height: var(--pm-icon, 14px);
}
/* Tab 计数 = **纯数字、无底、无胶囊**（FR-10 (三) 1）。色取二级灰（--pm-text2 5.07:1）而**不是**
   三级灰：三级灰在白底只有 3.62:1，而计数是真文字（本层唯一一处对 FR-10 措辞的偏离，已登记）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] {
  display: inline-flex; align-items: center; margin-left: var(--s1); padding: 0;
  border-radius: 0; background: none; color: var(--pm-text2);
  font-size: var(--f-small); font-weight: 400; font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] {
  background: none; color: var(--pm-text2);
}
/* 面板段：顶到 Tab 栏下沿，不再叠一层内边距 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-panel[data-tab-host] { padding: 0; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ 公共件：面板小标题 / 提示行 / 芯片 / 空态
   （原型 .panel h4 · .mut · .src · .evidence · .note · .dchip）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-block-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: 0 0 var(--s2); padding: 0; border: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-block { display: block; margin: 0 0 var(--pm-space-module); padding: 0; border: 0; background: none; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-title { font-size: var(--f-h2); font-weight: 600; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary { font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-note { font-size: var(--f-small); color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-path { font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); background: none; padding: 0; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-hint { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-muted { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-note { font-size: var(--f-small); line-height: 1.55; color: var(--pm-text2); margin-top: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-empty { font-size: var(--f-small); color: var(--pm-text2); padding: 0; }
.dsh-pm-detail[data-report-shell] code {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); word-break: break-all;
}
/* ── 行内 Markdown 的显示层（render/md-inline.ts 产出的标签）──────────────────────────
   正文是**文档原文**，标记在渲染层被剥掉/换标签（「**x**」→「<b>」、反引号里的 x→「<code>」、
   行首 「#」/「>」/「- 」→标题/引文/列表）。产物一律是内联级元素（「<span>」），
   块级形态靠这里的 「display」 决定——因为同一段 HTML 会落进 「<p>」 / 「<td>」 / 「<div>」 三种父节点。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h { display: block; font-weight: 600; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote {
  display: block; padding-left: var(--s2); border-left: 3px solid var(--pm-line); color: var(--pm-text2);
}
/* 无序列表：「- 」 换成 「•」（伪元素出字形），悬挂缩进让折行对齐正文而不是回到标记下方 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li {
  display: block; padding-left: var(--s4); text-indent: calc(-1 * var(--s4));
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li::before {
  content: '\\2022'; color: var(--pm-text3); margin-right: var(--s2);
}
/* 有序列表：序号照原文（1. / 2.），只挪到悬挂位——**不改字** */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli { display: block; padding-left: var(--s4); text-indent: calc(-1 * var(--s4)); }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-num { color: var(--pm-text2); font-variant-numeric: tabular-nums; }
/* 文档里的表格行（「| 列 | 列 |」）：剥掉管道符，改成带细竖分线的横向栅格 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-row {
  display: flex; flex-wrap: wrap; align-items: baseline; padding: 0;
  border-bottom: .5px solid var(--pm-line);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell { min-width: 0; padding-right: var(--s3); overflow-wrap: anywhere; }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell + .dsh-pm-md-cell {
  padding-left: var(--s3); border-left: .5px solid var(--pm-line);
}
/* 行内 code：等宽 + 极浅底（正文里的 「x」 不再是两个反引号） */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell code,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line code,
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary code,
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff code,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list code,
.dsh-pm-detail[data-report-shell] .dsh-pm-callout code {
  font-size: var(--f-tiny); padding: 0 var(--s1); border-radius: 0; background: none;
  color: var(--pm-text); word-break: break-word;
}
/* 来源标 = 原型 .src[data-k]（文档蓝 / 台账紫 / 自动绿 / 人写橙 / 无灰） */
.dsh-pm-detail[data-report-shell] .dsh-pm-src,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); padding: 0; border: 0; border-radius: 0;
  background: none; color: var(--pm-text2); white-space: nowrap;
}
/* 来源标（文档 / 台账 / 自动汇总 / 人工留痕 / 无）：**统一一档灰字**——蓝 / 紫 / 琥珀三种语义前景色取消
   （FR-10 (二)，紫 --pm-agent 也在取消清单里）；来源由文字本身与 title 区分，不靠色。
   这几条原来各带 12% 浅底、特异性是 (0,4,0)，所以覆盖也必须带同一个属性选择器（否则"写了没生效"）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source],
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source] { background: none; color: var(--pm-text2); }
/* 证据指针 = 原型 .evidence（细边胶囊，等宽） */
.dsh-pm-detail[data-report-shell] .dsh-pm-evidence {
  display: inline-block; font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-accent-text); word-break: break-all;
}
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence { display: flex; flex-direction: column; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence li {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
  background: none; border-radius: 0; padding: 0; word-break: break-all;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-evidence-missing { font-size: var(--f-small); font-weight: 600; color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review { font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pending"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-flag.verify-pending { background: none; color: var(--pm-text2); }
/* 表格 = 原型 table.t（th 11px 灰底 / td 12px / 8px 12px / 细横线） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table {
  width: 100%; border-collapse: collapse; font-size: var(--f-small); table-layout: fixed;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th {
  text-align: left; font-size: var(--f-tiny); font-weight: 600; color: var(--pm-text2);
  background: none; padding: var(--s2) var(--s3);
  border-bottom: .5px solid var(--pm-line); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td {
  padding: var(--s2) var(--s3); border-bottom: .5px solid var(--pm-line);
  vertical-align: top; text-align: left; font-size: var(--f-small); line-height: 1.55;
  word-break: break-word; overflow-wrap: anywhere;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td:first-child { white-space: nowrap; }
/* 列宽：把余量留给长文本列（路径 / 意见 / 证据）——固定布局下不给宽就会被平均分掉 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(1) { width: 84px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(3) { width: 110px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(4) { width: 190px; }
/* 核验表（7 列）**逐列给宽**（2026-10-05 全 Tab 扫出的变形）：真数据里「标准 / 实际结果 /
   证据 / 意见」都是整段人话或长路径，而「来源 / 需人工 / 裁决」只放短词。旧口径把标准压到 52px、
   证据压到 72px，其余两列吃满余量——结果证据列**一个字符一行**，整张表被撑成九万像素的墙。
   另：第一列原本吃「td:first-child { white-space: nowrap }」，52px 装不下就横着糊到邻列上
   （文字互相重叠），这里放开换行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:first-child { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(1) { width: 19%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(2) { width: 12%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(3) { width: 8%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(4) { width: 8%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(5) { width: 30%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(6) { width: 17%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(7) { width: 6%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(1) { width: 108px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(2) { width: 96px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(3) { width: 96px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(4) { width: 100px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(5) { width: 110px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th:first-child { width: 16%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table tbody tr:hover { background: none; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ 汇报 Tab（trunk）：原型 .row / .rail / .body-col / .sum
   ——七条 = **上下结构**（标题行 → 正文 → 可选引用行），模块之间 36px、模块内 8px（FR-12 B/C）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-docmeta {
  font-size: var(--f-small); color: var(--pm-text2); padding: 0 0 var(--s2);
}
/* 一条 = **一个模块**，改上下结构（FR-12 C）：① 标题行（L2 标题 + 右侧来源标）② 正文（L3）③ 可选引用行（L4 + 主色「点开看原文 →」）。
   原型旧写法是"左 --rail 标题栏 + 右内容栏"的 grid，读起来像表格（D-7 的核心反馈就是"每个模块不够有层次"）。
   边界信号**两个同时在**（FR-12 C 末条）：模块之间 36px（--pm-space-module，FR-7 #3 闭集的唯一具名例外）
   + 标题行本身；不再只靠一条 hairline 分隔。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item {
  display: block;
  margin: 0 0 var(--pm-space-module); padding: 0; border: 0;
  border-radius: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item:first-of-type { border-top: 0; }
/* 标题行（模块的上边界）：L2 标题在左、L5 副标题与来源标靠右；下距 8px 就是"模块内间距"（H2 的分母）。
   「.dsh-pm-trunk-sub」 的 margin-left: auto 把元信息推到行尾——标题行一眼分得出"这是新模块"。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head {
  display: flex; flex-wrap: wrap; align-items: baseline;
  gap: var(--s1) var(--s2); margin: 0 0 var(--s2); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-title { flex-basis: auto; margin: 0; font-size: var(--f-h2); font-weight: 600; line-height: var(--lh-h2); letter-spacing: -.1px; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-sub { flex-basis: auto; margin-left: auto; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2); }
/* 来源标紧贴副标题（原型 .rail .src 就在副标题下面一行），不参与行间拉伸 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head .dsh-pm-trunk-src { margin-top: var(--s1); }
/* 正文栏：行距放宽到 1.68（原型 .sum 是 13px，靠行距分层而不是靠 margin 撑高） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-body {
  display: flex; flex-direction: column; gap: var(--s1); min-width: 0;
  font-size: var(--f-body); line-height: var(--lh-body);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line { margin: 0; font-size: var(--f-body); line-height: var(--lh-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-mut { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing {
  font-size: var(--f-small); color: var(--pm-text2); background: none;
  border: .5px solid var(--pm-line); border-radius: var(--r1); padding: var(--s1) var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-scope-hint { font-size: var(--f-small); font-weight: 600; color: var(--pm-text2); }
/* 「点开原文」= **句尾一个小链接**（原型 .expand：accent / 12px / 无边框无底色 / hover 下划线）。
   此前渲成整行胶囊，被读成输入框（2026-10-05 验收指出的变形②）。出处（哪份文档哪一节）
   收成左侧一行灰字，完整路径在 title 里。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-openrefs {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); margin-top: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s2); max-width: 100%;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref-hint { font-size: var(--f-small); color: var(--pm-text2); word-break: break-word; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open {
  font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; border-radius: 0; background: none; color: var(--pm-accent-text); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open:hover { background: none; text-decoration: underline; }
/* 没有原文文件可开的入口（指向台账 / 留痕）：**不可点**的一行灰字说明，不画按钮 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open.is-nopath {
  color: var(--pm-text2); cursor: default; background: none; white-space: normal; text-align: left;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open.is-nopath:hover { text-decoration: none; }
/* 亮点分组（原型 .hl-group / .hl-h / .fact / .fact-i / .hl / .hl-d / .hl-w / .hl-e） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-h { font-size: var(--f-small); font-weight: 400; color: var(--pm-text2); }
/* a) 自动事实：两列栅格的小盒子（原型 .fact） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] > .dsh-pm-trunk-hl-h { grid-column: 1 / -1; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] > .dsh-pm-trunk-mut { grid-column: 1 / -1; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact {
  display: block; padding: var(--s2) var(--s3); border: .5px solid var(--pm-line);
  border-radius: var(--r1); font-size: var(--f-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-label { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-value { display: block; font-size: var(--f-h2); font-weight: 600; font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-evid { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s1); }
/* b) 人写差异：实线细边小卡（原型 .hl） */
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-list { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl {
  display: block; padding: var(--s2) var(--s3); margin: 0;
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-diff { font-size: var(--f-body); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-why { font-size: var(--f-small); color: var(--pm-text2); margin-top: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-evid {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s2);
  font-size: var(--f-small);
}
/* 反例：无证据的差异 = 虚线红边弱化（与可核验的那堆一眼可分，FR-15） */
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-missing {
  display: block; padding: var(--s2) var(--s3); margin: 0 0 var(--s2);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-missing .dsh-pm-hl-why { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-unpay { padding: 0; border: 0; background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach { display: flex; align-items: center; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-path { font-family: var(--pm-mono); font-size: var(--f-small); color: var(--pm-text2); word-break: break-all; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ 文档 Tab（docs）：面板小标题 + table.t + 清单 / 生成物 / 其它发现 / 核验 / 门禁 / 归档
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-docs { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs > .dsh-pm-block:first-child > .dsh-pm-block-head { margin-top: 0; }
/* 文档路径 = 原型 .evidence 那种可点的小胶囊 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path {
  font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny); text-align: left; cursor: pointer;
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-accent-text); text-decoration: none; word-break: break-all;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path:hover { background: var(--pm-surface); text-decoration: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path.dsh-pm-doc-missing {
  border-style: solid; background: none; color: var(--pm-text2); cursor: default;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-state { font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict {
  font-size: var(--f-tiny); font-weight: 600; padding: 0; border-radius: 0;
  background: none; color: var(--pm-text2);
}
/* 裁决三态：色只落在**文字**上（结论词 / 错误文字），不再各配一块 12% 浅底（FR-10 (二)）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="passed"] { background: none; color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="failed"] { background: none; color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="pending"] { background: none; color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list { display: flex; flex-direction: column; gap: var(--s1); margin: 0; padding: 0; list-style: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list li { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--f-small); line-height: var(--lh-small); flex-wrap: wrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-label { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-kind { font-size: var(--f-tiny); padding: 0; border-radius: 0; background: none; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-group { display: flex; flex-direction: column; gap: var(--s1); margin: var(--s2) 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-generated { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2); }
/* 其它发现：一行一类（类型徽标 + 计数 + 样例） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-group {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s2);
  padding: var(--s1) 0; border: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-size: var(--f-small); font-weight: 600; color: var(--pm-text); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-rest { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-discovered-sample] { font-size: var(--f-small); }
/* 原型单列（REQ-261005105032-3b02 决议 #30/#32）：只 3 条规则、只复用既有令牌——
   徽标与既有 kind 徽标同款（第 1 条与上面 .dsh-pm-doc-kind 同值：原型是"同类交付物"，
   不该长得像另一套东西）；计数用 --f-small/--pm-text2 不抢主信息；被取代的整行
   用 --pm-text3 弱化，免得把作废版读成权威（属性值来自 prototypeRole）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-row[data-doc-group="prototype"] .dsh-pm-doc-kind {
  background: none; border-radius: 0; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-proto-count {
  font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-row[data-proto-role="superseded"] { color: var(--pm-text2); }
/* 归档对账 / 清单豁免：逐条铺开的小字行 */
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile { font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile[data-reconcile="none"] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-unlisted { list-style: none; margin: var(--s1) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-unlisted li { font-size: var(--f-small); color: var(--pm-text2); word-break: break-all; }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-noack { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-ack { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-source,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-human,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-verdict { white-space: normal; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑧ 对话 Tab（dialogue）
   ══════════════════════════════════════════════════════════════════════════ */

/* ── FR-6 对话聊天气泡（REQ-261006130057-7a43 t7）──
   蓝本 = 原型 detail.html v1.5「#FR-6」（D-5 气泡 / D-6 只读 / D-7 吸顶分页条）：
   「人」靠右蓝实心（白字）+ 右圆形头像「人」；窗口/agent 靠左浅紫 + 左头像（w/a）；
   系统事件居中灰丸不占气泡；长日志折叠一行 + 「长日志已收纳」琥珀标 + 「展开」；
   吸顶分页条 = .dsh-pm-chat-scroll 内部第一个子元素 sticky top:0；底部只读说明行。
   令牌纪律：规则体只引 --pm-* 令牌；本块自有的色值先成本块局部令牌（色值只从
   --pm-accent / --pm-surface / --pm-bg-soft 推导，浅紫基调是本块新增的唯一裸色值）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue {
  display: block; min-width: 0;
  /* 浅紫基调（原型 --violet 一档）：agent 气泡底 / 描边 / 头像都由它 color-mix 推导 */
  --pm-chat-violet: #7c3aed;
  --pm-chat-agent-bg: color-mix(in srgb, var(--pm-chat-violet) 10%, var(--pm-surface));
  --pm-chat-agent-line: color-mix(in srgb, var(--pm-chat-violet) 22%, var(--pm-surface));
  /* 吸顶分页条浅蓝底（原型 --primary-weak 一档）：与 --pm-tab-active-bg 同一推导法 */
  --pm-chat-pager-bg: color-mix(in srgb, var(--pm-accent) 10%, var(--pm-surface));
  --pm-chat-pager-line: color-mix(in srgb, var(--pm-accent) 25%, var(--pm-surface));
  --pm-chat-avatar-size: 26px;
  --pm-chat-bubble-fs: 12.5px;
  --pm-chat-time-fs: 10.5px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-note { font-size: var(--f-small); color: var(--pm-warn-text); margin-bottom: var(--s2); }
/* 正序消息流：旧在上新在下，固定高 460px 内滚动（「无内层滚动」铁律的唯一豁免）；
   顶部 padding 取 0：吸顶分页条直接顶住滚动口上沿，消息不会在条的上方透出 */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-scroll {
  height: 460px; overflow-y: auto; padding: 0 var(--s1) var(--s3) 2px;
  display: flex; flex-direction: column; gap: var(--s2); min-width: 0;
}
/* 吸顶醒目分页条（D-7）：不透明浅蓝底 + 圆角 + 发丝边框 + 轻投影，滚动时消息从它下面滑过 */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-pager {
  position: sticky; top: 0; z-index: 3; align-self: stretch;
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  padding: var(--s2) var(--s3);
  background: var(--pm-chat-pager-bg); border: var(--pm-hair) solid var(--pm-chat-pager-line);
  border-radius: var(--r1); box-shadow: 0 1px 3px rgba(15, 23, 42, .10);
  font-size: var(--f-small); color: var(--pm-text2);
}
/* 「↑ 加载更早消息」实心主色小按钮（降级/到底时禁用但留在原地：按钮的有无不随数据变化） */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier {
  background: var(--pm-accent); border-color: transparent; color: #fff;
  padding: var(--s1) var(--s2); min-height: var(--pm-target);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier:hover:not([disabled]) { background: var(--pm-accent-hover); }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier[disabled] { opacity: .55; cursor: default; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-pg { display: inline-flex; align-items: baseline; gap: var(--s2); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-page { font-family: var(--pm-mono); font-size: var(--f-small); font-weight: 700; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-loaded { font-size: var(--f-tiny); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-note { margin-left: auto; font-size: var(--f-tiny); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
/* 一条气泡消息：头像 +（名字签行 + 气泡）；右列（人）整行右对齐、头像在右 */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg {
  margin: 0; padding: 0; min-width: 0; border: 0; background: none;
  font-size: var(--f-body); line-height: var(--lh-body);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg { display: flex; gap: var(--s2); align-items: flex-start; max-width: 76%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right { align-self: flex-end; flex-direction: row-reverse; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--left { align-self: flex-start; }
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar {
  flex: none; width: var(--pm-chat-avatar-size); height: var(--pm-chat-avatar-size);
  border-radius: var(--pm-pill); display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: var(--f-small); font-weight: 700; line-height: 1;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar--human { background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar--agent { background: var(--pm-chat-violet); }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg-col { min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg-meta { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--f-tiny); margin: 0 2px 3px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right .dsh-pm-cmsg-meta { justify-content: flex-end; }
.dsh-pm-detail[data-report-shell] .dsh-pm-who { font-weight: 600; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-time {
  font-family: var(--pm-mono); font-size: var(--pm-chat-time-fs);
  color: var(--pm-text2); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble {
  border-radius: var(--r1); padding: 7px var(--s3);
  font-size: var(--pm-chat-bubble-fs); line-height: 1.55; word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right .dsh-pm-bubble { border-top-right-radius: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--left .dsh-pm-bubble { border-top-left-radius: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--human { background: var(--pm-accent); color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--agent {
  background: var(--pm-chat-agent-bg); color: var(--pm-text);
  border: var(--pm-hair) solid var(--pm-chat-agent-line);
}
/* 琥珀小旗（「长日志已收纳」/「回填」同族）：描边取 currentColor，不新增色值 */
.dsh-pm-detail[data-report-shell] .dsh-pm-b-flag {
  display: inline-block; font-size: var(--f-tiny); color: var(--pm-warn-text);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px; margin-right: 6px;
}
/* 长日志气泡：默认折叠成一行（details 合上），「展开」就地放开（details 打开显示完整气泡） */
.dsh-pm-detail[data-report-shell] .dsh-pm-long-head { list-style: none; cursor: pointer; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-head::-webkit-details-marker { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--long { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long[open] .dsh-pm-bubble--long { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-toggle { display: inline-block; font-size: var(--f-tiny); color: var(--pm-accent-text); padding: 3px 2px 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-toggle:hover { text-decoration: underline; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long:not([open]) .dsh-pm-long-close,
.dsh-pm-detail[data-report-shell] .dsh-pm-long[open] .dsh-pm-long-open { display: none; }
/* 系统消息：居中灰色小丸（不占气泡），回填标琥珀 */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--system {
  align-self: center; text-align: center; font-size: var(--f-tiny); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-system-pill {
  display: inline-flex; align-items: baseline; justify-content: center; gap: var(--s2); flex-wrap: wrap;
  background: var(--pm-bg-soft); border: var(--pm-hair) solid var(--pm-line);
  border-radius: var(--pm-pill); padding: 1px 10px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-system-text { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred { color: var(--pm-warn-text); font-size: var(--f-tiny); }
/* 只读说明行（D-6：对话是历史聊天记录，无发送入口、无检索框） */
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-ro {
  margin-top: var(--s3); padding-top: var(--s2); border-top: var(--pm-hair) solid var(--pm-line);
  text-align: center; font-size: var(--f-tiny); color: var(--pm-text2);
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑨ Token Tab：原型 .panel h4 / table.t / .opt / .opt-i
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h,
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: var(--s4) 0 var(--s2); font-size: var(--f-h2); font-weight: 600; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel > .dsh-pm-tok-h:first-of-type,
.dsh-pm-detail[data-report-shell] .dsh-pm-prompts > .dsh-pm-pp-sec:first-child > .dsh-pm-pp-h:first-child { margin-top: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h-note,
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h-note { font-size: var(--f-small); font-weight: 400; color: var(--pm-text2); }
/* 口径说明 / 三态徽标：收成原型那种克制的注释块（不再用大块黄色告警） */
.dsh-pm-detail[data-report-shell] .dsh-pm-callout,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-avail {
  font-size: var(--f-small); line-height: 1.6; padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: none; color: var(--pm-text2);
}
/* 三态徽标（可用 / 部分可用 / 不可用）：色只落在文字上，不再换边线与浅底。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-avail { border-color: var(--pm-line); background: none; color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-callout[data-availability-badge="partial"] { border-color: var(--pm-line); background: none; color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-callout[data-availability-badge="none"] { border-color: var(--pm-line); background: none; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td { font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-node { cursor: default; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-more { font-size: var(--f-tiny); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub { background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub td { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-num { float: right; color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-nosnap { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-total td { font-weight: 600; color: var(--pm-text); background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-bar {
  display: inline-block; width: 72px; height: 6px; border-radius: var(--r1);
  background: var(--pm-line); vertical-align: middle;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-bar > i { display: block; height: 6px; border-radius: var(--r1); background: var(--pm-accent); }
/* 可优化点 = 原型 .opt-i（左侧 3px 橙条的小卡，每条都带依据数字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-list { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt {
  display: block; padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line);
  border-radius: var(--r1); background: none; font-size: var(--f-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-title { display: block; font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-basis { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-sug { font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sum {
  display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4);
  font-size: var(--f-small); color: var(--pm-text2); margin-bottom: var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-sum b { color: var(--pm-text); font-variant-numeric: tabular-nums; }
/* 折叠块（注入成本）：原型 details 的克制长相——细边 + 小标题行 */
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold {
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
  /* 折叠条是**面状控件**（焦点环画在条内，FR-2 #5），但旧分片的 「.dsh-pm-fold」 带 「overflow: hidden」，
     会把环外的苹果式 halo（box-shadow 3px）在上 / 左 / 右三边切掉。原型这份折叠块本来就没有 overflow
     （「detail-ui-v3.html」 的 「details.dsh-pm-fold」 只给边框 / 圆角 / 底色），这里补回可见：
     块内没有需要裁的东西（「.dsh-pm-fold-body」 只有一条上边框，hover 底色是 transparent）。 */
  overflow: visible;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary {
  display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s3);
  font-size: var(--f-small); font-weight: 600; color: var(--pm-text2); background: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary:hover { background: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-body { padding: var(--s2) var(--s3); border-top: .5px solid var(--pm-line); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { font-size: var(--f-small); font-weight: 400; color: var(--pm-text2); margin-left: auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-row { display: flex; align-items: center; gap: var(--s2); font-size: var(--f-small); margin: var(--s1) 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-name { width: 130px; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-bar { flex: 1; height: 6px; border-radius: var(--r1); background: var(--pm-line); overflow: hidden; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-bar > i { display: block; height: 6px; background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-val { width: 80px; text-align: right; color: var(--pm-text2); font-variant-numeric: tabular-nums; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑩ 提示词 Tab（prompts）：原型 .frag / pre.prompt-text / .spec-vs / .sv-col / .ctx-line
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-prompts { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-sec { display: block; padding: 0; border: 0; background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt,
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt {
  margin: 0 0 var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: none; overflow: visible;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary {
  display: flex; align-items: center; gap: var(--s2); padding: var(--s2) var(--s3);
  font-size: var(--f-small); color: var(--pm-text2); background: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary:hover { background: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::-webkit-details-marker { display: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::before {
  content: '\\25B8'; color: var(--pm-text3); font-size: var(--f-tiny); transform: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[open] > summary::before { content: '\\25BE'; transform: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-name { font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 400; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-meta { margin-left: auto; font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
/* 被裁片段 = 原型 .frag.trimmed（虚线橙） */
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[data-prompt-trimmed] {
  border-style: solid; border-color: var(--pm-line); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-pre { display: block; width: auto; margin: var(--s2) var(--s3) var(--s3); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > .dsh-pm-prompt-pre,
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt .dsh-pm-prompt-pre { border-radius: var(--r1); }
/* 规定 vs 实际 = 原型 .spec-vs / .sv-col / .sv-h */
.dsh-pm-detail[data-report-shell] .dsh-pm-specvs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-col {
  display: block; min-width: 0; padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-h { font-size: var(--f-small); color: var(--pm-text2); margin-bottom: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list { margin: 0; padding-left: var(--s4); font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list code { font-family: var(--pm-mono); font-size: var(--f-tiny); word-break: break-all; }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-trimmed { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-frags { display: flex; flex-wrap: wrap; gap: var(--s1); font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff { font-size: var(--f-small); line-height: 1.65; color: var(--pm-text2); word-break: break-word; }
/* 片段芯片（可点开源文件 / 路由壳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-np-doc {
  font-family: var(--pm-mono); font-size: var(--f-tiny); padding: var(--s1) var(--s2); cursor: pointer;
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: var(--pm-surface); color: var(--pm-accent-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-np-shell {
  font-family: var(--pm-mono); font-size: var(--f-tiny); padding: var(--s1) var(--s2); border: .5px solid var(--pm-line);
  border-radius: var(--r1); color: var(--pm-text2);
}
/* 注入留痕 = 原型「三个来源 / 两种后果」的逐条卡（左侧色条按后果上色） */
.dsh-pm-detail[data-report-shell] .dsh-pm-inj {
  display: block; margin-bottom: var(--s2); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line);
  border-radius: var(--r1); background: none; font-size: var(--f-small);
}
/* 送达三态：左侧色条取消，后果只落在**结论词**上（FR-10 (三) 3：语义色只出现在状态点 / 图标 / 结论词 / 错误文字）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="true"] .dsh-pm-inj-verdict { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="false"] .dsh-pm-inj-verdict { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="unknown"] .dsh-pm-inj-verdict { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-meta { font-size: var(--f-small); color: var(--pm-text2); font-family: var(--pm-mono); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-verdict { font-size: var(--f-body); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-line { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-frags { display: flex; flex-wrap: wrap; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-body,
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body {
  margin-top: var(--s2); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body > summary { font-size: var(--f-small); color: var(--pm-text2); cursor: pointer; }
/* 上下文 / 节点隔离留痕 */
.dsh-pm-detail[data-report-shell] .dsh-pm-iso,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso {
  display: block; margin-top: var(--s2); padding: var(--s1) var(--s3);
  border: .5px solid var(--pm-line);
  border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-status,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-status { font-size: var(--f-tiny); font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-meta,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-meta { font-size: var(--f-tiny); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-reason,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-reason { font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text); word-break: break-word; }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-entry { margin-bottom: var(--s2); }

/* ══════════════════════════════════════════════════════════════════════════
   ⑪ DAG Tab：原型 .dchip / 每步执行结果表（画布本身沿用既有 .dsh-pm-dag-* 分片，不在这里重定义）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-report-dag { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-summary {
  display: flex; flex-wrap: wrap; gap: var(--s1) var(--s4); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
  font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-sec-title {
  margin: var(--s4) 0 var(--s2); font-size: var(--f-h2); font-weight: 600; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step[data-outcome="failed"] { background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-title { font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-outcome { font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-summary { font-size: var(--f-small); line-height: 1.55; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-error {
  margin-top: var(--s1); font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-danger);
  background: none; border-radius: 0; padding: 0; word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-zero {
  margin-top: var(--s1); font-size: var(--f-small); font-weight: 600; color: var(--pm-warn-text);
  background: none; border: 0;
  border-radius: 0; padding: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-evidence { list-style: none; margin: var(--s1) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-evidence li {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
  background: none; border-radius: 0; padding: 0; word-break: break-all;
}
/* 每步执行结果表（8 列）：**固定布局下不给宽就被平均分掉**——真数据 84 行里
   「产出与汇报」是整段人话、」谁做」是 36 字符会话 id，各分到 1/8（≈155px）时
   一列只能容十来个字，整表变成一堵折行的墙（2026-10-05 全 Tab 扫出的变形）。
   宽口径：把余量给人话列（产出 31%），id 列给到能容 3 段的宽度，其余列只放短词。
   第一列原本吃 「td:first-child { white-space: nowrap }」，这里放开——卡名可以折行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:first-child { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(1) { width: 16%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(2) { width: 9%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(3) { width: 11%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(4) { width: 7%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(5) { width: 12%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(6) { width: 6%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(7) { width: 25%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(8) { width: 14%; }
/* 表头两行也不要撑破：长表头（产出与汇报）用较窄的字距换行，不挤列 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th { line-height: 1.35; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑫ 键盘焦点环（FR-2）：统一 :focus-visible · 两档偏移 · 苹果式 halo
   ——对应原型 「#FR-2」 段（「prototypes/detail-ui-v3.html」 的
   「.dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"]):focus-visible」）。
   形态：「outline: <宽> solid var(--pm-accent-text)」 + 「outline-offset: <档位>」 + 「box-shadow: var(--pm-focus-halo)」。
   ══════════════════════════════════════════════════════════════════════════ */

/* 只在**键盘路径**出现：用 「:focus-visible」（鼠标点击不匹配 → 不留环，旧观感一字不变，FR-2 #1）。
   环色 = 岛内文字级主色（「--pm-accent-text」 = 唯一强调色 #0071e3，白底 4.70:1 ≥ 3:1）；
   **不引**宿主的 「--dsw-alias-state-business-primary」（宿主深色下是浅蓝 #7aaaff，浅色岛上对比不足）。
   outline 不参与布局（不撑宽、不产生横向溢出、不挤动相邻元素），halo 是 box-shadow 也不参与布局。
   覆盖清单——**逐类点清**（都是本页真源码里的可聚焦元素，选类名不选标签，免得误伤别处）。
   **小控件档 = 外偏移 「+2px」（环更清楚）——按钮 / 胶囊 / 输入框 / 链接式按钮**：
       · 「.dsh-pm-btn」            按钮（操作条 / 重试 / 发送，含 「.primary」 与 「.danger」）
       · 「.dsh-pm-window」         窗口胶囊（头部的「窗口 w-…」）
       · 「.dsh-pm-input」          输入框（评论 / 回复 / 对话页内检索）
       · 「.dsh-pm-trunk-open」     链接式按钮（「点开看原文 →」）
       · 「.dsh-pm-doc-path」       文档路径胶囊（文档 Tab）
       · 「.dsh-pm-np-doc」         片段胶囊（提示词 Tab 的 「data-fragment」 芯片）
       · 「.dsh-pm-dag-btn」        DAG 工具栏按钮（纵向 / 横向 / 关键路径 / 只看主线）
   **面状档 = 内偏移 「-2px」（见下一条）——Tab 条 + 折叠条**（「details.dsh-pm-fold > summary」 /
   「details.dsh-pm-prompt > summary」 / 「details.dsh-pm-inj-body > summary」）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-window:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-input:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-doc:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-btn:focus-visible,
/* 上面七类是**点清**的清单；这一行是安全网：清单之外将来新加的可聚焦元素（「<a href>」 / 新按钮 /
   「[tabindex]」）也吃到同一配方，不会出现「只有它沿用浏览器默认环」的半统一。
   它与上面各行同配方（小控件档），所以特异性差异不会改变外观；面状档那几条**必须**比它更具体（见下）。 */
.dsh-pm-detail[data-report-shell] :is(button, input, select, textarea, summary, a[href], [tabindex]):focus-visible {
  outline: var(--pm-focus-ring-w) solid var(--pm-accent-text);
  outline-offset: var(--pm-focus-offset-ctl);
  box-shadow: var(--pm-focus-halo);
}

/* 面状档：**Tab 条 + 折叠条**用内偏移 「-2px」（FR-2 #5）——不撑出额外方框、不挤动相邻元素。
   为什么折叠条算面状（有据）：原型 「#FR-2」 段自己的口径就是「面状控件（Tab / 折叠条）用 -2px 内偏移、
   小控件 +2px 外偏移」；折叠条是**整块宽条**（整块面板的头条），不是小控件。
   为什么它还非内偏移不可（实测）：旧分片的 「.dsh-pm-fold」 带 「overflow: hidden」，外偏移的环会被
   它裁掉上/左/右三边（外偏移 2px + 环宽 2px = 条外 4px，而裁剪盒只到折叠块边框内 1px）；
   内偏移的环画在条内，天然不被裁（FR-2 #3）。

   ⚠️ 特异性（踩过的坑，原型那段也记着）：上面安全网里的 「a[href]」 让 「:is(...)」 取到 (0,4,1)，
   只写 「.dsh-pm-tab:focus-visible」 (0,4,0) 会被它盖住（实测 offset 还是 +2px）。
   所以面状档每条都补到更高：Tab 条把 「[role="tab"]」 再写一遍凑到 (0,5,0)（类比安全网的 4 个类级多 1）；
   折叠条用 「details.<类> > summary」 拿到 (0,4,2)——类级与安全网打平 (0,4)，靠多的那个元素名压过它。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab[role="tab"]:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body > summary:focus-visible {
  outline-offset: var(--pm-focus-offset-face);
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑱ DAG 面板在**详情页内**的收口（FR-5 目标尺寸 / FR-7 字阶）
   ——探针 A13 实测（原型只渲染了 trunk，这三条判据从未被量过）：
      · .dsh-pm-dag-btn 命中区 45x21.5 / 68x21.5px < 24x24（FR-5 #1）
      · .dsh-pm-dag-sub / .dsh-pm-dag-btn / .dsh-pm-dag-legend 用 11.5px（FR-7 点名的阶梯外字号）
   为什么补在本片而不是改 styles/dag.ts：dag.ts 属「本次不动的其它样式分片」边界，而这两条是
   **详情页内**的硬判据（DAG 是详情页的一个 Tab），不能因为样式写在别的分片就豁免。
   做法与本片既有的其它覆盖一致：[data-report-shell] 前缀提特异性，只在本页生效。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-btn {
  min-height: var(--pm-target);
  font-size: var(--f-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-sub,
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-legend {
  font-size: var(--f-small);
}
/* 折叠条（details > summary）在详情页内的命中区下限（FR-5 #1）：
   探针 A13 实测 prompts 面板的 summary 命中区只有 1188x18.6px（宽度够、**高度不足**）。
   同样不改其它分片，只在本页前缀下补。 */
.dsh-pm-detail[data-report-shell] summary {
  min-height: var(--pm-target);
  box-sizing: border-box;
}

/* 焦点环**不许被裁**：本片全部 「overflow: hidden」 的盒子（「.dsh-pm-action-consequence」 /
   「.dsh-pm-comment-body」 / 「.dsh-pm-gap-line」 / 「.dsh-pm-gap-what」 / 「.dsh-pm-outcome-leftover」 /
   「.dsh-pm-impact-bar」）里都没有可聚焦元素，故没有一处焦点环会被裁掉；
   唯一含可聚焦元素又有 「overflow: hidden」 的祖先是 DAG 面板（「dag.ts」 的 「.dsh-pm-dag-panel」），
   它的头部内边距 11/13/9px > 外偏移 2px + halo 3px = 5px，环与 halo 都落在内边距里（探针实测）。
   折叠块的 「.dsh-pm-fold」 另带 「overflow: hidden」（旧分片）：见上面那条给它补的 「overflow: visible」。
   本片也没有 「position: sticky」（粘性元素不存在，谈不上遮挡）。 */

/* ══════════════════════════════════════════════════════════════════════════
   ⑬ 窄档（原型只给了 1280 一档；≤1000px 时按同一套口径收得更紧，不换视觉语言）
   ——只改间距与"补充说明"的呈现，不改结构、不改内容归属、不加内层滚动
   ══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] { padding: var(--s3) var(--s4) 64px; }
  /* 模块已是上下结构（宽档就是 block 单列），窄档不再需要 grid 覆盖；模块间距仍 36px（--pm-space-module）。 */
  .dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] { gap: var(--s2); }
  /* 缺口一条压成一行：why / ref 是补充说明，窄档用省略号收尾（what 永远完整可见）。
     为什么必须收：900px 档下 5 条缺口各折 2~3 行会把六个 Tab 顶出首屏（那是验收判红的缺陷）。 */
  /* 缺口条本来就是一行（见上），窄档不再另压 */
  .dsh-pm-detail[data-report-shell] .dsh-pm-specvs,
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] { grid-template-columns: 1fr; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑭ 交互目标尺寸（FR-5 · WCAG 2.2 SC 2.5.8 Target Size (Minimum) AA）
   ——对应原型 「#FR-5」 段（「:is(.dsh-pm-btn, .dsh-pm-window, …) { min-height: 24px; min-width: 24px }」）
   ══════════════════════════════════════════════════════════════════════════ */

/* 基线实测（「evidence/targets-and-fonts-baseline.txt」，四组合）里**唯一**两项不达标的是
   「窗口跳转胶囊」与「点开看原文 →」（都在本段收口）：
     · 「.dsh-pm-window」       216.2×20.5 / 203.1×20.5   → 高差 3.5px
     · 「.dsh-pm-trunk-open」   71.2×19.3                 → 高差 4.7px
   其余目标本来就是达标的（按钮 65×29 / 74×29 / 46×25、Tab 69～125×33、输入框 1186×25）——
   所以本段**不撒网**：给全部控件统一加 min-height 只会白白撑高操作条与 Tab 栏。

   为什么用 min-height 而不是伪元素扩命中区（卡原文写的"优先"）：
     ① 原型自己就是这么落的（「#FR-5」 的 min-height/min-width），proto-geometry 记的正是
        「.dsh-pm-window = 203.1×24.0」（宽不变、高 24.0）——本段落完与原型逐值一致；
     ② 伪元素扩出来的命中区**不进食**「getBoundingClientRect()」，而 t14 的 A8 组判的正是 rect
        （「width ≥ 24 && height ≥ 24」）。只写伪元素 = 真命中区达标、判据读数仍 20.5，
        成了"读数与事实各说各话"；min-height 让两者同时为真；
     ③ 「box-sizing: border-box」是**关键**：默认 content-box 下 min-height 落在内容盒上，
        总高会变成 24 + 2×1px 内边距 + 2×1px 边框 = 28px（比要求高 4px，还多撑 4px 首屏预算）。
   「display: inline-flex + align-items: center」让文字在 24px 盒内垂直居中（不靠加内边距凑高）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-window,            /* FR-5：解析后即 min-height:24px / min-width:24px */
.dsh-pm-detail[data-report-shell] button.dsh-pm-trunk-open {  /* 同上（令牌单点见 ① 的 --pm-target: 24px） */
  display: inline-flex; align-items: center;
  box-sizing: border-box; min-height: var(--pm-target); min-width: var(--pm-target);
}

/* 相邻目标间距 ≥8px（FR-5 #2）：窗口胶囊组「.dsh-pm-report-windows」的 gap 就是「--s2」= 8px，
   实测组内相邻两枚胶囊的水平间隙 = 8.0px（四组合一致）。本段**不新增元素、不动 gap**——
   加高只改纵向（20.5 → 24），不改变组内的水平间距。 */

/* 例外清单（**显式**，逐条给理由；t14 的 A8 组断言按同一份清单放行——不放宽成"凡是小的都放过"）：
   ① 正文里的**行内链接**（「<a href>」 嵌在整句话中间，如 Markdown 的「[文字](url)」）：
      命中 WCAG 2.2 SC 2.5.8 的 **inline 例外**（目标在一句话/文本块的行内，行高不由目标撑开，
      改尺寸会把整段文字的行高顶开）。**本页实测证据**：报告壳内「a[href]」= 0 个（正文走
      「.dsh-pm-trunk-open」/「.dsh-pm-doc-path」这类真控件——见「render/md-inline.ts」的
      "不产出链接"纪律：原文里的 URL 是证据，不是入口）。故这条例外是为「.dsh-pm-detail」下
      **将来**出现的行内链接登记的，不是给眼下的控件开后门。
   ② 「.dsh-pm-trunk-open.is-nopath」：**不可点**的一行灰字说明（渲染层不给它 data-open-doc，
      见「views/panels/trunk.ts」的 openRefNodes）——它不是交互目标，故不吃 24px 下限；
      本段的选择器只写「button.dsh-pm-trunk-open」，天然不含这个 「span」 元素。
   ③ 尺寸为 0×0 的**视觉隐藏**节点（aria-describedby 的落点一类）：不是交互目标，
      A8 组按可见性过滤后再判。 */

/* ══════════════════════════════════════════════════════════════════════════
   ⑮ 动效令牌与 reduced-motion（FR-6）
   ——对应原型 「#FR-6」 段（「:is(button, a[href], summary, input, [role=tab])」 上的 transition
     + 「@media (prefers-reduced-motion: reduce)」 归零）；令牌单点定义见 ① 的四个 --pm-dur* / --pm-ease。
   ══════════════════════════════════════════════════════════════════════════ */

/* 过渡**只动颜色类属性**：color / background-color / border-color / opacity / box-shadow——
   不改宽高、不改 margin/padding、不位移、不用 transform，所以"动效前后几何读数逐项一致"
   是**结构性**成立的（不是靠运气躲过布局抖动）。
   分档（与原型同构）：四条颜色/透明度属性走标准档 120 毫秒；焦点 halo（box-shadow，装饰）
   走最快档 80 毫秒——原型是把 outline-color 放最快档，本片按任务卡给的白名单（不含 outline-color）
   用 box-shadow 承接这一档：**焦点反馈要立刻看得见**。第三档 150 毫秒与原型同口径：
   定义在场、暂未消费（留给将来需要更慢反馈的大面积位）。规则里因此只有 var(--pm-dur*)，
   不出现"每个控件一个时长"。

   覆盖六个可点控件类（FR-6 #2 点名的清单）：按钮 / Tab / 窗口胶囊 / 行内链接式按钮 /
   折叠条 / 输入框。hover、active、focus 三个状态的属性变化都落在这条声明上
   （CSS 过渡挂在**基态声明**上，任何状态切换触发的属性变化都走它，不需要逐个状态再写一遍）。

   ⚠️ 为什么这条**必须显式写**（t4 实测的坑，本片要把它压掉）：详情页控件从**旧分片**继承了
   transition——「styles/files.ts」 的 「.dsh-pm-tab」 用简写把**所有属性**都拉进了过渡
   （实测计算值：transition-property = all、transition-duration = 0.2s）。all 的坏处不只是
   时长越界（0.2s 超出 FR-6 的 80～150 毫秒），更要命的是**读计算样式会拿到过渡中间值**
   ——焦点环读数首当其冲（t4 就是这么被吞的）。本片靠 「.dsh-pm-detail[data-report-shell]」
   前缀（+1 个类级、+1 个属性选择器）把特异性提到旧规则之上，压成令牌化白名单；
   改完实测 transition-property 里**不再有 all**（六个控件逐条读数见卡汇报）。
   其余详情页控件（如 「.dsh-pm-doc-path」）的过渡来自旧分片、但**本来就是具名属性**且时长
   在区间内（实测不是 all），本卡不越界去改旧分片。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn,
.dsh-pm-detail[data-report-shell] .dsh-pm-tab,
.dsh-pm-detail[data-report-shell] .dsh-pm-window,
.dsh-pm-detail[data-report-shell] button.dsh-pm-trunk-open,
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary,
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  transition:
    color var(--pm-dur) var(--pm-ease),
    background-color var(--pm-dur) var(--pm-ease),
    border-color var(--pm-dur) var(--pm-ease),
    opacity var(--pm-dur) var(--pm-ease),
    box-shadow var(--pm-dur-fast) var(--pm-ease);
}

/* 「减少动态效果」（FR-6 #4）：**纯 CSS 媒体查询**——零 JS、无运行时状态副本、无 SSR 差异，
   探针可以直接读计算样式（判据量的是计算样式，这条正好可测）。
   ① 三个时长令牌**归零**（0s，不是"变慢"，是不动）：归零写在与 ① 同一选择器上、且在文件里
      更靠后 → 同特异性下后者胜；岛内全部后代继承到 0s（自定义属性会继承）。
   ② 再把岛内的 transition-duration / animation-duration 显式归零（含 ::before / ::after）：
      令牌归零管的是"引令牌的那些"，这条兜住"引了别的分片时长"或"后加动画"的漏网；
      用 !important 是因为要压过任何后写、高特异性的动画声明（先例：分片 settings.ts 的
      reduced-motion 分支同样用 !important 关掉过渡与动画）。
   终态直接可读：hover / focus 的终态本来就是颜色到位的样子，归零只是省掉过程。 */
@media (prefers-reduced-motion: reduce) {
  .dsh-pm-detail[data-report-shell] {
    --pm-dur-fast: 0s; --pm-dur: 0s; --pm-dur-slow: 0s;
  }
  .dsh-pm-detail[data-report-shell] *,
  .dsh-pm-detail[data-report-shell] *::before,
  .dsh-pm-detail[data-report-shell] *::after {
    transition-duration: 0s !important;
    animation-duration: 0s !important;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑯ 字阶与字重的落点收口（FR-7 · FR-12；卡 t-2055e5 ＝ 计划 t7）
   ——对应原型 「#FR-7」/「#FR-12」 两段；令牌重定值见 ①，规则里的裸字号已全部换成 var(--f-*)。
   ══════════════════════════════════════════════════════════════════════════ */

/* ① 「b」/「strong」/ 标题标签的**UA 默认字重是 700/粗体**——FR-7 #4 只留 400/500/600，
      它们没有一条本片规则覆盖，会从计算样式里漏出第 4 种字重（实测改前 「b」 = 700）。 */
.dsh-pm-detail[data-report-shell] :is(b, strong, h1, h2, h3, h4) { font-weight: 600; }

/* ② 状态带主值 = L1 20/600（FR-12 A 的 L1 槽位；卡内三格必须三档：标签 L5 11 / 主值 L1 20 / 细节 L4 12）。
      落点是每格正文里的**第一个 <b>**（渲染层把阶段名 / 结论词包在 <b> 里）：
      display: inline-block 让它独占一行（后面跟的（implementing）仍在同一段里），
      其余 <b>（计数 11/17 一类）吃上面的 600 字重、字号跟随所在档。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body > b:first-of-type {
  display: inline-block; margin-bottom: var(--s1);
  font-size: var(--f-l1); font-weight: 600; line-height: var(--lh-l1);
  letter-spacing: -.3px; font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑰ 视觉语言收敛的落点（FR-10；卡 t-efa046 ＝ 计划 t8）
   ——对应原型 「#FR-10」 段。取消清单（12% 语义浅底 / 彩色边线 / 紫前景 / 中间底色档 /
     4px 与 6px 圆角 / 卡片阴影）已在上面逐处落到位；这里补两处"既有规则没有位置"的落点。
   ══════════════════════════════════════════════════════════════════════════ */

/* ① 元信息之间的「·」分隔（FR-10 (三) 1：分类 / 难度改纯文本 + 分隔符）。
      DOM 归属是 report-head.ts（本卡不动渲染层），所以分隔符用伪元素画：不新增节点、不改文本、
      不进食读屏（伪元素内容不进可访问名）；色取三级灰——它是**装饰**，不承载信息。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-meta::before {
  content: '·'; margin-right: var(--s1); color: var(--pm-text3);
}

/* ② 内容页**不用阴影**（FR-10 (三) 6：只允许浮层与焦点 halo）。
      本片自己没有卡片阴影，但报告页沿用了旧分片的类——这里显式钉死"内容块不许有阴影"，
      免得将来某条继承/旧规则把阴影带回来。焦点环的 halo（box-shadow）是**交互反馈**、
      且写在更高特异性的 :focus-visible 规则里（⑫），不在本条的射程内。 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-stat, .dsh-pm-block, .dsh-pm-trunk-item, .dsh-pm-fact,
  .dsh-pm-hl, .dsh-pm-opt, .dsh-pm-inj, .dsh-pm-iso, .dsh-pm-tok-sub, .dsh-pm-rh-bar,
  details.dsh-pm-fold, details.dsh-pm-prompt) { box-shadow: none; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑲ 设计契约落地层（REQ-261005155003-f32f · 权威原型 v2 的「改造层」逐段并进）
   ──────────────────────────────────────────────────────────────────────────
   为什么要有这一段：设计契约写在原型 v2 的「改造层」里（95 条规则），实施期漏了一批
   （2026-10-05 人眼发现 Tab 栏整段没落地：设计是**苹果分段控件**，实现是下划线式），
   而原型 v3 又被"重新内联成实现的渲染"，把偏离固化成了"零漂移"——判据从此照不出来。
   现在按设计层自己的原话落地：「选择器去掉前缀即可，其余一字不改」。
   排除清单（**有裁定取代，不能照搬**，逐条给依据）：
     · .dsh-pm-rh-bar            → D-8 把动作行移到头部第一行，上发丝线/上内边距作废
     · .dsh-pm-detail-title      → FR-12/FR-10(四) 勘误：页标题就是 24px（设计层写 20px 与勘误相抵）
     · [data-action-rank=danger] → D-8 裁定 A：紧跟主操作、margin-left: 24px
     · .dsh-pm-tabs / .dsh-pm-tab / -tab-icon → 本轮已按设计层落地，见上面 ④ 段
     · 令牌块                    → 实现自己的 token 段持有（--pm-hair / --pm-accent-hover 已补齐）
   防复发：scripts/req-detail-design-conformance.mts 会把这一层再叠一次并断言"叠不叠都一样"——
   本段哪天被删/被改偏，脚本当场红。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] .dsh-pm-status { padding: 0; border: 0; border-radius: var(--pm-pill); background: none; font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 500; color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"], .dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-report-meta, .dsh-pm-card-id, .dsh-pm-trunk-src, .dsh-pm-src, .dsh-pm-doc-kind, .dsh-pm-flag, .dsh-pm-gap-ref, .dsh-pm-evidence, .dsh-pm-verify-verdict, .dsh-pm-doc-label, .dsh-pm-doc-state, .dsh-pm-np-shell) { padding: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 400; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge], .dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { padding: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 400; font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] { margin-left: var(--s1); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { margin-left: auto; }
.dsh-pm-detail[data-report-shell]
  .dsh-pm-rh-top > :not(.dsh-pm-detail-updated) + :not(.dsh-pm-detail-updated)::before { content: '· '; color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-gate, .dsh-pm-hl-missing, .dsh-pm-trunk-missing, .dsh-pm-flag) { border: 0; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gate { padding: 6px 0 0; background: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-stat, .dsh-pm-hl, .dsh-pm-fact, .dsh-pm-tok-sub, .dsh-pm-tok-total td, .dsh-pm-docs-table th, .dsh-pm-report-table th, .dsh-pm-tok-table th) { background: var(--pm-bg-soft); border: 0; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-docs-table, .dsh-pm-report-table, .dsh-pm-tok-table) tbody tr:hover { background: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-gap-ref, .dsh-pm-evidence, .dsh-pm-md-h code, .dsh-pm-md-quote code, .dsh-pm-md-li code, .dsh-pm-md-oli code, .dsh-pm-md-cell code, .dsh-pm-trunk-line code, .dsh-pm-block-summary code, .dsh-pm-sv-diff code, .dsh-pm-callout code, .dsh-pm-report-evidence li) { border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot { width: 100%; height: 4px; border-radius: 8px; opacity: 1; background: var(--pm-bg-soft); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot { width: 100%; height: 4px; background: var(--pm-accent); box-shadow: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-detail-head[data-report-head], .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-md-row, .dsh-pm-docs-table td, .dsh-pm-report-table td, .dsh-pm-tok-table td, .dsh-pm-docs-table th, .dsh-pm-report-table th, .dsh-pm-tok-table th) { border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-detail-head[data-report-head], [data-report-seg="band"], .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-comments > .dsh-pm-action-bar-label) { border-width: var(--pm-hair); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat, .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="progress"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="gaps"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="outcome"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat:has([data-gaps="none"]) { border: 0; border-radius: 8px; padding: var(--s3) var(--s4); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict { padding: 0; border: 0; border-radius: 0; background: none; font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 400; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover { padding-left: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-stat, .dsh-pm-hl, .dsh-pm-hl-missing, .dsh-pm-fact, .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-btn, .dsh-pm-input, .dsh-pm-np-card, .dsh-pm-np-col) { box-shadow: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-btn, .dsh-pm-input, .dsh-pm-window, .dsh-pm-doc-path) { border: var(--pm-hair) solid var(--pm-line); border-radius: 8px; background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-window { padding: 1px 8px; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover { border-color: var(--pm-line-strong); color: var(--pm-text); background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: dashed; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { color: var(--pm-danger); border-color: var(--pm-line-strong); background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary { background: var(--pm-accent); border-color: transparent; color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary:hover { background: var(--pm-accent-hover); border-color: transparent; }
.dsh-pm-detail[data-report-shell] b, .dsh-pm-detail[data-report-shell] strong { font-weight: 500; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-weight: 600; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-action-bar-label, .dsh-pm-comment-who, .dsh-pm-evidence-missing, .dsh-pm-band-ok, .dsh-pm-hl-diff, .dsh-pm-trunk-scope-hint, .dsh-pm-inj-verdict, .dsh-pm-opt-title, .dsh-pm-outcome-verdict, .dsh-pm-verify-verdict, .dsh-pm-np-iso-status, .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label, .dsh-pm-dot-wrapper.current .dsh-pm-dot-label) { font-weight: 500; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-dot-label, .dsh-pm-action-consequence, .dsh-pm-human-only, .dsh-pm-gate, .dsh-pm-input::placeholder, .dsh-pm-comments > .dsh-pm-action-bar-label, .dsh-pm-comment-meta, .dsh-pm-stat-label, .dsh-pm-band-mut, .dsh-pm-gap-more, .dsh-pm-hint, .dsh-pm-muted, .dsh-pm-note, .dsh-pm-empty, .dsh-pm-md-num, .dsh-pm-src[data-source="none"], .dsh-pm-trunk-docmeta, .dsh-pm-trunk-sub, .dsh-pm-trunk-mut, .dsh-pm-trunk-ref-hint, .dsh-pm-trunk-open.is-nopath, .dsh-pm-trunk-hl-h, .dsh-pm-doc-path.dsh-pm-doc-missing, .dsh-pm-docs .dsh-pm-discovered-rest, .dsh-pm-doc-row[data-proto-role="superseded"], .dsh-pm-archive-reconcile[data-reconcile="none"], .dsh-pm-archive-ack, .dsh-pm-msg-time, .dsh-pm-tok-h-note, .dsh-pm-pp-h-note, .dsh-pm-tok-more, .dsh-pm-nosnap, .dsh-pm-opt-basis, .dsh-pm-sum, .dsh-pm-impact-name, .dsh-pm-prompt-meta, .dsh-pm-sv-h, .dsh-pm-inj-meta, .dsh-pm-inj-line, .dsh-pm-iso-meta, .dsh-pm-np-iso-meta, .dsh-pm-report-evidence li, .dsh-pm-msg--system) { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub td { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-card-id { font-size: var(--f-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn, .dsh-pm-detail[data-report-shell] .dsh-pm-input { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict, .dsh-pm-detail[data-report-shell] .dsh-pm-block-title, .dsh-pm-detail[data-report-shell] .dsh-pm-block-summary, .dsh-pm-detail[data-report-shell] .dsh-pm-hl-diff, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-list li, .dsh-pm-detail[data-report-shell] .dsh-pm-msg, .dsh-pm-detail[data-report-shell] .dsh-pm-inj, .dsh-pm-detail[data-report-shell] .dsh-pm-inj-verdict, .dsh-pm-detail[data-report-shell] .dsh-pm-iso-reason, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-h, .dsh-pm-detail[data-report-shell] .dsh-pm-pp-h, .dsh-pm-detail[data-report-shell] .dsh-pm-opt, .dsh-pm-detail[data-report-shell] .dsh-pm-opt-sug, .dsh-pm-detail[data-report-shell] .dsh-pm-sv-list, .dsh-pm-detail[data-report-shell] .dsh-pm-report-sec-title, .dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile, .dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-value { font-size: var(--f-h2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-path, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-kind, .dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred, .dsh-pm-detail[data-report-shell] .dsh-pm-prompt-name, .dsh-pm-detail[data-report-shell] .dsh-pm-np-doc, .dsh-pm-detail[data-report-shell] .dsh-pm-report-step-error, .dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence li, .dsh-pm-detail[data-report-shell] code { font-size: var(--f-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover { font-size: var(--f-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-state, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-path { font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table, .dsh-pm-detail[data-report-shell] .dsh-pm-report-table, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-table, .dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-report-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-fact-label, .dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary, .dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-src, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src, .dsh-pm-detail[data-report-shell] .dsh-pm-evidence, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-path, .dsh-pm-detail[data-report-shell] .dsh-pm-window { font-size: var(--f-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body { font-size: var(--f-body); line-height: var(--lh-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-body { line-height: var(--lh-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line { line-height: var(--lh-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { line-height: var(--lh-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body { line-height: var(--lh-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-meta { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label { font-size: var(--f-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-title { font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-src, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-sub, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref-hint, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-mut, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-h, .dsh-pm-detail[data-report-shell] .dsh-pm-human-only, .dsh-pm-detail[data-report-shell] .dsh-pm-action-consequence, .dsh-pm-detail[data-report-shell] .dsh-pm-dot-label { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-window, .dsh-pm-trunk-open, .dsh-pm-doc-path) { display: inline-flex; align-items: center; }
.dsh-pm-detail[data-report-shell] .dsh-pm-flag, .dsh-pm-detail[data-report-shell] .dsh-pm-report-meta[data-blocked-reason], .dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="failed"], .dsh-pm-detail[data-report-shell] .dsh-pm-evidence-missing, .dsh-pm-detail[data-report-shell] .dsh-pm-block-note, .dsh-pm-detail[data-report-shell] .dsh-pm-archive-noack { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="passed"], .dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pending"], .dsh-pm-detail[data-report-shell] .dsh-pm-sv-trimmed, .dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred, .dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-note, .dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pending"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing { padding: 0; border: 0; border-radius: 0; font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="agent"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="doc"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="auto"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="ledger"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="new-section"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="human"], .dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="human"] { background: none; border: 0; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--s1) var(--s3); }

/* 设计层那条 letter-spacing 是**四类共用一条**（:is 选择器），其中 .dsh-pm-detail-title 已被
   FR-12 的 24px 取代（字号变了，字距取值随之另定），故这里只补未被取代的三类（其余一字不改）。 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-trunk-title, .dsh-pm-block-title, .dsh-pm-report-verdict) {
  letter-spacing: -.2px;
}

/* ══════════════════════════════════════════════════════════════════════════
   头部灰卡连带修正（人裁定，2026-10-05 第二轮：「卡片要有背景」）
   ──────────────────────────────────────────────────────────────────────────
   头部改灰底（--pm-bg-soft）之后，卡内有两处会**看不见/不达标**，必须连带修：
   ① 状态胶囊：设计层与 FR-10 都给「无底色、文字色取 --pm-accent」——accent 在灰底上只有
      **4.31:1 < 4.5:1**（契约层自己写明「强调色文字只允许落在白底上」）。
      处置：胶囊改**白底 + 发丝边**——文字色仍照设计层（accent/ok/teal/text2），
      文字落的是白底（4.70:1+），胶囊边框才承担"胶囊"形态。
   ② 未开始阶段段：原来是 --pm-bg-soft 的灰段——**灰段落在灰卡上直接隐形**。
      处置：改白底段（--pm-surface，底色两档之一的"白"）：灰卡上看得见，完成绿/当前蓝不变。
   为什么单独成段、用更高特异性：上面「设计契约落地层」是契约原文、不去动它；
   这里的两条是它的**有裁定取代**（已在 req-detail-design-conformance.mts 白名单登记）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] .dsh-pm-status {
  background: var(--pm-surface); border: .5px solid var(--pm-line); padding: 1px 8px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] .dsh-pm-dot-wrapper[data-stage-state="todo"] .dsh-pm-dot {
  background: var(--pm-surface);
}

/* ── FR-4 进度带与 Tab 栏（REQ-261006130057-7a43 t2）── */
/* ══════════════════════════════════════════════════════════════════════════
   ── FR-4 进度带与 Tab 栏（REQ-261006130057-7a43 t2）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5
   的「#FR-4」区块（进度带 + Tab 栏）：
     · Tab 栏收敛：padding 6×8 / 图标 13px / 计数徽章等宽 mono 10.5px /
       激活态 = 浅蓝底 + 主色文字 + 底部 2px 指示条（取代 ④ 段的「白滑块分段控件」激活态——
       本需求原型 v1.1 起 Tab 栏 6 → 7 枚，激活态按新基准落地）；
     · 进度带：4px 色条（④ 段已是）+ 10.5px 单行标签（--f-tiny 是 11px，这里按基准收到 10.5）；
     · 900 窄档：7 枚 Tab 允许横滚不换行；进度带标签单行不溢出。
   令牌纪律：新值全部先成本块局部 --pm-* 令牌再被引用（色值只从 --pm-accent/--pm-surface 推导，
   不写裸色值/裸毫秒）。本块刻意置于片尾：同特异性下后者胜，压过 ④ 段与 ⑲ 段的同名规则。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-tab-pad-y: 6px; --pm-tab-pad-x: 8px;      /* FR-4：Tab 内边距 6×8 */
  --pm-tab-icon-fr4: 13px;                        /* FR-4：Tab 图标 13px（--pm-icon 的 14px 档不动，留给它处） */
  --pm-tab-badge-fs: 10.5px;                      /* FR-4：计数徽章字号（等宽 mono） */
  --pm-prog-label-fs: 10.5px;                     /* FR-4：进度带标签字号（单行） */
  --pm-tab-indicator: 2px;                        /* FR-4：激活态底部指示条宽度 */
  /* 激活态浅蓝底：只从唯一强调色与白表面推导（10% 主色压白），不引入新色值字面量。 */
  --pm-tab-active-bg: color-mix(in srgb, var(--pm-accent) 10%, var(--pm-surface));
}
/* Tab 栏：窄档横滚不换行（900 档 7 枚）；其余照旧（满行、--pm-bg-soft 轨道、gap 2px）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  flex-wrap: nowrap; overflow-x: auto;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  /* min-width: fit-content = 窄档不许把内容挤没（让位给横滚），宽档仍 flex-grow 满行等宽；
     底部 2px 透明边为指示条**占位**——激活与否同盒高，切换不跳。 */
  flex: 1 1 0; min-width: fit-content;
  padding: var(--pm-tab-pad-y) var(--pm-tab-pad-x);
  border-bottom: var(--pm-tab-indicator) solid transparent;
}
/* 激活态 = 浅蓝底 + 主色文字 + 底部 2px 指示条（三重表达，不是只靠颜色）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  background: var(--pm-tab-active-bg); color: var(--pm-accent); font-weight: 600;
  border-bottom-color: var(--pm-accent);
}
/* FR-4：Tab 图标 13px（只改 Tab 栏这一处消费端；--pm-icon 令牌与 icons.ts 的"无尺寸"纪律不动）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon > svg {
  width: var(--pm-tab-icon-fr4); height: var(--pm-tab-icon-fr4);
}
/* FR-4：计数徽章 = 等宽 mono 10.5px（等宽数字靠 mono + tabular-nums 双保险）；无底无胶囊照旧。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] {
  font-family: var(--pm-mono); font-size: var(--pm-tab-badge-fs); font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] {
  background: none; color: var(--pm-accent);
}
/* 验收 Tab 待裁决徽标 = 红色呼救信号（复核 P1-1：灰徽章等于没有；色值一律从 --pm-danger 推导）。
   「有待裁决才渲染」由壳保证（tabCounts.verify 缺省不渲染徽章，禁 0 冒充）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count.dsh-pm-badge-alert[data-badge-verify] {
  background: var(--pm-danger); color: var(--pm-surface); border-radius: 8px;
  padding: 0 5px; line-height: 14px; font-weight: 600;
}
/* FR-4：进度带标签 10.5px 单行（色条 4px 在 ④ 段已是，不动）；900 窄档不溢出靠 nowrap + min-width:0。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots .dsh-pm-dot-label {
  font-size: var(--pm-prog-label-fs); white-space: nowrap;
}

/* ══════════════════════════════════════════════════════════════════════════
   ── FR-1 头部三层（REQ-261006130057-7a43 t4）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5
   的「#FR-1」头部区块（.head-id / .head-title / .gate）。三层：
     ① 标识行（.dsh-pm-rh-top）：← 看板 ｜ REQ-id（等宽）｜ 状态药丸 ｜ 分类/难度 ｜
        内联时间（停留/更新/创建）；席位 chips（.dsh-pm-report-windows）**右置**，已归档置灰；
     ② 标题行（.dsh-pm-rh-title）：19px 标题 + 操作按钮聚合**固定右侧**
        （按钮集合 = buildReportActionBar 现行输出，渲染层不增不减）；
     ③ 闸门提示条（.dsh-pm-gate-banner）：waitingHuman > 0 才渲染（无则整条不渲染、不留空壳），
        琥珀底一行 + 锚链「查看缺口 ↓」（hash 落点 = 状态带缺口格 id="dsh-pm-gap-focus"）。
   本块取代的旧排布（同特异性后者胜，本块刻意置于片尾——与 FR-2/FR-4 块同款策略）：
     · D-8「动作行第一行 / 身份行第二行」→ 新基准：标识行第一、标题行第二（动作聚合右置）；
     · 页标题 24px（FR-12 勘误）→ 19px（本需求 design/frontend.md 明写；字阶六档闭集
       不开第七档，故 19px 成本块局部令牌 --pm-head-title-fs，不写裸 font-size）；
     · 「创建于 …」行尾右推（D-8）→ 归回内联时间组，右端让给席位组。
   令牌纪律：规则里只引 --pm-*；新增令牌（--pm-warn-tint / --pm-warn-line /
   --pm-head-title-fs / --pm-head-title-lh）定义在本块内（与 FR-2 块 --pm-danger-tint 同款）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-warn-tint: #fffbeb;          /* 闸门提示条琥珀底（原型 --amber-bg 同值） */
  --pm-warn-line: #fde68a;          /* 琥珀边线（原型 --amber-border 同值） */
  --pm-head-title-fs: 19px;         /* 标题行 19px（原型 .head-title h1；六档字阶无此档，局部令牌） */
  --pm-head-title-lh: 26px;         /* ≈1.35 行高（原型 1.35） */
}
/* ① 标识行：席位组吃唯一的「margin-left: auto」（右置）；「创建于 …」归回内联时间组（不再右推）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] { margin-left: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows { margin-left: auto; }
/* ← 看板 是导航不是元信息：它与 REQ-id 之间不画 ⑲ 段的「· 」相邻分隔符。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > .dsh-pm-btn[data-action="back"] + .dsh-pm-card-id::before {
  content: none; margin-right: 0;
}
/* 席位组右置后前邻是「创建于 …」（元信息）——⑲ 段的相邻分隔规则会给它画「· 」，
   但右置的席位组与元信息组不是"并列元信息"（原型 .seats 前无分隔符），故抹掉。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > .dsh-pm-report-windows[data-report-windows]::before {
  content: none;
}
/* ② 标题行：标题与操作区一行（flex-wrap = 900 窄档允许操作行折行）；操作区聚合固定右侧。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title {
  flex-basis: 100%; display: flex; align-items: flex-start; flex-wrap: wrap;
  gap: var(--s2) var(--s4); min-width: 0; margin-top: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-detail-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-size: var(--pm-head-title-fs); line-height: var(--pm-head-title-lh); letter-spacing: -.2px; /* 裸 px 豁免（复核 P2-2）：字距微调无令牌语义，登记不令牌化 */
}
/* 操作区（或终态的「终态只读」说明）：不拉伸、固定右端；与标题首行基线对齐（padding-top 2px）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-report-actions,
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-gate {
  flex: none; margin-left: auto; padding-top: 2px; /* 裸 px 豁免（复核 P2-2）：基线对齐微调 */ align-self: flex-start;
}
/* ③ 闸门提示条：琥珀底整行出血贴头卡左右缘（头卡 padding = --s3 --s4）；信息双编码
   （⚠ 字符 + 完整文案），锚链同色加粗（原型 .gate a）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-banner {
  flex-basis: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  margin: 0 calc(-1 * var(--s4)); padding: var(--s2) var(--s4);
  background: var(--pm-warn-tint); border-top: var(--pm-hair) solid var(--pm-warn-line);
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-warn-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-flag { flex: none; font-weight: 700; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-banner b { font-weight: 700; font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-link { flex: none; color: var(--pm-warn-text); font-weight: 600; text-decoration: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-link:hover { text-decoration: underline; }
/* 900 窄档（沿用本片 ≤1000px 断点）：操作行折行由标题行 flex-wrap 承担；
   标识行内联时间收起次要项「创建于 …」（纯 CSS 隐藏，不改数据、不改渲染）。 */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] { display: none; }
}

/* ── FR-6/FR-7 文档Token提示词密度与 DAG 适配（REQ-261006130057-7a43 t8）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5：
     · FR-6 文档面板：三分节紧凑表（类型/路径/登记时间/状态/打开）——路径列纯文本（等宽），
       打开入口独立成列（链接式小按钮，原型 .open-link）；
     · FR-6 Token 面板：四张汇总卡（原型 .stat-grid）+ 按节点表数字等宽右对齐（原型 .dt td.r）；
     · FR-6 提示词面板：注入信息 chips（原型 .info-strip/.chip）+ 被裁片段「已截断」标
       （原型 .frag .f-trim 琥珀字）；
     · FR-7 DAG 面板：画布组件不动——只适配容器（通栏去多余内边距）+ 顶部工具行
       （原型 .dag-toolbar：−/100%/＋/适应窗口 disabled 占位 + 四态图例色点带文字标签）
       + 无任务空态单独成块（原型 .de-box 虚线框）。
   令牌纪律：规则体只引 --pm-* 令牌与既有一档表（--s*/--r1/--f-*/--lh-*）；
   四态图例色点按 data-dot 上色，全部取自既有语义令牌（--pm-line-strong/--pm-accent/
   --pm-ok/--pm-danger），不写裸色值。本块置于片尾：同特异性下后者胜。 */

/* ① 文档三分节紧凑表：路径格纯文本（等宽、可折行），打开列独立 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-filepath {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text); word-break: break-all;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-filepath.dsh-pm-doc-missing { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open {
  font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; background: none; color: var(--pm-accent-text); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open:hover:not([disabled]) { text-decoration: underline; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open[disabled] { color: var(--pm-text3); cursor: default; }
/* 「打开」列宽：固定布局下不给宽会被平均分掉 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(5) { width: 64px; }
/* 生成物表（无表头，四列）：名称 / 路径 / 状态 / 打开 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(1) { width: 200px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(3) { width: 130px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(4) { width: 64px; }
/* 其它发现表（无表头，四列）：类型 / 计数 / 样例 / 余量说明 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-discovered-table] td:nth-child(2) { width: 72px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-discovered-table] td:nth-child(4) { width: 220px; }

/* ② Token 汇总卡（原型 .stat-grid：大数字 + 小注；未采集的卡写「—」，不出现 0） */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stat {
  background: var(--pm-surface); border: var(--pm-hair) solid var(--pm-line);
  border-radius: var(--r1); padding: var(--s2) var(--s3); box-shadow: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stat-label { font-size: var(--f-tiny); color: var(--pm-text2); margin-bottom: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stat-num {
  font-family: var(--pm-mono); font-size: var(--f-l1); font-weight: 600; line-height: var(--lh-l1);
  font-variant-numeric: tabular-nums; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stat-sub { font-size: var(--f-tiny); color: var(--pm-text3); margin-top: 2px; }
/* 按节点表数字列：等宽右对齐（渲染层给数字格带 .dsh-pm-tok-num；占比列有条，不收） */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td.dsh-pm-tok-num {
  text-align: right; font-family: var(--pm-mono); font-variant-numeric: tabular-nums; white-space: nowrap;
}
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-tok-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* ③ 提示词注入信息 chips（原型 .info-strip/.chip：细边小条，数字等宽） */
.dsh-pm-detail[data-report-shell] .dsh-pm-chips { display: flex; flex-wrap: wrap; gap: var(--s2); margin: 0 0 var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-chip {
  display: inline-flex; align-items: baseline; gap: var(--s1);
  border: var(--pm-hair) solid var(--pm-line); border-radius: var(--r1);
  padding: 1px var(--s2); background: none; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-chip b {
  font-family: var(--pm-mono); font-variant-numeric: tabular-nums; color: var(--pm-text); font-weight: 600;
}
/* 被裁片段「已截断」标（原型 .f-trim 琥珀字；描边取 currentColor，不新增色值） */
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-trim {
  display: inline-block; font-size: var(--f-tiny); color: var(--pm-warn-text);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px;
}

/* ④ DAG 容器适配（画布组件零改动；只收容器与新增的工具行/空态块） */
/* 通栏：画布滚动区在详情页内不再二次缩进（dag.ts 分片的 13px 侧 padding 只服务旧详情页排版） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-dag .dsh-pm-dag-canvas-wrap { padding: 0 0 var(--s1); }
/* 顶部工具行：−/100%/＋/适应窗口 + 四态图例 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-toolbar {
  display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap;
  padding: var(--s2) var(--s3); border-bottom: var(--pm-hair) solid var(--pm-line);
  font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-tbtn {
  font: inherit; padding: 2px 9px; min-height: var(--pm-target); box-sizing: border-box;
  border: var(--pm-hair) solid var(--pm-line-strong); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text2);
}
/* 缩放四件全是占位（画布无 API 可接）：禁用态留在原地、title 说缘由——不给假按钮 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-tbtn[disabled] { opacity: .55; cursor: default; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-zoom-pct {
  font-family: var(--pm-mono); font-size: var(--f-small); min-width: 44px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-legend4 {
  margin-left: auto; display: inline-flex; align-items: center; gap: var(--s3); flex-wrap: wrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-legend4 > span { display: inline-flex; align-items: center; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: var(--pm-pill); margin-right: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="todo"] { background: var(--pm-line-strong); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="running"] { background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="done"] { background: var(--pm-ok-text); } /* 复核 P1-1：--pm-ok 已并入 -text 档，悬空引用会让「完成」色点透明隐形 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="blocked"] { background: var(--pm-danger); }
/* 无任务空态：单独成块（原型 .de-box 虚线框居中文案） */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-empty {
  border: 1px dashed var(--pm-line-strong); border-radius: var(--r1);
  padding: var(--s4); text-align: center; color: var(--pm-text2); font-size: var(--f-small);
}

/* ══════════════════════════════════════════════════════════════════════════
   ── FR-3/FR-5 评论紧凑与汇报网格（REQ-261006130057-7a43 t6）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5：
     · FR-3 最近评论（.comments / .c-row）：每条一行——「身份 · 时间 · 正文」同行，
       正文单行省略截断（title 全文）；长日志（isLongDialogueText：>120 字符或含换行）
       默认折叠 + 「长日志已收纳」琥珀标 + 行尾「展开」就地放开
       （原生 <details>/<summary>，与状态带「展开说明」、对话长气泡同机制）；
       头部行右放「全部对话 →」（原型 .c-head a）。
     · FR-5 汇报面板（.trunk-grid / .t-mod / .t-head）：模块头**一行化**
       （标题左 13px 半粗 + 副题 + 右端「来源标 + 点开看原文 →」11px 灰）；
       短模块 2×2 网格（为何做/解决什么/怎么做/边界 + 关键决策/技术方案随流），
       长模块（亮点与成效）通栏；正文 12.5px/1.55。
   令牌纪律：规则体只引 --pm-* 令牌与既有一档表（--s*/--r1/--f-*/--lh-*）；
   13px 标题 / 12.5px 正文 / 1.55 行高在六档字阶之外，照 t4 先例收本块局部令牌，
   不写裸值；琥珀标取 --pm-warn-text / --pm-warn-tint（t4 块已定义，同源复用）。
   本块置于片尾：同特异性下后者胜（与 FR-1/FR-2/FR-6/FR-7 各块同款策略）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-trunk-title-fs: 13px;   /* 模块标题 13px（原型 .t-head h5；六档无此档，局部令牌） */
  --pm-trunk-title-fw: 650;    /* 半粗（原型 font-weight:650） */
  --pm-trunk-body-fs: 12.5px;  /* 汇报正文 12.5px（原型 .t-mod p；六档无此档） */
  --pm-trunk-body-lh: 1.55;    /* 紧凑行高（原型 12.5px/1.55） */
}

/* ── FR-3 评论紧凑 ─────────────────────────────────────────────────────── */
/* 头部行：标签在左、「全部对话 →」右置（原型 .c-head a 的 margin-left:auto） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments-head {
  display: flex; align-items: baseline; gap: var(--s2); margin-bottom: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments-head > .dsh-pm-action-bar-label {
  flex: 1 1 auto; min-width: 0; margin-bottom: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments-all {
  flex: none; font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; border-radius: 0; background: none; color: var(--pm-accent-text); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments-all:hover { text-decoration: underline; }
/* 短评正文：单行省略（取代旧 -webkit-line-clamp 的"最多两行"写法；全文在 title 里） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment > .dsh-pm-comment-body {
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 「长日志已收纳」琥珀标（原型 .c-flag；与对话气泡 .dsh-pm-b-flag 同族，描边取 currentColor） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag {
  flex: none; display: inline-block; font-size: var(--f-tiny); font-weight: 500;
  color: var(--pm-warn-text); background: var(--pm-warn-tint);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px;
}
/* 长日志折叠体：占满行内剩余宽度；合上 = 截断一行 + 行尾「展开」，点开就地放开 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold { flex: 1 1 auto; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold-head {
  display: flex; align-items: baseline; gap: var(--s2); min-width: 0;
  list-style: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold-head::-webkit-details-marker { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body--clip {
  flex: 1 1 auto; min-width: 0; display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold[open] .dsh-pm-comment-body--clip { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-toggle {
  flex: none; font-size: var(--f-tiny); color: var(--pm-accent-text); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-toggle:hover { text-decoration: underline; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold:not([open]) .dsh-pm-comment-close,
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold[open] .dsh-pm-comment-open { display: none; }
/* 展开后的全文：保留原文换行（多行日志就是因此被收纳的），白空间照原文、不断词硬折 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body--full {
  display: block; white-space: pre-wrap; word-break: break-word; margin-top: var(--s1);
}

/* ── FR-5 汇报网格与模块头一行化 ───────────────────────────────────────── */
/* 短模块 2×2 网格（原型 .trunk-grid）；模块间 36px 的旧 margin 由网格 gap 接管 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s3); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-grid > .dsh-pm-trunk-item { margin: 0; }
/* 长模块（亮点与成效）通栏（原型 .t-mod.wide） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item--wide { grid-column: 1 / -1; }
/* 模块头一行化（原型 .t-head）：标题左 13px 半粗 + 副题 + 右端「来源标 + 点开看原文 →」 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head {
  flex-wrap: nowrap; align-items: baseline; gap: var(--s2); margin: 0 0 var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head > .dsh-pm-trunk-title {
  flex: none; font-size: var(--pm-trunk-title-fs); font-weight: var(--pm-trunk-title-fw);
  line-height: var(--lh-h2); letter-spacing: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head > .dsh-pm-trunk-sub {
  flex: 1 1 auto; min-width: 0; margin-left: 0;
  font-size: var(--f-tiny); line-height: var(--lh-tiny);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 右端：来源标 + 点开原文入口（11px 灰，原型 .t-src）；唯一的「margin-left:auto」吃在这里 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head-right {
  flex: none; margin-left: auto; display: inline-flex; align-items: baseline;
  flex-wrap: wrap; justify-content: flex-end; gap: var(--s1) var(--s2);
  font-size: var(--f-tiny); line-height: var(--lh-tiny); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head-right .dsh-pm-trunk-src { margin-top: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head-right .dsh-pm-trunk-openrefs {
  display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s2); margin-top: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head-right .dsh-pm-trunk-ref-hint,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head-right .dsh-pm-trunk-open {
  font-size: var(--f-tiny);
}
/* 正文紧凑（原型 .t-mod p：12.5px/1.55） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-body,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line {
  font-size: var(--pm-trunk-body-fs); line-height: var(--pm-trunk-body-lh);
}
/* 900 窄档：网格落回单列（与片内既有 ≤1000px 断点同档） */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-grid { grid-template-columns: 1fr; }
}
`
