/**
 * 需求详情页「工作汇报」渲染探针（REQ-261004222448-292a · 卡 t-98684c；
 * REQ-261006130057-7a43 · t9 按七 Tab 口径复测校准）。
 *
 * 为什么需要它：壳与七个面板的静态断言（`match(/data-panel=/)` 这类）只能证明「字符串里有这回事」，
 * 证明不了「渲染出来真的四问可答 / 真的没有内层滚动条 / 未激活面板真的不在 DOM」。
 * 布局与可视性缺陷只有真实渲染判定得出来：真实 `buildReportShell` + 真实 CSS 拼出标本页 →
 * headless Chrome `--dump-dom` → 读 `#diag` 判定。
 *
 * ── 7a43（t9）口径校准（2026-10-06）────────────────────────────────────────────
 * 本探针的几何阈值最初按 f32f（六个 Tab / 24px 页标题 / 旧头部 D-8 两行 / 旧字阶
 * 11·12·13·15·20·24）订立。REQ-261006130057-7a43 已把页面重设计并落地（t1~t8）：
 *   · Tab 6 → **7**（新增 verify，FR-4；验收 Tab 第 5 位，`verifyTabIndex1Based = 5`）；
 *   · 头部三层（标识行 / 标题行 19px / 闸门提示条，FR-1）取代旧 D-8 两行；
 *   · 激活页签 = 浅蓝底 + **主色文字** + 底部 2px 指示条（FR-4，**推翻** f32f 设计契约 ⑦ 的
 *     「白滑块 + 正文字色」——旧断言方向已反转）；
 *   · 密度新字阶：10.5（进度带标签/计数徽章/时间戳）· 11 · 12 · 12.5（聊天气泡）· 13 ·
 *     15 · **19（页标题）** · 20（状态带主值）——旧的 24px 标题档与 11px 下限随之失效；
 *   · 对话面板聊天气泡（D-5）+ 吸顶分页条（D-7）：`.dsh-pm-chat-scroll`（460px 固定高内滚动）
 *     是「无内层滚动」铁律的**唯一豁免**（design/frontend.md §对话、architecture §边界裁决 3，
 *     A3 白名单已注明出处）；
 *   · 900 窄档：状态带三格退为单列（design/frontend.md §可访问性与窄档）——Tab 栏 top 的
 *     首屏硬上限因此分档（见 TABS_TOP_MAX_900 的推导）；
 *   · docs/dialogue 面板断言按 T-6（docs 不再渲染验收单节、有迁移指引条）/
 *     T-8（对话只读：无回复框无检索框）改写；
 *   · **900 档 `.dsh-pm-tabs` 实测结论**（任务口径 P2-1 复核）：900 在途实测
 *     scrollWidth == clientWidth（=1280），**未发生栏内横滚**——页面级横向溢出把栏身同比例
 *     撑宽（见 A2 的登记溢出源），故 `.dsh-pm-tabs` **不加** A3 白名单；栏计算样式
 *     `overflow-x: auto`（窄档横滚能力）在场性另作硬断言守住，若将来页面级溢出修复后栏身
 *     真内溢（横向导航滚动 ≠ 藏内容），再按任务口径补白名单。
 *
 * **已销账的两条 pinned deviation（2026-10-06 修复，留档）**：
 *   · DEV-t6-fonts：汇报模块标题/正文未按 FR-5 落地（实测 13px/400 vs 13px）。根因是
 *     `src/client/styles/report.ts` 两处横幅注释里写了「--s*」「--f-*」后紧跟斜杠
 *     （星号 + 斜杠 = 注释终止符）**提前闭合块注释**，紧随的规则集被 CSS 解析器吞掉。
 *   · DEV-docpath-mono：文档表路径格等宽未生效——同根因（同一句横幅）。
 *   两处注释已改写（`--s 系列 / --f- 系列`），规则恢复生效；探针里的登记已移除：
 *   H3 双通道（13px/650 vs 12.5px/400）与 docs 路径格等宽均升为**正向断言**，
 *   日后回归会当场判红，不再有「登记在案就放行」的余地。
 *
 * 四组合：宽度 1280 / 900 × 状态 在途（implementing，有缺口有任务）/ 终态（archived，只读）。
 * 每组合逐条打印可读行（A1~A12 断言口径见行内注释；A13 六个非 trunk 面板补测见文末）。
 *
 * **判据必须硬（REQ-261005105032-3b02 · t-ed8a64 · 验收标准 8）**：每个几何量两条独立判据同守——
 *   ① 页内脚本 `problems.push(...)` 失败分支（判据与读数同一处计算）；
 *   ② 宿主侧 `readbackProblems()` **只吃原始读数**重算阈值比较，并承担环境回读
 *      （实际视口宽必须等于 `--window-size` 期望值，不等 = 参数没生效，读数作废判失败）。
 * `tests/probe-hard-criteria.test.ts` 用源码级扫描守住"只打印不判"的复发（命中数必须为 0）。
 *
 * 用法：npx tsx scripts/req-report-probe.mts
 * 退出码：0 = 四组合 + 六面板全过；1 = 有断言失败；2 = 环境不可用（找不到 Chrome **或**
 * Chrome 四组合全起不来），响亮失败、不静默跳过。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 评论列表的渲染上限（条数）从**渲染层**取，避免探针自己写一份会漂移的常量
import { COMMENT_RENDER_LIMIT } from '../src/client/views/report-head.js'
import { REPORT_TAB_KEYS } from '../src/client/views/report-tabs.js'
// 标本（数据 + 真实壳拼页 + 全量 CSS + Chrome 落点）抽到共享模块：出图脚本
// `scripts/req-detail-ui-shot.mts` / `scripts/req-7a43-ui-shot.mts` 吃同一份标本，避免漂移。
// **判据仍在本文件**（阈值常量 + 页内断言脚本），共享模块不含任何断言。
import {
  INACTIVE_PANEL_KEYS, STATES, WIDTHS, WINDOW_HEIGHT, findChrome, specimenShell, specimenShellForPanel,
  type PanelSpecimenKey, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

/**
 * Tab 栏 top 的**硬上限**（px，**仅 1280 档**）= headless 下 800 档实测视口高 713。
 *
 * 缺陷修复史（REQ-261004222448-292a 验收现场）：线上真数据曾把 Tab 栏顶到 top=1118 →
 * 首屏看不到 Tab。七个 Tab 是七块内容的唯一入口，首屏看不到它 = 都进不去。
 */
const TABS_TOP_MAX = 713

/**
 * Tab 栏 top 在 **900 档**的硬上限（px）= TABS_TOP_MAX + 2 × BAND_CELL_MAX_H。
 *
 * 为什么分档：design/frontend.md §可访问性与窄档裁定「900 窄档状态带三格退为单列」——
 * 三格纵向后 Tab 栏**必然**落到 713 首屏线以下（实测 831），这不是缺陷而是已确认设计。
 * 上界推导：单列状态带相对单行情形最多多出两格高度（每格硬上限 BAND_CELL_MAX_H=220，
 * 见下），故 713 + 2×220 = 1153；在此上界内 Tab 栏紧随状态带，超过即说明有未登记的内容
 * 增长（那才是 1118 类缺陷的复发）。
 */
const TABS_TOP_MAX_900 = TABS_TOP_MAX + 2 * 220

/**
 * 评论列表容器（`data-comment-list`）的**整块高度上限**（px）。
 * 它**不许**用限高/内层滚动解决（FR-11 #7），只能靠"少渲染几条 + 截断正文 + 压紧行距"，
 * 所以探针量的是**整块高度**——限高就会在这里露馅（同时 A3 的内层滚动判据也会红）。
 */
const COMMENT_LIST_MAX_H = 260

/**
 * 状态带**单格**的高度上限（px，两档同判）：格内每条只给「项名 + 状态」，
 * 全文进 title（7a43 FR-2 沿用此口径；缺口格折行后仍 ≤ 此值，实测两档均过）。
 */
const BAND_CELL_MAX_H = 220

/** 头部三层 + 标题行操作区（1280 档）单行判据的余量（px）：操作区右缘 ≈ 标题行右缘 ±本值。 */
const ACTIONS_RIGHT_TOL = 2

/**
 * 验收 Tab 的 1-based 位次（T-1：trunk < docs < dag < dialogue < **verify** < token < prompts）。
 * 字面量 5 是**设计期望**（design/architecture.md：原型实测 verifyTabIndex1Based=5），
 * 不从注册表推导——从注册表推导等于自己证自己。
 */
const VERIFY_TAB_INDEX_1BASED = 5

/**
 * 7a43 密度新字阶（px）：10.5（FR-4 进度带标签 / 计数徽章 / 对话时间戳）· 11（--f-tiny 表头/辅助）·
 * 12（--f-small）· 12.5（FR-6 聊天气泡 --pm-chat-bubble-fs；FR-5 汇报正文同值）·
 * 13（--f-body / FR-5 模块标题 650 半粗）·
 * 15（--f-h2）· 19（FR-1 页标题 --pm-head-title-fs）· 20（--f-l1 状态带主值）。
 * f32f 旧字阶（11/12/13/15/20/24）随 19px 页标题与 10.5px 密度档落地而废止。
 */
const FONT_SCALE: readonly number[] = [10.5, 11, 12, 12.5, 13, 15, 19, 20]

/** 详情页可见真文字的最小计算字号（7a43 密度档：10.5px；f32f 的 11px 下限随密度落地改准）。 */
const FONT_MIN = 10.5

/**
 * 阶梯外字号的**显式登记豁免**（逐条给理由；命中别的类名或别的字号照常判红）：
 *   · .dsh-pm-gate-link：闸门提示条锚链是 <button>，规则没写 font-size，Chrome UA 默认值
 *     13.3333px 漏继承（banner 是 12px）——已登记的实现小瑕疵（P2 挂账复核），
 *     不是字阶第七档。
 */
const OFFSCALE_EXEMPT: readonly { cls: string; size: number; why: string }[] = [
  /* dsh-pm-gate-link 13.3333px 的登记已销账：2026-10-06 用 font: inherit + --f-body 修掉
     UA 按钮默认字号漏继承（现为 13px，在本版字阶内），降为硬判据。 */
]

/**
 * 命中区 24×24（WCAG 2.5.8 AA）的**显式登记例外**（与旧探针的 Tab 4px 相邻间距例外同纪律：
 * 逐条写理由，清单之外一律判红）：
 *   · .dsh-pm-comments-all：评论头部行「全部对话 →」文本锚链（FR-3 单行紧凑头部行，
 *     行高 18.6px 的 inline 文本钮）——P2 挂账复核（设计 §可访问性只点名气泡/工具条/徽章 ≥24）；
 *   · .dsh-pm-doc-open：文档表「打开」列链接式小按钮（FR-6 紧凑分节表行高 18.6px）——同上挂账；
 *   · 验收单逐项单选（.dsh-pm-verdict-btn 内的原生 radio）：radio 本体 13×13，
 *     **命中区 = 包裹它的整枚 label**（实测 min-height 24px，另有专门断言守它）。
 */
const TARGET_EXEMPT: readonly { cls: string; why: string }[] = [
  /* 两条 7a43 新控件的登记（dsh-pm-comments-all / dsh-pm-doc-open）已销账：
     2026-10-06 给两类加 min-height: var(--pm-target)（t9 复核 P1-1——f32f t-0d8c9b
     已把行内链接纳入 ≥24 口径，垂直堆叠列无 WCAG 间距例外可援），现为硬判据。 */
]

/** A3 的合法例外（自身命中即跳过）：在页内脚本与 A13 面板脚本里共用同一份，防两处漂移。 */
/* D-13：对话聊天区高度随视口自适应（clamp(320px, 100vh-420px, 880px)）、DAG 画布区同理
   （clamp(360px, 100vh-400px, 900px)）——两处都是**有界内滚动**的合法豁免，见 design/frontend.md。 */
const SCROLL_EXCEPTIONS = '.dsh-pm-detail, [data-dag-wrap], .dsh-pm-dag-canvas-wrap, .dsh-pm-chat-scroll'

/** 一件标本页 = 共享模块 `specimenShell(...)` **+ 本文件自己的页内断言脚本**。 */
function specimenHtml(width: number, state: SpecimenState, expectLong: number): string {
  return specimenShell(width, state, `<script>
(function () {
  /* 合法例外：自身命中即跳过（不用 closest——那会把例外元素的**后代**也一并放过，
     而我们要扫的恰恰是壳内部还有没有别的滚动容器）。
     .dsh-pm-chat-scroll：对话面板 460px 固定高内滚动，「无内层滚动」铁律的唯一豁免
     （7a43 D-5 气泡对话 / D-7 吸顶分页条；design/frontend.md §对话、architecture §边界裁决 3）。 */
  var EXCEPTIONS = ${JSON.stringify(SCROLL_EXCEPTIONS)};
  var INACTIVE = ${JSON.stringify(INACTIVE_PANEL_KEYS)};
  var problems = [];
  /* 已停用（复核 P2-1）：pinned deviation 两条已全部销账，这里不再接受新登记——
     本仓纪律是「修掉」而不是「登记放行」。保留变量只为兼容打印路径，**禁止再 push**。 */
  var deviations = [];
  var shell = document.querySelector('[data-report-shell]');
  var de = document.documentElement;

  function txt(el) { return el === null ? '' : (el.textContent || '').replace(/\\s+/g, ' ').trim(); }
  function topOf(el) { return el === null ? -1 : Math.round(el.getBoundingClientRect().top); }
  function desc(el) {
    var cls = typeof el.className === 'string' && el.className.length > 0 ? '.' + el.className.split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + cls;
  }

  /* ── A1 首屏四问可答 ───────────────────────────────────────── */
  var head = shell === null ? null : shell.querySelector('[data-report-head]');
  var title = shell === null ? null : shell.querySelector('[data-report-head] .dsh-pm-detail-title');
  var band = shell === null ? null : shell.querySelector('[data-report-band]');
  var progress = shell === null ? null : shell.querySelector('[data-band-cell="progress"]');
  var dots = shell === null ? null : shell.querySelector('[data-report-head] .dsh-pm-progress-dots');
  var gaps = shell === null ? null : shell.querySelector('[data-band-cell="gaps"]');
  var tabs = shell === null ? null : shell.querySelector('[data-report-tabs]');
  var actions = shell === null ? null : shell.querySelector('[data-report-actions]');
  var tabEls = tabs === null ? [] : tabs.querySelectorAll('.dsh-pm-tab');
  var tabCount = tabEls.length;
  var tabOrder = [];
  var verifyTabIndex1Based = -1;
  for (var ti0 = 0; ti0 < tabEls.length; ti0++) {
    var tk = tabEls[ti0].getAttribute('data-tab');
    tabOrder.push(tk);
    if (tk === 'verify') verifyTabIndex1Based = ti0 + 1;
  }
  var a1 = {
    head: head !== null,
    title: txt(title).length > 0,
    band: band !== null,
    progress: txt(progress).length > 0,
    gaps: gaps !== null && txt(gaps).length > 0,
    gapsNone: gaps !== null && gaps.querySelector('[data-gaps="none"]') !== null,
    dots: dots !== null,
    tabs: tabs !== null && tabCount === 7,
    tabCount: tabCount
  };
  if (!a1.head) problems.push('A1 是什么：缺少 [data-report-head]');
  if (a1.head && !a1.title) problems.push('A1 是什么：头部标题为空');
  if (!a1.band) problems.push('A1 到哪了：缺少 [data-report-band]');
  if (a1.band && !a1.progress) problems.push('A1 到哪了：状态带 progress 格无文案');
  if (!a1.dots) problems.push('A1 到哪了：头部阶段条 .dsh-pm-progress-dots 不在场');
  if (!a1.gaps) problems.push('A1 卡在哪：状态带 gaps 格缺失或为空（无缺口时也该有一行正向结论）');
  if (!a1.tabs) problems.push('A1 Tab 栏：七个同级 Tab 未渲染全（实得 ' + String(tabCount) + '）');
  /* T-1：Tab 次序 = 注册表次序，且 verify 在第 5 位（1-based，设计字面量期望） */
  var EXPECT_ORDER = ${JSON.stringify([...REPORT_TAB_KEYS])};
  if (tabOrder.join(',') !== EXPECT_ORDER.join(',')) {
    problems.push('A1 Tab 次序 ≠ 注册表（trunk<docs<dag<dialogue<verify<token<prompts）：实得 [' + tabOrder.join(',') + ']');
  }
  if (verifyTabIndex1Based !== ${String(VERIFY_TAB_INDEX_1BASED)}) {
    problems.push('A1 验收 Tab 位次 verifyTabIndex1Based=' + String(verifyTabIndex1Based)
      + ' ≠ 期望 ${String(VERIFY_TAB_INDEX_1BASED)}（T-1：verify 在 dialogue 之后、token 之前）');
  }

  /* ── A2 无横向溢出 ─────────────────────────────────────────── */
  var docBox = { cw: de.clientWidth, sw: de.scrollWidth };
  var shellBox = shell === null ? { cw: 0, sw: 0 } : { cw: shell.clientWidth, sw: shell.scrollWidth };
  var docOverflow = docBox.sw > docBox.cw + 1;
  var shellOverflow = shell !== null && shellBox.sw > shellBox.cw + 1;
  /* 900 在途曾有两处**已登记**的页面级横向溢出源，2026-10-07「详情页面不适配」修复后**双双消失**：
        ① 标题行操作区 .dsh-pm-rh-title > [data-report-actions]；
        ② 折叠长日志评论的 nowrap 单行截断体（.dsh-pm-comment-body--clip，用 contain: inline-size
           把内在尺寸贡献清零）。
      **判据随之收紧为硬判据**：不再"隐藏登记源看残余"——页面级横向溢出只要 > 1px 就判红，
     残余即原始溢出量（"登记在案就放行"正是这条判据失效的老路）。 */
  var a2 = {
    overflow: docOverflow,
    residualAfterHidingRegistered: docOverflow ? (docBox.sw - docBox.cw) : 0,
    registeredSources: 0,
  };
  if (a2.residualAfterHidingRegistered > 1) {
    problems.push('A2 横向溢出：documentElement 残余 ' + String(a2.residualAfterHidingRegistered)
      + 'px（scrollWidth ' + String(de.scrollWidth) + ' > clientWidth ' + String(de.clientWidth)
      + '）——2026-10-07 起无"登记源"豁免，任何页面级横向溢出都判红');
  }
  if (shellOverflow) problems.push('A2 横向溢出：报告壳 scrollWidth ' + String(shellBox.sw) + ' 大于 clientWidth ' + String(shellBox.cw));

  /* ── A3 无内层滚动容器（真 DOM 实测）────────────────────────── */
  var scanned = 0;
  var bad = [];
  if (shell !== null) {
    var all = shell.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (typeof el.matches === 'function' && el.matches(EXCEPTIONS)) continue; /* 合法例外：自身跳过 */
      var cs = getComputedStyle(el);
      var oy = cs.overflowY, ox = cs.overflowX;
      var scrollAxis = (oy === 'auto' || oy === 'scroll' || ox === 'auto' || ox === 'scroll');
      if (!scrollAxis) continue; /* overflow:hidden / visible 不算内层滚动 */
      scanned++;
      var tall = el.scrollHeight > el.clientHeight + 2;
      var wide = el.scrollWidth > el.clientWidth + 2;
      if (tall || wide) {
        bad.push(desc(el) + '[overflow ' + oy + '/' + ox + ' 竖向 ' + String(el.clientHeight) + ' 装 ' + String(el.scrollHeight)
          + ' 横向 ' + String(el.clientWidth) + ' 装 ' + String(el.scrollWidth) + ']');
      }
    }
  }
  if (bad.length > 0) problems.push('A3 内层滚动容器 ' + String(bad.length) + ' 处：' + bad.join(' ; '));

  /* ── A4 未激活面板缺席 ─────────────────────────────────────── */
  var present = [];
  if (shell !== null) {
    for (var k = 0; k < INACTIVE.length; k++) {
      if (shell.querySelector('[data-panel="' + INACTIVE[k] + '"]') !== null) present.push(INACTIVE[k]);
    }
  }
  var hostCount = shell === null ? 0 : shell.querySelectorAll('[data-tab-host]').length;
  var trunkPresent = shell !== null && shell.querySelector('[data-panel="trunk"]') !== null;
  if (present.length > 0) problems.push('A4 未激活面板出现在 DOM：' + present.join(' / '));
  if (hostCount !== 1) problems.push('A4 面板包装器应有且仅有 1 个，实得 ' + String(hostCount));
  if (!trunkPresent) problems.push('A4 默认面板 trunk 不在 DOM');

  /* ── 几何：L0 首屏判定集（结论头 / 操作区 / 状态带）落点是否在视口内 ── */
  var vh = de.clientHeight;
  var TABS_TOP_LIMIT = de.clientWidth >= 1280 ? ${String(TABS_TOP_MAX)} : ${String(TABS_TOP_MAX_900)};
  var COMMENT_LIST_MAX_H = ${String(COMMENT_LIST_MAX_H)};
  var COMMENT_RENDER_LIMIT = ${String(COMMENT_RENDER_LIMIT)};
  var EXPECT_LONG = ${String(expectLong)};
  var BAND_CELL_MAX_H = ${String(BAND_CELL_MAX_H)};
  function hOf(el) { return el === null ? 0 : Math.round(el.getBoundingClientRect().height); }
  var comments = shell === null ? null : shell.querySelector('[data-comment-list]');
  var commentRows = comments === null ? 0 : comments.querySelectorAll('[data-comment-row]').length;
  var commentLong = comments === null ? 0 : comments.querySelectorAll('[data-comment-long="1"]').length;
  var headParts = [];
  if (head !== null) {
    for (var hp = 0; hp < head.children.length; hp++) {
      headParts.push(desc(head.children[hp]) + '=' + String(hOf(head.children[hp])));
    }
  }
  var geom = {
    vh: vh,
    headTop: topOf(head), actionsTop: topOf(actions), bandTop: topOf(band),
    gapsTop: topOf(gaps), tabsTop: topOf(tabs),
    headH: hOf(head), bandH: hOf(band), commentsH: hOf(comments),
    progressCellH: hOf(progress), gapsCellH: hOf(gaps),
    outcomeCellH: hOf(shell === null ? null : shell.querySelector('[data-band-cell="outcome"]')),
    commentRows: commentRows, commentLong: commentLong,
    headParts: headParts
  };
  function inFold(t) { return t >= 0 && t < vh; }
  geom.headInFold = inFold(geom.headTop);
  geom.bandInFold = inFold(geom.bandTop);
  geom.gapsInFold = inFold(geom.gapsTop);
  geom.actionsInFold = actions === null ? true : inFold(geom.actionsTop);
  geom.foldOk = geom.headInFold && geom.bandInFold && geom.gapsInFold && geom.actionsInFold;
  /* Tab 栏进首屏：**硬判据**，上限分档（1280 → 落视口内且 ≤ 713；900 → 状态带单列是已确认
     设计，Tab 栏允许落到首屏线下，但仍 ≤ 713+2×220，防 1118 类缺陷复发）。 */
  geom.tabsLimit = TABS_TOP_LIMIT;
  geom.tabsInFold = de.clientWidth >= 1280
    ? (inFold(geom.tabsTop) && geom.tabsTop <= TABS_TOP_LIMIT)
    : (geom.tabsTop >= 0 && geom.tabsTop <= TABS_TOP_LIMIT);
  if (!geom.tabsInFold) {
    problems.push('A1 首屏：Tab 栏越界（top ' + String(geom.tabsTop) + '，本档上限 ' + String(TABS_TOP_LIMIT)
      + '，视口高 ' + String(vh) + '）——七个 Tab 是七块内容的唯一入口');
  }
  if (geom.commentsH > COMMENT_LIST_MAX_H) {
    problems.push('A1 首屏：评论列表整块高 ' + String(geom.commentsH) + 'px > 上限 ' + String(COMMENT_LIST_MAX_H)
      + 'px（不许用 max-height/内层滚动解决，只能少渲染几条 + 截断正文 + 压紧行距）');
  }
  if (geom.commentRows > COMMENT_RENDER_LIMIT) {
    problems.push('A1 首屏：评论渲染了 ' + String(geom.commentRows) + ' 行 > 上限 ' + String(COMMENT_RENDER_LIMIT) + ' 行');
  }
  if (geom.commentLong !== EXPECT_LONG) {
    problems.push('A1 首屏：超长系统日志被收纳的行数 ' + String(geom.commentLong) + ' ≠ 期望 ' + String(EXPECT_LONG)
      + '（data-comment-long="1" 没打上：11k 字的机器转储会整段铺开，把 Tab 栏顶出首屏）');
  }
  if (!geom.headInFold) problems.push('A1 首屏：结论头不在首屏内（top ' + String(geom.headTop) + '，视口高 ' + String(vh) + '）');
  if (!geom.actionsInFold) problems.push('A1 首屏：操作区不在首屏内（top ' + String(geom.actionsTop) + '，视口高 ' + String(vh) + '）');
  if (!geom.bandInFold) problems.push('A1 首屏：状态带不在首屏内（top ' + String(geom.bandTop) + '，视口高 ' + String(vh) + '）');
  if (!geom.gapsInFold) problems.push('A1 首屏：缺口格不在首屏内（top ' + String(geom.gapsTop) + '，视口高 ' + String(vh) + '）');
  if (geom.headH > vh) problems.push('A1 首屏：结论头整块高 ' + String(geom.headH) + 'px > 视口高 ' + String(vh) + 'px（一屏读不完头部）');
  if (geom.bandH > vh) problems.push('A1 首屏：状态带整块高 ' + String(geom.bandH) + 'px > 视口高 ' + String(vh) + 'px（一屏读不完状态带）');
  if (geom.progressCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：progress 格高 ' + String(geom.progressCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px');
  if (geom.gapsCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：gaps 格高 ' + String(geom.gapsCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px');
  if (geom.outcomeCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：outcome 格高 ' + String(geom.outcomeCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px');

  /* ── A5 操作区按钮不重叠（两档同判）── */
  var overlaps = [];
  if (actions !== null) {
    var btns = actions.querySelectorAll('.dsh-pm-btn');
    for (var a = 0; a < btns.length; a++) {
      for (var b = a + 1; b < btns.length; b++) {
        var ra = btns[a].getBoundingClientRect(), rb = btns[b].getBoundingClientRect();
        var hit = !(ra.right <= rb.left + 0.5 || rb.right <= ra.left + 0.5 || ra.bottom <= rb.top + 0.5 || rb.bottom <= ra.top + 0.5);
        if (hit) overlaps.push(desc(btns[a]) + '+' + desc(btns[b]));
      }
    }
  }
  if (overlaps.length > 0) problems.push('A5 操作区按钮重叠：' + overlaps.join(' ; '));

  /* ── T-12 头部三层（7a43 FR-1，取代旧 D-8 两行断言）────────────────
     ① 标识行 .dsh-pm-rh-top（REQ-id 等宽 .dsh-pm-card-id 在场）；
     ② 标题行 .dsh-pm-rh-title：操作区聚合**固定右侧**（1280 档：操作区右缘 ≈ 行右缘 ±2px，
        且按钮同一行——「参差」正是旧验收"排版散架"的现场；900 档允许折行，不判行数）；
     ③ 闸门提示条 .dsh-pm-gate-banner：waitingHuman > 0 才渲染（在途在、终态无），
        含锚链「查看缺口」（data-gap-anchor）。 */
  var rhTop = shell === null ? null : shell.querySelector('.dsh-pm-rh-top');
  var rhTitle = shell === null ? null : shell.querySelector('.dsh-pm-rh-title');
  var banner = shell === null ? null : shell.querySelector('.dsh-pm-gate-banner');
  var cardId = rhTop === null ? null : rhTop.querySelector('.dsh-pm-card-id');
  var t12 = {
    rhTop: rhTop !== null,
    cardId: cardId !== null && txt(cardId).length > 0,
    rhTitle: rhTitle !== null,
    actionsRight: -1, rowRight: -1, rightTol: ${String(ACTIONS_RIGHT_TOL)},
    actionTops: [],
    bannerExpected: ${state === 'inflight' ? 'true' : 'false'},
    bannerPresent: banner !== null,
    bannerAnchor: banner !== null && banner.querySelector('[data-gap-anchor]') !== null
  };
  if (rhTitle !== null && actions !== null) {
    t12.actionsRight = Math.round(actions.getBoundingClientRect().right);
    t12.rowRight = Math.round(rhTitle.getBoundingClientRect().right);
    var ab = actions.querySelectorAll('.dsh-pm-btn');
    for (var at0 = 0; at0 < ab.length; at0++) {
      var atv = Math.round(ab[at0].offsetTop);
      if (t12.actionTops.indexOf(atv) < 0) t12.actionTops.push(atv);
    }
  }
  if (!t12.rhTop) problems.push('T-12 头部三层：标识行 .dsh-pm-rh-top 不在场');
  if (t12.rhTop && !t12.cardId) problems.push('T-12 头部三层：标识行缺 REQ-id 等宽格 .dsh-pm-card-id');
  if (!t12.rhTitle) problems.push('T-12 头部三层：标题行 .dsh-pm-rh-title 不在场');
  if (actions !== null && de.clientWidth >= 1280) {
    if (t12.rowRight > 0 && Math.abs(t12.actionsRight - t12.rowRight) > t12.rightTol) {
      problems.push('T-12 操作区未聚合右端：操作区右缘 ' + String(t12.actionsRight)
        + ' ≠ 标题行右缘 ' + String(t12.rowRight) + '（±' + String(t12.rightTol) + 'px，FR-1 固定右侧）');
    }
    if (t12.actionTops.length > 1) {
      problems.push('T-12 操作区按钮落在 ' + String(t12.actionTops.length) + ' 行（offsetTop='
        + t12.actionTops.join(',') + '），1280 档要求同一行');
    }
  }
  if (t12.bannerExpected && !t12.bannerPresent) problems.push('T-12 闸门提示条：waitingHuman>0 但未渲染（FR-1 的视觉锚点丢了）');
  if (t12.bannerExpected && t12.bannerPresent && !t12.bannerAnchor) problems.push('T-12 闸门提示条缺锚链「查看缺口」（data-gap-anchor）');
  if (!t12.bannerExpected && t12.bannerPresent) problems.push('T-12 闸门提示条：无可裁决事项时整条不该渲染（不留空壳）');

  /* ── 900 档 Tab 栏实测读数（任务口径 P2-1：判**要不要**进 A3 白名单）──
     实测结论随页打印：当前 sw == cw（页面级溢出把栏身同比例撑宽）→ 未内溢 → 不加白名单；
     若将来页面级溢出修复后栏身真内溢（横向导航滚动 ≠ 藏内容），按任务口径补白名单。 */
  var tabsNote = '';
  var tabsOx = '';
  if (tabs !== null) {
    tabsOx = getComputedStyle(tabs).overflowX;
    tabsNote = '.dsh-pm-tabs sw=' + String(tabs.scrollWidth) + ' cw=' + String(tabs.clientWidth) + ' ox=' + tabsOx;
  }
  if (de.clientWidth < 1280 && tabsOx !== 'auto') {
    problems.push('A1 窄档 Tab 栏横滚能力缺席：.dsh-pm-tabs overflow-x=' + tabsOx + ' ≠ auto（FR-4：900 窄档允许横滚不换行）');
  }

  /* ═══════════════ A7~A12：可访问性与视觉层级（7a43 口径校准） ═══════════════ */

  /* 颜色解析：**不用正则**（模板字符串嵌套会吃掉反斜杠转义，本卡实测踩过）。按括号切分最稳。 */
  function rgbOf(s) {
    var i = s.indexOf('(');
    if (i < 0) return null;
    var j = s.indexOf(')', i);
    if (j < 0) return null;
    var parts = s.slice(i + 1, j).split(',');
    if (parts.length < 3) return null;
    return { r: parseFloat(parts[0]), g: parseFloat(parts[1]), b: parseFloat(parts[2]), a: parts.length > 3 ? parseFloat(parts[3]) : 1 };
  }
  function relLum(c) {
    function ch(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratioOf(a, b) {
    var l1 = relLum(a), l2 = relLum(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function bgOf(el, includeSelf) {
    var n = includeSelf ? el : el.parentElement;
    while (n !== null && n.nodeType === 1) {
      var c = rgbOf(getComputedStyle(n).backgroundColor);
      if (c !== null && c.a > 0.99) return c;
      if (c !== null && c.a > 0) {
        var under = bgOf(n, false);
        return { r: Math.round(c.r * c.a + under.r * (1 - c.a)), g: Math.round(c.g * c.a + under.g * (1 - c.a)), b: Math.round(c.b * c.a + under.b * (1 - c.a)), a: 1 };
      }
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* ── A7 焦点环（live 取样 + cssom 兜底；兜底原因：headless 的 :focus-visible 置位不稳定）── */
  var FOCUS_SELECTORS = ['.dsh-pm-btn', '.dsh-pm-tab', '.dsh-pm-window', '.dsh-pm-input', '.dsh-pm-trunk-open', 'summary'];
  var focusRows = [];
  var focusBad = [];
  function splitTopLevel(s) {
    var out = [];
    var depth = 0;
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else { cur += ch; }
    }
    out.push(cur);
    return out;
  }
  function focusDeclsFor(el) {
    var decls = [];
    var sheets = document.styleSheets;
    for (var s = 0; s < sheets.length; s++) {
      var rules = null;
      try { rules = sheets[s].cssRules; } catch (err) { continue; }
      if (rules === null) continue;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        var st = rule.style;
        var selText = rule.selectorText;
        if (st === undefined || st === null || typeof selText !== 'string' || selText.indexOf(':focus-visible') < 0) continue;
        var parts = splitTopLevel(selText);
        for (var pi = 0; pi < parts.length; pi++) {
          var sel = parts[pi].trim();
          var vi = sel.indexOf(':focus-visible');
          if (vi < 0) continue;
          var base = (sel.slice(0, vi) + sel.slice(vi + 14)).trim();
          if (base.length === 0) continue;
          var hit = false;
          try { hit = el.matches(base); } catch (err2) { hit = false; }
          if (!hit) continue;
          for (var k = 0; k < st.length; k++) decls.push([st[k], st.getPropertyValue(st[k])]);
          var EXPLICIT = ['outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'];
          for (var x = 0; x < EXPLICIT.length; x++) {
            var xv = st.getPropertyValue(EXPLICIT[x]);
            if (typeof xv === 'string' && xv.trim().length > 0) decls.push([EXPLICIT[x], xv]);
          }
        }
      }
    }
    return decls;
  }
  function resolveVars(value, el, depth) {
    if (depth > 6) return value;
    var out = '';
    var i = 0;
    while (i < value.length) {
      var vi = value.indexOf('var(', i);
      if (vi < 0) { out += value.slice(i); break; }
      out += value.slice(i, vi);
      var nest = 1;
      var j = vi + 4;
      while (j < value.length && nest > 0) {
        if (value.charAt(j) === '(') nest++;
        else if (value.charAt(j) === ')') nest--;
        j++;
      }
      var inner = value.slice(vi + 4, j - 1);
      var comma = inner.indexOf(',');
      var name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      var fallback = comma < 0 ? '' : inner.slice(comma + 1).trim();
      var raw = getComputedStyle(el).getPropertyValue(name);
      out += (raw !== null && raw.trim().length > 0) ? resolveVars(raw.trim(), el, depth + 1) : resolveVars(fallback, el, depth + 1);
      i = j;
    }
    return out;
  }
  var STYLE_WORDS = ['solid', 'dashed', 'dotted', 'double', 'none', 'auto', 'hidden'];
  function focusRingFromRules(el) {
    var decls = focusDeclsFor(el);
    if (decls.length === 0) return null;
    var map = {};
    for (var i = 0; i < decls.length; i++) {
      if (typeof decls[i][1] === 'string' && decls[i][1].trim().length > 0) map[decls[i][0]] = decls[i][1];
    }
    var width = null, style = null, color = null, offset = null;
    if (typeof map['outline'] === 'string') {
      var toks = resolveVars(map['outline'], el, 0).split(' ');
      for (var t = 0; t < toks.length; t++) {
        var tok = toks[t];
        if (tok.length === 0) continue;
        if (STYLE_WORDS.indexOf(tok) >= 0) style = tok;
        else if (tok.length > 2 && tok.indexOf('px') === tok.length - 2 && !isNaN(parseFloat(tok))) width = tok;
        else color = tok;
      }
    }
    if (typeof map['outline-width'] === 'string') width = resolveVars(map['outline-width'], el, 0);
    if (typeof map['outline-style'] === 'string') style = resolveVars(map['outline-style'], el, 0);
    if (typeof map['outline-color'] === 'string') color = resolveVars(map['outline-color'], el, 0);
    if (typeof map['outline-offset'] === 'string') offset = resolveVars(map['outline-offset'], el, 0);
    if (width === null && style === null && color === null) return null;
    return { width: width, style: style, color: color, offset: offset };
  }
  function colorOf(s) {
    var h = (s === null || s === undefined) ? '' : s.trim();
    if (h.charAt(0) === '#') {
      var body = h.slice(1);
      if (body.length === 3) body = body.charAt(0) + body.charAt(0) + body.charAt(1) + body.charAt(1) + body.charAt(2) + body.charAt(2);
      if (body.length === 6 || body.length === 8) {
        return { r: parseInt(body.slice(0, 2), 16), g: parseInt(body.slice(2, 4), 16), b: parseInt(body.slice(4, 6), 16), a: body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1 };
      }
      return null;
    }
    return rgbOf(h);
  }
  function onWhite(c) {
    if (c === null) return null;
    if (c.a >= 1) return c;
    return { r: Math.round(c.r * c.a + 255 * (1 - c.a)), g: Math.round(c.g * c.a + 255 * (1 - c.a)), b: Math.round(c.b * c.a + 255 * (1 - c.a)), a: 1 };
  }
  function ringColorText(c) {
    return c === null ? '' : 'rgb(' + String(c.r) + ', ' + String(c.g) + ', ' + String(c.b) + ')';
  }
  var focusVia = { live: 0, cssom: 0 };
  for (var fsi = 0; fsi < FOCUS_SELECTORS.length; fsi++) {
    var fEls = document.querySelectorAll(FOCUS_SELECTORS[fsi]);
    for (var fei = 0; fei < fEls.length; fei++) {
      var fEl = fEls[fei];
      if (fEl.getBoundingClientRect().width === 0) continue;
      fEl.focus();
      var fcs = getComputedStyle(fEl);
      var via = 'live';
      var oWidth = parseFloat(fcs.outlineWidth);
      var oStyle = fcs.outlineStyle;
      var oOff = fcs.outlineOffset;
      var oCol = rgbOf(fcs.outlineColor);
      if (oStyle !== 'solid') {
        var ring = focusRingFromRules(fEl);
        if (ring !== null && ring.style === 'solid') {
          via = 'cssom';
          oWidth = parseFloat(ring.width);
          oStyle = ring.style;
          oOff = ring.offset;
          oCol = colorOf(ring.color);
        }
      }
      focusVia[via] = focusVia[via] + 1;
      var inside = parseFloat(oOff) < 0;
      var bg = onWhite(oCol) === null ? null : bgOf(fEl, inside);
      var oRatio = bg === null ? 0 : ratioOf(onWhite(oCol), bg);
      focusRows.push({ sel: FOCUS_SELECTORS[fsi], w: oWidth, style: oStyle, off: oOff, color: (oCol === null ? '' : (ringColorText(oCol))), contrast: round2(oRatio), via: via, fv: fEl.matches(':focus-visible') });
      var who = FOCUS_SELECTORS[fsi] + '[' + String(fei) + ']';
      if (!(oWidth >= 2)) focusBad.push('A7 ' + who + '：outline 宽 ' + String(oWidth) + 'px < 2px');
      if (oStyle !== 'solid') focusBad.push('A7 ' + who + '：outline 样式 ' + String(oStyle) + ' ≠ solid（:focus-visible 规则没覆盖它）');
      if (oOff !== '-2px' && oOff !== '2px') focusBad.push('A7 ' + who + '：outline-offset ' + String(oOff) + ' 不在 {-2px（面状）, 2px（小控件）} 两档内');
      if (!(oRatio >= 3)) focusBad.push('A7 ' + who + '：环色与相邻背景 ' + String(ringColorText(oCol)) + ' = ' + String(round2(oRatio)) + ':1 < 3:1');
    }
  }
  if (focusRows.length === 0) focusBad.push('A7 清单里的控件一个都没量到（选择器与页面脱节，空集不能算过）');

  /* ── A8 目标尺寸与相邻间距（WCAG 2.5.8 AA）──
     例外清单**显式登记**（清单之外一律判红）：
       · Tab 与 Tab 相邻 2~4px：同属一个 tablist 的成组目标（WCAG 2.5.8 同组 spacing 例外，
         f32f t-0d8c9b 已裁定，7a43 沿用）；
       · TARGET_EXEMPT 里的密集行文本钮（理由逐条在脚本常量里）；
       · .dsh-pm-verdict-btn 内的原生 radio：命中区 = 包裹它的整枚 label（label ≥24 单独断言）。 */
  var TARGET_SELECTOR = 'button, [role="tab"], a[href], summary, input';
  var TARGET_EXEMPT_CLS = ${JSON.stringify(TARGET_EXEMPT.map(e => e.cls))};
  var targetEls = document.querySelectorAll(TARGET_SELECTOR);
  var targetRows = [];
  var targetSized = [];
  var targetBad = [];
  var targetExempt = [];
  for (var ti = 0; ti < targetEls.length; ti++) {
    var tEl = targetEls[ti];
    var tBox = tEl.getBoundingClientRect();
    if (tBox.width === 0 && tBox.height === 0) continue;
    var rec = { cls: String(tEl.className).slice(0, 48), tag: tEl.tagName.toLowerCase(), w: round2(tBox.width), h: round2(tBox.height) };
    targetRows.push(rec);
    if (tBox.width < 24 || tBox.height < 24) {
      var exemptHit = '';
      for (var te = 0; te < TARGET_EXEMPT_CLS.length; te++) {
        if (tEl.classList.contains(TARGET_EXEMPT_CLS[te])) exemptHit = TARGET_EXEMPT_CLS[te];
      }
      var inVerdictLabel = tEl.type === 'radio' && tEl.closest('.dsh-pm-verdict-btn') !== null;
      if (exemptHit !== '') { targetExempt.push(rec); continue; }
      if (inVerdictLabel) { targetExempt.push(rec); continue; }
      targetSized.push(rec);
      targetBad.push('A8 命中区 ' + rec.tag + '.' + rec.cls + ' = ' + String(rec.w) + '×' + String(rec.h) + 'px < 24×24（未登记的例外不许有）');
    }
  }
  if (targetRows.length === 0) targetBad.push('A8 一个交互目标都没量到（空集不能算过）');
  /* 裁决单选 label 的命中区（radio 豁免的前提条件）：每枚 label 高 ≥ 24px */
  var verdictLabels = document.querySelectorAll('.dsh-pm-verdict-btn');
  var verdictLabelMinH = 1e9;
  for (var vl = 0; vl < verdictLabels.length; vl++) {
    var vlb = verdictLabels[vl].getBoundingClientRect();
    if (vlb.height < verdictLabelMinH) verdictLabelMinH = vlb.height;
  }
  if (verdictLabels.length > 0 && verdictLabelMinH < 24) {
    targetBad.push('A8 裁决单选 label 最小高 ' + String(Math.round(verdictLabelMinH * 10) / 10) + 'px < 24px（radio 豁免的前提就是 label 承载命中区）');
  }
  var ADJACENT_MIN = 8;
  var adjacentRows = [];
  var adjacentBad = [];
  var adjacentExempt = [];
  for (var ai = 0; ai < targetEls.length; ai++) {
    for (var bi = ai + 1; bi < targetEls.length; bi++) {
      var rra = targetEls[ai].getBoundingClientRect();
      var rrb = targetEls[bi].getBoundingClientRect();
      if ((rra.width === 0 && rra.height === 0) || (rrb.width === 0 && rrb.height === 0)) continue;
      var overlapY = Math.min(rra.bottom, rrb.bottom) - Math.max(rra.top, rrb.top);
      if (overlapY <= Math.min(rra.height, rrb.height) * 0.5) continue;
      var gap2 = rra.left < rrb.left ? rrb.left - rra.right : rra.left - rrb.right;
      if (gap2 < -0.5) { adjacentBad.push('A8 目标重叠（gap ' + String(round2(gap2)) + 'px）'); continue; }
      if (gap2 >= ADJACENT_MIN) continue;
      var bothTab = targetEls[ai].classList.contains('dsh-pm-tab') && targetEls[bi].classList.contains('dsh-pm-tab');
      var arow = { gap: round2(gap2), a: String(targetEls[ai].className).slice(0, 32), b: String(targetEls[bi].className).slice(0, 32) };
      if (bothTab) adjacentExempt.push(arow);
      else { adjacentRows.push(arow); adjacentBad.push('A8 相邻目标间距 ' + String(arow.gap) + 'px < ' + String(ADJACENT_MIN) + 'px（' + arow.a + ' | ' + arow.b + '）'); }
    }
  }

  /* ── A9 最小字号与档位（7a43 密度新字阶）── */
  var FONT_SCALE = ${JSON.stringify(FONT_SCALE)};
  var OFFSCALE_EXEMPT = ${JSON.stringify(OFFSCALE_EXEMPT)};
  var fontHist = {};
  var offScale = [];
  var offScaleExempt = [];
  var minFont = { size: 999, who: '' };
  var allEls = shell === null ? [] : shell.querySelectorAll('*');
  for (var ei = 0; ei < allEls.length; ei++) {
    var eEl = allEls[ei];
    var hasText = false;
    for (var cn = 0; cn < eEl.childNodes.length; cn++) {
      var node = eEl.childNodes[cn];
      if (node.nodeType === 3 && node.textContent !== null && node.textContent.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    var eBox = eEl.getBoundingClientRect();
    var ecs = getComputedStyle(eEl);
    if (eBox.width <= 1 && eBox.height <= 1) continue;
    if (ecs.visibility === 'hidden' || ecs.display === 'none') continue;
    var eSize = parseFloat(ecs.fontSize);
    var key = String(eSize);
    fontHist[key] = (fontHist[key] || 0) + 1;
    if (eSize < minFont.size) minFont = { size: eSize, who: String(eEl.className).slice(0, 40) };
    if (FONT_SCALE.indexOf(eSize) < 0) {
      var ex = '';
      for (var ox2 = 0; ox2 < OFFSCALE_EXEMPT.length; ox2++) {
        if (Math.abs(OFFSCALE_EXEMPT[ox2].size - eSize) < 0.01 && eEl.classList.contains(OFFSCALE_EXEMPT[ox2].cls)) ex = OFFSCALE_EXEMPT[ox2].cls;
      }
      if (ex !== '') { if (offScaleExempt.length < 4) offScaleExempt.push(String(eSize) + 'px @ .' + ex); }
      else if (offScale.length < 8) offScale.push(String(eSize) + 'px @ .' + String(eEl.className).slice(0, 40));
    }
  }
  var fontBad = [];
  if (minFont.size < ${String(FONT_MIN)}) fontBad.push('A9 可见真文字最小字号 ' + String(minFont.size) + 'px < ${String(FONT_MIN)}px（.' + minFont.who + '）');
  if (offScale.length > 0) fontBad.push('A9 出现阶梯外字号（' + FONT_SCALE.join('/') + '，登记豁免除外）：' + offScale.join(' ; '));

  /* ── A10 reduced-motion（本机 headless 恒为 reduce；只在媒体查询成立时判）── */
  var reduceOn = false;
  try { reduceOn = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduceOn = false; }
  var durRows = [];
  var durBad = [];
  var DUR_SELECTORS = ['.dsh-pm-btn', '.dsh-pm-tab', '.dsh-pm-window', '.dsh-pm-input', '.dsh-pm-trunk-open', '.dsh-pm-gap-ref'];
  for (var di = 0; di < DUR_SELECTORS.length; di++) {
    var dEl = document.querySelector(DUR_SELECTORS[di]);
    if (dEl === null) continue;
    var dDur = getComputedStyle(dEl).transitionDuration;
    durRows.push({ sel: DUR_SELECTORS[di], dur: dDur });
    if (reduceOn && dDur !== '0s') durBad.push('A10 reduced-motion 下 ' + DUR_SELECTORS[di] + ' 的 transitionDuration = ' + dDur + ' ≠ 0s');
  }
  if (reduceOn && durRows.length === 0) durBad.push('A10 一个过渡取样点都没量到（空集不能算过）');

  /* ── A11 状态不靠颜色单一表达（真实文本标记）── */
  var markBad = [];
  var markRows = { completed: 0, current: 0, todo: 0, gap: 0, gapSvg: 0, verdict: 0 };
  var cDots = document.querySelectorAll('.dsh-pm-dot-wrapper.completed .dsh-pm-dot-mark');
  var nDots = document.querySelectorAll('.dsh-pm-dot-wrapper.current .dsh-pm-dot-mark');
  var uDots = document.querySelectorAll('.dsh-pm-dot-wrapper[data-stage-state="todo"] .dsh-pm-dot-mark');
  markRows.completed = cDots.length; markRows.current = nDots.length; markRows.todo = uDots.length;
  for (var cd = 0; cd < cDots.length; cd++) if (cDots[cd].textContent.indexOf('✓') < 0) markBad.push('A11 完成态阶段点缺「✓」真实文本标记');
  for (var nd = 0; nd < nDots.length; nd++) if (nDots[nd].textContent.indexOf('▸') < 0) markBad.push('A11 当前态阶段点缺「▸」真实文本标记');
  for (var ud = 0; ud < uDots.length; ud++) if (uDots[ud].textContent.trim().length > 0) markBad.push('A11 未开始阶段点不该带标记（三态就分不出了）');
  var gapMarks = document.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-mark');
  var gapSvgs = document.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-sev > svg');
  markRows.gap = gapMarks.length; markRows.gapSvg = gapSvgs.length;
  for (var gm = 0; gm < gapMarks.length; gm++) if (gapMarks[gm].textContent.trim().length === 0) markBad.push('A11 缺口条缺真实文本标记（!! / ! / ·）');
  if (gapMarks.length > 0 && gapSvgs.length !== gapMarks.length) markBad.push('A11 缺口条的 SVG 圆数量（' + String(gapSvgs.length) + '）与文本标记数量（' + String(gapMarks.length) + '）不一致');
  var verdicts = document.querySelectorAll('.dsh-pm-outcome-verdict');
  markRows.verdict = verdicts.length;
  for (var vv = 0; vv < verdicts.length; vv++) if (verdicts[vv].textContent.trim().length === 0) markBad.push('A11 验收结论只有颜色、没有可读文字');

  /* ── A12 视觉层级（7a43 口径）──
     H1 页标题 19px ÷ 正文 13px ≥ 1.4（FR-1；f32f 的 1.8 是 24px 标题口径，已随 19px 标题改准）；
     H2 汇报短模块 2×2 网格（FR-5；旧「模块间距÷模块内间距 ≥3」在网格版式下结构性失效，改写为
        1280 档网格确为两列、900 档落回单列）；
     H3 模块标题与正文双通道差异（FR-5 设计：13px/650 半粗 vs 12.5px/400）——当前被
       已由注释修复恢复生效（13px/650 vs 12.5px/400，根因见文件头）；
     H4 状态带字号档数 ≥3 且极差 ≥8（沿用）；
     H5 主色：激活页签**必须**取主色（FR-4：浅蓝底 + 主色文字 + 底部 2px 指示条——
        f32f 设计契约 ⑦「选中取正文字色」已被 7a43 推翻，断言方向随之反转），
        且全页承载主色的角色取同一个色值。 */
  var hBad = [];
  var hReport = {};
  var h1El = document.querySelector('h1.dsh-pm-detail-title');
  var shellFs = shell === null ? 0 : parseFloat(getComputedStyle(shell).fontSize);
  var h1Fs = h1El === null ? 0 : parseFloat(getComputedStyle(h1El).fontSize);
  hReport.h1 = h1Fs; hReport.body = shellFs; hReport.h1Ratio = shellFs > 0 ? round2(h1Fs / shellFs) : 0;
  if (!(hReport.h1Ratio >= 1.4)) hBad.push('A12 H1 页标题÷正文 = ' + String(hReport.h1Ratio) + ' < 1.4（FR-1：19px ÷ 13px）');
  /* H2：2×2 网格列数（1280 → 2 列；900 → 单列） */
  var gridEl = shell === null ? null : shell.querySelector('.dsh-pm-trunk-grid');
  var gridCols = 0;
  if (gridEl !== null) {
    var gItems = gridEl.querySelectorAll('.dsh-pm-trunk-item');
    var gLefts = {};
    for (var gi = 0; gi < gItems.length; gi++) {
      if (gItems[gi].classList.contains('dsh-pm-trunk-item--wide')) continue;
      gLefts[Math.round(gItems[gi].getBoundingClientRect().left)] = 1;
    }
    gridCols = Object.keys(gLefts).length;
  }
  hReport.gridCols = gridCols;
  if (gridEl !== null && de.clientWidth >= 1280 && gridCols !== 2) {
    hBad.push('A12 H2 汇报短模块 1280 档应为 2×2 网格（非 wide 项 2 个左缘），实得 ' + String(gridCols) + ' 列');
  }
  if (gridEl !== null && de.clientWidth < 1280 && gridCols > 1) {
    hBad.push('A12 H2 汇报短模块 900 档应落回单列，实得 ' + String(gridCols) + ' 列');
  }
  /* H3：双通道差异（FR-5 设计 13px/650 半粗 vs 12.5px/400）——DEV-t6-fonts 已销账，
     这里不再有「登记在案就放行」的逃生门：必须真的是双通道差异。 */
  var tTitle = document.querySelector('.dsh-pm-trunk-title');
  var tLine = document.querySelector('.dsh-pm-trunk-line');
  if (tTitle !== null && tLine !== null) {
    var tcsA = getComputedStyle(tTitle), tcsB = getComputedStyle(tLine);
    hReport.titleFont = tcsA.fontSize + '/' + tcsA.fontWeight;
    hReport.lineFont = tcsB.fontSize + '/' + tcsB.fontWeight;
    var dualChannel = tcsA.fontSize !== tcsB.fontSize && tcsA.fontWeight !== tcsB.fontWeight;
    if (!dualChannel) {
      hBad.push('A12 H3 模块标题与正文必须是**双通道**差异（FR-5：13px/650 vs 12.5px/400），实得 '
        + hReport.titleFont + ' vs ' + hReport.lineFont + '（设计值 13px/650 vs 12.5px/400）');
    }
  } else {
    hBad.push('A12 H3 量不到模块标题/正文（选择器与页面脱节）');
  }
  /* H4：状态带字号档数（沿用；下两档相差 1px 为 design/frontend.md 权威取值，已登记） */
  var bandEl = shell === null ? null : shell.querySelector('[data-report-band]');
  var bandSizes = {};
  if (bandEl !== null) {
    var bEls = bandEl.querySelectorAll('*');
    for (var be = 0; be < bEls.length; be++) {
      var bEl2 = bEls[be];
      var bHasText = false;
      for (var bn = 0; bn < bEl2.childNodes.length; bn++) {
        var bnode = bEl2.childNodes[bn];
        if (bnode.nodeType === 3 && bnode.textContent !== null && bnode.textContent.trim().length > 0) { bHasText = true; break; }
      }
      if (!bHasText) continue;
      var bb = bEl2.getBoundingClientRect();
      if (bb.width <= 1 && bb.height <= 1) continue;
      bandSizes[String(parseFloat(getComputedStyle(bEl2).fontSize))] = 1;
    }
  }
  var bandLevels = Object.keys(bandSizes).map(Number).sort(function (x, y) { return x - y; });
  hReport.bandLevels = bandLevels;
  if (bandLevels.length < 3) hBad.push('A12 H4 状态带字号档数 = ' + String(bandLevels.length) + ' < 3（标签 / 主值 / 细节三档）');
  else {
    var span = bandLevels[bandLevels.length - 1] - bandLevels[0];
    var mainGap = bandLevels[bandLevels.length - 1] - bandLevels[bandLevels.length - 2];
    if (span < 8) hBad.push('A12 H4 状态带字号极差 = ' + String(span) + 'px < 8px（主值没拉开）');
    if (mainGap < 2) hBad.push('A12 H4 主值与次大档相差 ' + String(mainGap) + 'px < 2px');
  }
  /* H5：主色角色同值（点开看原文 / 焦点环 / 激活页签），且激活页签**必须**取主色 + 2px 指示条 */
  var accentSamples = [];
  var activeTab = document.querySelector('.dsh-pm-tab.active');
  var trunkOpen = document.querySelector('.dsh-pm-trunk-open');
  if (trunkOpen !== null) accentSamples.push({ role: '点开看原文', color: getComputedStyle(trunkOpen).color });
  if (focusRows.length > 0) accentSamples.push({ role: '焦点环', color: focusRows[0].color });
  if (activeTab !== null) accentSamples.push({ role: '激活页签', color: getComputedStyle(activeTab).color });
  var accentDistinct = {};
  for (var as = 0; as < accentSamples.length; as++) accentDistinct[accentSamples[as].color] = 1;
  hReport.accentSamples = accentSamples;
  hReport.accentKinds = Object.keys(accentDistinct).length;
  if (accentSamples.length >= 2 && hReport.accentKinds > 1) {
    hBad.push('A12 H5 主色文字出现 ' + String(hReport.accentKinds) + ' 类取值（' + accentSamples.map(function (s) { return s.role + '=' + s.color; }).join(' / ') + '），要求 ≤1');
  }
  if (activeTab !== null) {
    var tabColor = getComputedStyle(activeTab).color;
    var tabBorder = getComputedStyle(activeTab).borderBottomColor;
    var tabBorderW = getComputedStyle(activeTab).borderBottomWidth;
    var accentColor = trunkOpen !== null ? getComputedStyle(trunkOpen).color : null;
    if (accentColor !== null && tabColor !== accentColor) {
      hBad.push('A12 H5 激活页签未取主色（' + tabColor + '）——FR-4 要求浅蓝底 + 主色文字 + 底部 2px 指示条');
    }
    if (tabBorderW !== '2px' || (accentColor !== null && tabBorder !== accentColor)) {
      hBad.push('A12 H5 激活页签缺底部 2px 主色指示条（实得 ' + tabBorderW + ' ' + tabBorder + '）——FR-4 三重表达之一');
    }
  } else {
    hBad.push('A12 H5 找不到激活页签（.dsh-pm-tab.active 不在场）');
  }

  for (var fb = 0; fb < focusBad.length; fb++) problems.push(focusBad[fb]);
  for (var tb = 0; tb < targetBad.length; tb++) problems.push(targetBad[tb]);
  for (var ab2 = 0; ab2 < adjacentBad.length; ab2++) problems.push(adjacentBad[ab2]);
  for (var fnb = 0; fnb < fontBad.length; fnb++) problems.push(fontBad[fnb]);
  for (var db2 = 0; db2 < durBad.length; db2++) problems.push(durBad[db2]);
  for (var mb = 0; mb < markBad.length; mb++) problems.push(markBad[mb]);
  for (var hb = 0; hb < hBad.length; hb++) problems.push(hBad[hb]);

  var a11y = {
    focus: { rows: focusRows, bad: focusBad, via: focusVia },
    target: { rows: targetRows, sized: targetSized, exempt: targetExempt, count: targetRows.length, verdictLabelMinH: verdictLabels.length > 0 ? Math.round(verdictLabelMinH * 10) / 10 : null },
    adjacent: { bad: adjacentRows, exempt: adjacentExempt, min: ADJACENT_MIN },
    font: { hist: fontHist, min: minFont, offScale: offScale, offScaleExempt: offScaleExempt, scale: FONT_SCALE, bad: fontBad },
    motion: { reduceOn: reduceOn, rows: durRows, bad: durBad },
    marks: { rows: markRows, bad: markBad },
    hier: { report: hReport, t12: t12, bad: hBad }
  };

  var diag = document.createElement('div');
  diag.id = 'diag';
  diag.textContent = JSON.stringify({
    w: de.clientWidth, state: ${JSON.stringify(state)}, vh: vh,
    doc: docBox, shell: shellBox, docOverflow: docOverflow, shellOverflow: shellOverflow,
    a2: a2,
    a1: a1, geom: geom, a3: { scanned: scanned, bad: bad }, overlaps: overlaps,
    tabsTopMax: TABS_TOP_LIMIT, commentListMaxH: COMMENT_LIST_MAX_H, commentRenderLimit: COMMENT_RENDER_LIMIT,
    bandCellHs: [geom.progressCellH, geom.gapsCellH, geom.outcomeCellH], bandCellMaxH: BAND_CELL_MAX_H,
    a4: { present: present, hostCount: hostCount, trunkPresent: trunkPresent },
    tabOrder: tabOrder, verifyTabIndex1Based: verifyTabIndex1Based,
    tabsNote: tabsNote,
    a11y: a11y,
    deviations: deviations,
    problems: problems
  });
  document.body.appendChild(diag);
})();
</script>`)
}

interface Diag {
  w: number
  state: SpecimenState
  vh: number
  doc: { cw: number; sw: number }
  shell: { cw: number; sw: number }
  docOverflow: boolean
  shellOverflow: boolean
  a2: { overflow: boolean; residualAfterHidingRegistered: number; registeredSources: number }
  a1: {
    head: boolean; title: boolean; band: boolean; progress: boolean
    gaps: boolean; gapsNone: boolean; dots: boolean; tabs: boolean; tabCount: number
  }
  geom: {
    vh: number; headTop: number; actionsTop: number; bandTop: number; gapsTop: number; tabsTop: number
    headH: number; bandH: number; commentsH: number
    progressCellH: number; gapsCellH: number; outcomeCellH: number
    commentRows: number; commentLong: number; headParts: string[]
    headInFold: boolean; bandInFold: boolean; gapsInFold: boolean; actionsInFold: boolean
    foldOk: boolean; tabsInFold: boolean; tabsLimit: number
  }
  tabsTopMax: number
  commentListMaxH: number
  commentRenderLimit: number
  bandCellHs: number[]
  bandCellMaxH: number
  a3: { scanned: number; bad: string[] }
  overlaps: string[]
  a4: { present: string[]; hostCount: number; trunkPresent: boolean }
  tabOrder: string[]
  verifyTabIndex1Based: number
  tabsNote: string
  a11y: {
    focus: { rows: { sel: string; w: number; style: string; off: string; color: string; contrast: number; via: string; fv: boolean }[]; bad: string[]; via: { live: number; cssom: number } }
    target: { rows: { cls: string; tag: string; w: number; h: number }[]; sized: { cls: string; tag: string; w: number; h: number }[]; exempt: { cls: string; tag: string; w: number; h: number }[]; count: number; verdictLabelMinH: number | null }
    adjacent: { bad: { gap: number; a: string; b: string }[]; exempt: { gap: number; a: string; b: string }[]; min: number }
    font: { hist: Record<string, number>; min: { size: number; who: string }; offScale: string[]; offScaleExempt: string[]; scale: number[]; bad: string[] }
    motion: { reduceOn: boolean; rows: { sel: string; dur: string }[]; bad: string[] }
    marks: { rows: { completed: number; current: number; todo: number; gap: number; gapSvg: number; verdict: number }; bad: string[] }
    hier: {
      report: {
        h1: number; body: number; h1Ratio: number; gridCols: number
        titleFont?: string; lineFont?: string; bandLevels: number[]
        accentSamples: { role: string; color: string }[]; accentKinds: number
      }
      t12: {
        rhTop: boolean; cardId: boolean; rhTitle: boolean
        actionsRight: number; rowRight: number; rightTol: number; actionTops: number[]
        bannerExpected: boolean; bannerPresent: boolean; bannerAnchor: boolean
      }
      bad: string[]
    }
  }
  deviations: string[]
  problems: string[]
}

/** A13 的单面板读数（页内脚本交回来的原始数，判据在宿主侧）。 */
interface PanelDiag {
  panel: string
  targets: { count: number; minW: number | null; minH: number | null; small: string[]; exempt: string[] }
  font: { hist: Record<string, number>; min: number; who: string; off: string[]; offExempt: string[]; scale: number[] }
  emoji: string[]
  readings: string[]
  tabIcons: number
  marks: { gap: number; gapSvg: number; doneDots: number; curDots: number }
  scroll: { scanned: number; bad: string[] }
  docOverflow: boolean
  notes: string[]
  problems: string[]
}

/**
 * A13 的页内脚本：量**这一块面板**自己的目标尺寸 / 字阶 / 结构位图标 / 内层滚动 / 横向溢出，
 * 并按面板附带 T-6（docs 迁移指引）/ T-8·T-9·T-10（对话只读 / 吸顶分页 / 正序）/ FR-8（验收 RTM）断言。
 */
function panelA11yScript(): string {
  return `<script>
(function () {
  var problems = [];
  var notes = [];
  var shell = document.querySelector('[data-report-shell]');
  var de = document.documentElement;
  var SCROLL_EXCEPTIONS = ${JSON.stringify(SCROLL_EXCEPTIONS)};
  var out = {
    targets: { count: 0, minW: null, minH: null, small: [], exempt: [] },
    font: { hist: {}, min: 999, who: '', off: [], offExempt: [], scale: ${JSON.stringify(FONT_SCALE)} },
    emoji: [],
    readings: [],
    tabIcons: 0,
    marks: { gap: 0, gapSvg: 0, doneDots: 0, curDots: 0 },
    scroll: { scanned: 0, bad: [] },
    docOverflow: false,
    notes: notes,
    problems: problems
  };
  if (shell === null) { problems.push('A13 壳不在场'); var d0 = document.createElement('div'); d0.id = 'diag'; d0.textContent = JSON.stringify(out); document.body.appendChild(d0); return; }
  var panel = shell.querySelector('[data-panel]');
  var panelKey = panel === null ? '' : panel.getAttribute('data-panel');
  function desc(el) {
    var cls = typeof el.className === 'string' && el.className.length > 0 ? '.' + el.className.split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + cls;
  }
  /* ① 目标尺寸（≥24×24；例外清单与 A8 同口径，清单之外判红） */
  var TARGET_EXEMPT_CLS = ${JSON.stringify(TARGET_EXEMPT.map(e => e.cls))};
  var targets = shell.querySelectorAll('button, [role="tab"], a[href], summary, input');
  var minW = 1e9, minH = 1e9;
  for (var ti = 0; ti < targets.length; ti++) {
    var b = targets[ti].getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    out.targets.count++;
    if (b.width < minW) minW = b.width;
    if (b.height < minH) minH = b.height;
    if (b.width < 24 || b.height < 24) {
      var hit = '';
      for (var te = 0; te < TARGET_EXEMPT_CLS.length; te++) if (targets[ti].classList.contains(TARGET_EXEMPT_CLS[te])) hit = TARGET_EXEMPT_CLS[te];
      var inVerdictLabel = targets[ti].type === 'radio' && targets[ti].closest('.dsh-pm-verdict-btn') !== null;
      var rec = String(targets[ti].className).slice(0, 36) + '=' + String(Math.round(b.width * 10) / 10) + 'x' + String(Math.round(b.height * 10) / 10);
      if (hit !== '' || inVerdictLabel) out.targets.exempt.push(rec);
      else out.targets.small.push(rec);
    }
  }
  out.targets.minW = out.targets.count === 0 ? null : Math.round(minW * 10) / 10;
  out.targets.minH = out.targets.count === 0 ? null : Math.round(minH * 10) / 10;
  if (out.targets.count === 0) problems.push('A13 目标尺寸：一个交互目标都没量到（空集不能算过）');
  for (var s = 0; s < out.targets.small.length; s++) problems.push('A13 命中区 ' + out.targets.small[s] + ' < 24x24（未登记例外不许有）');
  var verdictLabels = shell.querySelectorAll('.dsh-pm-verdict-btn');
  for (var vl = 0; vl < verdictLabels.length; vl++) {
    if (verdictLabels[vl].getBoundingClientRect().height < 24) {
      problems.push('A13 裁决单选 label 高 ' + String(Math.round(verdictLabels[vl].getBoundingClientRect().height * 10) / 10) + 'px < 24px（radio 豁免前提）');
      break;
    }
  }
  /* ② 字阶（7a43 密度新字阶；登记豁免除外） */
  var OFFSCALE_EXEMPT = ${JSON.stringify(OFFSCALE_EXEMPT)};
  var all = shell.querySelectorAll('*');
  for (var ei = 0; ei < all.length; ei++) {
    var el = all[ei];
    var hasText = false;
    for (var cn = 0; cn < el.childNodes.length; cn++) {
      var nd = el.childNodes[cn];
      if (nd.nodeType === 3 && nd.textContent !== null && nd.textContent.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    var eb = el.getBoundingClientRect();
    var ecs = getComputedStyle(el);
    if (eb.width <= 1 && eb.height <= 1) continue;
    if (ecs.visibility === 'hidden' || ecs.display === 'none') continue;
    var fs = parseFloat(ecs.fontSize);
    out.font.hist[String(fs)] = (out.font.hist[String(fs)] || 0) + 1;
    if (fs < out.font.min) { out.font.min = fs; out.font.who = String(el.className).slice(0, 36); }
    if (out.font.scale.indexOf(fs) < 0) {
      var ex = '';
      for (var ox2 = 0; ox2 < OFFSCALE_EXEMPT.length; ox2++) {
        if (Math.abs(OFFSCALE_EXEMPT[ox2].size - fs) < 0.01 && el.classList.contains(OFFSCALE_EXEMPT[ox2].cls)) ex = OFFSCALE_EXEMPT[ox2].cls;
      }
      if (ex !== '') { if (out.font.offExempt.length < 4) out.font.offExempt.push(String(fs) + 'px @ .' + ex); }
      else if (out.font.off.length < 6) out.font.off.push(String(fs) + 'px @ .' + String(el.className).slice(0, 36));
    }
  }
  if (out.font.min < ${String(FONT_MIN)}) problems.push('A13 可见真文字最小字号 ' + String(out.font.min) + 'px < ${String(FONT_MIN)}px（.' + out.font.who + '）');
  for (var o = 0; o < out.font.off.length; o++) problems.push('A13 阶梯外字号 ' + out.font.off[o]);
  /* ②b 内层滚动（除 .chat-scroll 外零内滚动维持；例外同 A3） */
  for (var si = 0; si < all.length; si++) {
    var se = all[si];
    if (typeof se.matches === 'function' && se.matches(SCROLL_EXCEPTIONS)) continue;
    var scs = getComputedStyle(se);
    if (!(scs.overflowY === 'auto' || scs.overflowY === 'scroll' || scs.overflowX === 'auto' || scs.overflowX === 'scroll')) continue;
    out.scroll.scanned++;
    if (se.scrollHeight > se.clientHeight + 2 || se.scrollWidth > se.clientWidth + 2) {
      out.scroll.bad.push(desc(se) + '[竖 ' + String(se.clientHeight) + ' 装 ' + String(se.scrollHeight) + ' 横 ' + String(se.clientWidth) + ' 装 ' + String(se.scrollWidth) + ']');
    }
  }
  if (out.scroll.bad.length > 0) problems.push('A13 面板内层滚动（.chat-scroll 之外零豁免）：' + out.scroll.bad.join(' ; '));
  /* ②c 面板页横向溢出：docs 的长路径靠表内断词兜底，此处守「不溢出」 */
  out.docOverflow = de.scrollWidth > de.clientWidth + 1;
  if (out.docOverflow) problems.push('A13 面板页横向溢出：scrollWidth ' + String(de.scrollWidth) + ' > clientWidth ' + String(de.clientWidth));
  /* ③ 结构位 emoji（例外：状态符号，见 req-report-probe 历史口径） */
  var SYMBOL_EXCEPTIONS = [0x2705, 0x26A0, 0x23F3, 0x1F501, 0x2713, 0x25B8, 0x2716, 0x2714, 0x1F4A1, 0x1F916, 0xFE0F];
  function isEmoji(cp) {
    return (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || cp === 0x2B50;
  }
  var walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT, null);
  var node = walker.nextNode();
  while (node !== null) {
    var text = node.textContent === null ? '' : node.textContent;
    for (var ci = 0; ci < text.length; ci++) {
      var cp = text.codePointAt(ci);
      if (cp >= 0x10000) ci++;
      if (isEmoji(cp)) {
        if (SYMBOL_EXCEPTIONS.indexOf(cp) < 0) {
          var ch = String.fromCodePoint(cp);
          var pe = node.parentElement;
          var place = pe === null ? '?' : (pe.tagName.toLowerCase() + '.' + String(pe.className).slice(0, 30));
          var lead = text.trim().slice(0, 2).indexOf(ch) === 0;
          var affordance = pe !== null && (pe.tagName === 'BUTTON' || pe.getAttribute('role') === 'tab' || String(pe.className).indexOf('dsh-pm-tab-icon') >= 0) && lead;
          out.readings.push(ch + ' @ ' + place);
          if (affordance) out.emoji.push(ch + ' @ ' + place);
        }
      }
    }
    node = walker.nextNode();
  }
  for (var m2 = 0; m2 < out.emoji.length; m2++) problems.push('A13 结构位 emoji（按钮 / Tab 的 affordance 图标）：' + out.emoji[m2]);
  /* ③b Tab 图标硬判据：七个 Tab 各恰 1 个内联 SVG、13±1（FR-4：--pm-tab-icon-fr4=13px） */
  var tabIcons = shell.querySelectorAll('.dsh-pm-tab-icon');
  for (var tb = 0; tb < tabIcons.length; tb++) {
    var svgs = tabIcons[tb].querySelectorAll('svg');
    if (svgs.length !== 1) { problems.push('A13 Tab 图标应恰 1 个内联 SVG，实得 ' + String(svgs.length)); continue; }
    var ir = svgs[0].getBoundingClientRect();
    if (Math.abs(ir.width - 13) > 1 || Math.abs(ir.height - 13) > 1) problems.push('A13 Tab 图标尺寸 ' + String(Math.round(ir.width * 10) / 10) + 'x' + String(Math.round(ir.height * 10) / 10) + 'px 不在 13±1（FR-4 --pm-tab-icon-fr4）');
  }
  out.tabIcons = tabIcons.length;
  if (tabIcons.length !== 7) problems.push('A13 Tab 图标位应 7 个，实得 ' + String(tabIcons.length));
  /* ④ 非颜色标记（面板里若出现缺口条/阶段条，标记同样要在） */
  out.marks.gap = shell.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-mark').length;
  out.marks.gapSvg = shell.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-sev > svg').length;
  out.marks.doneDots = shell.querySelectorAll('.dsh-pm-dot-wrapper.completed .dsh-pm-dot-mark').length;
  out.marks.curDots = shell.querySelectorAll('.dsh-pm-dot-wrapper.current .dsh-pm-dot-mark').length;

  /* ══ 面板专属断言 ══ */
  if (panelKey === 'docs') {
    /* T-6：docs 不再渲染验收单节，原位是迁移指引条（可切 verify） */
    if (panel.querySelector('[data-verify-table]') !== null) problems.push('T-6 docs 面板仍渲染 data-verify-table（验收单节应已迁出）');
    if (panel.querySelector('[data-doc-section="verification"]') !== null) problems.push('T-6 docs 面板仍渲染 data-doc-section="verification"');
    var guide = panel.querySelector('[data-action="switch-tab"][data-tab="verify"]');
    if (guide === null) problems.push('T-6 docs 面板缺迁移指引条（data-action="switch-tab" data-tab="verify"）');
    /* 路径格等宽（--pm-mono）：根因已修（report.ts:1710 注释提前闭合吞掉主规则）——
       DEV-docpath-mono 已销账，这里升为**正向断言**：路径格字体必须含 mono。 */
    var fp = panel.querySelector('.dsh-pm-doc-filepath');
    var fpMono = fp !== null && getComputedStyle(fp).fontFamily.indexOf('mono') >= 0;
    /* 复核 P2-4：元素缺席（类名被改/规则被删）同样是失效，不能静默放过。 */
    if (fp === null) problems.push('docs 路径格缺席：查不到 .dsh-pm-doc-filepath（类名被改或整块未渲染）');
    else if (!fpMono) problems.push('docs 路径格非等宽：.dsh-pm-doc-filepath 计算字体 = ' + getComputedStyle(fp).fontFamily.slice(0, 48) + '（设计 --pm-mono）');
  }
  if (panelKey === 'dialogue') {
    /* T-8 只读：无回复框、无检索框；有只读说明行 */
    if (panel.querySelector('[data-role="comment-input"]') !== null) problems.push('T-8 对话面板仍有回复框（data-role="comment-input"，D-6 只读）');
    if (panel.querySelector('[data-dialogue-search]') !== null) problems.push('T-8 对话面板仍有检索框（data-dialogue-search，D-6 只读）');
    if (panel.querySelector('[data-dialogue-readonly]') === null) problems.push('T-8 对话面板缺只读说明行（data-dialogue-readonly）');
    /* T-9 吸顶分页条：是 .chat-scroll 的第一个子元素 */
    var chatScroll = panel.querySelector('[data-chat-scroll]');
    if (chatScroll === null) { problems.push('T-9 缺 .chat-scroll（460px 豁免容器）'); }
    else {
      var first = chatScroll.firstElementChild;
      if (first === null || !first.hasAttribute('data-chat-pager')) problems.push('T-9 吸顶分页条不是 .chat-scroll 的第一个子元素（D-7）');
      notes.push('chat-scroll 实测高 ' + String(Math.round(chatScroll.getBoundingClientRect().height)) + 'px（设计 460px 固定高 + 内边距）');
    }
    /* T-10 正序：data-at 升序 */
    var msgs = panel.querySelectorAll('[data-msg][data-at]');
    var prev = -1; var orderOk = true;
    for (var mi = 0; mi < msgs.length; mi++) {
      var at = Number(msgs[mi].getAttribute('data-at'));
      if (at < prev) orderOk = false;
      prev = at;
    }
    if (!orderOk) problems.push('T-10 对话不是正序（旧→新，data-at 应升序）');
    /* 长日志折叠支：标本含 1 条 >120 字符长日志 → data-msg-long 至少 1 */
    if (panel.querySelectorAll('[data-msg-long]').length < 1) problems.push('对话长日志折叠支未渲染（标本含 >120 字符长日志，应见 data-msg-long）');
  }
  if (panelKey === 'verify') {
    /* FR-8 RTM 列表：8 分组行、汇总口径 5/8 · 2 待裁决 · 1 不通过、版本签 v2、覆盖链 ✓/✗ 真实文本 */
    var frRows = panel.querySelectorAll('tr[data-fr]').length;
    if (frRows !== 8) problems.push('FR-8 RTM 表应为 8 个分组行（tr[data-fr]），实得 ' + String(frRows));
    var prog = txtOf(panel.querySelector('[data-rtm-progress]'));
    if (prog.indexOf('5/8') < 0 || prog.indexOf('待裁决') < 0 || prog.indexOf('不通过') < 0) problems.push('FR-8 汇总行口径不对（应含 5/8 通过 · 2 待裁决 · 1 不通过）：' + prog.slice(0, 60));
    if (panel.querySelector('[data-sheet-version="2"]') === null) problems.push('FR-8 缺版本签 data-sheet-version="2"');
    var cov = panel.querySelectorAll('[data-cov]');
    if (cov.length === 0) problems.push('FR-8 覆盖链 chip 缺席（data-cov）');
    else {
      var covText = '';
      for (var cv = 0; cv < cov.length; cv++) covText += cov[cv].textContent;
      if (covText.indexOf('✓') < 0 || covText.indexOf('✗') < 0) problems.push('FR-8 覆盖链 chip 缺 ✓/✗ 真实文本（双编码）');
    }
    /* D-10 返工：FR 行必须带**名称**（编号 + 名称，与原型 #tab-verify 同形）——
       载荷给了 frNames 却渲染不出名称 = 静默退化，这里硬判「8 行全部非空」。 */
    var nameCells = panel.querySelectorAll('tr[data-fr] [data-fr-name]');
    if (nameCells.length !== frRows) problems.push('FR-8 FR 行名称缺席：' + String(nameCells.length) + '/' + String(frRows) + ' 行带 data-fr-name');
    else {
      for (var nc = 0; nc < nameCells.length; nc++) {
        if ((nameCells[nc].textContent || '').trim().length === 0) problems.push('FR-8 第 ' + String(nc + 1) + ' 行 FR 名称为空');
      }
    }
    if (panel.querySelector('[data-fr-detail]') === null) problems.push('FR-8 缺行展开（data-fr-detail：逐项实际结果 / 需人工 / 证据）');
    if (panel.querySelector('.dsh-pm-nh-flag') === null) problems.push('FR-8 缺「无法自验·需人工」琥珀旗（标本含 needsHuman 项）');
    notes.push('RTM 行数 ' + String(frRows) + ' ｜ 汇总：' + prog.slice(0, 48));
  }
  function txtOf(el) { return el === null ? '' : (el.textContent || '').replace(/\\s+/g, ' ').trim(); }

  var d = document.createElement('div'); d.id = 'diag';
  out.panel = panelKey;
  d.textContent = JSON.stringify(out);
  document.body.appendChild(d);
})();
</script>`
}

/** 从 `--dump-dom` 的 DOM 文本里取 `#diag` 的 JSON（文本节点里的 `&lt;` 等还原后再 parse）。 */
function parseDiag(dom: string): Diag | undefined {
  const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(dom)
  if (m === null) return undefined
  const raw = m[1]!
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try {
    return JSON.parse(raw) as Diag
  } catch {
    return undefined
  }
}

/** 一条可读行（缩进两格，便于在 CI 日志里扫读）。 */
function line(text: string): void {
  console.log('  ' + text)
}

/**
 * 跑一次 headless Chrome 取 DOM。
 * **只在"进程起不来"时重试一次**；断言失败**不**重试——重试掩盖不了断言失败。
 */
function dumpDom(chrome: string, args: string[]): string {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return execFileSync(chrome, args, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
      })
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * **回读判据**（独立于页内脚本的第二道）：只吃原始读数重算阈值比较，
 * 与页内派生布尔互为对照；另承担环境回读（视口宽必须等于期望值）。
 * 阈值一律取 `#diag` 回读来的值（`diag.tabsTopMax` 等），不在宿主侧重写常量。
 */
function readbackProblems(diag: Diag, width: number, expectLong: number): string[] {
  const bad: string[] = []
  const g = diag.geom
  if (diag.w !== width) bad.push(`视口宽回读 ${String(diag.w)} ≠ 期望 ${String(width)}（--window-size 未生效，本次全部几何读数作废）`)
  if (g.vh <= 0 || g.vh > WINDOW_HEIGHT) bad.push(`视口高回读 ${String(g.vh)} 不在 (0, ${String(WINDOW_HEIGHT)}] 内（读数越界）`)
  /* A2 回读：溢出只允许来自两个登记源（隐藏后残余必须为 0）；壳自身永不许溢出。 */
  if (diag.a2.overflow && diag.a2.residualAfterHidingRegistered > 1) {
    bad.push(`回读 A2：隐藏登记溢出源后残余 ${String(diag.a2.residualAfterHidingRegistered)}px（未登记的新溢出源）`)
  }
  if (!diag.a2.overflow && diag.doc.sw > diag.doc.cw + 1) bad.push(`回读 A2：documentElement scrollWidth ${String(diag.doc.sw)} > clientWidth ${String(diag.doc.cw)}+1`)
  if (diag.shell.sw > diag.shell.cw + 1) bad.push(`回读 A2：报告壳 scrollWidth ${String(diag.shell.sw)} > clientWidth ${String(diag.shell.cw)}+1`)
  if (g.headTop < 0 || g.headTop >= g.vh) bad.push(`回读 A1：结论头 top ${String(g.headTop)} 不在 [0, ${String(g.vh)})`)
  if (g.bandTop < 0 || g.bandTop >= g.vh) bad.push(`回读 A1：状态带 top ${String(g.bandTop)} 不在 [0, ${String(g.vh)})`)
  if (g.gapsTop < 0 || g.gapsTop >= g.vh) bad.push(`回读 A1：缺口格 top ${String(g.gapsTop)} 不在 [0, ${String(g.vh)})`)
  if (g.actionsTop >= g.vh) bad.push(`回读 A1：操作区 top ${String(g.actionsTop)} ≥ 视口高 ${String(g.vh)}`)
  if (g.tabsTop < 0 || g.tabsTop > diag.tabsTopMax || (width >= 1280 && g.tabsTop >= g.vh)) {
    bad.push(`回读 A1：Tab 栏 top ${String(g.tabsTop)} 越界（视口高 ${String(g.vh)}，本档上限 ${String(diag.tabsTopMax)}${width < 1280 ? '，900 档不强制落视口内（状态带单列是已确认设计）' : ''}）`)
  }
  if (g.headH > g.vh) bad.push(`回读 A1：结论头整块高 ${String(g.headH)} > 视口高 ${String(g.vh)}`)
  if (g.bandH > g.vh) bad.push(`回读 A1：状态带整块高 ${String(g.bandH)} > 视口高 ${String(g.vh)}`)
  if (g.commentsH > diag.commentListMaxH) bad.push(`回读 A1：评论列表整块高 ${String(g.commentsH)} > 上限 ${String(diag.commentListMaxH)}`)
  if (g.commentRows > diag.commentRenderLimit) bad.push(`回读 A1：评论渲染 ${String(g.commentRows)} 行 > 上限 ${String(diag.commentRenderLimit)}`)
  if (g.commentLong !== expectLong) bad.push(`回读 A1：超长系统日志收纳 ${String(g.commentLong)} 行 ≠ 期望 ${String(expectLong)}（data-comment-long 没打上）`)
  if (g.progressCellH > diag.bandCellMaxH) bad.push(`回读 A6：progress 格 ${String(g.progressCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (g.gapsCellH > diag.bandCellMaxH) bad.push(`回读 A6：gaps 格 ${String(g.gapsCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (g.outcomeCellH > diag.bandCellMaxH) bad.push(`回读 A6：outcome 格 ${String(g.outcomeCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (diag.bandCellHs.some(h => h > diag.bandCellMaxH)) bad.push(`回读 A6：状态带单格最高 ${String(Math.max(...diag.bandCellHs))}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (diag.a1.tabCount !== 7) bad.push(`回读 A1：Tab 栏渲染 ${String(diag.a1.tabCount)} 个 ≠ 7（7a43：新增验收 Tab）`)
  if (diag.verifyTabIndex1Based !== VERIFY_TAB_INDEX_1BASED) bad.push(`回读 A1：verifyTabIndex1Based=${String(diag.verifyTabIndex1Based)} ≠ ${String(VERIFY_TAB_INDEX_1BASED)}（T-1 位次）`)
  if (diag.a4.hostCount !== 1) bad.push(`回读 A4：面板包装器 ${String(diag.a4.hostCount)} 个 ≠ 1`)

  /* ── A7~A12：**只吃原始读数**再复算一遍阈值 ── */
  const ay = diag.a11y
  if (ay.focus.rows.length === 0) bad.push('回读 A7：焦点环一个控件都没量到（空集不能算过）')
  for (const r of ay.focus.rows) {
    if (r.w < 2) bad.push(`回读 A7：${r.sel} outline 宽 ${String(r.w)}px < 2px`)
    if (r.style !== 'solid') bad.push(`回读 A7：${r.sel} outline 样式 ${r.style} ≠ solid`)
    if (r.off !== '-2px' && r.off !== '2px') bad.push(`回读 A7：${r.sel} outline-offset ${r.off} 不在两档内`)
    if (r.contrast < 3) bad.push(`回读 A7：${r.sel} 环色对比 ${String(r.contrast)}:1 < 3:1`)
  }
  if (ay.target.count === 0) bad.push('回读 A8：一个交互目标都没量到（空集不能算过）')
  for (const t of ay.target.sized) {
    bad.push(`回读 A8：${t.tag}.${t.cls} 命中区 ${String(t.w)}×${String(t.h)}px < 24×24（未登记例外）`)
  }
  if (ay.target.verdictLabelMinH !== null && ay.target.verdictLabelMinH < 24) {
    bad.push(`回读 A8：裁决单选 label 最小高 ${String(ay.target.verdictLabelMinH)}px < 24px`)
  }
  for (const a of ay.adjacent.bad) {
    if (a.gap < ay.adjacent.min) bad.push(`回读 A8：相邻目标间距 ${String(a.gap)}px < ${String(ay.adjacent.min)}px（${a.a} | ${a.b}）`)
  }
  const histSizes = Object.keys(ay.font.hist).map(Number)
  if (histSizes.length > 0) {
    const minSize = Math.min(...histSizes)
    if (minSize < FONT_MIN) bad.push(`回读 A9：可见真文字最小字号 ${String(minSize)}px < ${String(FONT_MIN)}px`)
    for (const s of histSizes) {
      if (ay.font.scale.indexOf(s) < 0 && ay.font.offScale.some(o => o.startsWith(String(s) + 'px'))) {
        bad.push(`回读 A9：阶梯外字号 ${String(s)}px（允许集合 ${ay.font.scale.join('/')}，登记豁免除外）`)
      }
    }
  } else {
    bad.push('回读 A9：一个真文字元素都没量到（空集不能算过）')
  }
  if (ay.motion.reduceOn) {
    for (const r of ay.motion.rows) {
      if (r.dur !== '0s') bad.push(`回读 A10：reduced-motion 下 ${r.sel} transitionDuration ${r.dur} ≠ 0s`)
    }
  }
  for (const b of ay.marks.bad) bad.push('回读 A11：' + b)
  const hr = ay.hier.report
  if (hr.h1Ratio < 1.4) bad.push(`回读 A12：H1 页标题÷正文 = ${String(hr.h1Ratio)} < 1.4（FR-1：19px ÷ 13px）`)
  if (width >= 1280 && hr.gridCols !== 2) bad.push(`回读 A12：H2 汇报网格 1280 档应为 2 列，实得 ${String(hr.gridCols)}`)
  if (width < 1280 && hr.gridCols > 1) bad.push(`回读 A12：H2 汇报网格 900 档应为单列，实得 ${String(hr.gridCols)}`)
  if (hr.accentSamples.length >= 2 && hr.accentKinds > 1) bad.push(`回读 A12：H5 主色文字 ${String(hr.accentKinds)} 类 > 1`)
  if (hr.bandLevels.length > 0 && hr.bandLevels.length < 3) bad.push(`回读 A12：H4 状态带字号档数 ${String(hr.bandLevels.length)} < 3`)
  const t12 = ay.hier.t12
  if (!t12.rhTop || !t12.rhTitle) bad.push('回读 T-12：头部三层缺标识行/标题行')
  if (width >= 1280 && t12.rowRight > 0 && Math.abs(t12.actionsRight - t12.rowRight) > t12.rightTol) bad.push(`回读 T-12：操作区右缘 ${String(t12.actionsRight)} ≠ 标题行右缘 ${String(t12.rowRight)}（容差 ${String(t12.rightTol)}px，FR-1 聚合右端）`)
  if (width >= 1280 && t12.actionTops.length > 1) bad.push(`回读 T-12：操作区按钮 ${String(t12.actionTops.length)} 行 > 1 行（1280 档同一行）`)
  if (t12.bannerExpected !== t12.bannerPresent) bad.push(`回读 T-12：闸门提示条在场性 ${String(t12.bannerPresent)} ≠ 期望 ${String(t12.bannerExpected)}`)
  for (const b of ay.hier.bad) bad.push('回读 A12：' + b)
  return bad
}

/**
 * 浏览器落点：**显式覆盖优先，且不许静默回退**（CHROME_BIN 指错 = 环境错 → 响亮 exit 2）。
 */
function resolveChrome(): { chrome?: string; why?: string } {
  const env = process.env.CHROME_BIN
  if (env !== undefined && env.length > 0) {
    return existsSync(env)
      ? { chrome: env }
      : { why: `CHROME_BIN 指向的路径不存在：${env}（显式覆盖不许静默回退到本机浏览器）` }
  }
  const found = findChrome()
  return found === undefined
    ? { why: '本机候选路径里没有 Chrome（CHROME_BIN 也未设置）' }
    : { chrome: found }
}

function main(): void {
  const resolved = resolveChrome()
  const chrome = resolved.chrome
  if (chrome === undefined) {
    console.error(`PROBE FAIL（环境不可用，退出码 2）：${resolved.why ?? '找不到 Chrome'}。`)
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    process.exit(2)
  }

  const dir = mkdtempSync(join(tmpdir(), 'pm-req-report-probe-'))
  const failures: string[] = []
  /** Chrome 进程本身起不来的次数（与"断言不过"分开计：全起不来 = 环境不可用 → 退出码 2）。 */
  let spawnFailures = 0
  let firstSpawnError = ''
  let diagOk = 0
  let passed = 0
  /** 四观测量复测留档（T-19：tabsTop / headHeight / bandHeight / verifyTabIndex1Based）。 */
  const observables: string[] = []

  for (const state of STATES) {
    for (const width of WIDTHS) {
      const expectLong = state.key === 'inflight' ? 1 : 0
      const page = join(dir, `${String(width)}-${state.key}.html`)
      writeFileSync(page, specimenHtml(width, state.key, expectLong))

      let diag: Diag | undefined
      try {
        const dom = dumpDom(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
          '--no-first-run', '--no-default-browser-check',
          `--window-size=${String(width)},${String(WINDOW_HEIGHT)}`, '--dump-dom', `file://${page}`,
        ])
        diag = parseDiag(dom)
      } catch (e) {
        spawnFailures++
        if (firstSpawnError.length === 0) firstSpawnError = (e as Error).message.split('\n')[0]!.slice(0, 200)
        failures.push(`w=${String(width)} ${state.label}：Chrome 调用失败（${firstSpawnError}）`)
        continue
      }
      if (diag === undefined) {
        failures.push(`w=${String(width)} ${state.label}：未读到 #diag（标本页脚本未执行？）`)
        continue
      }
      diagOk++

      const tag = `[w=${String(diag.w)} · ${state.label}]`
      console.log(tag)
      observables.push(`w=${String(diag.w)} ${state.key}：tabsTop=${String(diag.geom.tabsTop)} headHeight=${String(diag.geom.headH)} bandHeight=${String(diag.geom.bandH)} verifyTabIndex1Based=${String(diag.verifyTabIndex1Based)}`)

      // A1：四问落点（逐条可读）
      const a1 = diag.a1
      line(`A1 首屏四问可答：是什么 head=${yn(a1.head)} 标题非空=${yn(a1.title)}`
        + ` ｜ 到哪了 band=${yn(a1.band)} 进度格=${yn(a1.progress)} 阶段条=${yn(a1.dots)}`
        + ` ｜ 卡在哪·缺什么 gaps 格=${yn(a1.gaps)}${a1.gapsNone ? '(无缺口正向结论)' : '(缺口清单)'}`
        + ` ｜ Tab 栏=${yn(a1.tabs)}（${String(a1.tabCount)} 个同级 Tab，验收在第 ${String(diag.verifyTabIndex1Based)} 位）`)
      line(`     Tab 次序：[${diag.tabOrder.join(' < ')}]（期望 trunk < docs < dag < dialogue < verify < token < prompts）`)
      line(`     首屏几何（L0 判定集 = 结论头 / 操作区 / 状态带）：head@${String(diag.geom.headTop)}`
        + `(内=${yn(diag.geom.headInFold)}) actions@${String(diag.geom.actionsTop)}(内=${yn(diag.geom.actionsInFold)})`
        + ` band@${String(diag.geom.bandTop)}(内=${yn(diag.geom.bandInFold)})`
        + ` gaps@${String(diag.geom.gapsTop)}(内=${yn(diag.geom.gapsInFold)})，视口高 ${String(diag.geom.vh)}`
        + ` → L0 首屏全落点可见=${yn(diag.geom.foldOk)}`)
      line(`A1 首屏：Tab 栏@${String(diag.geom.tabsTop)} ≤ 本档上限 ${String(diag.tabsTopMax)} 且落在视口内`
        + `(${String(diag.geom.vh)}px) → ${yn(diag.geom.tabsInFold)}`
        + `${diag.w < 1280 ? '（900 档上限 = 713 + 2×220：状态带单列是已确认设计，见 TABS_TOP_MAX_900）' : ''}`)
      line(`A1 首屏：评论列表整块高 ${String(diag.geom.commentsH)}px ≤ 上限 ${String(diag.commentListMaxH)}px → `
        + `${yn(diag.geom.commentsH <= diag.commentListMaxH)}`
        + ` ｜ 渲染 ${String(diag.geom.commentRows)} 行 ≤ ${String(diag.commentRenderLimit)} 行 → `
        + `${yn(diag.geom.commentRows <= diag.commentRenderLimit)}`
        + ` ｜ 超长系统日志收纳 ${String(diag.geom.commentLong)} 行（data-comment-long）`)
      line(`     分量高度（硬判据：头部/状态带 ≤ 视口高；三格各 ≤ 上限）：`
        + `头部 ${String(diag.geom.headH)}px ≤ ${String(diag.geom.vh)}px → ${yn(diag.geom.headH <= diag.geom.vh)}`
        + `（${diag.geom.headParts.join(' ')}）`
        + ` ｜ 状态带 ${String(diag.geom.bandH)}px ≤ ${String(diag.geom.vh)}px → ${yn(diag.geom.bandH <= diag.geom.vh)}`
        + `（做到哪了 ${String(diag.geom.progressCellH)}px / 缺口 ${String(diag.geom.gapsCellH)}px / 成效 ${String(diag.geom.outcomeCellH)}px，各 ≤ ${String(diag.bandCellMaxH)}px）`)
      line(`T-12 头部三层：标识行=${yn(diag.a11y.hier.t12.rhTop)}（REQ-id=${yn(diag.a11y.hier.t12.cardId)}）`
        + ` ｜ 标题行=${yn(diag.a11y.hier.t12.rhTitle)}，操作区右缘 ${String(diag.a11y.hier.t12.actionsRight)} ≈ 行右缘 ${String(diag.a11y.hier.t12.rowRight)}（1280 档判，按钮 ${String(diag.a11y.hier.t12.actionTops.length)} 行）`
        + ` ｜ 闸门提示条=${diag.a11y.hier.t12.bannerPresent ? '在' : '无'}（期望${diag.a11y.hier.t12.bannerExpected ? '在' : '无'}，锚链=${yn(diag.a11y.hier.t12.bannerAnchor)}）`)
      line(`A5 操作区按钮不重叠：${String(diag.overlaps.length)} 处相交 → ${yn(diag.overlaps.length === 0)}`)

      // A2：横向溢出（**硬判据**，2026-10-07 起不再有"登记源"豁免）
      line(`A2 无横向溢出：documentElement scrollWidth=${String(diag.doc.sw)} vs clientWidth=${String(diag.doc.cw)}`
        + (diag.a2.overflow
          ? ` → 有溢出 ${String(diag.a2.residualAfterHidingRegistered)}px → ${yn(diag.a2.residualAfterHidingRegistered <= 1)}（无登记源豁免）`
          : ' → 无 ✓')
        + ` ｜ 报告壳 scrollWidth=${String(diag.shell.sw)} ≤ clientWidth=${String(diag.shell.cw)}+1 → ${yn(!diag.shellOverflow)}`)
      if (diag.tabsNote.length > 0) line(`     900 档 Tab 栏实测（P2-1 复核口径）：${diag.tabsNote} → ${diag.w < 1280 ? 'sw == cw，**未内溢**（7 枚页签装得下；<660 视口时栏内横滚是 FR-4 的窄档设计）→ 不进 A3 白名单' : '宽档无横滚'}`)

      // A3：无内层滚动容器
      line(`A3 无内层滚动容器：实测带 auto|scroll 的元素 ${String(diag.a3.scanned)} 个，`
        + `其中内容装不下（内层滚动）${String(diag.a3.bad.length)} 个 → ${yn(diag.a3.bad.length === 0)}`
        + ` ｜ 排除 .dsh-pm-detail / [data-dag-wrap] / .dsh-pm-dag-canvas-wrap / .dsh-pm-chat-scroll（460px 对话豁免，D-5/D-7）`)
      for (const b of diag.a3.bad) line(`     内层滚动：${b}`)

      // A4：未激活面板缺席
      line(`A4 未激活面板缺席：只渲染 trunk=${yn(diag.a4.trunkPresent)}，面板包装器 ${String(diag.a4.hostCount)} 个，`
        + `DOM 中出现的未激活面板=[${diag.a4.present.join(', ')}] → ${yn(diag.a4.present.length === 0)}（六键：docs/dag/dialogue/verify/token/prompts）`)

      /* A7~A12：每条打印实测值；失败分支在页内 problems 与宿主回读两处。 */
      const a7 = diag.a11y.focus
      line(`A7 焦点环（${String(a7.rows.length)} 个控件）：环宽 [${uniq(a7.rows.map(r => r.w + 'px')).join(', ')}] ≥ 2px → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.w >= 2))}`
        + ` ｜ 偏移 [${uniq(a7.rows.map(r => r.off)).join(', ')}] ⊆ {-2px, 2px} → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.off === '-2px' || r.off === '2px'))}`
        + ` ｜ 环色与相邻背景最小比 ${String(minOf(a7.rows.map(r => r.contrast)))}:1 ≥ 3:1 → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.contrast >= 3))}`
        + ` ｜ 取样通道：live ${String(a7.via.live)} / cssom 兜底 ${String(a7.via.cssom)}`)
      for (const b of a7.bad) line(`     红：${b}`)
      const a8 = diag.a11y.target
      const a8a = diag.a11y.adjacent
      line(`A8 目标尺寸：${String(a8.count)} 个交互目标，最小命中区 ${String(minOf(a8.rows.map(r => r.w)))}×${String(minOf(a8.rows.map(r => r.h)))}px ≥ 24×24 → ${yn(a8.count > 0 && a8.sized.length === 0)}`
        + ` ｜ 登记例外 ${String(a8.exempt.length)} 处（密集行文本钮 / 裁决 radio→label，逐条理由见脚本常量）`
        + ` ｜ 相邻间距下限 ${String(a8a.min)}px：违例 ${String(a8a.bad.length)} 处，Tab 同组例外 ${String(a8a.exempt.length)} 处 → ${yn(a8a.bad.length === 0)}`)
      for (const b of a8.sized) line(`     不达标：${b.tag}.${b.cls} = ${String(b.w)}×${String(b.h)}px`)
      for (const b of a8a.bad) line(`     间距违例：${String(b.gap)}px（${b.a} | ${b.b}）`)
      const a9 = diag.a11y.font
      line(`A9 可见真文字字号：最小 ${String(a9.min.size)}px（.${a9.min.who}）≥ ${String(FONT_MIN)}px → ${yn(a9.min.size >= FONT_MIN)}`
        + ` ｜ 档位集合 {${Object.keys(a9.hist).sort((x, y) => Number(x) - Number(y)).join(', ')}} ⊆ {${a9.scale.join(', ')}}（7a43 密度新字阶），`
        + `阶梯外 ${String(a9.offScale.length)} 处 → ${yn(a9.offScale.length === 0)}`
        + `${a9.offScaleExempt.length > 0 ? ` ｜ 登记豁免 ${a9.offScaleExempt.join('、')}` : ''}`)
      for (const b of a9.offScale) line(`     阶梯外：${b}`)
      const a10 = diag.a11y.motion
      line(`A10 reduced-motion：本机媒体查询 ${a10.reduceOn ? '成立（reduce）' : '不成立（读数不可得，如实打印不判）'}`
        + ` ｜ 取样 ${String(a10.rows.length)} 个控件的 transitionDuration = [${uniq(a10.rows.map(r => r.dur)).join(', ')}]`
        + ` → ${yn(!a10.reduceOn || a10.rows.every(r => r.dur === '0s'))}`)
      const a11 = diag.a11y.marks
      line(`A11 非颜色标记：阶段点 完成 ${String(a11.rows.completed)}（✓）/ 当前 ${String(a11.rows.current)}（▸）/ 未开始 ${String(a11.rows.todo)}（不带）`
        + ` ｜ 缺口条 文本标记 ${String(a11.rows.gap)} + SVG 圆 ${String(a11.rows.gapSvg)}`
        + ` ｜ 验收结论 ${String(a11.rows.verdict)} 处带可读文字 → ${yn(a11.bad.length === 0)}`)
      for (const b of a11.bad) line(`     红：${b}`)
      const a12 = diag.a11y.hier
      const r12 = a12.report
      line(`A12 视觉层级：H1 ${String(r12.h1)}÷${String(r12.body)} = ${String(r12.h1Ratio)} ≥ 1.4（${yn(r12.h1Ratio >= 1.4)}）`
        + ` ｜ H2 汇报网格 ${String(r12.gridCols)} 列（1280→2 / 900→1，${yn(diag.w >= 1280 ? r12.gridCols === 2 : r12.gridCols <= 1)}）`
        + ` ｜ H3 标题 ${r12.titleFont ?? '—'} vs 正文 ${r12.lineFont ?? '—'} 双通道（${yn((r12.titleFont ?? '') !== (r12.lineFont ?? ''))}）`)
      line(`     H4 状态带字号档 ${JSON.stringify(r12.bandLevels)}（档数 ≥3 / 极差 ≥8 / 主值与次大差 ≥2）`
        + ` ｜ H5 主色文字 ${String(r12.accentKinds)} 类（${r12.accentSamples.map(s => s.role).join(' / ')}）→ ${yn(r12.accentKinds <= 1)}`
        + ` ｜ 激活页签取主色 + 2px 指示条（FR-4）`)
      for (const b of a12.bad) line(`     红：${b}`)
      for (const d of diag.deviations) line(`     已登记偏差：${d}`)

      /* 宿主侧回读判据（只吃原始读数，独立于页内派生布尔）——逐条打印，红时点名具体读数。 */
      const readback = readbackProblems(diag, width, expectLong)
      line(`宿主侧回读判据：视口宽 ${String(diag.w)} == 期望 ${String(width)} → ${yn(diag.w === width)}`
        + ` ｜ 原始读数重算判为失败 ${String(readback.length)} 项 → ${yn(readback.length === 0)}`
        + `（与页内 problems ${String(diag.problems.length)} 项互为对照；红时下面逐条点名）`)
      for (const r of readback) console.error('  - ' + r)

      const ok = diag.problems.length === 0 && readback.length === 0
        && a1.head && a1.title && a1.band && a1.progress && a1.dots && a1.gaps && a1.tabs
        && diag.verifyTabIndex1Based === VERIFY_TAB_INDEX_1BASED
        && !diag.shellOverflow && diag.a2.residualAfterHidingRegistered <= 1
        && diag.a3.bad.length === 0
        && diag.a4.present.length === 0 && diag.a4.hostCount === 1 && diag.a4.trunkPresent
        && diag.geom.foldOk && diag.overlaps.length === 0
        && diag.bandCellHs.every(h => h <= diag.bandCellMaxH)
        && diag.geom.tabsInFold && diag.geom.commentsH <= diag.commentListMaxH
        && diag.geom.commentRows <= diag.commentRenderLimit
        && diag.w === width
        && diag.a11y.focus.bad.length === 0 && diag.a11y.focus.rows.length > 0
        && diag.a11y.target.sized.length === 0 && diag.a11y.target.count > 0
        && diag.a11y.adjacent.bad.length === 0
        && diag.a11y.font.bad.length === 0
        && diag.a11y.motion.bad.length === 0
        && diag.a11y.marks.bad.length === 0
        && diag.a11y.hier.bad.length === 0

      if (ok) {
        passed++
        console.log(`PASS w=${String(diag.w)} state=${state.key}（四问可答 ✓ / 7 Tab 次序 ✓ 验收第 ${String(diag.verifyTabIndex1Based)} 位 ✓ / Tab 栏 top=${String(diag.geom.tabsTop)} ≤ ${String(diag.tabsTopMax)} ✓ / 评论列表 ${String(diag.geom.commentsH)}px ≤ ${String(diag.commentListMaxH)}px ✓ / 横向溢出受控 ✓ / 无内层滚动容器 ✓ / 未激活面板缺席 ✓ / 头部三层 ✓ / 操作区不重叠 ✓）`)
      } else {
        console.error(`FAIL w=${String(width)} state=${state.key}`)
        for (const p of diag.problems) console.error('  - ' + p)
        failures.push(`w=${String(width)} ${state.label}：${diag.problems.concat(readback).join(' | ') || '断言未过'}`)
      }
    }
  }

  /* ═══════════ A13：六个非 trunk 面板补测（含 verify；T-6/T-8/FR-8 面板专属断言） ═══════════ */
  const PANEL_KEYS: PanelSpecimenKey[] = ['docs', 'dag', 'dialogue', 'verify', 'token', 'prompts']
  console.log('')
  console.log('[A13 六块非 trunk 面板补测（1280 档 · 在途；目标尺寸 / 字阶 / 结构位图标 / 内层滚动 / 横向溢出 + 面板专属断言）]')
  let panelFailed = 0
  const deviationNotes: string[] = []
  for (const pk of PANEL_KEYS) {
    const page = join(dir, 'panel-' + pk + '.html')
    writeFileSync(page, specimenShellForPanel(1280, 'inflight', pk, panelA11yScript()))
    let pd: (PanelDiag & { devDocpathMono?: boolean }) | undefined
    try {
      const dom = dumpDom(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check',
        `--window-size=1280,${String(WINDOW_HEIGHT)}`, '--dump-dom', `file://${page}`,
      ])
      const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(dom)
      if (m !== null) {
        const raw = m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        pd = JSON.parse(raw) as PanelDiag & { devDocpathMono?: boolean }
      }
    } catch {
      pd = undefined
    }
    if (pd === undefined) {
      panelFailed++
      failures.push(`A13 面板 ${pk}：拿不到读数（脚本未执行或 Chrome 调用失败）`)
      console.error(`  ${pk}：拿不到读数（脚本未执行）`)
      continue
    }
    for (const n of pd.notes) deviationNotes.push(`${pk}：${n}`)
    const histKeys = Object.keys(pd.font.hist).map(Number).sort((a, b) => a - b)
    const lineText = `  ${pad(pk, 10)}目标 ${String(pd.targets.count)} 个，最小 ${String(pd.targets.minW ?? '—')}×${String(pd.targets.minH ?? '—')}px（登记例外 ${String(pd.targets.exempt.length)} 处）`
      + ` ｜ 字号 {${histKeys.join(', ')}} 最小 ${String(pd.font.min)}px`
      + ` ｜ Tab 图标 ${String(pd.tabIcons)} 个/13px ｜ affordance emoji ${String(pd.emoji.length)} 处`
      + ` ｜ 内层滚动 ${String(pd.scroll.bad.length)} 处（白名单外）｜ 横向溢出 ${pd.docOverflow ? '有' : '无'}`
      + ` ｜ 标记 缺口 ${String(pd.marks.gap)}/${String(pd.marks.gapSvg)} 阶段点 ${String(pd.marks.doneDots)}/${String(pd.marks.curDots)}`
      + ` → ${pd.problems.length === 0 ? 'PASS' : 'FAIL'}`
    if (pd.problems.length === 0) console.log(lineText)
    else {
      panelFailed++
      console.error(lineText)
      for (const p of pd.problems) console.error('     红：' + p)
      failures.push(`A13 面板 ${pk}：${pd.problems.join(' | ')}`)
    }
    for (const n of pd.notes) line(`     注：${n}`)
  }
  if (panelFailed === 0) console.log('  A13 六块面板全部 PASS（含 verify RTM 8 行 / docs T-6 迁移指引 / dialogue T-8~T-10）')

  console.log('')
  console.log('[四观测量复测（T-19；阈值在探针断言里，不进 geometry 块）]')
  for (const o of observables) line(o)

  // 四组合一次都没跑起来 = 环境不可用（不是断言失败）→ 退出码 2，一行可读原因。
  if (diagOk === 0 && spawnFailures > 0) {
    console.error(`PROBE FAIL（环境不可用，退出码 2）：Chrome 起不来（${String(spawnFailures)}/${String(STATES.length * WIDTHS.length)} 组合调用失败）：${firstSpawnError}`)
    console.error('修复：确认 CHROME_BIN / 安装路径可执行且可启动（本机：' + chrome + '）。')
    process.exit(2)
  }

  if (failures.length > 0) {
    console.error('\nPROBE FAIL')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log(`\nPROBE PASS（${String(passed)}/4 组合：1280/900 × 在途 implementing/终态 archived；`
    + '四问可答 / 7 Tab 次序（验收第 5 位）/ Tab 栏 top 分档上限（713 @1280 · 1153 @900）/ 评论列表整块 ≤ 260px /'
    + ' 横向溢出受控（登记源之外零残余）/ 无内层滚动容器（.chat-scroll 视口自适应高 · 唯一豁免）/ 未激活面板缺席（六键）/'
    + ' 头部三层 + 操作区聚合右端 / 状态带三格 ≤ 220px ｜ A13 六面板全过）')
}

function yn(v: boolean): string {
  return v ? '✓' : '✗'
}

/** 去重（打印用：几何读数按档去重后才读得动）。 */
function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs))
}

/** 定宽填充（面板名对齐；中文按两格宽算）。 */
function pad(s: string, width: number): string {
  let out = s
  let len = 0
  for (const ch of s) len += ch.charCodeAt(0) > 0x2e80 ? 2 : 1
  while (len < width) { out += ' '; len++ }
  return out
}

/** 最小值（空数组返回 '—'；打印用，不参与判据）。 */
function minOf(xs: number[]): number | string {
  return xs.length === 0 ? '—' : Math.min(...xs)
}

main()
