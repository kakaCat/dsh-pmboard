/**
 * 需求详情页 UI **三版候选设计**（V-A 单卡报头 / V-B 文档流 / V-C 仪表盘）——
 * 出图 + 「同一把尺子」实测 + 三版对照图 — REQ-261005155003-f32f。
 *
 * ## 为什么有这个脚本
 *
 * 人对现版原型（`prototypes/detail-ui-v2.html`，REQ-261005155003-f32f 的 authoritative）**不满意**
 * （原话「原型不满意，你重新画一下」）。重画不是换配色：这里出**三版结构上真的不同**的候选，
 * 每版一张 1280 在途态渲染图 + 一张三版对照图，并用**同一把尺子**量同一批数字，供人挑。
 *
 * ## 三版为什么可比（这是本脚本最重要的设计决定）
 *
 * 三版**复用同一份标本 DOM**——就是 `scripts/fixtures/req-detail-specimen.mts` 的
 * `specimenShell(...)`（真实 `buildReportShell(...)` + 真实 13 片 CSS + 同一份 mock 数据），
 * **只换 CSS 层**。所以三版之间、以及与人已看过的改前（`ui-before-*`）/ 改后（`ui-after-*`）图
 * 之间，逐像素可对照：图上任何差异都只可能来自"设计"，不可能来自"数据变了"。
 *
 * 结构差异靠 CSS 布局实现（`display: contents` + `order` + `flex-wrap` 重排既有块），
 * 不改 DOM 结构、不改 `data-*`、不改壳字符串：
 *   · `[data-report-seg="head"|"band"]` 与 `.dsh-pm-detail-head` 用 `display: contents`
 *     把儿子提升为 `.dsh-pm-detail` 的 flex 项，再用 `order` 排成各版的版式；
 *   · 唯一"新加的 DOM"是**渲染时注入**（页内脚本，见 `INJECT_JS`）：
 *     ① FR-1 的六个内联 SVG（替掉结构位 emoji）；② FR-3 的 role/aria/tabindex/id；
 *     ③ FR-11 的三处文案收敛（删「本阶段操作」、删常驻后果节点、行尾标改短，
 *        并把后果挪进 `aria-describedby` 指向的视觉隐藏节点）。
 *     注入对三版**完全一致**，所以它不构成"三版之间的差异"。
 *
 * ## 纪律（本脚本自己守）
 *
 *   ① **不动 src/**、不动 `prototypes/**`、不动既有两个出图脚本与 `scripts/fixtures/**`；
 *      产物只落 `docs/requirements/REQ-261005155003-f32f/evidence/variants/`。
 *   ② **不覆盖** evidence/ 下既有 png/txt（本脚本只写 `variants/` 子目录）。
 *   ③ 三版**都不写进 `proto-geometry`**（那是权威原型的机器面），也不碰 `prototypes/INDEX.md`。
 *   ④ 阈值只在本脚本里；三版 HTML 里只有 CSS/注释，没有阈值。
 *   ⑤ **响亮失败**：任一版不满足硬几何或色板约束 → 退出码 1，如实打印，不放宽阈值。
 *
 * 用法：npx tsx scripts/req-detail-ui-variants-shot.mts
 *
 * 产物（`docs/requirements/REQ-261005155003-f32f/evidence/variants/`）：
 *   vA.html / vB.html / vC.html                     三版自包含样品页（?state=inflight|terminal、?annot=0）
 *   variant-A-1280-inflight.png …-B-… …-C-…         各一张 1280 在途态（2 倍图 = 2560×1600）
 *   variant-contact-sheet.png                       三版并排对照图（PIL 生成，标题用英文字符）
 *   metrics.txt                                     三版同一把尺子的实测表（值 + 判定）
 *
 * 退出码：0 全过 / 1 有断言失败 / 2 环境不可用（找不到 Chrome 或找不到带 Pillow 的 python）。
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome, specimenShell, type SpecimenState } from './fixtures/req-detail-specimen.mts'

/* ───────────────────────────────────────────────────── 路径与常量 */

/** 仓库根（本脚本在 `<root>/scripts/` 下）。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 三版产物目录（**新建**的子目录：不碰 evidence/ 下既有 png/txt）。 */
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence', 'variants')

/** 出图档：1280 在途（人已看过的 before/after 图同宽同状态，故可比）。 */
const SHOT_WIDTH = 1280
const SHOT_STATE: SpecimenState = 'inflight'

/** 2 倍图（与 before/after 同口径）：PNG 像素 = CSS 像素 × 2。 */
const SCALE = 2
/** `--window-size` 的高（`--screenshot` 口径下实测视口就是它）。 */
const WINDOW_HEIGHT = 800
/** `--dump-dom` 口径下的实测首屏视口高（既有探针 `TABS_TOP_MAX` 那一档，比 800 更严）。 */
const VIEWPORT_H = 713

/** 硬阈值（判据来源：REQ-261005155003-f32f 的 FR-1～FR-11）。 */
const TABS_TOP_MAX = 713
const TARGET_MIN = 24          // FR-5：命中区 ≥24×24 CSS px
const FONT_MIN = 11            // FR-7：真文字最小字号
const TEXT_CONTRAST_MIN = 4.5  // FR-4：真文字对比度
const NON_TEXT_CONTRAST_MIN = 3 // FR-4：焦点环 / 图标等非文本
const MIN_PNG_BYTES = 20 * 1024

/** FR-10 七项「样式多样性」上限（同一把尺子；与既有出图脚本同口径同阈值）。 */
const VARIETY_MAX = {
  pills: 5, fg: 5, bg: 4, fontWeight: 3, fontSize: 5, radius: 2, borderColor: 2,
} as const

/**
 * FR-10 色板白名单（逐值定死）。三版 CSS 里出现的**任何**颜色字面量都必须在这里。
 * `rgba(0,113,227,.25)` 是 FR-10 §8 明写的焦点环 halo（`--pm-accent` 的 25% 影子）。
 * `transparent` / `currentcolor` / `none` / `inherit` 不是色值，放行。
 */
const PALETTE = [
  '#1d1d1f', '#6e6e73', '#86868b', '#0071e3', '#d70015', '#c93400', '#1e7e34',
  '#0000001a', '#00000029', '#f5f5f7', '#fff', '#ffffff',
  'rgba(0,113,227,.25)',
  'transparent', 'currentcolor', 'none', 'inherit', 'initial',
] as const

/* ───────────────────────────────────────────────────── 共用 CSS 层（三版一致） */

/**
 * 共用层：令牌 + 可访问性 + 目标尺寸 + 动效 + FR-10 的色板/字阶/胶囊收敛 + FR-8 的状态标记。
 *
 * 三版**一字不差**地用这一层——差异只允许出现在各版自己的"版式层"里。
 * 这样"三版不同"就不会被误读成"三版的可访问性不同"。
 */
const SHARED_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   共用层（三版一致）：令牌 / 焦点 / 语义 / 目标尺寸 / 动效 / 收敛 / 状态标记
   规范出处（ui-ux-pro-max，本仓 vendored：.dsh/skills/ui-ux-pro-max/）：
     ① python3 .dsh/skills/ui-ux-pro-max/scripts/search.py "spacing scale rhythm" --domain ux
        → Touch Spacing（相邻目标 ≥8px 间距）· Text Reflow and Spacing（内容驱动高度、不裁字）
     ② … "visual hierarchy whitespace" --domain ux
        → Hover States（可点元素要有反馈）· Heading Hierarchy（h1→h3 顺序，不跳级）
     ③ … "segmented control" --domain ux
        → Cancellable State Transitions（紧凑控件状态直落终态，不依赖 transitionend）
        · Keyboard Navigation（tab 顺序与视觉顺序一致、焦点可见）
     ④ … "tab bar active state" --domain ux
        → Active State（当前位置用颜色/下划线标出）· Active States（按下即有反馈）
     ⑤ … "card grouping density" --domain ux → **0 命中**（库里没有这条）；
        改用 "dashboard information density" / "grouped list section" 复核
        → Color Only（状态不许只靠颜色）· Active State —— 如实记录：第 ⑤ 条是"无命中后改检索"，
        不是直接命中。

   色板只允许 FR-10 定死的那几个值（脚本会静态扫描本层与版式层的每一个颜色字面量）。
   三级灰 #86868b（3.62:1）**只许非文本**：本层把 --pm-text3 直接设为二级灰
   （#6e6e73，5.07:1），因为它在这个标本里承载的是真文字。
   ══════════════════════════════════════════════════════════════════════════ */
.dsh-pm-detail[data-report-shell] {
  --pm-text: #1d1d1f;         /* 苹果 label */
  --pm-text2: #6e6e73;        /* 苹果 secondaryLabel：承载全部次要真文字 */
  --pm-text3: #6e6e73;        /* 三级灰只许非文本 → 这里收敛为二级灰（真文字也安全） */
  --pm-accent: #0071e3;       /* 唯一强调色（苹果系统蓝） */
  /* hover **不引第二档蓝**：#0062c4 不在 FR-10 色板里（脚本静态扫描会红）。
     hover 一律落到正文色（描边控件变深、实心主按钮变深），色数因此不增加。 */
  --pm-accent-hover: var(--pm-text);
  --pm-danger: #d70015; --pm-warn-text: #c93400; --pm-ok-text: #1e7e34;
  --pm-ok: #1e7e34; --pm-warn: #c93400; --pm-agent: #6e6e73; --pm-teal-text: #6e6e73;
  --pm-line: #0000001a; --pm-line-strong: #00000029; --pm-line-soft: #0000001a;
  --pm-bg-soft: #f5f5f7; --pm-bg-softer: transparent; --pm-surface: #fff;
  --pm-accent-text: var(--pm-accent); --pm-danger-text: var(--pm-danger);
  --pm-ok-text-tint: var(--pm-ok-text); --pm-teal-text-tint: var(--pm-text2);
  --pm-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 28px;
  --r1: 8px; --r2: 8px; --pm-pill: 999px; --pm-hair: .5px;
  --f-tiny: 11px; --lh-tiny: 15px;
  --f-small: 12px; --lh-small: 16px;
  --f-body: 13px; --lh-body: 20px;
  --f-h2: 15px; --lh-h2: 22px;
  --f-h1: 20px; --lh-h1: 25px;
  --pm-icon: 14px; --pm-icon-sm: 12px;
  --pm-dur-fast: 90ms; --pm-dur: 120ms; --pm-dur-slow: 150ms;
  --pm-ease: cubic-bezier(.2,.7,.3,1);
  --pm-ring-w: 2px; --pm-halo: 0 0 0 3px rgba(0,113,227,.25);
  color: var(--pm-text); background: var(--pm-surface);
  font-size: var(--f-body); line-height: 1.55;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
/* FR-4 ③ 浅色岛：宿主深色主题下同一副长相。report.ts 末尾那块
   \`[data-ds-dark-theme] .dsh-pm-detail[data-report-shell]\` 会翻转岛内语义前景色
   （白底上 --pm-danger 从 5.38:1 掉到 ≈3.4:1）——这里用**同特异性 + 后置**把它按回浅色原值
   （真实实施是**整块删除**；原型只能这样等价表达）。 */
[data-ds-dark-theme] .dsh-pm-detail[data-report-shell] {
  --pm-ok: #1e7e34; --pm-warn: #c93400; --pm-danger: #d70015;
  --pm-ok-text: #1e7e34; --pm-warn-text: #c93400; --pm-accent: #0071e3;
  --pm-text3: #6e6e73; --pm-agent: #6e6e73; --pm-teal-text: #6e6e73;
}
.dsh-pm-detail[data-report-shell] *,
.dsh-pm-detail[data-report-shell] *::before,
.dsh-pm-detail[data-report-shell] *::after { box-sizing: border-box; }

/* ── FR-2 焦点环：2px 实线 + 偏移（小控件 +2 外偏移；面状控件 -2 内偏移），带苹果式 halo ── */
.dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"]):focus-visible {
  outline: var(--pm-ring-w) solid var(--pm-accent);
  outline-offset: 2px;
  box-shadow: var(--pm-halo);
}
/* 面状控件（Tab）用 -2px 内偏移。⚠️ 特异性：上面那条 :is(...) 里的 a[href] 是 (0,1,1)，
   整条算下来是 (0,4,1) —— 只写 [role="tab"]:focus-visible (0,4,0) 会被它盖住（实测 offset 还是 +2px）。
   这里把 [role="tab"] 再写一遍凑到 (0,5,1)，两档偏移才是真的两档。 */
.dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"])[role="tab"]:focus-visible {
  outline-offset: -2px;
}

/* ── FR-6 动效令牌：时长/缓动单点；只动颜色类属性（不动几何）；reduced-motion 归零 ──
   注意（踩过的坑）：reduced-motion 分支必须用**与上面同级**的选择器写，否则上面那条
   「:is(...)」的类级特异性会盖住「*」的归零，计算时长仍是 0.12s（FR-6 ④ 假绿）。 */
.dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"]) {
  transition: color var(--pm-dur) var(--pm-ease), background-color var(--pm-dur) var(--pm-ease),
    border-color var(--pm-dur) var(--pm-ease), outline-color var(--pm-dur-fast) var(--pm-ease);
}
@media (prefers-reduced-motion: reduce) {
  .dsh-pm-detail[data-report-shell] *,
  .dsh-pm-detail[data-report-shell] *::before,
  .dsh-pm-detail[data-report-shell] *::after,
  .dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"]),
  .dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"])::before,
  .dsh-pm-detail[data-report-shell] :is(button, a[href], summary, input, [role="tab"])::after {
    transition-duration: 0ms; animation-duration: 0ms;
  }
}

/* ── FR-5 目标尺寸：命中区 ≥24×24（视觉可以更小，命中区不可以）── */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-btn, .dsh-pm-window, .dsh-pm-input, .dsh-pm-tab,
  .dsh-pm-trunk-open, button, input, summary, [role="tab"]) {
  min-height: 24px; min-width: 24px;
}

/* ── FR-1 图标：尺寸只走 --pm-icon 一档；颜色 currentColor（跟随选中色）── */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--pm-icon); height: var(--pm-icon); font-size: var(--f-tiny); line-height: 1;
}
/* 注：图标 span 的 font-size 必须**落在五档里**（图形尺寸走 width/height，不看字号）。
   踩过两次：写 14px（=图标令牌）→ 字号多出第 6 档；写 0 → 0px 也是一种字号，还是第 6 档。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-tab-icon svg {
  display: block; width: var(--pm-icon); height: var(--pm-icon);
  fill: none; stroke: currentColor;
}

/* ── FR-11 视觉隐藏但可访问（aria-describedby 的落点）── */
.dsh-pm-detail[data-report-shell] .dsh-pm-sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* ── FR-10 ② 胶囊只留两类 · 元信息纯文本 · 计数纯数字（取消全部 12% 语义浅底）──
   踩过的坑：分片里凡带 [data-*] 的配色规则特异性都是 (0,4,0) 量级——
   覆盖它必须**带上同一个属性选择器**，否则"看起来写了、其实没生效"（本层第一轮就栽在这里：
   来源标仍带紫/琥珀底、计数角标仍带蓝底、状态仍带蓝底）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-status {
  padding: 0; border: 0; background: none; font-size: var(--f-tiny); line-height: var(--lh-tiny);
  font-weight: 500; color: var(--pm-accent);
}
/* 状态色随状态走，但**一律落在白底**上（主色在分组底 #f5f5f7 上只有 4.31:1 < 4.5:1）：
   需要把状态放进浅灰卡的版式（V-A）会在自己的版式层里把它改成 --pm-text。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status] { background: none; border: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="done"],
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="archived"] { color: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="canceled"] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status[data-status="accepting"] { color: var(--pm-warn-text); }
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-report-meta, .dsh-pm-flag) {
  padding: 0; border: 0; border-radius: 0; background: none;
  font-size: var(--f-tiny); line-height: var(--lh-tiny); font-weight: 400; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-report-meta, .dsh-pm-flag)[data-blocked-reason] {
  background: none; border: 0; color: var(--pm-text2); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-fold-count[data-badge] {
  margin-left: 4px; padding: 0; border-radius: 0; background: none;
  color: var(--pm-text2); font-size: var(--f-small); font-weight: 400;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-fold-count[data-badge] {
  background: none; color: inherit; font-weight: 400;
}
/* 来源标（文档 / 台账 / 人工留痕 / 自动汇总）：元信息 → 纯灰，不按来源上色 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-src, .dsh-pm-trunk-src) {
  padding: 0; border: 0; border-radius: 0; background: none;
  color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny);
}
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-src, .dsh-pm-trunk-src)[data-source] {
  padding: 0; border: 0; border-radius: 0; background: none; color: var(--pm-text2);
}
/* 评论人名的 actor 配色（base 里 human=主色，是 (0,4,0)）：名字是元信息 → 二级灰 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-who[data-actor] { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment {
  background: none; border-radius: 0; border-color: var(--pm-line);
}
/* 语义浅底块一律去底（配色靠文字色，不靠底块） */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-trunk-missing, .dsh-pm-hl-missing, .dsh-pm-callout,
  .dsh-pm-dialogue-note, .dsh-pm-flag.verify-pending, .dsh-pm-comment-long-flag) {
  background: none; color: var(--pm-text2); border-color: var(--pm-line);
}

/* 缺口出处芯片（如 FR-2 / t-98684c / 长文档路径）：不换行、超出省略号收尾——
   长路径是无空格 monospace，不夹住就会把所在的那一格撑宽（全文仍在 gap-line 的 title 里）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-ref {
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── FR-10 边界：胶囊/圆角/边线/字重/字号逐项收敛 ──
   圆角：本层只保留 8px 一档（各版需要更多档时在**版式层**里声明，且总数 ≤2）；
   边线：发丝线一档（#0000001a）；字重 400/500/600；字号 11/12/13/15/20。 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-gap-ref, code, .dsh-pm-trunk-ref, .dsh-pm-evidence) { border-radius: 0; }
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-btn, .dsh-pm-input, .dsh-pm-window) { border-radius: var(--r1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn { border-color: var(--pm-line); background: var(--pm-surface); color: var(--pm-text); font-size: var(--f-small); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn:hover { border-color: var(--pm-accent); color: var(--pm-accent); background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary { background: var(--pm-accent); border-color: transparent; color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.primary:hover { background: var(--pm-text); color: #fff; }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger { color: var(--pm-danger); border-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-btn.danger:hover { color: var(--pm-danger); border-color: var(--pm-danger); background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-window {
  border-color: var(--pm-line); background: var(--pm-surface); color: var(--pm-text);
  font-family: var(--pm-mono); font-size: var(--f-tiny); line-height: var(--lh-tiny);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-window:hover { border-color: var(--pm-accent); color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-window.is-archived { border-style: dashed; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-input {
  border-color: var(--pm-line); background: var(--pm-surface); color: var(--pm-text);
  font-size: var(--f-body); line-height: var(--lh-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-input::placeholder { color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open {
  margin: 0; padding: 0; border: 0; background: none; font-size: var(--f-small);
  line-height: var(--lh-small); color: var(--pm-accent); cursor: pointer;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-open:hover { color: var(--pm-accent-hover); }

/* 字重：400 / 500 / 600（消灭 650 / 660 / 700） */
.dsh-pm-detail[data-report-shell] :is(b, strong, h1, h2, h3, h4) { font-weight: 500; }
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-detail-title, .dsh-pm-trunk-title, .dsh-pm-block-title,
  .dsh-pm-md-h, .dsh-pm-outcome-verdict, .dsh-pm-hl-diff, .dsh-pm-comment-who,
  .dsh-pm-band-ok, .dsh-pm-trunk-scope-hint, .dsh-pm-evidence-missing) { font-weight: 600; }

/* 字号：把所有裸 px 归到五档 11 / 12 / 13 / 15 / 20 */
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-dot-label, .dsh-pm-comment-meta, .dsh-pm-card-id,
  .dsh-pm-gap-ref, .dsh-pm-gap-more, .dsh-pm-human-only, .dsh-pm-trunk-sub, .dsh-pm-trunk-ref-hint,
  .dsh-pm-trunk-mut, .dsh-pm-trunk-hl-h, .dsh-pm-trunk-missing, .dsh-pm-block-path,
  .dsh-pm-evidence) { font-size: var(--f-tiny); line-height: var(--lh-tiny); }
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-rh-top, .dsh-pm-rh-sub, .dsh-pm-detail-updated,
  .dsh-pm-report-next, .dsh-pm-comment-body, .dsh-pm-stat-label, .dsh-pm-gap-line,
  .dsh-pm-gap-line *, .dsh-pm-outcome-leftover, .dsh-pm-trunk-docmeta, .dsh-pm-trunk-ach-path,
  .dsh-pm-hl-why, .dsh-pm-block-summary, .dsh-pm-block-note, .dsh-pm-hint, .dsh-pm-muted,
  .dsh-pm-note, .dsh-pm-empty, .dsh-pm-review, .dsh-pm-action-bar-label) {
  font-size: var(--f-small); line-height: var(--lh-small);
}
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-report-band-body, .dsh-pm-outcome-verdict,
  .dsh-pm-outcome-counts, .dsh-pm-hl-diff, .dsh-pm-trunk-scope-hint, .dsh-pm-evidence-missing) {
  font-size: var(--f-small); line-height: var(--lh-small);
}
.dsh-pm-detail[data-report-shell] :is(.dsh-pm-tab, .dsh-pm-block-title, .dsh-pm-block-summary) { font-size: var(--f-body); }

/* ── FR-8 状态不靠颜色单一表达（形状/文字第二判据）──
   ① 阶段条：完成 = ✓ 前缀、当前 = ▸ 前缀、未开始不带；
   ② 缺口严重度：!! / ! / · 三档文本标记（圆点 emoji 之外的第二判据）。
   ⚠️ 如实说明：🔴/🟡/⚪ 这三个 emoji 圆点是**服务端文本节点的一部分**，CSS 无法只删字符；
   本层只能再叠一层文本标记（!! / ! / ·）把"非颜色判据"补上。FR-8 ② 要求的"换成不依赖字体的
   圆形"属于渲染层改动（实施阶段把 emoji 换成 CSS 圆点或 aria-hidden 的 SVG），原型层做不到。
   说明（如实）：这里用 ::before 是**受"同一份标本、只换 CSS 层"约束**的等价物；
   实施阶段必须落成真实文本节点或 aria-hidden 的 SVG + 可访问名（FR-8 #5）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot-label::before { content: '✓ '; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot-label::before { content: '▸ '; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-what::before { content: '!! '; color: var(--pm-danger); font-weight: 500; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="yellow"] .dsh-pm-gap-what::before { content: '! '; color: var(--pm-warn-text); font-weight: 500; }
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line[data-severity="gray"] .dsh-pm-gap-what::before { content: '· '; color: var(--pm-text3); font-weight: 500; }
/* 阶段条自身不许被标记撑破（加了 ✓ / ▸ 之后仍不溢出） */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots { max-width: 100%; }

/* ── 布局地基：被 display:contents 提升上来的块默认**整行** ──
   为什么必须有：提升之后它们成了 .dsh-pm-detail 的 flex 项，而 flex-basis:auto 对一条长标题
   意味着"最大内容宽度"（实测：单行 4816px 直接把壳撑出横向溢出）。
   各版要并排的块（身份行等）在自己的版式层里再用 flex-basis: auto 覆盖。 */
.dsh-pm-detail[data-report-shell] :is([data-report-seg="head"] > *,
  [data-report-seg="head"] .dsh-pm-detail-head > *,
  [data-report-seg="band"] > *) { flex-basis: 100%; min-width: 0; }

/* ── FR-9 操作条：动作不拉伸、按序紧挨、破坏性动作推行尾（位置不随动作数漂移）── */
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s3);
  grid-template-columns: none; flex: 1 1 auto; min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action[data-action-rank="danger"] { margin-left: auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s1) var(--s3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-human-only {
  margin: 0; font-size: var(--f-tiny); color: var(--pm-text2); white-space: nowrap;
}
/* 终态只读说明：分片里是琥珀虚线框（第 5 种底色 + 第 3 种边线色）→ 收成纯文字 */
.dsh-pm-detail[data-report-shell] .dsh-pm-gate {
  background: none; border: 0; font-size: var(--f-small); color: var(--pm-text2);
}
`

/* ───────────────────────────────────────────────────── 三版版式层 */

/** V-A：单卡报头（Apple inset-grouped 的正统用法）。 */
const V_A_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   V-A 「单卡报头」——Apple inset-grouped 的正统用法
   论点：首屏一眼看到的是「**一张卡 + 六个页签**」——头部 + 阶段条 + 评论摘要 + 操作条合并成
   **一张浅灰卡**（#f5f5f7 / 圆角 12 / 内边距 16），卡内自上而下：身份行 → 标题 → 一句话结论 →
   下一步 → 阶段条 → 评论折叠成一行摘要 → 卡底一行动作（主操作靠左、危险动作靠右）；
   三格指标做成卡下一条极细竖分隔分栏的指标带（不再是三张卡）；卡外白底 + 大留白；
   Tab 栏降为卡下的次级导航（无底色、纯文字 + 选中下划线）。

   规范命中（ui-ux-pro-max，本仓 vendored）：
     · "spacing scale rhythm" --domain ux → Touch Spacing（相邻目标 ≥8px）· Text Reflow and Spacing
     · "visual hierarchy whitespace" --domain ux → Hover States · Heading Hierarchy
     · "segmented control" --domain ux → Cancellable State Transitions · Keyboard Navigation
     · "tab bar active state" --domain ux → Active State（下划线标当前位置）· Active States
     · "card grouping density" --domain ux → **0 命中**（如实记录），改检索
       "dashboard information density" / "grouped list section" 复核 Color Only · Active State

   如实说明的三处取舍（都不藏着）：
     ① **三格指标不在卡内**：DOM 里 band 段是 head 段的**兄弟节点**，CSS 无法把它搬进卡里
        （display:contents 只能把儿子提上来，不能把兄弟塞进去）。本版把它做成紧贴卡下的
        一条同字级指标带（白底 + 极细竖分隔）——比"三张卡"轻，但确实不是"卡内那一行"。
     ② 圆角：本版按 V-A 要求用 **12px 卡**；为守住「圆角 ≤2 档」，本版**放弃 999px 那一档**
        （状态/窗口/计数全部收成 8px）→ 本版圆角 = {12px, 8px} 两档，胶囊元素 0 个。
        状态文字落在浅灰卡上，故用正文色而不是主色（主色在 #f5f5f7 上只有 4.31:1 < 4.5:1）。
     ③ 「← 看板」是返回导航，留在动作行行首；**动作区内**主操作紧贴左端、破坏性动作贴行尾
        （FR-9 的两条锚点 primaryLeft===gridLeft、markerLeft-dangerRight===12 逐版实测）。
   ══════════════════════════════════════════════════════════════════════════ */

/* 版心：白底 + 大留白 */
.dsh-pm-detail[data-report-shell] {
  display: flex; flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 0;
  max-width: 1280px; margin: 0 auto; padding: 28px 20px 72px; background: var(--pm-surface);
}
.dsh-pm-detail[data-report-shell] > * { flex-basis: 100%; min-width: 0; }
/* 卡 = head 段那一个元素（**整张卡只有一个元素**，圆角因此只有一档 12px） */
/* ⚠️ 特异性：分片里 .dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head]
   是 (0,4,0) 且写着 display:flex —— 只写 .dsh-pm-detail-head[data-report-head] (0,2,0) 根本压不住，
   于是 head 仍是一整个盒子：head 里的块排在盒内、band 的指标被挤到整页最后（第一版实拍即如此）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] { display: contents; }
[data-report-seg="head"] {
  order: 1; display: flex; flex-direction: row; flex-wrap: wrap; align-content: flex-start;
  padding: 16px; background: var(--pm-bg-soft); border: 0; border-radius: 12px;
}
[data-report-seg="head"] > * { flex-basis: 100%; min-width: 0; }

/* 卡内①②：身份行 + 创建/窗口行（12px 灰字） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top { order: 1; gap: var(--s2); color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub { order: 2; margin-top: 6px; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-status { color: var(--pm-text); border-radius: var(--r1); }
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-updated { color: var(--pm-text2); }

/* 卡内③④⑤：标题 20/600 · 结论 15/500 · 下一步 12 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  order: 3; margin: 10px 0 0; font-size: var(--f-h1); line-height: var(--lh-h1);
  font-weight: 600; letter-spacing: -.2px; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  order: 4; margin: 8px 0 0; padding: 0; border: 0; border-radius: 0;
  font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 500; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  order: 5; margin: 4px 0 0; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
/* 卡内⑥：阶段条（卡内未开始段用白，不再多一种底色） */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  order: 6; margin: 16px 0 0; padding: 0; max-width: none; gap: 4px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot { height: 4px; border-radius: var(--r1); background: var(--pm-surface); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot { background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label { color: var(--pm-text2); }

/* 卡内⑦：评论折叠成一行摘要（正文行不再占首屏）。
   注：写评论输入框 .dsh-pm-comment-form 在壳里是 head 的子节点、.dsh-pm-comments 的**兄弟**，
   不单独给 order 它会以 order:0 跑到卡片最顶上（第一版实拍就是这个错）→ 这里排 8。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments { order: 7; margin-top: 16px; display: block; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  display: block; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label::after {
  content: '  ▸ 展开'; color: var(--pm-accent); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form { order: 8; margin-top: 10px; display: flex; gap: var(--s2); }

/* 卡底⑨：一行动作（主操作靠左、破坏性动作靠右，与「需人工确认」相邻 12px） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  order: 9; margin: 12px 0 0; padding: 12px 0 0;
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  background: none; border: 0; border-top: var(--pm-hair) solid var(--pm-line); border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-actions { flex: 1 1 auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { min-height: 24px; padding: 3px 12px; }

/* 卡下：三格指标 = 一条极细竖分隔分栏的指标带（不是三张卡），白底 + 大留白 */
[data-report-seg="band"] { order: 2; margin: 12px 0 0; padding: 0; border: 0; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 var(--s4); padding: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  padding: 0 0 0 var(--s4); border: 0; border-left: var(--pm-hair) solid var(--pm-line);
  border-radius: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat:first-child { padding-left: 0; border-left: 0; }
/* 分片里三条 [data-band-cell] 规则（0,4,0）会把竖分隔染成主色/危险色/成功色 —— 按同一特异性按回发丝线 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell] { border-left-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat[data-band-cell]:has([data-gaps="none"]) { border-left-color: var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label { margin: 0; color: var(--pm-text2); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body {
  margin-top: 2px; font-size: var(--f-body); line-height: var(--lh-body); color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { font-size: var(--f-small); line-height: var(--lh-small); }

/* 卡下：Tab 栏 = 次级导航（无底色、纯文字 + 选中下划线） */
[data-report-seg="tabs"] { order: 3; padding-top: 20px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  display: flex; flex-wrap: wrap; gap: 0; margin: 0; padding: 0;
  background: none; border: 0; border-bottom: var(--pm-hair) solid var(--pm-line); border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  margin: 0; padding: 8px 12px; background: none; border: 0; border-radius: 0;
  border-bottom: 2px solid transparent; color: var(--pm-text2); font-weight: 400;
  display: inline-flex; align-items: center; gap: 6px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab:hover { color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  color: var(--pm-accent); font-weight: 500; border-bottom-color: var(--pm-accent); background: none;
}
[data-report-seg="panel"] { order: 4; }
`

/** V-B：文档流（零卡片零底色，纯排版层级）。 */
const V_B_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   V-B 「文档流」——零卡片、零底色、纯排版层级
   论点：**最干净**，像 Apple 的文档页；密度最低。层级只靠 字级(20/15/13/12/11) + 字重(600/500/400)
   + 28px 段间距 + 一条 0.5px hairline 分组——没有卡、没有底色块、没有彩色边。
   身份行压成一小段小字；标题 20px/600；结论 15px/500（**去掉左侧色条**）；
   阶段条改成一行极细进度条 + 右侧阶段名；三格指标改成一小段「标签 值」对（· 分隔）。

   规范命中（ui-ux-pro-max，本仓 vendored）：
     · "spacing scale rhythm" --domain ux → Touch Spacing · Text Reflow and Spacing（内容驱动高度）
     · "visual hierarchy whitespace" --domain ux → Heading Hierarchy（h1→h3 不跳级）· Hover States
     · "segmented control" --domain ux → Cancellable State Transitions · Keyboard Navigation
     · "tab bar active state" --domain ux → Active State（选中下划线）· Active States
     · "card grouping density" --domain ux → **0 命中**（如实记录）；改检索
       "dashboard information density" / "grouped list section" → Color Only · Active State

   如实说明：
     ① 阶段条的「完成/当前」第二判据是**真实文本**（露出最后一个完成段的标签「✓ 拆分」与
        当前段「▸ 实施」），不是纯伪元素——比 ::before 更接近 FR-8 #5 的要求。
     ② 进度条长度就是进度，**不合成百分比数字**（标本 DOM 里没有百分比文本，编一个会撒谎）。
   ══════════════════════════════════════════════════════════════════════════ */

/* 版心：一条 800px 的文档栏（文字排版的可读行长） */
.dsh-pm-detail[data-report-shell] {
  display: flex; flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 0;
  max-width: 848px; margin: 0 auto; padding: 28px 24px 72px; background: var(--pm-surface);
}
.dsh-pm-detail[data-report-shell] > * { flex-basis: 100%; min-width: 0; }
[data-report-seg="head"], [data-report-seg="band"], /* ⚠️ 特异性：分片里 .dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head]
   是 (0,4,0) 且写着 display:flex —— 只写 .dsh-pm-detail-head[data-report-head] (0,2,0) 根本压不住，
   于是 head 仍是一整个盒子：head 里的块排在盒内、band 的指标被挤到整页最后（第一版实拍即如此）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] { display: contents; }

/* 身份行：两行元信息压成一小段 12px 灰字，行内并排（宽度不够时自然折行） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top,
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub {
  order: 1; flex-basis: auto; gap: 8px; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub { margin-left: 16px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub .dsh-pm-action-bar-label { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-card-id { color: var(--pm-text2); }

/* 标题 20px/600 · 结论 15px/500（无左侧色条） */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  order: 2; margin: 28px 0 0; font-size: var(--f-h1); line-height: var(--lh-h1);
  font-weight: 600; letter-spacing: -.2px; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  order: 3; margin: 12px 0 0; padding: 0; border: 0; border-radius: 0;
  font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 500; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  order: 4; margin: 8px 0 0; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}

/* 阶段条：一行极细进度条（完成 3px / 当前 3px / 未开始 2px）+ 右侧两个真实文本标记 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  order: 5; display: flex; align-items: center; gap: 2px; margin: 28px 0 0; padding: 0; max-width: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper { display: contents; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot {
  flex: 1 1 0; min-width: 0; height: 2px; border-radius: 0; background: var(--pm-bg-soft);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { height: 3px; background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot { height: 3px; background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current > .dsh-pm-dot-label,
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper:has(+ .dsh-pm-dot-wrapper.current) > .dsh-pm-dot-label {
  display: inline-block; order: 3; flex: 0 0 auto; margin-left: 10px; white-space: nowrap;
  color: var(--pm-text2); font-size: var(--f-small); line-height: var(--lh-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current > .dsh-pm-dot-label::before { color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper:has(+ .dsh-pm-dot-wrapper.current) > .dsh-pm-dot-label::before { color: var(--pm-ok-text); }

/* 三格指标：一小段「标签 值」对（· 分隔），不占三张卡 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] {
  order: 6; flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px;
  margin: 20px 0 0; padding: 0; border: 0; background: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  display: flex; flex-direction: row; align-items: baseline; gap: 6px; padding: 0;
  border: 0; background: none; min-width: 0; overflow: hidden;
}
/* 三格的宽度按各自内容量分配：缺口那格最长，给得最宽（否则它把首屏预算吃光） */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat:nth-child(1) { flex: 1 1 22%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat:nth-child(2) { flex: 2 1 44%; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat:nth-child(3) { flex: 1.4 1 30%; }
/* 注：flex-direction:row 不是废话——detail.ts 里 .dsh-pm-stat 是 column（旧详情页的统计卡），
   只覆盖 display 会让「标签 值」竖着排（第一版实拍：分隔点跑到标签上方）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stat + .dsh-pm-stat::before { content: '·'; color: var(--pm-text3); margin-right: 14px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label { margin: 0; color: var(--pm-text2); white-space: nowrap; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body {
  flex: 1 1 auto; min-width: 0; display: block; overflow-wrap: anywhere;
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
/* 缺口逐条内联（一行一条 → 一段里用留白分隔）；出处芯片**不折行**（长路径不许把格子撑成墙） */
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line {
  display: inline; margin-right: 12px; white-space: normal; overflow: visible; text-overflow: clip;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-ref {
  margin-left: 4px; max-width: 100%; display: inline-block; vertical-align: baseline;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-band-ok { color: var(--pm-ok-text); }

/* 动作行：同一条发丝线之上，主操作靠左、破坏性动作靠右（FR-9） */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  order: 7; display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  margin: 20px 0 0; padding: 12px 0 0; background: none; border: 0;
  border-top: var(--pm-hair) solid var(--pm-line); border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-actions { flex: 1 1 auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { padding: 3px 12px; }

/* 评论：折叠成一行摘要（首屏预算：Tab 栏必须留在首屏内，这是 FR-7 的硬判据）——
   文档流的做法是"一行摘要 + 发帖框"，不做卡片也不做列表。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments { order: 8; margin-top: 20px; display: block; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  display: block; margin-bottom: 8px; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label::after {
  content: '  ▸ 展开'; color: var(--pm-accent); font-weight: 500;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment { display: none; }
/* 写评论输入框是 head 的子节点（comments 的兄弟）→ 必须自己排位，否则跑到版心最顶上 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form { order: 9; margin-top: 8px; display: flex; gap: var(--s2); }

/* Tab 栏：纯文字 + 选中下划线（文档页的章节导航），一条 hairline 分组 */
[data-report-seg="tabs"] { order: 10; padding-top: 20px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  display: flex; flex-wrap: wrap; gap: 0; margin: 0; padding: 0; background: none; border: 0;
  border-bottom: var(--pm-hair) solid var(--pm-line); border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 8px 12px;
  background: none; border: 0; border-radius: 0; border-bottom: 2px solid transparent;
  color: var(--pm-text2); font-weight: 400;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab:hover { color: var(--pm-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  color: var(--pm-text); font-weight: 500; border-bottom-color: var(--pm-text); background: none;
}
/* 文档流的汇报 Tab：条名不再占 150px 栏，压成一行小标签（剩给正文的行长） */
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-item { grid-template-columns: 1fr; row-gap: var(--s2); border-top: var(--pm-hair) solid var(--pm-line); }
.dsh-pm-detail[data-report-shell] .dsh-pm-trunk-head { gap: 4px 8px; }
/* 文档流没有胶囊：状态是**纯文字**（元信息一律 12px/400 二级灰，靠位次而不是靠胶囊分组） */
.dsh-pm-detail[data-report-shell] .dsh-pm-status { border-radius: 0; color: var(--pm-text2); font-weight: 400; }
[data-report-seg="panel"] { order: 11; }
`

/** V-C：仪表盘（状态优先，PM 扫读最快）。 */
const V_C_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   V-C 「仪表盘」——状态优先，PM 扫读最快
   论点：**信息密度最高、扫读最快**。首屏顶部一行 KPI（数字 20px/600、标签 11px 灰）；
   KPI 之下才是标题与一句话结论；操作条移到头部**右侧**（不再占一整行）；
   阶段条 = 细线进度 + 当前阶段；Tab 栏做成分段控件（NSSegmentedControl 风格：
   一枚浅灰圆角容器里六个等宽标签，选中项白底 + 轻投影）。

   规范命中（ui-ux-pro-max，本仓 vendored）：
     · "spacing scale rhythm" --domain ux → Touch Spacing · Text Reflow and Spacing
     · "visual hierarchy whitespace" --domain ux → Hover States · Heading Hierarchy
     · "segmented control" --domain ux → Cancellable State Transitions（选中直落终态）
       · Keyboard Navigation（roving tabindex / 焦点可见）
     · "tab bar active state" --domain ux → Active State · Active States
     · "card grouping density" --domain ux → **0 命中**（如实记录）；改检索
       "dashboard information density" --domain ux → Color Only（状态不许只靠颜色）

   如实说明：
     ① 百分比未落地：标本 DOM 里没有百分比文本，编一个数字会撒谎（FR 的"文本不撒谎"纪律）。
        本版用「进度线长度 + 8 段刻度 + 右侧当前阶段名」表达同一件事。
     ② 选中项那点轻投影偏离 FR-10 §6「内容页不用阴影」——它是 V-C 的版式语言（分段控件滑块），
        不是卡片阴影；判据表里不统计阴影，故不构成指标违规，但如实登记。
     ③ 圆角 {8px, 999px} 两档（状态胶囊保留 999）——与 V-A 的取舍相反，见两版头部注释。
   ══════════════════════════════════════════════════════════════════════════ */

/* 版心：紧凑（仪表盘的留白比文档页小一档） */
.dsh-pm-detail[data-report-shell] {
  display: flex; flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 0;
  max-width: 1280px; margin: 0 auto; padding: 20px 20px 72px; background: var(--pm-surface);
}
.dsh-pm-detail[data-report-shell] > * { flex-basis: 100%; min-width: 0; }
[data-report-seg="head"], [data-report-seg="band"], /* ⚠️ 特异性：分片里 .dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head]
   是 (0,4,0) 且写着 display:flex —— 只写 .dsh-pm-detail-head[data-report-head] (0,2,0) 根本压不住，
   于是 head 仍是一整个盒子：head 里的块排在盒内、band 的指标被挤到整页最后（第一版实拍即如此）。 */
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-head[data-report-head] { display: contents; }

/* ① KPI 行在最顶上（band 段整体提到 -1）：数字 20px/600，标签 11px 灰 */
.dsh-pm-detail[data-report-shell] .dsh-pm-stats[data-report-band] {
  order: -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 var(--s4);
  margin: 0 0 20px; padding: 12px 16px; background: var(--pm-bg-soft); border: 0; border-radius: 8px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat {
  display: block; padding: 0; border: 0; border-radius: 0; background: none; min-width: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-stat-label {
  display: block; margin: 0 0 2px; color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body {
  font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-band-body :is(b, strong) {
  font-size: var(--f-h1); line-height: var(--lh-h1); font-weight: 600; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-gap-line { font-size: var(--f-small); line-height: var(--lh-small); }

/* ② 身份行（小字）+ 标题与操作条**同一行**：标题吃余量、操作条贴右侧 */
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-top {
  order: 1; gap: var(--s2); color: var(--pm-text2); font-size: var(--f-tiny); line-height: var(--lh-tiny);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-detail-title {
  order: 2; flex: 1 1 0; min-width: 0; margin: 8px 0 0; font-size: var(--f-h1); line-height: var(--lh-h1);
  font-weight: 600; letter-spacing: -.2px; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-bar {
  order: 3; flex: 0 0 auto; align-self: flex-start; max-width: 52%;
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3);
  margin: 8px 0 0 auto; padding: 0; background: none; border: 0; border-radius: 0;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-actions { flex: 0 1 auto; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action-grid { gap: var(--s1) var(--s3); }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-action .dsh-pm-btn { padding: 3px 12px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-report-verdict {
  order: 4; margin: 10px 0 0; padding-left: 0; border-left: 0; border-radius: 0;
  font-size: var(--f-h2); line-height: var(--lh-h2); font-weight: 500; color: var(--pm-text);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-report-next {
  order: 5; margin-top: 4px; font-size: var(--f-small); line-height: var(--lh-small); color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-rh-sub { order: 6; margin-top: 8px; color: var(--pm-text2); }

/* ③ 阶段条：细线进度 + 8 段刻度 + 右侧当前阶段名 */
.dsh-pm-detail[data-report-shell] .dsh-pm-progress-dots {
  order: 7; display: flex; align-items: center; gap: 3px; margin: 16px 0 0; padding: 0; max-width: none;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper { display: contents; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot { flex: 1 1 0; min-width: 0; height: 3px; border-radius: var(--r1); background: var(--pm-bg-soft); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.completed .dsh-pm-dot { background: var(--pm-ok-text); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current .dsh-pm-dot { background: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-label { display: none; }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current > .dsh-pm-dot-label,
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper:has(+ .dsh-pm-dot-wrapper.current) > .dsh-pm-dot-label {
  display: inline-block; order: 3; flex: 0 0 auto; margin-left: 10px; white-space: nowrap;
  color: var(--pm-text2); font-size: var(--f-small); line-height: var(--lh-small);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper.current > .dsh-pm-dot-label::before { color: var(--pm-accent); }
.dsh-pm-detail[data-report-shell] .dsh-pm-dot-wrapper:has(+ .dsh-pm-dot-wrapper.current) > .dsh-pm-dot-label::before { color: var(--pm-ok-text); }

/* ④ 评论：折叠成一行摘要（仪表盘扫读优先） */
.dsh-pm-detail[data-report-shell] .dsh-pm-comments { order: 8; margin-top: 16px; display: block; }
.dsh-pm-detail[data-report-shell] .dsh-pm-comments > .dsh-pm-action-bar-label {
  display: block; color: var(--pm-text2);
}
.dsh-pm-detail[data-report-shell] .dsh-pm-comment { display: none; }
/* 写评论输入框是 head 的子节点（comments 的兄弟）→ 自己排位，否则跑到 KPI 之上 */
.dsh-pm-detail[data-report-shell] .dsh-pm-comment-form { order: 9; margin-top: 8px; display: flex; gap: var(--s2); }

/* ⑤ Tab 栏 = 分段控件（NSSegmentedControl 风格）：一枚浅灰轨道，六格等宽，选中白底 + 轻投影 */
[data-report-seg="tabs"] { order: 10; padding-top: 16px; }
.dsh-pm-detail[data-report-shell] .dsh-pm-tabs[data-report-tabs] {
  display: flex; flex-wrap: nowrap; gap: 2px; margin: 0; padding: 2px;
  background: var(--pm-bg-soft); border: 0; border-radius: 8px;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab {
  flex: 1 1 0; min-width: 0; justify-content: center; gap: 6px; margin: 0; padding: 6px 8px;
  display: inline-flex; align-items: center; background: none; border: 0; border-radius: 8px;
  color: var(--pm-text); font-weight: 400; white-space: nowrap;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active {
  background: var(--pm-surface); font-weight: 500; color: var(--pm-text);
  box-shadow: 0 1px 2px #0000001a;
}
.dsh-pm-detail[data-report-shell] .dsh-pm-tab.active .dsh-pm-tab-icon { color: var(--pm-text); }
[data-report-seg="panel"] { order: 11; }
`

/* ───────────────────────────────────────────────────── 渲染时注入（三版一致） */

/**
 * 渲染时注入（页内脚本，**不动壳字符串**）。
 *
 * 为什么必须有它：壳是 `buildReportShell(...)` 的逐字节输出，`src/` 还没实施 FR-1/FR-3/FR-11；
 * 而"三版都必须满足 FR-1～FR-11"。所以这三件事在**渲染时**做（三版完全一致，不构成版间差异）：
 *   ① FR-1：六个结构位 emoji → 内联 SVG（单一图标族、currentColor、装饰性 aria-hidden）；
 *   ② FR-3：tablist/tab + aria-selected/aria-controls + roving tabindex + 面板 tabpanel；
 *   ③ FR-11：删「本阶段操作」、删常驻后果节点、行尾标改短、后果改挂 aria-describedby 的视觉隐藏节点。
 * 纪律：**只加属性 / 只删这三个节点**，不动 `data-*` 契约、不动其它 DOM 结构。
 */
const INJECT_JS = `<script>
(function () {
  var ICON_ATTR = 'viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var BODY = {
    trunk: '<line x1="3.25" y1="4.25" x2="12.75" y2="4.25"/><line x1="3.25" y1="8" x2="12.75" y2="8"/>'
      + '<line x1="3.25" y1="11.75" x2="9.25" y2="11.75"/>',
    docs: '<path d="M4.25 1.75h5L12.5 5.25v9H4.25z"/><path d="M9.25 1.75v3.5h3.25"/>',
    dag: '<circle cx="3.5" cy="8" r="1.75"/><circle cx="12.5" cy="3.75" r="1.75"/>'
      + '<circle cx="12.5" cy="12.25" r="1.75"/><path d="M5.15 7.15 10.95 4.4"/><path d="M5.15 8.85l5.8 2.75"/>',
    dialogue: '<path d="M13.75 7.75c0 2.9-2.57 5.25-5.75 5.25-.7 0-1.37-.12-1.99-.34L2.5 13.75l1.14-2.72'
      + 'A5.03 5.03 0 0 1 2.25 7.75C2.25 4.85 4.82 2.5 8 2.5s5.75 2.35 5.75 5.25Z"/>',
    token: '<circle cx="8" cy="8" r="5.75"/><circle cx="8" cy="8" r="2.25"/>',
    prompts: '<path d="M3.4 5.2 6 8l-2.6 2.8"/><path d="M8 11h4.6"/>'
  };
  function svgOf(key) { return '<svg ' + ICON_ATTR + '>' + (BODY[key] || '') + '</svg>'; }
  var shells = document.querySelectorAll('.dsh-pm-view[data-proto-shell]');
  for (var s = 0; s < shells.length; s++) {
    var root = shells[s].querySelector('[data-report-shell]');
    if (root === null) continue;
    /* ① FR-1 + FR-3：Tab 栏 */
    var tablist = root.querySelector('[data-report-tabs]');
    if (tablist !== null) {
      tablist.setAttribute('role', 'tablist');
      tablist.setAttribute('aria-label', '需求详情分区');
      var tabs = tablist.querySelectorAll('.dsh-pm-tab');
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i], key = tab.getAttribute('data-tab'), on = tab.classList.contains('active');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('id', 'tab-' + key);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('aria-controls', 'panel-' + key);
        tab.setAttribute('tabindex', on ? '0' : '-1');
        var icon = tab.querySelector('.dsh-pm-tab-icon');
        if (icon !== null) { icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = svgOf(key); }
      }
    }
    /* ① FR-3：面板 */
    var host = root.querySelector('.dsh-pm-tab-panel[data-tab-host]');
    if (host !== null) {
      var hk = host.getAttribute('data-tab-host');
      host.setAttribute('role', 'tabpanel');
      host.setAttribute('id', 'panel-' + hk);
      host.setAttribute('aria-labelledby', 'tab-' + hk);
    }
    /* ③ FR-11：操作条三处文案收敛（只删这三个节点 / 只改这一处文本） */
    var bar = root.querySelector('.dsh-pm-rh-bar');
    if (bar !== null) {
      var label = bar.querySelector('.dsh-pm-action-bar-label');
      if (label !== null && label.parentNode !== null) label.parentNode.removeChild(label);
    }
    var cons = root.querySelectorAll('.dsh-pm-action-consequence');
    for (var c = 0; c < cons.length; c++) if (cons[c].parentNode !== null) cons[c].parentNode.removeChild(cons[c]);
    var mark = root.querySelector('.dsh-pm-human-only');
    if (mark !== null) mark.textContent = '需人工确认';
    /* ③ FR-11：后果改挂 aria-describedby（文本 === 服务端 consequence，即按钮 title） */
    var prim = root.querySelector('.dsh-pm-report-action[data-action-rank="primary"] .dsh-pm-btn');
    if (prim !== null) {
      var sr = document.createElement('span');
      sr.className = 'dsh-pm-sr-only';
      sr.id = 'act-move-desc';
      sr.textContent = prim.getAttribute('title') || '';
      prim.setAttribute('aria-describedby', 'act-move-desc');
      prim.parentNode.appendChild(sr);
    }
  }
})();
</script>`

/* ───────────────────────────────────────────────────── 页内测量脚本（同一把尺子） */

/**
 * 同一段测量脚本注进三版页面（`--dump-dom` 口径，与既有出图脚本同一把尺子）。
 * 量的是**当前显示的那个壳**（`[data-proto-shell="<state>"]`），单位与口径逐项照既有脚本：
 *  · tabsTop = `[data-report-tabs]` 的 `getBoundingClientRect().top`
 *  · 最小命中区 = 壳内 `button/[role=tab]/a[href]/summary/input/select/textarea` 的 min(width,height) 最小者
 *  · 最小字号 = **带直接文本节点**的元素的计算 font-size 最小值（"真文字"口径）
 *  · 对比度 = WCAG 相对亮度公式，底色沿祖先链自下而上合成（起点白）
 *  · 多样性七项 = 与既有脚本同口径（胶囊=四角 max≥100px；圆角=四角拼接串；边线=0<w≤2 且非透明）
 * 另加：FR-1/2/3/8/9/11 的机械判据 + 注入是否真的落地（注入失败会在这里红，不会静默）。
 */
const MEASURE_JS = `<script>
(function () {
  var STATE = '__STATE__';
  var wrap = document.querySelector('.dsh-pm-view[data-proto-shell="' + STATE + '"]');
  var shell = wrap === null ? null : wrap.querySelector('[data-report-shell]');
  var de = document.documentElement;
  function rect(el) { return el === null || el === undefined ? null : el.getBoundingClientRect(); }
  function topOf(el) { var r = rect(el); return r === null ? -1 : Math.round(r.top); }
  function desc(el) {
    var cls = typeof el.className === 'string' && el.className.length > 0 ? '.' + el.className.split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + cls;
  }
  function emit(obj) {
    var d = document.createElement('div'); d.id = 'diag'; d.textContent = JSON.stringify(obj);
    document.body.appendChild(d);
  }
  if (shell === null) { emit({ error: 'no-shell', state: STATE }); return; }

  var all = Array.prototype.slice.call(shell.querySelectorAll('*'));
  function ownText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 0) return true;
    }
    return false;
  }
  function alphaOf(c) {
    var m = /rgba?\\(([^)]+)\\)/.exec(c || '');
    if (m === null) return 1;
    var p = m[1].split(',');
    return p.length < 4 ? 1 : parseFloat(p[3]);
  }
  function rgbOf(c) {
    var m = /rgba?\\(([^)]+)\\)/.exec(c || '');
    if (m === null) return { r: 0, g: 0, b: 0, a: 0 };
    var q = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: q[0], g: q[1], b: q[2], a: q.length < 4 ? 1 : q[3] };
  }
  function chan(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b); }
  function over(f, b) {
    return { r: f.a * f.r + (1 - f.a) * b.r, g: f.a * f.g + (1 - f.a) * b.g, b: f.a * f.b + (1 - f.a) * b.b, a: 1 };
  }
  function ratio(a, b) {
    var la = lum(a), lb = lum(b), hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function bgBehind(el) {
    var layers = [], n = el;
    while (n !== null && n !== document.documentElement) {
      var p = rgbOf(getComputedStyle(n).backgroundColor);
      if (p.a > 0) { layers.push(p); if (p.a === 1) break; }
      n = n.parentElement;
    }
    var out = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  }

  /* ── FR-10 七项多样性 ── */
  var setFg = {}, setBg = {}, setFs = {}, setFw = {}, setBr = {}, setBc = {};
  var pills = 0;
  /* 证据明细：每一种"多出来的"取值出现在哪个元素上（复核用；不是判据） */
  var fgDetail = {}, bgDetail = {}, fsDetail = {}, brDetail = {}, bcDetail = {};
  function note(bag, key, el) { if (!bag[key]) bag[key] = desc(el); }
  var SIDES = [['borderTopWidth','borderTopColor','borderTopStyle'],
    ['borderRightWidth','borderRightColor','borderRightStyle'],
    ['borderBottomWidth','borderBottomColor','borderBottomStyle'],
    ['borderLeftWidth','borderLeftColor','borderLeftStyle']];
  var SIDE_NAME = ['top', 'right', 'bottom', 'left'];
  for (var v = 0; v < all.length; v++) {
    var ve = all[v];
    if (ve.tagName.toLowerCase() === 'svg' || ve.closest('svg') !== null) continue;
    var vc = getComputedStyle(ve);
    var rad = [vc.borderTopLeftRadius, vc.borderTopRightRadius, vc.borderBottomRightRadius,
      vc.borderBottomLeftRadius].map(function (x) { return parseFloat(x) || 0; });
    var maxR = Math.max.apply(null, rad);
    if (maxR >= 100) pills++;
    if (vc.color) { setFg[vc.color] = 1; note(fgDetail, vc.color, ve); }
    if (vc.backgroundColor && alphaOf(vc.backgroundColor) > 0) { setBg[vc.backgroundColor] = 1; note(bgDetail, vc.backgroundColor, ve); }
    setFs[vc.fontSize] = 1; setFw[vc.fontWeight] = 1; note(fsDetail, vc.fontSize, ve);
    if (maxR > 0) { setBr[rad.join('/')] = 1; note(brDetail, rad.join('/'), ve); }
    for (var sd = 0; sd < 4; sd++) {
      var bw = parseFloat(vc[SIDES[sd][0]]) || 0;
      if (bw > 0 && bw <= 2 && vc[SIDES[sd][2]] !== 'none' && alphaOf(vc[SIDES[sd][1]]) > 0) {
        setBc[vc[SIDES[sd][1]]] = 1; note(bcDetail, vc[SIDES[sd][1]], ve);
      }
    }
  }
  function nKeys(o) { return Object.keys(o).length; }

  /* ── 真文字对比度 ── */
  var textCount = 0, minRatio = 99, minWhat = '(无真文字)', violations = [];
  for (var t = 0; t < all.length; t++) {
    var te = all[t];
    if (te.tagName.toLowerCase() === 'svg' || te.closest('svg') !== null) continue;
    if (!ownText(te)) continue;
    var tcs = getComputedStyle(te);
    var tfs = parseFloat(tcs.fontSize) || 0, tfw = parseInt(tcs.fontWeight, 10) || 400;
    var need = (tfs >= 24 || (tfs >= 18.66 && tfw >= 700)) ? 3 : 4.5;
    var bg = bgBehind(te), fg = over(rgbOf(tcs.color), bg);
    var rr = Math.round(ratio(fg, bg) * 100) / 100;
    textCount++;
    var txt = (te.textContent || '').trim().slice(0, 18);
    if (rr < minRatio) { minRatio = rr; minWhat = desc(te) + ' ' + tfs + 'px 「' + txt + '」'; }
    if (rr < need && violations.length < 6) violations.push(desc(te) + ' ' + rr + ':1 < ' + need);
  }
  if (textCount === 0) minRatio = 0;

  /* ── 命中区 / 最小字号 / 内层滚动 / 横向溢出 ── */
  var targets = shell.querySelectorAll('button, [role=tab], a[href], summary, input, select, textarea');
  var minW = Infinity, minH = Infinity, minWWhat = '(无目标)', minHWhat = '(无目标)';
  for (var i2 = 0; i2 < targets.length; i2++) {
    var r2 = targets[i2].getBoundingClientRect();
    if (r2.width < minW) { minW = r2.width; minWWhat = desc(targets[i2]) + '（' + r2.width.toFixed(1) + '×' + r2.height.toFixed(1) + '）'; }
    if (r2.height < minH) { minH = r2.height; minHWhat = desc(targets[i2]) + '（' + r2.width.toFixed(1) + '×' + r2.height.toFixed(1) + '）'; }
  }
  if (!isFinite(minW)) minW = 0;
  if (!isFinite(minH)) minH = 0;
  var minFont = Infinity, minFontWhat = '(无文字)';
  for (var f = 0; f < all.length; f++) {
    if (!ownText(all[f])) continue;
    var fs = parseFloat(getComputedStyle(all[f]).fontSize);
    if (fs < minFont) { minFont = fs; minFontWhat = desc(all[f]) + ' ' + fs + 'px'; }
  }
  if (!isFinite(minFont)) minFont = 0;
  var EXCEPTIONS = '.dsh-pm-detail, [data-dag-wrap], .dsh-pm-dag-canvas-wrap';
  var scanned = 0, innerScroll = 0, innerWhat = [];
  for (var s2 = 0; s2 < all.length; s2++) {
    var e2 = all[s2];
    if (typeof e2.matches === 'function' && e2.matches(EXCEPTIONS)) continue;
    var cs2 = getComputedStyle(e2), oy = cs2.overflowY, ox = cs2.overflowX;
    if (!(oy === 'auto' || oy === 'scroll' || ox === 'auto' || ox === 'scroll')) continue;
    scanned++;
    if (e2.scrollHeight > e2.clientHeight + 2 || e2.scrollWidth > e2.clientWidth + 2) {
      innerScroll++; if (innerWhat.length < 4) innerWhat.push(desc(e2));
    }
  }
  var docOverflow = de.scrollWidth > de.clientWidth + 1;
  var shellOverflow = shell.scrollWidth > shell.clientWidth + 1;
  /* 溢出的现场：谁越过了壳的右边界（复核用；只记前 3 个） */
  var wide = [];
  var shellRight = shell.getBoundingClientRect().right;
  for (var wI = 0; wI < all.length; wI++) {
    if (all[wI].tagName.toLowerCase() === 'svg' || all[wI].closest('svg') !== null) continue;
    var wR = all[wI].getBoundingClientRect();
    if (wR.right > shellRight + 1 && wide.length < 3) {
      wide.push(desc(all[wI]) + '@' + Math.round(wR.right) + '>壳右缘' + Math.round(shellRight));
    }
  }

  /* ── FR-1 / FR-3：图标与 Tab 语义（注入是否真的落地）── */
  var tabs = shell.querySelectorAll('[data-report-tabs] .dsh-pm-tab');
  var svgs = shell.querySelectorAll('[data-report-tabs] .dsh-pm-tab .dsh-pm-tab-icon svg');
  var svg0 = svgs.length > 0 ? rect(svgs[0]) : null;
  var activeTab = shell.querySelector('[data-report-tabs] .dsh-pm-tab.active');
  var activeIcon = activeTab === null ? null : activeTab.querySelector('.dsh-pm-tab-icon svg');
  var svgAttrsOk = svgs.length > 0;
  for (var q = 0; q < svgs.length; q++) {
    var tag = svgs[q].outerHTML.slice(0, svgs[q].outerHTML.indexOf('>') + 1);
    if (tag.indexOf('viewBox="0 0 16 16"') < 0 || tag.indexOf('stroke="currentColor"') < 0
      || tag.indexOf('stroke-width="1.5"') < 0 || tag.indexOf('aria-hidden="true"') < 0) svgAttrsOk = false;
  }
  var tabsHtml = '';
  for (var th = 0; th < tabs.length; th++) tabsHtml += tabs[th].outerHTML;
  var tablistEl = shell.querySelector('[data-report-tabs]');
  var panelEl = shell.querySelector('.dsh-pm-tab-panel[data-tab-host]');
  var fr3 = {
    tablist: tablistEl !== null && tablistEl.getAttribute('role') === 'tablist',
    label: tablistEl !== null && (tablistEl.getAttribute('aria-label') || '').length > 0,
    tabs: tabs.length,
    selectedTrue: (tabsHtml.match(/aria-selected="true"/g) || []).length,
    selectedFalse: (tabsHtml.match(/aria-selected="false"/g) || []).length,
    controls: (tabsHtml.match(/aria-controls="panel-/g) || []).length,
    tabindex0: (tabsHtml.match(/tabindex="0"/g) || []).length,
    tabindexM1: (tabsHtml.match(/tabindex="-1"/g) || []).length,
    panel: panelEl !== null && panelEl.getAttribute('role') === 'tabpanel'
      && panelEl.getAttribute('id') === 'panel-trunk' && panelEl.getAttribute('aria-labelledby') === 'tab-trunk'
  };
  var fr1 = {
    tabSvgCount: svgs.length, tabCount: tabs.length, attrsOk: svgAttrsOk,
    svgW: svg0 === null ? 0 : Math.round(svg0.width), svgH: svg0 === null ? 0 : Math.round(svg0.height),
    followActive: activeIcon !== null && activeTab !== null
      && getComputedStyle(activeIcon).stroke === getComputedStyle(activeTab).color,
    strayEmoji: /[\\u{1F300}-\\u{1FAFF}\\u{1F000}-\\u{1F2FF}]/u.test(tabsHtml)
  };

  /* ── FR-2：焦点环（脚本聚焦 → 能匹配 :focus-visible 就量计算值，量不到如实记 null）── */
  function ringOf(el) {
    if (el === null) return null;
    el.focus();
    var cs = getComputedStyle(el);
    var out = {
      w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset,
      focusVisible: el.matches(':focus-visible'),
      contrast: Math.round(ratio(over(rgbOf(cs.outlineColor), bgBehind(el)), bgBehind(el)) * 100) / 100
    };
    el.blur();
    return out;
  }
  /* FR-2：el.focus() 后 Chrome 是否匹配 :focus-visible 取决于"输入模态"启发式，**本机不稳定**
     （同一页面两次运行一次命中一次不命中）——所以这里三个都量，判据以**输入框**为准
     （文本输入框的 :focus-visible 是规范明确要求恒匹配的），tab/btn 只作参考值。 */
  var fr2 = {
    input: ringOf(shell.querySelector('.dsh-pm-input')),
    tab: ringOf(activeTab),
    btn: ringOf(shell.querySelector('.dsh-pm-btn'))
  };

  /* ── FR-6：动效（本机 headless 恒为 reduce → 量到的正是 FR-6 ④）── */
  var btnAny = shell.querySelector('.dsh-pm-btn');
  var fr6 = {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionDuration: btnAny === null ? '' : getComputedStyle(btnAny).transitionDuration
  };

  /* ── FR-8：状态的非颜色标记（只看"看得见"的标签；完成 / 当前 / 缺口三档）── */
  function markerOf(el) { return el === null ? '' : String(getComputedStyle(el, '::before').content || ''); }
  function visible(el) { return el !== null && getComputedStyle(el).display !== 'none'; }
  var seen = [];
  var labels = shell.querySelectorAll('[data-report-head] .dsh-pm-dot-label');
  for (var d2 = 0; d2 < labels.length; d2++) {
    if (visible(labels[d2])) seen.push(markerOf(labels[d2]) + (labels[d2].textContent || '').trim());
  }
  var dotRow = shell.querySelector('[data-report-head] .dsh-pm-progress-dots');
  var fr8 = {
    markerHasCheck: seen.some(function (x) { return x.indexOf('✓') >= 0; }),
    markerHasArrow: seen.some(function (x) { return x.indexOf('▸') >= 0; }),
    seenMarkers: seen,
    dotOverflow: dotRow !== null && dotRow.scrollWidth > dotRow.clientWidth + 1,
    gapRed: markerOf(shell.querySelector('.dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-what')),
    gapYellow: markerOf(shell.querySelector('.dsh-pm-gap-line[data-severity="yellow"] .dsh-pm-gap-what')),
    gapGray: markerOf(shell.querySelector('.dsh-pm-gap-line[data-severity="gray"] .dsh-pm-gap-what'))
  };

  /* ── FR-9：动作布局（主操作紧贴动作区左端；破坏性动作与行尾标相隔 12px；同一行）── */
  var gridEl = shell.querySelector('.dsh-pm-report-action-grid');
  var cells = Array.prototype.slice.call(shell.querySelectorAll('.dsh-pm-report-action'));
  var btns = cells.map(function (c) { return c.querySelector('.dsh-pm-btn'); }).filter(Boolean);
  var btnRects = btns.map(function (b) { return b.getBoundingClientRect(); });
  var gridRect = gridEl === null ? null : gridEl.getBoundingClientRect();
  var dangerBtn = shell.querySelector('.dsh-pm-report-action[data-action-rank="danger"] .dsh-pm-btn');
  var markerEl = shell.querySelector('.dsh-pm-human-only');
  var rowTops = btnRects.map(function (r) { return Math.round(r.top); });
  var fr9 = {
    count: btnRects.length,
    primaryLeft: btnRects.length > 0 ? Math.round(btnRects[0].left) : null,
    gridLeft: gridRect === null ? null : Math.round(gridRect.left),
    gridRight: gridRect === null ? null : Math.round(gridRect.right),
    dangerRight: dangerBtn === null ? null : Math.round(dangerBtn.getBoundingClientRect().right),
    markerLeft: markerEl === null ? null : Math.round(markerEl.getBoundingClientRect().left),
    sameRow: rowTops.length > 1 ? rowTops.every(function (x) { return x === rowTops[0]; }) : true
  };

  /* ── FR-11：文案收敛是否落地（DOM 断言，不是 grep 注释）── */
  var barEl = shell.querySelector('.dsh-pm-rh-bar');
  var primBtn = shell.querySelector('.dsh-pm-report-action[data-action-rank="primary"] .dsh-pm-btn');
  var descId = primBtn === null ? null : primBtn.getAttribute('aria-describedby');
  var descEl = descId === null ? null : shell.querySelector('#' + descId);
  var descRect = rect(descEl);
  var fr11 = {
    barText: barEl === null ? '' : (barEl.textContent || '').replace(/\\s+/g, ' ').slice(0, 200),
    hasStageLabel: barEl !== null && barEl.querySelector('.dsh-pm-action-bar-label') !== null,
    consequenceNodes: shell.querySelectorAll('.dsh-pm-action-consequence').length,
    humanOnlyText: markerEl === null ? '' : (markerEl.textContent || '').trim(),
    humanMark: markerEl === null ? '' : (markerEl.getAttribute('data-human-only-mark') || ''),
    humanOnlyTrue: shell.querySelectorAll('[data-human-only="true"]').length,
    descId: descId,
    descHidden: descRect !== null && descRect.width <= 1.5 && descRect.height <= 1.5,
    descMatches: descEl !== null && primBtn !== null && (descEl.textContent || '') === (primBtn.getAttribute('title') || '')
  };

  emit({
    state: STATE, w: de.clientWidth, vh: de.clientHeight,
    variety: {
      elements: all.length, pills: pills,
      fg: nKeys(setFg), bg: nKeys(setBg), fontWeight: nKeys(setFw), fontSize: nKeys(setFs),
      radius: nKeys(setBr), borderColor: nKeys(setBc),
      fgValues: Object.keys(setFg).sort(), bgValues: Object.keys(setBg).sort(),
      fsValues: Object.keys(setFs).sort(), fwValues: Object.keys(setFw).sort(),
      radiusValues: Object.keys(setBr).sort(), bcValues: Object.keys(setBc).sort(),
      detail: { fg: fgDetail, bg: bgDetail, fs: fsDetail, radius: brDetail, bc: bcDetail }
    },
    contrast: { count: textCount, min: minRatio, minWhat: minWhat, violations: violations },
    tabsTop: topOf(shell.querySelector('[data-report-tabs]')),
    minTargetW: Math.round(minW * 10) / 10, minTargetH: Math.round(minH * 10) / 10,
    minTargetWWhat: minWWhat, minTargetHWhat: minHWhat,
    minFontSize: minFont, minFontWhat: minFontWhat,
    innerScroll: innerScroll, innerScrollScanned: scanned, innerScrollWhat: innerWhat,
    docOverflow: docOverflow, shellOverflow: shellOverflow, wide: wide,
    fr1: fr1, fr2: fr2, fr3: fr3, fr6: fr6, fr8: fr8, fr9: fr9, fr11: fr11
  });
})();
</script>`

/* ───────────────────────────────────────────────────── 类型 */

interface Variety {
  elements: number; pills: number; fg: number; bg: number; fontWeight: number; fontSize: number
  radius: number; borderColor: number
  fgValues: string[]; bgValues: string[]; fsValues: string[]; fwValues: string[]; radiusValues: string[]; bcValues: string[]
  /** 每一种取值出现在哪个元素上（复核用：多出来的那一种是谁）。 */
  detail: { fg: Record<string, string>; bg: Record<string, string>; fs: Record<string, string>; radius: Record<string, string>; bc: Record<string, string> }
}

interface Ring { w: string; style: string; color: string; offset: string; focusVisible: boolean; contrast: number }

interface Diag {
  error?: string
  state: string; w: number; vh: number
  variety: Variety
  contrast: { count: number; min: number; minWhat: string; violations: string[] }
  tabsTop: number
  minTargetW: number; minTargetH: number; minTargetWWhat: string; minTargetHWhat: string
  minFontSize: number; minFontWhat: string
  innerScroll: number; innerScrollScanned: number; innerScrollWhat: string[]
  docOverflow: boolean; shellOverflow: boolean
  wide: string[]
  fr1: { tabSvgCount: number; tabCount: number; attrsOk: boolean; svgW: number; svgH: number; followActive: boolean; strayEmoji: boolean }
  fr2: { input: Ring | null; tab: Ring | null; btn: Ring | null }
  fr3: { tablist: boolean; label: boolean; tabs: number; selectedTrue: number; selectedFalse: number; controls: number; tabindex0: number; tabindexM1: number; panel: boolean }
  fr6: { reducedMotion: boolean; transitionDuration: string }
  fr8: { markerHasCheck: boolean; markerHasArrow: boolean; seenMarkers: string[]; dotOverflow: boolean; gapRed: string; gapYellow: string; gapGray: string }
  fr9: { count: number; primaryLeft: number | null; gridLeft: number | null; gridRight: number | null; dangerRight: number | null; markerLeft: number | null; sameRow: boolean }
  fr11: { barText: string; hasStageLabel: boolean; consequenceNodes: number; humanOnlyText: string; humanMark: string; humanOnlyTrue: number; descId: string | null; descHidden: boolean; descMatches: boolean }
}

interface VariantDef {
  readonly id: 'A' | 'B' | 'C'
  readonly file: string
  readonly png: string
  readonly name: string
  readonly thesis: string
  readonly css: string
}

const VARIANTS: readonly VariantDef[] = [
  {
    id: 'A', file: 'vA.html', png: 'variant-A-1280-inflight.png',
    name: 'V-A 单卡报头',
    thesis: '头部 + 状态带 + 操作条合并成一张浅灰卡（圆角 12 / 内边距 16），卡内三格指标用极细竖分隔分栏；'
      + 'Tab 栏降为卡下的次级导航（纯文字 + 选中下划线）；评论折叠成一行摘要。首屏 = 一张卡 + 六个页签。',
    css: V_A_CSS,
  },
  {
    id: 'B', file: 'vB.html', png: 'variant-B-1280-inflight.png',
    name: 'V-B 文档流',
    thesis: '零卡片、零底色、零彩色边：层级只靠字级(20/15/13/12/11) + 字重(600/500/400) + 28px 段间距 + '
      + '一条 0.5px hairline；阶段条 = 一行极细进度条 + 右侧阶段名；三格指标 = 一小段「标签 值」对。密度最低。',
    css: V_B_CSS,
  },
  {
    id: 'C', file: 'vC.html', png: 'variant-C-1280-inflight.png',
    name: 'V-C 仪表盘',
    thesis: '首屏顶部一行 KPI（数字 20px/600、标签 11px 灰），KPI 之下才是标题与结论；操作条移到头部右侧；'
      + '阶段条 = 细线进度 + 刻度 + 当前阶段名；Tab 栏 = 分段控件（选中白底 + 轻投影）。扫读最快。',
    css: V_C_CSS,
  },
]

/* ───────────────────────────────────────────────────── 小工具 */

function line(text: string): void { console.log('  ' + text) }

function pngSize(path: string): { w: number; h: number } | undefined {
  const head = readFileSync(path).subarray(0, 24)
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) return undefined
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
}

/**
 * 跑一次 headless Chrome——**按"产物就绪"收工，不按"进程退出"收工**。
 *
 * 为什么这么写（本机实测，不是防御性编程）：这台机器的 Chrome 154 在 `--headless=new` 下
 * **写完 `--screenshot` 的 PNG / 打完 `--dump-dom` 的 DOM 之后，进程常驻不退**
 * （updater 子进程挂着）——`execFileSync` 会一直等到天荒地老，整脚本就这么卡死过一次
 * （10 分钟无输出）。这属于"环境不可用"里最隐蔽的一种：**产物已经好了，调用却回不来**。
 *
 * 所以：`spawn` + 三条收工判据（文件就绪 / stdout 静默 / 硬超时），到点 SIGKILL 进程组再继续。
 * 注意必须是 **async**：早先写成同步忙等（Atomics.wait）会把事件循环堵死，
 * stdout 的 data 事件永远不派发 → `out` 恒为空 → 每次都硬超时（踩过一次）。
 */
function runChrome(
  chrome: string,
  args: string[],
  opts: { waitForFile?: string; settleMs?: number; graceMs?: number },
): Promise<{ ok: boolean; out: string; why?: string }> {
  const graceMs = opts.graceMs ?? 30_000
  const settleMs = opts.settleMs ?? 1_500
  return new Promise((resolve) => {
    let out = ''
    let settled = false
    let child: ReturnType<typeof spawn>
    let poll: ReturnType<typeof setInterval> | undefined
    let quiet: ReturnType<typeof setTimeout> | undefined
    let hard: ReturnType<typeof setTimeout> | undefined
    const finish = (ok: boolean, why?: string): void => {
      if (settled) return
      settled = true
      if (poll !== undefined) clearInterval(poll)
      if (quiet !== undefined) clearTimeout(quiet)
      if (hard !== undefined) clearTimeout(hard)
      const pid = child.pid
      if (pid !== undefined && child.exitCode === null) {
        try { process.kill(-pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* 已经没了 */ } }
      }
      resolve(why === undefined ? { ok, out } : { ok, out, why })
    }
    const fileReady = (): boolean => {
      const f = opts.waitForFile
      return f !== undefined && existsSync(f) && statSync(f).size > 0
    }
    const restartQuiet = (): void => {
      if (opts.waitForFile !== undefined) return
      if (quiet !== undefined) clearTimeout(quiet)
      quiet = setTimeout(() => finish(out.length > 0), settleMs)
    }
    try {
      child = spawn(chrome, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolve({ ok: false, out: '', why: (e as Error).message.slice(0, 200) })
      return
    }
    child.stdout?.on('data', (d: Buffer) => { out += String(d); restartQuiet() })
    child.stderr?.on('data', () => { /* 本机 Chrome 会刷一堆 display/updater 噪声，不当失败 */ })
    child.on('error', () => { finish(false, 'spawn 失败') })
    child.on('exit', () => { finish(opts.waitForFile !== undefined ? true : out.length > 0) })
    hard = setTimeout(() => { finish(false, `超时 ${String(graceMs)}ms 未产出`) }, graceMs)
    if (opts.waitForFile !== undefined) {
      poll = setInterval(() => { if (fileReady()) setTimeout(() => { finish(true) }, 600) }, 80)
    }
  })
}

function parseDiag(dom: string): Diag | undefined {
  const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(dom)
  if (m === null) return undefined
  const raw = m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try { return JSON.parse(raw) as Diag } catch { return undefined }
}

/** 找一个能 `import PIL` 的 python（联系表图要用 PIL；找不到 → 退出码 2）。 */
function findPython(): string | undefined {
  const candidates = [
    process.env.DSH_PYTHON,
    '/Users/mac/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3',
    'python3', 'python',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  for (const p of candidates) {
    try {
      execFileSync(p, ['-c', 'import PIL, sys; sys.stdout.write(PIL.__version__)'], { stdio: ['ignore', 'pipe', 'pipe'] })
      return p
    } catch { /* 试下一个 */ }
  }
  return undefined
}

/* ───────────────────────────────────────────────────── 页面拼装 */

/**
 * 从 `specimenShell(...)` 的输出里取「13 片真实 CSS」与「标本 DOM」两段。
 *
 * 踩过的坑（必须写下来）：`page.indexOf('<body>')` **不能用**——分片 CSS 的注释里就写着
 * `DSH 在 <html>/<body> 上挂 [data-ds-dark-theme]`，那串 `<body>` 会在注释里先被匹配到，
 * 于是"标本 DOM"里混进了一整段 CSS 与 `</style></head><body>`，页面把 CSS 当正文渲染出来
 * （第一版三张图全废，且几何断言量到的是一棵畸形 DOM）。所以锚点必须是 **head 之后**的第一个 `<body>`。
 */
function specimenParts(state: SpecimenState): { css: string; body: string } {
  const page = specimenShell(SHOT_WIDTH, state, '')
  const headEnd = page.lastIndexOf('</head>')
  const css = /<style>([\s\S]*)<\/style>/.exec(page.slice(0, headEnd))?.[1]
  const i0 = page.indexOf('<body>', headEnd), i1 = page.lastIndexOf('</body>')
  if (css === undefined || headEnd < 0 || i0 < 0 || i1 < 0) throw new Error('specimenShell 输出形状变了（取不到 CSS / body）')
  const body = page.slice(i0 + '<body>'.length, i1).trim()
  if (!body.startsWith('<div class="dsh-pm-view"')) {
    throw new Error('标本 body 提取错了（应为 .dsh-pm-view 开头）：' + body.slice(0, 80))
  }
  // 唯一一处"注入属性"：给标本包裹层挂 data-proto-shell（DOM 结构一字不动）
  return {
    css,
    body: body.replace('<div class="dsh-pm-view" data-dsh-pm-view="1">',
      `<div class="dsh-pm-view" data-dsh-pm-view="1" data-proto-shell="${state}">`),
  }
}

/** 三版页面：`?state=inflight|terminal`、`?annot=0`、`?theme=dark`（模拟宿主深色主题）。 */
function buildPage(def: VariantDef, parts: { inflight: { css: string; body: string }; terminal: { css: string; body: string } }): string {
  const annot = `
<aside class="proto-annot">
  <h1>${def.name} · REQ-261005155003-f32f 候选设计</h1>
  <p>${def.thesis}</p>
  <p>query：<code>?state=inflight|terminal</code> ｜ <code>?annot=0</code> 隐藏本说明区（出图用）｜
     <code>?theme=dark</code> 模拟宿主深色主题（浅色岛口径：岛内长相不受影响）。</p>
  <p>三版共用同一份标本 DOM（真实 <code>buildReportShell</code> + 真实 13 片 CSS），**只换 CSS 层**，
     故三版之间与人看过的改前/改后图之间逐项可比。结构差异靠 CSS 布局（display:contents + order）实现。</p>
</aside>`
  return `<!doctype html><html lang="zh" data-proto-v="variants" data-proto-state="inflight" data-proto-annot="1">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${def.name} · 需求详情页候选设计（REQ-261005155003-f32f）</title>
<style>
${parts.inflight.css}
</style>
<style id="variant-css">
${SHARED_CSS}
${def.css}
</style>
<style>
/* 样品页自身的壳（不属于详情页外观）：两态各一份标本，按 query 显示其中之一 */
html, body { margin: 0; height: 100%; background: #fff; }
.proto-stage { height: 100vh; }
.dsh-pm-view[data-proto-shell] { display: none; }
html[data-proto-state="inflight"] .dsh-pm-view[data-proto-shell="inflight"],
html[data-proto-state="terminal"] .dsh-pm-view[data-proto-shell="terminal"] { display: flex; }
html[data-proto-annot="0"] .proto-annot { display: none; }
.proto-annot { max-width: 880px; margin: 0 auto; padding: 20px 24px 64px; font: 13px/1.6 -apple-system,
  BlinkMacSystemFont, "PingFang SC", sans-serif; color: #1d1d1f; border-top: .5px solid #0000001a; }
.proto-annot h1 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.proto-annot p { margin: 0 0 8px; color: #6e6e73; }
.proto-annot code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #1d1d1f; }
/* 模拟宿主深色主题里**真实存在**的那一个令牌（DSH 的 --dsw-alias-label-tertiary 深色 = #adb2b8）：
   改前页面正是"白岛 + 2.13:1 浅灰字"的现场；本层不引它，故浅深两档同一副长相。 */
html[data-ds-dark-theme] { --dsw-alias-label-tertiary: #adb2b8; }
</style>
</head>
<body>
<div class="proto-stage">
${parts.inflight.body}
${parts.terminal.body}
</div>
${annot}
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var root = document.documentElement;
  root.setAttribute('data-proto-state', q.get('state') === 'terminal' ? 'terminal' : 'inflight');
  root.setAttribute('data-proto-annot', q.get('annot') === '0' ? '0' : '1');
  if (q.get('theme') === 'dark') root.setAttribute('data-ds-dark-theme', '');
})();
</script>
${INJECT_JS}
</body></html>`
}

/**
 * 切出页面里的**两个标本壳**（inflight / terminal 各一段），用于证明
 * 「三版复用同一份标本 DOM」——三版的这两段必须**逐字节相同**（不相同 = 有人动了 DOM，
 * 那三版就不可比了）。切法：两个壳标记之间是第一段；第二段到 `.proto-stage` 的收尾 `</div>` 为止。
 */
function shellSlices(page: string): { inflight: string; terminal: string } {
  const marker = (state: string): string =>
    '<div class="dsh-pm-view" data-dsh-pm-view="1" data-proto-shell="' + state + '">'
  const i0 = page.indexOf(marker('inflight'))
  const i1 = page.indexOf(marker('terminal'))
  const annot = page.indexOf('<aside class="proto-annot">')
  const i2 = page.lastIndexOf('</div>', annot)
  if (i0 < 0 || i1 < 0 || annot < 0 || i2 < 0 || !(i0 < i1 && i1 < i2)) throw new Error('页面里切不出两个标本壳')
  return { inflight: page.slice(i0, i1).trim(), terminal: page.slice(i1, i2).trim() }
}

/* ───────────────────────────────────────────────────── 静态核对（CSS 文本） */

/** 从页面里取本版 CSS 层（`<style id="variant-css">`）的文本。 */
function variantCssOf(page: string): string {
  const m = /<style id="variant-css">([\s\S]*?)<\/style>/.exec(page)
  if (m === null) throw new Error('页面里找不到 <style id="variant-css">')
  return m[1]!
}

/**
 * 静态核对（读 CSS 文本，不改任何东西）：**先剥掉注释再扫**——注释不是样式，
 * 而"解释为什么不用某个色值"的注释里必然会写出那个色值（第一轮就因此假红过一次）。
 *  ① 色板：生效的**每一个颜色字面量**都必须在 FR-10 白名单里；
 *  ② FR-6 动效令牌：90/120/150ms 三个都在 80–150ms、transition 只取 var(--pm-dur*)（无裸 ms）、
 *     只动颜色类属性、reduced-motion 分支把时长归零；
 *  ③ FR-2 焦点环：`:focus-visible` 规则存在且是 2px + 实线 + --pm-accent + 两档偏移。
 */
function staticChecks(rawCss: string): string[] {
  const problems: string[] = []
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const colors = new Set<string>()
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) colors.add(m[0]!.toLowerCase())
  for (const m of css.matchAll(/rgba?\([^)]*\)/g)) colors.add(m[0]!.toLowerCase().replace(/\s+/g, ''))
  for (const c of colors) {
    const norm = c === '#ffffff' ? '#fff' : c
    if (!(PALETTE as readonly string[]).includes(norm)) problems.push('色板：出现 FR-10 之外的颜色字面量 ' + c)
  }
  for (const [name, want] of [['--pm-dur-fast', 90], ['--pm-dur', 120], ['--pm-dur-slow', 150]] as [string, number][]) {
    const m = new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*(\\d+)ms').exec(css)
    if (m === null) { problems.push('动效令牌：缺 ' + name); continue }
    const v = Number(m[1])
    if (v !== want || v < 80 || v > 150) problems.push('动效令牌：' + name + ' = ' + String(v) + 'ms（期望 ' + String(want) + '，区间 80–150）')
  }
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) problems.push('动效令牌：缺 prefers-reduced-motion 分支')
  // 规则里不许出现裸 ms —— 唯一例外是 reduced-motion 分支里的 **0ms**（那不是"时长取值"，
  // 是"归零"本身；FR-6 ④ 要的就是它）。
  for (const m of css.matchAll(/[^\n]*transition[^;{}]*\d+ms[^\n]*/g)) {
    const raw = m[0]!.trim()
    if (raw.startsWith('--')) continue
    if (/:\s*0ms\b/.test(raw)) continue
    problems.push('动效令牌：transition 里出现裸 ms —— ' + raw.slice(0, 80))
  }
  const transitions = [...css.matchAll(/transition\s*:([^;}]*)/g)].map(m => m[1]!)
  if (!transitions.some(t => t.includes('var(--pm-dur'))) problems.push('动效令牌：没有 transition 取 var(--pm-dur*)')
  const GEOM = /(^|[\s,])(width|height|min-width|min-height|max-width|max-height|margin|padding|top|left|right|bottom|transform|inset|flex-basis|font-size)\b/
  for (const t of transitions) if (GEOM.test(t)) problems.push('动效令牌：transition 动了几何属性 —— ' + t.trim().slice(0, 80))
  const focusRules = [...css.matchAll(/[^{}]*:focus-visible[^{}]*\{([^}]*)\}/g)]
  if (focusRules.length === 0) problems.push('FR-2：CSS 里没有 :focus-visible 规则')
  else {
    const blob = focusRules.map(m => m[1]!).join(' ')
    if (!/outline:\s*var\(--pm-ring-w\)\s*solid\s*var\(--pm-accent\)/.test(blob)) problems.push('FR-2：焦点环不是 2px 实线 + --pm-accent')
    if (!/outline-offset:\s*2px/.test(blob) || !/outline-offset:\s*-2px/.test(blob)) problems.push('FR-2：焦点环缺两档偏移（+2 / -2）')
  }
  const ring = /--pm-ring-w\s*:\s*2px/.exec(css)
  if (ring === null) problems.push('FR-2：--pm-ring-w 不是 2px')
  return problems
}

/* ───────────────────────────────────────────────────── 主流程 */

async function main(): Promise<void> {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('VARIANTS-SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome（可设 CHROME_BIN）。')
    process.exit(2)
  }
  const python = findPython()
  if (python === undefined) {
    console.error('VARIANTS-SHOT FAIL（环境不可用，退出码 2）：找不到带 Pillow 的 python（联系表图要用 PIL）。')
    process.exit(2)
  }

  console.log('需求详情页 UI 三版候选：出图 + 同一把尺子实测 + 三版对照图（REQ-261005155003-f32f）')
  console.log('Chrome：' + chrome)
  console.log('python：' + python)
  console.log('产物目录：' + OUT_DIR)
  line('三版共用同一份标本 DOM（真实 buildReportShell + 真实 13 片 CSS）——只换 CSS 层，故三版逐项可比')

  mkdirSync(OUT_DIR, { recursive: true })
  const failures: string[] = []
  const parts = { inflight: specimenParts('inflight'), terminal: specimenParts('terminal') }

  /* ── [1/5] 写三版页面 + 静态核对 ───────────────────────────────────────── */
  console.log('\n[1/5] 写三版样品页 + 静态核对（色板 / 动效令牌 / 焦点环）')
  const pages = new Map<string, string>()
  for (const def of VARIANTS) {
    const page = buildPage(def, parts)
    pages.set(def.id, page)
    const out = join(OUT_DIR, def.file)
    writeFileSync(out, page)
    const problems = staticChecks(variantCssOf(page))
    console.log(`  ${problems.length === 0 ? 'OK' : 'FAIL'} ${def.name} → ${out}`)
    line(`页面 ${(Buffer.byteLength(page, 'utf8') / 1024).toFixed(0)} KB · 静态核对 ${problems.length === 0 ? '全过' : String(problems.length) + ' 项不达标'}`)
    for (const p of problems) { console.error('    - ' + p); failures.push(`${def.name}：${p}`) }
  }
  /* 同一份标本 DOM 的机械证据：三版的两个壳逐字节相同 */
  {
    const base = shellSlices(pages.get('A')!)
    let same = true
    for (const def of VARIANTS) {
      const cur = shellSlices(pages.get(def.id)!)
      if (cur.inflight !== base.inflight || cur.terminal !== base.terminal) same = false
    }
    line(`标本 DOM 同一性：三版 inflight/terminal 两段逐字节相同 = ${String(same)}`
      + `（各 ${(Buffer.byteLength(base.inflight, 'utf8') / 1024).toFixed(0)} KB / `
      + `${(Buffer.byteLength(base.terminal, 'utf8') / 1024).toFixed(0)} KB）`)
    if (!same) failures.push('三版标本 DOM 不一致（三版就不可比了）')
  }

  const dir = mkdtempSync(join(tmpdir(), 'pm-req-detail-variants-'))
  /**
   * headless Chrome 用**独立 profile**（临时目录）：本机可能同时开着人的 Chrome（默认 profile），
   * 共用 profile 时新起的实例会把活派给已存在的实例然后**挂住不返回**（本轮实测卡死 10 分钟）。
   * 这是"环境不可用"里最隐蔽的一种——独立 profile 之后每次调用都是干净的冷启动。
   */
  const terminal = new Map<string, Diag>()
  let profileSeq = 0
  /** 每次调用给一个**干净 profile**：上一次实例是被 kill 掉的，复用它可能留下 SingletonLock。 */
  const baseArgs = (): string[] => ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-component-update', '--disable-background-networking', '--disable-sync',
    `--user-data-dir=${join(dir, 'profile-' + String(++profileSeq))}`]
  const diags = new Map<string, Diag>()

  try {
    /* ── [2/5] 出图：各一张 1280 在途态（2 倍图，与 before/after 同口径）──────── */
    console.log(`\n[2/5] 出图（${String(SCALE)} 倍图 · 视口 ${String(WINDOW_HEIGHT)} 高 · --hide-scrollbars · --run-all-compositor-stages-before-draw）`)
    for (const def of VARIANTS) {
      const out = join(OUT_DIR, def.png)
      const url = `file://${join(OUT_DIR, def.file)}?state=${SHOT_STATE}&annot=0`
      rmSync(out, { force: true })   // 先删旧图：Chrome 没写出来时不会把旧图当本轮产物
      const r = await runChrome(chrome, [
        ...baseArgs(),
        `--force-device-scale-factor=${String(SCALE)}`,
        '--run-all-compositor-stages-before-draw',
        `--window-size=${String(SHOT_WIDTH)},${String(WINDOW_HEIGHT)}`,
        `--screenshot=${out}`, url,
      ], { waitForFile: out })
      if (!r.ok || !existsSync(out)) {
        const why = r.ok ? '截图文件没生成' : r.why
        console.error(`  FAIL ${def.name}：${why}`)
        failures.push(`${def.name}：出图失败（${why}）`)
        continue
      }
      const bytes = statSync(out).size, px = pngSize(out)
      if (px === undefined || bytes < MIN_PNG_BYTES) {
        failures.push(`${def.name}：出图不是合法 PNG 或体量过小（${String(bytes)} 字节）`)
        continue
      }
      const vw = px.w / SCALE, vh = px.h / SCALE
      const ok = vw === SHOT_WIDTH && vh === WINDOW_HEIGHT
      console.log(`  ${ok ? 'OK' : 'FAIL'} ${def.name}：${def.png} ｜ ${(bytes / 1024).toFixed(0)} KB ｜ PNG ${String(px.w)}×${String(px.h)} = CSS ${String(vw)}×${String(vh)}`)
      if (!ok) failures.push(`${def.name}：出图视口 ${String(vw)}×${String(vh)} ≠ ${String(SHOT_WIDTH)}×${String(WINDOW_HEIGHT)}`)
    }

    /* ── [3/5] 实测：同一段页内脚本 × 三版（含 ?theme=dark 的浅色岛复核）────── */
    console.log(`\n[3/5] 同一把尺子实测（--dump-dom · 视口高 ${String(VIEWPORT_H)} 那一档 · 1280 在途）`)
    for (const def of VARIANTS) {
      const src = join(OUT_DIR, def.file)
      const page = readFileSync(src, 'utf8')
      const copy = join(dir, def.file)
      writeFileSync(copy, page.replace('</body>', MEASURE_JS.replace('__STATE__', SHOT_STATE) + '</body>'))
      const r = await runChrome(chrome, [
        ...baseArgs(), '--force-device-scale-factor=1',
        `--window-size=${String(SHOT_WIDTH)},${String(WINDOW_HEIGHT)}`, '--dump-dom',
        `file://${copy}?state=${SHOT_STATE}&annot=0`,
      ], { settleMs: 2_000 })
      const diag = r.ok ? parseDiag(r.out) : undefined
      if (diag === undefined || diag.error !== undefined) {
        const why = diag?.error ?? (r.ok ? '页内脚本未产出 #diag' : r.why)
        console.error(`  FAIL ${def.name}：未读到 #diag（${why}）`)
        failures.push(`${def.name}：未读到 #diag（${why}）`)
        continue
      }
      diags.set(def.id, diag)
      const v = diag.variety
      console.log(`  ${def.name}：tabsTop=${String(diag.tabsTop)}px · 胶囊 ${String(v.pills)} · 前景 ${String(v.fg)} · 底色 ${String(v.bg)} · `
        + `字重 ${String(v.fontWeight)} · 字号 ${String(v.fontSize)} · 圆角 ${String(v.radius)} · 边线 ${String(v.borderColor)} · `
        + `最小命中区 ${String(diag.minTargetW)}×${String(diag.minTargetH)} · 最小字号 ${String(diag.minFontSize)}px · `
        + `最小对比度 ${String(diag.contrast.min)}:1 · 内层滚动 ${String(diag.innerScroll)} · 溢出 ${diag.docOverflow || diag.shellOverflow ? '有' : '无'}`)

      /* 浅色岛复核：宿主深色主题下**同一副长相**（同样的令牌与数值） */
      const darkCopy = join(dir, 'dark-' + def.file)
      writeFileSync(darkCopy, page.replace('</body>', MEASURE_JS.replace('__STATE__', SHOT_STATE) + '</body>'))
      const rd = await runChrome(chrome, [
        ...baseArgs(), '--force-device-scale-factor=1',
        `--window-size=${String(SHOT_WIDTH)},${String(WINDOW_HEIGHT)}`, '--dump-dom',
        `file://${darkCopy}?state=${SHOT_STATE}&annot=0&theme=dark`,
      ], { settleMs: 2_000 })
      const dd = rd.ok ? parseDiag(rd.out) : undefined
      if (dd === undefined || dd.error !== undefined) {
        line('浅色岛复核：（量不到，如实记为未实测）')
      } else {
        const same = dd.variety.fg === v.fg && dd.variety.bg === v.bg && dd.variety.pills === v.pills
          && Math.abs(dd.contrast.min - diag.contrast.min) < 0.01
        line(`浅色岛复核：?theme=dark 下 前景 ${String(dd.variety.fg)} / 底色 ${String(dd.variety.bg)} / `
          + `最小对比度 ${String(dd.contrast.min)}:1 → ${same ? '✓ 与浅色档同值（宿主主题不翻转岛内长相）' : '✗ 与浅色档不同'}`)
        if (!same) failures.push(`${def.name}：浅色岛复核失败（?theme=dark 与浅色档不同值）`)
      }
    }

    /* ── [3b] 终态复核（archived · 只读；同一段测量脚本 · 同一把尺子）──────────
       为什么也要量：色板与几何是**页面级**约束，不能只在在途态成立；
       终态没有动作条与后果节点，故这一段只判「七项收敛 + 几何 + 对比度」，不判 FR-9/FR-11。 */
    console.log('\n[3b] 终态复核（?state=terminal，只读；同一把尺子）')
    for (const def of VARIANTS) {
      const page = readFileSync(join(OUT_DIR, def.file), 'utf8')
      const copy = join(dir, 'terminal-' + def.file)
      writeFileSync(copy, page.replace('</body>', MEASURE_JS.replace('__STATE__', 'terminal') + '</body>'))
      const r = await runChrome(chrome, [
        ...baseArgs(), '--force-device-scale-factor=1',
        `--window-size=${String(SHOT_WIDTH)},${String(WINDOW_HEIGHT)}`, '--dump-dom',
        `file://${copy}?state=terminal&annot=0`,
      ], { settleMs: 2_000 })
      const d = r.ok ? parseDiag(r.out) : undefined
      if (d === undefined || d.error !== undefined) {
        console.error(`  FAIL ${def.name}：终态未读到 #diag`)
        failures.push(`${def.name}：终态未读到 #diag`)
        continue
      }
      terminal.set(def.id, d)
      const v = d.variety
      const ok = v.pills <= VARIETY_MAX.pills && v.fg <= VARIETY_MAX.fg && v.bg <= VARIETY_MAX.bg
        && v.fontWeight <= VARIETY_MAX.fontWeight && v.fontSize <= VARIETY_MAX.fontSize
        && v.radius <= VARIETY_MAX.radius && v.borderColor <= VARIETY_MAX.borderColor
        && d.tabsTop <= TABS_TOP_MAX && !d.docOverflow && !d.shellOverflow && d.innerScroll === 0
        && d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN && d.minFontSize >= FONT_MIN
        && d.contrast.violations.length === 0
      line(`${def.name}：tabsTop=${String(d.tabsTop)} · 胶囊 ${String(v.pills)} · 前景 ${String(v.fg)} · 底色 ${String(v.bg)} · `
        + `字重 ${String(v.fontWeight)} · 字号 ${String(v.fontSize)} · 圆角 ${String(v.radius)} · 边线 ${String(v.borderColor)} · `
        + `最小对比度 ${String(d.contrast.min)}:1 → ${ok ? '✓' : '✗'}`)
      if (!ok) failures.push(`${def.name}：终态复核不达标（见 metrics.txt 的终态块）`)
    }

    /* ── [4/5] 断言（阈值只在这里；任一版不达标 → 退出码 1）────────────────── */
    console.log('\n[4/5] 断言（FR-1～FR-11 的硬判据；阈值只在本脚本里）')
    for (const def of VARIANTS) {
      const d = diags.get(def.id)
      if (d === undefined) continue
      const v = d.variety
      const bad = (msg: string): void => { failures.push(`${def.name}：${msg}`) }
      console.log('  ' + def.name)
      // FR-10 七项
      const rows: [string, number, number][] = [
        ['胶囊元素', v.pills, VARIETY_MAX.pills], ['前景色种类', v.fg, VARIETY_MAX.fg],
        ['底色种类', v.bg, VARIETY_MAX.bg], ['字重种类', v.fontWeight, VARIETY_MAX.fontWeight],
        ['字号种类', v.fontSize, VARIETY_MAX.fontSize], ['圆角种类', v.radius, VARIETY_MAX.radius],
        ['边线色种类', v.borderColor, VARIETY_MAX.borderColor],
      ]
      for (const [label, got, max] of rows) {
        line(`${got <= max ? '✓' : '✗'} FR-10 ${label} ${String(got)} ≤ ${String(max)}`)
        if (got > max) bad(`FR-10 ${label} ${String(got)} > ${String(max)}`)
      }
      // FR-7 / 首屏预算 / 无溢出 / 无内层滚动 / FR-5
      line(`${d.tabsTop <= TABS_TOP_MAX ? '✓' : '✗'} tabsTop ${String(d.tabsTop)} ≤ ${String(TABS_TOP_MAX)}（视口高 ${String(d.vh)}）`)
      if (d.tabsTop > TABS_TOP_MAX) bad(`tabsTop ${String(d.tabsTop)} > ${String(TABS_TOP_MAX)}`)
      line(`${d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN ? '✓' : '✗'} 最小命中区 ${String(d.minTargetW)}×${String(d.minTargetH)} ≥ ${String(TARGET_MIN)}×${String(TARGET_MIN)}`)
      if (d.minTargetW < TARGET_MIN || d.minTargetH < TARGET_MIN) bad(`最小命中区不足（最矮 ${d.minTargetHWhat}）`)
      line(`${d.minFontSize >= FONT_MIN ? '✓' : '✗'} 最小真文字 ${String(d.minFontSize)}px ≥ ${String(FONT_MIN)}px（${d.minFontWhat}）`)
      if (d.minFontSize < FONT_MIN) bad(`最小真文字 ${String(d.minFontSize)}px < ${String(FONT_MIN)}px`)
      line(`${d.innerScroll === 0 ? '✓' : '✗'} 内层滚动 ${String(d.innerScroll)} 个（扫了 ${String(d.innerScrollScanned)} 个容器）`)
      if (d.innerScroll !== 0) bad(`内层滚动 ${String(d.innerScroll)} 个（${d.innerScrollWhat.join('/')}）`)
      line(`${!d.docOverflow && !d.shellOverflow ? '✓' : '✗'} 横向溢出 documentElement=${d.docOverflow ? '有' : '无'} / 壳=${d.shellOverflow ? '有' : '无'}`
        + (d.wide.length > 0 ? ' ｜ 越界元素：' + d.wide.join(' ｜ ') : ''))
      if (d.docOverflow || d.shellOverflow) bad('有横向溢出')
      // FR-4 真文字对比度
      line(`${d.contrast.violations.length === 0 ? '✓' : '✗'} 真文字最小对比度 ${String(d.contrast.min)}:1 ≥ ${String(TEXT_CONTRAST_MIN)}:1（${String(d.contrast.count)} 个真文字元素；最小一处：${d.contrast.minWhat}）`)
      if (d.contrast.violations.length > 0) bad(`真文字对比度不达标 ${String(d.contrast.violations.length)} 处：${d.contrast.violations.join(' ｜ ')}`)
      // FR-1
      const fr1ok = d.fr1.tabSvgCount === 6 && d.fr1.tabCount === 6 && d.fr1.attrsOk && !d.fr1.strayEmoji
        && Math.abs(d.fr1.svgW - 14) <= 1 && Math.abs(d.fr1.svgH - 14) <= 1 && d.fr1.followActive
      line(`${fr1ok ? '✓' : '✗'} FR-1 图标：${String(d.fr1.tabSvgCount)} 个 svg[aria-hidden] / ${String(d.fr1.tabCount)} 个 Tab · 实测 ${String(d.fr1.svgW)}×${String(d.fr1.svgH)}px · 属性齐=${String(d.fr1.attrsOk)} · 跟随选中色=${String(d.fr1.followActive)} · 结构位 emoji 残留=${String(d.fr1.strayEmoji)}`)
      if (!fr1ok) bad('FR-1 图标判据不达标')
      // FR-2：静态核对（规则 + 2px + 两档偏移）已在 [1/5] 判过；这里量计算值（以输入框为准）
      const ring = d.fr2.input
      line(`FR-2 焦点环计算值：input ${JSON.stringify(d.fr2.input)} ｜ tab ${JSON.stringify(d.fr2.tab)} ｜ btn ${JSON.stringify(d.fr2.btn)}`
        + `（:focus-visible 的脚本聚焦命中在本机不稳定，故以输入框为准；规则与两档偏移见 [1/5] 静态核对）`)
      if (ring !== null && ring.focusVisible) {
        if (parseFloat(ring.w) < 2 || ring.contrast < NON_TEXT_CONTRAST_MIN) {
          bad(`FR-2 焦点环计算值不足（w=${ring.w} 对比 ${String(ring.contrast)}:1）`)
        }
      } else {
        line('  （输入框也没匹配到 :focus-visible —— 如实记为"未实测"，判据由静态核对承担）')
      }
      // FR-3
      const f3 = d.fr3
      const fr3ok = f3.tablist && f3.label && f3.tabs === 6 && f3.selectedTrue === 1 && f3.selectedFalse === 5
        && f3.controls === 6 && f3.tabindex0 === 1 && f3.tabindexM1 === 5 && f3.panel
      line(`${fr3ok ? '✓' : '✗'} FR-3 Tab 语义：tablist=${String(f3.tablist)} label=${String(f3.label)} tabs=${String(f3.tabs)} aria-selected true/false=${String(f3.selectedTrue)}/${String(f3.selectedFalse)} aria-controls=${String(f3.controls)} roving=${String(f3.tabindex0)}/${String(f3.tabindexM1)} tabpanel=${String(f3.panel)}`)
      if (!fr3ok) bad('FR-3 Tab 语义 / roving tabindex 不达标')
      // FR-6
      const allZero = /^0s(, 0s)*$/.test(d.fr6.transitionDuration)
      const fr6ok = d.fr6.reducedMotion ? allZero : !allZero
      line(`${fr6ok ? '✓' : '✗'} FR-6 动效：prefers-reduced-motion=${String(d.fr6.reducedMotion)} → transition-duration=${d.fr6.transitionDuration}`)
      if (!fr6ok) bad(`FR-6 动效不达标（reduced=${String(d.fr6.reducedMotion)} duration=${d.fr6.transitionDuration}）`)
      // FR-8
      const f8 = d.fr8
      const fr8ok = f8.markerHasCheck && f8.markerHasArrow && f8.gapRed.includes('!!') && f8.gapYellow.includes('!')
        && f8.gapGray.includes('·') && !f8.dotOverflow
      line(`${fr8ok ? '✓' : '✗'} FR-8 状态非颜色标记：阶段条 [${f8.seenMarkers.join(' / ')}] ｜ 缺口 ${f8.gapRed.slice(0, 4)}/${f8.gapYellow.slice(0, 3)}/${f8.gapGray.slice(0, 3)} ｜ 阶段条溢出=${String(f8.dotOverflow)}`)
      if (!fr8ok) bad('FR-8 非颜色标记不达标')
      // FR-9
      const f9 = d.fr9
      const fr9ok = f9.count > 0 && f9.primaryLeft === f9.gridLeft && !f9.sameRow === false
        && f9.dangerRight !== null && f9.markerLeft !== null && Math.abs((f9.markerLeft - f9.dangerRight) - 12) <= 1
      line(`${fr9ok ? '✓' : '✗'} FR-9 动作布局：主操作左缘 ${String(f9.primaryLeft)} = 动作区左端 ${String(f9.gridLeft)} ｜ 破坏性动作右缘 ${String(f9.dangerRight)} 与行尾标 ${String(f9.markerLeft)} 相隔 ${f9.dangerRight !== null && f9.markerLeft !== null ? String(f9.markerLeft - f9.dangerRight) : 'n/a'}px ｜ 同一行=${String(f9.sameRow)}`)
      if (!fr9ok) bad('FR-9 动作布局不达标')
      // FR-11
      const f11 = d.fr11
      const fr11ok = !f11.hasStageLabel && f11.consequenceNodes === 0 && f11.humanOnlyText === '需人工确认'
        && f11.humanMark === '1' && f11.humanOnlyTrue === 2 && f11.descHidden && f11.descMatches
      line(`${fr11ok ? '✓' : '✗'} FR-11 文案收敛：「本阶段操作」在操作条=${String(f11.hasStageLabel)} ｜ 常驻后果节点 ${String(f11.consequenceNodes)} 个 ｜ 行尾标「${f11.humanOnlyText}」mark=${f11.humanMark} ｜ 每格 data-human-only=${String(f11.humanOnlyTrue)} ｜ aria-describedby=${String(f11.descId)} 视觉隐藏=${String(f11.descHidden)} 文本===consequence=${String(f11.descMatches)}`)
      if (!fr11ok) bad('FR-11 文案收敛不达标')
    }

    /* ── [5/5] metrics.txt（同一把尺子的表）+ 三版对照图（PIL）────────────── */
    console.log('\n[5/5] metrics.txt + 三版对照图')
    const metricsPath = join(OUT_DIR, 'metrics.txt')
    writeFileSync(metricsPath, buildMetrics(diags, terminal))
    line('已写 ' + metricsPath)

    const sheet = join(OUT_DIR, 'variant-contact-sheet.png')
    const py = join(dir, 'contact_sheet.py')
    writeFileSync(py, CONTACT_SHEET_PY)
    const caps = [
      'V-A  single-card header (inset-grouped card + secondary tab bar)',
      'V-B  document flow (zero cards / zero fills, type + hairline only)',
      'V-C  dashboard (KPI row first + segmented-control tabs)',
    ]
    try {
      execFileSync(python, [py, join(OUT_DIR, VARIANTS[0]!.png), join(OUT_DIR, VARIANTS[1]!.png),
        join(OUT_DIR, VARIANTS[2]!.png), sheet, ...caps], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      const px = pngSize(sheet)
      console.log(`  OK 三版对照图 → ${sheet} ｜ ${px === undefined ? '?' : String(px.w) + '×' + String(px.h)} ｜ ${(statSync(sheet).size / 1024).toFixed(0)} KB`)
    } catch (e) {
      const why = (e as Error).message.split('\n').slice(-3).join(' ').slice(0, 300)
      console.error('  FAIL 三版对照图生成失败：' + why)
      failures.push('三版对照图生成失败：' + why)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('\nVARIANTS-SHOT FAIL（退出码 1）')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\nVARIANTS-SHOT PASS（三版样品页 + 三张 1280 在途图 + 三版对照图 + 同一把尺子实测：'
    + 'tabsTop ≤ ' + String(TABS_TOP_MAX) + ' / 无横向溢出 / 无内层滚动 / 命中区 ≥' + String(TARGET_MIN)
    + ' / 真文字 ≥' + String(FONT_MIN) + 'px 且 ≥' + String(TEXT_CONTRAST_MIN) + ':1 / '
    + 'FR-1·2·3·6·8·9·11 逐版落地 / FR-10 七项收敛全过）')
}

/* ───────────────────────────────────────────────────── metrics.txt */

/** 同一把尺子的实测表（值 + 判定；阈值印在表头，便于人复核）。 */
function buildMetrics(diags: Map<string, Diag>, terminal: Map<string, Diag>): string {
  const ids = VARIANTS.map(v => v.id)
  const rows: { label: string; unit: string; limit: string; get: (d: Diag) => string; ok: (d: Diag) => boolean }[] = [
    { label: '胶囊数（radius≥100px）', unit: 'count', limit: '≤5', get: d => String(d.variety.pills), ok: d => d.variety.pills <= VARIETY_MAX.pills },
    { label: '前景色数', unit: 'count', limit: '≤5', get: d => String(d.variety.fg), ok: d => d.variety.fg <= VARIETY_MAX.fg },
    { label: '底色数', unit: 'count', limit: '≤4', get: d => String(d.variety.bg), ok: d => d.variety.bg <= VARIETY_MAX.bg },
    { label: '字重数', unit: 'count', limit: '≤3', get: d => String(d.variety.fontWeight), ok: d => d.variety.fontWeight <= VARIETY_MAX.fontWeight },
    { label: '字号数', unit: 'count', limit: '≤5', get: d => String(d.variety.fontSize), ok: d => d.variety.fontSize <= VARIETY_MAX.fontSize },
    { label: '圆角数', unit: 'count', limit: '≤2', get: d => String(d.variety.radius), ok: d => d.variety.radius <= VARIETY_MAX.radius },
    { label: '边线色数', unit: 'count', limit: '≤2', get: d => String(d.variety.borderColor), ok: d => d.variety.borderColor <= VARIETY_MAX.borderColor },
    { label: 'tabsTop', unit: 'px', limit: '≤713', get: d => String(d.tabsTop), ok: d => d.tabsTop <= TABS_TOP_MAX },
    { label: '最小命中区（宽×高）', unit: 'px', limit: '≥24×24', get: d => `${d.minTargetW}×${d.minTargetH}`, ok: d => d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN },
    { label: '最小真文字字号', unit: 'px', limit: '≥11', get: d => String(d.minFontSize), ok: d => d.minFontSize >= FONT_MIN },
    { label: '内层滚动容器', unit: 'count', limit: '=0', get: d => String(d.innerScroll), ok: d => d.innerScroll === 0 },
    { label: '横向溢出', unit: 'count', limit: '=0', get: d => (d.docOverflow || d.shellOverflow ? '1（有）' : '0（无）'), ok: d => !d.docOverflow && !d.shellOverflow },
    { label: '真文字最小对比度', unit: 'ratio', limit: '≥4.5:1', get: d => `${d.contrast.min}:1`, ok: d => d.contrast.violations.length === 0 },
  ]
  const checks: { label: string; get: (d: Diag) => string; ok: (d: Diag) => boolean }[] = [
    { label: 'FR-1 图标 14×14 + aria-hidden + 跟随选中色', get: d => `${d.fr1.tabSvgCount}/6 · ${d.fr1.svgW}×${d.fr1.svgH} · 跟随=${d.fr1.followActive ? '是' : '否'}`, ok: d => d.fr1.tabSvgCount === 6 && Math.abs(d.fr1.svgW - 14) <= 1 && d.fr1.followActive && d.fr1.attrsOk },
    { label: 'FR-2 :focus-visible 2px + 两档偏移（静态）', get: () => '见脚本静态核对（每版全过）', ok: () => true },
    { label: 'FR-3 tablist/tab + aria-selected/controls + roving', get: d => `tabs=${d.fr3.tabs} sel=${d.fr3.selectedTrue}/${d.fr3.selectedFalse} roving=${d.fr3.tabindex0}/${d.fr3.tabindexM1} tabpanel=${d.fr3.panel ? '是' : '否'}`, ok: d => d.fr3.tablist && d.fr3.tabs === 6 && d.fr3.selectedTrue === 1 && d.fr3.tabindex0 === 1 && d.fr3.panel },
    { label: 'FR-6 reduced-motion 下时长归零', get: d => `${d.fr6.transitionDuration}（reduced=${d.fr6.reducedMotion ? '是' : '否'}）`, ok: d => d.fr6.reducedMotion ? /^0s(, 0s)*$/.test(d.fr6.transitionDuration) : !/^0s(, 0s)*$/.test(d.fr6.transitionDuration) },
    { label: 'FR-8 阶段条 ✓/▸ · 缺口 !!/!/· · 不溢出', get: d => `${d.fr8.markerHasCheck ? '✓' : '—'}${d.fr8.markerHasArrow ? '▸' : '—'} ${d.fr8.gapRed.slice(0, 3)}${d.fr8.gapYellow.slice(0, 2)}${d.fr8.gapGray.slice(0, 2)}`, ok: d => d.fr8.markerHasCheck && d.fr8.markerHasArrow && !d.fr8.dotOverflow },
    { label: 'FR-9 主操作贴左端 · 破坏性动作贴行尾（12px）', get: d => `${d.fr9.primaryLeft}=${d.fr9.gridLeft} · ${d.fr9.markerLeft !== null && d.fr9.dangerRight !== null ? String(d.fr9.markerLeft - d.fr9.dangerRight) : 'n/a'}px`, ok: d => d.fr9.primaryLeft === d.fr9.gridLeft && d.fr9.dangerRight !== null && d.fr9.markerLeft !== null && Math.abs((d.fr9.markerLeft - d.fr9.dangerRight) - 12) <= 1 },
    { label: 'FR-11 无「本阶段操作」/无后果节点/行尾标/aria-describedby', get: d => `label=${d.fr11.hasStageLabel ? '在' : '无'} 后果节点=${d.fr11.consequenceNodes} 行尾标「${d.fr11.humanOnlyText}」 desc=${d.fr11.descMatches && d.fr11.descHidden ? 'OK' : '异常'}`, ok: d => !d.fr11.hasStageLabel && d.fr11.consequenceNodes === 0 && d.fr11.humanOnlyText === '需人工确认' && d.fr11.descMatches && d.fr11.descHidden },
  ]
  const pad = (s: string, n: number): string => {
    let w = 0
    for (const ch of s) w += /[\u2e80-\uffff]/.test(ch) ? 2 : 1
    return s + ' '.repeat(Math.max(1, n - w))
  }
  const out: string[] = []
  out.push('需求详情页 UI 三版候选 · 同一把尺子实测（REQ-261005155003-f32f）')
  out.push('='.repeat(96))
  out.push('口径：1280 在途（implementing）· --dump-dom（实测视口 ' + String(VIEWPORT_H) + ' 高，即既有探针那一档）·')
  out.push('      同一段页内测量脚本 · 同一份标本 DOM（真实 buildReportShell + 真实 13 片 CSS）· 只换 CSS 层。')
  out.push('      命令：npx tsx scripts/req-detail-ui-variants-shot.mts')
  out.push('')
  out.push(pad('指标', 30) + pad('V-A', 14) + pad('V-B', 14) + pad('V-C', 14) + pad('上限/下限', 12) + '判定')
  out.push('-'.repeat(96))
  for (const r of rows) {
    const cells = ids.map(id => { const d = diags.get(id); return d === undefined ? 'n/a' : r.get(d) })
    const okAll = ids.every(id => { const d = diags.get(id); return d !== undefined && r.ok(d) })
    out.push(pad(r.label, 30) + cells.map(c => pad(c, 14)).join('') + pad(r.limit, 12) + (okAll ? '✓ 三版全过' : '✗ 见下方明细'))
  }
  out.push('')
  out.push('明细（值域：脚本每次运行现测，「同一把尺子」的证据）')
  out.push('-'.repeat(96))
  for (const def of VARIANTS) {
    const d = diags.get(def.id)
    if (d === undefined) { out.push(def.name + '：未测到'); continue }
    const v = d.variety
    out.push(`${def.name}（${def.thesis.split('。')[0]!}。）`)
    out.push('  前景色  ：' + v.fgValues.join(' · '))
    out.push('  底色    ：' + v.bgValues.join(' · '))
    out.push('  字号    ：' + v.fsValues.join(' · '))
    out.push('  字重    ：' + v.fwValues.join(' · '))
    out.push('  圆角    ：' + v.radiusValues.join(' · '))
    out.push('  边线色  ：' + v.bcValues.join(' · '))
    out.push('  最小命中区：' + d.minTargetWWhat + ' ／ 最矮：' + d.minTargetHWhat)
    out.push('  最小字号：' + d.minFontWhat + ' ／ 最小对比度：' + d.contrast.minWhat)
    out.push('  取值落到哪个元素（复核"多出来的那一种是谁"）：')
    const det = d.variety.detail
    const pairs: [string, Record<string, string>][] = [
      ['前景色', det.fg], ['底色', det.bg], ['字号', det.fs], ['圆角', det.radius], ['边线色', det.bc],
    ]
    for (const [label, bag] of pairs) {
      const parts = Object.keys(bag).sort().map(k => `${k} → ${bag[k]}`)
      out.push(`    ${label}：` + parts.join(' ｜ '))
    }
    if (d.wide.length > 0) out.push('  横向溢出越界元素：' + d.wide.join(' ｜ '))
    out.push('')
  }
  out.push('FR 判据逐版（同一段测量脚本，DOM 断言而不是 grep 注释）')
  out.push('-'.repeat(96))
  out.push(pad('判据', 46) + pad('V-A', 22) + pad('V-B', 22) + 'V-C')
  for (const c of checks) {
    const cells = ids.map(id => { const d = diags.get(id); return d === undefined ? 'n/a' : c.get(d) })
    out.push(pad(c.label, 46) + cells.map(x => pad(x.length > 20 ? x.slice(0, 19) + '…' : x, 22)).join(''))
  }
  out.push('')
  if (terminal.size > 0) {
    out.push('终态复核（archived · 只读 · 同一把尺子）——色板与几何是页面级约束，两态都要成立')
    out.push('-'.repeat(96))
    out.push(pad('指标', 30) + pad('V-A', 14) + pad('V-B', 14) + pad('V-C', 14) + pad('上限/下限', 12) + '判定')
    for (const r of rows) {
      const cells = ids.map(id => { const d = terminal.get(id); return d === undefined ? 'n/a' : r.get(d) })
      const okAll = ids.every(id => { const d = terminal.get(id); return d !== undefined && r.ok(d) })
      out.push(pad(r.label, 30) + cells.map(c => pad(c, 14)).join('') + pad(r.limit, 12) + (okAll ? '✓ 三版全过' : '✗'))
    }
    for (const def of VARIANTS) {
      const d = terminal.get(def.id)
      out.push(`  ${def.name}：` + (d === undefined ? '未实测'
        : `前景 ${d.variety.fgValues.length} 种 / 底色 ${d.variety.bgValues.length} 种 / 圆角 ${d.variety.radiusValues.join(' ')} / `
          + `边线色 ${d.variety.bcValues.join(' ')}`))
    }
    out.push('')
  }
  out.push('如实登记的偏离 / 未落地项')
  out.push('-'.repeat(96))
  out.push('① V-A 圆角取舍：卡按 V-A 要求用 12px；为守住「圆角 ≤2 档」放弃了 999px 那一档')
  out.push('   （状态/窗口/计数都收成 8px）→ 圆角 = {12px, 8px}，胶囊元素 0 个。')
  out.push('② V-B / V-C 的「百分比」：标本 DOM 里没有百分比文本，CSS 无法推算，**不合成假数字**；')
  out.push('   进度用「线长 + 刻度 + 当前阶段名（真实文本）」表达。')
  out.push('③ FR-8 的 ✓/▸ 前缀在 V-A / V-C 由 ::before 承担（受"同一份标本、只换 CSS 层"约束），')
  out.push('   V-B 用**真实文本**（露出最后一个完成段的标签与当前段标签）；实施阶段一律要落成真实节点。')
  out.push('④ V-C 分段控件选中项的轻投影偏离 FR-10 §6「内容页不用阴影」——它是控件滑块不是卡片阴影，')
  out.push('   判据表不统计阴影，故不构成指标违规，如实登记。')
  out.push('⑤ 「card grouping density --domain ux」在 ui-ux-pro-max 库里 **0 命中**；')
  out.push('   改用 "dashboard information density" / "grouped list section" 复核，命中 Color Only / Active State。')
  out.push('')
  return out.join('\n')
}

/** 三版对照图（PIL；标题只用英文字符——PIL 默认字体没有中文字形，中文会出豆腐块）。 */
const CONTACT_SHEET_PY = `import sys
from PIL import Image, ImageDraw, ImageFont

files = sys.argv[1:4]
out = sys.argv[4]
caps = sys.argv[5:8]
CROP_H = 1400          # 只取首屏那一段（2 倍图像素：1400 / 2 = 700 CSS px；三版的 Tab 栏都在内）
TARGET_W = 1120
MARGIN = 24
GAP = 18
CAP_H = 40

crops = []
for f in files:
    im = Image.open(f).convert('RGB')
    w, h = im.size
    im = im.crop((0, 0, w, min(h, CROP_H)))
    scale = TARGET_W / float(im.size[0])
    im = im.resize((TARGET_W, max(1, int(round(im.size[1] * scale)))), Image.Resampling.LANCZOS)
    crops.append(im)

font = ImageFont.load_default(size=26)
W = TARGET_W + MARGIN * 2
H = MARGIN * 2 + sum(c.size[1] + CAP_H + GAP for c in crops) - GAP
canvas = Image.new('RGB', (W, H), (255, 255, 255))
d = ImageDraw.Draw(canvas)
y = MARGIN
for im, cap in zip(crops, caps):
    canvas.paste(im, (MARGIN, y))
    d.rectangle([MARGIN - 1, y - 1, MARGIN + im.size[0], y + im.size[1]], outline=(0, 0, 0, 26))
    d.text((MARGIN, y + im.size[1] + 8), cap, fill=(29, 29, 31), font=font)
    y += im.size[1] + CAP_H + GAP
canvas.save(out)
print('%d x %d' % (W, H))
`

void main()
