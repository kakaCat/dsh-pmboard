/**
 * 端口适配器（新驱动的五处适配）：**事实装配**与**环境栅栏**。
 * 判据来源逐条对账——适配器是"谁有事实谁提供"的那个"谁"，接错就是静默错判。
 */
import { describe, it, expect, vi } from 'vitest'
import { buildGoalRoundPorts, type GoalRoundAdapterDeps } from '../pm/src/adapters/goal-round-ports.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { repoPath } from 'tests/helpers/repo-root.js'
import { createCaptureRuntime } from '../pm/src/wiring/pm-capture-root.js'
import { FileDiagSink } from '../pm/src/adapters/FileDiagSink.js'
import { createGoalRoundLifecycle } from '../pm/src/adapters/goal-round-lifecycle.js'
import { createGoalRoundDriver } from 'pm-goal-round-driver/driver.js'
import { decideGoalRound } from 'pm-goal-round-driver/decide.js'
import { renderRoundPrompt } from 'pm-goal-round-driver/prompt.js'
import { seedStageGoals } from 'pm-core/domain/workflow/StageGoalSeed.js'
import { initCaptureDiag } from 'pm-core/application/internal/diag-log.js'

const REQ = 'REQ-x'
const WINDOW = 'W-1'

function facts(over: Partial<{ status: string; roundsInStage: number; activation: string; health: string; advancePaused: string; goals: unknown[]; goal: unknown; artifacts: unknown[] }> = {}) {
  return {
    id: REQ, title: '需求', description: '', status: over.status ?? 'implementing',
    updatedAt: 1, version: 7, artifacts: [], sourceSessionId: WINDOW,
    dive: {
      activation: over.activation ?? 'armed', phase: 'active',
      roundsInStage: over.roundsInStage ?? 2,
      ...(over.health === undefined ? {} : { driverHealth: { state: over.health } }),
    },
    ...(over.advancePaused === undefined ? {} : { advance: { pausedReason: over.advancePaused } }),
    ...(over.goals === undefined ? {} : { goals: over.goals }),
    ...(over.artifacts === undefined ? {} : { artifacts: over.artifacts }),
    // 当前 goal 挂**需求**（goal 不挂卡；一条需求一个）。
    ...(over.goal === undefined ? {} : { goal: over.goal }),
  }
}

function deps(over: Partial<GoalRoundAdapterDeps> = {}, opts: {
  req?: unknown; tasks?: Array<{ id: string; status: string; acceptance?: string; goal?: unknown }>
} = {}) {
  const req = opts.req ?? facts()
  const tasks = opts.tasks ?? [{ id: 't-1', status: 'running', acceptance: '登录页可用' }]
  const d: GoalRoundAdapterDeps = {
    peekFacts: () => [req] as never,
    getRequirement: async () => req as never,
    tasksOf: async () => tasks as never,
    delivery: {} as never,
    checkpoint: async () => {},
    persistAdmission: () => {},
    createGoal: () => true,
    blockGoal: () => true,
    askStageDone: () => {},
    trace: () => {},
    fiberActive: () => true,
    agentLive: () => true,
    now: () => 1_000,
    logger: { info: () => {}, debug: () => {}, warn: () => {} },
    ...over,
  }
  return { ports: buildGoalRoundPorts(d), req, tasks }
}

describe('factsOf · 事实装配', () => {
  it('窗口无绑定需求 → undefined（不是我这个窗口的活）', async () => {
    const { ports } = deps()
    expect(await ports.factsOf('W-other')).toBeUndefined()
  })

  it('归属/可驱动/闭锁判据/回合计数/revision/状态 逐条来自台账', async () => {
    const { ports } = deps({}, { req: facts({ roundsInStage: 5, activation: 'disarmed', health: 'paused' }) })
    const f = await ports.factsOf(WINDOW)
    expect(f?.requirement).toMatchObject({ id: REQ, sourceSessionId: WINDOW, drivable: false })
    expect(f?.latch).toMatchObject({ requirementPresent: true, activation: 'disarmed', driverHealthState: 'paused' })
    expect(f?.roundsInStage).toBe(5)
    expect(f?.revision).toBe(7)
    expect(f?.status).toBe('implementing')
  })

  it('推进告警进事实（advance.pausedReason 存在 ⇒ 决策层不驱动）', async () => {
    const { ports } = deps({}, { req: facts({ advancePaused: 'stalled' }) })
    expect((await ports.factsOf(WINDOW))?.requirement?.advancePausedReason).toBe('stalled')
  })

  it('阶段文案：陈述/判据/进度来自整条记录（窄投影只有计数）', async () => {
    const { ports } = deps({}, {
      req: facts({
        goals: [
          { stage: 'design', statement: '设计定稿', doneCriteria: ['评审通过'], state: 'done' },
          { stage: 'implementing', statement: '实现全部卡', doneCriteria: ['测试全绿'], state: 'pending' },
        ],
      }),
    })
    const f = await ports.factsOf(WINDOW)
    expect(f?.stage).toMatchObject({ stageStatement: '实现全部卡', doneCriteria: ['测试全绿'], stageProgress: { total: 2, done: 1 } })
    expect(f?.goal?.stageReadyToClose).toBe(false)
  })

  it('阶段全达成 → stageReadyToClose=true（收口条件）', async () => {
    const { ports } = deps({}, {
      req: facts({ goals: [{ stage: 'design', statement: 'x', doneCriteria: [], state: 'done' }] }),
    })
    expect((await ports.factsOf(WINDOW))?.goal?.stageReadyToClose).toBe(true)
  })

  it('下一件事：running 优先 → 进 goal 事实（只决定“继续还是停手 / 这一拍做什么”，不是 goal 身份）', async () => {
    const { ports } = deps({}, {
      tasks: [
        { id: 't-1', status: 'todo', acceptance: 'a1' },
        { id: 't-2', status: 'running', acceptance: 'a2' },
      ],
    })
    const f = await ports.factsOf(WINDOW)
    expect(f?.goal).toMatchObject({ nextTaskId: 't-2' })
    // 卡不进 goal 的**身份**：决策形状里没有 taskId 字段
    expect(Object.keys(f?.goal ?? {})).not.toContain('hasReadyTask')
    // 卡的 acceptance 也不进事实（D-1：卡不做 objective）——防它悄悄长回来
    expect(Object.keys(f?.goal ?? {})).not.toContain('nextTaskAcceptance')
  })

  it('全收口（无开卡）→ 无 nextTaskId（决策层据此判“停手等人”）', async () => {
    const { ports } = deps({}, { tasks: [{ id: 't-1', status: 'done' }] })
    expect((await ports.factsOf(WINDOW))?.goal?.nextTaskId).toBeUndefined()
  })

  it('当前阶段有未达成阶段目标 → stagePending 进事实（建 goal 的唯一目标来源）', async () => {
    const { ports } = deps({}, {
      req: facts({
        goals: [{ stage: 'implementing', statement: '实现全部卡', doneCriteria: ['测试全绿'], state: 'pending' }],
      }),
    })
    expect((await ports.factsOf(WINDOW))?.goal?.stagePending)
      .toMatchObject({ stage: 'implementing', statement: '实现全部卡', doneCriteria: ['测试全绿'] })
  })

  it('当前阶段已落章（done）→ 不给 stagePending（不许对着已落章的阶段再建 goal）', async () => {
    const { ports } = deps({}, {
      req: facts({
        goals: [{ stage: 'implementing', statement: '实现全部卡', doneCriteria: ['测试全绿'], state: 'done' }],
      }),
    })
    expect((await ports.factsOf(WINDOW))?.goal?.stagePending).toBeUndefined()
  })

  it('goal 相位来自需求记录上的 goal（pm-goal 的读）', async () => {
    const { ports } = deps({}, { req: facts({ goal: { id: 'goal:REQ-x', objective: 'a', phase: 'paused', revision: 1 } }) })
    expect((await ports.factsOf(WINDOW))?.goal?.phase).toBe('paused')
  })

  it('goal 身份/修订/上限进事实（授权三元组 + round-limit 的事实源）', async () => {
    const goal = { id: 'goal:REQ-x', objective: 'a', phase: 'active' as const, revision: 4, maxGoalRounds: 7 }
    const { ports } = deps({}, { req: facts({ goal }) })
    const g = (await ports.factsOf(WINDOW))?.goal
    expect(g).toMatchObject({ goalId: 'goal:REQ-x', goalRevision: 4, maxGoalRounds: 7 })
  })

  it('goal 没显式设上限 → 回落阶段上限（roundLimitFor；未知阶段 10）', async () => {
    const goal = { id: 'goal:REQ-x', objective: 'a', phase: 'active' as const, revision: 1 }
    const { ports } = deps({}, { req: facts({ goal }) })
    const cap = (await ports.factsOf(WINDOW))?.goal?.maxGoalRounds
    expect(typeof cap).toBe('number')
    expect(cap).toBeGreaterThan(0)
  })

  it('需求上没有 goal → 身份/上限不出现（缺失 ≠ 0）', async () => {
    const { ports } = deps({}, { tasks: [{ id: 't-1', status: 'running', acceptance: 'a' }] })
    const g = (await ports.factsOf(WINDOW))?.goal
    expect(g?.goalId).toBeUndefined()
    expect(g?.maxGoalRounds).toBeUndefined()
  })
})

describe('blockGoal · 故障语义的耐久半边', () => {
  const goal = { id: 'goal:REQ-x', objective: 'a', phase: 'active' as const, revision: 2 }

  it('需求上有 goal → 落 blockGoal（不再按卡挑目标）', async () => {
    const calls: unknown[][] = []
    const { ports } = deps({ blockGoal: (...a) => { calls.push(a); return true } }, { req: facts({ goal }) })
    expect(await ports.blockGoal(REQ, { code: 'queue-failed', message: 'x' })).toBe(true)
    expect(calls).toEqual([[REQ, { code: 'queue-failed', message: 'x' }]])
  })

  it('需求上没有 goal → false（幂等：没东西可 block）', async () => {
    const calls: unknown[][] = []
    const { ports } = deps({ blockGoal: (...a) => { calls.push(a); return true } }, {
      tasks: [{ id: 't-1', status: 'running' }],
    })
    expect(await ports.blockGoal(REQ, { code: 'queue-failed', message: 'x' })).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('factsOf · 外部闸', () => {
  it('上游闩 / 弹框在途 → 进闸事实', async () => {
    const { ports } = deps({ providerLatchOpen: () => true, dialogInFlight: () => true })
    const f = await ports.factsOf(WINDOW)
    expect(f?.gates).toMatchObject({ providerLatchOpen: true, dialogInFlight: true })
  })

  it('人工门开着 → 进闸事实（带原因）；判据抛错 → 按门关（fail-open）+ 告警', async () => {
    const ok = await deps({ humanGate: () => ({ open: true, reason: 'accept-sheet' }) }).ports.factsOf(WINDOW)
    expect(ok?.gates).toMatchObject({ humanGateOpen: true, humanGateReason: 'accept-sheet' })

    const warn = vi.fn()
    const bad = await deps({
      humanGate: () => { throw new Error('boom') },
      logger: { info: () => {}, debug: () => {}, warn },
    }).ports.factsOf(WINDOW)
    expect(bad?.gates?.humanGateOpen).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('预算拒绝 → 进闸事实；抛错 → 按放行（fail-open）', async () => {
    const denied = await deps({ chainBudget: () => ({ allowed: false, reason: 'wip' }) }).ports.factsOf(WINDOW)
    expect(denied?.gates).toMatchObject({ chainBudgetAllowed: false, chainBudgetReason: 'wip' })
    const err = await deps({ chainBudget: () => { throw new Error('x') } }).ports.factsOf(WINDOW)
    expect(err?.gates?.chainBudgetAllowed).toBeUndefined()
  })
})

describe('validateReservation · 环境栅栏（fiber / agent 存活）', () => {
  const input = {
    agentId: WINDOW,
    content: 'r3',
    source: { kind: 'dive', requirementId: REQ, revision: 7, round: 3 },
    reservation: { round: 3, revision: 7, phase: 'claimed' },
  }

  it('环境健康 + 台账对得上 → 放行', () => {
    expect(deps().ports.validateReservation?.(input)).toEqual({ valid: true })
  })

  it('fiber 不 active → 拒（与旧栅栏同口径）', () => {
    expect(deps({ fiberActive: () => false }).ports.validateReservation?.(input))
      .toMatchObject({ valid: false, reason: 'env-or-ledger-fence' })
  })

  it('agent 不存活 → 拒', () => {
    expect(deps({ agentLive: () => false }).ports.validateReservation?.(input)).toMatchObject({ valid: false })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 宿主装配守卫（迁自 `pm-core/tests/dive-wake-wiring.test.ts`；2026-10-10 旧回合半退役）
//
// 由来（REQ-261001201200-8f8b）：组合根的端口字面量**缺 `delivery`** —— drive() 在运行期第一步就抛，
// 抛错被吞 → disarm → 需求此后所有唤醒触发静默 return。tsc 本可报（TS2741），但被仓库既有的类型错误
// 淹没，没人看。所以用一条**可读的**源码级断言把它钉住；下面再补一条**行为**断言（真投递器 + 真驱动）。
// ─────────────────────────────────────────────────────────────────────────────
describe('生产装配守卫：buildGoalRoundPorts 必须接全（尤其 delivery）', () => {
  const src = readFileSync(repoPath('pm/src/index.ts'), 'utf8')
  const at = src.indexOf('buildGoalRoundPorts({')
  const after = at === -1 ? -1 : src.indexOf('const diveManager', at)
  // 参数块 = 从调用点到紧随其后的下一条语句。刻意**不**用「第一个 }) 行」当终点：
  // `delivery` 内部就有 `})`（mutateIfPresent 的收尾），那样截出来的块会缺掉 humanGate 之后的所有键。
  const block = at === -1 || after === -1 ? '' : src.slice(at, after)

  it('字面量可定位（守卫自身不空转）', () => {
    expect(at).toBeGreaterThan(-1)
    expect(block.length).toBeGreaterThan(0)
    // 块必须包含该调用的收尾行——否则"在位"断言可能只是在残缺片段上碰巧成立。
    expect(block.trimEnd().endsWith('})'), '参数块未取到收尾的 })').toBe(true)
  })

  it('delivery 在位——缺它 drive() 第一步就抛（与投递器构造错位是同一症状的第二处断点）', () => {
    expect(block).toContain('delivery:')
  })

  it('其余关键端口键均在位（键可写冒号或简写）', () => {
    for (const k of [
      'peekFacts', 'getRequirement', 'tasksOf', 'delivery', 'checkpoint', 'persistAdmission',
      'humanGate', 'chainBudget', 'now', 'logger',
      // 故障语义的耐久半边（round-limit / queue-failed / prompt-rejected 落盘）与栅栏的环境判据：
      // 漏了就退化成"内存闭锁 + 不落盘"或"预留没人复核环境"。
      'blockGoal', 'createGoal', 'fiberActive', 'agentLive',
    ]) {
      expect(block, '缺少端口键 ' + k).toMatch(new RegExp('\\b' + k + '\\s*[:,]'))
    }
  })
})

describe('装配形状守卫：组合根产出的投递器能被真实驱动器驱动起来', () => {
  it('一次 requestDrive → inbox 恰 1 条 source.kind=dive 的回合消息', async () => {
    const inbox = {
      nextTurn: [] as Array<{ id?: string; source?: { kind?: string } }>, nextStep: [] as unknown[],
      prepend(target: string, m: unknown) { (target === 'next-step' ? this.nextStep : this.nextTurn).unshift(m as never) },
    }
    const agent = {
      id: WINDOW, status: 'idle', session: { id: WINDOW }, inbox,
      followup(message: unknown) { inbox.nextTurn.push(message as never) },
    }
    // ★ 投递器**走真实组合根**产出（不手搓 fake delivery）——缺 delivery / 形状错位时这里必红。
    const { deliverer } = createCaptureRuntime({
      plugin: 'dsh-pmboard',
      getAgents: () => ({ get: (id: string) => (id === WINDOW ? agent : undefined) }),
    })
    const { ports } = deps({
      delivery: {
        createRoundMessage: (i: { requirementId: string; revision: number; round: number; text: string }) => deliverer.createRoundMessage(i),
        deliverMessage: (w: string, m: unknown) => deliverer.deliverMessage(w, m),
        checkpoint: async () => {},
        persistAdmission: () => {},
        contentOf: (m: unknown) => (m as { content?: unknown } | undefined)?.content,
        now: () => 1_000,
      } as never,
    }, {
      // 需求上有 active goal ⇒ 驱动当拍走 `drive`（goal 挂需求，卡只是本轮落点）。
      req: facts({ goal: { id: 'goal:REQ-x', objective: 'a', phase: 'active', revision: 1 } }),
    })
    const driver = createGoalRoundDriver(ports)
    await driver.requestDrive(WINDOW)
    await driver.whenQuiet()

    const rounds = inbox.nextTurn.filter((m) => m.source?.kind === 'dive')
    expect(rounds, '投递器/delivery 形状错位，这里会是 0（drive 第一步就抛）').toHaveLength(1)
    expect(typeof (rounds[0] as { id?: unknown }).id).toBe('string')
    expect((rounds[0] as { source: { requirementId: string; revision: number; round: number } }).source.requirementId).toBe(REQ)
    driver.teardown()
  })
})

describe('FR-3 · agent 事件必须注册在 agent.ctx（拿不到时三条证据齐备）', () => {
  /** 收集 subscribe 的回调，便于手工触发 root 事件。 */
  function fakeBus() {
    const listeners = new Map<string, Array<(...a: unknown[]) => unknown>>()
    return {
      bus: {
        on(event: string, l: (...a: unknown[]) => unknown) {
          const arr = listeners.get(event) ?? []
          arr.push(l)
          listeners.set(event, arr)
          return () => { listeners.set(event, (listeners.get(event) ?? []).filter((x) => x !== l)) }
        },
      },
      emit: (event: string, payload: unknown) => { for (const l of listeners.get(event) ?? []) l(payload) },
    }
  }

  it('拿不到 agent.ctx → warn + 诊断日志 + 需求 comment 三者齐备（不静默降级）', async () => {
    const diagPath = join(tmpdir(), 'dsh-pmboard-goal-diag-' + process.pid + '.log')
    initCaptureDiag(new FileDiagSink(diagPath))
    const warns: string[] = []
    const comments: string[] = []
    const store = {
      mutate: async (_id: string, fn: (draft: { comments: Array<{ body: string }>; updatedAt: number }) => unknown) => {
        const draft = { comments: [] as Array<{ body: string }>, updatedAt: 0 }
        fn(draft)
        for (const c of draft.comments) comments.push(c.body)
        return { changed: true }
      },
    }
    const { bus, emit } = fakeBus()
    const lifecycle = createGoalRoundLifecycle(bus as never, {
      ports: deps().ports,
      peekFacts: () => [facts()] as never,
      store: store as never,
      agents: { get: () => undefined },
      now: () => 1_000,
      logger: { info: () => {}, debug: () => {}, warn: (m: string) => { warns.push(m) } },
    })

    // 宿主 `agent/created` 给的 agent **没有可订阅的 ctx** ⇒ per-agent 订阅未成立 ⇒ 驱动永不被唤醒。
    emit('agent/created', { agent: { id: WINDOW, session: { id: WINDOW } } })
    await new Promise((r) => setTimeout(r, 20))

    expect(warns.join(' '), '① warn').toContain('没有可订阅的 ctx')
    expect(readFileSync(diagPath, 'utf8'), '② 诊断日志').toContain('[WAKE-FAIL]')
    expect(comments.join(' '), '③ 需求 comment').toContain('[goal-round-diag]')
    expect(lifecycle.subscriptionState().failures.length).toBeGreaterThan(0)
    await lifecycle.teardown()
  })
})

describe('阶段推进事实（2026-10-11：推进由 agent 调工具 / 人经弹框，驱动只注入指令）', () => {
  it('stage.stageEvidenceReady：本阶段必交产物齐了才是 true（draft 无必交 ⇒ false）', async () => {
    const withArtifact = deps({}, { req: facts({ status: 'design', artifacts: [{ kind: 'design' }] }), tasks: [] })
    expect((await withArtifact.ports.factsOf(WINDOW))?.stage?.stageEvidenceReady).toBe(true)
    const missing = deps({}, { req: facts({ status: 'design', artifacts: [] }), tasks: [] })
    expect((await missing.ports.factsOf(WINDOW))?.stage?.stageEvidenceReady).toBe(false)
    const draft = deps({}, { req: facts({ status: 'draft', artifacts: [] }), tasks: [] })
    expect((await draft.ports.factsOf(WINDOW))?.stage?.stageEvidenceReady).toBe(false)
  })

  it('stage.stageNext / stageNextIsHumanGate：下一阶段与门性（终态不谈推进）', async () => {
    const design = deps({}, { req: facts({ status: 'design' }), tasks: [] })
    expect((await design.ports.factsOf(WINDOW))?.stage).toMatchObject({ stageNext: 'decomposing', stageNextIsHumanGate: false })
    const brain = deps({}, { req: facts({ status: 'brainstorming' }), tasks: [] })
    expect((await brain.ports.factsOf(WINDOW))?.stage).toMatchObject({ stageNext: 'design', stageNextIsHumanGate: true })
    const archived = deps({}, { req: facts({ status: 'archived' }), tasks: [] })
    expect((await archived.ports.factsOf(WINDOW))?.stage?.stageNext).toBeUndefined()
  })

  it('提示词事实带本阶段开工序言（core 阶段链的人话）', async () => {
    const design = deps({}, { req: facts({ status: 'design' }), tasks: [] })
    expect(String((await design.ports.factsOf(WINDOW))?.stage?.stageEntry ?? '')).toContain('设计')
  })

  it('指令（非门边 + 证据齐）⇒ 让 agent **自己调工具**推进（驱动不代劳）', async () => {
    const { ports } = deps({}, {
      req: facts({ status: 'design', artifacts: [{ kind: 'design' }] }),
      tasks: [],
    })
    const f = (await ports.factsOf(WINDOW))!
    const text = renderRoundPrompt({ requirementId: f.requirement!.id, round: 1, status: String(f.status), ...(f.stage ?? {}) })
    expect(text).toContain('【阶段推进】')
    expect(text).toContain('reqboard_move')
    expect(text).toContain('decomposing')
  })

  it('指令（门边）⇒ 请人裁，明说不得自己越门', async () => {
    const { ports } = deps({}, {
      req: facts({ status: 'brainstorming', artifacts: [{ kind: 'requirement' }] }),
      tasks: [],
    })
    const f = (await ports.factsOf(WINDOW))!
    const text = renderRoundPrompt({ requirementId: f.requirement!.id, round: 1, status: String(f.status), ...(f.stage ?? {}) })
    expect(text).toContain('人工门')
    expect(text).toContain('reqboard_ask_confirm')
  })

  it('指令（证据未齐）⇒ 先补产物，不谈推进', async () => {
    const { ports } = deps({}, { req: facts({ status: 'design', artifacts: [] }), tasks: [] })
    const f = (await ports.factsOf(WINDOW))!
    const text = renderRoundPrompt({ requirementId: f.requirement!.id, round: 1, status: String(f.status), ...(f.stage ?? {}) })
    expect(text).toContain('必交产物尚未齐')
  })
})

describe('立项 → 逐阶段 / 逐卡续跑（批 1 闭环：创建走驱动）', () => {
  it('阶段推进了（旧目标已清 / 目标陈述变了）⇒ 为新阶段起目标（推进后自动续跑）', async () => {
    const { ports } = deps({}, {
      req: facts({ status: 'design', goals: seedStageGoals() }),   // 推进后：目标被清（phase undefined）
      tasks: [],
    })
    const f = (await ports.factsOf(WINDOW))!
    const d = decideGoalRound({
      now: 1_000, requirement: f.requirement!, roundsInStage: f.roundsInStage,
      ...(f.goal === undefined ? {} : { goal: f.goal }),
    })
    expect(d).toMatchObject({ kind: 'create-goal', objective: '设计：按已确认的 FR 写设计文档（design/*.md）' })
  })

  it('doc 阶段（无卡）＋ seed 阶段表 ⇒ 第一拍 create-goal（objective = 阶段目标陈述）', async () => {
    const { ports } = deps({}, { req: facts({ status: 'draft', goals: seedStageGoals() }), tasks: [] })
    const f = (await ports.factsOf(WINDOW))!
    const d = decideGoalRound({
      now: 1_000,
      requirement: f.requirement!,
      ...(f.gates === undefined ? {} : { gates: f.gates }),
      ...(f.goal === undefined ? {} : { goal: f.goal }),
      roundsInStage: f.roundsInStage,
    })
    // draft 阶段的陈述（本项目台账真值）
    expect(d).toMatchObject({ kind: 'create-goal', objective: '立项完成并接手开工' })
    // 决策形状对齐宿主 create_goal：没有卡字段
    expect('taskId' in d).toBe(false)
  })

  it('老台账（没 seed 阶段表、也没卡）→ 响亮停手，不臆造目标', async () => {
    const { ports } = deps({}, { req: facts({ status: 'draft' }), tasks: [] })
    const f = (await ports.factsOf(WINDOW))!
    const d = decideGoalRound({
      now: 1_000,
      requirement: f.requirement!,
      ...(f.goal === undefined ? {} : { goal: f.goal }),
      roundsInStage: f.roundsInStage,
    })
    expect(d).toMatchObject({ kind: 'hold', reason: 'no-pending-stage-goal' })
  })

  it('**逐卡续跑**：目标 complete 但本阶段还有 ready 卡 ⇒ 继续建 goal（objective = 阶段目标陈述，不是卡 acceptance）', async () => {
    const { ports } = deps({}, {
      req: facts({ status: 'implementing', goals: seedStageGoals(), goal: { id: 'goal:REQ-x', objective: 'a', phase: 'complete', revision: 1 } }),
      tasks: [{ id: 't-9', status: 'todo', acceptance: '登录页可用' }],
    })
    const f = (await ports.factsOf(WINDOW))!
    const d = decideGoalRound({
      now: 1_000,
      requirement: f.requirement!,
      ...(f.goal === undefined ? {} : { goal: f.goal }),
      roundsInStage: f.roundsInStage,
    })
    // 卡只回答"要不要继续"；objective 仍取本阶段已登记的阶段目标陈述（D-1：卡不做 objective）
    const pending = seedStageGoals().find((g) => g.stage === 'implementing')!.statement
    expect(d).toMatchObject({ kind: 'create-goal', objective: pending })
    expect((d as { objective: string }).objective).not.toBe('登录页可用')
  })

  it('目标 complete 且**目标陈述没变**（同一阶段又跑完一拍）⇒ 停手等人（不许反复建 goal 空转）', async () => {
    // objective 与阶段陈述**相同** = 没有推进到新阶段：这时再建 goal 就是 complete → 建 → complete 空转
    const { ports } = deps({}, {
      req: facts({
        status: 'brainstorming', goals: seedStageGoals(),
        goal: { id: 'goal:REQ-x', objective: '需求分析：确认边界 / 定义 / 角色 / FR，落 requirement.md', phase: 'complete', revision: 1 },
      }),
      tasks: [],
    })
    const f = (await ports.factsOf(WINDOW))!
    const d = decideGoalRound({
      now: 1_000,
      requirement: f.requirement!,
      ...(f.goal === undefined ? {} : { goal: f.goal }),
      roundsInStage: f.roundsInStage,
    })
    expect(d).toMatchObject({ kind: 'wait-human', reason: 'stage-awaiting-adjudication' })
  })
})
