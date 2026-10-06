/**
 * 需求详情页 UI **原型出图 + 几何实测**（after 图 + 观测值回填）— REQ-261005155003-f32f。
 *
 * 为什么需要它：本需求的产物是**权威原型**（`docs/requirements/<REQ>/prototypes/detail-ui-v3.html`），
 * 它要同时承担两件事——
 *   ① 让人**看得见**"改后长什么样"（before/after 并排评审，与 `scripts/req-detail-ui-shot.mts`
 *      出的 before 基线**同宽同状态同口径**）；
 *   ② 让人**量得到**"改后是不是真的守住了硬判据"（Tab 栏落点 / 无横向溢出 / 无内层滚动 /
 *      目标尺寸 / 最小字号 / SVG 图标尺寸）。
 * 「看得见」靠 headless Chrome 出 PNG，「量得到」靠另一次 `--dump-dom` 调用里注入的测量脚本
 * （`#diag` 思路照 `scripts/req-report-probe.mts`，但**断言对象是原型**而不是 src/）。
 *
 * 用法：npx tsx scripts/req-detail-ui-prototype-shot.mts
 *
 * 产物（4 张 PNG，2 倍图；目录不存在时自动创建，重复运行幂等覆盖）：
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-after-1280-inflight.png
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-after-900-inflight.png
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-after-1280-terminal.png
 *   docs/requirements/REQ-261005155003-f32f/evidence/ui-after-1280-inflight-dark.png（浅色岛对照档）
 * 并且把实测值**回填进原型的 `<!-- proto-geometry ... -->` 注释**（只写观测值，不写阈值）。
 *
 * 退出码：0 全过 / 1 有断言失败 / 2 环境不可用（找不到 Chrome）。
 *
 * ── 三条纪律（本脚本自己守）────────────────────────────────────────────────
 *  ① **阈值只在这里**：原型 HTML 的 `proto-geometry` 注释里只有观测值（name/value/unit/at），
 *     一个阈值都不许出现；阈值是设计决策，归属于需求文档与 design 文档。
 *  ② **不改 src/**：本脚本只读 src/ 的渲染函数与样式常量，产物只落需求目录。
 *  ③ **不覆盖 before 图**：只写 `ui-after-*.png`（`ui-before-*` / `ui-before-zoom-*` 一个字节都不碰）。
 *
 * ── K7（原型漂移）：原型里内联的壳必须是**当前** `buildReportShell(...)` 的输出 ──────────
 * 权威原型 v3 转正时（K7）里面内联的还是**旧构建**的壳；此后实现又落地了 FR-11 的两处真删、
 * FR-13 的评论输入框真删、FR-8 的 ✓/▸/!! 真实文本标记与 `--pm-icon` 令牌，所以本次把两态壳
 * **按当前输出重新内联**（连同 `?v=` / `?theme=` 开关与 wrapper 原样保留），[0/3] 的漂移核对
 * 逐段比对四段（head / band / panel / tabs），判据是"抹平**已声明偏差**后逐字节相同"——
 * 已声明偏差只有五类（见 `neutralize()` 的注释），其余任何差异都响亮失败。
 *
 * ── K8（`?v=current` 不是改前外观）：改前一律用 `evidence/ui-before-*.png` ─────────────
 * 原型里**没有任何 `[data-proto-v]` CSS 门控**：`?v=current` 与 `?v=next` 的矩形与七项多样性
 * 逐项相同（只差 Tab 栏 emoji ↔ SVG）。所以本脚本**不再**拿 `?v=current` 当"改前基线"复现
 * （那段断言在 v3 上不可能成立），改前那一列是**人给的历史快照**，对照图是 `ui-before-*.png`。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReportShell } from '../src/client/views/report-tabs.js'
import {
  TRUNK_SPECIMEN, asPanelPayload, findChrome, reportOf, revisionOf, type SpecimenState,
} from './fixtures/req-detail-specimen.mts'

/* ───────────────────────────────────────────────────── 常量（阈值只在脚本里） */

/** 仓库根（本脚本在 `<root>/scripts/` 下），产物路径相对它解析——不依赖调用时的 cwd。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 权威原型（**唯一** authoritative）——本脚本的出图与测量对象。
 * 刻意**不做**环境变量覆盖：本脚本的全部断言只有在"量的就是那唯一的权威原型"时才成立
 * （能指到别处的脚本，等于给"拿一份改过的 HTML 骗过断言"留门）。
 */
const PROTO = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'prototypes', 'detail-ui-v3.html')

/** after 图目录（与 before 同一目录；**只写 ui-after-***）。 */
const OUT_DIR = join(ROOT, 'docs', 'requirements', 'REQ-261005155003-f32f', 'evidence')

/** 三组合（与 before 逐项同宽同状态）：1280×在途、900×在途、1280×终态。 */
interface Combo { readonly width: number; readonly state: SpecimenState }
const COMBOS: readonly Combo[] = [
  { width: 1280, state: 'inflight' },
  { width: 900, state: 'inflight' },
  { width: 1280, state: 'terminal' },
]

/** 2 倍图（人看细节）：PNG 像素 = CSS 像素 × 本值（与 before 同）。 */
const SCALE = 2

/** `--window-size` 的高（与 before 同；`--screenshot` 口径下实测视口就是它）。 */
const WINDOW_HEIGHT = 800

/** 探针口径的实测首屏视口高（`scripts/req-report-probe.mts` 的 `TABS_TOP_MAX`）。 */
const TABS_TOP_MAX = 713

/** 交互目标最小边（WCAG 2.2 SC 2.5.8 AA：24×24 CSS px）——本仓是桌面 Web，不套 44pt。 */
const TARGET_MIN = 24

/** 详情页内**真文字**的最小计算字号（FR-7：小于 11px 的真文字一律消灭）。 */
const FONT_MIN = 11

/** 状态带三格各自高的上限（既有硬判据，FR-7 要求"只许更好"）。 */
const BAND_CELL_MAX_H = 220

/** 操作条整块高的上限（既有硬判据，仅 1280 档判）。 */
const ACTION_BAR_MAX_H = 72

/**
 * FR-10 七项「样式多样性」上限（**阈值只在本脚本里**；原型的 `proto-geometry` 一个阈值都不许有）。
 * 判据来源：需求 REQ-261005155003-f32f 的 FR-10「视觉语言：苹果式克制」。
 * 口径（本脚本与原型 FR-10 区块写的是同一份口径，改口径要同时改两处）：
 *   · 胶囊     = 四角 max(border-radius) ≥ 100px 的元素；
 *   · 前景色   = 壳内**承载文字**的元素的 `color` 去重（"承载文字"= 自己有非空文本节点）；
 *                另有两个旁证读数一起打印/回填：**只出现在非文本元素上**的色（图标/装饰，不进本项计数）、
 *                以及**全元素**去重色数（老口径，用来与改前那张历史快照对照）；
 *   · 底色     = 计算 `background-color` 且 alpha > 0 去重；
 *   · 字重/字号= 计算值去重；
 *   · 圆角     = 四角拼接串去重（0 不算一种）；
 *   · 边线色   = 四边中 `0 < width ≤ 2px` 且 style ≠ none 且非透明的边色
 *                （3px 语义色条是"色条"不是"边线"，不并入本维度）。
 * 字号上限是 **6 而不是 5**：需求 FR-10（四）在 2026-10-05 交接复核时把这一行改准过——
 * 「≤6（= FR-12 的六档 `24/20/15/13/12/11`，含页标题那一档；除页标题外 ≤5），且**不得出现阶梯外字号**；
 * 原表写的"≤5"与 FR-12 的六档相抵」。所以这里按"阶梯内 + 无阶梯外"判（见 `FONT_LADDER`），
 * 比单看一个上限更严，不是放宽。
 * 前景色上限同样是 **6 而不是 5**（2026-10-05 owner 裁定，同一个先例）：
 *   · FR-10（二）的色板自己列了 6 种"允许承载文字"的色（正文/次要/强调/危险/警告/成功）+ 白字；
 *   · FR-8 #2 明文要求缺口严重度「**颜色仍承载严重度**」→ `--pm-warn-text` 必须留在黄色缺口上；
 *   · 那个 5 是在**还没有 FR-8 严重度着色**的标本上量的（当时严重度是 emoji，不受 CSS 管）。
 *   判据因此改成两条一起成立：① 承载文字的前景色 ≤6；② **颜色取值集合 ⊆ FR-10（二）色板**
 *   （见 `FG_PALETTE` / `FG_TERTIARY`）——第②条比"只数种类"结实：换一个阶梯外的色立刻红。
 */
const VARIETY_MAX = {
  pills: 5, fg: 6, bg: 4, fontWeight: 3, fontSize: 6, radius: 2, borderColor: 2,
} as const

/**
 * FR-10（二）色板里**允许出现**的前景色（按浏览器计算值的序列化形态比，不按十六进制字面量比）。
 *
 * 为什么按 rgb 串比：程序读的是 `getComputedStyle().color`，浏览器一律序列化成 `rgb(r, g, b)`
 * （十六进制写法会被规范化，直接比 hex 会假红）。
 * 三级色 `#86868b` 单列（`FG_TERTIARY`）：它**允许存在**（图标/装饰线），但**不许出现在可见真文字上**
 * ——它在白底只有 3.62:1（FR-10（二）表里写着"✗ 只用于非文本/图标"）。
 */
const FG_PALETTE: readonly string[] = [
  'rgb(29, 29, 31)',    // #1d1d1f 正文
  'rgb(110, 110, 115)', // #6e6e73 次要
  'rgb(0, 113, 227)',   // #0071e3 唯一强调色
  'rgb(215, 0, 21)',    // #d70015 危险
  'rgb(201, 52, 0)',    // #c93400 警告（FR-8 #2 的黄色缺口严重度）
  'rgb(30, 126, 52)',   // #1e7e34 成功
  'rgb(255, 255, 255)', // 实心主按钮上的白字
]

/** 三级灰 `#86868b`：允许出现，但只许非文本/图标（白底 3.62:1，承载真文字违反 FR-4 的 4.5:1）。 */
const FG_TERTIARY = 'rgb(134, 134, 139)'

/**
 * FR-12 / FR-10（三）9 定死的字号阶梯（px）——壳内**不允许**出现阶梯外的字号。
 * 六档含页标题那一档（24），正是 FR-10（四）"≤6"的来源。
 */
const FONT_LADDER: readonly number[] = [11, 12, 13, 15, 20, 24]

/**
 * 改前那一列 = **人给的历史快照**（真实上线详情页的基线，见 `evidence/ui-before-*.png`）。
 *
 * 为什么不再现量：K8 查明原型里没有任何 `[data-proto-v]` CSS 门控，`?v=current` 与 `?v=next`
 * 的七项多样性**逐项相同**——拿它当"改前"等于自己跟自己比。所以这七个数是**历史快照**，
 * 脚本只把它打印出来供人对照，**不再**拿它当基线去断言（改前外观的权威是 before 图）。
 * 数值来源：需求 FR-10 里人给的现状诊断值（213 元素标本：胶囊 17 · 前景 9 · 底色 12 · 字号 10 ·
 * 字重 5 · 圆角 3 · 边线 5）。
 */
const HISTORICAL_BEFORE = {
  pills: 17, fg: 9, bg: 12, fontSize: 10, fontWeight: 5, radius: 3, borderColor: 5,
} as const

/** Tab 内 `<svg>` 的期望边长（`--pm-icon:14px`）与容差（±1）。 */
const ICON_SVG_PX = 14
const ICON_SVG_TOL = 1

/**
 * FR-10 §3.1 要求「色板逐值使用，出图后**复测确认**对比度」——所以这里把"真文字对比度"也做成实测：
 * 取壳内**带直接文本节点**的元素，按 WCAG 相对亮度公式算"文字色 vs 实际底色"的比值
 * （底色 = 沿祖先链把所有非透明 background-color 自下而上合成，起点为白），
 * 普通文字要求 ≥4.5:1，大字（≥24px，或 ≥18.66px 且字重 ≥700）≥3:1。
 */
const TEXT_CONTRAST_MIN = 4.5
const LARGE_TEXT_CONTRAST_MIN = 3

/** PNG 体量下限（字节）：「不像空白图」的粗筛（与 before 同口径）。 */
const MIN_PNG_BYTES = 20 * 1024

/** 结构位六个图标：emoji → 内联 SVG 的**语义对照**（本脚本据此核对回填没串位）。 */
const TAB_KEYS = ['trunk', 'docs', 'dag', 'dialogue', 'token', 'prompts'] as const

/**
 * 「本阶段操作」分组标签的原文（FR-11 #1 要求**真删**这个节点，不是 CSS 隐藏）。
 * 同名 class 在评论列表与窗口组还在用（「最近评论 N 条」「窗口」），所以判据只认这一串文字。
 */
const ACTION_BAR_LABEL_TEXT = '本阶段操作'

/**
 * 浅色岛对照档（验收标准 #4）：**同一个 `v`**（`?v=next`）下 `?theme=dark` 与不带 theme 的两张
 * PNG 必须**逐字节相同**——详情页在宿主深色主题下是"同一副长相"（FR-4 的浅色岛）。
 * 这一档与 after 图的其余参数逐项相同（视口 / 倍图 / 隐藏滚动条），只多一个 `theme` 变量。
 */
const ISLAND_DARK_THEME = 'dark'

/**
 * 主操作的**服务端** `consequence` 原文（FR-11 #2：sr-only 节点的文本必须等于它）。
 * 取自标本本身（不是脚本里抄的第二份），标本一改这里跟着变。
 */
const PRIMARY_CONSEQUENCE = reportOf('inflight').actions.find(a => a.key === 'move')?.consequence ?? ''

/* ───────────────────────────────────────────────────── 小工具 */

/** PNG 的 IHDR 宽高（字节 16..23，大端 uint32）——反推实测视口，不引图像库。 */
function pngSize(path: string): { w: number; h: number } | undefined {
  const head = readFileSync(path).subarray(0, 24)
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.readUInt32BE(4) !== 0x0d0a1a0a) {
    return undefined
  }
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
}

/** 一条可读行（缩进两格，便于在 CI 日志里扫读）。 */
function line(text: string): void {
  console.log('  ' + text)
}

/**
 * 文件的 sha256（十六进制小写）。
 *
 * 为什么用 sha 而不是"字节数相同"：验收标准 #4 要的是**逐字节相同**——字节数相同但内容不同
 * （比如深色档把某个灰值换成另一个等长灰值）必须判红。sha 是这件事最直接的证据。
 */
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * 跑一次 headless Chrome。
 *
 * **只在"进程起不来"时重试一次**（与探针/出图脚本同口径）：并行跑多个 headless Chrome 时偶发启动失败。
 * 断言失败**不**重试——重试掩盖不了断言失败，只会让红的日志变长。
 */
function runChrome(chrome: string, args: string[]): { ok: true; out: string } | { ok: false; why: string } {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = execFileSync(chrome, args, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
      })
      return { ok: true, out }
    } catch (e) {
      lastError = e
    }
  }
  return { ok: false, why: (lastError as Error).message.split('\n')[0]!.slice(0, 200) }
}

/* ───────────────────────────────────────────────────── 漂移核对（原型 vs 真实壳） */

/**
 * 取 `shell` 里的第 n 段（`<div data-report-seg="name">…`）——四段按出现次序切片。
 * 壳体是纯字符串拼接，四个标记各出现一次，故按下标切片是安全的（并会断言"各恰一次"）。
 */
function segs(shell: string): { head: string; band: string; tabs: string; panel: string } {
  const at = (name: string): number => shell.indexOf('<div data-report-seg="' + name + '">')
  const head = at('head'), band = at('band'), tabs = at('tabs'), panel = at('panel')
  if (head < 0 || band < 0 || tabs < 0 || panel < 0) throw new Error('壳里缺少 data-report-seg 段标记')
  return {
    head: shell.slice(head, band),
    band: shell.slice(band, tabs),
    tabs: shell.slice(tabs, panel),
    panel: shell.slice(panel, shell.lastIndexOf('</div>')),
  }
}

/**
 * 规范化 Tab 栏段：把**两处可枚举的结构位改动**抹平后应当与真实壳逐字节相同。
 * 抹平的是：① 图标 span 的内容（emoji ↔ 内联 SVG）；② 本次新增的 ARIA / id / 原型标记属性。
 * 抹平不了的东西（多一个 class、少一个 data-*、属性顺序变了）会**留在差异里**并被断言抓住。
 */
/* ── 已声明偏差：原型内联壳**允许**与真实壳在这五类处境上不同，其余一律不许 ────────────────
   这五类不是"随手挑的宽容"，而是本需求里**有据可查的改动**（需求 4b / FR-11 / FR-13 / D-8）：
     ① **结构位图标 emoji → 内联 SVG**：Tab 栏六个图标（FR-1）。当前实现里真实壳**自己**就是
        SVG + `data-proto-icon-before`（emoji 只作为属性留着，供原型的 `?v=current` 还原），
        所以这一类在两侧本来相等；抹平函数仍然按"图标位内容等价"处理，防的是有人手改原型图标位；
     ② **新增 ARIA 属性与稳定 id**（FR-3）：`role` / `aria-*` / `tabindex` / `id="tab-*"` /
        `id="panel-*"` / 原型专用的 `data-proto-focus`；
     ③ **FR-11 的两处真删**：「本阶段操作」标签 span、常驻后果节点（后者被
        `.dsh-pm-action-consequence.dsh-pm-sr-only` 取代，文本 === 服务端 `consequence`）；
     ④ **FR-13 的真删**：头部评论输入框（`.dsh-pm-comment-form`）；
     ⑤ **D-8 的容器归属位移**：`.dsh-pm-report-windows` 移进身份行（`.dsh-pm-rh-top`）。
   ③④⑤ 同样是"实现落地后真实壳自己也有"的改动（所以当前两侧本来就没有差异）——抹平函数照样逐类
   实现，是为了这五类**将来**被人手改回原型时既不被误判、也不把范围外的改动放过去；
   ③ 还额外落成**逐节点断言**（见 driftCheck 的 FR-11 段）：删除本身必须被正面证明，不能只靠"抹平后相同"。 */

/** 抹平 ①：图标位的内容（emoji 文本 ↔ 内联 SVG）——两侧都换成同一个占位符。 */
function neutralizeIcons(s: string): string {
  return s.replace(
    /<span class="dsh-pm-tab-icon"([^>]*)>[\s\S]*?<\/span>/g,
    '<span class="dsh-pm-tab-icon"$1>ICON</span>',
  )
}

/**
 * 抹平 ②：**只加不改**的可访问性属性（role / aria-* / tabindex / `id="tab-*"`、`id="panel-*"` /
 * 原型标记 `data-proto-focus`）。
 * 注意 `id` 只抹 `tab-*` / `panel-*` 两种形态——别的 id（例如主操作的 `aria-describedby` 目标）不抹，
 * 免得把"id 被改坏"也一起放过。
 */
function neutralizeA11y(s: string): string {
  return s
    .replace(/ (?:role|aria-[a-z-]+|tabindex|data-proto-focus)="[^"]*"/g, '')
    .replace(/ id="(?:tab|panel)-[^"]*"/g, '')
}

/** 抹平 ③-a：FR-11 真删的「本阶段操作」分组标签（按**文字**认，不按 class——同名 class 还在别处用）。 */
function neutralizeActionLabel(s: string): string {
  return s.replace(
    new RegExp('<span class="dsh-pm-action-bar-label">' + ACTION_BAR_LABEL_TEXT + '</span>', 'g'),
    '',
  )
}

/** 抹平 ③-b：后果节点的**可见/隐藏**差别（常驻可见 → `.dsh-pm-sr-only`），文本本身不抹。 */
function neutralizeConsequenceClass(s: string): string {
  return s.replace(
    /<span class="dsh-pm-action-consequence dsh-pm-sr-only"/g,
    '<span class="dsh-pm-action-consequence"',
  )
}

/** 抹平 ④：FR-13 真删的头部评论输入框（整块：`<input>` + 发送按钮，内部没有嵌套 div）。 */
function neutralizeCommentForm(s: string): string {
  return s.replace(/<div class="dsh-pm-comment-form"[\s\S]*?<\/div>/g, '')
}

/**
 * 取 `s` 里从第 `i` 个 `<div` 起的**配对整块**（含嵌套 div）。
 *
 * 为什么需要它：D-8 的"窗口组归属位移"是**结构位**差别，字符串切片切不准——
 * 必须按 tag 配对找到那一块的头尾，才能既做结构断言（它在不在身份行里），又把这一块整体抽出来单比。
 */
function divBlock(s: string, i: number): { start: number; end: number; block: string } | undefined {
  if (!s.startsWith('<div', i)) return undefined
  const re = /<div\b[^>]*>|<\/div>/g
  re.lastIndex = i
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m[0] === '</div>') {
      depth--
      if (depth === 0) return { start: i, end: m.index + m[0].length, block: s.slice(i, m.index + m[0].length) }
    } else {
      depth++
    }
  }
  return undefined
}

/** 取第一个 `needle`（如 `class="dsh-pm-report-windows"`）所在的那个 div 整块。 */
function blockAt(s: string, needle: string): { start: number; end: number; block: string } | undefined {
  const at = s.indexOf(needle)
  if (at < 0) return undefined
  const start = s.lastIndexOf('<div', at)
  if (start < 0) return undefined
  return divBlock(s, start)
}

/**
 * 抹平 ⑤：D-8 的窗口组归属位移——把 `.dsh-pm-report-windows` 那一块**从段里抽掉**，
 * 换成固定占位符（这一块本身单独逐字节比，见 driftCheck）。这样"它挂在谁下面"不再影响段比对，
 * 而"它的内容变了 / 它整个丢了"仍然会被抓住。
 */
function neutralizeWindowsPlacement(s: string): { text: string; windows: string | undefined; moved: boolean } {
  const blk = blockAt(s, 'class="dsh-pm-report-windows"')
  if (blk === undefined) return { text: s, windows: undefined, moved: false }
  return {
    text: s.slice(0, blk.start) + '<!--WINDOWS-->' + s.slice(blk.end),
    windows: blk.block,
    moved: true,
  }
}

/**
 * 把一段壳**按已声明偏差抹平**（五类，见文件上方那张清单）——返回抹平后的文本与逐类命中数。
 * 命中数会打进日志：它证明"抹平确实在工作"（否则抹平函数可能因为选择器写错而成了一段死代码）。
 */
function neutralize(s: string): { text: string; hits: Record<string, number> } {
  const count = (t: string, re: RegExp): number => (t.match(re) ?? []).length
  const hits: Record<string, number> = {}
  let t = s
  hits['图标位'] = count(t, /<span class="dsh-pm-tab-icon"[^>]*>[\s\S]*?<\/span>/g)
  t = neutralizeIcons(t)
  hits['ARIA/id/tabindex'] = count(t, / (?:role|aria-[a-z-]+|tabindex|data-proto-focus)="[^"]*"| id="(?:tab|panel)-[^"]*"/g)
  t = neutralizeA11y(t)
  hits['「本阶段操作」标签'] = count(t, new RegExp('<span class="dsh-pm-action-bar-label">' + ACTION_BAR_LABEL_TEXT + '</span>', 'g'))
  t = neutralizeActionLabel(t)
  hits['后果节点可见↔sr-only'] = count(t, /<span class="dsh-pm-action-consequence dsh-pm-sr-only"/g)
  t = neutralizeConsequenceClass(t)
  hits['评论输入框'] = count(t, /<div class="dsh-pm-comment-form"/g)
  t = neutralizeCommentForm(t)
  const wp = neutralizeWindowsPlacement(t)
  hits['窗口组归属位移'] = wp.moved ? 1 : 0
  t = wp.text
  return { text: t, hits }
}

/** 从原型里取某一态的**内联壳**（marker 之间的 `.dsh-pm-view` 里那个 `.dsh-pm-detail`）。 */
function embeddedShell(proto: string, state: string): string | undefined {
  const startMark = '<!-- proto-shell:' + state + ':start -->'
  const endMark = '<!-- proto-shell:' + state + ':end -->'
  const i0 = proto.indexOf(startMark), i1 = proto.indexOf(endMark)
  if (i0 < 0 || i1 < 0 || i1 < i0) return undefined
  const block = proto.slice(i0 + startMark.length, i1)
  const i = block.indexOf('<div class="dsh-pm-detail"')
  if (i < 0) return undefined
  const withWrapperClose = block.slice(i).trim()
  const j = withWrapperClose.lastIndexOf('</div>')   // 最外层 .dsh-pm-view 的收尾
  return withWrapperClose.slice(0, j)
}

/** 首个差异的上下文（人一眼能看到"差在哪个字节、两边各长什么样"）。 */
function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length)
  let k = 0
  while (k < n && a[k] === b[k]) k++
  return '首个差异在第 ' + String(k) + ' 字节（原型长 ' + String(a.length) + ' / 真实壳长 ' + String(b.length)
    + '）：原型=' + JSON.stringify(a.slice(k, k + 60)) + ' 真实壳=' + JSON.stringify(b.slice(k, k + 60))
}

/**
 * 漂移核对：原型的页面正文**必须**是当前 `buildReportShell(...)` 的输出。
 *
 * 为什么必须有它：原型是"把真实壳内联进 HTML"得到的——标本一改（mock 数据、壳结构、文案），
 * 内联的那份就**悄悄过期**了，而 PNG 与观测值会继续"绿"着说一个不存在的页面。
 * 所以这里在**每次出图前**重算一次真实壳，并**逐段**（head / band / panel / tabs 四段，一段都不许少）
 * 比字节：判据是"**抹平已声明偏差后**逐字节相同"；对不上就是致命失败（退出码 1），
 * 日志直接告诉人"重新内联"。
 *
 * FR-11 的两处真删**不只靠抹平**（否则"删了"与"从来没写过"分不出来）：这里额外做**逐节点断言**——
 * 打印操作条里剩下的分组标签是哪几个、少的正好是哪两个节点，并断言 sr-only 后果节点的文本 ===
 * 服务端 `consequence`（还核对主操作的 `aria-describedby` 指的就是它）。
 */
function driftCheck(proto: string): { problems: string[]; notes: string[] } {
  const problems: string[] = []
  const notes: string[] = []
  for (const state of ['inflight', 'terminal'] as const) {
    const report = reportOf(state)
    const fresh = buildReportShell(report, 'trunk', {
      data: asPanelPayload(TRUNK_SPECIMEN), revision: revisionOf(state),
    })
    const embed = embeddedShell(proto, state)
    if (embed === undefined) {
      problems.push('漂移：原型里找不到 ' + state + ' 态的内联壳（proto-shell:' + state + ':start/end 标记）')
      continue
    }
    let f: ReturnType<typeof segs>, e: ReturnType<typeof segs>
    try {
      f = segs(fresh); e = segs(embed)
    } catch (err) {
      problems.push('漂移：' + state + ' 态分段失败（' + (err as Error).message + '）')
      continue
    }
    // ① 四段全比：head / band / panel / tabs —— **一段都不许少**（少了就是"把判据删了"）
    const hitTotal: Record<string, number> = {}
    for (const name of ['head', 'band', 'panel', 'tabs'] as const) {
      const a = neutralize(e[name]), b = neutralize(f[name])
      for (const k of Object.keys(a.hits)) hitTotal[k] = (hitTotal[k] ?? 0) + (a.hits[k] ?? 0)
      if (a.text !== b.text) {
        problems.push('漂移：' + state + ' 态的 ' + name + ' 段（抹平五类已声明偏差后）与真实壳不一致：'
          + firstDiff(a.text, b.text))
      }
    }
    notes.push(state + ' 态已抹平的已声明偏差：'
      + Object.entries(hitTotal).map(([k, v]) => k + '×' + String(v)).join(' · '))
    // ② 六个 emoji 的**次序与归属**必须原样留存（emoji 活在 data-proto-icon-before 属性里）
    const emojiOf = (s: string): string[] => [...s.matchAll(/data-proto-icon-before="([^"]*)"/g)].map(m => m[1]!)
    const freshEmoji = emojiOf(f.tabs), embedEmoji = emojiOf(e.tabs)
    if (freshEmoji.length !== TAB_KEYS.length || embedEmoji.length !== TAB_KEYS.length) {
      problems.push('漂移：' + state + ' 态图标位数量不对（真实壳 ' + String(freshEmoji.length)
        + ' 个 / 原型 ' + String(embedEmoji.length) + ' 个，期望 6）')
    } else if (freshEmoji.join('') !== embedEmoji.join('')) {
      problems.push('漂移：' + state + ' 态结构位图标 emoji 与真实壳不一致（真实壳 [' + freshEmoji.join(' ')
        + '] / 原型 [' + embedEmoji.join(' ') + ']）')
    }
    // ③ 六个图标：各自恰 1 个内联 SVG，且属性齐（FR-1 的机械判据）
    const svgs = [...e.tabs.matchAll(/<svg\b[^>]*>/g)].map(m => m[0])
    if (svgs.length !== TAB_KEYS.length) {
      problems.push('漂移：' + state + ' 态 Tab 栏内联 SVG 有 ' + String(svgs.length) + ' 个（期望 6）')
    }
    for (const tag of svgs) {
      for (const need of ['viewBox="0 0 16 16"', 'fill="none"', 'stroke="currentColor"',
        'stroke-width="1.5"', 'aria-hidden="true"']) {
        if (!tag.includes(need)) problems.push('漂移：' + state + ' 态有 <svg> 缺 ' + need + '（' + tag.slice(0, 80) + '）')
      }
    }
    // ④ 结构位不再有 emoji 文本（emoji 只允许活在 data-proto-icon-before 属性里）
    const textOnly = e.tabs.replace(/<[^>]*>/g, '')
    const stray = ['📋', '📄', '🕸', '💬', '🪙', '🧱'].filter(x => textOnly.includes(x))
    if (stray.length > 0) problems.push('漂移：' + state + ' 态 Tab 栏文本里仍有结构位 emoji：' + stray.join(' '))
    // ⑤ FR-3：ARIA 齐不齐（只加属性，不动 data-* 与结构）
    const checks: [string, boolean][] = [
      ['role="tablist"', e.tabs.includes('role="tablist"')],
      ['aria-label（tablist）', /role="tablist" aria-label="[^"]+"/.test(e.tabs)],
      ['六个 role="tab"', (e.tabs.match(/role="tab"/g) ?? []).length === 6],
      ['恰 1 个 aria-selected="true"', (e.tabs.match(/aria-selected="true"/g) ?? []).length === 1],
      ['恰 5 个 aria-selected="false"', (e.tabs.match(/aria-selected="false"/g) ?? []).length === 5],
      ['六个 aria-controls="panel-*"', (e.tabs.match(/aria-controls="panel-[a-z]+"/g) ?? []).length === 6],
      ['恰 1 个 tabindex="0"', (e.tabs.match(/tabindex="0"/g) ?? []).length === 1],
      ['恰 5 个 tabindex="-1"', (e.tabs.match(/tabindex="-1"/g) ?? []).length === 5],
      ['panel role="tabpanel" + aria-labelledby=', /role="tabpanel" id="panel-trunk" aria-labelledby="tab-trunk"/.test(e.panel)],
    ]
    for (const [what, ok] of checks) if (!ok) problems.push('漂移：' + state + ' 态缺 FR-3 要求：' + what)

    /* ── FR-11 逐节点断言（真删必须被正面证明，不是"抹平后相同"）──────────────────── */
    // 少的第 ① 个节点：「本阶段操作」标签 span —— 打印**操作条里剩下的**分组标签是哪几个
    const bar = blockAt(e.head, 'class="dsh-pm-rh-bar"')?.block ?? ''
    const barLabels = [...bar.matchAll(/<span class="dsh-pm-action-bar-label">([^<]*)<\/span>/g)].map(m => m[1]!)
    if (bar.includes(ACTION_BAR_LABEL_TEXT)) {
      problems.push('漂移 FR-11：' + state + ' 态操作条里仍有「' + ACTION_BAR_LABEL_TEXT + '」标签（要求真删 DOM 节点）')
    }
    if (barLabels.length !== 0) {
      // 操作条里一个分组标签都不许剩：「窗口」那一个在**身份行**里（D-8），评论列表的也不在操作条内
      problems.push('漂移 FR-11：' + state + ' 态操作条里还有 ' + String(barLabels.length)
        + ' 个分组标签（期望 0）：[' + barLabels.join(' | ') + ']')
    }
    notes.push(state + ' 态 FR-11 逐节点：操作条内分组标签=' + (barLabels.length === 0 ? '无' : '[' + barLabels.join(' | ') + ']')
      + '（被真删的第 ① 个节点 = `.dsh-pm-action-bar-label`「' + ACTION_BAR_LABEL_TEXT + '」）')
    // 少的第 ② 个节点：常驻后果 —— 剩下的那个必须是 sr-only，且文本 === 服务端 consequence
    const conseq = [...e.head.matchAll(/<span class="dsh-pm-action-consequence([^"]*)"([^>]*)>([\s\S]*?)<\/span>/g)]
    const visible = conseq.filter(m => !m[1]!.includes('dsh-pm-sr-only'))
    if (visible.length > 0) {
      problems.push('漂移 FR-11：' + state + ' 态仍有 **常驻可见** 的后果节点 ' + String(visible.length)
        + ' 个（要求退出可见流、改 sr-only 披露）：「' + visible[0]![3]!.slice(0, 60) + '」')
    }
    if (state === 'inflight') {
      const want = PRIMARY_CONSEQUENCE
      const sr = conseq.find(m => m[1]!.includes('dsh-pm-sr-only'))
      if (sr === undefined) {
        problems.push('漂移 FR-11：inflight 态找不到 `.dsh-pm-action-consequence.dsh-pm-sr-only` 节点'
          + '（后果必须换成"视觉隐藏但可访问"的披露）')
      } else {
        const id = (/id="([^"]*)"/.exec(sr[2]!) ?? [])[1] ?? ''
        const text = sr[3]!.trim()
        if (text !== want) {
          problems.push('漂移 FR-11：sr-only 后果文本 ≠ 服务端 consequence（节点='
            + JSON.stringify(text.slice(0, 80)) + ' 服务端=' + JSON.stringify(want.slice(0, 80)) + '）')
        }
        if (id === '' || !e.head.includes('aria-describedby="' + id + '"')) {
          problems.push('漂移 FR-11：主操作的 aria-describedby 没有指向 sr-only 后果节点（节点 id='
            + JSON.stringify(id) + '）')
        }
        notes.push('inflight 态 FR-11 逐节点：sr-only 后果文本 === 服务端 consequence ✓（'
          + String(text.length) + ' 字，id=' + id + '，被主操作 aria-describedby 引用）'
          + '；被真删的第 ② 个节点 = 常驻可见的 `.dsh-pm-action-consequence`')
      }
    }
    /* ── FR-13 逐节点断言：评论输入框真删、只读评论列表仍在 ───────────────────────── */
    const forms = (e.head.match(/class="dsh-pm-comment-form"/g) ?? []).length
    const inputs = (e.head.match(/data-role="comment-input"/g) ?? []).length
    const senders = (e.head.match(/data-action="add-comment"/g) ?? []).length
    if (forms !== 0 || inputs !== 0 || senders !== 0) {
      problems.push('漂移 FR-13：' + state + ' 态头部仍有评论输入入口（form=' + String(forms)
        + ' / comment-input=' + String(inputs) + ' / add-comment=' + String(senders) + '）')
    }
    const rows = (e.head.match(/class="dsh-pm-comment" data-comment-row/g) ?? []).length
    if (rows === 0) {
      problems.push('漂移 FR-13：' + state + ' 态把**只读的最近评论列表**也删掉了（期望保留，只删输入入口）')
    }
    notes.push(state + ' 态 FR-13 逐节点：评论输入入口 0 处（form/comment-input/add-comment 全 0）· '
      + '只读评论行保留 ' + String(rows) + ' 条')
    /* ── D-8 逐节点断言：窗口组在身份行里（而不是在动作行里）──────────────────────────
       终态标本的 `sessionJump` 只有 1 个窗口 → 真实壳**不渲染**窗口组，此时这一条按"不适用"处理
       （判一个不存在的节点等于把标本形状当缺陷）；真实壳有、原型没有才是漂移。 */
    const top = blockAt(e.head, 'class="dsh-pm-rh-top"')
    const win = blockAt(e.head, 'class="dsh-pm-report-windows"')
    const freshWin = blockAt(f.head, 'class="dsh-pm-report-windows"')
    if (win === undefined) {
      if (freshWin === undefined) {
        notes.push(state + ' 态 D-8 逐节点：真实壳与原型都没有窗口组（该态无多窗口可跳）→ 不适用')
      } else {
        problems.push('漂移 D-8：' + state + ' 态找不到 `.dsh-pm-report-windows` 窗口组（真实壳有，原型没有）')
      }
    } else if (top === undefined || win.start < top.start || win.end > top.end) {
      problems.push('漂移 D-8：' + state + ' 态的窗口组不在身份行 `.dsh-pm-rh-top` 内（D-8 要求移进身份行）')
    } else {
      notes.push(state + ' 态 D-8 逐节点：窗口组在身份行 `.dsh-pm-rh-top` 内 ✓（容器归属位移，文本与属性未动）')
    }
  }
  return { problems, notes }
}

/* ───────────────────────────────────────────── 动效令牌的静态核对（FR-6 ①②③） */

/**
 * 为什么 FR-6 的前三条要**静态**核对：本机 headless Chrome 无论给不给
 * `--force-prefers-reduced-motion`，`matchMedia('(prefers-reduced-motion: reduce)')` 恒为 true
 * （实测：不带任何 flag 也是 reduce）→ 计算样式里的 duration 永远是 0s，
 * 那条"改后不是瞬变"的**计算值**在这一档量不到。所以：
 *   · FR-6 ④（reduced-motion 归零）用**计算样式**断言（见主流程）；
 *   · FR-6 ①②③（共享令牌 / 不写裸 ms / 只动颜色不动几何）用**原型 CSS 文本**断言。
 * 这是"如实说清哪一条量到了、哪一条只是读出来的"，不是把量不到的当通过。
 */
function motionTokenCheck(proto: string): string[] {
  const problems: string[] = []
  // 扫的是**原型里内联的那份真实 CSS 里属于详情页壳的那一片**（report.ts 的 REPORT_CSS——
  // 它是 13 片拼接里的**最后一片**，所以从它的小节标题切到块尾即可）。
  // 为什么不再找"v2 层"：v3 原型原本还叠着一层手写的改造层，那些规则已经**落到 src/** 里
  // （FR-6 的令牌搬进了 report.ts），原型现在内联的就是真实 CSS——扫真实 CSS 更有意义。
  // 又为什么要切片：别的分片（看板/甘特/设置）里也有 `transition: width .3s`，整块扫会误伤。
  const i = proto.indexOf('<style>')
  const j = proto.indexOf('</style>', i)
  if (i < 0 || j < 0) return ['动效令牌检查：原型里找不到内联 CSS 块']
  const SHARD = '⓪ 基底：面板包装器不吃内层滚动'
  const k = proto.indexOf(SHARD, i)
  if (k < 0 || k > j) return ['动效令牌检查：内联 CSS 里找不到详情页壳那一片（分片标题「' + SHARD + '」）']
  const css = proto.slice(k, j)
  // 取值依据：design/frontend.md「--pm-dur-fast / --pm-dur / --pm-dur-slow = 80ms / 120ms / 150ms」
  // 与 design/interfaces.md 同值（data-model.md 里那处 90ms 是更早的草稿，落地取 80ms）。
  const want: [string, number][] = [['--pm-dur-fast', 80], ['--pm-dur', 120], ['--pm-dur-slow', 150]]
  for (const [name, px] of want) {
    const m = new RegExp(name + '\\s*:\\s*(\\d+)ms').exec(css)
    if (m === null) { problems.push('动效令牌：详情页壳那一层里没有 ' + name + ' 的 ms 定义'); continue }
    const v = Number(m[1])
    if (v !== px) problems.push('动效令牌：' + name + ' = ' + String(v) + 'ms ≠ 设计值 ' + String(px) + 'ms')
    if (v < 80 || v > 150) problems.push('动效令牌：' + name + ' = ' + String(v) + 'ms 落在 80–150ms 之外')
  }
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) {
    problems.push('动效令牌：详情页壳那一层缺 @media (prefers-reduced-motion: reduce) 分支')
  } else {
    const blk = css.slice(css.indexOf('@media'))
    for (const name of ['--pm-dur-fast', '--pm-dur', '--pm-dur-slow']) {
      // 「归零」两种写法都算：0ms 与 0s（CSS 里 0s = 0ms；判据是时长为零，不是拼写）
      if (!new RegExp(name + '\\s*:\\s*(?:0ms|0s)\\b').test(blk)) {
        problems.push('动效令牌：reduced-motion 分支没有把 ' + name + ' 归零')
      }
    }
  }
  // 规则里不许出现裸 ms（ms 只允许出现在令牌定义那一行）
  for (const m of css.matchAll(/[^\n]*transition[^;{}]*\d+ms[^\n]*/g)) {
    const raw = m[0]!.trim()
    if (!raw.startsWith('--')) problems.push('动效令牌：transition 里出现裸 ms —— ' + raw.slice(0, 90))
  }
  const transitions = [...css.matchAll(/transition\s*:([^;}]*)/g)].map(m => m[1]!)
  if (!transitions.some(t => t.includes('var(--pm-dur'))) {
    problems.push('动效令牌：没有任何 transition 用 var(--pm-dur*) 取时长（"令牌单点"没落地）')
  }
  const GEOM = /(^|[\s,])(width|height|min-width|min-height|max-width|max-height|margin|padding|top|left|right|bottom|transform|inset|flex-basis|font-size)\b/
  for (const t of transitions) {
    if (GEOM.test(t)) problems.push('动效令牌：transition 动了几何属性 —— ' + t.trim().slice(0, 90))
  }
  return problems
}

/* ───────────────────────────────────────────────────── 页内测量脚本 */

/**
 * 注进原型副本的测量脚本（`#diag` 思路照 `scripts/req-report-probe.mts`）。
 *
 * 口径说明（每一条都能被复核）：
 *  · **只量当前显示的那个壳**：一页装了 inflight / terminal 两态标本，量错对象等于量了个 `display:none`；
 *  · `tabsTop` = `[data-report-tabs]` 的 `getBoundingClientRect().top`（与既有探针同定义）；
 *  · 状态带三格 = `[data-band-cell]` 各自 `height`（progress / gaps / outcome 各一条）；
 *  · 操作条 = `[data-report-actionbar]` 的 `height`；
 *  · Tab 内 SVG = 第一个 Tab 里 `svg` 的 `width/height`；
 *  · 最小可交互目标 = 壳内 `button / [role=tab] / a[href] / summary / input / select / textarea`
 *    的 `min(width,height)` 最小者（**命中区**，不是视觉框）；
 *  · 最小字号 = 壳内**带直接文本节点**的元素的 `font-size` 最小值（"真文字"口径：元素的
 *    子节点里得有非空文本节点，否则一个 `font-size:0` 的纯图形容器会污染判据）；
 *  · 内层滚动 = 计算样式 `overflow-y|x ∈ {auto,scroll}` 且内容装不下（真 DOM 实测，合法例外同探针）；
 *  · 横向溢出 = `documentElement` 与壳各自 `scrollWidth > clientWidth + 1`。
 * **先量完再 append `#diag`**：那段 JSON 很长且不折行，append 之后再去量横向溢出会量到自己。
 */
function measureScript(state: SpecimenState): string {
  return `<script>
(function () {
  var STATE = ${JSON.stringify(state)};
  var wrap = document.querySelector('.dsh-pm-view[data-proto-shell="' + STATE + '"]');
  var shell = wrap === null ? null : wrap.querySelector('[data-report-shell]');
  var de = document.documentElement;
  function rect(el) { return el === null || el === undefined ? null : el.getBoundingClientRect(); }
  function topOf(el) { var r = rect(el); return r === null ? -1 : Math.round(r.top); }
  function hOf(el) { var r = rect(el); return r === null ? 0 : Math.round(r.height); }
  function desc(el) {
    var cls = typeof el.className === 'string' && el.className.length > 0 ? '.' + el.className.split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + cls;
  }
  if (shell === null) {
    var bad = document.createElement('div');
    bad.id = 'diag';
    bad.textContent = JSON.stringify({ error: 'no-shell', state: STATE });
    document.body.appendChild(bad);
    return;
  }
  var tabs = shell.querySelector('[data-report-tabs]');
  var bar = shell.querySelector('[data-report-actionbar]');
  var band = shell.querySelector('[data-report-band]');

  /* ── 几何 ─────────────────────────────────────────────── */
  var bandCells = {};
  if (band !== null) {
    var cells = band.querySelectorAll('[data-band-cell]');
    for (var i = 0; i < cells.length; i++) bandCells[cells[i].getAttribute('data-band-cell')] = hOf(cells[i]);
  }
  var svg = shell.querySelector('.dsh-pm-tab .dsh-pm-tab-icon svg');
  var svgBox = rect(svg);
  var dots = shell.querySelector('[data-report-head] .dsh-pm-progress-dots');

  /* ── 最小可交互目标（命中区）────────────────────────────── */
  var targets = shell.querySelectorAll('button, [role=tab], a[href], summary, input, select, textarea');
  var minW = Infinity, minH = Infinity, minWWhat = '(无目标)', minHWhat = '(无目标)';
  for (var t = 0; t < targets.length; t++) {
    var r = targets[t].getBoundingClientRect();
    if (r.width < minW) { minW = r.width; minWWhat = desc(targets[t]) + '（' + r.width.toFixed(1) + '×' + r.height.toFixed(1) + '）'; }
    if (r.height < minH) { minH = r.height; minHWhat = desc(targets[t]) + '（' + r.width.toFixed(1) + '×' + r.height.toFixed(1) + '）'; }
  }
  if (!isFinite(minW)) minW = 0;
  if (!isFinite(minH)) minH = 0;

  /* ── 最小字号（只看"真文字"：自己有非空文本节点的元素）──── */
  var minFont = Infinity, minFontWhat = '(无文字)';
  var all = shell.querySelectorAll('*');
  for (var a = 0; a < all.length; a++) {
    var el = all[a];
    var hasText = false;
    for (var c = 0; c < el.childNodes.length; c++) {
      var n = el.childNodes[c];
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 0) { hasText = true; break; }
    }
    if (!hasText) continue;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < minFont) { minFont = fs; minFontWhat = desc(el) + ' ' + String(fs) + 'px'; }
  }
  if (!isFinite(minFont)) minFont = 0;

  /* ── 内层滚动容器（真 DOM 实测；例外同既有探针）────────── */
  var EXCEPTIONS = '.dsh-pm-detail, [data-dag-wrap], .dsh-pm-dag-canvas-wrap';
  var scanned = 0, innerScroll = 0, innerScrollWhat = [];
  for (var s = 0; s < all.length; s++) {
    var e2 = all[s];
    if (typeof e2.matches === 'function' && e2.matches(EXCEPTIONS)) continue;
    var cs = getComputedStyle(e2);
    var oy = cs.overflowY, ox = cs.overflowX;
    if (!(oy === 'auto' || oy === 'scroll' || ox === 'auto' || ox === 'scroll')) continue;
    scanned++;
    if (e2.scrollHeight > e2.clientHeight + 2 || e2.scrollWidth > e2.clientWidth + 2) {
      innerScroll++;
      if (innerScrollWhat.length < 4) innerScrollWhat.push(desc(e2));
    }
  }

  /* ── 横向溢出 ─────────────────────────────────────────── */
  var docOverflow = de.scrollWidth > de.clientWidth + 1;
  var shellOverflow = shell.scrollWidth > shell.clientWidth + 1;

  /* ── 动效令牌（FR-6）与 FR-8 的状态标记 ─────────────── */
  var btn = shell.querySelector('.dsh-pm-btn');
  var dur = btn === null ? '' : getComputedStyle(btn).transitionDuration;
  var dotsRow = shell.querySelector('[data-report-head] .dsh-pm-progress-dots');
  var dotsOverflow = dotsRow === null ? false : dotsRow.scrollWidth > dotsRow.clientWidth + 1;
  /* FR-8 的非颜色标记现在是**真实文本节点**（stage-detail.ts 输出的 ✓/▸/!!），不再是 CSS ::before
     ——所以这里读 textContent。读真实文本比读伪元素更强：伪元素读屏读不到，文本节点能。
     伪元素那一档仍一并打印（::before 若还被哪层 CSS 写着，日志里看得见），但不作为判据。 */
  function textOf(el) {
    return el === null ? '' : String(el.textContent || '').trim();
  }
  function beforeOf(el) {
    return el === null ? '' : String(getComputedStyle(el, '::before').content || '');
  }
  var primary = shell.querySelector('.dsh-pm-btn.primary');
  var redGap = shell.querySelector('.dsh-pm-gap-line[data-severity="red"] .dsh-pm-gap-mark');

  /* ── FR-9 操作条动作布局：主操作是否紧贴标签、破坏性动作是否贴行尾 ── */
  var gridEl = shell.querySelector('.dsh-pm-report-action-grid');
  var cells = Array.prototype.slice.call(shell.querySelectorAll('.dsh-pm-report-action'));
  var btnRects = cells.map(function (c) {
    var b = c.querySelector('.dsh-pm-btn');
    return b === null ? null : b.getBoundingClientRect();
  }).filter(Boolean);
  var gridRect = gridEl === null ? null : gridEl.getBoundingClientRect();
  var dangerBtn = shell.querySelector('.dsh-pm-report-action[data-action-rank="danger"] .dsh-pm-btn');
  var markerEl = shell.querySelector('.dsh-pm-human-only');
  var action = {
    count: btnRects.length,
    primaryLeft: btnRects.length > 0 ? Math.round(btnRects[0].left) : null,
    primaryW: btnRects.length > 0 ? Math.round(btnRects[0].width) : null,
    gridLeft: gridRect === null ? null : Math.round(gridRect.left),
    gridW: gridRect === null ? null : Math.round(gridRect.width),
    rowGapUnused: gridRect === null || btnRects.length < 2 ? null
      : Math.round(gridRect.width - btnRects.reduce(function (s, r) { return s + r.width; }, 0) - (btnRects.length - 1) * 12),
    dangerRight: dangerBtn === null ? null : Math.round(dangerBtn.getBoundingClientRect().right),
    markerLeft: markerEl === null ? null : Math.round(markerEl.getBoundingClientRect().left)
  };

  /* ── FR-10 样式多样性（七项）：与 scripts 里的 VARIETY_MAX / HISTORICAL_BEFORE 同一口径 ── */
  var els = Array.prototype.slice.call(shell.querySelectorAll('*'));
  var setFg = {}, setBg = {}, setFs = {}, setFw = {}, setBr = {}, setBc = {};
  /* FR-10（四）的前景色口径（2026-10-05 owner 改准）：**承载文字**的元素的颜色才算"前景色种类"，
     只出现在非文本元素（图标/装饰）上的色单列旁证——三级色 #86868b 就属于这一类（它只许非文本）。
     setFg 仍是"全元素"口径（老口径），用来与改前那张历史快照对照；判据用 setFgText。 */
  var setFgText = {}, setFgTextVisible = {}, setFgDeco = {}, fgSample = {};
  var pills = 0, elsNoSvg = 0;
  function hasOwnTextNode(el) {
    for (var ci = 0; ci < el.childNodes.length; ci++) {
      var cn = el.childNodes[ci];
      if (cn.nodeType === 3 && (cn.textContent || '').trim().length > 0) return true;
    }
    return false;
  }
  /* 视觉隐藏：自己或祖先 display:none / visibility:hidden，或落在 sr-only 截断盒里（FR-11 的后果节点）。
     为什么判它：三级色"只许非文本"这条要按**看得见的真文字**判，sr-only 文本看不见，不该算进去。 */
  function visuallyHidden(el) {
    var n = el;
    while (n !== null && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (typeof n.classList === 'object' && n.classList !== null && n.classList.contains('dsh-pm-sr-only')) return true;
      n = n.parentElement;
    }
    return false;
  }
  function alphaOf(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (m === null) return 1;
    var pp = m[1].split(',');
    return pp.length < 4 ? 1 : parseFloat(pp[3]);
  }
  var SIDES = [
    ['borderTopWidth', 'borderTopColor', 'borderTopStyle'],
    ['borderRightWidth', 'borderRightColor', 'borderRightStyle'],
    ['borderBottomWidth', 'borderBottomColor', 'borderBottomStyle'],
    ['borderLeftWidth', 'borderLeftColor', 'borderLeftStyle']
  ];
  for (var v = 0; v < els.length; v++) {
    var ve = els[v], vc = getComputedStyle(ve);
    if (ve.tagName.toLowerCase() !== 'svg' && ve.closest('svg') === null) elsNoSvg++;
    var rad = [vc.borderTopLeftRadius, vc.borderTopRightRadius, vc.borderBottomRightRadius,
      vc.borderBottomLeftRadius].map(function (x) { return parseFloat(x) || 0; });
    var maxR = Math.max.apply(null, rad);
    if (maxR >= 100) pills++;
    if (vc.color) setFg[vc.color] = 1;
    /* 承载文字的色 vs 只出现在非文本元素上的色（判据用的是前者，见上方注释） */
    if (vc.color) {
      if (hasOwnTextNode(ve)) {
        setFgText[vc.color] = 1;
        if (!visuallyHidden(ve)) setFgTextVisible[vc.color] = 1;
      } else {
        setFgDeco[vc.color] = 1;
      }
      if (!(vc.color in fgSample)) {
        fgSample[vc.color] = desc(ve) + (hasOwnTextNode(ve) ? '（真文字）' : '（非文本）')
          + (visuallyHidden(ve) ? '（视觉隐藏）' : '');
      }
    }
    if (vc.backgroundColor && alphaOf(vc.backgroundColor) > 0) setBg[vc.backgroundColor] = 1;
    setFs[vc.fontSize] = 1;
    setFw[vc.fontWeight] = 1;
    if (maxR > 0) setBr[rad.join('/')] = 1;
    for (var sd = 0; sd < 4; sd++) {
      var bw = parseFloat(vc[SIDES[sd][0]]) || 0;
      if (bw > 0 && bw <= 2 && vc[SIDES[sd][2]] !== 'none' && alphaOf(vc[SIDES[sd][1]]) > 0) {
        setBc[vc[SIDES[sd][1]]] = 1;
      }
    }
  }
  function nKeys(o) { return Object.keys(o).length; }
  /* ── FR-10 §3.1：真文字对比度复测（WCAG 相对亮度；底色自下而上合成）────────── */
  function rgbOf(c) {
    var m = /rgba?\\(([^)]+)\\)/.exec(c || '');
    if (m === null) return { r: 0, g: 0, b: 0, a: 0 };
    var q = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: q[0], g: q[1], b: q[2], a: q.length < 4 ? 1 : q[3] };
  }
  function chan(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b); }
  function over(f, b) {
    return { r: f.a * f.r + (1 - f.a) * b.r, g: f.a * f.g + (1 - f.a) * b.g,
      b: f.a * f.b + (1 - f.a) * b.b, a: 1 };
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
    for (var li = layers.length - 1; li >= 0; li--) out = over(layers[li], out);
    return out;
  }
  var textCount = 0, minRatio = 99, minWhat = '(无真文字)', violations = [];
  for (var tx = 0; tx < els.length; tx++) {
    var te = els[tx];
    if (te.tagName.toLowerCase() === 'svg' || te.closest('svg') !== null) continue;
    var hasOwnText = false;
    for (var tc = 0; tc < te.childNodes.length; tc++) {
      var tn = te.childNodes[tc];
      if (tn.nodeType === 3 && (tn.textContent || '').trim().length > 0) { hasOwnText = true; break; }
    }
    if (!hasOwnText) continue;
    var tcs = getComputedStyle(te);
    var tfs = parseFloat(tcs.fontSize) || 0;
    var tfw = parseInt(tcs.fontWeight, 10) || 400;
    var big = tfs >= 24 || (tfs >= 18.66 && tfw >= 700);
    var needR = big ? 3 : 4.5;
    var bgC = bgBehind(te);
    var fgC = over(rgbOf(tcs.color), bgC);
    var rr = Math.round(ratio(fgC, bgC) * 100) / 100;
    textCount++;
    var whatTxt = (te.textContent || '').trim().slice(0, 20);
    if (rr < minRatio) { minRatio = rr; minWhat = desc(te) + ' ' + String(tfs) + 'px/' + String(tfw) + ' 「' + whatTxt + '」'; }
    if (rr < needR && violations.length < 8) {
      violations.push(desc(te) + ' ' + String(tfs) + 'px/' + String(tfw) + ' ' + String(rr) + ':1 < ' + String(needR)
        + ' 「' + whatTxt + '」');
    }
  }
  if (textCount === 0) minRatio = 0;
  var textContrast = { count: textCount, min: minRatio, minWhat: minWhat, violations: violations };

  var variety = {
    elements: els.length, elementsNoSvg: elsNoSvg, pills: pills,
    fg: nKeys(setFgText), bg: nKeys(setBg), fontWeight: nKeys(setFw), fontSize: nKeys(setFs),
    radius: nKeys(setBr), borderColor: nKeys(setBc),
    fgValues: Object.keys(setFgText), bgValues: Object.keys(setBg),
    /* 旁证读数（一起打印/回填，人和断言都看得见）：
       · fgAll = 全元素去重色数（老口径，与改前历史快照对照用）；
       · fgTextVisible = 看得见的真文字上的色（#86868b 不许出现在这里）；
       · fgDeco = 只出现在非文本元素（图标/装饰）上的色。 */
    fgAll: nKeys(setFg), fgAllValues: Object.keys(setFg),
    fgTextVisibleValues: Object.keys(setFgTextVisible), fgDecoValues: Object.keys(setFgDeco),
    /* 「只在非文本元素上出现」的那一档：它**不进**"前景色种类"的计数（#86868b 若在场就属于这里）。
       与 fgDecoValues 的区别：后者是"在非文本元素上出现过"（可能同时也在文字上）。 */
    fgDecoOnlyValues: Object.keys(setFgDeco).filter(function (c) { return !(c in setFgText); }),
    fgSample: fgSample,
    /* FR-10（四）的"不得出现阶梯外字号"要用它判：只报个数不够，得看得见是**哪几档**。
       转成数字排序，日志里读起来是 11 / 12 / 13 / 15 / 20 / 24。 */
    fontSizeValues: Object.keys(setFs).map(function (x) { return parseFloat(x); }).sort(function (a, b) { return a - b; })
  };

  var diag = document.createElement('div');
  diag.id = 'diag';
  diag.textContent = JSON.stringify({
    state: STATE, w: de.clientWidth, vh: de.clientHeight,
    variety: variety, textContrast: textContrast,
    tabsTop: topOf(tabs), bandCells: bandCells, actionBarH: hOf(bar), dotsH: hOf(dots),
    action: action,
    svgW: svgBox === null ? 0 : Math.round(svgBox.width), svgH: svgBox === null ? 0 : Math.round(svgBox.height),
    minTargetW: Math.round(minW * 10) / 10, minTargetH: Math.round(minH * 10) / 10,
    minTargetWWhat: minWWhat, minTargetHWhat: minHWhat,
    minFontSize: minFont, minFontWhat: minFontWhat,
    innerScroll: innerScroll, innerScrollScanned: scanned, innerScrollWhat: innerScrollWhat,
    docOverflow: docOverflow, shellOverflow: shellOverflow,
    transitionDuration: dur,
    dotsOverflow: dotsOverflow,
    dotMarkerCompleted: textOf(shell.querySelector('.dsh-pm-dot-wrapper.completed .dsh-pm-dot-mark')),
    dotMarkerActive: textOf(shell.querySelector('.dsh-pm-dot-wrapper.current .dsh-pm-dot-mark')),
    dotMarkerBefore: beforeOf(shell.querySelector('.dsh-pm-dot-wrapper.completed .dsh-pm-dot-label')),
    gapMarkerRed: textOf(redGap),
    /* 终态标本**没有**缺口行、**没有**动作按钮（FR-3：终态只读、不留假出口）——
       这两条断言在缺席时按"不适用"处理，而不是判红（判不存在的元素等于把标本形状当缺陷）。 */
    hasRedGap: redGap !== null,
    primaryFill: primary === null ? '' : getComputedStyle(primary).backgroundColor,
    hasPrimary: primary !== null,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tabCount: shell.querySelectorAll('[data-report-tabs] .dsh-pm-tab').length,
    tabSvgCount: shell.querySelectorAll('[data-report-tabs] .dsh-pm-tab-icon svg[aria-hidden="true"]').length,
  });
  document.body.appendChild(diag);
})();
</script>`
}

/** 从 `--dump-dom` 的 DOM 文本里取 `#diag` 的 JSON（实体还原后再 parse）。 */
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

/** FR-10 复测的七项读数（含明细色值，便于日志里一眼看出多出来的是哪一种）。 */
interface Variety {
  elements: number
  elementsNoSvg: number
  pills: number
  fg: number
  bg: number
  fontWeight: number
  fontSize: number
  radius: number
  borderColor: number
  fgValues: string[]
  bgValues: string[]
  /** 全元素去重色数（老口径；与改前的历史快照 9 对照用），判据用的是 `fg`。 */
  fgAll: number
  fgAllValues: string[]
  /** 看得见的真文字上的色（`#86868b` 不许出现在这里）。 */
  fgTextVisibleValues: string[]
  /** 在非文本元素（图标/装饰）上出现过的色。 */
  fgDecoValues: string[]
  /** **只在**非文本元素上出现的色——这一档不进"前景色种类"的计数（`#86868b` 若在场就落在这里）。 */
  fgDecoOnlyValues: string[]
  /** 每个色值 → 一个例子的描述（日志与失败信息里直接指认"这个色从哪来"）。 */
  fgSample: Record<string, string>
  /** 壳内出现过的全部字号（px，升序）——FR-10（四）用它判"无阶梯外字号"。 */
  fontSizeValues: number[]
}

interface Diag {
  error?: string
  state: string
  w: number
  vh: number
  variety?: Variety
  textContrast?: { count: number; min: number; minWhat: string; violations: string[] }
  tabsTop: number
  bandCells: Record<string, number>
  actionBarH: number
  /** FR-9 操作条动作布局的几何（终态无动作时各字段为 null）。 */
  action?: {
    count: number
    primaryLeft: number | null
    primaryW: number | null
    gridLeft: number | null
    gridW: number | null
    rowGapUnused: number | null
    dangerRight: number | null
    markerLeft: number | null
  }
  dotsH: number
  svgW: number
  svgH: number
  minTargetW: number
  minTargetH: number
  minTargetWWhat: string
  minTargetHWhat: string
  minFontSize: number
  minFontWhat: string
  innerScroll: number
  innerScrollScanned: number
  innerScrollWhat: string[]
  docOverflow: boolean
  shellOverflow: boolean
  transitionDuration: string
  dotsOverflow: boolean
  dotMarkerCompleted: string
  dotMarkerActive: string
  /** 伪元素那一档的观测值（只为日志留痕；FR-8 的判据读的是上面的真实文本）。 */
  dotMarkerBefore: string
  gapMarkerRed: string
  hasRedGap: boolean
  primaryFill: string
  hasPrimary: boolean
  reducedMotion: boolean
  tabCount: number
  tabSvgCount: number
}

/* ───────────────────────────────────────────────────── 观测值回填 */

/** 一条观测（原型的 `proto-geometry` 里只允许出现这四样：name/value/unit/at）。 */
interface Observation {
  name: string
  value: number
  unit: string
  at: { width: number; state: string }
}

/**
 * 把实测值写回原型的 `<!-- proto-geometry … -->` 注释（**只写观测值**）。
 *
 * 为什么由脚本回填而不是手抄：手抄的数是"当时的数"，标本一动就过期；回填保证
 * "HTML 里读到的观测值 = 最后一次跑出来的实测值"。阈值一律留在本脚本里。
 */
function fillGeometry(protoPath: string, obs: Observation[]): string {
  const src = readFileSync(protoPath, 'utf8')
  const re = /<!-- proto-geometry [\s\S]*? -->/
  if (!re.test(src)) throw new Error('原型里找不到 <!-- proto-geometry ... --> 注释')
  const json = JSON.stringify({ observations: obs })
  const next = src.replace(re, '<!-- proto-geometry ' + json + ' -->')
  writeFileSync(protoPath, next)
  return json
}

/* ───────────────────────────────────────────────────── 主流程 */

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('PROTOTYPE-SHOT FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    console.error('本机常见落点：/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    process.exit(2)
  }
  if (!existsSync(PROTO)) {
    console.error('PROTOTYPE-SHOT FAIL（退出码 1）：找不到权威原型 ' + PROTO)
    process.exit(1)
  }

  console.log('需求详情页 UI 权威原型：出图 + 几何实测（真实壳内联 · 真实 CSS · headless Chrome）')
  console.log('原型：' + PROTO)
  console.log('Chrome：' + chrome)

  const proto = readFileSync(PROTO, 'utf8')
  const failures: string[] = []
  const observations: Observation[] = []

  /* ── 0. 漂移核对：原型正文必须还是当前 buildReportShell 的输出 ─────────── */
  console.log('\n[0/3] 漂移核对（原型内联壳 vs 当前 buildReportShell 输出）+ 动效令牌静态核对')
  const drift = driftCheck(proto)
  for (const n of drift.notes) line(n)
  const driftAll = drift.problems.concat(motionTokenCheck(proto))
  if (driftAll.length > 0) {
    for (const d of driftAll) console.error('  ' + d)
    failures.push(...driftAll)
  } else {
    line('head / band / panel / tabs **四段**各自在抹平五类已声明偏差后与真实壳逐字节相同 ✓')
    line('六个结构位图标 emoji 的次序与归属与真实壳一致 ✓；每个 Tab 恰 1 个 svg[aria-hidden=true] ✓')
    line('FR-11 逐节点断言 ✓（见上两行）；FR-13 评论入口 0 处且只读评论行保留 ✓；D-8 窗口组在身份行内 ✓')
    line('动效令牌静态核对 ✓：--pm-dur-fast/--pm-dur/--pm-dur-slow = 80/120/150ms 三个都在 80–150ms 内；'
      + 'transition 全部取 var(--pm-dur*)（无裸 ms）；只动颜色类属性（无 width/height/margin/transform…）；'
      + 'reduced-motion 分支把三个时长归零')
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const dir = mkdtempSync(join(tmpdir(), 'pm-req-detail-proto-'))

  try {
    /* ── 1. 出图（after 三张 + 浅色岛对照一张，2 倍图，与 before 同口径）────── */
    console.log('\n[1/3] 出图（' + String(SCALE) + ' 倍图 · 视口 ' + String(WINDOW_HEIGHT) + ' 高，与 before 同口径）')
    for (const combo of COMBOS) {
      const { width, state } = combo
      const out = join(OUT_DIR, `ui-after-${String(width)}-${state}.png`)
      const url = `file://${PROTO}?state=${state}&v=next&annot=0`
      rmSync(out, { force: true })   // 先删旧图：否则 Chrome 没写出文件时旧图会被当成本轮产物

      const r = runChrome(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        `--force-device-scale-factor=${String(SCALE)}`,
        '--no-first-run', '--no-default-browser-check',
        // 与 before 同款：等合成器把各阶段跑完再拍，避免拍到"字体还没换好"的一帧
        '--run-all-compositor-stages-before-draw',
        `--window-size=${String(width)},${String(WINDOW_HEIGHT)}`,
        `--screenshot=${out}`, url,
      ])
      if (!r.ok) {
        console.error(`FAIL w=${String(width)} ${state}：Chrome 出图失败（${r.why}）`)
        failures.push(`出图 w=${String(width)} ${state}：Chrome 出图失败（${r.why}）`)
        continue
      }
      if (!existsSync(out)) {
        console.error(`FAIL w=${String(width)} ${state}：截图文件没生成（${out}）`)
        failures.push(`出图 w=${String(width)} ${state}：截图文件没生成`)
        continue
      }
      const bytes = statSync(out).size
      const px = pngSize(out)
      if (px === undefined || bytes < MIN_PNG_BYTES) {
        const why = px === undefined ? '不是合法 PNG' : `体量 ${String(bytes)} 字节 < 下限 ${String(MIN_PNG_BYTES)}（疑似空白图）`
        console.error(`FAIL w=${String(width)} ${state}：${why}`)
        failures.push(`出图 w=${String(width)} ${state}：${why}`)
        continue
      }
      const vw = px.w / SCALE, vh = px.h / SCALE
      const okSize = vw === width && vh === WINDOW_HEIGHT
      console.log(`  ${okSize ? 'OK' : 'FAIL'} w=${String(width)} ${state}：${String(bytes)} 字节（${(bytes / 1024).toFixed(0)} KB）`
        + ` ｜ PNG ${String(px.w)}×${String(px.h)} 像素 = CSS 视口 ${String(vw)}×${String(vh)}`)
      line(`产物：${out}`)
      if (!okSize) {
        failures.push(`出图 w=${String(width)} ${state}：实测视口 ${String(vw)}×${String(vh)}`
          + ` ≠ 期望 ${String(width)}×${String(WINDOW_HEIGHT)}（与 before 不同口径 → before/after 不可比）`)
      }
    }

    /* ── 1b. 浅色岛对照档（验收标准 #4）：同 v 下 dark ↔ 浅色必须逐字节相同 ──────────
       口径：`?theme=dark&v=next&annot=0` vs `?v=next&annot=0`（1280 · 在途，--window-size=1280,800），
       其余参数（倍图 / 隐藏滚动条 / 等合成器跑完）与上一档**逐项相同**——只有 `theme` 一个变量。
       判据是 sha256 相等（不是"看起来差不多"）：宿主深色主题在详情页里必须**一点影响都没有**
       （FR-4 的浅色岛：岛内令牌全是不引宿主主题的浅色原值）。
       ⚠️ **不许**拿 `?v=current` 当对照档（K8：它不是改前外观，对照退化成"自己跟自己比"）。 */
    {
      const islandWidth = 1280
      const light = join(OUT_DIR, `ui-after-${String(islandWidth)}-inflight.png`)
      const dark = join(OUT_DIR, `ui-after-${String(islandWidth)}-inflight-${ISLAND_DARK_THEME}.png`)
      const url = `file://${PROTO}?state=inflight&v=next&annot=0&theme=${ISLAND_DARK_THEME}`
      rmSync(dark, { force: true })
      const r = runChrome(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        `--force-device-scale-factor=${String(SCALE)}`,
        '--no-first-run', '--no-default-browser-check',
        '--run-all-compositor-stages-before-draw',
        `--window-size=${String(islandWidth)},${String(WINDOW_HEIGHT)}`,
        `--screenshot=${dark}`, url,
      ])
      console.log('  [浅色岛] ?theme=' + ISLAND_DARK_THEME + ' 对照档（同 v=next、同视口、同倍图）')
      if (!r.ok || !existsSync(dark)) {
        const why = r.ok ? '截图文件没生成' : r.why
        console.error('  FAIL 浅色岛对照档出图失败（' + why + '）')
        failures.push('浅色岛对照档（?theme=' + ISLAND_DARK_THEME + '）出图失败：' + why)
      } else if (!existsSync(light)) {
        failures.push('浅色岛对照：找不到同档浅色图 ' + light + '（无法比对）')
      } else {
        const a = sha256(light), b = sha256(dark)
        console.log('  ' + (a === b ? 'OK' : 'FAIL') + ' 浅色岛 sha256：light=' + a + ' ｜ dark=' + b
          + `（${String(statSync(dark).size)} 字节；两档逐字节${a === b ? '相同 ✓' : '不同 ✗'}）`)
        line('对照图：' + dark)
        if (a !== b) {
          failures.push('断言 浅色岛：?theme=' + ISLAND_DARK_THEME + ' 与浅色档的 PNG 不是逐字节相同'
            + '（sha256 light=' + a + ' / dark=' + b + '）——详情页不该受宿主主题影响（FR-4）')
        }
      }
    }

    /* ── 2. 测量（`--dump-dom` + 页内测量脚本；口径 = 探针那一档 vh=713）── */
    console.log('\n[2/3] 几何实测（--dump-dom · 视口高 ' + String(TABS_TOP_MAX) + ' 那一档）')
    for (const combo of COMBOS) {
      const { width, state } = combo
      const page = join(dir, `${String(width)}-${state}.html`)
      // 原型副本 + 页内测量脚本（**不动交付物本体**；测完 append #diag）
      writeFileSync(page, proto.replace('</body>', measureScript(state) + '</body>'))
      const r = runChrome(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check',
        `--window-size=${String(width)},${String(WINDOW_HEIGHT)}`, '--dump-dom',
        // **必须带 query**：页内脚本据此决定显隐，漏了就会量到 display:none 的那一态（全 0）
        `file://${page}?state=${state}&v=next&annot=0`,
      ])
      if (!r.ok) {
        console.error(`FAIL w=${String(width)} ${state}：Chrome 调用失败（${r.why}）`)
        failures.push(`测量 w=${String(width)} ${state}：Chrome 调用失败（${r.why}）`)
        continue
      }
      const diag = parseDiag(r.out)
      if (diag === undefined || diag.error !== undefined) {
        failures.push(`测量 w=${String(width)} ${state}：未读到 #diag（${diag?.error ?? '脚本未执行'}）`)
        continue
      }
      const at = { width, state: state as string }
      // 观测名必须**块内唯一**（锚点门 #5「observations[].name 块内唯一」）：`at` 里的 width/state
      // 是测量条件、不进 name，三个组合就会撞名 → 这里把条件并进 name。
      const push = (name: string, value: number, unit: string): void => {
        observations.push({ name: `${name}@${String(width)}/${state}`, value, unit, at })
      }
      const p = diag.bandCells['progress'] ?? 0
      const g = diag.bandCells['gaps'] ?? 0
      const o = diag.bandCells['outcome'] ?? 0
      push('tabsTop', diag.tabsTop, 'px')
      push('bandCellProgressH', p, 'px')
      push('bandCellGapsH', g, 'px')
      push('bandCellOutcomeH', o, 'px')
      push('actionBarH', diag.actionBarH, 'px')
      push('progressDotsH', diag.dotsH, 'px')
      push('tabIconSvgW', diag.svgW, 'px')
      push('tabIconSvgH', diag.svgH, 'px')
      push('minTargetW', diag.minTargetW, 'px')
      push('minTargetH', diag.minTargetH, 'px')
      push('minFontSize', diag.minFontSize, 'px')
      push('innerScrollContainers', diag.innerScroll, 'count')
      push('horizontalOverflow', diag.docOverflow || diag.shellOverflow ? 1 : 0, 'count')

      /* ── FR-9：动作布局（终态无动作格 → 各值缺席，按"不适用"处理）── */
      const act = diag.action
      const hasActions = act !== undefined && act.count > 0 && act.primaryLeft !== null && act.gridLeft !== null
      if (hasActions && act !== undefined) {
        push('actionPrimaryLeft', act.primaryLeft ?? -1, 'px')
        push('actionPrimaryW', act.primaryW ?? -1, 'px')
        push('actionGridLeft', act.gridLeft ?? -1, 'px')
        push('actionGridW', act.gridW ?? -1, 'px')
        push('actionRowGapUnused', act.rowGapUnused ?? -1, 'px')
        push('actionDangerRight', act.dangerRight ?? -1, 'px')
        push('actionMarkerLeft', act.markerLeft ?? -1, 'px')
        // ① 主操作紧贴动作区左端（不因等宽栅格被推到列里）
        if (act.primaryLeft !== act.gridLeft) {
          failures.push(`断言 FR-9 主操作紧贴动作区左端：w=${String(width)} ${state} primaryLeft=${String(act.primaryLeft)} gridLeft=${String(act.gridLeft)}`)
        }
        // ② 破坏性动作贴动作区行尾：其右边缘与行尾标之间就是 flex 的列间距（--s3 = 12px）
        if (act.dangerRight !== null && act.markerLeft !== null) {
          const gapToMarker = act.markerLeft - act.dangerRight
          if (Math.abs(gapToMarker - 12) > 1) {
            failures.push(`断言 FR-9 破坏性动作贴行尾（与行尾标间距 = 12px）：w=${String(width)} ${state} 实测 ${String(gapToMarker)}px`)
          }
        }
      }

      /* ── FR-10：七项多样性（回填观测 + 打印"改前 → 改后" + 断言）────────── */
      const vv = diag.variety
      if (vv !== undefined) {
        push('visualPills', vv.pills, 'count')
        push('visualForegroundColors', vv.fg, 'count')
        push('visualForegroundColorsAllElements', vv.fgAll, 'count')
        push('visualBackgroundColors', vv.bg, 'count')
        push('visualFontWeights', vv.fontWeight, 'count')
        push('visualFontSizes', vv.fontSize, 'count')
        push('visualBorderRadii', vv.radius, 'count')
        push('visualBorderColors', vv.borderColor, 'count')
        const rows: [string, keyof Variety, number][] = [
          ['胶囊元素（圆角≥100px）', 'pills', VARIETY_MAX.pills],
          ['前景色种类', 'fg', VARIETY_MAX.fg],
          ['底色种类', 'bg', VARIETY_MAX.bg],
          ['字重种类', 'fontWeight', VARIETY_MAX.fontWeight],
          ['字号种类', 'fontSize', VARIETY_MAX.fontSize],
          ['圆角种类', 'radius', VARIETY_MAX.radius],
          ['边线色种类', 'borderColor', VARIETY_MAX.borderColor],
        ]
        console.log(`  [FR-10 复测] 改前（**人给的历史快照**，对照图 evidence/ui-before-*.png）`
          + ` → 改后（?v=next 本机实测）`
          + ` ｜ 标本 ${String(vv.elementsNoSvg)} 元素（含 svg 子树 ${String(vv.elements)}）`
          + ` · w=${String(width)} ${state}`)
        for (const [label, key, max] of rows) {
          const before = HISTORICAL_BEFORE[key as keyof typeof HISTORICAL_BEFORE]
          const after = vv[key] as number
          // 前景色两列口径不同（改前那 9 是"全元素"老口径，改后是"承载文字"口径）——如实标出来，
          // 不让读者以为这是同一把尺子的两次读数。
          const note = key === 'fg' ? '（改前=全元素口径 / 改后=承载文字口径）' : ''
          console.log(`    ${after <= max ? '✓' : '✗'} ${label}：${String(before)} → ${String(after)}（上限 ${String(max)}）${note}`)
          if (after > max) {
            failures.push(`断言 FR-10 ${label} ≤ ${String(max)}：w=${String(width)} ${state} 实测 ${String(after)}`
              + `（改前历史快照 ${String(before)}；前景色=${vv.fgValues.join(' ')} ｜ 底色=${vv.bgValues.join(' ')}）`)
          }
        }
        // FR-10（四）的字号判据是"**阶梯内 + 无阶梯外**"（2026-10-05 交接复核改准）：
        // 单看"≤6"会放过"六档全是阶梯外的字号"，所以这里逐值核对阶梯（FONT_LADDER）。
        const offLadder = vv.fontSizeValues.filter(v => !FONT_LADDER.includes(v))
        line(`字号阶梯核对：实测 ${vv.fontSizeValues.map(v => String(v) + 'px').join(' / ')}`
          + `（阶梯 ${FONT_LADDER.map(v => String(v)).join('/')}）→ `
          + `${offLadder.length === 0 ? '✓ 无阶梯外字号' : '✗ 阶梯外 ' + offLadder.map(v => String(v) + 'px').join(' / ')}`)
        if (offLadder.length > 0) {
          failures.push(`断言 FR-10 无阶梯外字号（阶梯 ${FONT_LADDER.join('/')}）：w=${String(width)} ${state}`
            + ` 实测出现 ${offLadder.map(v => String(v) + 'px').join(' / ')}`)
        }
        /* ── FR-10（四）前景色的第二条判据：**取值集合 ⊆ 色板**（比"只数种类"结实）──────────
           2026-10-05 owner 改准：单看"≤6"会放过"六种全是阶梯外色"，所以逐值核对色板
           （FG_PALETTE 的 7 个文字色 + 只许非文本的 FG_TERTIARY）。全元素口径一起查——
           换一个阶梯外的色，不管落在文字上还是图标上都会红。 */
        const allowed = new Set<string>([...FG_PALETTE, FG_TERTIARY])
        const offPalette = vv.fgAllValues.filter(c => !allowed.has(c))
        const sampleOf = (c: string): string => vv.fgSample[c] ?? '(未记到例子)'
        line(`前景色口径：承载文字 ${String(vv.fg)} 种 [${vv.fgValues.join(' ')}] ｜ `
          + `看得见的真文字 ${String(vv.fgTextVisibleValues.length)} 种 ｜ `
          + `只在非文本元素上出现（不计入种类）${String(vv.fgDecoOnlyValues.length)} 种 [${vv.fgDecoOnlyValues.join(' ')}] ｜ `
          + `全元素（老口径）${String(vv.fgAll)} 种`)
        if (offPalette.length > 0) {
          line('✗ 阶梯外前景色：' + offPalette.map(c => c + ' ← ' + sampleOf(c)).join(' ｜ '))
          failures.push(`断言 FR-10 前景色取值 ⊆ FR-10（二）色板：w=${String(width)} ${state} 出现阶梯外色 —— `
            + offPalette.map(c => c + ' ← ' + sampleOf(c)).join(' ｜ '))
        } else {
          line('前景色取值 ⊆ FR-10（二）色板 ✓（' + String(allowed.size) + ' 个允许值：'
            + [...FG_PALETTE, FG_TERTIARY].join(' ') + '）')
        }
        // 三级色 #86868b（白底 3.62:1）**只许非文本/图标**：落在看得见的真文字上就判红。
        if (vv.fgTextVisibleValues.includes(FG_TERTIARY)) {
          failures.push(`断言 三级色 ${FG_TERTIARY}（#86868b，3.62:1）不得承载看得见的真文字：`
            + `w=${String(width)} ${state} 实测出现在 ${sampleOf(FG_TERTIARY)}`)
        } else {
          line(`三级色 #86868b 未承载可见真文字 ✓（若出现，只允许在非文本/图标上：本例 `
            + `${vv.fgDecoOnlyValues.includes(FG_TERTIARY) ? '出现在 ' + sampleOf(FG_TERTIARY) : '未出现'}）`)
        }
      }

      const tc = diag.textContrast
      if (tc !== undefined) {
        // 观测名的单位只认 px | count | ratio —— 对比度正好用 ratio（无量纲比值）
        observations.push({
          name: `minTextContrast@${String(width)}/${state}`, value: tc.min, unit: 'ratio', at,
        })
        line(`真文字对比度复测：${String(tc.count)} 个真文字元素，最小 ${String(tc.min)}:1`
          + `（阈值 ${String(TEXT_CONTRAST_MIN)}:1）→ ${tc.violations.length === 0 ? '✓' : '✗'}`
          + ` ｜ 最小的一处：${tc.minWhat}`)
        if (tc.violations.length > 0) {
          failures.push(`断言 真文字对比度 ≥${String(TEXT_CONTRAST_MIN)}:1（FR-10 §3.1 色板复测）：`
            + `w=${String(width)} ${state} 实测最小 ${String(tc.min)}:1；不达标 ${String(tc.violations.length)} 处 —— `
            + tc.violations.join(' ｜ '))
        }
      }

      const tag = `[w=${String(diag.w)} · ${state}]`
      console.log('  ' + tag)
      line(`tabsTop=${String(diag.tabsTop)}px（上限 ${String(TABS_TOP_MAX)}，视口高 ${String(diag.vh)}）→ `
        + `${diag.tabsTop <= TABS_TOP_MAX ? '✓' : '✗'}`)
      line(`状态带三格高：做到哪了 ${String(p)}px / 缺口 ${String(g)}px / 结果与成效 ${String(o)}px`
        + `（上限 ${String(BAND_CELL_MAX_H)}px/格）→ ${[p, g, o].every(h => h <= BAND_CELL_MAX_H) ? '✓' : '✗'}`)
      line(`操作条整块高=${String(diag.actionBarH)}px（上限 ${String(ACTION_BAR_MAX_H)}px，仅 1280 档判）→ `
        + `${diag.w >= 1280 ? (diag.actionBarH <= ACTION_BAR_MAX_H ? '✓' : '✗') : '— 900 档不判（折行是宽度使然）'}`)
      line(`Tab 内 svg 尺寸=${String(diag.svgW)}×${String(diag.svgH)}px（期望 ${String(ICON_SVG_PX)}±${String(ICON_SVG_TOL)}×${String(ICON_SVG_PX)}±${String(ICON_SVG_TOL)}，`
        + `场上 ${String(diag.tabSvgCount)} 个 svg[aria-hidden] / ${String(diag.tabCount)} 个 Tab）→ `
        + `${diag.tabSvgCount === 6 && diag.tabCount === 6 && Math.abs(diag.svgW - ICON_SVG_PX) <= ICON_SVG_TOL ? '✓' : '✗'}`)
      line(`最小可交互目标=${String(diag.minTargetW)}×${String(diag.minTargetH)}px（下限 ${String(TARGET_MIN)}×${String(TARGET_MIN)}）`
        + `→ ${diag.minTargetW >= TARGET_MIN && diag.minTargetH >= TARGET_MIN ? '✓' : '✗'}`
        + ` ｜ 最窄：${diag.minTargetWWhat} ｜ 最矮：${diag.minTargetHWhat}`)
      line(`详情页最小字号=${String(diag.minFontSize)}px（下限 ${String(FONT_MIN)}px）`
        + `→ ${diag.minFontSize >= FONT_MIN ? '✓' : '✗'} ｜ 最小的一处：${diag.minFontWhat}`)
      line(`内层滚动容器=${String(diag.innerScroll)} 个（实测带 auto|scroll 的元素 ${String(diag.innerScrollScanned)} 个）`
        + `${diag.innerScroll === 0 ? ' → ✓' : ' → ✗ ' + diag.innerScrollWhat.join(' / ')}`)
      line(`横向溢出：documentElement=${diag.docOverflow ? '有' : '无'} ｜ 报告壳=${diag.shellOverflow ? '有' : '无'}`
        + ` → ${!diag.docOverflow && !diag.shellOverflow ? '✓' : '✗'}`)
      const q = (t: string): string => t.replace(/"/g, '')
      line(`[附] 阶段条整行高=${String(diag.dotsH)}px ｜ 阶段条自身溢出=${diag.dotsOverflow ? '有' : '无'}`
        + ` ｜ 阶段条标记 completed=${q(diag.dotMarkerCompleted)} current=${q(diag.dotMarkerActive)}`
        + ` ｜ 缺口 red 标记=${diag.hasRedGap ? q(diag.gapMarkerRed) : 'n/a（该标本无缺口行）'}`)
      line(`[附] .dsh-pm-btn 计算 transition-duration=${diag.transitionDuration}`
        + `（本机 headless 的 prefers-reduced-motion=${diag.reducedMotion ? 'reduce（Chrome 强制，非 reduce 档量不到）' : 'no-preference'}）`
        + (diag.hasPrimary
          ? ` ｜ 主按钮底色=${diag.primaryFill}（改前 rgb(74, 125, 255)）`
          : ' ｜ 主按钮底色=n/a（该标本无动作按钮）'))

      /* ── 断言（阈值就在这里，不在 HTML 里）────────────────────────── */
      if (diag.w !== width) failures.push(`测量 w=${String(width)} ${state}：实测视口宽 ${String(diag.w)} ≠ 期望 ${String(width)}`)
      if (diag.tabsTop > TABS_TOP_MAX) {
        failures.push(`断言 tabsTop ≤ ${String(TABS_TOP_MAX)}：w=${String(width)} ${state} 实测 ${String(diag.tabsTop)}`
          + '（六个 Tab 是六块内容的唯一入口，首屏看不到它等于都进不去）')
      }
      if (diag.docOverflow || diag.shellOverflow) {
        failures.push(`断言 无横向溢出：w=${String(width)} ${state}（documentElement=${String(diag.docOverflow)}`
          + ` / 报告壳=${String(diag.shellOverflow)}）`)
      }
      if (diag.innerScroll !== 0) {
        failures.push(`断言 无内层滚动：w=${String(width)} ${state} 实测 ${String(diag.innerScroll)} 个`
          + `（${diag.innerScrollWhat.join(' / ')}）`)
      }
      if (diag.minTargetW < TARGET_MIN || diag.minTargetH < TARGET_MIN) {
        failures.push(`断言 目标最小边 ≥${String(TARGET_MIN)}：w=${String(width)} ${state} 实测 `
          + `${String(diag.minTargetW)}×${String(diag.minTargetH)}（最窄 ${diag.minTargetWWhat} / 最矮 ${diag.minTargetHWhat}）`)
      }
      if (diag.minFontSize < FONT_MIN) {
        failures.push(`断言 最小字号 ≥${String(FONT_MIN)}px：w=${String(width)} ${state} 实测 `
          + `${String(diag.minFontSize)}px（${diag.minFontWhat}）`)
      }
      if (diag.w >= 1280 && diag.actionBarH > ACTION_BAR_MAX_H) {
        failures.push(`断言 操作条整块 ≤${String(ACTION_BAR_MAX_H)}px（既有硬判据）：w=${String(width)} ${state} 实测 ${String(diag.actionBarH)}`)
      }
      if ([p, g, o].some(h => h > BAND_CELL_MAX_H)) {
        failures.push(`断言 状态带单格 ≤${String(BAND_CELL_MAX_H)}px（既有硬判据）：w=${String(width)} ${state} 实测 [${String(p)}, ${String(g)}, ${String(o)}]`)
      }
      if (diag.tabSvgCount !== 6 || diag.tabCount !== 6 || Math.abs(diag.svgW - ICON_SVG_PX) > ICON_SVG_TOL) {
        failures.push(`断言 Tab 图标：w=${String(width)} ${state}（svg ${String(diag.svgW)}×${String(diag.svgH)}，`
          + `${String(diag.tabSvgCount)} 个 svg / ${String(diag.tabCount)} 个 Tab）`)
      }
      // FR-6：**按环境分支判**——headless 本机恒为 reduce（见 [2b] 与 motionTokenCheck 注释），
      // 那种环境下"0s"正是 FR-6 ④ 要的结果；非 reduce 环境里 0s 才是"瞬变"（FR-6 ①）。
      const allZero = /^0s(, 0s)*$/.test(diag.transitionDuration)
      if (diag.reducedMotion && !allZero) {
        failures.push(`断言 reduced-motion 下 transition-duration=0s（FR-6 ④）：w=${String(width)} ${state} 实测 ${diag.transitionDuration}`)
      }
      if (!diag.reducedMotion && allZero) {
        failures.push(`断言 非 reduced-motion 下交互反馈不是瞬变（FR-6 ①）：w=${String(width)} ${state} 实测 ${diag.transitionDuration}`)
      }
      if (diag.dotsOverflow) {
        failures.push(`断言 阶段条标签不撑破容器：w=${String(width)} ${state}（FR-8 ① 加了 ✓/▸ 前缀后仍不许溢出）`)
      }
      if (!diag.dotMarkerCompleted.includes('✓') || !diag.dotMarkerActive.includes('▸')) {
        failures.push(`断言 阶段条非颜色标记（FR-8 ①）：w=${String(width)} ${state} 实测 completed="`
          + diag.dotMarkerCompleted + '" / current="' + diag.dotMarkerActive + '"（期望含 ✓ 与 ▸）')
      }
      if (diag.hasRedGap && !diag.gapMarkerRed.includes('!!')) {
        failures.push(`断言 缺口严重度文本标记（FR-8 ②）：w=${String(width)} ${state} 实测 red="`
          + diag.gapMarkerRed + '"（期望含 !!）')
      }
      // FR-4 的"反白关系"判据仍然成立，取值随 FR-10 色板收敛：唯一强调色 --pm-accent #0071e3
      // （白字 4.70:1）。改前是 #4a7dff（3.70:1 ✗），FR-4 那一轮先改成 #2f5fd0（5.72:1），
      // FR-10 把"面/文字两级主色"合成一个苹果系统蓝后，白字余量从 5.72 降到 4.70 —— 仍达标。
      if (diag.hasPrimary && diag.primaryFill !== 'rgb(0, 113, 227)') {
        failures.push(`断言 实心主按钮底色=--pm-accent #0071e3（FR-10 色板 + FR-4 反白关系）：w=${String(width)} ${state}`
          + ` 实测 ${diag.primaryFill}（改前 #4a7dff = rgb(74, 125, 255)，白字只有 3.70:1）`)
      }
    }

    /* ── 2b. reduced-motion 分支（FR-6 ④）──────────────────────────────── */
    console.log('\n[2b] reduced-motion 分支（FR-6 ④：终态直接可读，不是变慢）')
    line('说明：本机 headless Chrome 的 prefers-reduced-motion 恒为 reduce（不带任何 flag 也是；'
      + '--force-prefers-reduced-motion=no-preference 也压不住）——所以这一档能实测的正是 FR-6 ④，'
      + '而"非 reduce 下不是瞬变"只能由 [0/3] 的静态令牌核对守住（如实记录，不当成量到了）')
    {
      const state: SpecimenState = 'inflight'
      const page = join(dir, 'reduce-1280-inflight.html')
      writeFileSync(page, proto.replace('</body>', measureScript(state) + '</body>'))
      const r = runChrome(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check', '--force-prefers-reduced-motion',
        `--window-size=1280,${String(WINDOW_HEIGHT)}`, '--dump-dom',
        `file://${page}?state=inflight&v=next&annot=0`,
      ])
      const diag = r.ok ? parseDiag(r.out) : undefined
      if (diag === undefined) {
        line('（跳过）本次 Chrome 没能跑出这一档，reduced-motion 分支未实测 —— 不静默当通过')
      } else if (!diag.reducedMotion) {
        line('（无法实测）本机 Chrome 不认 --force-prefers-reduced-motion（matchMedia 仍为 no-preference）'
          + ' —— 如实记为"未实测"，请人工在系统「减少动态效果」下复核')
      } else {
        // 观测名的单位只认 px | count | ratio（锚点门 #5 的值域）——"秒"不在值域里，
        // 故记成"非零过渡条数"（count），语义等价且不撒谎。
        observations.push({
          name: `reducedMotionNonZeroDurations@1280/${state}`,
          value: String(diag.transitionDuration).split(',').filter(d => d.trim() !== '' && d.trim() !== '0s').length,
          unit: 'count', at: { width: 1280, state },
        })
        line(`reduced-motion 生效（matchMedia=reduce）｜ .dsh-pm-btn 计算 transition-duration=${diag.transitionDuration}`
          + ` → ${/^0s(, 0s)*$/.test(diag.transitionDuration) ? '✓ 时长已归零' : '✗ 仍有过渡'}`)
        if (!/^0s(, 0s)*$/.test(diag.transitionDuration)) {
          failures.push(`断言 reduced-motion 下 transition-duration=0s：实测 ${diag.transitionDuration}`)
        }
      }
    }
    /* ── 2c. **没有"改前基线复现"这一段了** —— K8 的处置 ─────────────────────────
       旧版这里每次运行都会再量一遍 `?v=current`，逐项与需求 FR-10 人给的诊断值比对，
       对不上就响亮失败。K8 查明：原型里**没有任何 `[data-proto-v]` CSS 门控**，
       `?v=current` 与 `?v=next` 的七项多样性**逐项相同**（只差 Tab 栏 emoji ↔ SVG），
       所以那条断言在 v3 上**不可能成立**，而且它的存在会让人误以为"`?v=current` = 改前外观"。
       按 K8 处置②：改前那一列一律改标为「**人给的历史快照**（出自真实页面基线，对照图见
       `evidence/ui-before-*.png`）」——本脚本只把它**打印**出来供人对照（见 [FR-10 复测]），
       **不再**拿它当基线断言。要量真实改前，看 `scripts/req-detail-ui-shot.mts` 出的 before 图。 */
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  /* ── 3. 观测值回填（只写观测值；阈值留在本脚本）────────────────────────── */
  console.log('\n[3/3] 观测值回填进原型的 <!-- proto-geometry ... -->')
  let json = ''
  try {
    json = fillGeometry(PROTO, observations)
    line(`已写入 ${String(observations.length)} 条观测（name/value/unit/at；**无阈值**）`)
    line('proto-geometry ' + json)
  } catch (e) {
    failures.push('回填 proto-geometry 失败：' + (e as Error).message)
  }

  if (failures.length > 0) {
    console.error('\nPROTOTYPE-SHOT FAIL（退出码 1）')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log(`\nPROTOTYPE-SHOT PASS（4 张 after 图（含浅色岛 dark 对照档）+ 四段漂移核对 + FR-11 逐节点断言 +`
    + ` 几何断言 + FR-10 七项收敛全过：胶囊 ≤ ${String(VARIETY_MAX.pills)} /`
    + ` 无横向溢出 / 无内层滚动 / 目标最小边 ≥${String(TARGET_MIN)} / 最小字号 ≥${String(FONT_MIN)}px /`
    + ` Tab 图标 SVG ${String(ICON_SVG_PX)}px / 操作条 ≤${String(ACTION_BAR_MAX_H)}px / 状态带单格 ≤${String(BAND_CELL_MAX_H)}px /`
    + ` 前景色 ≤${String(VARIETY_MAX.fg)}（且取值 ⊆ 色板） · 底色 ≤${String(VARIETY_MAX.bg)} ·`
    + ` 字重 ≤${String(VARIETY_MAX.fontWeight)} · 字号 ≤${String(VARIETY_MAX.fontSize)}（且无阶梯外字号） ·`
    + ` 圆角 ≤${String(VARIETY_MAX.radius)} · 边线色 ≤${String(VARIETY_MAX.borderColor)}）`)
}

main()
