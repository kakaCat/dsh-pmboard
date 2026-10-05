/**
 * 回退编排单点（REQ-261003204149-1e80 FR-3/FR-4/FR-5）——「退回去」这一动作的**唯一装配处**。
 *
 * 为什么要把撤销与卡处置串在一处：回退不是一个字段的变化，而是**四类后果**同时发生
 * （状态 / 章与批准作废 / 旧卡归宿 / 待同步标记）。分散在工具侧与看板侧各写一遍，
 * 必然演变成两套语义（现状缺口 #4 就是这么来的）。
 *
 * **顺序即契约**（本文件存在的核心理由）：
 *   ① 先 `planRollbackTasks`——纯计算，可能抛（脏数据 / 生成器故障）；
 *   ② 再 `applyRollbackRevocation`——就地改 `req`。
 * 反过来的话，卡处置一抛错，需求侧的章与批准**已经被撤**了 —— 那就是「状态没退、确认却没了」
 * 的中间态。先算后改，使"抛错 = 什么都没发生"。
 *
 * **不含落库**：调用方负责写盘，并遵守既有的 I-11 顺序契约（**任务先写、需求后写**）：
 * 任务写失败 → 需求未动（干净）；需求写失败 → 由 `mutate` 自身回滚。
 *
 * @module dsh-pmboard/application/internal/rollback
 */
import type { ActorRef, RequirementRecord, RequirementStatus, TaskRecord } from '../../shared/protocol.js'
import { transitionDive } from '../../domain/dive/transition.js'
import { applyRollbackRevocation, type RollbackRevocation } from './rollback-revocation.js'
import { planRollbackTasks, type RollbackTaskPlan } from './rollback-tasks.js'
import { stampCheckpoint } from './interruption.js'

/** 编排用到的 id 口（任务 id 用于重做卡，评论 id 用于 [回退] 留痕）。 */
export interface RollbackIdFactory {
  task(): string
  comment(): string
}

/** 一次回退的全部后果（回执与落库都据此进行）。 */
export interface RequirementRollbackOutcome {
  revocation: RollbackRevocation
  taskPlan: RollbackTaskPlan
}

/**
 * 就地应用一次需求级回退的**全部需求侧后果**，并返回卡处置计划。
 *
 * @returns `revocation` 撤销回执 + `taskPlan` 待落库的卡计划（旧卡取消副本 / 重做卡草稿）
 */
export function applyRequirementRollback(
  req: RequirementRecord,
  tasks: readonly TaskRecord[],
  from: RequirementStatus,
  to: RequirementStatus,
  now: number,
  actor: ActorRef,
  ids: RollbackIdFactory,
  reason: string,
): RequirementRollbackOutcome {
  // ① 纯计算（先）：可能抛——此时 req 与 tasks 都还是原样。
  const taskPlan = planRollbackTasks(req, tasks, to, now, actor, ids, reason)
  // ② 就地改 req（后）：撤章 / 撤批准 / 标待同步 / 写 rollback 留痕与评论。
  const revocation = applyRollbackRevocation(req, from, to, now, actor, () => ids.comment(), reason)
  return { revocation, taskPlan }
}

/**
 * 回退后的**注入与断点重算**（REQ-261003204149-1e80 FR-6）——单点实现，两侧入口共用。
 *
 * ⚠️ 必须在状态**已经转移到 `to` 之后**调用：`stampCheckpoint` 按 `req.status` 现算
 * `pendingAction`，早一步调用会把断点算成**旧阶段**的下一步（正是本卡要消灭的那种残留）。
 *
 * 两件事：
 *  ① 断点按新阶段重算——退回 design 后，"下一步"该是设计阶段动作，不能再是"提交验收"；
 *  ② dive 自动链解除——armed 的自动链是照着旧阶段铺的，回退后必须停下来，
 *     否则自动流程会继续朝旧方向推进（`pausedReason` 一并清掉，不留上一轮的暂停语）。
 */
export function resetInjectionAfterRollback(
  req: RequirementRecord,
  now: number,
  /** 留痕归因（FR-9）：看板路径是 human、工具路径是 agent。缺省 system（存量调用方零改动）。 */
  actor: { kind: 'human' | 'agent' | 'system'; sessionId?: string } = { kind: 'system' },
): void {
  stampCheckpoint(req, now, 'reqboard_move')
  if (req.dive !== undefined) {
    // FR-9：回退解除自动链走 `disarm-rollback` 事件（actor 由调用方给）。
    // 作用域：本函数在 mutate 回调内被调用（同步契约），故就地用纯函数算。
    const disarmed = transitionDive(req.dive, { event: 'disarm-rollback', now, actor })
    if (disarmed.changed && disarmed.next !== undefined) req.dive = disarmed.next
  }
}

/**
 * 记一次回退的物化明细（REQ-261004121649-bfa7 t3 / FR-4）——批量清理入口的唯一输入。
 *
 * ## 为什么必须有这一步
 *
 * 清理入口要回答「这批卡是哪次回退物化的」，只能靠台账上记下来的 id 清单。
 * 没有它，清理就只能按 `reworkOf` 反查——那把**上一次**回退遗留的卡也一起算了，
 * 清理失去边界（t6 的兜底正是给没有这个字段的旧数据用的，且必须声明是「猜」）。
 *
 * ## 两条口径
 *
 *  - `seq` **每次回退都 +1**（存量记录没有 `seq` → 按 1 起算，故无需迁移）；
 *  - `lastMaterialized` **只在本次真的物化了卡时才覆盖**。这一点是刻意的：
 *    第二次回退物化 0 张（幂等命中）时若把清单清空，第一次物化出来的卡就再也清不掉了
 *    ——那等于把「误物化」钉死在队列里，正是本需求要消灭的处境。
 *
 * 就地修改 `req.rollback`（调用方放在同一笔 mutate 内，与撤销半边同生同死）。
 *
 * @param materialized 本次回退**物化出来的重做卡 id**（空数组 = 本次未物化任何卡）
 */
export function recordRollbackMaterialized(
  req: RequirementRecord,
  now: number,
  materialized: readonly string[],
): void {
  const prev = req.rollback
  const seq = (typeof prev?.seq === 'number' && prev.seq > 0 ? prev.seq : 0) + 1
  const keepPrev = materialized.length === 0
  req.rollback = {
    // 撤销半边（applyRollbackRevocation）已经写过 from/to/at/by/reason；这里只补两个新字段，
    // 故不重新构造整条（重新构造就要把 from/to 再传一遍，两处口径必然漂移）。
    ...(prev ?? { from: req.status, to: req.status, at: now, by: { kind: 'system' as const } }),
    seq,
    ...(keepPrev
      ? (prev?.lastMaterialized !== undefined ? { lastMaterialized: [...prev.lastMaterialized] } : {})
      : { lastMaterialized: [...materialized] }),
  }
}
