/**
 * 工具面出口（REQ-47939a t8 收敛；REQ-261006201508-5cb6 FR-3 增补登记面再导出）。
 *
 * 当前导出 **19 个**工具工厂。工具清单的**唯一手写事实源**是 `tools/registry.ts`——
 * 本文件把它一并再导出，好让 `src/index.ts` 的注册日志与门禁测试从同一处取期望值
 * （数字与名单不再手写，见 design/interfaces.md 第 3 节）。
 *
 * 收敛映射（语义逐一对应，见 design/test-cases.md §5）：
 *   reqboard_create / status / move / decompose / task_move / task_report / accept_sheet 保留；
 *   requirement_submit + plan_submit + verify_submit + archive_submit → reqboard_submit(kind)；
 *   ask_confirm + confirm_artifact → reqboard_ask_confirm（evidence 路径自动分派）。
 *
 * @module dsh-pmboard/tools
 */
export { defineCreateTool } from './intake/CreateTool/index.js'
export { defineCaptureTool } from './intake/CaptureTool/index.js'
export { defineStatusTool } from './intake/StatusTool/index.js'
export { defineTaskReportTool } from './decompose/TaskReportTool/index.js'
export { defineDecomposeTool } from './decompose/DecomposeTool/index.js'
export { defineSubmitTool, SUBMIT_KINDS } from './verify/SubmitTool/index.js'
export { defineAskConfirmTool } from './verify/AskConfirmTool/index.js'
export { defineAcceptSheetTool } from './verify/AcceptSheetTool/index.js'
export { defineTaskRunTool } from './decompose/TaskRunTool/index.js'
export { defineClearPauseTool } from './intake/ClearPauseTool/index.js'
export { defineMoveTool } from './intake/MoveTool/index.js'
export { defineTaskMoveTool } from './decompose/TaskMoveTool/index.js'
export { defineTaskTreeTool } from './decompose/TaskTreeTool/index.js'
export { defineTaskAmendTool, TASK_AMEND_OPS } from './decompose/TaskAmendTool/index.js'
export { defineKnowledgeTool } from './intake/KnowledgeTool/index.js'
export { defineOpenWindowTool, OPEN_WINDOW_PROMPT } from './collab/OpenWindowTool/index.js'
export { defineBindTool, BIND_PROMPT } from './collab/BindTool/index.js'
export { defineHandoffTool } from './collab/HandoffTool/HandoffTool.js'
export { defineSkillInstallTool, SKILL_INSTALL_PROMPT } from './intake/SkillInstallTool/index.js'

// REQ-261006201508-5cb6 FR-3：登记面从工具面出口再导出。
// 注册日志（src/index.ts）与门禁测试都从这里取「有几个工具、都叫什么」——
// 期望值单一来源，避免又长出一份手写名单。
export { TOOL_REGISTRY, type ToolRegistryEntry } from './registry.js'
