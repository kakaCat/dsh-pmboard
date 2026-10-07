/**
 * tabs.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放进度带与 Tab 栏；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const TABS_CSS = `   ④ Tab 栏（对应原型 .tabs / .tab / .tab.active / .tab .cnt）
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


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：6 条，只服务 tabs ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

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
  /* 2026-10-07「详情页面不适配」：7 枚页签的 min-content 合计约 628px（min-width: fit-content
     不让每格被压扁），会把报告壳的 min-content 顶到约 668——这正是壳在 <700 视口里停在 660
     的原因（页面级虽不溢出，壳仍比视口宽，右侧照样被宿主裁掉）。inline-size 包含让栏身的内联
     尺寸不再由页签内容决定：栏身铺满可用宽，页签在栏内横滚——正是 FR-4 给窄档定的行为。 */
  contain: inline-size;
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

.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] {
  background: none; color: var(--pm-accent);
}

/* 验收 Tab 待裁决徽标 = 红色呼救信号（复核 P1-1：灰徽章等于没有；色值一律从 --pm-danger 推导）。
   「有待裁决才渲染」由壳保证（tabCounts.verify 缺省不渲染徽章，禁 0 冒充）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count.dsh-pm-badge-alert[data-badge-verify] {
  background: var(--pm-danger); color: var(--pm-surface); border-radius: 8px;
  padding: 0 5px; line-height: 14px; font-weight: 600;
}
/* ══════════════════════════════════════════════════════════════════════════
`
