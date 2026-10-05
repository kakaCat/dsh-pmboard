/**
 * ArchiveAmendTool 工具壳 —— `reqboard_archive_amend`（REQ-261004183621-de3f t3 / FR-4）。
 *
 * 用途：需求归档后才发现清单漏了几份时，**受控补录**——只追加条目 + 留痕；
 * 不改产物文件、不改合并去向/说明书更新点、不改需求状态（历史不可改写）。
 *
 * 单一写入口：本工具与看板路由 `/req/archive-amend` 共用 `amendArchiveManifest` 用例。
 *
 * @module dsh-pmboard/tools/ArchiveAmendTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { amendArchiveManifest } from '../../application/use-cases/AmendArchiveManifest.js'
import { assertNoPendingConfirm } from '../../application/internal/support.js'
import { renderSmart } from '../shared.js'
import { archiveAmendSummary } from './summary.js'

export function defineArchiveAmendTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_archive_amend',
    description: [
      '用于：需求**已归档**后补录归档清单条目（发现漏列时）。',
      '只追加（不提供删除/修改）；已存在条目幂等跳过；写完在需求评论留痕。',
      '不改产物文件、不改合并去向与说明书更新点、不改需求状态。',
    ].join(''),
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；缺省 = 本窗口最近更新的需求' },
      docs: {
        type: 'array',
        description: '要补录的清单条目（非空；kind + path）',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', description: 'requirement / plan / verification / retro / notes' },
            path: { type: 'string', description: '文件路径（工作区相对路径）' },
          },
        },
        required: true,
      },
      reason: { type: 'string', description: '为什么补录（进需求评论留痕；必填）', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          appended: { type: 'array', items: { type: 'string' }, description: '本次真正追加的路径' },
          skipped: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { path: { type: 'string' }, reason: { type: 'string' } },
            },
          },
          status: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: renderSmart(archiveAmendSummary),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> {
      await assertNoPendingConfirm(deps, deps.session.windowKey(exec))
      const out = await amendArchiveManifest(deps, args, exec)
      // 只暴露 schema 声明过的键（输出契约静态扫描：return 分支的键必须都已声明）。
      return {
        success: true,
        requirement_id: out.requirement_id,
        appended: out.appended,
        skipped: out.skipped,
        status: out.status,
        note: out.note,
      }
    },
  } as any)
}
