/**
 * 看板「清理误物化重做卡」入口（REQ-261005122915-9f90 t6 / FR-5）。
 *
 * 这条验收针对本需求查出的**第二个缺口**：设计文档（REQ-261004121649-bfa7 `design/interfaces.md`
 * 与 `use-cases.md`）写明「人在看板点按钮 → POST /req/rollback-cleanup」，服务端路由也交付了，
 * 但客户端**从未接线**——看板里根本没有这个按钮，人无法自救。
 *
 * 三条验收（对齐 t6 卡）：
 *  ① 有回退记录 → 操作条出现该按钮，且 `data-seq` 等于台账上的回退序号；
 *  ② 无回退记录 → 操作条**不含**该按钮（不给点了必被拒的假按钮）；
 *  ③ `api.rollbackCleanup` 打点正确（路径 + body 形状）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderActionBar } from '../src/client/views/stage-detail.ts'
import type { RequirementRecord } from '../src/client/types.ts'

const origFetch = globalThis.fetch

afterEach(() => {
  vi.unstubAllGlobals()
  if (origFetch) globalThis.fetch = origFetch
})

function reqWith(over: Record<string, unknown> = {}): RequirementRecord {
  return {
    id: 'REQ-abc123', title: '需求', description: '', status: 'implementing', category: 'feature',
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  } as unknown as RequirementRecord
}

describe('需求详情操作条 · 清理误物化重做卡入口（FR-5 ①②）', () => {
  it('有回退记录 → 渲染按钮，data-seq 取台账序号', () => {
    const html = renderActionBar(reqWith({
      rollback: { from: 'implementing', to: 'decomposing', seq: 2, reason: '回退重修' },
    }))
    expect(html).toContain('data-action="rollback-cleanup"')
    expect(html).toContain('data-seq="2"')
    expect(html).toContain('data-id="REQ-abc123"')
  })

  it('存量回退记录缺 seq → 按 1 计（与 currentRollbackSeq 同口径）', () => {
    const html = renderActionBar(reqWith({ rollback: { from: 'implementing', to: 'decomposing' } }))
    expect(html).toContain('data-action="rollback-cleanup"')
    expect(html).toContain('data-seq="1"')
  })

  it('无回退记录 → 不渲染该按钮（不给假按钮）', () => {
    const html = renderActionBar(reqWith())
    expect(html).not.toContain('rollback-cleanup')
    expect(html).not.toContain('清理误物化重做卡')
  })

  it('终态（archived）只读：即便有回退记录也不渲染操作条', () => {
    const html = renderActionBar(reqWith({
      status: 'archived',
      rollback: { from: 'implementing', to: 'decomposing', seq: 1 },
    }))
    expect(html).toBe('')
  })
})

describe('api.rollbackCleanup · 打点与 body（FR-5 ③）', () => {
  it('POST /dashboard/api/reqboard/req/rollback-cleanup，带上 id / rollbackSeq / reason', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'REQ-abc123', rollbackSeq: 1, canceled: 3, restoredLinks: 0,
          matchedBy: 'lastMaterialized', skipped: [], note: '按该次回退记录的物化清单精确匹配',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))
    const { rollbackCleanup } = await import('../src/client/api.js')

    const out = await rollbackCleanup({ id: 'REQ-abc123', rollbackSeq: 1, reason: '看板需求详情：清理误物化重做卡' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/dashboard/api/reqboard/req/rollback-cleanup')
    expect(calls[0]!.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      id: 'REQ-abc123', rollbackSeq: 1, reason: '看板需求详情：清理误物化重做卡',
    })
    // 回执如实透出（看板逐条摊开 skipped 的原因）
    expect(out.canceled).toBe(3)
    expect(out.matchedBy).toBe('lastMaterialized')
    expect(out.note).toContain('精确匹配')
  })

  it('服务端拒绝时原样抛出（错误码不被吞）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      success: false, error: '清场被拒：回退序号 9 不存在', code: 'REQBOARD_UNKNOWN_ROLLBACK_SEQ',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))))
    const { rollbackCleanup, ApiError } = await import('../src/client/api.js')
    await expect(rollbackCleanup({ id: 'REQ-abc123', rollbackSeq: 9 })).rejects.toBeInstanceOf(ApiError)
    await expect(rollbackCleanup({ id: 'REQ-abc123', rollbackSeq: 9 })).rejects.toThrow('回退序号 9 不存在')
  })
})
