/**
 * 双拼字段取值唯一实现的单测（REQ-261007230908-5ccb FR-4 · T6）。
 *
 * 本用例锁的是**语义现状**（design/data-model.md 语义表）：优先级逐字段固定、
 * dep_reasons 两拼取并集且 camel 覆盖同 key。改这三条中任何一条都必须先改设计，
 * 而不是在这里改断言——那正是本需求要防的「归一逻辑各自漂移」。
 *
 * @module dsh-pmboard/tests/dual-field
 *
 * serves: FR-4（双拼字段取值唯一实现的语义锁定）
 */
import { describe, expect, it } from 'vitest'
import { dualMapMerged, readDual } from '../src/shared/dual-field.js'

describe('① readDual：按声明的优先级取第一个已定义的拼法', () => {
  it('snake 优先：两键都给取 snake', () => {
    expect(readDual({ granularity_exempt: '甲', granularityExempt: '乙' }, 'granularity_exempt', 'granularityExempt', 'snake'))
      .toBe('甲')
  })

  it('camel 优先：两键都给取 camel（skip_integration_reason 的现状口径）', () => {
    expect(readDual({ skip_integration_reason: '甲', skipIntegrationReason: '乙' }, 'skip_integration_reason', 'skipIntegrationReason', 'camel'))
      .toBe('乙')
  })

  it('只给 snake / 只给 camel 都能取到（兼容期两种写法都认）', () => {
    expect(readDual({ dep_reasons: ['t2=理由'] }, 'dep_reasons', 'depReasons', 'camel')).toEqual(['t2=理由'])
    expect(readDual({ depReasons: ['t2=理由'] }, 'dep_reasons', 'depReasons', 'camel')).toEqual(['t2=理由'])
  })

  it('两键皆缺 → undefined（不伪造空串；空值语义留调用方）', () => {
    expect(readDual({}, 'a_b', 'aB', 'snake')).toBeUndefined()
  })

  it('显式 undefined 视同缺失（与今日 ?? 语义一致）', () => {
    expect(readDual({ a_b: undefined, aB: '乙' }, 'a_b', 'aB', 'snake')).toBe('乙')
  })

  it('值本身是空串 / null 时原样返回，不在本模块做后处理（trim 归调用方）', () => {
    expect(readDual({ a_b: '', aB: '乙' }, 'a_b', 'aB', 'snake')).toBe('')
    expect(readDual({ a_b: null, aB: '乙' }, 'a_b', 'aB', 'snake')).toBeNull()
  })
})

describe('② dualMapMerged：两拼取并集，同 key camel 覆盖', () => {
  const coerce = (v: unknown): Record<string, string> | undefined => {
    if (!Array.isArray(v)) return undefined
    const out: Record<string, string> = {}
    for (const it of v) {
      if (typeof it !== 'string') continue
      const at = it.indexOf('=')
      if (at > 0) out[it.slice(0, at).trim()] = it.slice(at + 1).trim()
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  it('两拼各有不同 key → 并集保留双方（同一条边写两遍不该互相覆盖）', () => {
    expect(dualMapMerged({ dep_reasons: ['t1=上游建表'], depReasons: ['t2=上游建队列'] }, 'dep_reasons', 'depReasons', coerce))
      .toEqual({ t1: '上游建表', t2: '上游建队列' })
  })

  it('同 key 冲突 → camel 胜出（与既有 Object.assign 顺序逐字一致）', () => {
    expect(dualMapMerged({ dep_reasons: ['t1=旧理由'], depReasons: ['t1=新理由'] }, 'dep_reasons', 'depReasons', coerce))
      .toEqual({ t1: '新理由' })
  })

  it('两者皆无 → undefined（键不出现，不冒充空 map）', () => {
    expect(dualMapMerged({}, 'dep_reasons', 'depReasons', coerce)).toBeUndefined()
    expect(dualMapMerged({ dep_reasons: [] }, 'dep_reasons', 'depReasons', coerce)).toBeUndefined()
  })

  it('只有一拼有效 → 只取那一拼', () => {
    expect(dualMapMerged({ depReasons: ['t3=理由'] }, 'dep_reasons', 'depReasons', coerce)).toEqual({ t3: '理由' })
  })
})
