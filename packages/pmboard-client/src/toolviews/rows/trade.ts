/**
 * portfolio_trade 定制卡（REQ-c48f99 t3 / FR-2、FR-3、FR-4）。
 * 折叠行：买入 600519 ×1000 @12.34 · 已成交；展开：理由、金额、订单号。
 * @module dsh-pmboard/client/toolviews/rows
 */
import { strOf, numOf, firstLine, resultText, isSettled, cnLabel, TRADE_ACTION, ERROR_CATEGORY, PM_TOOL_BADGE, type CardSummarize } from '../shared.ts'
import type { BizCard } from '../biz-row.ts'

export const tradeSummarize: CardSummarize = (args, result, block) => {
  const action = strOf(args, 'action')
  const symbol = strOf(args, 'symbol') ?? strOf(result, 'symbol')
  if (action === undefined && symbol === undefined) return null
  const err = isSettled(block) && block.isError === true
  const actionCn = cnLabel(TRADE_ACTION, action) ?? action ?? '?'
  if (err) {
    const why = firstLine(resultText(block)).slice(0, 60)
    const code = isSettled(block) ? block.error?.code : undefined
    const errorHint = code !== undefined && ERROR_CATEGORY[code] !== undefined
      ? `错误类别：${ERROR_CATEGORY[code]}。请检查参数后重试。`
      : '请检查参数后重试'
    return { icon: '❌', line: `${actionCn} ${symbol ?? '?'} 失败：${why}`, isError: true, badge: PM_TOOL_BADGE,
      details: [['方向', actionCn]], errorDetail: why, errorHint }
  }
  const qty = numOf(args, 'quantity') ?? numOf(result, 'quantity')
  const price = numOf(args, 'price') ?? numOf(result, 'price')
  const status = strOf(result, 'status')
  const statusCn = status === 'filled' ? '已成交' : status === 'rejected' ? '已拒绝' : status === 'partial' ? '部分成交' : status
  const line = `${actionCn} ${symbol ?? '?'}${qty !== undefined ? ` ×${qty}` : ''}${price !== undefined ? ` @${price}` : ''}${statusCn !== undefined ? ` · ${statusCn}` : ''}`
  const details: Array<[string, string]> = []
  const reason = strOf(args, 'reason')
  if (reason !== undefined) details.push(['理由', reason.slice(0, 400)])
  const amount = numOf(result, 'amount')
  if (amount !== undefined) details.push(['成交金额', `${amount.toFixed(2)} 元`])
  const orderId = strOf(result, 'order_id')
  if (orderId !== undefined) details.push(['订单号', orderId])
  return { icon: '💰', line, badge: PM_TOOL_BADGE, details }
}

export const tradeCard: BizCard = { key: 'portfolio_trade', title: '交易', icon: '💰', badge: PM_TOOL_BADGE, summarize: tradeSummarize }
