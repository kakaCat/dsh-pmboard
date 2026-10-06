/**
 * 原型三门（REQ-261005105032-3b02 FR-1 / FR-3 / FR-4）——「UI 需求需求阶段必交原型」的机器判据。
 *
 * 本模块**只做取数 + 组装**（读 requirement.md / prototypes/INDEX.md / 权威原型 HTML），判定一律下沉
 * 零 IO 纯函数：parsePrototypeMetadata（锚点 + 观测块）、parsePrototypeIndex（INDEX 表格）、
 * prototypeExemptOf（豁免是否生效）、toReqRelative（路径口径）——门禁要 IO 不可单测，纯函数可逆验证
 * （人为改坏必红）。**不聚合**成 assertPrototypeGates（§10 #22）：聚合点留在既有同步单点
 * assertArtifactGates 与 contentGatesForMove（#46），本模块只给三个可独立断言的门。
 *
 * 路径口径（§10 #2）：INDEX「路径」列与文档引用**一律需求目录相对**（`prototypes/x.html`），比对前统一
 * 走 normalizeArtifactPath（toReqRelative）。拒绝文案走既有信封（envelope），`how` 必含可执行锚点
 * （GATE_HOW_ANCHOR：reqboard_submit(kind=prototype) / templates/… / prototype_exempt）。
 *
 * @module dsh-pmboard/application/internal/prototype-gates
 */
import type { RequirementRecord, StageArtifact } from '../../shared/protocol.js'
import { normalizeArtifactPath } from '../../domain/artifact/ArtifactPath.js'
import { fmt } from '../../domain/text/fmt.js'
import type { GateFailure } from './artifact-gates.js'
import { collectIds, naturalSort, parseDocument, type DocsReader, type ParsedDoc } from './content-gates.js'
import { conditionalStageArtifactsFor, designDocPolicyFrom } from './category-doc-sets.js'
import { envelope } from './gate-feedback.js'
import { prototypePresenceGaps, registeredPrototypesOf } from './prototype-registration.js'

// ── 纯函数：proto-geometry / FR 锚点抽取（零 IO，无第三方依赖） ─────────────────
/** 几何量单位闭值域（§10 #5）。 */
export type GeometryUnit = 'px' | 'count' | 'ratio'
/** 观测条件里的页面态闭值域（§10 #5）。 */
export type GeometryState = 'inflight' | 'terminal'
/** FR 锚点（形状与 §10 #41 的 prototypeMeta.anchors 元素逐字一致）。 */
export interface ProtoAnchor { fr: string; selector: string }

/** 一条观测量：name 块内唯一、value = 实测值、at 显式给窗口宽与页面态（§10 #5/#8）。 */
export interface ProtoObservation {
  name: string
  value: number
  unit: GeometryUnit
  /** 测量条件：窗口宽 + 页面态（须显式传入，避免量错）、来源（缺省 prototype，人给标 human） */
  at: { width: number; state: GeometryState }
  source?: 'prototype' | 'human'
}

/** parsePrototypeMetadata 的结果。 */
export interface PrototypeMetadata {
  anchors: ProtoAnchor[]
  /** 唯一那块 proto-geometry 的 observations（块数 ≠ 1 / 坏块时为空数组，不猜） */
  geometry: ProtoObservation[]
  /** `<!-- proto-geometry … -->` 注释块数（#4：必须恰好一块） */
  blocks: number
  /** 块内 JSON 解析错误（按「缺块」处理，绝不外抛打断登记） */
  parseError?: string
  /** 形状 / 值域 / 阈值违规（人读文案；锚点门据此拒） */
  violations: string[]
}

/**
 * 阈值禁用词表（D-10 / §3.3）：原型只放**观测量名 + 实测值**，阈值属设计决策。命中口径 = 键名
 * （小写）**包含**词表任一项——thresholds / maxWidth 这类"带前缀的阈值位"也得拦（只认全等会被
 * 绕过）；合法字段名（observations/name/value/unit/at/width/state/source）不含任一禁用词，不误伤。
 */
export const THRESHOLD_KEYS: readonly string[] = [
  'threshold', 'max', 'min', 'limit', 'expected', 'tolerance',
  'upper', 'lower', 'range', 'budget', 'target', 'pass', 'fail',
]

const ANCHOR_RE = /id\s*=\s*["'](FR-\d+)["']/g
const GEOMETRY_BLOCK_RE = /<!--\s*proto-geometry\s*([\s\S]*?)-->/g
const sorted = (items: readonly string[]): string[] => [...new Set(items)].sort()

/** 抽锚点 / 观测块并返回块数与解析错误（纯函数、零 IO，不引 HTML 解析库）。 */
export function parsePrototypeMetadata(html: string): PrototypeMetadata {
  const anchors: ProtoAnchor[] = []
  for (const m of html.matchAll(ANCHOR_RE)) {
    const fr = m[1]
    if (fr === undefined || anchors.some(a => a.fr === fr)) continue // 同号只记一次
    anchors.push({ fr, selector: '#' + fr })
  }
  const blocks = [...html.matchAll(GEOMETRY_BLOCK_RE)].map(m => (m[1] ?? '').trim())
  const violations: string[] = []
  let geometry: ProtoObservation[] = []
  let parseError: string | undefined
  let parsedOnce = false
  for (const raw of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      // G2：块内 JSON 坏 = 按「缺块」处理（记原因、不外抛——登记不该被坏块打断）
      if (parseError === undefined) parseError = e instanceof Error ? e.message : String(e)
      continue
    }
    collectThresholdKeys(parsed, violations) // 阈值扫描跑遍每一块，坏块不能借"不影响第一块"蒙过去
    if (!parsedOnce) {
      parsedOnce = true
      geometry = observationsOf(parsed, violations)
    }
  }
  return { anchors, geometry, blocks: blocks.length, ...(parseError !== undefined ? { parseError } : {}), violations: sorted(violations) }
}

/** 递归遍历 JSON 全部键（含嵌套），键名命中禁用词表即违规（D-10）。 */
function collectThresholdKeys(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectThresholdKeys(v, out)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [k, v] of Object.entries(value)) {
    const hit = THRESHOLD_KEYS.find(t => k.toLowerCase().includes(t))
    if (hit !== undefined) out.push(fmt('形状外字段：{key}（命中阈值禁用词「{hit}」，D-10 只许放观测量名与实测值）', { key: k, hit }))
    collectThresholdKeys(v, out)
  }
}

/** 把 `{observations:[…]}` 解析成逐条观测量；形状 / 值域违规写进 violations（§10 #5）。 */
function observationsOf(value: unknown, violations: string[]): ProtoObservation[] {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  const raw = obj?.['observations']
  if (!Array.isArray(raw) || raw.length === 0) {
    violations.push(obj === undefined
      ? 'proto-geometry 顶层不是 JSON 对象（形状见 design/data-model.md §3.1）'
      : (Array.isArray(raw) ? 'observations 为空数组（至少给一条观测量）' : '缺 observations 数组（形状见 design/data-model.md §3.1）'))
    return []
  }
  const out: ProtoObservation[] = []
  const seen = new Set<string>()
  raw.forEach((item, i) => {
    const at = 'observations[' + String(i) + ']'
    if (typeof item !== 'object' || item === null) {
      violations.push(at + ' 不是对象')
      return
    }
    const o = item as Record<string, unknown>
    const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') violations.push(at + ' 缺 name（观测量名，如 tabsTop）')
    else if (seen.has(name)) violations.push(fmt('observations[].name 块内重名：{name}（#5 要求块内唯一）', { name }))
    else seen.add(name)
    const value = o['value']
    if (typeof value !== 'number' || !Number.isFinite(value)) violations.push(at + ' 的 value 必须是有限数（实测值，不是阈值）')
    const unit = o['unit'] === 'px' || o['unit'] === 'count' || o['unit'] === 'ratio' ? o['unit'] : undefined
    if (unit === undefined) violations.push(at + ' 的 unit 值域外：' + String(o['unit']) + '（只认 px | count | ratio）')
    const cond = typeof o['at'] === 'object' && o['at'] !== null ? (o['at'] as Record<string, unknown>) : undefined
    const width = cond?.['width']
    if (typeof width !== 'number' || !(width > 0)) violations.push(at + ' 的 at.width 必须是正数（测量窗口宽须显式传入，避免量错）')
    const state = cond?.['state'] === 'inflight' || cond?.['state'] === 'terminal' ? cond['state'] : undefined
    if (state === undefined) violations.push(at + ' 的 at.state 值域外：' + String(cond?.['state']) + '（只认 inflight | terminal）')
    const src = o['source']
    const source = src === undefined || src === 'prototype' || src === 'human' ? src : undefined
    if (src !== undefined && source === undefined) violations.push(at + ' 的 source 值域外：' + String(src) + '（只认 prototype | human）')
    if (name === '' || typeof value !== 'number' || !Number.isFinite(value)
      || unit === undefined || typeof width !== 'number' || state === undefined) return
    out.push({ name, value, unit, at: { width, state }, ...(source === undefined ? {} : { source }) })
  })
  return out
}

// ── 纯函数：INDEX 表格 / 路径口径 / 豁免生效 ───────────────────────────────────
/** INDEX 一行（路径已归一为**需求目录相对**口径，§10 #2）。 */
export interface PrototypeIndexRow {
  path: string
  /** 原文小写化后的状态（值域判定在门里，未知值不静默当权威） */
  status: string
  serves: string[]
  supersededBy?: string
}

export interface PrototypeIndex {
  rows: PrototypeIndexRow[]
  gaps: string[] // 解析缺口（缺表 / 缺列 / 路径口径坏）：非空即版本门拒
}

/**
 * 解析 `prototypes/INDEX.md` 的那**一张**表格（列：路径 | 状态 | 服务条款 | 被取代于）。列名漂移
 * （尤其「服务条款」写成英文）按**缺列**处理并点名——宁可拒，不静默放行：锚点门要拿「服务条款」
 * 列判覆盖，静默缺列等于把锚点门关掉。
 */
export function parsePrototypeIndex(doc: ParsedDoc, reqId: string): PrototypeIndex {
  const table = doc.tables.find(t => t.header.some(h => h.includes('路径')) && t.header.some(h => h.includes('状态')))
  if (table === undefined) {
    return { rows: [], gaps: ['未找到「路径 | 状态 | 服务条款 | 被取代于」表格（INDEX 的唯一载体是一张 Markdown 表格）'] }
  }
  const col = (name: string): number => table.header.findIndex(h => h.includes(name))
  const iPath = col('路径')
  const iServes = col('服务条款')
  const iSuper = col('被取代于')
  const gaps: string[] = []
  if (iServes < 0) gaps.push('缺「服务条款」列（权威行必须声明服务哪些 FR，锚点门据此核覆盖）')
  const rows: PrototypeIndexRow[] = []
  table.rows.forEach((r, n) => {
    const rawPath = (r[iPath] ?? '').trim()
    if (rawPath === '') return // 空行不是一行
    const where = 'INDEX 第' + String(n + 2) + '行'
    const rel = toReqRelative(rawPath, reqId)
    if (rel === undefined) {
      gaps.push(fmt('{where}「路径」不是需求目录相对路径：{path}（口径如 prototypes/detail.html）', { where, path: rawPath }))
      return
    }
    const statusText = (r[col('状态')] ?? '').trim()
    const status = statusText.toLowerCase()
    if (status !== 'authoritative' && status !== 'superseded') {
      gaps.push(fmt('{where}「状态」值域外：{status}（只认 authoritative | superseded）', { where, status: statusText }))
    }
    const rawSuper = iSuper < 0 ? '' : (r[iSuper] ?? '').trim()
    const superRel = rawSuper === '' ? undefined : toReqRelative(rawSuper, reqId)
    rows.push({
      path: rel, status,
      serves: naturalSort(collectIds(r[iServes] ?? '').filter(id => /^FR-\d+$/.test(id))),
      ...(superRel === undefined ? {} : { supersededBy: superRel }),
    })
  })
  return { rows, gaps }
}

/** 把任意写法的路径归一为**需求目录相对**口径；伪路径 / 越界 / 含 `..` → undefined。 */
export function toReqRelative(raw: string, reqId: string): string | undefined {
  const norm = normalizeArtifactPath(raw, '/')
  if (norm.form === 'pseudo') return undefined
  // 需求 id 段前补 '/'：工作区相对与绝对路径两种写法走同一条切片逻辑
  const prefix = '/docs/requirements/' + reqId + '/'
  const marked = '/' + norm.path
  const at = marked.indexOf(prefix)
  const rel = at >= 0 ? marked.slice(at + prefix.length) : (norm.form === 'workspace' ? norm.path : undefined)
  // 切完仍可能剩 `..`（如 docs/requirements/<REQ>/../x.html）：它不是需求内的产物，拒之
  return rel === undefined || rel.split('/').includes('..') ? undefined : rel
}

const PROTOTYPE_PATH_RE = /(?:[\w.-]+\/)*prototypes?\/[\w.-]+\.html/g

/** 文档正文里出现的全部原型路径（原文形态，归一由调用方做）。 */
export function prototypePathsIn(text: string): string[] {
  return [...text.matchAll(PROTOTYPE_PATH_RE)].map(m => m[0])
}

/**
 * 豁免是否**生效**（D-13 / §5.2）：理由 trim 后非空 **且** requirement 产物已落章。两个条件缺一
 * 不可：理由可核验（人能读到写的是什么），落章才是"人已确认"——只认前者等于让 agent 自己给
 * 自己发豁免，门禁形同虚设。
 */
export function prototypeExemptOf(
  req: RequirementRecord,
  frontmatter: Readonly<Record<string, string>>,
): { active: boolean; reason: string } {
  const reason = (frontmatter['prototype_exempt'] ?? '').trim()
  if (reason === '') return { active: false, reason }
  const confirmed = (req.artifacts ?? []).some(a => a.kind === 'requirement' && a.confirmedAt !== undefined)
  return { active: confirmed, reason }
}

// ── 三门（取数 + 组装） ───────────────────────────────────────────────────────
const LEAD = 'brainstorming → design 推进未执行：'
const HOW_PROTOTYPE = 'templates/brainstorming/prototype.html'
const reqDir = (reqId: string): string => 'docs/requirements/' + reqId
const prototypeArtifactsOf = (req: RequirementRecord): StageArtifact[] => (req.artifacts ?? []).filter(a => a.kind === 'prototype')

interface GateContext { frontmatter: Record<string, string>; requirementText: string; applies: boolean }

/**
 * 读 requirement.md 并解析 front-matter（取数）。返回 undefined = 本需求不走原型门：存量需求
 * （artifacts 空/undefined）一律放行（不追溯存量，与既有门禁同口径）。
 */
async function contextOf(docs: DocsReader, req: RequirementRecord): Promise<GateContext | undefined> {
  if (req.artifacts === undefined || req.artifacts.length === 0) return undefined
  const reqPath = reqDir(req.id) + '/requirement.md'
  const requirementText = docs.exists(reqPath) ? await docs.read(reqPath) : ''
  const frontmatter = parseDocument(requirementText).frontmatter
  const sides = designDocPolicyFrom(frontmatter).sides
  const applies = conditionalStageArtifactsFor(req.category, sides)
    .some(c => c.stage === 'brainstorming' && c.kind === 'prototype')
  return { frontmatter, requirementText, applies }
}

/** 存在门：sides 含 frontend 且无**显式登记** prototype、且无有效 prototype_exempt → prototype_missing。 */
export async function checkPrototypePresenceGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined> {
  const ctx = await contextOf(docs, req)
  if (ctx === undefined || !ctx.applies) return undefined
  const exempt = prototypeExemptOf(req, ctx.frontmatter)
  if (exempt.active) return undefined // 人已确认的豁免 = 本需求不要原型，放行
  if (registeredPrototypesOf(req).length > 0) return undefined
  const gaps = prototypePresenceGaps(req) // 判据与文案单点在 prototype-registration（含「有文件但未登记」）
  const declared = Object.prototype.hasOwnProperty.call(ctx.frontmatter, 'prototype_exempt')
  if (declared && exempt.reason === '') {
    gaps.push('prototype_exempt 的豁免无效：理由为空（豁免要写清为什么不要原型）')
  } else if (exempt.reason !== '') {
    gaps.push('prototype_exempt 写了理由但豁免无效：requirement 产物未落章（agent 不能自己豁免自己，须先请人确认需求文档）')
  }
  return {
    code: 'prototype_missing',
    kind: 'prototype',
    gaps,
    message: envelope({
      lead: LEAD,
      what: fmt('需求 {id} 声明了 frontend 端侧，但产物簿没有已登记的 kind=prototype 产物', { id: req.id }),
      why: 'UI 需求的需求阶段必交原型（决定前端实现长什么样），且没有生效的 prototype_exempt 豁免',
      how: '把原型落到 ' + reqDir(req.id) + '/prototypes/（骨架见 ' + HOW_PROTOTYPE + '），在 prototypes/INDEX.md 标出唯一权威版本，再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）登记；确需豁免时在 requirement.md front-matter 写 prototype_exempt: <理由> 并落一条 D-x 裁定，经人确认 requirement 产物后才生效',
    }),
  }
}

/**
 * 版本门：INDEX 缺失 / authoritative 恰好一条不成立 / 文档引用指向 superseded → prototype_version_conflict。
 * 早退（属存在门职责）：既没有 prototype 产物、又没有 INDEX 文件时返回 undefined——那正是「没交原型」，
 * 由存在门给 prototype_missing，同一件事不报两遍。
 */
export async function checkPrototypeVersionGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined> {
  const ctx = await contextOf(docs, req)
  if (ctx === undefined || !ctx.applies) return undefined
  const indexPath = reqDir(req.id) + '/prototypes/INDEX.md'
  if (!docs.exists(indexPath)) {
    if (prototypeArtifactsOf(req).length === 0) return undefined // 存在门职责
    return versionFailure(req, [fmt('{path} 缺失（INDEX 是权威版本的唯一清单，缺它等价 0 条 authoritative）', { path: indexPath })])
  }
  const index = parsePrototypeIndex(parseDocument(await docs.read(indexPath)), req.id)
  const gaps = [...index.gaps]
  const auth = index.rows.filter(r => r.status === 'authoritative')
  if (gaps.length === 0 && auth.length !== 1) {
    const listed = auth.length === 0
      ? (index.rows.length === 0 ? 'INDEX 无数据行' : 'INDEX 现有路径：' + index.rows.map(r => r.path).join('、'))
      : auth.map(r => r.path).join('、')
    gaps.push('authoritative ×' + String(auth.length) + '：' + listed + '（必须恰好一条权威版本）')
  }
  const authoritative = auth[0]
  if (gaps.length === 0 && authoritative !== undefined) {
    // I5：requirement.md / design/frontend.md 里出现的原型路径不得指向被取代版本。只判「指向
    // superseded」——INDEX 之外的自定义路径不在此处判（那属登记门/存在门职责，不混算）。
    const superseded = new Set(index.rows.filter(r => r.status === 'superseded').map(r => r.path))
    const sources: Array<readonly [string, string]> = [['requirement.md', ctx.requirementText]]
    const frontPath = reqDir(req.id) + '/design/frontend.md'
    if (docs.exists(frontPath)) sources.push(['design/frontend.md', await docs.read(frontPath)])
    for (const [label, text] of sources) {
      for (const raw of prototypePathsIn(text)) {
        const rel = toReqRelative(raw, req.id)
        if (rel === undefined || rel === authoritative.path || !superseded.has(rel)) continue
        gaps.push(fmt('{doc} 引用已被取代的原型 {path}（权威：{auth}）', { doc: label, path: rel, auth: authoritative.path }))
      }
    }
  }
  return gaps.length === 0 ? undefined : versionFailure(req, sorted(gaps))
}

function versionFailure(req: RequirementRecord, gaps: readonly string[]): GateFailure {
  return {
    code: 'prototype_version_conflict',
    kind: 'prototype',
    gaps: [...gaps],
    message: envelope({
      lead: LEAD,
      what: fmt('需求 {id} 的原型权威清单：{list}', { id: req.id, list: gaps.join('；') }),
      why: 'INDEX 必须恰好一条 authoritative，且文档只许引用这条权威路径（多版并存不拒，两个"权威"才拒）',
      how: '改 ' + reqDir(req.id) + '/prototypes/INDEX.md：只留一条「状态=authoritative」，被取代那份标 superseded 并在「被取代于」列填权威路径；把 requirement.md / design/frontend.md 的引用改为权威路径；旧目录 prototype/*.html 迁移到 prototypes/；再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）复核',
    }),
  }
}

/**
 * 锚点门：权威原型缺 id="FR-N" 覆盖 / proto-geometry 块不是恰好一块 / geometry 含阈值字段 →
 * prototype_anchor_missing。早退（属版本门职责）：INDEX 缺失、缺列、authoritative ≠ 1 条时返回
 * undefined——同一处坏由单点报一次，否则人要在两条消息里对齐。
 */
export async function checkPrototypeAnchorsGate(docs: DocsReader, req: RequirementRecord): Promise<GateFailure | undefined> {
  const ctx = await contextOf(docs, req)
  if (ctx === undefined || !ctx.applies) return undefined
  const indexPath = reqDir(req.id) + '/prototypes/INDEX.md'
  if (!docs.exists(indexPath)) return undefined // 版本门职责
  const index = parsePrototypeIndex(parseDocument(await docs.read(indexPath)), req.id)
  if (index.gaps.length > 0) return undefined // 版本门职责（缺列 / 路径口径坏）
  const auth = index.rows.filter(r => r.status === 'authoritative')
  const row = auth.length === 1 ? auth[0] : undefined
  if (row === undefined) return undefined // 版本门职责
  const htmlPath = reqDir(req.id) + '/' + row.path
  if (!docs.exists(htmlPath)) {
    return anchorFailure(req, [fmt('权威原型 {path} 不在需求目录内（磁盘上找不到 {abs}）', { path: row.path, abs: htmlPath })], row.path)
  }
  const meta = parsePrototypeMetadata(await docs.read(htmlPath))
  const gaps: string[] = []
  if (meta.blocks !== 1) {
    gaps.push(meta.blocks === 0
      ? fmt('{path} 缺 proto-geometry 块（须有恰好一块 <!-- proto-geometry … --> 观测注释）', { path: row.path })
      : fmt('geometry 块 ×{n}（必须恰好一块，§10 #4）', { n: meta.blocks }))
  }
  if (meta.parseError !== undefined) gaps.push(fmt('proto-geometry 块内 JSON 解析失败（按缺块处理）：{err}', { err: meta.parseError }))
  for (const fr of row.serves) {
    if (!meta.anchors.some(a => a.fr === fr)) gaps.push(fmt('{path} 缺 id="{fr}" 区块（INDEX「服务条款」列声明了它）', { path: row.path, fr }))
  }
  gaps.push(...meta.violations)
  return gaps.length === 0 ? undefined : anchorFailure(req, sorted(gaps), row.path)
}

function anchorFailure(req: RequirementRecord, gaps: readonly string[], path: string): GateFailure {
  return {
    code: 'prototype_anchor_missing',
    kind: 'prototype',
    gaps: [...gaps],
    message: envelope({
      lead: LEAD,
      what: fmt('权威原型 {path}：{list}', { path, list: gaps.join('；') }),
      why: '权威原型缺机器可判读的 FR 锚点 / 唯一一块 proto-geometry，或几何量里出现阈值字段（阈值属设计决策，D-10）',
      how: '按 ' + HOW_PROTOTYPE + ' 补每个「服务条款」声明 FR 的 <section id="FR-N"> 与**恰好一块** <!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->，只留观测量名与实测值（阈值移到 design/frontend.md），再调 reqboard_submit(kind=prototype)（requirement_id="' + req.id + '"）重新登记',
    }),
  }
}
