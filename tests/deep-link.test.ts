/**
 * 看板深链消费端单测（REQ-261004111917-f473 · serves: FR-2, FR-3 · TC-3 ~ TC-6）。
 *
 * 可证伪点（逐条对应 design/interfaces.md §客户端模块契约 与 design/data-model.md 的不变量）：
 *   ① 解析六态表逐行（ignored / ok 无 req / ok 带 req / malformed / 解码 trim / 多值取首）；
 *   ② 调用序列必须是 `clearHash → requestFocus → selectPanel`（不变量 I-4）；
 *   ③ ignored 零副作用（不变量 I-1）；识别即清且只清一次（I-2）；
 *   ④ 重试：前 2 次抛第 3 次成功 → 'focused'，且 selectPanel 恰 3 次、clearFocus 0 次；
 *   ⑤ 兜底：恒抛且 maxAttempts=3 → 'failed'，clearFocus 恰 1 次、定位意图不残留（I-6）；
 *   ⑥ 不抛：任何端口异常都收敛成返回值，不冒泡（I-8）。
 *
 * 手法：假端口记录调用序列；`defer` 注入同步实现（`(run) => run()`）以便断言重试次数。
 */
import { describe, expect, it } from 'vitest'
import { clearBoardFocus, peekBoardFocus, requestBoardFocus } from '../src/client/board-focus.ts'
import {
  consumePmboardDeepLink,
  DEFAULT_MAX_ATTEMPTS,
  parsePmboardDeepLink,
  type DeepLinkPorts,
} from '../src/client/deep-link.ts'

// ---------------------------------------------------------------------------
// 假端口：记录调用序列 + 可配置 selectPanel 抛错次数
// ---------------------------------------------------------------------------

interface Harness {
  ports: DeepLinkPorts
  calls: string[]
  logs: Array<{ message: string; detail?: unknown }>
  /** selectPanel 还剩几次要抛错（0 = 立即成功）。 */
  failSelectTimes: { value: number }
}

function harness(overrides: Partial<DeepLinkPorts> = {}): Harness {
  const calls: string[] = []
  const logs: Array<{ message: string; detail?: unknown }> = []
  const failSelectTimes = { value: 0 }
  const ports: DeepLinkPorts = {
    clearHash: () => { calls.push('clearHash') },
    requestFocus: (reqId: string) => { calls.push('requestFocus:' + reqId) },
    clearFocus: () => { calls.push('clearFocus') },
    selectPanel: (id: string) => {
      calls.push('selectPanel:' + id)
      if (failSelectTimes.value > 0) {
        failSelectTimes.value -= 1
        throw new Error('main panel "' + id + '" is not registered')
      }
    },
    // 同步 defer：测试里重试是确定性的，不需要等真实定时器
    defer: (run: () => void) => { run() },
    log: (message: string, detail?: unknown) => { logs.push({ message, detail }) },
    ...overrides,
  }
  return { ports, calls, logs, failSelectTimes }
}

const REQ = 'REQ-261004111917-f473'

// ---------------------------------------------------------------------------
// ① 解析
// ---------------------------------------------------------------------------

describe('parsePmboardDeepLink（纯解析 · 六态表）', () => {
  it('与本插件无关的 hash → ignored（含 #pmboardx 这种前缀更长的情况）', () => {
    for (const hash of ['', '#', '#other', '#pmboardx', '#pmboard-1', '#PMBOARD']) {
      expect(parsePmboardDeepLink(hash), hash).toEqual({ kind: 'ignored' })
    }
  })

  it('只带面板（无 req）→ ok 且无 reqId', () => {
    for (const hash of ['#pmboard', '#pmboard?', '#pmboard?foo=1', '#pmboard?stage=design']) {
      expect(parsePmboardDeepLink(hash), hash).toEqual({ kind: 'ok' })
    }
  })

  it('带合法 req → ok 且要求真形状', () => {
    expect(parsePmboardDeepLink('#pmboard?req=' + REQ)).toEqual({ kind: 'ok', reqId: REQ })
  })

  it('req 先解码再 trim（%20 包裹仍认得）', () => {
    expect(parsePmboardDeepLink('#pmboard?req=%20REQ-a%20')).toEqual({ kind: 'ok', reqId: 'REQ-a' })
  })

  it('req 形状非法 → malformed 且带 raw（写了 req 却空值也算非法）', () => {
    expect(parsePmboardDeepLink('#pmboard?req=abc')).toEqual({ kind: 'malformed', raw: 'abc' })
    // 口径（复核后按文档多数收口）：`?req=` / 仅空白 = 「写了 req 却没写值」→ malformed；
    // 「根本没写 req」（`#pmboard`、`#pmboard?foo=1`）才是合法缺省。
    // 两种情形的用户可见行为一致（只开面板、不定位），差异只有一条诊断日志与返回值。
    expect(parsePmboardDeepLink('#pmboard?req=')).toEqual({ kind: 'malformed', raw: '' })
    expect(parsePmboardDeepLink('#pmboard?req=%20%20')).toEqual({ kind: 'malformed', raw: '' })
    expect(parsePmboardDeepLink('#pmboard?req=Req-1')).toEqual({ kind: 'malformed', raw: 'Req-1' })
  })

  it('没写 req（缺省）与空值 req 是两种情形：前者 ok，后者 malformed', () => {
    expect(parsePmboardDeepLink('#pmboard')).toEqual({ kind: 'ok' })
    expect(parsePmboardDeepLink('#pmboard?foo=1')).toEqual({ kind: 'ok' })
    expect(parsePmboardDeepLink('#pmboard?req=')).toEqual({ kind: 'malformed', raw: '' })
  })

  it('多个 req → 取第一个', () => {
    expect(parsePmboardDeepLink('#pmboard?req=REQ-a&req=REQ-b')).toEqual({ kind: 'ok', reqId: 'REQ-a' })
  })
})

// ---------------------------------------------------------------------------
// ②~④ 消费时序 / 重试 / 兜底
// ---------------------------------------------------------------------------

describe('consumePmboardDeepLink（时序 · 重试 · 兜底）', () => {
  it("TC-4 带 req → 序列 clearHash → requestFocus → selectPanel，结论 'focused'", async () => {
    const h = harness()
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports)
    expect(outcome).toBe('focused')
    expect(h.calls).toEqual(['clearHash', 'requestFocus:' + REQ, 'selectPanel:dsh-pmboard'])
  })

  it("TC-4 只带面板 → 无 requestFocus，结论 'opened'", async () => {
    const h = harness()
    const outcome = await consumePmboardDeepLink('#pmboard', h.ports)
    expect(outcome).toBe('opened')
    expect(h.calls).toEqual(['clearHash', 'selectPanel:dsh-pmboard'])
  })

  it("TC-4 畸形 req → 只开面板、不打定位、有诊断，结论 'malformed'", async () => {
    const h = harness()
    const outcome = await consumePmboardDeepLink('#pmboard?req=abc', h.ports)
    expect(outcome).toBe('malformed')
    expect(h.calls).toEqual(['clearHash', 'selectPanel:dsh-pmboard'])
    expect(h.logs.map(l => l.message).join('')).toContain('req 形状非法')
  })

  it("TC-6 ignored → 零副作用（四个端口一次都没调）", async () => {
    const h = harness()
    const outcome = await consumePmboardDeepLink('#other', h.ports)
    expect(outcome).toBe('ignored')
    expect(h.calls).toEqual([])
    expect(h.logs).toEqual([])
  })

  it("TC-5 selectPanel 前 2 次抛、第 3 次成功 → 'focused'，恰 3 次且不误清定位", async () => {
    const h = harness()
    h.failSelectTimes.value = 2
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports)
    expect(outcome).toBe('focused')
    expect(h.calls.filter(c => c.startsWith('selectPanel'))).toHaveLength(3)
    expect(h.calls).not.toContain('clearFocus')
    // 顺序：定位登记发生在第一次尝试之前（不变量 I-4）
    expect(h.calls.indexOf('requestFocus:' + REQ)).toBeLessThan(h.calls.indexOf('selectPanel:dsh-pmboard'))
  })

  it("TC-5 恒抛（maxAttempts=3）→ 'failed'，恰 3 次尝试且定位意图被清", async () => {
    const h = harness()
    h.failSelectTimes.value = 99
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports, { maxAttempts: 3 })
    expect(outcome).toBe('failed')
    expect(h.calls.filter(c => c.startsWith('selectPanel'))).toHaveLength(3)
    expect(h.calls.filter(c => c === 'clearFocus')).toHaveLength(1)
    expect(h.logs.map(l => l.message).join('')).toContain('面板选择失败')
  })

  it('缺省预算：不传 maxAttempts 时按 DEFAULT_MAX_ATTEMPTS 次尝试（预算变更即被本用例拦住）', async () => {
    const h = harness()
    h.failSelectTimes.value = 99
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports)
    expect(outcome).toBe('failed')
    expect(h.calls.filter(c => c.startsWith('selectPanel'))).toHaveLength(DEFAULT_MAX_ATTEMPTS)
    // 预算必须显著大于「一帧量级」：插槽声明可能晚于 apply（复核指出的冷启动风险）
    expect(DEFAULT_MAX_ATTEMPTS * 16).toBeGreaterThanOrEqual(500)
  })

  it('失败时**不**误清别的动线留下的定位意图（本次没登记过就不清）', async () => {
    const h = harness()
    h.failSelectTimes.value = 99
    // 无 reqId（只开面板）→ 本次没有登记任何意图 → 失败路径不许动 clearFocus
    const outcome = await consumePmboardDeepLink('#pmboard', h.ports, { maxAttempts: 2 })
    expect(outcome).toBe('failed')
    expect(h.calls.filter(c => c === 'clearFocus')).toHaveLength(0)
  })

  it('TC-5 clearHash 抛错不中断：仍走到 selectPanel，结论不受影响', async () => {
    const h = harness({
      clearHash: () => { throw new Error('replaceState 被拒') },
    })
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports)
    expect(outcome).toBe('focused')
    expect(h.calls).toEqual(['requestFocus:' + REQ, 'selectPanel:dsh-pmboard'])
    expect(h.logs.map(l => l.message).join('')).toContain('清 hash 失败')
  })

  it('TC-5 selectPanel 抛非 Error（字符串）也不冒泡：收敛成 failed 并清掉本次意图', async () => {
    const h = harness({
      selectPanel: () => { throw 'boom' }, // eslint-disable-line no-throw-literal
    })
    await expect(consumePmboardDeepLink('#pmboard?req=' + REQ, h.ports, { maxAttempts: 2 })).resolves.toBe('failed')
    expect(h.calls.filter(c => c === 'clearFocus')).toHaveLength(1)
  })

  it('I-8 结构兜底：端口传 null（JS 调用方）也不 reject，收敛成 failed', async () => {
    await expect(
      consumePmboardDeepLink('#pmboard?req=' + REQ, null as unknown as DeepLinkPorts),
    ).resolves.toBe('failed')
  })

  it('TC-5 defer 缺省（走真实定时器）也能成功收敛：前 1 次抛、第 2 次成', async () => {
    const calls: string[] = []
    let fail = 1
    const outcome = await consumePmboardDeepLink('#pmboard?req=' + REQ, {
      clearHash: () => { calls.push('clearHash') },
      requestFocus: () => { calls.push('requestFocus') },
      clearFocus: () => { calls.push('clearFocus') },
      selectPanel: () => {
        calls.push('selectPanel')
        if (fail-- > 0) throw new Error('not registered yet')
      },
      // 刻意不注入 defer：验证缺省实现（setTimeout 16ms）真的会重试
    })
    expect(outcome).toBe('focused')
    expect(calls.filter(c => c === 'selectPanel')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 不变量：与真实 board-focus 模块联动的两条（I-6 不残留 / I-7 不双跳）
// ---------------------------------------------------------------------------

describe('与 board-focus 的联动（不变量 I-6 / I-7）', () => {
  it('失败路径清掉定位意图：peekBoardFocus() 必须为空', async () => {
    clearBoardFocus()
    const outcome = await consumePmboardDeepLink('#pmboard?req=REQ-x', {
      clearHash: () => {},
      requestFocus: (id) => { requestBoardFocus(id) },
      clearFocus: () => { clearBoardFocus() },
      selectPanel: () => { throw new Error('始终保持未注册') },
      defer: (run) => { run() },
    }, { maxAttempts: 2 })
    expect(outcome).toBe('failed')
    expect(peekBoardFocus()).toBeUndefined()
  })

  it('成功路径把定位意图留给看板挂载时消费（取走即清）', async () => {
    clearBoardFocus()
    const outcome = await consumePmboardDeepLink('#pmboard?req=REQ-y', {
      clearHash: () => {},
      requestFocus: (id) => { requestBoardFocus(id) },
      clearFocus: () => { clearBoardFocus() },
      selectPanel: () => {},
      defer: (run) => { run() },
    })
    expect(outcome).toBe('focused')
    expect(peekBoardFocus()).toBe('REQ-y')
    clearBoardFocus()
  })
})
