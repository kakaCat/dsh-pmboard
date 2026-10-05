/**
 * Dive 回合驱动器（REQ-260926215013-1568 T-2 · serves: FR-1 … FR-11）。
 * 照 dsh-goal-round-driver 自实现：一 agent 一状态机；五条纪律 + reservation→admission + 上限终态；零框架依赖。
 * @module dsh-pmboard/application/dive/round-driver
 */
import { mutateIfPresent } from '../use-cases/queue-access.js'
// FR-9：dive 状态规则单一来源（纯函数）
import { transitionDive } from '../../domain/dive/transition.js'
import type { RequirementStore, DiveRoundDeliveryPort } from '../ports.js'
import type { RequirementFacts } from '../../domain/requirement/RequirementSummary.js'
import { isDiveRoundSource } from '../../shared/protocol.js'
import { isRecoverableDisarm } from './round-state.js'
import { rearmIfRecoverable } from '../internal/rearm.js'
import { turnEndOutcome } from '../internal/interruption.js'
// FR-1/FR-2（REQ-261004065652-5c1c t3）：上游失败的**唯一分类点** + 病因类别归一。
import { classifyTurnEnd, truncateReason, type TurnEndClassification } from '../internal/upstream-failure.js'
// FR-1：进程级"上游不可用"闩（多窗口共享额度，只停自己没意义）。
import type { ProviderLatch } from '../internal/provider-latch.js'
import { isOpenRequirement } from '../../domain/status/Predicates.js'
import {
  isDrivableRequirement, roundLimitFor, roundReservationValid, sameQueued, sameRound,
  recordFailure, breakerTripped,
  agentIdOf, agentStatusOf, inboxOf, messageIdOf, sourceOf, contentOf,
  type DriverState, type RoundAttempt,
} from './round-state.js'

export interface DiveRoundLogger {
  info(message: string): void
  debug(message: string): void
  warn(message: string, err?: unknown): void
}

/** 外部依赖全部经端口注入（实现在组合根/adapters）。 */
export interface DiveRoundPorts {
  /**
   * **同步**窄投影（B12 阶段①-a）：idle 拍里那些"该不该驱动"的同步判定用它取数，
   * 不再借桥的整册快照。字段都是有界标量，且与桥的镜像**同源**（同一份写通知刷新）
   * ⇒ 换过去新鲜度不降级（详见 §20.1 的裁决与取证）。
   */
  peekFacts(): readonly RequirementFacts[]
  /** 需求存储新端口（t8/B11）：心跳/驱动的台账读改走它；缺省 undefined = 该读点未装配（届时响亮抛错）。 */
  /**
   * 新需求存储端口（B12 阶段②a）：**本模块的写**走它（`store.mutate(id, draft)`），必填。
   *
   * 为什么这个文件能先迁写：它的**读**早已在同一源上（`peekFacts()` 是同一 store 的同步投影，
   * 且该投影在**写入的同一份 notify 回调里**同步刷新）⇒ read-your-own-write 成立。
   * 反例见 `AdvanceChain`（读还在桥镜像 ⇒ 写先迁会断，已整批还原，见设计 §29.2）。
   */
  store: RequirementStore
  agents: { get(id: string): unknown | undefined; withoutInitiator<T>(operation: () => T): T }
  /** 驱动所在插件 fiber 是否 active（对齐 Goal 的 ctx.fiber.state === 2）。 */
  fiberActive(): boolean
  delivery: DiveRoundDeliveryPort
  cancel(agent: unknown, cause: 'parent'): void
  whenIdle(agent: unknown): Promise<void>
  /** 耐久检查点：兑现台账写队列排空（= repo.read(() => undefined)）。 */
  checkpoint(): Promise<void>
  renderRoundText(input: { requirementId: string; round: number; status: string }): string
  now(): number
  /**
   * 在途弹框判据（REQ-261002141430-a5ef FR-1）：为真 = 有人在等作答 → **不投下一回合**。
   * 注入而非 import（application/dive 不反向依赖 adapters）；缺省 = 判据恒假，行为与改动前逐字一致。
   */
  dialogInFlight?: (requirementId: string) => boolean
  /**
   * 进程级上游闩（REQ-261004065652-5c1c FR-1）：一处撞上额度/鉴权错误 → 所有窗口一起停。
   * 缺省 undefined = 不启用（行为与改动前逐字一致——这是可灰度、可回滚的落点）。
   */
  providerLatch?: ProviderLatch
  /**
   * 人工门判据（REQ-261004065652-5c1c FR-5）：`open=true` = 这一步该由人裁决、agent 现在无事可做
   * → 不起轮。与 `dialogInFlight`（弹框**在途**，内存态）语义不同、并存：前者是台账态
   * （验收单待裁决 / 产物待确认 / 计划待批准），后者是内存态（有人正站在弹框前）。
   * 缺省 undefined = 判据恒闭（行为与改动前逐字一致）。
   */
  humanGate?: (requirementId: string) => { open: boolean; reason?: string } | Promise<{ open: boolean; reason?: string }>
  /**
   * 起链预算判据（REQ-261004065652-5c1c FR-11）：`allowed=false` → 本拍不起轮。
   * 判据由组合根用 `checkChainBudget(peekFacts(), …)` 现算（同步、当拍可信，见 FR-4）。
   * 缺省 undefined = 不启用（行为与改动前逐字一致）。
   */
  chainBudget?: (candidateId: string) => { allowed: boolean; reason?: string; detail?: { name: string; current: number; limit: number } }
  logger: DiveRoundLogger
  /** 🆕 任务存储（用于实施阶段中断自动恢复检测） */
  taskStore?: { listByRequirement(requirementId: string): Promise<Array<{ status: string }>> }
}

export type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: unknown[]; startsRequestSeries?: true }

export interface DiveRoundDriver {
  onIdle(agent: unknown, captureTick: () => void): void
  onPreStep(agent: unknown, messages: unknown[], signal: { aborted: boolean }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
  onInboxInserted(agent: unknown, message: unknown): void
  onInboxClaimed(agent: unknown, message: unknown): void
  onInboxDiscarded(agent: unknown, message: unknown): void
  onAgentError(agent: unknown): void
  onAgentDisposed(agent: unknown): void
  onRequirementMoved(requirementId: string): void
  onSessionEvent(session: unknown, event: unknown): void
  /**
   * 登记一条**待投递的里程碑催办**（REQ-260927100007-b8ba FR-11）：采集半不直投，改由调用方
   * （组合根，仅在 armed+active 时）登记；下一次可驱动的 idle 拍把它当作回合消息正文投递，
   * 走的仍是 requestDrive → drive → createRoundMessage → 预留→投递→准入（不绕过任何纪律）。
   */
  queueReminder(requirementId: string, text: string): void
  requestDrive(agent: unknown): void
  teardown(): Promise<void>
  whenQuiet(): Promise<void>
}

export function createDiveRoundDriver(ports: DiveRoundPorts): DiveRoundDriver {
  const log = ports.logger
  const states = new Map<unknown, DriverState>()
  const writes = new Set<Promise<unknown>>()
  /**
   * 待投递的里程碑催办（FR-11）：requirementId → 提醒正文。
   * 采集半只登记、不投递；round 半在 armed+active 的下一次可驱动 idle 拍消费它作为回合消息正文。
   */
  const pendingReminders = new Map<string, string>()
  /** teardown 后全局关闭准入（状态表会被清空，故不能只靠 per-state stopping）。 */
  let stopped = false

  function stateFor(agent: unknown): DriverState {
    const existing = states.get(agent)
    if (existing !== undefined) return existing
    const state: DriverState = {
      agent, attempt: undefined, competingQueued: false,
      needsCheckpoint: false, requested: false, run: undefined, stopping: false,
    }
    states.set(agent, state)
    return state
  }
  function track<T>(p: Promise<T>): Promise<T> {
    writes.add(p)
    const done = (): void => { writes.delete(p) }
    p.then(done, done)
    return p
  }
  function requirementById(id: string): RequirementFacts | undefined {
    return ports.peekFacts().find(r => r.id === id)
  }
  function requirementFor(state: DriverState): RequirementFacts | undefined {
    if (state.attempt !== undefined) return requirementById(state.attempt.requirementId)
    const id = agentIdOf(state.agent)
    return id === undefined ? undefined : ports.peekFacts().find(r => r.sourceSessionId === id)
  }
  function agentLive(state: DriverState): boolean {
    const id = agentIdOf(state.agent)
    return id !== undefined && ports.agents.get(id) === state.agent
  }
  /**
   * 内存闭锁判定 + **唯一的自动解锁规则**（FR-3）。
   *
   * 解锁条件（两条同时成立）：**全局闩已关** ∧ **台账已可驱动**。
   * 后者覆盖了所有"人/链路已经动过"的形态：看板「继续」、确认推进落章后的复位、
   * 心跳恢复（`recoverHealth`）——它们都表现为台账重新 armed+healthy。
   * 台账仍不可驱动（`driverHealth=paused` / `activation=disarmed`）→ 继续闭锁（等人）。
   *
   * 为什么必须有这一层：2026-10-03 的死循环里台账**写对了**、驱动**读不到**。
   * 闭锁的全部价值就是"与 I/O 无关的当拍判定"——投影再出一次同样的缺陷，也不会自旋。
   */
  function latchBlocks(state: DriverState): boolean {
    const latch = state.latch
    if (latch === undefined) return false
    if (ports.providerLatch?.isOpen() === true) return true
    const id = agentIdOf(state.agent)
    const req = id === undefined ? undefined : ports.peekFacts().find(r => r.sourceSessionId === id)
    if (req === undefined) return true
    // 人的意图被改成手动 → 继续闭锁（只有人能 arm 回来）。
    if (req.dive?.activation !== 'armed') return true
    // 解锁要两条**证据**同时成立，缺一不可：
    //   ① 本次停手的台账写已成功（`writable`）——否则下面的 healthy 只是"没写上"，不是"有人清过"；
    //   ② 台账**显式** healthy——我方刚写进去的是 `paused`，所以 healthy 只可能来自别人的写入
    //      （看板「继续」/ 确认推进 / 恢复路径）。
    // 刻意**不用** `isDrivableRequirement` 当解锁判据：写盘失败时它照样为真（台账里没有停手位），
    // 那是"没写上"而不是"有人修好了"——反向演练② 实测抓到过这个假解锁。
    if (!latch.writable) return true
    if (req.dive?.driverHealth?.state !== 'healthy') return true
    state.latch = undefined
    log.info('dive: 内存闭锁解除（台账已被显式复位为 healthy，原因为 ' + latch.reasonClass + '）')
    return false
  }

  /** 退避期内不起轮（FR-2）。 */
  function inBackoff(state: DriverState): boolean {
    const failure = state.failure
    return failure !== undefined && ports.now() < failure.nextAt
  }

  /**
   * 置内存闭锁。`writable` 初值恒 false——由 disarm 的写回执翻真（见 `DriverLatch.writable` 注释）。
   */
  function setLatch(state: DriverState, reasonClass: string, reasonText: string): void {
    state.latch = { reasonClass, reason: truncateReason(reasonClass + ' · ' + reasonText), at: ports.now(), writable: false }
  }

  /** 停手位落库的回执：只翻**同一把锁**（防止旧回执翻新锁）。 */
  function markLatchWritable(state: DriverState, reasonClass: string, ok: boolean): void {
    if (!ok) return
    const latch = state.latch
    if (latch !== undefined && latch.reasonClass === reasonClass) latch.writable = true
  }

  /**
   * 异常回合收尾的统一处置（FR-1/2/3/6）——三类病因三套动作，**不再一律停手**：
   *
   * | 病因 | 台账 | 内存 | 语义 |
   * |---|---|---|---|
   * | `abort`（人中止 / interrupted） | `driverHealth=paused`（reason=原文） | 闭锁 | 停下等人，不自动恢复 |
   * | `fatal`（AUTH/额度） | `driverHealth=paused`（reason=upstream-auth）+ **全局置闩** | 闭锁 | 重试无解，跨窗口一起停 |
   * | `transient`（超时/传输）未达阈值 | **不写**（不把一次抖动升级成人工事故） | 退避账 | 退避后自动重试 |
   * | `transient` 达阈值 | `driverHealth=paused`（reason=agent-error-loop） | 闭锁 | 熔断，等人 |
   *
   * 与修前的差异（**有意**）：修前任何异常都立刻写 `driverHealth=paused`，于是一次网络抖动
   * 就让需求停到人来点「继续」。FR-2 明确要求改为"退避重试 → 达阈值才熔断"。
   */
  function handleAbnormalTurnEnd(state: DriverState, cls: TurnEndClassification): void {
    const now = ports.now()
    const attempt = state.attempt
    const inFlight = attempt !== undefined && (attempt.phase === 'claimed' || attempt.phase === 'admitted')
    const reqId = attempt?.requirementId

    if (cls.kind === 'abort') {
      setLatch(state, cls.reasonClass, cls.reasonText)
      disarm(state, cls.reasonClass, (ok) => markLatchWritable(state, cls.reasonClass, ok))
      if (inFlight) attempt.cancelled = true
      log.warn('dive: 回合异常中止（' + cls.reasonClass + '）→ 内存闭锁，等人恢复（需求=' + reqId + '）')
      return
    }

    if (cls.kind === 'fatal') {
      try {
        ports.providerLatch?.trip({
          reasonClass: cls.reasonClass,
          ...(reqId !== undefined ? { requirementId: reqId } : {}),
        })
      } catch (err) {
        log.warn('dive: 全局闩置位失败（不阻断停手）', err)
      }
      setLatch(state, 'upstream-auth', cls.reasonText)
      state.failure = undefined
      disarm(state, 'upstream-auth', (ok) => markLatchWritable(state, 'upstream-auth', ok))
      if (inFlight) attempt.cancelled = true
      log.warn('dive: 上游致命错误（' + cls.reasonClass + '）→ 停手 + 全局闩（需求=' + reqId + '）')
      return
    }

    if (cls.kind === 'transient') {
      const failure = recordFailure(state.failure, cls.reasonClass, now)
      state.failure = failure
      if (!breakerTripped(failure)) {
        log.warn('dive: 瞬时失败（' + cls.reasonClass + '，第 ' + failure.count + ' 次）→ 退避后重试，不写健康位')
        return
      }
      setLatch(state, 'agent-error-loop', '连续 ' + failure.count + ' 次 ' + cls.reasonClass)
      disarm(state, 'agent-error-loop', (ok) => markLatchWritable(state, 'agent-error-loop', ok))
      if (inFlight) attempt.cancelled = true
      log.warn('dive: 连续 ' + failure.count + ' 次同因失败 → 熔断停手（' + cls.reasonClass + '）')
      return
    }

    // unknown：不猜、不动（与 turnEndOutcome 的既有约定一致）。
    log.debug('dive: 回合收尾形态不认识，按不处理收尾（不猜）')
  }

  function readyToDrive(state: DriverState): boolean {
    // 闭锁与退避**先于一切台账判据**：它们不依赖任何 I/O，是"当拍可信"的那一层。
    if (latchBlocks(state)) return false
    if (inBackoff(state)) return false
    return ports.fiberActive() && !state.stopping && agentLive(state)
      && agentStatusOf(state.agent) === 'idle' && !state.competingQueued
  }

  /**
   * 运行时暂停（FR-5）：只写 driverHealth，**不改 activation**；写失败只告警。
   * teardown（插件正常收尾）**不写任何状态**——重启不该把需求标成"不健康"，
   * 修前恰恰是这里把 activation 置 disarmed，导致"每次重启都把所有需求打成手动模式"。
   */
  function disarm(state: DriverState, reason: string, onSettled?: (ok: boolean) => void): void {
    if (reason === 'teardown') return
    let req: RequirementFacts | undefined
    try { req = requirementFor(state) } catch (err) { log.warn('dive: disarm 查需求失败（不冒泡）——' + reason, err); return }
    if (req === undefined) { log.warn('dive: disarm 跳过（无绑定需求）——' + reason); return }
    const id = req.id
    const p = mutateIfPresent(ports.store, id, (r) => {
      // FR-9（REQ-261003215944-9e04）：规则与留痕文案都改由纯函数给（`pause-runtime` 事件）——
      // 三件事一起收敛：只写健康位不改人的意图、同原因幂等、留痕人机可辨。
      // 本函数运行在 mutate 回调内（同步契约），故就地用纯函数算。
      const paused = transitionDive(r.dive, {
        event: 'pause-runtime',
        now: ports.now(),
        actor: { kind: 'system' },
        reason,
      })
      if (!paused.changed || paused.next === undefined) return undefined
      r.dive = paused.next
      if (paused.comment !== undefined) {
        r.comments.push({
          id: 'c-dive-disarm-' + ports.now(),
          body: paused.comment.body,
          createdAt: ports.now(),
          createdBy: paused.comment.createdBy,
        })
      }
      r.updatedAt = ports.now()
      return { changed: true }
    })
    if (onSettled === undefined) p.catch(err => log.warn('dive: 解除武装写失败——' + reason, err))
    else p.then(() => onSettled(true), (err) => { log.warn('dive: 解除武装写失败——' + reason, err); onSettled(false) })
    track(p)
  }

  /** 回合上限终态（FR-8）。 */
  function terminalBlock(req: RequirementFacts, limit: number): void {
    if (req.dive?.driverHealth?.state === 'paused') return
    const p = mutateIfPresent(ports.store, req.id, (r) => {
      // FR-9：同样走 `pause-runtime`（reason 前缀 round-limit 让规则模块按"达上限"口径处理：
      // attempts 不计 +1、并把阶段与上限写进留痕）。
      const paused = transitionDive(r.dive, {
        event: 'pause-runtime',
        now: ports.now(),
        actor: { kind: 'system' },
        reason: 'round-limit:' + r.status,
        status: r.status,
        roundLimit: limit,
      })
      if (!paused.changed || paused.next === undefined) return undefined
      r.dive = paused.next
      if (paused.comment !== undefined) {
        r.comments.push({
          id: 'c-dive-' + r.id + '-' + ports.now(),
          body: paused.comment.body,
          createdAt: ports.now(), createdBy: paused.comment.createdBy,
        })
      }
      r.updatedAt = ports.now()
      return { changed: true }
    })
    p.catch(err => log.warn('dive: 终态阻塞写失败', err))
    track(p)
    log.warn('dive: 回合上限（阶段=' + req.status + '，上限=' + limit + '，需求=' + req.id + '）→ 停下等人，人确认推进 / 看板「继续」即恢复')
  }

  /** 准入计数（FR-7）：消息真正进入 history 才 roundsInStage = round（恰好一次）。 */
  function persistAdmission(attempt: RoundAttempt): void {
    const p = mutateIfPresent(ports.store, attempt.requirementId, (r) => {
      if (r.dive === undefined) return undefined
      if ((r.dive.roundsInStage ?? 0) >= attempt.round) return undefined
      r.dive.roundsInStage = attempt.round
      r.dive.lastActiveAt = ports.now()
      r.updatedAt = ports.now()
      return { changed: true }
    })
    p.catch(err => log.warn('dive: 准入计数写失败（需求=' + attempt.requirementId + '）', err))
    track(p)
  }

  /** 空闲时把已取消的预留落成终态暂停（FR-9 aborted 后半）。 */
  function pauseAborted(state: DriverState): void {
    const attempt = state.attempt
    if (attempt === undefined || !attempt.cancelled) return
    const req = requirementById(attempt.requirementId)
    // 原因取闭锁里的**病因类别**（`aborted:user` / `upstream-auth` / `agent-error-loop`），
    // 不再一律写泛化的 `aborted`——人是靠这个字段判断"该找谁"的。
    const reason = state.latch?.reasonClass ?? 'aborted'
    state.attempt = undefined
    if (!isDrivableRequirement(req)) return
    const p = mutateIfPresent(ports.store, attempt.requirementId, (r) => {
      if (r.dive === undefined || r.dive.phase === 'paused') return undefined
      r.dive.phase = 'paused'
      r.dive.pausedReason = reason
      r.comments.push({ id: 'c-dive-abort-' + ports.now(), body: '[Dive] 回合被中止（aborted）→ 终态暂停。', createdAt: ports.now(), createdBy: { kind: 'system' } })
      r.updatedAt = ports.now()
      return { changed: true }
    })
    p.catch(err => log.warn('dive: aborted 终态写失败', err))
    track(p)
    log.warn('dive: 回合被中止 → 终态暂停（' + attempt.requirementId + '，reason=' + reason + '）')
  }

  /** 同批中非本回合的已认领消息按原顺序放回 next-step（幂等）。 */
  function restoreOtherClaimed(agent: unknown, messages: unknown[], messageId: string | undefined): void {
    const inbox = inboxOf(agent)
    if (inbox?.prepend === undefined) return
    for (const m of [...messages.filter(x => messageIdOf(x) !== messageId)].reverse()) {
      const id = messageIdOf(m)
      if (id === undefined) continue
      if ((inbox.nextStep ?? []).some(c => c.id === id) || (inbox.nextTurn ?? []).some(c => c.id === id)) continue
      inbox.prepend('next-step', m)
    }
  }

  async function drive(state: DriverState): Promise<void> {
    if (!readyToDrive(state)) return
    // FR-1：全局闩开着 → 本拍谁都不许起轮（"上游额度已用尽"是**跨窗口**事实，只停自己没意义）。
    if (ports.providerLatch?.isOpen() === true) {
      log.info('dive: 全局上游闩在闸 → 本拍不起轮（病因=' + (ports.providerLatch.reasonClass() ?? 'unknown') + '）')
      return
    }
    if (state.needsCheckpoint) {
      state.needsCheckpoint = false
      try { await ports.checkpoint() } catch (err) { log.warn('dive: 耐久检查点失败 → 解除武装', err); disarm(state, 'checkpoint-failed'); return }
      if (!readyToDrive(state) || state.needsCheckpoint) return
    }
    // 已有预留 → 不叠加执行：清预留、置检查点与请求，下一拍重来（对齐 Goal）。
    if (state.attempt !== undefined) { state.attempt = undefined; state.needsCheckpoint = true; state.requested = true; return }
    const id = agentIdOf(state.agent)
    if (id === undefined) return
    const bound = (): RequirementFacts | undefined =>
      ports.peekFacts().find(r => r.sourceSessionId === id)
    let req = bound()
    if (!isDrivableRequirement(req)) return
    // 终态需求永不被唤醒（2026-10-02 生产实测抓到的缺陷）：`bound()` 只按「哪个需求绑在这个窗口」查找，
    // 不看状态；于是启动迁移把一批**已归档**需求恢复成 armed 之后，只要有 idle 拍就会给它们投一轮
    // （实测：REQ-261001201200-8f8b，archived，被投了第 1 回合）。
    // 唤醒纪律：**关闭的需求不该有人惦记**——status 落在终态集合（done/archived/canceled）即收手。
    if (!isOpenRequirement(req!)) { log.debug('dive: 绑定窗口的需求已是终态（' + req!.status + '），不唤醒（需求=' + req!.id + '）'); return }
    const limit = roundLimitFor(req!.status)
    if ((req!.dive?.roundsInStage ?? 0) >= limit) { terminalBlock(req!, limit); return }
    // FR-3 排队点屏障：排队前必须先落盘；await 之后重查一切。
    try { await ports.checkpoint() } catch (err) { log.warn('dive: 排队点检查点失败 → 解除武装', err); disarm(state, 'checkpoint-failed'); return }
    if (!readyToDrive(state) || state.needsCheckpoint || state.attempt !== undefined) return
    req = bound()
    if (!isDrivableRequirement(req)) return

    // 🆕 REQ-261002141430-a5ef FR-1：弹框在途 → 停手等人（不投回合）。
    // 为什么放在 checkpoint 之后、构造 attempt 之前：这是最后一个"还来得及收手"的点；
    // 为什么**不** disarm / 不写健康位：这是**正常的等人**，不是运行时故障——停了要能自己回来
    // （台账上的停手位由 enterAwaitingConfirm 写，作答/过期后由 exit 清）。
    if (ports.dialogInFlight?.(req!.id) === true) {
      log.info('dive: 人工门禁弹框在途 → 本拍不起轮（需求=' + req!.id + '，等作答）')
      return
    }

    // REQ-261004065652-5c1c FR-5：**台账态**的人工门 → 停手等人（一次都不唤醒）。
    // 实测形态：验收材料已提交、验收单 9 项全 pending，而 Dive 还在反复唤醒窗口，
    // 台账自己写着「连续唤醒回合均无新输入、agent 无待办」。
    // 与上面那条一样：**不写健康位、不改 activation**——等人不是故障，停了要能自己回来
    // （人裁决/批准后，门自然关上，下一拍即可起轮）。
    if (ports.humanGate !== undefined) {
      let gate: { open: boolean; reason?: string } = { open: false }
      // 判据抛错 → 按"门关"处理（fail-open）：门禁判据的 bug 不该变成"整个自动化停摆"；
      // 但要响亮留痕（下一条 idle 拍还会再问一次，不吞）。
      try { gate = await ports.humanGate(req!.id) } catch (err) { log.warn('dive: 人工门判据抛错（本拍按门关处理）', err) }
      if (gate.open) {
        log.info('dive: 人工门开着（' + (gate.reason ?? 'unknown') + '）→ 本拍不起轮，等人裁决（需求=' + req!.id + '）')
        return
      }
    }

    // REQ-261004065652-5c1c FR-11：起链预算闸（WIP 上限 / token 预算）。
    // 与人工门同一个"还来得及收手"的点：构造 attempt 之前。判据抛错 → 按放行处理（fail-open，
    // 预算闸的 bug 不该让整个自动化停摆），但响亮留痕。
    if (ports.chainBudget !== undefined) {
      let verdict: { allowed: boolean; reason?: string; detail?: { name: string; current: number; limit: number } } = { allowed: true }
      try { verdict = ports.chainBudget(req!.id) } catch (err) { log.warn('dive: 预算判据抛错（本拍按放行处理）', err) }
      if (!verdict.allowed) {
        const d = verdict.detail
        log.info('dive: 预算闸拒绝（' + (verdict.reason ?? 'unknown') + (d === undefined ? '' : '：' + d.name + ' ' + d.current + '/' + d.limit) + '）→ 本拍不起轮（需求=' + req!.id + '）')
        return
      }
    }

    // 🆕 实施阶段中断自动恢复：如果 autoRun=false 但还有未完成任务，自动恢复并触发
    if (req!.status === 'implementing' && req!.autoRun !== true && ports.taskStore !== undefined) {
      const tasks = await ports.taskStore.listByRequirement(req!.id)
      const hasOpenWork = tasks.some(t => t.status !== 'done' && t.status !== 'canceled')
      if (hasOpenWork) {
        log.info('dive: 实施阶段检测到中断（autoRun=false），自动恢复并触发任务执行（需求=' + req!.id + '）')
        // 设置 autoRun=true 并触发任务执行
        await mutateIfPresent(ports.store, req!.id, (r) => {
          r.autoRun = true
          if (r.advance !== undefined) r.advance.pausedReason = undefined
          r.comments.push({
            id: 'dive-auto-resume-' + ports.now(),
            body: '[Dive 自动恢复] 实施阶段检测到中断（autoRun=false），自动恢复并继续执行',
            createdAt: ports.now(),
            createdBy: { kind: 'system' }
          })
          return { changed: true }
        })
        // 恢复后直接返回，等下次 drive 再发送回合消息
        return
      }
    }
    
    const round = (req!.dive?.roundsInStage ?? 0) + 1
    // FR-11：待投递的里程碑催办优先作为本回合正文（消费一次）；否则用常规续跑文案。
    const reminder = pendingReminders.get(req!.id)
    if (reminder !== undefined) pendingReminders.delete(req!.id)
    const text = reminder ?? ports.renderRoundText({ requirementId: req!.id, round, status: req!.status })
    const built = ports.delivery.createRoundMessage({ requirementId: req!.id, revision: req!.version, round, text })
    state.attempt = {
      requirementId: req!.id, revision: req!.version, round, messageId: built.messageId,
      content: contentOf(built.message), phase: 'queued', cancelled: false, stale: false,
    }
    const res = ports.delivery.deliverMessage(id, built.message)
    if (res.delivered) { log.info('dive: 起轮 queued（需求=' + req!.id + '，第 ' + round + '/' + limit + ' 回合，窗口=' + id + '）'); return }
    state.attempt = undefined
    // 未投出的催办不静默丢：放回待投递表，重新武装后仍可投递。
    if (reminder !== undefined) pendingReminders.set(req!.id, reminder)
    log.warn('dive: 回合投递失败 → 解除武装（需求=' + req!.id + '）：' + (res.reason ?? '未知原因'))
    disarm(state, 'queue-failed')
  }

  /** 合并触发 → 单 agent 串行链（FR-4）。 */
  function requestDrive(state: DriverState): void {
    if (stopped || state.stopping) return
    state.requested = true
    if (state.run !== undefined) return
    let run: Promise<void>
    try {
      run = ports.agents.withoutInitiator(async () => {
        while (state.requested && !state.stopping) {
          state.requested = false
          try { await drive(state) } catch (err) { log.warn('dive: 驱动体异常 → 解除武装', err); disarm(state, 'driver-failed') }
        }
      })
    } catch (err) { log.warn('dive: 无法启动驱动链 → 解除武装', err); disarm(state, 'driver-start-failed'); return }
    state.run = run
    const retire = (): void => { state.run = undefined; if (state.requested && !state.stopping) requestDrive(state) }
    run.then(retire, (err) => { log.warn('dive: 驱动链 reject → 解除武装', err); disarm(state, 'driver-rejected'); retire() })
  }

  function rejectReason(state: DriverState, source: { requirementId: string; revision: number; round: number }, req: RequirementFacts | undefined): string {
    const a = state.attempt
    if (a === undefined) return '无预留（attempt 缺失）'
    if (a.phase !== 'claimed') return '预留相位=' + a.phase + '（未认领）'
    if (a.stale) return '预留已 stale'
    if (a.cancelled) return '预留已取消'
    if (!sameRound(source as never, a)) return '来源与预留不符（req/revision/round）'
    if (req === undefined) return '需求不存在'
    if (req.version !== source.revision) return '需求 revision 已变（' + source.revision + ' → ' + req.version + '）'
    if (req.dive?.activation !== 'armed' || req.dive?.phase !== 'active') return '需求非 armed+active'
    if (source.round !== (req.dive.roundsInStage ?? 0) + 1) return '回合号不是 roundsInStage+1'
    return '内容与登记不一致'
  }

  return {
    onIdle(agent, captureTick) {
      const state = stateFor(agent)
      if (agentStatusOf(agent) === 'idle') state.competingQueued = false
      try { captureTick() } catch (err) { log.warn('dive: idle 采集跑批异常', err) }
      pauseAborted(state)
      requestDrive(state)
    },

    onInboxInserted(agent, message) {
      const inbox = inboxOf(agent)
      if (!(inbox?.nextTurn ?? []).some(c => c.id === messageIdOf(message))) return
      const state = stateFor(agent)
      if (state.attempt !== undefined && sameQueued(contentOf(message), sourceOf(message), state.attempt)) return
      state.competingQueued = true
      if (state.attempt?.phase === 'queued') state.attempt.stale = true
      log.debug('dive: 检测到竞争输入 → 让位到下次空闲')
    },
    onInboxClaimed(agent, message) {
      const state = states.get(agent)
      if (state?.attempt !== undefined && sameQueued(contentOf(message), sourceOf(message), state.attempt)) state.attempt.phase = 'claimed'
    },
    onInboxDiscarded(agent, message) {
      const state = states.get(agent)
      if (state?.attempt !== undefined && sameQueued(contentOf(message), sourceOf(message), state.attempt)) state.attempt.cancelled = true
    },

    onAgentError(agent) {
      const state = stateFor(agent)
      // 已被 turn/end 分类过（闭锁已置）→ 不覆盖更具体的原因：
      // 实测 18:03:52 的时序是 turn/end(AUTH) 先到、agent-error 后到，修前后者把原因改写成
      // 泛化的 `agent-error`，丢掉了"额度用尽"这条可行动信息。
      if (state.latch !== undefined) return
      // 没有 turn/end 形态可用的 agent 级错误 → 按**瞬时**故障记账（不写健康位），
      // 同因达阈值才熔断停手。
      const failure = recordFailure(state.failure, 'agent-error', ports.now())
      state.failure = failure
      if (!breakerTripped(failure)) {
        log.warn('dive: agent 级错误（第 ' + failure.count + ' 次）→ 退避后重试')
        return
      }
      setLatch(state, 'agent-error-loop', '连续 ' + failure.count + ' 次 agent 级错误')
      disarm(state, 'agent-error-loop', (ok) => markLatchWritable(state, 'agent-error-loop', ok))
      log.warn('dive: 连续 ' + failure.count + ' 次 agent 级错误 → 熔断停手')
    },
    onAgentDisposed(agent) { states.delete(agent) },

    onRequirementMoved(requirementId) {
      const id = requirementById(requirementId)?.sourceSessionId
      if (id === undefined) return
      const agent = ports.agents.get(id)
      if (agent === undefined) return
      const state = stateFor(agent)
      state.needsCheckpoint = true
      // 🆕 无论 agent 是否 idle，都先设置 requested 标志并尝试 requestDrive
      // - 如果 agent idle：requestDrive 会立即启动 drive()
      // - 如果 agent 忙：requested 标志保持，等 onIdle 时会再次触发 requestDrive
      state.requested = true
      // REQ-261001201200-8f8b FR-4：先看这条需求是不是「被基础设施误解除武装（disarmed+active）」
      // ——是则**先重新武装再驱动**。顺序不能反：re-arm 是异步写，抢在 requestDrive 之前落库，
      // 否则 drive() 会在 isDrivableRequirement() 处直接 return，白白错过这次 requirement-moved。
      if (isRecoverableDisarm(requirementById(requirementId))) {
        void rearmIfRecoverable(
          {
            store: ports.store,
            now: ports.now,
            // REQ-261002141430-a5ef FR-4①：弹框在途时不越权清停手位
            ...(ports.dialogInFlight === undefined ? {} : { dialogInFlight: ports.dialogInFlight }),
          },
          requirementId,
          'requirement-moved',
        )
          .then((ok) => {
            if (ok) log.info('dive: 误停摆已重新武装（需求=' + requirementId + '）')
            requestDrive(state)
          })
          .catch((err) => {
            log.warn('dive: 重新武装失败（不阻断驱动）——' + requirementId, err)
            requestDrive(state)
          })
        return
      }
      requestDrive(state)
      log.debug('dive: requirement-moved → requestDrive（agent 状态：' + agentStatusOf(agent) + '）')
    },

    onSessionEvent(session, event) {
      const sid = (session as { id?: unknown } | undefined)?.id
      if (typeof sid !== 'string') return
      const agent = ports.agents.get(sid)
      if (agent === undefined) return
      const state = stateFor(agent)
      const evt = (event ?? {}) as { type?: unknown; data?: unknown }
      const data = (evt.data ?? {}) as { id?: unknown; reason?: { kind?: unknown } }
      if (evt.type === 'user/message') {
        const attempt = state.attempt
        if (attempt !== undefined && data.id === attempt.messageId && attempt.phase !== 'admitted') {
          attempt.phase = 'admitted'
          persistAdmission(attempt)
          log.info('dive: 回合已准入 history（需求=' + attempt.requirementId + '，第 ' + attempt.round + ' 回合）')
        }
        return
      }
      if (evt.type !== 'turn/end') return
      // FR-6：回合收尾**只认一个解析器**（internal/interruption.turnEndOutcome）。
      // 修前这里自己读 data.reason?.kind，只认 max-tokens 与 aborted：
      // `error:<code>:<message>`（上游流超时都落这里）与 `interrupted` 被**静默忽略**——
      // 于是回合实际上异常收尾了，Dive 却以为它还在跑，一直等一个永不到来的安静点。
      // 现在四种形态一套口径：completed/max-tokens/blocked 非异常；aborted:*/error:*/interrupted 异常。
      const outcome = turnEndOutcome(data)
      if (outcome === undefined) {
        // 形态不认识 → 不猜、不误报（与 session-driver 同一约定）
        log.debug('dive: turn/end 形态不认识，按不处理收尾（不猜）')
        return
      }
      const cls = classifyTurnEnd(data)
      if (outcome.reason === 'max-tokens') { log.warn('dive: 回合因 max-tokens 结束 → 暂停自动续跑'); disarm(state, 'max-tokens'); return }
      if (!outcome.abnormal) {
        // 正常收尾 = 这一轮没病 → 清退避账（否则抖动后的第一次成功仍被退避挡着）。
        if (state.failure !== undefined) {
          state.failure = undefined
          log.info('dive: 回合正常收尾 → 退避账清零')
        }
        return
      }
      handleAbnormalTurnEnd(state, cls)
    },

    async onPreStep(agent, messages, signal, next) {
      const submitted = messages.find(m => isDiveRoundSource(sourceOf(m)))
      if (submitted === undefined) return next()
      const content = contentOf(submitted)
      const source = sourceOf(submitted) as { requirementId: string; revision: number; round: number }
      const state = stateFor(agent)
      const validate = (): boolean => roundReservationValid({
        state, content, source: source as never,
        req: requirementById(source.requirementId), fiberActive: ports.fiberActive(), agentLive: agentLive(state),
      })
      let valid = false
      try { valid = validate() } catch (err) { log.warn('dive: pre-step 校验抛错 → 解除武装', err); disarm(state, 'pre-step-error') }
      if (!valid) {
        log.warn('dive: pre-step 拒绝（前）：' + rejectReason(state, source, requirementById(source.requirementId)))
        if (state.attempt !== undefined && sameRound(source as never, state.attempt)) { state.attempt.stale = true; state.attempt = undefined }
        restoreOtherClaimed(agent, messages, messageIdOf(submitted))
        requestDrive(state)
        return { kind: 'reject' }
      }
      let decision: PreStepDecision
      try { decision = await next() } catch (err) {
        if (signal.aborted) throw err
        state.attempt = undefined
        requestDrive(state)
        throw err
      }
      if (signal.aborted) {
        if (decision.kind === 'enter') restoreOtherClaimed(agent, decision.messages, messageIdOf(submitted))
        return decision
      }
      if (decision.kind === 'reject') {
        log.warn('dive: pre-step 被下游拒绝（prompt-rejected）→ 解除武装')
        state.attempt = undefined
        disarm(state, 'prompt-rejected')
        return decision
      }
      let valid2 = false
      try { valid2 = validate() } catch (err) { log.warn('dive: post-decision 校验抛错 → 解除武装', err); disarm(state, 'pre-step-error') }
      if (!valid2) {
        log.warn('dive: pre-step 拒绝（后）：' + rejectReason(state, source, requirementById(source.requirementId)))
        state.attempt = undefined
        restoreOtherClaimed(agent, decision.messages, messageIdOf(submitted))
        requestDrive(state)
        return { kind: 'reject' }
      }
      return { ...decision, startsRequestSeries: true }
    },

    queueReminder(requirementId, text) {
      if (stopped) return
      pendingReminders.set(requirementId, text)
      // 经既有端口解析投递目标（与 onRequirementMoved 同口径：台账 sourceSessionId → agents.get）。
      const windowId = requirementById(requirementId)?.sourceSessionId
      if (windowId === undefined) {
        log.warn('dive: 里程碑催办已登记但需求无绑定会话（需求=' + requirementId + '）——待绑定后由 requestDrive 投递')
        return
      }
      const agent = ports.agents.get(windowId)
      if (agent === undefined) {
        log.warn('dive: 里程碑催办已登记但窗口不在线（需求=' + requirementId + '，窗口=' + windowId + '）')
        return
      }
      log.info('dive: 里程碑催办已登记，由 round 半在 armed+active 时投递（需求=' + requirementId + '）')
      requestDrive(stateFor(agent))
    },

    requestDrive(agent) { requestDrive(stateFor(agent)) },

    async teardown() {
      stopped = true
      const waits: Promise<unknown>[] = []
      let cancelled = 0
      for (const state of states.values()) {
        state.stopping = true
        disarm(state, 'teardown')
        if (state.attempt !== undefined) {
          state.attempt.stale = true
          if (agentStatusOf(state.agent) === 'running') { ports.cancel(state.agent, 'parent'); cancelled += 1; waits.push(ports.whenIdle(state.agent)) }
        }
        if (state.run !== undefined) waits.push(state.run)
      }
      log.info('dive: teardown —— ' + states.size + ' 个 agent 状态、' + cancelled + ' 个在飞回合被取消')
      states.clear()
      await Promise.allSettled([...waits, ...writes])
    },

    async whenQuiet() {
      for (let i = 0; i < 20; i += 1) {
        const waits: Promise<unknown>[] = [...writes]
        for (const s of states.values()) if (s.run !== undefined) waits.push(s.run)
        if (waits.length === 0) return
        await Promise.allSettled(waits)
        if (writes.size === 0 && [...states.values()].every(s => s.run === undefined)) return
      }
    },
  }
}
