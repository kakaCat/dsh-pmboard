/**
 * 项目看板 client 类型 —— 与 host /dashboard/api/reqboard 响应对齐。
 * 字段形状来自 shared/protocol.ts（host 落库记录的原样投影）。
 *
 * @module dsh-pmboard/client/types
 */
import type { ArtifactKind, StageArtifact, StageKind } from '../shared/protocol.ts'

// 产物/节点键等跨端共享类型复用 protocol 的单一定义（client 不另抄一份）。
export type { ArtifactKind, StageArtifact, StageKey, StageKind } from '../shared/protocol.ts'

// -- 需求 -----------------------------------------------------------------

export type RequirementStatus =
  | 'draft' | 'brainstorming' | 'design' | 'decomposing' | 'implementing'
  | 'accepting' | 'done' | 'archived' | 'canceled'

export type RequirementCategory = 'feature' | 'bug' | 'doc' | 'refactor' | 'spike' | 'chore'

export interface ActorRef { kind: 'human' | 'agent' | 'system'; sessionId?: string }

export interface CommentRecord { id: string; body: string; createdAt: number; createdBy?: ActorRef }

/**
 * 状态事件（时间线）：需求/任务每次进入某状态的记录。
 * inferred=true 表示升级前老记录由 createdAt + 评论反推的**回填**事件（非原始记录）。
 */
export interface StatusEvent {
  status: string
  at: number
  by: ActorRef
  reason?: string
  inferred?: boolean
}

/** 计划任务条目（plan mode：拆分前就定死的粒度） */
export interface PlanTask {
  key: string
  title: string
  description?: string
  phase?: TaskPhase
  side?: TaskSide
  dependsOn?: string[]
  acceptance?: string
}

/** 拆分计划：提交 → 人批准/退回；未批准不允许拆分 */
export interface PlanRecord {
  path: string
  summary: string
  tasks: PlanTask[]
  submittedAt: number
  submittedBy: ActorRef
  approvedAt?: number
  approvedBy?: ActorRef
  rejectedAt?: number
  rejectedReason?: string
}

/**
 * 验收覆盖记录（REQ-a8d582 FR-4）：与 shared/protocol.ts 同形，client 侧独立声明。
 * 挂在需求级：无材料通过时没有 verification 对象可挂。
 */
export interface AcceptanceOverride {
  at: number
  by: ActorRef
  detail: string
  failed: number
  pending: number
  noMaterials: boolean
}

/** 验收材料（agent 提交）+ 人工审核结论 */
export interface VerificationRecord {
  summary: string
  evidence: string[]
  submittedAt: number
  submittedBy: ActorRef
  /** 验收单（REQ-2e9473 t14/W6 逐项确认） */
  sheet?: VerificationSheet
  sheetHistory?: VerificationSheet[]
  reviewedAt?: number
  reviewedBy?: ActorRef
  decision?: 'pass' | 'rework'
  reviewNote?: string
}

/** 验收单单项（逐项裁决）。 */
export interface VerificationItem {
  id: string
  /** 来源（v5 判别联合）：需求级 / 具体任务 */
  source: { kind: 'requirement' } | { kind: 'task'; taskId: string }
  criterion: string
  evidence: string[]
  /**
   * 五项状态（与 `domain/workflow/AcceptanceSheetSpec.ts` 的 `SheetItemLike.status` 同域）：
   * `not_verifiable`（不可验收，须带原因）自 REQ-308b9a 起、`unverified`（点了通过却没结果）自
   * REQ-261001154450-b918 起就在台账里——本类型此前只写三值，是**陈旧口径**：
   * 旧实现有 `evidence[0]` 兜底、`unverified` 几乎不可达，所以一直没暴露；
   * REQ-261006092213-4f5b FR-6 去掉兜底后它成为常见值，客户端必须能如实判它（未复核＝不放行）。
   */
  status: 'pending' | 'passed' | 'failed' | 'not_verifiable' | 'unverified'
  opinion?: string
  decidedAt?: number

  /** REQ-261001184609-cecb FR-1/FR-3：实际结果与「需人工确认」标记（看板展示用） */
  result?: string
  resultSource?: 'agent' | 'human'
  needsHuman?: boolean
  humanReason?: string
}

/** 验收单（版本化，可挂起/续验）。 */
export interface VerificationSheet {
  version: number
  items: VerificationItem[]
  generatedAt: number
  reworkOnly?: boolean
}

/** 归档文档条目 */
export interface ArchiveDoc {
  kind: 'requirement' | 'plan' | 'verification' | 'retro' | 'notes'
  path: string
}

/** 归档材料（agent 准备）+ 归档结论（人） */
/** 归档对项目说明书（金字塔 L1/L2）的更新点 */
export interface ManualUpdate {
  path: string
  section: string
  summary: string
}

export interface ArchiveRecord {
  dir: string
  docs: ArchiveDoc[]
  mergedInto: string[]
  indexEntry: string
  manualUpdates?: ManualUpdate[]
  manualNote?: string
  submittedAt: number
  submittedBy: ActorRef
  // REQ-261006123819-3af3 FR-3（D-2）：客户端镜像字段同步删除（服务端 protocol.ts 已删）。
  // 归档时刻的判据在服务端（archivedMomentOf + 归档门读数），客户端不再自己判。
  /**
   * 清单对账结果（REQ-261004183621-de3f FR-5）；缺省 = 本功能上线前归档的存量记录
   * （看板显示「未对账」而不是 0——**0 ≠ 未对账**）。
   */
  reconcile?: {
    gate: string
    listed: string[]
    exempted: Array<{ path: string; rule: string }>
    unlisted: string[]
    acknowledged: Array<{ path: string; reason: string }>
    at: number
  }
  /** 清单补录留痕（只追加；缺省 = 从未补录）。 */
  amendments?: Array<{ docs: ArchiveDoc[]; reason: string; at: number; by: ActorRef }>
}

/**
 * 需求席位（REQ-261004210128-283d FR-2）：客户端本地最小声明。
 *
 * 为什么本地再写一份而不是 import host 的 `WindowSeat`：client 半**不 import host 模块**
 * （否则打包会把 host 代码带进浏览器包，见 render/dom-utils.ts 的同款说明）。
 * 服务端 `/state` 下发的摘要里本就带 `seats`（`summarize()` 有则带），这里只是把读端类型补齐。
 */
export interface ClientWindowSeat {
  /** 席位窗口（= root agent id = session id） */
  windowKey: string
  role: 'owner' | 'worker' | 'observer'
  joinedAt: number
}

export interface RequirementRecord {
  id: string
  title: string
  description: string
  category?: RequirementCategory
  /** 需求级工作区根（REQ-260929210741-30ae FR-6，与 shared/protocol.ts 同形）：产物相对此根落盘 */
  workspaceRoot?: string
  docLinks?: { requirement?: string; ui?: string; proposal?: string; extras?: Array<{ label: string; path: string }> }
  status: RequirementStatus
  blocked: boolean
  blockedReason?: string
  paused?: boolean
  /**
   * 自动链开关（REQ-4842fe FR-12）：true=自动链运行中；false=暂停（失败/熔断/人工关闭）；
   * **缺省 = 未开启**（存量需求读出即旧行为，看板据此标 [手动]）。
   */
  autoRun?: boolean
  /** 推进事件运行状态（停滞计数 / 暂停原因 / 事件历史；缺省 = 未跑过自动链） */
  advance?: {
    lockAt?: number
    history?: unknown[]
    noopStreak?: number
    failureStreak?: number
    pausedReason?: string
    /** 当前运行 ID（后台任务标识） */
    runId?: string
    /** 当前正在执行的子卡 ID */
    currentSubtaskId?: string
    /** 当前步骤索引（checkpoint） */
    stepIndex?: number
    /** 最后心跳时间（ms timestamp） */
    heartbeatAt?: number
  }
  /**
   * host 推进锁持有时刻（ms）——**扁平键**（不是 `advance.lockAt`）：`/state` 摘要把台账的
   * `advance.lockAt` 投影成它（REQ-261005213603-eaed FR-2）。**缺省 = 没有 run 在跑**（缺失 ≠ 0）。
   *
   * 语义与刷新：run 投递前认领时写入，run 在跑期间每 30s 心跳续租，run 结束 finally 清除；
   * 看板据此点亮运行圈（新鲜 = `now - advanceLockAt < LIMITS.advanceLockStaleMs`）。
   */
  advanceLockAt?: number
  reviewSessionId?: string
  /** 立项来源窗口（agent 会话 id，如 session-<uuid>；人工建卡不填）——窗口↔需求关联锚点 */
  sourceSessionId?: string
  /**
   * 需求席位（REQ-261004210128-283d FR-2）：**有值即权威**（与 host `seatsOf` 同口径）；
   * 缺省 = 存量需求 → 读端折算为单 owner（`sourceSessionId`）。运行中指示据此判定「这条需求在不在跑」。
   */
  seats?: ClientWindowSeat[]
  archivePath?: string
  /** 已登记产物（五道人工确认门的判定输入；缺省=未登记，见 shared/protocol.ts） */
  artifacts?: StageArtifact[]
  /**
   * 卡面产物门读数（REQ-261006175040-12d4 FR-1/FR-2/FR-3）：由**服务端**算好随摘要下发。
   *
   * 客户端只渲染、不判定（D-2）。**缺省 = 读数不可得**（旧服务端未下发）⇒ 门相关块整块不渲染，
   * 不得退化成「缺失」（FR-6：本次缺陷就是把读不到渲染成了缺失）。
   */
  gates?: GateReading[]
  /** 计划状态（FR-5）：缺省 = 无计划记录（该 chip 无「缺失」态，故与不可得在渲染上同形）。 */
  planState?: 'pending' | 'approved' | 'rejected'
  /** 归档材料是否已备（FR-5）：缺省 = 不可得。 */
  archivePrepared?: boolean
  /** 拆分计划（plan mode） */
  plan?: PlanRecord
  /** 验收材料（提交+人工审核结论） */
  verification?: VerificationRecord
  /** 覆盖式通过留痕（REQ-a8d582 FR-4）：缺省 = 无覆盖 */
  acceptanceOverride?: AcceptanceOverride
  /** 归档材料（准备+归档结论） */
  archive?: ArchiveRecord
  /**
   * 最近一次回退留痕（REQ-261005122915-9f90 t6 / FR-5）——看板「清理误物化重做卡」入口的
   * 渲染条件与序号来源：**没有它就没有「第几次回退」这个边界**，不给点了必被拒的假按钮。
   * 与 host `RollbackMark` 同形的**只读子集**（看板只读这三项，其余字段不在此投影）。
   */
  rollback?: {
    /** 从哪个阶段退回 */
    from?: RequirementStatus
    /** 退回到哪个阶段（`to === status` 即「当前处在回退态」） */
    to?: RequirementStatus
    /** 第几次回退；缺省 = 存量记录（从未记过次数）→ 读端按 1 计 */
    seq?: number
    reason?: string
  }
  /** 状态事件时间线（创建 + 每次转移） */
  statusHistory?: StatusEvent[]
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}

// -- 任务 -----------------------------------------------------------------

export type TaskStatus =
  | 'todo' | 'in_progress' | 'integrating' | 'testing' | 'in_review' | 'done' | 'canceled'

export type TaskPhase = 'doc' | 'ui' | 'analysis' | 'implement' | 'test' | 'review' | 'merge'
export type TaskSide = 'frontend' | 'backend' | 'fullstack' | 'doc'

export interface ExecutionRecord {
  id: string
  sessionId?: string
  trigger: 'manual' | 'auto'
  startedAt: number
  endedAt?: number
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  evidence?: string[]
}

export interface TaskRecord {
  id: string
  requirementId: string
  title: string
  description: string
  phase: TaskPhase
  side: TaskSide
  dependsOn: string[]
  scope: { apis: string[]; tables: string[]; files: string[] }
  acceptance: string
  context: string
  /** 自足任务卡文档路径（有值 = DAG 画布上单击该卡可打开；2026-09-29 裁定 F 恢复旧分层列表行为） */
  cardDoc?: string
  skipIntegration?: boolean
  /** 有值 = 子卡（指向父卡 id）；父卡不存子卡列表，由 parentId 反查（单一事实源） */
  parentId?: string
  /** 子卡阶段（子卡必填；父卡/存量卡不得有） */
  stageKind?: StageKind
  /** 失败重跑次数（缺省 0） */
  attempt?: number
  /** 显式声明的子卡段：`[]` = 本卡不落链（solo）；缺省 = 未指定走映射（卡片层契约 2026-09-28） */
  stages?: StageKind[]
  /** 计划改动的文件路径列表（写集；用于并行调度冲突检测） */
  filesPlanned?: string[]
  status: TaskStatus
  blocked: boolean
  blockedReason?: string
  claimedBy?: string
  claimedAt?: number
  executions: ExecutionRecord[]
  /** 状态事件时间线（甘特图按状态分段着色） */
  statusHistory?: StatusEvent[]
  comments: CommentRecord[]
  version: number
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  updatedBy: ActorRef
}

// -- 看板数据 -------------------------------------------------------------

/**
 * 需求**摘要**（B12 阶段⑥-① / REQ-261002161439-277d t-05a56b）——`GET /state` 首屏只下发它。
 *
 * 与 `RequirementRecord`（全文）分开：本体（comments/artifacts/verification/plan/archive）不再随首屏下发，
 * 进入详情时用 `GET /requirements/:id` 取全文。计数用 commentCount/artifactCount（计数，不是本体）。
 */
export interface RequirementSummary {
  id: string
  title: string
  status: RequirementStatus
  blocked: boolean
  createdAt: number
  updatedAt: number
  version: number
  commentCount: number
  artifactCount: number
  category?: RequirementCategory
  paused?: boolean
  autoRun?: boolean
  sourceSessionId?: string
  /** 需求席位（REQ-261004210128-283d FR-2）：与 `RequirementRecord.seats` 同义；缺省 = 折算单 owner。 */
  seats?: ClientWindowSeat[]
  workspaceRoot?: string
  docBasePath?: string
}

export interface BoardState {
  revision: number
  /**
   * ⚠️ B12 阶段⑥-①（t-05a56b）**收尾项**：服务端已只下发摘要，本字段应为 `RequirementSummary[]`；
   * 放宽即级联 200+ 处（见 `ReqCard.req` 注释）⇒ 单列一张卡做类型分层重构。
   * **运行时已核实安全**：`state.requirements` 仅 8 处引用、无一读 comments/artifacts/verification/plan/archive。
   */
  requirements: RequirementRecord[]
  tasks: TaskRecord[]
  /** 需求 id → ready 任务 id 列表（host 派生） */
  ready: Record<string, string[]>
  /** REQ-a33899：需求 id → 累计 token（无快照的需求不出现该键；缺失 ≠ 0） */
  tokenTotals?: Record<string, number>
  /** REQ-260922012924-2e29 FR-4：服务端工作区根（绝对路径；旧服务端无此字段 → 客户端降级相对解析） */
  workspaceRoot?: string
  /** FR-4：服务端 homeDir（~ 缩写显示用） */
  homeDir?: string
  /**
   * 会话工作区（REQ-261003215944-9e04 FR-11）：无需求段的相对路径用它绝对化。
   * 缺省 = 旧服务端（不含该字段）→ 回落 workspaceRoot，行为与改动前一致。
   */
  sessionWorkspaceRoot?: string
  /**
   * 本次读根来源（FR-11）：session=按会话解析成功；legacy-cwd=回落插件宿主目录。
   * 前端不判分支，只用于诊断与"为什么打不开"的解释。
   */
  docsRootSource?: 'session' | 'legacy-cwd'
}

/** 需求卡片在泳道列上的紧凑投影（视图层用，避免全量渲染） */
export interface ReqCard {
  /**
   * ⚠️ B12 阶段⑥-①（t-05a56b）**收尾项**：本字段应为 `RequirementSummary`（卡面只需摘要）。
   * 实测放宽后会**级联**到 artifacts 等视图（73 处 ⇒ 234 处），说明这是"列表/详情类型分层"重构，
   * 不是签名批量替换 ⇒ 单列一张卡做。运行时已核实安全（首屏只读摘要字段）。
   */
  req: RequirementRecord
  tasks: TaskRecord[]
  doneCount: number
  totalCount: number
  readyIds: string[]
  blocked: boolean
  /** REQ-a33899：累计 token；undefined = 无快照（不渲染徽章，也不显示 0） */
  tokenTotal?: number
}

/**
 * 门读数（REQ-261006175040-12d4 FR-1/FR-2）：与 `shared/board-summary` 的出口逐字同形。
 *
 * `count` = 该 kind 的产物条数（design 即份数）——卡面「确认产物（全部 N 份）」的 N 取自它，
 * 这样客户端就不必为了数份数去读 `artifacts`（那正是本次缺陷的成因）。
 */
export interface GateReading {
  kind: ArtifactKind
  status: 'confirmed' | 'pending' | 'missing'
  count: number
}
