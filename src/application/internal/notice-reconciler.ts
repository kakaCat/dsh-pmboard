/**
 * 易变段**协调层**（REQ-261007100513-6749 t3 ← FR-2 / FR-3；2026-10-08 复核 P1-A / P1-B 后新增）。
 *
 * 为什么必须有这一层：复核证据——「头部整段让位」若只看**窗口级一个布尔**，而生产者只有
 * `MoveTask` / `MoveRequirement` / 待捕获登记三处，那么 `MoveTask → rollup（implementing→accepting）`
 * 这类**没有窗口可通知**的推进（看板路由 / confirm-settle / verdicts 同理）就会静默丢纪律。
 * 修法不是"把生产者穷举全"，而是**状态比对**：谁改的不重要，改了就会被下一次协调算出来。
 *
 * ── 三条职责 ──────────────────────────────────────────────────────────────────
 * ① **覆盖（reconcile）**：重算易变段 → 与「已送出」比对 → 差异交给传输层
 *    （`notice-delivery.ts`：去重 / 分槽去抖 / 到期冲刷）。触发点：
 *      · **写路径**（生产者调 `notify` / `notifyVolatileQuietly`）——不受额度限制；
 *      · **装配缝**（`available()`，每次 system prompt 装配前必被同步调用）——每回合一次；
 *      · **回合末**（`noteTurnEnded()`，由会话驱动的 turn/end 转来）——每回合一次。
 *    为什么不用 `agent/pre-step`：那是**dispatch 型**事件，round 驱动已在自己的作用域里注册了
 *    认领栅栏（`round-subscriptions.ts` 把它的返回值当作整步的放行/reject 决定）——再挂一个
 *    监听器会插进那条决策链（返回 undefined 可能被当成"无决定"）。故选**装配缝 + turn/end**
 *    这两个**纯 emit** 位置：代价是"装配缝之后的变更要等下一次装配/回合末才补投"，而 `next-step`
 *    的 prepend 在**同一回合的后续 step** 就会被模型读到，故不构成"纪律迟到一回合"。
 * ② **到达确认（P1-B）**：传输层的回执只表示**送出**；本层等 host 的 `agent/inbox/claimed`
 *    确认**到达**才置「头部让位」。用户 stop / cancel 会清空 inbox（host 会发
 *    `agent/inbox/discarded`）→ 本层**清在途 + 忘掉那次送出**，下一次协调补投，**未确认期间头部
 *    继续承载该段**（不静默丢）。
 * ③ **头部让位 = 一次性、永久**（P1-A）：首次确认送达后，该窗口头部**永久**不再装载易变段
 *    （成本 = 每窗口 1 次头部重写，符合 FR-1）。**不**按"当前内容哈希 == 已投哈希"逐段决定——
 *    那样每次变更头部都要重写一次，等于没省。唯一回收路径 = **迟滞**：连续
 *    `LIMITS.noticeReclaimAfterFailures` 次失败/被丢弃才把让位收回（P2-3），避免通道抖动放大头部重写。
 *
 * @module dsh-pmboard/application/internal/notice-reconciler
 */

import { LIMITS } from '../../domain/limits.js'
import { fmt } from '../../domain/text/fmt.js'
import type { NoticeDeliveryResult } from '../../shared/protocol.js'
import type { VolatileNoticePort } from '../ports.js'
import type { NoticeDelivery, NoticeDeliveryOutcome } from './notice-delivery.js'
import type { VolatileNotice, VolatileNoticeKind } from './volatile-notice.js'

/** `kind` 缺省时要扫的类别（不含 capture：那是**未绑定窗口**的一次性提示，必须显式声明）。 */
const DEFAULT_KINDS: readonly VolatileNoticeKind[] = ['status', 'task', 'stage']

export interface NoticeReconcilerDeps {
  delivery: NoticeDelivery
  /** 同步内容投影（与传输层的同一个函数：写路径与新内容都以它为准）。 */
  contentFor(windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined
  /**
   * 空态补投正文（**阶段判据在这里**，复核 P2-5）：只有"该窗口的进行中需求处于 implementing
   * 且当前无在制任务"时才产出一段；其余情况返回 `undefined` = 不补投。缺省 = 不补投（安全侧）。
   */
  emptyNoticeFor?(windowKey: string): VolatileNotice | undefined
  now(): number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** 空态补投窗口（缺省 `LIMITS.noticeEmptySettleMs`）。 */
  emptySettleMs?: number
  /** 连续失败/被丢弃多少次后回收头部让位（缺省 `LIMITS.noticeReclaimAfterFailures`）。 */
  reclaimAfterFailures?: number
  diagnose?(message: string): void
}

export interface NoticeReconciler extends VolatileNoticePort {
  /** 差异协调（写路径入口，同步）。 */
  reconcile(windowKey: string, kind?: VolatileNoticeKind): NoticeDeliveryResult
  /**
   * 装配缝入口（同步、**永不抛**）：先协调差异（受"每回合一次"额度约束），再回答头部能不能让位。
   * ⚠️ 它有**副作用**（补投差异）——因为它是唯一每回合必经的同步点；这一点写在契约里。
   */
  available(windowKey: string): boolean
  /** 传输层送出回执（`NoticeDeliveryDeps.onOutcome` 转发）。 */
  noteSent(outcome: NoticeDeliveryOutcome): void
  /** 到达确认（host 的 `agent/inbox/claimed`）→ 记在途完成、清失败账、**置头部让位**。 */
  noteClaimed(windowKey: string, messageId: string): void
  /** 被丢弃（host 的 `agent/inbox/discarded`）→ 清在途 + 忘掉送出（下次补投）+ 记一次失败。 */
  noteDiscarded(windowKey: string, messageId: string): void
  /** 回合末（会话驱动的 turn/end）→ 推进回合号 + 扫一次差异。 */
  noteTurnEnded(windowKey: string): void
  /** 窗口销毁（host 的 `agent/disposed`）→ 清该窗口的定时器与状态（不留下无人回收的定时器）。 */
  forget(windowKey: string): void
  dispose(): void
}

interface InFlight { kind: VolatileNoticeKind }

interface WindowReconcileState {
  /** 头部让位闩（**首次确认送达**后永久置上；只有迟滞回收才摘）。 */
  sealed: boolean
  /** 连续失败/被丢弃次数（迟滞判据）。 */
  failures: number
  /** 送出但**未确认到达**的消息（messageId → 该条属于哪一段）。 */
  inFlight: Map<string, InFlight>
  emptySince?: number
  emptyTimer?: unknown
  /** 已完成的回合数（turn/end 递增）。 */
  turns: number
  /**
   * 最近一次钩子扫描用掉的**额度键**（见 `sweep`）：装配缝与回合末各用一套命名空间
   * （`a<回合号>` / `t<回合号>`）——否则"回合末扫一次"会被"下一回合装配前扫一次"顶掉额度。
   */
  hookSweptSlot: string | undefined
}

const short = (windowKey: string): string => windowKey.slice(0, 16)

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createNoticeReconciler(deps: NoticeReconcilerDeps): NoticeReconciler {
  const emptySettleMs = deps.emptySettleMs ?? LIMITS.noticeEmptySettleMs
  const reclaimAfter = deps.reclaimAfterFailures ?? LIMITS.noticeReclaimAfterFailures
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle: unknown): void => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  })
  const states = new Map<string, WindowReconcileState>()
  let disposed = false

  function diag(message: string): void {
    try { deps.diagnose?.(message) } catch { /* 诊断本身不许影响协调 */ }
  }

  function stateOf(windowKey: string): WindowReconcileState {
    let st = states.get(windowKey)
    if (st === undefined) {
      st = { sealed: false, failures: 0, inFlight: new Map(), turns: 0, hookSweptSlot: undefined }
      states.set(windowKey, st)
    }
    return st
  }

  function contentOf(windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined {
    try {
      return deps.contentFor(windowKey, kind)
    } catch (err) {
      diag(fmt('协调层内容投影抛错（按无内容处理；kind={kind}，windowKey={w}）：{err}', {
        kind, w: short(windowKey), err: errText(err),
      }))
      return undefined
    }
  }

  function emptyFor(windowKey: string): VolatileNotice | undefined {
    try {
      return deps.emptyNoticeFor?.(windowKey)
    } catch (err) {
      diag(fmt('空态判据抛错（按不补投处理；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
      return undefined
    }
  }

  // ── 差异协调 ───────────────────────────────────────────────────────────────

  function flushEmpty(windowKey: string): void {
    if (disposed) return
    const st = stateOf(windowKey)
    st.emptyTimer = undefined
    if (st.emptySince === undefined) return
    st.emptySince = undefined
    const notice = emptyFor(windowKey)
    if (notice === undefined) return
    // 空态补投的正文**不由 contentFor 产出**（它与三态契约互斥），故走立即送（不参与冲刷前重投影）。
    deps.delivery.sendImmediate(windowKey, notice)
  }

  function armEmpty(windowKey: string): void {
    const st = stateOf(windowKey)
    if (st.emptyTimer !== undefined) clearTimer(st.emptyTimer)
    const due = (st.emptySince ?? deps.now()) + emptySettleMs
    st.emptyTimer = setTimer(() => {
      try {
        flushEmpty(windowKey)
      } catch (err) {
        diag(fmt('空态补投抛错（已兜住；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
      }
    }, Math.max(0, due - deps.now()))
  }

  /**
   * 空态策略：**不单独投递**，只登记起点 + 挂一次补投定时器。
   * 复核 P2-2：内容未变（这条空态消息已经送出过）必须**零副作用**——不重排定时器（那会把补投
   * 无限推后），也不重设起点。
   */
  function syncEmpty(windowKey: string): void {
    const st = stateOf(windowKey)
    const notice = emptyFor(windowKey)
    if (notice === undefined) {
      // 有在制任务（或该窗口不该谈空态）→ 空态结束
      if (st.emptyTimer !== undefined) {
        clearTimer(st.emptyTimer)
        st.emptyTimer = undefined
      }
      st.emptySince = undefined
      return
    }
    if (deps.delivery.isSent(windowKey, notice.kind, notice.text)) return // 已说过 → 零副作用
    if (st.emptySince !== undefined) return // 已在计时中 → **不重排**（P2-2）
    st.emptySince = deps.now()
    armEmpty(windowKey)
  }

  function syncKind(windowKey: string, kind: VolatileNoticeKind): NoticeDeliveryResult | undefined {
    const notice = contentOf(windowKey, kind)
    if (notice === undefined) return undefined
    if (deps.delivery.isSent(windowKey, kind, notice.text)) return undefined // 无差异
    return deps.delivery.submit(windowKey, notice)
  }

  /** 扫全部类别（+空态策略）。`slot` 仅用于钩子驱动扫描的额度记账。 */
  function sweep(windowKey: string, slot?: string): NoticeDeliveryResult {
    const st = stateOf(windowKey)
    if (slot !== undefined) {
      if (st.hookSweptSlot === slot) {
        return { delivered: false, channel: 'inbox-next-step', reason: '本回合该额度位已扫过（钩子抖动合并）' }
      }
      st.hookSweptSlot = slot
    }
    let last: NoticeDeliveryResult = { delivered: false, channel: 'inbox-next-step', reason: '无差异（已送出/无内容）' }
    for (const kind of DEFAULT_KINDS) {
      const r = syncKind(windowKey, kind)
      if (r !== undefined) last = r
    }
    syncEmpty(windowKey)
    return last
  }

  // ── 失败账与让位闩 ─────────────────────────────────────────────────────────

  function countFailure(windowKey: string, why: string): void {
    const st = stateOf(windowKey)
    st.failures += 1
    diag(fmt('尾部通道未确认（windowKey={w}，连续 {n} 次）：{why}', { w: short(windowKey), n: st.failures, why }))
    if (st.sealed && st.failures >= reclaimAfter) {
      st.sealed = false
      st.failures = 0
      diag(fmt('尾部连续 {n} 次未确认 → **回收头部让位**（纪律交回头部承载，复核 P2-3 迟滞）', { n: reclaimAfter }))
    }
  }

  return {
    reconcile(windowKey: string, kind?: VolatileNoticeKind): NoticeDeliveryResult {
      try {
        if (disposed) {
          return { delivered: false, channel: 'system-prompt-fallback', reason: '协调层已停用（dispose）' }
        }
        if (kind !== undefined) {
          const r = syncKind(windowKey, kind) ?? { delivered: false, channel: 'inbox-next-step', reason: fmt('本窗口无 {kind} 段内容（不投空段）', { kind }) }
          syncEmpty(windowKey)
          return r
        }
        return sweep(windowKey)
      } catch (err) {
        // 兜底（理论上不可达）：**永不抛**是端口契约。
        diag(fmt('协调层抛错（已兜住，不冒泡；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
        return { delivered: false, channel: 'system-prompt-fallback', reason: fmt('协调层异常（已兜住）：{err}', { err: errText(err) }) }
      }
    },

    async notify(windowKey: string, kind?: VolatileNoticeKind): Promise<NoticeDeliveryResult> {
      return this.reconcile(windowKey, kind)
    },

    /**
     * 装配缝：**先补投差异，再回答头部能不能让位**。
     * 让位判据 = `sealed`（**到达确认过**才置上，且一次性永久）——不在这里逐段比哈希（那样每次
     * 变更头部都要重写，等于没省），也不给"就绪布尔"留任何抖动空间。
     */
    available(windowKey: string): boolean {
      try {
        sweep(windowKey, 'a' + (stateOf(windowKey).turns + 1))
        return stateOf(windowKey).sealed === true
      } catch (err) {
        diag(fmt('易变段让位判定抛错 → 按不让位处理（回落整段）：{err}', { err: errText(err) }))
        return false
      }
    },

    noteSent(outcome: NoticeDeliveryOutcome): void {
      try {
        const st = stateOf(outcome.windowKey)
        if (outcome.channel === 'inbox-next-step' && outcome.delivered && outcome.messageId !== undefined) {
          // 送出了 ≠ 到达：挂着等 host 的 claimed（P1-B）。
          st.inFlight.set(outcome.messageId, { kind: outcome.kind })
          return
        }
        if (!outcome.delivered) {
          // 抛错：内容没进任何地方 → 记一次失败（迟滞）。
          countFailure(outcome.windowKey, outcome.reason ?? '投递抛错')
          return
        }
        // 降级（退回头部）：内容由头部承载，**不算到达**（故不上闩），也不计失败。
      } catch (err) {
        diag(fmt('送出回执处理抛错（已兜住）：{err}', { err: errText(err) }))
      }
    },

    noteClaimed(windowKey: string, messageId: string): void {
      try {
        const st = stateOf(windowKey)
        if (!st.inFlight.has(messageId)) return // 不是我送出的消息（别人的回合消息等）
        st.inFlight.delete(messageId)
        st.failures = 0
        if (!st.sealed) {
          st.sealed = true
          diag(fmt('尾部通道**首次确认送达**（windowKey={w}）→ 头部永久让位（每窗口只此一次头部重写）', {
            w: short(windowKey),
          }))
        }
      } catch (err) {
        diag(fmt('到达确认处理抛错（已兜住）：{err}', { err: errText(err) }))
      }
    },

    noteDiscarded(windowKey: string, messageId: string): void {
      try {
        const st = stateOf(windowKey)
        const flight = st.inFlight.get(messageId)
        if (flight === undefined) return // 不是我送出的消息
        st.inFlight.delete(messageId)
        // 忘掉"已送出" → 下一次协调（装配缝/回合末/写路径）会**补投**这一段（不静默丢）。
        deps.delivery.drop(windowKey, flight.kind)
        countFailure(windowKey, fmt('消息被丢弃（messageId={id}）', { id: messageId }))
      } catch (err) {
        diag(fmt('丢弃处理抛错（已兜住）：{err}', { err: errText(err) }))
      }
    },

    noteTurnEnded(windowKey: string): void {
      try {
        if (disposed) return
        const st = stateOf(windowKey)
        st.turns += 1
        sweep(windowKey, 't' + st.turns)
      } catch (err) {
        diag(fmt('回合末协调抛错（已兜住；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
      }
    },

    forget(windowKey: string): void {
      try {
        const st = states.get(windowKey)
        if (st === undefined) return
        if (st.emptyTimer !== undefined) clearTimer(st.emptyTimer)
        states.delete(windowKey)
      } catch (err) {
        diag(fmt('窗口清理抛错（已兜住）：{err}', { err: errText(err) }))
      }
    },

    dispose(): void {
      disposed = true
      for (const st of states.values()) {
        if (st.emptyTimer !== undefined) clearTimer(st.emptyTimer)
        st.emptyTimer = undefined
      }
    },
  }
}

/**
 * 写路径的**投递意图**（生产者接线）：即发即忘、**永不抛**、**不 await 成功语义**。
 *
 * 为什么收口在一处：「端口未装配 = 零行为」与「端口抛错不许影响写路径」必须同处表达，散在多个
 * 调用点就会漏掉一处（漏掉的那处把 turn 炸掉，比丢一段提示严重得多）。
 */
export function notifyVolatileQuietly(
  port: VolatileNoticePort | undefined,
  windowKey: string,
  kind?: VolatileNoticeKind,
): void {
  if (port === undefined || windowKey.length === 0) return
  try {
    const p = kind === undefined ? port.notify(windowKey) : port.notify(windowKey, kind)
    void p?.catch(() => { /* 端口契约永不抛；这里是最后一道（诊断在协调侧） */ })
  } catch {
    // 连调用都抛（端口实现违约）：写路径照走，不因通知失败回滚已落账的状态。
  }
}
