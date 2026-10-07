/**
 * 系统缺口项处置模板与「处置为空即不可归档」（REQ-261006201920-2adc FR-4 · TC-16/17/18）serves: FR-4
 *
 * 缺陷形态：系统报出的缺口项（E2E 缺口 / 孤儿用例 / 三方一致性 / 追溯断链）点「通过」时
 * 只要求处置**非空**——于是「好的」「知道了」也算数。实测台账 106 条系统项通过里，
 * 命中「补了 X」/「确认无需，因为 Y」措辞的是 **0 条**（现状把证据原文粘进处置栏，或干脆空着）。
 *
 * 口径（本需求）：处置须命中**两义模板之一**并给出对象或理由（已处置 / 确认无需）；
 * 且「处置无效」的系统项**不算已裁决** —— 归档门读的 `isFullyDecided` / `sheetGateStatus`
 * 因此不放行（TC-17 逆验证）。
 *
 * 本文件同时是**反向演练 RV-5 的载体**：把处置判据改回「非空即可」，
 * 模板断言与 TC-17 必然变红；还原即绿。
 */
import { describe, it, expect } from 'vitest'
import {
  applyVerdicts,
  dispositionMissingItems,
  isFullyDecided,
  isValidDisposition,
  sheetGateStatus,
  DISPOSITION_TEMPLATE,
  type SheetItemLike,
  type SheetLike,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const

/** 第二项（普通项）已裁决的形态：TC-17 要单独检验系统项那一条的放行效果。 */
const DONE_PLAIN: Partial<SheetItemLike> = { status: 'passed', opinion: 'npx vitest run tests/x.test.ts → 12 passed', decidedAt: 1, decidedBy: H }

function mkSheet(over: Partial<SheetItemLike> = {}, plainOver: Partial<SheetItemLike> = {}): SheetLike {
  return {
    version: 3,
    items: [
      { id: 'v3-1', source: { kind: 'requirement' }, criterion: 'E2E 覆盖：无', evidence: ['e'], status: 'pending', gapKind: 'e2e', ...over },
      { id: 'v3-2', source: { kind: 'task', taskId: 't-a' }, criterion: '单测全绿', evidence: ['e'], status: 'pending', ...plainOver },
    ],
    generatedAt: 1,
    generatedBy: H,
  }
}
const systemItemOf = (s: SheetLike): SheetItemLike => s.items.find(i => i.id === 'v3-1')!
const plainItemOf = (s: SheetLike): SheetItemLike => s.items.find(i => i.id === 'v3-2')!

describe('处置模板两义（FR-4 · TC-16 / TC-18）', () => {
  it('词表自证：两义各一例命中，空话不命中（判据非空转）', () => {
    expect(DISPOSITION_TEMPLATE.source.length).toBeGreaterThan(0)
    expect(isValidDisposition('补了 E2E 用例：tests/e2e-x.test.ts')).toBe(true)
    expect(isValidDisposition('确认无需 E2E：纯函数模块，无外部接口')).toBe(true)
    expect(isValidDisposition('好的')).toBe(false)
    expect(isValidDisposition('知道了')).toBe(false)
    expect(isValidDisposition('')).toBe(false)
    expect(isValidDisposition('补了')).toBe(false) // 太短：没给出补了什么
  })

  it('TC-16 命中模板 → 放行', () => {
    for (const text of ['补了 E2E 用例：tests/e2e-x.test.ts', '确认无需 E2E：纯函数模块，无外部接口']) {
      const s = mkSheet()
      applyVerdicts(s, [{ itemId: 'v3-1', status: 'passed', opinion: text }], H, 100, [])
      expect(systemItemOf(s).status, text).toBe('passed')
    }
  })

  it('TC-16b 空话 / 空 → 拒收，且文案给出两种合法写法', () => {
    for (const text of ['好的', '']) {
      const s = mkSheet()
      try {
        applyVerdicts(s, [{ itemId: 'v3-1', status: 'passed', opinion: text }], H, 100, [])
        throw new Error('应当抛错')
      } catch (err) {
        expect((err as { code?: string }).code, text).toBe('system_item_disposition_required')
        expect((err as Error).message).toContain('补了')
        expect((err as Error).message).toContain('确认无需')
      }
      // 先验后改：被拒后不留半批已改
      expect(systemItemOf(s).status).toBe('pending')
    }
  })

  it('TC-18 普通项不受处置模板约束（贴实测结果即通过）', () => {
    const s = mkSheet()
    applyVerdicts(s, [{ itemId: 'v3-2', status: 'passed', opinion: 'npx vitest run tests/x.test.ts → 12 passed' }], H, 100, [])
    expect(plainItemOf(s).status).toBe('passed')
  })
})

describe('TC-17 逆验证：处置为空即不可归档（FR-4）', () => {
  it('构造「系统项已通过但处置为空」→ isFullyDecided=false 且门状态 pending', () => {
    // 绕过 applyVerdicts 直接构造：模拟历史数据 / 其它通道写进来的形态
    const s = mkSheet({ status: 'passed', opinion: undefined, decidedAt: 1, decidedBy: H })
    expect(dispositionMissingItems(s)).toEqual(['v3-1'])
    expect(isFullyDecided(s)).toBe(false)
    expect(sheetGateStatus(s)).toBe('pending')
  })

  it('处置补上之后 → 同一张单转为可归档', () => {
    const s = mkSheet({ status: 'passed', opinion: '确认无需 E2E：纯函数模块，无外部接口', decidedAt: 1, decidedBy: H }, DONE_PLAIN)
    expect(dispositionMissingItems(s)).toEqual([])
    expect(isFullyDecided(s)).toBe(true)
    expect(sheetGateStatus(s)).toBe('passed')
  })

  it('处置「有字但无效」与「为空」同罪（不许用『好的』混过去）', () => {
    const s = mkSheet({ status: 'passed', opinion: '好的', decidedAt: 1, decidedBy: H })
    expect(dispositionMissingItems(s)).toEqual(['v3-1'])
    expect(isFullyDecided(s)).toBe(false)
    expect(sheetGateStatus(s)).toBe('pending')
  })

  it('两道放行口径同源：isFullyDecided 与 sheetGateStatus 不会给出相反结论', () => {
    for (const opinion of [undefined, '好的', '补了 E2E 用例：tests/e2e-x.test.ts']) {
      const s = mkSheet({ status: 'passed', opinion, decidedAt: 1, decidedBy: H })
      // isFullyDecided=false ⟺ 门状态不是 passed（除 failed/blocked 另算）
      expect(isFullyDecided(s)).toBe(sheetGateStatus(s) === 'passed')
    }
  })

  it('不可验收（not_verifiable）不因本模板被卡住（仍按既有规则算已裁决）', () => {
    const s = mkSheet({ status: 'not_verifiable', opinion: '本机无该运行环境', decidedAt: 1, decidedBy: H }, DONE_PLAIN)
    expect(dispositionMissingItems(s)).toEqual([])
    expect(isFullyDecided(s)).toBe(true)
  })
})
