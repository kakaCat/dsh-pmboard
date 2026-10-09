/**
 * band.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放状态带三格；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const BAND_CSS = `   ③ 状态带三格（对应原型 .band / .band-i / .band-h / .band-b / .gap-line / .dot）
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


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：8 条，只服务 band ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

/* ② 状态带主值 = L1 20/600（FR-12 A 的 L1 槽位；卡内三格必须三档：标签 L5 11 / 主值 L1 20 / 细节 L4 12）。
      落点是每格正文里的**第一个 <b>**（渲染层把阶段名 / 结论词包在 <b> 里）：
      display: inline-block 让它独占一行（后面跟的（implementing）仍在同一段里），
      其余 <b>（计数 11/17 一类）吃上面的 600 字重、字号跟随所在档。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body > b:first-of-type {
  display: inline-block; margin-bottom: var(--s1);
  font-size: var(--f-l1); font-weight: 600; line-height: var(--lh-l1);
  letter-spacing: -.3px; font-variant-numeric: tabular-nums;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-stat, .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="progress"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="gaps"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="outcome"], .dsh-pm-detail[data-report-shell] .dsh-pm-stat:has([data-gaps="none"]) { border: 0; border-radius: 8px; padding: var(--s3) var(--s4); }

.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover { padding-left: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover { font-size: var(--f-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { font-size: var(--f-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body { font-size: var(--f-body); line-height: var(--lh-body); }

.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { line-height: var(--lh-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label { font-size: var(--f-tiny); }

/* ── 归位自公共层条件组（REQ-261007133149-0716 t4）：窄档里只服务 band 的那条 ── */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] { gap: var(--s2); }
}

/* ── 看板 pending 票横带（REQ-261007223647-da5d t9 / FR-5）────────────────────
   有票才渲染（无票零 DOM）；钉在首屏顶部，人不开会话也看得见「有人在等」。 */
.dsh-pm-pending-band {
  margin: 0 0 var(--s4) 0; padding: var(--s3) var(--s4);
  border: 1px solid var(--pm-warn-border, rgba(214,138,0,.45));
  border-radius: 8px;
  background: var(--pm-warn-bg, rgba(214,138,0,.08));
}
.dsh-pm-pending-band-head {
  font-size: var(--f-small); font-weight: 600; margin-bottom: var(--s2);
}
.dsh-pm-pending-row {
  display: flex; align-items: center; gap: var(--s2);
  padding: var(--s2) 0;
  font-size: var(--f-small);
}
.dsh-pm-pending-row + .dsh-pm-pending-row { border-top: 1px solid var(--dsw-border, rgba(128,128,128,.12)); }
.dsh-pm-pending-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 🔔 前缀与超时安抚句（原型 #FR-5 的票行形状：🔔 门名 · REQ-id … 已超时 —— 票仍有效，可一键重投） */
.dsh-pm-pending-bell { flex: 0 0 auto; }
.dsh-pm-pending-note { flex: 0 0 auto; color: var(--pm-text2); font-size: var(--f-tiny); }
.dsh-pm-pending-countdown { font-variant-numeric: tabular-nums; color: var(--pm-text2); }
.dsh-pm-pending-row[data-timed-out="yes"] .dsh-pm-pending-countdown { color: var(--dsw-danger, #d9534f); font-weight: 600; }
.dsh-pm-pending-error { color: var(--dsw-danger, #d9534f); font-size: var(--f-small); }
/* ══════════════════════════════════════════════════════════════════════════
`
