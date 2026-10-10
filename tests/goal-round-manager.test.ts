/**
 * goal 驱动生命周期装配（新驱动的生产路径；测**工厂**而非 cordis Service 壳）。
 *
 * 【守护什么】订阅持有形态与旧管理器同形但**事件集不同**：
 *   · root 2 路（requirement-moved / agent-created）挂在插件 ctx；
 *   · per-agent 5 路必须挂 **agent.ctx**（拿不到 ctx 要**响亮失败**，不静默降级）；
 *   · teardown 注销全部订阅并关准入。
 */
import { describe, it, expect } from 'vitest'
import { createGoalRoundLifecycle } from '../pm/src/adapters/goal-round-lifecycle.js'

function fakeCtx() {
  const listeners = new Map<string, Array<(...a: unknown[]) => unknown>>()
  const offs: string[] = []
  return {
    listeners, offs,
    logger: () => ({ info: () => {}, debug: () => {}, warn: () => {} }),
    fiber: { state: 2 },
    on(event: string, l: (...a: unknown[]) => unknown) {
      const list = listeners.get(event) ?? []
      list.push(l)
      listeners.set(event, list)
      return () => { offs.push('off:' + event) }
    },
  }
}

function makeDeps(over: Record<string, unknown> = {}) {
  const ports = {
    factsOf: () => undefined,
    delivery: {
      createRoundMessage: () => ({ message: {}, messageId: 'm1' }),
      deliverMessage: () => ({ delivered: true }),
      checkpoint: async () => {},
      persistAdmission: () => {},
      contentOf: () => undefined,
      now: () => 1,
    },
    createTaskGoal: () => true,
    askStageDone: () => {},
    trace: () => {},
    now: () => 1,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  const store = {
    get: async () => undefined,
    mutate: async () => ({ changed: false }),
    peekFacts: () => [],
  }
  return {
    ports,
    peekFacts: () => [],
    store: store as never,
    agents: { get: () => undefined },
    now: () => 1,
    ...over,
  }
}

describe('goal 驱动生命周期装配', () => {
  it('装配成功：root 两路订阅成立（不抛）', () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    // root 两路 + 心跳（心跳只在测试里手动 tick，不靠定时器）
    expect([...ctx.listeners.keys()].sort()).toEqual(['agent/created', 'reqboard/requirement-moved'])
    void m.teardown()
  })

  it('requirement-moved：需求→窗口解析（无绑定窗口时安静跳过，不抛）', () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    expect(() => ctx.listeners.get('reqboard/requirement-moved')?.[0]?.({ requirementId: 'REQ-x' })).not.toThrow()
    void m.teardown()
  })

  it('agent/created：拿不到 agent.ctx → **响亮失败**（failures 记录，不静默）', () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    ctx.listeners.get('agent/created')?.[0]?.({ agent: { id: 'A-1', session: { id: 'A-1' } } })
    const state = m.subscriptionState()
    expect(state.failures.length).toBeGreaterThan(0)
    expect(state.failures.join(' ')).toContain('没有可订阅的 ctx')
    void m.teardown()
  })

  it('agent/created（有 agent.ctx）→ per-agent 五路挂到 agent.ctx；处置后注销', () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    const agentCtx = fakeCtx()
    const agent = { id: 'A-1', session: { id: 'A-1' }, ctx: agentCtx }
    ctx.listeners.get('agent/created')?.[0]?.({ agent })
    expect([...agentCtx.listeners.keys()].sort())
      .toEqual(['agent/inbox/claimed', 'agent/inbox/discarded', 'agent/inbox/inserted', 'agent/status', 'session/event'])
    expect(m.subscriptionState().boundAgents).toEqual(['A-1'])
    // agent/disposed → 注销（幂等）
    agentCtx.listeners.get('agent/status')?.[0]?.({ agent, status: 'idle' })
    void m.teardown()
    expect(m.subscriptionState().boundAgents).toEqual([])
  })

  it('teardown：注销 root 订阅并停心跳（幂等，可重复调）', async () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    await m.teardown()
    await m.teardown()
    expect(ctx.offs.filter((x) => x.startsWith('off:')).length).toBe(2)
  })

  it('心跳在闸时整趟跳过（不叫醒、不刷 lastWakeAt）', async () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, {
      ...makeDeps({ providerLatchOpen: () => true }),
      logger: { info: () => {}, debug: () => {}, warn: () => {} },
    } as never)
    const tick = await m.wakeTick() as { skippedByLatch: boolean }
    expect(tick.skippedByLatch).toBe(true)
    void m.teardown()
  })

  it('roundDriver() 与旧管理器同形（组合根不改调用点）', () => {
    const ctx = fakeCtx()
    const m = createGoalRoundLifecycle(ctx as never, { ...makeDeps(), logger: { info: () => {}, debug: () => {}, warn: () => {} } } as never)
    const round = m.roundDriver()
    expect(typeof round.onRequirementMoved).toBe('function')
    expect(() => round.onRequirementMoved('REQ-x')).not.toThrow()
    void m.teardown()
  })
})
