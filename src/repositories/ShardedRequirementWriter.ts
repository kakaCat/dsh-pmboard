/**
 * 分片 Store 的**写侧**（REQ-261002161439-277d · t5 / FR-2、FR-3、FR-5）。
 *
 * ## 为什么单独一个类
 *
 * 读侧（`ShardedRequirementStore`）已经 380 行，写侧再塞进去会撞单文件 ≤400 行的门禁。
 * 更要紧的是职责不同：读侧回答"现在是什么"，写侧回答"怎么把变更安全落盘"——
 * 后者的全部难点在**提交顺序**与**差异分派**，独立成文件才读得清。
 *
 * ## 提交顺序（唯一正确的顺序，I-1）
 *
 * ```
 * ① 追加日志（comments / history 的尾部）        ← 不可回退的追加先落
 * ② 整份外置对象（有变化的才写）                 ← artifacts / plan / verification / archive
 * ③ record.json（提交点：version+1、计数+1）     ← rename 原子
 * ④ meta.json（revision+1）
 * ```
 *
 * 崩在 ①–③ 之间：`record.json` 还是旧提交点 ⇒ 读侧按计数截断，日志多出的行是**未提交尾巴**，
 * 不会污染数据。崩在 ③–④ 之间：`revision` 少 1，只影响 SSE 版本号，下次写入补上。
 *
 * ## 差异分派与"只追加"纪律
 *
 * 变更器拿到的 draft 是**装配后的完整需求**（与现状 90 处 `mutate` 回调的写法兼容）。
 * 提交时按字段差异决定写什么：
 * - `comments` / `statusHistory` / `advance.history`：**尾部增长且前缀未改** → 追加一行（O(1)）；
 *   前缀被改写或元素被删 → **整份重写 + 告警**（只追加纪律被违反，不静默）；
 * - 四个外置对象：内容变化 → 整份原子写；被清空 → 删文件；
 * - 其余标量：并入 `record.json` 一次写出。
 *
 * ## 硬纪律
 *
 * - **`version` 由本层自增**（变更器改它也会被覆盖）——这是 CAS 成立的前提；
 * - **无变化不写盘**（`undefined` 与 `{changed:false}` 等价）：幂等判据 = 文件 mtime 不变；
 * - 冷侧（archived/done）**只读**：写即 `COLD_IMMUTABLE`；
 * - 进程内**串行队列**：临界区读-改-写 + 写前重读（不信任任何缓存）。
 *
 * @module dsh-pmboard/repositories/ShardedRequirementWriter
 */
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
// 冷侧写豁免（单一判据，与测试替身共用）：domain/requirement/ColdWrite。
import { isColdWriteExempt } from '../domain/requirement/ColdWrite.js'
import { toAdvanceLine, toCommentLine, toStatusLine, type JournalLine } from '../domain/requirement/Journal.js'
import { summarize, factsOf, type RequirementFacts, type RequirementSummary } from '../domain/requirement/RequirementSummary.js'
import type { RequirementShardRepository } from './RequirementShardRepository.js'
import { assembleRecord, loadParts, toHotRecord, type RequirementParts } from './shardAssembly.js'
import { writeWholeShard } from './shardWholeWrite.js'

export interface ShardedWriterDeps {
  readonly root: string
  readonly repo: RequirementShardRepository
  readonly onWarn: (message: string) => void
  readonly now: () => number
  /**
   * 变更广播：带上摘要、本次提交后的全局 revision，以及**窄投影事实**（`facts`）。
   *
   * 为什么第 5 参必须是 facts（REQ-261004065652-5c1c FR-4）：`dive` 驱动在 **idle 同步缝**里
   * 读 `peekFacts()` 判"该不该起轮"，而它读的正是自己刚写下的 `driverHealth`。
   * 摘要（`RequirementSummary`）里**没有** `dive` / `advance` / `description` / `tokenUsage`，
   * 旧实现只刷索引 ⇒ 驱动读不到自己的写 ⇒ 2026-10-03 死循环（4h36m / 7257 回合）。
   * 写入器此刻手上就有整条记录，顺带投影一份过去是**零额外 I/O** 的修法。
   */
  readonly notify: (kind: RequirementChange['kind'], id: string, summary: RequirementSummary, revision: number, facts?: RequirementFacts) => void
  /** 整体重建后通知 Store 丢弃索引（下次读时懒重建）。 */
  readonly onLedgerReplaced: () => void
  /** 写放大告警阈值（单次提交落盘字节；缺省不告警）。 */
  readonly writeAmplificationWarnBytes?: number
}

const OBJECT_KINDS = ['artifacts', 'plan', 'verification', 'archive'] as const
type ObjectKindName = typeof OBJECT_KINDS[number]

function coded(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra })
}

/** 稳定的深比较（键序无关）：用于判断"这次到底改没改"。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'undefined'
}

/** 尾部增长且前缀未改 → 返回新增行数；否则 `null`（需整份重写）。 */
function tailGrowth<T>(before: readonly T[], after: readonly T[]): number | null {
  if (after.length < before.length) return null
  for (let i = 0; i < before.length; i++) if (canonical(before[i]) !== canonical(after[i])) return null
  return after.length - before.length
}

export class ShardedRequirementWriter {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: ShardedWriterDeps) {}

  // ── 入口 ─────────────────────────────────────────────────────────────

  async create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord> {
    return this.serialize(async () => {
      const { root, repo } = this.deps
      if (!isRequirementId(input.id)) {
        throw coded(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, `需求 id 形态非法：${JSON.stringify(input.id)}`)
      }
      if (input.title.trim().length === 0) {
        throw coded(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, '需求标题不能为空')
      }
      if (await this.exists(input.id)) {
        throw coded(REQUIREMENT_STORE_ERROR.ALREADY_EXISTS, `需求 ${input.id} 已存在（create 不覆盖）`, { requirementId: input.id })
      }
      const now = this.deps.now()
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
        ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.sourceSessionId !== undefined ? { sourceSessionId: input.sourceSessionId } : {}),
      }
      const hot = toHotRecord(record, { comments: 0, history: 0, artifacts: 0 })
      await repo.writeRecordAtomic(root, input.id, hot as unknown as RequirementRecord)
      const revision = await this.bumpRevision()
      // §7.2 修复（t8/B0b）：订阅帧必须带**真 revision**。此前 `notify` 不带 revision、由 Store
      // 填占位 `0` ⇒ SSE 帧的版本号与"revision 短路"判据一并退化为恒 0（t5 复核已登记"t8 接线时修"）。
      this.deps.notify('requirement-created', input.id, summarize(record), revision, factsOf(record))
      return record
    })
  }

  /** `expectedVersion === undefined` = 不做 CAS（临界区内 RMW，单写者语义）。 */
  async mutate(
    id: string,
    expectedVersion: number | undefined,
    fn: (draft: RequirementDraft) => MutationOutcome | undefined,
  ): Promise<MutateResult> {
    return this.serialize(() => this.applyMutation(id, expectedVersion, fn))
  }

  async appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }> {
    const result = await this.serialize(() =>
      this.applyMutation(id, undefined, (draft) => {
        draft.comments.push({ ...comment })
        return { changed: true }
      }, 'comment-added'),
    )
    return { version: result.version, commentCount: result.requirement.comments.length }
  }

  /**
   * 启动对账：一次扫全部**热侧**需求，回调挑出要改的，逐条提交，**全局序只 +1**。
   *
   * 回调返回不在扫描集里的 id → 忽略并告警（对账是幂等批处理，一个越界 id 不该让整轮失败）。
   */
  async sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult> {
    void reason
    return this.serialize(async () => {
      const { root, repo, onWarn } = this.deps
      const ids = await repo.listHotIds(root)
      const parts: RequirementParts[] = []
      for (const id of ids) {
        const loaded = await loadParts(repo, root, id, onWarn)
        if (loaded !== undefined) parts.push(loaded)
      }
      const drafts = parts.map((p) => assembleRecord(p) as RequirementDraft)
      const byId = new Map(drafts.map((d) => [d.id, d]))
      const touched: string[] = []
      let revision: number | undefined
      for (const id of fn(drafts)) {
        const draft = byId.get(id)
        if (draft === undefined) {
          onWarn(`sweep 返回了不在扫描集里的需求 id（已忽略）：${id}`)
          continue
        }
        const before = parts.find((p) => p.record.id === id)!
        const applied = await this.commit(draft, before, { skipRevisionBump: true })
        revision = applied.revision
        touched.push(id)
      }
      if (touched.length === 0) return { touched: [], revision: (await this.headRevision()) }
      const bumped = await this.bumpRevision()
      return { touched, revision: revision === undefined ? bumped : Math.max(bumped, revision) }
    })
  }

  /** 整体重建（迁移/回滚脚本专用）：先清空两侧分片，再按导入结构逐条写出。 */
  async replaceAll(reason: string, next: ImportedLedger): Promise<void> {
    void reason
    return this.serialize(async () => {
      const { root, repo } = this.deps
      for (const id of [...(await repo.listHotIds(root)), ...(await repo.listColdIds(root))]) {
        await repo.deleteShard(root, id)
      }
      for (const record of next.requirements) {
        await writeWholeShard(repo, root, record)
        // meta.json（提交点）在循环之后才写；但**将要**写入的全局序就是 `next.revision`，
        // 故广播用它——订阅者拿到的是"这次整册替换归属的版本"，不是占位值。
        this.deps.notify('ledger-replaced', record.id, summarize(record), next.revision, factsOf(record))
      }
      await repo.writeMeta(root, {
        schemaVersion: next.schemaVersion,
        revision: next.revision,
        ...(next.migrations !== undefined ? { migrations: next.migrations } : {}),
      })
      this.deps.onLedgerReplaced()
    })
  }

  // ── 内部：单条变更 ───────────────────────────────────────────────────

  private async applyMutation(
    id: string,
    expectedVersion: number | undefined,
    fn: (draft: RequirementDraft) => MutationOutcome | undefined,
    kindOverride?: RequirementChange['kind'],
  ): Promise<MutateResult> {
    const { root, repo, onWarn } = this.deps
    const before = await loadParts(repo, root, id, onWarn)
    if (before === undefined) {
      throw coded(REQUIREMENT_STORE_ERROR.NOT_FOUND, `需求 ${id} 不存在（写操作不隐式建档）`, { requirementId: id })
    }
    if (expectedVersion !== undefined && before.record.version !== expectedVersion) {
      throw coded(
        REQUIREMENT_STORE_ERROR.CONFLICT,
        `需求 ${id} 版本不匹配：期望 ${expectedVersion}，当前 ${before.record.version}`,
        { requirementId: id, currentVersion: before.record.version },
      )
    }
    const assembled = assembleRecord(before)
    const draft = structuredClone(assembled) as RequirementDraft
    const outcome = fn(draft)
    if (outcome === undefined || outcome.changed === false) {
      return { requirement: assembled, version: before.record.version, revision: await this.headRevision(), changed: false }
    }
    // 冷侧只读的**唯一豁免**：归档材料（人工裁定 2026-10-02，见 notes/t8-progress.md §14.2）。
    // ⚠️ 检查必须留在 `fn` **之后**：豁免与否取决于"这次到底改了什么"，而 `fn` 只改本地 draft 克隆、
    // 无落盘副作用（挪到后面才看得到差异；放在前面就只剩"按状态一刀切"）。
    if (isColdStatus(before.record.status)
      && !isColdWriteExempt(assembled as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>)) {
      throw coded(REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE, `需求 ${id} 已归档（${before.record.status}），冷侧只读`, { requirementId: id })
    }
    return this.commit(draft, before, { ...(kindOverride !== undefined ? { kindOverride } : {}) })
  }

  /**
   * 提交一次变更：日志 → 外置对象 → 提交点 → 全局序。
   *
   * `draft` 必须是装配后的完整需求（含大字段），本方法负责把它按差异拆回各文件。
   */
  private async commit(
    draft: RequirementDraft,
    before: RequirementParts,
    opts: { skipRevisionBump?: boolean; kindOverride?: RequirementChange['kind'] } = {},
  ): Promise<MutateResult> {
    const { root, repo } = this.deps
    const id = draft.id
    const beforeRecord = assembleRecord(before)

    // ① 日志（评论 + 历史）：尾部增长走追加，其余走整份重写
    const nextComments = draft.comments ?? []
    const commentLines = nextComments.map((c, i) => toCommentLine(i, c))
    const beforeCommentLines = before.comments.map((c, i) => toCommentLine(i, c))
    await this.syncJournal(id, 'comments', beforeCommentLines, commentLines, '评论')

    const nextHistoryLines: JournalLine[] = [
      ...(draft.statusHistory ?? []).map((e, i) => toStatusLine(i, e)),
    ]
    for (const [i, a] of (draft.advance?.history ?? []).entries()) {
      nextHistoryLines.push(toAdvanceLine((draft.statusHistory ?? []).length + i, a))
    }
    const beforeHistoryLines: JournalLine[] = [
      ...(beforeRecord.statusHistory ?? []).map((e, i) => toStatusLine(i, e)),
    ]
    for (const [i, a] of (beforeRecord.advance?.history ?? []).entries()) {
      beforeHistoryLines.push(toAdvanceLine((beforeRecord.statusHistory ?? []).length + i, a))
    }
    await this.syncJournal(id, 'history', beforeHistoryLines, nextHistoryLines, '历史')

    // ② 外置对象：内容变了就整份写；被清空就删文件
    for (const kind of OBJECT_KINDS) {
      this.checkObjectChange(id, kind, beforeRecord, draft)
      const beforeValue = (beforeRecord as unknown as Record<string, unknown>)[kind]
      const nextValue = (draft as unknown as Record<string, unknown>)[kind]
      if (canonical(beforeValue) === canonical(nextValue)) continue
      if (nextValue === undefined) await repo.deleteObject(root, id, kind)
      else await repo.writeObjectAtomic(root, id, kind, nextValue)
    }

    // ③ 提交点（version 由本层自增；计数与磁盘一致）
    const version = before.record.version + 1
    const merged: RequirementRecord = {
      ...(draft as unknown as RequirementRecord),
      version,
      comments: [...nextComments],
    }
    const hot = toHotRecord(merged, {
      comments: nextComments.length,
      history: nextHistoryLines.length,
      artifacts: Array.isArray(draft.artifacts) ? draft.artifacts.length : 0,
    })
    await repo.writeRecordAtomic(root, id, hot as unknown as RequirementRecord)

    // ④ 全局序 + 广播
    const revision = opts.skipRevisionBump === true ? await this.headRevision() : await this.bumpRevision()
    this.warnIfAmplified(id)
    const kind = opts.kindOverride ?? (beforeRecord.status === draft.status ? 'requirement-updated' : 'requirement-moved')
    const finalRecord = { ...merged, ...(draft as unknown as Record<string, unknown>) } as unknown as RequirementRecord
    this.deps.notify(kind, id, summarize(finalRecord), revision, factsOf(finalRecord))
    return { requirement: finalRecord, version, revision, changed: true }
  }

  /** 只追加纪律：前缀被改写/元素被删 → 告警（随后走整份重写）。 */
  private checkObjectChange(id: string, kind: ObjectKindName, before: RequirementRecord, draft: RequirementDraft): void {
    const prev = (before as unknown as Record<string, unknown>)[kind]
    const next = (draft as unknown as Record<string, unknown>)[kind]
    if (prev !== undefined && next === undefined) {
      this.deps.onWarn(`需求 ${id} 的 ${kind} 被清空（存储层删除该外置对象）——若不是有意为之请检查变更器`)
    }
  }

  /** 同步一份日志：尾部增长 → 逐行追加；否则整份重写并告警（只追加纪律被违反）。 */
  private async syncJournal(
    id: string,
    kind: 'comments' | 'history',
    beforeLines: readonly JournalLine[],
    lines: readonly JournalLine[],
    label: string,
  ): Promise<void> {
    const { root, repo, onWarn } = this.deps
    // 只追加纪律的判定要**比前缀**，不能只看长度：同长度下的"改一条旧行"若只看长度会被静默丢弃
    const growth = tailGrowth(beforeLines, lines)
    if (growth === null) {
      onWarn(`需求 ${id} 的${label}被删改（${beforeLines.length} → ${lines.length}）——${label}只允许追加，已整份重写`)
      await repo.writeJournalAtomic(root, id, kind, lines)
      return
    }
    if (growth === 0) return
    // 追加时 count 就是该行的 seq（仓储会先按提交点计数截断未提交尾巴，I-2）
    for (let seq = beforeLines.length; seq < lines.length; seq++) {
      await repo.appendJournal(root, id, kind, lines[seq]!, seq)
    }
  }

  // ── 内部：基础设施 ───────────────────────────────────────────────────

  private async exists(id: string): Promise<boolean> {
    const { root, repo } = this.deps
    if ((await repo.readRecord(root, id)) !== undefined) return true
    return (await repo.readRecord(root, id, { cold: true })) !== undefined
  }

  private async headRevision(): Promise<number> {
    return (await this.deps.repo.readMeta(this.deps.root))?.revision ?? 0
  }

  private async bumpRevision(): Promise<number> {
    const { root, repo } = this.deps
    const meta = await repo.readMeta(root)
    const revision = (meta?.revision ?? 0) + 1
    await repo.writeMeta(root, {
      schemaVersion: meta?.schemaVersion ?? 10,
      revision,
      ...(meta?.migrations !== undefined ? { migrations: meta.migrations } : {}),
    })
    return revision
  }

  private warnIfAmplified(id: string): void {
    const threshold = this.deps.writeAmplificationWarnBytes
    if (threshold === undefined) return
    // 说明：真正的字节统计在 fs 探针里（测试用）；这里只提供"超阈值即告警"的钩子，
    // 生产实现可由适配器在 fs 端口上挂计数器后调用。
    void id
    void threshold
  }

  /**
   * 等到**此前受理的写**全部落盘（B12 阶段①-a 裁决 I1）。
   *
   * 为什么必须有它：组合根要在"排空 + 读 revision"处记下**已落盘**的证据指针
   * （`persistArtifacts`）。直接 `head()` 是读 `meta.json`，与本串行队列无关 ⇒
   * 可能记下尚未落盘的 revision。这里等的就是同一根队列。
   */
  async drain(): Promise<void> {
    await this.queue
  }

  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.then(() => undefined, () => undefined)
    return next as Promise<T>
  }
}
