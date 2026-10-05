/**
 * 跨会话血缘与快照差值（REQ-261004154937-2ca3 · FR-1 / FR-2）——**纯函数，零 IO**。
 *
 * 为什么单独成模块：这套规则是「口径」本身（谁算后代、差值怎么算），必须能脱离 DSH 服务、
 * 脱离磁盘、脱离时钟被单测逐条钉住；适配器只负责把数据喂进来（见 `SessionProbeAdapter`）。
 *
 * 两条纪律：
 *   ① **判据唯一**：后代 = `parentSession` 传递闭包 ∩（`delegationDepth ≥ 1` 或 `origin === 'subagent'`）
 *      —— fork 出来的窗口也带 `parentSession`，但它不是子代理，不能算进后代；
 *   ② **缺失 ≠ 0**：取不到用量的成员不进合计，只进 `degradedMembers`；差值遇到不可比水位就放弃该成员并标降级。
 *
 * @module dsh-pmboard/domain/token/lineage
 */
import {
  addBuckets,
  emptyBuckets,
  subBuckets,
  type TokenBuckets,
  type TokenSnapshot,
  type TokenSnapshotDegradedReason,
  type TokenSnapshotMember,
} from '../../shared/protocol.js'

/** 血缘枚举需要的最小 header 形状（DSH `SessionHeader` 的子集，避免类型互相耦合）。 */
export interface LineageHeader {
  readonly id: string
  readonly parentSession?: string
  readonly origin?: 'subagent'
  readonly delegationDepth?: number
}

/** 一个后代会话（不含自身）。 */
export interface LineageDescendant {
  readonly sessionId: string
  readonly depth: number
}

/**
 * 该 header 是否算「子代理会话」：`delegationDepth ≥ 1` **或** `origin === 'subagent'`（取或，
 * 因为格式演进中两者未必同时在场）。**纯 fork 窗口不算**——它有 `parentSession` 但 depth 0、无 origin。
 */
function isSubagent(header: LineageHeader): boolean {
  return header.origin === 'subagent' || (header.delegationDepth ?? 0) >= 1
}

/**
 * 从 `rootId` 出发的后代传递闭包（含多层，不含自身）。
 *
 * 为什么用 BFS 而不是「逐条向上找祖先」：向上找要对每个 header 重复走链（O(n·d)），
 * 而 BFS 只遍历一遍子边（O(n)），且天然容忍断链（父会话 header 已被清理时，那条支线自动断开）。
 */
export function descendantsOf(headers: readonly LineageHeader[], rootId: string): LineageDescendant[] {
  const childrenByParent = new Map<string, LineageHeader[]>()
  for (const h of headers) {
    if (!isSubagent(h)) continue
    const parent = h.parentSession
    if (parent === undefined || parent.length === 0) continue
    const list = childrenByParent.get(parent)
    if (list === undefined) childrenByParent.set(parent, [h])
    else list.push(h)
  }

  const out: LineageDescendant[] = []
  const seen = new Set<string>([rootId])
  let frontier: Array<{ sessionId: string; depth: number }> = [{ sessionId: rootId, depth: 0 }]
  while (frontier.length > 0) {
    const next: Array<{ sessionId: string; depth: number }> = []
    for (const node of frontier) {
      for (const child of childrenByParent.get(node.sessionId) ?? []) {
        if (seen.has(child.id)) continue // 防御：日志异常造成环时不无限展开
        seen.add(child.id)
        const depth = child.delegationDepth ?? node.depth + 1
        out.push({ sessionId: child.id, depth })
        next.push({ sessionId: child.id, depth })
      }
    }
    frontier = next
  }
  return out
}

/** 成员合计（恒等式 `totals === Σ members[].totals` 的实现；空数组成员 → 空桶）。 */
export function sumMembers(members: readonly TokenSnapshotMember[]): TokenBuckets {
  let total = emptyBuckets()
  for (const m of members) total = addBuckets(total, m.totals)
  return total
}

/**
 * 成员数组是否形状可信（REQ-261004154937-2ca3 联调段加）：
 * 日志读侧对 `tokenSnapshot` 是**整体透传、不校验**（见 `Journal.ts` 的 `as TokenSnapshot`），
 * 所以脏数据/半截写入会原样到达这里。缺字段会让相减抛错——那会打断主流程，
 * 而「读数不可信」本该降级不该崩。判据：每个成员都有**非负有限四桶**，任一不合即整体不信。
 */
function wellFormedMembers(members: unknown): members is readonly TokenSnapshotMember[] {
  if (!Array.isArray(members)) return false
  for (const m of members) {
    if (typeof m !== 'object' || m === null) return false
    const rec = m as { sessionId?: unknown; totals?: unknown }
    if (typeof rec.sessionId !== 'string' || rec.sessionId.length === 0) return false
    const t = rec.totals as Record<string, unknown> | undefined
    if (typeof t !== 'object' || t === null) return false
    for (const k of ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
      const v = t[k]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false
    }
  }
  return true
}

/** 差值结果：桶 + 是否降级 + 降级原因（降级时数字仍给出，但调用方可据此如实标注）。 */
export interface SnapshotDelta {
  readonly delta: TokenBuckets
  readonly degraded: boolean
  readonly degradedReason?: TokenSnapshotDegradedReason
}

/**
 * 相邻两次快照的消耗差值（REQ-261004154937-2ca3 FR-2 的**唯一实现**）。
 *
 * 规则（逐成员，按 `sessionId` 索引——成员顺序不得影响结果）：
 *   · 两侧都有该成员且水位可比 → `t2 − t1`（逐桶相减，负分量截断为 0，同 `subBuckets`）；
 *   · **只在 end 出现**（新成员）→ 全额计入：它诞生于两次快照之间，全部消耗都属本段；
 *   · **只在 start 出现**（消失成员）→ 记 0，**不记负值**（避免把总数拉低；其最后一段增量不可归属）；
 *   · 任一水位缺失 → 该成员整体不参与，并标 `member-unavailable`（宁可不精确，不许编造）；
 *   · 任一侧缺 `members`（旧快照）→ 退化为 `subBuckets(end.totals, start.totals)` + `legacy-snapshot`；
 *   · 任一侧 `source === 'unavailable'` → 空桶（既有语义：缺失不猜）。
 *
 * 为什么不用「总数相减」一把梭：`Σ_M2 − Σ_M1 = Σ_交集(t2−t1) + Σ_新 t2 − Σ_消失 t1`，
 * 最后一项会把总数拉低，而逐桶截断又会把它抹成 0——静默失真。逐成员算，每一项都能指着规则解释。
 */
export function deltaSnapshots(start: TokenSnapshot, end: TokenSnapshot): SnapshotDelta {
  const blank: TokenBuckets = emptyBuckets()
  if (start.source === 'unavailable' || end.source === 'unavailable') {
    return { delta: blank, degraded: true, degradedReason: 'snapshot-unavailable' }
  }
  const s = start.members
  const e = end.members
  // 形状可信才走逐成员路径；不可信（旧快照 / 脏数据）一律退化，**不抛错**
  if (!wellFormedMembers(s) || !wellFormedMembers(e)) {
    return { delta: subBuckets(end.totals, start.totals), degraded: true, degradedReason: 'legacy-snapshot' }
  }

  const prevById = new Map<string, TokenSnapshotMember>()
  for (const m of s) prevById.set(m.sessionId, m)

  let delta = blank
  let degraded = false
  for (const member of e) {
    const prev = prevById.get(member.sessionId)
    if (prev === undefined) {
      delta = addBuckets(delta, member.totals) // 新成员：全额
      continue
    }
    if (prev.seq === undefined || member.seq === undefined) {
      degraded = true // 水位不可比：该成员不参与
      continue
    }
    delta = addBuckets(delta, subBuckets(member.totals, prev.totals))
  }
  // start 里有、end 里没有的成员：不贡献（不记负值）——无需额外处理
  return degraded ? { delta, degraded: true, degradedReason: 'member-unavailable' } : { delta, degraded: false }
}
