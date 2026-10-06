/**
 * 回退态「占位重做卡」收敛单测（REQ-261005122915-9f90 t2 / FR-2）。
 *
 * 三条验收（对齐 t2 卡）：
 *  ① 回退态落库前把活着的占位卡全部置 `canceled`（并留 `kind='rollback'` 修订）；
 *  ② **无候选时不写盘**（队列写入序号不变 —— 幂等的可观测判据）；
 *  ③ 只碰占位卡：真卡（含已取消真卡）一律不动。
 *
 * 为什么这条单测是本需求的核心：这段收敛此前只写在手动拆分路径的内联块里，
 * 抽成模块后由两条落库编排共用；本文件锁住「模块自己是对的」。
 */
import { describe, it, expect } from 'vitest'
import { cancelStaleReworkCards, STALE_REWORK_REASON } from '../src/application/internal/stale-rework.js'
import { makeHarness, req, task } from './application/harness.js'

const REQ_ID = 'REQ-0abc01'
const WINDOW = 'session-w-001'

function seed() {
  const h = makeHarness()
  h.seedRequirementSync(req({ id: REQ_ID, status: 'decomposing', sourceSessionId: WINDOW }))
  return h
}

/** 占位卡：`reworkOf` 指向旧卡（回退物化的形态）。 */
function placeholder(id: string, status: 'todo' | 'in_progress', reworkOf: string) {
  return task({
    id, requirementId: REQ_ID, title: '[重做] 卡 ' + id, status, reworkOf,
    statusHistory: [{ status, at: 1, by: { kind: 'agent', sessionId: WINDOW }, reason: '需求回退到 decomposing：由 ' + reworkOf + ' 物化的重做卡' }],
  })
}

describe('cancelStaleReworkCards · 回退态收敛（FR-2）', () => {
  it('活着的占位卡全部 canceled，各带 1 条 rollback 修订；真卡不动', async () => {
    const h = seed()
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      placeholder('t-p1', 'todo', 't-old1'),
      placeholder('t-p2', 'in_progress', 't-old2'),
      task({ id: 't-real', requirementId: REQ_ID, title: '真卡', status: 'todo' }),
    ])

    const out = await cancelStaleReworkCards({
      deps: h.deps, requirementId: REQ_ID, nowTs: 5000,
      actor: { kind: 'agent', sessionId: WINDOW },
    })

    expect(out.canceled).toBe(2)
    const tasks = await h.tasksOf(REQ_ID)
    const byId = new Map(tasks.map(t => [t.id, t]))
    for (const id of ['t-p1', 't-p2']) {
      const t = byId.get(id)!
      expect(t.status, id).toBe('canceled')
      const rollbacks = (t.revisions ?? []).filter(r => r.kind === 'rollback')
      expect(rollbacks.length, id).toBe(1)
      expect(rollbacks[0]!.reason).toBe(STALE_REWORK_REASON)
      expect(rollbacks[0]!.changes[0]).toContain('→canceled')
    }
    // 真卡一字未动
    expect(byId.get('t-real')!.status).toBe('todo')
  })

  it('无候选时不写盘（第二次调用 canceled===0 且队列写入序号不变）', async () => {
    const h = seed()
    await h.seedSettled()
    await h.setTasks(REQ_ID, [placeholder('t-p1', 'todo', 't-old1')])

    const first = await cancelStaleReworkCards({
      deps: h.deps, requirementId: REQ_ID, nowTs: 5000, actor: { kind: 'agent', sessionId: WINDOW },
    })
    expect(first.canceled).toBe(1)
    const seqAfterFirst = h.queueRevisionOf(REQ_ID)

    const second = await cancelStaleReworkCards({
      deps: h.deps, requirementId: REQ_ID, nowTs: 6000, actor: { kind: 'agent', sessionId: WINDOW },
    })
    expect(second.canceled).toBe(0)
    expect(h.queueRevisionOf(REQ_ID), '无候选必须零写入').toBe(seqAfterFirst)
  })

  it('已取消的占位卡不重复留痕；普通真卡（含 canceled 真卡）不被当成占位', async () => {
    const h = seed()
    await h.seedSettled()
    await h.setTasks(REQ_ID, [
      placeholder('t-p-canceled', 'todo', 't-old1'),
      task({ id: 't-real-canceled', requirementId: REQ_ID, status: 'canceled' }),
    ])
    await h.setTaskFields('t-p-canceled', { status: 'canceled' })

    const out = await cancelStaleReworkCards({
      deps: h.deps, requirementId: REQ_ID, nowTs: 5000, actor: { kind: 'agent', sessionId: WINDOW },
    })
    expect(out.canceled).toBe(0)
  })

  it('多需求的卡不受影响（只收敛目标需求）', async () => {
    const h = seed()
    h.seedRequirementSync(req({ id: 'REQ-000002', status: 'decomposing', sourceSessionId: WINDOW }))
    await h.seedSettled()
    await h.setTasks(REQ_ID, [placeholder('t-p1', 'todo', 't-old1')])
    await h.setTasks('REQ-000002', [
      task({ id: 't-x', requirementId: 'REQ-000002', status: 'todo', reworkOf: 't-oldx' }),
    ])

    const out = await cancelStaleReworkCards({
      deps: h.deps, requirementId: REQ_ID, nowTs: 5000, actor: { kind: 'agent', sessionId: WINDOW },
    })
    expect(out.canceled).toBe(1)
    const other = await h.tasksOf('REQ-000002')
    expect(other[0]!.status).toBe('todo')
  })
})
