/**
 * 看板摘要的**唯一装配点**（REQ-261006175040-12d4 · t2 / FR-2、FR-6 · D-2）。
 *
 * ## 为什么必须收成一处
 *
 * 门读数由三件事合成：**门清单**（哪些门生效）+ **产物事实**（各自登记/落章没有）+ **投影**（摘要形状）。
 * 前两件的真相分别在 `shared/protocol.ts`（`flowProfileFor` / `ARTIFACT_CONFIRM_GATES`）与
 * `domain/artifact/GateReadings.ts`（纯判定）。若让每个生产者自己拼，就会出现
 * 「写路径算一套、索引构建算一套、测试替身又一套」——本仓「两份真相必然漂移」的教训（见
 * `docs/architecture/live-card-single-source.md`）。故装配只有这一个入口：
 * **所有产出看板摘要的地方（读侧索引、冷侧、写侧广播、测试替身）都调它**。
 *
 * ## 缺省语义（FR-6：读不到 ≠ 缺失）
 *
 * | 入参形态 | 出口 |
 * |---|---|
 * | `artifacts === undefined`（对象没读到 / 旧服务端） | **不下发** `gates` 与 `archivePrepared`（不可得） |
 * | `artifacts === []`（确实一件都没登记） | `gates` 全 `missing` + `archivePrepared: false`（真实缺失） |
 * | `plan === undefined`（记录里没有计划对象） | 不下发 `planState`（无计划 ⇒ 无 chip） |
 *
 * ## 调用方前置条件（不满足会产出"看起来合理"的错读数）
 *
 * 传入的必须是**装配态记录**（`artifacts` / `plan` / `archive` 都在手上），或调用方已把这三件外置对象
 * 读齐后合并进同一个对象。**不要**只塞 `artifacts` 就调它——那样 `archivePrepared` 会被算成 `false`，
 * 而需求可能其实已有归档记录。分片读侧的取数点见 `design/backend.md` §1。
 *
 * @module dsh-pmboard/shared/board-summary
 */
import { ARTIFACT_CONFIRM_GATES, flowProfileFor } from './protocol.js'
import {
  archivePreparedOf,
  gateReadingsOf,
  planStateOf,
  type GateArtifactFact,
  type GateReading,
  type PlanState,
} from '../domain/artifact/GateReadings.js'
import {
  summarize,
  type RequirementSummary,
  type SummarizableRequirement,
} from '../domain/requirement/RequirementSummary.js'

/**
 * 装配入参：摘要投影的入参 + 计划与归档两件对象。
 *
 * 三件外置对象的**存在性**是语义的一部分（见模块头注的缺省语义表），故类型上保持可选而不补默认值。
 */
export type BoardSummaryInput = SummarizableRequirement & {
  readonly plan?: { readonly approvedAt?: number; readonly rejectedAt?: number }
  readonly archive?: unknown
  /**
   * 归档对象**是否读得到**（缺省 = 读得到）。
   *
   * 为什么需要这一位：`archivePrepared` 的判据是「归档记录 ∨ 归档产物」，而当 `archive.json`
   * 存在却读不出来（JSON 损坏被隔离 / IO 异常）时，"记录不存在"与"读不到"长得一模一样——
   * 若按前者算，就会把"不可得"渲染成「归档材料待补」（列表行假红）。调用方（读侧取数点）知道
   * 文件在不在，故由它显式声明；`false` ⇒ **不下发** `archivePrepared`（FR-6：读不到 ≠ 缺失）。
   */
  readonly archiveReadable?: boolean
}

/** 装配出口携带的三枚读数（内部用，避免在调用点各写一遍可选键）。 */
interface GateExtras {
  gates?: readonly GateReading[]
  planState?: PlanState
  archivePrepared?: boolean
}

/**
 * 该分类**生效门的产物 kind 清单**，顺序 = 生效门顺序。
 *
 * 顺序为什么不排序：卡面 chips 的位置必须稳定（人每次刷新都在同一个位置找同一道门），
 * 而"哪道门在前"由 `GATE_CATALOG` 的流水线顺序定义，不是字典序。
 */
export function confirmGateKindsOf(category: SummarizableRequirement['category']): string[] {
  const kinds: string[] = []
  for (const gateKey of flowProfileFor(category).confirmGates) {
    const kind = ARTIFACT_CONFIRM_GATES[gateKey]
    if (kind !== undefined) kinds.push(kind)
  }
  return kinds
}

/**
 * 产物数组 → 门判定用的**事实子集**（结构不全的条目丢弃，不补默认值）。
 *
 * 与 `factsOf` 的同名处理同款纪律：入参是宽松类型（测试夹具常传 `{ kind: 'design' }`），
 * 补 `confirmedAt: 0` 之类会把"没落章"伪造成"已落章"——宁可丢条目，也不发明字段。
 */
function artifactFactsOf(raw: readonly unknown[]): GateArtifactFact[] {
  const facts: GateArtifactFact[] = []
  for (const item of raw) {
    const a = item as { kind?: unknown; confirmedAt?: unknown } | null | undefined
    if (a === null || a === undefined || typeof a.kind !== 'string' || a.kind.length === 0) continue
    facts.push(typeof a.confirmedAt === 'number' ? { kind: a.kind, confirmedAt: a.confirmedAt } : { kind: a.kind })
  }
  return facts
}

/** 读侧三枚读数的**唯一实现**：门清单 + 产物事实 + 计划/归档对象 → 有界投影。 */
function gateExtrasOf(record: BoardSummaryInput): GateExtras {
  const extras: GateExtras = {}
  // ① 门读数与归档材料是否已备：只在"产物事实读得到"时给出（否则键不出现 = 不可得）
  if (record.artifacts !== undefined) {
    const facts = artifactFactsOf(record.artifacts)
    extras.gates = gateReadingsOf(confirmGateKindsOf(record.category), facts)
    // 归档读数只在"归档对象读得到"时给出（archiveReadable === false ⇒ 不可得，不下发键）
    if (record.archiveReadable !== false) {
      extras.archivePrepared = archivePreparedOf({
        archive: record.archive,
        hasArchiveArtifact: facts.some(f => f.kind === 'archive'),
      })
    }
  }
  // ② 计划状态：可以独立于产物给出（计划对象在手上就有结论）
  const planState = planStateOf(record.plan)
  if (planState !== undefined) extras.planState = planState
  return extras
}

/**
 * 完整记录 / 装配态记录 → 看板摘要（**唯一**产出看板摘要的函数）。
 *
 * `summarize` 仍是纯字段透传（它被 `factsOf` 与既有单测使用）；凡是要给看板看的摘要，
 * 都必须经过本函数，否则读数缺失——那正是本次缺陷的形态（客户端拿不到读数只能自己猜）。
 */
export function boardSummaryOf(record: BoardSummaryInput): RequirementSummary {
  return summarize({ ...record, ...gateExtrasOf(record) })
}

/**
 * **写路径专用**装配（写侧手上就是该需求的完整记录 ⇒ 记录即权威）。
 *
 * 与读侧的区别只有一处、但很关键：写侧能确定"没有 `artifacts` 键"就是**一件产物都没登记**
 * （它正在写这份记录），故补 `[]` ⇒ 门读数照实给（全 `missing`，卡面显示真实缺失）；
 * 而读侧读不到对象时**不能**这么补（那是"不可得"，见模块头注）。
 *
 * 不这么做会有一个隐蔽后果：新建/更新的需求广播出去的摘要**不带门读数**，而 Store 的内存索引
 * 正是用这份广播刷新那条记录 —— 卡面会一直不渲染门块，直到进程重启重建索引。
 */
export function boardSummaryOfAuthoritative(record: BoardSummaryInput): RequirementSummary {
  return boardSummaryOf({ ...record, artifacts: record.artifacts ?? [] })
}
