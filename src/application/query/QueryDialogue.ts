/**
 * 对话 Tab 查询（REQ-261004222448-292a · t-8eeed9 · design/backend.md §S-6 `buildDialogue`）。
 *
 * 目标：把一条需求的会话日志抽成**一条连续时间线**——只留人说的话、agent 的文本回复，
 * 以及机器事件（阶段推进 / 计划退回 / 交接 / 中断 / 挂起确认 / 验收裁决）作为系统消息混排。
 * 工具调用、工具结果、推理块、run_code 包裹内容与"正在读取文件…"类过程叙述**一律不进响应**
 * （design/interfaces.md 明写「过滤规则必须写死在服务端并有断言」）。
 *
 * ## 为什么过滤放在这里而不是前端
 * 「前端拿不到就不会渲染错」。前端过滤等于把"哪些是机器噪声"的知识复制两份，而这两份必然漂移；
 * 响应里一旦出现 `tool/call`，页面就有机会把它渲染成人话。故本模块是**唯一的过滤点**。
 *
 * ## 两条读法（按可得性二选一）
 * 1. **快照事件优先**：`snapshotEvents(key)`——活窗口的同步快照，零日志读；
 * 2. **回落持久化冷读**：`readEvents(key)`——窗口已冷却 / 快照不可得时的异步读。
 * 语义约定（本卡与读端）：
 *   `undefined` = **读不到**（窗口不存在 / 通道关闭）→ 候选窗口全部如此即**响亮降级**；
 *   `[]`        = **读到了、就是空的**（空会话）→ 如实返回空时间线，不冒充"读不到"。
 * 两者必须分开，否则"没有对话"与"读不到对话"在页面上无法区分（FR-12 诚实降级）。
 *
 * ## 契约缺口（本卡不擅自改协议）
 * `PanelQueryDeps.sessions` 的类型是 `SessionProbe`（`application/ports.ts`），而它目前**没有
 * 任何读会话事件的成员**（只有 identity/痕迹/token/上下文压力）。本模块因此按
 * `DialogueSessionEventsPort`（下面的接口）**结构探测** `deps.sessions`：
 *   · 两个方法都没有 → `port-unavailable`（未接线，响亮降级）；
 *   · 有方法但都返回 `undefined` → `no-snapshot`（会话读不到，响亮降级）。
 * 需要主窗口接线：给 `SessionProbe` 加这两个方法（或注入一个带它们的对象），见完工汇报。
 *
 * @module dsh-pmboard/application/query/QueryDialogue
 */
import { fmt } from '../../domain/text/fmt.js'
import type {
  Degrade,
  DialogueItem,
  DialogueResponse,
  DialogueSystemEvt,
  RequirementRecord,
} from '../../shared/protocol.js'
import type { PanelQueryDeps, PanelQueryInput, QueryDialogue } from './contracts.js'

/** 分页默认 20 条（design/interfaces.md：默认最近 20 条）。 */
const DEFAULT_LIMIT = 20
/** 分页上限 50（路由层另有 400 校验；这里再夹一次，任何入参都不至于把响应放大）。 */
const MAX_LIMIT = 50
/**
 * 候选窗口上限 8：一个需求可能挂着多个席位与大量执行会话，详情请求不该被异常数据拖垮。
 * 截断只影响"更早的会话是否入流"，不影响已入流内容的正确性。
 */
const MAX_WINDOWS = 8

/**
 * 会话事件读端（**加法式能力探测**形状）——见文件头「契约缺口」。
 *
 * `key` = 窗口码，而 pmboard 的窗口码就是 root agent 的会话 id
 * （`adapters/SessionProbeAdapter.ts` 的 `windowKey`），故快照与冷读用同一个键。
 */
export interface DialogueSessionEventsPort {
  /** 活窗口快照事件（**同步**，优先）。读不到 → `undefined`（回落冷读）。 */
  snapshotEvents(key: string): readonly unknown[] | undefined
  /** 持久化冷读（异步，回落）。读不到 → `undefined`（该窗口视为不可得）。 */
  readEvents(key: string): Promise<readonly unknown[] | undefined>
}

/**
 * 合成单列前的中间条目。
 *
 * 为什么要 `rank` / `seq`：时间相同的条目（同一毫秒内先落台账事件、后到会话消息）若无稳定次序，
 * 两次请求可能给出不同顺序，分页游标就会跳条。排序键 = (at, rank, seq)：
 * `rank` 固定「会话事件(0) 在系统消息(1) 之前」，`seq` 用会话内的事件序号/在流中的下标。
 */
interface RawItem {
  at: number
  rank: 0 | 1
  seq: number
  item: DialogueItem
}

/** 降级信封（四种 reason 之一 + 人话 note；页面按 reason 给不同文案）。 */
function degrade(reason: Degrade['reason'], note: string): Degrade {
  return { available: false, reason, note }
}

/** 入参夹取：缺省 20、上限 50、至少 1（非数/NaN → 缺省）。 */
function clampLimit(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT)
}

/** 异常取文本（进降级 note；不把 Error 对象塞进响应）。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 能力探测：`deps.sessions` 上有没有会话事件读端。
 * 两个方法都没有 → `undefined`（调用方落 `port-unavailable`，**不**返回空数组冒充"没有对话"）。
 */
function eventsPortOf(sessions: unknown): Partial<DialogueSessionEventsPort> | undefined {
  if (typeof sessions !== 'object' || sessions === null) return undefined
  const probe = sessions as { snapshotEvents?: unknown; readEvents?: unknown }
  const hasSnapshot = typeof probe.snapshotEvents === 'function'
  const hasCold = typeof probe.readEvents === 'function'
  if (!hasSnapshot && !hasCold) return undefined
  return sessions as Partial<DialogueSessionEventsPort>
}

/** 一条会话事件的读取结果（`events === undefined` = 读不到）。 */
interface EventRead {
  events: readonly unknown[] | undefined
  error?: string
}

/** 快照优先、冷读回落（两条读法按可得性二选一；单窗口失败不影响其它窗口）。 */
async function readEventsFor(port: Partial<DialogueSessionEventsPort>, key: string): Promise<EventRead> {
  if (typeof port.snapshotEvents === 'function') {
    try {
      const snapshot = port.snapshotEvents(key)
      if (Array.isArray(snapshot)) return { events: snapshot }
    } catch {
      /* 快照读抛错 → 不当场失败，继续试冷读（读法二选一，不是二选零） */
    }
  }
  if (typeof port.readEvents === 'function') {
    try {
      const cold = await port.readEvents(key)
      if (Array.isArray(cold)) return { events: cold }
    } catch (err) {
      return { events: undefined, error: errText(err) }
    }
  }
  return { events: undefined }
}

/**
 * 该需求的候选会话窗口：席位 → 立项来源窗口 → 任务执行会话。
 *
 * 为什么按这个顺序：席位是"现在谁在这条需求上"（对话主现场），来源窗口兜住席位折算前的老记录，
 * 执行会话兜住子卡实际干活的窗口。三者都可能重叠，故去重。
 */
async function candidateWindows(deps: PanelQueryDeps, record: RequirementRecord): Promise<string[]> {
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (raw: unknown): void => {
    if (typeof raw !== 'string') return
    const key = raw.trim()
    if (key.length === 0 || seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }
  for (const seat of record.seats ?? []) add(seat.windowKey)
  add(record.sourceSessionId)
  try {
    const tasks = await deps.tasks.listByRequirement(record.id)
    for (const task of tasks) for (const execution of task.executions ?? []) add(execution.sessionId)
  } catch {
    /* 队列读不到 ≠ 对话不可得：会话事件仍按席位 / 来源窗口读，不因此把整条流降级 */
  }
  return keys.slice(0, MAX_WINDOWS)
}

/** 内容块里只认 `type === 'text'`——tool-call / reasoning / image 等块在这里被**结构性**排除。 */
function textBlocksOf(message: unknown): readonly unknown[] {
  if (typeof message !== 'object' || message === null) return []
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return [content]
  return Array.isArray(content) ? content : []
}

/**
 * run_code 包裹内容：整段剥掉（连同包裹体）。
 * 为什么连内容一起剥：卡验收要求产物里**一个字都不许出现** `run_code`；留着内层正文就会留痕。
 */
const RUN_CODE_TAG_RE = /<run_code\b[^>]*>[\s\S]*?<\/run_code>/gi
const RUN_CODE_FENCE_RE = /```[ \t]*run_code[^\n]*\n[\s\S]*?```/gi

function cleanText(raw: string): string {
  return raw.replace(RUN_CODE_TAG_RE, '').replace(RUN_CODE_FENCE_RE, '').trim()
}

/**
 * "正在读取文件…"类过程叙述：**单行、短、以省略号收尾、以过程动词开头**才判为叙述。
 *
 * 为什么把条件收这么紧：这是启发式判据，宽一格就会吃掉正文（"我读取文件后发现…"是有效回复）。
 * 只挡设计稿点名的那一类（导航式短句），宁可漏挡也不误杀。
 */
const NARRATION_RE =
  /^(?:正在|开始|继续)?(?:读取|查看|打开|列出|遍历|搜索|扫描|查找|检查)(?:文件|目录|代码|实现|相关代码)?[^\n]{0,24}(?:…|\.\.\.)$/

function isProcessNarration(text: string): boolean {
  return !text.includes('\n') && NARRATION_RE.test(text)
}

/** 取消息里的正文（text 块拼接；每块先剥 run_code 再 trim，空块丢弃）。 */
function textOfMessage(message: unknown): string {
  const parts: string[] = []
  for (const block of textBlocksOf(message)) {
    if (typeof block === 'string') {
      const text = cleanText(block)
      if (text.length > 0) parts.push(text)
      continue
    }
    if (typeof block !== 'object' || block === null) continue
    const typed = block as { type?: unknown; text?: unknown }
    if (typed.type !== 'text') continue
    if (typeof typed.text !== 'string') continue
    const text = cleanText(typed.text)
    if (text.length > 0) parts.push(text)
  }
  return parts.join('\n\n')
}

/**
 * 消息本体：`user/message` 的 data **就是**消息（`{id, role, content, source}`）；
 * `assistant/message` 的 data 是 `{turn, step, message, stream}`，消息在 `data.message`。
 * 两种形状都做宽容读（搬运期 / 直 append 的标本可能只有一层）。
 */
function messageOf(type: string, data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined
  const wrapped = (data as { message?: unknown }).message
  const hasWrapper = typeof wrapped === 'object' && wrapped !== null
  if (type === 'assistant/message') return hasWrapper ? wrapped : data
  if ((data as { content?: unknown }).content !== undefined) return data
  return hasWrapper ? wrapped : data
}

/** 消息来源 kind（`source.kind`；缺失 → undefined）。**唯一**区分"人说的"与"插件自署"的判据。 */
function sourceKindOf(message: unknown): string | undefined {
  const source = (message as { source?: unknown } | undefined)?.source
  if (typeof source !== 'object' || source === null) return undefined
  const kind = (source as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : undefined
}

/**
 * 会话事件 → 人机条目。
 *
 * 保留规则（design 口径，逐条写死）：
 *   · `user/message`：**只认 `source.kind === 'user'`**。插件自署来源的消息（`reqboard-handoff`
 *     / `reqboard-open-window` / `dive` / `plugin` …）**不是人类发言**——把它渲染成「人」是谎报，
 *     渲染成「agent」又会与台账侧的系统消息（交接/中断留痕）重复，故一律**丢弃**，其机器语义
 *     由系统消息承载（`sourceKindOf` 就是这条判断的单一依据）。
 *   · `assistant/message`：取 text 块（推理块/tool-call 块在上面已被结构性排除）。
 *   · 时间：`time`（Unix ms）；缺时间戳的标本按**同窗口上一条**的时间兜底，首条用注入时钟——
 *     绝不用"现在"，否则历史消息会被拖到时间线末尾。
 */
function collectSessionItems(events: readonly unknown[], windowKey: string, fallbackAt: number): RawItem[] {
  const out: RawItem[] = []
  let lastAt = fallbackAt
  events.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return
    const event = raw as { type?: unknown; seq?: unknown; time?: unknown; data?: unknown }
    const type = typeof event.type === 'string' ? event.type : ''
    if (type !== 'user/message' && type !== 'assistant/message') return
    const at = typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : lastAt
    lastAt = at
    const seq = typeof event.seq === 'number' && Number.isFinite(event.seq) ? event.seq : index
    const message = messageOf(type, event.data)
    if (type === 'user/message' && sourceKindOf(message) !== 'user') return
    const text = textOfMessage(message)
    if (text.length === 0 || isProcessNarration(text)) return
    out.push({
      at,
      rank: 0,
      seq,
      item: {
        kind: type === 'user/message' ? 'human' : 'agent',
        at,
        windowKey,
        text,
      },
    })
  })
  return out
}

/**
 * 评论留痕 → 系统消息的**闭集**映射表（措辞取原文，不重新措辞）。
 *
 * 为什么是闭集：设计只列出六类机器事件。把 `[里程碑催办]` / `[Dive]` / `[自动推进]` 这类
 * 内部簿记也倒进对话流，"一条流"立刻变回日志墙——那正是本次改造要消掉的东西。
 *
 * `[回退]` 刻意**不**在此表：回退必然同时写一条 `statusHistory` 事件（带同一句 reason 原文），
 * 两条都收就是同一件事渲染两遍。
 */
const SYSTEM_COMMENT_EVTS: readonly { readonly prefix: string; readonly evt: DialogueSystemEvt }[] = [
  { prefix: '[交接]', evt: 'handoff' },
  { prefix: '[确认弹框]', evt: 'confirm-pending' },
  { prefix: '[验收单]', evt: 'verify' },
  { prefix: '[验收]', evt: 'verify' },
]

/**
 * 台账 → 系统消息。措辞全部取台账字段原文：
 * `StatusEvent.reason` / `plan.rejectedReason` / `interruption.reason` / 评论 body / `verification.reviewNote`；
 * 只有在原文缺席时才落一句**事实性**兜底（状态名/阶段名），不做润色。
 * 回填事件（`StatusEvent.inferred === true`）原样透传 `inferred:true`，页面据此打「回填」标。
 */
function systemItemsOf(record: RequirementRecord): RawItem[] {
  const out: RawItem[] = []
  const push = (at: number, evt: DialogueSystemEvt, text: string, inferred?: true): void => {
    if (!Number.isFinite(at) || text.trim().length === 0) return
    out.push({
      at,
      rank: 1,
      seq: out.length,
      item: { kind: 'system', at, evt, text, ...(inferred === true ? { inferred: true } : {}) },
    })
  }

  // ① 阶段推进：reason 原文；无 reason → 只报事实（不替人措辞）。
  for (const event of record.statusHistory ?? []) {
    const reason = typeof event.reason === 'string' ? event.reason.trim() : ''
    push(
      event.at,
      'stage-advance',
      reason.length > 0 ? reason : fmt('阶段推进 → {status}', { status: event.status }),
      event.inferred === true ? true : undefined,
    )
  }

  // ② 计划退回：rejectedReason（人填的理由）原文。
  const plan = record.plan
  if (plan?.rejectedAt !== undefined) {
    const reason = typeof plan.rejectedReason === 'string' ? plan.rejectedReason.trim() : ''
    push(plan.rejectedAt, 'plan-rejected', reason.length > 0 ? reason : '拆分计划被退回（未填理由）')
  }

  // ③ 中断：断点 reason 原文（交棒检查点写的是 "checkpoint"，同样原样呈现）。
  const interruption = record.interruption
  if (interruption !== undefined) {
    const reason = typeof interruption.reason === 'string' ? interruption.reason.trim() : ''
    push(
      interruption.at,
      'interrupt',
      reason.length > 0 ? reason : fmt('中断于 {stage}（未记录原因）', { stage: interruption.stage }),
    )
  }

  // ④ 交接 / 挂起确认 / 验收裁决：评论留痕原文。
  const verifyCommentAt = new Set<number>()
  for (const comment of record.comments ?? []) {
    const body = typeof comment.body === 'string' ? comment.body : ''
    const hit = SYSTEM_COMMENT_EVTS.find(matched => body.startsWith(matched.prefix))
    if (hit === undefined) continue
    if (hit.evt === 'verify') verifyCommentAt.add(comment.createdAt)
    push(comment.createdAt, hit.evt, body)
  }

  // ⑤ 验收裁决兜底：有的路径只盖 reviewedAt / reviewNote 不写评论（同一时刻已在 ④ 出现则不重复）。
  const verification = record.verification
  if (verification?.decision !== undefined) {
    const at = verification.reviewedAt ?? verification.submittedAt
    if (!verifyCommentAt.has(at)) {
      const note = typeof verification.reviewNote === 'string' ? verification.reviewNote.trim() : ''
      push(
        at,
        'verify',
        note.length > 0 ? note : verification.decision === 'pass' ? '验收通过' : '验收退回返工',
      )
    }
  }

  return out
}

/**
 * 端点 5 · 对话一条流（`QueryDialogue` 的实现）。
 *
 * 只 await 注入的端口（`store` / `tasks` / `sessions`），不碰文件系统、不 import node:（层边界门禁）；
 * 时间一律来自事件与台账，缺时间的标本用 `deps.now`（注入时钟）兜底，不用 `Date.now()` 直读。
 *
 * 出口名 `queryDialogue`：与同目录兄弟实现（`queryTrunk` / `queryDag` / `queryTokenExtension`）
 * 同一套拼法，接线只需要记一种写法；设计稿的 `buildDialogue` 以下面的别名保留。
 */
export const queryDialogue: QueryDialogue = async (deps: PanelQueryDeps, input: PanelQueryInput) => {
  const requirementId = input.requirementId

  // ① 端口可得性：读端未装配 → 响亮降级（**不**返回空数组冒充「没有对话」）。
  const port = eventsPortOf(deps.sessions)
  if (port === undefined) {
    return degrade(
      'port-unavailable',
      '会话事件读端口未装配（sessions 上没有 snapshotEvents / readEvents）——对话流不可用，不是「没有对话」',
    )
  }

  // ② 台账（系统消息的唯一来源）。
  let record: RequirementRecord | undefined
  try {
    record = await deps.store.get(requirementId)
  } catch (err) {
    return degrade('ledger-unreadable', fmt('台账读不到（{id}）：{reason}', { id: requirementId, reason: errText(err) }))
  }
  if (record === undefined) {
    return degrade(
      'ledger-unreadable',
      fmt('台账里没有需求 {id}（路由层应先回 404；这里不伪造一条空对话）', { id: requirementId }),
    )
  }

  // ③ 会话事件：逐候选窗口按「快照优先、冷读回落」取；任一窗口读得到就算读得到。
  const clock = deps.now?.() ?? Date.now()
  const windows = await candidateWindows(deps, record)
  const collected: RawItem[] = []
  let readable = false
  let lastFailure: string | undefined
  for (const key of windows) {
    const read = await readEventsFor(port, key)
    if (read.error !== undefined) lastFailure = read.error
    if (read.events === undefined) continue
    readable = true
    collected.push(...collectSessionItems(read.events, key, clock))
  }
  if (!readable) {
    return degrade(
      'no-snapshot',
      windows.length === 0
        ? '该需求没有可读的会话窗口（席位与立项来源窗口都取不到）——不返回空数组冒充「没有对话」'
        : fmt('{n} 个候选窗口都取不到会话事件快照{tail}', {
            n: windows.length,
            tail: lastFailure === undefined ? '' : '（最近一次失败：' + lastFailure + '）',
          }),
    )
  }

  // ④ 人机条目 + 系统消息合成**单列**（排序键见 RawItem 注释）。
  collected.push(...systemItemsOf(record))
  collected.sort((a, b) => a.at - b.at || a.rank - b.rank || a.seq - b.seq)
  const timeline = collected.map(entry => entry.item)

  // ⑤ 游标分页：`before` = 已从**最新端**消费掉的条数（缺省 0）。
  //    为什么用"从新端数的偏移"而不是时间戳：多条消息落在同一毫秒时，时间戳游标会重复或跳条；
  //    偏移游标对任意时刻都精确，且 `total` 与 `hasMore` 都能一次算清。
  const total = timeline.length
  const limit = clampLimit(input.limit)
  const rawBefore = typeof input.before === 'number' && Number.isFinite(input.before) ? Math.trunc(input.before) : 0
  const before = Math.min(Math.max(rawBefore, 0), total)
  const end = Math.max(0, total - before)
  const start = Math.max(0, end - limit)
  const items = timeline.slice(start, end)
  const hasMore = start > 0
  const page: DialogueResponse['page'] = {
    total,
    hasMore,
    ...(hasMore ? { before: before + items.length } : {}),
  }

  return { items, page }
}

/** 设计稿（design/backend.md §S-6）里的名字，指向同一个实现——两个名字不会漂移。 */
export const buildDialogue: QueryDialogue = queryDialogue
