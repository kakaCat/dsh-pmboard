/**
 * 唤醒心跳兜底（REQ-261001213924-1441 FR-4）——**只叫醒看起来停着的**，不是每秒都推一把。
 *
 * 为什么需要：Dive 的驱动点只有「agent 空闲」这一处；一旦那一路因为任何原因没送达（订阅没成立、
 * 作用域、事件形态变化、驱动器没接上），需求就**永远停着**，而台账上看不出任何异常。
 * 心跳把「该跑却没动静」变成两类可判定结果：
 *   · 叫醒成功 → 记 lastWakeAt，连续失败计数归零；
 *   · 连续失败达上限 → **只写运行时健康 paused（wake-undeliverable）**，人的意图（activation）不动，
 *     并留一条 comment——人一看就知道"它想跑但叫不醒"，而不是"它自己不想跑"。
 *
 * 三条纪律：
 *  ① **不滥叫**：只在「可驱动 + 停滞超过 staleMs」时唤醒（新建需求 lastWakeAt 缺失 ⇒ 视为停滞，立刻叫一次）；
 *  ② **不越权**：只写 driverHealth / lastWakeAt / comment，绝不改 activation；
 *  ③ **响亮**：失败计数与暂停理由都进台账，人可读。
 *
 * @module dsh-pmboard/application/dive/wake-heartbeat
 */
import type { RequirementStore } from '../ports.js'
import type { RequirementRecord } from '../../shared/protocol.js'
import { isDrivableRequirement } from './round-state.js'
import { isOpenRequirement } from '../../domain/status/Predicates.js'
import { requirementStoreOf, mutateIfPresent } from '../use-cases/queue-access.js'
// REQ-261002141430-a5ef FR-4④：停手对账（过期/重启后恢复，防静默停摆）
import { exitAwaitingConfirm, isAwaitingConfirmStop } from '../internal/awaiting-confirm.js'

/** 默认停滞阈值：10 分钟没有过成功唤醒就认为"停着"（人手动操作也在这个量级）。 */
export const DEFAULT_STALE_MS = 10 * 60 * 1000

/** 连续唤醒失败达此数 → 运行时健康转 paused。 */
export const DEFAULT_MAX_FAILURES = 3

export interface WakeHeartbeatDeps {
  /**
   * 需求存储新端口（t8/B11 读 / B12 阶段②c 起**写也走它**）：心跳的读与写都在这条口上。
   * 必填：调用方（ReqboardDiveManager）持有必填的 `ports.store` ⇒ 这里不再留可选回落。
   */
  store: RequirementStore
  now: () => number
  /** 把唤醒请求递给驱动；返回是否**受理**（不代表投递成功——那由 driverHealth 的其它路径记录）。 */
  wake: (requirementId: string) => boolean | Promise<boolean>
  /**
   * 在途弹框判据（REQ-261002141430-a5ef FR-4④）：台账写着「停手等弹框」而它说「没有在途」→
   * 这次等待已经没有对应弹框了（TTL 过期 / 插件重启丢了登记表）→ 恢复。
   * 缺省 undefined = 不做停手对账（行为与改动前逐字一致）。
   */
  dialogInFlight?: (requirementId: string) => boolean
  /**
   * 停手位被清 → 请求一次自动链驱动（REQ-261006170150-52cc FR-3，与 `UseCaseDeps.notifyDrivable` 同义）。
   *
   * 为什么心跳也要这一口：过期对账（`reconcileAwaitingStops`）清掉残影走的是它自己这份 deps 面，
   * 不接这一口就只剩「清位了但没人叫」——需求不再停在「等人」，可也不会重新跑起来。
   *
   * 组合根实现 = `(id) => this.round.onRequirementMoved(id)`（**与 store 桥同一条路**，不新增投递路径）。
   * 缺省 undefined = 清位只写台账、不请求驱动（行为与改造前逐字一致）。
   */
  notifyDrivable?: (requirementId: string) => void
  /**
   * 全局上游闩判据（REQ-261004065652-5c1c FR-1）：闩开着 → 本趟心跳**整趟跳过**。
   * 为什么：额度/鉴权类故障是跨窗口事实，这趟既不该叫醒谁、也不该刷 lastWakeAt 或健康位——
   * 否则心跳会把一个"已知不可用"的上游反复撞（实测死循环期间的无效请求就有这一路）。
   * 缺省 undefined = 判据恒假（行为与改动前逐字一致）。
   */
  providerLatchOpen?: () => boolean
  logger?: { warn: (message: string, err?: unknown) => void }
  staleMs?: number
  maxFailures?: number
}

export interface WakeTickResult {
  /** 本次真的叫醒了的（含首次叫醒与重试成功）。 */
  woken: string[]
  /** 想叫但没叫动（受理失败）的。 */
  failed: string[]
  /** 因连续失败达上限而转入 paused 的。 */
  paused: string[]
  /** 本轮跳过的（健康/不可驱动/不开放/还新鲜）。 */
  skipped: string[]
  /**
   * 停手对账恢复的（REQ-261002141430-a5ef FR-4④）：「台账写着等弹框、实际已无在途」——
   * 过期或重启丢登记，按无人等待处理，绝不停在没人叫醒的状态。
   */
  resumed: string[]
}

/** 是否"看起来停着"：从未成功唤醒过，或距上次成功唤醒已超过 staleMs。 */
export function isStalledWake(req: RequirementRecord, now: number, staleMs: number): boolean {
  const last = req.dive?.lastWakeAt
  if (last === undefined) return true
  return now - last > staleMs
}

/**
 * 停手对账（REQ-261002141430-a5ef FR-4④）：台账写着「等弹框」而实际无在途 → 恢复并留痕。
 *
 * 两个触发场景：① 人一直没作答、挂起记录过了 TTL；② 插件重启，内存里的在途登记表已经空了。
 * 两者都不该让需求永远停在"等人"上——**宁可多跑一轮，也不要静默停摆**。
 */
async function reconcileAwaitingStops(deps: WakeHeartbeatDeps, out: WakeTickResult, now: number): Promise<void> {
  if (deps.dialogInFlight === undefined) return
  const all = await openRequirementsOf(deps)
  for (const req of all) {
    if (!isAwaitingConfirmStop(req)) continue
    let waiting = false
    try { waiting = deps.dialogInFlight(req.id) === true } catch { waiting = false }
    if (waiting) { out.skipped.push(req.id); continue }
    try {
      await exitAwaitingConfirm(
        {
          store: deps.store,
          now: () => now,
          ...(deps.logger === undefined ? {} : { logger: deps.logger }),
          // REQ-261006170150-52cc FR-3：清位成功即请求一次驱动（`notifyDrivable` 缺省 = 未装配 →
          // 只写台账不驱动，行为与改造前逐字一致）。**没有它，"过期后自动恢复"只恢复了一半**：
          // 停手位清了，却没有人把 agent 叫起来。
          ...(deps.notifyDrivable === undefined ? {} : { onCleared: deps.notifyDrivable }),
        },
        { requirementId: req.id, reason: 'expired' },
      )
      out.resumed.push(req.id)
    } catch (err) {
      // 写失败不阻断既有唤醒趟：保留停手位，下一趟重试
      deps.logger?.warn('wake-heartbeat: 停手对账恢复失败（需求=' + req.id + '）', err)
    }
  }
}

/** 创建心跳：`tick()` 一趟对账（可被定时器或看板手动触发）。 *//**
 * t8/B11：心跳的「开放需求」读 —— **先摘要筛、再按需取整条**。
 *
 * 为什么必须取整条：`isStalledWake` / `isAwaitingConfirmStop` 要读 `advance` 等字段，
 * 而摘要（`RequirementSummary`）里没有它们。所以这里不做全表取整条，只取**筛出来的开放需求**。
 */
async function openRequirementsOf(deps: WakeHeartbeatDeps): Promise<RequirementRecord[]> {
  const store = requirementStoreOf(deps)
  const page = await store.listSummaries({ scope: 'active' })
  const out: RequirementRecord[] = []
  for (const s of page.items) {
    if (!isOpenRequirement(s)) continue
    const rec = await store.get(s.id)
    if (rec !== undefined) out.push(rec)
  }
  return out
}

export function createWakeHeartbeat(deps: WakeHeartbeatDeps): { tick: () => Promise<WakeTickResult> } {
  const staleMs = deps.staleMs ?? DEFAULT_STALE_MS
  const maxFailures = deps.maxFailures ?? DEFAULT_MAX_FAILURES
  async function tick(): Promise<WakeTickResult> {
    const now = deps.now()
    const out: WakeTickResult = { woken: [], failed: [], paused: [], skipped: [], resumed: [] }
    // ── ⓪ 全局闩在闸：整趟不动（FR-1）──────────────────────────────────────────
    // 为什么放在最前：额度/鉴权类故障下，"叫醒"一定是无效动作；而且本趟若照常跑，
    // 成功的 wake 会把既有的运行时暂停位重置成 healthy（见 writeWake）——那是第二个复活点。
    let latchOpen = false
    try { latchOpen = deps.providerLatchOpen?.() === true } catch { latchOpen = false }
    if (latchOpen) return out
    // ── ① 停手对账（REQ-261002141430-a5ef FR-4④）：**先清残影，再叫醒** ──────────────
    // 病因：人在弹框前离开（TTL 过期）、或插件重启把内存登记表丢了 —— 台账上还写着"停手等弹框"，
    // 而实际上没有任何弹框在等。这一趟把它恢复，否则该需求永远不会再被唤醒（静默停摆）。
    await reconcileAwaitingStops(deps, out, now)
    const all = await openRequirementsOf(deps)
    for (const req of all) {
      if (!isDrivableRequirement(req) || !isStalledWake(req, now, staleMs)) { out.skipped.push(req.id); continue }
      let ok = false
      try {
        ok = await deps.wake(req.id)
      } catch (err) {
        ok = false
        deps.logger?.warn('wake-heartbeat: 唤醒抛错（需求=' + req.id + '）', err)
      }
      if (ok) {
        out.woken.push(req.id)
        await writeWake(deps, req.id, true, maxFailures, now)
      } else {
        out.failed.push(req.id)
        const res = await writeWake(deps, req.id, false, maxFailures, now)
        if (res === 'paused') out.paused.push(req.id)
      }
    }
    return out;
  }
  return { tick }
}

/**
 * 写一次唤醒结果。成功 → lastWakeAt=now、attempts 归零、健康回 healthy；
 * 失败 → attempts+1，达上限则 health=paused（reason=wake-undeliverable）并留 comment。
 * **activation 在任何分支都不被改写**。
 */
async function writeWake(
  deps: WakeHeartbeatDeps, requirementId: string, ok: boolean, maxFailures: number, now: number,
): Promise<'ok' | 'retry' | 'paused' | 'none'> {
  let outcome: 'ok' | 'retry' | 'paused' | 'none' = 'none'
  const res = await mutateIfPresent(requirementStoreOf(deps), requirementId, (r) => {
    if (r.dive === undefined) return undefined
    if (ok) {
      r.dive.lastWakeAt = now
      r.dive.lastActiveAt = now
      // ⚠️ FR-3 的第二个复活点（本仓修前实测）：成功唤醒**不得**把运行时的暂停位重置成 healthy。
      // 修前是无条件 `driverHealth = { state: 'healthy', … }` —— 只要唤醒成功一次，
      // 之前写下的 `agent-error` / `upstream-auth` 停手位就被抹掉，驱动随即被重新允许起轮。
      // 现在只清**本组件自己**写下的暂停（wake-undeliverable）：那是"叫不醒"的账，叫醒了才该销。
      const health = r.dive.driverHealth
      if (health === undefined) {
        // 无健康位（旧记录/从未暂停）→ 不凭空造一个。
      } else if (health.state === 'healthy') {
        health.attempts = 0
      } else if (health.reason === 'wake-undeliverable') {
        r.dive.driverHealth = { state: 'healthy', since: now, attempts: 0 }
      } else {
        // 其它病因（agent-error / upstream-auth / round-limit…）的停手位**保持原样**：
        // 唤醒受理 ≠ 病因消失。恢复走 recoverHealth / 人显式「继续」两条既有通道。
      }
      outcome = 'ok'
    } else {
      const attempts = (r.dive.driverHealth?.attempts ?? 0) + 1
      if (attempts >= maxFailures) {
        r.dive.driverHealth = { state: 'paused', reason: 'wake-undeliverable', since: now, attempts }
        r.comments.push({ id: 'c-dive-heartbeat-' + now, body: '[dive-diag] 连续 ' + attempts + ' 次唤醒都没叫动（该跑却停着）→ 运行时健康已转 paused（原因 wake-undeliverable）。人的意图未变：修好链路后点看板「继续」或确认推进即可恢复。', createdAt: now, createdBy: { kind: 'system' } })
        outcome = 'paused'
      } else {
        r.dive.driverHealth = { ...(r.dive.driverHealth ?? { state: 'healthy' as const }), attempts }
        outcome = 'retry'
      }
    }
    r.updatedAt = now
    return { changed: true }
  })
  if (res === undefined) return 'none'
  return outcome
}
