/**
 * pmboard 样式分片 · report（需求详情页「工作汇报」壳，REQ-261004222448-292a）。
 *
 * 分片边界（谁该往这里写）：
 *  - **只放详情壳自己的东西**：常驻头部段 / 状态带段 / Tab 栏段 / 面板包装器（`data-tab-host`）
 *    与六个面板共同的排版约定；
 *  - 六个面板的**专属**类名（`.dsh-pm-trunk*` / `.dsh-pm-docs*` …）按同一约定续写在本分片末尾
 *    （它们是同一棵 DOM 树上的东西，拆成六片只会让"同一处改样式"变成六处）；
 *  - 纯新增区段，**不改既有选择器**（拼接顺序见 `styles.ts`：本片追加在末尾）。
 *
 * 两条**必须保住**的基础规则（在最上面，别删）：
 *  - `.dsh-pm-tab-panel { display: block }`：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动）；
 *  - 对话面板的页内检索靠 `hidden` 属性 + `data-msg-hit` 双判据隐藏不命中的消息，而既有分片里若有
 *    `display` 规则盖在那些节点上，`[hidden]` 就会失效（浏览器默认 `[hidden]{display:none}` 是**最弱**
 *    的一条，任何 `display: block/flex` 都能盖掉它）。因此这里把隐藏规则显式钉死。
 *
 * 下面按六块续写：① 常驻头部 ② 状态带三格 ③ Tab 栏 ④ 六个面板的排版（含宽表 / 正文块 / 对话气泡）
 * ⑤ 反应付（无证据亮点）⑥ 各面板的块级排版。**全片不含任何内层滚动**——没有限高、也没有轴向滚动条；
 * 能用既有分片的类就复用（`.dsh-pm-btn` / `.dsh-pm-doc-path` / `.dsh-pm-tok-table` / `.dsh-pm-dag-*` …），
 * 本片只补壳与六个面板自己的类名，不重复定义已有选择器。
 */
export const REPORT_CSS = `
/* 详情壳：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动） */
.dsh-pm-tab-panel { display: block; }

/* 对话面板页内检索：不命中的消息必须真的看不见（双判据，防被别处的 display 规则盖掉） */
.dsh-pm-msg[hidden],
.dsh-pm-msg[data-msg-hit="0"] { display: none; }

/* ═══ ① 常驻头部（FR-3 / FR-12）：身份与状态徽标 · 阶段条 · 停留时长 · 一句话结论 · 操作条 · 窗口跳转 ═══
   这一块解决什么：头部是整页唯一常驻不折叠的一段，读者要在一屏内读完「这是什么需求 / 走到哪一步 /
   现在最要紧的一句 / 我能不能动手」。所以字段有轻重：结论最显眼，操作按钮带后果说明与「需人操作」标。 */
.dsh-pm-detail-head[data-report-head] { gap: 8px 10px; padding: 2px 0 6px; }
.dsh-pm-report-meta { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-meta[data-blocked-reason] { color: #b42318; font-weight: 600; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-detail-title { line-height: 1.3; letter-spacing: -.01em; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-card-id { flex: none; }
/* 8 态阶段条：外观仍归既有 .dsh-pm-dot*，这里只把「当前态」加重（在哪一步必须一眼看出） */
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot-wrapper.current .dsh-pm-dot { box-shadow: 0 0 0 3px rgba(74,125,255,.22); }
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot-wrapper.current .dsh-pm-dot-label { font-weight: 700; color: #4a7dff; }
/* 一句话结论：一屏内最重要的一句，独占一行、加粗、左侧主色条 */
.dsh-pm-report-verdict {
  flex-basis: 100%; font-size: 15px; font-weight: 600; line-height: 1.6;
  color: var(--dsw-text-primary, #1d1d1f);
  background: linear-gradient(135deg, rgba(74,125,255,.10), rgba(74,125,255,.02));
  border: 1px solid rgba(74,125,255,.28); border-left: 4px solid #4a7dff;
  border-radius: 8px; padding: 10px 14px;
}
/* 有人在等（waitingHuman > 0）→ 结论条转告警色：那是行动信号，不是叙述 */
.dsh-pm-report-verdict:not([data-waiting-human="0"]) {
  background: linear-gradient(135deg, rgba(240,160,32,.14), rgba(240,160,32,.03));
  border-color: rgba(240,160,32,.45); border-left-color: #f0a020;
}
.dsh-pm-report-next { flex-basis: 100%; font-size: 12px; color: var(--dsw-text-secondary, #6e6e73); }
/* 操作条 + 窗口跳转：各自独占一行；每个动作竖排成块（按钮 / 需人操作标 / 后果说明） */
.dsh-pm-report-actions, .dsh-pm-report-windows { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 10px 14px; padding-top: 8px; }
.dsh-pm-report-actions { border-top: 1px dashed var(--pm-line, rgba(128,128,128,.28)); }
.dsh-pm-report-windows { align-items: center; }
.dsh-pm-report-action { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; max-width: 280px; }
.dsh-pm-report-action .dsh-pm-btn { flex: none; }
.dsh-pm-action-consequence { font-size: 11px; line-height: 1.45; color: var(--dsw-text-secondary, #888); }
/* humanOnly：「需人操作」是警告标（agent 调用会被代码级拒绝），不是装饰，所以显式着色 */
.dsh-pm-human-only {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px;
  background: rgba(220,53,69,.12); color: #b42318; border: 1px solid rgba(220,53,69,.3);
}

/* ═══ ② 状态带三格（FR-4 / FR-5）：做到哪了 · 缺口清单 · 结果与成效 ═══
   这一块解决什么：三格常驻、都不折叠；缺口按 🔴🟡⚪ 三档可区分（圆点之外再给左侧色条与底色，
   色弱 / 打印也分得出）；「无缺口」是一条正向结论行，不是空表。 */
.dsh-pm-stats[data-report-band] { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: start; gap: 12px; }
.dsh-pm-report-band-body { font-size: 13px; line-height: 1.75; color: var(--dsw-text-primary, #333); word-break: break-word; }
.dsh-pm-band-ok { color: #1e7e34; font-weight: 600; }
.dsh-pm-band-mut { color: var(--dsw-text-secondary, #888); }
.dsh-pm-gap-line {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  margin: 4px 0; padding: 6px 9px; border-radius: 6px;
  background: var(--dsw-bg-secondary, rgba(128,128,128,.05));
  border-left: 3px solid var(--pm-line, #d0d5dd);
}
.dsh-pm-gap-line[data-severity="red"] { border-left-color: #dc3545; background: rgba(220,53,69,.07); }
.dsh-pm-gap-line[data-severity="yellow"] { border-left-color: #f0a020; background: rgba(240,160,32,.08); }
.dsh-pm-gap-line[data-severity="gray"] { border-left-color: #b0b4bb; }
.dsh-pm-gap-what { font-weight: 600; }
.dsh-pm-gap-why { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-gap-ref {
  font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: rgba(128,128,128,.12); color: var(--dsw-text-secondary, #555); word-break: break-all;
}
.dsh-pm-gap-more { font-size: 12px; color: var(--dsw-text-secondary, #888); margin-top: 6px; }
/* 结果与成效：结论 → 逐项计数 → 遗留问题与后续 */
.dsh-pm-outcome-verdict { font-size: 13px; font-weight: 700; }
.dsh-pm-outcome-verdict[data-outcome="pass"] { color: #1e7e34; }
.dsh-pm-outcome-verdict[data-outcome="rework"] { color: #b42318; }
.dsh-pm-outcome-verdict[data-outcome="pending"] { color: #8a5a00; }
.dsh-pm-outcome-counts { font-variant-numeric: tabular-nums; }
.dsh-pm-outcome-leftover-title { display: block; margin-top: 6px; font-weight: 700; }
.dsh-pm-outcome-leftover {
  font-size: 12.5px; line-height: 1.6; margin: 4px 0; padding: 5px 9px; word-break: break-word;
  border-left: 3px solid rgba(240,160,32,.7); background: rgba(240,160,32,.07); border-radius: 0 6px 6px 0;
}

/* ═══ ③ Tab 栏（FR-11）：六个同级 Tab 的选中态与角标数字 ═══
   这一块解决什么：六个 Tab 是同级关系，选中态必须显眼（壳标的是 active 类），角标数字是小圆标
   （没有数字就不渲染角标，所以只写带 data-badge 的那一支）。基座外观复用 files.ts 的 .dsh-pm-tabs，
   这里只把内边距归零（外层 .dsh-pm-detail 已有页面留白）并压紧字号。 */
.dsh-pm-tabs[data-report-tabs] { flex-wrap: wrap; gap: 2px; padding: 0; margin-top: 2px; }
.dsh-pm-tabs[data-report-tabs] .dsh-pm-tab { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; font-size: 13px; }
.dsh-pm-tab-icon { font-size: 13px; line-height: 1; }
.dsh-pm-tabs[data-report-tabs] .dsh-pm-fold-count[data-badge] {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px;
  font-size: 10px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums;
  background: rgba(128,128,128,.18); color: var(--dsw-text-secondary, #666);
}
.dsh-pm-tabs[data-report-tabs] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] { background: #4a7dff; color: #fff; }

/* ═══ ④ 六个面板的排版（FR-11 #7：一律铺开，长了走页面滚动）═══
   这一块解决什么：六个面板各自的类名此前只有壳、没有样式，读起来是一坨堆叠的文本。
   统一给「面板 = 纵向块 + 块间距」，再单独处理三类最容易坏的东西：宽表 / 代码正文块 / 对话气泡。 */
.dsh-pm-tab-panel[data-tab-host] { padding-top: 12px; }
.dsh-pm-trunk, .dsh-pm-docs, .dsh-pm-report-dag, .dsh-pm-dialogue, .dsh-pm-token-panel, .dsh-pm-prompts {
  display: flex; flex-direction: column; gap: 14px; min-width: 0;
}
/* 宽表（文档清单 / 核验表 / 门禁表 / 每步执行结果）：定宽布局 + 断词。
   长路径与长证据串是无空格 monospace，会横向撑破容器 → 一律 break-all（t-98684c 的探针断言无横向溢出）。 */
.dsh-pm-docs-table, .dsh-pm-report-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12.5px; }
.dsh-pm-docs-table th, .dsh-pm-docs-table td,
.dsh-pm-report-table th, .dsh-pm-report-table td {
  padding: 7px 8px; text-align: left; vertical-align: top;
  border-bottom: 1px solid var(--pm-line, #e5e7eb); word-break: break-word;
}
.dsh-pm-docs-table th, .dsh-pm-report-table th {
  font-size: 11.5px; font-weight: 600; color: var(--dsw-text-secondary, #888);
  background: var(--dsw-bg-secondary, rgba(128,128,128,.06));
}
.dsh-pm-docs-table code, .dsh-pm-docs-table .dsh-pm-doc-path,
.dsh-pm-report-table code, .dsh-pm-doc-cell-path { word-break: break-all; }
.dsh-pm-docs-table tbody tr:last-child td, .dsh-pm-report-table tbody tr:last-child td { border-bottom: none; }
.dsh-pm-doc-row.is-missing { background: rgba(128,128,128,.05); }
/* 宽表行悬停：列多行密，悬停才分得清读到哪一行的哪一列 */
.dsh-pm-docs-table tr.dsh-pm-doc-row:hover,
.dsh-pm-report-table tr.dsh-pm-report-step:hover { background: var(--dsw-hover, rgba(128,128,128,.06)); }
/* 窄列显式给宽：把余量留给「路径 / 证据 / 意见」这些长文本列 */
.dsh-pm-doc-cell-kind { width: 92px; }
.dsh-pm-doc-cell-time { width: 118px; }
.dsh-pm-doc-cell-state { width: 168px; }
.dsh-pm-doc-state { font-size: 11.5px; }
.dsh-pm-verify-verdict { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 10px; background: rgba(128,128,128,.12); }
.dsh-pm-verify-verdict[data-verify-verdict="passed"] { background: rgba(40,167,69,.15); color: #1e7e34; }
.dsh-pm-verify-verdict[data-verify-verdict="failed"] { background: rgba(220,53,69,.12); color: #b42318; }
.dsh-pm-verify-verdict[data-verify-verdict="pending"] { background: rgba(240,160,32,.16); color: #8a5a00; }
.dsh-pm-verify-verdict[data-verify-verdict="not_verifiable"] { background: rgba(128,128,128,.16); color: #555; }
.dsh-pm-src { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(128,128,128,.12); color: var(--dsw-text-secondary, #666); }
.dsh-pm-src[data-source="agent"] { background: rgba(74,125,255,.12); color: #2f5fd0; }
.dsh-pm-src[data-source="human"] { background: rgba(240,160,32,.16); color: #8a5a00; }
/* 代码 / 正文块（提示词正文、注入留痕正文）：等宽、浅底、整段铺开——不设高度上限、不出内层滚动条 */
.dsh-pm-prompt-pre {
  white-space: pre-wrap; word-break: break-word; margin: 0; padding: 10px 12px;
  border: 1px solid var(--pm-line, rgba(128,128,128,.15)); border-radius: 8px;
  background: var(--dsw-bg-secondary, #fafafa);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.6; color: var(--dsw-text-primary, #3b4048);
}
/* 对话（FR-6）：一条连续时间线 —— 人 / agent 两种气泡、系统消息居中灰底小字、回填标显眼 */
.dsh-pm-dialogue-search {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 8px 10px; border: 1px solid var(--pm-line, rgba(128,128,128,.2));
  border-radius: 8px; background: var(--dsw-bg-secondary, rgba(128,128,128,.05));
}
.dsh-pm-dialogue-search .dsh-pm-input { flex: 1 1 220px; min-width: 0; }
.dsh-pm-dialogue-hits { font-size: 12px; color: var(--dsw-text-secondary, #888); font-variant-numeric: tabular-nums; }
.dsh-pm-dialogue-scope { flex-basis: 100%; font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-dialogue-list { display: flex; flex-direction: column; gap: 10px; }
.dsh-pm-msg {
  min-width: 0; padding: 8px 12px; border-radius: 10px;
  border: 1px solid var(--pm-line, rgba(128,128,128,.18)); background: var(--dsw-bg-primary, #fff);
}
.dsh-pm-msg-head { margin-bottom: 4px; }
.dsh-pm-msg-meta { font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-msg-actor { font-weight: 700; }
.dsh-pm-msg-time { font-variant-numeric: tabular-nums; }
.dsh-pm-msg-window { font-family: ui-monospace, monospace; word-break: break-all; }
.dsh-pm-msg-text { font-size: 13px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.dsh-pm-msg--human { background: rgba(74,125,255,.07); border-color: rgba(74,125,255,.3); margin-right: 10%; }
.dsh-pm-msg--agent { background: var(--dsw-bg-secondary, rgba(128,128,128,.06)); margin-left: 10%; }
.dsh-pm-msg--system {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px;
  margin: 0 6%; padding: 6px 10px; text-align: center;
  background: rgba(128,128,128,.08); border-style: dashed;
  font-size: 11.5px; color: var(--dsw-text-secondary, #888);
}
.dsh-pm-msg-system-text { font-size: 11.5px; line-height: 1.5; }
/* 回填标（data-inferred）：这条是事后按台账时间 + 评论反推的，不标会被读成「刚刚推进了阶段」 */
.dsh-pm-msg-inferred {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px;
  color: #8a5a00; background: rgba(240,160,32,.2); border: 1px dashed rgba(240,160,32,.7);
}
.dsh-pm-dialogue-hit { background: rgba(255,214,0,.5); color: inherit; border-radius: 2px; padding: 0 1px; }
.dsh-pm-dialogue-note { font-size: 12px; color: #b45309; }
.dsh-pm-dialogue-more { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.dsh-pm-dialogue-more-note { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-dialogue-reply { margin-top: 0; padding-top: 8px; border-top: 1px dashed var(--pm-line, rgba(128,128,128,.2)); }

/* ═══ ⑤ 反应付的视觉落点（FR-15）：无证据亮点必须与正常亮点一眼可分 ═══
   这一块解决什么：正常亮点是**实线绿框**（可核验），无证据条目是**虚线弱化框**（不计入亮点）。
   两者不共容器也不共样式——做得一样，读者就分不出哪条能核验，「反应付」就退化成一句口号。 */
.dsh-pm-hl {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid rgba(40,167,69,.35); border-left: 3px solid #28a745; background: rgba(40,167,69,.05);
}
.dsh-pm-hl-diff { font-weight: 600; }
.dsh-pm-hl-why { font-size: 12.5px; color: var(--dsw-text-primary, #333); }
.dsh-pm-hl-evid { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.dsh-pm-hl-list { display: flex; flex-direction: column; gap: 8px; }
.dsh-pm-hl-missing {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 8px;
  border: 1px dashed var(--dsw-text-secondary, #b0b4bb); background: transparent; color: var(--dsw-text-secondary, #888);
}
.dsh-pm-hl-missing .dsh-pm-hl-diff { font-weight: 500; color: var(--dsw-text-secondary, #777); }
.dsh-pm-hl-missing .dsh-pm-hl-evid { gap: 8px; }
.dsh-pm-evidence-missing {
  font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 4px;
  color: #b45309; border: 1px dashed rgba(180,83,9,.7); background: rgba(240,160,32,.08);
}
.dsh-pm-trunk-hl-unpay { border: 1px dashed rgba(180,83,9,.45); border-radius: 8px; padding: 10px 12px; background: rgba(240,160,32,.05); }
/* 亮点 / 事实里的证据指针：小等宽胶囊（长路径不撑破所在行） */
.dsh-pm-hl-evid .dsh-pm-evidence, .dsh-pm-fact-evid .dsh-pm-evidence {
  display: inline-block; font-family: ui-monospace, monospace; font-size: 11px;
  padding: 1px 6px; border-radius: 4px; background: rgba(128,128,128,.1);
  color: var(--dsw-text-secondary, #555); word-break: break-all;
}

/* ═══ ⑥ 各面板的块级排版：汇报（trunk）· 文档（docs）· DAG · Token · 提示词（prompts）═══
   这一块解决什么：把每个面板内部的「节 / 卡片 / 分组标题」立起来——每块可读、成块、不溢出。 */
/* ── 汇报（trunk）：七节卡片 + 自动事实 / 人写差异分组 + 成果清单 ── */
.dsh-pm-trunk-docmeta { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-trunk-item { border: 1px solid var(--pm-line, rgba(128,128,128,.18)); border-radius: 10px; padding: 12px 14px; background: var(--dsw-bg-primary, #fff); }
.dsh-pm-trunk-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
.dsh-pm-trunk-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--dsw-text-primary, #1d1d1f); }
.dsh-pm-trunk-sub { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-trunk-body { display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.75; }
.dsh-pm-trunk-line { margin: 0; }
.dsh-pm-trunk-mut { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-trunk-missing { font-size: 12px; color: #b45309; background: rgba(240,160,32,.1); border: 1px dashed rgba(240,160,32,.45); border-radius: 6px; padding: 6px 10px; }
.dsh-pm-trunk-scope-hint { font-size: 12px; font-weight: 600; color: var(--dsw-text-secondary, #6e6e73); }
.dsh-pm-trunk-src { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(128,128,128,.12); color: var(--dsw-text-secondary, #666); }
.dsh-pm-trunk-src[data-source="doc"] { background: rgba(74,125,255,.12); color: #2f5fd0; }
.dsh-pm-trunk-src[data-source="ledger"] { background: rgba(23,162,184,.14); color: #0e7c8f; }
.dsh-pm-trunk-src[data-source="auto"] { background: rgba(40,167,69,.12); color: #1e7e34; }
.dsh-pm-trunk-src[data-source="human"] { background: rgba(240,160,32,.16); color: #8a5a00; }
.dsh-pm-trunk-openrefs { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-pm-trunk-open {
  font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 980px; cursor: pointer;
  border: 1px solid var(--pm-line, rgba(128,128,128,.3)); background: transparent; color: var(--dsw-accent, #4a7dff);
}
.dsh-pm-trunk-open:hover { background: rgba(74,125,255,.1); }
.dsh-pm-trunk-open.is-nopath { color: var(--dsw-text-secondary, #888); cursor: default; }
.dsh-pm-fact { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: 13px; padding: 5px 0; border-bottom: 1px dashed var(--pm-line, rgba(128,128,128,.15)); }
.dsh-pm-fact:last-child { border-bottom: none; }
.dsh-pm-fact-label { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-fact-value { font-variant-numeric: tabular-nums; }
.dsh-pm-fact-evid { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-pm-trunk-hl-group { display: flex; flex-direction: column; gap: 8px; }
.dsh-pm-trunk-hl-h { font-size: 12px; font-weight: 700; color: var(--dsw-text-secondary, #6e6e73); }
.dsh-pm-trunk-ach-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dsh-pm-trunk-ach { display: flex; align-items: center; gap: 8px; }
.dsh-pm-trunk-ach-path { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
/* ── 文档（docs）：清单 / 核验 / 门禁 / 归档四块（表格样式见上面「宽表」） ── */
.dsh-pm-block-title { font-size: 13px; font-weight: 700; color: var(--dsw-text-primary, #333); }
.dsh-pm-doc-generated { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
/* ── DAG：图数据摘要 + 每步执行结果（画布骨架沿用既有 .dsh-pm-dag-* 分片，不在此重定义） ── */
.dsh-pm-dag-summary {
  display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 9px 12px; border-radius: 10px;
  font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsh-pm-np-text2, #6e6e73);
  background: var(--dsh-pm-np-bg, #f5f5f7); border: 1px solid var(--dsh-pm-np-line-soft, rgba(0,0,0,.08));
}
.dsh-pm-report-sec-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--dsw-text-primary, #333); }
.dsh-pm-report-step[data-outcome="failed"] { background: rgba(220,53,69,.05); }
.dsh-pm-report-step-title { font-weight: 600; }
.dsh-pm-report-step-outcome { font-weight: 600; }
.dsh-pm-report-step-summary { font-size: 12.5px; line-height: 1.6; }
.dsh-pm-report-step-error { font-family: ui-monospace, monospace; font-size: 11.5px; color: #b42318; background: rgba(220,53,69,.08); border-radius: 6px; padding: 5px 8px; word-break: break-word; }
.dsh-pm-report-zero { font-size: 12px; font-weight: 600; color: #8a5a00; background: rgba(240,160,32,.16); border: 1px solid rgba(240,160,32,.4); border-radius: 6px; padding: 4px 8px; }
.dsh-pm-report-evidence { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.dsh-pm-report-evidence li { font-family: ui-monospace, monospace; font-size: 11px; color: var(--dsw-text-secondary, #555); background: rgba(128,128,128,.08); border-radius: 4px; padding: 3px 7px; word-break: break-all; }
.dsh-pm-muted { font-size: 11.5px; color: var(--dsw-text-secondary, #888); }
/* ── Token：口径说明 + 按阶段表 + 可优化点（表格沿用既有 .dsh-pm-tok-table） ── */
.dsh-pm-tok-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; font-size: 14px; font-weight: 700; color: var(--dsw-text-primary, #333); }
.dsh-pm-tok-h-note { font-size: 11.5px; font-weight: 400; color: var(--dsw-text-secondary, #888); }
.dsh-pm-tok-avail { font-size: 12px; color: #1e7e34; background: rgba(40,167,69,.1); border: 1px solid rgba(40,167,69,.3); border-radius: 8px; padding: 6px 10px; }
.dsh-pm-tok-total td { font-weight: 700; background: var(--dsw-bg-secondary, rgba(128,128,128,.06)); }
.dsh-pm-opt-list { display: flex; flex-direction: column; gap: 8px; }
.dsh-pm-opt { display: flex; flex-direction: column; gap: 3px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--pm-line, rgba(128,128,128,.18)); background: var(--dsw-bg-secondary, rgba(128,128,128,.04)); }
.dsh-pm-opt-title { font-weight: 600; }
.dsh-pm-opt-basis { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-opt-sug { font-size: 12.5px; line-height: 1.6; }
/* ── 提示词（prompts）：A 系统提示词 / B 注入留痕 / C 上下文 + 规定 vs 实际 ── */
.dsh-pm-pp-sec { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--pm-line, rgba(128,128,128,.18)); border-radius: 10px; background: var(--dsw-bg-primary, #fff); }
.dsh-pm-pp-h { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; font-size: 14px; font-weight: 700; color: var(--dsw-text-primary, #333); }
.dsh-pm-pp-h-note { font-size: 11.5px; font-weight: 400; color: var(--dsw-text-secondary, #888); }
/* 注入留痕：左侧色条按「后果」上色（已投递 / 只留痕未投递 / 投递不可知），别让人把"留了痕"读成"进了会话" */
.dsh-pm-inj { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--pm-line, rgba(128,128,128,.18)); border-left: 3px solid var(--pm-line, #d0d5dd); background: var(--dsw-bg-primary, #fff); }
.dsh-pm-inj[data-delivered="true"] { border-left-color: #28a745; }
.dsh-pm-inj[data-delivered="false"] { border-left-color: #dc3545; background: rgba(220,53,69,.04); }
.dsh-pm-inj[data-delivered="unknown"] { border-left-color: #b0b4bb; background: rgba(128,128,128,.04); }
.dsh-pm-inj-meta { font-size: 11.5px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-inj-verdict { font-size: 12.5px; font-weight: 600; }
.dsh-pm-inj-line { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-inj-body { border: 1px dashed var(--pm-line, rgba(128,128,128,.25)); border-radius: 8px; padding: 6px 10px; }
.dsh-pm-inj-body > summary { cursor: pointer; font-size: 12px; color: var(--dsw-text-secondary, #6e6e73); }
.dsh-pm-specvs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.dsh-pm-sv-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 10px 12px; border: 1px solid var(--pm-line, rgba(128,128,128,.18)); border-radius: 8px; background: var(--dsw-bg-secondary, rgba(128,128,128,.04)); }
.dsh-pm-sv-h { font-size: 12px; font-weight: 700; color: var(--dsw-text-secondary, #6e6e73); }
.dsh-pm-sv-list { margin: 0; padding-left: 18px; font-size: 12.5px; }
.dsh-pm-sv-list code { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
.dsh-pm-sv-trimmed { color: #b45309; }
.dsh-pm-sv-frags { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
.dsh-pm-sv-diff { font-size: 12px; line-height: 1.7; word-break: break-word; }
.dsh-pm-iso { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 8px; background: var(--dsw-bg-secondary, rgba(128,128,128,.05)); }
.dsh-pm-iso-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
.dsh-pm-iso-meta { font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-iso-reason { font-size: 12.5px; line-height: 1.6; word-break: break-word; }

/* 关于「窄档三格退化为单栏」（design/test-cases.md）：**刻意不加 @media**。
   实测：900×800 下若强推单栏，第三格（缺口清单）被推到 top=760 > 视口 713 →
   「首屏答出卡在哪 / 缺什么」当场失败（探针 A1 变红）；而 .dsh-pm-stats 用的
   repeat(auto-fit, minmax(260px, 1fr)) 在**真正窄**的窗口本来就会自然退到两栏、一栏。
   两个口径冲突时取产品判据（一屏定调 + FR-3），故本行只留说明不留规则。 */

/* ═══ ⑦ 密度：让同一屏读得下的信息量回到原型那一版（**缺陷修复，不是审美偏好**）═══
   现场（线上真数据）：Tab 栏 top=1118px，视口高 713 → 首屏根本看不到六个 Tab。
   根因是两处内容失控（评论 10 条 13,317 字 / 文档 Tab 317 行倾倒）叠加本片过松的间距。
   内容那两处已在 QueryReport / QueryDocs 收口；这一段只负责**把间距压回原型口径**。

   三条纪律（本段不得违反）：
    - **不动结构**：仍是「常驻头部 + 状态带三格 + 六个同级 Tab」，一个元素都不少（只改间距/字号）；
    - **不加内层滚动、不限高**：本段不出现 overflow / max-height。高度是靠"字号 + 行距 + 内边距
      收紧 + 少渲染几条"挣回来的，不是靠把内容关进一个滚动框（那会让"有多少"变成不可数，FR-11 #7）；
    - **高特异性覆盖**：只追加 .dsh-pm-detail[data-report-shell] 与 [data-report-head] 作用域内的
      规则（base.ts / detail.ts 的既有规则原样不动——本片追加在末尾，靠特异性取胜，不靠顺序）。 */

/* 壳体与状态带的块间距：原来 16px 段间距 + 16/24 页面留白 + 12px 卡片内边距，三层留白叠在一起 */
.dsh-pm-detail[data-report-shell] { padding: 8px 16px 12px; gap: 8px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] { gap: 8px; padding: 8px; }
/* 状态带卡片：更"实"（边框 + 极浅底 + 小内边距），不再靠大片留白撑高度 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  padding: 6px 8px; gap: 2px; border-radius: 6px;
  background: var(--dsw-bg-secondary, rgba(128,128,128,.04));
  border: 1px solid var(--pm-line, rgba(128,128,128,.16));
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label { font-size: 10.5px; margin-bottom: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body { font-size: 11.5px; line-height: 1.45; }
/* 缺口逐条：由「竖向三行卡片」压成「一条流水」（what / why / ref 同行折行），
   每条从 ~100px 降到 ~34px——这是 900 窄档能过 713 的关键一处。三档配色原样保留。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line {
  display: block; margin: 1px 0; padding: 1px 5px; border-radius: 4px; border-left-width: 3px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-why { display: inline; font-size: 10.5px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-ref { font-size: 10px; padding: 0 4px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-more { font-size: 10.5px; margin-top: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover { font-size: 11px; line-height: 1.4; margin: 2px 0; padding: 3px 7px; }

/* 常驻头部：行距与块间距（原型头部整体很紧；这里只压间距与字号，元素一个不少） */
.dsh-pm-detail-head[data-report-head] { align-items: baseline; gap: 2px 8px; padding: 0; }
.dsh-pm-detail-head[data-report-head] > .dsh-pm-btn { padding: 2px 8px; font-size: 11px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-status { font-size: 10.5px; padding: 1px 8px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-meta { font-size: 11px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-detail-title { font-size: 18px; line-height: 1.2; margin-top: 0; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-progress-dots { margin: 0; padding: 0; gap: 10px; }
/* 8 态阶段条压紧（点 + 标签两行；当前态仍放大，一眼看出在哪一步） */
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot-wrapper { gap: 4px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot { width: 9px; height: 9px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot-wrapper.current .dsh-pm-dot { width: 12px; height: 12px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-dot-label { font-size: 9.5px; }
/* 一句话结论：仍是"一屏内最重要的一句"（加粗 + 左主色条），只是不再用 15px/10-14px 内边距占掉半屏 */
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-verdict {
  font-size: 12.5px; font-weight: 600; line-height: 1.35; padding: 4px 8px; border-radius: 6px;
  border-left-width: 3px;
}
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-next { font-size: 11px; line-height: 1.4; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-actions,
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-windows { gap: 2px 10px; padding-top: 3px; align-items: baseline; }
/* 每个动作由「竖排三块」（按钮 / 需人操作 / 后果）改成一行折行：后果说明仍逐字在，只是不独占三行 */
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-action {
  flex-direction: row; align-items: baseline; flex-wrap: wrap; gap: 2px 6px; max-width: 100%;
}
.dsh-pm-detail-head[data-report-head] .dsh-pm-report-action .dsh-pm-btn { padding: 2px 8px; font-size: 11px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-human-only { font-size: 9.5px; padding: 0 5px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-action-consequence { font-size: 10.5px; line-height: 1.35; }
/* 评论列表：行距与正文压紧（**不给限高、不进 overflow**——条数与截断由渲染层控制，
   见 report-head.ts 的 COMMENT_RENDER_LIMIT / COMMENT_BODY_MAX；本段只让 3 条装得更小） */
.dsh-pm-detail-head[data-report-head] .dsh-pm-comments { gap: 2px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment { padding: 1px 7px; border-radius: 4px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-meta { font-size: 10px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-body { font-size: 11.5px; line-height: 1.35; margin-top: 0; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-form .dsh-pm-input { padding: 2px 8px; font-size: 11.5px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-long-flag { color: #b45309; font-weight: 600; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-form { margin-top: 2px; }
.dsh-pm-detail-head[data-report-head] .dsh-pm-comment-form .dsh-pm-btn { padding: 2px 8px; font-size: 11px; }

/* Tab 栏：六个同级 Tab 也在首屏里露头（选中态与角标配色不动，只收内边距与字号） */
.dsh-pm-tabs[data-report-tabs] .dsh-pm-tab { padding: 6px 11px; font-size: 12px; }

/* ── 文档 Tab 的表格口径（对齐原型 table.t：12px 正文 / 11px 灰表头 / 8px 12px 行内边距）──
   为什么字变小反而"密"：原型那一版的密度就是靠"同样 12px + 更紧的行"换来的；
   行内边距按原型给 8px 12px（纵向 8 比原来的 7 略松，横向 12 让长路径少折两行——净值更矮）。 */
.dsh-pm-docs-table, .dsh-pm-docs-table th, .dsh-pm-docs-table td { font-size: 12px; }
.dsh-pm-docs-table th, .dsh-pm-docs-table td { padding: 8px 12px; }
.dsh-pm-docs-table th { font-size: 11px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-docs .dsh-pm-doc-state { font-size: 11px; }

/* ── 「其它发现」：按类型分组的计数行（每类一行，类型徽标 + 计数 + ≤3 个样例 + 余量说明）── */
.dsh-pm-docs .dsh-pm-discovered-group {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px;
  padding: 4px 8px; border-radius: 5px;
  background: var(--dsw-bg-secondary, rgba(128,128,128,.04));
  border: 1px solid var(--pm-line, rgba(128,128,128,.14));
}
.dsh-pm-docs .dsh-pm-discovered-num {
  font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--dsw-text-primary, #333);
}
.dsh-pm-docs .dsh-pm-discovered-rest { font-size: 11px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-docs [data-discovered-sample] { font-size: 11px; }
`
