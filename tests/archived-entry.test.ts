/**
 * 归档需求在看板的入口与只读详情（REQ-261002105242-a3fb）—— A1–A6 断言全表。 · serves: FR-1, FR-2, FR-3, FR-4, FR-5
 *
 * 为什么用模块命名空间 import（`import * as board`）而不是具名 import：
 * 本文件是**修前必红**证据的载体——契约函数尚不存在时，具名 import 会让整个文件在模块层面炸掉，
 * 所有用例一起变红，看不出"哪条判据真的没被满足"。命名空间 import 让每条用例各自失败：
 * A1-1/A1-3/A1-4/A6 由 t1（契约卡）翻绿，A1-2/A2/A4 由 t2（接线卡）翻绿，A3 由 t3 翻绿，A5 由 t4 翻绿。
 *
 * 纯字符串断言，零 DOM、零 IO（与 tests/client-view.test.ts 同款纪律）。
 */
import { describe, it, expect } from 'vitest'
import * as board from '../src/client/views/board.ts'
import * as api from '../src/client/api.ts'
import { buildReqDetail } from '../src/client/view.ts'
import { renderArchiveSection } from '../src/client/views/verification.ts'
import type { BoardState, RequirementRecord, TaskRecord } from '../src/client/types.ts'

const T0 = 1700000000000
const HOUR = 3600000

let seq = 0
const rid = (p: string) => `${p}-${String(++seq).padStart(6, '0')}`

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: rid('REQ'), title: '需求', description: '', status: 'draft',
    blocked: false, comments: [], version: 1,
    createdAt: T0, updatedAt: T0,
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
    createdAt: T0, updatedAt: T0,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  }
}

function makeState(over: Partial<BoardState> = {}): BoardState {
  return { revision: 1, requirements: [], tasks: [], ready: {}, ...over }
}

/** 归档材料的完整形状（A3/A5 用）。 */
function makeArchive(over: Record<string, unknown> = {}): RequirementRecord['archive'] {
  return {
    dir: 'docs/requirements/REQ-x', docs: [], mergedInto: ['docs/architecture/project-manual.md'],
    indexEntry: '一句话结论', submittedAt: T0, submittedBy: { kind: 'agent' },
    ...over,
  } as RequirementRecord['archive']
}

/** 未批准的计划（A3 的反例来源：canceled 需求若有未批准计划，改造前会渲染「批准计划」）。 */
function makeUnapprovedPlan(): RequirementRecord['plan'] {
  return {
    path: 'docs/requirements/REQ-x/decomposition.md', summary: '计划摘要', tasks: [],
    submittedAt: T0, submittedBy: { kind: 'agent' },
  }
}

// ---------------------------------------------------------------------------
// A1 归档条（FR-1）
// ---------------------------------------------------------------------------

describe('A1 归档条', () => {
  it('A1-1 渲染 data-archived-bar / 计数 / 折叠 / open-req chip', () => {
    const arch = makeReq({ id: 'REQ-ARC-1', status: 'archived', title: '已归档的需求', updatedAt: T0 + HOUR })
    const state = makeState({
      requirements: [arch],
      tasks: [
        makeTask({ requirementId: 'REQ-ARC-1', status: 'done' }),
        makeTask({ requirementId: 'REQ-ARC-1', status: 'done' }),
      ],
    })

    const html = board.renderArchivedBar(board.toTerminalCards(state))

    expect(html).toContain('data-archived-bar')
    expect(html).toContain('data-archived-count="1"')
    // 折叠 = <details> 标签里没有 open 属性（不能用 not.toContain('open')——会撞上 open-req）
    const detailsTag = /<details[^>]*>/.exec(html)?.[0] ?? ''
    expect(detailsTag).toContain('dsh-pm-archived-fold')
    expect(detailsTag).not.toMatch(/\sopen(\s|=|>)/)
    // 条目 = 既有 open-req 委托（不新增事件类型）
    expect(html).toContain('data-action="open-req"')
    expect(html).toContain('data-req="REQ-ARC-1"')
    expect(html).toContain('已归档的需求')
    // 任务进度证明 DAG 数据还在
    expect(html).toContain('2/2')
  })

  it('A1-2 buildBoard：泳道段不含归档需求，归档条段含（FR-1 主判据）', () => {
    const arch = makeReq({ id: 'REQ-ARC-2', status: 'archived', title: '归档的', updatedAt: T0 + HOUR })
    const open = makeReq({ id: 'REQ-OPEN-2', status: 'implementing', title: '在做的' })
    const html = board.buildBoard(makeState({ requirements: [arch, open] }))

    expect(html).toContain('data-archived-bar')
    expect(html).toContain('data-req="REQ-ARC-2"')
    const beforeBar = html.split('data-archived-bar')[0] ?? ''
    expect(beforeBar).not.toContain('REQ-ARC-2')   // 泳道里不得出现归档需求（既有语义不倒退）
    expect(beforeBar).toContain('REQ-OPEN-2')      // 进行中的照常进泳道
  })

  it('A1-3 超限提示与空态', () => {
    const a = makeReq({ id: 'REQ-ARC-3a', status: 'archived', updatedAt: T0 + 2 * HOUR })
    const b = makeReq({ id: 'REQ-ARC-3b', status: 'canceled', updatedAt: T0 + HOUR })
    const cards = board.toTerminalCards(makeState({ requirements: [a, b] }))

    const limited = board.renderArchivedBar(cards, 1)
    expect((limited.match(/data-action="open-req"/g) ?? []).length).toBe(1)
    expect(limited).toContain('另有 1 条未显示')
    expect(limited).toContain('data-archived-count="2"')   // 计数是总数，不是渲染条数

    expect(board.renderArchivedBar([])).toBe('')
  })

  it('A1-4 归档/取消分别计数，取消态带 data-status', () => {
    const a = makeReq({ id: 'REQ-ARC-4a', status: 'archived' })
    const c = makeReq({ id: 'REQ-ARC-4c', status: 'canceled' })
    const html = board.renderArchivedBar(board.toTerminalCards(makeState({ requirements: [a, c] })))

    expect(html).toContain('已归档 1')
    expect(html).toContain('已取消 1')
    expect(html).toContain('data-status="canceled"')
    expect(html).toContain('data-status="archived"')
  })
})

// ---------------------------------------------------------------------------
// A2 归档需求详情可回看（FR-1 / FR-2）
// ---------------------------------------------------------------------------

describe('A2 归档需求详情', () => {
  it('A2 归档需求点开后能看到 DAG 与全部任务行', () => {
    const arch = makeReq({ id: 'REQ-ARC-A2', status: 'archived', title: '要回看的' })
    const tasks = [1, 2, 3].map(n => makeTask({
      id: `t-a2-00000${n}`, requirementId: 'REQ-ARC-A2', title: `任务${n}`, status: 'done',
    }))

    const html = buildReqDetail(arch, tasks, T0 + HOUR)

    expect(html).toContain('dsh-pm-dag-panel')                     // DAG 画布在场
    expect((html.match(/data-task="/g) ?? []).length).toBe(3)      // 任务表 3 行
    expect(html).toContain('总任务')
    expect(html).toContain('data-detail-req="REQ-ARC-A2"')
  })
})

// ---------------------------------------------------------------------------
// A3 终态只读（FR-2）
// ---------------------------------------------------------------------------

describe('A3 终态只读', () => {
  const ACTIONS = ['move-req', 'plan-approve', 'plan-reject', 'verify-pass', 'verify-rework', 'archive-req']

  const cases: Array<[string, RequirementRecord]> = [
    ['archived', makeReq({ id: 'REQ-RO-1', status: 'archived', archive: makeArchive() })],
    // 反例：canceled + 未批准计划 —— 改造前会渲染「批准计划」
    ['canceled + 未批准计划', makeReq({ id: 'REQ-RO-2', status: 'canceled', plan: makeUnapprovedPlan() })],
    // 反例：legacy done + 材料已备 —— 改造前会渲染「归档」（点了必 404）
    ['done + 材料已备', makeReq({ id: 'REQ-RO-3', status: 'done', archive: makeArchive() })],
  ]

  for (const [name, req] of cases) {
    it(`A3 ${name}：不渲染任何会失败的操作按钮`, () => {
      const html = buildReqDetail(req, [], T0 + HOUR)
      for (const act of ACTIONS) expect(html).not.toContain(`data-action="${act}"`)
      expect(html).not.toContain('dsh-pm-action-bar')
      // 只读 ≠ 空白：状态与进度点照常渲染
      expect(html).toContain('data-detail-req="' + req.id + '"')
      expect(html).toContain('dsh-pm-progress-dots')
    })
  }
})

// ---------------------------------------------------------------------------
// A4 列表视图终态分组（FR-3）
// ---------------------------------------------------------------------------

describe('A4 列表视图终态分组', () => {
  it('A4 已完成 / 已归档分组含 archived 与 canceled 行（改造前是死分支）', () => {
    const done = makeReq({ id: 'REQ-LS-DONE', status: 'done' })
    const arch = makeReq({ id: 'REQ-LS-ARCH', status: 'archived' })
    const canc = makeReq({ id: 'REQ-LS-CANC', status: 'canceled' })

    const html = board.buildListView(makeState({ requirements: [done, arch, canc] }))

    expect(html).toContain('已完成 / 已归档')
    expect(html).toContain('data-req="REQ-LS-ARCH"')
    expect(html).toContain('data-req="REQ-LS-CANC"')
    expect(html).toContain('data-req="REQ-LS-DONE"')
  })
})

// ---------------------------------------------------------------------------
// A5 僵尸归档入口（FR-4）
// ---------------------------------------------------------------------------

describe('A5 僵尸归档入口', () => {
  it('A5 api 不再导出 archiveReq（服务端 POST /req/archive 已移除）', () => {
    expect('archiveReq' in api).toBe(false)
  })

  it('A5 done 详情无 archive-req 按钮，文案不再把人指向按钮', () => {
    const done = makeReq({ id: 'REQ-Z-1', status: 'done', archive: makeArchive() })
    expect(buildReqDetail(done, [], T0 + HOUR)).not.toContain('archive-req')
    expect(renderArchiveSection(done)).not.toContain('点「归档」')
  })
})

// ---------------------------------------------------------------------------
// A6 投影不变量（FR-5 回归锚点）
// ---------------------------------------------------------------------------

describe('A6 投影不变量', () => {
  const draft = makeReq({ id: 'REQ-INV-DRAFT', status: 'draft' })
  const impl = makeReq({ id: 'REQ-INV-IMPL', status: 'implementing' })
  const done = makeReq({ id: 'REQ-INV-DONE', status: 'done' })
  const arch = makeReq({ id: 'REQ-INV-ARCH', status: 'archived', updatedAt: T0 + 2 * HOUR })
  const canc = makeReq({ id: 'REQ-INV-CANC', status: 'canceled', updatedAt: T0 + HOUR })
  const state = makeState({
    requirements: [draft, impl, done, arch, canc],
    tasks: [
      makeTask({ id: 't-inv-1', requirementId: 'REQ-INV-ARCH', status: 'done' }),
      makeTask({ id: 't-inv-2', requirementId: 'REQ-INV-ARCH', status: 'todo' }),
    ],
  })

  it('A6 进行中投影不含终态、仍含 done（语义不变）', () => {
    const active = board.toReqCards(state).map(c => c.req.status)
    expect(active).not.toContain('archived')
    expect(active).not.toContain('canceled')
    expect(active).toContain('done')          // done 归入验收泳道的历史语义
    expect(active).toContain('draft')
    expect(active).toContain('implementing')
  })

  it('A6 终态投影只含 archived/canceled，按 updatedAt 降序', () => {
    const terminal = board.toTerminalCards(state)
    expect(terminal.map(c => c.req.id)).toEqual(['REQ-INV-ARCH', 'REQ-INV-CANC'])
    expect(terminal.some(c => c.req.status === 'done')).toBe(false)
  })

  it('A6 两投影互斥且并集覆盖全部需求（归档不吞需求、不吞任务）', () => {
    const ids = [...board.toReqCards(state), ...board.toTerminalCards(state)].map(c => c.req.id)
    expect(new Set(ids).size).toBe(ids.length)                       // 互斥
    expect(new Set(ids).size).toBe(state.requirements.length)        // 完备
    const archCard = board.toTerminalCards(state).find(c => c.req.id === 'REQ-INV-ARCH')
    expect(archCard?.totalCount).toBe(2)                             // 归档不吞任务
    expect(archCard?.doneCount).toBe(1)
  })
})
