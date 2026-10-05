/**
 * 追加日志的**文件级 IO**（REQ-261002161439-277d · t3 抽出 / FR-3）。
 *
 * 从 `RequirementShardRepository` 里抽出来，只做两件事：读一份 `.jsonl`、按提交点计数追加一行。
 * 抽出的直接原因是仓储单文件行数门禁（≤400 行），间接收益是这块逻辑与"记录/对象/目录"三类 IO
 * 彻底分开——它自己有一套最微妙的语义（I-2 的截断与压实），值得独立可读。
 *
 * ## I-2 的两条路径
 *
 * - 文件里**没有**未提交尾巴（常态）→ `appendFile`，O(1)；
 * - 有尾巴 / 有坏行 → 截断后**整份重写**（文件长度是唯一允许回退的地方，且这次回退丢弃的是
 *   "从未提交过的字节"，不丢已提交数据）。
 *
 * **为什么重写是安全的（安全性来自上一步，不来自这里）**：`parseJournal` 会丢掉坏行，所以坏行会让
 * `lines.length` 变小；若坏行落在**已提交前缀**里，`truncateByCount` 早就抛 `COUNT_EXCEEDS_LINES` 了。
 * 因此能走到重写的坏行只可能落在**未提交尾巴**上——那些行从未被提交点承认，丢掉它们正是 I-2 的语义。
 *
 * @module dsh-pmboard/repositories/ShardJournalIO
 */
import { dirname } from 'node:path'
import { REQUIREMENT_STORE_ERROR } from '../application/ports.js'
import {
  encodeJournalLine,
  parseJournal,
  truncateByCount,
  type JournalDefect,
  type JournalLine,
} from '../domain/requirement/Journal.js'
import { persistAtomic } from './atomicWrite.js'
import type { ShardFs } from './RequirementShardRepository.js'

/** 一次日志读取的结果（与 `parseJournal` 同形，直接透出，不再包一层）。 */
export interface JournalReadResult {
  readonly lines: readonly JournalLine[]
  readonly malformed: number
  readonly defects: readonly JournalDefect[]
}

/** `ENOENT` 判定（"不存在"是正常路径，不是错误）。 */
export function isNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ENOENT'
}

/** 读一份日志；不存在 → 空日志（不是错误）。IO 失败 → 抛 `IO_FAILED`。 */
export async function readJournalFile(fs: ShardFs, file: string): Promise<JournalReadResult> {
  let text = ''
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (isNotFound(err)) return { lines: [], malformed: 0, defects: [] }
    throw Object.assign(new Error(`分片 I/O 失败：${file}：${(err as Error)?.message ?? String(err)}`), {
      code: REQUIREMENT_STORE_ERROR.IO_FAILED,
      path: file,
      cause: err,
    })
  }
  return parseJournal(text)
}

/**
 * 追加一行日志（按提交点计数截断未提交尾行）。
 *
 * `line.seq` 必须等于 `count`——否则会写出跳号/重复的日志；两者不等即 `VALIDATION_FAILED`。
 * `count > 有效行数` 由 `truncateByCount` 抛 `COUNT_EXCEEDS_LINES`（**数据丢失，不静默**）。
 */
export async function appendJournalLine(
  fs: ShardFs,
  file: string,
  line: JournalLine,
  count: number,
  onWarn: (message: string) => void,
): Promise<void> {
  if (!Number.isInteger(count) || count < 0) {
    throw Object.assign(new Error(`提交点计数必须是非负整数，收到：${String(count)}`), {
      code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
    })
  }
  if (line.seq !== count) {
    throw Object.assign(
      new Error(`日志行 seq(${line.seq}) 必须等于提交点计数(${count})——否则会写出跳号/重复的日志`),
      { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED },
    )
  }
  let existing = ''
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (!isNotFound(err)) {
      throw Object.assign(new Error(`分片 I/O 失败：${file}：${(err as Error)?.message ?? String(err)}`), {
        code: REQUIREMENT_STORE_ERROR.IO_FAILED,
        path: file,
        cause: err,
      })
    }
  }
  const { lines, malformed } = parseJournal(existing)
  const valid = truncateByCount(lines, count) // 数据丢失在这里响亮抛错
  const encoded = encodeJournalLine(line)

  if (malformed === 0 && valid.length === lines.length) {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.appendFile(file, encoded, 'utf8')
    return
  }
  onWarn(`日志 ${file} 需要压实：坏行 ${malformed} 行、未提交尾巴 ${lines.length - valid.length} 行 → 截断后整份重写`)
  await persistAtomic(file, valid.map(encodeJournalLine).join('') + encoded, fs)
}
