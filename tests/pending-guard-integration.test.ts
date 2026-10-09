// serves: FR-2, FR-4
/**
 * 挂起确认契约的**接口联调**（REQ-260927123256-196b t1 · integrate 阶段）。
 *
 * 与 `pending-guard.test.ts`（单模块单测）的分工：本文件只跑**跨模块接缝**，验证三跳联通后
 * 「请求样例 → 期望响应」逐字一致：
 *
 *   ① adapter → shared/protocol → use-case：
 *      `PendingConfirmRegistry.markInterrupted` 写的 `interruptedAt`（protocol 字段）经真实
 *      `reqboard_ask_confirm(ticket=…)` 工具（ConfirmReceipt 用例）取回执，note 改为「本次等待已被中止」；
 *   ② pending-guard 共享谓词与真实台账联动：
 *      `livePendingConfirm` 未落章仍拦 / 台账落章即放行；同一份 `targetConfirmedInLedger` 同时驱动
 *      回执的 `confirmed`（判定口径只留一处，不再两处拷贝漂移）；
 *   ③ 过期基准 `(interruptedAt ?? createdAt) + ttlMs` 经真实工具返回码验证：
 *      中止记录再获一个完整 TTL；过期后回执按 E-5 抛 `REQBOARD_UNKNOWN_TICKET`。
 *
 * 每个用例上方写出「请求样例」与「期望响应」，断言用 `toEqual` 全键对账（多键/少键都算不通过）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileHostFs } from '../src/adapters/FileHostFs.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { defineAskConfirmTool } from '../src/tools/index.js'
import { livePendingConfirm, pendingConfirmFactsOf, targetConfirmedInLedger } from '../src/application/internal/pending-guard.js'
import { defineStatusTool } from '../src/tools/index.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

/**
 * FR-2（REQ-261007220012-bd29）：取回执路径并入 ask_confirm(ticket)——
 * 原独立回执工具已删除，本 helper 提供等价入口（传 ticket → ConfirmReceipt 用例）。
 */
const receiptToolOf = (deps: unknown): any => defineAskConfirmTool(deps as never)

const W = 'session-pending-guard-001'
const REQUIREMENT_ID = 'REQ-abc123'
const exec = { agent: { id: W } }

/** 中止且未作答时的回执文案（interfaces.md I-6 的唯一允许差异）。 */
const INTERRUPTED_NOTE =
  '回执：本次等待已被中止（弹框可能已消失）——尚未作答。请用户走项目看板点确认按钮，'
  + '或重新发起 reqboard_ask_confirm；收到作答前不得产出下游产物'
/** 未中止、未作答时的既有文案（FR-6：逐字不变）。 */
const PLAIN_PENDING_NOTE = '回执：挂起确认尚未作答——人作答后后台自动落章/推进；也可请用户走看板确认'

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-guard-int-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 真适配器 + 可控注册表；`now` 由用例注入以驱动 TTL（时钟可注入，便于对账「可用出路」里的失效时刻）。 */
function makeDeps(registry: PendingConfirmRegistry, now: () => number = () => Date.now()): UseCaseDeps {
  return {
    store: store,
    docs: new FileDocRepository({ workspaceRoot: dir }),
    // REQ-261008020617-088f RF-3：hostFs 必填（强转构造的夹具最容易漏）
    hostFs: new FileHostFs(),
    clock: { now },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => ({ ask: () => new Promise(() => {}) })),
    doneThrottleMs: 0,
    pendingConfirms: registry,
  } as unknown as UseCaseDeps
}

/** 台账 seed：brainstorming 节点、requirement 产物**未落章**（挂起确认的目标）。 */
async function seed(): Promise<void> {
  const r = {
    id: REQUIREMENT_ID, title: '挂起确认联调', description: '', status: 'brainstorming', blocked: false,
    sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'brainstorming', at: 2, by: { kind: 'human' } },
    ],
    artifacts: [{
      stage: 'brainstorming', kind: 'requirement',
      path: 'docs/requirements/REQ-abc123/requirement.md', registeredAt: 1,
    } as StageArtifact],
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/**
 * 期望后缀的**单点**算法（REQ-261005200052-ce40 FR-3）：与实现共用 `pendingConfirmFactsOf`，
 * 时钟与注册表同拍（1_000）——锁的是「回执确实带上了可用出路」，前缀文案仍由上面的独立常量锁死。
 */
function factsOf(ticket: string): ReturnType<typeof pendingConfirmFactsOf> {
  const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => ticket })
  const rec = registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' })
  const req = store.peekAll()[0] as RequirementRecord
  return pendingConfirmFactsOf(req, rec, 1_000)
}

const receiptTool = (deps: UseCaseDeps) =>
  receiptToolOf(deps) as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }

describe('联调 ① adapter(interruptedAt) → 回执（I-4 → I-6）', () => {
  it('请求 ask_confirm({ticket})｜被中止且未作答 → 返回体全键等于期望（含被中止文案）', async () => {
    await seed()
    const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => 'pc-int001' })
    const deps = makeDeps(registry, () => 1_000)
    // 前置：阻塞等待期间被中止（t2 的中止分支将调用的同一接缝）
    const ticket = registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' }).ticket
    expect(registry.markInterrupted(ticket)?.interruptedAt).toBe(1_000)

    // 请求样例
    const out = await receiptTool(deps).execute({ ticket }, exec)

    // 期望响应（全键对账）
    expect(out).toEqual({
      success: true,
      confirmed: false,
      advanced: false,
      from: 'brainstorming',
      to: 'brainstorming',
      requirement_id: REQUIREMENT_ID,
      note: INTERRUPTED_NOTE + '。可用出路：' + factsOf('pc-int001').usableRecovery.join('；'),
    })
  })

  it('联动回归：未调 markInterrupted 时文案逐字不变（FR-6 兼容性）', async () => {
    await seed()
    const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => 'pc-int002' })
    const deps = makeDeps(registry, () => 1_000)
    const ticket = registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' }).ticket

    const out = await receiptTool(deps).execute({ ticket }, exec)
    expect(out.note).toBe(PLAIN_PENDING_NOTE + '。可用出路：' + factsOf('pc-int002').usableRecovery.join('；'))
    expect(out).toEqual({
      success: true, confirmed: false, advanced: false,
      from: 'brainstorming', to: 'brainstorming', requirement_id: REQUIREMENT_ID,
      note: expect.stringContaining(PLAIN_PENDING_NOTE),
    })
  })
})

describe('联调 ② 共享谓词 ↔ 真实台账（I-3/I-4 判定口径只留一处）', () => {
  it('未落章：livePendingConfirm 仍拦；确认后再查 → 放行，且回执 confirmed=true（同一口径）', async () => {
    await seed()
    const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => 'pc-int003' })
    const deps = makeDeps(registry)
    const ticket = registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' }).ticket
    registry.markInterrupted(ticket)

    // 未落章 → 记录仍在（守卫拦）
    expect((await livePendingConfirm(deps, W))?.ticket).toBe(ticket)

    // 人在看板/证据通道作答 → 台账该 kind 成组落章
    await store.mutate(store.peekAll()[0]!.id, (r) => {
      r.artifacts![0]!.confirmedAt = 5_000
      return { changed: true }
    })
    const req = store.peekAll()[0]!
    expect(targetConfirmedInLedger(req, registry.get(ticket, W)!)).toBe(true)
    expect(await livePendingConfirm(deps, W)).toBeUndefined()

    // 同一事实驱动回执：confirmed=true、未推进（无 statusHistory 推进事件）
    const out = await receiptTool(deps).execute({ ticket }, exec)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out).toEqual({
      success: true, confirmed: true, advanced: false,
      from: 'brainstorming', to: 'brainstorming', requirement_id: REQUIREMENT_ID,
      note: '回执：已确认（未推进；推进被闸门拦下或当前状态无可自动推进的下一阶段）——以台账 confirmedAt 为准',
    })
  })

  it('窗口隔离：跨窗口 ticket 对 livePendingConfirm 与回执都不可见', async () => {
    await seed()
    const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => 'pc-int004' })
    const deps = makeDeps(registry)
    const ticket = registry.register({ windowKey: 'session-other', requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' }).ticket
    expect(await livePendingConfirm(deps, W)).toBeUndefined()
    await expect(receiptTool(deps).execute({ ticket }, exec)).rejects.toMatchObject({ code: 'REQBOARD_UNKNOWN_TICKET' })
  })
})

describe('联调 ③ 过期基准 (interruptedAt ?? createdAt)+ttl 经真实工具返回码（I-4 → E-5）', () => {
  it('中止记录再获完整 TTL：createdAt 已过期仍可取回执；越过 interruptedAt+ttl 才报 REQBOARD_UNKNOWN_TICKET', async () => {
    await seed()
    let now = 1_000
    const registry = new PendingConfirmRegistry({ now: () => now, ttlMs: 1_000, newTicket: () => 'pc-int005' })
    const deps = makeDeps(registry)
    const ticket = registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' }).ticket

    now = 1_900 // 距 createdAt 900ms
    registry.markInterrupted(ticket) // interruptedAt = 1900

    now = 2_500 // createdAt+ttl=2000 已过；interruptedAt+ttl=2900 未到
    const out = await receiptTool(deps).execute({ ticket }, exec)
    // 可用出路后缀带墙钟失效时刻（本用例时钟是真 Date.now），故前缀精确断言 + 新内容在场
    expect(out.note).toContain(INTERRUPTED_NOTE)
    expect(out.note).toContain('可用出路')
    expect(out.note).toContain('自动失效')

    now = 2_901 // interruptedAt + ttl 越界
    expect(registry.get(ticket, W)).toBeUndefined()
    expect(registry.pendingForWindow(W)).toBeUndefined()
    expect(await livePendingConfirm(deps, W)).toBeUndefined()
    await expect(receiptTool(deps).execute({ ticket }, exec)).rejects.toMatchObject({ code: 'REQBOARD_UNKNOWN_TICKET' })
  })

  it('markInterrupted 未知 ticket：经端口返回 undefined 且不抛（I-4 契约）', () => {
    const registry = new PendingConfirmRegistry({ now: () => 1_000 })
    expect(registry.markInterrupted('pc-does-not-exist')).toBeUndefined()
  })
})

describe('联调 ④ 组合根接缝：adapter 实现 application 端口（I-4）', () => {
  it('PendingConfirmRegistry 运行时满足 PendingConfirmPort 全部 5 个方法（index.ts 装配同一实例）', () => {
    const registry = new PendingConfirmRegistry({ now: () => 1_000 }) as unknown as Record<string, unknown>
    for (const method of ['register', 'get', 'settle', 'pendingForWindow', 'markInterrupted']) {
      expect(typeof registry[method], method).toBe('function')
    }
  })
})

describe('联调 ④ reqboard_status 的挂起确认投影（FR-3 追加键）', () => {
  it('pending_confirms[] 带 requirement_status / gate / artifact_count / expires_at / usable_recovery，旧键逐字未变', async () => {
    await seed()
    const registry = new PendingConfirmRegistry({ now: () => 1_000, newTicket: () => 'pc-int003' })
    const deps = makeDeps(registry, () => 1_000)
    registry.register({ windowKey: W, requirementId: REQUIREMENT_ID, target: 'artifact', kind: 'requirement' })

    const out = await (defineStatusTool(deps) as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> })
      .execute({}, exec)
    const rows = out.pending_confirms as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // 旧键逐字未变
    expect(row.ticket).toBe('pc-int003')
    expect(row.requirement_id).toBe(REQUIREMENT_ID)
    expect(row.target).toBe('artifact')
    expect(row.kind).toBe('requirement')
    expect(row.created_at).toBe(1_000)
    expect(row.interrupted).toBe(false)
    expect(row.blocked_tools).toEqual(['reqboard_submit', 'reqboard_decompose', 'reqboard_move', 'reqboard_task_move'])
    // 新键在场且同源
    expect(row.requirement_status).toBe('brainstorming')
    expect(row.gate).toBe(true)
    expect(row.artifact_count).toBe(1)
    expect(row.expires_at).toBe(1_000 + 30 * 60 * 1000)
    expect(Array.isArray(row.usable_recovery)).toBe(true)
    expect(String(row.recovery)).toContain('可用出路')
  })
})
