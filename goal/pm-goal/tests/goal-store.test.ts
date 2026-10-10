/**
 * goal 读写收口（REQ-261010200257-7e2d FR-2/FR-3/FR-4 · P4）。
 *
 * 【守护什么】
 *   ① 幂等：同值重放零写入（纯函数说 changed:false → 不写盘）——重试不得重置相位/计数；
 *   ② 取卡口径：队列顺序里第一张"开着且有 goal"的卡，running 优先；无卡/无 goal → undefined（放行）；
 *   ③ 越权边界：`markStageGoalDone` 只对表内阶段生效，已 done 零写入（D-4：人工门落章专属）；
 *   ④ 载体：L2 落 `TaskRecord.goal`、L1 落 `RequirementRecord.goals`（既有台账介质，零新存储）。
 */
import { describe, it, expect } from 'vitest'
import type { GoalRequirementLike, GoalTaskLike } from 'pm-goal'
import type { StageGoal, TaskGoal } from 'pm-goal/types.js'
import {
  clearTaskGoal, createTaskGoal, completeTaskGoal, goalViewOf, pauseTaskGoal,
  goalPhaseOf, stageGoalsOf, markStageGoalDone,
} from 'pm-goal'

function task(id: string, status: string, goal?: TaskGoal): GoalTaskLike {
  return { id, status, ...(goal === undefined ? {} : { goal }) }
}

function req(goals?: StageGoal[]): GoalRequirementLike {
  return { goals, updatedAt: 1 }
}

/** 最小任务队列夹具：记录写盘次数（幂等断言靠它）。 */
function taskStoreOf(initial: GoalTaskLike[]) {
  const tasks = [...initial]
  let writes = 0
  return {
    tasks,
    get writes() { return writes },
    listByRequirement: async () => tasks,
    mutate: async (_reqId: string, fn: (t: GoalTaskLike[]) => GoalTaskLike[] | undefined) => {
      const before = JSON.stringify(tasks)
      const out = fn(tasks)
      if (out === undefined) return tasks
      if (JSON.stringify(out) !== before) { writes += 1; tasks.splice(0, tasks.length, ...out) }
      return tasks
    },
  }
}

function reqStoreOf(r: GoalRequirementLike) {
  let writes = 0
  return {
    req: r,
    get writes() { return writes },
    get: async () => r,
    mutate: async (_id: string, fn: (draft: GoalRequirementLike) => { changed: boolean } | undefined) => {
      const out = fn(r)
      if (out === undefined) return { changed: false }
      writes += 1
      return { changed: true }
    },
  }
}

const NOW = () => 1_000

describe('L2 任务目标：建 / 完成 / 暂停', () => {
  it('建卡开工 → goal active + rounds=0 + revision=1', async () => {
    const ts = taskStoreOf([task('t-1', 'running')])
    const ok = await createTaskGoal({ taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }, 'REQ-x', 't-1', '完成登录页')
    expect(ok).toBe(true)
    expect(ts.tasks[0].goal).toMatchObject({ id: 'goal:t-1', phase: 'active', revision: 1 })
  })

  it('幂等：同卡同陈述重放 → 零写入（不重置相位）', async () => {
    const ts = taskStoreOf([task('t-1', 'running', {
      id: 'goal:t-1', taskId: 't-1', objective: '完成登录页', phase: 'paused', revision: 3,
    })])
    const ok = await createTaskGoal({ taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }, 'REQ-x', 't-1', '完成登录页')
    expect(ok).toBe(false)
    expect(ts.writes).toBe(0)
    expect(ts.tasks[0].goal).toMatchObject({ phase: 'paused' })
  })

  it('卡不存在 → 零写入、返回 false（不隐式建卡）', async () => {
    const ts = taskStoreOf([task('t-1', 'running')])
    expect(await createTaskGoal({ taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }, 'REQ-x', 't-404', 'x')).toBe(false)
    expect(ts.writes).toBe(0)
  })

  it('完成/暂停：相位迁移；重复完成幂等', async () => {
    const ts = taskStoreOf([task('t-1', 'running', {
      id: 'goal:t-1', taskId: 't-1', objective: 'x', phase: 'active', revision: 2,
    })])
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    expect(await pauseTaskGoal(deps, 'REQ-x', 't-1', { code: 'interrupted', message: '窗口中断' })).toBe(true)
    // pause 不再往 blockedReason 写（对齐宿主：blockedReason **只在 blocked 时出现**）
    expect(ts.tasks[0].goal).toMatchObject({ phase: 'paused' })
    expect(await completeTaskGoal(deps, 'REQ-x', 't-1')).toBe(true)
    expect(ts.tasks[0].goal).toMatchObject({ phase: 'complete' })
    const w = ts.writes
    expect(await completeTaskGoal(deps, 'REQ-x', 't-1')).toBe(false)
    expect(ts.writes).toBe(w)
  })
})

describe('FR-4 判据读：goalPhaseOf', () => {
  it('running 优先于排队卡', async () => {
    const ts = taskStoreOf([
      task('t-1', 'todo', { id: 'goal:t-1', taskId: 't-1', objective: 'a', phase: 'paused', revision: 1 }),
      task('t-2', 'running', { id: 'goal:t-2', taskId: 't-2', objective: 'b', phase: 'active', revision: 1 }),
    ])
    expect(await goalPhaseOf({ taskStore: ts as never }, 'REQ-x')).toBe('active')
  })

  it('无 running 时按队列顺序取第一张有 goal 的开卡', async () => {
    const ts = taskStoreOf([
      task('t-1', 'todo', { id: 'goal:t-1', taskId: 't-1', objective: 'a', phase: 'blocked', revision: 1 }),
      task('t-2', 'todo', { id: 'goal:t-2', taskId: 't-2', objective: 'b', phase: 'active', revision: 1 }),
    ])
    expect(await goalPhaseOf({ taskStore: ts as never }, 'REQ-x')).toBe('blocked')
  })

  it('收口卡不算：done/canceled 跳过；全无 goal → undefined（缺失语义 = 放行）', async () => {
    const ts = taskStoreOf([
      task('t-1', 'done', { id: 'goal:t-1', taskId: 't-1', objective: 'a', phase: 'complete', revision: 2 }),
      task('t-2', 'canceled', { id: 'goal:t-2', taskId: 't-2', objective: 'b', phase: 'complete', revision: 1 }),
      task('t-3', 'todo'),
    ])
    expect(await goalPhaseOf({ taskStore: ts as never }, 'REQ-x')).toBeUndefined()
  })
})

describe('L1 阶段目标：读表 + 人工门落章', () => {
  const goals = [
    { stage: 'design' as const, statement: '设计定稿', doneCriteria: ['评审通过'], state: 'pending' as const },
    { stage: 'implementing' as const, statement: '实现完成', doneCriteria: ['测试全绿'], state: 'pending' as const },
  ]

  it('stageGoalsOf：缺省 → 空数组（缺失 ≠ 有表）', async () => {
    expect(await stageGoalsOf({ store: reqStoreOf(req()) as never }, 'REQ-x')).toEqual([])
  })

  it('markStageGoalDone：表内阶段 → done；幂等；表外阶段零写入', async () => {
    const rs = reqStoreOf(req([...goals]))
    const deps = { taskStore: taskStoreOf([]) as never, store: rs as never, now: NOW }
    expect(await markStageGoalDone(deps, 'REQ-x', 'design')).toBe(true)
    expect(rs.req.goals?.[0].state).toBe('done')
    const w = rs.writes
    expect(await markStageGoalDone(deps, 'REQ-x', 'design')).toBe(false)
    expect(await markStageGoalDone(deps, 'REQ-x', 'accepting')).toBe(false)
    expect(rs.writes).toBe(w)
  })
})

describe('CAS 乐观锁（对齐宿主 goalRef 的 goal_id + revision）', () => {
  const seeded = () => taskStoreOf([task('t-1', 'running', {
    id: 'goal:t-1', taskId: 't-1', objective: 'x', phase: 'active', revision: 3,
  })])

  it('revision 对上 → 放行', async () => {
    const ts = seeded()
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    expect(await pauseTaskGoal(deps, 'REQ-x', 't-1', { code: 'interrupted', message: '中断' }, 3)).toBe(true)
  })

  it('revision 对不上 → 拒（陈旧引用不许覆盖别人的决定）', async () => {
    const ts = seeded()
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    await expect(pauseTaskGoal(deps, 'REQ-x', 't-1', { code: 'interrupted', message: '中断' }, 2)).rejects.toThrow(/已被别处改过/)
    expect(ts.writes).toBe(0)                    // **写前拒**：一次写盘都没发生
  })

  it('不给 revision → 不校验（老调用方兼容）', async () => {
    const ts = seeded()
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    expect(await completeTaskGoal(deps, 'REQ-x', 't-1')).toBe(true)
  })

  it('目标不存在却带 revision → 拒（不隐式建）', async () => {
    const ts = taskStoreOf([task('t-1', 'running')])
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    await expect(completeTaskGoal(deps, 'REQ-x', 't-1', 1)).rejects.toThrow(/不存在/)
  })
})

describe('对齐宿主 goal：clear 墓碑 / 聚合视图（派生只读）', () => {
  it('clear：摘掉目标但留墓碑；幂等（再清零写入）', async () => {
    const ts = taskStoreOf([task('t-1', 'running', {
      id: 'goal:t-1', taskId: 't-1', objective: 'x', phase: 'active', revision: 4,
    })])
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    const out = await clearTaskGoal(deps, 'REQ-x', 't-1')
    expect(out.changed).toBe(true)
    expect(out.cleared).toMatchObject({ id: 'goal:t-1', revision: 4 })
    expect(ts.tasks[0].goal).toBeUndefined()
    expect(ts.tasks[0].goalCleared).toMatchObject({ id: 'goal:t-1' })
    const again = await clearTaskGoal(deps, 'REQ-x', 't-1')
    expect(again.changed).toBe(false)
  })

  it('clear 后**不许同 id 重建**（seenGoalIds 语义；历史不被抹掉）', async () => {
    const ts = taskStoreOf([task('t-1', 'running', {
      id: 'goal:t-1', taskId: 't-1', objective: 'x', phase: 'active', revision: 1,
    })])
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    await clearTaskGoal(deps, 'REQ-x', 't-1')
    await expect(createTaskGoal(deps, 'REQ-x', 't-1', 'x')).rejects.toThrow(/已被 clear/)
  })

  it('goalViewOf：快照 + **派生只读**的 roundsStarted / activation（真相仍在 dive.*）', async () => {
    const ts = taskStoreOf([task('t-1', 'running', {
      id: 'goal:t-1', taskId: 't-1', objective: 'x', phase: 'active', revision: 2,
    })])
    const rs = reqStoreOf({ ...req(), dive: { roundsInStage: 5, activation: 'disarmed' } } as never)
    const deps = { taskStore: ts as never, store: rs as never, now: NOW }
    const view = await goalViewOf(deps, 'REQ-x', 't-1')
    expect(view).toMatchObject({ roundsStarted: 5, activation: 'disarmed' })
    expect(view?.goal.objective).toBe('x')
  })

  it('goalViewOf：无目标 → undefined（不伪造视图）', async () => {
    const ts = taskStoreOf([task('t-1', 'running')])
    const deps = { taskStore: ts as never, store: reqStoreOf(req()) as never, now: NOW }
    expect(await goalViewOf(deps, 'REQ-x', 't-1')).toBeUndefined()
  })
})
