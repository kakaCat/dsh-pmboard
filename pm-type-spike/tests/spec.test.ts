/**
 * `pm-type-spike` 规格的最小断言（REQ-261009174713-7bc8 t-3ea341）。
 *
 * 判据：规格能过注册表（合法性），且**关键字段逐字等于现网单一源**——搬运漂移即红。
 */
import { describe, expect, it } from 'vitest'
import { createTypeRegistry } from 'pm-type-kit'
import { spec } from '../src/index.js'

const SECTIONS = [
  "待答问题",
  "结论"
] as const

describe('pm-type-spike 规格', () => {
  it('能被注册表接受，且按 category 取回的正是它', () => {
    const reg = createTypeRegistry([spec])
    expect(reg.require('spike')).toBe(spec)
    expect(spec.category).toBe('spike')
  })

  it('中文标签与必填节 delta 逐字等于现网单一源', () => {
    expect(spec.label).toBe("调研（产出是结论，不是留下的代码）")
    expect([...spec.rootSectionsDelta]).toEqual([...SECTIONS])
  })

  it('必交设计文档逐字一致、归档必交文档非空', () => {
    expect([...spec.requiredDesignDocs]).toEqual([])
    expect(spec.archive.requiredDocs.length).toBeGreaterThan(0)
    expect(spec.archive.note.trim().length).toBeGreaterThan(0)
  })

  it('模板地址全部是资产包内相对路径', () => {
    for (const entry of spec.templates ?? []) {
      const refs = [entry.requirement, entry.prototype, entry.decomposition, entry.taskCard, entry.testEvidence, entry.review, entry.verification, entry.archiveIndex, entry.retro, ...(entry.designDocs ?? [])]
      for (const ref of refs) if (ref !== undefined) expect(ref.relPath.startsWith('/')).toBe(false)
    }
  })
})
