/**
 * TaskRefsTool 工具壳 —— `reqboard_task_refs`（REQ-261002164800-d8f2 t5 / FR-4）。
 *
 * 用途：给**已落库**的任务卡补写/修正「需求条款引用」（`TaskRecord.requirementRefs`）。
 * 为什么需要独立工具：卡落库后此前没有任何 refs 写入口（重交计划撞幂等、重跑拆分撞守卫、看板改卡不收该字段），
 * 存量 531 张空引用卡因此补不回来。本工具与看板改卡路由共用同一个用例（`amendTaskRefs`）。
 *
 * 语义：**全量替换**（空数组 = 清空）、值同不写盘（幂等）、写完同步 RTM 并留痕。
 *
 * @module dsh-pmboard/tools/TaskRefsTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeTaskRefs } from '../../application/use-cases/AmendTaskRefs.js'
import { assertNoPendingConfirm } from '../../application/internal/support.js'
import { renderSmart } from '../shared.js'
import { taskRefsSummary } from './summary.js'

export function defineTaskRefsTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_task_refs',
    description: [
      '用于：给已落库的任务卡补写或修正需求条款引用（requirementRefs）。',
      '全量替换语义（不是追加）；传空数组 = 清空；值没变时幂等不写盘。',
      '写完同步 RTM 的 serves 并在需求评论里留痕；卡不属于本窗口绑定需求 → 拒绝。',
    ].join(''),
    parameters: {
      task_id: { type: 'string', description: '任务 id（t-xxxxxx）', required: true },
      requirement_refs: {
        type: 'array',
        description: '目标引用集（全量替换，如 ["FR-1","FR-2"]；空数组 = 清空）',
        items: { type: 'string' },
        required: true,
      },
      reason: { type: 'string', description: '为什么改（进需求评论留痕）', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          task_id: { type: 'string' },
          requirement_id: { type: 'string' },
          before: { type: 'array', items: { type: 'string' } },
          after: { type: 'array', items: { type: 'string' } },
          changed: { type: 'boolean', description: 'false = 值没变，未写盘（幂等）' },
          rtm_synced: { type: 'boolean', description: '是否已同步 RTM（失败不阻断，如实回报）' },
          note: { type: 'string' },
        },
      },
      render: renderSmart(taskRefsSummary),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> {
      await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      return await executeTaskRefs(deps, args, exec) as Record<string, unknown>
    },
  } as any)
}
