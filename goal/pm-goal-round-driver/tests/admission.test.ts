/**
 * 投递纪律：预留 → 认领 → 准入；取消/失效**永不计数**；检查点前置；发失败清预留。
 * 这些用例逐条对应旧驱动踩过的事故形态（竞态、伪造消息、旧 revision）。
 */
import { describe, it, expect, vi } from 'vitest'
import {
  reserve, claim, discard, markStale, admit, release, deliverRound,
  type DeliveryPorts, type DeliveryState,
} from 'pm-goal-round-driver/admission.js'

function ports(): DeliveryPorts & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { create: [], deliver: [], admit: [], checkpoint: [] }
  return {
    calls,
    createRoundMessage: (i) => {
      calls.create.push(i)
      return { message: { content: 'round-' + i.round, source: { kind: 'dive', requirementId: i.requirementId, revision: i.revision, round: i.round } }, messageId: 'm' + i.round }
    },
    deliverMessage: (_w, _m) => { calls.deliver.push(1); return { delivered: true } },
    checkpoint: async () => { calls.checkpoint.push(1) },
    persistAdmission: (r, round) => { calls.admit.push([r, round]) },
    contentOf: (m) => (m as { content?: unknown }).content,
    now: () => 1_000,
  }
}

const input = { windowKey: 'W-1', requirementId: 'REQ-x', revision: 7, roundsInStage: 2, text: 'prompt' }

describe('预留（reserve）：纯、单飞、回合号接续', () => {
  it('回合号 = roundsInStage + 1；只允许一个在飞', () => {
    const s: DeliveryState = { competingQueued: false, needsCheckpoint: false, stopping: false }
    const a = reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm3', content: 'c' })
    expect(a).toMatchObject({ round: 3, phase: 'queued', cancelled: false, stale: false })
    s.attempt = a
    expect(reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm4', content: 'c' })).toBeUndefined()
  })

  it('teardown 后（stopping）拒绝预留', () => {
    const s: DeliveryState = { competingQueued: false, needsCheckpoint: false, stopping: true }
    expect(reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm', content: 'c' })).toBeUndefined()
  })
})

describe('认领（claim）：只认逐字相同的 queued（伪造/旧消息不认）', () => {
  function queued() {
    const s: DeliveryState = { competingQueued: false, needsCheckpoint: false, stopping: false }
    s.attempt = reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm3', content: 'c' })!
    return s
  }
  const good = { content: 'c', source: { kind: 'dive', requirementId: 'REQ-x', revision: 7, round: 3 } }

  it('内容 + 来源 + 回合号三者齐 → 认领', () => {
    const s = queued()
    expect(claim(s, good)).toBe(true)
    expect(s.attempt?.phase).toBe('claimed')
  })

  it('内容被改过 → 不认领（内容不变量）', () => {
    expect(claim(queued(), { ...good, content: '被改过' })).toBe(false)
  })

  it('来源不是 dive 回合 → 不认领', () => {
    expect(claim(queued(), { ...good, source: { kind: 'user' } })).toBe(false)
  })

  it('回合号对不上 → 不认领', () => {
    expect(claim(queued(), { ...good, source: { ...good.source, round: 9 } })).toBe(false)
  })

  it('重复认领（已 claimed）→ 不再改相位', () => {
    const s = queued()
    expect(claim(s, good)).toBe(true)
    expect(claim(s, good)).toBe(false)
  })
})

describe('作废与准入：只有 admitted 计数', () => {
  function claimed() {
    const s: DeliveryState = { competingQueued: false, needsCheckpoint: false, stopping: false }
    s.attempt = reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm3', content: 'c' })!
    s.attempt.phase = 'claimed'
    return s
  }

  it('准入：admitted + 落计数一次', () => {
    const p = ports(); const s = claimed()
    expect(admit(s, p)).toBe(true)
    expect(p.calls.admit).toEqual([['REQ-x', 3]])
    expect(s.attempt).toBeUndefined()
  })

  it('未认领（queued）不得准入（假回合不可计数）', () => {
    const p = ports()
    const s: DeliveryState = { competingQueued: false, needsCheckpoint: false, stopping: false }
    s.attempt = reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm3', content: 'c' })!
    expect(admit(s, p)).toBe(false)
    expect(p.calls.admit).toEqual([])
  })

  it('被丢弃 / 已失效 → 永不计数', () => {
    const p = ports()
    const s1 = claimed(); discard(s1)
    expect(s1.attempt).toBeUndefined()
    const s2 = claimed(); expect(markStale(s2, 8)).toBe(true)
    expect(admit(s2, p)).toBe(false)
    expect(p.calls.admit).toEqual([])
  })

  it('revision 没变 → 不判失效', () => {
    const s = claimed()
    expect(markStale(s, 7)).toBe(false)
    expect(s.attempt?.stale).toBe(false)
  })

  it('release：清预留并交回（取消路径不回计数）', () => {
    const s = claimed()
    expect(release(s)).toMatchObject({ phase: 'claimed' })
    expect(s.attempt).toBeUndefined()
  })
})

describe('deliverRound：检查点前置 → 造预留 → 发消息', () => {
  const state = (): DeliveryState => ({ competingQueued: false, needsCheckpoint: false, stopping: false })

  it('正常投递：预留落在台账计数 +1 上', async () => {
    const p = ports()
    const out = await deliverRound(p, state(), input)
    expect(out).toMatchObject({ kind: 'delivered' })
    expect((out as { reservation: { round: number } }).reservation.round).toBe(3)
  })

  it('检查点失败 → 不投递（耐久义务未兑现）', async () => {
    const p = ports()
    p.checkpoint = vi.fn(async () => { throw new Error('store down') })
    const s = state(); s.needsCheckpoint = true
    expect((await deliverRound(p, s, input)).kind).toBe('checkpoint-failed')
    expect(p.calls.create).toEqual([])
  })

  it('发失败 → 清预留并把原因交回（调用方据此停手）', async () => {
    const p = ports()
    p.deliverMessage = () => ({ delivered: false, reason: 'queue-failed' })
    const s = state()
    const out = await deliverRound(p, s, input)
    expect(out).toEqual({ kind: 'deliver-failed', reason: 'queue-failed' })
    expect(s.attempt).toBeUndefined()
  })

  it('已有在飞预留 → 让位（不投第二轮）', async () => {
    const p = ports()
    const s = state()
    s.attempt = reserve(s, { requirementId: 'REQ-x', revision: 7, roundsInStage: 2, messageId: 'm3', content: 'c' })
    expect((await deliverRound(p, s, input)).kind).toBe('deliver-failed')
    expect(p.calls.create).toEqual([])
  })
})
