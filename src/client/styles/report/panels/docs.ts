/**
 * panels · docs.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放文档面板；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const DOCS_CSS = `   ⑦ 文档 Tab（docs）：面板小标题 + table.t + 清单 / 生成物 / 其它发现 / 核验 / 门禁 / 归档
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


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：20 条，只服务 docs ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-weight: 600; }

/* ── FR-6/FR-7 文档Token提示词密度与 DAG 适配（REQ-261006130057-7a43 t8）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5：
     · FR-6 文档面板：三分节紧凑表（类型/路径/登记时间/状态/打开）——路径列**短名**纯文本（等宽，
       D-12：完整路径进 title），状态列短词 chip（彩字 + 发丝描边，长解释进 title），
       打开入口独立成列（灰字链接式小按钮，原型 .open-link），分节头/副题取原型的紧凑字阶；
     · FR-6 Token 面板：四张汇总卡（原型 .stat-grid）+ 按节点表数字等宽右对齐（原型 .dt td.r）；
     · FR-6 提示词面板：注入信息 chips（原型 .info-strip/.chip）+ 被裁片段「已截断」标
       （原型 .frag .f-trim 琥珀字）；
     · FR-7 DAG 面板：画布组件不动——只适配容器（通栏去多余内边距）+ 顶部工具行
       （原型 .dag-toolbar：−/100%/＋/适应窗口 disabled 占位 + 四态图例色点带文字标签）
       + 无任务空态单独成块（原型 .de-box 虚线框）。
   令牌纪律：规则体只引 --pm-* 令牌与既有一档表（--s 系列 / --r1 / --f- 系列 / --lh- 系列）；
   四态图例色点按 data-dot 上色，全部取自既有语义令牌（--pm-line-strong/--pm-accent/
   --pm-ok/--pm-danger），不写裸色值。本块置于片尾：同特异性下后者胜。 */

/* ① 文档三分节紧凑表：路径格纯文本**短名**（等宽、可折行），状态列短词 chip，打开列独立
      ——D-10/D-12 验收期返工：显示口径照原型 detail.html v1.5 #panel-docs 逐列对齐
      （路径短名 / 状态短词 chip / 灰字「打开」/ 分节头紧凑），完整路径与长解释退到 title。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-filepath {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text); word-break: break-all;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-doc-filepath.dsh-pm-doc-missing { color: var(--pm-text2); }

/* 「打开」列 = 原型 .open-link：**灰字**、无下划线，hover **只加下划线**（不改字色、也不是蓝字链接）。
   位置仍写在末尾（同特异性下后者胜），压掉 ⑲ 设计契约层给按钮的通用档。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open {
  font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; background: none; color: var(--pm-text2); white-space: nowrap;
  /* 命中区 ≥24（t9 复核 P1-1）：f32f t-0d8c9b 已把行内链接纳入 --pm-target 口径；
     垂直堆叠列无 WCAG 相邻间距例外可援，故直接加高（视觉几乎不变）。 */
  display: inline-flex; align-items: center; min-height: var(--pm-target);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open:hover:not([disabled]) { text-decoration: underline; }

.dsh-pm-detail[data-report-shell] .dsh-pm-doc-open[disabled] { color: var(--pm-text3); cursor: default; }

/* ①b 状态列 = **短词 chip**（原型 .mini-state.ok/.wait/.auto；本面板五态）。
   底色口径：**不给浅底**——FR-10 (二) 定「底色只两档：白 + --pm-bg-soft」，同色 tint 三值令牌
   至今「备而未用」；故 chip 用「语义文字色 + currentColor 发丝描边 + 小圆角」表达，既不引新色值，
   也不给五块浅底。长解释（为什么是这个状态）在 chip 的 title 里，格子里只留短词。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state {
  display: inline-block; padding: 0 var(--s1); border-radius: var(--s1);
  border: var(--pm-hair) solid currentColor;
  font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 500; white-space: nowrap;
  color: var(--pm-text2);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state[data-doc-state-text="confirmed"] { color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state[data-doc-state-text="pending"] { color: var(--pm-warn-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state[data-doc-state-text="file-missing"] { color: var(--pm-danger); }

/* 未登记 / 未判定 = 中性灰：两者靠**文字**分辨（"未登记"≠"判不了"，REQ-261005143615-5ab1 FR-3） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state[data-doc-state-text="unregistered"],
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-doc-state[data-doc-state-text="unknown"] { color: var(--pm-text2); }

/* ①c 分节头与副题的紧凑档（原型 .blk-title 13px / .blk-hint 11px、行高同档）：
   只落在三个文档分节上——门禁留痕节与归档块的块头**不在此列**（原样不动）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="documents"] > .dsh-pm-block-head,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="generated"] > .dsh-pm-block-head,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="discovered"] > .dsh-pm-block-head {
  line-height: var(--lh-tiny);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="documents"] > .dsh-pm-block-head > .dsh-pm-block-title,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="generated"] > .dsh-pm-block-head > .dsh-pm-block-title,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="discovered"] > .dsh-pm-block-head > .dsh-pm-block-title {
  font-size: var(--f-body); line-height: var(--lh-body);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="documents"] > .dsh-pm-block-head > .dsh-pm-hint,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="generated"] > .dsh-pm-block-head > .dsh-pm-hint,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-doc-section="discovered"] > .dsh-pm-block-head > .dsh-pm-hint {
  font-size: var(--f-tiny); line-height: var(--lh-tiny);
}

/* 「打开」列宽：固定布局下不给宽会被平均分掉 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(5) { width: 64px; }

/* 生成物表（无表头，四列）：名称 / 路径 / 状态 / 打开 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(1) { width: 200px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(3) { width: 130px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-generated-table] td:nth-child(4) { width: 64px; }

/* 其它发现表（无表头，四列）：类型 / 计数 / 样例 / 余量说明 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-discovered-table] td:nth-child(2) { width: 72px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-discovered-table] td:nth-child(4) { width: 220px; }

/* ── 归位自其它分片（REQ-261007133149-0716 t4 收尾遍）：11 块，只服务 docs ──
   声明逐字保留，只换了住处。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-review { font-size: var(--f-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pass"] { color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pending"] { color: var(--pm-warn-text); }

/* 列宽：把余量留给长文本列（路径 / 意见 / 证据）——固定布局下不给宽就会被平均分掉 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(1) { width: 84px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(3) { width: 110px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(4) { width: 190px; }

/* 核验表（7 列）已随「核验 · 验收单」独立为「验收」Tab 删除（REQ-261006130057-7a43 FR-8 / T-6）：
   docs 面板不再渲染 data-verify-table，原七列逐列宽规则一并退役；验收侧表样式见片尾
   「── FR-8 验收面板 RTM 列表 ──」块。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(1) { width: 108px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(2) { width: 96px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(3) { width: 96px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(4) { width: 100px; }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(5) { width: 110px; }
/* ══════════════════════════════════════════════════════════════════════════
`
