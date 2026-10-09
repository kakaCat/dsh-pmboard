# 前端设计令牌（生成物）

> 生成物：由 `scripts/kb-build.mts` 从 src\/client\/styles? 确定性抽取，**请勿手改**（改样式后重跑）。
> 全量类名（922 个）在 `docs/knowledge/design-tokens.classes.tsv`——机器索引、不进上下文，用 `reqboard_kb(kind='tokens', query='<类名>')` 检索。
> 颜色与变量按每行 4 条排版（内容不变，只为守住页面行数预算）。

## 颜色 #colors

- `#4a7dff` 62 次 base.ts　`#999` 59 次 base.ts　`#fff` 55 次 base.ts　`#333` 45 次 base.ts
- `#888` 41 次 base.ts　`#28a745` 35 次 base.ts　`#dc3545` 34 次 base.ts　`#666` 23 次 base.ts
- `#86868b` 19 次 node-panel.ts　`#444` 15 次 base.ts　`#b07800` 15 次 base.ts　`#17a2b8` 14 次 base.ts
- `#e5e7eb` 14 次 board.ts　`#222` 12 次 base.ts　`#2f5fd0` 12 次 board.ts　`#6b7280` 12 次 base.ts
- `#9aa4b2` 12 次 base.ts　`#f0a020` 12 次 base.ts　`#1e7e34` 11 次 board.ts　`#aaa` 9 次 board.ts
- `#6f2f8c` 7 次 files.ts　`#8e44ad` 7 次 base.ts　`#f3f4f6` 7 次 token.ts　`#f9fafb` 7 次 base.ts
- `#111827` 6 次 base.ts　`#991b1b` 6 次 node-panel.ts　`#f5f5f7` 6 次 dag.ts　`#ffffff` 6 次 report/head.ts
- `#0e7c8f` 5 次 files.ts　`#1d1d1f` 5 次 node-panel.ts　`#777` 5 次 base.ts　`#b42318` 5 次 marks.ts
- `#0071e3` 4 次 node-panel.ts　`#c2255c` 4 次 base.ts　`#0969da` 3 次 traceability.ts　`#248a3d` 3 次 node-panel.ts
- `#6c757d` 3 次 base.ts　`#9ca3af` 3 次 base.ts　`#a86a00` 3 次 files.ts　`#bbb` 3 次 detail.ts
- `#ccc` 3 次 panel.ts　`#d9534f` 3 次 files.ts　`#e2e8f0` 3 次 report/head.ts　`#1f2328` 2 次 traceability.ts
- `#20c997` 2 次 detail.ts　`#555` 2 次 base.ts　`#6e6e73` 2 次 node-panel.ts　`#7aaaff` 2 次 report/shared.ts
- `#8a5a00` 2 次 base.ts　`#d92d20` 2 次 marks.ts　`#f7f8fa` 2 次 files.ts　`#fdf2f3` 2 次 report/band.ts
- `#ff9800` 2 次 traceability.ts　`#0000001a` 1 次 report/tokens.ts　`#00000029` 1 次 report/tokens.ts　`#0062c4` 1 次 report/tokens.ts
- `#027a48` 1 次 marks.ts　`#0d7789` 1 次 report/tokens.ts　`#0f6674` 1 次 board.ts　`#1e7d34` 1 次 report/tokens.ts
- `#1f2733` 1 次 node-panel.ts　`#2563eb` 1 次 files.ts　`#2f6fed` 1 次 settings.ts　`#2f8f5b` 1 次 settings.ts
- `#34c759` 1 次 node-panel.ts　`#374151` 1 次 board.ts　`#3b4048` 1 次 base.ts　`#4a4a4f` 1 次 settings.ts
- `#5c4a12` 1 次 token.ts　`#7c3aed` 1 次 report/panels/dialogue.ts　`#8a5cf6` 1 次 settings.ts　`#8a9099` 1 次 token.ts
- `#a3abb8` 1 次 node-panel.ts　`#adb2b8` 1 次 report.ts　`#b0b4bb` 1 次 token.ts　`#b45309` 1 次 base.ts
- `#c0392b` 1 次 node-panel.ts　`#c7303e` 1 次 report/tokens.ts　`#c7c7cc` 1 次 node-panel.ts　`#c93400` 1 次 report/tokens.ts
- `#d2455c` 1 次 settings.ts　`#d33` 1 次 base.ts　`#d64545` 1 次 settings.ts　`#d70015` 1 次 report/tokens.ts
- `#dc2626` 1 次 node-panel.ts　`#ddd` 1 次 files.ts　`#e0a030` 1 次 settings.ts　`#e6e6e6` 1 次 report/shared.ts
- `#ebebf0` 1 次 node-panel.ts　`#eee` 1 次 files.ts　`#eef1f5` 1 次 files.ts　`#fae0e3` 1 次 report/band.ts
- `#fafafa` 1 次 node-panel.ts　`#fbfbfc` 1 次 token.ts　`#fde68a` 1 次 report/shared.ts　`#ff9500` 1 次 node-panel.ts
- `#fffbeb` 1 次 report/shared.ts

## 变量 #vars

- `--dsh-pm-np-amber` node-panel.ts　`--dsh-pm-np-bg` node-panel.ts　`--dsh-pm-np-bg-hover` node-panel.ts　`--dsh-pm-np-blue` node-panel.ts
- `--dsh-pm-np-green` node-panel.ts　`--dsh-pm-np-line` node-panel.ts　`--dsh-pm-np-line-soft` node-panel.ts　`--dsh-pm-np-red` node-panel.ts
- `--dsh-pm-np-text` node-panel.ts　`--dsh-pm-np-text2` node-panel.ts　`--dsh-pm-np-text3` node-panel.ts　`--f-body` report/tokens.ts
- `--f-h1` report/tokens.ts　`--f-h2` report/tokens.ts　`--f-l1` report/tokens.ts　`--f-small` report/tokens.ts
- `--f-tiny` report/tokens.ts　`--gap-col` report/tokens.ts　`--lh-body` report/tokens.ts　`--lh-h1` report/tokens.ts
- `--lh-h2` report/tokens.ts　`--lh-l1` report/tokens.ts　`--lh-small` report/tokens.ts　`--lh-tiny` report/tokens.ts
- `--pm-accent` report/tokens.ts　`--pm-accent-hover` report/tokens.ts　`--pm-accent-text` report/tokens.ts　`--pm-agent` report/tokens.ts
- `--pm-bg-soft` base.ts　`--pm-btn-h` base.ts　`--pm-btn-h-sm` base.ts　`--pm-c-accepting` base.ts
- `--pm-c-archived` base.ts　`--pm-c-brainstorming` base.ts　`--pm-c-danger` base.ts　`--pm-c-decomposing` base.ts
- `--pm-c-design` base.ts　`--pm-c-done` base.ts　`--pm-c-draft` base.ts　`--pm-c-implementing` base.ts
- `--pm-c-warn` base.ts　`--pm-card-gap` report/shared.ts　`--pm-card-line` report/shared.ts　`--pm-card-pad-x` report/shared.ts
- `--pm-card-pad-y` report/shared.ts　`--pm-chat-agent-bg` report/panels/dialogue.ts　`--pm-chat-agent-line` report/panels/dialogue.ts　`--pm-chat-avatar-size` report/panels/dialogue.ts
- `--pm-chat-bubble-fs` report/panels/dialogue.ts　`--pm-chat-pager-bg` report/panels/dialogue.ts　`--pm-chat-pager-line` report/panels/dialogue.ts　`--pm-chat-time-fs` report/panels/dialogue.ts
- `--pm-chat-violet` report/panels/dialogue.ts　`--pm-danger` report/tokens.ts　`--pm-danger-text` report/tokens.ts　`--pm-danger-tint` report/band.ts
- `--pm-dur` report/shared.ts　`--pm-dur-fast` report/shared.ts　`--pm-dur-slow` report/shared.ts　`--pm-ease` report/tokens.ts
- `--pm-focus-halo` report/tokens.ts　`--pm-focus-offset-ctl` report/tokens.ts　`--pm-focus-offset-face` report/tokens.ts　`--pm-focus-ring-w` report/tokens.ts
- `--pm-gap` base.ts　`--pm-gap-lg` base.ts　`--pm-gap-sm` base.ts　`--pm-hair` report/tokens.ts
- `--pm-head-title-fs` report/shared.ts　`--pm-head-title-lh` report/shared.ts　`--pm-icon` report/tokens.ts　`--pm-icon-sm` report/tokens.ts
- `--pm-line` base.ts　`--pm-line-strong` base.ts　`--pm-mono` report/tokens.ts　`--pm-ok-text` report/tokens.ts
- `--pm-ok-text-tint` report/tokens.ts　`--pm-pill` report/tokens.ts　`--pm-prog-label-fs` report/tabs.ts　`--pm-radius` base.ts
- `--pm-radius-pill` base.ts　`--pm-radius-sm` base.ts　`--pm-shadow-card` base.ts　`--pm-shadow-hover` base.ts
- `--pm-space-module` report/tokens.ts　`--pm-stage` base.ts　`--pm-surface` report/tokens.ts　`--pm-tab-active-bg` report/tabs.ts
- `--pm-tab-badge-fs` report/tabs.ts　`--pm-tab-icon-fr4` report/tabs.ts　`--pm-tab-indicator` report/tabs.ts　`--pm-tab-pad-x` report/tabs.ts
- `--pm-tab-pad-y` report/tabs.ts　`--pm-target` report/shared.ts　`--pm-teal-text` report/tokens.ts　`--pm-teal-text-tint` report/tokens.ts
- `--pm-text` report/tokens.ts　`--pm-text2` report/tokens.ts　`--pm-text3` report/tokens.ts　`--pm-trunk-body-fs` report/shared.ts
- `--pm-trunk-body-lh` report/shared.ts　`--pm-trunk-title-fs` report/shared.ts　`--pm-trunk-title-fw` report/shared.ts　`--pm-warn-line` report/shared.ts
- `--pm-warn-text` report/tokens.ts　`--pm-warn-tint` report/shared.ts　`--r1` report/tokens.ts　`--r2` report/tokens.ts
- `--rail` report/tokens.ts　`--s1` report/tokens.ts　`--s2` report/tokens.ts　`--s3` report/tokens.ts
- `--s4` report/tokens.ts　`--s5` report/tokens.ts　`--s6` report/tokens.ts

## 断点 #breakpoints

- `max-width: 1200px`
- `max-width: 1180px`
- `max-width: 1000px`
- `max-width: 880px`
- `max-width: 768px`
- `max-width: 760px`

## 类名前缀分组 #classes（Top 24，共 170 组）

- `dsh-pm-set` · 86 个
- `dsh-pm-np` · 71 个
- `dsh-pm-sn` · 32 个
- `dsh-pm-cprog` · 29 个
- `dsh-pm-dag` · 25 个
- `dsh-pm-trunk` · 25 个
- `dsh-pm-list` · 23 个
- `dsh-pm-tok` · 21 个
- `dsh-pm-trace` · 20 个
- `dsh-pm-report` · 18 个
- `dsh-pm-stage` · 18 个
- `dsh-pm-doc` · 17 个
- `dsh-pm-coverage` · 16 个
- `dsh-pm-rtm` · 16 个
- `dsh-pm-comment` · 14 个
- `dsh-pm-plan` · 14 个
- `dsh-pm-task` · 14 个
- `dsh-pm-card` · 11 个
- `dsh-pm-gantt` · 11 个
- `dsh-pm-vitem` · 11 个
- `dsh-pm-mk` · 10 个
- `dsh-pm-outcome` · 10 个
- `dsh-pm-artifact` · 9 个
- `dsh-pm-archived` · 8 个
