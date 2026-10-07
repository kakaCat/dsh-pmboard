/**
 * A/B 归因助手（REQ-261006201814-ac4f FR-10）。
 *
 * ## 它治什么病
 *
 * 「这次失败不是本次改动引入的」此前是一句**声称**。实测代价（t2 卡）：某项共享夹具改动
 * 单跑 2 个文件全绿，而 A/B 对照立刻抓到 **10 条真回归**——验收口径过窄，正是本需求要治的假绿。
 * 本助手把归因变成**可复核的集合差**：同一批测试文件在「带改动」与「回退改动」两侧各跑
 * ≥2 次，逐条比失败集合，`introduced` 必须为空。
 *
 * ## 两条硬纪律
 *
 * 1. **回退必须逐字节**：调用方用 {@link snapshotFiles} 取快照、{@link restoreFiles} 还原
 *    （内容 + sha256 双核）。**禁用按路径检出还原**（`git checkout -- <path>`）——
 *    2026-10-04 事故：那样会把多个窗口的未提交改动一起退掉。
 * 2. **任一侧连跑 ≥2 次**：共享工作树下失败集合会漂移（别的窗口在改 src），
 *    复跑是为了区分「本次引入」与「既有顺序脆弱性」——只跑一次不足以声称「不是本次引入」。
 *
 * @module dsh-pmboard/tests/helpers/ab-attribution
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './error-code-scan.js'

export interface AbInput {
  /** 哪张卡、改了什么共享夹具（进产物）。 */
  readonly subject: string
  /** 本批测试文件（工作区相对路径）。 */
  readonly files: readonly string[]
  /** 把改动「回退」到改前形态（同步、幂等）。 */
  readonly mutate: () => void
  /** 逐字节还原（同步、幂等）；建议用 {@link restoreFiles}。 */
  readonly restore: () => void
  /** 同配置复跑次数，缺省 2。 */
  readonly repeat?: number
  /** 可选：还原后的额外自检（如 sha256 复核），抛错即视为还原失败。 */
  readonly verifyRestore?: () => void
}

export interface AbResult {
  /** 带改动的失败集合（排序去重）。 */
  readonly withChange: readonly string[]
  /** 回退改动后的失败集合（排序去重）。 */
  readonly withoutChange: readonly string[]
  /** withChange − withoutChange（**必须为空**才能声称无回归）。 */
  readonly introduced: readonly string[]
  /** withoutChange − withChange（如实列出）。 */
  readonly fixed: readonly string[]
  /** 复跑之间集合是否逐次相同。 */
  readonly stable: boolean
  readonly withChangeRuns: number
  readonly withoutChangeRuns: number
  readonly withChangeSets: readonly (readonly string[])[]
  readonly withoutChangeSets: readonly (readonly string[])[]
}

/** 逐字节快照（内容 + sha256）。 */
export interface FileSnapshot {
  /** 绝对路径。 */
  readonly path: string
  readonly content: string
  readonly sha256: string
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 取若干文件的逐字节快照。 */
export function snapshotFiles(paths: readonly string[]): readonly FileSnapshot[] {
  return paths.map(p => {
    const abs = p.startsWith('/') ? p : join(REPO_ROOT, p)
    const content = readFileSync(abs, 'utf8')
    return { path: abs, content, sha256: sha256(content) }
  })
}

/**
 * 逐字节还原（**sha256 复核**：写回后重读比对，不一致即响亮抛错）。
 *
 * 这就是「禁用按路径检出还原」的机械落点——本模块只提供这一条还原路径。
 */
export function restoreFiles(snapshots: readonly FileSnapshot[]): void {
  for (const s of snapshots) {
    writeFileSync(s.path, s.content, 'utf8')
    const back = readFileSync(s.path, 'utf8')
    if (sha256(back) !== s.sha256) {
      throw Object.assign(
        new Error('A/B 还原失败：' + s.path + ' 写回后的内容与快照不一致（sha256 不符）——中止并人工检查'),
        { code: 'TEST_AB_RESTORE_MISMATCH' },
      )
    }
  }
}

/** 跑一次 vitest 并取回失败用例集合（`文件 :: 用例全名`，排序去重）。 */
function collectFailures(files: readonly string[]): readonly string[] {
  const tmp = mkdtempSync(join(tmpdir(), 'pmboard-ab-'))
  const outFile = join(tmp, 'vitest.json')
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', '--outputFile=' + outFile, ...files], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    // vitest 有失败时本就非零；只认 JSON 报告，不认退出码
  }
  if (!existsSync(outFile)) {
    throw Object.assign(
      new Error('A/B 归因：读不到 vitest JSON 报告（' + outFile + '）——本次读数不可信，拒绝当成「没有失败」'),
      { code: 'TEST_AB_REPORT_MISSING' },
    )
  }
  const report = JSON.parse(readFileSync(outFile, 'utf8')) as {
    testResults?: readonly {
      name?: string
      assertionResults?: readonly { fullName?: string; status?: string }[]
    }[]
  }
  const lines: string[] = []
  for (const tr of report.testResults ?? []) {
    const rel = String(tr.name ?? '').replace(REPO_ROOT + '/', '')
    for (const a of tr.assertionResults ?? []) {
      if (a.status === 'failed') lines.push(rel + ' :: ' + String(a.fullName ?? a.status))
    }
  }
  rmSync(tmp, { recursive: true, force: true })
  return [...new Set(lines)].sort()
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * 纯集合运算：由两侧复跑集合算出 `introduced` / `fixed` / `stable`。
 *
 * 抽成纯函数是**为了让它自己可被反证**：恒返回空 `introduced` 的归因助手是本需求最危险的假绿，
 * 而跑不动 vitest 的单测进程里无法验证它——纯函数可以在任何地方拿合成集合试。
 */
export function compareAbSets(
  withSets: readonly (readonly string[])[],
  withoutSets: readonly (readonly string[])[],
): Pick<AbResult, 'withChange' | 'withoutChange' | 'introduced' | 'fixed' | 'stable'> {
  if (withSets.length === 0 || withoutSets.length === 0) {
    throw Object.assign(
      new Error('A/B 归因：两侧都必须至少跑过一次（空集合=没跑，不得当成「没有失败」）'),
      { code: 'TEST_AB_EMPTY_SIDE' },
    )
  }
  const withChange = withSets[withSets.length - 1] ?? []
  const withoutChange = withoutSets[withoutSets.length - 1] ?? []
  return {
    withChange,
    withoutChange,
    introduced: withChange.filter(x => !withoutChange.includes(x)),
    fixed: withoutChange.filter(x => !withChange.includes(x)),
    stable: withSets.every(s => sameSet(s, withChange)) && withoutSets.every(s => sameSet(s, withoutChange)),
  }
}

/**
 * 跑一次 A/B 归因。
 *
 * 顺序：带改动跑 N 次 → mutate() → 回退态跑 N 次 → restore() → verifyRestore()（有则跑）。
 */
export async function runAbAttribution(input: AbInput): Promise<AbResult> {
  const repeat = Math.max(input.repeat ?? 2, 2)
  const withSets: string[][] = []
  for (let i = 0; i < repeat; i += 1) withSets.push([...collectFailures(input.files)])

  input.mutate()
  const withoutSets: string[][] = []
  try {
    for (let i = 0; i < repeat; i += 1) withoutSets.push([...collectFailures(input.files)])
  } finally {
    // 无论回退态那几次跑成什么样，都必须还原（finally 而不是顺序语句）
    input.restore()
    input.verifyRestore?.()
  }

  return {
    ...compareAbSets(withSets, withoutSets),
    withChangeRuns: repeat,
    withoutChangeRuns: repeat,
    withChangeSets: withSets,
    withoutChangeSets: withoutSets,
  }
}
