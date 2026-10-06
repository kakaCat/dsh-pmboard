// serves: FR-3
/**
 * 在途弹框登记的**分档过期**用例（REQ-261006170150-52cc · design/test-cases.md 的 TC-6、TC-7）。
 *
 * 口径（一句话）：在途登记不是"登记过就一直算有人在等"，而是按**形态**分档到期——
 *   · 挂起型（`suspend:true`，后台续跑等作答）→ `ttlMs`（缺省 30 分钟，与挂起票 TTL 同值）；
 *   · 阻塞型（`suspend:false`，人在工具调用里等）→ `blockingTtlMs`（缺省 60 分钟）；
 * 读到 `now - since > 该档 TTL` 的记录即**惰性摘除**，并按"无人等待"返回。
 *
 * 为什么必须分档（这条用例真正锁的东西）：阻塞型弹框的最长真实等待是宿主交互工具超时（1 小时），
 * 套 30 分钟会把「人还在看框」误判成「没人答」⇒ 自动链抢在人前面动。
 *
 * 为何用**固定时钟**：过期判定是纯函数式的时间比较，没有 IO；注入时钟即可把边界穷举干净。
 */
import { describe, it, expect } from 'vitest'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { LIMITS } from '../src/domain/limits.js'

const T30 = LIMITS.pendingConfirmTtlMs // 30 分钟
const T60 = LIMITS.timeoutInteractiveMs // 60 分钟

/** 固定时钟夹具：`advance` 只推进读数，不睡真实时间。 */
function make(options: { ttlMs?: number; blockingTtlMs?: number } = {}) {
  let now = 1_000_000
  const reg = new PendingConfirmRegistry({
    now: () => now,
    newTicket: (() => { let n = 0; return () => 'pc-' + String(++n).padStart(6, '0') })(),
    ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    ...(options.blockingTtlMs === undefined ? {} : { blockingTtlMs: options.blockingTtlMs }),
  })
  return { reg, advance: (ms: number) => { now += ms } }
}

const REQ = 'REQ-000001'
const REQ2 = 'REQ-000002'

describe('TC-6 分档 TTL：挂起型 30 分钟 / 阻塞型 60 分钟（FR-3）', () => {
  it('挂起型：越 30 分钟 ⇒ inFlightFor 为 false（= 无人等待）', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-suspend', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    expect(reg.inFlightFor(REQ)).toBe(true)

    advance(T30 + 1)

    expect(reg.inFlightFor(REQ)).toBe(false)
  })

  it('挂起型：恰好到 30 分钟仍算「还在等」（判据用严格大于，边界不误伤人）', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-suspend', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })

    advance(T30)

    expect(reg.inFlightFor(REQ)).toBe(true)
  })

  it('阻塞型：30 分钟时**仍为 true**（分档的意义所在——别把人还在看框判成过期）', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-block', windowKey: 'w1', requirementId: REQ, kind: 'gate', suspend: false })

    advance(T30 + 1)
    expect(reg.inFlightFor(REQ)).toBe(true)

    advance(T30) // 累计 60 分钟 + 2ms
    expect(reg.inFlightFor(REQ)).toBe(false)
  })

  it('阻塞型：恰好 60 分钟仍算「还在等」，越 60 分钟才 false', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-block', windowKey: 'w1', requirementId: REQ, kind: 'gate', suspend: false })

    advance(T60)
    expect(reg.inFlightFor(REQ)).toBe(true)

    advance(1)
    expect(reg.inFlightFor(REQ)).toBe(false)
  })

  it('两档互不干扰：同需求挂起型已过期、阻塞型仍在途 ⇒ 仍判「有人在等」', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-suspend', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    reg.enter({ ref: 'r-block', windowKey: 'w1', requirementId: REQ, kind: 'gate', suspend: false })

    advance(T30 + 1)

    // 挂起型那条已过期，但阻塞型这条还在等 ⇒ 整体仍为 true（且只摘掉过期的那条）
    expect(reg.inFlightFor(REQ)).toBe(true)
    const refs = reg.list().map(r => r.ref)
    expect(refs).toEqual(['r-block'])
  })

  it('自定义 blockingTtlMs 可覆盖（默认值不被写死）', () => {
    const { reg, advance } = make({ blockingTtlMs: 1_000 })
    reg.enter({ ref: 'r-block', windowKey: 'w1', requirementId: REQ, kind: 'gate', suspend: false })

    advance(1_001)

    expect(reg.inFlightFor(REQ)).toBe(false)
  })

  it('自定义 ttlMs 只作用于挂起型（票 TTL 与阻塞档各自独立）', () => {
    const { reg, advance } = make({ ttlMs: 1_000 })
    reg.enter({ ref: 'r-suspend', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    reg.enter({ ref: 'r-block', windowKey: 'w1', requirementId: REQ2, kind: 'gate', suspend: false })

    advance(1_001)

    expect(reg.inFlightFor(REQ)).toBe(false) // 挂起型按自定义 1s 过期
    expect(reg.inFlightFor(REQ2)).toBe(true) // 阻塞型仍按缺省 60 分钟
  })
})

describe('TC-7 过期即惰性摘除 + exit 幂等（FR-3）', () => {
  it('过期的条目不再出现在 list() 里，且读一次即从表里摘掉', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-expired', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })

    advance(T30 + 1)

    expect(reg.list()).toEqual([])
    // 再读一次仍是空（已摘掉，不是"每次临时过滤一下"）
    expect(reg.list()).toEqual([])
    expect(reg.inFlightFor(REQ)).toBe(false)
  })

  it('未过期的条目照常出现在 list() 里（不误删）', () => {
    const { reg } = make()
    reg.enter({ ref: 'r-live', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })

    expect(reg.list().map(r => r.ref)).toEqual(['r-live'])
  })

  it('exit 对已过期（已被摘除）的 ref 幂等：不抛、不影响同表其它记录', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-expired', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    reg.enter({ ref: 'r-live', windowKey: 'w1', requirementId: REQ2, kind: 'gate', suspend: false })

    advance(T30 + 1)

    expect(() => { reg.exit('r-expired') }).not.toThrow()
    expect(() => { reg.exit('r-never-existed') }).not.toThrow()
    expect(reg.inFlightFor(REQ2)).toBe(true)
    expect(reg.list().map(r => r.ref)).toEqual(['r-live'])
  })

  it('过期后被重新登记 ⇒ 重新计时（摘除是"这条结束了"，不是"这个 ref 作废"）', () => {
    const { reg, advance } = make()
    reg.enter({ ref: 'r-again', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    advance(T30 + 1)
    expect(reg.inFlightFor(REQ)).toBe(false)

    reg.enter({ ref: 'r-again', windowKey: 'w1', requirementId: REQ, kind: 'confirm', suspend: true })
    expect(reg.inFlightFor(REQ)).toBe(true)
  })
})
