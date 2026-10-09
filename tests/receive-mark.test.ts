/**
 * 需求侧接收标记单测（REQ-d3e61a T-5 / serve FR-3）
 *
 * 验收口径：**取消某张卡对某条的交付后，该条回落为「未被接收（红）」**。
 * 这是 R9 的解药：它当时在任何界面上都没有"没人接"的痕迹，所以能溜过四个节点。
 */
import { describe, expect, it } from 'vitest'
import { clauseReceiveStatus, unreceivedClauses } from '../src/application/internal/content-gate-wiring.js'

const ROOTS = ['FR-1', 'FR-4', 'FR-9']

describe('clauseReceiveStatus（四态）', () => {
  it('有卡接收 → received，并列出卡 id', () => {
    const s = clauseReceiveStatus(ROOTS, [{ id: 't-1', requirement_refs: ['FR-1'] }], [{ id: 't-1', status: 'in_progress' }])
    expect(s.find(x => x.clause === 'FR-1')).toEqual({ clause: 'FR-1', state: 'received', by: ['t-1'] })
  })

  it('接收它的卡全结单且有证据 → done', () => {
    const s = clauseReceiveStatus(
      ROOTS,
      [{ id: 't-1', requirement_refs: ['FR-1'] }],
      [{ id: 't-1', status: 'done', lastReport: { completed: ['改了 a.ts'] } }],
    )
    expect(s.find(x => x.clause === 'FR-1')?.state).toBe('done')
  })

  it('卡结单但**没有证据** → 停在 received（不算完成）', () => {
    const s = clauseReceiveStatus(
      ROOTS,
      [{ id: 't-1', requirement_refs: ['FR-1'] }],
      [{ id: 't-1', status: 'done' }],
    )
    expect(s.find(x => x.clause === 'FR-1')?.state).toBe('received')
  })

  it('无人接收且未裁剪 → **unreceived（红）**', () => {
    const s = clauseReceiveStatus(ROOTS, [{ id: 't-1', requirement_refs: ['FR-1'] }], [])
    expect(s.find(x => x.clause === 'FR-9')?.state).toBe('unreceived')
  })

  it('显式裁剪 → skipped（不是红）', () => {
    const s = clauseReceiveStatus(ROOTS, [], [], ['FR-9'])
    expect(s.find(x => x.clause === 'FR-9')?.state).toBe('skipped')
  })

  it('camelCase 的 requirementRefs 同样被认', () => {
    const s = clauseReceiveStatus(ROOTS, [{ id: 't-1', requirementRefs: ['FR-4'] }], [])
    expect(s.find(x => x.clause === 'FR-4')?.state).toBe('received')
  })
})

describe('**验收场景**：取消某张卡对某条的交付 → 该条回落为「未被接收（红）」', () => {
  const before = [
    { id: 't-1', requirement_refs: ['FR-1', 'FR-4'] },
    { id: 't-2', requirement_refs: ['FR-9'] },
  ]
  const after = [
    { id: 't-1', requirement_refs: ['FR-1'] },       // 取消了对 FR-4 的交付
    { id: 't-2', requirement_refs: ['FR-9'] },
  ]
  const tasks = [{ id: 't-1', status: 'in_progress' }, { id: 't-2', status: 'in_progress' }]

  it('取消前：三条都有接收，无红', () => {
    expect(unreceivedClauses(clauseReceiveStatus(ROOTS, before, tasks))).toEqual([])
  })

  it('取消后：FR-4 **回落为未被接收（红）**', () => {
    const s = clauseReceiveStatus(ROOTS, after, tasks)
    expect(s.find(x => x.clause === 'FR-4')?.state).toBe('unreceived')
    expect(unreceivedClauses(s)).toEqual(['FR-4'])
  })

  it('未被接收的清单是显式输出（供看板/状态面标红），不是靠人读全文', () => {
    const s = clauseReceiveStatus(ROOTS, after, tasks)
    expect(unreceivedClauses(s)).toHaveLength(1)
    expect(unreceivedClauses(s)[0]).toBe('FR-4')
  })
})

/**
 * 两个来源必须合并（2026-10-05 上线实体查出的**页面撒谎**事故）。
 *
 * 事故出处：本需求 18 张父卡在台账里明确写着 `requirementRefs`（覆盖 FR-1~FR-15），
 * 但 `decomposition.md` 里**一个 FR 引用都没有**（`collectTaskRefs` 读它 → 空数组）。
 * 条款接收投影原先只信文档表 → 页面报「15 条条款全部没人接」，
 * 人类第一眼就问「缺口 16 条 这个是真的吗」——**不是真的**。
 *
 * 口径：判红的语义是「既没有卡承接、也没有裁剪记录」，**不是**「拆分文档那张表里没写」。
 * `reqboard_task_amend` 只写台账卡片字段，文档表是计划期快照；任一来源声明了承接就不该判红。
 */
describe('台账 requirementRefs ∪ 拆分文档 RTM 表', () => {
  it('台账写了、文档表空 → 必须算「已被接收」（事故现场）', async () => {
    const { mergeTaskRefs, ledgerTaskRefs, clauseReceiveStatus, unreceivedClauses } =
      await import('../src/application/internal/content-gate-wiring.js')
    const ledger = ledgerTaskRefs([
      { id: 't-a', title: 'A', requirementRefs: ['FR-1', 'FR-4'] },
      { id: 't-b', title: 'B', requirementRefs: ['FR-9'] },
      { id: 't-c', title: 'C（没写条款的卡不进判据）' },
    ])
    const refs = mergeTaskRefs([], ledger) // 文档侧空数组 = decomposition.md 没有 FR 引用
    const tasks = [
      { id: 't-a', status: 'done', title: 'A', lastReport: { completed: ['改了 a.ts'] } },
      { id: 't-b', status: 'in_progress', title: 'B' },
      { id: 't-c', status: 'done', title: 'C（没写条款的卡不进判据）' },
    ]
    const s = clauseReceiveStatus(ROOTS, refs, tasks)
    expect(unreceivedClauses(s)).toEqual([]) // 修前这里会是 ['FR-1','FR-4','FR-9']
    expect(s.find(x => x.clause === 'FR-1')?.state).toBe('done') // 全结单 + 有证据
    expect(s.find(x => x.clause === 'FR-4')?.state).toBe('done')
    expect(s.find(x => x.clause === 'FR-9')?.state).toBe('received') // 在跑 → 接收但未完成
  })

  it('文档表写了、台账没写 → 仍然算接收（原口径不许退化）', async () => {
    const { mergeTaskRefs, clauseReceiveStatus, unreceivedClauses } =
      await import('../src/application/internal/content-gate-wiring.js')
    const refs = mergeTaskRefs([{ id: 't-doc', requirement_refs: ['FR-1'] }], [])
    const s = clauseReceiveStatus(ROOTS, refs, [{ id: 't-doc', status: 'in_progress' }])
    expect(unreceivedClauses(s)).toEqual(['FR-4', 'FR-9'])
    expect(s.find(x => x.clause === 'FR-1')?.state).toBe('received')
  })

  it('两个来源都有 → 条款取并集，不丢任何一方的声明', async () => {
    const { mergeTaskRefs, clauseReceiveStatus, unreceivedClauses } =
      await import('../src/application/internal/content-gate-wiring.js')
    const refs = mergeTaskRefs(
      [{ id: 't-1', requirement_refs: ['FR-1'] }],
      [{ id: 't-1', requirementRefs: ['FR-4'] }, { id: 't-2', requirementRefs: ['FR-9'] }],
    )
    expect([...(refs.find(r => r.id === 't-1')?.requirementRefs ?? [])].sort()).toEqual(['FR-1', 'FR-4'])
    const s = clauseReceiveStatus(ROOTS, refs, [
      { id: 't-1', status: 'in_progress' }, { id: 't-2', status: 'in_progress' },
    ])
    expect(unreceivedClauses(s)).toEqual([])
  })
})
