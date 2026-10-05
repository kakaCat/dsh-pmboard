/**
 * L2 路由级单测 · 看板「继续」把人手动模式的需求接回自动化（REQ-261002173819-69c7 t3 / serves: FR-3）。
 *
 * 现场：2026-10-02 REQ-261002161439-277d 的 agent 为解死锁调了 `reqboard_clear_pause`
 * （台账落成 `disarmed + idle`），而当时**全仓没有任何入口**能把它接回来——看板「继续」走的
 * `rearmIfRecoverable` 只救「运行时暂停」与「误停摆（disarmed+active）」。该需求随后只能靠人
 * 逐卡打「继续」往前挪。
 *
 * 本文件把两件事钉住：① 看板「继续」真的能救 `disarmed+idle`；② 它不新增返回键（响应形状不变）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../../src/http/routes.js'
import { makeHarness, req } from '../application/harness.js'

const REQ_ID = 'REQ-0000f1'
const WINDOW = 'session-w-autorun'

function fakeReq(body: unknown, url: string): never {
  const r = new EventEmitter() as never as { url: string; method: string; [Symbol.asyncIterator]: unknown }
  r.url = url
  r.method = 'POST'
  ;(r as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return r as never
}

function fakeRes(): { statusCode: number; payload?: { success: boolean; data?: Record<string, unknown>; error?: string; code?: string } } {
  const res = new EventEmitter() as unknown as Record<string, unknown>
  res['statusCode'] = 0
  res['writeHead'] = (code: number) => { res['statusCode'] = code; return res }
  res['end'] = (text?: string) => { res['payload'] = text === undefined ? undefined : JSON.parse(text); return res }
  return res as never
}

const tempDirs: string[] = []
afterEach(() => { for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

/** 造一个「人按过 clear_pause」的需求（disarmed + idle）＋真路由。 */
async function seed() {
  const h = makeHarness()
  const root = mkdtempSync(join(tmpdir(), 'pmboard-autorun-'))
  tempDirs.push(root)
  h.docs.workspaceRoot = () => root
  // B12 阶段⑤族 B：播种进新端口（两源同写，等排空后再断言）
  h.seedRequirementSync(req({
    id: REQ_ID,
    status: 'implementing',
    category: 'feature',
    sourceSessionId: WINDOW,
    autoRun: false,
    dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } as never,
  }))
  await h.seedSettled()
  const handler = createReqboardHandler({ requirementStore: h.store,

    taskStore: h.taskStore,
    now: () => h.clock.t,
    docs: h.docs as never,
    applicationDeps: h.deps,
  })
  const post = async (url: string, body: unknown) => {
    const res = fakeRes()
    await handler(fakeReq(body, '/dashboard/api/reqboard' + url), res as never)
    return res
  }
  return { h, post }
}

describe('看板「继续」· 接回手动模式的需求（FR-3）', () => {
  it('R-8：on:true → disarmed+idle 变 armed+active，note 说明已重新武装，且不新增返回键', async () => {
    const { h, post } = await seed()
    const res = await post('/req/autorun', { id: REQ_ID, on: true })

    expect(res.statusCode).toBe(200)
    const data = res.payload?.data as Record<string, unknown>
    const after = (await h.store.get(REQ_ID))!
    expect(after.dive!.activation).toBe('armed')
    expect(after.dive!.phase).toBe('active')
    expect(data['autoRun']).toBe(true)
    expect(String(data['advanceNote'])).toContain('已重新武装')

    // 响应形状不变：键集合 ⊆ 需求记录自身字段 ∪ { advanceNote }
    const allowed = new Set<string>([...Object.keys(after as unknown as Record<string, unknown>), 'advanceNote'])
    for (const k of Object.keys(data)) expect(allowed.has(k), '不得新增返回键：' + k).toBe(true)

    const bodies = (after.comments ?? []).map((c) => String(c.body)).join('\n')
    expect(bodies).toContain('[Dive 重新武装]')
  })

  it('R-9：on:false（暂停）→ 只置 autoRun=false 与 pausedReason=manual，dive 一个字段都不动', async () => {
    const { h, post } = await seed()
    const before = JSON.stringify((await h.store.get(REQ_ID))!.dive)

    const res = await post('/req/autorun', { id: REQ_ID, on: false })

    expect(res.statusCode).toBe(200)
    const after = (await h.store.get(REQ_ID))!
    expect(after.autoRun).toBe(false)
    expect(after.advance?.pausedReason).toBe('manual')
    expect(JSON.stringify(after.dive), '暂停不得改写人的意图').toBe(before)
  })
})
