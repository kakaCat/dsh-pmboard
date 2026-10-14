/**
 * goal 回合驱动的共享夹具（2026-10-10 随旧驱动退役重建：旧夹具已删除，本文件是唯一一份）。
 *
 * 形状：**真端口适配器**（`buildGoalRoundPorts`）+ **真驱动**（`createGoalRoundDriver`），
 * 台账 / 任务队列 / 投递全是内存假件——验的是**接线**（闸判据、归属、预算、投递），不是 I/O。
 * 停手形态按新驱动口径：`hold` 只留痕（不写健康位、不改人的意图），故障才落盘 `blockGoal`。
 *
 * @module dsh-pmboard/tests/support/goal-round-harness
 */
import { factsOf } from 'pm-core/domain/requirement/RequirementSummary.js'
import { emptyLedger, type RequirementDive, type RequirementRecord } from 'pm-core/protocol-domain.js'
import { buildGoalRoundPorts } from 'src/adapters/goal-round-ports.js'
import { createGoalRoundDriver, type GoalRoundDriver } from 'pm-goal-round-driver/driver.js'

/** 台账假件（`tasks` 只为形状完整；任务队列走 `tasksOf` 端口，不经台账）。 */
export interface GoalHarnessLedger {
  schemaVersion: number
  revision: number
  requirements: RequirementRecord[]
  tasks: unknown[]
  triages: unknown[]
}

/** 任务卡（只需驱动拍读的那几个字段）。goal **不挂卡**（D-1）：它读需求台账整条记录。 */
export interface GoalHarnessTask {
  id: string
  requirementId: string
  status: string
  acceptance?: string
}

/** 可驱动需求的种子（armed + autoRun + implementing = "在跑链"口径）。 */
export function makeReq(id: string, window: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id, title: '需求 ' + id, description: '', status: 'implementing', blocked: false,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: window,
    autoRun: true,
    dive: { activation: 'armed', phase: 'active', roundsInStage: 0 },
    // 当前 goal 挂**需求**（一条需求一个）：有它 ⇒ 驱动拍走 `drive` 分支。
    goal: { id: 'goal:' + id, objective: 'a', phase: 'active', revision: 1 },
    goalSeq: 1,
    ...over,
  } as unknown as RequirementRecord
}

export interface GoalHarness {
  driver: GoalRoundDriver
  ledger: GoalHarnessLedger
  /** 成功投出的回合（窗口 + 需求 + 正文）。 */
  delivered: Array<{ windowKey: string; requirementId: string; text: string }>
  /** 驱动留痕（`hold:` / `wait-human:` / `block-goal:` …）。 */
  traces: string[]
  infos: string[]
  warns: string[]
  /** goal 落盘 block（故障语义的耐久半边）；goal 挂需求，故只按需求留痕。 */
  blocked: Array<{ requirementId: string; code: string; message: string }>
  diveOf: (id: string) => RequirementDive | undefined
  /** 一拍空闲（新驱动入口：窗口键，不起轮则零副作用）。 */
  idle: (windowKey: string) => Promise<void>
  tick: (ms: number) => void
  deliveredFor: (requirementId: string) => number
}

export function goalHarness(opts: {
  reqs?: RequirementRecord[]
  /** 任务队列（缺省 = 一张 running 卡带 active goal ⇒ 驱动拍走 `drive` 分支）。 */
  tasksOf?: (requirementId: string) => GoalHarnessTask[]
  /** 起链预算判据（FR-11）：传了才装配端口（缺省 = 闸不启用）。 */
  chainBudget?: (requirementId: string) => { allowed: boolean; reason?: string }
  /** 人工门判据（FR-5）：传了才装配端口。 */
  humanGate?: (requirementId: string) => { open: boolean; reason?: string }
  /** 额外挂着的窗口（无绑定需求，供"非 owner 窗口 idle"用例）。 */
  windows?: string[]
} = {}): GoalHarness {
  const requirements = opts.reqs ?? [makeReq('REQ-a', 'agent-1')]
  const ledger: GoalHarnessLedger = { ...emptyLedger(), requirements, tasks: [], triages: [] }
  const delivered: GoalHarness['delivered'] = []
  const traces: string[] = []
  const infos: string[] = []
  const warns: string[] = []
  const blocked: GoalHarness['blocked'] = []
  let clock = 1_000_000
  let seq = 0
  const windows = new Set<string>([
    ...requirements.map((r) => r.sourceSessionId as string),
    ...(opts.windows ?? []),
  ])

  const tasksOf = opts.tasksOf ?? ((requirementId: string): GoalHarnessTask[] => [{
    id: 't-1', requirementId, status: 'running', acceptance: 'a',
  }])

  const ports = buildGoalRoundPorts({
    peekFacts: () => ledger.requirements.map(factsOf),
    getRequirement: async (id) => ledger.requirements.find((r) => r.id === id),
    tasksOf: async (id) => tasksOf(id),
    delivery: {
      createRoundMessage: (input) => {
        seq += 1
        return {
          message: {
            id: 'm' + String(seq), role: 'user',
            content: [{ type: 'text', text: input.text }],
            source: { kind: 'dive', requirementId: input.requirementId, revision: input.revision, round: input.round },
          },
          messageId: 'm' + String(seq),
        }
      },
      deliverMessage: (windowKey, message) => {
        const m = message as { source: { requirementId: string }; content: Array<{ text: string }> }
        delivered.push({ windowKey, requirementId: m.source.requirementId, text: m.content[0]!.text })
        return { delivered: true }
      },
      checkpoint: async () => { /* fake：本夹具不验耐久检查点 */ },
      persistAdmission: () => { /* fake：准入计数不落台账（归 pm-goal / 台账用例） */ },
      contentOf: (m) => (m as { content?: unknown } | undefined)?.content,
      now: () => clock,
    },
    checkpoint: async () => { /* fake */ },
    persistAdmission: () => { /* fake */ },
    createGoal: () => true,
    blockGoal: (requirementId, reason) => {
      blocked.push({ requirementId, code: reason.code, message: reason.message })
      return true
    },
    askStageDone: () => { /* fake：弹框由 gate-prompt / stage-prompt 用例覆盖 */ },
    trace: (reason, id) => { traces.push(reason + (id === undefined ? '' : ' req=' + id)) },
    ...(opts.chainBudget === undefined ? {} : { chainBudget: opts.chainBudget }),
    ...(opts.humanGate === undefined ? {} : { humanGate: opts.humanGate }),
    fiberActive: () => true,
    agentLive: (windowKey) => windows.has(windowKey),
    now: () => clock,
    logger: { info: (m) => infos.push(m), debug: () => { /* 噪声 */ }, warn: (m) => warns.push(m) },
  })

  const driver = createGoalRoundDriver(ports)

  return {
    driver,
    ledger, delivered, traces, infos, warns, blocked,
    diveOf: (id) => ledger.requirements.find((r) => r.id === id)?.dive,
    idle: async (windowKey) => {
      await driver.onIdle(windowKey)
      await driver.whenQuiet()
    },
    tick: (ms) => { clock += ms },
    deliveredFor: (requirementId) => delivered.filter((d) => d.requirementId === requirementId).length,
  }
}
