/**
 * 挂起确认判定口径单点（REQ-260927123256-196b t-f8ed18 · serves: FR-4）。
 *
 * 锁三件事，别退化：
 *   - `targetConfirmedInLedger` 是「台账是否已落章」的**唯一**判定处（plan=approvedAt /
 *     artifact=该 kind 成组 confirmedAt）——守卫与回执共用同一份口径；
 *   - `markInterrupted` 幂等（只写首次），未知 ticket 返回 undefined 且不抛；
 *   - 过期基准 = `interruptedAt ?? createdAt`：中止记录再获一个完整 TTL，不因登记早而提前失效。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect } from 'vitest'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { artifactNotifyText } from '../src/application/internal/artifact-gates.js'
import {
  PENDING_CONFIRM_BLOCKED_TOOLS,
  PENDING_CONFIRM_RECOVERY,
  hasConfirmGateOf,
  hasConfirmableArtifactOf,
  isConfirmGateKind,
  livePendingConfirm,
  pendingConfirmFactsOf,
  pendingConfirmRejectMessage,
  targetConfirmedInLedger,
} from '../src/application/internal/pending-guard.js'
import type { PendingConfirmation, RequirementRecord } from '../src/shared/protocol.js'
import type { UseCaseDeps } from '../src/application/ports.js'

const W = 'session-w-001'

/** 只给判定用到的字段（targetConfirmedInLedger 只读 plan / artifacts）。 */
function reqOf(id: string, patch: Partial<RequirementRecord> = {}): RequirementRecord {
  return { id, title: id, description: '', status: 'design', blocked: false, comments: [], version: 1, createdAt: 0, updatedAt: 0, ...patch } as unknown as RequirementRecord
}

function depsOf(registry: PendingConfirmRegistry, requirements: RequirementRecord[]): UseCaseDeps {
  // B12 阶段⑤：读点走新端口 ⇒ 用给定的记录现搭一个 store（原先经旧单册的 snapshot 读）
  return { pendingConfirms: registry, store: makeTestStore({ requirements }) } as unknown as UseCaseDeps
}

function rec(overrides: Partial<PendingConfirmation> = {}): PendingConfirmation {
  return {
    ticket: 'pc-000001',
    windowKey: W,
    requirementId: 'REQ-x',
    target: 'artifact',
    kind: 'requirement',
    createdAt: 0,
    ...overrides,
  }
}

describe('targetConfirmedInLedger：台账落章判定单点（FR-4）', () => {
  it('target=plan：approvedAt 已写 → true；未批准 → false', () => {
    expect(targetConfirmedInLedger(reqOf('REQ-x', { plan: { approvedAt: 1 } as never }), rec({ target: 'plan' }))).toBe(true)
    expect(targetConfirmedInLedger(reqOf('REQ-x', { plan: {} as never }), rec({ target: 'plan' }))).toBe(false)
    expect(targetConfirmedInLedger(reqOf('REQ-x'), rec({ target: 'plan' }))).toBe(false)
  })

  it('target=artifact：该 kind 成组 confirmedAt 已写 → true；缺一 / 无该 kind → false', () => {
    const stamped = reqOf('REQ-x', { artifacts: [{ kind: 'requirement', confirmedAt: 1 }] as never })
    expect(targetConfirmedInLedger(stamped, rec())).toBe(true)
    const partial = reqOf('REQ-x', { artifacts: [{ kind: 'requirement', confirmedAt: 1 }, { kind: 'requirement' }] as never })
    expect(targetConfirmedInLedger(partial, rec())).toBe(false)
    const otherKind = reqOf('REQ-x', { artifacts: [{ kind: 'design', confirmedAt: 1 }] as never })
    expect(targetConfirmedInLedger(otherKind, rec())).toBe(false)
  })
})

describe('markInterrupted / 过期基准（FR-4）', () => {
  it('未知 ticket 返回 undefined 且不抛', () => {
    const registry = new PendingConfirmRegistry({ now: () => 0 })
    expect(registry.markInterrupted('pc-nope')).toBeUndefined()
  })

  it('幂等：二次调用不改 interruptedAt（只写首次）', () => {
    let now = 10
    const registry = new PendingConfirmRegistry({ now: () => now, ttlMs: 1000, newTicket: () => 'pc-000001' })
    registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'plan' })
    expect(registry.markInterrupted('pc-000001')?.interruptedAt).toBe(10)
    now = 20
    expect(registry.markInterrupted('pc-000001')?.interruptedAt).toBe(10)
    now = 30
    expect(registry.get('pc-000001', W)?.interruptedAt).toBe(10)
  })

  it('过期基准 = interruptedAt ?? createdAt：createdAt 早于中止时间也不提前失效', () => {
    let now = 0
    const registry = new PendingConfirmRegistry({ now: () => now, ttlMs: 100, newTicket: () => 'pc-000001' })
    registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'plan' })
    now = 90 // 仍在中止有效期内（90 <= 100）
    expect(registry.markInterrupted('pc-000001')?.interruptedAt).toBe(90)
    now = 150 // 以 createdAt 为基准早该过期（150 > 100）；以 interruptedAt 为基准仍有效（60 <= 100）
    expect(registry.get('pc-000001', W)?.ticket).toBe('pc-000001')
    expect(registry.pendingForWindow(W)?.ticket).toBe('pc-000001')
    now = 191 // interruptedAt + ttl = 190 → 过期
    expect(registry.get('pc-000001', W)).toBeUndefined()
    expect(registry.pendingForWindow(W)).toBeUndefined()
  })
})

describe('livePendingConfirm：过滤已 settle / 已过期 / 台账已落章（FR-2 / FR-4）', () => {
  it('台账已落章 → 放行（返回 undefined）；未落章 → 仍拦', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    const p = registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'artifact', kind: 'requirement' })
    expect((await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [{ kind: 'requirement' }] as never })]), W))?.ticket).toBe(p.ticket)
    expect(await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [{ kind: 'requirement', confirmedAt: 1 }] as never })]), W)).toBeUndefined()
  })

  it('已 settle → undefined；台账查不到需求 → 保守仍拦', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    const p = registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'plan' })
    // 「台账查不到需求」正是本用例的前提：空需求册
    expect((await livePendingConfirm(depsOf(registry, []), W))?.ticket).toBe(p.ticket)
    registry.settle(p.ticket, { confirmed: false, advanced: false })
    expect(await livePendingConfirm(depsOf(registry, []), W)).toBeUndefined()
  })

  it('未装配端口（deps.pendingConfirms 缺省）→ undefined', async () => {
    expect(await livePendingConfirm({} as UseCaseDeps, W)).toBeUndefined()
  })

  // ── REQ-261005200052-ce40 FR-2：无门 / 无产物的票不拦（谓词④⑤）───────────────────
  it('无门的票（kind=prototype）→ 放行（拦的东西不是门）', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'artifact', kind: 'prototype' })
    expect((await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [{ kind: 'prototype' }] as never })]), W))).toBeUndefined()
    // 门值域里没有 prototype——这张票连"有门"都不成立，产物在不在册都一样放行
    expect(isConfirmGateKind('prototype')).toBe(false)
    expect(isConfirmGateKind('verification')).toBe(true)
    expect(hasConfirmGateOf(rec({ kind: 'prototype' }))).toBe(false)
    expect(hasConfirmGateOf(rec({ target: 'plan' }))).toBe(true)
    expect(hasConfirmableArtifactOf(reqOf('REQ-x'), rec({ kind: 'requirement' }))).toBe(false)
    expect(hasConfirmableArtifactOf(reqOf('REQ-x', { artifacts: [{ kind: 'requirement' }] as never }), rec({ kind: 'requirement' }))).toBe(true)
  })

  it('有门且产物在册未落章 → 仍拦（真门不放宽）', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    const p = registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'artifact', kind: 'verification' })
    const live = await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [{ kind: 'verification' }] as never })]), W)
    expect(live?.ticket).toBe(p.ticket)
  })

  it('有门但台账无该 kind 产物 → 放行（没东西可落章，人点看板也答不了）', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'artifact', kind: 'requirement' })
    expect(await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [] as never })]), W)).toBeUndefined()
    expect(await livePendingConfirm(depsOf(registry, [reqOf('REQ-x')]), W)).toBeUndefined()
  })

  it('读时谓词：产物登记后同一张票恢复拦截（不是一次性作废）', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    const p = registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'artifact', kind: 'requirement' })
    // 产物尚未登记 → 放行
    expect(await livePendingConfirm(depsOf(registry, [reqOf('REQ-x')]), W)).toBeUndefined()
    // 产物被登记/自动发现之后 → 同一张票立刻恢复拦截
    const live = await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { artifacts: [{ kind: 'requirement' }] as never })]), W)
    expect(live?.ticket).toBe(p.ticket)
  })

  it('target=plan：无计划放行 / 有计划仍拦', async () => {
    const registry = new PendingConfirmRegistry({ now: () => 0, ttlMs: 1000 })
    const p = registry.register({ windowKey: W, requirementId: 'REQ-x', target: 'plan' })
    expect(await livePendingConfirm(depsOf(registry, [reqOf('REQ-x')]), W)).toBeUndefined()
    const live = await livePendingConfirm(depsOf(registry, [reqOf('REQ-x', { plan: {} as never })]), W)
    expect(live?.ticket).toBe(p.ticket)
  })

  it('文案常量：blocked_tools 四条写路径；recovery 只列取回执与看板两条（不再列「重新发起覆盖」）', () => {
    expect([...PENDING_CONFIRM_BLOCKED_TOOLS]).toEqual(['reqboard_submit', 'reqboard_decompose', 'reqboard_move', 'reqboard_task_move'])
    expect(PENDING_CONFIRM_RECOVERY).toContain('收到作答前不得产出下游产物')
    expect(PENDING_CONFIRM_RECOVERY).toContain('reqboard_confirm_receipt')
    expect(PENDING_CONFIRM_RECOVERY).toContain('看板')
    const msg = pendingConfirmRejectMessage(rec({ ticket: 'pc-abc123', requirementId: 'REQ-x' }))
    expect(msg).toContain('pc-abc123')
    expect(msg).toContain('REQ-x')
    expect(msg).toContain('收到作答前不得产出下游产物')
    expect(msg).toContain('reqboard_confirm_receipt(ticket="pc-abc123")')
    expect(msg).toContain('看板')
    // REQ-261006164732-6503 t9 口径修正：删掉「重新发起 … 覆盖旧记录」——那句是双框事故里
    // agent 照做的第三条文案源，而"覆盖"的真实行为就是再开一个框（与同门唯一直接冲突）。
    expect(msg).not.toContain('覆盖旧记录')
    expect(msg).not.toContain('reqboard_ask_confirm')
  })
})

describe('诊断投影与文案只列真实出路（REQ-261005200052-ce40 FR-3 / FR-4）', () => {
  /** 固定时刻：让「失效时刻 / 剩余分钟」可断言（facts 是纯函数，时间由入参决定）。 */
  const NOW = 0

  it('无门的票（prototype）：facts.gate=false，原文不列看板与覆盖（它们都走不通）', () => {
    const req = reqOf('REQ-x', { status: 'brainstorming', artifacts: [{ kind: 'prototype' }] as never })
    const p = rec({ kind: 'prototype' })
    const facts = pendingConfirmFactsOf(req, p, NOW)
    const msg = pendingConfirmRejectMessage(p, facts)
    expect(facts.gate).toBe(false)
    expect(msg).not.toContain('看板点确认')
    expect(msg).not.toContain('重新发起')
    expect(msg).toContain('不是确认门')
    expect(msg).toContain('可用出路')
  })

  it('有门但无产物：原文指向「先登记产物」，不列看板（人点也答不了）', () => {
    const req = reqOf('REQ-x', { status: 'brainstorming' })
    const p = rec({ kind: 'requirement' })
    const facts = pendingConfirmFactsOf(req, p, NOW)
    const msg = pendingConfirmRejectMessage(p, facts)
    expect(facts.gate).toBe(true)
    expect(facts.artifactCount).toBe(0)
    expect(msg).not.toContain('看板点确认')
    expect(msg).toContain('先登记产物')
  })

  it('真门票（verification，产物在册）：原文含看板出路与失效时刻', () => {
    const req = reqOf('REQ-x', { status: 'design', artifacts: [{ kind: 'verification' }] as never })
    const p = rec({ kind: 'verification' })
    const facts = pendingConfirmFactsOf(req, p, NOW)
    const msg = pendingConfirmRejectMessage(p, facts)
    expect(facts.gate).toBe(true)
    expect(facts.artifactCount).toBe(1)
    expect(facts.expiresAt).toBe(NOW + 30 * 60 * 1000)
    expect(msg).toContain('看板点确认')
    expect(msg).toContain('自动失效')
    expect(msg).toContain('需求状态 design')
  })

  it('目标需求已归档：不列「重新发起覆盖」（必失败），并写明 agent 侧无解', () => {
    const req = reqOf('REQ-x', { status: 'archived', artifacts: [{ kind: 'verification' }] as never })
    const p = rec({ kind: 'verification' })
    const facts = pendingConfirmFactsOf(req, p, NOW)
    const msg = pendingConfirmRejectMessage(p, facts)
    expect(msg).not.toContain('重新发起')
    expect(msg).toContain('终态')
    expect(msg).toContain('无法覆盖')
  })

  it('facts 缺省时拒绝原文保持旧文案骨架（REQ-261006164732-6503 t9 口径修正：末条出路已删）', () => {
    const msg = pendingConfirmRejectMessage(rec({ ticket: 'pc-legacy', requirementId: 'REQ-x' }))
    expect(msg).toContain('解除挂起：①')
    // 口径修正：③「重新发起 … 覆盖旧记录」被删除（它指向的动作就是再开一个框）
    expect(msg).not.toContain('③ 或重新发起 reqboard_ask_confirm')
    expect(msg).toContain('② 或在项目看板点确认按钮。')
  })

  it('登记通知门感知：无门产物不写「确认入口」，有门产物照旧写（FR-4）', () => {
    const req = { id: 'REQ-x', title: '通知' } as unknown as RequirementRecord
    const proto = artifactNotifyText(req, { stage: 'brainstorming', kind: 'prototype', path: 'p/detail.html' } as never)
    expect(proto).not.toContain('一键确认')
    expect(proto).toContain('无需人工确认')
    const requirement = artifactNotifyText(req, { stage: 'brainstorming', kind: 'requirement', path: 'r/requirement.md' } as never)
    expect(requirement).toContain('确认入口')
    expect(requirement).toContain('一键确认')
  })
})
