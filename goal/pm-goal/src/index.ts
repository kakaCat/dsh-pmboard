/**
 * pm-goal 服务本体（对齐宿主 `@deepseek-ai/dsh-goal/src/index.ts`：宿主在该文件装配服务，
 * 这里装配 pm 的 goal 读写；区别是宿主用 cordis 注入，pm 用**结构化端口契约**注入）。
 *
 * 分层：`types`（纯类型）→ `domain`（事件词汇）→ `fold`（纯折叠/判据）→ `runtime`（构造器/常量）
 * → 本文件（I/O 编排 + 幂等）。
 *
 * 【三条纪律】
 *   ① 写一律经 `applyGoalEvent` / `applyStageGoalDone` 纯函数——本文件不自己拼状态；
 *   ② 幂等：纯函数说 `changed:false` → 本文件零写入（不写盘、不 bump revision）；
 *   ③ 达成位（StageGoal done）**只允许人工门落章路径调用**（D-4），agent 自写 = 越权。
 *
 * @module dsh-pmboard/goal
 */
import {
  applyStageGoalDone, applyGoalEvent, defineStageGoals, goalsProgressOf, readyToClose, validateStageGoals,
} from './fold.js'
import { GoalError, TaskGoalId } from './runtime.js'
import type {
  EditTaskGoalRequest, GoalActivation, GoalBlockReason, GoalPhase, GoalView, StageGoal, TaskGoal,
} from './types.js'

// 选择性再导出（对齐宿主 index 的做法）：types 的 `TaskGoalId`（类型）与 runtime 的
// `TaskGoalId()`（构造器）同名，`export type *` + `export *` 会撞——类型改以 `TaskGoalIdType` 露出。
export type {
  GoalPhase, GoalRef, GoalActivation, GoalBlockReason, GoalView, TaskGoal, StageGoal, StageGoalProgress,
  CreateTaskGoalRequest, CreateTaskGoalResult, EditTaskGoalRequest, TaskGoalId as TaskGoalIdType,
} from './types.js'
export type {
  GoalEvent, GoalOperation, GoalChange, GoalChangeActor, GoalRejection, GoalPhaseView,
  GoalClear, GoalRefRef, GoalMessageSource,
} from './domain.js'
export * from './fold.js'
export * from './runtime.js'
export * from './invariant.js'

/** 任务侧最小读取面（core 的 `TaskRecord` 结构兼容）。 */
export interface GoalTaskLike {
  readonly id: string
  readonly status: string
  readonly goal?: TaskGoal
  /** clear 的**墓碑**（对齐宿主 tombstone + seenGoalIds：按 id 留痕，拒同 id 复用）。 */
  readonly goalCleared?: { readonly id: string; readonly revision: number; readonly clearedAt: number }
}

/** 任务队列写通道（`undefined` = 无变更、不写盘）。 */
export interface GoalTaskStoreLike {
  listByRequirement(requirementId: string): Promise<readonly GoalTaskLike[]>
  mutate(
    requirementId: string,
    fn: (tasks: GoalTaskLike[]) => GoalTaskLike[] | undefined,
  ): Promise<unknown>
}

/** 需求侧最小读取面（core 的 `RequirementRecord` 结构兼容）。 */
export interface GoalRequirementLike {
  goals?: StageGoal[]
  updatedAt?: number
}

/** 台账写通道（返回 `changed`；幂等判据以它为准）。 */
export interface GoalRequirementStoreLike {
  get(id: string): Promise<GoalRequirementLike | undefined>
  mutate(
    id: string,
    fn: (draft: GoalRequirementLike) => unknown,
  ): Promise<{ readonly changed?: boolean }>
}

/** 服务依赖（对齐宿主服务构造期注入的 ctx 面）。 */
export interface GoalDeps {
  taskStore: GoalTaskStoreLike
  store: GoalRequirementStoreLike
  /** 时间源由调用方注入（本包不读系统时钟）。 */
  now: () => number
}

/**
 * CAS 校验（对齐宿主 `goalRef(goal_id, revision)` 的乐观锁）：
 * 调用方给了期望 revision 就必须对上——对不上说明**它是照着旧快照在改**，必须拒。
 *
 * 为什么必须拒：goal 的相位与 revision 是"同一件事的两个面"；放过陈旧引用 =
 * 让后到的写覆盖先到的决定（pm 里同一张卡可能被驱动拍与人工同时改）。
 */
function assertRevision(current: { readonly revision: number } | undefined, expected?: number): void {
  if (expected === undefined) return
  if (current === undefined) throw new GoalError('目标不存在，无法按 revision 更新', 'GOAL_NOT_FOUND')
  if (current.revision !== expected) {
    throw new GoalError(
      '目标已被别处改过（期望 revision=' + expected + '，当前=' + current.revision + '）——请先 get 再改',
      'GOAL_CONFLICT',
    )
  }
}

/** 卡的开闭判据（与 core 的实施链 'open work' 口径一致）：done / canceled = 已收口。 */
function isOpenTask(status: string): boolean {
  return status !== 'done' && status !== 'canceled'
}

/**
 * 卡开工：建 L2 目标（判据复用卡片 `acceptance` 的陈述面，D-1）。
 * 幂等：同卡同陈述重放零写入（`applyGoalEvent` 的 create 幂等分支）。
 */
export async function createTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, objective: string,
): Promise<boolean> {
  let changed = false
  await deps.taskStore.mutate(requirementId, (tasks) => {
    const i = tasks.findIndex((t) => t.id === taskId)
    if (i < 0) return undefined
    // seenGoalIds 的等价物（对齐宿主）：清过的 goal 身份**不许复用**——
    // 否则"做了一半被清掉"这段历史会被重建伪装成"从未有过目标"。
    if (tasks[i].goal === undefined && tasks[i].goalCleared !== undefined) {
      throw new GoalError(
        '该卡的目标已被 clear（墓碑 id=' + String(tasks[i].goalCleared?.id) + '）——新建请换一张卡或先说明为何重开',
        'GOAL_IDENTITY_CONFLICT',
      )
    }
    const r = applyGoalEvent(tasks[i].goal, {
      kind: 'create',
      goal: { id: TaskGoalId(taskId), taskId, objective },
    })
    if (!r.changed || r.next === undefined) return undefined
    tasks[i] = { ...tasks[i], goal: r.next }
    changed = true
    return tasks
  })
  return changed
}

/** 卡完成 → goal complete（FR-3）。幂等：已 complete 零写入。 */
export async function completeTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, expectedRevision?: number,
): Promise<boolean> {
  return mutateTaskGoal(deps, requirementId, taskId, { kind: 'complete' }, expectedRevision)
}

/** 卡中断 → goal paused + 原因（FR-3）。 */
export async function pauseTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, reason?: GoalBlockReason, expectedRevision?: number,
): Promise<boolean> {
  return mutateTaskGoal(deps, requirementId, taskId, { kind: 'pause', ...(reason === undefined ? {} : { reason }) }, expectedRevision)
}

/**
 * 改目标（对齐宿主 `edit`）：换陈述 / 换回合上限，**至少要给一项**。
 * 幂等：同值重放零写入。
 */
export async function editTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string,
  edit: EditTaskGoalRequest, expectedRevision?: number,
): Promise<boolean> {
  return mutateTaskGoal(deps, requirementId, taskId, {
    kind: 'edit',
    ...(edit.objective === undefined ? {} : { objective: edit.objective }),
    ...(edit.maxGoalRounds === undefined ? {} : { maxGoalRounds: edit.maxGoalRounds }),
  }, expectedRevision)
}

/** 人/系统继续：paused / blocked → active（FR-3）。 */
export async function resumeTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, expectedRevision?: number,
): Promise<boolean> {
  return mutateTaskGoal(deps, requirementId, taskId, { kind: 'resume' }, expectedRevision)
}

/** 阻塞（等上游/等人裁）：必须给原因（FR-3）。 */
export async function blockTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, reason: GoalBlockReason, expectedRevision?: number,
): Promise<boolean> {
  return mutateTaskGoal(deps, requirementId, taskId, { kind: 'block', reason }, expectedRevision)
}

/** clear 的墓碑（对齐宿主 GoalClearChangeMeta）：按 id 留痕，供 seenGoalIds 拒复用。 */
export interface TaskGoalClear {
  readonly id: string
  readonly revision: number
  readonly clearedAt: number
}

/**
 * 清目标（对齐宿主 `clear`）：把 goal 从卡上摘掉，**保留墓碑**。
 *
 * 幂等：本来就没有 → changed:false。
 */
export async function clearTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string,
): Promise<{ changed: boolean; cleared?: TaskGoalClear }> {
  let cleared: TaskGoalClear | undefined
  await deps.taskStore.mutate(requirementId, (tasks) => {
    const i = tasks.findIndex((t) => t.id === taskId)
    if (i < 0) return undefined
    const goal = tasks[i].goal
    if (goal === undefined) return undefined
    cleared = { id: goal.id, revision: goal.revision, clearedAt: deps.now() }
    // 墓碑挂回任务（`goalCleared`；宿主同名件的 pm 载体），供 seenGoalIds 拒复用。
    tasks[i] = { ...tasks[i], goal: undefined, goalCleared: cleared } as never
    return tasks
  })
  return cleared === undefined ? { changed: false } : { changed: true, cleared }
}

/**
 * 聚合视图（对齐宿主 `GoalView`）：快照 + **派生只读**的计数与许可。
 * 计数权威 = core 的 `dive.roundsInStage`；许可权威 = core 的 `dive.activation`（本包不另存）。
 */
export async function goalViewOf(
  deps: GoalDeps, requirementId: string, taskId: string,
): Promise<GoalView | undefined> {
  const goal = await taskGoalOf(deps, requirementId, taskId)
  if (goal === undefined) return undefined
  const record = await deps.store.get(requirementId)
  const dive = (record as { dive?: { roundsInStage?: number; activation?: GoalActivation } } | undefined)?.dive
  return {
    goal,
    roundsStarted: dive?.roundsInStage ?? 0,
    activation: dive?.activation ?? 'armed',
  }
}

type TaskGoalEvent =
  | { kind: 'complete' } | { kind: 'resume' }
  | { kind: 'edit'; objective?: string; maxGoalRounds?: number }
  | { kind: 'pause'; reason?: GoalBlockReason } | { kind: 'block'; reason: GoalBlockReason }

async function mutateTaskGoal(
  deps: GoalDeps, requirementId: string, taskId: string, event: TaskGoalEvent, expectedRevision?: number,
): Promise<boolean> {
  // CAS 在 mutate **之前**校验（写前拒，而不是写完再回滚）：读的与写的是同一份队列快照。
  if (expectedRevision !== undefined) {
    const tasks = await deps.taskStore.listByRequirement(requirementId)
    assertRevision(tasks.find((t) => t.id === taskId)?.goal, expectedRevision)
  }
  let changed = false
  await deps.taskStore.mutate(requirementId, (tasks) => {
    const i = tasks.findIndex((t) => t.id === taskId)
    if (i < 0) return undefined
    const r = applyGoalEvent(tasks[i].goal, event)
    if (!r.changed || r.next === undefined) return undefined
    tasks[i] = { ...tasks[i], goal: r.next }
    changed = true
    return tasks
  })
  return changed
}

/**
 * FR-4 判据读：该需求**当前在跑卡的 goal 相位**（driver 的 `goalPhaseFor` 实现）。
 *
 * 取卡口径：队列顺序（= 执行顺序）里第一张"开着且有 goal"的卡（`running` 优先）。
 * 无开着的卡 / 都没有 goal ⇒ `undefined` = 未启用 goal 能力 → driver 放行（缺失语义）。
 */
export async function goalPhaseOf(
  deps: Pick<GoalDeps, 'taskStore'>, requirementId: string,
): Promise<GoalPhase | undefined> {
  const tasks = await deps.taskStore.listByRequirement(requirementId)
  const open = tasks.filter((t) => isOpenTask(String(t.status)))
  const running = open.find((t) => String(t.status) === 'running' && t.goal !== undefined)
  return (running ?? open.find((t) => t.goal !== undefined))?.goal?.phase
}

/** 单卡 goal 读（不存在 / 未启用 ⇒ undefined；缺失 ≠ 未开始）。 */
export async function taskGoalOf(
  deps: Pick<GoalDeps, 'taskStore'>, requirementId: string, taskId: string,
): Promise<TaskGoal | undefined> {
  const tasks = await deps.taskStore.listByRequirement(requirementId)
  return tasks.find((t) => t.id === taskId)?.goal
}

/** 需求当前的阶段目标表（无 ⇒ 空数组；空数组的收口判据恒 false）。 */
export async function stageGoalsOf(
  deps: Pick<GoalDeps, 'store'>, requirementId: string,
): Promise<readonly StageGoal[]> {
  const req = await deps.store.get(requirementId)
  return req?.goals ?? []
}

/** 阶段目标进度（有界计数；未启用 ⇒ undefined）。 */
export async function stageProgressOf(
  deps: Pick<GoalDeps, 'store'>, requirementId: string,
): Promise<ReturnType<typeof goalsProgressOf>> {
  return goalsProgressOf(await stageGoalsOf(deps, requirementId))
}

/**
 * L1 阶段目标表登记/替换（整体语义；幂等：同值零写入）。
 *
 * 校验（INV）：stage 非空且不重复、statement 非空——非法输入抛错（**不静默丢弃**：
 * 静默丢会让"我登记了"与"台账里没有"分不清）。
 */
export async function setStageGoals(
  deps: GoalDeps, requirementId: string, goals: readonly StageGoal[], allowedStages?: readonly string[],
): Promise<boolean> {
  validateStageGoals(goals, allowedStages)
  const res = await deps.store.mutate(requirementId, (r) => {
    const applied = defineStageGoals(r.goals ?? [], goals)
    if (!applied.changed) return undefined
    r.goals = [...applied.next]
    r.updatedAt = deps.now()
    return { changed: true }
  })
  return res.changed === true
}

/** L1 收口判据读：全部阶段目标达成 ⇒ 具备收口条件（缺失 ≠ 达成）。 */
export async function readyToCloseOf(
  deps: Pick<GoalDeps, 'store'>, requirementId: string,
): Promise<boolean> {
  return readyToClose(await stageGoalsOf(deps, requirementId))
}

/**
 * "需求不存在"错误码（镜像 core 的 store 端口契约 `REQUIREMENT_STORE_ERROR.NOT_FOUND`）。
 * 刻意写字面量：pm-goal 不 import core（依赖只向内），故此处是其**唯一**契约副本，
 * 改契约时两侧一起改（core 侧有结构兼容断言测试兜着）。
 */
const REQBOARD_NOT_FOUND = 'REQBOARD_NOT_FOUND'

/**
 * L1 达成位写入（D-4：**人工门落章路径专属**）。
 * 幂等：已 done / 该阶段不在表内 → 零写入。
 */
export async function markStageGoalDone(
  deps: GoalDeps, requirementId: string, stage: string,
): Promise<boolean> {
  try {
    const res = await deps.store.mutate(requirementId, (r) => {
      const goals = applyStageGoalDone(r.goals ?? [], stage)
      if (!goals.changed) return undefined
      r.goals = [...goals.next]
      r.updatedAt = deps.now()
      return { changed: true }
    })
    // 幂等判据以**写盘结果**为准（不是"函数被调用了"）：changed:false = 无变更、未写盘。
    return res.changed === true
  } catch (err) {
    if ((err as { code?: string }).code === REQBOARD_NOT_FOUND) return false
    throw err
  }
}
