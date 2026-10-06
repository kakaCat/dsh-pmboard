/**
 * 回退态「占位重做卡」收敛（REQ-261005122915-9f90 t2 / FR-2）——**唯一实现处**。
 *
 * ## 它解决什么
 *
 * 回退会为每张顶层父卡物化一张占位重做卡（`reworkOf` 非空）。重新落库新计划**之前**必须先把
 * 这批占位卡收掉：它们已被新计划取代，留着就是「占位卡 + 新计划卡」双份活卡，而且会让落库幂等
 * 判据误判「已落库」（REQ-261005105032-3b02：23 卡计划 0 张落库）。
 *
 * ## 为什么要抽出来（本需求的核心）
 *
 * 这段收敛原先**只写在** `use-cases/Decompose.ts` 的内联 mutate 块里，而落库入口有三条：
 *   - 手动 `reqboard_decompose`；
 *   - 弹框批准（`confirm-settle` → `landApprovedPlan`）；
 *   - 看板批准（`handlePlanDecision` → `landApprovedPlan`）。
 *
 * 两条批准路径没有这段收敛 ⇒ 同一件事在三处漂移，实测的静默丢卡就是这么来的。
 * 抽成模块后由**两条落库编排各调一次**（批准两条入口共用 `landApprovedPlan`，覆盖全部三条入口）。
 *
 * ## 三条纪律
 *
 *  - **只碰占位卡**：`reworkOf` 非空且未取消的卡。常规旧卡的取消由回退时的 `rollback-tasks`
 *    负责（那时才有回退语义），本模块不越权；
 *  - **无候选不写盘**：`mutate` 返回 `undefined` ⇒ 队列文件 mtime 不变（幂等的可观测判据）；
 *  - **写盘走收口**：经 `mutateQueue`（按需求 id 核验写盘根），不自己直取 `taskStore.mutate`——
 *    否则队列可能被写进别的项目（REQ-261001203710-0fbf 的原始事故）。
 *
 * @module dsh-pmboard/application/internal/stale-rework
 */
import type { UseCaseDeps } from '../ports.js'
import type { ActorRef } from '../../shared/protocol.js'
import { markCanceled } from '../../shared/protocol.js'
import { isReworkPlaceholder } from '../../domain/task/ReworkPlaceholder.js'
import { mutateQueue } from '../use-cases/queue-access.js'

/** 缺省留痕理由（手动拆分那条路径此前的文案，逐字保留）。 */
export const STALE_REWORK_REASON = '重新拆分：该重做卡已被新计划取代'

export interface CancelStaleReworkInput {
  /** 用例依赖（写盘根核验走 `mutateQueue`，故需要完整依赖包）。 */
  deps: UseCaseDeps
  requirementId: string
  nowTs: number
  /** 落痕主体：手动路径 = 当前窗口 agent；批准路径 = 触发落库的窗口。 */
  actor: ActorRef
  /** 留痕理由；缺省 `STALE_REWORK_REASON`。 */
  reason?: string
}

export interface CancelStaleReworkResult {
  /** 本次真正取消的占位卡数（无变更时为 0，队列零写入）。 */
  canceled: number
}

/**
 * 把上一轮回退物化、且仍活着的占位卡一次性置 `canceled`。
 *
 * 幂等：第二次调用没有候选 → 返回 `{canceled: 0}` 且**不写盘**。
 */
export async function cancelStaleReworkCards(input: CancelStaleReworkInput): Promise<CancelStaleReworkResult> {
  const reason = input.reason ?? STALE_REWORK_REASON
  const changed = await mutateQueue(input.deps, input.requirementId, (tasks) => {
    const stale = tasks.filter((t) => isReworkPlaceholder(t) && t.status !== 'canceled')
    if (stale.length === 0) return undefined // 无变更不写盘（幂等判据）
    for (const t of stale) {
      const before = t.status
      t.status = 'canceled'
      // 取消留痕（REQ-261005193546-1b1a FR-3）：与上面那行同一对象、同一次 mutateQueue 写事务；
      // 整批同源：at = 本批 nowTs、by = 触发本批落库的窗口、reason = 本批清理理由。
      // 注意调用方两条路径传的 by 都是 `{kind:'agent'}` ⇒ 按留痕规则**不写 canceledBy**。
      markCanceled(t, { at: input.nowTs, by: input.actor, reason })
      t.blocked = false
      delete t.blockedReason
      t.revisions = [
        ...(t.revisions ?? []),
        {
          at: input.nowTs,
          by: input.actor,
          kind: 'rollback',
          reason,
          changes: ['status: ' + before + '→canceled'],
        },
      ]
      t.updatedAt = input.nowTs
    }
    return tasks
  })
  return { canceled: changed.length }
}
