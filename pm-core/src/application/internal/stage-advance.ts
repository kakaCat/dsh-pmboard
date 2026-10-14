/**
 * **阶段推进方法**（2026-10-11 用户裁定：推进是一个业务方法，`MoveRequirement` 与人工门两条通道都调它；
 * driver 不参与推进，只推动 agent 去调工具）。
 *
 * 一次写盘做三件事（缺一都会留下可观测的自相矛盾中间态）：
 *   ① **落章** `from` 阶段达成位（前进时才算"本阶段已成"；回退/取消不落章）；
 *   ② **清当前 goal**（留墓碑；`paused` / `blocked` 不动 = 人的意图优先）：目标内核里
 *      `create` 只允许在"没有当前目标"时发生 —— 不清就永远建不出**新阶段**的目标（实测：确认推进后
 *      agent 不动，正是"旧目标占着槽位、新目标建不出来"）；
 *   ③ `transitionRequirement(from → to)`（校验/授权/事件/结算/阶段计数归零都在唯一助手里）。
 *
 * 为什么是**纯函数 + 就地改记录**：它必须落在调用方已有的 mutate 临界区里（`MoveRequirement` 的
 * 大 mutate 里还要跑产物门/回滚编排），不能自己再开一次写。
 *
 * @module dsh-pmboard/application/internal/stage-advance
 */
import type { ActorRef, RequirementRecord } from '../../protocol-domain.js'
import type { RequirementStatus } from '../../domain/requirement/RequirementStatus.js'
import { PIPELINE_ORDER } from '../../domain/requirement/RollbackSpec.js'
import { decodeGoal } from 'pm-goal'
import { transitionRequirement } from './token-usage.js'

/** `transitionRequirement` 的选项（原样透传，不改口径）。 */
interface TransitionOptsLike {
  at: number
  actor: ActorRef
  reason?: string
  snap?: unknown
  allowIllegalTransition?: boolean
}

export interface StageAdvanceOpts extends TransitionOptsLike {
  /** 目标阶段（唯一助手会做状态机校验/授权：门边按 actor 拒/放）。 */
  to: string
}

/** `to` 是否是 `from` 的**下一条前进边**（回退/取消/跳级都不算）。 */
export function isForwardNextStage(from: string, to: string): boolean {
  const i = (PIPELINE_ORDER as readonly string[]).indexOf(from)
  if (i < 0 || i >= PIPELINE_ORDER.length - 1) return false
  return PIPELINE_ORDER[i + 1] === to
}

/**
 * 就地推进一个需求的阶段（三个动作同一临界区）。调用方负责把 `at/actor/reason/snap` 给全。
 */
export function applyStageAdvance(req: RequirementRecord, opts: StageAdvanceOpts): void {
  const from = String(req.status)
  const to = String(opts.to ?? '')
  // ① 落章：只有**前进**才意味着"本阶段已成"
  if (isForwardNextStage(from, to) && req.goals !== undefined) {
    const hit = req.goals.find((g) => g.stage === from)
    if (hit !== undefined && hit.state !== 'done') {
      req.goals = req.goals.map((g) => (g.stage === from ? { ...g, state: 'done' as const } : g))
    }
  }
  // ② 清当前 goal：离开本阶段 = 这张工作单结束（对齐内核 `clearGoal`：摘掉当前目标 + 留墓碑）。
  //    为什么不 `complete`：内核 `create` 只在"没有当前目标"时成立，留一个已终态的目标会占住槽位，
  //    新阶段的目标永远建不出来（阶段推进后 agent 不动的实测形态）。
  //    为什么 `paused` / `blocked` 不动：那是**人的停手意图**，阶段推进无权替人解除。
  if (req.goal !== undefined) {
    const phase = decodeGoal(req.goal).phase
    if (phase !== 'paused' && phase !== 'blocked') {
      req.goalCleared = { id: req.goal.id, revision: req.goal.revision, clearedAt: opts.at }
      req.goal = undefined
    }
  }
  // ③ 迁移（唯一助手：校验 + 结算 + 事件 + dive 阶段计数归零）
  transitionRequirement(req, to as RequirementStatus, {
    at: opts.at,
    actor: opts.actor,
    ...(opts.reason === undefined ? {} : { reason: opts.reason }),
    ...(opts.snap === undefined ? {} : { snap: opts.snap as never }),
    ...(opts.allowIllegalTransition === true ? { allowIllegalTransition: true } : {}),
  })
}
