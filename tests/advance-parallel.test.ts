/**
 * 批内写集分组真并行（REQ-261003222428-3556 FR-2 / t2）。
 *
 * 钉四件事：
 *  ① 两父卡写集无冲突 → 两张子卡**同时在跑**（执行窗口重叠，真并行）；
 *  ② 写集冲突对 → 严格串行（后张开始 ≥ 前张结束）；
 *  ③ 未声明写集对 → 同样严格串行（保守纪律：宁可慢、不可错；存量卡全属此类 = 行为不变式 2）；
 *  ④ 并行组内一张失败 → 链暂停 + 成功卡结果保留 + 失败卡回滚，history 同批共享 batchId。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import type { WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

const FILE_A = 'src/a/x.ts'
const FILE_B = 'docs/b/y.ts'

interface Call { sub: string; phase: 'start' | 'end' }

/** 两父卡各带一张 dev 子卡；写集按参数声明。注意：改动文件不预置——
 *  由执行器在各自开工时刻落盘（静态/单时钟下，预置文件的 mtime 会落进前一张卡的
 *  执行窗口，被跨卡覆盖检查误判；生产上 mtime 天然错开，无此问题）。 */
async function harnessTwoParents(ws1: string[], ws2: string[]) {
  const h = makeHarness()
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
  h.seedTasks('REQ-000001', [
    task({ id: 't-p1', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡1', scope: { apis: [], tables: [], files: ws1 } }),
    task({ id: 't-s1', requirementId: 'REQ-000001', status: 'todo', title: '子卡1', parentId: 't-p1', stageKind: 'dev' as never }),
    task({ id: 't-p2', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡2', scope: { apis: [], tables: [], files: ws2 } }),
    task({ id: 't-s2', requirementId: 'REQ-000001', status: 'todo', title: '子卡2', parentId: 't-p2', stageKind: 'dev' as never }),
  ])
  await h.seedSettled()
  return h
}

/** 追踪型执行器：记录每张子卡的开始/结束；开工时刻落盘各自的改动文件并把时钟拨快 1
 *  （让各卡执行窗口/mtime 可区分，贴近生产时序）；gate=true 时等两张都开工才放行（造重叠窗口）。 */
function trackingRunner(h: ReturnType<typeof makeHarness>, calls: Call[], opts: { gate?: boolean; failFor?: string } = {}) {
  const started = new Set<string>()
  let releaseAll!: () => void
  const allStarted = new Promise<void>((resolve) => { releaseAll = resolve })
  const runner: WorkflowRunner = {
    async start(spec: { args?: { subtaskId?: string } }): Promise<WorkflowRunOutcome> {
      const sub = String(spec.args?.subtaskId ?? '?')
      calls.push({ sub, phase: 'start' })
      const file = sub === 't-s1' ? FILE_A : FILE_B
      // 先拨钟再落盘：mtime 严格晚于本卡开工时刻（跨卡检查据此认「是我自己写的」），
      // 各卡执行窗口/mtime 也因此可区分，贴近生产时序。
      h.clock.t += 1
      h.docs.put(file, 'written-by-' + sub)
      started.add(sub)
      if (opts.gate === true && started.size >= 2) releaseAll()
      if (opts.gate === true) await allStarted
      calls.push({ sub, phase: 'end' })
      if (opts.failFor === sub) return { ok: false, reason: '凭证门失败：改动文件不存在（模拟硬失败）' }
      return { ok: true, value: { ok: true, output: JSON.stringify({ filesChanged: [file], completed: ['完成'], evidence: ['绿'] }) } }
    },
  }
  return runner
}

describe('advance 批内写集分组真并行（FR-2）', () => {
  it('① 写集无冲突 → 两子卡执行窗口重叠（真并行），链跑完进验收', async () => {
    const h = await harnessTwoParents([FILE_A], [FILE_B])
    const calls: Call[] = []
    h.deps.workflow = trackingRunner(h, calls, { gate: true })

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).toBe('rollup')
    // 重叠窗口：两个 start 都在任何 end 之前
    const kinds = calls.map((c) => c.phase)
    expect(kinds.indexOf('end')).toBeGreaterThan(kinds.lastIndexOf('start'))
    expect(new Set(calls.filter((c) => c.phase === 'start').map((c) => c.sub))).toEqual(new Set(['t-s1', 't-s2']))
    // 两子卡均完成
    const tasks = await h.taskStore.listByRequirement('REQ-000001')
    expect(tasks.find((t) => t.id === 't-s1')?.status).toBe('done')
    expect(tasks.find((t) => t.id === 't-s2')?.status).toBe('done')
    // 同批 RUN_SUBTASK 的 history 共享 batchId
    const after = (await h.store.get('REQ-000001'))!
    const runs = (after.advance?.history ?? []).filter((r) => r.event === 'RUN_SUBTASK')
    expect(runs.length).toBe(2)
    expect(runs[0]!.batchId).toBeDefined()
    expect(runs[0]!.batchId).toBe(runs[1]!.batchId)
  })

  it('② 写集冲突对（同目录） → 严格串行：后张开始 ≥ 前张结束', async () => {
    const h = await harnessTwoParents([FILE_A], ['src/a/z.ts'])
    const calls: Call[] = []
    h.deps.workflow = trackingRunner(h, calls)

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).toBe('rollup')
    expect(calls).toEqual([
      { sub: 't-s1', phase: 'start' },
      { sub: 't-s1', phase: 'end' },
      { sub: 't-s2', phase: 'start' },
      { sub: 't-s2', phase: 'end' },
    ])
  })

  it('③ 未声明写集对 → 保守串行（存量默认 ≡ 旧行为）', async () => {
    const h = await harnessTwoParents([], [])
    const calls: Call[] = []
    h.deps.workflow = trackingRunner(h, calls)

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).toBe('rollup')
    expect(calls.map((c) => c.sub + ':' + c.phase)).toEqual([
      't-s1:start', 't-s1:end', 't-s2:start', 't-s2:end',
    ])
  })

  it('④ 并行组内一张失败 → 链暂停 + 成功卡结果保留 + 失败卡回滚', async () => {
    const h = await harnessTwoParents([FILE_A], [FILE_B])
    const calls: Call[] = []
    h.deps.workflow = trackingRunner(h, calls, { gate: true, failFor: 't-s1' })

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).toBe('paused')
    const tasks = await h.taskStore.listByRequirement('REQ-000001')
    // 成功卡结果保留（不受影响）
    expect(tasks.find((t) => t.id === 't-s2')?.status).toBe('done')
    // 失败卡回滚待办（attempt 已计）
    const s1 = tasks.find((t) => t.id === 't-s1')
    expect(s1?.status).toBe('todo')
    expect(s1?.attempt).toBe(1)
    // 链暂停：autoRun 置 false、需求停在实施态
    const after = (await h.store.get('REQ-000001'))!
    expect(after.autoRun).toBe(false)
    expect(after.status).toBe('implementing')
    // 两张子卡的留痕都在（成功的不被回滚）
    const runs = (after.advance?.history ?? []).filter((r) => r.event === 'RUN_SUBTASK')
    expect(runs.map((r) => r.subtaskId).sort()).toEqual(['t-s1', 't-s2'])
    expect(runs.find((r) => r.subtaskId === 't-s2')?.outcome).toBe('ok')
    expect(runs.find((r) => r.subtaskId === 't-s1')?.outcome).toBe('failed')
  })
})
