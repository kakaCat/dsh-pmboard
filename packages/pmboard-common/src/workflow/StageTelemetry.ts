/**
 * 阶段遥测读模型（REQ-261004110201-f253 FR-2）——按**子卡阶段**聚合执行记录的**只读投影**。
 *
 * 为什么从 executions 派生而不是落一个新桶：
 *   · 既有 `tokenUsage.byStage` 是 **prompt 阶段**（brainstorming/design/…）keyed 且只装 token；
 *     本需求要的是**子卡阶段**（dev/integrate/review/test/…）的时长与产出。语义不同，
 *     混用会让两个口径互相说谎；复刻第二个桶则会让同一事实有两份。
 *   · 派生还有一条好处：历史执行没记产出计数时，读侧能**如实记「未知」**而不是补 0。
 *
 * 分层：domain 最内层，零 import（不引 shared）——视图类型本地声明，
 * 与 TaskRecord/ExecutionRecord 的结构兼容由调用方（QueryState）与用例锁死。
 *
 * @module dsh-pmboard/domain/workflow/StageTelemetry
 */

/** 执行记录的最小视图（与 ExecutionRecord 结构兼容）。 */
export interface StageTelemetryExec {
  startedAt: number
  endedAt?: number
  outcome: string
  /** 产出条目数；缺省 = 未知（改造前的历史执行）——**不计入统计**。 */
  outputCount?: number
  /** 零产出标记；缺省 = 未知——**不计入零产出**（宁可漏报不误报）。 */
  zeroOutput?: boolean
}

/** 任务卡的最小视图（与 TaskRecord 结构兼容）。 */
export interface StageTelemetryTask {
  parentId?: string
  /** 子卡阶段（dev / integrate / review / test / …）；缺省 = 非子卡 → 不参与遥测。 */
  stageKind?: string
  executions?: readonly StageTelemetryExec[]
}

/** 一个阶段的遥测汇总。 */
export interface StageTelemetryRow {
  stageKind: string
  /** 已完成执行数（endedAt 存在且 outcome !== 'running'）。 */
  runs: number
  totalDurationMs: number
  avgDurationMs: number
  /** 已知产出条目合计（未知的不计）。 */
  outputCount: number
  /** 已知零产出的执行数（未知的不计）。 */
  zeroOutputRuns: number
  /** 最近一次完成时刻（无 = 0）。 */
  lastAt: number
}

/**
 * 按 stageKind 聚合子卡执行：只统计**子卡**（parentId 存在）且**已完成**的执行；
 * 未知产出计数/标记的旧记录不参与对应统计（诚实：未知 ≠ 0）。
 * 结果按 stageKind 字典序稳定排序（回执可 diff、可快照）。
 */
export function stageTelemetryOf(tasks: readonly StageTelemetryTask[]): StageTelemetryRow[] {
  const acc = new Map<string, StageTelemetryRow>()
  for (const t of tasks) {
    if (t.parentId === undefined) continue
    const stageKind = typeof t.stageKind === 'string' && t.stageKind.length > 0 ? t.stageKind : undefined
    if (stageKind === undefined) continue
    for (const e of t.executions ?? []) {
      if (e.endedAt === undefined || e.outcome === 'running') continue
      const duration = Math.max(0, e.endedAt - e.startedAt)
      const row = acc.get(stageKind) ?? {
        stageKind, runs: 0, totalDurationMs: 0, avgDurationMs: 0,
        outputCount: 0, zeroOutputRuns: 0, lastAt: 0,
      }
      row.runs += 1
      row.totalDurationMs += duration
      if (typeof e.outputCount === 'number') row.outputCount += e.outputCount
      if (e.zeroOutput === true) row.zeroOutputRuns += 1
      if (e.endedAt > row.lastAt) row.lastAt = e.endedAt
      acc.set(stageKind, row)
    }
  }
  const rows = [...acc.values()].map((r) => ({
    ...r,
    avgDurationMs: r.runs > 0 ? Math.round(r.totalDurationMs / r.runs) : 0,
  }))
  rows.sort((a, b) => (a.stageKind < b.stageKind ? -1 : a.stageKind > b.stageKind ? 1 : 0))
  return rows
}

/**
 * 连续零产出计数（FR-3）：按**结束时刻倒序**取该阶段的执行，数到第一个
 * 「明确非零产出」或「未知（老记录无标记）」为止。
 *
 * 为什么未知要断开：未知 ≠ 零产出（老记录没记产出），把它当成零产出会误报告警；
 * 当成非零则会漏报。**断开**是唯一不撒谎的选择（宁可少报一次，不可冤枉一段）。
 */
export function zeroOutputStreak(execs: readonly StageTelemetryExec[]): number {
  const done = execs.filter((e) => e.endedAt !== undefined && e.outcome !== 'running')
  done.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  let streak = 0
  for (const e of done) {
    if (e.zeroOutput === true) streak += 1
    else break
  }
  return streak
}

/**
 * 是否该写一条零产出告警（FR-3，**去重可推导**）：
 * `floor(streak / threshold) > 已告警条数` 才写。
 *
 * 效果：同一轮连续零产出在阈值处告警一次；再攒够一个阈值（2×/3×…）才再告警；
 * 中间出现过非零产出 → streak 归零 → 下轮从 0 重新攒。判据全部来自已落盘数据，
 * 不依赖内存状态，重放安全。
 */
export function shouldAlertZeroOutput(streak: number, alertedCount: number, threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold < 1) return false
  return Math.floor(streak / threshold) > Math.max(0, alertedCount)
}
