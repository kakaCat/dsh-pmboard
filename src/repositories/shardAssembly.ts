/**
 * 分片**装配**（REQ-261002161439-277d · t5 抽出）——把「热记录 + 日志 + 外置对象」拼回
 * 与现状同形的 `RequirementRecord`。
 *
 * 为什么单独成模块：**读侧与写侧都要用它**。读侧 `get()` 要全量装配；写侧要先装配出 draft
 * 才能交给变更器改。两处各写一份装配必然漂移（症状：读到的和写回去的不是同一份事实）。
 *
 * ## 三条口径
 *
 * 1. **计数缺失 → 告警 + 按 0 装配**：宁少读已提交数据，也不把未提交的尾巴暴露出去（I-2 单向）。
 * 2. **计数与日志不符 → 告警 + 按磁盘现有有效行装配**：不因历史缺失把整条需求读成空。
 * 3. **剔掉 v10 内部计数字段**：`commentCount`/`historyCount`/`artifactCount` 属于热记录，
 *    不属于对外记录（留着会让端口返回的记录与现状形状不一致）。
 *
 * @module dsh-pmboard/repositories/shardAssembly
 */
import type { AdvanceRecord, CommentRecord, RequirementRecord, StatusEvent } from '../shared/protocol.js'
import type { RequirementCounts, RequirementHistoryEntry } from '../application/ports.js'
import { commentOf, statusEventOf, advanceRecordOf, truncateByCount, type JournalLine } from '../domain/requirement/Journal.js'
import type { JournalReadResult, RequirementShardRepository } from './RequirementShardRepository.js'

/** 装配一条需求所需的全部材料。 */
export interface RequirementParts {
  readonly record: RequirementRecord
  readonly comments: readonly CommentRecord[]
  readonly history: readonly RequirementHistoryEntry[]
  readonly objects: {
    readonly artifacts?: unknown
    readonly plan?: unknown
    readonly verification?: unknown
    readonly archive?: unknown
  }
}

/** 计数截断；数据丢失时**告警并按现有有效行**装配（不因历史缺失把需求读不出来）。 */
function truncateOrWarn(id: string, kind: string, lines: JournalLine[], count: number, onWarn: (m: string) => void): JournalLine[] {
  try {
    return truncateByCount(lines, count)
  } catch (err) {
    onWarn(`日志 ${id}/${kind}.jsonl 与提交点不符（${(err as Error).message}）——按磁盘现有有效行装配，请人工核查该分片`)
    return lines.filter((l) => l.seq < count).sort((a, b) => a.seq - b.seq)
  }
}

function toComments(id: string, journal: JournalReadResult, count: number, onWarn: (m: string) => void): readonly CommentRecord[] {
  if (journal.malformed > 0) onWarn(`日志 ${id}/comments.jsonl 有 ${journal.malformed} 行结构损坏（未计入有效行）`)
  return truncateOrWarn(id, 'comments', [...journal.lines], count, onWarn).map((l) => commentOf(l as never))
}

function toHistory(id: string, journal: JournalReadResult, count: number, onWarn: (m: string) => void): readonly RequirementHistoryEntry[] {
  if (journal.malformed > 0) onWarn(`日志 ${id}/history.jsonl 有 ${journal.malformed} 行结构损坏（未计入有效行）`)
  const out: RequirementHistoryEntry[] = []
  for (const line of truncateOrWarn(id, 'history', [...journal.lines], count, onWarn)) {
    // 先用 `'kind' in line` 收窄：评论行没有 kind（也提醒"两类行混进了同一个文件"）
    if (!('kind' in line)) {
      onWarn(`日志 ${id}/history.jsonl 的 seq=${line.seq} 是评论行（不该出现在历史文件里），已忽略`)
      continue
    }
    out.push(line.kind === 'status'
      ? { kind: 'status', event: statusEventOf(line) }
      : { kind: 'advance', record: advanceRecordOf(line) })
  }
  return out
}

/** 热侧优先、未命中回落冷侧；两侧都没有 → `undefined`。 */
export async function loadParts(
  repo: RequirementShardRepository,
  root: string,
  id: string,
  onWarn: (message: string) => void,
): Promise<RequirementParts | undefined> {
  const hot = await repo.readRecord(root, id)
  const cold = hot === undefined
  const record = hot ?? (await repo.readRecord(root, id, { cold: true }))
  if (record === undefined) return undefined
  const opts = cold ? { cold: true } : {}
  const counts = record as RequirementRecord & Partial<RequirementCounts>
  if (counts.commentCount === undefined || counts.historyCount === undefined) {
    onWarn(`分片 ${id} 缺少提交点计数（commentCount/historyCount），日志按 0 条装配——可能少读已提交内容；请检查该分片是否为 v10 形态`)
  }
  const [commentJournal, historyJournal, artifacts, plan, verification, archive] = await Promise.all([
    repo.readJournal(root, id, 'comments', opts),
    repo.readJournal(root, id, 'history', opts),
    repo.readObject(root, id, 'artifacts', opts),
    repo.readObject(root, id, 'plan', opts),
    repo.readObject(root, id, 'verification', opts),
    repo.readObject(root, id, 'archive', opts),
  ])
  return {
    record,
    comments: toComments(id, commentJournal, counts.commentCount ?? 0, onWarn),
    history: toHistory(id, historyJournal, counts.historyCount ?? 0, onWarn),
    objects: {
      ...(artifacts !== undefined ? { artifacts } : {}),
      ...(plan !== undefined ? { plan } : {}),
      ...(verification !== undefined ? { verification } : {}),
      ...(archive !== undefined ? { archive } : {}),
    },
  }
}

/**
 * 装配成对外记录：注入大字段、回填 `advance.history`、**剔掉 v10 内部计数**。
 *
 * 返回的是**新对象**（不改入参）：读侧要保证"出口是副本"，写侧还要拿原 draft 做差异比对。
 */
export function assembleRecord(parts: RequirementParts): RequirementRecord {
  const raw = { ...(parts.record as unknown as Record<string, unknown>) }
  delete raw.commentCount
  delete raw.historyCount
  delete raw.artifactCount
  raw.comments = [...parts.comments]

  const statusHistory = parts.history
    .filter((h): h is { kind: 'status'; event: StatusEvent } => h.kind === 'status')
    .map((h) => h.event)
  const advanceHistory = parts.history
    .filter((h): h is { kind: 'advance'; record: AdvanceRecord } => h.kind === 'advance')
    .map((h) => h.record)
  if (statusHistory.length > 0) raw.statusHistory = statusHistory
  const advance = raw.advance as { history?: AdvanceRecord[] } | undefined
  if (advance !== undefined || advanceHistory.length > 0) {
    raw.advance = { ...(advance ?? {}), ...(advanceHistory.length > 0 ? { history: advanceHistory } : {}) }
  }
  return { ...raw, ...parts.objects } as unknown as RequirementRecord
}

/** 对外记录 → 热记录（标量 + 计数；大字段一律外置）。写侧的提交点用它。 */
export function toHotRecord(record: RequirementRecord, opts: { comments: number; history: number; artifacts: number }): Record<string, unknown> {
  const raw = { ...(record as unknown as Record<string, unknown>) }
  delete raw.comments
  delete raw.statusHistory
  delete raw.artifacts
  delete raw.plan
  delete raw.verification
  delete raw.archive
  if (raw.advance !== undefined && typeof raw.advance === 'object') {
    const advance = { ...(raw.advance as Record<string, unknown>) }
    delete advance.history
    raw.advance = advance
  }
  raw.commentCount = opts.comments
  raw.historyCount = opts.history
  raw.artifactCount = opts.artifacts
  return raw
}
