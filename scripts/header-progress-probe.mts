/**
 * 会话头部流程图自适应回归探针（REQ-260930230225-71be t5 / 设计 test-cases.md T-1、T-2）。
 *
 * 为什么需要它：静态断言只能证明「规则写在文件里」，证明不了「真实容器查询下标题行真的不溢出、
 * 档位真的按宽度降级、详情面板真的不越界」。本脚本用真实的 buildFlowChartModel + 真实 BOARD_CSS
 * 拼出标本页，复刻 DSH 标题行几何，交给 headless Chrome 在七档视口宽度下量布。
 *
 * 断言矩阵（与设计 T-2 一致；problems 必须为 NONE）：
 *   A1 标题行不溢出    .titleRow 的 scrollWidth - clientWidth <= 0.5
 *   A2 档位可见集      可见 token / 连线 / 节点名数量与档位表逐档一致
 *   A3 当前节点恒可见  [data-state="current"] 的包围盒宽 > 0
 *   A4 面板不越界      面板 left >= 0 且 right <= innerWidth；高度 <= innerHeight - 100
 *   A5 宽档零回归      1280 档：7 圆点、6 连线、计数文本形如 d/t、token 全显
 *   A6 圆点/连线基数   圆点 7 个、连线 6 条（两种显示态下都成立）
 *   A7 累计 token 恒在 每档「节点级可见 token + 累计徽章」≥ 1（REQ-261004143941-b2ca FR-4：
 *                      改造前 B/C/D 档两者皆 0 —— 这条断言在改造前必红，是可证伪锚点）
 *
 * 用法：
 *   npx tsx scripts/header-progress-probe.mts               # 档位模式（七档视口）
 *   npx tsx scripts/header-progress-probe.mts --fallback    # 降级模式（标本页去掉容器语义）
 * 退出码：0 = 全档通过；1 = 有档不通过；2 = 环境不可用（找不到 Chrome，响亮失败不静默跳过）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FLOW_TIERS, buildFlowChartModel, type FlowChartModel } from '../src/client/flow-chart-model.ts'
import { BASE_CSS } from '../src/client/styles/base.ts'
import { BOARD_CSS } from '../src/client/styles/board.ts'
import { TOKEN_CSS } from '../src/client/styles/token.ts'

// 必须带上 BASE_CSS：四个圆点状态色（--pm-c-done / --pm-line-strong / --pm-bg-soft）是 :root token，
// 少了它 done 圆点会变成「白字透明底」而肉眼不可见（围堵过：截图里点全丢了，断言却因为只看 display 而通过）。
const CSS = BASE_CSS + BOARD_CSS + TOKEN_CSS

/**
 * 档位期望：标本框宽 → 期望档位。
 * 为什么用「标本框」而不是窗口宽度：@container 量的是标题行的**内容盒**（视口 900 时内容盒只有 852，
 * 被标题行 20/28px 内边距吃掉），且 headless Chrome 的窗口有最小宽度（实测夹到 500），
 * 420px 的档位 D 根本摆不出来。把标题行放进显式宽度的 #frame 里，容器宽就成了确定值，
 * 而窗口保持 1440 宽——于是 100vw 兜底上限不会插手，量到的就是纯档位行为。
 */
/**
 * 档位期望：标本框宽 → 期望档位（REQ-261004151652-d535 起只有两种）。
 * 明细档 = 容器 > `FLOW_TIERS.token`（600）：名字在 ⇒ 数也在（有名字就有数）；
 * 紧凑档 = 容器 ≤ 600：名字与数一起让位，交出「计数 + 需求累计 Token」。
 * 中档（600 < 容器 ≤ 780）是明细档的子情形：只剩当前节点名，但它必须带着自己的数。
 */
const TIERS: ReadonlyArray<{ width: number; tier: 'detail' | 'compact' }> = [
  { width: 1280, tier: 'detail' },  // 容器 1232：7 名 + 2 数 + 6 线，无累计徽章
  { width: 1024, tier: 'detail' },  // 容器 976：同上（旧规则在这一档把数藏了——本需求的原病）
  { width: 900, tier: 'detail' },   // 容器 852：同上
  { width: 768, tier: 'detail' },   // 容器 720：中档——只剩当前节点名，但它带着自己的数
  { width: 640, tier: 'compact' },  // 容器 592 < 600：圆点 + 计数 + 累计徽章
  { width: 480, tier: 'compact' },  // 容器 452：同上
]

/** 降级模式档位：窗口宽度即容器宽（标本框 100%），验证「无容器语义时全量渲染 + 行不溢出」。 */
const FALLBACK_WIDTHS: readonly number[] = [1280, 900, 768, 640, 500]

/** 标本模型：实施中、3/12、两个节点有 token（覆盖 token 显隐两态）+ 需求累计 token。 */
const MODEL: FlowChartModel = buildFlowChartModel({
  status: 'implementing',
  category: 'feature',
  progress: { done: 3, total: 12 },
  nodes: [
    { key: 'design', tokens: { total: 12345 } },
    { key: 'implementing', tokens: { total: 6789 } },
  ],
  // REQ-261004143941-b2ca FR-4：累计 token 必须进标本——否则「窄档也有数」这条断言量的是空气。
  // 红态证据见 docs/requirements/REQ-261004143941-b2ca/evidence/t3-probe-red.txt（注释掉本行即红）。
  tokenTotal: 24800000,
})

/** 标本页里的 DSH 标题行几何（照抄官方 ConversationRoot.module.css 的语义，不引官方类名）。 */
const HEADER_CSS = `
html, body { margin: 0; padding: 0; height: 100%; }
body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #111827; background: #fff; }
.titleRow { container-type: inline-size; display: flex; align-items: center; gap: 0; min-height: 30px;
  padding: 10px 28px 0 20px; box-sizing: border-box; }
.titleCluster { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; }
.crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; white-space: nowrap;
  font-size: 14px; color: #6b7280; }
.crumb { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 8px; }
.headerActions { display: flex; flex: none; align-items: center; gap: 8px; }
.headerUtilities { display: flex; flex: none; align-items: center; gap: 8px; margin-left: 20px; }
.headerCorner { display: flex; flex: none; align-items: center; margin-left: 8px; margin-right: -16px; }
.preset { flex: none; height: 22px; padding: 0 10px; border-radius: 6px; background: rgba(128,128,128,.12);
  font-size: 12px; line-height: 22px; color: #6b7280; }
.utility { flex: none; width: 32px; height: 22px; border-radius: 6px; background: rgba(128,128,128,.12); }
/* fallback 模式：去掉容器语义（模拟不支持容器查询 / 组件没有容器祖先） */
.no-container .titleRow { container-type: normal; }
.dsh-pm-cprog-detail-panel div { font-size: 12px; color: #6b7280; }
`

/** 由模型生成与组件同构的 DOM（类名与数据属性按设计 interfaces.md I-2 的契约）。 */
function flowChartHtml(model: FlowChartModel): string {
  const nodes = model.nodes.map((stage, idx) => {
    const dot = stage.skipped ? '—' : stage.state === 'done' ? '✓' : stage.state === 'current' ? '●' : String(stage.index + 1)
    const meta = '<div class="dsh-pm-flow-meta"><span class="dsh-pm-flow-label">' + stage.label + '</span>'
      + (stage.token === undefined ? '' : '<span class="dsh-pm-flow-token">' + stage.token + '</span>')
      + '</div>'
    const link = idx < model.nodes.length - 1
      ? '<div class="dsh-pm-flow-link" data-state="' + (stage.state === 'done' ? 'done' : 'pending') + '"></div>'
      : ''
    return '<div class="dsh-pm-flow-node" data-state="' + (stage.skipped ? 'skipped' : stage.state) + '">'
      + '<span class="dsh-pm-flow-dot">' + dot + '</span>' + meta + '</div>' + link
  }).join('')
  return '<div class="dsh-pm-cprog">'
    + '<div class="dsh-pm-cprog-inline"><div class="dsh-pm-flow">' + nodes + '</div>'
    + '<span class="dsh-pm-cprog-inline-count">' + model.countText + '</span>'
    // REQ-261004143941-b2ca FR-2：累计 token 徽章渲染在 .dsh-pm-flow **之外**（与真组件同构）——
    // 这正是它不受档位规则影响的结构性原因，探针必须照抄这个位置关系才量得准。
    + (model.tokenTotal === undefined ? ''
      : '<span class="dsh-pm-token-badge dsh-pm-cprog-token-total" title="需求累计 Token（各节点快照差值合计，含任务执行兜底）">'
        + '<span class="dsh-pm-cprog-token-ico">🪙</span>' + model.tokenTotal + '</span>')
    + '</div>'
    + '<div class="dsh-pm-cprog-detail-panel"><div>详情面板（探针占位，用于量包围盒）</div></div>'
    + '</div>'
}

/** 页内量布脚本：把结果写进 #diag（--dump-dom 读回）。 */
function pageScript(mode: string): string {
  return `
(function () {
  var MODE = '${mode}'
  var bad = []
  function vis(el) { return el.getClientRects().length > 0 }
  var row = document.querySelector('.titleRow')
  var flow = document.querySelector('.dsh-pm-flow')
  var panel = document.querySelector('.dsh-pm-cprog-detail-panel')
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-flow-node'))
  var links = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-flow-link'))
  var labels = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-flow-label'))
  var tokens = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-flow-token'))
  // REQ-261004143941-b2ca FR-4：累计 token 徽章与它的图标（图标在档位 D 应被收掉）
  var totalBadges = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-cprog-token-total'))
  var tokenIcons = Array.prototype.slice.call(document.querySelectorAll('.dsh-pm-cprog-token-ico'))
  var cur = document.querySelector('.dsh-pm-flow-node[data-state="current"]')
  // @container 量的是容器**内容盒**：标题行有 20/28px 内边距，clientWidth 会比真实容器宽 48px。
  var rowStyle = window.getComputedStyle(row)
  var container = row.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight)
  var frame = document.getElementById('frame')
  var frameRect = frame ? frame.getBoundingClientRect() : null
  var panelPos = panel ? window.getComputedStyle(panel).position : ''
  // 面板边界：fixed（窄档）相对视口；absolute（宽档）相对行所在的标本框——两者在真机上同为窗口宽。
  var rowBox = row.getBoundingClientRect()
  // 面板允许区间：fixed（窄档）对视口；absolute（宽档）对**会话框根**（#frame = 真机的会话框）
  var boundsLeft = panelPos === 'fixed' ? 0 : (frameRect ? frameRect.left : rowBox.left)
  var boundsRight = panelPos === 'fixed' ? window.innerWidth : (frameRect ? frameRect.right : rowBox.right)
  var tier = container > ${FLOW_TIERS.token} ? 'detail' : 'compact'
  // A1 的真实量法：overflow:visible 的盒子不会把溢出内容算进 scrollWidth（Chrome 实测），
  // 所以改用「行内最右后代 vs 行的右边缘」+「文档级横向溢出」两条硬指标。
  // 只看行的**直接子座位**：内部滚动容器（.dsh-pm-flow）里被滚出去的子节点用 rect 量会误报溢出。
  var rowRect = row.getBoundingClientRect()
  var seats = row.children
  var maxRight = rowRect.left
  for (var i = 0; i < seats.length; i++) {
    var rr = seats[i].getBoundingClientRect()
    if (rr.right > maxRight) maxRight = rr.right
  }
  var rowRightOverflow = maxRight - rowRect.right
  var docOverflow = document.documentElement.scrollWidth - window.innerWidth
  var rowOverflow = row.scrollWidth - row.clientWidth
  var chartScrollX = flow.scrollWidth - flow.clientWidth
  var visNodes = nodes.filter(vis).length
  var visLinks = links.filter(vis).length
  var visLabels = labels.filter(vis).length
  var visTokens = tokens.filter(vis).length
  var visBadges = totalBadges.filter(vis).length
  var visIcons = tokenIcons.filter(vis).length
  var rect = panel ? panel.getBoundingClientRect() : null
  var countEl = document.querySelector('.dsh-pm-cprog-inline-count')
  var countText = countEl ? countEl.textContent || '' : ''

  if (nodes.length !== 7) bad.push('圆点数 ' + nodes.length + ' != 7')
  if (visNodes !== 7) bad.push('可见圆点 ' + visNodes + ' != 7')
  if (links.length !== 6) bad.push('连线数 ' + links.length + ' != 6')
  // 行的右内边距是 28、角落座位 margin-right: -16 -> 官方几何下最右后代应停在行的右边缘内侧 12px。
  if (rowRightOverflow > 0.5) bad.push('标题行内容越出右边缘 ' + rowRightOverflow.toFixed(1) + 'px')
  if (docOverflow > 0.5) bad.push('文档横向溢出 ' + docOverflow.toFixed(1) + 'px')
  if (!cur || !(cur.getBoundingClientRect().width > 0)) bad.push('当前节点不可见')
  if (!/^[0-9]+\\/[0-9]+$/.test(countText.trim())) bad.push('计数文本异常：' + countText)
  // REQ-261004151652-d535：可见集规则改为**两档**（「FLOW_TIERS.token === label === 600」），
  // 三条新断言对着三种真实错法：
  //   ① 有名字没数（本需求的原病）  ② 明细隐却无总数（降级漏给）  ③ 明细在却显总数（重复信息）
  if (totalBadges.length !== 1) bad.push('累计 token 徽章数 ' + totalBadges.length + ' != 1')
  if (MODE === 'fallback') {
    // 降级态：无容器语义 → 三段规则全不命中 → 全明细可见、徽章默认隐藏
    if (visLabels !== 7) bad.push('降级态节点名未全显 ' + visLabels + '/7')
    if (visTokens !== tokens.length) bad.push('降级态节点 token 未全显 ' + visTokens + '/' + tokens.length)
    if (visLinks !== 6) bad.push('降级态连线未全显 ' + visLinks + '/6')
    if (visBadges !== 0) bad.push('降级态累计徽章应隐藏（明细已可见，属重复信息）可见 ' + visBadges)
  } else {
    var detail = container > ${FLOW_TIERS.token}   // 明细档：名字在 ⇒ 数也在
    var wide = container > ${FLOW_TIERS.link}      // 明细档里的宽子态：连线与非当前节点名也在
    if (detail) {
      if (wide) {
        if (visLabels !== 7) bad.push('明细宽档节点名 ' + visLabels + ' != 7')
        if (visTokens !== tokens.length) bad.push('明细宽档节点 token ' + visTokens + ' != ' + tokens.length)
        if (visLinks !== 6) bad.push('明细宽档连线 ' + visLinks + ' != 6')
      } else {
        // 中档（600 < 容器 ≤ 780）：只剩当前节点名，但它**必须带着自己的数**——
        // 这条正是旧规则「有名字没数」的正面反证（旧 token 阈值 1000 时这里 visTokens=0）。
        if (visLabels !== 1) bad.push('中档应只剩当前节点名，实际 ' + visLabels)
        if (visTokens !== 1) bad.push('TOKENS_HIDDEN_BESIDE_LABELS 中档当前节点名在但它的数不在（可见 ' + visTokens + '）')
        if (visLinks !== 0) bad.push('中档连线应隐藏，实际 ' + visLinks)
      }
      if (visBadges !== 0) bad.push('TOTAL_DUPLICATED 明细档累计徽章应隐藏，实际可见 ' + visBadges)
      // 图标在徽章内部：明细档徽章整块隐藏 ⇒ 图标自然不可见，不单独断言
    } else {
      if (visLabels !== 0) bad.push('紧凑档节点名应全隐，实际 ' + visLabels)
      if (visTokens !== 0) bad.push('紧凑档节点 token 应全隐，实际 ' + visTokens)
      if (visLinks !== 0) bad.push('紧凑档连线应全隐，实际 ' + visLinks)
      if (visBadges !== 1) bad.push('TOTAL_MISSING 紧凑档累计徽章必须可见，实际 ' + visBadges)
      if (visIcons !== 0) bad.push('紧凑档 🪙 图标应收起，实际 ' + visIcons)
    }
  }

  // 面板边界 / 对齐断言（与可见集无关，两种模式都要跑）
  if (rect) {
    if (rect.left < boundsLeft - 0.5 || rect.right > boundsRight + 0.5) {
      bad.push('面板横向越界 left=' + rect.left.toFixed(0) + ' right=' + rect.right.toFixed(0)
        + ' 允许区间=[' + boundsLeft.toFixed(0) + ',' + boundsRight.toFixed(0) + '] 定位=' + panelPos)
    }
    if (rect.height > window.innerHeight - 100 + 0.5) bad.push('面板纵向超高 ' + rect.height.toFixed(0))
    // 验收反馈：面板必须与会话框最左边对齐（容差 16px 覆盖窄档 fixed 的 12px 内缩）
    var paneLeft = frameRect ? frameRect.left : 0
    if (rect.left > paneLeft + 16.5) bad.push('面板未与会话框左边对齐 left=' + rect.left.toFixed(0) + ' paneLeft=' + paneLeft.toFixed(0))
  } else {
    bad.push('面板未渲染')
  }

  var diag = document.createElement('div')
  diag.id = 'diag'
  diag.textContent = 'width=' + window.innerWidth + ' tier=' + tier + ' container=' + Math.round(container)
    + ' nodes=' + visNodes + ' links=' + visLinks + ' tokens=' + visTokens + '+' + visBadges + ' labels=' + visLabels
    + ' rowRightOverflow=' + rowRightOverflow.toFixed(1) + ' docOverflow=' + docOverflow.toFixed(1)
    + ' rowScrollW=' + rowOverflow.toFixed(1) + ' chartScrollX=' + chartScrollX.toFixed(0)
    + ' panel=' + (rect ? Math.round(rect.left) + '..' + Math.round(rect.right) : 'none')
    + ' panelPos=' + (panelPos || 'none') + ' frame=' + (frameRect ? Math.round(frameRect.width) : 'none')
    + ' problems=' + (bad.length ? bad.join(' | ') : 'NONE')
  document.body.appendChild(diag)
})();
`
}

function specimenHtml(mode: string, frameWidth: number | undefined): string {
  const cls = mode === 'fallback' ? 'no-container' : 'with-container'
  const frame = frameWidth === undefined ? 'width: 100%;' : 'width: ' + frameWidth + 'px;'
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">'
    + '<title>pmboard 会话头部流程图自适应标本</title><style>' + HEADER_CSS + CSS
    + '#frame { ' + frame + ' position: relative; min-height: 420px; }</style></head>'
    + '<body class="' + cls + '"><div id="frame"><div class="titleRow">'
    + '<div class="titleCluster"><nav class="crumbs"><span class="crumb">会话标题</span></nav>'
    + '<div class="headerActions"><span class="preset">标准模式</span><span class="utility"></span></div></div>'
    // 镜像真机：图表在右侧工具组的最左（order -20），官方入口（在应用中打开 / 后台任务 / ⋯）在它右面
    + '<div class="headerUtilities">' + flowChartHtml(MODEL)
    + '<span class="utility"></span><span class="utility"></span><span class="utility"></span></div>'
    + '<div class="headerCorner"><span class="utility"></span></div>'
    + '</div></div><script>' + pageScript(mode) + '</script></body></html>'
}

/** 浏览器落点：CHROME_BIN 优先，其次 macOS / Linux 常见路径。 */
function findChrome(): string | undefined {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  return candidates.find(p => existsSync(p))
}

interface Diag {
  width: number
  tier: string
  container: number
  nodes: number
  links: number
  /** 节点级可见 token 数（明细档才 > 0） */
  tokens: number
  /** 累计 token 徽章可见数（REQ-261004143941-b2ca：各档恒为 1） */
  totalBadges: number
  labels: number
  rowRightOverflow: number
  docOverflow: number
  rowScrollW: number
  chartScrollX: number
  panel: string
  problems: string
}

function numOf(text: string, key: string): number {
  return Number(new RegExp(key + '=(-?[0-9.]+)').exec(text)?.[1] ?? NaN)
}

function parseDiag(dom: string): Diag | undefined {
  const m = dom.match(/<div id="diag">([^<]*)<\/div>/)
  if (m === null) return undefined
  const text = m[1]!
  return {
    width: numOf(text, 'width'),
    tier: /tier=([a-z]+)/.exec(text)?.[1] ?? '?',
    container: numOf(text, 'container'),
    nodes: numOf(text, 'nodes'),
    links: numOf(text, 'links'),
    // DIAG 里 token 读数是「节点级+累计徽章」两段（形如 tokens=2+1），分开解析：
    // 前者随档位变、后者恒 1——合并成一个数就分不清「谁在场」（那正是本需求要盯的区别）。
    tokens: Number(/tokens=(\d+)\+(\d+)/.exec(text)?.[1] ?? NaN),
    totalBadges: Number(/tokens=(\d+)\+(\d+)/.exec(text)?.[2] ?? NaN),
    labels: numOf(text, 'labels'),
    rowRightOverflow: numOf(text, 'rowRightOverflow'),
    docOverflow: numOf(text, 'docOverflow'),
    rowScrollW: numOf(text, 'rowScrollW'),
    chartScrollX: numOf(text, 'chartScrollX'),
    panel: /panel=([^ ]+)/.exec(text)?.[1] ?? '?',
    problems: /problems=(.*)$/.exec(text)?.[1] ?? 'UNPARSED',
  }
}

function main(): void {
  const mode = process.argv.includes('--fallback') ? 'fallback' : 'tiers'
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('PROBE FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    process.exit(2)
  }

  const dir = mkdtempSync(join(tmpdir(), 'pm-header-probe-'))
  const page = join(dir, 'specimen.html')

  const cases: ReadonlyArray<{ width: number; tier: 'detail' | 'compact' | undefined }> = mode === 'fallback'
    ? FALLBACK_WIDTHS.map(w => ({ width: w, tier: undefined }))
    : TIERS.map(t => ({ width: t.width, tier: t.tier }))

  const failures: string[] = []
  for (const item of cases) {
    // 档位模式：标本框宽固定、窗口保持 1440（100vw 兜底不上场，量到纯档位行为）。
    // 降级模式：标本框 100%、窗口宽即容器宽（兜底上限按 100vw 计算，与真机一致）。
    // 两种模式都用「窗口宽 = 标本框宽」：容器宽、视口宽与真机一致（100vw 兜底也按真机口径参与）。
    writeFileSync(page, specimenHtml(mode, undefined))
    const winWidth = item.width
    let diag: Diag | undefined
    try {
      const dom = execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check',
        '--window-size=' + winWidth + ',900', '--dump-dom', 'file://' + page,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
      diag = parseDiag(dom)
    } catch (e) {
      failures.push('w=' + item.width + ': Chrome 调用失败（' + (e as Error).message + '）')
      continue
    }
    if (diag === undefined) {
      failures.push('w=' + item.width + ': 未读到 #diag（标本页脚本未执行？）')
      continue
    }
    console.log('DIAG ' + (mode === 'fallback' ? 'fallback ' : '') + 'frame=' + item.width + ' viewport=' + diag.width
      + ' container=' + diag.container + ' tier=' + diag.tier
      + ' nodes=' + diag.nodes + ' links=' + diag.links + ' tokens=' + diag.tokens + '+' + diag.totalBadges + ' labels=' + diag.labels
      + ' rowRightOverflow=' + diag.rowRightOverflow + ' docOverflow=' + diag.docOverflow
      + ' rowScrollW=' + diag.rowScrollW + ' chartScrollX=' + diag.chartScrollX
      + ' panel=' + diag.panel + ' problems=' + diag.problems)
    if (diag.problems !== 'NONE') failures.push('w=' + item.width + ': ' + diag.problems)
    // 双保险（页面脚本已判过，这里再判一次）：任一档「可见 token 总数」为 0 即失败——
    // 那是本需求的原发病（用户实测：窄窗口一个 token 数字都不显示）。
    if (!(diag.tokens + diag.totalBadges >= 1)) {
      failures.push('w=' + item.width + ': 可见 token 总数 ' + (diag.tokens + diag.totalBadges) + ' < 1（该档没有任何 token 读数）')
    }
    if (item.tier !== undefined && diag.tier !== item.tier) {
      failures.push('w=' + item.width + ': 档位 ' + diag.tier + ' != 期望 ' + item.tier)
    }
  }

  if (failures.length > 0) {
    console.error('\nPROBE FAIL')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\nPROBE PASS（' + (mode === 'fallback' ? '降级态：无容器语义时全量渲染且标题行不溢出' : TIERS.length + ' 档视口：标题行不溢出 / 档位可见集正确 / 当前节点恒可见 / 面板不越界') + '）')
}

main()
