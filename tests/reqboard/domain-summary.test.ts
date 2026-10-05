/**
 * L1 领域单测 · 需求摘要投影（REQ-261002161439-277d · t1 / FR-1、FR-4）。
 *
 * 覆盖卡上验收 ②：`summarize()` 输出**不含** comments/artifacts/verification/plan/archive，
 * 且 `advanceAlert` 只含 `pausedReason` 与 `failureStreak`。
 *
 * 这条断言守的是本次改造的核心承诺：首屏载荷**不随运行时间无界增长**。只要有人把大字段
 * 顺手加进摘要，这里立刻红（而不是等线上载荷重新涨到几 MB）。
 */
import { describe, it, expect } from 'vitest'
import {
  BIG_FIELD_KEYS,
  SUMMARY_KEYS,
  advanceAlertOf,
  isBigFieldKey,
  summarize,
  type SummarizableRequirement,
} from '../../src/domain/requirement/RequirementSummary.js'

/** 最小记录：只给必填字段，其余一概不给（用来断言"可选字段不下发该键"）。 */
const MINIMAL: SummarizableRequirement = {
  id: 'REQ-261002161439-277d',
  title: '数据层重构',
  status: 'implementing',
  createdAt: 100,
  updatedAt: 200,
  version: 7,
}

const REQUIRED_KEYS = ['id', 'title', 'status', 'blocked', 'createdAt', 'updatedAt', 'version', 'commentCount', 'artifactCount']

describe('summarize：键集边界', () => {
  it('最小记录的键集恰好是必填九项（可选字段缺失即无该键，不补 undefined）', () => {
    const s = summarize(MINIMAL)
    expect(Object.keys(s).sort()).toEqual([...REQUIRED_KEYS].sort())
    expect('paused' in s).toBe(false)
    expect('advanceAlert' in s).toBe(false)
    expect('category' in s).toBe(false)
  })

  it('全字段记录的键集恰好等于 SUMMARY_KEYS（没有多余键）', () => {
    const s = summarize({
      ...MINIMAL,
      category: 'feature',
      promptDifficulty: 'expert',
      paused: true,
      autoRun: true,
      sourceSessionId: 'session-abc',
      workspaceRoot: '/ws',
      docBasePath: 'docs/requirements/<REQ>/',
      comments: [{ id: 'c-1' }],
      artifacts: [{ kind: 'design' }, { kind: 'plan' }],
      priority: 7,
      advance: { pausedReason: 'fail', failureStreak: 2, lockAt: 1_700_000_000_000 },
    })
    expect(Object.keys(s).sort()).toEqual([...SUMMARY_KEYS].sort())
  })

  it('大字段一个都不在摘要里（即使入参带着它们）', () => {
    const s = summarize({
      ...MINIMAL,
      comments: [{ id: 'c-1' }],
      artifacts: [{ kind: 'design' }],
      advance: { pausedReason: 'fail', failureStreak: 1 },
    }) as unknown as Record<string, unknown>
    for (const key of BIG_FIELD_KEYS) expect(key in s).toBe(false)
    // 摘要只带计数，不带本体
    expect(s.commentCount).toBe(1)
    expect(s.artifactCount).toBe(1)
  })

  it('isBigFieldKey 与 BIG_FIELD_KEYS 同源', () => {
    expect(BIG_FIELD_KEYS).toEqual(['comments', 'statusHistory', 'artifacts', 'plan', 'verification', 'archive'])
    for (const k of BIG_FIELD_KEYS) expect(isBigFieldKey(k)).toBe(true)
    for (const k of ['title', 'status', 'commentCount', 'advanceAlert']) expect(isBigFieldKey(k)).toBe(false)
  })
})

describe('summarize：计数来源', () => {
  it('只有数组时用数组长度', () => {
    const s = summarize({ ...MINIMAL, comments: [{}, {}, {}], artifacts: [{}] })
    expect(s.commentCount).toBe(3)
    expect(s.artifactCount).toBe(1)
  })

  it('两者都没有时计数为 0（不是 undefined）', () => {
    const s = summarize(MINIMAL)
    expect(s.commentCount).toBe(0)
    expect(s.artifactCount).toBe(0)
  })

  it('显式计数优先于数组长度（v10 热记录只带计数字段）', () => {
    const s = summarize({ ...MINIMAL, comments: [{}, {}], commentCount: 144, artifactCount: 216 })
    expect(s.commentCount).toBe(144)
    expect(s.artifactCount).toBe(216)
  })
})

describe('advanceAlert：只放告警子集，不放无上界的历史', () => {
  it('history 再长也不进摘要', () => {
    const alert = advanceAlertOf({
      pausedReason: 'stagnation',
      failureStreak: 3,
      // 故意多塞两个键：投影必须只挑白名单里的两个
      ...({ history: new Array(1000).fill({ at: 1 }), lockAt: 1 } as object),
    })
    expect(alert).toEqual({ pausedReason: 'stagnation', failureStreak: 3 })
    expect(Object.keys(alert!).sort()).toEqual(['failureStreak', 'pausedReason'])
  })

  it('两个字段都没有 → undefined（不是空对象）', () => {
    expect(advanceAlertOf(undefined)).toBeUndefined()
    expect(advanceAlertOf({})).toBeUndefined()
  })

  it('只有一个字段时只带那一个', () => {
    expect(advanceAlertOf({ failureStreak: 0 })).toEqual({ failureStreak: 0 })
    expect('pausedReason' in advanceAlertOf({ failureStreak: 0 })!).toBe(false)
  })

  it('缺省 advance 时摘要不带 advanceAlert 键', () => {
    expect('advanceAlert' in summarize(MINIMAL)).toBe(false)
  })
})

describe('summarize：透传与缺省', () => {
  it('blocked 缺省为 false（必填布尔，不留 undefined）', () => {
    expect(summarize(MINIMAL).blocked).toBe(false)
    expect(summarize({ ...MINIMAL, blocked: true }).blocked).toBe(true)
  })

  it('标量与可选标量原样透传，不改写', () => {
    const s = summarize({
      ...MINIMAL,
      category: 'refactor',
      promptDifficulty: 'advanced',
      paused: false,
      autoRun: false,
      sourceSessionId: 'session-1',
      workspaceRoot: '/Users/mac/ws',
      docBasePath: 'docs/rfcs/',
    })
    expect(s.category).toBe('refactor')
    expect(s.promptDifficulty).toBe('advanced')
    // false 是"明确关闭"，必须下发该键（与 undefined=未设置 区分）
    expect(s.paused).toBe(false)
    expect(s.autoRun).toBe(false)
    expect(s.sourceSessionId).toBe('session-1')
    expect(s.workspaceRoot).toBe('/Users/mac/ws')
    expect(s.docBasePath).toBe('docs/rfcs/')
    expect(s.id).toBe(MINIMAL.id)
    expect(s.version).toBe(7)
  })

  it('摘要可 JSON 序列化且往返不丢键（客户端载荷的真实路径）', () => {
    const s = summarize({ ...MINIMAL, category: 'feature', advance: { failureStreak: 1 } })
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
})
