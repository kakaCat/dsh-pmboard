/**
 * 阶段门时序逾期判据（REQ-261005105032-3b02 FR-11 / t13 · §10 #39）——
 * **「每道门在该到位的时点必须到位」**：不允许「设计都交完了、编号链还悬着一半」这类逾期状态被带进下一阶段。
 *
 * 三档时点（唯一时点表 = `domain/gate/GateCatalog.StageGateTimeline`，与人工闸门表同源）：
 *   · 设计交完（design → decomposing）：必填节 + 格式门 + serves + 无 dangling；
 *   · 拆分落库（decomposing → implementing）：覆盖对照（FR→卡）+ UI 卡原型锚点；
 *   · 实施收尾（implementing → accepting）：E2E 覆盖 + 三级追溯。
 *
 * 三条纪律（都是"防假红 / 防两套真相"的直接后果）：
 *  ① **时点未到不判**：不在上表里的转移（含 brainstorming 期的转移与各回退）一律 `undefined`——
 *     brainstorming 期「编号链全 orphan」「E2E 覆盖 false」是正常过程状态，拿它当逾期就是假红。
 *  ② **阶段产物不在位不判**：设计目录一份都没交 / `decomposition.md` 不存在时，那一档**未到期**
 *     （"设计没交完"是 G2 `design_doc_incomplete` 在同转移上要报的事），本判据不替它报、也不拿
 *     "没到期"当"逾期"——假红比漏报更难查（本仓 e2e「读数未知不追加」同款口径）。
 *  ③ **判定复用既有单点**：格式门 / serves / 无 dangling / 覆盖对照 / UI 卡锚点 / E2E 读数都由
 *     `content-gate-wiring` 的既有门提供（经 `StageGateProbes` **注入**——反向 import 会成值环）；
 *     本模块只做「时点 → 该绿的门」「门红 → 逾期点名」这两件事。
 *
 * 与门本体分模块的理由（§10 #46）：`contentGatesForMove` 是**唯一**分派入口，门本体各自成模块
 * （prototype-gates / decision-gates / 本模块），判定才可单独逆验证；计划文档 → 卡投影那一半是纯函数，
 * 另放 `plan-task-projections.ts`（单文件尺寸门禁 ≤400 行）。
 *
 * @module dsh-pmboard/application/internal/stage-gate-timeline
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import type { GateFailure } from './artifact-gates.js'
import { StageGateTimeline, stageGateMomentFor, type StageGateMoment } from '../../domain/gate/GateCatalog.js'
// 「什么算一个 D-x」的列名只有一处真相（decision-gates 的五列），本模块只借列名取编号，不重写判定。
import { DECISION_COLUMNS } from './decision-gates.js'
import { fmt } from '../../domain/text/fmt.js'
import { envelope } from './gate-feedback.js'
import { checkDesignCoverage, extractAllDesignSections } from './content-trace.js'
import {
  extractClauseDefinitions,
  parseDocument,
  type DocsReader,
  type ParsedDoc,
} from './content-gates.js'
import { planTaskProjections } from './plan-task-projections.js'
import { designDocPolicyFrom, missingCategoryDocs } from './category-doc-sets.js'
import { CoverageChecker } from '../../../vendor/reqboard/src/rtm/coverage-checker.js'
import type { TraceabilityTaskLike } from '../../../vendor/reqboard/src/rtm/coverage-calculator.js'

/**
 * 本模块需要的既有门（**注入而不是 import**）：门本体住在 `content-gate-wiring`，而该文件要调本模块，
 * 反向 import 即成值环；注入还让判据可单测（喂假探针即可逐条断言"哪个门红算逾期"）。
 */
export interface StageGateProbes {
  /** 格式门：需求文档编号规范（`checkRequirementDocFormatGate`）。 */
  requirementDocFormat(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>
  /** serves：设计章节缺 serves 标注（`checkDesignServesGate`）。 */
  designServes(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined>
  /** 无 dangling：编号串联的**悬空**半（`checkNumberChainGate`；orphans 不算逾期，见模块头 ①）。 */
  numberChain(docs: DocsReader, req: RequirementRecord): Promise<{ failure?: GateFailure }>
  /** 覆盖对照（FR→卡）与 UI 卡原型锚点：落库前的覆盖门（`assertClauseCoverageGate`）。 */
  clauseCoverage(docs: DocsReader, req: RequirementRecord, rawTasks: readonly unknown[]): Promise<GateFailure | undefined>
  /** E2E 覆盖读数（`e2eCoverageOf`）；`undefined` = 读数未知（不判）。 */
  e2eCoverage(docs: DocsReader, req: RequirementRecord): Promise<boolean | undefined>
}

/** 一条逾期读数：门名（= `StageGateTimeline` 里的那一项）+ 该门自己报的具体缺口。 */
export interface StageGateOverdueReading {
  gate: string
  gaps: string[]
}

/** 一档时点的读数：逾期的门 + **两维覆盖度点名**（只点名，不作拒绝依据，见 `coverageNaming`）。 */
interface MomentReadings {
  overdue: StageGateOverdueReading[]
  /** 覆盖度点名（t8 两维），只在真有逾期时随拒绝一起露面；空数组 = 无声可报。 */
  coverageNaming: string[]
}

/** 空读数（每次新建：调用方可能就地 push，共用一份可变对象是后患）。 */
const nothing = (): MomentReadings => ({ overdue: [], coverageNaming: [] })

/** 需求目录（工作区相对口径，全仓一致）。 */
const reqDir = (reqId: string): string => 'docs/requirements/' + reqId
const requirementPath = (reqId: string): string => reqDir(reqId) + '/requirement.md'
const decompositionPath = (reqId: string): string => reqDir(reqId) + '/decomposition.md'
const designDir = (reqId: string): string => reqDir(reqId) + '/design'

/** 设计目录里在盘的 .md（与既有各门的枚举口径逐字一致）。 */
function designDocNames(docs: DocsReader, reqId: string): string[] {
  return (docs.list?.(designDir(reqId)) ?? [])
    .filter(e => e.isFile !== false && (e.name ?? '').endsWith('.md'))
    .map(e => e.name ?? '')
    .filter(n => n.length > 0)
}

/**
 * 逾期判据（本模块的唯一入口）：该转移落在某个时点上、且该时点有门未转绿 → `stage_gate_overdue`。
 *
 * 早退（`undefined` = 放行）：
 *  · 转移不在三档时点上（含 brainstorming 期与回退）——时点未到；
 *  · 存量 / 直种需求（`artifacts` 空或 undefined）——与本仓既有各门同口径，**不追溯**；
 *  · 阶段产物不在位（未到期，见模块头 ②）；
 *  · 该时点的门全部已转绿。
 *
 * @returns `GateFailure` = 拒（`code: 'stage_gate_overdue'`，`gaps` 逐条点名逾期的门）；`undefined` = 通过。
 */
export async function assertStageGateTimelineGate(
  docs: DocsReader,
  req: RequirementRecord,
  from: string,
  to: string,
  probes: StageGateProbes,
): Promise<GateFailure | undefined> {
  const moment = stageGateMomentFor(from, to)
  if (moment === undefined) return undefined
  if (req.artifacts === undefined || req.artifacts.length === 0) return undefined

  const readings = moment === '设计交完'
    ? await designDeliveredReadings(docs, req, probes)
    : moment === '拆分落库'
      ? await decompositionLandedReadings(docs, req, probes)
      : await implementationFinishedReadings(docs, req, probes)

  if (readings.overdue.length === 0) return undefined
  return overdueFailure(moment, readings)
}

// ---------------------------------------------------------------------------
// 三档时点各自的读数
// ---------------------------------------------------------------------------

/** 设计交完：设计阶段**确实交了东西**才判（见模块头 ②）。 */
async function designDeliveredReadings(
  docs: DocsReader,
  req: RequirementRecord,
  probes: StageGateProbes,
): Promise<MomentReadings> {
  const names = designDocNames(docs, req.id)
  if (names.length === 0) return nothing()

  const overdue: StageGateOverdueReading[] = []

  // ① 必填节（根文档必填节）。刻意只取「缺必填节」那半：设计文档集是否交齐由 G2
  //    （`design_doc_incomplete`）在**同一转移**上单点报——同一处坏报两遍会让人在两个码之间对齐。
  const reqPath = requirementPath(req.id)
  if (docs.exists(reqPath)) {
    const text = await docs.read(reqPath)
    const policy = designDocPolicyFrom(parseDocument(text).frontmatter)
    const gaps = missingCategoryDocs({
      category: req.category,
      rootExists: true,
      rootText: text,
      designNames: names,
      sides: policy.sides,
      exempt: policy.exempt,
    }).filter(g => g.includes('缺必填节'))
    if (gaps.length > 0) overdue.push({ gate: '必填节', gaps })
  }

  // ② 格式门（需求文档编号规范）与 ③ serves（设计章节缺标注）：都是既有门原样复用。
  pushGateFailure(overdue, '格式门', await probes.requirementDocFormat(docs, req))
  pushGateFailure(overdue, 'serves', await probes.designServes(docs, req))

  // ④ 无 dangling：**只取 failure（悬空）**，orphans 一律不算逾期——根编号暂时没有下游是过程状态
  //    （既有 checkNumberChainGate 的注释同款纪律），把 orphan 算成逾期就是在每个需求中途开假红。
  const chain = await probes.numberChain(docs, req)
  if (chain.failure !== undefined) {
    overdue.push({ gate: '无 dangling', gaps: chain.failure.gaps ?? [chain.failure.message] })
  }
  return { overdue, coverageNaming: [] }
}

/** 拆分落库：`decomposition.md` 在位（拆分确实落库）才判。 */
async function decompositionLandedReadings(
  docs: DocsReader,
  req: RequirementRecord,
  probes: StageGateProbes,
): Promise<MomentReadings> {
  const planPath = decompositionPath(req.id)
  if (!docs.exists(planPath)) return nothing()

  // 任务集在转移门禁的签名里拿不到（`contentGatesForMove(docs, req, from, to)`），而计划文档的任务表
  // 正是这一刻唯一可读的卡投影 ⇒ 由它喂覆盖门与两维读数。判定仍是既有单点，本函数只取数。
  const tasks = planTaskProjections(parseDocument(await docs.read(planPath)))
  const failure = await probes.clauseCoverage(docs, req, tasks)

  const overdue: StageGateOverdueReading[] = []
  // 覆盖门一次只报一件事（先覆盖、后锚点），故这里按它给的码认到对应门名：
  // 两个门名都是 StageGateTimeline.拆分落库 里的那一项，逾期点名的可读性靠它。
  if (failure?.code === 'requirement_uncovered') {
    overdue.push({ gate: '覆盖对照（FR→卡）', gaps: failure.gaps ?? [failure.message] })
  } else if (failure?.code === 'prototype_anchor_missing') {
    overdue.push({ gate: 'UI 卡原型锚点', gaps: failure.gaps ?? [failure.message] })
  }
  return { overdue, coverageNaming: await coverageNaming(docs, req, tasks) }
}

/**
 * 实施收尾（进验收前）：E2E 覆盖 + 三级追溯。
 *
 * 三级追溯**只判从文档读得出来的第一级（需求 ← 设计）**，如实写明另外两级的读数不可得：
 *   · 第二级（设计 ← 任务）要任务集的 `design_serves`，第三级（任务 ← 测试）在 `checkFullTraceability`
 *     里本身就是 TODO；转移门禁的入口不取任务集 ⇒ 硬判会把"我拿不到任务集"变成"你没做"（假红）。
 *   · 设计章节一份都读不到（含 `docs.list` 不可用的夹具工作区）时读数未知 → 不判。
 */
async function implementationFinishedReadings(
  docs: DocsReader,
  req: RequirementRecord,
  probes: StageGateProbes,
): Promise<MomentReadings> {
  const overdue: StageGateOverdueReading[] = []

  const e2e = await probes.e2eCoverage(docs, req)
  if (e2e === false) {
    overdue.push({
      gate: 'E2E 覆盖',
      gaps: [
        requirementPath(req.id) + ' 的测试策略表里没有「层级 = E2E」的行'
        + '（判据与 scripts/req-doc-validate.mts 的第 7 项同源）',
      ],
    })
  }

  const designGaps = await traceabilityDesignGaps(docs, req)
  if (designGaps.length > 0) overdue.push({ gate: '三级追溯', gaps: designGaps })

  return { overdue, coverageNaming: await coverageNaming(docs, req, await planProjections(docs, req)) }
}

/** 计划文档 → 卡投影（计划不在盘上 → 空数组：两维读数按空集计，点不出假名）。 */
async function planProjections(docs: DocsReader, req: RequirementRecord): Promise<readonly TraceabilityTaskLike[]> {
  const planPath = decompositionPath(req.id)
  if (!docs.exists(planPath)) return []
  return planTaskProjections(parseDocument(await docs.read(planPath)))
}

/** 三级追溯的第一级（需求 ← 设计）：空数组 = 这一级齐备**或**读数不可得（两种情况都不算逾期）。 */
async function traceabilityDesignGaps(docs: DocsReader, req: RequirementRecord): Promise<string[]> {
  const reqPath = requirementPath(req.id)
  if (!docs.exists(reqPath)) return []
  const roots = extractClauseDefinitions(parseDocument(await docs.read(reqPath)))
  if (roots.length === 0) return []
  const sections = await extractAllDesignSections(docs, designDir(req.id))
  // 设计章节一份都读不到 = 读数未知（可能是没写、也可能是这个环境读不了目录）⇒ 不判，防假红。
  if (sections.length === 0) return []
  return checkDesignCoverage(roots, sections).map(
    fr => fmt('{fr} 没有任何设计章节服务它（需求 ← 设计 这一级断了）', { fr }),
  )
}

// ---------------------------------------------------------------------------
// 两维覆盖度点名（t8 交付的读数：只降覆盖度与点名，**不作拒绝依据**）
// ---------------------------------------------------------------------------

/**
 * 消费 `CoverageChecker.checkPrototypeTraceability` 的两维读数（`prototype_anchors` / `decision_refs`）。
 *
 * 为什么只并入点名、不参与判定：该函数的契约是 `blocking: false`（data-model §6.4 / 验收标准 13 的
 * 措辞是"覆盖度点名该 D-x"，不是"被拒"）。**拒转移只由"该时点的门未到位"触发**，两维是点名与证据，
 * 故选它自己那句话（含百分比与未覆盖编号）而不是裸编号，读的人一屏就知道要补哪几张卡 / 哪几条 D-x。
 *
 * `input` 的取数口径（转移门禁入口只有 docs + req，见 `planTaskProjections` 的注释）：
 *  · `tasks` = 计划文档任务表的投影（`id` = 计划 key / `side` = 端侧列 / 两维各自申报的引用）；
 *  · `decisions` = 需求文档「讨论与裁定记录（D-x）」表里的编号（列名借 `DECISION_COLUMNS`）；
 *  · `clauseRefs` = 设计章节 `serves`（设计侧对 D-x 的承接就写在那里）。
 */
async function coverageNaming(
  docs: DocsReader,
  req: RequirementRecord,
  tasks: readonly TraceabilityTaskLike[],
): Promise<string[]> {
  const reqPath = requirementPath(req.id)
  const doc = docs.exists(reqPath) ? parseDocument(await docs.read(reqPath)) : undefined
  const clauses = await clauseRefsOf(docs, req)
  const result = CoverageChecker.checkPrototypeTraceability({
    // 分类缺省（存量/直种记录）按空串传：`isPrototypeAnchorTask` 只认 feature/refactor，
    // 空串即"这一维对本次不适用"（空集合按 100% 计），不猜成 feature 去点假名。
    category: req.category ?? '',
    tasks,
    decisions: doc === undefined ? [] : decisionIdsOf(doc),
    clauseRefs: clauses,
  })
  const named: string[] = []
  for (const verdict of [result.prototype_anchors, result.decision_refs]) {
    if (verdict.gaps.length === 0) continue
    named.push(fmt('覆盖度点名（本项不阻断转移）：{message}', {
      message: verdict.message ?? verdict.gaps.join('、'),
    }))
  }
  return named
}

/** 设计章节 `serves` 里的全部编号（D-x 与 FR 都在里面，交给覆盖度自己筛）。 */
async function clauseRefsOf(docs: DocsReader, req: RequirementRecord): Promise<string[]> {
  const sections = await extractAllDesignSections(docs, designDir(req.id))
  return [...new Set(sections.flatMap(s => s.serves))]
}

/** 需求文档「讨论与裁定记录（D-x）」表里的编号（表格身份 = `DECISION_COLUMNS` 的五列，借列名不重写判定）。 */
function decisionIdsOf(doc: ParsedDoc): string[] {
  const [idCol, sourceCol, impactCol] = DECISION_COLUMNS
  const ids: string[] = []
  for (const table of doc.tables) {
    const iId = table.header.findIndex(h => h.replace(/\s+/g, '').includes(idCol))
    const iSource = table.header.findIndex(h => h.includes(sourceCol))
    const iImpact = table.header.findIndex(h => h.includes(impactCol.slice(0, 2)))
    if (iId < 0 || iSource < 0 || iImpact < 0) continue
    for (const row of table.rows) {
      const id = (row[iId] ?? '').trim()
      if (/^D-\d+$/.test(id)) ids.push(id)
    }
  }
  return [...new Set(ids)]
}

// ---------------------------------------------------------------------------
// 组装拒绝信封
// ---------------------------------------------------------------------------

/** 门红 → 一条逾期读数（`failure` 为 undefined 时什么都不加）。 */
function pushGateFailure(
  out: StageGateOverdueReading[],
  gate: string,
  failure: GateFailure | undefined,
): void {
  if (failure === undefined) return
  out.push({ gate, gaps: failure.gaps ?? [failure.message] })
}

/** 逾期时点对应的产物 kind（点名的对象是什么产物）。 */
function kindFor(moment: StageGateMoment): GateFailure['kind'] {
  if (moment === '设计交完') return 'design'
  if (moment === '拆分落库') return 'decomposition'
  return 'verification'
}

/**
 * 逾期信封：`what` 点名时点与逾期的门，`why` 说清"为什么这时刻必须绿"，`how` 给可执行补齐路径
 * （`reqboard_move(...)` 命中 `GATE_HOW_ANCHOR`，并指向本地自检脚本）。
 *
 * `gaps` 两条一类：`<时点>：门「<门名>」未转绿`（**逾期门名**，供 agent 按名定位）+ 该门自己报的
 * 具体缺口；末尾接 t8 两维覆盖度点名（已显式标注"不阻断转移"）。
 */
function overdueFailure(moment: StageGateMoment, readings: MomentReadings): GateFailure {
  const gaps: string[] = []
  for (const item of readings.overdue) {
    gaps.push(fmt('{moment}：门「{gate}」未转绿', { moment, gate: item.gate }))
    for (const gap of item.gaps) gaps.push(fmt('{gate} → {gap}', { gate: item.gate, gap }))
  }
  gaps.push(...readings.coverageNaming)

  const gateNames = readings.overdue.map(i => i.gate).join('、')
  const expected = StageGateTimeline[moment].join(' + ')
  return {
    code: 'stage_gate_overdue',
    kind: kindFor(moment),
    gaps,
    message: envelope({
      what: fmt('{moment} 时点的门 {list} 逾期仍红（该时点必须已转绿：{expected}）', {
        moment, list: gateNames, expected,
      }),
      why: '每道门在该到位的时点必须到位——逾期状态不许被带进下一阶段（REQ-292a 的门禁丢 9 天无人发现，正是"红了也没人看"）',
      // t4（REQ-261007135258-331a FR-5）：指路改成 agent 可执行的统一入口——
      // `reqboard_move` 走的是人工门（humanOnly），agent 调必被 REQBOARD_HUMAN_GATE 拒。
      how: '按上面点名的门逐项补齐（每条的「→」后面就是具体缺口与补法；各门自身的 how 里另有该门的补法），本地自检跑 npx tsx scripts/req-doc-validate.mts（9 项判据逐条给缺口），补完重新调 reqboard_ask_confirm(target=artifact, kind=<该门要求的产物 kind>) —— 产物已落章 ⇒ 走「已确认未推进」分支，闸门全过即自动推进',
    }),
  }
}
