/**
 * 运行上限屏的**纯逻辑与文案**（REQ-261004103330-005f t12 / 设计 `frontend.md` 屏 1）。
 *
 * 与 `views/*` 同款纪律：**零 DOM、零副作用**——渲染在 `render/limits.ts`，
 * 这里只回答"这一行该显示什么、这个输入合不合法、哪些项算脏"。因此可以直接在 Node 环境单测。
 *
 * ## 阶段中文名的唯一来源
 *
 * 取 `client/workflow-constants.ts` 的 `WORKFLOW_STAGES`（该文件头注写明"所有流程节点名称
 * 必须从这里引用，禁止硬编码"）。它只覆盖 8 个流程节点，缺 `canceled`——而设置表要列 9 个阶段。
 * 缺的那一个**复用任务状态表里的同名标签**（`STATUS_LABELS.canceled`），不另造一份中文名：
 * 造第二份就会漂移，而"已取消"这三个字没有理由在两处写得不一样。
 *
 * @module dsh-pmboard/client/settings/limits
 */

import { WORKFLOW_STAGES } from '../workflow-constants.ts'
import { STATUS_LABELS } from '../../domain/card-types.ts'
import type { SettingsSource, StageKey, StageLimitView } from './types.ts'

/** 上限可设范围（与服务端 `LIMITS.stageMaxRoundsMin/Max` 同口径；前端也拦一道，非法值不该发出去）。 */
export const LIMIT_MIN = 1
export const LIMIT_MAX = 10_000

/** 设置表的阶段顺序：与需求流水线一致（含 legacy `done` 与终态 `canceled`）。 */
export const SETTINGS_STAGES: readonly StageKey[] = [
  'draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'done', 'archived', 'canceled',
]

/** 会自动续跑的阶段（其余阶段列出来只为"整表可对账"，改它们不影响行为）。 */
const AUTOMATED_STAGES: ReadonlySet<StageKey> = new Set<StageKey>([
  'brainstorming', 'design', 'decomposing', 'implementing', 'accepting',
])

export function isAutomatedStage(stage: StageKey): boolean {
  return AUTOMATED_STAGES.has(stage)
}

/** 阶段中文名（流程节点表优先；`canceled` 复用任务状态的同名标签）。 */
export function stageLabel(stage: StageKey): string {
  const node = (WORKFLOW_STAGES as Record<string, { label?: string } | undefined>)[stage]
  if (node?.label !== undefined) return node.label
  const task = (STATUS_LABELS as Record<string, string | undefined>)[stage]
  return task ?? stage
}

/** 不在流程节点表里的阶段的副标题兜底（`canceled` 是需求终态，不是流程节点）。 */
const NON_WORKFLOW_STAGE_DESC: Readonly<Partial<Record<StageKey, string>>> = {
  canceled: '无后续行为',
}

/**
 * 阶段副标题（界面基准里「立项 · 立项草稿」的后半句）。
 *
 * 取自 `WORKFLOW_STAGES[].desc`——**只此一处**，不要在渲染层再写第二份：
 * 副本必然漂移（"需求分析 · 调研与写需求文档"这种句子没有理由在两处写得不一样）。
 */
export function stageDesc(stage: StageKey): string {
  const node = (WORKFLOW_STAGES as Record<string, { desc?: string } | undefined>)[stage]
  return node?.desc ?? NON_WORKFLOW_STAGE_DESC[stage] ?? ''
}

/**
 * 阶段色点的类名（CSS 里 `.dsh-pm-set-dot.is-<stage>` 用真令牌 `--pm-c-*` 取色）。
 *
 * `canceled` 与 `archived` **同色**：既没有"取消色"这个令牌，也不该为它自造 hex——
 * 自造一个色值就是开了第二套调色板（原型也是这么映射的）。
 */
export function dotClassOf(stage: StageKey): string {
  return stage === 'canceled' ? 'is-archived' : 'is-' + stage
}

/** 说明框里展示的设置文件路径：真实路径优先（只把家目录前缀缩写为 `~`），未知时用默认展示值。 */
export function displaySettingsPath(path?: string): string {
  if (path === undefined || path.trim().length === 0) return COPY.defaultSettingsPath
  const at = path.indexOf('/.dsh/')
  return at > 0 ? '~' + path.slice(at) : path
}

/** 内置默认值：服务端没给这一项时（不该发生）用于兜底显示 `—`。 */
export function effectiveOf(
  limits: Readonly<Partial<Record<StageKey, StageLimitView>>>,
  stage: StageKey,
): StageLimitView {
  return limits[stage] ?? { value: 0, default: 0, source: 'default' }
}

/** 输入是否合法（`undefined` = 合法）。**越界不钳值**——钳值会让人以为改生效了。 */
export function limitInvalidReason(raw: string): string | undefined {
  const text = raw.trim()
  if (text.length === 0) return '需填一个整数'
  if (!/^-?\d+$/.test(text)) return '需为整数（不能带小数或其它字符）'
  const n = Number(text)
  if (!Number.isFinite(n)) return '需为整数'
  if (n < LIMIT_MIN) return '不得小于 ' + String(LIMIT_MIN)
  if (n > LIMIT_MAX) return '不得大于 ' + String(LIMIT_MAX)
  return undefined
}

/** 草稿里与"生效值"不同、且合法的阶段（脏项；非法项不进补丁，也不该发出去）。 */
export function dirtyStages(
  limits: Readonly<Partial<Record<StageKey, StageLimitView>>>,
  drafts: Readonly<Partial<Record<StageKey, string>>>,
): StageKey[] {
  const out: StageKey[] = []
  for (const stage of SETTINGS_STAGES) {
    const draft = drafts[stage]
    if (draft === undefined) continue
    if (limitInvalidReason(draft) !== undefined) continue
    if (Number(draft.trim()) === effectiveOf(limits, stage).value) continue
    out.push(stage)
  }
  return out
}

/** 有非法草稿的阶段（用于"保存键禁用"与行内错误呈现）。 */
export function invalidStages(
  drafts: Readonly<Partial<Record<StageKey, string>>>,
): Array<{ readonly stage: StageKey; readonly reason: string }> {
  const out: Array<{ stage: StageKey; reason: string }> = []
  for (const stage of SETTINGS_STAGES) {
    const draft = drafts[stage]
    if (draft === undefined) continue
    const reason = limitInvalidReason(draft)
    if (reason !== undefined) out.push({ stage, reason })
  }
  return out
}

/** 待提交的补丁（只含脏且合法的项）。 */
export function dirtyPatch(
  limits: Readonly<Partial<Record<StageKey, StageLimitView>>>,
  drafts: Readonly<Partial<Record<StageKey, string>>>,
): Record<string, number> {
  const patch: Record<string, number> = {}
  for (const stage of dirtyStages(limits, drafts)) {
    patch[stage] = Number((drafts[stage] ?? '').trim())
  }
  return patch
}

/** 来源徽章的展示（与 `model.badgeOf` 同源口径，专供本屏逐行使用）。 */
export function sourceBadge(source: SettingsSource): { readonly cls: string; readonly label: string } {
  switch (source) {
    case 'settings': return { cls: 'is-settings', label: '设置文件' }
    case 'config': return { cls: 'is-config', label: '插件配置' }
    case 'env': return { cls: 'is-env', label: '环境变量' }
    default: return { cls: 'is-default', label: '内置默认' }
  }
}

// ── 文案（集中一处，便于评审逐字核对；设计已裁定必须出现的句子在这里） ──────────────

export const COPY = {
  /** 屏标题右侧的一行副标题（界面基准原文）。 */
  paneSub: '每个节点（需求阶段）允许自动续跑的最大回合数',
  range: '取值 ' + String(LIMIT_MIN) + '–' + String(LIMIT_MAX) + ' 的整数',
  /** 界面基准原文：改动何时生效（说明框第一句的后半）。 */
  applyTiming: '改动对下一个回合生效，已在跑的回合不受影响',
  /** 设计裁定必须出现的句子：避免人误以为"改小能立刻止血"。 */
  shrink: '改小不会掐断正在跑的那一次，从下一次判定起不再续跑。',
  noAutomation: '标「不自动跑」的阶段留着是为了设置表整表可对账（改它们不改变任何行为）。',
  manualTag: '不自动跑',
  /** 保存去向与来源顺序（说明框末句；顺序与 FR-2 的四级解析一致）。 */
  sourceOrder: '来源顺序：设置文件 > 插件配置 > 环境变量 > 内置默认',
  defaultSettingsPath: '~/.dsh/dsh-reqboard-settings.json',
  dirtyPrefix: '有',
  dirtySuffix: '项改动未保存',
  invalidSuffix: '项不合法，保存会被拒绝',
  save: '保存',
  discard: '撤销',
  reset: '恢复默认',
  saving: '保存中…',
} as const
