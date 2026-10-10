/**
 * goal 驱动拍的决策树（对齐 sequenceDiagram「驱动拍内部」）。
 * 六道闸各来一正一反；goal/stage 的四个分支逐个钉死。
 */
import { describe, it, expect } from 'vitest'
import { decideGoalRound } from 'pm-goal-round-driver/decide.js'
import { checkDecisionInvariants } from 'pm-goal-round-driver/invariant.js'
import type { DecideInput } from 'pm-goal-round-driver/types.js'

const base: DecideInput = {
  now: 1_000,
  requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true },
  goal: { windowKey: 'W-1', phase: 'active' },
}

describe('① 立项绑定', () => {
  it('无需求 → hold(no-requirement)', () => {
    expect(decideGoalRound({ now: 1 }).kind).toBe('hold')
  })
  it('不是本窗口的需求 → hold(not-owner-window)', () => {
    const d = decideGoalRound({ ...base, goal: { windowKey: 'W-2', phase: 'active' } })
    expect(d).toMatchObject({ kind: 'hold', reason: 'not-owner-window' })
  })
  it('两侧任一缺身份 → 放行（老装配口径）', () => {
    expect(decideGoalRound({ ...base, requirement: { id: 'REQ-x', drivable: true } }).kind).toBe('drive')
  })
})

describe('②③④⑤⑦ 闸：逐条拦住', () => {
  it.each([
    ['not-drivable', { requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: false } }],
    ['advance-paused:x', { requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true, advancePausedReason: 'x' } }],
    ['latch', { gates: { latchOpen: true } }],
    ['backoff', { gates: { backoffUntil: 2_000 } }],
    ['provider-latch', { gates: { providerLatchOpen: true } }],
    ['chain-budget:nope', { gates: { chainBudgetAllowed: false, chainBudgetReason: 'nope' } }],
  ] as Array<[string, Partial<DecideInput>]>)('%s', (reason, over) => {
    const d = decideGoalRound({ ...base, ...over })
    expect(d.kind).toBe('hold')
    expect((d as { reason: string }).reason).toBe(reason)
  })

  it('退避已过期 → 放行', () => {
    expect(decideGoalRound({ ...base, gates: { backoffUntil: 999 } }).kind).toBe('drive')
  })
})

describe('⑥ 人工门 / 弹框在途 → wait-human（等人不是故障）', () => {
  it('人工门开着 → wait-human，带原因', () => {
    const d = decideGoalRound({ ...base, gates: { humanGateOpen: true, humanGateReason: 'accept-sheet' } })
    expect(d).toMatchObject({ kind: 'wait-human', reason: 'accept-sheet' })
  })
  it('弹框在途 → wait-human(dialog-in-flight)', () => {
    expect(decideGoalRound({ ...base, gates: { dialogInFlight: true } }))
      .toMatchObject({ kind: 'wait-human', reason: 'dialog-in-flight' })
  })
})

describe('⑧ goal 相位 × stage：四个分支', () => {
  it('active → drive', () => {
    expect(decideGoalRound(base).kind).toBe('drive')
  })

  it('无 goal 且 stage 未达成且有 ready 卡 → create-goal（objective 取 acceptance）', () => {
    const d = decideGoalRound({
      ...base,
      goal: { windowKey: 'W-1', stageReadyToClose: false, hasReadyTask: true, nextTaskId: 't-1', nextTaskAcceptance: '登录页可用' },
    })
    expect(d).toMatchObject({ kind: 'create-goal', taskId: 't-1', objective: '登录页可用' })
  })

  it('complete 与 undefined 同路：仍按 stage 判（建下个 goal）', () => {
    const d = decideGoalRound({
      ...base,
      goal: { windowKey: 'W-1', phase: 'complete', stageReadyToClose: false, hasReadyTask: true, nextTaskId: 't-2' },
    })
    expect(d).toMatchObject({ kind: 'create-goal', taskId: 't-2' })
  })

  it('stage 已全达成 → ask-stage-done（不起轮、不再建 goal）', () => {
    const d = decideGoalRound({
      ...base,
      goal: { windowKey: 'W-1', phase: 'complete', stageReadyToClose: true, hasReadyTask: true, nextTaskId: 't-3' },
    })
    expect(d.kind).toBe('ask-stage-done')
  })

  it('stage 未达成但没有 ready 卡 → hold(no-ready-task)（不空转）', () => {
    const d = decideGoalRound({ ...base, goal: { windowKey: 'W-1', stageReadyToClose: false, hasReadyTask: false } })
    expect(d).toMatchObject({ kind: 'hold', reason: 'no-ready-task' })
  })

  it('paused / blocked → wait-human（人不发话就不跑）', () => {
    for (const phase of ['paused', 'blocked'] as const) {
      expect(decideGoalRound({ ...base, goal: { windowKey: 'W-1', phase } }))
        .toMatchObject({ kind: 'wait-human', reason: 'goal-' + phase })
    }
  })
})

describe('决策不变量（INV-D1~D4）', () => {
  it('穷举决策 × 输入：真实决策零违反', () => {
    const cases: DecideInput[] = [
      base,
      { ...base, goal: { windowKey: 'W-1', phase: 'complete', stageReadyToClose: true } },
      { ...base, goal: { windowKey: 'W-1', stageReadyToClose: false, hasReadyTask: true, nextTaskId: 't-1' } },
      { ...base, gates: { latchOpen: true } },
      { ...base, goal: { windowKey: 'W-1', phase: 'paused' } },
    ]
    for (const input of cases) {
      expect(checkDecisionInvariants(input, decideGoalRound(input))).toEqual([])
    }
  })

  it('构造违反：非 active 却 drive / 阶段已达成仍建 goal / 停手无原因', () => {
    expect(checkDecisionInvariants({ ...base, goal: { windowKey: 'W-1', phase: 'paused' } }, { kind: 'drive', requirementId: 'REQ-x' })
      .map((v) => v.inv)).toEqual(['INV-D1'])
    expect(checkDecisionInvariants(
      { ...base, goal: { windowKey: 'W-1', stageReadyToClose: true } },
      { kind: 'create-goal', requirementId: 'REQ-x', taskId: 't-1', objective: 'x' },
    ).map((v) => v.inv)).toEqual(['INV-D2'])
    expect(checkDecisionInvariants(base, { kind: 'hold', reason: '  ' }).map((v) => v.inv)).toEqual(['INV-D3'])
    expect(checkDecisionInvariants(base, { kind: 'create-goal', requirementId: 'REQ-x', taskId: ' ', objective: 'x' })
      .map((v) => v.inv)).toEqual(['INV-D4'])
  })
})
