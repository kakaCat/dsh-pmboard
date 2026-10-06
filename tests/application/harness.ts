/**
 * L2 用例测试内存端口（REQ-47939a t6）——**v9 世界**（REQ-260927202051-f6df task-17）。
 *
 * ## v9 口径（与 t9 之前最大的差别）
 *
 * 1. **台账没有 `tasks` 键**：任务唯一存储 = 各需求 `docs/requirements/<REQ>/queue.json`
 *    （写方 = `QueueTaskStore`）。`InMemoryRepo` 因此只持 `requirements` / `triages`，
 *    `mutate` 的 change 通道**恒为两键**（两键恒为数组：`undefined` 补空数组）。
 * 2. **任务存取走真实 `QueueTaskStore`**（生产实现），底座是 `InMemoryQueueRepository`
 *    （内存 Map，**不落盘、不碰 fs**，保住 harness 原有的"用例测试不落盘"性质）。
 *
 * ## 为什么不再自带一份"内存 TaskStore"
 *
 * 曾经这里有一份手写 `InMemoryTaskStore`：它把 `mutate` / `createMany` / 派生视图
 * **又实现了一遍**。这类"第二实现"是静默分歧的温床——夹具里绿、线上却崩（或反之），
 * 而两边都不会报错。现在 `deps.taskStore` 就是**真的 `QueueTaskStore`**，
 * 校验、派生视图重算、`QUEUE_NOT_FOUND`、幂等跳过全部走生产代码；
 * 只有**文件 I/O 这一层**换成内存实现（`InMemoryQueueRepository` 实现 `QueueRepository`
 * 端口，`load`/`save` 复用真实 `validateQueueFile`）——与 `FakeDocs` 的做法同构。
 *
 * ## 为什么**不**做同步镜像 getter（Lead 裁定 D 系列）
 *
 * 曾考虑在 `InMemoryRepo` 上挂一个同步 `tasks` getter 以"零改动兼容"老调用方：
 * 收益是 19 个文件不用改，代价是把**已删除的 v8 语义永久留在夹具里**
 * （且 `ReqboardLedger` 已无 `tasks` 键，tsc 照样红）。这笔债比改 19 个文件贵，故不做。
 * 取而代之：`seedTasks` / `setTasks` / `addTasks` / `tasksOf` / `queueOf` 五个便捷方法。
 *
 * ## `makeHarness` 保持**同步**、签名向后兼容
 *
 * 31 个调用方的 `const h = makeHarness({...})` 一行都不用改：`seed.tasks` 现在**同步写入队列**
 * （构造合法 `QueueFile` 后直接落内存仓储；新 store 首访才读盘，因此不需要 await）。
 * 代价（**已写进这里的契约**）：`seedTasks` 必须在该需求**首次被读取之前**调用；
 * 若要在读过之后改任务，用 `await setTasks()` / `await addTasks()`（走真实写路径，缓存一致）。
 */
import type {
  AskAnswer,
  AskQuestion,
  DocEntry,
  DocRepository,
  ImportedLedger,
  MutateResult,
  MutationOutcome,
  NewComment,
  NewRequirement,
  RequirementChange,
  RequirementDraft,
  RequirementFilter,
  RequirementHistoryEntry,
  RequirementStore,
  RequirementSummaryPage,
  SweepResult,
  SessionProbe,
  UseCaseDeps,
  UserQuestionPort,
} from '../../src/application/ports.js'
// 值导入单独写：上面的导入块是 types-only，错误码表是运行时常量，混进去会让"仅类型"这条性质失真。
import { REQUIREMENT_STORE_ERROR } from '../../src/application/ports.js'
// t8 / 同源化：夹具的 `repo` 用**桥**架在 `store` 上，两个视图同一份真相。
// 用桥的 `seed` 缝**同步**就绪，故 `makeHarness` 仍是同步函数（145 处调用点不动）。
import { isColdStatus, isRequirementId } from '../../src/domain/requirement/ReqboardPaths.js'
// 冷侧写豁免（与生产实现**同源**，不写第二份判据）：domain/requirement/ColdWrite。
import { isColdWriteExempt } from '../../src/domain/requirement/ColdWrite.js'
import { factsOf, type RequirementFacts, type RequirementSummary } from '../../src/domain/requirement/RequirementSummary.js'
import { boardSummaryOfAuthoritative } from '../../src/shared/board-summary.js'
// 分页/排序助手与分片实现**同源**（REQ-261002161439-277d t4）：排序键是端口契约，
// 两处各写一份必然漂移，而漂移的症状是"分页偶尔跳页"，最难查。
import { compareSummaryOrder, decodeSummaryCursor, encodeSummaryCursor } from '../../src/repositories/shardPaging.js'
import { QUEUE_VERSION, type QueueFile, type QueueTask } from '../../src/domain/queue/QueueTypes.js'
import { computeEdges, computeLayers, computeReady } from '../../src/domain/queue/topology.js'
import { validateQueueFile } from '../../src/domain/queue/validateQueue.js'
import { QUEUE_ERROR, type QueueRepository, queueRelativePath } from '../../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../../src/repositories/QueueTaskStore.js'
import {
  REQBOARD_SCHEMA_VERSION,
  emptyBuckets,
  type ActorRef,
  type CommentRecord,
  type ReqboardLedger,
  type RequirementRecord,
  type TaskRecord,
  type TokenSnapshot,
  type ContextPressureSnapshot,
  type SessionLineageEntry,
} from '../../src/shared/protocol.js'

/** 队列文件的 schemaVersion（v9：台账已无 tasks）。 */
const QUEUE_SCHEMA_VERSION = 9

/** 队列文件落点（内存版；仅用于 `pathOf` 与错误信息，不产生真实文件）。 */
const IN_MEMORY_ROOT = '/in-memory-workspace'

/**
 * 由任务集构造**合法**队列文件：派生视图（edges/layers/ready）唯一来源 = `domain/queue/topology`，
 * 每个任务的 `layer` 按拓扑结果回填。**不在这里另写一份分层/就绪判断。**
 */
export function buildQueueFile(requirementId: string, tasks: readonly TaskRecord[], generatedAt = 0): QueueFile {
  const draft: QueueTask[] = tasks.map((t) => ({ ...structuredClone(t), layer: 0 }))
  const layers = computeLayers(draft)
  const layerOf = new Map<string, number>()
  for (const layer of layers) {
    for (const id of layer.tasks) if (!layerOf.has(id)) layerOf.set(id, layer.layer)
  }
  const withLayer: QueueTask[] = draft.map((t) => ({ ...t, layer: layerOf.get(t.id) ?? t.layer }))
  return {
    version: QUEUE_VERSION,
    requirement_id: requirementId,
    schemaVersion: QUEUE_SCHEMA_VERSION,
    generated_at: new Date(generatedAt).toISOString(),
    tasks: withLayer,
    edges: computeEdges(withLayer),
    layers: computeLayers(withLayer),
    ready: computeReady(withLayer),
  }
}

/**
 * 内存队列文件仓储（`QueueRepository` 端口的测试实现；不落盘、不碰 fs）。
 *
 * 与 `JsonQueueRepository` 的语义对齐点（差一处就会让用例测试与线上行为脱节）：
 * - `load`：不存在 → `undefined`；JSON 解析失败 → 告警 + 隔离（内存版没有 rename，隔离 = 移除）；V-1~V-6 不过 → 告警 + `undefined`；
 * - `save`：`requirement_id` 必须与写入目标一致；校验不过 → 抛 `QUEUE_VALIDATION_FAILED` 且**不写入**；
 * - `listRequirementIds` 返回**已排序**（`listAll` 的稳定顺序依赖它）。
 */
export class InMemoryQueueRepository implements QueueRepository {
  private readonly files = new Map<string, string>()
  private readonly writeSeq = new Map<string, number>()
  private readonly root: string
  /** 队列层告警（隔离 / 校验失败），供断言"确实告警了"。 */
  readonly warnings: string[] = []

  constructor(root = IN_MEMORY_ROOT) {
    this.root = root
  }

  pathOf(requirementId: string): string {
    return `${this.root}/docs/requirements/${requirementId}/queue.json`
  }

  relativePathOf(requirementId: string): string {
    return queueRelativePath(requirementId)
  }

  workspaceRoot(): string {
    return this.root
  }

  async listRequirementIds(): Promise<readonly string[]> {
    return [...this.files.keys()].sort()
  }

  async load(requirementId: string): Promise<QueueFile | undefined> {
    const raw = this.files.get(requirementId)
    if (raw === undefined) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      this.warnings.push(`[queue] 内存队列 JSON 解析失败，已隔离（移除）：${requirementId}（${(error as Error).message}）`)
      this.files.delete(requirementId)
      return undefined
    }
    const result = validateQueueFile(parsed as QueueFile)
    if (!result.passed) {
      this.warnings.push(
        `[queue] 内存队列未通过校验（按不可用处理）：${requirementId} —— ${result.issues
          .slice(0, 3)
          .map((i) => `${i.rule}@${i.path ?? '-'} ${i.message}`)
          .join(' | ')}`,
      )
      return undefined
    }
    return parsed as QueueFile
  }

  async save(requirementId: string, file: QueueFile): Promise<void> {
    if (file?.requirement_id !== requirementId) {
      throw Object.assign(
        new Error(`队列文件 requirement_id(${String(file?.requirement_id)}) 与写入目标需求(${requirementId}) 不一致，拒绝落盘`),
        { code: QUEUE_ERROR.VALIDATION_FAILED },
      )
    }
    const result = validateQueueFile(file)
    if (!result.passed) {
      throw Object.assign(
        new Error(`队列校验未通过（${result.issues.length} 条）：${result.issues.slice(0, 3).map((i) => `${i.rule}@${i.path ?? '-'}`).join(' | ')}`),
        { code: QUEUE_ERROR.VALIDATION_FAILED, issues: result.issues },
      )
    }
    this.files.set(requirementId, JSON.stringify(file, null, 2))
    this.bumpWriteSeq(requirementId)
  }

  /**
   * 测试专用：**同步**播种（原样写入，不做校验）。
   *
   * 存在的理由：`makeHarness` 必须保持同步（31 个调用方不改），而真实 `save` 与
   * `QueueTaskStore.createMany` 都是 async。校验由调用方（`seedGrouped`）先行完成。
   */
  seedSync(requirementId: string, file: QueueFile): void {
    this.files.set(requirementId, JSON.stringify(file, null, 2))
    this.bumpWriteSeq(requirementId)
  }

  private bumpWriteSeq(requirementId: string): void {
    this.writeSeq.set(requirementId, (this.writeSeq.get(requirementId) ?? 0) + 1)
  }

  /**
   * 测试专用：该需求的原始 JSON（诊断 / 断言"到底写没写"）。
   *
   * ⚠️ 口径（Lead 裁定，夹具必须保持可区分性）：
   * **「无队列」= 文件不存在**（`rawOf` → undefined）｜**「空队列」= 文件存在且 `tasks: []`**
   * （`rawOf` → JSON 文本）。两者在仓储层可区分（`load()` → undefined vs 对象），
   * 夹具不得用同一种表示把它们抹平——否则"写操作不隐式建档"这条验收就没法断言。
   */
  rawOf(requirementId: string): string | undefined {
    return this.files.get(requirementId)
  }

  /**
   * 该需求的**队列写入序号**（每次 `save` / `seedSync` 各 +1；从未写过 → 0）。
   *
   * 存在的理由（Lead 裁定 B-2）：台账 `revision` 在任务移出后退化成**恒真**判据
   * （terminal noop 本来就不写台账），拿它断言"重复调用幂等"会永远通过。
   * 队列写入序号是"这份队列文件被改写过几次"的直接计数：
   * **幂等重放不写盘 → 序号不变**，是真判据。
   */
  writeSeqOf(requirementId: string): number {
    return this.writeSeq.get(requirementId) ?? 0
  }
}

/** 台账种子（**只有台账自己的字段**；夹具的 `tasks` 播种在 `HarnessSeed` 里，二者刻意分开）。 */
export interface LedgerSeed {
  revision?: number
  requirements?: readonly RequirementRecord[]
  triages?: ReqboardLedger['triages']
}

/** v9 口径的内存台账仓储（结构上**没有** `tasks` 键）。 */
// B12 阶段⑤：`InMemoryRepo`（测试侧的旧单册端口实现）与 `HarnessRepo` 已无任何消费者，
// 随 src 的旧端口一起删除（harness 现在只有 `store` 一个真相源）。
// ---------------------------------------------------------------------------
// 需求存储内存替身（REQ-261002161439-277d · t2 / FR-1、FR-5）
//
// 与上面的 `InMemoryRepo`（单册台账）**并存**：t2 只立契约，t8 才做端口切换。
// 它是 `RequirementStore` 的**第一个**实现，也是「端口真的可替换」的第一份证据：
// 同一份契约测试（`tests/reqboard/store-contract.test.ts`）同时跑它和分片实现（t4 接入）。
//
// 口径刻意与生产实现对齐的地方：
//   * **version 由存储自增**（不靠调用点手工维护）——这是 FR-5 成立的前提；
//   * 冷侧（archived/done）**只读**：读写分离于此，`get` 能取回、写操作抛 COLD_IMMUTABLE；
//   * `undefined` 与 `{changed:false}` 都不落盘（幂等判据）；
//   * `listSummaries` 缺省 `scope='active'`（不含归档）——首屏载荷降量的关键。
//
// 只在替身里存在、**不属于端口契约**的东西：故障注入 `injectFault`。
// 它让契约测试能断言"损坏分片/IO 失败必须抛带该 code 的错误"这条**错误形状**契约
// （真实实现由真实故障触发，见 t4/t5）。
// ---------------------------------------------------------------------------

/** 构造带 code 的错误（与生产实现同构：`Object.assign(new Error(msg), { code })`）。 */
function codedError(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra })
}

export class InMemoryRequirementStore implements RequirementStore {
  /** 分诊记录：内存替身不建 triage 状态（现状 0 条，与分片存储一致）。 */
  async listTriages(): Promise<readonly never[]> { return [] }

  private readonly records = new Map<string, RequirementRecord>()

  /**
   * **同步读口（仅测试替身）**：给"契约上必须同步"的调用方用——
   * 生产实现的端口调用都是 async，但测试夹具里有几处（如 `facts: () => …`）是同步端口，
   * 不能 await（见设计 §78 第 ⑱ 条）。B12 阶段⑤ 起 harness 不再经桥镜像，改由这里直读。
   */
  peek(id: string): RequirementRecord | undefined { return this.records.get(id) }
  peekAll(): readonly RequirementRecord[] { return [...this.records.values()] }
  peekRevision(): number { return this.revision }
  /** 故障注入（仅测试替身）：id → 错误码。 */
  private readonly faults = new Map<string, string>()
  private readonly subscribers = new Set<(change: RequirementChange) => void>()
  private revision: number
  private readonly onWarn: (message: string) => void
  /** 时钟：与生产实现同口径**注入**（端口不提供时钟，时间由适配器构造时注入）。 */
  private readonly now: () => number

  constructor(
    seed?: { revision?: number; requirements?: readonly RequirementRecord[] },
    opts?: { onWarn?: (message: string) => void; now?: () => number },
  ) {
    this.revision = seed?.revision ?? 0
    this.onWarn = opts?.onWarn ?? (() => { /* 默认静默：测试要断言告警时自己注入收集器 */ })
    this.now = opts?.now ?? (() => Date.now())
    for (const r of seed?.requirements ?? []) this.records.set(r.id, structuredClone(r))
  }

  // ── 仅替身：故障注入（不属于端口契约）────────────────────────────────

  /** 让后续对该 id 的读写以指定错误码失败（默认 `REQBOARD_IO_FAILED`）。 */
  injectFault(id: string, code: string = REQUIREMENT_STORE_ERROR.IO_FAILED): void {
    this.faults.set(id, code)
  }

  clearFaults(): void {
    this.faults.clear()
  }

  /** 当前全部记录（测试断言用；生产端口**没有**这个入口）。 */
  all(): readonly RequirementRecord[] {
    return [...this.records.values()].map((r) => structuredClone(r))
  }

  // ── 读 ───────────────────────────────────────────────────────────────

  async get(id: string): Promise<RequirementRecord | undefined> {
    this.throwIfFaulted(id)
    const rec = this.records.get(id)
    return rec === undefined ? undefined : structuredClone(rec)
  }

  async getSummary(id: string): Promise<RequirementSummary | undefined> {
    this.throwIfFaulted(id)
    const rec = this.records.get(id)
    return rec === undefined ? undefined : boardSummaryOfAuthoritative(rec)
  }

  async listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage> {
    const offset = decodeSummaryCursor(filter?.cursor)
    if (offset === null) return { items: [] } // 越界/伪造游标 → 空页（不抛错，避免看板整页报错）
    const scope = filter?.scope ?? 'active'
    const matched = [...this.records.values()]
      .filter((r) => {
        if (scope === 'active' && isColdStatus(r.status)) return false
        if (scope === 'archived' && !isColdStatus(r.status)) return false
        if (filter?.ids !== undefined && !filter.ids.includes(r.id)) return false
        if (filter?.status !== undefined && !filter.status.includes(r.status)) return false
        // 项目筛（REQ-261005141830-7a3b FR-10）：与两个真实存储同口径——"这个项目下有哪些需求"。
        // t5（FR-8）：`includeUnattributed` 把未归属（无 projectId）的存量记录一并带回；缺省 false = 老行为。
        if (filter?.projectId !== undefined && r.projectId !== filter.projectId) {
          const unattributed = !(typeof r.projectId === 'string' && r.projectId.length > 0)
          if (!(filter.includeUnattributed === true && unattributed)) return false
        }
        if (filter?.workspaceRoot !== undefined && r.workspaceRoot !== filter.workspaceRoot) return false
        if (filter?.sourceSessionId !== undefined && r.sourceSessionId !== filter.sourceSessionId) return false
        // 席位预筛（FR-3）：与分片实现同口径——只看落盘 seats、不折算（折算唯一处在读端 seatOfSummary）。
        if (filter?.seatWindowKey !== undefined
          && !(r.seats ?? []).some((seat) => seat.windowKey === filter.seatWindowKey)) return false
        return true
      })
      .sort(compareSummaryOrder)
    const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 1000)
    const items = matched.slice(offset, offset + limit).map((r) => boardSummaryOfAuthoritative(r))
    const nextOffset = offset + items.length
    return nextOffset < matched.length ? { items, nextCursor: encodeSummaryCursor(nextOffset) } : { items }
  }

  /** 同步投影：本地缓存视图，**可能略旧**——只许用于提示词/引导组装。 */
  peekSummaries(): readonly RequirementSummary[] {
    return [...this.records.values()].filter((r) => !isColdStatus(r.status)).map((r) => boardSummaryOfAuthoritative(r))
  }

  /** 同步提示词窄投影（B12 阶段①-a）：同 `peekSummaries()` 的许可区，多带 `description`。 */
  peekFacts(): readonly RequirementFacts[] {
    return [...this.records.values()].filter((r) => !isColdStatus(r.status)).map(factsOf)
  }

  async listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]> {
    this.throwIfFaulted(id)
    const rec = this.records.get(id)
    if (rec === undefined) return [] // 读不存在 → 空数组（不是错误）
    const since = opts?.since ?? 0
    const limit = opts?.limit ?? 200
    return rec.comments.filter((_, i) => i >= since).slice(0, limit).map((c) => structuredClone(c))
  }

  async listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]> {
    this.throwIfFaulted(id)
    const rec = this.records.get(id)
    if (rec === undefined) return []
    const out: RequirementHistoryEntry[] = []
    for (const e of rec.statusHistory ?? []) out.push({ kind: 'status', event: structuredClone(e) })
    for (const a of rec.advance?.history ?? []) out.push({ kind: 'advance', record: structuredClone(a) })
    return opts?.limit === undefined ? out : out.slice(0, opts.limit)
  }

  /** 内存替身没有写队列 ⇒ 排空是恒等（语义等价于 head()）。 */
  async headAfterDrain(): Promise<{ revision: number; schemaVersion: number }> {
    return this.head()
  }

  async head(): Promise<{ revision: number; schemaVersion: number }> {
    return { revision: this.revision, schemaVersion: REQBOARD_SCHEMA_VERSION }
  }

  // ── 写 ───────────────────────────────────────────────────────────────

  async create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord> {
    if (!isRequirementId(input.id)) {
      throw codedError(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, `需求 id 形态非法：${JSON.stringify(input.id)}`)
    }
    if (input.title.trim().length === 0) {
      throw codedError(REQUIREMENT_STORE_ERROR.VALIDATION_FAILED, '需求标题不能为空')
    }
    if (this.records.has(input.id)) {
      throw codedError(REQUIREMENT_STORE_ERROR.ALREADY_EXISTS, `需求 ${input.id} 已存在（create 不覆盖）`, { requirementId: input.id })
    }
    const now = this.now()
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
      // 项目身份（REQ-261005141830-7a3b FR-1）：替身必须与两个真实存储同源，否则"按项目筛"的用例
      // 会在替身上假装通过（本仓教训：替身不同源 = 用例空过）。
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
      ...(input.sourceSessionId !== undefined ? { sourceSessionId: input.sourceSessionId } : {}),
    }
    this.records.set(record.id, record)
    this.revision += 1
    this.emit('requirement-created', record.id)
    return structuredClone(record)
  }

  async mutate(id: string, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    return this.applyMutation(id, undefined, fn)
  }

  async mutateIf(id: string, expectedVersion: number, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult> {
    return this.applyMutation(id, expectedVersion, fn)
  }

  async appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }> {
    // 一次写 = **一条**变更通知，kind 说明这次是什么（不能既发 updated 又发 comment-added：
    // 订阅者会按两次刷新处理同一次落盘）。故这里把 kind 交给 applyMutation 代发。
    const result = await this.applyMutation(
      id,
      undefined,
      (draft) => {
        draft.comments.push(structuredClone(comment) as CommentRecord)
        return { changed: true }
      },
      'comment-added',
    )
    return { version: result.version, commentCount: result.requirement.comments.length }
  }

  /**
   * 启动对账专用：只扫**热侧**（非冷侧）需求——冷侧只读，对账不该碰它。
   *
   * 回调返回的 id 若不在扫描集里（冷侧/不存在），**忽略并告警**而不是抛错：
   * 对账是幂等的批处理，一个越界 id 不该让整轮失败（但也不能静默，故留告警）。
   */
  async sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult> {
    void reason
    const hot = [...this.records.values()].filter((r) => !isColdStatus(r.status)).sort(compareSummaryOrder)
    const drafts = hot.map((r) => structuredClone(r) as RequirementDraft)
    const byId = new Map(drafts.map((d) => [d.id, d]))
    const touched: string[] = []
    for (const id of fn(drafts)) {
      const draft = byId.get(id)
      if (draft === undefined) {
        this.onWarn(`sweep 返回了不在扫描集里的需求 id（已忽略）：${id}`)
        continue
      }
      const next = { ...draft, version: (this.records.get(id)?.version ?? 0) + 1 } as RequirementRecord
      this.records.set(id, next)
      touched.push(id)
    }
    if (touched.length === 0) return { touched: [], revision: this.revision }
    this.revision += 1
    for (const id of touched) this.emit('requirement-updated', id)
    return { touched, revision: this.revision }
  }

  async replaceAll(_reason: string, next: ImportedLedger): Promise<void> {
    this.records.clear()
    for (const r of next.requirements) this.records.set(r.id, structuredClone(r))
    this.revision = next.revision
    for (const r of next.requirements) this.emit('ledger-replaced', r.id)
  }

  subscribe(fn: (change: RequirementChange) => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  // ── 内部 ─────────────────────────────────────────────────────────────

  private throwIfFaulted(id: string): void {
    const code = this.faults.get(id)
    if (code === undefined) return
    throw codedError(code, `注入故障：需求 ${id} 的存储操作失败（${code}）`, { requirementId: id })
  }

  private async applyMutation(
    id: string,
    expectedVersion: number | undefined,
    fn: (draft: RequirementDraft) => MutationOutcome | undefined,
    /** 广播的 kind；缺省按"状态有没有变"自动判（updated / moved）。 */
    kindOverride?: RequirementChange['kind'],
  ): Promise<MutateResult> {
    this.throwIfFaulted(id)
    const current = this.records.get(id)
    if (current === undefined) {
      throw codedError(REQUIREMENT_STORE_ERROR.NOT_FOUND, `需求 ${id} 不存在（写操作不隐式建档）`, { requirementId: id })
    }
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw codedError(
        REQUIREMENT_STORE_ERROR.CONFLICT,
        `需求 ${id} 版本不匹配：期望 ${expectedVersion}，当前 ${current.version}`,
        { requirementId: id, currentVersion: current.version },
      )
    }
    const draft = structuredClone(current) as RequirementDraft
    const outcome = fn(draft)
    // 冷侧只读的**唯一豁免**：归档材料（人工裁定 2026-10-02，见 notes/t8-progress.md §14.2）。
    // 与生产实现**同源**（共用 `domain/requirement/ColdWrite`），检查同样放在 `fn` 之后。
    if (isColdStatus(current.status)
      && !isColdWriteExempt(current as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>)) {
      throw codedError(REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE, `需求 ${id} 已归档（${current.status}），冷侧只读`, { requirementId: id })
    }
    if (outcome === undefined || outcome.changed === false) {
      // 无变更：不落盘、不 bump、不广播（"幂等"的可观测形式 = 版本与全局序都不动）
      return { requirement: structuredClone(current), version: current.version, revision: this.revision, changed: false }
    }
    // version 由**存储**自增（不靠调用点手工维护）；updatedAt 归变更器所有，存储不代改。
    const next = { ...draft, version: current.version + 1 } as RequirementRecord
    this.records.set(id, next)
    this.revision += 1
    this.emit(kindOverride ?? (current.status === next.status ? 'requirement-updated' : 'requirement-moved'), id)
    return { requirement: structuredClone(next), version: next.version, revision: this.revision, changed: true }
  }

  private emit(kind: RequirementChange['kind'], id: string): void {
    const rec = this.records.get(id)
    if (rec === undefined) return
    const change: RequirementChange = { kind, requirementId: id, revision: this.revision, summary: boardSummaryOfAuthoritative(rec) }
    for (const fn of this.subscribers) {
      try {
        fn(change)
      } catch (err) {
        this.onWarn(`需求存储订阅者抛错（已忽略，不阻断写）：${(err as Error).message}`)
      }
    }
  }
}

export class FakeDocs implements DocRepository {
  files = new Map<string, { content: string; mtimeMs: number }>()
  private now: () => number
  constructor(now: () => number = () => 0) { this.now = now }
  put(relPath: string, content = 'x', mtimeMs?: number): void {
    this.files.set(relPath, { content, mtimeMs: mtimeMs ?? this.now() })
  }
  exists(relPath: string): boolean { return this.files.has(relPath) }
  async read(relPath: string): Promise<string> { return this.files.get(relPath)?.content ?? '' }
  async write(relPath: string, content: string): Promise<void> { this.files.set(relPath, { content, mtimeMs: this.now() }) }
  list(relDir: string): readonly DocEntry[] {
    const prefix = relDir.length > 0 ? relDir.replace(/\/+$/, '') + '/' : ''
    const seen = new Set<string>()
    const out: DocEntry[] = []
    for (const [p, v] of this.files) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      const name = rest.split('/')[0]!
      if (seen.has(name)) continue
      seen.add(name)
      const isFile = !rest.includes('/')
      out.push({ name, isFile, mtimeMs: v.mtimeMs, size: v.content.length })
    }
    return out
  }
  resolve(relPath: string): string { return relPath }
  workspaceRoot(): string { return '.' }
  stat(relPath: string): { mtimeMs: number; size: number } | undefined {
    const f = this.files.get(relPath)
    return f === undefined ? undefined : { mtimeMs: f.mtimeMs, size: f.content.length }
  }
}

export class FixedClock {
  t: number
  constructor(t = 1_000_000) { this.t = t }
  now(): number { return this.t }
}

export class SeqIds {
  private n = 0
  private next(prefix: string): string {
    this.n += 1
    return prefix + this.n.toString(16).padStart(6, '0')
  }
  requirement(): string { return this.next('REQ-') }
  task(): string { return this.next('t-') }
  execution(): string { return this.next('e-') }
  comment(): string { return this.next('c-') }
}

export class FakeSession implements SessionProbe {
  window = 'session-w-001'
  activity = 5
  recentMatch: { ok: boolean; matchedText?: string; reason?: string } | undefined = undefined
  windowKey(exec: unknown): string {
    const id = (exec as { agent?: { id?: unknown } } | undefined)?.agent?.id
    return typeof id === 'string' ? id : this.window
  }
  requireLiveDriver(_exec: unknown): void { /* 放行 */ }
  requireDirectHuman(_exec: unknown): void { /* 放行 */ }
  toolActivitySince(_windowKey: string, _since: number): number { return this.activity }
  /** 默认不可得（测试按需覆盖）；用例可注入具体快照。 */
  tokenSnapshot: TokenSnapshot = { at: 0, totals: emptyBuckets(), source: 'unavailable' }
  tokenTotals(_windowKey: string): TokenSnapshot { return this.tokenSnapshot }
  /** REQ-261004154937-2ca3：默认「血缘不可得」（等价于只算自身的旧行为）；用例按需覆盖。 */
  lineage: readonly SessionLineageEntry[] | undefined = undefined
  async descendantSessions(_windowKey: string): Promise<readonly SessionLineageEntry[] | undefined> {
    return this.lineage
  }
  /** 默认不可得（缺省即"取不到"）；用例按需注入具体读数。 */
  contextPressureSnapshot: ContextPressureSnapshot = { at: 0, source: 'unavailable' }
  contextPressure(_windowKey: string): ContextPressureSnapshot { return this.contextPressureSnapshot }
  matchesRecentUserMessage(): { ok: boolean; matchedText?: string; reason?: string } | undefined {
    return this.recentMatch
  }
}

export class FakeQuestions implements UserQuestionPort {
  availableFlag = true
  answers: AskAnswer[] = []
  asked: AskQuestion[] = []
  available(): boolean { return this.availableFlag }
  async ask(questions: readonly AskQuestion[]): Promise<readonly AskAnswer[]> {
    this.asked = [...questions]
    return this.answers
  }
}

/**
 * `makeHarness` 的播种入参——**夹具自己的类型**，刻意**不**复用 `Partial<ReqboardLedger>`。
 *
 * 理由（Lead 裁决）：台账去 `tasks` 是**存储层**的事，不该顺带取消夹具的播种能力；
 * 复用台账类型会让 `tasks` 这个键在类型上直接报错（excess property），
 * 于是 11 处 `makeHarness({ requirements, tasks: [...] })` 全得改写——既白干又容易漏。
 * 这里显式声明 `tasks`：**签名对调用方保持兼容**，语义上它现在落**队列**而非台账。
 */
export interface HarnessSeed extends LedgerSeed {
  /**
   * 任务卡：**直接落队列**（v9 台账没有任务通道）。
   * 按 `task.requirementId` 分组，各写一份对应需求的 queue.json（跨需求播种因此天然正确）。
   */
  tasks?: readonly TaskRecord[]
}

export interface Harness {
  /**
   * 新存储端口（t8/B0b）：与 `repo` **同一份真相**（`repo` 就是它的桥）。
   * 供 `deps.store` 与迁移后的读点使用。
   */
  store: InMemoryRequirementStore
  /** 内存队列仓储（任务落点；`seedSync` / `rawOf` 是测试专用同步口）。 */
  queueRepo: InMemoryQueueRepository
  /** **真实** `QueueTaskStore`（生产实现，底座 = `queueRepo`）。`deps.taskStore` 就是它。 */
  taskStore: QueueTaskStore
  docs: FakeDocs
  clock: FixedClock
  ids: SeqIds
  session: FakeSession
  questions: FakeQuestions
  deps: UseCaseDeps
  /** 当前台账视图（按需从 store 现搭；任务不在其中——v9 台账无 tasks）。 */
  readonly ledger: ReqboardLedger
  /**
   * 同步播种任务（**须在该需求首次被读取之前**调用）。
   * 按 `task.requirementId` 分组；不合法（V-1~V-6）**立刻抛错**，不留半份脏夹具。
   */
  seedTasks(requirementId: string, tasks: readonly TaskRecord[]): readonly TaskRecord[]
  /**
   * 播种一条需求（t8/B11）：**同时**写存储与镜像。
   *
   * 为什么必须有它：读点搬到新端口后，`h.seedRequirementSync(rec)` 这类**就地播种**
   * 只改镜像、存储里没有 ⇒ `store.get(id)` 取不到（旧行为是从整册镜像里读得到）。
   * 实现上不能只 `create`——新端口的 `create` 只认**标量**字段，`artifacts` / `plan` /
   * `statusHistory` 等大字段要靠随后的一次差异写补齐（否则会被**静默丢字段**）。
   */
  seedRequirement(rec: RequirementRecord): Promise<void>
  /**
   * **同步**播种入口（镜像立刻落，存储写入排队）。给"播种写在同步 helper 里"的既有夹具用：
   * 它们不能 `await`，换成 async 版本会直接让该文件收集失败（第 12 回合实测）。
   * ⚠️ 用它的测试若随后要**经新端口读**，必须在读之前 `await h.seedSettled()`。
   */
  seedRequirementSync(rec: RequirementRecord): void
  /** 等所有排队中的播种写完（配 `seedRequirementSync` 用）。 */
  seedSettled(): Promise<void>
  /** 异步整份替换某需求的任务（走真实写路径：`createMany` 建档 / `mutate` 覆盖；缓存一致）。 */
  setTasks(requirementId: string, tasks: readonly TaskRecord[]): Promise<readonly TaskRecord[]>
  /** 异步追加任务（幂等：已存在 id 跳过）。 */
  addTasks(requirementId: string, tasks: readonly TaskRecord[]): Promise<readonly TaskRecord[]>
  /** 读取某需求的任务（已剥 `layer`）。 */
  tasksOf(requirementId: string): Promise<readonly TaskRecord[]>
  /** 读取某需求的队列文件全量（DAG 视图，**含** layer）。 */
  queueOf(requirementId: string): Promise<QueueFile | undefined>
  /**
   * 改一张卡的字段（**最常用**：把散落在测试里的一堆「从台账取任务数组再就地改字段」收成一行）。
   *
   * **async**（走真实 `QueueTaskStore.mutate`：重算派生视图 → 校验 → 写盘）。
   * `fn` 收到**草稿副本**（含 `layer`），可以原地改后返回 `void`，也可以返回新对象。
   * 任务不存在 → 抛 `TASK_NOT_FOUND`（不静默）；改完不合法（V-1~V-6）→ 抛 `QUEUE_VALIDATION_FAILED` 且不落盘。
   */
  mutateTask(taskId: string, fn: (task: QueueTask) => QueueTask | void): Promise<readonly TaskRecord[]>
  /** `mutateTask` 的补丁式糖：`await h.setTaskFields('t-s', { status: 'done' })`（async，同口径）。 */
  setTaskFields(taskId: string, patch: Partial<TaskRecord>): Promise<readonly TaskRecord[]>
  /** 需求字段的补丁式糖（与 setTaskFields 同口径）；t8/B11：就地改镜像不再影响新端口读。 */
  setRequirementFields(id: string, patch: Partial<RequirementRecord>): Promise<void>
  /**
   * 队列**写入序号**（幂等重放判据，替代恒真的台账 revision）：
   * 每次真正写盘 +1；幂等 noop 不写盘 → 数值不变。从没写过 → 0。
   */
  queueRevisionOf(requirementId: string): number
  /**
   * 队列**文件是否存在**（失败路径用这个，**不要**用 `readQueue() === undefined`：
   * 后者把"文件不存在"与"文件存在但校验不过"混为一谈）。
   */
  queueExists(requirementId: string): boolean
}

/**
 * 同步播种：按任务自述的 `requirementId` 分组 → 构造合法 `QueueFile` → 校验 → 写内存仓储。
 *
 * 为什么要**校验并抛错**：不合法夹具如果静默写进去，`QueueTaskStore.load` 会按"校验不过 = 不可用"
 * 返回 undefined，症状是"任务凭空消失"——排查成本极高。在播种点响亮失败，
 * 报错里直接给 `V-x@path`，一眼知道夹具哪里不合法。
 */
function seedGrouped(queueRepo: InMemoryQueueRepository, requirementId: string, tasks: readonly TaskRecord[]): readonly TaskRecord[] {
  // 空任务集 = 显式建一份**空队列**（文件存在、tasks 为 []）。
  // 这与「无队列」（文件根本不存在）是两件事——Lead 裁定的口径约定，夹具必须能表达后者为"不调用本方法"。
  if (tasks.length === 0) {
    if (requirementId.length === 0) throw new Error('夹具 seedTasks：空任务集时必须给出 requirementId（否则不知道给谁建空队列）')
    queueRepo.seedSync(requirementId, buildQueueFile(requirementId, []))
    return tasks
  }
  const groups = new Map<string, TaskRecord[]>()
  for (const t of tasks) {
    const owner = typeof t.requirementId === 'string' && t.requirementId.length > 0 ? t.requirementId : requirementId
    const arr = groups.get(owner)
    if (arr === undefined) groups.set(owner, [t])
    else arr.push(t)
  }
  for (const [owner, list] of groups) {
    const file = buildQueueFile(owner, list)
    const result = validateQueueFile(file)
    if (!result.passed) {
      throw Object.assign(
        new Error(
          `夹具任务播种失败：需求 ${owner} 的任务集不是合法 v9 队列 —— ${result.issues
            .slice(0, 4)
            .map((i) => `${i.rule}@${i.path ?? '-'} ${i.message}`)
            .join(' | ')}`,
        ),
        { code: QUEUE_ERROR.VALIDATION_FAILED, issues: result.issues },
      )
    }
    queueRepo.seedSync(owner, file)
  }
  return tasks
}

/**
 * 统一测试工厂：新存储替身（t8/B0b）。
 *
 * 这是 B11 的收口点——原先 40 余处自持单册夹具都已改用它，
 * 于是"测试里到底有几个存储实现"只剩一个答案。
 */
export function makeTestStore(seed?: LedgerSeed): InMemoryRequirementStore {
  return new InMemoryRequirementStore(seed)
}

/**
 * **同源化（t8）**：`repo` 与 `store` 现在是**同一份真相**——`repo` 就是桥，架在 `store` 上。
 *
 * 三次实测的收敛过程（写给后人，省三轮试错）：
 *  - 直接翻桥：**63 条转红**。主因 54 处 = 测试**就地播种**（旧写法 `h.repo.ledger.requirements.push(...)`，已迁走）
 *    只改镜像、进不了 store，随后经桥写便 `REQBOARD_NOT_FOUND`。
 *    → 修：桥补「镜像里有、存储没有 → **补建档**」的旧端口语义（`applyDiffOrRecreate`）。
 *  - 再翻：**25 条**。主因 17 处 = 测试用了不合规 id，被新存储 `create` 的 id 形态校验正当拒绝
 *    → 修：改那 7 个常量（行为中性）。
 *  - 再翻：**2 条**。① 冷侧只读 vs 归档材料写入（**真实设计冲突**，已裁定「冷侧豁免归档材料」并落地
 *    `domain/requirement/ColdWrite`）；② 镜像落后于存储（直写 `store` 后桥读到旧值）
 *    → 修：**本函数下面挂 `attachSubscription()`**。
 */
export function makeHarness(seed?: HarnessSeed): Harness {
  const clock = new FixedClock()
  const docs = new FakeDocs(() => clock.t)
  const store = makeTestStore(seed)
  const session = new FakeSession()
  const questions = new FakeQuestions()
  const ids = new SeqIds()
  const queueRepo = new InMemoryQueueRepository()
  const taskStore = new QueueTaskStore({ repo: queueRepo, now: () => clock.t, onWarn: (m) => queueRepo.warnings.push(m) })
  const deps: UseCaseDeps = { store, docs, clock, ids, session, questions, taskStore, doneThrottleMs: 0 }

  // ── 播种（t8/B11）：镜像与存储**都要写**；提供同步入口 + 显式 flush ──────────────
  // 为什么要有同步入口：既有夹具的播种写在**同步 helper**（`makeUc` / `seed`）里，直接换成 async
  // 会连带改一片调用点，且 `await` 落进非 async 函数会直接让该文件**收集失败**（第 12 回合实测）。
  // 纪律：同步入口只把写**排队**；需要确定性的测试显式 `await h.seedSettled()`——
  // **不靠**"fire-and-forget 迟早会好"（那是本仓禁止的静默不确定性）。
  let seedQueue: Promise<unknown> = Promise.resolve()
  const writeSeedToStore = async (rec: RequirementRecord): Promise<void> => {
    // 冷侧（archived/done）**只读** ⇒ 差异写会被冷写守卫拒（豁免键不含 plan/statusHistory 等）。
    // 播种本就是“整份造数据”，故冷侧改走 replaceAll（宽口）；`ImportedLedger` 就是 ReqboardLedger，
    // 而夹具手里正好有这份 ledger（镜像），不必另造结构。
    if (isColdStatus(rec.status)) {
      // B12 阶段⑤：不再有桥镜像 ⇒ 册形视图从 store 的同步读口现搭（同一份真相）
      const rest = store.peekAll().filter((r) => r.id !== rec.id)
      await store.replaceAll('seed-cold', {
        revision: store.peekRevision(), requirements: [...rest, structuredClone(rec)], triages: [], tasks: [],
      } as unknown as ReqboardLedger)
      return
    }
    if ((await store.get(rec.id)) === undefined) {
      await store.create({
        id: rec.id,
        title: rec.title,
        ...(rec.description !== undefined ? { description: rec.description } : {}),
        ...(rec.category !== undefined ? { category: rec.category } : {}),
        ...(rec.status !== undefined ? { status: rec.status } : {}),
        ...(rec.sourceSessionId !== undefined ? { sourceSessionId: rec.sourceSessionId } : {}),
        ...(rec.workspaceRoot !== undefined ? { workspaceRoot: rec.workspaceRoot } : {}),
        ...(rec.docBasePath !== undefined ? { docBasePath: rec.docBasePath } : {}),
        ...(rec.promptDifficulty !== undefined ? { promptDifficulty: rec.promptDifficulty } : {}),
      }, { kind: 'agent' })
    }
    const fields = { ...(rec as unknown as Record<string, unknown>) }
    delete fields.version
    await store.mutate(rec.id, (draft) => {
      Object.assign(draft, structuredClone(fields))
      return { changed: true }
    })
  }

  const harness: Harness = { store: store,

    queueRepo,
    taskStore,
    docs,
    clock,
    ids,
    session,
    questions,
    deps,
    // B12 阶段⑤：`ledger` 不再是桥镜像，而是**按需从 store 现搭**的册形视图（同一份真相）。
    // 仍有 4 处 sync 端口回调读它（见设计 §78 第 ⑱ 条）；它们要的是"此刻的值"，故现搭即可。
    get ledger(): ReqboardLedger {
      return {
        revision: store.peekRevision(), schemaVersion: 9,
        requirements: [...store.peekAll()], triages: [],
      } as unknown as ReqboardLedger
    },
    seedTasks(requirementId, tasks) { return seedGrouped(queueRepo, requirementId, tasks) },
    async seedRequirement(rec) { await writeSeedToStore(rec) },
    seedRequirementSync(rec) { seedQueue = seedQueue.then(() => writeSeedToStore(rec)) },
    async seedSettled() { await seedQueue },
    async setTasks(requirementId, tasks) {
      if (queueRepo.rawOf(requirementId) === undefined) return taskStore.createMany(requirementId, tasks)
      return taskStore.mutate(requirementId, () => tasks.map((t) => ({ ...structuredClone(t), layer: 0 })))
    },
    addTasks(requirementId, tasks) { return taskStore.createMany(requirementId, tasks) },
    tasksOf(requirementId) { return taskStore.listByRequirement(requirementId) },
    queueOf(requirementId) { return taskStore.readQueue(requirementId) },
    async mutateTask(taskId, fn) {
      const target = await taskStore.get(taskId)
      if (target === undefined) {
        throw Object.assign(new Error(`夹具 mutateTask：任务 ${taskId} 不在任何队列里`), { code: 'TASK_NOT_FOUND' })
      }
      return taskStore.mutate(target.requirementId, (tasks) =>
        tasks.map((t) => {
          if (t.id !== taskId) return t
          const draft = structuredClone(t)
          const out = fn(draft)
          return out === undefined ? draft : out
        }),
      )
    },
    async setRequirementFields(id, patch) {
      const fields = { ...(patch as Record<string, unknown>) }
      delete fields.version
      await store.mutate(id, (draft) => { Object.assign(draft, structuredClone(fields)); return { changed: true } })
    },
    setTaskFields(taskId, patch) {
      return harness.mutateTask(taskId, (t) => { Object.assign(t, patch) })
    },
    queueRevisionOf(requirementId) { return queueRepo.writeSeqOf(requirementId) },
    queueExists(requirementId) { return queueRepo.rawOf(requirementId) !== undefined },
  }

  if (seed?.tasks !== undefined && seed.tasks.length > 0) seedGrouped(queueRepo, seed.requirements?.[0]?.id ?? '', seed.tasks)
  return harness
}

/** 最小需求记录（字段对齐 protocol.RequirementRecord）。 */
export function req(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-000001',
    title: '需求',
    description: 'd',
    category: 'feature',
    status: 'draft',
    blocked: false,
    sourceSessionId: 'session-w-001',
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...over,
  }
}

/** 最小任务记录。 */
export function task(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-000001',
    requirementId: 'REQ-000001',
    title: '任务',
    description: 'd',
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: '跑测试看到绿',
    implementation: '改 x.ts',
    context: '',
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: 'session-w-001' },
    updatedBy: { kind: 'agent', sessionId: 'session-w-001' },
    statusHistory: [],
    ...over,
  }
}
