/**
 * reqboard_accept_sheet 单测（REQ-2e9473 W6 补口）：弹框逐项验收 → 直接落库裁决
 * （系统见证，无需 agent 转述）→ 未过项自动返工；分批 + 断点续验；降级。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { makeTestStore } from './application/harness.js'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineVerifySubmitTool, defineAcceptSheetTool, queueTasksOf, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-as-001'
const REQ_ID = 'REQ-as0001'
let dir: string
let store: ReturnType<typeof makeTestStore>
/**
 * **同一个 deps 对象**配所有工具（tool-deps 按 deps 记忆化 TaskStore）：
 * 每个工厂各建一个 deps 就会各得一个队列，"工具读 A、断言读 B"的假红必现。
 * 弹框通道按用例切换 → 直接改 `deps.userQuestions`（工厂内部是惰性读取 `() => deps.userQuestions?.()`）。
 */
let deps: ReqboardToolDeps

/**
 * 假弹框：answers 为批次队列（每次 ask 消费一批）；'delegated'/'abort' 为异常路径。
 * 队列耗尽后返回空答复（模拟用户未作答）。
 */
function sheetTool(answers: any[] | any[][] | 'delegated' | 'abort' | undefined) {
  const queue: any[][] = Array.isArray(answers) && Array.isArray((answers as any[])[0])
    ? [...(answers as any[][])]
    : (Array.isArray(answers) ? [answers as any[]] : [])
  const ask = async () => {
    if (answers === 'delegated') throw Object.assign(new Error('owned child'), { code: 'DELEGATED_CALLER' })
    if (answers === 'abort') throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
    const batch = queue.shift() ?? []
    return { answers: batch }
  }
  if (answers !== undefined) deps.userQuestions = () => ({ ask })
  else delete deps.userQuestions
  return defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}
const verifyTool = () => defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-sheettool-'))
  store = makeTestStore()
  deps = { store, now: () => Date.now() }
  const r = {
    id: 'REQ-as0001', title: '验收弹框', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  // v9：任务唯一存储 = 队列（台账不再有 tasks 通道）
  await seedQueueTasks(deps, REQ_ID, Array.from({ length: 3 }, (_, i) => ({
    id: 't-as000' + (i + 1), requirementId: REQ_ID, title: '任务' + (i + 1), description: '', phase: 'implement' as const, side: 'backend' as const,
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + (i + 1), implementation: '改 x' + (i + 1),
    context: '', status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  })))
  await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const sheetOf = async () => ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!

describe('reqboard_accept_sheet', () => {
  it('分批：batch_size=2 → 本批记 2 项，剩 2 项（3 任务+1 需求级）继续', async () => {
    const sheet = await sheetOf()
    const ids = sheet.items.map(i => i.id)
    const out = await run(sheetTool([
      { id: ids[0], selected: ['✅ 通过'], custom: '实际结果：测试全绿（npx vitest run tests/a.test.ts → 12 passed）' },
      { id: ids[1], selected: ['✅ 通过'], custom: '实际结果：测试全绿（npx vitest run tests/a.test.ts → 12 passed）' },
    ]), { batch_size: 2 })
    expect(out.recorded).toBe(2)
    expect(out.pending).toBe(2)
    expect(out.note).toMatch(/断点继续/)
    expect(((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
  })

  it('验收项没有 result 时零输入点通过 → unverified（不再回退整单 evidence，FR-6 / D-5）', async () => {
    // 本条锁的是 **FR-6 的底线**：`resultOf` 去掉 `evidence[0]` 兜底后，整单证据不再冒充
    // 每一项的实测结果——旧口径下它恒有"结果"，于是 `unverified` 恒不可达（底线形同不存在）。
    // 有结果的项零输入通过的口径见 tests/accept-sheet-zero-input.test.ts。
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([{ id: ids[0], selected: ['✅ 通过'] }]), { batch_size: 3 })
    expect(out.recorded).toBe(1)
    const item = (await sheetOf()).items.find(i => i.id === ids[0])!
    expect(item.evidence.length).toBeGreaterThan(0) // 整单证据在场
    expect(item.result).toBeUndefined() // 但没有逐项实测结果
    expect(item.status).toBe('unverified') // ⇒ 不计入通过（不冒充）
    expect(item.opinion).toBeUndefined()
    // 未作答项仍然保持 pending（挂起点不受影响）
    expect((await sheetOf()).items.filter(i => i.status === 'pending')).toHaveLength(3)
  })

  it('选"改进"+自定义意见 → 记 failed，并**自动回退实施 + 建返工卡**（REQ-308b9a FR-8，推翻 REQ-a8d582 FR-2）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      { id: ids[0], selected: ['✅ 通过'], custom: '实际结果：符合预期（npx vitest run tests/a.test.ts → 12 passed）' },
      { id: ids[1], selected: ['🛠 改进（需修改）'], custom: '边界没覆盖' },
      { id: ids[2], selected: ['❓ 其他'], custom: '需补充文档' },
    ]), { batch_size: 5 })
    expect(out.failed).toBe(2)
    expect(out.rework_tasks).toHaveLength(2)
    const snapReq = (await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id))!
    expect(snapReq.status).toBe('implementing')
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(5) // 原有 3 张 + 2 张返工卡（v9：从队列读）
    expect(out.note).toMatch(/自动回退/)
    // 验收项裁决留痕
    const item = (await sheetOf()).items.find(i => i.id === ids[1])!
    expect(item.status).toBe('failed')
    expect(item.opinion).toBe('边界没覆盖')
    expect(item.decidedBy?.kind).toBe('human')
  })

  it('未作答的项保持 pending（挂起点）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    await run(sheetTool([{ id: ids[0], selected: ['✅ 通过'], custom: '实际结果：符合预期（npx vitest run tests/a.test.ts → 12 passed）' }]), { batch_size: 3 })
    const s = await sheetOf()
    expect(s.items).toHaveLength(4) // 3 任务 + 1 需求级
    expect(s.items.filter(i => i.status === 'pending')).toHaveLength(3)
    expect(s.items.find(i => i.id === ids[0])!.status).toBe('passed')
    expect(s.items.find(i => i.id === ids[3])!.status).toBe('pending')
  })

  it('闭环返回值字段均在输出 schema 声明内（防 additionalProperties:false 拒收）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合（npx vitest run tests/a.test.ts → 12 passed）' })),
      [{ id: 'final-pass', selected: ['✅ 验收通过并归档'] }],
    ]), { batch_size: 10 })
    const declared = new Set(['success', 'requirement_id', 'sheet_version', 'recorded', 'pending', 'passed', 'failed', 'unverified', 'rework_tasks', 'archived', 'status', 'fallback', 'note', 'gate_status'])
    for (const k of Object.keys(out)) expect(declared.has(k), k).toBe(true)
  })

  it('弹框不可用 → fallback=board；subagent → fallback=board', async () => {
    const out1 = await run(sheetTool(undefined), {})
    expect(out1.fallback).toBe('board')
    const out2 = await run(sheetTool('delegated'), {})
    expect(out2.fallback).toBe('board')
  })

  it('用户取消 → 中性返回不记录', async () => {
    const out = await run(sheetTool('abort'), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——弹框被中断的回执只带 note（实测 code=undefined），实现缺口只上报。
    expect((await sheetOf()).items.every(i => i.status === 'pending')).toBe(true)
  })

  it('全部通过后直接弹「验收通过」确认 → 同意即归档（闭环，用户要求）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      // 第一批：逐项全过（通过必填实际结果，REQ-260930094139-2d65 FR-1）
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合（npx vitest run tests/a.test.ts → 12 passed）' })),
      // 第二批：最终确认
      [{ id: 'final-pass', selected: ['✅ 验收通过并归档'] }],
    ]), { batch_size: 10 })
    expect(out.archived).toBe(true)
    expect(out.status).toBe('archived')
    expect(out.note).toMatch(/已归档/)
    const req = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!
    expect(req.status).toBe('archived')
    expect(req.verification!.decision).toBe('pass')
    expect(req.verification!.reviewedBy?.kind).toBe('human')
  })

  it('最终确认选「暂不归档」→ 保持验收态', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合（npx vitest run tests/a.test.ts → 12 passed）' })),
      [{ id: 'final-pass', selected: ['暂不归档'] }],
    ]), { batch_size: 10 })
    expect(out.archived).toBeUndefined()
    expect(out.note).toMatch(/保持验收态/)
    expect(((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
  })
  it('弹框抛非权限异常 → 不得诬告"用户未作答"，须保留真因（REQ-261001170807-06fd FR-4）', async () => {
    deps.userQuestions = () => ({ ask: async () => { throw new Error('render failed: popup mount ENOENT') } })
    const out = await run(defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }, { batch_size: 2 })
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——工具故障回执只带 note（实测 code=undefined），实现缺口只上报。
    expect(String(out.note)).not.toContain('用户未作答')
    expect(String(out.note)).toContain('render failed')
    expect(String(out.note)).toContain('工具故障')
  })

  it('弹框被中断 → 如实说"被中断"，不栽给用户（FR-4）', async () => {
    deps.userQuestions = () => ({ ask: async () => { throw Object.assign(new Error('aborted by signal'), { code: 'ABORT_ERR' }) } })
    const out = await run(defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }, { batch_size: 2 })
    expect(String(out.note)).toContain('弹框被中断')
    expect(String(out.note)).not.toContain('用户未作答')
  })

})

/* ------------------------------------------------------------------------- */
/* REQ-261005105032-3b02 t18：验收单两个对照项（原型 / 裁定）                 */
/* ------------------------------------------------------------------------- */

/** 本组用例专用的需求 id：beforeEach 给 REQ-as0001 播的 3 张卡不干扰（队列按需求过滤）。 */
const CMP_REQ = 'REQ-as9cmp'
const CMP_TASK = 't-cmp001'
/** 已登记原型页面的路径（kind=prototype 的 .html；INDEX.md 也是 prototype 但不是页面）。 */
const CMP_PROTO = 'docs/requirements/' + CMP_REQ + '/prototypes/detail.html'

/** 非 legacy 工作区：9 类验收文档齐 + 覆盖标注（过文档门与覆盖度门），外加本需求文档的 front-matter。 */
function seedCompareWorkspace(frontmatter: readonly string[], decisions: readonly string[]): void {
  const reqDir = join(dir, 'docs', 'requirements', CMP_REQ)
  mkdirSync(join(reqDir, 'design'), { recursive: true })
  mkdirSync(join(reqDir, 'reviews'), { recursive: true })
  mkdirSync(join(reqDir, 'tests'), { recursive: true })
  mkdirSync(join(reqDir, 'tasks'), { recursive: true })
  writeFileSync(join(reqDir, 'requirement.md'), [
    ...(frontmatter.length > 0 ? ['---', ...frontmatter, '---'] : []),
    '# 需求', '', '**FR-1: 对照项落地**', '',
    ...(decisions.length > 0
      ? ['## 讨论与裁定记录（D-x）', '', '| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |', '| --- | --- | --- | --- | --- |', ...decisions, '']
      : []),
  ].join('\n'))
  writeFileSync(join(reqDir, 'design', 'architecture.md'), '## 架构 serves: FR-1\n\n内容')
  for (const d of ['data-model', 'interfaces', 'test-cases']) writeFileSync(join(reqDir, 'design', d + '.md'), '# ' + d)
  writeFileSync(join(reqDir, 'decomposition.md'),
    '# 拆分计划\n\n## 覆盖对照表\n\n| 需求条款 | 接收任务 |\n| --- | --- |\n| FR-1 | ' + CMP_TASK + ' |')
  writeFileSync(join(reqDir, 'reviews', 'r1.md'), '# review')
  writeFileSync(join(reqDir, 'tests', 't1.md'), '# test\n\ncovers: ' + CMP_TASK)
  writeFileSync(join(reqDir, 'tasks', CMP_TASK + '.md'), '# task')
}

/** 播种需求：artifacts 决定"非 legacy"，kinds 决定有没有已登记原型。 */
async function seedCompareReq(opts: {
  frontmatter?: readonly string[]
  decisions?: readonly string[]
  kinds?: readonly string[]
}): Promise<void> {
  seedCompareWorkspace(opts.frontmatter ?? [], opts.decisions ?? [])
  const kinds = ['requirement', ...(opts.kinds ?? [])]
  const r = {
    id: CMP_REQ, title: '对照项落地', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: kinds.map(k => ({
      stage: 'brainstorming', kind: k,
      path: k === 'prototype' ? CMP_PROTO : 'docs/requirements/' + CMP_REQ + '/requirement.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
      // prototype_exempt 只在 requirement 产物**已落章**时生效（人确认过才叫豁免）
      ...(k === 'requirement' ? { confirmedAt: 2, confirmedBy: { kind: 'human', sessionId: W } } : {}),
    })),
  }
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r as unknown as RequirementRecord], triages: [] })
  await seedQueueTasks(deps, CMP_REQ, [{
    id: CMP_TASK, requirementId: CMP_REQ, title: '对照项实施', description: '', phase: 'implement' as const, side: 'frontend' as const,
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run tests/x.test.ts 全绿', context: '',
    status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  }])
  // workspaceRoot 必须在工具定义前设定（FileDocRepository 在 define 时固化根）
  deps.workspaceRoot = dir
}

const cmpSheetOf = async () => ((await store.get(CMP_REQ))!).verification!.sheet!
const runSubmit = (args: unknown) => verifyTool().execute(args, { agent: { id: W } })

describe('REQ-261005105032-3b02 t18：验收单两个对照项', () => {
  it('UI 需求（feature + sides 含 frontend）+ 已登记原型 → 必含 prototype-compare 项，criterion 逐字', async () => {
    await seedCompareReq({ frontmatter: ['sides: [frontend]'], kinds: ['prototype'] })
    const out = await runSubmit({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.success).toBe(true)
    const sheet = await cmpSheetOf()
    const pc = sheet.items.find(i => i.source.kind === 'prototype-compare')!
    expect(pc, 'UI 需求验收单必含原型对照项').toBeDefined()
    expect(pc.criterion).toBe('与原型对照截图（含差异说明）')
    expect(pc.source).toEqual({ kind: 'prototype-compare', prototypePath: CMP_PROTO })
    expect(pc.needsHuman).toBe(true)
    expect(pc.humanReason).toBe('界面视觉需人对照权威原型')
  })

  it('非 UI 需求（sides 不含 frontend）→ 不出现该项（即便登记了原型）', async () => {
    await seedCompareReq({ frontmatter: ['sides: [backend]'], kinds: ['prototype'] })
    const out = await runSubmit({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.success).toBe(true)
    const sheet = await cmpSheetOf()
    expect(sheet.items.some(i => i.source.kind === 'prototype-compare')).toBe(false)
    expect(sheet.items.some(i => i.criterion.includes('本需求已豁免原型'))).toBe(false)
  })

  it('有 D-x 条目 → 含 decision-compare 项，decisionIds 非空且逐条带出', async () => {
    await seedCompareReq({
      frontmatter: ['sides: [frontend]'],
      kinds: ['prototype'],
      decisions: [
        '| D-1 | session-as-001 `改成两支` | 验收单加两个对照项 | FR-1 | 单里有两项 |',
        '| D-3 | session-as-001 `不要印象式验收` | 逐条对照裁定 | FR-1 | decisionIds 非空 |',
      ],
    })
    await runSubmit({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = await cmpSheetOf()
    const dc = sheet.items.find(i => i.source.kind === 'decision-compare')!
    expect(dc, '有 D-x 时必含裁定对照项').toBeDefined()
    expect(dc.criterion).toBe('与裁定对照（逐条说明如何落实）')
    expect(dc.source).toEqual({ kind: 'decision-compare', decisionIds: ['D-1', 'D-3'] })
  })

  it('已批准豁免（prototype_exempt 有理由 + requirement 已落章）→ 无该项但有豁免说明行，提交不被阻塞', async () => {
    await seedCompareReq({
      frontmatter: ['sides: [frontend]', 'prototype_exempt: 只改文案与配色，无独立原型资产'],
      kinds: [],
    })
    const out = await runSubmit({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.success, '豁免需求不得因缺对照项被拒').toBe(true)
    const sheet = await cmpSheetOf()
    expect(sheet.items.some(i => i.source.kind === 'prototype-compare')).toBe(false)
    const note = sheet.items.find(i => i.criterion.includes('本需求已豁免原型（理由：'))!
    expect(note, '豁免需求必须渲染一行豁免说明').toBeDefined()
    expect(note.criterion).toContain('只改文案与配色，无独立原型资产')
  })

  it('非豁免 UI 需求没有已登记原型 → 缺项即拒：内部码 verification_prototype_compare_missing / 传输码 REQBOARD_VERIFICATION_INCOMPLETE', async () => {
    await seedCompareReq({ frontmatter: ['sides: [frontend]'], kinds: [] })
    const err = await runSubmit({ summary: '交付', evidence: ['npx vitest run 全绿'] }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_VERIFICATION_INCOMPLETE')
    const msg = String((err as Error).message)
    expect(msg).toContain('verification_prototype_compare_missing')
    expect(msg).toContain('与原型对照截图（含差异说明）')
    expect(msg).toContain('reqboard_submit(kind=prototype') // how 必含可执行锚点（§10 #40）
  })

  it('弹框 header：喂两个对照项后不出现「验收项 undefined」，各显示中文标题（§10 #31）', async () => {
    const id = (await store.listSummaries({ scope: 'all' })).items[0]!.id
    await store.mutate(id, (req) => {
      const items = req.verification!.sheet!.items
      items.push({
        id: 'v1-90',
        source: { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
        criterion: '与原型对照截图（含差异说明）', evidence: ['截图：docs/x.png'], status: 'pending',
        needsHuman: true, humanReason: '界面视觉需人对照权威原型',
      })
      items.push({
        id: 'v1-91',
        source: { kind: 'decision-compare', decisionIds: ['D-3', 'D-5'] },
        criterion: '与裁定对照（逐条说明如何落实）', evidence: ['D-3 落实证据：...'], status: 'pending',
      })
      return { changed: true }
    })
    const asked: { header?: string; id?: string }[] = []
    deps.userQuestions = () => ({ ask: async (req: { questions: { header?: string; id?: string }[] }) => { asked.push(...req.questions); return { answers: [] } } })
    const out = await run(defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }, { batch_size: 10 })
    const headers = asked.map(q => String(q.header ?? ''))
    expect(headers.some(h => h.includes('原型对照'))).toBe(true)
    expect(headers.some(h => h.includes('裁定对照'))).toBe(true)
    expect(headers.join('\n')).not.toContain('undefined')
    // 未作答 → 挂起，不写任何裁决
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——未选择任何项的回执只带 note（实测 code=undefined），实现缺口只上报。
  })
})

/* ------------------------------------------------------------------------- */
/* REQ-261006092213-4f5b t2：结构化逐项结果（results）+ 逐项交代硬门           */
/* ------------------------------------------------------------------------- */

/** REQ-as0001 的可预见项全覆盖（3 张顶层卡 + 1 条需求级）。
 *  需求级项同样是**普通项**：结果要给可核验锚点，否则会被 REQBOARD_RESULT_UNANCHORED 拒
 *  （REQ-261007160829-1991 FR-1 / design S-3：提交侧硬门要的是「有据」，不只是「有字」）。 */
async function fullResultsForAs(): Promise<any[]> {
  const tasks = await queueTasksOf(deps, REQ_ID)
  const tops = tasks.filter(t => t.parentId === undefined)
  return [
    ...tops.map(t => ({ ref: { kind: 'task', taskId: t.id }, result: 'npx vitest run tests/x.test.ts → 全绿' })),
    { ref: { kind: 'requirement' }, result: '交付结论：npx vitest run 全量回归 → 27 passed（证据齐全、与设计一致、无范围蔓延）' },
  ]
}

describe('REQ-261006092213-4f5b t2：results 逐项落章与逐项交代硬门', () => {
  it('带 results 提交 → 每个可预见项带 result 且 resultSource=agent（A1 / FR-1）', async () => {
    const out = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResultsForAs(),
    })
    expect(out.success).toBe(true)
    expect(out.results_coverage).toBe('complete')
    expect(out.results_matched).toBe(4)
    expect(out.results_bound).toBe(4) // bound 取 changed（真正改动了字段的项数）
    expect(out.results_unmatched).toEqual([])
    expect(out.results_out_of_scope).toEqual([])
    const sheet = await sheetOf()
    // 可预见项 = 3 张顶层卡 + 1 条需求级；第二次提交后需求已有产物 ⇒ 追加一条「不可照着验」
    // 的历史数据系统项（提交时才算得出，**不在可预见集合内**，故不参与逐项交代）。
    const foreseeable = sheet.items.filter(i => i.source.kind === 'task' || i.criterion.startsWith('需求级：'))
    expect(foreseeable).toHaveLength(4)
    for (const it of foreseeable) {
      expect(it.result, it.id).toBeTruthy()
      expect(it.resultSource, it.id).toBe('agent')
    }
    expect(sheet.items.some(i => i.criterion.startsWith('验收项不可照着验'))).toBe(true)
  })

  it('漏项 → REQBOARD_RESULT_COVERAGE_MISSING 且点名到 ref，台账 revision 不变（A3）', async () => {
    const all = await fullResultsForAs()
    const dropped = all[0].ref as { kind: 'task'; taskId: string }
    const before = store.peekRevision()
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: all.slice(1),
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_COVERAGE_MISSING')
    const msg = String((err as Error).message)
    expect(msg).toContain('task:' + dropped.taskId) // 点名到 ref（不静默）
    expect(msg).toContain('补齐：') // 三段式：怎么补
    expect(store.peekRevision()).toBe(before) // 拒绝时台账零变更
  })

  it('坏 ref（指不到任何可预见项）→ REQBOARD_RESULT_REF_INVALID 且点名（A6）', async () => {
    const all = await fullResultsForAs()
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'],
      results: [...all, { ref: { kind: 'task', taskId: 't-nope' }, result: 'x' }],
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_REF_INVALID')
    expect(String((err as Error).message)).toContain('t-nope')
  })

  it('同一 ref 交两次 → REQBOARD_RESULT_REF_DUPLICATE（A6）', async () => {
    const all = await fullResultsForAs()
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: [...all, all[0]],
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_REF_DUPLICATE')
  })

  it('既无 result 又无 needsHuman → REQBOARD_RESULT_EMPTY（A6）', async () => {
    const all = await fullResultsForAs()
    all[0] = { ref: all[0].ref }
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: all,
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_EMPTY')
  })

  it('标了 needsHuman 却没写理由 → REQBOARD_RESULT_EMPTY（不许「标了但不解释」）', async () => {
    const all = await fullResultsForAs()
    all[0] = { ref: all[0].ref, needsHuman: true }
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: all,
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_EMPTY')
    expect(String((err as Error).message)).toContain('humanReason')
  })

  it('needsHuman + 理由 → 落库带旗标与理由，该项不写 result（FR-5 的落点）', async () => {
    const all = await fullResultsForAs()
    all[0] = { ref: all[0].ref, needsHuman: true, humanReason: '界面视觉需人对照权威原型' }
    const out = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: all,
    })
    expect(out.success).toBe(true)
    const item = (await sheetOf()).items[0]!
    expect(item.needsHuman).toBe(true)
    expect(item.humanReason).toBe('界面视觉需人对照权威原型')
    expect(item.result).toBeUndefined()
  })

  it('不带 results（老写法）→ 仍成功，results_coverage=legacy 且不落 result（A7 / FR-8）', async () => {
    const out = await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.success).toBe(true)
    expect(out.results_coverage).toBe('legacy')
    expect(out.results_bound).toBe(0)
    expect((await sheetOf()).items.every(i => i.result === undefined)).toBe(true)
  })

  it('坏 ref 与漏项同时出现 → 先报 REQBOARD_RESULT_REF_INVALID（判定顺序，复核 F2）', async () => {
    // 「ref 写错一个字」与「该项因此没被交代」是同一件事的两面。若先报「漏项」，
    // agent 会去补那条不存在的 ref 指向的项，下一次才收到「ref 无效」——两次往返。
    const all = await fullResultsForAs()
    const wrong = { ref: { kind: 'task', taskId: 't-as0001x' }, result: 'x' }
    const err = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: [wrong, ...all.slice(1)],
    }).catch((e: unknown) => e)
    expect((err as { code?: string }).code).toBe('REQBOARD_RESULT_REF_INVALID')
    expect(String((err as Error).message)).toContain('t-as0001x')
  })

  it('兼容文本写法与结构化同时给 → 结构化（主路径）最后写赢（复核 F4）', async () => {
    const all = await fullResultsForAs()
    // 本用例有区分力的前提：`v2-1` 这一条文本写法**确实命中**了项（未命中会进 results_unmatched）。
    const out = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿', 'v2-1 :: 文本路径写的结果'], results: all,
    })
    expect(out.success).toBe(true)
    expect(out.results_unmatched).toEqual([])
    const item = (await sheetOf()).items.find(i => i.id === 'v2-1')!
    expect(item.result).toBe(all[0].result)
    expect(item.result).not.toBe('文本路径写的结果')
    expect(item.resultSource).toBe('agent')
  })

  it('并发写者抢先落版 → 组装吃新鲜 prevSheet：不撞号、历史不重复（复核 F1）', async () => {
    // 复核实测的回归形态：组装若读 `target` 陈旧快照，并发写者刚落的那版会被整体覆盖且不进历史
    // （version 撞号、history 出现 [1,1]）。这里在本次 submit 的 mutate 真正执行前注入一次"另一个写者"。
    const realMutate = store.mutate.bind(store)
    let injected = false
    ;(store as unknown as { mutate: unknown }).mutate = async (
      id: string,
      fn: (draft: Record<string, any>) => unknown,
    ) => {
      if (!injected) {
        injected = true
        await realMutate(id, (draft: Record<string, any>) => {
          const prev = draft.verification?.sheet
          draft.verification = {
            ...draft.verification,
            sheet: { ...prev, version: (prev?.version ?? 1) + 1 },
            sheetHistory: [...(draft.verification?.sheetHistory ?? []), prev],
          }
          return { changed: true }
        })
      }
      return realMutate(id, fn as never)
    }
    const out = await run(verifyTool(), {
      summary: '交付', evidence: ['npx vitest run 全绿'], results: await fullResultsForAs(),
    })
    expect(out.success).toBe(true)
    const rec = (await store.get(REQ_ID))!
    expect(rec.verification!.sheet!.version).toBe(3) // = 历史 1 条 + 并发那版 + 1
    expect((rec.verification!.sheetHistory ?? []).map(s => s.version)).toEqual([1, 2])
  })

  it('形状级坏参数在绑定层就被拦下（口径记录，复核 F3）', () => {
    // 双口径是刻意的，写在这里免下轮复核按文档判「少报」：
    //   ① **形状级**（非数组 / 元素非对象 / ref.kind 非法）由工具 schema 在**绑定层**拒，
    //      宿主报 `INVALID_ARGS` 并点名到字段路径（比用例层更早、更精确）；
    //   ② **语义级**（载荷缺/空、漏项、重复、指不到项）才进 `matchStructuredResults`，
    //      由用例回 `REQBOARD_INVALID_INPUT` / `REQBOARD_RESULT_*`。
    const schema = (verifyTool() as unknown as { parameters: Parameters<typeof validateJsonSchemaValue>[0] }).parameters
    const errs = (args: unknown): string[] => validateJsonSchemaValue(schema, args, '')
    expect(errs({ kind: 'verification', results: null })).toContain('"results" must be an array')
    expect(errs({ kind: 'verification', results: [42] })).toContain('"results[0]" must be an object')
    expect(errs({ kind: 'verification', results: [{ ref: { kind: 'nope' } }] }).join('；'))
      .toContain('"results[0].ref.kind" must be one of')
    expect(errs({ kind: 'verification', results: [{ ref: { kind: 'task', taskId: 't-1' }, result: 'r' }] })).toEqual([])
  })
})
