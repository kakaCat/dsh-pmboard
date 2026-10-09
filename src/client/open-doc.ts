/**
 * 文档打开统一入口（REQ-ff20ca t5）——走 DSH 官方右侧栏文档预览。
 *
 * 为什么：REQ-31e11f 设计的人机回路第一环是「人看文档 → 对话交流改进」，
 * 弹窗是模态遮挡、看文档时无法对话 → 回路断裂。官方 sidebarRight 支持并排常驻。
 *
 * 按 G2 **不保留弹窗降级**：sidebarRight 不可用时打印诊断，不做静默回退。
 *
 * @module dsh-pmboard/client/open-doc
 */
import { sessionFileAddress } from './file-address.ts'
import { extractRequirementIdFromPath } from '../domain/artifact/ArtifactPath.js'

/** 官方右侧栏导航面对（只用 openResource 这一项）。 */
interface SidebarRightLike {
  openResource?: (address: string, options?: unknown) => void
}

/** 取 ctx.sidebarRight —— 可选服务，缺失不影响插件加载（不得加入 inject）。 */
function sidebarRightOf(ctx: unknown): SidebarRightLike | undefined {
  const raw = (ctx as { sidebarRight?: unknown } | undefined)?.sidebarRight
  if (raw === null || typeof raw !== 'object') return undefined
  return raw as SidebarRightLike
}

/**
 * 读「当前会话」id —— 看板等无槽位注入的场景用
 * （sessions 服务的 list 快照 current / currentSessionId）。
 */
export function resolveCurrentSessionId(): string | undefined {
  try {
    const w = window as unknown as {
      __dshPmSessions?: { list?: { getSnapshot?: () => { current?: unknown; currentSessionId?: unknown } } }
      __dshPmCtx?: { sessions?: { list?: { getSnapshot?: () => { current?: unknown; currentSessionId?: unknown } } } }
    }
    const svc = w.__dshPmSessions ?? w.__dshPmCtx?.sessions
    const snap = svc?.list?.getSnapshot?.()
    const cur = snap?.current ?? snap?.currentSessionId
    if (typeof cur === 'string' && cur.length > 0) return cur
  } catch { /* 拿不到 → 返回 undefined，由调用方诊断 */ }
  return undefined
}

// ---------------------------------------------------------------------------
// REQ-260922012924-2e29 FR-4：文档路径绝对化
// 相对文档路径（docs/requirements/...）若以"当前会话工作区"为根解析，在非 agent-dh
// 工作区的会话里必打不开（2026-09-24 用户现场：w-9faaac35 工作区=dsh-pmboard）。
// 故看板 fetchState 后把服务端 workspaceRoot/homeDir 缓存到这里，打开与显示统一走绝对路径。
// ---------------------------------------------------------------------------

let cachedWorkspaceRoot: string | undefined
/** 会话工作区（/state 的 sessionWorkspaceRoot，FR-11）：无需求段路径的**首选**根。 */
let cachedSessionWorkspaceRoot: string | undefined
let cachedHomeDir: string | undefined
/** 需求 id → 需求级工作区根（REQ-260929210741-30ae FR-6：产物相对需求工作区落盘）。 */
let cachedReqRoots: Record<string, string> = {}

/**
 * 缓存服务端工作区根与 homeDir（board-mount 在 fetchState 成功后调用；旧服务端无字段 → 保持 undefined 降级为相对解析）。
 * reqRoots：需求 id → 需求级 workspaceRoot——产物写路径以需求工作区为根，
 * 打开/显示必须同根解析，否则服务跑在别的会话工作区时拼出的绝对路径必 404。
 */
export function setDocWorkspaceContext(
  workspaceRoot: string | undefined,
  homeDir: string | undefined,
  reqRoots?: Record<string, string>,
  sessionWorkspaceRoot?: string | undefined,
): void {
  cachedWorkspaceRoot = typeof workspaceRoot === 'string' && workspaceRoot.length > 0 ? workspaceRoot : undefined
  cachedHomeDir = typeof homeDir === 'string' && homeDir.length > 0 ? homeDir : undefined
  cachedReqRoots = reqRoots ?? {}
  cachedSessionWorkspaceRoot = typeof sessionWorkspaceRoot === 'string' && sessionWorkspaceRoot.length > 0
    ? sessionWorkspaceRoot
    : undefined
}

/**
 * 本次绝对化**用了哪个根**（REQ-261007223647-da5d t12 · serves: FR-6 / 设计 IF-7）。
 *
 * 为什么要有这个读数：2026-10-07 用户现场——面板显示 `./dsh` 下的地址，文件其实在
 * 工作区/文档位置；台账记录无罪，是**前端根解析链**在缓存缺失/串会话时拿错了根。
 * 拿错根是"拼出一个看起来像绝对路径、但必然打不开的地址"，静默发生、事后无从追查。
 * 记下"这次用了哪个根"，UI 才能把不确定**说出来**（不是改打开行为）。
 *
 * 取值语义（缺一不可）：
 *  - `req-root`：需求级根（`reqRoots[reqId]`）——读与写同根，最可信；
 *  - `session-root`：会话工作区根——跨需求/串会话时可能不是文件真正的落点；
 *  - `server-root`：服务端下发的 workspaceRoot（兜底）；
 *  - `none`：**没有用任何根**——输入已是绝对路径，或三类根都取不到（原样返回相对路径）。
 */
export type DocRootSource = 'req-root' | 'session-root' | 'server-root' | 'none'

/** 最近一次 `absolutizeDocPath` 用到的根来源（只读诊断；缺省 = 从未解析过）。 */
let lastRootSource: DocRootSource = 'none'

/** 只读诊断：上一次绝对化用的根来源（不触发任何解析、不改缓存）。 */
export function peekLastRootSource(): DocRootSource {
  return lastRootSource
}

/**
 * 相对路径 → 绝对路径 + 本次用的根来源（**解析逻辑的唯一实现**，`absolutizeDocPath` 只是它的薄壳）。
 *
 * 为什么要连来源一起返回：调用方（文档位置行）需要"地址 + 可信度"两件事同源得出——
 * 若先调 absolutize 再回头猜来源，中间任何一次别的解析都会把它污染成假读数。
 */
export function absolutizeDocPathWithSource(path: string): { abs: string; source: DocRootSource } {
  // 已是绝对路径 → 原样返回（不需要根，也不该被标成"用了某个根"）
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return { abs: path, source: 'none' }
  const rel = path.split('\\').join('/').replace(/^(?:\.\/)+/, '')
  // 根的选择（FR-11）：需求级根优先（读与写同根）→ 会话工作区 → 服务端下发的 workspaceRoot。
  // 三者都取不到 → 原样返回相对路径（由 DSH 按查看会话解析），**不拼一个必然不存在的绝对路径**。
  const reqId = extractRequirementIdFromPath(rel)
  const reqRoot = reqId !== undefined ? cachedReqRoots[reqId] : undefined
  const root = reqRoot ?? cachedSessionWorkspaceRoot ?? cachedWorkspaceRoot
  if (root === undefined) return { abs: path, source: 'none' }
  // **串会话保护**：需求级根命中就绝不退到会话根（reqRoots 优先由上行的 ?? 保证，来源标注逐字对齐）。
  const source: DocRootSource = reqRoot !== undefined
    ? 'req-root'
    : (cachedSessionWorkspaceRoot !== undefined ? 'session-root' : 'server-root')
  const r = root.split('\\').join('/').replace(/\/+$/, '')
  return { abs: r + '/' + rel, source }
}

/** 相对路径 → 绝对路径（已是绝对路径原样返回；无缓存根 → 原样返回，相对解析降级）。 */
export function absolutizeDocPath(path: string): string {
  const resolved = absolutizeDocPathWithSource(path)
  lastRootSource = resolved.source
  return resolved.abs
}

/** 显示用路径：绝对化后把 homeDir 前缀缩写为 ~（无缓存 → 原样）。 */
export function displayDocPath(path: string): string {
  const abs = absolutizeDocPath(path)
  if (cachedHomeDir !== undefined && abs.startsWith(cachedHomeDir + '/')) return '~' + abs.slice(cachedHomeDir.length)
  return abs
}

/**
 * 在官方右侧栏打开工作区文档。
 *
 * @returns true=已发起打开；false=未发起（原因已 console.error 说明）
 */
export function openDocInSidebar(ctx: unknown, path: string, sessionId: string | undefined): boolean {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    console.error('[dsh-pmboard] open-doc: 取不到会话 id，无法构造 session 地址', { path })
    return false
  }
  const sr = sidebarRightOf(ctx)
  if (sr === undefined || typeof sr.openResource !== 'function') {
    console.error('[dsh-pmboard] open-doc: ctx.sidebarRight 不可用（官方右侧栏未加载）', { path })
    return false
  }
  // FR-4：相对路径先按服务端工作区根绝对化——dsh-resource 协议支持绝对路径（前导斜杠保留），
  // Host 按绝对路径读，不再依赖查看会话的工作区。
  const address = sessionFileAddress(sessionId, absolutizeDocPath(path))
  try {
    sr.openResource(address)
    return true
  } catch (error) {
    console.error('[dsh-pmboard] open-doc: openResource 调用失败', { address, error: String(error) })
    return false
  }
}
