/**
 * 返工卡与其它卡同门（REQ-261006201920-2adc FR-2 · TC-7 / TC-8 / TC-9）serves: FR-2
 *
 * 缺陷形态：返工卡的验收标准直接取验收项判据原文、`implementation` 拼一句
 * 「按验收意见修复：…」，**不过任何质量门**——于是「与裁定对照（逐条说明如何落实）」
 * 这种零锚点判据（以及 11 个字的兜底文案）照样落库。
 *
 * 口径（本需求）：标准取值三级——判据原文 → 来源卡标准 → **合成**标准；每级都过
 * `checkAcceptance` + `checkHowToVerify`；并继承来源卡的条款引用 / 原型锚点 / 裁定引用 / 体量。
 */
import { describe, it, expect } from 'vitest'
import {
  reworkSpecFor,
  type ReworkSourceTaskLike,
  type SheetItemLike,
  type SheetLike,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { checkAcceptance, checkHowToVerify } from '../src/domain/task/Acceptability.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const
const sheetOf = (items: SheetItemLike[]): SheetLike => ({ version: 2, items, generatedAt: 1, generatedBy: H })

const srcTask = (over: Partial<ReworkSourceTaskLike> & { id: string }): ReworkSourceTaskLike => ({
  title: '来源卡', phase: 'implement', side: 'backend', ...over,
})

/** 判据原文不可照着验的两种典型：零锚点对照项 + 无来源卡的需求级项。 */
const zeroAnchor = (id: string, source: SheetItemLike['source']): SheetItemLike => ({
  id, source, criterion: '与裁定对照（逐条说明如何落实）', evidence: ['e'], status: 'failed', opinion: '没落实',
})

describe('返工卡标准取值三级（FR-2 · TC-7 / TC-9）', () => {
  it('判据原文可照着验 → 直接用它（acceptanceSource=criterion）', () => {
    const item: SheetItemLike = {
      id: 'v2-1', source: { kind: 'task', taskId: 't-a' },
      criterion: 'npx vitest run tests/x.test.ts → 12 passed', evidence: ['e'], status: 'failed', opinion: '重跑',
    }
    const spec = reworkSpecFor(item, sheetOf([item]), [srcTask({ id: 't-a' })])
    expect(spec.acceptanceSource).toBe('criterion')
    expect(spec.acceptance).toBe(item.criterion)
  })

  it('判据原文不可照着验 → 承接来源卡标准（origin），并在实施方案里写明为什么', () => {
    const item = zeroAnchor('v2-2', { kind: 'task', taskId: 't-a' })
    const spec = reworkSpecFor(item, sheetOf([item]), [
      srcTask({ id: 't-a', acceptance: 'npx vitest run tests/rework-gate.test.ts → 全绿' }),
    ])
    expect(spec.acceptanceSource).toBe('origin')
    expect(spec.acceptance).toBe('npx vitest run tests/rework-gate.test.ts → 全绿')
    expect(spec.implementation).toContain('承接')
  })

  it('判据与来源卡都不可执行 → **合成**标准，且合成标准自己过两道判据', () => {
    const item = zeroAnchor('v2-3', { kind: 'requirement' })
    const spec = reworkSpecFor(item, sheetOf([item]), [])
    expect(spec.acceptanceSource).toBe('synthesized')
    expect(spec.acceptance.length).toBeGreaterThan(20)
    expect(checkAcceptance(item.id, spec.acceptance).ok).toBe(true)
    expect(checkHowToVerify(item.id, spec.acceptance).ok).toBe(true)
    expect(spec.acceptance).not.toMatch(/<[^>]{2,40}>/)
  })

  it('TC-7 全量扫描：任何来源的返工卡标准都过计划期 + 验收期两道判据（零锚点卡为 0）', () => {
    const sources: SheetItemLike['source'][] = [
      { kind: 'task', taskId: 't-a' },
      { kind: 'requirement' },
      { kind: 'prototype-compare', prototypePath: 'prototypes/a.html' },
      { kind: 'decision-compare', decisionIds: ['D-1'] },
    ]
    const existing = [srcTask({ id: 't-a', acceptance: '' })]
    for (const src of sources) {
      for (const criterion of ['与裁定对照（逐条说明如何落实）', '', '确认可用', 'npx vitest run tests/x.test.ts → 全绿']) {
        const item: SheetItemLike = { id: 'v2-x', source: src, criterion, evidence: ['e'], status: 'failed', opinion: '修一下' }
        const spec = reworkSpecFor(item, sheetOf([item]), existing)
        expect(checkAcceptance(item.id, spec.acceptance).ok, criterion + ' → ' + spec.acceptance).toBe(true)
        expect(checkHowToVerify(item.id, spec.acceptance).ok, criterion + ' → ' + spec.acceptance).toBe(true)
      }
    }
  })

  it('实施方案不再是一句 11 字兜底：含判据原文与落库后要跑什么', () => {
    const item = zeroAnchor('v2-5', { kind: 'requirement' })
    item.opinion = ''
    const spec = reworkSpecFor(item, sheetOf([item]), [])
    expect(spec.implementation.length).toBeGreaterThan(40)
    expect(spec.implementation).toContain(item.criterion)
    expect(spec.implementation).toContain('命令 + 输出摘要')
  })
})

describe('返工卡继承来源卡的引用与体量（FR-2 · TC-8）', () => {
  const ui = srcTask({
    id: 't-ui', title: 'UI 卡', side: 'frontend',
    acceptance: 'npx vitest run tests/x.test.ts → 全绿',
    requirementRefs: ['FR-3', 'FR-4'],
    prototypeRefs: ['prototypes/verify-disposition.html#FR-3'],
    decisionRefs: ['D-3'],
    footprint: { files: 5, anchors: 8, chars: 3200 },
  })

  it('四类字段逐字继承（不继承 prototypeRefs 会让 UI 卡返工卡被原型锚点门禁钉死）', () => {
    const item = zeroAnchor('v2-6', { kind: 'task', taskId: 't-ui' })
    const spec = reworkSpecFor(item, sheetOf([item]), [ui])
    expect(spec.requirementRefs).toEqual(['FR-3', 'FR-4'])
    expect(spec.prototypeRefs).toEqual(['prototypes/verify-disposition.html#FR-3'])
    expect(spec.decisionRefs).toEqual(['D-3'])
    expect(spec.footprint).toEqual({ files: 5, anchors: 8, chars: 3200 })
  })

  it('来源卡没有这些字段时不虚构（保持 undefined，不写空数组）', () => {
    const item = zeroAnchor('v2-7', { kind: 'task', taskId: 't-plain' })
    const spec = reworkSpecFor(item, sheetOf([item]), [srcTask({ id: 't-plain' })])
    expect(spec.requirementRefs).toBeUndefined()
    expect(spec.prototypeRefs).toBeUndefined()
    expect(spec.decisionRefs).toBeUndefined()
    expect(spec.footprint).toBeUndefined()
  })
})
