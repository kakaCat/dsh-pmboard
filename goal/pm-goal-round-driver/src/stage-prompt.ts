/**
 * **阶段裁决弹框**（FR-8；纪律迁自 `pm-round-driver/src/gate-prompt.ts` 的人工门弹框）。
 *
 * 【它解决什么】里程碑提醒说"立即调 ask_confirm"，而铁律说"弹框超时/中断不自动重弹"——
 * 两条规则互撞的后果是**没有任何一方保证人会看到框**（实测：提醒 3 次，人一次都没看到）。
 * 所以兜底从"提醒 agent"改成"**驱动侧保证弹框**"，且有边界地重弹。
 *
 * 【三条纪律（逐条对应旧实现）】
 *   ① **只请人点头**：肯定项仍由 `actor=human` 落章（`markStageGoalDone` 是真人专属）——
 *      弹框绝不代替人推进；
 *   ② **有边界**：同 (需求, 阶段, 判据指纹) 在一次等待内只弹一次；跨回合冷却 ≥5min、
 *      上限 2 次；到顶写留痕并停手（响亮，不静默）；
 *   ③ **不抛**：弹框通道不可用/抛错 → 降级留痕（保留可观测），绝不因弹框把驱动带崩。
 *
 * 【FR-8 的触发源】阶段判据全满足（`stageReadyToClose`）时由驱动拍触发本模块
 * （`askStageDone` 端口）；收口（全阶段达成）走同一通道，问题文案不同。
 *
 * @module dsh-pmboard/goal-round/stage-prompt
 */

/** 与旧实现同值（改这里即改全部调用点）。 */
export const STAGE_PROMPT_COOLDOWN_MS = 5 * 60 * 1000
export const STAGE_PROMPT_MAX_POPS = 2

/** 一次弹框判据要读的事实。 */
export interface StagePromptFacts {
  readonly requirementId: string
  /** 当前阶段键（问题文案与幂等键都用它）。 */
  readonly stage: string
  /** 本阶段判据是否已满足（FR-8 的触发条件）。 */
  readonly stageReadyToClose: boolean
  /**
   * 判据指纹（判据内容 + 证据的短摘要）：
   * 指纹变了 = **新的一次请人裁决**（重新计冷却与次数）；指纹没变 = 同一件事，按边界重弹。
   */
  readonly fingerprint: string
  /** 是否已有人在等（弹框在途）→ 不重复弹。 */
  readonly awaitingHuman?: boolean
}

/** 该 (需求, 阶段) 的弹框账（调用方持有并回填，进程内存态）。 */
export interface StagePromptHistory {
  readonly pops: number
  readonly lastAskedAt?: number
  readonly lastFingerprint?: string
}

export interface StagePromptPlanOptions {
  readonly now: number
  readonly history: StagePromptHistory
  readonly cooldownMs?: number
  readonly maxPops?: number
}

export type StagePromptPlan =
  | { readonly kind: 'ask'; readonly question: string }
  | { readonly kind: 'skip'; readonly reason: 'not-ready' | 'already-awaiting' | 'cooldown' | 'exhausted' | 'same-fingerprint' }

/** 问题文案（问题里把"只请人点头"和边界说清，避免 agent 拿它当"可以自己落章"的许可）。 */
export function stageDoneQuestion(f: StagePromptFacts): string {
  return '本阶段（' + f.stage + '）的达成判据都满足了。请裁决：**本阶段算完成吗**？'
    + '（选"完成"即落章并进入下一阶段；选"未完成"请写明还差什么——'
    + 'agent 不会自行落章，这一票只有人能投。）'
}

/**
 * 是否该弹（纯函数）。
 *
 * 顺序即纪律：**没到条件不弹** → **有人在等不弹** → **指纹没变则按边界（冷却/上限）**。
 * 指纹变了 = 新的一次裁决：冷却与次数**重新计**（否则"改完判据再问一次"会被旧账挡住）。
 */
export function planStagePrompt(f: StagePromptFacts, opts: StagePromptPlanOptions): StagePromptPlan {
  if (!f.stageReadyToClose) return { kind: 'skip', reason: 'not-ready' }
  if (f.awaitingHuman === true) return { kind: 'skip', reason: 'already-awaiting' }
  const cooldown = opts.cooldownMs ?? STAGE_PROMPT_COOLDOWN_MS
  const maxPops = opts.maxPops ?? STAGE_PROMPT_MAX_POPS
  const sameFingerprint = opts.history.lastFingerprint === f.fingerprint
  if (sameFingerprint) {
    if (opts.history.pops >= maxPops) return { kind: 'skip', reason: 'exhausted' }
    if (opts.history.lastAskedAt !== undefined && opts.now - opts.history.lastAskedAt < cooldown) {
      return { kind: 'skip', reason: 'cooldown' }
    }
  }
  return { kind: 'ask', question: stageDoneQuestion(f) }
}

/** 弹框副作用端口（全部注入）。 */
export interface StagePromptPorts {
  /** 投出弹框；返回是否送达（不可用/抛错由实现侧归一为 false）。 */
  ask(facts: StagePromptFacts, question: string): Promise<boolean>
  /** 登记"有人在等"（同步，拦住同拍起轮）。 */
  enterAwaiting(requirementId: string): void
  /** 到顶停手：留痕（台账 comment / 诊断面）。 */
  recordExhausted(facts: StagePromptFacts, pops: number): void
  /** 有界留痕（诊断面）。 */
  trace(reason: string, requirementId?: string): void
  now(): number
  logger: { info(m: string): void; debug(m: string): void; warn(m: string, err?: unknown): void }
}

/** 弹框的账（每 (需求, 阶段) 一条；调用方持有 → 进程内存态，不落盘）。 */
export type StagePromptHistoryMap = Map<string, StagePromptHistory>

export interface StagePromptResult {
  readonly kind: 'asked' | 'skipped' | 'exhausted'
  readonly reason?: string
}

/**
 * 请人裁决（一拍至多一次；**永不抛**——弹框不可用只降级留痕）。
 */
export async function proposeStageDone(
  ports: StagePromptPorts,
  histories: StagePromptHistoryMap,
  f: StagePromptFacts,
  over: { cooldownMs?: number; maxPops?: number } = {},
): Promise<StagePromptResult> {
  const key = f.requirementId + '\u0000' + f.stage
  const history = histories.get(key) ?? { pops: 0 }
  const plan = planStagePrompt(f, {
    now: ports.now(), history,
    ...(over.cooldownMs === undefined ? {} : { cooldownMs: over.cooldownMs }),
    ...(over.maxPops === undefined ? {} : { maxPops: over.maxPops }),
  })
  if (plan.kind === 'skip') {
    if (plan.reason === 'exhausted') {
      ports.recordExhausted(f, history.pops)
      return { kind: 'exhausted', reason: plan.reason }
    }
    return { kind: 'skipped', reason: plan.reason }
  }
  // 先登记"有人在等"（同步拦同拍起轮），再投框——顺序不能反。
  ports.enterAwaiting(f.requirementId)
  let delivered = false
  try {
    delivered = await ports.ask(f, plan.question)
  } catch (err) {
    ports.logger.warn('stage-prompt: 弹框抛错 → 降级留痕（不阻断）', err)
    delivered = false
  }
  const next: StagePromptHistory = {
    pops: (history.lastFingerprint === f.fingerprint ? history.pops : 0) + (delivered ? 1 : 0),
    lastAskedAt: ports.now(),
    lastFingerprint: f.fingerprint,
  }
  histories.set(key, next)
  if (!delivered) {
    ports.trace('stage-prompt-undeliverable', f.requirementId)
    return { kind: 'skipped', reason: 'undeliverable' }
  }
  ports.logger.info('stage-prompt: 已请人裁决「' + f.stage + ' 算完成吗」（第 ' + next.pops + ' 次）')
  return { kind: 'asked' }
}
