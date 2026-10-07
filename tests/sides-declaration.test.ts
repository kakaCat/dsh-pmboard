/**
 * front-matter `sides` 硬门禁（2026-10-06 文档质量门禁加固）——**含反向演练**。
 *
 * 修前的病灶是**静默过滤**：`designDocPolicyFrom` 只留 {frontend, backend}，非法值与缺失
 * 都不报错。于是 `sides: [doc]`（实测 dafb 就是这么写的）与「根本没写 sides」（实测 9e04）
 * 产生完全相同的后果——条件必交设计文档（frontend.md / backend.md）永不触发，全链条无人报错。
 *
 * 验收口径（可证伪）：
 *   ① 写 `sides: [doc]` → 提交当场拒（反向演练）；
 *   ② 缺 `sides` → 拒；
 *   ③ 合法写法（括号 / 逗号 / 显式空表）→ 放行，且 `sides: []` 是**自洽声明**不是遗漏；
 *   ④ 非 feature/refactor 类型不判（bug/chore/doc/spike 没有条件必交文档）。
 */
import { describe, expect, it } from 'vitest'
import { sidesGateFailure } from '../src/application/internal/content-gate-wiring.js'
import { sidesDeclarationGap } from '../src/application/internal/category-doc-sets.js'
import { DOC_QUALITY_RULES_SINCE, docQualityRulesApply } from '../src/domain/workflow/DocQualityRules.js'

const fmOf = (frontmatterLines: string[]) =>
  Object.fromEntries(frontmatterLines
    .map(l => l.split(':'))
    .filter(parts => parts.length >= 2)
    .map(([k, ...rest]) => [(k ?? '').trim(), rest.join(':').trim()]))

const gateCodeOf = (category: string, frontmatterLines: string[], createdAt?: number) =>
  sidesGateFailure(category, fmOf(frontmatterLines), createdAt ?? DOC_QUALITY_RULES_SINCE)?.code

describe('反向演练：sides 值非法 / 缺失必须被拒（不再静默过滤）', () => {
  it('sides: [doc] → requirement_sides_invalid（历史事故形态）', () => {
    expect(gateCodeOf('feature', ['sides: [doc]'])).toBe('requirement_sides_invalid')
  })

  it('sides: [frontend, doc] → 也拒（合法值与非法的混合写法不许放行）', () => {
    expect(gateCodeOf('refactor', ['sides: [frontend, doc]'])).toBe('requirement_sides_invalid')
  })

  it('缺 sides → 拒（缺声明与非法值后果相同，必须同样响亮）', () => {
    expect(gateCodeOf('feature', [])).toBe('requirement_sides_invalid')
  })

  it('sides 为空串 → 拒（要么写 []，要么写出实际端侧）', () => {
    expect(gateCodeOf('feature', ['sides:'])).toBe('requirement_sides_invalid')
  })
})

describe('合法写法一律放行（不误伤）', () => {
  it('括号写法 / 逗号写法 / 显式空表', () => {
    expect(gateCodeOf('feature', ['sides: [frontend, backend]'])).toBeUndefined()
    expect(gateCodeOf('feature', ['sides: frontend, backend'])).toBeUndefined()
    expect(gateCodeOf('refactor', ['sides: []'])).toBeUndefined()
  })

  it('非 feature / refactor 类型不判（它们没有条件必交设计文档）', () => {
    for (const c of ['bug', 'spike', 'doc', 'chore']) {
      expect(gateCodeOf(c, []), c).toBeUndefined()
      expect(gateCodeOf(c, ['sides: [doc]']), c).toBeUndefined()
    }
  })
})

describe('存量不追溯（与 PROTOTYPE_RULES_SINCE 同构）', () => {
  it('规则上线前立项的需求不判，上线后一律判', () => {
    expect(docQualityRulesApply(DOC_QUALITY_RULES_SINCE - 1)).toBe(false)
    expect(docQualityRulesApply(DOC_QUALITY_RULES_SINCE)).toBe(true)
    // 读数不可得（旧台账 / 测试夹具）→ 不判（宁可少报，不误报存量）
    expect(docQualityRulesApply(undefined)).toBe(false)
  })

  it('存量需求即使缺 sides 也放行（不追溯），新需求当场拒', () => {
    expect(gateCodeOf('feature', [], DOC_QUALITY_RULES_SINCE - 1)).toBeUndefined()
    expect(gateCodeOf('feature', [], DOC_QUALITY_RULES_SINCE)).toBe('requirement_sides_invalid')
  })
})

describe('sidesDeclarationGap 单点判定（门禁与提示同源）', () => {
  it('返回的缺口文案点名问题与合法值域', () => {
    const missing = sidesDeclarationGap('feature', {})
    expect(missing).toContain('sides')
    expect(missing).toContain('feature')

    const illegal = sidesDeclarationGap('refactor', { sides: '[doc]' })
    expect(illegal).toContain('doc')
    expect(illegal).toContain('frontend / backend')
  })

  it('unknown 类型 / 未声明 category 一律不判', () => {
    expect(sidesDeclarationGap(undefined, {})).toBeUndefined()
    expect(sidesDeclarationGap('chore', {})).toBeUndefined()
  })
})
