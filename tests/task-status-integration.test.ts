/**
 * reqboard_task_tree(task_id) 接口联调（原 reqboard_task_status，REQ-261007220012-bd29 FR-3 并入）。
 * serves: FR-3
 *
 * 与 task-status-ledger.test.ts（单测，FakeDocs 内存台账）互补：本文件走**真适配器 + 真磁盘台账**，
 * 证明读数来自持久化的 queue.json，而不是任务卡文档：
 *   TC-I1 写→读闭环：真 reqboard_task_report 把 lastReport 落磁盘台账 → 单卡展开原样读回
 *         （report 同时写 lastRun：stopReason='reported'，故 run/workflow 也在场——如实断言）；
 *   TC-I2 期望响应逐字段比对：台账里已持久化的 lastRun/lastReport → 返回 task.run / task.report /
 *         task.workflow 与预期**完全相等**；
 *   TC-I3 数据源证明：磁盘上确无任何任务卡文档，读数仍成立（旧 fs 直读路径会在此返回空）。
 */
import { makeHarness } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { FileHostFs } from '../src/adapters/FileHostFs.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineTaskTreeTool, defineTaskReportTool } from '../src/tools/index.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import type { ReqboardLedger, TaskRecord } from '../src/shared/protocol.js'

const W = 'session-status-int-1'

let root: string
// B12 阶段③a：存储改**新端口**（InMemoryRequirementStore，与工具同源）
let h: ReturnType<typeof makeHarness>
let taskStore: QueueTaskStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-task-status-int-'))
  h = makeHarness({})
  // 任务唯一存储 = 队列（REQ-260927202051-f6df：v9 台账已无 tasks 通道）
  taskStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: root }), now: () => Date.now() })
})

/** 队列文件路径（任务落点）。 */
const queueFile = () => join(root, 'docs/requirements/REQ-int00001/queue.json')
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/** 真适配器构造 UseCaseDeps（工具壳吃 application 端口）；无 agents → 认证降级放行。 */
const deps = () => ({
  // B12 阶段③a：需求存储端口（必填）——与播种（`h.store.replaceAll`）**同一份**，保证"写 A 读 A"
  store: h.store,
  // 任务队列端口（REQ-260927202051-f6df）：v9 起任务唯一入口；同一实例保证"写 A 读 A"
  taskStore,
  docs: new FileDocRepository({ workspaceRoot: root }),
  // REQ-261008020617-088f RF-3/RF-5：宿主文件面端口（无状态）
  hostFs: new FileHostFs(),
  clock: new SystemClock(),
  ids: new RandomIdFactory(),
  session: new SessionProbeAdapter({}),
  questions: new UserQuestionsAdapter(() => undefined),
  doneThrottleMs: 0,
})

const run = (tool: unknown, args: unknown) =>
  (tool as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

/** 播种：implementing 需求（本窗口绑定）+ 任务卡。 */
function seedLedger(_over: { taskStatus?: string; lastRun?: unknown; lastReport?: unknown } = {}): ReqboardLedger {
  return {
    // v9：台账只留 requirements/triages（任务见 seedTask → queue.json）
    schemaVersion: 9,
    revision: 1,
    requirements: [{
      id: 'REQ-int00001', title: '单卡状态联调', description: '', category: 'feature', status: 'implementing',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      statusHistory: [{ status: 'implementing', at: 1, by: { kind: 'human', sessionId: W } }],
    }],
    triages: [],
  } as unknown as ReqboardLedger
}

/** 任务记录（落**队列**）。 */
function seedTask(over: { taskStatus?: string; lastRun?: unknown; lastReport?: unknown } = {}): TaskRecord {
  return {
    id: 't-int0001', requirementId: 'REQ-int00001', title: '任务', description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'a', context: '', status: over.taskStatus ?? 'todo',
    blocked: false, executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W }, statusHistory: [],
    ...(over.lastRun !== undefined ? { lastRun: over.lastRun } : {}),
    ...(over.lastReport !== undefined ? { lastReport: over.lastReport } : {}),
  } as unknown as TaskRecord
}

/** 播种看板：v9 台账（仅需求）+ 队列任务（任务唯一存储 = 磁盘 queue.json）。 */
async function seedBoard(over: { taskStatus?: string; lastRun?: unknown; lastReport?: unknown } = {}): Promise<void> {
  await h.store.replaceAll('seed', seedLedger(over))
  await taskStore.createMany('REQ-int00001', [seedTask(over)])
}

describe('reqboard_task_tree(task_id) 接口联调（真台账 + 真工具壳；原 task_status 并入）', () => {
  it('TC-I1 写→读闭环：真 report 工具落盘 lastReport，真 status 工具原样读回', async () => {
    await seedBoard()

    // 请求样例：reqboard_task_report(task_id, summary, completed, files_changed)
    const rep = await run(defineTaskReportTool(deps()), { task_id: 't-int0001',
      summary: '联调：写入 lastReport',
      completed: ['完成 A', '完成 B'],
      files_changed: ['packages/web/dsh-pmboard/src/tools/TaskTreeTool/TaskTreeTool.ts'],
    })
    expect(rep.success).toBe(true)
    expect(rep.report_index).toBe(1)

    // 磁盘确已落盘（不是内存假象）——**落点从 dsh-reqboard.json 改为 queue.json**
    // （REQ-260927202051-f6df：任务是按需求分片的 queue.json，台账不再有 tasks 键）
    const onDisk = JSON.parse(readFileSync(queueFile(), 'utf-8'))
    const persisted = onDisk.tasks.find((t: any) => t.id === 't-int0001')
    expect(persisted.lastReport.completed).toEqual(['完成 A', '完成 B'])

    // 请求样例：reqboard_task_tree(task_id=…) 单卡展开
    const out = await run(defineTaskTreeTool(deps()), { task_id: 't-int0001' })
    // 期望响应：report 三字段来自上一步落盘的 lastReport；报告工具同时写 lastRun
    // （stopReason='reported'，见 ReportTask.ts:156-158）⇒ run/workflow 也在场，如实断言。
    expect(out.task).toMatchObject({
      task_id: 't-int0001',
      status: 'todo',
      progress: 0,
      report: { summary: '完成 A；完成 B', completedCount: 2, filesChangedCount: 1 },
      run: { ok: true, stopReason: 'reported', valueNonEmpty: true },
    })
    expect(typeof (out.task.workflow as { at?: unknown }).at).toBe('number')
  })

  it('TC-I2 台账已持久化 lastRun/lastReport → 返回体与期望逐字段一致', async () => {
    await seedBoard({
      taskStatus: 'in_review',
      lastRun: { at: 7, ok: false, stopReason: 'error', valueNonEmpty: false, reason: 'engine_unavailable' },
      lastReport: { at: 7, reportIndex: 1, filesChanged: ['packages/x/a.ts', 'packages/x/b.ts'], completed: ['改完 A 模块', '补测试'] },
    })

    const out = await run(defineTaskTreeTool(deps()), { task_id: 't-int0001' })
    expect(out.task).toEqual({
      task_id: 't-int0001',
      status: 'in_review',
      progress: 85,
      run: { ok: false, stopReason: 'error', valueNonEmpty: false, reason: 'engine_unavailable' },
      report: { summary: '改完 A 模块；补测试', completedCount: 2, filesChangedCount: 2 },
      // 键保留（既有消费者契约），内容换为 run 摘要
      workflow: { at: 7, ok: false, stopReason: 'error', valueNonEmpty: false },
    })
  })

  it('TC-I3 磁盘无任何任务卡文档，读数仍成立（旧 fs 直读路径此时必空）', async () => {
    await seedBoard({
      taskStatus: 'in_review',
      lastRun: { at: 9, ok: true, stopReason: 'completed', valueNonEmpty: true },
    })

    // 数据源证明：旧实现读的 docs/requirements/<REQ>/tasks/<task>.md 根本不存在
    expect(existsSync(join(root, 'docs/requirements/REQ-int00001/tasks/t-int0001.md'))).toBe(false)

    const out = await run(defineTaskTreeTool(deps()), { task_id: 't-int0001' })
    expect(out.task.run).toEqual({ ok: true, stopReason: 'completed', valueNonEmpty: true })
    expect(out.task.workflow).toEqual({ at: 9, ok: true, stopReason: 'completed', valueNonEmpty: true })
  })
})
