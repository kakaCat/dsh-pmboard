/**
 * 看板 HTTP 逐项裁决口径与来源写入（REQ-261006092213-4f5b FR-4 / FR-6 · D-5）serves: FR-4, FR-6
 *
 * 看板通道（`POST /req/verdicts`）与弹框通道必须**同口径**：
 *   · 留空点通过 → 200，`opinion` 取该项 `item.result`（零输入通过），**不再 400**；
 *   · 无 `result` 且留空 → 记 `unverified`（不计入通过），**同样不是 400**；
 *   · 人改了文本（≠ `item.result`）→ 写 `result` 并标 `resultSource='human'`（来源可辨）；
 *   · 放行判据：未复核项计入「不合规通过」——不带 `confirm_override` 点「验收通过」仍被拦。
 * 既有硬规则不动：`failed` 缺意见、`not_verifiable` 缺原因 → 仍 400。
 *
 * 为什么单独一个文件：这条口径以前**只在路由层**（`verdictRequiresOpinion` + 400），
 * 域层放宽后必须有用例锁住"路由不再抢先判"，否则两处判定迟早再漂。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { buildSheet } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { RequirementRecord, TaskRecord, VerificationSheet } from '../src/shared/protocol.js'

const W = 'session-vh-123'
const REQ = 'REQ-vh1234'
let dir: string
let store: ReturnType<typeof makeTestStore>
let taskStore: QueueTaskStore
let handler: ReturnType<typeof createReqboardHandler>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-verdicts-http-'))
  store = makeTestStore()
  taskStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: dir }), now: () => Date.now() })
  handler = createReqboardHandler({
    requirementStore: store, applicationDeps: { store: store } as never, taskStore, now: () => Date.now(),
  })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

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
async function post(url: string, body: unknown) {
  const res = fakeRes()
  await handler(fakeReq(body, '/dashboard/api/reqboard' + url), res)
  return res
}
const sheetNow = () => store.peekAll()[0]!.verification!.sheet!

/**
 * 播种「验收态 + 已有验收单」的需求：2 张顶层卡 → 3 个验收项。
 * `withResult=true` 时给两个任务项落 agent 实测结果（模拟带 `results` 提交后的台账）。
 */
async function seedAccepting(withResult: boolean): Promise<VerificationSheet> {
  const r = {
    id: REQ, title: '看板需求', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  const mk = (id: string, title: string, acceptance: string): TaskRecord => ({
    id, requirementId: REQ, title, description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance, context: '',
    status: 'done', blocked: false, executions: [], comments: [], version: 1, statusHistory: [],
    createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  }) as unknown as TaskRecord
  const tasks = [mk('t-vh0001', '任务一', '单测绿'), mk('t-vh0002', '任务二', '截图可见')]
  await taskStore.createMany(REQ, tasks)
  await store.mutate(REQ, (rec) => {
    const built = buildSheet({
      sheetHistoryLength: 0,
      tasks: tasks.map(t => ({ id: t.id, title: t.title, acceptance: t.acceptance })),
      evidence: ['整单证据：npx vitest run 全绿'],
      generatedAt: 1,
      generatedBy: { kind: 'agent', sessionId: W },
    })
    if (withResult) {
      for (const it of built.sheet.items) {
        if (it.source.kind !== 'task') continue
        it.result = 'agent 实测：npx vitest run ' + it.source.taskId + ' → 全绿'
        it.resultSource = 'agent'
      }
    }
    rec.status = 'accepting'
    rec.verification = {
      summary: '交付完成', evidence: ['整单证据：npx vitest run 全绿'], submittedAt: 1,
      submittedBy: { kind: 'agent', sessionId: W }, sheet: built.sheet as VerificationSheet,
    }
    return { changed: true }
  })
  return sheetNow()
}

describe('看板 HTTP 逐项裁决：空 opinion 与来源写入（REQ-261006092213-4f5b）', () => {
  it('留空点通过（该项有 agent 实测结果）→ 200，opinion 取该项 result，来源仍 agent', async () => {
    const sheet = await seedAccepting(true)
    const item = sheet.items.find(i => i.source.kind === 'task')!
    const res = await post('/req/verdicts', {
      id: REQ, version: sheet.version, verdicts: [{ itemId: item.id, status: 'passed' }],
    })
    expect(res.statusCode).toBe(200)
    const after = sheetNow().items.find(i => i.id === item.id)!
    expect(after.status).toBe('passed')
    expect(after.opinion).toBe(item.result) // 零输入通过：留痕有出处
    expect(after.resultSource).toBe('agent')
  })

  it('留空点通过（该项无结果）→ 200 且记 unverified（不是 400）', async () => {
    const sheet = await seedAccepting(false)
    const item = sheet.items.find(i => i.source.kind === 'task')!
    const res = await post('/req/verdicts', {
      id: REQ, version: sheet.version, verdicts: [{ itemId: item.id, status: 'passed' }],
    })
    expect(res.statusCode).toBe(200)
    const after = sheetNow().items.find(i => i.id === item.id)!
    expect(after.status).toBe('unverified')
    expect(after.opinion).toBeUndefined()
  })

  it('人改了文本（≠ result）→ result 更新为人的文本且 resultSource=human', async () => {
    const sheet = await seedAccepting(true)
    const item = sheet.items.find(i => i.source.kind === 'task')!
    const edited = '我复跑了一遍：12 passed'
    const res = await post('/req/verdicts', {
      id: REQ, version: sheet.version, verdicts: [{ itemId: item.id, status: 'passed', opinion: edited }],
    })
    expect(res.statusCode).toBe(200)
    const after = sheetNow().items.find(i => i.id === item.id)!
    expect(after.status).toBe('passed')
    expect(after.result).toBe(edited)
    expect(after.resultSource).toBe('human')
    expect(after.opinion).toBe(edited)
  })

  it('FR-6 放行判据：存在未复核项时「验收通过」被拦（不带覆盖说明）', async () => {
    const sheet = await seedAccepting(false)
    const item = sheet.items.find(i => i.source.kind === 'task')!
    // 先逐项裁决：一项留空通过 → unverified
    await post('/req/verdicts', { id: REQ, version: sheet.version, verdicts: [{ itemId: item.id, status: 'passed' }] })
    expect(sheetNow().items.find(i => i.id === item.id)!.status).toBe('unverified')

    const res = await post('/req/verify/pass', { id: REQ })
    expect(res.statusCode).toBe(400)
    expect(res.payload.code).toBe('verify_override_required')
    expect(String(res.payload.error)).toContain('未复核 1 项')
    expect(store.peekAll()[0]!.status).toBe('accepting') // 未归档
  })

  it('响应形状不变：逐项裁决回执仍是既有键集合（前端消费点不动）', async () => {
    const sheet = await seedAccepting(true)
    const item = sheet.items.find(i => i.source.kind === 'task')!
    const res = await post('/req/verdicts', {
      id: REQ, version: sheet.version, verdicts: [{ itemId: item.id, status: 'passed' }],
    })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.payload.data).sort()).toEqual([
      'failed', 'note', 'passed', 'pending', 'requirement_id', 'rework_tasks', 'sheet_version', 'status',
    ])
  })

  it('既有硬规则不被放宽：failed 缺意见 / not_verifiable 缺原因 → 仍 400', async () => {
    const sheet = await seedAccepting(true)
    const [a, b] = sheet.items
    const r1 = await post('/req/verdicts', { id: REQ, version: sheet.version, verdicts: [{ itemId: a!.id, status: 'failed' }] })
    expect(r1.statusCode).toBe(400)
    const r2 = await post('/req/verdicts', { id: REQ, version: sheet.version, verdicts: [{ itemId: b!.id, status: 'not_verifiable' }] })
    expect(r2.statusCode).toBe(400)
    expect(sheetNow().items.every(i => i.status === 'pending')).toBe(true) // 两次拒绝都没写台账
  })
})
