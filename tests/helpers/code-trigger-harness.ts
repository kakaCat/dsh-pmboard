/**
 * 错误码触发矩阵的骨架（REQ-261006201814-ac4f FR-2 / FR-3）。
 *
 * ## 它治什么病
 *
 * 本仓「错误码有没有被测」此前是一句主观判断：口径内 132 个大写码里，**23 个真零断言**
 * （2026-10-07 实测），它们可以静默漂移而没有任何东西会红。本骨架把「每个可触发码都有一条
 * 「触发 → 断码」用例」变成**可执行的判据**：每条 spec 真的去触发一次，断言观察到**码本身**
 * （不是中文文案——文案一改就碎，正是 FR-6 要治的）。
 *
 * ## 三条自检（防假绿）
 *
 * ① `specs` 非空——空表会让矩阵「零失败」地通过，是最危险的假绿形态；
 * ② 每条 `spec.code` 必须命中口径清单——防「自造一个码，然后断言它」；
 * ③ 同码不得重复超过一次——防「一条难的拆成两条容易的」凑数。
 *
 * ## 零覆盖读数
 *
 * 末尾一条读数用例复算「口径内大写码 − 双形态覆盖」并断言**不超过 5**（FR-2 的目标）。
 * 读数走 `error-code-scan.ts` 的**同一实现**（INV-2：同一规则只有一处实现），
 * 不在这里另写一套 grep。
 *
 * @module dsh-pmboard/tests/helpers/code-trigger-harness
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT, collectTestCoverage, scanErrorCodes } from './error-code-scan.js'

/** 一次触发的观察结果：看到了哪个码（以及可选的人读补充）。 */
export interface TriggerObservation {
  readonly code: string | undefined
  readonly note?: string
}

/** 一条「触发 → 断码」的声明。 */
export interface TriggerSpec {
  /** 期望观察到的生产码（必须命中口径清单）。 */
  readonly code: string
  /** 造景手法（与 design/data-model.md 的 tier 表同义）。 */
  readonly tier: 'direct' | 'fixture' | 'fault'
  /** 真的去触发一次；返回观察到的码（用 {@link codeOf} 统一取）。 */
  readonly trigger: () => Promise<TriggerObservation> | TriggerObservation
}

/** FR-2 的目标：口径内真零覆盖的码不得超过这个数。 */
export const MAX_UNCOVERED = 5

/**
 * 统一取码（顺序与 design/interfaces.md 逐字一致）：
 * `err.code` → `result.code` → `result.error.code` → 文案里的 `(REQBOARD_...)` 文本。
 *
 * **不断中文文案**：最后一条只作为兜底（有些入口只把码写进消息），命中即返回码本身。
 */
export function codeOf(errOrResult: unknown): string | undefined {
  if (errOrResult === undefined || errOrResult === null) return undefined
  const o = errOrResult as Record<string, unknown>

  // ① err.code / result.code（同一条路径：抛出的错误与回执都是「对象上带 code」）
  if (typeof o.code === 'string' && o.code.length > 0) return o.code

  // ② result.error.code
  const errObj = o.error
  if (errObj !== null && typeof errObj === 'object') {
    const nested = (errObj as Record<string, unknown>).code
    if (typeof nested === 'string' && nested.length > 0) return nested
  }

  // ③ 文案里的码：Error.message / result.error / result.message
  const text = errOrResult instanceof Error
    ? errOrResult.message
    : typeof errObj === 'string'
      ? errObj
      : typeof o.message === 'string'
        ? o.message
        : undefined
  if (typeof text === 'string') {
    const m = /REQBOARD_[A-Z0-9_]+/.exec(text)
    if (m !== null) return m[0]
  }
  return undefined
}

/** 口径清单里的全部码（大写 + 小写）。 */
export function inventoryCodeSet(): Set<string> {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tests/fixtures/error-code-inventory.json'), 'utf8'),
  ) as { uppercase?: readonly { code?: string }[]; lowercase?: readonly { code?: string }[] }
  const out = new Set<string>()
  for (const u of raw.uppercase ?? []) if (typeof u.code === 'string') out.add(u.code)
  for (const l of raw.lowercase ?? []) if (typeof l.code === 'string') out.add(l.code)
  return out
}

/**
 * 展开成参数化用例并逐条断言「触发 → 断码」。
 *
 * 自检与逐码用例同处一个 `describe`，故「矩阵绿了」必然意味着三条自检也绿。
 */
export function defineCodeTriggers(specs: readonly TriggerSpec[]): void {
  const known = inventoryCodeSet()

  describe('错误码触发矩阵（FR-2）', () => {
    it('自检一：specs 非空（空表 = 零失败 = 最危险的假绿）', () => {
      expect(specs.length).toBeGreaterThan(0)
    })

    it('自检二：每条 spec.code 必须命中口径清单（防自造码）', () => {
      const bad = specs.filter(s => !known.has(s.code)).map(s => s.code)
      expect(bad, '以下码不在 tests/fixtures/error-code-inventory.json 的口径内：' + bad.join('、')
        + '。补齐：npx tsx tests/drill/refresh-error-code-inventory.mts').toEqual([])
    })

    it('自检三：同码不得重复超过一次（防拆一条难的凑两条容易的）', () => {
      const seen = new Map<string, number>()
      for (const s of specs) seen.set(s.code, (seen.get(s.code) ?? 0) + 1)
      const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([c, n]) => c + '×' + String(n))
      expect(dup).toEqual([])
    })

    for (const spec of specs) {
      it(spec.code + '（' + spec.tier + '）：触发 → 断码', async () => {
        const obs = await spec.trigger()
        const detail = '期望触发码 ' + spec.code + '，实际观察到 ' + String(obs.code)
          + (obs.note !== undefined && obs.note.length > 0 ? '（' + obs.note + '）' : '')
        expect(obs.code, detail).toBe(spec.code)
      })
    }

    it('读数：口径内真零覆盖的码不得超过 ' + String(MAX_UNCOVERED) + ' 个（FR-2）', () => {
      const scan = scanErrorCodes()
      const coverage = collectTestCoverage()
      const uncovered = scan.uppercase.map(u => u.code).filter(c => !coverage.has(c))
      const literal = scan.uppercase.filter(u => coverage.get(u.code) === 'literal').length
      const constForm = scan.uppercase.filter(u => coverage.get(u.code) === 'const').length
      console.log('[读数] 大写码 ' + String(scan.uppercase.length)
        + ' · 字面量覆盖 ' + String(literal)
        + ' · 常量覆盖 ' + String(constForm)
        + ' · 零覆盖 ' + String(uncovered.length)
        + ' · 假阴性率 ' + (scan.uppercase.length === 0
          ? '0%'
          : (constForm / scan.uppercase.length * 100).toFixed(2) + '%'))
      console.log('[读数] 仍零覆盖：' + (uncovered.length === 0 ? '（无）' : uncovered.join('、')))
      expect(
        uncovered.length,
        '仍有 ' + String(uncovered.length) + ' 个码零覆盖（上限 ' + String(MAX_UNCOVERED) + '）：'
          + uncovered.join('、') + '。补齐：在 tests/error-code-matrix.test.ts 增加 TriggerSpec，'
          + '确实不可触发的登记进 tests/fixtures/error-code-exempt.json',
      ).toBeLessThanOrEqual(MAX_UNCOVERED)
    })
  })
}
