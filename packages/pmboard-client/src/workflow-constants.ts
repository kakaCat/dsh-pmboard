/**
 * 流程节点定义常量
 * 
 * 唯一事实源：docs/architecture/workflow-stages.md
 * 
 * 本文件是前端对流程节点定义的实现，所有流程节点名称、颜色、顺序
 * 必须从这里引用，禁止硬编码。
 * 
 * @module dsh-pmboard/client/workflow-constants
 */

/**
 * 流程节点定义
 * 7 个主态：draft → brainstorming → design → decomposing → implementing → accepting → archived
 * 1 个过渡态：done（后端终态，done 但未 archived）
 *
 * `desc` 是**界面上的简短副标题**（如"立项 · 立项草稿"里的后半句），逐字取自本需求的界面基准
 * `docs/requirements/REQ-261004103330-005f/prototype/board-settings.html` 的 `STAGES[].desc`。
 * 它与 `application/dive/stage-configs.ts` 的 `description` **不是一回事**：后者是给 Agent 看的行为说明
 * （更长，且属服务端层，客户端不得引用）。两者用途不同故不合并——但副标题只在本表这一处出现。
 */
export const WORKFLOW_STAGES = {
  draft: { label: '立项', color: '#9aa4b2', order: 0, desc: '立项草稿' },
  brainstorming: { label: '需求分析', color: '#f0a020', order: 1, desc: '调研与写需求文档' },
  design: { label: '设计', color: '#c2255c', order: 2, desc: '写设计文档' },
  decomposing: { label: '拆分', color: '#8e44ad', order: 3, desc: '写拆分计划（等人工批准）' },
  implementing: { label: '实施', color: '#4a7dff', order: 4, desc: '全自动执行任务' },
  accepting: { label: '验收', color: '#17a2b8', order: 5, desc: '等人工验收' },
  done: { label: '完成', color: '#28a745', order: 6, desc: '无后续行为' },
  archived: { label: '归档', color: '#28a745', order: 7, desc: '无后续行为' }
} as const

/** 工作流阶段类型 */
export type WorkflowStage = keyof typeof WORKFLOW_STAGES

/**
 * 8 态进度点顺序（用于需求详情页进度点渲染）
 * 包含 7 个主态 + 1 个过渡态 done
 */
export const PROGRESS_DOT_STAGES: readonly WorkflowStage[] = [
  'draft',
  'brainstorming',
  'design',
  'decomposing',
  'implementing',
  'accepting',
  'done',
  'archived'
] as const

/**
 * 6 个泳道顺序（用于泳道视图）
 * 不包含 done（过渡态）和 archived（已归档需求在验收泳道置灰显示）
 */
export const LANE_STAGES: readonly WorkflowStage[] = [
  'draft',
  'brainstorming',
  'design',
  'decomposing',
  'implementing',
  'accepting'
] as const

/**
 * 获取流程节点的显示标签
 * @param stage 流程节点
 * @returns 中文标签
 */
export function getStageLabel(stage: WorkflowStage): string {
  return WORKFLOW_STAGES[stage]?.label ?? stage
}

/**
 * 获取流程节点的颜色
 * @param stage 流程节点
 * @returns 十六进制颜色值
 */
export function getStageColor(stage: WorkflowStage): string {
  return WORKFLOW_STAGES[stage]?.color ?? '#999'
}

/**
 * 获取流程节点的顺序
 * @param stage 流程节点
 * @returns 顺序数字（0-7）
 */
export function getStageOrder(stage: WorkflowStage): number {
  return WORKFLOW_STAGES[stage]?.order ?? -1
}
