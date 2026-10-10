/**
 * goal 的**纯折叠与判据**（对齐宿主 `@deepseek-ai/dsh-goal/src/fold.ts`：
 * 宿主在这里放 `emptyGoalFoldState` 与 `applyGoalEvent`——纯 replay 折叠）。
 *
 * 三条纪律（同宿主）：
 *   ① 事件表是**唯一一份**状态规则——goal 的全部写路径都经这里；
 *   ② 事件在当前状态下不成立 → `changed:false`，调用方**必须零写入**（幂等是硬语义）；
 *   ③ 零 I/O、不读时钟、不抛异常（非法迁移返回原因）。
 *
 * @module dsh-pmboard/goal/fold
 */
import type { GoalEvent } from './domain.js'
import { GOAL_CHANGE_VERSION } from './runtime.js'
import type { GoalPhase, StageGoal, StageGoalProgress, TaskGoal } from './types.js'

/** 折叠累加器（对齐宿主 GoalFoldState；goal 为当前快照）。 */
/** 折叠态（对齐宿主 `GoalFoldState` 的最小面：当前快照 + 已见身份）。 */
export interface GoalFoldState {
  goal: TaskGoal | undefined
  /** 已出现过的 goal 身份（含被 clear 的）——拒绝同 id 复用。 */
  seenGoalIds?: string[]
}

/** 折叠结果（对齐宿主 `FoldedGoal`）。 */
export interface FoldedGoal {
  readonly goal: TaskGoal | undefined
  readonly seenGoalIds: readonly string[]
}

/** 空折叠态（对齐宿主 emptyGoalFoldState）。 */
export function emptyGoalState(): GoalFoldState {
  return { goal: undefined }
}

export interface GoalFoldResult {
  /** false = 事件在当前状态下不成立（调用方必须零写入）。 */
  changed: boolean
  /** 变更后的 goal；`changed:false` 时与入参同值（含 undefined）。 */
  next: TaskGoal | undefined
  /** `changed:false` 的人话原因（进日志/诊断，不进台账）。 */
  reason?: string
}

function no(goal: TaskGoal | undefined, reason: string): GoalFoldResult {
  return { changed: false, next: goal, reason }
}

function yes(next: TaskGoal): GoalFoldResult {
  return { changed: true, next }
}

/** complete 是终态：任何事件都不再改写（重开 = 新建 goal）。 */
function isOpenPhase(phase: GoalPhase): boolean {
  return phase !== 'complete'
}

/**
 * 把一个事件折进当前 goal（唯一入口，纯函数：同输入必同输出）。
 * 对齐宿主 `applyGoalEvent(state, event)` 的形态，但只返回折叠结果（不持有累加器）。
 */
export function applyGoalEvent(current: TaskGoal | undefined, event: GoalEvent): GoalFoldResult {
  switch (event.kind) {
    case 'create': {
      if (current === undefined) {
        return yes({ ...event.goal, phase: 'active', revision: 1 })
      }
      // 幂等重建：身份与陈述一致 → 零写入（开工重试不得重置相位）。
      if (current.id === event.goal.id && current.taskId === event.goal.taskId
        && current.objective === event.goal.objective) {
        return no(current, 'create:idempotent-replay')
      }
      return no(current, 'create:identity-conflict')
    }
    case 'edit': {
      if (current === undefined) return no(undefined, 'edit:no-goal')
      const objective = event.objective?.trim()
      if ((objective === undefined || objective === '') && event.maxGoalRounds === undefined) {
        return no(current, 'edit:nothing-to-change')
      }
      if (event.maxGoalRounds !== undefined && (!Number.isInteger(event.maxGoalRounds) || event.maxGoalRounds <= 0)) {
        return no(current, 'edit:bad-round-cap')
      }
      const nextObjective = objective === undefined || objective === '' ? current.objective : objective
      const nextCap = event.maxGoalRounds ?? current.maxGoalRounds
      if (nextObjective === current.objective && nextCap === current.maxGoalRounds) {
        return no(current, 'edit:idempotent-replay')
      }
      return yes({ ...current, objective: nextObjective, maxGoalRounds: nextCap, revision: current.revision + 1 })
    }
    case 'pause': {
      if (current === undefined) return no(undefined, 'pause:no-goal')
      if (current.phase !== 'active') return no(current, 'pause:not-active:' + current.phase)
      return yes({ ...current, phase: 'paused', revision: current.revision + 1 })
    }
    case 'resume': {
      if (current === undefined) return no(undefined, 'resume:no-goal')
      if (current.phase !== 'paused' && current.phase !== 'blocked') {
        return no(current, 'resume:not-resumable:' + current.phase)
      }
      return yes({ ...current, phase: 'active', blockedReason: undefined, revision: current.revision + 1 })
    }
    case 'block': {
      if (current === undefined) return no(undefined, 'block:no-goal')
      if (!isOpenPhase(current.phase)) return no(current, 'block:terminal')
      if (event.reason.message.trim() === '' || event.reason.code.trim() === '') {
        return no(current, 'block:reason-required')
      }
      if (current.phase === 'blocked' && current.blockedReason?.code === event.reason.code
        && current.blockedReason.message === event.reason.message) {
        return no(current, 'block:idempotent-replay')
      }
      return yes({ ...current, phase: 'blocked', blockedReason: event.reason, revision: current.revision + 1 })
    }
    case 'complete': {
      if (current === undefined) return no(undefined, 'complete:no-goal')
      if (!isOpenPhase(current.phase)) return no(current, 'complete:terminal')
      return yes({ ...current, phase: 'complete', blockedReason: undefined, revision: current.revision + 1 })
    }
  }
}

/**
 * **严格解码 + 折叠**（对齐宿主 `foldGoal(events)`）：把一串变更折成当前状态，
 * 遇到不认识的版本/动词/身份复用**直接抛**（严格解码器——不静默吞）。
 *
 * 为什么必须严格：goal 的变更流是"只追加的历史"。宽容解码会把"版本不符"读成"没有变更"，
 * 于是"目标被清掉了"与"从来没建过"变得无法区分（本仓"缺失 ≠ 0"的同一条纪律）。
 */
export function foldGoal(changes: readonly (import('./domain.js').GoalChange | import('./domain.js').GoalClear)[]): FoldedGoal {
  const state = emptyGoalState()
  const seen = new Set<string>()
  for (const change of changes) {
    if (change.version !== GOAL_CHANGE_VERSION) {
      throw new Error('goal 变更版本不认识：' + String(change.version) + '（本实现支持 ' + String(GOAL_CHANGE_VERSION) + '）')
    }
    if (change.operation === 'clear') {
      seen.add(change.cleared.id)
      state.goal = undefined
      continue
    }
    if (change.operation === 'create') {
      // seenGoalIds 的语义在**解码层**也守：清过的身份不许复用（否则历史被抹掉）。
      if (seen.has(change.goal.id)) {
        throw new Error('goal 身份被复用（该 id 已被 clear）：' + change.goal.id)
      }
      seen.add(change.goal.id)
    }
    state.goal = change.goal
  }
  state.seenGoalIds = [...seen]
  return { goal: state.goal, seenGoalIds: state.seenGoalIds }
}

/** 折叠态 → 当前快照（对齐宿主 `foldedGoal(state)`；不存在 ⇒ undefined）。 */
export function foldedGoal(state: GoalFoldState): TaskGoal | undefined {
  return state.goal
}

/** FR-4 判据：goal 是否还在驱动语义上"活着"。 */
export function isGoalActive(goal: TaskGoal | undefined): boolean {
  return goal?.phase === 'active'
}

/**
 * FR-4 判据的 driver 视角：该相位是否**允许起轮**（只有 active）。
 * paused/blocked/complete/缺失 一律不起轮——缺失语义由调用方决定回落。
 */
export function goalAllowsRound(phase: GoalPhase | undefined): boolean {
  return phase === 'active'
}

/**
 * FR-2/FR-6 收口判据：全部阶段目标达成 ⇒ 需求**具备**收口条件。
 * 空数组 ⇒ false（缺失 ≠ 达成）；本判据只答客观条件，迁移仍走人工门。
 */
export function readyToClose(goals: readonly StageGoal[]): boolean {
  return goals.length > 0 && goals.every((g) => g.state === 'done')
}

/** 取某阶段的达成位（无 ⇒ undefined；缺失 ≠ pending）。 */
export function stageGoalOf(goals: readonly StageGoal[], stage: string): StageGoal | undefined {
  return goals.find((g) => g.stage === stage)
}

/** 有界计数投影（core 的 RequirementFacts 只准带这个，正文不进城）。 */
export function goalsProgressOf(goals: readonly StageGoal[] | undefined): StageGoalProgress | undefined {
  if (goals === undefined) return undefined
  return { total: goals.length, done: goals.filter((g) => g.state === 'done').length }
}

/**
 * 阶段目标表**整体登记/替换**（纯函数；L1 的"创建"语义）。
 *
 * 为什么是整体替换而不是逐条 append：阶段目标表是**该需求的阶段清单**（每主阶段一条，
 * INV：同 stage 不重复、statement 非空）；逐条 append 会出现"同一阶段两条目标"这种
 * 无法裁决的状态。空数组 = 清空（显式意图，不是"没传"）。
 *
 * 幂等：与现值逐字段同值 ⇒ `changed:false`（不写盘）。
 */
/**
 * 阶段目标表的输入校验（stage 非空、**属于合法阶段键**、不重复；statement 非空）；非法即抛，不静默丢弃。
 *
 * @param allowedStages 合法阶段键集合（由 core 注入——pm-goal 不反向依赖 core，
 *   所以"哪些阶段键合法"这件事**只能由调用方给**）。缺省 = 不校验键的合法性（只校验非空/不重复）。
 *
 * 为什么必须校验键：登记一个不存在的阶段键（如 `stage:'xxx'`）不会当场报错，
 * 但收口判据 `readyToClose` 永远不成立——**错了还不报错**是最坏的一类缺陷。
 */
export function validateStageGoals(goals: readonly StageGoal[], allowedStages?: readonly string[]): void {
  const seen = new Set<string>()
  for (const g of goals) {
    if (g.stage.trim() === '') throw new Error('阶段目标缺 stage')
    if (allowedStages !== undefined && !allowedStages.includes(g.stage)) {
      throw new Error('阶段键非法：' + g.stage + '（合法键：' + allowedStages.join(' / ') + '）')
    }
    if (g.statement.trim() === '') throw new Error('阶段目标缺 statement（stage=' + g.stage + '）')
    if (seen.has(g.stage)) throw new Error('阶段目标重复：' + g.stage)
    seen.add(g.stage)
  }
}

export function defineStageGoals(
  current: readonly StageGoal[],
  next: readonly StageGoal[],
  allowedStages?: readonly string[],
): { changed: boolean; next: readonly StageGoal[] } {
  validateStageGoals(next, allowedStages)
  const same = current.length === next.length && current.every((g, i) => {
    const n = next[i]
    return g.stage === n.stage && g.statement === n.statement && g.state === n.state
      && g.doneCriteria.length === n.doneCriteria.length
      && g.doneCriteria.every((c, j) => c === n.doneCriteria[j])
  })
  return same ? { changed: false, next: current } : { changed: true, next }
}

/**
 * StageGoal 达成位写入（纯函数）：pending → done。幂等：已 done ⇒ changed:false。
 * 调用纪律（D-4）：调用方只能是**人工门落章路径**；agent 自写 done 是越权。
 */
export function applyStageGoalDone(
  goals: readonly StageGoal[],
  stage: string,
): { changed: boolean; next: readonly StageGoal[] } {
  const target = stageGoalOf(goals, stage)
  if (target === undefined || target.state === 'done') return { changed: false, next: goals }
  return {
    changed: true,
    next: goals.map((g) => (g.stage === stage ? { ...g, state: 'done' as const } : g)),
  }
}
