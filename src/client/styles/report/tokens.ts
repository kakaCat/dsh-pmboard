/**
 * tokens.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放设计令牌与壳体（--pm-* 的唯一出处）；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const TOKENS_CSS = `   ① 壳体与设计令牌（对应原型 :root + .wrap）
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
  --pm-danger: #d70015;                /* 苹果 accessible red · 5.38:1；遗留的 --pm-ok-text / --pm-warn-text 已并入下面 -text 两档 */
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

  /* 版心：原型 .wrap { max-width: 1240px; padding: 22px 20px 90px } → 1240 + 2×20 = 1280。
     **必须 border-box**（D-13 返工）：默认 content-box 下 1280 是内容盒，再加 2×20 padding
     总宽 1320 > 视口 1280 → 版心右缘被裁 20px（所有 Tab 的末列都被切，token 表最显眼）。
     border-box 让 max-width 含 padding，内容宽 1240，与原型 ".wrap 1240" 口径一致。 */
  display: flex; flex-direction: column; gap: 0;
  box-sizing: border-box;
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
`
