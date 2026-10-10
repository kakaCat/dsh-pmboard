/**
 * Dsh-pmboard client half — M3: 泳道看板 GUI（需求状态列 + 详情 + 待归类 + 会话跳转）。
 *
 * DSH dual-half contract: package.json declares dsh.client + exports["./client"];
 * shell serves bundle at /plugins/??dsh-pmboard/client.js.
 *
 * 2026-09-28（REQ-260928185112-e20d FR-1/FR-2/FR-3）：看板从「会话列 DOM 覆盖层 +
 * 侧栏底部入口按钮」迁到 DSH 原生页面机制——page/register.ts 一次注册 \`main\`（keyed）
 * 与 \`sidebar.panellist\`（id 同源），导航交给 ctx.layout.selectPanel。
 * 本文件因此不再注册入口按钮、不再监听入口自定义事件、不再自己造看板生命周期壳
 * （挂载下沉到 main 插槽宿主 page/host.ts；旧机制文件由后续卡拆除）。
 */
import { RequirementProgressAction } from './conversation-progress.ts'
import { injectStyles } from './styles.ts'
import { registerBizToolviews } from './toolviews/index.ts'
import { PANEL_NAME } from './dom.ts'
import { registerPmboardPage } from './page/register.ts'
import { clearPageLayout, setPageLayout, type PageLayoutFace } from './page/page-runtime.ts'
// REQ-261004111917-f473 FR-2：旧看板深链（/#pmboard?req=REQ-…）的消费端
import { consumePmboardDeepLink } from './deep-link.ts'
import { clearBoardFocus, requestBoardFocus } from './board-focus.ts'

export const name = 'dsh-pmboard/client'
// sidebarRight（REQ-ff20ca t5）：官方右侧栏导航面——Cordis 要求服务先声明 inject
// 才允许访问（否则抛 "cannot get property without inject"）。该服务由 web-app 随
// 官方 UI 插件组提供，实测存在；声明后插件等待它就绪再激活。
// layout（REQ-260928185112-e20d FR-3）：ctx.layout.selectPanel(id|null) 是页面导航的唯一来源，
// 看板不再自己维护显示状态；缺声明会被 Cordis 服务访问守卫拒绝。
// ⚠️ 不可在此声明 userQuestions（2026-10-08 实测事故）：它是 **host 端** Cordis 服务，
// 浏览器侧不存在同名服务；一旦声明，客户端插件会永远卡在 pending（等待一个永远不会到的
// 服务）→ boot 报「1 entry did not activate: dsh-pmboard pending (waiting for service:
// userQuestions)」，且同一 entry 链上的官方 UI（模型选择等）跟着不显示。
// 弹框通道在 host 半装配（src/index.ts 的 inject(['userQuestions'], cb)），与本文件无关。
export const inject: string[] = ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'sidebarRight', 'layout']

interface SlotsService {
  inject(slot: string, thunk: () => unknown): unknown
  register(options: Record<string, unknown>, occupant: unknown): unknown
}

interface ApplyContext {
  slots?: SlotsService
  sessions?: unknown
  workspaces?: unknown
  /** DSH 官方会话导航服务（uiWorkspace.openSession = 选中会话并显示对话） */
  uiWorkspace?: unknown
  /** DSH 官方页面导航服务（layout.selectPanel(id|null)：null = 回当前对话） */
  layout?: PageLayoutFace
}

declare global {
  interface Window {
    __dshReqboardClient?: { dispose(): void }
    __dshPmSessions?: unknown
    __dshPmWorkspaces?: unknown
    __dshPmUiWorkspace?: unknown
    __dshPmCtx?: ApplyContext
  }
}

export function apply(ctx: ApplyContext): void {
  try {
    injectStyles()

    // HMR guard: dispose previous apply
    window.__dshReqboardClient?.dispose()

    // 页面运行环境：layout 交模块级 page-runtime，供 session-jump 惰性读取
    // （服务可能晚于 apply 提供，故 apply 时只做「有则存、无则留空」的粗粒度投射）。
    setPageLayout(ctx.layout)

    // 供 session-jump 惰性读取（服务可能晚于 apply 提供）
    window.__dshPmCtx = ctx
    window.__dshPmSessions = ctx.sessions
    window.__dshPmWorkspaces = ctx.workspaces
    window.__dshPmUiWorkspace = ctx.uiWorkspace

    // 页面两端注册（main keyed 插槽 + sidebar.panellist 条目，同源 id）：取代原来的
    // 侧栏底部入口按钮（footer action）。注册失败不拖垮其余接线（进度条 / 业务卡片）。
    let disposePage: (() => void) | undefined
    try {
      disposePage = registerPmboardPage(ctx)
    } catch (e) {
      console.error('[dsh-pmboard] Failed to register page panel:', e)
    }

    // REQ-261004111917-f473 FR-2/FR-3：消费一次旧看板深链。
    // 宿主兼容入口把 /dashboard 送回应用根并**保留片段**——`req` 只存在于 location.hash 里
    // （HTTP 请求不含片段），所以「打开哪个需求」只能在这里读。放在页面注册**之后**：
    // layout.selectPanel 对未注册的面板会抛错，注册在前才有意义（延迟注册由消费端有界重试兜住）。
    // 降级：layout 未注入 → **不消费**（省掉一整轮无谓重试）并按契约给一条专属诊断（复核 #5）。
    if (ctx.layout === undefined) {
      console.warn('[dsh-pmboard] 深链：layout 不可用（页面导航服务未注入），本次不打开看板')
    } else {
      const layout = ctx.layout
      try {
        void consumePmboardDeepLink(window.location.hash, {
          selectPanel: (id) => { layout.selectPanel(id) },
          requestFocus: requestBoardFocus,
          clearFocus: clearBoardFocus,
          clearHash: () => {
            const { pathname, search } = window.location
            try {
              // 清片段、保留路径与查询：不落存储、不把 req 留在 URL 上常驻
              window.history.replaceState(null, '', pathname + search)
            } catch {
              window.location.hash = ''
            }
          },
          log: (message, detail) => { console.warn('[dsh-pmboard] ' + message, detail) },
        // 消费端自身已把异常收敛成返回值；这里再兜一层，杜绝「未处理的 Promise 拒绝」浮到控制台顶层
        }).catch((e: unknown) => { console.error('[dsh-pmboard] deep link consume rejected:', e) })
      } catch (e) {
        console.error('[dsh-pmboard] Failed to consume deep link:', e)
      }
    }

    window.__dshReqboardClient = {
      dispose: () => {
        disposePage?.()
        disposePage = undefined
        clearPageLayout()
        delete window.__dshPmCtx
        delete window.__dshPmSessions
        delete window.__dshPmWorkspaces
        delete window.__dshPmUiWorkspace
      },
    }

    const slots = ctx.slots
    if (slots) {
      // 会话标题栏的「需求进度」流程图：session 作用域槽位会把 sessionId 交给 inject，
      // 组件据此查该会话绑定的需求进度（无绑定需求 → 渲染 null，槽位不占位）。
      //
      // REQ-260930230225-71be FR-1（验收反馈第二轮定稿）：挂在 conversation.session.header.utilities，
      // order: -20 —— 落在**右侧工具组的最左边**，紧邻「在应用中打开」的左侧。
      //
      // 为什么是 -20：官方占用者的 order 是明确的——utilities 里 ui-open-in-app -10、
      // ui-schedule -5、session-log-export（默认 0）；标题簇（actions）里 subagent 目录 -30、
      // Team 导航 -20、模式标签 -10、**ui-jobs「N 个后台任务」+20**。取 -20 既排在
      // 后台任务那组之后（它们在小标题簇里），又紧贴在右侧工具组第一位（在应用中打开）的左边。
      // 用户验收原话：「这个（Finder/⋯/侧栏开关 那一组）左边」「节点应该靠右边」。
      //
      // 收缩与降级由 styles/board.ts 的四档 @container 承担（阈值 FLOW_TIERS 1100/900/700），
      // 与座位无关，两个座位下都自适应。
      //
      // FIX: 用 try-catch 包裹槽位注册，避免与 DSH 框架对话节点系统冲突导致
      // "assistant-step withdrew materialized target 'chat'" 错误影响整个插件加载
      try {
        slots.inject('conversation.session.header.utilities', () =>
          slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: PANEL_NAME + ':progress',
              order: -20,
              inject: (sessionId: string) => ({ sessionId }),
            },
            RequirementProgressAction,
          ),
        )
      } catch (e) {
        console.error('[dsh-pmboard] Failed to register conversation.session.header.utilities:', e)
        // 降级：进度条注册失败不影响主功能（看板依然可用）
      }

      // 业务工具定制卡片（REQ-c48f99 FR-1）：tool.call.toolview keyed 插槽，
      // 逐卡 try/catch 在 registerBizToolviews 内部；整体失败不拖垮看板。
      try {
        const n = registerBizToolviews(slots)
        console.debug('[dsh-pmboard] biz toolviews registered: ' + n)
      } catch (e) {
        console.error('[dsh-pmboard] Failed to register biz toolviews:', e)
      }
    } else {
      console.warn('[dsh-pmboard] ctx.slots unavailable')
    }
  } catch (e) {
    console.error('[dsh-pmboard] client half failed to start:', e)
  }
}
