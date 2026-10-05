// serves: FR-4
/**
 * 误停摆恢复测试（REQ-261001201200-8f8b FR-4）。
 *
 * 覆盖四类：**可恢复**（disarmed+active）／**不可恢复的三种有意停手**（人 clear_pause 的 disarmed+idle、
 * 回合上限/aborted 的 paused、本来就 armed）／**幂等**（第二次调用零写入）／**集成**（真实 round driver 的
 * requirement-moved 入口先重新武装再起轮）。
 *
 * @module dsh-pmboard/tests/dive-rearm
 */
import type { RequirementStore } from '../src/application/ports.js'
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { describe, it, expect } from 'vitest'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { rearmIfRecoverable, recoverHealth, isRecoverableRequirement, armExplicit } from '../src/application/internal/rearm.js'
import { isDrivableRequirement } from '../src/application/dive/round-state.js'
import { createWakeHeartbeat, isStalledWake } from '../src/application/dive/wake-heartbeat.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { createCaptureRuntime } from '../src/wiring/pm-capture-root.js'

const WINDOW = 'agent-1'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: WINDOW,
    dive: { phase: 'active', activation: 'disarmed', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

/** 最小台账 fake（与 round-driver 测试同款：mutate 走真实对象，便于断言写入）。 */
function repoOf(reqs: RequirementRecord[]) {
  const ledger = { ...emptyLedger(), requirements: reqs, tasks: [], triages: [] } as unknown as { revision: number; requirements: RequirementRecord[] }
  return {
    ledger,
    // t8/B11：心跳的台账读已走新端口；本夹具是**手搓桩**，故给一个最小只读桩（与 repo 同源）
    store: {
      listSummaries: async () => ({ items: ledger.requirements.map((r) => ({
        id: r.id, title: r.title, status: r.status, blocked: r.blocked === true,
        createdAt: r.createdAt, updatedAt: r.updatedAt, version: r.version,
        commentCount: r.comments?.length ?? 0, artifactCount: r.artifacts?.length ?? 0,
        ...(r.sourceSessionId === undefined ? {} : { sourceSessionId: r.sourceSessionId }),
      })) }),
      get: async (id: string) => ledger.requirements.find((r) => r.id === id),
      // B12 阶段⑤族 B：端口读口之一（断言 `revision` 时用），按契约返回 { revision, schemaVersion }
      head: async () => ({ revision: ledger.revision, schemaVersion: 9 }),
      // B12 阶段②a：心跳的**写**也改走新端口 ⇒ 手搓桩必须实现 mutate。
      // 语义按端口契约：draft 就地改、`version` 由适配器自增（回调不改它）；无变更不写。
      mutate: async (id: string, fn: (draft: unknown) => { changed?: boolean } | undefined) => {
        const r = ledger.requirements.find((x) => x.id === id)
        if (r === undefined) throw Object.assign(new Error('需求不存在（写操作不隐式建档）'), { code: 'REQBOARD_NOT_FOUND' })
        const draft = structuredClone(r) as RequirementRecord
        const out = fn(draft)
        if (out === undefined || out.changed === false) {
          return { requirement: r, version: r.version, revision: ledger.revision, changed: false }
        }
        Object.assign(r, draft, { version: r.version + 1 })
        ledger.revision += 1
        return { requirement: r, version: r.version, revision: ledger.revision, changed: true }
      },
    } as unknown as RequirementStore,
    repo: {
      // B12 阶段①-a：idle 拍的同步判定改用窄投影
      peekFacts: () => ledger.requirements.map(factsOf),
      snapshot: () => ledger,
      read: async (fn: (v: unknown) => unknown) => fn(ledger),
      mutate: async (_r: string, fn: (l: unknown) => unknown) => {
        const before = JSON.stringify(ledger)
        const changed = (fn(ledger) ?? {}) as never
        if (JSON.stringify(ledger) !== before) ledger.revision += 1
        return { changed, revision: ledger.revision }
      },
      replaceAll: async (_r: string, next: never) => { Object.assign(ledger, next) },
    },
  }
}
const rearmComments = async (h: { store: RequirementStore }): Promise<string[]> =>
  (((await h.store.get('REQ-t'))!.comments) ?? []).map((c) => String(c.body)).filter((b) => b.includes('[Dive 自动恢复]'))

describe('FR-4 · rearmIfRecoverable：可恢复 / 幂等', () => {
  it('disarmed + active → 重新武装 + 留一条恢复 comment + version 前进', async () => {
    const h = repoOf([makeReq()])
    const before = (await h.store.get('REQ-t'))!.version
    expect(await rearmIfRecoverable({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'requirement-moved')).toBe(true)
    const r = (await h.store.get('REQ-t'))!
    expect(r.dive!.activation).toBe('armed')
    expect(r.dive!.phase).toBe('active')
    expect(r.version).toBe(before + 1)
    expect((await rearmComments(h))).toHaveLength(1)
    expect((await rearmComments(h))[0]).toContain('requirement-moved')
  })

  it('第二次调用 → false 且零写入（幂等，不再刷 comment / 不再 bump version）', async () => {
    const h = repoOf([makeReq()])
    await rearmIfRecoverable({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'requirement-moved')
    const v = (await h.store.get('REQ-t'))!.version
    const rev = (await h.store.head()).revision
    expect(await rearmIfRecoverable({  store: h.store as never, now: () => 2000 }, 'REQ-t', 'board-resume')).toBe(false)
    expect((await h.store.get('REQ-t'))!.version).toBe(v)
    expect((await h.store.head()).revision).toBe(rev)
    expect((await rearmComments(h))).toHaveLength(1)
  })
})

describe('FR-4 · 心跳兜底：只叫醒停着的，叫不动就如实记（REQ-261001213924-1441）', () => {
  it('tick() 叫醒停滞需求：woken 含该需求、lastWakeAt 落账、连续失败计数归零', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'healthy', attempts: 2 } } as never })])
    const woken: string[] = []
    const hb = createWakeHeartbeat({  store: h.store, now: () => 5000, wake: (id) => { woken.push(id); return true } })
    const res = await hb.tick()
    expect(res.woken).toContain('REQ-t')
    expect(woken).toEqual(['REQ-t'])
    expect((await h.store.get('REQ-t'))!.dive!.lastWakeAt).toBe(5000)
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.attempts).toBe(0)
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
  })

  it('连续 3 次叫不动 → health=paused（wake-undeliverable），activation 始终不变', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } as never })])
    const hb = createWakeHeartbeat({  store: h.store, now: () => 7000, wake: () => false })
    expect((await hb.tick()).paused).toEqual([])
    expect((await hb.tick()).paused).toEqual([])
    const third = await hb.tick()
    expect(third.paused).toContain('REQ-t')
    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.driverHealth!.state).toBe('paused')
    expect(dive.driverHealth!.reason).toBe('wake-undeliverable')
    expect(dive.driverHealth!.attempts).toBe(3)
    expect(dive.activation, '人的意图不得被运行时故障改写').toBe('armed')
    expect(isDrivableRequirement((await h.store.get('REQ-t')))).toBe(false)
    const allBodies = ((await h.store.get('REQ-t'))!.comments ?? []).map((c) => String(c.body)).join(' ')
    expect(allBodies, '失败要响亮：台账上留一条人看得懂的诊断').toContain('都没叫动')
  })

  it('暂停之后不是死路：recoverHealth 一叫回来，心跳就能再次叫醒它（计数归零）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'paused', reason: 'wake-undeliverable', attempts: 3 } } as never })])
    const hb = createWakeHeartbeat({  store: h.store, now: () => 9000, wake: () => true })
    const before = await hb.tick()
    expect(before.woken, '暂停中不叫（停下等人，不自己反复推）').toEqual([])
    expect(before.skipped).toContain('REQ-t')
    expect(await recoverHealth({  store: h.store as never, now: () => 9500 }, 'REQ-t', 'board-resume')).toBe(true)
    const after = await hb.tick()
    expect(after.woken).toContain('REQ-t')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('healthy')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.attempts).toBe(0)
  })

  it('还新鲜（刚成功唤醒过）与不可驱动的需求 → 跳过，不叫', async () => {
    const fresh = makeReq({ id: 'REQ-fresh', dive: { activation: 'armed', phase: 'active', roundsInStage: 0, lastWakeAt: 9990 } as never })
    const manual = makeReq({ id: 'REQ-manual', dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })
    const h = repoOf([fresh, manual])
    const hb = createWakeHeartbeat({  store: h.store, now: () => 10_000, wake: () => { throw new Error('不该被叫') } })
    const res = await hb.tick()
    expect(res.woken).toEqual([])
    expect(res.skipped.sort()).toEqual(['REQ-fresh', 'REQ-manual'])
    expect(isStalledWake(fresh, 10_000, 60_000)).toBe(false)
  })
})

describe('FR-2 · 达上限不是终态：recoverHealth 一叫就回来（REQ-261001213924-1441）', () => {
  it('运行时 paused（达上限）→ 恢复为 healthy，activation 全程不变，可驱动恢复', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 5, driverHealth: { state: 'paused', reason: 'round-limit:design', since: 1 } } as never })])
    const before = (await h.store.get('REQ-t'))!
    expect(isDrivableRequirement(before)).toBe(false)
    expect(isRecoverableRequirement(before)).toBe(true)
    expect(await recoverHealth({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'board-resume')).toBe(true)
    const after = (await h.store.get('REQ-t'))!
    expect(after.dive!.driverHealth!.state).toBe('healthy')
    expect(after.dive!.driverHealth!.attempts).toBe(0)
    expect(after.dive!.activation).toBe('armed')            // 人的意图：自始至终没被动过
    expect(isDrivableRequirement(after)).toBe(true)
    expect((await rearmComments(h))).toHaveLength(1)
  })

  it('人主动 clear_pause（disarmed + idle）→ 不可恢复、零写入（人的决定优先）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })])
    expect(isRecoverableRequirement((await h.store.get('REQ-t')))).toBe(false)
    const snap = JSON.stringify((await h.store.get('REQ-t')))
    expect(await recoverHealth({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'requirement-moved')).toBe(false)
    expect(JSON.stringify((await h.store.get('REQ-t')))).toBe(snap)
  })

  it('达上限的恢复要还额度：round-limit 暂停 → recoverHealth 后 roundsInStage 归零（否则一点继续又立刻撞上限）', async () => {
    const h = repoOf([makeReq({ status: 'design', dive: { activation: 'armed', phase: 'active', roundsInStage: 200, driverHealth: { state: 'paused', reason: 'round-limit:design' } } as never })])
    expect(await recoverHealth({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'board-resume')).toBe(true)
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('healthy')
  })

  it('非上限的恢复不动额度：wake-undeliverable 暂停 → roundsInStage 原样保留（阶段内累计是真实进度）', async () => {
    const h = repoOf([makeReq({ status: 'design', dive: { activation: 'armed', phase: 'active', roundsInStage: 7, driverHealth: { state: 'paused', reason: 'wake-undeliverable' } } as never })])
    expect(await recoverHealth({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'board-resume')).toBe(true)
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(7)
  })

  it('已经健康 → 幂等（不重复写、不刷 comment）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'healthy' } } as never })])
    expect(await recoverHealth({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'board-resume')).toBe(false)
    expect((await rearmComments(h))).toHaveLength(0)
  })
})

describe('FR-4 · rearmIfRecoverable：人的主动暂停与终态永不被覆盖（负例）', () => {
  const negative: Array<[string, Partial<RequirementRecord>['dive']]> = [
    ['人主动 clear_pause（disarmed + idle）', { activation: 'disarmed', phase: 'idle' } as never],
    ['回合上限/aborted 终态（paused）', { activation: 'disarmed', phase: 'paused' } as never],
    ['本来就是 armed（无需恢复）', { activation: 'armed', phase: 'active' } as never],
  ]
  for (const [label, dive] of negative) {
    it(label + ' → false 且零写入、不新增恢复 comment', async () => {
      const h = repoOf([makeReq({ dive: dive as never })])
      const snapshot = JSON.stringify((await h.store.get('REQ-t')))
      expect(await rearmIfRecoverable({  store: h.store as never, now: () => 1000 }, 'REQ-t', 'requirement-moved')).toBe(false)
      expect(JSON.stringify((await h.store.get('REQ-t')))).toBe(snapshot)
      expect((await rearmComments(h))).toHaveLength(0)
    })
  }

  it('需求不存在 → false（不猜、不建）', async () => {
    const h = repoOf([])
    expect(await rearmIfRecoverable({  store: h.store as never, now: () => 1000 }, 'REQ-missing', 'requirement-moved')).toBe(false)
  })
})

describe('FR-4 · 集成：requirement-moved 先把误停摆叫醒，再起轮', () => {
  function harness(req: RequirementRecord = makeReq()) {
    const { ledger, repo } = repoOf([req])
    const inbox = { nextTurn: [] as Array<{ id?: string; source?: { kind?: string } }>, nextStep: [] as unknown[], prepend(target: string, m: unknown) { (target === 'next-step' ? this.nextStep : this.nextTurn).unshift(m as never) } }
    const agent = { id: WINDOW, status: 'idle', session: { id: WINDOW }, inbox, followup(message: unknown) { inbox.nextTurn.push(message as never) } }
    const warns: string[] = []
    const { deliverer } = createCaptureRuntime({ plugin: 'dsh-pmboard', getAgents: () => ({ get: (id: string) => (id === WINDOW ? agent : undefined) }) })
    const ports: DiveRoundPorts = { store: legacyStoreProjection(repo as never),
      // B12 阶段②a：本模块的写改走新端口（与 peekFacts 同源）

      // B12 阶段①-a：idle 拍的同步判定改用窄投影
      peekFacts: () => ledger.requirements.map(factsOf),
      delivery: deliverer,
      agents: { get: (id) => (id === WINDOW ? agent : undefined), withoutInitiator: (op) => op() },
      fiberActive: () => true,
      cancel: () => {},
      whenIdle: async () => {},
      checkpoint: async () => {},
      renderRoundText: (i) => 'round ' + i.round,
      now: () => 1000,
      logger: { info: () => {}, debug: () => {}, warn: (m) => warns.push(m) },
    }
    // B12 阶段⑤族 B：driver 端口早已挂新端口；返回值也带上 store 供断言用
    // B12 阶段⑤：driver 端口已挂新端口；返回值也带上 store 供断言用
    return { driver: createDiveRoundDriver(ports), ledger, store: legacyStoreProjection(repo as never), inbox, warns }
  }
  // B12 阶段⑤族 B：判定回调允许 async（断言走新端口后天然是 async）
  async function waitFor(fn: () => boolean | Promise<boolean>, ms = 500): Promise<boolean> {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 5)) }
    return fn()
  }

  it('误停摆需求收到 requirement-moved → activation 回到 armed，且 inbox 真的收到 dive 回合消息', async () => {
    const h = harness()
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('disarmed')
    h.driver.onRequirementMoved('REQ-t')
    const armed = await waitFor(async () => (await h.store.get('REQ-t'))!.dive!.activation === 'armed')
    expect(armed).toBe(true)
    const delivered = await waitFor(() => h.inbox.nextTurn.length > 0)
    expect(delivered).toBe(true)
    expect(h.inbox.nextTurn[0]?.source?.kind).toBe('dive')
    expect((await rearmComments(h))).toHaveLength(1)
  })

  it('人主动暂停（disarmed + idle）收到 requirement-moved → 不武装、不起轮（负例）', async () => {
    const h = harness(makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never }))
    h.driver.onRequirementMoved('REQ-t')
    await h.driver.whenQuiet()
    await new Promise((r) => setTimeout(r, 30))
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('disarmed')
    expect(h.inbox.nextTurn).toHaveLength(0)
    expect((await rearmComments(h))).toHaveLength(0)
  })
})

/**
 * REQ-261002173819-69c7 FR-3 · `armExplicit`：人显式要继续时，把手动模式的需求接回自动化。
 *
 * 与自动路径（recoverHealth）严格分家：只有人（看板「继续」）能改 `disarmed+idle`。
 * 现场：2026-10-02 REQ-261002161439-277d 的 agent 为解死锁调了 clear_pause（disarmed+idle），
 * 而当时全仓没有任何入口能把它接回来——该需求随后只能人工逐卡打「继续」。
 */
const explicitComments = (l: { requirements: RequirementRecord[] }) =>
  (l.requirements[0]!.comments ?? []).map((c) => String(c.body)).filter((b) => b.includes('[Dive 重新武装]'))

describe('FR-3 · armExplicit：人显式把需求接回自动化', () => {
  it('R-1：disarmed + idle（人按过 clear_pause）→ armed + active，并留人工留痕', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })])
    const before = (await h.store.get('REQ-t'))!.version

    expect(await armExplicit({  store: h.store as never, now: () => 3000 }, 'REQ-t', 'board-resume')).toBe(true)

    const r = (await h.store.get('REQ-t'))!
    expect(r.dive!.activation).toBe('armed')
    expect(r.dive!.phase).toBe('active')
    expect(r.version).toBe(before + 1)
    const comments = (r.comments ?? []).filter((c) => String(c.body).includes('[Dive 重新武装]'))
    expect(comments).toHaveLength(1)
    expect(comments[0]!.createdBy?.kind).toBe('human')
    expect(String(comments[0]!.body)).toContain('board-resume')
  })

  it('R-2：已 armed 且健康 → false 且零写入（幂等）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'healthy', since: 1, attempts: 0 } } as never })])
    const v = (await h.store.get('REQ-t'))!.version
    const rev = (await h.store.head()).revision

    expect(await armExplicit({  store: h.store as never, now: () => 3000 }, 'REQ-t', 'board-resume')).toBe(false)

    expect((await h.store.get('REQ-t'))!.version).toBe(v)
    expect((await h.store.head()).revision).toBe(rev)
    expect(explicitComments(h.ledger)).toHaveLength(0)
  })

  it('R-3：运行时暂停（wake-undeliverable）→ health 回 healthy、attempts 归零', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'paused', reason: 'wake-undeliverable', since: 1, attempts: 3 } } as never })])

    expect(await armExplicit({  store: h.store as never, now: () => 3000 }, 'REQ-t', 'board-resume')).toBe(true)

    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.driverHealth!.state).toBe('healthy')
    expect(dive.driverHealth!.attempts).toBe(0)
    expect(dive.activation).toBe('armed')
  })

  it('R-4：达回合上限的暂停 → 额度还给本阶段（roundsInStage 归零）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 3, driverHealth: { state: 'paused', reason: 'round-limit:implementing', since: 1, attempts: 1 } } as never })])

    expect(await armExplicit({  store: h.store as never, now: () => 3000 }, 'REQ-t', 'board-resume')).toBe(true)

    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.roundsInStage).toBe(0)
    expect(dive.driverHealth!.state).toBe('healthy')
  })

  it('R-5：弹框在途 → 不越权，零写入', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })])
    const v = (await h.store.get('REQ-t'))!.version

    expect(await armExplicit({  store: h.store as never, now: () => 3000, dialogInFlight: () => true }, 'REQ-t', 'board-resume')).toBe(false)

    expect((await h.store.get('REQ-t'))!.version).toBe(v)
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('disarmed')
    expect(explicitComments(h.ledger)).toHaveLength(0)
  })

  it('R-6：自动路径仍不得改写 disarmed+idle（recoverHealth 返回 false 且零写入）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })])
    const v = (await h.store.get('REQ-t'))!.version

    expect(await recoverHealth({  store: h.store as never, now: () => 3000 }, 'REQ-t', 'board-resume')).toBe(false)

    expect((await h.store.get('REQ-t'))!.version).toBe(v)
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('disarmed')
    expect((await h.store.get('REQ-t'))!.dive!.phase).toBe('idle')
  })

  it('R-7：武装后即可被驱动、且属于「停滞」→ 下一拍心跳就会叫醒', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0, lastWakeAt: 1 } as never })])

    await armExplicit({  store: h.store as never, now: () => 9_000_000 }, 'REQ-t', 'board-resume')

    const r = (await h.store.get('REQ-t'))!
    expect(isDrivableRequirement(r)).toBe(true)
    expect(isStalledWake(r, 9_000_000, 10 * 60 * 1000)).toBe(true)
  })
})
