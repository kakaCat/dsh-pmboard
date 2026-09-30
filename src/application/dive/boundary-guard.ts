/**
 * 越界拦截（REQ-260929210741-30ae FR-7 / t6）：reqboard_* 写工具在当前阶段不合法时，
 * 向该会话注入一条纠偏提示（**只发信号，不写会话**——注入回调由组合根放到异步边界）。
 *
 * 判定来源：`domain/stage/StageActions`（工具名 → 合法阶段集）；本文件只负责
 * 「工具名粗判 → 参数级追加判定 → 限流 → 注入」这套编排。
 *
 * @module dsh-pmboard/application/dive/boundary-guard
 */
import { openRequirementsFor } from '../internal/window.js'
import { isOutOfBounds, correctiveActionFor } from '../../domain/stage/StageActions.js'
import { fmt } from '../../domain/text/fmt.js'
import type { RequirementStatus } from '../../domain/requirement/RequirementStatus.js'

/** 限流窗口：同一窗口同一阶段 5 分钟内不重复注入（避免刷屏）。 */
const THROTTLE_MS = 300_000

/** 已注入留痕：windowKey → {status, at}。 */
const injected = new Map<string, { status: RequirementStatus; at: number }>()

export interface BoundaryGuardDeps {
  snapshot(): Parameters<typeof openRequirementsFor>[0]
  inject(windowKey: string, text: string): void
  now(): number
}

/** submit kind → 合法阶段集（参数级判定查找表；undefined = 全阶段放行）。 */
const SUBMIT_KIND_STAGES: Readonly<Record<string, readonly RequirementStatus[] | undefined>> = {
  requirement: ['brainstorming'],
  design: ['design'],
  plan: ['decomposing'],
  verification: ['implementing', 'accepting'],
  archive: ['archived', 'done'],
}

/**
 * 处理一次 tool/call 事件：判定越界 → 限流 → 注入。
 *
 * 参数级判定（submit 按 kind、move 按 to）在工具名粗判通过后追加——
 * 例：brainstorming 阶段调 reqboard_submit(kind=design) = 越界（设计文档属于 design 阶段）。
 *
 * @returns true = 已注入纠偏提示；false = 合法/未绑定/被限流
 */
export function guardToolCall(
  deps: BoundaryGuardDeps,
  windowKey: string,
  toolName: string,
  args: Record<string, unknown> | undefined,
): boolean {
  if (!toolName.startsWith('reqboard_')) return false
  const bound = openRequirementsFor(deps.snapshot(), windowKey)
  if (bound.length === 0) return false
  const req = bound[0]
  const status = req.status

  if (toolName === 'reqboard_submit') {
    const kind = typeof args?.kind === 'string' ? args.kind : ''
    const kindStages = SUBMIT_KIND_STAGES[kind]
    if (kindStages !== undefined && !kindStages.includes(status)) {
      return injectOnce(deps, windowKey, status, fmt('{tool}(kind={kind})', { tool: toolName, kind }))
    }
    return false
  }

  if (toolName === 'reqboard_move') {
    const to = typeof args?.to === 'string' ? args.to : ''
    if (to === 'design' && status === 'brainstorming') {
      const reqArt = (req.artifacts ?? []).find(a => a.kind === 'requirement')
      if (reqArt === undefined || reqArt.confirmedAt === undefined) {
        return injectOnce(deps, windowKey, status, fmt('{tool}(to={to})', { tool: toolName, to }))
      }
    }
    return false
  }

  if (!isOutOfBounds(toolName, status)) return false
  return injectOnce(deps, windowKey, status, toolName)
}

/** 限流 + 注入的公共尾部（guardToolCall 各分支共用）。 */
function injectOnce(
  deps: BoundaryGuardDeps,
  windowKey: string,
  status: RequirementStatus,
  toolDesc: string,
): boolean {
  const prev = injected.get(windowKey)
  const nowTs = deps.now()
  if (prev !== undefined && prev.status === status && nowTs - prev.at < THROTTLE_MS) return false
  const text = fmt('⚠️ 越界拦截：当前处于 {status} 阶段，{tool} 不属于本阶段动作。\n当前应做：{action}', {
    status,
    tool: toolDesc,
    action: correctiveActionFor(status),
  })
  injected.set(windowKey, { status, at: nowTs })
  deps.inject(windowKey, text)
  return true
}
