/**
 * 面板刷新调度器（REQ-261001124111-5d36 t1）——**纯逻辑**：不 import React、不碰 DOM、不自持计时器实现。
 *
 * 为什么需要它（事故出处）：会话顶部的需求面板原来只在「展开」与「req.updatedAt 变化」时拉数据，
 * 而**任务级变化不改 req.updatedAt**（`MoveTask` 全文没有该写入），SSE 因此成为唯一通路；
 * SSE 一断（或页面跑的是还没有该订阅的旧 bundle），面板就无限期停在旧快照——
 * 用户看到的是「暂无任务」这种**假空态**（实测：服务端 19 张卡，面板显示 0）。
 * 本模块把「什么时候该再拉一次」收敛成一处可测逻辑：立即拉 + 周期兜底 + 事件加速。
 *
 * 不做什么：
 *  - **不管 UI**：成功/失败/陈旧跃迁一律经 `onData` / `onChange` / `subscribe` 交给宿主；
 *  - **不做请求层**：超时口径由注入的 `fetchOverview` 自己定（生产 =
 *    `api.fetchStageOverview` + `AbortSignal.timeout(8000)`，与既有 `/session/:id/progress` 轮询同款）；
 *  - **不退避**：失败仍按原周期重试——退避会让「越等越久才恢复」，与「≤5 秒出现新数据」的承诺冲突。
 *
 * @module dsh-pmboard/client/panel-refresh
 */
import type { StageOverview } from '../shared/protocol.js'

/** 轮询周期默认值（需求判定标准：≤5 秒）。 */
export const DEFAULT_REFRESH_MS = 5000
/** 陈旧阈值默认值（需求的「>30 秒未更新转警示」）。 */
export const DEFAULT_STALE_AFTER_MS = 30000
/** 失败原因进 UI 前的截断长度（防止把整篇堆栈塞进面板）。 */
export const MAX_ERROR_CHARS = 120

/** 触发一次刷新的原因（仅用于诊断与测试断言，不参与调度决策）。 */
export type RefreshReason = 'open' | 'timer' | 'event' | 'switch'

/**
 * 面板数据新鲜度（内存对象；不落盘、不进台账）。
 *
 * `stale` 是**派生值**：`fetchedAt` 缺失（从未成功）或已超 `staleAfterMs` 即为真——
 * 「没有数据」不得被当作「最新」，这正是本需求要消灭的假空态。
 */
export interface PanelFreshness {
  /** 最近一次**成功**拉取的时刻 */
  fetchedAt?: number
  /** 最近一次**尝试**的时刻（失败也有值） */
  lastAttemptAt?: number
  intervalMs: number
  staleAfterMs: number
  /** 连续失败次数（成功后归零） */
  failureCount: number
  /** 最近一次失败原因（≤MAX_ERROR_CHARS 字符） */
  lastError?: string
  inFlight: boolean
  stale: boolean
}

export interface PanelRefreshOptions {
  /** 注入的取数函数（宿主提供；本模块不关心它如何重试/超时） */
  fetchOverview: () => Promise<StageOverview>
  /** 成功取到数据（失败**不会**调用它——旧数据不得冒充新数据） */
  onData: (overview: StageOverview, freshness: PanelFreshness) => void
  /** 每次状态跃迁（成功/失败/陈旧翻转）通知宿主重渲染 */
  onChange: (freshness: PanelFreshness) => void
  /** 轮询周期；`0` = 只拉一次（一键回退旧行为） */
  intervalMs?: number
  staleAfterMs?: number
  /** 可注入时钟（测试用） */
  now?: () => number
  /** 可注入计时器（测试用；默认 setInterval） */
  setTimer?: (fn: () => void, ms: number) => unknown
  /** 可注入清除计时器（测试用；默认 clearInterval） */
  clearTimer?: (handle: unknown) => void
}

export interface PanelRefresh {
  /** 立即拉一次并开始周期（重复调用幂等） */
  start(): void
  /** 停表并**作废在飞响应**（关面板/切需求时调用，防止旧响应写回新状态） */
  stop(): void
  /** 手动触发一次；已在飞时复用同一个 promise（不叠加、不排队） */
  refresh(reason: RefreshReason): Promise<void>
  /** 当前新鲜度快照 */
  freshness(): PanelFreshness
  /** 订阅状态跃迁；返回退订函数 */
  subscribe(listener: (freshness: PanelFreshness) => void): () => void
}

/**
 * 面板刷新策略（REQ-261001124111-5d36 t3）：由宿主经 SSE 的 `build` 帧下发。
 *
 * 为什么走帧而不是让客户端读插件配置：客户端跑在浏览器里，读不到宿主配置；
 * 复用同一帧还能顺手带版本戳（见 `stampMismatch`），不必新增端点、不改既有返回体。
 */
export interface PanelPolicy {
  /** 轮询周期；`0` = 关闭轮询（一键回退改造前行为） */
  refreshMs: number
  /** 陈旧阈值 */
  staleAfterMs: number
}

/** 缺省策略（宿主没下发 / 下发非法时用它——宁可保守，也不能变成"不刷新"）。 */
export const DEFAULT_PANEL_POLICY: PanelPolicy = {
  refreshMs: DEFAULT_REFRESH_MS,
  staleAfterMs: DEFAULT_STALE_AFTER_MS,
}

/**
 * 宽容解析宿主下发的策略片段：只接受合法数值，其余键与非法值一律忽略。
 * **`refreshMs=0` 是合法值**（明确的"关掉轮询"），不能当成缺省吞掉。
 */
export function parsePanelPolicy(raw: unknown): Partial<PanelPolicy> {
  const out: Partial<PanelPolicy> = {}
  if (raw === null || typeof raw !== 'object') return out
  const src = raw as { refreshMs?: unknown; staleAfterMs?: unknown }
  if (typeof src.refreshMs === 'number' && Number.isFinite(src.refreshMs) && src.refreshMs >= 0) out.refreshMs = src.refreshMs
  if (typeof src.staleAfterMs === 'number' && Number.isFinite(src.staleAfterMs) && src.staleAfterMs > 0) out.staleAfterMs = src.staleAfterMs
  return out
}

/**
 * 客户端构建是否落后于服务端（REQ-261001124111-5d36 t3/t4）：任一端缺失一律返回 false。
 *
 * 刻意的保守口径：**宁可漏报，不可误报**——老 bundle 没有内联戳、宿主读不到 `lib/client.cjs`
 * 时都不该弹"插件已更新"，否则每次打开面板都在喊狼来了。
 */
export function stampMismatch(clientStamp: string | undefined, serverStamp: string | undefined): boolean {
  if (clientStamp === undefined || serverStamp === undefined) return false
  if (clientStamp.length === 0 || serverStamp.length === 0) return false
  return clientStamp !== serverStamp
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.length > 0 ? error.message : error.name
  const s = String(error)
  return s.length > 0 ? s : '未知错误'
}

/**
 * 创建刷新调度器。全部副作用（计时器、时钟、取数）都从外部注入，
 * 因此可以在 vitest 里用假时钟逐毫秒断言，无需 React/DOM。
 */
export function createPanelRefresh(opts: PanelRefreshOptions): PanelRefresh {
  const intervalMs = Math.max(0, opts.intervalMs ?? DEFAULT_REFRESH_MS)
  const staleAfterMs = Math.max(0, opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS)
  const now = opts.now ?? ((): number => Date.now())
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number): unknown => setInterval(fn, ms))
  const clearTimer = opts.clearTimer ?? ((handle: unknown): void => { clearInterval(handle as ReturnType<typeof setInterval>) })

  let fetchedAt: number | undefined
  let lastAttemptAt: number | undefined
  let failureCount = 0
  let lastError: string | undefined
  let inFlight = false
  let pending: Promise<void> | null = null
  let timer: unknown
  let started = false
  /** 代际计数：`stop()` 自增 ⇒ 在飞响应回来时发现代际不一致，一律丢弃 */
  let generation = 0
  /** 上一次对外广播过的 stale（用于识别"时间自己让它变旧"的跃迁） */
  let broadcastStale = false
  const listeners = new Set<(freshness: PanelFreshness) => void>()

  /**
   * 读当前新鲜度投影。
   *
   * 原名与 host 侧端口那个**同步整册快照函数**同名（REQ-261002161439-277d 要删掉的东西）。
   * 改名不是为了好看：切换验收会用一条 grep（模式见 notes/switch-inventory.md §0）查「读点是否改完」，
   * 一个无关的同名本地函数会让那条命令永远非空（本卡实测踩到，见 notes/switch-inventory.md §0）。
   */
  function readFreshness(): PanelFreshness {
    const stale = fetchedAt === undefined || now() - fetchedAt > staleAfterMs
    return {
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
      ...(lastAttemptAt !== undefined ? { lastAttemptAt } : {}),
      intervalMs,
      staleAfterMs,
      failureCount,
      ...(lastError !== undefined ? { lastError } : {}),
      inFlight,
      stale,
    }
  }

  function emit(): void {
    const f = readFreshness()
    broadcastStale = f.stale
    for (const listener of [...listeners]) {
      // 订阅者抛错不得阻断调度（否则一个坏 UI 会把整块面板的刷新拖死）
      try { listener(f) } catch { /* 忽略 */ }
    }
    try { opts.onChange(f) } catch { /* 同上 */ }
  }

  /** 时间流逝也会让数据变旧：进入刷新时先看是否跃迁，即使随后被在飞去重也要广播一次。 */
  function notifyStaleJump(): void {
    if (readFreshness().stale !== broadcastStale) emit()
  }

  function refresh(reason: RefreshReason): Promise<void> {
    void reason
    notifyStaleJump()
    if (pending !== null) return pending
    const gen = generation
    lastAttemptAt = now()
    inFlight = true
    pending = opts.fetchOverview()
      .then((overview) => {
        if (gen !== generation) return // stop() 之后的响应：丢弃，不写回
        fetchedAt = now()
        failureCount = 0
        lastError = undefined
        inFlight = false
        emit()
        try { opts.onData(overview, readFreshness()) } catch { /* UI 抛错不回灌调度器 */ }
      })
      .catch((error: unknown) => {
        if (gen !== generation) return
        failureCount += 1
        lastError = messageOf(error).slice(0, MAX_ERROR_CHARS)
        inFlight = false
        emit() // 失败要响亮：保留旧数据由宿主决定，但**必须**广播出去
      })
      .finally(() => {
        if (gen === generation) pending = null
      })
    return pending
  }

  return {
    start(): void {
      if (started) return
      started = true
      void refresh('open')
      if (intervalMs > 0) {
        timer = setTimer(() => { void refresh('timer') }, intervalMs)
      }
    },
    stop(): void {
      started = false
      generation += 1
      if (timer !== undefined) {
        clearTimer(timer)
        timer = undefined
      }
      inFlight = false
      pending = null
    },
    refresh,
    freshness: readFreshness,
    subscribe(listener: (freshness: PanelFreshness) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
