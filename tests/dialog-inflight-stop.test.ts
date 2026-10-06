// serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
/**
 * 弹框在途即停手（REQ-261002141430-a5ef）——design/test-cases.md 的 TC-1…TC-9。
 *
 * 口径：**修前必红**的用例都要能在改动前红（TC-1/2/3/5/6/7/9），TC-4 是**反向自检**
 * （无在途时投递/派卡行为不得改变），TC-8 固化"降级不登记"。
 *
 * 用的是仓库既有夹具：`tests/application/harness.js`（内存台账 + 真队列仓储 + FakeDocs/Clock/Ids），
 * 零真实 IO、零落盘。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import {
  AWAITING_CONFIRM_PREFIX,
  dialogInFlightFor,
  enterAwaitingConfirm,
  exitAwaitingConfirm,
  isAwaitingConfirmStop,
} from '../src/application/internal/awaiting-confirm.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import { recoverHealth } from '../src/application/internal/rearm.js'
import { createWakeHeartbeat } from '../src/application/dive/wake-heartbeat.js'
import { createGatePromptPort } from '../src/application/dive/gate-prompt.js'
import { applyConfirmDecision } from '../src/application/internal/confirm-settle.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-000001'
const AGENT = 'agent-1'

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

/** 在途登记表（真实现；`now` 绑夹具时钟，ticket 固定便于断言）。 */
function registryFor(h: ReturnType<typeof makeHarness>): PendingConfirmRegistry {
  return new PendingConfirmRegistry({ now: () => h.clock.t, newTicket: () => 'pc-test-1' })
}

/** awaiting-confirm 的依赖面（repo/dialogs/now）。 */
function awaitingDeps(h: ReturnType<typeof makeHarness>, dialogs: PendingConfirmRegistry) {
  // B12 阶段②c：进入/退出等待位的写已迁新端口，工厂一并透传
  return {  store: h.store, dialogs, now: () => h.clock.t }
}

/** 起轮夹具（fake 端口驱动真状态机；口径同 tests/dive-round-driver.test.ts）。 */
function diveHarness(opts: { dialogInFlight?: (id: string) => boolean } = {}) {
  const h = seeded()
  const inbox = { nextTurn: [] as unknown[], nextStep: [] as unknown[], prepend(): void {} }
  const agent: Record<string, unknown> = { id: AGENT, status: 'idle', session: { id: AGENT }, inbox }
  const delivered: unknown[] = []
  let n = 0
  const ports: DiveRoundPorts = { store: h.store,
    // B12 阶段①-a：idle 拍的同步判定改用窄投影（harness 已暴露新端口）
    peekFacts: () => h.store.peekFacts(),
    // B12 阶段②a：本模块的写也走新端口（与 peekFacts 同源）

    agents: { get: (id) => (id === AGENT ? agent : undefined), withoutInitiator: (op) => op() },
    fiberActive: () => true,
    delivery: {
      createRoundMessage: (input) => {
        n += 1
        const message = {
          id: 'm' + n,
          content: [{ type: 'text', text: input.text }],
          source: { kind: 'dive', requirementId: input.requirementId, revision: input.revision, round: input.round },
        }
        return { message, messageId: 'm' + n }
      },
      deliverMessage: (_wk, message) => { delivered.push(message); return { delivered: true } },
    },
    cancel: () => {},
    whenIdle: async () => {},
    checkpoint: async () => {},
    renderRoundText: (i) => 'round ' + i.round,
    now: () => h.clock.t,
    ...(opts.dialogInFlight === undefined ? {} : { dialogInFlight: opts.dialogInFlight }),
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  return { h, agent, delivered, driver: createDiveRoundDriver(ports) }
}

describe('TC-1 在途停手：不投回合（FR-1）', () => {
  it('弹框在途 → 本拍不起轮，且不改健康位/不计数', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 1000 })
    const { h, agent, delivered, driver } = diveHarness({ dialogInFlight: (id) => registry.inFlightFor(id) })
    registry.enter({ ref: 'pc-test', windowKey: AGENT, requirementId: REQ_ID, kind: 'confirm', suspend: true })

    driver.requestDrive(agent)
    await driver.whenQuiet()

    expect(delivered.length).toBe(0)
    const r = (await h.store.get(REQ_ID))!
    expect(r.dive!.driverHealth?.state).not.toBe('paused')
    expect(r.dive!.roundsInStage).toBe(0)
    expect(r.dive!.activation).toBe('armed')
  })
})

describe('TC-2 在途停手：实施链不派卡（FR-1）', () => {
  it('在途 → stopped=awaiting-confirm；不改 autoRun、不记停滞', async () => {
    const h = seeded()
    const registry = registryFor(h)
    h.deps.dialogs = registry
    h.seedTasks(REQ_ID, [task({ id: 't-p', requirementId: REQ_ID, status: 'todo' })])
    registry.enter({ ref: 'pc-test-1', windowKey: AGENT, requirementId: REQ_ID, kind: 'confirm', suspend: true })

    const out = await advanceRequirement(h.deps, REQ_ID)

    expect(out.stopped).toBe('awaiting-confirm')
    expect(out.steps).toEqual([])
    const r = (await h.store.get(REQ_ID))!
    expect(r.autoRun).toBe(true)                 // 人的开关不动
    expect(r.advance?.noopStreak ?? 0).toBe(0)   // 等人不是停滞，不得走向熔断
    expect(r.advance?.pausedReason).toBeUndefined()
    const raw = h.queueRepo.rawOf(REQ_ID)
    expect(raw === undefined ? '' : raw).not.toContain('"in_progress"')
  })
})

describe('TC-3 作答到达：自动解除等待（FR-3）', () => {
  it('人作答（confirm-settle 收敛点）→ 停手位清空、在途表清空、留痕一条', async () => {
    const h = makeHarness({
      requirements: [req({
        id: REQ_ID, status: 'brainstorming', category: 'feature', autoRun: true, sourceSessionId: AGENT,
        dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
        artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/REQ-000001/requirement.md', registeredAt: 1 } as never],
      })],
    })
    const registry = registryFor(h)
    h.deps.dialogs = registry
    await enterAwaitingConfirm(awaitingDeps(h, registry), {
      requirementId: REQ_ID, windowKey: AGENT, ref: 'pc-test-1', kind: 'confirm',
    })
    expect(registry.inFlightFor(REQ_ID)).toBe(true)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)
    const commentsBefore = (await h.store.get(REQ_ID))!.comments.length

    // 人点「确认」→ 三条通道唯一的收敛点（advance=false 只验落章与解除等待，验推进不在此卡）
    await applyConfirmDecision(h.deps, {}, {
      requirementId: REQ_ID, windowKey: AGENT, target: 'artifact', kind: 'requirement',
      question: 'q', picked: '确认，推进到下一阶段 (Recommended)', nowTs: h.clock.t, advance: false,
    })
    await exitAwaitingConfirm(awaitingDeps(h, registry), { requirementId: REQ_ID, ref: 'pc-test-1', reason: 'answered' })

    const r = (await h.store.get(REQ_ID))!
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    expect(isAwaitingConfirmStop(r)).toBe(false)
    expect(r.dive!.driverHealth?.state).toBe('healthy')
    expect(r.artifacts![0]!.confirmedAt).toBeDefined()
    expect(r.comments.length).toBeGreaterThan(commentsBefore)
  })

  it('否定答复（需修改）同样解除——不得因"没推进"把 agent 冻住', async () => {
    const h = seeded({ status: 'brainstorming' })
    const registry = registryFor(h)
    await enterAwaitingConfirm(awaitingDeps(h, registry), {
      requirementId: REQ_ID, windowKey: AGENT, ref: 'pc-test-1', kind: 'confirm',
    })
    await exitAwaitingConfirm(awaitingDeps(h, registry), { requirementId: REQ_ID, ref: 'pc-test-1', reason: 'answered' })
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })
})

describe('TC-4 反向自检：无在途时一律不停（FR-1）', () => {
  it('无在途 → 照常起 1 轮', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 1000 })
    const { agent, delivered, driver } = diveHarness({ dialogInFlight: (id) => registry.inFlightFor(id) })
    driver.requestDrive(agent)
    await driver.whenQuiet()
    expect(delivered.length).toBe(1)
  })

  it('无在途 → 实施链照常推进（不因本条出现 awaiting-confirm）', async () => {
    const h = seeded()
    h.deps.dialogs = registryFor(h)
    h.seedTasks(REQ_ID, [task({ id: 't-p', requirementId: REQ_ID, status: 'todo' })])
    h.deps.workflow = {
      async start() {
        return { ok: true, value: { ok: true, output: JSON.stringify({ filesChanged: ['src/x.ts'], completed: ['done'], evidence: ['vitest 绿'] }) } }
      },
    } as never
    const out = await advanceRequirement(h.deps, REQ_ID)
    expect(out.stopped).not.toBe('awaiting-confirm')
    expect(out.steps.length).toBeGreaterThan(0)
  })

  it('缺省未装配判据（dialogs 未接）→ 行为与改动前一致', async () => {
    const { agent, delivered, driver } = diveHarness()
    driver.requestDrive(agent)
    await driver.whenQuiet()
    expect(delivered.length).toBe(1)
  })
})

describe('TC-5 恢复不越权：在途时 rearm 拒绝（FR-4）', () => {
  it('在途 → recoverHealth=false 且零写入；解除后 → 恢复', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await h.store.mutate(REQ_ID, (r) => {
      r.dive!.driverHealth = { state: 'paused', reason: AWAITING_CONFIRM_PREFIX + 'pc-test-1', since: h.clock.t, attempts: 0 }
      return { changed: true }
    })
    registry.enter({ ref: 'pc-test-1', windowKey: AGENT, requirementId: REQ_ID, kind: 'confirm', suspend: true })
    const commentsBefore = (await h.store.get(REQ_ID))!.comments.length

    const blocked = await recoverHealth(
      {  store: h.store, now: () => h.clock.t, dialogInFlight: (id) => registry.inFlightFor(id) },
      REQ_ID, 'board-resume',
    )
    expect(blocked).toBe(false)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)  // 停手位原样
    expect((await h.store.get(REQ_ID))!.comments.length).toBe(commentsBefore) // 零写入

    registry.exit('pc-test-1')
    const ok = await recoverHealth(
      {  store: h.store, now: () => h.clock.t, dialogInFlight: (id) => registry.inFlightFor(id) },
      REQ_ID, 'board-resume',
    )
    expect(ok).toBe(true)
    expect((await h.store.get(REQ_ID))!.dive!.driverHealth!.state).toBe('healthy')
  })
})

describe('TC-6 过期/重启兜底：心跳对账恢复（FR-4）', () => {
  it('停手但无在途 → resumed 含该需求并转 healthy', async () => {
    const h = seeded()
    await h.store.mutate(REQ_ID, (r) => {
      r.dive!.driverHealth = { state: 'paused', reason: AWAITING_CONFIRM_PREFIX + 'pc-gone', since: h.clock.t, attempts: 0 }
      return { changed: true }
    })
    const hb = createWakeHeartbeat({
       store: h.store, now: () => h.clock.t, wake: () => false,
      dialogInFlight: () => false,
    })
    const out = await hb.tick()
    expect(out.resumed).toContain(REQ_ID)
    const r = (await h.store.get(REQ_ID))!
    expect(r.dive!.driverHealth!.state).toBe('healthy')
    expect(r.comments.some((c) => c.body.includes('等待结束'))).toBe(true)
  })

  it('在途仍在 → 同一趟不得恢复（不得把人还在看的框判成过期）', async () => {
    const h = seeded()
    await h.store.mutate(REQ_ID, (r) => {
      r.dive!.driverHealth = { state: 'paused', reason: AWAITING_CONFIRM_PREFIX + 'pc-live', since: h.clock.t, attempts: 0 }
      return { changed: true }
    })
    const hb = createWakeHeartbeat({
       store: h.store, now: () => h.clock.t, wake: () => false,
      dialogInFlight: () => true,
    })
    const out = await hb.tick()
    expect(out.resumed).toEqual([])
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(true)
  })
})

describe('TC-7 门框与起轮不并存（FR-5）', () => {
  it('同一拍：门框已投递、起轮为 0', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 1000 })
    const { h, agent, delivered, driver } = diveHarness({ dialogInFlight: (id) => registry.inFlightFor(id) })
    h.deps.dialogs = registry
    let asked = 0
    // 弹框挂住不返回（模拟"框还在屏幕上"）
    h.deps.questions = {
      available: () => true,
      ask: () => { asked += 1; return new Promise(() => {}) },
    } as never
    const gatePort = createGatePromptPort({ useCaseDeps: () => h.deps, deliver: () => {} })

    // 组合根同款顺序：先弹门框（不 await），再请求起轮
    void gatePort.prompt({
      windowKey: AGENT, requirementId: REQ_ID, gate: 'G1', kind: 'artifact',
      artifactKind: 'requirement', question: '门已满足，是否推进？',
    })
    driver.requestDrive(agent)
    await driver.whenQuiet()

    expect(asked).toBe(1)
    expect(delivered.length).toBe(0)
    expect(registry.inFlightFor(REQ_ID)).toBe(true)
  })
})

describe('TC-8 降级不登记（FR-5 / INV-4）', () => {
  it('弹框通道不可用 → 不登记在途、不留停手位', async () => {
    const h = seeded()
    const registry = registryFor(h)
    h.deps.dialogs = registry
    h.deps.questions = { available: () => false, ask: async () => [] } as never
    const gatePort = createGatePromptPort({ useCaseDeps: () => h.deps, deliver: () => {} })

    const out = await gatePort.prompt({
      windowKey: AGENT, requirementId: REQ_ID, gate: 'G1', kind: 'artifact',
      artifactKind: 'requirement', question: 'q',
    })

    expect(out).toEqual({ answered: false, affirmative: false })
    expect(registry.inFlightFor(REQ_ID)).toBe(false)
    expect(isAwaitingConfirmStop((await h.store.get(REQ_ID))!)).toBe(false)
  })
})

describe('TC-9 幂等与失败响亮（FR-3）', () => {
  it('重复 exit 零写入、不抛', async () => {
    const h = seeded()
    const registry = registryFor(h)
    await enterAwaitingConfirm(awaitingDeps(h, registry), {
      requirementId: REQ_ID, windowKey: AGENT, ref: 'pc-test-1', kind: 'confirm',
    })
    await exitAwaitingConfirm(awaitingDeps(h, registry), { requirementId: REQ_ID, ref: 'pc-test-1', reason: 'answered' })
    const first = (await h.store.get(REQ_ID))!
    const revisions = (await h.store.head()).revision
    const comments = first.comments.length

    // REQ-261006170150-52cc t1（interfaces.md「返回值扩展」）：exitAwaitingConfirm 现在回
    // `{cleared, notified}`（清零写入时两者皆 false），本用例的意图不变——**幂等、零写入、不抛**。
    await expect(exitAwaitingConfirm(awaitingDeps(h, registry), { requirementId: REQ_ID, ref: 'pc-test-1', reason: 'answered' })).resolves.toEqual({ cleared: false, notified: false })
    await expect(exitAwaitingConfirm(awaitingDeps(h, registry), { requirementId: REQ_ID, ref: 'pc-test-1', reason: 'answered' })).resolves.toEqual({ cleared: false, notified: false })

    const after = (await h.store.get(REQ_ID))!
    expect(after.comments.length).toBe(comments)
    expect((await h.store.head()).revision).toBe(revisions)
  })

  it('台账写失败 → 告警恰一次，且拦截仍生效（在途表不被回滚）', async () => {
    const h = seeded()
    const registry = registryFor(h)
    const alerts: string[] = []
    // B12 阶段②c：写已迁到新端口 ⇒ **故障注入点也要搬过去**（否则注入不生效，
    // 这条"台账写失败仍要响亮告警"的用例会假绿）。
    const failingStore = {
      ...h.store,
      mutate: async () => { throw new Error('store down') },
    } as never
    await enterAwaitingConfirm(
      {  store: failingStore, dialogs: registry, now: () => h.clock.t, alert: { alert: (i) => { alerts.push(i.title) } } },
      { requirementId: REQ_ID, windowKey: AGENT, ref: 'pc-test-1', kind: 'confirm' },
    )
    expect(alerts.length).toBe(1)
    expect(alerts[0]).toContain('停手位')
    expect(registry.inFlightFor(REQ_ID)).toBe(true)   // 拦截优先于台账美观
    expect(dialogInFlightFor({ dialogs: registry }, REQ_ID)).toBe(true)
  })
})
