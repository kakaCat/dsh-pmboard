/**
 * 原型锚点引用（`prototypeRefs`）的**解析与判定单点**（REQ-261005105032-3b02 FR-5 / t12）。
 *
 * 为什么单独成模块：
 *  1. 锚点有**两个来源**——任务对象（`tasks[].prototypeRefs`）与 `decomposition.md` 的任务表
 *     （「原型锚点（UI 卡必填）」列）。"什么算一个合法锚点""这条锚点属于哪张卡"只能有一份实现：
 *     本仓 `requirement_refs` 曾在协议层 / 工具 schema / 白名单搬运三处各写一份，结果是三处全都
 *     静默丢弃（计划里写了也到不了落库）。
 *  2. 判定必须是**纯函数、零 IO**（可单独逆验证：人为改坏必红）。读 INDEX / 需求文档那一半留在
 *     既有判定单点 `assertClauseCoverageGate`（`content-gate-wiring.ts`）——门禁只有一处，
 *     本模块只回答"该卡申报了什么、坏在哪"。
 *
 * 形态（唯一真源 = `templates/decomposing/decomposition.md` 的「原型锚点（UI 卡必填）」列）：
 * `prototypes/<name>.html#FR-N`——页面内区块的定位符。路径一律归一到**需求目录相对**口径
 * （与 `prototypes/INDEX.md` 的「路径」列同口径，复用 prototype-gates 的 `toReqRelative`，
 * 不另写一份切片逻辑）。
 *
 * @module dsh-pmboard/application/internal/plan-prototype-refs
 */
import type { ParsedDoc } from './content-gates.js'
import { planKeysIn } from './content-trace.js'
import { toReqRelative } from './prototype-gates.js'

/** 一条锚点：原文 + 归一后的需求目录相对路径 + 它指向的 FR。 */
export interface PlanPrototypeAnchor {
  /** 原文（gap 文案里回显，人一眼认得出自己写了什么） */
  raw: string
  /** 需求目录相对路径（如 prototypes/detail.html） */
  path: string
  /** 锚点指向的功能点（如 FR-4） */
  fr: string
}

/** 一条锚点引用的解析结果：合法的进 anchors，写了原型路径却不成锚点的进 malformed。 */
export interface PlanPrototypeAnchorParse {
  anchors: PlanPrototypeAnchor[]
  malformed: string[]
}

/** 锚点形态：`prototypes/<name>.html#FR-N`（容忍单数 `prototype/`、带前缀目录的写法）。 */
const ANCHOR_RE = /((?:[\w.-]+\/)*prototypes?\/[\w.-]+\.html)#(FR-\d+)/g
/** 只认路径（不看 `#FR-N`）：用来区分「根本没写原型」与「写了原型但没写锚点」。 */
const PROTOTYPE_PATH_RE = /(?:[\w.-]+\/)*prototypes?\/[\w.-]+\.html/g

/**
 * 从一个字符串（任务对象的一项 / 文档单元格）抽出锚点。
 *
 * 为什么允许"路径前后有别的字"：模板给的单元格形态是 `P-1 ↔ prototypes/detail.html#FR-4`
 * （编号是给人读的对照），整格当锚点原样比对会把合规写法判成非法。
 * 反过来，**写了原型路径却解析不出锚点**（缺 `#FR-N`、路径越界、`..`）一律进 malformed：
 * 静默忽略等于把"写错了"变成"没写"，人只会看到一句"缺锚点"，找不到自己写错的那一处。
 */
export function planPrototypeAnchorsIn(text: string, reqId: string): PlanPrototypeAnchorParse {
  const anchors: PlanPrototypeAnchor[] = []
  const malformed: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(ANCHOR_RE)) {
    const raw = m[0]
    const path = toReqRelative(m[1] ?? '', reqId)
    if (path === undefined) {
      if (!seen.has(raw)) { malformed.push(raw); seen.add(raw) }
      continue
    }
    const anchor: PlanPrototypeAnchor = { raw, path, fr: m[2] ?? '' }
    if (!seen.has(raw)) { anchors.push(anchor); seen.add(raw) }
  }
  const hasPath = [...text.matchAll(PROTOTYPE_PATH_RE)].length > 0
  if (anchors.length === 0 && hasPath && malformed.length === 0) {
    const raw = text.trim().slice(0, 120)
    if (!seen.has(raw)) malformed.push(raw)
  }
  return { anchors, malformed }
}

/** 读任务对象上的原型锚点引用（同时认 snake_case / camelCase / RTM 的 covers_prototypes，避免静默漏判）。 */
export function prototypeRefsOfTask(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const o = raw as Record<string, unknown>
  const v = o['prototypeRefs'] ?? o['prototype_refs'] ?? o['covers_prototypes']
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (t.length > 0) out.push(t)
  }
  return out
}

/** 一张计划卡在锚点这一维上的投影（key 与 side 的缺省口径与 `normalizePlanTasks` 一致）。 */
export interface PlanTaskAnchorView {
  key: string
  /** 归一后的端侧（缺省 fullstack——与协议层默认值同口径，避免两处判定不同） */
  side: string
  /** 该卡申报的原始锚点串（任务对象通道） */
  refs: string[]
}

/** 把 `rawTasks`（工具入参 / 已批准计划的任务表）投影成锚点视图。 */
export function planTaskAnchorViews(rawTasks: readonly unknown[]): PlanTaskAnchorView[] {
  return rawTasks.map((raw, i) => {
    const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const key = typeof o['key'] === 'string' && o['key'].trim().length > 0 ? o['key'].trim() : 'k' + String(i + 1)
    const side = typeof o['side'] === 'string' && o['side'].trim().length > 0 ? o['side'].trim() : 'fullstack'
    return { key, side, refs: prototypeRefsOfTask(raw) }
  })
}

/**
 * 哪些卡是「UI 卡」（本维的判定对象）——`side === 'frontend'`。
 *
 * 与另两处同源同口径：RTM 的 `covers_prototypes` 维（`isPrototypeAnchorTask`）与
 * `buildSubtaskPrompt` 的原型小节都只认 `side === 'frontend'`。三处若不一致，就会出现
 * "提示词带了原型、覆盖度却算它不覆盖"这类自相矛盾。
 * 缺省（未声明 side）按协议层默认值 `fullstack` 处理 ⇒ **不算 UI 卡**：那是"这张卡没声明端侧"，
 * 不是"它是 UI 卡"——把未声明的卡算进来会给纯后端计划制造假红。
 */
export function isUiCard(view: PlanTaskAnchorView): boolean {
  return view.side === 'frontend'
}

/**
 * 从计划文档的任务表读「计划 key → 原型锚点原文」。
 *
 * 为什么要这条通道：计划携带任务表时，人写的是 `decomposition.md`（「原型锚点（UI 卡必填）」列），
 * 而 `tasks[]` 可能压根没传；只认任务对象等于把最常见的写法判成"没写"。
 * 列名容忍：锚点列认「原型 / prototype」，卡身份列按 `计划 key` → `接收任务` → `任务` 依次回落
 * （覆盖对照表用「接收任务」，任务表用「计划 key」，两张表都要能读到）。
 */
export function prototypeRefsFromPlanDoc(doc: ParsedDoc): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const table of doc.tables) {
    const iAnchor = table.header.findIndex(h => /原型|prototype/i.test(h))
    if (iAnchor < 0) continue
    const iKey = indexOfHeader(table.header, ['计划 key', '计划key', '计划键', '接收任务', '任务'])
    if (iKey < 0 || iKey === iAnchor) continue
    for (const row of table.rows) {
      const keyCell = (row[iKey] ?? '').trim()
      // 占位符（— / -）不是一条锚点：与"没写"同义，留给门禁给「缺锚点」而不是「形态不合法」
      const anchorCell = (row[iAnchor] ?? '').trim()
      if (keyCell === '' || anchorCell === '' || anchorCell.startsWith('—') || anchorCell === '-') continue
      for (const key of planKeysIn(keyCell)) {
        out.set(key, [...(out.get(key) ?? []), anchorCell])
      }
    }
  }
  return out
}

function indexOfHeader(header: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const i = header.findIndex(h => h.includes(name))
    if (i >= 0) return i
  }
  return -1
}

/** 一张 UI 卡的锚点申报（任务对象 ∪ 计划文档，按 key 合并去重）。 */
export interface UiCardAnchorClaim {
  key: string
  refs: string[]
}

/**
 * 合并两个来源，得到「每张 UI 卡申报了什么」。返回顺序 = 任务表顺序（gap 逐卡点名时可读）。
 *
 * 为什么文档通道的键要回落到"任务对象里没有的 key"：两条通道键是同一套计划 key，
 * 合并即可；文档里有、任务对象里没有的卡（计划只写文档的场景）也照样进本表，
 * 否则它会整张逃过本维。
 */
export function uiCardAnchorClaims(
  rawTasks: readonly unknown[],
  docRefs: ReadonlyMap<string, readonly string[]>,
): UiCardAnchorClaim[] {
  const byKey = new Map<string, UiCardAnchorClaim>()
  const order: string[] = []
  for (const view of planTaskAnchorViews(rawTasks)) {
    if (!isUiCard(view)) continue
    const cur = byKey.get(view.key) ?? { key: view.key, refs: [] }
    if (!byKey.has(view.key)) order.push(view.key)
    cur.refs = [...cur.refs, ...view.refs]
    byKey.set(view.key, cur)
  }
  for (const [key, refs] of docRefs) {
    // 文档表里只有 key、没有端侧列：能进到这里说明卡在「原型锚点」列上写了值，
    // 而该列按模板是 UI 卡必填列 ⇒ 有值即按 UI 卡对待（不因为任务对象没传 side 就放过）。
    const cur = byKey.get(key) ?? { key, refs: [] }
    if (!byKey.has(key)) order.push(key)
    cur.refs = [...cur.refs, ...refs]
    byKey.set(key, cur)
  }
  return order.map(k => byKey.get(k) as UiCardAnchorClaim)
}

/**
 * 逐卡判定：**每张 UI 卡的「设计落点」都得有可用锚点**，返回缺口清单（空数组 = 齐备）。
 *
 * 判据两部分（缺一不可）：
 *  ① 形态：`prototypes/<name>.html#FR-N`，解析得出的路径必须归一得回需求目录；
 *  ② 权威：路径必须等于 `prototypes/INDEX.md` 的权威行（`authoritative` 恰好一条时的那个路径）。
 *     `authoritative === undefined` 表示 INDEX 缺失 / 解析有缺口 / 权威条数 ≠ 1——那三种形态由
 *     **版本门单独报一次**（`checkPrototypeVersionGate`），本维不重复报，故降级为只判形态。
 */
export function prototypeAnchorGaps(
  claims: readonly UiCardAnchorClaim[],
  reqId: string,
  authoritative: string | undefined,
  decompPath: string,
): string[] {
  const gaps: string[] = []
  const seen = new Set<string>()
  const push = (gap: string): void => {
    if (seen.has(gap)) return
    seen.add(gap)
    gaps.push(gap)
  }
  const how = decompPath + ' 的任务表「原型锚点（UI 卡必填）」列（模板 templates/decomposing/decomposition.md）'
  for (const claim of claims) {
    const anchors: PlanPrototypeAnchor[] = []
    for (const ref of claim.refs) {
      const parsed = planPrototypeAnchorsIn(ref, reqId)
      anchors.push(...parsed.anchors)
      for (const bad of parsed.malformed) {
        push(claim.key + '（UI 卡）：原型锚点形态不合法「' + bad
          + '」——须为 prototypes/<name>.html#FR-N，且路径与 prototypes/INDEX.md 的权威行一致；改在 ' + how)
      }
    }
    if (anchors.length === 0) {
      push(claim.key + '（UI 卡）：缺原型锚点——「设计落点」没有 prototypes/<name>.html#FR-N 形态的引用；'
        + '补在 ' + how + '，或在 reqboard_submit(kind=plan) / reqboard_decompose 的 tasks[] 里给该卡写 prototypeRefs:["prototypes/detail.html#FR-4"]')
      continue
    }
    if (authoritative === undefined) continue
    for (const anchor of anchors) {
      if (anchor.path === authoritative) continue
      push(claim.key + '（UI 卡）：锚点 ' + anchor.raw + ' 指向非权威版本（INDEX 权威 = ' + authoritative
        + '）——改指权威路径；改在 ' + how)
    }
  }
  return gaps
}
