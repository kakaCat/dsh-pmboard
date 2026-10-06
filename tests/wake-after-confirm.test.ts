// serves: FR-1, FR-2
/**
 * 端到端回归锁：**确认之后不需要任何人发消息，agent 自己就起一轮**（REQ-261006170150-52cc · TC-11 / TC-12）。
 *
 * ## 为什么这份用例是本次事故的"正脸"
 *
 * 事故现场是：人点了确认，**状态真的推进了**，但 agent 一动不动，人只能手打一句「继续」。
 * 根因不在确认动作本身，而在「等待解除」与「驱动触发」两件事没接上：
 *   · 清位被放在推进**之后**、且**不带本次这票的 ref** ⇒ 内存在途登记没被放开，
 *     紧接着推进触发的 `requirement-moved` 到达驱动时被 `dialogInFlight` 挡下**并丢弃这一拍**；
 *   · 清位写本身是 `requirement-updated`，事件桥**不转发** ⇒ 再没有第二次触发。
 *
 * 所以本文件**不注入任何用户消息**：起轮只能来自「清位即驱动」（FR-2）或「推进的
 * requirement-moved」（FR-1 把清位提到推进之前，这一拍才不再被自己挡下）。
 *
 * ## 装配口径（照 `tests/dive-wake-e2e.test.ts` 的边界替换法）
 *
 * 只替换 IO 边界（台账 / agent 注册表 / agent 句柄），其余走**真实现**：
 * `createCaptureRuntime` 的真投递器 + `createDiveRoundDriver` 的真驱动 + 真 `PendingConfirmRegistry`。
 * 事件桥用一句"状态真变了就转发 requirement-moved"的替身——与组合根 store 桥**同口径**
 * （桥只转发状态迁移，不转发 `requirement-updated`，这正是事故里丢掉触发的那一环）。
 */
import { legacyStoreProjection } from './support/legacy-store-projection.js'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyLedger, type RequirementRecord } from '../src/shared/protocol.js'
import { createCaptureRuntime } from '../src/wiring/pm-capture-root.js'
import { createDiveRoundDriver, type DiveRoundPorts } from '../src/application/dive/round-driver.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { taskStoreAt } from './queue/route-deps.js'
import { applyConfirmDecision } from '../src/application/internal/confirm-settle.js'
import { enterAwaitingConfirm, isAwaitingConfirmStop } from '../src/application/internal/awaiting-confirm.js'
import { defineAskConfirmTool } from '../src/tools/index.js'
import type { UseCaseDeps } from '../src/application/ports.js'

const WINDOW = 'agent-1'
const REQ = 'REQ-e2e'
const Q = '需求文档已完成，是否确认进入设计？'
const AFFIRM = '确认，推进到下一阶段 (Recommended)'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-wake-ac-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function makeReq(): RequirementRecord {
  return {
    id: REQ, title: '确认后续跑', description: '', status: 'brainstorming', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: WINDOW,
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'brainstorming', at: 2, by: { kind: 'human' } },
    ],
    artifacts: [{
      stage: 'brainstorming', kind: 'requirement',
      path: 'docs/requirements/' + REQ + '/requirement.md', registeredAt: 1,
    }],
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
  } as unknown as RequirementRecord
}

/** 真装配 + 边界替换；返回可观测面（inbox / 台账 / 驱动）。 */
function harness() {
  const ledger = { ...emptyLedger(), requirements: [makeReq()], tasks: [], triages: [] } as unknown as {
    revision: number; requirements: RequirementRecord[]
  }
  let revision = 0
  const registry = new PendingConfirmRegistry({ now: () => 1000 })
  const inbox = {
    nextTurn: [] as Array<{ id?: string; source?: { kind?: string } }>, nextStep: [] as unknown[],
    prepend(target: string, m: unknown) { (target === 'next-step' ? this.nextStep : this.nextTurn).unshift(m as never) },
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

  /** 事件桥替身：**只在状态真的变了**时转发（= 组合根的 requirement-moved 桥同口径）。 */
  let bridge: ((id: string) => void) | undefined

  const repo = {
    snapshot: () => ledger,
    read: async (fn: (v: unknown) => unknown) => fn(ledger),
    mutate: async (_reason: string, fn: (l: unknown) => unknown) => {
      const statusBefore = ledger.requirements[0]?.status
      const changed = (fn(ledger) ?? {}) as never
      revision += 1
      if (statusBefore !== ledger.requirements[0]?.status && bridge !== undefined) bridge(REQ)
      return { changed, revision }
    },
    replaceAll: async (_r: string, next: never) => { Object.assign(ledger, next) },
  }
  const store = legacyStoreProjection(repo as never)

  const ports: DiveRoundPorts = {
    store,
    peekFacts: () => ledger.requirements.map(factsOf),
    agents: { get: (id) => (id === WINDOW ? agent : undefined), withoutInitiator: (op) => op() },
    fiberActive: () => true,
    delivery: deliverer,
    cancel: () => {},
    whenIdle: async () => {},
    checkpoint: async () => {},
    renderRoundText: (i) => 'round ' + i.round,
    now: () => 1000,
    logger: {
      info: () => {}, debug: () => {},
      warn: (m, e) => { warnings.push(String(m) + ' :: ' + String((e as Error)?.message ?? e ?? '')) },
    },
    // 弹框在途判据（FR-1）：修前这里恒为 true（无 ref 的清位放不开内存登记），驱动被挡下。
    dialogInFlight: (id) => registry.inFlightFor(id),
  }
  const driver = createDiveRoundDriver(ports)
  bridge = (id) => driver.onRequirementMoved(id)

  const deps = {
    store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now: () => 1000 },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    dialogs: registry,
    // 组合根的真实接法：清位即请求驱动（走 round 半既有入口，不新增投递路径）。
    notifyDrivable: (id: string) => driver.onRequirementMoved(id),
  } as unknown as UseCaseDeps

  return { driver, store, ledger, inbox, agent, registry, warnings, deps }
}

/** inbox 里 `source.kind='dive'` 的回合消息（= 驱动真的起了一轮）。 */
const diveRounds = (inbox: { nextTurn: Array<{ source?: { kind?: string } }> }): unknown[] =>
  inbox.nextTurn.filter((m) => m.source?.kind === 'dive')

describe('确认后无需人敲字即起轮（TC-11 / TC-12，修前必红）', () => {
  it('TC-11 UC-1：弹框在途 → 人晚答（带 ref）→ 停手位清、status 变、**不注入任何用户消息**就起一轮', async () => {
    const h = harness()

    // 弹框在途：两半都登记（内存在途表 + 台账停手位）——这就是事故里"人还没答"的那一拍。
    await enterAwaitingConfirm(
      { store: h.store, dialogs: h.registry, now: () => 1000 },
      { requirementId: REQ, windowKey: WINDOW, ref: 'pc-e2e-1', kind: 'confirm' },
    )
    expect(h.registry.inFlightFor(REQ)).toBe(true)
    expect(isAwaitingConfirmStop((await h.store.get(REQ))!)).toBe(true)

    // 人作答（后台续跑走的就是这一句：带本次这票的 ref 进收敛点）。
    const out = await applyConfirmDecision(h.deps, {}, {
      requirementId: REQ, windowKey: WINDOW, target: 'artifact', kind: 'requirement',
      question: Q, picked: AFFIRM, nowTs: 1000, advance: true, dialogRef: 'pc-e2e-1',
    })
    await h.driver.whenQuiet()

    expect(out.advanced).toBe(true)
    expect((await h.store.get(REQ))!.status).toBe('design')
    expect(isAwaitingConfirmStop((await h.store.get(REQ))!)).toBe(false)
    expect(
      diveRounds(h.inbox),
      '确认之后**没有任何用户消息被注入**；这里为 0 就是本次事故（状态变了、agent 不动）',
    ).toHaveLength(1)
  })

  it('TC-12 UC-3：否定作答 → 不落章、不推进，但照样起一轮（修前：什么都不发生）', async () => {
    const h = harness()
    const deps = {
      ...h.deps,
      questions: new UserQuestionsAdapter(() => ({
        ask: async () => ({ answers: [{ id: 'confirm', selected: ['需要修改'], custom: '先别推进' }] }),
      })),
    } as unknown as UseCaseDeps
    const tool = defineAskConfirmTool(deps) as unknown as {
      execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>>
    }

    const out = await tool.execute({ target: 'artifact', kind: 'requirement', question: Q }, { agent: { id: WINDOW } })
    await h.driver.whenQuiet()

    // 否定作答：不落章、不推进（既有语义不得被本需求改动）
    expect(out.confirmed).toBe(false)
    const after = (await h.store.get(REQ))!
    expect(after.status).toBe('brainstorming')
    expect(after.artifacts?.[0]?.confirmedAt).toBeUndefined()
    // 但"等待已经结束"是事实 ⇒ 链必须被叫起来（否则人就只能手打「继续」）
    expect(
      diveRounds(h.inbox),
      '否定作答也是"等待结束"；这里为 0 就是"答完否定了、链也停着"',
    ).toHaveLength(1)
  })
})
