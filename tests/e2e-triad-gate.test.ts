/**
 * 全链路 E2E（REQ-640a55 t-ad7826 / FR-1、FR-2）
 *
 * 要证明两件事，缺一即等于门没接上：
 *   ① **新骨架产出的卡能直接过自己新接的门**——否则每次拆分都会立刻被自己的门禁拦死；
 *   ② 卡被改坏（删掉一节）后，出口门禁确实拦下。
 *
 * 链路按真实顺序走：需求文档 → 计划提交 → 人批准 → 拆分落库 → 确认拆分产物 → 推进入实施。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { definePlanSubmitTool, defineDecomposeTool, defineMoveTool, taskStoreOf } from './helpers/tool-deps.js'
// 「放行」类断言改走**看板人路径**（design/fix-design.md BUG-2）：decomposing → implementing 是人工闸门，
// 工具路径的 actor 硬编码 'agent' ⇒ 结构上不可达。形状照抄 tests/artifact-gates.test.ts:417。
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { createReqboardHandler } from '../src/http/routes.js'

const W = 'session-e2e-0001'
const REQ = 'REQ-e2e1'
const REQ_REL = 'docs/requirements/' + REQ + '/requirement.md'

/** 需求文档：feature 类型必需的四节 + 一条 FR-1（覆盖门禁靠它认条款）。 */
const REQ_DOC = [
  '---', 'req_id: REQ-e2e1', 'category: feature', '---', '# 需求',
  '', '## 1. 产品定义', '把甲做出来', '', '## 2. 用户与角色', '用户要甲',
  '', '## 6. 功能点', '', '**FR-1 甲**：把甲做出来。', '', '## 8. 边界（本轮不做）', '不做乙',
].join('\n')

const PLAN_TASKS = [{
  key: 'k1', title: '把甲做完', phase: 'implement', side: 'backend',
  description: '做甲', acceptance: 'npx vitest run tests/a.test.ts 全绿', implementation: '改 src/a.ts 加甲 + 单测',
}]

/** 看板 HTTP 请求替身（与 tests/artifact-gates.test.ts 的 fakeReq/fakeRes 同款形状）。 */
function fakeReq(body: unknown, url: string): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}
function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

describe('全链路：需求文档 → 计划批准 → 拆分 → 出口门禁', () => {
  let dir: string
  let prevCwd: string
  let store: ReturnType<typeof makeTestStore>
  let plan: { execute: (a: unknown, e: unknown) => Promise<any> }
  let decompose: { execute: (a: unknown, e: unknown) => Promise<any> }
  let move: { execute: (a: unknown, e: unknown) => Promise<any> }
  /** 看板 HTTP 入口：「放行」类断言走它（人工闸门只认人）。 */
  let board: ReturnType<typeof createReqboardHandler>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-triad-e2e-'))
    prevCwd = process.cwd()
    process.chdir(dir)
    store = makeTestStore()
    const deps = { store, now: () => Date.now(), doneThrottleMs: 0 }
    plan = definePlanSubmitTool(deps) as never
    decompose = defineDecomposeTool(deps) as never
    move = defineMoveTool(deps) as never
    // 队列用 taskStoreOf(deps) 的同一实例（记忆化）：工具播种的卡，看板入口必须看得见。
    board = createReqboardHandler({
      requirementStore: store, taskStore: taskStoreOf(deps), now: () => Date.now(),
      docs: new FileDocRepository({ workspaceRoot: dir }),
    })
  })
  afterEach(() => {
    process.chdir(prevCwd)
    rmSync(dir, { recursive: true, force: true })
  })

  /** 看板人路径的一次 POST。 */
  async function post(url: string, body: unknown) {
    const res = fakeRes()
    await board(fakeReq(body, '/dashboard/api/reqboard' + url), res)
    return res
  }

  const exec = { agent: { id: W } }

  /** 走到「卡已落库、拆分产物已确认」，返回唯一那张卡的 id。 */
  async function upToConfirmedDecomposition(): Promise<string> {
    mkdirSync(join(dir, 'docs/requirements', REQ), { recursive: true })
    writeFileSync(join(dir, REQ_REL), REQ_DOC)
    // feature 类型的必填设计文档（门禁只查文件存在性；无二级标题 → 不需要 serves 标注）
    const designDir = join(dir, 'docs/requirements', REQ, 'design')
    mkdirSync(designDir, { recursive: true })
    for (const f of ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']) {
      writeFileSync(join(designDir, f), '# ' + f + '\n\n最小 E2E 夹具（不设二级标题）。\n')
    }
    const r = {
      id: REQ, title: '甲需求', description: '', status: 'decomposing', blocked: false, category: 'feature',
      sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      statusHistory: [{ status: 'design', at: 1, by: { kind: 'human' } }],
    }
    await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r as never], triages: [] })

    // REQ-2d1c74 FR-5：plan_submit 起要求提交路径真实落盘
    // 2026-10-06 缺口 4 之四：落盘内容必须带任务表且收录 tasks[] 的 key（plan_doc_task_table_incomplete）
    writeFileSync(join(dir, 'docs/requirements', REQ, 'plan.md'), [
      '# 拆分计划',
      '',
      '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
      '|---|---|---|---|---|',
      '| k1 | 把甲做完 | — | M | 跑 npx vitest run tests/a.test.ts 全绿 |',
      '',
    ].join('\n'))
    await plan.execute({ path: 'docs/requirements/' + REQ + '/plan.md', summary: '把甲做出来', tasks: PLAN_TASKS }, exec)
    await store.mutate(REQ, (req0) => {      if (req0.plan !== undefined) { req0.plan.approvedAt = 1000; req0.plan.approvedBy = { kind: 'human' } }
      return { changed: true }
    })
    const out = await decompose.execute({
      tasks: [{ ...PLAN_TASKS[0], requirement_refs: ['FR-1'] }],
    }, exec)
    const taskId = out.created[0].id as string

    // 人确认拆分产物（看板一键确认 / 弹框落章都写这里）
    await store.mutate(REQ, (req0) => {      for (const a of req0.artifacts ?? []) {
        if (a.kind === 'decomposition') { a.confirmedAt = 1000; a.confirmedBy = { kind: 'human' } }
      }
      return { changed: true }
    })
    return taskId
  }

  const cardPath = (taskId: string) => join(dir, 'docs/requirements', REQ, 'tasks', taskId + '.md')

  it('骨架产出的卡直接过出口门禁（需求 → 计划 → 拆分 → 推进 implementing）', async () => {
    const taskId = await upToConfirmedDecomposition()
    const card = readFileSync(cardPath(taskId), 'utf8')
    // 骨架必须直出三要素节，且各节正文非空（空节等于没写）
    for (const h of ['## 在做什么', '## 解决什么问题', '## 得到什么结果']) {
      const i = card.indexOf(h)
      expect(i, '骨架缺节 ' + h).toBeGreaterThanOrEqual(0)
      const rest = card.slice(i + h.length)
      const stop = rest.indexOf('\n## ')
      expect((stop >= 0 ? rest.slice(0, stop) : rest).trim().length, h + ' 正文为空').toBeGreaterThan(0)
    }
    const out = await post('/req/move', { id: REQ, to: 'implementing', actor: 'human' })
    expect(out.statusCode).toBe(200)
    expect(out.payload.data.status).toBe('implementing')
  })

  it('卡被改坏（删掉一节）→ 出口门禁拦下 task_card_incomplete', async () => {
    const taskId = await upToConfirmedDecomposition()
    const card = readFileSync(cardPath(taskId), 'utf8')
    writeFileSync(cardPath(taskId), card.replace('## 得到什么结果', '## 验收标准'))
    await expect(move.execute({ to: 'implementing' }, exec)).rejects.toThrow(/task_card_incomplete/)
  })
})
