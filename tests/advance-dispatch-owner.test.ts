/**
 * 后台任务 owner 口径（REQ-261002173819-69c7 t1 / serves: FR-2）。
 *
 * 病根：`ctx.jobs.start({ owner })` 的 owner 会被宿主拿去 `agents.get(id)` 解析 live agent
 * （`@deepseek-ai/dsh-jobs-local` 的 `resolveOwner`），**只认 id 字符串**。本仓此前传 `exec.agent`
 * （对象）→ `agents.get(<object>)` → undefined → 抛 `session "[object Object]" has no live agent`，
 * 自动实施链因此从来没投递成功过（2026-10-02 REQ-261002161439-277d：advance.history 长度为 0）。
 *
 * 本文件先钉两条（t2 再接失败路径的 D-1/D-2/D-3/D-5/D-7）：
 *  · D-4 投递时捕获到的 owner 是**字符串**（id 与 session.id 两条来路都算）；
 *  · D-6 `dispatchOwnerOf` 与 dive 的 `agentIdOf` 在四类输入上**逐例同源**（防两处口径漂移）。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import { dispatchOwnerOf } from '../src/application/internal/support.js'
import { agentIdOf } from '../src/application/dive/round-state.js'
import type { JobStartSpec, JobsPort } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

/** 记录投递参数的 Jobs 端口（只观察，不执行 run）。 */
function recorder(seen: JobStartSpec[]): JobsPort {
  return {
    available: () => true,
    get: async () => null,
    start: async (spec: JobStartSpec) => { seen.push(spec); return 'job-' + seen.length },
  }
}

/**
 * 必失败的 Jobs 端口：错误文案刻意写成**修好之后**的真实形态（宿主拿 id 去查、查不到），
 * 而不是历史形态（`session "[object Object]"`）——因为 D-3 要断言留痕里不再出现 `[object Object]`，
 * 用历史文案做夹具会自相矛盾。
 */
function thrower(): JobsPort {
  return {
    available: () => true,
    get: async () => null,
    start: async () => { throw new Error('session "session-gone" has no live agent (background job owner must be live)') },
  }
}

async function harnessReady() {
  const h = makeHarness()
  const r = req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true })
  // B12 阶段②e：播种进新端口
  h.seedRequirementSync(r)
  h.seedTasks('REQ-000001', [task({ id: 't-p', requirementId: 'REQ-000001', status: 'todo', title: '父卡' })])
  await h.seedSettled()
  return h
}

describe('t1 · 后台任务 owner 必须是 id 字符串（宿主 resolveOwner 契约）', () => {
  it('D-4a：exec.agent.id 存在 → 投递的 owner 是该字符串（不是对象）', async () => {
    const h = await harnessReady()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)

    const out = await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-8c9338a3' } })

    expect(out.dispatched).toBe(true)
    expect(seen).toHaveLength(1)
    expect(typeof seen[0]!.owner).toBe('string')
    expect(seen[0]!.owner).toBe('session-8c9338a3')
    // 反向保护：绝不能再把 agent 对象本身传出去（宿主会把它字符串化成 [object Object]）
    expect(typeof seen[0]!.owner).not.toBe('object')
  })

  it('D-4b：只有 agent.session.id 时 → 同样取出字符串', async () => {
    const h = await harnessReady()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)

    const out = await advanceRequirement(h.deps, 'REQ-000001', { agent: { session: { id: 'session-by-session' } } })

    expect(out.dispatched).toBe(true)
    expect(seen[0]!.owner).toBe('session-by-session')
  })

  it('D-6：dispatchOwnerOf 与 agentIdOf 四类输入逐例同源', () => {
    const agents: unknown[] = [
      { id: 'a-id' },
      { session: { id: 'a-session' } },
      {},
      null,
    ]
    for (const agent of agents) {
      expect(dispatchOwnerOf({ agent })).toBe(agentIdOf(agent))
    }
    // 明确取值（不只是"两处一样"，还要钉住它们各自等于什么）
    expect(dispatchOwnerOf({ agent: { id: 'a-id' } })).toBe('a-id')
    expect(dispatchOwnerOf({ agent: { session: { id: 'a-session' } } })).toBe('a-session')
    expect(dispatchOwnerOf({})).toBeUndefined()
    expect(dispatchOwnerOf({ agent: null })).toBeUndefined()
    expect(dispatchOwnerOf(undefined)).toBeUndefined()
  })
})

describe('t2 · 投递失败不把重试锁死（锁回收 + 可读留痕）', () => {
  it('D-1/D-2：投递抛错 → 锁被回收、stopped=dispatch_failed；紧接着可立刻重试成功', async () => {
    const h = await harnessReady()
    h.deps.jobs = thrower()

    const failed = await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-8c9338a3' } })

    expect(failed.dispatched).toBe(false)
    expect(failed.stopped).toBe('dispatch_failed')
    // 锁是投递前认领的，失败时必须回收——否则后续 15 分钟全被 REQBOARD_ADVANCE_LOCKED 挡下
    const after = (await h.store.get('REQ-000001'))!
    expect(after.advance?.lockAt).toBeUndefined()
    expect(after.advance?.runId).toBeUndefined()

    // 立刻重试：不得再撞 'locked'
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    const retried = await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-8c9338a3' } })

    expect(retried.dispatched).toBe(true)
    expect(retried.stopped).not.toBe('locked')
    expect(typeof retried.job_id).toBe('string')
    expect(seen).toHaveLength(1)
  })

  it('D-3：失败留痕可读——history 记 DISPATCH_FAILED，comment 含需求号与分类且不含 [object Object]', async () => {
    const h = await harnessReady()
    h.deps.jobs = thrower()

    await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-8c9338a3' } })

    const after = (await h.store.get('REQ-000001'))!
    const last = (after.advance?.history ?? []).at(-1)
    expect(last?.event).toBe('DISPATCH_FAILED')
    expect(last?.outcome).toBe('failed')
    expect(last?.detail).toContain('owner_unresolvable')

    const body = (after.comments ?? []).map((c) => c.body ?? '').join('\n')
    expect(body).toContain('REQ-000001')
    expect(body).toContain('owner_unresolvable')
    expect(body).not.toContain('[object Object]')
  })

  it('D-5：owner 取不到 → 按 unowned 投递（不降级同步、不报错），并留 owner_missing 痕', async () => {
    const h = await harnessReady()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)

    const out = await advanceRequirement(h.deps, 'REQ-000001', {})

    expect(out.dispatched).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.owner).toBeUndefined()

    const after = (await h.store.get('REQ-000001'))!
    const body = (after.comments ?? []).map((c) => c.body ?? '').join('\n')
    expect(body).toContain('owner_missing')
  })

  it('D-7：他人新鲜锁不被回收（只清自己认领的那把）', async () => {
    const h = await harnessReady()
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    // 播种后的"预置锁"也要经新端口
    await h.store.mutate('REQ-000001', (r) => { r.advance = { lockAt: h.clock.t, runId: 'run-other-live' }; return { changed: true } })

    const out = await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-x' } })

    expect(out.stopped).toBe('locked')
    expect(out.dispatched).toBe(false)
    expect(seen).toHaveLength(0)
    const after = (await h.store.get('REQ-000001'))!
    expect(after.advance?.runId).toBe('run-other-live')
    expect(after.advance?.lockAt).toBe(h.clock.t)
  })
})

