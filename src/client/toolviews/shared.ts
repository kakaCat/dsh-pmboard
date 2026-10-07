/**
 * 业务工具定制卡片 · 数据契约与纯函数（REQ-c48f99 t1 / FR-1、FR-4）。
 *
 * 本文件零依赖（不 import react），使 host 侧 vitest 可直接单测；
 * BizRow / 卡片组件（rows/*.ts）才允许引入 react。
 *
 * 核心不变式：
 *  - parseArgs/resultJson 对任何输入不 throw，失败返回 undefined（FR-4 兜底前提）；
 *  - summarize 返回 null 的唯一合法含义 = 交 fallbackRow；
 *  - 折叠行摘要单行（多行会被 GenericToolCard 首行截断语义破坏）。
 * @module dsh-pmboard/client/toolviews/shared
 */

// ---------------------------------------------------------------------------
// block 数据形态（会话事件投影，只读）
// ---------------------------------------------------------------------------

/** 运行中的工具调用（未结算）。 */
export interface RunningBlock {
  callId: string
  name?: string
  argsRaw?: string
  parentCallId?: string
}

/** 已结算的工具结果节点。 */
export interface SettledBlock {
  kind: 'tool-result'
  callId: string
  parentCallId?: string
  call?: { name?: string; argsRaw?: string }
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  error?: { name?: string; code?: string }
  meta?: unknown
}

export type ToolBlock = RunningBlock | SettledBlock

export function isSettled(block: ToolBlock): block is SettledBlock {
  return 'kind' in block && (block as SettledBlock).kind === 'tool-result'
}

/** 取 argsRaw：结算态在 call.argsRaw，运行态在 argsRaw。 */
export function argsRawOf(block: ToolBlock): string {
  return (isSettled(block) ? block.call?.argsRaw : block.argsRaw) ?? ''
}

// ---------------------------------------------------------------------------
// 解析纯函数（不 throw 契约）
// ---------------------------------------------------------------------------

/**
 * 解析 argsRaw 为参数对象。半截 JSON（流式）、非对象 JSON、非法输入
 * 一律返回 undefined（FR-4：调用方据此走 fallbackRow，禁止 throw）。
 */
export function parseArgs(argsRaw: string): Record<string, unknown> | undefined {
  if (typeof argsRaw !== 'string' || argsRaw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 拼接结果文本（content 里全部 text 段）。 */
export function resultText(block: ToolBlock): string {
  if (!isSettled(block)) return ''
  const parts: string[] = []
  for (const seg of block.content ?? []) {
    if (seg?.type === 'text' && typeof seg.text === 'string') parts.push(seg.text)
  }
  return parts.join('\n')
}

/** 把结果文本解析为 JSON 对象；失败返回 undefined（不 throw）。
 * 兼容 renderSmart 形态（首行摘要 + 空行 + JSON 明细）：整段解析失败时，
 * 取第一个空行之后的部分再试一次。 */
export function resultJson(block: ToolBlock): Record<string, unknown> | undefined {
  const text = resultText(block).trim()
  if (text === '') return undefined
  const tryParse = (s: string): Record<string, unknown> | undefined => {
    try {
      const parsed: unknown = JSON.parse(s)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
      return parsed as Record<string, unknown>
    } catch {
      return undefined
    }
  }
  const whole = tryParse(text)
  if (whole !== undefined) return whole
  const split = text.indexOf('\n\n')
  if (split === -1) return undefined
  return tryParse(text.slice(split + 2).trim())
}

/** 结果的人话首行：renderSmart 形态取首行摘要；纯 JSON 形态取空串。 */
export function resultHeadline(block: ToolBlock): string {
  const text = resultText(block).trim()
  if (text === '' || text.startsWith('{') || text.startsWith('[')) return ''
  return firstLine(text)
}

export function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

/** 取字符串字段（空串视为无）。 */
export function strOf(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = obj?.[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** 取数字字段。 */
export function numOf(obj: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = obj?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// ---------------------------------------------------------------------------
// PM 可视化增强常量与工具函数（REQ-260929184406-2084 / FR-1、FR-3、FR-4、FR-5、FR-6）
// ---------------------------------------------------------------------------

/** PM 工具徽章唯一来源（FR-1）。 */
export const PM_TOOL_BADGE = '📋'

/** 需求流水线 7 节点（FR-5/FR-6；与 conversation-progress.ts 的 FLOW 同序）。 */
export const REQ_FLOW: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'draft', label: '立项' },
  { key: 'brainstorming', label: '需求分析' },
  { key: 'design', label: '设计' },
  { key: 'decomposing', label: '拆分' },
  { key: 'implementing', label: '实施' },
  { key: 'accepting', label: '验收' },
  { key: 'archived', label: '归档' },
]

/** 错误类别映射表（FR-4）：工具返回的错误码 → 中文类别名。 */
export const ERROR_CATEGORY: Readonly<Record<string, string>> = {
  REQBOARD_INVALID_INPUT: '参数校验失败',
  REQBOARD_BAD_STATUS: '状态不允许',
  REQBOARD_DRIVER_REQUIRED: '需要驱动回合',
  REQBOARD_DIRECT_HUMAN_REQUIRED: '需要直接人工回合',
  REQBOARD_NO_BOUND_REQ: '窗口未绑定需求',
  REQBOARD_UNKNOWN_TICKET: '未知票据',
  REQBOARD_EVIDENCE_FAKE: '证据不合法',
  REQBOARD_CONFIRM_PENDING: '确认阻塞',
  // REQ-261003215944-9e04 FR-1：开窗通道不可用 / 无完成回合（可改用 create）/ 建会话失败
  REQBOARD_OPEN_WINDOW_UNAVAILABLE: '开窗能力不可用',
  REQBOARD_OPEN_WINDOW_FAILED: '建会话失败',
  invalid_transition: '状态机不允许',
  human_gate: '人工闸门',
  system_gate: '系统闸门',
  task_card_incomplete: '任务卡不完整',
  artifact_not_confirmed: '产物未确认',
  requirement_uncovered: '需求条款未覆盖',
  design_orphan: '设计章节未标注 serves',
  // REQ-261006201649-cc89：锚点门新增两问的中文类别名。
  // 缺这两键的降级后果**不是崩，而是沉默**：面板会显示英文码原文，
  // 人得自己猜"prototype_placeholder 是什么类的问题"——类别名的全部价值就在这里。
  prototype_placeholder: '原型仍是空骨架',
  prototype_geometry_unverified: '几何量读数无法复核',
}

/** timeline 单条记录（复用 conversation-progress.ts 的数据结构）。 */
export interface TimelineEntry {
  status?: string
  at?: number
  by?: { kind?: string; sessionId?: string }
  reason?: string | null
  inferred?: boolean
}

/**
 * 格式化最近 k 条 timeline 为多行文本（FR-6）。
 * 每行格式：「{time} · {from} → {to} · {by}」；空/异常输入返回空串。
 */
export function formatTimeline(entries: readonly TimelineEntry[] | undefined, k: number): string {
  if (!Array.isArray(entries) || entries.length === 0 || !Number.isInteger(k) || k <= 0) return ''
  const recent = entries.slice(-k)
  const lines: string[] = []
  for (let i = 0; i < recent.length; i++) {
    const e = recent[i]
    const time = typeof e.at === 'number' ? new Date(e.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?'
    const from = i > 0 ? recent[i - 1].status ?? '?' : '?'
    const to = e.status ?? '?'
    const by = e.by?.kind ?? 'system'
    lines.push(`${time} · ${from} → ${to} · ${by}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 中文映射表（FR-2；未知枚举值兜底原文显示，不做中文猜测）
// ---------------------------------------------------------------------------

export const TASK_MOVE_TO: Readonly<Record<string, string>> = {
  in_progress: '开工',
  testing: '送测',
  integrating: '联调',
  in_review: '送审',
  done: '完工',
  todo: '退回',
  canceled: '取消',
}

// REQ-260922182638-0777：产物种类中文表已收敛至唯一事实源 shared/artifact-labels.ts（artifactKindLabel）——
// design/decomposition/task_detail 等种类中文名由共享表自动补齐，本文件不再建本地映射表。
export const AUDIT_ACTION: Readonly<Record<string, string>> = {
  record: '留痕',
  evaluate: '评估',
}

export const WATCH_ACTION: Readonly<Record<string, string>> = {
  create: '新建',
  enable: '启用',
  disable: '禁用',
  delete: '删除',
}

export const TRADE_ACTION: Readonly<Record<string, string>> = {
  BUY: '买入',
  SELL: '卖出',
}

/** 查映射表；未命中返回原文（空原文返回 undefined）。 */
export function cnLabel(map: Readonly<Record<string, string>>, key: string | undefined): string | undefined {
  if (key === undefined || key === '') return undefined
  return map[key] ?? key
}

// ---------------------------------------------------------------------------
// 卡片摘要契约（FR-2/FR-3）
// ---------------------------------------------------------------------------

/** 卡片摘要：icon + 折叠行文案 + 展开体字段对。 */
export interface CardSummary {
  icon: string
  /** 折叠行单行文案（≤120 字符，禁止多行）。 */
  line: string
  /** 展开体字段（FR-3 结构化展示）。 */
  details?: Array<[string, string]>
  /** true = 错误态（红 icon 语义由调用方处理）。 */
  isError?: boolean
  /** PM 徽章（FR-1；默认 undefined = 无徽章）。 */
  badge?: string
  /** 下一步建议（FR-3）。 */
  nextStep?: string
  /** 具体错误原因（FR-4）。 */
  errorDetail?: string
  /** 修复建议（FR-4）。 */
  errorHint?: string
  /** 当前流水线阶段 key（FR-5）。 */
  flowCurrent?: string
  /** 最近流转历史，已格式化多行文本（FR-6）。 */
  timeline?: string
}

/**
 * 卡片 summarize 函数签名。返回 null 的唯一合法含义 = 交 fallbackRow（FR-4）。
 * args/result 均可能为 undefined（半截 JSON / 非 JSON 结果）。
 */
export type CardSummarize = (
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  block: ToolBlock,
) => CardSummary | null

// ---------------------------------------------------------------------------
// fallbackRow 契约（FR-4：keyed 命中替换通用行，解析失败必须自行兜底）
// ---------------------------------------------------------------------------

export interface FallbackModel {
  toolName: string
  /** args 侧一行：第一个字符串参数值的首行；无则 callId。 */
  argLine: string
  /** 输出首行（可能为空）。 */
  outputLine: string
  isError: boolean
}

/** 由 block 推导兜底模型；任何输入都返回可渲染结构（永不 throw / 永不 null）。 */
export function fallbackModel(toolName: string, block: ToolBlock): FallbackModel {
  const args = parseArgs(argsRawOf(block))
  let argLine = ''
  if (args !== undefined) {
    for (const v of Object.values(args)) {
      if (typeof v === 'string' && v !== '') {
        argLine = firstLine(v)
        break
      }
    }
  }
  if (argLine === '') argLine = block.callId ?? ''
  const out = resultText(block)
  const isErr = isSettled(block) && block.isError === true
  return {
    toolName,
    argLine: argLine.slice(0, 120),
    outputLine: firstLine(out).slice(0, 200),
    isError: isErr,
  }
}
