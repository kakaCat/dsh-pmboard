// serves: FR-7, FR-11, FR-12
/**
 * 「文档」Tab 面板渲染单测（REQ-261004222448-292a · t-b9dd2c / 设计 T-5、T-13、T-16）。
 *
 * 面板 render 是**纯字符串函数**（本包没有 jsdom），所以断言全部在字符串上做——
 * 机械判据（可数、可 grep）如下：
 *   ① `data-doc-row="1"` 的**条数恒等于** `documents.length`（这是"铺开、不压成 4 份 + 滚动"的判据）；
 *   ② `file-missing` 行：`data-file-missing="1"` + 类名 `dsh-pm-doc-missing` + 可见划线 + 「文件缺失」；
 * ③ 核验表七列在场（标准 / 实际结果 / 来源（agent|human）/ 需人工 / 证据 / 意见 / 裁决）；
 *   ④ 六道门全列，裁决 / 方式 / 时间 / 确认人 / 理由四件事都在；
 *   ⑤ 没有验收单 → **解释性空态**（`data-verify-empty`），产物里**没有**核验表格；
 *   ⑥ 产物里不出现 `overflow: auto|scroll`（FR-11 #7：内层滚动一律不要）。
 *
 * @module dsh-pmboard/tests/docs-panel
 */
import { describe, it, expect } from 'vitest'
import { docsPanel, prototypeGroupOf } from '../src/client/views/panels/docs.js'
import { fmtTime } from '../src/client/render/dom-utils.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import type {
  ArchiveRecord,
  DocPanelEntry,
  DocsResponse,
  GateVerdict,
  VerificationItem,
} from '../src/shared/protocol.js'

const REQ = 'REQ-261004222448-292a'
const DIR = 'docs/requirements/' + REQ
const T0 = Date.UTC(2026, 9, 5, 1, 30) // 2026-10-05

/* --------------------------------------------------------------- 标本 */

/** 15 份文档：原型口径（文档 15 份全部逐行）＋ 四种登记态各至少一份。 */
const DOCS: DocPanelEntry[] = [
  { kind: 'requirement', path: DIR + '/requirement.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'design', path: DIR + '/design/architecture.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'design', path: DIR + '/design/interfaces.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'design', path: DIR + '/design/frontend.md', registeredAt: T0, state: 'pending' },
  { kind: 'design', path: DIR + '/design/data-model.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'design', path: DIR + '/design/test-cases.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'design', path: DIR + '/design/migration.md', registeredAt: T0, state: 'pending' },
  // 分类要求、但台账里没有登记记录的设计文档：必须**显式列出来**（"少交"要看得见）
  { kind: 'design', path: DIR + '/design/backend.md', state: 'unregistered' },
  { kind: 'plan', path: DIR + '/decomposition.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'task-detail', path: DIR + '/tasks/t-001.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'task-detail', path: DIR + '/tasks/t-002.md', registeredAt: T0, state: 'pending' },
  // 登记在案、文件不在：标灰划线 + 「文件缺失」
  { kind: 'task-detail', path: DIR + '/tasks/t-003.md', registeredAt: T0, state: 'file-missing' },
  { kind: 'verification', path: DIR + '/verification.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'retro', path: DIR + '/retro.md', registeredAt: T0, state: 'confirmed' },
  { kind: 'notes', path: DIR + '/notes.md', registeredAt: T0, state: 'confirmed' },
]

const GENERATED = [
  { label: '任务队列（DAG 派生视图）', path: DIR + '/queue.json' },
  { label: '需求追溯矩阵（rtm-implementing.yml）', path: DIR + '/rtm-implementing.yml' },
]

const GATES: GateVerdict[] = [
  { gate: 'requirement', verdict: 'passed', via: 'dialog', at: T0, by: { kind: 'human', sessionId: 'session-1a2b3c4d-0000' } },
  { gate: 'design', verdict: 'passed', via: 'board', at: T0 + 1000, by: { kind: 'human' } },
  { gate: 'plan', verdict: 'rejected', via: 'evidence-text', at: T0 + 2000, by: { kind: 'human' }, reason: '粒度太细，请按子卡链模板重拆' },
  { gate: 'implementation', verdict: 'passed', at: T0 + 3000, by: { kind: 'agent', sessionId: 'session-9f8e7d6c-1111' } },
  { gate: 'verification', verdict: 'pending' },
  // 默认夹具停在「材料已备、尚未归档」：归档门 not-reached 同时充当门禁表中的 not-reached 样例。
  // 已归档态由 GATES_ARCHIVED 提供（见下），两态各有覆盖。
  { gate: 'archive', verdict: 'not-reached' },
]

/**
 * REQ-261006123819-3af3 FR-3（D-2）：已归档态 = 服务端归档门 `passed`（判据不再是某个字段）。
 * 只有这条读数能让归档块显示「已归档」，故单列一份夹具，不污染门禁表的 not-reached 样例。
 */
const GATES_ARCHIVED: GateVerdict[] = [
  ...GATES.filter(g => g.gate !== 'archive'),
  { gate: 'archive', verdict: 'passed', at: T0 + 7000 },
]

const ITEMS: VerificationItem[] = [
  {
    id: 'v1-1',
    source: { kind: 'requirement' },
    criterion: '文档行数 == 台账文档数',
    evidence: ['pnpm vitest run tests/docs-panel.test.ts → 15 rows'],
    status: 'passed',
    result: '15 行，与台账一致',
    resultSource: 'agent',
  },
  {
    id: 'v1-2',
    source: { kind: 'requirement' },
    criterion: '缺失行划线标灰',
    evidence: [],
    status: 'failed',
    result: '首轮未标灰',
    resultSource: 'human',
    needsHuman: true,
    humanReason: '界面视觉无独立证据',
    opinion: '首轮未通过：意见已挂回原卡',
    decidedAt: T0 + 5000,
    decidedBy: { kind: 'human' },
  },
  {
    id: 'v1-3',
    source: { kind: 'requirement' },
    criterion: '归档清单完整',
    evidence: ['archive-reconcile 输出'],
    status: 'pending',
  },
]

const ARCHIVE: ArchiveRecord = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  mergedInto: ['agent-dh/docs/architecture/requirement-report.md'],
  indexEntry: '需求详情页改为工作汇报：常驻头部 + 六个同级 Tab + 切到才取数。',
  manualUpdates: [
    { path: 'agent-dh/docs/architecture/project-manual.md', section: '前端 · 详情页', summary: '详情页改为头部常驻 + 六 Tab 懒加载' },
  ],
  submittedAt: T0 + 6000,
  submittedBy: { kind: 'agent', sessionId: 'session-1a2b3c4d-0000' },
  // REQ-261006123819-3af3 FR-3（D-2）：原归档时间 / 归档人字段已删（无写入者）；
  // 归档态判据改由载荷里的归档门读数（见 GATES 的 archive 条）。
  reconcile: {
    gate: 'enforce',
    listed: [DIR + '/requirement.md', DIR + '/verification.md'],
    exempted: [{ path: DIR + '/queue.json', rule: 'tool-rebuilt' }],
    unlisted: [DIR + '/scratch.md'],
    acknowledged: [{ path: DIR + '/scratch.md', reason: '临时草稿，不进清单' }],
    at: T0 + 6000,
  },
}

function makeDocs(over: Partial<DocsResponse> = {}): DocsResponse {
  return {
    documents: DOCS,
    generated: GENERATED,
    verification: { version: 2, items: ITEMS, generatedAt: T0, generatedBy: { kind: 'agent', sessionId: 'session-1a2b3c4d-0000' } },
    gates: GATES,
    archive: ARCHIVE,
    ...over,
  }
}

/** 渲染（纯函数；ctx 只是壳契约的一部分，渲染不该碰它） */
function render(data: unknown): string {
  const ctx: ReportTabCtx = {
    requirementId: REQ,
    load: () => Promise.reject(new Error('渲染路径不该取数')),
    openDoc: () => { throw new Error('渲染路径不该开正文') },
  }
  return docsPanel.render(data, ctx)
}

const countOf = (html: string, needle: string): number => html.split(needle).length - 1

/** 取出包含 needle 的那个 `<tr>`（行级断言用） */
function rowOf(html: string, needle: string): string {
  const idx = html.indexOf(needle)
  expect(idx, '标本里找不到 ' + needle).toBeGreaterThan(-1)
  const start = html.lastIndexOf('<tr', idx)
  const end = html.indexOf('</tr>', idx)
  expect(start, 'needle 不在 <tr> 里：' + needle).toBeGreaterThan(-1)
  return html.slice(start, end)
}

/* --------------------------------------------------------------- ① 文档逐行铺开 */

describe('文档清单 · 一律铺开（FR-11 #7）', () => {
  it('T-5：data-doc-row 条数 == documents.length（15 份全列，不压成"4 份 + 滚动"）', () => {
    const html = render(makeDocs())
    expect(countOf(html, 'data-doc-row="1"')).toBe(DOCS.length)
    expect(DOCS.length).toBe(15)
    expect(html).toContain('共 15 份')
    expect(html).toContain('data-panel="docs"')
    expect(html).toContain('data-doc-table="1"')
  })

  it('五列在场：类型 / 路径 / 登记时间 / 状态 / 打开（FR-6 紧凑表，REQ-261006130057-7a43 t8）', () => {
    const html = render(makeDocs())
    for (const th of ['<th>类型</th>', '<th>路径</th>', '<th>登记时间</th>', '<th>状态</th>', '<th>打开</th>']) {
      expect(html).toContain(th)
    }
    // 类型走唯一事实源的中文名（不是裸 kind）
    expect(rowOf(html, DIR + '/requirement.md')).toContain('需求文档')
    expect(rowOf(html, DIR + '/tasks/t-001.md')).toContain('任务卡')
    expect(rowOf(html, DIR + '/decomposition.md')).toContain('拆分计划')
  })

  it('四种状态各有说辞（FR-12 禁留白）：已确认 / 待确认 / 未登记 / 文件缺失', () => {
    const html = render(makeDocs())
    // 状态名与解释是两个 span（状态名单独可断言、解释另起）——两处都不许空着
    const confirmed = rowOf(html, DIR + '/requirement.md')
    expect(confirmed).toContain('data-doc-state="confirmed"')
    expect(confirmed).toContain('>已确认</span>')
    expect(confirmed).toContain('（人工已确认，可用）')
    const pending = rowOf(html, DIR + '/design/frontend.md')
    expect(pending).toContain('data-doc-state="pending"')
    expect(pending).toContain('>待确认</span>')
    expect(pending).toContain('（台账已登记，等人工确认）')
    const unregistered = rowOf(html, DIR + '/design/backend.md')
    expect(unregistered).toContain('data-doc-state="unregistered"')
    expect(unregistered).toContain('>未登记</span>')
    expect(unregistered).toContain('（所属分类要求这份文档，台账里没有登记记录）')
    // 未登记的行没有登记时间：说清"未登记"，不留白
    expect(unregistered).toContain('未登记（无登记时间）')
  })
})

/* --------------------------------------------------------------- ② 文件缺失 */

describe('文件缺失行（T-16）', () => {
  it('data-file-missing + 缺失类名 + 可见划线 + 「文件缺失」，且不给可点的假出口', () => {
    const html = render(makeDocs())
    const row = rowOf(html, DIR + '/tasks/t-003.md')
    expect(row).toContain('data-doc-row="1"')
    expect(row).toContain('data-file-missing="1"')
    expect(row).toContain('data-doc-state="file-missing"')
    // FR-6 紧凑表（t8）：路径格是纯文本 <span>（不再兼职按钮），划线与缺失类名照钉
    expect(row).toContain('class="dsh-pm-doc-filepath dsh-pm-doc-missing"')
    expect(row).toContain('line-through') // 可见划线（字符串级也能断言，不依赖样式表）
    expect(row).toContain('>文件缺失</span>')
    expect(row).toContain('（登记在案，但磁盘上找不到该文件）')
    expect(row).toContain('is-missing')
    // 缺失文件点开必读不到 → 不给 data-action（与 board-mount 的运行时约定一致）
    expect(row).not.toContain('data-action="open-doc"')
    // 但锚点仍在（面板契约）：缺失行的「打开」按钮也带 data-open-doc，只是 disabled（不给假出口）
    expect(row).toContain('data-open-doc="' + DIR + '/tasks/t-003.md"')
    const openCell = row.slice(row.indexOf('dsh-pm-doc-cell-open'))
    expect(openCell).toContain('disabled')
    expect(openCell).not.toContain('点开正文') // 没有正文可读 → 不留"点了没反应"的假出口
  })

  it('非缺失行都给 data-open-doc（且**故意不带** data-action="open-doc"：只能有一处接委派）', () => {
    const html = render(makeDocs())
    const row = rowOf(html, DIR + '/design/architecture.md')
    expect(row).toContain('data-open-doc="' + DIR + '/design/architecture.md"')
    // 反例断言：壳的 attach 与 board-mount 的老链**只能有一处**接 data-open-doc，
    // 两边都接会点一下开两次（见 report-tabs.ts attach 注释）
    expect(html).not.toContain('data-action="open-doc"')
  })
})

/* --------------------------------------------------------------- ③ 生成物分开列 */

describe('生成物与人写的文档分开列', () => {
  it('generated 用 data-generated-row（不计入 data-doc-row），且标「自动维护」', () => {
    const html = render(makeDocs())
    expect(countOf(html, 'data-generated-row="1"')).toBe(GENERATED.length)
    expect(countOf(html, 'data-doc-row="1"')).toBe(DOCS.length) // 生成物**不**混进文档行
    // FR-6 紧凑表（t8）：生成物在 <tr> 里（名称/路径/状态/打开四列）：取该 <tr> 做段级断言
    const at = html.indexOf('data-generated-row="1"')
    const gen = html.slice(html.lastIndexOf('<tr', at), html.indexOf('</tr>', at))
    expect(gen).toContain('任务队列（DAG 派生视图）')
    expect(gen).toContain('data-open-doc="' + DIR + '/queue.json"')
    expect(gen).toContain('自动维护（工具重建）')
    // 打开列独立成格（可点，非 disabled——生成物没有缺失/未判定态）
    expect(gen).toContain('dsh-pm-doc-cell-open')
    expect(gen).not.toContain('disabled')
    const section = html.slice(html.indexOf('data-doc-section="generated"'), html.indexOf('data-doc-section="verification"'))
    expect(section).toContain('不是人写的文档')
    expect(section).toContain('rtm-implementing.yml')
    expect(section).toContain('data-generated-table="1"')
  })
})

/* --------------------------------------------------------------- ④ 核验表 */

describe('核验表（T-13：列照抄 verification.ts）', () => {
  it('七列在场：标准 / 实际结果 / 来源 / 需人工 / 证据 / 意见 / 裁决', () => {
    const html = render(makeDocs())
    for (const th of ['<th>标准</th>', '<th>实际结果</th>', '<th>来源</th>', '<th>需人工</th>', '<th>证据</th>', '<th>意见</th>', '<th>裁决</th>']) {
      expect(html).toContain(th)
    }
    expect(countOf(html, 'data-verify-row="1"')).toBe(ITEMS.length)
  })

  it('实际结果 + 来源（agent|human 原文都在）+ 需人工（含原因）+ 意见 + 裁决逐项铺开', () => {
    const html = render(makeDocs())
    const agentRow = rowOf(html, 'v1-1')
    expect(agentRow).toContain('15 行，与台账一致')
    expect(agentRow).toContain('agent 实测（agent）')
    expect(agentRow).toContain('data-source="agent"')
    expect(agentRow).toContain('否（agent 可自证）')
    expect(agentRow).toContain('data-verify-status="passed"')
    expect(agentRow).toContain('✅ 通过')

    const humanRow = rowOf(html, 'v1-2')
    expect(humanRow).toContain('data-needs-human="1"') // 「需人工」显眼标出
    expect(humanRow).toContain('需人工确认：界面视觉无独立证据')
    expect(humanRow).toContain('人工填写（human）')
    expect(humanRow).toContain('data-source="human"')
    expect(humanRow).toContain('首轮未通过：意见已挂回原卡') // 意见
    expect(humanRow).toContain('✖ 不通过') // 裁决
    // 证据为空 → 明说"未提供证据"，不留白
    expect(humanRow).toContain('未提供证据')
  })

  it('没有验收单 → 解释性空态，**不画空表格**（FR-12）', () => {
    const html = render(makeDocs({ verification: undefined }))
    expect(html).toContain('data-verify-empty="1"')
    expect(html).toContain('尚未提交验收材料')
    expect(html).toContain('reqboard_submit(kind=verification)')
    expect(html).not.toContain('data-verify-table')
    expect(countOf(html, 'data-verify-row="1"')).toBe(0)
  })

  it('验收单存在但 items 为空 → 同样不画空表格', () => {
    const html = render(makeDocs({
      verification: { version: 1, items: [], generatedAt: T0, generatedBy: { kind: 'agent' } },
    }))
    expect(html).toContain('data-verify-empty="1"')
    expect(html).toContain('没有逐项记录')
    expect(html).not.toContain('data-verify-table')
  })
})

/* --------------------------------------------------------------- ⑤ 门禁裁决留痕 */

describe('门禁裁决留痕（六道门全列）', () => {
  it('六道门各一行、顺序为流水线顺序，裁决值在协议枚举内', () => {
    const html = render(makeDocs())
    const order = ['requirement', 'design', 'plan', 'implementation', 'verification', 'archive']
    for (const gate of order) expect(countOf(html, 'data-gate="' + gate + '"'), gate).toBe(1)
    expect(countOf(html, 'data-gate="')).toBe(6)
    const positions = order.map(gate => html.indexOf('data-gate="' + gate + '"'))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const v of ['passed', 'rejected', 'pending', 'not-reached']) {
      expect(html).toContain('data-verdict="' + v + '"')
    }
  })

  it('谁批的 / 何时 / 什么方式（dialog|board|evidence-text 可读文案）/ 退回理由原文', () => {
    const html = render(makeDocs())
    expect(html).toContain('确认弹框（dialog）')
    expect(html).toContain('看板确认（board）')
    expect(html).toContain('文字证据（evidence-text）')
    // 谁批的：人 / agent + 窗口码（审计要能追到具体会话）
    expect(rowOf(html, 'data-gate="requirement"')).toContain('人（human） · w-1a2b3c4d')
    expect(rowOf(html, 'data-gate="implementation"')).toContain('agent · w-9f8e7d6c')
    // 何时（fmtTime 走本机时区 → 期望值也用同一函数算，避免用例绑死时区）
    expect(rowOf(html, 'data-gate="requirement"')).toContain(fmtTime(T0))
    // 退回理由显示**原文**
    expect(rowOf(html, 'data-gate="plan"')).toContain('粒度太细，请按子卡链模板重拆')
  })

  it('not-reached 说清「尚未走到该门」；pending 说清在等人；缺字段各有说辞（不留白）', () => {
    const html = render(makeDocs())
    const notReached = rowOf(html, 'data-gate="archive"')
    expect(notReached).toContain('尚未走到该门')
    expect(rowOf(html, 'data-gate="verification"')).toContain('这道门在等人')
    // pending 行没有 at / by / via → 三格都得有说辞，不能空着
    expect(rowOf(html, 'data-gate="verification"')).toContain('未记录方式（台账无 via 字段）')
    expect(rowOf(html, 'data-gate="verification"')).toContain('未记录时间')
    expect(rowOf(html, 'data-gate="verification"')).toContain('未记录确认人')
  })

  it('台账漏给某道门 → 仍列全六道（该门按 not-reached 显示并说明"台账没有留痕"）', () => {
    const html = render(makeDocs({ gates: [GATES[0]] }))
    expect(countOf(html, 'data-gate="')).toBe(6)
    expect(rowOf(html, 'data-gate="archive"')).toContain('台账没有这道门的留痕')
  })
})

/* --------------------------------------------------------------- ⑥ 归档 */

describe('归档块（FR-7 第三部分的归档面）', () => {
  it('目录 / 清单 / 合并去向 / 索引条目 / 说明书更新点 / 清单对账都在', () => {
    const html = render(makeDocs())
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain(DIR)
    expect(section).toContain('data-archive-doc="' + DIR + '/requirement.md"')
    expect(section).toContain('data-merged-into="agent-dh/docs/architecture/requirement-report.md"')
    expect(section).toContain('索引条目：需求详情页改为工作汇报')
    expect(section).toContain('项目说明书更新（金字塔向上生长）')
    expect(section).toContain('前端 · 详情页')
    expect(section).toContain('清单对账：已列 2 · 豁免 1 · 未列 1 · 闸门=enforce')
    expect(section).toContain('已声明不收：临时草稿，不进清单')
  })

  // REQ-261006123819-3af3 FR-3（D-2）：已归档 = 服务端归档门 passed（时刻取门读数的 at）
  it('归档门 passed → 已归档 + 真实时刻 + data-archived="yes"', () => {
    const html = render(makeDocs({ gates: GATES_ARCHIVED }))
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('已归档 ' + fmtTime(T0 + 7000))
    expect(section).toContain('data-archived="yes"')
    expect(section).toContain('data-state="pass"')
  })

  // 材料已备但归档门不是 passed（默认夹具 not-reached）→ 待归档，不许谎报已归档
  it('材料已备但归档门未 passed → 待归档（材料已备），不谎报已归档', () => {
    const html = render(makeDocs())
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('待归档（材料已备）')
    expect(section).toContain('data-archived="no"')
    expect(section).not.toContain('已归档')
  })

  // REQ-261006123819-3af3 FR-3：归档门读数取不到时不猜（保守分支：材料已备 + data-archived="no"）
  it('归档门读数缺席（旧服务端/端点未接线）→ 不猜已归档，按材料已备呈现', () => {
    const html = render(makeDocs({ gates: GATES.filter(g => g.gate !== 'archive') }))
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('待归档（材料已备）')
    expect(section).toContain('data-archived="no"')
    expect(section).not.toContain('data-state="pass"')
  })

  it('无 manualUpdates 也无 manualNote → 说明书更新点也要有说辞（不留白）', () => {
    const bare: ArchiveRecord = { ...ARCHIVE, manualUpdates: undefined, manualNote: undefined }
    const html = render(makeDocs({ archive: bare }))
    expect(html).toContain('data-manual-updates="none"')
    expect(html).toContain('既没有 manualUpdates 也没有 manualNote')
  })

  it('无 archive → 不渲染归档块（不是"空归档"）', () => {
    const html = render(makeDocs({ archive: undefined }))
    expect(html).not.toContain('data-doc-section="archive"')
  })
})

/* --------------------------------------------------------------- ②b 其它发现 */

/**
 * 「其它发现」块（缺陷修复：原来那 220 条非交付物混在确定文档里逐行倒 → 317 行倾倒）。
 *
 * 机械判据：**分组的计数行**（`data-discovered-group` + `data-discovered-count` + 每类 ≤3 个
 * `data-discovered-sample`），余量写成一句人话「其余 N 个同类，去文档目录查看」，
 * 且**不折叠成一行、不做内层滚动**（每一类一行，计数可加总）。
 */
describe('其它发现 · 按类型分组的计数行（不混进确定文档）', () => {
  const DISCOVERED = [
    { kind: 'yml', count: 90, samples: [DIR + '/rtm-implementing/t-1.yml', DIR + '/rtm-accepting.yml', DIR + '/rtm-design.yml'] },
    { kind: 'png', count: 3, samples: [DIR + '/prototype/a.png', DIR + '/prototype/b.png', DIR + '/prototype/c.png'] },
    { kind: 'mts', count: 1, samples: ['scripts/req-report-probe.mts'] },
  ]

  it('每类一行：data-discovered-group / -count / ≤3 个 -sample，余量写清条数', () => {
    const html = render(makeDocs({ discovered: DISCOVERED }))
    expect(html).toContain('data-doc-section="discovered"')
    for (const g of DISCOVERED) {
      expect(html).toContain('data-discovered-group="' + g.kind + '"')
      expect(html).toContain('data-discovered-count="' + String(g.count) + '"')
      // 组内样例条数 == samples.length 且 ≤ 3（FR-6 紧凑表化后分组行是 <tr>）
      const at = html.indexOf('data-discovered-group="' + g.kind + '"')
      const tr = html.slice(at, html.indexOf('</tr>', at))
      expect(countOf(tr, 'data-discovered-sample="1"'), g.kind).toBe(g.samples.length)
      expect(g.samples.length).toBeLessThanOrEqual(3)
    }
    // 余量必须**可数**：90-3=87、3-3=0、1-1=0
    expect(html).toContain('其余 87 个同类，去文档目录查看')
    expect(html).toContain('全部 3 个已列在上面')
    // 合计行（读者一眼看出体量）
    expect(html).toContain('共 94 项')
    // 分组行**不是**文档表行：确定文档行数仍恒等于 documents.length
    expect(countOf(html, 'data-doc-row="1"')).toBe(DOCS.length)
  })

  it('样例可点开正文（走与文档行同一条 data-open-doc 委派），且不出现 overflow', () => {
    const html = render(makeDocs({ discovered: DISCOVERED }))
    expect(html).toContain('data-open-doc="' + DIR + '/rtm-implementing/t-1.yml"')
    expect(html).toContain('data-open-doc="scripts/req-report-probe.mts"')
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
  })

  it('没有其它发现 → 整块不渲染（不给"其它发现 0 项"这种噪声）', () => {
    expect(render(makeDocs())).not.toContain('data-doc-section="discovered"')
    expect(render(makeDocs({ discovered: [] }))).not.toContain('data-doc-section="discovered"')
  })

  it('脏数据（缺 kind / count 非数 / samples 非数组）不把渲染路径打崩', () => {
    const html = render(makeDocs({
      discovered: [
        { kind: 'yml', count: undefined as unknown as number, samples: undefined as unknown as string[] },
        { count: 5 } as unknown as { kind: string; count: number; samples: string[] },
      ] as never,
    }))
    expect(html).toContain('data-discovered-group="yml"')
    expect(html).toContain('data-discovered-count="0"')
    expect(html).toContain('未给样例（服务端只给了计数）')
    expect(html).not.toContain('NaN')
  })
})

/* --------------------------------------------------------------- ⑦ 空态 / 降级 */

describe('空态与形状守卫（FR-12：禁 0 冒充、禁留白）', () => {
  it('没有文档 / 没有生成物 → 解释性空态，且不写"0 份"', () => {
    const html = render(makeDocs({ documents: [], generated: [] }))
    expect(html).toContain('data-doc-empty="1"')
    expect(html).toContain('尚未登记任何文档')
    expect(html).toContain('data-generated-empty="1"')
    expect(html).toContain('尚无生成物')
    expect(countOf(html, 'data-doc-row="1"')).toBe(0)
    expect(countOf(html, 'data-generated-row="1"')).toBe(0)
    // 反例断言：任何"0 + 单位"的说法都不许出现（未知不得写成 0）
    expect(html).not.toMatch(/\b0\s*(份|项|条|次)/)
  })

  it('载荷形状不符 → 明说形状不符，**不**假装"没有文档"', () => {
    const html = render({})
    expect(html).toContain('data-docs-shape="bad"')
    expect(html).toContain('载荷形状不符')
    expect(html).not.toContain('尚未登记任何文档')
  })
})

/* --------------------------------------------------------------- ⑧ 纪律 */

describe('两条硬纪律', () => {
  it('无内层滚动：产物里不出现 overflow: auto|scroll（全量 / 空量都一样）', () => {
    for (const data of [makeDocs(), makeDocs({ documents: [], generated: [], verification: undefined, gates: [] }), {}]) {
      expect(render(data)).not.toMatch(/overflow:\s*(auto|scroll)/)
    }
  })

  it('正文点开才取：渲染零副作用（不调 openDoc / 不取数），每份文档都有可点锚点', () => {
    const opened: string[] = []
    let loads = 0
    const ctx: ReportTabCtx = {
      requirementId: REQ,
      load: () => { loads += 1; return Promise.reject(new Error('渲染不该取数')) },
      openDoc: (p) => { opened.push(p) },
    }
    const html = docsPanel.render(makeDocs(), ctx)
    expect(opened).toEqual([])
    expect(loads).toBe(0)
    for (const d of DOCS) expect(html, d.path).toContain('data-open-doc="' + d.path + '"')
    for (const g of GENERATED) expect(html, g.path).toContain('data-open-doc="' + g.path + '"')
  })
})

/* --------------------------------------------------------------- ⑨ 原型单列 */

/**
 * 原型在确定文档块内**单列**（REQ-261005105032-3b02 决议 #30 / #32 / #34）。
 *
 * 机械判据：
 *   ① 原型行带 `data-doc-group="prototype"`，组前一行为组标（`data-doc-subhead="prototype"` +
 *      分组计数 `data-proto-count`）；原型行**仍是** `data-doc-row="1"` 的文档行
 *      （`data-doc-row` 条数 == `documents.length` 的既有判据不许破）；
 *   ② 「权威 / 被取代」是服务端投影（`prototypeRole` / `supersededBy`）：行上给
 *      `data-proto-role`，**没有角色时不注入该属性**，并如实说"未标权威角色"；
 *   ③ 本次改动前登记为 `notes` 的旧原型行：展示侧按路径兜底归组（`prototypeGroupOf`），
 *      `data-doc-kind` 仍是台账原值（**不回填**）；
 *   ④ 原型行点开走既有 `[data-open-doc]` 委派：不新增弹窗、不新增路由。
 */
describe('原型单列（决议 #30/#32/#34）', () => {
  const PROTO_DIR = DIR + '/prototypes'
  const PROTO_V2 = PROTO_DIR + '/detail-v2.html'
  const PROTO_V1 = PROTO_DIR + '/detail.html'
  const PROTO_INDEX = PROTO_DIR + '/INDEX.md'
  const PROTO_LEGACY = PROTO_DIR + '/legacy.html'

  /** 四条原型行（两版 + 权威清单自身 + 旧 notes 登记行）+ 一条普通交付物。 */
  const PROTO_DOCS: DocPanelEntry[] = [
    { kind: 'prototype', path: PROTO_V2, registeredAt: T0, state: 'confirmed', prototypeRole: 'authoritative' },
    { kind: 'prototype', path: PROTO_V1, registeredAt: T0, state: 'confirmed', prototypeRole: 'superseded', supersededBy: 'prototypes/detail-v2.html' },
    // INDEX 没列到它 → 服务端不注入角色（缺省不注入，旧形状不变）
    { kind: 'prototype', path: PROTO_INDEX, registeredAt: T0, state: 'pending' },
    // 本次改动前登记的原型行：台账 kind 写死 notes，展示侧按路径兜底归组
    { kind: 'notes', path: PROTO_LEGACY, registeredAt: T0, state: 'confirmed' },
    { kind: 'requirement', path: DIR + '/requirement.md', registeredAt: T0, state: 'confirmed' },
  ]

  it('① 原型行单列：组标 + 分组计数，且仍是 data-doc-row（条数 == documents.length）', () => {
    const html = render(makeDocs({ documents: PROTO_DOCS }))
    expect(countOf(html, 'data-doc-row="1"')).toBe(PROTO_DOCS.length)
    // 普通交付物不进组：组属性只落在原型行上
    expect(countOf(html, 'data-doc-group="prototype"')).toBe(PROTO_DOCS.length - 1)
    expect(html).toContain('data-doc-subhead="prototype"')
    expect(html).toContain('data-proto-count="4"')
    expect(html).toContain('>原型 4 份</span>')
    expect(rowOf(html, DIR + '/requirement.md')).not.toContain('data-doc-group="prototype"')
    // 组标行**不是**文档行（否则 data-doc-row 条数就对不上 documents.length）
    const sub = html.slice(html.indexOf('data-doc-subhead="prototype"'))
    expect(sub.slice(0, sub.indexOf('</tr>'))).not.toContain('data-doc-row="1"')
  })

  it('② 权威 / 被取代都在行上；没角色不注入属性、也不留白', () => {
    const html = render(makeDocs({ documents: PROTO_DOCS }))
    const auth = rowOf(html, PROTO_V2)
    expect(auth).toContain('data-proto-role="authoritative"')
    expect(auth).toContain('权威版本')
    expect(auth).not.toContain('superseded')
    const sup = rowOf(html, PROTO_V1)
    expect(sup).toContain('data-proto-role="superseded"')
    expect(sup).toContain('被取代于 prototypes/detail-v2.html')
    // INDEX 没列这条 → 服务端不注入角色 → 行上也不许出现 data-proto-role，但要有说辞
    const noRole = rowOf(html, PROTO_INDEX)
    expect(noRole).not.toContain('data-proto-role=')
    expect(noRole).toContain('未标权威角色')
  })

  it('②b 服务端读不到 INDEX（载荷里没有角色）→ 行上不出现 data-proto-role，但各有说辞', () => {
    // 只留四个必需字段：等价于「INDEX 读不到 / 没这条路径」时服务端的载荷（两键都不注入）
    const noRoles: DocPanelEntry[] = PROTO_DOCS.map(d => ({
      kind: d.kind, path: d.path, registeredAt: d.registeredAt, state: d.state,
    }))
    const html = render(makeDocs({ documents: noRoles }))
    expect(html).not.toContain('data-proto-role=') // 缺省不注入 → 行上连属性都没有
    expect(html).not.toContain('权威版本')
    expect(html).not.toContain('被取代于')
    // 但**不留白**：四条原型行各自说清"未标权威角色"
    expect(countOf(html, '未标权威角色')).toBe(4)
    expect(countOf(html, 'data-doc-row="1"')).toBe(noRoles.length)
  })

  it('③ 旧 notes 登记的原型行：展示侧兜底归组，台账 kind 不回填', () => {
    const html = render(makeDocs({ documents: PROTO_DOCS }))
    const legacy = rowOf(html, PROTO_LEGACY)
    expect(legacy).toContain('data-doc-kind="notes"') // 台账原值（不回填）
    expect(legacy).toContain('data-doc-group="prototype"') // 展示侧归组
    expect(legacy).toContain('data-proto-group-fallback="1"')
    expect(legacy).toContain('原型') // 类型格显示「原型」，不是「其他」
    expect(legacy).not.toContain('其他')
  })

  it('④ 原型行点开走既有 data-open-doc 委派：无新增弹窗 / 路由，渲染零副作用', () => {
    const opened: string[] = []
    const ctx: ReportTabCtx = {
      requirementId: REQ,
      load: () => Promise.reject(new Error('渲染不该取数')),
      openDoc: (p) => { opened.push(p) },
    }
    const html = docsPanel.render(makeDocs({ documents: PROTO_DOCS }), ctx)
    for (const p of [PROTO_V2, PROTO_V1, PROTO_INDEX, PROTO_LEGACY]) {
      expect(rowOf(html, p), p).toContain('data-open-doc="' + p + '"')
    }
    expect(opened).toEqual([])
    // 委派只许有一处接（两边都接会点一下开两次）；也不许长出路由 / 弹窗
    expect(html).not.toContain('data-action="open-doc"')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('<dialog')
  })

  it('⑤ prototypeGroupOf：认 prototypes/ 与旧 prototype/ 两个前缀，不误伤像原型的名字', () => {
    expect(prototypeGroupOf(PROTO_DIR + '/detail.html')).toBe(true)
    expect(prototypeGroupOf(DIR + '/prototype/detail-report.html')).toBe(true)
    expect(prototypeGroupOf('prototypes/INDEX.md')).toBe(true)
    // 反例：段级匹配（`xxx-prototypes/` 与 `prototypes.md` 都不是原型目录）
    expect(prototypeGroupOf(DIR + '/design/prototypes.md')).toBe(false)
    expect(prototypeGroupOf(DIR + '/prototypes-old/x.html')).toBe(false)
    expect(prototypeGroupOf('')).toBe(false)
  })

  it('⑥ 全是原型（没有别的交付物）时照常单列，且不落进"尚未登记任何文档"空态', () => {
    const only = PROTO_DOCS.filter(d => d.kind === 'prototype')
    const html = render(makeDocs({ documents: only }))
    expect(countOf(html, 'data-doc-row="1"')).toBe(3)
    expect(html).toContain('共 3 份')
    expect(html).toContain('data-proto-count="3"')
    expect(html).not.toContain('data-doc-empty="1"')
  })

  it('⑦ 旧路径 prototype/*.html 的旧 notes 行：prototype/ 兜底分支真的把它归进原型组', () => {
    const legacyOld: DocPanelEntry = {
      kind: 'notes', path: DIR + '/prototype/detail-report.html', registeredAt: T0, state: 'confirmed',
    }
    const html = render(makeDocs({ documents: [legacyOld, DOCS[0]!] }))
    const row = rowOf(html, DIR + '/prototype/detail-report.html')
    expect(row).toContain('data-doc-kind="notes"') // 台账原值（不回填）
    expect(row).toContain('data-doc-group="prototype"') // 旧路径分支归组生效
    expect(row).toContain('data-proto-group-fallback="1"')
    expect(html).toContain('data-proto-count="1"')
    expect(countOf(html, 'data-doc-row="1"')).toBe(2)
  })

  it('⑧ 原型判据：有 prototypeMeta 显示锚点数、采集到零条显示「缺锚点」，且不出现阈值类字样', () => {
    const withAnchors: DocPanelEntry[] = [
      {
        kind: 'prototype', path: PROTO_V2, registeredAt: T0, state: 'confirmed', prototypeRole: 'authoritative',
        prototypeMeta: { anchors: [{ fr: 'FR-3', selector: '#FR-3' }, { fr: 'FR-4', selector: '#FR-4' }] },
      },
      // 采集到了元数据、但一条锚点都没有 → 这是**真实的"缺"**（与"未采集"不同）
      { kind: 'prototype', path: PROTO_V1, registeredAt: T0, state: 'confirmed', prototypeMeta: { anchors: [] } },
    ]
    const html = render(makeDocs({ documents: withAnchors }))
    expect(rowOf(html, PROTO_V2)).toContain('data-proto-anchors="2"')
    expect(rowOf(html, PROTO_V2)).toContain('判据：有锚点 2 条')
    expect(rowOf(html, PROTO_V1)).toContain('data-proto-anchors="none"')
    expect(rowOf(html, PROTO_V1)).toContain('判据：缺锚点')
    // 阈值红线（D-10 / 决议 #8、#49）：原型不自证阈值，页面也不许出现阈值类字样
    expect(html).not.toMatch(/threshold|阈值|上限|下限|tolerance|expected|budget/i)
    // 载荷里只带锚点：几何量的值一个字都不许出现在产物里
    expect(html).not.toMatch(/tabsTop|geometry|576/)
  })

  it('⑨ 没有 prototypeMeta（未采集）或不是原型行：不渲染判据标、也不报错', () => {
    // PROTO_DOCS[0] 有角色但没 prototypeMeta；PROTO_DOCS[2] 是原型行；DOCS[0] 是普通交付物
    const html = render(makeDocs({ documents: [PROTO_DOCS[0]!, PROTO_DOCS[2]!, DOCS[0]!] }))
    // 未采集 ≠ 缺锚点：连属性都没有（不然「不知道」会被读成「判定为缺」）
    expect(html).not.toContain('data-proto-anchors')
    expect(html).not.toContain('缺锚点')
    expect(countOf(html, 'data-doc-row="1"')).toBe(3)
    // 普通交付物那一行也没有任何原型判据标
    expect(rowOf(html, DIR + '/requirement.md')).not.toContain('判据：')
  })
})
