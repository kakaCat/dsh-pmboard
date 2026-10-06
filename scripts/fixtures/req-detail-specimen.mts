/**
 * 需求详情页「工作汇报」标本（共享模块）。
 *
 * 为什么需要它：需求详情页有两类下游需要同一份标本——
 *   ① `scripts/req-report-probe.mts`：只 dump DOM、读 `#diag` 做几何断言（不出图）；
 *   ② `scripts/req-detail-ui-shot.mts`：headless Chrome 出 PNG，供人做 before/after 视觉评审。
 * 两份都要「真实 `buildReportShell` + 真实 CSS + 同一套 mock 数据」，复制粘贴两份必然漂移
 * （改了标本数据只改一处，另一处的图/断言就对不上真实页面了）。所以数据与拼页逻辑收在这里，
 * 两边都 import；**断言口径与断言脚本不在这里**——那是各脚本自己的事（本模块不含任何判据）。
 *
 * 内容：真实 `ReportResponse` / `TrunkResponse` 标本（在途 implementing / 终态 archived 两态）、
 * 全量 CSS 拼接（顺序照 `src/client/styles.ts`：真实页面吃什么，标本就吃什么）、
 * 标本页拼装 `specimenShell(...)` / `specimenShellForPanel(...)`、浏览器落点查找 `findChrome()`。
 *
 * REQ-261005155003-f32f FR-5 / FR-7 起：另外**五个面板**（docs / dag / dialogue / token / prompts）
 * 也各有标本载荷 `PANEL_SPECIMENS`，配 `specimenShellForPanel(...)` 逐个渲染。
 * 为什么必须有它们：原型只画了 trunk，出图与探针也只渲染过 trunk——那五个 Tab 的
 * 「最小可点尺寸 / 字阶 / 结构图标（emoji 归零点）」**从未被渲染过**；没渲染过就没量过，
 * 没量过就不是验过（未验 ≠ 通过）。载荷形状写错即编译错误（FR-1 的静态面），
 * 不在渲染路径上放 `as never` 之类遮蔽。
 *
 * 纪律：本模块只读 `src/`（import 渲染函数与样式常量），不写任何文件、不碰台账。
 */
import { existsSync } from 'node:fs'
import { buildReportShell, REPORT_TABS, type ReportTabKey } from '../../src/client/views/report-tabs.js'
import type {
  DagResponse,
  DialogueResponse,
  DocsResponse,
  PanelResult,
  PromptsResponse,
  ReportResponse,
  RequirementTokenStageRow,
  TokenStageRow,
  TrunkResponse,
} from '../../src/shared/protocol.js'
// token 面板的载荷形状（服务端同响应并进扩展段）声明在 client/api.ts：那里是六个 Tab 的取数契约，
// 本模块只**读类型**（`import type` 编译期擦除，不把客户端取数代码拖进 node 脚本）。
import type { TokenPanelPayload } from '../../src/client/api.js'
import { BASE_CSS } from '../../src/client/styles/base.js'
import { DETAIL_CSS } from '../../src/client/styles/detail.js'
import { FILES_CSS } from '../../src/client/styles/files.js'
import { BOARD_CSS } from '../../src/client/styles/board.js'
import { PANEL_CSS } from '../../src/client/styles/panel.js'
import { TOKEN_CSS } from '../../src/client/styles/token.js'
import { MARKS_CSS } from '../../src/client/styles/marks.js'
import { SUBTASK_CSS } from '../../src/client/styles/subtask.js'
import { NODE_PANEL_CSS } from '../../src/client/styles/node-panel.js'
import { TRACEABILITY_CSS } from '../../src/client/styles/traceability.js'
import { DAG_CSS } from '../../src/client/styles/dag.js'
import { SETTINGS_CSS } from '../../src/client/styles/settings.js'
import { REPORT_CSS } from '../../src/client/styles/report.js'

/**
 * 全量 CSS 拼接（顺序照 `src/client/styles.ts`）。
 *
 * 顺序不能改：真实页面吃什么顺序，标本就吃什么顺序（漏一片、或次序不同，就可能把某个
 * 「本来就有限高」的规则漏掉/覆盖掉，探针会假绿、截图会跟真实页面不像）。
 */
export const SPECIMEN_CSS = BASE_CSS + DETAIL_CSS + FILES_CSS + BOARD_CSS + PANEL_CSS + TOKEN_CSS
  + MARKS_CSS + SUBTASK_CSS + NODE_PANEL_CSS + TRACEABILITY_CSS + DAG_CSS + SETTINGS_CSS + REPORT_CSS

/** 两档宽度（卡原文）：1280 宽档、900 窄档。 */
export const WIDTHS: readonly number[] = [1280, 900]

/**
 * 视口尺寸：宽度按档位，高度对齐设计文档里的首屏假定（`requirement.md`「首屏（1200×800）」）。
 * headless 的 `--window-size` 高度含约 87px 的浏览器外框，故 800 档实测视口高约 713——
 * **比设计的 800 更严**：在 713 上过得了，在 800 上必然也过得了（反之不成立）。
 */
export const WINDOW_HEIGHT = 800

/** 两种状态：在途（implementing，有缺口有任务）/ 终态（archived，只读）。 */
export type SpecimenState = 'inflight' | 'terminal'

/** 状态与中文标签（探针日志、截图标题共用一份，避免两处措辞漂移）。 */
export const STATES: readonly { key: SpecimenState; label: string }[] = [
  { key: 'inflight', label: '在途 implementing' },
  { key: 'terminal', label: '终态 archived' },
]

/** 未激活的面板 key（A4：这些 key 的 `data-panel` 不得出现在 DOM 里）。 */
export const INACTIVE_PANEL_KEYS: readonly string[] = ['docs', 'dag', 'dialogue', 'token', 'prompts']

export const REQ_ID = 'REQ-261004222448-292a'
export const T0 = Date.parse('2026-10-04T23:41:00+08:00')
export const M = 60_000
export const H = 3600_000

/**
 * 线上真实存在的「产物自动发现」系统转储（`/report` 里一条 11,157 字）的等价标本：
 * 同一形状（首行一句话 + 超长明细），长度也同量级。
 *
 * 为什么标本里必须有它：① 缺陷 ① 的现场就是这类机器转储；只喂人写的短评论，探针永远看不到
 * 这一支（截断/收纳逻辑写错了也全绿）；② 它同时验证"限条数 + 截断"之后评论列表仍 ≤ 260px。
 */
export const LONG_SYSTEM_LOG = '[产物自动发现] 扫描需求目录：补登 141 个过程产物、回填 0 个过期种类'
  + '（落进 docs/requirements/' + REQ_ID + '/queue.json 与 rtm-*.yml）。明细：'
  + Array.from({ length: 600 }, (_, i) => 'artifact-' + String(i) + '.png').join('、')

/** 报告标本（在途 / 终态各一份）。字段全部按 `ReportResponse` 的形状给，不做 `as never` 掩盖。 */
export function reportOf(state: SpecimenState): ReportResponse {
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
      // REQ-261006123819-3af3 FR-3（D-2）：归档时刻的唯一事实源（原先读无写入者的字段）
      statusHistory: [{ status: 'archived', at: T0 - 80 * M, by: { kind: 'human' } }],
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
 * 只有渲染出内容才量得到；给空态等于把探针(以及截图)的盲区当通过。
 */
export const TRUNK_SPECIMEN: TrunkResponse = {
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
      // 缺节这一支也铺出来：探针/截图要能同时看到「文档未提供该节（不编、不留白）」的渲染。
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

/* ─────────────────────────────────────────────── 另外五个面板的标本载荷（FR-5 / FR-7） */

/** 需求目录（与 `reportOf` 同一需求：两处标本要能互相对照，不能各说一个 id）。 */
const DIR = 'docs/requirements/' + REQ_ID

/**
 * 一条**超长且无空格**的 monospace 路径：FR-5 的横向溢出面。
 *
 * 为什么必须这么长、且中间一个可断词的位置都没有：真实证据目录就是这种形状
 * （时间戳 + 64 位哈希 + 后缀），而断词/溢出只有在「比容器宽」时才看得见——
 * 喂短路径，两种写错（不换行 / 硬裁）都会全绿。
 */
const LONG_DOC_PATH = DIR + '/evidence/2026-10-05T034100+0800/'
  + 'probe-1280-inflight-f9c2a7d4e18b3605f9c2a7d4e18b3605f9c2a7d4e18b3605f9c2a7d4e18b3605.txt'

/** 同一条路径的**绝对**形态（命中读根时页面显示与打开的都是它，比相对路径更长一截）。 */
const LONG_DOC_ABS = '/Users/mac/Documents/ai/dsh/dsh-pmboard/' + LONG_DOC_PATH

/** token 桶（`TokenBuckets` 四个字段全给：缺一个就归不成「有快照」的行）。 */
function tokenBuckets(
  uncachedInputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens = 0,
) {
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/**
 * 文档 / 核验 / 门禁面板载荷（`DocsResponse`）。
 *
 * 五态各至少一行（`confirmed` / `pending` / `unregistered` / `file-missing` / `unknown`）：
 * 状态格是**逐态有说辞**的一格（FR-12），只喂 `confirmed` 等于把另外四态的说辞当不存在。
 * 原型组两行（权威 + 被取代，其中一行采集到 0 条锚点）覆盖 `data-proto-role` /
 * `data-proto-anchors` 两种标。
 */
export const DOCS_SPECIMEN: DocsResponse = {
  documents: [
    {
      kind: 'requirement', path: DIR + '/requirement.md', registeredAt: T0 - 6 * H,
      state: 'confirmed', absPath: '/Users/mac/Documents/ai/dsh/dsh-pmboard/' + DIR + '/requirement.md',
    },
    { kind: 'design', path: DIR + '/design/frontend.md', registeredAt: T0 - 5 * H, state: 'confirmed' },
    { kind: 'design', path: DIR + '/design/interfaces.md', registeredAt: T0 - 5 * H, state: 'pending' },
    { kind: 'plan', path: DIR + '/decomposition.md', registeredAt: T0 - 4 * H, state: 'confirmed' },
    { kind: 'task-detail', path: DIR + '/tasks/t-5c0373.md', registeredAt: T0 - 3 * H, state: 'confirmed' },
    // 登记在案、磁盘上没有：标灰划线且不可点（FR-4 的负向分支）
    { kind: 'task-detail', path: DIR + '/tasks/t-98684c.md', registeredAt: T0 - 3 * H, state: 'file-missing' },
    // 超长无空格路径（溢出最坏情况）+ 绝对路径优先显示
    { kind: 'verification', path: LONG_DOC_PATH, registeredAt: T0 - 2 * H, state: 'confirmed', absPath: LONG_DOC_ABS },
    // 分类要求、台账没登记：**显式列出来**（「少交」要看得见）
    { kind: 'design', path: DIR + '/design/backend.md', state: 'unregistered' },
    {
      kind: 'prototype', path: DIR + '/prototypes/detail-report.html', registeredAt: T0 - 6 * H, state: 'confirmed',
      prototypeRole: 'authoritative',
      prototypeMeta: {
        anchors: [
          { fr: 'FR-5', selector: '[data-panel="docs"]' },
          { fr: 'FR-7', selector: '[data-report-tabs="1"]' },
        ],
      },
    },
    {
      kind: 'prototype', path: DIR + '/prototype/detail-report.html', registeredAt: T0 - 6 * H, state: 'confirmed',
      prototypeRole: 'superseded', supersededBy: DIR + '/prototypes/detail-report.html',
      // 采集到但**零条**锚点：这是真实的「缺锚点」，与「未采集」（无 prototypeMeta）在产物里可分辨
      prototypeMeta: { anchors: [] },
    },
    // 一个可用读根都没有：**不划线**（那不是文件缺失，是这台机器上判不了）
    { kind: 'notes', path: DIR + '/notes.md', state: 'unknown' },
  ],
  generated: [
    { label: '任务队列（DAG 派生视图）', path: DIR + '/queue.json' },
    { label: '需求追溯矩阵（rtm-implementing.yml）', path: DIR + '/rtm-implementing.yml' },
    { label: '流程状态（state/req.json）', path: DIR + '/state/req.json' },
  ],
  discovered: [
    {
      kind: 'yml', count: 84,
      samples: [DIR + '/rtm-implementing/t-5c0373.yml', DIR + '/rtm-implementing/t-98684c.yml', DIR + '/rtm-accepting.yml'],
    },
    { kind: 'png', count: 44, samples: [DIR + '/shots/1280-inflight.png', DIR + '/shots/900-terminal.png'] },
  ],
  verification: {
    version: 3,
    generatedAt: T0 - 2 * H,
    generatedBy: { kind: 'agent', sessionId: 'session-w-b262610a' },
    items: [
      {
        id: 'v3-1', source: { kind: 'requirement' },
        criterion: '六个 Tab 各渲染一次不抛错，且每个产物里都有对应的 data-panel',
        evidence: ['npx tsx scripts/req-report-probe.mts（六面板逐个渲染）→ 6/6 ok'],
        status: 'passed', result: '6 个面板全部渲染成功', resultSource: 'agent',
      },
      {
        id: 'v3-2', source: { kind: 'task', taskId: 't-98684c' },
        criterion: '五个新面板的标本载荷形状写错时是**编译错误**',
        evidence: ['npx tsc --noEmit → scripts/fixtures/req-detail-specimen.mts 0 err'],
        status: 'passed', result: '0 err（本文件）', resultSource: 'agent',
      },
      {
        id: 'v3-3', source: { kind: 'requirement' },
        criterion: '对话面板的回复框与「加载更早」都在 DOM 里',
        evidence: ['产物含 data-role="comment-input" 与 data-action="dialogue-load-earlier"'],
        status: 'pending', needsHuman: true, humanReason: '回复框的可点尺寸要人眼在真实页面上确认',
      },
    ],
  },
  gates: [
    { gate: 'requirement', verdict: 'passed', via: 'dialog', at: T0 - 6 * H, by: { kind: 'human' } },
    { gate: 'design', verdict: 'passed', via: 'board', at: T0 - 5 * H, by: { kind: 'human' } },
    { gate: 'plan', verdict: 'rejected', via: 'evidence-text', at: T0 - 4 * H, by: { kind: 'human' }, reason: '粒度太细，请按子卡链模板重拆' },
    { gate: 'implementation', verdict: 'passed', at: T0 - 3 * H, by: { kind: 'agent', sessionId: 'session-w-b262610a' } },
    { gate: 'verification', verdict: 'pending' },
    // REQ-261006123819-3af3 FR-3：归档门读数必须与 head.status 一致（已归档 → passed + 真实时刻）；
    // 原为 not-reached，与 status='archived' 自相矛盾（D-2 修的就是这类谎报）。
    { gate: 'archive', verdict: 'passed', at: T0 - 80 * M },
  ],
  archive: {
    dir: DIR,
    docs: [
      { kind: 'requirement', path: DIR + '/requirement.md' },
      { kind: 'plan', path: DIR + '/decomposition.md' },
      { kind: 'verification', path: DIR + '/verification.md' },
      { kind: 'retro', path: DIR + '/retro.md' },
    ],
    mergedInto: ['docs/architecture/project-manual.md', 'docs/knowledge/design-tokens.md'],
    indexEntry: '需求详情页重做成工作汇报：常驻头部 + 六个同级 Tab，一律铺开不做内层滚动。',
    manualUpdates: [
      { path: 'docs/architecture/project-manual.md', section: '需求详情页', summary: '六个同级 Tab 的取数纪律与懒加载口径。' },
    ],
    reconcile: {
      gate: 'enforce', at: T0 - 90 * M,
      listed: [DIR + '/requirement.md', DIR + '/decomposition.md', DIR + '/verification.md', DIR + '/retro.md'],
      exempted: [{ path: DIR + '/queue.json', rule: 'tool-rebuilt' }, { path: DIR + '/rtm-implementing.yml', rule: 'tool-rebuilt' }],
      // 未列明细逐条铺开——其中一条故意是超长无空格路径（对账块的溢出最坏情况）
      unlisted: [DIR + '/scratch.md', LONG_DOC_PATH],
      acknowledged: [{ path: DIR + '/scratch.md', reason: '临时草稿，不进清单' }],
    },
    submittedAt: T0 - 100 * M,
    submittedBy: { kind: 'agent', sessionId: 'session-w-b262610a' },
    // REQ-261006123819-3af3 FR-3（D-2）：原归档时间 / 归档人字段已删（无写入者）。
    // 该标本的归档时刻改由 statusHistory 的 archived 事件承载（见本文件 head.statusHistory）。
  },
}

/** DAG 面板载荷（`DagResponse`）：三层图 + 四种结局的执行行（含失败原文与零产出）。 */
export const DAG_SPECIMEN: DagResponse = {
  criticalPath: ['t-1f2d438d', 't-5c0373', 't-98684c'],
  tasks: [
    { id: 't-1f2d438d', title: '六个 Tab 的壳与懒加载', status: 'done', dependsOn: [], layer: 0, claimedBy: 'session-w-b262610a' },
    { id: 't-2be0cd', title: '对话面板：一条流 + 页内检索', status: 'done', dependsOn: ['t-1f2d438d'], layer: 1, stageKind: 'dev' },
    { id: 't-f62af2', title: 'Token 面板：按阶段八列', status: 'done', dependsOn: ['t-1f2d438d'], layer: 1, stageKind: 'review' },
    {
      id: 't-5c0373', title: '四组合渲染探针（本卡）', status: 'in_progress',
      dependsOn: ['t-2be0cd', 't-f62af2'], layer: 2, claimedBy: 'session-w-b262610a',
    },
    { id: 't-98684c', title: '渲染探针：最小可点尺寸 / 字阶 / 图标', status: 'todo', dependsOn: ['t-5c0373'], layer: 3 },
    // 存量卡：子卡链没生成（与「手动建卡」在产物里可分辨）
    { id: 't-9a1e04', title: '存量卡：子卡链未生成', status: 'todo', dependsOn: [], layer: 0, chainMissing: true },
  ],
  steps: [
    {
      taskId: 't-2be0cd', stage: 'implement', sessionId: 'session-w-b262610a', trigger: 'auto',
      startedAt: T0 - 200 * M, endedAt: T0 - 170 * M, outcome: 'succeeded', evidence: ['npx tsx scripts/req-report-probe.mts → 4/4 组合通过'],
      attempt: 1, outputCount: 3,
      report: {
        summary: '对话面板：一条流 + 页内检索 + 回复框',
        completed: ['三类消息同容器按时间排', '页内检索只过滤已加载条目', '回复走既有评论通道'],
        filesChanged: ['src/client/views/panels/dialogue.ts', 'tests/dialogue-panel.test.ts'],
        nextStep: '等 Token 面板落地后一起上探针',
      },
    },
    {
      taskId: 't-f62af2', stage: 'implement', sessionId: 'session-w-b262610a', trigger: 'auto',
      startedAt: T0 - 160 * M, endedAt: T0 - 130 * M, outcome: 'failed',
      error: '按阶段表缺 perCallTokens 列：扩展段未并进基础行（服务端 mergeTokenExtension 未接线）',
      evidence: ['pnpm vitest run tests/token-panel.test.ts → 1 failed'], attempt: 2, outputCount: 2,
    },
    {
      taskId: 't-5c0373', stage: 'implement', sessionId: 'session-w-b262610a', trigger: 'manual',
      startedAt: T0 - 25 * M, outcome: 'running', evidence: [], attempt: 1,
    },
    {
      taskId: 't-9a1e04', stage: 'review', sessionId: 'session-w-9f0c1d77', trigger: 'auto',
      startedAt: T0 - 120 * M, endedAt: T0 - 118 * M, outcome: 'cancelled', evidence: [], attempt: 1, outputCount: 0,
    },
  ],
}

/**
 * 对话面板载荷（`DialogueResponse`）：人 / agent / 系统三类消息混排在同一条时间线上。
 *
 * 为什么要**同时**给人与 agent：两种气泡是两套视觉（左右 / 头像位 / 宽度），只给一种，
 * 另一种的换行与最小可点尺寸就量不到；再加一条 `inferred` 系统消息覆盖「回填」标。
 */
export const DIALOGUE_SPECIMEN: DialogueResponse = {
  items: [
    { kind: 'human', at: T0 - 52 * M, text: '这版要把六个 Tab 都渲染出来再量：最小可点尺寸、字阶、结构图标，三样都要机械证据。' },
    {
      kind: 'agent', at: T0 - 48 * M, windowKey: 'session-w-b262610a',
      text: '收到。先补五个面板的标本载荷，再让探针逐个渲染并读 `#diag`——**不靠肉眼**。',
    },
    { kind: 'system', at: T0 - 44 * M, evt: 'stage-advance', text: '阶段推进：design → decomposing（人工在板上一键确认）' },
    { kind: 'human', at: T0 - 30 * M, text: '注意 monospace 长路径：那是唯一一类会把容器撑破的内容，标本里必须有。' },
    { kind: 'agent', at: T0 - 26 * M, windowKey: 'session-w-b262610a', text: '已按 64 位哈希 + 时间戳造了一条无空格长路径。' },
    {
      kind: 'system', at: T0 - 20 * M, evt: 'handoff', inferred: true,
      text: '交接：session-00af6c69 → session-w-b262610a（由台账时间与评论反推，非实时发生）',
    },
    { kind: 'system', at: T0 - 8 * M, evt: 'confirm-pending', text: '弹框确认挂起中：验收单 v3 第 3 项等人裁决' },
  ],
  page: { before: T0 - 52 * M, hasMore: true, total: 42 },
}

/**
 * Token 面板载荷（服务端在同一响应里并进扩展段，逐行**就地加列**）。
 *
 * `byStage` 的一行 = 老列（快照桶 / 执行下钻）+ 新列（平铺八列）——新列**可缺**：
 * `mergeTokenExtension` 对没有扩展行的阶段原样保留基础行（无快照 ≠ 花了 0），
 * 故标本里必须留一行只有基础段（`archived`），否则「不可得」那一支永远量不到。
 */
type TokenSpecimenRow = RequirementTokenStageRow & Partial<TokenStageRow>

/**
 * 上卷四列（墙钟 / 窗口数 / 轮次 / 零产出执行）：面板**读**它们
 * （`token-info.ts` 的 `renderTokenPanel` 逐字段判型，读不到就整格不渲染），
 * 但取数契约 `TokenPanelPayload` 没声明这四列——这是**契约缺口**，不是标本编的字段。
 *
 * 为什么仍要放进标本：不给它们，这一段（FR-10 的「再往上汇总」）就永远没有标本覆盖，
 * 探针与截图会把「这一块没人验过」当成通过。缺口登记在需求侧，api.ts 补上声明后
 * 删掉本地这四列即可（超集赋值不受影响）。
 */
type TokenRollupSpecimen = {
  wallClockMs?: number
  windowCount?: number
  turns?: number
  zeroOutputRuns?: number
}

/** 面板可接受的整体载荷：基础段逐字保留，`byStage` 换成「基础段 + 可缺扩展列」。 */
type TokenSpecimen = Omit<TokenPanelPayload, 'byStage'> & TokenRollupSpecimen & { byStage: TokenSpecimenRow[] }

export const TOKEN_SPECIMEN: TokenSpecimen = {
  requirementId: REQ_ID,
  totals: tokenBuckets(1_320_000, 160_000, 2_420_000),
  costEstimateCny: 18.42,
  degraded: false,
  availability: 'full',
  byStage: [
    {
      stage: 'brainstorming', executions: [],
      calls: 6, inputTokens: 200_000, outputTokens: 20_000, cacheReadTokens: 620_000,
      totalTokens: 120_000, sharePct: 8, perCallTokens: 20_000, cacheHitPct: 77,
      buckets: tokenBuckets(200_000, 20_000, 620_000),
    },
    {
      stage: 'design', executions: [],
      calls: 9, inputTokens: 240_000, outputTokens: 28_000, cacheReadTokens: 480_000,
      totalTokens: 190_000, sharePct: 19, perCallTokens: 21_111, cacheHitPct: 68,
      buckets: tokenBuckets(240_000, 28_000, 480_000),
    },
    {
      stage: 'implementing',
      calls: 14, inputTokens: 700_000, outputTokens: 90_000, cacheReadTokens: 900_000,
      totalTokens: 540_000, sharePct: 58, perCallTokens: 38_571, cacheHitPct: 59,
      buckets: tokenBuckets(700_000, 90_000, 900_000),
      // 执行下钻：一条有差值（算得出本次消耗）、一条两端快照不可得（**不补 0**）
      executions: [
        {
          taskId: 't-5c0373', title: '四组合渲染探针', status: 'in_progress',
          delta: tokenBuckets(30_000, 5_000, 40_000),
          start: { at: T0 - 25 * M, totals: tokenBuckets(0, 0, 0), source: 'projection' },
          end: { at: T0 - 2 * M, totals: tokenBuckets(30_000, 5_000, 40_000), source: 'projection' },
        },
        { taskId: 't-2be0cd', title: '对话面板', status: 'done' },
      ],
    },
    {
      stage: 'accepting', executions: [],
      calls: 5, inputTokens: 180_000, outputTokens: 22_000, cacheReadTokens: 420_000,
      totalTokens: 150_000, sharePct: 15, perCallTokens: 30_000, cacheHitPct: 70,
      buckets: tokenBuckets(180_000, 22_000, 420_000),
    },
    // 无任何 token 记录（**不等于花了 0**）：扩展段没这一行，基础行原样保留
    { stage: 'archived', executions: [] },
  ],
  // 优化点**每条都带依据数字**（不做无凭据的建议）
  optimizations: [
    {
      title: '实施阶段占比最高',
      basis: 'implementing 占 58%（540000 tokens ÷ 14 次调用，每次 38571）',
      suggestion: '对该阶段做节点隔离 + 输入包裁剪：它单独吃掉一半以上消耗。',
    },
    {
      title: '缓存命中偏低',
      basis: 'implementing 缓存命中 59%（缓存读 900000 / 未缓存输入 700000）',
      suggestion: '把稳定前缀固定成同一段输入包，避免每轮重读。',
    },
    {
      title: '一次零产出执行',
      basis: '零产出执行 1 次（上卷计数由编排器按卡统计，得不出消耗的阶段不在此表）',
      suggestion: '给该段加「无产出即停」的判据。',
    },
  ],
  wallClockMs: 26 * H,
  windowCount: 7,
  turns: 214,
  zeroOutputRuns: 1,
}

/**
 * 提示词面板载荷（`PromptsResponse`）：A 段装配清单 + B 段注入留痕 + C 段上下文。
 *
 * 三种 `delivered` 都给一条（true / false / null）：`null` = 旧条目不可知，
 * 页面**必须**说「投递不可知」而不是「已投递」——这是 FR-9 的反例面。
 */
export const PROMPTS_SPECIMEN: PromptsResponse = {
  system: {
    routeKey: 'implementing/expert/v3',
    hitLevel: 'exact',
    perTurnChars: 6240,
    perTurnEstTokens: 1560,
    sections: [
      { id: 'implementing/light', kind: 'file', chars: 2180, text: '## 实施阶段纪律\n- 照卡开工：先 reqboard_task_move(to=in_progress)\n- 完工必汇报：改了哪些文件、下一步是什么' },
      { id: 'common/iron-rules', kind: 'file', chars: 1460, text: '## 本仓铁律\n- 批准闸门永不伸缩\n- 不改别人正在改的文件：先看 git status' },
      { id: 'capture-section', kind: 'shell', chars: 2080, text: '## 本条需求\n标题：需求详情页重做成工作汇报\n当前阶段：implementing（第 17 张卡）' },
    ],
    trimmed: [
      { id: 'common/glossary', chars: 1200, text: '## 术语表（本次未注入）\n- 父卡 / 子卡：dev → review → test\n- 闸门：人工确认点，agent 不可越过' },
    ],
  },
  injections: [
    {
      at: T0 - 48 * M, windowKey: 'session-w-b262610a', origin: 'gate-h3', delivered: true,
      routeKey: 'implementing/expert/v3', fragmentIds: ['implementing/light', 'common/iron-rules'],
      charCount: 3640, trimmed: ['common/glossary'], text: '照卡开工 · 完工汇报（本轮投递的两片）', truncated: false,
    },
    {
      at: T0 - 30 * M, windowKey: 'session-w-b262610a', origin: 'dive-node', delivered: false,
      fragmentIds: ['capture-section'], charCount: 2080, trimmed: [], text: '节点输入包（只留痕，未投递）', truncated: false,
    },
    {
      // 旧条目：`delivered` 为 null（页面须说「投递不可知」）+ 正文被截断
      at: T0 - 18 * M, windowKey: 'session-00af6c69-e55e-4878-8d4e-74056a439b01', origin: 'unknown', delivered: null,
      fragmentIds: [], trimmed: ['common/glossary'], text: '旧条目没有 delivered 字段：不得当作投递成功', truncated: true,
    },
  ],
  context: {
    medianUsagePct: 62,
    compressions: 3,
    policy: ['replaced', 'skipped'],
    isolations: [
      { at: T0 - 40 * M, stage: 'implementing', status: 'replaced', packageChars: 4200, reason: '上一节点上下文整段替换为输入包' },
      { at: T0 - 22 * M, stage: 'implementing', status: 'skipped', packageChars: 1800, reason: '上下文很短，无需隔离' },
      { at: T0 - 6 * M, stage: 'accepting', status: 'fallback', packageChars: 2600, reason: '输入包超预算，回退到摘要版' },
    ],
    available: true,
  },
}

/** 除 trunk 外的五个面板键（与 `INACTIVE_PANEL_KEYS` 同集；trunk 走 `specimenShell`）。 */
export type PanelSpecimenKey = Exclude<ReportTabKey, 'trunk'>

/**
 * 宽形状透传：壳的入参类型是 `PanelResult<unknown>`，其正常支是 `{ available?: true }`——
 * 一个**全属性可选**的弱类型，具体形状（`TrunkResponse`）与它没有公共属性，会被 TS 的弱类型检查拦下。
 * 故只在**这一处**放宽（与 `tests/report-degrade.test.ts` 的 `rawPayload` 同款处理）：
 * 标本常量本身仍受 `TrunkResponse` 约束，形状写错照样报错。
 */
export function asPanelPayload(v: object): PanelResult<unknown> {
  return v as PanelResult<unknown>
}

/**
 * 五个面板的标本载荷（键 = 面板键，值 = 喂给壳的 `PanelResult<unknown>`）。
 *
 * 为什么在这里放宽：五个常量各自受**具体响应类型**约束（`DocsResponse` / `DagResponse` /
 * `DialogueResponse` / token 面板载荷 / `PromptsResponse`），而壳的正常支是全属性可选的
 * `{ available?: true }`——放宽只发生在这一处交接点上，常量本身写错字段仍是编译错误
 * （与 `TRUNK_SPECIMEN` 同款，FR-1 的静态面）。
 */
export const PANEL_SPECIMENS: Record<PanelSpecimenKey, PanelResult<unknown>> = {
  docs: asPanelPayload(DOCS_SPECIMEN),
  dag: asPanelPayload(DAG_SPECIMEN),
  dialogue: asPanelPayload(DIALOGUE_SPECIMEN),
  token: asPanelPayload(TOKEN_SPECIMEN),
  prompts: asPanelPayload(PROMPTS_SPECIMEN),
}

/** 标本壳的 revision（在途/终态各一个固定值，只为让两态的页面不完全同形）。 */
export function revisionOf(state: SpecimenState): number {
  return state === 'inflight' ? 453 : 512
}

/**
 * 标本页骨架（`<style>` + 真实宿主类 + 页内脚本）：两个入口共用这一份。
 *
 * 为什么抽出来而不是复制第二份：`specimenShell` 的产物被截图脚本与探针逐字依赖，
 * 骨架（doctype / 字符集 / 全量 CSS 的顺序 / `.dsh-pm-view` 外层）复制一份就必然漂移——
 * 五个新面板量到的就不是「真实页面吃什么」，而是另一个人写的另一页。
 * **抽取前后 `specimenShell(...)` 的输出必须逐字节相同**（本模块的硬约束，FR-5 的基线）。
 */
function specimenPage(shell: string, pageTitle: string, bodyScript: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${pageTitle}</title>
<style>
${SPECIMEN_CSS}
html, body { margin: 0; height: 100%; background: var(--dsw-bg-primary, #fff); }
body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #111827; }
</style></head>
<body><div class="dsh-pm-view" data-dsh-pm-view="1">${shell}</div>
${bodyScript}</body></html>`
}

/**
 * 标本页标题里的页面名。
 *
 * trunk 是**唯一例外**：注册表标签是「汇报」，而既有标题写的是「工作汇报」——
 * 探针与截图脚本按整串标题找产物/看图，改一个字就是改断言语义（本模块的硬约束是
 * `specimenShell(...)` 输出逐字节不变）。其余五个面板直接用注册表标签，
 * 不另写一张标签表：那是第二份真相，面板改名后标题会停在旧名上。
 */
function pageLabelOf(panelKey: ReportTabKey): string {
  if (panelKey === 'trunk') return '工作汇报'
  return REPORT_TABS.find(d => d.key === panelKey)?.label ?? panelKey
}

/**
 * 标本页标题（探针日志与截图共用一份措辞）。
 */
function specimenTitle(width: number, state: SpecimenState, panelKey: ReportTabKey): string {
  const label = STATES.find(s => s.key === state)?.label ?? state
  return `pmboard 需求详情页「${pageLabelOf(panelKey)}」渲染探针标本 · ${String(width)} · ${label}`
}

/**
 * 一件标本页：真实壳 HTML + 真实 CSS + 调用方给的页内脚本（写法照 `list-responsive-probe.mts`）。
 *
 * 外层用真实宿主类 `.dsh-pm-view`（`page/host.ts` 挂在页面上的就是它：flex column /
 * height:100% / overflow:hidden）——只有放进这层真实框架，`.dsh-pm-detail` 的
 * 「页面级滚动容器」身份才是真的（不然量出来的滚动行为是另一回事）。
 *
 * `bodyScript` 原样插在壳之后（探针在这里插断言脚本；出图脚本插空串）。
 * `title` 不给时用探针口径的标题，保证既有调用方的 HTML 一字不变。
 */
export function specimenShell(
  width: number,
  state: SpecimenState,
  bodyScript: string,
  title?: string,
): string {
  const shell = buildReportShell(reportOf(state), 'trunk', {
    data: asPanelPayload(TRUNK_SPECIMEN),
    revision: revisionOf(state),
  })
  return specimenPage(shell, title ?? specimenTitle(width, state, 'trunk'), bodyScript)
}

/**
 * 同上一件标本页，但渲染**五个非 trunk 面板之一**（REQ-261005155003-f32f FR-5 / FR-7）。
 *
 * 为什么需要它：原型只画了 trunk，出图与探针也只渲染过 trunk——另外五个 Tab 的
 * 「最小可点尺寸 / 字阶 / 结构图标」从未被渲染过（未验 ≠ 通过）。这里**调真壳**
 * （`buildReportShell` + `PANEL_SPECIMENS` 的载荷），所以量到的就是真实页面那一块，
 * 而不是另写一份「像面板」的 HTML。
 */
export function specimenShellForPanel(
  width: number,
  state: SpecimenState,
  panelKey: PanelSpecimenKey,
  bodyScript: string,
  title?: string,
): string {
  const shell = buildReportShell(reportOf(state), panelKey, {
    data: PANEL_SPECIMENS[panelKey],
    revision: revisionOf(state),
  })
  return specimenPage(shell, title ?? specimenTitle(width, state, panelKey), bodyScript)
}

/** 浏览器落点：CHROME_BIN 优先，其次 macOS / Linux 常见路径（与既有探针同口径）。 */
export function findChrome(): string | undefined {
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
