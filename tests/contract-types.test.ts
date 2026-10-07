/**
 * 契约类型门禁（REQ-261007100513-6749 t1「定死接口与数据契约」/ t-7e85ab 研发段）。
 *
 * 契源：design/interfaces.md §接口清单 I-1~I-5 + §新增的内部接口（端口与纯函数）
 *       · design/data-model.md §新增/修改的数据结构 + §兼容性分析「必改清单」。
 *
 * 本卡只立契约、不含实现。三条断言与验收标准逐条对应：
 *   ① `VolatileNoticePort.notify` 存在且返回 `Promise<NoticeDeliveryResult>`（类型层精确形状 +
 *      运行期 fake 走一遍成功路径；并做源码级断言：契约注释里的「永不抛」被删即红）；
 *   ② `TaskRecord.budgetRequests` **可选**，缺省读取不报错（`undefined`，**不是 0**）；
 *   ③ 该字段**不在** `REQUIRED_TASK_FIELDS` 里（既不进必填清单，也不影响队列校验）。
 *
 * 另钉死三处「不测就会漂移」的镜像（都是"同一份口径只能有一处声明"的落点）：
 *   · 树节点：`protocol.TaskTreeNodeView` ↔ `use-cases/TaskTree.TaskTreeNodeView`
 *     （协议层禁止 import use-cases，只能镜像 → 用双向 `toEqualTypeOf` 兜住）；
 *   · 预算覆盖值：宿主 `TaskRecord` ↔ 客户端 `client/types.ts` 的镜像；
 *   · 逐项结果 / 预算运行态：字段表与 data-model.md 逐字一致。
 *
 * **为什么 ③ 不 import 那个常量**：`REQUIRED_TASK_FIELDS` 是 `validateQueue.ts` 的**内部**清单
 * （非导出符号），而本卡的文件集不含 `validateQueue.ts`（"不要动它"也是设计要求）。
 * 故改用两条互补断言：**读源文字面量**（清单里没有 `budgetRequests`）+ **跑真校验**
 * （缺该字段的卡仍 `passed=true`）——有人把它加进清单时，两条同时红。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  NoticeDeliveryResult,
  SubtaskBudgetState,
  TaskMoveItemResult,
  TaskRecord,
  TaskTreeNodeView,
  TaskTreeSummary,
  VolatileNoticeKind,
} from '../src/shared/protocol.js'
import type { SubtaskBudgetPort, VolatileNoticePort } from '../src/application/ports.js'
import type { TaskTreeView } from '../src/application/use-cases/TaskTree.js'
import type { TaskRecord as ClientTaskRecord } from '../src/client/types.js'
import { validateQueueFile } from '../src/domain/queue/validateQueue.js'
import { REQ, mkTask, queueOf } from './queue/fixtures.js'

const PORTS_SRC = fileURLToPath(new URL('../src/application/ports.ts', import.meta.url))
const VALIDATE_QUEUE_SRC = fileURLToPath(new URL('../src/domain/queue/validateQueue.ts', import.meta.url))

/**
 * 抽出 `src` 里 `declMarker` 声明**赋值**的那个 `[...]` 字面量原文（按括号配对取，不看类型标注里的 `[]`）。
 * 抽不到 = 响亮抛错（**不返回空串**：空串会让 `not.toContain` 恒真 ⇒ 假绿）。
 */
function literalOf(src: string, declMarker: string): string {
  const decl = src.indexOf(declMarker)
  if (decl < 0) throw new Error('抽不到声明：' + declMarker)
  const open = src.indexOf('= [', decl)
  if (open < 0) throw new Error('抽不到赋值处的数组字面量：' + declMarker)
  let depth = 0
  for (let i = open + 2; i < src.length; i++) {
    if (src[i] === '[') depth += 1
    else if (src[i] === ']') {
      depth -= 1
      if (depth === 0) return src.slice(open + 2, i + 1)
    }
  }
  throw new Error('数组字面量没有闭合：' + declMarker)
}

const NODE: TaskTreeNodeView = {
  id: 't-000001',
  title: '父卡样本',
  status: 'in_progress',
  role: 'parent',
  dependsOn: [],
  cardDoc: 'docs/requirements/REQ-x/tasks/t-000001.md',
  footprintState: 'undeclared',
}

const CHILD: TaskTreeNodeView = {
  id: 't-000002',
  title: '子卡样本',
  status: 'todo',
  role: 'subtask',
  stageKind: 'dev',
  dependsOn: [],
  attempt: 0,
  cardDoc: 'docs/requirements/REQ-x/tasks/t-000002.md',
  footprintState: 'undeclared',
}

describe('① I-2 投递端口：notify 存在且返回 Promise<NoticeDeliveryResult>', () => {
  it('类型层：端口只有 notify 一个成员，签名逐字一致', () => {
    expectTypeOf<keyof VolatileNoticePort>().toEqualTypeOf<'notify'>()
    expectTypeOf<VolatileNoticePort['notify']>().toEqualTypeOf<
      (windowKey: string, kind?: VolatileNoticeKind) => Promise<NoticeDeliveryResult>
    >()
  })

  it('运行期：fake 走通尾部通道成功路径；三态（可用/降级/去重）都判得出', async () => {
    const calls: { windowKey: string; kind?: VolatileNoticeKind }[] = []
    const fake: VolatileNoticePort = {
      async notify(windowKey, kind) {
        calls.push(kind === undefined ? { windowKey } : { windowKey, kind })
        return { delivered: true, channel: 'inbox-next-step' }
      },
    }

    const result: NoticeDeliveryResult = await fake.notify('session-abc123', 'status')
    const withoutKind = await fake.notify('session-abc123')

    expect(result).toEqual({ delivered: true, channel: 'inbox-next-step' })
    expect(Object.keys(result).sort()).toEqual(['channel', 'delivered'])
    expect(withoutKind.delivered).toBe(true)
    expect(calls).toEqual([
      { windowKey: 'session-abc123', kind: 'status' },
      { windowKey: 'session-abc123' },
    ])

    // 三态（design/interfaces.md §端口失败语义）：降级仍算"投递过"，去重命中才是 false
    const degraded: NoticeDeliveryResult = {
      delivered: true,
      channel: 'system-prompt-fallback',
      reason: '窗口 session-abc123 不在线',
    }
    const deduped: NoticeDeliveryResult = { delivered: false, channel: 'inbox-next-step', reason: '内容未变' }
    expect([degraded.channel, deduped.delivered]).toEqual(['system-prompt-fallback', false])

    expectTypeOf<NoticeDeliveryResult>().toEqualTypeOf<{
      delivered: boolean
      channel: 'inbox-next-step' | 'system-prompt-fallback'
      reason?: string
    }>()
  })

  it('契约注释写明「永不抛」（源码级：注释被删/被改写即红）', () => {
    const src = readFileSync(PORTS_SRC, 'utf8')
    const decl = src.indexOf('export interface VolatileNoticePort')
    expect(decl, '抽不到 VolatileNoticePort 声明').toBeGreaterThanOrEqual(0)
    const block = src.slice(decl, src.indexOf('\n}', decl))
    expect(block).toContain('永不抛')
    expect(block).toContain('Promise<NoticeDeliveryResult>')
  })
})

describe('② FR-6 TaskRecord.budgetRequests：可选，缺省读取不报错', () => {
  it('类型层：number | undefined；客户端镜像同名字段逐字一致', () => {
    expectTypeOf<TaskRecord['budgetRequests']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ClientTaskRecord['budgetRequests']>().toEqualTypeOf<TaskRecord['budgetRequests']>()
  })

  it('运行期：存量卡（无该字段）读出 undefined 且键不存在；有覆盖值读回原值', () => {
    const legacy: TaskRecord = mkTask('t-000001')
    expect(legacy.budgetRequests).toBeUndefined()
    expect('budgetRequests' in legacy).toBe(false)

    const overridden: TaskRecord = { ...mkTask('t-000002'), budgetRequests: 30 }
    expect(overridden.budgetRequests).toBe(30)

    // 纯加法：两张卡**只差这一个键**（其余字段逐字同源）——加字段不许带出别的形状变化
    const keysOf = (t: TaskRecord): string[] =>
      Object.keys(t).filter((k) => k !== 'id' && k !== 'budgetRequests').sort()
    expect(keysOf(overridden)).toEqual(keysOf(legacy))
  })
})

describe('③ budgetRequests 不在 REQUIRED_TASK_FIELDS（design/backend.md §改动点清单第 4 条）', () => {
  it('清单源码里没有 budgetRequests（附反向自检，防抽错位置造成假绿）', () => {
    const literal = literalOf(readFileSync(VALIDATE_QUEUE_SRC, 'utf8'), 'const REQUIRED_TASK_FIELDS')
    // 反向自检：抽出来的确实就是那份清单（首尾两项在场）
    expect(literal).toContain("'id'")
    expect(literal).toContain("'updatedBy'")
    expect(literal).not.toContain('budgetRequests')
  })

  it('行为面：缺该字段 / 带该字段的卡都过校验（必填判据不看它）', () => {
    const files = [
      queueOf(REQ, [mkTask('t-000001')]),
      queueOf(REQ, [{ ...mkTask('t-000001'), budgetRequests: 10 }]),
    ]
    for (const file of files) {
      const result = validateQueueFile(file)
      expect(result.issues.filter((i) => (i.path ?? '').includes('budgetRequests'))).toEqual([])
      expect(result.passed).toBe(true)
    }
  })
})

describe('I-1 回执：逐项结果与树摘要（data-model.md §逐项结果与树摘要类型）', () => {
  it('tree：节点与 use-cases/TaskTree.ts 逐字一致（协议层禁止 import use-cases，故镜像 + 断言防漂移）', () => {
    expectTypeOf<TaskTreeView['parent']>().toEqualTypeOf<TaskTreeNodeView>()
    expectTypeOf<TaskTreeView['subtasks'][number]>().toEqualTypeOf<TaskTreeNodeView>()

    const tree: TaskTreeSummary = {
      parents: [{ parent: NODE, subtasks: [CHILD], note: '子卡链 1 张，已完成 0 张' }],
    }
    expect(tree.parents[0]?.parent.role).toBe('parent')
    expect(tree.parents[0]?.subtasks[0]?.stageKind).toBe('dev')
    expect(tree.parents[0]?.subtasks[0]?.footprintState).toBe('undeclared')
  })

  it('results[]：既有拒绝码逐字透传，字段表与 data-model 一致（不新造码、不新造信封）', () => {
    const failed: TaskMoveItemResult = {
      task_id: 't-000001',
      ok: false,
      code: 'REQBOARD_STALE_BUILD',
      error: 'REQBOARD_STALE_BUILD：客户端产物陈旧',
      throttleRemainingMs: 42_000,
    }
    expect(Object.keys(failed).sort()).toEqual(['code', 'error', 'ok', 'task_id', 'throttleRemainingMs'])
    expect(failed.code?.startsWith('REQBOARD_')).toBe(true)

    const done: TaskMoveItemResult = { task_id: 't-000002', ok: true, from: 'in_review', to: 'done', status: 'done', version: 7 }
    expect(done.from).toBe('in_review')

    expectTypeOf<TaskMoveItemResult>().toEqualTypeOf<{
      task_id: string
      ok: boolean
      from?: TaskRecord['status']
      to?: TaskRecord['status']
      status?: TaskRecord['status']
      version?: number
      code?: string
      error?: string
      throttleRemainingMs?: number
    }>()
  })
})

describe('FR-6 预算运行态：SubtaskBudgetState + 窄端口读写面', () => {
  it('字段表与 data-model.md §运行态文件 1 一致；端口只有 read/write 两个方法', async () => {
    const state: SubtaskBudgetState = {
      v: 1,
      tasks: {
        't-000001': { windowIndex: 0, used: 3, limit: 3, windowStartAt: 1_790_262_000_000 },
        't-000002': { windowIndex: 1, used: 0, limit: 60, windowStartAt: 1_790_262_000_000, reportedAt: 1_790_262_500_000 },
      },
    }
    expect(Object.keys(state).sort()).toEqual(['tasks', 'v'])
    expect(Object.keys(state.tasks['t-000001']!).sort()).toEqual(['limit', 'used', 'windowIndex', 'windowStartAt'])
    expect(state.tasks['t-000001']!.reportedAt).toBeUndefined()

    const written: SubtaskBudgetState[] = []
    const fake: SubtaskBudgetPort = {
      read: async () => state,
      write: async (next) => { written.push(next) },
    }
    expectTypeOf<keyof SubtaskBudgetPort>().toEqualTypeOf<'read' | 'write'>()
    // 计数不可得 = undefined（**不是** 0 起算的假态）——降级判据在用例侧，端口只如实回报
    expect(await fake.read()).toEqual(state)
    await fake.write(state)
    expect(written).toHaveLength(1)
  })
})
