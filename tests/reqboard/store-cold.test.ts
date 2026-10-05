/**
 * L2 单测 · 热冷分层与读放大探针（REQ-261002161439-277d · t4 / FR-1、FR-4）。
 *
 * 卡上三条断言在这里落地：
 * - **A2 读放大**：`getSummary` 与 `listSummaries` 稳态下 `readFile` 调用 0、读入字节 0
 *   ——即"摘要走内存索引，不碰文件"（这是首屏载荷降量的根）；
 * - **A3 布局**：数据根含 `meta.json` 与 `requirements/<REQ>/record.json`，归档需求只在 `archive/` 下；
 * - **A5 冷热**：默认列表不含归档、`get(归档 id)` 仍返回全文、`scope:'archived'` 才给归档摘要。
 *
 * 另含一条可靠性断言：**坏分片从索引剔除 + 告警，但不抛整页错**（看板不该因一条坏数据 500）。
 */
import { describe, it, expect } from 'vitest'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import { recordPath, requirementsDir, archiveDir, journalPath, metaPath, requirementDir } from '../../src/domain/requirement/ReqboardPaths.js'
import { encodeJournalLine, toCommentLine } from '../../src/domain/requirement/Journal.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard'
const HOT = 'REQ-261002161439-277d'
const HOT2 = 'REQ-261002120707-deab'
const COLD = 'REQ-260930094139-2d65'

function record(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
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

/** 造一套「迁移后」的夹具：2 条热侧（其中 1 条带评论与产物）+ 1 条归档。 */
async function fixture(): Promise<{ fs: FakeShardFs; repo: RequirementShardRepository; store: ShardedRequirementStore; warns: string[] }> {
  const fs = new FakeShardFs()
  const warns: string[] = []
  const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: (m) => warns.push(m) })
  const store = new ShardedRequirementStore({ root: ROOT, repository: repo, onWarn: (m) => warns.push(m) })

  await seedShard(repo, ROOT, {
    record: record(HOT, {
      updatedAt: 300,
      comments: [
        { id: 'c-1', body: '一', createdAt: 1 },
        { id: 'c-2', body: '二', createdAt: 2 },
      ],
      statusHistory: [{ status: 'draft', at: 1, by: { kind: 'agent' } }],
      plan: { path: 'docs/plan.md', summary: '计划', tasks: [], submittedAt: 1, submittedBy: { kind: 'agent' } },
    }),
  })
  await seedShard(repo, ROOT, { record: record(HOT2, { updatedAt: 200 }) })
  await seedShard(repo, ROOT, {
    record: record(COLD, { status: 'archived', updatedAt: 50, comments: [{ id: 'c-cold', body: '归档前的评论', createdAt: 5 }] }),
  })
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 42, migrations: [{ from: 9, to: 10, at: 1, by: 'migrate-ledger-v10' }] })
  return { fs, repo, store, warns }
}

// ---------------------------------------------------------------------------
// A3 布局
// ---------------------------------------------------------------------------

describe('A3 数据根布局（迁移后的形态）', () => {
  it('meta.json 在根，热记录在 requirements/<REQ>/，归档只在 archive/<REQ>/', async () => {
    const { fs } = await fixture()
    expect(fs.files.has(metaPath(ROOT))).toBe(true)
    expect(fs.files.has(recordPath(ROOT, HOT))).toBe(true)
    expect(fs.files.has(recordPath(ROOT, HOT2))).toBe(true)
    // 归档需求：热侧**没有**它的记录，冷侧有
    expect(fs.files.has(recordPath(ROOT, COLD))).toBe(false)
    expect(fs.files.has(recordPath(ROOT, COLD, { cold: true }))).toBe(true)
    // 归档需求的评论也整体搬走了（整目录搬运，不留半份在热侧）
    expect(fs.files.has(journalPath(ROOT, COLD, 'comments'))).toBe(false)
    expect(fs.files.has(journalPath(ROOT, COLD, 'comments', { cold: true }))).toBe(true)
    expect([...fs.files.keys()].some((p) => p.startsWith(requirementDir(ROOT, COLD)))).toBe(false)
  })

  it('热记录只留标量 + 计数：大字段外置（评论在 jsonl、计划在 plan.json）', async () => {
    const { fs } = await fixture()
    const onDisk = JSON.parse(fs.files.get(recordPath(ROOT, HOT))!) as Record<string, unknown>
    expect(onDisk.commentCount).toBe(2)
    expect(onDisk.historyCount).toBe(1)
    for (const key of ['comments', 'statusHistory', 'plan', 'verification', 'artifacts', 'archive']) {
      expect(key in onDisk).toBe(false)
    }
    expect(fs.files.has(journalPath(ROOT, HOT, 'comments'))).toBe(true)
    expect(fs.files.has(recordPath(ROOT, HOT).replace('record.json', 'plan.json'))).toBe(true)
  })

  it('目录枚举：热侧 2 条、冷侧 1 条', async () => {
    const { repo } = await fixture()
    expect(await repo.listHotIds(ROOT)).toEqual([HOT, HOT2].sort())
    expect(await repo.listColdIds(ROOT)).toEqual([COLD])
    expect(requirementsDir(ROOT)).toBe(`${ROOT}/requirements`)
    expect(archiveDir(ROOT)).toBe(`${ROOT}/archive`)
  })
})

// ---------------------------------------------------------------------------
// A2 读放大
// ---------------------------------------------------------------------------

describe('A2 读放大：摘要走内存索引，不碰文件', () => {
  it('索引建好之后，getSummary(热) 与 listSummaries 的 readFile 调用为 0、读入字节为 0', async () => {
    const { fs, store } = await fixture()
    await store.listSummaries() // 热身：这一次允许读分片建索引
    const coldBuild = fs.readBytes
    expect(coldBuild).toBeGreaterThan(0) // 建索引确实读了（不是"什么都没干"的假绿）

    fs.resetProbes()
    expect((await store.getSummary(HOT))?.id).toBe(HOT)
    const page = await store.listSummaries()
    expect(page.items).toHaveLength(2)
    expect(fs.reads).toBe(0)
    expect(fs.readBytes).toBe(0)
    expect(fs.readdirs).toBe(0) // 索引里也缓存了 id 列表，稳态连目录都不扫
  })

  it('冷侧摘要是**按需读**（不属零读路径）：getSummary(归档) 会读一次冷分片', async () => {
    const { fs, store } = await fixture()
    await store.listSummaries()
    fs.resetProbes()
    expect((await store.getSummary(COLD))?.id).toBe(COLD)
    // 设计如此：冷侧不预读内容，看板要归档就付一次单需求读——代价 O(1)，不是 O(全库)
    expect(fs.reads).toBeGreaterThan(0)
    expect(fs.reads).toBeLessThanOrEqual(2)
  })

  it('对照：get() 必须去读分片（装配大字段），它不是零读路径', async () => {
    const { fs, store } = await fixture()
    await store.listSummaries() // 热身
    fs.resetProbes()
    const got = await store.get(HOT)
    expect(got!.comments.map((c) => c.id)).toEqual(['c-1', 'c-2'])
    expect(fs.reads).toBeGreaterThan(0) // 证明探针真的在工作（否则 A2 的 0 也可能是"没测到"）
  })

  it('懒建：构造后不读盘；第一次 listSummaries 才建索引', async () => {
    const { fs, store } = await fixture()
    fs.resetProbes()
    expect(fs.reads).toBe(0) // 构造期零读盘（不在启动时预读全部需求）
    expect(store.peekSummaries()).toEqual([]) // 索引未建 → 同步投影为空（退化为不注入引导）
    await store.listSummaries()
    expect(fs.reads).toBeGreaterThan(0)
    expect(store.peekSummaries().map((s) => s.id)).toEqual([HOT, HOT2].sort())
  })

  it('负结果不缓存：查不到的 id 之后新建/出现仍能读到（不因一次未命中永久失明）', async () => {
    const { repo, store } = await fixture()
    expect(await store.getSummary('REQ-000001')).toBeUndefined()
    // 之后补一条同 id 的分片
    await seedShard(repo, ROOT, { record: record('REQ-000001', { updatedAt: 999 }) })
    expect((await store.getSummary('REQ-000001'))?.id).toBe('REQ-000001')
  })
})

// ---------------------------------------------------------------------------
// A5 冷热分层
// ---------------------------------------------------------------------------

describe('A5 冷热分层', () => {
  it('默认列表不含归档；scope=archived 才给归档摘要；scope=all 两边都有', async () => {
    const { store } = await fixture()
    expect((await store.listSummaries()).items.map((s) => s.id)).toEqual([HOT, HOT2])
    expect((await store.listSummaries({ scope: 'archived' })).items.map((s) => s.id)).toEqual([COLD])
    expect((await store.listSummaries({ scope: 'all' })).items.map((s) => s.id)).toEqual([HOT, HOT2, COLD])
  })

  it('get(归档 id) 返回**全文**（含归档前的评论）——深链要打得开', async () => {
    const { store } = await fixture()
    const got = await store.get(COLD)
    expect(got?.status).toBe('archived')
    expect(got?.comments.map((c) => c.id)).toEqual(['c-cold'])
    expect(await store.listComments(COLD)).toHaveLength(1)
  })

  it('归档不在内存索引里（热侧摘要不含它），故默认载荷天然变小', async () => {
    const { store } = await fixture()
    await store.listSummaries()
    expect(store.peekSummaries().map((s) => s.id).sort()).toEqual([HOT, HOT2].sort())
    expect(store.peekSummaries().some((s) => s.id === COLD)).toBe(false)
  })

  it('归档页的读代价是"按需读冷侧"，且不污染热侧索引', async () => {
    const { fs, store } = await fixture()
    await store.listSummaries()
    fs.resetProbes()
    const archivedPage = await store.listSummaries({ scope: 'archived' })
    expect(archivedPage.items.map((s) => s.id)).toEqual([COLD])
    expect(fs.reads).toBeGreaterThan(0) // 冷侧摘要按需读（设计如此：冷侧不预读内容）
    fs.resetProbes()
    expect((await store.listSummaries()).items.map((s) => s.id)).toEqual([HOT, HOT2])
    expect(fs.reads).toBe(0) // 热侧索引未被冷读污染，仍是零读
  })
})

// ---------------------------------------------------------------------------
// 可靠性：坏分片不拖垮整页
// ---------------------------------------------------------------------------

describe('坏分片：剔除 + 告警，不抛整页错', () => {
  it('某条分片 JSON 坏掉 → 它从索引消失并告警，其余需求照常可读', async () => {
    const { fs, store, warns } = await fixture()
    fs.putFile(recordPath(ROOT, HOT), '{ 这不是 JSON')
    const page = await store.listSummaries()
    expect(page.items.map((s) => s.id)).toEqual([HOT2]) // 坏的那条被剔除
    expect(warns.some((w) => w.includes(HOT))).toBe(true) // 但告警点名了它（不是静默）
    expect((await store.getSummary(HOT2))?.id).toBe(HOT2) // 邻居不受影响
  })

  it('计数与日志不符（数据丢失）→ 告警并按现有有效行装配，不把需求读成空', async () => {
    const { fs, store, warns } = await fixture()
    // 把评论日志砍到只剩 1 行，但 record 里计数仍是 2
    fs.putFile(journalPath(ROOT, HOT, 'comments'), encodeJournalLine(toCommentLine(0, { id: 'c-1', body: '一', createdAt: 1 })))
    const got = await store.get(HOT)
    expect(got!.comments.map((c) => c.id)).toEqual(['c-1'])
    expect(warns.some((w) => w.includes('提交点'))).toBe(true)
  })
})
