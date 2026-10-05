/**
 * 回退判定与状态机单测（REQ-261003204149-1e80 t1 / FR-1）。
 *
 * 这一层是整条回退通道的地基：**判定**（哪些转移算回退）、**序**（目标之后有哪些阶段，
 * 撤销语义要用）、**合法转移表**（任意更早节点皆为合法回退边）。
 *
 * 覆盖 t1 的验收标准四条：
 *  ① isRollback 真值表（同阶段 false、前进 false、`archived→design` false）；
 *  ② implementing 的出边含 design / brainstorming / draft（可退任意更早节点）；
 *  ③ archived 与 done 仍无出边；④ 四类人工门仍在集合内（回程的门一道不动）。
 */
import { describe, expect, it } from 'vitest'
import {
  REQ_TRANSITIONS,
  HUMAN_ONLY_REQ_TRANSITIONS,
  canReqTransition,
  type RequirementStatus,
} from '../src/domain/requirement/RequirementStatus.js'
import {
  PIPELINE_ORDER,
  isRollback,
  stagesAfter,
  rollbackTargetsOf,
} from '../src/domain/requirement/RollbackSpec.js'

describe('RollbackSpec · isRollback 真值表', () => {
  it('同阶段不是回退', () => {
    for (const s of PIPELINE_ORDER) expect(isRollback(s, s), s).toBe(false)
  })

  it('前进方向不是回退', () => {
    const forward: ReadonlyArray<readonly [RequirementStatus, RequirementStatus]> = [
      ['draft', 'brainstorming'],
      ['brainstorming', 'design'],
      ['design', 'decomposing'],
      ['decomposing', 'implementing'],
      ['implementing', 'accepting'],
      ['accepting', 'archived'],
    ]
    for (const [from, to] of forward) expect(isRollback(from, to), from + '→' + to).toBe(false)
  })

  it('目标早于当前阶段 = 回退（含跨级）', () => {
    expect(isRollback('implementing', 'design')).toBe(true)
    expect(isRollback('implementing', 'draft')).toBe(true)
    expect(isRollback('accepting', 'implementing')).toBe(true)
    expect(isRollback('accepting', 'brainstorming')).toBe(true)
    expect(isRollback('design', 'brainstorming')).toBe(true)
    expect(isRollback('decomposing', 'draft')).toBe(true)
  })

  it('不在流水线序中的状态（done / canceled）一律不是回退', () => {
    expect(isRollback('archived', 'design')).toBe(false)
    expect(isRollback('done', 'design')).toBe(false)
    expect(isRollback('design', 'canceled')).toBe(false)
    expect(isRollback('canceled', 'draft')).toBe(false)
  })
})

describe('RollbackSpec · stagesAfter 是撤销语义的作用域', () => {
  it('目标之后的所有阶段（不含目标自身）', () => {
    expect(stagesAfter('design')).toEqual(['decomposing', 'implementing', 'accepting', 'archived'])
    expect(stagesAfter('implementing')).toEqual(['accepting', 'archived'])
    expect(stagesAfter('draft')).toEqual([
      'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived',
    ])
  })

  it('终点之后为空；不在序中也为空', () => {
    expect(stagesAfter('archived')).toEqual([])
    expect(stagesAfter('canceled')).toEqual([])
    expect(stagesAfter('done')).toEqual([])
  })

  it('目标自身不在撤销范围内（退到 design 不撤 design 自己的章）', () => {
    expect(stagesAfter('design')).not.toContain('design')
  })
})

describe('RollbackSpec · rollbackTargetsOf', () => {
  it('draft 无更早节点；archived 是终点', () => {
    expect(rollbackTargetsOf('draft')).toEqual([])
    expect(rollbackTargetsOf('archived')).toEqual([])
  })

  it('implementing 可退到全部更早节点', () => {
    expect([...rollbackTargetsOf('implementing')]).toEqual([
      'draft', 'brainstorming', 'design', 'decomposing',
    ])
  })

  it('legacy done 与 canceled 不参与回退', () => {
    expect(rollbackTargetsOf('done')).toEqual([])
    expect(rollbackTargetsOf('canceled')).toEqual([])
  })
})

describe('状态机 · 回退边已并入合法转移表（FR-1）', () => {
  it('implementing 的出边含 design / brainstorming / draft（可退任意更早节点）', () => {
    for (const to of ['design', 'brainstorming', 'draft'] as const) {
      expect(canReqTransition('implementing', to), 'implementing→' + to).toBe(true)
    }
  })

  it('accepting 的出边含全部更早节点', () => {
    for (const to of ['implementing', 'decomposing', 'design', 'brainstorming', 'draft'] as const) {
      expect(canReqTransition('accepting', to), 'accepting→' + to).toBe(true)
    }
  })

  it('每个中间阶段的出边 = 前进边 + 全部更早节点', () => {
    expect([...REQ_TRANSITIONS.implementing]).toEqual(
      expect.arrayContaining(['accepting', 'canceled', 'draft', 'brainstorming', 'design', 'decomposing']),
    )
    expect([...REQ_TRANSITIONS.design]).toEqual(
      expect.arrayContaining(['decomposing', 'canceled', 'draft', 'brainstorming']),
    )
  })

  it('archived 与 done 仍无出边（终点不回退）', () => {
    expect(REQ_TRANSITIONS.archived).toEqual([])
    expect(REQ_TRANSITIONS.done).toEqual([])
  })

  it('canceled 的出边不受回退边污染（仍是重新立项 / 归档两条）', () => {
    expect([...REQ_TRANSITIONS.canceled]).toEqual(['draft', 'archived'])
  })

  it('前进边逐条未变（回退放宽不得顺手改动前进语义）', () => {
    expect(canReqTransition('draft', 'brainstorming')).toBe(true)
    expect(canReqTransition('brainstorming', 'design')).toBe(true)
    expect(canReqTransition('design', 'decomposing')).toBe(true)
    expect(canReqTransition('decomposing', 'implementing')).toBe(true)
    expect(canReqTransition('implementing', 'accepting')).toBe(true)
    expect(canReqTransition('accepting', 'archived')).toBe(true)
  })
})

describe('人工门 · 回退方向放行、回程的门一道不动（FR-1 / FR-3 不变量）', () => {
  it('implementing>design 不再是人工门（FR-1 推翻 REQ-4842fe 的仅人可发起）', () => {
    expect(HUMAN_ONLY_REQ_TRANSITIONS.has('implementing>design')).toBe(false)
  })

  it('回退方向没有任何一条进人工门（否则 agent 又退不动）', () => {
    for (const from of PIPELINE_ORDER) {
      for (const to of rollbackTargetsOf(from)) {
        expect(HUMAN_ONLY_REQ_TRANSITIONS.has(from + '>' + to), from + '→' + to).toBe(false)
      }
    }
  })

  it('回程上的四类人工门仍在（退过不等于免检）', () => {
    for (const key of [
      'brainstorming>design',        // G1 需求文档确认
      'decomposing>implementing',    // G3 拆分计划批准
      'accepting>archived',          // G4 验收通过
      'draft>canceled', 'brainstorming>canceled', 'decomposing>canceled',
      'implementing>canceled', 'accepting>canceled', // 取消需求（破坏性）
      'canceled>archived',           // 取消后归档
    ]) {
      expect(HUMAN_ONLY_REQ_TRANSITIONS.has(key), key).toBe(true)
    }
  })
})
