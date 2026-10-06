/**
 * 验收项结果绑定（REQ-261001184609-cecb FR-1 · t1/t2）
 *
 * 目标：验证是执行方的活——agent 提交验收材料时逐项落 result，
 * 弹框随后只问裁决，人不再重抄命令输出。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import {
  defineVerifySubmitTool, defineAcceptSheetTool, queueTasksOf, seedQueueTasks,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import { ACCEPT_ITEM_OPTIONS } from '../src/domain/text/labels.js'
import type { RequirementRecord } from '../src/shared/protocol.js'
import type { VerificationItem as ProtocolItem } from '../src/shared/protocol.js'
import type { VerificationItem as ClientItem } from '../src/client/types.js'

/**
 * 契约**三处同步**锁（REQ-261001184609-cecb t6）：
 * 这个需求的字段散在三处——domain 的 SheetItemLike、protocol.VerificationItem、client/types.VerificationItem。
 * 实测教训：我第一版只改了 domain 那一处，tsc 直接 212→216，弹框拿到的是没有字段的类型。
 * 靠记性必漏，故用类型断言锁死：任一处漏字段，**本文件编译失败**，跑不起来。
 */
type HasAll<T> = 'result' extends keyof T
  ? 'resultSource' extends keyof T
    ? 'needsHuman' extends keyof T
      ? 'humanReason' extends keyof T ? true : never
      : never
    : never
  : never

import { bindItemResults, needsResultInput, humanNotice, itemResultBindingEnabled, type SheetItemLike } from '../src/domain/workflow/AcceptanceSheetSpec.js'

const item = (id: string): SheetItemLike => ({
  id,
  source: { kind: 'requirement', criterion: 'c' } as never,
  criterion: 'c',
  evidence: [],
  status: 'pending',
})

describe('bindItemResults（FR-1 材料即结果）', () => {
  it('A1：<itemId> :: <结果> → 该项 result 落库，来源记为 agent', () => {
    const items = [item('t-abc'), item('t-def')]
    const r = bindItemResults(items, ['t-abc :: npx vitest run x → 6 passed', '其他整单证据'])
    expect(r.bound).toBe(1)
    expect(items[0].result).toBe('npx vitest run x → 6 passed')
    expect(items[0].resultSource).toBe('agent')
    expect(items[1].result).toBeUndefined()
  })

  it('A5：无 :: 的老写法不绑定（整单证据语义不变）', () => {
    const items = [item('t-abc')]
    const r = bindItemResults(items, ['npx vitest run 全绿'])
    expect(r.bound).toBe(0)
    expect(items[0].result).toBeUndefined()
  })

  it('不伪造：键不匹配记入 unmatched，且不改任何项', () => {
    const items = [item('t-abc')]
    const r = bindItemResults(items, ['t-nope :: 结果', ' :: 只有结果', 't-abc :: '])
    expect(r.bound).toBe(0)
    expect(r.unmatched).toEqual(['t-nope'])
    expect(items[0].result).toBeUndefined()
  })

  it('结果超长截断到 500 字符（台账存摘要，不存整屏）', () => {
    const items = [item('t-abc')]
    bindItemResults(items, ['t-abc :: ' + 'x'.repeat(900)])
    expect(items[0].result).toHaveLength(500)
  })
  it('A2：该项已有 agent 结果 → 不再要人填（弹框只问裁决）', () => {
    expect(needsResultInput({ result: 'npx vitest run x → 6 passed' })).toBe(false)
  })

  it('A3：没有结果 → 仍要人填（不冒充已复核）', () => {
    expect(needsResultInput({})).toBe(true)
    expect(needsResultInput({ result: '   ' })).toBe(true)
  })

  it('A4：需人工确认的项永远要人填，且题干带理由', () => {
    expect(needsResultInput({ result: 'agent 看到的不算', needsHuman: true })).toBe(true)
    expect(humanNotice({ needsHuman: true, humanReason: '界面视觉' })).toBe('需人工确认：界面视觉')
    expect(humanNotice({ needsHuman: true })).toBe('需人工确认')
    expect(humanNotice({})).toBe('')
  })
  it('A6：人填过的结果不被 agent 回填覆盖（证据只增不减）', () => {
    const items = [item('t-abc')]
    items[0].result = '人工复核：界面看起来对'
    items[0].resultSource = 'human'
    const r = bindItemResults(items, ['t-abc :: agent 的命令输出'])
    expect(r.bound).toBe(0)
    expect(items[0].result).toBe('人工复核：界面看起来对')
    expect(items[0].resultSource).toBe('human')
  })

  it('A7：回滚开关关掉后不自动回填（回到旧口径）', () => {
    expect(itemResultBindingEnabled({})).toBe(true)
    expect(itemResultBindingEnabled({ DSH_REQBOARD_NO_ITEM_RESULT: '1' })).toBe(false)
    expect(itemResultBindingEnabled({ DSH_REQBOARD_NO_ITEM_RESULT: 'false' })).toBe(true)
  })
  it('A8：契约三处同步（domain / protocol / client）——任一处漏字段则本文件编译失败', () => {
    const p: HasAll<ProtocolItem> = true
    const c: HasAll<ClientItem> = true
    const d: HasAll<SheetItemLike> = true
    expect([p, c, d]).toEqual([true, true, true])
  })
})

/* ------------------------------------------------------------------------- */
/* REQ-261006092213-4f5b t6：迁移与兼容（老写法 / 回滚开关 / 存量单据）        */
/*   同一文件内**同时**断言新旧两种口径（设计 test-cases.md 判据自身纪律）      */
/* ------------------------------------------------------------------------- */

const W = 'session-vir-001'
const REQ_ID = 'REQ-vir001'
const PASS = ACCEPT_ITEM_OPTIONS.pass
let dir: string
let store: ReturnType<typeof makeTestStore>
let deps: ReqboardToolDeps

const verifyTool = () => defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })
const sheetOf = async () => (await store.get(REQ_ID))!.verification!.sheet!
function sheetTool(answers: any[] | any[][]) {
  const queue: any[][] = Array.isArray(answers) && Array.isArray((answers as any[])[0])
    ? [...(answers as any[][])]
    : [answers as any[]]
  deps.userQuestions = () => ({ ask: async () => ({ answers: queue.shift() ?? [] }) })
  return defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}
async function fullResults(): Promise<any[]> {
  const tasks = await queueTasksOf(deps, REQ_ID)
  return [
    ...tasks.filter(t => t.parentId === undefined)
      .map(t => ({ ref: { kind: 'task', taskId: t.id }, result: 'agent 实测：npx vitest run tests/x.test.ts → 全绿' })),
    { ref: { kind: 'requirement' }, result: '交付结论：证据齐全' },
  ]
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-vir-'))
  store = makeTestStore()
  deps = { store, now: () => Date.now() }
  const r = {
    id: REQ_ID, title: '兼容与回滚', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  await seedQueueTasks(deps, REQ_ID, Array.from({ length: 3 }, (_, i) => ({
    id: 't-vr000' + (i + 1), requirementId: REQ_ID, title: '任务' + (i + 1), description: '',
    phase: 'implement' as const, side: 'backend' as const, dependsOn: [],
    scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + (i + 1),
    implementation: '改 x' + (i + 1), context: '', status: 'done' as const, blocked: false,
    executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  })))
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('A7 / FR-8：老写法与回滚开关（工具级新旧两种口径）', () => {
  it('新口径：带 results 提交 → coverage=complete，项带 agent 结果', async () => {
    const out = await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResults() })
    expect(out.success).toBe(true)
    expect(out.results_coverage).toBe('complete')
    expect((await sheetOf()).items.filter(i => i.source.kind === 'task').every(i => i.resultSource === 'agent')).toBe(true)
  })

  it('老写法：不带 results → 提交成功、coverage=legacy、项无 result（整单证据语义不变）', async () => {
    const out = await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.success).toBe(true)
    expect(out.results_coverage).toBe('legacy')
    expect(out.results_bound).toBe(0)
    expect((await sheetOf()).items.every(i => i.result === undefined)).toBe(true)
  })

  it('老写法文本键未命中 → 进 results_unmatched（不再静默）', async () => {
    const out = await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿', 'v9-99 :: 文本结果'] })
    expect(out.success).toBe(true)
    expect(out.results_unmatched).toEqual(['v9-99'])
  })

  it('回滚开关置 1 → 结构化绑定关闭（传了 results 也吃 legacy），裁决走 evidence[0] 旧口径', async () => {
    const prev = process.env.DSH_REQBOARD_NO_ITEM_RESULT
    process.env.DSH_REQBOARD_NO_ITEM_RESULT = '1'
    try {
      const out = await run(verifyTool(), {
        summary: '交付', evidence: ['整单证据：npx vitest run 全绿'], results: await fullResults(),
      })
      expect(out.success).toBe(true)
      expect(out.results_coverage).toBe('legacy')
      expect(out.results_bound).toBe(0)

      const target = (await sheetOf()).items[0]!
      await run(sheetTool([{ id: target.id, selected: [PASS] }]), { batch_size: 10 })
      const item = (await sheetOf()).items.find(i => i.id === target.id)!
      expect(item.status).toBe('passed')
      expect(item.opinion).toBe('整单证据：npx vitest run 全绿') // 旧口径：整单证据兜底
      expect(item.result).toBeUndefined() // 开关下不写 result（旧口径从不写）
    } finally {
      if (prev === undefined) delete process.env.DSH_REQBOARD_NO_ITEM_RESULT
      else process.env.DSH_REQBOARD_NO_ITEM_RESULT = prev
    }
  })

  it('存量在册验收单不回写：上一版验收单快照在重交前后逐字相等（进 sheetHistory 而非被改写）', async () => {
    await run(verifyTool(), { summary: '交付 1', evidence: ['npx vitest run 全绿'] })
    const before = JSON.stringify((await store.get(REQ_ID))!.verification!.sheet)
    await run(verifyTool(), { summary: '交付 2', evidence: ['npx vitest run 全绿'], results: await fullResults() })
    const hist = (await store.get(REQ_ID))!.verification!.sheetHistory ?? []
    expect(hist.length).toBeGreaterThan(0)
    expect(JSON.stringify(hist[hist.length - 1])).toBe(before)
  })
})
