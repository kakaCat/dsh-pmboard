/**
 * 三处就绪判定收敛到单点（REQ-261005193546-1b1a t2 / FR-1 / D-8；契源 design/interfaces.md §3.2/§3.3）。
 *
 * 本需求要修的病：同一份台账上「哪种依赖算已满足」有**三处口径漂移**——
 * `queue-access.readyTasksOf`（取消卡 = 已了结 ✅，D-8 语义源）vs
 * `shared/protocol.readyTasks` / `domain/queue/topology.computeReady`（只认 `done` ❌）。
 * 后果不是"读数差一点"，而是**活卡被取消卡永久卡死**：唯一前置被取消 ⇒ 该卡永不进 ready。
 *
 * 标本（全文件共用）：`t-l`（todo）的**唯一前置 `t-c` 已取消**；另放一张 `t-a`（todo，无依赖）
 * 用于钉住"输出顺序 = 输入顺序"。期望：三处判定都给出 `['t-a', 't-l']`（含 `t-l`）。
 *
 * 写盘那一档是**必须同批改**的理由所在：写路径先按新口径算出含 `t-l` 的 `ready[]`，若 V-5 假就绪
 * 仍按旧口径（只认 `done`）判，就会把刚算出的队列判成"假就绪" ⇒ `QUEUE_VALIDATION_FAILED`、
 * 一个字节都不落盘。故本文件对新语义载荷真跑一次 `repo.save`，断言落盘成功且磁盘 `ready[]` 含 `t-l`。
 *
 * 逆验证（见任务汇报）：删掉 `Predicates.isDependencySatisfied` 的 `canceled` 分支且不恢复 ⇒
 * 「三处逐字相等且含 t-l」与「写盘不抛」两档必红（`t-l` 会从三处 ready 里同时消失）。
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readyTasksOf } from '../src/application/use-cases/queue-access.js'
import { computeEdges, computeLayers, computeReady } from '../src/domain/queue/topology.js'
import { hasIssue, validateQueueFile } from '../src/domain/queue/validateQueue.js'
import type { QueueFile, QueueTask } from '../src/domain/queue/QueueTypes.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { readyTasks } from '../src/shared/protocol.js'
import type { TaskRecord, TaskStatus } from '../src/shared/protocol.js'

const REQ = 'REQ-261005193546-1b1a'
const ACTOR = { kind: 'agent' as const, sessionId: 'session-ready-single-source' }

/** 构造一条字段齐全的 TaskRecord（复用 tests/queue/fixtures.ts 的形状，保持自足）。 */
function task(id: string, status: TaskStatus, dependsOn: string[] = []): TaskRecord {
  return {
    id,
    requirementId: REQ,
    title: `就绪同源标本 ${id}`,
    description: '取消卡不阻塞活卡的标本',
    phase: 'implement',
    side: 'backend',
    scope: { apis: [], tables: [], files: [] },
    acceptance: '样本验收（含可执行锚点）',
    context: '样本背景',
    dependsOn,
    status,
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1759000000000,
    updatedAt: 1759000000000,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  }
}

/**
 * 标本本体（顺序敏感）：`t-a`(todo) → `t-c`(canceled) → `t-l`(todo, 唯一前置 t-c)。
 * 输入顺序 `[t-a, t-c, t-l]` 即断言里 ready 的期望顺序（`t-c` 是取消卡、永不进 ready）。
 */
const specimen = (): TaskRecord[] => [
  task('t-a', 'todo'),
  task('t-c', 'canceled'),
  task('t-l', 'todo', ['t-c']),
]

/** 同一条标本的队列卡形状（`layer` 是占位值，由 `computeLayers` 回填）。 */
const qt = (id: string, status: TaskStatus, dependsOn: string[] = []): QueueTask => ({
  ...task(id, status, dependsOn),
  layer: 0,
})

const idsOf = (tasks: readonly TaskRecord[]): string[] => tasks.map((t) => t.id)

/**
 * 由同一标本构造一份**自洽的队列文件**：`layer` / `edges` / `layers` / `ready` 全由 topology 重算。
 *
 * 注意 `computeLayers` 仍按**全量节点**分层（本卡一字不改）：`t-c` 占第 0 层、`t-l` 第 1 层
 * ——落盘分层判据不变，被改的只有 `ready` 的依赖判定。
 */
function queueOfSpecimen(): QueueFile {
  const drafts: QueueTask[] = [qt('t-a', 'todo'), qt('t-c', 'canceled'), qt('t-l', 'todo', ['t-c'])]
  const layers = computeLayers(drafts)
  const layerOf = new Map<string, number>()
  for (const layer of layers) for (const id of layer.tasks) if (!layerOf.has(id)) layerOf.set(id, layer.layer)
  const tasks: QueueTask[] = drafts.map((t) => ({ ...t, layer: layerOf.get(t.id) ?? t.layer }))
  return {
    version: 1,
    requirement_id: REQ,
    schemaVersion: 9,
    generated_at: '2026-10-05T19:35:46.000Z',
    tasks,
    edges: computeEdges(tasks),
    layers,
    ready: computeReady(tasks),
  }
}

describe('三处就绪判定同源：同一标本逐字相等（FR-1 / D-8）', () => {
  it('readyTasksOf / readyTasks / computeReady 输出逐字相等，且都含 t-l', () => {
    const viaUseCase = readyTasksOf(specimen())
    const viaShared = readyTasks(specimen(), REQ)
    const viaTopology = computeReady(queueOfSpecimen().tasks)

    expect(viaUseCase.map((t) => t.id)).toEqual(['t-a', 't-l'])
    expect(viaShared.map((t) => t.id)).toEqual(idsOf(viaUseCase))
    expect(viaTopology).toEqual(idsOf(viaUseCase))
    expect(viaTopology).toContain('t-l')
    // 取消卡自身永不出现在任何 ready 里
    expect(viaTopology).not.toContain('t-c')
  })

  it('作用域口径不变：readyTasks 只收本需求任务，且顺序 = 输入顺序', () => {
    const other = { ...task('t-z', 'todo'), requirementId: 'REQ-000000000000-0000' }
    const tasks = [...specimen(), other]

    expect(idsOf(readyTasks(tasks, REQ))).toEqual(['t-a', 't-l'])
    // 反序输入 ⇒ 输出跟着反序（不重排、不按 id 排序）
    expect(idsOf(readyTasks([...tasks].reverse(), REQ))).toEqual(['t-l', 't-a'])
  })

  it('取消卡不再阻塞：去掉 t-c（= 把该边删掉）后结果不变', () => {
    const withoutCanceled = [task('t-a', 'todo'), task('t-l', 'todo')]

    expect(idsOf(readyTasksOf(withoutCanceled))).toEqual(['t-a', 't-l'])
    expect(computeReady([qt('t-a', 'todo'), qt('t-l', 'todo')])).toEqual(['t-a', 't-l'])
  })

  it('真约束不放松：t-l 的唯一前置是活卡（todo）时三处都不放行', () => {
    const blocked = [task('t-a', 'todo'), task('t-y', 'todo'), task('t-l', 'todo', ['t-y'])]

    expect(idsOf(readyTasksOf(blocked))).toEqual(['t-a', 't-y'])
    expect(computeReady([qt('t-a', 'todo'), qt('t-y', 'todo'), qt('t-l', 'todo', ['t-y'])])).toEqual(['t-a', 't-y'])
  })

  it('computeLayers 分层判据未动：取消卡照旧占第 0 层（落盘分层是历史派生值）', () => {
    expect(queueOfSpecimen().layers).toEqual([
      { layer: 0, tasks: ['t-a', 't-c'] },
      { layer: 1, tasks: ['t-l'] },
    ])
  })
})

describe('写盘校验：新语义载荷不被 V-5 判成假就绪（同批改的理由）', () => {
  let root: string
  let repo: JsonQueueRepository

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-ready-single-source-'))
    repo = new JsonQueueRepository({ workspaceRoot: root, onWarn: () => {} })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('validateQueueFile：passed === true，且 issues 里没有 V-5', () => {
    const file = queueOfSpecimen()
    expect(file.ready).toContain('t-l')

    const result = validateQueueFile(file)
    expect(result.issues.filter((i) => i.rule === 'V-5')).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('repo.save：不抛 QUEUE_VALIDATION_FAILED，落盘 ready[] 含 t-l', async () => {
    await expect(repo.save(REQ, queueOfSpecimen())).resolves.toBeUndefined()

    const onDisk = JSON.parse(await readFile(repo.pathOf(REQ), 'utf8')) as QueueFile
    expect(onDisk.ready).toContain('t-l')
  })

  it('反例控制：V-5 没有被改哑——把取消卡塞进 ready 仍报假就绪', () => {
    const file = queueOfSpecimen()
    file.ready = ['t-c', 't-l']

    const result = validateQueueFile(file)
    expect(hasIssue(result, 'V-5')).toBe(true)
    expect(result.passed).toBe(false)
  })
})
