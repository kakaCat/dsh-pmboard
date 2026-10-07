/**
 * 红基线分诊守卫（REQ-261006201814-ac4f FR-4 · t-6ce03a）
 *
 * ## 它守什么
 *
 * 现行基线（`docs/reviews/test-baseline.failures.txt`，68 条）是**集合差**口径的判据来源：
 * `baseline:refresh` 只承认现状、不判对错。于是有一条被放行的捷径——**refresh 把新失败一起洗绿**。
 * 本守卫把「哪些失败是反向/异常路径用例（要留着）、哪些是别的（架构债 / 断言形状 / 夹具漂移）」
 * 从一句声称变成**可失败的机械对账**：
 *
 *   ① `reverse ∪ other == failures`（**双向**）—— 只查一个方向会漏两件事：
 *      failures 里的**新**条目没被分诊（refresh 洗绿）、分类里的**旧**条目已从基线消失（欠收敛）。
 *   ② `reverse ∩ other == ∅` —— 同一行不许两处都登记（否则计数各自好看、实为一笔账两份）。
 *   ③ 两份 txt 与 failures **逐字同格式**（每行 `文件 :: 用例全名`，UTF-8 无 BOM，换行收尾）——
 *      同格式才能用集合运算对账；格式不同就得写第二套解析（本仓「两份真相」教训）。
 *   ④ notes front-matter 的计数 == 两份 txt 的实际行数（**逐字一致**），且 notes 的用例列集合
 *      与 reverse.txt **双向相等**（用例列是 reverse 的投影，不是第二份清单）。
 *   ⑤ `红因类别` 命中受控枚举；`红线内可达性` 与类别自洽（见 REACH_BY_CAUSE）。
 *   ⑥ **棘轮**：reverse / other / unknown 三个计数只减不增（上界冻结在 FROZEN）。
 *
 * ## 红因类别怎么定的（本卡采用的判据，供复核）
 *
 * | 类别 | 含义 | 修复点 | 红线内可达性 |
 * |---|---|---|---|
 * | `src-debt` | 红因是被冻结的 `src` 行为缺失/违规（门没挂上、旧字段照样驱动），本需求红线内**不可达** | `src/`（须另立需求） | 不可达 |
 * | `assertion-shape` | 行为在场但**形状**变了（错误码改名、返回体换键、列表多一项、通道刻意删除） | 用例期望 | 可 |
 * | `fixture-drift` | 用例**自己的夹具**不满足新增前置（新语义要求的设计任务表 / D-x 节 / 新必填端口），跑不到被断言的行为 | 用例夹具 | 可 |
 * | `order-dependent` | 结果取决于其它用例或共享工作树状态（本卡实测无此类） | 用例编排 | 可 |
 * | `unknown` | 本次证据不足以定性（**限期清零**，计入棘轮上界） | 待补勘定 | 不可达 |
 *
 * 「可达」= 修复点在测试/夹具侧，即本需求红线（**不改 `src/`**）之内可达；
 * 「不可达」= 必须动 `src/`，本需求内做不到，须另立需求。
 *
 * ## 与演练的关系
 *
 * 反向演练（把一条假失败追加进 failures.txt → 本守卫必须红 → 逐字节还原）**不**写进本文件：
 * 它要改工作树，正是本需求 FR-5 禁止的形态。演练由 `tests/drill/triage-baseline.mts`（只读、只报告）
 * 与人工/脚本一次一跑完成，纪律沿用 `scripts/reverse-drill-matrix.mts`（文件级备份 + sha256 + 并发写入检测）。
 *
 * @module dsh-pmboard/tests/baseline-triage
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FAILURES_TXT = join(ROOT, 'docs/reviews/test-baseline.failures.txt')
const REVERSE_TXT = join(ROOT, 'docs/reviews/test-baseline.reverse.txt')
const OTHER_TXT = join(ROOT, 'docs/reviews/test-baseline.other.txt')
const NOTES_MD = join(ROOT, 'docs/reviews/test-baseline.reverse.notes.md')

/** `红因类别` 受控枚举（设计 data-model.md §test-baseline.reverse.notes.md）。 */
const RED_CAUSES = ['src-debt', 'assertion-shape', 'fixture-drift', 'order-dependent', 'unknown'] as const
type RedCause = (typeof RED_CAUSES)[number]

/** 类别 ⇒ 红线内可达性（设计口径；此表把「为什么可/不可达」钉成断言，避免两列各说各话）。 */
const REACH_BY_CAUSE: Readonly<Record<RedCause, string>> = {
  'src-debt': '不可达',
  'assertion-shape': '可',
  'fixture-drift': '可',
  'order-dependent': '可',
  unknown: '不可达',
}

/** 合法可达性取值。 */
const REACHES = ['可', '不可达'] as const

/**
 * 棘轮上界（**冻结值**，只许降不许升）。
 *
 * 这三个数不是「现状读数」而是「承认现状的封顶」：把分类文件里的条目搬走（收敛）⇒ 数字可以降；
 * 想加条目 ⇒ 先过红线审核并在这里显式改上界（一次可见的、要被复核的动作），而不是静默增长。
 * 与 notes front-matter 的双重记账：front-matter 是产物内的自述，这里是守卫侧的独立上界——
 * 两边同时改才放行，单改一边即红。
 */
const FROZEN = { reverse: 18, other: 50, unknown: 1 } as const

/** 一行 `文件 :: 用例全名`（用例全名里可能有空格与中文，故只钉「非空 + 不含竖线 + 有分隔符」）。 */
const ENTRY_RE = /^[^|\s]+ :: .+$/

/** 读原始字节。**缺文件直接抛**（缺清单不得当作通过——这里的响亮优先于漂亮）。 */
function readRaw(path: string, label: string): Buffer {
  if (!existsSync(path)) throw new Error(`${label} 缺失：${path}（缺清单不得当作通过）`)
  return readFileSync(path)
}

/** 拆成逐字行（不做断言；格式断言放在具名用例里，红的时候能点名是哪一份、哪一条）。 */
function toLines(raw: Buffer): string[] {
  const text = raw.toString('utf8')
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.length === 0 ? [] : body.split('\n')
}

/** 一份 txt 的格式判据（三份共用）：返回违规清单（空 = 合格式）。 */
function formatViolations(raw: Buffer, lines: readonly string[]): string[] {
  const out: string[] = []
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) out.push('带 UTF-8 BOM')
  if (raw.toString('utf8').includes('\r')) out.push('含 CR（换行须为 LF）')
  if (raw.length > 0 && !raw.toString('utf8').endsWith('\n')) out.push('未以换行收尾')
  if (lines.length === 0) out.push('空清单')
  for (const line of lines) {
    if (!ENTRY_RE.test(line)) out.push(`不合「文件 :: 用例全名」的行：${line}`)
  }
  return out
}

interface NoteRow {
  entry: string
  cause: string
  reach: string
  evidence: string
}

/** 解析 notes.md：front-matter（`key: value`）+ 四列表格（用例 / 红因类别 / 红线内可达性 / 证据）。 */
function readNotes(path: string): { front: Map<string, string>; rows: NoteRow[] } {
  if (!existsSync(path)) throw new Error(`notes 缺失：${path}（缺逐条红因不得当作通过）`)
  const text = readFileSync(path, 'utf8')
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (fm === null) throw new Error('notes 必须以 front-matter（--- 包裹）开头')
  const front = new Map<string, string>()
  for (const line of fm[1].split('\n')) {
    const m = /^([a-z_]+):[ \t]*(\S+)[ \t]*$/.exec(line)
    if (m === null) throw new Error(`front-matter 行无法解析（应为 key: value）：${line}`)
    front.set(m[1], m[2])
  }
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((l) => l.startsWith('| 用例'))
  if (headerIdx < 0) throw new Error('notes 缺少表头「| 用例（文件 :: 用例全名） | …」')
  if (!/^\|(\s*:?-{3,}:?\s*\|)+$/.test(lines[headerIdx + 1] ?? '')) throw new Error('notes 表头后缺少分隔行')
  const body = lines.slice(headerIdx + 2).filter((l) => l.trim().length > 0)
  const rows: NoteRow[] = []
  for (const line of body) {
    if (!line.startsWith('|') || !line.endsWith('|')) throw new Error(`notes 表格后不应再有非表格内容：${line}`)
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 4) throw new Error(`notes 每行必须恰好四列（用例/红因类别/红线内可达性/证据）：${line}`)
    rows.push({ entry: cells[0], cause: cells[1], reach: cells[2], evidence: cells[3] })
  }
  return { front, rows }
}

/** 集合双向相等：返回两个方向各自多出来的元素（空 = 相等）。 */
function bothWays(a: readonly string[], b: readonly string[]): { onlyA: string[]; onlyB: string[] } {
  const A = new Set(a)
  const B = new Set(b)
  return { onlyA: a.filter((x) => !B.has(x)), onlyB: b.filter((x) => !A.has(x)) }
}

const failuresRaw = readRaw(FAILURES_TXT, 'failures.txt')
const reverseRaw = readRaw(REVERSE_TXT, 'reverse.txt')
const otherRaw = readRaw(OTHER_TXT, 'other.txt')
const failures = toLines(failuresRaw)
const reverse = toLines(reverseRaw)
const other = toLines(otherRaw)
const notes = readNotes(NOTES_MD)
const noteEntries = notes.rows.map((r) => r.entry)
const unknownCount = notes.rows.filter((r) => r.cause === 'unknown').length
/** 三份 txt：标签 + 原始字节 + 逐字行（格式/纪律用例共用）。 */
const TXTS = [
  ['failures.txt', failuresRaw, failures],
  ['reverse.txt', reverseRaw, reverse],
  ['other.txt', otherRaw, other],
] as const

describe('红基线分诊：两份 txt 的集合不变量（FR-4）', () => {
  it('两份 txt 与 failures 逐字同格式（UTF-8 无 BOM / LF / 换行收尾 / 每行「文件 :: 用例全名」）', () => {
    for (const [label, raw, lines] of TXTS) {
      expect(formatViolations(raw, lines), `${label} 格式违规`).toEqual([])
    }
  })

  it('写入纪律：三份都按字典序、无重复行（确定性顺序，便于逐字节 diff）', () => {
    for (const [label, , lines] of TXTS) {
      expect([...lines].sort(), `${label} 未按字典序排好（同 failures.txt 的写入约定）`).toEqual(lines)
      expect(new Set(lines).size, `${label} 有重复行`).toBe(lines.length)
    }
  })

  it('reverse ∪ other == failures（双向：新失败必须分诊、消失条目必须收敛）', () => {
    const failureSet = new Set(failures)
    const revSet = new Set(reverse)
    const othSet = new Set(other)
    // 方向一：failures 里既不在 reverse 也不在 other 的条目 —— 「refresh 洗绿」的机械落点
    const unclassified = failures.filter((e) => !revSet.has(e) && !othSet.has(e))
    expect(
      unclassified,
      '这些失败既不在 reverse.txt 也不在 other.txt：不许用 baseline:refresh 把它们一起洗绿——'
        + '先逐条分诊（或确属本次引入则修掉）再刷新',
    ).toEqual([])
    // 方向二：分类里登记了但基线已没有的条目 —— 欠收敛，随刷新同步删并降棘轮
    const stale = [...reverse, ...other].filter((e) => !failureSet.has(e))
    expect(
      stale,
      '这些条目已在反向/其余清单里、但现行基线不含：请随基线刷新把分类同步收敛（三个计数只减不增）',
    ).toEqual([])
  })

  it('reverse ∩ other == ∅（同一行不许两处登记）', () => {
    const otherSet = new Set(other)
    expect(reverse.filter((e) => otherSet.has(e)), '这些行同时出现在 reverse.txt 与 other.txt').toEqual([])
  })

  it('计数自洽：reverse + other == failures 条数', () => {
    expect(reverse.length + other.length).toBe(failures.length)
  })

  it('棘轮：reverse / other 计数不得超过冻结上界（只减不增）', () => {
    expect(reverse.length, `reverse 计数超过冻结上界 ${FROZEN.reverse}`).toBeLessThanOrEqual(FROZEN.reverse)
    expect(other.length, `other 计数超过冻结上界 ${FROZEN.other}`).toBeLessThanOrEqual(FROZEN.other)
  })
})

describe('红基线分诊：notes 的逐条记账（FR-4）', () => {
  it('front-matter 计数与两份 txt 实际行数逐字一致', () => {
    expect(notes.front.get('reverse_count'), 'front-matter 缺 reverse_count').toBe(String(reverse.length))
    expect(notes.front.get('other_count'), 'front-matter 缺 other_count').toBe(String(other.length))
    expect(notes.front.get('unknown_count'), 'front-matter 缺 unknown_count').toBe(String(unknownCount))
  })

  it('用例列集合与 reverse.txt 双向相等（notes 是 reverse 的投影，不是第二份清单）', () => {
    const { onlyA, onlyB } = bothWays(noteEntries, reverse)
    expect(onlyA, 'notes 有、reverse.txt 没有的用例').toEqual([])
    expect(onlyB, 'reverse.txt 有、notes 没有逐条红因的用例').toEqual([])
  })

  it('红因类别命中受控枚举，红线内可达性与类别自洽', () => {
    for (const row of notes.rows) {
      const cause = row.cause as RedCause
      expect(RED_CAUSES as readonly string[], `红因类别越界：${row.cause}（${row.entry}）`).toContain(row.cause)
      expect(REACHES as readonly string[], `红线内可达性越界：${row.reach}（${row.entry}）`).toContain(row.reach)
      expect(row.reach, `${row.entry}：${cause} 的可达性应为「${REACH_BY_CAUSE[cause]}」`).toBe(REACH_BY_CAUSE[cause])
    }
  })

  it('证据列非空且不是占位符（命令 + 输出摘要 / 源码锚点）', () => {
    for (const row of notes.rows) {
      expect(row.evidence.length, `${row.entry} 的证据列过短`).toBeGreaterThanOrEqual(8)
      expect(['-', 'todo', 'TODO', '待补', '待定'], `${row.entry} 的证据列仍是占位符`).not.toContain(row.evidence)
    }
  })

  it('棘轮：unknown 计数不得超过冻结上界（限期清零）', () => {
    expect(unknownCount, `unknown 计数超过冻结上界 ${FROZEN.unknown}：` + '待勘定条目须逐条定性并下调上界')
      .toBeLessThanOrEqual(FROZEN.unknown)
  })
})
