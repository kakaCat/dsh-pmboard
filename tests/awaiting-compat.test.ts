// serves: FR-3
/**
 * 兼容形态用例（REQ-261006170150-52cc · t-0808ec / design/data-model「迁移与兼容」+ interfaces 兼容性矩阵）。
 *
 * 要锁的是什么：本次修复给等待位加了三个**可选**口子（`dialogs` / `onCleared` / `notifyDrivable`）。
 * 兼容性口径是**缺省即旧行为**——不注入这些口子的装配（存量组合根、别家测试替身、嵌入式用法）
 * 必须与改造前逐字一致，且**任何形态都不得抛**。三种形态逐条锁：
 *
 *   ① 全缺省：`enter` 零行为、`exit` 只按台账事实作答（不闻不问在途表）；
 *   ② 只 `dialogs`：登记与解除照旧，但没有回调可发（`notified=false`）；
 *   ③ 只 `notifyDrivable`（无在途表）：登记零行为；台账本就不在等待态 ⇒ 无清位事件 ⇒ 回调 0 次。
 *
 * 为什么必须有用例：这三个口子都在**不回滚**的写路径上（清位是事实）。缺省行为一旦漂移，
 * 存量装配会静默改变语义——那是本仓最贵的一类缺陷（"夹具里绿、线上崩"）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import {
  enterAwaitingConfirm,
  exitAwaitingConfirm,
  isAwaitingConfirmStop,
} from '../src/application/internal/awaiting-confirm.js'
import { createWakeHeartbeat } from '../src/application/dive/wake-heartbeat.js'

const REQ_ID = 'REQ-000001'
const AGENT = 'agent-1'
const REF = 'pc-compat-1'

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

describe('① 全缺省装配：与改造前逐字一致', () => {
  it('enter 零行为（无在途表 ⇒ 不写停手位）且不抛', async () => {
    const h = seeded()
    await expect(enterAwaitingConfirm(
      { store: h.store, now: () => h.clock.t },
      { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
    )).resolves.toBeUndefined()

    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })

  it('exit 只按台账事实作答：非等待态 ⇒ {cleared:false,notified:false}，不抛', async () => {
    const h = seeded()
    const res = await exitAwaitingConfirm(
      { store: h.store, now: () => h.clock.t },
      { requirementId: REQ_ID, ref: REF, reason: 'answered' },
    )

    expect(res).toEqual({ cleared: false, notified: false })
  })

  it('心跳缺省 dialogInFlight ⇒ 对账整段跳过，tick 不抛', async () => {
    const h = seeded()
    const out = await createWakeHeartbeat({
      store: h.store,
      now: () => h.clock.t,
      wake: () => true,
    }).tick()

    expect(out.resumed).toEqual([])
    expect(out.paused).toEqual([])
  })
})

describe('② 只 dialogs：登记/解除照旧，但没有回调可发', () => {
  it('enter 写停手位、exit 清位，且 notified=false（未装配 onCleared）', async () => {
    const h = seeded()
    const registry = new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => REF })

    await enterAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
    )
    expect(registry.inFlightFor(REQ_ID)).toBe(true)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)

    const res = await exitAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { requirementId: REQ_ID, ref: REF, reason: 'answered' },
    )

    expect(res).toEqual({ cleared: true, notified: false })
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })
})

describe('③ 只 notifyDrivable（无在途表）：登记零行为，回调 0 次', () => {
  it('enter 零行为；exit 无清位事件 ⇒ 回调一次也不发', async () => {
    const h = seeded()
    const called: string[] = []

    await enterAwaitingConfirm(
      { store: h.store, now: () => h.clock.t, onCleared: (id) => { called.push(id) } },
      { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
    )
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)

    const res = await exitAwaitingConfirm(
      { store: h.store, now: () => h.clock.t, onCleared: (id) => { called.push(id) } },
      { requirementId: REQ_ID, ref: REF, reason: 'board' },
    )

    expect(res).toEqual({ cleared: false, notified: false })
    expect(called).toEqual([])
  })
})

describe('三形态共用：永不抛 + 返回值向后兼容', () => {
  it('未知 ref / 未知需求 在三种形态下都不抛', async () => {
    const h = seeded()
    const registry = new PendingConfirmRegistry({ now: () => h.clock.t })

    const forms = [
      { store: h.store, now: () => h.clock.t },
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { store: h.store, now: () => h.clock.t, onCleared: () => { throw new Error('不该被调用') } },
    ]
    for (const deps of forms) {
      await expect(exitAwaitingConfirm(deps, { requirementId: 'REQ-NOPE', ref: 'pc-nope', reason: 'answered' }))
        .resolves.toEqual({ cleared: false, notified: false })
    }
  })

  it('既有调用方可继续忽略返回值（沿用改造前的写法）', async () => {
    const h = seeded()
    const registry = new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => REF })
    await enterAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
    )

    // 改造前的调用形态：`void exitAwaitingConfirm(...)`——本轮改动不得让它变成错误用法
    await expect((async () => {
      void exitAwaitingConfirm(
        { store: h.store, dialogs: registry, now: () => h.clock.t },
        { requirementId: REQ_ID, reason: 'board' },
      )
    })()).resolves.toBeUndefined()
  })
})
