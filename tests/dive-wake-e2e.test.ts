/**
 * 端到端闸门（REQ-261001213924-1441 FR-7）——一条需求从「该跑」到「跑了 → 停了 → 被叫回来 → 重启不动它」的全链路。
 *
 * **这一份测试是修前必红的**：它断言的四件事在修前恰好全是坏的——
 *  ① 投递器三参构造错位 / round 端口缺 delivery → drive() 第一步就抛（同一条链的第二处断点，见 REQ-261001201200-8f8b）；
 *  ② 达上限写 phase=paused（终态语义）→ 人确认推进也回不来；
 *  ③ 回合计数从不按阶段归零 → 撞上阶段局部上限（draft/archived 只有 1）就永久停；
 *  ④ teardown 改写 activation → **每次插件重启把所有需求打成手动模式**。
 *
 * 为什么按这四条而不是「作用域」做闸门：2026-10-01 复核后，「agent/* 被 scope 过滤器丢弃」未获宿主源码支持
 * （未打标签的 ctx 一律放行；宿主 goal-round-driver 同款做法生产可用），经人裁决改为按**已证实故障**红/绿。
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { describe, it, expect } from 'vitest'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { createCaptureRuntime } from '../src/wiring/pm-capture-root.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { roundLimitFor } from '../src/application/dive/round-state.js'
import { recoverHealth } from '../src/application/internal/rearm.js'
import { transitionRequirement } from '../src/application/internal/token-usage.js'

const WINDOW = 'agent-1'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: WINDOW,
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

/** 最小装配：只替换 IO 边界（台账 / agent registry / agent 句柄），其余走真实实现。 */
function harness(req: RequirementRecord = makeReq()) {
  const ledger = { ...emptyLedger(), requirements: [req], tasks: [], triages: [] } as unknown as {
    revision: number; requirements: RequirementRecord[]
  }
  const repo = {
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_r: string, fn: (l: unknown) => unknown) => {
      const before = JSON.stringify(ledger)
      const changed = (fn(ledger) ?? {}) as never
      if (JSON.stringify(ledger) !== before) ledger.revision += 1
      return { changed, revision: ledger.revision }
    },
    replaceAll: async (_r: string, next: never) => { Object.assign(ledger, next) },
  }
  const inbox = {
    nextTurn: [] as Array<{ id?: string; source?: { kind?: string } }>, nextStep: [] as unknown[],
    prepend(target: string, m: unknown) { (target === "next-step" ? this.nextStep : this.nextTurn).unshift(m as never) },
  }
  const agent = {
    id: WINDOW, status: 'idle', session: { id: WINDOW }, inbox,
    followup(message: unknown) { inbox.nextTurn.push(message as never) },
  }
  const warnings: string[] = []
  const { deliverer } = createCaptureRuntime({
    plugin: 'dsh-pmboard',
    getAgents: () => ({ get: (id: string) => (id === WINDOW ? agent : undefined) }),
  })
  const ports: DiveRoundPorts = {
    store: legacyStoreProjection(repo as never),
    // B12 阶段②a：本模块的写改走新端口（与 peekFacts 同源）

    // B12 阶段①-a：idle 拍的同步判定改用窄投影
    peekFacts: () => ledger.requirements.map(factsOf),
    agents: { get: (id) => (id === WINDOW ? agent : undefined), withoutInitiator: (op) => op() },
    fiberActive: () => true,
    delivery: deliverer,
    cancel: () => {},
    whenIdle: async () => {},
    checkpoint: async () => {},
    renderRoundText: (i) => 'round ' + i.round,
    now: () => 1000,
    logger: { info: () => {}, debug: () => {}, warn: (m, e) => { warnings.push(String(m) + ' :: ' + String((e as Error)?.message ?? e ?? '')) } },
  }
  // B12 阶段⑤族 B：手工 harness 补新端口视图（投影架在同一份 ledger fake 上，单一真相源）
  const store = legacyStoreProjection({
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    // 注意：投影内部调的是**repo 形态**的 mutate（reason + 整册回调），不是新端口的 (id, fn)
    mutate: async (_r: string, fn: (l: unknown) => unknown) => {
      const changed = (fn(ledger) ?? {}) as never
      return { changed, revision: ledger.revision }
    },
    replaceAll: async () => {},
  } as never)

  return { driver: createDiveRoundDriver(ports), ledger, store, repo, inbox, agent, warnings };
}

describe('FR-7 · 唤醒链端到端（修前必红）', () => {
  it('①「该跑就跑起来」：真实投递器 + 真实 driver → agent 收到一条 dive 回合，且计数落 1', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent as never)
    await h.driver.whenQuiet()
    const rounds = h.inbox.nextTurn.filter((m) => m.source?.kind === 'dive')
    expect(rounds, '投递器/delivery 端口缺一，这里会是 0（drive 第一步就抛）').toHaveLength(1)
    // 计数只认「消息真的进了 history」：模拟宿主把这条消息派发回来（user/message）
    h.driver.onSessionEvent({ id: WINDOW }, { type: 'user/message', data: { id: rounds[0]!.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
    expect((await h.store.get('REQ-t'))!.dive!.activation).toBe('armed')
  })

  it('②「撞上限只停等人」：达阶段上限 → health=paused(round-limit:<阶段>)，activation 不变', async () => {
    const h = harness(makeReq({ status: 'design', dive: { phase: 'active', activation: 'armed', roundsInStage: roundLimitFor('design') } as never }))
    h.driver.requestDrive(h.agent as never)
    await h.driver.whenQuiet()
    const dive = (await h.store.get('REQ-t'))!.dive!
    expect(dive.driverHealth?.state).toBe('paused')
    expect(dive.driverHealth?.reason).toBe('round-limit:design')
    expect(dive.activation, '修前这里会写 phase=paused（终态），人的意图也被判死').toBe('armed')
  })

  it('③「人一动就继续」：recoverHealth → 又能起轮（停下等人不是死路）', async () => {
    const h = harness(makeReq({ status: 'design', dive: { phase: 'active', activation: 'armed', roundsInStage: roundLimitFor('design'), driverHealth: { state: 'paused', reason: 'round-limit:design' } } as never }))
    expect(await recoverHealth({  store: legacyStoreProjection(h.repo as never) as never, now: () => 2000 }, 'REQ-t', 'board-resume')).toBe(true)
    h.driver.requestDrive(h.agent as never)
    await h.driver.whenQuiet()
    expect(h.inbox.nextTurn.filter((m) => m.source?.kind === 'dive'), '恢复之后必须真的能再投一轮').toHaveLength(1)
  })

  it('④「重启不动人的意图」：teardown 不改 activation（修前每次重启把需求打成手动）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent as never)
    await h.driver.whenQuiet()
    await h.driver.teardown()
    expect((await h.store.get('REQ-t'))!.dive!.activation, '重启不是停摆，不许改写人的意图').toBe('armed')
    expect((await h.store.get('REQ-t'))!.dive!.driverHealth).toBeUndefined()
  })

  it('⑤「阶段推进计数归零」：跨阶段后 roundsInStage=0，上限只对当前阶段生效', async () => {
    const h = harness(makeReq({ status: 'design' }))
    h.driver.requestDrive(h.agent as never)
    await h.driver.whenQuiet()
    const msg = h.inbox.nextTurn.find((m) => m.source?.kind === 'dive')!
    h.driver.onSessionEvent({ id: WINDOW }, { type: 'user/message', data: { id: msg.id } })
    await h.driver.whenQuiet()
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(1)
    await h.store.mutate('REQ-t', (r) => {
      transitionRequirement(r, 'decomposing', { at: 1000, actor: { kind: 'human' }, reason: 'test' })
      return { changed: true }
    })
    expect((await h.store.get('REQ-t'))!.dive!.roundsInStage).toBe(0)
  })
})
