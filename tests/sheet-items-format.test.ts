/**
 * 验收单编号连续性与需求级项标题（REQ-260930183951-eb6c FR-3 / FR-4）serves: FR-3, FR-4
 *
 * 验收口径：
 *  - FR-3：`items[].id` 严格为 `v<version>-1 .. v<version>-N`，**无空洞**（旧口径 taskCount+N
 *    预留位会跳号：实测 2d65 验收单 v1-30 → v1-33）；
 *  - FR-4：需求级来源的项标题按缺口类型区分（旧口径三处硬编码，验收结果表里两行同名）。
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHOR_GAP_PREFIX,
  REQUIREMENT_LEVEL_CRITERION,
  buildSheet,
  requirementItemTitle,
  type SheetBuildInput,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { renderVerificationDoc } from '../src/domain/workflow/VerificationDoc.js'

const base: SheetBuildInput = {
  sheetHistoryLength: 0,
  tasks: [
    { id: 't-1', title: '任务一', acceptance: 'npx vitest run tests/a.test.ts' },
    { id: 't-2', title: '任务二', acceptance: 'npx vitest run tests/b.test.ts' },
  ],
  evidence: ['ev'],
  generatedAt: 1,
  generatedBy: { kind: 'agent', sessionId: 'w' },
}

/** 触发全部系统项（孤儿 / 不可照验 / E2E / 三方一致性 / 锚点失效 / 追溯断链）。 */
const allGaps: SheetBuildInput = {
  ...base,
  orphanTestFiles: ['tests/orphan.test.ts'],
  unverifiableItems: ['任务九：没写怎么验'],
  e2eCoverage: false,
  consistencyGaps: ['FR-9 设计缺失'],
  anchorGaps: ['任务一 → tests/gone.test.ts'],
  traceabilityGaps: ['FR-5'],
}

describe('REQ-260930183951-eb6c FR-3：编号连续无空洞', () => {
  it('TC-3.1 全部系统项触发 → id 严格为 v1-1..v1-N（N === items.length）', () => {
    const { sheet } = buildSheet(allGaps)
    const ids = sheet.items.map(i => i.id)
    const expected = sheet.items.map((_, idx) => `v1-${idx + 1}`)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('TC-3.2 只触发 E2E 缺口 → 紧接需求级项，不跳号（2d65 事故形态回归）', () => {
    const { sheet } = buildSheet({ ...base, e2eCoverage: false })
    // 2 任务 + 需求级 + E2E = 4 项；旧口径会把 E2E 写成 taskCount+4 = v1-6（跳号）
    expect(sheet.items.map(i => i.id)).toEqual(['v1-1', 'v1-2', 'v1-3', 'v1-4'])
    expect(sheet.items[3].criterion).toContain('E2E 覆盖')
  })

  it('TC-3.3 返工续版（reworkOnly）编号同样连续', () => {
    const prev = buildSheet(allGaps).sheet
    const failed = prev.items.map(i => (i.id === 'v1-1' ? { ...i, status: 'failed' as const, opinion: '不行' } : i))
    const { sheet, reworkOnly } = buildSheet({
      ...allGaps,
      sheetHistoryLength: 0,
      prevSheet: { ...prev, items: failed },
    })
    expect(reworkOnly).toBe(true)
    expect(sheet.items.map(i => i.id)).toEqual(sheet.items.map((_, idx) => `v2-${idx + 1}`))
  })

  it('TC-3.4 无系统项（2 任务）→ 行为与旧口径逐字一致', () => {
    expect(buildSheet(base).sheet.items.map(i => i.id)).toEqual(['v1-1', 'v1-2', 'v1-3'])
  })
})

describe('REQ-260930183951-eb6c FR-4：需求级项标题按缺口类型区分', () => {
  it('TC-4.1 表驱动：六种组合各自可辨', () => {
    expect(requirementItemTitle(REQUIREMENT_LEVEL_CRITERION, undefined)).toBe('需求级验收')
    expect(requirementItemTitle('E2E 覆盖：**无（缺口）**', 'e2e')).toBe('需求级验收 · E2E 覆盖')
    expect(requirementItemTitle('孤儿用例（缺映射）：…', 'orphan')).toBe('需求级验收 · 孤儿用例')
    expect(requirementItemTitle('FR 追溯断链：…', 'traceability')).toBe('需求级验收 · 追溯断链')
    expect(requirementItemTitle(`${ANCHOR_GAP_PREFIX}：以下验收标准…`, 'consistency')).toBe('需求级验收 · 锚点失效')
    expect(requirementItemTitle('三方一致性（做什么 × 怎么做 × 实际做了什么）：…', 'consistency')).toBe('需求级验收 · 三方一致性')
  })

  it('TC-4.2 渲染：两行需求级项不再同名', () => {
    const { sheet } = buildSheet(allGaps)
    const reqItems = sheet.items.filter(i => i.source.kind === 'requirement')
    const titles = reqItems.map(i => requirementItemTitle(i.criterion, i.gapKind))
    expect(new Set(titles).size).toBe(titles.length) // 无重名
    const markdown = renderVerificationDoc({
      reqId: 'REQ-t',
      title: 'T',
      summary: 's',
      sheetVersion: sheet.version,
      items: reqItems.map(i => ({
        id: i.id,
        title: requirementItemTitle(i.criterion, i.gapKind),
        criterion: i.criterion,
        howToVerify: i.criterion,
        status: i.status,
      })),
      testReport: [],
      docCheck: { passed: true, missing: [] },
    })
    expect(markdown).toContain('需求级验收 · E2E 覆盖')
    expect(markdown).toContain('需求级验收 · 锚点失效')
    expect(markdown).toContain('需求级验收 · 追溯断链')
  })

  it('TC-4.3 无缺口的需求级项仍是裸「需求级验收」（普通项不受影响）', () => {
    const { sheet } = buildSheet(base)
    const reqItem = sheet.items.find(i => i.source.kind === 'requirement')
    expect(requirementItemTitle(reqItem!.criterion, reqItem!.gapKind)).toBe('需求级验收')
  })
})
