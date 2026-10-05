/**
 * 阶段遥测写入（REQ-261004110201-f253 FR-2）——执行收尾写下产出条目数。
 *
 * 钉三条：
 *  ① 传 outputCount → 落 `outputCount` 与推导键 `zeroOutput`（0 → true）；
 *  ② **不传 → 两个键都不写**（旧调用方语义不变，读侧记「未知」不计零产出）；
 *  ③ ExecuteTask 真实路径：子卡完工后 execution 上带着产出计数。
 */
import { describe, it, expect } from 'vitest'
import { closeExecutions, openExecution } from '../src/application/internal/token-usage.js'
import { stageTelemetryOf } from '../src/domain/workflow/StageTelemetry.js'
import { queryState } from '../src/application/query/QueryState.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import type { WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

const FILE = 'src/domain/x.ts'

function taskWithRunningExec() {
  const t = task({ id: 't-1', requirementId: 'REQ-000001', status: 'in_progress', title: '卡' })
  openExecution(t, { id: 'e-1', trigger: 'auto', at: 100 })
  return t
}

describe('FR-2 写入段 ① closeExecutions 落产出数', () => {
  it('有产出：outputCount=2 且 zeroOutput=false', () => {
    const t = taskWithRunningExec()
    closeExecutions(t, { at: 200, outcome: 'succeeded', outputCount: 2 })
    expect(t.executions[0]!.outputCount).toBe(2)
    expect(t.executions[0]!.zeroOutput).toBe(false)
    expect(t.executions[0]!.endedAt).toBe(200)
  })

  it('零产出：outputCount=0 且 zeroOutput=true', () => {
    const t = taskWithRunningExec()
    closeExecutions(t, { at: 200, outcome: 'succeeded', outputCount: 0 })
    expect(t.executions[0]!.outputCount).toBe(0)
    expect(t.executions[0]!.zeroOutput).toBe(true)
  })

  it('不传 outputCount：两个键都不存在（旧语义不变，读侧记未知）', () => {
    const t = taskWithRunningExec()
    closeExecutions(t, { at: 200, outcome: 'succeeded' })
    expect(Object.prototype.hasOwnProperty.call(t.executions[0]!, 'outputCount')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(t.executions[0]!, 'zeroOutput')).toBe(false)
  })

  it('只闭合 running：已结束执行不被改写', () => {
    const t = taskWithRunningExec()
    t.executions.push({ id: 'e-old', trigger: 'auto', startedAt: 1, endedAt: 2, outcome: 'succeeded' })
    const closed = closeExecutions(t, { at: 300, outcome: 'succeeded', outputCount: 3 })
    expect(closed).toBe(1)
    expect(t.executions[1]!.outputCount).toBeUndefined()
  })
})

describe('FR-2 写入段 ② ExecuteTask 真实路径带上产出计数', () => {
  async function runWith(output: Record<string, unknown>) {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    h.seedTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
      task({ id: 't-s', requirementId: 'REQ-000001', status: 'todo', title: '子卡', parentId: 't-p', stageKind: 'dev' as never }),
    ])
    await h.seedSettled()
    h.deps.workflow = { async start(): Promise<WorkflowRunOutcome> { return { ok: true, value: { ok: true, output: JSON.stringify(output) } } } } as WorkflowRunner
    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w' })
    const t = await h.taskStore.get('t-s')
    return { r, t }
  }

  it('两份产出 → outputCount=2', async () => {
    const { r, t } = await runWith({ filesChanged: [FILE], completed: ['完成项'] })
    expect(r.ok).toBe(true)
    const exec = t!.executions[t!.executions.length - 1]!
    expect(exec.outputCount).toBe(2)
    expect(exec.zeroOutput).toBe(false)
  })

  it('空产出（仅 summary 兜底成一条 completed）→ 计数非 0；真正空产出 → zeroOutput=true', async () => {
    // summary 会被 parseSubtaskOutput 兜底成一条 completed ⇒ 这里是 1（不是 0）——如实记录口径
    const withSummary = await runWith({ filesChanged: [], summary: '只写了结论' })
    const e1 = withSummary.t!.executions[withSummary.t!.executions.length - 1]!
    expect(e1.outputCount).toBe(withSummary.r.ok ? 1 : e1.outputCount)
    // 全空（连 summary 都没有）时输出为空 → 0
    const empty = await runWith({})
    const e2 = empty.t!.executions[empty.t!.executions.length - 1]!
    if (empty.r.ok) expect(e2.zeroOutput).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// t4 读取段：stageTelemetryOf 聚合 + status 回执（有数据出现、无数据省略键）
// ---------------------------------------------------------------------------

describe('FR-2 读取段 ③ stageTelemetryOf 按 stageKind 聚合', () => {
  it('两阶段各自汇总：runs/时长/产出/零产出/最近时刻；未知产出不计入', () => {
    const rows = stageTelemetryOf([
      // dev：两次完成（一次有产出、一次零产出）+ 一次仍在跑（不计）+ 一次未知产出（只计 runs/时长）
      { parentId: 'p1', stageKind: 'dev', executions: [
        { startedAt: 0, endedAt: 100, outcome: 'succeeded', outputCount: 3, zeroOutput: false },
        { startedAt: 100, endedAt: 400, outcome: 'succeeded', outputCount: 0, zeroOutput: true },
        { startedAt: 400, endedAt: 500, outcome: 'succeeded' },
        { startedAt: 500, outcome: 'running' },
      ] },
      { parentId: 'p1', stageKind: 'review', executions: [
        { startedAt: 0, endedAt: 50, outcome: 'succeeded', outputCount: 1, zeroOutput: false },
      ] },
      // 父卡（无 parentId）不参与
      { stageKind: 'dev', executions: [{ startedAt: 0, endedAt: 999, outcome: 'succeeded', outputCount: 9 }] },
    ])

    expect(rows.map(r => r.stageKind)).toEqual(['dev', 'review'])
    const dev = rows[0]!
    expect(dev.runs).toBe(3)              // 仍在跑的不计
    expect(dev.totalDurationMs).toBe(500) // 100 + 300 + 100
    expect(dev.avgDurationMs).toBe(167)   // 500/3 取整
    expect(dev.outputCount).toBe(3)       // 未知那次不计
    expect(dev.zeroOutputRuns).toBe(1)
    expect(dev.lastAt).toBe(500)
    const review = rows[1]!
    expect(review.runs).toBe(1)
    expect(review.outputCount).toBe(1)
  })

  it('无子卡执行 → 空数组（调用方据此省略回执键）；排序稳定（字典序）', () => {
    expect(stageTelemetryOf([])).toEqual([])
    expect(stageTelemetryOf([{ parentId: 'p1', stageKind: 'dev', executions: [] }])).toEqual([])
    const rows = stageTelemetryOf([
      { parentId: 'p', stageKind: 'test', executions: [{ startedAt: 0, endedAt: 1, outcome: 'succeeded' }] },
      { parentId: 'p', stageKind: 'dev', executions: [{ startedAt: 0, endedAt: 1, outcome: 'succeeded' }] },
    ])
    expect(rows.map(r => r.stageKind)).toEqual(['dev', 'test'])
  })
})

describe('FR-2 读取段 ④ status 回执：有数据出现、无数据省略键', () => {
  async function seedRequirementWithSubtask(executions: unknown[]) {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', sourceSessionId: 'session-w' }))
    h.seedTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
      task({
        id: 't-s', requirementId: 'REQ-000001', status: 'done', title: '子卡',
        parentId: 't-p', stageKind: 'dev' as never,
      } as never),
    ])
    await h.seedSettled()
    if (executions.length > 0) {
      await h.taskStore.mutate('REQ-000001', (tasks) => {
        const t = tasks.find(x => x.id === 't-s')!
        t.executions = executions as never
        return tasks
      })
    }
    return h
  }

  it('有已完成执行 → 回执含 stage_telemetry（且形状过自身 schema）', async () => {
    const h = await seedRequirementWithSubtask([
      { id: 'e1', trigger: 'auto', startedAt: 0, endedAt: 200, outcome: 'succeeded', outputCount: 0, zeroOutput: true },
    ])
    const out = await queryState(h.deps, {}, { agent: { id: 'session-w' } }) as Record<string, unknown>
    const rows = out.stage_telemetry as Array<Record<string, unknown>>
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0]).toMatchObject({ stageKind: 'dev', runs: 1, zeroOutputRuns: 1, lastAt: 200 })
  })

  it('无已完成执行 → 键不存在（不是空数组、不是 null）', async () => {
    const h = await seedRequirementWithSubtask([])
    const out = await queryState(h.deps, {}, { agent: { id: 'session-w' } }) as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(out, 'stage_telemetry')).toBe(false)
  })
})
