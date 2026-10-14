/**
 * 立项即 seed 阶段目标表（批 1 · 创建走驱动的前置）。
 *
 * 【为什么必须有这道断言】驱动判"本阶段还有没有活"读的就是 `record.goals`
 * （`readyToClose` 要求表非空）；不 seed 的话，立项后第一拍必然停手
 * ——四个 doc 阶段（draft/brainstorming/design/decomposing）连"这一拍做什么"都没有来源。
 *
 * 三条判据：
 *   ① 纯函数 `seedStageGoals()`：段序 = ALL_STAGE_KEYS、全 pending、陈述与判据非空、缺模板即抛；
 *   ② 它与驱动判据联动：`readyToClose=false`、`goalsProgressOf={7,0}`（"本阶段未达成"可判）；
 *   ③ 接线：真实 capture 用例跑完后，台账里就有这张表（不是只在纯函数里对）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, FakeQuestions } from 'tests/application/harness.js'
import { captureRequirement } from 'pm-core/application/use-cases/CaptureRequirement.js'
import { readyToClose, goalsProgressOf } from 'pm-goal'
import { ALL_STAGE_KEYS } from 'pm-core/protocol-domain.js'
import { seedStageGoals } from 'pm-core/domain/workflow/StageGoalSeed.js'
import type { AskAnswer } from 'pm-core/application/ports.js'

const W = 'session-fresh-window'
const NEW_REQ = 'REQ-261011000000-aaaa'

/** 立项四问作答（label 必须与枚举原值严格相等，否则映射回落默认）。 */
const ANSWERS: AskAnswer[] = [
  { id: 'name', selected: ['创建一个新项目'] },
  { id: 'category', selected: ['feature'] },
  { id: 'difficulty', selected: ['standard'] },
  { id: 'location', selected: ['docs/requirements/<REQ>/'] },
] as never

describe('seedStageGoals（纯函数）', () => {
  it('七段、顺序 = ALL_STAGE_KEYS、全 pending、陈述与判据都非空', () => {
    const goals = seedStageGoals()
    expect(goals.map((g) => g.stage)).toEqual([...ALL_STAGE_KEYS])
    expect(goals).toHaveLength(7)
    for (const g of goals) {
      expect(g.state).toBe('pending')
      expect(g.statement.trim()).not.toBe('')
      expect(g.doneCriteria.length).toBeGreaterThan(0)
      expect(g.doneCriteria.every((c) => c.trim() !== '')).toBe(true)
    }
  })

  it('与驱动判据联动：表非空但未达成 ⇒ readyToClose=false（"本阶段还没成"可判）', () => {
    const goals = seedStageGoals()
    expect(readyToClose(goals)).toBe(false)
    expect(goalsProgressOf(goals)).toEqual({ total: 7, done: 0 })
  })

  it('零共享：两次调用互不影响（判据数组是副本）', () => {
    const a = seedStageGoals()
    const b = seedStageGoals()
    ;(a[0].doneCriteria as string[]).push('被改坏了')
    expect(b[0].doneCriteria).not.toContain('被改坏了')
  })
})

describe('立项即写表（真实 capture 用例）', () => {
  it('capture 完成后台账里就有七段阶段目标（驱动从此有"本阶段做什么"的来源）', async () => {
    const h = makeHarness({})
    const q = new FakeQuestions()
    q.answers = ANSWERS
    h.deps.questions = q
    h.deps.rejections = { record: () => undefined, readAll: async () => [] } as never
    h.deps.ids = { requirement: () => NEW_REQ, task: () => 't-ffffff', comment: () => 'c-1' } as never

    const out = await captureRequirement(h.deps, {}, { agent: { id: W } }) as Record<string, unknown>
    expect(out.success).toBe(true)

    const rec = await h.store.get(NEW_REQ)
    expect(rec?.goals?.map((g) => g.stage)).toEqual([...ALL_STAGE_KEYS])
    expect(rec?.goals?.every((g) => g.state === 'pending')).toBe(true)
    expect(readyToClose(rec?.goals ?? [])).toBe(false)
  })
})
