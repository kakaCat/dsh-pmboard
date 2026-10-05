/**
 * 会话头部需求流程图的派生模型与档位常量（REQ-260930230225-71be t1 / 设计 data-model.md D-2、D-3）。
 *
 * 为什么单独成文件：流程图的状态→四态映射原先内联在 conversation-progress.ts 里，
 * 只有 React 渲染路径能触达它，探针与单测都测不到。抽成纯函数后：
 *   - 组件（conversation-progress.ts）与探针（scripts/header-progress-probe.mts）共用同一份模型；
 *   - 档位阈值 FLOW_TIERS 成为 CSS 与测试的单一源（styles/board.ts 插值消费）。
 *
 * 本文件零依赖副作用：不碰 DOM、不发请求、不引 react。
 *
 * @module dsh-pmboard/client/flow-chart-model
 */
import { CATEGORY_FLOW_PROFILES } from '../shared/protocol.ts'

/** 流程图节点（key = 需求主状态，与 host 状态机同序）。 */
export interface FlowStage {
  key: string
  label: string
}

/** 需求流水线七节点（含归档；done 由 archived 承接）。 */
export const FLOW: readonly FlowStage[] = [
  { key: 'draft', label: '立项' },
  { key: 'brainstorming', label: '需求分析' },
  { key: 'design', label: '设计' },
  { key: 'decomposing', label: '拆分' },
  { key: 'implementing', label: '实施' },
  { key: 'accepting', label: '验收' },
  { key: 'archived', label: '归档' },
]

/** 状态 → 中文（会话卡片、计数兜底文案共用）。 */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: '立项',
  brainstorming: '需求分析',
  design: '设计',
  decomposing: '拆分',
  implementing: '实施中',
  accepting: '待验收',
  done: '完成',
  archived: '归档',
  canceled: '已取消',
}

/**
 * 容器查询阈值（单位 px）：CSS 与测试共用同一份数字。
 *   - token：≤ 此宽隐藏节点 token
 *   - link： ≤ 此宽隐藏连线与非当前节点名
 *   - label：≤ 此宽隐藏全部节点名（只留圆点 + 计数 + 需求累计 Token）
 *
 * REQ-261004151652-d535：`token` 从 1000 降到 **600，与 `label` 相等**——这条等式是刻意的：
 * 「名字全隐的档位恰好也是 token 全隐的档位」⇒「有名字就有该节点的数」成为**结构性事实**，
 * 而不是两条规则碰巧对上（单测断言 `token === label`，防后人只改一边）。
 * 旧值 1000 是节点缩小前的旧账：文档里「带 token 近 790px」出自圆点 22→14px、
 * 节点最小宽 58→32px **之前**。本次实测（真 Chrome）：节点内改上下两行后，
 * 7 节点名 + 数字 + 连线仅 214px、芯片总宽 320px，容器 >476px 即放得下 ⇒ 取 600 留足余量。
 */
export const FLOW_TIERS = {
  token: 600,
  link: 780,
  label: 600,
} as const

/** 节点四态：已完成 / 当前 / 未到（分类跳过另由 skipped 表达）。 */
export type FlowNodeState = 'done' | 'current' | 'pending'

/** 单个节点的渲染模型。 */
export interface FlowNodeModel {
  /** 需求主状态键 */
  key: string
  /** 中文节点名 */
  label: string
  /** 0-based 序号（未到节点的圆点显示 index + 1） */
  index: number
  /** 相对当前节点的四态 */
  state: FlowNodeState
  /** 该分类流程跳过此节点 */
  skipped: boolean
  /** 该节点累计 token（仅当进度 payload 给了快照时才出现） */
  token?: number
}

/** 模型输入：会话进度 payload 里与流程图有关的那几项（多为可选，容忍老记录）。 */
export interface FlowChartInput {
  status?: string
  category?: string | null
  closed?: boolean
  progress?: { done?: number; total?: number }
  nodes?: ReadonlyArray<{ key?: string; tokens?: { total?: number } }>
  /**
   * 需求累计 token（REQ-261004143941-b2ca FR-2）：窄档下的兜底读数。
   * 语义同节点 token——**缺失 ≠ 0**：非有限或 ≤ 0 一律视为「无」，不落模型、不渲染。
   */
  tokenTotal?: number
}

/** 流程图渲染模型（组件与探针共用）。 */
export interface FlowChartModel {
  /** 恒 7 项，与 FLOW 同序 */
  nodes: readonly FlowNodeModel[]
  /** 状态不在 FLOW 中（如 canceled）时为 null → 全部 pending */
  currentKey: string | null
  /** 原样回传的需求状态 */
  statusKey: string
  /** 状态中文 */
  statusLabel: string
  /** 计数文案：有任务总量时是 done/total，否则回落状态中文 */
  countText: string
  /** 需求分类（缺省 feature） */
  category: string
  /** 该会话已无进行中需求（展示的是最近完成锚点） */
  closed: boolean
  /**
   * 需求累计 token（REQ-261004143941-b2ca FR-2）：**只在有效（有限且 > 0）时存在**。
   * 它渲染在 `.dsh-pm-flow` 之外，故**不参与宽度档位降级**——窄档至少能看到这一个数。
   */
  tokenTotal?: number
}

/** 节点四态判定：当前节点之前 done / 相等 current / 之后 pending；无当前节点（未知状态）全 pending。 */
export function flowState(index: number, currentIndex: number): FlowNodeState {
  if (currentIndex < 0) return 'pending'
  if (index < currentIndex) return 'done'
  if (index === currentIndex) return 'current'
  return 'pending'
}

/** 分类流程是否跳过该节点（与 host 的 CATEGORY_FLOW_PROFILES 同源）。 */
export function isStageSkipped(category: string, key: string): boolean {
  const profile = CATEGORY_FLOW_PROFILES[category as keyof typeof CATEGORY_FLOW_PROFILES]
    ?? CATEGORY_FLOW_PROFILES.feature
  return !(profile.stages as readonly string[]).includes(key)
}

/**
 * 由进度 payload 构造流程图模型（纯函数，可离屏调用）。
 * @param input 状态 / 分类 / 计数 / 每节点 token / closed 标记
 * @returns 七节点模型与计数文案
 */
export function buildFlowChartModel(input: FlowChartInput): FlowChartModel {
  const status = typeof input.status === 'string' && input.status.length > 0 ? input.status : 'draft'
  const category = typeof input.category === 'string' && input.category.length > 0 ? input.category : 'feature'
  const currentIndex = FLOW.findIndex(f => f.key === status)

  const tokenByKey = new Map<string, number>()
  for (const node of input.nodes ?? []) {
    const key = node?.key
    const total = node?.tokens?.total
    if (typeof key === 'string' && typeof total === 'number') tokenByKey.set(key, total)
  }

  const nodes: FlowNodeModel[] = FLOW.map((stage, index) => {
    const model: FlowNodeModel = {
      key: stage.key,
      label: stage.label,
      index,
      state: flowState(index, currentIndex),
      skipped: isStageSkipped(category, stage.key),
    }
    const token = tokenByKey.get(stage.key)
    if (token !== undefined) model.token = token
    return model
  })

  const done = input.progress?.done ?? 0
  const total = input.progress?.total ?? 0
  const statusLabel = STATUS_LABEL[status] ?? status

  // REQ-261004143941-b2ca FR-2：累计 token 的落模型规则——**有限且 > 0** 才算「有」。
  // 为什么在这里判而不是在组件里 if：探针（scripts/header-progress-probe.mts）与组件共用本模型，
  // 判定放这里，两者才是同一份事实（与 FLOW_TIERS 的单一源同款纪律）。
  const rawTokenTotal = input.tokenTotal
  const tokenTotal = typeof rawTokenTotal === 'number' && Number.isFinite(rawTokenTotal) && rawTokenTotal > 0
    ? rawTokenTotal
    : undefined

  return {
    nodes,
    currentKey: currentIndex >= 0 ? FLOW[currentIndex].key : null,
    statusKey: status,
    statusLabel,
    countText: total > 0 ? done + '/' + total : statusLabel,
    category,
    closed: input.closed === true,
    ...(tokenTotal !== undefined ? { tokenTotal } : {}),
  }
}
