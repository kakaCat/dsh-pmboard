/**
 * 卡面门读数领域判定单测（REQ-261006175040-12d4 · t1）。
 *
 * 钉住的性质（缺一条，卡面就会重新开始说谎）：
 *   ① 三态齐全：无产物 = `missing`、有产物未落章 = `pending`、已落章 = `confirmed`；
 *   ② `count` = 该 kind 的产物条数（卡面「确认产物（全部 N 份）」的取值）；
 *   ③ `design` 是**成组确认**：多份里只要一份未落章，整门即 `pending`；
 *   ④ 顺序 = 传入门清单顺序（卡面 chips 位置稳定，不排序、不去重）；
 *   ⑤ `planStateOf`：已批 / 被退 / 待批三态 + 无计划 → `undefined`（键不出现）；
 *   ⑥ `archivePreparedOf`：归档记录 ∨ 归档产物 两来源任一即已备（与 `closingGapOf` 同源）。
 *
 * serves: FR-1, FR-3, FR-5
 */
import { describe, it, expect } from 'vitest'
import {
  archivePreparedOf,
  gateReadingsOf,
  planStateOf,
  type GateArtifactFact,
} from '../src/domain/artifact/GateReadings.js'

/** feature 四门（顺序即卡面 chips 顺序）。 */
const FEATURE_KINDS = ['requirement', 'design', 'decomposition', 'verification'] as const

const art = (kind: string, confirmedAt?: number): GateArtifactFact =>
  confirmedAt === undefined ? { kind } : { kind, confirmedAt }

describe('gateReadingsOf：三态与 count', () => {
  it('没有任何产物 ⇒ 全 missing 且 count 为 0', () => {
    const readings = gateReadingsOf(FEATURE_KINDS, [])
    expect(readings).toEqual([
      { kind: 'requirement', status: 'missing', count: 0 },
      { kind: 'design', status: 'missing', count: 0 },
      { kind: 'decomposition', status: 'missing', count: 0 },
      { kind: 'verification', status: 'missing', count: 0 },
    ])
  })

  it('已登记未落章 ⇒ pending（可点确认）；已落章 ⇒ confirmed', () => {
    const readings = gateReadingsOf(FEATURE_KINDS, [
      art('requirement', 1000),
      art('design', 2000),
      art('decomposition'),
    ])
    expect(readings.map(r => [r.kind, r.status])).toEqual([
      ['requirement', 'confirmed'],
      ['design', 'confirmed'],
      ['decomposition', 'pending'],
      ['verification', 'missing'],
    ])
  })

  it('count = 该 kind 的产物条数（design 6 份 ⇒ 6）', () => {
    const six = [1, 2, 3, 4, 5, 6].map(i => art('design', i * 10))
    const readings = gateReadingsOf(['design'], six)
    expect(readings[0]).toEqual({ kind: 'design', status: 'confirmed', count: 6 })
  })

  it('design 成组确认：任一份未落章 ⇒ 整门 pending（哪怕其余 5 份已落章）', () => {
    const readings = gateReadingsOf(['design'], [
      art('design', 10), art('design', 20), art('design', 30),
      art('design', 40), art('design', 50), art('design'),
    ])
    expect(readings[0]?.status).toBe('pending')
    expect(readings[0]?.count).toBe(6)
  })

  it('非成组门取第一条（登记唯一）：首条未落章 ⇒ pending', () => {
    const readings = gateReadingsOf(['requirement'], [art('requirement'), art('requirement', 999)])
    expect(readings[0]?.status).toBe('pending')
  })

  it('顺序 = 传入门清单顺序（不排序、不去重）', () => {
    const readings = gateReadingsOf(['verification', 'requirement', 'verification'], [])
    expect(readings.map(r => r.kind)).toEqual(['verification', 'requirement', 'verification'])
  })

  it('空门清单 ⇒ 空读数（分类无门时不发明门）', () => {
    expect(gateReadingsOf([], [art('requirement', 1)])).toEqual([])
  })
})

describe('planStateOf：三态与缺省', () => {
  it('已批准 / 被退回 / 待批准', () => {
    expect(planStateOf({ approvedAt: 1 })).toBe('approved')
    expect(planStateOf({ rejectedAt: 2 })).toBe('rejected')
    expect(planStateOf({})).toBe('pending')
  })

  it('同时有批准与退回时间 ⇒ 批准优先（已批准是终态，不会被旧退回时间覆盖）', () => {
    expect(planStateOf({ approvedAt: 5, rejectedAt: 3 })).toBe('approved')
  })

  it('没有计划对象 ⇒ undefined（键不出现，不是 pending）', () => {
    expect(planStateOf(undefined)).toBeUndefined()
  })
})

describe('archivePreparedOf：两来源同源（与 closingGapOf 一致）', () => {
  it('归档记录在册 ⇒ 已备', () => {
    expect(archivePreparedOf({ archive: { docs: [] }, hasArchiveArtifact: false })).toBe(true)
  })

  it('归档产物在册 ⇒ 已备（存量可能只有产物、没有记录）', () => {
    expect(archivePreparedOf({ hasArchiveArtifact: true })).toBe(true)
  })

  it('两者都没有 ⇒ 未备（列表行显示「归档材料待补」）', () => {
    expect(archivePreparedOf({ hasArchiveArtifact: false })).toBe(false)
  })

  it('archive 为显式 null ⇒ 视作没有记录（不冒充已备）', () => {
    expect(archivePreparedOf({ archive: null, hasArchiveArtifact: false })).toBe(false)
  })
})
