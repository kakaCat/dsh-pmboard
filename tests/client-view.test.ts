/**
 * 项目看板 client 视图纯函数单测 —— 数据 → innerHTML 的渲染正确性。
 * 覆盖：泳道看板 / 需求详情（DAG + 任务列 + 闸门）/ 任务详情 / 空态错误 / 运行中指示。· serves: FR-1, FR-3, FR-4, FR-6, FR-8
 * 渲染函数零 DOM 依赖（纯字符串），Node 环境直接跑。
 */
import { describe, it, expect } from 'vitest'
import {
  buildBoard, buildReqDetail, buildTaskDetail, buildTasksPage, buildEmpty, buildError,
  buildListView, toReqCards, LANE_STATUSES,
} from '../src/client/view.ts'
import type { BoardState, RequirementRecord, RequirementStatus, TaskRecord } from '../src/client/types.ts'
import { LIMITS } from '../src/domain/limits.ts'
import { fmtTime } from '../src/client/render/dom-utils.ts'

// -- 测试数据构造 ---------------------------------------------------------

let seq = 0
const rid = (p: string) => `${p}-${String(++seq).padStart(6, '0')}`

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: rid('REQ'), title: '需求', description: '', status: 'draft',
    blocked: false, comments: [], version: 1,
    createdAt: 1700000000000, updatedAt: 1700000000000,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  }
}

function makeTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: rid('t'), requirementId: 'REQ-000001', title: '任务', description: '',
    phase: 'implement', side: 'fullstack', dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: '', context: '',
    status: 'todo', blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1700000000000, updatedAt: 1700000000000,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  }
}

function makeState(over: Partial<BoardState> = {}): BoardState {
  return { revision: 1, requirements: [], tasks: [], ready: {}, ...over }
}

// -- 泳道看板 -------------------------------------------------------------

describe('buildBoard', () => {
  it('renders 6 lanes with correct status labels', () => {
    const html = buildBoard(makeState())
    for (const s of LANE_STATUSES) {
      expect(html).toContain(`data-lane="${s}"`)
    }
    expect(html).toContain('项目看板')
    // 2026-09-30 用户裁定：看板不提供人工创建入口——需求与任务一律经 agent 工具链创建
    expect(html).not.toContain('data-action="new-req"')
    expect(html).not.toContain('data-action="open-tasks"')
    expect(html).toContain('data-action="refresh"')
  })

  it('places requirement cards in their status lane', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', title: '实施中的需求' })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('data-lane="implementing"')
    expect(html).toContain('REQ-000001')
    expect(html).toContain('实施中的需求')
  })

  it('renders task progress n/m on card', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const t1 = makeTask({ id: 't-000001', requirementId: 'REQ-000001', status: 'done' })
    const t2 = makeTask({ id: 't-000002', requirementId: 'REQ-000001', status: 'todo' })
    const html = buildBoard(makeState({ requirements: [req], tasks: [t1, t2] }))
    expect(html).toContain('1/2')
  })

  it('excludes archived and canceled from lanes（归档/取消不进泳道，改出现于底部归档条）', () => {
    const open = makeReq({ id: 'REQ-000001', status: 'done' })
    const archived = makeReq({ id: 'REQ-000002', status: 'archived' })
    const canceled = makeReq({ id: 'REQ-000003', status: 'canceled' })
    const html = buildBoard(makeState({ requirements: [open, archived, canceled] }))
    // done（待归档）归入验收泳道；archived/canceled 不进任何泳道。
    // REQ-261002105242-a3fb FR-1（2026-10-02）：归档条回归——归档/取消需求不再从看板**消失**，
    // 但只出现在底部归档条里。判据因此更精确：泳道段（归档条之前）依旧不含它们，
    // 整页则必须含它们（否则又回到"数据在、入口没了"的老毛病）。
    // 历史断言曾要求 dsh-pm-archived-bar，2026-09-29 因该渲染在基线里缺失被删；本次把它修回来。
    expect(html).toContain('data-lane="accepting"')
    expect(html).toContain('data-req="REQ-000001"')
    const lanesHtml = html.split('data-archived-bar')[0] ?? ''
    expect(lanesHtml).not.toContain('data-req="REQ-000002"')
    expect(lanesHtml).not.toContain('data-req="REQ-000003"')
    expect(html).toContain('data-archived-bar')
    expect(html).toContain('data-req="REQ-000002"')
    expect(html).toContain('data-req="REQ-000003"')
  })

  it('escapes HTML in title (XSS guard)', () => {
    const req = makeReq({ id: 'REQ-000001', title: '<script>alert(1)</script>' })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders blocked/paused/ready flags', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', blocked: true, blockedReason: '依赖未就绪', paused: true })
    const task = makeTask({ id: 't-000001', requirementId: 'REQ-000001', status: 'todo' })
    const html = buildBoard(makeState({
      requirements: [req], tasks: [task], ready: { 'REQ-000001': ['t-000001'] },
    }))
    expect(html).toContain('阻塞')
    expect(html).toContain('暂停')
    expect(html).toContain('1 ready')
    expect(html).toContain('is-blocked')
  })

  it('renders session chip from latest execution', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const task = makeTask({
      id: 't-000001', requirementId: 'REQ-000001', status: 'in_progress',
      executions: [{ id: 'e-1', sessionId: 'session-xyz', trigger: 'manual', startedAt: 1700000000000, outcome: 'running' }],
    })
    const html = buildBoard(makeState({ requirements: [req], tasks: [task] }))
    expect(html).toContain('data-action="jump-session"')
    expect(html).toContain('session-xyz')
  })
})

// -- toReqCards -----------------------------------------------------------

describe('toReqCards', () => {
  it('aggregates done/total/ready per requirement', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const done = makeTask({ id: 't-000001', requirementId: 'REQ-000001', status: 'done' })
    const todo = makeTask({ id: 't-000002', requirementId: 'REQ-000001', status: 'todo' })
    const cards = toReqCards(makeState({
      requirements: [req], tasks: [done, todo], ready: { 'REQ-000001': ['t-000002'] },
    }))
    expect(cards).toHaveLength(1)
    expect(cards[0].doneCount).toBe(1)
    expect(cards[0].totalCount).toBe(2)
    expect(cards[0].readyIds).toEqual(['t-000002'])
  })

  it('filters out archived and canceled requirements', () => {
    const open = makeReq({ id: 'REQ-000001', status: 'draft' })
    const archived = makeReq({ id: 'REQ-000002', status: 'archived' })
    const cards = toReqCards(makeState({ requirements: [open, archived] }))
    expect(cards).toHaveLength(1)
    expect(cards[0].req.id).toBe('REQ-000001')
  })
})

// -- 需求详情 -------------------------------------------------------------

describe('buildReqDetail', () => {
  it('renders title, status, and gate hint for brainstorming', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'brainstorming', title: '评审需求' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('评审需求')
    expect(html).toContain('data-detail-req="REQ-000001"')
    expect(html).toContain('dsh-pm-gate')
    expect(html).toContain('data-action="move-req" data-to="design"')
  })

  it('renders the 真 DAG panel（REQ-260928001915-f978：节点/层号/连线由 canvas 挂载后绘制）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const a = makeTask({ id: 't-000001', requirementId: 'REQ-000001', title: 'A' })
    const b = makeTask({ id: 't-000002', requirementId: 'REQ-000001', title: 'B', dependsOn: ['t-000001'] })
    const c = makeTask({ id: 't-000003', requirementId: 'REQ-000001', title: 'C', dependsOn: ['t-000002'] })
    const html = buildReqDetail(req, [a, b, c])
    // 面板骨架进 HTML（工具条/画布/图例；2026-09-29 裁定 B：标题行与统计条已删）；卡片、L0/L1 层带与连线全部画在
    // <canvas> 内，故不在 HTML 字符串里 —— 数据桥（折叠/层号/边/ready）改由
    // tests/dag-view.test.ts 直接对 buildDagData 断言，不靠 innerHTML 反射。
    expect(html).toContain('dsh-pm-dag-panel')
    expect(html).toContain('id="dag-canvas"')
    expect(html).toContain('data-dag-dir="vertical"')
    expect(html).toContain('data-dag-dir="horizontal"')
    expect(html).toContain('data-dag-toggle="crit"')
    expect(html).toContain('data-dag-toggle="focus"')
    expect(html).not.toContain('data-dag-stat')
  })

  it('renders 暂无任务 when the requirement has no tasks', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    expect(buildReqDetail(req, [])).toContain('暂无任务')
  })

  it('renders task table（REQ-6f39b5：任务列已改为表格，对齐 prototype）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const todo = makeTask({ id: 't-000001', requirementId: 'REQ-000001', status: 'todo', title: '待办任务' })
    const done = makeTask({ id: 't-000002', requirementId: 'REQ-000001', status: 'done', title: '已完成' })
    const html = buildReqDetail(req, [todo, done])
    expect(html).toContain('dsh-pm-task-table')
    expect(html).toContain('dsh-pm-task-status todo')
    expect(html).toContain('dsh-pm-task-status done')
    expect(html).toContain('待办任务')
    expect(html).toContain('已完成')
  })

  it('renders comment form with req target', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('data-action="add-comment" data-target="req" data-id="REQ-000001"')
  })

  it('escapes HTML in description', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', description: '<img onerror=alert(1)>' })
    const html = buildReqDetail(req, [])
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

// -- 任务详情 -------------------------------------------------------------

describe('buildTaskDetail', () => {
  it('renders task attributes and back link to requirement', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const task = makeTask({
      id: 't-000001', requirementId: 'REQ-000001', title: '任务A',
      phase: 'test', side: 'backend', acceptance: '单测全过',
      executions: [{ id: 'e-1', sessionId: 's-1', trigger: 'auto', startedAt: 1700000000000, outcome: 'succeeded', evidence: ['tests/output.log'] }],
    })
    const html = buildTaskDetail(task, req)
    expect(html).toContain('任务A')
    expect(html).toContain('data-detail-task="t-000001"')
    expect(html).toContain('data-action="back-req" data-req="REQ-000001"')
    expect(html).toContain('测试') // phase label
    expect(html).toContain('单测全过')
    expect(html).toContain('data-outcome="succeeded"')
    expect(html).toContain('tests/output.log')
    expect(html).toContain('data-action="jump-session" data-sid="s-1"')
  })

  it('renders comment form with task target', () => {
    const task = makeTask({ id: 't-000001' })
    const html = buildTaskDetail(task, undefined)
    expect(html).toContain('data-action="add-comment" data-target="task" data-id="t-000001"')
  })
})

// -- 空态/错误 ------------------------------------------------------------

describe('buildEmpty / buildError', () => {
  it('buildEmpty shows hint', () => {
    expect(buildEmpty()).toContain('暂无数据')
  })

  it('buildError escapes message', () => {
    expect(buildError('<script>')).not.toContain('<script>')
    expect(buildError('网络错误')).toContain('网络错误')
  })
})

// -- 窗口 ↔ 需求关联（sourceSessionId chip）---------------------------------

describe('窗口关联可见性', () => {
  it('卡片渲染来源窗口 chip（窗口码 w-xxxxxxxx + 跳转 data-sid）', () => {
    const req = makeReq({ sourceSessionId: 'session-1cee2467-95f9-46ec-9cd8-8577932e7060' })
    const html = buildBoard(makeState({ requirements: [req] }))
    expect(html).toContain('data-action="jump-session"')
    expect(html).toContain('data-sid="session-1cee2467-95f9-46ec-9cd8-8577932e7060"')
    expect(html).toContain('窗口 w-1cee2467')
  })

  it('人工建卡（无 sourceSessionId）不渲染窗口 chip', () => {
    const html = buildBoard(makeState({ requirements: [makeReq()] }))
    expect(html).not.toContain('dsh-pm-window')
  })

  it('列表视图：操作列不再重复「会话」按钮（负责人 chip 已是同一跳转）', () => {
    // 2026-09-30 用户裁定：负责人列的窗口 chip 本身可点跳会话，「操作」列的会话按钮重复，已删
    const sid = 'session-w-b7c52392'
    const req = makeReq({ sourceSessionId: sid })
    const html = buildListView(makeState({ requirements: [req] }), 1700000000000)
    const row = html.slice(html.indexOf('dsh-pm-list-row'))
    expect(row).not.toContain('>会话<')
    // 跳转能力保留：整行恰好一处 jump-session（负责人 chip）
    expect((row.match(/jump-session/g) ?? []).length).toBe(1)
    expect(row).toContain(`data-sid="${sid}"`)
    // 操作列只剩卡面推进按钮
    const actions = row.slice(row.indexOf('dsh-pm-list-actions'))
    expect(actions).not.toContain('jump-session')
  })

  it('详情页头部也显示来源窗口 chip', () => {
    const req = makeReq({ sourceSessionId: 'session-ac92e536-f709-466d-a5dd-aead9e70f6f7' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('窗口 w-ac92e536')
    expect(html).toContain('data-sid="session-ac92e536-f709-466d-a5dd-aead9e70f6f7"')
  })

  it('draft 需求给出「提交评审」人工入口（自动推进之外的兜底）', () => {
    const html = buildReqDetail(makeReq({ status: 'draft' }), [])
    expect(html).toContain('data-action="move-req"')
    expect(html).toContain('data-to="brainstorming"')
  })
})
describe('评审态人工回退口', () => {
  it('brainstorming 详情同时给出「→ 设计」与「退回立项」（REQ-6f39b5：对齐 REQ_TRANSITIONS brainstorming>design）', () => {
    const html = buildReqDetail(makeReq({ status: 'brainstorming' }), [])
    expect(html).toContain('data-to="design"')
    expect(html).toContain('data-to="draft"')
  })
})
describe('泳道卡面操作按钮（不进详情页即可推进）', () => {
  const actionsOf = (status: RequirementStatus): string =>
    buildBoard(makeState({ requirements: [makeReq({ status })] }))

  it('draft 卡面给「开始需求分析」并带 data-id（卡面直连 move-req）', () => {
    const html = actionsOf('draft')
    expect(html).toContain('dsh-pm-card-actions')
    expect(html).toContain('data-action="move-req"')
    expect(html).toContain('data-to="brainstorming"')
    expect(html).toMatch(/data-id="REQ-\d{6}"/)
    expect(html).toContain('→ 需求分析') // REQ-6f39b5：按钮统一「→ 下一阶段」格式
  })

  it('每个状态给出对应动作：→ 设计 / → 拆分 / → 实施 / → 验收 / → 归档（REQ-6f39b5 箭头格式 + REQ-9f4a44 验收直归档）', () => {
    expect(actionsOf('brainstorming')).toContain('data-to="design"') // 需求分析 → 设计
    expect(actionsOf('design')).toContain('data-to="decomposing"') // 设计 → 拆分
    expect(actionsOf('decomposing')).toContain('data-to="implementing"')
    expect(actionsOf('implementing')).toContain('data-to="accepting"')
    expect(actionsOf('accepting')).toContain('data-to="archived"') // REQ-9f4a44：验收通过直接归档
    expect(actionsOf('done')).not.toContain('data-action="move-req"') // done 为 legacy 死状态，不给操作
  })

  it('卡面按钮 data-id 指向该卡自身需求（多卡互不串）', () => {
    const a = makeReq({ status: 'draft' })
    const b = makeReq({ status: 'accepting' })
    const html = buildBoard(makeState({ requirements: [a, b] }))
    expect(html).toContain(`data-id="${a.id}"`)
    expect(html).toContain(`data-id="${b.id}"`)
  })

  it('归档/取消态不进泳道，无卡面按钮', () => {
    const html = buildBoard(makeState({ requirements: [makeReq({ status: 'archived' })] }))
    expect(html).not.toContain('dsh-pm-card-actions')
  })
})
describe('卡面按钮视觉一致性（复用 .dsh-pm-btn 体系）', () => {
  it('卡面按钮使用 dsh-pm-btn（与页头/详情页同款），不引入第二套按钮样式', () => {
    const html = buildBoard(makeState({ requirements: [makeReq({ status: 'draft' })] }))
    expect(html).toContain('class="dsh-pm-btn sm primary"')
    expect(html).not.toContain('dsh-pm-card-btn')
  })
})

// ---------------------------------------------------------------------------
// 时间线 / 甘特图 / 任务页（用户反馈：需求没有对应的时间、拆分是不是真拆、有没有任务页）
// ---------------------------------------------------------------------------

const T0 = 1700000000000 // 固定基准，避免测试依赖当前时间
const HOUR = 3600_000

describe('需求时间线（各状态进入时间 + 停留时长）', () => {
  const hist = [
    { status: 'draft', at: T0, by: { kind: 'human' as const } },
    { status: 'brainstorming', at: T0 + HOUR, by: { kind: 'system' as const } },
    { status: 'decomposing', at: T0 + 3 * HOUR, by: { kind: 'agent' as const, sessionId: 'session-1cee2467-x' } },
  ]

  it('泳道卡面直接显示创建时间与当前态停留时长', () => {
    const req = makeReq({ status: 'decomposing', statusHistory: hist })
    const html = buildBoard(makeState({ requirements: [req] }), T0 + 5 * HOUR)
    expect(html).toContain('dsh-pm-card-time')
    expect(html).toContain('创建 ')
    expect(html).toContain('已停留 2 小时 0 分')
  })

  it('详情页时间线：7 个里程碑齐全（含需求分析/设计，无完成节点）、未到达显「—」、窗口码与停留时长可见', () => {
    const req = makeReq({ status: 'decomposing', statusHistory: hist })
    const html = buildReqDetail(req, [], T0 + 5 * HOUR)
    expect(html).toContain('dsh-pm-timeline')
    for (const label of ['立项', '需求分析', '设计', '拆分', '实施', '验收', '归档']) { // REQ-6f39b5：7 态（用户裁定去掉 done/完成节点）
      expect(html).toContain(label)
    }
    expect(html).toContain('dsh-pm-tl-row pending') // 未到达的里程碑
    expect(html).toContain('停留 2 小时 0 分') // draft → brainstorming 段
    expect(html).toContain('w-1cee2467') // 操作者窗口码
    expect(html).toContain('至今') // 未完结的需求统计到当前时刻
  })

  it('回填事件显式标注「回填」（不把推导值伪装成原始记录）', () => {
    const req = makeReq({
      status: 'brainstorming',
      statusHistory: [
        { status: 'draft', at: T0, by: { kind: 'human' }, inferred: true },
        { status: 'brainstorming', at: T0 + HOUR, by: { kind: 'system' }, inferred: true },
      ],
    })
    expect(buildReqDetail(req, [], T0 + 2 * HOUR)).toContain('回填')
  })

  it('老记录无 statusHistory → 只渲染「创建 + 由 updatedAt 推导的当前态」，中间态留空（不编造）', () => {
    const req = makeReq({ status: 'implementing' })
    const html = buildReqDetail(req, [], T0 + HOUR)
    expect(html).toContain('dsh-pm-timeline')
    // 7 个里程碑 - 已知 2 个（立项/实施）= 5 个未到达
    expect(html.match(/dsh-pm-tl-row pending/g)?.length).toBe(5) // 7 个里程碑 - 已知 2 个（立项/实施）
    expect(html).toContain('回填')
    // 评审/拆分等中间态必须是「—」，不得按时间戳插值编造出精确时间
    expect(html).toContain('data-status="brainstorming"><span class="dsh-pm-tl-label">需求分析</span><span class="dsh-pm-tl-time">—</span>')
    expect(html).toContain('data-status="decomposing"><span class="dsh-pm-tl-label">拆分</span><span class="dsh-pm-tl-time">—</span>')
  })

  it('任务详情也有时间线（含执行段耗时）', () => {
    const t = makeTask({
      status: 'done',
      updatedAt: T0 + 2 * HOUR,
      statusHistory: [
        { status: 'todo', at: T0, by: { kind: 'agent' } },
        { status: 'in_progress', at: T0 + HOUR, by: { kind: 'agent' } },
        { status: 'done', at: T0 + 2 * HOUR, by: { kind: 'agent' } },
      ],
    })
    const html = buildTaskDetail(t, undefined, T0 + 3 * HOUR)
    expect(html).toContain('时间线')
    expect(html).toContain('停留 1 小时 0 分')
  })
})

describe('甘特图与任务页（拆分可视化）', () => {
  function fixture() {
    const req = makeReq({
      id: 'REQ-abc123',
      title: '看板需求',
      status: 'implementing',
      statusHistory: [
        { status: 'draft', at: T0, by: { kind: 'human' } },
        { status: 'brainstorming', at: T0 + HOUR, by: { kind: 'system' } },
        { status: 'decomposing', at: T0 + 2 * HOUR, by: { kind: 'agent' } },
        { status: 'implementing', at: T0 + 3 * HOUR, by: { kind: 'system' } },
      ],
    })
    const t1 = makeTask({
      id: 't-000001', requirementId: req.id, title: '协议层加时间线', phase: 'doc', side: 'doc',
      status: 'done', createdAt: T0 + 2 * HOUR, updatedAt: T0 + 4 * HOUR,
      statusHistory: [
        { status: 'todo', at: T0 + 2 * HOUR, by: { kind: 'agent' } },
        { status: 'in_progress', at: T0 + 3 * HOUR, by: { kind: 'agent' } },
        { status: 'done', at: T0 + 4 * HOUR, by: { kind: 'agent' } },
      ],
    })
    const t2 = makeTask({
      id: 't-000002', requirementId: req.id, title: '客户端甘特图', phase: 'ui', side: 'frontend',
      dependsOn: ['t-000001'], status: 'in_progress', createdAt: T0 + 4 * HOUR, updatedAt: T0 + 5 * HOUR,
      statusHistory: [
        { status: 'todo', at: T0 + 4 * HOUR, by: { kind: 'agent' } },
        { status: 'in_progress', at: T0 + 5 * HOUR, by: { kind: 'agent' } },
      ],
    })
    return { req, t1, t2, now: T0 + 6 * HOUR }
  }

  it('任务页：按需求分组 + 里程碑条 + 甘特图 + 任务表（含耗时列）', () => {
    const { req, t1, t2, now } = fixture()
    const html = buildTasksPage(makeState({ requirements: [req], tasks: [t1, t2] }), now)
    expect(html).toContain('任务')
    expect(html).toContain('dsh-pm-tasks-group')
    expect(html).toContain('REQ-abc123')
    expect(html).toContain('dsh-pm-strip-item')
    expect(html).toContain('dsh-pm-gantt')
    expect(html).toContain('dsh-pm-ttable')
    expect(html).toContain('共 2 小时 0 分') // t1 已完成的真实耗时
    expect(html).toContain('已用 2 小时 0 分') // t2 进行中（创建至今）
    expect(html).toContain('data-action="open-task"')
  })

  it('任务页空态给出两种真实来源（人工建卡 / agent 真拆分）', () => {
    const html = buildTasksPage(makeState({ requirements: [makeReq()] }), T0)
    expect(html).toContain('还没有任务')
    expect(html).toContain('reqboard_decompose')
  })

  it('任务页与甘特图中的用户文本经转义（XSS 防线不因新视图失效）', () => {
    const { req, t1, now } = fixture()
    const evil = { ...t1, title: '<img src=x onerror=alert(1)>' }
    const html = buildTasksPage(makeState({ requirements: [req], tasks: [evil] }), now)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})

// ---------------------------------------------------------------------------
// 拆分计划（plan mode）——人在这里唯一需要动手的地方
// ---------------------------------------------------------------------------

describe('拆分计划卡面徽章（plan mode；REQ-6f39b5：详情页计划卡已删，徽章保留在泳道卡片）', () => {
  const basePlan = {
    path: 'docs/requirements/REQ-abc123/plan.md',
    summary: '目标：加计划模式；做法：先提交计划再拆',
    tasks: [{ key: 'proto', title: '协议层加计划字段', phase: 'implement' as const, side: 'backend' as const, acceptance: 'protocol.ts 单测绿' }],
    submittedAt: T0,
    submittedBy: { kind: 'agent' as const, sessionId: 'session-1cee2467-x' },
  }

  it('卡面徽章：待批 / 已批 / 被退 三态可见', () => {
    const pending = makeReq({ id: 'REQ-abc123', status: 'brainstorming', plan: basePlan })
    expect(buildBoard(makeState({ requirements: [pending] }), T0)).toContain('计划待批')

    const approved = makeReq({ id: 'REQ-abc123', status: 'decomposing', plan: { ...basePlan, approvedAt: T0 + HOUR, approvedBy: { kind: 'human' as const } } })
    expect(buildBoard(makeState({ requirements: [approved] }), T0)).toContain('计划已批')

    const rejected = makeReq({ id: 'REQ-abc123', status: 'brainstorming', plan: { ...basePlan, rejectedAt: T0 + HOUR, rejectedReason: '验收标准太虚，重写' } })
    expect(buildBoard(makeState({ requirements: [rejected] }), T0)).toContain('计划被退')
  })
})

// ---------------------------------------------------------------------------
// 验收（人工审核）与归档（文档合并）—— 交付的后半程
// ---------------------------------------------------------------------------

describe('验收区与归档区', () => {
  it('没有验收材料时说明要交什么（不是空白）', () => {
    const html = buildReqDetail(makeReq({ status: 'accepting' }), [], T0)
    expect(html).toContain('验收（人工审核）')
    expect(html).toContain('reqboard_verify_submit')
    expect(html).toContain('人工审核前需要证据')
  })

  it('待人工审核：证据逐条展示 + 通过/退回按钮 + 卡面「待人工审核」', () => {
    const req = makeReq({
      status: 'accepting',
      verification: {
        summary: '时间线/甘特图已上线',
        evidence: ['pnpm vitest run → 178 passed / 14 files', '截图 /tmp/board.png'],
        submittedAt: T0,
        submittedBy: { kind: 'agent' as const, sessionId: 'session-1cee2467-x' },
      },
    })
    const detail = buildReqDetail(req, [], T0 + HOUR)
    expect(detail).toContain('data-state="pending"')
    expect(detail).toContain('待人工审核')
    expect(detail).toContain('178 passed')
    expect(detail).toContain('data-action="verify-pass"')
    expect(detail).toContain('data-action="verify-rework"')
    expect(buildBoard(makeState({ requirements: [req] }), T0)).toContain('待人工审核')
  })

  it('人工审核通过：显示通过时间与意见，按钮消失', () => {
    const req = makeReq({
      status: 'done',
      verification: {
        summary: '已上线', evidence: ['npm test'], submittedAt: T0,
        submittedBy: { kind: 'agent' as const }, reviewedAt: T0 + HOUR, reviewedBy: { kind: 'human' as const }, decision: 'pass' as const,
      },
    })
    const detail = buildReqDetail(req, [], T0 + 2 * HOUR)
    expect(detail).toContain('data-state="pass"')
    expect(detail).not.toContain('data-action="verify-pass"')
  })

  it('退回返工：审核意见原样展示', () => {
    const req = makeReq({
      status: 'implementing',
      verification: {
        summary: '做完了', evidence: ['npm test'], submittedAt: T0, submittedBy: { kind: 'agent' as const },
        reviewedAt: T0 + HOUR, reviewedBy: { kind: 'human' as const }, decision: 'rework' as const, reviewNote: '甘特图缺依赖连线',
      },
    })
    const detail = buildReqDetail(req, [], T0 + 2 * HOUR)
    expect(detail).toContain('已退回返工')
    expect(detail).toContain('审核意见：甘特图缺依赖连线')
  })

  it('归档区：材料已备时列目录/文档/合并去向/索引，并给出人工归档按钮；归档后按钮消失', () => {
    const archive = {
      dir: 'agent-dh/docs/requirements/REQ-abc123',
      docs: [
        { kind: 'requirement' as const, path: 'agent-dh/docs/requirements/REQ-abc123/requirement.md' },
        { kind: 'verification' as const, path: 'agent-dh/docs/requirements/REQ-abc123/verification.md' },
      ],
      mergedInto: ['agent-dh/docs/architecture/requirement-board.md'],
      indexEntry: '需求看板加时间线与计划模式',
      submittedAt: T0,
      submittedBy: { kind: 'agent' as const },
    }
    const ready = makeReq({ status: 'done', archive })
    const detail = buildReqDetail(ready, [], T0 + HOUR)
    expect(detail).toContain('agent-dh/docs/requirements/REQ-abc123')
    // REQ-260922182638-0777 FR-2：归档清单 requirement 由漂移的「需求说明」统一为「需求文档」
    expect(detail).toContain('需求文档')
    expect(detail).toContain('agent-dh/docs/architecture/requirement-board.md')
    expect(detail).toContain('索引条目：需求看板加时间线与计划模式')
    // REQ-261002105242-a3fb FR-4：归档按钮随服务端端点（REQ-9f4a44 移除 POST /req/archive）一起下线
    expect(detail).not.toContain('data-action="archive-req"')
    expect(buildBoard(makeState({ requirements: [ready] }), T0)).toContain('待归档')

    // REQ-261006123819-3af3 FR-3（D-2）：已归档判据 = 需求状态 + statusHistory 的 archived 事件。
    // 原夹具用**没有写入者**的归档时间字段"证明"已归档态——正是本次要修的无覆盖形态。
    const archived = makeReq({
      status: 'archived',
      statusHistory: [{ status: 'archived', at: T0 + HOUR, by: { kind: 'human' as const } }],
      archive,
    })
    const doneHtml = buildReqDetail(archived, [], T0 + 2 * HOUR)
    expect(doneHtml).toContain('已归档')
    expect(doneHtml).toContain('已归档 ' + fmtTime(T0 + HOUR))
    expect(doneHtml).not.toContain('data-action="archive-req"')
  })

  it('未备材料时指向规范文档（人要知道去哪儿看规则）', () => {
    const detail = buildReqDetail(makeReq({ status: 'done' }), [], T0)
    expect(detail).toContain('reqboard_archive_submit')
    expect(detail).toContain('agent-dh/docs/architecture/requirement-archive.md')
  })

  it('归档区展示说明书更新点（金字塔向上生长）；无更新时显示理由', () => {
    const base = {
      dir: 'agent-dh/docs/requirements/REQ-abc123',
      docs: [{ kind: 'requirement' as const, path: 'agent-dh/docs/requirements/REQ-abc123/requirement.md' }],
      mergedInto: ['agent-dh/docs/architecture/requirement-board.md'],
      indexEntry: '看板加时间线',
      submittedAt: T0,
      submittedBy: { kind: 'agent' as const },
    }
    const withManual = makeReq({
      status: 'done',
      archive: { ...base, manualUpdates: [{ path: 'docs/architecture/project-manual.md', section: '术语表', summary: '新增两个术语指针' }] },
    })
    const html = buildReqDetail(withManual, [], T0)
    expect(html).toContain('项目说明书更新（金字塔向上生长）')
    expect(html).toContain('docs/architecture/project-manual.md')
    expect(html).toContain('新增两个术语指针')

    const noManual = makeReq({ status: 'done', archive: { ...base, manualNote: '纯维护，不改项目认知' } })
    expect(buildReqDetail(noManual, [], T0)).toContain('无（纯维护，不改项目认知）')
  })

})


// ---------------------------------------------------------------------------
// REQ-31e11f t8：buildReqDetail 阶段导航（7 节点点击入口）
// ---------------------------------------------------------------------------

describe('buildReqDetail 进度点与 Tab（REQ-6f39b5，替代 REQ-31e11f 节点导航）', () => {
  it('渲染 8 态进度点（含归档），当前态高亮', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('dsh-pm-progress-dots')
    // 8 个进度点
    const dots = html.match(/dsh-pm-dot-wrapper/g)
    expect(dots).not.toBeNull()
    expect(dots!.length).toBe(8)
    // 当前态（实施）高亮
    expect(html).toContain('dsh-pm-dot-wrapper current')
    // 已完成态
    expect(html).toContain('dsh-pm-dot-wrapper completed')
    // 含归档节点标签
    expect(html).toContain('归档')
  })

  it('渲染 4 个 Tab 与对应内容区（概览默认 active）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('dsh-pm-tabs')
    expect(html).toContain('data-action="switch-tab"')
    expect(html).toContain('data-tab="overview"')
    expect(html).toContain('data-tab="execution"')
    expect(html).toContain('data-tab="timeline"')
    expect(html).toContain('data-tab="archive"')
    // 4 个内容区，概览默认显示
    expect(html).toContain('data-tab-content="overview"')
    expect(html).toContain('data-tab-content="execution"')
    expect(html).toContain('data-tab-content="timeline"')
    expect(html).toContain('data-tab-content="archive"')
    expect(html).toContain('dsh-pm-tab-content active')
  })

  it('含 stage-detail-container（节点详情渲染容器）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const html = buildReqDetail(req, [])
    expect(html).toContain('dsh-pm-stage-detail-container')
  })
})

// ── 立项取消按钮（2026-09-20：更名置首 + 全在途态渲染，REQ-6cbbf7 解锁配套）──
describe('立项取消按钮', () => {
  it('decomposing 详情含「立项取消」且排在「→ 实施」之前', () => {
    const html = buildReqDetail(makeReq({ status: 'decomposing' }), [])
    expect(html).toContain('立项取消')
    expect(html).toContain('→ 实施')
    expect(html.indexOf('立项取消')).toBeLessThan(html.indexOf('→ 实施'))
  })
  it('全部在途态均渲染「立项取消」（draft/brainstorming/design/decomposing/implementing/accepting）', () => {
    for (const s of ['draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting'] as const) {
      expect(buildReqDetail(makeReq({ status: s }), [])).toContain('立项取消')
    }
  })
  it('终态不渲染「立项取消」（done/canceled/archived）', () => {
    for (const s of ['done', 'canceled', 'archived'] as const) {
      expect(buildReqDetail(makeReq({ status: s }), [])).not.toContain('立项取消')
    }
  })
})

// ── 运行中指示（REQ-261004210128-283d t2/t4 · TC-08～TC-10）· serves: FR-3, FR-4, FR-8 ──
describe('运行中指示（泳道卡 + 列表行）', () => {
  const running = (sid: string) => new Set<string>([sid])

  it('TC-08 传 running 集合：泳道卡出现 data-running 恰 1 次，且带 aria-label', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
    const html = buildBoard(makeState({ requirements: [req] }), 1, 'lanes', {}, undefined, running('s-a'))
    expect(html.split('data-running="true"').length - 1).toBe(1)
    expect(html).toContain('aria-label="会话进行中"')
    // 幂等：同输入两次调用结果逐字节相等
    const again = buildBoard(makeState({ requirements: [req] }), 1, 'lanes', {}, undefined, running('s-a'))
    expect(again).toBe(html)
  })

  it('TC-09 省略 running 参数：输出与不含指示的版本逐字节一致（旧调用点零回归）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
    const state = makeState({ requirements: [req] })
    expect(buildBoard(state, 1)).toBe(buildBoard(state, 1, 'lanes', {}, undefined, new Set()))
    expect(buildBoard(state, 1)).not.toContain('data-running')
  })

  it('TC-09b 无关会话在跑：该需求不出指示（不误报）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
    const html = buildBoard(makeState({ requirements: [req] }), 1, 'lanes', {}, undefined, running('s-other'))
    expect(html).not.toContain('data-running')
  })

  it('TC-09c 人工建卡（无窗口绑定）：不出指示，也不出空壳', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing' })
    const html = buildBoard(makeState({ requirements: [req] }), 1, 'lanes', {}, undefined, running('s-a'))
    expect(html).not.toContain('data-running')
  })

  it('TC-09d 多席位：worker 在跑也出指示（席位权威）', () => {
    const req = makeReq({
      id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-owner',
      seats: [
        { windowKey: 's-owner', role: 'owner', joinedAt: 1 },
        { windowKey: 's-worker', role: 'worker', joinedAt: 1 },
      ],
    })
    const html = buildBoard(makeState({ requirements: [req] }), 1, 'lanes', {}, undefined, running('s-worker'))
    expect(html).toContain('data-running="true"')
  })

  it('TC-10 列表视图：同一需求出现同款指示；泳道与列表同时出现/消失', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
    const state = makeState({ requirements: [req] })
    const listOn = buildBoard(state, 1, 'list', {}, undefined, running('s-a'))
    const listOff = buildBoard(state, 1, 'list', {}, undefined, new Set())
    expect(listOn).toContain('data-running="true"')
    expect(listOff).not.toContain('data-running')
    // 与泳道同判据：同一集合下两处表现一致
    expect(buildBoard(state, 1, 'lanes', {}, undefined, running('s-a'))).toContain('data-running="true"')
  })
})

// ── 运行中指示的样式契约（REQ-261004210128-283d t4 · A9 的自动化锚点）· serves: FR-7 ──
describe('运行中指示样式（动效偏好与主题令牌）', () => {
  it('样式分片含指示规则、旋转关键帧与 prefers-reduced-motion 降级分支', async () => {
    const { BOARD_CSS } = await import('../src/client/styles/board.ts')
    expect(BOARD_CSS).toContain('.dsh-pm-running')
    expect(BOARD_CSS).toContain('@keyframes dsh-pm-running-spin')
    expect(BOARD_CSS).toContain('prefers-reduced-motion: reduce')
    // 降级分支里必须点名弧线动画（否则「减少动效」下仍在转）
    const reduced = BOARD_CSS.slice(BOARD_CSS.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain('.dsh-pm-running-arc')
    expect(reduced).toContain('animation: none')
    // 颜色跟随主题：描边用 currentColor；容器颜色取主题令牌 var(--dsw-…)（不裸写十六进制当主色）
    const strokeRule = BOARD_CSS.slice(BOARD_CSS.indexOf('.dsh-pm-running-track,'), BOARD_CSS.indexOf('.dsh-pm-running-track {'))
    expect(strokeRule).toContain('currentColor')
    const colorRule = BOARD_CSS.slice(BOARD_CSS.indexOf('.dsh-pm-running {'), BOARD_CSS.indexOf('.dsh-pm-running-svg'))
    expect(colorRule).toMatch(/color:\s*var\(--dsw-/)
  })
})

// ── 运行中指示的位置契约（2026-10-04 用户裁定：两个视图都紧跟项目 ID）· serves: FR-3, FR-4 ──
describe('运行中指示的位置（泳道卡与列表行都紧跟项目 ID）', () => {
  const req = () => makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
  const busy = new Set(['s-a'])
  /** 圆圈紧跟 ID（两个视图共用同一邻接形状）。 */
  const idThenDot = '<span class="dsh-pm-card-id">REQ-000001</span><span class="dsh-pm-running"'

  it('泳道卡：圆圈紧跟项目 ID（在卡面顶部那行内，不在窗口 chip 行）', () => {
    const html = buildBoard(makeState({ requirements: [req()] }), 1, 'lanes', {}, undefined, busy)
    expect(html).toContain(idThenDot)
    const iDot = html.indexOf('data-running="true"')
    const iTitle = html.indexOf('dsh-pm-card-title')
    const iWindow = html.indexOf('dsh-pm-window')
    expect(iDot).toBeGreaterThan(-1)
    expect(iDot).toBeLessThan(iTitle)    // 在卡面顶部那行内（标题之前）
    expect(iDot).toBeLessThan(iWindow)   // 排在窗口 chip 之前
    // 顶部那行确实包含它
    const top = html.slice(html.indexOf('dsh-pm-card-top'), iTitle)
    expect(top).toContain('data-running="true"')
  })

  it('列表行：圆圈紧跟在项目 ID 之后（ID 单元格内）', () => {
    const html = buildBoard(makeState({ requirements: [req()] }), 1, 'list', {}, undefined, busy)
    expect(html).toContain(idThenDot)
    // 标题列不再有圆圈
    const titleCell = html.slice(html.indexOf('dsh-pm-td-title'), html.indexOf('dsh-pm-col-cat'))
    expect(titleCell).not.toContain('data-running="true"')
  })
})

// ── 后台 run 在跑（推进锁）· REQ-261005213603-eaed t2 · TC-11～TC-18 ──────────
// serves: FR-1, FR-3, FR-4, FR-5
describe('推进锁接进渲染（锁新鲜也点亮，两种成因只差文案）', () => {
  const NOW = 1_800_000_000_000
  const STALE = LIMITS.advanceLockStaleMs
  const noSessions = new Set<string>()

  /** 该需求的锁新鲜（后台 run 在跑），但没有任何会话在跑回合。 */
  const lockedReq = (over: Partial<RequirementRecord> = {}) =>
    makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a', advanceLockAt: NOW - 60_000, ...over })

  it('TC-11 仅锁新鲜 → 泳道卡出圈，且文案是后台 run 成因', () => {
    const html = buildBoard(makeState({ requirements: [lockedReq()] }), NOW, 'lanes', {}, undefined, noSessions)
    expect(html).toContain('data-running="true"')
    expect(html).toContain('aria-label="后台 run 进行中"')
    expect(html).toContain('title="后台 run 进行中（子卡链在执行，窗口可以已空闲）"')
  })

  it('TC-12 会话在跑 + 锁也新鲜 → 恰好一个圈，且报会话成因（成因优先级）', () => {
    const html = buildBoard(makeState({ requirements: [lockedReq()] }), NOW, 'lanes', {}, undefined, new Set(['s-a']))
    expect(html.split('data-running="true"').length - 1).toBe(1)
    expect(html).toContain('aria-label="会话进行中"')
    expect(html).not.toContain('aria-label="后台 run 进行中"')
  })

  it('TC-13 锁恰好过期（now-15min）→ 不出圈', () => {
    const html = buildBoard(makeState({ requirements: [lockedReq({ advanceLockAt: NOW - STALE })] }), NOW, 'lanes', {}, undefined, noSessions)
    expect(html).not.toContain('data-running')
  })

  it('TC-14 无 advanceLockAt 且省略 running 参数 → 与空集版本逐字节一致（旧调用点零回归）', () => {
    const req = makeReq({ id: 'REQ-000001', status: 'implementing', sourceSessionId: 's-a' })
    const state = makeState({ requirements: [req] })
    expect(buildBoard(state, NOW)).toBe(buildBoard(state, NOW, 'lanes', {}, undefined, new Set()))
    expect(buildBoard(state, NOW)).not.toContain('data-running')
  })

  it('TC-15 同页 A 持锁、B 不持锁 → 只有 A 出圈（判据不串需求）', () => {
    const a = lockedReq({ id: 'REQ-000001' })
    const b = makeReq({ id: 'REQ-000002', status: 'implementing', sourceSessionId: 's-b' })
    const html = buildBoard(makeState({ requirements: [a, b] }), NOW, 'lanes', {}, undefined, noSessions)
    const cardA = html.slice(html.indexOf('data-req="REQ-000001"'), html.indexOf('data-req="REQ-000002"'))
    const cardB = html.slice(html.indexOf('data-req="REQ-000002"'))
    expect(cardA).toContain('data-running="true"')
    expect(cardB).not.toContain('data-running')
  })

  it('TC-16 列表行同款指示：ID 单元格内出圈、标题列不出', () => {
    const html = buildBoard(makeState({ requirements: [lockedReq()] }), NOW, 'list', {}, undefined, noSessions)
    expect(html).toContain('<span class="dsh-pm-card-id">REQ-000001</span><span class="dsh-pm-running"')
    expect(html).toContain('aria-label="后台 run 进行中"')
    const titleCell = html.slice(html.indexOf('dsh-pm-td-title'), html.indexOf('dsh-pm-col-cat'))
    expect(titleCell).not.toContain('data-running="true"')
  })

  it('TC-17 位置契约不回归：圆圈仍紧跟项目 ID（泳道卡）', () => {
    const html = buildBoard(makeState({ requirements: [lockedReq()] }), NOW, 'lanes', {}, undefined, noSessions)
    expect(html).toContain('<span class="dsh-pm-card-id">REQ-000001</span><span class="dsh-pm-running"')
    const iDot = html.indexOf('data-running="true"')
    expect(iDot).toBeGreaterThan(-1)
    expect(iDot).toBeLessThan(html.indexOf('dsh-pm-card-title'))
  })

  it('TC-18 样式分片未被本次改动波及（DOM 形状与动效规则仍在）', async () => {
    const { BOARD_CSS } = await import('../src/client/styles/board.ts')
    expect(BOARD_CSS).toContain('.dsh-pm-running')
    expect(BOARD_CSS).toContain('@keyframes dsh-pm-running-spin')
    const html = buildBoard(makeState({ requirements: [lockedReq()] }), NOW, 'lanes', {}, undefined, noSessions)
    // 两种成因共用同一棵树：只有文案不同，SVG 与 class 一字不动
    expect(html).toContain('<circle class="dsh-pm-running-track" cx="8" cy="8" r="6" />')
    expect(html).toContain('<circle class="dsh-pm-running-arc" cx="8" cy="8" r="6" />')
  })
})
