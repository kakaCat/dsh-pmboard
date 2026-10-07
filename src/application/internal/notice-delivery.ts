/**
 * 易变段尾部**传输层**（REQ-261007100513-6749 t3 ← FR-2 / FR-3；2026-10-08 复核后与协调层分家）。
 *
 * 本模块只回答一件事：**一段正文怎么送到窗口尾部**——内容哈希去重 → 分槽去抖（窗口表见
 * `DEBOUNCE_MS_BY_KIND`）→ **到期由可注入定时器冲刷** → `sink.deliver`（`inbox.prepend('next-step')`）
 * → 送出/降级/抛错如实回报 + 注入留痕。它**不**回答：
 *   · 什么时候扫一遍差异、哪些段变了 → 协调层（`notice-reconciler.ts`）；
 *   · 消息**到没到达**、头部能不能让位 → 协调层（本层回执只表示**送出**，到达由 host 的
 *     `agent/inbox/claimed` 确认，见复核 P1-B）；
 *   · 空态补投策略 → 协调层。
 *
 * ── 硬纪律 ────────────────────────────────────────────────────────────────────
 * ① **永不抛**：投递失败不是写路径的失败（状态已落账，回滚 = 状态倒退）。`submit` / 冲刷回调 /
 *    `sendImmediate` 都收口成 `NoticeDeliveryResult` 或回执回调，绝不冒泡（含"投递器抛错"）。
 * ② **到期冲刷者在本模块**：窗口可能长时间空闲——不能等"下一次写路径恰好到来"，也不能指望
 *    system prompt 的**同步**装配缝（那里不能 await、拿不到结果）。故自带**可注入定时器**
 *    （缺省 `setTimeout`）；同一窗口同一 kind 只留一个未决定时器。⚠️ 回调里**不起 agent loop**：
 *    只 `inbox.prepend`（`followup` / `deliver` 这类"新起一整轮"的投递在本模块**不存在**）。
 * ③ **冲刷前重新投影**（复核 P2-1）：到期时**重新算当前正文**再比对——待发正文可能已被更新的内容
 *    取代。当前无内容（该段已消失，如任务块没了）→ **丢弃待发**，绝不投一段已经消失的正文。
 * ④ **送出不是到达**：`lastSent` 在**送出**时即记（防同一内容重复送）；消息被丢弃时由协调层调
 *    `drop()` 忘掉它，下一次协调即可补投。
 *
 * 留痕：真进尾部 → `origin='system-notice'`；降级退回头部 → `origin='system-prompt'`。
 *
 * @module dsh-pmboard/application/internal/notice-delivery
 */

import { LIMITS } from '../../domain/limits.js'
import { fmt } from '../../domain/text/fmt.js'
import type { NoticeDeliveryResult } from '../../shared/protocol.js'
import { injectionLogInputForNotice, type InjectionLogPort } from './injection-log.js'
import {
  noticeHash,
  pickDebounced,
  type PendingNoticeSlots,
  type VolatileNotice,
  type VolatileNoticeKind,
} from './volatile-notice.js'

/** 尾部通道的投递器（唯一实现 = `adapters/VolatileNoticeAdapter.ts`）。 */
export interface NoticeDeliverySink {
  /** 就绪探测（同步；**不得抛**，抛错由编排兜住）。 */
  canDeliver(windowKey: string): boolean
  /** prepend 正文（同步，**不 await 一轮**）；成功回 `messageId`（到达确认靠它），失败回 `ok:false`。 */
  deliver(windowKey: string, notice: VolatileNotice): { ok: true; messageId: string } | { ok: false; reason: string }
}

/** 一次**送出**的回执（不等于到达；到达 = host 的 `agent/inbox/claimed`）。 */
export interface NoticeDeliveryOutcome {
  windowKey: string
  kind: VolatileNoticeKind
  /** 送出的正文哈希（协调层用它对齐"这一条对应哪次变更"）。 */
  hash: string
  /** 尾部消息 id（降级/抛错时无）。 */
  messageId?: string
  delivered: boolean
  channel: 'inbox-next-step' | 'system-prompt-fallback'
  reason?: string
}

/**
 * **按 kind 的去抖窗口表（单一落点）**：窗口的收益是「把**翻版**并成一次」，只有会翻版的段才吃得到；
 * 对一次性事件，窗口是纯延迟（2026-10-07 评审裁定）。
 *
 *   · `capture` = 0：命中提示的意义是让窗口**在本回合**先做显式裁定（P0 纪律）；它「每条用户消息
 *     一次 + 内容哈希去重」，从不翻版 —— 30s 零合并收益、纯延迟（迟到一回合 = 纪律落空）。
 *   · `stage` = 0：阶段推进同样是一次性事件、无翻版形态；迟到 = 新阶段纪律晚一回合到。
 *   · `task` / `status` = `LIMITS.noticeDebounceMs`（30_000）：实测往返 16s / 24s / 71s，30s 才能
 *     把「同一分钟内来回翻一次」并成一次；30_000 的单一落点仍在 `domain/limits.ts`。
 *
 * `0` 不是"窗口为零所以永不投递"，而是 `isDebounceWindowExpired` 已定义的**立即到期**（关闭去抖）；
 * 投递仍发生在**定时器回调**里（异步边界，且不起 agent loop）。
 */
export const DEBOUNCE_MS_BY_KIND: Readonly<Record<VolatileNoticeKind, number>> = {
  capture: 0,
  stage: 0,
  task: LIMITS.noticeDebounceMs,
  status: LIMITS.noticeDebounceMs,
}

export interface NoticeDeliveryDeps {
  sink: NoticeDeliverySink
  /** 同步内容投影：**冲刷前重投影**用（复核 P2-1）。 */
  contentFor(windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined
  now(): number
  /** 定时器注入（缺省 `setTimeout`）：测试传假定时器即可**不真等**窗口地验冲刷。 */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** 摘要函数（输入是**规范化后**的正文）：缺省 FNV-1a 32 位；组合根注入 **sha1**（复核 P2-4）。 */
  hashOf?: (canonical: string) => string
  /** **覆盖全表**的去抖窗口（缺省 = 用 `DEBOUNCE_MS_BY_KIND`；`<=0` = 显式关闭去抖）。 */
  debounceMs?: number
  injectionLog?: InjectionLogPort
  /** 每次送出/降级/抛错的回执（**不判断到达**）——协调层据此记在途与置头部让位。 */
  onOutcome?(outcome: NoticeDeliveryOutcome): void
  /** 诊断（装配点接 `captureDiag`）：失败/降级要留痕，**不许静默**。 */
  diagnose?(message: string): void
}

export interface NoticeDelivery {
  /** 提交待发段（去重 → 分槽去抖 → 到期由定时器冲刷）。返回值只是**登记/去重**回执。 */
  submit(windowKey: string, notice: VolatileNotice): NoticeDeliveryResult
  /** 立即送（不排窗口；用于"该说了就得马上说"的段，如空态补投）。仍走去重。 */
  sendImmediate(windowKey: string, notice: VolatileNotice): NoticeDeliveryResult
  /** 该正文是否**送出过**（含降级到头部）。 */
  isSent(windowKey: string, kind: VolatileNoticeKind, text: string): boolean
  /** 立即冲刷该 kind 的待发（装配前/回合末）；无待发则无操作。 */
  flush(windowKey: string, kind: VolatileNoticeKind): void
  /** 作废待发 + **忘掉已送出**（消息被丢弃时用：下一次协调才会补投）。 */
  drop(windowKey: string, kind: VolatileNoticeKind): void
  /** 清掉全部未决定时器（插件卸载）；之后不再排定时器。 */
  dispose(): void
}

interface WindowSlotState {
  slots: PendingNoticeSlots
  timers: Map<VolatileNoticeKind, unknown>
  /** 已**送出**（不确定到达）的内容哈希。 */
  lastSent: Map<VolatileNoticeKind, string>
}

/** 只看前 16 位（窗口展示口径，与 capture-section 一致）。 */
const short = (windowKey: string): string => windowKey.slice(0, 16)

/** 错误文本（`unknown` → string；诊断与回执共用）。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createNoticeDelivery(deps: NoticeDeliveryDeps): NoticeDelivery {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle: unknown): void => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  })
  const states = new Map<string, WindowSlotState>()
  let disposed = false

  const windowFor = (kind: VolatileNoticeKind): number => deps.debounceMs ?? DEBOUNCE_MS_BY_KIND[kind]
  const hashOf = (text: string): string => noticeHash(text, deps.hashOf)

  function diag(message: string): void {
    try { deps.diagnose?.(message) } catch { /* 诊断本身不许影响投递 */ }
  }

  function recordLog(windowKey: string, text: string, delivered: boolean, origin: 'system-notice' | 'system-prompt'): void {
    try {
      deps.injectionLog?.record(injectionLogInputForNotice({ windowKey, text, delivered, origin }))
    } catch (err) {
      diag(fmt('注入留痕写入失败（只告警，不影响投递）：{err}', { err: errText(err) }))
    }
  }

  function stateOf(windowKey: string): WindowSlotState {
    let st = states.get(windowKey)
    if (st === undefined) {
      st = { slots: new Map(), timers: new Map(), lastSent: new Map() }
      states.set(windowKey, st)
    }
    return st
  }

  function contentOf(windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined {
    try {
      return deps.contentFor(windowKey, kind)
    } catch (err) {
      diag(fmt('易变段内容投影抛错（按无内容处理；kind={kind}，windowKey={w}）：{err}', {
        kind, w: short(windowKey), err: errText(err),
      }))
      return undefined
    }
  }

  function canDeliver(windowKey: string): boolean {
    try {
      return deps.sink.canDeliver(windowKey) === true
    } catch (err) {
      diag(fmt('尾部通道就绪判定抛错（按不可用处理；windowKey={w}）：{err}', {
        w: short(windowKey), err: errText(err),
      }))
      return false
    }
  }

  /** 只清该 kind 的待发与定时器（不动 `lastSent`）。 */
  function dropPending(windowKey: string, kind: VolatileNoticeKind): void {
    const st = states.get(windowKey)
    if (st === undefined) return
    const handle = st.timers.get(kind)
    if (handle !== undefined) {
      st.timers.delete(kind)
      clearTimer(handle)
    }
    if (st.slots.has(kind)) {
      const rest = new Map(st.slots); rest.delete(kind); st.slots = rest
    }
  }

  /** 排一次到期冲刷；同一窗口同一 kind 只留一个未决定时器（重排前先清旧的**定时器**——待发正文要留）。 */
  function scheduleFlush(windowKey: string, kind: VolatileNoticeKind, dueAt: number): void {
    const st = stateOf(windowKey)
    const old = st.timers.get(kind)
    if (old !== undefined) {
      st.timers.delete(kind)
      clearTimer(old)
    }
    const handle = setTimer(() => {
      // 定时器回调是**异步边界**：这里出错没人接，故整体兜住（且只 prepend，不起 agent loop）。
      try {
        flush(windowKey, kind)
      } catch (err) {
        diag(fmt('易变段到期冲刷抛错（已兜住；kind={kind}，windowKey={w}）：{err}', {
          kind, w: short(windowKey), err: errText(err),
        }))
      }
    }, Math.max(0, dueAt - deps.now()))
    st.timers.set(kind, handle)
  }

  /** **唯一送出出口**（永不抛）：送出/降级/抛错如实回报，并在送出后作废同 kind 待发。 */
  function send(windowKey: string, notice: VolatileNotice): NoticeDeliveryResult {
    const st = stateOf(windowKey)
    const kind = notice.kind
    const hash = hashOf(notice.text)
    let receipt: NoticeDeliveryResult
    let messageId: string | undefined
    if (!canDeliver(windowKey)) {
      receipt = {
        delivered: true,
        channel: 'system-prompt-fallback',
        reason: fmt('窗口 {w} 不在线 / 尾部通道未就绪（退回头部注入）', { w: short(windowKey) }),
      }
    } else {
      try {
        const r = deps.sink.deliver(windowKey, notice)
        if (r.ok) {
          messageId = r.messageId
          receipt = { delivered: true, channel: 'inbox-next-step' }
        } else {
          receipt = { delivered: true, channel: 'system-prompt-fallback', reason: r.reason }
        }
      } catch (err) {
        // 最坏形态：投递器抛错。**不冒泡**（写路径已落账），如实回 delivered:false。
        receipt = {
          delivered: false, channel: 'system-prompt-fallback',
          reason: fmt('尾部投递抛错（已兜住，不冒泡）：{err}', { err: errText(err) }),
        }
      }
    }
    if (receipt.delivered) {
      // 送出即记（含降级：下一次装配的回落整段会把它照投）——只有抛错时**不记**，下次仍该重试。
      st.lastSent.set(kind, hash)
      recordLog(windowKey, notice.text, true, receipt.channel === 'inbox-next-step' ? 'system-notice' : 'system-prompt')
    } else {
      recordLog(windowKey, notice.text, false, 'system-prompt')
    }
    if (receipt.channel === 'system-prompt-fallback') {
      diag(fmt('易变段降级（windowKey={w}，kind={kind}）：{reason}', {
        w: short(windowKey), kind, reason: receipt.reason ?? '',
      }))
    }
    // 复核 P2-1：送出后**作废同 kind 待发**——否则更旧的待发正文会在到期时后到（会话倒挂）。
    dropPending(windowKey, kind)
    try {
      deps.onOutcome?.({
        windowKey, kind, hash, delivered: receipt.delivered, channel: receipt.channel,
        ...(messageId === undefined ? {} : { messageId }),
        ...(receipt.reason === undefined ? {} : { reason: receipt.reason }),
      })
    } catch (err) {
      diag(fmt('送出回执回调抛错（已兜住）：{err}', { err: errText(err) }))
    }
    return receipt
  }

  /** 到期冲刷：取出该槽待发，**重新投影当前正文**再送（复核 P2-1）。 */
  function flush(windowKey: string, kind: VolatileNoticeKind): void {
    if (disposed) return
    const st = stateOf(windowKey)
    st.timers.delete(kind)
    const pending = st.slots.get(kind)
    if (pending === undefined) return
    const rest = new Map(st.slots); rest.delete(kind); st.slots = rest
    const fresh = contentOf(windowKey, kind)
    if (fresh === undefined) {
      // 该段已消失（如任务块没了）→ **不投旧正文**（复核点名：不许把已消失的任务块投出去）。
      diag(fmt('冲刷时该段已无内容 → 丢弃待发（不投已消失的正文；kind={kind}，windowKey={w}）', {
        kind, w: short(windowKey),
      }))
      return
    }
    if (hashOf(fresh.text) === st.lastSent.get(kind)) return
    send(windowKey, fresh)
  }

  function submit(windowKey: string, notice: VolatileNotice): NoticeDeliveryResult {
    try {
      if (disposed) {
        return { delivered: false, channel: 'system-prompt-fallback', reason: '传输层已停用（dispose）' }
      }
      const st = stateOf(windowKey)
      const kind = notice.kind
      if (st.lastSent.get(kind) === hashOf(notice.text)) {
        // 去重命中：不投、不排定时器、不写留痕（interfaces.md §端口失败语义）。
        return { delivered: false, channel: 'inbox-next-step', reason: '内容未变（去重命中）' }
      }
      if (!canDeliver(windowKey)) {
        // 通道不可得：**不排定时器**（排了也只是白等一次到期），立即降级并留痕。
        return send(windowKey, notice)
      }
      st.slots = pickDebounced(st.slots, notice, deps.now(), windowFor(kind))
      const pending = st.slots.get(kind)
      if (pending === undefined) {
        // 不可达：pickDebounced 必写 incoming.kind 槽。走到这里说明纯函数被改坏 → 响亮抱怨，不假装投了。
        return { delivered: false, channel: 'system-prompt-fallback', reason: fmt('内部错误：去抖未登记 {kind} 槽（未投递）', { kind }) }
      }
      scheduleFlush(windowKey, kind, pending.since + Math.max(0, windowFor(kind)))
      return {
        delivered: false,
        channel: 'inbox-next-step',
        reason: fmt('已登记尾部投递（kind={kind}；{ms}ms 后由定时器冲刷）', { kind, ms: windowFor(kind) }),
      }
    } catch (err) {
      // 兜底（理论上不可达）：**永不抛**是端口契约。
      diag(fmt('易变段传输层抛错（已兜住，不冒泡；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
      return { delivered: false, channel: 'system-prompt-fallback', reason: fmt('传输层异常（已兜住）：{err}', { err: errText(err) }) }
    }
  }

  return {
    submit,

    sendImmediate(windowKey: string, notice: VolatileNotice): NoticeDeliveryResult {
      try {
        if (disposed) {
          return { delivered: false, channel: 'system-prompt-fallback', reason: '传输层已停用（dispose）' }
        }
        const st = stateOf(windowKey)
        if (st.lastSent.get(notice.kind) === hashOf(notice.text)) {
          return { delivered: false, channel: 'inbox-next-step', reason: '内容未变（去重命中）' }
        }
        return send(windowKey, notice)
      } catch (err) {
        diag(fmt('易变段立即送抛错（已兜住；windowKey={w}）：{err}', { w: short(windowKey), err: errText(err) }))
        return { delivered: false, channel: 'system-prompt-fallback', reason: fmt('立即送异常（已兜住）：{err}', { err: errText(err) }) }
      }
    },

    isSent(windowKey: string, kind: VolatileNoticeKind, text: string): boolean {
      try {
        return states.get(windowKey)?.lastSent.get(kind) === hashOf(text)
      } catch {
        return false
      }
    },

    flush(windowKey: string, kind: VolatileNoticeKind): void {
      flush(windowKey, kind)
    },

    drop(windowKey: string, kind: VolatileNoticeKind): void {
      try {
        dropPending(windowKey, kind)
        states.get(windowKey)?.lastSent.delete(kind)
      } catch (err) {
        diag(fmt('作废待发抛错（已兜住）：{err}', { err: errText(err) }))
      }
    },

    dispose(): void {
      disposed = true
      for (const st of states.values()) {
        for (const handle of st.timers.values()) clearTimer(handle)
        st.timers.clear()
      }
    },
  }
}

/**
 * 写路径的**投递意图**（生产者接线）：即发即忘、**永不抛**、**不 await 成功语义**。
 *
 * 为什么收口在一处：「端口未装配 = 零行为」与「端口抛错不许影响写路径」必须同处表达，散在多个
 * 调用点就会漏掉一处（漏掉的那处把 turn 炸掉，比丢一段提示严重得多）。**实现**在协调层
 * （`notice-reconciler.ts`，写路径的语义入口），此处**转出**只为让既有 import 路径不变。
 */
export { notifyVolatileQuietly } from './notice-reconciler.js'
