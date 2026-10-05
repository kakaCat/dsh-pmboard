/**
 * t3 验收：**SQLite 适配器**（REQ-261004103330-005f FR-7 / FR-9）。
 *
 * 这份测试是 t4 把实现注册进 `store-contract.test.ts` 注册表的**前置证据**：契约那套断言跑的是
 * "端口承诺"，这里跑的是"端口承诺在 SQLite 上真的成立"——尤其是三件靠人读代码看不出的事：
 *   ① 记录（含全部大字段）**逐字段往返一致**；
 *   ② `mutateIf` 冲突时**库内容分毫未动**（事务真的回滚了）；
 *   ③ 提交点计数与日志表不符时**不静默降级**。
 *
 * 每个用例用**独立临时目录**里的库文件，结束即删（互不污染，也不碰真实 `~/.dsh`）。
 *
 * @module tests/reqboard/sqlite-store
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteRequirementStore } from '../../src/repositories/SqliteRequirementStore.js'
import { REQUIREMENT_STORE_ERROR, type ImportedLedger } from '../../src/application/ports.js'
import { SQLITE_META_KEYS, SQLITE_SCHEMA_MISMATCH } from '../../src/repositories/sqliteSchema.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

// 与实现同因：Vite 5 的内置表缺 `sqlite`，静态 import 会被当成裸包而整文件加载失败。
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

const REQ_A = 'REQ-261004103330-005f'
const REQ_B = 'REQ-261004103331-a1b2'
const REQ_COLD = 'REQ-260930094139-2d65'

const dirs: string[] = []
const stores: SqliteRequirementStore[] = []

function makeStore(opts: { now?: () => number; warns?: string[] } = {}): { store: SqliteRequirementStore; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sqlite-store-'))
  dirs.push(dir)
  const file = join(dir, 'reqboard.sqlite')
  const store = new SqliteRequirementStore({
    file,
    now: opts.now ?? (() => 1000),
    onWarn: (message) => opts.warns?.push(message),
  })
  stores.push(store)
  return { store, file }
}

async function seed(store: SqliteRequirementStore, records: readonly RequirementRecord[]): Promise<void> {
  const ledger: ImportedLedger = { schemaVersion: 9, revision: 1, requirements: [...records], triages: [] }
  await store.replaceAll('测试种子', ledger)
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close()
    } catch {
      /* 已关闭 */
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** 基础记录（与契约测试同形）。 */
function rec(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
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

/** 覆盖全部大字段的记录（往返一致性的最强夹具）。 */
function richRecord(id: string): RequirementRecord {
  return {
    id,
    title: '大字段需求',
    description: '一段需求正文（要大字段往返）',
    category: 'feature',
    promptDifficulty: 'expert',
    docBasePath: 'docs/requirements/<REQ>/',
    workspaceRoot: '/Users/mac/ws',
    status: 'implementing',
    blocked: true,
    blockedReason: '等人工裁决',
    paused: false,
    autoRun: true,
    priority: 7,
    advance: {
      lockAt: 42,
      runId: 'run-1',
      noopStreak: 2,
      failureStreak: 0,
      pausedReason: 'stagnation',
      history: [
        { at: 5, requirementId: id, event: 'RUN_SUBTASK', outcome: 'ok', durationMs: 3, detail: 'd', parentId: 't-1', subtaskId: 't-1-dev' },
      ],
    },
    dive: { activation: 'armed', phase: 'active', roundsInStage: 3, lastWakeAt: 77, currentStage: 'implementing' },
    reviewSessionId: 'session-9',
    sourceSessionId: 'session-1',
    seats: [{ windowKey: 'session-1', role: 'owner', joinedAt: 1 }],
    docLinks: { requirement: 'docs/requirements/REQ/x/requirement.md', extras: [{ label: 'L', path: 'p' }] },
    artifacts: [
      { stage: 'design', kind: 'design', path: 'docs/requirements/REQ/x/design/architecture.md', registeredAt: 3, registeredBy: { kind: 'agent' }, confirmedAt: 4, confirmedBy: { kind: 'human' }, confirmedVia: 'board' },
    ],
    archivePath: 'docs/requirements/REQ/x',
    statusHistory: [
      { status: 'draft', at: 1, by: { kind: 'human' } },
      { status: 'implementing', at: 2, by: { kind: 'agent', sessionId: 'session-1' }, reason: '推进', inferred: false },
    ],
    tokenUsage: {
      byStage: {},
      totals: { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
      costEstimateCny: 0.5,
      updatedAt: 9,
    },
    plan: { path: 'p.md', summary: 's', tasks: [], submittedAt: 11, submittedBy: { kind: 'agent' } },
    verification: { summary: 'v', evidence: ['e'], submittedAt: 12, submittedBy: { kind: 'agent' } },
    archive: { dir: 'd', docs: [], mergedInto: ['docs/architecture/project-manual.md'], indexEntry: 'i', submittedAt: 13, submittedBy: { kind: 'agent' } },
    comments: [
      { id: 'c-1', body: '一', createdAt: 10, createdBy: { kind: 'human' } },
      { id: 'c-2', body: '二（无 createdBy）', createdAt: 11 },
    ],
    version: 4,
    createdAt: 100,
    updatedAt: 200,
    createdBy: { kind: 'agent', sessionId: 'session-0' },
    updatedBy: { kind: 'human' },
  }
}

describe('SqliteRequirementStore（t3）', () => {
  it('create → get：读回与返回值逐字段一致，且 id 形态/空标题被拦', async () => {
    const { store } = makeStore()
    const created = await store.create({ id: REQ_A, title: '新需求', sourceSessionId: 'session-1' }, { kind: 'agent', sessionId: 'session-1' })
    expect(created.version).toBe(1)
    expect(created.status).toBe('draft')
    expect(await store.get(REQ_A)).toEqual(created)
    expect(await store.get('REQ-261004103399-ffff')).toBeUndefined()

    await expect(store.create({ id: 'bad-id', title: 'x' }, { kind: 'agent' }))
      .rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED })
    await expect(store.create({ id: REQ_B, title: '   ' }, { kind: 'agent' }))
      .rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED })
    await expect(store.create({ id: REQ_A, title: '重复' }, { kind: 'agent' }))
      .rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.ALREADY_EXISTS })
    expect((await store.get(REQ_A))!.title).toBe('新需求') // 不覆盖
  })

  it('大字段全覆盖：replaceAll 落库 → get 逐字段往返一致', async () => {
    const { store } = makeStore()
    const rich = richRecord(REQ_A)
    await seed(store, [rich])
    expect(await store.get(REQ_A)).toEqual(rich)
  })

  it('autoRun 缺省即缺省：不因镜像列被读成 false（presence 保真）', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A)])
    const got = await store.get(REQ_A)
    expect('autoRun' in (got as object)).toBe(false)
    const summary = await store.getSummary(REQ_A)
    expect('autoRun' in (summary as object)).toBe(false)

    await store.mutate(REQ_A, (draft) => {
      draft.autoRun = false
      return { changed: true }
    })
    const after = await store.get(REQ_A)
    expect('autoRun' in (after as object)).toBe(true)
    expect(after!.autoRun).toBe(false)
  })

  it('评论与历史：追加后读回；appendComment 使 version 与 commentCount 同增', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A, {
      comments: [{ id: 'c-0', body: '零', createdAt: 1 }],
      statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
      advance: { history: [{ at: 2, requirementId: REQ_A, event: 'RUN_SUBTASK', outcome: 'ok', durationMs: 1, detail: '' }] },
    })])
    const r1 = await store.appendComment(REQ_A, { id: 'c-1', body: '一', createdAt: 2 })
    const r2 = await store.appendComment(REQ_A, { id: 'c-2', body: '二', createdAt: 3, createdBy: { kind: 'human' } })
    expect([r1.commentCount, r2.commentCount]).toEqual([2, 3])
    expect(r2.version).toBe(r1.version + 1)

    const comments = await store.listComments(REQ_A)
    expect(comments.map((c) => c.id)).toEqual(['c-0', 'c-1', 'c-2'])
    expect(comments[2]!.createdBy).toEqual({ kind: 'human' })
    expect(comments[1]!.createdBy).toBeUndefined() // 缺省不伪造

    expect((await store.listComments(REQ_A, { since: 1, limit: 1 })).map((c) => c.id)).toEqual(['c-1'])
    const history = await store.listHistory(REQ_A)
    expect(history.map((h) => h.kind)).toEqual(['status', 'advance'])
    expect(history[1]).toEqual({ kind: 'advance', record: { at: 2, requirementId: REQ_A, event: 'RUN_SUBTASK', outcome: 'ok', durationMs: 1, detail: '' } })
    expect((await store.listHistory(REQ_A, { limit: 1 }))).toHaveLength(1)
  })

  it('mutate：读-改-写原子（version/revision 各 +1）；无变更不落盘', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A, { version: 4 })])
    const revBefore = (await store.head()).revision
    const res = await store.mutate(REQ_A, (draft) => {
      draft.title = '改过了'
      draft.comments.push({ id: 'c-x', body: '顺带评论', createdAt: 9 })
      return { changed: true }
    })
    expect(res.changed).toBe(true)
    expect(res.version).toBe(5)
    expect(res.requirement.version).toBe(5) // 返回的记录与落盘同版本（不回带旧版本）
    expect(res.revision).toBe(revBefore + 1)
    expect((await store.get(REQ_A))!.title).toBe('改过了')
    expect((await store.listComments(REQ_A)).map((c) => c.id)).toEqual(['c-x'])

    const quiet = await store.mutate(REQ_A, () => undefined)
    const quiet2 = await store.mutate(REQ_A, () => ({ changed: false }))
    expect([quiet.changed, quiet2.changed]).toEqual([false, false])
    expect(quiet.version).toBe(5)
    expect((await store.head()).revision).toBe(revBefore + 1)
    expect((await store.get(REQ_A))!.version).toBe(5)
  })

  it('单事务原子性：提交中途失败 → 整笔回滚（记录与日志行都不留痕）', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A, { title: '原样', version: 2 })])
    const circular: Record<string, unknown> = {}
    circular.self = circular
    // 先推一条评论（日志写入发生在记录写入**之前**用），再让 parts 序列化炸掉 → 整笔必须回滚
    await expect(store.mutate(REQ_A, (draft) => {
      draft.comments.push({ id: 'c-1', body: '第一笔', createdAt: 1 })
      ;(draft as unknown as Record<string, unknown>).dive = circular
      return { changed: true }
    })).rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED })

    const after = await store.get(REQ_A)
    expect(after!.title).toBe('原样')
    expect(after!.version).toBe(2)
    expect(after!.comments).toEqual([]) // 日志先写的那一行也回滚了
    expect(await store.listHistory(REQ_A)).toEqual([])
  })

  it('mutateIf：版本不符 → CONFLICT（带 currentVersion），且库内容分毫未动', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A, { version: 3, title: '原样' })])
    const ok = await store.mutateIf(REQ_A, 3, (draft) => {
      draft.title = '第一个写者'
      return { changed: true }
    })
    expect(ok.version).toBe(4)

    await expect(store.mutateIf(REQ_A, 3, (draft) => {
      draft.title = '第二个写者'
      return { changed: true }
    })).rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.CONFLICT, currentVersion: 4 })

    const after = await store.get(REQ_A)
    expect(after!.title).toBe('第一个写者') // 后者没有覆盖前者
    expect(after!.version).toBe(4)
    await expect(store.mutate('REQ-261004103399-ffff', () => ({ changed: true })))
      .rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.NOT_FOUND })
  })

  it('冷侧只读：归档记录的 mutate/appendComment 抛 COLD_IMMUTABLE，且内容不动', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_COLD, { status: 'archived', title: '归档件' })])
    await expect(store.mutate(REQ_COLD, (draft) => {
      draft.title = '偷改'
      return { changed: true }
    })).rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE })
    await expect(store.appendComment(REQ_COLD, { id: 'c', body: 'b', createdAt: 1 }))
      .rejects.toMatchObject({ code: REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE })
    expect((await store.get(REQ_COLD))!.title).toBe('归档件')
  })

  it('listSummaries：排序契约（updatedAt 降序 / 同刻 id 升序）+ 游标翻页无重无漏', async () => {
    const { store } = makeStore()
    await seed(store, [
      rec(REQ_A, { updatedAt: 300 }),
      rec(REQ_B, { updatedAt: 300 }),
      rec(REQ_COLD, { updatedAt: 100, status: 'implementing' }),
    ])
    const page = await store.listSummaries()
    expect(page.items.map((i) => i.id)).toEqual([REQ_A, REQ_B, REQ_COLD]) // 同刻按 id 升序

    const p1 = await store.listSummaries({ limit: 1 })
    const p2 = await store.listSummaries({ limit: 1, cursor: p1.nextCursor })
    const p3 = await store.listSummaries({ limit: 1, cursor: p2.nextCursor })
    expect([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).toEqual([REQ_A, REQ_B, REQ_COLD])
    expect(p3.nextCursor).toBeUndefined()
    expect((await store.listSummaries({ cursor: '不是游标' })).items).toEqual([])
    expect((await store.listSummaries({ cursor: 'idx:999' })).items).toEqual([])
  })

  it('冷热分层：默认 scope 不含归档；scope=all/archived 拿得到；冷侧不进 sweep 扫描集', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A), rec(REQ_COLD, { status: 'archived' })])
    expect((await store.listSummaries()).items.map((i) => i.id)).toEqual([REQ_A])
    expect((await store.listSummaries({ scope: 'archived' })).items.map((i) => i.id)).toEqual([REQ_COLD])
    expect((await store.listSummaries({ scope: 'all' })).items.map((i) => i.id).sort()).toEqual([REQ_A, REQ_COLD].sort())
    expect((await store.get(REQ_COLD))!.status).toBe('archived') // 深链要打得开

    await store.sweep('对账', (drafts) => {
      expect(drafts.map((d) => d.id)).toEqual([REQ_A])
      return []
    })
  })

  it('sweep：整批一个事务、只 bump 一次 revision；越界 id 忽略并告警', async () => {
    const warns: string[] = []
    const { store } = makeStore({ warns })
    await seed(store, [rec(REQ_A), rec(REQ_B), rec(REQ_COLD, { status: 'archived' })])
    const revBefore = (await store.head()).revision
    const res = await store.sweep('启动对账', (drafts) => {
      for (const d of drafts) d.title = '对账过'
      return [REQ_A, REQ_B, 'REQ-261004103399-eeee']
    })
    expect([...res.touched].sort()).toEqual([REQ_A, REQ_B].sort())
    expect(res.revision).toBe(revBefore + 1) // 一次批量 = 一次全局序
    expect((await store.get(REQ_A))!.title).toBe('对账过')
    expect(warns.some((w) => w.includes('REQ-261004103399-eeee'))).toBe(true)

    const nothing = await store.sweep('对账', () => [])
    expect(nothing).toEqual({ touched: [], revision: revBefore + 1 })
  })

  it('replaceAll：整体重建（旧记录消失、新记录就位、revision 用导入值、广播 ledger-replaced）', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A)])
    const seen: string[] = []
    store.subscribe((c) => seen.push(`${c.kind}:${c.requirementId}:${c.revision}`))
    await store.replaceAll('迁移导入', {
      schemaVersion: 9,
      revision: 99,
      requirements: [rec(REQ_B), richRecord(REQ_COLD)],
      triages: [{ sessionId: 'session-1' } as never],
    })
    expect(await store.get(REQ_A)).toBeUndefined()
    expect((await store.get(REQ_B))!.id).toBe(REQ_B)
    expect((await store.get(REQ_COLD))!.plan?.summary).toBe('s')
    expect((await store.head()).revision).toBe(99)
    expect(seen).toEqual([`ledger-replaced:${REQ_B}:99`, `ledger-replaced:${REQ_COLD}:99`])
    expect((await store.listTriages()).length).toBe(1)
    expect((await store.listTriages({ sessionId: 'session-1' })).length).toBe(1)
    expect((await store.listTriages({ sessionId: 'nope' })).length).toBe(0)
  })

  it('headAfterDrain：写返回即已落盘（同步 API 无 await 缝），读到刚写入的 revision', async () => {
    const { store } = makeStore()
    expect((await store.head()).revision).toBe(0)
    await store.create({ id: REQ_A, title: 't' }, { kind: 'agent' })
    const drained = await store.headAfterDrain()
    expect(drained.revision).toBe(1)
    expect(drained).toEqual(await store.head())
    expect(drained.schemaVersion).toBe(9) // 台账记录形态版本（与库表结构版本是两件事）
  })

  it('peekFacts：写提交后**同拍**刷新（读己所写），且只含热侧', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A, { description: '旧正文' }), rec(REQ_COLD, { status: 'archived' })])
    await store.listSummaries() // 先让索引就位（未建时 peek 允许空）
    expect(store.peekFacts().map((f) => f.id)).toEqual([REQ_A])

    await store.mutate(REQ_A, (draft) => {
      draft.description = '新正文'
      draft.dive = { activation: 'disarmed', phase: 'paused', roundsInStage: 9 }
      return { changed: true }
    })
    const facts = store.peekFacts() // 同步口：不加 await
    expect(facts[0]!.description).toBe('新正文')
    expect(facts[0]!.dive?.roundsInStage).toBe(9)
    expect(store.peekSummaries().map((s) => s.id)).toEqual([REQ_A])
  })

  it('subscribe：创建/改字段/移动/评论各自带上正确的 kind 与 revision；退订生效', async () => {
    const { store } = makeStore()
    await seed(store, [rec(REQ_A)])
    const seen: string[] = []
    const off = store.subscribe((c) => seen.push(`${c.kind}:${c.requirementId}:${c.revision}`))
    await store.create({ id: REQ_B, title: 't' }, { kind: 'agent' })
    await store.mutate(REQ_A, (draft) => {
      draft.title = 'x'
      return { changed: true }
    })
    await store.mutate(REQ_A, (draft) => {
      draft.status = 'accepting'
      return { changed: true }
    })
    await store.appendComment(REQ_A, { id: 'c-1', body: 'b', createdAt: 1 })
    off()
    await store.mutate(REQ_A, (draft) => {
      draft.title = 'y'
      return { changed: true }
    })
    expect(seen).toEqual([
      `requirement-created:${REQ_B}:2`,
      `requirement-updated:${REQ_A}:3`,
      `requirement-moved:${REQ_A}:4`,
      `comment-added:${REQ_A}:5`,
    ])
  })

  it('提交点计数与日志不符 → 告警并按库内有效行装配（不静默丢弃整条需求）', async () => {
    const warns: string[] = []
    const { store, file } = makeStore({ warns })
    await seed(store, [rec(REQ_A, { comments: [{ id: 'c-1', body: '一', createdAt: 1 }] })])
    // 手工把提交点计数改大（模拟"计数指向不存在的行"）
    const raw = new DatabaseSync(file)
    raw.prepare('UPDATE requirements SET comment_count = ? WHERE id = ?').run(5, REQ_A)
    raw.close()
    const got = await store.get(REQ_A)
    expect(got!.comments.map((c) => c.id)).toEqual(['c-1']) // 按有效行装配
    expect(warns.some((w) => w.includes('与提交点计数不符'))).toBe(true)
  })

  it('打开一个不是数据库的文件 → 结构化错误码（不静默当成空库）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-sqlite-baddb-'))
    dirs.push(dir)
    const file = join(dir, 'not-a-db.sqlite')
    writeFileSync(file, '这不是一个 SQLite 库，只是一段文本——用来验证错误映射。')
    let code: string | undefined
    try {
      new SqliteRequirementStore({ file })
    } catch (err) {
      code = (err as { code?: string }).code
    }
    expect([REQUIREMENT_STORE_ERROR.CORRUPT_SHARD, REQUIREMENT_STORE_ERROR.IO_FAILED]).toContain(code)
  })

  it('库表结构版本不匹配 → REQBOARD_SQLITE_SCHEMA_MISMATCH（不自动改表）', async () => {
    const { store, file } = makeStore()
    await seed(store, [rec(REQ_A)])
    store.close()
    const raw = new DatabaseSync(file)
    raw.prepare('UPDATE meta SET value = ? WHERE key = ?').run('999', SQLITE_META_KEYS.schemaVersion)
    raw.close()

    let code: string | undefined
    try {
      new SqliteRequirementStore({ file })
    } catch (err) {
      code = (err as { code?: string }).code
    }
    expect(code).toBe(SQLITE_SCHEMA_MISMATCH)

    // 库内容未被改动（"不自动改表"的可观测形式）
    const check = new DatabaseSync(file)
    const row = check.prepare('SELECT value FROM meta WHERE key = ?').get(SQLITE_META_KEYS.schemaVersion) as { value?: string }
    check.close()
    expect(row.value).toBe('999')
  })
})
