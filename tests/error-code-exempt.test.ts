/**
 * 豁免白名单的棘轮守卫（REQ-261006201814-ac4f FR-3）。
 *
 * ## 它治什么病
 *
 * 「这个码测不了」如果只是一句话，它就会成为**永久免检区**：新码往白名单里一塞，
 * 覆盖率读数照样好看。本守卫把豁免变成**双向钉死 + 只减不增**的可失败判据：
 *   · 双向：白名单集合 ⟺ 口径清单里 covered=false 的集合（少一条多一条都红）；
 *   · 棘轮：条目数与 frozenCount 各有硬上界（单改 JSON 里的数字不够，测试里另有一把锁）；
 *   · 有效性：reason / plan 非空、blocker 命中受控枚举、no-production-point 只给死码。
 *
 * ## 判据自身必须可被反证
 *
 * 本文件末尾用**合成坏输入**跑一遍同一个判据函数，断言它真的报出违反——
 * 「判据永远返回空数组」是最危险的假绿形态，必须自己能识破。
 *
 * @module dsh-pmboard/tests/error-code-exempt.test
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from './helpers/error-code-scan.js'

/** blocker 受控枚举（与 design/data-model.md 逐条对应）。 */
export const BLOCKERS = [
  'no-production-point',
  'tool-layer-unreachable',
  'needs-chain-setup',
  'needs-fault-injection',
  'other',
] as const

/** tier 受控枚举（不得为 unclassified——那是刷新写入的临时态）。 */
export const TIERS = ['direct', 'fixture', 'fault'] as const

/**
 * 条目数的硬上界（棘轮）。
 *
 * 与 `tests/fixtures/error-code-exempt.json` 里的 `frozenCount` 是**两把锁**：
 * 单改 JSON 的数字会让本文件红（这就是「上调即红」的机械落点）。
 * 真要放宽必须同时改这里——两处显式改 = 一次刻意决定，而不是手滑。
 */
export const FROZEN_COUNT_BOUND = 5

/** reason 长度上限（与 design/data-model.md 一致）。 */
export const REASON_MAX = 300

export interface ExemptEntry {
  readonly code: string
  readonly tier: string
  readonly reason: string
  readonly evidence: string
  readonly blocker: string
  readonly plan: string
}

export interface ExemptFile {
  readonly frozenCount: number
  readonly entries: readonly ExemptEntry[]
}

export interface InventoryLike {
  readonly uppercase: readonly { readonly code: string; readonly covered?: boolean }[]
}

/**
 * 纯判据：返回全部违反（空数组 = 过）。抽成纯函数是为了让「判据自身可被反证」，
 * 而不是把规则散在一堆 expect 里（那种形态没法拿坏输入试）。
 */
export function exemptViolations(
  file: ExemptFile,
  inventory: InventoryLike,
  bound: number = FROZEN_COUNT_BOUND,
): string[] {
  const out: string[] = []
  const uncovered = inventory.uppercase.filter(u => u.covered !== true).map(u => u.code).sort()
  const listed = file.entries.map(e => e.code).sort()

  // ① 双向相等
  const missing = uncovered.filter(c => !listed.includes(c))
  const extra = listed.filter(c => !uncovered.includes(c))
  if (missing.length > 0) out.push('清单里零覆盖但未登记豁免：' + missing.join('、'))
  if (extra.length > 0) out.push('豁免里登记了已覆盖或口径外的码：' + extra.join('、'))

  // ② 棘轮
  if (file.entries.length > file.frozenCount) {
    out.push('条目数 ' + String(file.entries.length) + ' 超过 frozenCount ' + String(file.frozenCount))
  }
  if (file.frozenCount > bound) {
    out.push('frozenCount ' + String(file.frozenCount) + ' 超过硬上界 ' + String(bound) + '（棘轮只减不增）')
  }

  // ③ 有效性
  const live = new Set(inventory.uppercase.map(u => u.code))
  for (const e of file.entries) {
    if (!(TIERS as readonly string[]).includes(e.tier)) out.push(e.code + '：tier 非法或为 unclassified（' + e.tier + '）')
    if (e.reason.trim().length === 0) out.push(e.code + '：reason 为空')
    if (e.reason.length > REASON_MAX) out.push(e.code + '：reason 超过 ' + String(REASON_MAX) + ' 字符')
    if (!/^[^\s:]+:\d+$/.test(e.evidence)) out.push(e.code + '：evidence 不是 路径:行号 形态（' + e.evidence + '）')
    if (!(BLOCKERS as readonly string[]).includes(e.blocker)) out.push(e.code + '：blocker 不在受控枚举（' + e.blocker + '）')
    if (e.plan.trim().length === 0) out.push(e.code + '：plan 为空')
    if (e.blocker === 'no-production-point' && live.has(e.code)) {
      out.push(e.code + '：在产码不得标 no-production-point')
    }
  }

  // ④ 去重
  const dup = [...new Set(listed.filter((c, i) => listed.indexOf(c) !== i))]
  if (dup.length > 0) out.push('重复登记：' + dup.join('、'))
  return out
}

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8')) as T
}

const exempt = readJson<ExemptFile>('tests/fixtures/error-code-exempt.json')
const inventory = readJson<InventoryLike>('tests/fixtures/error-code-inventory.json')

describe('豁免白名单棘轮（FR-3）', () => {
  it('实况：白名单与清单 covered=false 双向相等，且条目/理由/证据/blocker 全部有效', () => {
    expect(exemptViolations(exempt, inventory)).toEqual([])
  })

  it('棘轮上界在场：条目数 ≤ frozenCount，且 frozenCount ≤ 测试里的硬上界', () => {
    expect(exempt.entries.length).toBeLessThanOrEqual(exempt.frozenCount)
    expect(exempt.frozenCount).toBeLessThanOrEqual(FROZEN_COUNT_BOUND)
  })

  it('判据自身不是空转：合成坏输入必须逐条被报出', () => {
    const base: ExemptFile = {
      frozenCount: 2,
      entries: [
        { code: 'REQBOARD_A', tier: 'fixture', reason: '为什么测不了', evidence: 'src/a.ts:1', blocker: 'needs-chain-setup', plan: '将来怎么测' },
        { code: 'REQBOARD_B', tier: 'fixture', reason: '为什么测不了', evidence: 'src/b.ts:2', blocker: 'needs-chain-setup', plan: '将来怎么测' },
      ],
    }
    const inv: InventoryLike = { uppercase: [{ code: 'REQBOARD_A', covered: false }, { code: 'REQBOARD_B', covered: false }] }
    expect(exemptViolations(base, inv)).toEqual([]) // 合成的好输入必须过（否则判据过敏）

    const cases: readonly [string, ExemptFile, InventoryLike][] = [
      ['删一条（清单仍零覆盖）', { frozenCount: 2, entries: [base.entries[0]!] }, inv],
      ['frozenCount 上调超硬上界', { frozenCount: FROZEN_COUNT_BOUND + 1, entries: base.entries }, inv],
      ['reason 清空', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, reason: '   ' }],
      }, inv],
      ['blocker 自造', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, blocker: '看起来不可测' }],
      }, inv],
      ['plan 清空', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, plan: '' }],
      }, inv],
      ['evidence 不是 路径:行号', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, evidence: '某处' }],
      }, inv],
      ['在产码标 no-production-point', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, blocker: 'no-production-point' }],
      }, inv],
      ['tier 退回 unclassified', {
        frozenCount: 2,
        entries: [base.entries[0]!, { ...base.entries[1]!, tier: 'unclassified' }],
      }, inv],
    ]
    for (const [label, file, invCase] of cases) {
      expect(exemptViolations(file, invCase).length, '反例「' + label + '」必须被报出').toBeGreaterThan(0)
    }
  })
})
