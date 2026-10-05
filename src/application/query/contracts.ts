/**
 * 详情页六查询的**契约**（REQ-261004222448-292a t-361f2f）——只定形状，不写实现。
 *
 * 为什么单独一份：六个 Tab 各自取数，若允许「先实现再统一形状」，必然出现同一概念三种
 * 字段名（缺口的 what/why、文档的 state、执行记录的 outcome）。本文件是那六个查询的
 * 唯一签名来源，实现卡（t-43fcf4 / t-8eeed9 / t-242dd9）只填函数体。
 *
 * 分层纪律（沿用本仓既有约定）：
 *   - **IO 在调用方**：HTTP 路由先 await 端口，再把数据交给纯函数；查询函数自身不碰文件系统，
 *     便于单测（与 `QueryStageDetail` 的 AssembleContext 同款心智）。
 *   - **降级由类型兜底**：返回 `PanelResult<T>` —— 读不到就返回 `Degrade`（四种 reason），
 *     **不许用 0 / 空数组冒充「没有」**（FR-12）。
 *
 * @module dsh-pmboard/application/query/contracts
 */
import type { InjectionLogReadPort } from '../internal/injection-log.js'
import type { DocRepository, RequirementStore, SessionProbe, TaskStore } from '../ports.js'
import type {
  DagResponse,
  DocsResponse,
  DialogueResponse,
  PanelResult,
  PromptsResponse,
  ReportResponse,
  TokenPanelExtension,
  TrunkResponse,
} from '../../shared/protocol.js'

/**
 * 六查询共用的**四个只读端口**（施工前已核实三个已存在、一个为既有只读口）：
 *
 * | 端口 | 现状 | 读什么 |
 * |---|---|---|
 * | `store` | 已存在（`ports.ts` 的 `RequirementStore`，双后端 json/SQLite 同一端口） | 需求记录、产物、验收单、归档 |
 * | `tasks` | 已存在（`ports.ts` 的 `TaskStore`） | 每个需求目录的 `queue.json`（任务与依赖） |
 * | `injections` | 已存在（`application/internal/injection-log.ts` 的 `InjectionLogReadPort`） | 注入留痕（只读，写侧另有端口） |
 * | `sessions` | 已存在（`ports.ts` 的 `SessionProbe`） | 会话事件（对话流与窗口跳转用） |
 *
 * **不新增端口**：本需求全部为只读聚合，四个口够用；加口等于给未来留一个"顺手写"的口子。
 */
export interface PanelQueryDeps {
  store: RequirementStore
  tasks: TaskStore
  injections: InjectionLogReadPort
  sessions: SessionProbe
  /** 工作区根（读文档正文与 RTM 用）；缺省时文档类查询降级为 `file-missing` */
  workspaceRoot?: string
  /**
   * 文档读端口（t-43fcf4 / t-242dd9 实施时补的**加法式**扩展，2026-10-05）。
   *
   * 为什么必须补：application 层禁止 `import node:`（`tests/layer-boundary.test.ts` 机械检查），
   * 「文档在不在 / 正文是什么」只能走端口；`UseCaseDeps.docs` 就是那个口，组合根一行就能接上。
   * **缺省 = 文档类查询按 `file-missing` 降级**（不是 500，也不是「没有文档」）。
   */
  docs?: DocRepository
  /**
   * 取"现在"的口子（同样加法式补入）。
   * 为什么不让查询直接 `Date.now()`：停留时长 / 距上次更新是**渲染断言**要断言的数，
   * 注入时钟后测试可固定，断言才不是靠运气。
   */
  now?: () => number
}

/** 六查询的公共入参（分页参数只在需要的查询里生效）。 */
export interface PanelQueryInput {
  requirementId: string
  /** 分页游标：取早于该序号/时间戳的记录（对话流用） */
  before?: number
  /** 每页条数（上限 50，超过即 400 —— 校验在路由层，见 t-497311） */
  limit?: number
}

/**
 * 端点 1 · 首屏（结论头 + 操作条 + 状态带）。
 * 首屏唯一请求，**不含正文**；`gaps` 与 `waitingHuman` 口径必须一致（FR-4）。
 */
export type QueryReport = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<ReportResponse>>

/** 端点 2 · 汇报七条（读时抽取，不落库；缺节即标 missing，不回退需求描述）。 */
export type QueryTrunk = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<TrunkResponse>>

/** 端点 3 · 文档 + 核验 + 门禁裁决留痕（文档全部铺开，不截断）。 */
export type QueryDocs = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<DocsResponse>>

/** 端点 4 · DAG 图数据 + 每步执行结果（图部分复用现有画布入参形状）。 */
export type QueryDag = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<DagResponse>>

/**
 * 端点 5 · 对话一条流（只回人机文本与系统消息）。
 * **过滤规则在服务端**：工具调用、工具结果、推理、run_code 一律不出现在响应里。
 */
export type QueryDialogue = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<DialogueResponse>>

/** 端点 6 · 提示词（固定系统提示词装配 + 注入留痕 + 上下文）。 */
export type QueryPrompts = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<PromptsResponse>>

/**
 * 端点 7 · Token 扩展段（并入现有 token 响应，而非另起端点）。
 * 现有 `QueryRequirementToken` 继续负责汇总与明细；本类型只描述新增的两列 + 优化点 + 三态。
 */
export type QueryTokenExtension = (
  deps: PanelQueryDeps,
  input: PanelQueryInput,
) => Promise<PanelResult<TokenPanelExtension>>

/** 六个（连 Token 扩展共七个）查询用例的集合形状——装配与测试用它做一次性注入。 */
export interface PanelQueries {
  report: QueryReport
  trunk: QueryTrunk
  docs: QueryDocs
  dag: QueryDag
  dialogue: QueryDialogue
  prompts: QueryPrompts
  token: QueryTokenExtension
}
