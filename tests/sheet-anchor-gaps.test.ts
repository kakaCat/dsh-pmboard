/**
 * 验收锚点失效探针与可见项（REQ-260930183951-eb6c FR-2）serves: FR-2
 *
 * 验收口径：验收标准里引用的 `tests/*.{test,spec}.*` **不存在**时，验收单必须多出一条
 * 可读的可见项（点名"哪张卡 → 哪个路径"），且**不阻断提交**；锚点都存在时不制造噪声。
 * 立项成因：2d65 的验收单有 5 个项引用了 3 个不存在的测试文件，人照抄执行必然失败。
 */
import { describe, expect, it } from 'vitest'
import { collectMissingAnchors } from '../src/application/internal/content-gate-wiring.js'
import { ANCHOR_GAP_PREFIX, buildSheet, type SheetBuildInput } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { TaskRecord } from '../src/shared/protocol.js'

const fakeDocs = (files: readonly string[]) => ({
  exists: (p: string) => files.includes(p),
}) as unknown as Parameters<typeof collectMissingAnchors>[0]

const task = (over: Partial<TaskRecord> & { id: string; acceptance: string }): TaskRecord => ({
  requirementId: 'REQ-x',
  title: '任务',
  description: '',
  phase: 'implement',
  side: 'backend',
  dependsOn: [],
  scope: { apis: [], tables: [], files: [] },
  context: '',
  status: 'done',
  blocked: false,
  executions: [],
  comments: [],
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: { kind: 'agent', sessionId: 'w' },
  updatedBy: { kind: 'agent', sessionId: 'w' },
  ...over,
} as unknown as TaskRecord)

const base: SheetBuildInput = {
  sheetHistoryLength: 0,
  tasks: [{ id: 't-1', title: '任务一', acceptance: 'npx vitest run tests/a.test.ts 全绿' }],
  evidence: ['ev'],
  generatedAt: 1,
  generatedBy: { kind: 'agent', sessionId: 'w' },
}

describe('REQ-260930183951-eb6c FR-2：验收锚点存在性', () => {
  it('TC-2.1 锚点存在 → 清单为空（不制造噪声）', () => {
    const tasks = [task({ id: 't-1', acceptance: 'npx vitest run tests/a.test.ts 全绿' })]
    expect(collectMissingAnchors(fakeDocs(['tests', 'tests/a.test.ts']), tasks)).toEqual([])
  })

  it('TC-2.2 锚点不存在 → 点名"卡 → 路径"', () => {
    const tasks = [task({ id: 't-1', title: '任务一', acceptance: 'npx vitest run tests/gone.test.ts 全绿' })]
    const gaps = collectMissingAnchors(fakeDocs(['tests']), tasks)
    expect(gaps).toEqual(['任务一 → tests/gone.test.ts'])
  })

  it('TC-2.3 多条失效锚点 → 只产出一条可见项，criterion 同时点名两条', () => {
    const tasks = [
      task({ id: 't-1', title: '甲', acceptance: 'npx vitest run tests/x.test.ts' }),
      task({ id: 't-2', title: '乙', acceptance: 'npx vitest run tests/y.spec.ts' }),
    ]
    const gaps = collectMissingAnchors(fakeDocs(['tests']), tasks)
    expect(gaps).toHaveLength(2) // 探针层是清单
    const built = buildSheet({ ...base, anchorGaps: gaps })
    const items = built.sheet.items.filter(i => i.criterion.startsWith(ANCHOR_GAP_PREFIX))
    expect(items).toHaveLength(1) // 验收单层只出一条项（不逐条注水）
    expect(items[0].criterion).toContain('tests/x.test.ts')
    expect(items[0].criterion).toContain('tests/y.spec.ts')
  })

  it('TC-2.4 锚点失效项是 pending / gapKind=consistency（不阻断，靠人裁决）', () => {
    const built = buildSheet({ ...base, anchorGaps: ['任务一 → tests/gone.test.ts'] })
    const item = built.sheet.items.find(i => i.criterion.startsWith(ANCHOR_GAP_PREFIX))
    expect(item).toBeDefined()
    expect(item?.status).toBe('pending')
    expect(item?.gapKind).toBe('consistency')
    expect(item?.source).toEqual({ kind: 'requirement' })
  })

  it('TC-2.5 非测试文件路径不参与（docs/src 不算验收锚点）', () => {
    const tasks = [task({ id: 't-1', acceptance: '见 docs/requirements/REQ-x/design/interfaces.md 与 src/a.ts' })]
    expect(collectMissingAnchors(fakeDocs(['tests']), tasks)).toEqual([])
  })

  it('TC-2.6 canceled 任务不参与锚点征集', () => {
    const tasks = [task({ id: 't-1', status: 'canceled', acceptance: 'npx vitest run tests/gone.test.ts' })]
    expect(collectMissingAnchors(fakeDocs(['tests']), tasks)).toEqual([])
  })

  it('TC-2.7 工作区没有 tests/ 目录 → 整段跳过（读数未知不追加，裸夹具工作区不制造噪声）', () => {
    const tasks = [task({ id: 't-1', acceptance: 'npx vitest run tests/gone.test.ts' })]
    expect(collectMissingAnchors(fakeDocs([]), tasks)).toEqual([])
  })
})
