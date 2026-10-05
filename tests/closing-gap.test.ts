/**
 * 收尾闭环在只读投影上的可见性（REQ-261001154450-b918 t7 / serves: FR-6）。
 *
 * 背景：REQ-8475 归档时**从没提交过归档材料**，但所有读面都显示"完成"。
 * 本用例锁住：只要需求已归档、又没有 kind='archive' 的产物，投影就必须带 closing_gap。
 */
import { describe, it, expect } from 'vitest'
import { projectRequirement } from '../src/application/internal/support.js'

const req = (over: Record<string, unknown> = {}) => ({
  id: 'REQ-X', title: '示例', status: 'archived', category: 'feature', artifacts: [], ...over,
}) as never

describe('closing_gap 只读投影（FR-6）', () => {
  it('已归档但没交归档材料 → 投影带 closing_gap=archive_missing', () => {
    expect(projectRequirement(req()).closing_gap).toBe('archive_missing')
    expect(projectRequirement(req({ artifacts: [{ kind: 'requirement' }, { kind: 'verification' }] })).closing_gap)
      .toBe('archive_missing')
  })

  it('交了归档材料 → 不再有缺口（键整体不出现，而不是给空值）', () => {
    const p = projectRequirement(req({ artifacts: [{ kind: 'archive' }] }))
    expect('closing_gap' in p).toBe(false)
  })

  it('两个"材料已交"信号任一在场都算闭环（记录 or 产物）', () => {
    // submitArchive 写的是 archive 记录；产物簿登记是另一条通道——只认一条会互相打架
    expect('closing_gap' in projectRequirement(req({ archive: { dir: 'docs/x', docs: [] } }))).toBe(false)
    expect(projectRequirement(req({ archive: undefined, artifacts: [] })).closing_gap).toBe('archive_missing')
  })

  it('未归档的需求不谈闭环（进行中也绝不误报"未闭环"）', () => {
    expect('closing_gap' in projectRequirement(req({ status: 'implementing' }))).toBe(false)
    expect('closing_gap' in projectRequirement(req({ status: 'accepting' }))).toBe(false)
  })

  it('基础投影字段不变（零行为变更）', () => {
    const p = projectRequirement(req({ status: 'implementing', category: undefined }))
    expect(p).toMatchObject({ id: 'REQ-X', title: '示例', status: 'implementing', category: '' })
  })
})
