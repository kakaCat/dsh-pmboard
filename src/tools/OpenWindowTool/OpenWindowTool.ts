/**
 * OpenWindowTool 工具壳（REQ-261003215944-9e04 FR-1 / FR-8 · t4）
 *
 * 让 agent 能开一个新窗口：薄壳，判断与文案都在用例层（`application/use-cases/OpenWindow.ts`）。
 *
 * @module dsh-pmboard/tools/OpenWindowTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { UseCaseDeps } from '../../application/ports.js'
import { openWindow } from '../../application/use-cases/OpenWindow.js'
import { OPEN_WINDOW_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 造窗方式（受控枚举，与 CreateTool 同款写法：字面量数组经 const 收窄）。 */
const OPEN_WINDOW_MODES = ['fork', 'create'] as const

/** 回执一句话摘要：窗口码 + 一句"去侧栏打开"（刻意不宣称"已经打开了窗口"）。 */
const openWindowSummary = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>
  if (o['success'] === false) return `❌ 开窗被拒：${String(o['message'] ?? '见明细').slice(0, 60)}`
  return `🪟 新窗口已创建：${String(o['window_key'] ?? '?')}（请在侧栏打开）`
}

export function defineOpenWindowTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_open_window',
    description: OPEN_WINDOW_PROMPT,
    parameters: {
      mode: {
        type: 'string',
        enum: [...OPEN_WINDOW_MODES],
        description: 'fork = 带上下文（默认）；create = 全新空会话',
      },
      at_seq: {
        type: 'number',
        description: '仅 fork：切点事件序号（含）；缺省 = 最近一个完整回合',
      },
      seed_text: {
        type: 'string',
        description: '开窗后要投给新窗口的底稿正文（可选）；以自署来源投递，不冒充人类发言。写法：每条短句（建议 ≤60 字）；需引号用「」',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: '是否成功创建新窗口' },
          window_key: { type: 'string', description: '新窗口码（= 新会话 id = 新 root agent id）' },
          parent_session_id: { type: 'string', description: 'fork 的源窗口；create 时缺省' },
          mode: { type: 'string', description: '实际使用的造窗方式：fork / create' },
          degraded_note: { type: 'string', description: '诚实降级说明：会话已创建，请在侧栏打开' },
          delivery: {
            type: 'object',
            additionalProperties: false,
            description: '底稿投递结果（未投则不出现该键）',
            properties: {
              delivered: { type: 'boolean', description: '是否投递成功' },
              kind: { type: 'string', description: '自署来源（永不为 user）' },
              reason: { type: 'string', description: '未投成功时的原因' },
            },
          },
        },
      },
      render: renderSmart(openWindowSummary),
    },
    async execute(input: { mode?: 'fork' | 'create'; at_seq?: number; seed_text?: string }, context: ToolRunContext) {
      return await openWindow(
        deps,
        {
          ...(input.mode !== undefined ? { mode: input.mode } : {}),
          ...(input.at_seq !== undefined ? { atSeq: input.at_seq } : {}),
          ...(input.seed_text !== undefined ? { seedText: input.seed_text } : {}),
        },
        context,
      )
    },
  })
}
