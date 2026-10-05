/**
 * 面板数据通道（REQ-261001124111-5d36 t3）——把"数据从哪来 / 多久刷一次 / 拿不到怎么办 / 我是不是旧版本"
 * 从会话组件里抽成一个 hook。
 *
 * 为什么拆（两件事同时成立才做）：
 *   ① **尺寸门禁**：`conversation-progress.ts` 触到单文件 ≤400 行上限，把数据通道留在组件里只会继续膨胀；
 *   ② **职责**：组件管渲染与交互；刷新调度、SSE 加速、版本戳提示都是"数据通道"的事，抽出来还能单测接线。
 *
 * 三条不变量（本次事故的直接教训，逐条对应 FR）：
 *  - **打开即拉 + 周期兜底**：任务级变化不改 `req.updatedAt`，所以不能靠它触发；SSE 只作加速通道（FR-1）；
 *  - **切换需求先清空**：清空语句必须排在建调度器之前，否则 loading 期间会显示上一个需求的卡片（FR-4）；
 *  - **失败与陈旧都交出去**：`freshness`（含 lastError）原样给渲染层，是否出红条由渲染层决定（FR-2/FR-3）。
 *
 * @module dsh-pmboard/client/use-panel-refresh
 */
import { useEffect, useRef, useState } from 'react'
import { fetchStageOverview, subscribeEvents } from './api.ts'
import {
  createPanelRefresh,
  DEFAULT_PANEL_POLICY,
  parsePanelPolicy,
  stampMismatch,
  type PanelFreshness,
  type PanelPolicy,
  type PanelRefresh,
} from './panel-refresh.js'
import type { StageOverview } from '../shared/protocol.ts'

export interface PanelRefreshView {
  /** 当前需求的全流程一览（切换需求后、新数据到达前为 null —— 不串档） */
  overview: StageOverview | null
  /** 数据新鲜度（含 lastError / stale；未展开时为 null） */
  freshness: PanelFreshness | null
  /** 版本提示（两戳不同才非空；每个 SSE 连接只提示一次） */
  buildNotice: { clientStamp: string; serverStamp: string } | null
  loading: boolean
  /** 最近一次失败原因（渲染层据此出红条；有旧数据时也照出） */
  error: string
}

export interface UsePanelRefreshOptions {
  /** 面板是否展开（未展开 = 停表 + 清空） */
  open: boolean
  /** 当前需求 id（变化 = 切换需求） */
  reqId: string | undefined
}

export function usePanelRefresh(opts: UsePanelRefreshOptions): PanelRefreshView {
  const { open, reqId } = opts
  const [overview, setOverview] = useState<StageOverview | null>(null)
  const [freshness, setFreshness] = useState<PanelFreshness | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  /** 宿主下发的刷新策略（经 SSE `build` 帧；缺省 5000/30000） */
  const [policy, setPolicy] = useState<PanelPolicy>(DEFAULT_PANEL_POLICY)
  const [buildNotice, setBuildNotice] = useState<{ clientStamp: string; serverStamp: string } | null>(null)
  /** 当前调度器实例（SSE 事件用它做加速刷新） */
  const panelRef = useRef<PanelRefresh | null>(null)
  /** 版本提示每个 SSE 连接只提示一次（否则每次 build 帧都重排 DOM） */
  const buildNoticeShown = useRef<boolean>(false)

  // 调度器：打开即拉 + 每 refreshMs 兜底轮询；切换需求先清空再拉（FR-1 / FR-4）
  useEffect(() => {
    if (!open || reqId === undefined) {
      setOverview(null)
      setFreshness(null)
      panelRef.current = null
      return
    }
    setOverview(null) // 先清空：loading 期间不得显示旧需求的 DAG / 泳道
    setLoading(true)
    setError('')
    const panel = createPanelRefresh({
      fetchOverview: () => fetchStageOverview(reqId),
      intervalMs: policy.refreshMs,
      staleAfterMs: policy.staleAfterMs,
      onData: (data, fresh) => {
        setOverview(data)
        setFreshness(fresh)
        setLoading(false)
        setError('')
      },
      onChange: (fresh) => {
        setFreshness(fresh)
        // 失败要响亮：原因交给渲染层出红条——**哪怕已经有旧数据在屏上**（FR-3）
        setError(fresh.lastError ?? '')
        if (fresh.lastError === undefined) setLoading(false)
      },
    })
    panelRef.current = panel
    panel.start()
    return () => {
      panel.stop()
      panelRef.current = null
    }
  }, [open, reqId, policy.refreshMs, policy.staleAfterMs])

  // SSE 只作**加速通道**（FR-1）：事件到达即刷，通常 <1 秒看到新卡；
  // 5 秒轮询兜底"SSE 不在 / 断线 / 被代理缓冲"——实时性不再押在单一通道上。
  useEffect(() => {
    if (!open) return
    buildNoticeShown.current = false // 每个连接只提示一次版本陈旧
    const unsubscribe = subscribeEvents(
      (_revision, kind) => {
        if (kind === 'task-moved' || kind === 'task-updated' || kind === 'task-created' || kind === 'task-removed') {
          void panelRef.current?.refresh('event')
        }
      },
      (payload) => {
        // 命名帧 `event: build`：宿主下发的刷新策略 + 插件构建戳（见 api.subscribeEvents 注释）
        const frame = (payload ?? {}) as { stamp?: unknown; panel?: unknown }
        setPolicy((prev) => ({ ...prev, ...parsePanelPolicy(frame.panel) }))
        const serverStamp = typeof frame.stamp === 'string' ? frame.stamp : undefined
        const injected = (window as unknown as { __DSH_PM_BUILD__?: unknown }).__DSH_PM_BUILD__
        const clientStamp = typeof injected === 'string' ? injected : undefined
        if (buildNoticeShown.current === false && stampMismatch(clientStamp, serverStamp)) {
          buildNoticeShown.current = true
          setBuildNotice({ clientStamp: clientStamp ?? '', serverStamp: serverStamp ?? '' })
        }
      },
    )
    return () => unsubscribe()
  }, [open])

  // FR-5：版本提示的「点此刷新」——只做一次 reload，**不自动刷新**（自动 reload 会打断正在输入的消息）。
  // 委托挂 document：面板 HTML 是注入字符串，React 事件挂不上（与 np-board-entry 同款理由）。
  useEffect(() => {
    const onClick = (ev: MouseEvent): void => {
      const t = (ev.target as HTMLElement).closest('[data-action="np-reload"]') as HTMLElement | null
      if (t === null) return
      ev.preventDefault()
      ev.stopPropagation()
      window.location.reload()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return { overview, freshness, buildNotice, loading, error }
}
