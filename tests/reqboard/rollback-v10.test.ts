/**
 * L2 单测 · v10 分片 → legacy v9 单册（REQ-261002161439-277d · t7 / FR-8）。
 *
 * 卡上验收（A11 及其细分）：
 * - **A11** 迁移前单册 → `migrate --apply` → `rollback --apply` → 用 `readV9Ledger` 装载导出结果：
 *   需求条数与 id 集合与迁移前**完全一致**；
 * - 归档需求（冷侧）也随导出回到单册，且内联字段完整；
 * - 导出文件 `schemaVersion === 9`，且**不含** commentCount/historyCount/artifactCount；
 * - `--dry-run` 不写文件；
 * - 回滚后目标数据根可被迁移脚本**再次 apply**（往返一致）。
 *
 * 为什么这条测试是"可回滚"的唯一证据：FR-8 要求的是"旧版插件仍能读到数据"，
 * 而"旧版读路径"在本仓就是 `readV9Ledger`（它内置了 v9 的迁移门与结构判据）。
 * 导出文件能被它装载 + 内容与原单册等价，才算真的回得去。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateToV10, readV9Ledger, LEDGER_V9 } from '../../scripts/migrate-ledger-v10.js'
import { exportV9, rollbackToV9 } from '../../scripts/rollback-ledger-v10.js'
import { metaPath } from '../../src/domain/requirement/ReqboardPaths.js'

let dir: string
let file: string
let out: string
let exported: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-rb-'))
  file = join(dir, 'dsh-reqboard.json')
  out = join(dir, 'reqboard')
  exported = join(dir, 'rollback.json')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const REQ_A = 'REQ-261002161439-277d'
const REQ_B = 'REQ-261002120707-deab'
const REQ_COLD = 'REQ-260930094139-2d65'
const NOW = 1_700_000_000_000

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

/** 有代表性的 v9 单册：2 热（其一带全套大字段）+ 1 归档 + 非空 triages。 */
function v9Ledger(): { schemaVersion: number; revision: number; triages: unknown[]; requirements: Record<string, unknown>[] } {
  return {
    schemaVersion: 9,
    revision: 42,
    triages: [{ id: 'tri-1', status: 'pending', title: '一条分诊' }],
    requirements: [
      v9Requirement(REQ_A, {
        comments: [
          { id: 'c-1', body: '第一条', createdAt: 1, createdBy: { kind: 'agent' } },
          { id: 'c-2', body: '第二条', createdAt: 2 },
        ],
        statusHistory: [{ status: 'draft', at: 1, by: { kind: 'agent' } }, { status: 'implementing', at: 2, by: { kind: 'human' } }],
        artifacts: [
          { stage: 'design', kind: 'design', path: 'docs/a.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
          { stage: 'decomposing', kind: 'plan', path: 'docs/b.md', registeredAt: 2, registeredBy: { kind: 'agent' } },
        ],
        plan: { path: 'docs/b.md', summary: '计划', tasks: [{ key: 't1', title: '卡一' }], submittedAt: 3, submittedBy: { kind: 'agent' } },
        verification: { summary: '验过了', evidence: ['cmd → ok'], submittedAt: 5, submittedBy: { kind: 'agent' }, sheet: { version: 2, items: [], generatedAt: 5, generatedBy: { kind: 'agent' } } },
      }),
      v9Requirement(REQ_B),
      v9Requirement(REQ_COLD, {
        status: 'archived',
        comments: [{ id: 'c-cold', body: '归档前的评论', createdAt: 9 }],
        archive: { summary: '归档材料', mergedInto: ['docs/architecture/x.md'], indexEntry: '一句话', submittedAt: 9, submittedBy: { kind: 'agent' } },
      }),
    ],
  }
}

/** 稳定序列化（键序无关），用于逐项内容等价。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'undefined'
}

/** 取对比用的字段子集（v10 专有字段不在其中）。 */
function comparable(r: Record<string, unknown>): Record<string, unknown> {
  const keys = ['id', 'title', 'description', 'status', 'blocked', 'version', 'createdAt', 'updatedAt',
    'comments', 'statusHistory', 'artifacts', 'plan', 'verification', 'archive', 'sourceSessionId', 'category']
  const out: Record<string, unknown> = {}
  for (const k of keys) if (r[k] !== undefined) out[k] = r[k]
  return out
}

function diskSnapshot(root: string): string {
  const parts: string[] = []
  const walk = (p: string): void => {
    for (const name of readdirSync(p).sort()) {
      const full = join(p, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else parts.push(`${full.slice(root.length)}=${st.mtimeMs}:${st.size}`)
    }
  }
  if (existsSync(root)) walk(root)
  return parts.join('\n')
}

// ---------------------------------------------------------------------------

describe('A11 往返：迁移 → 回滚 → 旧读路径装载', () => {
  it('条数与 id 集合与迁移前完全一致，且逐项内容等价', async () => {
    const original = v9Ledger()
    writeFileSync(file, JSON.stringify(original, null, 2))
    await migrateToV10(file, { out, now: NOW })

    const report = await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })
    expect(report.mode).toBe('apply')
    expect(report.requirements).toBe(3)
    expect(report.hot).toBe(2)
    expect(report.cold).toBe(1)
    // 计数字段实际是**上游装配**（store.get 的 assembleRecord）就剔掉了，故本脚本自己的剔除
    // 是第二道防线、计数应为 0。真正要断言的是"导出文件里没有这些字段"（下一组用例）。
    expect(report.strippedFields).toBe(0)

    // 用**旧版读路径**装载导出文件（含迁移门与结构判据）
    const loaded = readV9Ledger(exported)
    const before = readV9Ledger(file)
    // 判据是**集合**一致（卡上原文）。顺序**不保证**：v10 分片布局里没有"全局顺序"这个事实，
    // 枚举必然是目录的字典序——这是分片化的固有代价，回滚时如实如此，不假装保序。
    expect([...loaded.requirements.map((r) => r.id as string)].sort())
      .toEqual([...before.requirements.map((r) => r.id as string)].sort())
    expect(loaded.requirements).toHaveLength(before.requirements.length)

    const byId = new Map(original.requirements.map((r) => [(r as { id: string }).id, r as Record<string, unknown>]))
    for (const got of loaded.requirements) {
      const want = byId.get(got.id as string)!
      expect(canonical(comparable(got))).toBe(canonical(comparable(want)))
    }
  })

  it('归档需求随导出回到单册，且内联字段完整（含 archive 与归档前评论）', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })
    const loaded = readV9Ledger(exported)
    const cold = loaded.requirements.find((r) => r.id === REQ_COLD) as Record<string, unknown>
    expect(cold.status).toBe('archived')
    expect((cold.comments as unknown[]).length).toBe(1)
    expect((cold.comments as { id: string }[])[0]!.id).toBe('c-cold')
    expect((cold.archive as { mergedInto: string[] }).mergedInto).toEqual(['docs/architecture/x.md'])
  })

  it('导出文件 schemaVersion=9，且不含任何 v10 专有计数字段；留痕与分诊原样带过', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })

    const text = readFileSync(exported, 'utf8')
    for (const field of ['commentCount', 'historyCount', 'artifactCount']) {
      expect(text).not.toContain(field)
    }
    const parsed = JSON.parse(text) as { schemaVersion: number; revision: number; migrations: unknown[]; triages: unknown[] }
    expect(parsed.schemaVersion).toBe(LEDGER_V9)
    expect(parsed.revision).toBe(42)
    expect(parsed.triages).toHaveLength(1) // 分诊记录没丢
    expect(parsed.migrations.length).toBeGreaterThan(0) // 迁移留痕带过
  })
})

describe('dry-run 与备份', () => {
  it('dry-run 不写任何文件（目标不存在时保持不存在）', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    const report = await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: true })
    expect(report.mode).toBe('dry-run')
    expect(report.requirements).toBe(3)
    expect(existsSync(exported)).toBe(false)
  })

  it('导出前不碰数据根（分片目录 mtime 与字节全不变）', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    const before = diskSnapshot(out)
    await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })
    expect(diskSnapshot(out)).toBe(before)
  })

  it('目标已存在 → apply 前先备份它', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    writeFileSync(exported, '旧的单册内容')
    const report = await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })
    expect(report.backupPath).toBe(`${exported}.backup-${NOW}`)
    expect(readFileSync(`${exported}.backup-${NOW}`, 'utf8')).toBe('旧的单册内容')
  })
})

describe('往返一致：回滚后的单册能再被迁移', () => {
  it('migrate → rollback → 用导出单册再 migrate 到新数据根，结果等价', async () => {
    writeFileSync(file, JSON.stringify(v9Ledger(), null, 2))
    await migrateToV10(file, { out, now: NOW })
    await rollbackToV9({ root: out, out: exported, now: NOW, dryRun: false })

    const out2 = join(dir, 'reqboard2')
    await migrateToV10(exported, { out: out2, now: NOW + 1000 })
    const again = await exportV9(out2)
    const once = await exportV9(out)
    expect([...again.ids].sort()).toEqual([...once.ids].sort())
    // meta 里的 revision 也带过去了（不因往返重置）
    expect(JSON.parse(readFileSync(metaPath(out2), 'utf8')).revision).toBe(JSON.parse(readFileSync(metaPath(out), 'utf8')).revision)
  })
})
