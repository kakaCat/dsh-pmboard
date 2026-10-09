/**
 * 看板 pending 票投影（REQ-261007223647-da5d t6 · serves: FR-5 / 设计 interfaces.md IF-5）。
 *
 * 治什么：2026-10-07 现场 `reqboard_submit` 工具超时把确认票 pc-a3d0aa 带走，票还挂着、
 * 人却不知道——因为看板根本没有「有人在你门口等着」这条读数。本文件把**仍然有意义**的挂起票
 * 投影成看板首屏可渲染的行。
 *
 * 口径与 `livePendingConfirm`（agent 侧 `reqboard_status` 的 `pending_confirms`）**同源**：
 * 复用同一组谓词（台账已落章 / 是不是一道门 / 有没有可落章的产物），只是从「本窗口一张」
 * 扩成「某需求的一批」——两处各写一套筛选条件必然漂移（一处放行、另一处仍拦，人就对不上号）。
 *
 * 本文件是**纯函数**：不碰时间（`now` 由调用方注入）、不碰文件系统、不做 I/O。
 *
 * @module dsh-pmboard/application/internal/pending-board
 */
import type { ArtifactKind, PendingConfirmation, RequirementRecord } from '../../shared/protocol.js'
import { LIMITS } from '../../domain/limits.js'
import { livePendingConfirmsOf } from './pending-guard.js'

export { livePendingConfirmsOf }

/**
 * 看板一行 pending 票（设计 IF-5 的六键 + 推导用的两个加法式字段）。
 *
 * 六个契约键：`ticket` / `requirement_id` / `target` / `kind?` / `created_at` / `interrupted`。
 * 加法式补入 `interrupted_at?` 与 `expires_at`：只给一个布尔 `interrupted`，客户端**算不出**
 * 剩余时间（公式的基准是 `interruptedAt ?? createdAt`），而「还剩几分钟」正是本 FR 要人看见的东西。
 */
export interface PendingBoardRow {
  ticket: string
  requirement_id: string
  target: 'artifact' | 'plan'
  kind?: ArtifactKind
  created_at: number
  /** 阻塞等待被中止的时刻（缺省 = 没被中止过）；也是过期基准。 */
  interrupted_at?: number
  interrupted: boolean
  /** 自动失效时刻（ms）= (interruptedAt ?? createdAt) + TTL。 */
  expires_at: number
  /** 剩余毫秒（下限 0）；客户端拿它起倒计时，随后本地递减，不轮询。 */
  remaining_ms: number
}

/**
 * 剩余时间推导（**公式单点**）：`TTL − (now − (interruptedAt ?? createdAt))`，下限 0。
 *
 * 为什么下限 0 而不是负数：票过期后由注册表过滤（`expired`），这里只是防御性收口——
 * 让「已超时」在展示层有确定取值（0），而不是把负数交给倒计时去显示成「-3 分钟」。
 */
export function pendingRemainingMs(rec: PendingConfirmation, now: number): number {
  const base = rec.interruptedAt ?? rec.createdAt
  return Math.max(0, LIMITS.pendingConfirmTtlMs - (now - base))
}

/**
 * 看板 pending 票行投影（IF-5）：**只读、纯函数**。
 *
 * 排序：剩余时间**少者在前**（快失效的先被人看见），同刻按 ticket 稳定兜底——
 * 顺序确定，前端渲染断言才不是靠运气。
 */
export function pendingBoardRowsOf(
  req: RequirementRecord | undefined,
  recs: readonly PendingConfirmation[],
  now: number,
): PendingBoardRow[] {
  return livePendingConfirmsOf(req, recs)
    .map((rec): PendingBoardRow => ({
      ticket: rec.ticket,
      requirement_id: rec.requirementId,
      target: rec.target,
      ...(rec.kind === undefined ? {} : { kind: rec.kind }),
      created_at: rec.createdAt,
      ...(rec.interruptedAt === undefined ? {} : { interrupted_at: rec.interruptedAt }),
      interrupted: rec.interruptedAt !== undefined,
      expires_at: (rec.interruptedAt ?? rec.createdAt) + LIMITS.pendingConfirmTtlMs,
      remaining_ms: pendingRemainingMs(rec, now),
    }))
    .sort((a, b) => (a.remaining_ms - b.remaining_ms) || (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0))
}
