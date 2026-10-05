/**
 * 追加日志的编解码与**计数截断**（REQ-261002161439-277d · t1 / FR-3）——JSON Lines 的纯函数层。
 *
 * ## 为什么日志要"计数截断"
 *
 * 提交顺序是**先追加日志、再写 `record.json`**（`record.json` 是唯一提交点）。崩在两步之间时，
 * 磁盘上会出现"日志多一行、计数还没涨"的形态。这不是错误数据，是**未提交的尾巴**：
 * 有效前缀由 `record.json` 里的计数（`commentCount` / `historyCount`）说了算，尾部行读侧忽略；
 * 下次追加前先把尾巴截掉再写同一 `seq`，文件长度是唯一允许回退的地方。
 *
 * 反向形态——**计数大于日志行数**——是真正的数据丢失（提交点指向了不存在的行，例如日志被手工
 * 删过或写日志失败但记录已提交）。此时**响亮抛错**，不静默降级成"少几条评论"：
 * 静默降级会把数据丢失伪装成正常读取，正是本仓反复强调要避免的最坏结果。
 *
 * ## 解码策略：行**不许丢**，缺陷**必须报**（真实数据实测教训）
 *
 * 2026-10-02 实测线上台账：1987 条评论里有 **3 条缺 `body`**，251 条状态事件里有 **1 条缺 `at`**、
 * **1 条缺 `by`**（历史写入方留下的残缺数据）。若把这些行判成"坏行"丢弃，后果是**seq 断裂**——
 * 计数截断发现有效行少于提交点声明的条数，直接抛 `COUNT_EXCEEDS_LINES`，**整个需求再也读不出来**。
 * 故解码分两类，处置完全不同：
 *
 * - **缺字段**（值为 `undefined`）→ **保留该行**，按类型要求填一个显式默认值，并把缺失字段
 *   登记进 `defects` 清单（迁移脚本据此报告，绝不静默）。行保住了，seq 不变量就保住了。
 * - **坏 JSON / 非对象 / `seq` 非法 / 关键字段类型错**（例如 `createdAt` 是字符串）→
 *   判为 `malformed` 丢弃：这类是**结构损坏**，填默认值等于伪造数据，宁可响亮失败。
 *
 * 身份字段（评论的 `id`、状态行的 `status`）缺失同样算 `malformed`：没有身份的行无法代表
 * 任何事实，填一个假 id 会让"丢了一条"变成"多了一条假的"。
 *
 * ## 不变量（写路径必须维持，测试锁死）
 *
 * - `seq` 从 0 单调 +1，且**等于该行在有效前缀里的下标**（第 i 条有效行的 `seq === i`）。
 * - 评论行**没有** `kind` 字段；历史行必有 `kind ∈ {status, advance}`——两类靠这一点区分。
 * - 正文里的换行由 JSON 转义承载，一行永远是一条记录（`encodeJournalLine` 保证）。
 *
 * 设计依据：`design/data-model.md` §追加日志、`design/backend.md` §分片仓储的写实现（提交顺序）。
 *
 * @module dsh-pmboard/domain/requirement/Journal
 */
import type { ActorRef, AdvanceEvent, AdvanceRecord, CommentRecord, StatusEvent, TokenSnapshot } from '../../shared/protocol.js'

/** 日志层错误码（模块内自足；适配器向上映射成 `REQBOARD_*` 传输码）。 */
export const JOURNAL_ERROR = {
  /** `count` 不是非负整数（调用方传了脏值）。 */
  INVALID_COUNT: 'REQBOARD_JOURNAL_INVALID_COUNT',
  /** 提交点声明的条数 > 磁盘上的有效行数 = **数据丢失**，响亮拒绝。 */
  COUNT_EXCEEDS_LINES: 'REQBOARD_JOURNAL_COUNT_EXCEEDS_LINES',
  /** 有效前缀里的 `seq` 不构成 0..count-1（重复/跳号，文件不满足不变量）。 */
  SEQ_MISMATCH: 'REQBOARD_JOURNAL_SEQ_MISMATCH',
} as const

/** 评论行（`comments.jsonl`）。 */
export interface CommentJournalLine {
  seq: number
  id: string
  body: string
  createdAt: number
  createdBy?: ActorRef
}

/** 状态流转行（`history.jsonl`，`kind='status'`）。 */
export interface StatusJournalLine {
  seq: number
  kind: 'status'
  status: string
  at: number
  by: ActorRef
  reason?: string
  inferred?: boolean
  tokenSnapshot?: TokenSnapshot
}

/** 推进事件行（`history.jsonl`，`kind='advance'`）——`AdvanceRecord` 加一个 `seq` 与 `kind`。 */
export interface AdvanceJournalLine extends AdvanceRecord {
  seq: number
  kind: 'advance'
}

/** 历史日志的两种行。 */
export type HistoryJournalLine = StatusJournalLine | AdvanceJournalLine

/** 日志行的并集（两个文件共用一套编解码）。 */
export type JournalLine = CommentJournalLine | HistoryJournalLine

/** 一条**字段缺失**的登记（行照常保留，缺陷上报给人）。 */
export interface JournalDefect {
  /** 出问题的行号（该行自己的 `seq`）。 */
  seq: number
  /** 缺失的字段名。 */
  field: string
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 合法 ActorRef（`by` / `createdBy` 的类型闸）。 */
function isActorRef(value: unknown): value is ActorRef {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'human' || kind === 'agent' || kind === 'system'
}

function isAdvanceOutcome(value: unknown): value is AdvanceRecord['outcome'] {
  return value === 'ok' || value === 'failed' || value === 'skipped' || value === 'noop'
}

/** 缺字段的填充默认值（**只有这几个**，且每次填充都进 defects）。显式标注类型，避免 `as const` 把值收窄成字面量。 */
const DEFAULTS: {
  body: string
  at: number
  by: ActorRef
  outcome: AdvanceRecord['outcome']
  durationMs: number
  detail: string
} = {
  body: '',
  at: 0,
  by: { kind: 'system' },
  outcome: 'noop',
  durationMs: 0,
  detail: '',
}

/**
 * 编解码一行 → 文本（**含行尾换行**：追加写与整份重写共用同一种编码，不会出现"最后一行没换行"的分歧）。
 *
 * `JSON.stringify` 会把正文里的换行/引号转义，因此**一行恒为一条记录**——这是 JSON Lines 成立的前提。
 */
export function encodeJournalLine(line: JournalLine): string {
  return JSON.stringify(line) + '\n'
}

/**
 * 解码一行并回收**字段缺失**清单（宽松策略的唯一实现，`decodeJournalLine` 是它的薄包装）。
 *
 * 返回 `undefined` = 该行是**结构损坏**（坏 JSON / 非对象 / `seq` 非法 / 关键字段类型错 / 身份字段缺失），
 * 调用方计入 `malformed`。
 */
function decodeWithDefects(text: string): { line: JournalLine; defects: readonly string[] } | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const o = parsed as Record<string, unknown>
  if (!isNonNegativeInt(o.seq)) return undefined
  const defects: string[] = []

  // ── 历史行：kind 决定形状（评论行没有 kind）────────────────────────────
  if (o.kind === 'status') {
    if (typeof o.status !== 'string') return undefined // 身份字段：缺失/类型错都算损坏
    if (o.at !== undefined && typeof o.at !== 'number') return undefined
    if (o.by !== undefined && !isActorRef(o.by)) return undefined
    let at = DEFAULTS.at
    if (typeof o.at === 'number') at = o.at
    else defects.push('at')
    let by = DEFAULTS.by
    if (isActorRef(o.by)) by = o.by
    else defects.push('by')
    return {
      defects,
      line: {
        seq: o.seq,
        kind: 'status',
        status: o.status,
        at,
        by,
        ...(typeof o.reason === 'string' ? { reason: o.reason } : {}),
        ...(typeof o.inferred === 'boolean' ? { inferred: o.inferred } : {}),
        ...(o.tokenSnapshot !== undefined ? { tokenSnapshot: o.tokenSnapshot as TokenSnapshot } : {}),
      },
    }
  }
  if (o.kind === 'advance') {
    if (typeof o.requirementId !== 'string' || typeof o.event !== 'string') return undefined
    if (o.at !== undefined && typeof o.at !== 'number') return undefined
    if (o.outcome !== undefined && !isAdvanceOutcome(o.outcome)) return undefined
    if (o.durationMs !== undefined && typeof o.durationMs !== 'number') return undefined
    if (o.detail !== undefined && typeof o.detail !== 'string') return undefined
    let at = DEFAULTS.at
    if (typeof o.at === 'number') at = o.at
    else defects.push('at')
    let outcome = DEFAULTS.outcome
    if (isAdvanceOutcome(o.outcome)) outcome = o.outcome
    else defects.push('outcome')
    let durationMs = DEFAULTS.durationMs
    if (typeof o.durationMs === 'number') durationMs = o.durationMs
    else defects.push('durationMs')
    let detail = DEFAULTS.detail
    if (typeof o.detail === 'string') detail = o.detail
    else defects.push('detail')
    return {
      defects,
      line: {
        seq: o.seq,
        kind: 'advance',
        at,
        requirementId: o.requirementId,
        event: o.event as AdvanceEvent,
        outcome,
        durationMs,
        detail,
        ...(typeof o.parentId === 'string' ? { parentId: o.parentId } : {}),
        ...(typeof o.subtaskId === 'string' ? { subtaskId: o.subtaskId } : {}),
      },
    }
  }
  if (o.kind !== undefined) return undefined // 未知 kind：不猜，判为损坏

  // ── 评论行 ────────────────────────────────────────────────────────────
  if (typeof o.id !== 'string') return undefined // 身份字段
  if (o.body !== undefined && typeof o.body !== 'string') return undefined
  if (o.createdAt !== undefined && typeof o.createdAt !== 'number') return undefined
  let body = DEFAULTS.body
  if (typeof o.body === 'string') body = o.body
  else defects.push('body')
  let createdAt = DEFAULTS.at
  if (typeof o.createdAt === 'number') createdAt = o.createdAt
  else defects.push('createdAt')
  return {
    defects,
    line: {
      seq: o.seq,
      id: o.id,
      body,
      createdAt,
      ...(isActorRef(o.createdBy) ? { createdBy: o.createdBy } : {}),
    },
  }
}

/**
 * 解码一行（**行不许丢**：缺字段填默认值并保留；结构损坏返回 `undefined`）。
 *
 * 只想拿行、不关心缺陷时用它；要缺陷清单用 `parseJournal`（迁移与诊断走那条）。
 */
export function decodeJournalLine(text: string): JournalLine | undefined {
  return decodeWithDefects(text)?.line
}

/**
 * 解析整份日志文本（JSON Lines）。
 *
 * `malformed` 与 `defects` **分别回报**：前者是结构损坏（行被丢弃，会破坏 seq 不变量，必须处置），
 * 后者是字段缺失（行保留了，但数据有残缺，迁移要如实报告）。
 */
export function parseJournal(text: string): { lines: JournalLine[]; malformed: number; defects: readonly JournalDefect[] } {
  const lines: JournalLine[] = []
  const defects: JournalDefect[] = []
  let malformed = 0
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim().length === 0) continue // 空行（含文件尾换行）不算坏行
    const decoded = decodeWithDefects(raw)
    if (decoded === undefined) {
      malformed += 1
      continue
    }
    lines.push(decoded.line)
    for (const field of decoded.defects) defects.push({ seq: decoded.line.seq, field })
  }
  return { lines, malformed, defects }
}

/**
 * 按提交点计数取**有效前缀**：恰好 `seq ∈ [0, count)` 的那些行，按 `seq` 升序。
 *
 * 三条判据都不放松（对应文件头的不变量）：
 * 1. `count` 必须是非负整数——脏入参直接拒；
 * 2. 有效行数必须**等于** `count`：少了 = 数据丢失（抛 `COUNT_EXCEEDS_LINES`）；
 * 3. 前缀的 `seq` 必须逐位等于下标：重复/跳号 = 文件不满足不变量（抛 `SEQ_MISMATCH`）。
 *
 * 多余的尾部行（未提交残留）**不报错**，直接不返回——那是正常的崩溃残留。
 */
export function truncateByCount<T extends { seq: number }>(lines: readonly T[], count: number): T[] {
  if (!isNonNegativeInt(count)) {
    throw coded(JOURNAL_ERROR.INVALID_COUNT, `日志有效条数必须是非负整数，收到：${String(count)}`)
  }
  const prefix = lines.filter((l) => l.seq < count).sort((a, b) => a.seq - b.seq)
  if (prefix.length !== count) {
    throw coded(
      JOURNAL_ERROR.COUNT_EXCEEDS_LINES,
      `提交点声明 ${count} 条有效日志，磁盘只找到 ${prefix.length} 条——日志缺失（数据丢失），拒绝静默降级`,
    )
  }
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i]!.seq !== i) {
      throw coded(JOURNAL_ERROR.SEQ_MISMATCH, `日志第 ${i} 位的 seq=${prefix[i]!.seq}，期望 ${i}（重复或跳号）`)
    }
  }
  return prefix
}

/** 下一行的 `seq`（无有效行时从 0 起）。 */
export function nextSeq(lines: readonly { seq: number }[]): number {
  let max = -1
  for (const l of lines) if (l.seq > max) max = l.seq
  return max + 1
}

/** 评论 → 日志行（写路径唯一入口：`seq` 由调用方按有效计数给出）。 */
export function toCommentLine(seq: number, comment: CommentRecord): CommentJournalLine {
  return {
    seq,
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    ...(comment.createdBy !== undefined ? { createdBy: comment.createdBy } : {}),
  }
}

/** 状态事件 → 日志行。 */
export function toStatusLine(seq: number, event: StatusEvent): StatusJournalLine {
  return {
    seq,
    kind: 'status',
    status: event.status,
    at: event.at,
    by: event.by,
    ...(event.reason !== undefined ? { reason: event.reason } : {}),
    ...(event.inferred !== undefined ? { inferred: event.inferred } : {}),
    ...(event.tokenSnapshot !== undefined ? { tokenSnapshot: event.tokenSnapshot } : {}),
  }
}

/** 推进事件 → 日志行。 */
export function toAdvanceLine(seq: number, record: AdvanceRecord): AdvanceJournalLine {
  return {
    seq,
    kind: 'advance',
    at: record.at,
    requirementId: record.requirementId,
    event: record.event,
    outcome: record.outcome,
    durationMs: record.durationMs,
    detail: record.detail,
    ...(record.parentId !== undefined ? { parentId: record.parentId } : {}),
    ...(record.subtaskId !== undefined ? { subtaskId: record.subtaskId } : {}),
  }
}

/** 日志行 → 评论（去掉 `seq`；装配完整记录用）。 */
export function commentOf(line: CommentJournalLine): CommentRecord {
  return {
    id: line.id,
    body: line.body,
    createdAt: line.createdAt,
    ...(line.createdBy !== undefined ? { createdBy: line.createdBy } : {}),
  }
}

/** 日志行 → 状态事件（装配 `statusHistory` 用）。 */
export function statusEventOf(line: StatusJournalLine): StatusEvent {
  return {
    status: line.status,
    at: line.at,
    by: line.by,
    ...(line.reason !== undefined ? { reason: line.reason } : {}),
    ...(line.inferred !== undefined ? { inferred: line.inferred } : {}),
    ...(line.tokenSnapshot !== undefined ? { tokenSnapshot: line.tokenSnapshot } : {}),
  }
}

/** 日志行 → 推进事件（装配 `advance.history` 用）。 */
export function advanceRecordOf(line: AdvanceJournalLine): AdvanceRecord {
  return {
    at: line.at,
    requirementId: line.requirementId,
    event: line.event,
    outcome: line.outcome,
    durationMs: line.durationMs,
    detail: line.detail,
    ...(line.parentId !== undefined ? { parentId: line.parentId } : {}),
    ...(line.subtaskId !== undefined ? { subtaskId: line.subtaskId } : {}),
  }
}
