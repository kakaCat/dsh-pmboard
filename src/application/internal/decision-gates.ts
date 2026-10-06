/**
 * 裁定记录门与会话留痕判据（REQ-261005105032-3b02 · FR-8 / D-11 / D-12；§10 #16 #20 #23 #24）。
 *
 * 治什么（FR-8）：讨论里说定的裁定（「改成 X」「不要 Y」）过去只活在会话里、被需求文档概括掉 ⇒ 实施
 * 看不到、验收只能再说一遍。本模块让裁定在 `requirement.md` 的「讨论与裁定记录（D-x）」节逐条落账，
 * 并在 `brainstorming → design` 用代码级门禁卡住。两条纪律：① 留痕启发式**只用于**"要求本节非空"，
 * 不判内容、**不承诺召回率可测**（§10 #23）；② 会话取数**不新增数据源**（§10 #20）。
 *
 * @module dsh-pmboard/application/internal/decision-gates
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import { clip, fmt } from '../../domain/text/fmt.js'
import type { GateFailure } from './artifact-gates.js'
import {
  checkClauseDuplicates,
  checkClauseSequence,
  collectIds,
  extractClauseDefinitions,
  parseDocument,
  type DocsReader,
  type ParsedDoc,
  type ParsedTable,
} from './content-gates.js'
import { envelope } from './gate-feedback.js'
// 需求文档位置只有一处真相（docBasePath / docLinks.requirement 都由 requirementDocPath 解析）：
// 不另写一份路径拼接，换过文档位置的需求才不会因此假红。
import { requirementDocPath } from './node-input-package.js'

/**
 * 节名（逐字，全角括号）。模板惯例会在标题后追加 `<!-- serves: FR-8 -->`：剥掉尾注释后**逐字**比对，
 * 不做子串匹配（子串会让「讨论记录」这类小节冒充本节）。
 */
export const DECISION_SECTION_NAME = '讨论与裁定记录（D-x）'

/** 真空态唯一写法（data-model §4.4）：整节只有这一句 ≠ 空节（真没有裁定就显式声明，别硬凑条目）。 */
export const DECISION_VACUUM_MARKER = '本节无裁定'

/** 五列（逐字，data-model §4.2 / brief §3）：任一列空 = 该条目无效。 */
export const DECISION_COLUMNS = ['编号', '原话来源', '裁定', '影响 FR', '判据'] as const

/** 祈使词表（§10 #20 逐字，不增不减）。为什么取宽：本判据只用在"真空态豁免"的取舍上——多命中只是要求
 * 把那节写实在，漏命中才会放行一个真空态（`要`/`别` 也命中「需要」这类普通措辞，是刻意取宽）。 */
export const DECISION_IMPERATIVE_TOKENS: readonly string[] = ['改成', '不要', '必须', '加上', '应该是', '记得', '注意', '别', '要']

/** 会话读法的最小端口面（`SessionProbe` 结构上满足它）：只取既有两条读法，不新增数据源。 */
export interface DecisionSessionReader {
  /** 读法一：活窗口同步快照（`SessionProbe.snapshotEvents`）。 */
  snapshotEvents?: (windowKey: string) => readonly unknown[] | undefined
  /** 读法二：冷会话持久化读（`SessionProbe.readEvents`）。 */
  readEvents?: (windowKey: string) => Promise<readonly unknown[] | undefined>
}

/**
 * 留痕判据结果；`undefined` = **判据不适用**（非 feature 需求，D-12），与 `{hit:false}` 严格区分。
 * `sample` = 命中原文（截断留痕，供门禁文案回显"我据哪句判的"）——绝不是概括。
 */
export interface DecisionTraceResult { hit: boolean; sample?: string }

export interface DecisionTraceOptions {
  /** 只看每窗口**最近** N 条人类消息（§10 #20：默认 200）；windowKeys 缺省 = 席位 + 立项来源窗口。 */
  limit?: number
  windowKeys?: readonly string[]
}

export interface DecisionGateOptions {
  /**
   * 会话侧是否**存在**裁定留痕（`hasDecisionTrace().hit`）。为什么可以从外面传：设计钉死的门签名是
   * `(docs, req)`（interfaces.md），"有没有留痕"却是会话侧取数；传 `sessionProbe` 就自取自算，都不给
   * = 通道未注入（按未命中降级，**只**影响真空态豁免）。`limit` / `windowKeys` 透传给留痕判据。
   */
  trace?: boolean
  sessionProbe?: DecisionSessionReader
  limit?: number
  windowKeys?: readonly string[]
}

/** 默认扫描深度（§10 #20 钉死 200）；最多扫 5 个窗口（留痕只要"有人说过祈使句"，不必穷尽）。 */
export const DEFAULT_DECISION_TRACE_LIMIT = 200
const MAX_TRACE_WINDOWS = 5
/** 根条款编号形态：`影响 FR` 只认这些；`D-3` 之类下游编号写进该列 = 未命中。 */
const ROOT_CLAUSE_RE = /^(?:FR|BUG|RF|SP|DOC|CH)-\d+$/

/** 标题文本 → 节名（剥掉模板惯例的尾部 HTML 注释后再逐字比对）。 */
function sectionNameOf(headingText: string): string {
  return headingText.replace(/(?:\s*<!--[\s\S]*?-->)+$/g, '').trim()
}

/** 裁定节行区间：`start` = 标题行（1-based 含），`end` = 下一个同级/更高级标题行（不含）。 */
interface SectionRange { start: number; end: number }

/** 定位裁定节：**只认 `##`**——design 把节名写成 H2，H3 同名是小节冒充，不算。 */
function decisionSectionRange(doc: ParsedDoc, lineCount: number): SectionRange | undefined {
  const head = doc.headings.find(h => h.level === 2 && sectionNameOf(h.text) === DECISION_SECTION_NAME)
  if (head === undefined) return undefined
  let end = lineCount + 1
  for (const h of doc.headings) if (h.line > head.line && h.level <= 2 && h.line < end) end = h.line
  return { start: head.line, end }
}

/**
 * 整节**只有**「本节无裁定」= 真空态（data-model §4.4）：剥掉引用/列表标记、加粗、行内代码、注释与标点
 * 空白后**逐字相等**。为什么严：真空态是"确实没有裁定"的显式声明，不是"我懒得写"的挡箭牌。
 */
function isVacuumOnly(sectionText: string): boolean {
  const plain = sectionText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.、])\s+/gm, '')
    .replace(/[*`]/g, '')
    .split('\n').map(l => l.trim()).join('')
    .replace(/[。．.！!，,、；;：:（）()【】\[\]「」“”"'\s]/g, '')
  return plain === DECISION_VACUUM_MARKER
}

/** 五列在表头里的下标（忽略空白差异：`影响FR` 与 `影响 FR` 同列；列名本身仍须逐字出现）。 */
function decisionColumnIndex(table: ParsedTable): Record<string, number> {
  const idx: Record<string, number> = {}
  for (const name of DECISION_COLUMNS) {
    const key = name.replace(/\s+/g, '')
    idx[name] = table.header.findIndex(h => h.replace(/\s+/g, '').includes(key))
  }
  return idx
}

/**
 * 逐行校验五要素 + 编号连续/唯一，返回**全部**无效点（不是修一条报一条）。gaps 形态照 interfaces.md：
 * `D-3（缺原话来源）`、`D-5（影响 FR 未命中真实条款）`。编号检查**复用** content-gates 的既有纯函数——
 * 它们按前缀分组、`D-ARCH-2` 不匹配 `^([A-Z]+)-(\d+)$` 故不入组，D-x 独立命名空间由此天然成立。
 */
export function validateDecisionEntries(table: ParsedTable, realClauses: ReadonlySet<string>): string[] {
  const gaps: string[] = []
  const idx = decisionColumnIndex(table)
  for (const name of DECISION_COLUMNS) {
    if ((idx[name] ?? -1) < 0) {
      gaps.push(fmt('表头缺列「{name}」（五列逐字：编号 / 原话来源 / 裁定 / 影响 FR / 判据）', { name }))
    }
  }
  const iId = idx['编号'] ?? -1
  const occurrences: string[] = []
  table.rows.forEach((row, n) => {
    const idRaw = iId >= 0 ? (row[iId] ?? '').trim() : ''
    const wellFormed = /^D-\d+$/.test(idRaw)
    const reasons: string[] = []
    let label: string
    if (wellFormed) {
      label = idRaw
      occurrences.push(idRaw)
    } else {
      label = idRaw.length > 0 ? idRaw : fmt('第{n}行', { n: n + 2 })
      reasons.push(idRaw.length > 0 ? '编号形态非法，须为 D-<数字>' : '缺编号')
    }
    for (const name of DECISION_COLUMNS) {
      const i = idx[name] ?? -1
      if (i < 0) continue
      const cell = (row[i] ?? '').trim()
      if (cell.length === 0) {
        reasons.push(fmt('缺{name}', { name }))
      } else if (name === '影响 FR') {
        const ids = collectIds(cell).filter(id => ROOT_CLAUSE_RE.test(id))
        if (ids.length === 0 || ids.some(id => !realClauses.has(id))) {
          reasons.push(fmt('影响 FR 未命中真实条款（写了「{value}」）', { value: cell }))
        }
      }
    }
    if (reasons.length > 0) gaps.push(fmt('{label}（{reasons}）', { label, reasons: reasons.join('、') }))
  })
  for (const missing of checkClauseSequence(occurrences)) {
    gaps.push(fmt('编号跳号：缺 {id}（D-x 须从 D-1 起连续）', { id: missing }))
  }
  for (const dup of checkClauseDuplicates(occurrences)) gaps.push(fmt('编号重复：{dup}', { dup }))
  return gaps
}

function logMissingFailure(path: string, reqId: string, gaps: string[], why: string): GateFailure {
  return {
    code: 'decision_log_missing',
    kind: 'requirement',
    gaps,
    message: envelope({
      what: fmt('{path} 的「{name}」节未就位：{list}', { path, name: DECISION_SECTION_NAME, list: gaps.join('；') }),
      why,
      how: fmt('按 templates/brainstorming/feature.md 补该节并逐条落五要素（编号 / 原话来源 / 裁定 / 影响 FR / 判据）；确实无裁定就写「本节无裁定」，再调 reqboard_move(requirement_id="{req}", to="design")', { req: reqId }),
    }),
  }
}

function entryInvalidFailure(path: string, reqId: string, gaps: string[]): GateFailure {
  return {
    code: 'decision_entry_invalid',
    kind: 'requirement',
    gaps,
    message: envelope({
      what: fmt('{path} 的「{name}」有 {n} 处无效：{list}', { path, name: DECISION_SECTION_NAME, n: gaps.length, list: gaps.join('；') }),
      why: '裁定条目五要素缺一即无效；只有概括句、无可核验来源、或「影响 FR」没命中真实条款的条目一律视为无效',
      how: fmt('按上面逐条补齐（原话来源写会话消息 id 或时间戳 + 原话；影响 FR 须命中 requirement.md 里真实存在的条款编号），再调 reqboard_move(requirement_id="{req}", to="design")', { req: reqId }),
    }),
  }
}

/** 取"是否存在裁定留痕"：显式布尔优先，其次自取自算，都没有 → 通道未注入（按未命中降级）。 */
async function resolveTrace(opts: DecisionGateOptions, req: RequirementRecord): Promise<boolean> {
  if (opts.trace !== undefined) return opts.trace
  if (opts.sessionProbe === undefined) return false
  const result = await hasDecisionTrace(opts.sessionProbe, req, {
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts.windowKeys !== undefined ? { windowKeys: opts.windowKeys } : {}),
  })
  return result?.hit === true
}

/**
 * 裁定记录门（FR-8；生效点 = `brainstorming → design`），短路返回首个结论：
 *   ① 非 feature → `undefined`（D-12：该节只在 feature 模板里，不给别的类型加仪式）；存量需求
 *      （`artifacts` 空/undefined）→ `undefined`：与 design-gates 的 `isLegacy → 放行` 同口径，不追溯；
 *   ② 文档不存在 / 缺「讨论与裁定记录（D-x）」节 → `decision_log_missing`。**不拿留痕当条件**：feature
 *      模板本就要求该节，缺了就是缺了——留痕判据只用在真空态那一步；
 *   ③ 无条目表或表是空的：只写「本节无裁定」且无留痕 → 放行；写了真空态但留痕命中 → 仍拒（有人下过
 *      祈使/纠正，写真空态等于把讨论概括掉）；既无条目也未写真空态（空节）→ 拒；
 *   ④ 有条目 → 五要素逐条校验 + 编号连续/唯一 → 任一处无效即 `decision_entry_invalid`。
 */
export async function checkDecisionLogGate(
  docs: DocsReader,
  req: RequirementRecord,
  opts: DecisionGateOptions = {},
): Promise<GateFailure | undefined> {
  if (req.category !== 'feature') return undefined
  // 存量豁免：artifacts 空/undefined = 规则生效前的存量记录（其文档没有该节），不追溯拦死——
  // 与 design-gates 两个门的 `isLegacy → 放行` 同口径。
  if (req.artifacts === undefined || req.artifacts.length === 0) return undefined

  const path = requirementDocPath(req)
  if (path.length === 0 || !docs.exists(path)) {
    return logMissingFailure(path, req.id,
      [fmt('{path} 不存在（无法核验「{name}」节）', { path, name: DECISION_SECTION_NAME })],
      '需求文档都没落盘，讨论裁定自然无从落账')
  }

  const text = await docs.read(path)
  const lines = text.split(/\r?\n/)
  const doc = parseDocument(text)
  const range = decisionSectionRange(doc, lines.length)
  if (range === undefined) {
    return logMissingFailure(path, req.id,
      [fmt('{path} 缺「{name}」节', { path, name: DECISION_SECTION_NAME })],
      '讨论裁定必须逐条落账（祈使 / 纠正 / 补充三类算裁定）；feature 需求文档必须带该节')
  }

  const sectionText = lines.slice(range.start, range.end - 1).join('\n')
  const table = doc.tables.find(t => t.line > range.start && t.line < range.end)
  if (table === undefined || table.rows.length === 0) {
    if (!isVacuumOnly(sectionText)) {
      return logMissingFailure(path, req.id,
        [fmt('{path} 的「{name}」是空节（既无裁定条目，也没写「{marker}」）',
          { path, name: DECISION_SECTION_NAME, marker: DECISION_VACUUM_MARKER })],
        '空节与缺节同罪：真没有裁定就显式写「本节无裁定」，有裁定就逐条落账')
    }
    if (!(await resolveTrace(opts, req))) return undefined
    return logMissingFailure(path, req.id,
      [fmt('{path} 的「{name}」只写了「{marker}」，但会话里存在裁定留痕',
        { path, name: DECISION_SECTION_NAME, marker: DECISION_VACUUM_MARKER })],
      '会话里有人下过祈使 / 纠正 / 补充（留痕判据命中），说明有裁定可落账；写真空态等于把讨论概括掉')
  }

  const gaps = validateDecisionEntries(table, new Set(extractClauseDefinitions(doc)))
  return gaps.length === 0 ? undefined : entryInvalidFailure(path, req.id, gaps)
}

/**
 * 会话侧是否存在**裁定留痕**（启发式；§10 #20）。
 *
 * 用法边界（§10 #23，如实写明）：**只判"该节是否必须非空"，不判条目内容对错**；命中即要求本节非空，
 * **不承诺召回率可测**——漏命中不等于"没有裁定"，召回率由 G2 人评审承担；故这里既不解析裁定语义，也不猜
 * 条目编号。取数口径：只经注入端口既有两条读法（快照优先、冷读回落），只取 `source.kind === 'user'` 的
 * 消息（插件自署来源如 `reqboard-handoff` 不是人类发言），每窗口只扫**最近** `limit` 条（默认 200）。
 *
 * @returns `undefined` = 判据不适用（非 feature 需求，D-12）；否则 `{hit}`，命中时带 `sample` 原文。
 */
export async function hasDecisionTrace(
  sessionProbe: DecisionSessionReader | undefined,
  req: RequirementRecord,
  opts: DecisionTraceOptions = {},
): Promise<DecisionTraceResult | undefined> {
  if (req.category !== 'feature') return undefined
  if (sessionProbe === undefined) return { hit: false }

  const limit = opts.limit !== undefined && opts.limit > 0 ? opts.limit : DEFAULT_DECISION_TRACE_LIMIT
  for (const key of (opts.windowKeys ?? decisionWindowKeys(req)).slice(0, MAX_TRACE_WINDOWS)) {
    const events = await readWindowEvents(sessionProbe, key)
    if (events === undefined) continue
    const sample = scanRecentUserMessages(events, limit)
    if (sample !== undefined) return { hit: true, sample }
  }
  return { hit: false }
}

/** 候选会话窗口：席位（当前谁在这条需求上）→ 立项来源窗口（席位折算前的老记录）。 */
function decisionWindowKeys(req: RequirementRecord): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: unknown): void => {
    if (typeof raw !== 'string') return
    const key = raw.trim()
    if (key.length === 0 || seen.has(key)) return
    seen.add(key)
    out.push(key)
  }
  for (const seat of req.seats ?? []) add(seat.windowKey)
  add(req.sourceSessionId)
  return out
}

/**
 * 读某窗口事件：**快照优先、冷读回落**（与 `QueryDialogue` 同款）。`[]` = 读到了、就是空的（**不**回落）；
 * `undefined` = 读不到（继续试冷读，仍未得 → 跳过）。任一读法抛错都不外抛：留痕只是辅助判据，读不到最坏
 * 是少要求一次，不该让 stage 转移失败。
 */
async function readWindowEvents(
  probe: DecisionSessionReader,
  key: string,
): Promise<readonly unknown[] | undefined> {
  if (typeof probe.snapshotEvents === 'function') {
    try {
      const snapshot = probe.snapshotEvents(key)
      if (Array.isArray(snapshot)) return snapshot
    } catch {
      /* 快照读抛错 → 不当场失败，继续试冷读（读法二选一，不是二选零） */
    }
  }
  if (typeof probe.readEvents === 'function') {
    try {
      const cold = await probe.readEvents(key)
      if (Array.isArray(cold)) return cold
    } catch {
      return undefined
    }
  }
  return undefined
}

/** 从尾部往前扫**最近** `limit` 条人类消息（裁定是"最近讨论里说定的东西"），命中词表即回原文。 */
function scanRecentUserMessages(events: readonly unknown[], limit: number): string | undefined {
  let seen = 0
  for (let i = events.length - 1; i >= 0 && seen < limit; i--) {
    const text = userMessageTextOf(events[i])
    if (text === undefined) continue
    seen++
    if (DECISION_IMPERATIVE_TOKENS.some(token => text.includes(token))) return clip(text, 120)
  }
  return undefined
}

/**
 * 会话事件 → 人类消息正文（不是 → `undefined`）。口径与 `application/query/QueryDialogue.ts` 的
 * `collectSessionItems` 对齐（对话流的唯一渲染口径，但私有函数未导出且该目录在飞）：`user/message` 只认
 * `source.kind === 'user'`，正文只取 `type === 'text'` 的块。**只做判据不做渲染**。
 */
function userMessageTextOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const event = raw as { type?: unknown; data?: unknown }
  if (event.type !== 'user/message') return undefined
  const message = messageOf(event.data)
  if (sourceKindOf(message) !== 'user') return undefined
  const text = textOfMessage(message)
  return text.length > 0 ? text : undefined
}

/** 消息本体：`user/message` 的 data 通常就是消息，搬运期的标本可能多包一层 `message`。 */
function messageOf(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined
  if ((data as { content?: unknown }).content !== undefined) return data
  const wrapped = (data as { message?: unknown }).message
  return typeof wrapped === 'object' && wrapped !== null ? wrapped : data
}

/** `source.kind`（缺失 → undefined）：区分"人说的"与"插件自署"的唯一依据。 */
function sourceKindOf(message: unknown): string | undefined {
  const source = (message as { source?: unknown } | undefined)?.source
  if (typeof source !== 'object' || source === null) return undefined
  const kind = (source as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : undefined
}

/** 消息正文：content 为字符串，或内容块里 `type === 'text'` 的块（推理 / 工具块结构性排除）。 */
function textOfMessage(message: unknown): string {
  if (typeof message !== 'object' || message === null) return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const typed = block as { type?: unknown; text?: unknown }
    if (typed.type !== 'text' || typeof typed.text !== 'string') continue
    const trimmed = typed.text.trim()
    if (trimmed.length > 0) parts.push(trimmed)
  }
  return parts.join('\n').trim()
}
