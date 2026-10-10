/**
 * 注入留痕（REQ-422af1 t6，INV-6）—— "这次到底注入了什么"的可查台账。
 *
 * 本模块是**纯逻辑**（记录类型 + ring buffer + 只读查询 + 条目组装）：不 import node:
 * （application 层硬约束，tests/layer-boundary.test.ts 机械检查）。落盘由适配器
 * adapters/InjectionLogFile.ts 实现（原子写 + 串行队列），本模块不碰 fs、不取时间
 * （at 由适配器落章）。
 *
 * 容量有界：ring buffer 保留最近 INJECTION_LOG_CAP=500 条（高频写入不放大文件）。
 *
 * @module dsh-pmboard/application/internal/injection-log
 */
import { HIT_LEVEL_LABELS, type ResolvedPrompt } from '../../domain/prompt/index.js'
import { fmt } from '../../domain/text/fmt.js'

/** ring buffer 保留条数（与 design/architecture.md §2 一致）。 */
export const INJECTION_LOG_CAP = 500

/** 留痕文件的相对位置（相对 DSH 主目录）。 */
export const INJECTION_LOG_REL = 'state/prompt-injection-log.json'

/**
 * 记录点（谁写的这条留痕）。**这是 FR-9「后果」列的唯一依据**：
 * 同一个「注入了什么」在几个点上含义完全不同——H3 与轮次是真投递进会话，节点结算只留痕。
 *
 * 三个值对应 design/data-model.md 的三个写入点；`system-prompt` 是实施时补的第四处
 * （`capture-section` 装配每轮系统提示词时也记留痕，设计稿只列了三处——见 t-cc7233 汇报）。
 *
 * `system-notice` 是第五处（REQ-261007100513-6749 t3）：**易变段的尾部投递**
 * （`application/internal/notice-delivery.ts` → `inbox.prepend('next-step')`）。
 * 它与 `system-prompt` 的区别正是本需求要能分开读的那件事：一个是"进了头部段"，
 * 一个是"进了尾部通道"。**只增取值**：老日志没有这个值，读端照旧容忍未知。
 */
export type InjectionLogOrigin = 'gate-h3' | 'dive-node' | 'dive-round' | 'system-prompt' | 'system-notice'

/** 单条正文上限（design/data-model.md §注入留痕）：超出截断并置 `truncated`。 */
export const INJECTION_LOG_TEXT_MAX = 8000

/** 一条注入留痕（十字段 + v2 新增四字段）。 */
export interface InjectionLogEntry {
  /** 写入时刻（epoch ms；由适配器注入的 clock 落章） */
  at: number
  windowKey: string
  stage: string
  difficulty: string
  category: string
  routeKey: string
  /** 命中层级标签（exact/②/③/④/⑤） */
  hitLevel: string
  fragmentIds: string[]
  charCount: number
  /** 因预算被裁掉的片段 id */
  trimmed: string[]
  /** 难度推断依据（FR-16）。可选：兼容历史条目（当时没有推断）。 */
  difficultyReasons?: string[]
  /**
   * ── v2 新增（REQ-261004222448-292a t-cc7233）────────────────────────────
   * 落盘上**可选**：ring buffer 是 JSON 文件，旧条目没有这四个字段，读端补 'unknown'/null。
   * 写入侧经 `InjectionLogInput` 强制必填，读端经 `toInjectionLogView` 显式降级。
   */
  origin?: InjectionLogOrigin
  /** 是否**真的投递进会话**（false = 只留痕）。旧条目缺失 ⇒ 读端 null，绝不默认成 true。 */
  delivered?: boolean
  /** 注入/投递正文（受 INJECTION_LOG_TEXT_MAX 约束，供页面读「到底说了什么」） */
  text?: string
  /** text 超上限被截断（页面须显式标「已截断」，不许当完整正文） */
  truncated?: boolean
}

/** 页面读端视图：旧条目补 `origin:'unknown'` / `delivered:null`（**不许默认成「已投递」**）。 */
export interface InjectionLogView extends Omit<InjectionLogEntry, 'origin' | 'delivered'> {
  origin: InjectionLogOrigin | 'unknown'
  delivered: boolean | null
}

/**
 * 写入侧入参（不含 at——时间由适配器统一落章）。
 *
 * v2 的 origin / delivered **必填**：这次修的就是「有留痕 ≠ 收到了」——
 * 若允许省缺，写点会悄悄退回"留了痕但说不清后果"，页面再也答不出 FR-9 的后果列。
 */
export type InjectionLogInput = Omit<InjectionLogEntry, 'at' | 'origin' | 'delivered'> & {
  origin: InjectionLogOrigin
  delivered: boolean
}

/** 留痕端口：注入点只调 record（同步返回，落盘由实现方串行化）。 */
export interface InjectionLogPort {
  record(entry: InjectionLogInput): void
}

/**
 * 留痕的**只读**端口（REQ-422af1 t11）：看板只读回查「本次注入了什么」，
 * 不引入任何写操作——读侧与写侧在类型上就分开，避免看板顺手多出一个写入口。
 */
export interface InjectionLogReadPort {
  /** 只读全量（缺文件 → []；损坏 → 抛错，由调用方决定是否降级）。 */
  readAll(): Promise<InjectionLogEntry[]>
}

/** 十字段字段名（读回校验 / 单测断言共用单点）。v2 的四个字段是**可选**，故不在此列。 */
export const INJECTION_LOG_FIELDS: readonly (keyof InjectionLogEntry)[] = [
  'at', 'windowKey', 'stage', 'difficulty', 'category', 'routeKey', 'hitLevel', 'fragmentIds', 'charCount', 'trimmed',
]

/** v2 新增字段名（同样单点：读端降级口径与断言共用）。 */
export const INJECTION_LOG_V2_FIELDS: readonly (keyof InjectionLogEntry)[] = [
  'origin', 'delivered', 'text', 'truncated',
]

const ORIGINS: readonly InjectionLogOrigin[] = [
  'gate-h3', 'dive-node', 'dive-round', 'system-prompt',
  // REQ-261007100513-6749 t3（**只增**）：漏了它，`isInjectionLogEntry` 会把尾部投递的留痕判成
  // 残缺记录整条丢掉——门禁变红是轻的，重的是"投了却说没投"（读端只剩 unknown）。
  'system-notice',
]

/** 截断长正文（FR-9）：**不许静默丢弃**——截断必须留下 `truncated` 标，页面才能说「已截断」。 */
export function capInjectionText(
  text: string,
  max: number = INJECTION_LOG_TEXT_MAX,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

/** 读端降级：旧条目缺字段 → 来源未知 / 投递不可知（**不默认成「已投递」**）。 */
export function toInjectionLogView(entry: InjectionLogEntry): InjectionLogView {
  return {
    ...entry,
    origin: entry.origin ?? 'unknown',
    delivered: entry.delivered ?? null,
  }
}

/**
 * 由解析结果组装留痕入参。difficulty/category 从 routeKey 拆出（routeKey 的单一事实源
 * 就在解析结果里，避免调用方再传一遍造成漂移）。
 *
 * `record` 里的 origin/delivered 由**调用点**给：只有写点自己知道这条到底投没投进会话
 * （H3 投了、节点结算没投、系统提示词装配每次都进 prompt）。正文取 `resolved.text`。
 */
export function injectionLogInputFromResolved(
  resolved: ResolvedPrompt,
  windowKey: string,
  record: { origin: InjectionLogOrigin; delivered: boolean; text?: string },
): InjectionLogInput {
  const [stage, difficulty, category] = resolved.routeKey.split('/')
  const capped = capInjectionText(record.text ?? resolved.text)
  return {
    windowKey,
    stage: stage ?? '',
    difficulty: difficulty ?? '',
    category: category ?? '',
    routeKey: resolved.routeKey,
    hitLevel: HIT_LEVEL_LABELS[resolved.hitLevel],
    fragmentIds: [...resolved.fragmentIds],
    charCount: resolved.charCount,
    trimmed: [...resolved.trimmed],
    ...(resolved.difficultyReasons !== undefined && resolved.difficultyReasons.length > 0
      ? { difficultyReasons: [...resolved.difficultyReasons] }
      : {}),
    origin: record.origin,
    delivered: record.delivered,
    text: capped.text,
    ...(capped.truncated ? { truncated: true } : {}),
  }
}

/**
 * 由**轮次投递**组装留痕入参（origin='dive-round'）。
 *
 * 为什么不能复用 `injectionLogInputFromResolved`：轮次消息不是「按路由取词」的产物——
 * 它没有 routeKey / 分片 / 命中层级（那些是分片库的概念）。此处把十字段里属于"取词"的
 * 四项留空，表示**本就不是取词注入**，而不是填一个假 routeKey 让人以为查得到。
 */
export function injectionLogInputForRound(params: {
  windowKey: string
  text: string
  delivered: boolean
}): InjectionLogInput {
  const capped = capInjectionText(params.text)
  return {
    windowKey: params.windowKey,
    stage: '',
    difficulty: '',
    category: '',
    routeKey: '',
    hitLevel: '',
    fragmentIds: [],
    charCount: params.text.length,
    trimmed: [],
    origin: 'dive-round',
    delivered: params.delivered,
    text: capped.text,
    ...(capped.truncated ? { truncated: true } : {}),
  }
}

/**
 * 由**易变段投递**组装留痕入参（REQ-261007100513-6749 t3：origin='system-notice' = 真进尾部通道；
 * origin='system-prompt' = 通道不可得时退回头部）。
 *
 * 与 `injectionLogInputForRound` 同款：尾部投递不是「按路由取词」的产物，故十字段里属于取词的
 * 四项留空（**不填假 routeKey**）；`text` 就是**投出去的那份正文**（不改写、不加前缀——
 * 页面据它回答「窗口到底收到了什么」）。
 */
export function injectionLogInputForNotice(params: {
  windowKey: string
  text: string
  delivered: boolean
  origin: 'system-notice' | 'system-prompt'
}): InjectionLogInput {
  const capped = capInjectionText(params.text)
  return {
    windowKey: params.windowKey,
    stage: '',
    difficulty: '',
    category: '',
    routeKey: '',
    hitLevel: '',
    fragmentIds: [],
    charCount: params.text.length,
    trimmed: [],
    origin: params.origin,
    delivered: params.delivered,
    text: capped.text,
    ...(capped.truncated ? { truncated: true } : {}),
  }
}

/** ring buffer 追加：保留最近 cap 条（超界丢最旧）。cap 非法 → 响亮抛错。 */
export function appendToInjectionLog(
  existing: readonly InjectionLogEntry[],
  entry: InjectionLogEntry,
  cap: number = INJECTION_LOG_CAP,
): InjectionLogEntry[] {
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new Error(fmt('injection-log cap 必须是正整数，收到 {cap}', { cap }))
  }
  const next = [...existing, entry]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/** 只读查询：最近 k 条（保持写入顺序，旧→新）。k 非法 → 响亮抛错。 */
export function queryInjectionLog(entries: readonly InjectionLogEntry[], k: number): InjectionLogEntry[] {
  if (!Number.isInteger(k) || k < 0) {
    throw new Error(fmt('injection-log 查询条数必须是非负整数，收到 {k}', { k }))
  }
  return entries.slice(Math.max(0, entries.length - k))
}

/** 一条记录是否含全部十字段且类型正确（读回时防残缺记录混入）。 */
export function isInjectionLogEntry(raw: unknown): raw is InjectionLogEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  if (typeof o.at !== 'number' || !Number.isFinite(o.at)) return false
  for (const key of ['windowKey', 'stage', 'difficulty', 'category', 'routeKey', 'hitLevel'] as const) {
    if (typeof o[key] !== 'string') return false
  }
  if (typeof o.charCount !== 'number' || !Number.isFinite(o.charCount)) return false
  if (!Array.isArray(o.fragmentIds) || !o.fragmentIds.every((x) => typeof x === 'string')) return false
  if (!Array.isArray(o.trimmed) || !o.trimmed.every((x) => typeof x === 'string')) return false
  // v2 字段**可选**（旧条目没有）：只在"写了"的时候校验类型——写歪了要红，
  // 而不是把整段历史记录判成残缺（那会让页面从"来源未知"退化成"整块读不到"）。
  if (o.origin !== undefined && !(typeof o.origin === 'string' && ORIGINS.includes(o.origin as InjectionLogOrigin))) return false
  if (o.delivered !== undefined && typeof o.delivered !== 'boolean') return false
  if (o.text !== undefined && typeof o.text !== 'string') return false
  if (o.truncated !== undefined && typeof o.truncated !== 'boolean') return false
  return true
}
