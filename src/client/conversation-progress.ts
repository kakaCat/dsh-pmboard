/**
 * 会话顶部需求进度（conversation.session.header.utilities 槽位 occupant，order -20 = 右侧工具组最左；
 * REQ-260930230225-71be FR-1：验收反馈第二轮定稿「靠右边，放在 Finder/⋯ 那一组的左边」）。
 *
 * 解决的真实痛点（用户原话）：「agent 时间长，我总忘记之前都做了什么」——
 * 一个会话跑到一半回过头来，人不知道这个需求做到哪一步、还剩什么、谁在什么时候
 * 推进过。本组件把**该会话绑定的进行中需求**的流程图直接展示在右侧工具组的最左边：
 *   - 显示态：流程图（立项→需求分析→设计→拆分→实施→验收→归档）始终可见；
 *   - 详情展开：点击流程图任意位置展开完整详情面板（任务清单 + 状态时间线）。
 *
 * 数据来源：GET /dashboard/api/reqboard/session/:sessionId/progress（host 侧按
 * requirement.sourceSessionId 锚点，回退到任务执行记录的 sessionId 锚点）。
 * 无绑定需求时组件返回 null（零噪音，与 capture/bound section 同哲学）。
 *
 * @module dsh-pmboard/client/conversation-progress
 */
import { createElement as h, useState, useEffect, useRef, type ReactNode } from 'react'
import { openDocInSidebar } from './open-doc.ts'
// 样式表注入（幂等）：既保证本组件所在的文档有样式，也做**自愈**（见下方 effect）。
import { injectStyles } from './styles.ts'
import { renderNodePanel } from './node-panel.ts'
// REQ-261001124111-5d36 t3：面板数据通道（刷新调度 + SSE 加速 + 版本戳）抽成 hook（模块头有"为什么拆"）
import { usePanelRefresh } from './use-panel-refresh.ts'
// REQ-260929010300-dbf9 FR-4/FR-5：会话面板 DAG 块挂 Canvas 真图（常量/挂载入口单一源）
import { tryMountDagCanvas } from './dag-mount.ts'
import { PANEL_DAG_CANVAS_ID } from './views/dag-view.js'
// REQ-261001210304-0dfb FR-1/FR-2/FR-3/FR-4：视图状态记忆（改方向/切页签/滚动都不再被刷新吃掉）
import { readDagViewState, writeDagViewState, clearDagViewState } from './dag/view-state.js'
import { hydrateNodePanel } from './panel-hydrate.js'
import { fetchState } from './api.ts'
import type { StageKey } from '../shared/protocol.ts'
import { fmtTokens } from '../shared/protocol.ts'
// REQ-260930230225-71be FR-1/FR-3：流程图的节点口径（七节点 / 四态 / 分类跳过 / token / 计数）
// 与档位阈值统一由模型模块提供，组件与探针共用同一份事实（见 data-model.md D-2/D-3）。
import { buildFlowChartModel } from './flow-chart-model.ts'
// REQ-260928222643-4d34 FR-1/FR-2/FR-3：项目看板入口（校验 + 一次性定位交接 + 导航唯一来源）
import { requestBoardFocus } from './board-focus.ts'
import { activateBoardEntry } from './board-entry.ts'
import { getPageLayout } from './page/page-runtime.ts'
import { PANEL_ID } from './dom.ts'

const BASE = '/dashboard/api/reqboard'

interface ProgressPayload {
  hasRequirement?: boolean
  /** true = 该会话已无进行中需求，展示的是「最近完成」锚点 */
  closed?: boolean
  sessionId?: string
  requirement?: {
    id?: string; title?: string; description?: string; status?: string
    category?: string | null; blocked?: boolean; paused?: boolean
    /** REQ-260923134706-e72f / FR-2：立项四问之一的提示词难度（老记录无字段 → null，面板省略该行） */
    promptDifficulty?: string | null
    sourceSessionId?: string | null; updatedAt?: number
    /**
     * REQ-261004143941-b2ca FR-1：需求累计 token。
     * **缺失 ≠ 0**：无快照时宿主不发该键 → 这里拿不到 → 不渲染徽章（而不是显示「🪙 0」）。
     */
    tokenTotal?: number
  }
  progress?: { total?: number; done?: number; active?: number; percentage?: number; byStatus?: Record<string, number> }
  /** REQ-a33899：每节点 token（无快照 → 该节点省略 tokens 键，UI 显示「—」） */
  nodes?: Array<{ key?: string; tokens?: { total?: number } }>
  timeline?: Array<{ status?: string; at?: number; by?: { kind?: string; sessionId?: string }; reason?: string | null; inferred?: boolean }>
  tasks?: Array<{
    id?: string; title?: string; status?: string; phase?: string; side?: string
    acceptance?: string; updatedAt?: number; durationMs?: number
  }>
}

/**
 * 解析当前会话 id：优先用槽位注入的 sessionId（session 作用域槽位会传）；
 * 兜底读会话服务的「当前会话」（sessions.list.getSnapshot().current）——
 * 某些宿主版本/时机下 inject 可能拿不到值，兜底保证组件仍能取到数据。
 */
function resolveSessionId(injected?: string): string | undefined {
  if (typeof injected === 'string' && injected.length > 0) return injected
  try {
    const w = window as unknown as {
      __dshPmSessions?: { list?: { getSnapshot?: () => { current?: unknown; currentSessionId?: unknown } } }
      __dshPmCtx?: { sessions?: { list?: { getSnapshot?: () => { current?: unknown; currentSessionId?: unknown } } } }
    }
    const svc = w.__dshPmSessions ?? w.__dshPmCtx?.sessions
    const snap = svc?.list?.getSnapshot?.()
    const cur = snap?.current ?? snap?.currentSessionId
    if (typeof cur === 'string' && cur.length > 0) return cur
  } catch { /* 降级：拿不到就不渲染 */ }
  return undefined
}

export interface RequirementProgressProps {
  /** 由槽位 inject(sessionId) 注入（session 作用域槽位）。 */
  sessionId?: string
}



/**
 * 会话标题栏的需求进度流程图。无绑定需求 → 渲染 null（槽位不占位）。
 */
export function RequirementProgressAction(props: RequirementProgressProps): ReactNode {
  const injectedId = props?.sessionId
  const [data, setData] = useState<ProgressPayload | null>(null)
  const [detailOpen, setDetailOpen] = useState<boolean>(false)
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  // REQ-260928222643-4d34 FR-3：入口失败就地提示（面板内可见，不静默）
  const [entryError, setEntryError] = useState<string>('')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const lastSid = useRef<string | undefined>(undefined)

  // 关闭面板。REQ-260928222643-4d34 FR-2（P-3 实现约束）：必须在 \`if (!detailOpen) return\` 早退
  // **之前**声明——点击委派 effect 无条件执行，晚声明会让它拿不到。
  const closePanel = (): void => { setDetailOpen(false); setSelectedStage(null) }


  // 数据：挂载即拉一次，之后 15s 轮询（进度是辅助信息，失败静默不打扰）。
  // 会话 id 每次求值都走 resolveSessionId —— 槽位注入拿不到时用「当前会话」兜底，
  // 切换会话也能在下一个 tick 跟上。
  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const sid = resolveSessionId(injectedId)
      if (sid === undefined) {
        if (alive) { lastSid.current = undefined; setData(null) }
        return
      }
      if (sid !== lastSid.current) {
        // 会话变了：先清空旧数据，避免显示上一个会话的需求
        lastSid.current = sid
        if (alive) setData(null)
      }
      try {
        const res = await fetch(`${BASE}/session/${encodeURIComponent(sid)}/progress`, {
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return
        const json = (await res.json()) as { success?: boolean; data?: ProgressPayload }
        if (!alive) return
        setData(json.success === true ? (json.data ?? null) : null)
      } catch { /* 静默：进度条不可用不影响会话 */ }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [injectedId])

  // 样式自愈：本组件在屏期间每次数据刷新（15s 轮询 / 会话切换）都确认一次样式表在场。
  // 为什么需要：DSH client-modules 按 data-plugin 归属**整批移除**样式表（HMR 替换、
  // 图行裁剪），本表一旦被移除，只有下一次 materialize 才会重新注入——而本组件可能
  // 一直挂在屏上（用户看到的就是「刷新后样式全丢且不恢复」）。injectStyles 幂等，
  // 代价只是一次 querySelector（见 styles.ts 的「样式归属」）。
  useEffect(() => { injectStyles() }, [data])

  // 展开详情时点外部关闭
  useEffect(() => {
    if (!detailOpen) return
    const onDoc = (ev: MouseEvent): void => {
      const el = wrapRef.current
      if (el !== null && !el.contains(ev.target as Node)) setDetailOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [detailOpen])

  // REQ-31e11f 重设计：展开即加载全流程一览（StageOverview，与看板同源）。
  // REQ-261001124111-5d36 t3：刷新触发 / SSE 加速 / 版本戳全部收敛进 usePanelRefresh——
  // **打开即拉 + 每 refreshMs 兜底轮询**（不再只依赖 req.updatedAt：任务级变化根本不改它，事故根因之一），
  // 切换需求先清空再拉（FR-4 不串档）；失败与陈旧经 freshness 交给渲染层出红条（FR-2/FR-3）。
  const reqIdForStage = data?.requirement?.id
  const panelView = usePanelRefresh({ open: detailOpen, reqId: reqIdForStage })
  const stageOverview = panelView.overview
  const stageOverviewLoading = panelView.loading
  const stageOverviewErr = panelView.error
  const freshness = panelView.freshness
  const buildNotice = panelView.buildNotice

  // ---- REQ-261001210304-0dfb：视图状态记忆键 + 面板补丁（全部必须在下面 `if (data === null…) return null`
  // 早退之前声明——hooks 不能排在条件返回之后）----
  // 键含需求 id：同一块画布会承载不同需求的图，键不含需求 id 就会串档（FR-4 / A5）。
  const panelStateKey = reqIdForStage !== undefined ? PANEL_DAG_CANVAS_ID + '::' + reqIdForStage : undefined
  const prevReqIdRef = useRef<string | undefined>(undefined)
  // 新鲜度按 NodePanelFreshness 契约**显式挑字段**（面板渲染与补丁共用同一份投影）。
  const panelFreshness = freshness === null
    ? undefined
    : {
        ...(freshness.fetchedAt !== undefined ? { fetchedAt: freshness.fetchedAt } : {}),
        ...(freshness.lastError !== undefined ? { lastError: freshness.lastError } : {}),
        intervalMs: freshness.intervalMs,
        staleAfterMs: freshness.staleAfterMs,
      }

  // FR-4：切换需求时清掉上一需求的视图条目（键已含需求 id，这里是内存卫生；不影响"不串档"本身）。
  useEffect(() => {
    const prev = prevReqIdRef.current
    if (prev !== undefined && prev !== reqIdForStage) clearDagViewState(PANEL_DAG_CANVAS_ID + '::' + prev)
    prevReqIdRef.current = reqIdForStage
  }, [reqIdForStage])

  // FR-2/FR-3：注入 HTML **之后**补值——数据时间 / 「N 分钟前」/ 页签选择刻意不进注入字符串，
  // 由补丁写进稳定钩子元素。这样"只是时间往前走了"不再让 __html 变化，React 就不会重设整段
  // innerHTML（否则 DAG 画布、滚动位置、页签每次轮询都被重建）。每轮 freshness 变化都会重跑，
  // 但只改文本与属性、不插删元素——画布与滚动不受影响。
  useEffect(() => {
    if (!detailOpen) return
    const root = wrapRef.current
    if (root === null) return
    const tab = panelStateKey !== undefined ? readDagViewState(panelStateKey)?.tab : undefined
    hydrateNodePanel(root, {
      ...(panelFreshness !== undefined ? { freshness: panelFreshness } : {}),
      ...(tab !== undefined ? { tab } : {}),
    })
  }, [detailOpen, selectedStage, stageOverview, freshness, panelStateKey, buildNotice, data])

  // REQ-260923134706-e72f t6：实施节点 [流程图][泳道] tab 切换（注入 HTML 内的委托监听）。
  useEffect(() => {
    const onClick = (ev: MouseEvent): void => {
      const t = (ev.target as HTMLElement).closest('[data-action="np-switch-view"]') as HTMLElement | null
      if (t === null) return
      ev.preventDefault()
      ev.stopPropagation()
      const panel = t.closest('.dsh-pm-np')
      if (panel === null) return
      const view = t.getAttribute('data-view')
      for (const tab of Array.from(panel.querySelectorAll<HTMLElement>('.dsh-pm-np-tab'))) {
        tab.classList.toggle('is-active', tab.getAttribute('data-view') === view)
      }
      for (const pane of Array.from(panel.querySelectorAll<HTMLElement>('.dsh-pm-np-pane'))) {
        pane.hidden = pane.getAttribute('data-pane') !== view
      }
      // REQ-261001210304-0dfb FR-2：把"人在看哪一页"记进视图状态记忆——
      // 页签原先只活在 DOM class 上，整段重绘就跳回 DAG；记下来后由补丁按记忆恢复。
      if (panelStateKey !== undefined && (view === 'flow' || view === 'list')) {
        writeDagViewState(panelStateKey, { tab: view })
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [panelStateKey])

  // 产物文档链接（注入 HTML 里的 data-action="open-doc"）→ 官方右侧栏打开全文（REQ-ff20ca t5）。
  // 挂 document 级（wrapRef 在 detailOpen 切换时被 React 重建，挂它上面 listener 会丢）。
  // 弹窗已按 G2 移除：不再有降级分支，sidebarRight 不可用时由 openDocInSidebar 打印诊断。
  useEffect(() => {
    const onClick = (ev: MouseEvent): void => {
      const t = (ev.target as HTMLElement).closest('[data-action="open-doc"]') as HTMLElement | null
      if (t === null) return
      ev.preventDefault()
      ev.stopPropagation()
      const path = t.getAttribute('data-path')
      if (path === null || path.length === 0) return
      openDocInSidebar(window.__dshPmCtx, path, resolveSessionId(injectedId))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [injectedId])

  // REQ-260928222643-4d34 FR-1/FR-2/FR-3：项目看板入口。先校验（activateBoardEntry）后切页；
  // 失败就地提示且**不切页**；成功关面板再 layout.selectPanel(PANEL_ID)（导航唯一来源）。
  useEffect(() => {
    const onClick = (ev: MouseEvent): void => {
      const t = (ev.target as HTMLElement).closest('[data-action="np-board-entry"]') as HTMLElement | null
      if (t === null) return
      ev.preventDefault()
      const reqId = t.getAttribute('data-req') ?? ''
      void (async () => {
        setEntryError('')
        const verdict = await activateBoardEntry(reqId, {
          isKnown: async (id: string) => {
            const s = await fetchState()
            return (s.requirements ?? []).some((r) => r.id === id)
          },
          requestFocus: requestBoardFocus,
          layout: getPageLayout(),
        })
        if (!verdict.ok) { setEntryError(verdict.message); return }
        closePanel()
        getPageLayout()?.selectPanel(PANEL_ID)
      })()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // REQ-260929010300-dbf9 FR-4/FR-5：面板 HTML 进 DOM 之后（effect 在 commit 后运行）再挂
  // Canvas DAG。tryMountDagCanvas 内部 rAF + getElementById 存在性检查：面板没展开 / 当前阶段
  // 没有画布时静默返回（不抛、不空白）。不传 ready（面板 payload 无队列 ready[]）→ 统计条
  // 如实标「推导」（FR-7）；canvasId 用面板专用常量，与需求详情 #dag-canvas 互不抢占。
  useEffect(() => {
    if (!detailOpen || stageOverview === null) return
    const stageKey = selectedStage ?? stageOverview.currentStage
    if (stageKey !== 'implementing' && stageKey !== 'decomposing') return
    const detail = stageOverview.stages.find(s => s.stage === stageKey)
    if (detail === undefined) return
    // 只有「拆分 / 实施」两个节点的 body 带任务列表（其余节点 body 无 tasks 字段）：
    // 先按实际阶段收窄类型再取 body.tasks，非这两个阶段一律不挂（阶段缺失/任务缺失都不调用）。
    const tasks = detail.stage === 'implementing' || detail.stage === 'decomposing'
      ? detail.body.tasks
      : undefined
    if (tasks === undefined || tasks.length === 0) return
    // REQ-261001210304-0dfb FR-1：把记忆键交下去——挂载按记忆回填方向/开关/钉住/滚动，
    // dispose 时写回。不传 keys（reqId 未知）时会退化成改造前行为，不报错。
    tryMountDagCanvas(tasks, undefined, PANEL_DAG_CANVAS_ID, panelStateKey !== undefined ? { stateKey: panelStateKey } : undefined)
  }, [detailOpen, selectedStage, stageOverview, panelStateKey])

  const req = data?.requirement
  if (data === null || data.hasRequirement !== true || req === undefined || req === null) return null

  // ---- 流程图模型（REQ-260930230225-71be FR-3：口径单一源，探针共用）----
  // DOM 结构与类名保持不变（设计 interfaces.md I-2）：档位降级全部由 CSS 承担。
  const model = buildFlowChartModel({
    status: req.status,
    category: req.category,
    closed: data.closed,
    progress: data.progress,
    nodes: data.nodes,
    // REQ-261004143941-b2ca FR-2：累计 token 走模型层落模（有效才算有），组件只负责渲染
    ...(req.tokenTotal !== undefined ? { tokenTotal: req.tokenTotal } : {}),
  })
  const title = req.title ?? '（未命名需求）'
  const closed = model.closed

  // ---- 流程图节点（始终可见，可点击）----
  // 分类差异化流程（REQ-31e11f）：该分类跳过的节点标灰，与缺产物标红区分。
  // REQ-a33899：每节点 token。**与节点名同一行水平放置**（既有样式不变：圆点在上、名称在下）
  const flowNodes: ReactNode[] = []
  model.nodes.forEach((stage, idx) => {
    const isSelected = selectedStage === stage.key
    flowNodes.push(
      h('div', {
        key: `n-${stage.key}`,
        className: 'dsh-pm-flow-node',
        'data-state': stage.skipped ? 'skipped' : stage.state,
        'data-selected': isSelected ? 'true' : undefined,
        title: stage.skipped ? `本分类（${model.category}）跳过「${stage.label}」` : undefined,
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          setSelectedStage(stage.key)
          setDetailOpen(true)
        },
      }, [
        h('span', { key: 'd', className: 'dsh-pm-flow-dot' }, stage.skipped ? '—' : stage.state === 'done' ? '✓' : stage.state === 'current' ? '●' : stage.index + 1),
        h('div', { key: 'm', className: 'dsh-pm-flow-meta' }, [
          h('span', { key: 'l', className: 'dsh-pm-flow-label' }, stage.label),
          ...(stage.token !== undefined
            ? [h('span', { key: 't', className: 'dsh-pm-flow-token' }, fmtTokens(stage.token))]
            : []),
        ]),
      ]),
    )
    if (idx < model.nodes.length - 1) {
      flowNodes.push(
        h('div', { key: `l-${stage.key}`, className: 'dsh-pm-flow-link', 'data-state': stage.state === 'done' ? 'done' : 'pending' }),
      )
    }
  })

  // 流程图容器
  // REQ-261004143941-b2ca FR-2：计数旁**常显**需求累计 Token。刻意放在 `.dsh-pm-flow` **之外**——
  // 档位规则（`@container`）只作用于 flow 内部的节点/连线/节点 token，故这个「结论」不会被裁掉；
  // 它是窄窗口下唯一还能看到的 token 读数（节点级明细在 <1000px 时按既有设计隐藏）。
  const tokenTotalBadge = model.tokenTotal !== undefined
    ? h('span', {
        key: 'tt',
        className: 'dsh-pm-token-badge dsh-pm-cprog-token-total',
        title: '需求累计 Token（各节点快照差值合计，含任务执行兜底）',
      }, [
        h('span', { key: 'i', className: 'dsh-pm-cprog-token-ico' }, '🪙'),
        fmtTokens(model.tokenTotal),
      ])
    : null
  const flowChart = h(
    'div',
    {
      key: 'flow',
      className: `dsh-pm-cprog-inline${closed ? ' is-closed' : ''}`,
      title: `${req.id ?? ''}《${title}》${model.statusLabel}${closed ? '（本会话最近完成）' : ''} · 点击节点查看详情`,
      'aria-expanded': detailOpen,
    },
    [
      h('div', { key: 'f', className: 'dsh-pm-flow' }, flowNodes),
      h('span', { key: 'c', className: 'dsh-pm-cprog-inline-count' }, model.countText),
      ...(tokenTotalBadge !== null ? [tokenTotalBadge] : []),
    ],
  )

  if (!detailOpen) return h('div', { className: 'dsh-pm-cprog', ref: wrapRef }, flowChart)

  // ---- 详情面板（REQ-260923134706-e72f t6：node-panel 渲染器，苹果风，无遮罩/无底部按钮）----
  const panelChildren: ReactNode[] = [
    // × 关闭按钮（右上角，取代原「收起」）
    h('button', { key: 'x', type: 'button', className: 'dsh-pm-np-close', 'aria-label': '关闭', onClick: closePanel }, '×'),
  ]
  if (closed) {
    panelChildren.push(
      h('div', { key: 'closed', className: 'dsh-pm-cprog-panel-note' },
        '本会话已无进行中需求 —— 以上是最近关联的需求（已完成/已归档），可作为「这个会话做了什么」的回顾。'),
    )
  }
  // REQ-260928222643-4d34 FR-3：入口失败就地可见（role=alert；不 console、不静默）
  if (entryError.length > 0) {
    panelChildren.push(h('div', { key: 'entry-err', role: 'alert', className: 'dsh-pm-np-entry-err' }, entryError))
  }
  // REQ-261001124111-5d36 t3：新鲜度按 NodePanelFreshness 的契约**显式挑字段**传下去
  // （PanelFreshness 还带着 failureCount/inFlight/stale 等诊断字段，不该漏进渲染契约）。
  // REQ-261001210304-0dfb：该投影已在早退之前算好（补丁 effect 也要用同一份），此处直接用 `panelFreshness`。
  if (stageOverviewLoading && stageOverview === null) {
    panelChildren.push(h('div', { key: 'ld', className: 'dsh-pm-cprog-empty' }, '详情加载中…'))
  } else if (stageOverviewErr.length > 0 && stageOverview === null) {
    panelChildren.push(h('div', { key: 'er', className: 'dsh-pm-cprog-empty' }, `详情暂不可用：${stageOverviewErr}`))
  } else if (stageOverview !== null) {
    panelChildren.push(h('div', {
      key: 'ovr',
      className: 'dsh-pm-cprog-stage-detail',
      dangerouslySetInnerHTML: {
        __html: renderNodePanel({
          overview: stageOverview,
          stage: (selectedStage ?? stageOverview.currentStage) as StageKey,
          requirement: { id: req.id ?? '', title, promptDifficulty: req.promptDifficulty ?? null, category: req.category ?? undefined },
          // FR-2/FR-3/FR-5：数据时间、失败红条、插件已更新——有旧数据时也照出（不再被"有数据"吞掉）
          ...(panelFreshness !== undefined ? { freshness: panelFreshness } : {}),
          ...(buildNotice !== null ? { buildNotice } : {}),
        }),
      },
    }))
  } else {
    panelChildren.push(h('div', { key: 'ne', className: 'dsh-pm-cprog-empty' }, '暂无详情'))
  }
  const panel = h('div', { key: 'panel', className: 'dsh-pm-cprog-detail-panel' }, panelChildren)

  return h('div', { className: 'dsh-pm-cprog', ref: wrapRef }, [flowChart, panel])
}