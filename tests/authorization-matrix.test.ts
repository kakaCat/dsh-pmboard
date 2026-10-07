/**
 * 越权矩阵（REQ-261006201814-ac4f FR-7）。
 *
 * ## 两层，各有各的作用
 *
 * - **纯函数层**：4 条件（owner / worker / observer / 无席位）× 6 动作 = 24 格，逐格钉死
 *   「可写 / 拒什么码」。这层是授权口径的**单一事实源**（`canWrite`），改枚举漏补格必红。
 * - **工具层**：把纯函数层的结论**落回真实调用**——真的调一次工具，断言三件套
 *   （拒绝码 + 零写入 + 状态不变）。纯函数绿 ≠ 工具真的拦得住，这层就是那道缝的封口。
 *
 * ## 一个必须写下来的口径
 *
 * 「无席位」在纯函数层是 `REQBOARD_NO_SEAT`，但**在工具层落到 `REQBOARD_NO_BOUND_REQ`**：
 * 需求属于别的窗口时它根本不在本窗口的绑定列表里（绑定读先挡）。这不是两套口径，
 * 是两层不同的入口；把两者如实写下来，比强行统一成一个码更诚实。
 *
 * @module dsh-pmboard/tests/authorization-matrix.test
 */
import { describe, expect, it } from 'vitest'
import { InMemoryQueueRepository, makeTestStore } from './application/harness.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { canWrite, type SeatAction } from '../src/application/internal/window.js'
import { defineMoveTool, defineTaskMoveTool, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { probeWrites, expectRejectedWithNoWrite } from './helpers/ledger-probe.js'
import { codeOf } from './helpers/code-trigger-harness.js'
import type { WindowSeat } from '../src/shared/protocol.js'

const W = 'session-az-001'
const OTHER = 'session-az-other'
const REQ_ID = 'REQ-az0001'
const T = 1_700_000_000_000
const EXEC = { agent: { id: W } }

/** 六个动作（与 `SeatAction` 同源）。 */
const ACTIONS: readonly SeatAction[] = [
  'move-requirement', 'confirm-gate', 'submit-artifact', 'claim-task', 'report-task', 'read',
]

/** 四个条件。 */
const CONDITIONS = ['owner', 'worker', 'observer', '无席位'] as const
type Condition = typeof CONDITIONS[number]

/** 期望表：true = 可写；字符串 = 拒绝码。 */
const EXPECTED: Record<Condition, Record<SeatAction, true | string>> = {
  owner: {
    'move-requirement': true, 'confirm-gate': true, 'submit-artifact': true,
    'claim-task': true, 'report-task': true, read: true,
  },
  worker: {
    'move-requirement': 'REQBOARD_SEAT_NOT_OWNER', 'confirm-gate': 'REQBOARD_SEAT_NOT_OWNER',
    'submit-artifact': true, 'claim-task': true, 'report-task': true, read: true,
  },
  observer: {
    'move-requirement': 'REQBOARD_SEAT_READONLY', 'confirm-gate': 'REQBOARD_SEAT_READONLY',
    'submit-artifact': 'REQBOARD_SEAT_READONLY', 'claim-task': 'REQBOARD_SEAT_READONLY',
    'report-task': 'REQBOARD_SEAT_READONLY', read: true,
  },
  无席位: {
    'move-requirement': 'REQBOARD_NO_SEAT', 'confirm-gate': 'REQBOARD_NO_SEAT',
    'submit-artifact': 'REQBOARD_NO_SEAT', 'claim-task': 'REQBOARD_NO_SEAT',
    'report-task': 'REQBOARD_NO_SEAT', read: true,
  },
}

/** 工具层要核的三件套：这两个动作在 observer / 无席位下都必须被拒且零写入。 */
const TOOL_ACTIONS = ['move', 'task_move'] as const

const asTool = (t: unknown): { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> } =>
  t as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }

/** 造一条「W 是某角色」的需求 + 一份真实队列。 */
async function fixture(seat: WindowSeat['role'] | 'none'): Promise<{
  deps: ReqboardToolDeps
  store: ReturnType<typeof makeTestStore>
  repo: InMemoryQueueRepository
}> {
  const seats: WindowSeat[] = seat === 'none'
    ? [{ windowKey: OTHER, role: 'owner', joinedAt: 1 }]
    : [{ windowKey: W, role: seat, joinedAt: 1 }]
  const store = makeTestStore()
  const record = {
    id: REQ_ID, title: '越权矩阵夹具', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: OTHER, seats, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  }
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [record as never], triages: [] })
  const repo = new InMemoryQueueRepository()
  const taskStore = new QueueTaskStore({ repo, now: () => T, onWarn: () => { /* 矩阵不断言告警 */ } })
  const deps: ReqboardToolDeps = { store, now: () => T, taskStore }
  await seedQueueTasks(deps, REQ_ID, [{
    id: 't-az0001', requirementId: REQ_ID, title: '夹具卡', description: '', phase: 'test', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
    implementation: '改 tests/x.test.ts', context: '', status: 'todo', blocked: false, executions: [], comments: [],
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  } as never])
  return { deps, store, repo }
}

describe('越权矩阵（FR-7）', () => {
  it('纯函数层：4 条件 × 6 动作 = 24 格逐格钉死（含计数断言）', () => {
    let cells = 0
    for (const condition of CONDITIONS) {
      const seat: WindowSeat | undefined = condition === '无席位'
        ? undefined
        : { windowKey: W, role: condition, joinedAt: 1 }
      for (const action of ACTIONS) {
        const expected = EXPECTED[condition][action]
        const result = canWrite(seat, action)
        const label = condition + ' × ' + action
        if (expected === true) {
          expect(result.ok, label + ' 应可写').toBe(true)
        } else {
          expect(result.ok, label + ' 应被拒').toBe(false)
          expect(result.ok === false ? result.code : '(可写)', label + ' 的拒绝码').toBe(expected)
        }
        cells += 1
      }
    }
    // 改枚举不补格 → 这条先亮
    expect(cells).toBe(CONDITIONS.length * ACTIONS.length)
    expect(cells).toBe(24)
  })

  it('工具层：observer 下两个写动作都被拒 + 零写入 + 状态不变', async () => {
    for (const which of TOOL_ACTIONS) {
      const { deps, store, repo } = await fixture('observer')
      const tool = asTool(which === 'move' ? defineMoveTool(deps) : defineTaskMoveTool(deps))
      const args = which === 'move'
        ? { requirement_id: REQ_ID, to: 'design', reason: '越权矩阵夹具' }
        : { task_id: 't-az0001', to: 'in_progress', reason: '越权矩阵夹具' }
      const before = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      let code: string | undefined
      try {
        code = codeOf(await tool.execute(args, EXEC))
      } catch (err) {
        code = codeOf(err)
      }
      const after = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      expectRejectedWithNoWrite(code, 'REQBOARD_SEAT_READONLY', before, after, ['status', 'version'],
        'observer × ' + which)
    }
  })

  it('工具层：无席位下两个写动作都被拒（绑定读先挡）+ 零写入 + 状态不变', async () => {
    for (const which of TOOL_ACTIONS) {
      const { deps, store, repo } = await fixture('none')
      const tool = asTool(which === 'move' ? defineMoveTool(deps) : defineTaskMoveTool(deps))
      const args = which === 'move'
        ? { requirement_id: REQ_ID, to: 'design', reason: '越权矩阵夹具' }
        : { task_id: 't-az0001', to: 'in_progress', reason: '越权矩阵夹具' }
      const before = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      let code: string | undefined
      try {
        code = codeOf(await tool.execute(args, EXEC))
      } catch (err) {
        code = codeOf(err)
      }
      const after = probeWrites(store, repo, REQ_ID, ['status', 'version'])
      expectRejectedWithNoWrite(code, 'REQBOARD_NO_BOUND_REQ', before, after, ['status', 'version'],
        '无席位 × ' + which)
    }
  })

  it('工具层：owner 的同一动作**不被越权拦下**（证明上面拒绝来自席位，而不是动作本身做不了）', async () => {
    const { deps } = await fixture('owner')
    const tool = asTool(defineMoveTool(deps))
    let code: string | undefined
    try {
      const out = await tool.execute({ requirement_id: REQ_ID, to: 'design', reason: '越权矩阵夹具' }, EXEC)
      code = codeOf(out)
    } catch (err) {
      code = codeOf(err)
    }
    expect(code, 'owner 不该拿到席位类拒绝码').not.toBe('REQBOARD_SEAT_READONLY')
    expect(code, 'owner 不该拿到席位类拒绝码').not.toBe('REQBOARD_NO_SEAT')
  })
})
