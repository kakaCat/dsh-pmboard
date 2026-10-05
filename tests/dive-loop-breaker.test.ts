// serves: FR-1, FR-2, FR-3, FR-6
/**
 * 死循环熔断与内存闭锁（REQ-261004065652-5c1c · t3 / TC-3、TC-4、TC-5、TC-13、TC-14）。
 *
 * ## 复现的事故（2026-10-03，见 requirement.md §E-1/E-4）
 *
 * 上游额度 403 → 台账写了 `driverHealth=paused`，但驱动**读不到**（同步投影陈旧）⇒ 判据恒真
 * ⇒ 18:03→22:39 空转 7257 回合。t2 修好了"读得到"；本文件验的是**第二道防线**：
 * 即使投影再坏一次，内存闭锁也必须让循环停手（fail-closed，不依赖任何 I/O）。
 *
 * ## 反向演练（验收要求，两条）
 *
 * ① 把 `upstream-failure.ts` 的致命判定整体关掉（`const fatal = code === 'AUTH' || …` → `const fatal = false`）
 *    → AUTH 落进 transient，TC-3 与 TC-14 必红（投递数从 1 涨到 3、且全局闩不再置位）。
 * ② 把 `round-driver.ts` 的 `latchBlocks()` 调用从 `readyToDrive()` 里删掉
 *    → 闭锁形同虚设，TC-5（写盘失败也停）必红。
 *
 * ## 时间
 *
 * 一律走注入的假时钟（`h.tick(ms)`），禁止真实等待。
 */
import { describe, it, expect } from 'vitest'
import {
  harness, makeReq, AUTH_FAIL, TRANSPORT_FAIL,
} from './support/dive-loop-harness.js'

describe('TC-3 · 致命错误（AUTH）→ 停手 + 全局闩，不再起轮', () => {
  it('第一次投递失败后：投递次数封顶 1、台账 reason=upstream-auth、全局闩置位', async () => {
    const h = harness()
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)

    await h.endTurn('agent-1', AUTH_FAIL)
    expect(h.diveOf('REQ-a')?.driverHealth?.state).toBe('paused')
    expect(h.diveOf('REQ-a')?.driverHealth?.reason).toBe('upstream-auth')
    expect(h.diveOf('REQ-a')?.activation, '人的意图不得被改写').toBe('armed')
    expect(h.providerLatch?.isOpen()).toBe(true)

    // 再怎么空闲也不起轮（内存闭锁 + 全局闩双保险）
    for (let i = 0; i < 20; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered, '停手后一个回合都不该再投').toHaveLength(1)
  })

  it('全局闩跨窗口：另一个健康的窗口也一起停（实测两窗口共享额度、同刻阵亡）', async () => {
    const h = harness({
      reqs: [makeReq('REQ-a', 'agent-1'), makeReq('REQ-b', 'agent-2')],
    })
    await h.idle('agent-1')
    await h.endTurn('agent-1', AUTH_FAIL)
    expect(h.providerLatch?.isOpen()).toBe(true)

    // 窗口 2 完全健康，但上游闩在闸 → 一个回合都不投
    for (let i = 0; i < 10; i += 1) { h.tick(1_000); await h.idle('agent-2') }
    expect(h.deliveredFor('REQ-b')).toBe(0)
  })
})

describe('TC-4 · 瞬时错误 → 退避重试，同因 3 次才熔断', () => {
  it('前两次失败不写健康位；退避窗口内零投递；第 3 次熔断并停手', async () => {
    const h = harness()

    await h.idle('agent-1')
    await h.endTurn('agent-1', TRANSPORT_FAIL)
    expect(h.diveOf('REQ-a')?.driverHealth, '一次抖动不该升级成人工事故').toBeUndefined()

    // 退避窗口内（30s 基数）→ 零投递
    h.tick(5_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)

    // 越过退避窗口 → 第 2 次
    h.tick(60_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(2)
    await h.endTurn('agent-1', TRANSPORT_FAIL)

    // 第 3 次 → 熔断
    h.tick(120_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(3)
    await h.endTurn('agent-1', TRANSPORT_FAIL)

    expect(h.diveOf('REQ-a')?.driverHealth?.state).toBe('paused')
    expect(h.diveOf('REQ-a')?.driverHealth?.reason).toBe('agent-error-loop')

    h.tick(10 * 60_000)
    await h.idle('agent-1')
    expect(h.delivered, '熔断后不该再有投递').toHaveLength(3)
  })

  it('正常收尾 → 退避账清零（抖动后的一次成功不该继续被退避挡着）', async () => {
    const h = harness()
    await h.idle('agent-1')
    await h.endTurn('agent-1', TRANSPORT_FAIL)
    // 退避窗口内：还没到点
    h.tick(1_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
    // 一次成功收尾 → 清账
    await h.endTurn('agent-1', { reason: { kind: 'completed' } })
    await h.idle('agent-1')
    expect(h.delivered, '清账后立即可起轮（无需等退避）').toHaveLength(2)
  })
})

describe('TC-5 · 内存闭锁 fail-closed：台账写不进去、也没有全局闩，仍停得下来', () => {
  it('写盘必然失败 + 不装配全局闩 + AUTH 收尾 → 仍零新增投递（只剩闭锁这一层）', async () => {
    // 刻意同时关掉另外两层：① 台账写不进去（driverHealth 没写上，读侧看不到停手位）；
    // ② 不装配全局闩（drive() 里的闩检查失效）。此时**唯一**能拦住自旋的就是内存闭锁。
    // （反向演练② 正是打这一条：删掉 readyToDrive 里的 latchBlocks 调用 → 本用例必红。）
    const h = harness({ storeMutateThrows: true, withLatch: false })
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)

    await h.endTurn('agent-1', AUTH_FAIL)
    expect(h.diveOf('REQ-a')?.driverHealth, '写失败 ⇒ 台账确实没写上').toBeUndefined()

    for (let i = 0; i < 20; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered, '台账写失败也不能自旋——这正是内存闭锁存在的理由').toHaveLength(1)
  })
})

describe('TC-13 · 不装配全局闩时：单窗口照旧停手，不抛错', () => {
  it('providerLatch 缺省 undefined → 本窗口仍停手（闭锁 + 健康位）', async () => {
    const h = harness({ withLatch: false })
    await h.idle('agent-1')
    await h.endTurn('agent-1', AUTH_FAIL)
    expect(h.diveOf('REQ-a')?.driverHealth?.reason).toBe('upstream-auth')
    h.tick(5_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
  })
})

describe('TC-14 · 死循环场景重放（E2E）', () => {
  it('300 拍内"投递即 403"：投递次数 ≤ 3 且回合数不增长', async () => {
    const h = harness({
      reqs: [makeReq('REQ-a', 'agent-1'), makeReq('REQ-b', 'agent-2')],
    })

    // 事故形态：投递 → 回合起 → 403 → 下一拍再投，如此往复（实测 276 分钟 / 7257 回合）
    for (let i = 0; i < 300; i += 1) {
      h.tick(1_000)
      for (const windowId of ['agent-1', 'agent-2']) {
        h.agents[windowId].status = 'idle'
        await h.idle(windowId)
        if (h.agents[windowId].status === 'running') {
          await h.endTurn(windowId, AUTH_FAIL)
          ;(h.agents[windowId].inbox.nextTurn as unknown[]).length = 0
        }
      }
    }

    expect(h.delivered.length, '300 拍内总投递必须停在个位数').toBeLessThanOrEqual(3)
    expect(h.providerLatch?.isOpen(), '全局闩已置位').toBe(true)
    for (const id of ['REQ-a', 'REQ-b']) {
      const health = h.diveOf(id)?.driverHealth
      if (health !== undefined) expect(health.state).toBe('paused')
    }
  })
})
