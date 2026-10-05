// serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
/**
 * T-6 对齐验收（REQ-260926215013-1568）：11 个 FR 的可证伪断言（TC-01…TC-11）。
 * 用 fake 端口驱动真实的 round 状态机 + 七路订阅接线；每条断言对应一个 FR。
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { describe, it, expect, vi } from 'vitest'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { wireDiveRoundSubscriptions } from '../src/application/dive/round-subscriptions.js'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: 'agent-1', dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

function harness(opts: { req?: RequirementRecord; failCreate?: boolean } = {}) {
  const ledger = { ...emptyLedger(), requirements: [opts.req ?? makeReq()], tasks: [], triages: [] } as never as {
    schemaVersion: number; revision: number; requirements: RequirementRecord[]; tasks: unknown[]; triages: unknown[]
  }
  const repo = {
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_r: string, fn: (l: unknown) => unknown) => {
      const before = JSON.stringify(ledger)
      const changed = fn(ledger) ?? {}
      if (JSON.stringify(ledger) !== before) ledger.revision += 1
      return { changed: changed as never, revision: ledger.revision }
    },
    replaceAll: async (_r: string, next: never) => { Object.assign(ledger, next) },
  }
  const inbox = { nextTurn: [] as unknown[], nextStep: [] as unknown[], prepend(t: string, m: unknown) { (t === 'next-step' ? this.nextStep : this.nextTurn).unshift(m) } }
  const agent: Record<string, unknown> = { id: 'agent-1', status: 'idle', session: { id: 'agent-1' }, inbox }
  const delivered: unknown[] = []
  const warns: string[] = []; const infos: string[] = []; const debugs: string[] = []
  const cancelled: unknown[] = []
  let n = 0
  let checkpointImpl: () => Promise<void> = async () => {}
  const ports: DiveRoundPorts = {
    store: legacyStoreProjection(repo as never),
    // B12 阶段②a：本模块的写改走新端口（与 peekFacts 同源）

    // B12 阶段①-a：idle 拍的同步判定改用窄投影
    peekFacts: () => ledger.requirements.map(factsOf),
    agents: { get: (id) => (id === 'agent-1' ? agent : undefined), withoutInitiator: (op) => op() },
    fiberActive: () => true,
    delivery: {

      createRoundMessage: (input) => {
        if (opts.failCreate === true) throw new Error('boom')
        n += 1
        const message = { id: 'm' + n, role: 'user', content: [{ type: 'text', text: input.text }], source: { kind: 'dive', requirementId: input.requirementId, revision: input.revision, round: input.round } }
        return { message, messageId: 'm' + n }
      },
      deliverMessage: (_w, m) => { delivered.push(m); inbox.nextTurn.push(m); agent.status = 'running'; return { delivered: true } },
    },
    cancel: (a) => { cancelled.push(a) },
    whenIdle: async () => {},
    checkpoint: () => checkpointImpl(),
    renderRoundText: (i) => 'round ' + i.round,
    now: () => 1000,
    logger: { info: (m) => infos.push(m), debug: (m) => debugs.push(m), warn: (m) => warns.push(m) },
  }
  const driver = createDiveRoundDriver(ports)
  const listeners = new Map<string, (...a: unknown[]) => unknown>()
  const bus = { on: (e: string, l: (...a: unknown[]) => unknown) => { listeners.set(e, l); return () => { listeners.delete(e) } } }
  wireDiveRoundSubscriptions(bus, driver, { debug: (m) => debugs.push(m), warn: (m) => warns.push(m) })
  const idle = async (): Promise<void> => { agent.status = 'idle'; driver.onIdle(agent, () => {}); await driver.whenQuiet() }
  // B12 阶段⑤族 B：手工 harness 补新端口投影（fake 必须是 **repo 形态**，见 §71.1）
  const store = legacyStoreProjection({
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_r: string, fn: (l: unknown) => unknown) => { const changed = (fn(ledger) ?? {}) as never; return { changed, revision: ledger.revision } },
    replaceAll: async () => {},
  } as never)
  return { driver, ledger, store, agent, inbox, delivered, warns, infos, debugs, cancelled, listeners, idle, setCheckpoint: (fn: () => Promise<void>) => { checkpointImpl = fn } }
}

describe('T-6 对齐验收（11 FR）', () => {
  it('TC-01 FR-1：需求 revision 变 → pre-step reject 且同批其它已认领消息被放回', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    const round = h.delivered[0]
    h.driver.onInboxClaimed(h.agent, round)
    await h.store.mutate('REQ-t', (r: { version: number }) => { r.version += 1; return { changed: true } })
    const other = { id: 'other-1', content: [{ type: 'text', text: '人类的活' }], source: { kind: 'user' } }
    const d = await h.driver.onPreStep(h.agent, [round, other], { aborted: false }, async () => ({ kind: 'enter', messages: [round, other] }))
    expect(d).toEqual({ kind: 'reject' })
    expect(h.inbox.nextStep.map((m) => (m as { id: string }).id)).toContain('other-1')
  })

  it('TC-02 FR-2：插入人类消息 → 竞争让位（不再追加起轮并发留痕）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    const human = { id: 'human-1', content: [{ type: 'text', text: '等一下' }], source: { kind: 'user' } }
    h.inbox.nextTurn.push(human)
    h.driver.onInboxInserted(h.agent, human) // agent 仍 running（有人类消息在跑）
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    expect(h.debugs.join(' ')).toContain('竞争输入')
  })

  it('TC-03 FR-3：检查点挂起不排队；检查点失败 → 解除武装', async () => {
    const pending = harness()
    pending.setCheckpoint(() => new Promise<void>(() => {}))
    pending.driver.requestDrive(pending.agent)
    await new Promise(r => setTimeout(r, 5))
    expect(pending.delivered.length).toBe(0)
    const failed = harness()
    failed.setCheckpoint(async () => { throw new Error('flush down') })
    failed.driver.onRequirementMoved('REQ-t'); await failed.driver.whenQuiet()
    expect(failed.delivered.length).toBe(0)
    // FR-5：运行时故障只写健康位，人的意图（activation）保持不变
    expect(failed.ledger.requirements[0]!.dive!.driverHealth!.state).toBe('paused')
    expect(failed.ledger.requirements[0]!.dive!.driverHealth!.reason).toBe('checkpoint-failed')
    expect(failed.ledger.requirements[0]!.dive!.activation).toBe('armed')
  })

  it('TC-04 FR-4：连发 3 次触发只起 1 轮；驱动体抛错无未处理 rejection', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); h.driver.requestDrive(h.agent); h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    const spy = vi.fn()
    process.on('unhandledRejection', spy)
    const boom = harness({ failCreate: true })
    boom.driver.requestDrive(boom.agent); await boom.driver.whenQuiet()
    await new Promise(r => setTimeout(r, 10))
    process.off('unhandledRejection', spy)
    expect(spy).toHaveBeenCalledTimes(0)
    expect(boom.warns.join(' ')).toContain('驱动体异常')
  })

  it('TC-05 FR-5：teardown 关准入（在飞回合被取消、此后触发不投递）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    await h.driver.teardown()
    expect(h.cancelled.length).toBe(1)
    h.agent.status = 'idle'
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    expect(h.infos.join(' ')).toContain('teardown')
  })

  it('TC-06 FR-6：agent 忙时推进需求不起轮；置空闲后才起 1 轮', async () => {
    const h = harness()
    h.agent.status = 'running'
    h.listeners.get('reqboard/requirement-moved')!({ requirementId: 'REQ-t' })
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    await h.idle()
    expect(h.delivered.length).toBe(1)
  })

  it('TC-07 FR-7：discard 不计数；user/message 恰好 +1（重复不重计）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    const round = h.delivered[0] as { id: string }
    h.driver.onInboxDiscarded(h.agent, round); await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: round.id } }); await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: round.id } }); await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
  })

  it('TC-08 FR-8：回合耗尽 → 终态 paused/round-limit，且不再起轮', async () => {
    const h = harness({ req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1000 } as never }) })
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    // FR-2：达上限 = 停下等人（健康位），不再是终态
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('paused')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.reason).toBe('round-limit:implementing')
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
    expect(h.warns.join(' ')).toContain('回合上限')
  })

  it('TC-09 FR-9：max-tokens → 停手；aborted 已认领 → 停手位落在 driverHealth；agent 级错误 → 退避（3 次才熔断）', async () => {
    const mt = harness()
    mt.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: { reason: { kind: 'max-tokens' } } }); await mt.driver.whenQuiet()
    expect(mt.ledger.requirements[0]!.dive!.driverHealth!.state).toBe('paused')
    expect(mt.ledger.requirements[0]!.dive!.driverHealth!.reason).toBe('max-tokens')
    expect(mt.ledger.requirements[0]!.dive!.activation).toBe('armed')

    // REQ-261004065652-5c1c t3：中止的**停手位改由 driverHealth 承载**（它是 isDrivableRequirement
    // 唯一读的字段）；legacy 的 phase=paused 只在"台账尚未被写停"时才由 pauseAborted 补写，
    // 故此处断言 driverHealth 而非 phase。
    const ab = harness()
    ab.driver.requestDrive(ab.agent); await ab.driver.whenQuiet()
    ab.driver.onInboxClaimed(ab.agent, ab.delivered[0])
    ab.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
    await ab.driver.whenQuiet()
    await ab.idle()
    expect(ab.ledger.requirements[0]!.dive!.driverHealth!.state).toBe('paused')
    expect(ab.ledger.requirements[0]!.dive!.driverHealth!.reason).toBe('aborted:unknown')
    expect(ab.ledger.requirements[0]!.dive!.activation).toBe('armed')

    // 有意契约变更（FR-2）：agent 级错误先退避，不写健康位；连续 3 次才熔断停手。
    const er = harness()
    er.driver.onAgentError(er.agent); await er.driver.whenQuiet()
    expect(er.ledger.requirements[0]!.dive!.driverHealth, '第 1 次不该写健康位').toBeUndefined()
    er.driver.onAgentError(er.agent); await er.driver.whenQuiet()
    er.driver.onAgentError(er.agent); await er.driver.whenQuiet()
    expect(er.ledger.requirements[0]!.dive!.driverHealth!.state).toBe('paused')
    expect(er.ledger.requirements[0]!.dive!.driverHealth!.reason).toBe('agent-error-loop')
    expect(er.ledger.requirements[0]!.dive!.activation).toBe('armed')
  })

  it('TC-10 FR-10：伪造来源/内容 → pre-step 拒进且留痕含原因', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()
    const round = h.delivered[0] as { id: string; source: unknown }
    h.driver.onInboxClaimed(h.agent, round)
    const forgedContent = { id: round.id, content: [{ type: 'text', text: '篡改' }], source: round.source }
    expect(await h.driver.onPreStep(h.agent, [forgedContent], { aborted: false }, async () => ({ kind: 'enter', messages: [forgedContent] }))).toEqual({ kind: 'reject' })
    const forgedSource = { id: round.id, content: (h.delivered[0] as { content: unknown }).content, source: { kind: 'dive', requirementId: 'REQ-t', revision: 999, round: 1 } }
    expect(await h.driver.onPreStep(h.agent, [forgedSource], { aborted: false }, async () => ({ kind: 'enter', messages: [forgedSource] }))).toEqual({ kind: 'reject' })
    expect(h.warns.join(' ')).toContain('pre-step 拒绝')
  })

  it('TC-11 FR-11：起轮/拒绝/让位/检查点失败/终态/teardown 六条路径都有留痕', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent); await h.driver.whenQuiet()          // 起轮
    const round = h.delivered[0]
    h.driver.onInboxClaimed(h.agent, round)
    await h.driver.onPreStep(h.agent, [{ id: (round as {id:string}).id, content: [{type:'text',text:'x'}], source: (round as {source:unknown}).source }], { aborted: false }, async () => ({ kind: 'enter', messages: [] })) // 拒绝
    h.inbox.nextTurn.push({ id: 'human-2', content: [], source: { kind: 'user' } })
    h.driver.onInboxInserted(h.agent, h.inbox.nextTurn[h.inbox.nextTurn.length - 1])  // 让位
    const ck = harness(); ck.setCheckpoint(async () => { throw new Error('down') })
    ck.driver.requestDrive(ck.agent); await ck.driver.whenQuiet()      // 检查点失败
    const lim = harness({ req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1000 } as never }) })
    lim.driver.requestDrive(lim.agent); await lim.driver.whenQuiet()   // 终态
    await h.driver.teardown()                                          // teardown

    const all = [h.infos, h.warns, h.debugs, ck.warns, lim.warns].flat().join(' | ')
    for (const marker of ['起轮 queued', 'pre-step 拒绝', '竞争输入', '检查点失败', '回合上限', 'teardown']) {
      expect(all, marker).toContain(marker)
    }
  })

  it('TC-12 FR-11：里程碑催办经 round 半投递（armed+active）——source.kind=dive、roundsInStage 递增', async () => {
    const h = harness()
    h.driver.queueReminder('REQ-t', '【里程碑提醒】产物 kind=requirement 已登记 31 分钟未确认。')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    const msg = h.delivered[0] as { id: string; content: Array<{ text: string }>; source: { kind: string } }
    expect(msg.source.kind).toBe('dive')
    // 起轮正文被催办原文替换（不再走 renderRoundText）。
    expect(msg.content[0].text).toContain('里程碑提醒')
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: msg.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
  })

  it('TC-13 FR-11：非 armed+active 时 queueReminder 不投递（③：需求根本到不了 drive）', async () => {
    const h = harness({ req: makeReq({ dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0 } as never }) })
    h.driver.queueReminder('REQ-t', '【里程碑提醒】产物 kind=requirement 已登记 31 分钟未确认。')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
  })
})
