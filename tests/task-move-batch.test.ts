/**
 * reqboard_task_move 批量推进（REQ-261007100513-6749 t4 / serves: FR-4, FR-5）。
 *
 * 本卡要钉死的行为（逐条对应验收标准）：
 *  ① 3 张合法子卡一次推进 → results 3 条 ok=true，且回执含 tree（父卡 + 链序子卡，一层）；
 *  ② 混合批（2 合法 + 1 非法边）→ 2 张落账、1 张 `code=invalid_transition`，**台账无回滚**；
 *  ③ 同一张卡在批内重复出现 → 该项被拒并给原因（批内一项一卡）；
 *  ④ 批量落笔 = **一次**队列写（writeSeq 只 +1）——"一次 mutateQueue 落全部合法项"的可观测形式；
 *  ⑤ 旧单卡 `{task_id,to}` 的回执键集合与改造前一致（旧 11 键里该出现的那几个，一个新键都不多）；
 *  ⑥ 契约类型：`TaskMoveOutput` 的旧 11 键与 7 个新键**并存且键名逐字固定**（t5 加 budget 时不许漂移）。
 */
import { describe, expect, it } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { defineTaskMoveTool } from '../src/tools/index.js'
import type { TaskMoveOutput } from '../src/application/use-cases/MoveTask.js'
import type { TaskRecord } from '../src/shared/protocol.js'
import { expectCode } from './helpers/code-assert.js'

const W = 'session-w-001'
const REQ = 'REQ-000001'
const run = (t: unknown, args: unknown): Promise<Record<string, any>> =>
  (t as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

/** 旧 11 键（**逐字**，design/interfaces.md §TaskMoveOutput）。 */
const OLD_KEYS: readonly (keyof TaskMoveOutput)[] = [
  'success', 'task_id', 'from', 'to', 'status', 'version', 'subtasks_created', 'task_card', 'acceptance', 'error', 'code',
]
/** 新 7 键（**逐字**；`budget` 由 t5 落地，本卡先把键名钉住）。 */
const NEW_KEYS: readonly (keyof TaskMoveOutput)[] = [
  'results', 'partial', 'tree', 'tree_note', 'throttleRemainingMs', 'guidance', 'budget',
]

/** 存量卡（legacy）：in_review 且已汇报（done 凭证门的①②两项靠它过）。 */
function reviewCard(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    status: 'in_review',
    createdAt: 1,
    lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['完成 ' + id] },
    ...over,
  })
}

/** 子卡（写入族 dev）：lastRun 成功 + 汇报里给出真实新鲜的文件。 */
function devSubtask(id: string, parentId: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    parentId,
    stageKind: 'dev' as never,
    status: 'in_progress',
    createdAt: 1,
    lastRun: { at: 2, ok: true, stopReason: 'completed', valueNonEmpty: true },
    lastReport: { at: 2, reportIndex: 1, filesChanged: ['docs/req/a.md'], completed: ['做了 ' + id] },
    ...over,
  })
}

/** 夹具：父卡 + 3 张子卡（+ 一张停留 todo 的卡，避免整需求被 rollup 推到验收）。 */
function seedSubtasks() {
  const h = makeHarness({
    tasks: [
      task({ id: 't-p', requirementId: REQ, status: 'in_progress', createdAt: 1 }),
      devSubtask('t-s1', 't-p'),
      devSubtask('t-s2', 't-p'),
      devSubtask('t-s3', 't-p'),
      task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 }),
    ],
  })
  h.seedRequirementSync(req({ status: 'implementing' }))
  h.docs.put('docs/req/a.md')
  return h
}

describe('reqboard_task_move 批量（FR-4）', () => {
  it('3 张合法子卡一次推进 → results 3 条 ok=true，回执含 tree（一层：父卡 + 链序子卡）', async () => {
    const h = seedSubtasks()
    await h.seedSettled()
    const t = defineTaskMoveTool(h.deps)
    const before = h.queueRevisionOf(REQ)

    const out = await run(t, {
      tasks: [
        { task_id: 't-s1', to: 'done', reason: '三段全过，汇报在账' },
        { task_id: 't-s2', to: 'done', reason: '三段全过，汇报在账' },
        { task_id: 't-s3', to: 'done', reason: '三段全过，汇报在账' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.success).toBe(true)
    expect(out.partial).toBeUndefined()
    expect(out.results).toHaveLength(3)
    expect(out.results?.map(r => [r.task_id, r.ok])).toEqual([['t-s1', true], ['t-s2', true], ['t-s3', true]])
    for (const r of out.results ?? []) {
      expect(r.to).toBe('done')
      expect(r.status).toBe('done')
      expect(r.from).toBe('in_progress')
      expect(r.code).toBeUndefined()
    }
    // 树摘要：父卡 + 其子卡（一层），节点复用 TaskTreeNodeView 的字段
    expect(out.tree?.parents).toHaveLength(1)
    const root = out.tree?.parents[0]
    expect(root?.parent.id).toBe('t-p')
    expect(root?.parent.role).toBe('parent')
    expect(root?.subtasks.map(s => s.id)).toEqual(['t-s1', 't-s2', 't-s3'])
    expect(root?.subtasks.every(s => s.status === 'done')).toBe(true)
    expect(root?.note).toContain('子卡链 3 张')
    expect(out.tree_note).toBeUndefined()
    // 落账事实：3 张全 done
    const after = await h.tasksOf(REQ)
    expect(after.filter(x => x.status === 'done').map(x => x.id).sort()).toEqual(['t-s1', 't-s2', 't-s3'])
    // 一次调用 = **一次**队列写（"一次 mutateQueue 落全部合法项"的可观测形式）
    expect(h.queueRevisionOf(REQ) - before).toBe(1)
  })

  it('混合批（2 合法 + 1 非法边）→ 2 张落账、1 张 invalid_transition、partial=true、台账无回滚', async () => {
    const h = makeHarness({
      tasks: [
        reviewCard('t-a1'),
        reviewCard('t-a2'),
        reviewCard('t-a3'),
        task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 }),
      ],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const before = h.queueRevisionOf(REQ)

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-a1', to: 'done' },
        { task_id: 't-a2', to: 'done' },
        // in_review→testing 在存量卡表里不是合法边（该角色的合法边只有 done / in_progress / canceled）
        { task_id: 't-a3', to: 'testing' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.success).toBe(true)
    expect(out.partial).toBe(true)
    expect(out.results?.map(r => r.ok)).toEqual([true, true, false])
    expect(out.results?.[2]?.code).toBe('invalid_transition')
    expect(String(out.results?.[2]?.error)).toContain('合法边')
    // 无回滚：合法项真的落账，非法项原样留在原位
    const after = await h.tasksOf(REQ)
    const byId = new Map(after.map(x => [x.id, x.status]))
    expect(byId.get('t-a1')).toBe('done')
    expect(byId.get('t-a2')).toBe('done')
    expect(byId.get('t-a3')).toBe('in_review')
    // 一次写（好项与坏项在同一次 mutate 里，坏项不触发回滚）
    expect(h.queueRevisionOf(REQ) - before).toBe(1)
  })

  it('同一张卡在批内重复出现 → 该项被拒并给原因（批内一项一卡）', async () => {
    const h = makeHarness({
      tasks: [reviewCard('t-a1'), task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 })],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-a1', to: 'done' },
        { task_id: 't-a1', to: 'in_progress' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.results?.[0]?.ok).toBe(true)
    expect(out.results?.[1]?.ok).toBe(false)
    expect(out.results?.[1]?.code).toBe('REQBOARD_INVALID_INPUT')
    expect(String(out.results?.[1]?.error)).toContain('同批中出现多次')
    expect((await h.tasksOf(REQ)).find(x => x.id === 't-a1')?.status).toBe('done')
  })

  it('坏容器（空数组 / 超 20 项）→ REQBOARD_INVALID_INPUT（不静默当成功、不逐项猜）', async () => {
    const h = makeHarness({ tasks: [reviewCard('t-a1')] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const t = defineTaskMoveTool(h.deps)

    const empty = await run(t, { tasks: [] })
    expect(empty.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（空数组容器 = REQBOARD_INVALID_INPUT）
    expectCode(empty, 'REQBOARD_INVALID_INPUT')
    expect(empty.code).toBe('REQBOARD_INVALID_INPUT')

    const many = await run(t, { tasks: Array.from({ length: 21 }, () => ({ task_id: 't-a1', to: 'done' })) })
    expect(many.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（超 20 项 = REQBOARD_INVALID_INPUT）
    expectCode(many, 'REQBOARD_INVALID_INPUT')
    expect(many.code).toBe('REQBOARD_INVALID_INPUT')
    expect(String(many.error)).toContain('20')
  })

  it('树摘要不可得时发 tree_note（不静默省略；落账事实不受影响）', async () => {
    const h = makeHarness({
      tasks: [reviewCard('t-a1'), task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 })],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    // 注入：门禁跑在落笔回调的新鲜快照上（不走 listByRequirement），故第 1 次是 rollup 后的重读、
    // 第 2 次就是**回执的树摘要读**——让它抛，考察 tree_note 分支。
    const store = h.deps.taskStore as unknown as { listByRequirement: (id: string) => Promise<readonly TaskRecord[]> }
    const original = store.listByRequirement.bind(store)
    let calls = 0
    store.listByRequirement = async (id: string) => {
      calls += 1
      if (calls >= 2) throw new Error('注入：任务快照不可用')
      return original(id)
    }

    const out = await run(defineTaskMoveTool(h.deps), { tasks: [{ task_id: 't-a1', to: 'done' }] }) as unknown as TaskMoveOutput
    store.listByRequirement = original   // 注入只服务本次调用（后面的断言要读真快照）

    expect(out.success).toBe(true)
    expect(out.results?.[0]?.ok).toBe(true)
    expect(out.tree).toBeUndefined()
    expect(String(out.tree_note)).toContain('任务快照不可用')
    expect((await h.tasksOf(REQ)).find(x => x.id === 't-a1')?.status).toBe('done')
  })
})

describe('批量推进：组粒度 / 跨需求 / 门禁不被放宽（返工项 R5 / R6 / R8）', () => {
  it('R6 跨需求批量：两处 writeSeq 各 +1、results 保序、tree 含两根', async () => {
    const req2 = 'REQ-000002'
    const h = makeHarness({
      requirements: [req({ id: REQ, status: 'implementing' }), req({ id: req2, status: 'implementing' })],
      tasks: [
        task({ id: 't-p1', requirementId: REQ, status: 'in_progress', createdAt: 1 }),
        devSubtask('t-s1', 't-p1'),
        task({ id: 't-p2', requirementId: req2, status: 'in_progress', createdAt: 1 }),
        task({
          id: 't-s2', requirementId: req2, parentId: 't-p2', stageKind: 'dev' as never, status: 'in_progress', createdAt: 1,
          lastRun: { at: 2, ok: true, stopReason: 'completed', valueNonEmpty: true },
          lastReport: { at: 2, reportIndex: 1, filesChanged: ['docs/req/a.md'], completed: ['做了 t-s2'] },
        }),
      ],
    })
    h.docs.put('docs/req/a.md')
    await h.seedSettled()
    const before1 = h.queueRevisionOf(REQ)
    const before2 = h.queueRevisionOf(req2)

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-s1', to: 'done' },
        { task_id: 't-s2', to: 'done' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.success).toBe(true)
    expect(out.results?.map(r => [r.task_id, r.ok])).toEqual([['t-s1', true], ['t-s2', true]])
    // 每个需求各一次原子写（跨需求无法合并成一次文件写——分组是唯一如实的做法）
    expect(h.queueRevisionOf(REQ) - before1).toBe(1)
    expect(h.queueRevisionOf(req2) - before2).toBe(1)
    // 树含两根（各自父卡 + 其子卡），顺序 = 入参顺序
    expect(out.tree?.parents.map(p => p.parent.id)).toEqual(['t-p1', 't-p2'])
    expect(out.tree?.parents.map(p => p.subtasks.map(s => s.id))).toEqual([['t-s1'], ['t-s2']])
  })

  it('R5 组粒度写盘失败：失败组逐项点名（ok=false + 真实码），已落账组照常 ok=true', async () => {
    const req2 = 'REQ-000002'
    const h = makeHarness({
      requirements: [req({ id: REQ, status: 'implementing' }), req({ id: req2, status: 'implementing' })],
      tasks: [
        reviewCard('t-a1'),
        task({ id: 't-b1', requirementId: req2, status: 'in_review', createdAt: 1, lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['完成 b1'] } }),
      ],
    })
    await h.seedSettled()
    // 注入：只让**第二个需求**的落笔那次 mutate 失败（回调返回 tasks = 落笔；预检不读任务集）
    const store = h.deps.taskStore as unknown as {
      mutate: (id: string, fn: (t: unknown[], c: unknown) => unknown) => Promise<unknown>
    }
    const original = store.mutate.bind(store)
    store.mutate = async (id: string, fn: (t: unknown[], c: unknown) => unknown) => {
      if (id !== req2) return original(id, fn)
      return original(id, (tasks, ctx) => {
        const out = fn(tasks, ctx)
        if (out !== undefined) throw Object.assign(new Error('注入：该需求的队列写入失败'), { code: 'QUEUE_VALIDATION_FAILED' })
        return out
      })
    }

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-a1', to: 'done' },
        { task_id: 't-b1', to: 'done' },
      ],
    }) as unknown as TaskMoveOutput
    store.mutate = original

    expect(out.success).toBe(true)
    expect(out.partial).toBe(true)
    expect(out.results?.map(r => r.ok)).toEqual([true, false])
    expect(out.results?.[0]?.task_id).toBe('t-a1')
    expect(out.results?.[1]?.task_id).toBe('t-b1')
    expect(out.results?.[1]?.code).toBe('QUEUE_VALIDATION_FAILED')
    expect(String(out.results?.[1]?.error)).toContain('注入')
    // 已落账组不受影响；失败组零副作用
    const after1 = await h.tasksOf(REQ)
    const after2 = await h.tasksOf(req2)
    expect(after1.find(x => x.id === 't-a1')?.status).toBe('done')
    expect(after2.find(x => x.id === 't-b1')?.status).toBe('in_review')
  })

  it('R8① 父+子同批收尾：父卡必被 REQBOARD_SUBTASK_GATE 拒（保守；子卡照落）', async () => {
    const h = seedSubtasks()
    await h.seedSettled()
    // 父卡也进 in_progress，让它可以尝试收尾
    await h.setTaskFields('t-p', { status: 'in_progress' })

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-s1', to: 'done' },
        { task_id: 't-p', to: 'done' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.results?.[0]?.ok).toBe(true)
    expect(out.results?.[1]?.ok).toBe(false)
    expect(out.results?.[1]?.code).toBe('REQBOARD_SUBTASK_GATE')
    expect(String(out.results?.[1]?.error)).toContain('子卡')
    // 同批判定认的是**写前快照**：子卡这一轮刚 done，父卡仍然看不到（保守，符合 I-1 的异常情况表）
    expect((await h.tasksOf(REQ)).find(x => x.id === 't-p')?.status).toBe('in_progress')
  })

  it('R8② tasks 与扁平四参同传 → 以 tasks 为准（扁平项一个字都不动）', async () => {
    const h = makeHarness({
      tasks: [reviewCard('t-a1'), reviewCard('t-a2')],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      task_id: 't-a1',
      to: 'canceled',                       // 扁平项本身是人工闸门（若被采纳会抛 HUMAN_GATE）
      acceptance: '命令：node_modules/.bin/vitest run tests/a.test.ts → 看到 1 passed',
      tasks: [{ task_id: 't-a2', to: 'done' }],
    }) as unknown as TaskMoveOutput

    expect(out.success).toBe(true)
    expect(out.results?.map(r => [r.task_id, r.ok])).toEqual([['t-a2', true]])
    const after = await h.tasksOf(REQ)
    const a1 = after.find(x => x.id === 't-a1')
    expect(a1?.status).toBe('in_review')                                  // 扁平 to 未生效
    expect(a1?.acceptance).not.toContain('vitest run tests/a.test.ts')    // 扁平 acceptance 亦让位（设计无 note 键，不外发说明）
    expect(after.find(x => x.id === 't-a2')?.status).toBe('done')
  })

  it('R8③ 批内 acceptance-only 项可单独落账（改验收标准但不改状态）', async () => {
    const h = makeHarness({ tasks: [reviewCard('t-a1'), reviewCard('t-a2')] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const next = '命令：node_modules/.bin/vitest run tests/a.test.ts → 看到 1 passed'

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-a1', acceptance: next },
        { task_id: 't-a2', to: 'done' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.results?.map(r => r.ok)).toEqual([true, true])
    const after = await h.tasksOf(REQ)
    expect(after.find(x => x.id === 't-a1')?.acceptance).toBe(next)
    expect(after.find(x => x.id === 't-a1')?.status).toBe('in_review')
    expect(after.find(x => x.id === 't-a2')?.status).toBe('done')
  })

  it('R8④ 9 张父卡在跑 + 2 张新开 → 只放行 1 张（批内叠加，上限未被放宽）', async () => {
    const running = Array.from({ length: 9 }, (_, i) =>
      task({ id: 't-run' + i, requirementId: REQ, status: 'in_progress', createdAt: 1 }))
    const h = makeHarness({
      tasks: [
        ...running,
        task({ id: 't-new1', requirementId: REQ, status: 'todo', createdAt: 1 }),
        task({ id: 't-new2', requirementId: REQ, status: 'todo', createdAt: 1 }),
      ],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-new1', to: 'in_progress' },
        { task_id: 't-new2', to: 'in_progress' },
      ],
    }) as unknown as TaskMoveOutput

    expect(out.results?.[0]?.ok).toBe(true)
    expect(out.results?.[1]?.ok).toBe(false)
    expect(out.results?.[1]?.code).toBe('REQBOARD_PARENT_LIMIT')
    const after = await h.tasksOf(REQ)
    expect(after.filter(x => x.status === 'in_progress')).toHaveLength(10)
  })
})

describe('旧单卡路径逐字保留（兼容）', () => {
  it('{task_id,to} 的回执键集合与改造前一致：旧键里该出现的几个，一个新键都不多', async () => {
    const h = makeHarness({ tasks: [reviewCard('t-a1')] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), { task_id: 't-a1', to: 'done' })
    expect(Object.keys(out).sort()).toEqual(['from', 'status', 'success', 'task_id', 'to', 'version'].sort())
    for (const k of Object.keys(out)) expect(OLD_KEYS).toContain(k as keyof TaskMoveOutput)
    // 新键一个都不出现（单卡路径不是批量：results/tree/guidance 都不该被塞进来）
    for (const k of NEW_KEYS) expect(out[k]).toBeUndefined()
  })

  it('开工（todo→in_progress）仍返回 task_card 全文（改造前语义不动）', async () => {
    const h = makeHarness({ tasks: [task({ id: 't-a1', requirementId: REQ, status: 'todo', createdAt: 1 })] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), { task_id: 't-a1', to: 'in_progress' })
    expect(out.success).toBe(true)
    expect(out.to).toBe('in_progress')
    expect(out.task_card?.doc_path).toBe('docs/requirements/REQ-000001/tasks/t-a1.md')
    for (const k of Object.keys(out)) expect(OLD_KEYS).toContain(k as keyof TaskMoveOutput)
  })
})

describe('输出契约：新键与旧 11 键并存（t5 加 budget 时不许键名漂移）', () => {
  it('回执键形状逐字固定：results[] / tree（一层）的键名与顺序', async () => {
    const h = seedSubtasks()
    await h.seedSettled()
    const out = await run(defineTaskMoveTool(h.deps), { tasks: [{ task_id: 't-s1', to: 'done' }] }) as unknown as TaskMoveOutput

    // 顶层：success / task_id / results（+ 落账后可选键）
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'results', 'tree'])
    expect(Object.keys(out.results?.[0] ?? {})).toEqual(['task_id', 'ok', 'from', 'to', 'status', 'version'])
    expect(Object.keys(out.tree ?? {})).toEqual(['parents'])
    expect(Object.keys(out.tree?.parents[0] ?? {})).toEqual(['parent', 'subtasks', 'note'])
    // 节点逐字复用 TaskTreeNodeView（**不新造节点结构**）
    expect(Object.keys(out.tree?.parents[0]?.parent ?? {})).toEqual([
      'id', 'title', 'status', 'role', 'dependsOn', 'cardDoc', 'footprintState',
    ])
    expect(Object.keys(out.tree?.parents[0]?.subtasks[0] ?? {})).toEqual([
      'id', 'title', 'status', 'role', 'dependsOn', 'cardDoc', 'footprintState', 'stageKind', 'lastRunOk', 'reportSummary',
    ])
  })

  it('TaskMoveOutput 的 11 + 7 个键逐字固定', () => {
    // 类型层面：能让 tsc 通过就说明这些键都存在于 TaskMoveOutput（改名即编译失败）
    expect(OLD_KEYS).toHaveLength(11)
    expect([...OLD_KEYS]).toEqual([
      'success', 'task_id', 'from', 'to', 'status', 'version', 'subtasks_created', 'task_card', 'acceptance', 'error', 'code',
    ])
    expect(NEW_KEYS).toHaveLength(7)
    expect([...NEW_KEYS]).toEqual([
      'results', 'partial', 'tree', 'tree_note', 'throttleRemainingMs', 'guidance', 'budget',
    ])
  })

  it('output.schema 声明旧 11 键 + 本卡落地的 6 个新键（budget 由 t5 落地后才声明）', () => {
    const tool = defineTaskMoveTool(makeHarness({}).deps) as unknown as {
      output?: { schema?: { properties?: Record<string, unknown> } }
      parameters?: { properties?: Record<string, unknown> }
    }
    const declared = new Set(Object.keys(tool.output?.schema?.properties ?? {}))
    for (const k of OLD_KEYS) expect(declared.has(k), '旧键未声明：' + k).toBe(true)
    for (const k of ['results', 'partial', 'tree', 'tree_note', 'throttleRemainingMs', 'guidance']) {
      expect(declared.has(k), '新键未声明：' + k).toBe(true)
    }
    // t5（REQ-261007100513-6749 FR-6）已落地 budget：入参 {release:true, add?}、回执
    // {task_id, windowIndex, limit, released}。t4 当时刻意留下"未声明"两条断言作为**交接标记**
    // （见其卡文件头"t5 落地时只补 schema 一处"），本卡落地后按同一口径翻成正向断言；键名未改名。
    // t5 **返工 P2②** 追加 `expectedWindowIndex`（放行的 CAS 值）：`additionalProperties:false`
    // 会拒收未声明的键，故 CAS 必须进 schema——键名仍是新增、不改名，`release`/`add` 逐字不变。
    expect(declared.has('budget')).toBe(true)
    expect(Object.keys(tool.parameters?.properties ?? {})).toContain('budget')
    const budgetProp = (tool.parameters?.properties as Record<string, any>)['budget']
    expect(Object.keys(budgetProp?.properties ?? {})).toEqual(['release', 'add', 'expectedWindowIndex'])
    expect(budgetProp?.additionalProperties).toBe(false)

    // 入参：tasks[] 的 1–20 项与逐项四参都已声明（additionalProperties:false 会拒收未声明的键）
    const params = (tool.parameters?.properties ?? {}) as Record<string, any>
    expect(params['tasks']?.type).toBe('array')
    expect(Object.keys(params['tasks']?.items?.properties ?? {})).toEqual(['task_id', 'to', 'reason', 'acceptance'])
    expect(params['tasks']?.items?.additionalProperties).toBe(false)
  })
})
