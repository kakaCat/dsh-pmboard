/**
 * Dive 状态转化纯函数（REQ-261003215944-9e04 FR-9 · t8）。
 *
 * 【为什么要有这道门】
 * 「改 dive」这件事原先散在八处、各写一份，规则只活在注释里。收成一个纯函数之后，
 * **八个事件 × 关键状态**可以被穷举——这正是本卡要买的东西：规则不再靠口口相传。
 *
 * 【五组守护（任一被回退即红）】
 *   1. 八事件各至少一条：每一档都真写出预期的字段变化；
 *   2. 红线：只有 `arm-explicit` 能把 activation 从 disarmed 改回 armed；
 *      `pause-runtime` / `recover-auto` / `confirm-advance` **逐字不改** activation；
 *   3. 非法事件矩阵：事件在当前状态下不成立 → `changed:false` 且 `next` 与入参同值（零写入）；
 *   4. 幂等：同一事件在同一 prev 上连调两次，第二次 `changed:false`；
 *   5. 纯：不改入参（冻结对象也不抛）、不读时钟（now 一律由入参给）。
 */
import { describe, it, expect } from 'vitest'
import { transitionDive, diveEquals, type DiveEvent } from '../src/domain/dive/transition.js'
import type { RequirementDive } from '../src/shared/protocol.js'

const NOW = 1_791_040_000_000
const ACTOR = { kind: 'system' as const }

/** armed + 健康的基线需求。 */
function armedHealthy(): RequirementDive {
  return { phase: 'active', activation: 'armed', roundsInStage: 3, lastActiveAt: NOW - 1000 }
}

/** armed + 因达上限而停手（round-limit 前缀）。 */
function armedRoundLimit(): RequirementDive {
  return {
    ...armedHealthy(),
    driverHealth: { state: 'paused', reason: 'round-limit:implementing', since: NOW - 500, attempts: 2 },
  }
}

/** 人主动 clear_pause 之后的形态：disarmed + idle（自动化被关掉，不是故障）。 */
function manuallyDisarmed(): RequirementDive {
  return { phase: 'idle', activation: 'disarmed', roundsInStage: 0 }
}

const run = (prev: RequirementDive | undefined, event: DiveEvent, extra: Record<string, unknown> = {}) =>
  transitionDive(prev, { event, now: NOW, actor: ACTOR, ...extra } as never)

describe('transitionDive：八事件写入表（FR-9）', () => {
  it('1/8 arm：立项创建为自动 + 健康，回合计数归零', () => {
    const r = run(undefined, 'arm')
    expect(r.changed).toBe(true)
    expect(r.next).toMatchObject({ activation: 'armed', phase: 'active', roundsInStage: 0, lastActiveAt: NOW })
    expect(r.comment).toBeUndefined() // 立项的留痕由 capture 自己写，本事件不重复
  })

  it('2/8 disarm-manual：人主动解锁 → disarmed + idle + 清暂停语（缺失时按 ClearPause 口径新建）', () => {
    const r = run(armedRoundLimit(), 'disarm-manual', { actor: { kind: 'agent', sessionId: 'session-a' } })
    expect(r.changed).toBe(true)
    expect(r.next).toMatchObject({ activation: 'disarmed', phase: 'idle', roundsInStage: 3 })
    expect(r.next?.pausedReason).toBeUndefined()
    // 注意：既有 ClearPause 不动 roundsInStage，本事件保持同口径（不顺手改语义）
    expect(r.comment?.body).toContain('之前状态：armed')

    const fresh = run(undefined, 'disarm-manual')
    expect(fresh.changed).toBe(true)
    expect(fresh.next).toMatchObject({ activation: 'disarmed', phase: 'idle', roundsInStage: 0 })
  })

  it('3/8 disarm-rollback：需求回退解除自动链，清暂停语但**不动 phase 与计数**', () => {
    const r = run({ ...armedHealthy(), pausedReason: 'x' }, 'disarm-rollback', { actor: { kind: 'agent', sessionId: 's' } })
    expect(r.changed).toBe(true)
    expect(r.next).toMatchObject({ activation: 'disarmed', phase: 'active', roundsInStage: 3 })
    expect(r.next?.pausedReason).toBeUndefined()
  })

  it('4/8 pause-runtime：只写健康位（原因 + 次数 +1），人的意图逐字不变', () => {
    const prev = armedHealthy()
    const r = run(prev, 'pause-runtime', { reason: 'deliver-failed' })
    expect(r.changed).toBe(true)
    expect(r.next?.activation).toBe('armed') // 红线：故障不改人的意图
    expect(r.next?.driverHealth).toEqual({ state: 'paused', reason: 'deliver-failed', since: NOW, attempts: 1 })
    expect(r.next?.lastActiveAt).toBe(NOW)
    expect(r.comment?.body).toContain('运行时原因：deliver-failed')
  })

  it('4b/8 pause-runtime（达上限）：attempts **不** +1，且留痕写出阶段与上限', () => {
    const prev: RequirementDive = { ...armedHealthy(), driverHealth: { state: 'healthy', since: NOW - 9, attempts: 4 } }
    const r = run(prev, 'pause-runtime', { reason: 'round-limit:implementing', status: 'implementing', roundLimit: 100 })
    expect(r.next?.driverHealth).toEqual({ state: 'paused', reason: 'round-limit:implementing', since: NOW, attempts: 4 })
    expect(r.comment?.body).toContain('阶段 implementing 达上限 100 回合')
    expect(r.comment?.body).toContain('roundsInStage=3')
  })

  it('5/8 recover-auto：运行时暂停复位健康；round-limit 才把额度还回去', () => {
    const a = run(armedRoundLimit(), 'recover-auto', { trigger: 'requirement-moved' })
    expect(a.next?.roundsInStage).toBe(0) // 达上限 → 归零
    expect(a.next?.driverHealth).toEqual({ state: 'healthy', since: NOW, attempts: 0 })
    expect(a.next?.activation).toBe('armed')

    const b = run({ ...armedHealthy(), driverHealth: { state: 'paused', reason: 'deliver-failed', since: NOW - 5, attempts: 3 } }, 'recover-auto')
    expect(b.next?.roundsInStage).toBe(3) // 非上限原因 → 额度不动
    expect(b.next?.driverHealth?.state).toBe('healthy')

    const legacy = run({ phase: 'active', activation: 'disarmed', roundsInStage: 1 }, 'recover-auto')
    expect(legacy.next?.activation).toBe('armed') // 误停摆 → 恢复意图
  })

  it('6/8 arm-explicit：唯一能把 disarmed 改回 armed 的事件（人按下「继续」）', () => {
    const r = run(manuallyDisarmed(), 'arm-explicit', { trigger: 'board-resume', actor: { kind: 'human' } })
    expect(r.changed).toBe(true)
    expect(r.next).toMatchObject({ activation: 'armed', phase: 'active' })
    expect(r.comment?.createdBy.kind).toBe('human')
    expect(r.comment?.body).toContain('trigger=board-resume')
  })

  it('7/8 advance-stage：阶段变了 → 回合计数与连续失败次数归零，activation 不动', () => {
    const r = run({ ...armedHealthy(), driverHealth: { state: 'healthy', since: NOW - 5, attempts: 2 } }, 'advance-stage')
    expect(r.next?.roundsInStage).toBe(0)
    expect(r.next?.driverHealth?.attempts).toBe(0)
    expect(r.next?.activation).toBe('armed')
  })

  it('8/8 confirm-advance：跨阶段归零 + 运行时暂停复位；**绝不代人选「继续」**', () => {
    const a = run(armedRoundLimit(), 'confirm-advance', { stageChanged: true })
    expect(a.next?.roundsInStage).toBe(0)
    expect(a.next?.driverHealth?.state).toBe('healthy')
    expect(a.next?.activation).toBe('armed')

    // 人主动关掉自动化之后再确认推进 → 自动化仍然关着（phase/pausedReason 也不许被顺手改）
    const b = run(manuallyDisarmed(), 'confirm-advance', { stageChanged: true })
    expect(b.next?.activation).toBe('disarmed')
    expect(b.next?.phase).toBe('idle')

    // 人手动解锁 + 曾经因上限停手 → 只复位健康，不改意图
    const c = run({ ...manuallyDisarmed(), driverHealth: { state: 'paused', reason: 'round-limit:design', since: NOW - 1, attempts: 1 } }, 'confirm-advance')
    expect(c.next?.activation).toBe('disarmed')
    expect(c.next?.driverHealth?.state).toBe('healthy')
  })
})

describe('红线：只有 arm-explicit 能改回 armed（FR-9 不变量①）', () => {
  const events: DiveEvent[] = ['disarm-manual', 'disarm-rollback', 'pause-runtime', 'recover-auto', 'advance-stage', 'confirm-advance']

  for (const event of events) {
    it(`${event} 在 disarmed 需求上不会把它变回 armed`, () => {
      const prev = manuallyDisarmed()
      const r = run(prev, event, { reason: 'deliver-failed', stageChanged: true })
      expect(r.next?.activation ?? 'disarmed').toBe('disarmed')
    })
  }
})

describe('不变量①的窄例外（既有特性，必须显式钉住）', () => {
  it('误停摆（disarmed + phase=active）会被 recover-auto 拉回 armed——这是 REQ-261001201200-8f8b FR-4', () => {
    const legacy: RequirementDive = { phase: 'active', activation: 'disarmed', roundsInStage: 2 }
    const r = run(legacy, 'recover-auto', { trigger: 'requirement-moved' })
    expect(r.changed).toBe(true)
    expect(r.next?.activation).toBe('armed')
  })

  it('人主动关掉的形态（disarmed + idle）**永不**被任何自动/推进事件改写', () => {
    const manual = manuallyDisarmed()
    for (const event of ['recover-auto', 'confirm-advance', 'advance-stage', 'pause-runtime'] as DiveEvent[]) {
      const r = run(manual, event, { reason: 'deliver-failed', stageChanged: true, trigger: 'requirement-moved' })
      expect(r.next?.activation ?? 'disarmed', event).toBe('disarmed')
    }
  })
})

describe('非法事件矩阵：不成立就零写入（FR-9 不变量③）', () => {
  const cases: { name: string; prev: RequirementDive | undefined; event: DiveEvent; extra?: Record<string, unknown> }[] = [
    { name: 'disarm-manual on 已 disarmed+idle', prev: manuallyDisarmed(), event: 'disarm-manual' },
    { name: 'disarm-rollback on 已 disarmed', prev: manuallyDisarmed(), event: 'disarm-rollback' },
    { name: 'arm-explicit on 已 armed+健康', prev: armedHealthy(), event: 'arm-explicit' },
    { name: 'advance-stage on 计数已为 0', prev: { ...armedHealthy(), roundsInStage: 0, driverHealth: { state: 'healthy', since: NOW, attempts: 0 } }, event: 'advance-stage' },
    { name: 'pause-runtime on disarmed（本就没在自动跑）', prev: manuallyDisarmed(), event: 'pause-runtime', extra: { reason: 'deliver-failed' } },
    { name: 'pause-runtime 同原因重复', prev: armedRoundLimit(), event: 'pause-runtime', extra: { reason: 'round-limit:implementing' } },
    { name: 'recover-auto on armed+健康', prev: armedHealthy(), event: 'recover-auto' },
    { name: 'recover-auto on 人主动暂停', prev: manuallyDisarmed(), event: 'recover-auto' },
    { name: 'confirm-advance 无变化', prev: armedHealthy(), event: 'confirm-advance' },
    { name: '任何事件 on 无 dive 的需求（arm/disarm-manual 除外）', prev: undefined, event: 'recover-auto' },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const r = run(c.prev, c.event, c.extra ?? {})
      expect(r.changed).toBe(false)
      expect(r.next).toBe(c.prev) // 同值（含 undefined）：调用方零写入
      expect(r.comment).toBeUndefined()
      expect(diveEquals(r.next, c.prev)).toBe(true)
    })
  }

  it('未知事件字符串：零写入，不猜', () => {
    const prev = armedHealthy()
    const r = run(prev, 'no-such-event' as DiveEvent)
    expect(r.changed).toBe(false)
    expect(r.next).toBe(prev)
  })
})

describe('幂等与纯函数性（FR-9 不变量③）', () => {
  const pairs: { event: DiveEvent; prev: RequirementDive; extra?: Record<string, unknown> }[] = [
    { event: 'pause-runtime', prev: armedHealthy(), extra: { reason: 'deliver-failed' } },
    { event: 'recover-auto', prev: armedRoundLimit(), extra: { trigger: 'requirement-moved' } },
    { event: 'arm-explicit', prev: manuallyDisarmed(), extra: { trigger: 'board-resume', actor: { kind: 'human' } } },
    { event: 'advance-stage', prev: { ...armedHealthy(), driverHealth: { state: 'healthy', since: NOW, attempts: 1 } } },
    { event: 'disarm-rollback', prev: armedHealthy() },
    { event: 'confirm-advance', prev: armedRoundLimit(), extra: { stageChanged: true } },
  ]

  for (const p of pairs) {
    it(`${p.event}：连调两次，第二次 changed:false 且不重复生成留痕`, () => {
      const first = run(p.prev, p.event, p.extra ?? {})
      expect(first.changed).toBe(true)
      const second = run(first.next, p.event, { ...(p.extra ?? {}), now: NOW + 1 })
      expect(second.changed).toBe(false)
      expect(second.next).toBe(first.next)
      expect(second.comment).toBeUndefined()
    })
  }

  it('不改入参：冻结的 dive 也不抛', () => {
    const prev = Object.freeze(armedHealthy())
    const r = run(prev, 'pause-runtime', { reason: 'deliver-failed' })
    expect(r.changed).toBe(true)
    expect(prev.driverHealth).toBeUndefined() // 入参没被写
    expect(r.next).not.toBe(prev)
  })
})
