/**
 * L2 单测 · v9 单册 → v10 分片迁移（REQ-261002161439-277d · t6 / FR-8）。
 *
 * 卡上七条验收逐条落地（本文件用**真实文件系统 + 临时目录**：迁移是运维动作，
 * 用假 fs 测不出"mtime 不变""备份在场"这类真实性质）：
 * ① dry-run 零变化；② apply 后逐需求等价；③ migrations 留痕且再写一次仍在；
 * ④ 二次运行报 already_v10 且文件不变；⑤ 第 k 条写失败 → meta 未写、单册未动、备份在场；
 * ⑥ 服务在跑拒绝 apply、--force 跳过；⑦ 带非空 tasks 的单册被拒并指向 v9 脚本。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LEDGER_V10,
  isAlreadyV10,
  migrateToV10,
  readV9Ledger,
  serviceRunning,
  verifyV10,
} from '../../scripts/migrate-ledger-v10.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import { metaPath, recordPath } from '../../src/domain/requirement/ReqboardPaths.js'

let dir: string
let file: string
let out: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-v10-'))
  file = join(dir, 'dsh-reqboard.json')
  out = join(dir, 'reqboard')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const REQ_A = 'REQ-261002161439-277d'
const REQ_B = 'REQ-261002120707-deab'
const REQ_COLD = 'REQ-260930094139-2d65'

function v9Requirement(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `需求 ${id}`,
    description: '描述',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 3,
    createdAt: 100,
    updatedAt: 200,
    createdBy: { kind: 'agent' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

/** 一份有代表性的 v9 单册：2 条热侧（其一带评论/历史/产物/验收）+ 1 条归档。 */
function v9Ledger(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 9,
    revision: 42,
    triages: [],
    requirements: [
      v9Requirement(REQ_A, {
        comments: [
          { id: 'c-1', body: '第一条', createdAt: 1, createdBy: { kind: 'agent' } },
          { id: 'c-2', body: '第二条', createdAt: 2 },
          { id: 'c-3', body: '第三条', createdAt: 3 },
        ],
        statusHistory: [{ status: 'draft', at: 1, by: { kind: 'agent' } }, { status: 'implementing', at: 2, by: { kind: 'human' } }],
        artifacts: [
          { stage: 'design', kind: 'design', path: 'docs/requirements/x/design/architecture.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
          { stage: 'decomposing', kind: 'plan', path: 'docs/requirements/x/decomposition.md', registeredAt: 2, registeredBy: { kind: 'agent' } },
        ],
        verification: { summary: '验过了', evidence: ['cmd → ok'], submittedAt: 5, submittedBy: { kind: 'agent' }, sheet: { version: 2, items: [], generatedAt: 5, generatedBy: { kind: 'agent' } } },
      }),
      v9Requirement(REQ_B),
      v9Requirement(REQ_COLD, { status: 'archived' }),
    ],
    ...over,
  }
}

function writeLedger(ledger: Record<string, unknown>): void {
  writeFileSync(file, JSON.stringify(ledger, null, 2))
}

/** 全目录快照（路径 → mtimeMs + 字节数），用于"文件与 mtime 均无变化"。 */
function diskSnapshot(root: string): string {
  const out: string[] = []
  const walk = (p: string): void => {
    for (const name of readdirSync(p).sort()) {
      const full = join(p, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else out.push(`${full.slice(root.length)}=${st.mtimeMs}:${st.size}`)
    }
  }
  if (existsSync(root)) walk(root)
  return out.join('\n')
}

function shardStore(): ShardedRequirementStore {
  return new ShardedRequirementStore({ root: out, onWarn: () => { /* 迁移测试不关心告警 */ } })
}

const NOW = 1_700_000_000_000

// ---------------------------------------------------------------------------

describe('① dry-run：只看不动', () => {
  it('dry-run 后数据根不存在（连目录都不建），单册逐字节未变', async () => {
    writeLedger(v9Ledger())
    const before = readFileSync(file, 'utf8')
    const report = await migrateToV10(file, { out, now: NOW, dryRun: true })
    expect(report.mode).toBe('dry-run')
    expect(report.total).toBe(3)
    expect(report.hot).toBe(2)
    expect(report.cold).toBe(1)
    expect(existsSync(out)).toBe(false) // 一个目录都没建
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('② apply：逐需求等价', () => {
  it('评论条数与顺序、状态历史、产物顺序、验收单 version 逐项一致', async () => {
    writeLedger(v9Ledger())
    await migrateToV10(file, { out, now: NOW })
    const store = shardStore()

    const a = (await store.get(REQ_A))!
    expect(a.title).toBe(`需求 ${REQ_A}`)
    expect(a.version).toBe(3)
    expect(a.comments.map((c) => c.id)).toEqual(['c-1', 'c-2', 'c-3']) // 顺序
    expect(a.comments.map((c) => c.body)).toEqual(['第一条', '第二条', '第三条'])
    expect(a.comments[0]!.createdBy).toEqual({ kind: 'agent' })
    expect(a.statusHistory?.map((s) => s.status)).toEqual(['draft', 'implementing'])
    expect(a.artifacts?.map((x) => x.path)).toEqual([
      'docs/requirements/x/design/architecture.md',
      'docs/requirements/x/decomposition.md',
    ])
    expect(a.verification?.sheet?.version).toBe(2) // 验收单版本号
    expect(a.verification?.evidence).toEqual(['cmd → ok'])

    expect((await store.get(REQ_B))!.title).toBe(`需求 ${REQ_B}`)
    // 归档需求：热侧读不到（走冷读回落），状态与内容都在
    expect((await store.get(REQ_COLD))!.status).toBe('archived')
    // 归档只在 archive/ 下
    expect(existsSync(recordPath(out, REQ_COLD))).toBe(false)
    expect(existsSync(recordPath(out, REQ_COLD, { cold: true }))).toBe(true)
  })

  it('verifyV10 报等价（缺/多/字段不符三项都为空）', async () => {
    writeLedger(v9Ledger())
    await migrateToV10(file, { out, now: NOW })
    const result = await verifyV10(file, out)
    expect(result).toEqual({ ok: true, missing: [], extra: [], mismatched: [] })
  })
})

describe('③ 迁移留痕', () => {
  it('meta.json 含 {from:9,to:10}；迁移后再写一次数据留痕仍在', async () => {
    writeLedger(v9Ledger())
    await migrateToV10(file, { out, now: NOW, by: 'migrate-ledger-v10' })
    const meta = JSON.parse(readFileSync(metaPath(out), 'utf8')) as { schemaVersion: number; revision: number; migrations: { from: number; to: number; by: string }[] }
    expect(meta.schemaVersion).toBe(LEDGER_V10)
    expect(meta.revision).toBe(42) // 原值带过，不重置
    expect(meta.migrations).toContainEqual(expect.objectContaining({ from: 9, to: 10, by: 'migrate-ledger-v10' }))

    // 再写一次数据（revision bump）后留痕必须还在（v9 曾因读路径丢迁移留痕出过事故）
    const store = shardStore()
    await store.mutate(REQ_B, (d) => { d.title = '改一下'; return { changed: true } })
    const after = JSON.parse(readFileSync(metaPath(out), 'utf8')) as { migrations: { from: number; to: number }[] }
    expect(after.migrations).toContainEqual(expect.objectContaining({ from: 9, to: 10 }))
  })
})

describe('④ 幂等：连跑两次', () => {
  it('第二次报 already_v10，且所有文件的 mtime 与大小都不变', async () => {
    writeLedger(v9Ledger())
    await migrateToV10(file, { out, now: NOW })
    // 把 mtime 拨旧，任何重写都会让它变新（比"读一次再比"更硬）
    const old = new Date(NOW - 60_000)
    for (const p of [metaPath(out), recordPath(out, REQ_A), recordPath(out, REQ_B)]) utimesSync(p, old, old)
    const before = diskSnapshot(out)

    expect(isAlreadyV10(out)).toBe(true)
    const second = await migrateToV10(file, { out, now: NOW + 1000 })
    expect(second.total).toBe(0) // already_v10：报告为空
    expect(diskSnapshot(out)).toBe(before) // mtime 与字节数全部不变
  })
})

describe('⑤ 中途失败：提交点未写、单册未动、备份在场', () => {
  it('第 2 条需求写失败 → meta.json 不存在、原单册逐字节不变、备份已生成', async () => {
    writeLedger(v9Ledger())
    const before = readFileSync(file, 'utf8')
    let writes = 0
    class FlakyRepo extends RequirementShardRepository {
      override async writeRecordAtomic(...args: Parameters<RequirementShardRepository['writeRecordAtomic']>): Promise<void> {
        writes += 1
        if (writes === 2) throw Object.assign(new Error('注入：第 2 条写失败'), { code: 'REQBOARD_IO_FAILED' })
        return super.writeRecordAtomic(...args)
      }
    }
    await expect(
      migrateToV10(file, { out, now: NOW, repository: new FlakyRepo() }),
    ).rejects.toThrow(/注入/)

    expect(existsSync(metaPath(out))).toBe(false) // 提交点未写 → 重跑可从头重放
    expect(readFileSync(file, 'utf8')).toBe(before) // 单册未被触碰
    expect(existsSync(`${file}.backup-${NOW}`)).toBe(true) // 备份在场
  })
})

describe('⑥ 服务存活探测', () => {
  it('state/server.pid 存活 → 拒绝 --apply（serviceRunning 为真）', () => {
    writeLedger(v9Ledger())
    mkdirSync(join(dir, 'state'), { recursive: true })
    writeFileSync(join(dir, 'state', 'server.pid'), String(process.pid)) // 本进程一定活着
    expect(serviceRunning(file)).toBe(true)
  })

  it('pid 文件不存在或进程已死 → 不拦', () => {
    writeLedger(v9Ledger())
    expect(serviceRunning(file)).toBe(false)
    mkdirSync(join(dir, 'state'), { recursive: true })
    writeFileSync(join(dir, 'state', 'server.pid'), '999999') // 几乎不可能存在的 pid
    expect(serviceRunning(file)).toBe(false)
  })
})

describe('⑦ 前置版本门', () => {
  it('带非空 tasks 的单册被拒，且提示指向 scripts/migrate-ledger.ts', () => {
    writeLedger(v9Ledger({ schemaVersion: 8, tasks: [{ id: 't-000001' }] }))
    let message = ''
    try {
      readV9Ledger(file)
    } catch (err) {
      message = (err as Error).message
      expect((err as { code?: string }).code).toBe('LEDGER_REQUIRES_V9_FIRST')
    }
    expect(message).toContain('migrate-ledger.ts')
    expect(message).toContain('queue.json')
  })

  it('空 tasks 不算迁移前（不误拦）', () => {
    writeLedger(v9Ledger({ tasks: [] }))
    expect(readV9Ledger(file).requirements).toHaveLength(3)
  })

  it('无法装配的需求被跳过并计入报告（不静默丢）', async () => {
    writeLedger(v9Ledger({ requirements: [...(v9Ledger().requirements as unknown[]), { id: 'REQ-261002111111-aaaa' }] }))
    const report = await migrateToV10(file, { out, now: NOW })
    expect(report.skipped.map((s) => s.id)).toEqual(['REQ-261002111111-aaaa'])
    expect(report.skipped[0]!.why).toContain('title')
    expect(report.total).toBe(4)
    expect(report.hot + report.cold).toBe(3)
  })
})
