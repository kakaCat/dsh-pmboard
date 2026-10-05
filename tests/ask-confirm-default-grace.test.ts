// serves: FR-7
/**
 * 弹框**缺省有界宽限**（REQ-261004065652-5c1c · t5 / TC-8）。
 *
 * ## 复现的事故
 *
 * 2026-10-03 台账断点原文：「`reqboard_ask_confirm`（design 成组确认）弹框超时：
 * **工具调用 3600000ms 无人作答被中止**」。缺省全阻塞意味着人不在时，窗口死等一小时、
 * Dive 也跟着停手一小时——那不是"等人"，那是"停摆"。
 *
 * ## 三档语义（本文件逐档锁死）
 *
 * | 装配 `pendingConfirms` | `confirmDefaultGraceMs` | 行为 |
 * |---|---|---|
 * | ✅ | 未配（缺省 600000） | 10 分钟宽限 → `pending=true + ticket` |
 * | ✅ | `0` | **显式回到旧的全阻塞**（一键回退） |
 * | ❌ | 任意 | 全阻塞（没有挂起能力，**不制造"假非阻塞"**） |
 * | 任意 | — | 显式 `inline_grace_ms` 仍然覆盖一切 |
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { defineAskConfirmTool } from '../src/tools/index.js'
import { confirmGraceSetting, CONFIRM_DEFAULT_GRACE_MS, CONFIRM_GRACE_MARGIN_MS } from '../src/plugin-config.js'
import { LIMITS } from '../src/domain/limits.js'
import type { AskAnswer, UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-grace-001'
const ARGS = { target: 'artifact', kind: 'requirement', question: '需求文档已完成，是否确认进入设计？' }
const exec = { agent: { id: W } }
const sleep = (ms: number): Promise<'timeout'> => new Promise((r) => setTimeout(() => r('timeout'), ms))

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-grace-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function makeDeps(ask: () => Promise<{ answers?: AskAnswer[] }>, opts: { pending?: boolean; grace?: number } = {}): UseCaseDeps {
  const now = (): number => Date.now()
  const deps = {
    store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => ({ ask })),
    doneThrottleMs: 0,
    ...(opts.grace === undefined ? {} : { confirmDefaultGraceMs: opts.grace }),
  } as unknown as UseCaseDeps
  if (opts.pending === true) deps.pendingConfirms = new PendingConfirmRegistry({ now })
  return deps
}

async function seed(): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '缺省宽限', description: '', status: 'brainstorming', blocked: false,
    sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'brainstorming', at: 2, by: { kind: 'human' } },
    ],
    artifacts: [{
      stage: 'brainstorming', kind: 'requirement',
      path: 'docs/requirements/REQ-abc123/requirement.md', registeredAt: 1,
    } as StageArtifact],
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const never = (): Promise<{ answers?: AskAnswer[] }> => new Promise(() => { /* 永不作答 */ })

describe('配置归一（confirmGraceSetting）', () => {
  it('未配 → 从 LIMITS 派生（宿主超时 − 1 分钟），且**不引入新的超时常量**；0 合法；非法值回落', () => {
    // 既有裁定（REQ-260923222557-d3b0 FR-5）：人机回路 1 小时、src 不得有 600s/900s 硬编码；
    // 故缺省宽限必须**派生**，且要比宿主那记 1 小时早一步（否则又被人掐断）。
    expect(CONFIRM_DEFAULT_GRACE_MS).toBe(LIMITS.timeoutInteractiveMs - CONFIRM_GRACE_MARGIN_MS)
    expect(CONFIRM_DEFAULT_GRACE_MS).toBeLessThan(LIMITS.timeoutInteractiveMs)
    expect(confirmGraceSetting(undefined)).toBe(CONFIRM_DEFAULT_GRACE_MS)
    expect(confirmGraceSetting({})).toBe(CONFIRM_DEFAULT_GRACE_MS)
    expect(confirmGraceSetting({ confirmDefaultGraceMs: 0 }), '0 = 显式全阻塞，不是"用缺省"').toBe(0)
    expect(confirmGraceSetting({ confirmDefaultGraceMs: 5000 })).toBe(5000)
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY] as const) {
      expect(confirmGraceSetting({ confirmDefaultGraceMs: bad }), String(bad)).toBe(CONFIRM_DEFAULT_GRACE_MS)
    }
  })
})

describe('TC-8 · 缺省宽限生效（装了挂起能力 + 配了宽限）', () => {
  it('不传 inline_grace_ms + 永不作答 → 超宽限返回 pending=true + ticket，**不抛超时**', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(never, { pending: true, grace: 20 })) as never as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
    const out = await tool.execute(ARGS, exec)

    expect(out.success).toBe(true)
    expect(out.pending).toBe(true)
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(String(out.ticket).startsWith('pc-')).toBe(true)
    expect(out.requirement_id).toBe('REQ-abc123')
    // 超宽限不落章、不改状态（等人，不是失败）
    const rec = store.peekAll()[0]
    expect(rec.artifacts?.[0]?.confirmedAt).toBeUndefined()
    expect(rec.status).toBe('brainstorming')
  })

  it('缺省值就是 10 分钟：200ms 内不会返回（不是"一到就放行"）', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(never, { pending: true })) as never as { execute: (a: unknown, e: unknown) => Promise<unknown> }
    const raced = await Promise.race([tool.execute(ARGS, exec), sleep(200)])
    expect(raced, '缺省宽限是 10 分钟量级，200ms 内必须仍停在等人').toBe('timeout')
  })
})

describe('TC-8 · 回退与不越权（两档都保持旧语义）', () => {
  it('配置 0 → 显式回到全阻塞：200ms 仍未返回', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(never, { pending: true, grace: 0 })) as never as { execute: (a: unknown, e: unknown) => Promise<unknown> }
    const raced = await Promise.race([tool.execute(ARGS, exec), sleep(200)])
    expect(raced, '0 = 一键回退旧行为').toBe('timeout')
  })

  it('未装配 pendingConfirms → 即使配了宽限也只能全阻塞（不制造"假非阻塞"）', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(never, { grace: 20 })) as never as { execute: (a: unknown, e: unknown) => Promise<unknown> }
    const raced = await Promise.race([tool.execute(ARGS, exec), sleep(200)])
    expect(raced, '没有挂起能力就不能假装非阻塞').toBe('timeout')
  })
})

describe('TC-8 · 显式宽限仍然覆盖一切', () => {
  it('配了 600000 但显式传 20ms → 按 20ms 挂起', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(never, { pending: true })) as never as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
    const out = await tool.execute({ ...ARGS, inline_grace_ms: 20 }, exec)
    expect(out.pending).toBe(true)
    expect(String(out.ticket).startsWith('pc-')).toBe(true)
  })

  it('宽限内作答 → 仍走"确认 + 落章 + 推进"原子路径（缺省宽限不改语义）', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(async () => ({ answers: [{ id: 'confirm', selected: ['确认，推进到下一阶段 (Recommended)'] }] }), { pending: true, grace: 60_000 })) as never as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
    const out = await tool.execute(ARGS, exec)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(true)
    expect(out.pending).toBeUndefined()
    expect(store.peekAll()[0].status).toBe('design')
  })
})
