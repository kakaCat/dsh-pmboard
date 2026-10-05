/**
 * 索引行语法（REQ-261001110934-3766 t1 / design/data-model.md「索引行语法（唯一解析口径）」）。
 *
 * 一行 = 一条知识的指针：
 *
 *     - kb-0007 · decision · 一句话结论 · → entries/kb-0007.md
 *
 * 为什么把语法做成 domain 单点：写入端（归档沉淀）、读取端（reqboard_kb）、校验端（kb-probe）
 * 与生成器**必须共用同一解析器**——两处实现就是两根会各自漂移的真相。
 * 非法行一律**抛错带行号**（读取侧）或在整档解析时收进 `issues`（校验侧），禁止静默跳过。
 *
 * @module dsh-pmboard/domain/knowledge/index-line
 */
import { domainError, REQBOARD_ERROR_CODES } from '../errors.js'
import { KB_LIMITS } from './budget.js'
import { KB_INDEX_SECTIONS, KB_KINDS, type KbIndexRow, type KbIssue, type KbKind } from './types.js'

/** 归档派生条目的 id：`kb-0007`。 */
export const KB_ENTRY_ID_RE = /^kb-\d{4}$/
/** 页面小节 id：`kb-conventions-c01` / `kb-tokens-colors` / `kb-code-map-src-domain`。 */
export const KB_SECTION_ID_RE = /^kb-(architecture|conventions|tokens|code-map|glossary)-[a-z0-9-]{2,60}$/
/** 索引行整体语法（唯一口径，design/data-model.md 逐字对应）。 */
export const KB_INDEX_LINE_RE =
  /^- (kb-\d{4}|kb-[a-z-]+-[a-z0-9-]+) · (architecture|standard|tokens|decision|pitfall|contract|map|glossary) · ([^·→\n]{1,140}) · → (\S+)$/

/** 页面小节 id 允许的页面名（与 design/data-model.md 的存储映射一致）。 */
export const KB_PAGES = ['architecture', 'conventions', 'tokens', 'code-map', 'glossary'] as const
export type KbPage = (typeof KB_PAGES)[number]

/** 是否归档派生条目 id。 */
export function isEntryId(id: string): boolean {
  return KB_ENTRY_ID_RE.test(id)
}

/** 是否页面小节 id。 */
export function isSectionId(id: string): boolean {
  return KB_SECTION_ID_RE.test(id)
}

/** 是否认识这个 id（两式之一）。 */
export function isKnownId(id: string): boolean {
  return isEntryId(id) || isSectionId(id)
}

/** 页面小节 id → { 页面, 锚点 }；不是小节 id → undefined。 */
export function splitSectionId(id: string): { page: KbPage; anchor: string } | undefined {
  for (const page of KB_PAGES) {
    const prefix = 'kb-' + page + '-'
    if (id.startsWith(prefix)) {
      const anchor = id.slice(prefix.length)
      return anchor.length >= 2 ? { page, anchor } : undefined
    }
  }
  return undefined
}

/** 小节 id 的构造（写入端与校验端共用，避免锚点与 id 漂移）。 */
export function sectionId(page: KbPage, anchor: string): string {
  return 'kb-' + page + '-' + anchor
}

/** 一句话结论是否合法（不含分隔符、长度受限）。 */
export function isOneLiner(text: string): boolean {
  return text.length >= 1 && text.length <= KB_LIMITS.oneLinerMax && !/[·→\n]/.test(text)
}

/** 渲染索引行（非法输入 → 抛错，不产出坏行）。 */
export function renderIndexLine(row: KbIndexRow): string {
  if (!isKnownId(row.id)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '索引行 id 非法：' + row.id + '（期望 kb-NNNN 或 kb-<页面>-<锚点>）')
  }
  if (!(KB_KINDS as readonly string[]).includes(row.kind)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '索引行 kind 非法：' + String(row.kind))
  }
  if (!isOneLiner(row.oneLiner)) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引行一句话结论非法（1–' + String(KB_LIMITS.oneLinerMax) + ' 字符、不含 ·/→）：' + row.oneLiner,
    )
  }
  if (row.pointer.trim().length === 0 || /\s/.test(row.pointer)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '索引行指针非法（不能为空或含空白）：' + row.pointer)
  }
  const line = '- ' + row.id + ' · ' + row.kind + ' · ' + row.oneLiner + ' · → ' + row.pointer
  if (line.length > KB_LIMITS.indexLineMax) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引行超出 ' + String(KB_LIMITS.indexLineMax) + ' 字符上限（实际 ' + String(line.length) + '）',
    )
  }
  return line
}

/** 解析单行（读取路径）：非法 → 抛错并**带行号**。 */
export function parseIndexLine(raw: string, lineNo: number): KbIndexRow {
  const where = '（第 ' + String(lineNo) + ' 行）'
  if (raw.length > KB_LIMITS.indexLineMax) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引行超过 ' + String(KB_LIMITS.indexLineMax) + ' 字符' + where + '：实际 ' + String(raw.length),
    )
  }
  const m = KB_INDEX_LINE_RE.exec(raw)
  if (m === null) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引行语法非法' + where + '：期望 `- <id> · <kind> · <一句话> · → <指针>`，实际 `' + raw + '`',
    )
  }
  // 语法之外还要过**语义**：`kb-a-b` 这种长得像但不属于任何存储（既非 kb-NNNN、页面名也不在白名单）
  // 必须在解析处就被拒绝——否则它会一路走到读取端，变成"索引有条目、取出来是空的"静默失效。
  if (!isKnownId(m[1]!)) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '索引行 id 不属于任何存储' + where + '：' + m[1]! + '（期望 kb-NNNN 或 kb-<页面>-<锚点>，页面限 ' + KB_PAGES.join('/') + '）',
    )
  }
  return { id: m[1]!, kind: m[2]! as KbKind, oneLiner: m[3]!, pointer: m[4]! }
}

/** 整档解析结果：能解析的行 + 全部问题（校验侧一次报全，不早退）。 */
export interface KbIndexParseResult {
  readonly rows: readonly KbIndexRow[]
  readonly issues: readonly KbIssue[]
  readonly sections: readonly string[]
}

const SECTION_TITLES: readonly string[] = KB_INDEX_SECTIONS.map((s) => s.title)

/**
 * 分节标题 → 该节允许的 kind。
 * - 未知分节 → undefined（由 `section-unknown` 单独报，不在这里判 kind）；
 * - 「待写」节 → undefined 且由 `isFreeTextSection` 标为自由文本（缺口清单，不按索引行语法校验）。
 */
function kindsForSection(title: string): readonly string[] | undefined {
  const hit = KB_INDEX_SECTIONS.find((s) => s.title === title)
  if (hit === undefined) return undefined
  return hit.kind === undefined ? undefined : [hit.kind]
}

/** 「待写」节是**自由文本**：人在这里写缺口，不必符合索引行语法。 */
function isFreeTextSection(title: string | undefined): boolean {
  return title !== undefined && KB_INDEX_SECTIONS.some((s) => s.title === title && s.kind === undefined)
}

/**
 * 解析整份索引文档（校验侧）：
 * 逐行判定「语法 / 重复 id / 分节顺序 / 分节匹配 / 缺失分节」，问题全部收进 issues（带行号）。
 * 不抛错——调用方（kb-probe）读 issues 决定退出码。
 */
export function parseIndexDoc(text: string): KbIndexParseResult {
  const rows: KbIndexRow[] = []
  const issues: KbIssue[] = []
  const sections: string[] = []
  const seen = new Set<string>()
  let sectionAt = -1

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const lineNo = i + 1
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading !== null) {
      const title = heading[1]!.replace(/`/g, '').trim()
      sections.push(title)
      const idx = SECTION_TITLES.indexOf(title)
      if (idx < 0) {
        issues.push({ line: lineNo, code: 'section-unknown', detail: '未知分节：' + title, raw: line })
      } else if (idx <= sectionAt) {
        issues.push({ line: lineNo, code: 'section-order', detail: '分节顺序错乱（应为固定九节顺序）：' + title, raw: line })
      } else {
        sectionAt = idx
      }
      continue
    }
    if (!line.startsWith('- ')) continue
    // 待写节里的 `- xxx` 是缺口清单，不是索引行：跳过（不放行到语法校验，也不算问题）
    if (isFreeTextSection(sections[sections.length - 1])) continue
    let row: KbIndexRow
    try {
      row = parseIndexLine(line, lineNo)
    } catch (err) {
      issues.push({ line: lineNo, code: 'line-syntax', detail: (err as Error).message, raw: line })
      continue
    }
    if (seen.has(row.id)) {
      issues.push({ line: lineNo, code: 'dup-id', detail: 'id 重复：' + row.id, raw: line })
      continue
    }
    const current = sections[sections.length - 1]
    const allowed = current === undefined ? undefined : kindsForSection(current)
    if (allowed !== undefined && !allowed.includes(row.kind)) {
      issues.push({
        line: lineNo,
        code: 'kind-section-mismatch',
        detail: 'kind=' + row.kind + ' 不能出现在「' + String(current) + '」节',
        raw: line,
      })
      continue
    }
    seen.add(row.id)
    rows.push(row)
  }

  for (const s of KB_INDEX_SECTIONS) {
    if (!sections.includes(s.title)) {
      issues.push({ line: 0, code: 'section-missing', detail: '缺少固定分节：' + s.title })
    }
  }
  return { rows, issues, sections }
}
