/**
 * 阶段动作表（REQ-260929210741-30ae FR-7）：工具名 → 合法阶段集，以及越界时的纠偏提示。
 *
 * 纯数据 + 纯函数（零 I/O、零时间）：越界的**判定**在这里，**注入**在
 * `application/dive/boundary-guard.ts`（限流与拼装提示词归它）。
 *
 * @module dsh-pmboard/domain/stage/StageActions
 */
import type { RequirementStatus } from '../requirement/RequirementStatus.js'

/**
 * 工具名 → 合法阶段集。
 * undefined = 全阶段放行（读路径/状态查询/捕获类）。
 * 数组 = 仅这些阶段可调用。
 */
const TOOL_STAGE_MAP: Readonly<Record<string, readonly RequirementStatus[] | undefined>> = {
  'reqboard_status': undefined,
  'reqboard_task_tree': undefined,
  'reqboard_task_status': undefined,
  'reqboard_run_status': undefined,
  'reqboard_confirm_receipt': undefined,
  'reqboard_accept_sheet': undefined,
  'reqboard_note_interruption': undefined,
  'reqboard_clear_pause': undefined,
  'reqboard_capture': ['draft', 'brainstorming'],
  'reqboard_create': ['draft', 'brainstorming'],
  'reqboard_submit': ['brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived', 'done'],
  'reqboard_ask_confirm': ['brainstorming', 'design', 'decomposing', 'implementing', 'accepting'],
  'reqboard_decompose': ['decomposing'],
  'reqboard_task_move': ['implementing', 'accepting'],
  'reqboard_task_run': ['implementing', 'accepting'],
  'reqboard_task_execute': ['implementing', 'accepting'],
  'reqboard_task_report': ['implementing', 'accepting'],
  'reqboard_task_adopt': ['implementing', 'accepting'],
  'reqboard_task_regenerate': ['implementing', 'accepting'],
  'reqboard_move': ['brainstorming', 'design', 'decomposing', 'implementing', 'accepting'],
}

/**
 * 判定工具调用是否越界。
 *
 * @param tool 工具名（reqboard_* 前缀）
 * @param status 窗口绑定需求的当前阶段
 * @returns true = 越界（该工具在当前阶段不合法）
 */
export function isOutOfBounds(tool: string, status: RequirementStatus): boolean {
  if (!tool.startsWith('reqboard_')) return false
  const allowed = TOOL_STAGE_MAP[tool]
  if (allowed === undefined) return false
  return !allowed.includes(status)
}

/**
 * 越界时给出「当前应做什么」的纠偏提示（boundary-guard 注入用）。
 * 返回简短动作指引，不含具体需求上下文（由 boundary-guard 拼装完整提示词）。
 */
export function correctiveActionFor(status: RequirementStatus): string {
  switch (status) {
    case 'draft': return '先立项（reqboard_capture 或 reqboard_create），再按阶段推进'
    case 'brainstorming': return '写/改需求文档 → reqboard_submit(kind=requirement) 登记 → reqboard_ask_confirm(target=artifact, kind=requirement) 请人确认'
    case 'design': return '写设计文档到 design/ 目录 → reqboard_submit(kind=design) 登记 → reqboard_ask_confirm(target=artifact, kind=design) 请人确认'
    case 'decomposing': return '写拆分计划 → reqboard_submit(kind=plan) 提交 → reqboard_ask_confirm(target=plan) 请人批准（批准后自动拆分落库）'
    case 'implementing': return '按任务卡实施 → reqboard_task_move 推进 → 全部完成后 reqboard_submit(kind=verification) 提交验收'
    case 'accepting': return '等人工逐项验收（看板验收单页面）；被退回则按意见返工后重新提交验收'
    case 'archived':
    case 'done': return '需求已归档/完成，无需进一步动作'
    case 'canceled': return '需求已取消，无需进一步动作'
  }
}
