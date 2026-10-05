// serves: FR-3, FR-6
/**
 * 人中止 → 当拍闭锁（REQ-261004065652-5c1c · t3 / TC-6）。
 *
 * ## 复现的事故
 *
 * 2026-10-03 22:39 用户连打两次「停止」：之后 **20 秒内仍有 84 个回合被中止**，
 * 循环又跑了 1 个周额度 403 才自然死亡。原因是 abort 只写台账，**没有任何内存锁**——
 * 驱动下一拍照投。本文件钉住两件事：
 *   ① 中止后**当拍**起不了轮（不等台账、不等写盘）；
 *   ② 闭锁**不是永久死锁**：人恢复（台账变回可驱动）后自动解锁，能继续跑。
 */
import { describe, it, expect } from 'vitest'
import { harness, makeReq, ABORT_USER, TRANSPORT_FAIL } from './support/dive-loop-harness.js'

describe('TC-6 · aborted:user → 当拍闭锁、零新增投递', () => {
  it('在飞回合被中止：台账记中止原因，之后一拍都不再投', async () => {
    const h = harness()
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)

    // 消息被 step 认领（在飞）后再中止 —— 事故里的形态
    h.driver.onInboxClaimed(h.agents['agent-1'], h.delivered[0].message)
    await h.endTurn('agent-1', ABORT_USER)

    const dive = h.diveOf('REQ-a')
    expect(dive?.driverHealth?.state).toBe('paused')
    expect(dive?.driverHealth?.reason).toBe('aborted:user')
    expect(dive?.activation, '人主动停手不改写人的意图').toBe('armed')

    // 「当拍生效」：紧接着的一拍零投递（修前是 20 秒 84 个回合）
    h.tick(1_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)
  })

  it('没有在飞回合时中止（未认领）：同样停手', async () => {
    const h = harness()
    await h.idle('agent-1')
    await h.endTurn('agent-1', ABORT_USER)
    expect(h.diveOf('REQ-a')?.driverHealth?.reason).toBe('aborted:user')
    for (let i = 0; i < 5; i += 1) { h.tick(1_000); await h.idle('agent-1') }
    expect(h.delivered).toHaveLength(1)
  })

  it('人恢复（台账变回可驱动）→ 闭锁自动解除，重新起轮（不是永久死锁）', async () => {
    const h = harness()
    await h.idle('agent-1')
    await h.endTurn('agent-1', ABORT_USER)
    h.tick(1_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(1)

    // 人在看板点「继续」/ 确认推进 → 台账被复位成 armed + healthy
    const req = h.ledger.requirements.find((r) => r.id === 'REQ-a')!
    req.dive = { activation: 'armed', phase: 'active', roundsInStage: 1, driverHealth: { state: 'healthy', since: 2, attempts: 0 } }

    await h.idle('agent-1')
    expect(h.delivered, '人恢复后应能继续跑').toHaveLength(2)
    expect(h.infos.join(' ')).toContain('内存闭锁解除')
  })
})

describe('中止与瞬时错误的分野（FR-2 vs FR-6）', () => {
  it('瞬时错误不闭锁（退避后能自己好）；中止闭锁（必须等人）', async () => {
    const h = harness()

    // 瞬时错误：不写健康位、不闭锁
    await h.idle('agent-1')
    await h.endTurn('agent-1', TRANSPORT_FAIL)
    expect(h.diveOf('REQ-a')?.driverHealth).toBeUndefined()
    h.tick(60_000)
    await h.idle('agent-1')
    expect(h.delivered, '退避后自动重试').toHaveLength(2)

    // 同一台驱动器上再来一次人工中止：闭锁、且等 10 分钟也不动
    await h.endTurn('agent-1', ABORT_USER)
    h.tick(10 * 60_000)
    await h.idle('agent-1')
    expect(h.delivered).toHaveLength(2)
  })
})

describe('多需求隔离（闭锁是本 agent 的，不是全局的）', () => {
  it('窗口 1 被中止 → 窗口 2 不受影响（全局停手只由上游闩触发）', async () => {
    const h = harness({ reqs: [makeReq('REQ-a', 'agent-1'), makeReq('REQ-b', 'agent-2')] })
    await h.idle('agent-1')
    await h.endTurn('agent-1', ABORT_USER)

    await h.idle('agent-2')
    expect(h.deliveredFor('REQ-b'), '人只停了窗口 1，窗口 2 该照跑').toBe(1)
    expect(h.diveOf('REQ-b')?.driverHealth).toBeUndefined()
  })
})
