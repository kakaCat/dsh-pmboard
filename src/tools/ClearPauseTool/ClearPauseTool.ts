/**
 * ClearPauseTool 工具壳（REQ-260925212722-96e7）
 *
 * 清除 Dive 模式的 armed 状态，允许手动操作。
 *
 * @module dsh-pmboard/tools/ClearPauseTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { UseCaseDeps } from '../../application/ports.js'
import { clearPause } from '../../application/use-cases/ClearPause.js'
import { CLEAR_PAUSE_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 回执一句话摘要（FR-4）：首行含需求号 + activation 变化。恢复自 dist 编译快照（§144/§146）。 */
const clearPauseSummary = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>
  if (o['success'] === false) return `❌ 解锁被拒：${String(o['message'] ?? '见明细').slice(0, 60)}`
  return `🔓 Dive 已解锁（${String(o['requirement_id'] ?? '?')}）：${String(o['previous_activation'] ?? '未知')} → disarmed，现在可手动操作`
}

export function defineClearPauseTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_clear_pause',
    description: CLEAR_PAUSE_PROMPT,
    parameters: {
      requirement_id: {
        type: 'string',
        description: '需求 id（REQ-xxxxxx）；不传则默认本窗口绑定的需求'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: '是否成功' },
          requirement_id: { type: 'string', description: '需求 id' },
          previous_activation: { type: 'string', description: '之前的 activation 状态' },
          message: { type: 'string', description: '结果消息' }
        }
      },
      render: renderSmart(clearPauseSummary),
    },
    async execute(input, context: ToolRunContext) {
      const windowKey = deps.session.windowKey(context)
      return await clearPause(deps, windowKey, input)
    }
  })
}
