/**
 * 空输入矩阵（REQ-261006201814-ac4f FR-7）。
 *
 * ## 为什么单列
 *
 * 「空输入」在本仓是覆盖洼地（实测 3 条），而它恰好是最容易出**假绿**的一类：
 * 传空串当"没传"、传空白串当"传了"、传空集合当"没传集合"，三种形态在生产里
 * 走的分支完全不同（`normalizeText` 的 trim 口径 / `Array.isArray` 的形态判据 /
 * `length === 0` 的集合判据）。故逐格钉死：**四种空形态 × 两个工具 = 8 格**，
 * 每格给三件套（拒绝码 + 零写入 + 状态不变）。
 *
 * @module dsh-pmboard/tests/empty-input-matrix.test
 */
import { describe, expect, it } from 'vitest'
import { InMemoryQueueRepository, makeTestStore } from './application/harness.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import {
  defineMoveTool, defineDecomposeTool, defineTaskMoveTool, defineTaskReportTool,
  defineAskConfirmTool, definePlanSubmitTool, seedQueueTasks, type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import { probeWrites, expectRejectedWithNoWrite } from './helpers/ledger-probe.js'
import { codeOf } from './helpers/code-trigger-harness.js'

const W = 'session-ei-001'
const REQ_ID = 'REQ-ei0001'
const T = 1_700_000_000_000
const EXEC = { agent: { id: W } }

/** 四种空形态（枚举基数进末尾计数断言）。 */
const CONDITIONS = ['空串', '仅空白', '缺字段', '空集合'] as const
/** 每条件两格。 */
const PER_CONDITION = 2

type Cell = {
  readonly condition: typeof CONDITIONS[number]
  readonly tool: (deps: ReqboardToolDeps) => unknown
  readonly args: unknown
  readonly expected: string
  readonly label: string
}

const CELLS: readonly Cell[] = [
  // ── 空串：trim 后为空 ⇒ 与"没传"同判 ─────────────────────────────────────
  {
    condition: '空串',
    tool: d => defineTaskReportTool(d),
    args: { task_id: 't-ei0001', summary: '' },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '空串 × task_report.summary',
  },
  {
    condition: '空串',
    tool: d => definePlanSubmitTool(d),
    args: { requirement_id: REQ_ID, summary: 'x', path: '' },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '空串 × plan_submit.path',
  },
  // ── 仅空白：非空字符串但 trim 后为空 ⇒ 必须与空串同拒（不许把空白当内容） ──
  {
    condition: '仅空白',
    tool: d => defineTaskReportTool(d),
    args: { task_id: 't-ei0001', summary: '   ' },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '仅空白 × task_report.summary',
  },
  {
    condition: '仅空白',
    tool: d => defineAskConfirmTool(d),
    args: { target: 'artifact', kind: 'requirement', requirement_id: REQ_ID, question: '   ' },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '仅空白 × confirm.question',
  },
  // ── 缺字段：必需参数缺席 ⇒ 拒绝（不是"悄悄用缺省值"） ─────────────────────
  {
    condition: '缺字段',
    tool: d => defineTaskMoveTool(d),
    args: { task_id: 't-ei0001', reason: 'x' },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '缺字段 × task_move.to',
  },
  {
    condition: '缺字段',
    tool: d => defineMoveTool(d),
    args: { requirement_id: REQ_ID, reason: 'x' },
    expected: 'invalid_input',
    label: '缺字段 × move.to（领域层小写码）',
  },
  // ── 空集合：传了就必须非空（"传空 = 没传"是歧义源） ───────────────────────
  {
    condition: '空集合',
    tool: d => defineDecomposeTool(d),
    args: { requirement_id: REQ_ID, tasks: [] },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '空集合 × decompose.tasks',
  },
  {
    condition: '空集合',
    tool: d => defineTaskMoveTool(d),
    args: { tasks: [] },
    expected: 'REQBOARD_INVALID_INPUT',
    label: '空集合 × task_move.tasks',
  },
]

const asTool = (t: unknown): { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> } =>
  t as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }

async function fixture(): Promise<{
  deps: ReqboardToolDeps
  store: ReturnType<typeof makeTestStore>
  repo: InMemoryQueueRepository
}> {
  const store = makeTestStore()
  const record = {
    id: REQ_ID, title: '空输入矩阵夹具', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  }
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [record as never], triages: [] })
  const repo = new InMemoryQueueRepository()
  const taskStore = new QueueTaskStore({ repo, now: () => T, onWarn: () => { /* 矩阵不断言告警 */ } })
  const deps: ReqboardToolDeps = { store, now: () => T, taskStore }
  await seedQueueTasks(deps, REQ_ID, [{
    id: 't-ei0001', requirementId: REQ_ID, title: '夹具卡', description: '', phase: 'test', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
    implementation: '改 tests/x.test.ts', context: '', status: 'todo', blocked: false, executions: [], comments: [],
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  } as never])
  return { deps, store, repo }
}

describe('空输入矩阵（FR-7）', () => {
  for (const cell of CELLS) {
    it(cell.label + ' → ' + cell.expected + '（含零写入与状态不变）', async () => {
      const { deps, store, repo } = await fixture()
      const tool = asTool(cell.tool(deps))
      const before = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      let code: string | undefined
      try {
        code = codeOf(await tool.execute(cell.args, EXEC))
      } catch (err) {
        code = codeOf(err)
      }
      const after = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      expectRejectedWithNoWrite(code, cell.expected, before, after, ['status', 'version'], cell.label)
    })
  }

  it('计数断言：格数恰为 条件数 × 每条件格数（改枚举不补格必须红）', () => {
    const counted = new Map<string, number>()
    for (const c of CELLS) counted.set(c.condition, (counted.get(c.condition) ?? 0) + 1)
    expect(CELLS.length).toBe(CONDITIONS.length * PER_CONDITION)
    for (const condition of CONDITIONS) {
      expect(counted.get(condition), condition + ' 的格数不对').toBe(PER_CONDITION)
    }
  })
})
