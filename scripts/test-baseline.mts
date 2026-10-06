#!/usr/bin/env tsx
/**
 * 回归基线（**集合差**口径）——REQ-261006123819-3af3 FR-2 / FR-6
 *
 * ## 为什么改口径
 *
 * 改前的判定是「失败数 ≤ 基线 N」（C-14 写 106、需求卡写 98）。这个口径有两个死法：
 *   ① 数字会过期——实测 2026-10-06 全量失败 **70**，而文档允许 ≤98 ⇒ 28 个新失败可静默通过；
 *      tsc 侧更彻底：实测 **0** 个错误，而文档允许 ≤197 ⇒ 上限完全失效。
 *   ② 同一个数字被复制到 28 份文档（规范 / 需求卡 / notes / rtm），一处变全仓过期。
 *
 * 故改成「**失败用例集合差为空**」：不依赖任何数字的时效性，只比集合。
 * 数字只住一处：`docs/reviews/test-baseline.failures.txt`。
 *
 * ## 两种模式
 *
 *   npx tsx scripts/test-baseline.mts --refresh   # 采集并写入基线（"承认现状"）
 *   npx tsx scripts/test-baseline.mts --check     # 采集并与基线算集合差；空 exit 0，非空 exit 1
 *
 * 两种模式**都打印工作树指纹**（HEAD 短哈希 + `git diff --stat` 摘要，FR-6）——
 * 本仓多窗口共用同一工作树，没有指纹的读数无法界定、也无法复现。
 *
 * @module dsh-pmboard/scripts/test-baseline
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASELINE_MD = join(ROOT, 'docs/reviews/test-baseline.md')
const BASELINE_TXT = join(ROOT, 'docs/reviews/test-baseline.failures.txt')

interface Collected {
  /** 已排序的「文件 :: 用例全名」清单 */
  failures: readonly string[]
  total: number
  passed: number
  files: { failed: number; passed: number; skipped: number }
  tscExit: number
  tscErrors: number
  fingerprint: { head: string; diffstat: string; dirty: number }
}

/** 跑一条命令，返回 stdout（**容忍非零退出**——vitest 有失败时本就非零）。 */
function run(cmd: string, args: readonly string[]): { out: string; code: number } {
  try {
    const out = execFileSync(cmd, [...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { out, code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { out: String(e.stdout ?? '') + String(e.stderr ?? ''), code: e.status ?? 1 }
  }
}

/** 工作树指纹：HEAD 短哈希 + `git diff --stat` 末行摘要 + 含未跟踪的改动文件数（FR-6）。 */
function worktreeFingerprint(): { head: string; diffstat: string; dirty: number } {
  const head = run('git', ['rev-parse', '--short', 'HEAD']).out.trim()
  const stat = run('git', ['diff', '--stat']).out.trim().split('\n').filter(l => l.length > 0)
  // 注意：git diff --stat 只算**已跟踪**文件；未跟踪文件必须另计，否则指纹会漏掉一半工作树
  const porcelain = run('git', ['status', '--porcelain']).out.split('\n').filter(l => l.trim().length > 0)
  const untracked = porcelain.filter(l => l.startsWith('??')).length
  const last = stat.length > 0 ? stat[stat.length - 1]!.trim() : '已跟踪文件无改动'
  return {
    head: head.length > 0 ? head : '(未知)',
    diffstat: last + ' · 含未跟踪共 ' + porcelain.length + ' 个改动（其中未跟踪 ' + untracked + '）',
    dirty: porcelain.length,
  }
}

/** 采集全量 vitest 失败集合（JSON reporter）+ tsc 错误数 + 指纹。 */
function collect(): Collected {
  const tmp = mkdtempSync(join(tmpdir(), 'pmboard-baseline-'))
  const outFile = join(tmp, 'vitest.json')
  // vitest 失败时退出码非零，故不看退出码，只看 JSON
  run('npx', ['vitest', 'run', '--reporter=json', '--outputFile=' + outFile])

  let failures: string[] = []
  let total = 0
  let passed = 0
  const files = { failed: 0, passed: 0, skipped: 0 }

  if (existsSync(outFile)) {
    const report = JSON.parse(readFileSync(outFile, 'utf8')) as {
      numTotalTests?: number
      numPassedTests?: number
      numFailedTestSuites?: number
      numPassedTestSuites?: number
      numPendingTestSuites?: number
      testResults?: readonly {
        name?: string
        status?: string
        assertionResults?: readonly { fullName?: string; status?: string }[]
      }[]
    }
    total = report.numTotalTests ?? 0
    passed = report.numPassedTests ?? 0

    const lines: string[] = []
    // 文件级计数**自己数**：JSON reporter 的 numFailedTestSuites / numPassedTestSuites 实测不可靠
    // （曾给出 1 failed / 2141 passed，而 dot reporter 同刻是 39 failed / 466 passed），
    // 把它写进基线文档就是假读数。故按 testResults[].status 逐文件数。
    for (const tr of report.testResults ?? []) {
      if (tr.status === 'failed') files.failed++
      else if (tr.status === 'pending') files.skipped++
      else files.passed++
      // JSON reporter 的 name 是绝对路径；基线一律存**工作区相对**路径，跨机可比
      const rel = String(tr.name ?? '').replace(ROOT + '/', '')
      for (const a of tr.assertionResults ?? []) {
        if (a.status === 'failed') lines.push(rel + ' :: ' + String(a.fullName ?? a.status))
      }
    }
    failures = [...new Set(lines)].sort()
  } else {
    // 形状异常要响亮：绝不能把"读不到"当成"没有失败"
    console.error('[test-baseline] 未能读取 vitest JSON 报告（' + outFile + '）——本次读数不可信')
    process.exit(2)
  }

  const tsc = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'])
  const tscErrors = tsc.out.split('\n').filter(l => l.includes('error TS')).length

  return { failures, total, passed, files, tscExit: tsc.code, tscErrors, fingerprint: worktreeFingerprint() }
}

/** 指纹的一行展示（两种模式都打印）。 */
function printFingerprint(c: Collected): void {
  console.log('[工作树指纹] HEAD ' + c.fingerprint.head + ' · ' + c.fingerprint.diffstat)
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function refresh(): void {
  const c = collect()
  printFingerprint(c)
  console.log('[采集] vitest 失败 ' + c.failures.length + ' 条 / 共 ' + c.total + ' 用例（通过 ' + c.passed + '）')
  console.log('[采集] 文件：' + c.files.failed + ' failed / ' + c.files.passed + ' passed / ' + c.files.skipped + ' skipped')
  console.log('[采集] tsc 退出码 ' + c.tscExit + ' · error TS ' + c.tscErrors + ' 条')

  writeFileSync(BASELINE_TXT, c.failures.length > 0 ? c.failures.join('\n') + '\n' : '', 'utf8')

  // 保留既有「刷新历史」表行，追加本次一行（基线是现行件，历史只增不删）
  let historyRows: string[] = []
  if (existsSync(BASELINE_MD)) {
    const prev = readFileSync(BASELINE_MD, 'utf8')
    const at = prev.indexOf('## 刷新历史')
    if (at >= 0) {
      historyRows = prev
        .slice(at)
        .split('\n')
        .filter(l => l.startsWith('| 20'))
    }
  }
  const row = '| ' + stamp() + ' | `' + c.fingerprint.head + '` | ' + c.fingerprint.diffstat.replace(/\|/g, '/')
    + ' | ' + c.failures.length + ' | ' + (c.tscExit === 0 ? '0' : String(c.tscErrors) + '（退出码 ' + c.tscExit + '）') + ' | 本需求窗口 agent | 首次建立 / 刷新基线 |'

  writeFileSync(BASELINE_MD, [
    '# 现行回归基线（test-baseline）',
    '',
    '> 本文件是**现行**基线，不是历史快照：`--refresh` 覆盖上半部分，只在「刷新历史」表追加一行。',
    '> `docs/requirements/**` 里的基线数字是**当时的快照，不追改**（证据优先）。',
    '',
    '## 现行基线（采集于 ' + stamp() + '）',
    '',
    '- 工作树指纹：HEAD `' + c.fingerprint.head + '` · `' + c.fingerprint.diffstat + '`',
    '- vitest：失败用例 **' + c.failures.length + '** 条 / 共 ' + c.total + ' 用例（通过 ' + c.passed + '）',
    '- vitest 文件：' + c.files.failed + ' failed / ' + c.files.passed + ' passed / ' + c.files.skipped + ' skipped',
    '- tsc：`退出码 ' + c.tscExit + '`，error TS **' + c.tscErrors + '** 条',
    '- 失败用例集合：见 `docs/reviews/test-baseline.failures.txt`（逐条 `文件 :: 用例名`）',
    '- 采集命令：`npx tsx scripts/test-baseline.mts --refresh`',
    '',
    '## 判据（怎么算过）',
    '',
    '- `npx tsx scripts/test-baseline.mts --check` → 输出差集为空、**exit 0** ⇒ 本次改动零新增失败。',
    '- 差集非空 ⇒ exit 1，先逐条确认是否本次引入；**确认非本次引入**才允许 `--refresh`（刷基线 = 承认现状）。',
    '- 口径是**集合差**，不是计数上限：数字过期不会让判据失效。',
    '- 基线文件缺失 ⇒ exit 1 并报「没有基线，先 refresh」——**缺基线不得当作通过**。',
    '',
    '## 刷新历史',
    '',
    '| 日期 | HEAD | 工作树指纹摘要 | 失败用例数 | tsc | 刷新人 | 理由 |',
    '|---|---|---|---|---|---|---|',
    ...historyRows,
    row,
    '',
  ].join('\n'), 'utf8')

  console.log('[写入] ' + BASELINE_TXT.replace(ROOT + '/', '') + '（' + c.failures.length + ' 行）')
  console.log('[写入] ' + BASELINE_MD.replace(ROOT + '/', ''))
}

function check(): void {
  // 缺基线要**快速失败**：先判存在性再跑全量——否则白等两分钟才说"没有基线"，
  // 而"缺基线"是必须在跑之前就说清的事（不得把缺基线当作通过，RV-5）。
  if (!existsSync(BASELINE_TXT)) {
    console.error('[test-baseline] 没有基线：' + BASELINE_TXT.replace(ROOT + '/', '') + ' 不存在')
    console.error('[test-baseline] 先跑 npx tsx scripts/test-baseline.mts --refresh 建立基线（缺基线不得当作通过）')
    process.exit(1)
  }

  const c = collect()
  printFingerprint(c)

  const baseline = readFileSync(BASELINE_TXT, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const now = new Set(c.failures)
  const was = new Set(baseline)
  const added = [...now].filter(x => !was.has(x)).sort()
  const gone = [...was].filter(x => !now.has(x)).sort()

  console.log('[基线] 本次失败 ' + c.failures.length + ' 条 · 基线 ' + baseline.length + ' 条')
  console.log('[差集] 新增失败 ' + added.length + ' / 不再失败 ' + gone.length)
  console.log('[口径] tsc 退出码 ' + c.tscExit + ' · error TS ' + c.tscErrors + ' 条（本命令不改写基线）')
  if (added.length > 0) {
    console.log('\n── 新增失败（本次引入，需先解释）──')
    // 为什么要逐个文件单独复跑：实测存在**顺序相关**的偶发失败——`tests/reqboard/settings-init.test.ts`
    // 单独跑 5/5 通过，但在某次全量里失败（一次观察：连续 3 次全量中 1 次出现）。
    // 若不区分，判据就会"喊狼来了"，而喊狼来了的判据正是本需求要治的病（会被无视）。
    // 注意：**只标注、不放行**——单独跑通过也仍然 exit 1（不制造假绿通道），
    // 但把"该去看套件内污染还是看本次改动"这个判断交给读者，而不是让他白查一轮。
    const byFile = new Map<string, string[]>()
    for (const x of added) {
      const file = x.split(' :: ')[0] ?? x
      byFile.set(file, [...(byFile.get(file) ?? []), x])
    }
    for (const [file, cases] of byFile) {
      const solo = run('npx', ['vitest', 'run', file, '--reporter=dot'])
      const summary = /^\s*Tests\s+(.+)$/m.exec(solo.out)?.[1] ?? '(未取到汇总行)'
      const stillFails = /failed/.test(summary)
      console.log('  ' + (stillFails ? '[真新增]' : '[顺序相关？]') + ' ' + file
        + ' —— 单独跑：' + summary.trim() + '（本文件新增 ' + cases.length + ' 条）')
      for (const x of cases) console.log('       + ' + (x.split(' :: ')[1] ?? x))
      if (!stillFails) {
        console.log('       提示：单独跑通过 ⇒ 疑似**套件内污染/顺序相关**，请先确认不是本次改动引起，再决定是否 --refresh')
      }
    }
  }
  if (gone.length > 0) {
    console.log('\n── 不再失败（已修好，可用 --refresh 落账）──')
    for (const x of gone) console.log('  - ' + x)
  }

  if (added.length > 0 || gone.length > 0) {
    console.error('\n[test-baseline] FAIL：失败用例集合与基线不一致')
    console.error('[test-baseline] 先逐条确认是否本次引入；确认非本次引入才 npx tsx scripts/test-baseline.mts --refresh')
    process.exit(1)
  }
  console.log('[test-baseline] OK：失败用例集合与基线一致（集合差为空）')
}

const mode = process.argv.includes('--refresh') ? 'refresh' : process.argv.includes('--check') ? 'check' : undefined
if (mode === 'refresh') refresh()
else if (mode === 'check') check()
else {
  console.error('用法：npx tsx scripts/test-baseline.mts --refresh | --check')
  process.exit(2)
}
