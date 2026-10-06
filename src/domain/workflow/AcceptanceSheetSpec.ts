/**
 * 验收单规约（REQ-47939a t4 / INV-6，REQ-2e9473 t13/W6）。
 *
 * 从 host/verdicts.ts 与 host/agent-tools.ts 的 verify_submit / accept_sheet 抽出三件纯规则：
 *   - buildSheet：逐项验收单生成（每任务验收标准 + 需求级标准；返工续版只含「未过项 + 未裁决项」）；
 *   - applyVerdicts：逐项裁决（不通过必填意见）+ 返工任务**规格**生成（落地由 host 负责）；
 *   - isAllPassed：是否全过。
 *
 * v5 变更（migration.md C7）：VerificationItem.source 由字符串改为判别联合
 * （{kind:'requirement'} | {kind:'task',taskId}）——原字符串同时表达"需求级"与"任务 id"
 * 两种含义，是字符串型歧义。类型定义落在本文件，protocol 再导出。
 *
 * 纯函数 / 就地修改传入的 sheet（调用方已在 store.mutate 草稿对象上操作）；唯一抛出的是
 * 领域错误 invalid_input（不通过缺意见 / 验收项不存在）。时间与随机数一律由参数注入。
 */

import type { ActorRef } from '../actor.js'
import { REQBOARD_ERROR_CODES, domainError } from '../errors.js'
import { fmt } from '../text/fmt.js'

/**
 * 验收项来源（v5 判别联合）。
 *
 * REQ-261005105032-3b02（§10 #14/#31/#37）增两支**带载荷**的「对照项」来源：
 * `prototype-compare`（与权威原型逐条对照）与 `decision-compare`（与 D-x 裁定逐条对照）。
 * 为什么载荷放进 source 而不是另开字段：验收项要能追到"对照的是哪一版原型 / 哪几条裁定"
 * ——追溯信息与来源同生共死，分开存就会出现"来源在、载荷丢"的半截记录。
 *
 * 本文件是**唯一真源**（`src/shared/protocol.ts` 只 re-export）。
 */
export type VerificationItemSource =
  | { kind: 'requirement' }
  | { kind: 'task'; taskId: string }
  | { kind: 'prototype-compare'; prototypePath: string }
  | { kind: 'decision-compare'; decisionIds: string[] }

/** 验收单项（结构对齐 shared/protocol.ts 的 VerificationItem）。 */
export interface SheetItemLike {
  id: string
  source: VerificationItemSource
  criterion: string
  evidence: string[]
  /**
   * 五值（REQ-308b9a FR-9 + REQ-261001154450-b918 FR-1）：
   * not_verifiable=不可验收/不适用，须带原因，不阻断通过；
   * unverified=人点了通过但没留实际结果——**不计入通过**（旧实现写占位文案仍记 passed）。
   */
  status: 'pending' | 'passed' | 'failed' | 'not_verifiable' | 'unverified'
  opinion?: string
  decidedAt?: number
  decidedBy?: ActorRef
  /** 系统生成的缺口类验收项标记（REQ-260930094139-2d65 FR-3，对齐 protocol.VerificationItem.gapKind）。 */
  gapKind?: 'e2e' | 'orphan' | 'consistency' | 'traceability'
  /**
   * REQ-261001184609-cecb FR-1/FR-3：实际结果与「谁来填」。
   * **验证是执行方的活，裁决是人的活**——agent 提交验收材料时逐项落 result，
   * 弹框就不再逼人把命令输出重抄一遍；resultSource 让台账能分辨谁填的。
   * needsHuman/humanReason 用于**无法自动验证**的项（界面视觉、线下流程），
   * 这类项必须显式标注理由，人才知道为什么要自己动手。
   */
  result?: string
  resultSource?: 'agent' | 'human'
  needsHuman?: boolean
  humanReason?: string
}

/**
 * REQ-261001184609-cecb FR-1（材料即结果）：把验收材料里形如
 * `<itemId> :: <命令 + 实际输出摘要>` 的证据**绑定到对应验收项**。
 *
 * 为什么要它：验证是执行方的活——agent 已经跑过命令，结果就该直接落库，
 * 而不是让验收的人在弹框里把输出重抄一遍（重抄既费人也不比原始输出更可信）。
 *
 * 纪律：**不伪造**——键不匹配、两侧有空、无 `::` 的（老写法）一律不绑定；
 * 老写法保持"整单证据"的原语义，行为不变。
 */
export function bindItemResults(
  items: readonly SheetItemLike[],
  evidence: readonly string[],
): { bound: number; unmatched: readonly string[] } {
  const SEP = ' :: '
  let bound = 0
  const unmatched: string[] = []
  for (const raw of evidence) {
    const idx = raw.indexOf(SEP)
    if (idx <= 0) continue // 老写法（无 ::）→ 不绑定，保持整单证据语义
    const key = raw.slice(0, idx).trim()
    const val = raw.slice(idx + SEP.length).trim()
    if (key.length === 0 || val.length === 0) continue
    const it = items.find(i => i.id === key)
    if (it === undefined) {
      unmatched.push(key)
      continue
    }
    // REQ-261001184609-cecb FR-2/t4：**人填过的结果不覆盖**——人的裁决意见优先于 agent 的批量回填，
    // 否则重交材料会把人工复核的结论冲掉（证据只增不减）。
    if ((it as { resultSource?: string }).resultSource === 'human') continue
    // 500 字符上限：台账里存摘要，不存整屏输出
    ;(it as { result?: string }).result = val.slice(0, 500)
    ;(it as { resultSource?: 'agent' | 'human' }).resultSource = 'agent'
    bound++
  }
  return { bound, unmatched }
}


/**
 * REQ-261001184609-cecb FR-2：**验收项还需不需要人填「实际结果」**。
 *
 * 判断顺序（先自动、后人工）：
 *   1. 该项已带结果（result 非空）且不是「必须人看」的项 → **不再问第二问**：人只做裁决；
 *   2. 其余（无结果、或 needsHuman）→ 保留第二问，让人补结果（needsHuman 时还要写清为什么必须人看）。
 *
 * 这是"验证归执行方、裁决归人"的开关：判断为 false 时，弹框对这项只问一次。
 */
export function needsResultInput(it: {
  result?: string
  needsHuman?: boolean
}): boolean {
  const hasResult = (it.result ?? '').trim().length > 0
  if (it.needsHuman === true) return true // 必须人看的项永远要人给结果
  return !hasResult
}

/**
 * REQ-261001184609-cecb FR-3：需要人工确认时，把**理由**写进题干——
 * 不写理由，人就不知道自己为什么被叫来动手（等于把工作丢给人还不解释）。
 * 非人工项返回空串。
 */
export function humanNotice(it: { needsHuman?: boolean; humanReason?: string }): string {
  if (it.needsHuman !== true) return ''
  const why = (it.humanReason ?? '').trim()
  return why.length > 0 ? '需人工确认：' + why : '需人工确认'
}


/**
 * **回滚开关**（REQ-261001184609-cecb t4；语义于 REQ-261006092213-4f5b FR-8 写死）：
 * 设了 `DSH_REQBOARD_NO_ITEM_RESULT`（非空且非 `0`/`false`）= **整段回到本需求之前的行为**，
 * 两个效果必须同时生效（任何一半单独生效都算开关失效）：
 *   ① **提交侧**：不结构化绑定 —— 即使传了 `results` 也整段跳过硬门与落章
 *      （返回体 `results_coverage='legacy'`、`results_bound=0`）；
 *   ② **裁决侧**：`resultOf` 恢复 `evidence[0]` 兜底（`item.result` 不参与取值），
 *      并且人改结果**不写** `result`/`resultSource='human'`（旧口径下这两处都不写）。
 * 取值口径单点在本函数：调用方只读它一次、把布尔值往下传（不在各处再读一次环境变量）。
 */
export function itemResultBindingEnabled(env: Record<string, string | undefined>): boolean {
  const v = (env['DSH_REQBOARD_NO_ITEM_RESULT'] ?? '').trim()
  return v === '' || v === '0' || v === 'false'
}

/**
 * 尚未分配编号的验收项草稿（REQ-260930183951-eb6c FR-3）：
 * 编号在 `buildSheet` 末尾按**最终顺序**连续分配，避免 taskCount+N 预留位造成的跳号。
 */
type ItemDraft = Omit<SheetItemLike, 'id'>

/** 验收单（结构对齐 shared/protocol.ts 的 VerificationSheet）。 */
export interface SheetLike {
  version: number
  items: SheetItemLike[]
  generatedAt: number
  generatedBy: ActorRef
  /** 本轮是否只含上一版未过项（返工续验标记） */
  reworkOnly?: boolean
}

/** 任务验收标准来源（最小投影）。 */
export interface SheetTaskLike {
  id: string
  title: string
  acceptance: string
  /** 子卡归属（REQ-260930094139-2d65 FR-2）：有值 = 子卡——buildSheet 只收顶层父卡，子卡项由父卡覆盖。 */
  parentId?: string
}

/** 需求级验收标准原文（唯一常量，避免前端/后端各写一份）。 */
export const REQUIREMENT_LEVEL_CRITERION = '需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）'

/**
 * 两个「对照项」的判据（REQ-261005105032-3b02 FR-7 / FR-9，interfaces.md §验收单项接口**逐字**）。
 *
 * 为什么是导出常量：这两句是**契约**——验收用例逐字断言、弹框题干直显、面板原样铺开。
 * 各写一份就会出现"看着差不多"的两句话，而逐字判据恰恰是本需求要的形态。
 */
export const PROTOTYPE_COMPARE_CRITERION = '与原型对照截图（含差异说明）'
/** 原型对照项为什么必须人看（§10 #37：界面视觉无法自动验证，只能人对着权威原型看）。 */
export const PROTOTYPE_COMPARE_HUMAN_REASON = '界面视觉需人对照权威原型'
export const DECISION_COMPARE_CRITERION = '与裁定对照（逐条说明如何落实）'

/** 已批准 `prototype_exempt` 的需求在验收单里渲染的豁免说明（§10 #45，逐字前缀）。 */
export const PROTOTYPE_EXEMPT_NOTE_PREFIX = '本需求已豁免原型（理由：'

/**
 * 豁免说明行（§10 #45）：批准不做原型 = 无原型可对照，于是**不强制**对照项，
 * 但必须把"为什么没有对照项"写在验收单上——沉默地少一项，人分不清是豁免还是漏做。
 */
export function prototypeExemptNote(reason: string): string {
  return fmt('{prefix}{reason}）', { prefix: PROTOTYPE_EXEMPT_NOTE_PREFIX, reason })
}

/**
 * RTM 的 `fr_id` 标识（REQ-261005105032-3b02 §10 #31）。
 *
 * 为什么单点：两个 RTM 集成（`accept-sheet-rtm-integration` / `status-rtm-integration`）此前各写一份
 * `taskId ?? 'UNKNOWN'` 分支——新 source 一到就静默落成 `fr_id='UNKNOWN'`（"没有来源"）。
 * 判据只写一次，两处都调它，就不存在"改了一处漏一处"。
 */
export const REQ_LEVEL_TRACE_ID = 'REQ-LEVEL'
export const PROTOTYPE_COMPARE_TRACE_ID = 'PROTOTYPE'
export const DECISION_COMPARE_TRACE_ID = 'DECISION'

/**
 * 验收项来源 → RTM `fr_id`。
 * `task` 的空 id 仍回落 `'UNKNOWN'`（防御脏数据）；两个**新 kind 绝不走这条回落**——
 * 它们是真实来源，不是"没有来源"。
 */
export function rtmTraceIdOf(source: VerificationItemSource): string {
  switch (source.kind) {
    case 'requirement': return REQ_LEVEL_TRACE_ID
    case 'task': return source.taskId.length > 0 ? source.taskId : 'UNKNOWN'
    case 'prototype-compare': return PROTOTYPE_COMPARE_TRACE_ID
    case 'decision-compare': return DECISION_COMPARE_TRACE_ID
  }
}

/**
 * 验收项来源的**中文显示标题**（弹框 header 单点，§10 #31）。
 *
 * 为什么单点：header 原写法是 `kind==='requirement' ? … : fmt('验收项 {taskId}')`——
 * source 加了带载荷的新成员后，它会渲染出「验收项 undefined」，而这类退化**只在弹框里可见**
 * （人眼才看得到），正是本卡要防的静默断链。
 */
export function itemSourceTitle(
  source: VerificationItemSource,
  criterion: string,
  gapKind?: SheetItemLike['gapKind'],
): string {
  switch (source.kind) {
    case 'requirement': return requirementItemTitle(criterion, gapKind)
    case 'task': return fmt('验收项 {taskId}', { taskId: source.taskId })
    case 'prototype-compare': return fmt('原型对照 · {path}', { path: source.prototypePath })
    case 'decision-compare': return fmt('裁定对照 · {ids}', { ids: source.decisionIds.join('、') })
  }
}

/** 锚点失效项的 criterion 前缀（**契约**：标题单点靠它把锚点失效与三方一致性区分开）。 */
export const ANCHOR_GAP_PREFIX = '验收锚点失效'

/** 「不可照着验」项的 criterion 前缀（无 gapKind 的旧类系统项，靠前缀识别）。 */
export const UNVERIFIABLE_PREFIX = '验收项不可照着验'

/**
 * 需求级来源的验收项**显示标题**（REQ-260930183951-eb6c FR-4，单点）。
 *
 * 为什么单点：此前三处各写一份字面量 `'需求级验收'`（verification.md 渲染 / 裁决后回填 /
 * 弹框 header），于是系统项在验收结果表里**多行同名**——实测 2d65 的 `v1-30`（需求级）与
 * `v1-33`（E2E 缺口）两行完全一样，人分不清哪行在说什么。
 *
 * 识别口径（不新增 protocol 枚举值）：
 *   - 有 `gapKind` → 按 gapKind；`consistency` 再按 criterion 前缀分「锚点失效 / 三方一致性」；
 *   - 无 `gapKind` → 「不可照着验」按前缀识别，其余为普通需求级项。
 */
export function requirementItemTitle(
  criterion: string,
  gapKind?: SheetItemLike['gapKind'],
): string {
  if (gapKind === undefined) {
    return criterion.startsWith(UNVERIFIABLE_PREFIX)
      ? fmt('需求级验收 · {label}', { label: '不可照着验' })
      : '需求级验收'
  }
  const label = gapKind === 'e2e'
    ? 'E2E 覆盖'
    : gapKind === 'orphan'
      ? '孤儿用例'
      : gapKind === 'traceability'
        ? '追溯断链'
        : criterion.startsWith(ANCHOR_GAP_PREFIX)
          ? '锚点失效'
          : '三方一致性'
  return fmt('需求级验收 · {label}', { label })
}

export interface SheetBuildInput {
  /** 历史验收单条数（version = history + 上一版 + 1）。 */
  sheetHistoryLength: number
  /** 上一版验收单（返工续版判定用）。 */
  prevSheet?: SheetLike
  /** 未取消任务的验收标准（顺序即验收项顺序）。 */
  tasks: readonly SheetTaskLike[]
  /** 本轮证据（复制进每一项）。 */
  evidence: readonly string[]
  /**
   * 孤儿用例（REQ-d3e61a T-7 / FR-5）：设计文件点名了、但文件头未声明覆盖条款的测试文件。
   * 按规范这是**警告级**（不阻断），但必须是验收面上**可见的一项**——"靠人记得"正是不该有的形态。
   * 非空时追加一条需求级验收项。
   */
  orphanTestFiles?: readonly string[]
  /**
   * 不可照着验、但**从未过计划期锚点门**的验收项（直种/历史数据，REQ-d3e61a T-9）。
   * 非空时追加一条需求级可见项——不追溯硬拦，但绝不允许静默（"看不见"正是 R9 那类事故的形态）。
   */
  unverifiableItems?: readonly string[]
  /**
   * E2E 覆盖读数（REQ-d3e61a T-16 / FR-11）：true=有 E2E 场景用例，false=**缺口**。
   * undefined = 读数未知（需求文档缺失/无测试策略表）→ 不追加可见项，避免噪声。
   * 只有单元/集成测试必须**作为一个可见验收项**暴露，而不是靠人记得。
   */
  e2eCoverage?: boolean
  /**
   * 三方一致性缺口（REQ-d3e61a T-8 / FR-9）：做什么 × 怎么做 × 实际做了什么 对不上时的文案。
   * 非空时追加一条需求级可见项——不一致必须**显式出现**，不允许沉默（R9 的形态就是沉默）。
   */
  consistencyGaps?: readonly string[]
  /**
   * FR 追溯断链（REQ-260930094139-2d65 FR-5）：fr_to_tests 为空的 FR 清单。
   * 非空时追加一条需求级可见项——断链必须**显式出现**（与孤儿用例同构、不阻断提交），
   * 提示补任务 serves: / 测试 covers: 标注。
   */
  traceabilityGaps?: readonly string[]
  /**
   * 验收锚点失效（REQ-260930183951-eb6c FR-2）：验收标准里写着的 `tests/*.{test,spec}.*`
   * 在工作区**不存在**（改名/未落盘/设计漂移）。非空时追加一条需求级可见项——
   * 不阻断提交，但"照抄执行必然失败"的锚点必须显式出现（本需求立项的直接成因之一）。
   */
  anchorGaps?: readonly string[]
  /**
   * 原型对照输入（REQ-261005105032-3b02 FR-7 / §10 #37、#45）：
   *  - `{ path }`：存在已登记原型 → 组装 `prototype-compare` 项（UI 需求必出现）；
   *  - `{ exempt: true, reason }`：`prototype_exempt` 已批准生效 → **不**组装对照项，
   *    改渲染一行豁免说明（批准不做原型 = 无原型可对照，否则自相矛盾）；
   *  - 缺省：非 UI 需求 / 存量需求 → 都不出现。
   *
   * 适用性（feature/refactor + `sides` 含 frontend + 有无已登记原型）由调用方判定后传进来：
   * `sides` 只存在于需求文档 front-matter，本模块保持**纯函数、零 IO**。
   */
  prototypeCompare?: { path: string } | { exempt: true; reason: string }
  /**
   * 该需求的 D-x 裁定编号（§10 #14 / #37）：非空 → 组装 `decision-compare` 项（载荷带 decisionIds）。
   * 裁定是需求级产物，故非 UI 需求（sides 不含 frontend）同样出现；非 feature/refactor 由调用方过滤。
   */
  decisionIds?: readonly string[]
  generatedAt: number
  generatedBy: ActorRef
}

export interface SheetBuildResult {
  sheet: SheetLike
  /** true = 本轮为返工续验（上一版有未过项），items 只含未过项与未裁决项。 */
  reworkOnly: boolean
}

/**
 * 生成验收单。
 * 返工续版（上一版有 failed 项）→ 带过上一版的**未过项 + 未裁决项**（已过项保留结论，不重验）；
 * 否则 → 每任务一条 + 需求级一条，全部 pending（重新生成，不是续版）。
 *
 * 2026-09-17 用户裁定（REQ-47939a D-7，范围补充）：旧实现只带 failed，**pending 项会从在册
 * 验收单里消失**（只留在 sheetHistory）。极端路径：v1 = failed + pending → 打回返工 →
 * v2 只含 failed → 修好后 v2 全过 → 归档，而那些 pending 项**从未被裁决过**。带过后
 * "逐项验收"才真正成立：未过项要复核，未验项也必须有人点头。
 * 保留另一条既有语义：上一版**没有** failed 项时仍重新生成全新验收单（不进入续版）。
 */
export function buildSheet(input: SheetBuildInput): SheetBuildResult {
  const prevSheet = input.prevSheet
  const prevItems = prevSheet?.items ?? []
  const prevFailed = prevItems.filter(i => i.status === 'failed')
  const version = input.sheetHistoryLength + (prevSheet !== undefined ? 1 : 0) + 1
  const reworkOnly = prevFailed.length > 0
  // 续版带过：failed（要复核）+ pending（从未裁决）——顺序沿用上一版，保证人工核对时位置不变
  const carried = reworkOnly
    ? prevItems.filter(i => i.status === 'failed' || i.status === 'pending')
    : []
  const orphanTestFiles = input.orphanTestFiles ?? []
  const unverifiable = input.unverifiableItems ?? []
  // REQ-260930094139-2d65 FR-2：domain 侧二次过滤——只收顶层父卡（调用方 SubmitVerification
  // 已过滤一次，这里是双保险：未来新调用方漏过滤也不会把子卡注进验收单）。
  // REQ-260930183951-eb6c FR-3：编号不再用 taskCount+N 预留位（未触发的类别照样占号 → 跳号，
  // 实测出现 v1-30 → v1-33），改为「先按最终顺序组装 drafts，再一次性连续分配 id」（见函数末尾）。
  const topTasks = input.tasks.filter(t => t.parentId === undefined)
  const unverifiableItems: ItemDraft[] = unverifiable.length === 0 ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: fmt('验收项不可照着验（历史数据）：以下验收项没写「怎么验」——{list}。请补可执行操作（命令/可查数据/界面路径）；本条不阻断验收，但必须有人看过并决定。', { list: unverifiable.slice(0, 5).join('；') }),
    evidence: [...input.evidence],
    status: 'pending' as const,
  }]
  const consistency = input.consistencyGaps ?? []
  const consistencyItems: ItemDraft[] = consistency.length === 0 ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: fmt('三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——{list}。请补设计、补实施、或显式登记为不做。', { list: consistency.slice(0, 6).join('；') }),
    evidence: [...input.evidence],
    status: 'pending' as const,
    // REQ-260930094139-2d65 FR-3：缺口类系统项标记 + 通过时须填处置说明（enforcement 在 applyVerdicts FR-1）。
    gapKind: 'consistency' as const,
  }]
  // REQ-260930183951-eb6c FR-2：验收锚点失效项（与孤儿用例/断链同构：不阻断，但必须可见）。
  // 与三方一致性共用 gapKind='consistency'（不新增枚举值），靠 criterion 前缀区分标题（FR-4）。
  const anchorGaps = input.anchorGaps ?? []
  const anchorItems: ItemDraft[] = anchorGaps.length === 0 ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: fmt('验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——{list}。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。', { list: anchorGaps.slice(0, 6).join('；') }),
    evidence: [...input.evidence],
    status: 'pending' as const,
    gapKind: 'consistency' as const,
  }]
  const e2eItems: ItemDraft[] = input.e2eCoverage === undefined ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: input.e2eCoverage
      ? 'E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）'
      : 'E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。',
    evidence: [...input.evidence],
    status: 'pending' as const,
    // REQ-260930094139-2d65 FR-3：缺口类系统项标记。
    ...(input.e2eCoverage ? {} : { gapKind: 'e2e' as const }),
  }]
  const orphanItems: ItemDraft[] = orphanTestFiles.length === 0 ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: fmt(
      '孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——{list}。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。',
      { list: orphanTestFiles.join('、') },
    ),
    evidence: [...input.evidence],
    status: 'pending' as const,
    // REQ-260930094139-2d65 FR-3：缺口类系统项标记。
    gapKind: 'orphan' as const,
  }]
  const traceability = input.traceabilityGaps ?? []
  const traceabilityItems: ItemDraft[] = traceability.length === 0 ? [] : [{
    source: { kind: 'requirement' } as VerificationItemSource,
    criterion: fmt(
      'FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——{list}。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注；通过时意见须写明处置方式。',
      { list: traceability.slice(0, 6).join('；') },
    ),
    evidence: [...input.evidence],
    status: 'pending' as const,
    // REQ-260930094139-2d65 FR-5：追溯断链提示项（缺口类系统项同构）。
    gapKind: 'traceability' as const,
  }]
  // 对照项（REQ-261005105032-3b02 FR-7 / FR-9）：原型对照 + 裁定对照，两者都是**需求级**验收项
  // （对照的是整个需求的产物与裁定，不挂在某张任务卡上）。
  // 原型对照必须在场：缺它 = 提交验收材料被拒（判据在 SubmitVerification，§10 #38/#45）；
  // 豁免需求改为一行豁免说明——**不阻塞**提交（#45）。
  const compareItems: ItemDraft[] = []
  const prototypeCompare = input.prototypeCompare
  if (prototypeCompare !== undefined) {
    compareItems.push('exempt' in prototypeCompare
      ? {
          source: { kind: 'requirement' } as VerificationItemSource,
          criterion: prototypeExemptNote(prototypeCompare.reason),
          evidence: [...input.evidence],
          status: 'pending' as const,
        }
      : {
          source: { kind: 'prototype-compare', prototypePath: prototypeCompare.path } as VerificationItemSource,
          criterion: PROTOTYPE_COMPARE_CRITERION,
          evidence: [...input.evidence],
          status: 'pending' as const,
          // §10 #37 / frontend.md：界面视觉**无法自动验证**——必须显式写清为什么叫人来看，
          // 否则弹框只会平白多问一句（REQ-261001184609-cecb FR-3 的既有机制）。
          needsHuman: true,
          humanReason: PROTOTYPE_COMPARE_HUMAN_REASON,
        })
  }
  // 裁定对照：有 D-x 就出现。为什么不标 needsHuman：判据是「逐条说明如何落实」——执行方提交时
  // 就要逐条写落实证据（criterion 已写明），人只需照证据裁决，不额外强加"必须人看"。
  const decisionIds = (input.decisionIds ?? []).map(id => id.trim()).filter(id => id.length > 0)
  if (decisionIds.length > 0) {
    compareItems.push({
      source: { kind: 'decision-compare', decisionIds } as VerificationItemSource,
      criterion: DECISION_COMPARE_CRITERION,
      evidence: [...input.evidence],
      status: 'pending' as const,
    })
  }
  // 顺序锁定（编号按此分配，REQ-260930183951-eb6c FR-3）：
  // 任务项 → 需求级 → 对照项（原型 → 裁定）→ 孤儿 → 不可照着验 → E2E → 三方一致性 → 锚点失效 → 追溯断链
  const drafts: ItemDraft[] = [
    ...topTasks.map(t => ({
      source: { kind: 'task', taskId: t.id } as VerificationItemSource,
      // T-11：验收项先说**业务结果**（标题即业务语言，T-10 保证），再说**怎么验**——
      // 原来直接放 acceptance（一串命令），用户读不出"这项在确认什么"。
      criterion: fmt('【{title}】验收：{detail}', {
        title: t.title.length > 0 ? t.title : t.id,
        detail: t.acceptance.length > 0 ? t.acceptance : '交付完成',
      }),
      evidence: [...input.evidence],
      status: 'pending' as const,
    })),
    {
      source: { kind: 'requirement' } as VerificationItemSource,
      criterion: REQUIREMENT_LEVEL_CRITERION,
      evidence: [...input.evidence],
      status: 'pending' as const,
    },
    // 系统项（有则追加；都做成**需求级**项——本就是需求级关切，
    // 且不动 protocol 的 source 联合，避免碰被占用的 protocol.ts）
    ...compareItems,
    ...orphanItems,
    ...unverifiableItems,
    ...e2eItems,
    ...consistencyItems,
    ...anchorItems,
    ...traceabilityItems,
  ]
  // 编号一次性连续分配：v<version>-1 .. v<version>-N，**无空洞**（FR-3）。
  const items: SheetItemLike[] = reworkOnly
    ? carried.map((it, idx) => ({
        ...it,
        id: 'v' + version + '-' + (idx + 1),
        status: 'pending' as const,
        opinion: undefined,
        decidedAt: undefined,
        decidedBy: undefined,
      }))
    : drafts.map((draft, idx) => ({ ...draft, id: 'v' + version + '-' + (idx + 1) }))
  const sheet: SheetLike = {
    version,
    items,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    ...(reworkOnly ? { reworkOnly: true } : {}),
  }
  return { sheet, reworkOnly }
}

/** 逐项裁决入参。 */
export interface SheetVerdictInput {
  itemId: string
  status: 'passed' | 'failed' | 'not_verifiable' | 'unverified'
  opinion?: string
}

/** 返工任务的原任务投影（承接 phase/side/scope）。 */
export interface ReworkSourceTaskLike {
  id: string
  title: string
  phase: string
  side: string
  scope?: unknown
}

/** 返工任务规格（host 据此 materialize 成 TaskRecord：id / 时间戳 / 状态事件由 host 负责）。 */
export interface ReworkTaskSpec {
  title: string
  description: string
  phase: string
  side: string
  scope: unknown
  acceptance: string
  implementation: string
  context: string
  /** 原验收意见（''=未写；评论留痕用，与 implementation 的兜底文案不同）。 */
  opinion: string
}

export interface ApplySheetVerdictsResult {
  sheet: SheetLike
  /** 本批**不通过**项对应的返工任务规格（数量 = 本批 failed 数）。 */
  reworkTasks: ReworkTaskSpec[]
  pending: number
  passed: number
  failed: number
  /** 不可验收项计数（REQ-308b9a FR-9）：不触发返工、不阻断通过。 */
  notVerifiable: number
}

/**
 * 单个"不通过"验收项 → 返工任务规格（承接原任务 phase/side/scope 与验收意见）。
 *
 * REQ-a8d582 FR-2：本函数从 applyVerdicts 内部**抽出来成为单点**——因为"返工任务何时生成"
 * 从"裁决时"搬到了"人点退回返工时"，两条路径（裁决批次 / 退回返工）必须用同一套规格，
 * 各写一份必然漂移。
 */
export function reworkSpecFor(
  item: SheetItemLike,
  sheet: SheetLike,
  tasks: readonly ReworkSourceTaskLike[],
): ReworkTaskSpec {
  const src = item.source
  const orig = src.kind === 'task' ? tasks.find(t => t.id === src.taskId) : undefined
  return {
    title: fmt('返工：{title}', { title: (orig?.title ?? item.criterion).slice(0, 60) }),
    description: fmt('验收不通过项返工（v{version} 项 {itemId}）：{criterion}', { version: sheet.version, itemId: item.id, criterion: item.criterion }),
    phase: orig?.phase ?? 'implement',
    side: orig?.side ?? 'fullstack',
    scope: orig?.scope ?? { apis: [], tables: [], files: [] },
    acceptance: item.criterion,
    implementation: fmt('按验收意见修复：{opinion}', { opinion: item.opinion ?? '（见验收单）' }),
    context: fmt('承接自 {origin}；验收意见：{opinion}', {
      // §10 #31 同款连带：来源四值后不能再写「非 requirement 就当任务」——
      // 对照项（原型/裁定）本就没有任务可承接，返工要如实说它承接自哪个验收项。
      origin: src.kind === 'requirement'
        ? '需求级验收项'
        : src.kind === 'task'
          ? fmt('任务 {taskId}', { taskId: src.taskId })
          : src.kind === 'prototype-compare'
            ? fmt('原型对照验收项（{path}）', { path: src.prototypePath })
            : fmt('裁定对照验收项（{ids}）', { ids: src.decisionIds.join('、') }),
      opinion: item.opinion ?? '',
    }),
    opinion: item.opinion ?? '',
  }
}

/** 验收单里**已判不通过**的全部项 → 返工规格（"退回返工"路径用；与裁决路径同源）。 */
export function reworkSpecsFor(sheet: SheetLike, tasks: readonly ReworkSourceTaskLike[]): ReworkTaskSpec[] {
  return sheet.items.filter(i => i.status === 'failed').map(i => reworkSpecFor(i, sheet, tasks))
}

/**
 * 逐项应用裁决（就地修改 sheet.items）。
 * 不通过项缺意见 / 验收项不存在 → 抛 code=invalid_input 的领域错误（调用方可映射传输码）。
 * 返工规格承接原任务 phase/side/scope + 意见；需求级项的 source 不指向任务，故 orig 为空。
 */
export function applyVerdicts(
  sheet: SheetLike,
  verdicts: readonly SheetVerdictInput[],
  actor: ActorRef,
  at: number,
  tasks: readonly ReworkSourceTaskLike[],
): ApplySheetVerdictsResult {
  const failedItems: SheetItemLike[] = []
  // ── 前置校验（REQ-261001154450-b918 FR-2）：整批先验证、后落状态 ──
  // 系统项（gapKind / 「不可照着验」前缀项）报的是机器发现的缺口；点「通过」却不写处置，
  // 等于把缺口吞掉——8475 实测三条系统项就是这样零处置通过的。必须在**任何 in-place
  // 修改之前**抛错，否则会留下半批已改的记录。
  for (const verdict of verdicts) {
    const item = sheet.items.find(i => i.id === verdict.itemId)
    if (item === undefined) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, fmt('验收项 {itemId} 不存在', { itemId: verdict.itemId }))
    }
    if (verdict.status === 'passed' && isSystemItem(item) && (verdict.opinion ?? '').trim().length === 0) {
      throw domainError(
        'system_item_disposition_required',
        fmt('系统项通过必须写明处置（{itemId}）——它报的是缺口，点通过却不写处置等于把缺口静默吞掉', { itemId: item.id }),
      )
    }
  }
  for (const verdict of verdicts) {
    const item = sheet.items.find(i => i.id === verdict.itemId)
    if (item === undefined) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, fmt('验收项 {itemId} 不存在', { itemId: verdict.itemId }))
    }
    if (verdict.status === 'failed' && (verdict.opinion ?? '').length === 0) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, fmt('不通过的验收项必须写意见（{itemId}）', { itemId: item.id }))
    }
    // REQ-308b9a FR-9 / AC-9.2："不可验收"同样必须有人给出原因——不允许静默消失。
    if (verdict.status === 'not_verifiable' && (verdict.opinion ?? '').length === 0) {
      throw domainError(REQBOARD_ERROR_CODES.invalidInput, fmt('不可验收的验收项必须写原因（{itemId}）', { itemId: item.id }))
    }
    // REQ-261006092213-4f5b FR-6 / D-5（**推翻 REQ-260930094139-2d65 FR-1 的「通过必填」**）：
    // 底线改成「**有结果**」而不是「有人打字」——`passed` 的判据由「opinion 非空」放宽为
    // 「opinion **或** `item.result` 非空」；两者皆空**不再抛错**，改记 `unverified`
    // （不冒充通过，也不把"agent 已经跑过、结果就在台账里"的项挡在门外）。
    // 为什么不能继续抛错：agent 提交时已逐项落章（FR-1），人的动作只剩「通过 / 退回」，
    // 逼人重抄命令输出正是本需求要消灭的形态。
    const hasOpinion = (verdict.opinion ?? '').trim().length > 0
    const hasResult = (item.result ?? '').trim().length > 0
    // `needsHuman` 项**不吃 `result` 兜底**（复核 M1：与 `AcceptSheet.resultOf` 同口径）——
    // 判定依据只在人眼里，`result` 只是供人参照的材料（data-model：两者可并存、needsHuman 优先）。
    // 不留这条的话，看板通道"留空点通过"会把 agent 的参照材料当成人的结论记 passed，
    // 与弹框通道（记 unverified）同日裁决同一项会得出相反结论。
    const needsHumanNeedsText = item.needsHuman === true
    const blankPass = verdict.status === 'passed' && !hasOpinion && (needsHumanNeedsText || !hasResult)
    item.status = blankPass ? 'unverified' : verdict.status
    // 写回口径与判定口径**同源**（都按 trim 判非空）：否则"纯空白意见 + 有 result"会落成
    // status=passed 而 opinion 存成空白，把下面"opinion 取 result"的留痕分支跳过（复核 A1）。
    if (hasOpinion) item.opinion = verdict.opinion
    // 零输入通过：`opinion` 取该项 `result`（留痕：谁都没打字，但结果有出处）。
    else if (verdict.status === 'passed' && hasResult && !needsHumanNeedsText) item.opinion = item.result
    item.decidedAt = at
    item.decidedBy = actor
    if (verdict.status === 'failed') failedItems.push(item)
  }
  const reworkTasks: ReworkTaskSpec[] = failedItems.map(item => reworkSpecFor(item, sheet, tasks))
  return {
    sheet,
    reworkTasks,
    pending: sheet.items.filter(i => i.status === 'pending').length,
    passed: sheet.items.filter(i => i.status === 'passed').length,
    failed: sheet.items.filter(i => i.status === 'failed').length,
    notVerifiable: sheet.items.filter(i => i.status === 'not_verifiable').length,
  }
}

/** 是否全部通过（任一 pending/failed/not_verifiable/unverified → false）。 */
export function isAllPassed(sheet: SheetLike): boolean {
  return sheet.items.every(i => i.status === 'passed')
}

/**
 * 是否系统生成的缺口类验收项（REQ-261001154450-b918 FR-2）。
 * 判据：带 gapKind（e2e/orphan/consistency/traceability），或旧类「不可照着验」前缀项。
 */
export function isSystemItem(i: Pick<SheetItemLike, 'gapKind' | 'criterion'>): boolean {
  return i.gapKind !== undefined || i.criterion.startsWith(UNVERIFIABLE_PREFIX)
}

/** 未复核项 id 列表（通过但没留实际结果）——不计入通过（FR-1）。 */
export function unverifiedItemsOf(sheet: SheetLike): string[] {
  return sheet.items.filter(i => i.status === 'unverified').map(i => i.id)
}

/**
 * 系统项通过了、却没写书面处置的 id 列表（FR-2）。
 *
 * 为什么单独一条规则：系统项本身就是"机器报出来的缺口"（缺 E2E / 追溯断链 / 不可照着验），
 * 让人点一下"通过"而不写处置，等于把缺口静默吞掉——REQ-8475 实测 3 条系统项零处置通过。
 */
export function dispositionMissingItems(sheet: SheetLike): string[] {
  return sheet.items
    .filter(i => i.status === 'passed' && isSystemItem(i) && (i.opinion ?? '').trim().length === 0)
    .map(i => i.id)
}

/** 验收门状态（FR-1）：全通过→passed；有未复核→pending（不得归档）；有失败→blocked。 */
export function sheetGateStatus(sheet: SheetLike): 'passed' | 'pending' | 'blocked' {
  if (sheet.items.some(i => i.status === 'failed')) return 'blocked'
  if (sheet.items.some(i => i.status === 'pending' || i.status === 'unverified')) return 'pending'
  return 'passed'
}

/**
 * 该裁决状态是否**需要一段文字**（failed 写意见 / not_verifiable 给原因）。
 *
 * ⚠️ 口径已变（REQ-261006092213-4f5b FR-6 / D-5）：`passed` **不在本函数内**——有 `item.result`
 * 即可零输入通过，两者皆空也只记 `unverified`（底线而非形式合规），判定落在 `applyVerdicts`。
 * 本函数只表达 `failed` / `not_verifiable` 两条**仍然必填文字**的硬规则（适配层单一引用状态字面量）。
 * 适配层对 `passed` 的空文本不再预校验（调用点已随之收口）。
 */
export function verdictRequiresOpinion(status: string): boolean {
  return status === 'failed' || status === 'not_verifiable'
}

/**
 * 是否全部项已裁决（无 pending、**且无 unverified**）——"可以走验收通过"这条规则的唯一实现
 * （REQ-308b9a FR-9 / AC-9.3 + REQ-261006092213-4f5b FR-6）。
 *
 * 与 isAllPassed 的区别：not_verifiable（不可验收）算已裁决——人已看过并给出原因，
 * 不允许因为它把整次验收卡死；而 `pending` 与 `unverified`（点了通过却没结果）**都不放行**
 * （AC-9.5 + D-5 底线：未复核不得冒充已复核）。此前漏了 unverified ⇒ 同一文件里两条放行口径
 * 自相矛盾（`sheetGateStatus` 把它算待裁决，本函数却报"已全部裁决"）。
 * failed 项由 FR-8 自动回退处理，正常到不了这里。
 */
export function isFullyDecided(sheet: SheetLike): boolean {
  return sheet.items.every(i => i.status !== 'pending' && i.status !== 'unverified')
}
