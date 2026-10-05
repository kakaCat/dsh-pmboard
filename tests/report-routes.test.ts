// serves: FR-11, FR-12, FR-10
/**
 * 详情页六条只读端点的路由用例（REQ-261004222448-292a t-497311）。
 *
 * 这张卡修的是「六个 Tab 各自去取数」这件事的**接线与守门**：
 *   · 六条端点各返回 200 + 统一信封（桩查询注入，验的是路由不是查询）；
 *   · `limit` 越界 → 400（不静默截断）；
 *   · `:id` 形状非法（路径遍历样本）→ 400，且**查询一次都没被调用**（先校验再触盘）；
 *   · 查询未装配 → 200 + `available:false, reason:'port-unavailable'`（不是 500、不是「0 条」）；
 *   · 只读：POST 打到六条路径 → 404（不认写方法）；
 *   · Token 扩展段就地加列：老列（快照桶）仍在，新列（每次调用均 / 缓存命中）并进来。
 *
 * @module dsh-pmboard/tests/panels-routes
 */
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../src/http/routes.js'
import { mergeTokenExtension } from '../src/http/routers/panels.js'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import type { PanelQueries } from '../src/application/query/contracts.js'
import type {
  PanelResult,
  RequirementTokenView,
  TokenPanelExtension,
  TokenStageRow,
} from '../src/shared/protocol.js'

const REQ = 'REQ-261004222448-292a'

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.payload = undefined
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

function fakeReq(url: string, method = 'GET'): any {
  const req: any = new EventEmitter()
  req.url = '/dashboard/api/reqboard' + url
  req.method = method
  return req
}

interface Harness {
  handler: ReturnType<typeof createReqboardHandler>
  calls: Array<{ key: string; input: unknown }>
  dir: string
}

/** 装配一个可注入桩查询的 handler（六个桩各自记住被调用的入参）。 */
function harness(queries?: Partial<PanelQueries>): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'pmboard-panels-'))
  const calls: Array<{ key: string; input: unknown }> = []
  const stub = (key: string, payload: unknown) =>
    (async (_deps: unknown, input: unknown) => {
      calls.push({ key, input })
      return payload as PanelResult<unknown>
    }) as never
  const merged: Partial<PanelQueries> = queries ?? {
    report: stub('report', { verdictLine: '在跑实施' }),
    trunk: stub('trunk', { items: [] }),
    docs: stub('docs', { documents: [] }),
    dag: stub('dag', { tasks: [], steps: [] }),
    dialogue: stub('dialogue', { items: [], page: { hasMore: false, total: 0 } }),
    prompts: stub('prompts', { system: {}, injections: [], context: {} }),
    token: stub('token', { byStage: [], optimizations: [], availability: 'full' }),
  }
  const handler = createReqboardHandler({
    requirementStore: makeTestStore() as never,
    taskStore: taskStoreAt(dir),
    now: () => 1_700_000_000_000,
    // 路由的六端点要的只读端口（缺 injectionLog 会被判「依赖未装配完整」）
    injectionLog: { readAll: async () => [] } as never,
    // dialogue 端点还要会话探针（缺它按设计降级为 port-unavailable——这也是本文件另一条断言）
    sessionProbe: { snapshotEvents: () => undefined, readEvents: async () => undefined } as never,
    panelQueries: merged,
  })
  return { handler, calls, dir }
}

describe('六条只读端点 · 信封与透传', () => {
  for (const key of ['report', 'trunk', 'docs', 'dag', 'dialogue', 'prompts'] as const) {
    it(`GET /requirements/:id/${key} → 200 且回桩查询的载荷`, async () => {
      const h = harness()
      const res = fakeRes()
      await h.handler(fakeReq(`/requirements/${REQ}/${key}`), res)
      expect(res.statusCode).toBe(200)
      expect(res.payload.success).toBe(true)
      expect(h.calls.map((c) => c.key)).toEqual([key])
      rmSync(h.dir, { recursive: true, force: true })
    })
  }

  it('limit / before 原样透传给查询（路由不自己夹取）', async () => {
    const h = harness()
    const res = fakeRes()
    await h.handler(fakeReq(`/requirements/${REQ}/dialogue?limit=20&before=40`), res)
    expect(res.statusCode).toBe(200)
    expect(h.calls[0]!.input).toEqual({ requirementId: REQ, limit: 20, before: 40 })
    rmSync(h.dir, { recursive: true, force: true })
  })

  it('limit 越界 → 400（不静默截断）；缺省不带 limit 键', async () => {
    const h = harness()
    const over = fakeRes()
    await h.handler(fakeReq(`/requirements/${REQ}/dialogue?limit=1000`), over)
    expect(over.statusCode).toBe(400)
    expect(h.calls).toHaveLength(0)

    const ok = fakeRes()
    await h.handler(fakeReq(`/requirements/${REQ}/dialogue`), ok)
    expect(ok.statusCode).toBe(200)
    expect(h.calls[0]!.input).toEqual({ requirementId: REQ })
    rmSync(h.dir, { recursive: true, force: true })
  })
})

describe('先校验再触盘（路径遍历样本不许走到查询）', () => {
  it('编码过的 ../ 形状 → 400，且查询一次都没被调用', async () => {
    const h = harness()
    const res = fakeRes()
    await h.handler(fakeReq('/requirements/..%2F..%2Fetc%2Fpasswd/report'), res)
    expect(res.statusCode).toBe(400)
    expect(res.payload.success).toBe(false)
    expect(h.calls).toHaveLength(0)
    rmSync(h.dir, { recursive: true, force: true })
  })

  it('未编码的斜杠路径不会命中六端点（走 404，不进查询）', async () => {
    const h = harness()
    const res = fakeRes()
    await h.handler(fakeReq('/requirements/../../etc/passwd/report'), res)
    expect(res.statusCode).toBe(404)
    expect(h.calls).toHaveLength(0)
    rmSync(h.dir, { recursive: true, force: true })
  })
})

describe('降级不冒充（FR-12）', () => {
  it('查询未装配 → 200 + available:false + port-unavailable（不是 500、不是 0 条）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmboard-panels-none-'))
    const handler = createReqboardHandler({
      requirementStore: makeTestStore() as never,
      taskStore: taskStoreAt(dir),
      now: () => 1,
      injectionLog: { readAll: async () => [] } as never,
      // 不传 panelQueries = 六条查询都没落地
    })
    const res = fakeRes()
    await handler(fakeReq(`/requirements/${REQ}/docs`), res)
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.available).toBe(false)
    expect(res.payload.data.reason).toBe('port-unavailable')
    // 关键：**不是**空清单冒充「没有文档」
    expect(res.payload.data.documents).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('只读：POST 打到六条路径 → 404', async () => {
    const h = harness()
    const res = fakeRes()
    await h.handler(fakeReq(`/requirements/${REQ}/report`, 'POST'), res)
    expect(res.statusCode).toBe(404)
    expect(h.calls).toHaveLength(0)
    rmSync(h.dir, { recursive: true, force: true })
  })
})

describe('Token 扩展段：就地加列（老读法不判死刑）', () => {
  it('老列（快照桶 / 执行下钻）仍在，新列（每次调用均 / 缓存命中）并进同一行', () => {
    const base = {
      requirementId: REQ,
      totals: { input: 10, output: 2, cacheRead: 3, cachedInput: 0 },
      byStage: [
        { stage: 'implementing', buckets: { input: 10, output: 2, cacheRead: 3, cachedInput: 0 }, executions: [] },
        { stage: 'design', executions: [] },
      ],
      degraded: false,
    } as unknown as RequirementTokenView
    const ext: TokenPanelExtension = {
      byStage: [{
        stage: 'implementing', calls: 5, inputTokens: 10, outputTokens: 2, cacheReadTokens: 3,
        totalTokens: 12, sharePct: 100, perCallTokens: 2.4, cacheHitPct: 23,
      } as TokenStageRow],
      optimizations: [{ title: 't', basis: '实施段占 100%', suggestion: 's' }],
      availability: 'full',
    }
    const merged = mergeTokenExtension(base, ext)
    expect(merged.byStage).toHaveLength(2)
    // 老列还在
    expect(merged.byStage[0]!.buckets).toBeDefined()
    expect(merged.byStage[0]!.executions).toEqual([])
    // 新列并进来
    expect(merged.byStage[0]!.perCallTokens).toBe(2.4)
    expect(merged.byStage[0]!.cacheHitPct).toBe(23)
    // 没被扩展段覆盖的阶段：原样保留（不凭空造 0 行）
    expect(merged.byStage[1]!.stage).toBe('design')
    expect((merged.byStage[1] as Partial<TokenStageRow>).perCallTokens).toBeUndefined()
    expect(merged.optimizations).toHaveLength(1)
    expect(merged.availability).toBe('full')
  })
})
