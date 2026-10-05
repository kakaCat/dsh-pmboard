/**
 * 旧单册台账 → **新需求存储端口**的测试侧投影（REQ-261002161439-277d t8 · B11）。
 *
 * ## 为什么需要它
 *
 * 读点搬迁（B2–B10）后，用例读的是 `deps.store`（新端口），而 `requirementStoreOf(deps)`
 * 在 `deps.store` 缺失时**刻意响亮抛错**——静默回退到整册读就是"读点没真搬"的假绿。
 *
 * 问题是：**tests 下有一批"手搓 deps 字面量"的夹具，它们的真相是旧的 `ReqboardRepository`**
 * （很多还真的落临时 JSON 文件、并断言文件内容，例如台账编解码/迁移类测试）。
 * 对这些夹具，**不能**换成内存 store（会毁掉它们要验的东西），也**不能**让两条路各持一份数据
 * （那就是静默分歧的温床）。
 *
 * ⇒ 本文件把同一个旧 repo **投影**成新端口：读走同一份快照、写转发给同一个 `mutate`，
 * 于是"经 `store` 读"与"经 `repo` 写"看到的**永远是同一份数据**。
 *
 * ## 纪律
 *
 * - **只在 tests 下**：生产不存在这种反向投影（生产的真相就是新存储，正向适配器是
 *   `src/adapters/LegacyRepoSyncBridge.ts`）。src 里出现"新端口回落旧 repo"的兼容壳是**禁止**的
 *   （卡上原文：不做兼容壳）——那会把"漏装配"从编译/启动期挪进运行期且无人发现。
 * - **随 B12 一起删除**（届时夹具一律用 `makeTestStore()` 或 `makeHarness`）。
 * - 分页游标（`RequirementFilter.cursor`）**不实现**：本投影仅供测试夹具过渡用，
 *   已迁读点里没有依赖它的；用到就该显式失败而不是给个假游标。
 *
 * @module dsh-pmboard/tests/support/legacy-store-projection
 */
import { REQUIREMENT_STORE_ERROR, type LedgerMutateResult, type LedgerChange, type LedgerView, type MutationOutcome, type MutateResult, type MutableLedger, type NewComment, type NewRequirement, type RequirementChange, type RequirementDraft, type RequirementFilter, type RequirementHistoryEntry, type RequirementStore, type RequirementSummaryPage, type SweepResult, type ImportedLedger } from '../../src/application/ports.js'
import type { ActorRef, CommentRecord, RequirementRecord } from '../../src/shared/protocol.js'
import { factsOf, summarize, type RequirementFacts } from '../../src/domain/requirement/RequirementSummary.js'
import { compareSummaryOrder } from '../../src/repositories/shardPaging.js'

function coded(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra })
}

/** 旧快照 → 需求记录数组（旧 `LedgerView.requirements` 已是只读数组，这里深克隆一份防止被改）。 */
function recordsOf(view: LedgerView): RequirementRecord[] {
  return structuredClone(view.requirements) as RequirementRecord[]
}

/**
 * 把旧端口投影成新端口（同一份数据）。
 *
 * 只实现**已迁读点真正会用到**的语义；未实现的（游标分页）显式抛错，不返回假结果。
 */
export class LegacyStoreProjection implements RequirementStore {
  /** 分诊记录：如实转发旧仓库（本投影存在的意义就是让旧库喂新端口）。 */
  async listTriages(filter?: { sessionId?: string }): Promise<readonly never[]> {
    const all = (this.repo.snapshot().triages ?? []) as readonly { sessionId?: unknown }[]
    const out = filter?.sessionId === undefined ? all : all.filter((x) => x?.sessionId === filter.sessionId)
    return out as never
  }

  constructor(private readonly repo: LegacyRepoShape) {}

  // ── 读 ───────────────────────────────────────────────────────────────

  async get(id: string): Promise<RequirementRecord | undefined> {
    return recordsOf(this.repo.snapshot()).find((r) => r.id === id)
  }

  async getSummary(id: string): Promise<ReturnType<typeof summarize> | undefined> {
    const rec = await this.get(id)
    return rec === undefined ? undefined : summarize(rec)
  }

  async listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage> {
    if (filter?.cursor !== undefined) {
      throw coded('REQBOARD_STORE_INCONSISTENT', 'LegacyStoreProjection 不支持游标分页（测试投影，B12 删除）')
    }
    const scope = filter?.scope ?? 'active'
    const all = recordsOf(this.repo.snapshot())
    const picked = all.filter((r) => {
      if (scope === 'active' && (r.status === 'archived' || r.status === 'canceled')) return false
      if (scope === 'archived' && r.status !== 'archived') return false
      if (filter?.ids !== undefined && !filter.ids.includes(r.id)) return false
      if (filter?.status !== undefined && !filter.status.includes(r.status)) return false
      if (filter?.workspaceRoot !== undefined && r.workspaceRoot !== filter.workspaceRoot) return false
      if (filter?.sourceSessionId !== undefined && r.sourceSessionId !== filter.sourceSessionId) return false
      return true
    })
    const items = picked
      .map((r) => summarize(r))
      .sort(compareSummaryOrder)
      .slice(0, filter?.limit ?? 200)
    return { items }
  }

  peekSummaries(): readonly ReturnType<typeof summarize>[] {
    return recordsOf(this.repo.snapshot()).map((r) => summarize(r))
  }

  /** 同步提示词窄投影（B12 阶段①-a）：过渡口，随删桥一并删除（见 §四.3）。 */
  peekFacts(): readonly RequirementFacts[] {
    return recordsOf(this.repo.snapshot()).map((r) => factsOf(r))
  }

  async listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]> {
    const rec = await this.get(id)
    const comments = rec?.comments ?? []
    // 旧 `CommentRecord` 没有 `seq` 字段（序号由落盘格式承担），故 `since` 按**数组下标**解释。
    const from = opts?.since ?? 0
    return comments.slice(from, from + (opts?.limit ?? 200))
  }

  async listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]> {
    const rec = await this.get(id)
    const history = (rec?.statusHistory ?? []) as unknown as readonly RequirementHistoryEntry[]
    return opts?.limit === undefined ? history : history.slice(-opts.limit)
  }

  /** 过渡口：旧端口的"排空"就是 `read(() => undefined)`（走同一条串行队列）。 */
  async headAfterDrain(): Promise<{ revision: number; schemaVersion: number }> {
    await this.repo.read(() => undefined)
    return this.head()
  }

  async head(): Promise<{ revision: number; schemaVersion: number }> {
    const view = this.repo.snapshot()
    return { revision: view.revision, schemaVersion: view.schemaVersion }
  }

  // ── 写（全部转发给同一个旧 mutate，保证与 `repo` 写是同一次落盘）───────────

  async create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord> {
    const now = Date.now()
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
    await this.repo.mutate('requirement-created', (ledger: MutableLedger) => {
      ledger.requirements.push(structuredClone(record) as never)
      return { requirements: [record] }
    })
    return record
  }

  async mutate(id: string, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    return this.mutateIf(id, undefined, fn)
  }

  async mutateIf(id: string, expectedVersion: number | undefined, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    let out: MutateResult | undefined
    await this.repo.mutate('requirement-updated', (ledger: MutableLedger) => {
      const rec = ledger.requirements.find((r) => r.id === id)
      if (rec === undefined) {
        throw coded(REQUIREMENT_STORE_ERROR.NOT_FOUND, `需求 ${id} 不存在（写操作不隐式建档）`, { requirementId: id })
      }
      if (expectedVersion !== undefined && rec.version !== expectedVersion) {
        throw coded(REQUIREMENT_STORE_ERROR.CONFLICT, `需求 ${id} 版本不匹配：期望 ${expectedVersion}，当前 ${rec.version}`, {
          requirementId: id, currentVersion: rec.version,
        })
      }
      const draft = structuredClone(rec) as RequirementDraft
      const outcome = fn(draft)
      if (outcome === undefined || outcome.changed === false) {
        out = { requirement: structuredClone(rec), version: rec.version, revision: ledger.revision, changed: false }
        return undefined
      }
      const merged = { ...(draft as unknown as RequirementRecord), version: rec.version + 1 } as RequirementRecord
      Object.assign(rec, structuredClone(merged))
      out = { requirement: structuredClone(merged), version: merged.version, revision: ledger.revision + 1, changed: true }
      return { requirements: [merged] }
    })
    if (out === undefined) {
      const rec = await this.get(id)
      if (rec === undefined) {
        throw coded(REQUIREMENT_STORE_ERROR.NOT_FOUND, `需求 ${id} 不存在（写操作不隐式建档）`, { requirementId: id })
      }
      throw coded(REQUIREMENT_STORE_ERROR.IO_FAILED, `需求 ${id} 的变更未落盘（测试投影异常）`, { requirementId: id })
    }
    return out
  }

  async appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }> {
    const res = await this.mutate(id, (draft) => {
      draft.comments.push({ ...comment } as never)
      return { changed: true }
    })
    return { version: res.version, commentCount: res.requirement.comments.length }
  }

  async sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult> {
    let touched: readonly string[] = []
    let revision = 0
    await this.repo.mutate(reason === '' ? 'requirement-updated' : reason, (ledger: MutableLedger) => {
      const drafts = ledger.requirements.map((r) => structuredClone(r)) as RequirementDraft[]
      touched = fn(drafts)
      const byId = new Map(drafts.map((d) => [d.id, d]))
      const changed = ledger.requirements.filter((r) => touched.includes(r.id))
      for (const rec of changed) {
        const draft = byId.get(rec.id)
        if (draft !== undefined) Object.assign(rec, structuredClone(draft))
      }
      revision = ledger.revision + 1
      return { requirements: changed }
    })
    return { touched, revision }
  }

  async replaceAll(reason: string, next: ImportedLedger): Promise<void> {
    await this.repo.replaceAll(reason, next)
  }

  subscribe(fn: (change: RequirementChange) => void): () => void {
    const source = this.repo as LegacyRepoShape & {
      subscribe?: (cb: (change: LedgerChange) => void) => () => void
    }
    // 端口上**没有** `subscribe`（只有具体单册实现有）；夹具若用的是端口实现，返回无操作退订，
    // 并**不假装**能收到帧（测试投影，B12 删除）。
    if (source.subscribe === undefined) return () => { /* no-op */ }
    return source.subscribe((change: LedgerChange) => {
      const recs = change.requirements ?? []
      for (const rec of recs) {
        fn({
          kind: (recs.length > 1 ? 'ledger-replaced' : 'requirement-updated') as RequirementChange['kind'],
          requirementId: rec.id,
          revision: 0,
          summary: summarize(rec),
        })
      }
    })
  }
}

/** 一行接进夹具：`store: legacyStoreProjection(repo)`。 */
/**
 * 旧单册端口已被删除（B12 阶段⑤）——本过渡件改用它当时对外暴露的**结构化形状**，
 * 好让"还没迁完的夹具"继续能被包一层新端口视图。
 */
export interface LegacyRepoShape {
  snapshot(): LedgerView
  read<T>(fn: (ledger: MutableLedger) => T): Promise<T>
  mutate(reason: string, fn: (ledger: MutableLedger) => LedgerChange | undefined): Promise<LedgerMutateResult>
  replaceAll(reason: string, next: LedgerView): Promise<unknown>
}

export function legacyStoreProjection(repo: LegacyRepoShape): RequirementStore {
  return new LegacyStoreProjection(repo)
}
