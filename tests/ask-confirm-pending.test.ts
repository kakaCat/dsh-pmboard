// serves: FR-3
/**
 * 弹框非阻塞投递 + 回执 单测（REQ-260924213231-b1c4 T-6 / FR-3）。
 *
 * 覆盖 design/test-cases.md：TC-5（超宽限挂起，不判失败）/ TC-6（宽限内作答=旧语义）/
 * TC-7（后台落章 + 回执以台账为准）/ TC-8（未知 ticket → REQBOARD_UNKNOWN_TICKET）/
 * TC-20（已确认不重复弹框）；并锁新语义（REQ-260927123256-196b FR-3）：**显式宽限才是非阻塞逃生舱**
 * ——缺省阻塞不在此文件（见 ask-confirm-blocking.test.ts），且「显式宽限但未装配注册表」显式拒绝。
 *
 * 断言口径（任务卡 acceptance）：questions.ask 永不 resolve + 宽限 20ms → 返回 pending=true
 * 且 ticket 非空、不抛错；作答后 reqboard_confirm_receipt(ticket) 返回 confirmed=true,
 * advanced=true 且台账 confirmedAt 已写。
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
import { defineAskConfirmTool, defineConfirmReceiptTool } from '../src/tools/index.js'
import type { CrossWindowDeliveryPort, AskAnswer, UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-pending-001'
const AFFIRM = '确认，推进到下一阶段 (Recommended)'
const ARGS = { target: 'artifact', kind: 'requirement', question: '需求文档已完成，是否确认进入设计？' }

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-pending-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

type AskFn = () => Promise<{ answers?: AskAnswer[] }>

/**
 * 真适配器构造 UseCaseDeps；pending=true 才装配挂起确认注册表（缺省 = 旧阻塞语义）。
 *
 * `crossWindowDeliver` 是**现存的**跨窗口投递端口（旧 `delivery` / `AgentDeliveryPort.deliver`
 * 已随 Dive 化删除）——本文件只在 TC-7 用它作"装好可用投递通道"的观察点。
 */
function makeDeps(ask: AskFn, opts: { pending?: boolean; crossWindowDeliver?: CrossWindowDeliveryPort } = {}): UseCaseDeps {
  const now = (): number => Date.now()
  const deps = {
    store: store,
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => ({ ask })),
    doneThrottleMs: 0,
  } as unknown as UseCaseDeps & Record<string, unknown>
  if (opts.pending === true) deps.pendingConfirms = new PendingConfirmRegistry({ now })
  if (opts.crossWindowDeliver !== undefined) deps.crossWindowDeliver = opts.crossWindowDeliver
  return deps
}

/** 台账 seed：statusHistory 以当前状态收尾（真实台账口径，回执据此还原 from）。 */
async function seed(): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '非阻塞确认', description: '', status: 'brainstorming', blocked: false,
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

const exec = { agent: { id: W } }
const first = (): RequirementRecord => store.peekAll()[0]

/** 轮询等待条件成立（后台续跑含异步落盘，固定 sleep 会 flaky）。 */
async function waitFor(fn: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('waitFor 超时：条件未在 ' + ms + 'ms 内成立')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('T-6 弹框非阻塞投递（FR-3 / I-3）', () => {
  it('TC-5 超宽限：questions.ask 永不 resolve + 宽限 20ms → pending=true + ticket，不抛、不判失败', async () => {
    await seed()
    const never = new Promise<{ answers?: AskAnswer[] }>(() => {})
    const tool = defineAskConfirmTool(makeDeps(() => never, { pending: true })) as any
    const out = await tool.execute({ ...ARGS, inline_grace_ms: 20 }, exec)
    expect(out.success).toBe(true)
    expect(out.pending).toBe(true)
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(typeof out.ticket).toBe('string')
    expect(out.ticket.startsWith('pc-')).toBe(true)
    expect(out.requirement_id).toBe('REQ-abc123')
    // 超宽限不落章：台账未被改动
    expect(first().artifacts![0].confirmedAt).toBeUndefined()
    expect(first().status).toBe('brainstorming')
  })

  it('TC-6 宽限内作答肯定项 → 旧语义逐字回归（confirmed=true, advanced=true，无 pending 键）', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(async () => ({ answers: [{ id: 'confirm', selected: [AFFIRM] }] }), { pending: true })) as any
    const out = await tool.execute(ARGS, exec)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(true)
    expect(out.from).toBe('brainstorming')
    expect(out.to).toBe('design')
    expect(out.pending).toBeUndefined()
    expect(out.ticket).toBeUndefined()
    expect(first().status).toBe('design')
    expect(first().artifacts![0].confirmedVia).toBe('session')
  })

  it('宽限内作答非肯定项 → 不落章不推进，回执带用户意见', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(async () => ({ answers: [{ id: 'confirm', selected: ['需要修改'], custom: '接口再想想' }] }), { pending: true })) as any
    const out = await tool.execute(ARGS, exec)
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(out.user_choice).toBe('需要修改')
    expect(out.user_feedback).toBe('接口再想想')
    expect(first().artifacts![0].confirmedAt).toBeUndefined()
  })

  it('TC-5 未装配注册表 + 显式正数宽限 → REQBOARD_NONBLOCK_UNAVAILABLE（不静默回落为阻塞）', async () => {
    await seed()
    const slow: AskFn = async () => {
      await new Promise((r) => setTimeout(r, 30))
      return { answers: [{ id: 'confirm', selected: [AFFIRM] }] }
    }
    const tool = defineAskConfirmTool(makeDeps(slow)) as any // 不装配 pendingConfirms
    await expect(tool.execute({ ...ARGS, inline_grace_ms: 20 }, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_NONBLOCK_UNAVAILABLE' })
  })

  it('TC-3 inline_grace_ms 非法：0 / -1 → REQBOARD_INVALID_INPUT；"20"（非数）被 schema 绑定层显式拒绝', async () => {
    await seed()
    const tool = defineAskConfirmTool(makeDeps(async () => ({ answers: [] }), { pending: true })) as any
    for (const bad of [0, -1]) {
      await expect(tool.execute({ ...ARGS, inline_grace_ms: bad }, exec))
        .rejects.toMatchObject({ code: 'REQBOARD_INVALID_INPUT' })
    }
    // 非数在参数 schema（type: 'number'）即被拒——同样是「显式拒绝、不静默回落」，只是发生在更外层。
    await expect(tool.execute({ ...ARGS, inline_grace_ms: '20' }, exec)).rejects.toThrow()
  })
})

describe('T-6 回执（FR-3 / I-4）', () => {
  it('TC-7 超宽限 ticket → 作答后台落章 → reqboard_confirm_receipt 返回 confirmed=true, advanced=true', async () => {
    await seed()
    let resolveAsk: (v: { answers?: AskAnswer[] }) => void = () => {}
    const deferred = new Promise<{ answers?: AskAnswer[] }>((res) => { resolveAsk = res })
    const delivered: string[] = []
    // ⚠️ 唤醒投递已随 Dive 化删除：`src/application/internal/pending-confirm.ts` 的 `wake()` 现在
    // **只按原样构造文案、再 `void text` 显式标记"本轮不消费"**（注释原文「deliver已删除：
    // Dive模式下唤醒由roundDriver处理」）。故本用例装一个**可用**的跨窗口投递端口当观察点，
    // 断言"端子在、但这条路径不投递"——若哪天唤醒重新经该端口投递，本断言立刻变红。
    const crossWindowDeliver: CrossWindowDeliveryPort = {
      async deliver(windowKey: string, message: unknown) {
        delivered.push(windowKey + ':' + String((message as { text?: string }).text))
        return { delivered: true }
      },
      createMessage: (params: { text: string; kind: string }) => ({
        message: { text: params.text, source: { kind: params.kind } }, messageId: 'm-1',
      }),
    }
    const deps = makeDeps(() => deferred, { pending: true, crossWindowDeliver })
    // 先证明"端子真的装上了"——否则下面的"没投递"可能只是没装配
    expect((deps as { crossWindowDeliver?: unknown }).crossWindowDeliver).toBe(crossWindowDeliver)
    const askTool = defineAskConfirmTool(deps) as any
    const receiptTool = defineConfirmReceiptTool(deps) as any

    const pendingOut = await askTool.execute({ ...ARGS, inline_grace_ms: 20 }, exec)
    expect(pendingOut.pending).toBe(true)
    const ticket = String(pendingOut.ticket)

    // 人 5 分钟后作答 → 后台续跑（落章 + 推进 + 回填 + 唤醒）
    resolveAsk({ answers: [{ id: 'confirm', selected: [AFFIRM] }] })
    // 等**完整**后台落章（落章 + 推进两段 mutate），只等 confirmedAt 会撞上中间态。
    await waitFor(() => first().artifacts?.[0]?.confirmedAt !== undefined && first().status === 'design')

    const req = first()
    expect(req.status).toBe('design')
    expect(req.artifacts![0].confirmedVia).toBe('session')

    const out = await receiptTool.execute({ ticket }, exec)
    expect(out.success).toBe(true)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(true)
    expect(out.from).toBe('brainstorming')
    expect(out.to).toBe('design')
    expect(out.requirement_id).toBe('REQ-abc123')
    // 唤醒窗口：Dive 化后 `wake()` 只产文案、不投递（见上方端子说明）——断言"未投递"
    expect(delivered).toEqual([])
  })

  it('TC-8 未知 ticket → REQBOARD_UNKNOWN_TICKET', async () => {
    await seed()
    const tool = defineConfirmReceiptTool(makeDeps(async () => ({ answers: [] }), { pending: true })) as any
    await expect(tool.execute({ ticket: 'pc-无' }, exec)).rejects.toMatchObject({ code: 'REQBOARD_UNKNOWN_TICKET' })
  })

  it('ticket 跨窗口不可取用（窗口绑定）→ REQBOARD_UNKNOWN_TICKET', async () => {
    await seed()
    const deps = makeDeps(async () => ({ answers: [] }), { pending: true })
    const ticket = deps.pendingConfirms!.register({
      windowKey: 'session-other', requirementId: 'REQ-abc123', target: 'artifact', kind: 'requirement',
    }).ticket
    const tool = defineConfirmReceiptTool(deps) as any
    await expect(tool.execute({ ticket }, exec)).rejects.toMatchObject({ code: 'REQBOARD_UNKNOWN_TICKET' })
  })

  it('挂起尚未作答 → 回执如实返回 confirmed=false（不判失败、不猜）', async () => {
    await seed()
    const never = new Promise<{ answers?: AskAnswer[] }>(() => {})
    const deps = makeDeps(() => never, { pending: true })
    const askTool = defineAskConfirmTool(deps) as any
    const receiptTool = defineConfirmReceiptTool(deps) as any
    const pendingOut = await askTool.execute({ ...ARGS, inline_grace_ms: 20 }, exec)
    const out = await receiptTool.execute({ ticket: String(pendingOut.ticket) }, exec)
    expect(out.success).toBe(true)
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(String(out.note)).toContain('尚未作答')
  })

  it('后台作答为否定项 → 回执带 user_choice 且节点未推进', async () => {
    await seed()
    let resolveAsk: (v: { answers?: AskAnswer[] }) => void = () => {}
    const deferred = new Promise<{ answers?: AskAnswer[] }>((res) => { resolveAsk = res })
    const deps = makeDeps(() => deferred, { pending: true })
    const askTool = defineAskConfirmTool(deps) as any
    const receiptTool = defineConfirmReceiptTool(deps) as any
    const pendingOut = await askTool.execute({ ...ARGS, inline_grace_ms: 20 }, exec)
    resolveAsk({ answers: [{ id: 'confirm', selected: ['暂停'] }] })
    await waitFor(() => first().comments.some((c) => c.body.includes('未确认')))
    const out = await receiptTool.execute({ ticket: String(pendingOut.ticket) }, exec)
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(out.user_choice).toBe('暂停')
    expect(first().status).toBe('brainstorming')
  })
})

describe('T-6 防重弹（回归）', () => {
  it('TC-20 产物已确认 → 不再弹框（弹框端口 0 次），返回「已确认」', async () => {
    await seed()
    let asked = 0
    const tool = defineAskConfirmTool(makeDeps(async () => {
      asked += 1
      return { answers: [{ id: 'confirm', selected: [AFFIRM] }] }
    }, { pending: true })) as any
    await tool.execute(ARGS, exec)
    const out = await tool.execute(ARGS, exec)
    expect(asked).toBe(1)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(String(out.note)).toContain('已确认')
  })
})

describe('不造答不了的票（REQ-261005200052-ce40 FR-5）', () => {
  /** 与 seed() 同形状，但**不带任何产物**：模拟「产物还没登记就想请人确认」。 */
  async function seedNoArtifact(): Promise<void> {
    const r = {
      id: 'REQ-abc123', title: '无产物', description: '', status: 'brainstorming', blocked: false,
      sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      statusHistory: [
        { status: 'draft', at: 1, by: { kind: 'human' } },
        { status: 'brainstorming', at: 2, by: { kind: 'human' } },
      ],
      artifacts: [],
    } as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  }

  it('台账无该 kind 产物 → 在登记挂起票之前就拒，票表保持为空（不把窗口钉死）', async () => {
    await seedNoArtifact()
    const deps = makeDeps(async () => ({ answers: [{ id: 'confirm', selected: [AFFIRM] }] }), { pending: true })
    const tool = defineAskConfirmTool(deps) as any
    await expect(tool.execute(ARGS, exec)).rejects.toThrow(/REQBOARD_MISSING_ARTIFACT/)
    expect(deps.pendingConfirms?.pendingForWindow(W)).toBeUndefined()
    expect(first().artifacts ?? []).toHaveLength(0)
    expect(first().status).toBe('brainstorming')
  })

  it('无计划时 target=plan → 同样在登记票之前拒（REQBOARD_MISSING_PLAN）', async () => {
    await seedNoArtifact()
    const deps = makeDeps(async () => ({ answers: [{ id: 'confirm', selected: [AFFIRM] }] }), { pending: true })
    const tool = defineAskConfirmTool(deps) as any
    await expect(tool.execute({ ...ARGS, target: 'plan' }, exec)).rejects.toThrow(/REQBOARD_MISSING_PLAN/)
    expect(deps.pendingConfirms?.pendingForWindow(W)).toBeUndefined()
  })
})
