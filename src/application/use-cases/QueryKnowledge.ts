/**
 * 知识检索用例（REQ-261001110934-3766 t4 / design/interfaces.md `reqboard_kb`）。
 *
 * 只读、**有预算**：预算内回正文，预算不足只回指针（不返回碎片正文）。
 * 三个选择器（id / kind / query）至少给一个，全给时取交集；
 * `kind='map' | 'tokens'` 的 `query` 会去机器索引（TSV）里找——那是"永远不进上下文"的全量索引，
 * 平时只由这里按需检索。
 *
 * @module dsh-pmboard/application/use-cases/QueryKnowledge
 */
import { domainError, REQBOARD_ERROR_CODES } from '../../domain/errors.js'
import { KB_LIMITS } from '../../domain/knowledge/budget.js'
import { parseEntryDoc } from '../../domain/knowledge/entry.js'
import { KB_KINDS, KB_PATHS, type KbKind } from '../../domain/knowledge/types.js'
import type { UseCaseDeps } from '../ports.js'
import { trimToBudget, type KbCandidate } from '../internal/knowledge-budget.js'
// REQ-261001203710-0fbf t4：判定「读不到」的两种病因时复用唯一口径，不另写一套路径归一
import { sameProjectRoot } from '../internal/support.js'

export interface KbQueryArgs {
  readonly id?: string
  readonly kind?: string
  readonly query?: string
  readonly limit?: number
  readonly budgetChars?: number
  /**
   * 列全部（看板页用）。**只有显式传 true 才生效**——工具的三个选择器全空仍必须报错，
   * 免得 Agent 误以为"什么都没给 = 给我全部"。
   */
  readonly list?: boolean
}

export interface KbQueryItem {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly oneLiner: string
  readonly pointer: string
  readonly updatedAt: string
  readonly body?: string
  readonly truncated?: boolean
}

export interface KbQueryResult {
  readonly items: readonly KbQueryItem[]
  readonly total: number
  readonly truncated: boolean
  readonly budgetChars: number
  readonly hint?: string
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function asInt(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, name + ' 必须是整数（实际 ' + String(v) + '）')
  }
  return n
}

/** 参数解析与校验（非法即 `invalid_input`，带修复指引）。 */
export function parseKbQueryArgs(args: unknown): Required<Pick<KbQueryArgs, 'limit' | 'budgetChars'>> & KbQueryArgs {
  const a = (args ?? {}) as Record<string, unknown>
  const id = asString(a['id'])
  const kindRaw = asString(a['kind'])
  const query = asString(a['query'])
  const list = a['list'] === true || a['list'] === '1' || a['list'] === 'true'
  if (id === undefined && kindRaw === undefined && query === undefined && !list) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      'reqboard_kb 至少要给一个选择器：id / kind / query（三者全给时取交集）',
    )
  }
  let kind: KbKind | undefined
  if (kindRaw !== undefined) {
    if (!(KB_KINDS as readonly string[]).includes(kindRaw)) {
      throw domainError(
        REQBOARD_ERROR_CODES.invalidInput,
        'reqboard_kb 的 kind 非法：' + kindRaw + '（可选 ' + KB_KINDS.join(' / ') + '）',
      )
    }
    kind = kindRaw as KbKind
  }
  const limit = asInt(a['limit'], 'limit') ?? KB_LIMITS.queryDefaultLimit
  if (limit < 1 || limit > KB_LIMITS.queryLimitMax) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      'reqboard_kb 的 limit 必须在 1–' + String(KB_LIMITS.queryLimitMax) + '（实际 ' + String(limit) + '）',
    )
  }
  const budgetChars = asInt(a['budgetChars'] ?? a['budget_chars'], 'budgetChars') ?? KB_LIMITS.queryDefaultBudget
  if (budgetChars < 1 || budgetChars > KB_LIMITS.queryMaxBudget) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      'reqboard_kb 的 budgetChars 必须在 1–' + String(KB_LIMITS.queryMaxBudget) + '（实际 ' + String(budgetChars) + '）',
    )
  }
  return {
    limit,
    budgetChars,
    ...(list ? { list: true } : {}),
    ...(id === undefined ? {} : { id }),
    ...(kind === undefined ? {} : { kind }),
    ...(query === undefined ? {} : { query }),
  }
}

/** 相关性排序：id 精确 > 一句话命中 > 指针命中 > 其余（稳定，同级按 id）。 */
function relevance(row: { id: string; oneLiner: string; pointer: string }, q: string | undefined): number {
  if (q === undefined) return 0
  const needle = q.toLowerCase()
  if (row.id.toLowerCase() === needle) return 0
  if (row.oneLiner.toLowerCase().includes(needle)) return 1
  if (row.pointer.toLowerCase().includes(needle)) return 2
  return 3
}

/** 机器索引（TSV）里按关键词找行：返回 `文件 · 符号/类名` 摘要。 */
async function searchMachineIndex(
  deps: UseCaseDeps,
  kind: KbKind,
  query: string | undefined,
  limit: number,
): Promise<KbCandidate[]> {
  const path = kind === 'map' ? KB_PATHS.symbols : KB_PATHS.classes
  if (!deps.docs.exists(path)) return []
  const text = await deps.docs.read(path)
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const header = lines.shift()
  const needle = (query ?? '').toLowerCase()
  const hits: KbCandidate[] = []
  for (const line of lines) {
    if (needle.length > 0 && !line.toLowerCase().includes(needle)) continue
    const cells = line.split('\t')
    const [file, symbol] = cells
    if (file === undefined || symbol === undefined) continue
    hits.push({
      id: 'kb-' + (kind === 'map' ? 'symbol' : 'class') + '-' + symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      kind,
      title: symbol,
      oneLiner: (kind === 'map' ? '符号 ' : '类名 ') + symbol + ' · ' + file,
      pointer: path + (header === undefined ? '' : ''),
      updatedAt: '',
    })
    if (hits.length >= limit) break
  }
  return hits
}

/** 主入口：检索（只读）。 */
export async function executeQueryKnowledge(deps: UseCaseDeps, args: unknown): Promise<KbQueryResult> {
  const input = parseKbQueryArgs(args)
  const port = deps.knowledge
  if (port === undefined) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '知识层未装配（UseCaseDeps.knowledge 缺失）：检查组合根是否注入 KnowledgeRepository',
    )
  }
  const budgetChars = input.budgetChars
  if (!(await port.indexExists())) {
    // REQ-261001203710-0fbf t4 / FR-2：把「读不到」的**两种病因**说开。
    // 以前一律报「知识层未初始化」，于是「索引其实在别的项目里（根被别的窗口改过）」也被说成
    // 「本项目没生成」——把人引去重跑生成脚本，问题却在根上（实测：同一句文案骗了我三次）。
    const readRoot = (o: unknown): string => {
      const probe = (o as { workspaceRoot?: () => unknown }).workspaceRoot
      const v = typeof probe === 'function' ? probe.call(o) : undefined
      return typeof v === 'string' ? v : ''
    }
    const projectRoot = readRoot(deps.docs)
    const kbRoot = readRoot((port as { docs?: unknown }).docs)
    const mismatched = kbRoot.length > 0 && projectRoot.length > 0 && !sameProjectRoot(kbRoot, projectRoot)
    return {
      items: [],
      total: 0,
      truncated: false,
      budgetChars,
      hint: mismatched
        ? '知识层读不到：**项目根与索引位置不一致**——知识层读的是 ' + kbRoot + '，当前项目根是 ' + projectRoot
          + '。索引很可能存在于另一个项目里（根被别的窗口改过）；要在本项目生成则跑 `npx tsx scripts/kb-build.mts --write`。'
        : '本项目知识层未生成（项目根=' + (projectRoot.length > 0 ? projectRoot : '(未知)')
          + '）：先跑 `npx tsx scripts/kb-build.mts --write` 生成索引骨架',
    }
  }
  const { rows } = await port.readEntries()

  // 机器索引（全量符号 / 全量类名）单独走：它们不在 INDEX 里，只在 TSV 里
  if (input.kind === 'map' || input.kind === 'tokens') {
    const machine = await searchMachineIndex(deps, input.kind, input.query, input.limit)
    if (machine.length > 0) {
      const trimmed = trimToBudget(machine, budgetChars)
      return {
        items: trimmed.items,
        total: machine.length,
        truncated: trimmed.truncated,
        budgetChars,
        hint: '机器索引命中（全量清单在 ' + (input.kind === 'map' ? KB_PATHS.symbols : KB_PATHS.classes) + '）',
      }
    }
  }

  const hits = rows
    .filter((r) => (input.id === undefined ? true : r.id === input.id))
    .filter((r) => (input.kind === undefined ? true : r.kind === input.kind))
    .filter((r) => {
      if (input.query === undefined) return true
      const q = input.query.toLowerCase()
      return r.id.toLowerCase().includes(q) || r.oneLiner.toLowerCase().includes(q) || r.pointer.toLowerCase().includes(q)
    })
    .sort((a, b) => relevance(a, input.query) - relevance(b, input.query) || a.id.localeCompare(b.id))
    .slice(0, input.limit)

  if (hits.length === 0) {
    return {
      items: [],
      total: 0,
      truncated: false,
      budgetChars,
      hint:
        input.id !== undefined
          ? '没有 id=' + input.id + ' 这条知识；用 query 检索，或按 kind 列出一类'
          : '没有命中；换关键词，或用 kind 列出一类（architecture / standard / tokens / decision / pitfall / contract / map / glossary）',
    }
  }

  const candidates: KbCandidate[] = []
  for (const row of hits) {
    const raw = await port.readEntry(row.id)
    let title = row.oneLiner
    let body: string | undefined
    let updatedAt = ''
    if (raw !== undefined) {
      try {
        const parsed = parseEntryDoc(raw)
        title = parsed.meta.title
        updatedAt = parsed.meta.updated
        body = raw
      } catch {
        // 页面小节（无 front-matter）：正文就是切片本身
        body = raw
      }
    }
    candidates.push({
      id: row.id,
      kind: row.kind,
      title,
      oneLiner: row.oneLiner,
      pointer: row.pointer,
      updatedAt,
      ...(body === undefined ? {} : { body }),
    })
  }
  const trimmed = trimToBudget(candidates, budgetChars)
  const items: KbQueryItem[] = trimmed.items.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    oneLiner: c.oneLiner,
    pointer: c.pointer,
    updatedAt: c.updatedAt,
    ...(c.body === undefined ? {} : { body: c.body }),
    ...(c.body === undefined && candidates.find((x) => x.id === c.id)?.body !== undefined ? { truncated: true } : {}),
  }))
  return {
    items,
    total: rows.filter((r) => (input.kind === undefined ? true : r.kind === input.kind)).length,
    truncated: trimmed.truncated,
    budgetChars,
    ...(trimmed.truncated
      ? { hint: '预算 ' + String(budgetChars) + ' 字符装不下全部命中：提高 budgetChars，或用 id 精确取一条' }
      : {}),
  }
}
