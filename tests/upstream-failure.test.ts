// serves: FR-1, FR-2, FR-8
/**
 * 上游失败分类单测（REQ-261004065652-5c1c · t1 / TC-3 前置）。
 *
 * 判据：`design/test-cases.md` TC-3/TC-4 的"判定顺序锁死"与 `design/interfaces.md` 的
 * 5 条顺序表逐行对应；`reasonClassOf` 与 `classifyTurnEnd` 必须**同源**
 * （否则"写入时的类别"与"留痕去重时的类别"会分叉，FR-8 又退化成按原文判等）。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyTurnEnd, reasonClassOf, truncateReason, REASON_TEXT_MAX,
} from '../src/application/internal/upstream-failure.js'

const err = (code: string, message: string) => ({ reason: { kind: 'error', error: { code, message } } })
const abort = (cause?: string) => ({
  reason: { kind: 'aborted', ...(cause === undefined ? {} : { reason: { kind: cause } }) },
})

describe('classifyTurnEnd · 判定顺序（interfaces.md 的 5 条表）', () => {
  it('① aborted → abort，类别带 cause', () => {
    expect(classifyTurnEnd(abort('user'))).toEqual({
      kind: 'abort', reasonClass: 'aborted:user', reasonText: 'aborted:user',
    })
  })

  it('① aborted 缺 cause → aborted:unknown（不编造病因）', () => {
    expect(classifyTurnEnd(abort()).reasonClass).toBe('aborted:unknown')
  })

  it('② error + code=AUTH → fatal / error:AUTH', () => {
    const c = classifyTurnEnd(err('AUTH', '403 forbidden'))
    expect(c.kind).toBe('fatal')
    expect(c.reasonClass).toBe('error:AUTH')
  })

  it('② error 无 code 但文案含 usage limit → fatal（实测同家 provider 两条额度文案都不带 code）', () => {
    const c = classifyTurnEnd(err('', "403 {\"error\":{\"type\":\"permission_error\",\"message\":\"You've reached your 5-hour usage limit."))
    expect(c.kind).toBe('fatal')
    expect(c.reasonClass).toBe('error:AUTH')
  })

  it('③ error 其它 → transient，类别带原 code', () => {
    const c = classifyTurnEnd(err('TRANSPORT', 'DeepSeek Messages transport failed'))
    expect(c.kind).toBe('transient')
    expect(c.reasonClass).toBe('error:TRANSPORT')
  })

  it('③ error 缺 code → error:UNKNOWN（不吞成空类别）', () => {
    expect(classifyTurnEnd(err('', 'boom')).reasonClass).toBe('error:UNKNOWN')
  })

  it('④ completed / max-tokens / blocked → normal', () => {
    for (const kind of ['completed', 'max-tokens', 'blocked']) {
      const c = classifyTurnEnd({ reason: { kind } })
      expect(c.kind).toBe('normal')
      expect(c.reasonClass).toBe(kind)
    }
  })

  it('⑤ 形态不认识 → unknown，且不抛（调用方据此不写不动）', () => {
    for (const data of [undefined, null, {}, { reason: {} }, { reason: { kind: 123 } }, 'nonsense']) {
      expect(() => classifyTurnEnd(data)).not.toThrow()
      expect(classifyTurnEnd(data).kind).toBe('unknown')
    }
  })
})

describe('reasonClassOf · 与 classifyTurnEnd 同源（FR-8 去重键）', () => {
  it('超长 403 文案归一到 error:AUTH（这正是实测刷屏的那条）', () => {
    const long = 'error:AUTH:403 {"error":{"type":"permission_error","message":"You\'ve reached your weekly (7-day) usage limit. Your quota will reset when the current 7-day window ends. To continue now, purchase extra usage or upgrade your plan: https://www.kimi.com/membership/subscription?tab=quota"},"type":"error"}'
    expect(reasonClassOf(long)).toBe('error:AUTH')
  })

  it('无 code 的额度文案也归一（致命特征优先于 code）', () => {
    expect(reasonClassOf('error::403 {"message":"You have reached your usage limit"}')).toBe('error:AUTH')
  })

  it('瞬时错误保留原 code', () => {
    expect(reasonClassOf('error:TRANSPORT:DeepSeek Messages transport failed')).toBe('error:TRANSPORT')
  })

  it('aborted 取 cause，不吞整串', () => {
    expect(reasonClassOf('aborted:user')).toBe('aborted:user')
    expect(reasonClassOf('aborted:user（阶段 accepting）')).toBe('aborted:user')
  })

  it('空串 / 陌生形态 → unknown 或首词（永不抛）', () => {
    expect(reasonClassOf('')).toBe('unknown')
    expect(reasonClassOf('upstream stream idle 3m ×5')).toBe('upstream')
  })
})

describe('truncateReason · 写台账的长度有界', () => {
  it('短文本原样返回', () => {
    expect(truncateReason('error:AUTH')).toBe('error:AUTH')
  })

  it('超长截断到上限（含省略号）', () => {
    const long = 'x'.repeat(REASON_TEXT_MAX * 3)
    const out = truncateReason(long)
    expect(out.length).toBe(REASON_TEXT_MAX)
    expect(out.endsWith('…')).toBe(true)
  })

  it('max ≤ 0 → 空串（不返回超限内容）', () => {
    expect(truncateReason('abc', 0)).toBe('')
  })
})
