/**
 * 兼容三条的机械落点（REQ-261006201814-ac4f FR-9）。
 *
 * ## 为什么这里**不**用 git / 子进程
 *
 * FR-5⑤-a 的权限模型在 worker 里同时禁掉了 `child_process`（Node 权限模型默认拦 spawn）。
 * 本文件最初用 `execFileSync('git', …)` 算「删除断言行数」，结果每个调用都**静默返回空串**，
 * 判据 `toBeLessThanOrEqual(105)` 于是**恒真**——那是标准的假绿（本需求要治的就是它）。
 *
 * 故口径改为：
 *   · **本文件只做文件系统可判的事**（清单在场、行数、集合相等、文案在场）；
 *   · 需要 git 的读数（删除断言行数棘轮、src 改动面）交给**能 spawn 子进程的 drill**
 *     `npx tsx tests/drill/compat-probe.mts` 执行，并留 `…-compat.json` 作为证据。
 *
 * ## 三条各自防什么
 *
 * ① **存量**：不动既有语义（基线不增、分诊三方自洽、交付物里没有 src）；
 * ② **契约**：双层码契约不许收窄（小写孪生用例 + 映射表实现都在场）；
 * ③ **前向**：守卫报红必须给得出自助命令（刷新入口与命令文案都在场）。
 *
 * @module dsh-pmboard/tests/compat-req-261006201814
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from './helpers/error-code-scan.js'

/** 冻结的基线条目数；只许减不许增。 */
const BASELINE_LINES_CEILING = 68

/** 本需求交付物（工作区相对路径）——**一个 src/ 路径都不许有**。 */
const DELIVERED: readonly string[] = [
  // FR-1 / FR-2 / FR-3：口径与矩阵
  'tests/helpers/code-trigger-harness.ts',
  'tests/error-code-matrix.test.ts',
  'tests/fixtures/error-code-exempt.json',
  'tests/error-code-exempt.test.ts',
  // FR-4：基线分诊
  'docs/reviews/test-baseline.reverse.txt',
  'docs/reviews/test-baseline.other.txt',
  'docs/reviews/test-baseline.reverse.notes.md',
  'tests/baseline-triage.test.ts',
  'tests/drill/triage-baseline.mts',
  // FR-5：hermetic
  'tests/helpers/workspace-root.ts',
  'tests/application/harness.ts',
  'tests/setup/hermetic-guard.ts',
  'tests/setup/hermetic-contract.ts',
  'tests/hermetic-guard.test.ts',
  'vitest.config.ts',
  // FR-6：断码升级
  'tests/helpers/code-assert.ts',
  // FR-7：三张矩阵
  'tests/helpers/ledger-probe.ts',
  'tests/authorization-matrix.test.ts',
  'tests/concurrency-matrix.test.ts',
  'tests/empty-input-matrix.test.ts',
  // FR-8：反向演练
  'tests/drill/reverse-drill-error-codes.mts',
  // FR-10：A/B 归因
  'tests/helpers/ab-attribution.ts',
  'tests/ab-attribution.test.ts',
  'tests/drill/ab-attribution.mts',
  'docs/reviews/REQ-261006201814-ac4f-ab.json',
  // 收口
  'tests/compat-req-261006201814.test.ts',
  'tests/drill/compat-probe.mts',
  'docs/reviews/REQ-261006201814-ac4f-compat.json',
  'docs/reviews/REQ-261006201814-ac4f-readings.md',
]

const rel = (p: string): string => join(REPO_ROOT, p)
const readLines = (p: string): string[] =>
  readFileSync(rel(p), 'utf8').split('\n').filter(l => l.trim().length > 0)

describe('兼容三条（FR-9）', () => {
  it('① src 零改动：交付物清单里没有任何 src/ 路径，且清单文件都真实在场', () => {
    expect(DELIVERED.filter(p => p.startsWith('src/')), '交付物里出现 src/ 路径（红线 D-3）').toEqual([])
    expect(DELIVERED.filter(p => !existsSync(rel(p))), '交付物清单与磁盘不一致').toEqual([])
  })

  it('① 基线不增：failures.txt 行数不高于冻结值（只许减不许增）', () => {
    const lines = readLines('docs/reviews/test-baseline.failures.txt')
    expect(lines.length).toBeLessThanOrEqual(BASELINE_LINES_CEILING)
  })

  it('① 分诊三方自洽：reverse + other == failures，且两侧互斥、无基线外条目', () => {
    const failures = new Set(readLines('docs/reviews/test-baseline.failures.txt'))
    const reverse = readLines('docs/reviews/test-baseline.reverse.txt')
    const other = readLines('docs/reviews/test-baseline.other.txt')
    expect(reverse.length + other.length).toBe(failures.size)
    for (const line of [...reverse, ...other]) {
      expect(failures.has(line), '分诊清单里出现基线外的条目：' + line).toBe(true)
    }
    const overlap = reverse.filter(l => other.includes(l))
    expect(overlap, '两份清单存在交集（必须互斥）').toEqual([])
  })

  it('② 契约：双层码契约不许收窄——小写孪生用例与其映射表实现同时在 tests/ 在场', () => {
    const matrix = readFileSync(rel('tests/empty-input-matrix.test.ts'), 'utf8')
    expect(matrix, '小写孪生用例不在场（契约被收窄）').toContain("'invalid_input'")
    const scan = readFileSync(rel('tests/helpers/error-code-scan.ts'), 'utf8')
    expect(scan, '小写码登记表口径实现不在场').toContain('TRANSPORT_CODE_BY_INTERNAL')
    expect(scan, '小写码登记表口径实现不在场').toContain('REQBOARD_ERROR_CODES')
  })

  it('③ 前向：自助刷新入口与命令文案仍在（守卫报红必须给得出自助路径）', () => {
    expect(existsSync(rel('tests/drill/refresh-error-code-inventory.mts')), '自助刷新脚本不在场').toBe(true)
    const guard = readFileSync(rel('tests/error-code-inventory.test.ts'), 'utf8')
    expect(guard, '口径守卫里没有自助刷新命令文案').toContain('refresh-error-code-inventory')
    const triage = readFileSync(rel('tests/drill/triage-baseline.mts'), 'utf8')
    expect(triage, '分诊演练脚本不在场').toContain('差集')
  })

  it('交付读数文件在场、非空，且含改前/改后两组读数', () => {
    const p = rel('docs/reviews/REQ-261006201814-ac4f-readings.md')
    expect(existsSync(p)).toBe(true)
    expect(statSync(p).size).toBeGreaterThan(200)
    const text = readFileSync(p, 'utf8')
    expect(text, '读数文件缺「改前」组').toContain('改前')
    expect(text, '读数文件缺「改后」组').toContain('改后')
    expect(text, '读数文件缺工作树指纹').toContain('HEAD')
  })

  it('判据自身不是空转：交付清单非空、且新增的判据文件里确有断言', () => {
    expect(DELIVERED.length).toBeGreaterThan(20)
    // 注意：码矩阵文件本身**不含** expect——断言展开在 code-trigger-harness 里（INV-2 单一实现），
    // 故这条自检要打在**判据实现**上，打在矩阵文件上会得到 0 而误红（本文件首版就这样错过一次）。
    for (const p of ['tests/helpers/code-trigger-harness.ts', 'tests/authorization-matrix.test.ts', 'tests/error-code-exempt.test.ts']) {
      const text = readFileSync(rel(p), 'utf8')
      expect((text.match(/expect\(/g) ?? []).length, p + ' 里没有断言——判据成了空壳').toBeGreaterThan(0)
    }
  })
})
