// serves: FR-1
/**
 * 全局上游闩单测（REQ-261004065652-5c1c · t1 / TC-3 前置）。
 *
 * 三条纪律各有用例（见模块头注）：纯读不开 I/O、trip 幂等不续期、clear 只认人/系统。
 * 时间一律走注入时钟——禁止真实等待。
 */
import { describe, it, expect } from 'vitest'
import {
  createProviderLatch, DEFAULT_PROVIDER_LATCH_TTL_MS,
} from '../src/application/internal/provider-latch.js'

function harness(start = 1_000_000) {
  let now = start
  const latch = createProviderLatch({ now: () => now })
  return { latch, advance: (ms: number) => { now += ms }, at: () => now }
}

describe('ProviderLatch · 置闩与判读', () => {
  it('未置闩 → 关（isOpen false、until/reasonClass 均 undefined）', () => {
    const { latch } = harness()
    expect(latch.isOpen()).toBe(false)
    expect(latch.until()).toBeUndefined()
    expect(latch.reasonClass()).toBeUndefined()
  })

  it('trip → 开，until = now + 缺省 TTL（5 小时）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH', requirementId: 'REQ-a' })
    expect(h.latch.isOpen()).toBe(true)
    expect(h.latch.until()).toBe(h.at() + DEFAULT_PROVIDER_LATCH_TTL_MS)
    expect(h.latch.reasonClass()).toBe('error:AUTH')
    expect(h.latch.snapshot()).toMatchObject({ open: true, reasonClass: 'error:AUTH', requirementId: 'REQ-a' })
  })

  it('自定义 ttlMs 生效；非正数回落缺省（不造出"立刻过期"的假闩）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH', ttlMs: 60_000 })
    expect(h.latch.until()).toBe(h.at() + 60_000)

    const h2 = harness()
    h2.latch.trip({ reasonClass: 'error:AUTH', ttlMs: -1 })
    expect(h2.latch.until()).toBe(h2.at() + DEFAULT_PROVIDER_LATCH_TTL_MS)
  })

  it('幂等：同因重复置闩**不延长** until（否则持续报错 = 永久停摆）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH' })
    const first = h.latch.until()
    h.advance(60_000)
    h.latch.trip({ reasonClass: 'error:AUTH' })
    expect(h.latch.until()).toBe(first)
  })

  it('病因变化 → 重新计时（新病因有新窗口）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH' })
    h.advance(60_000)
    h.latch.trip({ reasonClass: 'error:QUOTA' })
    expect(h.latch.reasonClass()).toBe('error:QUOTA')
    expect(h.latch.until()).toBe(h.at() + DEFAULT_PROVIDER_LATCH_TTL_MS)
  })

  it('TTL 过期 → 自动关（读侧不写盘）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH', ttlMs: 1_000 })
    h.advance(1_000)
    expect(h.latch.isOpen()).toBe(false)
    expect(h.latch.until()).toBeUndefined()
    expect(h.latch.reasonClass()).toBeUndefined()
  })
})

describe('ProviderLatch · 清闩只认人/系统', () => {
  it('人 clear → 关，且快照留下 clearedAt（可观测"谁在何时解开"）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH' })
    h.latch.clear({ by: 'human', reason: '额度已恢复' })
    expect(h.latch.isOpen()).toBe(false)
    expect(h.latch.snapshot().clearedAt).toBe(h.at())
  })

  it('非法 by → 零写入（自动路径不得清闩）', () => {
    const h = harness()
    h.latch.trip({ reasonClass: 'error:AUTH' })
    h.latch.clear({ by: 'agent' as never })
    expect(h.latch.isOpen()).toBe(true)
  })
})
