/**
 * 端口适配器（新驱动的五处适配）：**事实装配**与**环境栅栏**。
 * 判据来源逐条对账——适配器是"谁有事实谁提供"的那个"谁"，接错就是静默错判。
 */
import { describe, it, expect, vi } from 'vitest'
import { buildGoalRoundPorts, type GoalRoundAdapterDeps } from '../pm/src/adapters/goal-round-ports.js'

const REQ = 'REQ-x'
const WINDOW = 'W-1'

function facts(over: Partial<{ status: string; roundsInStage: number; activation: string; health: string; advancePaused: string; goals: unknown[] }> = {}) {
  return {
    id: REQ, title: '需求', description: '', status: over.status ?? 'implementing',
    updatedAt: 1, version: 7, artifacts: [], sourceSessionId: WINDOW,
    dive: {
      activation: over.activation ?? 'armed', phase: 'active',
      roundsInStage: over.roundsInStage ?? 2,
      ...(over.health === undefined ? {} : { driverHealth: { state: over.health } }),
    },
    ...(over.advancePaused === undefined ? {} : { advance: { pausedReason: over.advancePaused } }),
    ...(over.goals === undefined ? {} : { goals: over.goals }),
  }
}

function deps(over: Partial<GoalRoundAdapterDeps> = {}, opts: {
  req?: unknown; tasks?: Array<{ id: string; status: string; acceptance?: string; goal?: unknown }>
} = {}) {
  const req = opts.req ?? facts()
  const tasks = opts.tasks ?? [{ id: 't-1', status: 'running', acceptance: '登录页可用' }]
  const d: GoalRoundAdapterDeps = {
    peekFacts: () => [req] as never,
    getRequirement: async () => req as never,
    tasksOf: async () => tasks as never,
    delivery: {} as never,
    checkpoint: async () => {},
    persistAdmission: () => {},
    createTaskGoal: () => true,
    askStageDone: () => {},
    trace: () => {},
    fiberActive: () => true,
    agentLive: () => true,
    now: () => 1_000,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
    ...over,
  }
  return { ports: buildGoalRoundPorts(d), req, tasks }
}

describe('factsOf · 事实装配', () => {
  it('窗口无绑定需求 → undefined（不是我这个窗口的活）', async () => {
    const { ports } = deps()
    expect(await ports.factsOf('W-other')).toBeUndefined()
  })

  it('归属/可驱动/闭锁判据/回合计数/revision/状态 逐条来自台账', async () => {
    const { ports } = deps({}, { req: facts({ roundsInStage: 5, activation: 'disarmed', health: 'paused' }) })
    const f = await ports.factsOf(WINDOW)
    expect(f?.requirement).toMatchObject({ id: REQ, sourceSessionId: WINDOW, drivable: false })
    expect(f?.latch).toMatchObject({ requirementPresent: true, activation: 'disarmed', driverHealthState: 'paused' })
    expect(f?.roundsInStage).toBe(5)
    expect(f?.revision).toBe(7)
    expect(f?.status).toBe('implementing')
  })

  it('推进告警进事实（advance.pausedReason 存在 ⇒ 决策层不驱动）', async () => {
    const { ports } = deps({}, { req: facts({ advancePaused: 'stalled' }) })
    expect((await ports.factsOf(WINDOW))?.requirement?.advancePausedReason).toBe('stalled')
  })

  it('阶段文案：陈述/判据/进度来自整条记录（窄投影只有计数）', async () => {
    const { ports } = deps({}, {
      req: facts({
        goals: [
          { stage: 'design', statement: '设计定稿', doneCriteria: ['评审通过'], state: 'done' },
          { stage: 'implementing', statement: '实现全部卡', doneCriteria: ['测试全绿'], state: 'pending' },
        ],
      }),
    })
    const f = await ports.factsOf(WINDOW)
    expect(f?.stage).toMatchObject({ stageStatement: '实现全部卡', doneCriteria: ['测试全绿'], stageProgress: { total: 2, done: 1 } })
    expect(f?.goal?.stageReadyToClose).toBe(false)
  })

  it('阶段全达成 → stageReadyToClose=true（收口条件）', async () => {
    const { ports } = deps({}, {
      req: facts({ goals: [{ stage: 'design', statement: 'x', doneCriteria: [], state: 'done' }] }),
    })
    expect((await ports.factsOf(WINDOW))?.goal?.stageReadyToClose).toBe(true)
  })

  it('下一件事：running 优先；带出 acceptance 作为 objective 来源', async () => {
    const { ports } = deps({}, {
      tasks: [
        { id: 't-1', status: 'todo', acceptance: 'a1' },
        { id: 't-2', status: 'running', acceptance: 'a2' },
      ],
    })
    const f = await ports.factsOf(WINDOW)
    expect(f?.goal).toMatchObject({ hasReadyTask: true, nextTaskId: 't-2', nextTaskAcceptance: 'a2' })
  })

  it('全收口（无开卡）→ hasReadyTask=false（决策层据此 hold，不空转）', async () => {
    const { ports } = deps({}, { tasks: [{ id: 't-1', status: 'done' }] })
    expect((await ports.factsOf(WINDOW))?.goal?.hasReadyTask).toBe(false)
  })

  it('goal 相位来自任务队列的 goal 字段（pm-goal 的读）', async () => {
    const { ports } = deps({}, {
      tasks: [{ id: 't-1', status: 'running', acceptance: 'a', goal: { id: 'goal:t-1', taskId: 't-1', objective: 'a', phase: 'paused', revision: 1 } }],
    })
    expect((await ports.factsOf(WINDOW))?.goal?.phase).toBe('paused')
  })
})

describe('factsOf · 外部闸', () => {
  it('上游闩 / 弹框在途 → 进闸事实', async () => {
    const { ports } = deps({ providerLatchOpen: () => true, dialogInFlight: () => true })
    const f = await ports.factsOf(WINDOW)
    expect(f?.gates).toMatchObject({ providerLatchOpen: true, dialogInFlight: true })
  })

  it('人工门开着 → 进闸事实（带原因）；判据抛错 → 按门关（fail-open）+ 告警', async () => {
    const ok = await deps({ humanGate: () => ({ open: true, reason: 'accept-sheet' }) }).ports.factsOf(WINDOW)
    expect(ok?.gates).toMatchObject({ humanGateOpen: true, humanGateReason: 'accept-sheet' })

    const warn = vi.fn()
    const bad = await deps({
      humanGate: () => { throw new Error('boom') },
      logger: { info: () => {}, debug: () => {}, warn },
    }).ports.factsOf(WINDOW)
    expect(bad?.gates?.humanGateOpen).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('预算拒绝 → 进闸事实；抛错 → 按放行（fail-open）', async () => {
    const denied = await deps({ chainBudget: () => ({ allowed: false, reason: 'wip' }) }).ports.factsOf(WINDOW)
    expect(denied?.gates).toMatchObject({ chainBudgetAllowed: false, chainBudgetReason: 'wip' })
    const err = await deps({ chainBudget: () => { throw new Error('x') } }).ports.factsOf(WINDOW)
    expect(err?.gates?.chainBudgetAllowed).toBeUndefined()
  })
})

describe('validateReservation · 环境栅栏（fiber / agent 存活）', () => {
  const input = {
    agentId: WINDOW,
    content: 'r3',
    source: { kind: 'dive', requirementId: REQ, revision: 7, round: 3 },
    reservation: { round: 3, revision: 7, phase: 'claimed' },
  }

  it('环境健康 + 台账对得上 → 放行', () => {
    expect(deps().ports.validateReservation?.(input)).toEqual({ valid: true })
  })

  it('fiber 不 active → 拒（与旧栅栏同口径）', () => {
    expect(deps({ fiberActive: () => false }).ports.validateReservation?.(input))
      .toMatchObject({ valid: false, reason: 'env-or-ledger-fence' })
  })

  it('agent 不存活 → 拒', () => {
    expect(deps({ agentLive: () => false }).ports.validateReservation?.(input)).toMatchObject({ valid: false })
  })
})
