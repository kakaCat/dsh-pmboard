/**
 * 交接水位三档的单测（REQ-261004150249-731e FR-3 / t3）。
 *
 * 两面都测：**算得出的**六点边界 + **算不出的**四种缺席。后者是本卡最重要的不变量——
 * 判据宁可不说话，也不许把"取不到"当成"还早"。
 */
import { describe, it, expect } from 'vitest'
import { decideHandoff, allowsSelfHandoff, type HandoffThresholds } from '../src/application/internal/handoff-policy.js'
import { handoffSettings } from '../src/plugin-config.js'
import type { ContextPressureSnapshot } from '../src/shared/protocol.js'

const T: HandoffThresholds = { warn: 0.75, fork: 0.85, critical: 0.9 }
const WINDOW = 1000

/** 造一条可得读数：pressureTokens 即"当前压力"。 */
function pressure(pressureTokens: number, extra: Partial<ContextPressureSnapshot> = {}): ContextPressureSnapshot {
  return { at: 0, source: 'projection', contextWindow: WINDOW, pressureTokens, ...extra }
}

describe('decideHandoff：六点边界', () => {
  it.each([
    [740, 'none'],
    [750, 'warn'],
    [840, 'warn'],
    [850, 'fork'],
    [890, 'fork'],
    [900, 'critical'],
  ])('%i/1000 → %s', (tokens, expected) => {
    expect(decideHandoff(pressure(tokens), T)).toBe(expected)
  })

  it('超过 critical 仍是 critical（不越界成新档）', () => {
    expect(decideHandoff(pressure(1000), T)).toBe('critical')
  })
})

describe('decideHandoff：读数缺席一律 unknown（不补 0）', () => {
  it('整条不可得（undefined）', () => {
    expect(decideHandoff(undefined, T)).toBe('unknown')
  })

  it('source 不是 projection', () => {
    expect(decideHandoff({ at: 0, source: 'unavailable', contextWindow: WINDOW, pressureTokens: 999 }, T)).toBe('unknown')
  })

  it('缺 contextWindow', () => {
    expect(decideHandoff({ at: 0, source: 'projection', pressureTokens: 999 }, T)).toBe('unknown')
  })

  it('缺 pressureTokens', () => {
    expect(decideHandoff({ at: 0, source: 'projection', contextWindow: WINDOW }, T)).toBe('unknown')
  })

  it('contextWindow 为 0 不可算（不拿 0 做除数）', () => {
    expect(decideHandoff(pressure(0, { contextWindow: 0 }), T)).toBe('unknown')
  })

  it('projectedTokens=0 是**合法**读数：照算，不得判缺席', () => {
    expect(decideHandoff(pressure(900, { projectedTokens: 0 }), T)).toBe('critical')
  })

  it('pressureTokens=0 是合法读数：判 none（确实没压力）', () => {
    expect(decideHandoff(pressure(0), T)).toBe('none')
  })
})

describe('自主边界（D-3）', () => {
  it('只有 fork / critical 允许 agent 自主交接', () => {
    expect(allowsSelfHandoff('fork')).toBe(true)
    expect(allowsSelfHandoff('critical')).toBe(true)
    expect(allowsSelfHandoff('warn')).toBe(false)
    expect(allowsSelfHandoff('none')).toBe(false)
    expect(allowsSelfHandoff('unknown')).toBe(false)
  })
})

describe('handoffSettings：配置解析与装配期响亮失败', () => {
  it('缺省三档 = 0.75 / 0.85 / 0.90', () => {
    expect(handoffSettings()).toEqual({ warn: 0.75, fork: 0.85, critical: 0.9 })
    expect(handoffSettings({})).toEqual({ warn: 0.75, fork: 0.85, critical: 0.9 })
  })

  it('显式值生效', () => {
    expect(handoffSettings({ handoff: { warn: 0.5, fork: 0.6, critical: 0.7 } }))
      .toEqual({ warn: 0.5, fork: 0.6, critical: 0.7 })
  })

  const invalid: Array<[{ warn?: number; fork?: number; critical?: number }, string]> = [
    [{ warn: 0.9, fork: 0.85, critical: 0.9 }, 'warn ≥ fork'],
    [{ warn: 0.75, fork: 0.95, critical: 0.9 }, 'fork ≥ critical'],
    [{ warn: 0 }, 'warn = 0 越界'],
    [{ critical: 1.5 }, 'critical > 1 越界'],
    [{ fork: Number.POSITIVE_INFINITY }, '非有限数'],
    [{ warn: Number.NaN }, 'NaN'],
  ]
  it.each(invalid)('非法配置装配期抛错（%o：%s）', (handoff) => {
    let code = ''
    try {
      handoffSettings({ handoff })
    } catch (error: unknown) {
      code = (error as { code?: string }).code ?? ''
    }
    expect(code).toBe('REQBOARD_HANDOFF_CONFIG_INVALID')
  })
})
