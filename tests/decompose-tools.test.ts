/**
 * 真拆分与任务推进的**边界**测试（正常路径见 plan-mode.test.ts）。
 *
 * 计划模式下 decompose 只落库"已批准的计划"，所以本文件的重点是闸门与越权边界：
 *   - 立项态不能提交计划（方案还没谈）；
 *   - decompose 只能落库本窗口需求；
 *   - tasks 与批准计划不一致 → 拒绝；
 *   - task_move：跨窗口越权、任务不存在、取消任务（人工闸门）一律拒绝；
 *   - 开工自动开执行段、离开 in_progress 自动结算。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { definePlanSubmitTool, defineDecomposeTool, defineTaskMoveTool, defineVerifySubmitTool, defineTaskReportTool, queueTasksOf, taskStoreOf, stubDocFile, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { recordToolTrace, type ToolTraceEntry } from '../src/adapters/SessionProbeAdapter.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-abc-123'
/** 本文件通篇只操作这一个需求；任务断言一律从**队列**取（v9：台账无 tasks 通道）。 */
const REQ_ID = 'REQ-abc123'
/**
 * 计划文档夹具：任务表必须收录 tasks[] 的 key（2026-10-06 缺口 4 之四的
 * `plan_doc_task_table_incomplete` 硬门）。本文件提交过的计划 key 只有 a / b
 * （TWO_TASKS 与 plan_submit 三重校验的 GOOD 都是这两个）。
 */
const PLAN_DOC = [
  '# 拆分计划（夹具）',
  '',
  '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
  '|---|---|---|---|---|',
  '| a | 协议层改 | — | M | 跑 npx vitest run tests/reqboard.test.ts 全绿 |',
  '| b | 客户端改 | a | M | 跑 npx vitest run tests/client-view.test.ts 全绿 |',
  '',
].join('\n')
let dir: string
let store: ReturnType<typeof makeTestStore>
let planTool: { execute: (a: unknown, e: unknown) => Promise<any> }
let decompose: { execute: (a: unknown, e: unknown) => Promise<any> }
let taskMove: { execute: (a: unknown, e: unknown) => Promise<any> }
let verifySubmit: { execute: (a: unknown, e: unknown) => Promise<any> }
let reportTool: { execute: (a: unknown, e: unknown) => Promise<any> }
let trace: Map<string, ToolTraceEntry[]>
/** 同一个 deps 对象配全部工具 + 任务断言（tool-deps 按 deps 记忆化 TaskStore）。 */
let deps: ReqboardToolDeps

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-decompose-'))
  store = makeTestStore()
  trace = new Map()
  deps = { store, now: () => Date.now(), toolTrace: trace, doneThrottleMs: 60_000 }
  depsRef = deps
  planTool = definePlanSubmitTool(deps) as never
  decompose = defineDecomposeTool(deps) as never
  taskMove = defineTaskMoveTool(deps) as never
  verifySubmit = defineVerifySubmitTool(deps) as never
  reportTool = defineTaskReportTool(deps) as never
  // REQ-2d1c74 FR-5：plan_submit 起要求提交路径真实落盘——本文件的占位路径统一在文档根落桩
  for (const p of ['p.md', 'docs/requirements/REQ-abc123/plan.md', 'docs/requirements/REQ-abc123/decomposition.md']) {
    stubDocFile(p, undefined, PLAN_DOC)
  }
})

let depsRef: { doneThrottleMs?: number }

/** done 凭证门（t06）时代的诚实关账：留干活痕迹 + 汇报，再转 done。返回 done 转移的返回体。 */
async function honestClose(taskId: string) {
  recordToolTrace(trace, W, 'edit', Date.now())
  await run(reportTool, { task_id: taskId, summary: '完成实施', completed: ['改动已落地并自测'], files_changed: [] })
  return run(taskMove, { task_id: taskId, to: 'done' })
}
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seed(status: RequirementStatus = 'decomposing', sourceSessionId: string | undefined = W): Promise<RequirementRecord> {
  const r = {
    id: 'REQ-abc123', title: '看板需求', description: '', status, blocked: false,
    ...(sourceSessionId !== undefined ? { sourceSessionId } : {}),
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  return r
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown, agent = W) =>
  tool.execute(args, { agent: { id: agent } })

const TWO_TASKS = [
  { key: 'a', title: '协议层加时间线', phase: 'implement', side: 'backend', acceptance: 'npx vitest run tests/reqboard.test.ts 全绿', implementation: 'protocol.ts 加字段 + 单测验证' },
  { key: 'b', title: '客户端渲染甘特图', phase: 'ui', side: 'frontend', depends_on: ['a'], acceptance: 'npx vitest run tests/client-view.test.ts 全绿', implementation: 'view.ts 加 buildGantt() 渲染' },
]

/** 提交计划并**直接以人身份批准**（本文件不测裁决路径，那在 plan-mode.test.ts）。 */
async function planAndApprove(tasks: unknown = TWO_TASKS): Promise<void> {
  const out = await run(planTool, { path: 'docs/requirements/REQ-abc123/plan.md', summary: '摘要', tasks })
  expect(out.plan_status).toBe('pending_approval')
  await store.mutate(REQ_ID, (r) => {
    if (r.plan !== undefined) { r.plan.approvedAt = 1000; r.plan.approvedBy = { kind: 'human' } }
    return { changed: true }
  })
}

describe('reqboard_decompose 边界', () => {
  it('立项态不能提交计划（方案还没谈），decompose 也被拒', async () => {
    await seed('draft')
    await expect(run(planTool, { path: 'p.md', summary: 's', tasks: TWO_TASKS })).rejects.toThrow(/REQBOARD_BAD_STATUS/)
    await expect(run(decompose, {})).rejects.toThrow(/REQBOARD_BAD_STATUS/) // 先是状态闸，再是计划闸
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(0)
  })

  it('越权：不能拆别的窗口的需求', async () => {
    await seed('decomposing')
    await planAndApprove()
    await expect(run(decompose, {}, 'session-other')).rejects.toThrow(/REQBOARD_NO_BOUND_REQ/)
    await expect(run(decompose, { requirement_id: 'REQ-ffffff' })).rejects.toThrow(/REQBOARD_NOT_BOUND_TO_WINDOW/)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(0)
  })

  it('传与批准计划不一致的 tasks → 拒绝且不写库', async () => {
    await seed('decomposing')
    await planAndApprove()
    await expect(run(decompose, { tasks: [{ key: 'x', title: '计划外' }] })).rejects.toThrow(/REQBOARD_PLAN_MISMATCH/)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(0)
  })

  it('幂等守卫（REQ-2e9473 t01）：重复拆分被拒且任务数不变（事故 B 故障注入）', async () => {
    await seed('decomposing')
    await planAndApprove()
    const first = await run(decompose, {})
    expect(first.created).toHaveLength(2)
    // 第一次拆分后需求已被 rollup 推进到 decomposing → 第二次拆分撞状态守卫
    await expect(run(decompose, {})).rejects.toThrow(/REQBOARD_ALREADY_DECOMPOSED/)
    // 台账任务数不变：不产生幽灵任务
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(2)
  })

  /**
   * 回退态可重建（REQ-261003204149-1e80 t6 / FR-4）——解开「回得去、拆不了」的死结。
   *
   * 现场：需求被回退到拆分阶段后（旧卡已 canceled、上一轮物化的重做卡是活卡），
   * 若守卫仍以「已有未取消任务」一刀切，重拆就被拒死；而 `taskCompletenessGap` 又因
   * live>0 放行 ⇒ 二次实施跑的是与新计划不符的旧卡。
   */
  it('回退态可重建：上一轮的重做卡被新计划取代，且不产双份活卡', async () => {
    await seed('decomposing')
    await planAndApprove()
    await run(decompose, {}) // 第一轮：2 张卡
    const firstGen = await queueTasksOf(deps, REQ_ID)
    expect(firstGen).toHaveLength(2)

    // 造出「一次需求级回退之后」的队列现场（生产路径由 rollback-tasks + rollback-revocation 写入）：
    // 旧卡全部 canceled，并按旧卡物化 2 张重做卡。
    await taskStoreOf(deps).mutate(REQ_ID, (tasks) => {
      for (const t of tasks) {
        t.status = 'canceled'
        t.revisions = [
          ...(t.revisions ?? []),
          { at: 1, by: { kind: 'agent', sessionId: W }, kind: 'rollback', reason: '需求回退', changes: ['status: →canceled'] },
        ]
      }
      return tasks
    })
    // 物化重做卡：走 createMany（它的契约就是「新建一批卡」，且避开 QueueTask 的额外字段）
    await taskStoreOf(deps).createMany(REQ_ID, firstGen.map(t => ({
      ...structuredClone(t),
      id: 't-rework-' + t.id,
      title: '[重做] ' + t.title,
      reworkOf: t.id,
      status: 'todo' as const,
      dependsOn: [],
      revisions: [],
      statusHistory: [],
    })))
    // rollback 留痕：to = 当前阶段 ⇒ 处于回退态
    await store.mutate(REQ_ID, (r) => {
      r.status = 'decomposing'
      r.rollback = { from: 'implementing', to: 'decomposing', at: 2, by: { kind: 'agent', sessionId: W }, reason: '重新拆分' }
      return { changed: true }
    })
    expect((await queueTasksOf(deps, REQ_ID)).filter(t => t.status !== 'canceled')).toHaveLength(2) // 重做卡是活卡

    const again = await run(decompose, {})
    expect(again.success).toBe(true)
    expect(again.created).toHaveLength(2) // 新计划落库

    const live = (await queueTasksOf(deps, REQ_ID)).filter(t => t.status !== 'canceled')
    expect(live, '未取消卡数 = 新计划卡数（重做卡已被收敛）').toHaveLength(2)
    expect(live.filter(t => t.reworkOf !== undefined), '不残留重做卡').toHaveLength(0)
  })

  it('判据窄：有回退留痕但目标不是当前阶段 → 仍拒（历史留痕不放水）', async () => {
    await seed('decomposing')
    await planAndApprove()
    await run(decompose, {})
    await store.mutate(REQ_ID, (r) => {
      r.status = 'decomposing'
      // to=design ≠ 当前阶段：这是「退到 design 之后又走回 decomposing」的既成历史，不该再放行重建
      r.rollback = { from: 'implementing', to: 'design', at: 1, by: { kind: 'agent', sessionId: W } }
      return { changed: true }
    })
    await expect(run(decompose, {})).rejects.toThrow(/REQBOARD_ALREADY_DECOMPOSED/)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(2)
  })

  it('幂等守卫：状态停在 design 但已有未取消任务时，拒绝并返回已有清单', async () => {
    await seed('decomposing')
    await planAndApprove()
    await run(decompose, {})
    // 模拟状态异常：任务已落库但需求状态被外部改回 design（绕过状态守卫，考验任务清单防线）
    await store.mutate(REQ_ID, (r) => {
      r.status = 'design'
      return { changed: true }
    })
    await expect(run(decompose, {})).rejects.toThrow(/REQBOARD_ALREADY_DECOMPOSED/)
    await expect(run(decompose, {})).rejects.toThrow(/禁止重复拆分/)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(2)
  })

  it('回归（2026-09-17）：批准计划后自动进入 decomposing 且尚无任务 —— 必须允许拆分', async () => {
    // 事故现场：reqboard_ask_confirm(target=plan) 批准后自动 design → decomposing，
    // 紧接着调 decompose 被"状态=decomposing 即视为已拆过"的守卫拒死（REQBOARD_ALREADY_DECOMPOSED），
    // 而台账里一个任务都没有 —— 审批流水线自锁。
    await seed('decomposing')
    await store.mutate(REQ_ID, (r) => {
      r.plan = { path: 'p.md', summary: 's', tasks: [], submittedAt: 1, approvedAt: 1000, approvedBy: { kind: 'human' } } as never
      return { changed: true }
    })
    const out = await run(decompose, {
      tasks: [
        { key: 't1', title: '协议层加时间线', phase: 'implement', side: 'backend', acceptance: 'npx vitest run tests/reqboard.test.ts 全绿', implementation: 'src/shared/protocol.ts 加字段并由 tests/reqboard.test.ts 验证' },
        { key: 't2', title: '客户端渲染甘特图', phase: 'ui', side: 'frontend', depends_on: ['t1'], acceptance: 'tests/client-view.test.ts 全绿', implementation: 'src/client/view.ts 加 buildGantt() 并由 tests/client-view.test.ts 断言' },
      ],
    })
    expect(out.created).toHaveLength(2)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(2)
    // 拆完后重复拆分仍被拒（防线②）：无幽灵任务
    await expect(run(decompose, { tasks: [{ key: 't1', title: 'x' }] })).rejects.toThrow(/REQBOARD_ALREADY_DECOMPOSED/)
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(2)
  })

  it('幂等守卫：implementing/accepting 状态一律拒绝重复拆分', async () => {
    for (const st of ['implementing', 'accepting'] as const) {
      await seed(st)
      const __last = (await store.listSummaries({ scope: 'all' })).items.at(-1)!.id
      await store.mutate(__last, (r) => {
        r.plan = { path: 'p.md', summary: 's', tasks: [], submittedAt: 1, approvedAt: 1000, approvedBy: { kind: 'human' } } as never
        return { changed: true }
      })
      await expect(run(decompose, {})).rejects.toThrow(/REQBOARD_ALREADY_DECOMPOSED/)
      // 清理本条 seed，避免互相影响
      await store.replaceAll('cleanup', { schemaVersion: 9, revision: 0, requirements: [], triages: [] })
    }
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(0)
  })

  it('按计划落库：key 映射成真实 id、依赖成链、任务验收标准来自计划', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    expect(out.created).toHaveLength(2)
    expect(out.created[0].id).toMatch(/^t-[0-9a-f]{6}$/)
    expect(out.created[1].depends_on).toEqual([out.created[0].id])
    expect(out.requirement_status).toBe('decomposing')
        const queueTasks = await queueTasksOf(deps, REQ_ID)
    // 迁移（REQ-d3e61a T-9）：占位验收标准换成**可照着验**的真实标准——本断言验的是
    // "计划任务表正确落库"（语义不变），只是值随门禁要求一起升级。
    expect(queueTasks.map(t => t.acceptance)).toEqual(['npx vitest run tests/reqboard.test.ts 全绿', 'npx vitest run tests/client-view.test.ts 全绿'])
    expect(queueTasks[0].statusHistory?.[0]?.by.kind).toBe('agent')
    // cardDoc 随落库写死（REQ-260923134706-e72f 断链修复）：任务卡文档路径 = docs/requirements/<REQ>/tasks/<id>.md
    for (const t of queueTasks) {
      expect(t.cardDoc).toBe('docs/requirements/' + t.requirementId + '/tasks/' + t.id + '.md')
    }
    // 2026-09-21：拆分计划在拆分阶段提交，decompose 不再承担 design>decomposing 推进
    expect((await store.get(REQ_ID))!.status).toBe('decomposing')
    expect((await store.get(REQ_ID))!.statusHistory?.map(e => e.status)).toEqual(['draft'])
  })
})

describe('plan_submit 三重校验（REQ-2e9473 t03）', () => {
  const GOOD = [
    { key: 'a', title: '协议层改', acceptance: 'protocol.ts 单测绿', implementation: 'protocol.ts 加字段' },
    { key: 'b', title: '客户端改', depends_on: ['a'], acceptance: '截图可见', implementation: 'view.ts 加渲染' },
  ]

  it('缺 implementation 的任务表被拒', async () => {
    await seed('decomposing')
    await expect(run(planTool, {
      path: 'p.md', summary: 's',
      tasks: [{ key: 'a', title: 'x', acceptance: '单测绿' }],
    })).rejects.toThrow(/缺实施方案/)
  })

  it('验收标准空话（功能正常）被拒', async () => {
    await seed('decomposing')
    await expect(run(planTool, {
      path: 'p.md', summary: 's',
      tasks: [{ key: 'a', title: 'x', acceptance: '功能正常', implementation: '改 x.ts' }],
    })).rejects.toThrow(/空话/)
  })

  it('验收标准缺可验证锚点被拒', async () => {
    await seed('decomposing')
    await expect(run(planTool, {
      path: 'p.md', summary: 's',
      tasks: [{ key: 'a', title: 'x', acceptance: '做完就行了', implementation: '改 x.ts' }],
    })).rejects.toThrow(/锚点/)
  })

  it('前向引用被拒（事故 G：依赖后定义的 key）', async () => {
    await seed('decomposing')
    await expect(run(planTool, {
      path: 'p.md', summary: 's',
      tasks: [
        { key: 'a', title: 'x', depends_on: ['b'], acceptance: '单测绿', implementation: '改 x.ts' },
        { key: 'b', title: 'y', acceptance: '截图可见', implementation: '改 y.ts' },
      ],
    })).rejects.toThrow(/前向引用/)
  })

  it('依赖不存在的 key 被拒（原有语义保持）', async () => {
    await seed('decomposing')
    await expect(run(planTool, {
      path: 'p.md', summary: 's',
      tasks: [{ key: 'a', title: 'x', depends_on: ['ghost'], acceptance: '单测绿', implementation: '改 x.ts' }],
    })).rejects.toThrow(/不存在的 key/)
  })

  it('合法任务表通过且 implementation 落库', async () => {
    await seed('decomposing')
    const out = await run(planTool, { path: 'p.md', summary: 's', tasks: GOOD })
    expect(out.plan_status).toBe('pending_approval')
    const plan = (await store.get(REQ_ID))!.plan!
    expect(plan.tasks.map(t => t.implementation)).toEqual(['protocol.ts 加字段', 'view.ts 加渲染'])
  })
})

describe('实施卡透传与开工送达（REQ-2e9473 t04）', () => {
  it('decompose 把 implementation 透传进 TaskRecord 与任务卡文件', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    // v9：任务断言一律从队列取（台账已无 tasks 通道）
    const queueTasks = await queueTasksOf(deps, REQ_ID)
    expect(queueTasks.map(t => t.implementation)).toEqual(['protocol.ts 加字段 + 单测验证', 'view.ts 加 buildGantt() 渲染'])
    expect(out.thin_cards).toBeUndefined()
  })

  it('历史批准的薄卡计划：decompose 不硬拦（人批过）但返回 thin_cards 警告', async () => {
    await seed('decomposing')
    // 模拟规则生效前批准的存量计划：无 implementation
    await store.mutate(REQ_ID, (r) => {
      r.plan = {
        path: 'p.md', summary: 's', submittedAt: 1, submittedBy: { kind: 'agent' },
        approvedAt: 2, approvedBy: { kind: 'human' },
        tasks: [{ key: 'a', title: '旧任务', acceptance: '单测绿' }],
      } as never
      return { changed: true }
    })
    const out = await run(decompose, {})
    expect(out.success).toBe(true)
    expect(out.thin_cards).toHaveLength(1)
    expect(out.warning).toMatch(/薄卡/)
  })

  it('task_move→in_progress 返回任务卡全文（开工说明书送达）', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    await store.mutate(REQ_ID, (r) => {
      r.status = 'implementing'
      return { changed: true }
    })
    const start = await run(taskMove, { task_id: out.created[0].id, to: 'in_progress' })
    expect(start.task_card).toBeDefined()
    expect(start.task_card.implementation).toBe('protocol.ts 加字段 + 单测验证')
    expect(start.task_card.acceptance).toBe('npx vitest run tests/reqboard.test.ts 全绿')
    expect(start.task_card.doc_path).toMatch(/tasks\/t-/)
    // 非开工转移不带任务卡
    const next = await run(taskMove, { task_id: out.created[0].id, to: 'testing' })
    expect(next.task_card).toBeUndefined()
  })
})

describe('rollup 阻塞 blockers 显式化（REQ-2e9473 t02）', () => {
  /** 落库 2 任务并把需求推进到 implementing（模拟拆分确认门已过）。 */
  async function seedImplementingTwoTasks() {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    await store.mutate(REQ_ID, (r) => {
      r.status = 'implementing'
      return { changed: true }
    })
    return out.created.map((c: { id: string }) => c.id)
  }

  it('task_move：任务 a 完成但 b 仍 todo（幽灵场景）→ 返回 blockers + warning', async () => {
    const [a] = await seedImplementingTwoTasks()
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: a, to })
    const out = await honestClose(a)
    expect(out.blockers).toHaveLength(1)
    expect(out.blockers[0].status).toBe('todo')
    expect(out.warning).toMatch(/未进验收/)
    expect(out.requirement_status).toBe('implementing')
  })

  it('verify_submit：有未完成任务时返回显式 blockers，status 停 implementing 且 note 改写', async () => {
    const [a] = await seedImplementingTwoTasks()
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: a, to })
    await honestClose(a)
    const out = await run(verifySubmit, { summary: '交付完成', evidence: ['npx vitest run：393 通过'] })
    expect(out.blockers).toHaveLength(1)
    expect(out.blockers[0].status).toBe('todo')
    expect(out.warning).toMatch(/rollup 阻塞/)
    expect(out.status).toBe('implementing')
    expect(out.note).toMatch(/停在 implementing/)
  })

  it('全部任务 done → 无 blockers，R2 正常推进到 accepting', async () => {
    depsRef.doneThrottleMs = 0 // 本用例验 rollup 不验节流（节流有专属故障注入用例）
    const [a, b] = await seedImplementingTwoTasks()
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: a, to })
    await honestClose(a)
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: b, to })
    await honestClose(b)
    const out = await run(verifySubmit, { summary: '交付完成', evidence: ['npx vitest run：全绿'] })
    expect(out.blockers).toBeUndefined()
    expect(out.warning).toBeUndefined()
    expect(out.status).toBe('accepting')
    expect(out.note).toMatch(/逐项审核/)
  })
})

describe('done 凭证门（REQ-2e9473 t06/W2，事故 C/D 故障注入）', () => {
  /** 开工到 in_review 的任务（未汇报、无痕迹）。 */
  async function taskInReview() {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    await store.mutate(REQ_ID, (r) => {
      r.status = 'implementing'
      return { changed: true }
    })
    const id = out.created[0].id as string
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: id, to })
    return id
  }

  it('无汇报 → REQBOARD_NO_REPORT（25ms 速通拦截）', async () => {
    const id = await taskInReview()
    await expect(run(taskMove, { task_id: id, to: 'done' })).rejects.toThrow(/REQBOARD_NO_REPORT/)
    expect((await queueTasksOf(deps, REQ_ID))[0].status).toBe('in_review')
  })

  it('汇报证据为空（completed/files_changed 都空）→ REQBOARD_NO_REPORT', async () => {
    const id = await taskInReview()
    await run(reportTool, { task_id: id, summary: '做完了' })
    await expect(run(taskMove, { task_id: id, to: 'done' })).rejects.toThrow(/REQBOARD_NO_REPORT/)
  })

  it('有汇报但开工以来无工具痕迹且无文件证据 → REQBOARD_NO_EVIDENCE', async () => {
    const id = await taskInReview()
    await run(reportTool, { task_id: id, summary: '完成', completed: ['改了代码'], files_changed: ['no/such/file.ts'] })
    await expect(run(taskMove, { task_id: id, to: 'done' })).rejects.toThrow(/REQBOARD_NO_EVIDENCE/)
  })

  it('60s 内连续关闭两个任务 → 第二个被 REQBOARD_BULK_CLOSE 节流（事故 C 复现）', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    await store.mutate(REQ_ID, (r) => {
      r.status = 'implementing'
      return { changed: true }
    })
    const [a, b] = out.created.map((c: { id: string }) => c.id)
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: a, to })
    await honestClose(a)
    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: b, to })
    recordToolTrace(trace, W, 'edit', Date.now())
    await run(reportTool, { task_id: b, summary: '完成', completed: ['改动落地'] })
    // 契约迁移（REQ-261007100513-6749 t4 / R3）：用例层仍是抛错（see tests/done-throttle-guidance.test.ts），
    // 工具层把同一个码的节流拒绝转成**结构化失败回执**返回——断言同一件事：第二次收尾被 REQBOARD_BULK_CLOSE 拒。
    const throttled: any = await run(taskMove, { task_id: b, to: 'done' })
    expect(throttled.code).toBe('REQBOARD_BULK_CLOSE')
    expect(throttled.throttleRemainingMs).toBeGreaterThan(0)
    expect(String(throttled.guidance)).toContain('确定等待')
  })

  it('页面插件任务未构建 → REQBOARD_STALE_BUILD（事故 D）', async () => {
    const id = await taskInReview()
    recordToolTrace(trace, W, 'edit', Date.now())
    await run(reportTool, {
      task_id: id, summary: '改了页面插件源码', completed: ['view.ts 已改'],
      files_changed: ['packages/pages/no-such-pkg/src/view.ts'],
    })
    await expect(run(taskMove, { task_id: id, to: 'done' })).rejects.toThrow(/REQBOARD_STALE_BUILD/)
  })

  it('诚实路径全通：痕迹+汇报+非批量 → done 放行', async () => {
    const id = await taskInReview()
    const out = await honestClose(id)
    expect(out.to).toBe('done')
  })
})

describe('reqboard_task_move 边界', () => {
  it('越权/不存在/人工闸门一律拒绝', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    const a = out.created[0].id
    await expect(run(taskMove, { task_id: a, to: 'canceled' })).rejects.toThrow(/REQBOARD_HUMAN_GATE/)
    await expect(run(taskMove, { task_id: 't-ffffff', to: 'in_progress' })).rejects.toThrow(/REQBOARD_TASK_NOT_FOUND/)
    await expect(run(taskMove, { task_id: a, to: 'in_progress' }, 'session-other')).rejects.toThrow(/REQBOARD_NOT_BOUND_TO_WINDOW/)
    await expect(run(taskMove, { task_id: a, to: 'done' })).rejects.toThrow(/invalid_transition/)
  })

  it('开工自动开执行段，离开 in_progress 自动结算；全部完成后需求进验收', async () => {
    await seed('decomposing')
    await planAndApprove()
    const out = await run(decompose, {})
    const [a, b] = out.created.map((c: { id: string }) => c.id)

    const start = await run(taskMove, { task_id: a, to: 'in_progress', reason: '开工' })
    // 2026-09-14 五门裁定：任务开工不再自动 decomposing>implementing（拆分清单须人确认），
    // 需求停在拆分态；模拟人确认拆分清单后推进到 implementing，再验证 R2 rollup。
    expect(start.requirement_status).toBe('decomposing')
    let t = (await queueTasksOf(deps, REQ_ID)).find(x => x.id === a)!
    expect(t.executions).toHaveLength(1)
    expect(t.executions[0].outcome).toBe('running')
    expect(t.claimedBy).toBe(W)

    depsRef.doneThrottleMs = 0 // 本用例验执行段结算不验节流
    for (const to of ['testing', 'in_review']) await run(taskMove, { task_id: a, to })
    await honestClose(a)
    t = (await queueTasksOf(deps, REQ_ID)).find(x => x.id === a)!
    expect(t.executions[0].endedAt).toBeDefined()
    expect(t.executions[0].outcome).toBe('succeeded')
    expect(t.statusHistory?.map(e => e.status)).toEqual(['todo', 'in_progress', 'testing', 'in_review', 'done'])
    expect((await store.get(REQ_ID))!.status).toBe('decomposing')

    // 模拟人确认拆分清单（human gate 通过），需求进入实施态
    await store.mutate('REQ-abc123', (r) => {      r.status = 'implementing'
      return { changed: true }
    })

    for (const to of ['in_progress', 'testing', 'in_review']) await run(taskMove, { task_id: b, to })
    await honestClose(b)
    expect((await store.get(REQ_ID))!.status).toBe('accepting')
  })
})
