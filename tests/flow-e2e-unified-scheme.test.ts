/**
 * 端到端流程验证（REQ-260928185112-e20d 统一方案）——**造数据 + mock 执行面**，一次投递跑完整条链。
 *
 * 为什么要有这篇：前面的用例是**分片**验证（阶段解析/产出契约/提示词/泳道/重试各自单测），
 * 但"从队列领任务 → 逐步跑完 → 父卡收尾 → rollup 进验收"这条**整链**从未端到端跑过。
 * 本文件用真实 QueueTaskStore + 真实 AdvanceChain + 假团队端口（`FakeTeams`）与 jobs 端口，
 * 把下面五件事在同一次运行里一起钉住：
 *   ① 步骤计划按卡性质生成（implement/frontend 保守 4 段；doc 卡 2 段）；
 *   ② 每张卡的**团队任务描述**里【产出要求】契约按证据族分流（写入族 filesChanged / 结论族 verdict）；
 *   ③ 子卡提示词带【本步边界】（验收切片：dev 段不得跑父卡终态验收命令）；
 *   ④ 取消权来自**后台 job**（不是派发它的 turn），且调用者 agent 一路透传到团队端口；
 *   ⑤ 证据门 → 父卡收尾 → 需求 rollup 进 accepting，全程无人工介入；
 *   ⑥ 瞬断一次能自动重试并跑完（无需人工续跑）。
 *
 * 2026-10-11 退役 workflow 引擎：原 `MockEngine`（按 `args.stageKind` 回产出的假引擎）与
 * "脚本 `phase(步名)` / 脚本 schema"这类**脚本观测面**一并退役——执行面只剩 Agent Teams，
 * 本文件的等价观测面改成**团队任务描述**（提示词与产出契约的原样去处）。
 * 瞬断用例的等价物：让假团队首次 `waitForChange` 抛 abort 族错误（原 `abortFirst` 的引擎等价）。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement } from 'pm-core/application/use-cases/AdvanceChain.js'
import { STAGE_EVIDENCE_KIND } from 'pm-core/domain/task/SubtaskTemplate.js'
import { makeHarness, task, req } from 'tests/application/harness.js'
import type { JobsPort, JobStartSpec } from 'pm-core/application/ports.js'
import type { TaskRecord } from 'pm-core/protocol-domain.js'
import { FakeTeams, type SubtaskProduce } from 'tests/application/teams-fake.js'

/** 写入族证据要求的真实落盘文件（凭证门会 stat 它）。 */
const FILE = 'pm-core/src/domain/x.ts'

/**
 * 团队假件 + **记录 caller**：authority credential（调用者 agent）的观测面。
 * 原引擎时代的等价断言是"引擎收到的 `parent: exec.agent`"——两条都是"调用者一路透传"的判据。
 */
class CapturingTeams extends FakeTeams {
  readonly callers: unknown[] = []
  async spawnWorker(c: unknown, i: Parameters<FakeTeams['spawnWorker']>[1]) {
    this.callers.push(c)
    return await super.spawnWorker(c, i)
  }
  async createTask(c: unknown, i: Parameters<FakeTeams['createTask']>[1]) {
    this.callers.push(c)
    return await super.createTask(c, i)
  }
}

/**
 * 首次等待即抛**瞬断**（abort 族）：`runSubtaskViaTeam` 的 catch 把它包成
 * `team_error: runtime disposed` → `isTransientAbort` 命中 → 同一 job 内自动重试一次。
 * （原 MockEngine 的 `abortFirst` 在团队执行面的等价物。）
 */
class FlakyTeams extends FakeTeams {
  private waits = 0
  async waitForChange(): Promise<{ timedOut: boolean }> {
    this.waits += 1
    if (this.waits === 1) throw new Error('runtime disposed')
    return await super.waitForChange()
  }
}

/** jobs 桩：同步 await 执行（走**投递路径**，以便验证 runSignal 来自 job 而非 turn）。 */
class SyncJobs implements JobsPort {
  jobSignal?: AbortSignal
  async start(spec: JobStartSpec): Promise<string> {
    const controller = new AbortController()
    this.jobSignal = controller.signal
    await spec.run(controller.signal)
    return 'job-e2e-1'
  }
  async get(): Promise<null> { return null }
  available(): boolean { return true }
}

async function seedFlow() {
  const h = makeHarness()
  h.docs.put(FILE, 'x')
  // B12 阶段②e：播种进新端口
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
  h.seedTasks('REQ-000001', [
    // 父卡一：代码实现卡（frontend，未声明接口面 → 保守保留联调段，需计划显式声明才删）
    task({ id: 't-impl', requirementId: 'REQ-000001', status: 'todo', title: '实现卡', phase: 'implement' as never, side: 'frontend' as never }),
    // 父卡二：纯文档卡（side=doc → 只落 dev+review）
    task({ id: 't-doc', requirementId: 'REQ-000001', status: 'todo', title: '文档卡', phase: 'implement' as never, side: 'doc' as never, dependsOn: ['t-impl'] }),
  ])
  const jobs = new SyncJobs()
  // 子卡阶段在链上才展开，故 produce 回调里**同步**查队列取 stageKind，再按证据族给产出
  // （写入族要真实落盘文件，结论族只要 completed——与凭证门口径一致）。
  const stageKindOf = (subtaskId: string): string => {
    const raw = h.queueRepo.rawOf('REQ-000001')
    const tasks = raw === undefined ? [] : (JSON.parse(raw) as { tasks: { id: string; stageKind?: string }[] }).tasks
    return String(tasks.find(t => t.id === subtaskId)?.stageKind ?? '')
  }
  const produce: SubtaskProduce = (subtaskId) => {
    const kind = stageKindOf(subtaskId)
    return STAGE_EVIDENCE_KIND[kind as never] === 'verdict'
      ? { completed: [kind + ' 通过'], evidence: ['mock 命令 exit 0'] }
      : { filesChanged: [FILE], completed: [kind + ' 完成'], evidence: ['mock 测试绿'] }
  }
  const teams = new CapturingTeams(h, produce)
  h.deps.teams = teams
  h.deps.jobs = jobs
  await h.seedSettled()
  return { h, teams, jobs }
}

const tasksRaw = (h: Awaited<ReturnType<typeof seedFlow>>['h']): readonly TaskRecord[] => {
  const raw = h.queueRepo.rawOf('REQ-000001')
  return raw === undefined ? [] : (JSON.parse(raw) as { tasks: TaskRecord[] }).tasks
}

describe('E2E：从队列领任务跑完整条链（统一新方案）', () => {
  it('步骤计划按卡性质 → 逐步跑完 → 父卡收尾 → 需求进验收；产出契约/提示词/取消权全部符合新口径', async () => {
    const { h, teams, jobs } = await seedFlow()
    const execAgent = { id: 'session-w-001' }
    const turnSignal = AbortSignal.abort('turn 已结束') // 故意先掐：不应影响 chain 内的子卡 run

    const out = await advanceRequirement(h.deps, 'REQ-000001', { agent: execAgent, signal: turnSignal })

    const tasks = tasksRaw(h)
    const subsOf = (pid: string) => tasks.filter(t => t.parentId === pid)

    // ① 步骤计划按卡性质生成
    expect(subsOf('t-impl').map(s => s.stageKind)).toEqual(['dev', 'integrate', 'review', 'test'])
    expect(subsOf('t-doc').map(s => s.stageKind)).toEqual(['dev', 'review'])

    // ⑤ 逐步跑完 + 父卡收尾 + rollup（无人工介入、无 RETRY）
    expect(subsOf('t-impl').every(s => s.status === 'done')).toBe(true)
    expect(subsOf('t-doc').every(s => s.status === 'done')).toBe(true)
    expect(tasks.find(t => t.id === 't-impl')!.status).toBe('done')
    expect(tasks.find(t => t.id === 't-doc')!.status).toBe('done')
    // 投递路径的返回体只给回执（steps/stopped 恒空），链的真实结局看状态与 advance.history
    expect(out.dispatched).toBe(true)
    expect(((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
    const hist = ((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))!.advance?.history ?? []
    expect(hist.some(r => r.event === 'RETRY')).toBe(false)
    expect(hist.filter(r => r.event === 'RUN_SUBTASK' && r.outcome === 'ok').length).toBe(6)

    // ② 产出契约按证据族分流：判据落在**团队任务描述**里的【产出要求】（与脚本 schema 同源）。
    //    （原「脚本带 phase(步名) 进度事件」是引擎脚本的东西，随引擎退役——无等价物，见报告。）
    const descOfStage = (stage: string): string => {
      const card = teams.created.find(c => c.subject.startsWith('[' + stage + ']'))
      expect(card, '未派出 ' + stage + ' 段的团队任务').toBeDefined()
      return card!.description
    }
    const devDesc = descOfStage('dev')
    expect(devDesc).toContain('"filesChanged"')
    const reviewDesc = descOfStage('review')
    expect(reviewDesc).toContain('"verdict"')
    expect(reviewDesc).not.toContain('"filesChanged"')

    // ③ 提示词带本步边界（验收切片）
    expect(devDesc).toContain('【本步边界】')
    expect(devDesc).toContain('不要')

    // ④ 取消权来自 job（turn 已 abort，但链仍在 job 的 signal 下跑完——⑤ 的 done 即证据）。
    //    runSignal 的引擎侧消费者随退役消失，故信号不再从 run 入参观测；此处钉"job 的 signal 确实建立"。
    expect(jobs.jobSignal).toBeDefined()
    // 调用者 agent 一路透传到团队端口（authority credential；原判据是引擎收到的 parent: exec.agent）
    expect(teams.callers.length).toBeGreaterThan(0)
    expect(teams.callers.every(c => c === execAgent)).toBe(true)
  })

  it('首次瞬断（abort 族）→ 自动重试一次后跑完整条链，无需人工续跑', async () => {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    // B12 阶段②e：播种进新端口（inline 站点）
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    await h.seedSettled()
    h.seedTasks('REQ-000001', [task({ id: 't-impl', requirementId: 'REQ-000001', status: 'todo', title: '实现卡' })])
    // 首次 waitForChange 抛瞬断，第二次正常回写台账产出
    h.deps.teams = new FlakyTeams(h, { filesChanged: [FILE], completed: ['完成'], evidence: ['mock 测试绿'] })
    const jobs = new SyncJobs()
    h.deps.jobs = jobs

    const out = await advanceRequirement(h.deps, 'REQ-000001', { agent: { id: 'session-w-001' } })

    expect(out.dispatched).toBe(true)
    const hist = ((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))!.advance?.history ?? []
    expect(hist.some(r => r.event === 'RETRY')).toBe(true)
    expect(((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
    expect(((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)))!.autoRun).toBe(true)
    expect(tasksRaw(h).filter(t => t.parentId === 't-impl').every(s => s.status === 'done')).toBe(true)
  })
})
