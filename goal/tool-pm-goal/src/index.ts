/**
 * goal 工具面（对齐宿主 `@deepseek-ai/dsh-tool-goal/src/index.ts` 的**工具设计**：
 * 三个工具 —— 读（get）/ 建（create）/ 改（update），各管一件事；
 * 用户裁定 2026-10-10：不设 `wrapup.ts`（收尾文案由本插件的续跑提示词负责）。
 *
 * 提示词保留本插件既有写法（见 `./prompt.js`）。
 * 授权判据在 `./authority.js`（`resume` = 真人专属）。
 *
 * 【职责边界】壳只做协议转换（参数校验 / 返回体 / 渲染）；状态规则全在 `pm-goal`。
 *
 * @module dsh-pmboard/tools-goal
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { UseCaseDeps } from 'pm-core/application/ports.js'
// 阶段键的**权威集合**（core 单一来源）：登记阶段目标时校验，防止登记出永远不会达成的键。
import { ALL_STAGE_KEYS } from 'pm-core/protocol-domain.js'
import {
  blockTaskGoal, completeTaskGoal, createTaskGoal, goalPhaseOf, pauseTaskGoal,
  readyToCloseOf, resumeTaskGoal, setStageGoals, stageGoalsOf, goalsProgressOf,
  markStageGoalDone, taskGoalOf,
} from 'pm-goal'
import type { StageGoal } from 'pm-goal'
import type { StageGoalProgress, TaskGoal } from 'pm-goal'
import {
  goalToolExecution, requireActionAuthority, type GoalToolAuthority, type GoalUpdateAction,
} from './authority.js'
import { renderWrapupPrompt, wrapupKindOf } from './wrapup.js'
import {
  STAGE_GOAL_CREATE_PROMPT, STAGE_GOAL_DONE_PROMPT, STAGE_GOAL_GET_PROMPT,
  TASK_GOAL_CREATE_PROMPT, TASK_GOAL_GET_PROMPT, TASK_GOAL_UPDATE_PROMPT,
} from './prompt.js'

/** 组合根可注入的依赖（`deps` = 用例端口；判据钩子见下）。 */
export interface GoalToolDeps {
  readonly useCases: UseCaseDeps
  /**
   * 本回合授权判定（§对齐宿主 `goalToolExecution`）：给了就按它判——
   * 返回 `undefined` 表示**既不是人直接发起、也不是本目标的续跑回合** → `complete`/`block` 被拒。
   * 缺省不判 = 退回 `autonomous`（未接线的老装配，行为由 `authorityFromEvents` 接管后收紧）。
   */
  readonly resolveAuthority?: (exec: unknown) => GoalToolAuthority | undefined
  /**
   * 调用者存活校验（对齐宿主 `goalToolExecution` 的三条：注册表里的活 agent /
   * `status === 'running'` / 是当前 initiator）。缺省 = 不校验（未接线）。
   */
  readonly verifyCaller?: (exec: unknown) => { readonly ok: boolean; readonly reason?: string }
  /**
   * 自报 `block` 所需的最小连续回合数（对齐宿主 `blockedAfterConsecutiveRounds`，缺省 3）。
   * 只对**自主回合**生效——人直接说"卡住了"不该被阈值挡。
   */
  readonly blockedAfterRounds?: number
}

/** goal 的对外投影（对齐宿主 GoalToolValue 的形态：`null` = 没有 goal）。 */
type GoalValue = { goal: null } | { goal: TaskGoal }

const GOAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    task_id: { type: 'string' },
    objective: { type: 'string' },
    phase: { type: 'string', enum: ['active', 'paused', 'blocked', 'complete'] },
    blocked_reason: { type: 'string' },
    revision: { type: 'number' },
  },
} as const

const STAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { total: { type: 'number' }, done: { type: 'number' } },
} as const

/** 参数校验公用的需求解析。 */
function requirementOf(args: Record<string, unknown>): string | undefined {
  const raw = args.requirement_id
  return raw === undefined ? undefined : String(raw)
}

function taskOf(args: Record<string, unknown>): string | undefined {
  const raw = args.task_id
  return raw === undefined ? undefined : String(raw)
}

const DEFAULT_BLOCKED_AFTER_ROUNDS = 3

/** 调用者存活（缺口②）：缺省不校验；接线后由宿主 agents 句柄给判据。 */
function callerRejection(deps: GoalToolDeps, exec: unknown): string | undefined {
  const verdict = deps.verifyCaller?.(exec)
  if (verdict === undefined || verdict.ok) return undefined
  return verdict.reason ?? 'goal 工具要求调用者是当前正在运行的 agent'
}

/** 本回合授权：缺省 autonomous（未接线）；接线后返回 undefined = 无授权。 */
function authorityOf(deps: GoalToolDeps, exec: unknown): GoalToolAuthority | undefined {
  const granted = deps.resolveAuthority?.(exec)
  if (deps.resolveAuthority === undefined) return { kind: 'autonomous' }
  return granted
}

/** 该需求当前的自动跑意图与已准入回合数（缺口③④的事实来源）。 */
async function runtimeOf(deps: GoalToolDeps, requirementId: string): Promise<{ activation?: string; roundsInStage: number }> {
  try {
    const record = await deps.useCases.store?.get(requirementId) as { dive?: { activation?: string; roundsInStage?: number } } | undefined
    return {
      ...(record?.dive?.activation === undefined ? {} : { activation: record.dive.activation }),
      roundsInStage: record?.dive?.roundsInStage ?? 0,
    }
  } catch {
    // 读不到就**不编**：activation 不出现，回合数按 0（保守侧：阈值更容易拦住自报 block）。
    return { roundsInStage: 0 }
  }
}

function goalDepsOf(deps: GoalToolDeps) {
  return {
    taskStore: deps.useCases.taskStore as never,
    store: deps.useCases.store as never,
    now: () => Date.now(),
  }
}

/** 返回体装配（读后如实投影：`phase` 只在有 goal 时出现）。 */
function goalValueOf(goal: TaskGoal | undefined): GoalValue {
  return goal === undefined ? { goal: null } : { goal }
}

function summarize(action: string, v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.success !== true) return 'goal ' + action + ' 未成功：' + String(o.error ?? '')
  const g = o.goal as { phase?: string; task_id?: string } | null | undefined
  if (g === null || g === undefined) return 'goal ' + action + '：该卡未启用目标'
  return 'goal ' + action + '：' + String(g.task_id ?? '') + ' = ' + String(g.phase ?? '')
}

/** `reqboard_task_goal_get`：只读任务目标（L2）。 */
export function defineTaskGoalGetTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_task_goal_get',
    description: TASK_GOAL_GET_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
      task_id: { type: 'string', description: '任务卡 id（t-xxxxxx）；缺省只看阶段目标进度' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          goal: { oneOf: [{ type: 'null' }, GOAL_SCHEMA] },
          phase: { type: 'string' },
          stage: STAGE_SCHEMA,
          activation: { type: 'string', enum: ['armed', 'disarmed'], description: '自动跑开关（人的意图）' },
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarize('get', v),
    },
    execute: async (args: Record<string, unknown>, exec: unknown) => {
      const requirementId = requirementOf(args)
      if (requirementId === undefined) {
        return { success: false, error: '缺少 requirement_id（本窗口未绑定需求时必传）' }
      }
      const callerBad = callerRejection(deps, exec)
      if (callerBad !== undefined) return { success: false, requirement_id: requirementId, error: callerBad }
      try {
        const g = goalDepsOf(deps)
        const runtime = await runtimeOf(deps, requirementId)
        const taskId = taskOf(args)
        // 单卡模式才回整条 goal；不带 task_id 时只回相位与阶段进度（缺失就不出现该键）。
        const goal = taskId === undefined ? undefined : await taskGoalOf(g, requirementId, taskId)
        const phase = await goalPhaseOf(g, requirementId)
        const stage = goalsProgressOf(await stageGoalsOf(g, requirementId)) as StageGoalProgress | undefined
        return {
          success: true, requirement_id: requirementId,
          ...goalValueOf(goal),
          ...(phase === undefined ? {} : { phase }),
          ...(stage === undefined ? {} : { stage }),
          // 缺口④：把"人的意图"也交出去（disarmed = 人把自动跑关了，agent 别以为还能继续）。
          ...(runtime.activation === undefined ? {} : { activation: runtime.activation }),
        }
      } catch (err) {
        return { success: false, requirement_id: requirementId, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/** `reqboard_task_goal_create`：开工建任务目标（L2；objective 缺省取卡片 acceptance）。 */
export function defineTaskGoalCreateTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_task_goal_create',
    description: TASK_GOAL_CREATE_PROMPT,
    parameters: {
      task_id: { type: 'string', description: '任务卡 id（t-xxxxxx）；必填' },
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
      objective: { type: 'string', description: '目标人话陈述；缺省取卡片 acceptance（判据复用）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          changed: { type: 'boolean' },
          goal: { oneOf: [{ type: 'null' }, GOAL_SCHEMA] },
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarize('create', v),
    },
    execute: async (args: Record<string, unknown>, exec: unknown) => {
      const requirementId = requirementOf(args)
      const taskId = taskOf(args)
      if (requirementId === undefined) return { success: false, error: '缺少 requirement_id' }
      if (taskId === undefined || taskId.length === 0) return { success: false, requirement_id: requirementId, error: '缺少 task_id' }
      const callerBad = callerRejection(deps, exec)
      if (callerBad !== undefined) return { success: false, requirement_id: requirementId, error: callerBad }
      try {
        const g = goalDepsOf(deps)
        const objective = args.objective === undefined
          ? await acceptanceOf(deps, taskId)
          : String(args.objective)
        if (objective === undefined || objective.length === 0) {
          return {
            success: false, requirement_id: requirementId,
            error: 'objective 缺省且卡片无 acceptance——请显式给出目标陈述',
          }
        }
        const changed = await createTaskGoal(g, requirementId, taskId, objective)
        return {
          success: true, requirement_id: requirementId, changed,
          ...goalValueOf(await taskGoalOf(g, requirementId, taskId)),
        }
      } catch (err) {
        return { success: false, requirement_id: requirementId, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/** `reqboard_task_goal_update`：任务目标相位迁移（L2；授权判据在 authority.ts）。 */
export function defineTaskGoalUpdateTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_task_goal_update',
    description: TASK_GOAL_UPDATE_PROMPT,
    parameters: {
      task_id: { type: 'string', description: '任务卡 id（t-xxxxxx）；必填' },
      revision: { type: 'number', description: '目标当前 revision（先 get 再改；对不上即拒——CAS 乐观锁，对齐宿主 goalRef）' },
      action: { type: 'string', enum: ['pause', 'resume', 'block', 'complete'], description: 'pause/resume/block/complete' },
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
      reason: { type: 'string', description: 'pause/block 用：结构化原因（block 必填）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          action: { type: 'string' },
          changed: { type: 'boolean' },
          goal: { oneOf: [{ type: 'null' }, GOAL_SCHEMA] },
          activation: { type: 'string', enum: ['armed', 'disarmed'], description: '自动跑开关（人的意图）：disarmed = 人把自动跑关了' },
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarize('update', v),
    },
    execute: async (args: Record<string, unknown>, exec: unknown) => {
      const requirementId = requirementOf(args)
      const taskId = taskOf(args)
      const action = String(args.action ?? '') as GoalUpdateAction
      if (requirementId === undefined) return { success: false, action, error: '缺少 requirement_id' }
      if (taskId === undefined || taskId.length === 0) return { success: false, action, requirement_id: requirementId, error: '缺少 task_id' }
      const reason = args.reason === undefined ? '' : String(args.reason)
      if (action === 'block' && reason.trim() === '') {
        return { success: false, action, requirement_id: requirementId, error: 'block 必填 reason（不编造原因）' }
      }
      // 缺口②：调用者存活（活 agent / running / 当前 initiator）——缺省不校验（未接线）。
      const callerBad = callerRejection(deps, exec)
      if (callerBad !== undefined) return { success: false, action, requirement_id: requirementId, error: callerBad }
      try {
        // 授权：resume 只许真人（缺省判定 = autonomous ⇒ 拒绝并指路看板）
        const execution = goalToolExecution(exec, deps.resolveAuthority)
        const authority = authorityOf(deps, exec)
        if (authority === undefined) {
          // 对齐宿主 `completionAuthority`：既非人直接发起、也非本目标的续跑回合 → 终态动作无授权。
          if (action === 'complete' || action === 'block') {
            return {
              success: false, action, requirement_id: requirementId,
              error: '`' + action + '` 需要人直接发起的回合，或正是该目标的续跑回合——本回合两者都不是',
            }
          }
        } else {
          requireActionAuthority(action, authority)
        }
        // 缺口③：自报 block 的回合阈值（只对自主回合生效；人说的"卡住了"不该被挡）
        const runtime = await runtimeOf(deps, requirementId)
        const threshold = deps.blockedAfterRounds ?? DEFAULT_BLOCKED_AFTER_ROUNDS
        if (action === 'block' && authority?.kind === 'autonomous' && runtime.roundsInStage < threshold) {
          return {
            success: false, action, requirement_id: requirementId,
            error: 'block 需要同一卡点连续 ' + threshold + ' 个回合（当前 ' + runtime.roundsInStage
              + '）——请继续尝试或如实说明仍在推进',
          }
        }
        const expectedRevision = args.revision === undefined ? undefined : Number(args.revision)
        if (expectedRevision !== undefined && !Number.isInteger(expectedRevision)) {
          return { success: false, action, requirement_id: requirementId, error: 'revision 必须是整数（先 get 再改）' }
        }
        const g = goalDepsOf(deps)
        // 缺口①：CAS——带上 revision 就校验（陈旧引用写前拒）。
        // 结构化原因（对齐宿主 GoalBlockReason）：block 用模型自报码，pause 用中断码。
        const changed = action === 'pause'
          ? await pauseTaskGoal(g, requirementId, taskId,
            reason.trim() === '' ? undefined : { code: 'interrupted', message: reason }, expectedRevision)
          : action === 'resume' ? await resumeTaskGoal(g, requirementId, taskId, expectedRevision)
            : action === 'block'
              ? await blockTaskGoal(g, requirementId, taskId, { code: 'model-reported', message: reason }, expectedRevision)
              : await completeTaskGoal(g, requirementId, taskId, expectedRevision)
        const goal = await taskGoalOf(g, requirementId, taskId)
        // 收尾（对齐宿主 `tool-goal`）：**自主回合**把目标判成终态时，注入一段收尾指令——
        // 让模型在回合结束前对用户交代一句（人直接在场上时不注入：人已经看见了）。
        const kind = wrapupKindOf(action)
        if (kind !== undefined && execution.authority.kind === 'autonomous') {
          try {
            deferWrapup(exec, renderWrapupPrompt({
              kind,
              objective: goal?.objective ?? '',
              taskId,
              ...(action === 'block' && reason.trim() !== '' ? { blockedReason: reason } : {}),
            }), () => Date.now())
          } catch (err) {
            // 注入失败**不阻断**工具结果（与宿主"收尾是尽力而为"的分寸一致）。
            void err
          }
        }
        return {
          success: true, action, requirement_id: requirementId, changed,
          ...goalValueOf(goal),
          // 缺口④：把"人的意图"也交出去（agent 才知道自动跑是否被关了）。
          ...(runtime.activation === undefined ? {} : { activation: runtime.activation }),
        }
      } catch (err) {
        return { success: false, action, requirement_id: requirementId, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/**
 * 注入收尾指令（宿主 `ToolRunContext.deferContext()` 的位置）。
 *
 * 【为什么消息按结构造、不 import `createUserMessage`】本仓的既有约定：本插件**不依赖
 * `@deepseek-ai/dsh-llm`**（依赖树解析不到它，且 application 层禁 `@deepseek-ai/*`）——
 * 同款先例见 `pm-common` 的 `DiveRoundSource`（"刻意只做包内结构类型"）。
 *
 * 宿主不提供 `deferContext`（老版本 / 测试桩）→ **静默跳过**：收尾是尽力而为，不挡主流程。
 */
function deferWrapup(exec: unknown, text: string, now: () => number): void {
  const defer = (exec as { deferContext?: (m: unknown) => void } | undefined)?.deferContext
  if (typeof defer !== 'function') return
  defer.call(exec, {
    id: 'goal-wrapup-' + String(now()),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'tool-pm-goal', form: 'notice', summary: 'goal wrapup' },
  })
}

/** create 的 objective 缺省：取卡片 acceptance（D-1：判据复用，不造第二份验收标准）。 */
async function acceptanceOf(deps: GoalToolDeps, taskId: string): Promise<string | undefined> {
  try {
    const task = await deps.useCases.taskStore?.get(taskId)
    const acc = (task as { acceptance?: string } | undefined)?.acceptance
    return typeof acc === 'string' && acc.trim().length > 0 ? acc : undefined
  } catch {
    return undefined
  }
}


/** 阶段目标的对外投影（L1）。 */
const STAGE_GOAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stage: { type: 'string' },
    statement: { type: 'string' },
    done_criteria: { type: 'array', items: { type: 'string' } },
    state: { type: 'string', enum: ['pending', 'done'] },
  },
} as const

/** `reqboard_stage_goal_get`：只读阶段目标表（L1）。 */
export function defineStageGoalGetTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_stage_goal_get',
    description: STAGE_GOAL_GET_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          goals: { type: 'array', items: STAGE_GOAL_SCHEMA },
          ready_to_close: { type: 'boolean' },
          stage: STAGE_SCHEMA,
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarizeStage('get', v),
    },
    execute: async (args: Record<string, unknown>) => {
      const requirementId = requirementOf(args)
      if (requirementId === undefined) return { success: false, error: '缺少 requirement_id' }
      try {
        const g = goalDepsOf(deps)
        const goals = await stageGoalsOf(g, requirementId)
        return {
          success: true, requirement_id: requirementId,
          goals: goals.map((x) => ({
            stage: x.stage, statement: x.statement,
            done_criteria: [...x.doneCriteria], state: x.state,
          })),
          ready_to_close: await readyToCloseOf(g, requirementId),
          ...(goals.length === 0 ? {} : { stage: goalsProgressOf(goals) }),
        }
      } catch (err) {
        return { success: false, requirement_id: requirementId, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/** `reqboard_stage_goal_create`：登记/替换阶段目标表（L1）。 */
export function defineStageGoalCreateTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_stage_goal_create',
    description: STAGE_GOAL_CREATE_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
      goals: {
        type: 'array',
        description: '阶段目标表（整体替换；空数组 = 清空）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            stage: { type: 'string', description: '阶段键（同 core 的阶段名，如 design / implementing）' },
            statement: { type: 'string', description: '这个阶段要达成什么（人话）' },
            done_criteria: { type: 'array', items: { type: 'string' }, description: '可核的达成判据' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          changed: { type: 'boolean' },
          goals: { type: 'array', items: STAGE_GOAL_SCHEMA },
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarizeStage('create', v),
    },
    execute: async (args: Record<string, unknown>) => {
      const requirementId = requirementOf(args)
      if (requirementId === undefined) return { success: false, error: '缺少 requirement_id' }
      const raw = args.goals
      if (!Array.isArray(raw)) return { success: false, requirement_id: requirementId, error: '缺少 goals 数组' }
      try {
        const goals: StageGoal[] = raw.map((item) => {
          const o = (item ?? {}) as Record<string, unknown>
          const criteria = Array.isArray(o.done_criteria) ? o.done_criteria.map(String) : []
          return {
            stage: String(o.stage ?? ''), statement: String(o.statement ?? ''),
            doneCriteria: criteria, state: 'pending' as const,
          }
        })
        const g = goalDepsOf(deps)
        const changed = await setStageGoals(g, requirementId, goals, ALL_STAGE_KEYS)
        return {
          success: true, requirement_id: requirementId, changed,
          goals: (await stageGoalsOf(g, requirementId)).map((x) => ({
            stage: x.stage, statement: x.statement,
            done_criteria: [...x.doneCriteria], state: x.state,
          })),
        }
      } catch (err) {
        return { success: false, requirement_id: requirementId, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/** `reqboard_stage_goal_done`：落章达成位（**真人专属**，D-4）。 */
export function defineStageGoalDoneTool(deps: GoalToolDeps) {
  return defineTool({
    name: 'reqboard_stage_goal_done',
    description: STAGE_GOAL_DONE_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省取本窗口绑定需求' },
      stage: { type: 'string', description: '要落章的阶段键（必须在阶段目标表里）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          stage_key: { type: 'string' },
          changed: { type: 'boolean' },
          ready_to_close: { type: 'boolean' },
          goals: { type: 'array', items: STAGE_GOAL_SCHEMA },
          error: { type: 'string' },
        },
      },
      render: (v: unknown) => summarizeStage('done', v),
    },
    execute: async (args: Record<string, unknown>, exec: unknown) => {
      const requirementId = requirementOf(args)
      const stage = args.stage === undefined ? undefined : String(args.stage)
      if (requirementId === undefined) return { success: false, error: '缺少 requirement_id' }
      if (stage === undefined || stage.length === 0) {
        return { success: false, requirement_id: requirementId, error: '缺少 stage' }
      }
      try {
        // 授权：达成位只有人能落章（agent 提议、人落章，D-4）
        requireActionAuthority('stage_done', goalToolExecution(exec, deps.resolveAuthority).authority)
        const g = goalDepsOf(deps)
        const changed = await markStageGoalDone(g, requirementId, stage)
        return {
          success: true, requirement_id: requirementId, stage_key: stage, changed,
          ready_to_close: await readyToCloseOf(g, requirementId),
          goals: (await stageGoalsOf(g, requirementId)).map((x) => ({
            stage: x.stage, statement: x.statement,
            done_criteria: [...x.doneCriteria], state: x.state,
          })),
        }
      } catch (err) {
        return { success: false, requirement_id: requirementId, stage_key: stage, error: String((err as Error)?.message ?? err) }
      }
    },
  } as never)
}

/** 阶段目标的渲染摘要。 */
function summarizeStage(action: string, v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.success !== true) return '阶段目标 ' + action + ' 未成功：' + String(o.error ?? '')
  const list = Array.isArray(o.goals) ? o.goals as Array<{ stage?: string; state?: string }> : []
  const done = list.filter((x) => x.state === 'done').length
  return '阶段目标 ' + action + '：' + done + '/' + list.length + ' 已达成'
    + (o.ready_to_close === true ? '（具备收口条件）' : '')
}

/** 六个工具的工厂（两层三工具；注册面与门禁从 `GOAL_TOOL_REGISTRY` 取期望值）。 */
export const GOAL_TOOL_FACTORIES = {
  TaskGoalGet: defineTaskGoalGetTool,
  TaskGoalCreate: defineTaskGoalCreateTool,
  TaskGoalUpdate: defineTaskGoalUpdateTool,
  StageGoalGet: defineStageGoalGetTool,
  StageGoalCreate: defineStageGoalCreateTool,
  StageGoalDone: defineStageGoalDoneTool,
} as const

export { GOAL_TOOL_REGISTRY, type GoalToolRegistryEntry } from './registry.js'
export { goalToolExecution, isActionAuthorized, requireActionAuthority } from './authority.js'
export type { GoalToolAuthority, GoalUpdateAction } from './authority.js'
export {
  TASK_GOAL_GET_PROMPT, TASK_GOAL_CREATE_PROMPT, TASK_GOAL_UPDATE_PROMPT,
  STAGE_GOAL_GET_PROMPT, STAGE_GOAL_CREATE_PROMPT, STAGE_GOAL_DONE_PROMPT,
  TWO_LAYER_NOTE, TASK_GOAL_BOUNDARIES, STAGE_GOAL_BOUNDARIES, STAGE_SEQUENCE_NOTE,
} from './prompt.js'
