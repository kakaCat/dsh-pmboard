/**
 * 停手纪律（迁自 pm-round-driver）：解锁两条证据 / 人的意图优先 / 退避与熔断。
 */
import { describe, it, expect } from 'vitest'
import {
  latchBlocks, setLatch, markLatchWritable, inBackoff, noteFailure, clearFailure,
} from 'pm-goal-round-driver/hold.js'
import type { HoldState } from 'pm-goal-round-driver/hold.js'

const trunc = (s: string): string => s.slice(0, 200)
const armedHealthy = { requirementPresent: true, activation: 'armed', driverHealthState: 'healthy' } as const

function latched(): HoldState {
  const s: HoldState = {}
  setLatch(s, 'AUTH', '额度耗尽', 1_000, trunc)
  markLatchWritable(s, 'AUTH', true)
  return s
}

describe('latchBlocks · 唯一解锁规则', () => {
  it('无锁 → 不挡', () => {
    expect(latchBlocks({}, armedHealthy)).toEqual({ blocked: false, released: false })
  })

  it('两条证据齐（写过 + 台账显式 healthy）→ 解锁并清锁', () => {
    const s = latched()
    expect(latchBlocks(s, armedHealthy)).toEqual({ blocked: false, released: true })
    expect(s.latch).toBeUndefined()
  })

  it('只写了台账但没写成功（writable=false）→ 继续闭锁（假解锁回归）', () => {
    const s: HoldState = {}
    setLatch(s, 'AUTH', 'x', 1_000, trunc)
    // 台账"看起来 healthy"（其实是我们没写成功）——不得解锁
    expect(latchBlocks(s, armedHealthy)).toEqual({ blocked: true, released: false })
  })

  it('台账不是显式 healthy → 继续闭锁', () => {
    const s = latched()
    expect(latchBlocks(s, { ...armedHealthy, driverHealthState: 'paused' }).blocked).toBe(true)
    expect(latchBlocks(s, { ...armedHealthy, driverHealthState: undefined }).blocked).toBe(true)
  })

  it('人的意图被改成手动（activation≠armed）→ 继续闭锁，只有人能 arm 回来', () => {
    const s = latched()
    expect(latchBlocks(s, { ...armedHealthy, activation: 'disarmed' }).blocked).toBe(true)
  })

  it('进程级上游闸在闸 → 即使台账 healthy 也挡', () => {
    const s = latched()
    expect(latchBlocks(s, { ...armedHealthy, providerLatchOpen: true }).blocked).toBe(true)
  })

  it('需求读不到 → 继续闭锁（不猜）', () => {
    const s = latched()
    expect(latchBlocks(s, { ...armedHealthy, requirementPresent: false }).blocked).toBe(true)
  })

  it('旧回执不翻新锁：reasonClass 不同 → writable 保持 false', () => {
    const s: HoldState = {}
    setLatch(s, 'AUTH', 'x', 1_000, trunc)
    markLatchWritable(s, 'TRANSPORT', true)
    expect(s.latch?.writable).toBe(false)
  })
})

describe('退避与熔断', () => {
  it('同因累加、异因归零；达阈值即熔断', () => {
    const s: HoldState = {}
    expect(noteFailure(s, 'TRANSPORT', 0).tripped).toBe(false)
    expect(noteFailure(s, 'TRANSPORT', 1).failure.count).toBe(2)
    expect(noteFailure(s, 'TRANSPORT', 2)).toMatchObject({ tripped: true })
    // 异因归零
    expect(noteFailure(s, 'AUTH', 3).failure.count).toBe(1)
  })

  it('退避窗内不起轮，过期放行；一次成功清账', () => {
    const s: HoldState = {}
    noteFailure(s, 'TRANSPORT', 1_000)
    expect(inBackoff(s, 1_001)).toBe(true)
    expect(inBackoff(s, 1_000_000)).toBe(false)
    clearFailure(s)
    expect(inBackoff(s, 1_001)).toBe(false)
  })
})
