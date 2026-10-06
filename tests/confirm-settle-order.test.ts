// serves: FR-1, FR-2
/**
 * 确认收敛点：**清位先于推进** + **补发条件** 用例（REQ-261006170150-52cc · design/test-cases.md 的 TC-3~TC-5）。
 *
 * 要锁的是什么（本次事故的正脸）：
 *   · 修前收敛点那次清位**不带 ref、不 await** ⇒ 推进触发的 `requirement-moved` 到达驱动时停手位还在，
 *     那一拍被自己挡下并丢弃（症状：状态前进了、agent 不动）；
 *   · 修后必须**先**把停手位清掉，**再**落章/推进；推进没成功时还要**补一次驱动请求**，
 *     否则「推进没发生」这个最需要续跑的情形反而没人叫（INV-1 / INV-4）。
 *
 * 三条断言口径：
 *   TC-3 写入序 = 台账先「非 awaiting」、后「status 已变」；
 *   TC-4 补发次数 = 推进成功 0 次 / 被内容门拦下 1 次 / reject 抛错 1 次；
 *   TC-5 同需求第二票在场 ⇒ 停手位**不得**被清（沿用 `stillWaiting` 语义）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { applyConfirmDecision } from '../src/application/internal/confirm-settle.js'
import {
  enterAwaitingConfirm,
  exitAwaitingConfirm,
  isAwaitingConfirmStop,
  awaitingRefOf,
} from '../src/application/internal/awaiting-confirm.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-order-001'
const REQ = 'REQ-order001'
const AFFIRM = '确认，推进到下一阶段 (Recommended)'
const Q = '需求文档已完成，是否确认进入设计？'

let dir: string
let store: ReturnType<typeof makeTestStore>
let registry: PendingConfirmRegistry
/** notifyDrivable 的调用记录（= 补发驱动请求的次数）。 */
let notified: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-order-'))
  store = makeTestStore()
  registry = new PendingConfirmRegistry({ now: () => Date.now() })
  notified = []
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 真适配器构造 UseCaseDeps（`notifyDrivable` 记进 `notified`）。 */
function depsOf(over: Partial<UseCaseDeps> = {}): UseCaseDeps {
  return {
    store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now: () => 1_000_000 },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    dialogs: registry,
    notifyDrivable: (id: string) => { notified.push(id) },
    ...over,
  } as unknown as UseCaseDeps
}

/** 台账种子：brainstorming + 已登记 requirement 产物（可落章并推进到 design）。 */
function rec(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ, title: '清位序', description: '', status: 'brainstorming', blocked: false,
    sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'brainstorming', at: 2, by: { kind: 'human' } },
    ],
    artifacts: [{
      stage: 'brainstorming', kind: 'requirement',
      path: 'docs/requirements/' + REQ + '/requirement.md', registeredAt: 1,
    } as StageArtifact],
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

async function seed(r: RequirementRecord): Promise<void> {
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 进入一次等待（写停手位 + 在途登记）。 */
async function enterAwaiting(ref: string): Promise<void> {
  await enterAwaitingConfirm(
    { store, dialogs: registry, now: () => 1_000_000 },
    { requirementId: REQ, windowKey: W, ref, kind: 'confirm' },
  )
}

/** 读当前台账（同步）。 */
const cur = (): RequirementRecord => store.peek(REQ)!

/**
 * 给 store.mutate 打点：每次写提交**之后**采样一次台账，把两个里程碑按**首次出现**记序。
 * 为什么在 mutate 之后采样：本用例要证的是「写**已提交**的先后」，不是"函数被调用的先后"。
 */
function watchWrites(): string[] {
  const events: string[] = []
  const orig = store.mutate.bind(store)
  const mark = (): void => {
    const r = store.peek(REQ)
    if (r === undefined) return
    if (events.indexOf('stop-cleared') < 0 && !isAwaitingConfirmStop(r)) events.push('stop-cleared')
    if (events.indexOf('status-changed') < 0 && r.status !== 'brainstorming') events.push('status-changed')
  }
  ;(store as unknown as { mutate: unknown }).mutate = async (id: string, fn: never) => {
    const res = await (orig as unknown as (a: string, b: never) => Promise<unknown>)(id, fn)
    mark()
    return res
  }
  mark() // 起点（此时停手位在、status 还是 brainstorming ⇒ 不记任何里程碑）
  return events
}

describe('TC-3 写入序：停手位先清、status 后变（FR-1）', () => {
  it('带 ref 清位先完成，随后才推进 → 采样序恰为 [stop-cleared, status-changed]', async () => {
    await seed(rec())
    await enterAwaiting('pc-A')
    expect(isAwaitingConfirmStop(cur())).toBe(true)

    const events = watchWrites()

    const out = await applyConfirmDecision(depsOf(), {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'requirement',
      question: Q, picked: AFFIRM, nowTs: 999, advance: true, dialogRef: 'pc-A',
    })

    expect(out.advanced).toBe(true)
    expect(events).toEqual(['stop-cleared', 'status-changed'])
    expect(cur().status).toBe('design')
    expect(isAwaitingConfirmStop(cur())).toBe(false)
  })

  it('推进成功 ⇒ 补发驱动 0 次（推进那次写已由 requirement-moved 驱动，再补会起第二轮）', async () => {
    await seed(rec())
    await enterAwaiting('pc-A')

    const out = await applyConfirmDecision(depsOf(), {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'requirement',
      question: Q, picked: AFFIRM, nowTs: 999, advance: true, dialogRef: 'pc-A',
    })

    expect(out.advanced).toBe(true)
    expect(notified).toEqual([])
  })

  it('不给 dialogRef ⇒ 退回旧行为（不带 ref 的 fire-and-forget 清位），不抛且仍可推进', async () => {
    await seed(rec())

    const out = await applyConfirmDecision(depsOf(), {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'requirement',
      question: Q, picked: AFFIRM, nowTs: 999, advance: true,
    })

    expect(out.advanced).toBe(true)
    expect(cur().status).toBe('design')
  })
})

describe('TC-4 补发条件：只在「没真的推进」时补一次（FR-2）', () => {
  it('被设计完整性门（G2）拦下 ⇒ advanced=false 且补发恰 1 次', async () => {
    // design → decomposing 要过 G2；工作区里没有任何 design 文档 ⇒ 门拦下（不抛）。
    await seed(rec({
      status: 'design',
      statusHistory: [
        { status: 'draft', at: 1, by: { kind: 'human' } },
        { status: 'brainstorming', at: 2, by: { kind: 'human' } },
        { status: 'design', at: 3, by: { kind: 'human' } },
      ],
      artifacts: [{
        stage: 'design', kind: 'design',
        path: 'docs/requirements/' + REQ + '/design/architecture.md', registeredAt: 1,
      } as StageArtifact],
    }))

    const out = await applyConfirmDecision(depsOf(), {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'design',
      question: '设计文档已提交，请确认', picked: AFFIRM, nowTs: 999, advance: true, dialogRef: 'pc-B',
    })

    expect(out.advanced).toBe(false)
    expect(notified).toEqual([REQ])
    expect(cur().status).toBe('design')
  })

  it('reject 抛错 ⇒ 先补发恰 1 次、再原样上抛（finally 兜底口径）', async () => {
    await seed(rec())

    await expect(applyConfirmDecision(depsOf(), {}, {
      requirementId: 'REQ-not-in-ledger', windowKey: W, target: 'artifact', kind: 'requirement',
      question: Q, picked: AFFIRM, nowTs: 999, advance: true,
    })).rejects.toThrow(/不在台账中/)

    expect(notified).toEqual(['REQ-not-in-ledger'])
  })

  it('推进目标不存在（终态/不可推进）⇒ 不推进也不抛，补发恰 1 次', async () => {
    await seed(rec({
      status: 'accepting',
      statusHistory: [
        { status: 'draft', at: 1, by: { kind: 'human' } },
        { status: 'accepting', at: 2, by: { kind: 'human' } },
      ],
      artifacts: [{
        stage: 'accepting', kind: 'verification',
        path: 'docs/requirements/' + REQ + '/verification.md', registeredAt: 1,
      } as StageArtifact],
    }))

    const out = await applyConfirmDecision(depsOf(), {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'verification',
      question: '验收材料已提交，请裁决', picked: AFFIRM, nowTs: 999, advance: true,
    })

    expect(out.advanced).toBe(false)
    expect(notified).toEqual([REQ])
  })
})

describe('TC-5 同需求第二票在场 ⇒ 停手位不得被清（FR-1 边界）', () => {
  it('清 A 票后停手位保持 awaiting-confirm:B；清 B 票后才置 healthy', async () => {
    await seed(rec())
    await enterAwaiting('pc-A')
    await enterAwaiting('pc-B')
    expect(awaitingRefOf(cur())).toBe('pc-B')

    await exitAwaitingConfirm(
      { store, dialogs: registry, now: () => 1_000_000 },
      { requirementId: REQ, ref: 'pc-A', reason: 'board' },
    )

    expect(registry.inFlightFor(REQ)).toBe(true)          // B 还在等
    expect(isAwaitingConfirmStop(cur())).toBe(true)       // 停手位保持
    expect(awaitingRefOf(cur())).toBe('pc-B')

    await exitAwaitingConfirm(
      { store, dialogs: registry, now: () => 1_000_000 },
      { requirementId: REQ, ref: 'pc-B', reason: 'board' },
    )

    expect(isAwaitingConfirmStop(cur())).toBe(false)
  })
})
