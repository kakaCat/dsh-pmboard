/**
 * Dive 死循环 / 闭锁用例的共享夹具（REQ-261004065652-5c1c · t3）。
 *
 * 为什么抽出来：`dive-loop-breaker`（熔断与闭锁）与 `dive-abort-latch`（人中止）验的是**同一台**
 * 驱动器的两条停机路径，各自手搓一份 harness 必然漂移（本仓"两份真相必然漂移"的教训）。
 *
 * 形状刻意为**事故形态**：投递 → 回合起 → 上游失败 → 下一拍再投；
 * 时间走注入的假时钟（`tick(ms)`），`peekFacts` 是活投影（t2 已把生产的陈旧问题修掉，
 * 这里验的是第二道防线：内存闭锁不依赖任何 I/O）。
 *
 * @module dsh-pmboard/tests/support/dive-loop-harness
 */
import { legacyStoreProjection } from './legacy-store-projection.js'
import { factsOf } from '../../src/domain/requirement/RequirementSummary.js'
import {
  createDiveRoundDriver, type DiveRoundDriver, type DiveRoundPorts,
} from '../../src/application/dive/round-driver.js'
import { createProviderLatch, type ProviderLatch } from '../../src/application/internal/provider-latch.js'
import type { RequirementDive, RequirementRecord } from '../../src/shared/protocol.js'

/** 上游 5 小时/周额度耗尽（实测原文里带 `usage limit`、不带结构化 code）。 */
export const AUTH_FAIL = { reason: { kind: 'error', error: { code: 'AUTH', message: '403 usage limit reached' } } }

/** 瞬时传输故障（可重试）。 */
export const TRANSPORT_FAIL = { reason: { kind: 'error', error: { code: 'TRANSPORT', message: 'stream idle 3m' } } }

/** 用户按「停止」/ 宿主 abort。 */
export const ABORT_USER = { reason: { kind: 'aborted', reason: { kind: 'user' } } }

export function makeReq(id: string, window: string, dive?: RequirementDive): RequirementRecord {
  return {
    id, title: '需求 ' + id, description: '', status: 'implementing', blocked: false,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: window,
    dive: dive ?? { activation: 'armed', phase: 'active', roundsInStage: 0 },
  } as unknown as RequirementRecord
}

interface AgentLike { id: string; status: string; session: { id: string }; inbox: Record<string, unknown> }

export interface LoopHarness {
  driver: DiveRoundDriver
  ledger: { schemaVersion: number; revision: number; requirements: RequirementRecord[] }
  agents: Record<string, AgentLike>
  delivered: Array<{ message: { source: { requirementId: string } }; windowId: string }>
  infos: string[]
  warns: string[]
  providerLatch?: ProviderLatch
  diveOf: (id: string) => RequirementDive | undefined
  /** 一拍空闲：起轮（若有资格）。 */
  idle: (windowId: string) => Promise<void>
  /** 回合收尾（形态取自宿主 turn/end）。 */
  endTurn: (windowId: string, data: unknown) => Promise<void>
  tick: (ms: number) => void
  deliveredFor: (reqId: string) => number
}

export function harness(opts: {
  reqs?: RequirementRecord[]
  withLatch?: boolean
  storeMutateThrows?: boolean
  /** 人工门判据（FR-5）：传了才装配端口（缺省 = 行为与改动前逐字一致）。 */
  humanGate?: (requirementId: string) => { open: boolean; reason?: string }
  /** 起链预算判据（FR-11）：传了才装配端口。 */
  chainBudget?: (candidateId: string) => { allowed: boolean; reason?: string; detail?: { name: string; current: number; limit: number } }
  /** 里程碑/诊断日志收集（可选，供用例断言"响亮"）。 */
  infos?: string[]
} = {}): LoopHarness {
  const requirements = opts.reqs ?? [makeReq('REQ-a', 'agent-1')]
  const ledger = { schemaVersion: 10, revision: 1, requirements, tasks: [], triages: [] } as {
    schemaVersion: number; revision: number; requirements: RequirementRecord[]; tasks: unknown[]; triages: unknown[]
  }
  const repo = {
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_r: string, fn: (l: unknown) => unknown) => {
      if (opts.storeMutateThrows === true) throw new Error('store down（注入的写失败）')
      const before = JSON.stringify(ledger)
      const changed = fn(ledger) ?? {}
      if (JSON.stringify(ledger) !== before) ledger.revision += 1
      return { changed: changed as never, revision: ledger.revision }
    },
    replaceAll: async () => { /* 本夹具不用 */ },
  }

  const agents: Record<string, AgentLike> = {}
  for (const r of requirements) {
    const id = r.sourceSessionId as string
    agents[id] = {
      id, status: 'idle', session: { id },
      inbox: {
        nextTurn: [], nextStep: [],
        prepend(target: string, m: unknown) {
          const list = (target === 'next-step' ? this.nextStep : this.nextTurn) as unknown[]
          list.unshift(m)
        },
      },
    }
  }

  let clock = 1_000_000
  let seq = 0
  const delivered: LoopHarness['delivered'] = []
  const infos: string[] = opts.infos ?? []
  const warns: string[] = []
  const providerLatch = opts.withLatch === false ? undefined : createProviderLatch({ now: () => clock })

  const ports: DiveRoundPorts = {
    store: legacyStoreProjection(repo as never),
    peekFacts: () => ledger.requirements.map(factsOf),
    agents: { get: (id) => agents[id], withoutInitiator: (op) => op() },
    fiberActive: () => true,
    delivery: {
      createRoundMessage: (input) => {
        seq += 1
        const message = {
          id: 'm' + seq, role: 'user',
          content: [{ type: 'text', text: input.text }],
          source: { kind: 'dive', requirementId: input.requirementId, revision: input.revision, round: input.round },
        }
        return { message, messageId: 'm' + seq }
      },
      deliverMessage: (windowId, message) => {
        delivered.push({ message: message as { source: { requirementId: string } }, windowId })
        const agent = agents[windowId]
        ;(agent.inbox.nextTurn as unknown[]).push(message)
        agent.status = 'running'
        return { delivered: true }
      },
    },
    cancel: () => { /* 本夹具不验取消 */ },
    whenIdle: async () => { /* fake：立即空闲 */ },
    checkpoint: async () => { /* fake */ },
    renderRoundText: (i) => 'round ' + i.round,
    now: () => clock,
    logger: { info: (m) => infos.push(m), debug: () => {}, warn: (m) => warns.push(m) },
    ...(providerLatch === undefined ? {} : { providerLatch }),
    ...(opts.humanGate === undefined ? {} : { humanGate: opts.humanGate }),
    ...(opts.chainBudget === undefined ? {} : { chainBudget: opts.chainBudget }),
  }

  const driver = createDiveRoundDriver(ports)
  const diveOf = (id: string): RequirementDive | undefined =>
    ledger.requirements.find((r) => r.id === id)?.dive

  return {
    driver, ledger, agents, delivered, infos, warns, diveOf,
    ...(providerLatch === undefined ? {} : { providerLatch }),
    idle: async (windowId) => {
      driver.onIdle(agents[windowId], () => { /* captureTick */ })
      await driver.whenQuiet()
    },
    endTurn: async (windowId, data) => {
      driver.onSessionEvent({ id: windowId }, { type: 'turn/end', data })
      agents[windowId].status = 'idle'
      await driver.whenQuiet()
    },
    tick: (ms) => { clock += ms },
    deliveredFor: (reqId) => delivered.filter((d) => d.message.source.requirementId === reqId).length,
  }
}
