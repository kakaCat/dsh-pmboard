/**
 * 看板「确认产物」通道纳入切面（REQ-e3b6a0 t9 / FR-9 / AC-9.1 · AC-9.2 · AC-9.3）。
 *
 * 锁三件事：
 *  ① 窗口在线 → 落章 + **确认即推进** + 触发后置链（返回体 advanced=true 且 delivered=true）；
 *  ② 窗口离线 → **仍然推进**（t2 / FR-4：推进是台账动作），只是 delivered=false，note 如实说明；
 *  ③ 幂等：再次确认同一产物**不再推进**（护栏 = 确认的产物必须是该门要求的产物）。
 *
 * @module dsh-pmboard/tests/artifact-confirm-board
 */
import { makeHarness, makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import { createGatePostChain } from '../src/application/gate/GatePostChain.js'
import { createPendingGateStore } from '../src/application/gate/PendingGate.js'
import type { RequirementRecord } from '../src/shared/protocol.js'
import { expectCode } from './helpers/code-assert.js'

const W = 'session-board-001'
const REQ = 'REQ-bd0001'
const DOC = 'docs/requirements/REQ-bd0001/requirement.md'

let dir: string
let store: ReturnType<typeof makeTestStore>
/** t2：看板推进改走单点 ⇒ 需要完整用例依赖（组合根在生产里经 ctx.deps.applicationDeps 传入）。 */
let app: ReturnType<typeof makeHarness>['deps']

function fakeReq(method: string, url: string, body?: unknown): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.payload = undefined
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

/** 空 handler 链（只验证"被登记/被跑过"），配可窥探的登记表。 */
function chainSpy() {
  const pending = createPendingGateStore()
  const chain = createGatePostChain({ handlers: [], enabled: true, pending })
  return { chain, pending }
}

async function seed(status: string, withArtifact = true): Promise<void> {
  const seedRec = {
      id: REQ, title: '看板确认通道', description: '', category: 'feature', status,
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
      ...(withArtifact
        ? {
            artifacts: [{
              stage: 'brainstorming', kind: 'requirement', path: DOC,
              registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
            }],
          }
        : {}),
    } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [seedRec], triages: [] })
}

function handler(online: boolean, chain: ReturnType<typeof chainSpy>['chain']) {
  return createReqboardHandler({ requirementStore: store,
    taskStore: taskStoreAt(dir),
    now: () => 1000,
    gateChain: chain,
    agents: () => (online ? { get: () => ({ id: W, session: { fake: true } }) } : { get: () => undefined }),
    applicationDeps: app,
  })
}

const CONFIRM = '/dashboard/api/reqboard/req/artifact/confirm'
const body = { id: REQ, kind: 'requirement' }

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-board-confirm-'))
  store = makeTestStore()
  // 单点的依赖：内存台账夹具 + 本用例自己的 store（同一份真相）
  app = { ...makeHarness().deps, store: store as unknown as ReturnType<typeof makeHarness>['deps']['store'] }
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('看板确认：确认即推进 + 链侧投递（AC-9.1）', () => {
  it('窗口在线 → advanced=true、delivered=true，状态已推进，且链路被登记', async () => {
    await seed('brainstorming')
    const { chain, pending } = chainSpy()
    const res = fakeRes()
    await handler(true, chain)(fakeReq('POST', CONFIRM, body), res)
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data.advanced).toBe(true)
    expect(res.payload.data.delivered).toBe(true)
    expect(store.peekAll()[0]!.status).toBe('design')
    expect(pending.size()).toBe(0) // 已被 runPending 消费
    expect(chain.stats().executed).toBe(1)
    const comments = store.peekAll()[0]!.comments.map(c => c.body).join(' | ')
    expect(comments).toContain('[自动推进]')
    expect(comments).toContain('[产物确认]')
  })
})

describe('看板确认：窗口离线仍推进、只是不投递（t2 / FR-4）', () => {
  it('agents.get 返回 undefined → advanced=true、delivered=false，note 如实说明未投递', async () => {
    await seed('brainstorming')
    const { chain } = chainSpy()
    const res = fakeRes()
    await handler(false, chain)(fakeReq('POST', CONFIRM, body), res)
    // 推进是**台账动作**，不该被"窗口在线"挡住（改造前这里返回 advanced=false，状态没动）
    expect(res.payload.data.advanced).toBe(true)
    expect(res.payload.data.delivered).toBe(false)
    expect(String(res.payload.data.note)).toContain('窗口不在线')
    expect(store.peekAll()[0]!.status).toBe('design') // 已推进
    expect(chain.stats().executed).toBe(0)            // 没有投递对象 ⇒ 不起轮，但不影响推进
    // 落章照旧（确认本身有效）
    expect(store.peekAll()[0]!.artifacts![0]!.confirmedVia).toBe('board')
  })
})

describe('看板确认：幂等（AC-9.3）', () => {
  it('再次确认同一产物 → 不再推进（护栏：产物须是该门要求的产物）', async () => {
    await seed('brainstorming')
    const { chain } = chainSpy()
    const h = handler(true, chain)
    await h(fakeReq('POST', CONFIRM, body), fakeRes())
    expect(store.peekAll()[0]!.status).toBe('design')
    const res2 = fakeRes()
    await h(fakeReq('POST', CONFIRM, body), res2)
    expect(res2.payload.data.advanced).toBe(false)
    expect(store.peekAll()[0]!.status).toBe('design') // 没被推到 decomposing
  })

  it('未登记的产物 → 400 拒绝（既有语义不变）', async () => {
    await seed('brainstorming', false)
    const { chain } = chainSpy()
    const res = fakeRes()
    await handler(true, chain)(fakeReq('POST', CONFIRM, body), res)
    expect(res.statusCode).toBe(400)
    expect(res.payload.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（未登记的产物 = badInput → invalid_input）
    expectCode(res.payload, 'invalid_input')
  })
})
