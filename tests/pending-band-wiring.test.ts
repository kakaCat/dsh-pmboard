/**
 * t10（REQ-261007223647-da5d · serves: FR-5 / 设计 IF-5 + frontend.md §空态与降级）单测：
 * **看板接线** —— /state 的票经宽松解析进首屏横带；旧服务端缺键按空数组渲染且不报错。
 *
 * 三段：
 *  ① `parsePendingConfirms` 的宽松口径（缺键 / 非数组 / 坏条目）；
 *  ② `fetchState` 真的把它接进 BoardState（stub fetch，断请求与结果）；
 *  ③ `buildBoard` 的数据属性与票数据一致，且**不传横带时输出零渲染**（老调用方与老服务端行为不变）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePendingConfirms } from '../src/client/api.ts'
import { buildBoard } from '../src/client/views/board.ts'
import { renderPendingConfirmBand } from '../src/client/views/pending-confirm.ts'
import type { BoardPendingConfirm, BoardState } from '../src/client/types.ts'

const NOW = 1_700_000_000_000

function ticket(over: Partial<BoardPendingConfirm> = {}): BoardPendingConfirm {
  return {
    ticket: 'pc-t10',
    requirement_id: 'REQ-t10',
    target: 'artifact',
    kind: 'requirement',
    created_at: NOW,
    interrupted: false,
    expires_at: NOW + 30 * 60_000,
    ...over,
  }
}

function boardState(over: Partial<BoardState> = {}): BoardState {
  return {
    revision: 1,
    requirements: [],
    tasks: [],
    ready: {},
    ...over,
  } as unknown as BoardState
}

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(payload: unknown): string[] {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response
  })
  return calls
}

/* ───────────────── ① 宽松解析 ───────────────── */

describe('t10 · parsePendingConfirms 宽松解析', () => {
  it('缺键 / 非数组 → []（旧服务端：新前端不白屏）', () => {
    expect(parsePendingConfirms(undefined)).toEqual([])
    expect(parsePendingConfirms(null)).toEqual([])
    expect(parsePendingConfirms({})).toEqual([])
    expect(parsePendingConfirms('nope')).toEqual([])
  })

  it('坏条目被逐条剔除，好条目原样保留（不因一条坏数据丢掉整块横带）', () => {
    const good = ticket()
    const out = parsePendingConfirms([
      good,
      { ticket: 'pc-x' },                       // 缺 requirement_id / target / created_at
      { requirement_id: 'REQ-x', target: 'artifact', created_at: 1 }, // 缺 ticket
      { ticket: 'pc-y', requirement_id: 'REQ-y', target: 'nope', created_at: 1 }, // target 非法
      null,
      'oops',
    ])
    expect(out).toEqual([good])
  })
})

/* ───────────────── ② fetchState 接线 ───────────────── */

describe('t10 · fetchState 把票接进 BoardState', () => {
  it('带票 → 逐条保留；请求打 /state（首屏只此一枪）', async () => {
    const calls = stubFetch({ success: true, data: { revision: 2, requirements: [], tasks: [], ready: {}, pending_confirms: [ticket()] } })
    const api = await import('../src/client/api.ts')
    const s = await api.fetchState('session-x')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('session=session-x')
    expect(s.pending_confirms).toEqual([ticket()])
  })

  it('旧服务端无该键 → 按 [] 处理（不是 undefined，下游不必到处判空）', async () => {
    stubFetch({ success: true, data: { revision: 2, requirements: [], tasks: [], ready: {} } })
    const api = await import('../src/client/api.ts')
    const s = await api.fetchState()
    expect(s.pending_confirms).toEqual([])
  })
})

/* ───────────────── ③ buildBoard 摆放与数据属性 ───────────────── */

describe('t10 · buildBoard 摆放横带', () => {
  it('带票 → 横带在屏且数据属性与票数据一致', () => {
    const tickets = [ticket(), ticket({ ticket: 'pc-t10b', requirement_id: 'REQ-t10b' })]
    const band = renderPendingConfirmBand(tickets, { now: NOW })
    const html = buildBoard(boardState(), NOW, 'lanes', {}, undefined, undefined, band)
    expect(html).toContain('class="dsh-pm-pending-band"')
    expect(html).toContain('data-pending-count="2"')
    expect(html).toContain('data-ticket="pc-t10"')
    expect(html).toContain('data-ticket="pc-t10b"')
    // 钉在看板顶部（在页头之前）
    expect(html.indexOf('dsh-pm-pending-band')).toBeLessThan(html.indexOf('dsh-pm-head'))
  })

  it('无票 / 未接线（缺省参数）→ 零渲染（老调用方输出不变）', () => {
    const html = buildBoard(boardState(), NOW)
    expect(html).not.toContain('dsh-pm-pending-band')
    expect(buildBoard(boardState(), NOW)).toBe(buildBoard(boardState(), NOW, 'lanes', {}, undefined, undefined, ''))
  })

  it('旧服务端缺键 → 空数组 → 横带不出（老服务端不报错）', () => {
    const band = renderPendingConfirmBand(boardState().pending_confirms, { now: NOW })
    expect(band).toBe('')
    expect(buildBoard(boardState(), NOW, 'lanes', {}, undefined, undefined, band)).not.toContain('dsh-pm-pending-band')
  })
})
