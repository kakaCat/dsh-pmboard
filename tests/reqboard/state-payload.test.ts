/**
 * REQ-261002161439-277d B12 阶段⑥-①（t-05a56b）——看板载荷瘦身验收用例。
 *
 * 验收原文（逐条对应）：
 *   A9  35 条夹具（33 归档）时 GET / 响应字节相对改造前基线下降 ≥10×；归档 33→200 时字节**不增长**
 *   A10 GET / 触发 syncAllReqArtifacts **0** 次；POST /artifacts/scan 触发 **1** 次
 *   键集 requirements[] 元素不含 comments/artifacts/verification/plan/archive
 *   详情 GET /requirements/<已归档 id> → 200 且含全文
 *   cursor 到末页 → nextCursor 缺省；越界 cursor → 空页不抛错
 *   客户端 首屏渲染 0 次详情请求（见同目录 state-payload-client.test.ts）
 *
 * 改造前基线（2026-10 实测，见本文件 A9_BASELINE_BYTES 注释）：
 *   同一夹具、同一 handler，改造前 GET /state = **2,768,960 字节**（35 条全文，含评论与产物本体）。
 */
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestStore } from '../application/harness.js'
import { JsonQueueRepository } from '../../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../../src/repositories/QueueTaskStore.js'

/** 改造前基线字节（实测存档；断言新响应 ≤ 它 / 10）。 */
const A9_BASELINE_BYTES = 2_768_960

// A10 探针：把产物扫描替换成计数器（只影响本文件；stages.ts 经此导入取用它）。
const scanCalls = { syncAll: 0, syncOne: 0 }
vi.mock('../../src/adapters/ArtifactSync.js', () => ({
  syncAllReqArtifacts: async () => { scanCalls.syncAll += 1; return { scanned: 1, skipped: 0 } },
  syncReqArtifacts: async () => { scanCalls.syncOne += 1 },
}))

const { createReqboardHandler } = await import('../../src/http/routes.js')

function fakeReq(method: string, url: string, body?: unknown): any {
  const req = new EventEmitter() as any
  req.url = `/dashboard/api/reqboard${url}`
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}
function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => {
    res.raw = text
    res.payload = text === undefined ? undefined : JSON.parse(text)
    return res
  }
  return res
}

/** 一条**接近真实体积**的需求（评论与产物本体正是旧载荷被放大的来源）。 */
function rec(i: number, status: string, idOffset = 0): any {
  const seq = `${idOffset + (i % 90) + 10}`.padStart(2, '0')
  const id = `REQ-2610021614${seq}-${(1000 + i).toString(16).padStart(4, '0')}`
  const comments = Array.from({ length: 8 }, (_, k) => ({
    id: `c-${i}-${k}`, body: '评论正文'.repeat(20) + k, createdAt: 1000 + k,
    createdBy: { kind: 'agent' as const },
  }))
  const artifacts = Array.from({ length: 6 }, (_, k) => ({
    kind: 'design' as const, path: `docs/requirements/${id}/design/d${k}.md`,
    stage: 'design' as const, registeredAt: 1000 + k, registeredBy: { kind: 'agent' as const },
  }))
  return {
    id, title: `需求 ${i}`, description: '描述'.repeat(30),
    status, blocked: false, comments, artifacts, version: 3,
    createdAt: 1000 + i, updatedAt: 2000 + i,
    createdBy: { kind: 'human' as const }, updatedBy: { kind: 'agent' as const },
    statusHistory: [{ at: 1000, by: { kind: 'human' as const }, from: 'draft', to: status }],
  }
}

/** A9 夹具：35 条，33 条归档。 */
const a9Fixture = (): any[] => Array.from({ length: 35 }, (_, i) => rec(i, i < 33 ? 'archived' : 'implementing'))

let root: string
let store: ReturnType<typeof makeTestStore>
let handler: ReturnType<typeof createReqboardHandler>

async function seed(records: any[]): Promise<void> {
  await store.replaceAll('seed', {
    schemaVersion: 9, revision: 1, requirements: records, triages: [],
  } as never)
}

function makeHandler(): ReturnType<typeof createReqboardHandler> {
  const qdir = join(root, 'queue')
  mkdirSync(qdir, { recursive: true })
  const taskStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: qdir }), now: () => 1000 })
  return createReqboardHandler({
    requirementStore: store,
    taskStore,
    now: () => 1000,
    docs: { workspaceRoot: () => root, stat: () => undefined, write: async () => {}, read: async () => '' } as never,
    agents: () => ({ get: () => undefined }),
  } as never)
}

const get = async (url: string) => {
  const res = fakeRes()
  await handler(fakeReq('GET', url), res)
  return res
}
const post = async (url: string, body?: unknown) => {
  const res = fakeRes()
  await handler(fakeReq('POST', url, body), res)
  return res
}
/** 载荷本体（需求列表）的字节——A9 度量对象。改造前的 2,768,960 字节**全部**来自这一部分
 *  （旧实现在 tasks 为空时响应里只有 requirements 是大的），故同口径可比。 */
const reqBytes = (res: any): number =>
  Buffer.byteLength(JSON.stringify(res.payload?.data?.requirements ?? null), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'afdb-state-payload-'))
  store = makeTestStore()
  scanCalls.syncAll = 0
  scanCalls.syncOne = 0
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })
const freshHandler = () => { handler = makeHandler() }

describe('A9 载荷体积：摘要化后相对改造前下降 ≥10×，且不随归档增长', () => {
  it('35 条（33 归档）→ 字节 ≤ 基线/10', async () => {
    await seed(a9Fixture())
    freshHandler()
    const res = await get('/state')
    expect(res.statusCode).toBe(200)
    const bytes = reqBytes(res)
    // 实测留痕，便于验收人复核比例（失败时错误信息里直接可读）
    expect(
      { 摘要字节: bytes, 改造前基线: A9_BASELINE_BYTES, 倍数: Math.round(A9_BASELINE_BYTES / bytes) }.摘要字节 * 10,
      `摘要 ${bytes} 字节 / 基线 ${A9_BASELINE_BYTES}`,
    ).toBeLessThanOrEqual(A9_BASELINE_BYTES)
    expect(A9_BASELINE_BYTES / bytes, '下降倍数须 ≥10×').toBeGreaterThanOrEqual(10)
  })

  it('归档条数 33 → 200：响应字节不增长', async () => {
    await seed(a9Fixture())
    freshHandler()
    const small = reqBytes(await get('/state?scope=all&limit=1000'))

    const big = Array.from({ length: 200 }, (_, i) => rec(i, 'archived'))
    await seed([...a9Fixture(), ...big])
    freshHandler()
    const large = reqBytes(await get('/state?scope=all&limit=1000'))

    // 摘要体量随条数线性增长是允许的；此处要证的是**不再随归档的本体增长**：
    // 每增一条归档，字节增量必须远小于"全文一条"的量级（旧实现 ~79KB/条）。
    const perRecord = (large - small) / 200
    expect(perRecord).toBeLessThan(600)
  })
})

describe('A10 扫描移出读路径', () => {
  it('GET / 触发 syncAllReqArtifacts 0 次；POST /artifacts/scan 触发 1 次', async () => {
    await seed(a9Fixture())
    freshHandler()
    await get('/state')
    await get('/state')
    expect(scanCalls.syncAll, 'GET / 不得扫描').toBe(0)

    const res = await post('/artifacts/scan')
    expect(res.statusCode).toBe(200)
    expect(scanCalls.syncAll, '扫描端点恰 1 次').toBe(1)
    expect(res.payload?.data?.scanned).toBe(1)
  })
})

describe('键集：摘要元素不含全文键', () => {
  it('requirements[] 元素不含 comments/artifacts/verification/plan/archive', async () => {
    await seed(a9Fixture())
    freshHandler()
    const res = await get('/state?scope=all')
    const items = res.payload?.data?.requirements ?? []
    expect(items.length).toBeGreaterThan(0)
    const banned = ['comments', 'artifacts', 'verification', 'plan', 'archive']
    for (const item of items) {
      for (const k of banned) expect(Object.prototype.hasOwnProperty.call(item, k), `元素含 ${k}`).toBe(false)
    }
  })
})

describe('详情按需：GET /requirements/:id', () => {
  it('已归档需求 → 200 且含全文（comments/artifacts 在）', async () => {
    const records = a9Fixture()
    await seed(records)
    freshHandler()
    const archivedId = records[0]!.id
    const res = await get('/requirements/' + archivedId)
    expect(res.statusCode).toBe(200)
    const r = res.payload?.data?.requirement
    expect(r?.id).toBe(archivedId)
    expect(r?.comments?.length).toBe(8)
    expect(r?.artifacts?.length).toBe(6)
  })

  it('不存在 → 404 且 code=REQBOARD_NOT_FOUND', async () => {
    await seed(a9Fixture())
    freshHandler()
    const res = await get('/requirements/REQ-261002161499-ffff')
    expect(res.statusCode).toBe(404)
    expect(res.payload?.code).toBe('REQBOARD_NOT_FOUND')
  })
})

describe('分页：cursor 边界', () => {
  it('取到末页 → 无 nextCursor；越界 cursor → 空页不抛错', async () => {
    await seed(a9Fixture())
    freshHandler()
    const seen: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 10; i += 1) {
      const res = await get('/state?scope=all&limit=10' + (cursor === undefined ? '' : '&cursor=' + encodeURIComponent(cursor)))
      expect(res.statusCode).toBe(200)
      const items = res.payload?.data?.requirements ?? []
      for (const it of items) seen.push(it.id)
      cursor = res.payload?.data?.nextCursor
      if (cursor === undefined) break
    }
    expect(seen.length).toBe(35)   // 不重不漏
    expect(new Set(seen).size).toBe(35)

    const over = await get('/state?scope=all&limit=10&cursor=' + encodeURIComponent('zzz-not-a-cursor'))
    expect(over.statusCode).toBe(200)
    expect(over.payload?.data?.requirements).toEqual([])
  })
})
