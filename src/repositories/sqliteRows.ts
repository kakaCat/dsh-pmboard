/**
 * SQLite 的**行 ↔ 记录**映射与 SQL 语句（REQ-261004103330-005f FR-7 / FR-9）。
 *
 * ## 为什么单独一个文件
 *
 * 两个理由，都与"错一次很难查"有关：
 * 1. `SqliteRequirementStore` 有单文件 ≤400 行的门禁，而列映射 + 语句表本身就近两百行；
 * 2. 更关键的是**读写必须同源**：写侧拆列、读侧拼回，两处各写一份必然漂移，
 *    漂移的症状是"存进去的和读出来的不是同一条事实"——最贵的一类缺陷。
 *
 * ## 口径：**列是镜像，parts 是原件**
 *
 * - `requirements` / `archived` 的标量列承载"能无损往返"的字段（存在 ↔ 非 NULL 一一对应）；
 * - 其余一切（`description` / `dive` / `advance` / `tokenUsage` / `createdBy` / `seats` / …）
 *   以及四个外置对象（`artifacts` / `plan` / `verification` / `archive`）一律进 `parts`（key→JSON）。
 *
 * 这么分而不是"给每个字段开一列"：台账记录形态是**外部契约**（`REQBOARD_SCHEMA_VERSION = 9`），
 * 每加一个字段就改一次表结构，等于把"记录形态"复制进了 DDL，两处必然不同步。
 *
 * ⚠️ **`autoRun` 刻意走 parts 而非列**：`autorun` 列是 `NOT NULL DEFAULT 0` 的**镜像**，
 * 但记录里的 `autoRun` 是**可选**的——若从列还原，`undefined` 会被读成 `false`，
 * 摘要里就凭空多出一个 `autoRun: false`（`summarize` 只在该键存在时才下发）。
 * 故 presence 由 parts 保真，列只服务将来的查询。
 *
 * @module dsh-pmboard/repositories/sqliteRows
 */
import type { ActorRef, CommentRecord, RequirementRecord } from '../shared/protocol.js'
import type { RequirementHistoryEntry } from '../application/ports.js'
import {
  decodeJournalLine,
  toAdvanceLine,
  toCommentLine,
  toStatusLine,
  truncateByCount,
  type AdvanceJournalLine,
  type CommentJournalLine,
  type StatusJournalLine,
} from '../domain/requirement/Journal.js'
import { REQUIREMENT_STORE_ERROR } from '../application/ports.js'
import { assembleRecord, toHotRecord, type RequirementParts } from './shardAssembly.js'

/** 查询结果行（null-prototype 字典）。 */
export type Row = Record<string, unknown>

/** 与 DDL 顺序**无关**的列清单：INSERT 语句与取值都由它派生，避免"列序写反"这类静默错位。 */
export const HOT_COLUMNS: readonly string[] = [
  'id', 'title', 'status', 'category', 'prompt_difficulty', 'version',
  'created_at', 'updated_at', 'source_session_id', 'autorun', 'blocked',
  'workspace_root', 'doc_base_path', 'comment_count', 'history_count',
]

/** 列 → 记录键（可空列 ↔ 缺省键：NULL 读回即"没有这个键"，无损）。 */
const COLUMN_TO_KEY: readonly (readonly [string, string])[] = [
  ['id', 'id'], ['title', 'title'], ['status', 'status'], ['category', 'category'],
  ['prompt_difficulty', 'promptDifficulty'], ['version', 'version'],
  ['created_at', 'createdAt'], ['updated_at', 'updatedAt'],
  ['source_session_id', 'sourceSessionId'], ['workspace_root', 'workspaceRoot'],
  ['doc_base_path', 'docBasePath'],
]

/** 四个外置对象（与 `BIG_FIELD_KEYS` 同源，这里只取"整份外置"的那四个）。 */
export const OBJECT_KINDS: readonly string[] = ['artifacts', 'plan', 'verification', 'archive']

/** 计数键：由列或数组长度承载，不重复进 parts。 */
const COUNT_KEYS: readonly string[] = ['commentCount', 'historyCount', 'artifactCount']

/** 请求幂等的 `INSERT OR REPLACE`（列序由 `HOT_COLUMNS` 决定）。 */
function insertSql(table: string): string {
  const cols = HOT_COLUMNS.join(', ')
  const marks = HOT_COLUMNS.map(() => '?').join(', ')
  return `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${marks})`
}

/** 语句表（键名即用途；SQL 不散落在 Store 里）。 */
export const SQL = {
  insertHot: insertSql('requirements'),
  insertCold: insertSql('archived'),
  selectHotAll: 'SELECT * FROM requirements',
  selectHotIds: 'SELECT id FROM requirements',
  selectHotOne: 'SELECT * FROM requirements WHERE id = ?',
  selectColdAll: 'SELECT * FROM archived',
  selectColdOne: 'SELECT * FROM archived WHERE id = ?',
  deleteHot: 'DELETE FROM requirements WHERE id = ?',
  deleteCold: 'DELETE FROM archived WHERE id = ?',
  selectComments: 'SELECT * FROM comments WHERE req_id = ? ORDER BY seq',
  deleteComments: 'DELETE FROM comments WHERE req_id = ?',
  insertComment: 'INSERT OR REPLACE INTO comments (req_id, seq, id, body, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  selectHistory: 'SELECT * FROM history WHERE req_id = ? ORDER BY seq',
  deleteHistory: 'DELETE FROM history WHERE req_id = ?',
  insertHistory: 'INSERT OR REPLACE INTO history (req_id, seq, kind, status, at, reason, by, token_snapshot, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  selectParts: 'SELECT key, value FROM parts WHERE req_id = ?',
  selectAllParts: 'SELECT req_id, key, value FROM parts',
  deleteParts: 'DELETE FROM parts WHERE req_id = ?',
  insertPart: 'INSERT OR REPLACE INTO parts (req_id, key, value) VALUES (?, ?, ?)',
  metaGet: 'SELECT value FROM meta WHERE key = ?',
  metaSet: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
  deleteMeta: 'DELETE FROM meta WHERE key = ?',
  /** 整体重建：六张表一次清空（`meta` 由调用方按导入结构重写）。 */
  clearAll: [
    'DELETE FROM requirements',
    'DELETE FROM archived',
    'DELETE FROM comments',
    'DELETE FROM history',
    'DELETE FROM parts',
  ],
} as const

/** 写侧：记录 + 计数 → 行值（顺序由 `HOT_COLUMNS` 保证）。 */
export function rowValues(record: RequirementRecord, counts: { comments: number; history: number }): readonly unknown[] {
  const byCol: Record<string, unknown> = {
    id: record.id,
    title: record.title,
    status: record.status,
    category: record.category ?? null,
    prompt_difficulty: record.promptDifficulty ?? null,
    version: record.version,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    source_session_id: record.sourceSessionId ?? null,
    // 镜像列：只表示"是否显式开启"；保真由 parts 里的 autoRun 负责（见文件头注）。
    autorun: record.autoRun === true ? 1 : 0,
    blocked: record.blocked === true ? 1 : 0,
    workspace_root: record.workspaceRoot ?? null,
    doc_base_path: record.docBasePath ?? null,
    comment_count: counts.comments,
    history_count: counts.history,
  }
  return HOT_COLUMNS.map((col) => byCol[col] ?? null)
}

/** 写侧：记录 + 计数 → parts（key → 任意 JSON 值）。 */
export function partsOf(record: RequirementRecord, counts: { comments: number; history: number; artifacts: number }): Map<string, unknown> {
  const hot = toHotRecord(record, counts) as Record<string, unknown>
  const parts = new Map<string, unknown>()
  for (const key of Object.keys(hot)) {
    if (COLUMN_TO_KEY.some(([, k]) => k === key)) continue
    if (key === 'blocked') continue
    if (COUNT_KEYS.includes(key)) continue
    const value = hot[key]
    if (value !== undefined) parts.set(key, value)
  }
  for (const kind of OBJECT_KINDS) {
    const value = (record as unknown as Record<string, unknown>)[kind]
    if (value !== undefined) parts.set(kind, value)
  }
  return parts
}

/** 列 → 记录标量（NULL 即缺省：不写这个键）。 */
function scalarsOfRow(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [col, key] of COLUMN_TO_KEY) {
    const value = row[col]
    if (value !== null && value !== undefined) out[key] = value
  }
  out.blocked = row.blocked === 1
  return out
}

/**
 * 摘要/窄投影用的**轻记录**：标量 + 计数 + parts（含外置对象），**不经 `assembleRecord`**。
 *
 * 为什么不复用 `assembleRecord`：它会剔掉 `commentCount` / `artifactCount`，而 `summarize`
 * 正是靠这两个计数下发摘要的（`countOf(record.commentCount, record.comments)`）。
 * 分片实现的索引也是从**热记录**（带计数）投影的——同一条口径。
 */
export function lightRecordOfRow(row: Row, parts: ReadonlyMap<string, unknown>): Record<string, unknown> {
  const out = scalarsOfRow(row)
  out.commentCount = Number(row.comment_count ?? 0)
  out.historyCount = Number(row.history_count ?? 0)
  for (const [key, value] of parts) out[key] = value
  return out
}

/** 读侧装配：标量 + parts + 评论 + 历史 → 对外记录（复用 `assembleRecord`，与分片同源）。 */
export function recordOfRow(
  row: Row,
  parts: ReadonlyMap<string, unknown>,
  comments: readonly CommentRecord[],
  history: readonly RequirementHistoryEntry[],
): RequirementRecord {
  const record: Record<string, unknown> = scalarsOfRow(row)
  const objects: Record<string, unknown> = {}
  for (const [key, value] of parts) {
    if (OBJECT_KINDS.includes(key)) objects[key] = value
    else record[key] = value
  }
  const assembled: RequirementParts = {
    record: record as unknown as RequirementRecord,
    comments,
    history,
    objects,
  }
  return assembleRecord(assembled)
}

/** 解析 ActorRef（缺失/畸形 → `undefined`，由调用方给默认）。 */
export function parseActor(value: unknown): ActorRef | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const parsed = JSON.parse(value) as { kind?: unknown }
    if (parsed !== null && typeof parsed === 'object'
      && (parsed.kind === 'human' || parsed.kind === 'agent' || parsed.kind === 'system')) {
      return parsed as ActorRef
    }
  } catch {
    /* 畸形 JSON：按缺失处理（下面由 Journal 的解码层决定行是否保留） */
  }
  return undefined
}

/** 评论行 → 日志行（`commentOf` 会去掉 seq，故这里先还原成行形状）。 */
export function commentLineOfRow(row: Row): CommentJournalLine {
  const createdBy = parseActor(row.created_by)
  return {
    seq: Number(row.seq ?? 0),
    id: String(row.id ?? ''),
    body: String(row.body ?? ''),
    createdAt: Number(row.created_at ?? 0),
    ...(createdBy !== undefined ? { createdBy } : {}),
  }
}

/**
 * 历史行 → 日志行。
 *
 * `payload` 是**权威原件**（写入侧恒写整行 JSON）；缺失时退回结构化列——那条路只能还原
 * `status` 行（advance 行的事件/耗时/详情不在列里），无法还原就**响亮跳过**而不是编造。
 */
export function historyLineOfRow(
  row: Row,
  label: string,
  onWarn: (m: string) => void,
): StatusJournalLine | AdvanceJournalLine | undefined {
  if (typeof row.payload === 'string' && row.payload.length > 0) {
    const decoded = decodeJournalLine(row.payload)
    if (decoded !== undefined) {
      if ('kind' in decoded) return decoded
      onWarn(`${label} 的 payload 是评论行（不该出现在历史表里），该行已跳过`)
      return undefined
    }
    onWarn(`${label} 的 payload 无法解码（结构损坏），该行已跳过`)
    return undefined
  }
  const seq = Number(row.seq ?? 0)
  if (row.kind === 'status') {
    const by = parseActor(row.by) ?? { kind: 'system' as const }
    let tokenSnapshot: unknown
    if (typeof row.token_snapshot === 'string' && row.token_snapshot.length > 0) {
      try { tokenSnapshot = JSON.parse(row.token_snapshot) } catch { tokenSnapshot = undefined }
    }
    return {
      seq,
      kind: 'status',
      status: String(row.status ?? ''),
      at: Number(row.at ?? 0),
      by,
      ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
      ...(tokenSnapshot !== undefined ? { tokenSnapshot: tokenSnapshot as never } : {}),
    }
  }
  onWarn(`${label} 缺 payload 且是 ${String(row.kind)} 行，无法还原（已跳过）`)
  return undefined
}

/** 记录 → 历史日志行（状态流转 + 推进事件，顺序与分片写入器一致）。 */
export function historyLinesOf(record: RequirementRecord): (StatusJournalLine | AdvanceJournalLine)[] {
  const out: (StatusJournalLine | AdvanceJournalLine)[] = (record.statusHistory ?? []).map((e, i) => toStatusLine(i, e))
  for (const [i, a] of (record.advance?.history ?? []).entries()) {
    out.push(toAdvanceLine((record.statusHistory ?? []).length + i, a))
  }
  return out
}

/** 评论记录 → 日志行（写侧用）。 */
export function commentLinesOf(record: RequirementRecord): CommentJournalLine[] {
  return (record.comments ?? []).map((c, i) => toCommentLine(i, c))
}

/** 按提交点计数取有效前缀；不符时**告警并降级**（与 `shardAssembly.truncateOrWarn` 同口径）。 */
export function truncateWithWarn<T extends { seq: number }>(
  label: string,
  lines: readonly T[],
  count: number,
  onWarn: (m: string) => void,
): T[] {
  try {
    return truncateByCount(lines, count)
  } catch (err) {
    onWarn(`${label} 与提交点计数不符（${(err as Error).message}）——按库内现有有效行装配，请人工核查`)
    return lines.filter((l) => l.seq < count).sort((a, b) => a.seq - b.seq)
  }
}

/** 尾部增长且前缀未改 → 新增行数；否则 `null`（需整份重写）。比较用编码后的 JSON（键序稳定）。 */
export function tailGrowthByJson(before: readonly unknown[], after: readonly unknown[]): number | null {
  if (after.length < before.length) return null
  for (let i = 0; i < before.length; i++) {
    if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) return null
  }
  return after.length - before.length
}

/** 把驱动异常映射成端口传输码（已带 `REQBOARD_*` 码的原样上抛）。 */
export function mapSqliteError(err: unknown): Error {
  const e = err as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : String(err)
  if (code.startsWith('REQBOARD_')) return err as Error
  const coded = (transport: string): Error => Object.assign(new Error(message), { code: transport })
  if (/UNIQUE constraint/i.test(message)) return coded(REQUIREMENT_STORE_ERROR.ALREADY_EXISTS)
  if (/malformed|not a database|corrupt|no such table/i.test(message)) return coded(REQUIREMENT_STORE_ERROR.CORRUPT_SHARD)
  return coded(REQUIREMENT_STORE_ERROR.IO_FAILED)
}

/**
 * parts 值的序列化：**不可序列化**（循环引用 / BigInt）是**结构性写入失败**，不是 IO 故障——
 * 归到 `VALIDATION_FAILED`，并在消息里点명具名的键（否则只剩一句"落盘失败"，无从下手）。
 */
export function serializePart(id: string, key: string, value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text === undefined ? 'null' : text
  } catch (err) {
    throw Object.assign(
      new Error(`需求 ${id} 的 ${key} 无法序列化（${(err as Error).message}）——结构性写入失败，本次已整笔回滚`),
      { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED },
    )
  }
}

/** 评论行的 `created_by` 列值（缺省存 JSON `null`：列是 NOT NULL，故不能存 NULL）。 */
export function actorColumnValue(actor: ActorRef | undefined): string {
  return JSON.stringify(actor ?? null)
}
