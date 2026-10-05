// serves: FR-1, FR-2
/**
 * AgentDeliverer 测试（原 REQ-e3b6a0 t4 / FR-5；REQ-261001201200-8f8b FR-1 迁移到新 API）。
 *
 * 迁移说明：旧的 `deliver()` 方法已在「全面 Dive 化」中从类里删除，而本文件仍按旧 API 与
 * 旧的两参 options 构造调用 → 9/9 全红（报错全为 `this.idFactory is not a function`）。
 * 本次迁到 `createRoundMessage` / `deliverMessage` 三参构造，并把「构造契约」单列一组：
 * idFactory 不是函数 → 构造期立即抛 TypeError（装配错误必须响亮，投递错误才允许静默降级）。
 *
 * @module dsh-pmboard/tests/agent-deliverer
 */
import { describe, it, expect } from 'vitest'
import { AgentDeliverer } from '../src/adapters/AgentDeliverer.js'

const ID = 'msg-fixed-1'
const PLUGIN = 'dsh-pmboard'
const idFactory = (): string => ID

/** 造一个只带 get 的假 registry（与 ctx.agents 的形状一致：只有 get/list/roots…，没有 followup）。 */
function registryOf(agent: unknown): () => unknown {
  return () => ({ get: () => agent })
}

const build = (d: AgentDeliverer) =>
  d.createRoundMessage({ requirementId: 'REQ-t', revision: 7, round: 2, text: '节点已推进，请继续' })

describe('AgentDeliverer：构造契约（REQ-261001201200-8f8b FR-1）', () => {
  it('idFactory 传对象（修前的错误形状）→ 构造期抛 TypeError', () => {
    expect(() => new AgentDeliverer(registryOf({}), { plugin: PLUGIN } as never, PLUGIN))
      .toThrowError(/idFactory 必须是函数/)
  })

  it('idFactory 缺省（undefined）→ 同样被拒', () => {
    expect(() => new AgentDeliverer(registryOf({}), undefined as never, PLUGIN))
      .toThrowError(/idFactory 必须是函数/)
  })

  it('合法三参 → 构造成功且可产出消息', () => {
    const d = new AgentDeliverer(registryOf({}), idFactory, PLUGIN)
    expect(build(d).messageId).toBe(ID)
  })
})

describe('AgentDeliverer：回合消息形状（createRoundMessage，纯构造不投递）', () => {
  it('带 source:{kind:dive,plugin,requirementId,revision,round}，且 messageId === message.id', () => {
    const d = new AgentDeliverer(registryOf({}), idFactory, PLUGIN)
    const built = build(d)
    expect(built.messageId).toBe(ID)
    expect(built.message).toMatchObject({
      id: ID,
      role: 'user',
      content: [{ type: 'text', text: '节点已推进，请继续' }],
      source: { kind: 'dive', plugin: PLUGIN, requirementId: 'REQ-t', revision: 7, round: 2 },
    })
  })
})

describe('AgentDeliverer：投递三态（deliverMessage，永不抛）', () => {
  it('在线 → delivered=true，followup 收到同一条消息', () => {
    const sent: unknown[] = []
    const agent = { followup(m: unknown) { sent.push(m) } }
    const d = new AgentDeliverer(registryOf(agent), idFactory, PLUGIN)
    const built = build(d)
    expect(d.deliverMessage('w-abc', built.message).delivered).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toBe(built.message)
  })

  it('离线（get 返回 undefined）→ delivered=false，reason 指明不在线，不抛', () => {
    const d = new AgentDeliverer(registryOf(undefined), idFactory, PLUGIN)
    const r = d.deliverMessage('w-gone', build(d).message)
    expect(r.delivered).toBe(false)
    expect(r.reason).toContain('不在线')
  })

  it('agent 无 followup → delivered=false，不抛', () => {
    const d = new AgentDeliverer(registryOf({ id: 'w' }), idFactory, PLUGIN)
    const r = d.deliverMessage('w-nofu', build(d).message)
    expect(r.delivered).toBe(false)
    expect(r.reason).toContain('followup')
  })

  it('followup 抛错 → delivered=false，不抛', () => {
    const agent = { followup() { throw new Error('boom') } }
    const d = new AgentDeliverer(registryOf(agent), idFactory, PLUGIN)
    const r = d.deliverMessage('w-boom', build(d).message)
    expect(r.delivered).toBe(false)
    expect(r.reason).toContain('boom')
  })

  it('agents 服务不可得 → delivered=false，不抛', () => {
    const d = new AgentDeliverer(() => undefined, idFactory, PLUGIN)
    expect(d.deliverMessage('w', build(d).message).delivered).toBe(false)
    const broken = new AgentDeliverer(() => ({}), idFactory, PLUGIN)
    expect(broken.deliverMessage('w', build(broken).message).delivered).toBe(false)
  })

  it('agents.get 自身抛错 → delivered=false，不抛', () => {
    const d = new AgentDeliverer(() => ({ get() { throw new Error('registry down') } }), idFactory, PLUGIN)
    const r = d.deliverMessage('w', build(d).message)
    expect(r.delivered).toBe(false)
    expect(r.reason).toContain('registry down')
  })
})
