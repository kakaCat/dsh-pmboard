/**
 * t9（REQ-261007223647-da5d · serves: FR-5 / 设计 frontend.md 组件树 PendingConfirmBand）单测：
 * **首屏横带**——有票才占地方，逐行铺开；没票零渲染；取不到票要红字说话。
 *
 * 为什么「无票零渲染」是硬判据：看板首屏本来就挤（用户 2026-10-06 反馈过信息架构问题），
 * 为一个多数时候为空的功能留一个空盒子，等于天天多占一行。
 */
import { describe, expect, it } from 'vitest'
import { renderPendingConfirmBand } from '../src/client/views/pending-confirm.ts'
import type { BoardPendingConfirm } from '../src/client/types.ts'

const NOW = 1_700_000_000_000

function ticket(over: Partial<BoardPendingConfirm> = {}): BoardPendingConfirm {
  return {
    ticket: 'pc-t9',
    requirement_id: 'REQ-t9',
    target: 'artifact',
    kind: 'requirement',
    created_at: NOW,
    interrupted: false,
    expires_at: NOW + 30 * 60_000,
    ...over,
  }
}

describe('t9 · 有票 → 横带 + 逐行铺开', () => {
  it('一张票 → 容器 + 1 行，data-pending-count 与票数一致', () => {
    const html = renderPendingConfirmBand([ticket()], { now: NOW })
    expect(html).toContain('class="dsh-pm-pending-band"')
    expect(html).toContain('data-pending-count="1"')
    expect(html).toContain('有 1 道确认门在等你作答')
    expect((html.match(/class="dsh-pm-pending-row"/g) ?? [])).toHaveLength(1)
  })

  it('两张票 → 两行，计数 2', () => {
    const html = renderPendingConfirmBand(
      [ticket(), ticket({ ticket: 'pc-t9b', requirement_id: 'REQ-t9b' })],
      { now: NOW },
    )
    expect(html).toContain('data-pending-count="2"')
    expect((html.match(/class="dsh-pm-pending-row"/g) ?? [])).toHaveLength(2)
    expect(html).toContain('data-ticket="pc-t9b"')
  })

  it('超时票在带里切「已超时」态（仍可答）', () => {
    const html = renderPendingConfirmBand([ticket({ expires_at: NOW - 1 })], { now: NOW })
    expect(html).toContain('已超时')
    expect(html).toContain('data-timed-out="yes"')
  })
})

describe('t9 · 无票 / 取数失败', () => {
  it('空数组 → 零渲染（连容器都不出）', () => {
    expect(renderPendingConfirmBand([], { now: NOW })).toBe('')
  })

  it('undefined（旧服务端缺键）→ 零渲染（不报错、不占首屏）', () => {
    expect(renderPendingConfirmBand(undefined, { now: NOW })).toBe('')
  })

  it('取数失败 → 一行红字「pending 票读取失败」+ 原因（不静默）', () => {
    const html = renderPendingConfirmBand(undefined, { now: NOW, error: '网络断了' })
    expect(html).toContain('pending 票读取失败')
    expect(html).toContain('网络断了')
    expect(html).toContain('data-pending-error="yes"')
    expect(html).not.toContain('dsh-pm-pending-row')
  })
})
