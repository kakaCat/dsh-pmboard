/**
 * RTM YAML 类型契约（REQ-260926140539-457b FR-1）。
 *
 * 本文件是 RTM YAML 基础设施的**唯一类型事实源**：7 个 YAML 文件
 * （rtm-lifecycle + 6 个节点 + rtm-implementing/ 任务详情）的结构、四级追溯映射
 * （FR → 设计 → 任务 → 测试）与三层覆盖度统计全部在此定义，供生成器、解析器、
 * 校验器与 StageOverview 读取器共用。
 *
 * 设计依据：docs/requirements/REQ-260926140539-457b/design/rtm-schema.md、data-model.md。
 *
 * @module @pi-investment/reqboard/rtm/types
 */

/** 流水线阶段（与 dsh-pmboard 状态机一致）。 */
export type RTMStageName =
  | 'draft'
  | 'brainstorming'
  | 'design'
  | 'decomposing'
  | 'implementing'
  | 'accepting'
  | 'done'

/** 节点固定顺序（生成 lifecycle 骨架与判断"当前阶段"用）。 */
export const RTM_STAGE_ORDER: readonly RTMStageName[] = [
  'draft',
  'brainstorming',
  'design',
  'decomposing',
  'implementing',
  'accepting',
  'done',
] as const

/** 阶段状态（lifecycle 文件用）。 */
export type RTMStageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

/** 子任务阶段（implementing 任务详情的 workflow）。 */
export type WorkflowPhase =
  | 'doc'
  | 'ui'
  | 'analysis'
  | 'implement'
  | 'test'
  | 'review'
  | 'commit'

/** 子任务阶段状态。 */
export type WorkflowStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'failed'

/** 完整任务（fullstack）的子阶段顺序。 */
export const FULL_WORKFLOW: readonly WorkflowPhase[] = [
  'doc',
  'ui',
  'analysis',
  'implement',
  'test',
  'review',
  'commit',
] as const

/** 所有 RTM YAML 文件共有的元数据块。 */
export interface RTMMetadata {
  /** 节点名（rtm-<stage>.yml 用）。 */
  stage?: string
  /** 所属需求 id（REQ-xxxxxx）。 */
  requirement_id?: string
  /** 首次生成时间（ISO 8601）。 */
  generated_at?: string
  /** 最后更新时间（ISO 8601）。 */
  last_updated?: string
  /** 版本号：每次写入 +1（FR-6 版本追踪）。 */
  version: number
  /** Schema 版本（lifecycle 用）。 */
  rtm_version?: string
  /** 生成器标识。 */
  generated_by?: string
  /** 任务详情目录（implementing 汇总文件用）。 */
  detail_dir?: string
  /** 本 RTM 文件的**绝对路径**（自定位；调用方不必知道工作区根）。 */
  file_path?: string
  /** 任务详情文件数量（implementing 汇总文件用）。 */
  detail_count?: number
  [k: string]: unknown
}

/**
 * RTM **schema 版本**（REQ-261005105032-3b02 决议 `#18` / `#42`）。
 *
 * 为什么有它：本需求给 RTM 加了 `prototypes` / `decisions` 两节与 `D-x` 引用前缀，属 schema 变更，
 * 读侧要能一眼分辨"新形状"与"存量旧文件"。**键是 `metadata.rtm_version`**——它与
 * `metadata.version`（每次写入 +1 的**计数**，见 file-io.writeRTM）**不是同一个键**，
 * 改 setter 时别改错（data-model.md §6.3 实测记录过这对易混键）。
 */
export const RTM_SCHEMA_VERSION = '2.0'

/** 功能需求点（从 requirement.md 解析）。 */
export interface FR {
  id: string
  title: string
  source: string
  line: number
}

/**
 * 一条原型 FR 锚点（REQ-261005105032-3b02 决议 `#41` / `#49`）。
 *
 * **形状与宿主 `StageArtifact.prototypeMeta.anchors` 的元素逐字一致**——决议 `#49` 明令
 * 「统一用 #41 的字段名，不另立第二套」。本包（vendor/reqboard）是**独立可发布包**，
 * 不得反向 import dsh-pmboard（模块边界见 context.ts 顶部声明），故按决议 `#49` 允许的
 * 第二选法：**注释标明同源**；形状漂移由 `tests/rtm-prototype-sections.test.ts` 的同源断言守住。
 */
export interface PrototypeAnchor {
  /** FR 编号（锚点区块的 `id="FR-N"`）。 */
  fr: string
  /** 原型页面内该锚点区块的选择器/定位串（如 `#FR-3`）。 */
  selector: string
}

/** 几何量单位闭值域（决议 `#5`，与 #41 同源）。 */
export type PrototypeGeometryUnit = 'px' | 'count' | 'ratio'

/** 观测条件里的页面态闭值域（决议 `#5`，与 #41 同源）。 */
export type PrototypeGeometryState = 'inflight' | 'terminal'

/**
 * 一条原型观测量（REQ-261005105032-3b02 决议 `#41` / `#49`）。
 *
 * **形状与宿主 `StageArtifact.prototypeMeta.geometry` 的元素逐字一致**（同源声明见 PrototypeAnchor）。
 * 刻意**不含阈值字段**（D-10）：原型只放观测量名与实测值，阈值属设计决策。
 */
export interface PrototypeGeometry {
  name: string
  value: number
  unit: PrototypeGeometryUnit
  at: { width: number; state: PrototypeGeometryState }
  /** 缺省 `'prototype'`（agent 量原型自身渲染所得），人给的量化值标 `'human'`（决议 `#8`）。 */
  source?: 'prototype' | 'human'
}

/**
 * rtm-brainstorming.yml `outputs.prototypes[]` 一条（REQ-261005105032-3b02 FR-5，data-model §6.1）。
 *
 * 语义：一份原型页面（**不是** `prototypes/INDEX.md`——那是权威清单自身，见决议 `#1`）。
 * `anchors` / `geometry` 的元素形状一律见上面两个接口（#41/#49），本处不另立字段名。
 */
export interface Prototype {
  /** 原型路径（需求目录相对口径，决议 `#2`），如 `prototypes/detail.html`。 */
  path: string
  /** 是否权威版本；同一 `prototypes` 节内**恰好一条** `true`（权威清单 = prototypes/INDEX.md）。 */
  authoritative: boolean
  /** 被取代于（指向权威路径）；`authoritative: true` 时省略。 */
  superseded_by?: string
  /** 服务的 FR 编号；**只放编号引用，锚点不进这里**（§7.3 禁假引用）。 */
  serves: string[]
  /** FR 锚点清单（元素形状见 PrototypeAnchor，#41 同源）。 */
  anchors: PrototypeAnchor[]
  /** 观测量清单（元素形状见 PrototypeGeometry，#41 同源；含 `unit` / `at.state` 闭值域）。 */
  geometry: PrototypeGeometry[]
}

/**
 * rtm-brainstorming.yml `outputs.decisions[]` 一条（REQ-261005105032-3b02 FR-9，data-model §6.2）。
 *
 * 来源 = `requirement.md`「讨论与裁定记录（D-x）」表的逐行投影（FR-8 定的五要素）。
 * RTM 是**只读投影**：本结构不判条目是否有效（那是 `decision-gates.ts` 的门禁职责）。
 */
export interface Decision {
  /** 裁定编号 `D-\d+`（节内唯一）。 */
  id: string
  /** 原话来源（会话消息 id / 时间戳 + 引用原话）。 */
  source: string
  /** 裁定结论。 */
  verdict: string
  /** 影响哪些 FR。 */
  serves: string[]
  /** 可验证判据。 */
  criterion: string
}

/** 设计章节（从 design/*.md 解析）。 */
export interface DesignSection {
  /** 稳定引用，如 design/architecture.md#1.1 */
  ref: string
  title: string
  /** 本章节服务哪些 FR 与 D-x（编号引用，serves 白名单见 §7.1）。 */
  serves: string[]
  /**
   * 本章节引用的**原型锚点原文**（REQ-261005105032-3b02 §7.3，如 `prototypes/x.html#FR-4`）。
   *
   * 为什么单列：锚点是页面内区块的定位符，**不是**"本章节覆盖 FR-4"的声明——混进 `serves`
   * 会让覆盖度虚高（实测 `collectIds('prototypes/x.html#FR-4')` → `['FR-4']`）。
   * 缺省 = 本章节没引锚点（旧文件同样缺该键 = 未采集，不判坏）。
   */
  protoRefs?: string[]
  file: string
  section: string
}

/** 测试用例（从测试文档解析）。 */
export interface TestCase {
  id: string
  title: string
  /** 覆盖哪些任务（covers: t-xxx）。 */
  covers: string[]
  /** 验证哪些 FR（validates: FR-x）。 */
  validates: string[]
  source?: string
}

/** 覆盖度统计（通用四元组）。 */
export interface Coverage {
  total: number
  covered: number
  uncovered: string[]
  /** 0-100 的整数百分比。 */
  rate: number
}

/** 设计覆盖度（FR 视角，额外带 *_frs 字段以对齐 data-model.md）。 */
export interface DesignCoverage extends Coverage {
  total_frs: number
  covered_frs: number
}

/** 实施覆盖度（设计章节视角）。 */
export interface ImplementationCoverage extends Coverage {
  total_designs: number
  covered_designs: number
}

/** 测试覆盖度（任务视角）。 */
export interface TestingCoverage extends Coverage {
  total_tasks: number
  tested_tasks: number
  /** 无测试用例的任务（= uncovered 的语义别名，data-model.md 用这个名字）。 */
  untested: string[]
}

/** 覆盖度门禁裁决结果。 */
export interface GateResult {
  passed: boolean
  stage: string
  coverage: Coverage
  /** 门禁阈值（百分比）。 */
  threshold: number
  message?: string
}

/** 四级追溯映射集合。 */
export interface Traceability {
  fr_to_design?: Record<string, string[]>
  design_to_tasks?: Record<string, string[]>
  fr_to_tasks?: Record<string, string[]>
  task_to_tests?: Record<string, string[]>
  fr_to_tests?: Record<string, string[]>
}

/** 台账中一条任务的**最小只读投影**（生成器只需要这些字段）。 */
export interface RTMTaskLike {
  id: string
  title?: string
  status?: string
  phase?: string
  side?: string
  depends_on?: string[]
  /** 直接实现的设计章节引用。 */
  implements?: string
  /** 服务/覆盖的 FR 列表。 */
  serves?: string[]
  /**
   * 该卡承接的**原型锚点**引用原文（REQ-261005105032-3b02 FR-9，台账 `TaskRecord.prototypeRefs`）。
   * 缺省 = 未采集（无锚点的卡合法，加性零迁移 §10 `#50`）。
   */
  prototypeRefs?: string[]
  /** 该卡承接的 **D-x 裁定**编号（台账 `TaskRecord.decisionRefs`）；缺省 = 未采集。 */
  decisionRefs?: string[]
}

/** rtm-lifecycle.yml 里某个阶段的历史记录。 */
export interface LifecycleStageEntry {
  stage: string
  status: RTMStageStatus
  /**
   * 本需求的分类档案是否启用该节点（false = 档案跳过它，看板标灰"本分类跳过"）。
   * 为什么写进文件：非 feature 分类的档案不含 brainstorming，但 draft 的唯一前向转移就是
   * brainstorming → 需求会被推进一个**自己档案里没有的节点**；把它显式标出来，读者一眼能看见。
   */
  enabled?: boolean
  entered_at?: string
  completed_at?: string
  /**
   * 时间戳为推算值（REQ-260930094139-2d65 FR-4）：statusHistory 事件缺失，
   * entered_at/completed_at 回落 createdAt/updatedAt 时标 true；真实事件时间不出现此键。
   */
  timestamps_inferred?: true
  artifacts?: LifecycleArtifact[]
}

/** lifecycle 阶段下挂的产物留痕。 */
export interface LifecycleArtifact {
  kind: string
  path?: string
  confirmed_at?: string
  approved_at?: string
  count?: number
}

/** rtm-lifecycle.yml（全局生命周期）。 */
export interface RTMLifecycle {
  requirement: {
    id: string
    title: string
    category: string
    created_at: string
    /**
     * 立项绑定窗口（台账 `sourceSessionId` 的投影）——"窗口↔需求"的需求侧锚点。
     * **当前无生产读取方**（如实声明，REQ-260927100007-b8ba FR-12）：Dive 的投递目标取自
     * 台账（round-driver.ts 的 `requirementById(id)?.sourceSessionId`），不读本字段；
     * 本字段仅供人查（看板/文件自查），绑定变更由 `bind` 触发点刷新。缺省 = 未绑定窗口。
     */
    source_session?: string
    /**
     * 需求目录**绝对路径**（`docs/requirements/<REQ>`）。
     * 读这份快照的一方（Dive / 会话节点）不必先知道工作区根在哪就能定位需求目录——
     * 与「立项回执给绝对路径」同一口径（用户反馈过"不知道绝对路径是哪里"）。
     */
    dir?: string
  }
  lifecycle: {
    current_stage: string
    /** 本需求**有多少个节点**（= 分类档案启用的节点数，按 RTM 口径归一）。 */
    stage_count?: number
    /** 本需求的节点清单（顺序 = 流水线顺序；只含启用的）。 */
    stage_list?: string[]
    stages: LifecycleStageEntry[]
  }
  metadata: RTMMetadata
}

/** rtm-brainstorming.yml（需求分析节点）。 */
export interface RTMBrainstorming {
  metadata: RTMMetadata
  outputs: {
    requirements: FR[]
    /**
     * 原型节（REQ-261005105032-3b02 FR-5 #18）。
     *
     * **可选**：生成端恒写；存量 RTM 文件缺该节 = **未采集（pending），不判损坏**（§6.4 宽容度）——
     * 标成必填会让读侧把"旧文件"当"字段必在"用，一读就崩。
     */
    prototypes?: Prototype[]
    /** 裁定节（REQ-261005105032-3b02 FR-9 #18）：同上，缺节 = pending。 */
    decisions?: Decision[]
  }
  status?: {
    artifacts: Array<{
      kind: string
      path: string
      confirmed: boolean
      confirmed_at?: string
    }>
  }
}

/** rtm-design.yml（设计节点）。 */
export interface RTMDesign {
  metadata: RTMMetadata
  inputs: {
    requirements: FR[]
  }
  outputs: {
    design_sections: DesignSection[]
  }
  traceability: {
    fr_to_design: Record<string, string[]>
  }
  coverage: {
    design: DesignCoverage
  }
}

/**
 * rtm-decomposing.yml `task_coverage[]` 一条（REQ-261005105032-3b02 FR-5 / FR-9，data-model §6.4）。
 *
 * 与 `types/rtm.ts` 的 `TaskCoverage`（拆分工具返回的 FR 覆盖视图，字段 `covers_frs`）**同名不同物**：
 * 本条目只承载两维**新编号**——该卡承接的原型锚点与 D-x，来源与 `TaskRecord.prototypeRefs` /
 * `decisionRefs` 同源（决议 `#36`），不重复 FR 覆盖（那仍在 `traceability` / `coverage` 里）。
 */
export interface DecomposingTaskCoverage {
  task_id: string
  /** 该卡承接的原型锚点引用原文；字段缺失 = 未采集 ⇒ 空数组（不编造）。 */
  covers_prototypes: string[]
  /** 该卡承接的 D-x 编号；字段缺失 = 未采集 ⇒ 空数组（不编造）。 */
  covers_decisions: string[]
}

/** rtm-decomposing.yml（拆分节点）。 */
export interface RTMDecomposing {
  metadata: RTMMetadata
  inputs: {
    requirements: FR[]
    design_sections: DesignSection[]
  }
  outputs: {
    tasks: Array<{
      id: string
      title: string
      implements: string
      serves: string[]
      depends_on: string[]
      phase: string
      side: string
    }>
  }
  /**
   * 每张卡的承接清单（REQ-261005105032-3b02 FR-5 / FR-9，data-model §6.4）。
   * **可选**：生成端恒写；存量文件缺该节 = pending，不判损坏（同 `prototypes` / `decisions`）。
   */
  task_coverage?: DecomposingTaskCoverage[]
  traceability: {
    design_to_tasks: Record<string, string[]>
    fr_to_tasks: Record<string, string[]>
  }
  coverage: {
    implementation: ImplementationCoverage
  }
}

/** 任务详情文件里的一个子阶段记录。 */
export interface WorkflowStep {
  phase: WorkflowPhase
  status: WorkflowStatus
  started_at?: string
  completed_at?: string
  skip_reason?: string
  steps_completed?: Array<{ action: string; output?: string; files_changed?: string[]; commit?: string }>
}

/** rtm-implementing/t-xxx.yml（单任务详情）。 */
export interface RTMTaskDetail {
  task: {
    id: string
    title: string
    status: string
    implements: string
    serves: string[]
    depends_on: string[]
    phase: string
    side: string
    workflow_params: Record<string, string>
    workflow_total: number
    workflow_done: number
    workflow: WorkflowStep[]
  }
  metadata: RTMMetadata
}

/** rtm-implementing.yml（实施汇总，轻量）。 */
export interface RTMImplementing {
  metadata: RTMMetadata
  inputs: {
    tasks: Array<{ id: string; title: string; status: string }>
  }
  status: {
    tasks_total: number
    tasks_done: number
    tasks_in_progress: number
    tasks_todo: number
  }
  tasks: Array<{ id: string; status: string; [k: string]: unknown }>
}

/**
 * rtm-accepting.yml `outputs.acceptance_items[]` 一条（REQ-261005105032-3b02 FR-7）。
 *
 * 形状照决议 `#37` 的 `VerificationItemSource` 载荷 + interfaces.md「验收单项接口」表：
 * 判据逐字 =「与原型对照截图（含差异说明）」，`needsHuman` 恒 true，理由 =「界面视觉需人对照权威原型」。
 * 由 `accepting-generator` 生成；**加性可选字段**（data-model §6.4「加可选字段」/ §10 `#50` 零迁移）
 * ——旧 `rtm-accepting.yml` 没有该键 = 未采集，读侧不得当"必在"用。
 */
export interface AcceptanceEvidenceItem {
  /** 项 id（同一文件内唯一；对照项多于一条时按序编号）。 */
  id: string
  /** 判别联合 source（`#37` 载荷形状；本需求只产 `prototype-compare`）。 */
  source: { kind: 'prototype-compare'; prototypePath: string }
  /** 逐字判据（interfaces.md §验收单项接口，禁止改写）。 */
  criterion: string
  /** 界面视觉无法自动判 → 恒 true（沿用"无法自动验证的项必须显式标注理由"机制）。 */
  needsHuman: true
  humanReason: string
}

/** rtm-accepting.yml（验收节点）。 */
export interface RTMAccepting {
  metadata: RTMMetadata
  inputs: {
    tasks: Array<{ id: string; title: string; status: string }>
  }
  outputs: {
    test_cases: TestCase[]
    /**
     * 验收「原型对照」证据条目（REQ-261005105032-3b02 FR-7）。
     *
     * **可选**：生成端在 UI 需求（feature/refactor）且存在已登记原型时写；无原型 / 已声明
     * `prototype_exempt` / 非 UI 分类时**不写该键**（缺键 = 未采集，与 `prototypes` / `decisions`
     * 两节的宽容度同口径 data-model §6.4）。
     */
    acceptance_items?: AcceptanceEvidenceItem[]
  }
  traceability: {
    task_to_tests: Record<string, string[]>
    fr_to_tests: Record<string, string[]>
  }
  coverage: {
    testing: TestingCoverage
  }
}

/** StageOverview 会话节点要展示的追溯块（FR-7）。 */
export interface StageOverviewTraceability {
  traceability: Traceability
  coverage: {
    design?: DesignCoverage
    implementation?: ImplementationCoverage
    testing?: TestingCoverage
  }
}

/** 写 RTM 时的可选参数。 */
export interface RTMWriteOptions {
  /** false = 不自动 +1（默认 true）。 */
  bumpVersion?: boolean
  /** 强制指定版本号。 */
  version?: number
  /** 覆盖 last_updated。 */
  now?: string
  generatedBy?: string
}
