/**
 * 建门唯一入口：同一道门至多一个在等的框（REQ-261006164732-6503 t2 · serves: FR-1, FR-3）。
 *
 * 为什么锁这条：修前同一个批准门会被弹两次（拆分门实测 16:42:06 自动弹 + 16:42:10 agent 显式弹），
 * 因为判定只能问台账「落章了吗」。本文件把新判据（过程态：这道门有人在等吗）钉死在用例里。
 *
 * 两条断言口径要分清：
 *  · **弹框次数**：`requestGate` 自身**从不弹框**（`questions.ask` 计数恒为 0）；调用通道只在
 *    `mode === 'opened'` 时投递一次——本文件用 `requestAndDeliver` 模拟该通道并计数，
 *    真实通道的接线在 t3/t4/t5。
 *  · **票表次数**：`register` 调用次数（同门第二次必须是 reused，不新增记录）。
 *
 * ## U1~U9 索引（设计 test-cases.md T-2 的九条判据落在哪个文件）
 *
 * | 编号 | 判据 | 落在 |
 * |---|---|---|
 * | U1 | 同门连调两次 ⇒ 弹框 1 次、票表不新增、ticket 相同 | 本文件 |
 * | U2 | 连调三次幂等且不续期（createdAt 不变） | 本文件 |
 * | U3 | 已批准的计划再调 ⇒ already-settled（不弹框） | 本文件 |
 * | U4 | 异门实例 ⇒ 旧票被清理、新票在场 | 本文件 |
 * | U5 | 跨窗口（另一 windowKey）请求同门 ⇒ 复用且不覆盖归属 | 本文件 |
 * | U6 | 已批准后再走一次落章 ⇒ 时间戳与证据**逐字节不变** | tests/confirm-settle-preconditions.test.ts |
 * | U7 | 需求已离开来源阶段后作答 ⇒ 零新时间戳、评论 +1 | tests/confirm-settle-preconditions.test.ts |
 * | U8 | 被取代的门迟到作答 ⇒ 不调落章实现、只留痕 | tests/stale-answer-background.test.ts |
 * | U9 | status 投影读门状态（ticket/requirement_id/target/created_at/blocked_tools/recovery） | tests/status-pending-confirm.test.ts |
 *
 * 「同门唯一在途」的**可跑探针**：`npx tsx scripts/gate-inflight-probe.mts`（模型级：门表是进程内结构）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import { requestGate, type GateRequestInput } from '../src/application/internal/gate-request.js'
import { triggerAutoConfirm } from '../src/application/internal/auto-confirm.js'
import type { PendingConfirmPort, UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-gate-001'
const REQ = 'REQ-gate001'
const OTHER_WINDOW = 'session-gate-owner'

let dir: string
let store: ReturnType<typeof makeTestStore>
let askCalls: number
let registerCalls: number
let deps: UseCaseDeps
let rec: RequirementRecord

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-gate-'))
  store = makeTestStore()
  askCalls = 0
  registerCalls = 0
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 记录 + 计数 shim：把「票表有没有新增记录」变成可断言的事实。 */
function countingPort(inner: PendingConfirmRegistry): PendingConfirmPort {
  return {
    register: (input) => { registerCalls += 1; return inner.register(input) },
    get: (t, w) => inner.get(t, w),
    settle: (t, o) => inner.settle(t, o),
    pendingForWindow: (w) => inner.pendingForWindow(w),
    findOpen: (input) => inner.findOpen(input),
    markInterrupted: (t) => inner.markInterrupted(t),
  }
}

const exec = { agent: { id: W } }

/** 台账 seed：decomposing 需求 + 未确认的 design 产物 + 未批准的计划（两种门都能开）。 */
async function seed(): Promise<void> {
  rec = {
    id: REQ, title: '建门唯一入口', description: '', status: 'decomposing', blocked: false,
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

function makeDeps(): UseCaseDeps {
  const now = (): number => Date.now()
  const registry = new PendingConfirmRegistry({ now })
  return {
    store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => ({
      ask: async () => { askCalls += 1; throw new Error('requestGate 不得自己弹框') },
    })),
    pendingConfirms: countingPort(registry),
    doneThrottleMs: 0,
  } as unknown as UseCaseDeps
}

const PLAN_GATE: GateRequestInput = { requirementId: REQ, target: 'plan', kind: 'decomposition', question: '拆分计划已提交，请批准' }
const DESIGN_GATE: GateRequestInput = { requirementId: REQ, target: 'artifact', kind: 'design', question: '设计文档已提交，请确认' }

/** 模拟调用通道：只有 opened 才投递弹框（真实接线见 t3/t4/t5）。 */
let deliveries: string[] = []
async function requestAndDeliver(input: GateRequestInput): Promise<Awaited<ReturnType<typeof requestGate>>> {
  const out = await requestGate(deps, input, exec)
  if (out.mode === 'opened') deliveries.push(out.ticket)
  return out
}

describe('U1/U2 同门复用：第二次请求不新开框、不新增票', () => {
  beforeEach(async () => { await seed(); deps = makeDeps(); deliveries = [] })

  it('U1 同门两次：第一次新建（投递 1 次），第二次复用（投递仍 1 次、票表不新增、ticket 相同）', async () => {
    const first = await requestAndDeliver(PLAN_GATE)
    expect(first.mode).toBe('opened')
    expect(registerCalls).toBe(1)

    const second = await requestAndDeliver(PLAN_GATE)
    expect(second.mode).toBe('reused')
    if (first.mode === 'opened' && second.mode === 'reused') expect(second.ticket).toBe(first.ticket)
    expect(registerCalls).toBe(1)      // 票表计数不变
    expect(deliveries).toHaveLength(1)  // 弹框恰好 1 次
    expect(askCalls).toBe(0)            // requestGate 自身从不弹框
  })

  it('U2 连调三次幂等且不续期：ticket 与 createdAt 都不变', async () => {
    const first = await requestAndDeliver(PLAN_GATE)
    const createdAt = first.mode === 'opened' ? deps.pendingConfirms?.get(first.ticket, W)?.createdAt : undefined
    await requestAndDeliver(PLAN_GATE)
    await requestAndDeliver(PLAN_GATE)
    expect(registerCalls).toBe(1)
    expect(deliveries).toHaveLength(1)
    if (first.mode === 'opened') {
      expect(deps.pendingConfirms?.get(first.ticket, W)?.createdAt).toBe(createdAt)
    }
  })
})

describe('U3 早退：已落章的同门不再建门', () => {
  it('计划已批准 → already-settled，不投递、不登记', async () => {
    await seed()
    rec = { ...rec, plan: { ...rec.plan!, approvedAt: 9, approvedBy: { kind: 'human' } } } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
    deps = makeDeps(); deliveries = []

    const out = await requestGate(deps, PLAN_GATE, exec)
    expect(out).toEqual({ mode: 'already-settled', confirmed: true })
    expect(registerCalls).toBe(0)
    expect(deliveries).toHaveLength(0)
  })

  it('设计产物已确认 → already-settled（成组落章口径：该 kind 全部 confirmedAt 有值）', async () => {
    await seed()
    const arts = (rec.artifacts ?? []).map(a => ({ ...a, confirmedAt: 9, confirmedBy: { kind: 'human' } }))
    rec = { ...rec, artifacts: arts } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
    deps = makeDeps(); deliveries = []

    const out = await requestGate(deps, DESIGN_GATE, exec)
    expect(out).toEqual({ mode: 'already-settled', confirmed: true })
    expect(registerCalls).toBe(0)
  })
})

describe('U4/U5 键与跨窗口：只认同一道门', () => {
  beforeEach(async () => { await seed(); deps = makeDeps(); deliveries = [] })

  it('U4 计划门在等时请求设计门 → 不算同门，各自 opened', async () => {
    const plan = await requestAndDeliver(PLAN_GATE)
    const design = await requestAndDeliver(DESIGN_GATE)
    expect(plan.mode).toBe('opened')
    expect(design.mode).toBe('opened')
    expect(registerCalls).toBe(2)
    expect(deliveries).toHaveLength(2)
  })

  it('U5 跨窗口复用：owner 窗口建的门，本窗口请求同门直接复用（人只被问一次）', async () => {
    const ownerTicket = deps.pendingConfirms?.register({ windowKey: OTHER_WINDOW, requirementId: REQ, target: 'plan' }).ticket
    registerCalls = 0  // 只数 requestGate 引发的登记
    const out = await requestGate(deps, PLAN_GATE, exec)
    expect(out.mode).toBe('reused')
    if (out.mode === 'reused') expect(out.ticket).toBe(ownerTicket)
    expect(registerCalls).toBe(0)
    expect(deliveries).toHaveLength(0)
  })
})

describe('判定顺序的设计口径（复用优先）', () => {
  it('台账已落章 + 同门仍 open → 返回 reused（回执以台账为准，陈旧作答由 t6/t7 中性化）', async () => {
    await seed()
    rec = { ...rec, plan: { ...rec.plan!, approvedAt: 9, approvedBy: { kind: 'human' } } } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [rec], triages: [] })
    deps = makeDeps(); deliveries = []
    const open = deps.pendingConfirms?.register({ windowKey: W, requirementId: REQ, target: 'plan' }).ticket

    const out = await requestGate(deps, PLAN_GATE, exec)
    expect(out.mode).toBe('reused')
    if (out.mode === 'reused') expect(out.ticket).toBe(open)
  })
})

describe('前置校验沿用既有错误码（不造答不了的票）', () => {
  beforeEach(async () => { await seed(); deps = makeDeps(); deliveries = [] })

  it('非本窗口绑定的需求 → REQBOARD_NOT_BOUND_TO_WINDOW，且不留票', async () => {
    await expect(requestGate(deps, { ...PLAN_GATE, requirementId: 'REQ-other' }, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_NOT_BOUND_TO_WINDOW' })
    expect(registerCalls).toBe(0)
  })

  it('无产物在册的 kind → REQBOARD_MISSING_ARTIFACT，且不留票', async () => {
    await expect(requestGate(deps, { ...DESIGN_GATE, kind: 'verification' }, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_MISSING_ARTIFACT' })
    expect(registerCalls).toBe(0)
  })
})

describe('联调：自动弹通道与 agent 通道共用同一道门（本需求的核心现场）', () => {  it('自动弹建门后 agent 再请求同门 ⇒ reused（同一张票、不新增记录、只有一次投递）', async () => {
    await seed()
    deps = makeDeps()
    deliveries = []
    // 让弹框永不作答：门保持 open（若让它抛错，后台续跑会把票 settle 掉，测的就不是"在途"了）
    ;(deps as { questions: unknown }).questions = new UserQuestionsAdapter(() => ({
      ask: () => new Promise<never>(() => { /* 永不 resolve */ }),
    }))

    const auto = await triggerAutoConfirm(
      deps,
      { requirementId: REQ, target: 'plan', kind: 'decomposition', question: '拆分计划已提交，请批准' },
      exec,
    )
    expect(auto.triggered).toBe(true)
    expect(registerCalls).toBe(1)
    const openTicket = deps.pendingConfirms?.findOpen({ requirementId: REQ, target: 'plan' })?.ticket
    expect(openTicket).toBeDefined()

    // agent 通道（不带 adopted_ticket）再请求同一道门
    const out = await requestGate(deps, PLAN_GATE, exec)
    expect(out.mode).toBe('reused')
    if (out.mode === 'reused') expect(out.ticket).toBe(openTicket)  // 复用自动弹建的那张票
    expect(registerCalls).toBe(1)                                    // 没有第二条记录
    expect(deliveries).toHaveLength(0)                               // 本用例的投递都不经 requestAndDeliver
  })
})

describe('G4 验收门：同一道门两次请求也只开一个框（review findings-6）', () => {
  it('kind=verification 首请求 opened、再请求 reused（同一张票、票表不新增、只投递一次）', async () => {
    // 为什么单列：复核指出 G4 的 reused 分支在别处没有直接用例（verification 那两个用例
    // 断言的是上游写路径守卫），而"验收门不会开出第二个框"正是本需求的 FR-1 在 G4 上的落点。
    await seed()
    const withVerification = {
      ...rec,
      artifacts: [
        ...(rec.artifacts ?? []),
        {
          stage: 'accepting', kind: 'verification',
          path: 'docs/requirements/' + REQ + '/verification.md', registeredAt: 1,
        } as StageArtifact,
      ],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [withVerification], triages: [] })
    deps = makeDeps()
    deliveries = []

    const verificationGate: GateRequestInput = {
      requirementId: REQ, target: 'artifact', kind: 'verification', question: '验收材料已提交，请确认进入验收',
    }
    const first = await requestAndDeliver(verificationGate)
    const second = await requestAndDeliver(verificationGate)

    expect(first.mode).toBe('opened')
    expect(second.mode).toBe('reused')
    if (first.mode === 'opened' && second.mode === 'reused') expect(second.ticket).toBe(first.ticket)
    expect(registerCalls).toBe(1)      // 票表不新增
    expect(deliveries).toHaveLength(1) // 只投递一次（没有第二个框）
  })
})
