/**
 * 挂起确认的有效期（REQ-261001154450-b918 t3 / serves: FR-5）。
 *
 * 为什么锁这条：REQ-8475 实测里，一个陈旧挂起（pc-2c6cfb）一直挂到归档环节才把写路径拦住，
 * 而"多久算陈旧"此前借用的是**文字证据窗口**（1 小时）——两件事共用一个数字。
 * 本用例把有效期钉在 `LIMITS.pendingConfirmTtlMs`（30 分钟）上，并证明过期即放行。
 */
import { describe, it, expect } from 'vitest'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { LIMITS } from '../src/domain/limits.js'

function make(ttlMs?: number) {
  let now = 1_000_000
  const reg = new PendingConfirmRegistry({ now: () => now, newTicket: () => 'pc-000001', ...(ttlMs === undefined ? {} : { ttlMs }) })
  return { reg, advance: (ms: number) => { now += ms } }
}

const input = { windowKey: 'w1', requirementId: 'REQ-X', target: 'artifact' as const, kind: 'verification' as const }

describe('挂起确认有效期（FR-5）', () => {
  it('默认有效期 = LIMITS.pendingConfirmTtlMs（30 分钟），不再借用证据窗口', () => {
    expect(LIMITS.pendingConfirmTtlMs).toBe(30 * 60_000)
    const { reg, advance } = make()
    reg.register(input)
    advance(LIMITS.pendingConfirmTtlMs - 1)
    expect(reg.pendingForWindow('w1')?.ticket).toBe('pc-000001')
  })

  it('超过有效期后：不再计入本窗口挂起 → 写路径自动放行', () => {
    const { reg, advance } = make()
    reg.register(input)
    advance(LIMITS.pendingConfirmTtlMs + 1)
    expect(reg.pendingForWindow('w1')).toBeUndefined()
    expect(reg.get('pc-000001', 'w1')).toBeUndefined()
  })

  it('中止过的挂起从中止时刻重新计时（旧记录不提前失效）', () => {
    const { reg, advance } = make()
    reg.register(input)
    advance(LIMITS.pendingConfirmTtlMs - 1_000)
    reg.markInterrupted('pc-000001')
    advance(LIMITS.pendingConfirmTtlMs - 1_000)
    expect(reg.pendingForWindow('w1')?.ticket).toBe('pc-000001')
    advance(2_000)
    expect(reg.pendingForWindow('w1')).toBeUndefined()
  })

  it('自定义 ttlMs 仍可覆盖（测试/特殊场景不被写死）', () => {
    const { reg, advance } = make(1_000)
    reg.register(input)
    advance(1_001)
    expect(reg.pendingForWindow('w1')).toBeUndefined()
  })

  it('跨窗口记录从不计入（本窗口不替别的窗口背锅）', () => {
    const { reg } = make()
    reg.register(input)
    expect(reg.pendingForWindow('w2')).toBeUndefined()
  })
})
