/**
 * reqboard_submit 定制卡（REQ-c48f99 t3 / FR-2、FR-3、FR-4）。
 * 折叠行：提交<种类> · REQ-xxx（+结果态）；展开：摘要、证据清单。
 * @module dsh-pmboard/client/toolviews/rows
 */
import { strOf, numOf, firstLine, resultText, isSettled, ERROR_CATEGORY, PM_TOOL_BADGE, type CardSummarize } from '../shared.ts'
import { artifactKindLabel } from '../../../shared/artifact-labels.ts'
import type { BizCard } from '../biz-row.ts'

export const submitSummarize: CardSummarize = (args, result, block) => {
  const kind = strOf(args, 'kind')
  if (kind === undefined) return null
  const kindCn = artifactKindLabel(kind)
  const reqId = strOf(args, 'requirement_id') ?? strOf(result, 'requirement_id')
  const err = isSettled(block) && block.isError === true
  if (err) {
    const why = firstLine(resultText(block)).slice(0, 60)
    const code = block.error?.code
    const errorHint = code !== undefined && ERROR_CATEGORY[code] !== undefined
      ? `错误类别：${ERROR_CATEGORY[code]}。请检查参数后重试。`
      : '请检查参数后重试'
    return { icon: '❌', line: `提交${kindCn} 失败：${why}`, isError: true,
      badge: PM_TOOL_BADGE,
      details: [['种类', kindCn]],
      errorDetail: why,
      errorHint }
  }
  const status = strOf(result, 'status') ?? strOf(result, 'plan_status')
  const nextStep = buildNextStep(kind, status)
  const flowCurrent = status
  return {
    icon: '📄',
    line: `提交${kindCn}${reqId !== undefined ? ` · ${reqId}` : ''}${status !== undefined ? ` → ${status}` : ''}`,
    badge: PM_TOOL_BADGE,
    details: [
      ['种类', kindCn],
      ...(strOf(args, 'summary') !== undefined ? [['摘要', strOf(args, 'summary')!.slice(0, 300)] as [string, string]] : []),
      ...(Array.isArray(args?.evidence) ? [['证据', (args!.evidence as unknown[]).map(String).join('\n').slice(0, 500)] as [string, string]] : []),
      ...(numOf(result, 'task_count') !== undefined ? [['任务数', String(numOf(result, 'task_count'))] as [string, string]] : []),
    ],
    nextStep,
    flowCurrent,
  }
}

function buildNextStep(kind: string, _status: string | undefined): string | undefined {
  if (kind === 'design') return '下一步：等待人工确认设计文档'
  if (kind === 'plan') return '下一步：等待人工批准拆分计划'
  if (kind === 'verification') return '下一步：等待人工验收'
  if (kind === 'archive') return '下一步：等待人工归档确认'
  if (kind === 'requirement') return '下一步：进入设计阶段，编写设计文档'
  return undefined
}

export const submitCard: BizCard = { key: 'reqboard_submit', title: '提交产物', icon: '📄', badge: PM_TOOL_BADGE, summarize: submitSummarize }
