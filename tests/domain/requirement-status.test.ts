/**
 * L1 领域单测 · 需求状态机（REQ-47939a t2 / INV-1）。
 *
 * 断言口径（design/test-cases.md INV-1）：**表驱动**遍历 REQ_TRANSITIONS 表逐项与
 * canReqTransition 结果一致——新增状态或新增转移时本测试自动覆盖，不漏测（卡里的验收锚点）。
 * 同时断言再导出：shared/protocol.ts 与 domain 引用的是**同一份表**（版本漂移会红）。
 * serves: FR-3
 *   —— FR-3（REQ-261007193530-3133）：人工门集合含 canceled>draft；agent/system 走复活边
 *      抛 human_gate、human 放行；agentNextActions('canceled') 自动不含 draft。
 */
import { describe, it, expect } from 'vitest'
import {
  REQ_TRANSITIONS,
  HUMAN_ONLY_REQ_TRANSITIONS,
  SYSTEM_REQ_TRANSITIONS,
  canReqTransition,
  assertReqTransition,
  agentNextActions,
  type RequirementStatus,
} from '../../src/domain/requirement/RequirementStatus.js'
import * as protocol from '../../src/shared/protocol.js'

const ALL: RequirementStatus[] = Object.keys(REQ_TRANSITIONS) as RequirementStatus[]

describe('INV-1 需求状态机：表驱动逐项一致', () => {
  it('canReqTransition 对全表每个 (from,to) 组合与 REQ_TRANSITIONS 一致', () => {
    for (const from of ALL) {
      const allowed = new Set(REQ_TRANSITIONS[from])
      for (const to of ALL) {
        expect(canReqTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(to))
      }
    }
  })

  it('assertReqTransition：非法转移抛 invalid_transition', () => {
    try {
      assertReqTransition('draft', 'accepting', 'agent')
      throw new Error('应当抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('invalid_transition')
    }
  })

  it('assertReqTransition：human 对合法转移放行', () => {
    expect(() => assertReqTransition('draft', 'brainstorming', 'human')).not.toThrow()
    expect(() => assertReqTransition('accepting', 'archived', 'human')).not.toThrow()
  })

  it('人工闸门：表驱动遍历 HUMAN_ONLY_REQ_TRANSITIONS，agent/system 一律 human_gate、human 放行', () => {
    for (const key of HUMAN_ONLY_REQ_TRANSITIONS) {
      const [from, to] = key.split('>') as [RequirementStatus, RequirementStatus]
      // 表内每一项必须是合法转移（否则断言的是 invalid_transition 而非 human_gate）
      expect(canReqTransition(from, to), key + ' 应是合法转移').toBe(true)
      for (const actor of ['agent', 'system'] as const) {
        try {
          assertReqTransition(from, to, actor)
          throw new Error('应当抛 human_gate: ' + key)
        } catch (err) {
          expect((err as { code?: string }).code, key + ' actor=' + actor).toBe('human_gate')
        }
      }
      expect(() => assertReqTransition(from, to, 'human'), key).not.toThrow()
    }
  })

  it('system 白名单外一律 system_gate（且白名单内可推进）', () => {
    for (const key of SYSTEM_REQ_TRANSITIONS) {
      const [from, to] = key.split('>') as [RequirementStatus, RequirementStatus]
      expect(() => assertReqTransition(from, to, 'system'), key).not.toThrow()
    }
    expect(() => assertReqTransition('draft', 'canceled', 'system')).toThrow() // 人工门，system 不可
  })

  it('agentNextActions = 合法转移中剔除人工闸门', () => {
    for (const from of ALL) {
      const expected = REQ_TRANSITIONS[from].filter(to => !HUMAN_ONLY_REQ_TRANSITIONS.has(from + '>' + to))
      expect(agentNextActions(from), from).toEqual(expected)
    }
    // accepting 的可自行推进项 = 返工目标 implementing + 全部回退目标（archived/canceled 是人工闸门）。
    // REQ-261003204149-1e80 FR-1：回退对 agent 开放后，可退目标一并出现在这里；
    // 顺序 = 回退目标按流水线序升序（draft..implementing）。
    expect(agentNextActions('accepting')).toEqual([
      'draft', 'brainstorming', 'design', 'decomposing', 'implementing',
    ])
  })
})

describe('M2（FR-3）：复活边 canceled→draft 与取消同门', () => {
  it('集合已收录 canceled>draft（合法边仍在，只是 agent 不可发起）', () => {
    expect(HUMAN_ONLY_REQ_TRANSITIONS.has('canceled>draft')).toBe(true)
    expect(canReqTransition('canceled', 'draft')).toBe(true) // 边本身没被删
  })

  it('agent / system 走复活边 → human_gate；human 放行', () => {
    for (const actor of ['agent', 'system'] as const) {
      try {
        assertReqTransition('canceled', 'draft', actor)
        throw new Error('应当抛 human_gate')
      } catch (err) {
        expect((err as { code?: string }).code, 'actor=' + actor).toBe('human_gate')
      }
    }
    expect(() => assertReqTransition('canceled', 'draft', 'human')).not.toThrow()
  })

  it('派生面自动跟随：agentNextActions(canceled) 不含 draft（手改即红）', () => {
    expect(agentNextActions('canceled')).not.toContain('draft')
    const expected = REQ_TRANSITIONS.canceled.filter(to => !HUMAN_ONLY_REQ_TRANSITIONS.has('canceled>' + to))
    expect(agentNextActions('canceled')).toEqual(expected)
  })
})

describe('t2 再导出：shared/protocol 与 domain 同源', () => {
  it('常量与判定函数经 protocol 再导出后引用同一实现', () => {
    expect(protocol.REQ_TRANSITIONS).toBe(REQ_TRANSITIONS)
    expect(protocol.HUMAN_ONLY_REQ_TRANSITIONS).toBe(HUMAN_ONLY_REQ_TRANSITIONS)
    expect(protocol.agentNextActions).toBe(agentNextActions)
    expect(protocol.canReqTransition('draft', 'brainstorming')).toBe(true)
  })
})
