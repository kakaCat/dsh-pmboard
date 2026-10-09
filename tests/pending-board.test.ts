/**
 * t6（REQ-261007223647-da5d · serves: FR-5 / 设计 interfaces.md IF-5）单测：
 * **看板 pending 票投影** —— 票在等，看板首屏就得看得见。
 *
 * 治什么：2026-10-07 现场 `reqboard_submit` 工具超时把确认票带走，票还挂着、人却不知道。
 * 本文件的标本是**投影本身**：有票必须出六键 + 剩余时间；无票必须回空数组（键恒在）；
 * 陈旧的（已落章 / 不是门 / 无可落章产物）必须不列——否则看板会把人钉在一张点不动的票上。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { LIMITS } from '../src/domain/limits.js'
import {
  livePendingConfirmsOf,
  pendingBoardRowsOf,
  pendingRemainingMs,
} from '../src/application/internal/pending-board.js'
import type { PendingConfirmation, RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const NOW = 1_000_000
const TTL = LIMITS.pendingConfirmTtlMs

/** 需求标本：requirement 产物**已登记未落章**（= 有东西可确认，票才该进看板）。 */
function reqSeed(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-board-t6',
    title: '看板 pending 投影标本',
    description: '',
    category: 'feature',
    status: 'brainstorming',
    blocked: false,
    sourceSessionId: 'session-t6-owner',
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    artifacts: [{
      stage: 'brainstorming',
      kind: 'requirement',
      path: 'docs/requirements/REQ-board-t6/requirement.md',
      registeredAt: 1,
    } as StageArtifact],
    ...over,
  } as unknown as RequirementRecord
}

function ticket(over: Partial<PendingConfirmation> = {}): PendingConfirmation {
  return {
    ticket: 'pc-board1',
    windowKey: 'session-t6-owner',
    requirementId: 'REQ-board-t6',
    target: 'artifact',
    kind: 'requirement',
    createdAt: NOW - 60_000,
    ...over,
  } as PendingConfirmation
}

/* ───────────────── ① 纯投影：六键 + 剩余时间公式 ───────────────── */

describe('t6 · 看板 pending 行投影（IF-5）', () => {
  it('有票 → 六键齐（ticket/requirement_id/target/kind/created_at/interrupted）+ 剩余时间按公式推导', () => {
    const rec = ticket()
    const rows = pendingBoardRowsOf(reqSeed(), [rec], NOW)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // 六键逐条在场（缺一即看板渲染不出该行）
    expect(row.ticket).toBe('pc-board1')
    expect(row.requirement_id).toBe('REQ-board-t6')
    expect(row.target).toBe('artifact')
    expect(row.kind).toBe('requirement')
    expect(row.created_at).toBe(NOW - 60_000)
    expect(row.interrupted).toBe(false)
    // 公式：remaining_ms = TTL − (now − (interrupted_at ?? created_at))
    expect(row.remaining_ms).toBe(TTL - 60_000)
    expect(row.expires_at).toBe(rec.createdAt + TTL)
    expect(pendingRemainingMs(rec, NOW)).toBe(row.remaining_ms)
  })

  it('被中止过的票 → interrupted=true + interrupted_at 在场，剩余时间以 interrupted_at 为基准', () => {
    const rec = ticket({ createdAt: NOW - 25 * 60_000, interruptedAt: NOW - 60_000 })
    const rows = pendingBoardRowsOf(reqSeed(), [rec], NOW)
    expect(rows[0]!.interrupted).toBe(true)
    expect(rows[0]!.interrupted_at).toBe(NOW - 60_000)
    // 中止记录再获一个完整 TTL（基准换成 interrupted_at，不是更早的 createdAt）
    expect(rows[0]!.remaining_ms).toBe(TTL - 60_000)
    expect(rows[0]!.expires_at).toBe(rec.interruptedAt! + TTL)
  })

  it('无票 → 空数组（不发 null、不省略键的那一半由路由断言）', () => {
    expect(pendingBoardRowsOf(reqSeed(), [], NOW)).toEqual([])
  })

  it('剩余时间为负 → 收口到 0（不给倒计时显示负数）', () => {
    const rec = ticket({ createdAt: NOW - TTL - 5_000 })
    expect(pendingRemainingMs(rec, NOW)).toBe(0)
  })

  it('快失效的排前面（人先看见最急的那张）', () => {
    const a = ticket({ ticket: 'pc-aaa', createdAt: NOW - 30 * 60_000 }) // 只剩 0
    const b = ticket({ ticket: 'pc-bbb', createdAt: NOW - 5 * 60_000 })
    const rows = pendingBoardRowsOf(reqSeed(), [b, a], NOW)
    expect(rows.map(r => r.ticket)).toEqual(['pc-aaa', 'pc-bbb'])
  })
})

/* ───────────────── ② 陈旧票不列（与 agent 侧同源谓词） ───────────────── */

describe('t6 · 仍然有意义的票才算（与 livePendingConfirm 同源）', () => {
  it('台账已落章（人已作答）→ 不列（否则看板把人钉在一张点不动的票上）', () => {
    const req = reqSeed({
      artifacts: [{
        stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/REQ-board-t6/requirement.md',
        registeredAt: 1, confirmedAt: 2,
      } as StageArtifact],
    })
    expect(livePendingConfirmsOf(req, [ticket()])).toEqual([])
  })

  it('不是一道门的票（kind=prototype）→ 不列（它拦不住任何下游产物）', () => {
    expect(pendingBoardRowsOf(reqSeed(), [ticket({ kind: 'prototype' })], NOW)).toEqual([])
  })

  it('没有可落章产物的票 → 不列（看板点了也答不了）', () => {
    expect(pendingBoardRowsOf(reqSeed({ artifacts: [] }), [ticket()], NOW)).toEqual([])
  })

  it('target=plan 且计划在册 → 列为 plan 票', () => {
    const req = reqSeed({ plan: { path: 'docs/requirements/REQ-board-t6/decomposition.md', summary: 'x', tasks: [], submittedAt: 1 } as never })
    const rows = pendingBoardRowsOf(req, [ticket({ target: 'plan', kind: undefined })], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.target).toBe('plan')
    expect(rows[0]!.kind).toBeUndefined()
  })

  it('台账查不到该需求 → 保守留挂（不能证明已落章就不静默释放）', () => {
    expect(livePendingConfirmsOf(undefined, [ticket()])).toHaveLength(1)
  })
})

/* ───────────────── ③ 注册表读口：按需求跨窗口合并 ───────────────── */

describe('t6 · PendingConfirmRegistry.pendingForRequirement（跨窗口合并）', () => {
  it('同需求跨窗口的未作答票全列出；已作答 / 已过期 / 别需求的不列', () => {
    let now = NOW
    const reg = new PendingConfirmRegistry({ now: () => now, ttlMs: 1_000, newTicket: (() => {
      let i = 0
      return (): string => 'pc-x' + (++i)
    })() })
    const a = reg.register({ windowKey: 'session-a', requirementId: 'REQ-1', target: 'artifact', kind: 'requirement' })
    const b = reg.register({ windowKey: 'session-b', requirementId: 'REQ-1', target: 'artifact', kind: 'requirement' })
    const other = reg.register({ windowKey: 'session-a', requirementId: 'REQ-2', target: 'artifact', kind: 'requirement' })
    const answered = reg.register({ windowKey: 'session-a', requirementId: 'REQ-1', target: 'artifact', kind: 'requirement' })
    reg.settle(answered.ticket, { confirmed: true, advanced: true })

    const open = reg.pendingForRequirement('REQ-1')
    expect(open.map(r => r.ticket).sort()).toEqual([a.ticket, b.ticket].sort())
    expect(open.some(r => r.ticket === answered.ticket)).toBe(false)
    expect(open.some(r => r.ticket === other.ticket)).toBe(false)

    // 过期后不再列出（TTL 1s，时钟推 2s）
    now = NOW + 2_000
    expect(reg.pendingForRequirement('REQ-1')).toEqual([])
  })
})

/* ───────────────── ④ 路由：/state 带 pending_confirms（键恒在） ───────────────── */

let base: string
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'pmboard-t6-')) })

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

async function getState(requirement: RequirementRecord, pendingConfirms: unknown): Promise<any> {
  const store = makeTestStore()
  await store.replaceAll('seed', { schemaVersion: 9, revision: 1, requirements: [requirement], triages: [] })
  const handler = createReqboardHandler({
    requirementStore: store,
    taskStore: taskStoreAt(base),
    now: () => NOW,
    cwd: base,
    ...(pendingConfirms === undefined ? {} : { pendingConfirms: pendingConfirms as never }),
  })
  const res = fakeRes()
  await handler(fakeReq('GET', '/dashboard/api/reqboard/state'), res)
  return res
}

describe('t6 · GET /state 的 pending_confirms（IF-5）', () => {
  it('有票 → 载荷含该票（六键齐 + 剩余毫秒）', async () => {
    const reg = new PendingConfirmRegistry({
      now: () => NOW - 60_000,
      newTicket: () => 'pc-state1',
    })
    reg.register({ windowKey: 'session-t6-owner', requirementId: 'REQ-board-t6', target: 'artifact', kind: 'requirement' })
    const res = await getState(reqSeed(), reg)
    expect(res.statusCode).toBe(200)
    const row = res.payload.data.pending_confirms[0]
    expect(row.ticket).toBe('pc-state1')
    expect(row.requirement_id).toBe('REQ-board-t6')
    expect(row.target).toBe('artifact')
    expect(row.kind).toBe('requirement')
    expect(row.created_at).toBe(NOW - 60_000)
    expect(row.interrupted).toBe(false)
    expect(row.remaining_ms).toBe(TTL - 60_000)
  })

  it('无票 → 空数组（键恒在：不省略键，客户端据此不渲染首屏横带）', async () => {
    const res = await getState(reqSeed(), new PendingConfirmRegistry({ now: () => NOW }))
    expect(res.payload.data.pending_confirms).toEqual([])
    expect('pending_confirms' in res.payload.data).toBe(true)
  })

  it('读口未装配 → 仍是空数组（看板不因此 500，其余读数照常可用）', async () => {
    const res = await getState(reqSeed(), undefined)
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.pending_confirms).toEqual([])
  })

  it('票指向本需求但产物已落章 → 不列（陈旧票不占首屏）', async () => {
    const reg = new PendingConfirmRegistry({ now: () => NOW, newTicket: () => 'pc-stale1' })
    reg.register({ windowKey: 'session-t6-owner', requirementId: 'REQ-board-t6', target: 'artifact', kind: 'requirement' })
    const confirmed = reqSeed({
      artifacts: [{
        stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/REQ-board-t6/requirement.md',
        registeredAt: 1, confirmedAt: 2,
      } as StageArtifact],
    })
    const res = await getState(confirmed, reg)
    expect(res.payload.data.pending_confirms).toEqual([])
  })

  it('POST /confirm/repost 用真实注册表读口 → still-open（t4 的读口在组合根上真的通）', async () => {
    const reg = new PendingConfirmRegistry({ now: () => NOW, newTicket: () => 'pc-repost1' })
    reg.register({ windowKey: 'session-t6-owner', requirementId: 'REQ-board-t6', target: 'artifact', kind: 'requirement' })
    const store = makeTestStore()
    await store.replaceAll('seed', { schemaVersion: 9, revision: 1, requirements: [reqSeed()], triages: [] })
    const handler = createReqboardHandler({
      requirementStore: store,
      taskStore: taskStoreAt(base),
      now: () => NOW,
      cwd: base,
      pendingConfirms: reg,
    })
    const res = fakeRes()
    await handler(fakeReq('POST', '/dashboard/api/reqboard/confirm/repost', { id: 'REQ-board-t6', ticket: 'pc-repost1' }), res)
    expect(res.payload.data.action).toBe('still-open')
  })
})
