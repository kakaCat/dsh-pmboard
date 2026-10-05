/**
 * 提示词 Tab 的查询（REQ-261004222448-292a · FR-9 / FR-12）。
 *
 * **为什么这个文件在计划里没有卡**：拆分计划把六条端点的实现分给了 t-43fcf4（report/docs/dag/token）、
 * t-8eeed9（dialogue）、t-242dd9（trunk），六条里的 `prompts` 落在缝里——t-497311 只接线，
 * 前端 t-702b00 只渲染。实施到 t-497311 时发现「路由要挂的查询根本不存在」，故在本卡内补齐，
 * 并在卡汇报里声明（契约与形状仍逐字来自 design/interfaces.md §prompts，不新增形状）。
 *
 * 三段各回答一个问题（FR-9）：
 *   A **它被告知了什么**：本次固定系统提示词逐段列名 + 字符 + 正文；被预算裁掉的段也要给正文
 *     （回答「它为什么不知道某个术语」）。
 *   B **这些话有没有真的进会话**：注入留痕的后果列（真投递 / 只留痕 / 旧条目不可知）。
 *   C **它在什么上下文里说的**：上下文水位、压缩次数与策略、节点隔离留痕。
 *
 * 诚实纪律（FR-12）：装配服务不可得 → `unavailable`（页面写「装配服务不可得」）；
 * 上下文留痕口未装配 → `context.available=false`（页面写「未采集」）——**都不许写成 0 条**。
 *
 * @module dsh-pmboard/application/query/QueryPrompts
 */
import type {
  PanelResult,
  PromptInjectionRecord,
  PromptSection,
  PromptsResponse,
} from '../../shared/protocol.js'
import { injectionWindowsOf } from '../internal/prompt-cost.js'
import { toInjectionLogView } from '../internal/injection-log.js'
import type { PanelQueryDeps, PanelQueryInput } from './contracts.js'

/** 单段正文上限：与留痕同一口径（超限截断并标注，页面显示「已截断」）。 */
const PROMPT_TEXT_MAX = 8000

/**
 * 装配结果里取"每段正文"。宿主给的服务形状是 `{ sections, contexts, tools, ... }`，
 * 但那是宿主契约、不是本仓契约——这里**只认能认出来的部分**，认不出来的不猜：
 * 非对象 / 无 sections → 返回 undefined，由调用方判 `unavailable`。
 */
function sectionsOf(assembly: unknown): { sections: PromptSection[]; trimmed: PromptsResponse['system']['trimmed']; routeKey?: string; hitLevel?: string; chars: number } | undefined {
  if (typeof assembly !== 'object' || assembly === null) return undefined
  const a = assembly as Record<string, unknown>
  const raw = a.sections
  const list = Array.isArray(raw) ? raw : []
  // contexts 也算「固定系统提示词」的一部分（每次请求都付）——与 /token 的 summarizeSystemPrompt 同口径。
  const contexts = Array.isArray(a.contexts) ? a.contexts : []
  const all = [...list, ...contexts]
  const sections: PromptSection[] = []
  for (const item of all) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as { name?: unknown; text?: unknown }
    if (typeof o.name !== 'string' || typeof o.text !== 'string') continue
    const clipped = clip(o.text)
    sections.push({
      id: o.name,
      // 有独立源文件的片段（分片库产物）标 file，路由壳合成的标 shell——页面据此决定「能不能点开原文」
      kind: /\.md$|^fragments?\//.test(o.name) ? 'file' : 'shell',
      chars: o.text.length,
      text: clipped,
    })
  }
  const trimmed = trimmedOf(a.trimmed)
  const out: { sections: PromptSection[]; trimmed: PromptsResponse['system']['trimmed']; routeKey?: string; hitLevel?: string; chars: number } = {
    sections,
    trimmed,
    chars: sections.reduce((n, s) => n + s.chars, 0),
  }
  if (typeof a.routeKey === 'string') out.routeKey = a.routeKey
  if (typeof a.hitLevel === 'string') out.hitLevel = a.hitLevel
  return out
}

/** 被裁片段：接受 `{id,chars,text}` 数组或字符串 id 数组两种历史形状（认不出 → 空数组，不编）。 */
function trimmedOf(raw: unknown): PromptsResponse['system']['trimmed'] {
  if (!Array.isArray(raw)) return []
  const out: PromptsResponse['system']['trimmed'] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ id: item, chars: 0 })
      continue
    }
    if (typeof item !== 'object' || item === null) continue
    const o = item as { id?: unknown; name?: unknown; chars?: unknown; text?: unknown }
    const id = typeof o.id === 'string' ? o.id : (typeof o.name === 'string' ? o.name : undefined)
    if (id === undefined) continue
    const entry: { id: string; chars: number; text?: string } = {
      id,
      chars: typeof o.chars === 'number' ? o.chars : (typeof o.text === 'string' ? o.text.length : 0),
    }
    if (typeof o.text === 'string') entry.text = clip(o.text)
    out.push(entry)
  }
  return out
}

/** 超限截断（与留痕同口径）：截断是显式的，页面才能说「已截断」，不许静默丢。 */
function clip(text: string): string {
  return text.length <= PROMPT_TEXT_MAX ? text : text.slice(0, PROMPT_TEXT_MAX)
}

/** 留痕 → 页面契约（旧条目补来源未知 / 投递不可知，**不默认成已投递**）。 */
export function toPromptInjectionRecord(entry: ReturnType<typeof toInjectionLogView>): PromptInjectionRecord {
  const rec: PromptInjectionRecord = {
    at: entry.at,
    windowKey: entry.windowKey,
    origin: entry.origin,
    delivered: entry.delivered,
    fragmentIds: [...entry.fragmentIds],
    trimmed: [...entry.trimmed],
  }
  if (entry.routeKey !== '') rec.routeKey = entry.routeKey
  if (typeof entry.text === 'string') rec.text = entry.text
  if (entry.truncated === true) rec.truncated = true
  rec.charCount = entry.charCount
  return rec
}

/** 提示词 Tab 数据：三段合一 + 各自的降级标记。 */
export async function queryPrompts(
  deps: PanelQueryDeps,
  input: PanelQueryInput,
): Promise<PanelResult<PromptsResponse>> {
  const req = await deps.store.get(input.requirementId)
  if (req === undefined) {
    // 需求不存在（路由层会先 404）或台账读不到——两种都不许用空数组冒充「没有提示词」
    return { available: false, reason: 'ledger-unreadable', note: `需求 ${input.requirementId} 读不到（不存在或台账不可读）` }
  }
  const tasks = await deps.tasks.listByRequirement(input.requirementId)
  const windows = injectionWindowsOf([
    req.sourceSessionId,
    req.reviewSessionId,
    ...tasks.flatMap((t) => t.executions.map((e) => e.sessionId)),
  ])
  if (windows.size === 0) windows.add(input.requirementId)

  // ── B 段：注入留痕（读失败 → 整块降级，绝不给空数组冒充「没注入过」）──
  let injections: PromptInjectionRecord[]
  try {
    const stored = await deps.injections.readAll()
    injections = stored
      .filter((e) => windows.size === 0 || windows.has(e.windowKey))
      .map((e) => toPromptInjectionRecord(toInjectionLogView(e)))
  } catch (error) {
    return {
      available: false,
      reason: 'ledger-unreadable',
      note: `注入留痕读不到：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  // ── A 段：固定系统提示词（读时装配，不落库）──
  const system: PromptsResponse['system'] = { sections: [], trimmed: [] }
  const provider = deps.systemPrompt
  const svc = provider?.() as { assemble?: (ctx?: unknown) => Promise<unknown> } | undefined
  if (typeof svc?.assemble !== 'function') {
    system.unavailable = true
  } else {
    try {
      const parsed = sectionsOf(await svc.assemble())
      if (parsed === undefined) {
        system.unavailable = true
      } else {
        system.sections = parsed.sections
        system.trimmed = parsed.trimmed
        system.perTurnChars = parsed.chars
        system.perTurnEstTokens = Math.ceil(parsed.chars / 4)
        if (parsed.routeKey !== undefined) system.routeKey = parsed.routeKey
        if (parsed.hitLevel !== undefined) system.hitLevel = parsed.hitLevel
      }
    } catch {
      system.unavailable = true
    }
  }

  // ── C 段：上下文（隔离留痕 + 压缩策略）──
  const context: PromptsResponse['context'] = { compressions: 0, policy: [], isolations: [], available: false }
  if (deps.isolations !== undefined) {
    try {
      const entries = await deps.isolations.readAll()
      const mine = entries.filter((e) => windows.size === 0 || windows.has(e.windowKey))
      context.isolations = mine.map((e) => ({
        at: e.at,
        stage: e.stage,
        status: e.status,
        packageChars: e.packageChars,
        reason: e.reason,
      }))
      // 压缩次数 = 隔离留痕里真发生过替换/遗弃的条数（skipped/rejected 只算"尝试"）
      context.compressions = mine.filter((e) => e.status === 'replaced').length
      context.policy = [...new Set(mine.map((e) => e.status))]
      context.available = true
    } catch {
      context.available = false
    }
  }

  return { system, injections, context }
}
