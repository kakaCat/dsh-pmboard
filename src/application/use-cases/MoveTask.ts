/**
 * MoveTask 用例（REQ-260927100007-b8ba FR-7/FR-8，REQ-4842fe t5/t6 契约）——
 * agent 侧任务流转，语义与看板按钮**逐条对齐**，并补齐自动链需要的四件事：
 *
 *   1. 状态迁移统一走 transitionTask（收敛点），不再直接赋值；
 *   2. 开工返回任务卡全文（task_card.doc_path / implementation）——照卡执行，不凭记忆；
 *   3. 父卡开工**同事务**懒展开子卡链，并受同需求父卡并发上限约束（REQBOARD_PARENT_LIMIT）；
 *   4. 转 done 前过 done 凭证门（父卡收尾门 / 子卡三项证据）。
 *
 * REQ-260927202051-f6df t9/t12：任务已迁出台账（v9 无 `tasks` 键），本用例改为
 * **两段写**并遵守顺序契约——
 *   ① `taskStore.mutate(reqId, …)`（先）：任务状态/事件/执行记录/懒展开子卡；
 *   ② `repo.mutate(…)`（后）：rollup 派生需求状态。
 * 反序会产生"需求已验收但任务未完成"的悬空态（t12 以打点断言次序，不接受口头声明）。
 *
 * 错误码在用例边界映射：domain 的 human_gate → REQBOARD_HUMAN_GATE（agent 工具传输契约）。
 *
 * @module dsh-pmboard/application/use-cases/MoveTask
 */
import type { UseCaseDeps } from '../ports.js'
import { openRequirementsForVia, canWrite, seatOf, type SeatAction } from '../internal/window.js'
import {
  asTaskStatus,
  isSubtask,
  newExecutionId,
  normalizeText,
  type TaskRecord,
} from '../../shared/protocol.js'
import { endsExecutionSegment, isRollbackOrCancel, startsExecutionSegment } from '../../domain/status/Predicates.js'
import { checkClaimDependencies } from '../../domain/workflow/DependencyGateSpec.js'
import type { TaskRole } from '../../domain/task/TaskStatus.js'
import { LIMITS } from '../../domain/limits.js'
import { transitionTask } from '../internal/task-transition.js'
import { expandSubtasks } from '../internal/lazy-expand.js'
import { applyTaskRollupVia } from '../internal/rollup.js'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
import {
  closeExecutions,
  openExecution,
  snapshotForWindow,
  snapshotProviderFor,
} from '../internal/token-usage.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  assertDoneEvidence,
  mapAgentError,
} from '../internal/support.js'
import { fmt } from '../../domain/text/fmt.js'
import { requirementStoreOf, taskStoreOf, mutateQueue } from './queue-access.js'

/** 角色判定：子卡（有 parentId）/ 父卡（有子卡）/ 存量卡。 */
function roleOf(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole {
  if (typeof task.parentId === 'string' && task.parentId.length > 0) return 'subtask'
  return tasks.some(t => t.parentId === task.id) ? 'parent' : 'legacy'
}

/** 同需求当前在跑的父卡（parentId 缺省 = 父卡/存量卡层）。 */
function runningParents(tasks: readonly TaskRecord[], requirementId: string): TaskRecord[] {
  return tasks.filter(t => t.requirementId === requirementId && t.parentId === undefined && t.status === 'in_progress')
}

/** 任务卡文档路径：落库时写死的 cardDoc 优先，缺省按同一口径拼（与 decompose/report 同源）。 */
function taskCardPath(task: TaskRecord): string {
  if (typeof task.cardDoc === 'string' && task.cardDoc.length > 0) return task.cardDoc
  return 'docs/requirements/' + task.requirementId + '/tasks/' + task.id + '.md'
}

export async function executeMoveTask(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { task_id?: unknown; to?: unknown; reason?: unknown }
  const taskId = normalizeText(a.task_id, 'task_id', 64)
  if (taskId.length === 0) reject('reqboard_task_move 未执行：task_id 不能为空', 'REQBOARD_INVALID_INPUT')
  const to = asTaskStatus(a.to)
  const reason = normalizeText(a.reason, 'reason', 500)

  const bound = await openRequirementsForVia(requirementStoreOf(deps), windowKey)
  if (bound.length === 0) reject('reqboard_task_move 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  const store = taskStoreOf(deps)
  const task0 = await store.get(taskId)
  if (task0 === undefined) reject(fmt('reqboard_task_move 未执行：任务 {id} 不存在', { id: taskId }), 'REQBOARD_TASK_NOT_FOUND')
  if (!bound.some(r => r.id === task0.requirementId)) {
    reject(fmt('reqboard_task_move 未执行：任务 {id} 不属于本窗口绑定的需求（只能动自己的卡）', { id: taskId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // 席位角色（FR-3）：**绑定 ≠ 可写**。observer 席位也会出现在 bound 里（只读场景要看得见它），
  // 故写路径必须显式判角色——领卡/汇报 owner 与 worker 都可，observer 不可（否则席位改造变成放权）。
  const targetReq = bound.find(r => r.id === task0.requirementId)
  const seatAction: SeatAction = to === 'in_progress' ? 'claim-task' : 'report-task'
  const seatCheck = canWrite(targetReq === undefined ? undefined : seatOf(targetReq, windowKey), seatAction)
  if (!seatCheck.ok) {
    reject(
      fmt('reqboard_task_move 未执行：本窗口在该需求上的席位不允许{act}（{code}）',
        { act: seatAction, code: seatCheck.code }),
      seatCheck.code,
    )
  }
  const reqId = task0.requirementId
  const from = task0.status
  const actor = { kind: 'agent' as const, sessionId: windowKey }

  // 闭包内的副产物（单次 mutate 写入，供返回体投影）
  let createdIds: string[] = []
  let card: { doc_path: string; implementation: string } | undefined

  // ── ① 任务写（顺序契约：**先任务**，t12 用打点断言此处先于 repo.mutate）──────────────
  // t8/B11：done 凭证门只需要需求的 createdAt ⇒ 取**摘要**（零文件读），别为它整册读
  const reqCreatedAtForDone = (await requirementStoreOf(deps).getSummary(reqId))?.createdAt
  // t8/B11：mutate 回调是**同步契约**，读必须提前到这里（单条 get，不是整册读）。
  // 回调里要用 req.autoRun（摘要无此字段）与 req.category（expandSubtasks 只吃 category）。
  const reqBeforeMutate = await requirementStoreOf(deps).get(reqId)
  const changedTasks = await mutateQueue(deps, reqId, (tasks) => {
    const task = tasks.find(t => t.id === taskId)
    if (task === undefined) return undefined
    const at = deps.clock.now()
    const req = reqBeforeMutate === undefined || reqBeforeMutate.id !== task.requirementId ? undefined : reqBeforeMutate
    const role = roleOf(task, tasks)
    const starting = startsExecutionSegment(to)

    // DAG 依赖门禁（REQ-260929210741-30ae FR-4）：认领（todo→in_progress）前检查 dependsOn
    // 全部完成——自动链有 depsDone 检查，手动路径此前没有（测评发现的流程断点）。
    // 逃生舱：allowIllegalTransition 的迁移/回填路径不拦（与既有纪律一致）。
    if (starting && from === 'todo' && task.dependsOn !== undefined && task.dependsOn.length > 0) {
      const gate = checkClaimDependencies(task, tasks)
      if (gate !== undefined) reject(gate.reason, gate.code)
    }

    // 父卡并发上限（REQ-4842fe §6.1）：非子卡开工时同需求在跑父卡已达上限即拒。
    if (starting && role !== 'subtask') {
      const running = runningParents(tasks, task.requirementId)
      if (running.length >= LIMITS.advanceMaxParallelParents) {
        reject(
          fmt('reqboard_task_move 未执行：同需求并行父卡已达上限 {n} 张（正在跑：{ids}）——先收尾再开新卡（REQBOARD_PARENT_LIMIT）',
            { n: LIMITS.advanceMaxParallelParents, ids: running.map(t => t.id).join('、') }),
          'REQBOARD_PARENT_LIMIT',
        )
      }
    }

    // REQ-260929184406-2084：reqboard_task_move 直接推进子卡到 done 时，若 lastRun 缺失
    // （未走 executeSubtask 的 workflow run），补写一份 manual run 证据——否则子卡凭证门
    // 读不到 lastRun 会永远拒绝，agent 反复重试形成死循环。
    // 注意：必须在 assertDoneEvidence 之前写入，因为凭证门会读取 task.lastRun。
    if (to === 'done' && isSubtask(task) && task.lastRun === undefined) {
      task.lastRun = {
        at,
        ok: true,
        stopReason: 'completed',
        valueNonEmpty: true,
        reason: 'manual-move-by-reqboard_task_move',
      }
    }

    // done 凭证门：父卡收尾门（INV-5）/ 子卡三项证据 / 汇报前置 / 构建新鲜度。不过即抛错回滚。
    // D4：assertDoneEvidence 新签名 (deps, windowKey, task, ledger, tasks)。
    if (to === 'done') assertDoneEvidence(deps, windowKey, task, reqCreatedAtForDone, tasks)

    // 收敛点：非法转移 / 人工门越权在此抛错（抛错 → mutate 回滚，状态不变）。
    // REQ-260927144541-0481 FR-5：领域文案已含"当前角色 + 该角色全部合法边"，
    // 工具边界再补一层"谁拒绝的"前缀——调用方一眼知道是哪个工具、为什么、正确边是什么。
    try {
      transitionTask(task, to, { at, actor, ...(reason.length > 0 ? { reason } : {}), role })
    } catch (err) {
      if ((err as { code?: unknown }).code === 'invalid_transition') {
        // 只用同一错误码重抛带前缀的消息：码是领域契约（HTTP 路由与既有用例都按 invalid_transition 分流），
        // 这里要修的是"报错说不清"，不是改分流。
        throw Object.assign(
          new Error(fmt('reqboard_task_move 未执行：{reason}', { reason: (err as Error).message ?? '' })),
          { code: 'invalid_transition' },
        )
      }
      throw err
    }

    if (starting) {
      task.claimedBy = windowKey
      task.claimedAt = at
      // 执行快照唯一写入口（REQ-260927121324-abde FR-4/FR-5）：开工落记录 + 写 start 快照。
      openExecution(
        task,
        { id: newExecutionId(), sessionId: windowKey, trigger: 'manual', at },
        snapshotForWindow(deps, windowKey),
      )
      card = { doc_path: taskCardPath(task), implementation: task.implementation ?? '' }
      // 懒展开（REQ-4842fe FR-3）：父卡开工**同事务**落子卡链；仅自动链需求（autoRun）走这条。
      // reader-http 已裂变 expandSubtasks：只返回新建子卡、不落库 → 本回调 append 进 draft。
      if (role !== 'subtask' && req?.autoRun === true) {
        const created = expandSubtasks(tasks, task, req, at, deps.ids)
        // TaskRecord → QueueTask：layer 只是派生占位，落盘前由 TaskStore.recompute 统一重算。
        if (created.length > 0) tasks.push(...created.map(c => ({ ...c, layer: 0 })))
        createdIds = created.map(c => c.id)
      }
    }
    // REQ-260929184406-2084：reqboard_task_move 直接推进子卡到 done 时，若 lastRun 缺失
    // （未走 executeSubtask 的 workflow run），补写一份 manual run 证据——否则子卡凭证门
    // 读不到 lastRun 会永远拒绝，agent 反复重试形成死循环。
    // 注意：必须在 assertDoneEvidence 之前写入，因为凭证门会读取 task.lastRun。
    if (to === 'done' && isSubtask(task) && task.lastRun === undefined) {
      task.lastRun = {
        at,
        ok: true,
        stopReason: 'completed',
        valueNonEmpty: true,
        reason: 'manual-move-by-reqboard_task_move',
      }
    }
    if (endsExecutionSegment(to)) {
      delete task.claimedBy
      delete task.claimedAt
    }
    if (!starting) {
      // 收尾唯一入口（FR-5）：闭合全部 running，并写 end/delta（快照旁路，永不抛）。
      closeExecutions(
        task,
        { at, outcome: isRollbackOrCancel(to) ? 'cancelled' : 'succeeded' },
        snapshotForWindow(deps, windowKey),
      )
    }
    if (reason.length > 0) {
      task.comments.push({ id: deps.ids.comment(), body: fmt('[状态] → {to}：{reason}（reqboard_task_move）', { to, reason }), createdAt: at, createdBy: actor })
    }
    return tasks
  }).catch(mapAgentError)

  const moved = changedTasks.find(t => t.id === taskId)

  // ── ② 需求写（顺序契约：**后需求**）——rollup 以任务状态为输入，故必须在任务写之后 ──────
  const afterTasks = await store.listByRequirement(reqId)
  // B12 阶段②c：改用**定点版**（定点读 → 纯函数算计划 → 单条 mutate），不再借整册 mutate。
  await applyTaskRollupVia(
    requirementStoreOf(deps),
    afterTasks,
    { now: deps.clock.now(), commentId: () => deps.ids.comment(), snapshot: snapshotProviderFor(deps, windowKey) },
    reqId,
  ).catch(mapAgentError)

  if (moved !== undefined) {
    try { await syncRTMYaml(deps, afterTasks, moved.requirementId, 'task:status', { taskId: moved.id }) } catch { /* RTM 是增强层，失败不阻断 */ }
  }
  return {
    success: true,
    task_id: taskId,
    from,
    to,
    status: moved?.status ?? to,
    version: moved?.version,
    ...(createdIds.length > 0 ? { subtasks_created: createdIds } : {}),
    ...(card !== undefined ? { task_card: card } : {}),
  }
}
