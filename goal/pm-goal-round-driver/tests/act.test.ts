/**
 * 决策 → 动作：五态映射到正确端口；违反不变量当场响（不做副作用）。
 */
import { describe, it, expect } from 'vitest'
import { actOnDecision } from 'pm-goal-round-driver/act.js'
import type { ActPorts } from 'pm-goal-round-driver/act.js'
import type { DecideInput } from 'pm-goal-round-driver/types.js'

const input: DecideInput = {
  now: 1, requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true },
  goal: { windowKey: 'W-1', phase: 'active' },
}

function ports(): ActPorts & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { drive: [], create: [], dialog: [], trace: [] }
  return {
    calls,
    drive: (id) => { calls.drive.push(id) },
    createTaskGoal: (r, t, o) => { calls.create.push([r, t, o]); return true },
    askStageDone: (r) => { calls.dialog.push(r) },
    trace: (reason, id) => { calls.trace.push([reason, id]) },
  }
}

describe('actOnDecision', () => {
  it('drive → 起轮端口（不碰目标）', async () => {
    const p = ports()
    expect(await actOnDecision(p, input, { kind: 'drive', requirementId: 'REQ-x' })).toEqual({ acted: 'drive' })
    expect(p.calls.drive).toEqual(['REQ-x'])
    expect(p.calls.create).toEqual([])
  })

  it('create-goal → 建目标端口，透传 acceptance 作为 objective', async () => {
    const p = ports()
    const r = await actOnDecision(
      p,
      { ...input, goal: { windowKey: 'W-1', stageReadyToClose: false, hasReadyTask: true, nextTaskId: 't-1' } },
      { kind: 'create-goal', requirementId: 'REQ-x', taskId: 't-1', objective: '登录页可用' },
    )
    expect(r).toEqual({ acted: 'create-goal', changed: true })
    expect(p.calls.create).toEqual([['REQ-x', 't-1', '登录页可用']])
  })

  it('ask-stage-done → 弹框端口（不起轮）', async () => {
    const p = ports()
    await actOnDecision(p, input, { kind: 'ask-stage-done', requirementId: 'REQ-x' })
    expect(p.calls.dialog).toEqual(['REQ-x'])
    expect(p.calls.drive).toEqual([])
  })

  it('wait-human / hold → 只留痕（不写健康位、不改人的意图）', async () => {
    const p = ports()
    await actOnDecision(p, input, { kind: 'wait-human', requirementId: 'REQ-x', reason: 'human-gate' })
    await actOnDecision(p, input, { kind: 'hold', reason: 'latch', requirementId: 'REQ-x' })
    expect(p.calls.trace).toEqual([['wait-human:human-gate', 'REQ-x'], ['hold:latch', 'REQ-x']])
    expect(p.calls.drive).toEqual([])
  })

  it('违反不变量 → 抛错且端口零调用（副作用不做出去）', async () => {
    const p = ports()
    await expect(actOnDecision(
      p, { ...input, goal: { windowKey: 'W-1', phase: 'paused' } },
      { kind: 'drive', requirementId: 'REQ-x' },
    )).rejects.toThrow(/INV-D1/)
    expect(p.calls.drive).toEqual([])
  })
})
