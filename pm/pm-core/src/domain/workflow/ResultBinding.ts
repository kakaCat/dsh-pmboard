/**
 * 结构化验收结果绑定（REQ-261006092213-4f5b · FR-1 / FR-2 · t1 契约先行卡）。
 *
 * 为什么需要它：先前的逐项绑定靠 `evidence` 里手写 `<验收项id> :: <结果>` 的**文本约定**，
 * 而验收项 id（`v<ver>-N`）是**提交那一刻**由 `buildSheet` 分配并连续编号的——agent 提交前
 * 写不出正确键，于是绑定实际不可达；更难查的是 `bindItemResults` 的 `unmatched` 返回值被丢弃，
 * 写错键也静默。
 *
 * 本模块把「结果 → 验收项」改成**按来源匹配**：`ref` 与 `VerificationItemSource` 同构
 * （task / requirement / prototype-compare / decision-compare），**不依赖项 id**；
 * 并把体检结论一次性交给调用方，由调用方决定拒绝与否。
 *
 * 五条本体纪律（复核两轮后写死，改动前先读这五条）：
 *   1. **可预见项的识别口径必须与 design/backend.md 的集合逐字一致**——`{kind:'requirement'}`
 *      这一个来源下同时住着「需求级项（固定一条）」与若干**同源但不是它**的行（`E2E 覆盖：有`
 *      不带 gapKind、原型豁免说明行、不可照着验行）。只按 source 判定会让它们共用一个引用键，
 *      结果被写到错误的行上，而体检还报「齐了」——那正是本需求要消灭的静默形态。
 *   2. **本模块是全函数**：`results` 是原始工具参数，可能不是数组、元素可能是原始值；
 *      项本身也可能是脏数据（判据字段缺失）。一律不抛异常，如实记进 `invalid` / `empty`。
 *   3. **两个计数不是一回事**：`matched` = 命中可预见项的条数；`changed` = 真正改动了台账字段的
 *      项数（人填过的 result 受保护 → 命中但未改动）。调用方要报给人看的是 `changed`。
 *   4. **`applyStructuredResults` 的前置条件是 `conflict` 为空**（它自己也守：非空则不写）。
 *   5. **返工续版的越界 ref 要分开判**（`splitUnmatched`）：续版只带上一版的未过项，
 *      而 agent 在出单前无从知道本轮是续版，必然按全量交代。
 *
 * 纯函数、零 IO、不读环境变量：回滚开关由调用方读取后以参数决定是否调用本模块。
 *
 * @module dsh-pmboard/domain/workflow/ResultBinding
 */

import { fmt } from '../text/fmt.js'
import {
  REQUIREMENT_LEVEL_CRITERION,
  hasResultAnchor,
  isSystemItem,
  type SheetItemLike,
  type VerificationItemSource,
} from './AcceptanceSheetSpec.js'

/**
 * 台账里存摘要不存整屏（与文本绑定路径 `AcceptanceSheetSpec.bindItemResults` 的 500 同口径）。
 *
 * 知悉：同一契约在两处各有一份常量（本卡体量声明只覆盖两个文件，把常量上提到
 * `AcceptanceSheetSpec` 会动第三个文件、超出 footprint）。**漂移由用例抓**：
 * `tests/result-binding.test.ts` 里有一条断言直接比对两条路径的截断长度。
 */
export const RESULT_MAX_CHARS = 500

/** 提交方给出的一条逐项结果（**瞬时输入，不落台账**；其投影是项的四个字段）。 */
export interface ResultRefInput {
  /** 引用键：与验收项来源同构，不发明第二套键。 */
  ref: VerificationItemSource
  /** 实测结果（命令 + 输出摘要）。 */
  result?: string
  /** true = 该项只能人看（界面视觉 / 线下流程）。 */
  needsHuman?: boolean
  /** needsHuman=true 时必填：为什么必须人看。 */
  humanReason?: string
}

/**
 * 体检结论。调用方按下列映射拒绝提交（**不许丢弃本返回值**——旧路径 `bindItemResults`
 * 的失误正是丢弃）：
 *
 * | 字段 | 含义 | 建议错误码 |
 * |---|---|---|
 * | `missing` | 可预见项没被交代 | `REQBOARD_RESULT_COVERAGE_MISSING` |
 * | `unmatched` | ref 指不到**本版验收单**里的任何可预见项（可能只是"本版不含"，见 `splitUnmatched`） | `REQBOARD_RESULT_REF_INVALID`（仅 `unknown` 部分） |
 * | `duplicate` | 同一 ref 出现多次 | `REQBOARD_RESULT_REF_DUPLICATE` |
 * | `invalid` | 形状非法（含 `results` 不是数组、ref 结构坏） | `REQBOARD_INVALID_INPUT` |
 * | `empty` | 交代不完整（既无 result 又无 needsHuman；needsHuman 缺理由） | `REQBOARD_RESULT_EMPTY` |
 * | `unanchored` | 命中了项、也有 result 文本，但文本没有可核验锚点（非人工项才判） | `REQBOARD_RESULT_UNANCHORED` |
 * | `conflict` | 验收单自身异常：两个可预见项共用同一引用键（防御性不变量） | 按 `REQBOARD_STORE_INCONSISTENT` 处理 |
 *
 * `unanchored` 排在最后：既有口径是「结构性优先」（`missing` = 覆盖面没交齐，
 * `unanchored` = 交上来的质量不够，两者互斥），先报结构、避免同一批错误来回两次往返。
 */
export interface ResultMatchReport {
  /** 命中可预见项的条数（体检口径）。 */
  matched: number
  /** ref 指不到本版任何可预见项。 */
  unmatched: readonly string[]
  /** 可预见项没被交代（**已去重**，元素 = 该来源的稳定描述文本）。 */
  missing: readonly string[]
  /** 同一 ref 出现多次。 */
  duplicate: readonly string[]
  /** 形状非法：`results` 非数组 / ref 结构坏 / 元素是原始值。 */
  invalid: readonly string[]
  /** 交代不完整：既无 result 又无 needsHuman，或 needsHuman 缺（或空白）理由。 */
  empty: readonly string[]
  /**
   * 命中了项、也有 result 文本，但文本**没有可核验锚点**（命令 + 读数 / 文件路径 / 明确计数）。
   *
   * 判据只有一处：`AcceptanceSheetSpec.hasResultAnchor`（本模块不另写正则——两处必然漂移）。
   * 人工项（`needsHuman`）与系统项（`isSystemItem`）**明确排除**：它们的判据分别是事实形态
   * 与处置两义，套锚点判据等于逼人编命令。
   */
  unanchored: readonly string[]
  /** 验收单里两个可预见项共用同一引用键（不应发生；发生必须响亮）。 */
  conflict: readonly string[]
}

/**
 * 该验收项是否属于「必须逐项交代」的可预见项。
 *
 * 集合口径**逐字对齐** design/backend.md：顶层父卡任务项 ∪ 需求级项（**固定那一条**）∪ 对照项。
 * 系统项（孤儿 / E2E 缺口 / 三方一致性 / 锚点失效 / 追溯断链）与「不可照着验」「原型豁免说明」
 * 「`E2E 覆盖：有`」这些**同源但不是需求级项**的行都不在其中——它们在提交时才由代码追加，
 * agent 无从预见，故豁免。
 *
 * 为什么入参是**项**而不是 `source`：上面这些行的 `source.kind` 全是 `'requirement'`，
 * 只看 source 无法区分，那种签名会退化成恒真的摆设。需求级项靠**判据文本等值**识别
 * （`buildSheet` 对它就写死这一条常量）。
 *
 * 脏数据纪律：判据字段缺失/非字符串时**不当作需求级项**（不逼人交代一个看不见判据的项），
 * 且绝不因此抛异常——本模块的全函数承诺要覆盖脏项，不只是脏 `results`。
 */
export function isForeseeableItem(item: Pick<SheetItemLike, 'source' | 'gapKind' | 'criterion'>): boolean {
  switch (item.source.kind) {
    case 'task':
    case 'prototype-compare':
    case 'decision-compare':
      return true
    case 'requirement': {
      if (item.gapKind !== undefined) return false
      const criterion = typeof item.criterion === 'string' ? item.criterion : ''
      return criterion === REQUIREMENT_LEVEL_CRITERION
    }
  }
}

/** 稳定的引用键（**不含验收项 id**：项 id 在提交前尚不存在）。 */
export function refKeyOf(ref: VerificationItemSource): string {
  switch (ref.kind) {
    case 'requirement': return 'requirement'
    case 'task': return 'task:' + ref.taskId
    case 'prototype-compare': return 'prototype:' + ref.prototypePath
    case 'decision-compare': return 'decision:' + [...new Set(ref.decisionIds)].sort().join(',')
  }
}

/** 形状校验：返回 undefined = 合法，否则返回人能看懂的原因。 */
function refInvalidReason(ref: unknown): string | undefined {
  if (typeof ref !== 'object' || ref === null) return 'ref 必须是对象'
  const r = ref as { kind?: unknown; taskId?: unknown; prototypePath?: unknown; decisionIds?: unknown }
  switch (r.kind) {
    case 'requirement':
      return undefined
    case 'task':
      return typeof r.taskId === 'string' && r.taskId.trim().length > 0 ? undefined : 'ref.kind=task 需要非空 taskId'
    case 'prototype-compare':
      return typeof r.prototypePath === 'string' && r.prototypePath.trim().length > 0 ? undefined : 'ref.kind=prototype-compare 需要非空 prototypePath'
    case 'decision-compare':
      return Array.isArray(r.decisionIds) && r.decisionIds.length > 0
        && r.decisionIds.every(x => typeof x === 'string' && x.trim().length > 0)
        ? undefined
        : 'ref.kind=decision-compare 需要非空 decisionIds 数组'
    default:
      return 'ref.kind 非法（只认 requirement / task / prototype-compare / decision-compare）'
  }
}

/** 可预见项按引用键建索引；同时给出「同键多项」的冲突清单（防御性不变量）。 */
function indexForeseeable(items: readonly SheetItemLike[]): {
  byKey: Map<string, SheetItemLike>
  keys: string[]
  conflict: string[]
} {
  const byKey = new Map<string, SheetItemLike>()
  const counts = new Map<string, number>()
  for (const it of items) {
    if (!isForeseeableItem(it)) continue
    const key = refKeyOf(it.source)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!byKey.has(key)) byKey.set(key, it)
  }
  const conflict = [...counts.entries()].filter(([, n]) => n > 1).map(([k, n]) => fmt('{key} ×{n}', { key: k, n: String(n) }))
  return { byKey, keys: [...byKey.keys()], conflict }
}

/**
 * 匹配 + 体检（纯函数、**全函数**：任何输入都不抛）。
 *
 * 判定顺序是刻意的：**形状 → 命中 → 重复 → 交代完整性**。先判「指不到项」再判「没给结果」，
 * 否则「ref 写错且忘了填结果」会被报成「没给 result」，把 agent 引向错误的修法。
 */
export function matchStructuredResults(items: readonly SheetItemLike[], results: unknown): ResultMatchReport {
  const { byKey, keys, conflict } = indexForeseeable(items)
  if (!Array.isArray(results)) {
    return {
      matched: 0,
      unmatched: [],
      missing: [...keys],
      duplicate: [],
      invalid: [fmt('results 必须是数组（收到 {type}）——逐项交代的载体就是它', { type: typeof results })],
      empty: [],
      unanchored: [],
      conflict,
    }
  }

  const unmatched: string[] = []
  const duplicate: string[] = []
  const invalid: string[] = []
  const empty: string[] = []
  const unanchored: string[] = []
  const covered = new Set<string>()
  let matched = 0

  results.forEach((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      invalid.push(fmt('results[{i}]（元素必须是对象）', { i: String(i) }))
      return
    }
    const r = raw as Partial<ResultRefInput>
    const reason = refInvalidReason(r.ref)
    if (reason !== undefined) {
      invalid.push(fmt('results[{i}]（{reason}）', { i: String(i), reason }))
      return
    }
    const label = refKeyOf(r.ref as VerificationItemSource)
    if (!byKey.has(label)) {
      unmatched.push(label)
      return
    }
    if (covered.has(label)) {
      duplicate.push(label)
      return
    }
    const text = (r.result ?? '').trim()
    const needsHuman = r.needsHuman === true
    const why = (r.humanReason ?? '').trim()
    if (text.length === 0 && !needsHuman) {
      empty.push(fmt('{label}（既没给 result，也没标 needsHuman——这一项由谁交代？）', { label }))
      return
    }
    if (needsHuman && why.length === 0) {
      empty.push(fmt('{label}（标了 needsHuman 却没写 humanReason——不许「标了但不解释」）', { label }))
      return
    }
    covered.add(label)
    matched++
    // S-3 提交侧锚点体检（只入桶，不拒绝——拒绝是调用方的事）：命中的**项**自身决定是否判锚点。
    // 人工项走事实形态、系统项走处置两义，都明确排除；空文本已在上面的 empty 判定里截住。
    const hit = byKey.get(label)!
    if (hit.needsHuman !== true && !isSystemItem(hit) && text.length > 0 && !hasResultAnchor(text)) {
      unanchored.push(fmt('{label}（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）', { label }))
    }
  })

  const missing = keys.filter(label => !covered.has(label))
  return { matched, unmatched, missing, duplicate, invalid, empty, unanchored, conflict }
}

/**
 * 返工续版的越界判定（复核 R2）：把 `unmatched` 分成「本版不含但确实存在」与「根本指不到东西」。
 *
 * 为什么必须有这一步：返工续版（`reworkOnly`）的验收单**只带上一版的未过项 + 未裁决项**，
 * 已通过的需求级项不在本版里。而 agent 是在**出单之前**提交材料的——它无从知道本轮会出续版，
 * 于是只能按全量交代。多出来的 ref 若一律按 `REQBOARD_RESULT_REF_INVALID` 拒，**返工轮就永远交不上去**。
 *
 * 判据：ref 的键在 `knownKeys`（调用方用**本需求活卡**算出的引用键集合，并显式加上需求级键）
 * 里 → 属「本版不含」（`outOfScope`：如实进返回体、**不拒**）；不在 → `unknown`（拒）。
 *
 * 安全性：越界放行**不会**让任何项免于交代——真正漏交的项仍会被 `missing` 抓住；
 * 而「把子卡结果当父卡交」这类错误，也会因父卡项 `missing` 被拒。
 */
export function splitUnmatched(
  unmatched: readonly string[],
  knownKeys: ReadonlySet<string>,
): { outOfScope: readonly string[]; unknown: readonly string[] } {
  const outOfScope: string[] = []
  const unknown: string[] = []
  for (const key of unmatched) (knownKeys.has(key) ? outOfScope : unknown).push(key)
  return { outOfScope, unknown }
}

/**
 * 就地写入结果（`result` / `resultSource='agent'` / `needsHuman` / `humanReason`）。
 *
 * 纪律（逐条都有用例锁）：
 *   · **前置条件是 `conflict` 为空**（调用方应先跑 `matchStructuredResults` 并在 conflict 非空时拒绝）；
 *     本函数自己也守：conflict 非空 → 一个字段都不写（宁可零改动，也不在撞键的验收单上乱写）；
 *   · **人填过的 `result` 不被覆盖**（`resultSource === 'human'` 时只保护 `result`/`resultSource`
 *     两个字段；`needsHuman` 与理由照常写入——那是"谁能看"的属性，不属于"谁填了结果"）；
 *   · `needsHuman` 只在**理由非空**时落库：宁可整条不写，也不留 `needsHuman=true` 而理由空的半截记录；
 *   · 超长截断到 `RESULT_MAX_CHARS`；
 *   · 系统项与指不到项的 ref 一律不写（不伪造）。
 *
 * 返回 `{ matched, changed }`：`matched` = 命中可预见项条数，`changed` = **真正改动了字段的项数**
 * （人填过的 result 受保护 → 命中而不改动）。调用方报给人看的数应当是 `changed`。
 */
export function applyStructuredResults(items: SheetItemLike[], results: unknown): { matched: number; changed: number } {
  const { byKey, conflict } = indexForeseeable(items)
  if (conflict.length > 0) return { matched: 0, changed: 0 }
  if (!Array.isArray(results)) return { matched: 0, changed: 0 }

  const seen = new Set<string>()
  let matched = 0
  let changed = 0
  for (const raw of results) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Partial<ResultRefInput>
    if (refInvalidReason(r.ref) !== undefined) continue
    const label = refKeyOf(r.ref as VerificationItemSource)
    if (seen.has(label)) continue
    const item = byKey.get(label)
    if (item === undefined) continue
    seen.add(label)
    matched++

    let touched = false
    const text = (r.result ?? '').trim()
    if (text.length > 0 && item.resultSource !== 'human') {
      item.result = text.slice(0, RESULT_MAX_CHARS)
      item.resultSource = 'agent'
      touched = true
    }
    if (r.needsHuman === true) {
      const why = (r.humanReason ?? '').trim()
      if (why.length > 0) {
        if (item.needsHuman !== true) {
          item.needsHuman = true
          touched = true
        }
        if (item.humanReason !== why) {
          item.humanReason = why
          touched = true
        }
      }
    }
    if (touched) changed++
  }
  return { matched, changed }
}
