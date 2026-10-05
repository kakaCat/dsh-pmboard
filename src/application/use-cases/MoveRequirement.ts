/**
 * MoveRequirement 用例（REQ-260927100007-b8ba FR-7 + FR-3）——agent 侧需求阶段推进。
 *
 * 语义与看板移动 HTTP 路由逐条对齐（先产物闸门、后状态机；预检 + mutate 内复查防并发），
 * 额外加 FR-3 的任务完整性守卫。**五道人工门 agent 一律不可越过**——由 assertReqTransition
 * 在收敛点（transitionRequirement）内抛 human_gate，本用例不做任何绕过。
 *
 * @module dsh-pmboard/application/use-cases/MoveRequirement
 */
import type { UseCaseDeps } from '../ports.js'
import { canWrite, firstWritableBound, seatOfSummary } from '../../application/internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { asReqStatus, normalizeText } from '../../shared/protocol.js'
import { assertArtifactGates } from '../internal/artifact-gates.js'
import { taskCompletenessGap } from '../internal/task-completeness.js'
// 回退方向判定（FR-1）与回退编排单点（FR-3/FR-4/FR-5）：两侧入口共用同一处实现。
import { isRollback } from '../../domain/requirement/RollbackSpec.js'
import { applyRequirementRollback, recordRollbackMaterialized, resetInjectionAfterRollback } from '../internal/rollback.js'
import { captureSnapshot, transitionRequirement } from '../internal/token-usage.js'
import { reject, agentIdFromExec, requireLiveDriver, mapAgentError } from '../internal/support.js'
import { fmt } from '../../domain/text/fmt.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent, mutateQueue, createManyQueue } from './queue-access.js'
// REQ-261004065652-5c1c FR-9：走进终态即收回自动意图（预防半边，两条入口共用一份实现）。
import { disarmDiveOnTerminal } from '../internal/terminal-disarm.js'

export async function executeMoveRequirement(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { requirement_id?: unknown; to?: unknown; reason?: unknown }
  const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
  const to = asReqStatus(a.to)
  const reason = normalizeText(a.reason, 'reason', 500)

  // t8/B11：绑定读走新端口（只读摘要）
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
  if (bound.length === 0) reject('reqboard_move 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
  if (picked === undefined) {
    reject(fmt('reqboard_move 未执行：需求 {id} 不是本窗口绑定的进行中需求', { id: explicitId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // FR-3（REQ-261003215944-9e04）：推进阶段是 **owner-only** 动作。
  // worker 可以领卡干活、可以汇报，但推阶段/把关仍然只有 owner 能做——这条以前靠"一个窗口一条需求"隐含保证，
  // 席位模型下必须显式问一句"我在这条上是什么角色"。
  {
    const verdict = canWrite(seatOfSummary(picked, windowKey), 'move-requirement')
    if (!verdict.ok) {
      reject(
        fmt('reqboard_move 未执行：本席位无权推进需求阶段（只有 owner 能推，当前角色不是 owner）。{why}', { why: verdict.code }),
        verdict.code,
      )
    }
  }
  // 判据过了才取**整条**（下游断言产物闸门/完整性都要整条）；get() 可空 ⇒ 显式守卫
  const req0 = await requirementStoreOf(deps).get(picked.id)
  if (req0 === undefined) {
    reject(fmt('reqboard_move 未执行：需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
  }
  const from = req0.status

  // 任务已迁出台账（v9）：完整性判据的任务集从 TaskStore 取一次，预检与 mutate 内复查共用同一份
  // 快照（mutate 回调是同步契约，不能在回调里 await；并发漂移由需求侧 from 复查兜底）。
  const store = taskStoreOf(deps)
  const reqTasks = await store.listByRequirement(req0.id)

  // 只读预检（拒绝次序与会话侧一致：先产物闸门，后任务完整性）
  const preGate = assertArtifactGates(req0, from, to)
  if (preGate !== undefined) reject(fmt('reqboard_move 未执行：{msg}', { msg: preGate.message }), preGate.code)
  const preGap = taskCompletenessGap(req0, reqTasks, to)
  if (preGap !== undefined) reject(fmt('reqboard_move 未执行：{msg}', { msg: preGap }), 'REQBOARD_TASK_INCOMPLETE')

  const actor = { kind: 'agent' as const, sessionId: windowKey }
  const at = deps.clock.now()
  const rollbackReason = reason.length > 0 ? reason : '（未填理由）'
  const rollbackIds = { task: () => deps.ids.task(), comment: () => deps.ids.comment() }

  // ── 回退分支（REQ-261003204149-1e80 FR-1/FR-3/FR-4）──────────────────────
  // 先在**副本**上把编排算出来：编排「先算卡计划、后改需求」，抛错时真 req 一个字段未动。
  // 顺序纪律与既有 I-11 同款：**任务先写、需求后写**（队列与需求台账是两个存储）。
  const rollbackPre = isRollback(from, to)
    ? applyRequirementRollback(structuredClone(req0), reqTasks, from, to, at, actor, rollbackIds, rollbackReason)
    : undefined
  if (rollbackPre !== undefined) {
    // ① 任务先写：物化重做卡 → 取消旧卡（两者都是队列写）
    if (rollbackPre.taskPlan.reworkDrafts.length > 0) {
      await createManyQueue(deps, req0.id, rollbackPre.taskPlan.reworkDrafts)
    }
    if (rollbackPre.taskPlan.canceled.length > 0 || rollbackPre.taskPlan.resetTasks.length > 0) {
      // REQ-261004121649-bfa7 FR-1：一次写成「取消顶层父卡 + 复位子卡」两类整卡副本（写法一致）
      const canceledById = new Map(
        [...rollbackPre.taskPlan.canceled, ...rollbackPre.taskPlan.resetTasks].map(t => [t.id, t]),
      )
      await mutateQueue(deps, req0.id, (queueTasks) => {
        let touched = false
        for (const qt of queueTasks) {
          const c = canceledById.get(qt.id)
          if (c === undefined) continue
          qt.status = c.status
          qt.revisions = c.revisions
          qt.updatedAt = c.updatedAt
          touched = true
        }
        return touched ? queueTasks : undefined // 无变更不写盘
      })
    }
  }

  // 用例边界：domain 状态机抛 human_gate，agent 工具的传输码是 REQBOARD_HUMAN_GATE（FR-7 契约）。
  const result = await mutateIfPresent(requirementStoreOf(deps), req0.id, (req) => {
    if (req.status !== from) return undefined
    // mutate 内复查（防并发漂移）
    const gate = assertArtifactGates(req, req.status, to)
    if (gate !== undefined) throw Object.assign(new Error(gate.message), { code: gate.code })
    const gap = taskCompletenessGap(req, reqTasks, to)
    if (gap !== undefined) throw Object.assign(new Error(gap), { code: 'REQBOARD_TASK_INCOMPLETE' })
    // ② 需求后写：对**真 req** 重放编排的撤销半边（卡计划已在 ① 落库；此处重算结果幂等、丢弃即可）。
    if (rollbackPre !== undefined) {
      applyRequirementRollback(req, reqTasks, from, to, at, actor, rollbackIds, rollbackReason)
      // 记本次物化的卡 id（FR-4）：批量清理入口靠它划边界。必须在撤销半边之后——
      // 它补写的是同一个 req.rollback 对象上的两个新字段。
      recordRollbackMaterialized(
        req, at, rollbackPre.taskPlan.reworkDrafts.map((t) => t.id),
      )
    }
    // 收敛点：human_gate / invalid_transition / system_gate 在此抛错 → mutate 回滚，状态不变
    transitionRequirement(req, to, {
      at,
      actor,
      ...(reason.length > 0 ? { reason } : {}),
      snap: captureSnapshot(deps, windowKey),
    })
    // ③ 注入与断点重算（FR-6）：必须在状态转移**之后**——stampCheckpoint 按 req.status 现算，
    // 早一步会把断点算成旧阶段的下一步（那正是本卡要消灭的残留）。
    // FR-9：回退解除自动链的归因如实透传（工具路径 = agent）
    if (rollbackPre !== undefined) resetInjectionAfterRollback(req, at, actor)
    // REQ-261004065652-5c1c FR-9（**预防半边**）：需求走进终态即收回自动意图。
    // 为什么必须在这一刻做：归档后该记录落入冷侧只读（除"归档收口"外禁写 `dive`），
    // 事后再归一就写不动了——实测 3 条「已归档却还 armed」正是这样留下的自相矛盾状态。
    // 此刻 `before.status` 仍是旧状态（非冷），这一笔照常可写。看板路径共用同一实现。
    disarmDiveOnTerminal(req, { to, at, commentId: () => deps.ids.comment() })
    req.comments.push({
      id: deps.ids.comment(),
      body: fmt('[状态] {from} → {to}（reqboard_move{why}）', { from, to, why: reason.length > 0 ? '：' + reason : '' }),
      createdAt: at,
      createdBy: actor,
    })
    return { changed: true }
  }).catch(mapAgentError)
  const changed = result?.requirement
  return {
    success: true,
    requirement_id: req0.id,
    from,
    to,
    status: changed?.status ?? to,
    // 回退回执（FR-1）：四个键与 tools/MoveTool 的 output.schema 逐字对应；前进方向**整体省略**。
    ...(rollbackPre !== undefined
      ? {
          rollback: {
            artifacts_revoked: rollbackPre.revocation.artifactsRevoked,
            plan_approval_revoked: rollbackPre.revocation.planApprovalRevoked,
            tasks_canceled: rollbackPre.taskPlan.canceled.length,
            tasks_reworked: rollbackPre.taskPlan.reworkDrafts.length,
          },
        }
      : {}),
  }
}
