/**
 * SSE `build` 帧单测（REQ-261001124111-5d36 t4）。
 *
 * 为什么不去 curl 真服务：那要求宿主进程重启后才拿到新代码，而重启会打断用户正在跑的会话。
 * 这里直接把路由器的 `handleEvents` 拿假 Response 跑一遍——断言的是**同一段代码**，
 * 却不需要部署、也不需要联网。
 *
 * serves: FR-5
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createStagesRouter } from '../src/http/routers/stages.js'
import { clientBuildStamp } from '../src/http/client-build.js'

interface Captured { head: Record<string, unknown>; chunks: string[] }

function capture(): { res: ServerResponse; got: Captured } {
  const got: Captured = { head: {}, chunks: [] }
  const res = {
    writeHead: (status: number, headers: Record<string, unknown>) => { got.head = { status, ...headers } },
    write: (chunk: string) => { got.chunks.push(String(chunk)); return true },
    end: () => { /* 不关流 */ },
    on: () => { /* 连接不关：让订阅与心跳保持，断言写入内容即可 */ },
  } as unknown as ServerResponse
  return { res, got }
}

function makeRouter(panelPolicy?: { refreshMs: number; staleAfterMs: number }) {
  const unsubscribe = (): void => { /* no-op */ }
  const ctx = {
    // B12 阶段④-2-③：SSE 订阅已挂新端口 ⇒ 手搭 ctx 也要给（本用例只用到 subscribe）
    requirementStore: { subscribe: () => unsubscribe },
    taskStore: { subscribe: () => unsubscribe },
    ok: () => { /* 本用例只走 SSE */ },
    deps: panelPolicy !== undefined ? { panelPolicy } : {},
  }
  return createStagesRouter(ctx as never)
}

afterEach(() => { vi.useRealTimers() })

describe('handleEvents 的 build 帧', () => {
  it('连接后立刻发一帧 event: build，带 stamp 与面板策略', () => {
    vi.useFakeTimers()
    const { res, got } = capture()
    const router = makeRouter({ refreshMs: 0, staleAfterMs: 60000 })
    router.handleEvents({ on: () => { /* 不关 */ } } as unknown as IncomingMessage, res)

    const text = got.chunks.join('')
    expect(text).toContain(': connected')
    expect(text).toContain('event: build\n')
    const stamp = clientBuildStamp()
    expect(stamp).toBeDefined()
    expect(text).toContain('"stamp":"' + stamp + '"')
    expect(text).toContain('"panel":{"refreshMs":0,"staleAfterMs":60000}')
  })

  it('未装配策略时仍发戳帧，但不带 panel 键（客户端回落缺省 5000/30000）', () => {
    vi.useFakeTimers()
    const { res, got } = capture()
    makeRouter().handleEvents({ on: () => { /* 不关 */ } } as unknown as IncomingMessage, res)
    const text = got.chunks.join('')
    expect(text).toContain('event: build\n')
    expect(text).not.toContain('"panel"')
  })

  it('既有契约不受影响：无名帧（onmessage 消费）照旧存在，只是此刻没有事件', () => {
    vi.useFakeTimers()
    const { res, got } = capture()
    makeRouter().handleEvents({ on: () => { /* 不关 */ } } as unknown as IncomingMessage, res)
    // 除 build 帧外，本用例不触发任何台账/任务事件 → 不应出现数据帧
    const dataFrames = got.chunks.join('').split('data: ').length - 1
    expect(dataFrames).toBe(1) // 仅 build 帧一条
  })
})
