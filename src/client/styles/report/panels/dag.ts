/**
 * panels · dag.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放DAG 面板（详情页内收口）；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const DAG_CSS = `   ⑪ DAG Tab：原型 .dchip / 每步执行结果表（画布本身沿用既有 .dsh-pm-dag-* 分片，不在这里重定义）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-report-dag { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-summary {
  display: flex; flex-wrap: wrap; gap: var(--s1) var(--s4); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
  font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums;
}
/* 落点③ 子卡链未生成汇总（REQ-261006211623-9dc1 FR-6，design/frontend.md §六 第 3 条）：
   与落点①②同源色值（#991b1b）；按原型 .dag-summary .hot（dag-chain-missing.html:125）只上色 + 加粗，
   不额外加背景——汇总条是三处里最克制的出口，文字「子卡链未生成 N 张」是主载体。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-summary [data-dag-chain-missing] {
  color: #991b1b; font-weight: 600;
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


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：16 条，只服务 dag ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

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

.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="done"] { background: var(--pm-ok-text); }

/* 复核 P1-1：--pm-ok 已并入 -text 档，悬空引用会让「完成」色点透明隐形 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-dot[data-dot="blocked"] { background: var(--pm-danger); }

/* 无任务空态：单独成块（原型 .de-box 虚线框居中文案） */
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-empty {
  border: 1px dashed var(--pm-line-strong); border-radius: var(--r1);
  padding: var(--s4); text-align: center; color: var(--pm-text2); font-size: var(--f-small);
}

/* ④ DAG 面板（原型 .dag-toolbar + .dag-canvas-ph 合成一张卡）：工具行在上、画布在下 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-dag {
  background: var(--pm-surface);
  border: var(--pm-card-line) solid var(--pm-line);
  border-radius: var(--r1);
  overflow: hidden;
}

/* ── 归位自其它分片（REQ-261007133149-0716 t4 收尾遍）：1 块，只服务 dag ──
   声明逐字保留，只换了住处。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th { white-space: normal; }
/* ══════════════════════════════════════════════════════════════════════════
`
