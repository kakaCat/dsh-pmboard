/**
 * 优先级排序 + 全局在制上限（REQ-261004110201-f253 FR-4）。
 *
 * 钉四条：
 *  ① 排序：priority 降序、同值 createdAt 升序（稳定）；
 *  ② WIP 闸：在制满 → 不投递 + stopped='wip_limit' + 原因点名在跑的需求与上限；
 *  ③ 上限 0（缺省）= 不限 = 现状行为；
 *  ④ 无 priority 字段 = 视作 0，顺序与改造前一致（按 createdAt）。
 */
import { describe, it, expect } from 'vitest'
import { scanAndResume } from '../src/application/use-cases/AdvanceChain.js'
import { LIMITS } from '../src/domain/limits.js'
import type { JobStartSpec, JobsPort } from '../src/application/ports.js'
import { makeHarness, req } from './application/harness.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** 只记录投递、不执行 run 的 Jobs 端口。 */
function recorder(seen: JobStartSpec[]): JobsPort {
  return {
    available: () => true,
    get: async () => null,
    start: async (spec: JobStartSpec) => { seen.push(spec); return 'job-' + seen.length },
  } as JobsPort
}

function seed(h: ReturnType<typeof makeHarness>, id: string, createdAt: number, priority?: number) {
  h.seedRequirementSync(req({
    id,
    status: 'implementing',
    category: 'feature',
    autoRun: true,
    createdAt,
    ...(priority !== undefined ? { priority } : {}),
  } as Partial<RequirementRecord>))
}

describe('FR-4 ① 排序：priority 降序 + 同值 createdAt 升序', () => {
  it('高优先级先投递；同值按创建时间早的先', async () => {
    const h = makeHarness()
    seed(h, 'REQ-000011', 100, 0)
    seed(h, 'REQ-000012', 200, 10)
    seed(h, 'REQ-000013', 300, 5)
    seed(h, 'REQ-000014', 250, 5)
    await h.seedSettled()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)

    const out = await scanAndResume(h.deps)

    expect(out.map((o) => o.requirementId)).toEqual(['REQ-000012', 'REQ-000014', 'REQ-000013', 'REQ-000011'])
    expect(seen).toHaveLength(4)
  })

  it('无 priority 字段 → 视作 0，按 createdAt 升序（= 改造前口径）', async () => {
    const h = makeHarness()
    seed(h, 'REQ-000021', 200)
    seed(h, 'REQ-000022', 100)
    await h.seedSettled()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)

    const out = await scanAndResume(h.deps)
    expect(out.map((o) => o.requirementId)).toEqual(['REQ-000022', 'REQ-000021'])
  })
})

describe('FR-4 ② WIP 闸：在制满则不投递并如实说明', () => {
  async function seedThreeWithRouting(opts: { limit?: number; runningId?: string } = {}) {
    const h = makeHarness()
    seed(h, 'REQ-000031', 100, 10)
    seed(h, 'REQ-000032', 200, 5)
    seed(h, 'REQ-000033', 300, 1)
    await h.seedSettled()
    if (opts.limit !== undefined) h.deps.maxInFlightRequirements = opts.limit
    if (opts.runningId !== undefined) {
      await h.store.mutate(opts.runningId, (r) => {
        r.advance = { ...(r.advance ?? {}), lockAt: h.clock.t, runId: 'run-live' } as never
        return { changed: true }
      })
    }
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    return { h, seen }
  }

  it('上限 1：最高优先级投出，其余 wip_limit 且原因点名在跑者与上限', async () => {
    const { h, seen } = await seedThreeWithRouting({ limit: 1 })
    const out = await scanAndResume(h.deps)

    expect(seen).toHaveLength(1)
    expect(out[0]!.requirementId).toBe('REQ-000031')
    expect(out[0]!.dispatched).toBe(true)

    const blocked = out.slice(1)
    expect(blocked).toHaveLength(2)
    for (const b of blocked) {
      expect(b.stopped).toBe('wip_limit')
      expect(b.dispatched).toBe(false)
      expect(String(b.reason)).toContain('REQ-000031')   // 点名谁在跑
      expect(String(b.reason)).toContain('上限 1')     // 点名上限
      expect(String(b.reason)).toContain('maxInFlightRequirements') // 给解除方式
    }
  })

  it('已有新鲜锁的需求计入在制：上限 1 时一条都不投', async () => {
    const { h, seen } = await seedThreeWithRouting({ limit: 1, runningId: 'REQ-000033' })
    const out = await scanAndResume(h.deps)
    expect(seen).toHaveLength(0)
    expect(out.every((o) => o.stopped === 'wip_limit')).toBe(true)
    expect(String(out[0]!.reason)).toContain('REQ-000033')
  })

  it('陈旧锁不计入在制（进程死后的残留锁不挡新投递）', async () => {
    const { h, seen } = await seedThreeWithRouting({ limit: 2 })
    await h.store.mutate('REQ-000033', (r) => {
      r.advance = { ...(r.advance ?? {}), lockAt: h.clock.t - LIMITS.advanceLockStaleMs - 1, runId: 'run-dead' } as never
      return { changed: true }
    })
    const out = await scanAndResume(h.deps)
    // 限额 2：投前两条（p10/p5）；p1 虽然"锁残留"但不占额度，轮到它时额度已满 → wip_limit
    expect(seen).toHaveLength(2)
    expect(out.map((o) => o.requirementId)).toEqual(['REQ-000031', 'REQ-000032', 'REQ-000033'])
    expect(out[2]!.stopped).toBe('wip_limit')
  })

  it('上限 0（缺省）= 不限：三条全投（改造前行为）', async () => {
    const { h, seen } = await seedThreeWithRouting({ limit: 0 })
    const out = await scanAndResume(h.deps)
    expect(seen).toHaveLength(3)
    expect(out.every((o) => o.dispatched === true)).toBe(true)
    expect(out.every((o) => o.stopped !== 'wip_limit')).toBe(true)
  })
})
