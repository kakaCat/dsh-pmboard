/**
 * shared.ts
 *
 * 分片化（REQ-261007133149-0716 FR-2）：本文件是**物理搬家**的产物，规则文本与改造前
 * src/client/styles/report.ts 逐字节相同（拼接=逆操作，见 evidence/report-css-before.sha256）。
 * 归属纪律：本分片只放跨组件公共层（公共件 + 焦点环 / 窄档 / 目标尺寸 / 动效 / 字阶等收口层）；公共层（shared.ts）只放宽选择器与口径处处相同的成组规则。
 */

export const SHARED_PUBLIC_CSS = `   ⑤ 公共件：面板小标题 / 提示行 / 芯片 / 空态
   （原型 .panel h4 · .mut · .src · .evidence · .note · .dchip）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-block-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: 0 0 var(--s2); padding: 0; border: 0;
}
/* ⚠ 本条只留「平铺」时代的布局位；外观已由**片尾 ㉑ 卡片语汇**接管（面板板块一律成卡：
   白面 + 1px 描边 + 8px 圆角 + 8/12 内边距）。要改板块外观，去 ㉑ 改，不要在这里加属性。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-block { display: block; margin: 0 0 var(--pm-space-module); padding: 0; border: 0; background: none; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-title { font-size: var(--f-h2); font-weight: 600; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary { font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-note { font-size: var(--f-small); color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-path { font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); background: none; padding: 0; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-hint { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-muted { font-size: var(--f-small); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-note { font-size: var(--f-small); line-height: 1.55; color: var(--pm-text2); margin-top: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-empty { font-size: var(--f-small); color: var(--pm-text2); padding: 0; }
.dsh-pm-detail[data-report-shell] code {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2); word-break: break-all;
}
/* ── 行内 Markdown 的显示层（render/md-inline.ts 产出的标签）──────────────────────────
   正文是**文档原文**，标记在渲染层被剥掉/换标签（「**x**」→「<b>」、反引号里的 x→「<code>」、
   行首 「#」/「>」/「- 」→标题/引文/列表）。产物一律是内联级元素（「<span>」），
   块级形态靠这里的 「display」 决定——因为同一段 HTML 会落进 「<p>」 / 「<td>」 / 「<div>」 三种父节点。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h { display: block; font-weight: 600; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote {
  display: block; padding-left: var(--s2); border-left: 3px solid var(--pm-line); color: var(--pm-text2);
}
/* 无序列表：「- 」 换成 「•」（伪元素出字形），悬挂缩进让折行对齐正文而不是回到标记下方 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li {
  display: block; padding-left: var(--s4); text-indent: calc(-1 * var(--s4));
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li::before {
  content: '\\2022'; color: var(--pm-text3); margin-right: var(--s2);
}
/* 有序列表：序号照原文（1. / 2.），只挪到悬挂位——**不改字** */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli { display: block; padding-left: var(--s4); text-indent: calc(-1 * var(--s4)); }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-num { color: var(--pm-text2); font-variant-numeric: tabular-nums; }
/* 文档里的表格行（「| 列 | 列 |」）：剥掉管道符，改成带细竖分线的横向栅格 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-row {
  display: flex; flex-wrap: wrap; align-items: baseline; padding: 0;
  border-bottom: .5px solid var(--pm-line);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell { min-width: 0; padding-right: var(--s3); overflow-wrap: anywhere; }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell + .dsh-pm-md-cell {
  padding-left: var(--s3); border-left: .5px solid var(--pm-line);
}
/* 行内 code：等宽 + 极浅底（正文里的 「x」 不再是两个反引号） */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell code,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line code,
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary code,
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff code,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list code,
.dsh-pm-detail[data-report-shell] .dsh-pm-callout code {
  font-size: var(--f-tiny); padding: 0 var(--s1); border-radius: 0; background: none;
  color: var(--pm-text); word-break: break-word;
}


/* 证据指针 = 原型 .evidence（细边胶囊，等宽） */
.dsh-pm-detail[data-report-shell] .dsh-pm-evidence {
  display: inline-block; font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny);
  padding: var(--s1) var(--s2); border: .5px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-accent-text); word-break: break-all;
}
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence { display: flex; flex-direction: column; gap: var(--s1); }
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence li {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text2);
  background: none; border-radius: 0; padding: 0; word-break: break-all;
}




.dsh-pm-detail[data-report-shell] .dsh-pm-flag.verify-pending { background: none; color: var(--pm-text2); }
/* 表格 = 原型 table.t（th 11px 灰底 / td 12px / 8px 12px / 细横线） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table {
  width: 100%; border-collapse: collapse; font-size: var(--f-small); table-layout: fixed;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th {
  text-align: left; font-size: var(--f-tiny); font-weight: 600; color: var(--pm-text2);
  background: none; padding: var(--s2) var(--s3);
  border-bottom: .5px solid var(--pm-line); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td {
  padding: var(--s2) var(--s3); border-bottom: .5px solid var(--pm-line);
  vertical-align: top; text-align: left; font-size: var(--f-small); line-height: 1.55;
  word-break: break-word; overflow-wrap: anywhere;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td:first-child { white-space: nowrap; }
















.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table tbody tr:hover { background: none; }

/* ══════════════════════════════════════════════════════════════════════════
`

export const SHARED_CROSS_CSS = `   ⑫ 键盘焦点环（FR-2）：统一 :focus-visible · 两档偏移 · 苹果式 halo
   ——对应原型 「#FR-2」 段（「prototypes/detail-ui-v3.html」 的
   「.dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"]):focus-visible」）。
   形态：「outline: <宽> solid var(--pm-accent-text)」 + 「outline-offset: <档位>」 + 「box-shadow: var(--pm-focus-halo)」。
   ══════════════════════════════════════════════════════════════════════════ */

/* 只在**键盘路径**出现：用 「:focus-visible」（鼠标点击不匹配 → 不留环，旧观感一字不变，FR-2 #1）。
   环色 = 岛内文字级主色（「--pm-accent-text」 = 唯一强调色 #0071e3，白底 4.70:1 ≥ 3:1）；
   **不引**宿主的 「--dsw-alias-state-business-primary」（宿主深色下是浅蓝 #7aaaff，浅色岛上对比不足）。
   outline 不参与布局（不撑宽、不产生横向溢出、不挤动相邻元素），halo 是 box-shadow 也不参与布局。
   覆盖清单——**逐类点清**（都是本页真源码里的可聚焦元素，选类名不选标签，免得误伤别处）。
   **小控件档 = 外偏移 「+2px」（环更清楚）——按钮 / 胶囊 / 输入框 / 链接式按钮**：
       · 「.dsh-pm-btn」            按钮（操作条 / 重试 / 发送，含 「.primary」 与 「.danger」）
       · 「.dsh-pm-window」         窗口胶囊（头部的「窗口 w-…」）
       · 「.dsh-pm-input」          输入框（评论 / 回复 / 对话页内检索）
       · 「.dsh-pm-trunk-open」     链接式按钮（「点开看原文 →」）
       · 「.dsh-pm-doc-path」       文档路径胶囊（文档 Tab）
       · 「.dsh-pm-np-doc」         片段胶囊（提示词 Tab 的 「data-fragment」 芯片）
       · 「.dsh-pm-dag-btn」        DAG 工具栏按钮（纵向 / 横向 / 关键路径 / 只看主线）
   **面状档 = 内偏移 「-2px」（见下一条）——Tab 条 + 折叠条**（「details.dsh-pm-fold > summary」 /
   「details.dsh-pm-prompt > summary」 / 「details.dsh-pm-inj-body > summary」）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-window:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-input:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-doc:focus-visible,
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-btn:focus-visible,
/* 上面七类是**点清**的清单；这一行是安全网：清单之外将来新加的可聚焦元素（「<a href>」 / 新按钮 /
   「[tabindex]」）也吃到同一配方，不会出现「只有它沿用浏览器默认环」的半统一。
   它与上面各行同配方（小控件档），所以特异性差异不会改变外观；面状档那几条**必须**比它更具体（见下）。 */
.dsh-pm-detail[data-report-shell] :is(button, input, select, textarea, summary, a[href], [tabindex]):focus-visible {
  outline: var(--pm-focus-ring-w) solid var(--pm-accent-text);
  outline-offset: var(--pm-focus-offset-ctl);
  box-shadow: var(--pm-focus-halo);
}

/* 面状档：**Tab 条 + 折叠条**用内偏移 「-2px」（FR-2 #5）——不撑出额外方框、不挤动相邻元素。
   为什么折叠条算面状（有据）：原型 「#FR-2」 段自己的口径就是「面状控件（Tab / 折叠条）用 -2px 内偏移、
   小控件 +2px 外偏移」；折叠条是**整块宽条**（整块面板的头条），不是小控件。
   为什么它还非内偏移不可（实测）：旧分片的 「.dsh-pm-fold」 带 「overflow: hidden」，外偏移的环会被
   它裁掉上/左/右三边（外偏移 2px + 环宽 2px = 条外 4px，而裁剪盒只到折叠块边框内 1px）；
   内偏移的环画在条内，天然不被裁（FR-2 #3）。

   ⚠️ 特异性（踩过的坑，原型那段也记着）：上面安全网里的 「a[href]」 让 「:is(...)」 取到 (0,4,1)，
   只写 「.dsh-pm-tab:focus-visible」 (0,4,0) 会被它盖住（实测 offset 还是 +2px）。
   所以面状档每条都补到更高：Tab 条把 「[role="tab"]」 再写一遍凑到 (0,5,0)（类比安全网的 4 个类级多 1）；
   折叠条用 「details.<类> > summary」 拿到 (0,4,2)——类级与安全网打平 (0,4)，靠多的那个元素名压过它。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab[role="tab"]:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary:focus-visible,
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body > summary:focus-visible {
  outline-offset: var(--pm-focus-offset-face);
}

/* 折叠条（details > summary）在详情页内的命中区下限（FR-5 #1）：
   探针 A13 实测 prompts 面板的 summary 命中区只有 1188x18.6px（宽度够、**高度不足**）。
   同样不改其它分片，只在本页前缀下补。 */
.dsh-pm-detail[data-report-shell] summary {
  min-height: var(--pm-target);
  box-sizing: border-box;
}

/* 焦点环**不许被裁**：本片全部 「overflow: hidden」 的盒子（「.dsh-pm-action-consequence」 /
   「.dsh-pm-comment-body」 / 「.dsh-pm-gap-line」 / 「.dsh-pm-gap-what」 / 「.dsh-pm-outcome-leftover」 /
   「.dsh-pm-impact-bar」）里都没有可聚焦元素，故没有一处焦点环会被裁掉；
   唯一含可聚焦元素又有 「overflow: hidden」 的祖先是 DAG 面板（「dag.ts」 的 「.dsh-pm-dag-panel」），
   它的头部内边距 11/13/9px > 外偏移 2px + halo 3px = 5px，环与 halo 都落在内边距里（探针实测）。
   折叠块的 「.dsh-pm-fold」 另带 「overflow: hidden」（旧分片）：见上面那条给它补的 「overflow: visible」。
   本片也没有 「position: sticky」（粘性元素不存在，谈不上遮挡）。 */

/* ══════════════════════════════════════════════════════════════════════════
   ⑬ 窄档（原型只给了 1280 一档；≤1000px 时按同一套口径收得更紧，不换视觉语言）
   ——只改间距与"补充说明"的呈现，不改结构、不改内容归属、不加内层滚动
   ══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] { padding: var(--s3) var(--s4) 64px; }

  /* 缺口一条压成一行：why / ref 是补充说明，窄档用省略号收尾（what 永远完整可见）。
     为什么必须收：900px 档下 5 条缺口各折 2~3 行会把六个 Tab 顶出首屏（那是验收判红的缺陷）。 */
  /* 缺口条本来就是一行（见上），窄档不再另压 */
  .dsh-pm-detail[data-report-shell] .dsh-pm-specvs,
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] { grid-template-columns: 1fr; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑭ 交互目标尺寸（FR-5 · WCAG 2.2 SC 2.5.8 Target Size (Minimum) AA）
   ——对应原型 「#FR-5」 段（「:is(.dsh-pm-btn, .dsh-pm-window, …) { min-height: 24px; min-width: 24px }」）
   ══════════════════════════════════════════════════════════════════════════ */

/* 基线实测（「evidence/targets-and-fonts-baseline.txt」，四组合）里**唯一**两项不达标的是
   「窗口跳转胶囊」与「点开看原文 →」（都在本段收口）：
     · 「.dsh-pm-window」       216.2×20.5 / 203.1×20.5   → 高差 3.5px
     · 「.dsh-pm-trunk-open」   71.2×19.3                 → 高差 4.7px
   其余目标本来就是达标的（按钮 65×29 / 74×29 / 46×25、Tab 69～125×33、输入框 1186×25）——
   所以本段**不撒网**：给全部控件统一加 min-height 只会白白撑高操作条与 Tab 栏。

   为什么用 min-height 而不是伪元素扩命中区（卡原文写的"优先"）：
     ① 原型自己就是这么落的（「#FR-5」 的 min-height/min-width），proto-geometry 记的正是
        「.dsh-pm-window = 203.1×24.0」（宽不变、高 24.0）——本段落完与原型逐值一致；
     ② 伪元素扩出来的命中区**不进食**「getBoundingClientRect()」，而 t14 的 A8 组判的正是 rect
        （「width ≥ 24 && height ≥ 24」）。只写伪元素 = 真命中区达标、判据读数仍 20.5，
        成了"读数与事实各说各话"；min-height 让两者同时为真；
     ③ 「box-sizing: border-box」是**关键**：默认 content-box 下 min-height 落在内容盒上，
        总高会变成 24 + 2×1px 内边距 + 2×1px 边框 = 28px（比要求高 4px，还多撑 4px 首屏预算）。
   「display: inline-flex + align-items: center」让文字在 24px 盒内垂直居中（不靠加内边距凑高）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-window,            /* FR-5：解析后即 min-height:24px / min-width:24px */
.dsh-pm-detail[data-report-shell] button.dsh-pm-trunk-open {  /* 同上（令牌单点见 ① 的 --pm-target: 24px） */
  display: inline-flex; align-items: center;
  box-sizing: border-box; min-height: var(--pm-target); min-width: var(--pm-target);
}

/* 相邻目标间距 ≥8px（FR-5 #2）：窗口胶囊组「.dsh-pm-report-windows」的 gap 就是「--s2」= 8px，
   实测组内相邻两枚胶囊的水平间隙 = 8.0px（四组合一致）。本段**不新增元素、不动 gap**——
   加高只改纵向（20.5 → 24），不改变组内的水平间距。 */

/* 例外清单（**显式**，逐条给理由；t14 的 A8 组断言按同一份清单放行——不放宽成"凡是小的都放过"）：
   ① 正文里的**行内链接**（「<a href>」 嵌在整句话中间，如 Markdown 的「[文字](url)」）：
      命中 WCAG 2.2 SC 2.5.8 的 **inline 例外**（目标在一句话/文本块的行内，行高不由目标撑开，
      改尺寸会把整段文字的行高顶开）。**本页实测证据**：报告壳内「a[href]」= 0 个（正文走
      「.dsh-pm-trunk-open」/「.dsh-pm-doc-path」这类真控件——见「render/md-inline.ts」的
      "不产出链接"纪律：原文里的 URL 是证据，不是入口）。故这条例外是为「.dsh-pm-detail」下
      **将来**出现的行内链接登记的，不是给眼下的控件开后门。
   ② 「.dsh-pm-trunk-open.is-nopath」：**不可点**的一行灰字说明（渲染层不给它 data-open-doc，
      见「views/panels/trunk.ts」的 openRefNodes）——它不是交互目标，故不吃 24px 下限；
      本段的选择器只写「button.dsh-pm-trunk-open」，天然不含这个 「span」 元素。
   ③ 尺寸为 0×0 的**视觉隐藏**节点（aria-describedby 的落点一类）：不是交互目标，
      A8 组按可见性过滤后再判。 */

/* ══════════════════════════════════════════════════════════════════════════
   ⑮ 动效令牌与 reduced-motion（FR-6）
   ——对应原型 「#FR-6」 段（「:is(button, a[href], summary, input, [role=tab])」 上的 transition
     + 「@media (prefers-reduced-motion: reduce)」 归零）；令牌单点定义见 ① 的四个 --pm-dur* / --pm-ease。
   ══════════════════════════════════════════════════════════════════════════ */

/* 过渡**只动颜色类属性**：color / background-color / border-color / opacity / box-shadow——
   不改宽高、不改 margin/padding、不位移、不用 transform，所以"动效前后几何读数逐项一致"
   是**结构性**成立的（不是靠运气躲过布局抖动）。
   分档（与原型同构）：四条颜色/透明度属性走标准档 120 毫秒；焦点 halo（box-shadow，装饰）
   走最快档 80 毫秒——原型是把 outline-color 放最快档，本片按任务卡给的白名单（不含 outline-color）
   用 box-shadow 承接这一档：**焦点反馈要立刻看得见**。第三档 150 毫秒与原型同口径：
   定义在场、暂未消费（留给将来需要更慢反馈的大面积位）。规则里因此只有 var(--pm-dur*)，
   不出现"每个控件一个时长"。

   覆盖六个可点控件类（FR-6 #2 点名的清单）：按钮 / Tab / 窗口胶囊 / 行内链接式按钮 /
   折叠条 / 输入框。hover、active、focus 三个状态的属性变化都落在这条声明上
   （CSS 过渡挂在**基态声明**上，任何状态切换触发的属性变化都走它，不需要逐个状态再写一遍）。

   ⚠️ 为什么这条**必须显式写**（t4 实测的坑，本片要把它压掉）：详情页控件从**旧分片**继承了
   transition——「styles/files.ts」 的 「.dsh-pm-tab」 用简写把**所有属性**都拉进了过渡
   （实测计算值：transition-property = all、transition-duration = 0.2s）。all 的坏处不只是
   时长越界（0.2s 超出 FR-6 的 80～150 毫秒），更要命的是**读计算样式会拿到过渡中间值**
   ——焦点环读数首当其冲（t4 就是这么被吞的）。本片靠 「.dsh-pm-detail[data-report-shell]」
   前缀（+1 个类级、+1 个属性选择器）把特异性提到旧规则之上，压成令牌化白名单；
   改完实测 transition-property 里**不再有 all**（六个控件逐条读数见卡汇报）。
   其余详情页控件（如 「.dsh-pm-doc-path」）的过渡来自旧分片、但**本来就是具名属性**且时长
   在区间内（实测不是 all），本卡不越界去改旧分片。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn,
.dsh-pm-detail[data-report-shell] .dsh-pm-tab,
.dsh-pm-detail[data-report-shell] .dsh-pm-window,
.dsh-pm-detail[data-report-shell] button.dsh-pm-trunk-open,
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary,
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  transition:
    color var(--pm-dur) var(--pm-ease),
    background-color var(--pm-dur) var(--pm-ease),
    border-color var(--pm-dur) var(--pm-ease),
    opacity var(--pm-dur) var(--pm-ease),
    box-shadow var(--pm-dur-fast) var(--pm-ease);
}

/* 「减少动态效果」（FR-6 #4）：**纯 CSS 媒体查询**——零 JS、无运行时状态副本、无 SSR 差异，
   探针可以直接读计算样式（判据量的是计算样式，这条正好可测）。
   ① 三个时长令牌**归零**（0s，不是"变慢"，是不动）：归零写在与 ① 同一选择器上、且在文件里
      更靠后 → 同特异性下后者胜；岛内全部后代继承到 0s（自定义属性会继承）。
   ② 再把岛内的 transition-duration / animation-duration 显式归零（含 ::before / ::after）：
      令牌归零管的是"引令牌的那些"，这条兜住"引了别的分片时长"或"后加动画"的漏网；
      用 !important 是因为要压过任何后写、高特异性的动画声明（先例：分片 settings.ts 的
      reduced-motion 分支同样用 !important 关掉过渡与动画）。
   终态直接可读：hover / focus 的终态本来就是颜色到位的样子，归零只是省掉过程。 */
@media (prefers-reduced-motion: reduce) {
  .dsh-pm-detail[data-report-shell] {
    --pm-dur-fast: 0s; --pm-dur: 0s; --pm-dur-slow: 0s;
  }
  .dsh-pm-detail[data-report-shell] *,
  .dsh-pm-detail[data-report-shell] *::before,
  .dsh-pm-detail[data-report-shell] *::after {
    transition-duration: 0s !important;
    animation-duration: 0s !important;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑯ 字阶与字重的落点收口（FR-7 · FR-12；卡 t-2055e5 ＝ 计划 t7）
   ——对应原型 「#FR-7」/「#FR-12」 两段；令牌重定值见 ①，规则里的裸字号已全部换成 var(--f-*)。
   ══════════════════════════════════════════════════════════════════════════ */

/* ① 「b」/「strong」/ 标题标签的**UA 默认字重是 700/粗体**——FR-7 #4 只留 400/500/600，
      它们没有一条本片规则覆盖，会从计算样式里漏出第 4 种字重（实测改前 「b」 = 700）。 */
.dsh-pm-detail[data-report-shell] :is(b, strong, h1, h2, h3, h4) { font-weight: 600; }

/* ② 内容页**不用阴影**（FR-10 (三) 6：只允许浮层与焦点 halo）。
      本片自己没有卡片阴影，但报告页沿用了旧分片的类——这里显式钉死"内容块不许有阴影"，
      免得将来某条继承/旧规则把阴影带回来。焦点环的 halo（box-shadow）是**交互反馈**、
      且写在更高特异性的 :focus-visible 规则里（⑫），不在本条的射程内。 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-stat, .dsh-pm-block, .dsh-pm-trunk-item, .dsh-pm-fact,
  .dsh-pm-hl, .dsh-pm-opt, .dsh-pm-inj, .dsh-pm-iso, .dsh-pm-tok-sub, .dsh-pm-rh-bar,
  details.dsh-pm-fold, details.dsh-pm-prompt) { box-shadow: none; }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-report-meta, .dsh-pm-card-id, .dsh-pm-trunk-src, .dsh-pm-src, .dsh-pm-doc-kind, .dsh-pm-flag, .dsh-pm-gap-ref, .dsh-pm-evidence, .dsh-pm-verify-verdict, .dsh-pm-doc-label, .dsh-pm-doc-state, .dsh-pm-np-shell) { padding: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 400; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge], .dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { padding: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 400; font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] { margin-left: var(--s1); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { margin-left: auto; }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-gate, .dsh-pm-hl-missing, .dsh-pm-trunk-missing, .dsh-pm-flag) { border: 0; border-radius: 0; }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-stat, .dsh-pm-hl, .dsh-pm-fact, .dsh-pm-tok-sub, .dsh-pm-tok-total td, .dsh-pm-docs-table th, .dsh-pm-report-table th, .dsh-pm-tok-table th) { background: var(--pm-bg-soft); border: 0; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-docs-table, .dsh-pm-report-table, .dsh-pm-tok-table) tbody tr:hover { background: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-gap-ref, .dsh-pm-evidence, .dsh-pm-md-h code, .dsh-pm-md-quote code, .dsh-pm-md-li code, .dsh-pm-md-oli code, .dsh-pm-md-cell code, .dsh-pm-trunk-line code, .dsh-pm-block-summary code, .dsh-pm-sv-diff code, .dsh-pm-callout code, .dsh-pm-report-evidence li) { border-radius: 0; }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-detail-head[data-report-head], .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-md-row, .dsh-pm-docs-table td, .dsh-pm-report-table td, .dsh-pm-tok-table td, .dsh-pm-docs-table th, .dsh-pm-report-table th, .dsh-pm-tok-table th) { border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-detail-head[data-report-head], [data-report-seg="band"], .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-comments > .dsh-pm-action-bar-label) { border-width: var(--pm-hair); }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-stat, .dsh-pm-hl, .dsh-pm-hl-missing, .dsh-pm-fact, .dsh-pm-trunk-item, .dsh-pm-comment, .dsh-pm-btn, .dsh-pm-input, .dsh-pm-np-card, .dsh-pm-np-col) { box-shadow: none; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-btn, .dsh-pm-input, .dsh-pm-window, .dsh-pm-doc-path) { border: var(--pm-hair) solid var(--pm-line); border-radius: 8px; background: var(--pm-surface); }

.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { color: var(--pm-danger); border-color: var(--pm-line-strong); background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary { background: var(--pm-accent); border-color: transparent; color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary:hover { background: var(--pm-accent-hover); border-color: transparent; }
.dsh-pm-detail[data-report-shell] b, .dsh-pm-detail[data-report-shell] strong { font-weight: 500; }

.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-action-bar-label, .dsh-pm-comment-who, .dsh-pm-evidence-missing, .dsh-pm-band-ok, .dsh-pm-hl-diff, .dsh-pm-trunk-scope-hint, .dsh-pm-inj-verdict, .dsh-pm-opt-title, .dsh-pm-outcome-verdict, .dsh-pm-verify-verdict, .dsh-pm-np-iso-status, .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label, .dsh-pm-dot-wrapper.current .dsh-pm-dot-label) { font-weight: 500; }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-dot-label, .dsh-pm-action-consequence, .dsh-pm-human-only, .dsh-pm-gate, .dsh-pm-input::placeholder, .dsh-pm-comments > .dsh-pm-action-bar-label, .dsh-pm-comment-meta, .dsh-pm-stat-label, .dsh-pm-band-mut, .dsh-pm-gap-more, .dsh-pm-hint, .dsh-pm-muted, .dsh-pm-note, .dsh-pm-empty, .dsh-pm-md-num, .dsh-pm-src[data-source="none"], .dsh-pm-trunk-docmeta, .dsh-pm-trunk-sub, .dsh-pm-trunk-mut, .dsh-pm-trunk-ref-hint, .dsh-pm-trunk-open.is-nopath, .dsh-pm-trunk-hl-h, .dsh-pm-doc-path.dsh-pm-doc-missing, .dsh-pm-docs .dsh-pm-discovered-rest, .dsh-pm-doc-row[data-proto-role="superseded"], .dsh-pm-archive-reconcile[data-reconcile="none"], .dsh-pm-archive-ack, .dsh-pm-msg-time, .dsh-pm-tok-h-note, .dsh-pm-pp-h-note, .dsh-pm-tok-more, .dsh-pm-nosnap, .dsh-pm-opt-basis, .dsh-pm-sum, .dsh-pm-impact-name, .dsh-pm-prompt-meta, .dsh-pm-sv-h, .dsh-pm-inj-meta, .dsh-pm-inj-line, .dsh-pm-iso-meta, .dsh-pm-np-iso-meta, .dsh-pm-report-evidence li, .dsh-pm-msg--system) { color: var(--pm-text2); }

.dsh-pm-detail[data-report-shell] .dsh-pm-btn, .dsh-pm-detail[data-report-shell] .dsh-pm-input { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict, .dsh-pm-detail[data-report-shell] .dsh-pm-block-title, .dsh-pm-detail[data-report-shell] .dsh-pm-block-summary, .dsh-pm-detail[data-report-shell] .dsh-pm-hl-diff, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-list li, .dsh-pm-detail[data-report-shell] .dsh-pm-msg, .dsh-pm-detail[data-report-shell] .dsh-pm-inj, .dsh-pm-detail[data-report-shell] .dsh-pm-inj-verdict, .dsh-pm-detail[data-report-shell] .dsh-pm-iso-reason, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-h, .dsh-pm-detail[data-report-shell] .dsh-pm-pp-h, .dsh-pm-detail[data-report-shell] .dsh-pm-opt, .dsh-pm-detail[data-report-shell] .dsh-pm-opt-sug, .dsh-pm-detail[data-report-shell] .dsh-pm-sv-list, .dsh-pm-detail[data-report-shell] .dsh-pm-report-sec-title, .dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile, .dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-value { font-size: var(--f-h2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-path, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-kind, .dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred, .dsh-pm-detail[data-report-shell] .dsh-pm-prompt-name, .dsh-pm-detail[data-report-shell] .dsh-pm-np-doc, .dsh-pm-detail[data-report-shell] .dsh-pm-report-step-error, .dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence li, .dsh-pm-detail[data-report-shell] code { font-size: var(--f-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-doc-state, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-path { font-size: var(--f-small); }

.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table, .dsh-pm-detail[data-report-shell] .dsh-pm-report-table, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-table, .dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-report-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td, .dsh-pm-detail[data-report-shell] .dsh-pm-fact-label, .dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary, .dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary { font-size: var(--f-body); }
.dsh-pm-detail[data-report-shell] .dsh-pm-src, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src, .dsh-pm-detail[data-report-shell] .dsh-pm-evidence, .dsh-pm-detail[data-report-shell] .dsh-pm-doc-path, .dsh-pm-detail[data-report-shell] .dsh-pm-window { font-size: var(--f-tiny); }

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-sub, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref-hint, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-mut, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-h, .dsh-pm-detail[data-report-shell] .dsh-pm-human-only, .dsh-pm-detail[data-report-shell] .dsh-pm-action-consequence, .dsh-pm-detail[data-report-shell] .dsh-pm-dot-label { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell]
  :is(.dsh-pm-window, .dsh-pm-trunk-open, .dsh-pm-doc-path) { display: inline-flex; align-items: center; }
.dsh-pm-detail[data-report-shell] .dsh-pm-flag, .dsh-pm-detail[data-report-shell] .dsh-pm-report-meta[data-blocked-reason], .dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="failed"], .dsh-pm-detail[data-report-shell] .dsh-pm-evidence-missing, .dsh-pm-detail[data-report-shell] .dsh-pm-block-note, .dsh-pm-detail[data-report-shell] .dsh-pm-archive-noack { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="passed"], .dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pending"], .dsh-pm-detail[data-report-shell] .dsh-pm-sv-trimmed, .dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred, .dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-note, .dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pending"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag, .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing { color: var(--pm-text2); }

/* 设计层那条 letter-spacing 是**四类共用一条**（:is 选择器），其中 .dsh-pm-detail-title 已被
   FR-12 的 24px 取代（字号变了，字距取值随之另定），故这里只补未被取代的三类（其余一字不改）。 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-trunk-title, .dsh-pm-block-title, .dsh-pm-report-verdict) {
  letter-spacing: -.2px;
}



/* FR-4：计数徽章 = 等宽 mono 10.5px（等宽数字靠 mono + tabular-nums 双保险）；无底无胶囊照旧。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] {
  font-family: var(--pm-mono); font-size: var(--pm-tab-badge-fs); font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════════════════════════════════════
   ── FR-1 头部三层（REQ-261006130057-7a43 t4）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5
   的「#FR-1」头部区块（.head-id / .head-title / .gate）。三层：
     ① 标识行（.dsh-pm-rh-top）：← 看板 ｜ REQ-id（等宽）｜ 状态药丸 ｜ 分类/难度 ｜
        内联时间（停留/更新/创建）；席位 chips（.dsh-pm-report-windows）**右置**，已归档置灰；
     ② 标题行（.dsh-pm-rh-title）：19px 标题 + 操作按钮聚合**固定右侧**
        （按钮集合 = buildReportActionBar 现行输出，渲染层不增不减）；
     ③ 闸门提示条（.dsh-pm-gate-banner）：waitingHuman > 0 才渲染（无则整条不渲染、不留空壳），
        琥珀底一行 + 锚链「查看缺口 ↓」（hash 落点 = 状态带缺口格 id="dsh-pm-gap-focus"）。
   本块取代的旧排布（同特异性后者胜，本块刻意置于片尾——与 FR-2/FR-4 块同款策略）：
     · D-8「动作行第一行 / 身份行第二行」→ 新基准：标识行第一、标题行第二（动作聚合右置）；
     · 页标题 24px（FR-12 勘误）→ 19px（本需求 design/frontend.md 明写；字阶六档闭集
       不开第七档，故 19px 成本块局部令牌 --pm-head-title-fs，不写裸 font-size）；
     · 「创建于 …」行尾右推（D-8）→ 归回内联时间组，右端让给席位组。
   令牌纪律：规则里只引 --pm-*；新增令牌（--pm-warn-tint / --pm-warn-line /
   --pm-head-title-fs / --pm-head-title-lh）定义在本块内（与 FR-2 块 --pm-danger-tint 同款）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-warn-tint: #fffbeb;          /* 闸门提示条琥珀底（原型 --amber-bg 同值） */
  --pm-warn-line: #fde68a;          /* 琥珀边线（原型 --amber-border 同值） */
  --pm-head-title-fs: 19px;         /* 标题行 19px（原型 .head-title h1；六档字阶无此档，局部令牌） */
  --pm-head-title-lh: 26px;         /* ≈1.35 行高（原型 1.35） */
}

/* 900 窄档（沿用本片 ≤1000px 断点）：操作行折行由标题行 flex-wrap 承担；
   标识行内联时间收起次要项「创建于 …」（纯 CSS 隐藏，不改数据、不改渲染）。 */
@media (max-width: 1000px) {

}

@media (max-width: 1000px) {
  
}

.dsh-pm-detail[data-report-shell] .dsh-pm-chip {
  display: inline-flex; align-items: baseline; gap: var(--s1);
  border: var(--pm-hair) solid var(--pm-line); border-radius: var(--r1);
  padding: 1px var(--s2); background: none; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-chip b {
  font-family: var(--pm-mono); font-variant-numeric: tabular-nums; color: var(--pm-text); font-weight: 600;
}

 

/* ══════════════════════════════════════════════════════════════════════════
   ── FR-3/FR-5 评论紧凑与汇报网格（REQ-261006130057-7a43 t6）──
   ──────────────────────────────────────────────────────────────────────────
   视觉基准 = 原型「docs/requirements/REQ-261006130057-7a43/prototypes/detail.html」v1.5：
     · FR-3 最近评论（.comments / .c-row）：每条一行——「身份 · 时间 · 正文」同行，
       正文单行省略截断（title 全文）；长日志（isLongDialogueText：>120 字符或含换行）
       默认折叠 + 「长日志已收纳」琥珀标 + 行尾「展开」就地放开
       （原生 <details>/<summary>，与状态带「展开说明」、对话长气泡同机制）；
       头部行右放「全部对话 →」（原型 .c-head a）。
     · FR-5 汇报面板（.trunk-grid / .t-mod / .t-head）：模块头**一行化**
       （标题左 13px 半粗 + 副题 + 右端「来源标 + 点开看原文 →」11px 灰）；
       短模块 2×2 网格（为何做/解决什么/怎么做/边界 + 关键决策/技术方案随流），
       长模块（亮点与成效）通栏；正文 12.5px/1.55。
   令牌纪律：规则体只引 --pm-* 令牌与既有一档表（--s 系列 / --r1 / --f- 系列 / --lh- 系列）；
   13px 标题 / 12.5px 正文 / 1.55 行高在六档字阶之外，照 t4 先例收本块局部令牌，
   不写裸值；琥珀标取 --pm-warn-text / --pm-warn-tint（t4 块已定义，同源复用）。
   本块置于片尾：同特异性下后者胜（与 FR-1/FR-2/FR-6/FR-7 各块同款策略）。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-trunk-title-fs: 13px;   /* 模块标题 13px（原型 .t-head h5；六档无此档，局部令牌） */
  --pm-trunk-title-fw: 650;    /* 半粗（原型 font-weight:650） */
  --pm-trunk-body-fs: 12.5px;  /* 汇报正文 12.5px（原型 .t-mod p；六档无此档） */
  --pm-trunk-body-lh: 1.55;    /* 紧凑行高（原型 12.5px/1.55） */
}

/* 900 窄档：网格落回单列（与片内既有 ≤1000px 断点同档） */
@media (max-width: 1000px) {

}

.dsh-pm-detail[data-report-shell] .dsh-pm-ve-row {
  display: flex; align-items: baseline; gap: var(--s3);
  padding: var(--s1) 0; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-ve-row b { flex: none; font-weight: 600; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-ve-row span { min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-ve-row code {
  font-family: var(--pm-mono); font-size: var(--f-tiny); word-break: break-all;
}

/* ══════════════════════════════════════════════════════════════════════════
   ㉑ 卡片语汇：面板板块 = 卡片（REQ-261006130057-7a43 返工 · 人反馈：
      「7 个 Tab 没问题，里面的样式不对——原型都是卡片、条理清晰，实现的没有卡片、乱乱的」）

   视觉基准 = 该需求权威原型 v1.5 的 .blk / .t-mod / .stat（一板一卡）。
   卡 = 白面 + 1px 描边 + 8px 圆角 + 8/12 内边距。四条口径：
   ① **描边 1px，不用 .5px 发丝**：发丝（.5px × --pm-line）在白面上几乎看不见——这正是
      「汇总卡写了 border 却看不出是卡」的根因（.dsh-pm-tok-stat 原写 var(--pm-hair)）。
      发丝线从此只承担**卡内**分隔（行 / 表头 / 折叠条），卡与卡的边界靠描边 + 间距。
   ② 间距照原型（卡间 10px、卡内 8·12px）落到本片最近栅格档：卡间 --s3、卡内 --s2/--s3。
   ③ 容器自带 flex gap 的面板（提示词 / Token）里，卡**不再叠 margin**——否则间距双份。
   ④ 描边色仍取 **--pm-line**（10% 黑 ≈ #e6e6e6）——与原型卡片描边 #E2E8F0 同一量级，
      也与片内分隔线同色；卡与卡内分隔的差别在**线宽**（卡 1px / 片内 .5px 发丝），不在深浅。
      ⚠️ ⑲ 设计契约层（f32f 的收敛落点）用 :is() 把 .dsh-pm-block / .dsh-pm-trunk-item 的
      border-color 钉在 --pm-line（特异性 0,4,0，高于本层 0,3,0）——那正是本层想要的取值，
      故这里**不再写 --pm-line-strong**（写了也不会生效，只会留一条"写了没生效"的规则）。
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] {
  --pm-card-line: 1px;          /* 卡片描边宽度（发丝只留给卡内分隔线） */
  --pm-card-pad-y: var(--s2);   /* 卡内上下 */
  --pm-card-pad-x: var(--s3);   /* 卡内左右 */
  --pm-card-gap: var(--s3);     /* 卡与卡之间 */
}

/* ① 面板板块（原型 .blk）：文档 / 验收 / 对话 / 验收空态——一板一卡 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-block, .dsh-pm-dialogue, .dsh-pm-verify-empty) {
  margin: 0 0 var(--pm-card-gap);
  padding: var(--pm-card-pad-y) var(--pm-card-pad-x);
  background: var(--pm-surface);
  border: var(--pm-card-line) solid var(--pm-line);
  border-radius: var(--r1);
}

/* 末卡不拖尾：面板底部不留一段空 margin */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-block, .dsh-pm-dialogue, .dsh-pm-verify-empty):last-child { margin-bottom: 0; }
/* flex gap 容器（提示词 / Token）里的卡不叠 margin，间距只由 gap 出一次 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-prompts, .dsh-pm-token-panel) > .dsh-pm-block { margin: 0; }

/* ⑤ 窄档下限保护（≤760px；设计只定到 900，这一档是"再窄也不出横向滚动"的兜底）：
   表头原为 white-space: nowrap、文档表/门禁表还带固定 px 列宽（84/110/190、108/96/96/100/110），
   在 640~700 视口里会把表撑出卡片 25~54px（壳内出现横向滚动条）。窄档改「表头可折行 + 列宽自适应」，
   宽档（>760）排版一字不变。th:nth-child(n) 是为了与上面那批 …[data-doc-table] th:nth-child(1)
   等强（媒体查询不加特异性），靠本条更靠后取胜。 */
@media (max-width: 760px) {
  .dsh-pm-detail[data-report-shell] :is(.dsh-pm-docs-table, .dsh-pm-report-table, .dsh-pm-tok-table) th { white-space: normal; }
  .dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(n),
  .dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(n),
  .dsh-pm-detail[data-report-shell] .dsh-pm-rtm-table th:nth-child(n) { width: auto; }
}

/* ⑥ 壳体的三张卡也一律**白底**（2026-10-07 人裁定「卡片颜色原型改成了白色底」）。
   原型 v1.5：.head（=.pm-card）/ .band-cell / .tabs 都是 background: var(--card) = #FFFFFF
   + 1px #E2E8F0 描边——**卡与页的分别由描边承担，不由底色承担**；旧口径的灰底卡
   （--pm-bg-soft，理由是"白底 + 发丝边在白页上几乎不可见"）随之退役。
   状态色不在本条射程内：缺口格的红底（--pm-danger-tint，特异性 0,5,0 高于本条）、
   闸门提示条的琥珀底、都按原样保留。
   特异性说明：.dsh-pm-detail-head[data-report-head] / .dsh-pm-stat[data-band-cell] /
   .dsh-pm-tabs[data-report-tabs] 都是 0,4,0——与「⑲ 设计契约落地层」里同一量级的选择器等强，
   靠**本条更靠后**取胜（同 ⑲ → ㉑ 的层序）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head],
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell],
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  background: var(--pm-surface);
  border: var(--pm-card-line) solid var(--pm-line);
}
`
