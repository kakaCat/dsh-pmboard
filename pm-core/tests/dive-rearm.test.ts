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
import type { RequirementStore } from 'pm-core/application/ports.js'
import { factsOf } from 'pm-core/domain/requirement/RequirementSummary.js'
import { describe, it, expect } from 'vitest'
import { emptyLedger, type RequirementRecord } from 'pm-core/protocol-domain.js'
import { rearmIfRecoverable, recoverHealth, isRecoverableRequirement, armExplicit } from 'pm-core/application/internal/rearm.js'
import { isDrivableRequirement } from 'pm-core/application/dive-core/round-state.js'
import { planWake } from 'pm-goal-round-driver/heartbeat.js'
import type { GoalRoundPorts } from 'pm-goal-round-driver/driver.js'
import { createGoalRoundLifecycle } from 'src/adapters/goal-round-lifecycle.js'

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

/**
 * 新链路的心跳夹具：**真宿主实现**（`createGoalRoundLifecycle` 的 facts/wake/markWoken/markWakeFailed）。
 *
 * 2026-10-10：旧 `createWakeHeartbeat` 随 `pm-round-driver` 退役 ⇒ 改挂生产的那一份装配
 * （facts 来自 `peekFacts` 窄投影、wake 走 `wakeAcceptance`、写盘走 `mutateIfPresent`），
 * 这样"叫醒成功刷 lastWakeAt""连续叫不醒写停手位 + 留痕"验的都是**生产实现**而不是测试替身。
 */
function heartbeatOf(
  h: { store: RequirementStore; ledger: { requirements: RequirementRecord[] } },
  opts: { now: () => number; agentLive?: boolean; latchOpen?: boolean },
) {
  const ports: GoalRoundPorts = {
    // 本段的被测对象是**心跳**：驱动拍本身用不到事实（叫醒受理后 requestDrive 一拍即返回）。
    factsOf: () => undefined,
    delivery: {
      createRoundMessage: () => ({ message: {}, messageId: 'm1' }),
      deliverMessage: () => ({ delivered: false }),
      checkpoint: async () => {},
      persistAdmission: () => {},
      contentOf: () => undefined,
      now: () => opts.now(),
    },
    createGoal: () => true,
    blockGoal: () => true,
    askStageDone: () => {},
    trace: () => {},
    now: () => opts.now(),
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  return createGoalRoundLifecycle({ on: () => () => {} } as never, {
    ports,
    peekFacts: () => h.ledger.requirements.map(factsOf),
    store: h.store,
    // 死窗口 = agents 注册表查不到（wakeAcceptance 据此判"不受理"）。
    agents: { get: () => (opts.agentLive === false ? undefined : { id: WINDOW }) },
    now: opts.now,
    ...(opts.latchOpen === undefined ? {} : { providerLatchOpen: () => opts.latchOpen === true }),
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  })
}

type TickOut = { woken: string[]; skipped: Array<{ id: string; reason: string }>; failed: string[] }

describe('FR-4 · 心跳兜底：只叫醒停着的，叫不动就如实记（REQ-261001213924-1441）', () => {
  it('tick() 叫醒停滞需求：woken 含该需求、lastWakeAt 落账', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'healthy', attempts: 2 } } as never })])
    const hb = heartbeatOf(h, { now: () => 5000 })
    const res = await hb.wakeTick() as TickOut
    expect(res.woken).toContain('REQ-t')
    expect((await h.store.get('REQ-t'))!.dive!.lastWakeAt).toBe(5000)
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
    await hb.teardown()
  })

  it('连续 3 次叫不动（死窗口）→ health=paused（wake-undeliverable:3），activation 始终不变', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0 } as never })])
    const hb = heartbeatOf(h, { now: () => 7000, agentLive: false })
    expect((await hb.wakeTick() as TickOut).failed).toContain('REQ-t')
    expect((await hb.wakeTick() as TickOut).failed).toContain('REQ-t')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth, '未达阈值不写健康位').toBeUndefined()
    await hb.wakeTick()
    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.driverHealth!.state).toBe('paused')
    expect(dive.driverHealth!.reason).toBe('wake-undeliverable:3')
    expect(dive.activation, '人的意图不得被运行时故障改写').toBe('armed')
    expect(isDrivableRequirement((await h.store.get('REQ-t')))).toBe(false)
    const allBodies = ((await h.store.get('REQ-t'))!.comments ?? []).map((c) => String(c.body)).join(' ')
    expect(allBodies, '失败要响亮：台账上留一条人看得懂的诊断').toContain('连续叫不醒')
    await hb.teardown()
  })

  it('暂停之后不是死路：recoverHealth 一叫回来，心跳就能再次叫醒它', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'paused', reason: 'wake-undeliverable:3', attempts: 3 } } as never })])
    // 时钟可推：恢复动作会刷新 `lastActiveAt`，恢复后的那拍必须落在新鲜窗之外才谈得上"叫醒"。
    let clock = 9000
    const hb = heartbeatOf(h, { now: () => clock })
    const before = await hb.wakeTick() as TickOut
    expect(before.woken, '暂停中不叫（停下等人，不自己反复推）').toEqual([])
    expect(before.skipped.map((x) => x.reason)).toContain('runtime-paused')
    expect(await recoverHealth({  store: h.store as never, now: () => clock }, 'REQ-t', 'board-resume')).toBe(true)
    clock += 20 * 60 * 1000
    const after = await hb.wakeTick() as TickOut
    expect(after.woken).toContain('REQ-t')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('healthy')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.attempts).toBe(0)
    await hb.teardown()
  })

  it('还新鲜（刚成功唤醒过）与不可驱动的需求 → 跳过，不叫', async () => {
    const fresh = makeReq({ id: 'REQ-fresh', dive: { activation: 'armed', phase: 'active', roundsInStage: 0, lastWakeAt: 9990 } as never })
    const manual = makeReq({ id: 'REQ-manual', dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })
    const h = repoOf([fresh, manual])
    const hb = heartbeatOf(h, { now: () => 10_000 })
    const res = await hb.wakeTick() as TickOut
    expect(res.woken).toEqual([])
    expect(res.skipped.map((x) => x.id + ':' + x.reason).sort()).toEqual(['REQ-fresh:fresh', 'REQ-manual:not-armed'])
    await hb.teardown()
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

// 原「集成：requirement-moved 先把误停摆叫醒，再起轮」两例**随旧回合半退役**（2026-10-10）。
// 它们读的是旧驱动 `onRequirementMoved` 里"先 rearmIfRecoverable 再起轮"的那段接线；新组合根
// （pm/src/index.ts）只把 `reqboard/requirement-moved` 接到 `requestDriveFor`，**没有** rearm 接线
// （`rearmIfRecoverable` 在生产已零调用者）。故无法用新链路等义改写：要么原样保留（测已不存在的接线），
// 要么删除并登记为失去的覆盖。此处取后者，并在迁移报告里标为**生产缺口**（误停摆的自动恢复只剩心跳失败路径，
// 人的显式恢复走 `armExplicit`，见下节）。

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
    // 「停滞」判据改由新包纯函数作答（旧 `isStalledWake` 随包退役）。
    expect(planWake(
      { id: 'REQ-t', armed: true, hasWork: true, ...(r.dive?.lastWakeAt === undefined ? {} : { lastWakeAt: r.dive.lastWakeAt }) },
      9_000_000, { freshMs: 10 * 60 * 1000 },
    ).kind).toBe('wake')
  })
})
