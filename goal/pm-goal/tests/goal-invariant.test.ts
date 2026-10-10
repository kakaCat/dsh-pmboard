/**
 * goal 不变量（对齐宿主 `dsh-goal/src/invariant.ts` 的独立校验纪律）。
 *
 * 【守护什么】不变量违反 = "规则实现坏了"（不是业务拒绝），四条各来一真一假：
 *   INV-1 complete 终态不可逆；INV-2 revision 恰好 +1 / 无效变更零变化；
 *   INV-3 blocked 必带原因；INV-4 身份字段稳定。
 */
import { describe, it, expect } from 'vitest'
import type { GoalEvent } from 'pm-goal/domain.js'
import { applyGoalEvent } from 'pm-goal/fold.js'
import { checkGoalInvariants } from 'pm-goal/invariant.js'
import type { TaskGoal } from 'pm-goal/types.js'

function goal(over: Partial<TaskGoal> = {}): TaskGoal {
  return { id: 'goal:t-1', taskId: 't-1', objective: '完成登录页', phase: 'active', revision: 1, ...over }
}

describe('checkGoalInvariants', () => {
  it('合法迁移：零违反（create/pause/resume/block/complete 各走一遍）', () => {
    const events: GoalEvent[] = [
      { kind: 'pause', reason: { code: 'interrupted', message: '中断' } }, { kind: 'resume' },
      { kind: 'block', reason: { code: 'upstream', message: '等上游' } }, { kind: 'resume' },
      { kind: 'complete' },
    ]
    let cur: TaskGoal | undefined = goal()
    for (const e of events) {
      const r = applyGoalEvent(cur, e)
      expect(checkGoalInvariants(cur, r), e.kind).toEqual([])
      cur = r.next
    }
  })

  it('INV-1：complete 后任何事件都被拒，且零变化', () => {
    const done = goal({ phase: 'complete', revision: 3 })
    for (const e of [{ kind: 'pause' }, { kind: 'resume' }, { kind: 'complete' }] as GoalEvent[]) {
      const r = applyGoalEvent(done, e)
      expect(r.changed).toBe(false)
      expect(checkGoalInvariants(done, r)).toEqual([])
    }
  })

  it('INV-2：无效变更（幂等重放）零变化，不 bump revision', () => {
    const cur = goal({ phase: 'paused', revision: 2 })
    const r = applyGoalEvent(cur, { kind: 'pause', reason: { code: 'interrupted', message: 'x' } })
    expect(checkGoalInvariants(cur, r)).toEqual([])
    expect(r.next).toBe(cur)
  })

  it('INV-3：blocked 缺结构化原因会被点名（code 或 message 空都算）', () => {
    const prev = goal()
    const missing = { changed: true, next: goal({ phase: 'blocked', revision: 2 }) }
    expect(checkGoalInvariants(prev, missing).map((v) => v.inv)).toContain('INV-3')
    const emptyCode = { changed: true, next: goal({ phase: 'blocked', revision: 2, blockedReason: { code: '  ', message: 'x' } }) }
    expect(checkGoalInvariants(prev, emptyCode).map((v) => v.inv)).toContain('INV-3')
    const ok = { changed: true, next: goal({ phase: 'blocked', revision: 2, blockedReason: { code: 'upstream', message: '等上游' } }) }
    expect(checkGoalInvariants(prev, ok)).toEqual([])
  })

  it('INV-4：身份字段被改写会被点名', () => {
    const prev = goal()
    const bad = { changed: true, next: goal({ objective: '另一个目标', revision: 2 }) }
    expect(checkGoalInvariants(prev, bad).map((v) => v.inv)).toContain('INV-4')
  })

  it('INV-2：revision 跳号会被点名', () => {
    const prev = goal({ revision: 2 })
    const bad = { changed: true, next: goal({ phase: 'paused', revision: 5 }) }
    expect(checkGoalInvariants(prev, bad).map((v) => v.inv)).toContain('INV-2')
  })
})
