// serves: FR-4
/**
 * 误物化批量清场（REQ-261004121649-bfa7 t3/t6 · FR-4）——「点一次，把一次回退物化的卡清掉」。
 *
 * 主判据不是「能清掉」，而是三条边界：
 *  ① 只清**那一次**物化的卡（不误伤上一批、不误伤别的需求的卡）；
 *  ② **不碰 done 卡**（已完成的活不能被清场吞掉）；
 *  ③ 再清一次 `canceled === 0`（幂等——清第二遍不该继续"清"出东西来）。
 *
 * 另有一条**诚实性**要求（t6）：旧数据没有物化清单时只能兜底匹配，
 * 回执必须如实说自己是猜的，并逐条给出跳过原因。
 *
 * ⚠️ 夹具一律用**内存对象**，不碰真实工作区（本需求的事故教训之一：
 * 测试把文件写进了真实仓库）。
 */
import { describe, it, expect } from 'vitest'
import { executeRollbackCleanup, currentRollbackSeq } from '../src/application/use-cases/RollbackCleanup.js'
import { applyRequirementRollback, recordRollbackMaterialized } from '../src/application/internal/rollback.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

let seq = 0
const task = (over: Partial<TaskRecord>): TaskRecord => ({
  id: 't-' + (++seq),
  requirementId: 'REQ-bfa7',
  title: '卡',
  description: '',
  phase: 'implement',
  side: 'backend',
  dependsOn: [],
  scope: { files: [], anchors: [], chars: 0 } as never,
  acceptance: '跑命令看结果',
  context: '',
  status: 'todo',
  blocked: false,
  executions: [],
  comments: [],
  statusHistory: [],
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: { kind: 'agent' },
  updatedBy: { kind: 'agent' },
  ...over,
} as TaskRecord)

const requirement = (over: Partial<RequirementRecord>): RequirementRecord => ({
  id: 'REQ-bfa7',
  title: '回退膨胀',
  description: '',
  status: 'implementing',
  blocked: false,
  comments: [],
  statusHistory: [],
  artifacts: [],
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: { kind: 'agent' },
  updatedBy: { kind: 'agent' },
  ...over,
} as unknown as RequirementRecord)

/** 内存替身：任务按需求存一份数组，需求存一条记录。不落盘。 */
function harness(req: RequirementRecord, tasks: TaskRecord[]) {
  let requirement_ = structuredClone(req)
  let taskList = structuredClone(tasks)
  const deps = {
    requirementStore: {
      get: async (id: string) => (requirement_.id === id ? structuredClone(requirement_) : undefined),
      mutate: async (_id: string, fn: (draft: RequirementRecord) => unknown) => {
        fn(requirement_)
        return { requirement: requirement_, version: ++requirement_.version, revision: 1, changed: true }
      },
    },
    taskStore: {
      listByRequirement: async (id: string) => taskList.filter((t) => t.requirementId === id).map((t) => structuredClone(t)),
      mutate: async (_id: string, fn: (queueTasks: TaskRecord[]) => TaskRecord[] | undefined) => {
        const out = fn(taskList)
        if (out !== undefined) taskList = out
        return taskList
      },
    },
    now: () => 1000,
    newCommentId: () => 'c-' + (++seq),
  } as never
  return {
    run: (rollbackSeq: number, reason?: string) =>
      executeRollbackCleanup(deps, { id: req.id, rollbackSeq, ...(reason !== undefined ? { reason } : {}) }),
    tasks: () => taskList,
    comments: () => requirement_.comments,
  }
}

describe('批量清理：精确匹配 + 幂等（t3 / FR-4）', () => {
  it('批量清理：按物化清单一次清掉，且再清一次 canceled === 0', async () => {
    // 一次回退的形状：两张原父卡被取消，两张重做卡被物化（顶层、无 parentId）。
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 3, lastMaterialized: ['rw-1', 'rw-2'] },
    })
    const tasks = [
      task({ id: 'p1', status: 'canceled' }),
      task({ id: 'p2', status: 'canceled' }),
      task({ id: 'rw-1', title: '[重做] 卡一', reworkOf: 'p1', status: 'todo' }),
      task({ id: 'rw-2', title: '[重做] 卡二', reworkOf: 'p2', status: 'todo' }),
    ]
    const h = harness(req, tasks)

    const first = await h.run(3, '范围选错了')
    expect(first.matchedBy, '有物化清单时必须走精确匹配').toBe('lastMaterialized')
    expect(first.canceled, '两张物化卡都该被取消').toBe(2)
    expect(h.tasks().filter((t) => t.status === 'canceled').map((t) => t.id).sort()).toEqual(['p1', 'p2', 'rw-1', 'rw-2'])

    // 幂等：清第二遍，一张都不该再"清"出来
    const second = await h.run(3)
    expect(second.canceled, '第二次清场必须 canceled === 0（幂等）').toBe(0)
    // 留痕不该重复刷：只有第一次那条
    expect(h.comments().filter((c) => c.body.startsWith('[清场]')).length).toBe(2)
  })

  it('不碰 done 卡：清单里混进一张已完成的重做卡 → 跳过并说明原因', async () => {
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1, lastMaterialized: ['rw-live', 'rw-done'] },
    })
    const tasks = [
      task({ id: 'rw-live', title: '[重做] 未完成', reworkOf: 'p1', status: 'in_progress' }),
      task({ id: 'rw-done', title: '[重做] 已完成', reworkOf: 'p2', status: 'done' }),
    ]
    const h = harness(req, tasks)
    const out = await h.run(1)

    expect(out.canceled, '只有未完成那张该被取消').toBe(1)
    expect(h.tasks().find((t) => t.id === 'rw-done')?.status, 'done 卡一个字都不许动').toBe('done')
    expect(out.skipped.some((s) => s.taskId === 'rw-done' && s.reason.includes('done'))).toBe(true)
  })

  it('序号对不上即拒绝：清一个不存在的批次 → REQBOARD_UNKNOWN_ROLLBACK_SEQ', async () => {
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 2, lastMaterialized: ['rw-1'] },
    })
    const h = harness(req, [task({ id: 'rw-1', title: '[重做] 卡', reworkOf: 'p1' })])
    let code = ''
    try {
      await h.run(9)
    } catch (e) {
      code = String((e as { code?: string }).code)
    }
    expect(code, '清错批比不清更糟，必须拒绝').toBe('REQBOARD_UNKNOWN_ROLLBACK_SEQ')
    expect(h.tasks()[0]?.status, '拒绝时队列零变化').toBe('todo')
  })

  it('从未回退过的需求：序号 1 也拒绝（没有批次可清）', async () => {
    const h = harness(requirement({}), [task({ id: 'rw-1', title: '[重做] 卡', reworkOf: 'p1' })])
    let code = ''
    try {
      await h.run(1)
    } catch (e) {
      code = String((e as { code?: string }).code)
    }
    expect(code).toBe('REQBOARD_UNKNOWN_ROLLBACK_SEQ')
    expect(currentRollbackSeq({ rollback: undefined })).toBe(0)
  })
})

describe('批量清理：老数据兜底与回执诚实性（t6 / FR-3）', () => {
  it('无物化清单的旧卡 → 兜底匹配，回执如实说明 matchedBy 与跳过原因', async () => {
    // 旧数据形状：需求上没有任何 rollback 字段消费物化清单（这里用有 seq 但没有 lastMaterialized 表达）
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1 },
    })
    const tasks = [
      // 旧卡：有 reworkOf + 标题前缀 → 兜底能匹配
      task({ id: 'old-1', title: '[重做] 旧卡一', reworkOf: 'p1', status: 'todo' }),
      task({ id: 'old-2', title: '[重做] 旧卡二', reworkOf: 'p2', status: 'todo' }),
      // 有 reworkOf 但标题没有前缀 → 兜底不认（宁可漏，不可错杀）
      task({ id: 'no-prefix', title: '卡三', reworkOf: 'p3', status: 'todo' }),
      // 普通卡 → 不该被碰
      task({ id: 'plain', title: '普通卡', status: 'todo' }),
    ]
    const h = harness(req, tasks)
    const out = await h.run(1)

    expect(out.matchedBy, '没有清单就必须承认是兜底匹配，不许假装精确').toBe('reworkOf+title-prefix')
    expect(out.canceled, '只认「有 reworkOf + 带标题前缀」的两张').toBe(2)
    expect(out.note, '回执要把「可能多算或少算」说出来').toContain('兜底')
    expect(h.tasks().find((t) => t.id === 'plain')?.status, '普通卡不该被兜底误伤').toBe('todo')
    expect(h.tasks().find((t) => t.id === 'no-prefix')?.status, '无前缀的卡兜底不认').toBe('todo')
  })

  it('存量形状（rollback 只有 from/to/at/by，无 seq）：序号按 1 计，且走兜底匹配', async () => {
    // 实测：本仓现存 2 条需求的 rollback 就是旧形状（没有 seq / lastMaterialized）。
    // 这条用例钉住「不迁移也能用」——缺 seq 按 1 计，缺清单走兜底。
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'human' } },
    })
    const tasks = [task({ id: 'old-rw', title: '[重做] 旧卡', reworkOf: 'p1', status: 'todo' })]
    expect(currentRollbackSeq({ rollback: req.rollback }), '缺 seq 视为第 1 次').toBe(1)

    const h = harness(req, tasks)
    const out = await h.run(1)
    expect(out.matchedBy).toBe('reworkOf+title-prefix')
    expect(out.canceled, '旧形状的卡也要能清掉，否则它就永远埋在队列里').toBe(1)

    // 关键：没有记过序号 ≠ 序号校验可以挡住它。否则 t6 的兜底路径永远走不到（旧卡永远清不掉）。
    const out2 = await h.run(7)
    expect(out2.canceled, '未记过序号的记录不带批次歧义，不该按序号拒绝').toBe(0)
  })

  it('无 reworkOf 的卡：无法定位原卡 → 仍取消，但列入 skipped 并说明原因', async () => {
    // 清单里有它（所以确实是这次物化出来的卡，该取消），但它没有 reworkOf → 定位不到原卡，
    // 无法判定父子关系该不该还原。诚实做法：取消（清场目的达成）+ 如实报告还原不了。
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1, lastMaterialized: ['orphan'] },
    })
    const h = harness(req, [task({ id: 'orphan', title: '[重做] 无来源', status: 'todo' })])
    const out = await h.run(1)
    expect(out.canceled, '清单点名的卡该被取消').toBe(1)
    expect(out.restoredLinks).toBe(0)
    expect(out.skipped.some((s) => s.taskId === 'orphan' && s.reason.includes('reworkOf')), '必须说明为何没还原').toBe(true)
  })
})

describe('批量清理：父子关系还原（t3 / FR-4）', () => {
  it('被误物化成顶层卡的旧子卡：按原卡的 parentId 挂回原父卡', async () => {
    // 旧数据的形状：子卡被升格成顶层（丢了 parentId），它的原卡（p-sub）当年挂在 p-root 下。
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1, lastMaterialized: ['rw-sub'] },
    })
    const tasks = [
      task({ id: 'p-root', title: '父卡', status: 'canceled' }),
      task({ id: 'p-sub', title: '父卡·研发', parentId: 'p-root', stageKind: 'dev', status: 'canceled' }),
      task({ id: 'rw-sub', title: '[重做] 父卡·研发', reworkOf: 'p-sub', status: 'todo' }),
    ]
    const h = harness(req, tasks)
    const out = await h.run(1)

    expect(out.restoredLinks, '这条还原正是「清场」区别于「只取消」的地方').toBe(1)
    expect(h.tasks().find((t) => t.id === 'rw-sub')?.parentId).toBe('p-root')
  })

  it('重做卡本来就该留在顶层（原卡是顶层父卡）→ 不硬编一个父卡出来', async () => {
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1, lastMaterialized: ['rw-top'] },
    })
    const tasks = [
      task({ id: 'p-top', title: '顶层父卡', status: 'canceled' }),
      task({ id: 'rw-top', title: '[重做] 顶层父卡', reworkOf: 'p-top', status: 'todo' }),
    ]
    const h = harness(req, tasks)
    const out = await h.run(1)
    expect(out.restoredLinks).toBe(0)
    expect(h.tasks().find((t) => t.id === 'rw-top')?.parentId, '不该凭空长出一个父卡').toBeUndefined()
    expect(out.skipped.some((s) => s.taskId === 'rw-top')).toBe(true)
  })
})

describe('批量清理：与回退的物化清单对齐（t3 端到端）', () => {
  it('一次回退 → 记录物化清单 → 清场只清这批（且第二次回退后清单不被清空）', async () => {
    const req = requirement({})
    const tasks = [
      task({ id: 'p1', title: '父卡一', status: 'done' }),
      task({ id: 'p2', title: '父卡二', status: 'done' }),
      task({ id: 'p1-s0', title: '父卡一·研发', parentId: 'p1', stageKind: 'dev', status: 'done' }),
    ]
    // 走真实编排：先算卡计划算出将要物化的卡 id，再把它记进台账
    // （与两条回退路径同款调用顺序：applyRequirementRollback → recordRollbackMaterialized）。
    let minted = 0
    const pre = applyRequirementRollback(
      structuredClone(req), tasks, 'implementing', 'design', 1000,
      { kind: 'agent' } as never,
      { task: () => 'rw-' + (++minted), comment: () => 'c-' + (++minted) } as never,
      '测试回退',
    )
    const draft = structuredClone(req)
    applyRequirementRollback(
      draft, tasks, 'implementing', 'design', 1000,
      { kind: 'agent' } as never,
      { task: () => 'rw-' + (++minted), comment: () => 'c-' + (++minted) } as never,
      '测试回退',
    )
    recordRollbackMaterialized(draft, 1000, pre.taskPlan.reworkDrafts.map((t) => t.id))
    expect(draft.rollback?.seq, '首次回退记作第 1 次').toBe(1)
    const manifest = draft.rollback?.lastMaterialized ?? []
    expect(manifest.length, '两张顶层父卡 → 物化两张').toBe(2)

    // 把物化卡落到内存队列里，再清场
    const queue = [...tasks, ...pre.taskPlan.reworkDrafts]
    const h = harness(draft, queue)
    const out = await h.run(1)
    expect(out.matchedBy).toBe('lastMaterialized')
    expect(out.canceled, '只清这次物化的两张').toBe(2)
    expect(h.tasks().filter((t) => t.status === 'canceled').map((t) => t.id).sort()).toEqual(manifest.slice().sort())
  })

  it('第二次回退物化 0 张时，物化清单保留上一批（否则误物化就再也清不掉了）', () => {
    const draft = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1, lastMaterialized: ['rw-a', 'rw-b'] },
    })
    recordRollbackMaterialized(draft, 2000, [])
    expect(draft.rollback?.seq, '序号仍要 +1（这是第二次回退）').toBe(2)
    expect(draft.rollback?.lastMaterialized, '物化 0 张不得清空清单').toEqual(['rw-a', 'rw-b'])
  })
})

describe('批量清理：跨需求隔离', () => {
  it('只清本需求的卡：别的需求的同形卡一个都不动', async () => {
    const req = requirement({
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1 },
    })
    const tasks = [
      task({ id: 'mine', title: '[重做] 我的卡', reworkOf: 'p1', status: 'todo' }),
      task({ id: 'theirs', title: '[重做] 别人的卡', reworkOf: 'p2', status: 'todo', requirementId: 'REQ-other' }),
    ]
    const h = harness(req, tasks)
    const out = await h.run(1)
    expect(out.canceled).toBe(1)
    expect(h.tasks().find((t) => t.id === 'theirs')?.status, '别的需求的卡不许被本需求清场误伤').toBe('todo')
  })
})
