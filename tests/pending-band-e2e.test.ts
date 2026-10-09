/**
 * t10 联调（REQ-261007223647-da5d · serves: FR-5）：**真服务端载荷 → 客户端解析 → 渲染**一条链走通。
 *
 * 为什么单开一个文件：前面几张卡各自证明了一半（服务端投影 / 客户端解析 / 组件渲染），
 * 但"两半接起来是否对得上"没人证明过——字段名、嵌套层级、类型（number vs string）
 * 任何一处不一致，单测都是绿的，线上横带却永远不出现。本文件用**真路由 + 真注册表**
 * 取一次 /state，再把那段载荷喂进客户端解析与渲染，断言首屏横带真的出得来。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { parsePendingConfirms } from '../src/client/api.ts'
import { renderPendingConfirmBand } from '../src/client/views/pending-confirm.ts'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const NOW = 1_700_000_000_000
const REQ = 'REQ-e2e-band'

function reqSeed(): RequirementRecord {
  return {
    id: REQ,
    title: '端到端横带标本',
    description: '',
    category: 'feature',
    status: 'brainstorming',
    blocked: false,
    sourceSessionId: 'session-e2e',
    comments: [],
    version: 1,
    createdAt: NOW - 5_000,
    updatedAt: NOW - 5_000,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    artifacts: [{
      stage: 'brainstorming',
      kind: 'requirement',
      path: 'docs/requirements/' + REQ + '/requirement.md',
      registeredAt: NOW - 5_000,
    } as StageArtifact],
  } as unknown as RequirementRecord
}

let base: string
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'pmboard-e2e-band-')) })

function fakeReq(url: string): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = 'GET'
  req[Symbol.asyncIterator] = async function* () { /* GET 无 body */ }
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

async function stateWithTicket(): Promise<{ payload: any }> {
  const store = makeTestStore()
  await store.replaceAll('seed', { schemaVersion: 9, revision: 1, requirements: [reqSeed()], triages: [] })
  const registry = new PendingConfirmRegistry({
    now: () => NOW - 60_000,
    newTicket: () => 'pc-e2e1',
  })
  registry.register({ windowKey: 'session-e2e', requirementId: REQ, target: 'artifact', kind: 'requirement' })
  const handler = createReqboardHandler({
    requirementStore: store,
    taskStore: taskStoreAt(base),
    now: () => NOW,
    cwd: base,
    pendingConfirms: registry,
  })
  const res = fakeRes()
  await handler(fakeReq('/dashboard/api/reqboard/state'), res)
  return { payload: res.payload }
}

describe('t10 联调 · /state 真载荷 → 客户端解析 → 首屏横带', () => {
  it('服务端的票经客户端解析后真的渲染出一行（字段名/类型对不上就会空）', async () => {
    const { payload } = await stateWithTicket()
    expect(payload.success).toBe(true)
    const raw = payload.data.pending_confirms
    expect(Array.isArray(raw)).toBe(true)
    expect(raw).toHaveLength(1)

    // 客户端侧：宽松解析（这一步就是线上 fetchState 做的事）
    const tickets = parsePendingConfirms(raw)
    expect(tickets).toHaveLength(1)
    expect(tickets[0]!.requirement_id).toBe(REQ)

    const band = renderPendingConfirmBand(tickets, { now: NOW })
    expect(band).toContain('data-pending-count="1"')
    expect(band).toContain('data-ticket="pc-e2e1"')
    expect(band).toContain('剩余 29:00')
    expect(band).toContain('data-action="pending-answer"')
    expect(band).toContain('data-action="pending-repost"')
  })

  it('票被作答（落章）后 → 服务端不再下发 → 客户端空数组 → 横带消失', async () => {
    const store = makeTestStore()
    await store.replaceAll('seed', {
      schemaVersion: 9, revision: 1,
      requirements: [{
        ...reqSeed(),
        artifacts: [{
          stage: 'brainstorming', kind: 'requirement',
          path: 'docs/requirements/' + REQ + '/requirement.md', registeredAt: NOW - 5_000, confirmedAt: NOW - 1_000,
        } as StageArtifact],
      } as RequirementRecord],
      triages: [],
    })
    const registry = new PendingConfirmRegistry({ now: () => NOW - 60_000, newTicket: () => 'pc-e2e2' })
    registry.register({ windowKey: 'session-e2e', requirementId: REQ, target: 'artifact', kind: 'requirement' })
    const handler = createReqboardHandler({
      requirementStore: store, taskStore: taskStoreAt(base), now: () => NOW, cwd: base, pendingConfirms: registry,
    })
    const res = fakeRes()
    await handler(fakeReq('/dashboard/api/reqboard/state'), res)
    expect(res.payload.data.pending_confirms).toEqual([])
    expect(renderPendingConfirmBand(parsePendingConfirms(res.payload.data.pending_confirms), { now: NOW })).toBe('')
  })
})
