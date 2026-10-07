/**
 * base.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放基底规则（面板包装器 / 隐藏钉法 / 折叠块合上必须藏）；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const BASE_CSS = `
/* ══════════════════════════════════════════════════════════════════════════

   ⓪ 基底：面板包装器不吃内层滚动 · 消息隐藏规则钉死
   ══════════════════════════════════════════════════════════════════════════ */

/* 面板包装器：一律铺开（FR-11 #7）。这条是壳体契约，不加作用域前缀也要成立。 */
.dsh-pm-tab-panel { display: block; }

/* 对话面板：被标 hidden 的消息必须真的看不见。
   下面 ⑧ 段把 .dsh-pm-msg 写成了 display:flex，故这里必须用更高特异性（+1 个类 = .dsh-pm-detail[data-report-shell]）
   才盖得住；两条都留，防的是"后人又给 .dsh-pm-msg 加了一条 display"。 */
.dsh-pm-msg[hidden],
.dsh-pm-msg[data-msg-hit="0"] { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[hidden],
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[data-msg-hit="0"] { display: none; }

/* 折叠块：**合上时非 summary 内容必须藏起来——由本片自己钉死，不依赖引擎的 UA 实现**。
   ⚠️ 事故出处（2026-10-07，人给图：「对话气泡的收纳行和全文同时显示」）：
   Chromium 131 起把这件事从"影子槽（不可覆盖）"改成了**一条可被作者样式覆盖的 UA 规则**
   （details:not([open]) > :not(summary) { display: none } + ::details-content 的
   content-visibility）。同一份产物在 Chrome 154（开发机）上正常、在 Electron/Chromium 152
   （DSH 桌面端）上漏出全文——**靠 UA 的行为在不同引擎版本间不可靠**，而这一条恰是"折叠有没有
   生效"的唯一开关。本仓早有同款先例：上面两条 [hidden] 的钉法（理由一模一样：UA 的隐藏规则
   会被作者样式的 display 盖掉）。
   特异性：.dsh-pm-detail(0,1,0)+[data-report-shell](0,1,0)+details(0,0,1)+:not([open])(0,1,0)
   +:not(summary)(0,0,1) = (0,3,2)，高于本片任何给气泡/正文设 display 的规则（如 .dsh-pm-bubble--long
   的 display:block = (0,3,0)）；:not() 只取参数自身的特异性，故不会误盖 summary 自己。 */
.dsh-pm-detail[data-report-shell] details:not([open]) > :not(summary) { display: none; }
/* ══════════════════════════════════════════════════════════════════════════
`
