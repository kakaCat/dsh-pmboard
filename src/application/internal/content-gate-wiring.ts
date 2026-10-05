/**
 * 内容闸门的**取数 + 组装**层（REQ-d3e61a）——读文档、拼参数、产 GateFailure。
 *
 * 三层职责（尺寸门禁 ≤400 行，故按职责拆分，依赖方向单向）：
 *   - content-gates.ts        纯判定（给定文本 → 缺口），零 IO
 *   - content-trace.ts        编号图分析（追溯 / 三方一致性 / 接收标记），零 IO
 *   - content-gate-wiring.ts  **本文件**：取数与闸门组装（唯一碰文件系统的地方）
 *
 * 为保持既有 import 不变，本文件**再导出** content-trace 的分析 API。
 *
 * @module dsh-pmboard/application/internal/content-gate-wiring
 */
import type { OverCapacityItem, PlanTask, RequirementRecord, TaskRecord } from '../../shared/protocol.js'
import type { GateFailure } from './artifact-gates.js'
import {
  parseDocument,
  extractClauseDefinitions,
  extractClauseDefinitionOccurrences,
  extractSkippedClauses,
  checkClauseCoverage,
  checkNumberChain,
  checkDesignSectionsHaveServes,
  checkE2ECoverage,
  extractServes,
  extractServesFrom,
  collectIds,
  checkClauseSequence,
  checkClauseDuplicates,
  type DocsReader,
  type NumberedItem,
  type ParsedDoc,
} from './content-gates.js'
import { collectTaskRefs, planKeysIn, taskRefsFromDecomposition } from './content-trace.js'
import { judgeFootprint } from '../../domain/task/Footprint.js'
import { envelope } from './gate-feedback.js'
import { fmt } from '../../domain/text/fmt.js'
import { workspacePathCandidates } from './support.js'

// 分析 API 再导出（调用方继续从本模块 import，不必改）
export {
  traceNumber,
  buildConsistencyRows,
  consistencyGaps,
  taskRefsFromDecomposition,
  collectTaskRefs,
  clauseReceiveStatus,
  unreceivedClauses,
  isRootKind,
  ROOT_PREFIXES_LIKE,
} from './content-trace.js'
export type {
  ConsistencyRow,
  ConsistencyTaskLike,
  ReceiveState,
  ClauseReceiveStatus,
  ReceiveTaskLike,
} from './content-trace.js'
export type { DocsEntry, DocsReader } from './content-gates.js'

/**
 * FR-7 第二通道：从计划文档（decomposition.md）的覆盖对照表读「计划 key → FR 引用」。
 * 与 requirementRefsOf（任务对象通道）互为补充：显式优先、文档兜底，两处都没有才算缺。
 */
export async function planRefsFromDoc(docs: DocsReader, req: { id: string }): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const path = 'docs/requirements/' + req.id + '/decomposition.md'
  if (!docs.exists(path)) return map
  const rows = taskRefsFromDecomposition(parseDocument(await docs.read(path)))
  for (const t of rows) {
    // 注意字段名：taskRefsFromDecomposition 返回的是 ConsistencyTaskLike——**id** 承载计划键
    // （不是 key），引用在 requirement_refs / requirementRefs 两个拼法下都可能出现（本项目两种都认）。
    const key = t.id
    const refs = [...(t.requirement_refs ?? []), ...(t.requirementRefs ?? [])]
      .filter((x): x is string => typeof x === 'string')
    if (typeof key === 'string' && key.length > 0 && refs.length > 0) map.set(key, refs)
  }
  return map
}

/**
 * FR-7 判定单点：两条通道（任务对象 / 计划文档）合并后，**哪些计划卡仍然没有 FR 引用**。
 * 返回空数组 = 引用齐备，可落库；非空 = 调用方据此拒绝并点名这些卡。
 */
export function planRefsMissing(
  keys: readonly string[],
  refsByKey: ReadonlyMap<string, string[]>,
): string[] {
  return keys.filter(k => (refsByKey.get(k) ?? []).length === 0)
}

/** 读任务对象上的 requirement_refs（同时认 snake_case 与 camelCase，避免写法不一致导致静默漏判）。 */
export function requirementRefsOf(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const o = raw as Record<string, unknown>
  const v = o['requirement_refs'] ?? o['requirementRefs']
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * 覆盖门禁（FR-1）：拆分提交前，核对**需求里每条根编号都有落点**——
 * 要么被至少一张任务卡用 requirement_refs 接收，要么被显式标「本轮不做」。
 *
 * 放行条件（任一即跳过，避免误拦）：存量需求 / 需求文档不存在 / 文档里没有编号条款。
 */
export async function assertClauseCoverageGate(
  docs: DocsReader,
  req: RequirementRecord,
  rawTasks: readonly unknown[],
): Promise<GateFailure | undefined> {
  const isLegacy = req.artifacts === undefined || req.artifacts.length === 0
  if (isLegacy) return undefined

  const path = 'docs/requirements/' + req.id + '/requirement.md'
  if (!docs.exists(path)) return undefined

  const doc = parseDocument(await docs.read(path))
  const roots = extractClauseDefinitions(doc)
  if (roots.length === 0) return undefined

  // FR-1（REQ-84bea5）：从"任务对象 ∪ decomposition.md RTM"读取 refs（双源合并）
  const refsFromTasks = rawTasks.flatMap(requirementRefsOf)
  const decompositionPath = 'docs/requirements/' + req.id + '/decomposition.md'
  const refsFromRTM = docs.exists(decompositionPath)
    ? taskRefsFromDecomposition(parseDocument(await docs.read(decompositionPath))).flatMap(t => t.requirement_refs ?? [])
    : []
  const covered = [...new Set([...refsFromTasks, ...refsFromRTM])]
  const skipped = extractSkippedClauses(doc)
  const { gaps } = checkClauseCoverage(roots, covered, { skipped })
  if (gaps.length === 0) return undefined

  return {
    code: 'requirement_uncovered',
    kind: 'decomposition',
    gaps,
    message: envelope({
      lead: 'reqboard_decompose 未执行：',
      what: fmt('需求条款 {list}', { list: gaps.join('、') }),
      why: '既没有被任何任务卡接收、也没有标「本轮不做」',
      how: '恢复路径二选一（都真的能用）：① 在计划文档 ' + decompositionPath + ' 的覆盖对照表补「FR-N ↔ 计划 key」行'
        + '（表头含「需求条款」与「接收任务」两列即被门禁读取，形如 | FR-1 | … | t4 |）；'
        + '② 显式调 reqboard_decompose(requirement_id="' + req.id + '", tasks=[{key:"t1",title:"…",implementation:"…",acceptance:"…",requirement_refs:["FR-1"]}, …])，'
        + '其中 key 必须与已批准计划一致。确需本轮不做的条款，在需求文档该条旁显式写明「本轮不做」并给出理由。'
        + '注意：不要给任务卡加 requirement_refs——落库前根本没有任务卡可加。',
    }),
  }
}

// REQ-2d1c74 的闸门独立成模块（尺寸门禁），此处再导出保持既有 import 路径不变
export { checkDesignCompletenessGate, checkDesignDecompositionGate, assertArtifactOpenable } from './design-gates.js'


/**
 * 设计章节可追溯门禁（FR-5，硬拦）：**每个二级章节都必须标注服务哪条功能点**。
 * 缺标注 = 孤儿章节 → design_orphan。
 */
export async function checkDesignServesGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined> {
  const isLegacy = req.artifacts === undefined || req.artifacts.length === 0
  if (isLegacy) return undefined

  const designDir = 'docs/requirements/' + req.id + '/design'
  const names = (docs.list?.(designDir) ?? [])
    .filter(e => e.isFile !== false && (e.name ?? '').endsWith('.md'))
    .map(e => e.name ?? '')
    .filter(n => n.length > 0)
  if (names.length === 0) return undefined

  const missing: string[] = []
  for (const name of names) {
    const p = designDir + '/' + name
    if (!docs.exists(p)) continue
    const doc = parseDocument(await docs.read(p))
    for (const sec of checkDesignSectionsHaveServes(doc).missing) missing.push(name + ' → ' + sec)
  }
  if (missing.length === 0) return undefined

  return {
    code: 'design_orphan',
    kind: 'plan',
    gaps: missing,
    message: envelope({
      lead: '提交未执行：',
      what: fmt('设计章节 {list}', { list: missing.join('；') }),
      why: '该二级章节缺 serves 标注（没说明服务哪条功能点）',
      how: '在标题行补 serves: FR-#（多值逗号分隔）后重调 reqboard_submit(kind=plan)；不服务任何条款的章节删掉或合并',
    }),
  }
}

/**
 * 设计文档内容校验门禁（REQ-260929210741-30ae FR-2 / t3）——`submit(kind=design)` 登记前调用。
 *
 * 与 checkDesignServesGate（plan 提交时的 design_orphan 门禁）的区别：
 *  - 本门禁在 **design 提交时**就拦截，不等到 plan 提交才发现（测评发现的流程断点：
 *    空壳设计文档能登记，确认后推进拆分才爆，返工成本翻倍）；
 *  - 校验项多一层**文档级 serves**（H1 或 front-matter 必须声明服务哪些 FR）+
 *    **悬空引用**（serves 指向 requirement.md 里不存在的条款）；
 *  - 聚合报错：一次报全所有文档的全部违规（不止第一条），避免修一个发现一个的重试风暴。
 *
 * 存量/直种需求（artifacts 为空）豁免——与本仓既有口径一致。
 */
export async function checkDesignContentGate(
  docs: DocsReader,
  req: RequirementRecord,
): Promise<GateFailure | undefined> {
  const isLegacy = req.artifacts === undefined || req.artifacts.length === 0
  if (isLegacy) return undefined

  const designDir = 'docs/requirements/' + req.id + '/design'
  const names = (docs.list?.(designDir) ?? [])
    .filter(e => e.isFile !== false && (e.name ?? '').endsWith('.md'))
    .map(e => e.name ?? '')
    .filter(n => n.length > 0)
  if (names.length === 0) return undefined

  // 需求文档里真实存在的条款 id（悬空引用判定的查找表）
  const reqPath = 'docs/requirements/' + req.id + '/requirement.md'
  const realClauses = new Set<string>()
  if (docs.exists(reqPath)) {
    const reqDoc = parseDocument(await docs.read(reqPath))
    for (const id of extractClauseDefinitions(reqDoc)) realClauses.add(id)
  }

  const docLevelMissing: string[] = [] // 文档级 serves 缺失（H1/frontmatter 都没有）
  const sectionMissing: string[] = [] // H2 缺 serves
  const dangling: string[] = [] // serves 引用了不存在的条款
  const seenDangling = new Set<string>()

  for (const name of names) {
    const p = designDir + '/' + name
    if (!docs.exists(p)) continue
    const doc = parseDocument(await docs.read(p))

    // ① 文档级：H1 标题行或 front-matter 必须声明 serves
    const h1 = doc.headings.find(h => h.level === 1)
    const h1Serves = h1 !== undefined ? extractServes(h1.text) : []
    const fmServes = extractServesFrom(doc, { frontmatterKeys: ['serves', 'requirement_refs'] })
    const docLevel = [...new Set([...h1Serves, ...fmServes])]
    if (docLevel.length === 0) docLevelMissing.push(name)

    // ② 章节级：每个 H2 必须有 serves（复用既有判定）
    for (const sec of checkDesignSectionsHaveServes(doc).missing) {
      sectionMissing.push(name + ' → ' + sec)
    }

    // ③ 悬空引用：文档声明的全部 serves（含章节级）指向真实条款
    for (const id of extractServesFrom(doc)) {
      if (realClauses.size > 0 && !realClauses.has(id) && !seenDangling.has(name + ' → ' + id)) {
        seenDangling.add(name + ' → ' + id)
        dangling.push(name + ' → ' + id)
      }
    }
  }

  const all: string[] = [
    ...docLevelMissing.map(n => n + '（文档级 serves 缺失：H1 或 front-matter 补 serves: FR-x）'),
    ...sectionMissing.map(s => s + '（H2 缺 serves 标注）'),
    ...dangling.map(d => d + '（引用了 requirement.md 中不存在的条款）'),
  ]
  if (all.length === 0) return undefined

  return {
    code: 'REQBOARD_DESIGN_CONTENT_GATE',
    kind: 'design',
    gaps: all,
    message: envelope({
      lead: 'reqboard_submit(kind=design) 被内容校验门禁拒绝：',
      what: fmt('{list}', { list: all.join('；') }),
      why: '设计文档必须声明服务哪些功能点（serves 标注），且引用的条款必须真实存在',
      how: '补齐标注/修正引用后重调 reqboard_submit(kind=design)；本次一次报全全部违规',
    }),
  }
}

/**
 * 需求文档格式校验门禁（编号规范强制）——在 submit(requirement) 时立即校验，
 * 避免让用户确认不合格的文档。系统负责格式，人负责内容。
 *
 * 校验项：
 *  1. 必须有根编号（FR-/BUG-/...）
 *  2. 编号不能跳号（连续性）
 *  3. 编号不能重复（唯一性）
 */
export async function checkRequirementDocFormatGate(
  docs: DocsReader,
  req: RequirementRecord,
): Promise<GateFailure | undefined> {
  const isLegacy = req.artifacts === undefined || req.artifacts.length === 0
  if (isLegacy) return undefined

  const path = 'docs/requirements/' + req.id + '/requirement.md'
  if (!docs.exists(path)) return undefined

  const doc = parseDocument(await docs.read(path))
  const roots = extractClauseDefinitions(doc)
  // 判重必须用**不去重**的清单：roots 已 Set 去重，喂给 checkClauseDuplicates 会让计数恒 ≤1（原本的死法）。
  const occurrences = extractClauseDefinitionOccurrences(doc)

  // 🚨 门禁 1：必须有根编号
  if (roots.length === 0) {
    return {
      code: 'requirement_missing_clauses',
      kind: 'requirement',
      message: envelope({
        lead: 'reqboard_requirement_submit 未执行：',
        what: '需求文档的功能编号',
        why: '文档里没有任何根编号定义（缺 FR-/BUG-/RF-/SP-/DOC-/CH-）',
        how: '为每个功能点添加编号（格式：### FR-1: 功能名称 或 **FR-1: 功能名称**；前缀按类型：FR 功能 / BUG 缺陷 / RF 重构 / SP 调研 / DOC 文档 / CH 维护），再调 reqboard_submit(kind=requirement)',
      }),
    }
  }

  // 🚨 门禁 2：编号连续性（不能跳号）
  const sequenceGaps = checkClauseSequence(roots)
  if (sequenceGaps.length > 0) {
    return {
      code: 'requirement_clause_sequence_gap',
      kind: 'requirement',
      gaps: sequenceGaps,
      message: envelope({
        lead: 'reqboard_requirement_submit 未执行：',
        what: fmt('需求编号 {list}', { list: sequenceGaps.join('、') }),
        why: '编号不连续（跳号）',
        how: '补上缺失编号、或调整现有编号使其连续（如 FR-1, FR-2, FR-3），再调 reqboard_submit(kind=requirement)',
      }),
    }
  }

  // 🚨 门禁 3：编号唯一性（不能重复）
  const duplicates = checkClauseDuplicates(occurrences)
  if (duplicates.length > 0) {
    return {
      code: 'requirement_clause_duplicates',
      kind: 'requirement',
      gaps: duplicates,
      message: envelope({
        lead: 'reqboard_requirement_submit 未执行：',
        what: fmt('需求编号 {list}', { list: duplicates.join('、') }),
        why: '同一编号被定义多次（每个编号只能出现一次）',
        how: '合并重复条款、每个编号只留一处，再调 reqboard_submit(kind=requirement)',
      }),
    }
  }

  return undefined
}

/**
 * 测试文件是否在**文件头部**声明了覆盖的条款/卡。只扫前 20 行——约定是顶部注释块，
 * 不追求逐函数级标注（那会变成负担且无人维护）。
 */
export function testFileHasServesHeader(text: string): boolean {
  const head = text.split(/\r?\n/).slice(0, 20).join('\n')
  return extractServes(head).length > 0
}

/** 从 design/test-cases.md 的「实际文件」列取测试文件路径。 */
export function testFilesFromDesign(doc: ParsedDoc): string[] {
  const out = new Set<string>()
  for (const t of doc.tables) {
    const i = t.header.findIndex(h => h.includes('实际文件') || h.includes('测试文件') || h === '文件')
    if (i < 0) continue
    for (const row of t.rows) {
      for (const m of (row[i] ?? '').matchAll(/[\w./-]+\.(?:ts|tsx|js|py)/g)) out.add(m[0])
    }
  }
  return [...out].sort()
}

/**
 * 测试文件锚点：验收标准里写的 `npx vitest run tests/x.test.ts` 那类路径。
 * 只认 `tests/` 下的测试文件（`docs/*.md`、`src/*.ts` 不参与——evidence 存在性另有硬拦）。
 */
const TEST_ANCHOR_RE = /^tests\/[\w./@-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs)$/

/**
 * 验收锚点失效清单（REQ-260930183951-eb6c FR-2）。
 *
 * 从每个未取消任务的 `acceptance` 提取测试文件锚点，凡工作区**不存在**者入清单
 * （元素形如 `"<卡标题或 id> → tests/x.test.ts"`）——"照抄执行必然失败"的锚点必须可见。
 *
 * 与 `collectOrphanTestFiles` 同址同构：无锚点 / 探针读不到 → 空清单，**绝不阻断提交**。
 *
 * 护栏（同 e2e「读数未知不追加」口径）：工作区里**根本没有 `tests/` 目录**时整段跳过——
 * 那一刻的"锚点"前提不成立（不是本仓布局 / 裸夹具工作区），全量报缺失只会是噪声。
 */
export function collectMissingAnchors(docs: DocsReader, tasks: readonly TaskRecord[]): string[] {
  if (!docs.exists('tests')) return []
  const out = new Set<string>()
  for (const t of tasks) {
    if (t.status === 'canceled') continue
    const acceptance = t.acceptance ?? ''
    if (acceptance.length === 0) continue
    const label = t.title.length > 0 ? t.title : t.id
    for (const p of workspacePathCandidates([acceptance])) {
      if (!TEST_ANCHOR_RE.test(p)) continue
      if (docs.exists(p)) continue
      out.add(fmt('{label} → {path}', { label, path: p }))
    }
  }
  return [...out].sort()
}

/**
 * 孤儿用例：设计文件里点名了、但**文件头部没声明覆盖条款**的测试文件。
 * 按规范是**警告级**（不阻断），但必须作为可见项出现在验收面上。
 */
export async function collectOrphanTestFiles(docs: DocsReader, req: RequirementRecord): Promise<string[]> {
  const p = 'docs/requirements/' + req.id + '/design/test-cases.md'
  if (!docs.exists(p)) return []
  const files = testFilesFromDesign(parseDocument(await docs.read(p)))
  const orphans: string[] = []
  for (const f of files) {
    if (!docs.exists(f)) continue
    if (!testFileHasServesHeader(await docs.read(f))) orphans.push(f)
  }
  return orphans
}

/**
 * E2E 覆盖读数（FR-11）：从需求文档测试策略表读「有没有 E2E 行」。
 * 返回 undefined = 读数未知（文档缺失/为空）——此时不追加可见项，避免噪声。
 */
export async function e2eCoverageOf(docs: DocsReader, req: RequirementRecord): Promise<boolean | undefined> {
  const p = 'docs/requirements/' + req.id + '/requirement.md'
  if (!docs.exists(p)) return undefined
  const text = await docs.read(p)
  if (text.trim().length === 0) return undefined
  return checkE2ECoverage(parseDocument(text)).hasE2E
}

/** 收集本次需求涉及的全部「带编号条目」：需求条款（根）+ 设计文档各章节（其 serves 指向上游）。 */
export async function collectNumberedItems(docs: DocsReader, req: RequirementRecord): Promise<NumberedItem[]> {
  const base = 'docs/requirements/' + req.id
  const items: NumberedItem[] = []

  const reqPath = base + '/requirement.md'
  if (docs.exists(reqPath)) {
    const doc = parseDocument(await docs.read(reqPath))
    for (const id of extractClauseDefinitions(doc)) items.push({ id, serves: [], kind: 'requirement' })
  }

  const designDir = base + '/design'
  const names = (docs.list?.(designDir) ?? [])
    .filter(e => e.isFile !== false && (e.name ?? '').endsWith('.md'))
    .map(e => e.name ?? '')
    .filter(n => n.length > 0)
  for (const name of names) {
    const p = designDir + '/' + name
    if (!docs.exists(p)) continue
    const doc = parseDocument(await docs.read(p))
    for (const h of doc.headings) {
      if (h.level < 2) continue
      const id = collectIds(h.text)[0]
      if (id === undefined) continue
      items.push({ id, serves: extractServes(h.text), kind: 'design' })
    }
  }
  return items
}

// ---------------------------------------------------------------------------
// 结单证据锚定（FR-4 / T-6）：证据不是"我做了"，而是"这条需求因此被满足了"
// ---------------------------------------------------------------------------

/** 可核验锚点（比计划期的断言词更严）：路径 / 命令 / 数据查询 / 明确的通过计数。 */
export const EVIDENCE_ANCHOR = /\.(ts|tsx|js|mjs|cjs|md|html|json|py|go|css|sh)\b|\b(npx|npm|pnpm|vitest|node|curl|grep|python3?|bash|pytest|sql)\b|SELECT\s|diff\s|\d+\s*(passed|通过)/i

/**
 * 结单证据锚定缺口（FR-4）：证据必须**可定位**——含本卡交付的条款编号，或含可核验锚点
 * （命令 / 路径 / 数据）。"测试通过""已完成"这类空话无法定位到条款，等于没证据。
 *
 * **只在有 RTM 绑定（clauseIds 非空）时生效**：没有绑定的需求无从判"该定位到哪条"，
 * 不做追溯惩罚（与其它内容闸门同语义）。
 */
export function evidenceAnchorGap(clauseIds: readonly string[], evidence: readonly string[]): string | undefined {
  if (clauseIds.length === 0) return undefined
  const texts = evidence.map(e => e.trim()).filter(e => e.length > 0)
  if (texts.length === 0) {
    return '结单证据为空——必须给可核验证据（命令+输出摘要 / 报告路径 / 数据前后对比）'
  }
  const byClause = texts.some(t => clauseIds.some(c => t.includes(c)))
  const byAnchor = texts.some(t => EVIDENCE_ANCHOR.test(t))
  if (byClause || byAnchor) return undefined
  return '证据不可定位（既无条款编号 ' + clauseIds.join('/') + '，也无命令/路径/数据锚点）：' + texts[0].slice(0, 60)
}

/** 结单证据锚定的入参（状态判定在 application 层——tools/ 层不许出现状态字面量）。 */
export interface DoneAnchorInput {
  taskId: string
  /** 目标状态（由调用方原样透传，判定在本模块做） */
  to: string
  tasks: readonly { id: string; requirementId: string; lastReport?: { completed?: readonly string[]; filesChanged?: readonly string[] } | undefined }[]
  boundRequirementIds: readonly string[]
}

/**
 * 结单前的证据锚定校验（FR-4 / T-6）。返回缺口文案（undefined = 通过）。
 *
 * 状态判定刻意留在本层（application）：架构门禁规定 **tools/ 与 http/ 内不得出现状态字面量**，
 * 工具壳只调用、不判断。
 */
export async function doneEvidenceAnchorFailure(docs: DocsReader, input: DoneAnchorInput): Promise<string | undefined> {
  if (input.to !== 'done') return undefined
  const task = input.tasks.find(t => t.id === input.taskId)
  if (task === undefined) return undefined
  if (!input.boundRequirementIds.includes(task.requirementId)) return undefined
  const refs = await collectTaskRefs(docs, { id: task.requirementId })
  const clauseIds = refs.find(r => r.id === task.id)?.requirement_refs ?? []
  const evidence = [...(task.lastReport?.completed ?? []), ...(task.lastReport?.filesChanged ?? [])]
  return evidenceAnchorGap(clauseIds, evidence)
}

/** 编号串联检查结果：failure=悬空（拒）；orphans=根编号无下游（**不拒**，交调用方标红）。 */
export interface NumberChainReport {
  failure?: GateFailure
  orphans: string[]
  items: NumberedItem[]
}

/**
 * 编号串联门禁（FR-2）：**不悬空**硬拦、**不孤儿**只标红。
 * 刻意不把孤儿做成硬拦——多写一份设计却暂时没有下游，是过程状态，不该锁死提交。
 */
export async function checkNumberChainGate(docs: DocsReader, req: RequirementRecord): Promise<NumberChainReport> {
  const isLegacy = req.artifacts === undefined || req.artifacts.length === 0
  if (isLegacy) return { orphans: [], items: [] }

  const items = await collectNumberedItems(docs, req)
  if (items.length === 0) return { orphans: [], items }

  const { dangling, orphans } = checkNumberChain(items)
  if (dangling.length === 0) return { orphans, items }

  return {
    orphans,
    items,
    failure: {
      code: 'dangling_reference',
      kind: 'plan',
      gaps: dangling,
      message: envelope({
        lead: '提交未执行：',
        what: fmt('编号引用 {list}', { list: dangling.join('；') }),
        why: '悬空（serves 指向不存在的编号）',
        how: '改为引用 requirement.md 里真实存在的 FR-#（或先在需求文档补上被引用的那一条），再调 reqboard_submit(kind=plan)',
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// 三级追溯覆盖度检查（需求追溯性改进 - 2026-09-26）
// ---------------------------------------------------------------------------

/**
 * 三级追溯覆盖度统计
 */
export interface TraceabilityCoverage {
  /** Level 1: 需求 ← 设计 */
  designCoverage: {
    total: number           // FR 总数
    covered: number         // 有设计的 FR 数
    gaps: string[]          // 未被设计覆盖的 FR
  }
  
  /** Level 2: 设计 ← 任务 */
  implementationCoverage: {
    total: number           // 设计章节总数
    covered: number         // 有任务实现的章节数
    gaps: string[]          // 未被任务实现的设计章节
  }
  
  /** Level 3: 任务 ← 测试 */
  testCoverage: {
    total: number           // 任务总数
    tested: number          // 有测试的任务数
    gaps: string[]          // 未被测试覆盖的任务
  }
}

/**
 * 导出设计章节相关函数（从 content-trace.ts）
 */
export {
  extractDesignSections,
  extractAllDesignSections,
  findDesignSectionsForFRs,
  checkDesignCoverage,
  checkImplementationCoverage,
} from './content-trace.js'
export type { DesignSection } from './content-trace.js'

/**
 * 完整的三级追溯覆盖度检查
 * 
 * @param docs 文档读取器
 * @param req 需求记录
 * @param tasks 任务列表
 * @returns 三级覆盖度统计
 */
export async function checkFullTraceability(
  docs: DocsReader,
  req: RequirementRecord,
  tasks: readonly unknown[]
): Promise<TraceabilityCoverage> {
  const requirementPath = `docs/requirements/${req.id}/requirement.md`
  const designDir = `docs/requirements/${req.id}/design`
  
  // 提取需求条款
  const requirementDoc = await docs.read?.(requirementPath)
  const frList = requirementDoc ? extractClauseDefinitions(parseDocument(requirementDoc)) : []
  
  // 提取设计章节
  const { extractAllDesignSections, checkDesignCoverage, checkImplementationCoverage } = 
    await import('./content-trace.js')
  const designSections = extractAllDesignSections(docs, designDir)
  
  // Level 1: 需求 ← 设计
  const designGaps = checkDesignCoverage(frList, designSections)
  
  // Level 2: 设计 ← 任务
  const taskDesignRefs: string[] = []
  for (const task of tasks) {
    if (typeof task === 'object' && task !== null) {
      const t = task as Record<string, unknown>
      const designServes = t['design_serves'] ?? t['designServes']
      if (typeof designServes === 'string') {
        taskDesignRefs.push(...designServes.split(/[,，]\s*/).map(s => s.trim()))
      } else if (Array.isArray(designServes)) {
        taskDesignRefs.push(...designServes.filter((x): x is string => typeof x === 'string'))
      }
    }
  }
  const implGaps = checkImplementationCoverage(designSections, taskDesignRefs)
  
  // Level 3: 任务 ← 测试
  // TODO: 需要从测试文档提取 covers 标注
  const testGaps: string[] = []
  
  return {
    designCoverage: {
      total: frList.length,
      covered: frList.length - designGaps.length,
      gaps: designGaps
    },
    implementationCoverage: {
      total: designSections.length,
      covered: designSections.length - implGaps.length,
      gaps: implGaps
    },
    testCoverage: {
      total: tasks.length,
      tested: 0,  // TODO: 实现测试覆盖度统计
      gaps: testGaps
    }
  }
}

/**
 * 三级覆盖度门禁（可选，用于验收阶段）
 * 
 * @param docs 文档读取器
 * @param req 需求记录
 * @param tasks 任务列表
 * @returns 门禁失败信息（如果有缺口）
 */
export async function assertFullTraceabilityGate(
  docs: DocsReader,
  req: RequirementRecord,
  tasks: readonly unknown[]
): Promise<GateFailure | undefined> {
  const coverage = await checkFullTraceability(docs, req, tasks)
  
  const errors: string[] = []
  
  // 检查设计覆盖度
  if (coverage.designCoverage.gaps.length > 0) {
    errors.push(
      `设计缺失：需求条款 ${coverage.designCoverage.gaps.join('、')} 没有对应的设计章节`
    )
  }
  
  // 检查实施覆盖度
  if (coverage.implementationCoverage.gaps.length > 0) {
    errors.push(
      `实施缺失：设计章节 ${coverage.implementationCoverage.gaps.slice(0, 5).join('、')} ` +
      (coverage.implementationCoverage.gaps.length > 5 
        ? `等 ${coverage.implementationCoverage.gaps.length} 个章节没有任务实现`
        : '没有任务实现')
    )
  }
  
  // 检查测试覆盖度（可选，暂不强制）
  // if (coverage.testCoverage.gaps.length > 0) {
  //   errors.push(`测试缺失：${coverage.testCoverage.gaps.length} 个任务没有测试覆盖`)
  // }
  
  if (errors.length === 0) return undefined
  
  return {
    code: 'traceability_incomplete',
    message: errors.join('；'),
    gaps: [
      ...coverage.designCoverage.gaps,
      ...coverage.implementationCoverage.gaps,
      ...coverage.testCoverage.gaps
    ]
  }
}

// ---------------------------------------------------------------------------
// 超容量软门禁（REQ-261002175818-80a8 t5 / FR-4、FR-5）：算出来、标出来，但**不拒绝落库**
// ---------------------------------------------------------------------------

/**
 * 超容量卡清单（FR-4）：纯计算、零 IO。
 *
 * 两条边界都在判定单点（`domain/task/Footprint`）里，本函数**不重算**：
 *   · 未声明的卡**不判定**（FR-9：未声明 ≠ 0，绝不冒充）；
 *   · 恰好等于容量的卡**不算超**（严格大于才超）。
 */
export function overCapacityItemsOf(tasks: readonly PlanTask[], capacity: number): OverCapacityItem[] {
  const out: OverCapacityItem[] = []
  for (const t of tasks) {
    if (t.footprint === undefined) continue
    const j = judgeFootprint(t.footprint, capacity)
    if (!j.over) continue
    const batches = j.suggestedBatches ?? 2
    out.push({
      key: t.key,
      title: t.title,
      detailUnits: j.detailUnits,
      capacity: j.capacity,
      suggestedBatches: batches,
      hint: splitHintOf(batches, j.capacity),
    })
  }
  return out
}

/**
 * 一句话切分建议：只谈切法，不复述体量的来历（数字在同类字段里，重复就是两处真相）。
 *
 * 刻意**不**去解析 implementation 里点到的目录名：那需要第二份路径词法
 * （`Footprint` 的 countedPaths 没导出，正是为了全仓只有一份），两份词法必然漂移。
 * 少一句目录名，好过再养一份会跟判定走散的真相。
 */
function splitHintOf(batches: number, capacity: number): string {
  return '按目录或按接口切：拆成 ' + String(batches) + ' 批以内的子卡（同一目录 / 同一接口聚成一批），每批 ≤ '
    + String(capacity) + ' DU'
}

/** FR-5 门禁回执：`failure` 只在 enforce 且确有缺口时给出；`gaps` 无论哪种门禁强度都照原样回报。 */
export interface OverCapacityMarkerReport {
  /** enforce 且有缺口时给出；warn 时**恒** undefined（降级的是拒绝，不是披露） */
  failure?: GateFailure
  /** 逐卡缺口（缺标记 / 批数不符），点名 key 与**期望批数**；warn 时也交给调用方进返回体 */
  gaps: string[]
}

/**
 * FR-5 标记在场门禁：计划文档里每张超容量卡都必须有「⚠️超容量(建议N批)」，且 **N == 判定批数**。
 *
 * 为什么要求 N 相等、而不只要求"有标记"：只要求在场，就会留下「标了但数字是旧算的」——
 * 披露与判定悄悄漂移，而人只看标记。相等是可机械证伪的。
 *
 * 两条早退（都照 `assertClauseCoverageGate` 的惯例）：没有超容量卡 → 不读文档（旧计划与轻量计划
 * 永不触发）；`decomposition.md` 不存在 → 放行（没有文档就没有可查的依据，不凭"文件不存在"判违规）。
 *
 * key 的认法**复用** `planKeysIn`（计划键的唯一词法）：先把括号归一成空格，于是
 * `| t5 | … | ⚠️超容量(建议8批) |` 与 `t5 ⚠️超容量(建议8批)` 都认得出，不必再写一份"key 怎么算出现"。
 * 代价（刻意接受并写在用例里）：一行里若挤进**多张**超容量卡，只取该行第一个「建议N批」——
 * FR-5 要求的是"卡片行前带标记"，一行一卡是这条规则的前提。
 */
export async function checkOverCapacityMarkerGate(
  docs: DocsReader,
  req: { id: string },
  items: readonly { key: string; suggestedBatches: number }[],
  gate: 'enforce' | 'warn',
  planPath?: string,
): Promise<OverCapacityMarkerReport> {
  if (items.length === 0) return { gaps: [] }
  // 读**实际提交的那份计划**：`reqboard_submit(kind=plan)` 的 path 是 agent 可传的，
  // 而硬编码 `decomposition.md` 会把"提交到别处"变成一条**静默放行**面——
  // 计划照落库、标记无人查、也不报警（2026-10-04 复核指出；本仓最忌"静默"）。
  const path = planPath !== undefined && planPath.length > 0
    ? planPath
    : 'docs/requirements/' + req.id + '/decomposition.md'
  if (!docs.exists(path)) return { gaps: [] }

  const lines = (await docs.read(path)).split(/\r?\n/)
  const gaps: string[] = []
  for (const item of items) {
    const expected = String(item.suggestedBatches)
    const line = lines.find(l => l.includes('超容量') && planKeysIn(l.replace(/[（(]/g, ' ')).includes(item.key))
    const written = line === undefined ? undefined : /建议\s*(\d+)\s*批/.exec(line)?.[1]
    if (written === undefined) {
      gaps.push(item.key + ' 缺标记「⚠️超容量(建议' + expected + '批)」')
      continue
    }
    if (Number(written) !== item.suggestedBatches) {
      gaps.push(item.key + ' 标记批数不符：文档写「建议' + written + '批」，判定为 ' + expected + ' 批')
    }
  }
  if (gaps.length === 0 || gate === 'warn') return { gaps }

  return {
    gaps,
    failure: {
      code: 'plan_overcapacity_marker_missing',
      kind: 'plan',
      gaps,
      message: envelope({
        lead: 'reqboard_plan_submit 未执行：',
        what: fmt('超容量卡 {list}', { list: gaps.join('；') }),
        why: '超容量必须在计划文档里标出建议批数，且标记的批数要与判定一致'
          + '（只要求"有标记"会让披露与判定悄悄漂移，而人只看标记）',
        how: '在 ' + path + ' 的任务表里给这些卡补上「⚠️超容量(建议N批)」（N 取上面点名的期望值），'
          + '或把卡切小到不超容量后重交；确需先放行、不校验标记时，插件配置 capacity.markerGate="warn"（只披露不拒绝）',
      }),
    },
  }
}
