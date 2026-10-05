// serves: FR-5
/**
 * 人工门判据单测（REQ-261004065652-5c1c · t1 / TC-7 前置）。
 *
 * 关键边界（写成用例锁死）：过程产物（task_detail / task_output）**不算**人工门——
 * 否则实施阶段会被自己的汇报卡死（那是"agent 还在干活"，不是"等人"）。
 */
import { describe, it, expect } from 'vitest'
import { humanGateOf, GATE_ARTIFACT_KINDS } from '../src/application/internal/human-gate.js'

const sheet = (...statuses: string[]) => ({
  verification: { sheet: { items: statuses.map((status, i) => ({ id: 'v1-' + (i + 1), status })) } },
})
const art = (kind: string, confirmed: boolean) => ({
  stage: 'design' as const, kind, path: 'docs/x.md', registeredAt: 1,
  ...(confirmed ? { confirmedAt: 2 } : {}),
})

describe('humanGateOf · 验收单待裁决', () => {
  it('accepting + 有 pending → acceptance-pending（实测 9 项 pending 的形态）', () => {
    const gate = humanGateOf({ status: 'accepting', ...sheet('passed', 'pending', 'pending') })
    expect(gate).toEqual({ open: true, reason: 'acceptance-pending' })
  })

  it('accepting + unverified 也算未裁决（历史遗留值）', () => {
    expect(humanGateOf({ status: 'accepting', ...sheet('unverified') }).reason).toBe('acceptance-pending')
  })

  it('accepting + 全部已裁决 → 不开门（agent 该继续）', () => {
    expect(humanGateOf({ status: 'accepting', ...sheet('passed', 'failed') }).open).toBe(false)
  })

  it('非 accepting 阶段不因验收单开门（状态与判据同源）', () => {
    expect(humanGateOf({ status: 'implementing', ...sheet('pending') }).open).toBe(false)
  })
})

describe('humanGateOf · 计划待批准', () => {
  it('decomposing + 计划已提交未批准 → plan-unapproved', () => {
    expect(humanGateOf({ status: 'decomposing', plan: { approvedAt: undefined } }))
      .toEqual({ open: true, reason: 'plan-unapproved' })
  })

  it('decomposing + 已批准 → 不开门', () => {
    expect(humanGateOf({ status: 'decomposing', plan: { approvedAt: 9 } }).open).toBe(false)
  })

  it('decomposing 但没有计划 → 不开门（材料都没提交，agent 该写计划）', () => {
    expect(humanGateOf({ status: 'decomposing' }).open).toBe(false)
  })
})

describe('humanGateOf · 产物待确认', () => {
  it('未确认的 requirement/design 产物 → artifact-unconfirmed', () => {
    expect(humanGateOf({ status: 'brainstorming', artifacts: [art('requirement', false)] }))
      .toEqual({ open: true, reason: 'artifact-unconfirmed' })
  })

  it('已确认 → 不开门', () => {
    expect(humanGateOf({ status: 'brainstorming', artifacts: [art('requirement', true)] }).open).toBe(false)
  })

  it('过程产物不构成人工门（task_detail / task_output / notes）', () => {
    for (const kind of ['task_detail', 'task_output', 'notes']) {
      expect(humanGateOf({ status: 'implementing', artifacts: [art(kind, false)] }).open, kind).toBe(false)
    }
  })

  it('门类产物清单是显式的（防以后有人顺手把过程产物加进去）', () => {
    expect([...GATE_ARTIFACT_KINDS]).toEqual(['requirement', 'design', 'decomposition', 'verification', 'archive'])
  })

  it('结构不全的产物条目被忽略（不误判成"待确认"）', () => {
    expect(humanGateOf({ status: 'brainstorming', artifacts: [undefined, null, 42, {}] }).open).toBe(false)
  })
})

describe('humanGateOf · 判定顺序与缺省', () => {
  it('验收单优先于产物确认（都是"等人"，报更具体的那条）', () => {
    const gate = humanGateOf({ status: 'accepting', artifacts: [art('verification', false)], ...sheet('pending') })
    expect(gate.reason).toBe('acceptance-pending')
  })

  it('undefined / 空记录 → 不开门（缺省即旧行为）', () => {
    expect(humanGateOf(undefined).open).toBe(false)
    expect(humanGateOf({ status: 'implementing' }).open).toBe(false)
  })
})
