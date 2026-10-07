/**
 * panels · trunk.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放汇报面板；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const TRUNK_CSS = `   ⑥ 汇报 Tab（trunk）：原型 .row / .rail / .body-col / .sum
   ——七条 = **上下结构**（标题行 → 正文 → 可选引用行），模块之间 36px、模块内 8px（FR-12 B/C）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-docmeta {
  font-size: var(--f-small); color: var(--pm-text2); padding: 0 0 var(--s2);
}
/* 一条 = **一个模块**，改上下结构（FR-12 C）：① 标题行（L2 标题 + 右侧来源标）② 正文（L3）③ 可选引用行（L4 + 主色「点开看原文 →」）。
   原型旧写法是"左 --rail 标题栏 + 右内容栏"的 grid，读起来像表格（D-7 的核心反馈就是"每个模块不够有层次"）。
   边界信号：**卡片本身**（片尾 ㉑ 卡片语汇：白面 + 1px 描边 + 圆角 + 内边距）+ 标题行；
   2026-10-07 人反馈「原型都是卡片，实现的没有卡片、乱乱的」→ 模块由「36px 留白 + 标题行」
   改为原型 .t-mod 的卡片式，36px 留白口径随之退役（本条只留布局位，外观在 ㉑）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item {
  display: block;
  margin: 0 0 var(--pm-space-module); padding: 0; border: 0;
  border-radius: 0; background: none;
}
/* 平铺时代有一条 .dsh-pm-trunk-item:first-of-type { border-top: 0 }（第一条的上边线与上方内容重复）。
   **卡片化后已删除**（2026-10-07 卡片语汇 ②）：每张卡都要四条边，留着这条第一张卡就缺上边。
   模块的全部外观（白面 / 1px 描边 / 圆角 / 内边距）统一在片尾 ㉑，这里只留布局位。 */
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


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：18 条，只服务 trunk ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-body { line-height: var(--lh-body); }

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line { line-height: var(--lh-body); }

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-title { font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 600; }

.dsh-pm-detail[data-report-shell] .dsh-pm-src, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src { font-size: var(--f-tiny); line-height: var(--lh-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing { padding: 0; border: 0; border-radius: 0; font-size: var(--f-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="agent"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="doc"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="auto"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="ledger"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="new-section"], .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="human"], .dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="human"] { background: none; border: 0; color: var(--pm-text2); }

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

/* ② 汇报模块（原型 .t-mod）：网格项 → 卡片；格间距仍由 .dsh-pm-trunk-grid 的 gap 承担 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item {
  padding: var(--pm-card-pad-y) var(--pm-card-pad-x);
  background: var(--pm-surface);
  border: var(--pm-card-line) solid var(--pm-line);
  border-radius: var(--r1);
}

/* ── 归位自其它分片（REQ-261007133149-0716 t4 收尾遍）：3 块，只服务 trunk ──
   声明逐字保留，只换了住处。 */

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

.dsh-pm-detail[data-report-shell] .dsh-pm-evidence-missing { font-size: var(--f-small); font-weight: 600; color: var(--pm-danger); }

/* ── 归位自公共层条件组（REQ-261007133149-0716 t4）：窄档里只服务 trunk 的那条 ── */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-grid { grid-template-columns: 1fr; }
}
/* ══════════════════════════════════════════════════════════════════════════
`
