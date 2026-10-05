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
 *
 * 用法：npx tsx scripts/req-report-probe.mts
 * 退出码：0 = 四组合全过；1 = 有断言失败；2 = 环境不可用（找不到 Chrome **或** Chrome 四组合全起不来），
 * 响亮失败、不静默跳过（两种红的处置完全不同：一个去装浏览器，一个去看页面）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReportShell } from '../src/client/views/report-tabs.js'
// 评论列表的渲染上限（条数）从**渲染层**取，避免探针自己写一份会漂移的常量
import { COMMENT_RENDER_LIMIT } from '../src/client/views/report-head.js'
import type { PanelResult, ReportResponse, TrunkResponse } from '../src/shared/protocol.js'
import { BASE_CSS } from '../src/client/styles/base.js'
import { DETAIL_CSS } from '../src/client/styles/detail.js'
import { FILES_CSS } from '../src/client/styles/files.js'
import { BOARD_CSS } from '../src/client/styles/board.js'
import { PANEL_CSS } from '../src/client/styles/panel.js'
import { TOKEN_CSS } from '../src/client/styles/token.js'
import { MARKS_CSS } from '../src/client/styles/marks.js'
import { SUBTASK_CSS } from '../src/client/styles/subtask.js'
import { NODE_PANEL_CSS } from '../src/client/styles/node-panel.js'
import { TRACEABILITY_CSS } from '../src/client/styles/traceability.js'
import { DAG_CSS } from '../src/client/styles/dag.js'
import { SETTINGS_CSS } from '../src/client/styles/settings.js'
import { REPORT_CSS } from '../src/client/styles/report.js'

// 样式拼接顺序照 `src/client/styles.ts`：真实页面吃什么，探针就吃什么（漏一片就可能把某个
// 「本来就有限高」的规则漏掉，探针会假绿）。
const CSS = BASE_CSS + DETAIL_CSS + FILES_CSS + BOARD_CSS + PANEL_CSS + TOKEN_CSS
  + MARKS_CSS + SUBTASK_CSS + NODE_PANEL_CSS + TRACEABILITY_CSS + DAG_CSS + SETTINGS_CSS + REPORT_CSS

/** 两档宽度（卡原文）：1280 宽档、900 窄档。 */
const WIDTHS: readonly number[] = [1280, 900]

/**
 * 视口尺寸：宽度按档位，高度对齐设计文档里的首屏假定（`requirement.md`「首屏（1200×800）」）。
 * headless 的 `--window-size` 高度含约 87px 的浏览器外框，故 800 档实测视口高约 713——
 * **比设计的 800 更严**：在 713 上过得了，在 800 上必然也过得了（反之不成立）。
 */
const WINDOW_HEIGHT = 800

/** 两种状态：在途（implementing，有缺口有任务）/ 终态（archived，只读）。 */
type SpecimenState = 'inflight' | 'terminal'
const STATES: readonly { key: SpecimenState; label: string }[] = [
  { key: 'inflight', label: '在途 implementing' },
  { key: 'terminal', label: '终态 archived' },
]

const REQ_ID = 'REQ-261004222448-292a'
const T0 = Date.parse('2026-10-04T23:41:00+08:00')
const M = 60_000
const H = 3600_000

/** 未激活的面板 key（A4：这些 key 的 `data-panel` 不得出现在 DOM 里）。 */
const INACTIVE_PANEL_KEYS: readonly string[] = ['docs', 'dag', 'dialogue', 'token', 'prompts']

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
 * 线上真实存在的「产物自动发现」系统转储（`/report` 里一条 11,157 字）的等价标本：
 * 同一形状（首行一句话 + 超长明细），长度也同量级。
 *
 * 为什么标本里必须有它：① 缺陷 ① 的现场就是这类机器转储；只喂人写的短评论，探针永远看不到
 * 这一支（截断/收纳逻辑写错了也全绿）；② 它同时验证"限条数 + 截断"之后评论列表仍 ≤ 260px。
 */
const LONG_SYSTEM_LOG = '[产物自动发现] 扫描需求目录：补登 141 个过程产物、回填 0 个过期种类'
  + '（落进 docs/requirements/' + REQ_ID + '/queue.json 与 rtm-*.yml）。明细：'
  + Array.from({ length: 600 }, (_, i) => 'artifact-' + String(i) + '.png').join('、')

/** 报告标本（在途 / 终态各一份）。字段全部按 `ReportResponse` 的形状给，不做 `as never` 掩盖。 */
function reportOf(state: SpecimenState): ReportResponse {
  const common = {
    id: REQ_ID,
    title: '需求详情页重做成工作汇报：常驻头部 + 六个同级 Tab、一律铺开、无内层滚动',
    category: 'feature',
    promptDifficulty: 'expert',
    blocked: false,
    createdAt: T0 - 6 * H,
    updatedAt: T0 - 2 * M,
    seats: [
      { windowKey: 'session-00af6c69-e55e-4878-8d4e-74056a439b01', role: 'owner' as const, joinedAt: T0 - 6 * H },
      { windowKey: 'session-w-b262610a', role: 'worker' as const, joinedAt: T0 - 3 * H },
      { windowKey: 'session-w-9f0c1d77', role: 'observer' as const, joinedAt: T0 - 2 * H },
    ],
  }
  if (state === 'inflight') {
    return {
      head: {
        ...common,
        status: 'implementing',
        sessionJump: [
          { windowKey: 'session-00af6c69-e55e-4878-8d4e-74056a439b01', archived: false },
          { windowKey: 'session-w-b262610a', archived: true },
        ],
        comments: [
          { at: T0 - 40 * M, body: '[文档变更] 设计稿 v3：状态带三格定稿，缺口只列最严重 5 条', by: { kind: 'human' } },
          // 机器转储夹在中间：证明"收纳"是**逐条**判定的，不是只处理第一条/最后一条
          { at: T0 - 30 * M, body: LONG_SYSTEM_LOG, by: { kind: 'agent', sessionId: 'session-w-b262610a' } },
          { at: T0 - 12 * M, body: '口径勘误：内层滚动判据改为真 DOM 实测，不再 grep CSS 文本（会误伤 DAG 视口）', by: { kind: 'agent', sessionId: 'session-w-b262610a' } },
        ],
      },
      progress: {
        stageEnteredAt: T0 - 4 * H,
        stageStayedMs: 4 * H,
        sinceUpdateMs: 2 * M,
        tasks: { total: 17, done: 11, running: 2, todo: 4, subChainDone: 31, subChainTotal: 44 },
      },
      verdictLine: '实施中：17 张卡完成 11 张、2 张在跑；1 件缺口等人裁决，下一步由实施窗口补探针。',
      waitingHuman: 1,
      // 缺口故意给 6 条（> GAP_HEAD_LIMIT=5）→ 覆盖「只列最严重 5 条 + 如实说还有几条」那一行；
      // ref.id 给长无空格串（真实 REQ id / 卡 id 就是这种形状），横向溢出的最坏情况在这里。
      gaps: [
        { severity: 'red', what: '渲染探针尚未跑通', why: '无内层滚动的机械证据只能来自真实渲染', ref: { kind: 'task', id: 't-98684c' } },
        { severity: 'red', what: '首屏四问缺「缺什么」的落点', why: '缺口清零时只有空表就没有答案', ref: { kind: 'clause', id: 'FR-4' } },
        { severity: 'yellow', what: '文档 Tab 的宽表未核验断词', why: '长路径是无空格 monospace，会撑破容器', ref: { kind: 'artifact', id: `docs/requirements/${REQ_ID}/design/architecture.md` } },
        { severity: 'yellow', what: '终态只读的评论列表尚无回归', why: '只读不等于看不见，审计要看谁批的', ref: { kind: 'clause', id: 'FR-12' } },
        { severity: 'gray', what: '对话 Tab 分页游标未接', why: '服务端未给 page.before，如实说不可用即可', ref: { kind: 'confirm', id: 'pc-261004222448-292a-01' } },
        { severity: 'gray', what: '提示词 Tab 仍为空态占位', why: '面板占位已按契约标出，非本卡范围' },
      ],
      actions: [
        { key: 'move', to: 'accepting', label: '提交验收', consequence: '推进到验收态后由人逐项裁决；未过项自动返工。', humanOnly: true },
        { key: 'cancel', label: '取消立项', consequence: '需求转为已取消，只读保留；此动作需人工确认。', humanOnly: true },
      ],
      nextStepForAgent: '补齐 t-98684c 渲染探针并跑通四组合（1280/900 × 在途/终态）。',
      tabCounts: { docs: '7', dag: '17', token: '1.84M' },
    }
  }
  return {
    head: {
      ...common,
      status: 'archived',
      sessionJump: [{ windowKey: 'session-00af6c69-e55e-4878-8d4e-74056a439b01', archived: true }],
      comments: [
        { at: T0 - 30 * M, body: '归档：四组合探针通过，反向验证确认探针会红', by: { kind: 'human' } },
      ],
    },
    progress: {
      stageEnteredAt: T0 - 8 * H,
      stageStayedMs: 8 * H,
      sinceUpdateMs: 30 * M,
      tasks: { total: 17, done: 17, running: 0, todo: 0, subChainDone: 44, subChainTotal: 44 },
    },
    verdictLine: '已归档：17 张卡全部完成，验收单逐项通过，无遗留问题。',
    waitingHuman: 0,
    // 终态 + 无缺口 → 状态带渲染「✅ 无缺口」正向结论行（A1 的「无缺口也算答」这一支）。
    gaps: [],
    actions: [],
    outcome: { verdict: 'pass', passed: 12, failed: 0, pendingItems: 0, leftovers: [] },
    tabCounts: { docs: '9', dag: '17', token: '2.10M' },
  }
}

/**
 * 汇报 Tab 的标本载荷（形状照 `TrunkResponse`：`{ items: [...] }`）。
 *
 * 为什么给真内容而不是空态：面板里最容易坏的两件事（长无空格串撑破容器、亮点两堆混容器）
 * 只有渲染出内容才量得到；给空态等于把探针的盲区当通过。
 */
const TRUNK_SPECIMEN: TrunkResponse = {
  docLastUpdated: T0 - 5 * M,
  items: [
    {
      key: 'why', source: ['doc'],
      summary: ['旧详情页把十来个区块一次性铺进一屏，读者既读不完也数不清；本需求把它改成「先回答四个问题」。'],
      openRefs: [{ label: '需求文档 · 背景', path: `docs/requirements/${REQ_ID}/requirement.md` }],
    },
    {
      key: 'problem', source: ['doc', 'ledger'],
      summary: [
        '缺口不可数：没有一处集中回答「卡在哪」。',
        '面板不可数：未激活的面板也在 DOM 里，渲染慢且读不完。',
      ],
      openRefs: [],
      facts: [{ label: '旧详情页区块数', value: '11', evidence: ['src/client/views/stage-detail.ts:190'] }],
    },
    {
      key: 'approach', source: ['doc'],
      summary: ['常驻头部 + 状态带三格 + 六个同级 Tab；Tab 切到才请求，同一 revision 内切回命中缓存。'],
      openRefs: [{ label: '设计 · 前端', path: `docs/requirements/${REQ_ID}/design/frontend.md` }],
    },
    {
      key: 'scope', source: ['doc'],
      summary: ['不做内层滚动：面板一律铺开，长了走页面滚动（内层滚动条会把「有多少」变成不可数）。'],
      openRefs: [],
    },
    {
      key: 'decision', source: ['doc', 'human'],
      summary: ['否掉「渲染全部再 CSS 隐藏」：那等于把禁止项放进 DOM，querySelector 一查就有。'],
      openRefs: [],
    },
    {
      // 缺节这一支也铺出来：探针要能同时看到「文档未提供该节（不编、不留白）」的渲染。
      key: 'tech', source: ['doc'], summary: [], missing: 'doc-section-missing', openRefs: [],
    },
    {
      key: 'highlight', source: ['doc', 'auto'], summary: [], openRefs: [],
      highlights: [
        { diff: '缺口清单把「该有而没有」逐条摊开，并指得回原文', why: '读者不必自己拼线索', evidence: ['scripts/req-report-probe.mts:1'] },
        { diff: '亮点反应付：无证据的差异单独成组', why: '混在一起就分不出哪条能核验', evidence: [] },
      ],
      achievement: ['四组合渲染探针落地（本卡）'],
    },
  ],
}

/**
 * 宽形状透传：壳的入参类型是 `PanelResult<unknown>`，其正常支是 `{ available?: true }`——
 * 一个**全属性可选**的弱类型，具体形状（`TrunkResponse`）与它没有公共属性，会被 TS 的弱类型检查拦下。
 * 故只在**这一处**放宽（与 `tests/report-degrade.test.ts` 的 `rawPayload` 同款处理）：
 * 标本常量本身仍受 `TrunkResponse` 约束，形状写错照样报错。
 */
function asPanelPayload(v: object): PanelResult<unknown> {
  return v as PanelResult<unknown>
}

/**
 * 一件标本页：真实壳 HTML + 真实 CSS + 页内断言脚本（写法照 `list-responsive-probe.mts`）。
 *
 * 外层用真实宿主类 `.dsh-pm-view`（`page/host.ts` 挂在页面上的就是它：flex column /
 * height:100% / overflow:hidden）——只有放进这层真实框架，`.dsh-pm-detail` 的
 * 「页面级滚动容器」身份才是真的（不然量出来的滚动行为是另一回事）。
 */
function specimenHtml(width: number, state: SpecimenState, expectLong: number): string {
  const report = reportOf(state)
  const shell = buildReportShell(report, 'trunk', {
    data: asPanelPayload(TRUNK_SPECIMEN),
    revision: state === 'inflight' ? 453 : 512,
  })
  const label = STATES.find(s => s.key === state)?.label ?? state
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>pmboard 需求详情页「工作汇报」渲染探针标本 · ${String(width)} · ${label}</title>
<style>
${CSS}
html, body { margin: 0; height: 100%; background: var(--dsw-bg-primary, #fff); }
body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #111827; }
</style></head>
<body><div class="dsh-pm-view" data-dsh-pm-view="1">${shell}</div>
<script>
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

  var diag = document.createElement('div');
  diag.id = 'diag';
  diag.textContent = JSON.stringify({
    w: de.clientWidth, state: ${JSON.stringify(state)}, vh: vh,
    doc: docBox, shell: shellBox, docOverflow: docOverflow, shellOverflow: shellOverflow,
    a1: a1, geom: geom, a3: { scanned: scanned, bad: bad }, overlaps: overlaps,
    tabsTopMax: TABS_TOP_MAX, commentListMaxH: COMMENT_LIST_MAX_H, commentRenderLimit: COMMENT_RENDER_LIMIT,
    a4: { present: present, hostCount: hostCount, trunkPresent: trunkPresent },
    problems: problems
  });
  document.body.appendChild(diag);
})();
</script></body></html>`
}

/** 浏览器落点：CHROME_BIN 优先，其次 macOS / Linux 常见路径（与既有探针同口径）。 */
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
  a3: { scanned: number; bad: string[] }
  overlaps: string[]
  a4: { present: string[]; hostCount: number; trunkPresent: boolean }
  problems: string[]
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

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('PROBE FAIL（环境不可用，退出码 2）：找不到 Chrome。')
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
      const page = join(dir, `${String(width)}-${state.key}.html`)
      writeFileSync(page, specimenHtml(width, state.key, state.key === 'inflight' ? 1 : 0))

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
      line(`     [诊断] 分量高度：头部 ${String(diag.geom.headH)}px（${diag.geom.headParts.join(' ')}）`
        + ` ｜ 状态带 ${String(diag.geom.bandH)}px（做到哪了 ${String(diag.geom.progressCellH)}`
        + ` / 缺口 ${String(diag.geom.gapsCellH)} / 成效 ${String(diag.geom.outcomeCellH)}）`)
      line(`A5 操作条按钮不重叠：${String(0)} 处相交 → ${yn(diag.overlaps.length === 0)}（窄档 design/test-cases.md 要求）`)

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

      const ok = diag.problems.length === 0
        && a1.head && a1.title && a1.band && a1.progress && a1.dots && a1.gaps && a1.tabs
        && !diag.docOverflow && !diag.shellOverflow
        && diag.a3.bad.length === 0
        && diag.a4.present.length === 0 && diag.a4.hostCount === 1 && diag.a4.trunkPresent
        && diag.geom.foldOk && diag.overlaps.length === 0
        && diag.geom.tabsInFold && diag.geom.commentsH <= diag.commentListMaxH
        && diag.geom.commentRows <= diag.commentRenderLimit
        && diag.w === width

      if (ok) {
        passed++
        console.log(`PASS w=${String(diag.w)} state=${state.key}（四问可答·L0 落点在首屏 ✓ / Tab 栏 top=${String(diag.geom.tabsTop)} ≤ ${String(diag.tabsTopMax)} ✓ / 评论列表 ${String(diag.geom.commentsH)}px ≤ ${String(diag.commentListMaxH)}px ✓ / 无横向溢出 ✓ / 无内层滚动容器 ✓ / 未激活面板缺席 ✓ / 操作条不重叠 ✓）`)
      } else {
        console.error(`FAIL w=${String(width)} state=${state.key}`)
        for (const p of diag.problems) console.error('  - ' + p)
        if (diag.w !== width) console.error(`  - 视口宽度 ${String(diag.w)} ≠ 期望 ${String(width)}（--window-size 未生效？）`)
        failures.push(`w=${String(width)} ${state.label}：${diag.problems.join(' | ') || '断言未过'}`)
      }
    }
  }

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
    + ' 无横向溢出 / 无内层滚动容器 / 未激活面板缺席 / 操作条不重叠）')
}

function yn(v: boolean): string {
  return v ? '✓' : '✗'
}

main()
