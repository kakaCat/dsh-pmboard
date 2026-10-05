/**
 * 验收项结果绑定（REQ-261001184609-cecb FR-1 · t1/t2）
 *
 * 目标：验证是执行方的活——agent 提交验收材料时逐项落 result，
 * 弹框随后只问裁决，人不再重抄命令输出。
 */
import { describe, it, expect } from 'vitest'
import type { VerificationItem as ProtocolItem } from '../src/shared/protocol.js'
import type { VerificationItem as ClientItem } from '../src/client/types.js'

/**
 * 契约**三处同步**锁（REQ-261001184609-cecb t6）：
 * 这个需求的字段散在三处——domain 的 SheetItemLike、protocol.VerificationItem、client/types.VerificationItem。
 * 实测教训：我第一版只改了 domain 那一处，tsc 直接 212→216，弹框拿到的是没有字段的类型。
 * 靠记性必漏，故用类型断言锁死：任一处漏字段，**本文件编译失败**，跑不起来。
 */
type HasAll<T> = 'result' extends keyof T
  ? 'resultSource' extends keyof T
    ? 'needsHuman' extends keyof T
      ? 'humanReason' extends keyof T ? true : never
      : never
    : never
  : never

import { bindItemResults, needsResultInput, humanNotice, itemResultBindingEnabled, type SheetItemLike } from '../src/domain/workflow/AcceptanceSheetSpec.js'

const item = (id: string): SheetItemLike => ({
  id,
  source: { kind: 'requirement', criterion: 'c' } as never,
  criterion: 'c',
  evidence: [],
  status: 'pending',
})

describe('bindItemResults（FR-1 材料即结果）', () => {
  it('A1：<itemId> :: <结果> → 该项 result 落库，来源记为 agent', () => {
    const items = [item('t-abc'), item('t-def')]
    const r = bindItemResults(items, ['t-abc :: npx vitest run x → 6 passed', '其他整单证据'])
    expect(r.bound).toBe(1)
    expect(items[0].result).toBe('npx vitest run x → 6 passed')
    expect(items[0].resultSource).toBe('agent')
    expect(items[1].result).toBeUndefined()
  })

  it('A5：无 :: 的老写法不绑定（整单证据语义不变）', () => {
    const items = [item('t-abc')]
    const r = bindItemResults(items, ['npx vitest run 全绿'])
    expect(r.bound).toBe(0)
    expect(items[0].result).toBeUndefined()
  })

  it('不伪造：键不匹配记入 unmatched，且不改任何项', () => {
    const items = [item('t-abc')]
    const r = bindItemResults(items, ['t-nope :: 结果', ' :: 只有结果', 't-abc :: '])
    expect(r.bound).toBe(0)
    expect(r.unmatched).toEqual(['t-nope'])
    expect(items[0].result).toBeUndefined()
  })

  it('结果超长截断到 500 字符（台账存摘要，不存整屏）', () => {
    const items = [item('t-abc')]
    bindItemResults(items, ['t-abc :: ' + 'x'.repeat(900)])
    expect(items[0].result).toHaveLength(500)
  })
  it('A2：该项已有 agent 结果 → 不再要人填（弹框只问裁决）', () => {
    expect(needsResultInput({ result: 'npx vitest run x → 6 passed' })).toBe(false)
  })

  it('A3：没有结果 → 仍要人填（不冒充已复核）', () => {
    expect(needsResultInput({})).toBe(true)
    expect(needsResultInput({ result: '   ' })).toBe(true)
  })

  it('A4：需人工确认的项永远要人填，且题干带理由', () => {
    expect(needsResultInput({ result: 'agent 看到的不算', needsHuman: true })).toBe(true)
    expect(humanNotice({ needsHuman: true, humanReason: '界面视觉' })).toBe('需人工确认：界面视觉')
    expect(humanNotice({ needsHuman: true })).toBe('需人工确认')
    expect(humanNotice({})).toBe('')
  })
  it('A6：人填过的结果不被 agent 回填覆盖（证据只增不减）', () => {
    const items = [item('t-abc')]
    items[0].result = '人工复核：界面看起来对'
    items[0].resultSource = 'human'
    const r = bindItemResults(items, ['t-abc :: agent 的命令输出'])
    expect(r.bound).toBe(0)
    expect(items[0].result).toBe('人工复核：界面看起来对')
    expect(items[0].resultSource).toBe('human')
  })

  it('A7：回滚开关关掉后不自动回填（回到旧口径）', () => {
    expect(itemResultBindingEnabled({})).toBe(true)
    expect(itemResultBindingEnabled({ DSH_REQBOARD_NO_ITEM_RESULT: '1' })).toBe(false)
    expect(itemResultBindingEnabled({ DSH_REQBOARD_NO_ITEM_RESULT: 'false' })).toBe(true)
  })
  it('A8：契约三处同步（domain / protocol / client）——任一处漏字段则本文件编译失败', () => {
    const p: HasAll<ProtocolItem> = true
    const c: HasAll<ClientItem> = true
    const d: HasAll<SheetItemLike> = true
    expect([p, c, d]).toEqual([true, true, true])
  })
})
