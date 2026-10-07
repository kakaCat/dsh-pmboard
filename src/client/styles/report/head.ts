/**
 * head.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放常驻头部（含闸门条 / 阶段条 / 最近评论）；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const HEAD_CSS = `   ② 常驻头部（对应原型 .head / .head-top / .chip / h1.title / .verdict / .stages / .actions / .winbtn）
   ══════════════════════════════════════════════════════════════════════════ */

/* 头部整块 = 一张**卡片**（人裁定，2026-10-05）：「这个里（动作条 + 身份行 + 标题）原型是卡片」。
   ⚠️ 这条**推翻了本需求已确认的 FR-10 (三) 2**（原文：「底色只两档：白 + #f5f5f7（分组底）。
   **头部/操作条/评论不加底色**」），也**不是**原型 v2/v3 的现状（两边渲染都是平的）。以人的裁量为准。
   ⚠️ **卡底色 = 白**（2026-10-07 人裁定：「卡片颜色原型改成了白色底」）。此前一轮是灰底卡
   （--pm-bg-soft，理由是"白底 + 发丝边在白页上几乎不可见"）；权威原型 v1.5 的
   .pm-card / .band-cell / .tabs 一律 background: var(--card) = #FFFFFF + 1px #E2E8F0 描边
   ——卡与页的分别由**描边 + 圆角**承担，不由底色承担。故头部 / 状态带三格 / Tab 栏
   在片尾 ㉑ 卡片语汇里统一改白面 + 1px 描边；本条的灰底值已被那层覆盖（留作历史出处）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s2);
  padding: var(--s3) var(--s4);
  background: var(--pm-bg-soft); border: 0; border-radius: var(--r1);
}
/* 身份行（原型 .head-top）= **头部第二行**（FR-9 第 7 项 / D-8）：
   id · 状态芯片 · 分类 · 难度 · 「停留/更新」+ **靠左的窗口组** + 行尾「创建于 …」。
   「flex-basis: 100%」让它独占整行——动作行（「.dsh-pm-rh-bar」）排第一行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  flex-basis: 100%; min-width: 0; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-card-id {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
}
/* 状态胶囊 = **全页唯一的胶囊**（FR-10 (三) 1）：999px、11px/500、**无底色**，靠文字色区分状态。
   旧写法是"主色 12% 浅底 + 主色字 + 600"——满地胶囊与 12% 语义底的起因；底色与描边一并取消。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-status {
  font-size: var(--f-tiny); font-weight: 500; line-height: var(--lh-tiny);
  padding: 0; border: 0; border-radius: var(--pm-pill);
  background: none; color: var(--pm-accent-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"],
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { background: none; color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { background: none; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { background: none; color: var(--pm-teal-text); }
/* 分类 / 难度 / 阻塞理由 = **纯文本 + 「·」分隔**（FR-10 (三) 1：元信息全部去胶囊）。
   分隔符由第 ⑰ 节的 ::before 画（DOM 归属是 report-head.ts，本卡只出外观）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); padding: 0;
  border: 0; border-radius: 0; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta[data-blocked-reason] {
  border: 0; color: var(--pm-text2); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-flag {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); padding: 0; border-radius: 0;
  background: none; color: var(--pm-text2); border: 0;
}
/* 「停留 … · 距上次更新 …」在身份行里**不再右推**（FR-9 第 7 项 / D-8）：
   行尾的位置留给「创建于 …」，窗口组才有"靠左、在创建于左侧"可言——两者都在这一行里
   按顺序左起排，只有一个元素吃「margin-left: auto」（见下面「[data-created-at]」）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-updated {
  font-size: var(--f-small); color: var(--pm-text2);
  font-variant-numeric: tabular-nums;
}
/* 标题 = 原型 h1.title（21px / 660 / 1.32 / -0.2px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  flex-basis: 100%; margin: var(--s2) 0 0; font-size: var(--f-h1); font-weight: 600;
  line-height: var(--lh-h1); letter-spacing: -.4px; color: var(--pm-text);
}
/* 身份行的**行尾** = 「创建于 …」（FR-9 第 7 项 / D-8：窗口组靠左，创建时刻仍在行尾右侧）。
   DOM 归属是 report-head.ts（本卡只出外观）：「[data-created-at]」就是那一格。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] {
  margin-left: auto; font-size: var(--f-small);
}
/* 身份行里的窗口组：**靠左**（撤掉 D-4 时期"贴右缘"的「margin-left: auto」），
   并抹掉分组标签从旧操作条带来的上内边距（它现在与元信息同一条基线）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows { margin-left: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows > .dsh-pm-action-bar-label {
  padding-top: 0; font-size: var(--f-tiny);
}
/* 一句话结论 = 原型 .verdict（左侧 3px 主色条 + 13.5px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  flex-basis: 100%; margin-top: var(--s2); padding: 0 0 0 var(--s3);
  border: 0; border-left: 3px solid var(--pm-accent); border-radius: 0; background: none;
  font-size: var(--f-h2); font-weight: 400; line-height: var(--lh-h2); color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  flex-basis: 100%; font-size: var(--f-small); line-height: 1.5; color: var(--pm-text2);
}
/* 阶段条 = 原型 .stages / .stage：**进度条不是胶囊**（FR-10 (三) 1 点名）——4px 条形 + 8px 圆角
   （浏览器按半高收成 2px 端头）；done 绿 / cur 蓝，未开始段走分组底（白岛上看得见，且不多一种底色）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  flex-basis: 100%; display: flex; gap: var(--s1);
  margin: var(--s2) 0 0; padding: 0; max-width: 520px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot {
  width: 100%; height: 4px; border-radius: var(--r1); opacity: 1;
  /* 未开始阶段段：分组底（--pm-bg-soft）——不再是发丝线色，也不引入新的底色种类。 */
  background: var(--pm-bg-soft);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot {
  width: 100%; height: 4px; background: var(--pm-accent); box-shadow: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label {
  font-size: var(--f-tiny); line-height: var(--lh-tiny); color: var(--pm-text2); text-align: center; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label,
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot-label {
  color: var(--pm-text); font-weight: 600;
}
/* 三态的非颜色标记（FR-8 #1）：✓（完成）/ ▸（当前）/ 空（未开始）——**真实文本节点**
   （由 stage-detail.ts 输出，不是 ::before）。未开始那一档没有标记，这里只管它的字重一致。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-mark { font-weight: 600; }
/* 操作条（FR-10 (三) 7 + FR-9 第 1/6/7 项）：**头部第一行**——动作行独占整行、左对齐，
   不与身份行（第二行）同排。不再是灰底框，也不再带"上方一条分隔线"：它自己已经是最上面那一块，
   分隔线由头部自己的下边框承担（「box-shadow: none」的纪律见第 ⑰ 节）。
   层级仍是「← 看板」｜ 动作组 ｜ 「需人工确认」；按钮区自己承担换行，行尾标不参与它的换行计算。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  flex-basis: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  margin: 0; padding: 0; background: none; border: 0; border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar .dsh-pm-report-actions {
  flex: 0 1 auto; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  padding: 0; border: 0; background: none;
}
/* 按钮区：**弹性流**（FR-9 第 1/4 项：动作不拉伸、按序紧挨）。
   为什么不是等宽栅格（「repeat(auto-fit, minmax(150px, 1fr))」）：栅格把每个动作拉成"第 i/N 列"，
   N 一变位置就变——破坏性动作的落点随动作数量漂移，TC-20 直接判红。
   内容宽度的弹性流里，主操作左缘恒等于动作区左端、破坏性动作恒接在前一个动作之后。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid {
  flex: 0 1 auto; min-width: 0; display: flex; align-items: flex-start; flex-wrap: wrap;
  gap: var(--s1) var(--s3);
}
/* 破坏性动作：恒排**最后**（顺序由 report-head.ts 定），且与前一个动作留 ≥24px 明确空隙
   （FR-9 第 3 项 / D-7 修订：动作组整体靠左之后不再有"行尾"可言）。
   撤销的是 D-4 时期「[data-action-rank="danger"]{margin-left:auto}」的"推行尾"机制——
   那正是「取消立项」被推到窗口组右边、与身份行同排的原因（人 2026-10-05 指出的错排）。
   「:not(:first-child)」：FR-9 第 3 项说的是"**与前一个动作**留空隙"——当阶段里**只有**破坏性
   动作时它没有前一个动作，此时它必须与其它动作一样贴动作区左缘（"动作组左端恒等于卡片内容区左缘"，
   FR-9 第 4 项），不许凭空缩进 24px。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid > [data-action-rank="danger"]:not(:first-child) {
  margin-left: 24px;
}
/* 分组标签（「本阶段操作」/「窗口」/「最近评论 N 条」共用同一个 class）：
   操作条那一处已按 FR-11 #1 **真删**（DOM 层，不是 CSS 隐藏），这里留下的是**评论列表**与
   **窗口组**的用法——所以这条规则不许跟着删（删了评论列表的标签就没样式了）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-action-bar-label {
  font-size: var(--f-small); color: var(--pm-text2); padding-top: var(--s2); white-space: nowrap;
}
/* 每个动作 = 一格：**只有按钮**（说明不挨着按钮，常驻可见区没有后果文字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); min-width: 0; max-width: 100%;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { white-space: nowrap; }
/* 后果节点（FR-11 #2）：**保留 class 名**（断言与审计按它取节点），但退出可见流——
   文本 === 服务端「consequence」，由主操作的「aria-describedby」指向它。
   规则本身仍是"一行灰字"的旧口径（供将来任何可见用法），真正的隐藏由下面的 .dsh-pm-sr-only 施加。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-action-consequence {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden;
  max-width: 100%; font-size: var(--f-tiny); line-height: 1.4; color: var(--pm-text2);
}
/* 视觉隐藏但读屏可访问（FR-11 #2）：1px 裁切 + clip-path。
   为什么不是 display:none / visibility:hidden：那会把节点从可访问树里摘掉，读屏读不到后果，
   正是 FR-11 要防的 hover-only 反模式（触屏 / 键盘同样拿不到）。
   为什么绝对定位：它不占可见流，操作条整块高不因它变化（A6 的 ≤72px 与"按钮同一行"两条回归线）。
   注意：**不许**给它「display」之外的可见盒，也不许把 1px 盒改成其它尺寸（判据量的是它的可见性）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
/* 行尾统一标一次（11px 灰字，不是三个粉色实心块）：逐按钮重复会被读成"要点三次"。
   每格各自是否人工门写在 data-human-only="true" 上（机器可读）。
   「margin-top」已归零：它原先是"跟分组标签的下内边距对齐"的补偿，标签删了（FR-11 #1），
   现在靠操作行的「align-items: center」与按钮同一条中线。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-human-only {
  font-size: var(--f-tiny); font-weight: 400; padding: 0; border: 0; border-radius: 0;
  background: none; color: var(--pm-text2); white-space: nowrap; margin-top: 0;
}
/* 危险动作（取消这类）：红色 + 弱化（描边不实心），**排最后**（Pajamas · Destructive actions） */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { border-color: var(--pm-danger); color: var(--pm-danger); background: var(--pm-surface); }
/* 终态只读说明：跟「← 看板」同一行的居中项，不单独占一行（操作行的 align-items: center 负责基线）。
   旧分片 base.ts 给的是琥珀浅底 + 琥珀边线（多出第 3 种底色 / 第 3 种边线色）→ 收成纯文字。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate { font-size: var(--f-small); color: var(--pm-text2); background: none; border: 0; }
/* 窗口跳转 = 原型 .winbtn（等宽小胶囊） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-windows {
  display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--s2); padding: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window {
  font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover {
  border-color: var(--pm-accent); color: var(--pm-accent-text); background: var(--pm-surface);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: solid; color: var(--pm-text2); }
/* 按钮 = 原型 .abtn */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn {
  padding: var(--s1) var(--s3); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: var(--f-small); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:hover { border-color: var(--pm-accent); color: var(--pm-accent-text); background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary {
  background: var(--pm-accent); border-color: transparent; color: #fff;
}
/* 输入框（评论 / 回复 / 检索）：原型 .replybox input */
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: var(--f-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-input::placeholder { color: var(--pm-text2); }
/* 评论列表（头部最近几条）：紧凑流式块——列表在上、输入框在下（与"新的在下"同向） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments {
  flex-basis: 100%; display: flex; flex-direction: column; gap: 0; margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  font-size: var(--f-tiny); color: var(--pm-text2); margin-bottom: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment {
  display: flex; align-items: baseline; gap: var(--s2); min-width: 0;
  padding: 0; border: 0; border-bottom: .5px solid var(--pm-line); border-radius: 0;
  background: none;   /* 旧分片 base.ts 给 .dsh-pm-comment 铺过 rgba(128,128,128,.05)：评论不加底色（FR-10 #2），这里显式压掉 */
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment:last-child { border-bottom: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-meta { flex: none; font-size: var(--f-tiny); color: var(--pm-text2); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who { font-weight: 600; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who[data-actor="human"] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag { color: var(--pm-text2); font-weight: 500; }
/* 正文最多两行（全文在 title 属性里，一字不丢；再长的那类是机器转储，已在渲染层收纳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body {
  flex: 1 1 auto; min-width: 0;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  font-size: var(--f-small); line-height: 1.35; color: var(--pm-text); word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form {
  flex-basis: 100%; display: flex; gap: var(--s2); margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-input { flex: 1 1 auto; min-width: 0; padding: var(--s1) var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-btn { padding: var(--s1) var(--s2); }


/* ── 归位自片尾覆盖层（REQ-261007133149-0716 t4）：47 条，只服务 head ──
   这些规则原先散在公共层的片尾（⑰/⑲/㉑ 等）；声明**逐字保留**，只换了住处。
   组装顺序变化由判据一（scripts/report-style-snapshot.mts 逐组件计算样式快照）守着。 */

/* ══════════════════════════════════════════════════════════════════════════
   ⑰ 视觉语言收敛的落点（FR-10；卡 t-efa046 ＝ 计划 t8）
   ——对应原型 「#FR-10」 段。取消清单（12% 语义浅底 / 彩色边线 / 紫前景 / 中间底色档 /
     4px 与 6px 圆角 / 卡片阴影）已在上面逐处落到位；这里补两处"既有规则没有位置"的落点。
   ══════════════════════════════════════════════════════════════════════════ */

/* ① 元信息之间的「·」分隔（FR-10 (三) 1：分类 / 难度改纯文本 + 分隔符）。
      DOM 归属是 report-head.ts（本卡不动渲染层），所以分隔符用伪元素画：不新增节点、不改文本、
      不进食读屏（伪元素内容不进可访问名）；色取三级灰——它是**装饰**，不承载信息。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-meta::before {
  content: '·'; margin-right: var(--s1); color: var(--pm-text3);
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑲ 设计契约落地层（REQ-261005155003-f32f · 权威原型 v2 的「改造层」逐段并进）
   ──────────────────────────────────────────────────────────────────────────
   为什么要有这一段：设计契约写在原型 v2 的「改造层」里（95 条规则），实施期漏了一批
   （2026-10-05 人眼发现 Tab 栏整段没落地：设计是**苹果分段控件**，实现是下划线式），
   而原型 v3 又被"重新内联成实现的渲染"，把偏离固化成了"零漂移"——判据从此照不出来。
   现在按设计层自己的原话落地：「选择器去掉前缀即可，其余一字不改」。
   排除清单（**有裁定取代，不能照搬**，逐条给依据）：
     · .dsh-pm-rh-bar            → D-8 把动作行移到头部第一行，上发丝线/上内边距作废
     · .dsh-pm-detail-title      → FR-12/FR-10(四) 勘误：页标题就是 24px（设计层写 20px 与勘误相抵）
     · [data-action-rank=danger] → D-8 裁定 A：紧跟主操作、margin-left: 24px
     · .dsh-pm-tabs / .dsh-pm-tab / -tab-icon → 本轮已按设计层落地，见上面 ④ 段
     · 令牌块                    → 实现自己的 token 段持有（--pm-hair / --pm-accent-hover 已补齐）
   防复发：scripts/req-detail-design-conformance.mts 会把这一层再叠一次并断言"叠不叠都一样"——
   本段哪天被删/被改偏，脚本当场红。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] .dsh-pm-status { padding: 0; border: 0; border-radius: var(--pm-pill); background: none; font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 500; color: var(--pm-accent); }

.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"], .dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { color: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { color: var(--pm-warn-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell]
  .dsh-pm-rh-top > :not(.dsh-pm-detail-updated) + :not(.dsh-pm-detail-updated)::before { content: '· '; color: var(--pm-text3); }

.dsh-pm-detail[data-report-shell] .dsh-pm-gate { padding: 6px 0 0; background: none; }

.dsh-pm-detail[data-report-shell] .dsh-pm-dot { width: 100%; height: 4px; border-radius: 8px; opacity: 1; background: var(--pm-bg-soft); }

.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot { width: 100%; height: 4px; background: var(--pm-accent); box-shadow: none; }

.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict { padding: 0; border: 0; border-radius: 0; background: none; font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 400; color: var(--pm-text); }

.dsh-pm-detail[data-report-shell] .dsh-pm-window { padding: 1px 8px; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover { border-color: var(--pm-line-strong); color: var(--pm-text); background: none; }

.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: dashed; color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-card-id { font-size: var(--f-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body { line-height: var(--lh-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-meta { font-size: var(--f-tiny); line-height: var(--lh-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--s1) var(--s3); }

/* ══════════════════════════════════════════════════════════════════════════
   头部灰卡连带修正（人裁定，2026-10-05 第二轮：「卡片要有背景」）
   ──────────────────────────────────────────────────────────────────────────
   ⚠️ **2026-10-07 起头部卡改回白底**（人裁定「卡片颜色原型改成了白色底」，见 ① 段与本层 ⑤）：
   本段两条连带修正的处境随之反转，逐条处置如下。
   ① 状态胶囊：设计层与 FR-10 都给「无底色、文字色取 --pm-accent」——accent 在灰底上只有
      **4.31:1 < 4.5:1**（契约层自己写明「强调色文字只允许落在白底上」）。
      当时的处置是改白底 + 发丝边。白卡下这一条**继续保留**：白底=卡的底色（4.70:1 达标），
      发丝边仍是"胶囊"形态的唯一载体（去掉边就只剩一行彩色字）。
   ② 未开始阶段段：当时灰段落在灰卡上直接隐形，故改白底段。白卡下**这条已退役**：
      白底段在白卡上才是隐形的，而 ⑰ 段的基色 --pm-bg-soft（灰段）在白卡上正常可见——
      故本段不再覆盖，交给 ⑰ 的基色规则。
   为什么单独成段、用更高特异性：上面「设计契约落地层」是契约原文、不去动它；
   ① 是它的**有裁定取代**（已在 req-detail-design-conformance.mts 白名单登记）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] .dsh-pm-status {
  background: var(--pm-surface); border: .5px solid var(--pm-line); padding: 1px 8px;
}

/* FR-4：进度带标签 10.5px 单行（色条 4px 在 ④ 段已是，不动）；900 窄档不溢出靠 nowrap + min-width:0。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots .dsh-pm-dot-label {
  font-size: var(--pm-prog-label-fs); white-space: nowrap;
}

/* ① 标识行：席位组吃唯一的「margin-left: auto」（右置）；「创建于 …」归回内联时间组（不再右推）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] { margin-left: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top .dsh-pm-report-windows { margin-left: auto; }

/* ← 看板 是导航不是元信息：它与 REQ-id 之间不画 ⑲ 段的「· 」相邻分隔符。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > .dsh-pm-btn[data-action="back"] + .dsh-pm-card-id::before {
  content: none; margin-right: 0;
}

/* 席位组右置后前邻是「创建于 …」（元信息）——⑲ 段的相邻分隔规则会给它画「· 」，
   但右置的席位组与元信息组不是"并列元信息"（原型 .seats 前无分隔符），故抹掉。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > .dsh-pm-report-windows[data-report-windows]::before {
  content: none;
}

/* ② 标题行：标题与操作区一行（flex-wrap = 900 窄档允许操作行折行）；操作区聚合固定右侧。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title {
  flex-basis: 100%; display: flex; align-items: flex-start; flex-wrap: wrap;
  gap: var(--s2) var(--s4); min-width: 0; margin-top: var(--s1);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-detail-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-size: var(--pm-head-title-fs); line-height: var(--pm-head-title-lh); letter-spacing: -.2px; /* 裸 px 豁免（复核 P2-2）：字距微调无令牌语义，登记不令牌化 */
}

/* 操作区（或终态的「终态只读」说明）：不拉伸、固定右端；与标题首行基线对齐（padding-top 2px）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-report-actions,
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-title .dsh-pm-gate {
  flex: none; margin-left: auto; padding-top: 2px; /* 裸 px 豁免（复核 P2-2）：基线对齐微调 */ align-self: flex-start;
}

/* ③ 闸门提示条：琥珀底整行出血贴头卡左右缘（头卡 padding = --s3 --s4）；信息双编码
   （⚠ 字符 + 完整文案），锚链同色加粗（原型 .gate a）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate-banner {
  flex-basis: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  margin: 0 calc(-1 * var(--s4)); padding: var(--s2) var(--s4);
  background: var(--pm-warn-tint); border-top: var(--pm-hair) solid var(--pm-warn-line);
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-warn-text);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-gate-flag { flex: none; font-weight: 700; }

.dsh-pm-detail[data-report-shell] .dsh-pm-gate-banner b { font-weight: 700; font-variant-numeric: tabular-nums; }

.dsh-pm-detail[data-report-shell] .dsh-pm-gate-link {
  flex: none; color: var(--pm-warn-text); font-weight: 600; text-decoration: none;
  font: inherit; font-size: var(--f-body);
  /* 命中区 ≥24（t9 复核 P1-1 连带）：锚链从 <a> 变 <button> 后一并守 --pm-target。 */
  display: inline-flex; align-items: center; min-height: var(--pm-target);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-gate-link:hover { text-decoration: underline; }

/* ── FR-3 评论紧凑 ─────────────────────────────────────────────────────── */
/* 头部行：标签在左、「全部对话 →」右置（原型 .c-head a 的 margin-left:auto） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments-head {
  display: flex; align-items: baseline; gap: var(--s2); margin-bottom: var(--s1); min-width: 0;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comments-head > .dsh-pm-action-bar-label {
  flex: 1 1 auto; min-width: 0; margin-bottom: 0;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comments-all {
  flex: none; font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; border-radius: 0; background: none; color: var(--pm-accent-text); white-space: nowrap;
  /* 命中区 ≥24（t9 复核 P1-1）：同 .dsh-pm-doc-open，行内文本锚链也守 --pm-target。 */
  display: inline-flex; align-items: center; min-height: var(--pm-target);
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comments-all:hover { text-decoration: underline; }

/* 短评正文：单行省略（取代旧 -webkit-line-clamp 的"最多两行"写法；全文在 title 里） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment > .dsh-pm-comment-body {
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 「长日志已收纳」琥珀标（原型 .c-flag；与对话气泡 .dsh-pm-b-flag 同族，描边取 currentColor） */
.dsh-pm-detail[data-report-shell][data-report-shell] .dsh-pm-comment-long-flag {
  flex: none; display: inline-block; font-size: var(--f-tiny); font-weight: 500;
  color: var(--pm-warn-text); background: var(--pm-warn-tint);
  border: var(--pm-hair) solid currentColor; border-radius: var(--s1); padding: 0 5px;
}

/* 长日志折叠体：占满行内剩余宽度；合上 = 截断一行 + 行尾「展开」，点开就地放开 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold { flex: 1 1 auto; min-width: 0; }

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold-head {
  display: flex; align-items: baseline; gap: var(--s2); min-width: 0;
  list-style: none; cursor: pointer;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold-head::-webkit-details-marker { display: none; }

/* 单行截断体（长日志收纳后的一行摘要 + 「展开」）。
   ⚠️ **contain: inline-size 是「详情页能不能适配窄窗」的开关**（2026-10-07 人反馈「详情页面不适配」）：
   white-space: nowrap 的文本其 min-content = 整行文本宽（实测这一条 6.2 万 px），
   而 min-width: 0 只允许**收缩**、削不掉**min-content 贡献**——它会一路把
   .dsh-pm-comments → 头卡 → .dsh-pm-detail 的 min-content 顶到 1280 以上，
   于是壳在 <1280 视口里不收缩（被 max-width 截住），再被宿主 .dsh-pm-view{overflow:hidden}
   **静默裁掉右侧**（没有任何滚动条）。容器查询式包含（inline-size containment）把这一格的
   内联尺寸与内容解耦：尺寸由 flex 分配（仍然铺满可用宽），字号/高度照旧，省略号照旧。
   为什么不是 width: 0：那是"在块级语境里会被压缩成 0"的写法；contain 在块级语境里
   仍是"填满父宽"，只把内在尺寸贡献清零——同样的效果，更窄的副作用面。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body--clip {
  flex: 1 1 auto; min-width: 0; display: block;
  contain: inline-size;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold[open] .dsh-pm-comment-body--clip { display: none; }

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-toggle {
  flex: none; font-size: var(--f-tiny); color: var(--pm-accent-text); white-space: nowrap;
}

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-toggle:hover { text-decoration: underline; }

.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold:not([open]) .dsh-pm-comment-close,
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-fold[open] .dsh-pm-comment-open { display: none; }

/* 展开后的全文：保留原文换行（多行日志就是因此被收纳的），白空间照原文、不断词硬折 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body--full {
  display: block; white-space: pre-wrap; word-break: break-word; margin-top: var(--s1);
}

/* ── 归位自公共层条件组（REQ-261007133149-0716 t4）：窄档里只服务 head 的那条 ── */
@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] .dsh-pm-rh-top > [data-created-at] { display: none; }
}
/* ══════════════════════════════════════════════════════════════════════════
`
