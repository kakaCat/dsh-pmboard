/**
 * t4（REQ-261007223647-da5d FR-1）单测：**票不丢 + 重投查询**。
 *
 * 两条口径：
 *  ① 立项弹框等到点没作答 → 中性回执（「等待超时」+ 可选出路），**不是**「用户取消」，
 *     也绝不因为等待超时而把调用判成错误；
 *  ② `POST /confirm/repost` 只做**如实查询**：票还在等 → still-open（给出两条真能走的路）；
 *     票没了 → gone；读口未装配 → unavailable。**不伪造"已重弹"**。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { defineCaptureTool } from './helpers/tool-deps.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import type { PendingConfirmation } from '../src/shared/protocol.js'

const W = 'session-t4'

/* ───────────────────────── ① 立项等待超时 ───────────────────────── */

function makeCapture(port: unknown) {
  const deps = { store: makeTestStore(), now: () => 1, userQuestions: () => port } as never
  return defineCaptureTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

describe('t4 · 立项弹框等到点未作答 = 中性回执（不是取消、不是错误）', () => {
  it('askTimed 返回 pending → success=false + note 含「等待超时」，且不创建需求', async () => {
    const tool = makeCapture({
      ask: async () => ({ answers: [] }),
      askTimed: async () => ({ kind: 'pending' }),
    })
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    expect(out.success).toBe(false)
    expect(out.note).toContain('等待超时')
    expect(out.requirement_id).toBe('')
  })

  it('对照：窗口内作答 → 正常立项（等待通道不改变成功路径）', async () => {
    const tool = makeCapture({
      ask: async () => ({ answers: [] }),
      askTimed: async () => ({
        kind: 'answered',
        answers: [
          { id: 'name', selected: ['候选'] },
          { id: 'category', selected: ['feature'] },
          { id: 'difficulty', selected: ['standard'] },
          { id: 'location', selected: ['docs/requirements/<REQ>/'] },
        ],
      }),
    })
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    expect(out.success).toBe(true)
    expect(out.status).toBe('brainstorming')
  })
})

/* ───────────────────────── ② 重投查询端点 ───────────────────────── */

let base: string
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'pmboard-t4-')) })
afterEach(() => { rmSync(base, { recursive: true, force: true }) })

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

const OPEN: PendingConfirmation = {
  ticket: 'pc-open1',
  windowKey: W,
  requirementId: 'REQ-t4',
  target: 'artifact',
  kind: 'design',
  createdAt: 1,
} as never

async function repost(pendingConfirms: unknown, body: unknown) {
  const handler = createReqboardHandler({
    requirementStore: makeTestStore(),
    taskStore: taskStoreAt(base),
    now: () => 1000,
    cwd: base,
    ...(pendingConfirms === undefined ? {} : { pendingConfirms: pendingConfirms as never }),
  })
  const res = fakeRes()
  await handler(fakeReq('POST', '/dashboard/api/reqboard/confirm/repost', body), res)
  return res
}

describe('t4 · POST /confirm/repost 如实查询（不伪造已重弹）', () => {
  it('票仍在等 → still-open，并给出「复用同一道门」与「看板作答」两条出路', async () => {
    const read = { pendingForRequirement: (id: string) => (id === 'REQ-t4' ? [OPEN] : []) }
    const res = await repost(read, { id: 'REQ-t4', ticket: 'pc-open1' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data.action).toBe('still-open')
    expect(res.payload.data.hint).toContain('复用同一道门')
    expect(res.payload.data.hint).toContain('看板作答')
  })

  it('票已失效 → gone（引导重新发起，绝不说"已重投"）', async () => {
    const read = { pendingForRequirement: () => [] }
    const res = await repost(read, { id: 'REQ-t4', ticket: 'pc-old' })
    expect(res.payload.data.action).toBe('gone')
    expect(res.payload.data.hint).toContain('重新发起')
  })

  it('读口未装配 → unavailable（不冒充"没有人在等"）', async () => {
    const res = await repost(undefined, { id: 'REQ-t4', ticket: 'pc-open1' })
    expect(res.payload.data.action).toBe('unavailable')
    expect(res.payload.data.hint).toContain('未装配')
  })
})
