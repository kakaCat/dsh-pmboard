/**
 * t5（REQ-261007223647-da5d FR-2）单测：**取消/超时也留痕，连续取消到阈值就不再弹**。
 *
 * 治什么（2026-10-07 现场）：用户点「✖️ 不需要立项」/ 直接取消之后，插件什么都不记，
 * 于是"人明明拒绝了、agent 还弹"只能靠人抱怨才发现。现在三类交互（reject / cancel / timeout）
 * 逐条可查，且同窗口 30 分钟内连续取消到 3 次 → **不再弹框**，改提议两条替代路径。
 */
import { describe, it, expect } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { defineCaptureTool } from './helpers/tool-deps.js'
import { CAPTURE_CANCEL_ESCALATION } from '../src/application/internal/capture-rejections.js'
import type { CaptureRejection } from '../src/application/ports.js'

const W = 'session-t5'
const NOW = 1_700_000_000_000

/** 可累加的留痕假实现（record 收进数组，readAll 返回它）。 */
function ledger(seed: readonly CaptureRejection[] = []) {
  const rows: CaptureRejection[] = [...seed]
  return { rows, record: (e: CaptureRejection) => { rows.push(e) }, readAll: async () => [...rows] }
}

function makeTool(opts: { answers?: unknown; rejections?: unknown } = {}) {
  const seen = { calls: 0 }
  const svc = {
    ask: async () => {
      seen.calls++
      if (opts.answers === 'abort') throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
      if (opts.answers === 'hang') return await new Promise<never>(() => {})
      return { answers: opts.answers ?? [] }
    },
    ...(opts.answers === 'hang'
      ? { askTimed: async () => ({ kind: 'pending' }) }
      : {}),
  }
  const deps = {
    store: makeTestStore(),
    now: () => NOW,
    userQuestions: () => svc,
    ...(opts.rejections !== undefined ? { rejections: opts.rejections } : {}),
  } as never
  const tool = defineCaptureTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
  return { run: (a: unknown = {}) => tool.execute(a, { agent: { id: W } }), seen }
}

describe('t5 · 三类交互都留痕', () => {
  it('取消（ASK_ABORTED）→ 记 kind=cancel，且回执给出两条替代路径', async () => {
    const led = ledger()
    const { run } = makeTool({ answers: 'abort', rejections: led })
    const out = await run()
    expect(out.success).toBe(false)
    expect(led.rows).toEqual([{ windowKey: W, at: NOW, kind: 'cancel' }])
    expect(out.note).toContain('未作答')
    expect(out.note).toContain('看板')
  })

  it('等到点未作答（pending）→ 记 kind=timeout（不是取消、也不是拒绝）', async () => {
    const led = ledger()
    const { run } = makeTool({ answers: 'hang', rejections: led })
    const out = await run()
    expect(out.success).toBe(false)
    expect(led.rows).toEqual([{ windowKey: W, at: NOW, kind: 'timeout' }])
    expect(out.note).toContain('等待超时')
  })

  it('点 ✖️ 不需要立项 → 记 kind=reject', async () => {
    const led = ledger()
    const { run } = makeTool({ answers: [{ id: 'name', selected: ['✖️ 不需要立项'] }], rejections: led })
    await run()
    expect(led.rows).toEqual([{ windowKey: W, at: NOW, kind: 'reject' }])
  })
})

describe('t5 · 连续取消到阈值：不再弹框，改提议看板/文字', () => {
  it(`同窗口 30 分钟内已取消 ${CAPTURE_CANCEL_ESCALATION} 次 → 第四次调用**不弹框**且回执含看板路径`, async () => {
    const led = ledger([
      { windowKey: W, at: NOW - 60_000, kind: 'cancel' },
      { windowKey: W, at: NOW - 30_000, kind: 'cancel' },
      { windowKey: W, at: NOW - 10_000, kind: 'cancel' },
    ])
    const { run, seen } = makeTool({ answers: 'abort', rejections: led })
    const out = await run({ title_options: ['候选'] })
    expect(seen.calls).toBe(0) // 弹框根本没发生
    expect(out.success).toBe(false)
    expect(out.note).toContain('不再弹框')
    expect(out.note).toContain('看板')
  })

  it('只有 2 次取消 → 仍正常弹框（阈值内不升级）', async () => {
    const led = ledger([
      { windowKey: W, at: NOW - 60_000, kind: 'cancel' },
      { windowKey: W, at: NOW - 30_000, kind: 'cancel' },
    ])
    const { run, seen } = makeTool({ answers: 'abort', rejections: led })
    await run()
    expect(seen.calls).toBe(1)
  })

  it('取消不计入拒绝粘滞：旧口径（无 kind）之外的 cancel 不会拦住正常立项', async () => {
    const led = ledger([{ windowKey: W, at: NOW - 5 * 60_000, kind: 'cancel' }])
    const { run, seen } = makeTool({
      answers: [
        { id: 'name', selected: ['候选'] },
        { id: 'category', selected: ['feature'] },
        { id: 'difficulty', selected: ['standard'] },
        { id: 'location', selected: ['docs/requirements/<REQ>/'] },
      ],
      rejections: led,
    })
    const out = await run({ title_options: ['候选'] })
    expect(seen.calls).toBeGreaterThan(0)
    expect(out.success).toBe(true)
  })
})
