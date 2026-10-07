// serves: FR-3
/**
 * 统一收尾用例（REQ-261007135258-331a t1 · design/test-cases.md TC-3 / TC-9）。
 *
 * 口径：`finishConfirmAdvance` 做两件事——清停手位（`awaiting-confirm:*` → healthy）+
 * 复位运行时健康（`confirm-advance`）；两件事各自 try/catch，**永不抛**、失败不回滚推进。
 * 读数如实：`stopPositionCleared` 是后置条件，`clearedNow` 才是"这次真的清了"。
 *
 * 用仓库既有夹具：`tests/application/harness.ts`（内存台账 + 真在途登记表），零真实 IO。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { enterAwaitingConfirm, isAwaitingConfirmStop } from '../src/application/internal/awaiting-confirm.js'
import { finishConfirmAdvance } from '../src/application/internal/confirm-advance-finish.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-000001'
const AGENT = 'session-agent-1'
const REF = 'pc-test-1'

/** 需求种子：armed + 绑定本窗口（可驱动）。`health` 可控以覆盖 INV-3 边界。 */
function seeded(over: Partial<RequirementRecord> = {}): ReturnType<typeof makeHarness> {
  return makeHarness({
    requirements: [req({
      id: REQ_ID,
      status: 'brainstorming',
      category: 'feature',
      autoRun: true,
      sourceSessionId: AGENT,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 2 } as never,
      ...over,
    })],
  })
}

function registryFor(h: ReturnType<typeof makeHarness>): PendingConfirmRegistry {
  return new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => REF })
}

/** 装出带 dialogs / notifyDrivable 的用例依赖（真实现，只补两个端口）。 */
function depsWith(
  h: ReturnType<typeof makeHarness>,
  registry: PendingConfirmRegistry,
  woken: string[],
): UseCaseDeps {
  return {
    ...h.deps,
    dialogs: registry,
    notifyDrivable: (id: string) => { woken.push(id) },
  } as UseCaseDeps
}

describe('TC-3 停手位被清 ⇒ 回调一次 + 健康位复位（FR-3）', () => {
  it('真清位：clearedNow/stopPositionCleared/healthReset 全 true，在途表与停手位都清空', async () => {
    const h = seeded()
    const registry = registryFor(h)
    const woken: string[] = []
    await enterAwaitingConfirm(
      { store: h.store, dialogs: registry, now: () => h.clock.t },
      { requirementId: REQ_ID, windowKey: AGENT, ref: REF, kind: 'confirm' },
    )
    expect(registry.inFlightFor(REQ_ID)).toBe(true)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)

    const res = await finishConfirmAdvance(depsWith(h, registry, woken), {
      requirementId: REQ_ID, windowKey: AGENT, from: 'brainstorming', to: 'design',
      nowTs: h.clock.t, dialogRef: REF,
    })

    expect(res).toEqual({
      stopPositionCleared: true, clearedNow: true, healthReset: true, stageChanged: true,
    })
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    const after = (await h.store.get(REQ_ID))!
    expect(isAwaitingConfirmStop(after)).toBe(false)
    expect(after.dive?.driverHealth?.state).not.toBe('paused')
    // 清位即驱动：回调恰一次，且台账留了"等待结束"的痕（供人事后复盘）
    expect(woken).toEqual([REQ_ID])
    expect((after.comments ?? []).some(c => c.body.includes('[Dive 恢复] 等待结束'))).toBe(true)
  })
})

describe('TC-3b 无停手位 ⇒ 后置条件仍为 true、clearedNow 为 false（FR-3）', () => {
  it('本就不是等待态：不回调、不误报"清过位"', async () => {
    const h = seeded()
    const registry = registryFor(h)
    const woken: string[] = []

    const res = await finishConfirmAdvance(depsWith(h, registry, woken), {
      requirementId: REQ_ID, windowKey: AGENT, from: 'brainstorming', to: 'design', nowTs: h.clock.t,
    })

    expect(res.stopPositionCleared).toBe(true)
    expect(res.clearedNow).toBe(false)
    expect(res.healthReset).toBe(true)
    expect(woken).toEqual([])
  })
})

describe('TC-3c 健康位 paused(wake-undeliverable) ⇒ 复位；该前缀不冒充停手位（FR-3）', () => {
  it('confirm-advance 复位运行时暂停位，且不把它当 awaiting-confirm 清（读数如实）', async () => {
    const h = seeded({
      dive: {
        phase: 'active', activation: 'armed', roundsInStage: 0,
        driverHealth: { state: 'paused', reason: 'wake-undeliverable', since: 1, attempts: 3 },
      } as never,
    })
    const registry = registryFor(h)
    const woken: string[] = []

    const res = await finishConfirmAdvance(depsWith(h, registry, woken), {
      requirementId: REQ_ID, windowKey: AGENT, from: 'brainstorming', to: 'design', nowTs: h.clock.t,
    })

    expect(res.clearedNow).toBe(false)          // 前缀不匹配 ⇒ 没"清停手位"这回事
    expect(res.stopPositionCleared).toBe(true)  // 后置条件：确实不处于 awaiting-confirm:*
    expect(res.healthReset).toBe(true)          // 但健康位由 confirm-advance 复位
    expect((await h.store.get(REQ_ID))!.dive?.driverHealth?.state).not.toBe('paused')
    expect(woken).toEqual([])
  })
})

describe('TC-9 收尾失败不回滚、不抛（FR-3）', () => {
  it('写盘与读盘都抛错 ⇒ 函数正常返回、读数如实为 false', async () => {
    const h = seeded()
    const registry = registryFor(h)
    const failing = Object.create(h.store) as UseCaseDeps['store']
    failing.get = (async () => { throw new Error('boom-get') }) as UseCaseDeps['store']['get']
    failing.mutate = (async () => { throw new Error('boom-mutate') }) as UseCaseDeps['store']['mutate']
    const deps = { ...depsWith(h, registry, []), store: failing } as UseCaseDeps

    const res = await finishConfirmAdvance(deps, {
      requirementId: REQ_ID, windowKey: AGENT, from: 'brainstorming', to: 'design', nowTs: h.clock.t,
    })

    expect(res.clearedNow).toBe(false)
    expect(res.stopPositionCleared).toBe(false)
    expect(res.healthReset).toBe(false)
  })
})
