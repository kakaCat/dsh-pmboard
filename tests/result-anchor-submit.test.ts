/**
 * 提交侧锚点体检（REQ-261007160829-1991 · FR-1 · design S-3 / interfaces I-5）。
 *
 * serves: FR-1 · covers: t-80b0dc, t-269ffb（锚点体检入桶 + 提交侧拒绝分支）
 * （验收期补：原文件只在正文写了 FR-1、没写 `serves:` 标注，被孤儿用例门点名；按仓内
 *  「测试文件头部声明覆盖」的体例补齐。**只加注释**，未改用例、未改实现。）
 *
 * 病根：agent 交上来的 `result` 没有可核验锚点（命令 / 路径 / 明确计数）也照样进验收单，
 * 直到人点「通过」才被静默降级成 `unverified`。本卡在**提交侧体检**里把它识别出来（只入桶，
 * **本卡不做拒绝**——拒绝是 `bindStructuredResults` 的另一张卡）。
 *
 * 本文件先写用例、后落实现（TDD）。两条纪律：
 *   · 入桶条件逐条对齐 S-3：命中项 → `needsHuman !== true` → 非系统项 → 文本非空 → `!hasResultAnchor`；
 *   · 判据只允许一处：锚点判定一律走 `AcceptanceSheetSpec.hasResultAnchor`（本模块不另写正则）。
 *
 * 既有桶（unmatched / duplicate / invalid / empty / conflict / missing）在这批输入下行为不变，
 * 每条用例都顺带钉住——`unanchored` 只新增，不改旧行为。
 *
 * 本文件下方另有一节**端到端**用例（拒绝卡 REQ-261007160829-1991 的 I-6 落地）：桶只是入桶，
 * 「桶 → 拒绝码」的映射与「拒绝时台账零改动」只有走真实入口才观察得到（见那节的头注释）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { defineVerifySubmitTool, queueTasksOf, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'
import {
  isForeseeableItem,
  matchStructuredResults,
  type ResultRefInput,
} from '../src/domain/workflow/ResultBinding.js'
import {
  ANCHOR_GAP_PREFIX,
  REQUIREMENT_LEVEL_CRITERION,
  hasResultAnchor,
  isSystemItem,
  buildSheet,
  type SheetItemLike,
  type VerificationItemSource,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'

const item = (id: string, source: VerificationItemSource, extra: Partial<SheetItemLike> = {}): SheetItemLike => ({
  id,
  source,
  criterion: '判据',
  evidence: [],
  status: 'pending',
  ...extra,
})

const r = (ref: VerificationItemSource, extra: Partial<ResultRefInput> = {}): ResultRefInput => ({ ref, ...extra })

/** 用例里选用的「无锚点」文本必须**真的**没有锚点——否则用例本身是假绿（判据只许走 hasResultAnchor）。 */
const NO_ANCHOR = '跑过了，没问题'
const ANCHOR_CMD = 'npx vitest run tests/x.test.ts → 10 passed'
const ANCHOR_PATH = '证据：docs/reports/verify.md'
const ANCHOR_COUNT = '通过 12 项，失败 0 项'

const build = (input: Partial<Parameters<typeof buildSheet>[0]> = {}) => buildSheet({
  sheetHistoryLength: 0,
  tasks: [],
  evidence: ['整单证据'],
  generatedAt: 1,
  generatedBy: { kind: 'agent', sessionId: 'w' },
  ...input,
}).sheet

describe('前置：所选文本的锚点属性（防假绿）', () => {
  it('「无锚点」样例确实判否；三类锚点样例确实判真', () => {
    expect(hasResultAnchor(NO_ANCHOR)).toBe(false)
    expect(hasResultAnchor('界面看起来对齐')).toBe(false)
    expect(hasResultAnchor(ANCHOR_CMD)).toBe(true)
    expect(hasResultAnchor(ANCHOR_PATH)).toBe(true)
    expect(hasResultAnchor(ANCHOR_COUNT)).toBe(true)
  })
})

describe('S-3 入桶：普通项结果没有可核验锚点', () => {
  it('任务项无锚点 → 入 unanchored，元素文案照 I-5（含「锚点」）', () => {
    const items = [item('v1-1', { kind: 'task', taskId: 't-aaa' })]
    const report = matchStructuredResults(items, [r({ kind: 'task', taskId: 't-aaa' }, { result: NO_ANCHOR })])

    expect(report.unanchored).toEqual([
      'task:t-aaa（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）',
    ])
    expect(report.unanchored[0]).toContain('锚点')
    // 只入桶、不拒绝：命中口径与既有桶都不受影响
    expect(report.matched).toBe(1)
    expect(report.missing).toEqual([])
    expect(report.unmatched).toEqual([])
    expect(report.duplicate).toEqual([])
    expect(report.invalid).toEqual([])
    expect(report.empty).toEqual([])
    expect(report.conflict).toEqual([])
  })

  it('需求级项无锚点 → 入桶（标签 = requirement）', () => {
    const items = [item('v1-1', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION })]
    const report = matchStructuredResults(items, [r({ kind: 'requirement' }, { result: NO_ANCHOR })])

    expect(report.unanchored).toEqual([
      'requirement（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）',
    ])
    expect(report.matched).toBe(1)
  })

  it('逐条点名：两条无锚点各自入桶，带锚点的那条不入桶', () => {
    const items = [
      item('v1-1', { kind: 'task', taskId: 't-aaa' }),
      item('v1-2', { kind: 'task', taskId: 't-bbb' }),
      item('v1-3', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
    ]
    const report = matchStructuredResults(items, [
      r({ kind: 'task', taskId: 't-aaa' }, { result: NO_ANCHOR }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: ANCHOR_CMD }),
      r({ kind: 'requirement' }, { result: NO_ANCHOR }),
    ])

    expect(report.unanchored).toEqual([
      'task:t-aaa（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）',
      'requirement（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）',
    ])
    expect(report.matched).toBe(3)
    expect(report.missing).toEqual([])
  })
})

describe('S-3 排除：两类不吃锚点判据的项', () => {
  it('普通项结果带锚点（命令+读数 / 路径 / 明确计数）→ 不入桶', () => {
    const items = [
      item('v1-1', { kind: 'task', taskId: 't-aaa' }),
      item('v1-2', { kind: 'task', taskId: 't-bbb' }),
      item('v1-3', { kind: 'task', taskId: 't-ccc' }),
    ]
    const report = matchStructuredResults(items, [
      r({ kind: 'task', taskId: 't-aaa' }, { result: ANCHOR_CMD }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: ANCHOR_PATH }),
      r({ kind: 'task', taskId: 't-ccc' }, { result: ANCHOR_COUNT }),
    ])

    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(3)
    expect(report.missing).toEqual([])
  })

  it('needsHuman: true 的项结果无锚点 → 不入桶（人工项走事实形态，逼锚点等于逼人编命令）', () => {
    const human = item('v1-1', { kind: 'task', taskId: 't-h' }, { needsHuman: true, humanReason: '界面视觉需人对照' })
    const report = matchStructuredResults([human], [
      r({ kind: 'task', taskId: 't-h' }, { needsHuman: true, humanReason: '界面视觉需人对照', result: '界面看起来对齐' }),
    ])

    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(1)
    expect(report.empty).toEqual([])
  })

  it('系统缺口项（gapKind 非空）结果无锚点 → 不入桶（走处置两义，不套锚点）', () => {
    // 可预见项里唯一可能同时是系统项的形状：任务源 + gapKind（真实 buildSheet 的缺口项
    // 都挂在 kind:'requirement' 且 gapKind 非空 → 本就不可预见，见下一条用例）。
    const sys = item('v1-1', { kind: 'task', taskId: 't-sys' }, { gapKind: 'e2e', criterion: 'E2E 覆盖：**无（缺口）**' })
    expect(isSystemItem(sys)).toBe(true)

    const report = matchStructuredResults([sys], [r({ kind: 'task', taskId: 't-sys' }, { result: NO_ANCHOR })])
    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(1)
    expect(report.empty).toEqual([])
  })

  it('真 buildSheet 的 E2E 缺口项既不可预见、也不进 unanchored（回归：系统项不逼交代）', () => {
    const built = build({ e2eCoverage: false, tasks: [{ id: 't-a', title: '卡', acceptance: '跑 a' }] })
    const e2e = built.items.find(i => i.gapKind === 'e2e')!
    expect(e2e).toBeDefined()
    expect(isSystemItem(e2e)).toBe(true)

    const report = matchStructuredResults(built.items, [
      r({ kind: 'task', taskId: 't-a' }, { result: ANCHOR_CMD }),
      r({ kind: 'requirement' }, { result: ANCHOR_COUNT }),
    ])
    expect(report.unanchored).toEqual([])
    expect(report.missing).toEqual([])
    expect(report.unmatched).toEqual([])
    expect(report.matched).toBe(2)
  })
})

describe('S-3 文本前提：空文本走 empty，不进 unanchored', () => {
  it('既没给 result 也没标 needsHuman → 只进 empty，unanchored 为空', () => {
    const report = matchStructuredResults([item('v1-1', { kind: 'task', taskId: 't-aaa' })], [
      r({ kind: 'task', taskId: 't-aaa' }),
    ])
    expect(report.empty).toHaveLength(1)
    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(0)
  })

  it('空白 result（trim 后为空）→ 只进 empty，unanchored 为空', () => {
    const report = matchStructuredResults([item('v1-1', { kind: 'task', taskId: 't-aaa' })], [
      r({ kind: 'task', taskId: 't-aaa' }, { result: '   ' }),
    ])
    expect(report.empty).toHaveLength(1)
    expect(report.unanchored).toEqual([])
  })
})

describe('回归：既有桶的语义与判定顺序不变（unanchored 只新增）', () => {
  const sheet = (): SheetItemLike[] => [
    item('v1-1', { kind: 'task', taskId: 't-aaa' }),
    item('v1-2', { kind: 'task', taskId: 't-bbb' }),
    item('v1-3', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
  ]

  it('指不到项 → unmatched 非空且先于完整性判定（unanchored 为空）', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-zzz' }, { result: NO_ANCHOR }),
    ])
    expect(report.unmatched).toEqual(['task:t-zzz'])
    expect(report.empty).toEqual([])
    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(0)
    expect(report.missing).toEqual(['task:t-aaa', 'task:t-bbb', 'requirement'])
  })

  it('重复引用 → duplicate，只算一次 matched（也只有第一条进 unanchored）', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: NO_ANCHOR }),
      r({ kind: 'task', taskId: 't-aaa' }, { result: ANCHOR_CMD }),
    ])
    expect(report.duplicate).toEqual(['task:t-aaa'])
    expect(report.matched).toBe(1)
    expect(report.unanchored).toHaveLength(1)
  })

  it('形状非法（results 非数组）→ invalid 非空、全部项算未交代，unanchored 为空', () => {
    for (const bad of [undefined, null, {}, 'not-array', 42]) {
      const report = matchStructuredResults(sheet(), bad)
      expect(report.invalid).toHaveLength(1)
      expect(report.invalid[0]).toContain('results 必须是数组')
      expect(report.unanchored).toEqual([])
      expect(report.missing).toEqual(['task:t-aaa', 'task:t-bbb', 'requirement'])
    }
  })

  it('元素是原始值 / ref 结构坏 → invalid，unanchored 为空且不抛', () => {
    expect(() => matchStructuredResults(sheet(), [null, 'x', 42] as never)).not.toThrow()
    const report = matchStructuredResults(sheet(), [
      null,
      'x',
      { ref: { kind: 'nope' } as never, result: NO_ANCHOR },
      { ref: { kind: 'task', taskId: '  ' } as never, result: NO_ANCHOR },
    ] as never)
    expect(report.invalid).toHaveLength(4)
    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(0)
  })

  it('漏项 → missing 去重点名；冲突不变量 → conflict 响亮报出（两者都不受 unanchored 影响）', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: ANCHOR_CMD }),
    ])
    expect(report.missing).toEqual(['task:t-bbb', 'requirement'])
    expect(report.unanchored).toEqual([])

    const broken = [
      item('v1-1', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
      item('v1-2', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
    ]
    const conflicted = matchStructuredResults(broken, [r({ kind: 'requirement' }, { result: NO_ANCHOR })])
    expect(conflicted.conflict).toEqual(['requirement ×2'])
    expect(conflicted.matched).toBe(1)
    expect(conflicted.unanchored).toHaveLength(1) // 撞键不影响逐条体检；拒绝顺序由调用方（另一张卡）决定
  })

  it('本卡不做拒绝：unanchored 非空时 matchStructuredResults 仍正常返回报告', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: NO_ANCHOR }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: NO_ANCHOR }),
      r({ kind: 'requirement' }, { result: NO_ANCHOR }),
    ])
    expect(report.unanchored).toHaveLength(3)
    expect(report.matched).toBe(3)
    expect(report.missing).toEqual([])
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/* 端到端：桶 → 拒绝码（REQ-261007160829-1991 FR-1 · design S-3 / I-6）        */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 为什么这一节必须端到端（而不是把上面的桶断言再写一遍）：本卡真正的交付物是**拒绝**——
 * ① 「桶 → `REQBOARD_RESULT_UNANCHORED`」的映射在用例层（`bindStructuredResults`），桶对了不等于码对了；
 * ② 「拒绝时台账零改动」是**可观测终态**（revision / 需求 version / 验收单 version 一条都不许动），
 *    只有走真实入口 `reqboard_submit(kind=verification)` 才观察得到；
 * ③ 判定顺序（`unanchored` 排在 `missing` 之后）是**取舍**，只有把两类错误放进同一次提交才可区分。
 *
 * 夹具口径与 tests/accept-sheet-tool.test.ts 的 results 一族逐字一致（真实用例 + 内存队列 +
 * 无 artifacts 的存量式需求 ⇒ 9 类文档门/可执行性门按既有口径豁免，测的正是逐项交代硬门本身）。
 */
const W = 'session-anchor-e2e'
const REQ_ID = 'REQ-anchor01'
const e2eDirs: string[] = []
afterEach(() => { for (const d of e2eDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const mkTask = (i: number, over: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 't-anchor0' + i, requirementId: REQ_ID, title: '任务' + i, description: '',
  phase: 'implement' as const, side: 'backend' as const, dependsOn: [],
  scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + i,
  implementation: '改 x' + i, context: '', status: 'done' as const, blocked: false,
  executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
  createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  ...over,
})

interface E2E {
  store: ReturnType<typeof makeTestStore>
  run: (args: unknown) => Promise<any>
  reqOf: () => Promise<RequirementRecord>
  sheetOf: () => Promise<any>
  tasksOf: () => Promise<readonly TaskRecord[]>
}

/**
 * 造一个「已提交过一版验收单」的现场：先跑一次**不带 results** 的提交。
 * 这一步不是仪式——它给出「零改动」可比对的基线（sheet v1 / revision / 需求 version），
 * 否则"拒绝后 sheet 没变"永远是空过（本来就没有 sheet）。
 */
async function setupE2E(opts: { extraTasks?: readonly TaskRecord[] } = {}): Promise<E2E> {
  const dir = mkdtempSync(join(tmpdir(), 'pmboard-anchor-submit-'))
  e2eDirs.push(dir)
  // 一个「像本仓」的工作区：`tests/` 目录在场。它不是装饰——验收锚点探针（`collectMissingAnchors`）
  // 只在 `tests/` 存在时才工作（裸夹具工作区里全量报缺失只会是噪声），下面的系统缺口项用例靠它。
  mkdirSync(join(dir, 'tests'), { recursive: true })
  const store = makeTestStore()
  const deps: ReqboardToolDeps = { store, now: () => Date.now(), workspaceRoot: dir }
  const record = {
    id: REQ_ID, title: '提交侧锚点硬门', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [record], triages: [] })
  await seedQueueTasks(deps, REQ_ID, [mkTask(1), mkTask(2), mkTask(3), ...(opts.extraTasks ?? [])])
  const tool = defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
  const run = (args: unknown) => tool.execute(args, { agent: { id: W } })
  await run({ summary: '交付', evidence: ['npx vitest run 全绿'] })
  return {
    store,
    run,
    reqOf: async () => (await store.get(REQ_ID))!,
    sheetOf: async () => (await store.get(REQ_ID))!.verification!.sheet,
    tasksOf: () => queueTasksOf(deps, REQ_ID),
  }
}

/** 可预见项全覆盖（每张顶层卡 + 需求级），默认**全部带可核验锚点**。 */
async function fullResults(e: E2E): Promise<any[]> {
  const tasks = await e.tasksOf()
  return [
    ...tasks.filter(t => t.parentId === undefined).map(t => ({ ref: { kind: 'task', taskId: t.id }, result: ANCHOR_CMD })),
    { ref: { kind: 'requirement' }, result: ANCHOR_COUNT },
  ]
}

const codeOf = async (p: Promise<unknown>): Promise<{ code?: string; message: string }> => {
  const err = await p.then(() => undefined, (x: unknown) => x)
  expect(err, '这次提交本应被拒，却成功了').toBeDefined()
  return err as { code?: string; message: string }
}

describe('端到端：I-6 桶 → 拒绝码（走真实 reqboard_submit kind=verification）', () => {
  it('无锚点 result → REQBOARD_RESULT_UNANCHORED、逐条点名该 ref、台账与验收单零改动', async () => {
    const e = await setupE2E()
    const before = {
      revision: e.store.peekRevision(),
      version: (await e.reqOf()).version,
      sheetVersion: (await e.sheetOf()).version,
    }
    const results = await fullResults(e)
    const named = results[0].ref as { kind: 'task'; taskId: string }
    results[0] = { ref: named, result: NO_ANCHOR }

    const err = await codeOf(e.run({ summary: '交付', evidence: ['npx vitest run 全绿'], results }))
    expect(err.code).toBe('REQBOARD_RESULT_UNANCHORED')
    const msg = err.message
    expect(msg).toContain('task:' + named.taskId) // 点名那一项（元素文案直接来自桶）
    expect(msg).toContain('锚点')
    expect(msg).toContain('结果必须可复核') // why：不写给不出锚点时人只能凭印象点通过
    expect(msg).toContain('npx vitest run tests/x.test.ts → 10 passed') // how：可照抄样例
    expect(msg).toContain('reqboard_submit(kind=verification)') // how 必含可执行锚点

    // 零改动：revision / 需求 version / 验收单 version 三者都不动，且一条 result 都没落进单里
    expect(e.store.peekRevision()).toBe(before.revision)
    expect((await e.reqOf()).version).toBe(before.version)
    const sheet = await e.sheetOf()
    expect(sheet.version).toBe(before.sheetVersion)
    expect(sheet.items.every((i: SheetItemLike) => i.result === undefined)).toBe(true)
  })

  it('漏项与无锚点同时出现 → 先报 REQBOARD_RESULT_COVERAGE_MISSING（结构优先；unanchored 排其后）', async () => {
    const e = await setupE2E()
    const results = await fullResults(e)
    results[0] = { ref: results[0].ref, result: NO_ANCHOR } // 无锚点（质量不够）
    const dropped = results.splice(1, 1)[0]!.ref as { kind: 'task'; taskId: string } // 且漏交一项（结构没交齐）
    const err = await codeOf(e.run({ summary: '交付', evidence: ['npx vitest run 全绿'], results }))
    expect(err.code).toBe('REQBOARD_RESULT_COVERAGE_MISSING')
    // 这一轮该修的是「漏项」：无锚点那条不该被抢答（否则同一批错误要多一次往返）
    expect(err.message).toContain('task:' + dropped.taskId)
    expect(err.message).not.toContain('没有可核验锚点')
  })

  it('改交带锚点的结果 → 提交成功，逐项落库且 resultSource=agent', async () => {
    const e = await setupE2E()
    const out: any = await e.run({ summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResults(e) })
    expect(out.success).toBe(true)
    expect(out.results_coverage).toBe('complete')
    expect(out.results_bound).toBe((await fullResults(e)).length) // bound = 真正改动了字段的项数
    const sheet = await e.sheetOf()
    const foreseeable = sheet.items.filter((i: SheetItemLike) =>
      i.source.kind === 'task' || (i.source.kind === 'requirement' && i.gapKind === undefined && i.criterion === REQUIREMENT_LEVEL_CRITERION))
    expect(foreseeable).toHaveLength(4) // 3 张顶层卡 + 需求级
    for (const it of foreseeable) {
      expect(it.result, it.id).toBeTruthy()
      expect(it.resultSource, it.id).toBe('agent')
    }
  })

  it('排除项：单上**已是人工项**（needsHuman + humanReason）的那一项，结果无锚点也不触发该拒绝', async () => {
    const e = await setupE2E()
    const all = await fullResults(e)
    const humanRef = all[0].ref as { kind: 'task'; taskId: string }
    // ① 先把它标成人工项（真实路径：提交时给 needsHuman + humanReason，**不给 result**）——
    //    这一版单上它就成了 needsHuman 项（`applyStructuredResults` 落的旗标与理由）。
    await e.run({
      summary: '交付', evidence: ['npx vitest run 全绿'],
      results: [{ ref: humanRef, needsHuman: true, humanReason: '界面视觉需人对照权威原型' }, ...all.slice(1)],
    })
    const flagged = (await e.sheetOf()).items.find((i: SheetItemLike) => i.source.kind === 'task' && i.source.taskId === humanRef.taskId)!
    expect(flagged.needsHuman).toBe(true)
    expect(flagged.humanReason).toBe('界面视觉需人对照权威原型')

    // ② 让它成为**返工续版**的承项（真实路径：人判它不通过）——续版会把该项连 needsHuman 一起带过来，
    //    这是「单上已是人工项 + 结果无锚点」在真实单里唯一可达的形状。
    await e.store.mutate(REQ_ID, (draft) => {
      const it = draft.verification!.sheet!.items.find(i => i.source.kind === 'task' && i.source.taskId === humanRef.taskId)!
      it.status = 'failed'
      return { changed: true }
    })

    // ③ 续版重交：这一项给**无锚点**结果，其余**可预见**承项给带锚点结果 → 不得触发
    //    REQBOARD_RESULT_UNANCHORED。（系统项不进 results：它不是可预见项，给它造 ref 反而
    //    会因与需求级项共用一个引用键而被判重复——这条约束本身也是既有口径。）
    const carried = (await e.sheetOf()).items.filter((i: SheetItemLike) => isForeseeableItem(i)) as SheetItemLike[]
    const results = carried.map(i => i.source.kind === 'task' && i.source.taskId === humanRef.taskId
      ? { ref: i.source, result: NO_ANCHOR }
      : { ref: i.source, result: ANCHOR_CMD })
    const out: any = await e.run({ summary: '交付', evidence: ['npx vitest run 全绿'], results })
    expect(out.success).toBe(true)
    const after = (await e.sheetOf()).items.find((i: SheetItemLike) => i.source.kind === 'task' && i.source.taskId === humanRef.taskId)!
    expect(after.result).toBe(NO_ANCHOR) // 结果确实落进去了（没被拒在门外）
    expect(after.needsHuman).toBe(true)
    expect(after.humanReason).toBe('界面视觉需人对照权威原型')
  })

  it('排除项：真实验收单上的系统缺口项不被要求交代、也不进 unanchored（端到端不误拒）', async () => {
    // 造一个真系统项：某张卡的验收标准引用了**不存在**的测试文件 ⇒ 验收锚点失效项（gapKind=consistency）。
    const e = await setupE2E({
      extraTasks: [mkTask(4, { acceptance: 'npx vitest run tests/gone-forever.test.ts 全绿' })],
    })
    const results = await fullResults(e)
    const out: any = await e.run({ summary: '交付', evidence: ['npx vitest run 全绿'], results })
    expect(out.success, '系统项在单上不得让本次提交被锚点门误拒').toBe(true)

    const sheet = await e.sheetOf()
    const sys = sheet.items.find((i: SheetItemLike) => i.criterion.startsWith(ANCHOR_GAP_PREFIX))!
    expect(sys, '本夹具应造出真实的系统缺口项').toBeDefined()
    expect(isSystemItem(sys)).toBe(true)
    expect(sys.source.kind).toBe('requirement')
    expect(sys.gapKind).toBe('consistency')
    // 系统项不在可预见集合里 ⇒ 不参与逐项交代（missing 为空、也不吃 results 的名额）
    const report = matchStructuredResults(sheet.items, results)
    expect(report.missing).toEqual([])
    expect(report.unanchored).toEqual([])
    expect(report.matched).toBe(results.length)
    expect(sys.result).toBeUndefined()
  })
})
