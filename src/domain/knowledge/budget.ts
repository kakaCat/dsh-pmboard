/**
 * 知识层预算（REQ-261001110934-3766 t1 / design/data-model.md §实体总览）。
 *
 * 口径：**字符数**（与 `domain/prompt/budget.ts` 的注入预算同一口径），不是字节数。
 * 超预算返回**结构化溢出**，绝不静默裁剪——「响亮失败优于静默降级」是本仓既有教训
 * （见 `domain/prompt/budget.ts` 的 floor 语义）。
 *
 * @module dsh-pmboard/domain/knowledge/budget
 */
import type { KbOverflow } from './types.js'

/** 知识层全部数值上限（一条上限只有一处定义）。 */
export const KB_LIMITS = {
  /** 索引全文上限：字符数（≈5.3k token）。 */
  indexMaxChars: 8_000,
  /** 索引全文上限：行数。 */
  indexMaxLines: 200,
  /** 任一 L1 页面上限：行数。 */
  pageMaxLines: 200,
  /** 单条条目正文上限：行数。 */
  entryMaxLines: 200,
  /** 索引行整体上限：字符数。 */
  indexLineMax: 200,
  /** 索引行里一句话结论的上限：字符数。 */
  oneLinerMax: 140,
  /** 工具单次返回的默认预算（字符）。 */
  queryDefaultBudget: 1_500,
  /** 工具单次返回的预算上限（字符）。 */
  queryMaxBudget: 8_000,
  /** 工具单次返回条目数缺省/上限。 */
  queryDefaultLimit: 5,
  queryLimitMax: 20,
  /** 节点输入包里索引节的默认字符预算（t8）。 */
  injectDefaultBudget: 3_000,
  /** 需求文档瘦身后（TL;DR + 指针）的默认字符上限（t8）。 */
  requirementDigestMax: 1_800,
  /** 条目复核期限（天）：默认 updated + 该天数。 */
  staleDays: 180,
} as const

/**
 * 行数口径：以 `\n` 计数（无末尾换行不加一）——与编辑器显示的行号一致，
 * 也避免「末尾多一个换行就超限」这种假失败。
 */
export function countLines(text: string): number {
  if (text.length === 0) return 0
  return text.split('\n').length
}

/** 字符预算检查：超限 → 溢出对象；未超 → undefined。 */
export function checkIndexChars(text: string): KbOverflow | undefined {
  return text.length > KB_LIMITS.indexMaxChars
    ? { reason: 'index-chars', actual: text.length, limit: KB_LIMITS.indexMaxChars, unit: 'chars' }
    : undefined
}

/** 行数预算检查（索引）。 */
export function checkIndexLines(text: string): KbOverflow | undefined {
  const lines = countLines(text)
  return lines > KB_LIMITS.indexMaxLines
    ? { reason: 'index-lines', actual: lines, limit: KB_LIMITS.indexMaxLines, unit: 'lines' }
    : undefined
}

/** 索引全部预算检查：返回全部命中项（可能同时超字符与超行）。 */
export function checkIndexBudget(text: string): readonly KbOverflow[] {
  const out: KbOverflow[] = []
  const chars = checkIndexChars(text)
  if (chars !== undefined) out.push(chars)
  const lines = checkIndexLines(text)
  if (lines !== undefined) out.push(lines)
  return out
}

/** 页面/条目预算检查（只限行数）。 */
export function checkPageBudget(text: string): KbOverflow | undefined {
  const lines = countLines(text)
  return lines > KB_LIMITS.pageMaxLines
    ? { reason: 'page-lines', actual: lines, limit: KB_LIMITS.pageMaxLines, unit: 'lines' }
    : undefined
}

/** 查询预算合法性：非法 → 溢出（供工具层直接转 `invalid_input`）。 */
export function checkQueryBudget(budgetChars: number): KbOverflow | undefined {
  if (!Number.isInteger(budgetChars) || budgetChars < 1 || budgetChars > KB_LIMITS.queryMaxBudget) {
    return { reason: 'query-budget', actual: budgetChars, limit: KB_LIMITS.queryMaxBudget, unit: 'chars' }
  }
  return undefined
}

/** 溢出对象 → 人读一行（失败要响亮，别只说"超了"）。 */
export function describeOverflow(o: KbOverflow): string {
  const unit = o.unit === 'chars' ? '字符' : '行'
  return `知识层预算超限（${o.reason}）：实际 ${o.actual} ${unit} > 上限 ${o.limit} ${unit}`
}
