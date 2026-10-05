/**
 * 汇报七条（主干）读时抽取（REQ-261004222448-292a t-242dd9 / 设计 backend.md §S-5）。
 *
 * 本模块只做三件事，且都不生成新叙述：
 *   ① 按**写死的节名**从需求 / 设计文档取节；② 只截该节的原文行当摘要；③ 抽不到即标
 *   `missing:'doc-section-missing'`（页面照实渲染「文档未提供该节」）。
 *
 * 节名匹配（写死节名 + 真实标题装饰的容忍度，见 `matchesSectionName`）：
 *   剥掉 HTML 注释与 serves 标注后，**以节名开头**或与节名相等即命中——真实标题形如
 *   `## 目标与总体方案 \`serves: FR-11, FR-1\``、`## 边界（不做什么）`，整行严格相等永远匹配不上；
 *   但"包含 / 以节名结尾"不算命中，H1 也更严（文档标题 `# 架构文档（REQ-xxx）` 不许被当成「架构」节）。
 *
 * 三条不许破的纪律（`tests/query-trunk.test.ts` 逐条机械断言）：
 *   - **不回退**：`assembleTrunk` 的入参里**根本没有** `req.description`（结构性保证），
 *     所以"文档缺节 → 拿需求描述补齐"这条路不存在，而不是"记得别这么写"；
 *   - **不改写**：摘要每一条都是原文行（对任一摘要行 `text.includes(line)` 恒真）；
 *   - **不替人编**：亮点的人写条目 `evidence` 为空就原样返回空数组（前端渲染「未提供证据」，
 *     服务端不替它找证据，也不因为没证据就丢掉这条——丢了人就看不到"反应付"这个信号）。
 *
 * 降级口径（与 §S-5「边界条件」逐条对应）：
 *   - 文档不存在 / 不可读 / 节存在但为空 → 该条 `missing`（**不是 500**，也不是"没有"）；
 *   - 同一节出现在多份设计文档 → 合并摘要、逐份保留来源路径（`openRefs`）；
 *   - `deps.docs` 未装配 → 文档类条目全部 `missing`（contracts.ts 的加法式扩展，缺省即降级）；
 *   - 台账不可读（`store.get` 抛错或需求不在册）→ 整个响应走 `Degrade`。
 *
 * 为什么 IO 只在 `queryTrunk` 里：`assembleTrunk` / `extractSection` 是纯函数，测试直接喂文本
 * 就能断言"缺节长什么样"，不必造文件系统（application 层禁止 `import node:`，见 layer-boundary）。
 *
 * @module dsh-pmboard/application/query/QueryTrunk
 */
import { fmt } from '../../domain/text/fmt.js'
import { extractClauseDefinitions, markCodeFences, parseDocument } from '../internal/content-gates.js'
import { designDocNamesOf } from '../internal/design-docs.js'
import type { PanelQueryDeps, PanelQueryInput, QueryTrunk } from './contracts.js'
import type {
  RequirementRecord,
  TrunkFact,
  TrunkHighlight,
  TrunkItem,
  TrunkKey,
  TrunkResponse,
  TrunkSource,
} from '../../shared/protocol.js'

/* ── 写死的节名（data-model.md「节名匹配规则（写死，供断言）」） ───────────────────── */

/**
 * 抽取用的节名——**写死，不做同义词联想、不做模型判断**。
 * 需求文档与设计文档各取所需；匹配只做"规范化后相等"（见 `normalizeHeading`）。
 */
export const TRUNK_SECTION_NAMES = {
  productDefinition: '产品定义',
  boundary: '边界',
  architecture: '架构',
  decision: '关键决策与取舍',
  highlight: '技术方案与亮点',
} as const

/** 主干七条的顺序（与 protocol.ts 的 TrunkKey 一一对应，前端按此顺序渲染）。 */
export const TRUNK_KEYS: readonly TrunkKey[] = ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight']

/** 摘要上限（protocol：2~4 行摘要）。截断而非改写——第 5 行不会"被概括"，只会不出现。 */
const SUMMARY_MAX_LINES = 4

/* ── 纯函数：节定位与抽节 ───────────────────────────────────────────────────── */

export interface SectionSlice {
  /** 规范化后的节名（与传入的写死节名相等）。 */
  name: string
  level: number
  /** 标题行的 1-based 行号。 */
  startLine: number
  /** 节正文首行 / 末行的 1-based 行号（空节时 bodyEndLine < bodyStartLine）。 */
  bodyStartLine: number
  bodyEndLine: number
  /** 节正文行（不含标题行、不含下一个同级/更高级标题）。 */
  lines: string[]
  /** 节正文（首尾去空白）；'' = 有节但为空。 */
  text: string
  /** 剥掉装饰（HTML 注释 / serves 标注 / 多余空白）后的标题，如 `边界（不做什么）` / `架构`。 */
  title: string
  /** 标题**原样**（含 `serves:` 标注那一段）——留作出处，便于人工核对"命中的到底是哪一行"。 */
  rawTitle: string
}

/**
 * 剥标题上的**装饰**（只影响"判节"，不改正文一个字）：
 *   - HTML 注释（`<!-- serves: FR-1 -->`）；
 *   - 反引号包裹的 serves 标注（`` `serves: FR-11, FR-1` ``）与行尾裸 serves 标注。
 *
 * 为什么必须剥：设计文档每个 H2 都被门禁 `checkDesignSectionsHaveServes`
 * （content-gates.ts）要求带 serves 标注，真实标题形如
 * `## 目标与总体方案 \`serves: FR-11, FR-1\``——整行严格相等永远匹配不上（剥法同
 * content-trace.ts 的既有先例）。
 */
export function stripHeadingDecorations(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/`\s*serves\s*[:：][^`]*`/gi, '')
    .replace(/\s*\bserves\s*[:：][^\n]*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 标题规范化（用于相等判定）：在剥装饰之上，再去掉成对括号后缀与行尾标点——
 * 需求文档的 `## 边界（不做什么）` 与写死的 `边界` 必须能判等。
 */
export function normalizeHeading(raw: string): string {
  return stripHeadingDecorations(raw)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[：:、·\s]+$/g, '')
    .trim()
}

/**
 * 节名命中判据：剥装饰后的标题**以写死节名开头**，或与它（去掉括号/标点后）相等。
 *
 * 为什么允许"以节名开头"而不是整行相等：真实标题总带后缀——`边界（不做什么）`、
 * `架构 \`serves: …\``；而**不允许**"包含"或"以节名结尾"：`## 模块改动地图` 不该被认成
 * 「架构」，抽错节比抽不到更坏（它会伪装成"有内容"）。
 *
 * `level` 参与判据：**H1 是文档标题**（`# 架构文档（REQ-xxx）` 会以「架构」开头，若照前缀匹配
 * 就会把整份文档当成一节抽走）。故 H1 只在**恰好等于节名**时算命中——同 content-gates.ts
 * `checkDesignSectionsHaveServes` 的既有口径（H1 视为文档标题不参与章节判定）。
 */
export function matchesSectionName(rawTitle: string, heading: string, level = 2): boolean {
  const target = normalizeHeading(heading)
  if (target.length === 0) return false
  const clean = stripHeadingDecorations(rawTitle)
  const equal = clean === target || normalizeHeading(rawTitle) === target
  if (level <= 1) return equal
  return equal || clean.startsWith(target)
}

/**
 * 定位写死节名的节（纯函数）。找不到 → `undefined`。
 *
 * 边界判定**跳过代码围栏**（复用 `markCodeFences`）：文档里贴一段含 `# 注释` 的代码，
 * 不会被当成节标题截断（content-gates.ts 的同款纪律）。
 */
export function findSection(text: string, heading: string): SectionSlice | undefined {
  const lines = text.split(/\r?\n/)
  const inFence = markCodeFences(lines)
  const target = normalizeHeading(heading)
  if (target.length === 0) return undefined
  let start = -1
  let level = 0
  let rawTitle = ''
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (m === null || !matchesSectionName(m[2], heading, m[1].length)) continue
    start = i
    level = m[1].length
    rawTitle = m[2].trim()
    break
  }
  if (start < 0) return undefined
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (inFence[i]) continue
    const m = /^(#{1,6})\s+/.exec(lines[i])
    if (m !== null && m[1].length <= level) {
      end = i
      break
    }
  }
  const body = lines.slice(start + 1, end)
  return {
    name: target,
    title: stripHeadingDecorations(rawTitle),
    rawTitle,
    level,
    startLine: start + 1,
    bodyStartLine: start + 2,
    bodyEndLine: end,
    lines: body,
    text: body.join('\n').trim(),
  }
}

/**
 * 抽节正文（**纯函数**，卡上点名的导出）。
 *   - `undefined` = 文档里没有这一节；
 *   - `''`        = 有这一节但正文为空。
 * 两者在抽取结果上**同处置**（都按 `missing`），分开返回只是为了让"没写节"与"写了个空节"
 * 在测试与排查里可区分（空节是文档质量问题，不是路径写错）。
 */
export function extractSection(text: string, heading: string): string | undefined {
  const section = findSection(text, heading)
  return section === undefined ? undefined : section.text
}

/** 取节的"前若干行原文"：只做过滤与截断，**不改一个字的措辞**。 */
export function summaryOf(section: SectionSlice, max: number = SUMMARY_MAX_LINES): string[] {
  const out: string[] = []
  for (const raw of section.lines) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (line.startsWith('<!--')) continue
    // 表格分隔行（|---|:--|）不含信息，进摘要只会占掉 2~4 行的额度
    if (/^\|[\s:|-]+\|$/.test(line)) continue
    out.push(line)
    if (out.length >= max) break
  }
  return out
}

/* ── 纯函数：assembleTrunk 的输入 / 输出 ─────────────────────────────────────── */

/** 一份文档（路径 + 调用方已经经端口读好的正文）。 */
export interface TrunkDocInput {
  path: string
  text: string
}

export interface TrunkDocsInput {
  /** 需求文档路径（`openRefs` 用）。 */
  requirementPath: string
  /** 需求文档正文；`undefined` = 不存在 / 不可读。 */
  requirementText?: string
  /** 设计目录（一份设计文档都没有时的说明用）。 */
  designDir: string
  /** 设计文档（可多份；同一节出现在多份 → 合并）。 */
  designDocs: readonly TrunkDocInput[]
}

/** 亮点自动事实所需的**最小**任务投影（只要执行记录里的改动清单与条款引用）。 */
export interface TrunkTaskInput {
  id: string
  requirementRefs?: readonly string[]
  lastReport?: { filesChanged: readonly string[]; completed: readonly string[] } | undefined
}

/** 台账侧输入：人工门往返留痕 + 计划摘要（`plan.summary` 由 store 读出后传入）。 */
export interface TrunkLedgerInput {
  comments: readonly { body: string }[]
  tasks: readonly TrunkTaskInput[]
  planSummary?: string
  planPath?: string
  /** 计划被退回时的理由（台账 `plan.rejectedReason`，**取原文**）。 */
  planRejectedReason?: string
}

export interface AssembleTrunkInput {
  requirementId: string
  docs: TrunkDocsInput
  ledger: TrunkLedgerInput
  docLastUpdated?: number
}

/* ── 人工门往返留痕 ─────────────────────────────────────────────────────────── */

/**
 * 人工门往返留痕的识别标记（写法**取自各写入点原文**，不在本模块重写字样）：
 *   - `[确认弹框]`：internal/confirm-settle.ts（用户确认 / 未确认 + 用户意见）；
 *   - `[回退]`：internal/rollback-revocation.ts（人在看板上的回退决定）；
 *   - `[人工处置]`：use-cases/HandleFailure.ts（退回上游 / 重跑 / 取消）；
 *   - `[验收单]`：internal/verdicts.ts（逐项裁决与不通过项）。
 *
 * 只认这些标记：正文里出现别的"决策"字样的评论（如 agent 的过程叙述）不进主干——
 * 主干要的是**人的决定**，不是谁在评论里提到过决定。
 */
export const GATE_TRACE_MARKERS = ['[确认弹框]', '[回退]', '[人工处置]', '[验收单]'] as const

/** 取人工门往返留痕（原文，逐条）；没有 → 空数组。 */
export function gateTraces(ledger: TrunkLedgerInput): string[] {
  const out: string[] = []
  const rejected = ledger.planRejectedReason?.trim()
  if (rejected !== undefined && rejected.length > 0) out.push(rejected)
  for (const c of ledger.comments) {
    const body = c.body.trim()
    if (body.length === 0) continue
    if (!GATE_TRACE_MARKERS.some(m => body.includes(m))) continue
    out.push(body)
  }
  return out
}

/* ── 亮点：a 类自动事实 / b 类人写 / 成果清单 ─────────────────────────────────── */

/** 测试文件判定（"新增测试"这一条自动事实的口径；只看路径，不读内容）。 */
const TEST_DIR_RE = /(^|\/)(tests?|__tests__)\//i
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i

function isTestPath(p: string): boolean {
  return TEST_DIR_RE.test(p) || TEST_FILE_RE.test(p)
}

function uniqSort(items: readonly string[]): string[] {
  return [...new Set(items.map(s => s.trim()).filter(s => s.length > 0))].sort()
}

/** 全部执行记录里改动过的文件（去重、排序）——亮点事实与成果清单的同一份底数。 */
export function changedFilesOf(tasks: readonly TrunkTaskInput[]): string[] {
  return uniqSort(tasks.flatMap(t => [...(t.lastReport?.filesChanged ?? [])]))
}

/**
 * a 类**自动事实**：全部可计算，不依赖任何人的自述。
 *
 * 缺席纪律（FR-12 同款）：数据源不存在时**不出这一条**，而不是输出 0——
 * "没有执行记录"与"改动 0 个文件"是两件事，前者说明还没跑过，后者是"跑了但没改东西"。
 *   - 没有任何 `lastReport` → 改动规模 / 新增测试两条都不出；
 *   - 需求文档里没有 FR 定义 → FR 覆盖度不出。
 */
export function buildFacts(ledger: TrunkLedgerInput, requirementText: string | undefined): TrunkFact[] {
  const facts: TrunkFact[] = []
  const reported = ledger.tasks.filter(t => t.lastReport !== undefined)
  if (reported.length > 0) {
    const files = changedFilesOf(ledger.tasks)
    facts.push({ label: '改动规模', value: fmt('{n} 个文件（去重）', { n: files.length }), evidence: files })
    const tests = files.filter(isTestPath)
    facts.push({ label: '新增测试文件', value: fmt('{n} 个', { n: tests.length }), evidence: tests })
  }
  const clauses = requirementText === undefined ? [] : extractClauseDefinitions(parseDocument(requirementText))
  if (clauses.length > 0) {
    const refs = new Set(ledger.tasks.flatMap(t => [...(t.requirementRefs ?? [])]))
    const covered = clauses.filter(c => refs.has(c))
    facts.push({
      label: 'FR 覆盖度',
      value: fmt('{a}/{b} 条', { a: covered.length, b: clauses.length }),
      evidence: covered,
    })
  }
  return facts
}

/** 成果清单：由改动文件清单汇总（自动、可复核）；没有执行记录 → 空数组（不编）。 */
export function buildAchievement(tasks: readonly TrunkTaskInput[]): string[] {
  return changedFilesOf(tasks)
}

/** 差异 + 为什么 + 证据：条目里必须**显式写出**的标签（题面来自 S-5 的"形如…的条目"）。 */
const HIGHLIGHT_LABEL_RE = /(差异|亮点|不同|为什么|理由|证据|evidence)/i
const EVIDENCE_RE = /(?:证据|evidence)\s*[:：]\s*(.*)$/i
const WHY_RE = /(?:为什么|理由|why)\s*[:：]\s*(.*)$/i

/** 证据指针的分隔符（路径清单常见写法；不做 URL / 通配符解析，只切分原文）。 */
function splitEvidence(raw: string): string[] {
  return raw
    .split(/[，,、;；]/)
    .map(s => s.trim().replace(/^[「『"']|[」』"']$/g, ''))
    .filter(s => s.length > 0)
}

/** 按列表项 / 段落切条目（空行不切块：列表项内部的空行很常见）。 */
function splitEntries(lines: readonly string[]): string[][] {
  const isItem = (l: string): boolean => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l)
  const blocks: string[][] = []
  let cur: string[] | null = null
  for (const raw of lines) {
    if (raw.trim().length === 0) continue
    if (isItem(raw) || cur === null) {
      cur = [raw]
      blocks.push(cur)
      continue
    }
    cur.push(raw)
  }
  return blocks
}

/**
 * b 类**人写判断**：「技术方案与亮点」节里形如"差异 + 为什么 + 证据"的条目。
 *
 * 两条刻意的口径：
 *   - 条目**必须至少写出一个标签**（差异 / 为什么 / 证据）才算数——否则该节的导语散文会被
 *     当成"亮点"凑数（那正是本需求要反的应付）；
 *   - `evidence` 抽不到就是 `[]`，**原样返回**：不替它填、也不因此丢掉这条。
 */
export function parseHighlights(section: SectionSlice): TrunkHighlight[] {
  const out: TrunkHighlight[] = []
  for (const block of splitEntries(section.lines)) {
    const labelled = block.some(l => HIGHLIGHT_LABEL_RE.test(l))
    if (!labelled) continue
    let why = ''
    const evidence: string[] = []
    const diffLines: string[] = []
    for (const raw of block) {
      const line = raw.trim().replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '')
      const ev = EVIDENCE_RE.exec(line)
      if (ev !== null) {
        evidence.push(...splitEvidence(ev[1]))
        continue
      }
      const wy = WHY_RE.exec(line)
      if (wy !== null) {
        if (why.length === 0) why = wy[1].trim()
        continue
      }
      diffLines.push(line)
    }
    const diff = diffLines.join(' ').trim()
    if (diff.length === 0 && why.length === 0 && evidence.length === 0) continue
    out.push({ diff, why, evidence })
  }
  return out
}

/* ── 组装七条 ──────────────────────────────────────────────────────────────── */

interface DocHit {
  path: string
  /** 整份文档正文（标签块/表格定位要用结构调整后的行号）。 */
  text: string
  section: SectionSlice
}

/** 在多份文档里找写死节名；节不存在或正文为空 → 不算命中（空节 ≠ 有内容）。 */
function hitsOf(docs: readonly TrunkDocInput[], heading: string): DocHit[] {
  const hits: DocHit[] = []
  for (const d of docs) {
    const section = findSection(d.text, heading)
    if (section === undefined || section.text.length === 0) continue
    hits.push({ path: d.path, text: d.text, section })
  }
  return hits
}

/**
 * 「点开原文」入口：命中逐份列出；未命中给一个说明"该节缺在哪"的入口（人好去补写）。
 *
 * 命中的入口带上**标题原文**（`doc` 字段）——同一节可能出现在多份文档、标题还可能带
 * `serves:` 后缀或括号后缀，页面/排查都要能看出"命中的是哪一行"，而不是事后猜。
 */
function openRefsOf(
  hits: readonly DocHit[],
  missingLabel: string,
  fallbackPath: string | undefined,
): TrunkItem['openRefs'] {
  if (hits.length > 0) {
    return hits.map(h => ({
      label: fmt('原文 · {path} § {title}', { path: h.path, title: h.section.title }),
      path: h.path,
      doc: h.section.rawTitle,
    }))
  }
  return [{ label: missingLabel, ...(fallbackPath !== undefined ? { path: fallbackPath } : {}) }]
}

/**
 * 文档条目的统一收口：`summary` 空 ⇔ `missing` 置位。
 * 这条不变量是协议注释里那句「空数组 ⇒ 无内容（与 missing 搭配）」的代码化——
 * 前端据此只需看一个字段，不必再判"有摘要但标了缺节"这种自相矛盾的状态。
 */
function docItem(input: {
  key: TrunkKey
  summary: string[]
  source: TrunkSource[]
  openRefs: TrunkItem['openRefs']
  extra?: Pick<TrunkItem, 'facts' | 'highlights' | 'achievement'>
}): TrunkItem {
  const empty = input.summary.length === 0
  return {
    key: input.key,
    source: input.source,
    summary: input.summary.slice(0, SUMMARY_MAX_LINES),
    ...(empty ? { missing: 'doc-section-missing' as const } : {}),
    openRefs: input.openRefs,
    ...(input.extra !== undefined ? input.extra : {}),
  }
}

/** 「为何做」标签：优先取节的领句（`**一句话**` / 背景 / 理由），否则退化为该节前几行。 */
const WHY_LABELS = ['一句话', '为何', '为什么', '背景', '理由', '目标', '立项'] as const
/** 「解决什么」标签：优先取痛点/问题表或问题段，否则退化为该节前几行。 */
const PROBLEM_LABELS = ['问题', '痛点', '影响面', '影响', '收益'] as const

/**
 * 在节内按**原文标签**取摘要——「为何做」与「解决什么」抽自同一节（§产品定义），
 * 必须靠文档自己的结构分开，而不是靠我们总结：
 *   ① 表头命中标签的表格 → 取每行**首列的原文**（如「痛点（实测）」表的问题列）；
 *   ② 命中标签的粗体标签行 → 取该行起的原文块（遇空行 / 表格 / 标题即停）；
 *   ③ 都没有 → 退化为「该节前几行」（不做任何改写）。
 */
function labelledSummary(hit: DocHit, labels: readonly string[]): string[] {
  const { section } = hit
  const doc = parseDocument(hit.text)
  const table = doc.tables.find(t =>
    t.line >= section.bodyStartLine
    && t.line <= section.bodyEndLine
    && t.header.some(h => labels.some(l => h.includes(l))))
  if (table !== undefined) {
    const cells = table.rows
      .map(r => (r[0] ?? '').trim())
      .filter(c => c.length > 0)
      .slice(0, SUMMARY_MAX_LINES)
    if (cells.length > 0) return cells
  }
  const idx = section.lines.findIndex(l =>
    labels.some(l2 => new RegExp('^\\s*(?:[-*+]\\s+)?\\*\\*[^*]*' + l2).test(l)))
  if (idx >= 0) {
    const out: string[] = []
    for (let i = idx; i < section.lines.length; i++) {
      const line = section.lines[i].trim()
      if (line.length === 0) break
      if (i > idx && (line.startsWith('|') || /^#{1,6}\s/.test(line))) break
      out.push(line)
      if (out.length >= SUMMARY_MAX_LINES) break
    }
    if (out.length > 0) return out
  }
  return summaryOf(section)
}

/**
 * 组装主干七条（**纯函数**：文本与台账事实都由调用方经端口读好）。
 *
 * 注意入参里没有 `requirement.description`——"抽不到就回退需求描述"在类型层就写不出来。
 */
export function assembleTrunk(input: AssembleTrunkInput): TrunkResponse {
  const { docs, ledger } = input
  const reqDocs: TrunkDocInput[] = docs.requirementText === undefined
    ? []
    : [{ path: docs.requirementPath, text: docs.requirementText }]
  const designDocs = docs.designDocs
  const designFallback = designDocs[0]?.path
  const files = changedFilesOf(ledger.tasks)

  /* ① 为何做：需求文档 §产品定义（领句）。 */
  const whyHits = hitsOf(reqDocs, TRUNK_SECTION_NAMES.productDefinition)
  const whySummary = whyHits.length > 0 ? labelledSummary(whyHits[0], WHY_LABELS) : []
  const why: TrunkItem = docItem({
    key: 'why',
    summary: whySummary,
    source: ['doc'],
    openRefs: openRefsOf(whyHits, fmt('需求文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.productDefinition }), docs.requirementPath),
  })

  /* ② 解决什么：同一节的**问题面**（痛点表首列 / 问题段），不是同一段文字抄两遍。 */
  const problemHits = hitsOf(reqDocs, TRUNK_SECTION_NAMES.productDefinition)
  const problemSummary = problemHits.length > 0 ? labelledSummary(problemHits[0], PROBLEM_LABELS) : []
  const problem: TrunkItem = docItem({
    key: 'problem',
    summary: problemSummary,
    source: ['doc'],
    openRefs: openRefsOf(problemHits, fmt('需求文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.productDefinition }), docs.requirementPath),
  })

  /* ③ 实现思路：设计文档 §架构（主线）+ 计划摘要（台账 plan.summary，措辞原文）。 */
  const archHits = hitsOf(designDocs, TRUNK_SECTION_NAMES.architecture)
  const archLines = archHits.flatMap(h => summaryOf(h.section))
  const planSummary = ledger.planSummary?.trim()
  const approachSummary = archLines.length > 0
    ? archLines.slice(0, SUMMARY_MAX_LINES)
    : (planSummary !== undefined && planSummary.length > 0 ? [planSummary] : [])
  const approachRefs: TrunkItem['openRefs'] = [
    ...openRefsOf(archHits, fmt('设计文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.architecture }), designFallback),
    ...(ledger.planPath !== undefined ? [{ label: fmt('拆分计划 · {path}', { path: ledger.planPath }), path: ledger.planPath }] : []),
  ]
  const approach: TrunkItem = docItem({
    key: 'approach',
    summary: approachSummary,
    source: archLines.length > 0 ? ['doc'] : (planSummary !== undefined && planSummary.length > 0 ? ['ledger'] : ['doc']),
    openRefs: approachRefs,
  })

  /* ④ 范围边界：需求文档 §边界。 */
  const scopeHits = hitsOf(reqDocs, TRUNK_SECTION_NAMES.boundary)
  const scope: TrunkItem = docItem({
    key: 'scope',
    summary: scopeHits.flatMap(h => summaryOf(h.section)),
    source: ['doc'],
    openRefs: openRefsOf(scopeHits, fmt('需求文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.boundary }), docs.requirementPath),
  })

  /*
   * ⑤ 关键决策与取舍：设计文档 §关键决策与取舍（FR-13 新增节）+ 人工门往返留痕。
   *   - 两者都有 → **合并**（FR-2 明写"含人的退回理由"，只取文档就把人的决定丢了）；
   *   - 节缺但留痕命中 → **命中留痕即有内容**（口径见 interfaces.md 抽取规则表）；missing 不置位，
   *     因为这条确实有内容，硬标"文档未提供该节"会让页面把有内容的一条渲染成空的；
   *   - 两处都没有 → 空态 + 说辞（openRefs 指向"该节该写在哪"与"留痕去哪看"）。
   */
  const decisionHits = hitsOf(designDocs, TRUNK_SECTION_NAMES.decision)
  const decisionDocLines = decisionHits.flatMap(h => summaryOf(h.section))
  const traces = gateTraces(ledger)
  const decisionSummary = [...decisionDocLines, ...traces].slice(0, SUMMARY_MAX_LINES)
  const decisionSource: TrunkSource[] = [
    ...(decisionDocLines.length > 0 ? (['doc'] as const) : []),
    ...(traces.length > 0 ? (['ledger', 'human'] as const) : []),
    ...(decisionSummary.length === 0 ? (['doc'] as const) : []),
    'new-section',
  ]
  const decision: TrunkItem = docItem({
    key: 'decision',
    summary: decisionSummary,
    source: decisionSource,
    openRefs: [
      ...openRefsOf(decisionHits, fmt('设计文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.decision }), designFallback),
      { label: '人工门往返留痕（台账评论）' },
    ],
  })

  /* ⑥ 技术方案：设计文档 §技术方案与亮点 + §架构（两处合并，保留各自来源路径）。 */
  const techHits = hitsOf(designDocs, TRUNK_SECTION_NAMES.highlight)
  const techLines = [...techHits.flatMap(h => summaryOf(h.section)), ...archLines]
  const techSource: TrunkSource[] = techHits.length > 0 ? ['doc', 'new-section'] : ['doc']
  const tech: TrunkItem = docItem({
    key: 'tech',
    summary: techLines,
    source: techSource,
    openRefs: openRefsOf(
      techHits.length > 0 ? techHits : archHits,
      fmt('设计文档缺「{s}」/「{a}」节', { s: TRUNK_SECTION_NAMES.highlight, a: TRUNK_SECTION_NAMES.architecture }),
      designFallback,
    ),
  })

  /*
   * ⑦ 亮点与差异 + 成果清单：同节的人写条目（b 类）+ 自动事实（a 类）+ 改动文件清单。
   *   人写节的缺节与人写缺证据是两回事：前者置 missing（文档没写），后者保留条目 + `evidence: []`。
   */
  const highlightHits = hitsOf(designDocs, TRUNK_SECTION_NAMES.highlight)
  const highlightSummary = highlightHits.flatMap(h => summaryOf(h.section))
  const highlights = highlightHits.flatMap(h => parseHighlights(h.section))
  const facts = buildFacts(ledger, docs.requirementText)
  const highlightSource: TrunkSource[] = [
    ...(highlightHits.length > 0 ? (['doc'] as const) : (['new-section'] as const)),
    ...(facts.length > 0 ? (['auto'] as const) : []),
  ]
  const highlight: TrunkItem = docItem({
    key: 'highlight',
    summary: highlightSummary,
    source: [...highlightSource],
    openRefs: [
      ...openRefsOf(highlightHits, fmt('设计文档缺「{s}」节', { s: TRUNK_SECTION_NAMES.highlight }), designFallback),
      ...(files.length > 0 ? [{ label: '改动文件清单（执行记录）' }] : []),
    ],
    extra: { facts, highlights, achievement: files },
  })

  return {
    items: [why, problem, approach, scope, decision, tech, highlight],
    ...(input.docLastUpdated !== undefined ? { docLastUpdated: input.docLastUpdated } : {}),
  }
}

/* ── 端口版入口（IO 只在这里） ───────────────────────────────────────────────── */

/** 设计文档 / 需求文档都按仓内既有约定定位（与 QueryRequirementMarks、design-docs 同源）。 */
function requirementDocPath(reqId: string): string {
  return 'docs/requirements/' + reqId + '/requirement.md'
}
function designDirOf(reqId: string): string {
  return 'docs/requirements/' + reqId + '/design'
}

/** 文档最后更新时间（取需求文档 + 设计文档的最大 mtime；一份都取不到 → undefined，不编）。 */
function latestMtime(docs: PanelQueryDeps['docs'], paths: readonly string[]): number | undefined {
  if (docs === undefined) return undefined
  let latest: number | undefined
  for (const p of paths) {
    let stat: { mtimeMs: number; size: number } | undefined
    try {
      stat = docs.stat(p)
    } catch {
      stat = undefined
    }
    if (stat === undefined) continue
    if (latest === undefined || stat.mtimeMs > latest) latest = stat.mtimeMs
  }
  return latest
}

/**
 * 汇报七条只读查询（端点 `GET /requirements/:id/report/trunk` 的装配）。
 *
 * 读路径全走端口：`store`（需求 + 评论）/ `tasks`（执行记录）/ `docs`（文档正文与 mtime）。
 * 任何一处**读不到**都不抛 500：文档类降级成该条 `missing`，留痕读不到当"没有留痕"——
 * 页面宁可显示"文档未提供该节"，也不要整屏加载失败（FR-12）。
 */
export const queryTrunk: QueryTrunk = async (deps: PanelQueryDeps, input: PanelQueryInput) => {
  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    return {
      available: false,
      reason: 'ledger-unreadable',
      note: fmt('台账读不到（需求 {id}）：{msg}', { id: input.requirementId, msg: err instanceof Error ? err.message : String(err) }),
    }
  }
  if (req === undefined) {
    return {
      available: false,
      reason: 'ledger-unreadable',
      note: fmt('需求 {id} 不在台账中（读不到主干抽取所需的文档登记）', { id: input.requirementId }),
    }
  }

  const requirementPath = requirementDocPath(req.id)
  const designDir = designDirOf(req.id)
  let requirementText: string | undefined
  const designDocs: TrunkDocInput[] = []
  const docs = deps.docs
  if (docs !== undefined) {
    if (docs.exists(requirementPath)) {
      // 不可读 → 当"没有这一节"（该条 missing），不是 500
      try {
        requirementText = await docs.read(requirementPath)
      } catch {
        requirementText = undefined
      }
    }
    let names: string[] = []
    try {
      names = designDocNamesOf(docs, req.id)
    } catch {
      names = []
    }
    for (const name of [...names].sort()) {
      const path = designDir + '/' + name
      try {
        designDocs.push({ path, text: await docs.read(path) })
      } catch {
        // 单份设计文档不可读 → 跳过（该节若只在这份里，则按 missing 呈现）
      }
    }
  }

  let tasks: readonly { id: string; requirementRefs?: readonly string[]; lastReport?: { filesChanged: readonly string[]; completed: readonly string[] } | undefined }[] = []
  try {
    tasks = await deps.tasks.listByRequirement(req.id)
  } catch {
    tasks = []
  }

  let comments: readonly { body: string }[] = []
  try {
    comments = await deps.store.listComments(req.id)
  } catch {
    comments = []
  }

  const docLastUpdated = latestMtime(docs, [
    requirementPath,
    ...designDocs.map(d => d.path),
  ])

  return assembleTrunk({
    requirementId: req.id,
    docs: {
      requirementPath,
      designDir,
      ...(requirementText !== undefined ? { requirementText } : {}),
      designDocs,
    },
    ledger: {
      comments,
      tasks,
      ...(req.plan?.summary !== undefined ? { planSummary: req.plan.summary } : {}),
      ...(req.plan?.path !== undefined ? { planPath: req.plan.path } : {}),
      ...(req.plan?.rejectedReason !== undefined ? { planRejectedReason: req.plan.rejectedReason } : {}),
    },
    ...(docLastUpdated !== undefined ? { docLastUpdated } : {}),
  })
}
