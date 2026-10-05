/**
 * 首屏三处数据缺口（REQ-261004222448-292a 补项：t-ab048e 报回的三处「机制就绪、数据没来」）
 *
 * 三件事，逐条钉在用例名里：
 *   ① Tab 角标关键数字（FR-11 #4）：`tabCounts` 有值才渲染角标；缺值**不渲染**（也不写 0）；
 *   ② 评论列表（能力回退）：旧详情页能看到评论，新页只有输入框 → 列表必须回来；
 *      行数/内容/作者可分辨；`[]` 给解释性空态；`undefined`（未采集）整块不渲染；
 *   ③ 结果与成效（FR-5）：验收单逐项计数 + 结论 + 遗留；**没有验收单就不给 outcome**
 *      （页面走既有解释性空态），"没有验收单"与"验收单里 0 项通过"必须是两句不同的话。
 *
 * 环境：vitest 默认 node（本包**不含 jsdom**）——client 是 `buildXxx(data) => string` 的
 * 纯函数，断言一律对**字符串**做；服务端侧走 `makeHarness`（内存台账 + 真 QueueTaskStore）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, type Harness } from './application/harness.js'
import {
  emptyBuckets,
  isDegrade,
  type ActorRef,
  type PanelResult,
  type ReportResponse,
  type RequirementRecord,
  type StatusEvent,
  type TaskRecord,
  type VerificationItem,
  type VerificationSheet,
} from '../src/shared/protocol.js'
import { REPORT_COMMENT_HEAD_LIMIT, queryReport, type ReportQueryDeps } from '../src/application/query/QueryReport.js'
import {
  COMMENT_BODY_MAX, COMMENT_LONG_HEAD_MAX, COMMENT_RENDER_LIMIT, CONSEQUENCE_HINT_MAX,
  buildCommentList, buildReportHead, commentRenderPlan, shortConsequence,
} from '../src/client/views/report-head.ts'
import { SHORT_MAX, buildGapsCell, buildOutcomeCell, buildReportBand, oneLineLabel } from '../src/client/views/report-band.ts'
import { REPORT_TABS, buildTabBar } from '../src/client/views/report-tabs.ts'
import { fmtTime } from '../src/client/render/dom-utils.ts'

const REQ_ID = 'REQ-gap001'
const WINDOW = 'session-w-gap'
const NOW = 5_000_000
const HUMAN: ActorRef = { kind: 'human' }
const AGENT: ActorRef = { kind: 'agent', sessionId: 'session-agent-abc' }
const SYSTEM: ActorRef = { kind: 'system' }

/** 出现次数（断言"恰好一条"比 `toContain` 更能抓到重复渲染）。 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/* --------------------------------------------------------------- 服务端标本 */

function event(status: RequirementRecord['status'], at: number): StatusEvent {
  return { status, at, by: HUMAN }
}

/** 最小需求（默认 implementing；`artifacts` 有值 = 台账确实登记过产物）。 */
function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ_ID,
    title: '首屏三处数据缺口',
    description: 'd',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    sourceSessionId: WINDOW,
    comments: [],
    version: 1,
    createdAt: 1_000,
    updatedAt: 4_500_000,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [event('draft', 1_000), event('implementing', 4_000_000)],
    artifacts: [
      { stage: 'implementing', kind: 'task_detail', path: 'docs/requirements/' + REQ_ID + '/tasks/t-1.md', registeredAt: 4_100_000, registeredBy: HUMAN },
      { stage: 'implementing', kind: 'notes', path: 'docs/requirements/' + REQ_ID + '/notes/n.md', registeredAt: 4_100_001, registeredBy: HUMAN },
      { stage: 'implementing', kind: 'verification', path: 'docs/requirements/' + REQ_ID + '/verification.md', registeredAt: 4_100_002, registeredBy: HUMAN },
    ],
    ...over,
  }
}

/** 最小任务卡。 */
function makeTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-gap001',
    requirementId: REQ_ID,
    title: '任务一',
    description: 'd',
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: '跑测试看到绿',
    context: '',
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    ...over,
  }
}

/** 验收单项（只填本卡读的字段：status / criterion / opinion）。 */
function item(id: string, status: VerificationItem['status'], criterion: string, opinion?: string): VerificationItem {
  return {
    id,
    source: { kind: 'requirement' },
    criterion,
    evidence: [],
    status,
    ...(opinion === undefined ? {} : { opinion }),
  }
}

/** 验收单（版本化载体）。 */
function sheet(items: VerificationItem[], over: Partial<VerificationSheet> = {}): VerificationSheet {
  return { version: 1, items, generatedAt: 4_200_000, generatedBy: AGENT, ...over }
}

function makeDeps(h: Harness): ReportQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs: h.docs,
    now: () => NOW,
  }
}

function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason)
  return value
}

async function reportOf(req: Partial<RequirementRecord>, tasks: readonly TaskRecord[] = [makeTask()]): Promise<ReportResponse> {
  const h = makeHarness({ requirements: [makeReq(req)], tasks: [...tasks] })
  return ok(await queryReport(makeDeps(h), { requirementId: REQ_ID }))
}

/* --------------------------------------------------------------- ① 角标 */

describe('① Tab 角标关键数字（FR-11 #4）', () => {
  it('服务端给 docs/dag/token 三个短字符串；需要额外读的口（trunk/dialogue/prompts）留空', async () => {
    const report = await reportOf({
      // 1_200_000 + 640_000 = 1.84M → 仓内唯一格式化口径 fmtTokens → '1.8M'（K/M 一位小数）
      tokenUsage: {
        byStage: {},
        totals: { ...emptyBuckets(), uncachedInputTokens: 1_200_000, outputTokens: 640_000 },
        updatedAt: 4_000_000,
      },
    }, [makeTask(), makeTask({ id: 't-gap002' }), makeTask({ id: 't-gap003' })])

    // 角标 = **确定文档**（人写的交付物，`isDeliverableDocPath`）数，与「文档」Tab 那张表同源。
    // 夹具三条产物里 `tasks/t-1.md` 与 `verification.md` 是交付物，`notes/n.md` 不在白名单
    // （归「其它发现」）→ 2。修前按台账产物总数算是 3，线上实测就是「角标 317 / 列表 97」
    // 这种同一个东西两个数字（FR-11 #2 禁止）。
    expect(report.tabCounts?.docs).toBe('2')
    expect(report.tabCounts?.dag).toBe('3') // 任务卡 3 张
    expect(report.tabCounts?.token).toBe('1.8M') // 合计 1_840_000，按 K/M 格式化
    // 首屏不加读：需要会话事件 / 注入留痕 / 主干装配的口一律**不填**（页面就不显示那个角标）
    expect(report.tabCounts?.dialogue).toBeUndefined()
    expect(report.tabCounts?.prompts).toBeUndefined()
    expect(report.tabCounts?.trunk).toBeUndefined()
  })

  it('台账没有 tokenUsage → 不给 token 角标（「0」会被读成"没花过"，而实际是"没有快照"）', async () => {
    const report = await reportOf({})
    expect(report.tabCounts?.token).toBeUndefined()
    expect('token' in (report.tabCounts ?? {})).toBe(false)
    // 队列已读到：0 张卡是**真实计数**（"还没拆分落卡"是可执行信息），可以给
    const noTasks = await reportOf({}, [])
    expect(noTasks.tabCounts?.dag).toBe('0')
  })

  it('存量台账（没有 artifacts 字段）→ 不给 docs 角标；空数组才是"一条都没登记"= 0', async () => {
    const legacy = await reportOf({ artifacts: undefined })
    expect(legacy.tabCounts?.docs).toBeUndefined()
    const empty = await reportOf({ artifacts: [] })
    expect(empty.tabCounts?.docs).toBe('0')
  })

  it('角标渲染：有值才出 data-badge；缺值连位都不占（不写 0）', async () => {
    const report = await reportOf({
      tokenUsage: {
        byStage: {},
        totals: { ...emptyBuckets(), uncachedInputTokens: 1_200_000, outputTokens: 640_000 },
        updatedAt: 4_000_000,
      },
    })
    // `panels/token.ts` 的 badge 一行归主窗口（本卡不动那个文件）。那一行现在已经接上；
    // 这里仍显式接同一行，是为了让本用例**不依赖另一张卡的落地时序**（先合并哪一边都能过）。
    const tokenDef = REPORT_TABS.find(d => d.key === 'token')
    expect(tokenDef).toBeDefined()
    const before = tokenDef!.badge
    try {
      tokenDef!.badge = r => r?.tabCounts?.token
      const html = buildTabBar(report, 'trunk')
      expect(html).toContain('data-badge="docs">2<')
      expect(html).toContain('data-badge="dag">1<')
      expect(html).toContain('data-badge="token">1.8M<')
      expect(countOf(html, 'data-badge=')).toBe(3)
    } finally {
      tokenDef!.badge = before
    }
    const html = buildTabBar(report, 'trunk')
    // 留空的三个 Tab：一个角标位都不渲染（token 那一行由主窗口接，这里不断它的数）
    for (const key of ['trunk', 'dialogue', 'prompts'] as const) {
      expect(html, key).not.toContain('data-badge="' + key + '"')
    }
    expect(html).toContain('data-badge="docs"')
    expect(html).toContain('data-badge="dag"')

    // 缺值（整字段没有）→ 六个角标全不渲染，且页面不出现 "0" 角标
    const bare = buildTabBar({ ...report, tabCounts: undefined }, 'trunk')
    expect(bare).not.toContain('data-badge=')
  })

  it('四个面板的 badge 只读服务端计数：取不到就 undefined（不前端遍历推算）', () => {
    const badges = Object.fromEntries(REPORT_TABS.map(d => [d.key, d.badge]))
    expect(badges['docs']?.({ tabCounts: { docs: '7' } } as ReportResponse)).toBe('7')
    expect(badges['dag']?.({ tabCounts: { dag: '42' } } as ReportResponse)).toBe('42')
    expect(badges['trunk']?.({ tabCounts: {} } as ReportResponse)).toBeUndefined()
    expect(badges['dialogue']?.({ tabCounts: {} } as ReportResponse)).toBeUndefined()
    // 报告还没到 / 字段缺省都要安全返回 undefined（渲染路径不许抛）
    for (const def of REPORT_TABS) {
      expect(def.badge(undefined), def.key).toBeUndefined()
      expect(def.badge({} as ReportResponse), def.key).toBeUndefined()
    }
  })
})

/* --------------------------------------------------------------- ② 评论列表 */

describe('② 评论列表（能力回退：旧页能看评论，新页只剩输入框）', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: 'c-' + String(i),
    body: '第 ' + String(i + 1) + ' 条评论',
    createdAt: 1_000 + i,
    createdBy: i % 3 === 0 ? HUMAN : i % 3 === 1 ? AGENT : SYSTEM,
  }))

  it('只给最近 N 条（默认 3）、新的在后，且**如实给出总条数**（省略 ≠ 不存在）', async () => {
    const report = await reportOf({ comments: many })
    const comments = report.head.comments ?? []
    expect(comments).toHaveLength(REPORT_COMMENT_HEAD_LIMIT)
    expect(REPORT_COMMENT_HEAD_LIMIT).toBe(3) // 缺陷修复：原 10 条（13,317 字把 Tab 栏顶出首屏）
    // 尾部 N 条：第 12~14 条；顺序原样（新的在后）
    expect(comments.map(c => c.body)).toEqual(many.slice(-REPORT_COMMENT_HEAD_LIMIT).map(c => c.body))
    expect(comments[comments.length - 1]?.body).toBe('第 14 条评论')
    // ActorRef 原样带出（渲染侧据此区分人 / agent / 系统）
    expect(comments.map(c => c.by)).toEqual(many.slice(-REPORT_COMMENT_HEAD_LIMIT).map(c => c.createdBy))
    // 总数必须一起给：列表限到 3 条时，「最近 3 条」会被读成"只有 3 条"
    expect(report.head.commentsTotal).toBe(many.length)
  })

  it('正文截断与长日志收纳（渲染层三档口径，不新造展开交互）', () => {
    const long = 'x'.repeat(5_000)
    const plan = (body: string) => commentRenderPlan(body)
    // ≤200 字：原样
    expect(plan('短评').text).toBe('短评')
    expect(plan('短评').long).toBe(false)
    // 200~1000 字：截 200 + 省略号；全文进 title（读者悬停仍读得到）
    const mid = plan('y'.repeat(300))
    expect(mid.text).toBe('y'.repeat(COMMENT_BODY_MAX) + '…')
    expect(mid.long).toBe(false)
    expect(mid.full).toHaveLength(300)
    // >1000 字（机器转储）：只给首行前 120 字 + 「共 N 字」，并打 long 标
    const big = plan(long)
    expect(big.long).toBe(true)
    expect(big.text).toContain('x'.repeat(COMMENT_LONG_HEAD_MAX))
    expect(big.text).toContain('共 5000 字')
    expect(big.text.length).toBeLessThan(COMMENT_LONG_HEAD_MAX + 40)

    const html = buildCommentList([
      { at: 1_700_000_000_000, body: '正常短评', by: HUMAN },
      { at: 1_700_000_000_001, body: 'z'.repeat(300), by: HUMAN },
      // 长日志的标本用 agent（2026-10-05 起 system 评论不进头部，见下一条用例）：
      // 机器转储会以 agent 身份落台账，这一支的收纳逻辑因此仍必须被钉住
      { at: 1_700_000_000_002, body: long, by: AGENT },
    ])
    expect(countOf(html, 'data-comment-row="1"')).toBe(3)
    expect(countOf(html, 'data-comment-long="1"')).toBe(1)
    expect(html).toContain('长日志（已收纳）')
    // 全文在 title 里（截断只发生在可见正文上；不可信输入照样转义）
    expect(html).toContain('title="' + 'z'.repeat(300) + '"')
    // 渲染层兜底：即使服务端给了 10 条（旧服务端/缓存快照），也只渲染最近 3 条
    const ten = Array.from({ length: 10 }, (_, i) => ({
      at: 1_700_000_000_000 + i, body: '第 ' + String(i + 1) + ' 条', by: HUMAN,
    }))
    const capped = buildCommentList(ten, 10)
    expect(countOf(capped, 'data-comment-row="1"')).toBe(COMMENT_RENDER_LIMIT)
    expect(capped).toContain('第 10 条')
    expect(capped).toContain('共 10 条，更早的 7 条见台账')
  })

  it('渲染：每行一条 data-comment-row，带时间与作者（人 / 窗口码可分辨；机器事件不进头部）', () => {
    const html = buildCommentList([
      { at: 1_700_000_000_000, body: '人写的评论', by: HUMAN },
      { at: 1_700_000_060_000, body: 'agent 写的评论', by: AGENT },
      { at: 1_700_000_120_000, body: '系统事件评论', by: SYSTEM },
    ])
    // 2026-10-05 人类验收：头部只列人 / agent 写的评论。
    // 线上头部最近 3 条被 `[Dive] 已暂停自动续跑…` / `[断点] aborted:user…` 占满——
    // 那是机器事件，读者在头部看到的是噪音而不是"谁说了什么"（它们的落点在『对话』Tab）。
    expect(countOf(html, 'data-comment-row="1"')).toBe(2)
    expect(html).toContain('人写的评论')
    expect(html).toContain('agent 写的评论')
    expect(html).not.toContain('系统事件评论')
    // 作者口径复用 commentActorLabel（人 / 窗口 w-xxxx），data-actor 供样式与断言选择
    expect(html).toContain('data-actor="human"')
    expect(html).toContain('data-actor="agent"')
    expect(html).not.toContain('data-actor="system"')
    expect(html).toContain('>人<')
    expect(html).toContain('窗口 ')
    // 没列出来的机器事件必须**说出去哪看**（省略 ≠ 不存在）
    expect(html).toContain('1 条机器事件未列')
    expect(html).toContain('对话')
    expect(html).toContain('data-comment-hidden="1"')
    // 时间戳与正文都渲染；正文转义（内容不可信）
    expect(html).toContain(fmtTime(1_700_000_000_000)) // 与既有详情页同一份时间口径
    expect(countOf(html, 'dsh-pm-comment-body')).toBe(2)
    // 评论正文是不可信输入：必须转义（原样塞进去就是一条注入通道）
    const injected = buildCommentList([{ at: 1_700_000_000_000, body: '<img src=x onerror="boom()">', by: HUMAN }])
    expect(injected).not.toContain('<img')
    expect(injected).toContain('&lt;img')
    // 不做内层滚动（FR-11 #7）：长了靠页面滚
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
  })

  it('空评论 → 一句解释性空态（不是留白，也不是"0 条"）', () => {
    const html = buildCommentList([])
    expect(html).toContain('data-comment-list="empty"')
    expect(html).toContain('暂无评论')
    expect(html).not.toContain('data-comment-row=')
  })

  it('全是机器事件（system）→ 过滤后 0 条：整块不渲染（不留空壳、不写"暂无评论"）', () => {
    const onlySystem = [
      { at: 1_700_000_000_000, body: '[Dive] 已暂停自动续跑（运行时原因：aborted:user）', by: SYSTEM },
      { at: 1_700_000_060_000, body: '[断点] aborted:user（阶段 accepting）', by: SYSTEM },
    ]
    // 台账里**有**评论（只是机器写的）→ 说"暂无评论"是假话，所以整块不渲染
    expect(buildCommentList(onlySystem)).toBe('')
    // 头部同样不留空壳（`data-comment-list=` 一个都不出现）
    const report = makeReportResponse()
    const head = buildReportHead({ ...report, head: { ...report.head, comments: onlySystem } })
    expect(head).not.toContain('data-comment-list=')
    expect(head).not.toContain('暂无评论')
    // 过滤只发生在渲染层：服务端载荷（台账投影）里的机器事件原样保留，人写的一条照常渲染
    const mixed = buildCommentList([...onlySystem, { at: 1_700_000_120_000, body: '人写的', by: HUMAN }])
    expect(countOf(mixed, 'data-comment-row="1"')).toBe(1)
    expect(mixed).toContain('人写的')
  })

  it('未采集（服务端没下发）→ 整块不渲染，也不写"暂无评论"冒充"没有"', () => {
    expect(buildCommentList(undefined)).toBe('')
    const report = makeReportResponse()
    const head = buildReportHead({ ...report, head: { ...report.head, comments: undefined } })
    expect(head).not.toContain('data-comment-list=')
    // 同一份标本，评论为空数组时**必须**有说辞（两态分开）
    expect(buildReportHead({ ...report, head: { ...report.head, comments: [] } })).toContain('暂无评论')
  })

  it('列表在评论框附近、随头部一起渲染（终态只读也看得见评论）', () => {
    const report = makeReportResponse()
    const inflight = buildReportHead(report)
    expect(inflight).toContain('data-comment-row="1"')
    expect(inflight).toContain('data-action="add-comment"')
    // 列表在输入框之前（列表在上、输入框在下，与"新的在下"同向）
    expect(inflight.indexOf('data-comment-row="1"')).toBeLessThan(inflight.indexOf('data-action="add-comment"'))
    // 终态：没有假出口，但已记下的评论仍读得到
    const terminal = buildReportHead({ ...report, head: { ...report.head, status: 'archived' } })
    expect(terminal).toContain('data-comment-row="1"')
    expect(terminal).not.toContain('data-action="add-comment"')
  })
})

/* --------------------------------------------------- ②b 操作条版式（2026-10-05 验收） */

/**
 * 人类验收原话一：「操作条排版散架」——`← 看板 ｜ 本阶段操作 ｜ 验收通过并归档 [需人操作] 后果：…`
 * 挤第一行，`退回返工` 单独第二行、`取消需求` 第三行。
 * 人类验收原话二（同日更正）：「按通行设计原则改，别再加局部补丁」——按钮只写动作，
 * 说明按需披露（title → 确认框），动作分级（1 primary / 其余 secondary / 危险 danger 排最后），
 * 同类信息同一套截断口径。
 *
 * 这里钉住结构不变量；像素判据在 `scripts/req-report-probe.mts` A6
 * （1280 档整条 ≤ 72px、动作按钮同一行）。
 */
describe('②b 操作条版式（一行按钮 / 说明不挨着按钮 / 分级与确认）', () => {
  const ACTIONS: ReportResponse['actions'] = [
    { key: 'verify-pass', to: 'archived', label: '验收通过并归档', consequence: '通过即归档：需求进入终态、不再接受修改；验收单结论一并落章', humanOnly: true },
    { key: 'verify-rework', to: 'implementing', label: '退回返工', consequence: '退回实施：验收单标记返工项，实施窗口按意见重做后重新提交', humanOnly: true },
    { key: 'cancel', label: '取消需求', consequence: '取消：需求移出在途泳道（人工门；可用回退边撤回）', humanOnly: true },
  ]
  const head = (): string => buildReportHead(makeReportResponse({ actions: ACTIONS }))

  it('按钮自成一个容器：标签与 ← 看板 不在里面（换行只由按钮数决定）', () => {
    const html = head()
    expect(countOf(html, 'data-action-grid="1"')).toBe(1)
    const open = html.indexOf('<div class="dsh-pm-report-action-grid"')
    const afterGrid = html.indexOf('data-human-only-mark="1"')
    expect(open).toBeGreaterThan(-1)
    expect(afterGrid).toBeGreaterThan(open)
    const grid = html.slice(open, afterGrid)
    expect(countOf(grid, 'data-action-key=')).toBe(3)
    expect(grid).not.toContain('data-action="back"')
    expect(grid).not.toContain('本阶段操作')
    expect(html.indexOf('data-action="back"')).toBeLessThan(open)
    expect(html.indexOf('本阶段操作')).toBeLessThan(open)
  })

  it('说明不挨着按钮：常驻区只有主操作下方一句 ≤40 字短提示，后果全文进 title', () => {
    const html = head()
    // 整条操作区只允许一句常驻提示（其余全在 title / 确认框）
    expect(countOf(html, 'dsh-pm-action-consequence')).toBe(1)
    expect(html).toContain('>通过即归档<') // 冒号前那一截就是那一句
    for (const a of ACTIONS) {
      // 后果全文一个字不丢（悬停可读），且**没有** inline 跟在按钮后面的「后果：…」
      expect(html).toContain('title="' + a.consequence + '"')
    }
    expect(countOf(html, '后果：')).toBe(0)
  })

  it('分级：1 个 primary + 其余 secondary + 危险动作（取消）红、排最后、带 data-confirm', () => {
    const html = head()
    expect(countOf(html, 'data-action-rank="primary"')).toBe(1)
    expect(countOf(html, 'data-action-rank="secondary"')).toBe(1)
    expect(countOf(html, 'data-action-rank="danger"')).toBe(1)
    expect(html).toContain('class="dsh-pm-btn primary"')
    expect(html).toContain('class="dsh-pm-btn danger"')
    // 危险动作排最后（Pajamas · Destructive actions）+ 必须进确认框（壳在点击那一跳弹）
    expect(html.indexOf('data-action-rank="danger"')).toBeGreaterThan(html.indexOf('data-action-rank="secondary"'))
    expect(html).toContain('data-confirm="')
    expect(html).toContain('确定执行吗？')
    // 服务端给的顺序就算把取消放在第一位，渲染层也要把它挪到最后（顺序是展示分级，属渲染层）
    const reordered = buildReportHead(makeReportResponse({ actions: [ACTIONS[2], ACTIONS[0]] }))
    expect(reordered.indexOf('data-action-rank="danger"')).toBeGreaterThan(reordered.indexOf('data-action-rank="primary"'))
  })

  it('「均需人工确认」整条只标一次（不是三个粉色实心块）；每格的人工门写在 data-human-only 上', () => {
    const html = head()
    expect(countOf(html, 'dsh-pm-human-only')).toBe(1)
    expect(countOf(html, '均需人工确认')).toBe(1)
    expect(countOf(html, 'data-human-only="true"')).toBe(ACTIONS.length)
    expect(countOf(html, 'data-human-only-mark="1"')).toBe(1)
    // 没有人工门动作时，行尾标**不渲染**（不留一句无指代的"均需人工确认"）
    const auto = buildReportHead(makeReportResponse({
      actions: [{ key: 'move', to: 'accepting', label: '提交验收', consequence: '推进到验收态由人逐项裁决', humanOnly: false }],
    }))
    expect(auto).not.toContain('dsh-pm-human-only')
    expect(auto).not.toContain('均需人工确认')
  })

  it('短后果口径：取「：」前那一截，取不到就截 40 字 + 省略号（同类信息同一套截断口径）', () => {
    expect(shortConsequence('通过即归档：需求进入终态、不再接受修改')).toBe('通过即归档')
    expect(shortConsequence('取消：需求移出在途泳道')).toBe('取消')
    const long = 'x'.repeat(80)
    expect(shortConsequence(long)).toBe('x'.repeat(CONSEQUENCE_HINT_MAX) + '…')
    expect(shortConsequence('')).toBe('')
  })
})

/* ------------------------------------------- ②c 状态带一行口径（2026-10-05 验收） */

/**
 * 人类验收：状态带三格把「验收标准原文 + 意见」整段塞进小格，再靠省略号截断 → 半句 + `…`，读不了。
 * 口径：格内每条只给「项名 + 状态」（≤1 行），完整原文在**对应的落点**
 * （缺口 → 条款/门禁；遗留 → 『文档』Tab 的验收单），中间那一步是 `title`。
 * 像素判据在探针（1280 档三格各自 ≤ 220px）。
 */
describe('②c 状态带一行口径（项名 · 状态；全文进 title）', () => {
  it('oneLineLabel：短状态词后置；项名取【】或第一个分句；超长截断给省略号', () => {
    expect(oneLineLabel('未裁决：【定死接口与降级契约】验收：命令 pnpm typecheck 退出码 0'))
      .toBe('定死接口与降级契约 · 未裁决')
    expect(oneLineLabel('不通过：窄屏不溢出：375px 下横向滚动')).toBe('窄屏不溢出 · 不通过')
    expect(oneLineLabel('条款 FR-2 没人接：既没有任务卡承接它')).toBe('条款 FR-2 没人接')
    expect(oneLineLabel('一句话没有标点')).toBe('一句话没有标点')
    expect(oneLineLabel('')).toBe('')
    const long = oneLineLabel('项名' + '很长的说明'.repeat(30))
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(SHORT_MAX + 1)
  })

  it('缺口条：一行短标（点 + 条款号 + 一句话），why 与全文进 title，ref 芯片保留', () => {
    const html = buildGapsCell(makeReportResponse({
      gaps: [{
        severity: 'red',
        what: '条款 FR-2 没人接：既没有任务卡承接它，也没有「本轮裁剪」记录——这正是条款在流水线上蒸发的形态',
        why: '没有裁剪记录就无法判断是漏接还是有意为之',
        ref: { kind: 'clause', id: 'FR-2' },
      }],
    }))
    // 一行短标：术语前缀与条款号被剥掉（条款号由旁边芯片显示，不在同一行重复两遍）
    expect(html).toContain('<span class="dsh-pm-gap-what">🔴 没人接</span>')
    expect(html).toContain('data-ref-id="FR-2"')
    // 全文（what ｜ why ｜ 出处）在 title：截断必须给出路
    const title = /title="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(title).toContain('既没有任务卡承接它')
    expect(title).toContain('没有裁剪记录就无法判断是漏接还是有意为之')
    expect(title).toContain('FR-2')
    // 格内不再渲染整段 why（正文落点在条款/门禁）
    expect(html).not.toContain('dsh-pm-gap-why')
  })

  it('遗留条：一行「项名 · 状态」，标准原文进 title（正文在验收单）', () => {
    const html = buildOutcomeCell(makeReportResponse({
      outcome: {
        verdict: 'pending', passed: 0, failed: 0, pendingItems: 1,
        leftovers: ['未裁决：【定死接口与降级契约（六端点 + 信封类型）】验收：命令 pnpm typecheck 退出码 0；命令 grep -c "available: false"'],
      },
    }))
    expect(html).toContain('>定死接口与降级契约（六端点 + 信封类型） · 未裁决</div>')
    const title = /title="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(title).toContain('命令 pnpm typecheck 退出码 0')
  })
})

/* --------------------------------------------------------------- ③ 结果与成效 */

describe('③ 结果与成效（FR-5）', () => {
  it('三态：人的裁决 pass / rework / 未裁决 pending', async () => {
    const items = [
      item('v1-1', 'passed', '跑 vitest 看到绿', '12 passed'),
      item('v1-2', 'failed', '窄屏不溢出', '375px 下横向滚动'),
    ]
    const pass = await reportOf({
      status: 'archived',
      verification: { summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT, sheet: sheet(items), decision: 'pass', reviewedAt: 20, reviewedBy: HUMAN },
    })
    expect(pass.outcome).toEqual({ verdict: 'pass', passed: 1, failed: 1, pendingItems: 0, leftovers: ['不通过：窄屏不溢出：375px 下横向滚动'] })

    const rework = await reportOf({
      status: 'implementing',
      verification: { summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT, sheet: sheet(items), decision: 'rework', reviewNote: '先修窄屏' },
    })
    expect(rework.outcome?.verdict).toBe('rework')

    // 材料已交、人还没裁 → pending（**不从逐项结果倒推**）
    const pending = await reportOf({
      status: 'accepting',
      verification: { summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT, sheet: sheet(items) },
    })
    expect(pending.outcome?.verdict).toBe('pending')
  })

  it('逐项计数：passed/failed/pendingItems 各按 status 数（0 是合法值，不作弊）', async () => {
    const report = await reportOf({
      status: 'archived',
      verification: {
        summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT,
        sheet: sheet([
          item('v1-1', 'passed', 'A'),
          item('v1-2', 'passed', 'B'),
          item('v1-3', 'failed', 'C', '没做到'),
          item('v1-4', 'pending', 'D'),
          item('v1-5', 'unverified', 'E'),
          // not_verifiable 算**已裁决**（domain isFullyDecided 同口径）→ 不进 pendingItems
          item('v1-6', 'not_verifiable', 'F', '线下流程，无法自动验'),
        ]),
        decision: 'pass',
      },
    })
    expect(report.outcome?.passed).toBe(2)
    expect(report.outcome?.failed).toBe(1)
    expect(report.outcome?.pendingItems).toBe(2) // pending + unverified
    // 没通过的项逐条进遗留（含不可验收：那是"已知限制"），一项都不无声消失
    expect(report.outcome?.leftovers).toEqual([
      '不通过：C：没做到',
      '未裁决：D',
      '未复核（已过但没留实际结果）：E',
      '不可验收（无法按要求验）：F：线下流程，无法自动验',
    ])
  })

  it('渲染：data-outcome 三态 + 逐项计数 + 遗留条目（data-leftover）', () => {
    const pass = buildOutcomeCell(makeReportResponse({
      outcome: { verdict: 'pass', passed: 12, failed: 0, pendingItems: 0, leftovers: [] },
    }))
    expect(pass).toContain('data-outcome="pass"')
    expect(pass).toContain('data-band-cell="outcome"')
    expect(pass).toContain('data-outcome-passed="12"')
    expect(pass).toContain('通过 12 项')
    expect(pass).toContain('data-outcome-failed="0"')
    expect(pass).toContain('data-outcome-pending="0"')
    // 全通过 = 「无遗留问题」，不是留白
    expect(pass).toContain('无遗留问题')
    expect(pass).not.toContain('data-leftover=')

    const rework = buildOutcomeCell(makeReportResponse({
      outcome: {
        verdict: 'rework', passed: 3, failed: 2, pendingItems: 0,
        leftovers: ['不通过：窄屏不溢出：375px 下横向滚动', '不通过：导出 CSV 带表头'],
      },
    }))
    expect(rework).toContain('data-outcome="rework"')
    expect(rework).toContain('退回返工')
    expect(rework).toContain('data-outcome-passed="3"')
    expect(countOf(rework, 'data-leftover="1"')).toBe(2)
    // `data-leftover` 的出现次数必须**精确等于遗留条数**（标题/空态都不许带同前缀的属性，
    // 否则 `countOf(html,'data-leftover')` 这类计数断言会数出 N+1）
    expect(countOf(rework, 'data-leftover')).toBe(2)
    expect(rework).toContain('遗留问题与后续（2 项）')
    expect(rework).toContain('375px 下横向滚动')
    expect(rework).toContain('验收单') // 指回逐项原文的入口

    const pending = buildOutcomeCell(makeReportResponse({
      outcome: { verdict: 'pending', passed: 0, failed: 0, pendingItems: 4, leftovers: ['未裁决：A', '未裁决：B', '未裁决：C', '未裁决：D'] },
    }))
    expect(pending).toContain('data-outcome="pending"')
    expect(pending).toContain('data-outcome-pending="4"')
    // 渲染条数上限 3（上线冒烟实测补）：这一格是常驻头部第三格，真数据下 20 条遗留 3,121 字
    // 会让它高 1501px，把六个 Tab 顶出首屏。故**先列前 3 条**，其余用**可数**的指针交代
    // （省略要可见：标题写总数、指针写剩余条数），完整逐项仍在文档 Tab 的验收单里逐行铺开。
    expect(countOf(pending, 'data-leftover="1"')).toBe(3)
    expect(pending).toContain('遗留问题与后续（4 项，先列前 3 项）')
    expect(pending).toContain('data-more-leftovers="1"')
    // 标题/指针**不许**含 `data-leftover` 子串：`countOf(html,'data-leftover')` 必须精确等于渲染行数
    expect(countOf(pending, 'data-leftover')).toBe(3)
    // 30 条也只渲染 3 行（防"条数一多就把首屏吃掉"回归）
    const many = buildOutcomeCell(makeReportResponse({
      outcome: {
        verdict: 'rework', passed: 0, failed: 30, pendingItems: 0,
        leftovers: Array.from({ length: 30 }, (_, i) => '不通过：第 ' + String(i + 1) + ' 项'),
      },
    }))
    expect(countOf(many, 'data-leftover="1"')).toBe(3)
    expect(many).toContain('data-more-leftovers="27"')
  })

  it('没有验收单 → 不给 outcome，页面走既有解释性空态（且与"0 项通过"是两句不同的话）', async () => {
    // 在途：还没到验收段
    const inflight = await reportOf({ status: 'implementing' })
    expect(inflight.outcome).toBeUndefined()
    const inflightHtml = buildReportBand(inflight)
    expect(inflightHtml).toContain('尚未到验收段')
    expect(inflightHtml).not.toContain('data-outcome=')
    expect(inflightHtml).not.toContain('data-outcome-passed')

    // 终态但台账里没有验收单 → 指向文档 Tab，**不编**结论
    const archived = await reportOf({ status: 'archived' })
    expect(archived.outcome).toBeUndefined()
    const archivedHtml = buildReportBand(archived)
    expect(archivedHtml).toContain('已归档')
    expect(archivedHtml).toContain('验收单')
    expect(archivedHtml).not.toContain('data-outcome=')

    // "验收单有 0 项通过"（验收单存在，一项没过）→ 是另一句话：逐项计数 + 遗留逐条
    const zeroPassed = await reportOf({
      status: 'archived',
      verification: {
        summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT,
        sheet: sheet([item('v1-1', 'failed', '唯一一项也没过', '没做')]),
        decision: 'rework',
      },
    })
    expect(zeroPassed.outcome?.passed).toBe(0)
    const zeroHtml = buildOutcomeCell(zeroPassed)
    expect(zeroHtml).toContain('data-outcome-passed="0"')
    expect(zeroHtml).toContain('通过 0 项') // 0 是**事实**（验收单里一项都没通过）
    expect(zeroHtml).toContain('唯一一项也没过')
    expect(zeroHtml).not.toContain('尚未到验收段')
    expect(zeroHtml).not.toContain('全部通过')
  })

  it('取消态：不给验收结论（既有说辞不变，即使台账里有验收单）', async () => {
    const canceled = await reportOf({
      status: 'canceled',
      verification: {
        summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: AGENT,
        sheet: sheet([item('v1-1', 'passed', 'A')]), decision: 'pass',
      },
    })
    const html = buildOutcomeCell(canceled)
    expect(html).toContain('已取消：无验收结论')
    expect(html).not.toContain('data-outcome=')
  })

  it('遗留条目超长会截断并标注（原文在文档 Tab，不丢信息）', () => {
    const long = '不通过：' + '很长的验收标准'.repeat(60)
    const html = buildOutcomeCell(makeReportResponse({
      outcome: { verdict: 'rework', passed: 0, failed: 1, pendingItems: 0, leftovers: [long] },
    }))
    expect(html).toContain('…')
    expect(html).not.toContain(long)
    expect(html).toContain('data-leftover="1"')
  })
})

/* --------------------------------------------------------------- 渲染标本 */

/** 一份最小 `ReportResponse`（渲染断言用；字段与服务端装配同形）。 */
function makeReportResponse(over: Partial<ReportResponse> = {}): ReportResponse {
  return {
    head: {
      id: REQ_ID,
      title: '首屏三处数据缺口',
      category: 'feature',
      status: 'implementing',
      blocked: false,
      createdAt: 1_000,
      updatedAt: NOW,
      seats: [{ windowKey: WINDOW, role: 'owner', joinedAt: 1_000 }],
      sessionJump: [{ windowKey: WINDOW, archived: false }],
      comments: [{ at: 1_700_000_000_000, body: '台账里的一条评论', by: HUMAN }],
    },
    progress: { sinceUpdateMs: 1_000, tasks: { total: 1, done: 0, running: 0, todo: 1, subChainDone: 0, subChainTotal: 0 } },
    verdictLine: '实施阶段暂无在跑任务；没有事在等人；下一步等人给方向',
    waitingHuman: 0,
    gaps: [],
    actions: [],
    ...over,
  }
}
