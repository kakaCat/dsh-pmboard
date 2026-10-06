/**
 * 需求存储的**分片实现**（REQ-261002161439-277d · t4 读侧 / FR-1、FR-3、FR-4）。
 *
 * ## 本卡只做读侧
 *
 * 写侧（create/mutate/mutateIf/appendComment/sweep/replaceAll）是 t5 的卡：本类里那几个方法
 * **显式抛"未落地"**，而不是假装成功或返回空——静默的假成功会让 t5 的验收测试给出假绿。
 * 契约测试的注册表里也如实标注本实现当前只跑读套件（t5 落地后翻转），见
 * `tests/reqboard/store-contract.test.ts` 的 `suites` 字段。
 *
 * ## 索引：懒建 + 不落盘
 *
 * - **懒建**：首次 `listSummaries`/`getSummary` 时扫一遍热侧每个需求的 `record.json`
 *   （沿用 `QueueTaskStore.buildIndexFromDisk` 先例：不在构造期预读）。
 * - **不落盘**：没有索引文件，就不存在"索引与分片不一致"这个议题（崩溃后重建即收敛）。
 * - **未命中不重扫全量**：索引里没有某个 id 时，只**定点**读那一条（可能是索引建好之后新建的），
 *   命中即补进索引；仍没有才去看冷侧。这样"新建的需求立刻可读"，代价是 O(单需求)。
 * - **负结果不缓存**：查不到的 id 不进索引（否则"先查后建"会永久读不到）。
 *
 * ## 装配：大字段按需取回
 *
 * 热记录只有标量 + 计数；`get()` 时按 `comments.jsonl` / `history.jsonl` / 四个外置对象装配回
 * **与现状同形的 `RequirementRecord`**（调用方与看板类型零改动）。计数缺失时**告警并按 0 装配**
 * ——宁少读已提交数据也不把未提交的尾巴暴露出去（I-2 的方向是单向的）。
 *
 * ## 刻意不做的事
 *
 * - **不缓存完整记录**：写路径信任缓存 = 用旧快照覆盖别人刚写的内容（本仓踩过的静默丢数据）。
 *   装配是 O(单需求)，不值得为省这点读去冒那个险。
 * - **冷侧不预读内容**：默认载荷不含归档；显式 `scope:'archived'` 时才读冷侧记录。
 *
 * @module dsh-pmboard/repositories/ShardedRequirementStore
 */
import { REQBOARD_SCHEMA_VERSION, type CommentRecord, type RequirementRecord } from '../shared/protocol.js'
import type {
  LedgerHead,
  MutationOutcome,
  MutateResult,
  NewComment,
  NewRequirement,
  RequirementChange,
  RequirementDraft,
  RequirementFilter,
  RequirementHistoryEntry,
  RequirementStore,
  RequirementSummaryPage,
  ImportedLedger,
  SweepResult,
} from '../application/ports.js'
import type { ActorRef, TriageRecord } from '../shared/protocol.js'
import { factsOf, type RequirementFacts, type RequirementSummary } from '../domain/requirement/RequirementSummary.js'
import { boardSummaryOf, boardSummaryOfAuthoritative, type BoardSummaryInput } from '../shared/board-summary.js'
import type { ObjectKind } from '../domain/requirement/ReqboardPaths.js'
import { compareSummaryOrder, decodeSummaryCursor, encodeSummaryCursor } from './shardPaging.js'
import { RequirementShardRepository } from './RequirementShardRepository.js'
import { assembleRecord, loadParts } from './shardAssembly.js'
import { ShardedRequirementWriter } from './ShardedRequirementWriter.js'

export interface ShardedRequirementStoreOptions {
  /** 数据根（`~/.dsh/reqboard`）。 */
  root: string
  /** 分片仓储（缺省自建；测试可注入带假 fs/探针的仓储）。 */
  repository?: RequirementShardRepository
  /** 告警通道（缺省 `console.warn`）：坏分片剔除、计数缺失、IO 异常都走这里。 */
  onWarn?: (message: string) => void
  /** 时钟（写路径的 createdAt/updatedAt 来源；缺省 `Date.now`）。 */
  now?: () => number
  /** 写放大告警阈值（单次提交落盘字节；缺省不告警）。 */
  writeAmplificationWarnBytes?: number
}

export class ShardedRequirementStore implements RequirementStore {
  private readonly root: string
  private readonly repo: RequirementShardRepository
  private readonly onWarn: (message: string) => void
  /** 热侧摘要索引（懒建；`undefined` = 还没建过，"建过但为空"是空 Map）。 */
  private index: Map<string, RequirementSummary> | undefined
  /**
   * 窄投影里**不在摘要中**的那几个字段的快照（B12 阶段①-a）：
   * `description` / `dive` / `advance` / `artifacts` / `tokenUsage`。
   *
   * 为什么分开存：`peekFacts()` 的其余字段（id/title/status/updatedAt/version/category/
   * sourceSessionId/autorun）都能从**始终实时**的 `index` 取；这些不在摘要里，需要单独一份。
   *
   * **新鲜度契约（REQ-261004065652-5c1c FR-4 修正）**：本快照在**每一次写提交的 notify 回调里
   * 同拍刷新**（写侧把整条记录的投影一起递过来），因此对**经本端口写入**的变更满足读己所写。
   *
   * ⚠️ 修前的注释曾写"只有这四个可能略旧，判定类字段不会旧"——那是**错的**：
   * `dive` / `advance` 恰恰是 `isDrivableRequirement` 的判定字段，而旧实现只在建索引/create 时
   * 填快照 ⇒ 驱动读不到自己刚写的 `driverHealth=paused` ⇒ 2026-10-03 死循环
   * （4h36m / 7257 回合，见 docs/requirements/REQ-261004065652-5c1c/requirement.md §E-3）。
   * 残留边界：**绕过本端口**直接改分片文件的写入者仍不会被感知（仓外脚本直写），
   * 与"绑定改写留痕"同一类诚实边界。
   */
  private factsCache: Map<string, RequirementFacts> | undefined
  private readonly writer: ShardedRequirementWriter
  private readonly subscribers = new Set<(change: RequirementChange) => void>()

  constructor(options: ShardedRequirementStoreOptions) {
    this.root = options.root
    this.repo = options.repository ?? new RequirementShardRepository()
    this.onWarn = options.onWarn ?? ((message) => console.warn(message))
    this.writer = new ShardedRequirementWriter({
      root: this.root,
      repo: this.repo,
      onWarn: this.onWarn,
      now: options.now ?? (() => Date.now()),
      notify: (kind, id, summary, revision, facts) => {
        // 变更后同步内存索引（订阅者与摘要读路径都靠它，不必重读分片）
        if (this.index !== undefined) this.index.set(id, summary)
        else void id
        // REQ-261004065652-5c1c FR-4：窄投影**必须同拍刷新**。
        // 驱动在 idle 同步缝里读 peekFacts() 判"该不该起轮"，读的正是它自己刚写的 driverHealth；
        // 只刷索引 ⇒ 驱动永远看不到自己的暂停 ⇒ 无限起轮（2026-10-03 实测 7257 回合 / 4h36m）。
        // 写入器此刻手上就有整条记录，投影一份过来是零额外 I/O。
        if (facts !== undefined && this.factsCache !== undefined) this.factsCache.set(id, facts)
        this.notify(kind, id, summary, revision)
      },
      onLedgerReplaced: () => { this.index = undefined; this.factsCache = undefined },
      ...(options.writeAmplificationWarnBytes !== undefined ? { writeAmplificationWarnBytes: options.writeAmplificationWarnBytes } : {}),
    })
  }

  // ── 读：索引 ─────────────────────────────────────────────────────────

  /** 懒建热侧索引：扫热侧每个需求的 `record.json`，坏分片剔除并告警（不抛整页错）。 */
  private async ensureIndex(): Promise<Map<string, RequirementSummary>> {
    if (this.index !== undefined) return this.index
    const index = new Map<string, RequirementSummary>()
    this.factsCache = new Map<string, RequirementFacts>()
    const ids = await this.repo.listHotIds(this.root)
    for (const id of ids) {
      const summary = await this.summarizeHot(id, true)
      if (summary !== undefined) index.set(id, summary)
    }
    this.index = index
    return index
  }

  /**
   * 摘要用的**三件外置对象取数**（REQ-261006175040-12d4 t3 / FR-2、FR-6）。
   *
   * 索引构建读的是热记录（`record.json`，只有标量与计数），门读数所需的 `artifacts` / `plan` /
   * `archive` 都在外置对象里 ⇒ 这里补读三件。**一次性成本**：进程内索引建立时每需求合计 2.19 MiB /
   * 60 条（实测见 `evidence/payload-baseline.md`），索引命中后每请求 0；写路径手上就有整条记录，
   * 不走这里（`ShardedRequirementWriter` 直接投影）。
   *
   * 刻意**不读** `verification.json`（1.95 MiB）：验收 chip 由 `gates` 里的 verification 门读数表达。
   */
  private async withGateObjects(record: RequirementRecord, cold = false): Promise<BoardSummaryInput> {
    const [artifacts, plan, archive] = await Promise.all([
      this.readObjectForSummary<readonly unknown[]>(record.id, 'artifacts', cold),
      this.readObjectForSummary<BoardSummaryInput['plan']>(record.id, 'plan', cold),
      this.readObjectForSummary<unknown>(record.id, 'archive', cold),
    ])
    return {
      ...record,
      // 文件不存在 = 该需求从未登记该类产物 ⇒ 传空数组（真实缺失：卡面该显示红 ✗）
      ...(artifacts.known ? { artifacts: artifacts.value ?? [] } : {}),
      // 计划：不存在 ⇒ 不给键（无计划 = 无 chip；该 chip 本就没有「缺失」态）
      ...(plan.known && plan.value !== undefined ? { plan: plan.value } : {}),
      ...(archive.known && archive.value !== undefined ? { archive: archive.value } : {}),
      // 读不到（损坏被隔离 / IO 异常）⇒ 显式告知装配点：归档读数不可得
      ...(archive.known ? {} : { archiveReadable: false }),
    }
  }

  /**
   * 读一件外置对象，并回答**「读得到吗」**（而不是「值是什么」）。
   *
   * 三种结局分开处置（`design/backend.md` §3）：
   *   · 读到值 → `known: true` + 值；
   *   · 文件不存在（真没有）→ `known: true` 无值（调用方按空处理）；
   *   · 文件在盘上却读不出来 / IO 抛错 → `known: false` + `onWarn`（**不剔除需求**：
   *     标量与计数仍在，读不到只是"这个读数不可得"）。
   */
  private async readObjectForSummary<T>(
    id: string,
    kind: ObjectKind,
    cold: boolean,
  ): Promise<{ known: boolean; value?: T }> {
    const opts = cold ? { cold: true } : {}
    try {
      const value = await this.repo.readObject<T>(this.root, id, kind, opts)
      if (value !== undefined) return { known: true, value }
      const exists = await this.repo.objectExists(this.root, id, kind, opts)
      if (exists) {
        this.onWarn(`分片 ${id} 的 ${kind} 对象在盘上却读不出来（可能已隔离）——该读数按不可得处理（卡面不渲染，不冒充缺失）`)
        return { known: false }
      }
      return { known: true }
    } catch (err) {
      this.onWarn(`分片 ${id} 的 ${kind} 对象读取失败，该读数按不可得处理：${(err as Error).message}`)
      return { known: false }
    }
  }

  /**
   * 取某热侧需求的摘要（`cache: true` 时补进索引）。
   *
   * 坏分片（解析失败/结构不合规）在这里被**挡住**：告警 + 返回 `undefined`，
   * 让"某一条坏了"不至于让整个看板 500。注意这**不是**静默降级——告警带需求 id 与原因。
   */
  private async summarizeHot(id: string, cache: boolean): Promise<RequirementSummary | undefined> {
    try {
      const record = await this.repo.readRecord(this.root, id)
      if (record === undefined) return undefined
      const summary = boardSummaryOf(await this.withGateObjects(record))
      if (cache && this.index !== undefined) this.index.set(id, summary)
      // 顺手留下窄投影快照（只有在此处读到整条记录才拿得到它，见 factsCache 的注释）。
      if (cache && this.factsCache !== undefined) this.factsCache.set(id, factsOf(record))
      return summary
    } catch (err) {
      this.onWarn(`分片 ${id} 读取失败，已从索引剔除（其余需求不受影响）：${(err as Error).message}`)
      return undefined
    }
  }

  /** 冷侧摘要（按需读，不建索引）：`scope:'archived'|'all'` 才走这里。 */
  private async coldSummaries(): Promise<RequirementSummary[]> {
    const ids = await this.repo.listColdIds(this.root)
    const out: RequirementSummary[] = []
    for (const id of ids) {
      try {
        const record = await this.repo.readRecord(this.root, id, { cold: true })
        if (record !== undefined) out.push(boardSummaryOf(await this.withGateObjects(record, true)))
      } catch (err) {
        this.onWarn(`冷侧分片 ${id} 读取失败，已跳过：${(err as Error).message}`)
      }
    }
    return out
  }

  // ── 读：端口方法 ─────────────────────────────────────────────────────

  async getSummary(id: string): Promise<RequirementSummary | undefined> {
    const index = await this.ensureIndex()
    const hit = index.get(id)
    if (hit !== undefined) return hit
    // 未命中：定点读热侧（可能是索引建好之后新建的）；命中则补进索引
    const fresh = await this.summarizeHot(id, true)
    if (fresh !== undefined) return fresh
    // 再回落冷侧
    try {
      const cold = await this.repo.readRecord(this.root, id, { cold: true })
      // 冷侧也要带门读数（终态行读 archivePrepared；见 design/architecture.md §4）
      return cold === undefined ? undefined : boardSummaryOfAuthoritative(await this.withGateObjects(cold, true))
    } catch (err) {
      this.onWarn(`冷侧分片 ${id} 读取失败：${(err as Error).message}`)
      return undefined
    }
  }

  async listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage> {
    const offset = decodeSummaryCursor(filter?.cursor)
    if (offset === null) return { items: [] } // 越界/伪造游标 → 空页（不抛错，避免看板整页报错）
    const scope = filter?.scope ?? 'active'
    const index = await this.ensureIndex()

    const hot = [...index.values()]
    const all: RequirementSummary[] = scope === 'active'
      ? hot
      : scope === 'archived'
        ? await this.coldSummaries()
        : [...hot, ...(await this.coldSummaries())]

    const matched = all
      .filter((s) => {
        if (filter?.ids !== undefined && !filter.ids.includes(s.id)) return false
        if (filter?.status !== undefined && !filter.status.includes(s.status)) return false
        // t5（FR-8）：`includeUnattributed` 把**未归属**（无 projectId）的存量记录一并带回——
        // 缺省 false = 只见 projectId 相等者（老行为逐字不变）。
        if (filter?.projectId !== undefined && s.projectId !== filter.projectId) {
          const unattributed = !(typeof s.projectId === 'string' && s.projectId.length > 0)
          if (!(filter.includeUnattributed === true && unattributed)) return false
        }
        if (filter?.workspaceRoot !== undefined && s.workspaceRoot !== filter.workspaceRoot) return false
        if (filter?.sourceSessionId !== undefined && s.sourceSessionId !== filter.sourceSessionId) return false
        // 席位预筛（FR-3）：只看落盘的 seats，**不做**存量折算——折算唯一处是读端 `seatOfSummary`
        // （见 `RequirementFilter.seatWindowKey` 的注释：存储里再折一次就是第二套口径）。
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

  /** 同步投影：索引**已建**时给出本地视图；未建则空数组（退化为不注入引导，不影响正确性）。 */
  peekSummaries(): readonly RequirementSummary[] {
    return this.index === undefined ? [] : [...this.index.values()]
  }

  /** 排空写入器的串行队列后再读 head（见端口注释：不能直接用 `head()`）。 */
  async headAfterDrain(): Promise<LedgerHead> {
    await this.writer.drain()
    return this.head()
  }

  /**
   * 同步**窄投影**（dive 驱动的起轮判据读它）。
   *
   * 字段来源：`id/title/status/version/...` 取自**实时索引**；`description` / `dive` / `advance` /
   * `artifacts` / `tokenUsage` 取自 `factsCache`——该快照在**每次写提交的 notify 回调里同拍刷新**
   * （REQ-261004065652-5c1c FR-4），故对经本端口写入的变更满足**读己所写**。
   *
   * 缺失即按"无"处理：不伪造 `driverHealth=healthy`、不补 `tokenUsage` 零桶——**默认拒绝**方向，
   * 宁可不起轮也不要自旋（这条口径由 tests/store-projection-ryow.test.ts 锁死）。
   */
  peekFacts(): readonly RequirementFacts[] {
    if (this.index === undefined) return []
    return [...this.index.values()].map((s) => {
      const cached = this.factsCache?.get(s.id)
      return factsOf({
        ...s,
        description: cached?.description ?? '',
        ...(cached?.dive !== undefined ? { dive: cached.dive } : {}),
        ...(cached?.advance !== undefined ? { advance: cached.advance } : {}),
        // 形状注意：`factsOf` 吃的是**记录形状**（`tokenUsage.totals.…`），而 `factsCache` 存的是
        // 投影后的**扁平三标量**。少包这一层 `totals`，预算闸会永远读到"无消耗"（实测踩过）。
        ...(cached?.tokenUsage !== undefined ? { tokenUsage: { totals: cached.tokenUsage } } : {}),
        artifacts: cached?.artifacts ?? [],
      })
    })
  }

  async get(id: string): Promise<RequirementRecord | undefined> {
    const parts = await loadParts(this.repo, this.root, id, this.onWarn)
    return parts === undefined ? undefined : assembleRecord(parts)
  }

  async listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]> {
    const parts = await loadParts(this.repo, this.root, id, this.onWarn)
    if (parts === undefined) return []
    const since = opts?.since ?? 0
    const limit = opts?.limit ?? 200
    return parts.comments.filter((_, i) => i >= since).slice(0, limit)
  }

  async listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]> {
    const parts = await loadParts(this.repo, this.root, id, this.onWarn)
    if (parts === undefined) return []
    return opts?.limit === undefined ? parts.history : parts.history.slice(0, opts.limit)
  }

  /** 分诊记录：与 `head()` 同走 `readMeta`（triages 存在 meta.json，见 ShardMeta 注释）。 */
  async listTriages(filter?: { sessionId?: string }): Promise<readonly TriageRecord[]> {
    const meta = await this.repo.readMeta(this.root)
    const all = (meta?.triages ?? []) as readonly { sessionId?: unknown }[]
    if (filter?.sessionId === undefined) return all as never
    return all.filter((x) => x?.sessionId === filter.sessionId) as never
  }

  async head(): Promise<LedgerHead> {
    const meta = await this.repo.readMeta(this.root)
    return meta === undefined
      ? { revision: 0, schemaVersion: REQBOARD_SCHEMA_VERSION }
      : { revision: meta.revision, schemaVersion: meta.schemaVersion }
  }

  // ── 写：委托给写侧（t5）─────────────────────────────────────────────

  async create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord> {
    const created = await this.writer.create(input, actor)
    // 新建需求先进索引（否则首屏要等一次定点读才看得到它）
    // 新建时该需求一件产物都没登记 ⇒ 权威口径给"全 missing"（不是"读不到"）
    if (this.index !== undefined) this.index.set(created.id, boardSummaryOfAuthoritative(created))
    // 新建时整条记录在手 ⇒ 正文快照一并留下（否则该需求的提示词缝只能看到空正文）
    if (this.factsCache !== undefined) this.factsCache.set(created.id, factsOf(created))
    return created
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
    await this.writer.replaceAll(reason, next)
  }

  subscribe(fn: (change: RequirementChange) => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  /** 广播（订阅者错误不阻断写；与单册时代同口径）。 */
  private notify(kind: RequirementChange['kind'], id: string, summary: RequirementSummary, revision: number): void {
    // §7.2 修复（t8/B0b）：`revision` 由写路径给出**真实值**（此前是占位 0）。
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
