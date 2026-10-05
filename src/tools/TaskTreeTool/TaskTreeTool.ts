/**
 * TaskTreeTool 工具壳（REQ-260927144541-0481 FR-3 / design I-3）——工具名 reqboard_task_tree。
 *
 * 只读父子结构视图：一条命令看清"这条链上有哪几张卡、各自阶段、跑过没有"。
 * 工具壳只做协议转换（参数/返回体/渲染），结构与绑定判定全在 application/use-cases/TaskTree
 * （状态判断只在 domain/application——layer-boundary 门禁）。
 *
 * @module dsh-pmboard/tools/TaskTreeTool
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeTaskTree } from '../../application/use-cases/TaskTree.js'
import { fmt } from '../../domain/text/fmt.js'
import { TASK_TREE_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'

/** 一句话摘要（renderSmart 用）。 */
function summarize(v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.success !== true) return fmt('父子结构查询未成功：{error}', { error: String(o.error ?? '') })
  const parents = Array.isArray(o.parents) ? o.parents : []
  let subs = 0
  for (const p of parents) {
    const list = (p as { subtasks?: unknown }).subtasks
    if (Array.isArray(list)) subs += list.length
  }
  return fmt('父子结构（{requirement_id}）：{parents} 张父卡 / {subs} 张子卡', {
    requirement_id: String(o.requirement_id ?? ''), parents: parents.length, subs,
  })
}

/** 卡片体量 schema（t7 / FR-8；`additionalProperties:false` —— 未声明的键在绑定层就被拒）。 */
const footprintSchema = () => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    files: { type: 'number', description: '要改/新建的文件数' },
    anchors: { type: 'number', description: '验收锚点数（可执行断言条数）' },
    chars: { type: 'number', description: '实施描述与目标改动量合计字符数' },
  },
})

/** 树节点 schema（每次返回新对象：schema 会被编译层消费，不复用同一引用）。 */
const nodeSchema = () => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    role: { type: 'string', description: 'parent=父卡 / subtask=子卡 / legacy=存量卡' },
    stageKind: { type: 'string', description: '子卡阶段（dev/integrate/review/test 等）' },
    dependsOn: { type: 'array', items: { type: 'string' } },
    attempt: { type: 'number' },
    lastRunOk: { type: 'boolean', description: '最近一次 run 是否成功（缺省=未跑过）' },
    reportSummary: { type: 'string', description: '最近一次汇报摘要（截断）' },
    cardDoc: { type: 'string', description: '任务卡文档路径（工作区相对）' },
    footprint: footprintSchema(),
    footprintState: { type: 'string', description: 'declared=已声明体量 / undeclared=未声明（恒在场，未声明不等于 0）' },
  },
})

export function defineTaskTreeTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_task_tree',
    description: TASK_TREE_PROMPT,
    parameters: {
      parent_id: { type: 'string', description: '父卡 id（t-xxxxxx）；不传则列出本窗口绑定需求下的全部父卡' },
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；不传则取本窗口绑定需求' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          requirement_id: { type: 'string' },
          parents: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                parent: nodeSchema(),
                subtasks: { type: 'array', items: nodeSchema() },
                note: { type: 'string' },
              },
            },
          },
          error: { type: 'string' },
          // t7（FR-8）：当轮余量参考（只读展示）。不可得时**整个键缺席**；`note` 恒为
          // 「参考值，非门禁判据」——它必须与数值在同一条展示内（A6 的可判点）。
          contextPressure: {
            type: 'object',
            additionalProperties: false,
            properties: {
              source: { type: 'string', description: 'projection=来自运行时投影 / unavailable=不可得' },
              contextWindow: { type: 'number' },
              projectedTokens: { type: 'number' },
              remainingTokens: { type: 'number', description: '余量 = contextWindow − projectedTokens；两者任一缺席则本键缺席（不猜 0）' },
              note: { type: 'string', description: '固定标注：参考值，非门禁判据' },
            },
          },
        },
      },
      render: renderSmart(summarize),
    },
    timeoutMs: LIMITS.timeoutReadMs,
    execute: async (args: unknown, exec: unknown) => executeTaskTree(deps, args, exec),
  } as any)
}
