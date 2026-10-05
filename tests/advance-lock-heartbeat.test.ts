/**
 * 推进锁续租心跳（REQ-261003222428-3556 FR-1 / t1）——假时钟四用例。
 *
 * 病根：投递认领的 `advance.lockAt` 此前是死租约——单卡执行越过 `advanceLockStaleMs`
 * （15min；历史实测单卡 24.7min）后，任何一次 `reqboard_task_run` 都把它判残留回收，
 * 同一需求两条链并发推进。修复 = job 存活期间按节拍续租（仅刷自己的 runId），
 * 外加 driveChain finally 清锁的归属守卫（旧 run 收尾不得清新 run 的锁）。
 *
 * 与既有 tests/advance-stale-lock.test.ts 的分工：那边证「真死（stale）可回收 +
 * 新鲜锁挡并发」；这边证「在跑的 run 不会变 stale + 收尾/心跳都不越权」。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import { LIMITS } from '../src/domain/limits.js'
import type { JobStartSpec, JobsPort, WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

const FILE = 'src/domain/x.ts'

/** 记录投递参数的 Jobs 端口（只观察，不自动执行 run）。 */
function recorder(seen: JobStartSpec[]): JobsPort {
  return {
    available: () => true,
    get: async () => null,
    start: async (spec: JobStartSpec) => { seen.push(spec); return 'job-' + seen.length },
  } as JobsPort
}

/** 阻塞型执行器：子卡 run 挂起，直到 release() 被调（模拟「单卡跑很久」）。 */
function deferredRunner() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const runner: WorkflowRunner = {
    async start(): Promise<WorkflowRunOutcome> {
      await gate
      return { ok: true, value: { ok: true, output: JSON.stringify({ filesChanged: [FILE], completed: ['完成'], evidence: ['绿'] }) } }
    },
  }
  return { runner, release }
}

async function harnessReady() {
  const h = makeHarness()
  h.docs.put(FILE, 'x')
  const r = req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true })
  h.seedRequirementSync(r)
  h.seedTasks('REQ-000001', [task({ id: 't-p', requirementId: 'REQ-000001', status: 'todo', title: '父卡' })])
  await h.seedSettled()
  return h
}

afterEach(() => { vi.useRealTimers() })

describe('advance 推进锁续租心跳（FR-1）', () => {
  it('① 心跳在跑 + 时钟越过 stale 阈值 → lockAt 被刷新（不变 stale），二次投递仍被挡', async () => {
    const h = await harnessReady()
    const { runner, release } = deferredRunner()
    h.deps.workflow = runner
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    vi.useFakeTimers()

    const dispatchAt = h.clock.t
    const out1 = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out1.dispatched).toBe(true)
    const runId = out1.run_id!
    // run 启动：driveChain 跑到子卡执行并挂在 deferred 上（单卡长跑中）
    const runPromise = seen[0]!.run!(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0) // 让链推进到挂起点

    // 时钟越过 stale 阈值（进程没死、卡还在跑）
    h.clock.t = dispatchAt + LIMITS.advanceLockStaleMs + 60_000
    await vi.advanceTimersByTimeAsync(LIMITS.heartbeatIntervalMs)

    // 心跳把 lockAt 续到了新鲜时刻（没续租时它仍停在 dispatchAt → 必被误判残留）
    const during = (await h.store.get('REQ-000001'))!
    expect(during.advance?.runId).toBe(runId)
    expect(during.advance?.lockAt).toBeGreaterThan(dispatchAt + LIMITS.advanceLockStaleMs)

    // 二次投递：仍按「有 run 在跑」挡下（不放行双跑）
    const out2 = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out2.stopped).toBe('locked')
    expect(out2.dispatched).toBe(false)
    expect((await h.store.get('REQ-000001'))!.advance?.runId).toBe(runId)

    // 收尾：子卡放行 → 链跑完 → finally 清自己的锁
    release()
    await runPromise
    const after = (await h.store.get('REQ-000001'))!
    expect(after.advance?.runId).toBeUndefined()
    expect(after.advance?.lockAt).toBeUndefined()
  })

  it('② 心跳停（模拟进程死亡）+ 时钟越过 stale → lockAt 不被刷新（配合 stale 回收用例 = 真死才接管）', async () => {
    const h = await harnessReady()
    const { runner, release } = deferredRunner()
    h.deps.workflow = runner
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    vi.useFakeTimers()

    const dispatchAt = h.clock.t
    const out1 = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out1.dispatched).toBe(true)
    const runPromise = seen[0]!.run!(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)

    // 进程死亡 = 定时器全灭（finally 不会执行，锁按死租约留在 dispatchAt）
    vi.clearAllTimers()
    h.clock.t = dispatchAt + LIMITS.advanceLockStaleMs + 60_000
    // 即使再有时钟节拍也不应有任何写入（已死的心跳不可能复活）
    const frozen = (await h.store.get('REQ-000001'))!
    expect(frozen.advance?.lockAt).toBe(dispatchAt)
    // 既有语义等价：此刻锁已 stale → advance-stale-lock.test.ts ① 证明回收接管成立

    release()
    await runPromise.catch(() => undefined)
  })

  it('③ 心跳遇 adv.runId 已被他人替换 → 不覆写 lockAt（守卫用例）', async () => {
    const h = await harnessReady()
    const { runner, release } = deferredRunner()
    h.deps.workflow = runner
    const seen: JobStartSpec[] = []
    h.deps.jobs = recorder(seen)
    vi.useFakeTimers()

    await advanceRequirement(h.deps, 'REQ-000001')
    const runPromise = seen[0]!.run!(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)

    // 模拟跨进程接管：锁已易主
    const foreignAt = h.clock.t + 5_000
    await h.store.mutate('REQ-000001', (r) => {
      r.advance = { ...(r.advance ?? {}), runId: 'run-other', lockAt: foreignAt }
      return { changed: true }
    })
    h.clock.t += LIMITS.heartbeatIntervalMs * 3
    await vi.advanceTimersByTimeAsync(LIMITS.heartbeatIntervalMs * 3)

    // 心跳看见了别人的 runId → 一个节拍都不许写
    const after = (await h.store.get('REQ-000001'))!
    expect(after.advance?.runId).toBe('run-other')
    expect(after.advance?.lockAt).toBe(foreignAt)

    release()
    await runPromise
    // 附带证明：旧 run 的 finally 同样不越权（锁还是别人的）
    const final = (await h.store.get('REQ-000001'))!
    expect(final.advance?.runId).toBe('run-other')
    expect(final.advance?.lockAt).toBe(foreignAt)
  })
})
