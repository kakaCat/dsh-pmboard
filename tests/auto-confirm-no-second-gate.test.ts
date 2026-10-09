/**
 * 自动弹通道不得开出第二个框（REQ-261006164732-6503 t3 · serves: FR-1, FR-3）。
 *
 * 现场：拆分门 16:42:06.700 由 `submit(kind=plan)` 自动弹框（pc-89b19a），16:42:10.047 agent
 * 又发起一次确认 → 第二个框；人先答后者、2.5 秒后又答前者，`plan.approvedAt` 被覆写成后者那一笔。
 *
 * 本文件把「自动弹通道先问建门唯一入口」钉死，并锁一个容易漏掉的实现细节：
 * **门已建好时必须沿用该 ticket 投递（`adopted_ticket`），不能再登记一次**——否则一道门两条记录，
 * 唯一性当场失效（表现为 `findOpen` 只能看见其中一条）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileHostFs } from '../src/adapters/FileHostFs.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { triggerAutoConfirm } from '../src/application/internal/auto-confirm.js'
import type { PendingConfirmPort, UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-auto-001'
const REQ = 'REQ-auto001'

let dir: string
let store: ReturnType<typeof makeTestStore>
let askCalls: number
let registerCalls: number
let registeredTickets: string[]
let deps: UseCaseDeps
let rec: RequirementRecord

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-auto-'))
  store = makeTestStore()
  askCalls = 0
  registerCalls = 0
  registeredTickets = []
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function countingPort(inner: PendingConfirmRegistry): PendingConfirmPort {
  return {
    register: (input) => { registerCalls += 1; const r = inner.register(input); registeredTickets.push(r.ticket); return r },
    get: (t, w) => inner.get(t, w),
    settle: (t, o) => inner.settle(t, o),
    pendingForWindow: (w) => inner.pendingForWindow(w),
    findOpen: (input) => inner.findOpen(input),
    markInterrupted: (t) => inner.markInterrupted(t),
  }
}

const exec = { agent: { id: W } }

async function seed(): Promise<void> {
  rec = {
    id: REQ, title: '自动弹不得开第二个框', description: '', status: 'decomposing', blocked: false,
    sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'decomposing', at: 2, by: { kind: 'human' } },
    ],
    artifacts: [{
      stage: 'design', kind: 'design',
      path: 'docs/requirements/' + REQ + '/design/architecture.md', registeredAt: 1,
    } as StageArtifact],
    plan: { path: 'docs/requirements/' + REQ + '/decomposition.md', summary: 'x', tasks: [], submittedAt: 1 },
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
}

/** 弹框端口：计数 + 以「用户取消」作答（保持后台续跑安静，不落章）。 */
function makeDeps(): UseCaseDeps {
  const now = (): number => Date.now()
  const registry = new PendingConfirmRegistry({ now })
  return {
    store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    // REQ-261008020617-088f RF-3：hostFs 必填（强转构造的夹具最容易漏）
    hostFs: new FileHostFs(),
    clock: { now },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => ({
      ask: async () => {
        askCalls += 1
        throw Object.assign(new Error('用户暂离'), { code: 'ASK_CANCELLED' })
      },
    })),
    pendingConfirms: countingPort(registry),
    doneThrottleMs: 0,
  } as unknown as UseCaseDeps
}

const PLAN_INPUT = { requirementId: REQ, target: 'plan' as const, kind: 'decomposition', question: '拆分计划已提交，请批准' }

/** 轮询等后台 fire-and-forget 落地（固定 sleep 会 flaky）。 */
async function waitFor(fn: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('waitFor 超时')
    await new Promise(r => setTimeout(r, 5))
  }
}

describe('t3 · 自动弹通道先问建门唯一入口', () => {
  beforeEach(async () => { await seed(); deps = makeDeps() })

  it('已有同门在等 → triggered=false、弹框 0 次、票表不新增（不再开第二个框）', async () => {
    const open = deps.pendingConfirms?.register({ windowKey: W, requirementId: REQ, target: 'plan' }).ticket
    registerCalls = 0
    const out = await triggerAutoConfirm(deps, { requirementId: REQ, target: 'plan', kind: 'decomposition', question: '拆分计划已提交，请批准' }, exec)
    expect(out.triggered).toBe(false)
    expect(out.reason ?? '').toContain(open ?? '')
    expect(registerCalls).toBe(0)
    expect(askCalls).toBe(0)
  })

  it('已落章 → triggered=false、不投递、不登记（沿用既有早退语义）', async () => {
    rec = { ...rec, plan: { ...rec.plan!, approvedAt: 9, approvedBy: { kind: 'human' } } } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
    const out = await triggerAutoConfirm(deps, { requirementId: REQ, target: 'plan', kind: 'decomposition', question: '拆分计划已提交，请批准' }, exec)
    expect(out.triggered).toBe(false)
    expect(out.reason ?? '').toContain('已落章')
    expect(registerCalls).toBe(0)
    expect(askCalls).toBe(0)
  })

  it('无在途门 → triggered=true，且投递沿用 requestGate 建的那张票（**不二次登记**）', async () => {
    const out = await triggerAutoConfirm(deps, PLAN_INPUT, exec)
    expect(out.triggered).toBe(true)
    await waitFor(() => askCalls > 0)
    expect(registerCalls).toBe(1)                 // 一道门一条记录（adopted_ticket 生效）
    expect(registeredTickets).toHaveLength(1)
    // 后台投递用的正是这一张票：本用例的假弹框以「用户取消」作答 ⇒ 被 settle（不是另开一张）
    const t = registeredTickets[0]!
    await waitFor(() => deps.pendingConfirms?.get(t, W)?.outcome !== undefined)
    expect(deps.pendingConfirms?.get(t, W)?.outcome).toEqual({ confirmed: false, advanced: false })
    expect(deps.pendingConfirms?.findOpen({ requirementId: REQ, target: 'plan' })).toBeUndefined()
  })
})
