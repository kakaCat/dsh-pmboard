/**
 * AdvanceChain 事件链测试（REQ-4842fe t7）——对应 design/test-cases.md §4。
 *
 * 口径：全自动跑到 accepting；重复触发 noop 且 revision 不变；单飞锁挡并发；
 * 连续 noop 达阈值熔断；崩溃后恢复扫描续跑；autoRun=false 无新事件、置回 true 续跑。
 *
 * 2026-10-11（退役 workflow 引擎 / `pm-workflow` 删包）：子卡产出不再来自"假引擎 run 的
 * `value.output`"，改由**团队 Worker 经 `reqboard_task_report` 写台账**（`teams-fake`），
 * 链读回来合成同款形状 → 下游（解析 / 落账 / 凭证门）逐字复用。
 * 另有一条因此而来的硬前提：团队派发要求 caller 是 **live agent**，故每次推进都要带调用方句柄
 * （工具入口 `reqboard_task_run` 自带 `exec.agent`）。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement, scanAndResume } from 'pm-core/application/use-cases/AdvanceChain.js'
import { LIMITS } from 'pm-common/limits.js'
import { installTeamProducer, type FakeTeams, type SubtaskProduce, type SubtaskReportPayload } from 'tests/application/teams-fake.js'
import { makeHarness, task, req } from 'tests/application/harness.js'
import type { TaskRecord } from 'pm-core/protocol-domain.js'

const FILE = 'pm-core/src/domain/x.ts'
/** 自动链的调用方句柄（工具入口自带它）；团队端口的每个调用都以它当 authority。 */
const EXEC = { agent: { id: 'session-w-001' } }
/** 一次成功执行的产出：形状与引擎时代 `value.output` 同款。 */
const DONE: SubtaskReportPayload = { filesChanged: [FILE], completed: ['子卡完成'], evidence: ['vitest 绿'] }

async function seed(opts: { autoRun?: boolean; produce?: SubtaskProduce; parentStatus?: 'todo' | 'in_progress'; withSubtaskDone?: boolean; dependsOnCanceled?: boolean } = {}) {
  const h = makeHarness()
  h.docs.put(FILE, 'x')
  // B12 阶段②e：夹具播种必须进**新端口**（原先只写桥镜像，靠桥的补建档语义才偶然可用）。
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: opts.autoRun ?? true }))
  const tasks = [
    task({ id: 't-p', requirementId: 'REQ-000001', status: opts.parentStatus ?? 'todo', title: '父卡', dependsOn: opts.dependsOnCanceled === true ? ['t-dead'] : [] }),
  ]
  if (opts.dependsOnCanceled === true) tasks.push(task({ id: 't-dead', requirementId: 'REQ-000001', status: 'canceled' }))
  if (opts.parentStatus === 'in_progress') {
    tasks[0]!.claimedAt = h.clock.t
    if (opts.withSubtaskDone === true) {
      tasks.push(task({ id: 't-s1', requirementId: 'REQ-000001', status: 'done', parentId: 't-p', stageKind: 'dev' as never, lastReport: { at: h.clock.t, reportIndex: 1, filesChanged: [FILE], completed: ['done'] } }))
      tasks.push(task({ id: 't-s2', requirementId: 'REQ-000001', status: 'todo', parentId: 't-p', stageKind: 'review' as never }))
    }
  }
  h.seedTasks('REQ-000001', tasks)
  installTeamProducer(h, opts.produce ?? DONE)
  await h.seedSettled()
  return h
}

/**
 * 队列任务（同步读自内存队列仓储原始文件）。
 * v9：任务不在台账，只读断言必须经队列；用同步口避免把整个测试文件 async 化
 * （写路径仍走真实 TaskStore，见 executeMoveTask/advanceRequirement 内部）。
 */
function tasksRaw(h: Awaited<ReturnType<typeof seed>>): readonly TaskRecord[] {
  const raw = h.queueRepo.rawOf('REQ-000001')
  return raw === undefined ? [] : (JSON.parse(raw) as { tasks: TaskRecord[] }).tasks
}

describe('事件链自动驱动（4.1 主用例）', () => {
  it('批准后的需求：自动开父卡 → 跑完子卡链 → 收尾 → rollup 进 accepting', async () => {
    const h = await seed()
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).toBe('rollup')
    const events = out.steps.map(s => s.event)
    expect(events[0]).toBe('OPEN_PARENT')
    expect(events.filter(e => e === 'RUN_SUBTASK')).toHaveLength(4)
    expect(events).toContain('FINALIZE_PARENT')
    expect(events[events.length - 1]).toBe('ROLLUP')
    const reqAfter = (await h.store.get('REQ-000001'))!
    expect(reqAfter.status).toBe('accepting')
    expect(tasksRaw(h).find(t => t.id === 't-p')!.status).toBe('done')
    expect(tasksRaw(h).filter(t => t.parentId === 't-p').every(t => t.status === 'done')).toBe(true)
  })

  it('4.3 幂等重放：链已完成（accepting）后再触发 → noop 且台账/队列双判据均不变', async () => {
    const h = await seed()
    await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    const rev = (await h.store.head()).revision
    // B-2（Lead 裁定）：任务已移出台账，单看台账 revision 对"任务有没有被写"是**恒真的假绿**，
    // 真判据 = 队列写入序号不变（幂等 noop 不写盘）。
    const qrev = h.queueRevisionOf('REQ-000001')
    const again = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(again.stopped).toBe('terminal')
    expect(again.steps).toEqual([])
    expect((await h.store.head()).revision).toBe(rev)
    expect(h.queueRevisionOf('REQ-000001')).toBe(qrev)
  })

  it('4.4 单飞锁：台账 lockAt 新鲜时被挡下（不重复执行）', async () => {
    const h = await seed()
    // 播种后的"预置"也要经新端口（镜像已不是真相源）
    await h.store.mutate('REQ-000001', (r) => { r.advance = { lockAt: h.clock.t }; return { changed: true } })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).toBe('locked')
    expect(out.steps).toEqual([])
    // 早退也要显式 dispatched:false + 人话 reason（不再让工具壳误判成成功回执）
    expect(out.dispatched).toBe(false)
    expect(typeof out.reason).toBe('string')
    expect(tasksRaw(h).find(t => t.id === 't-p')!.status).toBe('todo')
  })

  it('4.5 停滞熔断：连续 noop 达阈值 → autoRun=false + pausedReason=stagnation', async () => {
    const h = await seed({ dependsOnCanceled: true })
    let last: Awaited<ReturnType<typeof advanceRequirement>> | undefined
    for (let i = 0; i < LIMITS.advanceNoopBreaker; i += 1) {
      last = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
      if (last.stopped === 'paused') break
    }
    expect(last?.stopped).toBe('paused')
    const r = (await h.store.get('REQ-000001'))!
    expect(r.autoRun).toBe(false)
    expect(r.advance?.pausedReason).toBe('stagnation')
  })

  it('4.7 autoRun=false 无新事件；置回 true 并触发一次即续跑', async () => {
    const h = await seed({ autoRun: false })
    expect((await advanceRequirement(h.deps, 'REQ-000001', EXEC)).stopped).toBe('not_autorun')
    expect(tasksRaw(h).find(t => t.id === 't-p')!.status).toBe('todo')
    await h.store.mutate('REQ-000001', (r) => { r.autoRun = true; return { changed: true } })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).toBe('rollup')
  })

  it('4.6 崩溃恢复：中途状态（父卡 in_progress + 一张子卡 done）→ 扫描续跑至完成', async () => {
    const h = await seed({ parentStatus: 'in_progress', withSubtaskDone: true })
    const outcomes = await scanAndResume(h.deps, EXEC)
    expect(outcomes).toHaveLength(1)
    expect((await h.store.get('REQ-000001'))!.status).toBe('accepting')
    expect(tasksRaw(h).find(t => t.id === 't-s2')!.status).toBe('done')
  })

  it('4.8 caller 透传：团队端口的每个调用都以 exec.agent 为 authority（design/architecture §3 parent: exec.agent）', async () => {
    const h = await seed()
    // 引擎时代这句钉的是"派给引擎的 run.parent"；引擎退役后 parent 的含义落在团队端口的
    // `caller` 上——丢了它（或换成别的窗口）就派不动卡，等价于当时的 start_failed。
    const teams = h.deps.teams as FakeTeams
    const callers: unknown[] = []
    const createTask = teams.createTask.bind(teams)
    teams.createTask = async (caller, input) => { callers.push(caller); return await createTask(caller, input) }
    const spawnWorker = teams.spawnWorker.bind(teams)
    teams.spawnWorker = async (caller, input) => { callers.push(caller); return await spawnWorker(caller, input) }
    const exec = { agent: { id: 'session-w-001' } }
    await advanceRequirement(h.deps, 'REQ-000001', exec)
    expect(callers.length).toBeGreaterThan(0)
    expect(callers.every(c => c === exec.agent)).toBe(true)
  })

  it('5.2 失败即暂停：第 2 张子卡没写台账（team_report_missing）→ autoRun=false，不执行后续卡', async () => {
    let n = 0
    const h = await seed({ produce: () => ((n += 1) === 2 ? undefined : DONE) })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).toBe('paused')
    expect((await h.store.get('REQ-000001'))!.autoRun).toBe(false)
    expect((await h.store.get('REQ-000001'))!.advance?.pausedReason).toBe('fail')
    expect(out.steps.some(s => s.outcome === 'failed')).toBe(true)
    expect(out.steps.find(s => s.outcome === 'failed')?.detail).toContain('team_report_missing')
    const subs = tasksRaw(h).filter(t => t.parentId === 't-p')
    expect(subs.filter(s => s.status === 'done').length).toBeLessThan(4)
  })
})

// REQ-260928185112-e20d Phase2：只对**瞬断类（abort 族）**允许同一 job 内自动重试一次。
describe('瞬断自动重试一次（Phase2）', () => {
  /**
   * 团队语义下的"瞬断" = **承载本次派发的信号被掐掉**（内容未知）——与引擎时代同一类失败：
   * Worker 等待期上抛 abort 族错误，链的 transient 判据（`isTransientAbort`）照旧命中。
   * 判据本身没改，改的只是这句话从哪来（引擎 stopReason → 团队等待期异常）。
   */
  const ABORT = 'team dispatch aborted: signal aborted'

  it('瞬断 → 同一 job 内重试一次并继续，不暂停、不需人工续跑', async () => {
    let n = 0
    const produce = (): SubtaskReportPayload => { n += 1; if (n === 1) throw new Error(ABORT); return DONE }
    const h = await seed({ parentStatus: 'in_progress', withSubtaskDone: true, produce })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.steps.some(s => s.event === 'RETRY')).toBe(true)
    expect((await h.store.get('REQ-000001'))!.autoRun).not.toBe(false)
    expect(tasksRaw(h).find(t => t.id === 't-s2')?.status).toBe('done')
  })

  it('同一张卡连续瞬断两次 → 第二次仍停（只重试一次）', async () => {
    const produce = (): SubtaskReportPayload => { throw new Error(ABORT) }
    const h = await seed({ parentStatus: 'in_progress', withSubtaskDone: true, produce })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).toBe('paused')
    expect((await h.store.get('REQ-000001'))!.autoRun).toBe(false)
  })

  it('非瞬断失败（team_report_missing）不重试 → 立即暂停（2026-09-20 裁定未变）', async () => {
    let n = 0
    const h = await seed({ produce: () => { n += 1; return n >= 2 ? undefined : DONE } })
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.steps.some(s => s.event === 'RETRY')).toBe(false)
    expect(out.stopped).toBe('paused')
  })
})
