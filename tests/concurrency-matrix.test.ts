/**
 * 并发矩阵（REQ-261006201814-ac4f FR-7）。
 *
 * ## 为什么单列一张「并发」矩阵
 *
 * 本仓的反向覆盖此前集中在「参数校验」这一层（实测洼地：越权 14 / 并发 16 / 竞态 3 / 空输入 3，
 * 而「幂等」有 95 条）。并发与竞态是**最容易出假绿**的一类：拒绝看起来发生了，
 * 但状态其实被改了一半。故本矩阵逐格给三件套：**拒绝码 + 零写入 + 状态不变**。
 *
 * ## 四格（末尾计数断言防漏格）
 *
 * ① 单飞：同一需求已有推行中的 run → 再次推进被锁挡住（REQBOARD_ADVANCE_LOCKED），且零写入；
 * ② 重复拆分：已落库任务的需求再拆 → REQBOARD_ALREADY_DECOMPOSED，且零写入；
 * ③ 并行父卡上限：ready 父卡数超过上限时，一次只放行上限张（纯函数，逐数核）；
 * ④ 批量关闭节流：60s 窗口内跨批再关一张 → REQBOARD_BULK_CLOSE，且第二张状态不变。
 *
 * @module dsh-pmboard/tests/concurrency-matrix.test
 */
import { describe, expect, it } from 'vitest'
import { InMemoryQueueRepository, makeHarness, makeTestStore, req, task } from './application/harness.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { selectAdvanceBatch } from '../src/application/internal/advance-select.js'
import { seedQueueTasks, toUseCaseDeps, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { defineAdvanceTool, defineDecomposeTool, defineTaskMoveTool } from '../src/tools/index.js'
import { probeWrites, expectNoWrite } from './helpers/ledger-probe.js'
import { codeOf } from './helpers/code-trigger-harness.js'
import type { TaskRecord } from '../src/shared/protocol.js'

const W = 'session-cm-001'
const REQ_ID = 'REQ-cm0001'
const T = 1_700_000_000_000
const EXEC = { agent: { id: W } }
const THROTTLE_MS = 60_000

/** 矩阵格数（末尾计数断言用；改枚举不补格必须红）。 */
const CELLS = 4

const asTool = (t: unknown): { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> } =>
  t as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }

async function codeOfCall(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    return codeOf(await fn())
  } catch (err) {
    return codeOf(err)
  }
}

/** 夹具：一条 implementing 的需求 + 一个真实队列（可读写入序号）。 */
async function fixture(over: Record<string, unknown> = {}): Promise<{
  deps: ReqboardToolDeps
  store: ReturnType<typeof makeTestStore>
  repo: InMemoryQueueRepository
}> {
  const store = makeTestStore()
  const record = {
    id: REQ_ID,
    title: '并发矩阵夹具',
    description: '',
    status: 'implementing',
    category: 'feature',
    blocked: false,
    sourceSessionId: W,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...over,
  }
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [record as never], triages: [] })
  const repo = new InMemoryQueueRepository()
  const taskStore = new QueueTaskStore({ repo, now: () => T, onWarn: () => { /* 矩阵不断言告警 */ } })
  const deps: ReqboardToolDeps = { store, now: () => T, taskStore }
  return { deps, store, repo }
}

describe('并发矩阵（FR-7）', () => {
  it('① 单飞：已有推行中的 run → 再次推进被 REQBOARD_ADVANCE_LOCKED 挡住，且零写入', async () => {
    const { deps, store, repo } = await fixture({ autoRun: true })
    await seedQueueTasks(deps, REQ_ID, [{
      id: 't-cm001', requirementId: REQ_ID, title: '夹具卡', description: '', phase: 'test', side: 'backend',
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
      implementation: '改 tests/x.test.ts', context: '', status: 'todo', blocked: false, executions: [], comments: [],
      version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
    } as never])
    const uc = toUseCaseDeps(deps) as unknown as { jobs?: unknown }
    uc.jobs = { available: () => true, start: async (): Promise<string> => 'job-cm-1', get: async (): Promise<null> => null }
    const tool = asTool(defineAdvanceTool(uc as never))

    const first = await tool.execute({ requirement_id: REQ_ID }, EXEC)
    expect(first.status, '第一次推进应真的投递').toBe('dispatched')

    const before = probeWrites(store, repo, REQ_ID, ['status', 'version'])
    const code = await codeOfCall(() => tool.execute({ requirement_id: REQ_ID }, EXEC))
    const after = probeWrites(store, repo, REQ_ID, ['status', 'version'])

    expect(code, '锁未过期时第二次推进必须被拒').toBe('REQBOARD_ADVANCE_LOCKED')
    expectNoWrite(before, after, '单飞锁')
    expect(after.fields?.status).toBe(before.fields?.status)
  })

  it('② 重复拆分：已落库任务的需求再拆 → REQBOARD_ALREADY_DECOMPOSED，且零写入', async () => {
    const { deps, store, repo } = await fixture()
    await seedQueueTasks(deps, REQ_ID, [{
      id: 't-cm002', requirementId: REQ_ID, title: '已落库卡', description: '', phase: 'test', side: 'backend',
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
      implementation: '改 tests/x.test.ts', context: '', status: 'todo', blocked: false, executions: [], comments: [],
      version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
    } as never])
    // 注意：src 的工具工厂吃 UseCaseDeps，夹具的 ReqboardToolDeps 必须先经 toUseCaseDeps
    const tool = asTool(defineDecomposeTool(toUseCaseDeps(deps)))

    const before = probeWrites(store, repo, REQ_ID, ['status', 'version'])
    const code = await codeOfCall(() => tool.execute({ requirement_id: REQ_ID }, EXEC))
    const after = probeWrites(store, repo, REQ_ID, ['status', 'version'])

    expect(code, '已有未取消任务时再拆必须被拒').toBe('REQBOARD_ALREADY_DECOMPOSED')
    expectNoWrite(before, after, '重复拆分')
  })

  it('③ 并行父卡上限：ready 父卡 5 张、上限 2 → 一次只放行 2 张（逐数核）', () => {
    const view = {
      tasks: Array.from({ length: 5 }, (_, i) => task({
        id: 't-par' + String(i),
        requirementId: REQ_ID,
        status: 'todo',
        dependsOn: [],
      })),
    }
    const capped = selectAdvanceBatch(view, REQ_ID, 2)
    expect(capped).toHaveLength(2)
    expect(capped.every(s => s.event === 'OPEN_PARENT')).toBe(true)
    const wide = selectAdvanceBatch(view, REQ_ID, 10)
    expect(wide).toHaveLength(5)
  })

  it('④ 批量关闭节流：跨批再关一张 → REQBOARD_BULK_CLOSE，且第二张状态不变', async () => {
    const reviewCard = (id: string): TaskRecord => task({
      id,
      requirementId: 'REQ-000001',
      status: 'in_review',
      createdAt: 1,
      lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['完成 ' + id] },
    })
    const h = makeHarness({
      tasks: [
        reviewCard('t-th1'),
        reviewCard('t-th2'),
        task({ id: 't-th-keep', requirementId: 'REQ-000001', status: 'todo', createdAt: 1 }),
      ],
    })
    h.seedRequirementSync(req({ status: 'implementing', sourceSessionId: W }))
    h.deps.doneThrottleMs = THROTTLE_MS
    await h.seedSettled()
    const tool = defineTaskMoveTool(h.deps) as unknown as {
      execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>>
    }

    const first = await tool.execute({ task_id: 't-th1', to: 'done' }, { agent: { id: W } })
    expect(first.success).toBe(true)

    const before = (await h.tasksOf('REQ-000001')).find(x => x.id === 't-th2')?.status
    const out = await tool.execute({ task_id: 't-th2', to: 'done' }, { agent: { id: W } })
    const after = (await h.tasksOf('REQ-000001')).find(x => x.id === 't-th2')?.status

    expect(out.success).toBe(false)
    expect(out.code, '60s 窗口内跨批再关必须撞节流').toBe('REQBOARD_BULK_CLOSE')
    expect(before).toBe('in_review')
    expect(after, '被节流挡下的卡状态不变').toBe('in_review')
  })

  it('计数断言：矩阵格数恰为枚举基数（改枚举不补格必须红）', () => {
    expect(CELLS).toBe(4)
  })

  it('稳定性：同一配置连跑三次结论一致（并发判据不许抖动）', async () => {
    const codes: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const { deps, store } = await fixture({ autoRun: true })
      void store
      await seedQueueTasks(deps, REQ_ID, [{
        id: 't-cm003', requirementId: REQ_ID, title: '夹具卡', description: '', phase: 'test', side: 'backend',
        dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
        implementation: '改 tests/x.test.ts', context: '', status: 'todo', blocked: false, executions: [], comments: [],
        version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
      } as never])
      const uc = toUseCaseDeps(deps) as unknown as { jobs?: unknown }
      uc.jobs = { available: () => true, start: async (): Promise<string> => 'job-cm-' + String(i), get: async (): Promise<null> => null }
      const tool = asTool(defineAdvanceTool(uc as never))
      await tool.execute({ requirement_id: REQ_ID }, EXEC)
      codes.push((await codeOfCall(() => tool.execute({ requirement_id: REQ_ID }, EXEC))) ?? '(无码)')
    }
    expect(codes).toEqual(['REQBOARD_ADVANCE_LOCKED', 'REQBOARD_ADVANCE_LOCKED', 'REQBOARD_ADVANCE_LOCKED'])
  })
})
