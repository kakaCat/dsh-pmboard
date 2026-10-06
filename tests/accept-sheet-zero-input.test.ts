/**
 * 零输入裁决与底线（REQ-261006092213-4f5b FR-3 / FR-4 / FR-6 · D-1 / D-5）serves: FR-3, FR-4, FR-6
 *
 * 三件事各有独立用例（判据 A2 / A5 / A4）：
 *   ① **有结果的项只收 1 问**，人零输入点通过即 `passed` 且 `opinion === result`（D-5 零输入通过）；
 *   ② **人改了输入框** → `result` 更新为人的文本、`resultSource === 'human'`（FR-4 来源可辨）；
 *   ③ **无结果的项**零输入点通过 → `unverified`（不计入通过），且**不触发**「验收通过并归档」。
 *
 * 为什么这些用例以前测不出来：`resultOf` 有 `evidence[0]` 兜底 ⇒ 项永远"有结果"，
 * `unverified` 恒不可达（底线形同不存在）。本需求去掉兜底后它才第一次可测（UC-5）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defineVerifySubmitTool, defineAcceptSheetTool, queueTasksOf, seedQueueTasks,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import { ACCEPT_ITEM_OPTIONS } from '../src/domain/text/labels.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-zero-001'
const REQ_ID = 'REQ-zero01'
const PASS = ACCEPT_ITEM_OPTIONS.pass

let dir: string
let store: ReturnType<typeof makeTestStore>
let deps: ReqboardToolDeps
/** 本次弹框实际问出去的题（含 id 与题干），用于断言"只问 1 问"。 */
let asked: { id?: string; header?: string; question?: string }[] = []

/** 假弹框：answers 为批次队列（每次 ask 消费一批），并记录问出去的每一题。 */
function sheetTool(answers: any[] | any[][]) {
  const queue: any[][] = Array.isArray(answers) && Array.isArray((answers as any[])[0])
    ? [...(answers as any[][])]
    : [answers as any[]]
  const ask = async (req: { questions: { id?: string; header?: string; question?: string }[] }) => {
    asked.push(...(req?.questions ?? []))
    return { answers: queue.shift() ?? [] }
  }
  deps.userQuestions = () => ({ ask })
  return defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}
const verifyTool = () => defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })
const sheetOf = async () => (await store.get(REQ_ID))!.verification!.sheet!

/** 可预见项全覆盖（3 张顶层卡 + 1 条需求级）——用于让项带上 agent 实测结果。 */
async function fullResults(): Promise<any[]> {
  const tasks = await queueTasksOf(deps, REQ_ID)
  return [
    ...tasks.filter(t => t.parentId === undefined)
      .map(t => ({ ref: { kind: 'task', taskId: t.id }, result: 'npx vitest run tests/x.test.ts → 全绿' })),
    { ref: { kind: 'requirement' }, result: '交付结论：证据齐全、与设计一致' },
  ]
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-zero-'))
  store = makeTestStore()
  deps = { store, now: () => Date.now() }
  asked = []
  const r = {
    id: REQ_ID, title: '零输入裁决', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  await seedQueueTasks(deps, REQ_ID, Array.from({ length: 3 }, (_, i) => ({
    id: 't-zr000' + (i + 1), requirementId: REQ_ID, title: '任务' + (i + 1), description: '',
    phase: 'implement' as const, side: 'backend' as const, dependsOn: [],
    scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + (i + 1),
    implementation: '改 x' + (i + 1), context: '', status: 'done' as const, blocked: false,
    executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  })))
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('REQ-261006092213-4f5b 零输入裁决与底线', () => {
  it('A2：有 agent 实测结果的项只收 1 问；零输入点通过 → passed 且 opinion === result', async () => {
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResults() })
    const target = (await sheetOf()).items.find(i => (i.result ?? '').length > 0)!
    expect(target, '提交后应至少有一项带 agent 实测结果').toBeDefined()

    const out = await run(sheetTool([{ id: target.id, selected: [PASS] }]), { batch_size: 10 })
    expect(out.recorded).toBe(1)

    // 只问 1 问：该项的「实际结果」第 2 问不再出现（`<id>#result`）
    expect(asked.filter(q => q.id === target.id)).toHaveLength(1)
    expect(asked.some(q => q.id === target.id + '#result')).toBe(false)

    const item = (await sheetOf()).items.find(i => i.id === target.id)!
    expect(item.status).toBe('passed')
    expect(item.opinion).toBe(item.result)
    expect(item.resultSource).toBe('agent') // 零输入不改来源：结果仍是 agent 的
    expect(item.decidedBy?.kind).toBe('human')
  })

  it('FR-4：人改了输入框 → result 更新为人的文本且 resultSource=human', async () => {
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResults() })
    const target = (await sheetOf()).items.find(i => (i.result ?? '').length > 0)!
    const edited = '我复跑了一遍：npx vitest run tests/x.test.ts → 12 passed'

    await run(sheetTool([{ id: target.id, selected: [PASS], custom: edited }]), { batch_size: 10 })

    const item = (await sheetOf()).items.find(i => i.id === target.id)!
    expect(item.status).toBe('passed')
    expect(item.result).toBe(edited)
    expect(item.resultSource).toBe('human')
    expect(item.opinion).toBe(edited)
  })

  it('A5：无结果的项零输入点通过 → unverified（不计入通过），且不弹「验收通过并归档」', async () => {
    // 老写法提交（不带 results）→ 项没有 result
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = await sheetOf()
    expect(sheet.items).toHaveLength(4) // 3 任务 + 1 需求级
    expect(sheet.items.every(i => i.result === undefined)).toBe(true)

    const out = await run(sheetTool([sheet.items.map(i => ({ id: i.id, selected: [PASS] }))]), { batch_size: 10 })

    expect(out.unverified).toBe(4)
    expect(out.passed).toBe(0)
    const after = await sheetOf()
    expect(after.items.every(i => i.status === 'unverified')).toBe(true)
    // 走到这一步的前置：全部 pending 被点成了 unverified ⇒ 「全部通过」的确认不得弹出
    expect(asked.some(q => q.id === 'final-pass')).toBe(false)
    expect(out.archived).toBeFalsy()
    expect((await store.get(REQ_ID))!.status).toBe('accepting') // 未归档
  })

  it('A5：全项 unverified 时 RTM 门禁不算 passed（未复核项不冒充放行）', async () => {
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = await sheetOf()
    const out = await run(sheetTool([sheet.items.map(i => ({ id: i.id, selected: [PASS] }))]), { batch_size: 10 })
    expect(out.gate_status).toBe('pending')
    expect(out.archived).toBe(false)
  })

  it('B1：needsHuman 项零输入点通过 → unverified（不吃 result 兜底，FR-5 唯一要人动手的分支）', async () => {
    // `result` 对 needsHuman 项只是"供人参照"的材料（data-model.md：两者可并存），
    // 判定依据在人眼里——否则「形式合规冒充实质合规」会在最该拦住的地方重演。
    const all = await fullResults()
    all[0] = {
      ref: all[0].ref, result: 'agent 参照结果：需人对照原型',
      needsHuman: true, humanReason: '界面视觉需人对照权威原型',
    }
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'], results: all })
    const target = (await sheetOf()).items.find(i => i.needsHuman === true)!
    expect(target.result).toBe('agent 参照结果：需人对照原型')

    const out = await run(sheetTool([{ id: target.id, selected: [PASS] }]), { batch_size: 10 })
    expect(out.recorded).toBe(1)
    expect(asked.some(q => q.id === target.id + '#result'), 'needsHuman 项必须保留第 2 问').toBe(true)
    expect((await sheetOf()).items.find(i => i.id === target.id)!.status).toBe('unverified')
  })

  it('C1：未复核项会被重新问一遍（补上实际结果即转通过），不留「反复调用却不动」的死结', async () => {
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] }) // 老写法：项无 result
    const ids = (await sheetOf()).items.map(i => i.id)
    await run(sheetTool([ids.map(id => ({ id, selected: [PASS] }))]), { batch_size: 10 })
    expect((await sheetOf()).items.every(i => i.status === 'unverified')).toBe(true)

    asked = []
    const out = await run(sheetTool([[
      { id: ids[0], selected: [PASS] },
      { id: ids[0] + '#result', custom: '补：npx vitest run → 6 passed' },
    ]]), { batch_size: 10 })
    expect(asked.some(q => q.id === ids[0]), '未复核项必须重新进弹框批次').toBe(true)
    expect(out.recorded).toBe(1)
    const item = (await sheetOf()).items.find(i => i.id === ids[0])!
    expect(item.status).toBe('passed')
    expect(item.opinion).toBe('补：npx vitest run → 6 passed')
    expect(item.result).toBe('补：npx vitest run → 6 passed')
    expect(item.resultSource).toBe('human')
  })

  it('S1：回滚开关生效 → 裁决整段回到旧口径（evidence[0] 兜底，不看 result）', async () => {
    const prev = process.env.DSH_REQBOARD_NO_ITEM_RESULT
    process.env.DSH_REQBOARD_NO_ITEM_RESULT = '1'
    try {
      // 开关下提交：结构化绑定整段跳过（即使传了 results）
      const sub = await run(verifyTool(), {
        summary: '交付', evidence: ['整单证据：npx vitest run 全绿'], results: await fullResults(),
      })
      expect(sub.results_coverage).toBe('legacy')
      const target = (await sheetOf()).items[0]!
      expect(target.result).toBeUndefined()

      await run(sheetTool([{ id: target.id, selected: [PASS] }]), { batch_size: 10 })
      const item = (await sheetOf()).items.find(i => i.id === target.id)!
      expect(item.status).toBe('passed')
      expect(item.opinion).toBe('整单证据：npx vitest run 全绿') // 旧口径：整单证据兜底
    } finally {
      if (prev === undefined) delete process.env.DSH_REQBOARD_NO_ITEM_RESULT
      else process.env.DSH_REQBOARD_NO_ITEM_RESULT = prev
    }
  })

  it('S1：先带 results 提交 → 再翻开关 → 裁决走 evidence[0]（判别性形态：覆盖已落章的结果）', async () => {
    // 判别性关键：项上**已经有** agent 的 `result`——只测"开关下提交"的话，`result` 恒为 undefined，
    // 旧代码也会通过（复核指出该用例不具判别性）。这里按真回归形态：先落章、再翻开关。
    await run(verifyTool(), { summary: '交付', evidence: ['整单证据 ev0：npx vitest run 全绿'], results: await fullResults() })
    const target = (await sheetOf()).items[0]!
    expect(target.result).toBe('npx vitest run tests/x.test.ts → 全绿')

    const prev = process.env.DSH_REQBOARD_NO_ITEM_RESULT
    process.env.DSH_REQBOARD_NO_ITEM_RESULT = '1'
    try {
      await run(sheetTool([{ id: target.id, selected: [PASS] }]), { batch_size: 10 })
      const item = (await sheetOf()).items.find(i => i.id === target.id)!
      expect(item.status).toBe('passed')
      expect(item.opinion).toBe('整单证据 ev0：npx vitest run 全绿')
      // 开关下不写 human：`evidence[0]` 是**系统回填**，冒名人工会污染来源可辨性
      expect(item.resultSource).toBe('agent')
    } finally {
      if (prev === undefined) delete process.env.DSH_REQBOARD_NO_ITEM_RESULT
      else process.env.DSH_REQBOARD_NO_ITEM_RESULT = prev
    }
  })

  it('S3：系统项的处置意见不写进 result、也不标 human（处置 ≠ 实测结果）', async () => {
    // 第二次提交后需求已有产物 ⇒ 追加一条「不可照着验」系统项（不可预见项，豁免逐项交代）
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sys = (await sheetOf()).items.find(i => i.criterion.startsWith('验收项不可照着验'))!
    expect(sys).toBeDefined()

    await run(sheetTool([{ id: sys.id, selected: [PASS], custom: '不适用：历史数据，已人工确认' }]), { batch_size: 10 })
    const after = (await sheetOf()).items.find(i => i.id === sys.id)!
    expect(after.status).toBe('passed')
    expect(after.opinion).toBe('不适用：历史数据，已人工确认')
    expect(after.result).toBeUndefined()
    expect(after.resultSource).toBeUndefined()
  })
})
