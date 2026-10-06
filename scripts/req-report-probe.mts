/**
 * 需求详情页「工作汇报」渲染探针（REQ-261004222448-292a · 卡 t-98684c）。
 *
 * 为什么需要它：壳与六个面板的静态断言（`match(/data-panel=/)` 这类）只能证明「字符串里有这回事」，
 * 证明不了「渲染出来真的四问可答 / 真的没有内层滚动条 / 未激活面板真的不在 DOM」。
 * 布局与可视性缺陷只有真实渲染判定得出来，所以这里照 `scripts/list-responsive-probe.mts` 的骨架：
 * 真实 `buildReportShell` + 真实 CSS 拼出标本页 → headless Chrome `--dump-dom` → 读 `#diag` 判定。
 *
 * 四组合：宽度 1280 / 900 × 状态 在途（implementing，有缺口有任务）/ 终态（archived，只读）。
 * 每组合四条断言，**逐条打印可读行**：
 *   A1 首屏四问可答：是什么 = `[data-report-head]`（含非空标题）；到哪了 = `[data-report-band]`
 *      的 `[data-band-cell="progress"]`（阶段条 `.dsh-pm-progress-dots` 亦须在场）；
 *      卡在哪 / 缺什么 = `[data-band-cell="gaps"]` 非空（「无缺口」也是答）；六个同级 Tab = `[data-report-tabs]`。
 *      「在首屏内」的判定集照 design/test-cases.md 的探针行与 architecture.md 的 L0 定义
 *      （**结论头 / 操作条 / 状态带**），即这三者的落点 `top` 必须落在视口高度内（不滚动可见）。
 *      **Tab 栏的位置是硬判据**（`tabsTop ≤ 713`，2026-10 缺陷修复后追加）：缺陷现场是
 *      线上真数据把 Tab 栏顶到 top=1118（视口 713）→ 首屏看不到六个 Tab。旧口径按
 *      design/test-cases.md 只判 L0 三块、Tab 栏只打印，于是这处"进不去"的缺陷一路绿灯。
 *      判据升级的理由：Tab 栏是六块内容的**唯一入口**，首屏看不到它 = 六块都读不到，
 *      这比"落点差几个像素"严重得多。对应地，评论列表整块高度也设上限（≤ 260px）：
 *      它是被顶爆的现场，且**不许**用 max-height / 内层滚动达标（A3 会同时判红）。
 *   A2 无横向溢出：`documentElement.scrollWidth <= clientWidth + 1`（卡原文口径）；
 *      **另加**报告壳自身同判据——因为 `.dsh-pm-detail` 计算 `overflow-x:auto`（见 A3 的例外），
 *      横向溢出会被它自己吃掉、不冒泡到 documentElement，只查 documentElement 会永远绿（假绿防线）。
 *   A3 无内层滚动容器（口径已勘误，**不做 CSS 文本 grep**——那会误伤合法例外）：
 *      真 DOM 实测，报告壳内不存在「`scrollHeight > clientHeight + 2 || scrollWidth > clientWidth + 2`
 *      且计算样式 `overflow-y|overflow-x ∈ {auto, scroll}`」的元素。
 *      显式排除两处合法例外（自身命中即跳过）：
 *        · `.dsh-pm-detail`（页面级滚动容器，`base.ts` 里就是 `overflow-y:auto`）
 *        · `[data-dag-wrap]` / `.dsh-pm-dag-canvas-wrap`（DAG 画布视口，`dag.ts` 里本就是 `overflow:auto; max-height:640px`）
 *      `overflow: hidden` **不算**内层滚动（不进 `{auto, scroll}` 集合，不误报）。
 *   A4 未激活面板缺席：默认只渲染 `trunk`；`[data-panel="token"|"docs"|"dag"|"dialogue"|"prompts"]`
 *      在真 DOM 里必须查不到（不是查字符串）。
 *   A5 操作条按钮不重叠：包围盒两两不相交（design/test-cases.md 对窄 900 档的第二条断言）。
 *   A6 操作条版式（**仅 1280 档**，2026-10-05 人类验收「排版散架」后追加）：整块高 ≤ 72px，
 *      且动作按钮 `offsetTop` 只有一个取值（同一行）；状态带三格各自 ≤ 220px
 *      （格内每条只给「项名 + 状态」，全文进 title）。900 档不判——那档动作区折行是宽度使然。
 *
 * **判据必须硬（REQ-261005105032-3b02 · t-ed8a64 · 验收标准 8）**：上面每个几何量都**不是**
 * "打印出来给人看"而已——两条独立判据同时守它：
 *   ① 页内脚本对每个量给出 `problems.push(...)` 失败分支（判据与读数同一处计算，避免两套真相）；
 *   ② 宿主侧 `readbackProblems()` **只吃原始读数**重算一遍阈值比较（页内派生布尔出错/漏注入时它红），
 *      并承担环境回读：**实际视口宽必须等于 `--window-size` 的期望值**（不等 = 参数没生效，
 *      本次全部几何读数作废 → 直接判失败，不许照旧 PASS）；视口高越界同理。
 * `tests/probe-hard-criteria.test.ts` 用源码级扫描守住"只打印不判"的复发（命中数必须为 0）。
 *
 * 用法：npx tsx scripts/req-report-probe.mts
 * 退出码：0 = 四组合全过；1 = 有断言失败；2 = 环境不可用（找不到 Chrome **或** Chrome 四组合全起不来），
 * 响亮失败、不静默跳过（两种红的处置完全不同：一个去装浏览器，一个去看页面）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 评论列表的渲染上限（条数）从**渲染层**取，避免探针自己写一份会漂移的常量
import { COMMENT_RENDER_LIMIT } from '../src/client/views/report-head.js'
// 标本（数据 + 真实壳拼页 + 全量 CSS + Chrome 落点）抽到共享模块：出图脚本
// `scripts/req-detail-ui-shot.mts` 吃同一份标本，避免两份会漂移的 mock 数据。
// **判据仍在本文件**（阈值常量 + 页内断言脚本），共享模块不含任何断言。
import {
  INACTIVE_PANEL_KEYS, STATES, WIDTHS, WINDOW_HEIGHT, findChrome, specimenShell, specimenShellForPanel,
  type PanelSpecimenKey, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

/**
 * Tab 栏 top 的**硬上限**（px）= headless 下 800 档实测视口高 713（见 WINDOW_HEIGHT 的口径说明）。
 *
 * 为什么它从"只打印的诊断"升成硬判据：缺陷修复后（REQ-261004222448-292a 验收现场）
 * 线上真数据曾把 Tab 栏顶到 top=1118 → **首屏看不到六个 Tab**，而这处缺陷在旧判据下
 * 一路绿灯（旧口径认为"L0 首屏不含 Tab 栏"，故只打印）。第一屏看不见入口，等于六块内容
 * 都进不去——这就是"看不到"的缺陷，必须判红，否则它会再次悄悄退回去。
 */
const TABS_TOP_MAX = 713

/**
 * 评论列表容器（`data-comment-list`）的**整块高度上限**（px）。
 *
 * 与 TABS_TOP_MAX 同源：台账里一条机器转储就 11,157 字，评论列表是"顶爆首屏"的现场。
 * 它**不许**用限高/内层滚动解决（FR-11 #7），只能靠"少渲染几条 + 截断正文 + 压紧行距"，
 * 所以探针量的是**整块高度**——限高就会在这里露馅（同时 A3 的内层滚动判据也会红）。
 */
const COMMENT_LIST_MAX_H = 260

/**
 * 操作条（`data-report-actionbar`）在 **1280 档**的整块高度上限（px）+ 按钮行数上限（1 行）。
 *
 * 来源：2026-10-05 人类验收「操作条排版散架」——`← 看板 ｜ 本阶段操作 ｜ 验收通过并归档
 * [需人操作] 后果：…` 挤第一行、`退回返工` 第二行、`取消需求` 第三行，每个按钮后面还跟着
 * 一段 inline 的「后果：…」。修法是把「标签 ｜ 按钮区 ｜ 需人操作标」分成三个并列项、
 * 后果移到按钮下方（见 `report-head.ts#buildReportActionBar`）。
 *
 * 判据两条，**都只在 1280 档**判（900 档动作区本来就会折行——宽度不够，判它会逼着把按钮
 * 缩到不可读）：
 *  ① 整块高度 ≤ 本值（一条 ≈ 按钮 27px + 后果一行 15px + 上下内边距 16px ≈ 58px，留足余量）；
 *  ② 动作按钮**只有一行**（`offsetTop` 只有一个取值）——"参差"正是多行且不等宽造成的。
 */
const ACTION_BAR_MAX_H = 72

/**
 * 状态带**单格**在 1280 档的高度上限（px）。
 *
 * 来源：2026-10-05 人类验收——三格把「验收标准原文 + 意见」整段塞进小格再截断，
 * 读出来是"半句 + …"，且把首屏吃掉。口径改成格内每条只给「项名 + 状态」（≤1 行），
 * 全文（what ｜ why ｜ 出处）进 `title`，逐项正文去它自己的落点（条款/门禁、『文档』Tab 的验收单）。
 */
const BAND_CELL_MAX_H = 220

/**
 * 一件标本页 = 共享模块 `specimenShell(...)`（真实壳 HTML + 真实 CSS + 真实宿主类
 * `.dsh-pm-view` 外框）**+ 本文件自己的页内断言脚本**（写法照 `list-responsive-probe.mts`）。
 *
 * 拼页逻辑与标本数据在 `./fixtures/req-detail-specimen.mts`（出图脚本吃同一份，避免漂移）；
 * **断言留在这里**：阈值常量、页内脚本、`#diag` 判定与退出码都是本文件的职责。
 * 断言脚本作为 `bodyScript` 原样插在壳之后；`specimenShell` 不给 title 时用探针口径的标题，
 * 故本文件拼出的 HTML 与抽取前一字不差（重跑输出逐行可比）。
 */
function specimenHtml(width: number, state: SpecimenState, expectLong: number): string {
  return specimenShell(width, state, `<script>
(function () {
  /* 合法例外：自身命中即跳过（不用 closest——那会把例外元素的**后代**也一并放过，
     而我们要扫的恰恰是壳内部还有没有别的滚动容器）。 */
  var EXCEPTIONS = '.dsh-pm-detail, [data-dag-wrap], .dsh-pm-dag-canvas-wrap';
  var INACTIVE = ${JSON.stringify(INACTIVE_PANEL_KEYS)};
  var problems = [];
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
  var tabCount = tabs === null ? 0 : tabs.querySelectorAll('.dsh-pm-tab').length;
  var a1 = {
    head: head !== null,
    title: txt(title).length > 0,
    band: band !== null,
    progress: txt(progress).length > 0,
    gaps: gaps !== null && txt(gaps).length > 0,
    gapsNone: gaps !== null && gaps.querySelector('[data-gaps="none"]') !== null,
    dots: dots !== null,
    tabs: tabs !== null && tabCount === 6,
    tabCount: tabCount
  };
  if (!a1.head) problems.push('A1 是什么：缺少 [data-report-head]');
  if (a1.head && !a1.title) problems.push('A1 是什么：头部标题为空');
  if (!a1.band) problems.push('A1 到哪了：缺少 [data-report-band]');
  if (a1.band && !a1.progress) problems.push('A1 到哪了：状态带 progress 格无文案');
  if (!a1.dots) problems.push('A1 到哪了：头部阶段条 .dsh-pm-progress-dots 不在场');
  if (!a1.gaps) problems.push('A1 卡在哪：状态带 gaps 格缺失或为空（无缺口时也该有一行正向结论）');
  if (!a1.tabs) problems.push('A1 Tab 栏：六个同级 Tab 未渲染全（实得 ' + String(tabCount) + '）');

  /* ── A2 无横向溢出 ─────────────────────────────────────────── */
  var docBox = { cw: de.clientWidth, sw: de.scrollWidth };
  var shellBox = shell === null ? { cw: 0, sw: 0 } : { cw: shell.clientWidth, sw: shell.scrollWidth };
  var docOverflow = docBox.sw > docBox.cw + 1;
  var shellOverflow = shell !== null && shellBox.sw > shellBox.cw + 1;
  if (docOverflow) problems.push('A2 横向溢出：documentElement scrollWidth ' + String(docBox.sw) + ' 大于 clientWidth ' + String(docBox.cw));
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

  /* ── 几何：L0 首屏判定集（结论头 / 操作条 / 状态带）落点是否在视口内 ──
     判据 = 不滚动即可见其落点（top 在 [0, vh)）。为什么不要求整个元素都在视口内：
     「一屏内能找到落点」正是卡与设计的措辞，而状态带三格本身可以比一屏更高（5 条缺口），
     要求整块可见等于要求"缺口不许超过 2 条"，与 FR-4「首屏放前 3~5 条」自相矛盾。 */
  var vh = de.clientHeight;
  var TABS_TOP_MAX = ${String(TABS_TOP_MAX)};
  var COMMENT_LIST_MAX_H = ${String(COMMENT_LIST_MAX_H)};
  var COMMENT_RENDER_LIMIT = ${String(COMMENT_RENDER_LIMIT)};
  var EXPECT_LONG = ${String(expectLong)};
  var ACTION_BAR_MAX_H = ${String(ACTION_BAR_MAX_H)};
  var BAND_CELL_MAX_H = ${String(BAND_CELL_MAX_H)};
  function hOf(el) { return el === null ? 0 : Math.round(el.getBoundingClientRect().height); }
  /* 评论列表容器（data-comment-list）：它是"头部长日志把 Tab 顶出首屏"那处缺陷的现场。
     量它的**整块高度**（不设限高、不做内层滚动，所以只能靠内容控制）并设硬上限 COMMENT_MAX_H。
     容器的子元素高度明细也一并量：要压的时候得知道压的是哪一块。 */
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
  /* 终态没有操作条（FR-3：终态只读，不留假出口）→ 那就没有可判的落点，不算失败。 */
  geom.actionsInFold = actions === null ? true : inFold(geom.actionsTop);
  geom.foldOk = geom.headInFold && geom.bandInFold && geom.gapsInFold && geom.actionsInFold;
  /* Tab 栏进首屏：**硬判据**（缺陷修复：线上真数据曾顶到 1118，首屏看不到六个 Tab）。
     口径 = 落在视口内（top < vh）且不超上限 TABS_TOP_MAX（=713，即实测视口高）。 */
  geom.tabsInFold = inFold(geom.tabsTop) && geom.tabsTop <= TABS_TOP_MAX;
  if (!geom.tabsInFold) {
    problems.push('A1 首屏：Tab 栏不在首屏内（top ' + String(geom.tabsTop) + ' > 上限 ' + String(TABS_TOP_MAX)
      + '，视口高 ' + String(vh) + '）——六个 Tab 是六块内容的唯一入口，首屏看不到它等于都进不去');
  }
  /* 评论列表：整块高度上限（不许靠限高/内层滚动达标）+ 条数上限 + 长日志必须被收纳 */
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
  if (!geom.actionsInFold) problems.push('A1 首屏：操作条不在首屏内（top ' + String(geom.actionsTop) + '，视口高 ' + String(vh) + '）');
  if (!geom.bandInFold) problems.push('A1 首屏：状态带不在首屏内（top ' + String(geom.bandTop) + '，视口高 ' + String(vh) + '）');
  if (!geom.gapsInFold) problems.push('A1 首屏：缺口格不在首屏内（top ' + String(geom.gapsTop) + '，视口高 ' + String(vh) + '）');
  /* 头部 / 状态带**整块高度** ≤ 视口高：落点"在首屏内"只能证明**起点**可读，
     整块高于视口时它仍然一屏读不完（滚到下一屏才看得到尾）。这两块此前只在 [诊断] 行里打印
     （"只打印不判失败"的典型）——现在升为硬判据：它们的整块高度也是首屏可用性的判据。 */
  if (geom.headH > vh) problems.push('A1 首屏：结论头整块高 ' + String(geom.headH) + 'px > 视口高 ' + String(vh) + 'px（一屏读不完头部）');
  if (geom.bandH > vh) problems.push('A1 首屏：状态带整块高 ' + String(geom.bandH) + 'px > 视口高 ' + String(vh) + 'px（一屏读不完状态带）');
  /* 状态带三格**各自**的高度上限：与窗口宽无关（格内每条只给「项名 + 状态」是内容口径，
     宽度只影响换行，不能成为"这格可以撑爆"的理由）——故不再只判 1280 档的最大值。 */
  if (geom.progressCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：progress 格高 ' + String(geom.progressCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px（做到哪了那格被内容撑爆）');
  if (geom.gapsCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：gaps 格高 ' + String(geom.gapsCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px（卡在哪·缺什么那格被内容撑爆）');
  if (geom.outcomeCellH > BAND_CELL_MAX_H) problems.push('A6 状态带：outcome 格高 ' + String(geom.outcomeCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H) + 'px（成效那格被内容撑爆）');

  /* ── 操作条按钮不重叠（design/test-cases.md 窄 900 档的第二条断言）── */
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
  if (overlaps.length > 0) problems.push('A5 操作条按钮重叠：' + overlaps.join(' ; '));

  /* ── A6 操作条版式（2026-10-05 人类验收：三行参差 / 后果 inline 跟随）── */
  var bar = shell === null ? null : shell.querySelector('[data-report-actionbar]');
  var barH = hOf(bar);
  var actionTops = [];
  if (bar !== null) {
    var actionBtns = bar.querySelectorAll('.dsh-pm-report-action > .dsh-pm-btn');
    for (var ab = 0; ab < actionBtns.length; ab++) {
      var at = Math.round(actionBtns[ab].offsetTop);
      if (actionTops.indexOf(at) < 0) actionTops.push(at);
    }
  }
  /* 只看 1280 档：900 档动作区折行是宽度使然（见 ACTION_BAR_MAX_H 注释） */
  var barJudged = bar !== null && de.clientWidth >= 1280;
  if (barJudged && barH > ACTION_BAR_MAX_H) {
    problems.push('A6 操作条：1280 档整块高 ' + String(barH) + 'px > 上限 ' + String(ACTION_BAR_MAX_H)
      + 'px（标签 / 按钮 / 后果不许挤成同一个文本流，后果应落在按钮下方一行）');
  }
  if (barJudged && actionTops.length > 1) {
    problems.push('A6 操作条：1280 档动作按钮落在 ' + String(actionTops.length) + ' 行（offsetTop=' + actionTops.join(',')
      + '），要求同一行——参差就是"第一个按钮跟标签挤一行、其余各自换行"');
  }
  /* 状态带三格：1280 档每格 ≤ BAND_CELL_MAX_H（口径见常量注释）。
     三格等高等宽由 grid 保证（stretch），这里只判"有没有被内容撑爆"。 */
  var bandTops = [];
  var bandCellHs = [];
  if (band !== null) {
    var bandCells = band.querySelectorAll('[data-band-cell]');
    for (var bc = 0; bc < bandCells.length; bc++) {
      bandCellHs.push(Math.round(bandCells[bc].getBoundingClientRect().height));
      var bt = Math.round(bandCells[bc].offsetTop);
      if (bandTops.indexOf(bt) < 0) bandTops.push(bt);
    }
  }
  var maxBandCellH = bandCellHs.length === 0 ? 0 : Math.max.apply(null, bandCellHs);
  var bandJudged = band !== null && de.clientWidth >= 1280;
  if (bandJudged && maxBandCellH > BAND_CELL_MAX_H) {
    problems.push('A6 状态带：1280 档单格最高 ' + String(maxBandCellH) + 'px > 上限 ' + String(BAND_CELL_MAX_H)
      + 'px（格内每条只给「项名 + 状态」，全文进 title，逐项正文去它自己的落点）');
  }
  if (bandJudged && bandTops.length > 1) {
    problems.push('A6 状态带：1280 档三格不在同一行（offsetTop=' + bandTops.join(',') + '）');
  }

  /* ═══════════════ A7~A12：可访问性与视觉层级（REQ-261005155003-f32f） ═══════════════
     判据来源：requirement.md 的 FR-2（焦点可见）/ FR-5（目标尺寸）/ FR-7（最小字号）/
     FR-6（reduced-motion）/ FR-8（不靠颜色）/ FR-12（H1~H5）/ FR-9 第 7 项（D-8 头部两行）。
     每条都在下面 give problems.push 失败分支；宿主侧 readbackProblems() 另按原始读数复算一遍。 */

  /* 颜色解析：**不用正则**——这段脚本嵌在 TS 模板字符串里，反斜杠转义会在拼接时被吃掉，
     产出的正则跟源码里写的不是同一个（本卡实测：环色对比一度全是 NaN）。按括号切分最稳。 */
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
  /* 元素背后的**有效背景**：向上找第一个不透明底色，并把半透明层逐层合成。
     includeSelf=false 用于"环画在元素外"（outline-offset >= 0）——那时相邻色是**父级**背景，
     拿元素自己的底色去比会得到"主按钮蓝底 vs 蓝环 1:1"的假红。 */
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

  /* ── D-8 的三处落点必须在**任何 focus() 之前**量 ──
     focus() 会把被聚焦元素滚进视口，之后 getBoundingClientRect().top 是滚动后的坐标
     （本卡实测一度量到 actionRowTop = -504，把"动作行在身份行之上"判成红）。 */
  var d8 = { actionRowTop: topOf(shell === null ? null : shell.querySelector('[data-report-actionbar]')), identityRowTop: topOf(shell === null ? null : shell.querySelector('.dsh-pm-rh-top')) };
  var d8Window = shell === null ? null : shell.querySelector('.dsh-pm-report-windows');
  var d8Created = shell === null ? null : shell.querySelector('[data-created-at]');
  d8.windowLeft = d8Window === null ? null : Math.round(d8Window.getBoundingClientRect().left);
  d8.createdAtLeft = d8Created === null ? null : Math.round(d8Created.getBoundingClientRect().left);
  if (d8.actionRowTop >= 0 && d8.identityRowTop >= 0) d8.gap = d8.identityRowTop - d8.actionRowTop;

  /* ── A7 焦点环：清单控件 focus() 后量 outline 宽 / 样式 / 偏移 / 环色对比 ──
     为什么**不**派发合成键盘事件：本卡实测，合成一个 keydown（key = Tab）会让 Chrome 把随后的
     focus() 判成「非键盘来源」、:focus-visible 反而不置位（四组合全红）。直接 el.focus()
     （不 blur、不合成事件）才是稳定的置位路径——这与「真实键盘走查」的差别如实登记在
     下方每行的 fv 读数里：探针量到的是 :focus-visible 置位后的计算样式。 */
  var FOCUS_SELECTORS = ['.dsh-pm-btn', '.dsh-pm-tab', '.dsh-pm-window', '.dsh-pm-input', '.dsh-pm-trunk-open', 'summary'];
  var focusRows = [];
  var focusBad = [];
  /* 兜底通道：把「会命中本元素的 :focus-visible 规则」的声明读出来、解析 var() 后按同一套阈值判。
     为什么需要兜底：headless 里 el.focus() 之后 :focus-visible 是否置位**不稳定**（本卡实测：
     同一份标本、同一台机器、四个组合各跑一次，置位的组合每次都不一样）。判据本身不能因此变松——
     兜底读到的是**同一条规则声明的取值**（宽 / 样式 / 偏移 / 颜色），按同一套阈值判；
     只是"由浏览器在键盘聚焦时施加"这一步在本机拿不到稳定读数，故每行都标注取样通道（live / cssom）。 */
  /** 顶层逗号切分（括号 / 方括号内的逗号**不**切）——:is(a, b) 里的逗号切了会把选择器拆碎，
      实测后果：主焦点环规则的选择器被切碎后 el.matches() 抛错、整条规则被漏掉（终态四组合全红）。 */
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
          if (vi < 0) continue;   /* 同一规则里"不带 :focus-visible 的那一半"不能算命中（会造出假绿） */
          var base = (sel.slice(0, vi) + sel.slice(vi + 14)).trim();
          if (base.length === 0) continue;
          var hit = false;
          try { hit = el.matches(base); } catch (err2) { hit = false; }
          if (!hit) continue;
          for (var k = 0; k < st.length; k++) decls.push([st[k], st.getPropertyValue(st[k])]);
          /* Chrome 的 CSSStyleDeclaration 对规则**只枚举长写属性**，且简写派生的那三条是**空串**；
             简写的真实取值只能显式 getPropertyValue('outline') 取（本卡实测：只枚举会得到
             outline-width/style/color 三个空串 + 一条 outline-offset，整条焦点环判据量不到）。 */
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
  /** 逐层解 var()（自定义属性从**壳**上读；定义就写在壳的选择器里）。 */
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
  /** 从声明里拼出焦点环四要素（宽 / 样式 / 偏移 / 颜色）；读不到返回 null。 */
  function focusRingFromRules(el) {
    var decls = focusDeclsFor(el);
    if (decls.length === 0) return null;
    var map = {};
    for (var i = 0; i < decls.length; i++) {
      /* 只认**非空**值：Chrome 会把 outline 简写展开成 outline-width/-style/-color 三个**空串**条目，
         照单全收会把简写解析出来的三个值统统覆盖成空（实测：整条判据全是 none / NaN）。 */
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
  /** 任意 css 颜色文本 → RGB（十六进制或 rgb()/rgba()；alpha 合成到白底）。 */
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
  /** RGB -> 可读文本（打印与断言文案用）。 */
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
     例外清单**显式写在这里**（逐条给理由，不用"宽泛豁免"糊过去）：
       · Tab 与 Tab 相邻 4px：同属一个 tablist 的成组目标，每个 Tab 高 33px ≥ 24×24 本身达标；
         WCAG 2.5.8 对"同组内相邻目标"有 spacing 例外，本需求 t-0d8c9b 卡上已裁定把
         Tab 栏 4px 进例外清单（原型同值）。除它以外不允许出现第二类例外。
       · 正文内联链接（WCAG 的 inline 例外）：本标本的 .dsh-pm-trunk-open 是**独立一行**的
         链接式按钮（不是夹在句子里的行内链接），故**不**给它豁免——它必须自己达标。 */
  var TARGET_SELECTOR = 'button, [role="tab"], a[href], summary, input';
  var targetEls = document.querySelectorAll(TARGET_SELECTOR);
  var targetRows = [];
  var targetSized = [];
  var targetBad = [];
  for (var ti = 0; ti < targetEls.length; ti++) {
    var tEl = targetEls[ti];
    var tBox = tEl.getBoundingClientRect();
    if (tBox.width === 0 && tBox.height === 0) continue;   /* 不在页面上（未激活面板等）不算目标 */
    var rec = { cls: String(tEl.className).slice(0, 48), tag: tEl.tagName.toLowerCase(), w: round2(tBox.width), h: round2(tBox.height) };
    targetRows.push(rec);
    if (tBox.width < 24 || tBox.height < 24) {
      targetSized.push(rec);
      targetBad.push('A8 命中区 ' + rec.tag + '.' + rec.cls + ' = ' + String(rec.w) + '×' + String(rec.h) + 'px < 24×24');
    }
  }
  if (targetRows.length === 0) targetBad.push('A8 一个交互目标都没量到（空集不能算过）');
  var ADJACENT_MIN = 8;
  var adjacentRows = [];
  var adjacentBad = [];
  var adjacentExempt = [];
  for (var ai = 0; ai < targetEls.length; ai++) {
    for (var bi = ai + 1; bi < targetEls.length; bi++) {
      var ra = targetEls[ai].getBoundingClientRect();
      var rb = targetEls[bi].getBoundingClientRect();
      if ((ra.width === 0 && ra.height === 0) || (rb.width === 0 && rb.height === 0)) continue;
      var overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapY <= Math.min(ra.height, rb.height) * 0.5) continue;   /* 不同行不算相邻 */
      var gap = ra.left < rb.left ? rb.left - ra.right : ra.left - rb.right;
      if (gap < -0.5) { adjacentBad.push('A8 目标重叠（gap ' + String(round2(gap)) + 'px）'); continue; }
      if (gap >= ADJACENT_MIN) continue;
      var bothTab = targetEls[ai].classList.contains('dsh-pm-tab') && targetEls[bi].classList.contains('dsh-pm-tab');
      var row = { gap: round2(gap), a: String(targetEls[ai].className).slice(0, 32), b: String(targetEls[bi].className).slice(0, 32) };
      if (bothTab) adjacentExempt.push(row);
      else { adjacentRows.push(row); adjacentBad.push('A8 相邻目标间距 ' + String(row.gap) + 'px < ' + String(ADJACENT_MIN) + 'px（' + row.a + ' | ' + row.b + '）'); }
    }
  }

  /* ── A9 最小字号与档位（FR-7）──
     口径：**可见真文字**（有直接文本子节点、且不是 1px 裁切的 sr-only）。
     为什么必须排除 sr-only：FR-11 让主操作后果改走 aria-describedby 指向的视觉隐藏节点，
     它的字号不参与"看得见的字"这条判据（要求文档 FR-7 锚点已点名这个坑）。 */
  var FONT_SCALE = [11, 12, 13, 15, 20, 24];
  var fontHist = {};
  var offScale = [];
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
    if (eBox.width <= 1 && eBox.height <= 1) continue;       /* sr-only（1px 裁切）/ 不可见 */
    if (ecs.visibility === 'hidden' || ecs.display === 'none') continue;
    var eSize = parseFloat(ecs.fontSize);
    var key = String(eSize);
    fontHist[key] = (fontHist[key] || 0) + 1;
    if (eSize < minFont.size) minFont = { size: eSize, who: String(eEl.className).slice(0, 40) };
    if (FONT_SCALE.indexOf(eSize) < 0 && offScale.length < 8) offScale.push(String(eSize) + 'px @ .' + String(eEl.className).slice(0, 40));
  }
  var fontBad = [];
  if (minFont.size < 11) fontBad.push('A9 可见真文字最小字号 ' + String(minFont.size) + 'px < 11px（.' + minFont.who + '）');
  if (offScale.length > 0) fontBad.push('A9 出现阶梯外字号（' + FONT_SCALE.join('/') + '）：' + offScale.join(' ; '));

  /* ── A10 reduced-motion（FR-6 #4）──
     本机 headless 的 prefers-reduced-motion 恒为 reduce（要求文档「已知覆盖边界 2」已登记
     --force-prefers-reduced-motion=no-preference 压不住）→ 这里**只在媒体查询成立时**判「过渡归零」，
     不成立时如实打印"读数不可得"，不假装判过、也不冤枉页面。 */
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

  /* ── A11 状态不靠颜色单一表达（FR-8）：非颜色标记必须是**真实内容** ── */
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

  /* ── A12 视觉层级 H1~H5 + D-8 头部两行 ── */
  var hBad = [];
  var hReport = {};
  var h1El = document.querySelector('h1.dsh-pm-detail-title');
  var shellFs = shell === null ? 0 : parseFloat(getComputedStyle(shell).fontSize);
  var h1Fs = h1El === null ? 0 : parseFloat(getComputedStyle(h1El).fontSize);
  hReport.h1 = h1Fs; hReport.body = shellFs; hReport.h1Ratio = shellFs > 0 ? round2(h1Fs / shellFs) : 0;
  if (!(hReport.h1Ratio >= 1.8)) hBad.push('A12 H1 页标题÷正文 = ' + String(hReport.h1Ratio) + ' < 1.8');
  var trunkItems = shell === null ? [] : shell.querySelectorAll('.dsh-pm-trunk-item');
  var moduleGap = null, innerGap = null;
  if (trunkItems.length >= 2) moduleGap = Math.round(trunkItems[1].getBoundingClientRect().top - trunkItems[0].getBoundingClientRect().bottom);
  var tTitle = document.querySelector('.dsh-pm-trunk-title');
  var tLine = document.querySelector('.dsh-pm-trunk-line');
  if (tTitle !== null && tLine !== null) innerGap = Math.round(tLine.getBoundingClientRect().top - tTitle.getBoundingClientRect().bottom);
  hReport.moduleGap = moduleGap; hReport.innerGap = innerGap;
  hReport.moduleRatio = (moduleGap !== null && innerGap !== null && innerGap > 0) ? round2(moduleGap / innerGap) : 0;
  if (!(hReport.moduleRatio >= 3)) hBad.push('A12 H2 模块间距÷模块内间距 = ' + String(hReport.moduleRatio) + ' < 3（分组靠间距比，1.x 等于没分组）');
  if (tTitle !== null && tLine !== null) {
    var tcsA = getComputedStyle(tTitle), tcsB = getComputedStyle(tLine);
    hReport.titleFont = tcsA.fontSize + '/' + tcsA.fontWeight;
    hReport.lineFont = tcsB.fontSize + '/' + tcsB.fontWeight;
    if (tcsA.fontSize === tcsB.fontSize || tcsA.fontWeight === tcsB.fontWeight) {
      hBad.push('A12 H3 模块标题与正文必须是**双通道**差异（字号与字重都不同），实得 ' + hReport.titleFont + ' vs ' + hReport.lineFont);
    }
  } else {
    hBad.push('A12 H3 量不到模块标题/正文（选择器与页面脱节）');
  }
  /* H4：状态带内的字号档数。要求文档写「三档且两两差 ≥2px」，而 design/frontend.md §C-6 把这三档
     定死为「标签 L5 11 / 主值 L1 20 / 细节 L4 12」——11 与 12 只差 1px，**要求文档那句自相矛盾**。
     判据按权威值执行：档数 ≥3、极差 ≥8px、主值（最大值）与次大值差 ≥2px，
     并把"下两档相差 1px"**打印出来登记**（不静默）。 */
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
  /* H5：主色文字只留一类——**承载主色的那几处**必须取同一个值，不许分裂成"面用亮、字用深"。
     采样口径 2026-10-05 改准（不是因为红了才改，是口径本来就和设计契约打架）：
       设计契约（原型 v2 改造层 ⑦）明确写「选中 = 白色滑块 + 500 字重 + **正文字色**」——
       选中页签**本来就不该用主色**。旧口径把它当主色角色采样，量的其实是"正文色 ≠ 主色"，恒红；
       真去满足它，就得反过来违背已确认的分段控件设计。故：
         · 采样改为真正承载主色的两处：「点开看原文」（主色文字）+ §焦点环§（主色环）；
         · 并把"选中页签**不再**取主色"落成**正面断言**（下面那条），比原来更严——
           原来只能发现"页签的主色和别的角色不一样"，现在能发现"页签又偷偷用回主色了"。
       （主操作按钮取的是它的**底色**，不是文字色，故仍不列入。） */
  var accentSamples = [];
  var activeTab = document.querySelector('.dsh-pm-tab.active');
  var trunkOpen = document.querySelector('.dsh-pm-trunk-open');
  if (trunkOpen !== null) accentSamples.push({ role: '点开看原文', color: getComputedStyle(trunkOpen).color });
  if (focusRows.length > 0) accentSamples.push({ role: '焦点环', color: focusRows[0].color });
  var accentDistinct = {};
  for (var as = 0; as < accentSamples.length; as++) accentDistinct[accentSamples[as].color] = 1;
  hReport.accentSamples = accentSamples;
  hReport.accentKinds = Object.keys(accentDistinct).length;
  if (accentSamples.length >= 2 && hReport.accentKinds > 1) {
    hBad.push('A12 H5 主色文字出现 ' + String(hReport.accentKinds) + ' 类取值（' + accentSamples.map(function (s) { return s.role + '=' + s.color; }).join(' / ') + '），要求 ≤1');
  }
  /* H5 正面断言（设计契约 ⑦）：选中页签取**正文字色**，与主色不同；相同即"偷偷用回主色"。 */
  if (activeTab !== null) {
    var tabColor = getComputedStyle(activeTab).color;
    var tabBg = getComputedStyle(activeTab).backgroundColor;
    var accentColor = trunkOpen !== null ? getComputedStyle(trunkOpen).color : null;
    if (accentColor !== null && tabColor === accentColor) {
      hBad.push('A12 H5 选中页签仍取主色（' + tabColor + '）——设计契约 ⑦ 要求取正文字色（白滑块 + 500 字重 + 正文字色）');
    }
    if (!(tabBg === 'rgb(255, 255, 255)')) {
      hBad.push('A12 H5 选中页签不是白色滑块（背景 ' + tabBg + '）——设计契约 ⑦ 的分段控件选中态');
    }
  }
  /* D-8（FR-9 第 7 项 / 裁定 A）：动作行在身份行**之上**且两行真拆开；窗口组在「创建于」左侧。
     落点已在脚本开头（focus 之前）量好，这里只判。 */
  if (d8.actionRowTop >= 0 && d8.identityRowTop >= 0) {
    if (!(d8.actionRowTop < d8.identityRowTop)) hBad.push('A12 D-8 动作行必须在身份行之上：动作 ' + String(d8.actionRowTop) + ' 身份 ' + String(d8.identityRowTop));
    if (!(d8.gap >= 8)) hBad.push('A12 D-8 两行 top 差 ' + String(d8.gap) + 'px < 8px（没真拆开）');
  } else {
    hBad.push('A12 D-8 量不到动作行/身份行（选择器与页面脱节）');
  }
  if (d8.windowLeft !== null && d8.createdAtLeft !== null && !(d8.windowLeft < d8.createdAtLeft)) {
    hBad.push('A12 D-8 窗口组必须靠左（在「创建于 …」左侧）：窗口 ' + String(d8.windowLeft) + ' ≥ 创建于 ' + String(d8.createdAtLeft));
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
    target: { rows: targetRows, sized: targetSized, count: targetRows.length },
    adjacent: { bad: adjacentRows, exempt: adjacentExempt, min: ADJACENT_MIN },
    font: { hist: fontHist, min: minFont, offScale: offScale, scale: FONT_SCALE, bad: fontBad },
    motion: { reduceOn: reduceOn, rows: durRows, bad: durBad },
    marks: { rows: markRows, bad: markBad },
    hier: { report: hReport, d8: d8, bad: hBad }
  };

  var diag = document.createElement('div');
  diag.id = 'diag';
  diag.textContent = JSON.stringify({
    w: de.clientWidth, state: ${JSON.stringify(state)}, vh: vh,
    doc: docBox, shell: shellBox, docOverflow: docOverflow, shellOverflow: shellOverflow,
    a1: a1, geom: geom, a3: { scanned: scanned, bad: bad }, overlaps: overlaps,
    tabsTopMax: TABS_TOP_MAX, commentListMaxH: COMMENT_LIST_MAX_H, commentRenderLimit: COMMENT_RENDER_LIMIT,
    barH: barH, actionTops: actionTops, actionBarMaxH: ACTION_BAR_MAX_H, barJudged: barJudged,
    bandCellHs: bandCellHs, bandCellMaxH: BAND_CELL_MAX_H, bandJudged: bandJudged,
    a4: { present: present, hostCount: hostCount, trunkPresent: trunkPresent },
    a11y: a11y,
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
    foldOk: boolean; tabsInFold: boolean
  }
  tabsTopMax: number
  commentListMaxH: number
  commentRenderLimit: number
  barH: number
  actionTops: number[]
  actionBarMaxH: number
  barJudged: boolean
  bandCellHs: number[]
  bandCellMaxH: number
  bandJudged: boolean
  a3: { scanned: number; bad: string[] }
  overlaps: string[]
  a4: { present: string[]; hostCount: number; trunkPresent: boolean }
  a11y: {
    focus: { rows: { sel: string; w: number; style: string; off: string; color: string; contrast: number; via: string; fv: boolean }[]; bad: string[]; via: { live: number; cssom: number } }
    target: { rows: { cls: string; tag: string; w: number; h: number }[]; sized: { cls: string; tag: string; w: number; h: number }[]; count: number }
    adjacent: { bad: { gap: number; a: string; b: string }[]; exempt: { gap: number; a: string; b: string }[]; min: number }
    font: { hist: Record<string, number>; min: { size: number; who: string }; offScale: string[]; scale: number[]; bad: string[] }
    motion: { reduceOn: boolean; rows: { sel: string; dur: string }[]; bad: string[] }
    marks: { rows: { completed: number; current: number; todo: number; gap: number; gapSvg: number; verdict: number }; bad: string[] }
    hier: {
      report: {
        h1: number; body: number; h1Ratio: number; moduleGap: number | null; innerGap: number | null
        moduleRatio: number; titleFont?: string; lineFont?: string; bandLevels: number[]
        accentSamples: { role: string; color: string }[]; accentKinds: number
      }
      d8: { actionRowTop: number; identityRowTop: number; windowLeft: number | null; createdAtLeft: number | null; gap?: number }
      bad: string[]
    }
  }
  problems: string[]
}

/** A13 的单面板读数（页内脚本交回来的原始数，判据在宿主侧）。 */
interface PanelDiag {
  panel: string
  targets: { count: number; minW: number | null; minH: number | null; small: string[] }
  font: { hist: Record<string, number>; min: number; who: string; off: string[]; scale: number[] }
  emoji: string[]
  readings: string[]
  tabIcons: number
  marks: { gap: number; gapSvg: number; doneDots: number, curDots: number }
  problems: string[]
}

/**
 * A13 的页内脚本：量**这一块面板**自己的三件事（FR-5 目标尺寸 / FR-7 字阶 / FR-1 结构位图标）。
 *
 * 为什么要单独一块：权威原型只渲染了 `trunk`（要求文档「原型与实测 · 已知覆盖边界 1」如实登记过），
 * 其余五块（docs / dag / dialogue / token / prompts）的目标尺寸、字号档与结构位 emoji **从未被量过**——
 * "没验过"不等于"通过了"。这一段把五块补齐，逐块打印实测行。
 *
 * emoji 判据的例外（照 FR-1 的明文排除）：状态符号（✅ / ⚠️ / ⏳ / 🔁）是 FR-8 要求的
 * "颜色之外的第二判据"，**不算**结构图标；只有它们之外的表情符号才判红。
 */
function panelA11yScript(): string {
  return `<script>
(function () {
  var problems = [];
  var shell = document.querySelector('[data-report-shell]');
  var out = {
    targets: { count: 0, minW: null, minH: null, small: [] },
    font: { hist: {}, min: 999, who: '', off: [], scale: [11, 12, 13, 15, 20, 24] },
    emoji: [],
    readings: [],
    tabIcons: 0,
    marks: { gap: 0, gapSvg: 0, doneDots: 0, curDots: 0 },
    problems: problems
  };
  if (shell === null) { problems.push('A13 壳不在场'); var d0 = document.createElement('div'); d0.id = 'diag'; d0.textContent = JSON.stringify(out); document.body.appendChild(d0); return; }
  /* ① 目标尺寸（与 A8 同一套口径：≥24×24，隐藏目标不计） */
  var targets = shell.querySelectorAll('button, [role="tab"], a[href], summary, input');
  var minW = 1e9, minH = 1e9;
  for (var ti = 0; ti < targets.length; ti++) {
    var b = targets[ti].getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    out.targets.count++;
    if (b.width < minW) minW = b.width;
    if (b.height < minH) minH = b.height;
    if (b.width < 24 || b.height < 24) out.targets.small.push(String(targets[ti].className).slice(0, 36) + '=' + String(Math.round(b.width * 10) / 10) + 'x' + String(Math.round(b.height * 10) / 10));
  }
  out.targets.minW = out.targets.count === 0 ? null : Math.round(minW * 10) / 10;
  out.targets.minH = out.targets.count === 0 ? null : Math.round(minH * 10) / 10;
  if (out.targets.count === 0) problems.push('A13 目标尺寸：一个交互目标都没量到（空集不能算过）');
  for (var s = 0; s < out.targets.small.length; s++) problems.push('A13 命中区 ' + out.targets.small[s] + ' < 24x24');
  /* ② 字阶（与 A9 同一套口径：可见真文字、排除 1px 裁切的 sr-only） */
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
    if (out.font.scale.indexOf(fs) < 0 && out.font.off.length < 6) out.font.off.push(String(fs) + 'px @ .' + String(el.className).slice(0, 36));
  }
  if (out.font.min < 11) problems.push('A13 可见真文字最小字号 ' + String(out.font.min) + 'px < 11px（.' + out.font.who + '）');
  for (var o = 0; o < out.font.off.length; o++) problems.push('A13 阶梯外字号 ' + out.font.off[o]);
  /* ③ 结构位 emoji（例外：状态符号，见函数注释） */
  /* 例外（照 FR-1 的明文排除 + FR-8 的"颜色之外的第二判据"）：
     ✅ 成功/通过/无缺口 · ⚠️ 警告 · ⏳ 验收进行中 · 🔁 退回返工 · ✓ 完成阶段点 · ▸ 当前阶段点 ·
     ✖/✔ 文档与验收结论符号 · 💡 一句话结论前缀 · 🤖 下一步前缀。
     这些都不是"结构图标"（不承担导航/affordance），换掉它们反而破坏 FR-8 与既有文案。
     用码点写而不是字面量：字面量在模板字符串里容易与转义混淆（本卡踩过）。 */
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
          /* "结构图标"的口径（FR-1）：**承担 affordance 的图标**——按钮 / Tab 的文字前导
             或 Tab 图标位。只有它们判红；其余（章节标题里的符号、共享模块里的阶段标签）
             逐块**打印**并登记为本次边界外的已知问题（共享模块同时被老详情页使用，改它要人裁）。 */
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
  /* ①b Tab 图标硬判据（FR-1 锚点）：每个 Tab 恰 1 个内联 SVG、尺寸 14±1 */
  var tabIcons = shell.querySelectorAll('.dsh-pm-tab-icon');
  for (var tb = 0; tb < tabIcons.length; tb++) {
    var svgs = tabIcons[tb].querySelectorAll('svg');
    if (svgs.length !== 1) { problems.push('A13 Tab 图标应恰 1 个内联 SVG，实得 ' + String(svgs.length)); continue; }
    var ir = svgs[0].getBoundingClientRect();
    if (Math.abs(ir.width - 14) > 1 || Math.abs(ir.height - 14) > 1) problems.push('A13 Tab 图标尺寸 ' + String(Math.round(ir.width * 10) / 10) + 'x' + String(Math.round(ir.height * 10) / 10) + 'px 不在 14±1');
  }
  out.tabIcons = tabIcons.length;
  if (tabIcons.length !== 6) problems.push('A13 Tab 图标位应 6 个，实得 ' + String(tabIcons.length));
  /* ④ 非颜色标记（FR-8）：面板里若出现缺口条/阶段条，标记同样要在 */
  out.marks.gap = shell.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-mark').length;
  out.marks.gapSvg = shell.querySelectorAll('.dsh-pm-gap-line .dsh-pm-gap-sev > svg').length;
  out.marks.doneDots = shell.querySelectorAll('.dsh-pm-dot-wrapper.completed .dsh-pm-dot-mark').length;
  out.marks.curDots = shell.querySelectorAll('.dsh-pm-dot-wrapper.current .dsh-pm-dot-mark').length;
  var d = document.createElement('div'); d.id = 'diag'; d.textContent = JSON.stringify(out);
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
 *
 * **只在"进程起不来"时重试一次**：本机 / CI 上并行跑多个 headless Chrome 时偶发启动失败
 * （本卡实测碰到过一次：同一份标本前三组合都过、第四组合 spawn 失败）。一次重试把
 * 「环境抖动」与「页面真的坏了」分开；断言失败**不**重试——重试掩盖不了断言失败，只会让红的日志变长。
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
 * **回读判据**（独立于页内脚本的第二道）。
 *
 * 为什么在页内已经判过之后还要在宿主侧再判一遍：页内脚本交回来的是**派生布尔**
 * （`docOverflow` / `tabsInFold` / `foldOk`…）与**原始读数**两套。只信派生布尔 = 判据的
 * 真相落在被注入页面的字符串里，出错（改坏、漏注入、旧产物）时宿主侧一片绿。
 * 这里**只吃原始读数**重算一遍阈值比较——与页内脚本互为对照：
 *   · 页内布尔与这里的重算不一致 = 注入/回读链路有问题（本函数的失败就是这条）；
 *   · 页内脚本整段没执行 = `#diag` 读不到，更早一步就红了。
 *
 * 另外承担卡面点名的两条**环境回读**：① 实际视口宽必须等于 `--window-size` 的期望值
 * （不相等 = 参数没生效，量出来的几何量全是错的 → 必须报错，不许照旧判 PASS）；
 * ② 视口高必须 >0 且不超过请求的窗高（读数越界 = 环境异常）。
 *
 * 阈值一律取 `#diag` 回读来的值（`diag.tabsTopMax` 等），不在宿主侧重写常量——
 * 否则探针里会出现第二份会漂移的阈值。
 */
function readbackProblems(diag: Diag, width: number, expectLong: number): string[] {
  const bad: string[] = []
  const g = diag.geom
  if (diag.w !== width) bad.push(`视口宽回读 ${String(diag.w)} ≠ 期望 ${String(width)}（--window-size 未生效，本次全部几何读数作废）`)
  if (g.vh <= 0 || g.vh > WINDOW_HEIGHT) bad.push(`视口高回读 ${String(g.vh)} 不在 (0, ${String(WINDOW_HEIGHT)}] 内（读数越界）`)
  if (diag.doc.sw > diag.doc.cw + 1) bad.push(`回读 A2：documentElement scrollWidth ${String(diag.doc.sw)} > clientWidth ${String(diag.doc.cw)}+1`)
  if (diag.shell.sw > diag.shell.cw + 1) bad.push(`回读 A2：报告壳 scrollWidth ${String(diag.shell.sw)} > clientWidth ${String(diag.shell.cw)}+1`)
  if (g.headTop < 0 || g.headTop >= g.vh) bad.push(`回读 A1：结论头 top ${String(g.headTop)} 不在 [0, ${String(g.vh)})`)
  if (g.bandTop < 0 || g.bandTop >= g.vh) bad.push(`回读 A1：状态带 top ${String(g.bandTop)} 不在 [0, ${String(g.vh)})`)
  if (g.gapsTop < 0 || g.gapsTop >= g.vh) bad.push(`回读 A1：缺口格 top ${String(g.gapsTop)} 不在 [0, ${String(g.vh)})`)
  /* 终态没有操作条（top = -1）→ 没有可判的落点；只有 >=0 时才判它在首屏内。 */
  if (g.actionsTop >= g.vh) bad.push(`回读 A1：操作条 top ${String(g.actionsTop)} ≥ 视口高 ${String(g.vh)}`)
  if (g.tabsTop < 0 || g.tabsTop >= g.vh || g.tabsTop > diag.tabsTopMax) bad.push(`回读 A1：Tab 栏 top ${String(g.tabsTop)} 越界（视口高 ${String(g.vh)}，上限 ${String(diag.tabsTopMax)}）`)
  if (g.headH > g.vh) bad.push(`回读 A1：结论头整块高 ${String(g.headH)} > 视口高 ${String(g.vh)}`)
  if (g.bandH > g.vh) bad.push(`回读 A1：状态带整块高 ${String(g.bandH)} > 视口高 ${String(g.vh)}`)
  if (g.commentsH > diag.commentListMaxH) bad.push(`回读 A1：评论列表整块高 ${String(g.commentsH)} > 上限 ${String(diag.commentListMaxH)}`)
  if (g.commentRows > diag.commentRenderLimit) bad.push(`回读 A1：评论渲染 ${String(g.commentRows)} 行 > 上限 ${String(diag.commentRenderLimit)}`)
  if (g.commentLong !== expectLong) bad.push(`回读 A1：超长系统日志收纳 ${String(g.commentLong)} 行 ≠ 期望 ${String(expectLong)}（data-comment-long 没打上）`)
  if (g.progressCellH > diag.bandCellMaxH) bad.push(`回读 A6：progress 格 ${String(g.progressCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (g.gapsCellH > diag.bandCellMaxH) bad.push(`回读 A6：gaps 格 ${String(g.gapsCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (g.outcomeCellH > diag.bandCellMaxH) bad.push(`回读 A6：outcome 格 ${String(g.outcomeCellH)}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (diag.barJudged && diag.barH > diag.actionBarMaxH) bad.push(`回读 A6：操作条整块 ${String(diag.barH)}px > 上限 ${String(diag.actionBarMaxH)}px`)
  if (diag.barJudged && diag.actionTops.length > 1) bad.push(`回读 A6：动作按钮落在 ${String(diag.actionTops.length)} 行（offsetTop=[${diag.actionTops.join(', ')}]）`)
  if (diag.bandJudged && diag.bandCellHs.some(h => h > diag.bandCellMaxH)) bad.push(`回读 A6：状态带单格最高 ${String(Math.max(...diag.bandCellHs))}px > 上限 ${String(diag.bandCellMaxH)}px`)
  if (diag.a1.tabCount !== 6) bad.push(`回读 A1：Tab 栏渲染 ${String(diag.a1.tabCount)} 个 ≠ 6`)
  if (diag.a4.hostCount !== 1) bad.push(`回读 A4：面板包装器 ${String(diag.a4.hostCount)} 个 ≠ 1`)

  /* ── A7~A12（REQ-261005155003-f32f）：**只吃原始读数**再复算一遍阈值 ──
     页内脚本已经判过一次（`problems`），这里再做一次是防"注入/派生布尔出错"的假绿：
     下面每一条都从 `a11y` 的读数重算，而不是直接信页内那串 bad 文案。 */
  const ay = diag.a11y
  if (ay.focus.rows.length === 0) bad.push('回读 A7：焦点环一个控件都没量到（空集不能算过）')
  for (const r of ay.focus.rows) {
    if (r.w < 2) bad.push(`回读 A7：${r.sel} outline 宽 ${String(r.w)}px < 2px`)
    if (r.style !== 'solid') bad.push(`回读 A7：${r.sel} outline 样式 ${r.style} ≠ solid`)
    if (r.off !== '-2px' && r.off !== '2px') bad.push(`回读 A7：${r.sel} outline-offset ${r.off} 不在两档内`)
    if (r.contrast < 3) bad.push(`回读 A7：${r.sel} 环色对比 ${String(r.contrast)}:1 < 3:1`)
  }
  if (ay.target.count === 0) bad.push('回读 A8：一个交互目标都没量到（空集不能算过）')
  for (const t of ay.target.rows) {
    if (t.w < 24 || t.h < 24) bad.push(`回读 A8：${t.tag}.${t.cls} 命中区 ${String(t.w)}×${String(t.h)}px < 24×24`)
  }
  for (const a of ay.adjacent.bad) {
    if (a.gap < ay.adjacent.min) bad.push(`回读 A8：相邻目标间距 ${String(a.gap)}px < ${String(ay.adjacent.min)}px（${a.a} | ${a.b}）`)
  }
  const histSizes = Object.keys(ay.font.hist).map(Number)
  if (histSizes.length > 0) {
    const minSize = Math.min(...histSizes)
    if (minSize < 11) bad.push(`回读 A9：可见真文字最小字号 ${String(minSize)}px < 11px`)
    for (const s of histSizes) {
      if (ay.font.scale.indexOf(s) < 0) bad.push(`回读 A9：阶梯外字号 ${String(s)}px（允许集合 ${ay.font.scale.join('/')}）`)
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
  if (hr.h1Ratio < 1.8) bad.push(`回读 A12：H1 页标题÷正文 = ${String(hr.h1Ratio)} < 1.8`)
  if (hr.moduleRatio < 3) bad.push(`回读 A12：H2 模块间距÷模块内间距 = ${String(hr.moduleRatio)} < 3`)
  if (hr.accentSamples.length >= 2 && hr.accentKinds > 1) bad.push(`回读 A12：H5 主色文字 ${String(hr.accentKinds)} 类 > 1`)
  if (hr.bandLevels.length > 0 && hr.bandLevels.length < 3) bad.push(`回读 A12：H4 状态带字号档数 ${String(hr.bandLevels.length)} < 3`)
  for (const b of ay.hier.bad) bad.push('回读 A12：' + b)
  return bad
}

/**
 * 浏览器落点：**显式覆盖优先，且不许静默回退**。
 *
 * 为什么不能直接用共享标本模块的 `findChrome()`：它的语义是"候选列表里挑第一个存在的"，
 * 于是 `CHROME_BIN=/nonexistent` 这种**写错的显式覆盖**会被静默忽略、回退到本机 Chrome，
 * 探针照样绿——"环境不可用 → exit 2"这条判据就永远演示不出来；更糟的是 CI 上可能因为
 * "机器上恰好装了另一个 Chrome"而**量错浏览器**却报 PASS（假绿）。
 * 显式设了 `CHROME_BIN` 就以它为准：路径不存在 = 环境错 → 响亮 exit 2，不退到别处。
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
        // Chrome 的报错含整条命令行（很长），只留首行——「一行可读原因」。
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

      // A1：四问落点（逐条可读）
      const a1 = diag.a1
      line(`A1 首屏四问可答：是什么 head=${yn(a1.head)} 标题非空=${yn(a1.title)}`
        + ` ｜ 到哪了 band=${yn(a1.band)} 进度格=${yn(a1.progress)} 阶段条=${yn(a1.dots)}`
        + ` ｜ 卡在哪·缺什么 gaps 格=${yn(a1.gaps)}${a1.gapsNone ? '(无缺口正向结论)' : '(缺口清单)'}`
        + ` ｜ Tab 栏=${yn(a1.tabs)}（${String(a1.tabCount)} 个同级 Tab）`)
      line(`     首屏几何（L0 判定集 = 结论头 / 操作条 / 状态带）：head@${String(diag.geom.headTop)}`
        + `(内=${yn(diag.geom.headInFold)}) actions@${String(diag.geom.actionsTop)}(内=${yn(diag.geom.actionsInFold)})`
        + ` band@${String(diag.geom.bandTop)}(内=${yn(diag.geom.bandInFold)})`
        + ` gaps@${String(diag.geom.gapsTop)}(内=${yn(diag.geom.gapsInFold)})，视口高 ${String(diag.geom.vh)}`
        + ` → L0 首屏全落点可见=${yn(diag.geom.foldOk)}`)
      line(`A1 首屏：Tab 栏@${String(diag.geom.tabsTop)} ≤ 上限 ${String(diag.tabsTopMax)} 且落在视口内`
        + `(${String(diag.geom.vh)}px) → ${yn(diag.geom.tabsInFold)}（**硬判据**：首屏看不到六个 Tab 就是"进不去"）`)
      line(`A1 首屏：评论列表整块高 ${String(diag.geom.commentsH)}px ≤ 上限 ${String(diag.commentListMaxH)}px → `
        + `${yn(diag.geom.commentsH <= diag.commentListMaxH)}`
        + ` ｜ 渲染 ${String(diag.geom.commentRows)} 行 ≤ ${String(diag.commentRenderLimit)} 行 → `
        + `${yn(diag.geom.commentRows <= diag.commentRenderLimit)}`
        + ` ｜ 超长系统日志收纳 ${String(diag.geom.commentLong)} 行（data-comment-long）`)
      /* 分量高度**同时是判据**（不是"只打印的诊断行"）：每格都带 yn 判读，
         判据本体在页内脚本的 problems.push 分支（此处只是把同一条判据可读地呈现出来，
         不复写阈值——阈值一律取回读值，保证判据只有一处真相）。 */
      line(`     分量高度（硬判据：头部/状态带 ≤ 视口高；三格各 ≤ 上限）：`
        + `头部 ${String(diag.geom.headH)}px ≤ ${String(diag.geom.vh)}px → ${yn(diag.geom.headH <= diag.geom.vh)}`
        + `（${diag.geom.headParts.join(' ')}）`
        + ` ｜ 状态带 ${String(diag.geom.bandH)}px ≤ ${String(diag.geom.vh)}px → ${yn(diag.geom.bandH <= diag.geom.vh)}`
        + `（做到哪了 ${String(diag.geom.progressCellH)}px → ${yn(diag.geom.progressCellH <= diag.bandCellMaxH)}`
        + ` / 缺口 ${String(diag.geom.gapsCellH)}px → ${yn(diag.geom.gapsCellH <= diag.bandCellMaxH)}`
        + ` / 成效 ${String(diag.geom.outcomeCellH)}px → ${yn(diag.geom.outcomeCellH <= diag.bandCellMaxH)}）`)
      line(`A5 操作条按钮不重叠：${String(0)} 处相交 → ${yn(diag.overlaps.length === 0)}（窄档 design/test-cases.md 要求）`)
      line(`A6 操作条版式（1280 档硬判据）：整块高 ${String(diag.barH)}px ≤ 上限 ${String(diag.actionBarMaxH)}px → `
        + `${yn(!diag.barJudged || diag.barH <= diag.actionBarMaxH)}`
        + ` ｜ 动作按钮 ${String(diag.actionTops.length)} 行（offsetTop=[${diag.actionTops.join(', ')}]）→ `
        + `${yn(!diag.barJudged || diag.actionTops.length <= 1)}`
        + `${diag.barJudged ? '' : '（900 档不判：动作区折行是宽度使然）'}`)
      line(`A6 状态带（1280 档硬判据）：三格高 [${diag.bandCellHs.join(', ')}]px ≤ 上限 ${String(diag.bandCellMaxH)}px/格 → `
        + `${yn(!diag.bandJudged || diag.bandCellHs.every(h => h <= diag.bandCellMaxH))}`)

      // A2：无横向溢出
      line(`A2 无横向溢出：documentElement scrollWidth=${String(diag.doc.sw)} ≤ clientWidth=${String(diag.doc.cw)}+1 → ${yn(!diag.docOverflow)}`
        + ` ｜ 报告壳 scrollWidth=${String(diag.shell.sw)} ≤ clientWidth=${String(diag.shell.cw)}+1 → ${yn(!diag.shellOverflow)}`)

      // A3：无内层滚动容器
      line(`A3 无内层滚动容器：实测带 auto|scroll 的元素 ${String(diag.a3.scanned)} 个，`
        + `其中内容装不下（内层滚动）${String(diag.a3.bad.length)} 个 → ${yn(diag.a3.bad.length === 0)}`
        + ` ｜ 排除 .dsh-pm-detail / [data-dag-wrap] / .dsh-pm-dag-canvas-wrap`)
      for (const b of diag.a3.bad) line(`     内层滚动：${b}`)

      // A4：未激活面板缺席
      line(`A4 未激活面板缺席：只渲染 trunk=${yn(diag.a4.trunkPresent)}，面板包装器 ${String(diag.a4.hostCount)} 个，`
        + `DOM 中出现的未激活面板=[${diag.a4.present.join(', ')}] → ${yn(diag.a4.present.length === 0)}`)

      /* A7~A12（REQ-261005155003-f32f）：每条打印实测值；失败分支在页内 problems 与宿主回读两处。 */
      const a7 = diag.a11y.focus
      line(`A7 焦点环（${String(a7.rows.length)} 个控件）：环宽 [${uniq(a7.rows.map(r => r.w + 'px')).join(', ')}] ≥ 2px → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.w >= 2))}`
        + ` ｜ 偏移 [${uniq(a7.rows.map(r => r.off)).join(', ')}] ⊆ {-2px, 2px} → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.off === '-2px' || r.off === '2px'))}`
        + ` ｜ 环色与相邻背景最小比 ${String(minOf(a7.rows.map(r => r.contrast)))}:1 ≥ 3:1 → ${yn(a7.rows.length > 0 && a7.rows.every(r => r.contrast >= 3))}`
        + ` ｜ 取样通道：live ${String(a7.via.live)} / cssom 兜底 ${String(a7.via.cssom)}（兜底原因见断言注释：headless 的 :focus-visible 置位不稳定）`)
      for (const b of a7.bad) line(`     红：${b}`)
      const a8 = diag.a11y.target
      const a8a = diag.a11y.adjacent
      line(`A8 目标尺寸：${String(a8.count)} 个交互目标，最小命中区 ${String(minOf(a8.rows.map(r => r.w)))}×${String(minOf(a8.rows.map(r => r.h)))}px ≥ 24×24 → ${yn(a8.count > 0 && a8.sized.length === 0)}`
        + ` ｜ 相邻间距下限 ${String(a8a.min)}px：违例 ${String(a8a.bad.length)} 处，显式例外 ${String(a8a.exempt.length)} 处（Tab 同组 4px，理由见断言注释）→ ${yn(a8a.bad.length === 0)}`)
      for (const b of a8.sized) line(`     不达标：${b.tag}.${b.cls} = ${String(b.w)}×${String(b.h)}px`)
      for (const b of a8a.bad) line(`     间距违例：${String(b.gap)}px（${b.a} | ${b.b}）`)
      const a9 = diag.a11y.font
      line(`A9 可见真文字字号：最小 ${String(a9.min.size)}px（.${a9.min.who}）≥ 11px → ${yn(a9.min.size >= 11)}`
        + ` ｜ 档位集合 {${Object.keys(a9.hist).sort((x, y) => Number(x) - Number(y)).join(', ')}} ⊆ {${a9.scale.join(', ')}}，阶梯外 ${String(a9.offScale.length)} 处 → ${yn(a9.offScale.length === 0)}`)
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
      line(`A12 视觉层级：H1 ${String(r12.h1)}÷${String(r12.body)} = ${String(r12.h1Ratio)} ≥ 1.8（${yn(r12.h1Ratio >= 1.8)}）`
        + ` ｜ H2 ${String(r12.moduleGap)}÷${String(r12.innerGap)} = ${String(r12.moduleRatio)} ≥ 3（${yn(r12.moduleRatio >= 3)}）`
        + ` ｜ H3 标题 ${r12.titleFont ?? '—'} vs 正文 ${r12.lineFont ?? '—'} 双通道（${yn((r12.titleFont ?? '') !== (r12.lineFont ?? ''))}）`)
      line(`     H4 状态带字号档 ${JSON.stringify(r12.bandLevels)}（档数 ≥3 / 极差 ≥8 / 主值与次大差 ≥2；下两档相差 1px 为 design/frontend.md §C-6 的权威取值，已登记）`
        + ` ｜ H5 主色文字 ${String(r12.accentKinds)} 类（${r12.accentSamples.map(s => s.role).join(' / ')}）→ ${yn(r12.accentKinds <= 1)}`)
      line(`     D-8（FR-9 第 7 项）：动作行 top ${String(a12.d8.actionRowTop)} < 身份行 top ${String(a12.d8.identityRowTop)}（差 ${String(a12.d8.gap ?? '—')}px ≥ 8）→ ${yn(a12.d8.gap !== undefined && a12.d8.gap >= 8)}`
        + ` ｜ 窗口组左 ${String(a12.d8.windowLeft ?? '—')} < 「创建于」左 ${String(a12.d8.createdAtLeft ?? '—')} → ${yn(a12.d8.windowLeft === null || a12.d8.createdAtLeft === null || a12.d8.windowLeft < a12.d8.createdAtLeft)}`)
      for (const b of a12.bad) line(`     红：${b}`)

      /* 宿主侧回读判据（只吃原始读数，独立于页内派生布尔）——逐条打印，红时点名具体读数。 */
      const readback = readbackProblems(diag, width, expectLong)
      line(`宿主侧回读判据：视口宽 ${String(diag.w)} == 期望 ${String(width)} → ${yn(diag.w === width)}`
        + ` ｜ 原始读数重算判为失败 ${String(readback.length)} 项 → ${yn(readback.length === 0)}`
        + `（与页内 problems ${String(diag.problems.length)} 项互为对照；红时下面逐条点名）`)
      for (const r of readback) console.error('  - ' + r)

      const ok = diag.problems.length === 0 && readback.length === 0
        && a1.head && a1.title && a1.band && a1.progress && a1.dots && a1.gaps && a1.tabs
        && !diag.docOverflow && !diag.shellOverflow
        && diag.a3.bad.length === 0
        && diag.a4.present.length === 0 && diag.a4.hostCount === 1 && diag.a4.trunkPresent
        && diag.geom.foldOk && diag.overlaps.length === 0
        && (!diag.barJudged || (diag.barH <= diag.actionBarMaxH && diag.actionTops.length <= 1))
        && (!diag.bandJudged || diag.bandCellHs.every(h => h <= diag.bandCellMaxH))
        && diag.geom.tabsInFold && diag.geom.commentsH <= diag.commentListMaxH
        && diag.geom.commentRows <= diag.commentRenderLimit
        && diag.w === width
        // A7~A12（REQ-261005155003-f32f）：页内 problems 已含它们，这里再显式要求一遍，
        // 免得将来有人把 a11y 的 push 漏掉却仍读到 PASS。
        && diag.a11y.focus.bad.length === 0 && diag.a11y.focus.rows.length > 0
        && diag.a11y.target.sized.length === 0 && diag.a11y.target.count > 0
        && diag.a11y.adjacent.bad.length === 0
        && diag.a11y.font.bad.length === 0
        && diag.a11y.motion.bad.length === 0
        && diag.a11y.marks.bad.length === 0
        && diag.a11y.hier.bad.length === 0

      if (ok) {
        passed++
        console.log(`PASS w=${String(diag.w)} state=${state.key}（四问可答·L0 落点在首屏 ✓ / Tab 栏 top=${String(diag.geom.tabsTop)} ≤ ${String(diag.tabsTopMax)} ✓ / 评论列表 ${String(diag.geom.commentsH)}px ≤ ${String(diag.commentListMaxH)}px ✓ / 无横向溢出 ✓ / 无内层滚动容器 ✓ / 未激活面板缺席 ✓ / 操作条不重叠 ✓ / 操作条整块 ≤ ${String(diag.actionBarMaxH)}px 且按钮同一行 ✓）`)
      } else {
        console.error(`FAIL w=${String(width)} state=${state.key}`)
        for (const p of diag.problems) console.error('  - ' + p)
        failures.push(`w=${String(width)} ${state.label}：${diag.problems.concat(readback).join(' | ') || '断言未过'}`)
      }
    }
  }

  /* ═══════════ A13：五块未覆盖面板补测（requirement.md 验收标准 #4c） ═══════════
     原型只渲染 trunk，docs / dag / dialogue / token / prompts 这三条判据从没被量过。
     这里逐块渲染真壳 + 该块的真实载荷，量目标尺寸 / 字阶 / 结构位 emoji，逐块打印一行。 */
  const PANEL_KEYS: PanelSpecimenKey[] = ['docs', 'dag', 'dialogue', 'token', 'prompts']
  console.log('')
  console.log('[A13 五块未覆盖面板补测（原型只渲染 trunk；1280 档 · 在途）]')
  let panelFailed = 0
  for (const pk of PANEL_KEYS) {
    const page = join(dir, 'panel-' + pk + '.html')
    writeFileSync(page, specimenShellForPanel(1280, 'inflight', pk, panelA11yScript()))
    let pd: PanelDiag | undefined
    try {
      const dom = dumpDom(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check',
        `--window-size=1280,${String(WINDOW_HEIGHT)}`, '--dump-dom', `file://${page}`,
      ])
      const m = /<div id="diag">([\s\S]*?)<\/div>/.exec(dom)
      if (m !== null) {
        const raw = m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        pd = JSON.parse(raw) as PanelDiag
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
    const histKeys = Object.keys(pd.font.hist).map(Number).sort((a, b) => a - b)
    const lineText = `  ${pad(pk, 10)}目标 ${String(pd.targets.count)} 个，最小 ${String(pd.targets.minW ?? '—')}×${String(pd.targets.minH ?? '—')}px`
      + ` ｜ 字号 {${histKeys.join(', ')}} 最小 ${String(pd.font.min)}px`
      + ` ｜ Tab 图标 ${String(pd.tabIcons)} 个/14px ｜ affordance emoji ${String(pd.emoji.length)} 处 ｜ 其它 emoji 读数 ${String(pd.readings.length)} 处（边界外，见 evidence/a13-panel-findings.txt）`
      + ` ｜ 标记 缺口 ${String(pd.marks.gap)}/${String(pd.marks.gapSvg)} 阶段点 ${String(pd.marks.doneDots)}/${String(pd.marks.curDots)}`
      + ` → ${pd.problems.length === 0 ? 'PASS' : 'FAIL'}`
    if (pd.problems.length === 0) console.log(lineText)
    else {
      panelFailed++
      console.error(lineText)
      for (const p of pd.problems) console.error('     红：' + p)
      failures.push(`A13 面板 ${pk}：${pd.problems.join(' | ')}`)
    }
  }
  if (panelFailed === 0) console.log('  A13 五块面板全部 PASS（目标尺寸 / 字阶 / 结构位 emoji 三条判据）')

  // 四组合一次都没跑起来 = 环境不可用（不是断言失败）→ 退出码 2，一行可读原因。
  // 为什么与"断言不过（1）"分开：CI 上这两种红的处置完全不同（一个去装浏览器，一个去看页面）。
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
    + '四问可答（L0 结论头/操作条/状态带落点在首屏）/ **Tab 栏 top ≤ 713** / 评论列表整块 ≤ 260px /'
    + ' 无横向溢出 / 无内层滚动容器 / 未激活面板缺席 / 操作条不重叠 / 操作条整块 ≤ 72px 且按钮同一行 / 状态带三格 ≤ 220px）')
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
