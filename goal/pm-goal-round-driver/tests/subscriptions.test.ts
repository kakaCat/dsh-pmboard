/**
 * 事件接线：两路订阅按**作用域**分组（agent 主题事件必须挂 agent.ctx，否则被静默丢弃）；
 * 订阅不成立要**响亮**（不静默降级）。
 */
import { describe, it, expect, vi } from 'vitest'
import {
  wireGoalRootSubscriptions, wireGoalAgentSubscriptions,
  GOAL_ROOT_EVENTS, GOAL_AGENT_EVENTS, GOAL_ROUND_EVENTS,
} from 'pm-goal-round-driver/subscriptions.js'

function bus() {
  const listeners = new Map<string, Array<(...a: unknown[]) => unknown>>()
  const offs: string[] = []
  return {
    listeners, offs,
    on(event: string, l: (...a: unknown[]) => unknown) {
      const list = listeners.get(event) ?? []
      list.push(l)
      listeners.set(event, list)
      offs.push(event)
      return () => { offs.push('off:' + event) }
    },
    fire(event: string, payload: unknown) {
      for (const l of listeners.get(event) ?? []) l(payload)
    },
    fireWithNext(event: string, payload: unknown, next: unknown) {
      for (const l of listeners.get(event) ?? []) l(payload, next)
    },
    size: () => offs.length,
  }
}

const logger = { debug: () => {}, warn: vi.fn() }
const driver = {
  onIdle: vi.fn(), onInbox: vi.fn(), onInboxDiscarded: vi.fn(),
  onTurnEnd: vi.fn(), requestDrive: vi.fn(), teardown: vi.fn(), whenQuiet: vi.fn(),
} as never

describe('分组常量', () => {
  it('root 组 = 自发事件 + per-agent 入口；agent 组 = 四类 agent 事件 + session/event', () => {
    expect(GOAL_ROOT_EVENTS).toEqual(['reqboard/requirement-moved', 'agent/created'])
    expect(GOAL_AGENT_EVENTS).toContain('agent/status')
    expect(GOAL_AGENT_EVENTS).toContain('agent/inbox/inserted')
    expect(GOAL_AGENT_EVENTS).not.toContain('agent/created')
    expect(GOAL_ROUND_EVENTS.length).toBe(GOAL_ROOT_EVENTS.length + GOAL_AGENT_EVENTS.length)
  })
})

describe('root 组', () => {
  it('requirement-moved → 交回调（需求→窗口解析属组合根）', () => {
    const b = bus()
    const seen: string[] = []
    wireGoalRootSubscriptions(b, driver, logger, { onRequirementMoved: (id) => seen.push(id) })
    b.fire('reqboard/requirement-moved', { requirementId: 'REQ-x' })
    expect(seen).toEqual(['REQ-x'])
  })

  it('agent/created → 交回调（据此注册 per-agent 组）', () => {
    const b = bus()
    const agents: unknown[] = []
    wireGoalRootSubscriptions(b, driver, logger, { onAgentCreated: (a) => agents.push(a) })
    const agent = { id: 'A-1' }
    b.fire('agent/created', { agent })
    expect(agents).toEqual([agent])
  })

  it('空 requirementId 不发信号（不猜）', () => {
    const b = bus()
    const seen: string[] = []
    wireGoalRootSubscriptions(b, driver, logger, { onRequirementMoved: (id) => seen.push(id) })
    b.fire('reqboard/requirement-moved', {})
    expect(seen).toEqual([])
  })

  it('解绑函数注销全部 root 订阅', () => {
    const b = bus()
    const off = wireGoalRootSubscriptions(b, driver, logger)
    expect(b.offs.length).toBe(2)
    off()
    expect(b.offs.filter((x) => x.startsWith('off:')).length).toBe(2)
  })
})

describe('per-agent 组（必须挂 agent.ctx）', () => {
  it('inbox 插入/认领 → driver.onInbox；丢弃 → onInboxDiscarded', () => {
    const b = bus()
    wireGoalAgentSubscriptions(b, { id: 'A-1' }, driver, {}, logger)
    const msg = { id: 'm1' }
    b.fire('agent/inbox/inserted', { agent: { id: 'A-1' }, message: msg })
    b.fire('agent/inbox/claimed', { agent: { id: 'A-1' }, message: msg })
    b.fire('agent/inbox/discarded', { agent: { id: 'A-1' }, message: msg })
    expect((driver as never as { onInbox: ReturnType<typeof vi.fn> }).onInbox).toHaveBeenCalledTimes(2)
    expect((driver as never as { onInboxDiscarded: ReturnType<typeof vi.fn> }).onInboxDiscarded).toHaveBeenCalledWith('A-1')
  })

  it('agent/status 交回调（本驱动只在 idle 拍动，判定在调用方）', () => {
    const b = bus()
    const seen: Array<[unknown, unknown]> = []
    wireGoalAgentSubscriptions(b, { id: 'A-1' }, driver, { onStatus: (a, s) => seen.push([a, s]) }, logger)
    b.fire('agent/status', { agent: { id: 'A-1' }, status: 'idle' })
    expect(seen).toEqual([[{ id: 'A-1' }, 'idle']])
  })

  it('session/event 交回调（回合结束在其中）', () => {
    const b = bus()
    const seen: unknown[] = []
    wireGoalAgentSubscriptions(b, { id: 'A-1' }, driver, { onSessionEvent: (_s, e) => seen.push(e) }, logger)
    b.fire('session/event', { session: { id: 'A-1' }, event: { type: 'turn/end' } })
    expect(seen).toEqual([{ type: 'turn/end' }])
  })
})

describe('响亮：订阅未成立要告警（不静默降级）', () => {
  it('宿主没提供 ctx.on → 每条事件各留一条 warn', () => {
    const warn = vi.fn()
    wireGoalRootSubscriptions({}, driver, { debug: () => {}, warn })
    expect(warn).toHaveBeenCalled()
  })
})
