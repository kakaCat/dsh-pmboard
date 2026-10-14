// serves: FR-3, FR-6
/**
 * 停手闭锁的**多窗口隔离**（旧"中止 → 当拍闭锁"用例里"隔离"那一段的新家）。
 *
 * 为什么这条仍然值钱：2026-10-03 的事故形态是"一个窗口反复失败、循环停不下来"。
 * 新驱动的停手态是**每 agentId 一份内存态**（`createGoalRoundDriver` 的 `states` Map）。
 * 若哪天有人把它改成驱动器级单例，"窗口 1 停了 → 窗口 2 被连坐"就会静默发生——
 * 本文件就是那条"停用即红"的证。
 *
 * 如实声明（不替新驱动造语义）：新驱动对"人中止"**不再当拍闭锁**——`onTurnEnd` 只分
 * `completed` 与"未完成"，未完成走退避与**同因达阈值才熔断**（3 次）；台账健康位也不再由驱动写。
 * 故本文件只钉"隔离"，不钉旧的中止闭锁。
 */
import { describe, it, expect } from 'vitest'
import { goalHarness, makeReq } from 'tests/support/goal-round-harness.js'

const A = 'agent-1'
const B = 'agent-2'

describe('停手闭锁是每窗口一份（不连坐）', () => {
  it('窗口 A 连续 3 次未完成回合 → A 停手；窗口 B 照常起轮', async () => {
    const h = goalHarness({ reqs: [makeReq('REQ-a', A), makeReq('REQ-b', B)] })

    // A 在没有在飞回合时就连续 3 次"未完成回合"→ 同因达阈值 → 内存熔断
    // （刻意不在飞：这样下面的零投递只可能来自闭锁，不借"预留被占"这条旁路）
    for (let i = 0; i < 3; i += 1) await h.driver.onTurnEnd(A, { completed: false })
    await h.driver.whenQuiet()
    expect(h.traces.join(' ')).toContain('breaker-tripped')

    await h.idle(A)
    expect(h.deliveredFor('REQ-a'), '熔断后 A 本拍不许再投（无闭锁时这里是 1）').toBe(0)

    // 对照：同一台驱动器上的 B 照常起轮 —— 既证明夹具本来投得出，也证明闭锁不连坐
    await h.idle(B)
    expect(h.deliveredFor('REQ-b'), 'B 不因 A 的停手被连坐').toBe(1)
  })
})
