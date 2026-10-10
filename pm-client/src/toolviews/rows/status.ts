/**
 * reqboard_status 定制卡（REQ-c48f99 t3 / FR-2、FR-3、FR-4）。
 * 折叠行：看板 · 未绑定 / N 个进行中需求；展开：需求清单、可推进动作。
 * @module dsh-pmboard/client/toolviews/rows
 */
import { numOf, firstLine, resultText, isSettled, strOf, formatTimeline, ERROR_CATEGORY, PM_TOOL_BADGE, type CardSummarize, type TimelineEntry } from '../shared.ts'
import type { BizCard } from '../biz-row.ts'

interface OpenReq { id?: string; title?: string; status?: string }

export const statusSummarize: CardSummarize = (_args, result, block) => {
  if (result === undefined && !isSettled(block)) {
    return { icon: '📊', line: '看板状态（查询中…）', badge: PM_TOOL_BADGE }
  }
  if (result === undefined) return null
  const err = isSettled(block) && block.isError === true
  if (err) {
    const why = firstLine(resultText(block)).slice(0, 60)
    const errorDetail = why !== '' ? why : undefined
    const code = block.error?.code
    const errorHint = code !== undefined && ERROR_CATEGORY[code] !== undefined
      ? `错误类别：${ERROR_CATEGORY[code]}。请检查参数后重试。`
      : '请检查参数后重试'
    return { icon: '❌', line: `看板状态查询失败：${why}`, isError: true, badge: PM_TOOL_BADGE, errorDetail, errorHint }
  }
  const bound = result.bound === true
  const openCount = numOf(result, 'open_count') ?? 0
  const reqs = (Array.isArray(result.open_requirements) ? result.open_requirements : []) as OpenReq[]
  const line = bound
    ? `看板 · ${openCount} 个进行中需求${reqs[0]?.id !== undefined ? `（${reqs[0].id}${reqs[0].status !== undefined ? ' ' + reqs[0].status : ''}）` : ''}`
    : '看板 · 未绑定需求'
  const details: Array<[string, string]> = []
  if (reqs.length > 0) {
    details.push(['进行中需求', reqs.map(r => `${r.id ?? '?'} ${r.title ?? ''}（${r.status ?? '?'}）`).join('\n')])
  }
  const actions = Array.isArray(result.next_actions) ? result.next_actions : []
  if (actions.length > 0) details.push(['可推进', actions.map(String).join('、')])
  const unreceived = Array.isArray(result.unreceived_clauses) ? result.unreceived_clauses : []
  if (unreceived.length > 0) details.push(['未接收条款', unreceived.map(String).join('、')])

  const nextStep = actions.length > 0 ? `可推进：${String(actions[0])}` : undefined
  const flowCurrent = strOf(result, 'status') ?? reqs[0]?.status
  const timelineArr = Array.isArray(result.timeline) ? result.timeline as TimelineEntry[] : undefined
  const timeline = formatTimeline(timelineArr, 3)

  return { icon: '📊', line, badge: PM_TOOL_BADGE, details, nextStep, flowCurrent, timeline }
}

export const statusCard: BizCard = { key: 'reqboard_status', title: '看板状态', icon: '📊', badge: PM_TOOL_BADGE, summarize: statusSummarize }
