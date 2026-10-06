/**
 * 同一道门是否已有人在等（REQ-261006164732-6503 t1 · serves: FR-1, FR-2）。
 *
 * 为什么锁这条：修前"要不要再弹一个批准框"只能去问台账「落章了吗」（结果态），
 * 于是人在宽限内没答时会弹出**第二个框**（拆分门实测 16:42:06 与 16:42:10 两个）。
 * `findOpen` 是判定单点的地基：它回答的是**过程态**——「这道门现在有人在等吗」。
 *
 * 两条纪律必须在用例里钉死：
 *  ① 判定键不含 `windowKey`（跨窗口/worker 席位只算一道门）；
 *  ② 它是**纯读**（不 settle、不 register、不 markInterrupted、不续期）。
 */
import { describe, it, expect } from 'vitest'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { LIMITS } from '../src/domain/limits.js'

/** 递增 ticket 生成器：一个用例里要造多道门。 */
function make(ttlMs?: number) {
  let now = 1_000_000
  let n = 0
  const reg = new PendingConfirmRegistry({
    now: () => now,
    newTicket: () => 'pc-' + String(++n).padStart(6, '0'),
    ...(ttlMs === undefined ? {} : { ttlMs }),
  })
  return { reg, advance: (ms: number) => { now += ms } }
}

const planKey = { requirementId: 'REQ-A', target: 'plan' as const }
const artKey = { requirementId: 'REQ-A', target: 'artifact' as const, kind: 'verification' as const }

describe('findOpen · 同门唯一在途（FR-1）', () => {
  it('同门命中：未作答且未过期的门被查到，且返回的是副本（改不动内部记录）', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    const hit = reg.findOpen(planKey)
    expect(hit?.ticket).toBe('pc-000001')
    expect(hit?.createdAt).toBe(1_000_000)
    // 副本：写返回值不影响注册表本体
    if (hit !== undefined) hit.requirementId = 'REQ-TAMPERED'
    expect(reg.findOpen(planKey)?.requirementId).toBe('REQ-A')
  })

  it('跨窗口命中：worker 席位在另一个窗口请求同一道门，仍算同一道门', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w-owner', requirementId: 'REQ-A', target: 'plan' })
    const hit = reg.findOpen(planKey)
    expect(hit?.ticket).toBe('pc-000001')
    expect(hit?.windowKey).toBe('w-owner')
  })

  it('已作答不命中：settle 之后这道门不再"有人在等"', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    expect(reg.findOpen(planKey)?.ticket).toBe('pc-000001')
    reg.settle('pc-000001', { confirmed: true, advanced: true })
    expect(reg.findOpen(planKey)).toBeUndefined()
  })

  it('已过期不命中：超过 TTL 的门不再计入（与 pendingForWindow 同口径）', () => {
    const { reg, advance } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    advance(LIMITS.pendingConfirmTtlMs - 1)
    expect(reg.findOpen(planKey)?.ticket).toBe('pc-000001')
    advance(2)
    expect(reg.findOpen(planKey)).toBeUndefined()
  })

  it('kind 缺省 = plan 口径：target=plan 的门用不带 kind 的查询命中', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'artifact', kind: 'verification' })
    expect(reg.findOpen(planKey)?.ticket).toBe('pc-000001')
    expect(reg.findOpen(artKey)?.ticket).toBe('pc-000002')
  })
})

describe('findOpen · 键不同不算同门（FR-2）', () => {
  it('需求不同 / kind 不同 / target 不同，都不命中——不做"缺省即通配"', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'artifact', kind: 'verification' })
    expect(reg.findOpen({ requirementId: 'REQ-B', target: 'artifact', kind: 'verification' })).toBeUndefined()
    expect(reg.findOpen({ requirementId: 'REQ-A', target: 'artifact', kind: 'design' })).toBeUndefined()
    // 同一个需求，plan 查询不得命中 artifact 门（两种门不能混成一种）
    expect(reg.findOpen({ requirementId: 'REQ-A', target: 'plan' })).toBeUndefined()
    // 反向：artifact 查询不得命中 plan 门
    reg.register({ windowKey: 'w1', requirementId: 'REQ-B', target: 'plan' })
    expect(reg.findOpen({ requirementId: 'REQ-B', target: 'artifact', kind: 'plan' as never })).toBeUndefined()
  })
})

describe('findOpen · 纯读（不续期、不清理）', () => {
  it('连续查询不续期：createdAt 不变，老化照走（反复请求不能把门续成永不过期）', () => {
    const { reg, advance } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    advance(LIMITS.pendingConfirmTtlMs - 1_000)
    const first = reg.findOpen(planKey)
    const second = reg.findOpen(planKey)
    expect(first?.createdAt).toBe(1_000_000)
    expect(second?.createdAt).toBe(1_000_000)
    // 连续查询不改变老化：再走 2 秒即过期
    advance(2_000)
    expect(reg.findOpen(planKey)).toBeUndefined()
  })

  it('中止记录按 interruptedAt 重新计时，findOpen 与 pendingForWindow 逐字同口径', () => {
    const { reg, advance } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    advance(LIMITS.pendingConfirmTtlMs - 1_000)
    reg.markInterrupted('pc-000001')
    advance(LIMITS.pendingConfirmTtlMs - 1_000)
    expect(reg.findOpen(planKey)?.ticket).toBe('pc-000001')
    expect(reg.pendingForWindow('w1')?.ticket).toBe('pc-000001')
  })

  it('查询是只读的：不 settle、不清理，作答能力不受影响', () => {
    const { reg } = make()
    reg.register({ windowKey: 'w1', requirementId: 'REQ-A', target: 'plan' })
    reg.findOpen(planKey)
    reg.findOpen(planKey)
    // 仍可正常作答（说明查询没把它 settle 掉）
    expect(reg.settle('pc-000001', { confirmed: true, advanced: false })?.outcome).toEqual({ confirmed: true, advanced: false })
  })
})
