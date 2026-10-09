/**
 * t8（REQ-261007223647-da5d · serves: FR-5 / 设计 frontend.md 组件树 PendingTicketRow）单测：
 * **一票一行**——票的倒计时看得见、到零不消失、两个按钮都在。
 *
 * 设计口径：倒计时**本地递减（不轮询）**，到零切「已超时」态但票仍可答/可重投
 * （超时不等于作废——票的失效由服务端 TTL 判定，屏上只是把"看起来还有时间"改成"已超时"）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  countdownLabel,
  pendingTicketTitle,
  remainingMsOf,
  renderPendingTicketRow,
  tickPendingCountdowns,
} from '../src/client/views/pending-confirm.ts'
import type { BoardPendingConfirm } from '../src/client/types.ts'

const NOW = 1_700_000_000_000

function ticket(over: Partial<BoardPendingConfirm> = {}): BoardPendingConfirm {
  return {
    ticket: 'pc-t8',
    requirement_id: 'REQ-t8',
    target: 'artifact',
    kind: 'design',
    created_at: NOW - 60_000,
    interrupted: false,
    expires_at: NOW - 60_000 + 30 * 60_000,
    ...over,
  }
}

describe('t8 · 剩余时间与倒计时文案', () => {
  it('expires_at 优先（绝对时刻重算即准）', () => {
    expect(remainingMsOf(ticket(), NOW)).toBe(29 * 60_000)
  })

  it('旧服务端只给 remaining_ms → 用服务端读数', () => {
    expect(remainingMsOf({ ...ticket(), expires_at: undefined, remaining_ms: 123_000 }, NOW)).toBe(123_000)
  })

  it('两个都没有 → created_at + TTL 兜底；被中止过则以 interrupted_at 为基准', () => {
    const t = { ...ticket(), expires_at: undefined }
    expect(remainingMsOf(t, NOW)).toBe(29 * 60_000)
    const aborted = { ...t, interrupted_at: NOW - 10_000 }
    expect(remainingMsOf(aborted, NOW)).toBe(30 * 60_000 - 10_000)
  })

  it('过期不显示负数（下限 0）', () => {
    expect(remainingMsOf(ticket({ expires_at: NOW - 5_000 }), NOW)).toBe(0)
  })

  it('文案：分钟 / 秒 / 已超时', () => {
    expect(countdownLabel(27 * 60_000)).toBe('剩余 27:00')
    expect(countdownLabel(45_000)).toBe('剩余 00:45')
    expect(countdownLabel(0)).toBe('已超时')
  })
})

describe('t8 · 行渲染（标题 / 倒计时 / 两个按钮）', () => {
  it('行内含倒计时元素与「去作答」「重投弹框」两个按钮（选择器与文案对齐原型 #FR-5）', () => {
    const html = renderPendingTicketRow(ticket(), NOW)
    expect(html).toContain('class="dsh-pm-pending-countdown"')
    expect(html).toContain('data-remaining-ms="1740000"')
    expect(html).toContain('剩余 29:00')
    expect(html).toContain('data-action="pending-answer"')
    expect(html).toContain('data-action="pending-repost"')
    expect(html).toContain('data-ticket="pc-t8"')
    expect(html).toContain('data-requirement-id="REQ-t8"')
    // 原型 #FR-5 的形状：🔔 前缀 + 「重投弹框」按钮文案（逐字对齐线框）
    expect(html).toContain('dsh-pm-pending-bell')
    expect(html).toContain('>重投弹框</button>')
    expect(html).toContain('>去作答</button>')
  })

  it('到零 → 切「已超时」态（data-timed-out）但两个按钮仍在（票还能答）', () => {
    const html = renderPendingTicketRow(ticket({ expires_at: NOW - 1 }), NOW)
    expect(html).toContain('data-timed-out="yes"')
    expect(html).toContain('已超时')
    expect(html).toContain('data-action="pending-answer"')
    expect(html).toContain('data-action="pending-repost"')
    // 原型原话：已超时 —— 票仍有效，可一键重投（超时 != 作废，这句必须看得见）
    expect(html).toContain('票仍有效，可一键重投')
  })

  it('标题说人话：等的是哪一道门（不用机器词）', () => {
    expect(pendingTicketTitle(ticket())).toBe('设计文档待确认 · REQ-t8')
    expect(pendingTicketTitle(ticket({ target: 'plan', kind: undefined }))).toBe('拆分计划待批准 · REQ-t8')
    const html = renderPendingTicketRow(ticket(), NOW)
    expect(html).toContain('设计文档待确认')
  })

  it('值进 HTML 属性前转义（票号含引号不会破结构）', () => {
    const html = renderPendingTicketRow(ticket({ ticket: 'pc-"x' }), NOW)
    expect(html).toContain('data-ticket="pc-&quot;x"')
  })
})

describe('t8 · 本地递减（不轮询）', () => {
  it('tick 一次把剩余减 1 秒并刷新文案；到零打上超时态且不清票', () => {
    const row = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v }, removeAttribute(k: string) { delete this.attrs[k] } }
    const node = { dataset: { remainingMs: '61000' } as Record<string, string>, textContent: '', closest: () => row }
    const root = { querySelectorAll: () => [node] } as unknown as ParentNode

    expect(tickPendingCountdowns(root, 1000)).toBe(1)
    expect(node.dataset.remainingMs).toBe('60000')
    expect(node.textContent).toBe('剩余 01:00')
    expect(row.attrs['data-timed-out']).toBeUndefined()

    tickPendingCountdowns(root, 60_000)
    expect(node.dataset.remainingMs).toBe('0')
    expect(node.textContent).toBe('已超时')
    expect(row.attrs['data-timed-out']).toBe('yes')
    // 行还在（票不因超时从屏上消失）
    expect(node.textContent).not.toBe('')
  })

  it('屏上没票 → tick 返回 0（调用方据此停表，不空转）', () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode
    expect(tickPendingCountdowns(root, 1000)).toBe(0)
  })
})

describe('t8 · 选择器契约（组件 ↔ 接线 ↔ 样式三方对齐）', () => {
  const mountSrc = readFileSync('src/client/board-mount.ts', 'utf8')
  const cssSrc = readFileSync('src/client/styles/report/band.ts', 'utf8')
  const rowHtml = renderPendingTicketRow(ticket(), NOW)

  it('行里发出的每个 data-action，接线层都有对应分支（拼错即红）', () => {
    const actions = [...rowHtml.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]!)
    expect(actions.sort()).toEqual(['pending-answer', 'pending-repost'])
    for (const a of actions) expect(mountSrc, a + ' 必须有接线分支').toContain("case '" + a + "':")
  })

  it('倒计时刷新用的选择器与行的类名一致（否则倒计时永远不动）', () => {
    expect(rowHtml).toContain('dsh-pm-pending-countdown')
    expect(cssSrc).toContain('.dsh-pm-pending-countdown')
    expect(cssSrc).toContain('.dsh-pm-pending-row')
  })

  it('行携带的数据属性足以让接线层回填请求（id + ticket 都在）', () => {
    const clicked = /data-action="pending-repost"[^>]*/.exec(rowHtml)?.[0] ?? ''
    expect(clicked).toContain('data-id="REQ-t8"')
    expect(clicked).toContain('data-ticket="pc-t8"')
  })
})
