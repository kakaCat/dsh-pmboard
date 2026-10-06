/**
 * 落库幂等只看真卡 + 回退态前置收敛（REQ-261005122915-9f90 t3 / FR-1, FR-2）。
 *
 * 本文件复现并锁死本需求的现场缺陷（REQ-261005105032-3b02）：
 * 需求回退后队列里只剩**占位重做卡**，此时批准一份 M 卡计划 —— 修前 `landApprovedPlan`
 * 把占位卡当成「已落库」，返回 `createdCount: 0`，于是整批新卡**静默不落库**、状态却照推进。
 *
 * 三条验收（对齐 t3 卡）：
 *  ① 预置 N 张占位卡 + 已批准 M 卡计划 → `createdCount === M`、`alreadyLanded === 0`、`staleReworkCanceled === N`；
 *  ② 连调两次 → 第二次 `createdCount === 0`、`alreadyLanded === M`、队列**零写入**；
 *  ③ 非回退态已有真卡 → 仍幂等跳过（事故 B 的幽灵卡防线不得削弱）。
 */
import { describe, it, expect } from 'vitest'
import { landApprovedPlan } from '../src/application/internal/approved-plan-landing.js'
import type { PlanTask } from '../src/shared/protocol.js'
import { makeHarness, req, task } from './application/harness.js'

const REQ_ID = 'REQ-0000a2'
const WINDOW = 'session-w-001'

const REQUIREMENT_MD = [
  '# 需求',
  '',
  '- **FR-1: 甲条**：第一件事',
  '- **FR-2: 乙条**：第二件事',
  '',
].join('\n')

const DECOMPOSITION_MD = [
  '# 拆分计划',
  '',
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1 |',
  '| FR-2 | 乙条 | t2 |',
  '',
].join('\n')

function planTasks(): PlanTask[] {
  return [
    {
      key: 't1', title: '实现甲', phase: 'implement', side: 'backend', dependsOn: [],
      acceptance: 'npx vitest run 全绿', implementation: '改 src/domain/a.ts', requirement_refs: ['FR-1'],
    },
    {
      key: 't2', title: '实现乙', phase: 'implement', side: 'backend', dependsOn: ['t1'],
      acceptance: 'npx vitest run 全绿', implementation: '改 src/domain/b.ts', requirement_refs: ['FR-2'],
    },
  ]
}

/** 回退留痕（`to` = 当前阶段 ⇒ 处于回退态）。 */
function rollbackMark(seq = 1, lastMaterialized: string[] = []) {
  return {
    from: 'implementing', to: 'decomposing', at: 1,
    by: { kind: 'human' as const }, reason: '回退重修', seq, lastMaterialized,
  }
}

function placeholder(id: string) {
  return task({
    id, requirementId: REQ_ID, title: '[重做] 卡 ' + id, status: 'todo', reworkOf: 't-old' + id,
  })
}

function seed(over: Partial<Parameters<typeof req>[0]> = {}) {
  const h = makeHarness()
  h.seedRequirementSync(req({
    id: REQ_ID,
    status: 'decomposing',
    category: 'feature',
    sourceSessionId: WINDOW,
    artifacts: [{
      stage: 'decomposing', kind: 'decomposition',
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW },
    } as never],
    plan: {
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      summary: '把活拆成 2 张卡',
      tasks: planTasks(),
      submittedAt: h.clock.t,
      submittedBy: { kind: 'agent', sessionId: WINDOW },
      approvedAt: h.clock.t,
      approvedBy: { kind: 'human', sessionId: WINDOW },
    },
    ...over,
  }))
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', REQUIREMENT_MD)
  h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DECOMPOSITION_MD)
  return h
}

describe('landApprovedPlan · 占位卡不得冒充已落库（FR-1）', () => {
  it('回退态：3 张占位卡被收掉，2 张计划的卡真的落库（修复前 createdCount=0）', async () => {
    const h = seed({ rollback: rollbackMark(1, ['t-p1', 't-p2', 't-p3']) as never })
    await h.seedSettled()
    await h.setTasks(REQ_ID, [placeholder('t-p1'), placeholder('t-p2'), placeholder('t-p3')])

    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })

    expect(out.createdCount, '修复前这里是 0（占位卡把幂等判据骗了）').toBe(2)
    expect(out.alreadyLanded).toBe(0)
    expect(out.staleReworkCanceled).toBe(3)

    const tasks = await h.tasksOf(REQ_ID)
    expect(tasks).toHaveLength(5)
    for (const p of tasks.filter(t => (t.reworkOf ?? '') !== '')) {
      expect(p.status, p.id + ' 占位卡应被收敛为 canceled').toBe('canceled')
    }
    expect(tasks.filter(t => t.status === 'todo')).toHaveLength(2)
  })

  it('【3b02 现场形态】状态已越过回退、占位卡还活着 → 仍必须真落库（只有 FR-1 能挡这一刻）', async () => {
    // 回退记录在，但 `rollback.to`(decomposing) ≠ 当前阶段(implementing) ⇒ **收敛不触发**
    // （那条收敛只认「当前阶段 = 上次回退的目标」）。于是占位卡原样留着——
    // 这正是 REQ-261005105032-3b02 的现场：状态 implementing、队列只剩 13 张占位卡。
    // 修前：幂等判据把它们算成「已落库」→ 0 张落。修后：只认真卡 → 真的落。
    const h = seed({
      status: 'implementing' as never,
      rollback: { from: 'implementing', to: 'decomposing', at: 1, by: { kind: 'human' }, reason: 'r', seq: 1 } as never,
    })
    await h.seedSettled()
    await h.setTasks(REQ_ID, [placeholder('t-p1'), placeholder('t-p2'), placeholder('t-p3')])

    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })

    expect(out.createdCount, '修复前这里是 0（占位卡冒充已落库）').toBe(2)
    expect(out.alreadyLanded).toBe(0)
    expect(out.staleReworkCanceled, '非回退态不触发收敛，占位卡靠人清（FR-5）').toBe(0)
    expect(await h.tasksOf(REQ_ID)).toHaveLength(5)
  })

  it('非回退态：已有真卡 → 仍幂等跳过（事故 B 防线不动）', async () => {
    const h = seed({ status: 'implementing' as never })
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      task({ id: 't-existing1', requirementId: REQ_ID, status: 'todo' }),
      task({ id: 't-existing2', requirementId: REQ_ID, status: 'in_progress' }),
    ])

    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })

    expect(out.createdCount).toBe(0)
    expect(out.alreadyLanded).toBe(2)
    expect(out.staleReworkCanceled).toBe(0)
    expect(await h.tasksOf(REQ_ID)).toHaveLength(2)
  })

  it('回退态但已落过新卡（真卡在）→ 幂等跳过，不重复建卡', async () => {
    const h = seed({ rollback: rollbackMark(1) as never })
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      task({ id: 't-real1', requirementId: REQ_ID, status: 'todo' }),
    ])

    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })

    // 回退态判定为 ok（允许重建），但真卡已在 → 落库走 createMany 幂等：不产生第二份
    expect(out.createdCount).toBe(0)
    expect(await h.tasksOf(REQ_ID)).toHaveLength(1)
  })
})

describe('landApprovedPlan · 连调两次幂等（FR-1 ②）', () => {
  it('第二次 createdCount=0、alreadyLanded=卡数、队列零写入', async () => {
    const h = seed({ rollback: rollbackMark(1, ['t-p1']) as never })
    await h.seedSettled()
    await h.setTasks(REQ_ID, [placeholder('t-p1')])

    const first = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(first.createdCount).toBe(2)
    const seqAfterFirst = h.queueRevisionOf(REQ_ID)

    const second = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(second.createdCount).toBe(0)
    expect(second.alreadyLanded).toBe(2)
    expect(second.staleReworkCanceled, '第一轮已收完，第二轮无候选').toBe(0)
    expect(h.queueRevisionOf(REQ_ID)).toBe(seqAfterFirst)
  })
})
