/**
 * **回合投递提示词**（本驱动投给窗口的那一段；对齐宿主 `goal-round-driver/src/prompt.ts`
 * 的 `renderGoalRoundPrompt`，但按 pm 的两层目标重写）。
 *
 * 【设计原则】提示词不是"催办"，而是把闭环的选择权交给 agent、把**裁决权留给人**：
 *   · 显式给"本阶段目标 + 达成判据"——agent 不必猜标准，也就不会自己发明一份；
 *   · 明确"goal 结束不是终点"——goal complete 只说明这件事完了，要不要继续由 stage 判（pm 与 dsh 的关键语义差）；
 *   · 边界三条 = 把人工门纪律翻译成 agent 能执行的规则；
 *   · 停手条件 = 防"没 ready 卡还硬跑"的空转（本仓踩过的老病）。
 *
 * 纯函数：同输入必同输出（内容不变量据此逐字比对）。
 *
 * @module dsh-pmboard/goal-round/prompt
 */
import type { GoalPhase } from 'pm-goal'

export interface RoundPromptInput {
  readonly requirementId: string
  readonly round: number
  /** 当前阶段键（流程状态；只读展示，不驱动判定）。 */
  readonly status: string
  /** 本阶段目标陈述（L1；未登记时缺省）。 */
  readonly stageStatement?: string
  /** 本阶段达成判据（L1，逐条）。 */
  readonly doneCriteria?: readonly string[]
  /** 阶段进度（有界计数）。 */
  readonly stageProgress?: { readonly done: number; readonly total: number }
  /** 当前任务目标相位；undefined = 还没有 goal。 */
  readonly goalPhase?: GoalPhase
  /** 待建 goal 的挂载卡（phase 缺失时用）。 */
  readonly nextTaskId?: string
}

/** 本阶段的"这一轮做什么"分支（按 goal 相位给不同指令，不做成一份含糊的通用话）。 */
function taskSection(input: RoundPromptInput): string {
  if (input.goalPhase === undefined) {
    return [
      '【这一轮你要做的事】',
      '1) 本阶段还没有在跑的目标 → 先建它：',
      '   reqboard_task_goal_create(task_id=' + (input.nextTaskId ?? '<当前 ready 卡>') + ')',
      '   （objective 缺省取该卡 acceptance——判据复用，不要另编一份验收标准）',
      '2) 建好后按卡上的说明干活。',
    ].join('\n')
  }
  if (input.goalPhase === 'active') {
    return [
      '【这一轮你要做的事】',
      '1) 目标在跑（active）：按卡上的说明干活，做完为止。',
      '2) 这张卡做完时：reqboard_task_goal_update(action=complete)；',
      '   卡本身的状态迁移另走 reqboard_task_move（两者各管一件事，都要做）。',
      '3) 卡被中断 → pause（附原因）；等上游/等人裁 → block（原因必填）。',
    ].join('\n')
  }
  if (input.goalPhase === 'complete') {
    return [
      '【这一轮的处境】',
      '当前目标已完成（complete）。**完成不等于本阶段完成**：',
      '由系统判"本阶段达成判据是否都满足"——满足了会弹框请人裁决；不满足会自动给你下一件事。',
      '你这一轮：核对下面的达成判据，缺什么补什么（改产物、跑验证、补证据），不要自行宣布阶段完成。',
    ].join('\n')
  }
  return [
    '【这一轮的处境】',
    '当前目标处于 ' + input.goalPhase + '（等人/等恢复）：**不要自己继续**，',
    '如实说明卡在哪、需要谁做什么；恢复由人或上游推动。',
  ].join('\n')
}

/**
 * 渲染一段完整的回合指令（进会话历史，逐字可核）。
 */
export function renderRoundPrompt(input: RoundPromptInput): string {
  const criteria = (input.doneCriteria ?? []).map((c, i) => '  ' + (i + 1) + ') ' + c).join('\n')
  const progress = input.stageProgress === undefined
    ? ''
    : '\n（阶段进度：' + input.stageProgress.done + '/' + input.stageProgress.total + ' 段已达成）'

  return [
    '继续执行需求 ' + input.requirementId + '（自动续跑，第 ' + input.round + ' 回合）',
    '当前阶段：' + input.status + progress,
    '',
    '【本阶段目标】' + (input.stageStatement ?? '（未登记阶段目标——建议先 reqboard_stage_goal_create 把判据落到台账）'),
    ...(criteria.length === 0 ? [] : ['达成判据：', criteria]),
    '',
    taskSection(input),
    '',
    '【边界（越权即错）】',
    '· 不许自己把阶段判成"完成"：达成位只有人能落章（reqboard_stage_goal_done 是真人专属）；',
    '· 不许改人的意图：paused / blocked 的目标要**人**来 resume；',
    '· 不许另编验收标准：判据就是卡片的 acceptance 与本阶段上面的达成判据。',
    '',
    '【停手条件】等人裁决 / 等上游 / 没有 ready 卡 → 如实说明原因停手，**不要空转**。',
  ].join('\n')
}
