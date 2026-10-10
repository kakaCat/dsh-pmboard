/**
 * 看板深链消费端（REQ-261004111917-f473 FR-2 / FR-3）。
 *
 * ## 它解决什么
 *
 * 宿主侧兼容入口（`src/http/legacy-board-route.ts`）把旧链接 `/dashboard#pmboard?req=…`
 * 送回应用根并**保留片段**——因为 HTTP 请求根本不含片段（RFC 9110 §4.2），服务端看不到 `req`。
 * 于是「打开哪个需求」这件事只能在这里完成：解析片段 → 切到看板面板 → 把需求定位交给看板。
 *
 * ## 依赖纪律
 *
 * **纯解析 + 注入端口**：副作用（切面板 / 登记定位 / 清 hash）全部经 `DeepLinkPorts` 注入，
 * 本模块不直接读 `window`、不引 DOM。这样「逻辑对不对」与「环境有没有」分开测
 * ——与 `board-entry.ts` / `board-focus.ts` 同款纪律。
 *
 * ## 三条硬约束（design/interfaces.md §客户端模块契约）
 *
 * 1. **ignored 零副作用**：不是本插件的 hash，一个字都不许动（不碰 hash / 不碰面板 / 不碰定位）；
 * 2. **消费即清**：识别为深链后立刻清 hash，避免刷新重放；但**先登记定位意图、再切面板**
 *    （面板挂载时会 `takeBoardFocus()` 消费意图，「面板尚未挂载」是主路径）；
 * 3. **绝不抛到 apply() 之外**：深链是增强，坏了也只能降级成「面板没打开」，不能拖垮插件加载
 *    ——故整个函数体（含解析与参数归一）都在同一个 try 里（复核 I-8）。
 *
 * @module dsh-pmboard/client/deep-link
 */
import { PANEL_ID } from './dom.js'

/** 解析结果（三态互斥）。 */
export type DeepLinkParse =
  /** 与本插件无关的 hash：完全不动。 */
  | { kind: 'ignored' }
  /** 是看板深链；`reqId` 可有可无（`#pmboard` 本身就是有效诉求）。 */
  | { kind: 'ok'; reqId?: string }
  /** 是看板深链，但 `req` 形状非法（`raw` 仅供日志，不回显给用户）。 */
  | { kind: 'malformed'; raw: string }

/** 消费结论（给调用方与测试看）。 */
export type DeepLinkOutcome = 'ignored' | 'opened' | 'focused' | 'malformed' | 'failed'

/** 消费端口（全部副作用经此注入，便于单测断言调用序列）。 */
export interface DeepLinkPorts {
  /** 官方 `layout.selectPanel`；**面板未注册时会抛**（故消费方有界重试）。 */
  selectPanel(id: string): void
  /** 登记一次性定位意图（`board-focus.requestBoardFocus`）。 */
  requestFocus(reqId: string): void
  /** 清掉定位意图（**仅在本函数自己登记过时**调用：不能误清别的动线留下的意图）。 */
  clearFocus(): void
  /** 清 `location.hash`（消费即清）。 */
  clearHash(): void
  /** 重试调度；缺省 `setTimeout(run, 16)`。测试注入同步实现即可断言次数。 */
  defer?(run: () => void): void
  /** 诊断日志（人读；不影响返回）。 */
  log?(message: string, detail?: unknown): void
}

/** 消费选项。 */
export interface DeepLinkOptions {
  /** 面板选择的最大尝试次数；缺省 {@link DEFAULT_MAX_ATTEMPTS}。非正数/非有限数一律回落缺省值。 */
  maxAttempts?: number
}

/** REQ id 的最小形状（与 `board-entry.ts` 的 `REQ_ID_SHAPE` 同口径，不在这里发明第二套规则）。 */
const REQ_ID_SHAPE = /^REQ-/

/** 深链前缀（必须**恰好**命中：`#pmboardx` 是别人的 hash）。 */
const DEEP_LINK_PREFIX = '#pmboard'

/** 缺省重试间隔（毫秒）：一帧量级，足够等 `slots.inject` 的延迟注册落地。 */
const DEFAULT_RETRY_MS = 16

/**
 * 缺省重试预算（次）：40 × 16ms ≈ **640ms**。
 *
 * 为什么不是 10 次（≈144ms，复核指出缺依据）：官方插槽是 `slots.inject` **延迟声明**的
 * （`page-panel.ts` 自己就写明「插槽声明可能晚于本插件的 apply」），冷启动时 `main` 插槽
 * 完全可能晚于本插件的 apply 才出现。预算太短 → 重试耗尽 → 静默 failed（用户只看到「点了没反应」），
 * 比慢一点更糟。640ms 对「点链接后开面板」这种交互是可接受上界；真实时延由 t5 的
 * 端到端步骤量测（apply → main 插槽声明），有数据后再定值。
 */
export const DEFAULT_MAX_ATTEMPTS = 40

/**
 * 解析 `location.hash`（纯函数，零副作用）。
 *
 * 规则见 `design/interfaces.md` §解析规则：前缀必须恰好 `#pmboard` 且其后只能是串尾或 `?`；
 * `req` 取第一个、先解码再 `trim`、形状按 `^REQ-` 判定；其余键忽略（向前兼容）；
 * **`req` 存在但取值为空（`?req=` / 仅空白）判 malformed**——即「写了 req 却没写值」，
 * 与「根本没写 req（缺省，合法，只开面板）」区分开（三处文档口径：interfaces §解析规则、
 * test-cases TC-3、use-cases UC-4；两种情形对用户可见行为一致：都只开面板、不定位）。
 */
export function parsePmboardDeepLink(hash: string): DeepLinkParse {
  const raw = typeof hash === 'string' ? hash : ''
  if (!raw.startsWith(DEEP_LINK_PREFIX)) return { kind: 'ignored' }
  const rest = raw.slice(DEEP_LINK_PREFIX.length)
  // `#pmboardx` / `#pmboard-1` 之类不是我们的深链
  if (rest.length > 0 && !rest.startsWith('?')) return { kind: 'ignored' }

  const query = rest.startsWith('?') ? rest.slice(1) : ''
  // 缺省：没有 req 键 → 合法（只开面板，不定位）
  if (!/(^|&)req=/.test(query)) return { kind: 'ok' }

  let reqRaw: string | null
  try {
    reqRaw = new URLSearchParams(query).get('req')
  } catch {
    // 防御分支：URLSearchParams 本身很宽容（畸形 %-转义不抛），这里只是不让「未来更严的实现」
    // 把异常抛到调用栈上；真走到这里按「写了 req 但读不出值」处理。
    reqRaw = null
  }
  const reqId = (reqRaw ?? '').trim()
  // 写了 req 却为空/仅空白 → malformed（不是「缺省」）
  if (reqId.length === 0) return { kind: 'malformed', raw: '' }
  if (!REQ_ID_SHAPE.test(reqId)) return { kind: 'malformed', raw: reqId }
  return { kind: 'ok', reqId }
}

/**
 * 消费一次深链：清 hash → 登记定位 → 切面板（有界重试）。
 *
 * 固定时序（不变量 I-2/I-4，见 `design/data-model.md`）：
 *   `clearHash` → `requestFocus`（仅 ok 带 reqId）→ `selectPanel`（重试 ≤ maxAttempts）。
 */
export async function consumePmboardDeepLink(
  hash: string,
  ports: DeepLinkPorts,
  options: DeepLinkOptions = {},
): Promise<DeepLinkOutcome> {
  // 整个函数体都在 try 里：解析、参数归一、端口调用任一处意外都收敛成返回值，
  // 绝不让调用方（apply()）接到 rejected promise（不变量 I-8）。
  try {
    const parsed = parsePmboardDeepLink(hash)
    // ① ignored：一个字都不动（不变量 I-1）
    if (parsed.kind === 'ignored') return 'ignored'

    const requested = options?.maxAttempts
    const maxAttempts = typeof requested === 'number' && Number.isFinite(requested) && requested > 0
      ? Math.floor(requested)
      : DEFAULT_MAX_ATTEMPTS
    const defer = ports?.defer ?? ((run: () => void): void => { setTimeout(run, DEFAULT_RETRY_MS) })
    const log = (message: string, detail?: unknown): void => {
      try { ports?.log?.(message, detail) } catch { /* 日志端口坏了不影响结论 */ }
    }

    let focused = false
    // ② 消费即清（不变量 I-2）：清了才不会「刷新一次跳一次」；抛错也只记一笔，不中断后续
    try {
      ports.clearHash()
    } catch (err) {
      // hash 残留 → 下次刷新/HMR 重放会再消费一次（同 req，无可见危害），但值得说清
      log('深链：清 hash 失败（该链接刷新后可能再消费一次）', err)
    }

    // ③ 先登记定位意图，再切面板（不变量 I-4）：
    //    面板未挂载时，挂载那一次会 takeBoardFocus() 消费它——这是主路径
    if (parsed.kind === 'ok' && parsed.reqId !== undefined) {
      ports.requestFocus(parsed.reqId)
      focused = true
    } else if (parsed.kind === 'malformed') {
      log('深链：req 形状非法，只开面板不定位', { raw: parsed.raw })
    }

    // ④ 切面板：面板注册是延迟的（slots.inject），故有界重试
    let lastError: unknown
    let selected = false
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        ports.selectPanel(PANEL_ID)
        selected = true
        break
      } catch (err) {
        lastError = err
        if (attempt >= maxAttempts) break
        await new Promise<void>((resolve) => { defer(resolve) })
      }
    }

    if (!selected) {
      // 失败兜底：**只清自己登记过的**意图（复核：无条件清会误清别的动线
      // ——如节点面板「项目看板 ↗」——留下的 pending），且不留「下次进看板莫名跳走」的粘滞状态
      if (focused) {
        try { ports.clearFocus() } catch { /* 兜底清理失败不掩盖原始结论 */ }
      }
      log('深链：面板选择失败（重试耗尽）', { attempts: maxAttempts, error: String(lastError) })
      return 'failed'
    }

    if (parsed.kind === 'malformed') return 'malformed'
    return focused ? 'focused' : 'opened'
  } catch (err) {
    // 不变量 I-8：任何未预期异常都收敛成 failed，绝不冒泡到 apply()
    try { ports?.clearFocus?.() } catch { /* 同上 */ }
    try { ports?.log?.('深链：消费异常', err) } catch { /* 日志端口也坏了就只能静默收敛 */ }
    return 'failed'
  }
}
