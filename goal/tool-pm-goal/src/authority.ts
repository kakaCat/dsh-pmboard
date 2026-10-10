/**
 * goal 工具的**执行期授权**（对齐宿主 `@deepseek-ai/dsh-tool-goal/src/authority.ts`：
 * 宿主在那里判定"这次调用是人直接发起还是自动回合"，本包按同一纪律做 pm 版判定）。
 *
 * 【pm 的授权口径】（与 core 既有纪律同源，不是新发明）：
 *   · `resume` = **direct-human only**——"继续"只有人能发起（对齐 `arm-explicit`：
 *     "改人的意图只有人能发起"；agent 自行 resume 会让"人显式暂停"被悄悄推翻）；
 *   · `pause` / `block` / `complete` = agent 可发起（运行时故障、等上游、卡做完都可能是 agent 先知道的）。
 *
 * 【为什么留解析钩子】pm 的工具执行面拿不到宿主的 `ctx.agents` / 会话事件切面（宿主靠它们
 * 判定"本轮是不是人打的字"）。故这里定义**判据**并把解析做成可注入的钩子：
 * 组合根能提供真人判定就接上；缺省 = `autonomous`（保守侧：resume 被拒并指路看板）。
 *
 * @module dsh-pmboard/tools-goal/authority
 */
import { GoalError } from 'pm-goal'

/** 一次状态变更调用获得的硬授权（对齐宿主 GoalToolAuthority）。 */
export type GoalToolAuthority =
  | { readonly kind: 'direct-human' }
  | { readonly kind: 'autonomous' }

/** 任务目标（L2）的 `update` 动作（不含 edit——objective 判据复用卡片 acceptance，D-1）。 */
export type GoalUpdateAction = 'pause' | 'resume' | 'block' | 'complete'

/**
 * 从**会话事件**判定本回合的授权（对齐宿主 `hasDirectHumanInput` / `completionAuthority`）。
 *
 * 【为什么要有它】"本轮是不是人打的字"这件事只能从**开放回合的事件切面**看：
 * 宿主扫 `user/message` 且 `source.kind === 'user'`；本包把它做成纯函数，
 * 组合根拿到事件切面后调用即可（缺省不判 = 退回 `autonomous`，见 `goalToolExecution`）。
 *
 * @param events 有序事件数组（`seq` 即下标）
 * @param openTurnStartSeq 本回合起始 seq（**只扫它之后的事件**——历史里的人类消息不算本轮授权）
 * @param isRootAgent 调用者是否为顶层 agent（对齐宿主 `ctx.agents.roots().includes(agent)`）
 */
export function authorityFromEvents(
  events: readonly { readonly type?: string; readonly data?: { readonly source?: { readonly kind?: string; readonly round?: number; readonly goalId?: string; readonly revision?: number } } }[],
  openTurnStartSeq: number,
  isRootAgent: boolean,
): GoalToolAuthority | undefined {
  if (!isRootAgent) return undefined
  let goalRound = false
  for (let seq = openTurnStartSeq + 1; seq < events.length; seq += 1) {
    const event = events[seq]
    if (event?.type !== 'user/message') continue
    const kind = event.data?.source?.kind
    if (kind === 'user') return { kind: 'direct-human' }
    if (kind === 'dive') goalRound = true
  }
  return goalRound ? { kind: 'autonomous' } : undefined
}

/** 需要真人授权的**全部**动作（两层合表；`stage_done` = L1 达成位落章，D-4）。 */
export type GoalAuthorityAction = GoalUpdateAction | 'stage_done'

/** 调用者解析结果（对齐宿主 GoalToolExecution 的最小面）。 */
export interface GoalToolExecution {
  readonly authority: GoalToolAuthority
  readonly agentId?: string
}

/**
 * 解析本次调用的授权。
 * @param exec 工具执行元数据（pm 侧可能只有 `agent.id`）
 * @param resolveAuthority 组合根注入的真人判定（缺省 = 保守的 autonomous）
 */
export function goalToolExecution(
  exec: unknown,
  resolveAuthority?: (exec: unknown) => GoalToolAuthority | undefined,
): GoalToolExecution {
  const agent = (exec as { agent?: { id?: string } } | undefined)?.agent
  const granted = resolveAuthority?.(exec)
  return {
    authority: granted ?? { kind: 'autonomous' },
    ...(typeof agent?.id === 'string' ? { agentId: agent.id } : {}),
  }
}

/**
 * 需要真人授权的动作（**唯一一份**：改这里即改全部调用点）：
 *   · `resume`——"继续"只有人能发起（对齐 `arm-explicit`）；
 *   · `stage_done`——阶段达成位只有人能落章（D-4：agent 提议、人落章）。
 */
const HUMAN_ONLY: ReadonlySet<GoalAuthorityAction> = new Set<GoalAuthorityAction>(['resume', 'stage_done'])

/** 该动作在当前授权下是否放行（纯函数，可单测）。 */
export function isActionAuthorized(action: GoalAuthorityAction, authority: GoalToolAuthority): boolean {
  if (!HUMAN_ONLY.has(action)) return true
  return authority.kind === 'direct-human'
}

/** 放行判定；不放行则抛结构化错误（`GoalError`，机器可路由）。 */
export function requireActionAuthority(action: GoalAuthorityAction, authority: GoalToolAuthority): void {
  if (isActionAuthorized(action, authority)) return
  throw new GoalError(
    '`' + action + '` 需要人显式发起（agent 自行 ' + action + ' 会推翻人的暂停意图）'
    + '——请让人在看板按「继续」（reqboard_clear_pause），或由人直接调本工具',
    'GOAL_NO_PERMISSION',
  )
}
