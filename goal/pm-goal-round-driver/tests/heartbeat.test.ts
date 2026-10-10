/**
 * 心跳对账：防两类静默（没人推进 / 死等）。判据逐条 + 在闸整趟跳过 + 达阈值写停手位。
 */
import { describe, it, expect, vi } from 'vitest'
import { planWake, createGoalHeartbeat, type HeartbeatFacts, type HeartbeatPorts } from 'pm-goal-round-driver/heartbeat.js'

const NOW = 1_000_000
const base: HeartbeatFacts = { id: 'REQ-x', armed: true, hasWork: true }
const opts = { freshMs: 60_000 }

describe('planWake · 判据', () => {
  it('armed + 有活 + 不新鲜 → 叫醒', () => {
    expect(planWake(base, NOW, opts)).toEqual({ kind: 'wake', id: 'REQ-x' })
  })

  it.each([
    ['not-armed', { armed: false }],
    ['runtime-paused', { runtimePaused: true }],
    ['advance-paused:stalled', { advancePausedReason: 'stalled' }],
    ['awaiting-human', { awaitingHuman: true }],
    ['no-work', { hasWork: false }],
    ['fresh', { lastWakeAt: NOW - 1_000 }],
    ['fresh', { lastActiveAt: NOW - 1_000 }],
  ] as Array<[string, Partial<HeartbeatFacts>]>)('%s → 不叫醒', (reason, over) => {
    const plan = planWake({ ...base, ...over }, NOW, opts)
    expect(plan).toMatchObject({ kind: 'skip', reason })
  })

  it('等人优先于有活（等人不是故障，硬叫只会空转）', () => {
    expect(planWake({ ...base, awaitingHuman: true, hasWork: true }, NOW, opts))
      .toMatchObject({ kind: 'skip', reason: 'awaiting-human' })
  })

  it('活跃记录过窗 → 可以再叫', () => {
    expect(planWake({ ...base, lastActiveAt: NOW - 120_000 }, NOW, opts).kind).toBe('wake')
  })
})

function ports(facts: HeartbeatFacts[], accept = true) {
  const calls: Record<string, unknown[]> = { wake: [], woken: [], failed: [] }
  const p: HeartbeatPorts = {
    facts: () => facts,
    wake: vi.fn(async (id: string) => { calls.wake.push(id); return accept }),
    markWoken: (id, at) => { calls.woken.push([id, at]) },
    markWakeFailed: (id, reason, at) => { calls.failed.push([id, reason, at]) },
    trace: () => {},
    now: () => NOW,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  return { p, calls }
}

describe('createGoalHeartbeat · 一拍', () => {
  it('叫醒成功 → 刷 lastWakeAt', async () => {
    const { p, calls } = ports([base])
    const tick = await createGoalHeartbeat(p, opts).tick()
    expect(tick.woken).toEqual(['REQ-x'])
    expect(calls.woken).toEqual([['REQ-x', NOW]])
  })

  it('在闸 → **整趟跳过**（不叫醒、不刷 lastWakeAt、不碰健康位）', async () => {
    const { p, calls } = ports([base])
    p.latchOpen = () => true
    const tick = await createGoalHeartbeat(p, opts).tick()
    expect(tick.skippedByLatch).toBe(true)
    expect(calls.wake).toEqual([])
    expect(calls.woken).toEqual([])
    expect(calls.failed).toEqual([])
  })

  it('窗口不受理 → 记失败；连续达阈值（3）→ 写停手位一次', async () => {
    const { p, calls } = ports([base], false)
    const hb = createGoalHeartbeat(p, opts)
    await hb.tick()
    await hb.tick()
    expect(calls.failed).toEqual([])            // 未达阈值
    await hb.tick()
    expect(calls.failed).toEqual([['REQ-x', 'wake-undeliverable:3', NOW]])
  })

  it('叫醒抛错按不受理处理（不冒泡）', async () => {
    const { p, calls } = ports([base])
    p.wake = async () => { throw new Error('boom') }
    const tick = await createGoalHeartbeat(p, opts).tick()
    expect(tick.failed).toEqual(['REQ-x'])
    expect(calls.failed).toEqual([])
  })

  it('一次成功清零失败计数（抖动自愈）', async () => {
    const facts = [base]
    let accept = false
    const { p, calls } = ports(facts)
    p.wake = async (id: string) => { calls.wake.push(id); return accept }
    const hb = createGoalHeartbeat(p, opts)
    await hb.tick(); await hb.tick()
    accept = true
    await hb.tick()
    accept = false
    await hb.tick(); await hb.tick()
    expect(calls.failed).toEqual([])            // 计数已清零，再两次也没到阈值
  })
})
