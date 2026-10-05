/**
 * 旧看板深链兼容入口单测（REQ-261004111917-f473 · serves: FR-1 · TC-1 / TC-2）。
 *
 * 可证伪点（逐条对应 design/interfaces.md 的契约）：
 *   ① GET → 200，content-type 含 text/html，cache-control=no-store；
 *   ② 中转表达式**同时**带 location.search 与 location.hash（丢 hash = 「定位到需求」直接失效）；
 *   ③ HEAD → 200（同一形状，去体交给 Node）；
 *   ④ 非 GET/HEAD → 405 + allow: GET, HEAD（不吞方法错误）；
 *   ⑤ 逐字节幂等：两次 GET 的 body 相等，且等于导出的常量；
 *   ⑥ 零业务数据：body 不含 REQ- / requirements / tasks 字样。
 *   ⑦ **真 HTTP 一层**（复核 R7 补的护栏）：HEAD 的去体是 **Node 的行为**，
 *      假 res 证明不了它——故补一条真起 `node:http` 的集成用例，端口取 0（随机空闲端口）。
 *
 * 手法：先最小假 req/res（只实现 handler 用到的 writeHead / end），零宿主；
 * 再用真 server 覆盖「Node 去体」这条不属于 handler 的契约。
 */
import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createLegacyBoardRouteHandler,
  LEGACY_BOARD_BODY,
  LEGACY_BOARD_PATHS,
  registerLegacyBoardRoutes,
} from '../src/http/legacy-board-route.js'

interface Captured {
  status: number
  headers: Record<string, string>
  body: string
  endCount: number
}

/** 最小 ServerResponse 替身：只实现 writeHead / end（信封与中转页都只用这两个）。 */
function fakeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: '', endCount: 0 }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status
      captured.headers = headers ?? {}
      return res
    },
    end(body?: string) {
      captured.endCount += 1
      captured.body = body ?? ''
      return res
    },
  }
  return { res: res as unknown as ServerResponse, captured }
}

/** 最小 IncomingMessage 替身：handler 只读 method。 */
function fakeReq(method: string): IncomingMessage {
  return { method } as unknown as IncomingMessage
}

const handler = createLegacyBoardRouteHandler()

describe('旧看板深链兼容入口 /dashboard（REQ-261004111917-f473 FR-1）', () => {
  it('TC-1① GET → 200 + text/html + no-store，且片段被保留', () => {
    const { res, captured } = fakeRes()
    handler(fakeReq('GET'), res)

    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toContain('text/html')
    expect(captured.headers['cache-control']).toBe('no-store')
    expect(captured.body).toContain('location.replace')
    // ② 两个都要在：只带 hash 会丢 query，只带 search 会丢掉 req（定位直接失效）
    expect(captured.body).toContain('location.search')
    expect(captured.body).toContain('location.hash')
    // 表达式形状钉死（反向演练：删掉任一成员 → 本行必红）
    expect(captured.body).toContain('location.replace("/" + location.search + location.hash)')
  })

  it('TC-1③ HEAD → 200（同一形状，去体交给 Node）', () => {
    const { res, captured } = fakeRes()
    handler(fakeReq('HEAD'), res)
    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toContain('text/html')
  })

  it('TC-2④ 非 GET/HEAD → 405 且 allow: GET, HEAD（不吞方法错误）', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const { res, captured } = fakeRes()
      handler(fakeReq(method), res)
      expect(captured.status).toBe(405)
      expect(captured.headers['allow']).toBe('GET, HEAD')
      expect(captured.endCount).toBe(1)
    }
  })

  it('TC-2⑤ 逐字节幂等：两次 GET body 相等且等于导出常量', () => {
    const a = fakeRes()
    const b = fakeRes()
    handler(fakeReq('GET'), a.res)
    handler(fakeReq('GET'), b.res)
    expect(a.captured.body).toBe(b.captured.body)
    expect(a.captured.body).toBe(LEGACY_BOARD_BODY)
  })

  it('TC-2⑥ 零业务数据：中转页不含台账字段字样', () => {
    for (const needle of ['REQ-', 'requirements', 'tasks']) {
      expect(LEGACY_BOARD_BODY).not.toContain(needle)
    }
  })

  it('两条路径（带/不带尾斜杠）都在注册清单里', () => {
    expect([...LEGACY_BOARD_PATHS]).toEqual(['/dashboard', '/dashboard/'])
  })
})

/**
 * 真 HTTP 一层（复核 R7）：HEAD 去体是 Node 的契约，不是 handler 的分支——
 * 假 res 永远证明不了它，所以这里真起一个 server。
 */describe('真 server 上的兼容入口（REQ-261004111917-f473 FR-1 · 复核 R7 护栏）', () => {
  /** 起一个只挂本 handler 的 server，跑完即关（端口 0 = 随机空闲端口，避免占用冲突）。 */
  async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
    const server = createServer((req, res) => handler(req, res))
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const { port } = server.address() as AddressInfo
    try {
      return await fn(`http://127.0.0.1:${port}`)
    } finally {
      await new Promise<void>((resolve) => { server.close(() => resolve()) })
    }
  }

  it('HEAD /dashboard → 200 且**响应体为空**（Node 去体，handler 不自造分支）', async () => {
    await withServer(async (base) => {
      const res = await fetch(base + '/dashboard', { method: 'HEAD' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.text()).toBe('')
    })
  })

  it('GET /dashboard → 200 且体为常量中转页（线级复核同一条契约）', async () => {
    await withServer(async (base) => {
      const res = await fetch(base + '/dashboard')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(LEGACY_BOARD_BODY)
    })
  })
})

/**
 * 注册与回滚（复核 R4）：两条路由是**一组**，第 2 条失败必须把第 1 条撤回去，
 * 不能留下「没有 disposer 的泄漏注册」。
 */
describe('registerLegacyBoardRoutes（成组注册 · 失败回滚 · 幂等撤销）', () => {
  /** 记录注册/撤销的假 webServer；可指定第几次注册抛错。 */
  function fakeRegistrar(throwOnCall?: number): {
    registrar: { register(route: { kind: 'exact'; path: string; handler: unknown }): () => void }
    registered: string[]
    disposed: string[]
  } {
    const registered: string[] = []
    const disposed: string[] = []
    let calls = 0
    return {
      registered,
      disposed,
      registrar: {
        register(route: { kind: string; path: string }) {
          calls += 1
          if (throwOnCall !== undefined && calls === throwOnCall) {
            throw new Error('duplicate exact route "' + route.path + '"')
          }
          registered.push(route.path)
          return () => { disposed.push(route.path) }
        },
      },
    }
  }

  it('两条都注册，按注册顺序落表', () => {
    const { registrar, registered } = fakeRegistrar()
    registerLegacyBoardRoutes(registrar as never)
    expect(registered).toEqual(['/dashboard', '/dashboard/'])
  })

  it('撤销按相反顺序执行，且重复调用幂等（不重复撤销）', () => {
    const { registrar, disposed } = fakeRegistrar()
    const dispose = registerLegacyBoardRoutes(registrar as never)
    dispose()
    dispose()
    expect(disposed).toEqual(['/dashboard/', '/dashboard'])
  })

  it('第 2 条注册抛错 → 第 1 条被回滚，且原始错误照抛（不静默降级）', () => {
    const { registrar, registered, disposed } = fakeRegistrar(2)
    expect(() => registerLegacyBoardRoutes(registrar as never)).toThrow(/duplicate exact route/)
    expect(registered).toEqual(['/dashboard'])
    expect(disposed).toEqual(['/dashboard']) // 已注册者被撤回，无泄漏
  })
})
