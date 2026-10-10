/**
 * 事件入口（一台驱动的行为面）：idle 拍决策→动作、inbox 认领、回合结束准入+收尾、teardown。
 * 用假端口把"什么时候调什么"钉死（真实 I/O 由适配器接）。
 */
import { describe, it, expect, vi } from 'vitest'
import { createGoalRoundDriver, type AgentFacts, type GoalRoundPorts } from 'pm-goal-round-driver/driver.js'

interface HarnessOptions {
  facts?: AgentFacts
  /** 投递是否失败（用来走"投递失败 → 置闭锁"的真实路径）。 */
  failDelivery?: boolean
  /** 让当拍的 goal 相位按脚本变化（收尾判据用）。 */
  phases?: Array<'active' | 'complete' | 'blocked' | 'paused' | undefined>
}

function harness(over: HarnessOptions = {}) {
  const delivered: Array<{ window: string; message: unknown }> = []
  const texts: string[] = []
  let failDelivery = over.failDelivery ?? false
  const created: Array<[string, string, string]> = []
  const traces: Array<[string, string | undefined]> = []
  const dialogs: string[] = []
  const phases = [...(over.phases ?? [])]
  let calls = 0
  const base: AgentFacts = over.facts ?? {
    requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true },
    goal: { windowKey: 'W-1', phase: 'active' },
    latch: { requirementPresent: true, activation: 'armed', driverHealthState: 'healthy' },
    roundsInStage: 2,
    revision: 7,
    status: 'implementing',
    stage: { stageStatement: '实现全部卡', doneCriteria: ['测试全绿'], stageProgress: { done: 1, total: 7 } },
  }
  const ports: GoalRoundPorts = {
    factsOf: () => {
      calls += 1
      const f: AgentFacts = { ...base }
      // 相位按脚本覆盖（facts 是只读契约，改的是**副本**的 goal 键）
      if (phases.length > 0) {
        const nextPhase = phases.shift()
        ;(f as { goal?: AgentFacts['goal'] }).goal = { ...(base.goal ?? {}), ...(nextPhase === undefined ? {} : { phase: nextPhase }) }
      }
      return f
    },
    delivery: {
      createRoundMessage: (i) => ({
        // 提示词正文（驱动渲染的那一段）记录下来供断言
        ...(() => { texts.push(i.text); return {} })(),
        message: { content: 'r' + i.round, source: { kind: 'dive', requirementId: i.requirementId, revision: i.revision, round: i.round } },
        messageId: 'm' + i.round,
      }),
      deliverMessage: (w, m) => {
        if (failDelivery) return { delivered: false, reason: 'queue-failed' }
        delivered.push({ window: w, message: m })
        return { delivered: true }
      },
      checkpoint: async () => {},
      persistAdmission: () => {},
      contentOf: (m) => (m as { content?: unknown }).content,
      now: () => 1_000,
    },
    createTaskGoal: (r, t, o) => { created.push([r, t, o]); return true },
    askStageDone: (r) => { dialogs.push(r) },
    trace: (reason, id) => { traces.push([reason, id]) },
    now: () => 1_000,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  return {
    driver: createGoalRoundDriver(ports), delivered, texts, created, traces, dialogs,
    calls: () => calls, setFailDelivery: (v: boolean) => { failDelivery = v },
  }
}

describe('onIdle · 一拍决策→动作', () => {
  it('goal active → 渲染提示词并投递（含阶段目标与判据）', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')
    expect(h.delivered).toHaveLength(1)
    expect(h.texts).toHaveLength(1)
    const text = h.texts[0]
    expect(text).toContain('第 3 回合')          // roundsInStage 2 → 3
    expect(text).toContain('实现全部卡')          // 阶段目标进了提示词
    expect(text).toContain('1) 测试全绿')          // 达成判据逐条进提示词
  })

  it('无 goal 且有 ready 卡 → 建 goal（不投递）', async () => {
    const h = harness({
      facts: {
        requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true },
        goal: { windowKey: 'W-1', stageReadyToClose: false, hasReadyTask: true, nextTaskId: 't-9', nextTaskAcceptance: '登录页可用' },
        latch: { requirementPresent: true, activation: 'armed', driverHealthState: 'healthy' },
        roundsInStage: 0, revision: 1, status: 'implementing',
      },
    })
    await h.driver.onIdle('W-1')
    expect(h.created).toEqual([['REQ-x', 't-9', '登录页可用']])
    expect(h.delivered).toHaveLength(0)
  })

  it('投递失败 → 置闭锁并留痕；下一拍被闭锁拦住（停手不是故障，不写健康位）', async () => {
    const h = harness({ failDelivery: true })
    await h.driver.onIdle('W-1')
    expect(h.delivered).toHaveLength(0)
    expect(h.traces.some(([r]) => String(r).startsWith('deliver-failed'))).toBe(true)

    // 闭锁已置：即使投递恢复，也要等台账显式 healthy 才解锁（唯一解锁规则）
    h.setFailDelivery(false)
    await h.driver.onIdle('W-1')
    expect(h.delivered).toHaveLength(0)
    expect(h.traces.some(([r]) => r === 'hold:latch')).toBe(true)
  })

  it('阶段判据已满足 → 请人裁决（弹框、不起轮）', async () => {
    const h = harness({
      facts: {
        requirement: { id: 'REQ-x', sourceSessionId: 'W-1', drivable: true },
        goal: { windowKey: 'W-1', phase: 'complete', stageReadyToClose: true },
        latch: { requirementPresent: true, activation: 'armed', driverHealthState: 'healthy' },
        roundsInStage: 3, revision: 2, status: 'implementing',
      },
    })
    await h.driver.onIdle('W-1')
    expect(h.dialogs).toEqual(['REQ-x'])
    expect(h.delivered).toHaveLength(0)
  })

  it('没有绑定需求 → 什么都不做（不是我这个窗口的活）', async () => {
    const ports = {
      factsOf: () => undefined,
      delivery: {} as never, createTaskGoal: vi.fn(), askStageDone: vi.fn(),
      trace: vi.fn(), deferWrapup: vi.fn(), now: () => 1,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    } as unknown as GoalRoundPorts
    const d = createGoalRoundDriver(ports)
    await d.onIdle('W-x')
    expect(ports.trace).not.toHaveBeenCalled()
  })
})

describe('事件路 · 认领 / 准入 / 收尾', () => {
  it('inbox 插入本回合消息 → 认领；非本回合 → 让位', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')
    const message = h.delivered[0].message
    h.driver.onInbox('W-1', message)                       // 逐字相同 → 认领
    h.driver.onInbox('W-1', { content: '别的', source: { kind: 'user' } })  // 让位
    // 认领成功后才能准入计数（这里只验不抛）
    await h.driver.onTurnEnd('W-1', { completed: true })
  })


  it('回合失败累计 → 达阈值置闭锁并留痕（熔断）', async () => {
    const h = harness()
    for (let i = 0; i < 3; i += 1) await h.driver.onTurnEnd('W-1', { completed: false })
    expect(h.traces.some(([r]) => r === 'breaker-tripped')).toBe(true)
  })
})

describe('teardown', () => {
  it('teardown 后不再起轮', async () => {
    const h = harness()
    h.driver.teardown()
    await h.driver.onIdle('W-1')
    expect(h.delivered).toHaveLength(0)
  })
})

describe('三个补充入口：pre-step 栅栏 / agent 级错误 / 处置清理', () => {
  const diveMessage = (round = 3, content = 'r3') => ({
    content, source: { kind: 'dive', requirementId: 'REQ-x', revision: 7, round },
  })

  it('pre-step：非本回合消息 → 直接交下游（next 调一次）', async () => {
    const h = harness()
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))
    const decision = await h.driver.onPreStep('W-1', [{ content: 'user', source: { kind: 'user' } }], { aborted: false }, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(decision.kind).toBe('enter')
  })

  it('pre-step：不可自证的预留（无预留/未认领）→ 拒收 + 留痕 + 交回重投', async () => {
    const h = harness()
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))
    const decision = await h.driver.onPreStep('W-1', [diveMessage()], { aborted: false }, next)
    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()          // 拒收就**不进**下游
    expect(h.traces.some(([r]) => String(r).startsWith('pre-step-rejected'))).toBe(true)
  })

  it('pre-step：伪造内容（认领过但内容对不上）→ 拒收', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')                 // 造预留（queued）
    h.driver.onInbox('W-1', h.delivered[0]?.message ?? undefined)  // 认领
    const forged = { ...diveMessage(), content: '被改过' }
    const decision = await h.driver.onPreStep('W-1', [forged], { aborted: false }, async () => ({ kind: 'enter', messages: [] }))
    expect(decision).toEqual({ kind: 'reject' })
  })

  it('pre-step：正常 → 放行并标 startsRequestSeries', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')
    h.driver.onInbox('W-1', h.delivered[0].message)
    const decision = await h.driver.onPreStep('W-1', [h.delivered[0].message], { aborted: false },
      async () => ({ kind: 'enter', messages: [h.delivered[0].message] }))
    expect(decision).toMatchObject({ kind: 'enter', startsRequestSeries: true })
  })

  it('pre-step：下游拒收 → 作废预留 + 留痕（prompt-rejected）', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')
    h.driver.onInbox('W-1', h.delivered[0].message)
    const decision = await h.driver.onPreStep('W-1', [h.delivered[0].message], { aborted: false },
      async () => ({ kind: 'reject' }))
    expect(decision).toEqual({ kind: 'reject' })
    expect(h.traces.some(([r]) => r === 'prompt-rejected')).toBe(true)
  })

  it('agent 级错误：累计到阈值才熔断；已被 turn/end 置锁则**不覆盖更具体原因**', async () => {
    const h = harness()
    for (let i = 0; i < 3; i += 1) h.driver.onAgentError('W-1')
    expect(h.traces.some(([r]) => String(r).startsWith('breaker-tripped:agent-error-loop'))).toBe(true)
  })

  it('onAgentDisposed：清该 agent 内存态（订阅注销由持有者负责）', async () => {
    const h = harness()
    await h.driver.onIdle('W-1')                 // 造出预留
    h.driver.onAgentDisposed('W-1')
    // 状态已清：再拍一次仍会重新投递（说明没残留在飞预留挡住）
    h.delivered.length = 0
    await h.driver.onIdle('W-1')
    expect(h.delivered).toHaveLength(1)
  })
})
