/**
 * 知识条目文档（REQ-261001110934-3766 t1 / design/data-model.md「条目文件字段」）。
 *
 * 条目 = `---` 包起来的**扁平标量**头 + 五个固定小节。为什么只支持扁平标量而不是完整 YAML：
 * ① domain 不许引第三方/IO（layer-boundary 门禁），而 `yaml` 是运行时依赖、不该进最内层；
 * ② 写入端（归档沉淀）本来就只产出扁标量，**受限语法 + 明确报错**比"什么都能写"更可校验。
 * 因此遇到嵌套/列表 → **抛错带行号**（响亮失败），而不是静默解析成半个对象。
 *
 * @module dsh-pmboard/domain/knowledge/entry
 */
import { domainError, REQBOARD_ERROR_CODES } from '../errors.js'
import { KB_LIMITS } from './budget.js'
import { isEntryId, isKnownId, isOneLiner } from './index-line.js'
import { KB_ENTRY_STATUSES, KB_KINDS, type KbEntryMeta, type KbEntryStatus, type KbIssue, type KbKind } from './types.js'

/** 头部字段全集（渲染顺序即此序）与必填集。 */
export const KB_ENTRY_FIELDS = [
  'id',
  'kind',
  'status',
  'title',
  'one_liner',
  'applies_when',
  'pointer',
  'supersedes',
  'updated',
  'expires',
  'req',
] as const

export const KB_ENTRY_REQUIRED = [
  'id',
  'kind',
  'status',
  'title',
  'one_liner',
  'applies_when',
  'pointer',
  'updated',
  'expires',
] as const

/** 条目正文的固定小节（缺一即校验失败）。 */
export const KB_ENTRY_BODY_SECTIONS = ['结论', '适用条件', '证据', '失效条件', '相关'] as const

/** 头部字段 → 元数据键。 */
const FIELD_TO_META: Record<string, keyof KbEntryMeta> = {
  id: 'id',
  kind: 'kind',
  status: 'status',
  title: 'title',
  one_liner: 'oneLiner',
  applies_when: 'appliesWhen',
  pointer: 'pointer',
  supersedes: 'supersedes',
  updated: 'updated',
  expires: 'expires',
  req: 'req',
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 是否 ISO 日期（`2026-10-01`）。 */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map((x) => Number(x))
  if (m === undefined || d === undefined) return false
  const dt = new Date(Date.UTC(y!, m - 1, d!))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** ISO 日期 + 天数（纯函数，不读系统时间）。 */
export function addDays(iso: string, days: number): string {
  if (!isIsoDate(iso)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '日期非法（期望 YYYY-MM-DD）：' + iso)
  }
  const [y, m, d] = iso.split('-').map((x) => Number(x))
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  const pad = (n: number): string => String(n).padStart(2, '0')
  return String(dt.getUTCFullYear()) + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate())
}

/** 默认复核期限 = updated + staleDays。 */
export function defaultExpires(updated: string): string {
  return addDays(updated, KB_LIMITS.staleDays)
}

/** 是否已过期（`today` 由调用方注入——domain 不读系统时间）。 */
export function isExpired(expires: string, today: string): boolean {
  return expires < today
}

/** 值是否需要加引号（含 `: ` / `#` / 前导特殊字符 / 首尾空白）。 */
function needsQuote(value: string): boolean {
  if (value.length === 0) return false
  if (value !== value.trim()) return true
  if (/^[#\-*>&|!%@`[\]{},]/.test(value)) return true
  return value.includes('#') || value.includes(': ') || value.includes('"')
}

function quote(value: string): string {
  return needsQuote(value) ? '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : value
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return value
}

/** 渲染条目文档：头部按固定字段序，跳过 undefined/空的可选字段。 */
export function renderEntryDoc(meta: KbEntryMeta, body: string): string {
  const values: Record<string, string | undefined> = {
    id: meta.id,
    kind: meta.kind,
    status: meta.status,
    title: meta.title,
    one_liner: meta.oneLiner,
    applies_when: meta.appliesWhen,
    pointer: meta.pointer,
    supersedes: meta.supersedes,
    updated: meta.updated,
    expires: meta.expires,
    req: meta.req,
  }
  const lines: string[] = ['---']
  for (const field of KB_ENTRY_FIELDS) {
    const value = values[field]
    if (value === undefined) continue
    if (value.length === 0 && !(KB_ENTRY_REQUIRED as readonly string[]).includes(field)) continue
    lines.push(field + ': ' + quote(value))
  }
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

/** 解析结果。 */
export interface KbEntryParseResult {
  readonly meta: KbEntryMeta
  readonly body: string
}

/**
 * 解析条目文档：头部非法 → 抛错（带行号）；正文原样返回（小节的完整性由 validateEntryBody 检查）。
 */
export function parseEntryDoc(text: string): KbEntryParseResult {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目缺少 front-matter 起始 `---`（第 1 行）')
  }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.trim() === '---') {
      end = i
      break
    }
  }
  if (end < 0) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 front-matter 未闭合（缺少结束 `---`）')
  }
  const raw: Record<string, string> = {}
  for (let i = 1; i < end; i += 1) {
    const line = lines[i]!
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    const m = /^([a-z_]+):\s?(.*)$/.exec(line)
    if (m === null) {
      throw domainError(
        REQBOARD_ERROR_CODES.invalidInput,
        '条目头部第 ' + String(i + 1) + ' 行非法（只支持扁平 `key: value`，不支持嵌套/列表）：`' + line + '`',
      )
    }
    const key = m[1]!
    if (!(KB_ENTRY_FIELDS as readonly string[]).includes(key)) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目头部第 ' + String(i + 1) + ' 行字段未知：' + key)
    }
    if (raw[key] !== undefined) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目头部第 ' + String(i + 1) + ' 行字段重复：' + key)
    }
    raw[key] = unquote(m[2]!.trim())
  }
  for (const field of KB_ENTRY_REQUIRED) {
    if (raw[field] === undefined) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目缺少必填字段：' + field)
    }
  }
  const meta = coerceMeta(raw)
  return { meta, body: lines.slice(end + 1).join('\n').trim() }
}

/** 原始字段 → 元数据（逐字段校验，非法即抛错）。 */
function coerceMeta(raw: Record<string, string>): KbEntryMeta {
  const id = raw['id']!
  if (!isEntryId(id)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 id 必须是 kb-NNNN（实际 ' + id + '）')
  }
  const kind = raw['kind']! as KbKind
  if (!(KB_KINDS as readonly string[]).includes(kind)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 kind 非法：' + raw['kind']!)
  }
  const status = raw['status']! as KbEntryStatus
  if (!(KB_ENTRY_STATUSES as readonly string[]).includes(status)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 status 非法：' + raw['status']!)
  }
  const title = raw['title']!
  if (title.length === 0 || title.length > 120) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 title 必须 1–120 字符（实际 ' + String(title.length) + '）')
  }
  const oneLiner = raw['one_liner']!
  if (!isOneLiner(oneLiner)) {
    throw domainError(
      REQBOARD_ERROR_CODES.invalidInput,
      '条目 one_liner 非法（1–' + String(KB_LIMITS.oneLinerMax) + ' 字符、不含 ·/→）：' + oneLiner,
    )
  }
  const pointer = raw['pointer']!
  if (pointer.length > 0 && /\s/.test(pointer)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 pointer 不能含空白：' + pointer)
  }
  const updated = raw['updated']!
  if (!isIsoDate(updated)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 updated 非法（期望 YYYY-MM-DD）：' + updated)
  }
  const expires = raw['expires']!
  if (!isIsoDate(expires)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 expires 非法（期望 YYYY-MM-DD）：' + expires)
  }
  const supersedes = raw['supersedes']
  if (supersedes !== undefined && supersedes.length > 0 && supersedes !== '-' && !isEntryId(supersedes)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 supersedes 必须是 kb-NNNN 或留空：' + supersedes)
  }
  const req = raw['req']
  if (req !== undefined && req.length > 0 && !/^REQ-[0-9a-z-]+$/i.test(req)) {
    throw domainError(REQBOARD_ERROR_CODES.invalidInput, '条目 req 非法（期望 REQ-…）：' + req)
  }
  const meta: KbEntryMeta = {
    id,
    kind,
    status,
    title,
    oneLiner,
    appliesWhen: raw['applies_when']!,
    pointer,
    updated,
    expires,
    ...(supersedes === undefined || supersedes.length === 0 || supersedes === '-' ? {} : { supersedes }),
    ...(req === undefined || req.length === 0 ? {} : { req }),
  }
  return meta
}

/** 文件级校验（不抛错，收集问题供 kb-probe 一次报全；line=0 表示文件级）。 */
export function validateEntryDoc(text: string, today: string): readonly KbIssue[] {
  const issues: KbIssue[] = []
  let parsed: KbEntryParseResult
  try {
    parsed = parseEntryDoc(text)
  } catch (err) {
    return [{ line: 0, code: 'entry-header', detail: (err as Error).message }]
  }
  if (isExpired(parsed.meta.expires, today)) {
    issues.push({ line: 0, code: 'entry-stale', detail: '条目已过复核期限：' + parsed.meta.expires })
  }
  if (parsed.meta.supersedes !== undefined && !isKnownId(parsed.meta.supersedes)) {
    issues.push({ line: 0, code: 'entry-supersedes', detail: 'supersedes 指向未知 id：' + parsed.meta.supersedes })
  }
  for (const s of KB_ENTRY_BODY_SECTIONS) {
    if (!new RegExp('^#{2,3}\\s*' + s, 'm').test(parsed.body)) {
      issues.push({ line: 0, code: 'entry-body-section', detail: '条目正文缺少小节：' + s })
    }
  }
  if (parsed.body.split('\n').length > KB_LIMITS.entryMaxLines) {
    issues.push({
      line: 0,
      code: 'entry-lines',
      detail: '条目正文超过 ' + String(KB_LIMITS.entryMaxLines) + ' 行',
    })
  }
  return issues
}

/**
 * 元数据 → 索引行（条目与索引行**同文**，避免两处措辞漂移）。
 * 索引行的指针固定指向条目文件本身；L2 原文由条目内的 `pointer` 字段承载。
 */
export function metaToRow(meta: KbEntryMeta): { id: string; kind: KbKind; oneLiner: string; pointer: string } {
  return { id: meta.id, kind: meta.kind, oneLiner: meta.oneLiner, pointer: 'entries/' + meta.id + '.md' }
}

/** 元数据键回写字段名（供写入端组装 front-matter 时复用同一映射）。 */
export function metaKeyOf(field: (typeof KB_ENTRY_FIELDS)[number]): keyof KbEntryMeta {
  return FIELD_TO_META[field]!
}
