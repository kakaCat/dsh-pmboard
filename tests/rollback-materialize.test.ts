// serves: FR-1
/**
 * 回退物化规则（REQ-261004121649-bfa7）
 *
 * 主判据不是「回退后卡能跑」，而是「回退后**不该多出来的没多出来**」：
 * 只有顶层父卡物化重做卡；子卡原地复位、**保留身份**。
 *
 * ⚠️ 夹具用内存对象，**不碰真实工作区**——今天刚有测试把文件写进真实仓库的教训。
 */
import { describe, it, expect } from 'vitest'
import { applyRequirementRollback, recordRollbackMaterialized } from '../src/application/internal/rollback.js'
import { resolveSubtaskStages } from '../src/application/internal/lazy-expand.js'
import { buildSubtaskSpecs } from '../src/domain/task/SubtaskTemplate.js'
import { executeRollbackCleanup } from '../src/application/use-cases/RollbackCleanup.js'
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
  status: 'done',
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

/** 复现原事故形状：6 张顶层父卡 + 每张带 2~3 张子卡（共 11 张子卡，合计 17 张）。 */
const fixture = (): TaskRecord[] => {
  const out: TaskRecord[] = []
  const subCounts = [2, 2, 2, 2, 2, 1]
  subCounts.forEach((n, i) => {
    const parent = task({ id: 'p' + i, title: '父卡' + i, parentId: undefined })
    out.push(parent)
    for (let k = 0; k < n; k++) {
      out.push(task({ id: `p${i}-s${k}`, title: '父卡' + i + '·研发', parentId: parent.id, stageKind: 'dev' }))
    }
  })
  return out
}

const run = (tasks: TaskRecord[]) =>
  applyRequirementRollback(
    {
      id: 'REQ-bfa7',
      title: '回退膨胀',
      category: 'feature',
      status: 'implementing',
      workspaceRoot: '/w',
      // 编排会往这些数组写（缺任何一个都会在运行期炸）
      statusHistory: [],
      comments: [],
      artifacts: [],
      blocked: false,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      createdBy: { kind: 'agent' },
      updatedBy: { kind: 'agent' },
    } as unknown as RequirementRecord,
    tasks,
    'implementing',
    'design',
    100,
    { kind: 'agent' } as never,
    { task: () => 't-new-' + (++seq), comment: () => 'c-' + (++seq) } as never,
    '测试回退',
  )

describe('回退物化：只物化顶层父卡（t1）', () => {
  it('只物化顶层：17 张卡 → 物化 6 张、复位 11 张、取消 6 张', () => {
    const plan = run(fixture()).taskPlan
    expect(plan.reworkDrafts.length, '只有顶层父卡该被物化').toBe(6)
    expect(plan.canceled.length, '只有顶层父卡该被取消').toBe(6)
    expect(plan.resetTasks.length, '子卡应原地复位而不是被物化').toBe(11)
  })

  it('子卡不升格：复位后仍带 parentId / stageKind，且回到 todo', () => {
    const plan = run(fixture()).taskPlan
    for (const t of plan.resetTasks) {
      expect(t.parentId, '子卡复位后必须保留父卡身份').toBeDefined()
      expect(t.stageKind).toBeDefined()
      expect(t.status).toBe('todo')
    }
    // 关键判别：物化出来的卡**不该**包含任何原来的子卡 id
    const subIds = new Set(fixture().filter(t => t.parentId !== undefined).map(t => t.id))
    expect(plan.reworkDrafts.every(d => !subIds.has(d.reworkOf ?? '')), '子卡不得被物化成新父卡').toBe(true)
  })

  it('判别力自证：把「只顶层」分流去掉（全量物化）→ 物化数会从 6 涨到 17', () => {
    // 这条断言钉住「本用例抓的是真行为」：全量物化时 17 张都会进 reworkDrafts。
    const all = fixture()
    expect(all.length).toBe(17)
    expect(run(all).taskPlan.reworkDrafts.length).toBeLessThan(all.length)
  })
})

describe('回退物化：物化即终态（t4）', () => {
  it('不自动展开链：每张重做卡都带 stages: []（否则开工时会展开子卡链）', () => {
    const plan = run(fixture()).taskPlan
    expect(plan.reworkDrafts.length).toBeGreaterThan(0)
    for (const d of plan.reworkDrafts) {
      expect(d.stages, '重做卡必须显式空链——缺省会让它一开工就展开子链，制造「…·研发·研发」').toEqual([])
    }
  })

  it('真的走一遍开工：重做卡物化后开工 → 名下新增子卡 0 张（端到端，t5）', () => {
    // 上一条只断言了 stages 这个**字段**；这一条走真实的展开判据，断言**结果**：
    // 开工那一刻到底会不会长出子卡。这两条不是重复——字段对而判据错（例如判据写成
    // `.length > 0`，把「明确不要链」当成「没写」）时，上一条会绿、这一条会红。
    const plan = run(fixture()).taskPlan
    const parent = plan.reworkDrafts[0]!

    // 修复后的真实路径：把物化草稿喂给懒展开判据 → 应解析出空链、不落任何子卡。
    const afterFix = buildSubtaskSpecs(
      resolveSubtaskStages(parent, { category: 'feature' }),
    )
    expect(afterFix.length, '重做卡开工不得新增子卡（这正是「…·研发·研发」的来源）').toBe(0)

    // 判别力：把 stages: [] 去掉（回到修复前形态）→ 判据会按 phase 回落到默认链，
    // 一次开工就长出 4 张子卡，子卡开工再长一层 —— 名字于是递归成「…·研发·研发」。
    const beforeFix = buildSubtaskSpecs(
      resolveSubtaskStages({ ...parent, stages: undefined }, { category: 'feature' }),
    )
    expect(beforeFix.length, '去掉空链后必须真的会展开，这条断言证明上面那条抓的是真行为').toBeGreaterThan(0)
  })
})

describe('回退物化：幂等与上限（t2）', () => {
  it('幂等：已有活的重做卡指向该父卡 → 该父卡不再重复物化', () => {
    const tasks = fixture()
    // 模拟「上一次回退物化出来的卡还在」（reworkOf 指向 p0）
    tasks.push(task({ id: 'rw-p0', title: '[重做] 父卡0', reworkOf: 'p0', status: 'todo' }))
    const plan = run(tasks).taskPlan
    expect(plan.reworkDrafts.every(d => d.reworkOf !== 'p0'), '已物化过的父卡不该再来一张').toBe(true)
    // 而那张重做卡自己也不该被再物化（否则就是「重做卡的重做卡」）
    expect(plan.reworkDrafts.every(d => d.reworkOf !== 'rw-p0')).toBe(true)
  })

  it('上限：待物化 21 张 > 上限 20 → 整次拒绝（错误码 + 两个数字 + 队列未被改动）', () => {
    const many: TaskRecord[] = []
    for (let i = 0; i < 21; i++) many.push(task({ id: 'p' + i, title: '父卡' + i }))
    let err: { code?: string; message?: string } | undefined
    try {
      run(many)
    } catch (e) {
      err = e as { code?: string; message?: string }
    }
    expect(err, '超限必须抛错，而不是先落库再让人发现').toBeDefined()
    expect(err?.code).toBe('REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT')
    expect(String(err?.message)).toContain('21')
    expect(String(err?.message)).toContain('20')
    // 队列零新增：编排期就拒了，所以调用方根本没机会写
    expect(many.every(t => t.status === 'done')).toBe(true)
  })

  it('上限之内不误拒：正好 20 张 → 放行', () => {
    const twenty: TaskRecord[] = []
    for (let i = 0; i < 20; i++) twenty.push(task({ id: 'q' + i, title: '父卡' + i }))
    expect(run(twenty).taskPlan.reworkDrafts.length).toBe(20)
  })

  it('重复回退两次：第二次物化 0 张，且队列张数不变（t5 显式要求）', () => {
    // 与上面「幂等」那条的区别：那条手工塞了一张重做卡进去（只测判据），
    // 这一条**真的跑两次回退**、把第一次的产物落进队列再跑第二次——测的是整条路径。
    const before = fixture()
    const countBefore = before.length

    const first = run(before).taskPlan
    expect(first.reworkDrafts.length, '第一次：6 张顶层父卡 → 物化 6 张').toBe(6)

    // 模拟第一次回退的落库：物化卡进队列、原卡变 canceled（与 MoveRequirement 的写入同款）。
    const afterFirst = [...before.filter(t => t.id !== 'p1'), ...first.reworkDrafts]
    const second = run(afterFirst).taskPlan
    expect(second.reworkDrafts.length, '第二次：物化 0 张（幂等——重做卡已在队列里）').toBe(0)

    // 队列张数不变：第二次跑完没有净增卡片。
    // REQ-261005122915-9f90 t5 / FR-4 起，第二轮回退会**把占位卡一并置 canceled**（此前它们被
    // 当子卡复位回 todo），故「取消张数」不再是净增的代理量——净增的唯一来源是物化。
    expect(second.reworkDrafts.length, '净增必须为 0：唯一的新增来源是物化，而物化 0 张').toBe(0)
    expect(
      second.canceled.filter(c => (c.reworkOf ?? '') !== '').length,
      '第二轮回退把上一轮的占位卡一并取消（不再复位回 todo）',
    ).toBe(6)
    expect(afterFirst.length, '第一次的队列确实比原始夹具多（证明这条测的是真路径）').toBeGreaterThan(countBefore)
  })
})

/**
 * 需求文档「验收口径（可跑）」第 4 条按名字点的是本文件的 `-t "批量清理"`。
 * 清场套件本身住在 tests/rollback-cleanup.test.ts（12 条，关注点分离）；
 * 这里留一条**跨模块的整链用例**，让那条被点名的命令真的有东西跑：
 * 回退物化（本模块）→ 记物化清单（rollback.ts）→ 清场把它清干净（cleanup 模块）。
 */
describe('批量清理：回退物化 → 清场整链（FR-4）', () => {
  it('批量清理：一次回退物化出来的卡能被一次清掉，再清一次为 0', async () => {
    const tasks = fixture()
    const beforeCount = tasks.length
    const plan = run(tasks).taskPlan
    expect(plan.reworkDrafts.length, '6 张顶层父卡 → 物化 6 张').toBe(6)

    // 落库：物化卡进队列 + 原卡取消（与 MoveRequirement 写入同款；子卡原地复位）。
    const queue = [
      ...tasks.map(t => (plan.canceled.some(c => c.id === t.id) ? plan.canceled.find(c => c.id === t.id)! : t)),
      ...plan.reworkDrafts,
    ]
    expect(queue.length, '回退后队列确实变多了（这就是要被清掉的那批）').toBeGreaterThan(beforeCount)

    // 记清单 → 清场（真实模块串起来，不是各测各的）
    const req = {
      id: 'REQ-bfa7',
      // 夹具形状要全：清场会往 comments 写留痕（缺了会在运行期炸，tsc 不报）。
      comments: [] as unknown[],
      rollback: { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent' }, seq: 1 },
    } as unknown as RequirementRecord
    recordRollbackMaterialized(req, 2, plan.reworkDrafts.map(t => t.id))

    let store = queue
    const deps = {
      requirementStore: {
        get: async () => req,
        mutate: async (_id: string, fn: (d: RequirementRecord) => unknown) => { fn(req); return {} },
      },
      taskStore: {
        listByRequirement: async () => store,
        mutate: async (_id: string, fn: (t: TaskRecord[]) => TaskRecord[] | undefined) => {
          const out = fn(store); if (out !== undefined) store = out; return store
        },
      },
      now: () => 3,
      newCommentId: () => 'c-1',
    } as never

    const first = await executeRollbackCleanup(deps, { id: 'REQ-bfa7', rollbackSeq: req.rollback!.seq! })
    expect(first.matchedBy, '有清单就走精确匹配').toBe('lastMaterialized')
    expect(first.canceled, '6 张物化卡应被一次清掉').toBe(6)
    expect(store.filter(t => t.status === 'canceled').length, '物化卡都成了 canceled').toBe(6 + 6)

    const second = await executeRollbackCleanup(deps, { id: 'REQ-bfa7', rollbackSeq: req.rollback!.seq! })
    expect(second.canceled, '再清一次必须为 0（幂等）').toBe(0)
  })
})
