/**
 * watch_manage 定制卡（REQ-c48f99 t3 / FR-2、FR-3、FR-4）。
 * 折叠行：盯盘 · 新建 · 600519 price>15；展开：名称、条件、理由、过期时间。
 * @module dsh-pmboard/client/toolviews/rows
 */
import { strOf, numOf, firstLine, resultText, isSettled, cnLabel, WATCH_ACTION, ERROR_CATEGORY, PM_TOOL_BADGE, type CardSummarize } from '../shared.ts'
import type { BizCard } from '../biz-row.ts'

export const watchSummarize: CardSummarize = (args, result, block) => {
  const action = strOf(args, 'action')
  if (action === undefined) return null
  const err = isSettled(block) && block.isError === true
  if (err) {
    const why = firstLine(resultText(block)).slice(0, 60)
    const code = isSettled(block) ? block.error?.code : undefined
    const errorHint = code !== undefined && ERROR_CATEGORY[code] !== undefined
      ? `错误类别：${ERROR_CATEGORY[code]}。请检查参数后重试。`
      : '请检查参数后重试'
    return { icon: '❌', line: `盯盘规则失败：${why}`, isError: true, badge: PM_TOOL_BADGE, errorDetail: why, errorHint }
  }
  const actionCn = cnLabel(WATCH_ACTION, action) ?? action
  const symbol = strOf(args, 'symbol')
  const condition = strOf(args, 'condition')
  const ruleId = numOf(args, 'rule_id') ?? numOf(result, 'rule_id')
  const parts = [`盯盘 · ${actionCn}`]
  if (symbol !== undefined) parts.push(symbol)
  if (condition !== undefined) parts.push(condition.slice(0, 40))
  if (ruleId !== undefined && action !== 'create') parts.push('#' + ruleId)
  const details: Array<[string, string]> = []
  const name = strOf(args, 'name')
  if (name !== undefined) details.push(['名称', name])
  if (condition !== undefined) details.push(['条件', condition])
  const reason = strOf(args, 'reason')
  if (reason !== undefined) details.push(['理由', reason.slice(0, 300)])
  const expires = strOf(args, 'expires_at')
  if (expires !== undefined) details.push(['过期时间', expires])
  const msg = strOf(result, 'message')
  if (msg !== undefined) details.push(['结果', msg])
  return { icon: '👁', line: parts.join(' '), badge: PM_TOOL_BADGE, details }
}

export const watchCard: BizCard = { key: 'watch_manage', title: '盯盘', icon: '👁', badge: PM_TOOL_BADGE, summarize: watchSummarize }
