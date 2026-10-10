/**
 * 覆盖度统计（REQ-260926140539-457b FR-5）。
 *
 * 前三层：设计覆盖度 = 有设计章节的 FR / 全部 FR（门禁 100%）；
 * 实施覆盖度 = 有任务实现的设计章节 / 全部设计章节（门禁 100%）；
 * 测试覆盖度 = 有测试用例的任务 / 全部任务（门禁 ≥80%）。
 *
 * REQ-261005105032-3b02 追加**两维**（FR-5 / FR-9，data-model.md §6.4）：
 *   ① UI 卡原型锚点——feature/refactor 且 `side === 'frontend'` 的卡必须有原型锚点；
 *   ② 裁定被引用——每条 `D-x` 必须被 FR 明细/设计章节或任务卡引用字段提到。
 * 两维与前三层同构：只算 Coverage（谁没覆盖 + 百分比），**不判阶段转移**
 * （拒绝权在门禁侧；此处只负责"把没覆盖的点名出来"，口径见 requirement.md 验收标准 13）。
 *
 * **②的「被引用」口径（钉死，勿擅自收窄）**：引用侧 = FR 明细 / 设计章节侧的编号引用
 * （`DecisionReferenceInput.clauseRefs`——设计章节 `serves` 里写的 `D-x` 即此类）
 * **并集** 任务卡的 `requirementRefs` / `decisionRefs`（RTM 口径的别名 `covers_decisions`）。
 * 即 D-x 的定义链 = 定义处（requirement.md 的 D-x 表）→ 引用处（FR 明细 / 设计章节 / 任务卡）；
 * 只卡任务卡一侧会把"设计已承接裁定、卡还没落库"的中间态误判成未引用（data-model §4.6）。
 *
 * 为什么后两维落在本文件而不是 coverage-checker：本文件的既有 calculate* 都是**纯函数**
 * （只吃投影、不碰文件系统），新两维同属"给一组投影算一个 Coverage"；放一处才能让
 * 门禁、会话侧与校验器复用同一份口径，避免各自实现一遍算出两个数。
 *
 * 空集合按"无待覆盖项"计 100%（vacuous truth），uncovered 恒为 []。
 *
 * @module @pi-investment/reqboard/rtm/coverage-calculator
 */
import type {
  Coverage,
  DesignCoverage,
  DesignSection,
  FR,
  ImplementationCoverage,
  RTMTaskLike,
  TestingCoverage,
} from './types.js'

/** 百分比四舍五入；分母为 0 时按 100 计。 */
export function rateOf(covered: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((covered / total) * 100)
}

/** 设计覆盖度（FR 视角）。 */
export function calculateDesignCoverage(
  frs: readonly FR[],
  frToDesign: Record<string, string[]>,
): DesignCoverage {
  const uncovered: string[] = []
  let covered = 0
  for (const fr of frs) {
    const refs = frToDesign[fr.id] ?? []
    if (refs.length > 0) covered += 1
    else uncovered.push(fr.id)
  }
  return {
    total: frs.length,
    covered,
    uncovered,
    rate: rateOf(covered, frs.length),
    total_frs: frs.length,
    covered_frs: covered,
  }
}

/** 实施覆盖度（设计章节视角）。 */
export function calculateImplementationCoverage(
  sections: readonly DesignSection[],
  designToTasks: Record<string, string[]>,
): ImplementationCoverage {
  const uncovered: string[] = []
  let covered = 0
  for (const s of sections) {
    const tasks = designToTasks[s.ref] ?? []
    if (tasks.length > 0) covered += 1
    else uncovered.push(s.ref)
  }
  return {
    total: sections.length,
    covered,
    uncovered,
    rate: rateOf(covered, sections.length),
    total_designs: sections.length,
    covered_designs: covered,
  }
}

/** 测试覆盖度（任务视角）。 */
export function calculateTestingCoverage(
  tasks: readonly RTMTaskLike[],
  taskToTests: Record<string, string[]>,
): TestingCoverage {
  const uncovered: string[] = []
  let covered = 0
  for (const t of tasks) {
    const tests = taskToTests[t.id] ?? []
    if (tests.length > 0) covered += 1
    else uncovered.push(t.id)
  }
  return {
    total: tasks.length,
    covered,
    uncovered,
    rate: rateOf(covered, tasks.length),
    total_tasks: tasks.length,
    tested_tasks: covered,
    untested: [...uncovered],
  }
}

/** 直接从一个 Coverage 生成门禁可读的一句话。 */
export function describeCoverage(label: string, c: Coverage): string {
  return `${label}覆盖度 ${c.rate}%（${c.covered}/${c.total}）`
}

// ─────────────────────────────────────────────────────────────────────────────
// 新两维（REQ-261005105032-3b02 FR-5 / FR-9）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 任务卡投影的**宽容视图**（两条上游形状的唯一归一入口）。
 *
 * 为什么做成"每字段可选"而不是直接吃 `RTMTaskLike`：本维的输入有两个真实来源——
 *  - RTM `rtm-decomposing.yml` 的 `task_coverage[]`（`task_id` / `covers_prototypes` / `covers_decisions`）；
 *  - 台账任务投影 `RTMTaskLike`（`id` / `prototypeRefs` / `decisionRefs`）。
 * 两者字段名不同但语义同源（决议 `#36`）。把它声明成两者的结构交集，调用方**两种都能直接传**，
 * 不必各自写一遍字段映射——映射写两处就是两处会漂移的口径。
 */
export interface TraceabilityTaskLike {
  /** 台账口径的卡 id。 */
  id?: string
  /** RTM `task_coverage[]` 口径的卡 id。 */
  task_id?: string
  /** 卡端侧（`frontend` = UI 卡）。 */
  side?: string
  /** 台账口径的锚点清单（`TaskRecord.prototypeRefs`）。 */
  prototypeRefs?: readonly string[]
  /** RTM 口径的锚点清单（`task_coverage[].covers_prototypes`）。 */
  covers_prototypes?: readonly string[]
  /** 台账口径的需求条款引用（`TaskRecord.requirementRefs`）。 */
  requirementRefs?: readonly string[]
  /** 台账口径的裁定引用（`TaskRecord.decisionRefs`）。 */
  decisionRefs?: readonly string[]
  /** RTM 口径的裁定承接（`task_coverage[].covers_decisions`）。 */
  covers_decisions?: readonly string[]
}

/** 取卡编号：两种上游口径谁有值用谁；都缺 = 空串（不编造编号）。 */
export function taskIdOf(task: TraceabilityTaskLike): string {
  return task.id ?? task.task_id ?? ''
}

/** 原型锚点维的输入：一张卡的最小投影（已归一，不再分上游形状）。 */
export interface PrototypeAnchorTask {
  /** 卡 id（点名用）。 */
  id: string
  /** 卡端侧：`frontend` = UI 卡。 */
  side?: string
  /** 该卡承接的原型锚点；缺省 = 未采集（旧卡缺键就是"未采集"，不补猜测值）。 */
  anchors?: readonly string[]
}

/** 归一：宽容视图 → 锚点维输入。 */
export function toPrototypeAnchorTasks(
  tasks: readonly TraceabilityTaskLike[],
): PrototypeAnchorTask[] {
  return tasks.map(t => ({
    id: taskIdOf(t),
    ...(t.side !== undefined ? { side: t.side } : {}),
    anchors: t.covers_prototypes ?? t.prototypeRefs ?? [],
  }))
}

/**
 * 该卡是否要求原型锚点：**feature/refactor 的 UI 卡**（data-model §6.4 第一行）。
 *
 * 为什么连分类一起判：原型是"UI 需求"的仪式（D-1），bug/doc/chore 无此要求；
 * 不判分类会把非 UI 需求的任务算成"未覆盖"，制造与需求无关的假红。
 */
export function isPrototypeAnchorTask(category: string, side: string | undefined): boolean {
  return (category === 'feature' || category === 'refactor') && side === 'frontend'
}

/**
 * UI 卡原型锚点覆盖度。
 *
 * 口径：**只有** feature/refactor 且 `side === 'frontend'` 的卡进分母（其余卡"无此项"，
 * 不能算未覆盖——空集合按 100% 计，vacuous truth 与前三层一致）。
 */
export function calculatePrototypeAnchorCoverage(
  category: string,
  tasks: readonly PrototypeAnchorTask[],
): Coverage {
  const inScope = tasks.filter(t => isPrototypeAnchorTask(category, t.side))
  const uncovered: string[] = []
  let covered = 0
  for (const t of inScope) {
    if ((t.anchors ?? []).length > 0) covered += 1
    else uncovered.push(t.id)
  }
  return {
    total: inScope.length,
    covered,
    uncovered: uncovered.sort(),
    rate: rateOf(covered, inScope.length),
  }
}

/** 引用侧的一张卡（两个引用字段任一命中即算"引用过该 D-x"）。 */
export interface DecisionReferencingTask {
  /** 卡 id（本维点名的对象是 D-x，这里只留个可追溯的出处）。 */
  id?: string
  /** 台账 `TaskRecord.requirementRefs`。 */
  requirementRefs?: readonly string[]
  /** 台账 `TaskRecord.decisionRefs` / RTM `covers_decisions`。 */
  decisionRefs?: readonly string[]
}

/** 归一：宽容视图 → 裁定引用维输入（两个上游字段合并成一条引用清单）。 */
export function toDecisionReferencingTasks(
  tasks: readonly TraceabilityTaskLike[],
): DecisionReferencingTask[] {
  return tasks.map(t => ({
    ...(taskIdOf(t).length > 0 ? { id: taskIdOf(t) } : {}),
    requirementRefs: t.requirementRefs ?? [],
    decisionRefs: t.decisionRefs ?? t.covers_decisions ?? [],
  }))
}

/** D-x 被引用维的输入。 */
export interface DecisionReferenceInput {
  /** 全部 D-x 编号（`rtm-brainstorming.yml` `outputs.decisions[].id`）。 */
  decisions: readonly string[]
  /** 引用侧①：FR 明细 / 设计章节里的编号引用（设计章节 `serves` 里的 `D-x` 即此类）。 */
  clauseRefs?: readonly string[]
  /** 引用侧②：任务卡（`requirementRefs` / `decisionRefs` 任一命中即算被引用）。 */
  tasks?: readonly DecisionReferencingTask[]
}

/**
 * 收集"引用侧"的全部编号（两侧合并去重）。
 *
 * 为什么 FR 明细/设计章节侧也要算：D-x 的定义链是「定义处（requirement.md D-x 表）→
 * 引用处（FR 明细 / 设计章节 serves / 任务卡）」——只卡任务卡一侧会把"设计已承接裁定、
 * 卡还没落库"的中间态误判成未引用。
 */
export function collectDecisionReferenceIds(input: DecisionReferenceInput): Set<string> {
  const ids = new Set<string>()
  for (const id of input.clauseRefs ?? []) ids.add(id)
  for (const task of input.tasks ?? []) {
    for (const id of task.requirementRefs ?? []) ids.add(id)
    for (const id of task.decisionRefs ?? []) ids.add(id)
  }
  return ids
}

/**
 * D-x 被引用覆盖度（每条 D-x 是否至少被一处引用）。
 *
 * 分母 = D-x 条数（去重；编号唯一是裁定门的职责，本处只做统计不重复点名）。
 */
export function calculateDecisionReferenceCoverage(input: DecisionReferenceInput): Coverage {
  const decisions = [...new Set(input.decisions)]
  const referenced = collectDecisionReferenceIds(input)
  const uncovered: string[] = []
  let covered = 0
  for (const id of decisions) {
    if (referenced.has(id)) covered += 1
    else uncovered.push(id)
  }
  return {
    total: decisions.length,
    covered,
    uncovered: uncovered.sort(),
    rate: rateOf(covered, decisions.length),
  }
}
