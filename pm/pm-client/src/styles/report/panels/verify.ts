/**
 * panels · verify.ts —— 验收面板外观（REQ-261007133149-0716 · 组件 C-8）
 *
 * 归属：DOM 根 [data-panel="verify"]；前缀见 report/manifest.ts 的 verify 条。
 * 来源：t4「覆盖层按组件归位」新建——原先散在 shared.ts 的 ⑲ 契约落地层 / FR-8 RTM 列表，
 * 以及 panels/docs.ts 的 ⑦ 文档段里（原型 anatomy.html ⑦ 卡的 ⚠ 就是它）。
 * 纪律：声明**逐字保留**，只换了住处；组装顺序变化由判据一（逐组件计算样式快照）守着。
 *
 * 拼接约定（与其它分片同款）：开头收掉 docs.ts 留下的段落头，结尾自己开一个交给 dialogue.ts 收。
 */
export const VERIFY_CSS = `   ⑪b 验收面板（verify）：验收单逐项 + RTM 列表（FR 覆盖矩阵 / 可折叠分组）
   ──────────────────────────────────────────────────────────────────────────
   验收面板的表语汇沿用 ⑦ 文档段；本段是它**自己的**外观。
   ══════════════════════════════════════════════════════════════════════════ */


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：46 条，只服务 verify ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

/* ══════════════════════════════════════════════════════════════════════════
   ── FR-8 验收面板 RTM 列表（REQ-261006130057-7a43 t3）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5
   的「#tab-verify」面板（.rtm-progress / table.dt 五列 / .cov / .verdict / tr.rtm-detail /
   .ver-sum / .ev-list / .hist-row / .verify-empty）。原型是 zoom:.78 的缩小示意，
   本片按**正常尺寸**落（字阶全走 --f-* 槽位）。对应渲染 = views/panels/verify.ts：
     汇总行（进度 + 版本/待裁决 chip）→ 五列主表（FR / 覆盖链 / 怎么验 / 验收状态 / 裁决·意见，
     无 tracking/coverage 时覆盖链列整体不渲染）→ 行展开逐项（原生 details）→ 材料 → 历史 → 空态。
   纪律与全片一致：只引 --pm-* 令牌，无裸色值、无裸毫秒；语义 chip 走「彩色真文字 +
   发丝描边（currentColor）」，不铺第三档底色（FR-10 (二)：底色只两档——白 + --pm-bg-soft）。
   ══════════════════════════════════════════════════════════════════════════ */

/* 面板根：块级容器（六面板同约定——壳只写 data-tab-host，面板根自带 data-panel） */
.dsh-pm-detail[data-report-shell] .dsh-pm-verify { display: block; min-width: 0; }

/* ① 汇总行（原型 .rtm-progress）：进度数 + 版本/待裁决 chip + 降级说明，一行可折 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-progress {
  display: flex; align-items: baseline; gap: var(--s1) var(--s3); flex-wrap: wrap;
  margin: 0 0 var(--s2); font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-progress b { font-weight: 600; }

/* ② 主表列宽（原型 table.dt 五列）：长文本列（怎么验 / 裁决）吃余量，短列钉宽。
   两套：有覆盖链 = 5 列；增强层降级（data-rtm-fallback）= 4 列（覆盖链列整列不渲染）。
   D-10 返工把 FR 列从「只编号」改成「编号 + 名称」（原型同态），故 FR 列由 11% 加宽到 16%，
   那 5% 从「怎么验」列挪（该列本就单行截断 + title 全文，少 5% 不丢字）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table th:nth-child(1) { width: 16%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table[data-rtm-cols="5"] th:nth-child(2) { width: 16%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table[data-rtm-cols="5"] th:nth-child(3) { width: 21%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table[data-rtm-cols="5"] th:nth-child(4) { width: 15%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table[data-rtm-cols="4"] th:nth-child(2) { width: 27%; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table[data-rtm-cols="4"] th:nth-child(3) { width: 18%; }

/* FR 号（原型 .rtm-fr）：等宽加粗、不换行 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-fr-id {
  font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 600;
  color: var(--pm-text); white-space: nowrap;
}

/* FR 名称（原型 .rtm-name；D-10 返工：载荷有 frNames 才渲染，缺省只留编号）：
   次要字色、跟在编号之后。原型该列 nowrap，本实现**允许折行**——FR 列宽有限，
   一整条长名称 nowrap 会在窄档（900）撑出新的横向溢出源（探针 A2 会判红），
   折行不丢字，全文另在 title 上。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-name {
  color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  margin: 0 0 0 var(--s1); white-space: normal; overflow-wrap: anywhere;
}

/* D-10 返工（按 FR 成行）：行首展开指示符（原型 .rtm-toggle 的 ▸——本实现的展开器是下一行的
   原生 details，故此符只是视觉指示，不承载交互：无 data-action、aria-hidden、不可聚焦） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-toggle {
  color: var(--pm-accent-text); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  margin: 0 var(--s1) 0 0;
}

/* 「需求级 / 对照项」行（归不进任何 FR 追溯链的项）：淡底 + 次要字色，与 FR 行一眼可分；
   来源标沿用逐项同款 .dsh-pm-src-tag（原始枚举在 data-source-kind） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table tr[data-fr-group="aux"] > td {
  background: var(--pm-bg-soft); color: var(--pm-text2);
}

/* 覆盖链 chip（原型 .cov.ok / .cov.miss）：✓/✗ 是真实文本（不靠颜色单一表达），
   视觉 = 彩色文字 + 发丝描边（currentColor），不铺底色。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-cov {
  display: inline-flex; align-items: center; white-space: nowrap;
  font-size: var(--f-tiny); font-weight: 600; line-height: var(--lh-tiny);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1);
  padding: 0 5px; margin: 0 var(--s1) var(--s1) 0;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-cov[data-cov-ok="yes"] { color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-cov[data-cov-ok="no"] { color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-cov { white-space: nowrap; }

/* 怎么验格（原型 .rtm-ver）：单行省略截断，全文在 title（截断交给 CSS，文本不丢字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-ver {
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 验收状态 chip（原型 .verdict 三态扩到五态：pass/fail/pending + unverified + 全不可验收）；
   行展开逐项的 data-v 是台账原值（passed/failed/…），两套值同一套颜色口径。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-verdict {
  display: inline-block; white-space: nowrap;
  font-size: var(--f-tiny); font-weight: 600; line-height: var(--lh-tiny);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="pass"],
.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="passed"] { color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="fail"],
.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="failed"] { color: var(--pm-danger); }

.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="pending"],
.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="unverified"] { color: var(--pm-warn-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="nv"],
.dsh-pm-detail[data-report-shell] .dsh-pm-verdict[data-v="not_verifiable"] { color: var(--pm-text2); }

/* 「无法自验·需人工」旗标（原型 .nh-flag 琥珀）：行级与逐项共用一款 */
.dsh-pm-detail[data-report-shell] .dsh-pm-nh-flag {
  display: inline-block; white-space: nowrap;
  font-size: var(--f-tiny); line-height: var(--lh-tiny); color: var(--pm-warn-text);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px;
}

/* 来源标（原型 .src-tag）：等宽小灰字，原始枚举在 data-source-kind（审计/断言认它） */
.dsh-pm-detail[data-report-shell] .dsh-pm-src-tag {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); white-space: nowrap;
}

/* 裁决 · 意见列：已裁决留痕行（原型 .rtm-judge 11px 灰）+ 待裁决控件（复用 board.ts 的
   .dsh-pm-vitem / .dsh-pm-vitem-opinion 基件，这里只补表内间距与单选形态） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-judge {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); color: var(--pm-text2);
  padding: var(--s1) 0; word-break: break-word;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-vitem { margin: 0 0 var(--s2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-vitem:last-child { margin-bottom: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-vitem-id {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
  margin: 0 var(--s2) 0 0; word-break: break-all;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-verdict-btn {
  display: inline-flex; align-items: center; gap: var(--s1); cursor: pointer;
  font-size: var(--f-small); min-height: var(--pm-target); margin: 0 var(--s2) var(--s1) 0;
}

/* 意见输入框：基件（styles/board.ts 的 .dsh-pm-vitem-opinion）写死 min-width: 260px——
   看板那一栏有整行可用宽，260 是"别缩成一条缝"的下限；但在详情页窄窗里，裁决格可能只剩
   ~200px，260 会把整行顶出卡外（实测 vw=900 时壳内横向溢出 123px、壳出现横向滚动条）。
   本页只把**下限**去掉（不设 min-width、铺满格子），其余外观照基件——不改 board.ts 那一片
   （它的长相属于看板）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-vitem-opinion {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box; max-width: 100%;
}

/* 提交裁决条：与主表一道发丝线隔开，按钮 + 口径说明同行可折 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-submit {
  display: flex; align-items: center; gap: var(--s2) var(--s3); flex-wrap: wrap;
  margin: var(--s2) 0 0; padding: var(--s2) 0 0; border-top: var(--pm-hair) solid var(--pm-line);
}

/* ③ 行展开（原型 tr.rtm-detail td）：分组底 + 顶部虚线 + 缩进；展开器是原生 details */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-detail-row > td {
  background: var(--pm-bg-soft); border-top: var(--pm-hair) dashed var(--pm-line);
  padding: var(--s2) var(--s3) var(--s2) var(--s5);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-detail > summary {
  cursor: pointer; font-size: var(--f-small); line-height: var(--lh-small);
  color: var(--pm-accent-text); padding: var(--s1) 0; min-height: var(--pm-target);
}

/* 展开里的一条验收项：头行（id + 来源标 + 状态 chip）+ 逐行字段（标准/实际结果/需人工/证据/意见） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-item {
  padding: var(--s2) 0; border-top: var(--pm-hair) solid var(--pm-line);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-detail > .dsh-pm-rtm-item:first-of-type { border-top: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-item-head {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s1) var(--s2);
  margin: 0 0 var(--s1);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rtm-item-line {
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text);
  padding: 1px 0; word-break: break-word;
}

/* ④ 验收材料（原型 .ver-sum / .ev-list）：交付结论一段 + 证据逐条 */
.dsh-pm-detail[data-report-shell] .dsh-pm-ver-sum {
  margin: 0 0 var(--s2); font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-ev-list {
  margin: 0; padding-left: var(--s4); font-size: var(--f-small); color: var(--pm-text2);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-ev-list li { padding: 1px 0; word-break: break-all; }

/* ⑤ 历史版本（原型 .hist-row）：版本号等宽 + 主导状态 chip + 说明，行间发丝线 */
.dsh-pm-detail[data-report-shell] .dsh-pm-hist-row {
  display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap;
  font-size: var(--f-small); padding: var(--s1) 0; border-top: var(--pm-hair) solid var(--pm-line);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-block-head + .dsh-pm-hist-row { border-top: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-h-ver {
  flex: none; font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 600;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-h-note { flex: 1 1 auto; min-width: 0; color: var(--pm-text2); }

/* ⑥ 空态（原型 .verify-empty / .ve-rows）：加粗引导词 + 解释，逐行铺开不画空表格 */
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-empty { padding: var(--s2) 0; }

/* ── 归位自其它分片（REQ-261007133149-0716 t4 收尾遍）：4 块，只服务 verify ──
   声明逐字保留，只换了住处。 */

.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict {
  font-size: var(--f-tiny); font-weight: 600; padding: 0; border-radius: 0;
  background: none; color: var(--pm-text2);
}

/* 裁决三态：色只落在**文字**上（结论词 / 错误文字），不再各配一块 12% 浅底（FR-10 (二)）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="passed"] { background: none; color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="failed"] { background: none; color: var(--pm-danger); }

.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="pending"] { background: none; color: var(--pm-warn-text); }
/* ══════════════════════════════════════════════════════════════════════════
`
