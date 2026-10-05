/**
 * 需求存储的 **SQLite 实现**（REQ-261004103330-005f FR-7 / FR-8 / FR-9）。
 *
 * ## 结构
 *
 * 本文件 = 读侧装配 + 摘要索引 + 窄投影 + 订阅广播 + 端口面；写侧在 `SqliteRequirementWriter`，
 * 行映射与 SQL 在 `sqliteRows`（读写必须同源），DDL 在 `sqliteSchema`（t1）。
 *
 * 契约由 `tests/reqboard/store-contract.test.ts` 的同一份断言锁死（t4 注册进注册表），
 * 本卡自己的验收在 `tests/reqboard/sqlite-store.test.ts`。
 *
 * ## 与分片实现的两处**有意差异**
 *
 * 1. **不需要串行写队列**：`node:sqlite` 的 `DatabaseSync` 是同步 API——一次写从
 *    `BEGIN IMMEDIATE` 到 `COMMIT` 中间没有 `await`，事件循环插不进来。故临界区天生原子，
 *    `headAfterDrain()` 退化为 `head()`（写返回前已落盘）。
 * 2. 写路径返回/广播的记录带**新 version**（分片实现回带旧 version 的怪癖不予复制，见 Writer 头注）。
 *
 * @module dsh-pmboard/repositories/SqliteRequirementStore
 */
import { createRequire } from 'node:module'
// 只取**类型**：`import type` 编译期擦除，运行时不产生 import 语句（原因见下方 createRequire 注释）。
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import {
  REQBOARD_SCHEMA_VERSION,
  type CommentRecord,
  type RequirementRecord,
  type TriageRecord,
} from '../shared/protocol.js'
import {
  type ImportedLedger,
  type LedgerHead,
  type MutateResult,
  type MutationOutcome,
  type NewComment,
  type NewRequirement,
  type RequirementChange,
  type RequirementDraft,
  type RequirementFilter,
  type RequirementHistoryEntry,
  type RequirementStore,
  type RequirementSummaryPage,
  type SweepResult,
} from '../application/ports.js'
import {
  advanceRecordOf,
  commentOf,
  statusEventOf,
  type AdvanceJournalLine,
  type StatusJournalLine,
} from '../domain/requirement/Journal.js'
import { factsOf, summarize, type RequirementFacts, type RequirementSummary } from '../domain/requirement/RequirementSummary.js'
import {
  SQLITE_DDL,
  SQLITE_META_KEYS,
  SQLITE_PRAGMAS,
  SQLITE_SCHEMA_MISMATCH,
  SQLITE_SCHEMA_VERSION,
  sqliteSchemaMatches,
} from './sqliteSchema.js'
import { compareSummaryOrder, decodeSummaryCursor, encodeSummaryCursor } from './shardPaging.js'
import {
  SQL,
  commentLineOfRow,
  historyLineOfRow,
  lightRecordOfRow,
  mapSqliteError,
  recordOfRow,
  truncateWithWarn,
  type Row,
} from './sqliteRows.js'
import { LEDGER_SCHEMA_KEY, SqliteRequirementWriter } from './SqliteRequirementWriter.js'

/**
 * 为什么用 `createRequire` 取内置模块，而不是 `import { DatabaseSync } from 'node:sqlite'`：
 *
 * Vite/Vitest 5 的内置模块表**没有 `sqlite`**（该模块 Node 22.5 才加入），静态 import 会被 vite-node
 * 在解析前剥掉 `node:` 前缀、当成裸包 `sqlite` 加载 ⇒ **整个测试文件加载失败**
 * （实测：`Failed to load url sqlite (resolved id: sqlite)`）。运行时 `require('node:sqlite')`
 * 由 Node 自己解析内置模块，不经过运行器那张陈旧的表；类型仍由 `import type` +
 * `src/repositories/node-sqlite.d.ts` 提供，静态检查一字不减。
 */
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as typeof DatabaseSyncType

export interface SqliteRequirementStoreOptions {
  /** 库文件绝对路径（调用方负责目录存在）。 */
  file: string
  /** 时钟（缺省 `Date.now`）。 */
  now?: () => number
  /** 告警通道（缺省 `console.warn`）：坏行、只追加纪律被破坏、写失败降级都走这里。 */
  onWarn?: (message: string) => void
}

export class SqliteRequirementStore implements RequirementStore {
  private readonly db: DatabaseSyncType
  private readonly onWarn: (message: string) => void
  private readonly writer: SqliteRequirementWriter
  /** 热侧摘要索引（懒建；`undefined` = 还没建过）。 */
  private index: Map<string, RequirementSummary> | undefined
  /** 窄投影快照（`peekFacts` 用）：每次写提交后**同拍刷新**，故满足读己所写。 */
  private factsCache: Map<string, RequirementFacts> | undefined
  private readonly subscribers = new Set<(change: RequirementChange) => void>()

  constructor(options: SqliteRequirementStoreOptions) {
    this.onWarn = options.onWarn ?? ((message) => console.warn(message))
    try {
      this.db = new DatabaseSync(options.file)
      for (const pragma of SQLITE_PRAGMAS) this.db.exec(pragma)
      for (const ddl of SQLITE_DDL) this.db.exec(ddl)
    } catch (err) {
      throw mapSqliteError(err)
    }
    this.writer = new SqliteRequirementWriter({
      db: this.db,
      now: options.now ?? (() => Date.now()),
      onWarn: this.onWarn,
      loadForWrite: (id) => this.loadForWrite(id),
      hotIds: () => (this.db.prepare(SQL.selectHotIds).all() as Row[]).map((row) => String(row.id)),
      notify: (kind, id, record, revision) => this.commitNotify(kind, id, record, revision),
      onLedgerReplaced: () => {
        this.index = undefined
        this.factsCache = undefined
      },
    })
    this.writer.ensureMeta()
    const stored = Number(this.writer.metaGet(SQLITE_META_KEYS.schemaVersion) ?? 0)
    if (!sqliteSchemaMatches(stored)) {
      throw Object.assign(
        new Error(
          `SQLite 库表结构版本不匹配：库内 ${String(stored)}，本实现要求 ${SQLITE_SCHEMA_VERSION}——`
          + '不自动改表（改表等于在用户不知情时动唯一一份数据）；请按迁移指引重建库（会先备份旧库）',
        ),
        { code: SQLITE_SCHEMA_MISMATCH },
      )
    }
  }

  /** 关闭库（测试与迁移脚本用；端口不含它）。 */
  close(): void {
    this.db.close()
  }

  // ── 读：装配原语 ─────────────────────────────────────────────────────

  private partsMap(id: string): Map<string, unknown> {
    const out = new Map<string, unknown>()
    for (const row of this.db.prepare(SQL.selectParts).all(id) as Row[]) {
      try {
        out.set(String(row.key), JSON.parse(String(row.value)))
      } catch (err) {
        this.onWarn(`SQLite parts ${id}/${String(row.key)} 解析失败（已忽略）：${(err as Error).message}`)
      }
    }
    return out
  }

  private commentsFor(id: string, count: number): CommentRecord[] {
    const lines = (this.db.prepare(SQL.selectComments).all(id) as Row[]).map(commentLineOfRow)
    return truncateWithWarn(`评论 ${id}`, lines, count, this.onWarn).map(commentOf)
  }

  private historyFor(id: string, count: number): RequirementHistoryEntry[] {
    const lines: (StatusJournalLine | AdvanceJournalLine)[] = []
    for (const row of this.db.prepare(SQL.selectHistory).all(id) as Row[]) {
      const line = historyLineOfRow(row, `历史 ${id}/${String(row.seq)}`, this.onWarn)
      if (line !== undefined) lines.push(line)
    }
    return truncateWithWarn(`历史 ${id}`, lines, count, this.onWarn).map((line) => (line.kind === 'status'
      ? { kind: 'status' as const, event: statusEventOf(line) }
      : { kind: 'advance' as const, record: advanceRecordOf(line) }))
  }

  /** 热侧优先、未命中回落冷侧。 */
  private rowOf(id: string): { row: Row; cold: boolean } | undefined {
    const hot = this.db.prepare(SQL.selectHotOne).get(id) as Row | undefined
    if (hot !== undefined) return { row: hot, cold: false }
    const cold = this.db.prepare(SQL.selectColdOne).get(id) as Row | undefined
    return cold === undefined ? undefined : { row: cold, cold: true }
  }

  private loadForWrite(id: string): { assembled: RequirementRecord; version: number } | undefined {
    const hit = this.rowOf(id)
    if (hit === undefined) return undefined
    return {
      assembled: recordOfRow(
        hit.row,
        this.partsMap(id),
        this.commentsFor(id, Number(hit.row.comment_count ?? 0)),
        this.historyFor(id, Number(hit.row.history_count ?? 0)),
      ),
      version: Number(hit.row.version ?? 0),
    }
  }

  private summarizeAt(id: string, cold: boolean): RequirementSummary | undefined {
    const row = this.db.prepare(cold ? SQL.selectColdOne : SQL.selectHotOne).get(id) as Row | undefined
    if (row === undefined) return undefined
    try {
      return summarize(lightRecordOfRow(row, this.partsMap(id)) as unknown as RequirementRecord)
    } catch (err) {
      this.onWarn(`SQLite ${id} 摘要构建失败（已剔除）：${(err as Error).message}`)
      return undefined
    }
  }

  // ── 读：端口方法 ─────────────────────────────────────────────────────

  async get(id: string): Promise<RequirementRecord | undefined> {
    const hit = this.rowOf(id)
    if (hit === undefined) return undefined
    return recordOfRow(
      hit.row,
      this.partsMap(id),
      this.commentsFor(id, Number(hit.row.comment_count ?? 0)),
      this.historyFor(id, Number(hit.row.history_count ?? 0)),
    )
  }

  async listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]> {
    const hit = this.rowOf(id)
    if (hit === undefined) return []
    const since = opts?.since ?? 0
    const limit = opts?.limit ?? 200
    return this.commentsFor(id, Number(hit.row.comment_count ?? 0)).filter((_, i) => i >= since).slice(0, limit)
  }

  async listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]> {
    const hit = this.rowOf(id)
    if (hit === undefined) return []
    const all = this.historyFor(id, Number(hit.row.history_count ?? 0))
    return opts?.limit === undefined ? all : all.slice(0, opts.limit)
  }

  async head(): Promise<LedgerHead> {
    return {
      revision: this.writer.headRevision(),
      schemaVersion: Number(this.writer.metaGet(LEDGER_SCHEMA_KEY) ?? REQBOARD_SCHEMA_VERSION),
    }
  }

  /** 写是同步落盘的（无 await 缝），故"排空后读"与 `head()` 等价。 */
  async headAfterDrain(): Promise<LedgerHead> {
    return this.head()
  }

  // ── 读：摘要索引与窄投影 ─────────────────────────────────────────────

  /** 索引懒建：一次全表 + 一次 parts，**不逐条查库**（首屏载荷与启动对账都走它）。 */
  private ensureIndex(): Map<string, RequirementSummary> {
    if (this.index !== undefined) return this.index
    const index = new Map<string, RequirementSummary>()
    const facts = new Map<string, RequirementFacts>()
    const partsByReq = new Map<string, Map<string, unknown>>()
    for (const row of this.db.prepare(SQL.selectAllParts).all() as Row[]) {
      const reqId = String(row.req_id)
      let bucket = partsByReq.get(reqId)
      if (bucket === undefined) {
        bucket = new Map<string, unknown>()
        partsByReq.set(reqId, bucket)
      }
      try {
        bucket.set(String(row.key), JSON.parse(String(row.value)))
      } catch (err) {
        this.onWarn(`SQLite parts ${reqId}/${String(row.key)} 解析失败（已忽略）：${(err as Error).message}`)
      }
    }
    for (const row of this.db.prepare(SQL.selectHotAll).all() as Row[]) {
      const id = String(row.id)
      try {
        const light = lightRecordOfRow(row, partsByReq.get(id) ?? new Map()) as unknown as RequirementRecord
        index.set(id, summarize(light))
        facts.set(id, factsOf(light))
      } catch (err) {
        this.onWarn(`SQLite ${id} 摘要构建失败，已从索引剔除（其余需求不受影响）：${(err as Error).message}`)
      }
    }
    this.index = index
    this.factsCache = facts
    return index
  }

  private coldSummaries(): RequirementSummary[] {
    const out: RequirementSummary[] = []
    for (const row of this.db.prepare(SQL.selectColdAll).all() as Row[]) {
      const id = String(row.id)
      try {
        out.push(summarize(lightRecordOfRow(row, this.partsMap(id)) as unknown as RequirementRecord))
      } catch (err) {
        this.onWarn(`SQLite 冷侧 ${id} 摘要构建失败（已跳过）：${(err as Error).message}`)
      }
    }
    return out
  }

  async getSummary(id: string): Promise<RequirementSummary | undefined> {
    const hit = this.ensureIndex().get(id)
    if (hit !== undefined) return hit
    const fresh = this.summarizeAt(id, false)
    return fresh !== undefined ? fresh : this.summarizeAt(id, true)
  }

  async listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage> {
    const offset = decodeSummaryCursor(filter?.cursor)
    if (offset === null) return { items: [] } // 越界/伪造游标 → 空页（不抛错，避免看板整页报错）
    const scope = filter?.scope ?? 'active'
    const hot = [...this.ensureIndex().values()]
    const all: RequirementSummary[] = scope === 'active'
      ? hot
      : scope === 'archived'
        ? this.coldSummaries()
        : [...hot, ...this.coldSummaries()]
    const matched = all
      .filter((s) => {
        if (filter?.ids !== undefined && !filter.ids.includes(s.id)) return false
        if (filter?.status !== undefined && !filter.status.includes(s.status)) return false
        if (filter?.workspaceRoot !== undefined && s.workspaceRoot !== filter.workspaceRoot) return false
        if (filter?.sourceSessionId !== undefined && s.sourceSessionId !== filter.sourceSessionId) return false
        if (filter?.seatWindowKey !== undefined
          && !(s.seats ?? []).some((seat) => seat.windowKey === filter.seatWindowKey)) return false
        return true
      })
      .sort(compareSummaryOrder)
    const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 1000)
    const items = matched.slice(offset, offset + limit)
    const nextOffset = offset + items.length
    return nextOffset < matched.length ? { items, nextCursor: encodeSummaryCursor(nextOffset) } : { items }
  }

  peekSummaries(): readonly RequirementSummary[] {
    return this.index === undefined ? [] : [...this.index.values()]
  }

  peekFacts(): readonly RequirementFacts[] {
    if (this.index === undefined || this.factsCache === undefined) return []
    const cache = this.factsCache
    return [...this.index.values()].map((s) => cache.get(s.id)).filter((f): f is RequirementFacts => f !== undefined)
  }

  async listTriages(filter?: { sessionId?: string }): Promise<readonly TriageRecord[]> {
    const raw = this.writer.metaGet(SQLITE_META_KEYS.triages)
    let all: readonly { sessionId?: unknown }[] = []
    try {
      const parsed = raw === undefined ? [] : (JSON.parse(raw) as unknown)
      if (Array.isArray(parsed)) all = parsed as readonly { sessionId?: unknown }[]
    } catch (err) {
      this.onWarn(`SQLite meta.triages 解析失败（按空清单处理）：${(err as Error).message}`)
    }
    if (filter?.sessionId === undefined) return all as never
    return all.filter((x) => x?.sessionId === filter.sessionId) as never
  }

  // ── 写：委托写侧 ─────────────────────────────────────────────────────

  async create(input: NewRequirement, actor: { kind: 'human' | 'agent' | 'system'; sessionId?: string }): Promise<RequirementRecord> {
    return this.writer.create(input, actor)
  }

  async mutate(id: string, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    return this.writer.mutate(id, undefined, fn)
  }

  async mutateIf(id: string, expectedVersion: number, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    return this.writer.mutate(id, expectedVersion, fn)
  }

  async appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }> {
    return this.writer.appendComment(id, comment)
  }

  async sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult> {
    return this.writer.sweep(reason, fn)
  }

  async replaceAll(reason: string, next: ImportedLedger): Promise<void> {
    this.writer.replaceAll(reason, next)
  }

  subscribe(fn: (change: RequirementChange) => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  /** 提交后刷新投影并广播（订阅者抛错不阻断写，与分片实现同口径）。 */
  private commitNotify(kind: RequirementChange['kind'], id: string, record: RequirementRecord, revision: number): void {
    const summary = summarize(record)
    if (this.index !== undefined) this.index.set(id, summary)
    if (this.factsCache !== undefined) this.factsCache.set(id, factsOf(record))
    const change: RequirementChange = { kind, requirementId: id, revision, summary }
    for (const fn of this.subscribers) {
      try {
        fn(change)
      } catch (err) {
        this.onWarn(`需求存储订阅者抛错（已忽略，不阻断写）：${(err as Error).message}`)
      }
    }
  }
}
