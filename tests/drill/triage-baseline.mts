#!/usr/bin/env npx tsx
/**
 * 红基线分诊的**只读差集报告**（REQ-261006201814-ac4f FR-4 · t-6ce03a）。
 *
 * ## 它解决什么
 *
 * `tests/baseline-triage.test.ts` 是守卫（红了就说红），但守卫的失败信息只报第一条；
 * 复核人要的是「差在哪几条、各有几条」。本脚本把那句话变成可复跑的一屏报告：
 * **新增**（failures 里有、两份清单都没有 = 未分诊的新失败，refresh 洗绿的入口）、
 * **消失**（两份清单里有、failures 已无 = 欠收敛）、以及计数摘要（含 unknown 棘轮读数）。
 *
 * ## 铁律：只报告，不落盘
 *
 * 本脚本对工作树**一个字节都不写**（只 `readFileSync`）。刷新分类文件是人的动作，不是脚本的：
 * 脚本能自动改，等于把「分诊」降级成「跑一下」——正是本需求要治的病（refresh 洗绿）。
 * 演练（临时改坏 failures.txt → 守卫必须红 → 逐字节还原）同样不在这里自动做：它要写工作树，
 * 且其纪律（文件级备份 + sha256 + 并发写入检测 + 逐字节还原）归属 `scripts/reverse-drill-matrix.mts`。
 *
 * ## 用法与退出码
 *
 *   npx tsx tests/drill/triage-baseline.mts          # 人读报告
 *   npx tsx tests/drill/triage-baseline.mts --json   # 机器可读（同一份读数）
 *
 * 退出码：`0` = 差集为空（两份清单与现行基线完全对得上）；`1` = 有差集（点名每条）；
 * `2` = 文件缺失/读不到（**响亮**：没有清单不得当作通过）。
 *
 * @module dsh-pmboard/tests/drill/triage-baseline
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FAILURES_TXT = join(ROOT, 'docs/reviews/test-baseline.failures.txt')
const REVERSE_TXT = join(ROOT, 'docs/reviews/test-baseline.reverse.txt')
const OTHER_TXT = join(ROOT, 'docs/reviews/test-baseline.other.txt')
const NOTES_MD = join(ROOT, 'docs/reviews/test-baseline.reverse.notes.md')
const GUARD_TEST = join(ROOT, 'tests/baseline-triage.test.ts')

/**
 * 棘轮上界**只读守卫测试**里的那一份（`FROZEN = { reverse, other, unknown }`）：
 * 上界单点在判据侧，脚本不复制第二份——两处各写一次，改一边就静默分叉（本仓「两份真相」教训）。
 * 读不到就报 `null`（不猜数字）：报告里显示「上界未读到」而不是一个看起来可信的假读数。
 */
function readFrozen(): { reverse: number; other: number; unknown: number } | null {
  if (!existsSync(GUARD_TEST)) return null
  const m = /const FROZEN = \{ reverse: (\d+), other: (\d+), unknown: (\d+) \}/.exec(readFileSync(GUARD_TEST, 'utf8'))
  if (m === null) return null
  return { reverse: Number(m[1]), other: Number(m[2]), unknown: Number(m[3]) }
}

const RED_CAUSES = ['src-debt', 'assertion-shape', 'fixture-drift', 'order-dependent', 'unknown'] as const

interface Loaded {
  /** 逐字行（`文件 :: 用例全名`）。 */
  entries: string[]
  /** 形状异常（空行 / 缺分隔符）——响亮报出，绝不静默丢。 */
  malformed: string[]
}

/** 读一份清单：保留逐字行，同时把形状异常单独报出（读不到 ≠ 通过）。 */
function load(path: string, label: string): Loaded {
  if (!existsSync(path)) {
    console.error(`[triage-baseline] ${label} 缺失：${path}（没有清单，先建清单再看差集）`)
    process.exit(2)
  }
  const text = readFileSync(path, 'utf8')
  const raw = text.endsWith('\n') ? text.slice(0, -1) : text
  const lines = raw.length === 0 ? [] : raw.split('\n')
  const entries: string[] = []
  const malformed: string[] = []
  for (const line of lines) {
    if (/^[^|\s]+ :: .+$/.test(line)) entries.push(line)
    else malformed.push(line)
  }
  return { entries, malformed }
}

interface NotesSummary {
  /** front-matter 计数（键 → 值）。 */
  front: Record<string, string>
  /** 表格逐行解析出的（用例 → 红因类别）。 */
  causes: Map<string, string>
  /** 解析异常的行。 */
  malformed: string[]
}

function loadNotes(path: string): NotesSummary | undefined {
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8')
  const front: Record<string, string> = {}
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (fm !== null) {
    for (const line of fm[1].split('\n')) {
      const m = /^([a-z_]+):[ \t]*(\S+)[ \t]*$/.exec(line)
      if (m !== null) front[m[1]] = m[2]
    }
  }
  const causes = new Map<string, string>()
  const malformed: string[] = []
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((l) => l.startsWith('| 用例'))
  if (headerIdx >= 0) {
    for (const line of lines.slice(headerIdx + 2)) {
      if (line.trim().length === 0) continue
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells.length !== 4) {
        malformed.push(line)
        continue
      }
      causes.set(cells[0], cells[1])
    }
  }
  return { front, causes, malformed }
}

const failures = load(FAILURES_TXT, 'failures.txt')
const reverse = load(REVERSE_TXT, 'reverse.txt')
const other = load(OTHER_TXT, 'other.txt')
const notes = loadNotes(NOTES_MD)

const failureSet = new Set(failures.entries)
const classified = [...reverse.entries, ...other.entries]
const classifiedSet = new Set(classified)

/** 新增未分诊：failures 有、两份清单都没有（refresh 洗绿的入口）。 */
const unclassified = failures.entries.filter((e) => !classifiedSet.has(e))
/** 消失欠收敛：两份清单有、failures 已无。 */
const stale = classified.filter((e) => !failureSet.has(e))
/** 互斥违例。 */
const overlapping = reverse.entries.filter((e) => new Set(other.entries).has(e))

const unknownRows = notes === undefined ? [] : [...notes.causes.values()].filter((c) => c === 'unknown')
const badCauses = notes === undefined ? [] : [...notes.causes.entries()].filter(([, c]) => !(RED_CAUSES as readonly string[]).includes(c))
const notesOnly = notes === undefined ? [] : [...notes.causes.keys()].filter((e) => !new Set(reverse.entries).has(e))
const notesMissing = notes === undefined ? [] : reverse.entries.filter((e) => !notes.causes.has(e))

const frontMismatch: string[] = []
if (notes !== undefined) {
  const checks: [string, number][] = [
    ['reverse_count', reverse.entries.length],
    ['other_count', other.entries.length],
    ['unknown_count', unknownRows.length],
  ]
  for (const [key, actual] of checks) {
    const got = notes.front[key]
    if (got !== String(actual)) frontMismatch.push(`${key}: front-matter=${got ?? '(缺)'} / 实际=${actual}`)
  }
}

const malformed = [
  ...failures.malformed.map((l) => ['failures.txt', l] as const),
  ...reverse.malformed.map((l) => ['reverse.txt', l] as const),
  ...other.malformed.map((l) => ['other.txt', l] as const),
  ...(notes?.malformed ?? []).map((l) => ['reverse.notes.md', l] as const),
]

const hasDiff =
  unclassified.length > 0 || stale.length > 0 || overlapping.length > 0
  || notesOnly.length > 0 || notesMissing.length > 0 || frontMismatch.length > 0
  || badCauses.length > 0 || malformed.length > 0

const report = {
  counts: {
    failures: failures.entries.length,
    reverse: reverse.entries.length,
    other: other.entries.length,
    classified: classified.length,
    unknown: unknownRows.length,
    frozen: readFrozen(),
    notes: notes?.front ?? null,
  },
  diff: {
    unclassified,
    stale,
    overlapping,
    notesOnly,
    notesMissing,
    frontMismatch,
    badCauses: badCauses.map(([entry, cause]) => `${entry} :: ${cause}`),
    malformed: malformed.map(([file, line]) => `${file} :: ${line}`),
  },
  verdict: hasDiff ? 'diff' : 'clean',
} as const

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const c = report.counts
  console.log('[triage-baseline] 红基线分诊只读报告（本脚本不写盘）')
  console.log(`  failures=${c.failures}  reverse=${c.reverse}  other=${c.other}  `
    + `并集=${c.classified}${c.classified === c.failures ? '' : `（≠ failures=${c.failures}）`}`)
  console.log(`  unknown=${c.unknown}（棘轮上界 ${c.frozen === null ? '未读到（守卫测试里没有 FROZEN）' : String(c.frozen.unknown)}）  `
    + `notes front-matter=${c.notes === null ? '(缺 notes)' : JSON.stringify(c.notes)}`)
  const section = (title: string, items: readonly string[]): void => {
    console.log(`  ${title}：${items.length} 条`)
    for (const item of items) console.log(`    · ${item}`)
  }
  console.log(`[triage-baseline] 差集（新增 / 消失 / 其它不一致）`)
  section('新增未分诊（在 failures、不在两份清单）', unclassified)
  section('消失欠收敛（在两份清单、不在 failures）', stale)
  section('两清单重叠', overlapping)
  section('notes 有而 reverse.txt 没有', notesOnly)
  section('reverse.txt 有而 notes 缺逐条红因', notesMissing)
  section('front-matter 计数不符', frontMismatch)
  section('红因类别越界', badCauses.map(([entry, cause]) => `${entry} :: ${cause}`))
  section('形状异常行', malformed.map(([file, line]) => `${file} :: ${line}`))
  console.log(hasDiff
    ? '[triage-baseline] 判据：差集非空 → exit 1（先逐条确认再动分类文件）'
    : '[triage-baseline] 判据：差集为空 → exit 0')
}

process.exit(hasDiff ? 1 : 0)
