/**
 * Token Tab 的扩展段（REQ-261004222448-292a t-43fcf4 / serves: FR-10）——S-3 / S-4 / S-7。
 *
 * 与既有 `QueryRequirementToken` 的关系：**在它之上加两列 + 优化点 + 三态**，不改它本身。
 *   · 汇总口径（节点差值 / 执行差值兜底 / 缺失不补 0）继续由 `assembleRequirementToken` 单点决定；
 *   · 本文件只做「按阶段的行视图 + 每次调用均 + 缓存命中 + 可优化点 + 可得性三态」。
 *
 * 三条纪律（与 requirements 的 FR-10 / FR-12 对齐）：
 *   ① **缺失 ≠ 0**：一个阶段没有 token 记录时**不产出行**（产 0 行就等于说"这个阶段确实没花钱"）；
 *   ② **无快照不画 0 值表**：`availability==='none'` 时 `byStage` 是空数组，不是一堆 0；
 *   ③ **每条优化点必须有依据数字**：没有依据（如整体不可得）就**不给建议**，而不是给一条空话。
 *
 * @module dsh-pmboard/application/query/QueryToken
 */
import { fmt } from '../../domain/text/fmt.js'
import { stageTelemetryOf, type StageTelemetryRow } from '../../domain/workflow/StageTelemetry.js'
import {
  ALL_STAGE_KEYS,
  addBuckets,
  emptyBuckets,
  totalTokens,
  type Degrade,
  type PanelResult,
  type RequirementRecord,
  type StageKey,
  type TaskRecord,
  type TokenAvailability,
  type TokenBuckets,
  type TokenOptimization,
  type TokenPanelExtension,
  type TokenStageRow,
} from '../../shared/protocol.js'
import { assembleRequirementToken } from './QueryRequirementToken.js'
import type { PanelQueryDeps, PanelQueryInput } from './contracts.js'

// ---------------------------------------------------------------------------
// 小工具（本卡只允许新增四个查询文件，故 not_found / 降级信封各留一份最小实现）
// ---------------------------------------------------------------------------

/** 需求不存在 → 抛 `code='not_found'`（路由层转 404，与 `queryStageDetail` 同语义）。 */
function notFound(id: string): Error {
  return Object.assign(new Error(fmt('需求不存在：{id}', { id })), { code: 'not_found' })
}

/** 读不到 → 降级信封（**不许**用 0 / 空数组冒充「没有」，FR-12）。 */
function unreadable(err: unknown): Degrade {
  return {
    available: false,
    reason: 'ledger-unreadable',
    note: fmt('读不到台账/队列：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
  }
}

/** 两位小数（展示口径；占比合计的容差按 0.5 计）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// S-3 · 按阶段聚合
// ---------------------------------------------------------------------------

/** 阶段表 + 缺口清单 + 三态（S-3 的输出；三态与缺阶段同源，故一并返回）。 */
export interface StageTokenTable {
  /** 有 token 记录（或真实 0 快照）的阶段行；**无记录 = 无行**。 */
  rows: TokenStageRow[]
  /** 进入过、却没有任何 token 记录的阶段（`partial`/`none` 时页面列出它们）。 */
  missingStages: string[]
  availability: TokenAvailability
}

/**
 * 「这一阶段的调用数」——**可得的最小事实**，不是估算：
 *   · 实施阶段：该需求任务的**执行记录条数**（每次执行 = 一次 agent 调用；缺快照的执行也算调用，
 *     只是它的消耗没进合计——合计因此是下界，与 `boundsAreLowerBound` 的口径一致）；
 *   · 其它阶段：该阶段的**进入次数**（状态事件条数；回退后重入会 +1，这正是"重复执行"的信号）。
 *
 * 兜底 `Math.max(1, n)`：行只在有 token 记录时才存在，而有记录就意味着至少发生过一次调用
 * ——显示「0 次调用却花了 token」是自相矛盾的。
 */
function callsOf(stage: StageKey, mine: readonly TaskRecord[], entries: ReadonlyMap<string, number>): number {
  if (stage === 'implementing') {
    const execs = mine.reduce((n, t) => n + t.executions.length, 0)
    return Math.max(1, execs)
  }
  return Math.max(1, entries.get(stage) ?? 0)
}

/** 进入过（状态事件出现或就是当前状态）的阶段 → 进入次数。 */
function stageEntries(req: RequirementRecord): Map<string, number> {
  const entries = new Map<string, number>()
  for (const e of req.statusHistory ?? []) entries.set(e.status, (entries.get(e.status) ?? 0) + 1)
  if ((ALL_STAGE_KEYS as readonly string[]).includes(req.status)) {
    entries.set(req.status, Math.max(1, entries.get(req.status) ?? 0))
  }
  return entries
}

/**
 * 按阶段聚合 token（S-3）。
 *
 * 输入是**台账 + 队列**（不另读盘、不新增桶）：节点差值来自 `req.tokenUsage.byStage`，
 * 节点无快照时按任务执行差值兜底（与 `assembleRequirementToken` 同一处判据）。
 */
export function buildStageTokenTable(req: RequirementRecord, tasks: readonly TaskRecord[]): StageTokenTable {
  const view = assembleRequirementToken(req, { tasks })
  const mine = tasks.filter(t => t.requirementId === req.id)
  const entries = stageEntries(req)

  const rows: TokenStageRow[] = []
  for (const row of view.byStage) {
    const deltas = row.executions
      .map(e => e.delta)
      .filter((d): d is TokenBuckets => d !== undefined)
    // 节点差值优先；无节点快照但有执行差值 → 用执行差值（口径与 assembleRequirementToken 同源）
    const buckets = row.buckets ?? (deltas.length > 0 ? deltas.reduce(addBuckets, emptyBuckets()) : undefined)
    // 既无节点快照、也无执行差值 → 该阶段**不可知**（不是 0）：不出行
    if (buckets === undefined) continue
    const calls = callsOf(row.stage, mine, entries)
    const total = totalTokens(buckets)
    // 输入侧 = 未缓存输入 + 缓存写（缓存写是新输入写进缓存，不是"读缓存"）
    const inputTokens = buckets.uncachedInputTokens + buckets.cacheWriteTokens
    // 缓存命中率按 design/backend.md §S-3 第 3 条**逐字**：缓存读 ÷（缓存读 + **未缓存输入**）。
    // 分母刻意不含缓存写：缓存写是"把新输入写进缓存"（首次付费），既不是命中也不是未缓存输入；
    // 因此它的口径与上面那列 inputTokens（含缓存写）不完全同分母——两列各自照设计原文，不擅自对齐。
    const denom = buckets.cacheReadTokens + buckets.uncachedInputTokens
    rows.push({
      stage: row.stage,
      calls,
      inputTokens,
      outputTokens: buckets.outputTokens,
      cacheReadTokens: buckets.cacheReadTokens,
      totalTokens: total,
      sharePct: 0, // 待全部行算完后统一回填
      perCallTokens: Math.round(total / calls),
      cacheHitPct: denom > 0 ? round2((buckets.cacheReadTokens / denom) * 100) : 0,
    })
  }

  // 占比：分母 = 行合计（因此合计恒为 100%，与 UC-5「占比合计与总计一致」同源）。
  // 行合计为 0（快照真实全零）时占比没有意义 → 记 0，不造 NaN。
  const grand = rows.reduce((n, r) => n + r.totalTokens, 0)
  for (const r of rows) r.sharePct = grand > 0 ? round2((r.totalTokens / grand) * 100) : 0

  const known = new Set(rows.map(r => r.stage))
  const missingStages = ALL_STAGE_KEYS.filter(s => entries.has(s) && !known.has(s))

  // 完全无快照（且无执行差值）→ `none`：页面显示「无 token 快照」，**不画 0 值表**。
  // 注意：有快照但数值确实为 0（如全零快照）走 full/partial——"确实没花"与"读不到"是两件事。
  if (rows.length === 0) {
    return { rows, missingStages: [...missingStages], availability: 'none' }
  }
  // 与既有 `QueryRequirementToken.degraded` **同一口径**再判一次：那边是"执行侧快照缺口"
  // （任务执行缺 tokenSnapshot），这边是"阶段侧缺口"——同页两块不能一个说 full 一个说 degraded。
  const partial = missingStages.length > 0 || view.degraded
  return {
    rows,
    missingStages: [...missingStages],
    availability: partial ? 'partial' : 'full',
  }
}

// ---------------------------------------------------------------------------
// S-4 · 可优化点
// ---------------------------------------------------------------------------

/**
 * 可优化点（S-4）：**每条都带依据数字**——占比最高的阶段 / 缓存命中最低的阶段 /
 * 重复执行的阶段 / 零产出执行。没有任何表可算（`none`）时返回空数组（不产出无依据建议）。
 */
export function buildOptimizations(
  rows: readonly TokenStageRow[],
  telemetry: readonly StageTelemetryRow[],
): TokenOptimization[] {
  if (rows.length === 0) return []
  const out: TokenOptimization[] = []

  const hottest = rows.reduce((a, b) => (b.sharePct > a.sharePct ? b : a))
  out.push({
    title: '阶段占比最高',
    basis: fmt('{stage} 占 {pct}%（{total} tokens ÷ {calls} 次调用，每次 {per}）', {
      stage: hottest.stage, pct: hottest.sharePct, total: hottest.totalTokens,
      calls: hottest.calls, per: hottest.perCallTokens,
    }),
    suggestion: fmt('对该阶段做节点隔离 + 输入包裁剪：它单独吃掉 {pct}% 的消耗，重复上下文在这里被反复付费', {
      pct: hottest.sharePct,
    }),
  })

  const withInput = rows.filter(r => r.cacheReadTokens + r.inputTokens > 0)
  if (withInput.length > 0) {
    const coldest = withInput.reduce((a, b) => (b.cacheHitPct < a.cacheHitPct ? b : a))
    out.push({
      title: '缓存命中最低',
      basis: fmt('{stage} 缓存命中 {pct}%（缓存读 {cache}，未缓存输入 {uncached}）', {
        stage: coldest.stage, pct: coldest.cacheHitPct,
        cache: coldest.cacheReadTokens, uncached: coldest.inputTokens,
      }),
      suggestion: '把稳定前缀固定成同一段输入包（前缀不同就命中不了缓存）：先对齐顺序，再谈裁剪',
    })
  }

  for (const r of rows) {
    if (r.calls <= 1) continue
    out.push({
      title: '阶段重复执行',
      basis: fmt('{stage} 执行 {calls} 次（每次 {per}，合计 {total}）', {
        stage: r.stage, calls: r.calls, per: r.perCallTokens, total: r.totalTokens,
      }),
      suggestion: fmt('估算可省 ≈ {saved} tokens：重跑前先把问题修掉，或把可复用结论落成输入包再开下一轮', {
        saved: r.perCallTokens * (r.calls - 1),
      }),
    })
  }

  const zeroRuns = telemetry.reduce((n, t) => n + t.zeroOutputRuns, 0)
  if (zeroRuns > 0) {
    const runs = telemetry.reduce((n, t) => n + t.runs, 0)
    const stages = telemetry.filter(t => t.zeroOutputRuns > 0).map(t => t.stageKind).join('、')
    out.push({
      title: '零产出执行',
      basis: fmt('{zero} 次零产出执行（阶段：{stages}；已完成 {runs} 次）', { zero: zeroRuns, stages, runs }),
      suggestion: '给这些阶段加「无产出即停」：连续零产出就停下来问，而不是继续烧上下文',
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// S-7 · 端点入口
// ---------------------------------------------------------------------------

/**
 * `GET /requirements/:id/token` 的扩展段（并入现有响应，不另起端点）。
 *
 * 只读聚合：自己 await 端口（store 台账 + tasks 队列），不碰文件系统（application 禁 `node:`）。
 */
export async function queryTokenExtension(
  deps: PanelQueryDeps,
  input: PanelQueryInput,
): Promise<PanelResult<TokenPanelExtension>> {
  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }
  if (req === undefined) throw notFound(input.requirementId)

  let tasks: readonly TaskRecord[]
  try {
    tasks = await deps.tasks.listByRequirement(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }

  const table = buildStageTokenTable(req, tasks)
  const extension: TokenPanelExtension = {
    byStage: table.rows,
    optimizations: buildOptimizations(table.rows, stageTelemetryOf(tasks)),
    availability: table.availability,
    // `partial` 才需要"缺哪些阶段"与"合计是下界"；`none` 时整块无表可算，不给下界标记
    ...(table.availability === 'partial' ? { missingStages: table.missingStages } : {}),    ...(table.availability === 'partial' ? { boundsAreLowerBound: true } : {}),
  }
  return extension
}
