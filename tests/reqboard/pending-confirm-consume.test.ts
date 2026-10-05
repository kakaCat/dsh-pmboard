// serves: FR-11
/**
 * 宿主级动作票据的一次性消费（REQ-261004103330-005f t7 / FR-11）。
 *
 * 覆盖 design/test-cases.md 里"确认门是代码级门槛"的机械部分：
 *   · 已落章票据 **只能消费一次**（重放必拒，防同一张票把两次切换都放出去）；
 *   · 未落章 / 已过期 / 未知 → 结构化拒绝，**不改变票据状态**（不静默通行）；
 *   · **并发重放**：同步 `consume` 的"检查 → 置位"之间无 await，故 n 次并发只有 1 次成功；
 *   · 回归：artifact/plan 的 register → settle 路径**逐字未动**（含跨窗口不可取用、settle 幂等）；
 *   · 隔离：storage-action 票据**不进 ticket 表**——不拦任何需求的写路径（`pendingForWindow` 看不见它）。
 *
 * 时钟与 ticket 生成器全部注入，**不用 sleep**（过期用推进 now 构造）。
 */
import { describe, it, expect } from 'vitest'
import { PendingConfirmRegistry } from '../../src/adapters/PendingConfirmRegistry.js'
import { LIMITS } from '../../src/domain/limits.js'

const W = 'session-storage-action-001'

/** 可注入时钟 + 可预测 ticket（t7 验收要求：不用 sleep、不依赖随机）。 */
function makeRegistry(ttlMs?: number): { reg: PendingConfirmRegistry; advance: (ms: number) => void; at: () => number } {
  let now = 1_700_000_000_000
  let seq = 0
  const reg = new PendingConfirmRegistry({
    now: () => now,
    ...(ttlMs === undefined ? {} : { ttlMs }),
    newTicket: () => 'pc-' + (++seq).toString(16).padStart(6, '0'),
  })
  return { reg, advance: (ms: number) => { now += ms }, at: () => now }
}

const STAMP = { channel: 'board-confirm', sessionId: W, pluginVersion: '0.1.0' } as const
const OUTCOME = { confirmed: true, advanced: true }

describe('t7 宿主级动作票据：一次性 consume（FR-11）', () => {
  it('落章后首次 consume 成功并给出落章信息；第二次返回 consumed（重放必拒）', () => {
    const { reg, at } = makeRegistry()
    const rec = reg.register({ windowKey: W, target: 'storage-action', action: 'switch-to-sqlite' })
    expect(rec.target).toBe('storage-action')
    expect(rec.requirementId).toBe('')          // 宿主级动作不属于任何需求
    expect(rec.action).toBe('switch-to-sqlite')

    reg.settleStorageAction(rec.ticket, OUTCOME, STAMP)

    const first = reg.consume(rec.ticket)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('unreachable')
    expect(first.action).toBe('switch-to-sqlite')
    expect(first.confirmed).toBe(true)
    expect(first.advanced).toBe(true)
    expect(first.by).toEqual({ kind: 'human', channel: 'board-confirm', sessionId: W, pluginVersion: '0.1.0', at: at() })

    const second = reg.consume(rec.ticket)
    expect(second).toEqual({ ok: false, ticket: rec.ticket, reason: 'consumed' })
    // 状态留痕：consumedAt 已写（可审计），且不被第二次调用改写
    expect(reg.getStorageAction(rec.ticket)?.consumedAt).toBe(at())
  })

  it('否定作答（人点取消）→ denied，且**票据不被消费**；重发新票仍可正常确认', () => {
    const { reg } = makeRegistry()
    const rec = reg.register({ windowKey: W, target: 'storage-action', action: 'switch-to-sqlite' })
    reg.settleStorageAction(rec.ticket, { confirmed: false, advanced: false }, STAMP)

    // ① 否定作答**不是许可**：源头就得拒（此前只校验 outcome/stamp 存在 → 返回 ok:true，
    //    调用方只 `if (ok)` 就会把"人刚拒绝过"当成"人已批准"照切后端，属 fail-open）
    expect(reg.consume(rec.ticket)).toEqual({ ok: false, ticket: rec.ticket, reason: 'denied' })
    // ② 且**不置位**：consumedAt 保持 undefined（票据没被烧掉；审计留痕里只有那条否定 outcome）
    expect(reg.getStorageAction(rec.ticket)?.consumedAt).toBeUndefined()
    expect(reg.getStorageAction(rec.ticket)?.outcome).toEqual({ confirmed: false, advanced: false })
    // ③ 同一张票**持续** denied（不会退化成 consumed，也不会被某次调用洗白）
    expect(reg.consume(rec.ticket)).toEqual({ ok: false, ticket: rec.ticket, reason: 'denied' })

    // ④ 人重新确认走的是**新票**（settleStorageAction 首写优先：否定一旦落章不可改写，
    //    这正是审计留痕该有的样子）——新票的肯定作答照常放行，证明这条拒绝是"因为否定"而非恒拒
    const again = reg.register({ windowKey: W, target: 'storage-action', action: 'switch-to-sqlite' })
    reg.settleStorageAction(again.ticket, OUTCOME, STAMP)
    expect(reg.consume(again.ticket).ok).toBe(true)
  })

  it('`denied` 与 `unsettled` 必须可区分（同一原因字段给出不同值，便于排查）', () => {
    const { reg } = makeRegistry()
    const noAnswer = reg.register({ windowKey: W, target: 'storage-action' })
    const rejected = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(rejected.ticket, { confirmed: false, advanced: false }, STAMP)

    // 两件事的处置完全不同：unsettled = 还没轮到人（该去催），denied = 人明确拒绝（该换方案/问原因）
    expect(reg.consume(noAnswer.ticket)).toEqual({ ok: false, ticket: noAnswer.ticket, reason: 'unsettled' })
    expect(reg.consume(rejected.ticket)).toEqual({ ok: false, ticket: rejected.ticket, reason: 'denied' })
  })

  it('未落章（只 register）→ unsettled，且**不改变票据状态**', () => {
    const { reg } = makeRegistry()
    const rec = reg.register({ windowKey: W, target: 'storage-action' })
    expect(reg.consume(rec.ticket)).toEqual({ ok: false, ticket: rec.ticket, reason: 'unsettled' })
    const after = reg.getStorageAction(rec.ticket)
    expect(after?.consumedAt).toBeUndefined()
    expect(after?.outcome).toBeUndefined()
    // 半落章（畸形输入）**不算已落章**：不校验形状的话 `{...undefined}` = `{}` 会被判成已落章，
    // 白白放行一次后端切换——实测抓到过。三种畸形各自用**独立票据**，避免互相污染
    const a = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(a.ticket, OUTCOME, undefined as never)              // stamp 缺失
    expect(reg.consume(a.ticket)).toEqual({ ok: false, ticket: a.ticket, reason: 'unsettled' })
    reg.settleStorageAction(a.ticket, OUTCOME, { channel: 'bogus' } as never)   // channel 不在白名单
    expect(reg.consume(a.ticket)).toEqual({ ok: false, ticket: a.ticket, reason: 'unsettled' })

    const b = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(b.ticket, { confirmed: 'yes' } as never, STAMP)     // outcome 畸形
    expect(reg.consume(b.ticket)).toEqual({ ok: false, ticket: b.ticket, reason: 'unsettled' })

    // 形状齐了才放行（证明前面的拒绝是"因为畸形"，不是因为恒拒）
    const c = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(c.ticket, OUTCOME, STAMP)
    expect(reg.consume(c.ticket).ok).toBe(true)
  })

  it('过期票据 → expired（沿用 LIMITS.pendingConfirmTtlMs 口径，注入时钟推进，不 sleep）', () => {
    const ttl = LIMITS.pendingConfirmTtlMs
    const { reg, advance } = makeRegistry(ttl)
    const rec = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(rec.ticket, OUTCOME, STAMP)

    advance(ttl)                                  // 恰好在窗口边界内
    expect(reg.consume(rec.ticket).ok).toBe(true)

    const rec2 = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(rec2.ticket, OUTCOME, STAMP)
    advance(ttl + 1)                              // 越过窗口
    expect(reg.consume(rec2.ticket)).toEqual({ ok: false, ticket: rec2.ticket, reason: 'expired' })
  })

  it('未知 ticket → unknown（结构化拒绝，不抛未捕获异常）', () => {
    const { reg } = makeRegistry()
    expect(() => reg.consume('pc-ffffff')).not.toThrow()
    expect(reg.consume('pc-ffffff')).toEqual({ ok: false, ticket: 'pc-ffffff', reason: 'unknown' })
    // 空串也不炸
    expect(reg.consume('')).toEqual({ ok: false, ticket: '', reason: 'unknown' })
  })

  it('并发重放：同一 ticket 同时发起 20 次 consume → **只成功一次**（同步检查+置位，无 await 交错）', async () => {
    const { reg } = makeRegistry()
    const rec = reg.register({ windowKey: W, target: 'storage-action' })
    reg.settleStorageAction(rec.ticket, OUTCOME, STAMP)

    const results = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => reg.consume(rec.ticket))))
    const okCount = results.filter(r => r.ok).length
    expect(okCount).toBe(1)
    expect(results.filter(r => !r.ok && r.reason === 'consumed').length).toBe(19)
  })

  it('隔离：storage-action 票据不进 ticket 表——get / pendingForWindow 都看不见它（不拦需求写路径）', () => {
    const { reg } = makeRegistry()
    const rec = reg.register({ windowKey: W, target: 'storage-action' })
    expect(reg.get(rec.ticket, W)).toBeUndefined()
    expect(reg.pendingForWindow(W)).toBeUndefined()
  })
})

describe('t7 回归：artifact / plan 路径逐字未动', () => {
  it('register→settle 的既有形状与幂等语义不变', () => {
    const { reg, at } = makeRegistry()
    const rec = reg.register({ windowKey: W, requirementId: 'REQ-aaa', target: 'artifact', kind: 'requirement' })
    expect(rec).toEqual({
      ticket: rec.ticket,
      windowKey: W,
      requirementId: 'REQ-aaa',
      target: 'artifact',
      kind: 'requirement',
      createdAt: at(),
    })

    // 未作答可见（FR-9 停手守卫）
    expect(reg.pendingForWindow(W)?.ticket).toBe(rec.ticket)

    // settle 幂等：重复回填保留首次结果
    reg.settle(rec.ticket, { confirmed: true, advanced: true })
    const second = reg.settle(rec.ticket, { confirmed: false, advanced: false })
    expect(second?.outcome).toEqual({ confirmed: true, advanced: true })

    // 落章后不再算"未作答"
    expect(reg.pendingForWindow(W)).toBeUndefined()

    // 跨窗口不可取用（既有纪律）
    expect(reg.get(rec.ticket, 'session-other')).toBeUndefined()
    expect(reg.get(rec.ticket, W)?.ticket).toBe(rec.ticket)

    // plan 形态
    const plan = reg.register({ windowKey: W, requirementId: 'REQ-aaa', target: 'plan' })
    expect(plan.target).toBe('plan')
    expect(plan.kind).toBeUndefined()
  })

  it('artifact/plan 的记录**不带** storage-action 的字段（形状未被污染）', () => {
    const { reg } = makeRegistry()
    const rec = reg.register({ windowKey: W, requirementId: 'REQ-aaa', target: 'artifact', kind: 'design' })
    expect('action' in rec).toBe(false)
    expect('consumedAt' in rec).toBe(false)
    expect('stamp' in rec).toBe(false)
  })
})
