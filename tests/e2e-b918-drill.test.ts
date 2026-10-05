/**
 * 端到端演练 · 收尾门硬化六步（REQ-261001154450-b918 t10 / serves: FR-1, FR-2, FR-3, FR-6, FR-7）。
 *
 * 为什么把演练做成**测试**而不是一次性脚本：脚本跑完就腐烂；测试进 CI 后，
 * 这六条判据每次改动都会被重新走一遍。六步全部打在真实模块上（不是复述文档）。
 *
 * 运行：npx vitest run tests/e2e-b918-drill.test.ts
 */
import { describe, it, expect } from 'vitest'
import { applyVerdicts, isAllPassed, sheetGateStatus, type SheetLike } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { closingGapOf, isClosed } from '../src/domain/status/Predicates.js'
import { planRefsFromDoc, planRefsMissing } from '../src/application/internal/content-gate-wiring.js'
import { dispatchNoteOf } from '../src/application/internal/auto-advance-note.js'

const sheet = (items: unknown[]): SheetLike => ({ version: 1, generatedAt: 0, generatedBy: { kind: 'agent' }, items: items as never } as SheetLike)
const item = (o: Record<string, unknown>) => ({ id: 'v1-1', source: { kind: 'requirement' }, criterion: '某验收项', evidence: [], status: 'pending', ...o }) as never

describe('六步演练', () => {
  it('① FR-7 计划引用：文档覆盖表能被解析 → 引用齐备才放行', async () => {
    const doc = ['# 计划', '', '## 条款覆盖对照表', '', '| 需求条款 | 接收任务 | 覆盖说明 |', '|---|---|---|', '| FR-1 | t1 | 契约 |', '| FR-7 | t1、t2 | 通道与门禁 |', ''].join('\n')
    const reader = { exists: (p: string) => p.endsWith('decomposition.md'), read: async () => doc, stat: () => undefined }
    const map = await planRefsFromDoc(reader as never, { id: 'REQ-x' } as never)
    // 表里两行分别把 t1、t2 都覆盖到了；t3 没出现在任何一行 → 应被点名
    expect([...map.keys()].sort()).toEqual(['t1', 't2'])
    expect(planRefsMissing(['t1', 't2', 't3'], map)).toEqual(['t3'])
    map.set('t3', ['FR-7'])
    expect(planRefsMissing(['t1', 't2', 't3'], map)).toEqual([])  // 补齐 → 放行
  })

  it('② FR-3 自动投递：回执必须与事实一致（未投递给原因，投递给 run id）', () => {
    expect(dispatchNoteOf({ dispatched: false, reason: 'jobs_unavailable' })).toContain('未投递')
    expect(dispatchNoteOf({ dispatched: true, runId: 'run-e2e' })).toContain('run-e2e')
  })

  it('③ FR-1 验收不留白：通过但无实际结果 → unverified、不通过、不归档', () => {
    const s = sheet([item({ id: 'v1-1' })])
    applyVerdicts(s, [{ itemId: 'v1-1', status: 'unverified' }], { kind: 'human' }, 1, [])
    expect(s.items[0]!.status).toBe('unverified')
    expect(isAllPassed(s)).toBe(false)
    expect(sheetGateStatus(s)).toBe('pending')
  })

  it('④ FR-2 系统项必处置：通过却不写处置 → 整批拒绝', () => {
    const s = sheet([item({ id: 'v1-2', gapKind: 'traceability' })])
    expect(() => applyVerdicts(s, [{ itemId: 'v1-2', status: 'passed' }], { kind: 'human' }, 1, []))
      .toThrowError(/系统项通过必须写明处置/)
    expect(s.items[0]!.status).toBe('pending')
  })

  it('⑤ FR-6 收尾闭环：已归档但没交归档材料 → archive_missing（不再显示"完成"）', () => {
    expect(closingGapOf({ status: 'archived', artifacts: [], archive: undefined })).toBe('archive_missing')
  })

  it('⑥ FR-6 收尾闭环：交了归档材料 → 闭环成立', () => {
    const closed = { status: 'archived', artifacts: [{ kind: 'archive' }], archive: { dir: 'docs/x', docs: [] } }
    expect(closingGapOf(closed)).toBeUndefined()
    expect(isClosed(closed)).toBe(true)
  })
})
