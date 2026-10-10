/**
 * rtm-brainstorming.yml 生成（REQ-260926140539-457b FR-2 触发点 2/3）。
 *
 * 产出：本节点提取的 FR 列表 + 需求文档产物的确认状态；
 * REQ-261005105032-3b02 起**增两节**（决议 `#18`）：
 *   - `outputs.prototypes`：台账 `kind=prototype` 产物（事实源，决议 `#48`）+ `prototypes/INDEX.md`
 *     的权威角色/服务条款（权威清单唯一载体，决议 `#1` / `#2`）；
 *   - `outputs.decisions`：`requirement.md`「讨论与裁定记录（D-x）」表（FR-8 的五要素）。
 * 既有 `requirements` 节形状**逐字不变**（加性：新节可选，缺节 = pending，§6.4）。
 *
 * @module @pi-investment/reqboard/rtm/brainstorming-generator
 */
import { getRTMPath, readRTM, writeRTM } from './file-io.js'
import type { LedgerArtifactLike, RTMContext } from './context.js'
import {
  RTM_SCHEMA_VERSION,
  type Decision,
  type Prototype,
  type PrototypeAnchor,
  type PrototypeGeometry,
  type RTMBrainstorming,
} from './types.js'

/**
 * 权威清单文件（决议 `#1`：它自身也是 `kind=prototype` 产物，但**不是一份原型页面**——
 * 把它塞进 `prototypes[]` 会让"恰好一条 authoritative"这条不变量自相矛盾）。
 */
export const PROTOTYPE_INDEX_REL = 'prototypes/INDEX.md'

/**
 * FR 锚点区块 / 单块几何量观测（决议 `#4` / `#41`）。
 * 与宿主 `src/application/internal/prototype-gates.ts` 的 `ANCHOR_RE` / `GEOMETRY_BLOCK_RE` **同源**：
 * 登记时抽一次写台账、生成 RTM 时按同一正则再抽一次，两处必须认得同一批锚点。
 */
const ANCHOR_RE = /id\s*=\s*["'](FR-\d+)["']/g
const GEOMETRY_BLOCK_RE = /<!--\s*proto-geometry\s*([\s\S]*?)-->/g
const FR_TOKEN = /FR-\d+/g

/** 路径归一（决议 `#2` 的口径：需求目录相对、无前导 `./`）。此处只做比对归一，不改写落盘值。 */
function normalizeRel(path: string): string {
  return path.trim().replace(/^\.\//, '').replace(/^\/+/, '')
}

/**
 * 表格里的"空位"写法（权威行的「被取代于」列按 architecture.md 的 INDEX 例子写 `—`，
 * 空串 / `-` / `N/A` / `无` 同义）——不认它就会把 `—` 当成"被取代于 —"这种假数据落盘。
 */
const EMPTY_CELL_RE = /^(?:—|–|-{1,2}|\/|n\/a|none|无)$/i

/** 取单元格文本；纯占位符视同空串。 */
function cellText(raw: string | undefined): string {
  const t = (raw ?? '').trim()
  return EMPTY_CELL_RE.test(t) ? '' : t
}

/** 从一段原型 HTML 抽锚点与观测量（纯函数：坏数据降级为空集合，绝不外抛——RTM 是增强层）。 */
export function prototypeMetaFromHtml(html: string): {
  anchors: PrototypeAnchor[]
  geometry: PrototypeGeometry[]
} {
  const anchors: PrototypeAnchor[] = []
  for (const m of html.matchAll(ANCHOR_RE)) {
    const fr = m[1]
    if (fr === undefined || anchors.some(a => a.fr === fr)) continue // 同号只记一次
    anchors.push({ fr, selector: '#' + fr })
  }

  // 块数 ≠ 1 / JSON 坏 / 形状坏 ⇒ 该条不落（宁缺不猜；块数与违规由原型门单独判并点名）
  const blocks = [...html.matchAll(GEOMETRY_BLOCK_RE)].map(m => (m[1] ?? '').trim())
  if (blocks.length !== 1) return { anchors, geometry: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(blocks[0] ?? '')
  } catch {
    return { anchors, geometry: [] }
  }
  return { anchors, geometry: observationsOf(parsed) }
}

/** 把 `{observations:[…]}` 投影成观测量数组；形状/值域外的条目**丢弃**（不编造）。 */
function observationsOf(value: unknown): PrototypeGeometry[] {
  const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  const raw = obj?.['observations']
  if (!Array.isArray(raw)) return []
  const out: PrototypeGeometry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
    const value = o['value']
    const unit = o['unit']
    const at = typeof o['at'] === 'object' && o['at'] !== null ? (o['at'] as Record<string, unknown>) : undefined
    const width = at?.['width']
    const state = at?.['state']
    const source = o['source']
    if (name === '' || seen.has(name)) continue // #5：块内 name 唯一
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (unit !== 'px' && unit !== 'count' && unit !== 'ratio') continue
    if (typeof width !== 'number' || !(width > 0)) continue
    if (state !== 'inflight' && state !== 'terminal') continue
    if (source !== undefined && source !== 'prototype' && source !== 'human') continue
    seen.add(name)
    out.push({ name, value, unit, at: { width, state }, ...(source === undefined ? {} : { source }) })
  }
  return out
}

/** INDEX 一行（权威角色 / 服务条款的取数结果）。 */
export interface PrototypeIndexRow {
  status: string
  serves: string[]
  supersededBy?: string
}

/**
 * 解析 `prototypes/INDEX.md` 的那**一张**表格（列：路径 | 状态 | 服务条款 | 被取代于）。
 *
 * 为什么自己解析而不复用一个共享解析器：INDEX 解析在宿主 `prototype-gates.parsePrototypeIndex`
 * 里已有实现，但本包不得反向 import 宿主（模块边界）。两份实现都只认**同一张表头**
 * （含「路径」与「状态」）与同一套列名，缺表/缺列一律返回空映射 = 权威角色不明 ⇒ 生成端
 * 如实输出 `authoritative: false`（**不猜谁是权威**）。
 */
export function parsePrototypeIndexRows(md: string | null): Map<string, PrototypeIndexRow> {
  const out = new Map<string, PrototypeIndexRow>()
  if (md === null) return out
  const lines = md.split(/\r?\n/)
  let header: string[] | null = null
  let idx = { path: -1, status: -1, serves: -1, super: -1 }
  for (const line of lines) {
    if (!line.trimStart().startsWith('|')) {
      if (header !== null) break // 表格结束
      continue
    }
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (header === null) {
      if (!cells.some(c => c.includes('路径')) || !cells.some(c => c.includes('状态'))) continue
      header = cells
      idx = {
        path: cells.findIndex(c => c.includes('路径')),
        status: cells.findIndex(c => c.includes('状态')),
        serves: cells.findIndex(c => c.includes('服务条款')),
        super: cells.findIndex(c => c.includes('被取代于')),
      }
      continue
    }
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue // 分隔行
    const path = normalizeRel(cellText(cells[idx.path]))
    if (path === '') continue
    const supersededBy = idx.super >= 0 ? normalizeRel(cellText(cells[idx.super])) : ''
    out.set(path, {
      status: cellText(cells[idx.status]).toLowerCase(),
      serves: idx.serves >= 0 ? [...new Set(cellText(cells[idx.serves]).match(FR_TOKEN) ?? [])] : [],
      ...(supersededBy === '' ? {} : { supersededBy }),
    })
  }
  return out
}

/**
 * 原型节：**事实源 = 台账的 `kind=prototype` 产物**（决议 `#48`「生成器仍以台账为事实源」），
 * INDEX 只补权威角色与服务条款。台账里没有、只在 INDEX 出现的路径**不进本节**——
 * RTM 是台账的投影，不是目录扫描器（未登记的产物由登记门/健康检查点名）。
 */
export function prototypeSectionOf(
  ctx: RTMContext,
  reqId: string,
  artifacts: readonly LedgerArtifactLike[],
): Prototype[] {
  const rows = parsePrototypeIndexRows(ctx.readDoc(reqId, PROTOTYPE_INDEX_REL))
  const out: Prototype[] = []
  const seen = new Set<string>()
  for (const a of artifacts) {
    if (a.kind !== 'prototype') continue
    const rel = normalizeRel(a.path)
    if (rel === '' || rel === PROTOTYPE_INDEX_REL) continue
    if (seen.has(rel)) continue // 同一路径多次登记（不同 stage）只投影一条
    seen.add(rel)
    const row = rows.get(rel)
    const meta = prototypeMetaFromHtml(ctx.readDoc(reqId, rel) ?? '')
    out.push({
      path: a.path,
      // 权威角色只认 INDEX（决议 `#1`）；INDEX 缺行 = 未标 ⇒ false，不猜
      authoritative: row?.status === 'authoritative',
      ...(row?.supersededBy === undefined ? {} : { superseded_by: row.supersededBy }),
      serves: row?.serves ?? [],
      anchors: meta.anchors,
      geometry: meta.geometry,
    })
  }
  // 稳定输出顺序（按路径）：写盘 diff 稳定，人读也按目录顺序
  out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
  return out
}

/**
 * 裁定节：投影 `requirement.md`「讨论与裁定记录（D-x）」表（FR-8）。
 *
 * 只认**那一个节的表格**（标题含「讨论与裁定记录」）；行首编号不是 `D-\d+` 的行不是裁定条目 ⇒ 跳过。
 * 条目内容**原样投影**（不修剪 / 不判有效性）：RTM 是只读投影，"条目无效"由裁定门点名
 * （`decision_entry_invalid`），此处不得替门禁做判断、更不得编造缺的列。
 */
export function decisionsOf(md: string | null): Decision[] {
  if (md === null) return []
  const lines = md.split(/\r?\n/)
  let level = 0
  let inSection = false
  let header: string[] | null = null
  const out: Decision[] = []
  for (const line of lines) {
    const h = /^(#{2,6})\s+(.+?)\s*$/.exec(line)
    if (h !== null) {
      const cur = (h[1] ?? '').length
      if (inSection && cur <= level) break // 出了本节
      if (!inSection && (h[2] ?? '').includes('讨论与裁定记录')) {
        inSection = true
        level = cur
      }
      continue
    }
    if (!inSection) continue
    if (!line.trimStart().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (header === null) {
      if (!cells.some(c => c.includes('编号'))) continue
      header = cells
      continue
    }
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue
    const idRaw = cells[0] ?? ''
    const id = /D-\d+/.exec(idRaw)
    if (id === null) continue // 不是裁定条目（表头漂移 / 说明行）
    const servesCell = cells[3] ?? ''
    out.push({
      id: id[0],
      source: cells[1] ?? '',
      verdict: cells[2] ?? '',
      serves: [...new Set(servesCell.match(FR_TOKEN) ?? [])],
      criterion: cells[4] ?? '',
    })
  }
  return out
}

/** 生成/更新 rtm-brainstorming.yml。 */
export function generateBrainstormingRTM(ctx: RTMContext, reqId: string): RTMBrainstorming {
  const filePath = getRTMPath(ctx.reqDir(reqId), 'rtm-brainstorming.yml')
  const existing = readRTM<RTMBrainstorming>(filePath)
  const frs = ctx.requirementFRs(reqId)
  const req = ctx.requirement(reqId)
  const reqArtifacts = (req?.artifacts ?? []).filter(a => a.kind === 'requirement')
  const prototypes = prototypeSectionOf(ctx, reqId, req?.artifacts ?? [])
  const decisions = decisionsOf(ctx.readDoc(reqId, 'requirement.md'))

  const data: RTMBrainstorming = {
    // rtm_version = schema 版本（决议 #18/#42，目标 "2.0"）；version 仍由 writeRTM 递增，两个键不同
    metadata: ctx.metadata('brainstorming', reqId, existing, { rtm_version: RTM_SCHEMA_VERSION }),
    // 顺序与形状：既有 requirements 节逐字不变，新两节追加在后（加性）
    outputs: { requirements: frs, prototypes, decisions },
    status: {
      artifacts: reqArtifacts.map(a => ({
        kind: a.kind,
        path: a.path,
        confirmed: a.confirmedAt !== undefined,
        ...(a.confirmedAt !== undefined ? { confirmed_at: ctx.iso(a.confirmedAt) } : {}),
      })),
    },
  }
  writeRTM(filePath, data)
  return data
}
