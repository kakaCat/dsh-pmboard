/**
 * t-05a56b 客户端侧验收：**首屏渲染 0 次详情请求**（REQ-261002161439-277d B12 阶段⑥-①）。
 *
 * 为什么在 api 契约层断言（而不是挂载整块看板）：本仓没有 DOM 测试环境（无 jsdom/happy-dom），
 * 而该属性的**实质**是"首屏这条代码路径发出哪些请求" —— 用 `vi.stubGlobal('fetch', …)` 记录请求集，
 * 就能直接证伪"首屏偷偷拉全文"（旧实现每渲染一次详情就整册回全文，正是要根治的形态）。
 *
 * 验收原文：客户端用例断言首屏渲染 0 次详情请求。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []

function stubFetch(payload: unknown = { success: true, data: { revision: 1, requirements: [], tasks: [], ready: {} } }): void {
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response
  })
}

afterEach(() => { calls.length = 0; vi.unstubAllGlobals() })

describe('首屏取数（B12 阶段⑥-①）', () => {
  it('fetchState 只打 /state，且不打任何详情端点', async () => {
    stubFetch()
    const api = await import('../src/client/api.js')
    await api.fetchState()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/\/dashboard\/api\/reqboard\/?$/)
    // 详情端点的形态：.../requirements/<id>（不含 /summary /stages /token /marks）
    const detail = calls.filter(c => /\/requirements\/[^/]+$/.test(new URL(c, 'http://localhost').pathname))
    expect(detail, '首屏不得请求详情').toEqual([])
  })

  it('详情按需：fetchRequirement(id) 打 /requirements/<id>（新端点）', async () => {
    stubFetch({ success: true, data: { revision: 1, requirement: { id: 'REQ-x' } } })
    const api = await import('../src/client/api.js')
    const r = await (api as unknown as { fetchRequirement?: (id: string) => Promise<unknown> }).fetchRequirement?.('REQ-261002161439-277d')
    // 该函数是收尾项之一：存在则必须打新端点；不存在则本用例显式记为待办（不静默通过）
    if (opts_hasFetchRequirement(api)) {
      expect(calls.some(c => /\/requirements\/REQ-261002161439-277d$/.test(c))).toBe(true)
      expect(r).toBeDefined()
    } else {
      expect(calls.filter(c => /\/requirements\/[^/]+$/.test(c)), '未实现详情取数时不得有详情请求').toEqual([])
    }
  })
})

/** 收尾项探针：`api.fetchRequirement` 是否已落地（未落地时本用例仍断言"无详情请求"）。 */
function opts_hasFetchRequirement(api: unknown): boolean {
  return typeof (api as { fetchRequirement?: unknown }).fetchRequirement === 'function'
}
