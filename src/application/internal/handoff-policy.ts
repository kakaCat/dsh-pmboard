/**
 * 分叉判据（REQ-261004150249-731e FR-3 / t3）——**纯函数**，零 IO、零 `node:` 依赖（C-01）。
 *
 * 回答一个问题：**这个窗口还剩多少上下文，够不够继续干？** 答案只有四档 + 一个"算不出"：
 *   none / warn / fork / critical / unknown
 *
 * 口径纪律（与 `remainingTokensOf` 同源，见 `internal/node-input-package.ts`）：
 *   · 只认 `source === 'projection'` 的读数；
 *   · `contextWindow` 与 `pressureTokens` **都在场**才算得出比率；
 *   · 任一缺席 → `'unknown'`，**绝不补 0**——补 0 会让上游把"取不到"读成"余量充裕"，
 *     于是该分叉的时候静默硬停（R-013 的同一课）。
 *
 * 为什么单独一个模块：判据会被三处用（工具回执、gate 后置链预告、探针），
 * 而"多少算满"必须只有一份实现——两处各写一份阈值比较，迟早互相说谎。
 *
 * @module dsh-pmboard/application/internal/handoff-policy
 */
import type { ContextPressureSnapshot } from '../../shared/protocol.js'

/** 三档水位（生效值由组合根解析：`plugin-config.handoffSettings`）。 */
export interface HandoffThresholds {
  /** ≥ 此比率：预警（写断点、预告下个边界分叉），**不开窗**。 */
  warn: number
  /** ≥ 此比率：到达阶段边界时开窗并交接 owner。 */
  fork: number
  /** ≥ 此比率：不等边界，立即交接（兜底）。 */
  critical: number
}

/** 判据结论：四档 + `'unknown'`（读数不可得——不是"余量充裕"，也不是"已满"）。 */
export type HandoffDecision = 'none' | 'warn' | 'fork' | 'critical' | 'unknown'

/**
 * 由上下文压力读数判定该做什么。
 *
 * `ratio = pressureTokens / contextWindow`（**压力**，不是余量；两者互补但口径必须单说）。
 * `projectedTokens` 不参与判定：它是"预计占用"的旁路读数，字段本身 last-wins 非原子，
 * 拿它参与阈值比较会让判据随无关读数抖动。
 */
export function decideHandoff(
  pressure: ContextPressureSnapshot | undefined,
  thresholds: HandoffThresholds,
): HandoffDecision {
  if (pressure === undefined || pressure.source !== 'projection') return 'unknown'
  const { contextWindow, pressureTokens } = pressure
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return 'unknown'
  if (typeof pressureTokens !== 'number' || !Number.isFinite(pressureTokens)) return 'unknown'
  const ratio = pressureTokens / contextWindow
  if (ratio >= thresholds.critical) return 'critical'
  if (ratio >= thresholds.fork) return 'fork'
  if (ratio >= thresholds.warn) return 'warn'
  return 'none'
}

/** 该结论是否允许 **agent 自主**发起交接（D-3：只有顶墙两档可自主）。 */
export function allowsSelfHandoff(decision: HandoffDecision): boolean {
  return decision === 'fork' || decision === 'critical'
}
