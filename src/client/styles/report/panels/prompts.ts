/**
 * panels · prompts.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放提示词面板；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const PROMPTS_CSS = `   ⑩ 提示词 Tab（prompts）：原型 .frag / pre.prompt-text / .spec-vs / .sv-col / .ctx-line
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-prompts { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-sec { display: block; padding: 0; border: 0; background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt,
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt {
  margin: 0 0 var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: none; overflow: visible;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary {
  display: flex; align-items: center; gap: var(--s2); padding: var(--s2) var(--s3);
  font-size: var(--f-small); color: var(--pm-text2); background: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary:hover { background: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::-webkit-details-marker { display: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::before {
  content: '\\25B8'; color: var(--pm-text3); font-size: var(--f-tiny); transform: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[open] > summary::before { content: '\\25BE'; transform: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-name { font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 400; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-meta { margin-left: auto; font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
/* 被裁片段 = 原型 .frag.trimmed（虚线橙） */
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[data-prompt-trimmed] {
  border-style: solid; border-color: var(--pm-line); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-pre { display: block; width: auto; margin: var(--s2) var(--s3) var(--s3); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > .dsh-pm-prompt-pre,
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt .dsh-pm-prompt-pre { border-radius: var(--r1); }
/* 规定 vs 实际 = 原型 .spec-vs / .sv-col / .sv-h */
.dsh-pm-detail[data-report-shell] .dsh-pm-specvs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-col {
  display: block; min-width: 0; padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-h { font-size: var(--f-small); color: var(--pm-text2); margin-bottom: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list { margin: 0; padding-left: var(--s4); font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list code { font-family: var(--pm-mono); font-size: var(--f-tiny); word-break: break-all; }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-trimmed { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-frags { display: flex; flex-wrap: wrap; gap: var(--s1); font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff { font-size: var(--f-small); line-height: 1.65; color: var(--pm-text2); word-break: break-word; }
/* 片段芯片（可点开源文件 / 路由壳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-np-doc {
  font-family: var(--pm-mono); font-size: var(--f-tiny); padding: var(--s1) var(--s2); cursor: pointer;
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: var(--pm-surface); color: var(--pm-accent-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-np-shell {
  font-family: var(--pm-mono); font-size: var(--f-tiny); padding: var(--s1) var(--s2); border: .5px solid var(--pm-line);
  border-radius: var(--r1); color: var(--pm-text2);
}
/* 注入留痕 = 原型「三个来源 / 两种后果」的逐条卡（左侧色条按后果上色） */
.dsh-pm-detail[data-report-shell] .dsh-pm-inj {
  display: block; margin-bottom: var(--s2); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line);
  border-radius: var(--r1); background: none; font-size: var(--f-small);
}
/* 送达三态：左侧色条取消，后果只落在**结论词**上（FR-10 (三) 3：语义色只出现在状态点 / 图标 / 结论词 / 错误文字）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="true"] .dsh-pm-inj-verdict { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="false"] .dsh-pm-inj-verdict { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="unknown"] .dsh-pm-inj-verdict { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-meta { font-size: var(--f-small); color: var(--pm-text2); font-family: var(--pm-mono); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-verdict { font-size: var(--f-body); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-line { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-frags { display: flex; flex-wrap: wrap; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-body,
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body {
  margin-top: var(--s2); padding: var(--s2) var(--s3);
  border: .5px solid var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body > summary { font-size: var(--f-small); color: var(--pm-text2); cursor: pointer; }
/* 上下文 / 节点隔离留痕 */
.dsh-pm-detail[data-report-shell] .dsh-pm-iso,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso {
  display: block; margin-top: var(--s2); padding: var(--s1) var(--s3);
  border: .5px solid var(--pm-line);
  border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-status,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-status { font-size: var(--f-tiny); font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-meta,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-meta { font-size: var(--f-tiny); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-reason,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-reason { font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text); word-break: break-word; }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-entry { margin-bottom: var(--s2); }


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：14 条，只服务 prompts ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

/* ③ 提示词注入信息 chips（原型 .info-strip/.chip：细边小条，数字等宽） */
.dsh-pm-detail[data-report-shell] .dsh-pm-chips { display: flex; flex-wrap: wrap; gap: var(--s2); margin: 0 0 var(--s2); }

/* 被裁片段「已截断」标（原型 .frag .f-trim：**琥珀字、无边框**——逐字对齐原型） */
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-trim {
  flex: none; font-size: var(--f-tiny); color: var(--pm-warn-text); white-space: nowrap;
}

/* ③b 片段行（原型 .frag：一行摘要 + 行尾「展开/收起」就地展开；D-10/D-11 返工）
   —— 默认视图只有一行：段名（等宽）+ 类型标 + 字符数（等宽右对齐）+ 一行摘要 + 展开词；
   正文留在同一个 <details> 里，点开就地铺开（无内层滚动，FR-11 #7）。 */
.dsh-pm-detail[data-report-shell] details.dsh-pm-frag {
  display: block; margin: 0; padding: 0; overflow: visible;
  border: 0; border-top: var(--pm-hair) solid var(--pm-line); border-radius: 0; background: none;
}

.dsh-pm-detail[data-report-shell] details.dsh-pm-frag > summary {
  display: flex; align-items: baseline; gap: var(--s2); padding: 5px 0;
  font-size: var(--f-small); color: var(--pm-text2); background: none; cursor: pointer; list-style: none;
}

.dsh-pm-detail[data-report-shell] details.dsh-pm-frag > summary::-webkit-details-marker { display: none; }

.dsh-pm-detail[data-report-shell] .dsh-pm-frag-id {
  flex: none; font-family: var(--pm-mono); font-size: var(--f-tiny); font-weight: 600; color: var(--pm-text);
  word-break: break-all;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-frag-kind {
  flex: none; font-size: var(--f-tiny); color: var(--pm-text2);
  border: var(--pm-hair) solid var(--pm-line); border-radius: var(--r1); padding: 0 5px; background: none;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-frag-chars {
  flex: none; min-width: 72px; text-align: right;
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-frag-text {
  flex: 1 1 auto; min-width: 0; color: var(--pm-text2); font-size: var(--f-small);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 展开后摘要行不再单行截断（原型 .frag.open .f-text 同口径），全文在下方 code block 里 */
.dsh-pm-detail[data-report-shell] details.dsh-pm-frag[open] > summary .dsh-pm-frag-text {
  white-space: normal; word-break: break-word;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-frag-toggle {
  flex: none; font-size: var(--f-tiny); color: var(--pm-accent-text); white-space: nowrap;
}

/* 双态词：显哪个由原生 details[open] 决定（与最近评论长日志收纳同机制；
   选择器不绑容器类——片段行与「完整系统提示词」折叠用的是同一对词） */
.dsh-pm-detail[data-report-shell] details:not([open]) > summary .dsh-pm-frag-close,
.dsh-pm-detail[data-report-shell] details[open] > summary .dsh-pm-frag-open { display: none; }

/* 展开出来的正文：行内通栏铺开（左右不留缩进，才像原型那段 .prompt-text） */
.dsh-pm-detail[data-report-shell] details.dsh-pm-frag > .dsh-pm-prompt-pre {
  margin: var(--s2) 0 var(--s3); border-radius: var(--r1);
}

/* 提示词分节（原型 .blk 同款）：容器已用 flex gap 排版，卡只出外观、不叠 margin */
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-sec {
  margin: 0;
  padding: var(--pm-card-pad-y) var(--pm-card-pad-x);
  background: var(--pm-surface);
  border: var(--pm-card-line) solid var(--pm-line);
  border-radius: var(--r1);
}

/* ── 归位：跨组件小标题组的提示词侧（REQ-261007133149-0716 t4）——声明逐字保留 ── */
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h
{
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: var(--s4) 0 var(--s2); font-size: var(--f-h2); font-weight: 600; color: var(--pm-text);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-prompts > .dsh-pm-pp-sec:first-child > .dsh-pm-pp-h:first-child
{ margin-top: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h-note
{ font-size: var(--f-small); font-weight: 400; color: var(--pm-text2); }
/* ══════════════════════════════════════════════════════════════════════════
`
