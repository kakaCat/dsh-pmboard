/**
 * MoveTool（工具名 reqboard_move）——agent 侧需求阶段推进（REQ-260927100007-b8ba FR-7）。
 * @module dsh-pmboard/tools/MoveTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeMoveRequirement } from '../../application/use-cases/MoveRequirement.js'
import { assertNoPendingConfirm } from '../../application/internal/support.js'
import { renderSmart } from '../shared.js'

const summarize = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>
  return '需求推进：' + String(o['requirement_id'] ?? '') + ' ' + String(o['from'] ?? '?') + ' → ' + String(o['to'] ?? '?')
}

export function defineMoveTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_move',
    description: '用于：推进需求阶段状态（如 design → decomposing）。五道人工门 agent 一律不可越过（代码级 human_gate）；产物未确认、或计划有卡而台账 0 卡时拒绝并给修复指引。',
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；不传默认本窗口绑定的需求' },
      to: { type: 'string', description: '目标状态（draft/brainstorming/design/decomposing/implementing/accepting/archived/canceled/done）' },
      reason: { type: 'string', description: '推进理由（进台账留痕）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          status: { type: 'string' },
          // 回退专用回执（REQ-261003204149-1e80 FR-1 / design/interfaces.md）。
          // **四个子键必须逐字声明**：`rollback` 是嵌套对象，而静态扫描只看 return 的顶层键
          // ——本仓 2026-10-03 当天已因两处同类漂移（capture 的 answers.workspace、
          // submit 的 auto_confirm）把「值算出来了、副作用也发生了」的成功调用变成一条
          // invalid output。嵌套对象是这类事故的高发形状，故此处显式声明到叶子。
          // 前进方向**整体省略**该键（不是发 null / undefined）。
          rollback: {
            type: 'object',
            additionalProperties: false,
            description: '回退专用回执：作废了什么、旧卡怎么处置（仅回退方向出现）',
            properties: {
              artifacts_revoked: {
                type: 'array',
                items: { type: 'string' },
                description: '被撤章的产物 path（空数组 = 无下游产物）',
              },
              plan_approval_revoked: { type: 'boolean', description: '是否清掉了 plan.approvedAt' },
              tasks_canceled: { type: 'number', description: '被标 canceled 的旧卡数' },
              tasks_reworked: { type: 'number', description: '物化的重做卡数' },
            },
          },
        },
      },
      render: renderSmart(summarize),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> {
      await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      return await executeMoveRequirement(deps, args, exec) as Record<string, unknown>
    },
  } as any)
}
