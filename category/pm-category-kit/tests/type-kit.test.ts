/**
 * 类型层契约的单测（REQ-261009174713-7bc8 · 卡 t-3b14a7 / RF-25 · RF-28）。
 *
 * 判据四条，逐条对应卡面验收：
 *   ① 注册表能按类型命中，未命中**响亮**抛错且消息里带问的那个 category；
 *   ② 六类不齐时装配期抛错，并点名缺哪几个（不按 default 兜底）；
 *   ③ 快照是**确定性**的：同批规格换顺序 dump 逐字相同；
 *   ④ 坏规格逐条点名（不静默通过）——这是这类门禁最容易失效的方向。
 */
import { describe, expect, it } from 'vitest'
import {
  createTypeRegistry,
  missingCategories,
  serializeTypeSpecs,
  validateTypeSpec,
  violationText,
  type RequirementTypeSpec,
} from '../src/index.js'

/** 造一份最小合法规格（只覆盖断言用到的字段，其余留默认）。 */
function spec(category: RequirementTypeSpec['category'], over: Partial<RequirementTypeSpec> = {}): RequirementTypeSpec {
  return {
    category,
    label: '标签-' + category,
    rootSectionsDelta: ['节一'],
    requiredDesignDocs: [],
    archive: { requireManual: false, requiredDocs: ['requirement'], mergeTargets: ['docs/guides/'], note: '一句话依据' },
    ...over,
  }
}

const SIX: RequirementTypeSpec['category'][] = ['feature', 'bug', 'doc', 'refactor', 'spike', 'chore']

describe('① 注册表：命中与未命中', () => {
  it('按类型命中，取回的正是那份规格', () => {
    const reg = createTypeRegistry(SIX.map((c) => spec(c)))
    expect(reg.require('bug').category).toBe('bug')
    expect(reg.get('nope')).toBeUndefined()
    expect(reg.categories()).toEqual(SIX)
  })

  it('未命中抛错，且消息里带着问的那个 category 与已注册名单', () => {
    const reg = createTypeRegistry([spec('feature'), spec('bug')])
    expect(() => reg.require('chore')).toThrow(/chore/)
    expect(() => reg.require('chore')).toThrow(/feature, bug/)
    expect(() => reg.require(undefined)).toThrow(/未传 category/)
  })
})

describe('② 六类齐备：缺类要点名', () => {
  it('缺三个就点名三个，不按 default 兜底', () => {
    const reg = createTypeRegistry([spec('feature'), spec('bug'), spec('doc')])
    expect(missingCategories(reg.specs)).toEqual(['refactor', 'spike', 'chore'])
    expect(() => reg.requireComplete()).toThrow(/refactor, spike, chore/)
    expect(() => reg.requireComplete()).toThrow(/缺类/)
  })

  it('六类齐备时不抛', () => {
    const reg = createTypeRegistry(SIX.map((c) => spec(c)))
    expect(reg.missing()).toEqual([])
    expect(() => reg.requireComplete()).not.toThrow()
  })
})

describe('③ 快照：确定性', () => {
  it('同一注册表 dump 两次逐字相同', () => {
    const reg = createTypeRegistry(SIX.map((c) => spec(c, { requiredDesignDocs: ['architecture.md'] })))
    expect(reg.snapshot()).toBe(reg.snapshot())
  })

  it('换传入顺序 dump 仍逐字相同（顺序归一按类型枚举，不看调用方）', () => {
    const shuffled = [...SIX].reverse().map((c) => spec(c))
    const forward = SIX.map((c) => spec(c))
    expect(serializeTypeSpecs(shuffled)).toBe(serializeTypeSpecs(forward))
    expect(createTypeRegistry(shuffled).snapshot()).toBe(createTypeRegistry(forward).snapshot())
  })

  it('数组内部顺序**不被排序**（mergeTargets 的顺序就是优先级）', () => {
    const a = serializeTypeSpecs([spec('bug', { archive: { requireManual: false, requiredDocs: ['requirement'], mergeTargets: ['a/', 'b/'], note: '依据' } })])
    const b = serializeTypeSpecs([spec('bug', { archive: { requireManual: false, requiredDocs: ['requirement'], mergeTargets: ['b/', 'a/'], note: '依据' } })])
    expect(a).not.toBe(b)
  })
})

describe('④ 坏规格逐条点名', () => {
  it('类型枚举非法 / 标签为空 / 归档缺失，各自被点名', () => {
    const bad = { ...spec('feature'), category: 'nope' as RequirementTypeSpec['category'], label: '  ' }
    const v = validateTypeSpec({ ...bad, archive: undefined as unknown as RequirementTypeSpec['archive'] })
    const paths = v.map((x) => x.path)
    expect(paths).toContain('category')
    expect(paths).toContain('label')
    expect(paths).toContain('archive')
  })

  it('重复项与绝对路径模板引用都要红', () => {
    const v = validateTypeSpec(spec('feature', {
      rootSectionsDelta: ['产品定义', '产品定义'],
      templates: [{ stage: 'brainstorming', requirement: { relPath: '/abs/feature.md' } }],
    }))
    expect(violationText(v)).toMatch(/有重复项/)
    expect(violationText(v)).toMatch(/不能是绝对路径/)
  })

  it('重复登记同一类型 → 构建期就抛错（不把坏注册表带进运行期）', () => {
    expect(() => createTypeRegistry([spec('feature'), spec('feature')])).toThrow(/类型重复登记：feature/)
  })
})
