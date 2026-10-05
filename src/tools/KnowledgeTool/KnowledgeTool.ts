/**
 * KnowledgeTool 工具壳（REQ-261001110934-3766 t4）——工具名 `reqboard_kb`。
 *
 * 只做协议转换（参数 / 返回体 / 渲染）；检索与预算裁剪在 `application/use-cases/QueryKnowledge`
 * 与 `application/internal/knowledge-budget`（判定与裁剪都不在工具层——layer-boundary 门禁）。
 * **只读**：不加 `assertNoPendingConfirm`（有待确认弹框时也允许查知识）。
 *
 * @module dsh-pmboard/tools/KnowledgeTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeQueryKnowledge } from '../../application/use-cases/QueryKnowledge.js'
import { KNOWLEDGE_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 一句话摘要（renderSmart 用；只说人关心的：命中几条、有没有截断）。 */
function summarize(v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  const items = Array.isArray(o['items']) ? o['items'] : []
  return '知识检索：命中 ' + String(items.length) + ' 条'
    + (o['truncated'] === true ? '（预算不足已截断，可提高 budgetChars 或按 id 精确取）' : '')
    + (typeof o['hint'] === 'string' && o['hint'].length > 0 ? '｜' + o['hint'] : '')
}

export function defineKnowledgeTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_kb',
    description: KNOWLEDGE_PROMPT,
    parameters: {
      id: { type: 'string', description: '精确取一条（kb-0007 条目 / kb-conventions-c-01 页面小节）' },
      kind: { type: 'string', description: '按类列：architecture/standard/tokens/decision/pitfall/contract/map/glossary' },
      query: { type: 'string', description: '关键词（id / 一句话 / 指针 上做子串匹配；map|tokens 会查机器索引）' },
      limit: { type: 'number', description: '最多返回条数：默认 5，上限 20' },
      budgetChars: { type: 'number', description: '返回字符预算：默认 1500，上限 8000；不足只回指针' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          items: { type: 'array' },
          total: { type: 'number' },
          truncated: { type: 'boolean' },
          budgetChars: { type: 'number' },
          hint: { type: 'string' },
        },
      },
      render: renderSmart(summarize),
    },
    timeoutMs: LIMITS.timeoutWriteMs,
    async execute(args: unknown): Promise<Record<string, unknown>> {
      return await executeQueryKnowledge(deps, args) as unknown as Record<string, unknown>
    },
  } as never)
}
