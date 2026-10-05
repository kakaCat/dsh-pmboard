/**
 * 分片台账 → SQLite 库 一次性迁移的验收用例（REQ-261004103330-005f · t9）。
 *
 * ## 这份测试钉的是什么
 *
 * 迁移是"切库"链路里唯一真正搬数据的一环，所以第一要求不是"搬成功"，而是
 * **失败也不伤源数据**：
 *   ① 成功路径：条数 + id 集合 + 逐字段深比较一致；
 *   ② `--dry-run`：源分片与设置文件**内容哈希逐字节不变**，目标库不出现；
 *   ③ 注入校验失败：退出码 3、**源与设置逐字节不变**、目标库未被创建、暂存库已清；
 *   ④ 陈旧库：明确提示"先备份旧库再全量重建"，且旧库备份文件真的在盘上；
 *   ⑤ 预检不过（源不是分片布局）：退出码 2，不写任何东西；
 *   ⑥ `--write-settings`：只有它才写设置；不传就不建设置文件。
 *
 * 全部用临时目录，结束即清理。
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { SqliteRequirementStore } from '../../src/repositories/SqliteRequirementStore.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import { seedShard } from './fake-shard-fs.js'
import { MIGRATE_EXIT, migrateLedgerToSqlite } from '../../scripts/migrate-ledger-to-sqlite.js'
import { REQBOARD_SCHEMA_VERSION, type RequirementRecord } from '../../src/shared/protocol.js'

const TMP: string[] = []

function tmpRoot(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-migrate-${tag}-`))
  TMP.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of TMP) rmSync(dir, { recursive: true, force: true })
})

function mkRecord(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  const base = {
    id,
    title: '需求 ' + id,
    description: '描述 ' + id,
    status: 'draft',
    category: 'feature',
    promptDifficulty: 'standard',
    version: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    comments: [{ seq: 0, id: 'c-1', body: '第一条评论', createdAt: 1_700_000_050_000, createdBy: { kind: 'human' } }],
    statusHistory: [{ seq: 0, kind: 'status', status: 'draft', at: 1_700_000_000_000, by: { kind: 'human' } }],
    blocked: false,
  }
  return { ...base, ...over } as unknown as RequirementRecord
}

const ID_A = 'REQ-261001010000-aaaa'
const ID_B = 'REQ-261001010000-bbbb'

/** 造一个真实的分片数据根（真盘：迁移脚本走的是真文件系统）。 */
async function seedSource(root: string, records: readonly RequirementRecord[]): Promise<void> {
  const repo = new RequirementShardRepository({ now: () => 1_700_000_200_000, onWarn: () => {} })
  for (const record of records) await seedShard(repo, root, { record })
  await repo.writeMeta(root, { schemaVersion: 10, revision: 7 })
}

/** 目录内容哈希（相对路径 + 文件内容）：用来断言"逐字节未变"。 */
function hashTree(dir: string): string {
  const h = createHash('sha256')
  if (!existsSync(dir)) return h.update('(missing)').digest('hex')
  for (const rel of (readdirSync(dir, { recursive: true }) as string[]).sort()) {
    const abs = join(dir, rel)
    h.update(rel)
    if (statSync(abs).isFile()) h.update(readFileSync(abs))
  }
  return h.digest('hex')
}

function hashFile(file: string): string {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : '(missing)'
}

/**
 * 读源分片里的全部需求（**迁移等价的基准**）。
 *
 * 为什么基准是"源读"而不是我手写的字面量：分片日志对 `comments[].seq` 与
 * `statusHistory[].seq/kind` 是**位置隐含**的（读回时不带这两个字段）。手写字面量会因为
 * 这几个字段多出来而误报不一致；而迁移要保证的是"源读 == 目标读"，不是"目标读 == 我脑子里的形状"。
 */
async function readShards(root: string): Promise<RequirementRecord[]> {
  const sharded = new ShardedRequirementStore({ root, onWarn: () => {} })
  const page = await sharded.listSummaries({ scope: 'all', limit: 100_000 })
  const out: RequirementRecord[] = []
  for (const item of page.items) {
    const rec = await sharded.get(item.id)
    if (rec !== undefined) out.push(rec)
  }
  return out
}

/** 读回库里的全部需求（逐条权威读）。 */
async function readBack(file: string): Promise<RequirementRecord[]> {
  const store = new SqliteRequirementStore({ file, onWarn: () => {} })
  try {
    const page = await store.listSummaries({ scope: 'all', limit: 100_000 })
    const out: RequirementRecord[] = []
    for (const item of page.items) {
      const rec = await store.get(item.id)
      if (rec !== undefined) out.push(rec)
    }
    return out
  } finally {
    store.close()
  }
}

describe('迁移脚本 · 成功路径', () => {
  it('条数与 id 全等，逐字段一致；源分片有备份', async () => {
    const work = tmpRoot('ok')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B, { status: 'archived' })])

    const lines: string[] = []
    const report = await migrateLedgerToSqlite({
      from: source,
      dshHome: home,
      now: 1_700_000_300_000,
      onLog: (l) => lines.push(l),
    })

    expect(report.code).toBe(MIGRATE_EXIT.ok)
    expect(existsSync(report.target)).toBe(true)
    expect(report.backupDir !== undefined && existsSync(report.backupDir)).toBe(true)

    const stored = await readBack(report.target)
    const fromSource = await readShards(source)
    expect(stored.map((r) => r.id).sort()).toEqual(fromSource.map((r) => r.id).sort())
    expect(stored).toHaveLength(2)
    for (const rec of stored) {
      const original = fromSource.find((r) => r.id === rec.id)
      // 逐字段深比较：基准是**源读**（迁移要保证的正是这条）
      expect(isDeepStrictEqual(rec, original)).toBe(true)
    }
    expect(lines.join('\n')).toContain('⑥ 校验通过')
  })
})

describe('迁移脚本 · dry-run 不写盘', () => {
  it('源分片与设置文件内容哈希不变，目标库不出现', async () => {
    const work = tmpRoot('dry')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A)])
    mkdirSync(home, { recursive: true })
    const settings = join(home, 'dsh-reqboard-settings.json')
    writeFileSync(settings, JSON.stringify({ schemaVersion: 1, stageMaxRounds: { implementing: 7 } }, null, 2))

    const srcBefore = hashTree(source)
    const setBefore = hashFile(settings)
    const report = await migrateLedgerToSqlite({ from: source, dshHome: home, dryRun: true })

    expect(report.code).toBe(MIGRATE_EXIT.ok)
    expect(report.reason).toContain('dry-run')
    expect(hashTree(source)).toBe(srcBefore)
    expect(hashFile(settings)).toBe(setBefore)
    expect(existsSync(join(home, 'reqboard.sqlite'))).toBe(false)
    expect(existsSync(join(home, 'backups'))).toBe(false)
    // 「不写任何文件」这句要把**档案**也算进去：否则 dry-run 会悄悄留下一条 migration 事件
    expect(existsSync(join(home, 'dsh-reqboard-system.json'))).toBe(false)
  })
})

describe('迁移脚本 · 失败不伤源数据', () => {
  it('注入校验不过 → 退出码 3、源与设置逐字节不变、目标库未创建、暂存库已清', async () => {
    const work = tmpRoot('verify-fail')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B)])
    mkdirSync(home, { recursive: true })
    const settings = join(home, 'dsh-reqboard-settings.json')
    writeFileSync(settings, '{"schemaVersion":1}')

    const srcBefore = hashTree(source)
    const setBefore = hashFile(settings)
    const lines: string[] = []
    const report = await migrateLedgerToSqlite({
      from: source,
      dshHome: home,
      now: 1_700_000_400_000,
      onLog: (l) => lines.push(l),
      // 注入：逐字段比较恒不相等 ⇒ 第 ⑥ 步不过
      seams: { deepEqual: () => false },
    })

    expect(report.code).toBe(MIGRATE_EXIT.verify)
    expect(hashTree(source)).toBe(srcBefore)
    expect(hashFile(settings)).toBe(setBefore)
    expect(existsSync(join(home, 'reqboard.sqlite'))).toBe(false)
    const leftovers = (readdirSync(home, { recursive: true }) as string[]).filter((f) => f.includes('.migrating-'))
    expect(leftovers).toEqual([])
    expect(lines.join('\n')).toContain('已回滚')
  })

  it('源不是分片布局（缺 meta.json）→ 退出码 2，不建库不备份；但档案仍留一条 failed', async () => {
    const work = tmpRoot('preflight')
    const source = join(work, 'not-shards')
    const home = join(work, 'home')
    mkdirSync(source, { recursive: true })

    const report = await migrateLedgerToSqlite({ from: source, dshHome: home })
    expect(report.code).toBe(MIGRATE_EXIT.preflight)
    expect(existsSync(join(home, 'backups'))).toBe(false)
    expect(existsSync(join(home, 'reqboard.sqlite'))).toBe(false)
    // ⑨ 留痕与"不建库"不矛盾：台账没被碰，档案记下"这次迁移没成"（否则人呢查不到失败过）
    expect(migrationEvents(home)).toHaveLength(1)
    expect(migrationEvents(home)[0].result).toBe('failed')
  })
})

describe('迁移脚本 · 陈旧库', () => {
  it('旧库条数少 → 提示先备份再重建，且旧库备份文件在盘上；重建后条数追上', async () => {
    const work = tmpRoot('stale')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    const target = join(home, 'reqboard.sqlite')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B)])
    mkdirSync(home, { recursive: true })

    // 先造一个"只有 1 条"的旧库（模拟回滚后遗留的陈旧库）
    const old = new SqliteRequirementStore({ file: target, onWarn: () => {} })
    try {
      await old.replaceAll('seed-old', {
        schemaVersion: REQBOARD_SCHEMA_VERSION,
        revision: 1,
        requirements: [mkRecord(ID_A)],
        triages: [],
      } as never)
    } finally {
      old.close()
    }

    const lines: string[] = []
    const report = await migrateLedgerToSqlite({
      from: source,
      dshHome: home,
      now: 1_700_000_500_000,
      onLog: (l) => lines.push(l),
    })

    expect(report.code).toBe(MIGRATE_EXIT.ok)
    expect(report.staleReason).toBeDefined()
    expect(lines.join('\n')).toContain('检出陈旧库')
    expect(report.previousDbBackup !== undefined && existsSync(report.previousDbBackup)).toBe(true)
    expect((await readBack(target)).map((r) => r.id).sort()).toEqual([ID_A, ID_B].sort())
  })
})

describe('迁移脚本 · 写设置', () => {
  it('只有传 --write-settings 才写；不传则不建设置文件', async () => {
    const work = tmpRoot('settings')
    const source = join(work, 'reqboard')
    const homeYes = join(work, 'home-yes')
    const homeNo = join(work, 'home-no')
    await seedSource(source, [mkRecord(ID_A)])

    const yes = await migrateLedgerToSqlite({ from: source, dshHome: homeYes, writeSettings: true, now: 1_700_000_600_000 })
    expect(yes.code).toBe(MIGRATE_EXIT.ok)
    const settingsFile = join(homeYes, 'dsh-reqboard-settings.json')
    expect(existsSync(settingsFile)).toBe(true)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).storage.backend).toBe('sqlite')

    const no = await migrateLedgerToSqlite({ from: source, dshHome: homeNo, now: 1_700_000_700_000 })
    expect(no.code).toBe(MIGRATE_EXIT.ok)
    expect(existsSync(join(homeNo, 'dsh-reqboard-settings.json'))).toBe(false)
  })
})

describe('迁移脚本 · 源分片只读', () => {
  it('迁移前后源目录哈希逐字节一致（哪怕库已顶上）', async () => {
    const work = tmpRoot('readonly')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B)])
    const before = hashTree(source)
    const report = await migrateLedgerToSqlite({ from: source, dshHome: home, now: 1_700_000_800_000 })
    expect(report.code).toBe(MIGRATE_EXIT.ok)
    expect(hashTree(source)).toBe(before)
  })
})

/** 备份目录里应当含完整的分片镜像（不是只写个空壳）。 */
describe('迁移脚本 · 备份内容完整', () => {
  it('备份目录里有 meta.json 与每条需求的 record.json', async () => {
    const work = tmpRoot('backup')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B)])
    const report = await migrateLedgerToSqlite({ from: source, dshHome: home, now: 1_700_000_900_000 })
    expect(report.code).toBe(MIGRATE_EXIT.ok)
    const dir = report.backupDir!
    expect(existsSync(join(dir, 'meta.json'))).toBe(true)
    const mirrored = hashTree(source)
    const copied = hashTree(dir)
    expect(copied).toBe(mirrored)
    // 顺手确认 cpSync 真的搬了子目录（而不是只建了顶层）
    cpSync(source, join(work, 'again'), { recursive: true })
    expect(hashTree(join(work, 'again'))).toBe(mirrored)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// ⑨ 系统记录留痕（FR-14「迁移留档」）
// ─────────────────────────────────────────────────────────────────────────

/** 读系统记录里的 migration 事件（不存在则空数组）。 */
function migrationEvents(home: string): Array<Record<string, unknown>> {
  const file = join(home, 'dsh-reqboard-system.json')
  if (!existsSync(file)) return []
  const rec = JSON.parse(readFileSync(file, 'utf8')) as { history?: Array<Record<string, unknown>> }
  return (rec.history ?? []).filter((e) => e.event === 'migration')
}

describe('迁移脚本 · 系统记录留痕', () => {
  it('成功 → 档案里出现一条 migration/ok，条数、备份目录、耗时都对', async () => {
    const work = tmpRoot('rec-ok')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A), mkRecord(ID_B, { status: 'archived' })])

    const report = await migrateLedgerToSqlite({ from: source, dshHome: home, now: 1_700_000_500_000 })
    expect(report.code).toBe(MIGRATE_EXIT.ok)

    const events = migrationEvents(home)
    expect(events).toHaveLength(1)
    const e = events[0]
    expect(e.result).toBe('ok')
    expect(e.requirements).toBe(2)
    expect(e.backupDir).toBe(report.backupDir)
    expect(typeof e.durationMs).toBe('number')
    expect(e.error).toBeUndefined()
    // 形状不新造：字段与既有 migration 分支一致
    expect(e.from).toBe('json')
    expect(e.to).toBe('sqlite')
    expect(typeof e.at).toBe('string')
    expect((e.plugin as { version?: string }).version).toBeTruthy()
  })

  it('失败（校验不过）→ 档案里是 migration/failed 且带原因；退出码仍是 3', async () => {
    const work = tmpRoot('rec-fail')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A)])

    const report = await migrateLedgerToSqlite({
      from: source, dshHome: home, now: 1_700_000_600_000,
      seams: { deepEqual: () => false },
    })
    expect(report.code).toBe(MIGRATE_EXIT.verify)

    const events = migrationEvents(home)
    expect(events).toHaveLength(1)
    expect(events[0].result).toBe('failed')
    expect(String(events[0].error)).toContain('校验不过')
    expect(existsSync(join(home, 'reqboard.sqlite'))).toBe(false)
  })

  it('留痕写不进去 → 退出码语义不变（仍 0），且有告警', async () => {
    const work = tmpRoot('rec-unwritable')
    const source = join(work, 'reqboard')
    const home = join(work, 'home')
    await seedSource(source, [mkRecord(ID_A)])
    // 注入：把记录文件的位置占成**目录**（写它必然失败，而迁移本身照常能跑完）
    mkdirSync(home, { recursive: true })
    mkdirSync(join(home, 'dsh-reqboard-system.json'), { recursive: true })

    const lines: string[] = []
    const report = await migrateLedgerToSqlite({
      from: source, dshHome: home, now: 1_700_000_700_000, onLog: (l) => lines.push(l),
    })

    // 第一要求：迁移结论不被档案故障改写
    expect(report.code).toBe(MIGRATE_EXIT.ok)
    expect(existsSync(report.target)).toBe(true)
    expect(lines.join('\n')).toMatch(/系统记录/)
  })
})
