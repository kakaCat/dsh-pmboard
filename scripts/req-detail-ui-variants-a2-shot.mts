/**
 * 需求详情页 UI **V-A2**（在 V-A 上按 D-7 做三处修订 + 重做视觉层级）——
 * 出图 + 「同一把尺子」实测 + V-A↔V-A2 对照图 + FR-12 的 H1～H5 断言。
 * REQ-261005155003-f32f · 证据脚本（**不改** `req-detail-ui-variants-shot.mts`）。
 *
 * ## 这份脚本为什么存在
 *
 * 人看完三版候选（`vA/vB/vC.html`）后只留 V-A 一个方向，但提了三处硬意见（D-7 原话）：
 *   「**v-A 按钮都放到左上角，这个添加评论删除不需要，核心问题现在没有层次感，每个模块不够有层次**」
 * 于是 V-A2 = V-A 的三处修订：① 动作按钮组移到卡片左上角（FR-9 随之修订）
 * ② 删评论输入框（FR-13）③ **重做视觉层级**（FR-12，本脚本要用断言证明的正是这一条）。
 *
 * ## 「同一把尺子」是怎么做到字面一致的
 *
 * 七项多样性 / 命中区 / 最小字号 / 对比度 / 内联滚动 / 横向溢出 / tabsTop / FR-1·2·3·6·8·11
 * 的测量代码**不是重写的**——本脚本在运行时从 `scripts/req-detail-ui-variants-shot.mts`
 * （冻结脚本，本脚本只读它）里**逐字抽出 `MEASURE_JS` 模板**再注入页面（`extractMeasureJs()`）。
 * 所以「改前 vs 改后」的两列数字出自同一段页内脚本、同一批阈值，不是两把尺子。
 * 抽出的文本按 TS 模板字面量语义还原转义（该段内只有 `\\` 一种转义，无 `${`、无内嵌反引号）。
 *
 * FR-12 的 H1～H5 与 FR-9（D-7 修订版）/ FR-13 是**本版新增**的判据，用本脚本自己的
 * 页内脚本 `A2_JS` 量（也注入 #diag2），与 MEASURE_JS 一次页面加载里各量各的。
 *
 * ## 纪律（本脚本自己守）
 *
 *  ① 只读 `vA.html` / `vA2.html`；**只写**本目录下 4 个新产物
 *     （`vA2.html` 由手工三处编辑产出，本脚本不改它，只读它出图与测量）；
 *  ② **不覆盖** variants/ 下既有文件（`vA/vB/vC.html`、`variant-*.png`、`metrics.txt`）：
 *     对照图里需要的 V-A 图**另存到临时目录**重出一张，绝不动既有的 `variant-A-1280-inflight.png`；
 *  ③ 阈值只在本脚本里；两份 HTML 里只有 CSS/注释，没有阈值；
 *  ④ **响亮失败**：任一硬判据不满足 → 退出码 1，如实打印；不达标不写「达标」。
 *
 * 用法：npx tsx scripts/req-detail-ui-variants-a2-shot.mts
 *
 * 产物（`docs/requirements/REQ-261005155003-f32f/evidence/variants/`）：
 *   vA2.html                         V-A2 自包含样品页（?state=inflight|terminal、?annot=0）
 *   variant-A2-1280-inflight.png     1280 在途态 · 2 倍图（2560×1600）
 *   variant-A-vs-A2-head.png         V-A vs V-A2 首屏卡片区上下对照（PIL；英文标题）
 *   variant-A-vs-A2-modules.png      V-A vs V-A2 正文模块区（为何做 / 解决什么）上下对照
 *   metrics-A2.txt                   七项收敛 + H1～H5 改前→改后 + FR-1～FR-11 复核 + 偏离
 *
 * 退出码：0 全过 / 1 有断言失败 / 2 环境不可用（找不到 Chrome 或带 Pillow 的 python）。
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome } from './fixtures/req-detail-specimen.mts'

/* ───────────────────────────────────────────────────── 路径与常量 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EVID = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence', 'variants')
const A_FILE = 'vA.html'
const A2_FILE = 'vA2.html'
const FROZEN_SCRIPT = join(ROOT, 'scripts', 'req-detail-ui-variants-shot.mts')

/** 出图档：与既有 V-A 图同口径（1280 在途 · 2 倍图 · 窗口 800 高 · 隐藏滚动条）。 */
const SHOT_WIDTH = 1280
const SHOT_HEIGHT = 800
const SCALE = 2
const VIEWPORT_H = 713          // 既有探针的实测视口档（tabsTop 判据那一档）
const TALL_HEIGHT = 2600        // 模块区对照用：只为了把正文模块区收进图，不动布局（脚本会核 tabsTop 一致）
const MIN_PNG_BYTES = 20 * 1024

/** 硬阈值（来源：REQ-261005155003-f32f 的 FR-4/5/7/9/10/12/13）。 */
const TABS_TOP_MAX = 713
const TARGET_MIN = 24
const FONT_MIN = 11
const TEXT_CONTRAST_MIN = 4.5
const VARIETY_MAX = { pills: 5, fg: 5, bg: 4, fontWeight: 3, fontSize: 5, radius: 2, borderColor: 2 } as const
/** FR-12 的验收阈值（H1～H5）。 */
const H1_MIN = 1.8      // h1 字号 ÷ 正文字号
const H2_MIN = 3        // 模块间距 ÷ 模块内间距
const H3_SIZE = 15      // 模块标题字号（且与正文不同）
const H3_BODY_SIZE = 13
const H4_DIFF_MIN = 2   // 卡内三格：=3 档且两两差 ≥2px
const H5_MAX = 1        // 主色文字类数
/** FR-9（D-7 修订版）：危险动作与前一个动作的最小空隙。 */
const DANGER_GAP_MIN = 24
/** 色板白名单（只扫 V-A2 的变体层 CSS——与冻结脚本同一份 FR-10 名单）。 */
const PALETTE = [
  '#1d1d1f', '#6e6e73', '#86868b', '#0071e3', '#d70015', '#c93400', '#1e7e34',
  '#0000001a', '#00000029', '#f5f5f7', '#fff', '#ffffff', 'rgba(0,113,227,.25)',
  'transparent', 'currentcolor', 'none', 'inherit', 'initial',
] as const

/* ───────────────────────────────────────────────────── 从冻结脚本抽「同一把尺子」 */

/**
 * 逐字抽出冻结脚本里的 `MEASURE_JS`（页内测量脚本），按模板字面量语义还原转义。
 * 该段（`const MEASURE_JS = \`…\``）内只有 `\\` 一种转义、无 `${`、无内嵌反引号 —— 抽取是安全的。
 */
function extractMeasureJs(): string {
  const src = readFileSync(FROZEN_SCRIPT, 'utf8')
  const m = /const MEASURE_JS = `([\s\S]*?)`\n/.exec(src)
  if (m === null || m[1] === undefined || m[1].length < 1000) {
    throw new Error('抽不出 MEASURE_JS（冻结脚本被改过？本脚本拒绝用"另一把尺子"继续）')
  }
  const body = m[1]
  if (body.includes('${') || body.includes('`')) throw new Error('MEASURE_JS 里出现模板插值/反引号，抽取不再安全')
  return body.replace(/\\\\/g, '\\')
}

/* ───────────────────────────────────────────────────── V-A2 页内测量脚本（H1～H5 + FR-9 修订 + FR-13） */

/**
 * 本版新增判据的页内脚本。只读 DOM/计算样式，输出到 `#diag2`（不与冻结脚本的 `#diag` 冲突）。
 * 口径写死在注释里，避免"数字对了但不知道量的是什么"。
 */
const A2_JS = `<script>
(function () {
  var STATE = '__STATE__';
  var wrap = document.querySelector('.dsh-pm-view[data-proto-shell="' + STATE + '"]');
  var shell = wrap === null ? null : wrap.querySelector('[data-report-shell]');
  function emit(o) {
    var d = document.createElement('div'); d.id = 'diag2'; d.textContent = JSON.stringify(o);
    document.body.appendChild(d);
  }
  if (shell === null) { emit({ error: 'no-shell', state: STATE }); return; }
  var ACCENT = 'rgb(0, 113, 227)';
  function cs(el) { return getComputedStyle(el); }
  function box(el) { if (el === null || el === undefined) return null; var r = el.getBoundingClientRect();
    return { t: r.top, l: r.left, w: r.width, h: r.height, r: r.right, b: r.bottom }; }
  function round(v) { return Math.round(v * 100) / 100; }
  function size(el) { return el === null || el === undefined ? null : round(parseFloat(cs(el).fontSize)); }
  function weight(el) { return el === null || el === undefined ? null : cs(el).fontWeight; }
  function own(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 0) return true;
    }
    return false;
  }
  function cls(el) {
    var c = typeof el.className === 'string' && el.className.length > 0 ? '.' + el.className.split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + c;
  }
  function textW(el) {
    if (el === null || el.firstChild === null || el.firstChild.nodeType !== 3) return 0;
    var rg = document.createRange(); rg.selectNodeContents(el);
    return round(rg.getBoundingClientRect().width);
  }

  /* ── H1 / H3：字阶的分子分母 ── */
  var h1 = shell.querySelector('.dsh-pm-detail-title');
  var bodyLine = shell.querySelector('.dsh-pm-trunk-line');
  var modTitle = shell.querySelector('.dsh-pm-trunk-title');
  var h1Info = { size: size(h1), weight: weight(h1), lh: h1 === null ? null : cs(h1).lineHeight,
    ls: h1 === null ? null : cs(h1).letterSpacing };
  var bodyInfo = { size: size(bodyLine), weight: weight(bodyLine),
    lh: bodyLine === null ? null : cs(bodyLine).lineHeight };
  var modTitleInfo = { size: size(modTitle), weight: weight(modTitle) };
  var h1Ratio = h1Info.size !== null && bodyInfo.size ? round(h1Info.size / bodyInfo.size) : null;

  /* ── H2：模块间距 ÷ 模块内间距 ──
     模块间距 = 相邻模块**内容盒**之间的垂直距离（含中间的发丝线/外边距）；
     模块内间距 = 同一模块内「标题行底边 → 正文顶边」的垂直距离（并排结构 = 0）。 */
  var items = Array.prototype.slice.call(shell.querySelectorAll('[data-trunk-item]'));
  var mods = items.map(function (it) {
    var st = cs(it);
    var r = it.getBoundingClientRect();
    var padT = parseFloat(st.paddingTop) || 0, padB = parseFloat(st.paddingBottom) || 0;
    var bdT = parseFloat(st.borderTopWidth) || 0, bdB = parseFloat(st.borderBottomWidth) || 0;
    var head = it.querySelector('.dsh-pm-trunk-head');
    var body = it.querySelector('.dsh-pm-trunk-body');
    var hb = box(head), bb = box(body);
    return {
      key: it.getAttribute('data-trunk-item'),
      contentTop: round(r.top + padT + bdT), contentBottom: round(r.bottom - padB - bdB),
      headBox: hb, bodyBox: bb,
      titleSize: size(it.querySelector('.dsh-pm-trunk-title')),
      titleWeight: weight(it.querySelector('.dsh-pm-trunk-title')),
      lineSize: size(it.querySelector('.dsh-pm-trunk-line')),
      lineWeight: weight(it.querySelector('.dsh-pm-trunk-line')),
      innerGap: hb === null || bb === null ? null : round(bb.t - hb.b)
    };
  });
  var moduleGaps = [];
  for (var i = 1; i < mods.length; i++) moduleGaps.push(round(mods[i].contentTop - mods[i - 1].contentBottom));
  var innerGaps = mods.map(function (m) { return m.innerGap === null ? 0 : m.innerGap; });
  var moduleGap = moduleGaps.length > 0 ? Math.min.apply(null, moduleGaps) : null;
  var innerGapRaw = innerGaps.length > 0 ? Math.max.apply(null, innerGaps) : null;
  var innerGap = innerGapRaw !== null && innerGapRaw > 0 ? innerGapRaw : 0;   // 并排结构 = 0（分母为 0）
  var sideBySide = mods.some(function (m) {
    return m.headBox !== null && m.bodyBox !== null && Math.abs(m.bodyBox.l - m.headBox.l) > 1;
  });
  var h2Ratio = moduleGap !== null && innerGap > 0 ? round(moduleGap / innerGap) : null;

  /* ── H4：卡内三格 = 三档字号且两两差 ≥2px（只数"带真文字"的元素）── */
  var cellInfo = Array.prototype.slice.call(shell.querySelectorAll('[data-band-cell]')).map(function (c) {
    var seen = {};
    [c].concat(Array.prototype.slice.call(c.querySelectorAll('*'))).forEach(function (e) {
      if (own(e)) seen[String(size(e))] = 1;
    });
    var sizes = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    return { cell: c.getAttribute('data-band-cell'), sizes: sizes, box: box(c) };
  });
  var bandSeen = {};
  cellInfo.forEach(function (c) { c.sizes.forEach(function (s) { bandSeen[s] = 1; }); });
  var bandSizes = Object.keys(bandSeen).map(Number).sort(function (a, b) { return a - b; });
  var bandMinDiff = null;
  for (var a1 = 0; a1 < bandSizes.length; a1++) {
    for (var b1 = a1 + 1; b1 < bandSizes.length; b1++) {
      var d = bandSizes[b1] - bandSizes[a1];
      if (bandMinDiff === null || d < bandMinDiff) bandMinDiff = d;
    }
  }

  /* ── H5：主色文字类数（color === #0071e3 且带真文字的元素类别）── */
  var accentRoles = {}, accentAll = [];
  Array.prototype.slice.call(shell.querySelectorAll('*')).forEach(function (e) {
    if (e.tagName.toLowerCase() === 'svg' || e.closest('svg') !== null) return;
    if (cs(e).color !== ACCENT) return;
    var k = cls(e);
    accentAll.push(k + (own(e) ? '' : '（无文本）'));
    if (own(e)) accentRoles[k] = 1;
  });

  /* ── FR-9（D-7 修订版）：同一行 / 左对齐到卡片内容区左缘 / 不拉伸 / 危险动作排最后且 ≥24px ── */
  var bar = shell.querySelector('.dsh-pm-rh-bar');
  var headSeg = shell.querySelector('[data-report-seg="head"]');
  var back = shell.querySelector('.dsh-pm-rh-bar .dsh-pm-btn[data-action="back"]');
  var mark = shell.querySelector('.dsh-pm-human-only');
  var acts = Array.prototype.slice.call(shell.querySelectorAll('.dsh-pm-report-action')).map(function (c) {
    var b = c.querySelector('.dsh-pm-btn');
    var cb = box(c), bb2 = box(b);
    return {
      key: c.getAttribute('data-action-key'), rank: c.getAttribute('data-action-rank'),
      text: b === null ? '' : (b.textContent || '').trim(),
      cellLeft: cb === null ? null : round(cb.l), cellRight: cb === null ? null : round(cb.r),
      btnLeft: bb2 === null ? null : round(bb2.l), btnTop: bb2 === null ? null : Math.round(bb2.t),
      btnTopRaw: bb2 === null ? null : round(bb2.t), btnW: bb2 === null ? null : round(bb2.w),
      btnH: bb2 === null ? null : round(bb2.h), textW: textW(b), padX: bb2 === null ? null : round(bb2.w - textW(b))
    };
  });
  var rowEls = [back].concat(acts.map(function (x) {
    return shell.querySelector('.dsh-pm-report-action[data-action-key="' + x.key + '"] .dsh-pm-btn');
  })).concat([mark]).filter(Boolean);
  var rowBoxes = rowEls.map(box);
  var rowTops = rowBoxes.map(function (b) { return b === null ? 0 : Math.round(b.t); });
  var rowBottoms = rowBoxes.map(function (b) { return b === null ? 0 : Math.round(b.b); });
  var overlap = rowBoxes.length > 1 ? Math.min.apply(null, rowBottoms) - Math.max.apply(null, rowTops) : 0;
  var segPadL = headSeg === null ? 0 : parseFloat(cs(headSeg).paddingLeft) || 0;
  var cardContentLeft = headSeg === null ? null : round(headSeg.getBoundingClientRect().left + segPadL);
  var dangerIdx = -1;
  acts.forEach(function (x, idx) { if (x.rank === 'danger') dangerIdx = idx; });
  var dangerGap = dangerIdx > 0 ? round(acts[dangerIdx].cellLeft - acts[dangerIdx - 1].cellRight) : null;
  var lastRight = rowBoxes.length > 0 ? Math.max.apply(null, rowBoxes.map(function (b) { return b === null ? 0 : b.r })) : null;
  var barContentRight = bar === null ? null : bar.getBoundingClientRect().right - (parseFloat(cs(bar).paddingRight) || 0);
  var fr9 = {
    rowTops: rowTops, rowTopsUnique: Object.keys(rowTops.reduce(function (o, t) { o[String(t)] = 1; return o }, {})).length,
    rowOverlap: round(overlap),
    actionTopsUnique: Object.keys(acts.reduce(function (o, x) { o[String(x.btnTop)] = 1; return o }, {})).length,
    cardContentLeft: cardContentLeft, barLeft: bar === null ? null : round(bar.getBoundingClientRect().left),
    backLeft: back === null ? null : round(back.getBoundingClientRect().left),
    barTop: bar === null ? null : round(bar.getBoundingClientRect().top),
    h1Top: h1 === null ? null : round(h1.getBoundingClientRect().top),
    dangerIsLast: dangerIdx === acts.length - 1 && dangerIdx >= 0,
    dangerGap: dangerGap,
    actedCount: acts.length,
    freeSpaceRight: lastRight === null || barContentRight === null ? null : round(barContentRight - lastRight),
    actions: acts
  };

  /* ── FR-13：评论输入框不存在、评论列表还在 ── */
  var fr13 = {
    form: shell.querySelectorAll('.dsh-pm-comment-form').length,
    input: shell.querySelectorAll('[data-role="comment-input"]').length,
    addBtn: shell.querySelectorAll('[data-action="add-comment"]').length,
    rows: shell.querySelectorAll('.dsh-pm-comment').length,
    summary: (shell.querySelector('.dsh-pm-comments > .dsh-pm-action-bar-label') || { textContent: '' }).textContent
  };

  /* ── 窗口行：行首标签保留、按钮内不重复「窗口」、两按钮间隔 ── */
  var wins = Array.prototype.slice.call(shell.querySelectorAll('.dsh-pm-window'));
  var winLabelEl = shell.querySelector('.dsh-pm-report-windows > .dsh-pm-action-bar-label');
  var windowRow = {
    label: winLabelEl === null ? null : (winLabelEl.textContent || '').trim(),
    texts: wins.map(function (w) { return (w.textContent || '').trim() }),
    gap: wins.length > 1 ? round(wins[1].getBoundingClientRect().left - wins[0].getBoundingClientRect().right) : null,
    labelGap: wins.length > 0 && winLabelEl !== null
      ? round(wins[0].getBoundingClientRect().left - winLabelEl.getBoundingClientRect().right) : null
  };

  /* ── Tab 栏（E 页签=控件层）：间距 8px、选中 = 主色下划线 + 文字加深（文字不用主色）── */
  var tabs = Array.prototype.slice.call(shell.querySelectorAll('.dsh-pm-tab'));
  var actTab = shell.querySelector('.dsh-pm-tab.active');
  var tabsInfo = {
    count: tabs.length,
    gap: tabs.length > 1 ? round(tabs[1].getBoundingClientRect().left - tabs[0].getBoundingClientRect().right) : null,
    activeColor: actTab === null ? null : cs(actTab).color,
    activeWeight: actTab === null ? null : cs(actTab).fontWeight,
    activeUnderlineW: actTab === null ? null : cs(actTab).borderBottomWidth,
    activeUnderlineColor: actTab === null ? null : cs(actTab).borderBottomColor
  };

  /* ── FR-11 的后果披露（本版不许被本次改动碰到）：aria-describedby 指向的隐藏文本 === 按钮 title ── */
  var prim = shell.querySelector('.dsh-pm-report-action[data-action-rank="primary"] .dsh-pm-btn');
  var did = prim === null ? null : prim.getAttribute('aria-describedby');
  var del = did === null ? null : shell.querySelector('#' + did);
  var db = box(del);
  var fr11 = {
    descId: did,
    descText: del === null ? null : (del.textContent || ''),
    titleText: prim === null ? '' : (prim.getAttribute('title') || ''),
    descHidden: db !== null && db.w <= 1.5 && db.h <= 1.5,
    matches: del !== null && prim !== null && (del.textContent || '') === (prim.getAttribute('title') || '')
  };

  /* ── 卡内块间：按视觉顺序（top）排卡片里那几个块，量相邻块的空隙（应为 20 / 行内 6）── */
  var CARD_BLOCKS = [
    ['.dsh-pm-rh-bar', '操作行'], ['.dsh-pm-rh-top', '身份行'], ['.dsh-pm-rh-sub', '创建/窗口行'],
    ['.dsh-pm-detail-title', '页标题'], ['.dsh-pm-report-verdict', '结论'],
    ['.dsh-pm-report-next', '下一步'], ['.dsh-pm-progress-dots', '阶段条'], ['.dsh-pm-comments', '评论摘要']
  ];
  var blocks = CARD_BLOCKS.map(function (pair) {
    var el = shell.querySelector(pair[0]);
    var b = box(el);
    return { sel: pair[0], name: pair[1], box: b };
  }).filter(function (x) { return x.box !== null; }).sort(function (x, y) { return x.box.t - y.box.t });
  var blockGaps = [];
  for (var g = 1; g < blocks.length; g++) {
    blockGaps.push({ from: blocks[g - 1].name, to: blocks[g].name, gap: round(blocks[g].box.t - blocks[g - 1].box.b) });
  }

  /* ── 模块区几何（出对照图用；另用于核对"高窗 vs 800 窗"布局是否一致）── */
  var tabsRow = shell.querySelector('[data-report-tabs]');
  var whyItem = shell.querySelector('[data-trunk-item="why"]');
  var problemItem = shell.querySelector('[data-trunk-item="problem"]');
  var geometry = {
    vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
    tabsTop: tabsRow === null ? null : round(tabsRow.getBoundingClientRect().top),
    whyTop: whyItem === null ? null : round(whyItem.getBoundingClientRect().top),
    problemBottom: problemItem === null ? null : round(problemItem.getBoundingClientRect().bottom),
    docHeight: document.documentElement.scrollHeight
  };

  emit({
    state: STATE,
    h1: h1Info, body: bodyInfo, moduleTitle: modTitleInfo, h1Ratio: h1Ratio,
    modules: { count: mods.length, items: mods, gaps: moduleGaps, moduleGap: moduleGap,
      innerGapRaw: innerGapRaw, innerGap: innerGap, sideBySide: sideBySide, h2Ratio: h2Ratio },
    band: { cells: cellInfo, sizes: bandSizes, minDiff: bandMinDiff },
    accent: { roles: Object.keys(accentRoles).sort(), roleCount: Object.keys(accentRoles).length, all: accentAll },
    fr9: fr9, fr13: fr13, windowRow: windowRow, tabs: tabsInfo, fr11: fr11,
    blockGaps: blockGaps, geometry: geometry
  });
})();
</script>`

/* ───────────────────────────────────────────────────── 类型 */

interface Variety {
  elements: number; pills: number; fg: number; bg: number; fontWeight: number; fontSize: number
  radius: number; borderColor: number
  fgValues: string[]; bgValues: string[]; fsValues: string[]; fwValues: string[]; radiusValues: string[]; bcValues: string[]
  detail: { fg: Record<string, string>; bg: Record<string, string>; fs: Record<string, string>; radius: Record<string, string>; bc: Record<string, string> }
}
interface Diag {
  error?: string
  state: string; w: number; vh: number
  variety: Variety
  contrast: { count: number; min: number; minWhat: string; violations: string[] }
  tabsTop: number
  minTargetW: number; minTargetH: number; minTargetWWhat: string; minTargetHWhat: string
  minFontSize: number; minFontWhat: string
  innerScroll: number; innerScrollScanned: number; innerScrollWhat: string[]
  docOverflow: boolean; shellOverflow: boolean; wide: string[]
  fr1: { tabSvgCount: number; tabCount: number; attrsOk: boolean; svgW: number; svgH: number; followActive: boolean; strayEmoji: boolean }
  fr2: { input: Ring | null; tab: Ring | null; btn: Ring | null }
  fr3: { tablist: boolean; label: boolean; tabs: number; selectedTrue: number; selectedFalse: number; controls: number; tabindex0: number; tabindexNeg: number }
  fr6: { reducedMotion: boolean; transitionDuration: string }
  fr8: { markerHasCheck: boolean; markerHasArrow: boolean; seenMarkers: string[]; dotOverflow: boolean; gapRed: string; gapYellow: string; gapGray: string }
  fr9: { count: number; primaryLeft: number | null; gridLeft: number | null; gridRight: number | null; dangerRight: number | null; markerLeft: number | null; sameRow: boolean }
  fr11: { barText: string; hasStageLabel: boolean; consequenceNodes: number; humanOnlyText: string; humanMark: string; humanOnlyTrue: number; descId: string | null; descHidden: boolean; descMatches: boolean }
}
interface Ring { w: string; style: string; color: string; offset: string; focusVisible: boolean; contrast: number }
interface Box { t: number; l: number; w: number; h: number; r: number; b: number }
interface A2Diag {
  error?: string
  state: string
  h1: { size: number | null; weight: string | null; lh: string | null; ls: string | null }
  body: { size: number | null; weight: string | null; lh: string | null }
  moduleTitle: { size: number | null; weight: string | null }
  h1Ratio: number | null
  modules: {
    count: number
    items: { key: string; contentTop: number; contentBottom: number; headBox: Box | null; bodyBox: Box | null
      titleSize: number | null; titleWeight: string | null; lineSize: number | null; lineWeight: string | null
      innerGap: number | null }[]
    gaps: number[]; moduleGap: number | null; innerGapRaw: number | null; innerGap: number
    sideBySide: boolean; h2Ratio: number | null
  }
  band: { cells: { cell: string; sizes: number[]; box: Box | null }[]; sizes: number[]; minDiff: number | null }
  accent: { roles: string[]; roleCount: number; all: string[] }
  fr9: {
    rowTops: number[]; rowTopsUnique: number; rowOverlap: number; actionTopsUnique: number
    cardContentLeft: number | null; barLeft: number | null; backLeft: number | null
    barTop: number | null; h1Top: number | null; dangerIsLast: boolean; dangerGap: number | null
    actedCount: number; freeSpaceRight: number | null
    actions: { key: string; rank: string; text: string; cellLeft: number | null; cellRight: number | null
      btnLeft: number | null; btnTop: number | null; btnTopRaw: number | null; btnW: number | null
      btnH: number | null; textW: number; padX: number | null }[]
  }
  fr13: { form: number; input: number; addBtn: number; rows: number; summary: string }
  windowRow: { label: string | null; texts: string[]; gap: number | null; labelGap: number | null }
  tabs: { count: number; gap: number | null; activeColor: string | null; activeWeight: string | null
    activeUnderlineW: string | null; activeUnderlineColor: string | null }
  fr11: { descId: string | null; descText: string | null; titleText: string; descHidden: boolean; matches: boolean }
  blockGaps: { from: string; to: string; gap: number }[]
  geometry: { vw: number; vh: number; tabsTop: number | null; whyTop: number | null; problemBottom: number | null; docHeight: number }
}

/* ───────────────────────────────────────────────────── 工具（与冻结脚本同源，逐字复制以免两把尺子） */

function pngSize(path: string): { w: number; h: number } | undefined {
  const head = readFileSync(path).subarray(0, 24)
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) return undefined
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
}

/**
 * 跑一次 headless Chrome —— 与冻结脚本同一套「按产物就绪收工」的写法：
 * 本机 Chrome 写完 PNG / 打完 DOM 之后进程常驻不退，`execFileSync` 会一直等（历史上卡死过一次），
 * 故用 spawn + 三条收工判据（产物就绪 / stdout 静默 / 硬超时），到点 SIGKILL 进程组再继续。
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
    child.stderr?.on('data', () => { /* 本机 Chrome 会刷 display/updater 噪声，不当失败 */ })
    child.on('error', () => { finish(false, 'spawn 失败') })
    child.on('exit', () => { finish(opts.waitForFile !== undefined ? true : out.length > 0) })
    hard = setTimeout(() => { finish(false, `超时 ${String(graceMs)}ms 未产出`) }, graceMs)
    if (opts.waitForFile !== undefined) {
      poll = setInterval(() => { if (fileReady()) setTimeout(() => { finish(true) }, 600) }, 80)
    }
  })
}

function diagText(dom: string, id: string): Record<string, unknown> | undefined {
  const m = new RegExp('<div id="' + id + '">([\\s\\S]*?)</div>').exec(dom)
  if (m === null || m[1] === undefined) return undefined
  const raw = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  try { return JSON.parse(raw) as Record<string, unknown> } catch { return undefined }
}

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

/** 静态核对 V-A2 变体层的颜色字面量（先剥注释再扫）——与冻结脚本同一份白名单。 */
function paletteCheck(page: string): string[] {
  const m = /<style id="variant-css">([\s\S]*?)<\/style>/.exec(page)
  if (m === null || m[1] === undefined) return ['页面里找不到 <style id="variant-css">']
  const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '')
  const colors = new Set<string>()
  for (const c of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) colors.add(c[0].toLowerCase())
  for (const c of css.matchAll(/rgba?\([^)]*\)/g)) colors.add(c[0].toLowerCase().replace(/\s+/g, ''))
  const bad: string[] = []
  for (const c of colors) {
    const norm = c === '#ffffff' ? '#fff' : c
    if (!(PALETTE as readonly string[]).includes(norm)) bad.push('色板外颜色字面量：' + c)
  }
  return bad
}

/* ───────────────────────────────────────────────────── 对照图（PIL；标题只用英文字符） */

const COMPARE_PY = `import sys, json
from PIL import Image, ImageDraw, ImageFont

spec = json.loads(sys.argv[1])
TARGET_W = 1120
MARGIN = 24
GAP = 16
CAP_H = 34
LABEL_W = 96          # 左侧 A / A2 标记列
SCALE = 2             # 截图为 2 倍图：CSS 坐标 × 2

font = ImageFont.load_default(size=24)
tag_font = ImageFont.load_default(size=24)

panels = []
for p in spec['panels']:
    im = Image.open(p['file']).convert('RGB')
    x, y, w, h = [int(round(v * SCALE)) for v in (p['x'], p['y'], p['w'], p['h'])]
    x = max(0, min(x, im.size[0] - 1)); y = max(0, min(y, im.size[1] - 1))
    w = max(1, min(w, im.size[0] - x)); h = max(1, min(h, im.size[1] - y))
    im = im.crop((x, y, x + w, y + h))
    scale = TARGET_W / float(im.size[0])
    im = im.resize((TARGET_W, max(1, int(round(im.size[1] * scale)))), Image.Resampling.LANCZOS)
    panels.append({'im': im, 'tag': p['tag'], 'cap': p['cap']})

W = MARGIN * 2 + LABEL_W + TARGET_W
H = MARGIN * 2 + sum(p['im'].size[1] + CAP_H + GAP for p in panels) - GAP
canvas = Image.new('RGB', (W, H), (255, 255, 255))
d = ImageDraw.Draw(canvas)
y = MARGIN
for p in panels:
    im = p['im']
    px = MARGIN + LABEL_W
    canvas.paste(im, (px, y))
    d.rectangle([px - 1, y - 1, px + im.size[0], y + im.size[1]], outline=(0, 0, 0))
    d.text((MARGIN, y + 4), p['tag'], fill=(29, 29, 31), font=tag_font)
    d.text((px, y + im.size[1] + 6), p['cap'], fill=(110, 110, 115), font=font)
    y += im.size[1] + CAP_H + GAP
canvas.save(spec['out'])
print('%d x %d' % (W, H))
`

/* ───────────────────────────────────────────────────── main */

interface ModuleLite { geometry: A2Diag['geometry'] }

async function main(): Promise<void> {
  const failures: string[] = []
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('A2-SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    process.exit(2)
  }
  const python = findPython()
  if (python === undefined) {
    console.error('A2-SHOT FAIL（环境不可用，退出码 2）：找不到带 Pillow 的 python（对照图要用 PIL）。')
    process.exit(2)
  }
  console.log('chrome：' + chrome)
  console.log('python：' + python)

  const measureJs = extractMeasureJs()
  console.log('同一把尺子：MEASURE_JS 从冻结脚本逐字抽出 ' + String(measureJs.length) + ' 字符（未重写测量口径）')

  const a2Path = join(EVID, A2_FILE)
  const aPath = join(EVID, A_FILE)
  if (!existsSync(a2Path) || !existsSync(aPath)) {
    console.error('A2-SHOT FAIL（环境不可用，退出码 2）：缺 ' + aPath + ' 或 ' + a2Path)
    process.exit(2)
  }
  const pageA = readFileSync(aPath, 'utf8')
  const pageA2 = readFileSync(a2Path, 'utf8')

  /* ── [1/6] 静态核对：V-A2 变体层的颜色字面量必须都在 FR-10 白名单里 ── */
  console.log('\n[1/6] 静态核对（V-A2 变体层的颜色字面量 · 只扫生效文本、先剥注释）')
  for (const p of paletteCheck(pageA2)) failures.push('V-A2 ' + p)
  console.log('  ' + (failures.length === 0 ? 'OK 变体层没有色板外颜色字面量' : 'FAIL 见下'))

  const dir = mkdtempSync(join(tmpdir(), 'a2-shot-'))
  const baseArgs = (): string[] => ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-component-update', '--disable-background-networking', '--disable-sync',
    `--user-data-dir=${join(dir, 'profile-' + String(Math.floor(Date.now() % 100000)) + '-' + String(profileSeq++))}`]
  let profileSeq = 0

  /** 页内脚本注进页面副本（MEASURE_JS + A2_JS 各写各的 #diag / #diag2）。 */
  const injected = (page: string, state: string): string =>
    page.replace('</body>', measureJs.replace('__STATE__', state) + A2_JS.replace('__STATE__', state) + '</body>')

  async function domDiag(page: string, state: string, label: string, height: number):
  Promise<{ d: Diag; a2: A2Diag } | undefined> {
    const copy = join(dir, label + '-' + String(height) + '.html')
    writeFileSync(copy, injected(page, state))
    const r = await runChrome(chrome, [
      ...baseArgs(), '--force-device-scale-factor=1',
      `--window-size=${String(SHOT_WIDTH)},${String(height)}`, '--dump-dom',
      `file://${copy}?state=${state}&annot=0`,
    ], { settleMs: 2_000 })
    if (!r.ok) { failures.push(label + '：--dump-dom 失败（' + String(r.why) + '）'); return undefined }
    const d = diagText(r.out, 'diag') as unknown as Diag | undefined
    const a2 = diagText(r.out, 'diag2') as unknown as A2Diag | undefined
    if (d === undefined || d.error !== undefined || a2 === undefined || a2.error !== undefined) {
      failures.push(label + '：未读到 #diag/#diag2（' + String(d?.error ?? a2?.error ?? '无') + '）')
      return undefined
    }
    return { d, a2 }
  }

  async function shot(page: string, state: string, out: string, height: number): Promise<boolean> {
    const copy = join(dir, 'shot-' + String(profileSeq) + '-' + out.split('/').pop())
    writeFileSync(copy, page)
    rmSync(out, { force: true })
    const r = await runChrome(chrome, [
      ...baseArgs(), `--force-device-scale-factor=${String(SCALE)}`,
      '--run-all-compositor-stages-before-draw',
      `--window-size=${String(SHOT_WIDTH)},${String(height)}`,
      `--screenshot=${out}`, `file://${copy}?state=${state}&annot=0`,
    ], { waitForFile: out })
    if (!r.ok || !existsSync(out)) {
      failures.push('出图失败 ' + out + '：' + (r.ok ? '截图文件没生成' : String(r.why)))
      return false
    }
    const px = pngSize(out)
    const bytes = statSync(out).size
    if (px === undefined || bytes < MIN_PNG_BYTES) {
      failures.push('出图不是合法 PNG 或体量过小：' + out + '（' + String(bytes) + ' 字节）')
      return false
    }
    console.log('  OK ' + out.split('/').pop() + ' ｜ ' + String(px.w) + '×' + String(px.h)
      + ' = CSS ' + String(px.w / SCALE) + '×' + String(px.h / SCALE) + ' ｜ ' + (bytes / 1024).toFixed(0) + ' KB')
    return true
  }

  try {
    /* ── [2/6] 出图：V-A2 交付图 + 两张对照用的临时图 ── */
    console.log('\n[2/6] 出图（2 倍图 · --window-size=1280,800 · --hide-scrollbars · --run-all-compositor-stages-before-draw）')
    const a2Png = join(EVID, 'variant-A2-1280-inflight.png')
    const okA2 = await shot(pageA2, 'inflight', a2Png, SHOT_HEIGHT)
    const tmpA = join(dir, 'A-1280-inflight.png')
    const tmpA2 = join(dir, 'A2-1280-inflight.png')
    await shot(pageA, 'inflight', tmpA, SHOT_HEIGHT)
    await shot(pageA2, 'inflight', tmpA2, SHOT_HEIGHT)
    if (okA2) {
      const px = pngSize(a2Png)
      if (px === undefined || px.w !== SHOT_WIDTH * SCALE || px.h !== SHOT_HEIGHT * SCALE) {
        failures.push('交付图视口不是 ' + String(SHOT_WIDTH * SCALE) + '×' + String(SHOT_HEIGHT * SCALE)
          + '（实测 ' + String(px?.w) + '×' + String(px?.h) + '）')
      }
    }
    /* 模块区在首屏之下：另出一张高窗图（2610 高），只为把「为何做 / 解决什么」收进画布。
       高窗会不会改布局？下面用 tabsTop / whyTop 的实测值交叉核对（必须与 800 窗完全一致）。 */
    const tmpATall = join(dir, 'A-tall.png')
    const tmpA2Tall = join(dir, 'A2-tall.png')
    await shot(pageA, 'inflight', tmpATall, TALL_HEIGHT)
    await shot(pageA2, 'inflight', tmpA2Tall, TALL_HEIGHT)

    /* ── [3/6] 实测：V-A2 在途 + V-A 基线（同一段页内脚本）── */
    console.log('\n[3/6] 同一把尺子实测（--dump-dom · 视口高 ' + String(VIEWPORT_H) + ' 那一档 · 1280 在途）')
    const a2Inflight = await domDiag(pageA2, 'inflight', 'a2-inflight', SHOT_HEIGHT)
    const aInflight = await domDiag(pageA, 'inflight', 'a-inflight', SHOT_HEIGHT)
    const a2Tall = await domDiag(pageA2, 'inflight', 'a2-tall', TALL_HEIGHT)
    const aTall = await domDiag(pageA, 'inflight', 'a-tall', TALL_HEIGHT)
    const a2Terminal = await domDiag(pageA2, 'terminal', 'a2-terminal', SHOT_HEIGHT)
    const aTerminal = await domDiag(pageA, 'terminal', 'a-terminal', SHOT_HEIGHT)

    const report = (name: string, d: Diag, a2: A2Diag): void => {
      const v = d.variety
      console.log('  ' + name + '：tabsTop=' + String(d.tabsTop) + ' · 胶囊 ' + String(v.pills) + ' · 前景 ' + String(v.fg)
        + ' · 底色 ' + String(v.bg) + ' · 字重 ' + String(v.fontWeight) + ' · 字号 ' + String(v.fontSize)
        + ' · 圆角 ' + String(v.radius) + ' · 边线 ' + String(v.borderColor)
        + ' · 最小命中区 ' + String(d.minTargetW) + '×' + String(d.minTargetH) + ' · 最小字号 ' + String(d.minFontSize) + 'px'
        + ' · 最小对比度 ' + String(d.contrast.min) + ':1 · 内层滚动 ' + String(d.innerScroll)
        + ' · 溢出 ' + (d.docOverflow || d.shellOverflow ? '有' : '无'))
      console.log('     字号档：' + v.fsValues.join(' / ') + ' ｜ 前景：' + v.fgValues.join(' ')
        + ' ｜ 底色：' + v.bgValues.join(' '))
      console.log('     H1 ' + String(a2.h1Ratio) + '（h1 ' + String(a2.h1.size) + ' ÷ 正文 ' + String(a2.body.size) + '）'
        + ' ｜ H2 ' + String(a2.modules.h2Ratio) + '（模块间 ' + String(a2.modules.moduleGap)
        + ' ÷ 模块内 ' + String(a2.modules.innerGap) + (a2.modules.sideBySide ? ' · 并排结构' : '') + '）'
        + ' ｜ H3 模块标题 ' + String(a2.moduleTitle.size) + '/' + String(a2.moduleTitle.weight)
        + ' vs 正文 ' + String(a2.body.size) + '/' + String(a2.body.weight)
        + ' ｜ H4 带内字号 ' + a2.band.sizes.join('/') + '（最小差 ' + String(a2.band.minDiff) + '）'
        + ' ｜ H5 主色文字 ' + String(a2.accent.roleCount) + ' 类 [' + a2.accent.roles.join(', ') + ']')
    }
    if (a2Inflight !== undefined) report('V-A2 在途', a2Inflight.d, a2Inflight.a2)
    if (aInflight !== undefined) report('V-A  在途（改前基线）', aInflight.d, aInflight.a2)
    if (a2Terminal !== undefined) report('V-A2 终态', a2Terminal.d, a2Terminal.a2)
    if (aTerminal !== undefined) report('V-A  终态（改前基线）', aTerminal.d, aTerminal.a2)

    /* 高窗 vs 800 窗：布局一致性核对（出对照图的前提） */
    if (a2Inflight !== undefined && a2Tall !== undefined) {
      const s1 = a2Inflight.a2.geometry, s2 = a2Tall.a2.geometry
      const same = s1.tabsTop === s2.tabsTop && s1.whyTop === s2.whyTop
      console.log('  高窗布局一致性：V-A2 tabsTop ' + String(s1.tabsTop) + ' vs ' + String(s2.tabsTop)
        + ' · whyTop ' + String(s1.whyTop) + ' vs ' + String(s2.whyTop) + ' → ' + (same ? '✓ 一致' : '✗ 不一致'))
      if (!same) failures.push('V-A2：高窗改变了布局（tabsTop/whyTop 与 800 窗不一致），模块区对照图不可信')
    }
    if (aInflight !== undefined && aTall !== undefined) {
      const s1 = aInflight.a2.geometry, s2 = aTall.a2.geometry
      const same = s1.tabsTop === s2.tabsTop && s1.whyTop === s2.whyTop
      console.log('  高窗布局一致性：V-A  tabsTop ' + String(s1.tabsTop) + ' vs ' + String(s2.tabsTop)
        + ' · whyTop ' + String(s1.whyTop) + ' vs ' + String(s2.whyTop) + ' → ' + (same ? '✓ 一致' : '✗ 不一致'))
      if (!same) failures.push('V-A：高窗改变了布局（tabsTop/whyTop 与 800 窗不一致），模块区对照图不可信')
    }

    /* ── [4/6] 断言（阈值只在这里）── */
    console.log('\n[4/6] 断言（七项收敛 + 硬几何 + H1～H5 + FR-9 修订 / FR-13 / FR-11）')
    const bad = (m: string): void => { failures.push('V-A2：' + m) }
    if (a2Inflight === undefined) {
      bad('在途态量不到，其余断言跳过（退出码 1）')
    } else {
      const d = a2Inflight.d, a2 = a2Inflight.a2, v = d.variety
      /* 七项收敛 */
      const varietyOk = v.pills <= VARIETY_MAX.pills && v.fg <= VARIETY_MAX.fg && v.bg <= VARIETY_MAX.bg
        && v.fontWeight <= VARIETY_MAX.fontWeight && v.fontSize <= VARIETY_MAX.fontSize
        && v.radius <= VARIETY_MAX.radius && v.borderColor <= VARIETY_MAX.borderColor
      console.log('  ' + (varietyOk ? '✓' : '✗') + ' FR-10 七项：胶囊 ' + String(v.pills) + '/' + String(VARIETY_MAX.pills)
        + ' · 前景 ' + String(v.fg) + '/' + String(VARIETY_MAX.fg) + ' · 底色 ' + String(v.bg) + '/' + String(VARIETY_MAX.bg)
        + ' · 字重 ' + String(v.fontWeight) + '/' + String(VARIETY_MAX.fontWeight) + ' · 字号 ' + String(v.fontSize) + '/' + String(VARIETY_MAX.fontSize)
        + ' · 圆角 ' + String(v.radius) + '/' + String(VARIETY_MAX.radius) + ' · 边线 ' + String(v.borderColor) + '/' + String(VARIETY_MAX.borderColor))
      if (!varietyOk) bad('七项收敛不达标')
      /* 硬几何 */
      const geoOk = d.tabsTop <= TABS_TOP_MAX && !d.docOverflow && !d.shellOverflow && d.innerScroll === 0
        && d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN && d.minFontSize >= FONT_MIN
        && d.contrast.violations.length === 0
      console.log('  ' + (geoOk ? '✓' : '✗') + ' 硬几何：tabsTop ' + String(d.tabsTop) + '≤' + String(TABS_TOP_MAX)
        + ' · 内层滚动 ' + String(d.innerScroll) + ' · 横向溢出 ' + (d.docOverflow || d.shellOverflow ? '有' : '无')
        + ' · 最小命中区 ' + String(d.minTargetW) + '×' + String(d.minTargetH) + ' · 最小真文字 ' + String(d.minFontSize) + 'px'
        + ' · 最小对比度 ' + String(d.contrast.min) + ':1（违规 ' + String(d.contrast.violations.length) + ' 条）')
      if (!geoOk) bad('硬几何不达标（' + d.contrast.violations.slice(0, 3).join('；') + '）')
      /* FR-12 H1～H5 */
      const h1ok = a2.h1Ratio !== null && a2.h1Ratio >= H1_MIN
      console.log('  ' + (h1ok ? '✓' : '✗') + ' H1 h1÷正文 = ' + String(a2.h1.size) + '÷' + String(a2.body.size)
        + ' = ' + String(a2.h1Ratio) + ' ≥ ' + String(H1_MIN))
      if (!h1ok) bad('H1 不达标')
      const h2ok = a2.modules.h2Ratio !== null && a2.modules.h2Ratio >= H2_MIN
      console.log('  ' + (h2ok ? '✓' : '✗') + ' H2 模块间距÷模块内间距 = ' + String(a2.modules.moduleGap) + '÷' + String(a2.modules.innerGap)
        + ' = ' + String(a2.modules.h2Ratio) + ' ≥ ' + String(H2_MIN) + '（模块数 ' + String(a2.modules.count)
        + ' · 逐段模块间距 ' + a2.modules.gaps.join('/') + '）')
      if (!h2ok) bad('H2 不达标')
      const h3ok = a2.moduleTitle.size !== a2.body.size && a2.moduleTitle.weight !== a2.body.weight
        && a2.moduleTitle.size === H3_SIZE && a2.body.size === H3_BODY_SIZE
      console.log('  ' + (h3ok ? '✓' : '✗') + ' H3 模块标题 ' + String(a2.moduleTitle.size) + '/' + String(a2.moduleTitle.weight)
        + ' vs 正文 ' + String(a2.body.size) + '/' + String(a2.body.weight) + '（字号与字重都要不同）')
      if (!h3ok) bad('H3 不达标')
      const h4ok = a2.band.sizes.length === 3 && a2.band.minDiff !== null && a2.band.minDiff >= H4_DIFF_MIN
      console.log('  ' + (h4ok ? '✓' : '✗') + ' H4 卡内三格字号档 = ' + a2.band.sizes.join(' / ')
        + '（' + String(a2.band.sizes.length) + ' 档 · 最小差 ' + String(a2.band.minDiff) + ' ≥ ' + String(H4_DIFF_MIN) + '）')
      if (!h4ok) bad('H4 不达标')
      const h5ok = a2.accent.roleCount <= H5_MAX
      console.log('  ' + (h5ok ? '✓' : '✗') + ' H5 主色文字类数 = ' + String(a2.accent.roleCount) + ' ≤ ' + String(H5_MAX)
        + '（' + a2.accent.roles.join(' / ') + '）')
      if (!h5ok) bad('H5 不达标')
      /* FR-9（D-7 修订后的三条） */
      const f9 = a2.fr9
      const oneRow = f9.rowOverlap > 0 && f9.actionTopsUnique === 1
      const leftAligned = f9.barLeft !== null && f9.cardContentLeft !== null
        && Math.abs(f9.barLeft - f9.cardContentLeft) <= 1
        && f9.backLeft !== null && Math.abs(f9.backLeft - f9.cardContentLeft) <= 1
      const atCardTop = f9.barTop !== null && f9.h1Top !== null && f9.barTop < f9.h1Top
      const dangerOk = f9.dangerIsLast && f9.dangerGap !== null && f9.dangerGap >= DANGER_GAP_MIN
      const notStretched = f9.actions.every(x => x.padX !== null && x.padX >= 22 && x.padX <= 30)
      const fr9ok = oneRow && leftAligned && atCardTop && dangerOk && notStretched
      console.log('  ' + (fr9ok ? '✓' : '✗') + ' FR-9（修订版）：同一行(top 去重 ' + String(f9.rowTopsUnique)
        + ' · 共同纵向带 ' + String(f9.rowOverlap) + 'px) · 左缘 ' + String(f9.barLeft) + ' = 卡片内容左缘 '
        + String(f9.cardContentLeft) + ' · 在页标题之上 ' + String(atCardTop) + ' · 危险动作排最后 ' + String(f9.dangerIsLast)
        + ' · 与前一个动作间距 ' + String(f9.dangerGap) + 'px ≥ ' + String(DANGER_GAP_MIN)
        + ' · 不拉伸（按钮宽−文字宽 ' + f9.actions.map(x => String(x.padX)).join('/') + '，余量 ' + String(f9.freeSpaceRight) + 'px）')
      if (!fr9ok) bad('FR-9（修订版）不达标')
      /* FR-13 */
      const fr13 = a2.fr13
      const fr13ok = fr13.form === 0 && fr13.input === 0 && fr13.addBtn === 0 && fr13.rows >= 1
      console.log('  ' + (fr13ok ? '✓' : '✗') + ' FR-13：评论输入框 ' + String(fr13.form) + ' 个 · comment-input '
        + String(fr13.input) + ' · add-comment ' + String(fr13.addBtn) + ' · 评论行还在 ' + String(fr13.rows)
        + ' 条 · 摘要「' + fr13.summary + '」')
      if (!fr13ok) bad('FR-13 不达标')
      /* 窗口行 */
      const wr = a2.windowRow
      const winOk = wr.label === '窗口' && wr.texts.length === 2 && wr.texts.every(t => !t.startsWith('窗口'))
        && wr.gap !== null && wr.gap >= 8
      console.log('  ' + (winOk ? '✓' : '✗') + ' 窗口行：行首标签「' + String(wr.label) + '」· 按钮文本 '
        + JSON.stringify(wr.texts) + ' · 两按钮间隔 ' + String(wr.gap) + 'px（标签↔首按钮 ' + String(wr.labelGap) + 'px）')
      if (!winOk) bad('窗口行不达标')
      /* Tab（E） */
      const tb = a2.tabs
      const tabsOk = tb.gap === 8 && tb.activeColor === 'rgb(29, 29, 29)' && tb.activeUnderlineW === '2px'
        && tb.activeUnderlineColor === 'rgb(0, 113, 227)'
      console.log('  ' + (tabsOk ? '✓' : '✗') + ' E 页签：间距 ' + String(tb.gap) + 'px · 选中文字 ' + String(tb.activeColor)
        + '/' + String(tb.activeWeight) + ' · 下划线 ' + String(tb.activeUnderlineW) + ' ' + String(tb.activeUnderlineColor))
      if (!tabsOk) bad('E 页签不达标')
      /* 卡内块间 20 / 行内 6 */
      const gaps = a2.blockGaps.map(g => g.gap)
      const blocksOk = gaps.every(g => Math.abs(g - 20) <= 0.6 || Math.abs(g - 6) <= 0.6)
      console.log('  ' + (blocksOk ? '✓' : '✗') + ' 卡内块间：' + a2.blockGaps.map(g => g.from + '→' + g.to + ' ' + String(g.gap)).join(' · '))
      if (!blocksOk) bad('卡内块间距不达标（应为 20px / 行内 6px）')
      /* FR-11 后果披露没被碰 */
      const f11 = a2.fr11
      const f11ok = f11.descId === 'act-move-desc' && f11.descHidden && f11.matches
      console.log('  ' + (f11ok ? '✓' : '✗') + ' FR-11：aria-describedby=' + String(f11.descId) + ' 视觉隐藏 '
        + String(f11.descHidden) + ' · 文本 === 按钮 title ' + String(f11.matches))
      if (!f11ok) bad('FR-11 的后果披露被改动了')
    }
    /* 终态也要过色板与几何 */
    if (a2Terminal !== undefined) {
      const d = a2Terminal.d, v = d.variety
      const ok = v.pills <= VARIETY_MAX.pills && v.fg <= VARIETY_MAX.fg && v.bg <= VARIETY_MAX.bg
        && v.fontWeight <= VARIETY_MAX.fontWeight && v.fontSize <= VARIETY_MAX.fontSize
        && v.radius <= VARIETY_MAX.radius && v.borderColor <= VARIETY_MAX.borderColor
        && d.tabsTop <= TABS_TOP_MAX && !d.docOverflow && !d.shellOverflow && d.innerScroll === 0
        && d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN && d.minFontSize >= FONT_MIN
        && d.contrast.violations.length === 0
      const a2t = a2Terminal.a2
      const h4t = a2t.band.sizes.length === 3 && a2t.band.minDiff !== null && a2t.band.minDiff >= H4_DIFF_MIN
      console.log('  ' + (ok && h4t ? '✓' : '✗') + ' 终态复核：tabsTop ' + String(d.tabsTop) + ' · 七项 '
        + [v.pills, v.fg, v.bg, v.fontWeight, v.fontSize, v.radius, v.borderColor].join('/')
        + ' · 最小对比度 ' + String(d.contrast.min) + ':1 · 带内字号 ' + a2t.band.sizes.join('/'))
      if (!ok) bad('终态复核不达标')
      if (!h4t) bad('终态 H4 不达标')
    }

    /* ── [5/6] metrics-A2.txt ── */
    console.log('\n[5/6] metrics-A2.txt')
    const metrics = buildMetrics({
      a2Inflight, aInflight, a2Terminal, aTerminal,
    })
    writeFileSync(join(EVID, 'metrics-A2.txt'), metrics)
    console.log('  OK → ' + join(EVID, 'metrics-A2.txt'))

    /* ── [6/6] 两张对照图（PIL）── */
    console.log('\n[6/6] 对照图（V-A vs V-A2 · 上下对照 · 英文标题）')
    const py = join(dir, 'compare.py')
    writeFileSync(py, COMPARE_PY)
    const runPy = (spec: Record<string, unknown>, name: string): void => {
      try {
        const out = execFileSync(python, [py, JSON.stringify(spec)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        console.log('  OK ' + name + ' → ' + String(spec['out']) + ' ｜ ' + out.trim())
      } catch (e) {
        const why = (e as Error).message.split('\n').slice(-3).join(' ').slice(0, 300)
        console.error('  FAIL ' + name + '：' + why)
        failures.push(name + ' 生成失败：' + why)
      }
    }
    const headH = a2Inflight !== undefined && a2Inflight.d.tabsTop > 0 ? a2Inflight.d.tabsTop + 48 : 700
    runPy({
      out: join(EVID, 'variant-A-vs-A2-head.png'),
      panels: [
        { file: tmpA, tag: 'V-A', x: 0, y: 0, w: SHOT_WIDTH, h: headH,
          cap: 'BEFORE V-A: title 20px, actions at card BOTTOM, comment box present' },
        { file: tmpA2, tag: 'V-A2', x: 0, y: 0, w: SHOT_WIDTH, h: headH,
          cap: 'AFTER V-A2: title 24px, actions at card TOP-LEFT, comment box removed' },
      ],
    }, 'variant-A-vs-A2-head.png')

    if (aInflight !== undefined && a2Inflight !== undefined) {
      const ga = aInflight.a2.geometry, g2 = a2Inflight.a2.geometry
      const y0a = Math.max(0, (ga.whyTop ?? 0) - 20), y1a = (ga.problemBottom ?? 0) + 20
      const y0b = Math.max(0, (g2.whyTop ?? 0) - 20), y1b = (g2.problemBottom ?? 0) + 20
      runPy({
        out: join(EVID, 'variant-A-vs-A2-modules.png'),
        panels: [
          { file: tmpATall, tag: 'V-A', x: 0, y: y0a, w: SHOT_WIDTH, h: y1a - y0a,
            cap: 'BEFORE V-A: left 150px title rail + right body (reads like a table)' },
          { file: tmpA2Tall, tag: 'V-A2', x: 0, y: y0b, w: SHOT_WIDTH, h: y1b - y0b,
            cap: 'AFTER V-A2: title row on top + body below, 36px between modules / 8px inside' },
        ],
      }, 'variant-A-vs-A2-modules.png')
    } else {
      failures.push('模块区对照图跳过：基线或 V-A2 的模块几何量不到')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error('\nA2-SHOT FAIL（退出码 1）')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\nA2-SHOT PASS（V-A2 样品页 + 1280 在途 2 倍图 + 两张对照图 + 同一把尺子实测：'
    + '七项收敛全过 / tabsTop ≤ ' + String(TABS_TOP_MAX) + ' / 命中区 ≥' + String(TARGET_MIN)
    + ' / 真文字 ≥' + String(FONT_MIN) + 'px 且 ≥' + String(TEXT_CONTRAST_MIN) + ':1 / H1 ≥' + String(H1_MIN)
    + ' / H2 ≥' + String(H2_MIN) + ' / H3 ' + String(H3_SIZE) + '/' + String(H3_BODY_SIZE)
    + ' / H4 三档差 ≥' + String(H4_DIFF_MIN) + 'px / H5 ≤' + String(H5_MAX) + ' 类）')
}

/* ───────────────────────────────────────────────────── metrics-A2.txt */

interface Bundle {
  a2Inflight?: { d: Diag; a2: A2Diag } | undefined
  aInflight?: { d: Diag; a2: A2Diag } | undefined
  a2Terminal?: { d: Diag; a2: A2Diag } | undefined
  aTerminal?: { d: Diag; a2: A2Diag } | undefined
}

/** 排一张「值 + 判定」的表（与 metrics.txt 同风格：阈值也印出来，便于人复核）。 */
function table(rows: string[][], widths: number[]): string {
  const out: string[] = []
  for (const r of rows) {
    let line = ''
    for (let i = 0; i < r.length; i++) {
      const w = widths[i] ?? 12
      const cell = (r[i] ?? '')
      // 中文字符按 2 列宽估算，保证表格不歪
      const visual = [...cell].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
      line += cell + ' '.repeat(Math.max(1, w - visual))
    }
    out.push(line.trimEnd())
  }
  return out.join('\n')
}

function buildMetrics(b: Bundle): string {
  const out: string[] = []
  const hr = '='.repeat(112)
  out.push('需求详情页 V-A2（V-A 的三处 D-7 修订）· 同一把尺子实测（REQ-261005155003-f32f）')
  out.push(hr)
  out.push('口径：1280 在途（implementing）· --dump-dom（实测视口 713 高）· 同一段页内测量脚本 ·')
  out.push('      同一份标本 DOM（真实 buildReportShell + 真实 13 片 CSS + 同一份 mock 数据）·')
  out.push('      本版 V-A2 = V-A 的 CSS 覆盖层 + 两处 DOM 删除/去重（见「三处修改」节）。')
  out.push('      命令：npx tsx scripts/req-detail-ui-variants-a2-shot.mts')
  out.push('      注：「同一把尺子」= 七项/几何/对比度的测量代码在运行时从冻结脚本')
  out.push('      scripts/req-detail-ui-variants-shot.mts 的 MEASURE_JS 逐字抽出后注入（不是重写）。')
  out.push('')

  /* ① 七项样式收敛 */
  out.push('① 七项样式收敛（改前 = V-A 实测；改后 = V-A2 实测；上限与 metrics.txt 同一批）')
  out.push('-' * 112)
  const V = (x?: { d: Diag }): Variety | undefined => x?.d.variety
  const va = V(b.aInflight), v2 = V(b.a2Inflight), vt = V(b.a2Terminal), vat = V(b.aTerminal)
  const rows: string[][] = [['指标', 'V-A（改前）', 'V-A2（改后）', '上限', '判定']]
  const push = (label: string, get: (v: Variety | undefined) => number | undefined, max: number): void => {
    const a = get(va), c = get(v2)
    const ok = c !== undefined && c <= max
    rows.push([label, a === undefined ? '—' : String(a), c === undefined ? '—' : String(c),
      '≤ ' + String(max), (ok ? '✓' : '✗') + ' ' + (c !== undefined && c > max ? '超上限' : '过')])
  }
  push('胶囊数（radius≥100px）', v => v?.pills, VARIETY_MAX.pills)
  push('前景色数', v => v?.fg, VARIETY_MAX.fg)
  push('底色数', v => v?.bg, VARIETY_MAX.bg)
  push('字重数', v => v?.fontWeight, VARIETY_MAX.fontWeight)
  push('字号数', v => v?.fontSize, VARIETY_MAX.fontSize)
  push('圆角数', v => v?.radius, VARIETY_MAX.radius)
  push('边线色数', v => v?.borderColor, VARIETY_MAX.borderColor)
  out.push(table(rows, [26, 14, 14, 10, 14]))
  out.push('')
  if (v2 !== undefined) {
    out.push('  V-A2 取值明细（复核「多出来的那一种是谁」）')
    out.push('    前景色：' + v2.fgValues.join(' · '))
    out.push('    底色  ：' + v2.bgValues.join(' · '))
    out.push('    字号  ：' + v2.fsValues.join(' · '))
    out.push('    字重  ：' + v2.fwValues.join(' · '))
    out.push('    圆角  ：' + v2.radiusValues.join(' · '))
    out.push('    边线色：' + v2.bcValues.join(' · '))
    out.push('    取值落到哪个元素：前景 ' + Object.entries(v2.detail.fg).map(([k, v]) => k + '→' + v).join(' ｜ '))
    out.push('                      底色 ' + Object.entries(v2.detail.bg).map(([k, v]) => k + '→' + v).join(' ｜ '))
    out.push('                      字号 ' + Object.entries(v2.detail.fs).map(([k, v]) => k + 'px→' + v).join(' ｜ '))
    out.push('')
  }

  /* 硬几何 */
  out.push('硬几何（两态都要过）')
  out.push('-' * 112)
  const geo = (label: string, get: (d: Diag) => string, ok: (d: Diag) => boolean, limit: string): void => {
    const a = b.aInflight?.d, c = b.a2Inflight?.d, ct = b.a2Terminal?.d
    rows.length = 0
    rows.push([label, 'V-A 在途', 'V-A2 在途', 'V-A2 终态', limit, '判定'])
    rows.push(['', a === undefined ? '—' : get(a), c === undefined ? '—' : get(c), ct === undefined ? '—' : get(ct), '',
      (c !== undefined && ok(c) && (ct === undefined || ok(ct)) ? '✓' : '✗')])
    out.push(table(rows, [24, 14, 14, 14, 12, 8]))
  }
  geo('tabsTop', d => String(d.tabsTop), d => d.tabsTop <= TABS_TOP_MAX, '≤ ' + String(TABS_TOP_MAX))
  geo('内层滚动容器', d => String(d.innerScroll), d => d.innerScroll === 0, '= 0')
  geo('横向溢出', d => (d.docOverflow || d.shellOverflow ? '有' : '无'), d => !d.docOverflow && !d.shellOverflow, '= 无')
  geo('最小命中区（宽×高）', d => d.minTargetW + '×' + d.minTargetH, d => d.minTargetW >= TARGET_MIN && d.minTargetH >= TARGET_MIN, '≥ 24×24')
  geo('最小真文字字号', d => String(d.minFontSize), d => d.minFontSize >= FONT_MIN, '≥ ' + String(FONT_MIN))
  geo('真文字最小对比度', d => String(d.contrast.min) + ':1', d => d.contrast.violations.length === 0, '≥ 4.5:1')
  out.push('')
  if (b.a2Inflight !== undefined) {
    out.push('  最小命中区落在：' + b.a2Inflight.d.minTargetWWhat + ' ／ 最矮：' + b.a2Inflight.d.minTargetHWhat)
    out.push('  最小字号落在  ：' + b.a2Inflight.d.minFontWhat + ' ／ 最小对比度：' + b.a2Inflight.d.contrast.minWhat)
    out.push('')
  }

  /* ② FR-12 H1～H5 */
  out.push('② FR-12 的 H1～H5：改前 → 改后（改前 = V-A 实测；另附需求文档登记的现版值）')
  out.push('-' * 112)
  const A = b.aInflight?.a2, B = b.a2Inflight?.a2
  const f = (x: number | null | undefined): string => x === null || x === undefined ? '—' : String(x)
  rows.length = 0
  rows.push(['#', '判据', '阈值', '需求文档登记的现版', 'V-A（改前·本脚本实测）', 'V-A2（改后·本脚本实测）', '判定'])
  rows.push(['H1', 'h1 字号 ÷ 正文字号', '≥ 1.8', '1.54 ✗',
    f(A?.h1Ratio) + '（' + f(A?.h1.size) + '÷' + f(A?.body.size) + '）✗',
    f(B?.h1Ratio) + '（' + f(B?.h1.size) + '÷' + f(B?.body.size) + '）',
    B?.h1Ratio !== null && B?.h1Ratio !== undefined && B.h1Ratio >= H1_MIN ? '✓' : '✗'])
  rows.push(['H2', '模块间距 ÷ 模块内间距', '≥ 3', '1.25 ✗',
    f(A?.modules.moduleGap) + '÷' + f(A?.modules.innerGap) + ' = ' + f(A?.modules.h2Ratio) + '（分母 0）✗',
    f(B?.modules.moduleGap) + '÷' + f(B?.modules.innerGap) + ' = ' + f(B?.modules.h2Ratio),
    B?.modules.h2Ratio !== null && B?.modules.h2Ratio !== undefined && B.modules.h2Ratio >= H2_MIN ? '✓' : '✗'])
  rows.push(['H3', '模块标题 vs 正文：字号与字重都不同', '15/600 vs 13/400', '13/600 vs 13/400 ✗',
    f(A?.moduleTitle.size) + '/' + f(A?.moduleTitle.weight) + ' vs ' + f(A?.body.size) + '/' + f(A?.body.weight),
    f(B?.moduleTitle.size) + '/' + f(B?.moduleTitle.weight) + ' vs ' + f(B?.body.size) + '/' + f(B?.body.weight),
    B !== undefined && B.moduleTitle.size !== B.body.size && B.moduleTitle.weight !== B.body.weight ? '✓' : '✗'])
  rows.push(['H4', '卡内三格字号档数（两两差 ≥2px）', '= 3 且差 ≥2px', '—',
    (A?.band.sizes.join('/') ?? '—') + '（最小差 ' + f(A?.band.minDiff) + '）',
    (B?.band.sizes.join('/') ?? '—') + '（最小差 ' + f(B?.band.minDiff) + '）',
    B !== undefined && B.band.sizes.length === 3 && B.band.minDiff !== null && B.band.minDiff >= H4_DIFF_MIN ? '✓' : '✗'])
  rows.push(['H5', '主色文字类数', '≤ 1', '—',
    String(A?.accent.roleCount ?? '—') + '（' + (A?.accent.roles.join(', ') ?? '') + '）',
    String(B?.accent.roleCount ?? '—') + '（' + (B?.accent.roles.join(', ') ?? '') + '）',
    B !== undefined && B.accent.roleCount <= H5_MAX ? '✓' : '✗'])
  out.push(table(rows, [5, 30, 18, 20, 26, 26, 6]))
  out.push('')
  out.push('  口径（H2，逐字写清，避免"数字对了但不知道量的是什么"）：')
  out.push('    · 模块间距 = 相邻模块**内容盒**（边框盒 ± 自身 padding/border）之间的垂直距离，取各段最小值。')
  out.push('      V-A 实测 ' + f(A?.modules.moduleGap) + 'px = 上模块下内边距 16 + 发丝线 1 + 下模块上内边距 16；')
  out.push('      V-A2 实测 ' + f(B?.modules.moduleGap) + 'px = 上下各 18px 内边距（发丝线已撤，分界只靠间距 + 标题行）。')
  out.push('      V-A 逐段：' + (A?.modules.gaps.join(' / ') ?? '—') + '；V-A2 逐段：' + (B?.modules.gaps.join(' / ') ?? '—') + '。')
  out.push('    · 模块内间距 = 同一模块内「标题行底边 → 正文顶边」的垂直距离，取各模块最大值。')
  out.push('      V-A 该值为 ' + f(A?.modules.innerGapRaw) + '（负数 = 标题栏与正文栏**并排**，不存在纵向标题↔正文间距，')
  out.push('      这正是「读起来像表格」的机械证据；需求文档登记的 1.25 = 另一套口径（模块间 20 ÷ 模块内 16，测于权威原型），')
  out.push('      在本样品页的 V-A 层上不复现，如实登记）。V-A2 该值 = ' + f(B?.modules.innerGap) + 'px（逐模块 '
    + (B?.modules.items.map(m => String(m.innerGap)).join('/') ?? '—') + '）。')
  out.push('    · H3：V-A 样品页的模块标题是 15/600（V-A 版式层把 --f-h2 提到 15px），并非需求文档登记的 13/600；')
  out.push('      两者都满足「字号与字重都不同」，如实登记口径差异。V-A2 = 15/600（L2）vs 13/400（L3）。')
  out.push('    · H4：只数「带真文字」的元素（标签 / 主值 / 缺口行 / 出处芯片 / 结论词），不数装饰盒。')
  out.push('    · H5：只数「计算样式 color === #0071e3 且带真文字」的元素类别。V-A2 只剩 `.dsh-pm-trunk-open`')
  out.push('      （点开看原文 →）；选中页签走「文字加深 + 主色下划线」（下划线是非文本），故不进这一列。')
  out.push('')

  /* ③ 三处修改 */
  out.push('③ 三处修改（D-7）逐条落地')
  out.push('-' * 112)
  if (B !== undefined) {
    out.push('  ① 动作按钮挪到卡片左上角（FR-9 修订）：')
    out.push('     同一行：四个控件（← 看板 / 提交验收 / 取消立项 / 需人工确认）的 top 去重 = '
      + String(B.fr9.rowTopsUnique) + '（' + B.fr9.rowTops.join('/') + '），共同纵向带 = '
      + String(B.fr9.rowOverlap) + 'px；两个动作按钮的 offsetTop 去重 = ' + String(B.fr9.actionTopsUnique) + '。')
    out.push('     左对齐：操作条左缘 ' + String(B.fr9.barLeft) + ' = 卡片内容区左缘 ' + String(B.fr9.cardContentLeft)
      + '；行首按钮左缘 ' + String(B.fr9.backLeft) + '。')
    out.push('     在页标题之上（卡顶）：barTop ' + String(B.fr9.barTop) + ' < h1Top ' + String(B.fr9.h1Top) + '。')
    out.push('     危险动作：排最后 ' + String(B.fr9.dangerIsLast) + '，与前一个动作间距 ' + String(B.fr9.dangerGap)
      + 'px（父级 gap 12 + margin 14）≥ ' + String(DANGER_GAP_MIN) + 'px。')
    out.push('     不拉伸（宽 = 内容宽）：按钮宽 − 文字宽 = '
      + B.fr9.actions.map(x => x.text + ' ' + String(x.padX)).join(' / ') + '（= 左右内边距 24 + 边框 2）；'
      + '行尾余量 ' + String(B.fr9.freeSpaceRight) + 'px。')
    out.push('  ② 删评论输入框（FR-13）：.dsh-pm-comment-form ' + String(B.fr13.form) + ' 个 · [data-role=comment-input] '
      + String(B.fr13.input) + ' · [data-action=add-comment] ' + String(B.fr13.addBtn)
      + ' · 评论行仍在 ' + String(B.fr13.rows) + ' 条 · 摘要「' + B.fr13.summary + '」+ `::after` 的「▸ 展开」。')
    out.push('     窗口行去重：行首标签「' + String(B.windowRow.label) + '」，按钮文本 '
      + JSON.stringify(B.windowRow.texts) + '；两按钮间隔 ' + String(B.windowRow.gap) + 'px（标签↔首按钮 '
      + String(B.windowRow.labelGap) + 'px）。')
    out.push('  ③ 视觉层级（FR-12）：见上表 H1～H5 与下面的「为层次改了什么」。')
  }
  out.push('')

  /* 为层次改了哪些具体规则 */
  out.push('④ 为「层次」改了什么（逐条可查；全部只在本版覆盖层里，V-A 原层一行未删）')
  out.push('-' * 112)
  const rules: string[] = [
    'A 字阶（令牌单点，页面里不许两套字阶）：L0 页标题 24/600 · 行高 1.25 · 字距 -0.4px；',
    '  L1 状态主值 20/600 + tabular-nums（三格 <b> 与结论词）；L2 模块标题 15/600；',
    '  L3 正文 13/400 · 行高 1.6；L5 元信息/说明 11/400（#6e6e73）。',
    '  ⚠️ L4（12px）没有单占一档 —— 见「偏离与未落地项」①。',
    'B 间距（分组靠比值，不靠 hairline）：模块之间 36px（每块上下各 18px 内边距）· 模块标题↔正文 8px ·',
    '  卡片内块间 20px（逐个块给 margin，不用相邻兄弟选择器：操作行是 DOM 末项、视觉首项）· 行内 4–6px。',
    'C 模块改上下结构：.dsh-pm-trunk-item 由「grid 150px 标题栏 + 1fr 内容栏」改为 display:block；',
    '  标题行 = 15/600 标题 + 11px 副标题 + 右侧来源 chip（margin-left:auto）；正文 = 13/1.6；',
    '  引用行 = 11px 灰 + 主色「点开看原文 →」；trunk-item 的 border-top 发丝线**撤掉** ——',
    '  每个模块的边界信号只有「36px 间距」+「标题行」两个（不再靠 hairline）。',
    'D 主色纪律：主色文字只剩「可点入口」一类（点开看原文）；选中页签文字改正文色（加深）+ 主色下划线；',
    '  其余一律三档灰（#1d1d1f / #6e6e73，装饰性 #86868b 未用于文本）。',
    'E 页签=控件层：.dsh-pm-tabs gap 8px；.dsh-pm-tab.active = 2px 主色下划线 + 文字加重（500），不占卡片层级。',
    '卡内三格：标签 11（L5）/ 主值 20（L1）/ 细节 13（L3）—— 三档、两两差 2/7/9px。',
  ]
  out.push(...rules.map(r => '  ' + r))
  out.push('')

  /* FR-1～FR-11 复核 */
  out.push('⑤ FR-1～FR-11 逐条复核（V-A2 在途态；FR-9 按 D-7 修订后的三条）')
  out.push('-' * 112)
  const d2 = b.a2Inflight?.d
  const A2 = b.a2Inflight?.a2
  const fr = (id: string, ok: boolean, detail: string): void => {
    out.push('  ' + (ok ? '✓' : '✗') + ' ' + id + '：' + detail)
  }
  if (d2 !== undefined && A2 !== undefined) {
    const f1 = d2.fr1
    fr('FR-1 图标 14×14 + aria-hidden + 跟随选中色',
      f1.tabSvgCount === f1.tabCount && f1.svgW === 14 && f1.svgH === 14 && f1.attrsOk && f1.followActive,
      'SVG ' + String(f1.tabSvgCount) + '/' + String(f1.tabCount) + ' · ' + String(f1.svgW) + '×' + String(f1.svgH)
      + ' · 属性齐 ' + String(f1.attrsOk) + ' · 跟随选中色 ' + String(f1.followActive))
    const rings = [d2.fr2.input, d2.fr2.tab, d2.fr2.btn]
    const f2ok = rings.some(r => r !== null && r.w === '2px' && r.style === 'solid' && r.color === 'rgb(0, 113, 227)')
    fr('FR-2 :focus-visible 2px 主色 + 两档偏移（静态）',
      f2ok, rings.filter(r => r !== null).map(r => (r as Ring).w + ' ' + (r as Ring).style + ' ' + (r as Ring).color + ' offset ' + (r as Ring).offset).join(' ｜ '))
    const f3 = d2.fr3
    fr('FR-3 tablist/tab + aria-selected/controls + roving',
      f3.tablist && f3.tabs === 6 && f3.selectedTrue === 1 && f3.controls === 6 && f3.tabindex0 === 1,
      'tabs=' + String(f3.tabs) + ' sel=' + String(f3.selectedTrue) + ' controls=' + String(f3.controls) + ' tabindex0=' + String(f3.tabindex0))
    fr('FR-4 真文字对比度 ≥4.5:1（无违规）', d2.contrast.violations.length === 0,
      '最小 ' + String(d2.contrast.min) + ':1 @ ' + d2.contrast.minWhat)
    fr('FR-5 命中区 ≥24×24', d2.minTargetW >= TARGET_MIN && d2.minTargetH >= TARGET_MIN,
      String(d2.minTargetW) + '×' + String(d2.minTargetH) + ' @ ' + d2.minTargetHWhat)
    fr('FR-6 reduced-motion 时长归零', d2.fr6.reducedMotion && d2.fr6.transitionDuration === '0s',
      'reduced=' + String(d2.fr6.reducedMotion) + ' duration=' + d2.fr6.transitionDuration)
    fr('FR-7 最小真文字 ≥11px', d2.minFontSize >= FONT_MIN, String(d2.minFontSize) + 'px @ ' + d2.minFontWhat)
    const f8 = d2.fr8
    fr('FR-8 阶段条 ✓/▸ · 缺口 !!/!/· · 不溢出',
      f8.markerHasCheck && f8.markerHasArrow && !f8.dotOverflow && f8.gapRed.startsWith('!!') && f8.gapYellow.startsWith('!'),
      '标记 ' + JSON.stringify(f8.seenMarkers.slice(0, 4)) + ' · 缺口 ' + f8.gapRed + '/' + f8.gapYellow + '/' + f8.gapGray)
    const f9 = A2.fr9
    fr('FR-9（D-7 修订）动作同组 · 排最后且 ≥24px · 不拉伸 · offsetTop 相同',
      f9.rowOverlap > 0 && f9.actionTopsUnique === 1 && f9.dangerIsLast && (f9.dangerGap ?? 0) >= DANGER_GAP_MIN
      && f9.actions.every(x => x.padX !== null && x.padX >= 22 && x.padX <= 30)
      && f9.barLeft !== null && f9.cardContentLeft !== null && Math.abs(f9.barLeft - f9.cardContentLeft) <= 1,
      '① 同组/同一行：共同纵向带 ' + String(f9.rowOverlap) + 'px、动作 offsetTop 去重 ' + String(f9.actionTopsUnique)
      + '；② 危险动作排最后 ' + String(f9.dangerIsLast) + '，与前一个动作 ' + String(f9.dangerGap) + 'px ≥ ' + String(DANGER_GAP_MIN)
      + '；③ 不拉伸：按钮宽−文字宽 ' + f9.actions.map(x => String(x.padX)).join('/')
      + '，动作组左端 ' + String(f9.barLeft) + ' = 卡片内容左缘 ' + String(f9.cardContentLeft))
    const vt2 = b.a2Inflight?.d.variety
    fr('FR-10 视觉语言：七项收敛 + 色板单点',
      vt2 !== undefined && vt2.pills <= 5 && vt2.fg <= 5 && vt2.bg <= 4 && vt2.fontWeight <= 3 && vt2.fontSize <= 5
      && vt2.radius <= 2 && vt2.borderColor <= 2,
      vt2 === undefined ? '量不到' : ['胶囊 ' + String(vt2.pills), '前景 ' + String(vt2.fg), '底色 ' + String(vt2.bg),
        '字重 ' + String(vt2.fontWeight), '字号 ' + String(vt2.fontSize), '圆角 ' + String(vt2.radius),
        '边线 ' + String(vt2.borderColor)].join(' · '))
    const f11 = A2.fr11
    const f11old = d2.fr11
    fr('FR-11 文案收敛（未被本次改动碰到）',
      !f11old.hasStageLabel && f11old.consequenceNodes === 0 && f11old.humanOnlyText === '需人工确认'
      && f11old.humanOnlyTrue === 2 && f11.descId === 'act-move-desc' && f11.descHidden && f11.matches,
      '无「本阶段操作」=' + String(!f11old.hasStageLabel) + ' · 常驻后果节点 ' + String(f11old.consequenceNodes)
      + ' · 行尾标「' + f11old.humanOnlyText + '」· data-human-only=' + String(f11old.humanOnlyTrue)
      + ' · aria-describedby=' + String(f11.descId) + ' 视觉隐藏 ' + String(f11.descHidden)
      + ' · 文本 === 按钮 title ' + String(f11.matches))
    fr('FR-12 视觉层级 H1～H5', A2.h1Ratio !== null && A2.h1Ratio >= H1_MIN
      && A2.modules.h2Ratio !== null && A2.modules.h2Ratio >= H2_MIN
      && A2.moduleTitle.size !== A2.body.size && A2.moduleTitle.weight !== A2.body.weight
      && A2.band.sizes.length === 3 && A2.band.minDiff !== null && A2.band.minDiff >= H4_DIFF_MIN
      && A2.accent.roleCount <= H5_MAX,
      'H1 ' + String(A2.h1Ratio) + ' · H2 ' + String(A2.modules.h2Ratio) + ' · H3 ' + String(A2.moduleTitle.size) + '/'
      + String(A2.moduleTitle.weight) + ' vs ' + String(A2.body.size) + '/' + String(A2.body.weight) + ' · H4 '
      + A2.band.sizes.join('/') + ' · H5 ' + String(A2.accent.roleCount))
    fr('FR-13 详情页移除评论输入入口', A2.fr13.form === 0 && A2.fr13.input === 0 && A2.fr13.addBtn === 0 && A2.fr13.rows >= 1,
      '输入框 ' + String(A2.fr13.form) + ' / input ' + String(A2.fr13.input) + ' / add-comment ' + String(A2.fr13.addBtn)
      + ' · 评论行 ' + String(A2.fr13.rows) + ' 条仍在；本版是**样品页**，`board-mount.ts` 的对话 Tab 评论框耦合未触及（超出本页范围）')
  } else {
    out.push('  （在途态量不到，本节没法核 —— 见脚本退出码 1 的失败清单）')
  }
  out.push('')

  /* 卡内块间距明细 */
  if (A2 !== undefined) {
    out.push('卡内块间距（视觉顺序，逐个实测）')
    out.push('-' * 112)
    out.push('  ' + A2.blockGaps.map(g => g.from + ' → ' + g.to + ' = ' + String(g.gap) + 'px').join(' ｜ '))
    out.push('')
    out.push('窗口行 / 页签 / 模块明细')
    out.push('-' * 112)
    out.push('  窗口行：标签「' + String(A2.windowRow.label) + '」· 按钮 ' + JSON.stringify(A2.windowRow.texts)
      + ' · 两按钮间隔 ' + String(A2.windowRow.gap) + 'px')
    out.push('  页签  ：间距 ' + String(A2.tabs.gap) + 'px · 选中文字 ' + String(A2.tabs.activeColor) + '/'
      + String(A2.tabs.activeWeight) + ' · 下划线 ' + String(A2.tabs.activeUnderlineW) + ' ' + String(A2.tabs.activeUnderlineColor))
    out.push('  模块  ：共 ' + String(A2.modules.count) + ' 个 · ' + A2.modules.items.map(m => m.key + '（标题 '
      + String(m.titleSize) + '/' + String(m.titleWeight) + ' · 正文 ' + String(m.lineSize) + '/' + String(m.lineWeight)
      + ' · 标题↔正文 ' + String(m.innerGap) + 'px）').join(' · '))
    out.push('  主色文字：' + A2.accent.roles.join(' / ') + '（' + String(A2.accent.roleCount) + ' 类）；'
      + '页内所有主色元素（含无文本的装饰）＝ ' + A2.accent.all.join(' / '))
    out.push('')
  }

  /* ⑥ 偏离与未落地项 */
  out.push('⑥ 偏离与未落地项（如实登记，不藏）')
  out.push('-' * 112)
  const dev: string[] = [
    '① **L4（说明 12/400）没有单占一档** —— 本版字阶是 5 档 {11, 13, 15, 20, 24}，说明类文字按内容归入',
    '   L5（11px 二级灰：副标题 / 来源 chip / 引用行 / 元信息）或 L3（13px：缺口行 / 评论正文这类正文内容）。',
    '   为什么做不到六档：把六个值同时立起来会与**同一份任务里的硬门禁「字号 ≤5」**以及 H4 打架；',
    '   而 H1（≥1.8）逼出 24 与 13、H3 逼出 15、最小真文字 ≥11 逼出 11、H4（三格三档两两差 ≥2px）逼出 20，',
    '   {11,13,15,20,24} 已是满足全部阈值的最小集合 —— 第六档 12 与它们两两差 <2（12−11=1）也在带内直接违规。',
    '   若要恢复 FR-12 §A 的 12px：代价是「字号数 = 6 > 5」（破 FR-10 §(四) 与本次任务的硬几何表），',
    '   且带内细节必须改用 15px 才能满足 H4 的两两差 —— 这是**人的取舍**，本样品页不自行放宽任何阈值。',
    '② FR-12 §D 里的「细节 L4」在带内换成了 L3（13px）：理由是 12 与标签 11 只差 1px，直接违反同一条 H4。',
    '   带内三档实测 = ' + (B?.band.sizes.join(' / ') ?? '—') + '（差 ' + (B?.band.minDiff === undefined || B?.band.minDiff === null ? '—' : String(B.band.minDiff)) + 'px）。',
    '③ 模块的 border-top 发丝线**撤掉**了（原来靠它分界）：改成只靠「36px 间距 + 标题行」两个信号，',
    '   比 FR-12 §C 的「不许只靠 hairline」更严一档；副作用是长列表里少了横向参考线（如实登记）。',
    '④ 需求文档 FR-12 表里登记的现版 H1 1.54 / H2 1.25 / H3 13-13 是在**权威原型**上量的；',
    '   本样品页的 V-A 层实测为 H1 1.54（一致）/ H2 分母为 0（并排结构，比值不成立）/ H3 15-13（V-A 版式层把 --f-h2 提到 15px）。',
    '   同一批评判结论不变（改前不满足层次感），但数字口径不同，逐条登记如上，不用文档里的数字冒充本脚本的实测。',
    '⑤ 「▸ 展开」是 `.dsh-pm-comments > .dsh-pm-action-bar-label::after` 的伪元素（主色），',
    '   H5 的元素级统计看不到它；它与「点开看原文」属同一类"可点入口"，故 H5 仍记 1 类，但如实说明它的存在。',
    '⑥ 模块区对照图用了 2600 高的窗口把「为何做 / 解决什么」收进画布；',
    '   已用 tabsTop 与 whyTop 实测值与 800 窗逐值比对（脚本里断言一致），确认高窗没有改布局。',
    '⑦ FR-13 只做到"详情页这一面"：`board-mount.ts` 里按作用域取评论框的耦合（对话 Tab 那条链路）',
    '   属 src/ 改动、不在本样品页范围内，本脚本未触及也不声称已验。',
  ]
  out.push(...dev.map(x => '  ' + x))
  out.push('')

  /* 终态块 */
  out.push('终态复核（archived · 只读 · 同一把尺子）—— 色板与几何是页面级约束，两态都要成立')
  out.push('-' * 112)
  if (vt !== undefined && vat !== undefined && b.a2Terminal !== undefined && b.aTerminal !== undefined) {
    rows.length = 0
    rows.push(['指标', 'V-A 终态', 'V-A2 终态', '上限/下限', '判定'])
    const t = (label: string, a: number, c: number, limit: string, ok: boolean): void => {
      rows.push([label, String(a), String(c), limit, ok ? '✓' : '✗'])
    }
    t('胶囊数（radius≥100px）', vat.pills, vt.pills, '≤ 5', vt.pills <= 5)
    t('前景色数', vat.fg, vt.fg, '≤ 5', vt.fg <= 5)
    t('底色数', vat.bg, vt.bg, '≤ 4', vt.bg <= 4)
    t('字重数', vat.fontWeight, vt.fontWeight, '≤ 3', vt.fontWeight <= 3)
    t('字号数', vat.fontSize, vt.fontSize, '≤ 5', vt.fontSize <= 5)
    t('圆角数', vat.radius, vt.radius, '≤ 2', vt.radius <= 2)
    t('边线色数', vat.borderColor, vt.borderColor, '≤ 2', vt.borderColor <= 2)
    t('tabsTop', b.aTerminal.d.tabsTop, b.a2Terminal.d.tabsTop, '≤ ' + String(TABS_TOP_MAX), b.a2Terminal.d.tabsTop <= TABS_TOP_MAX)
    t('最小命中区高', b.aTerminal.d.minTargetH, b.a2Terminal.d.minTargetH, '≥ ' + String(TARGET_MIN), b.a2Terminal.d.minTargetH >= TARGET_MIN)
    t('最小真文字字号', b.aTerminal.d.minFontSize, b.a2Terminal.d.minFontSize, '≥ ' + String(FONT_MIN), b.a2Terminal.d.minFontSize >= FONT_MIN)
    t('内层滚动容器', b.aTerminal.d.innerScroll, b.a2Terminal.d.innerScroll, '= 0', b.a2Terminal.d.innerScroll === 0)
    t('真文字最小对比度', b.aTerminal.d.contrast.min, b.a2Terminal.d.contrast.min, '≥ 4.5:1', b.a2Terminal.d.contrast.violations.length === 0)
    out.push(table(rows, [26, 14, 14, 12, 8]))
    out.push('')
    out.push('  V-A2 终态：字号 ' + vt.fsValues.join(' / ') + ' · 带内字号 ' + b.a2Terminal.a2.band.sizes.join(' / ')
      + '（最小差 ' + String(b.a2Terminal.a2.band.minDiff) + '）· 主色文字类数 '
      + String(b.a2Terminal.a2.accent.roleCount) + '（' + b.a2Terminal.a2.accent.roles.join(', ') + '）')
    out.push('  终态只读位（.dsh-pm-gate）文案：「' + (b.a2Terminal.d.fr11.barText.slice(0, 60)) + '…」')
  } else {
    out.push('  （终态量不到，如实记为未实测）')
  }
  out.push('')
  out.push(hr)
  out.push('口径与产物的机械面：本文件的每个数字都由 scripts/req-detail-ui-variants-a2-shot.mts')
  out.push('在 --dump-dom 的真实渲染上现测；判据阈值与判定写在同一脚本里（退出码 0/1/2）。')
  return out.join('\n') + '\n'
}

void main()
