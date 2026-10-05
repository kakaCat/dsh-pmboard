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
import { buildCommentList, buildReportHead } from '../src/client/views/report-head.ts'
import { buildOutcomeCell, buildReportBand } from '../src/client/views/report-band.ts'
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

    expect(report.tabCounts?.docs).toBe('3') // 已登记产物 3 条
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
      expect(html).toContain('data-badge="docs">3<')
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

  it('只给最近 10 条、新的在后（与服务端 req.comments 顺序一致，不多读一次台账）', async () => {
    const report = await reportOf({ comments: many })
    const comments = report.head.comments ?? []
    expect(comments).toHaveLength(REPORT_COMMENT_HEAD_LIMIT)
    // 尾部 10 条：第 5~14 条；顺序原样（新的在后）
    expect(comments.map(c => c.body)).toEqual(many.slice(-10).map(c => c.body))
    expect(comments[comments.length - 1]?.body).toBe('第 14 条评论')
    // ActorRef 原样带出（渲染侧据此区分人 / agent / 系统）
    expect(comments.map(c => c.by)).toEqual(many.slice(-10).map(c => c.createdBy))
  })

  it('渲染：每行一条 data-comment-row，带时间与作者（人 / 窗口码 / 系统可分辨）', () => {
    const html = buildCommentList([
      { at: 1_700_000_000_000, body: '人写的评论', by: HUMAN },
      { at: 1_700_000_060_000, body: 'agent 写的评论', by: AGENT },
      { at: 1_700_000_120_000, body: '系统事件评论', by: SYSTEM },
    ])
    expect(countOf(html, 'data-comment-row="1"')).toBe(3)
    expect(html).toContain('人写的评论')
    expect(html).toContain('agent 写的评论')
    expect(html).toContain('系统事件评论')
    // 作者口径复用 commentActorLabel（人 / 窗口 w-xxxx / 系统），data-actor 供样式与断言选择
    expect(html).toContain('data-actor="human"')
    expect(html).toContain('data-actor="agent"')
    expect(html).toContain('data-actor="system"')
    expect(html).toContain('>人<')
    expect(html).toContain('窗口 ')
    expect(html).toContain('>系统<')
    // 时间戳与正文都渲染；正文转义（内容不可信）
    expect(html).toContain(fmtTime(1_700_000_000_000)) // 与既有详情页同一份时间口径
    expect(countOf(html, 'dsh-pm-comment-body')).toBe(3)
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
    expect(countOf(pending, 'data-leftover="1"')).toBe(4)
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
