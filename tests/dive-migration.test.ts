/**
 * 存量迁移矩阵单测（REQ-261001213924-1441 FR-8 · 数据模型迁移矩阵）。
 * 每条矩阵行一个用例 + 幂等 + 「不改人的意图」负例。
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { describe, it, expect } from 'vitest'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { migrateDiveState, migrateOne } from '../src/application/internal/migrate-dive-state.js'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: 'agent-1',
    dive: { activation: 'armed', phase: 'active', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

function repoOf(reqs: RequirementRecord[]) {
  const ledger = { ...emptyLedger(), requirements: reqs, tasks: [], triages: [] } as unknown as { revision: number; requirements: RequirementRecord[] }
  return {
    ledger,
    // B12 阶段⑤族 B：手工 harness 补新端口视图（投影架在同一份 fake repo 上，单一真相源）
    store: legacyStoreProjection({ snapshot: () => ledger, read: async (fn: (v: unknown) => unknown) => fn(ledger), mutate: async () => ({ changed: {} }), replaceAll: async () => {} } as never),
    repo: {
      snapshot: () => ledger,
      read: async (fn: (v: unknown) => unknown) => fn(ledger),
      mutate: async (_r: string, fn: (l: unknown) => unknown) => {
        const before = JSON.stringify(ledger)
        const changed = (fn(ledger) ?? {}) as never
        if (JSON.stringify(ledger) !== before) ledger.revision += 1
        return { changed, revision: ledger.revision };
      },
      replaceAll: async (_r: string, next: never) => { Object.assign(ledger, next) },
    },
  };
}

describe('FR-8 · 存量迁移矩阵', () => {
  it('① 误停摆（disarmed+active）→ armed + healthy，并留痕', () => {
    const r = makeReq({ dive: { activation: 'disarmed', phase: 'active', roundsInStage: 0 } as never })
    const action = migrateOne(r, 1000)
    expect(r.dive!.activation).toBe('armed')
    expect(r.dive!.driverHealth!.state).toBe('healthy')
    expect(action).toContain('误停摆')
    expect(r.comments.some((c) => String(c.body).includes('[Dive 迁移]'))).toBe(true)
  })

  it('② 人主动暂停（disarmed+idle）→ 一个字都不改，也不写 comment', () => {
    const r = makeReq({ dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })
    migrateOne(r, 1000)
    expect(r.dive!.activation, '人的意图优先').toBe('disarmed')
    expect(r.comments).toHaveLength(0)
    expect(r.version, '盖章不等于改版本').toBe(5)
  })

  it('③ 终态暂停（phase=paused + round-limit）→ health=paused(原原因)，activation 不变', () => {
    const r = makeReq({ dive: { activation: 'armed', phase: 'paused', roundsInStage: 3, pausedReason: 'round-limit' } as never })
    migrateOne(r, 1000)
    expect(r.dive!.driverHealth!.state).toBe('paused')
    expect(r.dive!.driverHealth!.reason).toBe('round-limit')
    expect(r.dive!.activation).toBe('armed')
    expect(r.dive!.roundsInStage, '旧计数是生命周期语义 → 归零').toBe(0)
  })

  it('④⑤ 常态（armed+active 无 health）→ health=healthy，旧计数归零', () => {
    const r = makeReq({ dive: { activation: 'armed', phase: 'active', roundsInStage: 7 } as never })
    migrateOne(r, 1000)
    expect(r.dive!.driverHealth!.state).toBe('healthy')
    expect(r.dive!.roundsInStage).toBe(0)
  })

  it('⑥ 无 dive 字段（最老的记录）→ 保守补全：disarmed/idle + health=paused，不猜执行意图', () => {
    const r = makeReq({ dive: undefined as never })
    migrateOne(r, 1000)
    expect(r.dive!.activation).toBe('disarmed')
    expect(r.dive!.phase).toBe('idle')
    expect(r.dive!.driverHealth!.state).toBe('paused')
  })

  it('幂等：第二次迁移零写入（靠 migratedAt 印章，不靠形态反推）', async () => {
    const h = repoOf([makeReq({ dive: { activation: 'disarmed', phase: 'active', roundsInStage: 4 } as never })])
    const first = await migrateDiveState({  store: legacyStoreProjection(h.repo as never) as never, now: () => 1000 })
    expect(first.migrated).toBe(1)
    const afterFirst = JSON.stringify((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))
    const second = await migrateDiveState({  store: legacyStoreProjection(h.repo as never) as never, now: () => 2000 })
    expect(second.migrated).toBe(0)
    expect(JSON.stringify((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id))), '第二次必须零写入').toBe(afterFirst)
  })

  it('迁移不改人的意图：非误停摆的 disarmed 记录，activation 全程 disarmed', async () => {
    const h = repoOf([makeReq({ id: 'REQ-manual', dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never })])
    await migrateDiveState({  store: legacyStoreProjection(h.repo as never) as never, now: () => 1000 })
    expect((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id))!.dive!.activation).toBe('disarmed')
  })
})
