// serves: FR-1, FR-2
/**
 * 等待位「清位回调」用例（REQ-261006170150-52cc · design/test-cases.md 的 TC-1、TC-2）。
 *
 * 口径：`exitAwaitingConfirm` 只在**台账真的把 `awaiting-confirm:*` 清成 healthy** 时回调一次
 * （FR-2 的触发源），且回调永不外溢（清位是事实，通知失败不回滚）。
 *
 * 用仓库既有夹具：`tests/application/harness.ts`（内存台账 + FakeDocs/Clock/Ids），零真实 IO。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import {
  enterAwaitingConfirm,
  exitAwaitingConfirm,
  isAwaitingConfirmStop,
} from '../src/application/internal/awaiting-confirm.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-000001'
const AGENT = 'agent-1'
const REF = 'pc-test-1'

/** 需求种子：armed + healthy + 绑定本 agent（可驱动）。 */
function seeded(over: Partial<RequirementRecord> = {}): ReturnType<typeof makeHarness> {
  return makeHarness({
    requirements: [req({
      id: REQ_ID,
      status: 'implementing',
      category: 'feature',
      autoRun: true,
      sourceSessionId: AGENT,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
      ...over,
    })],
  })
}

/** 在途登记表（真实现；now 绑夹具时钟、ticket 固定便于断言）。 */
function registryFor(h: ReturnType<typeof makeHarness>): PendingConfirmRegistry {
  return new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => REF })
}

/** 进入一次等待（写停手位 + 在途登记）。 */
async function enterOnce(h: ReturnType<typeof makeHarness>, registry: PendingConfirmRegistry): Promise<void> {
  await enterAwaitingConfirm(
    { store: h.store, dialogs: registry, now: () => h.clock.t },
    { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
  )
}

describe('TC-1 清位成功 ⇒ 回调恰一次（FR-2）', () => {
  it('真清位：返回 {cleared:true,notified:true}、回调 1 次、在途表与停手位都清空', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    expect(registry.inFlightFor(REQ_ID)).toBe(true)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)

    const called: string[] = []
    const res = await exitAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t, onCleared: (id) => { called.push(id) } },
      { requirementId: REQ_ID, ref: REF, reason: 'answered' },
    )

    expect(res).toEqual({ cleared: true, notified: true })
    expect(called).toEqual([REQ_ID])
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })

  it('重复解除（台账已 healthy）⇒ 不回调、cleared=false', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    const called: string[] = []
    const deps = { store: h.store, dialogs: registry, now: () => h.clock.t, onCleared: (id: string) => { called.push(id) } }
    await exitAwaitingConfirm(deps, { requirementId: REQ_ID, ref: REF, reason: 'answered' })

    const again = await exitAwaitingConfirm(deps, { requirementId: REQ_ID, ref: REF, reason: 'answered' })

    expect(again).toEqual({ cleared: false, notified: false })
    expect(called).toEqual([REQ_ID]) // 仍只有第一次那一下
  })

  it('notify:false ⇒ 清位照做、回调 0 次（确认收敛点专用）', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    const called: string[] = []

    const res = await exitAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t, onCleared: (id) => { called.push(id) } },
      { requirementId: REQ_ID, ref: REF, reason: 'board', notify: false },
    )

    expect(res).toEqual({ cleared: true, notified: false })
    expect(called).toEqual([])
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })

  it('未装配 onCleared ⇒ 清位照做、notified=false（缺省即旧行为）', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)

    const res = await exitAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { requirementId: REQ_ID, ref: REF, reason: 'expired' },
    )

    expect(res).toEqual({ cleared: true, notified: false })
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })
})

describe('TC-2 回调抛错不外溢（FR-2）', () => {
  it('onCleared 抛错 ⇒ 不抛、cleared 仍为 true、只留一条 warn', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterOnce(h, registry)
    const warns: string[] = []

    const res = await exitAwaitingConfirm(
      {
        store: h.store,
        dialogs: registry,
        now: () => h.clock.t,
        onCleared: () => { throw new Error('驱动请求端口炸了') },
        logger: { warn: (m) => { warns.push(m) } },
      },
      { requirementId: REQ_ID, ref: REF, reason: 'answered' },
    )

    expect(res).toEqual({ cleared: true, notified: true })
    expect(warns.length).toBe(1)
    expect(warns[0]).toContain('onCleared')
    // 清位结果不回滚
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
  })
})
