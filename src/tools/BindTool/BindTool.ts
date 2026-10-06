/**
 * BindTool 工具壳（REQ-261003215944-9e04 FR-2）——三段式薄壳：prompt + 元数据/入参/输出 + execute 委托用例。
 * 判定全在 application 层（`bindSeat`），本文件只做入参声明与回执渲染。
 *
 * @module dsh-pmboard/tools/BindTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { UseCaseDeps } from '../../application/ports.js'
import { bindSeat, type BindableRole } from '../../application/use-cases/BindSeat.js'
import { BIND_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 回执一句话摘要：谁被派进来了/送出去了，现在几个席位。 */
const bindSummary = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>
  if (o['success'] === false) return `❌ 派席被拒：${String(o['message'] ?? '见明细').slice(0, 80)}`
  const action = o['removed'] === true ? '已解绑' : '已派席'
  const changed = o['changed'] === false ? '（幂等：席位表未变）' : ''
  const seats = Array.isArray(o['seats']) ? o['seats'].length : '?'
  return `🪑 ${String(o['requirement_id'] ?? '?')} ${action} ${String(o['window_key'] ?? '?')} 为 ${String(o['role'] ?? '?')}${changed}；当前 ${String(seats)} 个席位`
}

export function defineBindTool(deps: UseCaseDeps, opts?: { seatsMax?: number }) {
  return defineTool({
    name: 'reqboard_bind',
    description: BIND_PROMPT,
    parameters: {
      role: {
        type: 'string' as const,
        description: '席位角色：worker = 能领卡/汇报/提交产物；observer = 只读。（owner 由立项产生，不经本工具）',
        enum: ['worker', 'observer'],
        required: true,
      },
      requirement_id: {
        type: 'string' as const,
        description: '需求 id（REQ-xxxxxx）；不传则默认本窗口绑定的需求',
      },
      window_key: {
        type: 'string' as const,
        description: '席位派给哪个窗口（= 会话 id）；不传则默认本窗口',
      },
      remove: {
        type: 'boolean' as const,
        description: 'true = 解绑该席位（owner 不可解绑：会返回 REQBOARD_INVALID_INPUT）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: '是否成功' },
          requirement_id: { type: 'string', description: '目标需求 id' },
          window_key: { type: 'string', description: '被派席/解绑的窗口' },
          role: { type: 'string', description: '席位角色（worker / observer）' },
          removed: { type: 'boolean', description: '本次是否为解绑' },
          changed: { type: 'boolean', description: '席位表是否真的变了（false = 幂等）' },
          // REQ-261005141830-7a3b t6（FR-11 / FR-9）：派席的项目判据与需求侧身份。
          // **必须声明**：schema 是 additionalProperties:false，漏声明 = 每次派席都被绑定层拒收。
          project_source: { type: 'string', description: '本次派席判据：project-id / path-fallback（解绑时不返回该键）' },
          project_id: { type: 'string', description: '需求侧项目身份（未归属或缺省时不返回该键）' },
          seats: {
            type: 'array',
            description: '变更后的完整席位表（与台账逐字一致）',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                windowKey: { type: 'string', description: '席位窗口' },
                role: { type: 'string', description: 'owner / worker / observer' },
                joinedAt: { type: 'number', description: '入席时刻（ms）' },
                lastSeenAt: { type: 'number', description: '最近活跃时刻（ms，可选）' },
              },
            },
          },
        },
      },
      render: renderSmart(bindSummary),
    },
    async execute(input: unknown, context: ToolRunContext) {
      const windowKey = deps.session.windowKey(context)
      const a = (input ?? {}) as { role?: unknown; requirement_id?: unknown; window_key?: unknown; remove?: unknown }
      const result = await bindSeat(deps, windowKey, {
        role: a.role as BindableRole,
        requirementId: typeof a.requirement_id === 'string' ? a.requirement_id : undefined,
        windowKey: typeof a.window_key === 'string' ? a.window_key : undefined,
        remove: a.remove,
      }, opts?.seatsMax)
      return result
    },
  })
}
