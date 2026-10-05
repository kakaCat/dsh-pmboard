/**
 * 长文本入参写法约定（REQ-261002115204-ba52 FR-2）：各工具的长文本字段说明统一引用本常量，
 * 防中文串半角引号漏转义致整轮报废。**唯一来源** —— 恢复自 dist 编译快照（§115/§131.4）。
 */
export const LONG_TEXT_ARG_NOTE = '写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号；文本过大拆成多次调用'

/**
 * 工具壳共享（REQ-47939a t8）——工具壳的通用渲染助手。
 * @module dsh-pmboard/tools/shared
 */
export const renderJson = (_args: unknown, value: unknown) => [
  { type: 'text', text: JSON.stringify(value, null, 2) },
]

/**
 * 人话首行渲染（REQ-c48f99 t1/t4 / FR-5）：首行 = 中文摘要（≤120 字符单行），
 * 空行后附 JSON 明细。通用卡输出区与 errorSummary 都取首行——未注册定制卡片的
 * 工具也立即获得可读摘要，零框架改动。
 *
 * renderJson 保留兼容（旧调用方零影响）；工具迁移时逐换 renderSmart(summarize)。
 * summarize 契约：输入为工具返回值；输出必须是**单行**（多行会被首行语义截断）。
 */
export const renderSmart =
  (summarize: (value: unknown) => string) =>
  (_args: unknown, value: unknown) => {
    const line = summarize(value).split('\n')[0].slice(0, 120)
    // `type: 'text' as const`：把首元素类型收窄成字面量 'text'（框架 ContentBlock 里该字段是字面量联合）。
    // 不收窄时推导成 `{ type: string; text: string }[]`，在**参数 schema 被 const 收窄**（带 enum）的工具上
    // 会被判"不可赋值给 ContentBlock[]"（实测：reqboard_open_window 的 mode enum）。
    return [{ type: 'text' as const, text: line + '\n\n' + JSON.stringify(value, null, 2) }]
  }

/**
 * 长文本入参字段登记表（REQ-261002115204-ba52 FR-2）——供 arg-guidance 用例核对
 * 「各工具的长文本字段说明都引用了 LONG_TEXT_ARG_NOTE 的三锚点」。
 * 字段名必须是各工具 schema `parameters.properties` 里**真实存在**的键（实测所得，见 §140.1）。
 */
export const LONG_TEXT_FIELDS: readonly { readonly tool: string; readonly field: string }[] = [
  { tool: 'reqboard_task_report', field: 'summary' },
  { tool: 'reqboard_task_report', field: 'completed' },
  { tool: 'reqboard_task_report', field: 'next_step' },
  { tool: 'reqboard_submit', field: 'summary' },
  { tool: 'reqboard_ask_confirm', field: 'question' },
  { tool: 'reqboard_task_move', field: 'reason' },
  { tool: 'reqboard_capture', field: 'summary' },
  { tool: 'reqboard_note_interruption', field: 'reason' },
  { tool: 'reqboard_task_adopt', field: 'reason' },
  { tool: 'reqboard_task_regenerate', field: 'reason' },
]
