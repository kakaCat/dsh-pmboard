/**
 * 裁决结果可复核判据（REQ-261006201920-2adc FR-3 · TC-10 / TC-11 / TC-12 · D-3）serves: FR-3
 *
 * 缺陷形态：「实际结果」列只写「通过」两个字也算 `passed`。实测台账 886 个普通项通过里
 * 131 个（14.8%）文本不含任何可复核锚点——其中 102 个是 agent 自己写的
 * 「（未附实际结果…待补复核）」（自认待补却记了通过）、24 个就是「通过」。
 *
 * 口径（本需求）：三类项**分开判**，混用会误伤——
 *   · 普通项：要**可复核锚点**（命令 / 路径 / 明确计数），无则记 `unverified`；
 *   · 人工项（needsHuman）：要**事实形态**（现象 + 证据路径）且长于 6 字，否则**拒收**；
 *   · 系统缺口项：它写的是**处置**不是实测，走处置模板（见 system-item-disposition 用例）。
 *
 * 本文件同时是**反向演练 RV-3 的载体**：注释掉 `applyVerdicts` 里的结果锚点分支，
 * 「无锚点 ⇒ unverified」的断言必然变红；还原即绿。
 */
import { describe, it, expect } from 'vitest'
import {
  applyVerdicts,
  hasResultAnchor,
  RESULT_ANCHOR,
  type SheetItemLike,
  type SheetLike,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { hasErrorCode, REQBOARD_ERROR_CODES } from '../src/domain/errors.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const

/** 一张单：普通项 + 人工项 + 系统项各一（缺省全 pending）。 */
function mkSheet(): SheetLike {
  return {
    version: 2,
    items: [
      { id: 'v2-1', source: { kind: 'task', taskId: 't-a' }, criterion: '单测全绿', evidence: ['e'], status: 'pending' },
      { id: 'v2-2', source: { kind: 'prototype-compare', prototypePath: 'prototypes/a.html' }, criterion: '原型对照', evidence: ['e'], status: 'pending', needsHuman: true, humanReason: '界面视觉' },
      { id: 'v2-3', source: { kind: 'requirement' }, criterion: 'E2E 覆盖：无', evidence: ['e'], status: 'pending', gapKind: 'e2e' },
    ],
    generatedAt: 1,
    generatedBy: H,
  }
}
const itemOf = (s: SheetLike, id: string): SheetItemLike => s.items.find(i => i.id === id)!

describe('普通项：无锚点的通过不冒充通过（FR-3 · TC-10 / TC-11）', () => {
  it('TC-10 三种「无锚点」文本 → 记 unverified', () => {
    for (const text of ['通过', '符合预期', '（未附实际结果：本机弹框为「选项或自定义输入」二选一，本项按通过记录，待补复核）']) {
      const s = mkSheet()
      applyVerdicts(s, [{ itemId: 'v2-1', status: 'passed', opinion: text }], H, 100, [])
      expect(itemOf(s, 'v2-1').status, text).toBe('unverified')
    }
  })

  it('TC-10b 零输入通过、但该项 agent 结果本身无锚点 → 同样 unverified', () => {
    const s = mkSheet()
    itemOf(s, 'v2-1').result = '通过'
    itemOf(s, 'v2-1').resultSource = 'agent'
    applyVerdicts(s, [{ itemId: 'v2-1', status: 'passed' }], H, 100, [])
    expect(itemOf(s, 'v2-1').status).toBe('unverified')
  })

  it('TC-11 有锚点的通过照常 passed（命令 / 路径 / 明确计数）', () => {
    for (const text of [
      'npx vitest run tests/x.test.ts → 12 passed',
      '截图落 docs/requirements/REQ-x/evidence/a.png',
      '退出码 0',
      'Test Files 2 passed (2)',
    ]) {
      const s = mkSheet()
      applyVerdicts(s, [{ itemId: 'v2-1', status: 'passed', opinion: text }], H, 100, [])
      expect(itemOf(s, 'v2-1').status, text).toBe('passed')
    }
  })

  it('词表自证：正例命中、反例不命中（判据非空转）', () => {
    expect(RESULT_ANCHOR.source.length).toBeGreaterThan(0)
    expect(hasResultAnchor('npx vitest run tests/x.test.ts → 12 passed')).toBe(true)
    expect(hasResultAnchor('通过')).toBe(false)
    expect(hasResultAnchor('')).toBe(false)
  })
})

describe('人工项：禁收无事实的短句（FR-3 · TC-12）', () => {
  it('TC-12「通过」两个字 → 拒收，且文案说清该写什么', () => {
    const s = mkSheet()
    try {
      applyVerdicts(s, [{ itemId: 'v2-2', status: 'passed', opinion: '通过' }], H, 100, [])
      throw new Error('应当抛错')
    } catch (err) {
      expect(hasErrorCode(err, REQBOARD_ERROR_CODES.invalidInput)).toBe(true)
      expect((err as Error).message).toContain('现象')
      expect((err as Error).message).toContain('证据路径')
    }
    // 先验后改：被拒后该项仍是 pending，不留半批已改
    expect(itemOf(s, 'v2-2').status).toBe('pending')
    expect(itemOf(s, 'v2-2').decidedAt).toBeUndefined()
  })

  it('TC-12b 合法观察结论 → 放行（不一致 / 一致 / 截图路径都算事实）', () => {
    for (const text of ['我对照原型看过：一致', '按钮在无材料时仍然不显示', '截图：docs/requirements/REQ-x/evidence/ui.png']) {
      const s = mkSheet()
      applyVerdicts(s, [{ itemId: 'v2-2', status: 'passed', opinion: text }], H, 100, [])
      expect(itemOf(s, 'v2-2').status, text).toBe('passed')
    }
  })

  it('人工项留空 → 沿用既有口径记 unverified（不抛错，不冒充通过）', () => {
    const s = mkSheet()
    applyVerdicts(s, [{ itemId: 'v2-2', status: 'passed' }], H, 100, [])
    expect(itemOf(s, 'v2-2').status).toBe('unverified')
  })
})

describe('三类项判据互不串味（FR-3）', () => {
  it('系统缺口项不吃结果锚点判据（它的 opinion 是处置不是实测）', () => {
    const s = mkSheet()
    applyVerdicts(s, [{ itemId: 'v2-3', status: 'passed', opinion: '确认无需 E2E：纯函数模块，无外部接口' }], H, 100, [])
    expect(itemOf(s, 'v2-3').status).toBe('passed')
  })

  it('failed / not_verifiable 不适用锚点判据（那是意见与原因，不是实测结果）', () => {
    const s1 = mkSheet()
    applyVerdicts(s1, [{ itemId: 'v2-1', status: 'failed', opinion: '有问题' }], H, 100, [])
    expect(itemOf(s1, 'v2-1').status).toBe('failed')
    const s2 = mkSheet()
    applyVerdicts(s2, [{ itemId: 'v2-1', status: 'not_verifiable', opinion: '本机无该环境' }], H, 100, [])
    expect(itemOf(s2, 'v2-1').status).toBe('not_verifiable')
  })
})
