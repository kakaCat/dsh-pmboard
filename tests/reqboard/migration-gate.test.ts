/**
 * L2 单测 · 迁移门（REQ-261002161439-277d · t8 验收④ / FR-8）。
 *
 * 验收原文：「夹具数据根只放 v9 单册时启动抛 `REQBOARD_REQUIRES_MIGRATION`
 * 且**不生成 requirements/ 目录**（测试断言）」。
 *
 * 本文件用真实临时目录（这道门的全部价值就在"绝不静默起空台账、绝不留下副作用"，
 * 用假 fs 测不出"目录有没有被建出来"）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { SQLITE_DDL } from '../../src/repositories/sqliteSchema.js'
import { join } from 'node:path'
import { REQUIRES_MIGRATION, REQUIRES_SQLITE_MIGRATION, V10_META_FILE, assertLedgerMigrated, preflightLedger } from '../../src/repositories/migrationGate.js'

let dir: string
let dataRoot: string
let ledgerFile: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-gate-'))
  dataRoot = join(dir, 'reqboard')
  ledgerFile = join(dir, 'dsh-reqboard.json')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const v9Ledger = { schemaVersion: 9, revision: 7, requirements: [{ id: 'REQ-261002161439-277d' }], triages: [] }

describe('迁移门：三种情形', () => {
  it('只有 v9 单册（无 meta）→ 抛 REQBOARD_REQUIRES_MIGRATION，且**不生成** requirements/ 目录', () => {
    writeFileSync(ledgerFile, JSON.stringify(v9Ledger))
    let code: string | undefined
    let message = ''
    try {
      assertLedgerMigrated({ dataRoot, ledgerFile })
    } catch (err) {
      code = (err as { code?: string }).code
      message = (err as Error).message
    }
    expect(code).toBe(REQUIRES_MIGRATION)
    expect(message).toContain('migrate-ledger-v10.ts') // 给出可执行的恢复路径
    expect(message).toContain(ledgerFile) // 点名是哪份单册

    // 关键：不留下任何副作用——数据根连建都不该建
    expect(existsSync(dataRoot)).toBe(false)
    expect(existsSync(join(dataRoot, 'requirements'))).toBe(false)
    expect(existsSync(join(dataRoot, V10_META_FILE))).toBe(false)
  })

  it('数据根已有 meta.json（迁移完成）→ 放行，单册留着也不拦', () => {
    mkdirSync(dataRoot, { recursive: true })
    writeFileSync(join(dataRoot, V10_META_FILE), JSON.stringify({ schemaVersion: 10, revision: 7 }))
    writeFileSync(ledgerFile, JSON.stringify(v9Ledger)) // 单册还在（作为导出格式）
    expect(assertLedgerMigrated({ dataRoot, ledgerFile })).toBe(true)
  })

  it('既无单册也无数据根（全新安装）→ 放行，且不建目录', () => {
    expect(assertLedgerMigrated({ dataRoot, ledgerFile })).toBe(true)
    expect(existsSync(dataRoot)).toBe(false)
  })

  it('门是只读的：放行路径也不产生任何新文件', () => {
    mkdirSync(dataRoot, { recursive: true })
    writeFileSync(join(dataRoot, V10_META_FILE), JSON.stringify({ schemaVersion: 10, revision: 1 }))
    const before = readdirSync(dataRoot).sort()
    assertLedgerMigrated({ dataRoot, ledgerFile })
    expect(readdirSync(dataRoot).sort()).toEqual(before)
  })
})

/**
 * REQ-261003191948-e94a · t1 / FR-1、FR-3。
 *
 * 为什么单列一组：抛错版只能表达"我拒绝了"，而装配方需要的是"**还没准备好**"这个可分支的事实。
 * 本组锁三件事：① 预检不抛错、不建目录；② `hint` 里是代入真实路径的可复制命令；
 * ③ 两个入口**同源**（ok 判定一致、message 逐字相同）——否则迟早长出第二份判据。
 */
describe('迁移门预检：同一份判据的两种用法（REQ-261003191948-e94a t1）', () => {
  /** 按夹具摆放文件：ledger-only = 只放单册；both = 单册 + meta；neither = 什么都不放。 */
  const arrange = (kind: 'ledger-only' | 'both' | 'neither'): void => {
    rmSync(dataRoot, { recursive: true, force: true })
    rmSync(ledgerFile, { force: true })
    if (kind === 'ledger-only' || kind === 'both') writeFileSync(ledgerFile, JSON.stringify(v9Ledger))
    if (kind === 'both') {
      mkdirSync(dataRoot, { recursive: true })
      writeFileSync(join(dataRoot, V10_META_FILE), JSON.stringify({ schemaVersion: 10, revision: 7 }))
    }
  }

  it('三态判定：只返回数据、不抛错，且不建任何目录', () => {
    arrange('ledger-only')
    const only = preflightLedger({ dataRoot, ledgerFile })
    expect(only.ok).toBe(false)
    if (only.ok) throw new Error('unreachable：ledger-only 必须 ok:false')
    expect(only.failure.code).toBe(REQUIRES_MIGRATION)
    expect(existsSync(dataRoot)).toBe(false)

    arrange('both')
    expect(preflightLedger({ dataRoot, ledgerFile }).ok).toBe(true)

    arrange('neither')
    expect(preflightLedger({ dataRoot, ledgerFile }).ok).toBe(true)
    expect(existsSync(dataRoot)).toBe(false)
  })

  it('hint 是代入真实路径的可复制命令（不含 <单册>/<数据根> 占位符）', () => {
    arrange('ledger-only')
    const r = preflightLedger({ dataRoot, ledgerFile })
    expect(r.ok).toBe(false)
    const hint = r.ok ? '' : r.failure.hint
    expect(hint).toContain('migrate-ledger-v10.ts')
    expect(hint).toContain('--apply') // 缺它脚本默认 dry-run，用户会以为"跑了没反应"
    expect(hint).toContain(ledgerFile) // 真实单册路径
    expect(hint).toContain(dataRoot) // 真实数据根路径
    expect(hint).not.toContain('<单册>')
    expect(hint).not.toContain('<数据根>')
  })

  it('同源：抛错 ⟺ ok:false，且 message 逐字相等', () => {
    for (const kind of ['ledger-only', 'both', 'neither'] as const) {
      arrange(kind)
      let threw = false
      let message = ''
      try {
        assertLedgerMigrated({ dataRoot, ledgerFile })
      } catch (err) {
        threw = true
        message = (err as Error).message
      }
      const preflight = preflightLedger({ dataRoot, ledgerFile })
      expect(threw, kind + '：抛错与否必须与 ok 判定一致').toBe(!preflight.ok)
      if (!preflight.ok) {
        expect(message, kind + '：两种用法的 message 必须逐字相等').toBe(preflight.failure.message)
      }
    }
  })
})

/**
 * REQ-261004103330-005f FR-12：**第二种未就绪**（已选 SQLite 而库不可用、分片却有数据）。
 *
 * 与上面那组的分工：上面测"单册在场、分片未迁移"，本组测"库不可用、分片有数据"。
 * 两条文案必须**互不出现**——它们要跑的是不同脚本、动的是不同数据，共用模板必然让其中一条给出错命令。
 */
describe('迁移门：第二种未就绪（SQLite 目标不可用）', () => {
  const seed = async (count: number): Promise<void> => {
    // 必须用**真盘**：迁移门的探针走真实文件系统，喂内存假 fs 会让门看到"0 条"（本卡实测踩过）
    const { RequirementShardRepository } = await import('../../src/repositories/RequirementShardRepository.js')
    const { seedShard } = await import('./fake-shard-fs.js')
    const repo = new RequirementShardRepository({ now: () => 1, onWarn: () => {} })
    await repo.writeMeta(dataRoot, { schemaVersion: 10, revision: 3 })
    for (let i = 0; i < count; i++) {
      await seedShard(repo, dataRoot, {
        record: {
          id: 'REQ-2610010100' + String(10 + i) + '-abcd', title: 't' + String(i), description: '',
          status: 'draft', category: 'feature', promptDifficulty: 'standard', version: 1,
          createdAt: 1, updatedAt: 1, createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
          comments: [], statusHistory: [], artifacts: [], blocked: false,
        } as never,
      })
    }
  }

  const makeUsableSqlite = (file: string): void => {
    const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as new (f: string) => {
      exec: (s: string) => void
      prepare: (s: string) => { run: (...a: unknown[]) => unknown }
      close: () => void
    }
    const db = new DatabaseSync(file)
    for (const ddl of SQLITE_DDL) db.exec(ddl)
    db.prepare('INSERT INTO requirements (id, title, status, version, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run('REQ-261001010000-abcd', 'x', 'draft', 1, 1, 1)
    db.close()
  }

  it('库不存在 + 分片有数据 → 未就绪，且指引指向 SQLite 迁移脚本（真实路径内联）', async () => {
    await seed(2)
    const sqliteFile = join(dir, 'reqboard.sqlite')
    const r = preflightLedger({ dataRoot, ledgerFile, backend: 'sqlite', sqliteFile })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.failure.code).toBe(REQUIRES_SQLITE_MIGRATION)
    expect(r.failure.hint).toContain('migrate-ledger-to-sqlite.ts')
    expect(r.failure.hint).toContain('--from ' + dataRoot)
    expect(r.failure.hint).toContain('--to ' + sqliteFile)
    expect(r.failure.hint).toContain('--write-settings')
    expect(r.failure.sqliteFile).toBe(sqliteFile)
  })

  it('**两条文案互不出现**：SQLite 那份不提 v10 脚本，单册那份不提 SQLite 脚本', async () => {
    // 让两种未就绪**同时成立**：分片有数据（>0 条）但**没有 meta.json**，且单册在场。
    // 这样同一份夹具能同时问两条门，才谈得上"两条文案互不出现"。
    await seed(1)
    rmSync(join(dataRoot, V10_META_FILE), { force: true })
    writeFileSync(ledgerFile, JSON.stringify(v9Ledger))
    const sqliteFile = join(dir, 'reqboard.sqlite')

    const sqliteCase = preflightLedger({ dataRoot, ledgerFile, backend: 'sqlite', sqliteFile })
    expect(sqliteCase.ok).toBe(false)
    const ledgerCase = preflightLedger({ dataRoot, ledgerFile: ledgerFile })
    expect(ledgerCase.ok).toBe(false)
    if (sqliteCase.ok || ledgerCase.ok) return

    expect(sqliteCase.failure.code).toBe(REQUIRES_SQLITE_MIGRATION)
    expect(ledgerCase.failure.code).toBe(REQUIRES_MIGRATION)
    // 互不出现：两种文档里各自只认自己的脚本名
    expect(sqliteCase.failure.message).not.toContain('migrate-ledger-v10')
    expect(sqliteCase.failure.hint).not.toContain('migrate-ledger-v10')
    expect(ledgerCase.failure.message).not.toContain('migrate-ledger-to-sqlite')
    expect(ledgerCase.failure.hint).not.toContain('migrate-ledger-to-sqlite')
  })

  it('库可用（有数据）→ 放行；库不存在但分片也空 → 放行（全新安装）', async () => {
    await seed(1)
    const sqliteFile = join(dir, 'reqboard.sqlite')
    makeUsableSqlite(sqliteFile)
    expect(preflightLedger({ dataRoot, ledgerFile, backend: 'sqlite', sqliteFile }).ok).toBe(true)

    const freshRoot = join(dir, 'fresh')
    expect(preflightLedger({ dataRoot: freshRoot, ledgerFile, backend: 'sqlite', sqliteFile: join(dir, 'none.sqlite') }).ok).toBe(true)
  })

  it('抛错外壳同样产出新码（两种用法同源）', async () => {
    await seed(1)
    const sqliteFile = join(dir, 'reqboard.sqlite')
    let code = ''
    try {
      assertLedgerMigrated({ dataRoot, ledgerFile, backend: 'sqlite', sqliteFile })
    } catch (err) {
      code = String((err as { code?: string }).code)
    }
    expect(code).toBe(REQUIRES_SQLITE_MIGRATION)
  })

  it('显式 backend=json 不影响既有判定（逐字回到改造前）', async () => {
    await seed(1) // 有分片、无单册
    expect(preflightLedger({ dataRoot, ledgerFile, backend: 'json' }).ok).toBe(true)
  })
})
