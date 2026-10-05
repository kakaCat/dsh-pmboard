/**
 * Reqboard 共享协议：两级状态机（需求 7 主态 + 任务 6 主态）、闸门规则、
 * 任务 DAG 校验、记录形状与落库校验。host 与 client 共用本文件（零依赖）。
 *
 * 设计来源：RFC 014（agent-dh/docs/rfcs/014-requirement-board.md）。
 * 协议闸哲学沿用 dsh-taskboard：人工闸门是代码级拒绝，不是提示词约定。
 *
 * @module dsh-pmboard/shared/protocol
 */

// ---------------------------------------------------------------------------
// 领域规则的唯一实现处迁至 src/domain/**（REQ-47939a t2）
// ---------------------------------------------------------------------------
// 本文件继续作为 host 与 client 共用的事实契约枢纽，但状态机 / 可证伪验收 / 产物规约的
// **数据与判定**不再在这里定义，而是从 domain 单向再导出——客户端渲染"下一步可推进哪"
// 与宿主判定用同一份表，消除"前端口径与后端口径漂移"（architecture.md §2 注释）。
// 规则常量与类型从 domain 再导出后，既有 20 个引用方的 import 路径保持不变。
import type { ActorKind, ActorRef } from '../domain/actor.js'
import type { MainStageKey, RequirementStatus, StageKey } from '../domain/requirement/RequirementStatus.js'
import type { TaskStatus } from '../domain/task/TaskStatus.js'
import type { RequirementCategory } from '../domain/requirement/Requirement.js'
import type { ArtifactKind, ArchiveDoc, ArchiveDocRule } from '../domain/artifact/ArtifactSpec.js'
// 依赖传递归约（零 import 纯函数）：计划任务表的 depends_on 同样只保留**直接前置**。
import { transitiveReduce } from '../domain/queue/transitiveReduction.js'
// RTM 验收追踪的**唯一声明处**在 vendor（type-only 引用：编译期擦除，不进运行时不增依赖）。
// VerificationSheet.rtmTracking 是 RTM 增强层快照，直接复用该形状，避免在协议层再抄一份造成漂移。
import type { AcceptanceTracking } from '../../vendor/reqboard/src/types/rtm.js'

// ---------------------------------------------------------------------------
// 提示词难度级别（用于注入不同复杂度的提示词）
// ---------------------------------------------------------------------------

/** 提示词难度级别：控制注入到系统提示词中的指导复杂度 */
export type PromptDifficulty = 'simple' | 'standard' | 'advanced' | 'expert'

/** 所有提示词难度级别 */
export const ALL_PROMPT_DIFFICULTIES: readonly PromptDifficulty[] = ['simple', 'standard', 'advanced', 'expert']

/** 难度级别说明 */
export const PROMPT_DIFFICULTY_DESCRIPTIONS: Readonly<Record<PromptDifficulty, string>> = {
  simple: '简单 - 基础提示，适合快速任务',
  standard: '标准 - 平衡的提示，适合大多数场景（推荐）',
  advanced: '进阶 - 详细提示，适合复杂需求',
  expert: '专家 - 完整提示，包含所有细节和最佳实践'
}
import {
  REQ_TRANSITIONS,
  HUMAN_ONLY_REQ_TRANSITIONS,
  SYSTEM_REQ_TRANSITIONS,
  canReqTransition,
  assertReqTransition,
  agentNextActions,
} from '../domain/requirement/RequirementStatus.js'
import {
  TASK_TRANSITIONS,
  HUMAN_ONLY_TASK_TRANSITIONS,
  SYSTEM_TASK_TRANSITIONS,
  canTaskTransition,
  assertTaskTransition,
} from '../domain/task/TaskStatus.js'
import { checkAcceptance, checkPlanTaskReferences } from '../domain/task/Acceptability.js'
// 计划任务表的需求条款引用（REQ-261002164800-d8f2 FR-2）：判定单点在 domain，协议层只搬运。
import { normalizeRequirementRefs } from '../domain/task/RequirementRefs.js'
import { assertFootprintFloor, normalizeFootprint } from '../domain/task/Footprint.js'
import type { CardFootprint } from '../domain/task/Footprint.js'
import type { StageKind } from '../domain/task/SubtaskTemplate.js'
import { resolvePlanStages } from '../domain/task/SubtaskTemplate.js'
import type { TaskRole } from '../domain/task/TaskStatus.js'
import type { VerificationItemSource } from '../domain/workflow/AcceptanceSheetSpec.js'
import {
  ALL_ARTIFACT_KINDS,
  STAGE_ARTIFACT_REQUIREMENTS,
  ARTIFACT_CONFIRM_GATES,
  ARCHIVE_DOC_RULES,
} from '../domain/artifact/ArtifactSpec.js'

// 类型再导出（保持既有 import 路径）
export type { ActorKind, ActorRef }
export type { MainStageKey, RequirementStatus, StageKey }
export type { TaskStatus }
export type { RequirementCategory }
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

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 状态事件（时间线）
// ---------------------------------------------------------------------------

/**
 * 一次状态进入事件（时间线的原子单位）。需求与任务共用形状。
 *
 * 为什么必须有它：此前记录上只有 createdAt/updatedAt 两个时间戳，「需求分析/拆分/实施/
 * 验收/归档发生在什么时候、每一段停留多久」在台账里根本不存在——看板问"需求没有
 * 对应的时间"时无法回答，也无法做停留时长/流程瓶颈分析。状态事件让时间成为一等
 * 数据：每次转移写入一条 {status, at, by, reason}。
 *
 * inferred=true 表示该条为**历史回填**（升级前的老记录没有事件表，由 createdAt +
 * 评论里的转移留痕逐条反推），不是当时真实记录的事件——UI 必须显式标注，避免把
 * 推导值当成原始数据（R-013：数据来源与时点必须可核验）。
 */
export interface StatusEvent {
  status: string
  at: number
  by: ActorRef
  reason?: string
  /** true=从历史评论/时间戳反推的回填事件（非原始记录）。 */
  inferred?: boolean
  /**
   * 写时 token 快照（REQ-a33899）：进入该状态时**执行会话**的累计 token。
   * 有了它才能算「这个节点花了多少」= 进入快照 → 离开快照之差（同 sessionId 才相减）。
   * 缺省 = 当时未取到（如人从看板点按钮推进）→ UI 显示「无快照」，禁止补 0。
   */
  tokenSnapshot?: TokenSnapshot
}

/**
 * 就地追加一条状态事件（相邻同状态去重；返回被写入的事件）。
 * tokenSnapshot（REQ-a33899）：可选写时快照；去重命中时也会补写到已存在事件上。
 */
export function recordStatus(
  record: { statusHistory?: StatusEvent[] },
  status: string,
  at: number,
  by: ActorRef,
  reason?: string,
  tokenSnapshot?: TokenSnapshot,
): StatusEvent {
  const history = (record.statusHistory ??= [])
  const last = history[history.length - 1]
  if (last !== undefined && last.status === status && last.at === at) {
    if (tokenSnapshot !== undefined && last.tokenSnapshot === undefined) last.tokenSnapshot = tokenSnapshot
    return last
  }
  const event: StatusEvent = {
    status,
    at,
    by,
    ...(reason !== undefined && reason.length > 0 ? { reason } : {}),
    ...(tokenSnapshot !== undefined ? { tokenSnapshot } : {}),
  }
  history.push(event)
  return event
}

/** 某状态首次进入的时间（未进入过 → undefined）。 */
export function milestoneAt(record: { statusHistory?: StatusEvent[] }, status: string): number | undefined {
  return record.statusHistory?.find(e => e.status === status)?.at
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

// REQ_TRANSITIONS / HUMAN_ONLY_REQ_TRANSITIONS / SYSTEM_REQ_TRANSITIONS 迁至
// domain/requirement/RequirementStatus.ts（REQ-47939a t2），本文件顶部再导出。

/**
 * 会话 id → 窗口码（人类可读的短标识）。规则与 DSH 窗口编码一致：
 * `session-<uuid>` → `w-<uuid 前 8 位>`（如 session-1cee2467-95f9-… → w-1cee2467）。
 * 非标准 id 原样前缀截断，保证看板永不显示空标识。
 */
export function windowCodeFromSessionId(sessionId: string): string {
  const raw = sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : sessionId
  const head = raw.split('-')[0] ?? raw
  return `w-${head.slice(0, 8)}`
}

// canReqTransition / assertReqTransition 迁至 domain/requirement/RequirementStatus.ts（t2）。

// 用户可见文案单点（REQ-47939a 返工）：弹框选项/徽章此前 host 与 client 各写一份会静默漂移，
// 现由 domain/text/labels.ts 单点定义、此处再导出给 client 复用。
export {
  ACCEPT_ITEM_OPTIONS, FINAL_PASS_LABEL, FINAL_DECLINE_LABEL,
  ITEM_STATUS_BADGE, DEFAULT_CONFIRM_OPTIONS,
} from '../domain/text/labels.js'
import { LIMITS } from '../domain/limits.js'
import { fmt } from '../domain/text/fmt.js'

// ---------------------------------------------------------------------------
// Task 状态机（RFC 014 §4）
// ---------------------------------------------------------------------------

// TaskStatus 类型与状态机迁至 domain/task/TaskStatus.ts（REQ-47939a t2）。

export const MAIN_TASK_STATUSES: readonly TaskStatus[] = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'done',
]

export const ALL_TASK_STATUSES: readonly TaskStatus[] = [...MAIN_TASK_STATUSES, 'canceled']

// TASK_TRANSITIONS / HUMAN_ONLY_TASK_TRANSITIONS / SYSTEM_TASK_TRANSITIONS /
// canTaskTransition / assertTaskTransition 迁至 domain/task/TaskStatus.ts（t2），顶部再导出。

// ---------------------------------------------------------------------------
// Task 分类字段
// ---------------------------------------------------------------------------

/** 流水线阶段。 */
export type TaskPhase = 'doc' | 'ui' | 'analysis' | 'implement' | 'test' | 'review' | 'merge'
export const ALL_TASK_PHASES: readonly TaskPhase[] = ['doc', 'ui', 'analysis', 'implement', 'test', 'review', 'merge']

/** 端侧：前端/后端/全栈/纯文档。frontend/backend 默认需要联调。 */
export type TaskSide = 'frontend' | 'backend' | 'fullstack' | 'doc'
export const ALL_TASK_SIDES: readonly TaskSide[] = ['frontend', 'backend', 'fullstack', 'doc']

/**
 * reqboard_submit 的提交类型（工具 kind 入参）。注意 'design' 与需求状态同名但**不是**状态，
 * 不参与状态判定；定义放 shared 层是因为适配层（tools/http）禁止出现状态名字面量（layer-boundary 门禁）。
 */
export type SubmitKind = 'requirement' | 'plan' | 'verification' | 'archive' | 'design'
export const SUBMIT_KINDS: readonly SubmitKind[] = ['requirement', 'plan', 'verification', 'archive', 'design']

/** 该 side 默认是否需要联调（建卡未显式标 skipIntegration 时生效）。 */
export function defaultNeedsIntegration(side: TaskSide): boolean {
  return side === 'frontend' || side === 'backend'
}

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
}

export interface StageTaskExecution extends StageTaskRef {
  claimedBy?: string
  executions: ExecutionRecord[]
}

export interface DraftStageBody { title: string; category?: RequirementCategory; description: string; sourceWindow?: string; createdAt?: number }
export interface BrainstormStageBody { requirementDoc?: string; reviewSessionId?: string; comments: CommentRecord[] }
/** 设计文档交付状态（REQ-81aabd FR-2）：设计节点逐份显示已交/未交，不参与闸门。 */
export interface DesignDocStatus {
  /** 文件名（如 architecture.md） */
  name: string
  /** 工作区相对路径（如 docs/requirements/REQ-x/design/architecture.md） */
  path: string
  /** 需求目录里是否已登记该文件（已交） */
  submitted: boolean
  /** 条件必交标记（REQ-2d1c74 FR-1）：仅在需求声明对应端侧（sides）时必交 */
  conditional?: 'frontend' | 'backend'
  /** 豁免理由（REQ-2d1c74 FR-1）：有值 = 该份经 front-matter design_exempt 豁免，不计入缺失 */
  exempted?: string
}

/**
 * 设计文档逐份登记态（T-3，REQ-260924213231-b1c4 / I-1/I-2 / FR-1）。
 *
 * 与 `DesignDocStatus`（已交/未交，设计节点展示用）的区别：本投影把**磁盘 / 产物簿 / 确认章**
 * 三源合成一行，供 `reqboard_submit(kind=design)` 返回体与 `reqboard_status` 逐份上报——
 * 让 agent 不打开看板也能读出「未登记（磁盘有、产物簿无） / 待确认（已登记未落章） / 已落章」。
 * 派生投影，**不落盘**：每次查询按目录扫描 + `RequirementRecord.artifacts` 现算。
 */
export interface DesignDocRegistration {
  /** 文件名（如 architecture.md） */
  name: string
  /** 工作区相对路径（如 docs/requirements/REQ-x/design/architecture.md） */
  path: string
  /** 磁盘上是否真实存在（目录扫描结果） */
  on_disk: boolean
  /** 产物簿是否有该条（stage=design 且 kind=design 且 path 命中） */
  registered: boolean
  /** 是否已落章（`StageArtifact.confirmedAt !== undefined`） */
  confirmed: boolean
  /** 有效豁免理由（requirement.md front-matter design_exempt） */
  exempted?: string
  /** 条件必交标记（仅声明了对应端侧时必交） */
  conditional?: 'frontend' | 'backend'
}

// ── 追溯与覆盖度投影（REQ-260926140539-457b FR-6） ─────────────────────────
// 数据源是 canonical RTM YAML（tools/reqboard/src/rtm 产出），由 host 侧
// stage-overview/assembler.assembleTraceability() 读盘后挂到节点 body 上，供看板
// 「🔗 追溯」Tab 渲染。**全部可选**：RTM 缺失时字段不出现，前端按"无追溯数据"降级
// （FR-9：RTM 是增强层，不得因其缺失而打断详情渲染）。

/** 三级追溯链投影（fr→设计→任务→测试，含跨级推导）。 */
export interface TraceabilityProjection {
  /** FR → 设计章节 */
  fr_to_design?: Record<string, string[]>
  /** 设计章节 → 任务 */
  design_to_tasks?: Record<string, string[]>
  /** FR → 任务（跨级） */
  fr_to_tasks?: Record<string, string[]>
  /** 任务 → 测试用例 */
  task_to_tests?: Record<string, string[]>
  /** FR → 测试用例（跨级） */
  fr_to_tests?: Record<string, string[]>
}

/** 设计覆盖度（有设计章节服务的 FR / FR 总数）。 */
export interface DesignCoverageProjection {
  total: number
  covered: number
  uncovered: string[]
  /** 百分比（0-100），不是 0-1 小数。 */
  rate: number
  total_frs?: number
  covered_frs?: number
}

/** 实施覆盖度（有任务实现的设计章节 / 设计章节总数）。 */
export interface ImplementationCoverageProjection {
  total: number
  covered: number
  uncovered: string[]
  rate: number
  total_designs?: number
  covered_designs?: number
}

/** 测试覆盖度（有测试用例覆盖的任务 / 任务总数）。 */
export interface TestingCoverageProjection {
  rate: number
  total?: number
  covered?: number
  uncovered?: string[]
  total_tasks?: number
  tested_tasks?: number
  untested?: string[]
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
export interface DoneStageBody { completedAt?: number; verificationDecision?: 'pass' | 'rework' }
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

// 阶段提示词键与常量表迁至 domain/stage/StagePromptSpec.ts（REQ-47939a t9），此处再导出。
export type { StagePromptKey } from '../domain/stage/StagePromptSpec.js'
export { ALL_STAGE_PROMPT_KEYS } from '../domain/stage/StagePromptSpec.js'

/** 执行方式提示：该任务该换上下文执行（handoff 意图落成数据）。 */
export type ExecutorHint = 'fresh-window' | 'subagent' | 'current'
export const ALL_EXECUTOR_HINTS: readonly ExecutorHint[] = ['fresh-window', 'subagent', 'current']

export function asExecutorHint(raw: unknown): ExecutorHint | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string' || !(ALL_EXECUTOR_HINTS as readonly string[]).includes(raw)) {
    bad('executorHint 必须是：' + ALL_EXECUTOR_HINTS.join(', '))
  }
  return raw as ExecutorHint
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
   * 卡片体量声明（REQ-261002175818-80a8 t2 / FR-1、FR-7）：`{ files, anchors, chars }`。
   *
   * 缺省 = **未声明**（存量计划与旧台账都是这个形状）：不判定、不报错、**不冒充 0**。
   * 声明口径落在 domain（`domain/task/Footprint.ts`）：形状校验与「不得小于 implementation
   * 点到的路径数」都在那里单点实现，本层只负责**搬运**——不搬就是静默丢弃，
   * 本仓已在 `stages` 与 `requirement_refs` 上各栽过一次。
   */
  footprint?: CardFootprint
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

/**
 * 验收覆盖记录（REQ-a8d582 FR-4）：人在"已知有不合格项 / 尚无验收材料"的前提下坚持通过时，
 * 必须留下这笔可查记录。
 *
 * 为什么挂在**需求级**而不是 verification 里：无材料通过时根本没有 verification 对象，
 * 挂在它上面这一半情形就写不进去（同一事实两处存必然漂移）。可选字段：旧台账缺省即"无覆盖"。
 */
export interface AcceptanceOverride {
  at: number
  by: ActorRef
  /** 覆盖说明原文（前端装配，含计数与不合格项摘要） */
  detail: string
  /** 通过时验收单里的"不通过"项数（无验收单时记 0） */
  failed: number
  /** 通过时验收单里的"未裁决"项数（无验收单时记 0） */
  pending: number
  /** 通过时是否完全没有验收材料 */
  noMaterials: boolean
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

/** 下游待同步标记（REQ-2e9473 t19/W8）。 */
export interface DocSyncPending {
  /** 变更源（'requirement' | 'plan'） */
  source: string
  /** 待同步的下游产物种类（'plan' | 'decomposition'） */
  downstream: string[]
  /** 变更原因（人读） */
  reason: string
  at: number
}

// ArchiveDoc 类型迁至 domain/artifact/ArtifactSpec.ts（t2），顶部再导出。

/**
 * 归档材料（agent 准备）+ 归档结论（人拍板）。
 *
 * 用户要求「归档 要有项目文档设计，文档如何合并，不同问题如何记录文档」：
 * 归档不是把目录挪走，而是**把这次需求的产出并进项目文档**——需求目录里留全套原始
 * 材料（需求/计划/验收/复盘），同时把"别人以后要读的那部分"合并进
 * docs/architecture|guides|adr|research|known-issues 等既定文档，并写一条索引条目。
 * 不同需求类型（category）的必填文档与合并去向由 ARCHIVE_DOC_RULES 规定，
 * 规范文档：agent-dh/docs/architecture/requirement-archive.md。
 */
/**
 * 归档对**项目说明书**（金字塔 L1）的更新点。
 *
 * 用户要求「归档后应该是金字塔模型，是项目的一个说明书，agent 可以通过这个更了解项目」：
 * 归档不只是留证据，而是让项目认知**自下而上生长**——L3 证据（需求档案）→ L2 领域篇
 * （architecture/guides/adr/rfcs）→ L1 说明书（docs/architecture/project-manual.md）。
 * 改变了项目级认知的需求，必须在归档材料里申报它更新了说明书的哪一节。
 */
export interface ManualUpdate {
  /** 被更新的说明书/领域篇路径（L1 或 L2） */
  path: string
  /** 章节标题 */
  section: string
  /** 一句话：这一节现在多了什么认知 */
  summary: string
}

/**
 * 归档清单**对账结果**（REQ-261004183621-de3f t1 / design/data-model.md）。
 *
 * 为什么存字段而不只写评论：评论是留痕（给人读），字段是查询面（看板/接口不必解析自然语言）。
 * 集合不变量（单测主断言）：`listed ∪ exempted.path ∪ unlisted` = 目录内文件全集，且两两不相交。
 */
export interface ArchiveReconcile {
  /** 当次生效的闸门（如实记录，便于事后解释"为什么这次没拦/拦了"）。 */
  gate: 'enforce' | 'warn'
  /** 已列（= 归档清单 `docs[].path`）。 */
  listed: string[]
  /** 命中豁免规则的文件与规则 id（`rtm-*.yml` / `queue.json` / `state/*` 等工具重建物）。 */
  exempted: Array<{ path: string; rule: string }>
  /** 未列（事实：既没进清单、也没命中豁免）。 */
  unlisted: string[]
  /** 显式豁免声明（处置：Agent 在 `unlisted_ack` 里写了理由的那些，`path ⊆ unlisted`）。 */
  acknowledged: Array<{ path: string; reason: string }>
  at: number
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
  archivedAt?: number
  archivedBy?: ActorRef
}

/** 计划是否已被批准（拆分的代码级前置条件）。 */
export function planApproved(req: { plan?: PlanRecord }): boolean {
  return req.plan !== undefined && req.plan.approvedAt !== undefined
}

// VACUOUS_ACCEPTANCE / VERIFIABLE_ANCHOR 与可证伪判定迁至
// domain/task/Acceptability.ts（REQ-47939a t2）：checkAcceptance(key, acceptance)。

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
      ...(requirementRefs.length > 0 ? { requirement_refs: requirementRefs } : {}),
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

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface CommentRecord {
  id: string
  body: string
  createdAt: number
  createdBy?: ActorRef
}

export interface ExecutionRecord {
  id: string
  sessionId?: string
  trigger: 'manual' | 'auto' // auto = 编排器派发
  startedAt: number
  endedAt?: number
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  /** 证据路径（测试输出/review 报告等，相对需求目录） */
  evidence?: string[]
  /** 本次执行的 token 消耗（REQ-a33899）：开工/完工两次快照与差值；缺省=无快照。 */
  tokenUsage?: ExecutionTokenUsage
  /**
   * 本次执行的产出条目数（REQ-261004110201-f253 FR-2）= filesChanged.length + completed.length。
   * 缺省 = 未知（改造前的历史执行未记录）——**缺省不参与零产出统计**（宁可漏报不误报）。
   */
  outputCount?: number
  /** 零产出标记（FR-2）：outputCount === 0 时为 true；缺省 = 未知（读侧不计入零产出）。 */
  zeroOutput?: boolean
}

// RequirementCategory 类型迁至 domain/requirement/Requirement.ts（t2），顶部再导出。
export const ALL_REQ_CATEGORIES: readonly RequirementCategory[] = ['feature', 'bug', 'doc', 'refactor', 'spike', 'chore']

export function asReqCategory(raw: unknown): RequirementCategory {
  if (typeof raw !== 'string' || !(ALL_REQ_CATEGORIES as readonly string[]).includes(raw)) {
    bad(`需求分类必须是：${ALL_REQ_CATEGORIES.join(', ')}`)
  }
  return raw as RequirementCategory
}

// ---------------------------------------------------------------------------
// 推进事件（REQ-4842fe FR-11 / design/interfaces §4、design/observability §1）
// ---------------------------------------------------------------------------

/**
 * 推进事件类型（一次事件 = 需求上的一小步）。
 *
 * `DISPATCH_FAILED`（REQ-261002173819-69c7 FR-1/FR-2）：后台任务**投递失败**——没有 run 在跑，
 * `autoRun` 保持 true，重试应当立刻可行。为什么不复用 `PAUSE`：`PAUSE` 的语义是"链已暂停、
 * autoRun 置 false"，复用会让人在台账上看到"链已暂停"的假象。
 */
export type AdvanceEvent = 'OPEN_PARENT' | 'RUN_SUBTASK' | 'FINALIZE_PARENT' | 'ROLLUP' | 'RETRY' | 'PAUSE' | 'DISPATCH_FAILED'
  // REQ-261003203909-55f2 FR-2：manual 段（人工核对）不派 workflow run——生成核对清单后停链等人
  // （同 DISPATCH_FAILED 的口径：autoRun 保持 true，人补完核对记录后链即续跑；不是「链已暂停」）。
  | 'AWAIT_MANUAL'

/** 一次推进事件的留痕（台账 `advance.history[]`；看板与排障消费）。 */
export interface AdvanceRecord {
  at: number
  requirementId: string
  event: AdvanceEvent
  parentId?: string
  subtaskId?: string
  /** noop = 事件被触发但台账无变化（重复触发 / 无 ready 卡），连续 noop 计入停滞熔断 */
  outcome: 'ok' | 'failed' | 'skipped' | 'noop'
  durationMs: number
  /** 一句话：做了什么、为什么停 */
  detail: string
  /** 同一驱动批次的标识（REQ-261003222428-3556 FR-2）：同批并行事件共享，事后可还原「这批是一起跑的」。可选，旧数据无此键。 */
  batchId?: string
}

/** 需求级推进运行状态（单飞锁 + 历史 + 停滞计数）。 */
export interface AdvanceState {
  /** 单飞锁持有时间；超过 stale 阈值视为持有者已死，可被接管 */
  lockAt?: number
  /** 单飞锁持有者的 run id（REQ-260925110957-552d 投递模型的幂等键） */
  runId?: string
  /** 事件历史（append-only） */
  history?: AdvanceRecord[]
  /** 连续 noop 计数（达阈值触发停滞熔断） */
  noopStreak?: number
  /** 连续失败计数（达阈值触发熔断告警） */
  failureStreak?: number
  /** 上次暂停原因（fail / stagnation / manual） */
  pausedReason?: string
}

/**
 * 断点记录（T-1，REQ-260924213231-b1c4 / FR-6 / I-8）。
 *
 * 同一需求只保留**一个**对象（后写覆盖前写），避免「两份真相」。写入源三选一：
 *   A 交棒用例尾部 `stampCheckpoint`（reason="checkpoint"；stage/pendingAction 两字段未变则**不写**）
 *   B `Dive 会话驱动器`（原 CaptureHook）的 `turn/end`（reason="error:<code>:<message>" / "aborted:<cause>" / "interrupted"）
 *   B′ `reqboard_note_interruption(reason)` 工具兜底
 * 字段缺失（存量记录）= 无断点：续跑输入包不渲染「## 断点」节，逐字节保持旧输出。
 */
export interface InterruptionRecord {
  /** 中断/检查点时间戳（ms） */
  at: number
  /** 中断原因原文；交棒检查点写 "checkpoint" */
  reason: string
  /** 断点时的流水线阶段（RequirementStatus 之一） */
  stage: string
  /** 未完成动作（下一步工具命令），如 `reqboard_ask_confirm(target=artifact, kind=design)` */
  pendingAction: string
  /** 最后成功调用的工具名（可缺省） */
  tool?: string
}

/** 挂起确认的后台作答结果（T-4；`reqboard_confirm_receipt` 与后台落章回填用）。 */
export interface PendingConfirmationOutcome {
  confirmed: boolean
  advanced: boolean
  userChoice?: string
  userFeedback?: string
}

/**
 * 挂起确认（T-4，REQ-260924213231-b1c4 / FR-3 / I-3/I-4）——**内存**态，不落盘。
 *
 * 产生：`reqboard_ask_confirm` 超过宽限窗口仍未作答（返回 `pending:true` + `ticket`，**不判失败**）；
 * 消费：人作答后由后台落章 + 推进，agent 凭 `ticket` 调 `reqboard_confirm_receipt` 取回执
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

/** 挂起确认 ticket 前缀（T-4 契约）：实现生成 ticket 时必须以此为前缀。 */
export const PENDING_CONFIRM_TICKET_PREFIX = 'pc-'

/**
 * Dive 模式状态（REQ-260925212722-96e7）：需求自动续跑与阶段控制。
 *
 * Dive 模式让需求在 implementing 阶段自动执行任务，无需人工输入"继续"。
 * 借鉴 DSH Goal 的 phase + activation 模式，但独立实现以适配需求流水线的多阶段特性。
 */
export interface RequirementDive {
  /**
   * 执行相位。**REQ-261001213924-1441 FR-5 起降级为读侧兼容字段**：
   * 新代码不再写它，可驱动的判定改看 activation + driverHealth（见 isDrivableRequirement）。
   * 保留只为让旧台账与旧读取者（看板投影）有一版过渡。
   */
  phase: 'idle' | 'active' | 'paused'
  
  /**
   * **人的意图**：armed=要它自动跑，disarmed=我要手动。
   *
   * FR-5 纪律（REQ-261001213924-1441）：**只有人能改写它**——立项置 armed、reqboard_clear_pause 置 disarmed。
   * 任何运行时故障（投递失败/检查点失败/agent 错误/回合上限）一律只写 driverHealth，**不得**把它改成 disarmed。
   * 修前这是"一次异常 = 该需求永久没有自动化"的根因。
   */
  activation: 'armed' | 'disarmed'

  /**
   * **运行时健康**（FR-5）：只有驱动侧能改。故障停下等人，而不是改写人的意图、也不是终态锁死。
   */
  driverHealth?: RequirementDriverHealth

  /** 最近一次成功唤醒（投递成功或准入成功）的时间戳 ms——心跳对账的判据（FR-4）。 */
  lastWakeAt?: number

  /**
   * 存量迁移印章（FR-8）：非空 = 这条记录已按新契约归一，迁移不再重复处理。
   * 为什么不用「看起来像没迁过」反推：旧记录与新记录可能形态相同（比如都是 armed+active），
   * 只有一个显式印章才能保证幂等。
   */
  migratedAt?: number
  
  /** 当前阶段已执行的回合数（仅「真正进入 history 的回合」才 +1） */
  roundsInStage: number
  
  /** 每阶段最大回合数限制（历史字段；上限权威来源是 stage-configs 的 maxRounds） */
  maxRoundsPerStage?: number
  
  /** 当前子阶段（如 implementing 中的具体任务） */
  currentStage?: string
  
  /** 暂停原因（阻塞时记录，clear_pause 清除） */
  pausedReason?: string
  
  /** 最后活跃时间（Unix 时间戳 ms） */
  lastActiveAt?: number
}

/**
 * 运行时健康（REQ-261001213924-1441 FR-5）——与"人的意图"（activation）分家的另一半。
 *
 * 语义：healthy=可继续驱动；paused=**停下来等人**（不是终态——人确认推进 / 看板「继续」即恢复）。
 * 三个字段都进台账，好让"这条需求为什么不动了"在任务外也看得见、说得清。
 */
export interface RequirementDriverHealth {
  state: 'healthy' | 'paused'
  /**
   * 结构化原因前缀（便于看板分组与人读）：
   * round-limit:<stage> / wake-undeliverable / checkpoint-failed / queue-failed / driver-failed /
   * agent-error / aborted / max-tokens / prompt-rejected
   */
  reason?: string
  /** 进入当前 state 的时间戳 ms。 */
  since?: number
  /** 连续唤醒失败次数（成功即归零；达上限进 paused）。 */
  attempts?: number
}

/**
 * Dive 自动续跑回合消息的来源标识（REQ-260926215013-1568 FR-10）——机器可识别，是
 * pre-step 不变量守卫的锚点：只有 `source` 逐字段相等**且**内容与登记逐字相等的回合消息
 * 才被认领；任何不一致者被拒并留痕（防旧 revision 的回合混入）。
 *
 * 刻意只做**包内结构类型**（不扩展 @deepseek-ai/dsh-llm 的 MessageSourceMap）：
 * 本包依赖树解析不到 dsh-llm，且 application 层禁 @deepseek-ai/* import（层边界门禁）。
 */
export interface DiveRoundSource {
  kind: 'dive'
  /** 归属需求 */
  requirementId: string
  /** 预留时的需求 revision（乐观锁栅栏） */
  revision: number
  /** 预留的回合号 = roundsInStage + 1（严格 > 0） */
  round: number
}

/** 判定任意 source 是否为 Dive 回合来源（非对象 / kind 不符 / round 非正数 → false）。 */
export function isDiveRoundSource(source: unknown): source is DiveRoundSource {
  if (typeof source !== 'object' || source === null) return false
  const s = source as { kind?: unknown; requirementId?: unknown; revision?: unknown; round?: unknown }
  return s.kind === 'dive'
    && typeof s.requirementId === 'string' && s.requirementId.length > 0
    && typeof s.revision === 'number' && Number.isFinite(s.revision)
    && typeof s.round === 'number' && Number.isFinite(s.round) && s.round > 0
}

/**
 * 需求席位（REQ-261003215944-9e04 FR-2）——一条需求可以有多个窗口参与，**owner 唯一**。
 *
 * 为什么新增而不是改 `sourceSessionId`：后者是 39 条存量需求的唯一锚点，也是「立项来源窗口」
 * 的审计字段，改名要动全仓读点。故两者并存：
 *   · `seats` 有值 → 以它为权威；
 *   · `seats` 缺省 → 读端**折算**为 `[{ windowKey: sourceSessionId, role: 'owner', joinedAt: createdAt }]`
 *     （见 `application/internal/window.ts` 的 `seatsOf`）。
 * 折算只发生在读端、**不写盘**：删掉折算即回到改前行为（存量零迁移、不 bump schemaVersion）。
 */
export interface WindowSeat {
  /** 席位窗口（= root agent id = session id；见 adapters/SessionProbeAdapter.ts 的 windowKey） */
  windowKey: string
  /** owner 唯一且不可被解绑；worker 可领卡干活；observer 只读 */
  role: 'owner' | 'worker' | 'observer'
  /** 入席时间（Unix 时间戳 ms——与既有 createdAt / lastActiveAt 字段同形） */
  joinedAt: number
  /** 最近一次活动（Unix 时间戳 ms；**展示用，不参与授权**——避免"活跃度即权限"的隐式规则） */
  lastSeenAt?: number
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
   * 需求级工作区根（REQ-260929210741-30ae FR-6）：立项时选定，绝对路径。
   * 该需求的所有文件操作（docs/queue/产物登记/任务卡文档）以此根拼接相对路径。
   * undefined = 存量需求 → 解析链落到会话 header.cwd。
   * 一经落库不可变；非法值（非绝对路径/目录已删）读侧降级到会话 cwd + warn。
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
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}

/** task_report 的结构化摘要（done 凭证门读取）。 */
export interface TaskReportSummary {
  at: number
  reportIndex: number
  filesChanged: string[]
  completed: string[]
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

export interface TaskScope {
  /** 涉及接口（如 POST /dashboard/api/board/solve） */
  apis: string[]
  /** 涉及数据表 */
  tables: string[]
  /** 涉及文件/目录 */
  files: string[]
}

/**
 * 卡片修订记录（REQ-4842fe FR-15，design/data-model §6）。
 *
 * 为什么需要它：返工回上游时用户裁定"就地更新旧卡 + 留痕"（不重建、不置 canceled）——
 * 没有修订记录，看板上就只能看到"卡变了"，看不到"为什么变、谁改的、改了哪几个字段"。
 * append-only：只增不改（INV-6），时间戳单调。
 */
export interface CardRevision {
  at: number
  by: ActorRef
  /** update=返工就地更新 / rollback=子卡失败回退 / reopen=done 卡被人工重开 */
  kind: 'update' | 'rollback' | 'reopen'
  /** 触发原因（哪次失败 / 哪条需求描述变更 / 人工重开理由） */
  reason: string
  /** 字段级变更摘要，如 ["acceptance: ...", "attempt: 0→1"] */
  changes: string[]
}

/** 一次子卡 workflow run 的结果证据（REQ-4842fe t5 / design/data-model §4 第③项）。 */
export interface TaskRunEvidence {
  at: number
  /** stopReason === completed */
  ok: boolean
  stopReason: string
  /** realm 物化后的产出非空（不是 null/undefined/空对象） */
  valueNonEmpty: boolean
  /** 失败原因（ok=false 时） */
  reason?: string
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
   * 卡片体量声明（REQ-261002175818-80a8 t2 / FR-7）：与计划层（`PlanTask.footprint`）逐字一致。
   * 旧台账无此字段 = **未声明**（回显「未声明」，不当成 0）；本字段可缺省，故不 bump schemaVersion。
   */
  footprint?: CardFootprint
  skipIntegration?: boolean
  status: TaskStatus
  blocked: boolean
  blockedReason?: string
  claimedBy?: string
  claimedAt?: number
  executions: ExecutionRecord[]
  /** 状态事件时间线（创建 + 每次转移一条；甘特图据此按状态分段着色） */
  statusHistory?: StatusEvent[]
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

// C1（REQ-47939a t10）：账本契约版本 4 → 5。改的是**契约版本常量**，不是读路径兼容分支——
// 迁移后文件里写的就是 5，常量必须与之一致，否则 load 会把 5 报告成 4、并在下一次写盘时把
// 版本回退（迁移成果被静默抹掉）。⚠️ 运行时**不自动迁移**（见 design/migration.md §5）：
// v4 台账仍可载入（字段缺失处按可选处理），迁移由人工跑 scripts/migrate-ledger.ts 完成。
//
// REQ-260927202051-f6df t6：8 → **9**，并把 `tasks` 从台账**移除**（任务迁往
// `docs/requirements/<REQ>/queue.json`，读方端口 = TaskStore）。
// ⚠️ 这一次不是"再升一个号"那么轻：**读兼容从"宽容"翻转为"拒绝"**——v8（含 tasks）台账
// 会被运行时**拒绝加载**并抛 `LEDGER_REQUIRES_MIGRATION`。理由见 design/architecture.md：
// 静默丢弃 600+ 条任务、看板直接空白是最坏结果；宁可启动失败并指向迁移脚本。
// 因此 v9 与读方改造（t7~t10）必须**同批上线**，中间不得发版（v9 台账 + 旧读方 = 界面空白）。
export const REQBOARD_SCHEMA_VERSION = 9

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

// ---------------------------------------------------------------------------
// ID 生成（需求ID含时间戳，其他ID保持随机hex格式）
// ---------------------------------------------------------------------------

/** 格式化时间戳为 YYMMDDHHmmss（2位年份，精确到秒）。 */
function formatTimestamp(date: Date = new Date()): string {
  const YY = date.getFullYear().toString().slice(-2)
  const MM = (date.getMonth() + 1).toString().padStart(2, '0')
  const DD = date.getDate().toString().padStart(2, '0')
  const HH = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')
  const ss = date.getSeconds().toString().padStart(2, '0')

  return `${YY}${MM}${DD}${HH}${mm}${ss}`
}

export function newRequirementId(rand: () => number = Math.random): string {
  const timestamp = formatTimestamp()
  const random4 = Math.floor(rand() * 0xffff).toString(16).padStart(4, '0')
  return `REQ-${timestamp}-${random4}`
}

export function newTaskId(rand: () => number = Math.random): string {
  return `t-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`
}

export function newExecutionId(rand: () => number = Math.random): string {
  return `e-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`
}

export function newCommentId(rand: () => number = Math.random): string {
  return `c-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// 入参校验（routes/tools 共用；非法输入抛 code=invalid_input）
// ---------------------------------------------------------------------------

function bad(message: string): never {
  throw Object.assign(new Error(message), { code: 'invalid_input' })
}

export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') bad('title 必须是字符串')
  const t = raw.trim()
  if (t.length === 0) bad('title 不能为空')
  if (t.length > LIMITS.titleMax) bad('title 超长（≤' + LIMITS.titleMax + ' 字符）')
  return t
}

export function normalizeText(raw: unknown, field: string, max: number = LIMITS.textMax): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') bad(`${field} 必须是字符串`)
  const t = raw.trim()
  if (t.length > max) bad(`${field} 超长（≤${max} 字符）`)
  return t
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

export function asTaskPhase(raw: unknown): TaskPhase {
  if (typeof raw !== 'string' || !(ALL_TASK_PHASES as readonly string[]).includes(raw)) {
    bad(`任务 phase 必须是：${ALL_TASK_PHASES.join(', ')}`)
  }
  return raw as TaskPhase
}

export function asTaskSide(raw: unknown): TaskSide {
  if (typeof raw !== 'string' || !(ALL_TASK_SIDES as readonly string[]).includes(raw)) {
    bad(`任务 side 必须是：${ALL_TASK_SIDES.join(', ')}`)
  }
  return raw as TaskSide
}

export function asActor(raw: unknown): ActorKind {
  if (raw !== 'human' && raw !== 'agent' && raw !== 'system') bad('actor 必须是 human/agent/system')
  return raw
}

export function asScope(raw: unknown): TaskScope {
  const arr = (v: unknown, field: string): string[] => {
    if (v === undefined || v === null) return []
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) bad(`scope.${field} 必须是字符串数组`)
    return (v as string[]).map(s => s.trim()).filter(Boolean).slice(0, 50)
  }
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return { apis: arr(obj.apis, 'apis'), tables: arr(obj.tables, 'tables'), files: arr(obj.files, 'files') }
}

export function asDependsOn(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.some(x => typeof x !== 'string')) bad('dependsOn 必须是任务 id 字符串数组')
  return [...new Set(raw as string[])].slice(0, 50)
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
 * 计算 ready 任务：todo 且全部依赖均 done（串行调度器的选择器）。
 */
export function readyTasks(tasks: readonly TaskRecord[], requirementId: string): TaskRecord[] {
  const inReq = tasks.filter(t => t.requirementId === requirementId)
  const doneIds = new Set(inReq.filter(t => t.status === 'done').map(t => t.id))
  return inReq.filter(t => t.status === 'todo' && t.dependsOn.every(dep => doneIds.has(dep)))
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

export interface SubtaskViolation {
  inv: 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4'
  message: string
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
// ---------------------------------------------------------------------------
// Triage（遗留：旧流程「会话捕获待归类建议卡，人工在看板确认」；新流程 2026-09 起
// 改为创建即立项——reqboard_capture 三问弹框作答即确认并直接建 REQ，不再产生
// pending triage。存量 triage 记录保留只读兼容（REQ-260922182505-0924：路由/面板已删，本类型与台账字段冻结不动）。）
// ---------------------------------------------------------------------------

export type TriageStatus = 'pending' | 'confirmed' | 'rejected'

export interface TriageRecord {
  id: string // tri-xxxxxx
  sessionId: string
  /** 会话首条用户消息文本（分类依据） */
  firstMessageText: string
  /** 建议动作 */
  suggestedAction: 'create_req' | 'bind_req' | 'bind_task'
  /** 建议绑定目标 id（REQ-xxx / t-xxx） */
  suggestedTargetId?: string
  /** LLM 建议的需求标题（create_req 时；GUI 可编辑卡预填） */
  suggestedTitle?: string
  /** LLM 建议的需求分类（create_req 时） */
  suggestedCategory?: RequirementCategory
  /** 匹配分数 0-100 */
  score: number
  status: TriageStatus
  createdAt: number
  resolvedAt?: number
  resolvedBy?: ActorRef
  /** 确认后产生的结果需求 id（最近一条；历史见 resultRequirementIds） */
  resultRequirementId?: string
  /** 该窗口全部已立项需求（自动立项史，窗口→需求 n:n 的窗口侧锚点） */
  resultRequirementIds?: string[]
  comments: CommentRecord[]
}

export function newTriageId(rand: () => number = Math.random): string {
  return `tri-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`
}

// 历史回填（parseTransitionTarget / backfill* / migrateRequirementStatusNames）已迁至
// src/domain/legacy/LegacyStatus.ts（REQ-47939a t10）——只由迁移脚本/用例复用；
// 运行时读路径不再做时间线回填与状态名兜底（v5 台账已固化）。

// ---------------------------------------------------------------------------
// 归档文档规范（不同问题如何记录文档 —— 校验的唯一依据）
// ---------------------------------------------------------------------------

// ArchiveDocRule 接口与 ARCHIVE_DOC_RULES 迁至 domain/artifact/ArtifactSpec.ts（t2），
// 顶部再导出（assertArchiveMaterials 仍在本文件消费它）。

/**
 * 需求目录约定（校验用）：docs/requirements/REQ-xxxxxx 或 agent-dh/docs/requirements/REQ-xxxxxx。
 * REQ-260922133212-dd5b BUG-1：兼容两种 id 格式——旧版六位 hex（REQ-f6307c）与 2026-09 起的
 * 时间戳格式（REQ-YYMMDDHHmmss-xxxx = 12 位数字 + 4 位 hex，见 CHANGELOG-req-id-timestamp.md）；其余形态仍拒。
 */
export const REQUIREMENT_DIR_PATTERN = /(?:^|\/)docs\/requirements\/REQ-(?:[0-9a-f]{6}|\d{12}-[0-9a-f]{4})$/

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
    if (u.path.trim().length === 0 || u.section.trim().length === 0 || u.summary.trim().length === 0) {
      bad('说明书更新点必须写全 path / section / summary（哪一份文档、哪一节、多了什么认知）')
    }
  }
}
// ---------------------------------------------------------------------------
// Token 消耗契约（REQ-a33899）
// ---------------------------------------------------------------------------
// 两条独立口径，禁止混用：
//   ① 过程消耗（写时快照，落台账）：节点/任务消耗 = 两次会话快照之差；
//   ② 提示词成本（读时装配，不落台账）：固定系统提示词 / reqboard 注入提示词，
//      只有字符数可测 → 用 TOKENS_PER_CHAR 折算（估算，非 provider 上报）。

/** token 四分桶：与 DSH tokenUsage 投影逐字段对齐（禁止重命名，避免口径漂移）。 */
export interface TokenBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** 全零桶。 */
export function emptyBuckets(): TokenBuckets {
  return { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

/** 逐分量相加。 */
export function addBuckets(a: TokenBuckets, b: TokenBuckets): TokenBuckets {
  return {
    uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

/**
 * 逐分量相减；**负分量截断为 0**。
 * 为什么截断而不是报错：跨会话/快照乱序（会话被重置、投影后到）会产生负差，
 * 此时该段消耗不可知——截断为 0 并由调用方按「无快照」标注，比抛错阻断主流程更合适。
 */
export function subBuckets(a: TokenBuckets, b: TokenBuckets): TokenBuckets {
  const d = (x: number, y: number): number => (x - y > 0 ? x - y : 0)
  return {
    uncachedInputTokens: d(a.uncachedInputTokens, b.uncachedInputTokens),
    outputTokens: d(a.outputTokens, b.outputTokens),
    cacheReadTokens: d(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: d(a.cacheWriteTokens, b.cacheWriteTokens),
  }
}

/** 四桶之和——**展示口径单点**：任何「总 token」都必须走它。 */
export function totalTokens(b: TokenBuckets): number {
  return b.uncachedInputTokens + b.outputTokens + b.cacheReadTokens + b.cacheWriteTokens
}

/**
 * 字符 → token 估算系数（单点）。取 1/4，与 DSH token-meter 的固定密度启发式
 * （CHARS_PER_TOKEN = 4）一致，保证同一段文本在框架侧与本看板侧得到相同估算。
 * 已知偏差：CJK 文本真实密度更高（约 1 token/字），故中文占比高时会**低估**——
 * UI 必须标注「估算」，不得当作 provider 上报值。
 */
export const TOKENS_PER_CHAR = 0.25

/** 字符数 → 估算 token（负数/非有限 → 0；向上取整，与 DSH estimateContent 同口径）。 */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return Math.ceil(chars * TOKENS_PER_CHAR)
}

/** token 数 → 紧凑显示：<1000 原数 / N.Nk / N.NM（非正/非有限按 0）。 */
export function fmtTokens(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0
  if (v < 1000) return String(Math.round(v))
  if (v < 1000000) return (v / 1000).toFixed(1) + 'k'
  return (v / 1000000).toFixed(1) + 'M'
}

/** 金额（人民币）→ ¥N.NN；undefined/null/非有限 → '—'（缺失 ≠ 0）。 */
export function fmtCny(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  return '¥' + n.toFixed(2)
}

/** 写时快照：某会话在某一刻的累计 token（来源可核验；取不到就缺省，不伪造）。 */
export interface TokenSnapshot {
  sessionId?: string
  /** 快照时该会话投影的日志序号（判断两次快照可否相减） */
  seq?: number
  at: number
  totals: TokenBuckets
  /** projection=来自 sessionProjections；unavailable=服务不可得，未取到 */
  source: 'projection' | 'unavailable'

  // ── REQ-261004154937-2ca3（跨会话聚合口径）：以下全为**可选**新字段，旧快照没有它们 ──
  /**
   * 口径：`self` = 只算了本窗口会话（旧行为 / 降级）；`self+descendants` = 已聚合后代子代理会话。
   * 缺席 = 旧快照（按 self 理解，但差值侧要标 legacy）。
   */
  scope?: 'self' | 'self+descendants'
  /**
   * 参与本次合计的成员及其水位（顺序无关；**含 depth:0 的自身**）。
   * 恒等式：`totals === Σ members[].totals`。
   */
  members?: readonly TokenSnapshotMember[]
  /** 取不到用量、因而**未参与合计**的成员 id（缺失 ≠ 0：它们不进 totals，只进这里） */
  degradedMembers?: readonly string[]
  /** 降级原因（服务缺失 / 冷读超预算 / 旧快照） */
  degradedReason?: TokenSnapshotDegradedReason
}

/** 聚合口径下的一个成员会话（REQ-261004154937-2ca3）。 */
export interface TokenSnapshotMember {
  readonly sessionId: string
  /** delegationDepth：0 = 本窗口自身，1 = 直接子代理，≥2 = 孙代理 */
  readonly depth: number
  /** 读数水位（投影缓存 asOfSeq / 日志序号）；缺失 = 该成员两次读数不可比 */
  readonly seq?: number
  readonly totals: TokenBuckets
}

/** 血缘里的一条后代记录（REQ-261004154937-2ca3；`descendantSessions` 的返回项）。 */
export interface SessionLineageEntry {
  readonly sessionId: string
  /** delegationDepth：1 = 直接子代理，≥2 = 孙代理 */
  readonly depth: number
  readonly parentSessionId: string
}

/** 快照/差值的降级原因（REQ-261004154937-2ca3）。 */
export type TokenSnapshotDegradedReason =
  /** 血缘服务（sessionPersistence / sessionProjectionCache）不可得 → 退回只算自身 */
  | 'descendants-unavailable'
  /** 冷读兜底超出预算 → 超出的成员未参与合计 */
  | 'cold-read-budget'
  /** 某成员水位（seq）缺失或不可比 → 该成员不参与本次差值（REQ-261004154937-2ca3 复核段加：
   *  与「冷读超预算」是两回事，不能共用一个标签——否则面板上说的原因会是假的） */
  | 'member-unavailable'
  /** 快照本身不可得（source='unavailable'）→ 差值为空桶（既有语义：缺失不猜） */
  | 'snapshot-unavailable'
  /** 旧快照（无 members）或成员形状不可信参与差值 → 只能退化为总数相减 */
  | 'legacy-snapshot'

/**
 * 当轮上下文压力参考（REQ-261002175818-80a8 t4 / FR-8）——**只读展示，非门禁判据**。
 *
 * 为什么字段全可缺席：DSH token-meter 自述这三个字段是 last-wins 的**非原子**读数，
 * 且 "not a billing or gating input"。任何缺席都表示"这一刻取不到"，**绝不用 0 冒充**——
 * 冒充 0 会让上游把"不可得"当成"余量充裕"来用（同 TokenSnapshot 的纪律；R-013）。
 */
export interface ContextPressureSnapshot {
  at: number
  contextWindow?: number
  pressureTokens?: number
  projectedTokens?: number
  /** projection=来自 sessionProjections；unavailable=服务不可得/形状不符 */
  source: 'projection' | 'unavailable'
}

/**
 * 一张超容量卡（REQ-261002175818-80a8 t5 / FR-4）——给人看的是 key + 批数，
 * 给机器看的是可核算的数值。
 *
 * 为什么**不落库**：判定是"声明的量"算出来的，而声明会随计划重交而变；
 * 落库的判定会立刻过期，形成两处真相（见 design/architecture.md §关键算法）。
 */
export interface OverCapacityItem {
  /** 计划内引用键（如 t1），与批准文本里的 key 同一套 */
  key: string
  /** 卡片标题（批准人不必回查计划） */
  title: string
  /** 合成细节量（展示口径，两位小数） */
  detailUnits: number
  /** 当轮生效的容量 */
  capacity: number
  /** 建议批数（≥2） */
  suggestedBatches: number
  /** 一句话修复指引（按目录 / 按接口切的建议） */
  hint: string
}

/**
 * 判据自述（REQ-261002175818-80a8 t5 / FR-3、FR-4）：容量是**我们的常量**，不是运行时读数。
 *
 * 为什么把它随返回体一起给出：余量参考（contextPressure）是"当轮还剩多少"的只读展示，
 * 与"一张卡要多少"是两码事；不写明判据来源，下一个人很容易拿余量去判容量（FR-8 的边界）。
 */
export interface CapacityNote {
  /** constant=内置常量；config=插件配置覆盖 */
  source: 'constant' | 'config'
  /** 本次生效的容量值 */
  value: number
  /** 是否经过真实数据标定。**本次恒为 false**（校准闭环另立需求） */
  calibrated: boolean
}

/** 需求级聚合（读路径 O(1)）：按节点与合计。 */
export interface RequirementTokenUsage {
  byStage: Partial<Record<StageKey, TokenBuckets>>
  totals: TokenBuckets
  costEstimateCny?: number
  updatedAt: number
}

/** 任务执行级：起止快照与差值。 */
export interface ExecutionTokenUsage {
  start?: TokenSnapshot
  end?: TokenSnapshot
  delta?: TokenBuckets
  costEstimateCny?: number
}

/** 一段提示词的成本（text 仅在需要展示具体内容时携带，可选以免响应膨胀）。 */
export interface PromptPartCost {
  name: string
  chars: number
  estTokens: number
  text?: string
}

/** 固定系统提示词成本（读时装配，每回合都付）。 */
export interface SystemPromptCost {
  perTurnChars: number
  perTurnEstTokens: number
  /** 已知的会话回合数；0 = 不可得（此时不给累计，禁止用 0 冒充累计） */
  turns: number
  /** 仅当 turns > 0 时给出（每回合成本 × 回合数，估算） */
  cumulativeEstTokens?: number
  sections: PromptPartCost[]
  contexts: PromptPartCost[]
  toolsChars: number
  source: 'assembled' | 'unavailable'
}

/** 一次注入的明细。 */
export interface InjectionItem {
  at: number
  stage: string
  routeKey: string
  fragmentIds: string[]
  chars: number
  estTokens: number
  text?: string
}

/** 一条任务执行消耗行（/requirements/:id/token 的下钻数据；REQ-a33899）。 */
export interface TokenExecutionRow {
  taskId: string
  title: string
  status: string
  /** undefined = 两端快照不可得，本次消耗不可算（禁止用单端累计冒充） */
  delta?: TokenBuckets
  start?: TokenSnapshot
  end?: TokenSnapshot
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

/**
 * 需求侧接收标记（GET /requirements/:id/marks 的 data；REQ-d3e61a T-5）。
 *
 * 逐条功能点显示「谁接了 / 还没人接」。**未被接收（红）必须显眼**——R9 之所以能溜过四个节点，
 * 正是因为它在任何界面上都没有"没人接"的痕迹。
 */
export interface RequirementMarksView {
  requirementId: string
  /** 该需求功能点的接收状态（顺序 = 需求文档里的条款顺序） */
  clauses: ClauseMarkRow[]
  /** 未被接收、也未裁剪的条款（红名单）——存在即为 R9 那类缺口 */
  unreceived: string[]
  /** 读数是否可用：需求文档不存在 → false（UI 应显示"无条款数据"，而不是"全部未接收"） */
  available: boolean
}

/** 单条功能点的接收状态（看板渲染用；与 domain 的四态同语义）。 */
export interface ClauseMarkRow {
  clause: string
  /** done=已完成+证据 / received=已被任务接收 / skipped=本轮裁剪 / unreceived=**未被接收（红）** */
  state: 'done' | 'received' | 'skipped' | 'unreceived'
  /** 接收它的任务 id（未接收 → 空数组） */
  by: string[]
}

/** reqboard 注入提示词成本（按阶段聚合 + 明细）。 */
export interface InjectionCost {
  count: number
  chars: number
  estTokens: number
  sharePct?: number
  byStage: PromptPartCost[]
  items: InjectionItem[]
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 需求详情页「工作汇报」：六端点的响应形状（REQ-261004222448-292a t-361f2f）
 *
 * 为什么集中在这里：六个 Tab 各取各的数，形状若不先定死，同一个概念（缺口/文档/执行）
 * 会在头部、文档页、对话页各长一样，前端只能靠猜。本节的类型是**唯一契约**，
 * 后续实现只填肉、不改骨架（改骨架 = 回计划重新批）。
 *
 * 降级纪律：任何一块「读不到」都返回 `Degrade`，**不许用 0 或空数组冒充「没有」**——
 * 「真的没有」与「读不到」是两件事，页面文案也不同（见 FR-12）。
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * 降级原因（四种，各自对应一句人话文案；页面不得把它们混成一句）。
 * - port-unavailable：端口未装配（老版本/未接线）→「不可用（端口未装配）」
 * - file-missing：登记过但文件不在 → 路径划线 +「文件缺失」
 * - ledger-unreadable：台账读不到 →「不可用（台账读不到）」
 * - no-snapshot：没有那次执行的 token 快照 →「无 token 快照」
 */
export type DegradeReason =
  | 'port-unavailable'
  | 'file-missing'
  | 'ledger-unreadable'
  | 'no-snapshot'

/**
 * 统一降级信封：任何只读端点在「读不到」时返回它，而不是抛错或回 0。
 * 判据：`available === false` 即降级，页面**必须**按 `reason` 给不同文案。
 */
export interface Degrade {
  available: false
  reason: DegradeReason
  /** 人话补充（例如具体哪个文件、哪个端口），页面直接展示 */
  note: string
}

/** 正常响应（`available` 缺省即真）与降级响应的联合。 */
export type PanelResult<T> = (T & { available?: true }) | Degrade

/** 类型守卫：判是否为降级信封（前端与用例共用一份，避免各写各的）。 */
export function isDegrade(value: unknown): value is Degrade {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { available?: unknown }).available === false
  )
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

/** 状态带第一格「做到哪了」。 */
export interface ReportProgress {
  stageEnteredAt?: number
  stageStayedMs?: number
  sinceUpdateMs: number
  tasks: {
    total: number
    done: number
    running: number
    todo: number
    subChainDone: number
    subChainTotal: number
  }
}

/** 缺口一条（FR-4）：必须有 what + why + 指得回去的 ref。 */
export interface ReportGap {
  severity: 'red' | 'yellow' | 'gray'
  what: string
  why: string
  ref?: {
    kind: 'clause' | 'artifact' | 'task' | 'confirm'
    id: string
  }
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

/* ── 端点 2：汇报七条（主干） ─────────────────────────────────────────────── */

/** 一条内容的来源：现有实现 / 靠新增文档节 / 本需求新机制。 */
export type TrunkSource = 'doc' | 'ledger' | 'auto' | 'human' | 'new-section'

/** 主干七条的键（与需求文档 FR-1/2/14/15 一一对应）。 */
export type TrunkKey =
  | 'why'
  | 'problem'
  | 'approach'
  | 'scope'
  | 'decision'
  | 'tech'
  | 'highlight'

/** 亮点里的「自动事实」（可计算，永远为真）——不需要人写。 */
export interface TrunkFact {
  label: string
  value: string
  evidence?: string[]
}

/**
 * 亮点里的「人写判断」：必须有证据指针。
 * `evidence` 为空数组 ⇒ 页面渲染「未提供证据（不计入亮点）」——这是**反应付**的机制保证。
 */
export interface TrunkHighlight {
  diff: string
  why: string
  evidence: string[]
}

export interface TrunkItem {
  key: TrunkKey
  source: TrunkSource[]
  /** 2~4 行摘要；空数组 ⇒ 无内容（与 missing 搭配） */
  summary: string[]
  /** 文档没写这一节（**不许编**，页面照实渲染「文档未提供该节」） */
  missing?: 'doc-section-missing'
  /** 「点开原文」/「看往返」等入口 */
  openRefs: { label: string; path?: string; doc?: string }[]
  /** 仅 key='highlight'：自动事实 */
  facts?: TrunkFact[]
  /** 仅 key='highlight'：人写判断（evidence 空 ⇒ 不上桌） */
  highlights?: TrunkHighlight[]
  /** 仅 key='highlight'：成果清单（自动汇总） */
  achievement?: string[]
}

export interface TrunkResponse {
  items: TrunkItem[]
  /** 文档最后更新时间（页面标「文档最后更新于…」，让人知道读到的是哪一版） */
  docLastUpdated?: number
}

/* ── 端点 3：文档 + 核验 + 门禁 ───────────────────────────────────────────── */

export type DocPanelKind =
  | 'requirement'
  | 'design'
  | 'plan'
  | 'task-detail'
  | 'verification'
  | 'retro'
  | 'notes'

/** 文档在页面上的状态（file-missing 必须标灰，不许当正常文档列着）。 */
export type DocPanelState =
  | 'confirmed'
  | 'pending'
  | 'unregistered'
  | 'file-missing'

export interface DocPanelEntry {
  kind: DocPanelKind
  path: string
  registeredAt?: number
  state: DocPanelState
}

/** 门禁裁决留痕（谁批的 / 什么时候 / 用什么方式）。 */
export interface GateVerdict {
  gate:
    | 'requirement'
    | 'design'
    | 'plan'
    | 'implementation'
    | 'verification'
    | 'archive'
  verdict: 'passed' | 'rejected' | 'pending' | 'not-reached'
  /** 三种确认方式各自留痕，便于审计 */
  via?: 'dialog' | 'board' | 'evidence-text'
  at?: number
  by?: ActorRef
  reason?: string
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
  /** 生成物（台账 queue.json / RTM 等），与「人写的文档」分开列 */
  generated: { label: string; path: string }[]
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
}

/**
 * 每步执行结果：字段照抄现有执行记录 + 最近一次汇报。
 * 不新增字段——现成就够（trigger/outcome/error/evidence/attempt + 汇报四要素）。
 */
export interface DagStep {
  taskId: string
  stage: string
  sessionId?: string
  trigger: 'manual' | 'auto'
  startedAt: number
  endedAt?: number
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  evidence: string[]
  attempt: number
  report?: {
    summary: string
    completed: string[]
    filesChanged: string[]
    nextStep?: string
  }
  /** 产出条目数（0 = 零产出执行，页面标黄） */
  outputCount?: number
}

export interface DagResponse {
  tasks: DagGraphNode[]
  steps: DagStep[]
  criticalPath?: string[]
}

/* ── 端点 5：对话一条流 ───────────────────────────────────────────────────── */

/** 系统消息的类型（措辞取台账原文，页面不重新措辞）。 */
export type DialogueSystemEvt =
  | 'stage-advance'
  | 'plan-rejected'
  | 'handoff'
  | 'interrupt'
  | 'confirm-pending'
  | 'verify'

export type DialogueItem =
  | {
      kind: 'human' | 'agent'
      at: number
      windowKey?: string
      text: string
    }
  | {
      kind: 'system'
      at: number
      text: string
      evt: DialogueSystemEvt
      /** 由 createdAt + 评论反推的**回填**事件（页面须打「回填」标，别读成实时发生） */
      inferred?: boolean
    }

export interface DialogueResponse {
  items: DialogueItem[]
  page: { before?: number; hasMore: boolean; total: number }
}

/* ── 端点 6：提示词（装配 + 留痕 + 上下文） ───────────────────────────────── */

/** 系统提示词片段（`text` 是**正文**——页面点开就能读，不给截断预览冒充正文）。 */
export interface PromptSection {
  id: string
  /** file=有独立源文件可打开；shell=路由壳（多片合成，无单独文件） */
  kind: 'file' | 'shell'
  chars: number
  text: string
}

/** 注入留痕一条（含新增字段；旧条目按 unknown/null 降级，**不默认成已投递**）。 */
export interface PromptInjectionRecord {
  at: number
  windowKey: string
  /**
   * 记录点；旧条目缺字段 → unknown。
   *
   * `system-prompt` 是 t-cc7233 实施期**加法式**补的第四个值：`capture-section` 装配每轮
   * 系统提示词时同样写留痕（设计稿只列了三个写入点）。加一个联合成员是向后兼容的扩项——
   * 前端对未知值本就回落「来源未知」，而少了它，这一处的留痕就只能撒谎说自己是别的来源。
   */
  origin: 'gate-h3' | 'dive-node' | 'dive-round' | 'system-prompt' | 'unknown'
  /** null = 旧条目不可知（不许当 true 渲染） */
  delivered: boolean | null
  routeKey?: string
  fragmentIds: string[]
  charCount?: number
  trimmed: string[]
  text?: string
  truncated?: boolean
}

export interface PromptsResponse {
  system: {
    routeKey?: string
    hitLevel?: string
    perTurnChars?: number
    perTurnEstTokens?: number
    sections: PromptSection[]
    /** 被裁片段：同样给正文（回答「它为什么不知道某个术语」） */
    trimmed: { id: string; chars: number; text?: string }[]
    unavailable?: true
  }
  injections: PromptInjectionRecord[]
  context: {
    medianUsagePct?: number
    compressions: number
    policy: string[]
    isolations: {
      at: number
      stage: string
      status: string
      packageChars: number
      reason: string
    }[]
    available: boolean
  }
}

/* ── 端点 7：Token（在现有响应上扩展） ────────────────────────────────────── */

/** 按阶段的 token 行（节点＝阶段；比现有按节点表多「每次调用均」与「缓存命中」）。 */
export interface TokenStageRow {
  stage: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  sharePct: number
  /** 合计 ÷ 调用数（跨阶段可比，用来发现「上下文重复」） */
  perCallTokens: number
  cacheHitPct: number
}

/** 可优化点：**每条必须带依据数字**（不做无凭据的建议）。 */
export interface TokenOptimization {
  title: string
  basis: string
  suggestion: string
}

/** Token 块的可得性三态：快照齐 / 部分（下界）/ 完全不可得。 */
export type TokenAvailability = 'full' | 'partial' | 'none'

/** Token 端点的扩展部分（并入现有响应；`none` 时页面**不得**渲染 0 值表）。 */
export interface TokenPanelExtension {
  byStage: TokenStageRow[]
  optimizations: TokenOptimization[]
  availability: TokenAvailability
  missingStages?: string[]
  boundsAreLowerBound?: boolean
}

