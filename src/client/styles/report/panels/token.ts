/**
 * panels · token.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放Token 面板；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const TOKEN_CSS = `   ⑨ Token Tab：原型 .panel h4 / table.t / .opt / .opt-i
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel { display: block; min-width: 0; }.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h
{
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: var(--s4) 0 var(--s2); font-size: var(--f-h2); font-weight: 600; color: var(--pm-text);
}.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel > .dsh-pm-tok-h:first-of-type
{ margin-top: 0; }.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h-note
{ font-size: var(--f-small); font-weight: 400; color: var(--pm-text2); }
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

/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：19 条，只服务 token ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub td { color: var(--pm-text2); }

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

/* ②b 按节点表（D-10 逐列对齐原型「#tab-token」）：
   · 数字列（th/td 同标 .dsh-pm-tok-num）等宽右对齐 = 原型 table.dt 的 .r；
   · 阶段列用等宽小字（原型写的是阶段键 draft / implementing，不是中文名）；
   · 「未采集」格与无快照行走 .dsh-pm-nosnap 的灰（色只落在文字上）；
   · 任务执行明细收进**默认收起**的 details：一行一个节点的节奏不被明细冲散。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th.dsh-pm-tok-num { text-align: right; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stage {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); white-space: nowrap;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-row > td { padding: 0 var(--s3) var(--s2); }

.dsh-pm-detail[data-report-shell][data-report-shell] details.dsh-pm-tok-exe > summary {
  padding: var(--s1) 0; font-size: var(--f-tiny); color: var(--pm-text2);
}

.dsh-pm-detail[data-report-shell] details.dsh-pm-tok-exe .dsh-pm-fold-body { border-top: 0; padding: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub {
  display: flex; align-items: baseline; gap: var(--s2);
  padding: 1px 0; font-size: var(--f-tiny); color: var(--pm-text2);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-id { font-family: var(--pm-mono); }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-title { color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-num { margin-left: auto; font-variant-numeric: tabular-nums; }

/* 「快照齐」是一句**状态**不是一块告警：收成一行小字（去掉块状边线与内边距） */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-avail[data-availability-badge="full"] {
  border: 0; padding: 0; background: none; color: var(--pm-text2);
}

/* 上卷行（合计（本条） / 费用估算 / 墙钟 …）：一行小字，与原型同层级的次要信息 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-rollup { margin: 0; }

/* ③ Token 四张汇总卡（原型 .stat）：描边由发丝提到 1px——白面 + 发丝 = 看不出是卡 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-stat { border: var(--pm-card-line) solid var(--pm-line); }

/* ── 归位自其它分片（REQ-261007133149-0716 t4 收尾遍）：8 块，只服务 token ──
   声明逐字保留，只换了住处。 */

/* 按节点表列宽（原型 7 列：节点 / 阶段 / 输入 / 输出 / 缓存命中 / 合计 / 时长）
   —— 固定布局下不写死就被平均分掉，等宽数字列会挤成一坨 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(1) { width: 26%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(2) { width: 14%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(3) { width: 12%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(4) { width: 12%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(5) { width: 12%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(6) { width: 12%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table[data-stage-table] th:nth-child(7) { width: 12%; }

@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-tok-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* ══════════════════════════════════════════════════════════════════════════
`
