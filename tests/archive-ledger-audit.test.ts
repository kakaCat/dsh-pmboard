/**
 * 存量归档只读核对脚本测试（REQ-261006201841-944d t10 / FR-8）。
 *
 * 锁死三件事：
 *   ① **读数按每条需求自己的根算**：目标文档只在 A 项目的根里时，A 的记录不算失效，
 *      而 B 的记录（根指向别处）才算失效——这正是「直接在本仓比会误判」的根因；
 *   ② **只读契约**：跑完台账副本文件逐一 sha256 不变（除 `--out` 外零写入）；
 *   ③ **台账不可达 → 退出码 2**（不是 0，也不能当成"没有失效"）。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = 'scripts/archive-ledger-audit.mts'
let ledger: string
let projectA: string
let projectB: string

interface AuditJson {
  archiveDirs: number
  withArchiveMaterials: number
  totals: {
    realMissingTargets: number
    missingTargetsOnFallbackRoot: number
    sectionDriftStrict: number
    missingManualPath: number
    unknownRoot: number
    naiveMissing: number
  }
  rows: Array<{
    requirementId: string
    rootSource: 'workspace-root' | 'fallback-current-workspace'
    missingTargets: string[]
  }>
}

/** 台账副本里一条归档记录（`record.json` + 可选 `archive.json`）。 */
function seedRecord(
  id: string,
  opts: { workspaceRoot?: string; mergedInto?: string[]; manualUpdates?: Array<Record<string, string>>; materials?: boolean },
): void {
  const dir = join(ledger, 'archive', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'record.json'), JSON.stringify({
    id, title: '需求 ' + id, category: 'feature', status: 'archived',
    ...(opts.workspaceRoot === undefined ? {} : { workspaceRoot: opts.workspaceRoot }),
  }), 'utf8')
  if (opts.materials !== false) {
    writeFileSync(join(dir, 'archive.json'), JSON.stringify({
      dir: 'docs/requirements/' + id,
      docs: [], indexEntry: '结论',
      mergedInto: opts.mergedInto ?? [],
      manualUpdates: opts.manualUpdates ?? [],
    }), 'utf8')
  }
}

/** 目录树 sha256（含相对路径与内容；证明"只读"）。 */
function treeHash(root: string): string {
  const h = createHash('sha256')
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { h.update('D:' + p.slice(root.length)); walk(p); continue }
      h.update('F:' + p.slice(root.length) + ':' + readFileSync(p, 'utf8'))
    }
  }
  walk(root)
  return h.digest('hex')
}

const run = (args: string[], allowFail = false): { out: string; code: number } => {
  try {
    const out = execFileSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { out, code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; status?: number }
    if (!allowFail) throw err
    return { out: String(e.stdout ?? ''), code: e.status ?? 1 }
  }
}

beforeEach(() => {
  ledger = mkdtempSync(join(tmpdir(), 'pm-audit-ledger-'))
  projectA = mkdtempSync(join(tmpdir(), 'pm-audit-projA-'))
  projectB = mkdtempSync(join(tmpdir(), 'pm-audit-projB-'))
})
afterEach(() => {
  for (const d of [ledger, projectA, projectB]) rmSync(d, { recursive: true, force: true })
})

describe('存量归档只读核对（FR-8）', () => {
  it('① 按每条需求自己的根判：文档只在 A 项目根里 → A 不算失效、根指向别处的才算', () => {
    // A 项目的根里真有这份文档；B 记录的根指向 B（那里没有）。
    mkdirSync(join(projectA, 'docs/architecture'), { recursive: true })
    writeFileSync(join(projectA, 'docs/architecture/pm-toolview.md'), '# 标题\n', 'utf8')
    seedRecord('REQ-aaa111', {
      workspaceRoot: projectA,
      mergedInto: ['docs/architecture/pm-toolview.md'],
      manualUpdates: [{ path: 'docs/architecture/pm-toolview.md', section: '标题', summary: 'x' }],
    })
    seedRecord('REQ-bbb222', {
      workspaceRoot: projectB,
      mergedInto: ['docs/architecture/pm-toolview.md'],
    })
    const { out } = run(['--ledger-root', ledger, '--json'])
    const report = JSON.parse(out) as AuditJson
    expect(report.archiveDirs).toBe(2)
    expect(report.withArchiveMaterials).toBe(2)
    expect(report.totals.realMissingTargets).toBe(1)
    const byId = Object.fromEntries(report.rows.map(r => [r.requirementId, r]))
    expect(byId['REQ-aaa111']!.missingTargets).toEqual([])
    expect(byId['REQ-bbb222']!.missingTargets).toEqual(['docs/architecture/pm-toolview.md'])
    expect(byId['REQ-aaa111']!.rootSource).toBe('workspace-root')
  })

  it('② 无 workspaceRoot 的记录 → 标「兜底根」且计入兜底档（不静默跳过）', () => {
    seedRecord('REQ-ccc333', { mergedInto: ['docs/architecture/__nope__.md'] })
    const { out } = run(['--ledger-root', ledger, '--json'])
    const report = JSON.parse(out) as AuditJson
    expect(report.totals.unknownRoot).toBe(1)
    expect(report.rows[0]!.rootSource).toBe('fallback-current-workspace')
    expect(report.totals.realMissingTargets).toBe(1)
    expect(report.totals.missingTargetsOnFallbackRoot).toBe(1)
  })

  it('③ 只读契约：跑完台账副本内容 sha256 不变（除 --out 外零写入）', () => {
    seedRecord('REQ-aaa111', { mergedInto: [] })
    const before = treeHash(ledger)
    run(['--ledger-root', ledger, '--json'])
    run(['--ledger-root', ledger])
    expect(treeHash(ledger)).toBe(before)
  })

  it('④ 台账不可达 → 退出码 2（不是 0：缺读数不得当作"没有失效"）', () => {
    const { code, out } = run(['--ledger-root', join(ledger, '__missing__'), '--json'], true)
    expect(code).toBe(2)
    expect(out + String(code)).toBeTruthy()
  })

  it('⑤ 只有 record.json、没有 archive.json 的目录 → 计入 archiveDirs 但不计 withArchiveMaterials', () => {
    seedRecord('REQ-ddd444', { materials: false })
    const { out } = run(['--ledger-root', ledger, '--json'])
    const report = JSON.parse(out) as AuditJson
    expect(report.archiveDirs).toBe(1)
    expect(report.withArchiveMaterials).toBe(0)
  })
})
