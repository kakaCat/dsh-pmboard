/**
 * 长文本入参写法约定（REQ-261002115204-ba52 FR-2）：各工具的长文本字段说明统一引用本常量，
 * 防中文串半角引号漏转义致整轮报废。**唯一来源** —— 恢复自 dist 编译快照（§115/§131.4）。
 *
 * **两级化（REQ-261007200706-89b7 FR-5）**：原先把「文本过大拆成多次调用」也塞进这一句，
 * 于是它被无差别复制到**一次性副作用工具**（handoff / task_move / note_interruption / adopt /
 * regenerate / capture 的 reason 与 summary）——对那些工具，"拆成多次调用"= 指引 agent 把同一个
 * 动作执行多遍（交接两遍、推进两遍）。现在拆成两段：
 *   · `LONG_TEXT_STYLE_NOTE`（写法指引，所有长文本字段都该有）；
 *   · `LONG_TEXT_SPLIT_NOTE`（只在**幂等/追加语义**工具上成立，见 `LONG_TEXT_FIELDS`）；
 *   · `LONG_TEXT_ARG_NOTE` = 两段拼接（兼容既有引用；新代码按语义选段，别再用拼接版兜底）。
 */
export const LONG_TEXT_STYLE_NOTE = '写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号'
export const LONG_TEXT_SPLIT_NOTE = '；文本过大拆成多次调用'
export const LONG_TEXT_ARG_NOTE = LONG_TEXT_STYLE_NOTE + LONG_TEXT_SPLIT_NOTE

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
 * 「各工具的长文本字段说明都引用了约定的锚点」。
 * 字段名必须是各工具 schema `parameters.properties` 里**真实存在**的键（实测所得，见 §140.1）。
 *
 * **本表 = 幂等/追加语义**：重复调用同一入参不会产生第二次副作用（汇报追加段落、登记幂等、
 * 同门复用），所以「文本过大拆成多次调用」是**成立**的建议。一次性副作用工具见
 * `LONG_TEXT_STYLE_ONLY_FIELDS`——那里禁止出现该半句（FR-5 的机械锁）。
 */
export const LONG_TEXT_FIELDS: readonly { readonly tool: string; readonly field: string }[] = [
  { tool: 'reqboard_task_report', field: 'summary' },
  { tool: 'reqboard_task_report', field: 'completed' },
  { tool: 'reqboard_task_report', field: 'next_step' },
  { tool: 'reqboard_submit', field: 'summary' },
  { tool: 'reqboard_ask_confirm', field: 'question' },
]

/**
 * 长文本入参登记表（**一次性副作用**语义，REQ-261007200706-89b7 FR-5）——这些字段指向的动作
 * 重复执行会**再产生一次副作用**（换一次 owner、推一次状态机、覆盖一次断点、挂一次卡、补一次链、
 * 立一次项），所以只挂写法指引（STYLE），**不得**挂「拆成多次调用」（SPLIT）。
 * 反向判据同在这张表上：arg-guidance 用例断言这些字段的说明**不含**该半句——危险指引想溜回来即红。
 */
export const LONG_TEXT_STYLE_ONLY_FIELDS: readonly { readonly tool: string; readonly field: string }[] = [
  { tool: 'reqboard_task_move', field: 'reason' },
  { tool: 'reqboard_capture', field: 'summary' },
  { tool: 'reqboard_task_amend', field: 'reason' },
  { tool: 'reqboard_handoff', field: 'reason' },
]

/** 全部登记字段（两张表的并集；遍历口径用，勿手抄重复清单）。 */
export const ALL_LONG_TEXT_FIELDS: readonly { readonly tool: string; readonly field: string }[] = [
  ...LONG_TEXT_FIELDS,
  ...LONG_TEXT_STYLE_ONLY_FIELDS,
]

/**
 * 造窗方式枚举（REQ-261007220012-bd29 FR-6）——**唯一定义**。
 *
 * 合并前 handoff 与 open_window 各写一份逐字相同的 `['fork','create']`（含各自的 const 名），
 * 改一处必忘另一处。现两处都引用本常量（`enum: [...WINDOW_MODES]`）。
 */
export const WINDOW_MODES = ['fork', 'create'] as const

/**
 * 开窗继承回执子 schema（REQ-261007220012-bd29 FR-6）——**唯一定义**。
 *
 * handoff 与 open_window 的 `inheritance` 逐字重复（title/preset/model + reasons）；
 * 这里抽成函数而非常量：schema 会被编译层消费，**每次返回新对象**（与 TaskTreeTool 的
 * `nodeSchema()` 同款纪律，避免复用同一引用）。
 */
export function windowInheritanceSchema(description?: string) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    description: description ?? '继承回执：标题 / 模式 / 模型三态 + 只记 skipped/failed 的原因',
    properties: {
      title: { type: 'string' as const, description: '标题是否写定：set | skipped | failed' },
      preset: { type: 'string' as const, description: '模式（Agent 预设）是否继承：set | skipped | failed' },
      model: { type: 'string' as const, description: '模型是否继承：set | skipped | failed' },
      reasons: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'skipped / failed 的可读原因（每条形如「标题：源会话无标题」）',
      },
    },
  }
}
