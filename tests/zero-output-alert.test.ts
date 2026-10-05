/**
 * 零产出告警（REQ-261004110201-f253 FR-3）——连续白跑要被看见，但不许瞎报。
 *
 * 钉四件事：
 *  ① 判据纯函数：streak 只在末尾连续 zeroOutput 时累加，**未知（老记录）即断**；
 *  ② 去重可推导：floor(streak/threshold) 大于既有告警数才写 → 阈值 2 时连续 4 次只写 2 条；
 *  ③ 真实路径：子卡连跑零产出，需求台账出现一条结构化告警评论（含 stage/streak/threshold）；
 *  ④ 边界：非零产出后重置、阈值 0 不报、告警不阻断子卡 done。
 */
import { describe, it, expect } from 'vitest'
import { zeroOutputStreak, shouldAlertZeroOutput } from '../src/domain/workflow/StageTelemetry.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import type { WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

const FILE = 'src/domain/x.ts'

describe('FR-3 判据段 ① streak 与去重', () => {
  it('末尾连续零产出计数；非零产出即停；未知即断（未知≠零产出）', () => {
    const z = (endedAt: number, extra: Record<string, unknown> = {}) => ({ startedAt: 0, endedAt, outcome: 'succeeded', ...extra })

    // 最近两次都零产出 → 2
    expect(zeroOutputStreak([z(1, { outputCount: 2, zeroOutput: false }), z(2, { outputCount: 0, zeroOutput: true }), z(3, { outputCount: 0, zeroOutput: true })])).toBe(2)
    // 最近一次零产出、再往前有产出 → 1（最近这一次是真的零产出，不能被抹掉）
    expect(zeroOutputStreak([z(3, { outputCount: 0, zeroOutput: true }), z(2, { outputCount: 5, zeroOutput: false })])).toBe(1)
    // 最近一次零产出、再往前是老记录（未知）→ 仍是 1，但不再往前累加（不冤枉未知）
    expect(zeroOutputStreak([z(3, { outputCount: 0, zeroOutput: true }), z(2)])).toBe(1)
    // 最近一次就是未知（老记录）→ 0（未知≠零产出，不冤枉）
    expect(zeroOutputStreak([z(3), z(2, { outputCount: 0, zeroOutput: true })])).toBe(0)
    // 仍在跑的不计
    expect(zeroOutputStreak([{ startedAt: 0, outcome: 'running', zeroOutput: true }])).toBe(0)
  })

  it('去重：floor(streak/threshold) > 已告警数 才写', () => {
    expect(shouldAlertZeroOutput(1, 0, 2)).toBe(false)
    expect(shouldAlertZeroOutput(2, 0, 2)).toBe(true)
    expect(shouldAlertZeroOutput(3, 1, 2)).toBe(false)  // 3/2=1，不比已告警 1 多
    expect(shouldAlertZeroOutput(4, 1, 2)).toBe(true)   // 4/2=2 > 1
    expect(shouldAlertZeroOutput(4, 2, 2)).toBe(false)
    expect(shouldAlertZeroOutput(5, 0, 0)).toBe(false)  // 阈值非法不报
  })
})

describe('FR-3 真实路径 ② 连续零产出 → 台账留一条结构化告警', () => {
  /** 反复跑同一张零产出子卡（每次把它退回 todo 再跑），产出恒为空。 */
  async function runZeroOutputTimes(times: number, opts: { threshold?: number; output?: Record<string, unknown> } = {}) {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    await h.seedSettled()
    if (opts.threshold !== undefined) h.deps.zeroOutputAlertThreshold = opts.threshold
    const output = opts.output ?? {}
    h.deps.workflow = {
      async start(): Promise<WorkflowRunOutcome> {
        return { ok: true, value: { ok: true, output: JSON.stringify(output) } }
      },
    } as WorkflowRunner

    await h.setTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
      task({ id: 't-s', requirementId: 'REQ-000001', status: 'todo', title: '子卡', parentId: 't-p', stageKind: 'review' as never }),
    ])
    for (let i = 0; i < times; i += 1) {
      const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w' })
      expect(r.ok).toBe(true)
      // 同一张卡再跑一次：只把状态退回 todo，**保住执行历史**（streak 靠历史累加）
      await h.taskStore.mutate('REQ-000001', (tasks) => {
        const t = tasks.find((x) => x.id === 't-s')!
        t.status = 'todo' as never
        t.claimedAt = undefined as never
        return tasks
      })
    }
    return h
  }

  it('阈值 2：连续 4 次零产出 → 恰好 2 条告警（floor(4/2)），且含 stage/streak/threshold 三要素', async () => {
    const h = await runZeroOutputTimes(4, { threshold: 2 })
    const req0 = (await h.store.get('REQ-000001'))!
    const alerts = (req0.comments ?? []).filter((c) => String(c.body).includes('[零产出告警]'))
    expect(alerts).toHaveLength(2)
    for (const a of alerts) {
      expect(a.body).toContain('stage=review')
      expect(a.body).toContain('threshold=2')
      expect(a.body).toMatch(/streak=\d/)
      expect(a.createdBy?.kind).toBe('system')
    }
    expect(alerts.map((a) => String(a.body).match(/streak=(\d+)/)?.[1]).sort()).toEqual(['2', '4'])
  })

  it('阈值 2：连续 2 次零产出 → 恰好 1 条告警', async () => {
    const h = await runZeroOutputTimes(2, { threshold: 2 })
    const req0 = (await h.store.get('REQ-000001'))!
    expect((req0.comments ?? []).filter((c) => String(c.body).includes('[零产出告警]'))).toHaveLength(1)
  })

  it('有产出 → 不告警；阈值高于连续数 → 不告警', async () => {
    const withOutput = await runZeroOutputTimes(3, { threshold: 2, output: { filesChanged: [FILE], completed: ['完成'] } })
    expect(((await withOutput.store.get('REQ-000001'))!.comments ?? []).some((c) => String(c.body).includes('[零产出告警]'))).toBe(false)

    const highThreshold = await runZeroOutputTimes(2, { threshold: 5 })
    expect(((await highThreshold.store.get('REQ-000001'))!.comments ?? []).some((c) => String(c.body).includes('[零产出告警]'))).toBe(false)
  })
})
