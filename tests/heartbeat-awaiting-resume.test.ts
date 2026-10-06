// serves: FR-3
/**
 * 心跳「停手对账 → 清位即驱动」用例（REQ-261006170150-52cc · design/test-cases.md 的 TC-8、TC-9）。
 *
 * 要锁的是什么：台账写着「停手等弹框」而内存里那条登记**已经过期**（人走了 / 插件重启丢了登记表）时，
 * 一趟心跳不仅要**清掉停手位**，还要**请求一次驱动**把 agent 叫起来——
 * 只清位不叫醒 = 需求不再「等人」，却也不会跑起来（这正是"恢复只恢复了一半"的形态）。
 *
 * 反面同样要锁：登记**没过期**（人还在看框，阻塞型 30 分钟时）时不得清位、不得叫醒——
 * 否则 agent 会抢在人前面动（分档 TTL 的存在意义）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { enterAwaitingConfirm, isAwaitingConfirmStop } from '../src/application/internal/awaiting-confirm.js'
import { createWakeHeartbeat } from '../src/application/dive/wake-heartbeat.js'
import { LIMITS } from '../src/domain/limits.js'

const REQ_ID = 'REQ-000001'
const AGENT = 'agent-1'
const REF = 'pc-hb-1'
const T30 = LIMITS.pendingConfirmTtlMs
const T60 = LIMITS.timeoutInteractiveMs

/** 需求种子：armed + 绑定本 agent（可驱动），随后由用例写停手位。 */
function seeded(): ReturnType<typeof makeHarness> {
  return makeHarness({
    requirements: [req({
      id: REQ_ID,
      status: 'implementing',
      category: 'feature',
      autoRun: true,
      sourceSessionId: AGENT,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
    })],
  })
}

/** 真在途登记表（固定时钟）；`suspend:false` = 阻塞型（分档 60 分钟那档）。 */
function registryFor(h: ReturnType<typeof makeHarness>): PendingConfirmRegistry {
  return new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => REF })
}

/** 进入一次「等弹框」停手态。 */
async function enterOnce(h: ReturnType<typeof makeHarness>, registry: PendingConfirmRegistry): Promise<void> {
  await enterAwaitingConfirm(
    { store: h.store, dialogs: registry, now: () => h.clock.t },
    { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'gate', suspend: false },
  )
}

/** 心跳夹具：`calls` 收集 notifyDrivable 的调用（= 清位即驱动的次数）。 */
function heartbeatFor(h: ReturnType<typeof makeHarness>, registry: PendingConfirmRegistry, calls: string[]) {
  return createWakeHeartbeat({
    store: h.store,
    now: () => h.clock.t,
    wake: () => true,
    dialogInFlight: (id) => registry.inFlightFor(id),
    notifyDrivable: (id) => { calls.push(id) },
  })
}

describe('TC-8 在途已过期 ⇒ 一趟 tick 清位并请求驱动（FR-3）', () => {
  it('清位 + resumed 含该需求 + notifyDrivable 恰 1 次', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)

    h.clock.t += T60 + 1 // 越过阻塞型分档 TTL ⇒ 判「无人等待」

    const calls: string[] = []
    const out = await heartbeatFor(h, registry, calls).tick()

    expect(out.resumed).toContain(REQ_ID)
    expect(calls).toEqual([REQ_ID]) // 恰 1 次
    const after = (await h.store.get(REQ_ID))!
    expect(isAwaitingConfirmStop(after)).toBe(false)
    expect(after.comments.some(c => c.body.includes('[Dive 恢复]') && c.body.includes('出口=expired'))).toBe(true)
  })

  it('未装配 notifyDrivable ⇒ 照旧清位、不报错（兼容：行为与改造前逐字一致）', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    h.clock.t += T60 + 1

    const out = await createWakeHeartbeat({
      store: h.store,
      now: () => h.clock.t,
      wake: () => true,
      dialogInFlight: (id) => registry.inFlightFor(id),
    }).tick()

    expect(out.resumed).toContain(REQ_ID)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })
})

describe('TC-9 在途未过期 ⇒ 停手位保持、不请求驱动（FR-3）', () => {
  it('阻塞型在 30 分钟时仍算「有人在等」⇒ resumed 不含、notifyDrivable 0 次', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)

    h.clock.t += T30 + 1 // 越过挂起档（30 分钟），但阻塞型还有 30 分钟

    const calls: string[] = []
    const out = await heartbeatFor(h, registry, calls).tick()

    expect(registry.inFlightFor(REQ_ID)).toBe(true) // 人还在看框
    expect(out.resumed).not.toContain(REQ_ID)
    expect(calls).toEqual([]) // 一次都不叫醒
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)
  })

  it('台账本就不是 awaiting 態 ⇒ 不因本改动清位或叫醒（零回归）', async () => {
    const h = seeded()
    const registry = registryFor(h)
    const calls: string[] = []

    const out = await heartbeatFor(h, registry, calls).tick()

    expect(out.resumed).toEqual([])
    expect(calls).toEqual([])
  })
})
