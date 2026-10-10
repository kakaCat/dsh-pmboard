/**
 * t1 基线脚本的自检测试（REQ-261009174713-7bc8 / RF-1、RF-2、RF-13、RF-20）。
 *
 * 为什么要有它：五类基线是本次拆包的验收锚点（后续 t22 靠「基线 diff 为空」证明行为等价）。
 * 基线脚本本身写错（漏 dump、dump 空、形状漂移）会让 t22 静默放行——所以这里对**脚本输出形状**
 * 逐项断言，而不是只断言「脚本退出码 0」。
 *
 * 判据来源（本仓规范）：C-14 的失败集判据用 `docs/reviews/test-baseline.md`（集合差），
 * 本测试只负责「五类基线自身可取、形状正确」。
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASELINE_DIR = join(ROOT, '.dsh-data', 'refactor-baseline')

interface DryRun {
  mode: string
  toolCount: number
  tools: string[]
  typeCategories: string[]
  distExports: string[]
  assetCount: number
  vitestCases: number | null
}

function dryRun(): DryRun {
  const out = execFileSync('npx', ['tsx', 'scripts/refactor-baseline.mts'], { cwd: ROOT, encoding: 'utf8' })
  return JSON.parse(out) as DryRun
}

describe('迁移基线可取（t1）', () => {
  it('脚本可运行且工具面基线为 19 个工具', () => {
    const r = dryRun()
    expect(r.toolCount).toBe(19)
    expect(r.tools).toHaveLength(19)
  })

  it('判据面基线覆盖六种需求类型', () => {
    const r = dryRun()
    expect([...r.typeCategories].sort()).toEqual(['bug', 'chore', 'doc', 'feature', 'refactor', 'spike'])
  })

  it('资产面基线非空（模板 + skill + RTM 引擎）', () => {
    const r = dryRun()
    expect(r.assetCount).toBeGreaterThan(150)
  })

  it('宿主可见面基线是导出名单数组（dist 未构建时为空数组，不伪造）', () => {
    const r = dryRun()
    expect(Array.isArray(r.distExports)).toBe(true)
    if (existsSync(join(ROOT, 'dist', 'index.mjs'))) expect(r.distExports.length).toBeGreaterThan(0)
  })

  it('已采集的五类基线逐份在场且非空', () => {
    if (!existsSync(BASELINE_DIR)) return // 未采集（如净检出）→ 由 --write 步负责，不假绿
    for (const name of ['dist-exports.json', 'tool-registry.json', 'type-spec.json', 'asset-manifest.json', 'vitest-cases.json']) {
      const file = join(BASELINE_DIR, name)
      expect(existsSync(file), name + ' 缺失').toBe(true)
      expect(readFileSync(file, 'utf8').trim().length).toBeGreaterThan(0)
    }
    const tools = JSON.parse(readFileSync(join(BASELINE_DIR, 'tool-registry.json'), 'utf8')) as { count: number }
    expect(tools.count).toBe(19)
  })
})
