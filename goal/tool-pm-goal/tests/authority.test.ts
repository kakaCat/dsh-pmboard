/**
 * 授权判定（对齐宿主 `hasDirectHumanInput` / `completionAuthority`）：
 * "本轮是不是人打的字"只能从**开放回合的事件切面**看——纯函数，可穷举。
 */
import { describe, it, expect } from 'vitest'
import { authorityFromEvents, isActionAuthorized } from 'tool-pm-goal/authority.js'

const human = { type: 'user/message', data: { source: { kind: 'user' } } }
const round = { type: 'user/message', data: { source: { kind: 'dive', round: 3 } } }
const other = { type: 'tool/result', data: { source: { kind: 'tool' } } }

describe('authorityFromEvents', () => {
  it('开放回合里有人类消息 → direct-human', () => {
    expect(authorityFromEvents([other, human], 0, true)).toEqual({ kind: 'direct-human' })
  })

  it('只有续跑回合消息 → autonomous（对齐宿主 goal-round）', () => {
    expect(authorityFromEvents([other, round], 0, true)).toEqual({ kind: 'autonomous' })
  })

  it('两者都无 → undefined（终态动作应被拒：既非人、也非本目标的回合）', () => {
    expect(authorityFromEvents([other], 0, true)).toBeUndefined()
  })

  it('**回合起点之前**的人类消息不算本轮授权（历史不授权）', () => {
    // 扫的是 openTurnStartSeq **之后**：-1 = 从 0 起扫（含那条人类消息）；0 = 从 1 起扫（只剩回合消息）
    expect(authorityFromEvents([human, round], -1, true)).toEqual({ kind: 'direct-human' })
    expect(authorityFromEvents([human, round], 0, true)).toEqual({ kind: 'autonomous' })
  })

  it('非顶层 agent → 一律 undefined（对齐宿主 roots() 检查）', () => {
    expect(authorityFromEvents([human], 0, false)).toBeUndefined()
  })

  it('人优先于续跑（同一回合两者都有 → direct-human）', () => {
    expect(authorityFromEvents([round, human], 0, true)).toEqual({ kind: 'direct-human' })
  })
})

describe('动作授权表（两层合表）', () => {
  it('resume / stage_done = 真人专属；其余自主可发起', () => {
    expect(isActionAuthorized('resume', { kind: 'autonomous' })).toBe(false)
    expect(isActionAuthorized('stage_done', { kind: 'autonomous' })).toBe(false)
    expect(isActionAuthorized('resume', { kind: 'direct-human' })).toBe(true)
    expect(isActionAuthorized('stage_done', { kind: 'direct-human' })).toBe(true)
    for (const a of ['pause', 'block', 'complete'] as const) {
      expect(isActionAuthorized(a, { kind: 'autonomous' })).toBe(true)
    }
  })
})
