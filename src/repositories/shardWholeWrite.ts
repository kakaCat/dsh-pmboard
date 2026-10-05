/**
 * 整体写出一个分片（REQ-261002161439-277d · t5）——`replaceAll` 的工件。
 *
 * 与增量写（`ShardedRequirementWriter.commit`）的区别：这里**没有"变更前"可比对**，
 * 只有一条装配形态的记录要落成"热记录 + 日志 + 外置对象"。抽成独立文件的原因有两个：
 * ① 写侧单文件行数门禁；② 它是"导入结构 → 分片布局"的唯一映射点，迁移/回滚脚本的语义就靠它。
 *
 * @module dsh-pmboard/repositories/shardWholeWrite
 */
import type { RequirementRecord } from '../shared/protocol.js'
import { toAdvanceLine, toCommentLine, toStatusLine, type JournalLine } from '../domain/requirement/Journal.js'
import type { RequirementShardRepository } from './RequirementShardRepository.js'
import { toHotRecord } from './shardAssembly.js'

const OBJECT_KINDS = ['artifacts', 'plan', 'verification', 'archive'] as const

/** 把一条装配形态的记录整体写成一份分片（已存在同 id 的分片须先由调用方删除）。 */
export async function writeWholeShard(repo: RequirementShardRepository, root: string, record: RequirementRecord): Promise<void> {
  const comments = record.comments ?? []
  for (const [i, c] of comments.entries()) {
    await repo.appendJournal(root, record.id, 'comments', toCommentLine(i, c), i)
  }
  const historyLines: JournalLine[] = (record.statusHistory ?? []).map((e, i) => toStatusLine(i, e))
  for (const [i, a] of (record.advance?.history ?? []).entries()) {
    historyLines.push(toAdvanceLine((record.statusHistory ?? []).length + i, a))
  }
  for (const [i, line] of historyLines.entries()) {
    await repo.appendJournal(root, record.id, 'history', line, i)
  }
  for (const kind of OBJECT_KINDS) {
    const value = (record as unknown as Record<string, unknown>)[kind]
    if (value !== undefined) await repo.writeObjectAtomic(root, record.id, kind, value)
  }
  await repo.writeRecordAtomic(root, record.id, toHotRecord(record, {
    comments: comments.length,
    history: historyLines.length,
    artifacts: Array.isArray(record.artifacts) ? record.artifacts.length : 0,
  }) as unknown as RequirementRecord)
}
