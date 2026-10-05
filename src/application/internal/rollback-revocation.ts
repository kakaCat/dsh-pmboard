/**
 * 回退撤销语义（REQ-261003204149-1e80 FR-3）——「退回去以后，什么不再作数」的唯一实现处。
 *
 * 为什么必须有它：产物闸门的两级（产物存在门 / 人工确认门）语义是「离开一个**已完成**的节点」，
 * 回退时 `from` 恰恰没完成，那两级不适用（FR-2 因此在方向性豁免里跳过）。
 * 安全责任随之转移到这里：**出门前不检查，退回去之后作废**——两者必须同批生效，
 * 否则豁免就成了闸门缺口（退了但不作废 ⇒ 凭旧章白送人工门）。
 *
 * 三条法律（与 design/architecture.md §撤销语义 逐条对应）：
 *  ① 撤章：`stagesAfter(to)` 里的产物，清 `confirmedAt/confirmedBy/confirmedVia`（**保留登记**）；
 *  ② 撤批准：`to` 早于拆分阶段时，清 `plan.approvedAt/approvedBy`；
 *  ③ 标待同步 + 留痕：写 `docSyncPending`、`req.rollback`、一条 `[回退]` 评论。
 *
 * @module dsh-pmboard/application/internal/rollback-revocation
 */
import type { ActorRef, RequirementRecord, RequirementStatus } from '../../shared/protocol.js'
import { stagesAfter } from '../../domain/requirement/RollbackSpec.js'
import { applyDocSync, type DocSyncSource } from '../../domain/workflow/DocSyncSpec.js'

/** 本次撤销的实际后果（回执与断言都用它，避免调用方各自再算一遍）。 */
export interface RollbackRevocation {
  /** 被撤章的产物 path（空数组 = 无下游产物可撤） */
  artifactsRevoked: string[]
  /** 是否真的清掉了计划批准 */
  planApprovalRevoked: boolean
}

/** 阶段在 `stagesAfter` 里的成员判定（产物 stage 是宽类型，这里统一按字符串比）。 */
function isAfterTarget(stage: string, to: RequirementStatus): boolean {
  return (stagesAfter(to) as readonly string[]).includes(stage)
}

/**
 * 就地撤销回退目标之后的一切确认（章 / 计划批准），并留痕。
 *
 * **就地修改**（调用方负责放进同一笔 mutate）：任何一步抛错都由 mutate 整体回滚，
 * 不出现「状态退了但章没撤」的中间态。
 *
 * @param commentId 评论 id 生成器（与 verdicts 的 applyVerdicts 同款：id 由调用方注入，本函数不碰随机数）
 */
export function applyRollbackRevocation(
  req: RequirementRecord,
  from: RequirementStatus,
  to: RequirementStatus,
  now: number,
  actor: ActorRef,
  commentId: () => string,
  reason?: string,
): RollbackRevocation {
  // ── ① 撤章：只撤「晚于目标」的产物；目标自身不撤（退到 design 不撤 design 自己的章）──
  const artifactsRevoked: string[] = []
  for (const art of req.artifacts ?? []) {
    if (!isAfterTarget(art.stage, to)) continue
    if (art.confirmedAt === undefined && art.confirmedBy === undefined && art.confirmedVia === undefined) continue
    delete art.confirmedAt
    delete art.confirmedBy
    delete art.confirmedVia
    artifactsRevoked.push(art.path)
  }

  // ── ② 撤批准：目标早于拆分阶段 ⇒ 计划批准不再作数（拆分的钥匙必须重新拿）──
  //    判据用 stagesAfter 而非硬编码阶段名：与 ① 同源，避免「退回 design 却漏撤批准」这类遗漏。
  let planApprovalRevoked = false
  if (req.plan !== undefined && isAfterTarget('decomposing', to) && req.plan.approvedAt !== undefined) {
    delete req.plan.approvedAt
    delete req.plan.approvedBy
    planApprovalRevoked = true
  }

  // ── ③ 标待同步 + 留痕 ──────────────────────────────────────────────────
  // source 按**目标阶段**推导（不是"本次实际撤了什么"）：目标早于/等于拆分阶段 ⇒ 拆分计划与
  // 其下游都失效 ⇒ 'plan'；否则按需求/设计文档 ⇒ 'requirement'。
  // 为什么不能用 artifactsRevoked 反推：第二次回退到同一目标时，章**已被上次撤掉**，
  // 反推会得到另一个 source，于是同源标记叠成两条（幂等被破坏）。判据与 ② 同源，天然稳定。
  const docSyncSource: DocSyncSource = isAfterTarget('decomposing', to) ? 'plan' : 'requirement'
  applyDocSync(req, docSyncSource, '回退到 ' + to + '：下游需重新确认', now)

  req.rollback = { from, to, at: now, by: actor, ...(reason !== undefined ? { reason } : {}) }
  req.updatedAt = now
  req.updatedBy = actor
  req.comments.push({
    id: commentId(),
    body: '[回退] ' + from + ' → ' + to
      + (reason !== undefined && reason.length > 0 ? '（' + reason + '）' : '')
      + '\n作废产物章：' + (artifactsRevoked.length > 0 ? artifactsRevoked.join('、') : '（无下游产物）')
      + '\n计划批准：' + (planApprovalRevoked ? '已作废（需重新批准）' : '未涉及'),
    createdAt: now,
    createdBy: actor,
  })

  return { artifactsRevoked, planApprovalRevoked }
}
