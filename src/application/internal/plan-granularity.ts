/**
 * 粒度门禁 wiring（REQ-261007125552-32cb FR-2 / FR-4 / FR-5）——拆分提交/落库的粒度判定点。
 *
 * 三层职责（与内容门既有分层同构）：
 *   - domain/task/Granularity.ts   纯判定（接口声明计数 / 形态警告），零 IO
 *   - 本文件                        取数（读设计清单 / 对照表）+ 组装 GateFailure
 *   - 三条入口（submitPlanArtifact / executeDecompose / landApprovedPlan）只调用，不复制判定
 *
 * 三维判定：
 *   a) 对照表门（enforce，FR-2）：设计清单（接口清单 / 组件树）每条目必须有卡接——
 *      decomposition.md 的对照表里要有该行，且行的 key ∈ tasks[].key；
 *   b) 接口数门（enforce，FR-4）：一卡 implementation 声明 >1 个接口且无 granularity_exempt → 拒；
 *   c) 形态软门（恒 warn，FR-5）：files 超阈值 / UI 卡多锚点 → 进 warnings，绝不 reject。
 *
 * 生效口径：`docQualityRulesApply(req.createdAt)`（存量不追溯）；设计文档无清单节
 * （FR-1 豁免场景）时对照表门**降级为 warn 并写明降级原因**——没有判据对象时硬拒会锁死
 * 合法豁免场景（与 e2eCoverageOf「读数未知不判」同口径）。
 *
 * 词法避让（实测）：对照表 key 列叫「接收卡 key」，**不得**叫「计划 key」——
 * `readPlanDocTaskTable` 取第一张表头含「计划 key」的表当任务表，同名会被误认。
 *
 * @module dsh-pmboard/application/internal/plan-granularity
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import type { GateFailure } from './artifact-gates.js'
import { parseDocument, type DocsReader, type ParsedDoc } from './content-gates.js'
import { planKeysIn } from './content-trace.js'
import { designDocPolicyFrom } from './category-doc-sets.js'
import { docQualityRulesApply } from '../../domain/workflow/DocQualityRules.js'
import { countInterfaceDeclarations, granularityWarningsOf } from '../../domain/task/Granularity.js'
// 双拼字段取值唯一实现（REQ-261007230908-5ccb FR-4 / G10）：本文件读的是**原始提交对象**
// （提交期门禁在 protocol 归一之前跑），故必须走同一处归一，不能只读归一后字段。
import { readDual } from '../../shared/dual-field.js'
import { LIMITS } from '../../domain/limits.js'
import { envelope } from './gate-feedback.js'
import { fmt } from '../../domain/text/fmt.js'

/** 门禁回执：failure 非空 = 调用方 reject/throw（零副作用）；warnings 并入返回体（不静默）。 */
export interface GranularityReport {
  failure?: GateFailure
  warnings: string[]
}

/** 清单条目（接口清单 / 组件树共用）：id 用于点名，label 是该行原文。 */
interface ListEntry {
  id: string
  label: string
}

/** 对照表读数：found=有没有这张表；rows=条目 id → 接收卡 key 列表。 */
interface MapTable {
  found: boolean
  rows: Map<string, string[]>
}

/** 任务卡的最小读取形态（raw tasks 两种拼法都认，与 normalizePlanTasks 同口径）。 */
interface RawCard {
  key: string
  title: string
  implementation: string
  exempt: string
  side: string | undefined
  files: number | undefined
  prototypeRefs: readonly string[] | undefined
}

function rawCardOf(raw: unknown, index: number): RawCard {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const key = (typeof o.key === 'string' && o.key.trim().length > 0 ? o.key.trim() : 'k' + (index + 1))
  const footprint = (typeof o.footprint === 'object' && o.footprint !== null ? o.footprint : {}) as Record<string, unknown>
  const protoRefs = o['prototypeRefs'] ?? o['prototype_refs']
  return {
    key,
    title: typeof o.title === 'string' ? o.title : '',
    implementation: typeof o.implementation === 'string' ? o.implementation : '',
    exempt: String(readDual(o, 'granularity_exempt', 'granularityExempt', 'snake') ?? '').trim(),
    side: typeof o.side === 'string' ? o.side : undefined,
    files: typeof footprint['files'] === 'number' ? (footprint['files'] as number) : undefined,
    prototypeRefs: Array.isArray(protoRefs) ? protoRefs.filter((x): x is string => typeof x === 'string') : undefined,
  }
}

/**
 * 从设计文档提取清单条目：找标题含 `sectionKeyword` 的 H2，再取表头含 `idColumn`
 * 的表的第一列。文档里有「不适用：」豁免行 → 返回 degraded（降级原因），不算有清单。
 */
function extractListEntries(doc: ParsedDoc, text: string, sectionKeyword: string, idColumn: string): { entries: ListEntry[]; degraded?: string } {
  if (text.includes('不适用：')) return { entries: [], degraded: '设计文档声明「不适用」' }
  const hasSection = doc.headings.some(h => h.level === 2 && h.text.includes(sectionKeyword))
  if (!hasSection) return { entries: [], degraded: '设计文档无「' + sectionKeyword + '」节' }
  const table = doc.tables.find(t => t.header.some(h => h.includes(idColumn)))
  if (table === undefined) return { entries: [], degraded: '「' + sectionKeyword + '」节里没有清单表' }
  const iId = table.header.findIndex(h => h.includes(idColumn))
  const entries: ListEntry[] = []
  for (const row of table.rows) {
    const label = (row[iId] ?? '').trim()
    if (label.length === 0) continue
    const id = /(IF-\d+)/.exec(label)?.[1] ?? label
    entries.push({ id, label })
  }
  return { entries }
}

/** 读计划文档里的对照表：表头同时含 `itemKeyword` 与「接收卡 key」（词法避让见文件头注释）。 */
function readMapTable(doc: ParsedDoc, itemKeyword: string): MapTable {
  const table = doc.tables.find(t =>
    t.header.some(h => h.includes(itemKeyword)) && t.header.some(h => h.includes('接收卡 key')),
  )
  if (table === undefined) return { found: false, rows: new Map() }
  const iItem = table.header.findIndex(h => h.includes(itemKeyword))
  const iKey = table.header.findIndex(h => h.includes('接收卡 key'))
  const rows = new Map<string, string[]>()
  for (const row of table.rows) {
    const label = (row[iItem] ?? '').trim()
    if (label.length === 0) continue
    const id = /(IF-\d+)/.exec(label)?.[1] ?? label
    const keys: string[] = []
    for (const k of planKeysIn((row[iKey] ?? '').trim())) {
      if (!keys.includes(k)) keys.push(k)
    }
    rows.set(id, keys)
  }
  return { found: true, rows }
}

/** 一段对照表（接口段 / 组件段共用）的判定：条目无落点、落点 key 悬空 → 逐条缺口。 */
function mapTableGaps(entries: readonly ListEntry[], table: MapTable, taskKeys: ReadonlySet<string>): { uncovered: string[]; dangling: string[] } {
  const uncovered: string[] = []
  const dangling: string[] = []
  for (const e of entries) {
    if (!table.rows.has(e.id)) uncovered.push(e.id)
  }
  for (const keys of table.rows.values()) {
    for (const k of keys) {
      if (!taskKeys.has(k) && !dangling.includes(k)) dangling.push(k)
    }
  }
  return { uncovered, dangling }
}

/**
 * 粒度门禁唯一分派入口（三条入口共用）。`rawTasks` 为空（计划未含任务表，创作型路径）
 * 时整门跳过——那时还没有卡可判，创作由 reqboard_decompose 路径再过一次本门。
 */
export async function assertGranularityGates(
  docs: DocsReader,
  req: RequirementRecord,
  rawTasks: readonly unknown[],
  planPath: string,
): Promise<GranularityReport> {
  const warnings: string[] = []
  if (rawTasks.length === 0) return { warnings }
  const cards = rawTasks.map(rawCardOf)

  // ── c) 形态软门（FR-5，恒 warn）：先生效，与生效口径无关（不拒就无锁死风险）────
  for (const c of cards) {
    warnings.push(...granularityWarningsOf({ key: c.key, side: c.side, footprint: { files: c.files }, prototypeRefs: c.prototypeRefs }))
  }

  // 生效口径：存量需求不追溯（与 sidesGateFailure / docSectionGateFailure 同款）
  if (!docQualityRulesApply(req.createdAt)) return { warnings }
  // 清单义务只在 feature（FR-1 门同范围）；refactor 等类型本轮不判（范围外，不硬凑）
  if (req.category !== 'feature') return { warnings }

  // ── b) 接口数门（FR-4，enforce）：一卡多接口且无豁免 → 拒 ────────────────────
  const multiInterface: string[] = []
  for (const c of cards) {
    const ifs = countInterfaceDeclarations(c.implementation)
    if (ifs.length > LIMITS.maxInterfacesPerCard) {
      if (c.exempt.length > 0) {
        // 豁免不静默：理由进 warnings，批准人能复核「凭什么这张卡可以粗」
        warnings.push(fmt('卡 {key} 声明 {n} 个接口（{list}），凭 granularity_exempt 豁免放行：{reason}', {
          key: c.key, n: String(ifs.length), list: ifs.join('、'), reason: c.exempt,
        }))
      } else {
        multiInterface.push(fmt('{key}（{title}）声明了 {n} 个接口：{list}', {
          key: c.key, title: c.title, n: String(ifs.length), list: ifs.join('、'),
        }))
      }
    }
  }
  if (multiInterface.length > 0) {
    return {
      warnings,
      failure: {
        code: 'plan_card_multi_interface',
        kind: 'plan',
        gaps: multiInterface,
        message: envelope({
          lead: '拆分计划未执行：',
          what: fmt('粗卡（一卡多接口）：{list}', { list: multiInterface.join('；') }),
          why: '一接口一卡是粒度纪律——一卡装多个接口，实施期才暴露「一轮装不下 / 并行互相覆盖 / 验收锚点含糊」（上限 ' + String(LIMITS.maxInterfacesPerCard) + '，单一源 LIMITS.maxInterfacesPerCard）',
          how: '按接口拆卡：每个接口一张实现卡、契约卡先行（契约卡确需多接口时给该卡写 granularity_exempt:"理由" 显式豁免——豁免理由会进返回体供批准人复核）；拆完重交',
        }),
      },
    }
  }

  // ── a) 对照表门（FR-2，enforce；无清单时降级 warn）──────────────────────────
  const base = 'docs/requirements/' + req.id
  const reqDocPath = base + '/requirement.md'
  const sides = docs.exists(reqDocPath)
    ? designDocPolicyFrom(parseDocument(await docs.read(reqDocPath)).frontmatter).sides
    : []

  const ifDocPath = base + '/design/interfaces.md'
  const ifList = docs.exists(ifDocPath)
    ? extractListEntries(parseDocument(await docs.read(ifDocPath)), await docs.read(ifDocPath), '接口清单', '接口 id')
    : { entries: [], degraded: 'design/interfaces.md 不存在' as string | undefined }
  const segments: { keyword: string; entries: ListEntry[]; degraded?: string; code: 'plan_interface_map_missing' | 'plan_component_map_missing'; itemName: string }[] = [
    { keyword: '接口', entries: ifList.entries, degraded: ifList.degraded, code: 'plan_interface_map_missing', itemName: '接口清单' },
  ]
  if (sides.includes('frontend')) {
    const fePath = base + '/design/frontend.md'
    const feList = docs.exists(fePath)
      ? extractListEntries(parseDocument(await docs.read(fePath)), await docs.read(fePath), '组件树', '组件')
      : { entries: [], degraded: 'design/frontend.md 不存在' as string | undefined }
    segments.push({ keyword: '组件', entries: feList.entries, degraded: feList.degraded, code: 'plan_component_map_missing', itemName: '组件树' })
  }

  const activeSegments = segments.filter(s => s.entries.length > 0)
  for (const s of segments) {
    if (s.entries.length === 0 && s.degraded !== undefined) {
      // 降级不静默：对照表门为什么没生效必须进返回体
      warnings.push(fmt('对照表门（{name}段）降级为提示：{reason}（清单为空时无判据对象，不硬拒）', { name: s.itemName, reason: s.degraded }))
    }
  }
  if (activeSegments.length === 0) return { warnings }

  const planText = planPath.length > 0 && docs.exists(planPath) ? await docs.read(planPath) : ''
  if (planText.length === 0) {
    warnings.push('对照表门降级为提示：计划文档 ' + (planPath || '（路径不可得）') + ' 读不到——不把 IO 故障伪装成违规')
    return { warnings }
  }
  const planDoc = parseDocument(planText)
  const taskKeys = new Set(cards.map(c => c.key))

  for (const seg of activeSegments) {
    const table = readMapTable(planDoc, seg.keyword)
    if (!table.found) {
      return {
        warnings,
        failure: {
          code: seg.code,
          kind: 'plan',
          gaps: seg.entries.map(e => e.id),
          message: envelope({
            lead: '拆分计划未执行：',
            what: fmt('计划文档 {path} 里找不到「{name} ↔ 接收卡 key」对照表（表头应含「{kw}」与「接收卡 key」两列）', { path: planPath, name: seg.itemName, kw: seg.keyword }),
            why: '设计清单有 ' + String(seg.entries.length) + ' 个条目（' + seg.entries.map(e => e.id).join('、') + '），没有对照表 = 「设计了什么 ↔ 谁来做」无从核对，批准人只能盲批',
            how: '在 ' + planPath + ' 补对照表（每个清单条目一行，右列写接收它的计划 key，一对多逗号分隔）；注意 key 列必须叫「接收卡 key」（叫「计划 key」会被任务表判据误认）',
          }),
        },
      }
    }
    const { uncovered, dangling } = mapTableGaps(seg.entries, table, taskKeys)
    if (uncovered.length > 0 || dangling.length > 0) {
      const parts: string[] = []
      if (uncovered.length > 0) parts.push(fmt('清单条目 {list} 没有卡接收', { list: uncovered.join('、') }))
      if (dangling.length > 0) parts.push(fmt('对照行指向任务表外的 key：{list}', { list: dangling.join('、') }))
      return {
        warnings,
        failure: {
          code: seg.code,
          kind: 'plan',
          gaps: [...uncovered, ...dangling],
          message: envelope({
            lead: '拆分计划未执行：',
            what: fmt('{name}对照表：{parts}', { name: seg.itemName, parts: parts.join('；') }),
            why: '清单条目无落点 = 设计了但没拆（静默缺口）；key 悬空 = 对照表与任务表两张皮',
            how: uncovered.length > 0
              ? '给这些条目补卡（或回到设计文档把本轮不做的条目标「不适用：」并给理由）；key 悬空的把右列改成 tasks[] 里真实存在的计划 key；改完重交'
              : '把对照表右列改成 tasks[] 里真实存在的计划 key；改完重交',
          }),
        },
      }
    }
  }
  return { warnings }
}
