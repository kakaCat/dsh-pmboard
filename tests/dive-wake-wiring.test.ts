// serves: FR-1, FR-2
/**
 * 装配形状守卫（REQ-261001201200-8f8b FR-1 / FR-2）——**修前必红**。
 *
 * 为什么单独一条、且不测行为只测装配：本次事故的本质是「组合根构造投递器的形状 ≠ 类签名」，
 * 而它被拖到运行期第一次 `createRoundMessage` 才炸、炸了又被 `requestDrive` 的 catch 吞掉
 * → `disarm` → 需求此后所有唤醒触发在 `isDrivableRequirement()` 静默 return。
 *
 * 修前形状（组合根两参）：`new AgentDeliverer(getAgents, { plugin })` → `this.idFactory` 是对象，
 * 调用即 `TypeError: this.idFactory is not a function`。因此本用例在修前**必红**。
 *
 * @module dsh-pmboard/tests/dive-wake-wiring
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { describe, it, expect } from 'vitest'
import { FileDiagSink } from '../src/adapters/FileDiagSink.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { createCaptureRuntime } from '../src/wiring/pm-capture-root.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { AgentDeliverer } from '../src/adapters/AgentDeliverer.js'
import { Context } from '@deepseek-ai/cordis'
import ReqboardDiveManager from '../src/adapters/ReqboardDiveManager.js'
import { initCaptureDiag } from '../src/application/internal/diag-log.js'
import { readFileSync as readSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

/** 真实组合根 + 真实 round driver 的最小装配（只替换 IO 边界：台账、agent registry、agent 句柄）。 */
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
    prepend(target: string, m: unknown) { (target === 'next-step' ? this.nextStep : this.nextTurn).unshift(m as never) },
  }
  const agent = {
    id: WINDOW, status: 'idle', session: { id: WINDOW }, inbox,
    followup(message: unknown) { inbox.nextTurn.push(message as never) },
  }
  const warnings: string[] = []
  // ★ 被守卫的那一行：投递器**走真实组合根**产出，不手搓 fake delivery。
  const { deliverer } = createCaptureRuntime({
    plugin: 'dsh-pmboard',
    getAgents: () => ({ get: (id: string) => (id === WINDOW ? agent : undefined) }),
  })
  const ports: DiveRoundPorts = { store: legacyStoreProjection(repo as never),
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
    logger: { info: () => {}, debug: () => {}, warn: (m) => warnings.push(m) },
  }
  // B12 阶段⑤族 B：手工 harness 补新端口视图（投影架在同一份 ledger fake 上，单一真相源）
  const store = legacyStoreProjection({
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async () => ({ changed: {} }),
    replaceAll: async () => {},
  } as never)
  return { driver: createDiveRoundDriver(ports), ledger, store, agent, inbox, warnings }
}

describe('装配形状守卫：组合根产出的投递器能被真实驱动器驱动起来（修前必红）', () => {
  it('一次 requestDrive → inbox 恰 1 条 source.kind=dive 的回合消息', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect(h.inbox.nextTurn).toHaveLength(1)
    expect(h.inbox.nextTurn[0]?.source?.kind).toBe('dive')
  })

  it('起轮后需求仍是 armed（修前会因 TypeError 被 disarm，roundsInStage 永远为 0）', async () => {
    const h = harness()
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    expect((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id))?.dive?.activation).toBe('armed')
    expect(h.warnings.some((m) => m.includes('driv'))).toBe(false)
  })

  it('回合消息 identity 自洽：messageId 即 message.id，且带 req/revision/round', async () => {
    const h = harness()
    const req = (await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id)) as unknown as { id: string; version: number }
    h.driver.requestDrive(h.agent)
    await h.driver.whenQuiet()
    const msg = h.inbox.nextTurn[0] as unknown as { id: string; source: { requirementId: string; revision: number; round: number } }
    expect(typeof msg.id).toBe('string')
    expect(msg.id.length).toBeGreaterThan(0)
    expect(msg.source.requirementId).toBe(req.id)
    expect(msg.source.revision).toBe(req.version)
    expect(msg.source.round).toBe(1)
  })
})

describe('装配契约：非法 idFactory 必须响亮（不许把装配错误拖到运行期）', () => {
  it('第二参传对象（修前的错误形状）→ 构造期 TypeError', () => {
    expect(() => new AgentDeliverer(() => undefined, { plugin: 'dsh-pmboard' } as never, 'dsh-pmboard'))
      .toThrowError(/idFactory 必须是函数/)
  })
})

/**
 * 生产装配守卫：`src/index.ts` 里那个 `diveRoundPorts` 字面量是**真实组合根**，它缺任何一个端口
 * 都会让 drive() 在运行时抛错、被吞、然后 disarm —— 而 tsc 早就能报（TS2741），只是被仓库里
 * 192 条既有类型错误淹没了，没人看。所以这里用一条**可读的**源码级断言把它钉住。
 *
 * 由来（REQ-261001201200-8f8b）：修完「投递器构造参数错位」后才发现这个字面量**根本没接 delivery**
 * ——同一症状的第二处断点。只修一处，链路照样不通。
 */
describe('生产装配守卫：diveRoundPorts 必须接全（尤其 delivery）', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
  const block = /const diveRoundPorts: DiveRoundPorts = \{([\s\S]*?)\n  \}/.exec(src)?.[1] ?? ''

  it('字面量可定位（守卫自身不空转）', () => {
    expect(block.length).toBeGreaterThan(0)
  })

  it('delivery 在位——修前缺它，drive() 第一步就抛（与投递器构造错位是同一症状的第二处断点）', () => {
    expect(block).toContain('delivery:')
  })

  it('其余必需端口键均在位（键可写冒号或简写）', () => {
    // B12 阶段②c：`DiveRoundPorts.repo` 已摘除（读走 peekFacts、写走 store）
    for (const k of ['store', 'peekFacts', 'agents', 'fiberActive', 'cancel', 'whenIdle', 'checkpoint', 'renderRoundText', 'now', 'logger']) {
      expect(block, '缺少端口键 ' + k).toMatch(new RegExp('\\b' + k + '\\s*[:,]'))
    }
  })
})
// ─────────────────────────────────────────────────────────────────────────────
// FR-3 · 订阅按作用域分组（REQ-261001213924-1441）
//
// 修前：全部七路都挂在**插件 ctx** 上。agent 主题事件在 agent 自己的作用域里派发，而 cordis 按
// 发射方作用域载体过滤监听器，插件 ctx 不在该作用域链上 ⇒ 监听器被**静默丢弃**——订阅"成立"了，
// 却永远收不到事件。下面用真实 cordis Context 做行为断言：把 agent 事件发在 root 上没人接，
// 发在 agent.ctx 上才有人接。
// ─────────────────────────────────────────────────────────────────────────────

/** 假 agent ctx：记录注册了哪些事件、收到了什么、解绑了几路。 */
function fakeBus() {
  const handlers = new Map<string, Array<(...a: unknown[]) => unknown>>()
  const offs: string[] = []
  const ctx = {
    on(event: string, listener: (...a: unknown[]) => unknown) {
      const arr = handlers.get(event) ?? []
      arr.push(listener)
      handlers.set(event, arr)
      // 解绑必须**真的摘掉**监听器，否则测试证明的只是假件自己
      return () => {
        offs.push(event)
        handlers.set(event, (handlers.get(event) ?? []).filter((l) => l !== listener))
      }
    },
  }
  return {
    ctx,
    names: () => [...handlers.keys()],
    fire: (event: string, payload?: unknown, next?: unknown) => {
      for (const l of handlers.get(event) ?? []) l(payload, next)
    },
    offs,
  }
}

function managerHarness(reqs: RequirementRecord[]) {
  const ledger = { requirements: reqs, triages: [] } as unknown as { requirements: RequirementRecord[] }
  let mutateCount = 0
  const repo = {
    snapshot: () => ledger,
    mutate: async (_kind: string, fn: (l: unknown) => unknown) => {
      mutateCount += 1
      return { changed: fn(ledger) ?? {} }
    },
  }
  const warns: string[] = []
  const ctx = new Context()
  // warn 从**端口 logger** 收：宿主 logger 只是进程面，端口面才是可断言面
  const portLogger = { info: () => {}, debug: () => {}, warn: (m: string) => { warns.push(m) } }
  // B12 阶段①-a：ports.peekFacts 是必填端口；`as never` 会**吞掉**缺键的编译错，
  // 于是诊断路径的 `this.ports.peekFacts()` 运行期抛错、被静默 catch 吞掉（本轮实测踩到）。
  const manager = new ReqboardDiveManager(ctx as never, { store: legacyStoreProjection(repo as never), repo, peekFacts: () => ledger.requirements.map(factsOf), now: () => 1000, logger: portLogger } as never)
  const statuses: Array<[unknown, unknown]> = []
  manager.attachAgentStatus((a, s) => { statuses.push([a, s]) })
  // B12 阶段⑤族 B：同一份 repo 的**新端口视图**（投影），手工 harness 也补上
  return { ctx, manager, warns, statuses, ledger, store: legacyStoreProjection(repo as never), mutations: () => mutateCount };
}

describe('FR-3 · agent 事件必须注册在 agent.ctx（修前挂插件 ctx 被静默丢弃）', () => {
  it('agent/created → per-agent 六路落在 agent.ctx；发在插件 root 上的 agent/status 无人接', () => {
    const h = managerHarness([makeReq()]);
    const agentBus = fakeBus()
    const agent = { id: WINDOW, session: { id: WINDOW }, ctx: agentBus.ctx }
    // 假 agent 只提供订阅/投递用到的字段；宿主 `agent/created` 载荷要求完整 Agent 句柄，
    // 故载荷按既有本文件口径（见下方 `as never` 装配）放宽——**只放宽载荷形状，断言不动**。
    h.ctx.emit('agent/created', { agent } as never)
    expect(agentBus.names().sort()).toEqual(['agent/disposed', 'agent/error', 'agent/inbox/claimed', 'agent/inbox/discarded', 'agent/inbox/inserted', 'agent/pre-step', 'agent/status'])
    agentBus.fire('agent/status', { agent, status: 'idle' })
    expect(h.statuses).toEqual([[agent, 'idle']])
    h.ctx.emit('agent/status', { agent, status: 'idle' } as never)
    expect(h.statuses, '插件 root 上不该有 agent/status 监听器').toHaveLength(1)
  })

  it('agent/disposed → 该 agent 的六路订阅全部注销（disposed 后再发无人接）', () => {
    const h = managerHarness([makeReq()]);
    const agentBus = fakeBus()
    const agent = { id: WINDOW, session: { id: WINDOW }, ctx: agentBus.ctx }
    h.ctx.emit('agent/created', { agent } as never)
    agentBus.fire('agent/disposed', { agent })
    expect(agentBus.offs.sort()).toEqual(['agent/disposed', 'agent/error', 'agent/inbox/claimed', 'agent/inbox/discarded', 'agent/inbox/inserted', 'agent/pre-step', 'agent/status'])
    agentBus.fire('agent/status', { agent, status: 'idle' })
    expect(h.statuses, '注销后不得再收到状态').toHaveLength(0)
    expect(h.manager.subscriptionState().boundAgents).toEqual([])
  })

  it('负例三者齐备：拿不到 agent.ctx → warn + 诊断日志 + 需求 comment', async () => {
    const diagPath = join(tmpdir(), 'dsh-pmboard-diag-' + process.pid + '.log')
    initCaptureDiag(new FileDiagSink(diagPath))
    const h = managerHarness([makeReq()]);
    h.ctx.emit('agent/created', { agent: { id: WINDOW, session: { id: WINDOW } } } as never)
    await new Promise((r) => setTimeout(r, 20))
    expect(h.warns.join(' '), '① warn').toContain('agent.ctx');
    const diag = readSync(diagPath, 'utf8');
    expect(diag, '② 诊断日志').toContain('[WAKE-FAIL]');
    const bodies = ((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id))!.comments ?? []).map((c) => String(c.body)).join(' ');
    expect(bodies, '③ 需求 comment').toContain('[dive-diag]');
    expect(h.manager.subscriptionState().failures).toHaveLength(1);
  })
})

