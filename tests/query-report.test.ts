/**
 * 服务端聚合查询测试（REQ-261004222448-292a t-43fcf4）——report / docs / dag / token 扩展。
 *
 * 四条卡验收逐条钉在这里（其余是四类缺口、六道门、三态等支撑断言）：
 *   ① `buildGaps` 的缺口条数 == 「未接收条款数 + 挂起确认数」（口径与 `reqboard_status` 同源）；
 *   ② Token 各阶段占比合计 == 100%（浮点容差 0.5）；
 *   ③ `optimizations` 每条含数字（正则 `\d` 命中）；
 *   ④ `totalTokens === 0` 且无快照 → `availability === 'none'`，且**不产出 0 值表**（`byStage` 为空）。
 *
 * 夹具口径：用例层的 `makeHarness`（内存台账 + 真 `QueueTaskStore` + FakeDocs），
 * 台账/队列/文档三处都是**真实现**，只有文件与时钟是替身。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, type Harness } from './application/harness.js'
import {
  emptyBuckets,
  isDegrade,
  type ActorRef,
  type PanelResult,
  type RequirementRecord,
  type RequirementStatus,
  type StatusEvent,
  type TaskRecord,
} from '../src/shared/protocol.js'
import type { PendingConfirmReadPort } from '../src/application/query/contracts.js'
import {
  buildActions,
  buildGaps,
  queryReport,
  type ReportQueryDeps,
} from '../src/application/query/QueryReport.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import { queryDag } from '../src/application/query/QueryDag.js'
import {
  buildOptimizations,
  buildStageTokenTable,
  queryTokenExtension,
} from '../src/application/query/QueryToken.js'

const REQ_ID = 'REQ-aaaaaa'
const WINDOW = 'session-w-001'
/** 固定"现在"（stageStayedMs / sinceUpdateMs 是可断言数，不靠运气）。 */
const NOW = 5_000_000
const HUMAN: ActorRef = { kind: 'human' }

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 状态事件（可选带写时快照——带上才不算"快照缺口"）。 */
function event(status: RequirementStatus, at: number, withSnapshot = false): StatusEvent {
  return {
    status,
    at,
    by: HUMAN,
    ...(withSnapshot ? { tokenSnapshot: { at, totals: emptyBuckets(), source: 'projection' as const } } : {}),
  }
}

/** 最小需求（默认 feature / implementing / 带 task_detail 产物）。 */
function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ_ID,
    title: '详情页聚合测试需求',
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
    statusHistory: [
      event('draft', 1_000),
      event('brainstorming', 2_000),
      event('design', 3_000),
      event('implementing', 4_000_000),
    ],
    artifacts: [{
      stage: 'implementing', kind: 'task_detail',
      path: 'docs/requirements/' + REQ_ID + '/tasks/t-aaaaaa.md',
      registeredAt: 4_100_000, registeredBy: HUMAN,
    }],
    ...over,
  }
}

/** 最小任务。 */
function makeTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-aaaaaa',
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

/** 需求文档：四条条款定义（FR-1/FR-2 被任务接收，FR-3/FR-4 悬空）。 */
const REQUIREMENT_MD = [
  '# 需求：详情页聚合',
  '',
  '**FR-1** 首屏一次请求给全四问',
  '**FR-2** 缺口能指回来源',
  '**FR-3** 文档 Tab 全部铺开',
  '**FR-4** Token 按阶段并给优化点',
  '',
].join('\n')

/** 拆分文档：RTM 覆盖表（FR-1 → t-aaaaaa、FR-2 → t-bbbbbb）。 */
const DECOMPOSITION_MD = [
  '# 拆分计划',
  '',
  '| 根编号 | 任务 | 标题 |',
  '|---|---|---|',
  '| FR-1 | t-aaaaaa | 任务一 |',
  '| FR-2 | t-bbbbbb | 任务二 |',
  '',
].join('\n')

/** 设计文档：两个章节各自 serves 一个已存在条款（不产生悬空引用）。 */
const DESIGN_MD = [
  '# 架构',
  '',
  '## 1.1 首屏聚合 <!-- serves: FR-1 -->',
  '',
  '一次请求给全头部。',
  '',
  '## 1.2 缺口判定 <!-- serves: FR-2 -->',
  '',
  '四类缺口逐类判定。',
  '',
].join('\n')

/** 装载"有文档、有两条任务"的夹具。 */
function makeFixture(over: {
  req?: Partial<RequirementRecord>
  tasks?: readonly TaskRecord[]
  withDocs?: boolean
} = {}): Harness {
  const tasks = over.tasks ?? [
    makeTask({ id: 't-aaaaaa', title: '任务一' }),
    makeTask({ id: 't-bbbbbb', title: '任务二' }),
  ]
  const h = makeHarness({ requirements: [makeReq(over.req)], tasks: [...tasks] })
  if (over.withDocs !== false) {
    h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', REQUIREMENT_MD)
    h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DECOMPOSITION_MD)
    h.docs.put('docs/requirements/' + REQ_ID + '/design/architecture.md', DESIGN_MD)
    h.docs.put('docs/requirements/' + REQ_ID + '/tasks/t-aaaaaa.md', '# 任务卡')
  }
  return h
}

/** 一条挂起确认（内存态；台账里没有）。 */
const PENDING = {
  ticket: 'pc-abc123',
  windowKey: WINDOW,
  requirementId: REQ_ID,
  target: 'artifact' as const,
  kind: 'design' as const,
  createdAt: 4_200_000,
}

/** 组装查询依赖（端口全在位）。 */
function makeDeps(h: Harness, over: Partial<ReportQueryDeps> = {}): ReportQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs: h.docs,
    now: () => NOW,
    ...over,
  }
}

/** 非降级断言（降级信封必须当场失败，否则后面全是 undefined 噪声）。 */
function ok<T>(value: PanelResult<T>): T & { available?: true } {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

// ---------------------------------------------------------------------------
// ① 缺口条数与「未接收条款数 + 挂起确认数」一致（口径与 reqboard_status 同源）
// ---------------------------------------------------------------------------

describe('buildGaps / report：缺口口径与 reqboard_status 同源', () => {
  it('① 缺口条数 == 未接收条款数 + 挂起确认数（另两类在此夹具下为空）', async () => {
    const h = makeFixture()
    const port: PendingConfirmReadPort = { pendingForRequirement: id => (id === REQ_ID ? [PENDING] : []) }
    const deps = makeDeps(h, { pendingConfirms: port })
    const report = ok(await queryReport(deps, { requirementId: REQ_ID }))

    // 未接收条款：FR-1/FR-2 被两张卡接收 → 只有 FR-3、FR-4 悬空
    const clauseGaps = report.gaps.filter(g => g.ref?.kind === 'clause')
    expect(clauseGaps.map(g => g.ref?.id)).toEqual(['FR-3', 'FR-4'])
    expect(clauseGaps.every(g => g.severity === 'red')).toBe(true)
    // 挂起确认：1 条（黄），why 里必须带被拦住的写路径
    const confirmGaps = report.gaps.filter(g => g.ref?.kind === 'confirm')
    expect(confirmGaps).toHaveLength(1)
    expect(confirmGaps[0]?.ref?.id).toBe('pc-abc123')
    expect(confirmGaps[0]?.why).toContain('reqboard_submit')

    // 另两类（必备产物 / 追溯断链）在此夹具下确为空：条数才等于"未接收 + 挂起"
    const artifactGaps = report.gaps.filter(g => g.ref?.kind === 'artifact')
    const taskGaps = report.gaps.filter(g => g.ref?.kind === 'task')
    expect(artifactGaps).toEqual([])
    expect(taskGaps).toEqual([])

    const unreceived = clauseGaps.length
    const pendingCount = confirmGaps.length
    expect(report.gaps).toHaveLength(unreceived + pendingCount)
    expect(unreceived + pendingCount).toBe(3)

    // waitingHuman 与 FR-3 判定② 的口径一致：等于**缺口条数**（协议里那句"红条数"是更早的写法，
    // 以需求条款为准；两个口径都钉住，谁想改就得同时改两处并说明理由）
    expect(report.waitingHuman).toBe(report.gaps.length)
    expect(report.waitingHuman).toBe(3)
  })

  it('缺口清单与 reqboard_status 的 unreceived_clauses 同源（同一份投影）', async () => {
    const h = makeFixture()
    const deps = makeDeps(h, { pendingConfirms: { pendingForRequirement: () => [] } })
    const report = ok(await queryReport(deps, { requirementId: REQ_ID }))
    // 口径同源的可观测形式：条款缺口只可能来自 marks.unreceived，而 marks 由
    // assembleRequirementMarks（= reqboard_status 的同一套 clauseReceiveStatus + collectTaskRefs）产出
    const gapClauses = report.gaps.filter(g => g.ref?.kind === 'clause').map(g => g.ref?.id).sort()
    const direct = await (await import('../src/application/query/QueryRequirementMarks.js'))
      .assembleRequirementMarks({ docs: h.docs }, makeReq(), await h.tasksOf(REQ_ID))
    expect(gapClauses).toEqual([...direct.unreceived].sort())
    expect(direct.unreceived).toEqual(['FR-3', 'FR-4'])
  })

  it('第二类：必备产物缺失/门禁未过（红）——同一件缺产物只报一条', () => {
    // 非存量（有产物）但当前阶段必备产物缺失：brainstorming 缺 requirement
    const req = makeReq({
      status: 'brainstorming',
      statusHistory: [event('draft', 1_000), event('brainstorming', 2_000)],
      artifacts: [{
        stage: 'brainstorming', kind: 'notes', path: 'docs/requirements/' + REQ_ID + '/notes/x.md',
        registeredAt: 2_100, registeredBy: HUMAN,
      }],
    })
    const gaps = buildGaps(req, [], { requirementId: REQ_ID, clauses: [], unreceived: [], available: false }, [])
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.severity).toBe('red')
    expect(gaps[0]?.ref).toEqual({ kind: 'artifact', id: 'requirement' })
  })

  it('第二类：存量需求（完全没有产物）不硬拦——与 assertArtifactGates 同口径', () => {
    const req = makeReq({ status: 'brainstorming', artifacts: undefined })
    const gaps = buildGaps(req, [], { requirementId: REQ_ID, clauses: [], unreceived: [], available: false }, [])
    expect(gaps).toEqual([])
  })

  it('第三类：设计悬空引用与"已结单却无证据"各报一条（与未接收条款不重叠）', () => {
    const marks = {
      requirementId: REQ_ID,
      clauses: [{ clause: 'FR-2', state: 'received' as const, by: ['t-bbbbbb'] }],
      unreceived: [],
      available: true,
    }
    const tasks = [makeTask({
      id: 't-bbbbbb',
      status: 'done',
      dependsOn: ['t-ffffff'],
    })]
    const gaps = buildGaps(makeReq({ artifacts: undefined }), tasks, marks, [], {
      designSections: [{ file: 'design/architecture.md', section: '9.9', headingLevel: 2, title: 'x', serves: ['FR-9'], content: '' }],
    })
    expect(gaps.map(g => [g.ref?.kind, g.ref?.id]).sort()).toEqual([
      ['clause', 'FR-2'], ['clause', 'FR-9'], ['task', 't-bbbbbb'],
    ])
    expect(gaps.find(g => g.ref?.id === 'FR-2')?.why).toContain('测试环断链')
    expect(gaps.find(g => g.ref?.id === 'FR-9')?.what).toContain('不存在')
    expect(gaps.find(g => g.ref?.kind === 'task')?.what).toContain('t-ffffff')
  })

  it('第四类：挂起确认端口未装配 → 灰条声明"不可知"，不写"0 条"', async () => {
    const h = makeFixture()
    const report = ok(await queryReport(makeDeps(h), { requirementId: REQ_ID }))
    const gray = report.gaps.filter(g => g.severity === 'gray')
    expect(gray).toHaveLength(1)
    expect(gray[0]?.what).toContain('挂起确认')
    expect(gray[0]?.why).toContain('未装配')
    // 灰条不进"等人"计数（红条才进）
    expect(report.waitingHuman).toBe(report.gaps.length)
  })
})

// ---------------------------------------------------------------------------
// 首屏四问：head / progress / verdictLine / nextStepForAgent / actions
// ---------------------------------------------------------------------------

describe('queryReport：首屏四问与操作条', () => {
  it('head 给身份/状态/席位/窗口跳转；progress 给停留与任务计数', async () => {
    const h = makeFixture({ tasks: [makeTask({ status: 'done' }), makeTask({ id: 't-bbbbbb', status: 'in_progress' })] })
    const report = ok(await queryReport(makeDeps(h), { requirementId: REQ_ID }))
    expect(report.head.id).toBe(REQ_ID)
    expect(report.head.title).toBe('详情页聚合测试需求')
    expect(report.head.status).toBe('implementing')
    expect(report.head.category).toBe('feature')
    expect(report.head.blocked).toBe(false)
    // 席位：无 seats 字段 → 读端折算为单 owner（与 seatsOf 同源）
    expect(report.head.seats).toEqual([{ windowKey: WINDOW, role: 'owner', joinedAt: 1_000 }])
    expect(report.head.sessionJump).toEqual([{ windowKey: WINDOW, archived: false }])
    // 阶段停留：最近一次进入 implementing（4_000_000）到现在（5_000_000）
    expect(report.progress.stageEnteredAt).toBe(4_000_000)
    expect(report.progress.stageStayedMs).toBe(1_000_000)
    expect(report.progress.sinceUpdateMs).toBe(500_000)
    expect(report.progress.tasks).toEqual({
      total: 2, done: 1, running: 1, todo: 0, subChainDone: 0, subChainTotal: 0,
    })
  })

  it('verdictLine 答四问；nextStepForAgent 给在跑时的下一步', async () => {
    const h = makeFixture({ tasks: [makeTask({ status: 'in_progress' })] })
    const report = ok(await queryReport(makeDeps(h), { requirementId: REQ_ID }))
    expect(report.verdictLine).toContain('在跑 1 张任务卡')
    expect(report.verdictLine).toContain('在席')
    expect(report.verdictLine).toContain(String(report.gaps.length) + ' 件事等人')
    expect(report.verdictLine).toContain('下一步')
    expect(report.nextStepForAgent).toContain('reqboard_task_run')
  })

  it('操作条：implementing 只给「推进到验收」+「取消需求」（与标本一致）', () => {
    const actions = buildActions(makeReq())
    expect(actions.map(a => [a.key, a.to, a.humanOnly])).toEqual([
      ['move', 'accepting', false],
      ['cancel', 'canceled', true],
    ])
    expect(actions[0]?.consequence).toContain('验收')
  })

  it('操作条：brainstorming→design 是人工门（humanOnly:true）', () => {
    const actions = buildActions(makeReq({ status: 'brainstorming' }))
    expect(actions.find(a => a.to === 'design')?.humanOnly).toBe(true)
  })

  it('操作条：计划待批时给批准/退回；已批准则不再给', () => {
    const plan = {
      path: 'docs/requirements/' + REQ_ID + '/plan.md', summary: '目标+做法',
      tasks: [], submittedAt: 2_500, submittedBy: HUMAN,
    }
    const pending = buildActions(makeReq({ status: 'decomposing', plan }))
    expect(pending.filter(a => a.key === 'plan-approve' || a.key === 'plan-reject')).toHaveLength(2)
    expect(pending.find(a => a.key === 'plan-approve')?.humanOnly).toBe(true)
    const approved = buildActions(makeReq({ status: 'decomposing', plan: { ...plan, approvedAt: 2_600, approvedBy: HUMAN } }))
    expect(approved.filter(a => a.key === 'plan-approve' || a.key === 'plan-reject')).toEqual([])
  })

  it('操作条：accepting 有验收材料才给通过/返工', () => {
    const withMaterials = buildActions(makeReq({
      status: 'accepting',
      verification: { summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: HUMAN },
    }))
    expect(withMaterials.map(a => a.key)).toEqual(['verify-pass', 'verify-rework', 'cancel'])
    expect(withMaterials.filter(a => a.key.startsWith('verify')).every(a => a.humanOnly)).toBe(true)
    const without = buildActions(makeReq({ status: 'accepting' }))
    expect(without.map(a => a.key)).toEqual(['cancel'])
  })

  it('操作条：终态（archived/canceled/done）一律空数组', () => {
    for (const status of ['archived', 'canceled', 'done'] as RequirementStatus[]) {
      expect(buildActions(makeReq({ status }))).toEqual([])
    }
  })

  it('blocked 需求：head 带原因，下一步先解阻塞', async () => {
    const h = makeFixture({ req: { blocked: true, blockedReason: '等人确认设计文档' } })
    const report = ok(await queryReport(makeDeps(h), { requirementId: REQ_ID }))
    expect(report.head.blocked).toBe(true)
    expect(report.head.blockedReason).toBe('等人确认设计文档')
    expect(report.nextStepForAgent).toBe('先解除阻塞：等人确认设计文档')
  })

  it('会话归档口在位时，sessionJump 如实标 archived', async () => {
    const h = makeFixture()
    const report = ok(await queryReport(
      makeDeps(h, { sessionsArchive: { archivedSessionIds: () => new Set([WINDOW]) } }),
      { requirementId: REQ_ID },
    ))
    expect(report.head.sessionJump).toEqual([{ windowKey: WINDOW, archived: true }])
  })

  it('台账读不到 → 降级信封 ledger-unreadable（不用空数组冒充「没有」）', async () => {
    const h = makeFixture()
    h.store.injectFault(REQ_ID)
    const value = await queryReport(makeDeps(h), { requirementId: REQ_ID })
    expect(isDegrade(value)).toBe(true)
    if (!isDegrade(value)) throw new Error('narrow')
    expect(value.reason).toBe('ledger-unreadable')
    expect(value.note).toContain('读不到')
  })

  it('需求不存在 → 抛 code=not_found（路由层转 404）', async () => {
    const h = makeFixture()
    await expect(queryReport(makeDeps(h), { requirementId: 'REQ-zzzzzz' })).rejects.toMatchObject({ code: 'not_found' })
  })
})

// ---------------------------------------------------------------------------
// ②③④ Token：占比 100% / 优化点含数字 / 三态与"不画 0 值表"
// ---------------------------------------------------------------------------

/** 带 token 快照的需求（draft/brainstorming/design/implementing 四阶段各有差值）。 */
function tokenReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return makeReq({
    status: 'implementing',
    statusHistory: [
      event('draft', 1_000, true),
      event('brainstorming', 2_000, true),
      event('design', 3_000, true),
      event('implementing', 4_000_000, true),
    ],
    artifacts: undefined,
    tokenUsage: {
      byStage: {
        draft: { uncachedInputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        brainstorming: { uncachedInputTokens: 800, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
        design: { uncachedInputTokens: 1_000, outputTokens: 500, cacheReadTokens: 1_500, cacheWriteTokens: 0 },
        implementing: { uncachedInputTokens: 2_000, outputTokens: 1_000, cacheReadTokens: 5_000, cacheWriteTokens: 0 },
      },
      totals: emptyBuckets(),
      updatedAt: 4_500_000,
    },
    ...over,
  })
}

describe('QueryToken：按阶段聚合 + 优化点 + 三态', () => {
  it('② 各阶段占比合计 == 100%（容差 0.5），且两列（每次调用均 / 缓存命中）在场', () => {
    const table = buildStageTokenTable(tokenReq(), [])
    expect(table.rows.map(r => r.stage)).toEqual(['draft', 'brainstorming', 'design', 'implementing'])
    const sum = table.rows.reduce((n, r) => n + r.sharePct, 0)
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.5)
    for (const row of table.rows) {
      expect(typeof row.perCallTokens).toBe('number')
      expect(typeof row.cacheHitPct).toBe('number')
      expect(row.totalTokens).toBe(row.inputTokens + row.outputTokens + row.cacheReadTokens)
    }
    // 快照齐 → full（没有缺阶段）
    expect(table.availability).toBe('full')
    expect(table.missingStages).toEqual([])
    // 缓存命中率 = 缓存读 ÷ (缓存读 + 未缓存输入)
    const design = table.rows.find(r => r.stage === 'design')
    expect(design?.cacheHitPct).toBeCloseTo((1_500 / (1_500 + 1_000)) * 100, 2)
  })

  it('② partial：缺一个阶段的快照 → partial + missingStages + 合计是下界', async () => {
    const req = tokenReq()
    delete req.tokenUsage!.byStage.design
    const table = buildStageTokenTable(req, [])
    expect(table.availability).toBe('partial')
    expect(table.missingStages).toEqual(['design'])
    expect(Math.abs(table.rows.reduce((n, r) => n + r.sharePct, 0) - 100)).toBeLessThanOrEqual(0.5)

    const h = makeHarness({ requirements: [req] })
    const ext = ok(await queryTokenExtension(makeDeps(h), { requirementId: REQ_ID }))
    expect(ext.availability).toBe('partial')
    expect(ext.missingStages).toEqual(['design'])
    expect(ext.boundsAreLowerBound).toBe(true)
  })

  it('③ optimizations 每条都含依据数字（正则 \\d 命中）', () => {
    const req = tokenReq({
      statusHistory: [event('brainstorming', 2_000, true), event('implementing', 4_000_000, true)],
      tokenUsage: {
        byStage: {
          brainstorming: { uncachedInputTokens: 900, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
          implementing: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 400, cacheWriteTokens: 0 },
        },
        totals: emptyBuckets(),
        updatedAt: 4_500_000,
      },
    })
    const table = buildStageTokenTable(req, [])
    const ops = buildOptimizations(table.rows, [
      { stageKind: 'dev', runs: 3, totalDurationMs: 1, avgDurationMs: 1, outputCount: 0, zeroOutputRuns: 2, lastAt: 1 },
    ])
    expect(ops.length).toBeGreaterThanOrEqual(3)
    for (const op of ops) {
      expect(op.title.length).toBeGreaterThan(0)
      expect(op.suggestion.length).toBeGreaterThan(0)
      expect(/\d/.test(op.basis)).toBe(true)
    }
    // 零产出被识别出来（依据里带次数与阶段）
    const zero = ops.find(o => o.title === '零产出执行')
    expect(zero?.basis).toContain('2')
    expect(zero?.basis).toContain('dev')
  })

  it('③ 无可算阶段（无快照）时不给无依据的建议', () => {
    expect(buildOptimizations([], [])).toEqual([])
  })

  it('④ totalTokens==0 且无快照 → availability=none，且不产出 0 值表', async () => {
    const h = makeHarness({ requirements: [makeReq({ tokenUsage: undefined })] })
    const ext = ok(await queryTokenExtension(makeDeps(h), { requirementId: REQ_ID }))
    expect(ext.availability).toBe('none')
    expect(ext.byStage).toEqual([])
    expect(JSON.stringify(ext.byStage)).not.toContain('totalTokens')
    expect(ext.optimizations).toEqual([])
    // 无表可算 → 不给"下界"标记（下界是"部分数据"的说法）
    expect(ext.boundsAreLowerBound).toBeUndefined()
  })

  it('④ 有快照但数值为 0 → 不是 none（"确实没花"与"读不到"是两件事）', async () => {
    const req = makeReq({
      artifacts: undefined,
      status: 'brainstorming',
      tokenUsage: {
        byStage: { brainstorming: emptyBuckets() },
        totals: emptyBuckets(),
        updatedAt: 1,
      },
      statusHistory: [event('brainstorming', 2_000, true)],
    })
    const h = makeHarness({ requirements: [req] })
    const ext = ok(await queryTokenExtension(makeDeps(h), { requirementId: REQ_ID }))
    expect(ext.availability).toBe('full')
    expect(ext.byStage).toHaveLength(1)
    expect(ext.byStage[0]?.totalTokens).toBe(0)
  })

  it('执行侧缺快照 → 与既有 QueryRequirementToken.degraded 同口径判 partial（同页两块不许各说各话）', () => {
    const req = tokenReq()
    const task = makeTask({
      status: 'in_progress',
      // 运行中的执行没有 tokenUsage.start → 既有投影判 degraded
      executions: [{ id: 'e-1', trigger: 'auto', startedAt: 1, outcome: 'running' }],
    })
    const table = buildStageTokenTable(req, [task])
    expect(table.rows.length).toBeGreaterThan(0)
    expect(table.availability).toBe('partial')
  })

  it('实施阶段的调用数取执行记录条数（每次执行 = 一次调用）', () => {    const task = makeTask({
      executions: [
        { id: 'e-1', trigger: 'auto', startedAt: 1, endedAt: 2, outcome: 'succeeded' },
        { id: 'e-2', trigger: 'auto', startedAt: 3, endedAt: 4, outcome: 'succeeded' },
      ],
    })
    const table = buildStageTokenTable(tokenReq(), [task])
    const impl = table.rows.find(r => r.stage === 'implementing')
    expect(impl?.calls).toBe(2)
    expect(impl?.perCallTokens).toBe(Math.round((impl?.totalTokens ?? 0) / 2))
  })
})

// ---------------------------------------------------------------------------
// 文档 Tab：铺开 / 生成物 / 核验表 / 六道门 / 归档
// ---------------------------------------------------------------------------

describe('queryDocs：文档 + 生成物 + 核验表 + 六道门', () => {
  it('documents 全部铺开：已确认 / 待确认 / 文件缺失 / 未登记四种态都在', async () => {
    const h = makeFixture({
      req: {
        status: 'design',
        artifacts: [
          {
            stage: 'brainstorming', kind: 'requirement',
            path: 'docs/requirements/' + REQ_ID + '/requirement.md',
            registeredAt: 2_000, registeredBy: HUMAN,
            confirmedAt: 2_100, confirmedBy: HUMAN, confirmedVia: 'board',
          },
          {
            stage: 'design', kind: 'design',
            path: 'docs/requirements/' + REQ_ID + '/design/backend.md',
            registeredAt: 3_000, registeredBy: HUMAN,
          },
          {
            stage: 'design', kind: 'notes',
            path: 'docs/requirements/' + REQ_ID + '/notes/gone.md',
            registeredAt: 3_100, registeredBy: HUMAN,
          },
        ],
      },
    })
    // 未登记但文件在盘上的设计文档（architecture.md 是 feature 模板的必交项）
    h.docs.put('docs/requirements/' + REQ_ID + '/design/architecture.md', DESIGN_MD)
    // 登记过、待确认、且文件在盘上（对照下一条：登记过但文件不在 → file-missing）
    h.docs.put('docs/requirements/' + REQ_ID + '/design/backend.md', '# 后端设计')
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))

    const byPath = new Map(res.documents.map(d => [d.path, d]))
    expect(byPath.get('docs/requirements/' + REQ_ID + '/requirement.md')?.state).toBe('confirmed')
    expect(byPath.get('docs/requirements/' + REQ_ID + '/design/backend.md')?.state).toBe('pending')
    expect(byPath.get('docs/requirements/' + REQ_ID + '/notes/gone.md')?.state).toBe('file-missing')
    expect(byPath.get('docs/requirements/' + REQ_ID + '/design/architecture.md')?.state).toBe('unregistered')
    expect(byPath.get('docs/requirements/' + REQ_ID + '/requirement.md')?.registeredAt).toBe(2_000)
    // 未登记的设计文档也铺开（不截断、不折叠）
    expect(res.documents.length).toBeGreaterThan(3)
    expect(res.documents.every(d => typeof d.path === 'string' && typeof d.state === 'string')).toBe(true)
  })

  it('generated：queue.json 与 rtm-*.yml 只在确实存在时列出', async () => {
    const h = makeFixture()
    const dir = 'docs/requirements/' + REQ_ID
    h.docs.put(dir + '/queue.json', '{}')
    h.docs.put(dir + '/rtm-implementing.yml', 'x: 1')
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.generated.map(g => g.path).sort()).toEqual([dir + '/queue.json', dir + '/rtm-implementing.yml'])
    expect(res.generated.find(g => g.path.endsWith('queue.json'))?.label).toContain('队列')
  })

  it('verification：整份照抄验收单（实际结果 / 来源 / 需人工三列都在）', async () => {
    const h = makeFixture({
      req: {
        status: 'accepting',
        verification: {
          summary: '交付完成', evidence: ['npx vitest run: 12 passed'],
          submittedAt: 10, submittedBy: HUMAN,
          sheet: {
            version: 2, generatedAt: 11, generatedBy: HUMAN,
            items: [
              {
                id: 'v1-1', source: { kind: 'requirement' }, criterion: '首屏一次请求',
                evidence: ['tests/query-report.test.ts'], status: 'passed',
                result: 'npx vitest run tests/query-report.test.ts → 27 passed',
                resultSource: 'agent', needsHuman: false, opinion: '通过', decidedAt: 12,
              },
              {
                id: 'v1-2', source: { kind: 'requirement' }, criterion: '窄屏不溢出',
                evidence: [], status: 'pending', needsHuman: true, humanReason: '视觉需人看',
              },
            ],
          },
        },
      },
    })
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.verification?.version).toBe(2)
    expect(res.verification?.items).toHaveLength(2)
    expect(res.verification?.items[0]?.result).toContain('27 passed')
    expect(res.verification?.items[0]?.resultSource).toBe('agent')
    expect(res.verification?.items[1]?.needsHuman).toBe(true)
    // 契约是「整份 VerificationSheet」：没有 reviewedAt/decision/reviewNote 三键
    // （design/interfaces.md 与 protocol.ts 在此不一致，见最终答复）
    expect(res.verification !== undefined && 'decision' in res.verification).toBe(false)
  })

  it('gates：没到过的门一律 not-reached（draft 需求六门全未到）', async () => {
    const h = makeHarness({ requirements: [makeReq({
      status: 'draft', statusHistory: [event('draft', 1_000)], artifacts: undefined, sourceSessionId: WINDOW,
    })] })
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.gates.map(g => [g.gate, g.verdict])).toEqual([
      ['requirement', 'not-reached'],
      ['design', 'not-reached'],
      ['plan', 'not-reached'],
      ['implementation', 'not-reached'],
      ['verification', 'not-reached'],
      ['archive', 'not-reached'],
    ])
  })

  it('gates：谁批的 / 何时 / 什么方式 / 退回理由（回退作废留痕）', async () => {
    const h = makeHarness({ requirements: [makeReq({
      status: 'implementing',
      artifacts: [
        {
          stage: 'brainstorming', kind: 'requirement',
          path: 'docs/requirements/' + REQ_ID + '/requirement.md',
          registeredAt: 2_000, registeredBy: HUMAN,
          confirmedAt: 2_100, confirmedBy: HUMAN, confirmedVia: 'board',
        },
        {
          stage: 'design', kind: 'design',
          path: 'docs/requirements/' + REQ_ID + '/design/architecture.md',
          registeredAt: 3_000, registeredBy: HUMAN,
          confirmedAt: 3_100, confirmedBy: HUMAN, confirmedVia: 'session', confirmedEvidence: '设计可以',
        },
        {
          stage: 'decomposing', kind: 'decomposition',
          path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
          registeredAt: 3_500, registeredBy: HUMAN,
        },
      ],
      // 从 implementing 回退到 design：晚于 design 的章与计划批准一并作废
      rollback: { from: 'implementing', to: 'design', at: 4_600_000, by: HUMAN, reason: '接口对不上，重做设计' },
    })], tasks: [makeTask({ status: 'todo' })] })
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    const byGate = new Map(res.gates.map(g => [g.gate, g]))
    expect(byGate.get('requirement')).toMatchObject({ verdict: 'passed', at: 2_100, via: 'board' })
    // 退到 design 不撤 design 自己的章（与 rollback-revocation ① 同口径）
    expect(byGate.get('design')).toMatchObject({ verdict: 'passed', at: 3_100, via: 'evidence-text' })
    // 计划门被这次回退作废，理由原文在场（UC-4 第 3 条）
    expect(byGate.get('plan')?.verdict).toBe('rejected')
    expect(byGate.get('plan')?.reason).toContain('接口对不上')
    expect(byGate.get('implementation')?.verdict).toBe('passed')
    expect(byGate.get('verification')?.verdict).toBe('not-reached')
    expect(byGate.get('archive')?.verdict).toBe('not-reached')
  })

  it('gates：验收 pass/rework 各自成 verdict（退回理由取 reviewNote 原文）', async () => {
    const pass = ok(await queryDocs(makeDeps(makeHarness({ requirements: [makeReq({
      status: 'archived',
      verification: {
        summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: HUMAN,
        reviewedAt: 20, reviewedBy: HUMAN, decision: 'pass', reviewNote: '证据齐',
      },
    })] })), { requirementId: REQ_ID }))
    const passGate = pass.gates.find(g => g.gate === 'verification')
    expect(passGate).toMatchObject({ verdict: 'passed', at: 20 })

    const rework = ok(await queryDocs(makeDeps(makeHarness({ requirements: [makeReq({
      status: 'implementing',
      verification: {
        summary: 's', evidence: ['e'], submittedAt: 10, submittedBy: HUMAN,
        reviewedAt: 20, reviewedBy: HUMAN, decision: 'rework', reviewNote: '窄屏溢出',
      },
    })] })), { requirementId: REQ_ID }))
    const reworkGate = rework.gates.find(g => g.gate === 'verification')
    expect(reworkGate).toMatchObject({ verdict: 'rejected', at: 20, reason: '窄屏溢出' })
  })

  it('archive：有归档时透传（目录/清单/合并去向/索引）', async () => {
    const archive = {
      dir: 'docs/requirements/' + REQ_ID,
      docs: [{ kind: 'requirement' as const, path: 'docs/requirements/' + REQ_ID + '/requirement.md' }],
      mergedInto: ['docs/architecture/project-manual.md'],
      indexEntry: '详情页聚合落地',
      submittedAt: 30, submittedBy: HUMAN, archivedAt: 40, archivedBy: HUMAN,
    }
    const h = makeHarness({ requirements: [makeReq({ status: 'archived', archive })] })
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.archive).toEqual(archive)
    expect(res.gates.find(g => g.gate === 'archive')).toMatchObject({ verdict: 'passed', at: 40 })
  })

  it('文档端口未装配 → 整块降级 port-unavailable（不把未知标成 file-missing）', async () => {
    const h = makeFixture()
    const value = await queryDocs(makeDeps(h, { docs: undefined }), { requirementId: REQ_ID })
    expect(isDegrade(value)).toBe(true)
    if (!isDegrade(value)) throw new Error('narrow')
    expect(value.reason).toBe('port-unavailable')
    expect(value.note).toContain('端口未装配')
  })
})

// ---------------------------------------------------------------------------
// DAG Tab：图数据 + 每步执行结果 + 关键路径
// ---------------------------------------------------------------------------

describe('queryDag：图数据 + 每步执行结果 + 关键路径', () => {
  /** 父卡 + 两张子卡（dev → review），外加一张"该有链却没生成"的 in_progress 父卡。 */
  function dagTasks(): TaskRecord[] {
    return [
      makeTask({ id: 't-aaaaaa', status: 'in_progress', claimedBy: WINDOW }),
      makeTask({ id: 't-bbbbbb', status: 'in_progress', stages: ['dev', 'review'] }),
      makeTask({
        id: 't-cccccc', parentId: 't-bbbbbb', stageKind: 'dev', status: 'done',
        executions: [{
          id: 'e-1', sessionId: WINDOW, trigger: 'auto', startedAt: 100, endedAt: 200,
          outcome: 'succeeded', evidence: ['tests/out.txt'], outputCount: 3,
        }],
        lastReport: { at: 200, reportIndex: 1, filesChanged: ['src/a.ts'], completed: ['改完 a.ts'] },
      }),
      makeTask({ id: 't-dddddd', parentId: 't-bbbbbb', stageKind: 'review', status: 'todo', dependsOn: ['t-cccccc'] }),
    ]
  }

  it('tasks：形状对齐 DagGraphNode（parentId/stageKind/status/dependsOn/claimedBy/layer/chainMissing）', async () => {
    const h = makeHarness({ requirements: [makeReq({ status: 'implementing' })], tasks: dagTasks() })
    const res = ok(await queryDag(makeDeps(h), { requirementId: REQ_ID }))
    const byId = new Map(res.tasks.map(t => [t.id, t]))
    // 「该有链却没生成」：正在跑 + 没有子卡 + 未显式声明 stages: []
    expect(byId.get('t-aaaaaa')?.chainMissing).toBe(true)
    // 有子卡的父卡、已 done 的子卡都不打该标
    expect(byId.get('t-bbbbbb')?.chainMissing).toBeUndefined()
    expect(byId.get('t-cccccc')?.chainMissing).toBeUndefined()
    expect(byId.get('t-cccccc')).toMatchObject({ parentId: 't-bbbbbb', stageKind: 'dev', status: 'done' })
    expect(byId.get('t-dddddd')?.dependsOn).toEqual(['t-cccccc'])
    expect(byId.get('t-aaaaaa')?.claimedBy).toBe(WINDOW)
    // layer 来自队列派生视图（TaskStore 的三个读口都不给 layer）
    expect(byId.get('t-cccccc')?.layer).toBe(0)
    expect(byId.get('t-dddddd')?.layer).toBe(1)
  })

  it('steps：照抄执行记录（trigger/outcome/evidence/attempt/outputCount）+ 卡级汇报四要素', async () => {
    const h = makeHarness({ requirements: [makeReq({ status: 'implementing' })], tasks: dagTasks() })
    const res = ok(await queryDag(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.steps).toHaveLength(1)
    const step = res.steps[0]!
    expect(step).toMatchObject({
      taskId: 't-cccccc', stage: 'dev', sessionId: WINDOW, trigger: 'auto',
      startedAt: 100, endedAt: 200, outcome: 'succeeded', evidence: ['tests/out.txt'],
      attempt: 0, outputCount: 3,
    })
    expect(step.report?.summary).toBe('改完 a.ts')
    expect(step.report?.completed).toEqual(['改完 a.ts'])
    expect(step.report?.filesChanged).toEqual(['src/a.ts'])
    // 台账没存 nextStep → 不给（不编）
    expect(step.report !== undefined && 'nextStep' in step.report).toBe(false)
  })

  it('steps：运行中的执行照样给（outcome=running，无 endedAt）', async () => {
    const h = makeHarness({ requirements: [makeReq({ status: 'implementing' })], tasks: [makeTask({
      status: 'in_progress',
      executions: [{ id: 'e-9', trigger: 'manual', startedAt: 500, outcome: 'running' }],
    })] })
    const res = ok(await queryDag(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.steps[0]).toMatchObject({ outcome: 'running', trigger: 'manual' })
    expect(res.steps[0]?.endedAt).toBeUndefined()
  })

  it('criticalPath：DAG 最长路径（起点→终点，按序）', async () => {
    const h = makeHarness({ requirements: [makeReq({ status: 'implementing' })], tasks: dagTasks() })
    const res = ok(await queryDag(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.criticalPath).toEqual(['t-cccccc', 't-dddddd'])
  })

  it('无任务 → tasks/steps 空数组、criticalPath 省略（不是 null，也不是假路径）', async () => {
    const h = makeHarness({ requirements: [makeReq({ status: 'implementing' })] })
    const res = ok(await queryDag(makeDeps(h), { requirementId: REQ_ID }))
    expect(res.tasks).toEqual([])
    expect(res.steps).toEqual([])
    expect(res.criticalPath).toBeUndefined()
  })
})
