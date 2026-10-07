/**
 * 覆盖 agent 实测结果必须带变更理由（REQ-261006201920-2adc FR-3 · TC-13/14/15 · D-3）serves: FR-3
 *
 * 缺陷形态：人覆盖 agent 的实测结果时，代码只把 `result` 改成人的文本、把来源翻成 `human`——
 * agent 的**原始证据被静默抹掉**，「谁改的、改之前是什么、为什么改」同时不可考。
 *
 * 口径（本需求）：覆盖是一个**原子四元组**——`result` + `resultSource='human'`
 * + `resultSuperseded`（原文）+ `resultChangeReason`（理由），要么一起写、要么一个都不写；
 * 缺理由时**该批被拒且台账零改动**（不落半批）。
 *
 * 本文件同时是**反向演练 RV-4 的载体**：把覆盖理由校验改成恒真，
 * 「缺理由即拒」的用例必然变红；还原即绿。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyVerdicts, materializeReworkFromSheet } from '../src/application/internal/verdicts.js'
import { itemResultBindingEnabled } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const

/** 一条 agent 已落章实测结果的验收项（覆盖场景的起点）。 */
const agentItem = (over: Record<string, unknown> = {}) => ({
  id: 'v1-1',
  source: { kind: 'task', taskId: 't-ov0001' },
  criterion: '单测全绿',
  evidence: ['e'],
  status: 'pending',
  result: 'npx vitest run tests/a.test.ts → 12 passed',
  resultSource: 'agent',
  ...over,
})

function rec(items: unknown[]): RequirementRecord {
  return {
    id: 'REQ-ov0001',
    status: 'accepting',
    comments: [],
    version: 1,
    updatedAt: 0,
    verification: { sheet: { version: 1, items, generatedAt: 1, generatedBy: H } },
  } as unknown as RequirementRecord
}
const itemOf = (r: RequirementRecord, id = 'v1-1') =>
  (r.verification!.sheet!.items as unknown as Record<string, unknown>[]).find(i => i.id === id)!

/**
 * 跑一批裁决，返回**裁决后的需求记录**。
 * 注意 `applyVerdicts` 内部 `structuredClone` 后改克隆体——读入参永远看不到结果（本用例第一版就踩了）。
 */
const run = (r: RequirementRecord, verdicts: unknown[]): RequirementRecord =>
  applyVerdicts(r, [], 1, verdicts as never, H, 100, () => 'c-1').requirement

afterEach(() => { delete process.env.DSH_REQBOARD_NO_ITEM_RESULT })

describe('覆盖 = 原子四元组（FR-3 · TC-13 / TC-14）', () => {
  it('TC-14 带理由的覆盖：四元组一次写全', () => {
    const it = itemOf(run(rec([agentItem()]), [
      { itemId: 'v1-1', status: 'passed', opinion: '重跑后 15 passed', changeReason: 'agent 跑的是旧分支' },
    ]))
    expect(it.result).toBe('重跑后 15 passed')
    expect(it.resultSource).toBe('human')
    expect(it.resultSuperseded).toBe('npx vitest run tests/a.test.ts → 12 passed')
    expect(it.resultChangeReason).toBe('agent 跑的是旧分支')
  })

  it('TC-14b 重复覆盖：resultSuperseded 保留**最初那次** agent 原文', () => {
    const first = run(rec([agentItem()]), [
      { itemId: 'v1-1', status: 'passed', opinion: '第一次改（npx vitest run tests/a.test.ts → 12 passed）', changeReason: '理由一' },
    ])
    // 二次覆盖：必须把**上一次返回的记录**喂进去（每次都克隆），且意见带锚点（否则记 unverified 不写覆盖）
    const it = itemOf(run(first, [
      { itemId: 'v1-1', status: 'passed', opinion: '第二次改（npx vitest run tests/b.test.ts → 9 passed）', changeReason: '理由二' },
    ]))
    expect(it.result).toContain('tests/b.test.ts')
    expect(it.resultChangeReason).toBe('理由二')
    expect(it.resultSuperseded).toBe('npx vitest run tests/a.test.ts → 12 passed')
  })

  it('TC-13 缺理由的覆盖 → 拒（code=result_change_reason_required）且台账四字段零改动', () => {
    const r = rec([agentItem()])
    const before = JSON.stringify(itemOf(r))
    try {
      run(r, [{ itemId: 'v1-1', status: 'passed', opinion: '重跑后 15 passed' }])
      throw new Error('应当抛错')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('result_change_reason_required')
      expect((err as Error).message).toContain('不覆盖')
    }
    expect(JSON.stringify(itemOf(r))).toBe(before)
  })
})

describe('不构成覆盖时不写留档（FR-3 · TC-15）', () => {
  it('TC-15 文本与 agent 原文相同（没动预填值）→ 三个新字段一个都不写', () => {
    const it = itemOf(run(rec([agentItem()]), [
      { itemId: 'v1-1', status: 'passed', opinion: 'npx vitest run tests/a.test.ts → 12 passed' },
    ]))
    expect(it.resultSuperseded).toBeUndefined()
    expect(it.resultChangeReason).toBeUndefined()
    expect(it.resultSource).toBe('agent')
    expect(it.status).toBe('passed')
  })

  it('本来就没有 agent 结果 → 人首次填写不算覆盖，不要求理由（旧客户端兼容）', () => {
    const it = itemOf(run(rec([agentItem({ result: undefined, resultSource: undefined })]), [
      { itemId: 'v1-1', status: 'passed', opinion: 'npx vitest run tests/a.test.ts → 12 passed' },
    ]))
    expect(it.resultSource).toBe('human')
    expect(it.resultChangeReason).toBeUndefined()
  })

  it('系统缺口项即使文本变了也不走覆盖通道（它的 opinion 是处置）', () => {
    const it = itemOf(run(rec([agentItem({ gapKind: 'e2e', result: '旧处置文本', criterion: 'E2E 覆盖：无' })]), [
      { itemId: 'v1-1', status: 'passed', opinion: '确认无需 E2E：纯函数模块，无外部接口' },
    ]))
    expect(it.resultChangeReason).toBeUndefined()
  })
})

describe('回滚开关与返工卡继承（FR-3 / FR-2）', () => {
  it('DSH_REQBOARD_NO_ITEM_RESULT=1 → 覆盖整段跳过，四字段一个都不写', () => {
    process.env.DSH_REQBOARD_NO_ITEM_RESULT = '1'
    expect(itemResultBindingEnabled(process.env)).toBe(false)
    const it = itemOf(run(rec([agentItem()]), [
      { itemId: 'v1-1', status: 'passed', opinion: '重跑后 15 passed', changeReason: '理由' },
    ]))
    expect(it.resultChangeReason).toBeUndefined()
    expect(it.resultSuperseded).toBeUndefined()
  })

  it('返工卡把继承来的四类字段搬到卡上（不继承 prototypeRefs = UI 卡生成即死路）', () => {
    const failed = agentItem({ status: 'failed', opinion: '没落实', criterion: '与裁定对照（逐条说明如何落实）' })
    const r = rec([failed])
    const src = {
      id: 't-ov0001', title: 'UI 卡', phase: 'ui', side: 'frontend', scope: { apis: [], tables: [], files: [] },
      acceptance: 'npx vitest run tests/x.test.ts → 全绿',
      requirementRefs: ['FR-3'], prototypeRefs: ['prototypes/verify-disposition.html#FR-3'],
      decisionRefs: ['D-3'], footprint: { files: 5, anchors: 8, chars: 3200 },
    } as unknown as TaskRecord
    const [card] = materializeReworkFromSheet(r, [src], H, 100)
    expect(card!.requirementRefs).toEqual(['FR-3'])
    expect(card!.prototypeRefs).toEqual(['prototypes/verify-disposition.html#FR-3'])
    expect(card!.decisionRefs).toEqual(['D-3'])
    expect(card!.footprint).toEqual({ files: 5, anchors: 8, chars: 3200 })
    // 标准承接来源卡（判据原文不可照着验）
    expect(card!.acceptance).toBe('npx vitest run tests/x.test.ts → 全绿')
  })
})
