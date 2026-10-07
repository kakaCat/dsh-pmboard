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
import type { OverCapacityItem, PlanTask, RequirementRecord, RequirementStatus, TaskRecord } from '../../shared/protocol.js'
import type { GateFailure } from './artifact-gates.js'
// REQ-261005105032-3b02 §10 #46：原型三门 / 裁定门的**唯一** async 分派入口就在本文件（见文件末
// `contentGatesForMove`）。门本体各自成模块，本文件只做分派——四条转移路径只调用、不复制判定。
import {
  checkPrototypeAnchorsGate,
  checkPrototypePresenceGate,
  checkPrototypeVersionGate,
  parsePrototypeIndex,
  prototypeExemptOf,
} from './prototype-gates.js'
// 「原型已登记」的唯一判据（REQ-261006091755-1c9e FR-1/FR-3）：锚点维判「有没有可锚对象」时
// 复用它与 presence 门同一条口径——目录里有未登记的骨架**不算**交了原型。
import { registeredPrototypesOf } from './prototype-registration.js'
// UI 卡原型锚点维（REQ-261005105032-3b02 FR-5 / t12）：解析与逐卡判定是纯函数（可单独逆验证），
// 本文件只做取数（读 INDEX）与组装 GateFailure——与 FR 落点门共用同一个判定单点。
import { prototypeRefsFromPlanDoc, prototypeAnchorGaps, uiCardAnchorClaims } from './plan-prototype-refs.js'
import {
  checkDecisionLogGate,
  hasDecisionTrace,
  type DecisionSessionReader,
} from './decision-gates.js'
// 阶段门时序（FR-11 / t13）：三档时点各判一次「该绿的门」，逾期码 stage_gate_overdue（§10 #39）。
// 判定本体在该模块（可单测），本文件只做分派 + 把既有门当探针注入（见 STAGE_GATE_PROBES）。
import {
  assertStageGateTimelineGate,
  type StageGateProbes,
} from './stage-gate-timeline.js'
import { stageGateMomentFor } from '../../domain/gate/GateCatalog.js'
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
// 「什么算 UI 需求」的唯一判据（feature/refactor 且 sides 含 frontend ⇒ 需求阶段必交原型）：
// 本文件的前筛与三个原型门同吃这一份，避免两处各判一次而分叉。
import { conditionalStageArtifactsFor, designDocPolicyFrom, hasRootSection, requiredStageArtifactKinds, sidesDeclarationGap } from './category-doc-sets.js'
import { docQualityRulesApply } from '../../domain/workflow/DocQualityRules.js'
import { EVIDENCE_ANCHOR } from '../../domain/workflow/EvidenceAnchor.js'
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
  collectReceiveRefs,
  ledgerTaskRefs,
  mergeTaskRefs,
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
 *
 * ⚠️ 本通道**不再是覆盖门禁的依据**（2026-10-06 收敛，见 `assertClauseCoverageGate` 的模块注释）：
 * 卡上 refs 是覆盖门禁的**唯一**取数口，文档表当门禁依据会造出「门禁绿、卡上全空」的静默缺口
 * （实测落库率 28%）。它现在只服务 `refsForLanding` 的**存量 / 回填通道**——规则生效前提交、
 * 卡上没 refs 的老计划，靠它把文档表的引用补回落库值；新计划已被门禁要求显式 refs，走不到这条。
 *
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
 * 覆盖门禁（FR-1 + FR-5）：拆分提交 / 落库前，核对两件事——
 *  ① **需求里每条根编号都有落点**：要么被至少一张任务卡用 requirement_refs 接收，
 *     要么被显式标「本轮不做」（REQ-d3e61a T-3）；
 *  ② **每张 UI 卡的「设计落点」带原型锚点**（REQ-261005105032-3b02 FR-5 / t12）：
 *     需求为 feature/refactor 且 sides 含 frontend 时，`side === 'frontend'` 的卡必须写明
 *     `prototypes/<name>.html#FR-N`，且路径等于 `prototypes/INDEX.md` 的权威行。
 *
 * 为什么两维同处一个函数（不是一个门一个函数）：调用它的三条入口（`Decompose.ts` /
 * `approved-plan-landing.ts` / `SubmitArtifact.ts` 的 kind=plan）只认这一处判定单点，
 * 加维只改这里 = 三条入口自动复用，既有调用点签名不变（少一个函数就少一处"漏接线"）。
 *
 * **refs 单口径（2026-10-06 收敛，本函数的第一维）**：covered **只**来自
 * `rawTasks.flatMap(requirementRefsOf)`——任务对象上的 `requirement_refs`。
 * 三句话理由：① 卡上 refs 是**下游唯一读点**（RTM `generateRTMData`、结单证据锚定
 * `doneEvidenceAnchorFailure`、条款接收状态 `syncRequirementMarks` 都只读 TaskRecord.requirementRefs，
 * 没有一处读计划文档的覆盖对照表）；② 把文档表当门禁依据 = 门禁读 A、下游读 B，于是造出
 * 「门禁绿、卡上全空」的静默缺口（实测落库率 28%）；③ 门禁要收的是**落库那一刻的事实**，
 * 而文档表只是人读的汇总。
 *
 * 放行条件（任一即跳过，避免误拦）：存量需求 / 需求文档不存在 / 文档里没有编号条款 /
 * 非 UI 需求 / 本计划没有 UI 卡。
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

  // FR-1（REQ-84bea5）：covered 的唯一来源 = 任务对象的 requirement_refs。
  // 2026-10-06 收敛：此前还合并 decomposition.md 的覆盖对照表（refsFromRTM），于是「门禁绿、
  // 卡上全空」成为可能——下游（RTM / 结单证据锚定 / 条款接收状态）只读卡上 refs，谁都不读文档表。
  const covered = [...new Set(rawTasks.flatMap(requirementRefsOf))]
  const skipped = extractSkippedClauses(doc)
  const { gaps } = checkClauseCoverage(roots, covered, { skipped })
  const decompositionPath = 'docs/requirements/' + req.id + '/decomposition.md'
  if (gaps.length > 0) {
    return {
      code: 'requirement_uncovered',
      kind: 'decomposition',
      gaps,
      message: envelope({
        lead: 'reqboard_decompose 未执行：',
        what: fmt('需求条款 {list}', { list: gaps.join('、') }),
        why: '既没有被任何任务卡接收、也没有标「本轮不做」',
        how: '唯一可执行的路径：在 reqboard_submit(kind=plan) 的 tasks[] / reqboard_decompose 的 tasks[] 里，'
          + '给每张卡写 requirement_refs:["FR-N"]（其中 key 必须与已批准计划一致）——例如 '
          + 'tasks=[{key:"t1",title:"…",implementation:"…",acceptance:"…",requirement_refs:["' + gaps[0] + '"]}, …]。'
          + '计划文档 ' + decompositionPath + ' 的覆盖对照表仍建议写（人读的汇总、也是 RTM 表的样子），'
          + '但它**不再是门禁依据**：门禁与下游（RTM / 结单证据锚定 / 条款接收状态）都只读卡上的 requirement_refs，'
          + '只补文档表 = 门禁依旧红。确需本轮不做的条款，在需求文档该条旁显式写明「本轮不做」并给出理由。',
      }),
    }
  }

  // ── ② UI 卡原型锚点维（FR-5 / t12）：FR 落点齐备后再判，缺锚点即逐卡点名 ──────────
  return assertUiCardPrototypeAnchors(docs, req, doc, rawTasks, decompositionPath)
}

/**
 * UI 卡原型锚点维（REQ-261005105032-3b02 FR-5 / TC-17）——本维的**唯一判定点**。
 *
 * 判据三件（缺一即拒，逐卡点名）：
 *  ① 需求是 UI 需求：feature/refactor 且 `sides` 含 frontend（与三个原型门同吃
 *     `conditionalStageArtifactsFor` 这一份判据，不另写"什么算 UI 需求"）；
 *  ② 每张 `side === 'frontend'` 的卡都有锚点：任务对象 `prototypeRefs` 或计划文档
 *     「原型锚点（UI 卡必填）」列任一非空即可（双源合并，人两种写法都算数）；
 *  ③ 锚点路径 = `prototypes/INDEX.md` 的权威行（指向被取代版本 = 拒）。
 *
 * 降级（不重复报）：INDEX 缺失 / 有解析缺口 / 权威条数 ≠ 1 时只判形态——那三种形态由
 * `checkPrototypeVersionGate` 单点报一次（同一处坏不该让人在两条消息里对齐）。
 */
async function assertUiCardPrototypeAnchors(
  docs: DocsReader,
  req: RequirementRecord,
  doc: ParsedDoc,
  rawTasks: readonly unknown[],
  decompositionPath: string,
): Promise<GateFailure | undefined> {
  const sides = designDocPolicyFrom(doc.frontmatter).sides
  const applies = conditionalStageArtifactsFor(req.category, sides).some(c => c.kind === 'prototype')
  if (!applies) return undefined

  // 豁免生效 ∧ 该需求没有任何**已登记**原型产物 → 没有「可锚」的对象，整维跳过
  // （REQ-261006091755-1c9e FR-1/FR-3）：豁免的语义是「不强制交原型」，不是「交付物免检」——
  // 真登记了原型时下面照旧逐卡要求锚点。
  // 判据全部复用既有单点（什么算豁免 / 有没有原型各只有一处答案），且「有没有原型」只认
  // 产物簿的登记事实，**不**拿 INDEX 解析失败当「没有原型」——那会是一条静默放行面。
  if (prototypeExemptOf(req, doc.frontmatter).active && registeredPrototypesOf(req).length === 0) return undefined

  // 计划文档通道（人写在表里的那份）：只在文档存在时读，读不到就是"没有这条通道"。
  const docRefs = docs.exists(decompositionPath)
    ? prototypeRefsFromPlanDoc(parseDocument(await docs.read(decompositionPath)))
    : new Map<string, string[]>()
  const claims = uiCardAnchorClaims(rawTasks, docRefs)
  if (claims.length === 0) return undefined

  const gaps = prototypeAnchorGaps(claims, req.id, await authoritativePrototypePath(docs, req.id), decompositionPath)
  if (gaps.length === 0) return undefined

  return {
    code: 'prototype_anchor_missing',
    kind: 'decomposition',
    gaps,
    message: envelope({
      lead: 'reqboard_decompose 未执行：',
      what: fmt('UI 卡 {list} 的「设计落点」缺原型锚点', { list: gaps.map(g => g.split('（UI 卡）')[0] ?? g).join('、') }),
      why: '原型锚点是"这张卡照哪张原型的哪条功能点做"的唯一可核验载体；缺了它，实施只能凭印象画界面（UI 需求：feature/refactor 且 sides 含 frontend）',
      how: '在 ' + decompositionPath + ' 的任务表「原型锚点（UI 卡必填）」列按 templates/decomposing/decomposition.md 的形态补 prototypes/<name>.html#FR-N'
        + '（路径必须等于 ' + 'docs/requirements/' + req.id + '/prototypes/INDEX.md 的权威行；被取代版本会被拒），'
        + '或在 reqboard_submit(kind=plan) / reqboard_decompose 的 tasks[] 里写 prototypeRefs:["prototypes/detail.html#FR-4"]；'
        + '补完重调本入口（覆盖门禁在落库前跑，拒绝时零副作用）。'
        + '非 UI 卡请显式声明 side（backend / doc）——本维只判 side === frontend 的卡。',
    }),
  }
}

/**
 * INDEX 的权威原型路径（需求目录相对口径）；拿不到 = undefined（本维降级为只判形态）。
 *
 * 为什么复用 `parsePrototypeIndex` 而不自己读表：路径归一（`toReqRelative`）与"权威行恰好一条"
 * 的口径只能有一份实现，否则两处判定迟早分叉（本仓已栽过多次）。
 */
async function authoritativePrototypePath(docs: DocsReader, reqId: string): Promise<string | undefined> {
  const indexPath = 'docs/requirements/' + reqId + '/prototypes/INDEX.md'
  if (!docs.exists(indexPath)) return undefined
  const index = parsePrototypeIndex(parseDocument(await docs.read(indexPath)), reqId)
  if (index.gaps.length > 0) return undefined
  const auth = index.rows.filter(r => r.status === 'authoritative')
  return auth.length === 1 ? auth[0]?.path : undefined
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
 * 设计文档必备节缺口（REQ-261007125552-32cb FR-1）：`fileName` 必须含标题带 `sectionKeyword`
 * 的 H2；给了 `tableHeader` 时还要求节内有对应表头的表。豁免出口两条（同「失败与并发路径」口径）：
 * front-matter `design_exempt` 豁免该文件；或文档内写「不适用：」豁免行（保留节能被机械判定，删节不能）。
 *
 * 文件本身缺失 / 不在磁盘 → 返回 undefined（那是 missingCategoryDocs 门的判事，这里不重复报）。
 */
async function designSectionMissing(
  docs: DocsReader,
  designDir: string,
  names: readonly string[],
  fileName: string,
  exempt: Readonly<Record<string, string>>,
  sectionKeyword: string,
  tableHeader: string | undefined,
): Promise<string | undefined> {
  if (!names.includes(fileName)) return undefined
  if ((exempt[fileName] ?? '').trim().length > 0) return undefined
  const p = designDir + '/' + fileName
  if (!docs.exists(p)) return undefined
  const text = await docs.read(p)
  if (text.includes('不适用：')) return undefined
  const doc = parseDocument(text)
  const hasSection = doc.headings.some(h => h.level === 2 && h.text.includes(sectionKeyword))
  if (!hasSection) {
    return fmt('{file}（缺「{sec}」节：按 templates/design/{file} 补该节；确实无此界面/接口面时在节内写「不适用：<理由>」保留节，或在 front-matter 写 design_exempt={file}=理由）', { file: fileName, sec: sectionKeyword })
  }
  if (tableHeader !== undefined) {
    const hasTable = doc.tables.some(t => t.header.some(h => h.includes(tableHeader)))
    if (!hasTable) {
      return fmt('{file}（「{sec}」节里没有表头含「{col}」的清单表——清单要机器可扫，散文列举不算）', { file: fileName, sec: sectionKeyword, col: tableHeader })
    }
  }
  return undefined
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
  let reqFrontmatter: Readonly<Record<string, string>> = {}
  if (docs.exists(reqPath)) {
    const reqDoc = parseDocument(await docs.read(reqPath))
    for (const id of extractClauseDefinitions(reqDoc)) realClauses.add(id)
    reqFrontmatter = reqDoc.frontmatter
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

  // ④ 接口清单 / 组件树节（REQ-261007125552-32cb FR-1）：feature 需求的 interfaces.md
  // 必含「接口清单」节（节内有接口表或「不适用：」豁免行）；sides 含 frontend 时 frontend.md
  // 必含「组件树」节。生效口径 docQualityRulesApply——存量需求不追溯（与 sidesGateFailure 同款）。
  // 判据刻意做到文档级（H2 在场 + 表/豁免行在该文档内），不做节级作用域解析——
  // 粒度足够拦住「没写清单」，又不逼机器理解 markdown 节边界。
  const sectionListMissing: string[] = []
  if (docQualityRulesApply(req.createdAt) && req.category === 'feature') {
    const policy = designDocPolicyFrom(reqFrontmatter)
    const interfaceListMissing = await designSectionMissing(docs, designDir, names, 'interfaces.md', policy.exempt, '接口清单', '接口 id')
    if (interfaceListMissing !== undefined) sectionListMissing.push(interfaceListMissing)
    if (policy.sides.includes('frontend')) {
      const componentTreeMissing = await designSectionMissing(docs, designDir, names, 'frontend.md', policy.exempt, '组件树', undefined)
      if (componentTreeMissing !== undefined) sectionListMissing.push(componentTreeMissing)
    }
  }

  const all: string[] = [
    ...sectionListMissing,
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
 * 端侧声明门（2026-10-06 文档质量门禁加固）——**独立成门**，不塞进
 * `checkRequirementDocFormatGate`，两条理由都是实测结论：
 *
 *   ① 格式门有 `isLegacy`（`artifacts` 空即早退）——**首次提交正是 artifacts 为空的那一次**，
 *      塞进去等于"最该管的那次不管"；
 *   ② 格式门被 `STAGE_GATE_PROBES` 当时点探针复用（`stage-gate-timeline` 的「格式门」档），
 *      塞进去会把"端侧声明"的语义外溢到别的时点读数上。
 *
 * 存量豁免走 `docQualityRulesApply(createdAt)`（与 rtm-health 的 `PROTOTYPE_RULES_SINCE`
 * 同构）：规则生效前立项的需求不追溯，读数不可得（无 createdAt）也不判。
 */
export function sidesGateFailure(
  category: string | undefined,
  frontmatter: Readonly<Record<string, string>>,
  createdAt: number | undefined,
): GateFailure | undefined {
  if (!docQualityRulesApply(createdAt)) return undefined
  const gap = sidesDeclarationGap(category, frontmatter)
  if (gap === undefined) return undefined
  return {
    code: 'requirement_sides_invalid',
    kind: 'requirement',
    message: envelope({
      lead: 'reqboard_requirement_submit 未执行：',
      what: gap,
      why: '条件必交设计文档按 sides 触发：缺声明或值非法时判定被静默过滤，该交的设计文档永远不会被要求（等文档盖完章才发现缺，只能走变更流程）',
      how: '在 requirement.md front-matter 写 sides（括号或逗号写法都认，两种等价）：sides: [frontend]（有界面改动）/ [backend]（有服务端改动）/ [frontend, backend]（两端都改）/ []（明确声明本需求无端侧改动）——值只能是 frontend 或 backend，再调 reqboard_submit(kind=requirement)',
    }),
  }
}

/** 「失败与并发路径」节名（模板、门禁、探针三处同名同源；改一处必须改三处）。 */
export const FAILURE_CONCURRENCY_SECTION = '失败与并发路径'

/**
 * 「失败与并发路径」必填节门（2026-10-06 文档质量门禁加固）——**按需求创建时间**生效，存量不追溯。
 *
 * 为什么是独立门而不是进 `CATEGORY_DELTAS`：DELTA 会经 `missingCategoryDocs` 在**拆分提交 /
 * 设计门 / 文档自检**上对存量需求一起判——那等于追溯（实测会让在飞的老需求提交拆分计划时被新节
 * 拦住）。本节只在新需求的**需求文档提交**那一次判，存量豁免同样走 `docQualityRulesApply`。
 * 模板里这一节照旧存在（`templates/brainstorming/{feature,refactor}.md`），照模板写的需求天然满足；
 * `scripts/doc-section-parity.mts` 把它登记为 optional 并在理由里指向本门，保证「模板有、门禁判」
 * 两侧可核；`scripts/template-gate-probe.mts` 的 requirement 分支也显式点名缺节。
 *
 * 判据为什么值得硬拦：实测条款块里「错误路径」出现 100 次、「并发」只有 7 次（12 份需求仅 5 份
 * 提及），而失败/并发路径的缺口要到实施期才暴露——那时改的是代码，不是文档。确实不适用的需求写
 * 「不适用：<理由>」即可：**保留节能被机械判定，删节不能**（这正是要它存在的原因）。
 */
export function docSectionGateFailure(
  category: string | undefined,
  rootText: string,
  createdAt: number | undefined,
): GateFailure | undefined {
  if (!docQualityRulesApply(createdAt)) return undefined
  if (category !== 'feature' && category !== 'refactor') return undefined
  if (hasRootSection(rootText, FAILURE_CONCURRENCY_SECTION)) return undefined
  return {
    code: 'requirement_section_missing',
    kind: 'requirement',
    message: envelope({
      lead: 'reqboard_requirement_submit 未执行：',
      what: 'requirement.md 缺必填节「' + FAILURE_CONCURRENCY_SECTION + '」',
      why: '只在顺利路径上写需求，失败路径 / 并发重复 / 状态机非法迁移的缺口要到实施期才暴露——那时改的是代码不是文档（实测 12 份需求里只有 5 份提过并发）',
      how: '按 templates/brainstorming/' + category + '.md 的同名节补上：失败路径（依赖失败 / 超时 / 数据畸形时看到什么）、并发与重复（幂等键 / 锁 / 状态机拒绝）、状态机非法迁移的响应、写路径半成品谁清理；确实不适用的需求写一句「不适用：<理由>」保留节，不要删节',
    }),
  }
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
  const doc = parseDocument(text)
  // REQ-261005105032-3b02（实施期裁定）：**没有「测试策略（层级…）」表 = 读数未知，不判**——
  // 没有判据对象时给 `false` 会把「本需求还没写测试策略」升级成「E2E 未覆盖」，
  // 进而在实施收尾被时序门判逾期（该门明写 `undefined = 读数未知（不判）`）。
  // 本仓存量需求与现有模板产物**都没有这张表**，故压成布尔会让新门追溯拦住所有老需求——
  // 与「未到期不判」「读数未知不追加」是同一条口径：假红比漏报更难查。
  // 「有表但缺 E2E 行」才是真的没覆盖（仍返回 false，由时序门在实施收尾拦）。
  const hasLevelTable = doc.tables.some(t => t.header.some(h => h.includes('层级')))
  if (!hasLevelTable) return undefined
  return checkE2ECoverage(doc).hasE2E
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

/**
 * 可核验锚点（比计划期的断言词更严）：路径 / 命令 / 数据查询 / 明确的通过计数。
 *
 * **已移到 domain**（`domain/workflow/EvidenceAnchor.ts`）：条款级判据（需求文档每条 FR）与
 * 结单级证据用的是同一份词汇表，两处必须同源；此处再导出，既有 import 路径不变。
 * 注意：re-export **不会**在本模块建立本地绑定，故下面另有一条 import（本模块自身要用它判结单证据）。
 */
export { EVIDENCE_ANCHOR } from '../../domain/workflow/EvidenceAnchor.js'

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
  const designSections = await extractAllDesignSections(docs, designDir)
  
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

// ---------------------------------------------------------------------------
// REQ-261005105032-3b02 §10 #46：本需求**唯一**的 async 内容门入口
// ---------------------------------------------------------------------------

/**
 * `contentGatesForMove` 的可选注入。
 *
 * `sessionProbe` 是**唯一**的外部取数（裁定留痕），且刻意从调用方注入**既有**的 `deps.session`——
 * §10 #20 明令不新增数据源；缺省 = 通道未注入 → 按"未命中留痕"降级（只影响真空态那一步，
 * 不会把别的判定改成放行）。
 */
export interface ContentMoveGateOptions {
  /** 会话探针（`UseCaseDeps.session` / `RouterCtx.deps.sessionProbe` 结构上即满足）。 */
  sessionProbe?: DecisionSessionReader
  /** 留痕扫描深度（透传 `hasDecisionTrace`；缺省 200，§10 #20）。 */
  traceLimit?: number
}

/**
 * 需求转移前的**内容门**（async）——四条转移路径在同步门 `assertArtifactGates` 之后统一调这里。
 *
 * 为什么必须只有这一个入口（§10 #22 / #46）：REQ-292a 的事故正是「某条路径漏了门 = 后门」，
 * 每条路径各写一遍分派必然分叉。故判定本体留在 `prototype-gates.ts` / `decision-gates.ts`
 * / `stage-gate-timeline.ts`（各模块可单测），**分派只此一处**；同步单点 `assertArtifactGates`
 * 保持同步、只做产物存在 / 人工确认，职责与签名都不动。
 *
 * 分派（逐字照 interfaces.md「门禁函数签名与四条转移路径」）：
 *   `brainstorming → design`：存在门 → 版本门 → 锚点门 → 裁定门，**短路返回首个失败**；
 *   `design → decomposing` / `decomposing → implementing` / `implementing → accepting`：
 *     阶段门时序（FR-11 / t13）——该时点必须已转绿的门逐档判一次，逾期即 `stage_gate_overdue`；
 *   其余转移无适用门 → `undefined`（放行）。
 *
 * **两道门的适用面不同（2026-10-05 裁决，依据 FR-8 本身，不是架构文里那句概括）**：
 *   · **三个原型门只对 UI 需求**（feature / refactor 且 `sides` 含 frontend）——纯后端需求不该被
 *     原型门约束（验收标准 1「`sides: [backend]` 标本不受影响」）。判据复用
 *     `requiredStageArtifactKinds`，与三门同吃一份「什么算 UI 需求」（category-doc-sets），
 *     不另立第二份真相。
 *   · **裁定门对所有 feature 需求**——裁定落账（D-x）与界面无关：纯后端 feature 一样会在讨论里
 *     被祈使 / 纠正 / 补充，收窄成"只有 UI 才判"会让 FR-8 对纯后端需求**完全失效**。
 *     非 feature 与存量（`artifacts` 空/undefined）由 `checkDecisionLogGate` 自己早退（D-12 / 不追溯）。
 *     architecture.md 的「只有 UI 需求生效，其余一律放行」是**原型门**那条纪律的概括
 *     （backend.md：「…⇒ **三个原型门**直接返回 undefined」），不适用于裁定门。
 *
 * 裁定门的留痕（`hasDecisionTrace`）由本函数**自取自算**后以 `{ trace }` 传入：门签名只有
 * `(docs, req)`，而留痕读的是会话侧；探针一律来自调用方注入的既有端口（§10 #20：不新增数据源）。
 *
 * @returns `GateFailure` = 拒（含码 / gaps / 可执行 how）；`undefined` = 通过。
 */
export async function contentGatesForMove(
  docs: DocsReader,
  req: RequirementRecord,
  from: RequirementStatus,
  to: RequirementStatus,
  opts: ContentMoveGateOptions = {},
): Promise<GateFailure | undefined> {
  // ① 阶段门时序（FR-11 / t13）：**先于** brainstorming 期那道早退——三档时点都不在
  //    brainstorming，故顺序不影响行为，但它让"逾期"这一档与"原型/裁定"那一档在代码里分开读。
  if (stageGateMomentFor(from, to) !== undefined) {
    const stageGate = await assertStageGateTimelineGate(docs, req, from, to, STAGE_GATE_PROBES)
    if (stageGate !== undefined) return stageGate
    // 三个时点转移上没有别的门（原型 / 裁定门只挂在 brainstorming → design），到此即通过。
    return undefined
  }

  // ② 只有 brainstorming → design 挂了原型 / 裁定门（§2）；其余转移（含回退、canceled）无适用门。
  if (from !== 'brainstorming' || to !== 'design') return undefined

  // ②-a 三个原型门（仅 UI 需求）：短路顺序 = 人该补的东西的先后——先说"没有原型"，再说"哪一版算数"，
  // 再说"原型缺哪块"。每一条都给得出可执行命令，故只报**第一个**。
  if (await isUiRequirement(docs, req)) {
    const presence = await checkPrototypePresenceGate(docs, req)
    if (presence !== undefined) return presence
    const version = await checkPrototypeVersionGate(docs, req)
    if (version !== undefined) return version
    const anchors = await checkPrototypeAnchorsGate(docs, req)
    if (anchors !== undefined) return anchors
  }

  // ②-b 裁定门（所有 feature 需求；与界面无关）：原型齐（或非 UI）之后才轮到它。
  const traceOpts = opts.traceLimit === undefined ? {} : { limit: opts.traceLimit }
  const trace = (await hasDecisionTrace(opts.sessionProbe, req, traceOpts))?.hit === true
  return await checkDecisionLogGate(docs, req, { trace })
}

/**
 * 阶段门时序判据的**取数入口**（t13）：判据本体在 `stage-gate-timeline.ts`（可单测），这里只把本文件
 * 既有的五道门当探针传进去——判定**不复制**（复制即成两份真相）。
 *
 * 为什么注入而不是让判据模块 import 本文件：本文件要调判据模块，反向 import 就是值环
 * （ESM 能跑，但初始化顺序一变就是难查的线上毛病）。
 */
const STAGE_GATE_PROBES: StageGateProbes = {
  requirementDocFormat: (docs, req) => checkRequirementDocFormatGate(docs, req),
  designServes: (docs, req) => checkDesignServesGate(docs, req),
  numberChain: (docs, req) => checkNumberChainGate(docs, req),
  clauseCoverage: (docs, req, rawTasks) => assertClauseCoverageGate(docs, req, rawTasks),
  e2eCoverage: (docs, req) => e2eCoverageOf(docs, req),
}

/**
 * 本需求是不是「UI 需求」（= **三个原型门**是否适用）：feature / refactor 且 `sides` 含 frontend。
 *
 * 路径口径与原型三门**逐字一致**（`docs/requirements/<REQ>/requirement.md`）：本函数是那三门的
 * 前筛，读的若不是同一份 front-matter，就会出现"前筛说适用、门说不适用"（或反之）的分叉——
 * 那正是本需求要消灭的形态。文件不在 / 前端声明读不到 → 按**不适用**处理（判不了就不加仪式，
 * 与 prototype-gates 的 `contextOf`、rtm-health 的 `sidesOf` 同款口径）。
 *
 * 只用于原型门：裁定门的适用面是 `req.category === 'feature'`（在其门内判定），**不要**用本函数
 * 去收窄裁定门——那会让纯后端 feature 需求彻底绕过 D-x 落账（FR-8 失效）。
 */
async function isUiRequirement(docs: DocsReader, req: RequirementRecord): Promise<boolean> {
  const path = 'docs/requirements/' + req.id + '/requirement.md'
  if (!docs.exists(path)) return false
  const sides = designDocPolicyFrom(parseDocument(await docs.read(path)).frontmatter).sides
  return requiredStageArtifactKinds('brainstorming', req.category, sides).includes('prototype')
}
