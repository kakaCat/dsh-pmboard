/**
 * 决策 → 动作（`decideGoalRound` 的**执行半边**；I/O 全在端口后面）。
 *
 * 【分工】`decide.ts` 只回答"该干什么"（纯函数、可穷举）；本文件把结论落到端口调用。
 * 五态映射：
 *   · drive           → `ports.drive`（预留→投递→准入的成熟机制，见 §迁移进度）
 *   · create-goal     → `ports.goal.createTaskGoal`（objective 取卡 acceptance）
 *   · ask-stage-done  → `ports.dialog.askStageDone`（弹框请人裁决；节流与重弹在 gate-prompt 侧）
 *   · wait-human      → `ports.trace`（**不写健康位、不改人的意图**：等人不是故障）
 *   · hold            → `ports.trace`（闸拦下/无可跑之事，响亮留痕）
 *
 * 【为什么在动作前再跑一次不变量】决策是纯函数，动作有副作用——违反不变量时应当
 * **当场响**（抛错）而不是把副作用做出去再回滚。
 *
 * @module dsh-pmboard/goal-round/act
 */
import { checkDecisionInvariants } from './invariant.js'
import type { DecideInput, RoundDecision } from './types.js'

export interface ActPorts {
  /** 起轮（预留 → 投递 → 准入）。迁移期内由调用方接到成熟实现上。 */
  drive(requirementId: string): Promise<void> | void
  /** 建 L2 任务目标（pm-goal 的 createTaskGoal；objective 通常取卡 acceptance）。 */
  createTaskGoal(requirementId: string, taskId: string, objective: string): Promise<boolean> | boolean
  /** 触发"本阶段算完成吗"弹框（请人裁决；agent 不得自落章）。 */
  askStageDone(requirementId: string): Promise<void> | void
  /** 有界留痕（诊断面；不收自由文本以外的东西）。 */
  trace(reason: string, requirementId?: string): void
}

export interface ActResult {
  readonly acted: RoundDecision['kind']
  /** create-goal 是否有实际写入（幂等重放 = false）。 */
  readonly changed?: boolean
}

/** 执行一次决策。违反不变量 → 抛错（响亮，不做副作用）。 */
export async function actOnDecision(
  ports: ActPorts, input: DecideInput, decision: RoundDecision,
): Promise<ActResult> {
  const violations = checkDecisionInvariants(input, decision)
  if (violations.length > 0) {
    throw new Error('决策违反不变量：' + violations.map((v) => v.inv + ' ' + v.message).join('；'))
  }
  switch (decision.kind) {
    case 'drive':
      await ports.drive(decision.requirementId)
      return { acted: 'drive' }
    case 'create-goal': {
      const changed = await ports.createTaskGoal(decision.requirementId, decision.taskId, decision.objective)
      return { acted: 'create-goal', changed }
    }
    case 'ask-stage-done':
      await ports.askStageDone(decision.requirementId)
      return { acted: 'ask-stage-done' }
    case 'wait-human':
      ports.trace('wait-human:' + decision.reason, decision.requirementId)
      return { acted: 'wait-human' }
    case 'ask-close':
      await ports.askStageDone(decision.requirementId)
      return { acted: 'ask-close' }
    case 'hold':
      ports.trace('hold:' + decision.reason, decision.requirementId)
      return { acted: 'hold' }
  }
}
