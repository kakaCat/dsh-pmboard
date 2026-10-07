/**
 * panels · dialogue.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放对话面板；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const DIALOGUE_CSS = `   ⑧ 对话 Tab（dialogue）
   ══════════════════════════════════════════════════════════════════════════ */

/* ── FR-6 对话聊天气泡（REQ-261006130057-7a43 t7）──
   蓝本 = 原型 detail.html v1.5「#FR-6」（D-5 气泡 / D-6 只读 / D-7 吸顶分页条）：
   「人」靠右蓝实心（白字）+ 右圆形头像「人」；窗口/agent 靠左浅紫 + 左头像（w/a）；
   系统事件居中灰丸不占气泡；长日志折叠一行 + 「长日志已收纳」琥珀标 + 「展开」；
   吸顶分页条 = .dsh-pm-chat-scroll 内部第一个子元素 sticky top:0；底部只读说明行。
   令牌纪律：规则体只引 --pm-* 令牌；本块自有的色值先成本块局部令牌（色值只从
   --pm-accent / --pm-surface / --pm-bg-soft 推导，浅紫基调是本块新增的唯一裸色值）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue {
  display: block; min-width: 0;
  /* 浅紫基调（原型 --violet 一档）：agent 气泡底 / 描边 / 头像都由它 color-mix 推导 */
  --pm-chat-violet: #7c3aed;
  --pm-chat-agent-bg: color-mix(in srgb, var(--pm-chat-violet) 10%, var(--pm-surface));
  --pm-chat-agent-line: color-mix(in srgb, var(--pm-chat-violet) 22%, var(--pm-surface));
  /* 吸顶分页条浅蓝底（原型 --primary-weak 一档）：与 --pm-tab-active-bg 同一推导法 */
  --pm-chat-pager-bg: color-mix(in srgb, var(--pm-accent) 10%, var(--pm-surface));
  --pm-chat-pager-line: color-mix(in srgb, var(--pm-accent) 25%, var(--pm-surface));
  --pm-chat-avatar-size: 26px;
  --pm-chat-bubble-fs: 12.5px;
  --pm-chat-time-fs: 10.5px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-note { font-size: var(--f-small); color: var(--pm-warn-text); margin-bottom: var(--s2); }
/* 正序消息流：旧在上新在下，固定高 460px 内滚动（「无内层滚动」铁律的唯一豁免）；
   顶部 padding 取 0：吸顶分页条直接顶住滚动口上沿，消息不会在条的上方透出 */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-scroll {
  /* D-13 页面适配：高度随视口走（不再固定 460px 小窗）——
     占满 Tab 栏以下可用高度：视口高 − 头部/状态带/Tab 栏的实测量（约 420px），
     下夹 320px（矮屏仍可用）、上夹 880px（超长屏不拉成空窗）。宽度由面板撑满。 */
  height: clamp(320px, calc(100vh - 420px), 880px);
  overflow-y: auto; padding: 0 var(--s1) var(--s3) 2px;
  display: flex; flex-direction: column; gap: var(--s2); min-width: 0;
}
/* 吸顶醒目分页条（D-7）：不透明浅蓝底 + 圆角 + 发丝边框 + 轻投影，滚动时消息从它下面滑过 */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-pager {
  position: sticky; top: 0; z-index: 3; align-self: stretch;
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  padding: var(--s2) var(--s3);
  background: var(--pm-chat-pager-bg); border: var(--pm-hair) solid var(--pm-chat-pager-line);
  border-radius: var(--r1); box-shadow: 0 1px 3px rgba(15, 23, 42, .10);
  font-size: var(--f-small); color: var(--pm-text2);
}
/* 「↑ 加载更早消息」实心主色小按钮（降级/到底时禁用但留在原地：按钮的有无不随数据变化） */
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier {
  background: var(--pm-accent); border-color: transparent; color: #fff;
  padding: var(--s1) var(--s2); min-height: var(--pm-target);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier:hover:not([disabled]) { background: var(--pm-accent-hover); }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-earlier[disabled] { opacity: .55; cursor: default; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-pg { display: inline-flex; align-items: baseline; gap: var(--s2); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-page { font-family: var(--pm-mono); font-size: var(--f-small); font-weight: 700; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-loaded { font-size: var(--f-tiny); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-chat-note { margin-left: auto; font-size: var(--f-tiny); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
/* 一条气泡消息：头像 +（名字签行 + 气泡）；右列（人）整行右对齐、头像在右 */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg {
  margin: 0; padding: 0; min-width: 0; border: 0; background: none;
  font-size: var(--f-body); line-height: var(--lh-body);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg { display: flex; gap: var(--s2); align-items: flex-start; max-width: 76%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right { align-self: flex-end; flex-direction: row-reverse; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--left { align-self: flex-start; }
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar {
  flex: none; width: var(--pm-chat-avatar-size); height: var(--pm-chat-avatar-size);
  border-radius: var(--pm-pill); display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: var(--f-small); font-weight: 700; line-height: 1;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar--human { background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-avatar--agent { background: var(--pm-chat-violet); }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg-col { min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg-meta { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--f-tiny); margin: 0 2px 3px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right .dsh-pm-cmsg-meta { justify-content: flex-end; }
.dsh-pm-detail[data-report-shell] .dsh-pm-who { font-weight: 600; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-time {
  font-family: var(--pm-mono); font-size: var(--pm-chat-time-fs);
  color: var(--pm-text2); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble {
  border-radius: var(--r1); padding: 7px var(--s3);
  font-size: var(--pm-chat-bubble-fs); line-height: 1.55; word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--right .dsh-pm-bubble { border-top-right-radius: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg--left .dsh-pm-bubble { border-top-left-radius: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--human { background: var(--pm-accent); color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--agent {
  background: var(--pm-chat-agent-bg); color: var(--pm-text);
  border: var(--pm-hair) solid var(--pm-chat-agent-line);
}
/* 琥珀小旗（「长日志已收纳」/「回填」同族）：描边取 currentColor，不新增色值 */
.dsh-pm-detail[data-report-shell] .dsh-pm-b-flag {
  display: inline-block; font-size: var(--f-tiny); color: var(--pm-warn-text);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px; margin-right: 6px;
}
/* 长日志气泡：默认折叠成一行（details 合上），「展开」就地放开（details 打开显示完整气泡） */
.dsh-pm-detail[data-report-shell] .dsh-pm-long-head { list-style: none; cursor: pointer; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-head::-webkit-details-marker { display: none; }
/* 长日志气泡：与评论区的 .dsh-pm-comment-body--clip 同一个坑（2026-10-07「详情页面不适配」）——
   white-space: nowrap 的文本 min-content = 整行宽，会一路把壳的 min-content 顶到 1280 以上，
   于是 <1280 视口里壳不收缩、被宿主静默裁掉。contain: inline-size 把内联尺寸与内容解耦，
   省略号照旧、高度照旧，只把内在尺寸贡献清零。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-bubble--long {
  display: block; contain: inline-size; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-long[open] .dsh-pm-bubble--long { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-toggle { display: inline-block; font-size: var(--f-tiny); color: var(--pm-accent-text); padding: 3px 2px 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long-toggle:hover { text-decoration: underline; }
.dsh-pm-detail[data-report-shell] .dsh-pm-long:not([open]) .dsh-pm-long-close,
.dsh-pm-detail[data-report-shell] .dsh-pm-long[open] .dsh-pm-long-open { display: none; }
/* 长日志那条消息：**整条占满气泡栏（76%），列吃满余量**。
   为什么必须补这一条：上面的 .dsh-pm-bubble--long { contain: inline-size } 把这一格的内联尺寸
   与内容解耦（这是"详情页能适配窄窗"的前提，见片尾 ㉑ ⑤），副作用是它的 **max-content 也变成 0**——
   而 .dsh-pm-cmsg（消息行）与 .dsh-pm-cmsg-col（气泡栏）本来是**按内容收缩**的，于是整条
   收缩成"标记 + 展开"那么宽（实测 130px，气泡里只剩「长日志已收纳 […]」）。
   修法：含长日志折叠的消息行给 width: 100%（仍受 .dsh-pm-cmsg 的 max-width: 76% 约束），
   气泡栏 flex: 1 1 auto 吃满该行余量 → 收纳行按"一行截断 + 省略号"铺满 76%，
   与原型里长日志气泡的宽度口径一致。:has() 是既有用法（⑲ 段 .dsh-pm-stat:has(...) 先例）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg:has(.dsh-pm-long) { width: 100%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-cmsg:has(.dsh-pm-long) > .dsh-pm-cmsg-col { flex: 1 1 auto; min-width: 0; }
/* 系统消息：居中灰色小丸（不占气泡），回填标琥珀 */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--system {
  align-self: center; text-align: center; font-size: var(--f-tiny); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-system-pill {
  display: inline-flex; align-items: baseline; justify-content: center; gap: var(--s2); flex-wrap: wrap;
  background: var(--pm-bg-soft); border: var(--pm-hair) solid var(--pm-line);
  border-radius: var(--pm-pill); padding: 1px 10px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-system-text { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred { color: var(--pm-warn-text); font-size: var(--f-tiny); }
/* 只读说明行（D-6：对话是历史聊天记录，无发送入口、无检索框） */
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-ro {
  margin-top: var(--s3); padding-top: var(--s2); border-top: var(--pm-hair) solid var(--pm-line);
  text-align: center; font-size: var(--f-tiny); color: var(--pm-text2);
}

/* ══════════════════════════════════════════════════════════════════════════
`
