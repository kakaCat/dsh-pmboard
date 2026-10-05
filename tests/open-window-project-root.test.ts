/**
 * 开窗落回源项目（REQ-261004150249-731e FR-1 · t-f2c747）。
 *
 * 【为什么要有这道门】
 * 改造前 `create()` 恒调 `svc.create({})`，新会话落在宿主 `defaultCwd`——实测病灶是
 * 掉进 `~/.dsh/profiles/desktop`，随后往项目里写盘被 `PROJECT_ROOT_MISMATCH` 拒。
 * 本卡把「开到哪儿去」变成**必答项**：
 *   ① 源会话所属 workspace（`resolveSourceProject`）→ `{ workspaceId }`（优先，侧栏直接归组）；
 *   ② 否则源会话自己的工作目录（`exec.agent.session.header.cwd`）→ `{ cwd }`；
 *   ③ 都拿不到 → 回执 `REQBOARD_OPEN_WINDOW_UNAVAILABLE` 且**替身零调用**（不在宿主目录静默建窗）。
 *
 * 【为什么不复用 reqboard_open_window 的既有测试文件】
 * 那条契约（fork / 文案纪律）在 `tests/open-window-tool.test.ts`；本文件只守**落点**，
 * 且刻意用最小替身（不依赖真实 DSH 服务）。
 */
import { describe, it, expect } from 'vitest'
import { openWindow } from '../src/application/use-cases/OpenWindow.js'
import { SessionWindowOpener } from '../src/adapters/SessionWindowOpener.js'
import type { OpenWindowOutcome, UseCaseDeps, WindowCreateOptions, WindowOpenerPort } from '../src/application/ports.js'

const SOURCE = 'session-x'
/** 带会话工作目录的调用上下文（形状照 `exec.agent.session.header.cwd`）。 */
const EXEC_WITH_CWD = { agent: { session: { header: { cwd: '/tmp/proj' } } }, id: SOURCE }
/** 无任何落点信息的调用上下文。 */
const EXEC_WITHOUT_CWD = { agent: { session: { header: {} } }, id: SOURCE }

/** 最小 deps：只给 openWindow 真正用到的两项（会话探针 + 开窗端口）。 */
function depsWith(opener: WindowOpenerPort): UseCaseDeps {
  return {
    session: { windowKey: () => SOURCE, requireLiveDriver: () => undefined },
    windowOpener: opener,
  } as unknown as UseCaseDeps
}

/**
 * 最小替身：记录 `create` 收到的 opts（`withResolve: false` = 不实现可选方法 `resolveSourceProject`）。
 */
function fakeOpener(
  project: WindowCreateOptions | undefined,
  opts: { withResolve?: boolean; createId?: string } = {},
): { opener: WindowOpenerPort; calls: { create: (WindowCreateOptions | undefined)[] } } {
  const calls: { create: (WindowCreateOptions | undefined)[] } = { create: [] }
  const opener: WindowOpenerPort = {
    available: () => true,
    fork: async (): Promise<OpenWindowOutcome> => ({ ok: true, windowKey: 'session-forked' }),
    create: async (o?: WindowCreateOptions): Promise<OpenWindowOutcome> => {
      calls.create.push(o)
      return { ok: true, windowKey: opts.createId ?? 'session-new-0001' }
    },
  }
  if (opts.withResolve !== false) opener.resolveSourceProject = () => project
  return { opener, calls }
}

describe('FR-1：mode=create 先解析源项目落点，再建会话', () => {
  it('① 命中 workspace：入参是 { workspaceId }（且不含 cwd——DSH 二者互斥）', async () => {
    const { opener, calls } = fakeOpener({ workspaceId: 'ws-1' })
    const value = await openWindow(depsWith(opener), { mode: 'create' }, EXEC_WITH_CWD)

    expect(value.success).toBe(true)
    expect(value.window_key).toBe('session-new-0001')
    expect(calls.create).toEqual([{ workspaceId: 'ws-1' }])
    // 同时给会被网关判 bad-request，故 cwd 一个键都不许带
    expect(Object.keys(calls.create[0] ?? {})).toEqual(['workspaceId'])
  })

  it('② 无 workspace 有 cwd：入参是 { cwd }', async () => {
    const { opener, calls } = fakeOpener(undefined)
    await openWindow(depsWith(opener), { mode: 'create' }, EXEC_WITH_CWD)

    expect(calls.create).toEqual([{ cwd: '/tmp/proj' }])
  })

  it('③ 两者都拿不到：响亮失败 REQBOARD_OPEN_WINDOW_UNAVAILABLE 且 create 零调用', async () => {
    // 替身**不实现**可选方法 resolveSourceProject（端口可选，调用方按缺省处理）
    const withoutPort = fakeOpener(undefined, { withResolve: false })
    await expect(openWindow(depsWith(withoutPort.opener), { mode: 'create' }, EXEC_WITHOUT_CWD))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
    expect(withoutPort.calls.create).toHaveLength(0)

    // 实现了但没命中（返回 undefined）：同样响亮失败，同样不建会话
    const noMatch = fakeOpener(undefined)
    await expect(openWindow(depsWith(noMatch.opener), { mode: 'create' }, EXEC_WITHOUT_CWD))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
    expect(noMatch.calls.create).toHaveLength(0)
  })
})

describe('FR-1：适配器组装宿主请求（只取其一）', () => {
  /** 假宿主服务：记录 create 收到的请求体。 */
  function fakeService(sessionId = 'session-host-0001') {
    const requests: ({ cwd?: string; workspaceId?: string } | undefined)[] = []
    const service = {
      create: async (req?: { cwd?: string; workspaceId?: string }) => {
        requests.push(req)
        return { sessionId }
      },
    }
    return { service, requests }
  }

  it('workspaceId 优先：两者都给只发 workspaceId；都不给保持既有 {}', async () => {
    const { service, requests } = fakeService()
    const opener = new SessionWindowOpener(() => service)

    await opener.create({ workspaceId: 'ws-1', cwd: '/tmp/proj' })
    expect(requests).toEqual([{ workspaceId: 'ws-1' }])

    // 旧调用方（无 opts）的请求体逐字节不变
    await opener.create()
    expect(requests[1]).toEqual({})

    // cwd 单独给 → 原样透传
    await opener.create({ cwd: '/tmp/proj' })
    expect(requests[2]).toEqual({ cwd: '/tmp/proj' })
  })

  it('resolveSourceProject：注册表命中 → { workspaceId }；取不到一律 undefined', () => {
    const registry = { list: () => [{ id: 'ws-1', sessionIds: ['other', SOURCE] }] }
    expect(new SessionWindowOpener(() => ({}), () => registry).resolveSourceProject(SOURCE))
      .toEqual({ workspaceId: 'ws-1' })

    // 没命中 / 服务缺 / list 不是函数 / list 抛错 → undefined（调用方响亮失败）
    const noMatch = { list: () => [{ id: 'ws-9', sessionIds: ['other'] }] }
    expect(new SessionWindowOpener(() => ({}), () => noMatch).resolveSourceProject(SOURCE)).toBeUndefined()
    expect(new SessionWindowOpener(() => ({}), () => undefined).resolveSourceProject(SOURCE)).toBeUndefined()
    expect(new SessionWindowOpener(() => ({}), () => ({ list: 'nope' })).resolveSourceProject(SOURCE)).toBeUndefined()
    expect(new SessionWindowOpener(() => ({}), () => ({ list: () => { throw new Error('boom') } })).resolveSourceProject(SOURCE))
      .toBeUndefined()
  })

  it('available() 仍只看 fork（既有契约，本次不动）', () => {
    const service = { create: async () => ({ sessionId: 'session-only-create' }) }
    expect(new SessionWindowOpener(() => service).available()).toBe(false)
  })
})
