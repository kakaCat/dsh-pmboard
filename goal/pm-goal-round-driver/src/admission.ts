/**
 * 投递纪律：**预留 → 投递 → 准入**（从 `pm-round-driver` 原样迁入，语义不变）。
 *
 * 【为什么要这么绕】投递是"发出去就收不回"的动作，而 agent 侧可能因为竞态、伪造、旧 revision
 * 让这一轮**根本没跑**。所以把"发"与"算"拆开：
 *   queued（已发出）→ claimed（inbox 认领）→ admitted（回合结束，计数生效）
 * 只有 admitted 才算这一回合；cancelled / stale **永不计数**。
 *
 * 【不重发明】栅栏判据全部复用 pm-core 的纯函数（`roundReservationValid` / `sameQueued` /
 * `deepEqualJson`）——本仓铁律：同一判定不许有两份实现（两份必然漂移）。
 *
 * @module dsh-pmboard/goal-round/admission
 */
import {
  isDiveRoundSource, type DiveRoundSource,
} from 'pm-core/protocol-domain.js'
import { sameQueued, type RoundAttempt, type RoundPhase } from 'pm-core/application/dive-core/round-state.js'

/** 预留（= pm-core `RoundAttempt` 的形状；本包不另立一套字段）。 */
export type Reservation = RoundAttempt

/** 投递态（每 agent 一份，**内存态**：不落盘，落盘就退化成第二个台账）。 */
export interface DeliveryState {
  attempt?: Reservation
  /** 有非本回合的入队输入 → 让位到下次空闲。 */
  competingQueued: boolean
  /** 有耐久义务待兑现（排队前必须落盘）。 */
  needsCheckpoint: boolean
  /** teardown 已关闭准入。 */
  stopping: boolean
}

/** 投递所需的 I/O（全部注入；迁移期内接到既有实现上）。 */
export interface DeliveryPorts {
  createRoundMessage(input: { requirementId: string; revision: number; round: number; text: string }): { message: unknown; messageId: string }
  deliverMessage(windowKey: string, message: unknown): { delivered: boolean; reason?: string }
  /** 耐久检查点：兑现台账写队列排空。 */
  checkpoint(): Promise<void>
  /** 准入计数落库（`>=` 守卫在实现侧：重放零写入）。 */
  persistAdmission(requirementId: string, round: number): void
  contentOf(message: unknown): unknown
  now(): number
}

/** 一次投递的输入（判据都由调用方先在决策层算好）。 */
export interface DeliverInput {
  readonly windowKey: string
  readonly requirementId: string
  /** 预留时读到的需求 revision（CAS 令牌）。 */
  readonly revision: number
  /** 台账当前 `dive.roundsInStage`（回合号的唯一权威计数来源）。 */
  readonly roundsInStage: number
  /** 本轮正文（由 `renderRoundPrompt` 渲染）。 */
  readonly text: string
}

export type DeliverOutcome =
  | { readonly kind: 'delivered'; readonly reservation: Reservation }
  | { readonly kind: 'checkpoint-failed' }
  | { readonly kind: 'deliver-failed'; readonly reason?: string }

/**
 * 造预留（**纯**）：回合号 = `roundsInStage + 1`；只允许一个在飞预留。
 * @returns 新预留，或 undefined（已有在飞预留 / 已停止准入）
 */
export function reserve(state: DeliveryState, input: {
  requirementId: string; revision: number; roundsInStage: number; messageId: string; content: unknown
}): Reservation | undefined {
  if (state.stopping || state.attempt !== undefined) return undefined
  return {
    requirementId: input.requirementId,
    revision: input.revision,
    round: input.roundsInStage + 1,
    messageId: input.messageId,
    content: input.content,
    phase: 'queued',
    cancelled: false,
    stale: false,
  }
}

/**
 * 认领（inbox 事件）：只认**逐字相同**的 queued 预留（`sameQueued`：来源 + 回合号 + 内容三重比对）。
 * 伪造/旧消息/内容被改过的消息一律不认领——这正是"内容不变量"防的假回合。
 */
export function claim(state: DeliveryState, message: unknown): boolean {
  const a = state.attempt
  if (a === undefined || a.phase !== 'queued') return false
  const source = (message as { source?: unknown } | undefined)?.source
  const content = (message as { content?: unknown } | undefined)?.content
  if (!isDiveRoundSource(source)) return false
  if (!sameQueued(content, source, a)) return false
  a.phase = 'claimed'
  return true
}

/** 认领被丢弃（inbox discard）→ 预留作废（**永不计数**）。 */
export function discard(state: DeliveryState): void {
  if (state.attempt === undefined) return
  state.attempt.cancelled = true
  state.attempt = undefined
}

/** revision 变了（需求被别处改过）→ 预留作废（CAS 失败，**永不计数**）。 */
export function markStale(state: DeliveryState, currentRevision: number): boolean {
  const a = state.attempt
  if (a === undefined || a.revision === currentRevision) return false
  a.stale = true
  return true
}

/**
 * 准入：回合正常收尾 → `admitted` 并落计数。
 * 纪律：**只有 admitted 才算这一回合**；写盘失败只告警（不阻断下一次投递）。
 */
export function admit(state: DeliveryState, ports: Pick<DeliveryPorts, 'persistAdmission'>): boolean {
  const a = state.attempt
  if (a === undefined || a.phase !== 'claimed' || a.cancelled || a.stale) return false
  a.phase = 'admitted'
  ports.persistAdmission(a.requirementId, a.round)
  state.attempt = undefined
  return true
}

/** 回合被取消/中止 → 释放预留（不回计数）。 */
export function release(state: DeliveryState): Reservation | undefined {
  const a = state.attempt
  state.attempt = undefined
  return a
}

/**
 * 投递序列（**唯一入口**）：检查点前置 → 造预留 → 发消息。
 *
 * 顺序不可换（旧驱动 871 行里踩出来的）：
 *   ① `needsCheckpoint` 先兑现（耐久义务）——排队前必须落盘；
 *   ② 再复核"仍在飞"（检查点期间可能已被 teardown/取消）；
 *   ③ 造预留 → 发消息：发失败**清预留**并把原因上抛（调用方据此停手）。
 */
export async function deliverRound(
  ports: DeliveryPorts, state: DeliveryState, input: DeliverInput,
): Promise<DeliverOutcome> {
  if (state.needsCheckpoint) {
    state.needsCheckpoint = false
    try {
      await ports.checkpoint()
    } catch {
      return { kind: 'checkpoint-failed' }
    }
  }
  if (state.stopping || state.attempt !== undefined) {
    // 让位：本次不投，标记需要下一次空闲再试。
    state.needsCheckpoint = true
    return { kind: 'deliver-failed', reason: 'supplanted' }
  }
  const built = ports.createRoundMessage({
    requirementId: input.requirementId, revision: input.revision, round: input.roundsInStage + 1, text: input.text,
  })
  const reservation = reserve(state, {
    requirementId: input.requirementId, revision: input.revision,
    roundsInStage: input.roundsInStage, messageId: built.messageId, content: ports.contentOf(built.message),
  })
  if (reservation === undefined) return { kind: 'deliver-failed', reason: 'reserve-refused' }
  state.attempt = reservation
  const res = ports.deliverMessage(input.windowKey, built.message)
  if (res.delivered) return { kind: 'delivered', reservation }
  state.attempt = undefined
  return { kind: 'deliver-failed', ...(res.reason === undefined ? {} : { reason: res.reason }) }
}

/** 类型再导出（调用方按本包取，不必再 import pm-core 的深层路径）。 */
export type { RoundAttempt, RoundPhase, DiveRoundSource }
