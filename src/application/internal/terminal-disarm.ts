/**
 * 终态收手（REQ-261004065652-5c1c FR-9 · **预防半边** · t4）。
 *
 * ## 为什么必须是公共实现
 *
 * "走进终态"有**两条入口**：agent 工具路径（`use-cases/MoveRequirement`）与看板路径
 * （`http/routers/requirements` 的 `/move`）。两边各写一份收手逻辑 = 本仓"两份真相必然漂移"
 * 的老病（一边改了一边没改，正是这次事故里 3 条「已归档却还 armed」的成因形态）。
 *
 * ## 为什么必须在"这一刻"做
 *
 * 需求一旦落成 `done` / `archived`，存储层就把它判为**冷侧只读**（`REQBOARD_COLD_IMMUTABLE`，
 * 除"归档收口"那一族写之外一律拒）。事后再想归一 `dive` 就**写不动**了——
 * 这正是存量那 3 条至今还挂着 `armed` 的原因（见 `reconcile-terminal-dive.ts` 的诚实边界）。
 * 而转移**发生时** `before.status` 还是旧状态（非冷），这一笔照常可写。
 *
 * @module dsh-pmboard/application/internal/terminal-disarm
 */
import type { CommentRecord, RequirementDive } from '../../shared/protocol.js'
import { transitionDive } from '../../domain/dive/transition.js'

/** 终态集合（与 `isOpenRequirement` 互补；此处只用于"收手"这一件事）。 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done', 'archived', 'canceled'])

/** 收手就地改的那个 draft 的最小形状（两条入口的记录形状都满足）。 */
export interface TerminalDisarmDraft {
  dive?: RequirementDive
  comments: CommentRecord[]
}

/**
 * 就地收回自动意图。**只在**「目标状态是终态 ∧ 当前 armed」时写入；其余情况零改动。
 *
 * @returns 是否发生了写入（调用方据此决定要不要把这次 mutate 标成 changed）。
 */
export function disarmDiveOnTerminal(
  draft: TerminalDisarmDraft,
  input: { to: string; at: number; commentId: () => string; actor?: { kind: 'system' } },
): boolean {
  if (!TERMINAL_STATUSES.has(input.to)) return false
  if (draft.dive?.activation !== 'armed') return false
  const disarmed = transitionDive(draft.dive, {
    event: 'disarm-terminal',
    now: input.at,
    actor: input.actor ?? { kind: 'system' },
    status: input.to,
  })
  if (!disarmed.changed || disarmed.next === undefined) return false
  draft.dive = disarmed.next
  if (disarmed.comment !== undefined) {
    draft.comments.push({
      id: input.commentId(),
      body: disarmed.comment.body,
      createdAt: input.at,
      createdBy: disarmed.comment.createdBy,
    })
  }
  return true
}
