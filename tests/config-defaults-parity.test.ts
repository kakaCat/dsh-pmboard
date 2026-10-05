/**
 * 兼容与迁移验证（REQ-261004110201-f253 t7）——**未配置即现状** 的集中等价面。
 *
 * 为什么单独一份：四条等价断言散在四个功能用例里，看的人得拼；本文件把「不配置时
 * 行为逐字等于改造前」集中成一处可复核清单，并在标题里写明每条防的是什么退化。
 *
 * 四条等价面：
 *  ① 脚本生成：未传 route → 与不传该字段逐字节相同，且不含 provider/model；
 *  ② 执行收尾：不传 outputCount → execution 上两个新键都不存在；
 *  ③ 调度：无 priority + 上限 0 → 候选顺序与投递结果与改造前一致（按 createdAt）；
 *  ④ 回执：无可读遥测 → 键不存在（不是空数组、不是 null）；
 * 另加一条迁移诚实性：**旧记录（无产出计数）不计入零产出统计**（未知 ≠ 0）。
 */
import { describe, it, expect } from 'vitest'
import { generateSubtaskScript } from '../src/application/internal/workflow-script.js'
import { closeExecutions, openExecution } from '../src/application/internal/token-usage.js'
import { scanAndResume } from '../src/application/use-cases/AdvanceChain.js'
import { queryState } from '../src/application/query/QueryState.js'
import { stageTelemetryOf, zeroOutputStreak } from '../src/domain/workflow/StageTelemetry.js'
import {
  stageRoutingSetting,
  maxInFlightRequirementsSetting,
  zeroOutputAlertThresholdSetting,
} from '../src/plugin-config.js'
import type { JobStartSpec, JobsPort } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const BASE = { stageKind: 'dev', stageLabel: '研发', prompt: '做点事' }

describe('等价面 ① 脚本：未配置路由 → 生成结果逐字节不变', () => {
  it('route 缺省 vs 不传该字段：同串；且不含 provider/model 字样', () => {
    const withoutKey = generateSubtaskScript({ ...BASE })
    const withUndefined = generateSubtaskScript({ ...BASE, route: undefined })
    expect(withUndefined).toBe(withoutKey)
    expect(withoutKey).not.toContain('provider')
    expect(withoutKey).not.toContain('model: ')
  })

  it('三个配置 accessor 的缺省值 = 文档承诺（{} / 0 / 2）', () => {
    expect(stageRoutingSetting(undefined)).toEqual({})
    expect(maxInFlightRequirementsSetting(undefined)).toBe(0)
    expect(zeroOutputAlertThresholdSetting(undefined)).toBe(2)
  })
})

describe('等价面 ② 执行收尾：不传产出数 → 两个新键都不存在', () => {
  it('closeExecutions 缺省调用与改造前同形（无 outputCount/zeroOutput）', () => {
    const t = task({ id: 't-1', requirementId: 'REQ-000001', status: 'in_progress', title: '卡' })
    openExecution(t, { id: 'e-1', trigger: 'auto', at: 100 })
    closeExecutions(t, { at: 200, outcome: 'succeeded' })
    expect(Object.prototype.hasOwnProperty.call(t.executions[0]!, 'outputCount')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(t.executions[0]!, 'zeroOutput')).toBe(false)
  })
})

describe('等价面 ③ 调度：无 priority + 上限 0 → 顺序与投递结果不变', () => {
  it('按 createdAt 升序投递，全部投出（不出现 wip_limit）', async () => {
    const h = makeHarness()
    const seed = (id: string, createdAt: number) => h.seedRequirementSync(req({
      id, status: 'implementing', category: 'feature', autoRun: true, createdAt,
    } as Partial<RequirementRecord>))
    seed('REQ-000041', 300)
    seed('REQ-000042', 100)
    seed('REQ-000043', 200)
    await h.seedSettled()
    const seen: JobStartSpec[] = []
    h.deps.jobs = { available: () => true, get: async () => null, start: async (s: JobStartSpec) => { seen.push(s); return 'j' + seen.length } } as JobsPort

    const out = await scanAndResume(h.deps)
    expect(out.map((o) => o.requirementId)).toEqual(['REQ-000042', 'REQ-000043', 'REQ-000041'])
    expect(out.every((o) => o.dispatched === true)).toBe(true)
    expect(out.some((o) => o.stopped === 'wip_limit')).toBe(false)
  })
})

describe('等价面 ④ 回执：无可读遥测 → 键不存在', () => {
  it('无子卡执行 → status 回执无 stage_telemetry 键', async () => {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: 'REQ-000051', status: 'implementing', category: 'feature', sourceSessionId: 'session-w' }))
    h.seedTasks('REQ-000051', [task({ id: 't-p', requirementId: 'REQ-000051', status: 'in_progress', title: '父卡' })])
    await h.seedSettled()
    const out = await queryState(h.deps, {}, { agent: { id: 'session-w' } }) as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(out, 'stage_telemetry')).toBe(false)
  })
})

describe('迁移诚实性 ⑤ 旧记录（无产出计数）不计入零产出统计', () => {
  it('老执行只贡献 runs/时长，不计 zeroOutputRuns；streak 在它那里断', () => {
    const legacy = { startedAt: 0, endedAt: 100, outcome: 'succeeded' }   // 改造前的记录：无 outputCount/zeroOutput
    const rows = stageTelemetryOf([{ parentId: 'p', stageKind: 'dev', executions: [legacy] }])
    expect(rows[0]!.runs).toBe(1)
    expect(rows[0]!.totalDurationMs).toBe(100)
    expect(rows[0]!.outputCount).toBe(0)
    expect(rows[0]!.zeroOutputRuns).toBe(0)   // 未知 ≠ 零产出
    expect(zeroOutputStreak([legacy])).toBe(0)
  })

  it('不回填：历史记录跑完遥测仍不产生零产出标记（数据起点如实）', async () => {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: 'REQ-000061', status: 'implementing', category: 'feature', sourceSessionId: 'session-w' }))
    h.seedTasks('REQ-000061', [
      task({ id: 't-p', requirementId: 'REQ-000061', status: 'in_progress', title: '父卡' }),
      task({ id: 't-s', requirementId: 'REQ-000061', status: 'done', title: '子卡', parentId: 't-p', stageKind: 'dev' as never } as never),
    ])
    await h.seedSettled()
    await h.taskStore.mutate('REQ-000061', (tasks) => {
      const t = tasks.find((x) => x.id === 't-s')!
      t.executions = [{ id: 'e-legacy', trigger: 'auto', startedAt: 0, endedAt: 50, outcome: 'succeeded' }] as never
      return tasks
    })
    const out = await queryState(h.deps, {}, { agent: { id: 'session-w' } }) as Record<string, unknown>
    const rows = out.stage_telemetry as Array<Record<string, number | string>>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.zeroOutputRuns).toBe(0)
  })
})
