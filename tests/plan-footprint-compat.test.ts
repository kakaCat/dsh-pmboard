/**
 * 旧数据别被新规矩绊倒（REQ-261002175818-80a8 t8 / FR-9）——迁移与兼容单列。
 *
 * 为什么单列一份兼容用例：本需求（体量声明）**刻意不升 schemaVersion 9**——
 * `PlanTask.footprint` 与 `TaskRecord.footprint` 都是**可选**字段，存量计划与旧队列卡都没有它。
 * 兼容不是承诺，是断言：一旦哪个映射把"未声明"补成 `0`、或把空清单从返回体里删掉，这里必须红。
 *
 * 三条线各自的证伪形态（"改掉就红"的东西，不是正向复述）：
 *   ① 返回体的 `overCapacity` 必须是**在场的空数组**——改成
 *      `...(overCapacity.length > 0 ? { overCapacity } : {})` 这条即红
 *      （缺键与空数组对调用方是两种分支，不是同一种"没有"）；
 *   ② 旧卡回显 `footprintState='undeclared'` 且 `footprint` 键**不存在**——把它补成
 *      `footprint: undefined`（键在场）或 `{files:0,anchors:0,chars:0}`（冒充 0）都会红；
 *   ③ `REQBOARD_SCHEMA_VERSION` 恒为 9——为"装下"新字段而 bump 会让全部存量台账被拒载
 *      （v9 的读兼容是**拒绝式**的），故本文件同时断言旧形态对象能编译、能原样读回、不长出新键。
 *
 * 夹具照 tests/plan-footprint-propagation.test.ts（真 store + `stubDocFile` + `toUseCaseDeps`）；
 * 唯一区别是文档根显式指向 `mkdtemp` 目录并在 afterEach 整体删除——
 * 合成 id 的目录（`docs/requirements/REQ-fpc001`）绝不留在仓库里。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import {
  REQBOARD_SCHEMA_VERSION,
  normalizePlanTasks,
  type PlanTask,
  type RequirementRecord,
  type RequirementStatus,
  type TaskRecord,
} from '../src/shared/protocol.js'
import { defineTaskTreeTool } from '../src/tools/index.js'
import { queueTasksOf, seedQueueTasks, stubDocFile, toUseCaseDeps, type ReqboardToolDeps } from './helpers/tool-deps.js'

const W = 'session-fpc-001'
const REQ = 'REQ-fpc001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

/**
 * 计划文档夹具：任务表必须收录 tasks[] 的 key（2026-10-06 缺口 4 之四的
 * `plan_doc_task_table_incomplete` 硬门）。本文件只提交 key = legacy-p1。
 * 其余各行刻意**不含 footprint / 体量列**——本文件锁的就是「旧形状的计划照旧进门」。
 */
const PLAN_DOC = [
  '# 拆分计划（旧形状夹具）',
  '',
  '| 计划 key | 标题 | 依赖 | 验收标准 |',
  '|---|---|---|---|',
  '| legacy-p1 | 旧计划卡 | — | 跑 npx vitest run tests/plan-footprint-compat.test.ts 全绿 |',
  '',
].join('\n')

let store: ReturnType<typeof makeTestStore>
let root: string
let deps: ReqboardToolDeps
let tree: { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-fpc-'))
  store = makeTestStore()
  deps = {
    store,
    now: () => Date.now(),
    toolTrace: new Map(),
    doneThrottleMs: 0,
    workspaceRoot: root,
  } as never
  tree = defineTaskTreeTool(toUseCaseDeps(deps)) as never
  stubDocFile(PLAN_PATH, root, PLAN_DOC)
})

afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

async function seed(
  status: RequirementStatus = 'decomposing',
  plan?: Record<string, unknown>,
): Promise<void> {
  const r = {
    id: REQ, title: '旧数据兼容', description: '', status, blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
    ...(plan !== undefined ? { plan } : {}),
  } as RequirementRecord
  await store.replaceAll('requirement-created', {
    schemaVersion: 9, revision: 0, requirements: [r], triages: [],
  })
}

/**
 * 旧计划卡：这个字段（`footprint`）出现之前写下的计划。
 * 类型标成 `PlanTask` 本身就是 ③ 的编译期断言——若新字段被改成必填，这一行先编译失败。
 */
const LEGACY_PLAN_TASK: PlanTask = {
  key: 'legacy-p1',
  title: '旧计划卡',
  phase: 'implement',
  side: 'backend',
  dependsOn: [],
  acceptance: 'npx vitest run tests/plan-footprint-compat.test.ts 全绿',
  implementation: '改 src/shared/protocol.ts 与 src/domain/task/Footprint.ts',
}

/** 提交计划（走用例层：工具入参 schema 由 t3 守，本卡只管"旧计划照旧进门"）。 */
const submitPlan = (tasks: unknown) =>
  submitPlanArtifact(
    toUseCaseDeps(deps),
    { path: PLAN_PATH, summary: '目标：旧数据兼容；做法：不升版本、不补键', tasks },
    { agent: { id: W } },
  )

/**
 * 旧队列卡（`docs/requirements/<REQ>/queue.json` 里出现 `footprint` 之前的形状）。
 * 字段与 tests/application/harness.ts 的 `task()` 缺省逐字一致，**唯独不声明 footprint**——
 * 类型标成 `TaskRecord` 同样是编译期断言。
 */
function legacyTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-fpc00001',
    requirementId: REQ,
    title: '旧队列卡',
    description: 'd',
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: '跑测试看到绿',
    implementation: '改 x.ts',
    context: '',
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W },
    updatedBy: { kind: 'agent', sessionId: W },
    statusHistory: [],
    ...over,
  }
}

describe('① 无体量声明的计划照旧通过（未声明 ≠ 0）', () => {
  it('提交成功，且 overCapacity 是**在场的空数组**（键在、值为空——两者都要）', async () => {
    await seed()
    const out = (await submitPlan([LEGACY_PLAN_TASK])) as Record<string, unknown>

    expect(out.success).toBe(true)
    expect(out.plan_status).toBe('pending_approval')
    // 缺键与空数组对调用方是两种分支：只断言 `toEqual([])` 抓不住"把空清单删掉"这种改法。
    expect('overCapacity' in out).toBe(true)
    expect(out.overCapacity).toEqual([])
    // 台账里的计划卡也不该凭空长出 footprint 键（规整白名单不许补默认值）
    const saved = (await store.get(REQ))!
    expect(Object.prototype.hasOwnProperty.call(saved.plan?.tasks?.[0], 'footprint')).toBe(false)
  })
})

describe('② 旧台账任务卡在 reqboard_task_tree 上的回显', () => {
  it('回显 undeclared，且 footprint 键不存在（不是 toBeUndefined 的假绿）', async () => {
    await seed('implementing')
    await seedQueueTasks(deps, REQ, [legacyTask()])

    const out = await run(tree, {})
    expect(out.success).toBe(true)
    expect(out.parents).toHaveLength(1)
    const card = out.parents[0].parent

    expect(card.id).toBe('t-fpc00001')
    expect(card.footprintState).toBe('undeclared')
    // 为什么是 hasOwnProperty 而不是 toBeUndefined：`footprint: undefined` 也能过 toBeUndefined，
    // 但那时键**在场**——"未声明"与"字段名写错/被白名单丢了"在 JSON 化后同形，正是本字段要消掉的歧义。
    expect(Object.prototype.hasOwnProperty.call(card, 'footprint')).toBe(false)
  })

  it('同一次投影里，带声明的卡回显 declared 且键在场（证明 undeclared 不是硬编码）', async () => {
    await seed('implementing')
    await seedQueueTasks(deps, REQ, [legacyTask({ footprint: { files: 2, anchors: 3, chars: 1200 } })])

    const out = await run(tree, {})
    expect(out.success).toBe(true)
    const card = out.parents[0].parent

    expect(card.footprintState).toBe('declared')
    expect(card.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })

  it('两张卡混在同一队列里：各自回显各自的声明状态（旧卡不被新卡带跑）', async () => {
    await seed('implementing')
    await seedQueueTasks(deps, REQ, [
      legacyTask(),
      legacyTask({ id: 't-fpc00002', title: '新卡', footprint: { files: 4, anchors: 5, chars: 900 } }),
    ])

    const out = await run(tree, {})
    expect(out.success).toBe(true)
    const byId = new Map<string, any>(out.parents.map((p: any) => [p.parent.id, p.parent]))
    expect(byId.get('t-fpc00001')?.footprintState).toBe('undeclared')
    expect(Object.prototype.hasOwnProperty.call(byId.get('t-fpc00001'), 'footprint')).toBe(false)
    expect(byId.get('t-fpc00002')?.footprintState).toBe('declared')
    expect(byId.get('t-fpc00002')?.footprint).toEqual({ files: 4, anchors: 5, chars: 900 })
  })
})

describe('③ schemaVersion 仍为 9：新字段全部可缺省，不 bump', () => {
  it('契约常量恒为 9（bump 会让存量台账被读方拒载）', () => {
    expect(REQBOARD_SCHEMA_VERSION).toBe(9)
  })

  it('旧计划卡规整后不补 footprint 键；带声明的卡照旧保留（缺省 ≠ 忽略）', () => {
    const out = normalizePlanTasks([LEGACY_PLAN_TASK] as unknown)
    expect(out).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(out[0] as object, 'footprint')).toBe(false)
    // 类型层面：旧对象可直接当 PlanTask 用（上面那一行能编译本身就是"字段可选"的断言）
    expect(LEGACY_PLAN_TASK.footprint).toBeUndefined()

    const declared = normalizePlanTasks([
      { ...LEGACY_PLAN_TASK, footprint: { files: 2, anchors: 3, chars: 1200 } },
    ] as unknown)
    expect(declared[0]?.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })

  it('旧台账（旧计划 + 旧队列卡）按 v9 原样读回：不迁移、不补键、不报错', async () => {
    await seed('implementing', {
      path: PLAN_PATH, summary: '旧计划（无体量声明）', tasks: [LEGACY_PLAN_TASK], submittedAt: 1,
    })
    await seedQueueTasks(deps, REQ, [legacyTask()])

    const saved = (await store.get(REQ))!
    expect(saved.plan?.tasks?.[0]?.key).toBe('legacy-p1')
    expect(Object.prototype.hasOwnProperty.call(saved.plan?.tasks?.[0], 'footprint')).toBe(false)

    const cards = await queueTasksOf(deps, REQ)
    expect(cards).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(cards[0], 'footprint')).toBe(false)
  })
})
