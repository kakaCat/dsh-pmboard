/**
 * 验收单任务投影单测（REQ-260930183951-eb6c FR-1）serves: FR-1
 *
 * 验收口径：投影**必须**透传 `parentId`——它是 domain 侧二次过滤唯一的输入来源。
 * 本文件测的是"投影"这一层（可证伪：把 `toSheetTasks` 里的 `parentId` 删掉，TC-1.1 立刻变红）；
 * 「1 父 3 子经 use case 只出父卡项」的行为守则由 tests/verification-sheet.test.ts 兜底。
 */
import { describe, expect, it } from 'vitest'
import { toSheetTasks } from '../src/application/internal/sheet-tasks.js'
import { buildSheet, type SheetBuildInput } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { TaskRecord } from '../src/shared/protocol.js'

/** 最小任务记录（只填与投影相关的字段，其余按既有测试的宽松构造法补齐）。 */
const task = (over: Partial<TaskRecord> & { id: string }): TaskRecord => ({
  requirementId: 'REQ-x',
  title: '任务',
  description: '',
  phase: 'implement',
  side: 'backend',
  dependsOn: [],
  scope: { apis: [], tables: [], files: [] },
  acceptance: 'npx vitest run tests/a.test.ts 全绿',
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

describe('REQ-260930183951-eb6c FR-1：任务投影透传 parentId', () => {
  it('TC-1.1 子卡的 parentId 必须出现在投影结果里（删掉即变红）', () => {
    const projected = toSheetTasks([task({ id: 't-sub1', parentId: 't-parent1' })])
    expect(projected).toHaveLength(1)
    expect(projected[0].parentId).toBe('t-parent1')
  })

  it('TC-1.2 parentId 为空串 → 归一为顶层卡（结果对象不含该键）', () => {
    const projected = toSheetTasks([task({ id: 't-top', parentId: '' })])
    expect(projected).toHaveLength(1)
    expect('parentId' in projected[0]).toBe(false)
  })

  it('TC-1.3 canceled 剔除，且顺序与输入一致', () => {
    const projected = toSheetTasks([
      task({ id: 't-a' }),
      task({ id: 't-b', status: 'canceled' }),
      task({ id: 't-c', parentId: 't-a' }),
    ])
    expect(projected.map(t => t.id)).toEqual(['t-a', 't-c'])
  })

  it('TC-1.4 投影产物喂给 buildSheet → domain 二次过滤真的生效（只剩父卡项）', () => {
    const input: SheetBuildInput = {
      sheetHistoryLength: 0,
      tasks: toSheetTasks([
        task({ id: 't-parent1', title: '父卡一' }),
        task({ id: 't-sub1', parentId: 't-parent1', title: '父卡一·研发' }),
        task({ id: 't-sub2', parentId: 't-parent1', title: '父卡一·测试' }),
      ]),
      evidence: ['ev'],
      generatedAt: 1,
      generatedBy: { kind: 'agent', sessionId: 'w' },
    }
    const taskItems = buildSheet(input).sheet.items.filter(i => i.source.kind === 'task')
    expect(taskItems).toHaveLength(1)
    expect(taskItems[0].source).toEqual({ kind: 'task', taskId: 't-parent1' })
  })
})
