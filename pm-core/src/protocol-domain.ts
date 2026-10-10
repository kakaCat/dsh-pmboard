/**
 * Reqboard 共享协议 · **域关联半**（L1，pm-core）。
 *
 * 由 src/shared/protocol.ts 按「是否依赖域规则」拆半而来（REQ-261009174713-7bc8 t-60bd0d）：
 * 引用 RequirementStatus / TaskStatus / ArtifactSpec / SubtaskTemplate / Predicates /
 * Acceptability / Footprint 等域模块的视图与判定，全部落在本文件。
 *
 * 纯帧半在 pm-common/protocol.ts；本文件 `export *` 把它整份再导出，
 * 于是「原来从 shared/protocol.ts 拿得到的一切」从本文件一处仍然拿得到（定义只有一处）。
 *
 * 迁移期说明：本文件里的 `../../../src/domain/...` 是 [2b] 步（domain 搬迁进 pm-core）**之前**的
 * 临时相对路径——此刻 core 包内还没有 domain/，无处可指；[2b] 落地时逐条改写为包内相对路径
 * （`../domain/...`）。除这些说明符外，本文件不引用 core 之外的上层模块。
 *
 * @module pm-core/protocol-domain
 */
export * from 'pm-common/protocol.js'
import type { ActorRef } from 'pm-common/actor.js'
import type { MainStageKey, RequirementStatus, StageKey } from './domain/requirement/RequirementStatus.js'
// REQ-261010200257-7e2d（FR-2/FR-3）：双层目标挂载字段（加性可选、零迁移）
import type { StageGoal, TaskGoal } from 'pm-goal'
import type { TaskStatus } from './domain/task/TaskStatus.js'
import type { RequirementCategory } from 'pm-common/requirement/Requirement.js'
import type { ArtifactKind, ArchiveDoc, ArchiveDocRule } from './domain/artifact/ArtifactSpec.js'
// 依赖传递归约（零 import 纯函数）：计划任务表的 depends_on 同样只保留**直接前置**。
import { transitiveReduce } from 'pm-common/queue/transitiveReduction.js'
// 就绪集合单点（REQ-261005193546-1b1a FR-1/D-8）：shared 允许 import domain（层门禁核对过），
// 本文件的 readyTasks 收敛为它的薄封装——依赖判定的口径只在 domain 一份。
import { liveReadyTasks } from './domain/status/Predicates.js'
// RTM 验收追踪的**唯一声明处**在 vendor（type-only 引用：编译期擦除，不进运行时不增依赖）。
// VerificationSheet.rtmTracking 是 RTM 增强层快照，直接复用该形状，避免在协议层再抄一份造成漂移。
import type { AcceptanceTracking } from 'reqboard-rtm/types/rtm.js'
export type { AcceptanceTracking } from 'reqboard-rtm/types/rtm.js'
import { REQ_TRANSITIONS, HUMAN_ONLY_REQ_TRANSITIONS, SYSTEM_REQ_TRANSITIONS, canReqTransition, assertReqTransition, agentNextActions } from './domain/requirement/RequirementStatus.js'
import { TASK_TRANSITIONS, HUMAN_ONLY_TASK_TRANSITIONS, SYSTEM_TASK_TRANSITIONS, canTaskTransition, assertTaskTransition } from './domain/task/TaskStatus.js'
import { checkAcceptance, checkPlanTaskReferences } from './domain/task/Acceptability.js'
// 计划任务表的需求条款引用（REQ-261002164800-d8f2 FR-2）：判定单点在 domain，协议层只搬运。
import { normalizeRequirementRefs } from 'pm-common/task/RequirementRefs.js'
import { assertFootprintFloor, normalizeFootprint } from './domain/task/Footprint.js'
// 双拼字段取值唯一实现（REQ-261007230908-5ccb FR-4 / G10）：snake/camel 归一只认这一处。
import { dualMapMerged, readDual } from 'pm-common/dual-field.js'
import type { CardFootprint } from './domain/task/Footprint.js'
import type { StageKind } from './domain/task/SubtaskTemplate.js'
import { resolvePlanStages } from './domain/task/SubtaskTemplate.js'
import type { TaskRole } from './domain/task/TaskStatus.js'
import type { VerificationItemSource } from './domain/workflow/AcceptanceSheetSpec.js'
import { ALL_ARTIFACT_KINDS, STAGE_ARTIFACT_REQUIREMENTS, ARTIFACT_CONFIRM_GATES, ARCHIVE_DOC_RULES } from './domain/artifact/ArtifactSpec.js'
import { fmt } from './domain/text/fmt.js'
import { asExecutorHint, normalizeTitle, asTaskPhase, asTaskSide, asDependsOn, REQBOARD_SCHEMA_VERSION, REQUIREMENT_DIR_PATTERN } from 'pm-common/protocol.js'
import { domainError } from 'pm-common/errors.js'
import type { CancelTrailOpts, StatusEvent, TokenBuckets, TaskPhase, TaskSide, ExecutorHint, ExecutionRecord, DesignDocStatus, TraceabilityProjection, DesignCoverageProjection, ImplementationCoverageProjection, TestingCoverageProjection, DraftStageBody, BrainstormStageBody, DoneStageBody, ManualUpdate, ArchiveReconcile, PendingConfirmationOutcome, PromptDifficulty, AdvanceState, RequirementDive, WindowSeat, DocSyncPending, InterruptionRecord, AcceptanceOverride, CommentRecord, TaskScope, CardRevision, TaskRunEvidence, TaskReportSummary, TriageRecord, SubtaskViolation, TokenExecutionRow, SystemPromptCost, InjectionCost, ReportProgress, ReportGap, DocPanelEntry, GateVerdict, DagStep } from 'pm-common/protocol.js'

/**
 * 入参非法（code=invalid_input）——沿用拆半前本模块的私有别名。
 * 构造单点仍是 `pm-common/errors.ts` 的 `domainError`：这里只是薄别名，不是第二份实现
 * （拆半前它是 protocol.ts 的私有函数，纯帧半也要用，故两边都指向同一个构造器）。
 */
function bad(message: string): never {
  throw domainError('invalid_input', message)
}

export type { MainStageKey, RequirementStatus, StageKey }

export type { TaskStatus }

export type { ArtifactKind, ArchiveDoc, ArchiveDocRule }

export type { VerificationItemSource }

export type { StageKind }

export type { TaskRole }

// 规则常量 / 判定函数再导出
export {
  REQ_TRANSITIONS,
  HUMAN_ONLY_REQ_TRANSITIONS,
  SYSTEM_REQ_TRANSITIONS,
  canReqTransition,
  assertReqTransition,
  agentNextActions,
}

export {
  TASK_TRANSITIONS,
  HUMAN_ONLY_TASK_TRANSITIONS,
  SYSTEM_TASK_TRANSITIONS,
  canTaskTransition,
  assertTaskTransition,
}

export { ALL_ARTIFACT_KINDS, STAGE_ARTIFACT_REQUIREMENTS, ARTIFACT_CONFIRM_GATES, ARCHIVE_DOC_RULES }


/**
 * 取消留痕三字段的**唯一写入口**（REQ-261005193546-1b1a FR-3 / design/backend.md §取消留痕写侧）。
 *
 * 写什么（逐字）：
 *  - `task.canceledAt = opts.at`——与那一次 `statusHistory` 的 `→canceled` 事件**同源同刻**
 *    （同一次调用、同一个时钟值），两处留痕可互相校验；
 *  - `task.canceledBy` **仅当 `opts.by.kind === 'human'`** 才写（`kind` 收窄为字面量 `'human'`；
 *    `sessionId` 缺省时**不写该键**、不写空串）；真非人工路径**整字段不写**并 `console.warn`
 *    ——留痕只记人，绝不用 `kind:'system'` 之类替身值冒充"人取消"；
 *  - `task.cancelReason` **仅当 `opts.reason` trim 后非空**才写，且写**原文**（不 trim、不截断、无硬上限）。
 *
 * 语义 = **最近一次取消（覆盖式）**：再次取消覆盖这三个字段；复活（`canceled → todo`）**不清空**
 * （审计事实："曾经取消过、谁、何时、为何"）。每次取消的历史在 `statusHistory` / `revisions` 里
 * ——**首次取消不可追**。缺省 = **未采集**（本需求上线前取消的卡）；不补 `0`、不补 `null`、不补当前时间。
 *
 * 纯就地写：无 IO、不落盘、不返回新对象、不新建数组。必须与 `status = 'canceled'` 在**同一对象、
 * 同一次写事务**内调用（半写态——有 `status` 无留痕——不允许）。
 */
export function markCanceled(task: TaskRecord, opts: CancelTrailOpts): void {
  task.canceledAt = opts.at
  if (opts.by.kind === 'human') {
    task.canceledBy = {
      kind: 'human',
      ...(opts.by.sessionId !== undefined ? { sessionId: opts.by.sessionId } : {}),
    }
  } else {
    console.warn(
      '[reqboard] markCanceled：非人工路径（kind=' + opts.by.kind + '）取消任务 ' + task.id
      + '——不写 canceledBy（取消是人工门动作，留痕只记人）',
    )
  }
  if (opts.reason !== undefined && opts.reason.trim().length > 0) task.cancelReason = opts.reason
}


// ---------------------------------------------------------------------------
// Requirement 状态机（RFC 014 §3）
// ---------------------------------------------------------------------------

// RequirementStatus 类型与状态机迁至 domain/requirement/RequirementStatus.ts（REQ-47939a t2）。

/**
 * 流水线主状态（REQ-9f4a44：**移除 done**）。
 *
 * 验收通过 ⇒ 直接归档，中间不再有"完成"节点——done 只是"验收通过"的落点，语义重复。
 * 注：`done` 仍保留在 RequirementStatus 类型与 ALL_REQ_STATUSES 中（legacy 兼容），
 * 但不在 MAIN 里，因此不参与流程图节点、分类档案与阶段提示词键。
 */
export const MAIN_REQ_STATUSES: readonly MainStageKey[] = [
  'draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived',
]


// LEGACY_REQ_STATUS_ALIASES 已随迁移收口移出运行时契约（REQ-47939a t10）：
// 别名表 + 历史时间线回填 + 旧状态名归一现在都在 src/domain/legacy/LegacyStatus.ts，
// 只由迁移脚本/迁移用例复用；运行时读路径不再做别名兜底（数据已在 v5 迁移时归一）。

/** 全部可读状态（含 legacy `done`）——用于载入校验，保证老台账不被丢弃。 */
export const ALL_REQ_STATUSES: readonly RequirementStatus[] = [...MAIN_REQ_STATUSES, 'done', 'canceled']


// ---------------------------------------------------------------------------
// Task 状态机（RFC 014 §4）
// ---------------------------------------------------------------------------

// TaskStatus 类型与状态机迁至 domain/task/TaskStatus.ts（REQ-47939a t2）。

export const MAIN_TASK_STATUSES: readonly TaskStatus[] = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'done',
]


export const ALL_TASK_STATUSES: readonly TaskStatus[] = [...MAIN_TASK_STATUSES, 'canceled']


// ---------------------------------------------------------------------------
// 流水线节点契约（REQ-31e11f：节点详情/产物闸门/分类流程/提示词键 共用）
// ---------------------------------------------------------------------------

/** 流水线节点键 = 需求主状态（除 canceled）。会话框进度条、节点详情、产物闸门共用。 */
// StageKey/MainStageKey 类型迁至 domain/requirement/RequirementStatus.ts（t2），顶部再导出；
// ALL_STAGE_KEYS 就是 MAIN_REQ_STATUSES（7 个主节点，不含 legacy done/canceled），仍留在本文件
// （消费方为 CATEGORY_FLOW_PROFILES / asStageKey / 客户端节点渲染）。
export const ALL_STAGE_KEYS: readonly MainStageKey[] = MAIN_REQ_STATUSES


export function asStageKey(raw: unknown): StageKey {
  if (typeof raw !== 'string' || !(ALL_STAGE_KEYS as readonly string[]).includes(raw)) {
    bad(`节点键必须是：${ALL_STAGE_KEYS.join(', ')}`)
  }
  return raw as StageKey
}


// ArtifactKind / ALL_ARTIFACT_KINDS 迁至 domain/artifact/ArtifactSpec.ts（t2），顶部再导出。

export function asArtifactKind(raw: unknown): ArtifactKind {
  if (typeof raw !== 'string' || !(ALL_ARTIFACT_KINDS as readonly string[]).includes(raw)) {
    bad(`产物种类必须是：${ALL_ARTIFACT_KINDS.join(', ')}`)
  }
  return raw as ArtifactKind
}


/** 节点产物登记（t4 钩子写入；五道人工确认门的确认状态在此）。 */
export interface StageArtifact {
  stage: StageKey
  kind: ArtifactKind
  /** 产物文档路径（工作区相对路径） */
  path: string
  registeredAt: number
  registeredBy: ActorRef
  /** 五道人工确认门：人确认后写入（看板一键确认，或会话经 ask_user_question 落章） */
  confirmedAt?: number
  confirmedBy?: ActorRef
  /**
   * 确认来源（REQ-ff20ca t2）：board=看板一键确认 / session=会话经 ask_user_question 落章。
   * 缺省视为 board（存量记录向后兼容）。
   */
  confirmedVia?: 'board' | 'session'
  /** 会话确认的审计凭据：用户在 ask_user_question 中的答复原文（仅 via=session 时写入） */
  confirmedEvidence?: string
  /**
   * 自动发现标记（REQ-2e9473 t11/W4）：true = 由 syncReqArtifacts 扫描需求目录补登，
   * 非工具显式登记。看板文档记录区据此显示「自动发现」徽标。
   */
  autoDiscovered?: boolean
  /** 自动发现时的文件 mtime / 大小（审计与新鲜度展示用）。 */
  fileMtime?: number
  fileSize?: number
  /**
   * 原型产物元数据（REQ-261005105032-3b02 FR-2/FR-4，决议 `#41` 是**唯一字段名事实源**）：
   * 登记 `kind=prototype` 产物时抽取的 FR 锚点与 proto-geometry 观测清单——下游读它，
   * 不必再重解析原型 HTML。
   *
   * **可选**：只有原型产物注入；缺省 = 未采集（旧产物记录与所有非原型产物都缺该键），
   * 读侧不判坏。**加性（additive）变更、零迁移**（决议 `#50`）：旧记录缺该键不等于数据坏，
   * **不补齐、不改写、无迁移脚本**，旧读取路径与旧形状一律不变。
   *
   * geometry 元素与设计文档 §3 的 `proto-geometry` 块**同源同形状**（`unit` / `at.state`
   * 为闭值域）；刻意**不含阈值字段**（D-10）——原型只放观测量名与实测值，阈值属设计决策。
   * `source` 缺省 `'prototype'`（agent 量原型自身渲染所得），人给的量化值标 `'human'`（决议 `#8`）。
   */
  prototypeMeta?: {
    /** FR 锚点清单：`fr` = FR 编号，`selector` = 原型页面内该锚点区块的选择器/定位串。 */
    anchors: { fr: string; selector: string }[]
    geometry: {
      name: string
      value: number
      unit: 'px' | 'count' | 'ratio'
      at: { width: number; state: 'inflight' | 'terminal' }
      source?: 'prototype' | 'human'
    }[]
  }
}


// STAGE_ARTIFACT_REQUIREMENTS / ARTIFACT_CONFIRM_GATES 迁至 domain/artifact/ArtifactSpec.ts（t2），
// 顶部再导出（CATEGORY_FLOW_PROFILES / confirmGateKindFor 仍在本文件消费它们）。

/** 分类流程档案：不同立项分类走不同流程形状（跳过阶段不产生物/不设门/不注入提示词）。 */
export interface CategoryFlowProfile {
  /** 启用节点（按流水线序） */
  stages: readonly StageKey[]
  /** 生效的人工确认门（'from>to'，ARTIFACT_CONFIRM_GATES 子集） */
  confirmGates: readonly string[]
  note: string
}


export const CATEGORY_FLOW_PROFILES: Readonly<Record<RequirementCategory, CategoryFlowProfile>> = {
  feature: { stages: ALL_STAGE_KEYS, confirmGates: Object.keys(ARTIFACT_CONFIRM_GATES), note: '全流水线，五门全开' },
  bug: {
    stages: ['draft', 'design', 'decomposing', 'implementing', 'accepting', 'archived'],
    confirmGates: ['design>decomposing', 'decomposing>implementing', 'accepting>archived'],
    note: '免需求分析门：业务文档+复现定位即上下文，并入修复方案产物',
  },
  refactor: {
    stages: ['draft', 'design', 'decomposing', 'implementing', 'accepting', 'archived'],
    confirmGates: ['design>decomposing', 'decomposing>implementing', 'accepting>archived'],
    note: '免需求分析：现状+目标态并入设计',
  },
  spike: {
    stages: ['draft', 'implementing', 'accepting', 'archived'],
    confirmGates: ['accepting>archived'],
    note: '研究即实施，产物=研究报告',
  },
  doc: {
    stages: ['draft', 'implementing', 'accepting', 'archived'],
    confirmGates: ['accepting>archived'],
    note: '写作即实施',
  },
  chore: {
    stages: ['draft', 'implementing', 'accepting', 'archived'],
    confirmGates: ['accepting>archived'],
    note: '最简流程',
  },
}


export function flowProfileFor(category: RequirementCategory | undefined): CategoryFlowProfile {
  if (category === undefined) return CATEGORY_FLOW_PROFILES['feature']
  return CATEGORY_FLOW_PROFILES[category] ?? CATEGORY_FLOW_PROFILES['feature']
}


export function stageEnabledFor(category: RequirementCategory | undefined, stage: StageKey): boolean {
  return flowProfileFor(category).stages.includes(stage)
}


/** 该分类下此转移的人工确认门要求（无门 → undefined）。 */
export function confirmGateKindFor(
  category: RequirementCategory | undefined,
  from: RequirementStatus,
  to: RequirementStatus,
): ArtifactKind | undefined {
  const key = `${from}>${to}`
  if (!flowProfileFor(category).confirmGates.includes(key)) return undefined
  return ARTIFACT_CONFIRM_GATES[key]
}


// ---------------------------------------------------------------------------
// 节点详情契约（模板模式：骨架固定，body 可变；host 装配器与 client 渲染器共用）
// ---------------------------------------------------------------------------

/** 节点详情公共骨架。 */
export interface StageDetailBase {
  stage: StageKey
  /** false=本分类跳过该节点（UI 标灰"本分类跳过"，不算缺失） */
  enabled: boolean
  /** 该节点已登记的产物 */
  artifacts: StageArtifact[]
  /** 该节点有产物待人工确认（五门对准且未 confirmed） */
  pendingConfirmation: boolean
  /** 该阶段状态事件切片（谁/何时/为什么） */
  timeline: StatusEvent[]
  /**
   * 该节点已结算的 token 消耗（REQ-a33899）；**undefined = 无快照**（不是 0）。
   * 会话顶部进度条与会话内节点面板据此显示每节点消耗。
   */
  tokens?: TokenBuckets
}


/** 任务引用（拆分/实施节点共用；handoff 自足任务卡）。 */
export interface StageTaskRef {
  id: string
  title: string
  status: TaskStatus
  phase: TaskPhase
  side: TaskSide
  dependsOn: string[]
  /** 上游产出摘要（下游窗口不读上游会话） */
  dependsSummary?: string
  acceptance: string
  /** 自足任务卡文档（decompose 生成骨架，task_report 追加汇报） */
  cardDoc?: string
  executorHint?: ExecutorHint
  // ── REQ-4842fe：子卡层（全部可缺省——存量卡读出即旧行为） ──
  /** 有值 = 子卡，指向父卡 id（父卡不存子卡列表，由 parentId 反查，单一事实源） */
  parentId?: string
  /** 子卡阶段（受控 StageKind 枚举）；父卡不得有 */
  stageKind?: StageKind
  /** 失败重跑次数（默认 0；失败回退时 +1） */
  attempt?: number
  /**
   * 该卡显式声明的子卡段（卡片层契约 2026-09-28）：
   * `[]` = **本卡不落链（solo）**；缺省 = 未指定走映射（chain 默认）。
   * 视图靠它区分「不需子卡」与「需要但未生成」——没有它就只剩"有没有子卡"这一结果判据。
   */
  stages?: StageKind[]
  /**
   * 本卡请求预算覆盖值（REQ-261007100513-6749 t1 / FR-6）：与 `TaskRecord.budgetRequests` 同名字段。
   * **可选**：缺省 = 不写该键 = 该卡未覆盖（读端按 `LIMITS.subtaskRequestBudget` 起算），
   * 与「覆盖成 0」区分（后者非法，读侧按缺省处理并留诊断）。看板只读展示，不参与任何判据。
   */
  budgetRequests?: number
}


export interface StageTaskExecution extends StageTaskRef {
  claimedBy?: string
  executions: ExecutionRecord[]
}


export interface DesignStageBody {
  plan?: PlanRecord
  category?: RequirementCategory
  designDocs?: DesignDocStatus[]
  traceability?: TraceabilityProjection
  coverage?: DesignCoverageProjection
}

export interface DecomposeStageBody {
  decompositionDoc?: string
  tasks: StageTaskRef[]
  planTasks: PlanTask[]
  traceability?: TraceabilityProjection
  coverage?: ImplementationCoverageProjection
}

export interface ImplementStageBody {
  tasks: StageTaskExecution[]
  /** 窗口码 → 任务 id 列表（上下文分担可见化） */
  byWindow: Record<string, string[]>
  traceability?: TraceabilityProjection
  coverage?: ImplementationCoverageProjection
}

export interface AcceptStageBody {
  verification?: VerificationRecord
  traceability?: TraceabilityProjection
  coverage?: TestingCoverageProjection
}

export interface ArchiveStageBody { archive?: ArchiveRecord }


export type StageDetail =
  | (StageDetailBase & { stage: 'draft'; body: DraftStageBody })
  | (StageDetailBase & { stage: 'brainstorming'; body: BrainstormStageBody })
  | (StageDetailBase & { stage: 'design'; body: DesignStageBody })
  | (StageDetailBase & { stage: 'decomposing'; body: DecomposeStageBody })
  | (StageDetailBase & { stage: 'implementing'; body: ImplementStageBody })
  | (StageDetailBase & { stage: 'accepting'; body: AcceptStageBody })
  | (StageDetailBase & { stage: 'done'; body: DoneStageBody })
  | (StageDetailBase & { stage: 'archived'; body: ArchiveStageBody })


/**
 * 全流程一览（REQ-31e11f 节点详情重设计：监控视角，一眼看全）。
 * 一次返回全部节点详情 + 当前节点，client 渲染竖向时间线（每节点一行摘要 + 就地展开）。
 */
export interface StageOverview {
  requirementId: string
  category?: RequirementCategory
  /** 需求当前状态（= 当前节点；canceled 时各节点按既有完成度推导状态） */
  currentStage: RequirementStatus
  /** 全部节点（含 enabled=false 的跳过节点），按 ALL_STAGE_KEYS 顺序 */
  stages: StageDetail[]
}


// ---------------------------------------------------------------------------
// 拆分计划（plan mode —— 拆分前必须先有计划，计划由人批准）
// ---------------------------------------------------------------------------

/**
 * 计划中的一个任务条目：**拆分前就定死的粒度**。
 *
 * 为什么计划里就带任务表（而不是只写一段散文）：拆分的粒度、依赖、验收标准如果等到
 * 落库时才由 agent 临时决定，人就失去了唯一的把关点——他能看到的只有「已拆分」这个
 * 状态。把任务表写进计划，人批准计划 = 批准拆分方案本身；之后的 decompose 只是把批准
 * 过的东西**落库**，不再二次创作。
 */
export interface PlanTask {
  key: string
  title: string
  description?: string
  phase?: TaskPhase
  side?: TaskSide
  /** 依赖（同计划内的 key） */
  dependsOn?: string[]
  /** 验收标准：怎么算做完（可验证，不允许"功能正常"这类空话） */
  acceptance?: string
  /**
   * 实施方案（REQ-2e9473 W5）：拆分卡 ≠ 实施卡——本字段回答"怎么做"：
   * 改哪些文件、步骤、验证方式。REQ-6f39b5 事故 F 的教训：薄卡（只有 title+acceptance）
   * 让 agent 凭印象自由发挥，8 处偏离设计。批准计划 = 同时批准做什么与怎么做。
   */
  implementation?: string
  /** 执行方式提示：该任务该换上下文执行（fresh-window/subagent/current） */
  executorHint?: ExecutorHint
  /**
   * 显式子卡 stages（REQ-4842fe FR-1b 逃生舱口）：覆盖映射表，受控枚举、非空、去重。
   * 用于映射表盖不住的新流程；不填 = 按卡 phase / 需求分类走默认模板。
   *
   * 2026-09-28（REQ-260928185112-e20d）：本字段此前**只到协议层为止**——normalizePlanTasks 收它、
   * 但 Decompose/plan-landing 的 draft 映射没往下传，于是拆分节点写了也到不了子卡展开。
   */
  stages?: StageKind[]
  /**
   * 本卡无接口可联调 → 不落联调子卡（REQ-260928185112-e20d）：与 TaskRecord.skipIntegration 同语义。
   * 此前只有 HTTP 建卡路由能设（routers/tasks.ts），**拆分节点表达不出来**——计划表里没有这个入口。
   */
  skipIntegration?: boolean
  /**
   * 为什么本卡没有接口面（随 `skipIntegration: true` 必填，缺则整份计划被拒）。
   *
   * 为什么把「理由」做成硬门：`skipIntegration` 是**减法**——砍掉的是联调段（真实成本，实测
   * 6 张联调卡 19.2 min 零产出 ≈ 该需求有效执行时间的 34%）。此前它是个无理由的布尔开关，
   * 批准人看到「这张卡不联调」却看不到**凭什么判断**，于是只能盲批；而判断依据
   * （这卡没有调用方 / 没有 HTTP 边界 / 纯文档）恰恰是能复核的那部分。要求写一句
   * 「靠什么判断」把盲批变成可复核的判定。
   */
  skipIntegrationReason?: string
  /**
   * 零交集依赖边的**语义理由**：`{ 上游计划 key: 一句话 }`，如
   * `{ t2: 't2 重建队列文件，t4 读它——虽无同名文件但有时序约束' }`。
   *
   * 为什么需要它：`declaredFiles`（conflict-check）能从 implementation 抽出两端声明的文件路径，
   * 但**抽不出时序语义**——「t4 依赖 t2」而两端零文件交集时，可能是伪依赖（本可并行的卡被串成链），
   * 也可能是真的时序约束（上游建文件、下游读它，路径写法不同）。判定单点（`plan-deps-check`）
   * 对零交集边**点名但不拒**，本字段就是那张免点名的凭据：写了一句语义理由 = 作者已复核过这条边。
   *
   * 主拼 snake（`dep_reasons`），兼容 camel（`depReasons`）——与 requirement_refs / skip_integration
   * 同口径（两种写法本仓都认，避免写法差异造成静默漏判）；两个拼法同时给时**取并集**。
   *
   * 入参形态（归一后本字段恒为 map，归一在 `depReasonsOf`）：工具 schema 只表达得了**字符串数组**
   * （`["t2=一句话"]`，本仓的 schema DSL 不接受未声明值的 map，写 map 会让工具定义整个抛
   * JsonSchemaError），另兼容对象数组 `[{key,reason}]` 与纯 map（HTTP / 台账直写）。
   */
  dep_reasons?: Record<string, string>
  /**
   * 引用的子卡链模板键（REQ-261003203909-55f2 FR-4）：如 `change-only` / `acceptance` / `ops`。
   * 与 stages 二选一（同给 = REQBOARD_TEMPLATE_CONFLICT）；normalizePlanTasks 解析时
   * 已把模板链写进 stages（批准所见 = 落库所得），本字段冗余记录引用键供统计/审计。
   */
  template?: string
  /**
   * 本卡承接的需求条款（REQ-261002164800-d8f2 FR-2）：如 `["FR-1","FR-2"]`。
   *
   * 此前该字段**只到工具返回体 schema 为止**——工具入参 schema 是 additionalProperties:false
   * 且没收这个键、本接口也没有它、normalizePlanTasks 按白名单搬运直接丢，于是"计划携带任务表"
   * 这条通道的引用**恒为空**，落库后卡上的 requirementRefs 全空、RTM serves 全空。
   * 缺省 = 无显式引用（由计划文档的覆盖对照表兜底），不写空数组。
   */
  requirement_refs?: string[]
  /**
   * 本卡承接的**原型锚点**（REQ-261005105032-3b02 FR-5 / t12）：如 `["prototypes/detail.html#FR-4"]`。
   *
   * 为什么必须在计划层就有这个键：UI 卡的「设计落点」是门禁的判据来源
   * （`assertClauseCoverageGate` 的锚点维），而它此前**全仓没有写侧**——本接口没有该键、
   * 工具 schema 未声明、`normalizePlanTasks` 按白名单搬运直接丢，于是门禁没有数据可查、
   * 落库后 `TaskRecord.prototypeRefs` 恒空、子卡提示词永远取不到原型路径。
   * 缺省 = 未申报（非 UI 卡合法），不写空数组；加性变更、零迁移（决议 `#50`）。
   */
  prototypeRefs?: string[]
  /**
   * 本卡承接的 **D-x 裁定**编号（REQ-261005105032-3b02 FR-9 / t12）：如 `["D-1","D-3"]`。
   *
   * 与 `TaskRecord.decisionRefs` 同名同义（落库后逐字搬运）：供 RTM `covers_decisions`
   * 与「每条 D-x 必须被引用」的覆盖度点名——没有写侧时那条覆盖度恒空。
   * 缺省 = 未申报，不写空数组；加性变更、零迁移（决议 `#50`，同上）。
   */
  decisionRefs?: string[]
  /**
   * 卡片体量声明（REQ-261002175818-80a8 t2 / FR-1、FR-7）：`{ files, anchors, chars }`。
   *
   * 缺省 = **未声明**（存量计划与旧台账都是这个形状）：不判定、不报错、**不冒充 0**。
   * 声明口径落在 domain（`domain/task/Footprint.ts`）：形状校验与「不得小于 implementation
   * 点到的路径数」都在那里单点实现，本层只负责**搬运**——不搬就是静默丢弃，
   * 本仓已在 `stages` 与 `requirement_refs` 上各栽过一次。
   */
  footprint?: CardFootprint
  /**
   * 粒度豁免理由（REQ-261007125552-32cb FR-4）：一卡声明多个接口确属合理
   * （契约卡 / 聚合组装卡）时必填的理由——非空才生效，空串 / 未填 = 未豁免。
   *
   * 为什么必填理由（与 `skipIntegrationReason` 同一模式）：豁免是**减法**——砍掉的是
   * 「一接口一卡」的粒度约束，批准人要能复核「凭什么这张卡可以粗」。豁免不静默：
   * 生效时理由进提交/落库返回体的 `granularity_warnings`。
   *
   * 主拼 snake（`granularity_exempt`），兼容 camel（`granularityExempt`）——同仓双拼法惯例。
   * 只在提交/落库判定那一刻生效，**不落库**（豁免是提交时的声明，不是卡的长期属性）。
   */
  granularity_exempt?: string
}


/**
 * 需求上的拆分计划（plan mode 的载体）。生命周期：
 *   agent 提交（submittedAt）→ 人批准（approvedAt）或退回（rejectedAt + reason）
 * 未批准的计划不构成拆分的许可——分解工具会代码级拒绝（HARD GATE）。
 */
export interface PlanRecord {
  /** 计划文档路径（工作区相对路径，如 docs/requirements/REQ-xxxxxx/plan.md） */
  path: string
  /** 计划摘要（目标 + 做法，人读这一段就懂） */
  summary: string
  /** 计划里的任务表（拆分即落库这批） */
  tasks: PlanTask[]
  submittedAt: number
  submittedBy: ActorRef
  approvedAt?: number
  approvedBy?: ActorRef
  /** 批准来源（REQ-ff20ca t2）：board=看板 / session=会话经 ask_user_question；缺省视为 board */
  approvedVia?: 'board' | 'session'
  /** 会话批准的审计凭据：用户答复原文（仅 via=session 时写入） */
  approvedEvidence?: string
  rejectedAt?: number
  rejectedReason?: string
}


/**
 * 验收材料（agent 提交）+ 人工审核结论。
 *
 * 用户要求「验收 有人工审核」：agent 把"做完的证据"交上来（怎么验的、看到什么结果，
 * 全是可复核的命令/输出/路径，不接受"功能正常"），人**看着证据**决定过还是退回返工。
 * 代码级：验收通过（accepting>done）是人工闸门；提交验收必须有材料。
 */
/**
 * 验收单单项（REQ-2e9473 t13/W6）：一个可独立裁决的验收点。
 * 来源 = 任务验收标准（source=taskId）或需求级标准（source='requirement'）。
 */
export interface VerificationItem {
  /** 稳定 id（v1-1, v1-2…；跨版本复用时保留） */
  id: string
  /**
   * 来源（v5 判别联合，migration.md C7）：任务项带 taskId，需求级项 kind='requirement'。
   * 旧账本的字符串 source（任务 id / 'requirement'）不落在 ledger——实测含 sheet 的需求为 0，
   * 故本类型不做字符串兼容读。
   */
  source: VerificationItemSource
  /** 验收标准原文（怎么算过） */
  criterion: string
  /** 该项对应的证据（产物路径/命令输出摘要/截图） */
  evidence: string[]
  /**
   * 裁决状态（挂起/续验持久化核心）：pending=待验 / passed=通过 / failed=不通过 /
   * not_verifiable=不可验收（无法按要求验，必填原因）——REQ-308b9a FR-9。
   */
  status: 'pending' | 'passed' | 'failed' | 'not_verifiable' | 'unverified'
  /** 用户裁决意见（不通过时必填；REQ-260930094139-2d65 FR-1 起通过同样必填——实际结果） */
  opinion?: string
  decidedAt?: number
  decidedBy?: ActorRef
  /**
   * 系统生成的缺口类验收项标记（REQ-260930094139-2d65 FR-3）：
   * e2e=覆盖缺口 / orphan=孤儿用例 / consistency=三方一致性 / traceability=FR 追溯断链。
   * 旧账本缺省 undefined = 普通任务/需求级项，读侧零迁移。
   */
  gapKind?: 'e2e' | 'orphan' | 'consistency' | 'traceability'

  /**
   * REQ-261001184609-cecb FR-1/FR-3：**实际结果与谁来填**。
   * agent 提交验收材料时逐项落 result（来源记为 agent）；弹框对有结果的项只问裁决，
   * 人不必重抄命令输出。needsHuman/humanReason 用于无法自动验证的项（界面视觉、线下流程）。
   */
  result?: string
  resultSource?: 'agent' | 'human'
  needsHuman?: boolean
  humanReason?: string
  /**
   * 「怎么验」操作细节（可选）：与 criterion（怎么算过）分开存。
   * 旧账本/存量记录缺省 undefined = 无该字段，读侧回落 criterion——纯声明，读侧零迁移。
   */
  howToVerify?: string
  /**
   * REQ-261006201920-2adc FR-3 / D-3：人**覆盖** agent 实测结果时的留档。
   *
   * `resultSuperseded` = 被取代的 agent 原文（重复覆盖时保留**最初那次**）；
   * `resultChangeReason` = 人给出的变更理由。两者与 `result`/`resultSource='human'` 构成
   * **原子四元组**：要么一起写、要么一个都不写——半截写入会让「谁填的」与「改之前是什么」同时不可考。
   * 加性可选、零迁移：旧账本缺省 undefined = 从未发生过覆盖。
   */
  resultSuperseded?: string
  resultChangeReason?: string
  /**
   * REQ-261007160829-1991 FR-2：`unverified` 的**降级原因**（为什么点了通过却没算通过）。
   *
   * 为什么另立字段而不写进 `opinion`：`opinion` 是**人的话**（也是覆盖留档的比对基准），
   * 拿它承载系统判定会污染看板展示与 `isResultOverride` 比对两处语义。
   *
   * 「与 status 同生共死」的三条写读纪律：
   *   · **只在降级时写**——`status` 落成 `unverified` 的那一次赋值里写；
   *   · `status` 变 `passed` / `failed` 时**清空**（不存在「passed 却残留 anchor_missing」）；
   *   · **老数据缺席**（`undefined`）= 不是降级产物（含全部存量数据），读侧按
   *     「未复核、无原因」呈现，不做 `!value` 判定（前向兼容：将来加第三类原因不必改读侧）。
   *
   * 域层镜像见 `domain/workflow/AcceptanceSheetSpec.ts` 的 `SheetItemLike`（协议层禁止被 domain import，
   * 故按既有镜像口径成对声明——字段名与取值域逐字一致）。
   */
  unverifiedReason?: 'blank_pass' | 'anchor_missing'
}


/**
 * 验收单（版本化，REQ-2e9473 t13/W6）：逐项打勾的载体，可挂起/续验。
 * v2+ 只含上一版未过项（已过项保留结论，不重验）。
 */
export interface VerificationSheet {
  version: number
  items: VerificationItem[]
  generatedAt: number
  generatedBy: ActorRef
  /** 本轮是否只含上一版未过项（返工续验标记） */
  reworkOnly?: boolean
  /**
   * 上一版 RTM 验收追踪快照（**可选**，RTM 增强层数据）。
   * 缺省 undefined = 无该字段（存量记录零迁移）；`SubmitVerification` 读它做返工续验的
   * 「只生成上版 failed 项」输入。此处只声明形状（与 vendor 的 AcceptanceTracking 同源），不接线。
   */
  rtmTracking?: AcceptanceTracking[]
}


export interface VerificationRecord {
  /** 一句话结论：这次交付了什么、验了什么 */
  summary: string
  /** 证据清单（命令 + 输出摘要 / 测试报告路径 / 截图路径） */
  evidence: string[]
  submittedAt: number
  submittedBy: ActorRef
  /** 当前验收单（逐项裁决；REQ-2e9473 t13） */
  sheet?: VerificationSheet
  /** 历史验收单（v1/v2…；版本化留痕，供复盘与归档） */
  sheetHistory?: VerificationSheet[]
  reviewedAt?: number
  reviewedBy?: ActorRef
  /** pass=验收通过；rework=退回返工（附意见） */
  decision?: 'pass' | 'rework'
  reviewNote?: string
}


/**
 * 归档清单**补录留痕**（REQ-261004183621-de3f t1 / FR-4）。
 *
 * 语义是**只追加**：清单是历史记录，补录不改写既有条目（与 `AmendTaskRefs` 的全量替换刻意不同）。
 */
export interface ArchiveAmendment {
  /** 本次追加的清单条目。 */
  docs: ArchiveDoc[]
  reason: string
  at: number
  by: ActorRef
}


export interface ArchiveRecord {
  /** 需求目录（工作区相对路径，如 docs/requirements/REQ-xxxxxx） */
  dir: string
  /** 目录内保留的文档清单 */
  docs: ArchiveDoc[]
  /** 合并进的项目文档路径（架构/指南/ADR/研究/已知问题） */
  mergedInto: string[]
  /** 索引条目：一句话结论（进归档索引，供检索） */
  indexEntry: string
  /** 对项目说明书（金字塔 L1/L2）的更新点；无项目级认知变化时留空并写 manualNote */
  manualUpdates?: ManualUpdate[]
  /** 无手册更新时的理由（如"纯维护，不改变项目认知"） */
  manualNote?: string
  /** 归档清单对账结果（REQ-261004183621-de3f）；缺省 = 本功能上线前归档的存量记录。 */
  reconcile?: ArchiveReconcile
  /** 清单补录留痕（只追加；缺省 = 从未补录）。 */
  amendments?: ArchiveAmendment[]
  submittedAt: number
  submittedBy: ActorRef
  // REQ-261006123819-3af3 FR-3（D-2）：原「归档时间 / 归档人」两个字段**从来没有写入者**
  // （64 条归档记录命中 0），读取分支却让「已归档」永远不可达。已删除；归档时刻改由
  // `domain/status/ArchivedMoment.archivedMomentOf(req)` 从 statusHistory 取（唯一判定点）。
}


/** 计划是否已被批准（拆分的代码级前置条件）。 */
export function planApproved(req: { plan?: PlanRecord }): boolean {
  return req.plan !== undefined && req.plan.approvedAt !== undefined
}


// VACUOUS_ACCEPTANCE / VERIFIABLE_ANCHOR 与可证伪判定迁至
// domain/task/Acceptability.ts（REQ-47939a t2）：checkAcceptance(key, acceptance)。

/**
 * 字符串数组字段的**只搬运**规整（REQ-261005105032-3b02 t12）。
 *
 * 为什么不做形态校验：`prototypeRefs` 的形态判据属门禁职责（形态不合法要**逐卡点名**，
 * 而不是让整份计划提交时炸在格式错上）；这里只保证"是字符串数组、去掉空白项、去重"，
 * 非数组（写成字符串等手滑）按未申报处理——与 `asDependsOn` 一类搬运字段同口径。
 */
function stringListOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t.length > 0 && !out.includes(t)) out.push(t)
  }
  return out
}


/**
 * 零交集依赖边的语义理由表（归一成 `{ 上游 key: 一句话 }`）搬运。
 *
 * 为什么入参要认**三种写法**（不是过度设计，每一种都有真实来源）：
 *  · 字符串数组 `["t2=一句话", "t4：一句话"]` —— 工具 schema 的形态（`dep_reasons` / `depReasons`）。
 *    dsh-tools 的参数 schema DSL **不接受未显式声明值的 map**（`additionalProperties must be
 *    explicitly true or false`），写成 map 会让 `defineSubmitTool` 整个抛 JsonSchemaError
 *    （2026-10-06 实测）；故入参只能是数组，语义理由的"键→值"在归一里还原。
 *  · 对象数组 `[{ key, reason }]` —— 结构化写法（agent 更愿意写两栏时），键名容 `key/dep/up`。
 *  · 纯对象 map —— 兼容非工具入口（HTTP / 台账直写 / 历史数据）与 PlanTask 自身的存储形态。
 *
 * 形状不合法（既不是数组也不是对象）按**未申报**处理，不炸整份计划——与 `stringListOf` 同口径：
 * 这里的键是"凭据"，凭据格式手滑不该让人丢掉整张任务表；真正的硬判据只有一条
 * （skipIntegration 的理由必填），其余都是"有没有写"的软判定。
 */
function depReasonsOf(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined
  const out: Record<string, string> = {}
  const put = (rawKey: unknown, rawVal: unknown): void => {
    const key = typeof rawKey === 'string' ? rawKey.trim().slice(0, 40) : ''
    const text = typeof rawVal === 'string' ? rawVal.trim().slice(0, 300) : ''
    if (key.length === 0 || text.length === 0) return
    out[key] = text
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        // `"t2=一句话"` / `"t2：一句话"`：按**第一个**分隔符切分（理由正文里还可以出现等号 / 冒号）
        const m = /^([^=：:]{1,40})[=：:]\s*(.+)$/.exec(item.trim())
        if (m !== null) put(m[1], m[2])
        continue
      }
      if (typeof item === 'object' && item !== null) {
        const o = item as Record<string, unknown>
        put(o.key ?? o.dep ?? o.up, o.reason ?? o.why)
      }
    }
  } else if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) put(k, v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}


/** 计划任务表校验规整（key 唯一；phase/side 合法；标题非空；依赖只能指向**前面已定义**的计划内 key——落库按数组顺序解析，前向引用会在 decompose 时炸（REQ-2e9473 事故 G）；acceptance 可证伪；implementation 必填）。 */
export function normalizePlanTasks(raw: unknown): PlanTask[] {
  if (!Array.isArray(raw) || raw.length === 0) bad('计划必须包含至少 1 个任务（tasks 非空数组）')
  if (raw.length > 50) bad('计划任务过多（≤50）')
  // 两遍校验：第一遍结构（key 唯一/标题/字段规整），第二遍依赖与内容——
  // 保持"key 重复/依赖悬空"优先于"验收标准/实施方案缺失"的报错顺序（向后兼容）。
  const keys = new Set<string>()
  const out: PlanTask[] = []
  raw.forEach((item, i) => {
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    const key = (typeof o.key === 'string' && o.key.trim().length > 0 ? o.key.trim() : 'k' + (i + 1)).slice(0, 40)
    if (keys.has(key)) bad('计划任务 key 重复：' + key)
    keys.add(key)
    const description = o.description === undefined || o.description === null ? '' : String(o.description).trim().slice(0, 4000)
    const acceptance = o.acceptance === undefined || o.acceptance === null ? '' : String(o.acceptance).trim().slice(0, 2000)
    const implementation = o.implementation === undefined || o.implementation === null ? '' : String(o.implementation).trim().slice(0, 4000)
    const executorHint = asExecutorHint(o.executorHint ?? o.executor_hint)
    // 子卡段两种声明（REQ-261003203909-55f2 FR-4）：stages（显式枚举）或 template（引用模板键），
    // 二选一——优先级与校验单点在 domain 的 resolvePlanStages。template 在**计划解析时**就解析成
    // 具体链写进 stages（批准所见 = 落库所得），引用键冗余存 PlanTask.template 供统计。
    const planStages = resolvePlanStages({
      stages: o.stages as readonly unknown[] | undefined,
      template: o.template as string | undefined,
    })
    if (!planStages.ok) {
      if (planStages.code !== undefined) {
        throw Object.assign(new Error('计划任务 ' + key + '：' + planStages.error + '（' + planStages.code + '）'), { code: planStages.code })
      }
      bad(planStages.error)
    }
    const stages = planStages.value
    const template = typeof o.template === 'string' && o.template.trim().length > 0
      ? o.template.trim().toLowerCase()
      : undefined
    // 无接口可联调（REQ-260928185112-e20d）：计划表可显式声明，避免"零调用方"的卡也挂联调段。
    const skipIntegration = (o.skipIntegration ?? o.skip_integration) === true
    // 为什么本卡没有接口面（与 skipIntegration 同批）：砍联调段是**减法**，必须说清依据
    // （这卡没有调用方 / 没有 HTTP 边界 / 纯文档），否则批准人只能盲批一个布尔开关。
    // 硬拒用带 code 的抛错（与 resolvePlanStages 的 REQBOARD_TEMPLATE_CONFLICT 同一形态）：
    // 调用方要能把「缺理由」与「格式错」分开处置，bad() 只有一个通用 code 做不到。
    const skipIntegrationReasonRaw = readDual(o, 'skip_integration_reason', 'skipIntegrationReason', 'camel')
    const skipIntegrationReason = skipIntegrationReasonRaw === undefined
      ? ''
      : String(skipIntegrationReasonRaw).trim().slice(0, 300)
    if (skipIntegration && skipIntegrationReason.length === 0) {
      throw Object.assign(
        new Error(
          '计划任务 ' + key + '：skipIntegration=true 必须同时给 skip_integration_reason（一句话：'
          + '为什么这张卡没有接口面、靠什么判断，例：「纯文档卡，无运行时接口」「本卡只加内部函数，'
          + '没有调用方」「只改 CI 脚本，不进 HTTP 边界」）——砍掉联调段是减法，人要能复核依据'
          + '（REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED）',
        ),
        { code: 'REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED' },
      )
    }
    // 零交集依赖边的语义理由（与 normalizeRequirementRefs 同一课：白名单搬运不带上它 = 静默丢弃，
    // 于是判定单点永远看不见理由、每条真时序边都被点名）。
    // 两个拼法**取并集**（同一条边在两种写法里各写一遍不该互相覆盖）。
    // 双键取值唯一实现：dual-field.ts（G10 单源化）；并集语义（camel 覆盖同 key）逐字保持。
    const depReasons = dualMapMerged(o, 'dep_reasons', 'depReasons', depReasonsOf)
    // 需求条款引用（REQ-261002164800-d8f2 FR-2）：**保留**并当场校验——此前被白名单静默丢弃，
    // 于是计划里写了 refs 也到不了落库，卡上恒空。校验单点在 domain（编号形态与文档条款定义位同源）。
    // 两个拼法都认（snake 为主、camel 兼容人/历史写法），非法即抛 REQBOARD_BAD_REQUIREMENT_REF。
    const requirementRefs = normalizeRequirementRefs(
      o.requirement_refs ?? o.requirementRefs,
      '计划任务 ' + key + ' 的 requirement_refs',
    )
    // 体量声明（REQ-261002175818-80a8 t2 / FR-1、FR-2）：**保留**并当场校验两条——
    // ① 形状（未声明合法，返回 undefined）；② 声明不得小于 implementation 点到的路径数。
    // 与上一个字段同一条教训：白名单搬运不带上它，计划里写了也到不了落库。
    const footprint = normalizeFootprint(o.footprint, '计划任务 ' + key + ' 的 footprint')
    assertFootprintFloor(footprint, implementation, '计划任务 ' + key + ' 的 footprint')
    // 原型锚点 / 关联 D-x（REQ-261005105032-3b02 FR-5、FR-9 / t12）：**保留**这两个键。
    // 白名单搬运**不带上它们 = 静默丢弃**，而这正是本卡要堵的洞——门禁（UI 卡锚点维）与
    // RTM（covers_prototypes / covers_decisions）、子卡提示词都只从落库值取数，丢了就恒空。
    // 只做搬运与去空，形态判定留在门禁（形态不合法要逐卡点名，而不是让整份计划提交时炸在格式上）。
    const prototypeRefs = stringListOf(o.prototypeRefs ?? o.prototype_refs)
    const decisionRefs = stringListOf(o.decisionRefs ?? o.decision_refs)
    // 粒度豁免理由（REQ-261007125552-32cb FR-4）：snake 为主、camel 兼容（同 dep_reasons 惯例）；
    // trim + ≤300 截断 + 去空——空串/未填 = 键不出现（不冒充豁免），判定在 plan-granularity 单点。
    const granularityExempt = String(readDual(o, 'granularity_exempt', 'granularityExempt', 'snake') ?? '').trim().slice(0, 300)
    out.push({
      key,
      title: normalizeTitle(o.title),
      ...(description.length > 0 ? { description } : {}),
      phase: o.phase === undefined ? 'implement' : asTaskPhase(o.phase),
      side: o.side === undefined ? 'fullstack' : asTaskSide(o.side),
      dependsOn: asDependsOn(o.dependsOn ?? o.depends_on ?? o['依赖']),
      ...(acceptance.length > 0 ? { acceptance } : {}),
      ...(implementation.length > 0 ? { implementation } : {}),
      ...(executorHint !== undefined ? { executorHint } : {}),
      ...(stages !== undefined ? { stages: [...stages] } : {}),
      ...(template !== undefined ? { template } : {}),
      ...(skipIntegration ? { skipIntegration } : {}),
      ...(skipIntegrationReason.length > 0 ? { skipIntegrationReason } : {}),
      ...(depReasons !== undefined ? { dep_reasons: depReasons } : {}),
      ...(requirementRefs.length > 0 ? { requirement_refs: requirementRefs } : {}),
      ...(prototypeRefs.length > 0 ? { prototypeRefs } : {}),
      ...(decisionRefs.length > 0 ? { decisionRefs } : {}),
      ...(granularityExempt.length > 0 ? { granularity_exempt: granularityExempt } : {}),
      ...(footprint !== undefined ? { footprint } : {}),
    })
  })
  // 第二遍依赖引用校验（自依赖/悬空/前向引用）——规则在 domain/task/Acceptability.ts（t2）。
  const refCheck = checkPlanTaskReferences(out.map(t => ({ key: t.key, dependsOn: t.dependsOn ?? [] })))
  if (!refCheck.ok) bad(refCheck.reason)
  // 第三遍：**传递归约**（2026-09-29 用户裁定 B「数据侧」）。计划里写「全部前置」是作者的
  // 习惯性写法（如 t6 依赖 t2,t3,t4,t5），但 t2/t3 已由 t4 蕴含——落库前归约成「直接前置」，
  // 使计划、队列、画布三处的依赖口径一致，不再各自折叠（唯一实现在 domain/queue/transitiveReduction）。
  // 归约只删有替代路径的项、保序，因此"只引用前面已定义的 key"这条不变量不受影响。
  const reducedDeps = transitiveReduce(new Map(out.map(t => [t.key, t.dependsOn ?? []])))
  for (const t of out) {
    const next = reducedDeps.get(t.key)
    if (next !== undefined) t.dependsOn = next
  }
  for (const t of out) {
    const acc = checkAcceptance(t.key, t.acceptance ?? '')
    if (!acc.ok) bad(acc.reason)
    if ((t.implementation ?? '').length === 0) {
      bad('计划任务 ' + t.key + ' 缺实施方案（implementation）——拆分卡 ≠ 实施卡：写清改哪些文件、步骤、验证方式，批准计划即批准怎么做')
    }
  }
  return out
}


/**
 * 挂起确认（T-4，REQ-260924213231-b1c4 / FR-3 / I-3/I-4）——**内存**态，不落盘。
 *
 * 产生：`reqboard_ask_confirm` 超过宽限窗口仍未作答（返回 `pending:true` + `ticket`，**不判失败**）；
 * 消费：人作答后由后台落章 + 推进，agent 凭 `ticket` 调 `reqboard_ask_confirm(ticket=…)` 取回执
 * （缺 ticket 时回退读台账 `confirmedAt`，以台账为准）。
 */
export interface PendingConfirmation {
  /** 前缀 `pc-` + 随机 id，全局唯一 */
  ticket: string
  /** 归属窗口（回执不可跨窗口取用） */
  windowKey: string
  requirementId: string
  /** 与 ask_confirm 同语义 */
  target: 'artifact' | 'plan'
  /** target=artifact 时的产物种类 */
  kind?: ArtifactKind
  createdAt: number
  /**
   * 阻塞等待期间被中止（ASK_ABORTED / signal.aborted）的留痕时间（REQ-260927123256-196b FR-4）。
   * 缺省 = 未被中止。写首次即定（幂等）；也是过期基准——中止记录再获一个完整 TTL。
   */
  interruptedAt?: number
  /** 后台作答后回填（缺省 = 尚未作答） */
  outcome?: PendingConfirmationOutcome
}


export interface RequirementRecord {
  id: string // REQ-xxxxxx
  title: string
  description: string
  /** 需求分类（LLM 在新建时自动标注） */
  category?: RequirementCategory
  /** 提示词难度级别：控制注入到系统提示词中的指导复杂度 */
  promptDifficulty?: PromptDifficulty
  /** 需求文档基础路径（用户在立项时选择，如 docs/requirements/<REQ>/ 或 docs/rfcs/） */
  docBasePath?: string
  /**
   * 需求所属**项目**的稳定唯一标识（REQ-261005141830-7a3b FR-1/FR-10）——宿主 `workspace.id`。
   *
   * 为什么必须有它：改造前"这条需求属于哪个项目"只能靠 `workspaceRoot`（路径）比较，
   * 而路径是**位置**不是**身份**（软链 / 相对写法 / 移动 / 复制都会裂成两个身份）。
   * 有了它，「同一项目」= id 相等；根则由 id 从项目条目带出（1 : 1，同一条目上的两个字段）。
   *
   * 缺省 = 未归属（存量需求，或立项窗口不属于任何项目）——读端回落 `workspaceRoot` 并**如实标注**，
   * 不迁移、不拒写（裁定 D-3）。
   */
  projectId?: string
  /**
   * 需求级工作区根（REQ-260929210741-30ae FR-6）：立项时选定，绝对路径。
   * 该需求的所有文件操作（docs/queue/产物登记/任务卡文档）以此根拼接相对路径。
   * undefined = 存量需求 → 解析链落到会话 header.cwd。
   * 一经落库不可变；非法值（非绝对路径/目录已删）读侧降级到会话 cwd + warn。
   *
   * REQ-261005141830-7a3b 起**角色降级**：由「判定唯一权威」降为「存量兜底 + 来源标注」——
   * 有 `projectId` 时根由它带出；本字段只在 id 缺失时兜底（见 `internal/support.rootOf`）。
   */
  workspaceRoot?: string
  /** 文档链接（需求文档/UI/方案），相对工作区路径或 URL */
  docLinks?: { requirement?: string; ui?: string; proposal?: string; extras?: Array<{ label: string; path: string }> }
  status: RequirementStatus
  blocked: boolean
  blockedReason?: string
  /** 手动中断：编排器跳过本需求的自动派发 */
  paused?: boolean
  /**
   * 自动链开关（REQ-4842fe FR-12）：true=自动链运行中；false=暂停（失败/熔断/人工关闭）。
   * 持久化在台账（非内存），重启后由恢复扫描读取；缺省 = 未开启（存量需求读出即旧行为）。
   */
  autoRun?: boolean
  /**
   * 需求级调度优先级（REQ-261004110201-f253 FR-4）：数值越大越先被派发；
   * 同值按 `createdAt` 升序（稳定，避免抖动）。缺省 = 存量需求 → 视作 0（与改造前顺序一致）。
   * 只影响**顺序**，不影响任何闸门与判定。
   */
  priority?: number
  /** 推进事件运行状态（单飞锁 + 事件历史 + 停滞计数；缺省 = 未跑过自动链） */
  advance?: AdvanceState
  /** Dive 模式状态（REQ-260925212722-96e7）：需求自动续跑与阶段控制。缺省 = 未启用 Dive 模式（手动模式） */
  dive?: RequirementDive
  /** 评审共创会话 */
  reviewSessionId?: string
  /** 立项来源窗口（自动立项时写入；人工建卡不填）——窗口↔需求 n:n 的需求侧锚点 */
  sourceSessionId?: string
  /**
   * 需求席位（REQ-261003215944-9e04 FR-2）：一条需求可以有多个窗口参与。
   * 缺省 = 存量需求 → 读端折算为单 owner（`sourceSessionId`），**不落盘、不迁移**。
   * 全链可缺省，故 `REQBOARD_SCHEMA_VERSION` 维持 9。
   */
  seats?: WindowSeat[]
  // C6（REQ-47939a t10）：预留字段 projectId / parentId 已删除——全仓引用 0、从未落过盘，
  // 只有类型声明会让读代码的人以为功能存在（design/migration.md §2 C6）。历史数据里若残留
  // 这两个键，由迁移脚本删除（scripts/migrate-ledger.ts C6）。
  /** 节点产物登记（t4 钩子写入；五道人工确认门的确认状态在此） */
  artifacts?: StageArtifact[]
  /** 归档后的目录路径 */
  archivePath?: string
  /**
   * 状态事件时间线（创建 + 每次转移一条）。新转移一律实时写入真实事件；
   * **老记录由 v4→v5 迁移一次性补齐**（inferred=true，算法见 domain/legacy/LegacyStatus.ts）——
   * t10 起运行时读路径不再做回填（此前每次 load 都补，见 design/migration.md C4）。
   * 仍标可选：未迁移的 v4 台账必须继续可载入（§5 兼容读策略）。
   */
  statusHistory?: StatusEvent[]
  /**
   * token 消耗聚合（REQ-a33899）：按节点与合计，写路径增量维护，读路径 O(1)。
   * 缺省=v5 及更早台账（读路径必须可选解析，缺失 ≠ 0）。
   */
  tokenUsage?: RequirementTokenUsage
  /** 拆分计划（plan mode）：拆分前提交、由人批准；未批准不允许拆分 */
  plan?: PlanRecord
  /**
   * 文档演进留痕（REQ-2e9473 t19/W8）：上游文档变更 → 下游文档"待同步"标记。
   * 上游 requirement 变更 → plan/decomposition 待同步；plan 变更 → decomposition 待同步。
   * 下游重交（plan_submit/decompose）后销标；未销标时推进/验收给出警告。
   */
  docSyncPending?: DocSyncPending[]
  /**
   * 断点（T-1，REQ-260924213231-b1c4 FR-6）：当前阶段 + 未完成动作 + 中断原因。
   * 缺省 = 无断点（存量记录读出即旧行为，续跑输入包逐字节不变）。
   */
  interruption?: InterruptionRecord
  /** 验收材料（agent 提交）+ 人工审核结论 */
  verification?: VerificationRecord
  /** 覆盖式通过留痕（REQ-a8d582 FR-4）：缺省 = 无覆盖 */
  acceptanceOverride?: AcceptanceOverride
  /** 归档材料（agent 准备）+ 归档结论（人） */
  archive?: ArchiveRecord
  /**
   * 回退留痕（REQ-261003204149-1e80 FR-1/FR-3）：最近一次需求级回退的 from→to。
   * 缺省 = 从未回退过；`rollback.to === status` 即「当前处在回退态」（拆分守卫据此放行重建）。
   */
  rollback?: RollbackMark
  /**
   * L1 阶段目标（REQ-261010200257-7e2d FR-2）：每主阶段一条**达成位**（pending | done）。
   *
   * **加性可选、零迁移**：缺省 = 该需求未启用 goal 能力（老需求读出即老行为）——
   * 不补齐、不改写、无迁移脚本，故不 bump schemaVersion。收口判据 `readyToClose()` 对空数组
   * 恒 false（缺失 ≠ 达成）。达成位写入只能走人工门落章路径（D-4）。
   */
  goals?: StageGoal[]
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}


/**
 * 需求级回退留痕（REQ-261003204149-1e80 FR-1 / FR-3）——最近一次回退的 from→to 与发起人。
 *
 * 为什么只存**最近一次**：它是**状态标记**（「当前处在回退态」，拆分守卫据此判定可否重建），
 * 不是历史账——历史由 `statusHistory` 的状态事件与 `[回退]` 评论承担（只增不改）。
 * 重复回退覆盖它，符合本仓既有的「后写覆盖前写」断点口径。
 *
 * 缺省 = 从未回退过（存量台账读出即旧行为，无需迁移）。
 */
export interface RollbackMark {
  from: RequirementRecord['status']
  to: RequirementRecord['status']
  at: number
  by: ActorRef
  reason?: string
  /**
   * 第几次回退（REQ-261004121649-bfa7 t3 / FR-4）。
   * 缺省 = 存量记录（从未记过次数）→ 读端按 1 计，故**无需迁移**。
   */
  seq?: number
  /**
   * 最近一次回退**物化出来的卡 id**（REQ-261004121649-bfa7 t3 / FR-4）——
   * 批量清理入口的唯一输入，让人不必逐张点选。
   *
   * 为什么不能靠"反查 reworkOf"替代：反查分不清"这批是我刚物化的"与"上一批还没清的"，
   * 清理就没有边界（t6 的兜底路径正是给**没有这个字段**的旧卡用的，且必须如实声明匹配方式）。
   */
  lastMaterialized?: string[]
}


export interface TaskRecord {
  id: string // t-xxxxxx
  requirementId: string
  title: string
  description: string
  phase: TaskPhase
  side: TaskSide
  /** DAG 依赖（同需求内任务 id） */
  dependsOn: string[]
  scope: TaskScope
  /** 验收标准（TBD 模板化，v1 自由文本） */
  acceptance: string
  /** 实施方案（REQ-2e9473 W5，decompose 从 PlanTask 透传）：怎么做——改哪些文件、步骤、验证方式 */
  implementation?: string
  /** 需求背景摘要（自足执行用） */
  context: string
  /** 上游产出摘要（handoff：下游窗口不读上游会话） */
  dependsSummary?: string
  // ── REQ-4842fe 子卡层（全部可缺省：旧台账读出即旧行为，不 bump schemaVersion） ──
  /** 有值 = 子卡，指向父卡 id；无值 = 普通/父卡（存量卡行为不变） */
  parentId?: string
  /** 子卡阶段（受控枚举）；子卡必填、父卡不得有（INV-2） */
  stageKind?: StageKind
  /** 该卡显式声明子卡 stages（FR-1b 逃生舱口；不填则按卡类型走映射表） */
  stages?: StageKind[]
  /**
   * 该卡落库时引用的子卡链模板键（REQ-261003203909-55f2 FR-4；冗余记录供统计/审计）。
   * stages 已存解析后的具体链，本字段只回答「这条链是从哪个模板键来的」；缺省 = 未引用模板。
   */
  template?: string
  /** 失败重跑次数（默认 0） */
  attempt?: number
  /** 卡片修订记录（append-only，INV-6） */
  revisions?: CardRevision[]
  /**
   * 本卡是为取代哪张旧卡而物化的**重做卡**（REQ-261003204149-1e80 FR-4）。
   *
   * 需求级回退时：旧卡一律标 canceled，再按旧卡物化一张本字段指向旧卡的新卡
   * ——让「这些活要重做」在 DAG 上可见，不被静默丢弃；重新拆分落库时这些重做卡被新计划取代。
   * 缺省 = 常规卡（存量队列卡读出即旧行为）。
   */
  reworkOf?: string
  /**
   * manual 段核对清单骨架的生成时间（REQ-261003203909-55f2 FR-2 防伪造锚点）：
   * 骨架由链落盘（mtime 必然 ≥ 链出身），若凭证门只看链出身，「骨架生成后一个字不改就汇报」
   * 也能过门。本字段让 manual 子卡的新鲜度基准收紧为「骨架生成时间之后」——人核对后的
   * 更新必然晚于骨架。缺省 = 非 manual 卡或骨架未生成（按链出身判定，旧行为）。
   */
  manualSkeletonAt?: number
  /**
   * 最近一次 workflow run 的证据（REQ-4842fe t5，子卡完工凭证第③项的持久化载体）。
   * 子卡凭证门在 done 时读取；父卡不写本字段。
   */
  lastRun?: TaskRunEvidence
  /**
   * 最近一次 task_report 的结构化摘要（REQ-2e9473 t06 done 凭证门的证据源）：
   * 汇报即留痕——转 done 前必须存在且 filesChanged/completed 至少其一非空。
   */
  lastReport?: TaskReportSummary
  // ── FR-11 路线 A（REQ-260926140539-457b）：团队执行映射（可缺省 = 走 workflow 兼容路径） ──
  /**
   * 该子卡在 DSH Agent Teams 共享任务板上的 team task id（team task id ↔ 子卡 id 的持久映射）。
   * 有值 = 该卡已派给团队 Worker；链靠它把"任务板 completed"对回这张卡。
   */
  teamTaskId?: string
  /** 执行方式提示（decompose 从 PlanTask 透传） */
  executorHint?: ExecutorHint
  /** 自足任务卡文档（decompose 生成骨架，task_report 追加汇报；同 StageTaskRef.cardDoc） */
  cardDoc?: string
  /** 需求条款引用（RTM 覆盖度追踪：该任务实现/测试了哪些需求编号，如 ["FR-1", "FR-2"]） */
  requirementRefs?: string[]
  /**
   * 该卡承接的**原型锚点**引用（REQ-261005105032-3b02 FR-9，决议 `#36`）：
   * 取值 = 锚点引用原文，如 `["prototypes/detail.html#FR-4"]`。
   *
   * 为什么与 requirementRefs 分列：锚点是页面内区块的定位符，**不得写进 serves**——
   * 混算会让覆盖度虚高（serves 侧已由 `stripPrototypeAnchors` 前置抹除，见 content-gates）。
   * **可选**：缺省 = 未采集（无锚点的卡合法）；加性变更、零迁移（决议 `#50`）——
   * 旧卡缺该键不补齐、不改写、无迁移脚本，旧读取路径与旧形状不变。
   */
  prototypeRefs?: string[]
  /**
   * 该卡承接的 **D-x 裁定**编号（REQ-261005105032-3b02 FR-9，决议 `#36`）：如 `["D-1","D-2"]`。
   * 与 `requirementRefs` 命名对齐；供 RTM `covers_decisions` 与「每条 D-x 必须被引用」的覆盖度点名。
   * **可选**：缺省 = 未采集；加性变更、零迁移（决议 `#50`，同上）。
   */
  decisionRefs?: string[]
  /**
   * 卡片体量声明（REQ-261002175818-80a8 t2 / FR-7）：与计划层（`PlanTask.footprint`）逐字一致。
   * 旧台账无此字段 = **未声明**（回显「未声明」，不当成 0）；本字段可缺省，故不 bump schemaVersion。
   */
  footprint?: CardFootprint
  skipIntegration?: boolean
  /**
   * 本卡**请求预算覆盖值**（REQ-261007100513-6749 t1 / FR-6，design/data-model.md §新增数据结构）。
   *
   * **可选**：缺省 = `LIMITS.subtaskRequestBudget`（60，常量由 FR-6 实现卡落在 `domain/limits.ts`）。
   * 仅作**覆盖**用——不参与状态机、不参与任何门禁判据、不参与依赖解析（本需求一条判据都不改）。
   * 读侧口径：非正整数（`<= 0` 或非整数）按缺省处理并留一条诊断，**不阻断开工**。
   * **加性可选、零迁移**：不补齐、不改写、无迁移脚本（与 `prototypeRefs` / `decisionRefs` /
   * `footprint` 同款先例）——故**不 bump** `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1），
   * 也**不加进** `validateQueue.ts` 的 `REQUIRED_TASK_FIELDS`。缺省 = 现行为。
   */
  budgetRequests?: number
  /**
   * L2 任务目标（REQ-261010200257-7e2d FR-3）：dsh goal 内核的 pm 自实现（四相 + rounds 计数）。
   *
   * **加性可选、零迁移**：缺省 = 该卡未启用 goal（老卡读出即老行为）——不补齐、不改写、
   * 故不 bump schemaVersion 与 QUEUE_VERSION。判据复用本卡 `acceptance`（D-1）：
   * objective 是它的陈述面，不另造验收标准。状态变更一律经 `transitionGoal` 纯函数。
   */
  goal?: TaskGoal
  status: TaskStatus
  blocked: boolean
  blockedReason?: string
  claimedBy?: string
  claimedAt?: number
  executions: ExecutionRecord[]
  /** 状态事件时间线（创建 + 每次转移一条；甘特图据此按状态分段着色） */
  statusHistory?: StatusEvent[]
  // ── 取消留痕三字段（REQ-261005193546-1b1a FR-3，design/data-model.md §1）───────────────
  // 语义 = **本卡最近一次取消**（**覆盖式**：再次取消覆盖，复活（canceled → todo）**不清空**）；
  // 历史每次取消在 `statusHistory` / `revisions` 里 ⇒ **首次取消不可追**。
  // **加性可选、零迁移**：不补齐、不改写、无迁移脚本（与 prototypeRefs / decisionRefs / footprint
  // 同款先例）——故 **不 bump** `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1），
  // 也**不加进** `validateQueue.ts` 的 `REQUIRED_TASK_FIELDS`。缺省 = **未采集**（本需求上线前
  // 取消的卡；不补 `0`、不补 `null`、不补当前时间），读端不得据此报错或写回。
  // 写入一律经唯一写入口 `markCanceled`（本文件）——四处取消写入点共用，不允许任一处另取值。
  /**
   * 取消时刻（epoch ms）。值 = 那一次写入的时钟值，与 `statusHistory` 里那条 `→canceled`
   * 事件的 `at` **同一个数值**（同源同刻）。
   */
  canceledAt?: number
  /**
   * 取消人。`kind` 恒为字面量 `'human'`（取消是人工门动作，`HUMAN_ONLY_TASK_TRANSITIONS`）；
   * `sessionId` 缺省 = 人从看板按钮操作（**不写该键**，不写空串，不写 `kind:'system'` 替身值）。
   * 真非人工路径**整字段不写**。审计用，**不进任何界面投影**。
   */
  canceledBy?: { kind: 'human'; sessionId?: string }
  /** 取消原因（自由文本；`trim()` 后非空才写，**原文保留**、无硬上限）。审计用，不进任何界面投影。 */
  cancelReason?: string
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}


export interface ReqboardLedger {
  schemaVersion: number
  revision: number
  requirements: RequirementRecord[]
  // REQ-260927202051-f6df t6：`tasks: TaskRecord[]` 已移除（schemaVersion 9）。
  // 任务卡的唯一存储 = 各需求的 queue.json；台账只留 requirements / triages。
  triages: TriageRecord[]
  /**
   * 迁移留痕（C2，REQ-47939a t10）：这份台账何时被谁升到过哪个版本。
   * 迁移脚本写入；运行时只读不写。
   */
  migrations?: { from: number; to: number; at: number; by: string }[]
}


export function emptyLedger(): ReqboardLedger {
  return { schemaVersion: REQBOARD_SCHEMA_VERSION, revision: 0, requirements: [], triages: [] }
}


export function asReqStatus(raw: unknown): RequirementStatus {
  if (typeof raw !== 'string' || !(ALL_REQ_STATUSES as readonly string[]).includes(raw)) {
    bad(`需求状态必须是：${ALL_REQ_STATUSES.join(', ')}`)
  }
  return raw as RequirementStatus
}


export function asTaskStatus(raw: unknown): TaskStatus {
  if (typeof raw !== 'string' || !(ALL_TASK_STATUSES as readonly string[]).includes(raw)) {
    bad(`任务状态必须是：${ALL_TASK_STATUSES.join(', ')}`)
  }
  return raw as TaskStatus
}


// ---------------------------------------------------------------------------
// DAG 校验（同需求内：依赖存在 / 无自依赖 / 无环）
// ---------------------------------------------------------------------------

/**
 * 校验任务依赖 DAG。tasks 为该需求全部任务（含待落的草稿任务）。
 * 非法时抛 code=invalid_dag。
 */
export function assertDagAcyclic(tasks: ReadonlyArray<Pick<TaskRecord, 'id' | 'dependsOn' | 'requirementId'>>, requirementId: string): void {
  const inReq = tasks.filter(t => t.requirementId === requirementId)
  const ids = new Set(inReq.map(t => t.id))
  const deps = new Map<string, string[]>()
  for (const t of inReq) {
    if (t.dependsOn.includes(t.id)) {
      throw Object.assign(new Error(`任务 ${t.id} 不能依赖自身`), { code: 'invalid_dag' })
    }
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) {
        throw Object.assign(new Error(`任务 ${t.id} 依赖了不存在的任务 ${dep}（限同需求内）`), { code: 'invalid_dag' })
      }
    }
    deps.set(t.id, [...t.dependsOn])
  }
  // DFS 三色标记找环
  const color = new Map<string, 0 | 1 | 2>() // 0=未访问 1=在栈 2=完成
  const visit = (id: string, path: string[]): void => {
    const c = color.get(id) ?? 0
    if (c === 2) return
    if (c === 1) {
      throw Object.assign(new Error(`任务依赖成环：${[...path, id].join(' → ')}`), { code: 'invalid_dag' })
    }
    color.set(id, 1)
    for (const dep of deps.get(id) ?? []) visit(dep, [...path, id])
    color.set(id, 2)
  }
  for (const id of ids.keys()) visit(id, [])
}


/**
 * 计算 ready 任务：todo 且全部依赖**已满足**（串行调度器的选择器）。
 *
 * REQ-261005193546-1b1a FR-1 / D-8：本函数是 `domain/status/Predicates.liveReadyTasks` 的
 * **薄封装**——判据（自身 todo、依赖 `done`/`canceled`/缺席 = 已满足）只在单点一份，
 * 本处不再写 `doneIds.has(dep)` 这类手写式（那正是与 `readyTasksOf` 漂移的旧病）。
 *
 * 两条被保住的既有口径：
 * - 只让 `status === 'todo'` 的活卡进 ready（`isReadyTask` 内部保证）；
 * - **输出顺序 = 输入顺序**（按需求过滤后逐条筛，不重排；R-3 / D8）。
 */
export function readyTasks(tasks: readonly TaskRecord[], requirementId: string): TaskRecord[] {
  const inReq = tasks.filter(t => t.requirementId === requirementId)
  const readyIds = new Set(liveReadyTasks(inReq))
  return inReq.filter(t => readyIds.has(t.id))
}


// ---------------------------------------------------------------------------
// 子卡不变量（REQ-4842fe t3 / design/data-model §8）
// ---------------------------------------------------------------------------

/** 卡片角色（子卡判定）：有 parentId = 子卡；无 = 普通/父卡（存量兼容）。 */
export function taskRoleOf(t: Pick<TaskRecord, 'parentId'>): TaskRole {
  return t.parentId !== undefined && t.parentId !== '' ? 'subtask' : 'legacy'
}


/**
 * 角色判定（需台账）：子卡 → subtask；无 parentId 但**名下有子卡** → parent（新式父卡）；
 * 两者都不是 → legacy（存量卡，走既有五段状态机）。
 *
 * 为什么要看台账：父卡与存量卡在自身字段上完全一样（都只有 parentId 缺省），
 * 唯一区别是"名下有没有子卡"——这是派生事实，不能靠父卡自存字段（会双写漂移）。
 */
export function taskRoleIn(
  tasks: ReadonlyArray<Pick<TaskRecord, 'id' | 'parentId'>>,
  task: Pick<TaskRecord, 'id' | 'parentId'>,
): TaskRole {
  if (isSubtask(task)) return 'subtask'
  return tasks.some((t) => t.parentId === task.id) ? 'parent' : 'legacy'
}


/** 是否子卡。 */
export function isSubtask(t: Pick<TaskRecord, 'parentId'>): boolean {
  return taskRoleOf(t) === 'subtask'
}


/** 子卡集合的确定性子集（同一父卡下的子卡，按链序由 dependsOn 表达）。 */
export function subtasksOf(tasks: readonly TaskRecord[], parentId: string): TaskRecord[] {
  return tasks.filter(t => t.parentId === parentId)
}


/**
 * 子卡不变量校验（纯函数，零副作用）：
 *  - INV-1 子卡的 parentId 必须指向同需求内存在的父卡（悬空子卡 = 违规）；
 *  - INV-2 角色字段互斥：子卡必须有 stageKind，父卡/普通卡不得有 stageKind；
 *  - INV-3 同一父卡下的子卡集合是"映射表或显式 stages 的确定性投影"——同一 stageKind
 *    不得出现两次（重复展开应幂等，不该产生第二套）；
 *  - INV-4 子卡依赖不跨父卡：子卡→子卡依赖必须同属一个父卡（跨父卡顺序由父卡层 dependsOn 表达）。
 */
export function checkSubtaskInvariants(
  tasks: ReadonlyArray<Pick<TaskRecord, 'id' | 'requirementId' | 'parentId' | 'stageKind'>>,
  requirementId: string,
): SubtaskViolation[] {
  const inReq = tasks.filter(t => t.requirementId === requirementId)
  const ids = new Set(inReq.map(t => t.id))
  const violations: SubtaskViolation[] = []
  const siblings = new Map<string, string[]>()
  for (const t of inReq) {
    if (isSubtask(t)) {
      if (!ids.has(t.parentId as string)) {
        violations.push({ inv: 'INV-1', message: fmt('子卡 {id} 的 parentId 指向不存在的父卡 {parent}', { id: t.id, parent: String(t.parentId) }) })
      }
      if (t.stageKind === undefined) {
        violations.push({ inv: 'INV-2', message: fmt('子卡 {id} 缺 stageKind', { id: t.id }) })
      }
      const list = siblings.get(t.parentId as string) ?? []
      list.push(t.stageKind ?? '')
      siblings.set(t.parentId as string, list)
    } else if (t.stageKind !== undefined) {
      violations.push({ inv: 'INV-2', message: fmt('父卡/普通卡 {id} 不得有 stageKind', { id: t.id }) })
    }
  }
  // INV-4：子卡之间的依赖必须同父卡（链首继承父卡外部依赖，那些是父卡层任务，不受此限）。
  const byId = new Map(inReq.map((t) => [t.id, t]))
  for (const t of inReq) {
    if (!isSubtask(t)) continue
    for (const dep of (t as TaskRecord).dependsOn ?? []) {
      const d = byId.get(dep)
      if (d !== undefined && isSubtask(d) && d.parentId !== t.parentId) {
        violations.push({
          inv: 'INV-4',
          message: fmt('子卡 {id} 依赖了另一父卡的子卡 {dep}（跨父卡依赖由父卡层表达）', { id: t.id, dep }),
        })
      }
    }
  }
  for (const [parent, kinds] of siblings) {
    const seen = new Set<string>()
    for (const k of kinds) {
      if (k === '') continue
      if (seen.has(k)) {
        violations.push({ inv: 'INV-3', message: fmt('父卡 {parent} 下 stageKind 重复：{kind}（幂等展开应只落一套）', { parent, kind: k }) })
      }
      seen.add(k)
    }
  }
  return violations
}


/** 不变量校验（违规则抛）：code=subtask_invariant，消息含 INV 编号。 */
export function assertSubtaskInvariants(
  tasks: ReadonlyArray<Pick<TaskRecord, 'id' | 'requirementId' | 'parentId' | 'stageKind'>>,
  requirementId: string,
): void {
  const violations = checkSubtaskInvariants(tasks, requirementId)
  if (violations.length > 0) {
    const message = violations.map(v => '[' + v.inv + '] ' + v.message).join('；')
    throw Object.assign(new Error(message), { code: 'subtask_invariant' })
  }
}


/** 归档材料校验（缺项抛 code=invalid_input，消息指明缺什么）。 */
export function assertArchiveMaterials(
  category: RequirementCategory | undefined,
  archive: Pick<ArchiveRecord, 'dir' | 'docs' | 'mergedInto' | 'indexEntry' | 'manualUpdates' | 'manualNote'>,
): void {
  const rule = ARCHIVE_DOC_RULES[category ?? 'feature']
  if (archive.dir.trim().length === 0) bad('归档材料缺少需求目录（dir）')
  if (!REQUIREMENT_DIR_PATTERN.test(archive.dir.trim())) {
    bad('需求目录不符合约定：应为 docs/requirements/REQ-xxxxxx（或 agent-dh/docs/requirements/REQ-xxxxxx），'
      + '当前是 ' + archive.dir.trim())
  }
  if (archive.indexEntry.trim().length === 0) {
    bad('归档材料缺少索引条目（indexEntry）：一句话说清这次需求解决了什么')
  }
  const kinds = new Set(archive.docs.map(d => d.kind))
  const missing = rule.requiredDocs.filter(k => !kinds.has(k))
  if (missing.length > 0) {
    bad('归档材料缺少必填文档：' + missing.join(', ') + '（' + (category ?? 'feature') + ' 类要求）' + rule.note)
  }
  if (archive.docs.some(d => d.path.trim().length === 0)) bad('归档文档清单存在空路径')
  if (archive.mergedInto.length === 0) {
    bad('归档材料缺少合并去向（mergedInto）——' + rule.note)
  }
  for (const target of archive.mergedInto) {
    if (!rule.mergeTargets.some(prefix => target.startsWith(prefix))) {
      bad('合并去向 ' + target + ' 不在本类型允许的位置（应为 ' + rule.mergeTargets.join(' / ') + ' 之下）：' + rule.note)
    }
  }
  // 金字塔生长：改变项目级认知的类型必须申报"说明书更新点"，否则项目认知永远长不上去
  const manual = archive.manualUpdates ?? []
  if (rule.requireManual && manual.length === 0) {
    bad('归档材料缺少项目说明书更新点（manualUpdates）——' + (category ?? 'feature')
      + ' 类需求改变了项目级认知，必须说明更新了 docs/architecture/project-manual.md（L1）'
      + '或对应领域篇（L2）的哪一节；确实没有认知变化时改用不需要申报的类型，或先在手册里补一节')
  }
  for (const u of manual) {
    // REQ-261006201841-944d FR-2：说明书更新点收敛为 `路径#锚点`。
    // 这里只判**形态**（零 IO）——「那份文档在不在、那一节还在不在」是事实判定，
    // 归 application（`assertArchiveTargetsOpenable`）；两处分工不得互相顶替。
    const raw = u.path.trim()
    if (raw.length === 0 || u.summary.trim().length === 0) {
      bad('说明书更新点必须写全 path（「路径#锚点」形态）与 summary（哪一份文档的哪一节、多了什么认知）')
      continue
    }
    const parts = raw.split('#')
    if (parts.length !== 2 || parts[0]!.trim().length === 0 || parts[1]!.trim().length === 0) {
      bad('说明书更新点的 path 必须是「路径#锚点」形态（路径与锚点都非空，且只能有一个 #），当前是 ' + raw
        + '；旧写法 section（自由文本章节名）已废弃——锚点写进 path 才能被逐个复核')
      continue
    }
    // 白名单与 mergedInto **同一份规则**（ARCHIVE_DOC_RULES[category].mergeTargets）——
    // 不新造第二份白名单，否则两处必然漂移。
    const docPath = parts[0]!.trim()
    if (!rule.mergeTargets.some(prefix => docPath.startsWith(prefix))) {
      bad('说明书更新点 ' + docPath + ' 不在本类型允许的位置（应为 ' + rule.mergeTargets.join(' / ') + ' 之下）：' + rule.note)
    }
  }
}


/** 需求级聚合（读路径 O(1)）：按节点与合计。 */
export interface RequirementTokenUsage {
  byStage: Partial<Record<StageKey, TokenBuckets>>
  totals: TokenBuckets
  costEstimateCny?: number
  updatedAt: number
}


/** 单个流程节点的消耗行。 */
export interface RequirementTokenStageRow {
  stage: StageKey
  /** undefined = 该节点无快照（不是 0） */
  buckets?: TokenBuckets
  executions: TokenExecutionRow[]
}


/** 需求级 token 视图（GET /requirements/:id/token 的 data；host 装配、client 渲染共用）。 */
export interface RequirementTokenView {
  requirementId: string
  totals: TokenBuckets
  costEstimateCny?: number
  byStage: RequirementTokenStageRow[]
  /** true = 存在不可得快照（部分节点/执行显示「无快照」，合计不含缺失段） */
  degraded: boolean
  /** 固定系统提示词成本（读时装配；服务不可得 → source=unavailable） */
  systemPrompt?: SystemPromptCost
  /** reqboard 注入提示词成本（来自注入留痕） */
  injections?: InjectionCost
}


/* ── 端点 1：首屏（结论头 + 操作条 + 状态带） ─────────────────────────────── */

/** 结论头：这条需求是谁、什么状态、在哪些窗口手里。 */
export interface ReportHead {
  id: string
  title: string
  category: string
  promptDifficulty?: string
  status: RequirementStatus
  /** 是否被阻塞（阻塞时 head 必须给出原因，不许只给红旗） */
  blocked: boolean
  blockedReason?: string
  createdAt: number
  updatedAt: number
  /** 席位表：owner / worker / observer（跳转按钮按它逐个渲染） */
  seats: WindowSeat[]
  /**
   * 窗口跳转入口（**现有能力，不得回退**）：
   * `archived=true` 表示该会话已归档——仍可点（先恢复再打开），不是灰按钮。
   */
  sessionJump: { windowKey: string; archived: boolean }[]
  /**
   * 台账评论**最近 3 条**（补能力回退：旧详情页显示评论列表，新页只有输入框 = 用户看不到评论了）。
   *
   * 口径（为什么是这三个字段、而不是整条 `CommentRecord`）：
   *  - **新的在后**，顺序与台账 `req.comments` 一致（同一条时间线，读者从旧读到新）；
   *  - **只给尾部 3 条**（原为 10 条，见 `REPORT_COMMENT_HEAD_LIMIT`）：首屏是唯一请求，
   *    把整本评论搬上来既拖慢首屏、也让页面无界变长——台账里一条「产物自动发现」的系统转储
   *    就有 11,157 字，10 条合计 13,317 字，实测把 Tab 栏顶到 top=1118（视口 713）→ 首屏看不到
   *    六个 Tab。这是缺陷根因，不是美观偏好。更早的评论走"加载更早"（分页 ≠ 内层滚动，
   *    FR-11 #6/#7）；总数由 `commentsTotal` 如实给出。
   *  - 渲染一行只要"什么时候 / 谁 / 说了什么"，`id` 前端用不上（点开单条是后续卡片的事）；
   *  - **缺省 = 未采集（服务端没下发）**：页面**整块不渲染**，也不写"暂无评论"——
   *    "没有评论"（`[]`）与"读不到评论"（缺省）必须分开（FR-12）；`by` 缺失由渲染侧按
   *    `commentActorLabel` 的同口径折算为「人」（历史评论没有 actor 字段）。
   */
  comments?: { at: number; body: string; by: ActorRef }[]
  /**
   * 台账评论**总条数**（加法式可选字段）：只为一句诚实话——"最近 3 条"不等于"一共 3 条"。
   *
   * 为什么必须给：把列表限到 3 条是内容控制，不是"更早的评论不存在"。少了这个数，页面上的
   * 「最近评论 3 条」会被读成"这条需求只有 3 条评论"——拿省略当事实正是 FR-12 要堵的那类谎。
   * 缺省 = 服务端没给总数（渲染侧退回"只报已渲染条数"，不猜）。
   */
  commentsTotal?: number
}


/**
 * 操作条一个按钮（FR-3）：**只给当前状态下合法的动作**，并写清后果。
 * 终态（archived/canceled/done）必须返回空数组——页面据此不渲染任何动作按钮。
 */
export interface ReportAction {
  key:
    | 'move'
    | 'plan-approve'
    | 'plan-reject'
    | 'verify-pass'
    | 'verify-rework'
    | 'cancel'
  label: string
  to?: RequirementStatus
  consequence: string
  /** 只有人能点（agent 调用会被代码级拒绝）——页面标注，不隐藏 */
  humanOnly: boolean
}


/** 端点 1 响应。 */
export interface ReportResponse {
  head: ReportHead
  progress: ReportProgress
  /** 一句话结论：在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手 */
  verdictLine: string
  /** 「几件事等人」的数字（必须与 gaps 中的红色条数口径一致） */
  waitingHuman: number
  gaps: ReportGap[]
  actions: ReportAction[]
  nextStepForAgent?: string
  /**
   * Tab 角标关键数字（FR-11 #4）：「对话 42」「Token 1.84M」——默认页不切 Tab 也能看出"有多少"。
   *
   * 三条口径（都是**服务端算好的短字符串**，前端不遍历、不推算）：
   *  - 值一律是**已格式化**的短串（`'7'` / `'42'` / `'1.84M'`）：角标是给人扫一眼的；
   *  - **只填能便宜拿到的**：`docs`=已登记产物条数、`dag`=任务卡数、`token`=需求 token 合计
   *    （台账没有 `tokenUsage` 就**不给**——不写 `'0'` 冒充"没花过"）；
   *  - 需要额外读会话事件/留痕才能得到的（`dialogue` / `prompts`）**首屏一律不填**：
   *    首屏是唯一请求，不为了一个角标加读（不知道就不显示，符合 FR-12）；
   *    `trunk` 同理留空（要跑一遍主干装配 = 为角标再读一遍文档目录）。
   *
   * 缺省 = 整字段没有（旧服务端）→ 六个 Tab 一个角标都不渲染，绝不显示 `0`。
   */
  tabCounts?: {
    trunk?: string
    docs?: string
    dag?: string
    dialogue?: string
    /**
     * 验收 Tab 角标（REQ-261006130057-7a43 FR-8 / interfaces.md T-5）：
     * 待裁决项数（`pending + unverified`，与 `outcome.pendingItems` 同口径、服务端数好）。
     * 无验收单 = 字段缺省（不渲染、禁 `'0'` 冒充）。
     */
    verify?: string
    token?: string
    prompts?: string
  }
  /**
   * 结果与成效（FR-5）：验收结论 + 逐项计数 + 遗留问题与后续。
   *
   * **没有验收单就不给**（`undefined`）——页面走既有的解释性空态（"尚未到验收段 / 结论见文档 Tab"），
   * 绝不写"通过 0 项"（`passed=0` 是"验收单里一项都没通过"这个**事实**，与"没有验收单"是两句话，
   * 见 FR-12 的禁 0 冒充）。
   *
   * 数字全部来自台账 `verification.sheet` 的逐项 `status`（服务端一次数完，前端不重算）：
   *  - `passed` / `failed` = 对应状态项数；
   *  - `pendingItems` = `pending` + `unverified`（都是"还没裁决"；`not_verifiable` 算**已裁决**，
   *    与 domain 的 `isFullyDecided` 同口径，故不进这一桶）；
   *  - `verdict` = **人的裁决**（`verification.decision`）：`pass` / `rework` / 两者都没有（材料已交
   *    但人还没裁）→ `'pending'`。不从逐项结果倒推裁决——"全项通过但人没确认" ≠ "人已确认通过"；
   *  - `leftovers` = 逐项里**没有通过**的项（failed / not_verifiable / pending / unverified）逐条带
   *    原因——台账没有单独的"遗留"字段，能核对的只有验收单，故遗留一律从逐项落，**不编**。
   */
  outcome?: {
    verdict: 'pass' | 'rework' | 'pending'
    passed: number
    failed: number
    pendingItems: number
    leftovers: string[]
  }
}


export interface DocsResponse {
  /**
   * **确定文档**：人写的交付物（`requirement.md` / `design/*.md` / `decomposition.md` /
   * `tasks/*.md` / `verification.md` / `reviews/*.md` / `tests/*.md` / `evidence/*.md`），
   * **全部铺开**（前端不做内层滚动、不折叠成一行）。
   *
   * 口径变更（缺陷修复，不是重构）：这里原来装的是**台账全部产物**——实测 317 条，其中
   * 167 条 `task-detail`（含 83 个被扫进来的 `src/*.ts` 源文件）、141 条 `notes`
   * （84 个 `rtm-implementing/t-*.yml`、44 个 prototype 截图、若干 .txt/.json）。
   * 317 行把一个 Tab 变成倾倒场，读者数不清也读不完；自动扫到的**非交付物**改由 `discovered`
   * 按类型分组给计数（见下），诚实性判据是「`documents.length` + `discovered` 各分组 count 之和
   * == 台账产物总数」——分类只许搬家，不许把东西丢掉。
   */
  documents: DocPanelEntry[]
  /**
   * 生成物（台账 queue.json / RTM 等），与「人写的文档」分开列。
   * `absPath` 与 `DocPanelEntry.absPath` 同规则（REQ-261005143615-5ab1 FR-4）：命中读根才注入。
   */
  generated: { label: string; path: string; absPath?: string }[]
  /**
   * **其它发现**（加法式可选字段）：自动扫描到的非交付物，按后缀/类型分组计数。
   * 每组最多给 3 个 `samples` 路径（样例），其余靠 `count` 说出来——**不折叠成一行、
   * 也不做内层滚动**：读者要能数出"还有多少同类"，而不是只看到一句"还有很多"。
   * 缺省 = 没有额外发现（老服务端 / 干净目录）。
   */
  discovered?: { kind: string; count: number; samples: string[] }[]
  /** 验收单（列照抄现有 verification 的：实际结果 / 来源 / 需人工 / 意见 / 裁决） */
  verification?: VerificationSheet
  gates: GateVerdict[]
  archive?: ArchiveRecord
}


/* ── 端点 4：DAG + 每步执行结果 ───────────────────────────────────────────── */

/** DAG 图数据（`dag-view` 的入参形状；不改画布）。 */
export interface DagGraphNode {
  id: string
  title: string
  parentId?: string
  stageKind?: StageKind
  status: TaskStatus
  dependsOn: string[]
  claimedBy?: string
  layer?: number
  /** 该卡的子卡链没生成（与「手动建卡」区分开） */
  chainMissing?: boolean
  /**
   * 本卡请求预算覆盖值（REQ-261007100513-6749 t1 / FR-6）：与 `TaskRecord.budgetRequests` 同名字段。
   * **可选**：缺省 = 不写该键 = 未覆盖（读端按 `LIMITS.subtaskRequestBudget` 起算），不冒充 0。
   */
  budgetRequests?: number
}


export interface DagResponse {
  tasks: DagGraphNode[]
  steps: DagStep[]
  criticalPath?: string[]
}


/* ── 端点 8：验收 Tab（REQ-261006130057-7a43 FR-8） ─────────────────────── */

/**
 * 验收面板响应（design/interfaces.md §VerifyPanelResponse）。
 *
 * 全部字段可选、缺省即「无该来源」：
 *  - `sheet` 缺省 = 尚未提交验收材料（页面走「尚未提交」空态，禁 0 冒充）；
 *  - `tracking` / `coverage` 是 RTM **增强层**（FR-9）：rtm-*.yml 缺失/解析失败时缺省，
 *    页面降级为逐项平铺 / 覆盖链列整体不渲染——绝不允许因 RTM 缺失让端点报错。
 *
 * 两源对齐（前端 FR 行组装）：`frMap` 给出每 FR 的追溯链，逐项明细从 `sheet.items` 取，
 * 对齐键 = `rtmTraceIdOf(source)`（domain/workflow/AcceptanceSheetSpec.ts 既有单点函数）；
 * `frMap` 缺省时按 `tracking` 的 `fr_id` 归组（降级路径）。
 */
export interface VerifyPanelResponse {
  /** 当前验收单：整份照抄 `req.verification.sheet`（与 docs 面板同源，不重排字段） */
  sheet?: VerificationSheet
  /** 历史验收单（v1/v2…；`req.verification.sheetHistory`） */
  history?: VerificationSheet[]
  /** RTM 验收追踪（读 rtm-accepting.yml 的 acceptance_tracking；形状与 vendor 同源复用） */
  tracking?: AcceptanceTracking[]
  /** 覆盖链（每 FR 三态布尔）：design=fr∈fr_to_design、tasks=fr∈fr_to_tasks、tests=fr∈fr_to_tests */
  coverage?: Record<string, { design: boolean; tasks: boolean; tests: boolean }>
  /**
   * 追溯三映射**原样透出**（REQ-261006130057-7a43 · D-10 返工）：`assembleTraceability()`
   * 的 `TraceabilityProjection` 里 `fr_to_design / fr_to_tasks / fr_to_tests` 三段照抄，
   * **服务端不做 join**——前端据此把验收单逐项归到「每 FR 一行」（行键 = FR 号，
   * 覆盖链 chip 也由"该 FR 出现在哪张映射里"直接得出，见 `client/views/panels/verify.ts`）。
   *
   * 缺省 = 无 RTM 数据（与 `coverage` / `tracking` 同一次降级）：前端退回逐项平铺的老路径。
   * 形状与 stage-overview 投影一致（`TraceabilityProjection` 的这三个键，不另造一套）。
   */
  frMap?: {
    fr_to_design?: Record<string, string[]>
    fr_to_tasks?: Record<string, string[]>
    fr_to_tests?: Record<string, string[]>
  }
  /**
   * FR 名称表（**FR 号 → 名称**，如 `'FR-1' → '头部信息分层与操作区聚类'`）——D-10 返工：
   * 原型 `#tab-verify` 的 FR 列是「编号 + 名称」，服务端按需补上名称这一半。
   *
   * 来源与降级（`application/query/QueryVerify.ts` 的 `frNamesOf`）：读**需求文档**
   * （`docs/requirements/<REQ>/requirement.md`，位置走 `requirementDocPathOf`）里
   * `- **FR-N: 名称**——…` 的标题行，只取冒号后到 `**` 之间的名称（`——` 之后的内容是说明，不算名称）。
   *
   * 三条纪律：
   *  - **缺省 = 没解析出**（文档读不到 / 文档读端口未装配 / 文档里没有这种标题行）；
   *  - **只包含能解析出的 FR**——不许为没解析到的 FR 编一个名称，也不许用 FR 号兜底；
   *  - 绝不抛：文档读失败在这里与"没有名称"是同一个结果（前端退回「只渲染编号」）。
   */
  frNames?: Record<string, string>
  /** 材料摘要（交付结论 + 证据清单），来自 `req.verification` 提交材料 */
  materials?: { summary?: string; evidence: string[] }
  /** 待裁决项数（pending + unverified；与 `tabCounts.verify` 同源同值） */
  pendingCount?: number
}


/**
 * 批量推进的逐项结果（I-1，design/data-model.md §逐项结果与树摘要类型）。
 *
 * 字段名新建但**码名不新造**：`code` 逐字透传既有拒绝码
 * （`invalid_transition` / `REQBOARD_*` 系列），让看板与排障口径不分叉。
 * 顺序契约 = 与入参 `tasks[]` 一致（调用方按下标对账，不必自己按 id 找）。
 */
export interface TaskMoveItemResult {
  task_id: string
  ok: boolean
  from?: TaskStatus
  to?: TaskStatus
  status?: TaskStatus
  version?: number
  /** 失败时：既有拒绝码（逐字透传，不新造码）。 */
  code?: string
  error?: string
  /** 该项撞节流时（ok=false）：剩余毫秒，调用方据此等待或改做他事（不靠 sleep 试探）。 */
  throttleRemainingMs?: number
}


/**
 * 树节点投影（I-1 回执 `tree.parents[].parent` / `.subtasks[]`）。
 *
 * **为什么在协议层再声明一份**：`TaskTreeSummary` 必须复用 `TaskTree` 的节点形状
 * （两套渲染口径必然分叉），而本文件**禁止** import `application/use-cases/**`
 * （use-cases 反向 import 本文件，会成环）。故这里按
 * `src/application/use-cases/TaskTree.ts` 的 `TaskTreeNodeView` **逐字镜像**：
 * 字段名、可选性、字面量取值一字不差。
 *
 * **防漂移**：`tests/contract-types.test.ts` 拿 `TaskTreeView['parent']` 做
 * `toEqualTypeOf` 双向断言——任何一侧改字段/改可选性，测试当场编译报错。
 */
export interface TaskTreeNodeView {
  id: string
  title: string
  status: string
  role: 'parent' | 'subtask' | 'legacy'
  stageKind?: string
  dependsOn: string[]
  attempt?: number
  lastRunOk?: boolean
  reportSummary?: string
  cardDoc: string
  /** 卡片体量声明；**未声明 = 缺键**（不硬造、不冒充 0）。 */
  footprint?: CardFootprint
  /** 声明状态——**恒在场**的派生字段（`footprint` 有没有）。 */
  footprintState: 'declared' | 'undeclared'
}


/** 树摘要（I-1）：只取**一层**（父卡 + 其子卡链）；节点逐字复用 `TaskTreeNodeView`。 */
export interface TaskTreeSummary {
  parents: Array<{
    parent: TaskTreeNodeView
    subtasks: TaskTreeNodeView[]
    note: string
  }>
}
