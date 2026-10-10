/**
 * 需求**类型层**契约（REQ-261009174713-7bc8 · RF-25 / RF-28 · 裁定 D-5）。
 *
 * 为什么要有这一层：六类需求（feature / bug / doc / refactor / spike / chore）的
 * 「必填节 · 必交设计文档 · 条件阶段产物 · 模板引用 · 归档去向 · 提示词片段 · 中文标签」
 * 在拆包前散在 16 个文件里，改一类要动一片。本包把「某类型要求什么」收敛成
 * **声明式数据 + 纯校验**：core 只经注册表消费，不再自己持有任何类型判据。
 *
 * 依赖纪律（唯一权威是 design/architecture.md 的分层表）：本包只允许依赖 `pm-common`。
 * 因此契约里的 stage / kind / side 一律写成**名字字符串**——它们的域类型住在 core（L1），
 * 为了类型好看把它们拉上来就破坏了 L0.5；在类型包里复制一份枚举则必然漂移。判据语义由各类型包声明。
 *
 * 本包不做 I/O、不读盘、不渲染（类型包只装声明式规格 + 纯校验）。
 *
 * @module pm-type-kit/contract
 */
import type { RequirementCategory } from 'pm-common/requirement/Requirement.js'
import type { TemplateRef } from 'pm-common/template/types.js'

/** 端侧声明的名字（与需求 front-matter 的 sides 同源；类型住在 core，故此处是字符串）。 */
export type SpecSide = string

/** 条件必交设计文档：该类型在**某端侧**下额外必交哪份设计文档。 */
export interface ConditionalDocRule {
  /** 设计文档文件名（如 `frontend.md`）。 */
  readonly name: string
  /** 触发端侧（如 `frontend`）。 */
  readonly side: SpecSide
}

/** 条件阶段产物：该类型在**某端侧 + 某阶段**下额外必交哪类产物。 */
export interface ConditionalArtifactRule {
  /** 阶段名（如 `brainstorming`）。 */
  readonly stage: string
  /** 产物类别（如 `prototype`）。 */
  readonly kind: string
  /** 触发端侧。 */
  readonly side: SpecSide
}

/**
 * 一个阶段的模板表：**与该类型在该阶段要用到的模板一一对应**。
 *
 * 形状刻意与现网 `domain/template/registry.ts` 的 `NodeTemplateEntry['templates']` 逐字段同形，
 * 且模板引用复用 `pm-common/template/types.ts` 的 `TemplateRef`（**不再另立一个同名类型**：
 * 「同名不同形」是这类重构最容易留下的漂移）。这样搬运是逐行搬、消费方改动最小。
 *
 * **只声明地址，不含 I/O**：真正的读盘在 `pm-templates` 资产包（RF-22/RF-23），
 * 类型包不碰文件系统（这样才能在任意环境纯装配）。引用是否悬空由装配期门禁判（RF-28）。
 */
export interface StageTemplates {
  /** 阶段名（如 `brainstorming` / `design` / `decomposing`）。 */
  readonly stage: string
  /** 需求文档模板（需求阶段）。 */
  readonly requirement?: TemplateRef
  /** 设计文档模板（设计阶段，feature 五份 / refactor 两份）。 */
  readonly designDocs?: readonly TemplateRef[]
  /** 原型骨架（UI 需求的条件必交产物）。 */
  readonly prototype?: TemplateRef
  /** 拆分计划模板。 */
  readonly decomposition?: TemplateRef
  /** 任务卡模板。 */
  readonly taskCard?: TemplateRef
  /** 测试证据模板。 */
  readonly testEvidence?: TemplateRef
  /** 复核模板。 */
  readonly review?: TemplateRef
  /** 验收材料模板。 */
  readonly verification?: TemplateRef
  /** 归档索引模板。 */
  readonly archiveIndex?: TemplateRef
  /** 复盘模板。 */
  readonly retro?: TemplateRef
}

/** 归档去向与说明书要求（与现网 `ARCHIVE_DOC_RULES` 同形同义）。 */
export interface ArchiveRule {
  /** 是否必须写项目说明书更新点。 */
  readonly requireManual: boolean
  /** 归档必交文档类别（requirement / plan / verification / retro …）。 */
  readonly requiredDocs: readonly string[]
  /** 允许的合并去向（**顺序即优先级**，不许自创平行目录）。 */
  readonly mergeTargets: readonly string[]
  /** 人读的一句话依据。 */
  readonly note: string
}

/** 一个需求类型的完整规格：声明式数据，无行为、无 I/O。 */
export interface RequirementTypeSpec {
  /** 类型枚举键（六类之一，唯一）。 */
  readonly category: RequirementCategory
  /** 中文标签（立项弹框与看板展示用）。 */
  readonly label: string
  /** 中文描述（可选，弹框副文案）。 */
  readonly description?: string
  /** 根文档的必填节 **delta**（与通用节并集后才是该类型的完整必填节）。 */
  readonly rootSectionsDelta: readonly string[]
  /** 必交设计文档（无条件）。 */
  readonly requiredDesignDocs: readonly string[]
  /** 端侧触发的条件必交设计文档。 */
  readonly conditionalDesignDocs?: readonly ConditionalDocRule[]
  /** 端侧触发的阶段条件必交产物。 */
  readonly conditionalStageArtifacts?: readonly ConditionalArtifactRule[]
  /** 该类型在各阶段的模板表（地址引用，见 {@link StageTemplates}）。 */
  readonly templates?: readonly StageTemplates[]
  /** 归档去向与说明书要求。 */
  readonly archive: ArchiveRule
  /**
   * 该类型拥有的提示词片段 id（RF-27）。
   *
   * 拆包这一步**留位不填**：片段生成链改按类型出文件是 t11 的活，本卡只把契约定下来，
   * 免得 t11 回头改契约形状。
   */
  readonly promptFragments?: readonly string[]
  /**
   * 提交期**文档质量门**的适用面（只追溯新建需求，存量不追溯）：
   * `failureSection=true` 表示该类型必须写「失败与并发路径」节。
   *
   * 为什么是声明式字段而不是 core 里写 `category === 'feature'`：这是**某类型要求什么**，
   * 属类型层判据；core 只负责「怎么用这条规格」（RF-26 单点化）。
   */
  readonly docQuality?: { readonly failureSection?: boolean }
}
