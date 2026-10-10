/**
 * `pm-type-feature` 规格的最小断言（REQ-261009174713-7bc8 t-3ea341）。
 *
 * 判据：规格能过注册表（合法性），且**关键字段逐字等于现网单一源**——搬运漂移即红。
 */
import { describe, expect, it } from 'vitest'
import { createTypeRegistry } from 'pm-type-kit'
import { spec } from '../src/index.js'

const SECTIONS = [
  "产品定义",
  "用户与角色",
  "功能点"
] as const

describe('pm-type-feature 规格', () => {
  it('能被注册表接受，且按 category 取回的正是它', () => {
    const reg = createTypeRegistry([spec])
    expect(reg.require('feature')).toBe(spec)
    expect(spec.category).toBe('feature')
  })

  it('中文标签与必填节 delta 逐字等于现网单一源', () => {
    expect(spec.label).toBe("功能（新增能力）")
    expect([...spec.rootSectionsDelta]).toEqual([...SECTIONS])
  })

  it('必交设计文档逐字一致、归档必交文档非空', () => {
    expect([...spec.requiredDesignDocs]).toEqual(["architecture.md","data-model.md","interfaces.md","test-cases.md","use-cases.md"])
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
