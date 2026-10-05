/**
 * 归档对账行渲染测试（REQ-261004183621-de3f t4 / FR-5）。
 *
 * 重点两条：**0 ≠ 未对账**（老记录不显示 0），以及未列明细要带上"已声明不收"的理由。
 */
import { describe, expect, it } from 'vitest'
import { archiveReconcileLine, renderArchiveSection } from '../src/client/views/verification.ts'
import type { RequirementRecord } from '../src/client/types.ts'

const DIR = 'docs/requirements/REQ-abc123'

function reqWith(archive: unknown): RequirementRecord {
  return {
    id: 'REQ-abc123', title: '需求', description: '', status: 'done', category: 'feature',
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    archive,
  } as unknown as RequirementRecord
}

const baseArchive = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  mergedInto: ['docs/architecture/project-manual.md'],
  indexEntry: '归档清单对账',
  submittedAt: 1,
  submittedBy: { kind: 'agent', sessionId: 's' },
}

describe('T13 对账行', () => {
  it('显示三份计数与闸门', () => {
    const html = archiveReconcileLine(reqWith({
      ...baseArchive,
      reconcile: {
        gate: 'enforce',
        listed: ['a', 'b', 'c'],
        exempted: [{ path: 'rtm-design.yml', rule: 'rtm-reports' }],
        unlisted: [],
        acknowledged: [],
        at: 1,
      },
    }))
    expect(html).toContain('已列 3')
    expect(html).toContain('豁免 1')
    expect(html).toContain('未列 0')
    expect(html).toContain('闸门=enforce')
    expect(html).toContain('data-reconcile="enforce"')
    expect(html).not.toContain('dsh-pm-archive-unlisted') // 未列为空 → 不摊明细
  })

  it('未列非空 → 摊明细，并区分「已声明不收」与「未声明」', () => {
    const html = archiveReconcileLine(reqWith({
      ...baseArchive,
      reconcile: {
        gate: 'warn',
        listed: ['a'],
        exempted: [],
        unlisted: [DIR + '/tasks/t-1.md', DIR + '/evidence/x.txt'],
        acknowledged: [{ path: DIR + '/tasks/t-1.md', reason: '任务卡由台账渲染' }],
        at: 1,
      },
    }))
    expect(html).toContain('dsh-pm-archive-unlisted')
    expect(html).toContain('已声明不收：任务卡由台账渲染')
    expect(html).toContain('（未声明）')
    expect(html).toContain('闸门=warn')
  })

  it('补录过 → 注明补录次数', () => {
    const html = archiveReconcileLine(reqWith({
      ...baseArchive,
      reconcile: { gate: 'enforce', listed: [], exempted: [], unlisted: [], acknowledged: [], at: 1 },
      amendments: [{ docs: [{ kind: 'notes', path: 'x' }], reason: 'r', at: 2, by: { kind: 'agent', sessionId: 's' } }],
    }))
    expect(html).toContain('补录 1 次')
  })

  it('无归档记录 → 不渲染该行（空串）', () => {
    expect(archiveReconcileLine(reqWith(undefined))).toBe('')
  })
})

describe('T15 存量记录（0 ≠ 未对账）', () => {
  it('无 reconcile → 显示「未对账」，不显示 0', () => {
    const html = archiveReconcileLine(reqWith({ ...baseArchive }))
    expect(html).toContain('未对账')
    expect(html).toContain('data-reconcile="none"')
    expect(html).not.toContain('未列 0')
  })

  it('归档区块整体渲染：对账行在其中，且不抛错', () => {
    const withReconcile = renderArchiveSection(reqWith({
      ...baseArchive,
      reconcile: { gate: 'enforce', listed: ['a'], exempted: [], unlisted: [], acknowledged: [], at: 1 },
    }))
    expect(withReconcile).toContain('清单对账：已列 1')
    const legacy = renderArchiveSection(reqWith({ ...baseArchive }))
    expect(legacy).toContain('未对账（本功能上线前归档）')
  })
})
