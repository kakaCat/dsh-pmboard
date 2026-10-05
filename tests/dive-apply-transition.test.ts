/**
 * Dive 状态转化的唯一写盘入口（REQ-261003215944-9e04 FR-9 · t9）。
 *
 * 【为什么要有这道门】
 * 规则收进纯函数只解决"算得对"；"写"这件事原先同样散在八处。本文件锁的是**写入口的三条纪律**：
 *   ① 幂等——纯函数说没变，就**一个字节都不许写**（不 bump、不追加留痕）；
 *   ② 永不抛——调用点在事件与请求路径上，任何异常都要收口成结构化结果；
 *   ③ 弹框在途守卫——屏幕上有确认框时，确认推进/自动恢复**不得**把链重新带起来。
 * 外加一条红线：确认推进**永远不代人选「继续」**（activation 不许被它改写）。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { applyDiveTransition, type DiveTransitionDeps } from '../src/application/dive/applyDiveTransition.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REQ = 'REQ-dive001'
const A = { kind: 'system' as const }

/** 一条最小需求（dive 由各用例自己给）。 */
function req(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ, title: 'Dive 写入口', description: '', status: 'implementing', blocked: false,
    comments: [], version: 1, createdAt: 1000, updatedAt: 1000,
    createdBy: { kind: 'agent', sessionId: 'session-a' }, updatedBy: { kind: 'agent', sessionId: 'session-a' },
    ...over,
  } as unknown as RequirementRecord
}

async function seeded(record: RequirementRecord = req()) {
  const store = makeTestStore()
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [record], triages: [] })
  const deps: DiveTransitionDeps = { store, now: () => 5000 }
  return { store, deps }
}

/** 台账快照（字节级比对用）。 */
async function snapshotOf(store: ReturnType<typeof makeTestStore>): Promise<string> {
  return JSON.stringify(await store.get(REQ))
}

describe('applyDiveTransition：唯一写入口（FR-9）', () => {
  it('arm：无 dive 的需求被创建成「自动 + 健康」，并推进 updatedAt', async () => {
    const { store, deps } = await seeded()
    const r = await applyDiveTransition(deps, REQ, 'arm', A)
    expect(r.changed).toBe(true)
    const after = (await store.get(REQ))!
    expect(after.dive).toMatchObject({ activation: 'armed', phase: 'active', roundsInStage: 0, lastActiveAt: 5000 })
    expect(after.updatedAt).toBe(5000)
  })

  it('① 幂等：同一事件连调两次，第二次零写入（台账字节不变、无重复留痕）', async () => {
    const { store, deps } = await seeded(req({ dive: { phase: 'active', activation: 'armed', roundsInStage: 3 } }))
    const first = await applyDiveTransition(deps, REQ, 'pause-runtime', A, { reason: 'deliver-failed' })
    expect(first.changed).toBe(true)
    const after1 = await snapshotOf(store)
    const comments1 = (await store.get(REQ))!.comments.length
    expect(comments1).toBe(1)

    const second = await applyDiveTransition(deps, REQ, 'pause-runtime', A, { reason: 'deliver-failed' })
    expect(second.changed).toBe(false)
    expect(second.code).toBe('no-change')
    expect(await snapshotOf(store)).toBe(after1)
    expect((await store.get(REQ))!.comments.length).toBe(comments1)
  })

  it('② 永不抛 + 留痕：存储抛错 → 结构化 apply-failed，且**留痕钩子被调用**（吞错但不静默）', async () => {
    const { store } = await seeded()
    const seen: { event: string; reason: string }[] = []
    const deps: DiveTransitionDeps = {
      store: {
        ...store,
        mutate: () => { throw new Error('磁盘炸了') },
      } as never,
      now: () => 5000,
      onError: (i) => { seen.push({ event: i.event, reason: i.reason }) },
    }
    const r = await applyDiveTransition(deps, REQ, 'arm', A)
    expect(r.changed).toBe(false)
    expect(r.code).toBe('apply-failed')
    expect(r.reason).toContain('磁盘炸了')
    expect(seen).toEqual([{ event: 'arm', reason: r.reason }])
  })

  it('② 留痕钩子自己抛错也不冒泡（吞错的承诺不被它破掉）', async () => {
    const { store } = await seeded()
    const deps: DiveTransitionDeps = {
      store: { ...store, mutate: () => { throw new Error('x') } } as never,
      now: () => 5000,
      onError: () => { throw new Error('钩子也炸了') },
    }
    const r = await applyDiveTransition(deps, REQ, 'arm', A)
    expect(r).toMatchObject({ changed: false, code: 'apply-failed' })
  })

  it('③ 弹框在途：confirm-advance 与 recover-auto 零写入（框还在屏幕上，链不许先跑）', async () => {
    const { store, deps } = await seeded(req({
      dive: { phase: 'active', activation: 'armed', roundsInStage: 2, driverHealth: { state: 'paused', reason: 'round-limit:implementing', since: 1, attempts: 1 } },
    }))
    const guarded: DiveTransitionDeps = { ...deps, dialogInFlight: () => true }
    const before = await snapshotOf(store)
    for (const event of ['confirm-advance', 'recover-auto'] as const) {
      const r = await applyDiveTransition(guarded, REQ, event, A, { stageChanged: true })
      expect(r.changed).toBe(false)
      expect(r.code).toBe('dialog-in-flight')
    }
    expect(await snapshotOf(store)).toBe(before)
  })

  it('不存在的需求：not-found（不抛、不写）', async () => {
    const { deps } = await seeded()
    const r = await applyDiveTransition(deps, 'REQ-nope01', 'arm', A)
    expect(r).toMatchObject({ changed: false, code: 'not-found' })
  })

  it('留痕：pause-runtime 追加一条系统留痕（人机可辨），文案含原因', async () => {
    const { store, deps } = await seeded(req({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1 } }))
    await applyDiveTransition(deps, REQ, 'pause-runtime', A, { reason: 'checkpoint-failed' })
    const c = (await store.get(REQ))!.comments
    expect(c).toHaveLength(1)
    expect(c[0]?.createdBy?.kind).toBe('system')
    expect(c[0]?.body).toContain('checkpoint-failed')
  })

  it('红线（经写入口）：confirm-advance 不把「人主动关掉的自动化」打开', async () => {
    const { store, deps } = await seeded(req({
      dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0, driverHealth: { state: 'paused', reason: 'round-limit:design', since: 1, attempts: 1 } },
    }))
    const r = await applyDiveTransition(deps, REQ, 'confirm-advance', A, { stageChanged: false })
    expect(r.changed).toBe(true) // 运行时暂停被复位，这是允许的
    const dive = (await store.get(REQ))!.dive!
    expect(dive.activation).toBe('disarmed') // 人的意图逐字不变
    expect(dive.driverHealth?.state).toBe('healthy')
  })

  it('arm-explicit 是唯一能把 disarmed 改回 armed 的入口（留痕记 human）', async () => {
    const { store, deps } = await seeded(req({ dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0 } }))
    const r = await applyDiveTransition(deps, REQ, 'arm-explicit', { kind: 'human' }, { trigger: 'board-resume' })
    expect(r.changed).toBe(true)
    expect((await store.get(REQ))!.dive!.activation).toBe('armed')
  })
})

describe('联调：真实分片存储上的落盘往返（写入口不是只对内存夹具成立）', () => {
  it('写进去 → 换一个 store 实例读出来：dive 与留痕都在盘上', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pmboard-dive-apply-'))
    try {
      const writer = new ShardedRequirementStore({ root, onWarn: () => { /* 本用例不关心告警 */ } })
      // 真实存储会校验 id 形态（REQ-<时间戳>-<4位> 或存量短 id）——用合法 id，不拿夹具 id 碰瓷
      const realId = 'REQ-261003215944-9e04'
      await writer.create({ id: realId, title: '落盘往返', description: '' } as never, { kind: 'human' })
      const deps: DiveTransitionDeps = { store: writer, now: () => 7000 }

      expect((await applyDiveTransition(deps, realId, 'arm', { kind: 'agent', sessionId: 'session-a' })).changed).toBe(true)
      expect((await applyDiveTransition(deps, realId, 'pause-runtime', { kind: 'system' }, { reason: 'deliver-failed' })).changed).toBe(true)

      // 换一个实例（不共享任何内存态）——能读到才说明真的落盘了
      const reader = new ShardedRequirementStore({ root, onWarn: () => { /* 同上 */ } })
      const back = (await reader.get(realId))!
      expect(back.dive?.activation).toBe('armed')
      expect(back.dive?.driverHealth).toMatchObject({ state: 'paused', reason: 'deliver-failed', attempts: 1 })
      expect(back.comments.some(c => c.body.includes('deliver-failed'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
