/**
 * 「批准计划 → 自动投递」结果的**人话单点**（REQ-261001154450-b918 t5 / serves: FR-3）。
 *
 * 为什么要有它：原实现在投递之后无条件追加「已触发首个任务执行」——而 advanceRequirement
 * 在未装配后台任务端口时返回 `dispatched:false, reason:'jobs_unavailable'`，于是**没投递也报成功**。
 * 本仓铁律是"失败要响亮"，这条属于静默降级：本会话实测三次计划批准后 run 快照仍是
 * `jobStatus: not_found`，而回执上写着"已触发"。
 */
import { fmt } from '../../domain/text/fmt.js'

export interface AdvanceOutcomeLike {
  /** 是否真的投递了后台任务（缺省 = 老形状，按"投递成功但无 runId"处理）。 */
  dispatched?: boolean
  runId?: string
  /** dispatched=false 时的原因（如 jobs_unavailable）。 */
  reason?: string
}

/** 把投递结果转成一句可复核的回执尾巴（不吞失败、不冒功）。 */
export function dispatchNoteOf(outcome: AdvanceOutcomeLike): string {
  if (outcome.dispatched === false) {
    return fmt('；⚠️ 首个任务**未投递**（{why}）——计划与卡已落库，请调 reqboard_task_run 续跑', {
      why: outcome.reason ?? '未给出原因',
    })
  }
  return outcome.runId === undefined
    ? '；已投递首个任务'
    : fmt('；已投递首个任务（run {runId}）', { runId: outcome.runId })
}
