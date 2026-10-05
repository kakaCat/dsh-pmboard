/**
 * Dive 状态转化纯函数（REQ-261003215944-9e04 FR-9 · t8）——**唯一一份**状态规则。
 *
 * 【为什么要有它】
 * 在这之前，「改 `dive.*`」这件事散在**八处**，各写一份，规则靠注释口口相传：
 *   support.ts（立项）· ClearPause.ts（人主动解锁）· rearm.ts 里两份手抄（自动恢复 / 人显式继续）·
 *   token-usage.ts（阶段推进）· round-driver.ts（准入计数与停手）· rollback.ts（回退解除自动链）·
 *   migrate-dive-state.ts（一次性迁移，唯一豁免）。
 * 本模块把「事件 → 该写什么」收成一张表，并且**零 I/O、零 import 外层**（遵守 C-01 层边界，
 * 由 tests/layer-boundary.test.ts 机械检查）——所以它可以被独立单测穷举。
 *
 * 【三条不变量（写错即破坏本需求的核心）】
 *   ① 能把 `activation` 从 disarmed 改回 armed 的只有两处，且都有明确归属：
 *      · `arm-explicit`——人按下「继续」（改「人的意图」只有人能发起）；
 *      · `recover-auto` 的**误停摆**窄形态——`activation=disarmed` **且** `phase='active'`
 *        （历史故障把它错误地解除了武装，不是人关的），这是既有特性 REQ-261001201200-8f8b FR-4。
 *        **人主动关掉的形态是 `disarmed + phase='idle'`，永不被自动路径改写**（有单测钉死）。
 *   ② `pause-runtime` / `recover-auto` / `confirm-advance` **一律不得**改写 `activation`——
 *      运行时故障只写健康位，否则一次抖动就等于该需求永久失去自动化（这正是本仓修过的老病）；
 *   ③ 事件在当前状态下不成立 → `changed:false`，调用方**必须零写入**。
 *
 * @module dsh-pmboard/domain/dive/transition
 */
import type { RequirementDive, RequirementDriverHealth } from '../../shared/protocol.js'
// 终态判据的唯一来源（domain → domain，同层）：`disarm-terminal` 只对终态需求生效。
import { isOpenRequirement } from '../status/Predicates.js'

/** 九个事件（与 design/data-model.md 的「事件 → 写入」表逐行对应）。 */
export type DiveEvent =
  /** 立项：创建/重置为「自动 + 健康」 */
  | 'arm'
  /** 人主动 reqboard_clear_pause：解除自动、回到手动（人的意图，agent 只是代传） */
  | 'disarm-manual'
  /** 需求回退：解除自动链（回退不变量 ④）；**归因如实记 actor** */
  | 'disarm-rollback'
  /**
   * 终态归一（REQ-261004065652-5c1c FR-9）：需求已是终态（done/archived/canceled）却还挂着 armed
   * → 收手。**只在终态命中**；非终态零写入（防"顺手把在跑的需求关掉"）。
   */
  | 'disarm-terminal'
  /** 运行时故障/达上限：**只写健康位**，绝不改人的意图 */
  | 'pause-runtime'
  /** 自动恢复（心跳/移动后置）：只碰「误停摆」与「运行时暂停」 */
  | 'recover-auto'
  /** 人显式「继续」（看板）：唯一能改回 armed 的事件 */
  | 'arm-explicit'
  /** 阶段推进：回合计数是本阶段语义，阶段变了就归零 */
  | 'advance-stage'
  /** 推进弹框落章推进之后（FR-10）：复位运行时暂停；**绝不代人选继续** */
  | 'confirm-advance'

/** 留痕作者（进 comment.createdBy；人机可辨是审查要求）。 */
export type DiveActorKind = 'human' | 'agent' | 'system'

export interface DiveTransitionInput {
  event: DiveEvent
  /** 时间源由调用方注入——域层不许自己读系统时钟（层边界检查会拦）。 */
  now: number
  actor: { kind: DiveActorKind; sessionId?: string }
  /** `pause-runtime` 的结构化原因前缀（如 `deliver-failed` / `round-limit:implementing`）。 */
  reason?: string
  /** 需求当前阶段——`round-limit` 的留痕要写它。 */
  status?: string
  /** 本阶段回合上限——留痕要写它；缺省则不留数字（**不编造**）。 */
  roundLimit?: number
  /** 恢复/继续的触发来源（进留痕，便于事后判断是谁把它叫醒的）。 */
  trigger?: string
  /** `confirm-advance` 专用：本次推进是否跨了阶段（跨了就按 advance-stage 归零）。 */
  stageChanged?: boolean
}

export interface DiveTransitionResult {
  /** false = 该事件在当前状态下不成立（调用方必须零写入）。 */
  changed: boolean
  /**
   * 变更后的 dive。`changed:false` 时与入参**同值**（入参本身为 undefined 时也是 undefined）
   * ——调用方的正确姿势是 `if (r.changed) write(r.next)`，永远不要拿 changed:false 的 next 去写盘。
   */
  next: RequirementDive | undefined
  /** 需要追加的留痕（由 application 层写进 comments；纯函数只产出内容）。 */
  comment?: { body: string; createdBy: { kind: DiveActorKind; sessionId?: string } }
}

/**
 * 结构相等（只比 dive 自己的已知字段）。
 *
 * 为什么不用 JSON.stringify 比：`{ a: undefined }` 与 `{}` 在 JSON 下同形，
 * 但那两种形状在台账里的含义不同（显式清除 vs 从未出现），用它会漏判。
 */
export function diveEquals(a: RequirementDive | undefined, b: RequirementDive | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.phase === b.phase
    && a.activation === b.activation
    && a.roundsInStage === b.roundsInStage
    && a.lastWakeAt === b.lastWakeAt
    && a.migratedAt === b.migratedAt
    && a.maxRoundsPerStage === b.maxRoundsPerStage
    && a.currentStage === b.currentStage
    && a.pausedReason === b.pausedReason
    && a.lastActiveAt === b.lastActiveAt
    && healthEquals(a.driverHealth, b.driverHealth)
}

function healthEquals(a: RequirementDriverHealth | undefined, b: RequirementDriverHealth | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.state === b.state && a.reason === b.reason && a.since === b.since && a.attempts === b.attempts
}

/** 停机原因是否「达回合上限」（既有判据口径：前缀匹配）。 */
function isRoundLimit(reason: string | undefined): boolean {
  return reason !== undefined && reason.startsWith('round-limit')
}

/**
 * 计算一次状态转化。
 *
 * `prev === undefined`（该需求本来没有 dive）时的口径，与既有八处写入点**逐字对齐**：
 *   · `arm` → 新建 `{armed, active, roundsInStage:0, lastActiveAt:now}`（照 support.ts 的立项）；
 *   · `disarm-manual` → 新建 `{disarmed, idle, roundsInStage:0}`（照 ClearPause.ts 的缺失分支）；
 *   · 其余事件 → `changed:false`（**不凭空造一个 dive**：缺失不等于 disarmed）。
 */
export function transitionDive(
  prev: RequirementDive | undefined,
  input: DiveTransitionInput,
): DiveTransitionResult {
  const noop = (value: RequirementDive | undefined): DiveTransitionResult => ({ changed: false, next: value })

  // 事件不成立 → 零写入（判据全部写在纯函数里，调用方不再各判一套）。
  switch (input.event) {
    case 'arm': {
      const next: RequirementDive = {
        // 默认对象键序与既有写入点一致（activation→phase→roundsInStage）：落盘 JSON 逐字节不变
        ...(prev ?? { activation: 'armed' as const, phase: 'active' as const, roundsInStage: 0 }),
        activation: 'armed',
        phase: 'active',
        roundsInStage: 0,
        lastActiveAt: input.now,
      }
      return finish(prev, next, input, undefined)
    }
    case 'disarm-manual': {
      // 同上：缺省对象键序照 ClearPause 既有写法（activation→phase→roundsInStage）
      const base: RequirementDive = prev ?? { activation: 'disarmed' as const, phase: 'idle' as const, roundsInStage: 0 }
      const next: RequirementDive = { ...base, activation: 'disarmed', phase: 'idle', pausedReason: undefined }
      return finish(prev, next, input, `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：${prev?.activation ?? 'none'}`)
    }
    case 'disarm-rollback': {
      if (prev === undefined) return noop(prev)
      // 回退**不改 phase**、不动计数器——只解除自动链并清掉上一轮的暂停语。
      // 注意"清掉"的字面形态：既有实现用的是 `delete pausedReason`（键**不存在**），
      // 不是置 undefined（键存在）。两者 JSON 同形，但内存形状不同（`'pausedReason' in dive`），
      // 故这里刻意解构掉该键——与本卡"行为逐字一致"的判据对齐。
      const { pausedReason: _dropped, ...rest } = prev
      const next: RequirementDive = { ...rest, activation: 'disarmed' }
      return finish(prev, next, input, undefined)
    }
    case 'disarm-terminal': {
      // 判据三条齐备才写：① 有 dive；② 现在是 armed；③ status 是终态（缺 status 不猜、零写入）。
      if (prev === undefined) return noop(prev)
      if (prev.activation !== 'armed') return noop(prev)
      if (input.status === undefined || isOpenRequirement({ status: input.status })) return noop(prev)
      const next: RequirementDive = { ...prev, activation: 'disarmed' }
      return finish(prev, next, input,
        `[Dive 终态归一] 需求已是终态（${input.status}）：自动意图收手（activation: armed → disarmed）。`
        + '迁移留痕，可复核可回滚（scripts/rollback-terminal-reconcile.ts）。')
    }
    case 'pause-runtime': {
      if (prev === undefined) return noop(prev)
      // 只对 armed 的需求写健康位：手动模式的需求本来就没在自动跑（照 round-driver 的既有守卫）。
      if (prev.activation !== 'armed') return noop(prev)
      const reason = input.reason ?? 'driver-failed'
      // 幂等：同一原因已经暂停过 → 不重复计数、不重复留痕。
      if (prev.driverHealth?.state === 'paused' && prev.driverHealth.reason === reason) return noop(prev)
      const roundLimit = isRoundLimit(reason)
      const next: RequirementDive = {
        ...prev,
        // 达上限不计 attempts（既有口径：terminalBlock 不 +1）；普通运行时故障 +1。
        driverHealth: {
          state: 'paused',
          reason,
          since: input.now,
          attempts: roundLimit ? (prev.driverHealth?.attempts ?? 0) : (prev.driverHealth?.attempts ?? 0) + 1,
        },
        lastActiveAt: input.now,
      }
      return finish(prev, next, input, pauseComment(input, reason, roundLimit, prev))
    }
    case 'recover-auto': {
      if (prev === undefined) return noop(prev)
      const byHealth = prev.driverHealth?.state === 'paused'
      const byLegacy = prev.activation === 'disarmed' && prev.phase === 'active'
      // 人主动 clear_pause（disarmed+idle）**永不被自动路径改写**——这是最要紧的一条。
      if (!byHealth && !byLegacy) return noop(prev)
      return finish(prev, recoverWrites(prev, input, { flipLegacyActivation: true }), input,
        `[Dive 自动恢复] ${byHealth ? '检测到运行时暂停（driverHealth=paused）' : '检测到误停摆（activation=disarmed, phase=active）'}，已恢复（触发：${input.trigger ?? 'unknown'}）`)
    }
    case 'arm-explicit': {
      if (prev === undefined) return noop(prev)
      const byHealth = prev.driverHealth?.state === 'paused'
      const byLegacy = prev.activation === 'disarmed' && prev.phase === 'active'
      const byManual = prev.activation === 'disarmed' && prev.phase !== 'active'
      if (!byHealth && !byLegacy && !byManual) return noop(prev) // 已 armed 且健康 → 零写入
      const body = `[Dive 重新武装] 人显式要继续（trigger=${input.trigger ?? 'unknown'}）：activation ${prev.activation ?? 'none'} → armed；phase ${prev.phase ?? 'none'} → active`
      const next = recoverWrites({ ...prev, phase: 'active' }, input, { flipLegacyActivation: true })
      next.activation = 'armed'
      next.phase = 'active'
      next.pausedReason = undefined
      return finish(prev, next, input, body)
    }
    case 'advance-stage': {
      if (prev === undefined) return noop(prev)
      const next = advanceWrites(prev)
      return finish(prev, next, input, undefined)
    }
    case 'confirm-advance': {
      if (prev === undefined) return noop(prev)
      // 两件事各自成立才写：① 跨阶段 → 归零；② 运行时暂停 → 复位健康。
      // **绝不**碰 activation：确认推进是"确认这道门的产物"，不是"我同意自动跑"。
      let next: RequirementDive = input.stageChanged === true ? advanceWrites(prev) : { ...prev }
      if (next.driverHealth?.state === 'paused') {
        next = {
          ...recoverWrites(next, input, { flipLegacyActivation: false }),
          // recoverWrites 会拉回 phase/清 pausedReason——那是「人显式继续」的语义，本事件不许碰它们。
          phase: next.phase,
          pausedReason: next.pausedReason,
        }
      }
      return finish(prev, next, input, undefined)
    }
    default: {
      // 未知事件字符串（运行时兜底）：零写入，不猜。
      return noop(prev)
    }
  }
}

/** 阶段推进的写入（照 token-usage.ts:293-300）。 */
function advanceWrites(prev: RequirementDive): RequirementDive {
  const next: RequirementDive = { ...prev, roundsInStage: 0 }
  if (prev.driverHealth !== undefined) next.driverHealth = { ...prev.driverHealth, attempts: 0 }
  return next
}

/**
 * 恢复类写入（照 rearm.ts 的两份实现）：
 *   · `round-limit` 暂停 → **把额度还回去**（否则人点了继续，下一拍又立刻撞上限）；
 *   · 运行时暂停 → 复位 healthy；
 *   · `flipLegacyActivation` 才把「误停摆」的 disarmed 拉回 armed（自动恢复要，确认推进不要）。
 */
function recoverWrites(
  prev: RequirementDive,
  input: DiveTransitionInput,
  opts: { flipLegacyActivation: boolean },
): RequirementDive {
  const byHealth = prev.driverHealth?.state === 'paused'
  const byLegacy = prev.activation === 'disarmed' && prev.phase === 'active'
  const next: RequirementDive = { ...prev }
  if (byLegacy && opts.flipLegacyActivation) next.activation = 'armed'
  // 注意读 prev 的 reason 再覆盖（踩过：先写 healthy 再读 reason 恒为 undefined）。
  if (isRoundLimit(prev.driverHealth?.reason)) next.roundsInStage = 0
  if (byHealth) next.driverHealth = { state: 'healthy', since: input.now, attempts: 0 }
  next.lastActiveAt = input.now
  return next
}

/** 停机留痕文案（与既有两处**逐字一致**；达上限那条要写出阶段与上限）。 */
function pauseComment(
  input: DiveTransitionInput,
  reason: string,
  roundLimit: boolean,
  prev: RequirementDive,
): string {
  if (!roundLimit) {
    return `[Dive] 已暂停自动续跑（运行时原因：${reason}）——人的意图保持「自动」，人确认推进或看板点「继续」即恢复。`
  }
  const stage = input.status ?? prev.currentStage ?? 'unknown'
  const limit = input.roundLimit === undefined ? '上限' : String(input.roundLimit)
  return '[Dive 回合上限] 阶段 ' + stage + ' 达上限 ' + limit + ' 回合（roundsInStage=' + (prev.roundsInStage ?? 0) + '）→ 已停下等人（运行时健康 paused，人的意图不变）。人确认推进 / 看板「继续」即恢复，无需 clear_pause。'
}

/** 收口：算出 changed（结构比较）、只在真变时带留痕、并保证 `changed:false` 时 next 与入参同值。 */
function finish(
  prev: RequirementDive | undefined,
  next: RequirementDive,
  input: DiveTransitionInput,
  body: string | undefined,
): DiveTransitionResult {
  if (diveEquals(prev, next)) return { changed: false, next: prev }
  return {
    changed: true,
    next,
    ...(body === undefined
      ? {}
      : { comment: { body, createdBy: { kind: input.actor.kind, ...(input.actor.sessionId !== undefined ? { sessionId: input.actor.sessionId } : {}) } } }),
  }
}
