/**
 * 节点输入包构造（REQ-422af1 t9 / INV-9）——节点边界遗弃后模型可见面的**唯一新起点**。
 *
 * 内容 = 路由结果（resolveStagePrompt） + 需求文档投影 + 台账投影；**不读会话历史**，
 * 不引用任何前序对话摘录（INV-9）。这是"遗弃上下文后仍能续跑"的前提：新窗口只看本包
 * 也能说出当前节点、上游结论、下一步用哪个工具。
 *
 * 纯函数 + 端口只读投影：不 import node:/@deepseek-ai/（application 层硬约束），
 * 不碰时间与随机数。用例编排在 use-cases/IsolateNodeContext.ts。
 *
 * @module dsh-pmboard/application/internal/node-input-package
 */
import {
  STAGE_CHAIN,
  resolveStagePrompt,
  type Category,
  type Difficulty,
  type PromptStage,
  type ResolvedPrompt,
} from '../../domain/prompt/index.js'
import { fmt } from '../../domain/text/fmt.js'
import { parseDocument } from './doc-parse.js'
import { aggregateUnconfirmedLabels } from './artifact-gates.js'
import { renderAddressSection } from '../../domain/template/index.js'
import type { RequirementRecord, StageArtifact, ContextPressureSnapshot } from '../../shared/protocol.js'
import type { SessionProbe } from '../ports.js'
import type { NodeInput } from '../../../vendor/reqboard/src/dive/node-input.js'

/** 台账投影（INV-8 五字段的输入包侧承载）。 */
export interface LedgerProjection {
  /** 当前节点 */
  currentStage: string
  /** 上游结论：已确认产物 */
  upstream: string
  /** 未决问题：未确认产物 + 阻塞 + 文档待同步 */
  openQuestions: string
  /** 下一步：链声明 */
  next: string
  /** 证据指针：产物路径 */
  evidence: string
  /**
   * 断点（T-1 / FR-6）：当前阶段 + 未完成动作 + 中断原因 + 时间；无断点 = 空串。
   * 输入包据此**条件追加**「## 断点」节——老需求（无字段）输出逐字节不变。
   */
  breakpoint: string
}

const NONE_UPSTREAM = '（无已确认产物）'
const NONE_OPEN = '（无）'
const NONE_EVIDENCE = '（无）'
const NO_REQUIREMENT = '（无归属需求，台账投影不可用）'

/**
 * #15：节点输入包的**原型与裁定**注入字段（架构 `NodeInputPrototypeFields`）。
 *
 * 为什么做成接口而不是把字段塞进 vendor 的 `NodeInput`：`NodeInput` 是 RTM 快照的装配形状
 * （vendor 侧，另一条改动线），而本包要投影的是**台账 + 需求文档**两处事实源；两者同名不同源，
 * 合成一个类型必然出现"谁填的"歧义。
 */
export interface NodeInputPrototypeFields {
  /** 原型产物路径（台账 `kind=prototype`）。缺省 = 从 `requirement.artifacts` 同源投影。 */
  prototypeRefs?: string[]
  /** 本需求的 D-x 编号（requirement.md 的「讨论与裁定记录（D-x）」表）。缺省 = 同源投影。 */
  decisions?: string[]
}

/** 一条 D-x 裁定的**原文**投影（原话来源 / 裁定两列逐字取自 requirement.md，不概括、不重写）。 */
export interface DecisionRow {
  id: string
  /** 「原话来源（引用）」列原文。 */
  source: string
  /** 「裁定」列原文。 */
  verdict: string
}

/**
 * 解析 requirement.md 的「讨论与裁定记录（D-x）」表（纯函数、零 IO）。
 *
 * 为什么认列名而不是认节名：节名（`## 讨论与裁定记录（D-x）`）是模板骨架，而表格才是唯一载体
 * （brief §3）——按列名找表，模板挪动节位置 / 加前后文都不会让解析静默失效。找不到就返回空数组
 * （调用方据此「如实不注入」，**绝不编造原话**）。
 */
export function decisionRowsIn(requirementDoc: string): DecisionRow[] {
  if (requirementDoc.length === 0) return []
  const table = parseDocument(requirementDoc).tables.find(
    t => t.header.some(h => h.includes('编号')) && t.header.some(h => h.includes('裁定')),
  )
  if (table === undefined) return []
  const col = (name: string): number => table.header.findIndex(h => h.includes(name))
  const iId = col('编号')
  const iSrc = col('原话来源')
  const iVerdict = col('裁定')
  if (iId < 0 || iSrc < 0 || iVerdict < 0) return []
  const rows: DecisionRow[] = []
  for (const r of table.rows) {
    const id = (r[iId] ?? '').trim()
    if (!/^D-\d+$/.test(id)) continue // 非 D-x 行（表头残留 / 别的编号）不认
    rows.push({ id, source: (r[iSrc] ?? '').trim(), verdict: (r[iVerdict] ?? '').trim() })
  }
  return rows
}

/**
 * 原型与裁定的**同源投影**（#15 / FR-10）——节点输入包与交棒底稿共用这一处。
 *
 * 为什么必须同源：`IsolateNodeContext` 与 `HandoffOwner` 都经 {@link buildNodeInputPackage} 出包，
 * 若各自投影一遍，"遗弃上下文后新窗口看到的原型/裁定"就会随入口不同而漂移（本仓「两份真相」老病）。
 * 事实源只有两处：台账（原型产物路径）+ 需求文档（D-x 编号）——都不是会话内容，故不违反 INV-9。
 */
export function projectNodeRefs(
  requirement: RequirementRecord | undefined,
  requirementDoc: string,
): { prototypeRefs: string[]; decisions: string[] } {
  const prototypes = (requirement?.artifacts ?? [])
    .filter(a => a.kind === 'prototype')
    .map(a => a.path)
  return {
    prototypeRefs: [...new Set(prototypes)].sort(),
    decisions: decisionRowsIn(requirementDoc).map(r => r.id),
  }
}

/** 「证据指针」节的两行（缺一项则那一行整体不追加，不塞空数组冒充）。 */
function refLines(prototypeRefs: readonly string[], decisions: readonly string[]): string[] {
  const lines: string[] = []
  if (prototypeRefs.length > 0) lines.push('- 原型（prototypeRefs）：' + prototypeRefs.join('、'))
  if (decisions.length > 0) lines.push('- 裁定（decisions）：' + decisions.join('、'))
  return lines
}

function artifactLabel(a: StageArtifact): string {
  return fmt('{kind}（{path}）', { kind: a.kind, path: a.path })
}

/**
 * 台账投影：从需求记录投影出五字段 + 断点（FR-6），**不含任何对话内容**（INV-9）。
 * requirement 缺失（窗口还没有绑定需求）→ 如实标注"无归属需求"，不静默留空。
 */
export function projectLedger(requirement: RequirementRecord | undefined, stage: PromptStage): LedgerProjection {
  const chain = STAGE_CHAIN[stage]
  if (requirement === undefined) {
    return {
      currentStage: stage,
      upstream: NO_REQUIREMENT,
      openQuestions: NO_REQUIREMENT,
      next: chain.label,
      evidence: NONE_EVIDENCE,
      breakpoint: '',
    }
  }
  const artifacts = requirement.artifacts ?? []
  const confirmed = artifacts.filter(a => a.confirmedAt !== undefined)
  const unconfirmed = artifacts.filter(a => a.confirmedAt === undefined)
  const blockers: string[] = []
  if (requirement.blocked) {
    blockers.push(fmt('需求被标记阻塞：{reason}', { reason: requirement.blockedReason ?? '（未写原因）' }))
  }
  for (const p of requirement.docSyncPending ?? []) {
    blockers.push(fmt('文档待同步：{source}', { source: p.source }))
  }
  return {
    currentStage: stage,
    upstream: confirmed.length > 0 ? confirmed.map(artifactLabel).join('；') : NONE_UPSTREAM,
    // FR-7（REQ-261003222428-3556 / N-3）：待确认按 kind 聚合——高频产物（task_detail/task_output）
    // 不再逐条催（实测一次交付注入 39 条），成组 kind 合并为一条「kind×N（成组确认一次清）」。
    openQuestions: [...aggregateUnconfirmedLabels(unconfirmed, artifactLabel), ...blockers].join('；') || NONE_OPEN,
    next: chain.label,
    evidence: artifacts.length > 0 ? artifacts.map(a => a.path).join('；') : NONE_EVIDENCE,
    breakpoint: breakpointText(requirement),
  }
}

/**
 * 断点节文本（T-1 / FR-6）：含阶段 / 未完成动作 / 中断原因 / 时间四要素。无断点 → 空串
 * （调用方据此不追加该节，保证存量需求输出与改造前逐字节一致）。
 */
function breakpointText(requirement: RequirementRecord | undefined): string {
  const bp = requirement?.interruption
  if (bp === undefined) return ''
  return fmt(
    [
      '## 断点',
      '- 当前阶段：{stage}',
      '- 未完成动作：{action}',
      '- 中断原因：{reason}',
      '- 记录时间：{at}',
    ].join('\n'),
    { stage: bp.stage, action: bp.pendingAction, reason: bp.reason, at: new Date(bp.at).toISOString() },
  )
}

/**
 * 余量参考的**固定标注**（t7 / FR-8）：A6 的可判点就是这一串字。
 * 与数值同一条展示（同节 / 同一返回体字段）内出现——判据永远是 `LIMITS` 里的容量常量，
 * 这个运行时读数只作参考（token-meter 自述其字段非原子且 "not a gating input"）。
 */
export const CAPACITY_REFERENCE_NOTE = '参考值，非门禁判据'

/**
 * 读当轮上下文压力参考（t7 / FR-8）——**两处展示共用的唯一读取口**（输入包节 / 任务树顶层）。
 *
 * **不可得就是不可得**：没注入端口 / 端口上没有这个方法（插件热重载后可能拿到旧适配器实例）/
 * 方法抛错 → 一律 `undefined`。余量只是只读展示，绝不能因为一个读数把调用方的主链搞失败
 * （节点隔离 / 只读看树），也绝不留旧值、记忆值冒充（R-013，与 `safeReadDoc` 同一降级口径）。
 *
 * 放在本模块的另一个理由：口径（怎么读、怎么算、标注什么字）只有一处，
 * 两处展示各写一遍必然漂移——本仓「两份真相」的老病。
 */
export function safeContextPressure(
  session: SessionProbe | undefined,
  windowKey: string,
): ContextPressureSnapshot | undefined {
  try {
    const read = session?.contextPressure
    return typeof read === 'function' ? read.call(session, windowKey) : undefined
  } catch {
    return undefined
  }
}

/**
 * 取会话探测端口（t7 / FR-8）——**装配形状**：收「端口 or 取端口的 getter」，返回端口。
 *
 * 为什么要有 getter 这一形态：组合根**先**装配节点结算分发器与闸门后置链，**之后**才建
 * `SessionProbeAdapter`（它依赖会话缓冲表 toolTrace / recentUserMsgs）⇒ 那两个装配点拿不到实例，
 * 只能收一个惰性 getter，读实例的时机 = 执行期（那时赋值已完成）。
 *
 * 取不到（getter 返回 undefined = 还没装配）/ getter 自己抛错 → `undefined`：与
 * {@link safeContextPressure} **同一降级口径**——余量只是只读展示，装配形状的任何问题都不许
 * 冒泡成"节点隔离 / 压缩失败"（缺了就是没有该节，输入包逐字节不变）。
 */
export function resolveSessionProbe(
  session: SessionProbe | (() => SessionProbe | undefined) | undefined,
): SessionProbe | undefined {
  try {
    return typeof session === 'function' ? session() : session
  } catch {
    return undefined
  }
}

/**
 * 余量 = `contextWindow − projectedTokens`（t7 / FR-8）。
 *
 * 任一缺席 / 非有限数 / 整体不可得 → `undefined`：**宁可整条不显示，也不猜 0、不单边推算**。
 * 「余量 0」与「算不出」在展示层必须可区分，否则人会拿一个假数字当拆分依据（同 R-013 口径）。
 * 与任务树顶层的 `remainingTokens` **共用本函数**——两处各写一份减法必然漂移。
 */
export function remainingTokensOf(pressure: ContextPressureSnapshot | undefined): number | undefined {
  if (pressure === undefined || pressure.source !== 'projection') return undefined
  const { contextWindow, projectedTokens } = pressure
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow)) return undefined
  if (typeof projectedTokens !== 'number' || !Number.isFinite(projectedTokens)) return undefined
  return contextWindow - projectedTokens
}

/**
 * 「## 一轮余量（参考）」节文本（t7 / FR-8）：只读展示，**不是门禁判据**。
 *
 * 无数据 → 空串（调用方据此不追加该节 → 没有该能力时输入包逐字节不变）。
 * 算不出余量（单边读数）→ 同样空串：整条参考不显示，而不是显示半条。
 */
export function roundCapacityText(pressure: ContextPressureSnapshot | undefined): string {
  const remaining = remainingTokensOf(pressure)
  if (pressure === undefined || remaining === undefined) return ''
  const { contextWindow, projectedTokens } = pressure
  // 类型收窄（能算出 remaining 就说明两者都在场；这里只是让 TS 看见同一件事）
  if (typeof contextWindow !== 'number' || typeof projectedTokens !== 'number') return ''
  return fmt(
    [
      '## 一轮余量（参考）',
      '- remainingTokens：{remaining}（= contextWindow {contextWindow} − projectedTokens {projectedTokens}）',
      '- {note}',
    ].join('\n'),
    { remaining, contextWindow, projectedTokens, note: CAPACITY_REFERENCE_NOTE },
  )
}

export interface NodeInputPackageInput extends NodeInputPrototypeFields {
  stage: PromptStage
  difficulty?: Difficulty
  category?: Category
  budget?: number
  requirement?: RequirementRecord
  /** 需求文档投影（已读出的文本；空串 = 不可用，会如实标注）。 */
  requirementDoc: string
  /** 需求文档路径（渲染与标注用）。 */
  requirementDocPath: string
  /** 模板根绝对路径（T-5）；缺省 = 输入包不追加地址小节（与改造前逐字节一致）。 */
  templateRoot?: string
  /** 当前任务卡投影（实施节点的上游必读）。 */
  currentTask?: { id?: string; title?: string; cardDoc?: string }
  /** FR-8：RTM 追溯快照（由用例读盘后注入；缺省 = 不追加该节，逐字节保持旧输出）。 */
  rtm?: NodeInput
  /** t8：知识索引（由用例读盘后注入；缺省 = 不追加该节 → 老需求逐字节不变）。 */
  knowledgeIndex?: KnowledgeIndexInput
  /** t8：是否把需求文档节瘦身为「TL;DR + 指针」（缺省 false → 仍注入全文）。 */
  trimRequirementDoc?: boolean
  /**
   * t7（FR-8）：当轮上下文压力参考（由用例从 `SessionProbe` 读后注入）。
   * 缺省 / 不可得 → 不追加余量节 → 输出与"没有该能力"逐字节相同。
   */
  contextPressure?: ContextPressureSnapshot
}

export interface NodeInputPackage {
  text: string
  resolved: ResolvedPrompt
  projection: LedgerProjection
}

import { KB_LIMITS } from '../../domain/knowledge/budget.js'
import { buildKnowledgeSection, digestRequirementDoc, type KnowledgeIndexInput } from './knowledge-inject.js'

const DOC_UNAVAILABLE = '（需求文档不可用或为空：{path}）'

/** 构造节点输入包（INV-9）：路由结果 + 需求文档投影 + 台账投影。 */
export function buildNodeInputPackage(input: NodeInputPackageInput): NodeInputPackage {
  const resolved = resolveStagePrompt({
    stage: input.stage,
    ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.budget === undefined ? {} : { budget: input.budget }),
  })
  const projection = projectLedger(input.requirement, input.stage)
  // FR-6：仅当需求带断点时追加该节；无断点 → 空数组（逐字节保持旧输出）。
  const breakpointSection = projection.breakpoint.length > 0 ? [...projection.breakpoint.split('\n'), ''] : []
  // t7（FR-8）：余量参考——同一写法（空串 → 空数组，不追加）。
  const capacityText = roundCapacityText(input.contextPressure)
  const capacitySection = capacityText.length > 0 ? [...capacityText.split('\n'), ''] : []
  const rawDoc = input.requirementDoc.length > 0
    ? input.requirementDoc
    : fmt(DOC_UNAVAILABLE, { path: input.requirementDocPath })
  // t8：仅当显式开启且文档可用时瘦身（缺省注入全文 = 与改造前逐字节一致）
  const docText = input.trimRequirementDoc === true && input.requirementDoc.length > 0
    ? digestRequirementDoc(input.requirementDoc, input.requirementDocPath, KB_LIMITS.requirementDigestMax).text
    : rawDoc
  // 进入本阶段的第一个动作（domain 单点 STAGE_CHAIN.entry）——与 H4 唤醒消息同源：
  // H2 真压缩过时唤醒消息只说"纪律在输入包里"，这里就必须真的带上"第一步干什么"。
  const entryLine = STAGE_CHAIN[input.stage].entry.length > 0
    ? fmt('进入本阶段的第一步：{e}', { e: STAGE_CHAIN[input.stage].entry })
    : ''
  // #15（FR-10）：证据指针节追加「原型 / 裁定」两行——节点边界一遗弃上下文，新窗口只看本包
  // 也必须知道原型在哪、有哪些裁定在管这条需求。缺省（无原型且无裁定）不追加任何行：
  // 输出与改造前**逐字节相同**（不塞空数组、不写"（无）"冒充已采集）。
  const refs = projectNodeRefs(input.requirement, input.requirementDoc)
  const evidenceText = [
    projection.evidence,
    ...refLines(input.prototypeRefs ?? refs.prototypeRefs, input.decisions ?? refs.decisions),
  ].join('\n')
  const baseText = fmt(
    [
      '# 节点输入包 · {reqId} · {stage}',
      '',
      '> 本包是节点边界后的唯一新起点：内容只来自「路由提示词 + 需求文档 + 台账投影」，',
      '> 不含前序对话摘录。若本窗口被遗弃，按本包即可续跑。',
      '',
      '## 当前节点',
      '{currentStage}（difficulty={difficulty}，category={category}）',
      '',
      '## 上游结论',
      '{upstream}',
      '',
      '## 未决问题',
      '{openQuestions}',
      '',
      ...breakpointSection,
      ...capacitySection,
      '## 下一步',
      '{next}',
      ...(entryLine.length > 0 ? [entryLine] : []),
      '',
      '## 证据指针',
      '{evidence}',
      '',
      '## 路由提示词（routeKey={routeKey}，命中层级={hitLevel}）',
      '{routeText}',
      '',
      '## 需求文档（{docPath}）',
      '{docText}',
    ].join('\n'),
    {
      reqId: input.requirement?.id ?? '（无）',
      stage: input.stage,
      currentStage: projection.currentStage,
      difficulty: input.difficulty ?? '*',
      category: input.category ?? '*',
      upstream: projection.upstream,
      openQuestions: projection.openQuestions,
      next: projection.next,
      evidence: evidenceText,
      routeKey: resolved.routeKey,
      hitLevel: String(resolved.hitLevel),
      routeText: resolved.text,
      docPath: input.requirementDocPath,
      docText,
    },
  )
  // FR-8：注入 RTM 追溯快照（未注入/无 next_action → 不追加，旧输出逐字节不变）。
  const rtmSection = renderRtmSection(input.rtm)
  const withRtm = rtmSection.length > 0 ? baseText + '\n' + rtmSection : baseText
  // T-5（FR-8/FR-12）：地址小节与系统段/H3 共用同一纯函数；空集不追加（逐字节兼容）。
  const addressSection = renderAddressFor(input)
  const withAddress = addressSection.length > 0 ? withRtm + '\n\n' + addressSection : withRtm
  // t8：知识索引节追加在**末尾**（位置固定 → 前缀缓存友好；缺省不追加 → 逐字节不变）
  const text = input.knowledgeIndex === undefined
    ? withAddress
    : withAddress + '\n\n' + buildKnowledgeSection(input.knowledgeIndex).section
  return { text, resolved, projection }
}

/**
 * FR-8：RTM 追溯快照小节。
 * 只渲染"决策要看的东西"（下一步建议 + 覆盖度/状态/产出摘要），不塞整份 RTM——
 * 输入包体积是 token 成本，完整数据按需读文件。
 */
function renderRtmSection(rtm: NodeInput | undefined): string {
  if (rtm === undefined || rtm.next_action === undefined || rtm.next_action.length === 0) return ''
  const snapshot: Record<string, unknown> = {}
  if (rtm.coverage !== undefined) snapshot.coverage = rtm.coverage
  if (rtm.status !== undefined) snapshot.status = rtm.status
  if (rtm.outputs !== undefined) snapshot.outputs = rtm.outputs
  const lines = [
    '## RTM 追溯快照（FR-8 · ' + rtm.stage + ' · ' + rtm.mode + '）',
    '',
    '- 下一步建议：' + rtm.next_action,
  ]
  if (Object.keys(snapshot).length > 0) lines.push('', '```json', JSON.stringify(snapshot), '```')
  lines.push('')
  return lines.join('\n')
}

/** 输入包侧的地址节渲染（渲染异常 → 不追加，不静默破坏输入包）。 */
function renderAddressFor(input: NodeInputPackageInput): string {
  if (input.templateRoot === undefined) return ''
  try {
    return renderAddressSection({
      stage: input.stage,
      category: input.category,
      ...(input.requirement === undefined ? {} : { requirement: input.requirement }),
      ...(input.currentTask === undefined ? {} : { currentTask: input.currentTask }),
      templateRoot: input.templateRoot,
    })
  } catch {
    return ''
  }
}

/**
 * 需求文档相对路径（REQ-260922012924-2e29 FR-2）。
 *
 * 解析优先级：`docLinks.requirement`（显式链接，最高）→ `docBasePath` 拼接 → 缺省
 * `docs/requirements/<REQ>/`。docBasePath 拼接契约（design/interfaces.md）：
 *  ① `<REQ>` 占位符全部替换为需求 id；
 *  ② docBasePath **无** `<REQ>` 时追加 `<id>/` 子目录（防多需求撞同一 requirement.md）；
 *  ③ 尾部斜杠归一；④文件名恒 `requirement.md`。
 * 兼容：无 docBasePath 的老记录走缺省分支，输出与改造前逐字节一致。
 */
export function requirementDocPath(requirement: RequirementRecord | undefined): string {
  if (requirement === undefined) return ''
  if (requirement.docLinks?.requirement !== undefined) return requirement.docLinks.requirement
  const raw = requirement.docBasePath ?? 'docs/requirements/<REQ>/'
  const hasPlaceholder = raw.includes('<REQ>')
  const base = raw.replaceAll('<REQ>', requirement.id)
  const withId = hasPlaceholder ? base : base.replace(/\/?$/, '/') + requirement.id + '/'
  return withId.replace(/\/?$/, '/') + 'requirement.md'
}

/** D-12 ②：给人可操作的等价路径（开新窗口 + 粘贴输入包）。 */
export function newWindowInstruction(packageText: string): string {
  return fmt(
    [
      '【节点隔离降级 · 请开新窗口】当前窗口触达不到会话 surface，无法执行整段替换。',
      '请在**新窗口**里粘贴下面的节点输入包作为第一条消息，即可等价续跑（输入包自足，无需携带本窗口历史）：',
      '',
      '----- 节点输入包开始 -----',
      '{pkg}',
      '----- 节点输入包结束 -----',
    ].join('\n'),
    { pkg: packageText },
  )
}
