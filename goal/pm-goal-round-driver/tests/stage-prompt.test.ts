/**
 * 阶段裁决弹框（FR-8）：条件 / 在途 / 冷却 / 上限 / 指纹变化 / 永不抛。
 * 边界与旧 gate-prompt 同口径（冷却 5min、上限 2 次、到顶留痕停手）。
 */
import { describe, it, expect, vi } from 'vitest'
import {
  planStagePrompt, proposeStageDone, stageDoneQuestion, STAGE_PROMPT_COOLDOWN_MS, STAGE_PROMPT_MAX_POPS,
  type StagePromptFacts, type StagePromptPorts,
} from 'pm-goal-round-driver/stage-prompt.js'

const NOW = 1_000_000_000
const facts: StagePromptFacts = {
  requirementId: 'REQ-x', stage: 'implementing', stageReadyToClose: true, fingerprint: 'fp-1',
}

describe('planStagePrompt · 判据顺序', () => {
  const opts = (history: { pops: number; lastAskedAt?: number; lastFingerprint?: string }, now = NOW) => ({
    now, history,
  })

  it('判据未满足 → not-ready（不起框）', () => {
    expect(planStagePrompt({ ...facts, stageReadyToClose: false }, opts({ pops: 0 })))
      .toEqual({ kind: 'skip', reason: 'not-ready' })
  })

  it('已有人在等 → already-awaiting（不重复弹）', () => {
    expect(planStagePrompt({ ...facts, awaitingHuman: true }, opts({ pops: 0 })))
      .toEqual({ kind: 'skip', reason: 'already-awaiting' })
  })

  it('同指纹 + 冷却期内 → cooldown', () => {
    expect(planStagePrompt(facts, opts({ pops: 1, lastAskedAt: NOW - 1_000, lastFingerprint: 'fp-1' })))
      .toEqual({ kind: 'skip', reason: 'cooldown' })
  })

  it('同指纹 + 超冷却 + 未到上限 → ask', () => {
    const plan = planStagePrompt(facts, opts({ pops: 1, lastAskedAt: NOW - STAGE_PROMPT_COOLDOWN_MS - 1, lastFingerprint: 'fp-1' }))
    expect(plan.kind).toBe('ask')
  })

  it('同指纹 + 达上限 → exhausted（到顶停手）', () => {
    expect(planStagePrompt(facts, opts({ pops: STAGE_PROMPT_MAX_POPS, lastAskedAt: 0, lastFingerprint: 'fp-1' })))
      .toEqual({ kind: 'skip', reason: 'exhausted' })
  })

  it('指纹变了 = 新的一次裁决：冷却与次数重新计（改完判据还能再问）', () => {
    const plan = planStagePrompt({ ...facts, fingerprint: 'fp-2' },
      opts({ pops: STAGE_PROMPT_MAX_POPS, lastAskedAt: NOW, lastFingerprint: 'fp-1' }))
    expect(plan.kind).toBe('ask')
  })

  it('问题文案把"只请人点头 / agent 不自行落章"说清', () => {
    const q = stageDoneQuestion(facts)
    expect(q).toContain('本阶段算完成吗')
    expect(q).toContain('agent 不会自行落章')
  })
})

function ports(askOk = true) {
  const calls: Record<string, unknown[]> = { ask: [], entering: [], exhausted: [], trace: [] }
  const p: StagePromptPorts = {
    ask: vi.fn(async (f: StagePromptFacts, q: string) => { calls.ask.push([f.stage, q]); return askOk }),
    enterAwaiting: (id) => { calls.entering.push(id) },
    recordExhausted: (f, pops) => { calls.exhausted.push([f.stage, pops]) },
    trace: (r, id) => { calls.trace.push([r, id]) },
    now: () => NOW,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
  }
  return { p, calls }
}

describe('proposeStageDone · 副作用顺序与边界', () => {
  it('送达：先登记在途再投框（拦住同拍起轮），并记一次', async () => {
    const { p, calls } = ports()
    const h = new Map()
    expect(await proposeStageDone(p, h, facts)).toEqual({ kind: 'asked' })
    expect(calls.entering).toEqual(['REQ-x'])
    expect(calls.ask).toHaveLength(1)
    expect(h.get('REQ-x\u0000implementing')).toMatchObject({ pops: 1, lastFingerprint: 'fp-1' })
  })

  it('冷却期内第二拍 → skipped（不重复投框）', async () => {
    const { p, calls } = ports()
    const h = new Map()
    await proposeStageDone(p, h, facts)
    expect(await proposeStageDone(p, h, facts)).toEqual({ kind: 'skipped', reason: 'cooldown' })
    expect(calls.ask).toHaveLength(1)
  })

  it('到顶 → exhausted 并留痕一次（响亮，不静默）', async () => {
    const { p, calls } = ports()
    const h = new Map()
    let now = NOW
    p.now = () => now
    await proposeStageDone(p, h, facts)
    now += STAGE_PROMPT_COOLDOWN_MS + 1
    await proposeStageDone(p, h, facts)
    now += STAGE_PROMPT_COOLDOWN_MS + 1
    expect(await proposeStageDone(p, h, facts)).toEqual({ kind: 'exhausted', reason: 'exhausted' })
    expect(calls.exhausted).toEqual([['implementing', 2]])
    expect(calls.ask).toHaveLength(2)
  })

  it('弹框抛错 → 永不抛，降级留痕（不阻断驱动）', async () => {
    const { p, calls } = ports()
    p.ask = async () => { throw new Error('no ui') }
    const h = new Map()
    expect(await proposeStageDone(p, h, facts)).toEqual({ kind: 'skipped', reason: 'undeliverable' })
    expect(calls.trace).toEqual([['stage-prompt-undeliverable', 'REQ-x']])
  })

  it('未送达不计入次数（否则会白白消耗上限）', async () => {
    const { p } = ports(false)
    const h = new Map()
    await proposeStageDone(p, h, facts)
    expect(h.get('REQ-x\u0000implementing')?.pops).toBe(0)
  })
})
