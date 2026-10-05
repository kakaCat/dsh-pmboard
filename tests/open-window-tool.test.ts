/**
 * reqboard_open_window：用 DSH 现成的会话分支开一个新窗口（REQ-261003215944-9e04 FR-1 / FR-8 · t4）。
 *
 * 【为什么要有这道门】
 * 本仓的「窗口码」就是 root agent 的 id、也就是**会话 id**。所以"开一个新窗口"这件事
 * 完全等价于"让 DSH 建一个新会话"。本卡把它接上 DSH 的 `sessionController.fork/create`，
 * 并守住两条**诚实性**：
 *   ① 造不出并列窗口就直说——回执里**不许**出现「已打开」；
 *   ② 拿不到会话 id（服务缺失 / 宿主返回同 id / 抛错）时**响亮失败**，
 *      绝不返回一个假窗口码（假码会让下游往不存在的窗口投递）。
 *
 * 【四个层次守护（任一被回退即红）】
 *   1. fork 成功：窗口码 ≠ 源窗口、以 `session-` 开头，且 `parent_session_id` = 源窗口；
 *   2. 无完成回合：`session/fork-unavailable` → REQBOARD_OPEN_WINDOW_UNAVAILABLE，并提示改用 mode=create；
 *   3. 服务缺失：响亮失败（REQBOARD_OPEN_WINDOW_UNAVAILABLE），不放行、不伪造；
 *   4. 文案纪律：回执 `degraded_note` 含「请在侧栏打开」、**不含**「已打开」。
 */
import { describe, it, expect } from 'vitest'
import { openWindow } from '../src/application/use-cases/OpenWindow.js'
import { SessionWindowOpener } from '../src/adapters/SessionWindowOpener.js'
import { OPEN_WINDOW_DEGRADED_NOTE } from '../src/application/use-cases/OpenWindow.js'
import type { UseCaseDeps, WindowOpenerPort } from '../src/application/ports.js'

const WINDOW_A = 'session-278681bb-b160-4067-8740-3d5a0f2c7426'

/** 最小 deps：只给 openWindow 真正用到的两项（session 探针 + 开窗端口）。 */
function depsWith(opener: WindowOpenerPort | undefined): UseCaseDeps {
  return {
    session: {
      windowKey: () => WINDOW_A,
      requireLiveDriver: () => undefined,
    },
    ...(opener !== undefined ? { windowOpener: opener } : {}),
  } as unknown as UseCaseDeps
}

/** 假宿主服务：记录 fork/create 收到的入参，便于断言"是不是真的调了宿主"。 */
function fakeService(opts: {
  forkId?: string | (() => string)
  createId?: string
  forkError?: unknown
}) {
  const calls: { fork: { sessionId: string; atSeq?: number }[]; create: number } = { fork: [], create: 0 }
  const service = {
    fork: async (req: { sessionId: string; atSeq?: number }) => {
      calls.fork.push(req)
      if (opts.forkError !== undefined) throw opts.forkError
      const id = typeof opts.forkId === 'function' ? opts.forkId() : opts.forkId
      return { sessionId: id }
    },
    create: async () => {
      calls.create += 1
      return { sessionId: opts.createId }
    },
  }
  return { service, calls }
}

describe('reqboard_open_window（FR-1 / FR-8）', () => {
  it('fork 成功：窗口码是新会话且 ≠ 源窗口，parent_session_id 指向源', async () => {
    const { service, calls } = fakeService({ forkId: 'session-child-0001' })
    const value = await openWindow(depsWith(new SessionWindowOpener(() => service)), {}, {})

    expect(value.success).toBe(true)
    expect(value.mode).toBe('fork')
    expect(value.window_key).toBe('session-child-0001')
    expect(value.window_key).not.toBe(WINDOW_A)
    expect(value.window_key.startsWith('session-')).toBe(true)
    expect(value.parent_session_id).toBe(WINDOW_A)
    // 真的调了宿主，而不是自己编一个 id
    expect(calls.fork).toEqual([{ sessionId: WINDOW_A }])
  })

  it('fork 传 at_seq：切点原样透传给宿主', async () => {
    const { service, calls } = fakeService({ forkId: 'session-child-0002' })
    await openWindow(depsWith(new SessionWindowOpener(() => service)), { atSeq: 42 }, {})
    expect(calls.fork).toEqual([{ sessionId: WINDOW_A, atSeq: 42 }])
  })

  it('无完成回合：REQBOARD_OPEN_WINDOW_UNAVAILABLE，并提示改用 mode=create', async () => {
    const err = Object.assign(new Error('session "session-x" has no completed turn to fork from'), {
      code: 'session/fork-unavailable',
    })
    const { service } = fakeService({ forkError: err })
    await expect(openWindow(depsWith(new SessionWindowOpener(() => service)), {}, {}))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
    await expect(openWindow(depsWith(new SessionWindowOpener(() => service)), {}, {}))
      .rejects.toThrow(/mode=create/)
  })

  it('服务缺失：响亮失败，不放行、不伪造窗口码', async () => {
    await expect(openWindow(depsWith(undefined), {}, {}))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
    // 端口在位但宿主无 fork 能力（例如本宿主没装会话服务）同样响亮失败
    await expect(openWindow(depsWith(new SessionWindowOpener(() => ({}))), {}, {}))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
  })

  it('宿主返回同 id / 空 id：判失败（不是新窗口）', async () => {
    const same = fakeService({ forkId: WINDOW_A })
    await expect(openWindow(depsWith(new SessionWindowOpener(() => same.service)), {}, {}))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_FAILED/)

    const empty = fakeService({ forkId: '' })
    await expect(openWindow(depsWith(new SessionWindowOpener(() => empty.service)), {}, {}))
      .rejects.toThrow(/REQBOARD_OPEN_WINDOW_FAILED/)
  })

  it('mode=create：建全新空会话，无 parent_session_id', async () => {
    const { service, calls } = fakeService({ createId: 'session-fresh-0003' })
    // REQ-261004150249-731e FR-1：建会话前必须先解析出**落点**（这里给会话 cwd）；
    // 拿不到落点时用例会响亮失败而不是在宿主目录建窗（见 open-window-project-root.test.ts）。
    const execWithCwd = { agent: { session: { header: { cwd: '/tmp/proj' } } } }
    const value = await openWindow(depsWith(new SessionWindowOpener(() => service)), { mode: 'create' }, execWithCwd)
    expect(value.mode).toBe('create')
    expect(value.window_key).toBe('session-fresh-0003')
    expect(value.parent_session_id).toBeUndefined()
    expect(calls.create).toBe(1)
    expect(calls.fork).toEqual([])
  })

  it('文案纪律（FR-8）：说「请在侧栏打开」，不说「已打开」', () => {
    expect(OPEN_WINDOW_DEGRADED_NOTE).toContain('请在侧栏打开')
    expect(OPEN_WINDOW_DEGRADED_NOTE).not.toContain('已打开')
    expect(OPEN_WINDOW_DEGRADED_NOTE).toContain('会话已创建')
  })
})
