/**
 * 真数据取证（REQ-261004154937-2ca3 · FR-1 / FR-5）：**聚合规则 vs 独立复算**。
 *
 * 为什么这么比：单测证明的是「给定假数据，规则算得对」；这里要证明的是
 * 「**真实的 ~/.dsh/sessions 数据上**，本仓的 `descendantsOf` + 合计，与一份**不 import 本仓代码**的
 * 朴素做法（对每个会话向上走 parentSession 链）得到同一个答案」——规则实现与直觉定义对得上。
 *
 * 两边的成员**用量**都来自同一份日志折叠（`assistant/message` 的 usage，同 (turn,step) 取最后一次），
 * 因为「用量本身」不是本需求要验的东西（那是 DSH 投影的职责），本需求要验的是**血缘与合计**。
 *
 * 用法：./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts [rootSessionId]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { descendantsOf, sumMembers, type LineageHeader } from '../../../../src/domain/token/lineage.ts'
import type { TokenBuckets } from '../../../../src/shared/protocol.ts'

const ROOT = process.argv[2] ?? 'session-5c6b1a8b-3234-4f35-b28f-1f1a20834721'
const SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions')

interface Row {
  header: LineageHeader
  totals: TokenBuckets
}

const empty = (): TokenBuckets => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
const total = (b: TokenBuckets): number => b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens
const bucketOf = (u: Record<string, unknown>): TokenBuckets => ({
  uncachedInputTokens: Number(u['inputTokens'] ?? 0),
  outputTokens: Number(u['outputTokens'] ?? 0),
  cacheReadTokens: Number(u['cacheReadTokens'] ?? 0),
  cacheWriteTokens: Number(u['cacheWriteTokens'] ?? 0),
})

/** 从一条会话日志折叠出该会话自身的累计用量（与 DSH token-meter 同规则的近似复算）。 */
function foldLog(raw: string): { header: Record<string, unknown> | undefined; totals: TokenBuckets } {
  let header: Record<string, unknown> | undefined
  let totals = empty()
  let last: { turn: unknown; step: unknown; buckets: TokenBuckets } | undefined
  for (const line of raw.split('\n')) {
    const text = line.trim()
    if (text.length === 0) continue
    let ev: Record<string, unknown>
    try { ev = JSON.parse(text) as Record<string, unknown> } catch { continue }
    if (header === undefined && ev['type'] === 'session') { header = ev; continue }
    const type = ev['type']
    if (type !== 'assistant/message' && type !== 'assistant/attempt') continue
    const data = (ev['data'] ?? {}) as Record<string, unknown>
    let usage = data['usage'] as Record<string, unknown> | undefined
    if (usage === undefined && Array.isArray(data['stream'])) {
      const chunks = data['stream'] as Array<Record<string, unknown>>
      for (let i = chunks.length - 1; i >= 0; i -= 1) {
        const ch = chunks[i]
        if (ch?.['type'] === 'usage' && typeof ch['usage'] === 'object') { usage = ch['usage'] as Record<string, unknown>; break }
      }
    }
    if (usage === undefined) continue
    const b = bucketOf(usage)
    const same = last !== undefined && last.turn === data['turn'] && last.step === data['step']
    const prev = same ? last!.buckets : empty()
    totals = {
      uncachedInputTokens: totals.uncachedInputTokens - prev.uncachedInputTokens + b.uncachedInputTokens,
      outputTokens: totals.outputTokens - prev.outputTokens + b.outputTokens,
      cacheReadTokens: totals.cacheReadTokens - prev.cacheReadTokens + b.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens - prev.cacheWriteTokens + b.cacheWriteTokens,
    }
    last = { turn: data['turn'], step: data['step'], buckets: b }
  }
  return { header, totals }
}

/** 扫全部工作区的会话目录，读 header + 折叠用量。 */
function loadAll(): Row[] {
  const rows: Row[] = []
  for (const ws of readdirSync(SESSIONS_ROOT)) {
    const wsDir = join(SESSIONS_ROOT, ws)
    if (!statSync(wsDir).isDirectory()) continue
    for (const dir of readdirSync(wsDir)) {
      const file = join(wsDir, dir, 'session.v4.jsonl.zstd')
      if (!existsSync(file)) continue
      let raw = ''
      try { raw = execFileSync('zstd', ['-dc', file], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8') } catch { continue }
      const { header, totals } = foldLog(raw)
      if (header === undefined || typeof header['id'] !== 'string') continue
      rows.push({
        header: {
          id: header['id'] as string,
          ...(typeof header['parentSession'] === 'string' ? { parentSession: header['parentSession'] as string } : {}),
          ...(header['origin'] === 'subagent' ? { origin: 'subagent' as const } : {}),
          ...(typeof header['delegationDepth'] === 'number' ? { delegationDepth: header['delegationDepth'] as number } : {}),
        },
        totals,
      })
    }
  }
  return rows
}

const rows = loadAll()
const byId = new Map(rows.map(r => [r.header.id, r] as const))
const self = byId.get(ROOT)

// ── A：本仓实现（descendantsOf + sumMembers） ──────────────────────────────
const kids = descendantsOf(rows.map(r => r.header), ROOT)
const memberRows = kids.map(k => byId.get(k.sessionId)).filter((r): r is Row => r !== undefined)
const aTotals = sumMembers([
  ...(self === undefined ? [] : [{ sessionId: self.header.id, depth: 0, totals: self.totals }]),
  ...memberRows.map((r, i) => ({ sessionId: r.header.id, depth: kids[i]?.depth ?? 1, totals: r.totals })),
])

// ── B：独立复算（不 import 本仓规则：对每个会话向上走 parentSession 链） ──
function isDescendantByWalkingUp(header: LineageHeader): boolean {
  if (header.origin !== 'subagent' && (header.delegationDepth ?? 0) < 1) return false
  let cursor = header.parentSession
  let hops = 0
  while (cursor !== undefined && hops < 64) {
    if (cursor === ROOT) return true
    cursor = byId.get(cursor)?.header.parentSession
    hops += 1
  }
  return false
}
const independent = rows.filter(r => isDescendantByWalkingUp(r.header))
const bTotals = [self, ...independent].filter((r): r is Row => r !== undefined)
  .map(r => r.totals)
  .reduce((acc, b) => ({
    uncachedInputTokens: acc.uncachedInputTokens + b.uncachedInputTokens,
    outputTokens: acc.outputTokens + b.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens + b.cacheWriteTokens,
  }), empty())

console.log('会话总数（本工作区索引到的全部） =', rows.length)
console.log('根会话                          =', ROOT, self === undefined ? '（未找到，只有后代）' : '')
console.log('A 本仓实现 · 成员数             =', 1 + memberRows.length, '（含自身）')
console.log('B 独立复算 · 成员数             =', bTotals !== undefined ? (self === undefined ? independent.length : 1 + independent.length) : 0)
console.log('A 聚合读数(total tokens)        =', total(aTotals))
console.log('B 独立复算(total tokens)        =', total(bTotals))
console.log('差额                            =', total(aTotals) - total(bTotals))
console.log('自身用量                        =', self === undefined ? 'n/a' : total(self.totals))
console.log('后代用量合计                    =', memberRows.reduce((n, r) => n + total(r.totals), 0))
console.log('四桶（A）                       =', JSON.stringify(aTotals))

if (total(aTotals) !== total(bTotals)) {
  console.error('FAIL：聚合规则与独立复算不一致——必须解释清楚（已知偏差表）才能算过')
  process.exit(1)
}
console.log('PASS：聚合规则（descendantsOf + 合计）与「向上走 parentSession 链」的独立复算逐字节一致')
