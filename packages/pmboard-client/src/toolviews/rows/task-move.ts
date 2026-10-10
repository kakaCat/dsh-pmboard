/**
 * reqboard_task_move 定制卡（REQ-c48f99 t2 / FR-2、FR-3）。
 * 折叠行：`t-xxx → 完工`（icon 随 to 变；error 红）；展开体：from→to、理由、需求状态。
 * @module dsh-pmboard/client/toolviews/rows/task-move
 */
import {
  cnLabel, strOf, firstLine, resultText, isSettled,
  TASK_MOVE_TO, ERROR_CATEGORY, PM_TOOL_BADGE,
  type CardSummarize,
} from '../shared.ts'
import type { BizCard } from '../biz-row.ts'

/** 游离纯函数（单测直接测它）。 */
export const taskMoveSummarize: CardSummarize = (args, result, block) => {
  const taskId = strOf(args, 'task_id') ?? strOf(result, 'task_id')
  const to = strOf(args, 'to') ?? strOf(result, 'to')
  if (taskId === undefined && to === undefined) return null

  const from = strOf(result, 'from')
  const err = isSettled(block) && block.isError === true
  const toCn = cnLabel(TASK_MOVE_TO, to)
  const id = taskId ?? '?'

  if (err) {
    const why = resultHeadlineOr(block)
    const errorDetail = why !== '' ? why.slice(0, 120) : undefined
    const errorHint = buildErrorHint(block)
    return {
      icon: '❌',
      line: `${id} 推进失败${why !== '' ? `：${why.slice(0, 60)}` : ''}`,
      isError: true,
      badge: PM_TOOL_BADGE,
      details: buildDetails(id, from, to, toCn, args, result),
      errorDetail,
      errorHint,
    }
  }
  const icon = to === 'done' ? '✅' : to === 'canceled' ? '🚫' : to === 'todo' ? '↩️' : '🔀'
  const trans = from !== undefined
    ? `（${cnLabel(TASK_MOVE_TO, from) ?? from} → ${toCn ?? to ?? ''}）`
    : ''
  const nextStep = buildNextStep(to)
  const flowCurrent = strOf(result, 'requirement_status')
  return {
    icon,
    line: `${id} → ${toCn ?? to ?? '?'}${trans}`,
    badge: PM_TOOL_BADGE,
    details: buildDetails(id, from, to, toCn, args, result),
    nextStep,
    flowCurrent,
  }
}

function buildNextStep(to: string | undefined): string | undefined {
  if (to === 'done') return '需求进度已更新，可继续推进下一任务'
  if (to === 'in_progress') return '任务已开工，请按任务说明执行'
  if (to === 'todo') return '任务已退回，请检查阻塞原因'
  if (to === 'canceled') return '任务已取消，可继续其他任务'
  return undefined
}

function buildErrorHint(block: Parameters<CardSummarize>[2]): string | undefined {
  const code = isSettled(block) ? block.error?.code : undefined
  if (code !== undefined && ERROR_CATEGORY[code] !== undefined) {
    return `错误类别：${ERROR_CATEGORY[code]}。请检查参数或状态后重试。`
  }
  return '请检查参数格式和当前状态后重试'
}

function resultHeadlineOr(block: Parameters<CardSummarize>[2]): string {
  const text = resultText(block).trim()
  if (text === '') return ''
  return firstLine(text)
}

function buildDetails(
  id: string,
  from: string | undefined,
  to: string | undefined,
  toCn: string | undefined,
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [['任务', id]]
  if (from !== undefined || to !== undefined) {
    rows.push(['状态迁移', `${cnLabel(TASK_MOVE_TO, from) ?? from ?? '?'} → ${toCn ?? to ?? '?'}`])
  }
  const reason = strOf(args, 'reason')
  if (reason !== undefined) rows.push(['理由', reason])
  const reqStatus = strOf(result, 'requirement_status')
  if (reqStatus !== undefined) rows.push(['需求状态', reqStatus])
  return rows
}

export const taskMoveCard: BizCard = {
  key: 'reqboard_task_move',
  title: '任务推进',
  icon: '🔀',
  badge: PM_TOOL_BADGE,
  summarize: taskMoveSummarize,
}
