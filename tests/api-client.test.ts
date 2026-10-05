/**
 * client/api.ts 回归测试 —— 真实 fetch 语义防线。
 *
 * 背景（2026-09-10 事故）：unwrap 曾把 fetch 的 Promise<Response> 直接当 Response
 * 检查 res.ok（Promise.ok === undefined → 抛 'HTTP undefined'），真实浏览器必挂，
 * 但当时 mock fetch 返回同步对象（非 Promise）→ res.ok 有值 → 测试假通过。
 *
 * 本文件 mock 一律返回「真 Promise<Response>」，与浏览器 fetch 语义一致；
 * 在旧 buggy unwrap 下 fetchState 会抛 'HTTP undefined'，本测试即失败。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

// 每个用例独立替换全局 fetch
const origFetch = globalThis.fetch

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  ))
}

afterEach(() => {
  vi.unstubAllGlobals()
  if (origFetch) globalThis.fetch = origFetch
})

describe('client api unwrap（真实 Promise<Response> 语义）', () => {
  it('fetchState 解析成功响应', async () => {
    mockFetchOnce(200, { success: true, data: { revision: 1, requirements: [], tasks: [], ready: {} } })
    const { fetchState } = await import('../src/client/api.js')
    const state = await fetchState()
    expect(state.revision).toBe(1)
    expect(Array.isArray(state.requirements)).toBe(true)
  })

  it('HTTP 非 200 抛出 HTTP <status>（而非 HTTP undefined）', async () => {
    mockFetchOnce(503, { success: false })
    const { fetchState } = await import('../src/client/api.js')
    await expect(fetchState()).rejects.toThrow('HTTP 503')
  })

  it('success=false 抛出后端 error 文案', async () => {
    mockFetchOnce(200, { success: false, error: '看板未就绪' })
    const { fetchState } = await import('../src/client/api.js')
    await expect(fetchState()).rejects.toThrow('看板未就绪')
  })
})

/**
 * REQ-261003191948-e94a · t5 / FR-4：非 2xx 时**把服务端说的话带上来**。
 *
 * 修复前 unwrap 只有一行 `throw new ApiError('HTTP ' + res.status)`——响应体被直接丢弃。
 * 2026-10-03 事故里服务端明明回了「台账未迁移 + 迁移命令」，页面却只显示
 * 「加载失败：Error: HTTP 404」，用户无从下手。本组把"听得见"钉死。
 */
describe('client api 非 2xx 错误体透出（REQ-261003191948-e94a t5）', () => {
  it('503 + {error,code,hint} → message 用服务端原文、code 与 hint 透传（A4）', async () => {
    const hint = '检测到 legacy 单册但数据根尚未迁移（缺 meta.json）。请执行：\n'
      + 'node --import tsx/esm scripts/migrate-ledger-v10.ts --file /tmp/a.json --out /tmp/reqboard --apply'
    mockFetchOnce(503, {
      success: false,
      error: '检测到 legacy 单册 /tmp/a.json，但数据根 /tmp/reqboard 尚未迁移（缺 meta.json）。',
      code: 'REQBOARD_REQUIRES_MIGRATION',
      hint,
    })
    const { fetchState, ApiError } = await import('../src/client/api.js')
    const err = await fetchState().then(() => undefined, (e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as InstanceType<typeof ApiError>
    expect(apiErr.message).toContain('尚未迁移')
    expect(apiErr.message, '不再是那个什么都没说的状态码').not.toBe('HTTP 503')
    expect(apiErr.code).toBe('REQBOARD_REQUIRES_MIGRATION')
    expect(apiErr.hint, 'hint 必须逐字透传（客户端不加工服务端的命令）').toBe(hint)
  })

  it('503 且服务端没给 error → 退回 HTTP <status>，不编原因（A4 反向）', async () => {
    mockFetchOnce(503, { success: false })
    const { fetchState } = await import('../src/client/api.js')
    const err = await fetchState().then(() => undefined, (e: unknown) => e)
    expect((err as Error).message).toBe('HTTP 503')
    expect((err as { hint?: string }).hint).toBeUndefined()
  })

  it('非 JSON 响应体也退回状态码（不抛解析错、不编原因）', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response('dsh web authentication required', { status: 401 })),
    ))
    const { fetchState } = await import('../src/client/api.js')
    const err = await fetchState().then(() => undefined, (e: unknown) => e)
    expect((err as Error).message).toBe('HTTP 401')
    expect((err as { hint?: string }).hint).toBeUndefined()
  })
})

/**
 * REQ-261003191948-e94a · t6 / FR-4：看板报错区把命令渲染出来（可框选复制）。
 */
describe('buildError 渲染可复制命令（REQ-261003191948-e94a t6）', () => {
  it('有 hint → 同时渲染原因与命令；无 hint → 不出现命令块（旧调用点逐字节不变）', async () => {
    const { buildError } = await import('../src/client/render/dom-utils.js')
    const hint = 'node --import tsx/esm scripts/migrate-ledger-v10.ts --file /tmp/a.json --out /tmp/reqboard --apply'
    const withHint = buildError('检测到 legacy 单册，数据根尚未迁移', hint)
    expect(withHint).toContain('检测到 legacy 单册')
    expect(withHint).toContain('migrate-ledger-v10.ts')
    expect(withHint).toContain('dsh-pm-error-hint')

    const withoutHint = buildError('检测到 legacy 单册')
    expect(withoutHint).toContain('检测到 legacy 单册')
    expect(withoutHint).not.toContain('dsh-pm-error-hint')
    // 空串 / 纯空白等同于没给（不渲染空命令块）
    expect(buildError('x', '   ')).not.toContain('dsh-pm-error-hint')
  })

  it('message 与 hint 都被转义（hint 含用户主目录，不转义会破 HTML）', async () => {
    const { buildError } = await import('../src/client/render/dom-utils.js')
    const html = buildError('<b>坏</b>', 'node x.js --file /tmp/<a>&b --apply')
    expect(html).not.toContain('<b>坏</b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&lt;a&gt;&amp;b')
  })
})
