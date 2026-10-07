/**
 * 回执文案单点 VerdictNotices（REQ-261007160829-1991 · t-59a3e5）serves: FR-2, FR-4
 *
 * 本卡只做**文案单点**（不接线，接线是别的卡）：新建 `src/domain/workflow/VerdictNotices.ts`，
 * 让两条出口（弹框工具回执 / 看板 HTTP 回执）与弹框第 2 问题干取**同一处**文案。
 *
 * 为什么要它：两条出口今天各写死一句「未复核」，且都说不清**为什么**没过、**该补什么**
 * ——「可核验形态」这句话在两处各写一份必然漂移（FR-4 的判据就是这个：同一常量）。
 *
 * 用例先行（TDD）：本文件在 `VerdictNotices.ts` 落地之前就写好了。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ACCEPT_RESULT_FORM_HINT,
  unverifiedSummaryOf,
  unverifiedAdviceOf,
} from '../src/domain/workflow/VerdictNotices.js'
import type { UnverifiedReason } from '../src/domain/workflow/AcceptanceSheetSpec.js'
// ── 验收期修正（2026-10-07）：第 2 问结尾引导按项类型分派 —— 新增的两个 import 单独成行，
//    上面既有行一行未动。──
import { resultQuestionTailOf } from '../src/domain/workflow/VerdictNotices.js'
import { isValidDisposition } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { makeTestStore } from './application/harness.js'
import {
  defineVerifySubmitTool, defineAcceptSheetTool, seedQueueTasks,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import { ACCEPT_ITEM_OPTIONS } from '../src/domain/text/labels.js'
import type { RequirementRecord, TaskRecord, VerificationSheet } from '../src/shared/protocol.js'
// ── 看板 HTTP 通道接线（design/interfaces.md I-9）新增的 import。单独一行成组，
//    上面既有行**一行未动**（前两张卡的 13 条用例逐字保留）。──
import { afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../src/http/routes.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { buildSheet } from '../src/domain/workflow/AcceptanceSheetSpec.js'

/** 未复核项的最小投影（`status` 是自由字符串：老数据与新数据同形）。 */
const item = (status: string, unverifiedReason?: UnverifiedReason) => ({ status, unverifiedReason })

describe('ACCEPT_RESULT_FORM_HINT · 三类形态词齐备（FR-4 机械判据）', () => {
  it('同时含「命令」「路径」「计数」三类形态词', () => {
    expect(ACCEPT_RESULT_FORM_HINT).toContain('命令')
    expect(ACCEPT_RESULT_FORM_HINT).toContain('路径')
    expect(ACCEPT_RESULT_FORM_HINT).toContain('计数')
  })

  it('带一个可照抄的合格样例（否则人只知道「要锚点」不知道写成什么样）', () => {
    expect(ACCEPT_RESULT_FORM_HINT).toContain('npx vitest run')
    expect(ACCEPT_RESULT_FORM_HINT).toContain('passed')
  })
})

describe('unverifiedSummaryOf · 区分「没写」与「写了但不认」（FR-2）', () => {
  it('无未复核项 → 空串（不写半句「0 项未复核」噪声）', () => {
    expect(unverifiedSummaryOf([])).toBe('')
    expect(unverifiedSummaryOf([item('passed'), item('failed'), item('pending')])).toBe('')
  })

  it('只有 anchor_missing → 无锚点 1、未写结果 0', () => {
    expect(unverifiedSummaryOf([item('unverified', 'anchor_missing'), item('passed')]))
      .toBe('1 项未复核（无锚点 1、未写结果 0）')
  })

  it('只有 blank_pass → 无锚点 0、未写结果 1', () => {
    expect(unverifiedSummaryOf([item('unverified', 'blank_pass')]))
      .toBe('1 项未复核（无锚点 0、未写结果 1）')
  })

  it('混合含老数据：无 reason 的未复核计入「未写结果」（老数据缺席 = 点了通过没留结果）', () => {
    const items = [
      item('unverified', 'anchor_missing'),
      item('unverified', 'anchor_missing'),
      item('unverified', 'blank_pass'),
      item('unverified'), // 老数据：字段缺席
      item('passed'),
      item('failed'),
    ]
    expect(unverifiedSummaryOf(items)).toBe('4 项未复核（无锚点 2、未写结果 2）')
  })
})

describe('unverifiedAdviceOf · 按真实原因给补法，三种取值互不相同', () => {
  it('anchor_missing → 说清「补一个可核验锚点后重交」', () => {
    const advice = unverifiedAdviceOf('anchor_missing')
    expect(advice).toContain('锚点')
    expect(advice).toContain('命令')
    expect(advice).toContain('路径')
    expect(advice).toContain('计数')
    expect(advice).toContain('重交')
  })

  it('blank_pass → 说清「补上实际结果后重交」', () => {
    const advice = unverifiedAdviceOf('blank_pass')
    expect(advice).toContain('补上实际结果')
    expect(advice).toContain('重交')
  })

  it('undefined（老数据）→ 中性措辞，同样可执行（不空手、不误导成某一类原因）', () => {
    const advice = unverifiedAdviceOf(undefined)
    expect(advice.length).toBeGreaterThan(0)
    expect(advice).toContain('重交')
  })

  it('三种取值互不相同（否则「按原因分派」退化成同一句话）', () => {
    const all = [
      unverifiedAdviceOf('anchor_missing'),
      unverifiedAdviceOf('blank_pass'),
      unverifiedAdviceOf(undefined),
    ]
    expect(new Set(all).size).toBe(3)
  })
})

// ── 弹框侧接线（REQ-261007160829-1991 · t-ef6a16 / design/interfaces.md I-8、backend.md S-4）──
//
// 上面两节只看文案单点**本身**；本节看**接线**：弹框题干与工具回执是不是真的从单点取值。
// 只断言单点常量的话，`AcceptSheet` 里再写死一句也没人抓（本卡要治的正是这个）。
// 读数 = 弹框问出去的 `question` 字符串 + `reqboard_accept_sheet` 回执的 `note`。
const W = 'session-wording-001'
const REQ_ID = 'REQ-wording01'
const PASS = ACCEPT_ITEM_OPTIONS.pass

let store: ReturnType<typeof makeTestStore>
let deps: ReqboardToolDeps
/** 本次弹框实际问出去的题（题干原文），用于断言题干取了形态常量。 */
let asked: { id?: string; question?: string }[] = []

/** 假弹框：answers 为批次队列（每次 ask 消费一批），并记录问出去的每一题。 */
function sheetTool(answers: any[] | any[][]) {
  const queue: any[][] = Array.isArray(answers) && Array.isArray((answers as any[])[0])
    ? [...(answers as any[][])]
    : [answers as any[]]
  const ask = async (req: { questions: { id?: string; question?: string }[] }) => {
    asked.push(...(req?.questions ?? []))
    return { answers: queue.shift() ?? [] }
  }
  deps.userQuestions = () => ({ ask })
  return defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}
const verifyTool = () => defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })
const sheetOf = async () => (await store.get(REQ_ID))!.verification!.sheet!

describe('弹框通道接线 · 题干取形态常量、回执按真实原因分派（t-ef6a16）', () => {
  beforeEach(async () => {
    store = makeTestStore()
    deps = { store, now: () => Date.now() }
    asked = []
    const r = {
      id: REQ_ID, title: '回执文案接线', description: '', status: 'implementing', category: 'feature',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
    await seedQueueTasks(deps, REQ_ID, Array.from({ length: 3 }, (_, i) => ({
      id: 't-wd000' + (i + 1), requirementId: REQ_ID, title: '任务' + (i + 1), description: '',
      phase: 'implement' as const, side: 'backend' as const, dependsOn: [],
      scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + (i + 1),
      implementation: '改 x' + (i + 1), context: '', status: 'done' as const, blocked: false,
      executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
    })))
    // 老写法提交（不带 results）→ 验收项没有 `result`：于是「人留空点通过」= blank_pass、
    // 「人自填一段无锚点散文」= anchor_missing（该项无原文可改，故不触发人工自填拒绝，TC-10 同口径）。
    await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
  })

  it('FR-4 验收第 1 条：第 2 问题干同时含「命令」「路径」「计数」三类形态词', async () => {
    const id = (await sheetOf()).items[0]!.id
    await run(sheetTool([{ id, selected: [PASS] }]), { batch_size: 1 })
    const q = asked.find(x => x.id === id + '#result')
    expect(q, '无 result 的普通项必须追问第 2 问（实际结果）').toBeDefined()
    expect(q!.question).toContain('命令')
    expect(q!.question).toContain('路径')
    expect(q!.question).toContain('计数')
  })

  it('FR-2 验收第 2 条：回执在 anchor_missing 时给锚点补法（不再写死「点了通过却没结果」）', async () => {
    const id = (await sheetOf()).items[0]!.id
    const out = await run(sheetTool([
      { id, selected: [PASS] },
      // 人自填一段无锚点散文（该项 `result` 为空 ⇒ 记降级而非拒绝）
      { id: id + '#result', custom: '功能正常，没有问题' },
    ]), { batch_size: 1 })
    expect(out.unverified).toBe(1)
    expect((await sheetOf()).items.find(i => i.id === id)!.unverifiedReason).toBe('anchor_missing')
    expect(out.note).toContain('1 项未复核（无锚点 1、未写结果 0）')
    expect(out.note).toContain('锚点') // 补法按真实原因分派
    expect(out.note).toContain('重交')
    expect(out.note).not.toContain('点了通过却没结果') // 写死句已删
  })

  it('FR-2 验收第 1 条：回执在未写结果时给「补上实际结果」措辞（不冒充已复核）', async () => {
    // 说明（本卡实测）：`AcceptSheet` 对「留空点通过」直接推 `status='unverified'`，**不经**
    // `judgePassedVerdict`，故这条路径的 `unverifiedReason` 与老数据同形（缺席）——`reason` 取
    // `undefined`，回执走**中性补法**（它同时含「补上实际结果」与「补锚点」两条路，正是为这种
    // 原因不可考的场合写的）。所以本节断言 `note` 的**用户可见措辞**，不去钉台账字段；
    // 台账里 `blank_pass` 是否落章属裁决侧口径（见回报的偏离说明）。
    const id = (await sheetOf()).items[0]!.id
    const out = await run(sheetTool([{ id, selected: [PASS] }]), { batch_size: 1 })
    expect(out.unverified).toBe(1)
    // 计数分类仍准确：缺席原因按「未写结果」计（老数据口径），不诬告成「无锚点」。
    expect(out.note).toContain('1 项未复核（无锚点 0、未写结果 1）')
    expect(out.note).toContain('补上实际结果') // 没写结果 → 先让他补结果
    expect(out.note).toContain('重交')
    expect(out.note).not.toContain('点了通过却没结果') // 写死句已删
  })
})

// ── 看板 HTTP 通道接线（REQ-261007160829-1991 · design/interfaces.md I-9、backend.md S-4）──
//
// 上一节看的是**弹框**通道；本节看**看板**通道：`POST /req/verdicts` 的 `note` 是不是也按真实原因
// 分派。读数取自**真实 HTTP 处理链**（`createReqboardHandler`）回来的 `payload.data.note`——
// 只断言单点模块的话，路由里再写死一句也没人抓（本卡要治的正是这个）。
const H_W = 'session-wording-http'
const H_REQ = 'REQ-wording-http'

let hDir: string
let hStore: ReturnType<typeof makeTestStore>
let hTasks: QueueTaskStore
let hHandler: ReturnType<typeof createReqboardHandler>

function hReq(body: unknown, url: string): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}
function hRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}
async function hPost(url: string, body: unknown) {
  const res = hRes()
  await hHandler(hReq(body, '/dashboard/api/reqboard' + url), res)
  return res
}
const hSheet = () => hStore.peekAll()[0]!.verification!.sheet!

/** 只读路由源码并抹掉注释（「不再写死旧句」要断**代码**，注释里留档不算违规）。 */
function verdictsRouteCode(): string {
  const raw = readFileSync(new URL('../src/http/routers/verdicts.ts', import.meta.url), 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/**
 * 播种「验收态 + 已有验收单」：2 张顶层卡 + 1 个需求级项 → 3 个验收项，**不落 agent 实测结果**。
 * 为什么刻意不给 `result`：人自填一段无锚点散文时 `isHumanAuthored` 为假 ⇒ 记 `anchor_missing`
 * 降级（正是本卡要断言的那条回执），而不是走 FR-3 的「人自改原文无锚点」400 拒绝。
 */
async function seedHttpAccepting(): Promise<void> {
  const r = {
    id: H_REQ, title: '看板回执文案', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: H_W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await hStore.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  const mk = (id: string, title: string, acceptance: string): TaskRecord => ({
    id, requirementId: H_REQ, title, description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance, context: '',
    status: 'done', blocked: false, executions: [], comments: [], version: 1, statusHistory: [],
    createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: H_W }, updatedBy: { kind: 'agent', sessionId: H_W },
  }) as unknown as TaskRecord
  const tasks = [mk('t-wh0001', '任务一', '单测绿'), mk('t-wh0002', '任务二', '截图可见')]
  await hTasks.createMany(H_REQ, tasks)
  await hStore.mutate(H_REQ, (rec) => {
    const built = buildSheet({
      sheetHistoryLength: 0,
      tasks: tasks.map(t => ({ id: t.id, title: t.title, acceptance: t.acceptance })),
      evidence: ['整单证据：npx vitest run 全绿'],
      generatedAt: 1,
      generatedBy: { kind: 'agent', sessionId: H_W },
    })
    rec.status = 'accepting'
    rec.verification = {
      summary: '交付完成', evidence: ['整单证据：npx vitest run 全绿'], submittedAt: 1,
      submittedBy: { kind: 'agent', sessionId: H_W }, sheet: built.sheet as VerificationSheet,
    }
    return { changed: true }
  })
}

describe('看板通道接线 · `POST /req/verdicts` 的 note 按真实原因分派（I-9）', () => {
  beforeEach(async () => {
    hDir = mkdtempSync(join(tmpdir(), 'pmboard-wording-http-'))
    hStore = makeTestStore()
    hTasks = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: hDir }), now: () => Date.now() })
    hHandler = createReqboardHandler({
      requirementStore: hStore, applicationDeps: { store: hStore } as never, taskStore: hTasks, now: () => Date.now(),
    })
    await seedHttpAccepting()
  })
  afterEach(() => { rmSync(hDir, { recursive: true, force: true }) })

  it('anchor_missing → note 含「未复核」分类计数 + 锚点补法（响应键集不动）', async () => {
    const item = hSheet().items.find(i => i.source.kind === 'task')!
    const res = await hPost('/req/verdicts', {
      id: H_REQ, version: hSheet().version,
      // 人自填一段无锚点散文（该项 `result` 为空 ⇒ 记降级而非 400 拒绝）
      verdicts: [{ itemId: item.id, status: 'passed', opinion: '功能正常，没有问题' }],
    })
    expect(res.statusCode).toBe(200)
    // 台账确实落在 anchor_missing：回执说的原因与台账同源，不是猜的
    expect(hSheet().items.find(i => i.id === item.id)!.unverifiedReason).toBe('anchor_missing')
    expect(res.payload.data.note).toContain('1 项未复核（无锚点 1、未写结果 0）')
    expect(res.payload.data.note).toContain('锚点') // 按真实原因分派：这一类补的是锚点
    expect(res.payload.data.note).toContain('重交')
    // 请求体 / 响应**键集**一律没动（只改 note 文本）
    expect(Object.keys(res.payload.data).sort()).toEqual([
      'failed', 'note', 'passed', 'pending', 'requirement_id', 'rework_tasks', 'sheet_version', 'status',
    ])
  })

  it('FR-2 验收第 2 条同口径：`result` 无锚点的普通项零输入通过 → 回执给锚点补法', async () => {
    // 种子：该项原有 agent 实测**无锚点**（立项描述里的实测形态），人零输入点通过
    await hStore.mutate(H_REQ, (rec) => {
      const a = rec.verification!.sheet!.items.find(i => i.source.kind === 'task')!
      a.result = '功能正常，没有问题'
      return { changed: true }
    })
    const item = hSheet().items.find(i => i.source.kind === 'task')!
    const res = await hPost('/req/verdicts', {
      id: H_REQ, version: hSheet().version,
      verdicts: [{ itemId: item.id, status: 'passed' }], // 零输入通过：opinion 取该项 result
    })
    expect(res.statusCode).toBe(200)
    expect(hSheet().items.find(i => i.id === item.id)!.unverifiedReason).toBe('anchor_missing')
    expect(res.payload.data.note).toContain('1 项未复核（无锚点 1、未写结果 0）')
    expect(res.payload.data.note).toContain('给结果补一个可核验锚点') // 缺口是「没锚点」，不是「没结果」
  })

  it('原因混合（anchor_missing + blank_pass）→ 不猜唯一真因，给中性补法', async () => {
    // 直接造混合台账：两条未复核、原因各一（一条走裁决降级，一条为老数据形态）
    await hStore.mutate(H_REQ, (rec) => {
      const tasks = rec.verification!.sheet!.items.filter(i => i.source.kind === 'task')
      tasks[0]!.status = 'unverified'; tasks[0]!.unverifiedReason = 'anchor_missing'
      tasks[1]!.status = 'unverified'; tasks[1]!.unverifiedReason = 'blank_pass'
      return { changed: true }
    })
    const target = hSheet().items.find(i => i.status === 'pending')!
    const res = await hPost('/req/verdicts', {
      id: H_REQ, version: hSheet().version,
      verdicts: [{ itemId: target.id, status: 'passed', opinion: '需求级：npx vitest run tests/a.test.ts → 12 passed' }],
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.note).toContain('2 项未复核（无锚点 1、未写结果 1）')
    // 集合非单值 ⇒ `undefined`：中性措辞两条路都提，并明说原因未记录（不冒充某一类）
    expect(res.payload.data.note).toContain('原因未记录')
    expect(res.payload.data.note).toContain('补上实际结果')
  })

  it('全是老数据（unverifiedReason 缺席）→ 中性补法；缺席仍按「未写结果」计', async () => {
    await hStore.mutate(H_REQ, (rec) => {
      const a = rec.verification!.sheet!.items.find(i => i.source.kind === 'task')!
      a.status = 'unverified'
      delete a.unverifiedReason // 老数据：该字段落地之前的降级
      return { changed: true }
    })
    const target = hSheet().items.find(i => i.status === 'pending')!
    const res = await hPost('/req/verdicts', {
      id: H_REQ, version: hSheet().version,
      verdicts: [{ itemId: target.id, status: 'passed', opinion: '需求级：npx vitest run tests/a.test.ts → 12 passed' }],
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.note).toContain('1 项未复核（无锚点 0、未写结果 1）')
    expect(res.payload.data.note).toContain('原因未记录') // 不把缺席猜到「无锚点」那一类
  })

  it('无未复核项（只剩余待裁决项）→ 不留多余空格或孤立的补法句', async () => {
    const item = hSheet().items.find(i => i.source.kind === 'task')!
    const res = await hPost('/req/verdicts', {
      id: H_REQ, version: hSheet().version,
      verdicts: [{ itemId: item.id, status: 'passed', opinion: '任务一：npx vitest run tests/a.test.ts → 12 passed' }],
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.note).not.toContain('未复核')
    expect(res.payload.data.note).not.toContain('重交') // 孤立的补法句不许留下
    expect(res.payload.data.note).toContain('待裁决')
  })

  it('源码级：路由里不再写死旧句，且 note 由 VerdictNotices 单点拼出', () => {
    const code = verdictsRouteCode()
    expect(code).not.toContain('裁决已记录（挂起中') // 写死的旧句已从**代码**里消失
    expect(code).toMatch(/from '\.\.\/\.\.\/domain\/workflow\/VerdictNotices\.js'/)
    // 单点模块的两个函数真的被**调用**（只 import 不用 = 没接线）
    expect(code).toMatch(/unverifiedSummaryOf\s*\(/)
    expect(code).toMatch(/unverifiedAdviceOf\s*\(/)
  })
})

// ── 防第二份文案 · 机械钉死（REQ-261007160829-1991 · 本卡最后一段；design/test-cases.md TC-8）──
//
// 上面几节读的是**运行期**回执（`note` 字符串 / 台账字段）；本节把读数搬到**源码**：只要有人在
// 弹框通道（AcceptSheet）或看板通道（verdicts 路由）里**再写死一句**归因 / 补法，就红。
// 接线（import + 真调用）与「没有第二份文案」两件事一起钉住——只钉其中一件都会漏。
//
// 判读纪律（必须）：**先 strip 注释**。两处注释都逐字引用了**被删掉的旧句**（`不再写死「…」`、
// `旧句「…」已删`），那是审计线索、不是违规；不 strip 会把自己人写的留档误判成第二份文案。
//
// 禁区范围说明：本节只禁**写死的归因 / 补法句**（旧句原文片段），**不**禁「未复核」这个词本身——
// 同文件里另有一条**合法**的计数回执（归档前置提示 `未复核 N 项`），它既不归因也不给补法，
// 与文案单点各司其职。禁词表见 `BANNED_HARDCODED_NOTES`。
/** 抹掉注释（块注释与行注释）：源码级断言只断**代码**。 */
const WITHOUT_COMMENTS = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')

/** 被删掉的写死旧句（片段）：出现在**代码**里即红（至少覆盖「点了通过却没结果」与「裁决已记录（挂起中」）。 */
const BANNED_HARDCODED_NOTES = [
  '点了通过却没结果',
  '裁决已记录（挂起中',
  '挂起中，或仍有未处置的缺口项',
] as const

/** 在（已 strip 注释的）源码里找写死的归因 / 补法句；返回命中片段（空数组 = 干净）。 */
function hardcodedNoteHits(code: string): string[] {
  return BANNED_HARDCODED_NOTES.filter(fragment => code.includes(fragment))
}

const DIALOG_CHANNEL_SRC = readFileSync(new URL('../src/application/use-cases/AcceptSheet.ts', import.meta.url), 'utf8')
const HTTP_CHANNEL_SRC = readFileSync(new URL('../src/http/routers/verdicts.ts', import.meta.url), 'utf8')

/** 两条通道：名字（报错可读）+ 源码 + strip 后的在场锚（防「读空了 ⇒ 恒绿」）。 */
const WORDING_CHANNELS = [
  { name: '弹框通道 src/application/use-cases/AcceptSheet.ts', raw: DIALOG_CHANNEL_SRC, anchor: 'export async function acceptSheet' },
  { name: '看板通道 src/http/routers/verdicts.ts', raw: HTTP_CHANNEL_SRC, anchor: 'export function createVerdictsRouter' },
] as const

const VERDICT_NOTICES_IMPORT = /from '\.\.\/\.\.\/domain\/workflow\/VerdictNotices\.js'/

describe('防第二份文案 · 两条通道源码级（本卡机械钉死）', () => {
  it('两处都 import 了文案单点，且 import 清单里两个函数都在（只 import 常量 = 没接线）', () => {
    for (const ch of WORDING_CHANNELS) {
      const code = WITHOUT_COMMENTS(ch.raw)
      // 反向自检：strip 后拿到的确实是这份源码（不是空串 / 不是被 strip 吃光）
      expect(code.length, ch.name + '：strip 后源码过短，断言会假绿').toBeGreaterThan(1000)
      expect(code, ch.name + '：strip 后认不出这份文件').toContain(ch.anchor)
      expect(code, ch.name + '：未 import 文案单点').toMatch(VERDICT_NOTICES_IMPORT)
      expect(code, ch.name + '：import 清单里没有 unverifiedSummaryOf')
        .toMatch(/import\s*\{[^}]*\bunverifiedSummaryOf\b[^}]*\}\s*from '\.\.\/\.\.\/domain\/workflow\/VerdictNotices\.js'/)
      expect(code, ch.name + '：import 清单里没有 unverifiedAdviceOf')
        .toMatch(/import\s*\{[^}]*\bunverifiedAdviceOf\b[^}]*\}\s*from '\.\.\/\.\.\/domain\/workflow\/VerdictNotices\.js'/)
    }
  })

  it('两处都**真调用**了 unverifiedSummaryOf 与 unverifiedAdviceOf（只 import 不用 = 没接线）', () => {
    for (const ch of WORDING_CHANNELS) {
      const code = WITHOUT_COMMENTS(ch.raw)
      expect(code.length, ch.name + '：strip 后源码过短，断言会假绿').toBeGreaterThan(1000)
      expect(code, ch.name + '：unverifiedSummaryOf 未被调用').toMatch(/unverifiedSummaryOf\s*\(/)
      expect(code, ch.name + '：unverifiedAdviceOf 未被调用').toMatch(/unverifiedAdviceOf\s*\(/)
    }
  })

  it('strip 注释后，两处代码里都不再有写死的归因 / 补法句', () => {
    for (const ch of WORDING_CHANNELS) {
      const code = WITHOUT_COMMENTS(ch.raw)
      expect(code.length, ch.name + '：strip 后源码过短，断言会假绿').toBeGreaterThan(1000)
      expect(hardcodedNoteHits(code), ch.name + ' 的**代码**里还有写死的归因 / 补法句').toEqual([])
    }
  })

  it('反向自检（阳性对照）：扫描器真抓得住写死的句子；注释里的留档不算违规', () => {
    // 阳性：合成串必须被点名（否则 `toEqual([])` 可能只是扫描器坏了）
    expect(hardcodedNoteHits("note: '点了通过却没结果，请补结果'")).toEqual(['点了通过却没结果'])
    expect(hardcodedNoteHits("note: '裁决已记录（挂起中，或仍有未处置的缺口项）'"))
      .toEqual(['裁决已记录（挂起中', '挂起中，或仍有未处置的缺口项'])
    expect(hardcodedNoteHits("note: '全部已裁决 → 请点验收通过归档'")).toEqual([])

    // 阴性：同一个串放进注释 → strip 后不再命中（这正是「先 strip 注释」的语义）
    const commented = "// 旧句：点了通过却没结果（已删）\nconst note = 'ok'"
    expect(hardcodedNoteHits(WITHOUT_COMMENTS(commented))).toEqual([])
    // 且 strip 不会把代码一起吃掉（防「strip 太狠 ⇒ 恒绿」）
    expect(WITHOUT_COMMENTS(commented)).toContain("const note = 'ok'")
  })
})

// ── 验收期修正（2026-10-07）：弹框第 2 问的结尾引导**按项类型分派**。────────────────────────
// 事故：验收本需求自身时，系统缺口项（孤儿用例 / 锚点失效）要通过，人按题干写下内容 →
// `system_item_disposition_required` 整批被拒。真因是引导与要求不一致：系统项要「处置」，
// 而题干一律按「请贴实际结果」写、FR-4 又追加了「可核验形态：命令 + 读数」——照着写必被拒。
describe('第 2 问结尾引导按项类型分派（验收期修正 · 2026-10-07）', () => {
  it('系统缺口项问「处置」：含两义与正例，且不追加实测结果的形态要求', () => {
    const tail = resultQuestionTailOf({ gapKind: 'orphan', criterion: '孤儿用例' })
    expect(tail).toContain('处置')
    expect(tail).toContain('已处置')
    expect(tail).toContain('确认无需')
    // 关键：系统项**不**出现「可核验形态：命令 + 读数」——那会把人引向必然被拒的写法
    expect(tail).not.toContain(ACCEPT_RESULT_FORM_HINT)
  })

  it('普通项仍问实测结果 + 形态（回归：FR-4 判据不变）', () => {
    const tail = resultQuestionTailOf({ criterion: '普通项' })
    expect(tail).toContain('请贴实际结果')
    expect(tail).toContain('命令')
    expect(tail).toContain('路径')
    expect(tail).toContain('计数')
    expect(tail).not.toContain('确认无需')
  })

  it('提示给的正例真的能过处置判据，而被换掉的旧引导写法必然被拒（提示与判据不许说反）', () => {
    // 提示里那两句正例（逐字取自 SYSTEM_ITEM_DISPOSITION_HINT）
    expect(isValidDisposition('补了 E2E 用例：tests/e2e-x.test.ts')).toBe(true)
    expect(isValidDisposition('确认无需 E2E：纯函数模块，无外部接口')).toBe(true)
    // 旧引导教人写的形态（命令 + 读数）——正是本修正要掐掉的那种「照题干写必被拒」
    expect(isValidDisposition('npx vitest run tests/x.test.ts → 21 passed')).toBe(false)
  })
})
