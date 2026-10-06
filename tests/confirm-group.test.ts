/**
 * kind=design 成组确认单测（REQ-2d1c74 T-3 · serves FR-2）
 *
 * 验收口径：确认 kind=design 后**全部** design 产物都有 confirmedAt（三条通道同语义）；
 * 非 design kind 维持首份落章（历史语义）；成组确认后 G2 放行（UC-4 全路径）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { defineAskConfirmTool } from './helpers/tool-deps.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-grp-001'
const REQ = 'REQ-grp001'
const DESIGN5 = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']
const DESIGN_DIR = 'docs/requirements/' + REQ + '/design'

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-grp-'))
  store = makeTestStore()
  mkdirSync(join(dir, DESIGN_DIR), { recursive: true })
  writeFileSync(join(dir, 'docs/requirements', REQ, 'requirement.md'),
    '# 需求\n\n## 边界\nx\n\n## 产品定义\nx\n\n## 用户与角色\nx\n\n## 功能点\n\n### FR-1: 甲\nx\n')
  for (const n of DESIGN5) writeFileSync(join(dir, DESIGN_DIR, n), '# ' + n + '\n')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seed(extraRequirementArtifacts = false): Promise<void> {
  const designArts = DESIGN5.map(n => ({
    stage: 'design', kind: 'design', path: DESIGN_DIR + '/' + n,
    registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
  }) as StageArtifact)
  const extra: StageArtifact[] = extraRequirementArtifacts
    ? [
        { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/' + REQ + '/requirement.md', registeredAt: 1, registeredBy: { kind: 'agent' } } as StageArtifact,
        { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/' + REQ + '/notes/req-copy.md', registeredAt: 1, registeredBy: { kind: 'agent' } } as StageArtifact,
      ]
    : []
  const r = {
    id: REQ, title: '成组确认', description: '', category: 'feature', status: 'design',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts: [...extra, ...designArts],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

function designArts() {
  return (store.peekAll()[0].artifacts ?? []).filter(a => a.kind === 'design')
}

function askTool() {
  const deps = {
    store, now: () => 1000, workspaceRoot: dir,
    userQuestions: () => ({ ask: async () => ({ answers: [{ id: 'confirm', selected: ['确认，进入拆分'] }] }) }),
  } as never
  return defineAskConfirmTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

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

describe('成组确认（三通道同语义：全部 design 产物一次落章）', () => {
  it('通道① 会话弹框：5 份全部落 confirmedAt，文档集齐 → 自动推进 decomposing（UC-4 全路径）', async () => {
    await seed()
    const out = await run(askTool(), { target: 'artifact', kind: 'design', question: 'q', options: ['确认，进入拆分', '改'] })
    expect(out.confirmed).toBe(true)
    expect(designArts()).toHaveLength(5)
    expect(designArts().every(a => a.confirmedAt !== undefined)).toBe(true)
    expect(designArts().every(a => a.confirmedVia === 'session')).toBe(true)
    // 文档集完整 + 全确认 → G2 自动推进放行
    expect(out.advanced).toBe(true)
    expect(store.peekAll()[0].status).toBe('decomposing')
  })

  it('通道② 会话文字证据：5 份全部落 confirmedAt', async () => {
    await seed()
    const out = await run(askTool(), { target: 'artifact', kind: 'design', evidence: '用户在 ask_user_question 中选择确认' })
    expect(out.success).toBe(true)
    expect(designArts().every(a => a.confirmedAt !== undefined)).toBe(true)
    expect(designArts().every(a => a.confirmedEvidence !== undefined)).toBe(true)
  })

  it('通道③ 看板一键：5 份全部落 confirmedAt 且自动推进', async () => {
    await seed()
    const handler = createReqboardHandler({ requirementStore: store, taskStore: taskStoreAt(dir),
      now: () => Date.now(),
      docs: new FileDocRepository({ workspaceRoot: dir }),
      agents: () => ({ get: () => ({ id: W, session: {} }) }),
    })
    const res = fakeRes()
    await handler(fakeReq('POST', '/dashboard/api/reqboard/req/artifact/confirm', { id: REQ, kind: 'design' }), res)
    expect(res.statusCode).toBe(200)
    expect(designArts().every(a => a.confirmedAt !== undefined)).toBe(true)
    expect(designArts().every(a => a.confirmedVia === 'board')).toBe(true)
    expect(res.payload.data.advanced).toBe(true)
    expect(store.peekAll()[0].status).toBe('decomposing')
    // 留痕写明成组确认份数
    const comments = store.peekAll()[0].comments.map(c => c.body).join('\n')
    expect(comments).toContain('成组确认 5 份')
  })

  it('非 design kind 维持首份落章（历史语义不扩散）', async () => {
    await seed(true)
    const out = await run(askTool(), { target: 'artifact', kind: 'requirement', evidence: '用户确认需求文档' })
    expect(out.success).toBe(true)
    const reqArts = (store.peekAll()[0].artifacts ?? []).filter(a => a.kind === 'requirement')
    expect(reqArts).toHaveLength(2)
    expect(reqArts[0].confirmedAt).toBeDefined()
    expect(reqArts[1].confirmedAt).toBeUndefined() // 第二份不连带
    // design 产物不受影响
    expect(designArts().every(a => a.confirmedAt === undefined)).toBe(true)
  })

  it('没有 kind=design 产物 → 报 missing（不是静默零落章）', async () => {
    await seed()
    await store.mutate(store.peekAll()[0]!.id, (r) => {      r.artifacts = (r.artifacts ?? []).filter(a => a.kind !== 'design')
      return { changed: true }
    })
    await expect(run(askTool(), { target: 'artifact', kind: 'design', evidence: '用户确认' }))
      .rejects.toThrow(/REQBOARD_MISSING_ARTIFACT/)
  })

  it('已落章的产物再走文字证据 ⇒ 时间戳与证据原文逐字不变、不再多写一条「人已确认」评论', async () => {
    // REQ-261006164732-6503 t13（serves: FR-4）：独立复核的**阻断-2** 现场——
    // 文字证据路径原本没有守卫，第二次提交证据就能把 confirmedAt 与证据原文覆写。
    await seed(true)
    const first = await run(askTool(), { target: 'artifact', kind: 'requirement', evidence: '第一次确认的原话' })
    expect(first.success).toBe(true)
    const arts0 = (store.peekAll()[0].artifacts ?? []).filter(a => a.kind === 'requirement')
    const stamp0 = { at: arts0[0]!.confirmedAt, ev: arts0[0]!.confirmedEvidence }
    const comments0 = store.peekAll()[0].comments.length
    expect(stamp0.at).toBeDefined()

    const second = await run(askTool(), { target: 'artifact', kind: 'requirement', evidence: '迟到的第二次文字确认' })
    expect(second.success).toBe(true)
    const arts1 = (store.peekAll()[0].artifacts ?? []).filter(a => a.kind === 'requirement')
    expect(arts1[0]!.confirmedAt).toBe(stamp0.at)              // 首写即事实
    expect(arts1[0]!.confirmedEvidence).toBe(stamp0.ev)
    expect(store.peekAll()[0].comments.length).toBe(comments0) // 不再重复留「人已确认」
  })
})
