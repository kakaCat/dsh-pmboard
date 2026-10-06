/**
 * 挂起确认注册表（REQ-260924213231-b1c4 T-6 · FR-3 / T-4）——`PendingConfirmPort` 的唯一实现。
 *
 * 为什么是**内存**：挂起确认是「弹框已投递、人还没答」的短时态，不是业务事实；业务事实
 * （confirmedAt / 计划批准）落台账。进程重启丢掉 ticket 时，回执按 E-5 报
 * `REQBOARD_UNKNOWN_TICKET`，引导调用方改读台账（confirmedAt 为准）——不猜、不伪造。
 *
 * 语义：
 *  - ticket 前缀固定 `pc-`（PENDING_CONFIRM_TICKET_PREFIX），全局唯一；
 *  - `get` 只认**本窗口**且未过期（(interruptedAt ?? createdAt) + ttl，缺省 LIMITS.pendingConfirmTtlMs）的记录；
 *  - `settle` 回填后台作答结果，**幂等**（重复回填保留首次结果）；
 *  - `markInterrupted` 标记「阻塞等待期间被中止」，**幂等**（只写首次 interruptedAt）——中止记录
 *    以 interruptedAt 为过期基准，再获一个完整 TTL（REQ-260927123256-196b FR-4）；
 *  - 各方法都**不抛**（未知/跨窗口/过期一律 undefined，由用例降级）。
 *
 * t7（REQ-261004103330-005f FR-11）新增**宿主级动作票据**：`target:'storage-action'` 走后者的
 * `storageActions` 表（独立于 ticket 表），并提供一次性 `consume`（已落章 + 未过期 + 未消费 → 置已消费）。
 * 既有 artifact/plan 的登记/取回/落章路径**逐字不变**。
 *
 * @module dsh-pmboard/adapters/PendingConfirmRegistry
 */
import { randomInt } from 'node:crypto'
import type { DialogInFlightPort, DialogInFlightRecord, PendingConfirmPort } from '../application/ports.js'
import { LIMITS } from '../domain/limits.js'
// 分档过期规则独立成小模块（本文件要守 400 行尺寸门禁，且不能靠删注释腾地方）。
import { sweepInFlightTtl } from './dialog-inflight-expiry.js'
import {
  PENDING_CONFIRM_TICKET_PREFIX,
  type ArtifactKind,
  type PendingConfirmation,
  type PendingConfirmationOutcome,
} from '../shared/protocol.js'

// 宿主级动作票据的**类型**已拆到 `./storage-action-types.ts`：
// 注册表本体要守 `src/` 的 400 行尺寸门禁，而本次 fail-open 修复（否定作答不是许可）必须把理由写清，
// 不能靠删注释腾地方——故按"类型与行为分开"切一刀，注释一字未改地搬过去。
// 此处 `import type` 供本文件使用，并**再导出**，既有 import 路径不受影响。
import type {
  ConsumeResult,
  PendingRegisterInput,
  StorageAction,
  StorageActionConfirmation,
  StorageActionStamp,
} from './storage-action-types.js'

export type {
  ConsumeFailureReason,
  ConsumeResult,
  PendingRegisterInput,
  StorageAction,
  StorageActionConfirmation,
  StorageActionStamp,
} from './storage-action-types.js'

/**
 * 作答通道来源白名单（形状校验用）：不在表内的 channel 一律视为**未落章**。
 * 为什么列白名单而不是"非空字符串即可"：留痕要能回答"人是从哪个通道答的"，
 * 一个 `channel:'x'` 的马虎值会让审计失去意义。
 */
const STORAGE_ACTION_CHANNELS: readonly StorageActionStamp['channel'][] = ['board-confirm', 'dialog-answer', 'text-evidence']

/** 落章 stamp 的形状校验（入参可能来自 HTTP body，缺失/畸形都算未落章）。 */
function isStorageActionStamp(v: unknown): v is StorageActionStamp {
  if (typeof v !== 'object' || v === null) return false
  const channel = (v as { channel?: unknown }).channel
  return typeof channel === 'string' && (STORAGE_ACTION_CHANNELS as readonly string[]).includes(channel)
}

/** 作答结果的形状校验（`{confirmed, advanced}` 都必须是布尔）。 */
function isPendingOutcome(v: unknown): v is PendingConfirmationOutcome {
  if (typeof v !== 'object' || v === null) return false
  const o = v as { confirmed?: unknown; advanced?: unknown }
  return typeof o.confirmed === 'boolean' && typeof o.advanced === 'boolean'
}

export interface PendingConfirmRegistryOptions {
  /** 时间源（测试注入固定值；默认 Date.now——adapters 允许非确定性）。 */
  now?: () => number
  /**
   * 过期窗口（毫秒；默认 LIMITS.pendingConfirmTtlMs = 30 分钟）。
   *
   * 为什么不再借用 `confirmEvidenceWindowMs`：那是"用户文字确认证据的有效期"（1 小时），
   * 与"挂起确认多久后自动失效"是两件事。混用会让陈旧挂起拖到 1 小时才放行——
   * REQ-261001143526-8475 实测：陈旧挂起 pc-2c6cfb 一直挂到归档环节把写路径拦住
   * （REQ-261001154450-b918 FR-5）。
   */
  ttlMs?: number
  /**
   * **阻塞型在途登记**的有效期（毫秒；缺省 `LIMITS.timeoutInteractiveMs` = 60 分钟）——
   * REQ-261006170150-52cc FR-3 的分档 TTL；分档理由与反面代价见 `dialog-inflight-expiry.ts`。
   * 票 TTL（`ttlMs`）语义**不受本项影响**。
   */
  blockingTtlMs?: number
  /** ticket 生成器（测试注入固定值；默认 `pc-` + 6 位 hex）。 */
  newTicket?: () => string
}

export class PendingConfirmRegistry implements PendingConfirmPort, DialogInFlightPort {
  private readonly records = new Map<string, PendingConfirmation>()
  /**
   * 在途弹框登记（REQ-261002141430-a5ef FR-1）：ref → 记录。
   * 与 ticket 表**同实例同生共死**（都是"弹框还活着"的短时态），但语义独立——
   * 这张表答"自动链该不该停"，ticket 表答"能不能取回执"。
   */
  private readonly inFlight = new Map<string, DialogInFlightRecord>()
  /**
   * 宿主级动作的一次性票据（t7 / FR-11）：与本表**同实例**但**独立语义**——
   * 不进 ticket 表，因此 `get` / `pendingForWindow` / `markInterrupted` 对它零影响：
   * 存储开关不该拦住任何需求的写路径（它不是"某条需求等人作答"）。
   */
  private readonly storageActions = new Map<string, StorageActionConfirmation>()
  private readonly now: () => number
  private readonly ttlMs: number
  /** 阻塞型在途登记的有效期（`suspend:false`）；挂起型仍走 `ttlMs`——见 options 注释。 */
  private readonly blockingTtlMs: number
  private readonly newTicket: () => string

  constructor(options: PendingConfirmRegistryOptions = {}) {
    this.now = options.now ?? ((): number => Date.now())
    this.ttlMs = options.ttlMs ?? LIMITS.pendingConfirmTtlMs
    this.blockingTtlMs = options.blockingTtlMs ?? LIMITS.timeoutInteractiveMs
    this.newTicket = options.newTicket ?? ((): string =>
      PENDING_CONFIRM_TICKET_PREFIX + randomInt(0, 0xffffff).toString(16).padStart(6, '0'))
  }

  // ── DialogInFlightPort（FR-1/FR-3）：同步登记 + 同步读，绝不引入 await/IO ──────────

  enter(input: {
    ref: string
    windowKey: string
    requirementId: string
    kind: 'confirm' | 'gate'
    suspend: boolean
  }): void {
    if (input.ref.length === 0) return
    // 幂等：同 ref 重复登记保留首条（since 不刷新，最长等待时间才算得准）
    if (this.inFlight.has(input.ref)) return
    this.inFlight.set(input.ref, {
      ref: input.ref,
      windowKey: input.windowKey,
      requirementId: input.requirementId,
      kind: input.kind,
      suspend: input.suspend,
      since: this.now(),
    })
  }

  exit(ref: string): void {
    this.inFlight.delete(ref)
  }

  /**
   * 该需求是否有**未过期**的在途弹框（同步）。
   * FR-3：读时惰性摘除过期记录 ⇒ `true` 的含义是「此刻真的有人在等」。
   */
  inFlightFor(requirementId: string): boolean {
    this.sweepInFlight()
    for (const record of this.inFlight.values()) {
      if (record.requirementId === requirementId) return true
    }
    return false
  }

  /** 诊断/对账用快照：**只回未过期**的记录（与 `inFlightFor` 同口径，含惰性摘除）。 */
  list(): readonly DialogInFlightRecord[] {
    this.sweepInFlight()
    return [...this.inFlight.values()].map(r => ({ ...r }))
  }

  /**
   * 惰性摘除过期在途登记（FR-3）：`now - since > 该形态的 TTL` 即从表里删掉。
   * 分档规则与「为什么分两档」在 `dialog-inflight-expiry.ts`；本处只给当前两档 TTL。
   */
  private sweepInFlight(): void {
    sweepInFlightTtl(this.inFlight, this.now(), { suspend: this.ttlMs, blocking: this.blockingTtlMs })
  }

  /**
   * 登记一次挂起确认并返回 ticket。
   *
   * 重载 ①（t7 / FR-11）：`target:'storage-action'` = 宿主级动作，`requirementId` 可空、
   * 且**不进 ticket 表**（路由到 `storageActions`），返回带 `action` 的记录。
   * 重载 ②（既有口径，**逐字未动**）：`artifact` / `plan` 必须给 `requirementId`。
   */
  register(input: {
    windowKey: string
    requirementId?: string
    target: 'storage-action'
    kind?: undefined
    action?: StorageAction
  }): StorageActionConfirmation
  register(input: {
    windowKey: string
    requirementId: string
    target: 'artifact' | 'plan'
    kind?: ArtifactKind
  }): PendingConfirmation
  register(input: PendingRegisterInput): PendingConfirmation | StorageActionConfirmation {
    if (input.target === 'storage-action') return this.registerStorageAction(input)
    const record: PendingConfirmation = {
      ticket: this.newTicket(),
      windowKey: input.windowKey,
      requirementId: input.requirementId ?? '',
      target: input.target,
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      createdAt: this.now(),
    }
    this.records.set(record.ticket, record)
    return { ...record }
  }

  /** 宿主级动作登记（t7）：`requirementId` 缺省 = 空串（不属于任何需求）；`action` 缺省 = `migrate`。 */
  registerStorageAction(input: {
    windowKey: string
    requirementId?: string
    action?: StorageAction
  }): StorageActionConfirmation {
    const record: StorageActionConfirmation = {
      ticket: this.newTicket(),
      windowKey: input.windowKey,
      requirementId: input.requirementId ?? '',
      target: 'storage-action',
      action: input.action ?? 'migrate',
      createdAt: this.now(),
    }
    this.storageActions.set(record.ticket, record)
    return { ...record }
  }

  /**
   * 宿主级动作的落章（**只有作答通道可调**）：写 `outcome` + `stamp`。
   * 幂等：重复落章保留首次（与 `settle` 同口径）；未知 ticket → undefined（不抛）。
   */
  settleStorageAction(
    ticket: string,
    outcome: PendingConfirmationOutcome,
    stamp: StorageActionStamp,
  ): StorageActionConfirmation | undefined {
    const found = this.storageActions.get(ticket)
    if (found === undefined) return undefined
    // 形状校验（**不是形式主义**）：本方法的入参最终来自 HTTP body / 弹框回填，可能缺失或畸形。
    // 若不校验，`{ ...undefined }` 会写出一个 `{}`——于是"半落章"被判成已落章，
    // **白白放行一次后端切换**（本卡测试实测抓到过：8 条用例里那条 unsettled 断言先红）。
    // 故：只有形状成立才写，写不进去就保持未落章（consume 必然拒）。
    if (found.outcome === undefined && isPendingOutcome(outcome)) found.outcome = { ...outcome }
    if (found.stamp === undefined && isStorageActionStamp(stamp)) found.stamp = { ...stamp }
    return { ...found }
  }

  /** 按 ticket 读宿主级动作记录（只读，不过滤过期：诊断用；判定一律走 `consume`）。 */
  getStorageAction(ticket: string): StorageActionConfirmation | undefined {
    const found = this.storageActions.get(ticket)
    return found === undefined ? undefined : { ...found }
  }

  /**
   * **一次性消费**宿主级动作票据（t7 / FR-11 的代码级门槛）：
   * 原子校验「已落章（outcome + stamp 都在）+ 未过期 + 未消费」，通过则置 `consumedAt` 并返回落章信息；
   * 任一不满足 → 结构化原因，**不改变票据状态**（除成功那一支）。
   *
   * ## 原子性怎么保证（本方法刻意**全同步**）
   *
   * 检查与置位之间**没有任何 `await`**：`consume` 是同步方法，因此 Node 单线程下两次调用必然**串行**执行，
   * 不存在"两个调用都通过检查"的交错窗口——第二个调用一定看到第一个写下的 `consumedAt`。
   * 这也是为什么本方法**不做成 async**：一旦引入 await，"检查 → 置位"之间就会让出事件循环，
   * 并发重放会双双成功（一次性票据当场失效）。
   *
   * 判定顺序：unknown → consumed → expired → unsettled → denied（已消费优先报 consumed，便于排查重放）。
   *
   * ## 为什么必须有 `denied` 这一关（fail-closed：堵住"只看 ok 就切库"）
   *
   * "已落章"**不等于**"人已同意"：人在确认框点「取消」或「需要修改」时，`settle` 同样会写下 outcome，
   * 只是 `confirmed === false`。此前 `consume` 只校验 outcome/stamp **存在**，于是**否定作答也会返回 `ok:true`**
   * （调用方若只看 `ok`，就会把"人刚拒绝过一次"当成"人已批准"照切后端）。
   *
   * 故在源头补这一关：**否定作答不消费、不置位**，返回 `denied`。
   * 路由层（`http/routers/settings.ts` 的 `consumed.confirmed !== true → 403`）另有一层同样口径的检查——
   * 二者不是重复劳动，而是**同一条纪律的两道**：源头这层保证"任何调用方都拿不到误导性的 ok"，
   * 路由那层保证"就算将来有人绕过 consume 的返回值语义，也切不动"。
   */
  consume(ticket: string): ConsumeResult {
    const found = this.storageActions.get(ticket)
    if (found === undefined) return { ok: false, ticket, reason: 'unknown' }
    if (found.consumedAt !== undefined) return { ok: false, ticket, reason: 'consumed' }
    if (this.expired(found)) return { ok: false, ticket, reason: 'expired' }
    if (found.outcome === undefined || found.stamp === undefined) {
      return { ok: false, ticket, reason: 'unsettled' }
    }
    // 否定作答：不消费、不置位（人点了取消/需要修改，票据留着也不能再被当成许可）。
    if (found.outcome.confirmed !== true) return { ok: false, ticket, reason: 'denied' }
    // ↓ 检查与置位之间零 await（见上方注释）：同步方法 = 天然原子。
    found.consumedAt = this.now()
    return {
      ok: true,
      ticket,
      action: found.action,
      requirementId: found.requirementId,
      confirmed: found.outcome.confirmed,
      advanced: found.outcome.advanced,
      by: {
        kind: 'human',
        channel: found.stamp.channel,
        ...(found.stamp.sessionId === undefined ? {} : { sessionId: found.stamp.sessionId }),
        ...(found.stamp.pluginVersion === undefined ? {} : { pluginVersion: found.stamp.pluginVersion }),
        at: found.consumedAt,
      },
    }
  }

  get(ticket: string, windowKey: string): PendingConfirmation | undefined {
    const found = this.records.get(ticket)
    if (found === undefined) return undefined
    if (found.windowKey !== windowKey) return undefined
    if (this.expired(found)) return undefined
    return this.copy(found)
  }

  settle(ticket: string, outcome: PendingConfirmationOutcome): PendingConfirmation | undefined {
    const found = this.records.get(ticket)
    if (found === undefined) return undefined
    if (found.outcome === undefined) found.outcome = { ...outcome }
    return this.copy(found)
  }

  /** FR-9：本窗口是否存在**未作答**的挂起确认（已作答 / 已过期 / 跨窗口都不算）。 */
  pendingForWindow(windowKey: string): PendingConfirmation | undefined {
    for (const record of this.records.values()) {
      if (record.windowKey !== windowKey) continue
      if (record.outcome !== undefined) continue
      if (this.expired(record)) continue
      return this.copy(record)
    }
    return undefined
  }

  /**
   * 只读查「同一道门」是否已有人在等（REQ-261006164732-6503 t1 · 设计 I-4 / G-3）。
   *
   * 判定键 = `(requirementId, target, kind)`，**刻意不含 `windowKey`**：同一需求的同一道门，
   * 不管从哪个窗口请求（含 worker 席位），人都只该被问一次——跨窗口命中也算命中。
   *
   * 命中条件（三条同时成立）：键相同 ∧ `outcome === undefined`（未作答）∧ 未过期。
   * 命中数恒为 0 或 1（不变式，"还没有门"是合法状态，故不断言必定命中）。
   *
   * **纯读**：不 settle、不 register、不 markInterrupted，不改任何字段、不续期（`createdAt` 不动）——
   * 复用不得延长门的老化时间，否则反复请求会把门续成永不过期。返回的是副本，调用方改不动内部记录。
   *
   * `kind` 缺省 = 查「无 kind 的门」（即 `target:'plan'` 的口径）。**不做"缺省即通配"**：
   * 通配会让 plan 请求误命中一道 artifact 门，把两种门混成一种。
   */
  findOpen(input: {
    requirementId: string
    target: 'artifact' | 'plan'
    kind?: ArtifactKind
  }): PendingConfirmation | undefined {
    for (const record of this.records.values()) {
      if (record.requirementId !== input.requirementId) continue
      if (record.target !== input.target) continue
      if (record.kind !== input.kind) continue
      if (record.outcome !== undefined) continue
      if (this.expired(record)) continue
      return this.copy(record)
    }
    return undefined
  }

  /**
   * 标记「阻塞等待期间被中止」（REQ-260927123256-196b FR-4）：幂等，只写首次 interruptedAt；
   * 未知 ticket → undefined（不抛）。中止记录据此再获一个完整 TTL（见 expired）。
   */
  markInterrupted(ticket: string): PendingConfirmation | undefined {
    const found = this.records.get(ticket)
    if (found === undefined) return undefined
    if (found.interruptedAt === undefined) found.interruptedAt = this.now()
    return this.copy(found)
  }

  /**
   * 过期判定单点：基准 = (interruptedAt ?? createdAt)——中止记录不因登记时间早而提前失效。
   *
   * 入参刻意收窄成**结构最小形状**（`{createdAt, interruptedAt?}`）而不是 `PendingConfirmation`：
   * 宿主级动作的票据（`StorageActionConfirmation`）没有 `interruptedAt`（它不参与"阻塞被中止"），
   * 但**必须共用同一个 TTL 口径**——共用这一处，就不可能出现两套过期规则。
   */
  private expired(record: { createdAt: number; interruptedAt?: number }): boolean {
    const base = record.interruptedAt ?? record.createdAt
    return this.now() - base > this.ttlMs
  }

  /** 对外一律给副本：调用方拿不到内部引用，也改不动注册表。 */
  private copy(record: PendingConfirmation): PendingConfirmation {
    return {
      ...record,
      ...(record.outcome === undefined ? {} : { outcome: { ...record.outcome } }),
    }
  }
}
