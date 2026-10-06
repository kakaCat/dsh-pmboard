/**
 * SQLite Store 的**写侧**（REQ-261004103330-005f FR-7 / FR-9）。
 *
 * ## 为什么单独一个类（与 t5 同款理由）
 *
 * 读侧回答"现在是什么"，写侧回答"怎么把变更安全落盘"——后者的难点全在**事务边界**与**只追加纪律**。
 * 分片实现把这两件事分成 `ShardedRequirementStore` + `ShardedRequirementWriter`，本实现照同一刀口切，
 * 一是读得清，二是两边可以逐条对照着看（核对语义时不用在两套结构之间翻译）。
 *
 * ## 事务边界（与分片实现的**唯一结构性差异**）
 *
 * 分片实现靠"进程内串行队列 + 写前重读"保证临界区；这里靠 SQLite：`BEGIN IMMEDIATE … COMMIT`
 * 包住整段，且闭包内**没有任何 `await`**（`node:sqlite` 是同步 API）——事件循环插不进来，
 * 临界区天生原子，`sweep` 也是**整批一个事务**（端口注释的要求）。
 *
 * ## 只追加纪律
 *
 * 评论/历史只允许追加：尾部增长走逐行 INSERT；前缀被删改 → **告警 + 整份重写**（不静默丢弃）。
 * 判据与分片实现同源（逐元素深比较），只是这里比的是编码后的行 JSON。
 *
 * @module dsh-pmboard/repositories/SqliteRequirementWriter
 */
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type { ActorRef, RequirementRecord } from '../shared/protocol.js'
import {
  REQUIREMENT_STORE_ERROR,
  type ImportedLedger,
  type MutateResult,
  type MutationOutcome,
  type NewComment,
  type NewRequirement,
  type RequirementChange,
  type RequirementDraft,
  type SweepResult,
} from '../application/ports.js'
import { isColdStatus, isRequirementId } from '../domain/requirement/ReqboardPaths.js'
import { isColdWriteExempt } from '../domain/requirement/ColdWrite.js'
import type { AdvanceJournalLine, CommentJournalLine, StatusJournalLine } from '../domain/requirement/Journal.js'
import { SQLITE_META_KEYS, SQLITE_SCHEMA_VERSION } from './sqliteSchema.js'
import {
  SQL,
  actorColumnValue,
  commentLinesOf,
  historyLinesOf,
  mapSqliteError,
  partsOf,
  rowValues,
  serializePart,
  tailGrowthByJson,
} from './sqliteRows.js'

/** 写侧需要的接缝（读逻辑与广播都留在 Store，避免两处各写一份）。 */
export interface SqliteWriterSeams {
  readonly db: DatabaseSyncType
  readonly now: () => number
  readonly onWarn: (message: string) => void
  /** 写前读：装配后的记录 + 当前 version（CAS 令牌）。 */
  readonly loadForWrite: (id: string) => { assembled: RequirementRecord; version: number } | undefined
  /** 热侧全部 id（`sweep` 的扫描集；冷侧不参与）。 */
  readonly hotIds: () => readonly string[]
  /** 提交后广播（Store 负责刷投影 + 通知订阅者）。 */
  readonly notify: (kind: RequirementChange['kind'], id: string, record: RequirementRecord, revision: number) => void
  /** 整体重建后让 Store 丢弃索引（下次读时懒重建）。 */
  readonly onLedgerReplaced: () => void
}

/** 台账**记录形态**版本键（与 `sqlite_schema_version` 是两件事，见 design/data-model.md §版本与兼容）。 */
export const LEDGER_SCHEMA_KEY = 'ledger_schema_version'

function coded(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra })
}

export class SqliteRequirementWriter {
  constructor(private readonly seams: SqliteWriterSeams) {}

  // ── 基础设施 ─────────────────────────────────────────────────────────

  metaGet(key: string): string | undefined {
    const row = this.seams.db.prepare(SQL.metaGet).get(key) as Record<string, unknown> | undefined
    return row === undefined ? undefined : String(row.value)
  }

  metaSet(key: string, value: string): void {
    this.seams.db.prepare(SQL.metaSet).run(key, value)
  }

  headRevision(): number {
    return Number(this.metaGet(SQLITE_META_KEYS.revision) ?? 0)
  }

  private bumpRevision(): number {
    const next = this.headRevision() + 1
    this.metaSet(SQLITE_META_KEYS.revision, String(next))
    return next
  }

  /** 单事务执行。⚠️ 闭包内**禁止 await**：一旦让出事件循环，临界区就不再是临界区。 */
  tx<T>(run: () => T): T {
    this.seams.db.exec('BEGIN IMMEDIATE')
    try {
      const out = run()
      this.seams.db.exec('COMMIT')
      return out
    } catch (err) {
      try {
        this.seams.db.exec('ROLLBACK')
      } catch {
        /* 回滚失败不掩盖原始错误（原始错误才是可行动的） */
      }
      throw mapSqliteError(err)
    }
  }

  /** 首次建库时补齐 meta 缺省键（幂等，不覆盖已有值）。 */
  ensureMeta(): void {
    if (this.metaGet(SQLITE_META_KEYS.revision) === undefined) this.metaSet(SQLITE_META_KEYS.revision, '0')
    if (this.metaGet(SQLITE_META_KEYS.schemaVersion) === undefined) {
      this.metaSet(SQLITE_META_KEYS.schemaVersion, String(SQLITE_SCHEMA_VERSION))
    }
    if (this.metaGet(SQLITE_META_KEYS.triages) === undefined) this.metaSet(SQLITE_META_KEYS.triages, '[]')
  }

  // ── 端口写方法 ───────────────────────────────────────────────────────

  create(input: NewRequirement, actor: ActorRef): RequirementRecord {
    if (!isRequirementId(input.id)) {
      throw coded(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, `需求 id 形态非法：${JSON.stringify(input.id)}`)
    }
    if (input.title.trim().length === 0) {
      throw coded(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, '需求标题不能为空')
    }
    if (this.seams.loadForWrite(input.id) !== undefined) {
      throw coded(REQUIREMENT_STORE_ERROR.ALREADY_EXISTS, `需求 ${input.id} 已存在（create 不覆盖）`, { requirementId: input.id })
    }
    const now = this.seams.now()
    const record: RequirementRecord = {
      id: input.id,
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'draft',
      blocked: false,
      comments: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.promptDifficulty !== undefined ? { promptDifficulty: input.promptDifficulty } : {}),
      ...(input.docBasePath !== undefined ? { docBasePath: input.docBasePath } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
      ...(input.sourceSessionId !== undefined ? { sourceSessionId: input.sourceSessionId } : {}),
    }
    const revision = this.tx(() => {
      this.writeWhole(record)
      return this.bumpRevision()
    })
    this.seams.notify('requirement-created', record.id, record, revision)
    return record
  }

  /** `expectedVersion === undefined` = 不做 CAS（临界区内 RMW，单写者语义）。 */
  mutate(
    id: string,
    expectedVersion: number | undefined,
    fn: (draft: RequirementDraft) => MutationOutcome | undefined,
    kindOverride?: RequirementChange['kind'],
  ): MutateResult {
    const before = this.seams.loadForWrite(id)
    if (before === undefined) {
      throw coded(REQUIREMENT_STORE_ERROR.NOT_FOUND, `需求 ${id} 不存在（写操作不隐式建档）`, { requirementId: id })
    }
    if (expectedVersion !== undefined && before.version !== expectedVersion) {
      throw coded(
        REQUIREMENT_STORE_ERROR.CONFLICT,
        `需求 ${id} 版本不匹配：期望 ${expectedVersion}，当前 ${before.version}`,
        { requirementId: id, currentVersion: before.version },
      )
    }
    const assembled = before.assembled
    const draft = structuredClone(assembled) as RequirementDraft
    const outcome = fn(draft)
    if (outcome === undefined || outcome.changed === false) {
      return { requirement: assembled, version: before.version, revision: this.headRevision(), changed: false }
    }
    // 冷侧只读的检查必须在 `fn` **之后**：豁免与否取决于"这次到底改了什么"（同分片实现口径）。
    if (isColdStatus(assembled.status)
      && !isColdWriteExempt(assembled as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>)) {
      throw coded(REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE, `需求 ${id} 已归档（${assembled.status}），冷侧只读`, { requirementId: id })
    }
    const applied = this.tx(() => this.applyCommit(draft, before, true))
    const kind = kindOverride ?? (assembled.status === draft.status ? 'requirement-updated' : 'requirement-moved')
    this.seams.notify(kind, id, applied.requirement, applied.revision)
    return applied
  }

  appendComment(id: string, comment: NewComment): { version: number; commentCount: number } {
    const result = this.mutate(id, undefined, (draft) => {
      draft.comments.push({ ...comment })
      return { changed: true }
    }, 'comment-added')
    return { version: result.version, commentCount: result.requirement.comments.length }
  }

  /** 启动对账：整批一个事务、逐条提交但**只 bump 一次**全局序；冷侧不在扫描集里。 */
  sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): SweepResult {
    void reason
    const before = new Map<string, { assembled: RequirementRecord; version: number }>()
    for (const id of this.seams.hotIds()) {
      const loaded = this.seams.loadForWrite(id)
      if (loaded !== undefined) before.set(id, loaded)
    }
    const drafts = [...before.values()].map((b) => b.assembled as RequirementDraft)
    const byId = new Map(drafts.map((d) => [d.id, d]))
    const requested = fn(drafts)
    const touched: string[] = []
    const applied: MutateResult[] = []
    this.tx(() => {
      for (const id of requested) {
        const draft = byId.get(id)
        const prev = before.get(id)
        if (draft === undefined || prev === undefined) {
          this.seams.onWarn(`sweep 返回了不在扫描集里的需求 id（已忽略）：${id}`)
          continue
        }
        applied.push(this.applyCommit(draft, prev, false))
        touched.push(id)
      }
      if (touched.length > 0) this.bumpRevision() // 一次批量 = 一次全局序
    })
    if (touched.length === 0) return { touched: [], revision: this.headRevision() }
    const revision = this.headRevision()
    for (const r of applied) this.seams.notify('requirement-updated', r.requirement.id, r.requirement, revision)
    return { touched, revision }
  }

  /** 整体重建（迁移/回滚脚本入口）：一个事务清空 + 按导入结构写出 + 重写 meta。 */
  replaceAll(reason: string, next: ImportedLedger): void {
    void reason
    const written: RequirementRecord[] = []
    this.tx(() => {
      for (const sql of SQL.clearAll) this.seams.db.exec(sql)
      for (const record of next.requirements) {
        this.writeWhole(record)
        written.push(record)
      }
      this.metaSet(SQLITE_META_KEYS.revision, String(next.revision))
      this.metaSet(LEDGER_SCHEMA_KEY, String(next.schemaVersion))
      this.metaSet(SQLITE_META_KEYS.triages, JSON.stringify(next.triages ?? []))
      if (next.migrations === undefined) this.seams.db.prepare(SQL.deleteMeta).run('migrations')
      else this.metaSet('migrations', JSON.stringify(next.migrations))
    })
    this.seams.onLedgerReplaced()
    for (const record of written) this.seams.notify('ledger-replaced', record.id, record, next.revision)
  }

  // ── 落盘原语（调用方保证在事务内）────────────────────────────────────

  /**
   * 提交一次变更。
   *
   * 与分片实现的一处**有意差异**：返回/广播的记录带**新 version**。分片实现的 `commit` 末尾有
   * `{ ...merged, ...draft }`，会把 draft 里未自增的旧 version 覆盖回去 ⇒ 它广播出的摘要里
   * version 是 stale 的（只有 `MutateResult.version` 字段是新的）。这里不复制该怪癖：
   * 广播的摘要必须与落盘一致，否则"读己所写"在版本号这一项上不成立。
   */
  private applyCommit(
    draft: RequirementDraft,
    before: { assembled: RequirementRecord; version: number },
    bump: boolean,
  ): MutateResult {
    const id = draft.id
    const nextComments = draft.comments ?? []
    const commentLines = commentLinesOf({ ...(draft as unknown as RequirementRecord), comments: nextComments })
    const nextHistoryLines = historyLinesOf(draft as unknown as RequirementRecord)
    this.syncComments(id, commentLinesOf(before.assembled), commentLines)
    this.syncHistory(id, historyLinesOf(before.assembled), nextHistoryLines)
    const version = before.version + 1
    const merged: RequirementRecord = { ...(draft as unknown as RequirementRecord), version, comments: [...nextComments] }
    this.writeRecordRow(merged, commentLines.length, nextHistoryLines.length)
    return { requirement: merged, version, revision: bump ? this.bumpRevision() : this.headRevision(), changed: true }
  }

  /** 整份写出（`create` / `replaceAll` 用）：日志先清后写，提交点随记录一起。 */
  writeWhole(record: RequirementRecord): void {
    const comments = commentLinesOf(record)
    const history = historyLinesOf(record)
    this.seams.db.prepare(SQL.deleteComments).run(record.id)
    this.seams.db.prepare(SQL.deleteHistory).run(record.id)
    for (const line of comments) this.insertCommentRow(record.id, line)
    for (const line of history) this.insertHistoryRow(record.id, line)
    this.writeRecordRow(record, comments.length, history.length)
  }

  /** 写行 + parts（热/冷按状态路由；换侧时把另一侧的同 id 行删掉）。 */
  private writeRecordRow(record: RequirementRecord, comments: number, history: number): void {
    const values = rowValues(record, { comments, history })
    if (isColdStatus(record.status)) {
      this.seams.db.prepare(SQL.deleteHot).run(record.id)
      this.seams.db.prepare(SQL.insertCold).run(...values)
    } else {
      this.seams.db.prepare(SQL.deleteCold).run(record.id)
      this.seams.db.prepare(SQL.insertHot).run(...values)
    }
    // parts 整份重写（不做差异）：单条需求几十 KB 以内，换来实现简单且不可能漏字段。
    this.seams.db.prepare(SQL.deleteParts).run(record.id)
    const parts = partsOf(record, {
      comments,
      history,
      artifacts: Array.isArray(record.artifacts) ? record.artifacts.length : 0,
    })
    for (const [key, value] of parts) {
      this.seams.db.prepare(SQL.insertPart).run(record.id, key, serializePart(record.id, key, value))
    }
  }

  /** 只追加纪律：尾部增长 → 追加；前缀被删改 → 告警并整份重写（不静默丢弃）。 */
  private syncComments(id: string, before: readonly CommentJournalLine[], after: readonly CommentJournalLine[]): void {
    const growth = tailGrowthByJson(before, after)
    if (growth === null) {
      this.seams.onWarn(`需求 ${id} 的评论被删改（${before.length} → ${after.length}）——评论只允许追加，已整份重写`)
      this.seams.db.prepare(SQL.deleteComments).run(id)
      for (const line of after) this.insertCommentRow(id, line)
      return
    }
    for (let seq = before.length; seq < after.length; seq++) this.insertCommentRow(id, after[seq]!)
  }

  private syncHistory(
    id: string,
    before: readonly (StatusJournalLine | AdvanceJournalLine)[],
    after: readonly (StatusJournalLine | AdvanceJournalLine)[],
  ): void {
    const growth = tailGrowthByJson(before, after)
    if (growth === null) {
      this.seams.onWarn(`需求 ${id} 的历史被删改（${before.length} → ${after.length}）——历史只允许追加，已整份重写`)
      this.seams.db.prepare(SQL.deleteHistory).run(id)
      for (const line of after) this.insertHistoryRow(id, line)
      return
    }
    for (let seq = before.length; seq < after.length; seq++) this.insertHistoryRow(id, after[seq]!)
  }

  private insertCommentRow(id: string, line: CommentJournalLine): void {
    this.seams.db.prepare(SQL.insertComment)
      .run(id, line.seq, line.id, line.body, line.createdAt, actorColumnValue(line.createdBy))
  }

  /** 历史行：结构化列是**镜像**，`payload` 是**权威原件**（advance 行的字段在列里放不下）。 */
  private insertHistoryRow(id: string, line: StatusJournalLine | AdvanceJournalLine): void {
    const payload = JSON.stringify(line)
    if (line.kind === 'status') {
      this.seams.db.prepare(SQL.insertHistory).run(
        id, line.seq, 'status', line.status, line.at, line.reason ?? null,
        JSON.stringify(line.by), line.tokenSnapshot === undefined ? null : JSON.stringify(line.tokenSnapshot), payload,
      )
      return
    }
    this.seams.db.prepare(SQL.insertHistory).run(id, line.seq, 'advance', line.event, line.at, null, 'null', null, payload)
  }
}
