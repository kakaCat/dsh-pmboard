/**
 * pmboard 样式分片 · report（需求详情页「工作汇报」壳，REQ-261004222448-292a）。
 *
 * ## 这一片是什么
 *
 * **报告页的外观收在自己这一层**（2026-10-05 重做，第二轮验收「样式还是不对」的处置）。
 *
 * 为什么必须自己一层：壳与六个面板沿用的是旧详情页的类（`.dsh-pm-detail-head` /
 * `.dsh-pm-stats` / `.dsh-pm-tabs` / `.dsh-pm-block` / `.dsh-pm-dot` …），而它们的**外观由旧分片定义**
 * ——两套视觉语言叠在一起，看出来的就是「旧详情页 + 一层补丁」。旧分片的规则**一个字都不许改**
 * （那是别的页面的长相），所以这里把报告页需要的全部外观**重写一遍**，并靠
 * `.dsh-pm-detail[data-report-shell]` 前缀把特异性提到旧规则之上（旧规则最高是
 * `.dsh-pm-detail details.dsh-pm-fold summary` 量级；本片对应写作 `.dsh-pm-detail[data-report-shell] details.dsh-pm-fold summary`）。
 *
 * ## 视觉唯一规范
 *
 * `docs/requirements/REQ-261004222448-292a/prototype/detail-report.html` 的内联 `<style>`。
 * 本片的每条规则都能指回原型那一段（注释里给的是原型的类名），尺寸/字号/间距用原型 `:root` 的原值
 * （`--s1..--s6` / `--r1..--r2` / `--f-*` / `--page` / `--rail` / `--gap-col`）。
 *
 * 色值口径：**前景与表面一律走主题变量**（`var(--dsw-text-primary, #1d1d1f)` 这种回退写法，
 * 回退值就是原型浅色稿的原值）——暗色主题下不会闪成白底黑字；线条/底色用原型的中性半透明灰
 * （`rgba(128,128,128,.20)` 一类），那本身在深/浅两套主题下都成立。
 *
 * ## 两条不许丢的规则（最上面两条）
 *
 *  - `.dsh-pm-tab-panel { display: block }`：面板包装器不吃内层滚动（FR-11 #7：一律铺开，长了走页面滚动）；
 *  - 对话面板的页内检索靠 `hidden` + `data-msg-hit` 双判据隐藏不命中的消息，而本片把 `.dsh-pm-msg`
 *    改成了 `display:flex`——任何 `display` 规则都会盖掉浏览器默认的 `[hidden]{display:none}`
 *    （那是最弱的一条），所以这里用**更高特异性**把隐藏规则钉死。
 *
 * ## 硬约束（本片自我约束，探针会真 DOM 实测）
 *
 * 全片**不出现** overflow 的 auto / scroll 取值，**也不出现**高度上限（不限高）：一律铺开、不做内层滚动。
 * （这两个 CSS 片段刻意不在这里按原样写出：注释里留一份同样的字面量，会让「分片是否违规」只能靠
 *   人去分辨注释与规则——探针只看真 DOM，这条纪律也照同一口径表述。）
 * 高度是靠字号/行距/内边距收紧 + 少渲染几条挣回来的，不是靠把内容关进滚动框。
 */
export const REPORT_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   ⓪ 基底：面板包装器不吃内层滚动 · 检索隐藏规则钉死
   ══════════════════════════════════════════════════════════════════════════ */

/* 面板包装器：一律铺开（FR-11 #7）。这条是壳体契约，不加作用域前缀也要成立。 */
.dsh-pm-tab-panel { display: block; }

/* 对话面板页内检索：不命中的消息必须真的看不见。
   下面把 .dsh-pm-msg 写成了 display:flex，故这里必须用更高特异性（+1 个类 = .dsh-pm-detail[data-report-shell]）
   才盖得住；两条都留，防的是"后人又给 .dsh-pm-msg 加了一条 display"。 */
.dsh-pm-msg[hidden],
.dsh-pm-msg[data-msg-hit="0"] { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[hidden],
.dsh-pm-detail[data-report-shell] .dsh-pm-msg[data-msg-hit="0"] { display: none; }

/* ══════════════════════════════════════════════════════════════════════════
   ① 壳体与设计令牌（对应原型 :root + .wrap）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] {
  /* ── 原型令牌（原值照抄 detail-report.html 的 :root）──
     前景走 --dsw-*（暗色主题跟着变），回退值 = 原型浅色稿原值。 */
  --pm-text: var(--dsw-text-primary, #1d1d1f);
  --pm-text2: var(--dsw-text-secondary, #5f6368);
  --pm-text3: var(--dsw-alias-label-tertiary, var(--dsw-text-secondary, #9aa0a6));
  --pm-accent: var(--dsw-accent, #4a7dff);
  --pm-ok: #28a745; --pm-warn: #b07800; --pm-danger: #dc3545;
  --pm-line: rgba(128,128,128,.20); --pm-line-soft: rgba(128,128,128,.11);
  --pm-bg-soft: rgba(128,128,128,.045); --pm-bg-softer: rgba(128,128,128,.028);
  --pm-surface: var(--dsw-bg-primary, #fff);
  /* 语义**前景**色：浅色底上就是原型那几个深色值；暗色主题下由文件末尾的
     [data-ds-dark-theme] 块整体换成亮一档的同色相值（否则深绿/深棕在暗底上读不出）。 */
  --pm-ok-text: #1e7e34; --pm-warn-text: #a86a00;
  --pm-agent: #8e44ad; --pm-teal-text: #0e7c8f;
  --pm-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  /* 间距 / 圆角 / 字阶：原型同名令牌（--pill 改名 --pm-pill，避免与全局撞名） */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 28px;
  --r1: 6px; --r2: 10px; --pm-pill: 999px;
  --f-h1: 21px; --f-h2: 13.5px; --f-body: 13px; --f-small: 11.5px; --f-tiny: 10.5px;
  --rail: 150px; --gap-col: 22px;

  /* 版心：原型 .wrap { max-width: 1240px; padding: 22px 20px 90px } → 1240 + 2×20 = 1280 */
  display: flex; flex-direction: column; gap: 0;
  max-width: 1280px; margin: 0 auto;
  padding: 8px 20px 72px;
  font-size: var(--f-body); line-height: 1.55; color: var(--pm-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.dsh-pm-detail[data-report-shell] [data-report-seg] { min-width: 0; }
/* 段间距照原型：结论头自带下边框、状态带自带上下留白与下边框、Tab 宿主只留一点上留白 */
.dsh-pm-detail[data-report-shell] [data-report-seg="band"] { padding: 6px 0; border-bottom: 1px solid var(--pm-line); }
.dsh-pm-detail[data-report-shell] [data-report-seg="tabs"] { padding-top: var(--s2); }

/* ══════════════════════════════════════════════════════════════════════════
   ② 常驻头部（对应原型 .head / .head-top / .chip / h1.title / .verdict / .stages / .actions / .winbtn）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--s2);
  padding: 0 0 var(--s3); border-bottom: 1px solid var(--pm-line);
}
/* 身份行（原型 .head-top）：id · 状态芯片 · 分类 · 难度 · 「更新于 …」 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  flex-basis: 100%; min-width: 0; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-card-id {
  font-family: var(--pm-mono); font-size: 11px; color: var(--pm-text2);
}
/* 状态芯片 = 原型 .chip.solid（主色浅底 / 主色字 / 600）；终态换绿，取消换灰 */
.dsh-pm-detail[data-report-shell] .dsh-pm-status {
  font-size: var(--f-tiny); font-weight: 600; line-height: 1.5;
  padding: 1px 8px; border: 0; border-radius: var(--pm-pill);
  background: rgba(74,125,255,.12); color: var(--pm-accent);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"],
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { background: rgba(40,167,69,.13); color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { background: var(--pm-bg-soft); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { background: rgba(23,162,184,.14); color: var(--pm-teal-text); }
/* 分类 / 难度 / 阻塞理由 = 原型 .chip（细边胶囊） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta {
  font-size: var(--f-tiny); line-height: 1.5; padding: 1px 8px;
  border: 1px solid var(--pm-line); border-radius: var(--pm-pill); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-meta[data-blocked-reason] {
  border-color: rgba(220,53,69,.35); color: var(--pm-danger); font-weight: 600;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-flag {
  font-size: var(--f-tiny); padding: 1px 7px; border-radius: var(--pm-pill);
  background: rgba(220,53,69,.12); color: var(--pm-danger); border: 0;
}
/* 「停留 … · 距上次更新 …」右对齐（原型 head-top 的」更新于 23:41」就在最右） */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-updated {
  margin-left: auto; font-size: var(--f-small); color: var(--pm-text2);
  font-variant-numeric: tabular-nums;
}
/* 标题 = 原型 h1.title（21px / 660 / 1.32 / -0.2px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  flex-basis: 100%; margin: var(--s2) 0 0; font-size: var(--f-h1); font-weight: 660;
  line-height: 1.32; letter-spacing: -.2px; color: var(--pm-text);
}
/* 次级行 = 原型标题下那行「创建 22:28（人）· 窗口（点击跳转到该会话）：…」 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub {
  display: flex; align-items: center; flex-wrap: wrap; gap: 2px var(--s2);
  flex-basis: 100%; min-width: 0; font-size: var(--f-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub .dsh-pm-report-meta {
  border: 0; padding: 0; font-size: var(--f-small); color: var(--pm-text2);
}
/* 一句话结论 = 原型 .verdict（左侧 3px 主色条 + 13.5px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  flex-basis: 100%; margin-top: var(--s2); padding: 0 0 0 var(--s3);
  border: 0; border-left: 3px solid var(--pm-accent); border-radius: 0; background: none;
  font-size: var(--f-h2); font-weight: 400; line-height: 1.5; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  flex-basis: 100%; font-size: var(--f-small); line-height: 1.5; color: var(--pm-text2);
}
/* 阶段条 = 原型 .stages / .stage：4px 圆头条 + 10px 居中标签（done 绿 / cur 蓝） */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  flex-basis: 100%; display: flex; gap: var(--s1);
  margin: var(--s2) 0 0; padding: 0; max-width: 520px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: var(--s1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot {
  width: 100%; height: 4px; border-radius: var(--pm-pill); opacity: 1;
  background: rgba(128,128,128,.18);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot {
  width: 100%; height: 4px; background: var(--pm-accent); box-shadow: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label {
  font-size: 10px; line-height: 1.4; color: var(--pm-text3); text-align: center; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label,
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot-label {
  color: var(--pm-text); font-weight: 600;
}
/* 操作条（2026-10-05 人类验收重做：三行参差 → **一行按钮** + 分级 + 只留一句常驻提示）。
   层级：「← 看板」(单独在左) ｜ 标签 ｜ 按钮区 ｜ 「均需人工确认」。
   按钮区自己承担换行；标签与行尾标不参与它的换行计算——上一版把标签/按钮/后果塞进
   同一个 flex 流，换行点由最长的后果决定，于是"第一个按钮跟标签挤一行、其余各自换行"。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  flex-basis: 100%; display: flex; align-items: flex-start; flex-wrap: wrap; gap: 6px var(--s3);
  margin-top: var(--s2); padding: var(--s2) var(--s3);
  background: var(--pm-bg-softer); border: 1px solid var(--pm-line-soft); border-radius: var(--r1);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar .dsh-pm-report-actions {
  flex: 1 1 420px; min-width: 0; display: flex; align-items: flex-start; flex-wrap: nowrap; gap: 6px var(--s3);
  padding: 0; border: 0; background: none;
}
/* 按钮区：**只装动作格**（标签与行尾标在它外面）。
   等宽栅格而不是文本流 → 1280 档三个按钮同一行、同一 offsetTop（硬判据见探针 A6）；
   900 档折行时也是等宽对齐（同一行的按钮宽度一致），不会参差。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid {
  flex: 1 1 auto; min-width: 0; display: grid; align-items: start;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s1) var(--s3);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-action-bar-label {
  font-size: var(--f-small); color: var(--pm-text2); padding-top: 6px; white-space: nowrap;
}
/* 每个动作 = 一格：**只有按钮**（说明不挨着按钮）；主操作下方允许一行短后果，其余全在 title */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; max-width: 100%;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { white-space: nowrap; }
/* 常驻短后果：整条操作区**只允许这一句**（主操作下方），10.5px 灰、单行 */
.dsh-pm-detail[data-report-shell] .dsh-pm-action-consequence {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden;
  max-width: 100%; font-size: 10.5px; line-height: 1.4; color: var(--pm-text3);
}
/* 行尾统一标一次（10.5px 灰字，不是三个粉色实心块）：逐按钮重复会被读成"要点三次"。
   每格各自是否人工门写在 data-human-only="true" 上（机器可读）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-human-only {
  font-size: 10.5px; font-weight: 400; padding: 0; border: 0; border-radius: 0;
  background: none; color: var(--pm-text3); white-space: nowrap; margin-top: 7px;
}
/* 危险动作（取消这类）：红色 + 弱化（描边不实心），**排最后**（Pajamas · Destructive actions） */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: rgba(220,53,69,.35); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { border-color: var(--pm-danger); background: rgba(220,53,69,.06); }
/* 终态只读说明：跟操作条同一行，不再单独占一行（顶对齐按钮行，与标签同一条基线） */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate { font-size: var(--f-small); color: var(--pm-text3); padding-top: 6px; }
/* 窗口跳转 = 原型 .winbtn（等宽小胶囊） */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-windows {
  display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--s2); padding: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window {
  font-family: var(--pm-mono); font-size: 11px; line-height: 1.5;
  padding: 1px 9px; border: 1px solid var(--pm-line); border-radius: var(--pm-pill);
  background: var(--pm-surface); color: var(--pm-text); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover {
  border-color: var(--pm-accent); color: var(--pm-accent); background: rgba(74,125,255,.06);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: dashed; color: var(--pm-text2); }
/* 按钮 = 原型 .abtn */
.dsh-pm-detail[data-report-shell] .dsh-pm-btn {
  padding: 5px 12px; border: 1px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: 12px; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:hover { border-color: var(--pm-accent); background: rgba(74,125,255,.06); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary {
  background: var(--pm-accent); border-color: var(--pm-accent); color: #fff;
}
/* 输入框（评论 / 回复 / 检索）：原型 .replybox input */
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  padding: 5px 10px; border: 1px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-text); font-size: 12.5px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-input::placeholder { color: var(--pm-text3); }
/* 评论列表（头部最近几条）：紧凑流式块——列表在上、输入框在下（与"新的在下"同向） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments {
  flex-basis: 100%; display: flex; flex-direction: column; gap: 0; margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  font-size: var(--f-tiny); color: var(--pm-text3); margin-bottom: 2px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment {
  display: flex; align-items: baseline; gap: 6px; min-width: 0;
  padding: 1px 0; border: 0; border-bottom: 1px solid var(--pm-line-soft); border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment:last-child { border-bottom: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-meta { flex: none; font-size: 10px; color: var(--pm-text3); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who { font-weight: 600; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who[data-actor="human"] { color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-long-flag { color: var(--pm-warn); font-weight: 600; }
/* 正文最多两行（全文在 title 属性里，一字不丢；再长的那类是机器转储，已在渲染层收纳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-body {
  flex: 1 1 auto; min-width: 0;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  font-size: var(--f-small); line-height: 1.35; color: var(--pm-text); word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form {
  flex-basis: 100%; display: flex; gap: var(--s2); margin-top: var(--s1); min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-input { flex: 1 1 auto; min-width: 0; padding: 3px 8px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form .dsh-pm-btn { padding: 3px 10px; }

/* ══════════════════════════════════════════════════════════════════════════
   ③ 状态带三格（对应原型 .band / .band-i / .band-h / .band-b / .gap-line / .dot）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s3);
  padding: 0; margin: 0;
}
/* 每格 = 原型 .band-i：极浅边 + 左侧 3px 语义色条（不用大留白，也不用卡片阴影） */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  display: block; margin: 0; padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-left: 3px solid var(--pm-text3);
  border-radius: var(--r1); background: none; min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="progress"] { border-left-color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="gaps"] { border-left-color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell="outcome"] { border-left-color: var(--pm-ok); }
/* 「无缺口」是一条正向结论 → 色条跟着转绿（:has 只影响配色，不影响内容与结构） */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat:has([data-gaps="none"]) { border-left-color: var(--pm-ok); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label {
  font-size: var(--f-small); font-weight: 400; text-transform: none;
  color: var(--pm-text3); margin-bottom: 3px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body {
  font-size: 12.5px; line-height: 1.6; color: var(--pm-text); word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-band-ok { color: var(--pm-ok-text); font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-band-mut { color: var(--pm-text3); }
/* 缺口逐条：**一条一行**（项名 + 状态），超出省略号收尾；全文（what ｜ why ｜ 出处）在 title。
   2026-10-05 人类验收：原来把验收标准原文 + 意见整段塞进小格再截断，读出来是"半句 + …"；
   常驻状态带只答"哪几条、多严重"，逐项原文在条款所在的文档 / 门禁（截断必须给出路）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line {
  display: flex; align-items: baseline; gap: 6px; min-width: 0;
  margin: 1px 0; padding: 0; border: 0; border-radius: 0; background: none;
  font-size: 11.5px; line-height: 1.5;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 出处芯片（如 FR-2 / 门禁号）：等宽小灰底，**不换行**（它是这一行的锚点） */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-ref {
  flex: none; font-family: var(--pm-mono); font-size: var(--f-tiny); padding: 0 4px; border-radius: 4px;
  background: var(--pm-bg-soft); color: var(--pm-text3);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-more { font-size: var(--f-tiny); color: var(--pm-text3); margin-top: 3px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict { font-size: 12.5px; font-weight: 700; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="rework"] { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-verdict[data-outcome="pending"] { color: var(--pm-warn); }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-counts { font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover-title { display: block; margin-top: 3px; font-weight: 600; }
/* 遗留逐条：同上**一条一行**（项名 · 状态）；标准原文与意见在 title，逐项正文在『文档』Tab 的验收单 */
.dsh-pm-detail[data-report-shell] .dsh-pm-outcome-leftover {
  font-size: 11px; line-height: 1.5; margin: 2px 0; padding: 0 0 0 8px;
  border-left: 3px solid rgba(240,160,32,.7); border-radius: 0; background: none;
  color: var(--pm-text2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ══════════════════════════════════════════════════════════════════════════
   ④ Tab 栏（对应原型 .tabs / .tab / .tab.active / .tab .cnt）
   ——文字页签 + 选中下划线 + 计数角标；**不是**胶囊芯片
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  display: flex; flex-wrap: wrap; gap: var(--s1);
  margin: 0 0 var(--s3); padding: 0; border-bottom: 1px solid var(--pm-line);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 7px 12px; margin-bottom: -1px;
  border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none;
  color: var(--pm-text2); font-size: 12.5px; font-weight: 400; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab:hover { background: none; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  color: var(--pm-accent); border-bottom-color: var(--pm-accent); font-weight: 600; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon { font-size: 13px; line-height: 1; }
/* 计数角标 = 原型 .tab .cnt（灰底小胶囊；没有数字就不渲染，渲染层已保证） */
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] {
  display: inline-flex; align-items: center; margin-left: 3px; padding: 0 6px;
  border-radius: var(--pm-pill); background: var(--pm-bg-soft); color: var(--pm-text3);
  font-size: var(--f-tiny); font-weight: 400; font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] {
  background: rgba(74,125,255,.12); color: var(--pm-accent);
}
/* 面板段：顶到 Tab 栏下沿，不再叠一层内边距 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-panel[data-tab-host] { padding: 0; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ 公共件：面板小标题 / 提示行 / 芯片 / 空态
   （原型 .panel h4 · .mut · .src · .evidence · .note · .dchip）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-block-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: var(--s4) 0 var(--s2); padding: 0; border: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-block { display: block; margin: 0 0 var(--s5); padding: 0; border: 0; background: none; border-radius: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-title { font-size: 12.5px; font-weight: 650; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary { font-size: 12.5px; line-height: 1.6; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-note { font-size: var(--f-small); color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-block-path { font-family: var(--pm-mono); font-size: 11px; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-hint { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-muted { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-note { font-size: var(--f-small); line-height: 1.55; color: var(--pm-text3); margin-top: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-empty { font-size: var(--f-small); color: var(--pm-text3); padding: 2px 0; }
.dsh-pm-detail[data-report-shell] code {
  font-family: var(--pm-mono); font-size: 11px; color: var(--pm-text2); word-break: break-all;
}
/* ── 行内 Markdown 的显示层（render/md-inline.ts 产出的标签）──────────────────────────
   正文是**文档原文**，标记在渲染层被剥掉/换标签（「**x**」→「<b>」、反引号里的 x→「<code>」、
   行首 「#」/「>」/「- 」→标题/引文/列表）。产物一律是内联级元素（「<span>」），
   块级形态靠这里的 「display」 决定——因为同一段 HTML 会落进 「<p>」 / 「<td>」 / 「<div>」 三种父节点。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h { display: block; font-weight: 650; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote {
  display: block; padding-left: 9px; border-left: 3px solid var(--pm-line); color: var(--pm-text2);
}
/* 无序列表：「- 」 换成 「•」（伪元素出字形），悬挂缩进让折行对齐正文而不是回到标记下方 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li {
  display: block; padding-left: 15px; text-indent: -15px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li::before {
  content: '\\2022'; color: var(--pm-text3); margin-right: 6px;
}
/* 有序列表：序号照原文（1. / 2.），只挪到悬挂位——**不改字** */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli { display: block; padding-left: 15px; text-indent: -15px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-num { color: var(--pm-text3); font-variant-numeric: tabular-nums; }
/* 文档里的表格行（「| 列 | 列 |」）：剥掉管道符，改成带细竖分线的横向栅格 */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-row {
  display: flex; flex-wrap: wrap; align-items: baseline; padding: 1px 0;
  border-bottom: 1px solid var(--pm-line-soft);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell { min-width: 0; padding-right: var(--s3); overflow-wrap: anywhere; }
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell + .dsh-pm-md-cell {
  padding-left: var(--s3); border-left: 1px solid var(--pm-line-soft);
}
/* 行内 code：等宽 + 极浅底（正文里的 「x」 不再是两个反引号） */
.dsh-pm-detail[data-report-shell] .dsh-pm-md-h code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-quote code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-li code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-oli code,
.dsh-pm-detail[data-report-shell] .dsh-pm-md-cell code,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line code,
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-text code,
.dsh-pm-detail[data-report-shell] .dsh-pm-block-summary code,
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff code,
.dsh-pm-detail[data-report-shell] .dsh-pm-callout code {
  font-size: .92em; padding: 0 4px; border-radius: 4px; background: var(--pm-bg-soft);
  color: var(--pm-text); word-break: break-word;
}
/* 来源标 = 原型 .src[data-k]（文档蓝 / 台账紫 / 自动绿 / 人写橙 / 无灰） */
.dsh-pm-detail[data-report-shell] .dsh-pm-src,
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src {
  font-size: 9.5px; line-height: 1.5; padding: 1px 6px; border: 0; border-radius: var(--r1);
  background: rgba(128,128,128,.14); color: var(--pm-text3); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="agent"],
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="doc"],
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="auto"] { background: rgba(74,125,255,.12); color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="ledger"],
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="new-section"] { background: rgba(142,68,173,.12); color: var(--pm-agent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-src[data-source="human"],
.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="human"] { background: rgba(240,160,32,.16); color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-src[data-source="none"] { background: rgba(128,128,128,.14); color: var(--pm-text3); }
/* 证据指针 = 原型 .evidence（细边胶囊，等宽） */
.dsh-pm-detail[data-report-shell] .dsh-pm-evidence {
  display: inline-block; font-family: var(--pm-mono); font-size: 11px; line-height: 1.5;
  padding: 1px 7px; border: 1px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-accent); word-break: break-all;
}
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence { display: flex; flex-direction: column; gap: 3px; }
.dsh-pm-detail[data-report-shell] ul.dsh-pm-evidence li {
  font-family: var(--pm-mono); font-size: 11px; color: var(--pm-text2);
  background: var(--pm-bg-softer); border-radius: 4px; padding: 2px 7px; word-break: break-all;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-evidence-missing { font-size: var(--f-small); font-weight: 600; color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review { font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pass"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-review[data-state="pending"] { color: var(--pm-warn); }
.dsh-pm-detail[data-report-shell] .dsh-pm-flag.verify-pending { background: rgba(240,160,32,.16); color: var(--pm-warn-text); }
/* 表格 = 原型 table.t（th 11px 灰底 / td 12px / 8px 12px / 细横线） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table {
  width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th {
  text-align: left; font-size: var(--f-tiny); font-weight: 600; color: var(--pm-text2);
  background: var(--pm-bg-soft); padding: var(--s2) var(--s3);
  border-bottom: 1px solid var(--pm-line); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td {
  padding: var(--s2) var(--s3); border-bottom: 1px solid var(--pm-line-soft);
  vertical-align: top; text-align: left; font-size: 12px; line-height: 1.55;
  word-break: break-word; overflow-wrap: anywhere;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td:first-child { white-space: nowrap; }
/* 列宽：把余量留给长文本列（路径 / 意见 / 证据）——固定布局下不给宽就会被平均分掉 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(1) { width: 84px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(3) { width: 110px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-doc-table] th:nth-child(4) { width: 190px; }
/* 核验表（7 列）**逐列给宽**（2026-10-05 全 Tab 扫出的变形）：真数据里「标准 / 实际结果 /
   证据 / 意见」都是整段人话或长路径，而「来源 / 需人工 / 裁决」只放短词。旧口径把标准压到 52px、
   证据压到 72px，其余两列吃满余量——结果证据列**一个字符一行**，整张表被撑成九万像素的墙。
   另：第一列原本吃「td:first-child { white-space: nowrap }」，52px 装不下就横着糊到邻列上
   （文字互相重叠），这里放开换行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:first-child { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(1) { width: 19%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(2) { width: 12%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(3) { width: 8%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(4) { width: 8%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(5) { width: 30%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(6) { width: 17%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-verify-table] th:nth-child(7) { width: 6%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(1) { width: 108px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(2) { width: 96px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(3) { width: 96px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(4) { width: 100px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table[data-gate-table] th:nth-child(5) { width: 110px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table th:first-child { width: 16%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table th { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table tbody tr:hover,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table tbody tr:hover { background: var(--pm-bg-softer); }

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ 汇报 Tab（trunk）：原型 .row / .rail / .body-col / .sum
   ——七条 = 左 150px 条名栏 + 右内容栏，细线分隔（不是七张卡片）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-trunk { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-docmeta {
  font-size: var(--f-small); color: var(--pm-text3); padding: 0 0 var(--s2);
}
/* 一条 = 左 150px 条名栏 + 右内容栏（原型 .row）。
   「align-items: start」 是**必需**的：默认 stretch 会让左栏长到与内容同高，
   于是栏内的 flex 行（标题/副标题/来源标）被 「align-content: stretch」 摊开——
   那颗来源标就掉到正文中段去了（2026-10-05 验收指出的变形③）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item {
  display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); column-gap: var(--gap-col);
  align-items: start;
  margin: 0; padding: var(--s4) 0; border: 0; border-top: 1px solid var(--pm-line);
  border-radius: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item:first-of-type { border-top: 0; }
/* 左栏（原型 .rail）：标题 → 副标题 → 来源标，自上而下紧凑排列、**顶对齐正文第一行** */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head {
  display: flex; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; align-self: start;
  gap: 2px 4px; margin: 0; min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-title { flex-basis: 100%; margin: 0; font-size: var(--f-h2); font-weight: 650; color: var(--pm-text); line-height: 1.35; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-sub { flex-basis: 100%; font-size: var(--f-tiny); line-height: 1.45; color: var(--pm-text3); }
/* 来源标紧贴副标题（原型 .rail .src 就在副标题下面一行），不参与行间拉伸 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head .dsh-pm-trunk-src { margin-top: 3px; }
/* 正文栏：行距放宽到 1.68（原型 .sum 是 13px，靠行距分层而不是靠 margin 撑高） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-body {
  display: flex; flex-direction: column; gap: var(--s2); min-width: 0;
  font-size: var(--f-body); line-height: 1.68;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-line { margin: 0; line-height: 1.68; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-mut { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-missing {
  font-size: var(--f-small); color: var(--pm-warn); background: rgba(240,160,32,.06);
  border: 1px dashed rgba(240,160,32,.45); border-radius: var(--r1); padding: 4px 8px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-scope-hint { font-size: var(--f-small); font-weight: 600; color: var(--pm-text2); }
/* 「点开原文」= **句尾一个小链接**（原型 .expand：accent / 12px / 无边框无底色 / hover 下划线）。
   此前渲成整行胶囊，被读成输入框（2026-10-05 验收指出的变形②）。出处（哪份文档哪一节）
   收成左侧一行灰字，完整路径在 title 里。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-openrefs {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 2px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px var(--s2); max-width: 100%;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ref-hint { font-size: var(--f-small); color: var(--pm-text3); word-break: break-word; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open {
  font: inherit; font-size: var(--f-small); padding: 0; margin: 0; cursor: pointer;
  border: 0; border-radius: 0; background: none; color: var(--pm-accent); white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open:hover { background: none; text-decoration: underline; }
/* 没有原文文件可开的入口（指向台账 / 留痕）：**不可点**的一行灰字说明，不画按钮 */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open.is-nopath {
  color: var(--pm-text3); cursor: default; background: none; white-space: normal; text-align: left;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open.is-nopath:hover { text-decoration: none; }
/* 亮点分组（原型 .hl-group / .hl-h / .fact / .fact-i / .hl / .hl-d / .hl-w / .hl-e） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-h { font-size: var(--f-small); font-weight: 400; color: var(--pm-text3); }
/* a) 自动事实：两列栅格的小盒子（原型 .fact） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] > .dsh-pm-trunk-hl-h { grid-column: 1 / -1; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] > .dsh-pm-trunk-mut { grid-column: 1 / -1; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact {
  display: block; padding: var(--s2) var(--s3); border: 1px solid var(--pm-line-soft);
  border-radius: var(--r1); font-size: 12px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-label { font-size: 12px; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-value { display: block; font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-fact-evid { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
/* b) 人写差异：实线细边小卡（原型 .hl） */
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-list { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl {
  display: block; padding: var(--s2) var(--s3); margin: 0;
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-diff { font-size: 12.5px; font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-why { font-size: var(--f-small); color: var(--pm-text2); margin-top: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-evid {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s2);
  font-size: var(--f-small);
}
/* 反例：无证据的差异 = 虚线红边弱化（与可核验的那堆一眼可分，FR-15） */
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-missing {
  display: block; padding: var(--s2) var(--s3); margin: 0 0 var(--s2);
  border: 1px dashed rgba(220,53,69,.35); border-radius: var(--r1); background: rgba(220,53,69,.03);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-hl-missing .dsh-pm-hl-why { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-unpay { padding: 0; border: 0; background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach { display: flex; align-items: center; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-ach-path { font-family: var(--pm-mono); font-size: 11.5px; color: var(--pm-text2); word-break: break-all; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ 文档 Tab（docs）：面板小标题 + table.t + 清单 / 生成物 / 其它发现 / 核验 / 门禁 / 归档
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-docs { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs > .dsh-pm-block:first-child > .dsh-pm-block-head { margin-top: 0; }
/* 文档路径 = 原型 .evidence 那种可点的小胶囊 */
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path {
  font-family: var(--pm-mono); font-size: 11px; line-height: 1.5; text-align: left; cursor: pointer;
  padding: 1px 7px; border: 1px solid var(--pm-line); border-radius: var(--r1);
  background: var(--pm-surface); color: var(--pm-accent); text-decoration: none; word-break: break-all;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path:hover { background: rgba(74,125,255,.08); text-decoration: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-path.dsh-pm-doc-missing {
  border-style: dashed; background: none; color: var(--pm-text3); cursor: default;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-state { font-size: 11.5px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict {
  font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: var(--pm-pill);
  background: var(--pm-bg-soft); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="passed"] { background: rgba(40,167,69,.13); color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="failed"] { background: rgba(220,53,69,.12); color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-verify-verdict[data-verify-verdict="pending"] { background: rgba(240,160,32,.16); color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list { display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 0; list-style: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-list li { display: flex; align-items: baseline; gap: var(--s2); font-size: 12.5px; line-height: 1.6; flex-wrap: wrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-label { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-kind { font-size: 9.5px; padding: 1px 6px; border-radius: var(--r1); background: var(--pm-bg-soft); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-group { display: flex; flex-direction: column; gap: 3px; margin: var(--s2) 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-generated { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2); }
/* 其它发现：一行一类（类型徽标 + 计数 + 样例） */
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-group {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px var(--s2);
  padding: 3px 0; border: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-num { font-size: 12px; font-weight: 650; color: var(--pm-text); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs .dsh-pm-discovered-rest { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-docs [data-discovered-sample] { font-size: var(--f-small); }
/* 归档对账 / 清单豁免：逐条铺开的小字行 */
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile { font-size: 12px; color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-reconcile[data-reconcile="none"] { color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-unlisted { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-unlisted li { font-size: var(--f-small); color: var(--pm-text2); word-break: break-all; }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-noack { color: var(--pm-danger); }
.dsh-pm-detail[data-report-shell] .dsh-pm-archive-ack { color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-source,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-human,
.dsh-pm-detail[data-report-shell] .dsh-pm-doc-cell-verdict { white-space: normal; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑧ 对话 Tab（dialogue）：原型 .speak / .msg / .msg.sys / .msg .who / .msg .when
   ——**一条流**：人 / agent 是「标签 + 时间 + 正文」的一行，系统消息居中灰底胶囊
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-search {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2);
  padding: var(--s2) var(--s3); margin-bottom: var(--s3);
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1); background: var(--pm-bg-softer);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-search .dsh-pm-input { flex: 1 1 220px; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-hits { font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-scope { flex-basis: 100%; font-size: var(--f-tiny); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-note { font-size: var(--f-small); color: var(--pm-warn); margin-bottom: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-list { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
/* 一条消息：不再是人/agent 两种气泡，而是同一条流里的一行 */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 4px;
  margin: 0; padding: 0; min-width: 0;
  border: 0; border-radius: 0; background: none; font-size: 12.5px; line-height: 1.6;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--human,
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--agent { margin: 0; background: none; border: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-head { display: inline; margin: 0; white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-meta { font-size: var(--f-tiny); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-actor {
  font-size: 10px; font-weight: 600; line-height: 1.5; padding: 1px 7px; margin-right: 6px;
  border-radius: var(--pm-pill); background: var(--pm-bg-soft); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--human .dsh-pm-msg-actor { background: rgba(74,125,255,.13); color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--agent .dsh-pm-msg-actor { background: rgba(142,68,173,.13); color: var(--pm-agent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-window { font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-time { font-size: var(--f-tiny); color: var(--pm-text3); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-text { flex: 1 1 60%; min-width: 0; font-size: 12.5px; line-height: 1.6; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-msg--system {
  display: flex; align-items: baseline; justify-content: center; gap: 6px; flex-wrap: wrap;
  margin: 0; padding: 2px 10px; text-align: center;
  background: var(--pm-bg-softer); border: 0; border-radius: var(--pm-pill);
  font-size: var(--f-small); color: var(--pm-text3);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-system-text { font-size: var(--f-small); line-height: 1.5; }
/* 回填标 = 原型 .inferred（虚线橙） */
.dsh-pm-detail[data-report-shell] .dsh-pm-msg-inferred {
  font-size: 9.5px; line-height: 1.5; padding: 0 5px; border-radius: var(--r1);
  color: var(--pm-warn); border: 1px dashed rgba(240,160,32,.5); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-hit { background: rgba(255,214,0,.5); color: inherit; border-radius: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-more { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2); margin-top: var(--s3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-more-note { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-reply { display: flex; gap: var(--s2); margin-top: var(--s3); padding-top: var(--s3); border-top: 1px solid var(--pm-line-soft); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dialogue-reply .dsh-pm-input { flex: 1 1 auto; min-width: 0; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑨ Token Tab：原型 .panel h4 / table.t / .opt / .opt-i
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h,
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s2);
  margin: var(--s4) 0 var(--s2); font-size: 12.5px; font-weight: 650; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-token-panel > .dsh-pm-tok-h:first-of-type,
.dsh-pm-detail[data-report-shell] .dsh-pm-prompts > .dsh-pm-pp-sec:first-child > .dsh-pm-pp-h:first-child { margin-top: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-h-note,
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-h-note { font-size: var(--f-small); font-weight: 400; color: var(--pm-text3); }
/* 口径说明 / 三态徽标：收成原型那种克制的注释块（不再用大块黄色告警） */
.dsh-pm-detail[data-report-shell] .dsh-pm-callout,
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-avail {
  font-size: var(--f-small); line-height: 1.6; padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1);
  background: var(--pm-bg-softer); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-avail {
  border-color: rgba(40,167,69,.3); background: rgba(40,167,69,.05); color: var(--pm-ok-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-callout[data-availability-badge="partial"] {
  border-color: rgba(240,160,32,.4); background: rgba(240,160,32,.06); color: var(--pm-warn-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-callout[data-availability-badge="none"] {
  border-color: rgba(128,128,128,.3); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-table td { font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-node { cursor: default; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-more { font-size: var(--f-tiny); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub { background: var(--pm-bg-softer); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub td { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-sub-num { float: right; color: var(--pm-text2); font-variant-numeric: tabular-nums; }
.dsh-pm-detail[data-report-shell] .dsh-pm-nosnap { color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tok-total td { font-weight: 650; color: var(--pm-text); background: var(--pm-bg-soft); }
.dsh-pm-detail[data-report-shell] .dsh-pm-bar {
  display: inline-block; width: 72px; height: 6px; border-radius: var(--pm-pill);
  background: var(--pm-line); vertical-align: middle;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-bar > i { display: block; height: 6px; border-radius: var(--pm-pill); background: var(--pm-accent); }
/* 可优化点 = 原型 .opt-i（左侧 3px 橙条的小卡，每条都带依据数字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-list { display: flex; flex-direction: column; gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt {
  display: block; padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-left: 3px solid var(--pm-warn);
  border-radius: var(--r1); background: none; font-size: 12.5px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-title { display: block; font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-basis { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-opt-sug { font-size: 12.5px; line-height: 1.6; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sum {
  display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4);
  font-size: var(--f-small); color: var(--pm-text3); margin-bottom: var(--s2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-sum b { color: var(--pm-text); font-variant-numeric: tabular-nums; }
/* 折叠块（注入成本）：原型 details 的克制长相——细边 + 小标题行 */
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold {
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary {
  display: flex; align-items: center; gap: var(--s2); padding: 5px var(--s3);
  font-size: 12px; font-weight: 600; color: var(--pm-text2); background: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold > summary:hover { background: var(--pm-bg-softer); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-body { padding: var(--s2) var(--s3); border-top: 1px solid var(--pm-line-soft); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-fold .dsh-pm-fold-count { font-size: var(--f-small); font-weight: 400; color: var(--pm-text3); margin-left: auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-row { display: flex; align-items: center; gap: var(--s2); font-size: var(--f-small); margin: 3px 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-name { width: 130px; color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-bar { flex: 1; height: 6px; border-radius: var(--pm-pill); background: var(--pm-bg-soft); overflow: hidden; }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-bar > i { display: block; height: 6px; background: rgba(194,37,92,.75); }
.dsh-pm-detail[data-report-shell] .dsh-pm-impact-val { width: 80px; text-align: right; color: var(--pm-text2); font-variant-numeric: tabular-nums; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑩ 提示词 Tab（prompts）：原型 .frag / pre.prompt-text / .spec-vs / .sv-col / .ctx-line
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-prompts { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-pp-sec { display: block; padding: 0; border: 0; background: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt,
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt {
  margin: 0 0 var(--s2); border: 1px solid var(--pm-line-soft); border-radius: var(--r1);
  background: none; overflow: visible;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary {
  display: flex; align-items: center; gap: var(--s2); padding: var(--s2) var(--s3);
  font-size: 12px; color: var(--pm-text2); background: none; cursor: pointer;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary:hover { background: var(--pm-bg-softer); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::-webkit-details-marker { display: none; }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > summary::before {
  content: '\\25B8'; color: var(--pm-text3); font-size: 10px; transform: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[open] > summary::before { content: '\\25BE'; transform: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-name { font-family: var(--pm-mono); font-size: 11px; font-weight: 400; color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-meta { margin-left: auto; font-size: var(--f-small); color: var(--pm-text3); font-variant-numeric: tabular-nums; }
/* 被裁片段 = 原型 .frag.trimmed（虚线橙） */
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt[data-prompt-trimmed] {
  border-style: dashed; border-color: rgba(240,160,32,.5); background: rgba(240,160,32,.05);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt-pre { display: block; width: auto; margin: var(--s2) var(--s3) var(--s3); }
.dsh-pm-detail[data-report-shell] details.dsh-pm-prompt > .dsh-pm-prompt-pre,
.dsh-pm-detail[data-report-shell] .dsh-pm-prompt .dsh-pm-prompt-pre { border-radius: var(--r1); }
/* 规定 vs 实际 = 原型 .spec-vs / .sv-col / .sv-h */
.dsh-pm-detail[data-report-shell] .dsh-pm-specvs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-col {
  display: block; min-width: 0; padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-h { font-size: var(--f-small); color: var(--pm-text3); margin-bottom: var(--s2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list { margin: 0; padding-left: 18px; font-size: 12.5px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-list code { font-family: var(--pm-mono); font-size: 11px; word-break: break-all; }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-trimmed { color: var(--pm-warn); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-frags { display: flex; flex-wrap: wrap; gap: 4px; font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-sv-diff { font-size: var(--f-small); line-height: 1.65; color: var(--pm-text2); word-break: break-word; }
/* 片段芯片（可点开源文件 / 路由壳） */
.dsh-pm-detail[data-report-shell] .dsh-pm-np-doc {
  font-family: var(--pm-mono); font-size: 11px; padding: 1px 7px; cursor: pointer;
  border: 1px solid var(--pm-line); border-radius: var(--r1); background: var(--pm-surface); color: var(--pm-accent);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-np-shell {
  font-family: var(--pm-mono); font-size: 11px; padding: 1px 7px; border: 1px dashed var(--pm-line);
  border-radius: var(--r1); color: var(--pm-text3);
}
/* 注入留痕 = 原型「三个来源 / 两种后果」的逐条卡（左侧色条按后果上色） */
.dsh-pm-detail[data-report-shell] .dsh-pm-inj {
  display: block; margin-bottom: var(--s2); padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-left: 3px solid var(--pm-text3);
  border-radius: var(--r1); background: none; font-size: 12.5px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="true"] { border-left-color: var(--pm-ok); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="false"] { border-left-color: var(--pm-danger); background: rgba(220,53,69,.03); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj[data-delivered="unknown"] { border-left-color: rgba(128,128,128,.5); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-meta { font-size: var(--f-small); color: var(--pm-text3); font-family: var(--pm-mono); }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-verdict { font-size: 12.5px; font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-line { font-size: var(--f-small); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-frags { display: flex; flex-wrap: wrap; gap: 4px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-inj-body,
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body {
  margin-top: var(--s2); padding: var(--s2) var(--s3);
  border: 1px dashed var(--pm-line); border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] details.dsh-pm-inj-body > summary { font-size: var(--f-small); color: var(--pm-text2); cursor: pointer; }
/* 上下文 / 节点隔离留痕 */
.dsh-pm-detail[data-report-shell] .dsh-pm-iso,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso {
  display: block; margin-top: var(--s2); padding: 5px var(--s3);
  border: 1px solid var(--pm-line-soft); border-left: 3px solid var(--pm-text3);
  border-radius: var(--r1); background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-status,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-status { font-size: var(--f-tiny); font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-meta,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-meta { font-size: var(--f-tiny); color: var(--pm-text3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-iso-reason,
.dsh-pm-detail[data-report-shell] .dsh-pm-np-iso-reason { font-size: 12.5px; line-height: 1.6; color: var(--pm-text); word-break: break-word; }
.dsh-pm-detail[data-report-shell] .dsh-pm-np-inj-entry { margin-bottom: var(--s2); }

/* ══════════════════════════════════════════════════════════════════════════
   ⑪ DAG Tab：原型 .dchip / 每步执行结果表（画布本身沿用既有 .dsh-pm-dag-* 分片，不在这里重定义）
   ══════════════════════════════════════════════════════════════════════════ */

.dsh-pm-detail[data-report-shell] .dsh-pm-report-dag { display: block; min-width: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dag-summary {
  display: flex; flex-wrap: wrap; gap: 4px var(--s4); padding: var(--s2) var(--s3);
  border: 1px solid var(--pm-line-soft); border-radius: var(--r1); background: var(--pm-bg-softer);
  font-size: var(--f-small); color: var(--pm-text2); font-variant-numeric: tabular-nums;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-sec-title {
  margin: var(--s4) 0 var(--s2); font-size: 12.5px; font-weight: 650; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step[data-outcome="failed"] { background: rgba(220,53,69,.04); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-title { font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-outcome { font-weight: 600; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-summary { font-size: var(--f-small); line-height: 1.55; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-step-error {
  margin-top: 3px; font-family: var(--pm-mono); font-size: 11px; color: var(--pm-danger);
  background: rgba(220,53,69,.07); border-radius: 4px; padding: 3px 7px; word-break: break-word;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-zero {
  margin-top: 3px; font-size: var(--f-small); font-weight: 600; color: var(--pm-warn-text);
  background: rgba(240,160,32,.12); border: 1px solid rgba(240,160,32,.4);
  border-radius: 4px; padding: 2px 7px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-evidence { list-style: none; margin: 3px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-evidence li {
  font-family: var(--pm-mono); font-size: var(--f-tiny); color: var(--pm-text3);
  background: var(--pm-bg-softer); border-radius: 4px; padding: 1px 6px; word-break: break-all;
}
/* 每步执行结果表（8 列）：**固定布局下不给宽就被平均分掉**——真数据 84 行里
   「产出与汇报」是整段人话、」谁做」是 36 字符会话 id，各分到 1/8（≈155px）时
   一列只能容十来个字，整表变成一堵折行的墙（2026-10-05 全 Tab 扫出的变形）。
   宽口径：把余量给人话列（产出 31%），id 列给到能容 3 段的宽度，其余列只放短词。
   第一列原本吃 「td:first-child { white-space: nowrap }」，这里放开——卡名可以折行。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] td:first-child,
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:first-child { white-space: normal; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(1) { width: 16%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(2) { width: 9%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(3) { width: 11%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(4) { width: 7%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(5) { width: 12%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(6) { width: 6%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(7) { width: 25%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th:nth-child(8) { width: 14%; }
/* 表头两行也不要撑破：长表头（产出与汇报）用较窄的字距换行，不挤列 */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-table[data-step-table] th { line-height: 1.35; }

/* ══════════════════════════════════════════════════════════════════════════
   ⑫ 窄档（原型只给了 1280 一档；≤1000px 时按同一套口径收得更紧，不换视觉语言）
   ——只改间距与"补充说明"的呈现，不改结构、不改内容归属、不加内层滚动
   ══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 1000px) {
  .dsh-pm-detail[data-report-shell] { padding: 12px 14px 64px; }
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item { grid-template-columns: 1fr; row-gap: var(--s2); }
  .dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] { gap: var(--s2); }
  /* 缺口一条压成一行：why / ref 是补充说明，窄档用省略号收尾（what 永远完整可见）。
     为什么必须收：900px 档下 5 条缺口各折 2~3 行会把六个 Tab 顶出首屏（那是验收判红的缺陷）。 */
  /* 缺口条本来就是一行（见上），窄档不再另压 */
  .dsh-pm-detail[data-report-shell] .dsh-pm-specvs,
  .dsh-pm-detail[data-report-shell] .dsh-pm-trunk-hl-group[data-hl-group="facts"] { grid-template-columns: 1fr; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑬ 暗色主题：只换"语义前景色"这一组令牌
   ——DSH 在 <html>/<body> 上挂 [data-ds-dark-theme]；原型是浅色稿，其深绿/深棕/深紫
     在暗底上对比不足，故这里把同色相提亮一档。线条与底色用的是中性半透明灰，
     深/浅两套都成立，不需要覆盖。
   ══════════════════════════════════════════════════════════════════════════ */

[data-ds-dark-theme] .dsh-pm-detail[data-report-shell] {
  --pm-ok: #3fae57; --pm-warn: #d9a14a; --pm-danger: #e8565f;
  --pm-ok-text: #5fce7a; --pm-warn-text: #e0b566;
  --pm-agent: #c08fd8; --pm-teal-text: #57c7d6;
}
`
