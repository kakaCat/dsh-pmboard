/**
 * 会话跳转 —— 把执行会话在 GUI 中打开。
 *
 * 2026-10 修复（窗口按钮点击无跳转的根因）：
 * 旧实现照抄 dsh-taskboard 假设的 sessions.open(id)，但
 * @deepseek-ai/dsh-api-session-controller 的 ISessions 接口
 * （lib/types/client/contract/sessions.d.ts）**没有 open 方法**——
 * 只有 retain/using/refresh/create/fork 等。类型注释明写
 * "navigation belongs to view owners"：选中会话并显示对话的导航动作
 * 由 dsh-client-ui-workspace 的 UiWorkspace.openSession(target) 提供
 * （lib/types/client/navigation.d.ts：'Select a Session and show its
 * Conversation as one UI navigation action'）。
 *
 * 因此跳转走 ctx.uiWorkspace.openSession(sessionId)；sessions/workspaces
 * 仅用于跳转前的 archived/missing 判定。
 *
 * 2026-10 二次修复（跳转语义归位）：看板是 main 插槽面板，openSession 只切底下的会话、
 * 面板不收口 → 会话切了但画面仍停在看板。收口走 DSH 官方导航 ctx.layout.selectPanel(null)
 * （page-runtime 模块级持有器惰性读），不再自派 `dsh-pmboard:open-board` 事件。
 * layout 不可用时返回 unavailable（不静默——静默会复现"会话切了、画面仍停在看板"）。
 *
 * @module dsh-pmboard/client/session-jump
 */

import { getPageLayout } from './page/page-runtime.ts'

export type SessionJumpResult = 'opened' | 'archived' | 'restore-failed' | 'missing' | 'unavailable'

export interface UiWorkspaceFace {
  /** 选中会话并显示其对话（DSH 官方导航动作）。 */
  openSession(target: string): void
}

export interface SessionsServiceFace {
  refresh(): Promise<void>
  list: {
    getSnapshot(): { byId: Record<string, unknown> }
    /**
     * 运行态订阅（REQ-261004210128-283d FR-1）：`byId[sid].running` 变化时回调。
     * 可选——旧客户端 / 未注入时缺省，调用方（session-running）退化成 no-op 退订，
     * 只失去实时性，读数本身照旧可用。
     */
    subscribe?(fn: () => void): () => void
  }
}

export interface WorkspacesServiceFace {
  list: { getSnapshot(): { archivedSessionIds: readonly string[] } }
  /**
   * 取消归档（REQ-261002153446-c600 FR-1）：归档会话「日志保留、侧栏不可见」，
   * 想从看板回到它就必须先把它移出归档集合。幂等——对未归档 id 调用是空操作。
   * 可选：旧版本客户端 / 未注入时缺省 → 调用方退回 'archived' 旧语义。
   */
  unarchiveSession?(sessionId: string): Promise<void>
}

export interface SessionServiceAccess {
  getUiWorkspace(): UiWorkspaceFace | undefined
  getSessions(): SessionsServiceFace | undefined
  getWorkspaces(): WorkspacesServiceFace | undefined
}

/** 从 window 上的运行时服务投影惰性取（apply 可能早于服务提供）。 */
export function windowServiceAccess(): SessionServiceAccess {
  const w = (): any => window as any
  return {
    getUiWorkspace: () => {
      try {
        const svc = w().__dshPmUiWorkspace ?? w().__dshPmCtx?.uiWorkspace
        console.log('[session-jump] getUiWorkspace check:', {
          hasDshPmUiWorkspace: !!w().__dshPmUiWorkspace,
          hasDshPmCtx: !!w().__dshPmCtx,
          hasCtxUiWorkspace: !!w().__dshPmCtx?.uiWorkspace,
          svcType: typeof svc,
          hasOpenSession: svc && typeof svc.openSession === 'function',
        })
        if (svc && typeof svc.openSession === 'function') return svc as UiWorkspaceFace
      } catch (e) {
        console.error('[session-jump] getUiWorkspace error:', e)
      }
      return undefined
    },
    getSessions: () => {
      try {
        const svc = w().__dshPmSessions ?? w().__dshPmCtx?.sessions
        if (svc && svc.list) return svc as SessionsServiceFace
      } catch { /* 降级 unavailable */ }
      return undefined
    },
    getWorkspaces: () => {
      try {
        const svc = w().__dshPmWorkspaces ?? w().__dshPmCtx?.workspaces
        if (svc && svc.list) return svc as WorkspacesServiceFace
      } catch { /* 降级 */ }
      return undefined
    },
  }
}

/**
 * 已归档会话 id 集合（工作区服务不可用 / 字段缺失 → 空集）。
 *
 * 用途（REQ-261002153446-c600 起）：渲染层据此把窗口/会话 chip 标成灰态与
 * 「点击取消归档并打开」的 title；跳转层据此决定是否先调 unarchiveSession。
 * 渲染层与跳转层共用本函数，保证判定口径一致。
 */
export function archivedSessionIds(access: SessionServiceAccess = windowServiceAccess()): ReadonlySet<string> {
  try {
    const ids = access.getWorkspaces()?.list.getSnapshot().archivedSessionIds ?? []
    return new Set<string>(ids)
  } catch { return new Set<string>() }
}

/**
 * 尝试打开会话。
 *
 * 跳转动作 = 先 layout.selectPanel(null)（收面板、回当前对话）再
 * uiWorkspace.openSession(sessionId)（DSH 官方导航 API）；两者缺一不可：
 * 只切会话不收面板 = 用户眼里仍停在看板。
 * sessions 列表仅用于跳转前判定 archived/missing；列表镜像可能滞后
 * （重连补拉/晚挂载），未命中时先 refresh() 重拉一次再判。
 * layout 不可用（未注入/已 clear）→ 返回 'unavailable'，不静默跳过收口。
 * 已归档（REQ-261002153446-c600 FR-1）→ 先 workspaces.unarchiveSession(sid) 恢复，
 * 成功再照常打开；恢复抛错 → 'restore-failed'，能力缺失 → 'archived'（都不打开）。
 */
export async function jumpToSession(access: SessionServiceAccess, sessionId: string): Promise<SessionJumpResult> {
  console.log('[session-jump] jumpToSession called:', { sessionId })
  const uiWorkspace = access.getUiWorkspace()
  if (uiWorkspace === undefined) {
    console.log('[session-jump] uiWorkspace unavailable')
    return 'unavailable'
  }

  // 页面导航（先收面板、再切会话）：layout 是 DSH 官方的收口入口，
  // selectPanel(null) = 回当前对话（不改当前会话）。不可用时**响亮返回 unavailable**，
  // 不静默跳过——静默会让「会话切了、画面仍停在看板」的旧故障复现。
  const layout = getPageLayout()
  if (layout === undefined) {
    console.log('[session-jump] layout unavailable')
    return 'unavailable'
  }
  /** 收回看板面板、回当前对话（不改当前会话）。 */
  const backToConversation = (): void => {
    layout.selectPanel(null)
    console.log('[session-jump] layout.selectPanel(null) called')
  }

  const sessions = access.getSessions()
  const archived = (): readonly string[] => {
    try { return access.getWorkspaces()?.list.getSnapshot().archivedSessionIds ?? [] } catch { return [] }
  }

  /**
   * 已归档会话的第一段动作：取消归档（REQ-261002153446-c600 FR-1）。
   *
   * 返回 undefined = 可以继续原有跳转；返回结果态 = 到此为止（**不改动任何界面/会话状态**）：
   * - 能力缺失（旧客户端无 unarchiveSession）→ 'archived'（保留旧语义，文案说清是能力问题）；
   * - 调用抛错 → 'restore-failed'（**不** openSession：不制造「以为跳过去了」的错觉）。
   *
   * 位置刻意放在「可用性检查之后、打开动作之前」：打不开就不该先改动宿主的归档状态。
   */
  const restoreIfArchived = async (sid: string): Promise<SessionJumpResult | undefined> => {
    if (!archived().includes(sid)) return undefined
    const ws = access.getWorkspaces()
    const unarchive = ws?.unarchiveSession
    if (typeof unarchive !== 'function') return 'archived'
    try {
      await unarchive.call(ws, sid)
      console.log('[session-jump] unarchiveSession ok, continue to open:', sid)
      return undefined
    } catch (e) {
      console.error('[session-jump] unarchiveSession failed:', e)
      return 'restore-failed'
    }
  }
  const inList = (sid: string): boolean => {
    if (sessions === undefined) return true // 列表不可得时不拦截，交给 openSession
    try { return sessions.list.getSnapshot().byId[sid] !== undefined } catch { return true }
  }

  // 检查是否是当前会话（从 URL 或 DOM 获取，避免触发依赖注入错误）
  let currentSessionId: string | undefined
  try {
    // 方法1：从 URL 路径解析（DSH 使用 /session/<id> 路由）
    const urlMatch = window.location.pathname.match(/\/session\/([^\/]+)/)
    if (urlMatch) currentSessionId = urlMatch[1]

    // 方法2：从 workspace 服务的当前激活会话获取
    if (!currentSessionId) {
      const ws = access.getWorkspaces()
      if (ws && 'currentSessionId' in ws) {
        currentSessionId = (ws as any).currentSessionId
      }
    }
  } catch (e) {
    console.log('[session-jump] failed to get current session:', e)
  }
  console.log('[session-jump] current session:', currentSessionId, 'target:', sessionId)

  console.log('[session-jump] check inList:', { inList: inList(sessionId), hasSessions: sessions !== undefined })
  if (inList(sessionId)) {
    // 已归档 → 先取消归档（REQ-261002153446-c600 FR-1）；失败/能力缺失返回结果态，不改界面
    const stopped = await restoreIfArchived(sessionId)
    if (stopped !== undefined) return stopped

    // 目标会话即当前会话：只需收面板，会话本身不用切
    backToConversation()
    if (sessionId === currentSessionId) {
      console.log('[session-jump] target is current session, panel closed')
      return 'opened'
    }

    console.log('[session-jump] calling uiWorkspace.openSession...')
    uiWorkspace.openSession(sessionId)
    console.log('[session-jump] openSession called, returning opened')
    return 'opened'
  }
  console.log('[session-jump] session not in list, trying refresh...')
  if (sessions !== undefined) {
    try { await sessions.refresh() } catch { /* 刷新失败按 missing 处理 */ }
  }
  console.log('[session-jump] after refresh, check inList again:', inList(sessionId))
  if (inList(sessionId)) {
    const stopped = await restoreIfArchived(sessionId)
    if (stopped !== undefined) return stopped
    console.log('[session-jump] calling uiWorkspace.openSession...')
    backToConversation()
    uiWorkspace.openSession(sessionId)
    console.log('[session-jump] openSession called, returning opened')
    return 'opened'
  }
  console.log('[session-jump] session still not found, returning missing')
  return 'missing'
}

/**
 * 统一的会话跳转公共方法（供所有页面使用）。
 *
 * 自动处理跳转结果并给出用户友好的提示信息。
 * 已归档会话不再被提前拒绝（REQ-261002153446-c600 FR-1）：跳转内部会先取消归档再打开，
 * 只有恢复失败或客户端缺该能力时才给出明确原因。
 *
 * @param sessionId - 要跳转的会话 ID
 * @param onUnavailable - 可选的回调，当会话服务不可用时调用（如打开看板）
 * @returns Promise<boolean> - 是否成功跳转
 *
 * @example
 * // 基本使用
 * await handleSessionJump('session-id-123')
 *
 * @example
 * // 带降级处理（unavailable 时由调用方决定回落动作）
 * await handleSessionJump('session-id-123', () => {
 *   console.warn('会话服务不可用，请刷新页面后重试')
 * })
 */
export async function handleSessionJump(
  sessionId: string | null | undefined,
  onUnavailable?: () => void
): Promise<boolean> {
  // 无会话 ID
  if (!sessionId || sessionId.length === 0) {
    window.alert('无法跳转：该需求没有来源会话（可能是人工建卡）')
    onUnavailable?.()
    return false
  }

  // 已归档不再在这里拦下（REQ-261002153446-c600 FR-1）：点击意图就是「回到那个会话」，
  // 所以「先取消归档、再打开」与「失败怎么说话」统一归 jumpToSession 一处判定，
  // 本函数只负责把结果翻成人话——两处各写一套判定必然漂移。

  // 执行跳转
  const result = await jumpToSession(windowServiceAccess(), sessionId)

  // 处理跳转结果
  switch (result) {
    case 'opened':
      return true
    case 'archived':
      // 已归档 + 客户端不具备取消归档能力（旧版本 / 未注入）——保留旧语义，但说清是能力问题
      window.alert('该会话已归档，且当前客户端不支持取消归档（workspaces.unarchiveSession 不可用），无法跳转')
      onUnavailable?.()
      return false
    case 'restore-failed':
      // 取消归档动作本身失败：把「没跳」说清楚，并给一条真的能走的路
      window.alert('取消归档失败：会话未恢复，未跳转。可到会话列表手动恢复后重试')
      onUnavailable?.()
      return false
    case 'missing':
      window.alert('该会话不在当前列表（可能已删除）')
      onUnavailable?.()
      return false
    case 'unavailable':
      window.alert('会话服务暂不可用')
      onUnavailable?.()
      return false
    default:
      return false
  }
}
