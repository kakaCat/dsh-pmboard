/**
 * 「验收」Tab 面板（REQ-261006130057-7a43 · FR-8 / t3：面板实体填实；D-10 返工：按 FR 成行）。
 *
 * 蓝本 = 原型 `docs/requirements/REQ-261006130057-7a43/prototypes/detail.html` v1.5 `#tab-verify`
 * （D-8：主视图是 **RTM 验收追踪列表**，逐项实际结果降级为行详情）。数据契约 =
 * `VerifyPanelResponse`（`shared/protocol.ts`，七段全可选）：
 * sheet / history / tracking / coverage / frMap / materials / pendingCount。
 *
 * **行键（D-10 返工）**：`frMap` 有值 → **每 FR 一行**（行键 = `FR-1`…`FR-8`，按编号数值升序，
 * 覆盖链 chip = 该 FR 在不在 `fr_to_design / fr_to_tasks / fr_to_tests` 里）；
 * 归不进任何 FR 追溯链的项（需求级 `REQ-LEVEL`、prototype/decision 对照项）另起一组
 * 「需求级 / 对照项」行（`data-fr-group="aux"`）排在 FR 行之后，**不丢**；
 * `frMap` 缺省（无 RTM 数据）→ 退回逐项平铺（行键 = 追溯 id，老路径零变化）。
 *
 * **FR 名称**（D-10 返工后口径）：FR 列 = `FR-N`（等宽）+ **名称**（原型同款「编号 + 名称」）。
 * 名称来源 = 载荷的 `frNames`（服务端读 requirement.md 抽 `- **FR-N: 名称**`，见
 * `application/query/QueryVerify.ts` 的 `frNamesOf`）——**有才渲染**：`frNames` 缺省 /
 * 该 FR 不在表里 / 值是空串，一律**只留编号**，前端**绝不编名称**（编出来的名称读者无从分辨）。
 * 对照项行（`data-fr-group="aux"`）的行键是追溯 id（task id / REQ-LEVEL），不是 FR 号，
 * 故不挂名称（它自带来源标）。
 *
 * 六条纪律（改代码时必须保住）：
 *  ① **脏载荷不炸**：`readVerify` 只做形状归一（全字段可选、逐元素对象守卫），
 *     不对 `undefined` 取字段——渲染路径上一处 TypeError 就是整块白屏（本仓踩过）。
 *  ② **两源对齐单点**：sheet 逐项按 `rtmTraceIdOf(source)`（domain 既有函数）归进 FR 名下
 *     （`fr_to_tasks ∪ fr_to_tests`），tracking 行同键同归——不发明第二套对齐键。
 *  ③ **RTM 是增强层**（FR-9）：无 frMap / tracking / coverage 时**降级逐项平铺**
 *     （覆盖链列整体不渲染），绝不允许因 RTM 缺失让面板报错或画一列全 ✗ 的假覆盖。
 *  ④ **裁决复用既有 action**：待裁决项的「通过/不通过」= board-mount 已接的
 *     `data-action="submit-verdicts"` 收集链（`.dsh-pm-vsheet > .dsh-pm-vitem` 单选 + 意见输入，
 *     与 stage-panel 验收单逐项同款），**不给假按钮**；版本号缺失时不渲染控件、如实说明。
 *  ⑤ **not_verifiable 算已裁决**：待裁决计数只含 pending + unverified（与 domain
 *     `isFullyDecided` 同口径）；「待裁决 N 项」直接铺服务端 `pendingCount`，前端不另数一遍。
 *  ⑥ **空态不画空表格**：无 sheet / items 为空各一句解释（`data-verify-empty="1"`，
 *     沿用 docs 核验节删除前的两分支文案口径），两态产物里都没有 `<table>`。
 *
 * 根容器自带 `data-panel="verify"`（六面板共同约定：壳只写 `data-tab-host`，面板自足可断言）。
 *
 * @module dsh-pmboard/client/views/panels/verify
 */
import { esc } from '../../html.js'
import { mdInline } from '../../render/md-inline.js'
import type { PanelShape, ReportTabCtx } from '../report-tabs.js'
import type {
  ActorRef,
  VerificationItem,
  VerifyPanelResponse,
} from '../../../shared/protocol.js'
import type { AcceptanceTracking } from '../../../../vendor/reqboard/src/types/rtm.js'
// 对齐键单点（纪律②）：sheet 项 source → RTM fr_id 的判定只在 domain 一份。
import {
  rtmTraceIdOf,
  isSystemItem,
  REQ_LEVEL_TRACE_ID,
  PROTOTYPE_COMPARE_TRACE_ID,
  DECISION_COMPARE_TRACE_ID,
} from '../../../domain/workflow/AcceptanceSheetSpec.js'
import { degradeText } from '../report-head.js'
import { fmtTime, windowCodeFromSessionId } from '../../render/dom-utils.js'

/** 端点 404 / 未装配时的固定文案（FR-8；与 `api.fetchReportVerify` 的降级 note 同一句）。 */
export const VERIFY_OLD_SERVER_TEXT = '服务端版本过旧，验收单暂在『文档』Tab 核验节查看'

/* ────────────────────────────────────────────────────────────── ① readVerify：归一化 */

/** 归一化后的视图（全可选；`history` 归一为数组便于渲染侧不判空）。 */
export interface VerifyView {
  sheet?: {
    version?: number
    reworkOnly: boolean
    generatedAt?: number
    items: VerificationItem[]
  }
  history: { version?: number; reworkOnly: boolean; generatedAt?: number; items: VerificationItem[] }[]
  tracking?: AcceptanceTracking[]
  coverage?: Record<string, { design: boolean; tasks: boolean; tests: boolean }>
  /**
   * 追溯三映射（D-10 返工）：有它 → 主表**按 FR 成行**（行键 = FR 号，覆盖链 chip 由
   * "该 FR 在不在映射里"直接得出）；缺省 → 退回逐项平铺（行键 = 追溯键）。
   */
  frMap?: {
    fr_to_design?: Record<string, string[]>
    fr_to_tasks?: Record<string, string[]>
    fr_to_tests?: Record<string, string[]>
  }
  /**
   * FR 号 → 名称（D-10 返工）：服务端从 requirement.md 抽出的 `FR-N: 名称`。
   * 缺省 = 服务端没解析出（文档读不到 / 没装配文档端口）→ FR 列只渲染编号，**不编名称**。
   */
  frNames?: Record<string, string>
  materials?: { summary?: string; evidence: string[] }
  pendingCount?: number
}

/** 脏读小工具：只取字符串 / 有限数 / 对象，其余按缺省（不抛、不放大脏数据）。 */
const str = (v: unknown): string => typeof v === 'string' ? v : ''
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined

function itemsOf(raw: unknown): VerificationItem[] {
  if (!Array.isArray(raw)) return []
  const out: VerificationItem[] = []
  for (const it of raw) if (obj(it) !== undefined) out.push(it as VerificationItem)
  return out
}

function sheetOf(raw: unknown): VerifyView['sheet'] {
  const s = obj(raw)
  if (s === undefined) return undefined
  return {
    ...(num(s.version) !== undefined ? { version: num(s.version) } : {}),
    reworkOnly: s.reworkOnly === true,
    ...(num(s.generatedAt) !== undefined ? { generatedAt: num(s.generatedAt) } : {}),
    items: itemsOf(s.items),
  }
}

function trackingOf(raw: unknown): AcceptanceTracking[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rows = raw.filter((r): r is AcceptanceTracking => obj(r) !== undefined)
  return rows.length > 0 ? rows : undefined
}

function coverageOf(raw: unknown): VerifyView['coverage'] {
  const c = obj(raw)
  if (c === undefined) return undefined
  const out: NonNullable<VerifyView['coverage']> = {}
  for (const [fr, v] of Object.entries(c)) {
    const t = obj(v)
    if (t === undefined) continue
    out[fr] = { design: t.design === true, tasks: t.tasks === true, tests: t.tests === true }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * `frMap` 归一化（D-10 返工）：三张映射逐张守卫——只留「值是数组」的键，数组里只留字符串。
 * 三张全缺 / 全空 → 缺省（等同「无 RTM 数据」，前端走逐项平铺的老路径）。
 *
 * 注意「键在、值为空数组」**保留**：那是"该 FR 在这张映射里挂了零个成员"的如实读数，
 * 覆盖链 chip 该给 ✓（键在）而不是把该 FR 整行抹掉。
 */
function frMapOf(raw: unknown): VerifyView['frMap'] {
  const m = obj(raw)
  if (m === undefined) return undefined
  const one = (v: unknown): Record<string, string[]> | undefined => {
    const r = obj(v)
    if (r === undefined) return undefined
    const out: Record<string, string[]> = {}
    for (const [k, val] of Object.entries(r)) {
      if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === 'string')
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  const design = one(m.fr_to_design)
  const tasks = one(m.fr_to_tasks)
  const tests = one(m.fr_to_tests)
  const out: NonNullable<VerifyView['frMap']> = {
    ...(design !== undefined ? { fr_to_design: design } : {}),
    ...(tasks !== undefined ? { fr_to_tasks: tasks } : {}),
    ...(tests !== undefined ? { fr_to_tests: tests } : {}),
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * `frNames` 归一化（D-10 返工）：只留「值是字符串且非空白」的键，两侧空白剪掉。
 *
 * 脏载荷（非对象 / 值不是字符串 / 空串）一律丢——丢一个名称最多是"只渲染编号"（老表现），
 * 而把 `undefined`、`42`、空串当名称渲染出来是**假名称**，两者不是一个量级。
 * 一条都没留下 → 缺省（不是空对象：缺省与"解析到 0 条"都表示"只渲染编号"）。
 */
function frNamesOf(raw: unknown): VerifyView['frNames'] {
  const m = obj(raw)
  if (m === undefined) return undefined
  const out: Record<string, string> = {}
  for (const [fr, v] of Object.entries(m)) {
    if (typeof v !== 'string') continue
    const name = v.trim()
    if (name.length === 0) continue
    out[fr] = name
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function materialsOf(raw: unknown): VerifyView['materials'] {
  const m = obj(raw)
  if (m === undefined) return undefined
  const summary = str(m.summary).trim()
  return {
    ...(summary.length > 0 ? { summary } : {}),
    evidence: Array.isArray(m.evidence) ? m.evidence.filter((e): e is string => typeof e === 'string') : [],
  }
}

/**
 * `VerifyPanelResponse` 归一化（纪律①）：六段全可选、逐段守卫，脏载荷返回能渲染的视图，
 * 绝不抛——「没有这段数据」与「这段数据形状坏了」都落成各自的缺省分支。
 */
export function readVerify(data: unknown): VerifyView {
  const v = obj(data) as Partial<VerifyPanelResponse> | undefined
  if (v === undefined) return { history: [] }
  const history = Array.isArray(v.history)
    ? v.history.map(sheetOf).filter((s): s is NonNullable<VerifyView['sheet']> => s !== undefined)
    : []
  const pendingCount = num(v.pendingCount)
  return {
    ...(sheetOf(v.sheet) !== undefined ? { sheet: sheetOf(v.sheet) } : {}),
    history,
    ...(trackingOf(v.tracking) !== undefined ? { tracking: trackingOf(v.tracking) } : {}),
    ...(coverageOf(v.coverage) !== undefined ? { coverage: coverageOf(v.coverage) } : {}),
    ...(frMapOf(v.frMap) !== undefined ? { frMap: frMapOf(v.frMap) } : {}),
    ...(frNamesOf(v.frNames) !== undefined ? { frNames: frNamesOf(v.frNames) } : {}),
    ...(materialsOf(v.materials) !== undefined ? { materials: materialsOf(v.materials) } : {}),
    ...(pendingCount !== undefined ? { pendingCount } : {}),
  }
}

/* ────────────────────────────────────────────────────────────── ② 分组与行状态 */

/**
 * 一个表格行（D-10 返工后的两种行）：
 *   · `kind='fr'`：FR 行——有 `frMap` 时行键 = **FR 号**（FR-1…），无 `frMap` 的降级路径下
 *     行键 = 追溯键（老口径，逐项平铺）；
 *   · `kind='aux'`：**需求级 / 对照项**行——归不进任何 FR 追溯链的逐项与追踪（REQ-LEVEL、
 *     prototype/decision 对照项、孤立的 task id），另起一组排在 FR 行之后，**不丢**。
 */
interface PanelRow {
  /** 行键：FR 行 = FR 号（降级路径 = 追溯 id）；对照项行 = 追溯键。 */
  key: string
  kind: 'fr' | 'aux'
  items: VerificationItem[]
  track: AcceptanceTracking[]
  /** 覆盖链三态（FR 行）：frMap 模式下由「该 FR 在不在三张映射里」得出；降级模式取 coverage */
  cov?: { design: boolean; tasks: boolean; tests: boolean }
  /** 对照项行的来源标（可读短标签 + 原始枚举进 data-source-kind） */
  source?: { kind: string; label: string }
  /**
   * 本行该铺**裁决控件**的待裁决项（frMap 模式）。
   *
   * 归属是**成员语义**（一项命中几个 FR 的 `fr_to_tasks ∪ fr_to_tests` 就在几行的状态/怎么验里
   * 算数，与原型一致），但控件只铺**一份**：同名 radio 天然是一组（点一处清另一处），
   * 两行各铺一份只会让人把意见打进没选中的那一行、提交时被判「没写」。
   * 缺省（降级路径）= 本行逐项全铺（老口径）。
   */
  controlItems?: Set<VerificationItem>
  /** 本行挂到、但控件铺在别行（值 = 那行的键）：渲染一句指路，不铺第二份控件 */
  foreignControls?: Map<VerificationItem, string>
}

/** sheet 项 → 对齐键（`rtmTraceIdOf` 单点；脏 source 落 'UNKNOWN'，不炸、不静默丢项）。 */
function traceOf(item: VerificationItem): string {
  const src = item.source
  if (src !== null && typeof src === 'object') {
    const t = rtmTraceIdOf(src)
    if (typeof t === 'string' && t.length > 0) return t
  }
  return 'UNKNOWN'
}

/** 行状态五值（chip 四态 + 全不可验收）：failed > pending > unverified > not_verifiable > pass。 */
type RowStatus = 'pass' | 'fail' | 'pending' | 'unverified' | 'nv'

/**
 * 多子项取**最严重**状态（D-10 返工口径）：不通过 > 待裁决 > 未复核 > 通过；
 * 「全是不可验收」单列一态（nv，沿用改造前口径：已裁决但不可验，不计入待裁决）。
 *
 * 一组**一个状态都没有**（无逐项也无追踪）→ `unverified`：不画「✅ 通过」冒充
 * ——FR 行只出现在 frMap 里、验收单里根本没有它的逐项时，「通过」是假读数。
 */
function rowStatusOf(statuses: string[]): RowStatus {
  if (statuses.length === 0) return 'unverified'
  if (statuses.includes('failed')) return 'fail'
  if (statuses.includes('pending')) return 'pending'
  if (statuses.includes('unverified')) return 'unverified'
  if (statuses.every(s => s === 'not_verifiable')) return 'nv'
  return 'pass'
}

/** 一行实测状态来源：有逐项看逐项，否则看该组名下的 RTM 追踪行。 */
function statusOf(r: PanelRow): RowStatus {
  return rowStatusOf(r.items.length > 0 ? r.items.map(i => str(i.status)) : r.track.map(t => str(t.status)))
}

/** FR 号 → 数值（`FR-12` → 12）；不是 `FR-<数>` 的脏键回 undefined（排序时排尾）。 */
function frNumberOf(fr: string): number | undefined {
  const m = /^FR-(\d+)$/.exec(fr)
  return m === null ? undefined : Number(m[1])
}

/**
 * FR 行序：**按 FR 编号数值升序**（FR-2 在 FR-10 之前，纯字典序会把 FR-10 排到 FR-2 前）；
 * 非 `FR-<数>` 的脏键排在 FR 行之后（字典序），不让一个怪键插进 FR-1 与 FR-2 之间。
 */
function frOrder(a: string, b: string): number {
  const na = frNumberOf(a)
  const nb = frNumberOf(b)
  if (na !== undefined && nb !== undefined) return na - nb
  if (na !== undefined) return -1
  if (nb !== undefined) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** 该 FR 名下的**验收归属链**：`fr_to_tasks ∪ fr_to_tests`（设计映射不参与逐项归属——纪律②）。 */
function chainOf(frMap: NonNullable<VerifyView['frMap']>, fr: string): Set<string> {
  return new Set([...(frMap.fr_to_tasks?.[fr] ?? []), ...(frMap.fr_to_tests?.[fr] ?? [])])
}

/** 对照项行的来源标：有逐项以逐项为准（tracking 行可能整组缺席），否则按追溯键常量认。 */
function auxSourceOf(trace: string, first: VerificationItem | undefined): { kind: string; label: string } {
  if (first !== undefined) {
    const s = sourceTagOf(first)
    return { kind: s.kind, label: auxGroupLabel(s.kind) }
  }
  switch (trace) {
    case REQ_LEVEL_TRACE_ID: return { kind: 'requirement', label: auxGroupLabel('requirement') }
    case PROTOTYPE_COMPARE_TRACE_ID: return { kind: 'prototype-compare', label: auxGroupLabel('prototype-compare') }
    case DECISION_COMPARE_TRACE_ID: return { kind: 'decision-compare', label: auxGroupLabel('decision-compare') }
    default: return { kind: 'unknown', label: '对照项' }
  }
}

/** 对照项行的可读短标签（原始枚举另进 `data-source-kind`，审计与断言认那个）。 */
function auxGroupLabel(kind: string): string {
  switch (kind) {
    case 'requirement': return '需求级'
    case 'prototype-compare': return '原型对照项'
    case 'decision-compare': return '裁定对照项'
    default: return '对照项'
  }
}

/**
 * 降级路径的归组（**无 `frMap` 时**，纪律③）：tracking 在册的 fr_id 先行（顺序 = tracking
 * 首次出现序），sheet 逐项按对齐键进组——行键 = 追溯 id（老口径，覆盖链列取 `coverage`）。
 */
function traceRowsOf(view: VerifyView): PanelRow[] {
  const groups = new Map<string, PanelRow>()
  const ensure = (fr: string): PanelRow => {
    let g = groups.get(fr)
    if (g === undefined) {
      g = { key: fr, kind: 'fr', items: [], track: [] }
      groups.set(fr, g)
    }
    return g
  }
  for (const t of view.tracking ?? []) ensure(str(t.fr_id) || 'UNKNOWN').track.push(t)
  for (const it of view.sheet?.items ?? []) ensure(traceOf(it)).items.push(it)
  for (const g of groups.values()) {
    const cov = view.coverage?.[g.key]
    if (cov !== undefined) g.cov = cov
  }
  return [...groups.values()]
}

/**
 * 成行（D-10 返工的主口径）：`frMap` 有值 → **按 FR 成行**——
 *   ① FR 行集合 = `fr_to_design ∪ fr_to_tasks ∪ fr_to_tests` 的键，按 FR 编号数值升序；
 *   ② 每 FR 行挂该 FR 名下的验收项（sheet 项按 `rtmTraceIdOf(source)` 命中
 *      `fr_to_tasks` / `fr_to_tests` 归入，tracking 行同键同归）——**成员语义**：
 *      一项命中几个 FR 就在几行的状态/怎么验里算数（原型同口径，共享任务不丢在别处）；
 *      但它的**裁决控件只在首个命中行铺一份**（`controlItems`，见 `PanelRow` 注）；
 *   ③ 覆盖链三态 = 该 FR 在不在三张映射里（三张独立判定，不互相补位）；
 *   ④ **归不进任何 FR 的项**（需求级 REQ-LEVEL、prototype/decision 对照项、孤立追溯键）
 *      按追溯键另起「需求级 / 对照项」行，附在 FR 行之后——**不丢**。
 *
 * `frMap` 缺省 / 三张映射全空 → 退回逐项平铺（`traceRowsOf`，老路径零变化）。
 */
export function rowsOf(view: VerifyView): PanelRow[] {
  const frMap = view.frMap
  if (frMap === undefined) return traceRowsOf(view)
  const keys = [...new Set([
    ...Object.keys(frMap.fr_to_design ?? {}),
    ...Object.keys(frMap.fr_to_tasks ?? {}),
    ...Object.keys(frMap.fr_to_tests ?? {}),
  ])].sort(frOrder)
  if (keys.length === 0) return traceRowsOf(view)

  const rows: PanelRow[] = keys.map((fr) => ({
    key: fr,
    kind: 'fr' as const,
    items: [],
    track: [],
    cov: {
      design: Object.hasOwn(frMap.fr_to_design ?? {}, fr),
      tasks: Object.hasOwn(frMap.fr_to_tasks ?? {}, fr),
      tests: Object.hasOwn(frMap.fr_to_tests ?? {}, fr),
    },
  }))
  const chains = new Map(keys.map(fr => [fr, chainOf(frMap, fr)]))
  const ownersOf = (trace: string): PanelRow[] => rows.filter(r => chains.get(r.key)!.has(trace))

  // 对照项行：按追溯键开桶（首次出现序），行位在 FR 行之后
  const aux = new Map<string, PanelRow>()
  const ensureAux = (trace: string): PanelRow => {
    let r = aux.get(trace)
    if (r === undefined) {
      r = { key: trace, kind: 'aux', items: [], track: [], source: auxSourceOf(trace, undefined) }
      aux.set(trace, r)
    }
    return r
  }
  for (const t of view.tracking ?? []) {
    const key = str(t.fr_id) || 'UNKNOWN'
    const owners = ownersOf(key)
    // tracking 也走成员语义：命中的每个 FR 行都铺它的「怎么验/状态」；都不命中才进对照项组
    if (owners.length === 0) ensureAux(key).track.push(t)
    else for (const owner of owners) owner.track.push(t)
  }
  /** 逐项 → 该铺它裁决控件的行（首个命中的 FR 行 / 它所在的对照项行，按行序取首个）。 */
  const controlRow = new Map<VerificationItem, PanelRow>()
  for (const it of view.sheet?.items ?? []) {
    const trace = traceOf(it)
    const owners = ownersOf(trace)
    if (owners.length > 0) {
      for (const owner of owners) owner.items.push(it)
      controlRow.set(it, owners[0])
      continue
    }
    const r = ensureAux(trace)
    r.items.push(it)
    r.source = auxSourceOf(trace, it)
    controlRow.set(it, r)
  }
  // 裁决控件归属：待裁决项只在它那一行铺控件，别行指路（成员语义下的去重，见 PanelRow 注）。
  // 只要本行有未裁决项就把 `controlItems` 置位（**可能是空集**：本行的待裁决项全归别行铺），
  // 否则渲染侧会把「没置位」读成「本行全铺」，共享项又长出第二份控件。
  for (const r of [...rows, ...aux.values()]) {
    const pending = r.items.filter(i => {
      const st = str(i.status)
      return st === 'pending' || st === 'unverified'
    })
    if (pending.length === 0) continue
    const controls = new Set<VerificationItem>()
    const foreign = new Map<VerificationItem, string>()
    for (const it of pending) {
      const owner = controlRow.get(it)
      if (owner === undefined || owner === r) controls.add(it)
      else foreign.set(it, owner.key)
    }
    r.controlItems = controls
    if (foreign.size > 0) r.foreignControls = foreign
  }
  return [...rows, ...aux.values()]
}

/**
 * 「未复核」这一段文案的**唯一字面量**（REQ-261006201920-2adc FR-3 / 验收 ⑤）。
 *
 * 行级 chip（`ROW_STATUS_TEXT`）与逐项徽标（`ITEM_STATUS_TEXT`）是两个粒度的两套映射，但
 * **同一个状态必须是同一句话**——各写一份就等着它们某天分叉（本仓「两处各写一份」的老账）。
 */
const UNVERIFIED_TEXT = '未复核'

/** 行状态 chip 文案（✓/✗ 与裁决符号都是**真实文本字符**，不靠 CSS 伪元素冒充）。 */
const ROW_STATUS_TEXT: Readonly<Record<RowStatus, string>> = {
  pass: '✅ 通过',
  fail: '✖ 不通过',
  pending: '⏳ 待裁决',
  unverified: UNVERIFIED_TEXT,
  nv: '不可验收',
}

/**
 * 逐项裁决状态 chip（行展开里用；与行状态同口径，未裁决两态分开写清）。
 * 导出是为了让用例能断言「未复核」不是另造的第二份文案。
 */
export const ITEM_STATUS_TEXT: Readonly<Record<string, string>> = {
  passed: '✅ 通过',
  failed: '✖ 不通过',
  pending: '⏳ 待裁决',
  unverified: UNVERIFIED_TEXT,
  not_verifiable: '不可验收',
}

/* ────────────────────────────────────────────────────────────── 小工具 */

/** 裁决人 → 「谁判的」（含窗口码；缺省各有说辞，不留白）。 */
function byText(by: ActorRef | undefined): string {
  if (by === undefined || by === null) return '未记录裁决人'
  const kind = by.kind === 'human' ? '人（human）'
    : by.kind === 'agent' ? 'agent'
      : by.kind === 'system' ? '系统（system）' : ('未知操作者（' + String(by.kind) + '）')
  const sid = by.sessionId
  return sid === undefined || sid.length === 0 ? kind : kind + ' · ' + windowCodeFromSessionId(sid)
}

/** 时间格：缺了要有说辞，不渲染 "NaN-NaN"。 */
function timeText(raw: unknown): string {
  const t = num(raw)
  return t === undefined ? '未记录时间' : fmtTime(t)
}

/** 怎么验文本（`howToVerify` 缺省回落 criterion——与 accept-sheet-rtm-integration 同口径）。 */
function verifyTextOf(item: VerificationItem): string {
  return str(item.howToVerify).trim() || str(item.criterion)
}

/** 来源标（行展开逐项用）：可读文本 + 原始枚举（`data-verify-source`，审计与断言都认得出）。 */
function sourceTagOf(item: VerificationItem): { kind: string; label: string } {
  const s = item.source
  const kind = s !== null && typeof s === 'object' && typeof (s as { kind?: unknown }).kind === 'string'
    ? (s as { kind: string }).kind
    : 'unknown'
  switch (s?.kind) {
    case 'task': return { kind, label: 'task ' + s.taskId }
    case 'requirement': return { kind, label: 'requirement' }
    case 'prototype-compare': return { kind, label: 'prototype-compare' }
    case 'decision-compare': return { kind, label: 'decision-compare' }
    default: return { kind, label: '未知来源（' + kind + '）' }
  }
}

/** 覆盖链 chip：覆盖=绿底「设计 ✓」、缺=灰底描边「测试 ✗」（✓/✗ 真实文本）。 */
function covChip(key: 'design' | 'tasks' | 'tests', label: string, ok: boolean): string {
  return '<span class="dsh-pm-cov" data-cov="' + key + '" data-cov-ok="' + (ok ? 'yes' : 'no') + '">'
    + esc(label + (ok ? ' ✓' : ' ✗')) + '</span>'
}

/* ──────────────────────────────── ③-0 覆盖控件（REQ-261006201920-2adc FR-3 · 两处渲染共用） */

/** 截断（与 stage-panel 同口径：防长文本挤爆布局）。 */
const clipText = (s: string, max: number): string => (s.length > max ? s.slice(0, max) + '…' : s)

/**
 * 该行在**服务端**会不会被要求写变更理由 —— 与 `verdicts.ts` 的覆盖条件**同构**（单一判据，两处一致）。
 *
 * 条件：非系统缺口项（系统项写的是处置）、非「只能人看」项（它的 result 只是参照材料）、
 * 且已有非空实测结果（有东西可被覆盖）。
 *
 * 两侧同构是刻意的：若 UI 不问而服务端要，人会在提交那一刻撞上 400 而不知道为什么。
 */
export function isOverrideCandidate(item: VerificationItem): boolean {
  if (item.needsHuman === true) return false
  if (isSystemItem({ gapKind: item.gapKind, criterion: str(item.criterion) })) return false
  return str(item.result).trim().length > 0
}

/**
 * 变更理由输入（FR-3 / D-3）——**两处渲染的唯一实现**（禁止复制粘贴）。
 *
 * 初始 `hidden`：人真的改动了预填值才由收集侧展开并置必填（`board-mount` 的就地守卫）；
 * 服务端另有权威校验（缺理由 → `result_change_reason_required` 且台账零改动）。
 */
export function changeReasonControl(item: VerificationItem): string {
  if (!isOverrideCandidate(item)) return ''
  const id = str(item.id)
  const lb = 'cr-' + id
  return '<div class="dsh-pm-vitem-reason" data-role="reason-wrap" hidden>'
    + '<span class="dsh-pm-hint" id="' + esc(lb) + '">变更理由（必填：为什么覆盖 agent 原文）</span>'
    + '<input type="text" class="dsh-pm-vitem-change-reason" aria-labelledby="' + esc(lb) + '"'
    + ' placeholder="你改了 agent 的实测原文，写清为什么改">'
    + '</div>'
}

/**
 * 被覆盖的 agent 原文留存展示（FR-3）——原文**不丢**，带 `data-superseded="1"` 供用例与样式定位。
 * 无覆盖（`resultSuperseded` 缺省）时不渲染任何东西（旧台账读侧零变化）。
 */
export function supersededLine(item: VerificationItem): string {
  const old = str(item.resultSuperseded).trim()
  if (old.length === 0) return ''
  const why = str(item.resultChangeReason).trim()
  return '<div class="dsh-pm-vitem-superseded" data-superseded="1">原实测结果（已被覆盖）：'
    + esc(clipText(old, 200))
    + (why.length > 0 ? ' · 变更理由：' + esc(clipText(why, 200)) : '')
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ③ 待裁决控件（复用既有 action） */

/**
 * 待裁决项的「通过/不通过」控件（纪律④）：与 stage-panel 验收单逐项**同一条**收集链——
 * board-mount `case 'submit-verdicts'` 从 `.dsh-pm-vsheet` 里逐 `.dsh-pm-vitem[data-item-id]`
 * 读「选中的单选 + `.dsh-pm-vitem-opinion` 的值」。预填规则也同口径：
 * needsHuman 项**不预填**（判定依据在人眼里）；其余有 `result` 的项预填**原文**
 * （value 与台账逐字节相同，改动即记人工填写）。
 */
function verdictControls(item: VerificationItem): string {
  const id = str(item.id)
  const needsHuman = item.needsHuman === true
  const result = str(item.result)
  const opinionInput = needsHuman
    ? '<input type="text" class="dsh-pm-vitem-opinion" placeholder="未自动验证：请写你看到的界面事实（通过必填）">'
    : (result.trim().length > 0
      ? '<input type="text" class="dsh-pm-vitem-opinion is-prefilled" value="' + esc(result) + '"'
        + ' placeholder="已预填 agent 实测结果；改动即记为人工填写">'
      : '<input type="text" class="dsh-pm-vitem-opinion" placeholder="通过可留空（无实测结果则记未复核） / 不通过填意见（必填）">')
  return '<div class="dsh-pm-vitem dsh-pm-rtm-vitem" data-item-id="' + esc(id) + '"'
    + (needsHuman ? ' data-needs-human="1"' : '')
    + (isOverrideCandidate(item) ? ' data-override-candidate="1"' : '') + '>'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(id) + '</code>'
    + '<label class="dsh-pm-verdict-btn"><input type="radio" name="verdict-' + esc(id) + '" value="passed"> 通过</label>'
    + '<label class="dsh-pm-verdict-btn"><input type="radio" name="verdict-' + esc(id) + '" value="failed"> 不通过</label>'
    + opinionInput
    // REQ-261006201920-2adc FR-3：覆盖候选行带理由输入；已覆盖过的行展示被取代的原文
    + changeReasonControl(item)
    + supersededLine(item)
    + '</div>'
}

/** 已裁决项的一行留痕：时间 + 人 + 意见（缺哪个说哪个，不留白）。 */
function judgeLine(item: VerificationItem): string {
  const opinion = str(item.opinion).trim()
  return '<div class="dsh-pm-rtm-judge">'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(str(item.id)) + '</code> '
    + esc(timeText(item.decidedAt)) + ' · ' + esc(byText(item.decidedBy))
    + (opinion.length > 0 ? ' · 意见：' + mdInline(opinion) : ' · <span class="dsh-pm-hint">无意见（裁决时未写）</span>')
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ④ 行展开（原生 details） */

/** 行展开里的一条验收项：标准 / 实际结果 / 需人工（含原因）/ 证据 / 意见，逐项铺开。 */
function detailItem(item: VerificationItem): string {
  const status = str(item.status)
  const src = sourceTagOf(item)
  const needsHuman = item.needsHuman === true
  const reason = str(item.humanReason).trim()
  const result = str(item.result).trim()
  const resultSrc = item.resultSource === 'agent' ? 'agent 实测'
    : item.resultSource === 'human' ? '人工填写' : '未标注来源'
  const evidence = Array.isArray(item.evidence) ? item.evidence.filter(e => typeof e === 'string') : []
  const opinion = str(item.opinion).trim()
  return '<div class="dsh-pm-rtm-item" data-item-id="' + esc(str(item.id)) + '"'
    + ' data-verify-source="' + esc(src.kind) + '"'
    + (needsHuman ? ' data-needs-human="1"' : '') + '>'
    + '<div class="dsh-pm-rtm-item-head">'
    + '<code class="dsh-pm-rtm-vitem-id">' + esc(str(item.id)) + '</code> '
    + '<span class="dsh-pm-src-tag" data-source-kind="' + esc(src.kind) + '">' + esc(src.label) + '</span> '
    + '<span class="dsh-pm-verdict" data-v="' + esc(status) + '">'
    + esc(ITEM_STATUS_TEXT[status] ?? ('未知裁决：' + status)) + '</span>'
    + (needsHuman ? ' <span class="dsh-pm-nh-flag">无法自验·需人工</span>' : '')
    + '</div>'
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">标准：</span>' + mdInline(str(item.criterion)) + '</div>'
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">实际结果（' + esc(resultSrc) + '）：</span>'
    + (result.length > 0 ? mdInline(result) : '<span class="dsh-pm-hint">尚无实测结果</span>') + '</div>'
    + (needsHuman
      ? '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">需人工：</span>'
        + (reason.length > 0 ? mdInline(reason) : '<span class="dsh-pm-hint">未写原因</span>') + '</div>'
      : '')
    + '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">证据：</span>'
    + (evidence.length > 0
      ? '<ul class="dsh-pm-evidence">' + evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      : '<span class="dsh-pm-hint">未提供证据</span>') + '</div>'
    + (opinion.length > 0
      ? '<div class="dsh-pm-rtm-item-line"><span class="dsh-pm-hint">意见：</span>' + mdInline(opinion) + '</div>'
      : '')
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ⑤ RTM 主表 */

/**
 * RTM 验收追踪列表（`data-rtm-table="1"`）：**每 FR 一行** `tr[data-fr="FR-1"]`（D-10 返工），
 * 行后跟一行原生 details 展开（`data-fr-detail`）；归不进任何 FR 的项另起一组
 * 「需求级 / 对照项」行（`data-fr-group="aux"`，行键 = 追溯键）排在 FR 行之后。
 *
 * 覆盖链列在 `frMap` 有值（或降级路径下 `coverage` 有值）时整列渲染；两者都没有 → 整列不渲染
 * （纪律③：无 RTM 不画假覆盖）。
 */
export function renderRtmTable(view: VerifyView, reqId: string): string {
  const sheet = view.sheet
  if (sheet === undefined || sheet.items.length === 0) return ''
  const rows = rowsOf(view)
  if (rows.length === 0) return ''
  const mapMode = view.frMap !== undefined
  const withCoverage = mapMode || view.coverage !== undefined
  const cols = withCoverage ? 5 : 4
  const colgroupNote = withCoverage ? '' : ' data-rtm-fallback="1"'

  const body = rows.map((r) => {
    const st = statusOf(r)
    const n = r.items.length > 0 ? r.items.length : r.track.length
    const needsHuman = r.items.some(i => i.needsHuman === true)
    const nvCount = r.items.filter(i => str(i.status) === 'not_verifiable').length
    // 怎么验：一组多项时逐项拼接（一行截断 + title 全文，截断交给 CSS，文本不丢字）
    const verifyTexts = r.items.length > 0
      ? r.items.map(verifyTextOf).filter(t => t.trim().length > 0)
      : r.track.map(t => str(t.verification)).filter(t => t.trim().length > 0)
    const verifyFull = verifyTexts.join('；')
    const pendingItems = r.items.filter(i => str(i.status) === 'pending' || str(i.status) === 'unverified')
    const decidedItems = r.items.filter(i => str(i.status) !== 'pending' && str(i.status) !== 'unverified')

    // 覆盖链格：FR 行取三张映射的在场判定；「需求级 / 对照项」行不在任何 FR 链里，如实说明
    const covCell = !withCoverage ? ''
      : '<td class="dsh-pm-rtm-cov">'
        + (r.kind === 'aux'
          ? '<span class="dsh-pm-hint">需求级 / 对照项：不在任何 FR 追溯链里</span>'
          : (r.cov !== undefined
            ? covChip('design', '设计', r.cov.design)
              + covChip('tasks', '任务', r.cov.tasks)
              + covChip('tests', '测试', r.cov.tests)
            : '<span class="dsh-pm-hint">无该 FR 的追溯记录</span>'))
        + '</td>'
    const verdictCell = '<td class="dsh-pm-rtm-verdict-cell">'
      + '<span class="dsh-pm-verdict" data-v="' + st + '">' + esc(ROW_STATUS_TEXT[st]) + '</span>'
      // 多子项取最严重状态后，把「几项」如实跟在状态后面（原型无计数，这一格是审计锚点）
      + (n > 1 ? ' <span class="dsh-pm-hint" data-item-count="' + String(n) + '">' + String(n) + ' 项</span>' : '')
      + (needsHuman ? ' <span class="dsh-pm-nh-flag">无法自验·需人工</span>' : '')
      + (st === 'pass' && nvCount > 0
        ? ' <span class="dsh-pm-hint">含 ' + String(nvCount) + ' 项不可验收</span>'
        : '')
      + '</td>'
    // 裁决 · 意见格：已裁决项留痕 + 待裁决项控件。成员语义下同一项可能命中多个 FR 行，
    // 控件只在它那一行铺一份（别行给一句指路），免得人对着一行勾选、在另一行写意见——
    // 提交时收集链读的是**勾中那一行**的意见框，会判成「没写」。
    const ownedPending = pendingItems.filter(i => r.controlItems === undefined || r.controlItems.has(i))
    const foreignPending = pendingItems.filter(i => r.controlItems !== undefined && !r.controlItems.has(i))
    const judgeCell = '<td class="dsh-pm-rtm-judge-cell">'
      + decidedItems.map(judgeLine).join('')
      + ownedPending.map(verdictControls).join('')
      + foreignPending.map(i =>
        '<div class="dsh-pm-rtm-judge"><code class="dsh-pm-rtm-vitem-id">' + esc(str(i.id)) + '</code> '
        + '<span class="dsh-pm-hint">该待裁决项的裁决控件在 '
        + esc(r.foreignControls?.get(i) ?? '首个命中') + ' 行（同一项不重复铺控件）</span></div>').join('')
      + (decidedItems.length === 0 && pendingItems.length === 0
        ? '<span class="dsh-pm-hint">'
          + (r.kind === 'aux' ? '该组没有逐项（仅 RTM 追踪记录）' : '该 FR 在验收单里没有逐项（仅 RTM 追踪记录）')
          + '</span>'
        : '')
      + '</td>'

    // FR 格（原型 `#tab-verify` 的「编号 + 名称」）：行首展开指示符 + 编号（等宽主标识）
    // + **名称**（`frNames` 里**有才渲染**——缺省只留编号，前端绝不编名称，见模块头注）
    // + 对照项行的来源标（对照项行键是追溯 id，不是 FR 号，故不挂名称）
    const frName = r.kind === 'fr' ? (view.frNames?.[r.key] ?? '') : ''
    const frCell = '<td class="dsh-pm-rtm-fr">'
      + '<span class="dsh-pm-rtm-toggle" data-rtm-toggle="1" aria-hidden="true">▸</span>'
      + '<span class="dsh-pm-rtm-fr-id">' + esc(r.key) + '</span>'
      + (frName.length > 0
        ? '<span class="dsh-pm-rtm-name" data-fr-name="' + esc(frName) + '"'
          + ' title="' + esc(frName) + '">' + esc(frName) + '</span>'
        : '')
      + (r.kind === 'aux' && r.source !== undefined
        ? ' <span class="dsh-pm-src-tag" data-source-kind="' + esc(r.source.kind) + '"'
          + ' title="' + esc(r.source.kind) + '">' + esc(r.source.label) + '</span>'
        : '')
      + '</td>'

    const mainRow = '<tr data-fr="' + esc(r.key) + '" data-fr-status="' + st + '"'
      + (r.kind === 'aux' ? ' data-fr-group="aux"' : '') + '>'
      + frCell
      + covCell
      + '<td class="dsh-pm-rtm-ver"'
      + (verifyFull.length > 0 ? ' title="' + esc(verifyFull) + '"' : '') + '>'
      + (verifyFull.length > 0 ? mdInline(verifyFull) : '<span class="dsh-pm-hint">未写验收方法</span>')
      + '</td>'
      + verdictCell
      + judgeCell
      + '</tr>'
    // 行展开：原生 details（默认收起），逐项的实际结果 / 需人工+原因 / 证据全在里面
    const detailRow = '<tr class="dsh-pm-rtm-detail-row"><td colspan="' + String(cols) + '">'
      + '<details class="dsh-pm-rtm-detail" data-fr-detail="' + esc(r.key) + '">'
      + '<summary>逐项明细（' + String(n) + ' 项）：实际结果 / 需人工 / 证据</summary>'
      + (r.items.length > 0
        ? r.items.map(detailItem).join('')
        : '<div class="dsh-pm-hint">该组只有 RTM 追踪记录，验收单里没有逐项可铺。</div>')
      + '</details></td></tr>'
    return mainRow + detailRow
  }).join('')

  // 汇总行：a/b 通过 · c 待裁决 · d 不通过（待裁决 = 含 pending/unverified 的行，纪律⑤）
  // b = **行集合**（FR 行 + 需求级/对照项行）——三数覆盖每一行，不把对照项排除在统计外。
  const failed = rows.filter(r => statusOf(r) === 'fail').length
  const pendingRows = rows.filter(r => statusOf(r) === 'pending' || statusOf(r) === 'unverified').length
  const passed = rows.length - failed - pendingRows
  const auxRows = rows.filter(r => r.kind === 'aux').length
  const version = sheet.version
  const versionChip = '<span class="dsh-pm-chip"'
    + (version !== undefined ? ' data-sheet-version="' + String(version) + '"' : '') + '>'
    + esc('验收单 ' + (version !== undefined ? 'v' + String(version) : '版本未记录')
      + (sheet.reworkOnly ? ' · 返工续验只含未过项' : ''))
    + '</span>'
  const pendingChip = view.pendingCount !== undefined
    ? '<span class="dsh-pm-chip" data-pending-count="' + String(view.pendingCount) + '">'
      + '待裁决 ' + String(view.pendingCount) + ' 项</span>'
    : ''
  /**
   * 降级说明（三态，与改造前逐字相同）：
   *   · frMap 在 → 覆盖链列由三张映射直接得出，没有降级可报；
   *   · 无 frMap 且无 tracking → RTM 整层缺失；
   *   · 有 tracking 无 coverage → 只有覆盖链那一段缺失。
   */
  const fallbackNote = mapMode
    ? ''
    : (view.tracking === undefined
      ? '<span class="dsh-pm-hint">RTM 追踪缺失：覆盖链不显示（增强层降级，逐项裁决不受影响）</span>'
      : (withCoverage ? '' : '<span class="dsh-pm-hint">覆盖链数据缺失：该列不显示（增强层降级）</span>'))
  const anyPending = sheet.items.some(i => str(i.status) === 'pending' || str(i.status) === 'unverified')
  const submitBar = anyPending
    ? (version !== undefined
      ? '<div class="dsh-pm-rtm-submit">'
        + '<button type="button" class="dsh-pm-btn sm primary" data-action="submit-verdicts"'
        + ' data-req="' + esc(reqId) + '" data-version="' + String(version) + '">提交裁决</button>'
        + '<span class="dsh-pm-hint">逐项选「通过 / 不通过」后提交：不通过须写意见；「无法自验·需人工」项通过须写你看到的实测。</span>'
        + '</div>'
      : '<div class="dsh-pm-rtm-submit"><span class="dsh-pm-hint">验收单版本号缺失（台账脏数据）：'
        + '逐项裁决暂不可用，请走会话内 reqboard_accept_sheet 裁决。</span></div>')
    : ''

  const head = '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">RTM 验收追踪 · 每 FR 一行</span>'
    + '<span class="dsh-pm-hint">生成于 ' + esc(timeText(sheet.generatedAt))
    + ' · 覆盖链 = 设计→任务→测试（RTM 增强层）</span></div>'
  const progress = '<div class="dsh-pm-rtm-progress" data-rtm-progress="1">'
    + '<span>FR 验收进度 <b>' + String(passed) + '/' + String(rows.length) + '</b> 通过'
    + ' · <b>' + String(pendingRows) + '</b> 待裁决'
    + ' · <b>' + String(failed) + '</b> 不通过'
    + (auxRows > 0 ? ' · 其中需求级 / 对照项 <b>' + String(auxRows) + '</b> 行' : '')
    + '</span>'
    + versionChip + pendingChip + fallbackNote
    + '</div>'
  const table = '<table class="dsh-pm-docs-table dsh-pm-rtm-table" data-rtm-table="1"'
    + ' data-rtm-cols="' + String(cols) + '"'
    + ' data-fr-mode="' + (mapMode ? 'map' : 'trace') + '"' + colgroupNote + '>'
    + '<thead><tr><th>FR</th>'
    + (withCoverage ? '<th>覆盖链（设计→任务→测试）</th>' : '')
    + '<th>怎么验</th><th>验收状态</th><th>裁决 · 意见</th></tr></thead>'
    + '<tbody>' + body + '</tbody></table>'
  // .dsh-pm-vsheet 是既有 submit-verdicts 收集链的作用域（纪律④）：整表一份，提交按钮收全部行
  return '<div class="dsh-pm-block" data-verify-section="rtm">'
    + '<div class="dsh-pm-vsheet" data-req="' + esc(reqId) + '"'
    + (version !== undefined ? ' data-version="' + String(version) + '"' : '') + '>'
    + head + progress + table + submitBar
    + '</div></div>'
}

/* ────────────────────────────────────────────────────────────── ⑥ 材料 / 历史 / 空态 */

/** 验收材料：交付结论 + 证据清单（来自 `materials`；没有就如实说，不编）。 */
function materialsSection(view: VerifyView): string {
  const m = view.materials
  if (m === undefined) {
    return '<div class="dsh-pm-block" data-verify-materials="1">'
      + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">验收材料</span>'
      + '<span class="dsh-pm-hint">服务端未给材料摘要（materials 缺省）</span></div></div>'
  }
  return '<div class="dsh-pm-block" data-verify-materials="1">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">验收材料</span>'
    + '<span class="dsh-pm-hint">交付结论 + 证据清单</span></div>'
    + (m.summary !== undefined
      ? '<p class="dsh-pm-ver-sum"><b>交付结论：</b>' + mdInline(m.summary) + '</p>'
      : '<p class="dsh-pm-ver-sum"><span class="dsh-pm-hint">未写交付结论（提交材料里没有 summary）</span></p>')
    + (m.evidence.length > 0
      ? '<ul class="dsh-pm-ev-list" data-verify-evidence="1">'
        + m.evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      : '<div class="dsh-pm-hint">未附证据清单（evidence 为空）</div>')
    + '</div>'
}

/** 一行历史版本：版本 + 主导状态 chip + 生成时间 + 逐项计数（不编「已退回」——payload 没有审核结论字段）。 */
function historyRow(s: VerifyView['history'][number]): string {
  const items = s.items
  const passed = items.filter(i => str(i.status) === 'passed').length
  const failed = items.filter(i => str(i.status) === 'failed').length
  const pending = items.filter(i => str(i.status) === 'pending' || str(i.status) === 'unverified').length
  const nv = items.filter(i => str(i.status) === 'not_verifiable').length
  const dominant: RowStatus = failed > 0 ? 'fail' : pending > 0 ? 'pending' : items.length > 0 ? 'pass' : 'nv'
  const counts: string[] = []
  if (passed > 0) counts.push(String(passed) + ' 通过')
  if (failed > 0) counts.push(String(failed) + ' 不通过')
  if (pending > 0) counts.push(String(pending) + ' 待裁决')
  if (nv > 0) counts.push(String(nv) + ' 不可验收')
  return '<div class="dsh-pm-hist-row"'
    + (s.version !== undefined ? ' data-history-version="' + String(s.version) + '"' : '') + '>'
    + '<span class="dsh-pm-h-ver">' + esc(s.version !== undefined ? 'v' + String(s.version) : 'v?') + '</span>'
    + (items.length > 0
      ? '<span class="dsh-pm-verdict" data-v="' + dominant + '">' + esc(ROW_STATUS_TEXT[dominant]) + '</span>'
      : '<span class="dsh-pm-hint">无逐项</span>')
    + '<span class="dsh-pm-h-note">' + esc(timeText(s.generatedAt))
    + (counts.length > 0 ? ' · ' + esc(counts.join(' · ')) : '')
    + (s.reworkOnly ? ' · 返工续验只含未过项' : '')
    + '</span></div>'
}

/** 历史版本节：验收单每次提交一个版本，驳回留痕不丢；没有历史就如实一句。 */
function historySection(view: VerifyView): string {
  return '<div class="dsh-pm-block" data-verify-history="1">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">历史版本</span>'
    + '<span class="dsh-pm-hint">验收单每次提交一个版本，旧版逐项留痕</span></div>'
    + (view.history.length > 0
      ? view.history.map(historyRow).join('')
      : '<div class="dsh-pm-hint">无历史版本（验收单只有当前一版，或还没提交过）</div>')
    + '</div>'
}

/** 空态两分支（纪律⑥）：沿用 docs 核验节删除前的文案口径，不画空表格。 */
function emptySection(view: VerifyView): string {
  if (view.sheet === undefined) {
    return '<div class="dsh-pm-empty dsh-pm-verify-empty" data-verify-empty="1">'
      + '<div class="dsh-pm-ve-row"><b>没交</b><span>尚未提交验收材料——这不是缺失，是流程还没走到。</span></div>'
      + '<div class="dsh-pm-ve-row"><b>找谁交</b><span>由窗口 agent 用 '
      + '<code>reqboard_submit(kind=verification)</code> 提交：做了什么 + 怎么验的 + 看到什么结果。</span></div>'
      + '<div class="dsh-pm-ve-row"><b>交了会看到什么</b><span>这里按 FR 铺开 RTM 验收追踪列表'
      + '（每 FR 一行：覆盖链 / 怎么验 / 验收状态 / 裁决意见，行展开看逐项实际结果），'
      + '并给材料摘要、证据清单与历史版本。</span></div>'
      + '</div>'
  }
  return '<div class="dsh-pm-empty" data-verify-empty="1">'
    + '验收材料已提交，但验收单里没有逐项记录（没有逐项）'
    + '——这里不画空表格：没有逐项就没有可裁决的东西。</div>'
}

/* ────────────────────────────────────────────────────────────── 入口 */

/** 验收面板正文（纯字符串、零副作用：取数归壳，点击归 board-mount 既有委派）。 */
function renderVerify(data: unknown, ctx: ReportTabCtx): string {
  const view = readVerify(data)
  const empty = view.sheet === undefined || view.sheet.items.length === 0
  return '<section class="dsh-pm-verify" data-panel="verify">'
    + (empty ? emptySection(view) : renderRtmTable(view, ctx.requirementId))
    // 空态两分支都不许出现 <table>（纪律⑥）：材料 / 历史一律列表与行，不用表格
    + (view.sheet === undefined && view.materials === undefined ? '' : materialsSection(view))
    + historySection(view)
    + '</section>'
}

export const verifyPanel: PanelShape & { key: 'verify' } = {
  key: 'verify',
  label: '验收',
  // 角标 = 待裁决项数（pending + unverified），服务端数好（`tabCounts.verify`，
  // 与 `VerifyPanelResponse.pendingCount` / `outcome.pendingItems` 同口径单点）；
  // 无验收单 = 字段缺省 → 不渲染角标（禁 '0' 冒充「还没验收」）。
  badge: (report) => report?.tabCounts?.verify,
  render: (data, ctx) => renderVerify(data, ctx),
  // 旧服务端（没有 /verify 端点）不是"加载失败"：给去向，不给重试假象；
  // 其余降级原因走通用四句（不吞 note）。
  degraded: (d) => d.reason === 'port-unavailable' ? VERIFY_OLD_SERVER_TEXT : degradeText(d),
}
