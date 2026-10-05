/**
 * Token tab 样式（REQ-a33899 t6）——只复用全站令牌（--dsw-* / --pm-*）与既有 .dsh-pm-* 体系，
 * 不造第二套色板；尺寸变体随本文件。
 */
export const TOKEN_CSS = `
/* ── 🪙 Token tab（REQ-a33899） ───────────────────────────────────────── */
.dsh-pm-tab-content[data-tab-content="token"] { display: flex; flex-direction: column; gap: 10px; }
.dsh-pm-callout {
  background: rgba(240, 195, 109, .16); border: 1px solid rgba(240, 195, 109, .5);
  border-radius: 8px; padding: 8px 12px; font-size: 12px; color: var(--dsw-text-primary, #5c4a12);
}
.dsh-pm-note { font-size: 12px; color: var(--dsw-text-secondary, #888); margin-top: 6px; }
.dsh-pm-sum { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--dsw-text-secondary, #888); margin-bottom: 8px; }
.dsh-pm-sum b { color: var(--dsw-text-primary, #222); font-variant-numeric: tabular-nums; }
.dsh-pm-tok-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dsh-pm-tok-table th { text-align: right; font-weight: 600; color: var(--dsw-text-secondary, #888); font-size: 12px;
  padding: 6px 8px; border-bottom: 1px solid var(--pm-line, #e5e7eb); }
.dsh-pm-tok-table th:first-child, .dsh-pm-tok-table td:first-child { text-align: left; }
.dsh-pm-tok-table td { padding: 7px 8px; border-bottom: 1px solid var(--pm-line, #e5e7eb); text-align: right; font-variant-numeric: tabular-nums; }
.dsh-pm-tok-node { cursor: pointer; }
.dsh-pm-tok-node:hover { background: var(--dsw-hover, rgba(128,128,128,.08)); }
.dsh-pm-tok-more { font-size: 11px; color: var(--dsw-text-secondary, #999); }
.dsh-pm-tok-sub { background: color-mix(in srgb, var(--pm-bg-soft, #f3f4f6) 55%, transparent); }
.dsh-pm-tok-sub td { font-size: 12px; color: var(--dsw-text-secondary, #888); padding: 5px 8px 5px 26px; text-align: left; }
.dsh-pm-tok-sub-num { float: right; color: var(--dsw-text-primary, #333); font-variant-numeric: tabular-nums; }
.dsh-pm-nosnap { color: var(--dsw-text-secondary, #b0b4bb); }
.dsh-pm-bar { display: inline-block; width: 72px; height: 6px; border-radius: 3px; background: var(--pm-line, #e5e7eb); vertical-align: middle; }
.dsh-pm-bar > i { display: block; height: 6px; border-radius: 3px; background: #4a7dff; }
.dsh-pm-impact-row { display: flex; align-items: center; gap: 10px; font-size: 12px; margin: 5px 0; }
.dsh-pm-impact-name { width: 150px; color: var(--dsw-text-secondary, #888); }
.dsh-pm-impact-bar { flex: 1; height: 8px; border-radius: 4px; background: var(--pm-bg-soft, #f3f4f6); overflow: hidden; }
.dsh-pm-impact-bar > i { display: block; height: 8px; background: rgba(194, 37, 92, .75); }
.dsh-pm-impact-val { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
details.dsh-pm-prompt { border: 1px solid var(--pm-line, #e5e7eb); border-radius: 6px; margin: 6px 0; background: var(--pm-bg-soft, #fbfbfc); }
details.dsh-pm-prompt > summary { list-style: none; cursor: pointer; padding: 7px 10px; font-size: 12px;
  display: flex; align-items: center; gap: 8px; }
details.dsh-pm-prompt > summary::-webkit-details-marker { display: none; }
details.dsh-pm-prompt > summary::before { content: '\\25B8'; color: var(--dsw-text-secondary, #999); font-size: 10px; }
details.dsh-pm-prompt[open] > summary::before { transform: rotate(90deg); }
details.dsh-pm-prompt > summary:hover { background: var(--dsw-hover, rgba(128,128,128,.08)); }
.dsh-pm-prompt-name { font-weight: 600; color: var(--dsw-text-primary, #333); }
.dsh-pm-prompt-meta { margin-left: auto; color: var(--dsw-text-secondary, #999); font-variant-numeric: tabular-nums; }
.dsh-pm-prompt-text { margin: 0; padding: 10px 12px; border-top: 1px dashed var(--pm-line, #e5e7eb);
  background: var(--dsw-bg-primary, #fff); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.55; color: var(--dsw-text-primary, #3b4048);
  white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
/* 会话顶部流程图：节点内**上下两行**（REQ-261004151652-d535 FR-1）——名字在上、该节点 token 在下。
   为什么要纵向：横排时 7 节点名 + 数字 + 连线要 358px（节点被压到 32px 最小宽时数字还会串成
   「827.8k10.9M922.0k12.7M」）；纵向实测只要 214px（省 40%），这才让「每节点数」在窄窗口留得住。

   字号与配色（验收反馈「字体太大、颜色不对」后定稿）：
     · 数字**与名字同号（8px）**，不再比名字大——名字是主、数字是辅，两者才像一套；
     · 数字用**次要灰**（--dsw-text-secondary），不用正文黑：它不该压过带状态色的节点名；
     · 名字保留原有的状态色（已完成绿 / 当前蓝 / 未到灰），那是「我在哪」的语义色，不动。 */
.dsh-pm-flow-meta { display: flex; flex-direction: column; align-items: center; gap: 0; white-space: nowrap; }
.dsh-pm-flow-token { font-size: 8px; color: var(--dsw-text-secondary, #8a9099); font-variant-numeric: tabular-nums; line-height: 1.15; }
/* 卡面 / 列表：累计 token 徽章 */
.dsh-pm-token-badge { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; font-size: 9px;
  padding: 1px 6px; border-radius: 9px; background: rgba(194, 37, 92, .10); color: #c2255c; font-variant-numeric: tabular-nums; }
/* 会话顶部流程图：需求累计 Token 徽章（REQ-261004143941-b2ca 交付；REQ-261004151652-d535 FR-3 改显隐策略）。
   **默认隐藏**：宽档里「各节点相加」就是总数，再挂一个是重复信息；只有明细全隐的窄档
   （styles/board.ts 的 label 档块，容器 ≤600px）才把它显示出来让位。降级路径（无容器查询）下默认隐藏
   同样正确——那时全部明细可见，总数冗余。 */
.dsh-pm-cprog-token-total { display: none; margin-left: 0; flex: none; }
.dsh-pm-cprog-token-ico { font-size: 9px; line-height: 1; }
`
