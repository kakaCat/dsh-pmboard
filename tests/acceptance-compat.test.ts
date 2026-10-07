/**
 * 迁移与兼容（REQ-261006201920-2adc · t6）serves: FR-1, FR-2, FR-3, FR-4
 *
 * 本需求**零 DDL、零迁移**：`resultSuperseded` / `resultChangeReason` / `changeReason` 全部是
 * **加性可选**字段。本文件钉住三件事，缺一件就说明"零迁移"只是口号：
 *
 *   ① **旧台账可读**：缺新字段的历史验收单照常读，且裁决**不会**凭空写出新字段；
 *   ② **旧调用方不炸**：不传 `changeReason` 的裁决（不构成覆盖时）不报错——旧版看板能继续用；
 *   ③ **回滚开关保真**：`DSH_REQBOARD_NO_ITEM_RESULT=1` 时四字段一个都不写（开关承诺"一行退回今天行为"）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyVerdicts } from '../src/application/internal/verdicts.js'
import { itemResultBindingEnabled } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const

/** 旧台账形态的验收项：**只有**旧字段（没有本需求新增的三个）。 */
const legacyItem = (over: Record<string, unknown> = {}) => ({
  id: 'v1-1',
  source: { kind: 'task', taskId: 't-legacy' },
  criterion: '单测全绿',
  evidence: ['e'],
  status: 'pending',
  ...over,
})

function rec(items: unknown[]): RequirementRecord {
  return {
    id: 'REQ-legacy01',
    status: 'accepting',
    comments: [],
    version: 1,
    updatedAt: 0,
    verification: { sheet: { version: 1, items, generatedAt: 1, generatedBy: H } },
  } as unknown as RequirementRecord
}
const itemOf = (r: RequirementRecord, id = 'v1-1') =>
  (r.verification!.sheet!.items as unknown as Record<string, unknown>[]).find(i => i.id === id)!

/** 跑一批裁决并返回裁决后的记录（`applyVerdicts` 内部克隆，读入参看不到结果）。 */
const run = (r: RequirementRecord, verdicts: unknown[]): RequirementRecord =>
  applyVerdicts(r, [], 1, verdicts as never, H, 100, () => 'c-1').requirement

const NEW_FIELDS = ['resultSuperseded', 'resultChangeReason'] as const

afterEach(() => { delete process.env.DSH_REQBOARD_NO_ITEM_RESULT })

describe('形态① 旧台账可读、不产生额外写入', () => {
  it('缺新字段的历史验收单照常读，裁决后仍不带新字段', () => {
    const before = rec([legacyItem({ result: 'npx vitest run tests/a.test.ts → 12 passed', resultSource: 'agent' })])
    const after = run(before, [{ itemId: 'v1-1', status: 'passed' }])
    const it = itemOf(after)
    expect(it.status).toBe('passed')
    // 零输入通过：opinion 取该项 result（既有口径不变），且**不凭空写新字段**
    expect(it.opinion).toBe('npx vitest run tests/a.test.ts → 12 passed')
    for (const f of NEW_FIELDS) expect(it[f]).toBeUndefined()
  })

  it('历史验收单的 items 结构与新代码兼容（无字段即"从未发生过覆盖"）', () => {
    const after = run(rec([legacyItem({ result: 'npx vitest run tests/a.test.ts → 12 passed' })]), [
      { itemId: 'v1-1', status: 'passed', opinion: 'npx vitest run tests/a.test.ts → 12 passed' },
    ])
    // 文本与既有结果相同 ⇒ 不构成覆盖 ⇒ 一个字段都不写（旧口径行为）
    const it = itemOf(after)
    expect(it.resultSource).toBeUndefined()
    for (const f of NEW_FIELDS) expect(it[f]).toBeUndefined()
  })
})

describe('形态② 旧调用方不炸（不传 changeReason 且不构成覆盖）', () => {
  it('本无实测结果时人首次填写 → 不报错、不要求理由（旧版看板可继续用）', () => {
    const after = run(rec([legacyItem()]), [
      { itemId: 'v1-1', status: 'passed', opinion: '我跑了一遍：npx vitest run tests/a.test.ts → 12 passed' },
    ])
    const it = itemOf(after)
    expect(it.status).toBe('passed')
    expect(it.resultSource).toBe('human')
    expect(it.resultChangeReason).toBeUndefined()
  })

  it('零输入通过（不传 opinion 也不传 changeReason）→ 照旧记 unverified，不抛错', () => {
    expect(() => run(rec([legacyItem()]), [{ itemId: 'v1-1', status: 'passed' }])).not.toThrow()
    expect(itemOf(run(rec([legacyItem()]), [{ itemId: 'v1-1', status: 'passed' }])).status).toBe('unverified')
  })

  it('人工项（needsHuman）不因缺 changeReason 被拦——它本就不走覆盖通道', () => {
    const after = run(rec([legacyItem({ needsHuman: true, result: 'agent 的参照材料' })]), [
      { itemId: 'v1-1', status: 'passed', opinion: '我对照原型看过：一致' },
    ])
    const it = itemOf(after)
    expect(it.status).toBe('passed')
    // 参照材料原样保留（不被覆盖、来源不被翻成 human）
    expect(it.result).toBe('agent 的参照材料')
    expect(it.resultSource).toBeUndefined()
  })
})

describe('形态③ 回滚开关保真（四字段一个都不写）', () => {
  it('DSH_REQBOARD_NO_ITEM_RESULT=1 → 覆盖整段跳过（含留档与理由）', () => {
    process.env.DSH_REQBOARD_NO_ITEM_RESULT = '1'
    expect(itemResultBindingEnabled(process.env)).toBe(false)
    const after = run(rec([legacyItem({ result: '旧结果 12 passed', resultSource: 'agent' })]), [
      { itemId: 'v1-1', status: 'passed', opinion: '新结果 15 passed', changeReason: '重跑了' },
    ])
    const it = itemOf(after)
    for (const f of NEW_FIELDS) expect(it[f]).toBeUndefined()
    // 开关下连 `result` 都不由人改写（旧口径：不写 result/resultSource）
    expect(it.result).toBe('旧结果 12 passed')
    expect(it.resultSource).toBe('agent')
  })

  it('开关关闭（缺省）时同一输入才会走覆盖路径 —— 证明上一条不是"恒不写"', () => {
    const after = run(rec([legacyItem({ result: '旧结果 12 passed', resultSource: 'agent' })]), [
      { itemId: 'v1-1', status: 'passed', opinion: '新结果 15 passed', changeReason: '重跑了' },
    ])
    const it = itemOf(after)
    expect(it.result).toBe('新结果 15 passed')
    expect(it.resultSource).toBe('human')
    expect(it.resultSuperseded).toBe('旧结果 12 passed')
    expect(it.resultChangeReason).toBe('重跑了')
  })
})
