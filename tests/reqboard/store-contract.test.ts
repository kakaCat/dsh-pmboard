/**
 * L2 契约测试 · 需求存储端口 `RequirementStore`（REQ-261002161439-277d · t2 立契约、t4 接入分片实现）。
 *
 * ## 这份测试为什么长这样
 *
 * 它是「端口真的可替换」的**唯一硬证据**：同一份断言跑遍所有实现。t2 只有内存替身，
 * t4 接进 `ShardedRequirementStore`（读侧），t11 已接入假 SQL 替身（t-07b058），将来的 DB 适配器也照这份入场。
 * 断言只写**端口契约里承诺的东西**，不碰任何实现的内部结构。
 *
 * ## 两套件 + 显式注册表（t4 起）
 *
 * 分片实现的**写侧是 t5 的卡**，所以本文件把契约拆成 `read` 与 `write` 两套件，
 * 每个实现如实声明自己当前能跑哪些：
 *
 * | 实现 | read | write |
 * |------|------|-------|
 * | `InMemoryRequirementStore` | ✅ | ✅ |
 * | `ShardedRequirementStore` | ✅ | ⏳ t5 落地后翻转 |
 *
 * **未覆盖的套件在注册表里写明**（不是悄悄跳过）：文末「注册表自检」会把它列出来，
 * t5 落地后必须把那一行改成 `['read', 'write']`——否则自检会红。
 */
import { afterAll, describe, it, expect } from 'vitest'
import { InMemoryRequirementStore } from '../application/harness.js'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
// t4：SQLite 实现的夹具独立成模块（临时目录登记 + 用完统一清理，见该文件头注）
import { disposeSqliteHarnesses, makeSqliteHarness } from './sqlite-harness.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import {
  REQUIREMENT_STORE_ERROR,
  type LedgerHead,
  type MutateResult,
  type RequirementFilter,
  type RequirementHistoryEntry,
  type RequirementStore,
  type RequirementSummaryPage,
  type SweepResult,
} from '../../src/application/ports.js'
import { BIG_FIELD_KEYS } from '../../src/domain/requirement/RequirementSummary.js'
import { factsOf, summarize, type RequirementFacts, type RequirementSummary } from '../../src/domain/requirement/RequirementSummary.js'
import { isColdStatus } from '../../src/domain/requirement/ReqboardPaths.js'
import { compareSummaryOrder, decodeSummaryCursor, encodeSummaryCursor } from '../../src/repositories/shardPaging.js'
import type { CommentRecord, RequirementRecord } from '../../src/shared/protocol.js'

// ---------------------------------------------------------------------------
// 契约测试骨架：新增实现 = 往 IMPLEMENTATIONS 里加一行
// ---------------------------------------------------------------------------

interface ContractHarness {
  readonly store: RequirementStore
  /** 仅内存替身具备；不具备的实现返回 undefined → 依赖它的用例显式说明并跳过。 */
  injectFault?: (id: string, code: string) => void
}

/** 造一个实现（可异步：分片实现要把种子写成分片）。 */
type ContractFactory = (seed: readonly RequirementRecord[]) => ContractHarness | Promise<ContractHarness>

/** 契约套件：读（t2 起）、写（t2 起；分片实现 t5 补）。 */
type ContractSuite = 'read' | 'write'


/**
 * 只读「假 SQL 形状」替身（t-07b058 验收⑥）。
 *
 * 为什么要有第三个实现：契约测试是"端口真的可替换、不泄漏存储细节"的**唯一硬证据**——
 * 只有两个实现时，断言可能无意间依赖了那两者共有的实现细节。本替身把记录放进一张
 * **行表**（SQL 形状：行 = 记录、读只经端口方法暴露），用来证明将来的 DB 适配器可直接照这份入场。
 *
 * 只读：`suites` 只声明 `read`；写方法一律抛（读套件不会调它们）。
 * 投影一律走 domain 的 `summarize`/`factsOf`，游标一律走仓储层同一对 encode/decode
 * ——**绝不自己手写字段拷贝**，否则第三个实现很快会与另两个口径漂移。
 */
class FakeSqlReadOnlyStore implements RequirementStore {
  /** "行表"：SQL 风格的行集合（读只经方法暴露，不把本数组交出去）。 */
  private rows: RequirementRecord[]
  private revision: number

  constructor(seed: readonly RequirementRecord[] = []) {
    this.rows = seed.map((r) => structuredClone(r))
    this.revision = 1
  }

  private row(id: string): RequirementRecord | undefined {
    const found = this.rows.find((r) => r.id === id)
    return found === undefined ? undefined : structuredClone(found)
  }

  async get(id: string): Promise<RequirementRecord | undefined> { return this.row(id) }
  async getSummary(id: string): Promise<RequirementSummary | undefined> {
    const rec = this.rows.find((r) => r.id === id)
    return rec === undefined ? undefined : summarize(rec)
  }

  async listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage> {
    const offset = decodeSummaryCursor(filter?.cursor)
    if (offset === null) return { items: [] }
    const scope = filter?.scope ?? 'active'
    const matched = this.rows
      .filter((r) => {
        if (scope === 'active' && isColdStatus(r.status)) return false
        if (scope === 'archived' && !isColdStatus(r.status)) return false
        if (filter?.ids !== undefined && !filter.ids.includes(r.id)) return false
        if (filter?.status !== undefined && !filter.status.includes(r.status)) return false
        if (filter?.workspaceRoot !== undefined && r.workspaceRoot !== filter.workspaceRoot) return false
        if (filter?.sourceSessionId !== undefined && r.sourceSessionId !== filter.sourceSessionId) return false
        return true
      })
      .sort(compareSummaryOrder)
    const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 1000)
    const items = matched.slice(offset, offset + limit).map(summarize)
    const nextOffset = offset + items.length
    return nextOffset < matched.length ? { items, nextCursor: encodeSummaryCursor(nextOffset) } : { items }
  }

  peekSummaries(): readonly RequirementSummary[] {
    return this.rows.filter((r) => !isColdStatus(r.status)).map(summarize)
  }

  peekFacts(): readonly RequirementFacts[] {
    return this.rows.filter((r) => !isColdStatus(r.status)).map(factsOf)
  }

  async listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]> {
    const rec = this.rows.find((r) => r.id === id)
    if (rec === undefined) return []
    const since = opts?.since ?? 0
    const limit = opts?.limit ?? 200
    return rec.comments.filter((_, i) => i >= since).slice(0, limit).map((c) => structuredClone(c))
  }

  async listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]> {
    const rec = this.rows.find((r) => r.id === id)
    if (rec === undefined) return []
    // 与内存替身同口径：状态流转与推进历史合成一条有序流水（条目形态 kind: 'status' | 'advance'）
    const out: RequirementHistoryEntry[] = []
    for (const e of rec.statusHistory ?? []) out.push({ kind: 'status', event: structuredClone(e) })
    for (const a of rec.advance?.history ?? []) out.push({ kind: 'advance', record: structuredClone(a) })
    return opts?.limit === undefined ? out : out.slice(0, opts.limit)
  }

  /** 分诊记录：只读替身不建 triage 状态（与内存替身、分片实现一致：现状 0 条）。 */
  async listTriages(): Promise<readonly never[]> { return [] }

  async head(): Promise<LedgerHead> { return { revision: this.revision, schemaVersion: 10 } }
  async headAfterDrain(): Promise<LedgerHead> { return { revision: this.revision, schemaVersion: 10 } }

  // ── 写侧：只读替身一律拒绝（读套件不会调到；这样"只读"这件事本身也是响亮的）──────
  private readOnly(): never { throw new Error('FakeSqlReadOnlyStore 是只读替身：写路径不可用') }
  async create(): Promise<RequirementRecord> { return this.readOnly() }
  async mutate(): Promise<MutateResult> { return this.readOnly() }
  async mutateIf(): Promise<MutateResult> { return this.readOnly() }
  async appendComment(): Promise<{ version: number; commentCount: number }> { return this.readOnly() }
  async sweep(): Promise<SweepResult> { return this.readOnly() }
  async replaceAll(): Promise<void> { return this.readOnly() }
  subscribe(): () => void { return this.readOnly() }
}

const IMPLEMENTATIONS: readonly { name: string; suites: readonly ContractSuite[]; make: ContractFactory }[] = [
  {
    name: 'InMemoryRequirementStore',
    suites: ['read', 'write'],
    make: (seed) => {
      const store = new InMemoryRequirementStore({ requirements: seed })
      return { store, injectFault: (id, code) => store.injectFault(id, code) }
    },
  },
  {
    name: 'ShardedRequirementStore',
    suites: ['read', 'write'], // t5 落地写侧后翻转（已完成）
    make: async (seed) => {
      const fs = new FakeShardFs()
      const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: () => { /* 契约测试不吞告警，但这里不关心 */ } })
      for (const record of seed) await seedShard(repo, CONTRACT_ROOT, { record })
      await repo.writeMeta(CONTRACT_ROOT, { schemaVersion: 10, revision: 1 })
      // B12 阶段⑤（收口）：契约表要求 `make` 交出 `store`；分片实现由 repo + 假 fs 现搭
      const store = new ShardedRequirementStore({
        root: CONTRACT_ROOT, repository: repo, now: () => 1,
        onWarn: () => { /* 同上 */ },
      })
      return { store, onWarn: () => { /* 同上 */ } }
    },
  },
  {
    // t4（REQ-261004103330-005f FR-8）：**真** SQLite 实现入场。它替换的正是上面那个只读替身
    // 当年承担的角色——但这次是真的 DB，"DB 适配器可照这份入场"这句话到这里才算被证实。
    // 夹具不提供 injectFault（与分片实现同口径）：CORRUPT_SHARD / IO_FAILED 由分片实现的故障用例承担。
    name: 'SqliteRequirementStore',
    suites: ['read', 'write'],
    make: (seed) => makeSqliteHarness(seed),
  },
  // t-07b058 接入：假 SQL 形状**只读**替身（证明端口不泄漏存储细节、DB 适配器可直接照这份入场）
  {
    name: 'FakeSqlReadOnlyStore',
    suites: ['read'],
    make: (seed) => ({ store: new FakeSqlReadOnlyStore(seed) }),
  },
]

/** 契约用的数据根（假 fs，不落真实磁盘）。 */
const CONTRACT_ROOT = '/data/reqboard'

// ---------------------------------------------------------------------------
// 夹具与工具
// ---------------------------------------------------------------------------

const REQ_A = 'REQ-261002161439-277d'
const REQ_B = 'REQ-261002120707-deab'
const REQ_COLD = 'REQ-260930094139-2d65'

function req(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id,
    title: `需求 ${id}`,
    description: '描述',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 100,
    updatedAt: 100,
    createdBy: { kind: 'agent' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

const archived = (id: string): RequirementRecord => req(id, { status: 'archived', updatedAt: 50 })

/** 取一个 Promise 的 code（成功返回 undefined）。 */
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

/** 断言它该响：抛错且 code 精确匹配。 */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  expect(await codeOf(p)).toBe(code)
}

// ---------------------------------------------------------------------------
// 读套件
// ---------------------------------------------------------------------------

function defineReadContract(label: string, make: ContractFactory): void {
  describe(label, () => {
    it('head()：给出全局 revision 与 schemaVersion', async () => {
      const { store } = await make([req(REQ_A)])
      const before = await store.head()
      expect(typeof before.revision).toBe('number')
      expect(before.schemaVersion).toBeGreaterThan(0)
    })

    it('get()：存在返回记录，不存在返回 undefined', async () => {
      const { store } = await make([req(REQ_A)])
      expect((await store.get(REQ_A))?.id).toBe(REQ_A)
      expect(await store.get('REQ-000000')).toBeUndefined()
    })

    it('get() 出口是**副本**：改返回值不污染存储（本仓反复踩过的漂移）', async () => {
      const { store } = await make([req(REQ_A)])
      const got = await store.get(REQ_A)
      got!.title = '被外部改掉了'
      got!.comments.push({ id: 'c-x', body: '注入', createdAt: 1 })
      expect((await store.get(REQ_A))!.title).not.toBe('被改掉了')
      expect((await store.get(REQ_A))!.comments).toHaveLength(0)
    })

    it('get()：冷侧（归档）仍可读——深链要打得开', async () => {
      const { store } = await make([archived(REQ_COLD)])
      expect((await store.get(REQ_COLD))?.status).toBe('archived')
    })

    it('getSummary()：返回摘要投影，**不含**任何大字段', async () => {
      const rich = req(REQ_A, {
        comments: [{ id: 'c-1', body: '评论', createdAt: 1 }],
        artifacts: [],
        plan: { path: 'p', summary: 's', tasks: [], submittedAt: 1, submittedBy: { kind: 'agent' } },
        verification: { summary: 'v', evidence: ['e'], submittedAt: 1, submittedBy: { kind: 'agent' } },
      })
      const { store } = await make([rich])
      const s = await store.getSummary(REQ_A)
      expect(s?.id).toBe(REQ_A)
      for (const key of BIG_FIELD_KEYS) expect(key in (s as object)).toBe(false)
      expect(s?.commentCount).toBe(1)
      expect(await store.getSummary('REQ-000000')).toBeUndefined()
    })

    it('listSummaries()：缺省 scope=active，归档不进默认结果', async () => {
      const { store } = await make([req(REQ_A), archived(REQ_COLD)])
      const page = await store.listSummaries()
      expect(page.items.map((i) => i.id)).toEqual([REQ_A])
      expect(page.nextCursor).toBeUndefined()
      const all = await store.listSummaries({ scope: 'all' })
      expect(all.items.map((i) => i.id).sort()).toEqual([REQ_A, REQ_COLD].sort())
      const cold = await store.listSummaries({ scope: 'archived' })
      expect(cold.items.map((i) => i.id)).toEqual([REQ_COLD])
    })

    it('listSummaries()：条件过滤（ids / status / workspaceRoot / sourceSessionId）', async () => {
      const { store } = await make([
        req(REQ_A, { workspaceRoot: '/ws/1', sourceSessionId: 'session-1', status: 'implementing' }),
        req(REQ_B, { workspaceRoot: '/ws/2', sourceSessionId: 'session-2', status: 'design' }),
      ])
      expect((await store.listSummaries({ ids: [REQ_B] })).items.map((i) => i.id)).toEqual([REQ_B])
      expect((await store.listSummaries({ status: ['design'] })).items.map((i) => i.id)).toEqual([REQ_B])
      expect((await store.listSummaries({ workspaceRoot: '/ws/1' })).items.map((i) => i.id)).toEqual([REQ_A])
      expect((await store.listSummaries({ sourceSessionId: 'session-2' })).items.map((i) => i.id)).toEqual([REQ_B])
      expect((await store.listSummaries({ status: ['canceled'] })).items).toEqual([])
    })

    it('listSummaries()：分页——当页 + 游标，两页不重叠、到底无游标', async () => {
      const seed = [
        req(REQ_A, { updatedAt: 300 }),
        req(REQ_B, { updatedAt: 200 }),
        req(REQ_COLD, { status: 'implementing', updatedAt: 100 }),
      ]
      const { store } = await make(seed)
      const p1 = await store.listSummaries({ limit: 2 })
      expect(p1.items).toHaveLength(2)
      expect(p1.items.map((i) => i.id)).toEqual([REQ_A, REQ_B]) // updatedAt 降序
      expect(p1.nextCursor).toBeDefined()
      const p2 = await store.listSummaries({ limit: 2, cursor: p1.nextCursor })
      expect(p2.items.map((i) => i.id)).toEqual([REQ_COLD])
      expect(p2.nextCursor).toBeUndefined() // 到底
      const ids = [...p1.items, ...p2.items].map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length) // 无重叠
    })

    it('listSummaries()：越界/伪造游标返回空页，**不抛错**（看板不该整页报错）', async () => {
      const { store } = await make([req(REQ_A)])
      expect((await store.listSummaries({ cursor: '不是游标' })).items).toEqual([])
      expect((await store.listSummaries({ cursor: 'idx:999' })).items).toEqual([])
    })

    it('peekSummaries()：同步可用、不含归档（提示词组装用）', async () => {
      const { store } = await make([req(REQ_A), archived(REQ_COLD)])
      await store.listSummaries() // 先让索引就位（未建时 peek 允许返回空数组）
      const peeked = store.peekSummaries() // 注意：**不是** await，同步口是它存在的理由
      expect(peeked.map((i) => i.id)).toEqual([REQ_A])
    })

    it('peekFacts()：同步可用、带 description、不含归档（B12 阶段①-a 提示词缝用）', async () => {
      const { store } = await make([req(REQ_A, { description: '一段需求正文' }), archived(REQ_COLD)])
      await store.listSummaries() // 先让索引就位（未建时 peek 允许返回空数组）
      const facts = store.peekFacts() // 同步口：不加 await
      expect(facts.map((f) => f.id)).toEqual([REQ_A])
      // 与 peekSummaries 的**唯一差别**：多带 description（boundSectionText 推断难度要用）。
      // 缺了它，FR-16 的「按需求实质推断难度」会静默退回缺省档。
      expect(facts[0]!.description).toBe('一段需求正文')
      expect(facts[0]!.status).toBe(store.peekSummaries()[0]!.status)
    })

    it('headAfterDrain()：排空后返回 head（形状与 head() 一致）', async () => {
      const { store } = await make([req(REQ_A)])
      const drained = await store.headAfterDrain()
      const plain = await store.head()
      expect(typeof drained.revision).toBe('number')
      // 内存替身没有写队列 ⇒ 排空是恒等；分片实现等的是写入器的串行队列（见端口注释）。
      expect(drained).toEqual(plain)
    })

    it('listComments()：按 seq 升序；since/limit 生效；需求不存在给空数组', async () => {
      const { store } = await make([req(REQ_A, {
        comments: [
          { id: 'c-1', body: '一', createdAt: 1 },
          { id: 'c-2', body: '二', createdAt: 2 },
          { id: 'c-3', body: '三', createdAt: 3 },
        ],
      })])
      expect((await store.listComments(REQ_A)).map((c) => c.id)).toEqual(['c-1', 'c-2', 'c-3'])
      expect((await store.listComments(REQ_A, { since: 1 })).map((c) => c.id)).toEqual(['c-2', 'c-3'])
      expect((await store.listComments(REQ_A, { since: 0, limit: 2 })).map((c) => c.id)).toEqual(['c-1', 'c-2'])
      expect(await store.listComments('REQ-000000')).toEqual([])
    })

    it('listHistory()：状态流转与推进事件同一条时间线，按 kind 可分支', async () => {
      const seeded = req(REQ_A, {
        statusHistory: [{ status: 'draft', at: 1, by: { kind: 'agent' } }, { status: 'implementing', at: 2, by: { kind: 'human' } }],
        advance: { history: [{ at: 3, requirementId: REQ_A, event: 'RUN_SUBTASK', outcome: 'ok', durationMs: 5, detail: '跑了一张子卡' }] },
      })
      const { store } = await make([seeded])
      const history = await store.listHistory(REQ_A)
      expect(history.filter((h) => h.kind === 'status')).toHaveLength(2)
      const advance = history.find((h) => h.kind === 'advance')
      expect(advance?.kind === 'advance' && advance.record.event).toBe('RUN_SUBTASK')
      expect(await store.listHistory(REQ_A, { limit: 1 })).toHaveLength(1)
      expect(await store.listHistory('REQ-000000')).toEqual([])
    })

    it('get()：大字段按需装配回现状同形的记录（评论/历史/产物/计划/验收）', async () => {
      const seeded = req(REQ_A, {
        comments: [{ id: 'c-1', body: '一', createdAt: 1 }],
        statusHistory: [{ status: 'draft', at: 1, by: { kind: 'agent' } }],
        artifacts: [{ stage: 'design', kind: 'design', path: 'docs/x.md', registeredAt: 1, registeredBy: { kind: 'agent' } }],
        plan: { path: 'p', summary: 's', tasks: [], submittedAt: 1, submittedBy: { kind: 'agent' } },
      })
      const { store } = await make([seeded])
      const got = await store.get(REQ_A)
      expect(got!.comments.map((c) => c.id)).toEqual(['c-1'])
      expect(got!.statusHistory?.map((s) => s.status)).toEqual(['draft'])
      expect(got!.artifacts?.[0]?.path).toBe('docs/x.md')
      expect(got!.plan?.path).toBe('p')
      // v10 的内部计数字段**不该**出现在对外记录里
      for (const key of ['commentCount', 'historyCount', 'artifactCount']) {
        expect(key in (got as object)).toBe(false)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// 写套件
// ---------------------------------------------------------------------------

function defineWriteContract(label: string, make: ContractFactory): void {
  describe(label, () => {
    it('create()：落一条新需求（version=1、status 缺省 draft），并以 requirement-created 广播', async () => {
      const { store } = await make([])
      const seen: string[] = []
      store.subscribe((c) => seen.push(`${c.kind}:${c.requirementId}`))
      const created = await store.create(
        { id: REQ_A, title: '新需求', sourceSessionId: 'session-1' },
        { kind: 'agent', sessionId: 'session-1' },
      )
      expect(created.id).toBe(REQ_A)
      expect(created.version).toBe(1)
      expect(created.status).toBe('draft')
      expect(created.sourceSessionId).toBe('session-1')
      expect(seen).toEqual([`requirement-created:${REQ_A}`])
      expect((await store.getSummary(REQ_A))?.id).toBe(REQ_A)
    })

    it('create()：撞 id → ALREADY_EXISTS，且**不覆盖**已有内容', async () => {
      const { store } = await make([req(REQ_A, { title: '原样' })])
      await expectCode(store.create({ id: REQ_A, title: '新的' }, { kind: 'agent' }), REQUIREMENT_STORE_ERROR.ALREADY_EXISTS)
      expect((await store.get(REQ_A))!.title).toBe('原样')
    })

    it('create()：id 形态非法 / 标题为空 → VALIDATION_FAILED（不落盘）', async () => {
      const { store } = await make([])
      await expectCode(store.create({ id: '../escape', title: 'x' }, { kind: 'agent' }), REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
      await expectCode(store.create({ id: REQ_A, title: '   ' }, { kind: 'agent' }), REQUIREMENT_STORE_ERROR.VALIDATION_FAILED)
      expect(await store.get(REQ_A)).toBeUndefined()
    })

    it('mutate()：改一处 → version 与 revision 各 +1，返回提交后的记录', async () => {
      const { store } = await make([req(REQ_A, { version: 4 })])
      const revBefore = (await store.head()).revision
      const res = await store.mutate(REQ_A, (draft) => {
        draft.title = '改过了'
        return { changed: true }
      })
      expect(res.changed).toBe(true)
      expect(res.version).toBe(5) // version 由**存储**自增，变更器没碰它
      expect(res.requirement.title).toBe('改过了')
      expect(res.revision).toBe(revBefore + 1)
      expect((await store.get(REQ_A))!.version).toBe(5)
    })

    it('mutate()：返回 undefined 或 {changed:false} → **不落盘**（version 与 revision 都不动）', async () => {
      const { store } = await make([req(REQ_A, { version: 7 })])
      const revBefore = (await store.head()).revision
      const a = await store.mutate(REQ_A, () => undefined)
      const b = await store.mutate(REQ_A, () => ({ changed: false }))
      expect([a.changed, b.changed]).toEqual([false, false])
      expect(a.version).toBe(7)
      expect((await store.head()).revision).toBe(revBefore)
      expect((await store.get(REQ_A))!.version).toBe(7)
    })

    it('mutate()：状态变了广播 requirement-moved，只改字段广播 requirement-updated', async () => {
      const { store } = await make([req(REQ_A)])
      const seen: string[] = []
      store.subscribe((c) => seen.push(c.kind))
      await store.mutate(REQ_A, (d) => { d.title = 'x'; return { changed: true } })
      await store.mutate(REQ_A, (d) => { d.status = 'accepting'; return { changed: true } })
      expect(seen).toEqual(['requirement-updated', 'requirement-moved'])
    })

    it('mutate()：目标不存在 → NOT_FOUND（写操作不隐式建档）', async () => {
      const { store } = await make([])
      await expectCode(store.mutate(REQ_A, () => ({ changed: true })), REQUIREMENT_STORE_ERROR.NOT_FOUND)
    })

    it('mutate()：写冷侧 → COLD_IMMUTABLE，且存储内容不动', async () => {
      const { store } = await make([archived(REQ_COLD)])
      await expectCode(store.mutate(REQ_COLD, (d) => { d.title = '偷改'; return { changed: true } }), REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE)
      expect((await store.get(REQ_COLD))!.title).not.toBe('偷改')
    })

    it('mutateIf()：版本匹配则成功，版本不匹配 → CONFLICT 且**前者内容不被覆盖**', async () => {
      const { store } = await make([req(REQ_A, { version: 3 })])
      const ok = await store.mutateIf(REQ_A, 3, (d) => { d.title = '第一个写者'; return { changed: true } })
      expect(ok.version).toBe(4)

      let conflictCode: string | undefined
      try {
        await store.mutateIf(REQ_A, 3, (d) => { d.title = '第二个写者'; return { changed: true } })
      } catch (err) {
        conflictCode = (err as { code?: string }).code
        expect((err as { currentVersion?: number }).currentVersion).toBe(4)
      }
      expect(conflictCode).toBe(REQUIREMENT_STORE_ERROR.CONFLICT)
      expect((await store.get(REQ_A))!.title).toBe('第一个写者') // 后者没有覆盖前者
    })

    it('appendComment()：评论进得去、commentCount 随之增长、广播 comment-added（一次写一条通知）', async () => {
      const { store } = await make([req(REQ_A)])
      const seen: string[] = []
      store.subscribe((c) => seen.push(c.kind))
      const r1 = await store.appendComment(REQ_A, { id: 'c-1', body: '一', createdAt: 1 })
      const r2 = await store.appendComment(REQ_A, { id: 'c-2', body: '二', createdAt: 2, createdBy: { kind: 'human' } })
      expect([r1.commentCount, r2.commentCount]).toEqual([1, 2])
      expect(r2.version).toBe(r1.version + 1)
      expect((await store.get(REQ_A))!.comments.map((c) => c.id)).toEqual(['c-1', 'c-2'])
      expect((await store.getSummary(REQ_A))!.commentCount).toBe(2)
      expect(seen).toEqual(['comment-added', 'comment-added'])
    })

    it('appendComment()：不存在 → NOT_FOUND；冷侧 → COLD_IMMUTABLE', async () => {
      const { store } = await make([archived(REQ_COLD)])
      await expectCode(store.appendComment('REQ-000000', { id: 'c', body: 'b', createdAt: 1 }), REQUIREMENT_STORE_ERROR.NOT_FOUND)
      await expectCode(store.appendComment(REQ_COLD, { id: 'c', body: 'b', createdAt: 1 }), REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE)
    })

    it('sweep()：批量改多条只 bump 一次 revision，返回被改的 id；冷侧不参与', async () => {
      const { store } = await make([req(REQ_A), req(REQ_B), archived(REQ_COLD)])
      const revBefore = (await store.head()).revision
      const res = await store.sweep('启动对账', (drafts) => {
        expect(drafts.map((d) => d.id).sort()).toEqual([REQ_A, REQ_B].sort()) // 冷侧不在扫描集里
        for (const d of drafts) d.title = '对账过'
        return [REQ_A, REQ_B]
      })
      expect([...res.touched].sort()).toEqual([REQ_A, REQ_B].sort())
      expect(res.revision).toBe(revBefore + 1) // 一次批量 = 一次全局序
      expect((await store.get(REQ_A))!.title).toBe('对账过')
      expect((await store.get(REQ_B))!.title).toBe('对账过')
    })

    it('sweep()：无改动 → revision 不动；越界 id 忽略并告警（不整轮失败）', async () => {
      const warns: string[] = []
      const { store } = await make([req(REQ_A)])
      const revBefore = (await store.head()).revision
      const nothing = await store.sweep('对账', () => [])
      expect(nothing).toEqual({ touched: [], revision: revBefore })
      void warns
      const res = await store.sweep('对账', () => [REQ_A])
      expect(res.touched).toEqual([REQ_A])
    })

    it('replaceAll()：以导入结构整体重建（迁移/回滚脚本的入口），并以 ledger-replaced 广播', async () => {
      const { store } = await make([req(REQ_A)])
      const seen: string[] = []
      store.subscribe((c) => seen.push(`${c.kind}:${c.requirementId}`))
      await store.replaceAll('迁移导入', {
        schemaVersion: 10,
        revision: 99,
        requirements: [req(REQ_B)],
        triages: [],
      })
      expect(await store.get(REQ_A)).toBeUndefined()
      expect((await store.get(REQ_B))?.id).toBe(REQ_B)
      expect((await store.head()).revision).toBe(99)
      expect(seen).toEqual([`ledger-replaced:${REQ_B}`])
    })

    it('subscribe()：变更带摘要（订阅者不必重读整册）；退订后不再收到', async () => {
      const { store } = await make([req(REQ_A)])
      const got: string[] = []
      const off = store.subscribe((c) => got.push(`${c.kind}:${c.summary.id}:${c.revision}`))
      await store.mutate(REQ_A, (d) => { d.title = 'x'; return { changed: true } })
      off()
      await store.mutate(REQ_A, (d) => { d.title = 'y'; return { changed: true } })
      expect(got).toHaveLength(1)
      expect(got[0]!.startsWith('requirement-updated:' + REQ_A + ':')).toBe(true)
    })

    describe('传输错误码（7 个）', () => {
      it('NOT_FOUND / ALREADY_EXISTS / COLD_IMMUTABLE / VALIDATION_FAILED / CONFLICT 由真实路径触发', async () => {
        const { store } = await make([req(REQ_A, { version: 1 }), archived(REQ_COLD)])
        const codes = [
          await codeOf(store.mutate('REQ-000000', () => ({ changed: true }))),
          await codeOf(store.create({ id: REQ_A, title: 't' }, { kind: 'agent' })),
          await codeOf(store.appendComment(REQ_COLD, { id: 'c', body: 'b', createdAt: 1 })),
          await codeOf(store.create({ id: 'bad-id', title: 't' }, { kind: 'agent' })),
          await codeOf(store.mutateIf(REQ_A, 999, () => ({ changed: true }))),
        ]
        expect(codes).toEqual([
          REQUIREMENT_STORE_ERROR.NOT_FOUND,
          REQUIREMENT_STORE_ERROR.ALREADY_EXISTS,
          REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE,
          REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
          REQUIREMENT_STORE_ERROR.CONFLICT,
        ])
      })

      it('CORRUPT_SHARD / IO_FAILED：适配器遇到损坏分片 / IO 失败必须抛**带该 code** 的错误（替身用故障注入断言形状）', async () => {
        const { store, injectFault } = await make([req(REQ_A)])
        if (injectFault === undefined) {
          console.log(`[契约] ${label} 不支持故障注入：CORRUPT_SHARD / IO_FAILED 由分片实现的故障用例承担`)
          return
        }
        injectFault(REQ_A, REQUIREMENT_STORE_ERROR.CORRUPT_SHARD)
        await expectCode(store.get(REQ_A), REQUIREMENT_STORE_ERROR.CORRUPT_SHARD)
        await expectCode(store.mutate(REQ_A, () => ({ changed: true })), REQUIREMENT_STORE_ERROR.CORRUPT_SHARD)

        const { store: store2, injectFault: inject2 } = await make([req(REQ_B)])
        inject2!(REQ_B, REQUIREMENT_STORE_ERROR.IO_FAILED)
        await expectCode(store2.listComments(REQ_B), REQUIREMENT_STORE_ERROR.IO_FAILED)
        await expectCode(store2.getSummary(REQ_B), REQUIREMENT_STORE_ERROR.IO_FAILED)
      })
    })
  })
}

// ---------------------------------------------------------------------------
// 按注册表挂载（同一实现跑它声明的全部套件）
// ---------------------------------------------------------------------------

for (const impl of IMPLEMENTATIONS) {
  if (impl.suites.includes('read')) defineReadContract(`读契约 · ${impl.name}`, impl.make)
  if (impl.suites.includes('write')) defineWriteContract(`写契约 · ${impl.name}`, impl.make)
}

// ---------------------------------------------------------------------------
// 注册表与专有行为（不属共享契约，故单列）
// ---------------------------------------------------------------------------

describe('契约注册表自检', () => {
  it('每个实现都声明了跑哪些套件；写侧未覆盖的实现必须显式列出', () => {
    for (const impl of IMPLEMENTATIONS) expect(impl.suites.length).toBeGreaterThan(0)
    // t5 已落地分片写侧，故"待翻转"的必须只有**刻意只读**的替身（t-07b058 验收⑥：只读证明
    // 端口不泄漏存储细节 ⇒ 它按定义不跑写侧）。除白名单外一律视为"忘了翻转"，照旧报红。
    const READ_ONLY_BY_DESIGN = ['FakeSqlReadOnlyStore']
    const pendingWrite = IMPLEMENTATIONS
      .filter((i) => !i.suites.includes('write'))
      .map((i) => i.name)
      .filter((name) => !READ_ONLY_BY_DESIGN.includes(name))
    expect(pendingWrite).toEqual([])
  })

  it('契约断言的错误码字符串与端口常量同源（不许就地硬编码）', () => {
    expect(new Set(Object.values(REQUIREMENT_STORE_ERROR)).size).toBe(7)
  })
})

// SQLite 夹具的临时目录必须由**调用方**在套件结束时清掉：不清理会在系统临时目录留一堆库文件
// （一次契约运行会建几十个）。放在这里而不是夹具文件里，是因为 vitest 的钩子必须注册在测试文件里。
afterAll(() => { disposeSqliteHarnesses() })

describe('InMemoryRequirementStore 专有行为（告警通道；分片实现的对应项随 t5 落地）', () => {
  it('订阅者抛错不阻断写', async () => {
    const warns: string[] = []
    const store = new InMemoryRequirementStore({ requirements: [req(REQ_A)] }, { onWarn: (m) => warns.push(m) })
    store.subscribe(() => { throw new Error('订阅者炸了') })
    await store.mutate(REQ_A, (d) => { d.title = '仍应写入'; return { changed: true } })
    expect((await store.get(REQ_A))!.title).toBe('仍应写入')
    expect(warns.some((w) => w.includes('订阅者'))).toBe(true)
  })

  it('sweep 越界 id 忽略并告警', async () => {
    const warns: string[] = []
    const store = new InMemoryRequirementStore({ requirements: [req(REQ_A)] }, { onWarn: (m) => warns.push(m) })
    await store.sweep('对账', () => [REQ_A, 'REQ-000000'])
    expect(warns.some((w) => w.includes('REQ-000000'))).toBe(true)
  })
})
