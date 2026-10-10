/**
 * 设置弹窗样式分片（REQ-261004103330-005f t11 / 设计 `frontend.md` §样式与主题）。
 *
 * 纪律（设计 R4 与 §样式与主题）：
 *   · **只用真令牌**：`--pm-*`（尺寸/线条/圆角/阴影/八阶段色）与 `--dsw-*`（文本/边框/强调色）；
 *     原型里的私有 `--s-*` 一律不得出现；
 *   · 类名全部 `dsh-pm-set-` 前缀（不污染宿主 shell 的类名空间）；
 *   · 层级：宿主 100 / 确认门 110（既有浮层最大 60，见 `styles/board.ts`）；
 *   · 滚动只发生在内容区（`.dsh-pm-set-main`），遮罩与弹窗本体不滚——防"滚到底穿帮看到看板"；
 *   · 预算 ≤380 行（设计 R6 的拆分触发线；确认门/迁移卡/时间线样式超线时另开 `settings-agent.ts`）。
 *
 * @module dsh-pmboard/client/styles/settings
 */

export const SETTINGS_CSS = `
/* ================================================================== */
/* 设置弹窗（REQ-261004103330-005f t11）—— 宿主挂 body，与看板容器解耦 */
/* ================================================================== */
.dsh-pm-set-host { position: fixed; inset: 0; z-index: 100; }
.dsh-pm-set-mask { position: absolute; inset: 0; background: rgba(0,0,0,.28); }
.dsh-pm-set-dlg {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(1180px, 96vw); height: min(740px, 92vh);
  background: var(--dsw-bg-primary, #fff); color: var(--dsw-text-primary, #222);
  border-radius: var(--pm-radius); box-shadow: 0 24px 70px rgba(0,0,0,.28);
  display: flex; flex-direction: column; overflow: hidden;
}
.dsh-pm-set-head {
  display: flex; align-items: center; gap: var(--pm-gap);
  padding: 16px 20px 12px; flex: none;
}
.dsh-pm-set-title { margin: 0; font-size: 18px; font-weight: 600; }
.dsh-pm-set-ver { font-size: 11px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-set-spacer { flex: 1; }
.dsh-pm-set-close {
  width: 30px; height: 30px; border: 0; border-radius: var(--pm-radius-sm);
  background: transparent; color: var(--dsw-text-secondary, #888); font-size: 15px; cursor: pointer;
}
.dsh-pm-set-close:hover { background: var(--pm-bg-soft); color: var(--dsw-text-primary, #222); }
.dsh-pm-set-status { padding: 0 20px 8px; font-size: 12px; color: var(--dsw-text-secondary, #888); min-height: 16px; }
.dsh-pm-set-status.is-error { color: var(--pm-c-danger); }
.dsh-pm-set-body { flex: 1; display: flex; min-height: 0; }

/* ---- 左菜单（≤880px 变顶部横向 tab 条，见下方断点） ---- */
.dsh-pm-set-nav { width: 208px; flex: none; padding: 4px 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.dsh-pm-set-nav-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: 0; background: transparent; color: inherit; font: inherit; font-size: 14px;
  padding: 10px 12px; border-radius: var(--pm-radius-sm); cursor: pointer;
}
.dsh-pm-set-nav-item:hover { background: var(--pm-bg-soft); }
.dsh-pm-set-nav-item.is-active { background: var(--pm-bg-soft); font-weight: 500; }

/* ---- 内容区：只有这里滚 ---- */
.dsh-pm-set-main { flex: 1; overflow-y: auto; padding: 4px 24px 28px 12px; min-height: 0; }
.dsh-pm-set-pane[hidden] { display: none; }
.dsh-pm-set-placeholder { margin: 8px 0; font-size: 13px; color: var(--dsw-text-secondary, #888); }

/* ---- 通用件（后续四屏复用；类名一次定死，避免各屏各写一套） ---- */
.dsh-pm-set-card {
  border: 1px solid var(--pm-line); border-radius: var(--pm-radius);
  padding: 16px 18px; margin-bottom: var(--pm-gap-lg); background: var(--dsw-bg-primary, #fff);
}
.dsh-pm-set-card > h3 { margin: 0 0 12px; font-size: 13.5px; font-weight: 600; }
.dsh-pm-set-badge {
  display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: var(--pm-radius-pill);
  background: var(--pm-bg-soft); color: var(--dsw-text-secondary, #888);
}
.dsh-pm-set-badge.is-file { background: rgba(74,125,255,.12); color: #2f5fd0; }
.dsh-pm-set-badge.is-config { background: rgba(142,68,173,.12); color: #6f2f8c; }
.dsh-pm-set-badge.is-env { background: rgba(23,162,184,.14); color: #0e7c8f; }
.dsh-pm-set-badge.is-default { background: rgba(128,128,128,.12); color: var(--dsw-text-secondary, #888); }
.dsh-pm-set-notice {
  border: 1px solid var(--pm-line-strong); border-radius: var(--pm-radius-sm);
  padding: 10px 12px; font-size: 12.5px; margin-bottom: var(--pm-gap-lg);
}
.dsh-pm-set-notice.is-warn { border-color: rgba(240,160,32,.45); background: rgba(240,160,32,.10); color: #8a5a00; }
.dsh-pm-set-notice.is-danger { border-color: rgba(220,53,69,.35); background: rgba(220,53,69,.08); color: #b42318; }

/* ---- 断点：全屏 sheet + 顶部横向菜单（设计 §响应式与可访问性） ---- */
@media (max-width: 1180px) {
  .dsh-pm-set-nav { width: 184px; }
}
@media (max-width: 880px) {
  .dsh-pm-set-dlg { inset: 0; left: 0; top: 0; transform: none; width: 100%; height: 100%; border-radius: 0; }
  .dsh-pm-set-body { flex-direction: column; }
  .dsh-pm-set-nav { width: auto; flex-direction: row; overflow-x: auto; padding: 4px 12px 8px; }
  .dsh-pm-set-nav-item { width: auto; white-space: nowrap; }
  .dsh-pm-set-main { padding: 4px 16px 24px; }
}
/* ── 运行上限屏（t12）────────────────────────────────────────────────────
   表格只做"能读、能改、能看出哪一项脏"三件事；颜色一律取真令牌，不新造色值。 */
.dsh-pm-set-h3 { margin: 4px 0 6px; font-size: 15px; font-weight: 600; color: var(--dsw-text-primary, #1d1d1f); }
.dsh-pm-set-hint { margin: 6px 0; font-size: 12px; line-height: 1.6; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-hint-strong { color: var(--dsw-text-primary, #333); font-weight: 500; }
.dsh-pm-set-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.dsh-pm-set-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: var(--dsw-text-secondary, #86868b);
  padding: 6px 8px; border-bottom: 1px solid var(--pm-line);
}
.dsh-pm-set-table td { padding: 6px 8px; border-bottom: 1px solid var(--pm-line); font-size: 13px; vertical-align: middle; }
.dsh-pm-set-limit-row.is-manual td { color: var(--dsw-text-secondary, #9aa4b2); }
.dsh-pm-set-limit-row.is-dirty { background: var(--pm-bg-soft); }
.dsh-pm-set-limit-row.is-invalid { background: rgba(220,53,69,.06); }
.dsh-pm-set-limit-name { font-weight: 600; color: var(--dsw-text-primary, #111827); }
.dsh-pm-set-limit-key { margin-left: 6px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-set-limit-manual { margin-left: 6px; font-size: 11px; color: var(--dsw-text-secondary, #9aa4b2); }
.dsh-pm-set-limit-default { color: var(--dsw-text-secondary, #86868b); font-variant-numeric: tabular-nums; }
.dsh-pm-set-limit-input {
  width: 92px; padding: 4px 8px; text-align: right; font: inherit; font-size: 13px;
  font-variant-numeric: tabular-nums; color: inherit; background: var(--dsw-bg-primary, #fff);
  border: 1px solid var(--pm-line-strong); border-radius: var(--pm-radius-sm);
}
.dsh-pm-set-limit-input.is-invalid { border-color: var(--pm-c-danger); background: rgba(220,53,69,.05); }
.dsh-pm-set-limit-err { display: block; margin-top: 2px; font-size: 11px; color: var(--pm-c-danger); }
.dsh-pm-set-badge.is-settings { background: rgba(74,125,255,.12); color: #2f5fd0; }
.dsh-pm-set-badge.is-config { background: rgba(142,68,173,.12); color: #6f2f8c; }
.dsh-pm-set-badge.is-env { background: rgba(23,162,184,.12); color: #17a2b8; }
.dsh-pm-set-badge.is-pending { background: rgba(240,160,32,.18); color: var(--pm-c-warn); }
.dsh-pm-set-savebar {
  display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 10px;
  background: rgba(240,160,32,.08); border: 1px solid rgba(240,160,32,.45); border-radius: var(--pm-radius-sm);
}
.dsh-pm-set-savebar-text { font-size: 12px; color: var(--pm-c-warn); }
.dsh-pm-set-notice.is-error {
  margin: 6px 0; padding: 6px 8px; font-size: 12px; color: #b42318;
  background: rgba(220,53,69,.08); border: 1px solid rgba(220,53,69,.35); border-radius: var(--pm-radius-sm);
}

/* ── t13：存储与数据库屏（后端概览 / 确认门 / 迁移清单） ─────────────────────
   只用既有令牌（--pm-* / --dsw-*），不新造色值。 */
.dsh-pm-set-h4 { margin: 14px 0 8px; font-size: 13px; font-weight: 600; color: var(--dsw-text-primary, #222); }
.dsh-pm-set-kv { display: grid; grid-template-columns: 128px 1fr; gap: 6px 12px; margin: 0 0 8px; }
.dsh-pm-set-kv dt { font-size: 12px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-set-kv dd { margin: 0; font-size: 13px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-pm-set-kv dd.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.dsh-pm-set-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.dsh-pm-set-warn { color: var(--pm-c-warn); font-size: 12px; }
.dsh-pm-set-confirm { margin: 10px 0; padding: 10px 12px; border: 1px solid var(--pm-line-strong); border-radius: var(--pm-radius-sm); background: var(--pm-bg-soft); }
.dsh-pm-set-impacts { margin: 6px 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
.dsh-pm-set-steps { list-style: none; margin: 6px 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dsh-pm-set-steps li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-set-steps li.is-done { color: var(--dsw-text-primary, #222); }
.dsh-pm-set-steps li.is-done .dsh-pm-set-step-mark { color: var(--pm-c-done); }
.dsh-pm-set-steps li.is-unknown .dsh-pm-set-step-mark { color: var(--pm-c-warn); }
.dsh-pm-set-step-mark { width: 14px; flex: none; text-align: center; font-family: ui-monospace, Menlo, monospace; }
.dsh-pm-set-step-note { color: var(--dsw-text-secondary, #9aa4b2); font-size: 11.5px; }
.dsh-pm-set-notice.is-ok { border-color: rgba(40,167,69,.35); background: rgba(40,167,69,.08); color: #1e7e34; }
.dsh-pm-set-badge.is-settings { background: rgba(74,125,255,.12); color: #2f5fd0; }
.dsh-pm-set-badge.is-env { background: rgba(23,162,184,.12); color: #0e7c8f; }

@media (prefers-reduced-motion: reduce) {
  .dsh-pm-set-host * { animation: none !important; transition: none !important; }
}
/* ===== t14：系统记录屏 / 通用屏（只追加，不改既有选择器） ===== */
.dsh-pm-set-sec { margin: 0 0 14px; }
.dsh-pm-set-sec-title { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--dsw-text-primary, #1d1d1f); }
.dsh-pm-set-empty { margin: 6px 0 0; font-size: 12px; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-red {
  margin: 8px 0; padding: 9px 11px; border-radius: var(--pm-radius-sm, 7px);
  background: rgba(220, 53, 69, .08); border: 1px solid rgba(220, 53, 69, .35);
  color: #b42318; font-size: 12.5px; line-height: 1.6;
}
.dsh-pm-set-red-inline { margin: 4px 0; font-size: 12px; }
.dsh-pm-set-red-inline.is-warn { color: var(--pm-c-warn, #b07800); }
.dsh-pm-set-red-inline.is-plain { color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-tl { list-style: none; margin: 0; padding: 0; }
.dsh-pm-set-tl-item {
  position: relative; padding: 0 0 12px 16px; border-left: 2px solid var(--pm-line, rgba(128,128,128,.18));
  display: flex; flex-direction: column; gap: 2px;
}
.dsh-pm-set-tl-item:last-child { padding-bottom: 0; }
.dsh-pm-set-tl-item::before {
  content: ''; position: absolute; left: -6px; top: 4px; width: 9px; height: 9px; border-radius: 50%;
  background: var(--dsw-text-secondary, #86868b);
}
.dsh-pm-set-tl-item.is-ok::before { background: var(--pm-c-done, #28a745); }
.dsh-pm-set-tl-item.is-warn::before { background: var(--pm-c-warn, #b07800); }
.dsh-pm-set-tl-item.is-error::before { background: var(--pm-c-danger, #dc3545); }
.dsh-pm-set-tl-time { font-size: 11px; font-family: ui-monospace, Menlo, monospace; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-tl-title { font-size: 12.5px; font-weight: 500; }
.dsh-pm-set-tl-line { font-size: 11.5px; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-tl-by { font-size: 11.5px; color: var(--dsw-accent, #4a7dff); }
.dsh-pm-set-kv { display: flex; flex-direction: column; gap: 6px; }
.dsh-pm-set-kv-row { display: flex; gap: 10px; font-size: 12.5px; align-items: baseline; }
.dsh-pm-set-kv-k { flex: none; min-width: 120px; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-kv-v { flex: 1; word-break: break-all; }
.dsh-pm-set-kv-v.is-mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.dsh-pm-set-kv-note { margin-left: 8px; font-size: 11.5px; color: var(--dsw-text-secondary, #86868b); }

/* ── 原型对齐（2026-10-04 人验收反馈后补）────────────────────────────────────
   基元来自 render/parts.ts：分组盒子 / 说明框 / 阶段色点 / 行标签值 / 节点单元格。
   颜色一律取既有真令牌（--pm-* / --dsw-*），**不引入第二套调色板**。 */

/* 屏标题：主标题 + 副标题同排（原型 .pane-title .muted 就是同排 + 8px 间距） */
.dsh-pm-set-pane-title { margin: 4px 0 14px; font-size: 15px; font-weight: 600; }
.dsh-pm-set-pane-sub { margin-left: 8px; font-size: 12.5px; font-weight: 400; color: var(--dsw-text-secondary, #86868b); }

/* 分组盒子：标题 + 内容（对应原型的 .grp） */
.dsh-pm-set-grp { border: 1px solid var(--pm-line, rgba(128,128,128,.22)); border-radius: var(--pm-radius, 10px); overflow: hidden; margin-bottom: var(--pm-gap, 14px); }
.dsh-pm-set-grp-title { padding: 9px 14px; font-size: 12.5px; font-weight: 600; background: var(--pm-bg-soft, rgba(128,128,128,.06)); border-bottom: 1px solid var(--pm-line, rgba(128,128,128,.18)); }
.dsh-pm-set-grp-body { padding: 4px 14px 12px; }

/* 说明框：信息 / 危险两态（对应原型的 .notice.info；危险态用于档案损坏、保存失败） */
.dsh-pm-set-notice.is-info { background: var(--pm-bg-soft, rgba(74,125,255,.08)); border: 1px solid var(--pm-line, rgba(74,125,255,.25)); border-radius: var(--pm-radius, 10px); padding: 10px 13px; font-size: 12px; line-height: 1.7; color: var(--dsw-text-secondary, #4a4a4f); }
.dsh-pm-set-notice.is-danger { background: rgba(220,53,69,.08); border: 1px solid rgba(220,53,69,.35); border-radius: var(--pm-radius, 10px); padding: 10px 13px; font-size: 12px; line-height: 1.7; color: var(--pm-c-danger, #dc3545); }

/* 节点单元格：色点 + 主名 + 副标题（原型每行都长这样） */
.dsh-pm-set-node-cell { display: flex; align-items: baseline; gap: 7px; }
.dsh-pm-set-node-text { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; }
.dsh-pm-set-node-name { font-weight: 500; }
.dsh-pm-set-node-sub { font-size: 11.5px; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-node-sub::before { content: '·'; margin-right: 4px; }

/* 阶段色点：颜色取自 base.ts 的 --pm-c-<阶段>（与看板泳道同一套） */
.dsh-pm-set-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-text-secondary, #9aa4b2); }
.dsh-pm-set-dot.is-draft { background: var(--pm-c-draft, #9aa4b2); }
.dsh-pm-set-dot.is-brainstorming { background: var(--pm-c-brainstorming, #e0a030); }
.dsh-pm-set-dot.is-design { background: var(--pm-c-design, #d2455c); }
.dsh-pm-set-dot.is-decomposing { background: var(--pm-c-decomposing, #8a5cf6); }
.dsh-pm-set-dot.is-implementing { background: var(--pm-c-implementing, #4a7dff); }
.dsh-pm-set-dot.is-accepting { background: var(--pm-c-accepting, #17a2b8); }
.dsh-pm-set-dot.is-done { background: var(--pm-c-done, #28a745); }
.dsh-pm-set-dot.is-archived { background: var(--pm-c-archived, #9aa4b2); }

/* 等宽（路径、命令、指纹） */
.dsh-pm-set-mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }

/* 行标签值：两列（原型的「生效来源 / 生效时机」就是这个形） */
.dsh-pm-set-kv.is-cols .dsh-pm-set-kv-k { min-width: 104px; }

/* 左菜单：图标 + 文字 + 角标（原型 .dlg-nav） */
.dsh-pm-set-nav-icon { width: 17px; height: 17px; flex: none; opacity: .85; }
.dsh-pm-set-nav-label { flex: 1; text-align: left; }
/* 页头旁注：说明「为什么现在打不开配置」（不靠悬停） */
.dsh-pm-set-head-note { font-size: 11.5px; color: var(--dsw-text-secondary, #86868b); margin-right: 6px; white-space: nowrap; }
/* 语义上不可用、但仍可点击以给出解释：外观置灰但保留焦点 */
/* 作用域必须带 dsh-pm-set- 前缀：设置样式表里所有选择器都归设置命名空间（本仓 R4 纪律） */
.dsh-pm-set-host .dsh-pm-btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.dsh-pm-set-nav-sub { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--pm-c-warn, #b07800); }

/* ── 对齐趟 2：存储屏 / 记录屏 / 通用屏与原型同形所需的类 ───────────────────
   原则同前：只取真令牌，不引入第二套调色板。 */

/* 分组标题里的灰字副标题（原型 h3 .muted） */
.dsh-pm-set-grp-sub { margin-left: 8px; font-size: 11.5px; font-weight: 400; color: var(--dsw-text-secondary, #86868b); }
.dsh-pm-set-muted { margin-left: 8px; font-size: 11.5px; color: var(--dsw-text-secondary, #86868b); }

/* 后端分段开关（原型 .seg2）：两项同排，选中项高亮 */
.dsh-pm-set-seg { display: inline-flex; gap: 0; margin: 10px 0 4px; border: 1px solid var(--pm-line, rgba(128,128,128,.28)); border-radius: var(--pm-radius, 9px); overflow: hidden; }
.dsh-pm-set-seg-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 12.5px; font-weight: 500;
  background: var(--dsw-bg-primary, #fff); border: 0; border-right: 1px solid var(--pm-line, rgba(128,128,128,.22)); color: inherit; cursor: pointer; }
.dsh-pm-set-seg-item:last-child { border-right: 0; }
/* 选中项：**深底白字**（界面基准里选中项用的是它自己的主色，取值就是正文色 #1d1d1f）。
   这里用真令牌表达同一件事：正文色作填充、底色作前景——**不引任何私有令牌**。 */
/* 选中项：**主题强调色的浅底 + 强调色文字**（2026-10-04 人评「选中颜色不好看」后改）。
   原来是近黑实底（照界面基准），但同屏已经有蓝色主按钮，再来一块实心深色太重；
   换成强调色浅底既读得出「选中」，又和主按钮同一套色。底色用 color-mix 由真令牌算出，
   不支持时退回等价的 rgba 常量。 */
.dsh-pm-set-seg-item.is-on { background: rgba(74,125,255,.12); background: color-mix(in srgb, var(--dsw-accent, #4a7dff) 14%, transparent); color: var(--dsw-accent, #4a7dff); font-weight: 500; }
/* 深底上的标签要反白（原型 「.seg2 button.active .tag { background: rgba(255,255,255,.22); color: #fff }「） */
/* 浅底之上了，标签回到原型的绿色（深底反白那套不再需要） */
.dsh-pm-set-seg-item.is-on .dsh-pm-set-tag { background: rgba(40,167,69,.14); color: #1e7e34; font-weight: 600; }
.dsh-pm-set-seg-item[disabled] { opacity: .55; cursor: not-allowed; }
.dsh-pm-set-tag { padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 600; }
/* 原型 「.tag { background: rgba(40,167,69,.14); color: #1e7e34 }「 */
.dsh-pm-set-tag.is-now { background: rgba(40,167,69,.14); color: #1e7e34; }
/* 原型 「.tag.exp { background: rgba(240,160,32,.18); color: var(--pm-c-warn) }「——「实验性」在原型里是橙色 */
.dsh-pm-set-tag.is-exp { background: rgba(240,160,32,.18); color: var(--pm-c-warn, #b07800); }

/* 「迁移与校验」Agent 区（原型 .agent-box） */
.dsh-pm-set-agent { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--pm-line, rgba(128,128,128,.22));
  border-radius: var(--pm-radius, 10px); background: var(--pm-bg-soft, rgba(128,128,128,.04)); }
.dsh-pm-set-agent-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-pm-set-agent-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-text-secondary, #86868b); flex: none; }
.dsh-pm-set-agent-dot.is-running { background: var(--pm-c-implementing, #2f6fed); }
.dsh-pm-set-agent-dot.is-done { background: var(--pm-c-done, #2f8f5b); }
.dsh-pm-set-agent-dot.is-failed { background: var(--pm-c-canceled, #d64545); }
.dsh-pm-set-agent-dot.is-confirm, .dsh-pm-set-agent-dot.is-requesting { background: var(--pm-c-accepting, #b07800); }
.dsh-pm-set-agent-hint { margin: 8px 0 4px; font-size: 12.5px; line-height: 1.65; }
.dsh-pm-set-agent-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.dsh-pm-set-manual, .dsh-pm-set-pathedit { display: inline-block; }
.dsh-pm-set-manual > summary, .dsh-pm-set-pathedit > summary { list-style: none; cursor: pointer; }
.dsh-pm-set-manual > summary::-webkit-details-marker, .dsh-pm-set-pathedit > summary::-webkit-details-marker { display: none; }
.dsh-pm-set-cmd { margin: 8px 0 2px; padding: 9px 11px; border-radius: 8px; overflow-x: auto;
  background: var(--pm-bg-code, rgba(128,128,128,.12)); font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; white-space: pre; }
.dsh-pm-set-pathedit-body { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 2px; }
.dsh-pm-set-input { flex: 1 1 320px; min-width: 220px; padding: 6px 9px; font-size: 12px;
  border: 1px solid var(--pm-line, rgba(128,128,128,.3)); border-radius: 8px; background: var(--pm-bg, transparent); color: inherit; }

/* 载体体检（原型 .health） */
.dsh-pm-set-health { display: flex; flex-direction: column; gap: 3px; margin-top: 12px;
  font-size: 12px; color: var(--dsw-text-secondary, #86868b); }


/* 「选择…」填入后：输入框标脏，让"改过了、还没保存"看得见（人点「保存」才写盘） */
.dsh-pm-set-pathedit-body .dsh-pm-set-input.is-dirty { border-color: var(--pm-c-warn, #b07800); }
`
