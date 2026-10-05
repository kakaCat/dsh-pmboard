/**
 * 误物化批量清场（REQ-261004121649-bfa7 t3/t6 · FR-4）——落库编排的**唯一实现处**。
 *
 * ## 为什么编排要从路由里抽出来
 *
 * 路由层没法用内存替身跑（要起 HTTP、要真存储）。而 FR-4 的两条硬要求恰恰只能靠用例钉住：
 * 「再清一次 canceled === 0」（幂等）与「不碰 done 卡」。判定本身在 `internal/rollback-cleanup`
 * （纯函数），**落库顺序与留痕**在这里——看板路由只做协议转换。
 *
 * ## 落库顺序（与回退同款 I-11）
 *
 * **先任务后需求**：任务写失败时需求未动（干净）；需求写失败时由 `mutate` 自身回滚。
 * 需求侧只留痕，**不改状态**——清场是队列的事，不是需求阶段的事（改状态会把人推进的章撤掉）。
 *
 * ## 「仅人」怎么落地
 *
 * 本用例**不在任何 agent 工具面注册**（人工裁定 2026-10-04，与看板改绑同款纪律：
 * 代码级拒绝 = 工具面不存在）。HTTP 调用方的身份在服务端无法辨别，故不做 body 自称式判定。
 *
 * @module dsh-pmboard/application/use-cases/RollbackCleanup
 */
import type { RequirementStore } from '../ports.js'
import type { TaskStore } from '../ports.js'
import type { ActorRef, RequirementRecord } from '../../shared/protocol.js'
import { planRollbackCleanup, type RollbackCleanupPlan } from '../internal/rollback-cleanup.js'

/** 清场所需的两个存储端口（窄接口：只用到这两个方法）。 */
export interface RollbackCleanupDeps {
  requirementStore: Pick<RequirementStore, 'get' | 'mutate'>
  taskStore: Pick<TaskStore, 'listByRequirement' | 'mutate'>
  now: () => number
  newCommentId: () => string
}

/** 清场回执（看板直接透出；`skipped` 逐条给原因，不许静默跳过）。 */
export interface RollbackCleanupResult {
  id: string
  rollbackSeq: number
  canceled: number
  restoredLinks: number
  matchedBy: RollbackCleanupPlan['matchedBy']
  skipped: RollbackCleanupPlan['skipped']
  note: string
}

/** 该需求的当前回退序号（存量记录没有 seq → 有 rollback 就算 1，没有就是 0）。 */
export function currentRollbackSeq(req: Pick<RequirementRecord, 'rollback'>): number {
  const mark = req.rollback
  if (mark === undefined) return 0
  return typeof mark.seq === 'number' && mark.seq > 0 ? mark.seq : 1
}

/**
 * 执行一次批量清场。
 *
 * @param rollbackSeq 人指定的回退序号；与当前序号不符 → 抛 `REQBOARD_UNKNOWN_ROLLBACK_SEQ`
 *   （**拒绝**而不是"清最近的"——那会清错批）
 */
export async function executeRollbackCleanup(
  deps: RollbackCleanupDeps,
  input: { id: string; rollbackSeq: number; reason?: string },
): Promise<RollbackCleanupResult> {
  const { id, rollbackSeq } = input
  const reason = input.reason ?? ''
  const target = await deps.requirementStore.get(id)
  if (target === undefined) {
    throw Object.assign(new Error('清场被拒：需求 ' + id + ' 不存在'), { code: 'REQBOARD_NOT_FOUND' })
  }
  const seq = currentRollbackSeq(target)
  // 序号校验的判据是「台账上**记过**序号」而不是「序号等于请求值」：
  // 存量记录（2 条实测）的 rollback 只有 from/to/at/by，`seq` 缺省——那种记录**没有批次可分**
  // （清单也只有一份），若一律按序号拒绝，t6 的兜底路径就永远走不到，旧卡也就永远清不掉。
  const recorded = typeof target.rollback?.seq === 'number' && target.rollback.seq > 0
  if (seq === 0 || (recorded && rollbackSeq !== seq)) {
    throw Object.assign(
      new Error(
        '清场被拒：回退序号 ' + String(rollbackSeq) + ' 不存在（该需求当前序号为 '
        + (seq === 0 ? '（从未回退）' : String(seq)) + '）——只清指定批次，不清「最近的」',
      ),
      { code: 'REQBOARD_UNKNOWN_ROLLBACK_SEQ' },
    )
  }

  const tasks = await deps.taskStore.listByRequirement(id)
  const at = deps.now()
  const actor: ActorRef = { kind: 'human' }
  const plan = planRollbackCleanup(target, tasks, rollbackSeq, at, actor, target.rollback?.lastMaterialized, reason)

  // ① 任务先写：取消 + 还原父子关系一次写成（不引入「取消了但关系没还原」的中间态）。
  if (plan.canceled.length > 0) {
    const byId = new Map(plan.canceled.map((t) => [t.id, t]))
    await deps.taskStore.mutate(id, (queueTasks) => {
      let touched = false
      for (const qt of queueTasks) {
        const c = byId.get(qt.id)
        if (c === undefined) continue
        qt.status = c.status
        qt.revisions = c.revisions
        if (c.parentId !== undefined) qt.parentId = c.parentId
        qt.updatedAt = c.updatedAt
        touched = true
      }
      return touched ? queueTasks : undefined
    })
  }

  // ② 需求后写：只留痕（不改状态、不动阶段）。
  const note = plan.matchedBy === 'lastMaterialized'
    ? '按该次回退记录的物化清单精确匹配'
    : '该需求没有物化清单记录（旧数据），按 reworkOf + 标题前缀兜底匹配——可能多算或少算，请核对 skipped'
  const skipNote = plan.skipped.length > 0 ? '（' + String(plan.skipped.length) + ' 张跳过，详见 skipped）' : ''
  await deps.requirementStore.mutate(id, (r) => {
    r.comments.push({
      id: deps.newCommentId(),
      body: '[清场] 第 ' + String(rollbackSeq) + ' 次回退物化的卡批量取消：'
        + String(plan.canceled.length) + ' 张；父子关系还原 ' + String(plan.restoredLinks.length) + ' 条'
        + skipNote
        + '\n匹配方式：' + plan.matchedBy
        + (reason.length > 0 ? '\n理由：' + reason : ''),
      createdAt: at,
      createdBy: actor,
    })
    r.updatedAt = at
    r.updatedBy = actor
    return { changed: true }
  })

  return {
    id,
    rollbackSeq,
    canceled: plan.canceled.length,
    restoredLinks: plan.restoredLinks.length,
    matchedBy: plan.matchedBy,
    skipped: plan.skipped,
    note,
  }
}
