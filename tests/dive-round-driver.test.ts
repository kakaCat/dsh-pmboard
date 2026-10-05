// serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
/**
 * T-2 回合状态机单测（REQ-260926215013-1568）：fake 端口驱动真实状态机。
 * 覆盖：3 次触发合并成 1 轮、驱动体异常不外泄、pre-step 前后栅栏与消息放回、
 * 检查点失败即解除武装、准入才计数、上限写终态、teardown 关准入。
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { transitionRequirement } from '../src/application/internal/token-usage.js'
// REQ-261004103330-005f t6：上限的权威来源改为运行设置的内存快照
import { installStageLimitSnapshot } from '../src/application/dive/round-state.js'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: 'agent-1',
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
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
  const inbox = { nextTurn: [] as unknown[], nextStep: [] as unknown[], prepend(target: string, m: unknown) { (target === 'next-step' ? this.nextStep : this.nextTurn).unshift(m) } }
  const agent: Record<string, unknown> = { id: 'agent-1', status: 'idle', session: { id: 'agent-1' }, inbox }
  const delivered: unknown[] = []
  let n = 0
  const warns: string[] = []
  const infos: string[] = []
  let checkpointImpl: () => Promise<void> = async () => {}
  const cancelled: unknown[] = []
  const ports: DiveRoundPorts = { store: legacyStoreProjection(repo as never),
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
      deliverMessage: (_wk, message) => { delivered.push(message); inbox.nextTurn.push(message); agent.status = 'running'; return { delivered: true } },
    },
    cancel: (a) => { cancelled.push(a) },
    whenIdle: async () => {},
    checkpoint: () => checkpointImpl(),
    renderRoundText: (i) => 'round ' + i.round,
    now: () => 1000,
    logger: { info: (m) => infos.push(m), debug: () => {}, warn: (m) => warns.push(m) },
  }
  const driver = createDiveRoundDriver(ports)
  // B12 阶段⑤族 B：手工 harness 补新端口投影（fake 必须是 **repo 形态**，见 §71.1）
  const store = legacyStoreProjection({
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_r: string, fn: (l: unknown) => unknown) => { const changed = (fn(ledger) ?? {}) as never; return { changed, revision: ledger.revision } },
    replaceAll: async () => {},
  } as never)

  return { driver, store, ledger, agent, inbox, delivered, warns, infos, cancelled, setCheckpoint: (fn: () => Promise<void>) => { checkpointImpl = fn } }
}

describe('T-2 · 空闲驱动与合并触发', () => {
  it('连发 3 次触发 → 只起 1 轮（合并）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    h.driver.requestDrive(h.agent)
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    expect(h.infos.some(m => m.includes('起轮 queued'))).toBe(true)
  })
  it('agent 非 idle 时不起轮（FR-6）', async () => {
    const h = harness()
    h.agent.status = 'running'
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
  })
  it('requirement-moved 只置检查标志并请求驱动，不直接投递（FR-6）', async () => {
    const h = harness()
    h.driver.onRequirementMoved('REQ-t')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
  })
})

describe('T-2 · 检查点与异常收尾', () => {
  it('检查点失败 → 不排队 + 解除武装（FR-3）', async () => {
    const h = harness()
    h.setCheckpoint(async () => { throw new Error('flush down') })
    h.driver.onRequirementMoved('REQ-t')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    // FR-5：运行时故障只写健康位；人的意图（activation）保持不变
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('paused')
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
    expect(h.warns.join(' ')).toContain('检查点失败')
  })
  it('驱动体抛错不外泄（无未处理 rejection）+ warn + 解除武装（FR-4/FR-11）', async () => {
    const spy = vi.fn()
    process.on('unhandledRejection', spy)
    const h = harness({ failCreate: true })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    await new Promise(r => setTimeout(r, 10))
    process.off('unhandledRejection', spy)
    expect(spy).toHaveBeenCalledTimes(0)
    expect(h.warns.join(' ')).toContain('驱动体异常')
  })
})

describe('T-2 · 竞态栅栏与消息放回', () => {
  it('revision 变 → pre-step reject 且同批其它已认领消息被放回（FR-1）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    const round = h.delivered[0]
    h.driver.onInboxClaimed(h.agent, round)
    await h.store.mutate('REQ-t', (r: { version: number }) => { r.version += 1; return { changed: true } })
    const other = { id: 'other-1', role: 'user', content: [{ type: 'text', text: '人类的活' }], source: { kind: 'user' } }
    const decision = await h.driver.onPreStep(h.agent, [round, other], { aborted: false }, async () => ({ kind: 'enter', messages: [round, other] }))
    expect(decision).toEqual({ kind: 'reject' })
    expect(h.inbox.nextStep.map((m) => (m as { id: string }).id)).toContain('other-1')
    expect(h.warns.join(' ')).toContain('pre-step 拒绝')
    expect(h.warns.join(' ')).toContain('revision 已变')
  })
  it('伪造内容不一致 → pre-step 拒进（FR-10）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    const round = h.delivered[0] as { id: string; source: unknown }
    h.driver.onInboxClaimed(h.agent, round)
    const forged = { id: round.id, content: [{ type: 'text', text: '篡改' }], source: round.source }
    const decision = await h.driver.onPreStep(h.agent, [forged], { aborted: false }, async () => ({ kind: 'enter', messages: [forged] }))
    expect(decision).toEqual({ kind: 'reject' })
    expect(h.warns.join(' ')).toContain('内容与登记不一致')
  })
})

describe('T-2 · 准入计数与上限终态', () => {
  it('discard 不计数；user/message 恰好 +1（FR-7）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    const round = h.delivered[0] as { id: string }
    h.driver.onInboxDiscarded(h.agent, round)
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: round.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: round.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
  })
  it('roundsInStage === maxRounds → 终态 paused/round-limit，且不再起轮（FR-8）', async () => {
    const h = harness({ req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1000 } as never }) })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    // FR-2：达上限 = 停下等人（健康位），不是终态；人的意图不变
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('paused')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.reason).toBe('round-limit:implementing')
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
    expect(h.warns.join(' ')).toContain('回合上限')
  })
  it('max-tokens / aborted → 解除武装或标 cancelled（FR-9）', async () => {
    const h = harness()
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: { reason: { kind: 'max-tokens' } } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('paused')
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
  })
})

describe('T-2 · teardown fail-closed', () => {
  it('teardown 后触发不再排队（FR-5）', async () => {
    const h = harness()
    await h.driver.teardown()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    expect(h.infos.join(' ')).toContain('teardown')
  })
})

describe('FR-11 · 里程碑催办经 round 半投递（queueReminder）', () => {
  it('queueReminder → 作为回合消息正文投递，source.kind=dive，准入后 roundsInStage +1', async () => {
    const h = harness()
    h.driver.queueReminder('REQ-t', '【里程碑提醒】产物 kind=requirement 已登记 31 分钟未确认。')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    const msg = h.delivered[0] as { id: string; content: Array<{ text: string }>; source: { kind: string } }
    expect(msg.source.kind).toBe('dive')
    expect(msg.content[0].text).toContain('里程碑提醒')
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'user/message', data: { id: msg.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
  })

  it('无待投递催办 → 仍走常规续跑文案 renderRoundText（不误替换）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(1)
    expect((h.delivered[0] as { content: Array<{ text: string }> }).content[0].text).toBe('round 1')
  })

  it('非 armed+active → 登记的催办不投递（不起轮）', async () => {
    const h = harness({ req: makeReq({ dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0 } as never }) })
    h.driver.queueReminder('REQ-t', '催办')
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
  })
})

describe('FR-3 · 解除武装必留痕（REQ-261001201200-8f8b）', () => {
  const comments = async (h: { store: { get: (id: string) => Promise<RequirementRecord | undefined> } }): Promise<string[]> =>
    (((await h.store.get('REQ-t'))!.comments) ?? []).map((c) => String(c.body))

  it('驱动体抛错 → disarm 的同时在需求上写一条 system comment（修前只有 logger.warn）', async () => {
    const h = harness({ failCreate: true })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('paused')
    const hit = (await comments(h)).filter((b) => b.includes('[Dive] 已暂停自动续跑（运行时原因：'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('driver-failed')
  })

  it('已 disarmed 再触发 → 不追加第二条（幂等，不刷屏）', async () => {
    const h = harness({ failCreate: true })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    h.driver.onRequirementMoved('REQ-t')
    await h.driver.whenQuiet()
    expect((await comments(h)).filter((b) => b.includes('[Dive] 已暂停自动续跑（运行时原因：'))).toHaveLength(1)
  })

  it('teardown 解除武装 → 不写 comment（插件正常收尾不算停摆）', async () => {
    const h = harness()
    h.driver.onRequirementMoved('REQ-t')
    await h.driver.whenQuiet()
    await h.driver.teardown()
    // teardown 不写任何状态：重启不该把需求标成「不健康」，更不该改写人的意图
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth).toBeUndefined()
    expect((await comments(h)).filter((b) => b.includes('[Dive] 已暂停自动续跑（运行时原因：'))).toHaveLength(0)
  })
})

describe('FR-7 补 · 终态需求永不被唤醒（2026-10-02 生产实测抓到的缺陷）', () => {
  it('已归档需求即使 armed+healthy，也不投轮、不改状态（bound() 不看状态的坑）', async () => {
    const h = harness({ req: makeReq({ status: 'archived', dive: { phase: 'active', activation: 'armed', roundsInStage: 0, driverHealth: { state: 'healthy' } } as never }) })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered, '关闭的需求不该有人惦记').toHaveLength(0)
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.state).toBe('healthy')
  })

  it('done / canceled 同样不唤醒（终态集合：done/archived/canceled）', async () => {
    for (const status of ['done', 'canceled'] as const) {
      const h = harness({ req: makeReq({ status, dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never }) })
      h.driver.requestDrive(h.agent)
      await h.driver.whenQuiet()
      expect(h.delivered, status).toHaveLength(0)
      expect((await h.store.get('REQ-t'))!.dive!.driverHealth, status).toBeUndefined()
    }
  })

  it('进行中需求不受影响（对照组：implementing 照常起轮）', async () => {
    const h = harness({ req: makeReq({ status: 'implementing' }) })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered).toHaveLength(1)
  })
})

describe('FR-6 · 回合收尾只认一个解析器：四种形态一套口径（REQ-261001213924-1441）', () => {
  it('不可重试的两类异常（aborted / interrupted）→ 即时停下等人，reason 是规范化原文', async () => {
    // FR-2（REQ-261004065652-5c1c t3）**有意变更**：`error` 改为分病因处置——
    // 瞬时错误（如 ETIMEDOUT）走「退避重试」，不再一次抖动就把需求停到人来点「继续」；
    // 连续同因 3 次才熔断。`aborted` / `interrupted` 不可重试，仍即时停手。
    const stopsNow: Array<[string, unknown, string]> = [
      ['aborted', { reason: { kind: 'aborted', reason: { kind: 'upstream-idle' } } }, 'aborted:upstream-idle'],
      ['interrupted', { reason: { kind: 'interrupted' } }, 'interrupted'],
    ]
    for (const [label, data, expectedReason] of stopsNow) {
      const h = harness()
      h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data })
      await h.driver.whenQuiet()
      const dive = (await h.store.get('REQ-t'))!.dive!
      expect(dive.driverHealth?.state, label).toBe('paused')
      expect(dive.driverHealth?.reason, label).toBe(expectedReason)
      expect(dive.activation, label + '（人的意图不得被改写）').toBe('armed')
    }
  })

  it('瞬时 error（第 1 次）不再写健康位：改为退避重试（FR-2 有意变更）', async () => {
    const h = harness()
    h.driver.onSessionEvent(
      { id: 'agent-1' },
      { type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'ETIMEDOUT', message: 'stream idle 3m' } } } },
    )
    await h.driver.whenQuiet()
    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.driverHealth, '一次抖动不该升级成人工事故').toBeUndefined()
    expect(dive.activation).toBe('armed')
    expect(h.warns.join(' ')).toContain('退避后重试')
  })

  it('非异常形态（completed / blocked）不改任何状态（修前也不该改，此处钉住）', async () => {
    const h = harness()
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: { reason: { kind: 'blocked' } } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth).toBeUndefined()
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
  })

  it('形态不认识（缺 reason）→ 不猜、不误报：一个字都不写', async () => {
    const h = harness()
    h.driver.onSessionEvent({ id: 'agent-1' }, { type: 'turn/end', data: {} })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth).toBeUndefined()
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
  })
})

describe('FR-1 · 回合计数是「本阶段」语义：阶段推进就归零（REQ-261001213924-1441）', () => {
  const at = 1_000
  const opts = { at, actor: { kind: 'human' as const }, reason: 'test' }

  it('跨阶段转换 → roundsInStage 归零、连续失败计数清零', () => {
    const r = makeReq({
      status: 'design',
      dive: { activation: 'armed', phase: 'active', roundsInStage: 1, driverHealth: { state: 'healthy', attempts: 2 } } as never,
    })
    transitionRequirement(r, 'decomposing', opts)
    expect(r.status).toBe('decomposing')
    expect(r.dive!.roundsInStage).toBe(0)
    expect(r.dive!.driverHealth!.attempts).toBe(0)
  })

  it('同阶段内重复调用（from === to）→ 计数不被清掉（阶段内累计必须保住）', () => {
    const r = makeReq({
      status: 'implementing',
      dive: { activation: 'armed', phase: 'active', roundsInStage: 3 } as never,
    })
    transitionRequirement(r, 'implementing', { ...opts, allowIllegalTransition: true })
    expect(r.dive!.roundsInStage).toBe(3)
  })

  it('无 dive 字段的存量需求：跨阶段转换不得抛错（迁移前数据仍可用）', () => {
    const r = makeReq({ status: 'design', dive: undefined as never })
    expect(() => transitionRequirement(r, 'decomposing', opts)).not.toThrow()
    expect(r.status).toBe('decomposing')
  })
})


// ---------------------------------------------------------------------------
// REQ-261004103330-005f t6：上限来自**运行设置快照**（FR-2）
// ---------------------------------------------------------------------------

/** 造快照源（结构类型；只关心上限这一路）。 */
function limitSource(implementing: number) {
  return { stageMaxRounds: { implementing: { value: implementing } } }
}

describe('T-6 · 上限来自设置快照（判定点停手，不掐断在跑的轮）', () => {
  // 模块级快照必须每个用例后卸载，否则会串味到本文件其它用例
  afterEach(() => installStageLimitSnapshot(undefined))

  it('把上限下调到已跑回合数：本拍即停手，留痕写明用的是设置里的上限', async () => {
    const h = harness({
      req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1 } as never }),
    })
    installStageLimitSnapshot(limitSource(1))
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()

    expect(h.delivered.length).toBe(0)
    const after = (await h.store.get('REQ-t'))!
    expect(after.dive!.driverHealth!.state).toBe('paused')
    expect(after.dive!.driverHealth!.reason).toBe('round-limit:implementing')
    // 人的意图不变、在跑的轮不被取消（停手只发生在**判定点**，不打断执行点）
    expect(after.dive!.activation).toBe('armed')
    expect(h.cancelled.length).toBe(0)
    // 留痕里的上限=设置里的 1（不是默认的 1000）——证明权威来源确实换成了快照
    expect(h.warns.join(' ')).toContain('上限=1')
    expect((after.comments ?? []).map((c) => c.body).join(' ')).toContain('达上限 1 回合')
  })

  it('把上限上调到已跑回合数之上：照常起轮（不是达到默认上限才动）', async () => {
    const h = harness({
      req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1 } as never }),
    })
    installStageLimitSnapshot(limitSource(5))
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()

    expect(h.delivered.length).toBe(1)
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth?.state).not.toBe('paused')
  })

  it('未安装快照时行为与改造前一致：roundsInStage=1000 撞默认上限 1000 → 停手', async () => {
    const h = harness({ req: makeReq({ dive: { phase: 'active', activation: 'armed', roundsInStage: 1000 } as never }) })
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.delivered.length).toBe(0)
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth!.reason).toBe('round-limit:implementing')
    expect(h.warns.join(' ')).toContain('上限=1000')
  })
})
