/**
 * CreateTool 工具壳（REQ-47939a t8）——三段式薄壳：prompt（prompt.ts）+ 元数据/入参/输出（本文件）
 * + execute 委托 application 用例。**不含任何领域判定**（状态判断只在 domain）。
 *
 * 返回体与拒绝条件与搬迁前的 host/agent-tools.ts 逐一对应（零行为变更）。
 *
 * @module dsh-pmboard/tools/CreateTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { executeCreateRequirement } from '../../application/use-cases/CreateRequirement.js'
import { CREATE_PROMPT } from './prompt.js'
import { renderSmart } from '../shared.js'
import { createSummary } from '../render-summaries.js'
import { ALL_REQ_CATEGORIES, ALL_PROMPT_DIFFICULTIES } from '../../shared/protocol.js'

export function defineCreateTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_create',
    description: CREATE_PROMPT,
    parameters: {
      title: {
        type: 'string',
        description: '需求名称（用户经立项弹框确认的值，≤120 字符；人工确认时可改）',
        required: true,
      },
      category: {
        type: 'string',
        description: '需求分类：feature / bug / doc / refactor / spike / chore',
        required: true,
        enum: [...ALL_REQ_CATEGORIES],
      },
      summary: {
        type: 'string',
        description: '工作摘要（≤4000 字符；将作为需求描述底稿，留空则用 title 兜底）',
      },
      reason: {
        type: 'string',
        description: '立项依据（≤4000 字符）：为什么值得立项，供人工判断',
      },
      prompt_difficulty: {
        type: 'string',
        description: '算力档位（提示词难度级别）：simple / standard / advanced / expert（默认 standard）——这四档直接决定 agent 在这条需求上投入多少 LLM 算力',
        enum: [...ALL_PROMPT_DIFFICULTIES],
      },
      doc_location: {
        type: 'string',
        description:
          '需求文档存放位置（工作区相对目录，如 docs/requirements/<REQ>/ 或 docs/rfcs/）；不传 / 空串 → 回落 docs/requirements/<REQ>/ 并在 defaults_used 标注（降级路径的文档位置取值）',
      },
      owner_window: {
        type: 'string',
        description:
          '把这条需求登记到哪个窗口名下（**代理立项**：agent 受本窗口直接人工指令，替人把需求派给别的会话）。'
          + '缺省 = 本窗口（老行为）。给窗口码（session-xxxx）= 记到那个窗口名下，并由它接手推进——'
          + '目标窗口必须**在线**，否则 REQBOARD_OWNER_WINDOW_NOT_LIVE（记到死窗口名下没人接手，等于派了个空）。'
          + '典型用法：先用 reqboard_open_window 开窗并投底稿，再对本工具传它的窗口码，一次调用即可完成「立项 + 派活」。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workspace_root: { type: 'string', description: '工作区根' },
          success: { type: 'boolean', description: '是否成功' },
          requirement_id: { type: 'string', description: '新需求 id（REQ-xxxxxx）' },
          title: { type: 'string', description: '需求名称' },
          category: { type: 'string', description: '需求分类' },
          status: { type: 'string', description: '需求状态（draft）' },
          doc_location: { type: 'string', description: '需求文档存放位置（不传时回落默认值，见 defaults_used）' },
          defaults_used: {
            type: 'array',
            description: '走了默认值的问项 id 清单（缺失回落时不静默猜）',
            items: { type: 'string' },
          },
          // REQ-261005141830-7a3b t5（随手修 t4 的漏声明）：用例层返回体带这两个键，
          // 而 schema 是 additionalProperties:false ⇒ 漏声明的后果是**每次立项都被绑定层拒收**
          // `value.projectId is not a declared property`（与 CaptureTool 2026-10-03 实测同类）。
          // 名称按用例层实际键（`project_source`）声明，不改回 camelCase 是为了不破坏已锁定的 T-08/T-09。
          projectId: { type: 'string', description: '本条需求所属项目身份（宿主 workspace id；未归属时整体省略该键）' },
          project_source: { type: 'string', description: '判据来源：project-id（按项目身份）/ path-fallback（路径兜底）' },
          owner_window: { type: 'string', description: '代理立项时的归属窗口码（缺省不传 = 需求记在本窗口名下，该键整体省略）' },
          note: { type: 'string', description: '后续流程说明' },
          board_link: { type: 'string', description: '项目看板链接（点击后在应用内打开看板并定位该需求）' },
        },
      },
      render: renderSmart(createSummary),
    },
    timeoutMs: LIMITS.timeoutReadMs,
    execute: async (args: unknown, exec: ToolRunContext) => executeCreateRequirement(deps, args, exec),
  } as any)
}
