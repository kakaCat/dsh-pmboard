# 前端设计令牌（生成物）

> 生成物：由 `scripts/kb-build.mts` 从 src\/client\/styles? 确定性抽取，**请勿手改**（改样式后重跑）。
> 全量类名（863 个）在 `docs/knowledge/design-tokens.classes.tsv`——机器索引、不进上下文，用 `reqboard_kb(kind='tokens', query='<类名>')` 检索。
> 颜色与变量按每行 4 条排版（内容不变，只为守住页面行数预算）。

## 颜色 #colors

- `#4a7dff` 60 次 base.ts　`#999` 58 次 base.ts　`#fff` 54 次 base.ts　`#333` 44 次 base.ts
- `#888` 41 次 base.ts　`#28a745` 35 次 base.ts　`#dc3545` 34 次 base.ts　`#666` 23 次 base.ts
- `#86868b` 19 次 node-panel.ts　`#444` 15 次 base.ts　`#17a2b8` 14 次 base.ts　`#b07800` 14 次 base.ts
- `#e5e7eb` 14 次 board.ts　`#222` 12 次 base.ts　`#2f5fd0` 12 次 board.ts　`#6b7280` 12 次 base.ts
- `#9aa4b2` 12 次 base.ts　`#f0a020` 12 次 base.ts　`#1e7e34` 11 次 board.ts　`#aaa` 9 次 board.ts
- `#6f2f8c` 7 次 files.ts　`#8e44ad` 7 次 base.ts　`#f3f4f6` 7 次 token.ts　`#f9fafb` 7 次 base.ts
- `#111827` 6 次 base.ts　`#f5f5f7` 6 次 dag.ts　`#0e7c8f` 5 次 files.ts　`#1d1d1f` 5 次 node-panel.ts
- `#777` 5 次 base.ts　`#b42318` 5 次 marks.ts　`#0071e3` 4 次 node-panel.ts　`#a86a00` 4 次 files.ts
- `#c2255c` 4 次 base.ts　`#ffffff` 4 次 traceability.ts　`#0969da` 3 次 traceability.ts　`#248a3d` 3 次 node-panel.ts
- `#6c757d` 3 次 base.ts　`#9ca3af` 3 次 base.ts　`#bbb` 3 次 detail.ts　`#ccc` 3 次 panel.ts
- `#1f2328` 2 次 traceability.ts　`#20c997` 2 次 detail.ts　`#555` 2 次 base.ts　`#6e6e73` 2 次 node-panel.ts
- `#7aaaff` 2 次 report.ts　`#8a5a00` 2 次 base.ts　`#d92d20` 2 次 marks.ts　`#f7f8fa` 2 次 files.ts
- `#fdf2f3` 2 次 report.ts　`#ff9800` 2 次 traceability.ts　`#0000001a` 1 次 report.ts　`#00000029` 1 次 report.ts
- `#0062c4` 1 次 report.ts　`#027a48` 1 次 marks.ts　`#0d7789` 1 次 report.ts　`#0f6674` 1 次 board.ts
- `#1e7d34` 1 次 report.ts　`#1f2733` 1 次 node-panel.ts　`#2563eb` 1 次 files.ts　`#2f6fed` 1 次 settings.ts
- `#2f8f5b` 1 次 settings.ts　`#34c759` 1 次 node-panel.ts　`#374151` 1 次 board.ts　`#3b4048` 1 次 base.ts
- `#4a4a4f` 1 次 settings.ts　`#5c4a12` 1 次 token.ts　`#7c3aed` 1 次 report.ts　`#8a5cf6` 1 次 settings.ts
- `#8a9099` 1 次 token.ts　`#a3abb8` 1 次 node-panel.ts　`#adb2b8` 1 次 report.ts　`#b0b4bb` 1 次 token.ts
- `#b45309` 1 次 base.ts　`#c0392b` 1 次 node-panel.ts　`#c7303e` 1 次 report.ts　`#c7c7cc` 1 次 node-panel.ts
- `#c93400` 1 次 report.ts　`#d2455c` 1 次 settings.ts　`#d33` 1 次 base.ts　`#d64545` 1 次 settings.ts
- `#d70015` 1 次 report.ts　`#ddd` 1 次 files.ts　`#e0a030` 1 次 settings.ts　`#ebebf0` 1 次 node-panel.ts
- `#eee` 1 次 files.ts　`#eef1f5` 1 次 files.ts　`#fae0e3` 1 次 report.ts　`#fafafa` 1 次 node-panel.ts
- `#fbfbfc` 1 次 token.ts　`#fde68a` 1 次 report.ts　`#ff9500` 1 次 node-panel.ts　`#fffbeb` 1 次 report.ts

## 变量 #vars

- `--dsh-pm-np-amber` node-panel.ts　`--dsh-pm-np-bg` node-panel.ts　`--dsh-pm-np-bg-hover` node-panel.ts　`--dsh-pm-np-blue` node-panel.ts
- `--dsh-pm-np-green` node-panel.ts　`--dsh-pm-np-line` node-panel.ts　`--dsh-pm-np-line-soft` node-panel.ts　`--dsh-pm-np-red` node-panel.ts
- `--dsh-pm-np-text` node-panel.ts　`--dsh-pm-np-text2` node-panel.ts　`--dsh-pm-np-text3` node-panel.ts　`--f-body` report.ts
- `--f-h1` report.ts　`--f-h2` report.ts　`--f-l1` report.ts　`--f-small` report.ts
- `--f-tiny` report.ts　`--gap-col` report.ts　`--lh-body` report.ts　`--lh-h1` report.ts
- `--lh-h2` report.ts　`--lh-l1` report.ts　`--lh-small` report.ts　`--lh-tiny` report.ts
- `--pm-accent` report.ts　`--pm-accent-hover` report.ts　`--pm-accent-text` report.ts　`--pm-agent` report.ts
- `--pm-bg-soft` base.ts　`--pm-btn-h` base.ts　`--pm-btn-h-sm` base.ts　`--pm-c-accepting` base.ts
- `--pm-c-archived` base.ts　`--pm-c-brainstorming` base.ts　`--pm-c-danger` base.ts　`--pm-c-decomposing` base.ts
- `--pm-c-design` base.ts　`--pm-c-done` base.ts　`--pm-c-draft` base.ts　`--pm-c-implementing` base.ts
- `--pm-c-warn` base.ts　`--pm-chat-agent-bg` report.ts　`--pm-chat-agent-line` report.ts　`--pm-chat-avatar-size` report.ts
- `--pm-chat-bubble-fs` report.ts　`--pm-chat-pager-bg` report.ts　`--pm-chat-pager-line` report.ts　`--pm-chat-time-fs` report.ts
- `--pm-chat-violet` report.ts　`--pm-danger` report.ts　`--pm-danger-text` report.ts　`--pm-danger-tint` report.ts
- `--pm-dur` report.ts　`--pm-dur-fast` report.ts　`--pm-dur-slow` report.ts　`--pm-ease` report.ts
- `--pm-focus-halo` report.ts　`--pm-focus-offset-ctl` report.ts　`--pm-focus-offset-face` report.ts　`--pm-focus-ring-w` report.ts
- `--pm-gap` base.ts　`--pm-gap-lg` base.ts　`--pm-gap-sm` base.ts　`--pm-hair` report.ts
- `--pm-head-title-fs` report.ts　`--pm-head-title-lh` report.ts　`--pm-icon` report.ts　`--pm-icon-sm` report.ts
- `--pm-line` base.ts　`--pm-line-strong` base.ts　`--pm-mono` report.ts　`--pm-ok-text` report.ts
- `--pm-ok-text-tint` report.ts　`--pm-pill` report.ts　`--pm-prog-label-fs` report.ts　`--pm-radius` base.ts
- `--pm-radius-pill` base.ts　`--pm-radius-sm` base.ts　`--pm-shadow-card` base.ts　`--pm-shadow-hover` base.ts
- `--pm-space-module` report.ts　`--pm-stage` base.ts　`--pm-surface` report.ts　`--pm-tab-active-bg` report.ts
- `--pm-tab-badge-fs` report.ts　`--pm-tab-icon-fr4` report.ts　`--pm-tab-indicator` report.ts　`--pm-tab-pad-x` report.ts
- `--pm-tab-pad-y` report.ts　`--pm-target` report.ts　`--pm-teal-text` report.ts　`--pm-teal-text-tint` report.ts
- `--pm-text` report.ts　`--pm-text2` report.ts　`--pm-text3` report.ts　`--pm-trunk-body-fs` report.ts
- `--pm-trunk-body-lh` report.ts　`--pm-trunk-title-fs` report.ts　`--pm-trunk-title-fw` report.ts　`--pm-warn-line` report.ts
- `--pm-warn-text` report.ts　`--pm-warn-tint` report.ts　`--r1` report.ts　`--r2` report.ts
- `--rail` report.ts　`--s1` report.ts　`--s2` report.ts　`--s3` report.ts
- `--s4` report.ts　`--s5` report.ts　`--s6` report.ts

## 断点 #breakpoints

- `max-width: 1200px`
- `max-width: 1180px`
- `max-width: 1000px`
- `max-width: 880px`
- `max-width: 768px`

## 类名前缀分组 #classes（Top 24，共 158 组）

- `dsh-pm-set` · 86 个
- `dsh-pm-np` · 70 个
- `dsh-pm-sn` · 32 个
- `dsh-pm-cprog` · 29 个
- `dsh-pm-dag` · 25 个
- `dsh-pm-trunk` · 25 个
- `dsh-pm-list` · 23 个
- `dsh-pm-trace` · 20 个
- `dsh-pm-report` · 18 个
- `dsh-pm-stage` · 18 个
- `dsh-pm-doc` · 17 个
- `dsh-pm-coverage` · 16 个
- `dsh-pm-tok` · 15 个
- `dsh-pm-comment` · 14 个
- `dsh-pm-plan` · 14 个
- `dsh-pm-task` · 14 个
- `dsh-pm-card` · 11 个
- `dsh-pm-gantt` · 11 个
- `dsh-pm-mk` · 10 个
- `dsh-pm-outcome` · 10 个
- `dsh-pm-artifact` · 9 个
- `dsh-pm-md` · 8 个
- `dsh-pm-timeline` · 8 个
- `dsh-pm-vitem` · 8 个
