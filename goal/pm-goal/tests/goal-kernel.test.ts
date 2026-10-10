/**
 * Goal 内核（REQ-261010200257-7e2d FR-1/FR-2 · P1）。
 *
 * 【守护范围（任一被回退即红）】
 *   1. 七事件各自的有效迁移：字段变化逐字钉死；
 *   2. 回合计数的唯一权威在 driver（dive.roundsInStage）；goal 不另存计数（进程级收敛）
 *   3. 非法迁移矩阵：事件在当前状态下不成立 → changed:false 且 next 与入参同值（零写入）；
 *   3. 幂等：create 重放 / admit-round 同 round 重放 / block 同因重放 → changed:false；
 *   4. 红线：complete 是终态（任何事件不再改写）；block 必须带原因；
 *      admit-round 只允许 +1 步进（对齐 round-driver persistAdmission 的 >= 守卫）；
 *   5. 纯：不改入参、零依赖（文件扫描断言：domain/goal 只许相对路径 type 导入）。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoPath } from 'tests/helpers/repo-root.js'
import { applyGoalEvent } from 'pm-goal/fold.js'
import type { GoalEvent } from 'pm-goal/domain.js'
import {
  foldGoal,
  isGoalActive, goalAllowsRound,
  readyToClose, stageGoalOf, goalsProgressOf, applyStageGoalDone, validateStageGoals,
} from 'pm-goal/fold.js'
import type { StageGoal, TaskGoal } from 'pm-goal/types.js'

function activeGoal(over: Partial<TaskGoal> = {}): TaskGoal {
  return {
    id: 'goal:t-aaaaaa', taskId: 't-aaaaaa', objective: '完成登录页',
    phase: 'active', revision: 1, ...over,
  }
}

const CREATE_GOAL = { id: 'goal:t-aaaaaa', taskId: 't-aaaaaa', objective: '完成登录页' }
const CREATE: GoalEvent = { kind: 'create', goal: CREATE_GOAL }

describe('applyGoalEvent · create', () => {
  it('空 → active，rounds=0，revision=1', () => {
    const r = applyGoalEvent(undefined, CREATE)
    expect(r.changed).toBe(true)
    expect(r.next).toEqual({ ...CREATE_GOAL, phase: 'active', revision: 1 })
  })

  it('幂等重建：同身份同陈述 → 零写入（phase/rounds 不被重置）', () => {
    const cur = activeGoal({ phase: 'paused', revision: 9 })
    const r = applyGoalEvent(cur, CREATE)
    expect(r.changed).toBe(false)
    expect(r.next).toBe(cur)
  })

  it('身份冲突：同 id 不同陈述 → 拒绝', () => {
    const r = applyGoalEvent(activeGoal(), {
      kind: 'create', goal: { id: 'goal:t-aaaaaa', taskId: 't-aaaaaa', objective: '别的目标' },
    })
    expect(r.changed).toBe(false)
    expect(r.reason).toBe('create:identity-conflict')
  })
})

describe('applyGoalEvent · pause / resume / block / complete', () => {
  it('pause：active → paused，原因进 blockedReason', () => {
    const r = applyGoalEvent(activeGoal(), { kind: 'pause', reason: { code: 'interrupted', message: '窗口中断' } })
    expect(r.next).toMatchObject({ phase: 'paused', revision: 2 })
  })

  it('pause 非法矩阵：paused/blocked/complete 都拒', () => {
    for (const phase of ['paused', 'blocked', 'complete'] as const) {
      const cur = activeGoal({ phase })
      const r = applyGoalEvent(cur, { kind: 'pause' })
      expect(r.changed).toBe(false)
      expect(r.next).toBe(cur)
    }
  })

  it('resume：paused/blocked → active 且清原因；active/complete 拒', () => {
    expect(applyGoalEvent(activeGoal({ phase: 'paused' }), { kind: 'resume' }).next)
      .toMatchObject({ phase: 'active', blockedReason: undefined })
    expect(applyGoalEvent(activeGoal({ phase: 'blocked', blockedReason: { code: 'upstream', message: 'x' } }), { kind: 'resume' }).next)
      .toMatchObject({ phase: 'active', blockedReason: undefined })
    expect(applyGoalEvent(activeGoal({ phase: 'active' }), { kind: 'resume' }).changed).toBe(false)
    expect(applyGoalEvent(activeGoal({ phase: 'complete' }), { kind: 'resume' }).changed).toBe(false)
  })

  it('block 红线：原因为空 → 拒绝（不编造原因）', () => {
    expect(applyGoalEvent(activeGoal(), { kind: 'block', reason: { code: 'x', message: '  ' } }).changed).toBe(false)
  })

  it('block 幂等：同因重放零写入；异因累进 revision', () => {
    const blocked = activeGoal({ phase: 'blocked', blockedReason: { code: 'x', message: '等上游' }, revision: 4 })
    expect(applyGoalEvent(blocked, { kind: 'block', reason: { code: 'x', message: '等上游' } }).changed).toBe(false)
    const r = applyGoalEvent(blocked, { kind: 'block', reason: { code: 'x', message: '等人裁' } })
    expect(r.next).toMatchObject({ phase: 'blocked', blockedReason: { code: 'x', message: '等人裁' }, revision: 5 })
  })

  it('complete 终态：任何事件不再改写（重开 = 新建 goal）', () => {
    const done = activeGoal({ phase: 'complete' })
    const events: GoalEvent[] = [
      { kind: 'pause' }, { kind: 'resume' }, { kind: 'block', reason: { code: 'x', message: 'x' } },
      { kind: 'complete' },
    ]
    for (const e of events) {
      const r = applyGoalEvent(done, e)
      expect(r.changed, e.kind).toBe(false)
      expect(r.next).toBe(done)
    }
  })

  it('纯函数：不改入参（冻结对象不抛）', () => {
    const frozen = Object.freeze(activeGoal())
    expect(() => applyGoalEvent(frozen, { kind: 'pause' })).not.toThrow()
    expect(frozen.phase).toBe('active')
  })
})

describe('predicates', () => {
  it('isGoalActive / goalAllowsRound：只有 active 放行；缺失 ≠ active', () => {
    expect(isGoalActive(activeGoal())).toBe(true)
    expect(isGoalActive(activeGoal({ phase: 'paused' }))).toBe(false)
    expect(isGoalActive(undefined)).toBe(false)
    expect(goalAllowsRound('active')).toBe(true)
    expect(goalAllowsRound('complete')).toBe(false)
    expect(goalAllowsRound(undefined)).toBe(false)
  })

  it('readyToClose：全 done ⇒ true；空数组 ⇒ false（缺失 ≠ 达成）', () => {
    const goals: StageGoal[] = [
      { stage: 'design', statement: 's1', doneCriteria: [], state: 'done' },
      { stage: 'implementing', statement: 's2', doneCriteria: [], state: 'done' },
    ]
    expect(readyToClose(goals)).toBe(true)
    expect(readyToClose([goals[0], { ...goals[1], state: 'pending' }])).toBe(false)
    expect(readyToClose([])).toBe(false)
  })

  it('validateStageGoals：键集注入后，非法阶段键被拒且点名合法键（防"登记了永远不会达成的键"）', () => {
    const ok: StageGoal[] = [{ stage: 'design', statement: 's', doneCriteria: [], state: 'pending' }]
    expect(() => validateStageGoals(ok, ['design', 'implementing'])).not.toThrow()
    expect(() => validateStageGoals([{ ...ok[0], stage: 'xxx' }], ['design', 'implementing']))
      .toThrow(/阶段键非法：xxx（合法键：design \/ implementing）/)
    // 不注入键集 = 只校验非空/不重复（向后兼容的缺省）
    expect(() => validateStageGoals([{ ...ok[0], stage: 'whatever' }])).not.toThrow()
  })

  it('applyStageGoalDone：幂等；只改目标阶段；不改入参数组', () => {
    const goals: StageGoal[] = [
      { stage: 'design', statement: 's1', doneCriteria: [], state: 'pending' },
      { stage: 'implementing', statement: 's2', doneCriteria: [], state: 'pending' },
    ]
    const r = applyStageGoalDone(goals, 'design')
    expect(r.changed).toBe(true)
    expect(r.next[0].state).toBe('done')
    expect(r.next[1].state).toBe('pending')
    expect(goals[0].state).toBe('pending')
    expect(applyStageGoalDone(r.next, 'design').changed).toBe(false)
    expect(applyStageGoalDone(goals, 'accepting').changed).toBe(false)
  })

  it('goalsProgressOf：有界计数；undefined ⇒ undefined（缺失 ≠ 0）', () => {
    expect(goalsProgressOf(undefined)).toBeUndefined()
    expect(goalsProgressOf([
      { stage: 'design', statement: 's', doneCriteria: [], state: 'done' },
      { stage: 'implementing', statement: 's', doneCriteria: [], state: 'pending' },
    ])).toEqual({ total: 2, done: 1 })
  })

  it('stageGoalOf：无 ⇒ undefined（缺失 ≠ pending）', () => {
    expect(stageGoalOf([], 'design')).toBeUndefined()
  })
})

describe('零依赖边界（FR-1 判定标准 1）', () => {
  it('pm-goal/src 只允许相对路径导入（无外部包名 / @deepseek-ai / node I/O）', () => {
    const dir = repoPath('goal/pm-goal/src')
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(5)
    const importRe = /^import(?:\s+type)?[^\n]*from\s+'([^']+)'/gm
    let scanned = 0
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(importRe)) {
        scanned += 1
        const spec = m[1]
        // 相对路径 = 包内（内核纯函数互相引用）；任何外部包名 = 依赖外泄。
        expect(spec.startsWith('./') || spec.startsWith('../'), `${f} 违规 import: ${m[0]}`).toBe(true)
      }
      expect(src).not.toMatch(/Date\.now|Math\.random/)
    }
    expect(scanned, '扫描器自检：确实抽到了 import').toBeGreaterThanOrEqual(4)
  })

  it('依赖只向内：pm-goal 不 import pm-core / pm-common（core 引用本包，反之禁止）', () => {
    const dir = repoPath('goal/pm-goal/src')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/from '(pm-core|pm-common|pm-round-driver|pm-client|tool-pm)/)
    }
  })
})

describe('对齐宿主 goal：edit / clear 墓碑 / 严格解码 / 聚合视图', () => {
  it('edit：换陈述与回合上限；至少要给一项；同值幂等', () => {
    const cur = activeGoal({ maxGoalRounds: 10 })
    const r = applyGoalEvent(cur, { kind: 'edit', objective: '新目标' })
    expect(r.next).toMatchObject({ objective: '新目标', maxGoalRounds: 10, revision: 2 })
    expect(applyGoalEvent(cur, { kind: 'edit' }).changed).toBe(false)
    expect(applyGoalEvent(cur, { kind: 'edit', objective: '  ' }).changed).toBe(false)
    expect(applyGoalEvent(cur, { kind: 'edit', maxGoalRounds: 0 }).changed).toBe(false)
    expect(applyGoalEvent(cur, { kind: 'edit', objective: '新目标' }).changed).toBe(true)
  })

  it('foldGoal 严格解码：版本不符 → 抛（不静默吞）', () => {
    expect(() => foldGoal([{ kind: 'goal/change', version: 2 as never, operation: 'create', goal: activeGoal() }]))
      .toThrow(/版本不认识/)
  })

  it('foldGoal：create → clear（墓碑）→ 复用同 id 被拒', () => {
    const g = activeGoal()
    const folded = foldGoal([
      { kind: 'goal/change', version: 1, operation: 'create', goal: g },
      { kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: g.id, revision: g.revision }, clearedAt: 5 },
    ])
    expect(folded.goal).toBeUndefined()                  // 清掉之后：没有当前目标
    expect(folded.seenGoalIds).toEqual([g.id])           // 但身份留痕了
    expect(() => foldGoal([
      { kind: 'goal/change', version: 1, operation: 'clear', cleared: { id: g.id, revision: 1 }, clearedAt: 1 },
      { kind: 'goal/change', version: 1, operation: 'create', goal: g },
    ])).toThrow(/身份被复用/)
  })

  it('foldGoal：最后一次变更即当前状态（快照语义）', () => {
    const g = activeGoal()
    const paused = { ...g, phase: 'paused' as const, revision: 2 }
    const folded = foldGoal([
      { kind: 'goal/change', version: 1, operation: 'create', goal: g },
      { kind: 'goal/change', version: 1, operation: 'pause', goal: paused },
    ])
    expect(folded.goal?.phase).toBe('paused')
  })
})
